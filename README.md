# Leap

Leap 是一个面向补环境 / 反检测场景的浏览器环境容器。它用 C++ V8 embedder 提供隔离运行时地基，再用 JS Skeleton + Impl 按需补全 Web API 行为。

当前主线是 standalone server：Node.js 调用方通过 `StandaloneClient` 连接独立的 `leapvm_server` 进程，在服务端 WorkerPool 中并发执行签名脚本。

最新一轮 30 分钟 soak 基线（12 workers / 24 并发，预加载 `work/h5st.js`）结果为：

- 吞吐 `209.99 req/s`
- 完成 `378,061`
- 失败 `0`
- `P50 55.01 ms`
- `P95 73.67 ms`
- `P99 111.49 ms`

## 当前架构

```text
Node.js caller
  └─ leap-env/runner.js
      ├─ ServerManager        启动 / 管理 leapvm_server
      └─ StandaloneClient     通过 TCP 发送任务
                │
                ▼
        leapvm_server (C++)
          ├─ IpcServer        收发 LPJ / length-prefixed JSON 请求
          ├─ WorkerPool       管理多个 Worker 线程
          └─ Worker
              └─ VmInstance
                  ├─ V8 Isolate / Context
                  ├─ SkeletonRegistry
                  ├─ DispatchBridge
                  └─ Hook / Inspector / DOM runtime
```

可以把系统看成 4 层：

- `Standalone Runtime`：`runner.js`、`ServerManager`、`StandaloneClient`
- `Server`：`main.cc`、`worker_pool.cc`、`ipc_server.cc`、`task_protocol.cc`
- `Skeleton + Dispatch`：结构描述、C++ stub、JS dispatch 路由
- `Impl`：具体 DOM / BOM / 特殊 API 行为实现

## 端到端执行链路

1. 调用方执行 `initializeEnvironment()`
2. `ServerManager` 启动 `leapvm_server`
3. server 启动 WorkerPool，每个 Worker 持有独立 `VmInstance`
4. bundle 在 worker 内执行，注册 runtime、Skeleton、Impl
5. 调用方执行 `executeSignatureTask()`
6. `StandaloneClient` 发送 `run_signature` 请求
7. server 将任务分派到某个 Worker
8. Worker 注入任务态快照，执行目标脚本，清理任务态，返回结果

运行时补环境的核心调用链是：

```text
Target JS
  → C++ StubCallback
  → JS dispatch
  → Impl
  → result
```

目标脚本看到的是由 C++ 创建的对象壳，实际行为由 JS Impl 提供

## 当前实现范围

- standalone server 主链已完成
- Worker 级并发已完成，`maxTasksPerWorker` 默认 200，达到阈值后 recycle
- bundle / target code cache 已接入服务端执行链
- iframe 模拟基于同一 `Isolate` 下的多 `Context`
- DOM / BOM 采用 Skeleton + Dispatch + Impl 模式按需补全
- `siteProfile` 当前承担任务态快照注入，不承担 profile 过滤系统


## 目录

```text
LeapWorkSpace/
├── leap-env/                # Node.js 侧运行时与客户端封装
│   ├── runner.js
│   └── src/
│       ├── client/          # StandaloneClient / ServerManager
│       ├── core/            # runtime / config / skeleton-loader
│       ├── impl/            # JS 行为实现
│       ├── skeleton/        # type / instance skeleton
│       └── build/           # bundle 构建脚本
├── leap-vm/                 # C++ V8 embedder 与 standalone server
│   ├── src/leapvm/          # VmInstance / Skeleton / Hook / Inspector
│   ├── src/service/         # main / worker_pool / ipc_server / task_protocol
│   └── CMakeLists.txt
├── manual/                  # 手册入口
├── site-profiles/           # 站点任务态快照
├── tests/                   # 回归、手工、性能测试
├── work/                    # 调试用目标脚本
└── run-work-leapvm.js       # 本地单次调试入口
```

## 快速开始

### 1. 构建 server

```bash
cmake -S leap-vm -B leap-vm/build-server -DLEAPVM_BUILD_SERVER=ON
cmake --build leap-vm/build-server --target leapvm_server -j4
```

### 2. 构建 bundle

```bash
cd leap-env
npm run build
```

### 3. 单次调试运行

```bash
node run-work-leapvm.js
```

`run-work-leapvm.js` 会：

- 读取 `work/` 下目标脚本
- 可选加载 `site-profiles/*.json`
- 启动 standalone server
- 执行一次签名任务
- 输出结果并清理进程

### 4. 回归测试

```bash
pwsh -File tests/runners/run-smoke.ps1
pwsh -File tests/runners/run-full.ps1
pwsh -File tests/runners/run-perf.ps1
```

## 开发方式

Leap 不是“完整浏览器复刻”，而是“真实地基 + 按需补全”

常见开发流程：

1. 运行目标脚本并观察缺口
2. 通过 Hook / Inspector / 测试定位缺失 API
3. 在 `leap-env/src/skeleton/` 补结构
4. 在 `leap-env/src/impl/` 补行为
5. 重新构建 bundle 并回归验证

Skeleton 负责“像不像浏览器”，Impl 负责“行为对不对”

## 文档

根 `README.md` 只承担总入口角色；更细的模块说明统一收敛到 `manual/`(SSOT)


