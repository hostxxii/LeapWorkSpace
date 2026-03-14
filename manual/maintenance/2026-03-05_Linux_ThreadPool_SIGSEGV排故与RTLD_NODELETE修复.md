# Linux ThreadPool SIGSEGV 问题说明

## 概述

问题已收敛并完成代码级修复：Linux `worker_threads` 路径的 `SIGSEGV` 根因是  
`leapvm.node` 在 worker 线程退出时被 `dlclose`，随后 TLS 清理仍跳转到该模块地址导致崩溃。  

`2026-03-05` 新增修复：`leap-vm/index.js` 在 Linux worker 线程下使用 `process.dlopen(..., RTLD_NOW | RTLD_NODELETE)` 加载 addon，避免卸载窗口触发 TLS UAF。

## 环境

- OS: Ubuntu 24.04.4 LTS on WSL2 (kernel 6.6.87.2-microsoft-standard-WSL2)
- Node: v20.20.0
- CPU: Intel i9-9900KS 8C/16T
- V8: 静态链接 libv8_monolith.a (v8_compress_pointers + v8_enable_sandbox)
- leapvm.node: cmake-js 编译，Release 模式

## 现象

| 场景 | 结果 |
|------|------|
| ThreadPool（默认配置，Linux） | 直接走 worker_threads，稳定 PASS |
| ThreadPool + `LEAPVM_DISABLE_MAIN_ADDON_PIN=1` | 稳定 PASS（20 轮 start/close 压测通过） |
| ThreadPool + `LEAPVM_DISABLE_MAIN_ADDON_PIN=1` + 5k 任务压测 | 稳定 PASS（3/3） |
| ThreadPool + `LEAPVM_DISABLE_MAIN_ADDON_PIN=1` + `LEAPVM_DISABLE_RTLD_NODELETE=1` | 可稳定复现 SIGSEGV（exit 139） |
| 单实例 runScript (无 pool) | PASS |

关键观察：`RTLD_NODELETE` 开启/关闭对崩溃有一票否决作用，和 gdb 栈结论一致。

## 分析方向

### 1. V8 Sandbox + Pointer Compression 在多线程 worker 中的兼容性

编译参数启用了 `v8_compress_pointers = true` 和 `v8_enable_sandbox = true`。V8 sandbox 在 Linux 上使用 `mmap` 分配虚拟地址空间，多个 Isolate 在同一进程的 worker_threads 中可能因地址空间冲突导致 SIGSEGV。

排查建议：
- 重新编译 V8，尝试 `v8_enable_sandbox = false`
- 或尝试 `v8_compress_pointers = false`（会增加内存占用但消除地址约束）

### 2. 信号处理冲突

Node.js worker_threads 和 V8 都注册了 SIGSEGV handler。Linux 的信号语义与 Windows SEH 不同：
- Windows: SEH 异常可被 per-thread catch，不影响其他线程
- Linux: SIGSEGV 是进程级信号，V8 的 signal handler chain 在多 Isolate 场景下可能无法正确路由

排查建议：
- 用 `gdb --args node test.js` 获取 crash backtrace
- 检查 crash 是否发生在 V8 sandbox trap handler (`v8::internal::trap_handler`)
- 检查 `SA_SIGINFO` handler 注册顺序

### 3. use_custom_libcxx = false 导致 ABI 不兼容

编译参数使用了系统 libcxx 而非 V8 自带的。如果系统 libstdc++ 版本与 V8 内部期望的不一致，可能导致 vtable 偏移错误。

排查建议：
```bash
ldd ~/LeapWorkSpace/leap-vm/build/Release/leapvm.node
# 确认链接的 libstdc++ 版本
```

### 4. ICU 符号冲突

Node.js 自带 ICU，V8 monolith 也编译了 ICU。两者在同一进程中可能存在符号冲突，在单线程下侥幸正常，多线程并发访问时触发。

排查建议：
- 检查 `nm libv8_monolith.a | grep icu` 是否有与 Node 重复的符号
- 考虑使用 `v8_enable_i18n_support = false` 编译，或添加 ICU 版本后缀

## 复现命令

```bash
# 新版本默认走 thread pool。
# 复现崩溃需关闭主线程 pin，并显式关闭 RTLD_NODELETE 保护：
LEAPVM_DISABLE_MAIN_ADDON_PIN=1 \
LEAPVM_DISABLE_RTLD_NODELETE=1 \
LEAP_STABILITY_TASKS=500 \
LEAP_STABILITY_CONCURRENCY=16 \
LEAP_POOL_SIZE=4 \
LEAPVM_LOG_LEVEL=error \
LEAPVM_HOST_LOG_LEVEL=error \
node tests/scripts/integration/test-leapenv-thread-pool-stability.js

# 典型结果：Segmentation fault (core dumped), exit code 139
```

## 当前修复策略

### 1) Linux worker 线程 RTLD_NODELETE 加载（已生效）

- 文件：`leap-vm/index.js`
- 行为：Linux worker 线程加载 `leapvm.node` 时使用 `RTLD_NOW | RTLD_NODELETE`。
- 关闭该保护（仅用于复现/诊断）：`LEAPVM_DISABLE_RTLD_NODELETE=1`
- 强制开启（排障）：`LEAPVM_FORCE_RTLD_NODELETE=1`
- 自定义 flag（排障）：`LEAPVM_RTLD_NODELETE_FLAG=0x1000`

### 2) 主线程 pin（保留，可选）

- 文件：`leap-env/src/pool/thread-pool.js`
- 行为：主线程预加载 `leap-vm`，降低 worker 卸载竞态风险。
- 关闭 pin（排障）：`LEAPVM_DISABLE_MAIN_ADDON_PIN=1`

## 修复状态

已完成 root-cause 修复并通过稳定性验证，当前重点转为回归与符号化分析。

## 2026-03-05 排故记录（实测）

### A. 最小触发路径（已确认）

不仅是大脚本，`worker_threads` 关闭阶段也可触发崩溃：

```bash
LEAPVM_DISABLE_MAIN_ADDON_PIN=1 \
LEAPVM_DISABLE_RTLD_NODELETE=1 \
node -e "
const { ThreadPool } = require('./leap-env/src/pool/thread-pool');
(async () => {
  const pool = new ThreadPool({ size: 2 });
  await pool.start();
  await pool.close();
})();
"
# 结果：高概率 Segmentation fault (exit 139)
```

### B. 对照实验

| 配置 | 结果 | 结论 |
|------|------|------|
| `ThreadPool` 默认配置 | PASS | 线程池路径稳定 |
| `ThreadPool` + `LEAPVM_DISABLE_MAIN_ADDON_PIN=1` | 连续 20 轮 `size=2` start/close + task 全通过 | 不依赖主线程 pin 也可稳定 |
| `ThreadPool` + `LEAPVM_DISABLE_MAIN_ADDON_PIN=1` + 稳定性脚本（`5000` tasks / `32` 并发 / `8` workers） | 连续 3 轮 PASS | 长压稳定 |
| `ThreadPool` + `LEAPVM_DISABLE_MAIN_ADDON_PIN=1` + `LEAPVM_DISABLE_RTLD_NODELETE=1` | 快速 `exit 139` | 崩溃与 RTLD_NODELETE 保护直接相关 |
| `ThreadPool` + `LEAPVM_DISABLE_MAIN_ADDON_PIN=1` + `LEAPVM_SKIP_VM_TEARDOWN_ON_UNLOAD=1` | 仍可复现 `139` | 问题不只在 `default_vm.reset()` |

### C. 代码级定位结论

1. 崩溃与 **worker 环境销毁 / addon unload 阶段** 强相关，不仅发生在任务执行期。  
2. 关键触发条件是：`leapvm.node` 仅在 worker 线程加载，worker 退出时发生卸载竞态。  
3. 已在 `leap-vm/index.js` 实施 Linux worker 线程 `RTLD_NODELETE` 加载，避免 `dlclose` 后 TLS 清理跳转已卸载地址。  
4. `ThreadPool` 保留主线程 addon pin（可选保护层），但在 `RTLD_NODELETE` 生效时不是稳定性的必要条件。  
5. 保留诊断开关：  
   - `LEAPVM_DISABLE_MAIN_ADDON_PIN=1`：关闭 pin（用于复现老问题）  
   - `LEAPVM_TRACE_ADDON_UNLOAD=1`：输出 addon unload 时序日志  
   - `LEAPVM_SKIP_VM_TEARDOWN_ON_UNLOAD=1`：仅实验用，存在泄漏风险
   - `LEAPVM_DISABLE_RTLD_NODELETE=1`：关闭新修复（用于复现）  
   - `LEAPVM_FORCE_RTLD_NODELETE=1`：强制开启新修复（排障）

### D. 当前可用结论

- 线程池路径已可直接稳定运行。  
- 建议保留 `RTLD_NODELETE` 保护，不要在生产设置 `LEAPVM_DISABLE_RTLD_NODELETE=1`。  
- 建议在目标工作负载上继续做更长 soak（例如 10k+ 任务）。

### E. unload trace 关键证据（新增）

`LEAPVM_TRACE_ADDON_UNLOAD=1` 下观察到：

- `pin=off`：两个 worker 的 `DeleteAddonData end` 后立即进程 `SIGSEGV`（`exit 139`）
- `pin=on`：worker unload 后，主线程会出现一次 `default_vm=(nil)` 的 addon unload，进程正常退出

结论（历史阶段）：主线程 pin 能显著改变卸载时机并规避崩溃。  
最新阶段已通过 `RTLD_NODELETE` 进一步从加载侧消除卸载窗口问题。

### F. 当前阻塞项（原生栈）

`gdb` 已安装并拿到首轮 backtrace。当前剩余阻塞在于：

1. 需要 `RelWithDebInfo` 重新编译 `leapvm.node`，获取更完整符号
2. 可选安装 `lldb/strace` 做交叉验证
3. 如需进一步锚定具体符号，建议将 `RIP-base` 偏移（如 `0x1dff220`）映射回符号表

### G. gdb 实测根因（新增，2026-03-05）

已安装 `gdb` 后补抓到关键证据：

1. `pin=off`（`LEAPVM_DISABLE_MAIN_ADDON_PIN=1`）下，两个 worker 线程在 `node::Environment::~Environment()` 路径都会命中：
   - `dlclose("/home/hostxxii/LeapWorkSpace/leap-vm/build/Release/leapvm.node")`
2. 第二次 `dlclose` 后，线程退出阶段在 `__nptl_deallocate_tsd` 触发 `SIGSEGV`。
3. `dlclose` 时 `link_map->l_addr = 0x7fff75000000`，崩溃 `RIP = 0x7fff76dff220`，偏移 `0x1dff220`，落在 `leapvm.node` 映像地址区间内。
4. `readelf -Wl leapvm.node` 显示该模块存在 `TLS` 段，说明线程退出会涉及 TLS 清理路径。
5. 应用 `RTLD_NODELETE` 后，`pin=off` 也可稳定通过 20 轮和 5k 任务压测；关闭 `RTLD_NODELETE` 会立即恢复 `139`。

综合判断：

- 当前 SIGSEGV 的直接机制是：**worker 线程卸载 `leapvm.node` 后，线程 TLS 清理仍跳转到该模块地址，命中已卸载代码页**。
- 最终修复手段是：Linux worker 线程加载 `leapvm.node` 时启用 `RTLD_NODELETE`，避免该模块在 worker 退出窗口被真正卸载。

### H. 修复后回归（新增）

Linux 下已恢复执行原先“已知问题跳过”的线程池集成测试，实测通过：

1. `tests/scripts/integration/test-leapenv-threadpool-dod.js`：PASS
2. `tests/scripts/integration/test-leapenv-dom-pool-isolation.js`：PASS（process/thread 均通过）
3. `tests/scripts/integration/test-leapenv-dom-memory-leak.js`：PASS（thread 增长 40.11MB，低于 120MB 限值）

测试脚本中的 Linux 固定跳过逻辑已替换为手动开关：

- `LEAPVM_SKIP_THREADPOOL_TESTS=1` 时才跳过线程池测试。

## 测试日期

2026-03-05
