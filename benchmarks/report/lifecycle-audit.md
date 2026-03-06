# Leap 生命周期审计（2026-03-06）

结论先行：

- 长跑退化最可疑的主因不是普通 JS heap，而是 `ThreadPool` worker 退出时绕过了 `shutdownEnvironment()`，导致 `leapvm.shutdown()` 对应的 native `VmInstance` 析构链路不走。
- `window` 级 listener / `requestAnimationFrame` 状态是明确的跨任务累积点，当前没有接入任何任务级 reset。
- 历史上的 `MaxListenersExceededWarning` 在代码审计里最像 `thread-pool.js` 强杀路径重复 `worker.terminate()` 触发的 Node 内部 `exit` listener 叠加；这是基于代码路径的推断，不是日志直证。

## 任务 A：Worker 生命周期闭环审计

| # | 初始化动作 | 位置(文件:行号) | 对应清理动作 | 位置(文件:行号) | 是否对称 | 备注 |
|---|----------|--------------|------------|--------------|---------|------|
| 1 | Process worker 初始化 VM：`initializeEnvironment(runnerOptions)`，拿到 `leapvm` | `leap-env/src/pool/worker.js:161` | `shutdownEnvironment(leapvm)` | `leap-env/src/pool/worker.js:133` | 是 | ProcessPool 的正常 `shutdown` / recycle 会走到这里。 |
| 2 | Thread worker 初始化 VM：`initializeEnvironment(runnerOptions)`，拿到 `leapvm` | `leap-env/src/pool/thread-worker.js:167` | 无显式 VM 清理；`finalizeExit()` 直接 `process.exit(code)` | `leap-env/src/pool/thread-worker.js:136-143` | 否 | 文件内注释已明确“跳过所有 VM 调用”；这会绕过 `shutdownEnvironment()` 和 native 析构链。高风险。 |
| 3 | Worker 心跳 `setInterval()` | `leap-env/src/pool/worker.js:115` | `clearInterval()` | `leap-env/src/pool/worker.js:104-110` | 是 | Process worker 对称。 |
| 4 | Thread worker 心跳 `setInterval()` | `leap-env/src/pool/thread-worker.js:120` | `clearInterval()` | `leap-env/src/pool/thread-worker.js:109-115` | 是 | Thread worker 对称，但只清心跳，不清 VM。 |
| 5 | 宿主初始化：加载 addon、配置 hook、执行 bundle | `leap-env/runner.js:865-931` | `releaseAllScopes()` + `leapvm.shutdown()` | `leap-env/runner.js:1214-1237` | 是 | 这是完整的宿主关闭入口；Thread worker 正常回收时没有调用它。 |
| 6 | 每任务 setup：`beginTask` / `beginTaskScope` / 注入 fingerprint/storage/document snapshot | `leap-env/runner.js:1161-1189` | `resetSignatureTaskState()` / `endTaskScope()` / `endTask()` | `leap-env/runner.js:1192-1207` | 是 | 仅在 `runScript` 正常进入 `finally` 时成立；任务超时/强杀会跳过。 |
| 7 | Perf trace 模式的每任务 setup：初始化 `runtime.perf.task` 并进入 task scope | `leap-env/runner.js:949-996` | cleanup script 中 reset/endTaskScope/endTask | `leap-env/runner.js:1000-1024` | 是 | 同样受“超时/强杀跳过 finally”影响。 |
| 8 | Worker 任务后兜底清理：`releaseTaskScope(taskId)` + `drainReleaseStats()` | `leap-env/src/pool/worker-common.js:56-77` | 无反向动作；这是 cleanup 本身 | `leap-env/src/pool/worker-common.js:56-77` | 是 | 属于额外 safety net；成功/异常返回后都会执行。 |
| 9 | DOM 文档注册：写入 `documentById` / `taskToDocs` / `taskPrimaryDocument` | `leap-env/src/impl/00-dom-shared.impl.js:917-944` | `releaseTaskScope()` -> `releaseDocument()` -> 从三张表删除并调用 native `releaseDocument` | `leap-env/src/impl/00-dom-shared.impl.js:2650-2719` | 是 | 正常任务路径闭环成立；若任务被强杀，只能依赖 worker 生命周期结束。 |
| 10 | 任务开始时先清旧 task scope：`releaseStaleTaskScopes(nextTaskId)` | `leap-env/src/impl/00-dom-shared.impl.js:2759-2778` | 旧任务文档实际释放 | `leap-env/src/impl/00-dom-shared.impl.js:2763-2766` | 是 | 对“上一任务没清干净”有补救，但只在下一任务开始时触发。 |
| 11 | 任务级签名状态：填充 `navigator/screen/windowMetrics/performanceSeed/randomSeed/canvasProfile` | `leap-env/src/instance/signature-task.instance.js:335-392` | 清空上述字段并重置 storage/location/history/performance/document | `leap-env/src/instance/signature-task.instance.js:425-440` | 基本是 | 任务级字段对称较完整；`window` 级 listener / RAF 不在这里。 |
| 12 | Runtime 注册 impl，并预构建 `_implDescCache[typeName]` | `leap-env/src/core/runtime.js:548-551`, `leap-env/src/core/runtime.js:632-657` | 无 JS 侧单独 clear；依赖 worker 销毁/Isolate 析构 | `leap-vm/src/leapvm/vm_instance.cc:1556-1640` | 条件对称 | Process worker 可依赖显式 shutdown；Thread worker 正常 recycle 不走这条链。 |
| 13 | Skeleton 初始化：`loadSkeleton()`、`installConstructibleWindowWrappers()`、`finalizeFacade()`、`lockdownGlobalFacade()` | `leap-env/src/instance/skeleton-init.instance.js:13-43` | 无 JS 侧卸载；依赖 Isolate 销毁 | `leap-vm/src/leapvm/vm_instance.cc:1617-1640` | 条件对称 | 典型 worker 级初始化；若 worker 生命周期不闭环，会整份残留到下一轮。 |
| 14 | Native `VmInstance` 构造：分配 allocator、创建 isolate/context、保存 `global_template_`、安装 timers/native wrapper、启动 VM 线程 | `leap-vm/src/leapvm/vm_instance.cc:1383-1554` | 析构：关 inspector、停 VM 线程、清 `dom_wrapper_cache_`/child frames/skeleton registry、Dispose isolate、释放 allocator | `leap-vm/src/leapvm/vm_instance.cc:1556-1640` | 是 | native 侧闭环本身完整，问题在 Thread worker 没有走到这里。 |
| 15 | Native timer 注册：`AddTimeoutFunction` / `AddTimerString` 持有 `callback/args/owner_ctx` 全局句柄 | `leap-vm/src/leapvm/vm_instance.cc:4636-4685` | `ClearTimer()`、单次 timer 执行后释放、VM 线程退出前清空全部 timer 句柄 | `leap-vm/src/leapvm/vm_instance.cc:4688-4708`, `leap-vm/src/leapvm/vm_instance.cc:5047-5057`, `leap-vm/src/leapvm/vm_instance.cc:5873-5893` | 是 | native timer 本身闭环完整；仍依赖 `VmInstance` 生命周期真正结束。 |

### 生命周期审计结论

- 最大的不对称在 `thread-worker.js:136-143`。Process worker 会走 `runner.shutdownEnvironment()`，Thread worker 正常关闭/回收则完全跳过。
- 每任务 JS cleanup 设计上较完整，但只覆盖“脚本正常返回/抛错”的路径；`task timeout -> _forceKillWorker()` 时，`runner.js` 的 `finally` 和 `worker-common` 的 post-task cleanup 都不会执行。
- native `VmInstance` 析构本身是完整的，说明问题更像“析构链没有被调用”，而不是“析构函数少做了什么”。

## 任务 B：Listener 泄漏审计

说明：

- 下表先覆盖 `leap-env/` 里所有显式 `.on/.once/addEventListener/process.on` 注册点。
- 最后一行是基于代码路径的推断项：它不是源码里的显式 `.on(...)`，但最像历史 `MaxListenersExceededWarning` 的来源。

| # | emitter 对象 | 事件名 | 注册位置(文件:行号) | 解绑位置(文件:行号) | 是否每任务重复注册 | 风险等级(高/中/低) | 说明 |
|---|-------------|-------|-------------------|-------------------|------------------|------------------|------|
| 1 | `Worker` 实例 | `message` | `leap-env/src/pool/thread-pool.js:383` | 无显式 `off`；依赖 worker 对象退出后整体回收 | 否 | 低 | 每个 worker spawn 一次，不是每任务重复注册。 |
| 2 | `Worker` 实例 | `exit` | `leap-env/src/pool/thread-pool.js:384` | 无显式 `off`；依赖 worker 对象退出后整体回收 | 否 | 低 | 同上。 |
| 3 | `Worker` 实例 | `error` | `leap-env/src/pool/thread-pool.js:385` | 无显式 `off`；依赖 worker 对象退出后整体回收 | 否 | 低 | 同上。 |
| 4 | `ChildProcess` 实例 | `message` | `leap-env/src/pool/process-pool.js:241` | 无显式 `off`；依赖子进程退出后整体回收 | 否 | 低 | ProcessPool 没看到重复注册到同一 child。 |
| 5 | `ChildProcess` 实例 | `exit` | `leap-env/src/pool/process-pool.js:242` | 无显式 `off`；依赖子进程退出后整体回收 | 否 | 低 | 同上。 |
| 6 | `ChildProcess` 实例 | `error` | `leap-env/src/pool/process-pool.js:243` | 无显式 `off`；依赖子进程退出后整体回收 | 否 | 低 | 同上。 |
| 7 | worker 进程内 `process` | `message` | `leap-env/src/pool/worker.js:325` | 无 | 否 | 低 | 每个 process worker 仅注册一次，进程结束即释放。 |
| 8 | worker 进程内 `process` | `uncaughtException` | `leap-env/src/pool/worker.js:345` | 无 | 否 | 低 | 注册一次；异常后 `finalizeExit(1)` 退出。 |
| 9 | worker 进程内 `process` | `unhandledRejection` | `leap-env/src/pool/worker.js:355` | 无 | 否 | 低 | 同上。 |
| 10 | thread worker 内 `parentPort` | `message` | `leap-env/src/pool/thread-worker.js:351` | 无 | 否 | 低 | 每个 thread worker 仅注册一次。 |
| 11 | thread worker 内 `process` | `uncaughtException` | `leap-env/src/pool/thread-worker.js:371` | 无 | 否 | 低 | 注册一次；异常后直接 `process.exit(1)`。 |
| 12 | thread worker 内 `process` | `unhandledRejection` | `leap-env/src/pool/thread-worker.js:382` | 无 | 否 | 低 | 同上。 |
| 13 | DOM `EventTarget`/Node 实例 | 调用方传入的任意 DOM 事件 | `leap-env/src/impl/EventTarget.impl.js:6-10`, `leap-env/src/impl/Node.impl.js:313-315`, `leap-env/src/impl/00-dom-shared.impl.js:3460-3479` | `leap-env/src/impl/EventTarget.impl.js:13-17`, `leap-env/src/impl/Node.impl.js:317-319`, `leap-env/src/impl/00-dom-shared.impl.js:3482-3497`，以及文档释放 `leap-env/src/impl/00-dom-shared.impl.js:2705-2728` | 取决于脚本 | 中 | Node/DOM listener 存在于节点 state 上；正常任务结束随文档释放清掉，但 timeout/强杀会跳过。 |
| 14 | `EventTarget` 实例 | `type`（`when(type)` 自动注册 `once`） | `leap-env/src/impl/EventTarget.impl.js:31-33` | 事件触发时由 `once` 自动移除：`leap-env/src/impl/00-dom-shared.impl.js:3528-3530` | 取决于脚本 | 低 | `once` 降低风险；若事件永不触发，仍会挂在目标对象上。 |
| 15 | `window` 单例 | 任意 window 事件 | `leap-env/src/impl/Window.impl.js:745-772` | 仅显式 `removeEventListener()`：`leap-env/src/impl/Window.impl.js:774-778`；无任务级批量清理 | 是 | 高 | `_windowListeners` 是模块级 `Map`，worker 复用期间跨任务常驻。 |
| 16 | `Worker`（Node 内部，推断） | `exit` | `leap-env/src/pool/thread-pool.js:759` | worker 真正退出时由 Node 内部释放 | 否 | 高 | `_forceKillWorker()` 没有“已 terminate”防重入标记，且可从 `init timeout`/`task timeout`/`recycle timeout`/`heartbeat timeout`/`close timeout` 多路进入：`375-376`, `613-614`, `744-746`, `781-783`, `314-326`。重复 `worker.terminate()` 很像历史 `MaxListenersExceededWarning` 的来源。此条为代码推断。 |

### Listener 审计结论

- 代码里最明确、最危险的“跨任务常驻 listener 容器”是 `Window.impl.js` 里的 `_windowListeners`。
- DOM 节点 listener 主要依赖文档释放来清理，设计上可行，但它把正确性建立在“每个任务都能跑到 cleanup”上。
- Node 侧 warning 的最可疑来源不是 DOM listener，而是 `thread-pool.js` 强杀路径对同一 `Worker` 重复调用 `terminate()`。

## 任务 C：缓存增长审计

说明：

- 这里聚焦“运行期跨任务可能增长”的结构。
- 大量 `WeakMap` 型私有状态（如 `History/Performance/Location/DOMTokenList/...`）在当前 Node 环境下是弱引用，不是这轮长跑 RSS 的首要嫌疑；仅对 fallback 非弱引用分支做了补记。

| # | 缓存名称/变量名 | 位置(文件:行号) | key/value 来源 | 是否有 size 限制 | 是否在 worker 销毁时清空 | 是否跨任务累积 | 风险等级 | 说明 |
|---|---------------|---------------|--------------|----------------|----------------------|-------------|---------|------|
| 1 | `documentById` / `taskToDocs` / `taskPrimaryDocument` | `leap-env/src/impl/00-dom-shared.impl.js:14-16` | taskId -> docId 集合 / docId -> document / taskId -> 主 document | 无 | 仅在 `releaseTaskScope()/releaseAllScopes()` 成功执行时清空 | 是 | 中 | 正常任务结束会释放：`2650-2728`；但 timeout/强杀路径会跳过，Thread worker 又缺显式 VM shutdown。 |
| 2 | `state.ownedNodes`（每 document 一份 `Set`） | `leap-env/src/impl/00-dom-shared.impl.js:925`, `leap-env/src/impl/00-dom-shared.impl.js:953`, `leap-env/src/impl/00-dom-shared.impl.js:1805` | document -> owned DOM nodes | 无 | 随 `releaseDocument()` / `clearDocumentChildren()` 重建或清空 | 是 | 中 | 是 DOM 节点累积的主索引；如果任务 scope 不释放，节点集合就会留在 worker 生命周期内。 |
| 3 | `_windowListeners` | `leap-env/src/impl/Window.impl.js:53` | event type -> listener -> entry | 无 | 否 | 是 | 高 | 无任何 `resetSignatureTaskState()` / `endTaskScope()` / worker shutdown 批量清空逻辑。 |
| 4 | `_rafMap` | `leap-env/src/impl/Window.impl.js:73` | rafId -> native timeoutId | 无 | 否 | 是 | 高 | 仅在回调触发或显式 `cancelAnimationFrame()` 删除：`695`, `713`；任务结束不清空。 |
| 5 | Window 单例缓存：`_navigatorInstance/_historyInstance/_performanceInstance/_screenInstance/_localStorageInstance/_sessionStorageInstance/_cryptoInstance/_locationInstance` | `leap-env/src/impl/Window.impl.js:56-63`, `leap-env/src/impl/Window.impl.js:71` | 固定 BOM/native instance 强引用 | 固定上限（8 个左右） | 否 | 是 | 低 | 数量固定，不是无限增长，但会把单例强引用到整个 worker 生命周期。 |
| 6 | `_implDescCache` | `leap-env/src/core/runtime.js:549`, `leap-env/src/core/runtime.js:638-651` | typeName -> prototype descriptor cache | 无显式限制，但受 impl 类型数上界约束 | 依赖 worker/Isolate 销毁 | 是 | 低 | 注册时一次性构建，通常是有界缓存；Thread worker 不走显式 shutdown 时只能等线程/进程层回收。 |
| 7 | `leapenv.memory.privateData` | `leap-env/src/core/runtime.js:456-477` | object -> 私有数据 | `WeakMap` 无需限制；fallback 无限制 | 无显式清空 | 是 | 低 | 当前 Node 20 有 `WeakMap`，主路径风险低；fallback `_store` 在极老环境下会变成只增不减。 |
| 8 | `bundleCode` / `bundleCodeCache` 挂在 `workerInitOptions` | `leap-env/src/pool/thread-pool.js:213-235` | 整个环境 bundle 字符串 / V8 code cache buffer | 单份 | 无显式清空 | 是 | 低 | 进池时只生成一次，体积固定；会在 pool 生命周期内常驻。 |
| 9 | `global.__leapvmMainAddonPin` / `this.pinnedLeapVmAddon` | `leap-env/src/pool/thread-pool.js:161-163`, `leap-env/src/pool/thread-pool.js:181-190` | 主线程对 addon 模块的强引用 | 单份 | 否 | 是 | 低 | 这是故意做的“防卸载 pin”；不会无限增长，但会延长 addon 生命周期。 |
| 10 | `_placeholderXhrMap` / `_fallbackXhrStateList` | `leap-env/src/impl/Window.impl.js:75-76`, `leap-env/src/impl/Window.impl.js:213-257` | XHR placeholder 实例 -> state | `WeakMap` 主路径无上限问题；fallback 无限制 | 否 | 是 | 低 | 现代环境走 `WeakMap`；fallback 数组只在不支持 WeakMap 时泄漏。 |
| 11 | `fallbackChannels` / `fallbackPorts` | `leap-env/src/impl/MessageChannel.impl.js:6-7`, `leap-env/src/impl/MessageChannel.impl.js:32`, `leap-env/src/impl/MessageChannel.impl.js:51` | MessageChannel/Port -> state | 无 | 否 | 是 | 低 | 也是“无 WeakMap 时才泄漏”的后备路径。 |
| 12 | `fallbackState` | `leap-env/src/impl/00-dom-shared.impl.js:11`, `leap-env/src/impl/00-dom-shared.impl.js:102` | DOM node -> state | 无 | 否 | 是 | 低 | 当前环境走 `WeakMap`；fallback 数组仅作为兼容路径存在。 |
| 13 | `globalArrayBufferPool` 及其 `float64Pools/int32Pools/uint8Pools` | `leap-env/src/impl/dod-layout-engine.js:565-569`, `leap-env/src/impl/dod-layout-engine.js:678` | size -> TypedArray 对象池 | 每个 size 最多 16 个，但 size 维度无上限 | 无显式全局 clear | 是 | 中 | 若后续真正启用该全局池，不同 size 桶位可持续增加；当前代码里只导出、未看到业务侧实际接入。 |
| 14 | `DoDTreeCache.cache` | `leap-env/src/impl/dod-layout-engine.js:691-761` | key -> cached tree | 有，默认 `maxSize=100` + TTL 60s | 有 `clear()`，但未看到业务侧实例化 | 取决于调用方 | 低 | 设计本身有边界，不是当前主嫌疑。 |
| 15 | `runtime.perf.task.dispatch.hotspots` | `leap-env/src/core/runtime.js:665-692`, `leap-env/runner.js:950-961` | `[typeName, propName, op]` -> count | 无 | 每任务 setup 时重建 | 否 | 低 | 只在 `LEAP_PERF_TRACE=1` 下存在，且每任务都会覆盖，不跨任务累积。 |

### 缓存审计结论

- 这轮最危险的不是“缓存算法写坏了”，而是“跨任务全局状态没有接入 reset”：`_windowListeners`、`_rafMap` 最典型。
- DOM 文档注册表本身有释放逻辑，但它的正确性依赖 task cleanup 和 worker shutdown 两层都成功；而这正是 Thread worker 当前最薄弱的部分。
- DoD 相关缓存大多是有界或尚未实际接入；现阶段优先级低于 worker 生命周期和 window 级状态。

## 高风险发现摘要

1. `ThreadPool` worker 正常回收不调用 `shutdownEnvironment()`  
位置：`leap-env/src/pool/thread-worker.js:136-143`  
影响：绕过 `leapvm.shutdown()`，native `VmInstance` 的析构链 `leap-vm/src/leapvm/vm_instance.cc:1556-1640` 不执行。  
建议：优先修复 thread worker 安全 shutdown；修复前，长跑默认回退 `ProcessPool` 或强制更低 `maxTasksPerWorker`，避免让未析构 VM 长时间常驻。

2. `window` 级 listener 是明确的跨任务累积点  
位置：`leap-env/src/impl/Window.impl.js:53`, `leap-env/src/impl/Window.impl.js:745-778`  
影响：worker 复用期间，历史任务注册的 window listener 会带到后续任务。  
建议：新增 `resetWindowTaskState()`，在 `resetSignatureTaskState()` 或 `runner.js` cleanup 阶段统一清空 `_windowListeners`。

3. `requestAnimationFrame` 状态没有任务级清理  
位置：`leap-env/src/impl/Window.impl.js:73`, `leap-env/src/impl/Window.impl.js:687-717`  
影响：未执行/未取消的 RAF 句柄会跨任务滞留，并可能在后续任务期间回调旧闭包。  
建议：在任务 cleanup 中批量 `cancelAnimationFrame` 并清空 `_rafMap`；如果容器不需要真正 RAF，可直接在任务模式下短路为 no-op。

4. `thread-pool.js` 强杀路径缺少幂等保护，可能叠加 Node 内部 listener  
位置：`leap-env/src/pool/thread-pool.js:750-761`  
影响：同一 `Worker` 被重复 `terminate()` 时，Node 可能反复给 `exit` 挂内部 listener；这与历史 `MaxListenersExceededWarning` 高度一致。  
建议：给 worker state 增加 `terminating` 标记；`_forceKillWorker()` 首次进入后直接短路后续调用，只保留一条终止中的 promise。

5. DOM task scope 释放依赖“任务能跑到 cleanup”  
位置：`leap-env/runner.js:1192-1207`, `leap-env/src/impl/00-dom-shared.impl.js:2705-2790`  
影响：任务 timeout / force kill 会跳过 JS finally 和 post-task cleanup；如果 worker 生命周期又不闭环，文档与节点索引就会留在 worker 内。  
建议：timeout 后直接判定 worker 不可信并立即回收；Thread worker 修复 shutdown 前，不要尝试继续复用 timeout 过的 worker。
