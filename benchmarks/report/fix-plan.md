# Leap Context 残留与修复方案（2026-03-06）

## 1. 本轮结论

### 1.1 已确认的问题

- 每个 worker 只创建一个主 `VmInstance` / `Isolate` / `Context`，任务之间复用同一 Context，不是“每任务新建后销毁”。证据：`leap-env/src/pool/thread-worker.js:166-181`、`leap-vm/src/leapvm/vm_instance.cc:1383-1550`。
- ThreadPool worker 的正常回收路径会直接 `process.exit()`，绕过 `shutdownEnvironment(leapvm)`，因此 `VmInstance::~VmInstance()` 这条 native 析构链不会执行。证据：`leap-env/src/pool/thread-worker.js:136-142` 对比 `leap-env/src/pool/worker.js:130-137`。
- 任务级 reset 不彻底。`resetSignatureTaskState()` 只清理签名态字段、storage、location/history、performance、document，没有清理 `Window` 级 listener / RAF / `window.name` / `window.status` / `window.opener`。证据：`leap-env/src/instance/signature-task.instance.js:425-440`、`leap-env/src/impl/Window.impl.js:53-73`、`leap-env/src/impl/Window.impl.js:449-456`、`leap-env/src/impl/Window.impl.js:687-777`。
- `task timeout` / `init timeout` / `heartbeat timeout` / `recycle timeout` / `pool close timeout` 都会进入 `_forceKillWorker()`；该函数没有幂等保护，会重复对同一 `Worker` 调 `terminate()`。证据：`leap-env/src/pool/thread-pool.js:314-326`、`leap-env/src/pool/thread-pool.js:375-376`、`leap-env/src/pool/thread-pool.js:613-614`、`leap-env/src/pool/thread-pool.js:744-745`、`leap-env/src/pool/thread-pool.js:750-760`、`leap-env/src/pool/thread-pool.js:781-782`。
- DOM 文档/节点释放逻辑本身存在，但它依赖任务 `finally` 或 worker shutdown。当前 ThreadPool 的 timeout/强杀与跳过 shutdown 组合，会把这条释放链打断。证据：`leap-env/runner.js:1192-1207`、`leap-env/runner.js:1214-1237`、`leap-env/src/impl/00-dom-shared.impl.js:2745-2790`。

### 1.2 已确认不是主因或暂不构成高风险的问题

- `VmInstance` 内大多数 `v8::Global` / `Persistent` 句柄都有显式 `Reset()` 路径，尤其是 timer、DOM wrapper、dispatch cache、child frame context。问题核心更像“没走到析构”，不是“析构少做了 Reset”。证据：`leap-vm/src/leapvm/vm_instance.cc:1556-1640`、`leap-vm/src/leapvm/vm_instance.cc:4636-4708`、`leap-vm/src/leapvm/vm_instance.cc:4959-5078`、`leap-vm/src/leapvm/vm_instance.cc:5798-5909`。
- `dispatch_fn` 缓存是“每 context 一份”，不是“每任务累计一份”；正常线程退出和析构都会清掉。证据：`leap-vm/src/leapvm/vm_instance.cc:5201-5259`、`leap-vm/src/leapvm/vm_instance.cc:5905-5909`。
- `SkeletonRegistry` / impl 注册表属于 worker 级初始化状态，不会按任务新增；`brand_compat_cache_` 无上限，但 key 空间受 skeleton 类型对数量约束，当前更像低风险有界缓存。证据：`leap-vm/src/leapvm/skeleton/skeleton_registry.cc:2169-2226`。
- `MonitorEngine` / `HookRegistry` / `HookFilter` 不保留历史事件，主要是实时判定和输出，不是“事件明细越积越多”的容器。证据：`leap-vm/src/leapvm/monitor.cc:26-93`、`leap-vm/src/leapvm/hook_filter.cc:56-86`。
- `LeapInspectorClient` 在 `Shutdown()` 中会清 session、object group、script index；问题在于 debug worker 生命周期内常驻，而不是缺少 shutdown 代码。证据：`leap-vm/src/leapvm/leap_inspector_client.cc:330-386`。

## 2. 修复优先级排序表

| 优先级 | 问题描述 | 发现来源 | 影响范围（短跑/长跑/两者） | 修复方案 | 涉及文件 | 复杂度 | 预期收益 |
|--------|---------|---------|------------------------|---------|---------|-----------------|------------------|
| P0 | ThreadPool worker 正常回收绕过 `shutdownEnvironment()`，导致 `VmInstance` 析构链不执行 | 第 5 次生命周期审计 + 本轮 B6 源码审计 + 长跑复现报告 | 长跑为主，短跑次级 | 为 thread worker 增加“可确认完成”的安全 shutdown 链路；回收失败再 force kill；修复前把长跑默认回退到 `ProcessPool` 或更低 `maxTasksPerWorker` | `leap-env/src/pool/thread-worker.js` `leap-env/src/pool/thread-pool.js` `leap-env/runner.js` `leap-vm/src/leapvm/vm_instance.cc` | 高 | 高 |
| P0 | timeout / force kill 会跳过任务 `finally` 与 post-task cleanup，DOM/task scope 释放链被截断 | 第 5 次生命周期审计 + 本轮 B7 审计 | 长跑为主 | 把 timeout worker 统一视为脏 worker；终止路径统一收口；补充 shutdown / cleanup 结果上报，避免“没清干净还继续复用” | `leap-env/src/pool/thread-pool.js` `leap-env/src/pool/thread-worker.js` `leap-env/src/pool/worker-common.js` | 中 | 高 |
| P1 | `window` 级任务状态跨任务残留：`_windowListeners`、`_rafMap`、`window.name/status/opener` | 第 5 次缓存/监听器审计 + 本轮 B6 源码审计 | 两者 | 新增 `resetWindowTaskState()`，纳入 `resetSignatureTaskState()`；批量取消 RAF、清空 listener map、重置 window 级字段 | `leap-env/src/impl/Window.impl.js` `leap-env/src/instance/signature-task.instance.js` | 低 | 高 |
| P1 | `_forceKillWorker()` 非幂等，可能重复 `terminate()`，与历史 `MaxListenersExceededWarning` 高度吻合 | 第 5 次监听器审计 + 2026-03-03 性能报告 | 长跑为主 | 引入 `terminating` 标记和单一 terminate promise；所有 kill 入口复用同一 helper，后续调用直接短路 | `leap-env/src/pool/thread-pool.js` | 低 | 中高 |
| P1 | DOM task scope 释放正确性过度依赖“任务一定跑到 cleanup” | 第 5 次生命周期审计 + 长跑复现报告 | 长跑 | 当 post-task cleanup 检测到 `activeDocs/activeTasks` 仍大于 0 时立即 recycle；shutdown 前后补做 release 统计和断言 | `leap-env/src/pool/worker-common.js` `leap-env/src/pool/thread-worker.js` `leap-env/src/pool/worker.js` `leap-env/src/impl/00-dom-shared.impl.js` | 中 | 中高 |
| P2 | `debug=true` 会自动启用 Inspector，Hook / Monitor / builtin wrapper 会在整个 worker 生命周期常驻 | Hook 影响评估报告 + 本轮 B8 审计 | 短跑为主，也会拖累长跑 debug 模式 | 把 `debug` 拆成 `debugHooks` / `enableInspector`；Inspector 改成显式开关；避免 benchmark 基线误带调试驻留能力 | `leap-env/runner.js` `leap-vm/src/leapvm/leap_inspector_client.cc` | 中 | 中 |
| P3 | 缺少对 context/timer/docs/listeners 等残留指标的常驻审计计数器，回归不易提前暴露 | 本轮 B6/B7/B8 审计 | 两者 | 增加轻量 runtime stats：active docs/tasks、RAF 数、window listener 数、timer 数、child frame 数；benchmark 定期采样落盘 | `leap-env/src/impl/Window.impl.js` `leap-env/src/impl/00-dom-shared.impl.js` `leap-vm/src/leapvm/vm_instance.cc` `benchmarks/longevity-runner.js` | 中 | 中 |

## 3. 高优先级问题的具体修复步骤

### 3.1 P0: 修复 ThreadPool 正常回收不走 native shutdown

1. 在 `leap-env/src/pool/thread-worker.js` 新增 `safeShutdownEnvironment()`。
   目标顺序：
   - `stopHeartbeat()`
   - 若 `leapvm.runScript` 可用，先执行 `releaseAllScopes()` 的 shutdown 脚本
   - 再调用 `shutdownEnvironment(leapvm)`
   - 成功后发送 `type: 'shutdown_ack'`
   - 最后 `process.exit(code)`
2. `finalizeExit()` 不再直接 `process.exit(code)`；改为“先尝试 graceful shutdown，失败再退出”。
3. `leap-env/src/pool/thread-pool.js::_recycleWorker()` 改成等待 `shutdown_ack` 或 `exit`。
   伪代码：
   ```js
   if (state.terminating) return state.terminatePromise;
   state.terminating = true;
   postMessage({ type: 'shutdown' });
   state.forceKillTimer = setTimeout(() => hardTerminate(), shutdownGraceMs);
   ```
4. 若 Windows 下仍复现 SIGSEGV，不要回退到“继续跳过 shutdown”作为最终方案。
   应先在 `VmInstance::~VmInstance()`、`StopVmThread()`、`LeapInspectorClient::Shutdown()` 周边最小化复现并定位具体崩点；在完全修复前，长跑默认切到 `ProcessPool`。

### 3.2 P0: 收口 timeout / force kill 路径，避免跳过 cleanup 后继续复用

1. 在 `thread-pool.js` 的 worker state 上新增：
   - `terminating`
   - `terminateReason`
   - `terminatePromise`
   - `cleanupSkipped`
2. 让 `init timeout`、`task timeout`、`heartbeat timeout`、`recycle timeout`、`pool close timeout` 全部走统一 helper，例如 `_beginTerminateWorker(workerId, reason, mode)`。
3. 任务 timeout 时立即把 worker 标记为不可再调度，且不再放回 `idleWorkerIds`。
4. 在 `_onWorkerExit()` 中落盘 termination reason、是否跳过 cleanup、退出前最后一次 `runtimeStats`。
5. `worker-common.js` 的 post-task cleanup 结果如果发现：
   - `activeDocs > 0`
   - 或 `activeTasks > 0`
   - 或 `cleanupError != null`
   直接触发 `shouldRecycle=true`，不要只依赖失败计数阈值。

### 3.3 P1: 为 Window 单例补任务级 reset

1. 在 `leap-env/src/impl/Window.impl.js` 新增内部函数 `resetWindowTaskState()`，至少做四件事：
   - 遍历 `_rafMap`，对每个 timeoutId 调 `nativeClearTimeout`
   - `_rafMap.clear()`
   - `_windowListeners.clear()`
   - `_windowName = ''`、`_windowStatus = ''`、`_opener = null`
2. 通过 `leapenv.resetWindowTaskState = resetWindowTaskState` 或等价公共导出暴露给任务清理层。
3. 在 `leap-env/src/instance/signature-task.instance.js::resetSignatureTaskState()` 里调用它。
   建议放在 `resetDocumentState()` 前后均可，但必须与现有任务 cleanup 同步执行。
4. 如果需要更强兜底，可在 `runner.js` 的 `finally` 段保留一次显式调用，避免 JS API 导出失配时漏掉。

### 3.4 P1: 让 `_forceKillWorker()` 幂等化

1. 在 `thread-pool.js::_forceKillWorker()` 开头加入：
   - `if (!state || state.terminatingHard) return state && state.terminatePromise;`
2. 首次进入时：
   - 置 `state.terminatingHard = true`
   - 缓存 `state.terminatePromise = state.worker.terminate().catch(() => {})`
   - 后续所有调用直接返回同一 promise
3. `_recycleWorker()` 设置的 `forceKillTimer`、close 阶段的强杀、heartbeat timeout 都只调用这个 helper，不再直接重复 terminate。
4. Benchmark / runner 层增加 warning 采集外壳，确保 `MaxListenersExceededWarning` 能进入 JSON，而不是只出现在 CLI。

## 4. 修复后的验证方法

| 验证目标 | 使用脚本 | 关键看点 | 通过标准 |
|---------|---------|---------|---------|
| Thread worker shutdown 闭环恢复 | `node benchmarks/longevity-runner.js --max-tasks-per-worker 200`、`500`、`1000` | `peak RSS`、`final RSS`、`workerRecycles`、`p95/p99` | 不再出现 `~5.8-5.9GB` 长时间高位平台；recycle 后 RSS 能明显回落；尾延迟不再灾难性放大 |
| timeout / force kill 不再留下脏 worker | `node benchmarks/longevity-runner.js --max-tasks-per-worker 1000`，并人为压低 `timeoutMs` 做超时回归 | `cleanupSkipped`、`terminateReason`、`activeDocs/activeTasks` | timeout 后 worker 不会重新入池；替换 worker 正常补位；退出时残留指标可观测 |
| Window 级状态不再跨任务残留 | 新增一个两段式回归脚本：第 1 任务注册 `window.addEventListener`、`requestAnimationFrame`、写 `window.name`；第 2 任务检查初始状态 | listener 数、RAF 数、`window.name/status/opener` | 第 2 任务看到的值必须为干净初始态 |
| `MaxListenersExceededWarning` 消失 | `node benchmarks/longevity-runner.js --max-tasks-per-worker 1000` | CLI warning、结果 JSON warning 计数 | 不再出现重复 terminate 相关 warning |
| debug 驻留能力从基线剥离 | `node benchmarks/perf-baseline-runner.js --mode minimal --pool 12 --concurrency 48 --total 500` 与 `--mode full` | minimal/full 吞吐差、是否自动启 Inspector | `minimal` 不再隐式启用 Inspector；full 与 minimal 的差异只由显式 debug 开关决定 |

## 5. 建议的执行顺序

1. 先修 P0 的 ThreadPool shutdown 闭环。
2. 紧接着修 P0/P1 的 timeout 终止收口和 `_forceKillWorker()` 幂等。
3. 再补 Window 级任务 reset。
4. 最后处理 debug 开关拆分和残留指标采样。

在 P0 未完成前，长跑基线不要再用 `ThreadPool + 高 maxTasksPerWorker` 做最终结论。
