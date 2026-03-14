# 2026-03-09 Addon 退场：Standalone 全面迁移

日期：2026-03-09
范围：`leap-env/runner.js`、`leap-env/src/client/`、`leap-env/src/pool/`、`leap-vm/CMakeLists.txt`、`run-work-leapvm.js`、15 个集成测试

## 1. 背景与动机

此前 LeapVM 同时维护两条执行路径：

| 路径 | 入口 | 并发管理 | 生命周期问题 |
|------|------|----------|-------------|
| Node addon (`leapvm.node`) | `require('leap-vm')` → NAPI | Node 侧 ThreadPool / ProcessPool | `same_as_creator=0`、sync-stall、SIGSEGV |
| Standalone server (`leapvm_server`) | TCP LPJ 协议 | C++ WorkerPool（`std::thread`） | 无（同线程 create/destroy） |

经过 `2026-03-08` 和 `2026-03-09` 两轮排故确认：

- `VmInstance` 的 "off creator thread" 析构告警 **仅存在于 addon 路径**（`drainDeferredVmTeardown` 在主线程销毁工作线程创建的 VM）
- `sync-stall` 秒级同步长尾 **仅在 `ThreadPool / addon` 路径复现**
- Standalone WorkerPool 的线程模型天然干净：每个 `std::thread` 自己创建、使用、销毁 `VmInstance`

因此决定：**addon 完全退场，`leapvm_server` 成为唯一执行后端**，Node 侧收缩为薄客户端 + 参数规范化层。

## 2. 架构变更

### 2.1 迁移前

```
Node 进程
├── runner.js (sync)
│   ├── loadLeapVm() → require('leapvm.node')
│   ├── initializeEnvironment() → new VmInstance() → runScript(bundle)
│   ├── executeSignatureTask() → runScript(setup+target+cleanup)
│   └── shutdownEnvironment() → leapvm.shutdown()
├── pool/
│   ├── thread-pool.js → worker_threads + 多个 VmInstance
│   └── process-pool.js → child_process.fork
└── leapvm.node (C++ NAPI addon)
```

### 2.2 迁移后

```
Node 进程
├── runner.js (async)
│   ├── initializeEnvironment() → ServerManager.start() → StandaloneClient.connect()
│   ├── executeSignatureTask() → client.runSignature(payload) [TCP LPJ]
│   └── shutdownEnvironment() → client.shutdown() → serverManager.stop()
├── src/client/
│   ├── standalone-client.js   ← TCP LPJ 客户端
│   └── server-manager.js      ← leapvm_server 进程管理
└── pool/ (废弃，stub 文件)

leapvm_server (独立 C++ 进程)
├── WorkerPool (std::thread × N)
│   └── 每个 worker 持有独立 VmInstance
├── IpcServer (TCP + LPJ 帧)
└── TaskProtocol (setup/target/cleanup 脚本构建)
```

## 3. 代码修改

### 3.1 Phase 1: StandaloneClient + ServerManager（纯新增）

**新建** `leap-env/src/client/standalone-client.js`

- TCP 客户端，实现 Length-Prefixed JSON（LPJ）协议
- 帧格式：`[4-byte uint32 LE length][UTF-8 JSON payload]`，与 `ipc_server.cc` 的 `WriteU32LE/ReadU32LE` 对齐
- 请求 ID 关联：`_pending` Map 按 `id` 匹配异步响应，支持多个请求同时 in-flight
- TCP 分包重组：累积 buffer → 检查 4 字节头 → 读 length → 等完整 payload → JSON.parse
- 最大 payload 10MB（与 `ipc_server.cc` 一致）
- 公开方法：`connect()`、`runSignature(payload)`、`getStats()`、`shutdown()`、`disconnect()`

**新建** `leap-env/src/client/server-manager.js`

- 管理 `leapvm_server` 子进程生命周期
- `start()`：`spawn()` 服务进程，监听 stdout/stderr 中的 `"leapvm-server ready"` 信号
- **关键**：强制 `LEAPVM_LOG_LEVEL='info'`，否则 ready 信号（`LEAPVM_LOG_INFO` 级别）不会输出，导致启动超时
- `stop(gracePeriodMs)`：先 SIGTERM，超时后 SIGKILL
- 服务路径解析：`options.serverBinPath` > `$LEAPVM_SERVER_PATH` > 默认 `leap-vm/build-server/leapvm_server`

### 3.2 Phase 2: runner.js 改造（核心变更）

三个公开函数从 sync 改为 async，内部切换到 standalone 路径。

#### `initializeEnvironment(options)` → async

- 原行为：`loadLeapVm()` → `new VmInstance()` → `configureHooks()` → `runScript(bundle)`
- 新行为：`ServerManager.start()` → `StandaloneClient.connect()`
- 返回 `{ leapvm: facade, resolved, inspectorInfo: null }`
- facade 对象：`{ _client, _serverManager }`，通过 `leapvm._client` 检测 standalone 路径
- standalone 配置通过 `options.standalone` 命名空间传递（`port`、`workers`、`serverBinPath` 等）

#### `executeSignatureTask(leapvm, task)` → async

- 检测 `leapvm._client` → 走 standalone 路径，否则回退 addon 路径（过渡期兼容）
- standalone 路径：`buildEffectiveTaskOverrides()` 规范化快照参数 → `client.runSignature(payload)`
- payload 字段与 `ipc_server.cc` 的 `HandleMessage` 对齐：`targetScript`、`beforeRunScript`、`resourceName`、`fingerprintSnapshot`、`storageSnapshot`、`documentSnapshot`、`storagePolicy`
- 返回 `response.result`（字符串）

#### `shutdownEnvironment(leapvm, options)` → async

- 检测 facade → `client.shutdown()` + `client.disconnect()` + `serverManager.stop()`
- addon 路径保留为回退

#### 关联文件修改

- `run-work-leapvm.js`：`runOnce()`、`main()` 改为 async；底部 `main().catch()`
- `leap-env/src/build/generate-entry.js`：排除 `client/` 目录，避免 bundle 打包 Node-only 模块

### 3.3 Phase 3: Pool 层移除

`leap-env/src/pool/` 下 5 个文件替换为抛错 stub：

| 文件 | stub 行为 |
|------|----------|
| `thread-pool.js` | `new ThreadPool()` → throw Error |
| `process-pool.js` | `new ProcessPool()` → throw Error |
| `thread-worker.js` | 模块加载即 throw |
| `worker.js` | 模块加载即 throw |
| `worker-common.js` | 导出 stub 函数，调用时 throw |

pool 代码不进 bundle（`generate-entry.js` 已排除），stub 不影响构建。

### 3.4 Phase 4: CMakeLists.txt 改造

核心变更：

1. 新增 `option(LEAPVM_BUILD_ADDON ... OFF)` — 默认关闭
2. `option(LEAPVM_BUILD_SERVER ... ON)` — 默认开启（原为 OFF）
3. Node.js 头文件探测（`node -e` 命令）移入 `if(LEAPVM_BUILD_ADDON)` — server-only 构建不依赖 Node
4. Node-API 头文件（`node-addon-api`）移入 `if(LEAPVM_BUILD_ADDON)`
5. V8 库路径 + libc++ 路径提取到共享段（addon & server 共用）
6. Addon 目标（`add_library ... SHARED`）、链接、MSVC 设置全部包在 `if(LEAPVM_BUILD_ADDON) ... endif()`
7. Lexbor 编译保持无条件（共用），但 Lexbor 链接到 addon 目标在 addon 条件块内
8. uSockets 链接到 addon 也在条件块内

附带修复：

- `config_loader.h`：补 `#include <cstdint>`（`uint8_t` 未声明）
- `ipc_server.h`：`TaskResult` 前向声明改为 `#include "worker_pool.h"`（`std::future<TaskResult>` 需完整类型）

### 3.5 Phase 4: 集成测试更新

15 个 `tests/scripts/integration/test-leapenv-*.js` 文件机械性修改：

- 含 `function main()` 的文件：改为 `async function main()`，底部 `main().catch(...)`
- 不含 `main()` 的文件（顶层调用）：包裹在 `(async () => { ... })().catch(...)`
- 所有包含 `initializeEnvironment`/`executeSignatureTask`/`shutdownEnvironment` 调用的函数标记为 `async`
- 在调用前添加 `await`
- 仅修改实际代码行，不修改模板字符串内的函数

### 3.6 Phase 5: 清理

- 删除 `leapvm-standalone-service-design.md`、`leapvm-standalone-todolist.md`（已过期的根目录设计文档）
- 更新 `CLAUDE.md`：数据流描述、并发模型、构建命令、目录结构

## 4. 验证记录

### 4.1 编译

```bash
cmake -S leap-vm -B leap-vm/build-server -DLEAPVM_BUILD_SERVER=ON
cmake --build leap-vm/build-server --target leapvm_server -j4
# [100%] Built target leapvm_server
```

Server-only 构建通过，无 Node 头文件依赖。

### 4.2 Bundle 构建

```bash
cd leap-env && npm run build
# ⚡ Done in 57ms
# Output: leap-env/src/build/dist/leap.bundle.js
```

`client/` 目录已被 `generate-entry.js` 排除，无 `net`/`child_process` 解析错误。

### 4.3 Standalone 端到端

```bash
node -e "
const { initializeEnvironment, executeSignatureTask, shutdownEnvironment } = require('./leap-env/runner');
async function main() {
  const ctx = await initializeEnvironment({});
  const r1 = await executeSignatureTask(ctx.leapvm, {
    targetScript: 'JSON.stringify({ ua: navigator.userAgent })',
  });
  console.log(r1);
  const r2 = await executeSignatureTask(ctx.leapvm, {
    targetScript: 'JSON.stringify({ ua: navigator.userAgent, lang: navigator.language })',
    fingerprintSnapshot: { navigator: { userAgent: 'TestUA/1.0', language: 'zh-CN', languages: ['zh-CN'] } }
  });
  console.log(r2);
  await shutdownEnvironment(ctx.leapvm);
}
main();
"
```

结果：

- Test 1：`{"ua":"Mozilla/5.0 ... Chrome/120.0.0.0 ..."}` ✓
- Test 2：`{"ua":"TestUA/1.0","lang":"zh-CN"}` ✓ （指纹注入生效）
- 服务启动 → 多任务执行 → 优雅关闭全流程正常

### 4.4 集成测试

`test-leapenv-bom-ownership.js`、`test-leapenv-new-features.js` 等纯 `executeSignatureTask` 类测试正常通过。

## 5. 存留事项

### 5.1 需逐个重写的测试

以下测试使用了 addon 专有 API（`runScript()`、`installBuiltinWrappers()` 等），standalone facade 不支持：

- `test-leapenv-signature-core.js`：用 `ctx.leapvm.runScript()` 读取 VM 内部状态
- `test-leapenv-hardening-modes.js`：子进程模式下需要 `await` 传播到 `runMode()` → `runProbe()`
- `test-leapenv-fingerprint-snapshot.js`：用 `ctx.leapvm.runScript()` 验证快照注入
- `test-leapenv-branded-collections.js`：同上
- `test-leapenv-task-execution-cache.js`：同上

这些测试需改为：将验证逻辑写在 `targetScript` 内返回 JSON，而不是从外部 `runScript()` 读取。

### 5.2 未删除的 addon 代码

以下文件通过 CMake `LEAPVM_BUILD_ADDON=OFF` 已不编译，但代码仍保留在仓库中：

- `leap-vm/src/addon/main.cc`
- `leap-vm/src/addon/vm_instance_wrapper.cc`
- `leap-vm/src/addon/vm_instance_wrapper.h`
- `leap-vm/index.js`（addon 加载器）

待确认无回退需求后可物理删除。

### 5.3 未清理的依赖

- `leap-vm/package.json` 中 `node-addon-api` 和 `cmake-js` 依赖暂未移除

### 5.4 Benchmark 未更新

- `benchmarks/addon-vs-standalone.js` 仍包含 addon 路径的 benchmark 函数
- 计划重命名为 `standalone-benchmark.js`，移除 addon 分支，改用 `StandaloneClient`

## 6. 影响文件

### 新建

- `leap-env/src/client/standalone-client.js`
- `leap-env/src/client/server-manager.js`

### 修改

- `leap-env/runner.js` — 核心三函数 async 化 + standalone 路径
- `run-work-leapvm.js` — async 化
- `leap-vm/CMakeLists.txt` — addon 条件化 + server 默认开启
- `leap-vm/src/service/config_loader.h` — 补 `<cstdint>`
- `leap-vm/src/service/ipc_server.h` — 改为 `#include "worker_pool.h"`
- `leap-env/src/build/generate-entry.js` — 排除 `client/`
- `leap-env/src/pool/*.js` × 5 — 替换为 stub
- `tests/scripts/integration/test-leapenv-*.js` × 15 — async/await
- `CLAUDE.md` — 架构描述更新

### 删除

- `leapvm-standalone-service-design.md`
- `leapvm-standalone-todolist.md`

## 7. 结论

本轮最核心的结果是：

- **addon 路径不再是默认执行路径**，`LEAPVM_BUILD_ADDON=OFF` + runner.js 全面走 standalone
- **消除了 addon 路径的结构性缺陷**：`same_as_creator=0` 析构问题、sync-stall、ThreadPool SIGSEGV 从根本上不再触发
- **Node 侧职责大幅收缩**：不再管理 VM 生命周期、不再管理 worker 池，只做参数规范化 + TCP 转发
- **构建简化**：server-only 构建不依赖 Node 头文件和 NAPI

后续优先事项：

1. 重写使用 `runScript()` 的测试文件（将验证逻辑内联到 `targetScript`）
2. 物理删除 addon 代码（确认无回退需求后）
3. 更新 benchmark 为 standalone-only

## 8. 交叉参考

- `manual/maintenance/2026-03-09_Standalone_ExecuteTask收敛.md`
  - `ExecuteTask()` 收敛为 `ResolveTaskExecution` + `ExecuteSplitCachedTask` + `ExecuteCombinedTask` 的前置重构
- `manual/maintenance/2026-03-08_VmInstance停机协议与重复启停竞态继续排故记录.md`
  - `same_as_creator=0` 析构问题的详细排故，证实仅存在于 addon 路径
- `manual/maintenance/2026-03-08_ThreadPool同步停顿与重复启停SIGSEGV排故过程记录.md`
  - sync-stall 与 SIGSEGV 的定位过程，证实仅存在于 `ThreadPool / addon` 路径
