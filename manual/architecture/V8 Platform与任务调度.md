# V8 Platform 与任务调度

本文档描述 LeapVM 如何封装 V8 Platform，并把所有 Isolate 任务收敛到可控的前台、延迟和后台调度链路。

## 1. 模块角色

```text
V8Platform::Instance()
  ├─ backend_platform_          V8 默认平台
  └─ LeapPlatform
      ├─ LeapForegroundTaskRunner
      ├─ LeapDelayedTaskScheduler
      ├─ LeapBackgroundScheduler
      └─ LeapPlatformMetrics
```

职责拆分：

- `V8Platform`：进程级单例，初始化 V8/ICU 并注册 Isolate。
- `LeapPlatform`：对 V8 `Platform` 的二次封装，接管 task runner 和 metrics。
- `LeapForegroundTaskRunner`：把属于某个 Isolate 的前台任务投递回 `VmInstance` 的 VM thread。
- `LeapDelayedTaskScheduler`：管理延迟任务和取消。
- `LeapBackgroundScheduler`：封装后台 worker thread 调度。
- `LeapPlatformMetrics`：统计队列深度、等待时间和 pump 指标。

## 2. 初始化链路

服务端启动时：

1. `main.cc` 调用 `V8Platform::Instance().InitOnce(argv[0])`
2. `InitOnce()` 初始化 ICU、V8 平台和引擎
3. Worker 创建 `VmInstance` 时把 Isolate 注册到 `V8Platform`
4. `LeapPlatform` 为该 Isolate 绑定前台 task runner 和统计槽位

关键点：

- LeapVM 不是直接把所有 V8 任务交回默认平台。
- 它需要保证和 `VmInstance` 的 VM thread 绑定，否则 Inspector、timer、微任务和 shutdown 都会失控。

## 3. 前台任务

前台任务的目标是“让某个 Isolate 的任务只在它自己的 VM thread 上执行”。

`LeapForegroundTaskRunner` 的流程：

1. `PostTaskImpl()` / `PostDelayedTaskImpl()` 接收 V8 任务。
2. 任务被包装为 `ForegroundTaskEnvelope`，记录排队时间。
3. `EnqueueTask()` 通过 `owner->PostTask(...)` 投递到 `VmInstance`。
4. VM thread 取出任务后实际执行。
5. 执行前后把等待时延写入 `LeapPlatformMetrics`。

这层封装解决了两件事：

- V8 前台任务不会跑到错误线程。
- shutdown 后 runner 可 `Deactivate()`，拒绝新任务并取消延迟任务。

## 4. 延迟任务

`LeapDelayedTaskScheduler` 自己维护一条调度线程和优先队列：

- `Schedule(delay, callback)` 按到期时间入堆。
- `Cancel(taskId)` 只标记取消，不直接改堆。
- 调度线程在 due time 到达后取出任务并执行回调。

它不直接执行 JS，而是把回调重新投递到前台 runner 或后台 scheduler。

这层存在的原因是：

- LeapVM 需要统一可取消的 delayed task 生命周期。
- shutdown 时必须明确停表、清队列、避免旧 Isolate 地址复用后的脏任务。

## 5. 后台任务

`LeapBackgroundScheduler` 负责把 V8 后台任务交给默认平台 worker thread：

- 普通后台任务直接走 `PostTaskOnWorkerThread`
- 延迟后台任务先交给 `LeapDelayedTaskScheduler`
- `CreateJob()` 继续透传 V8 job API

它的额外价值主要是：

- 对后台任务等待时间做 metrics 包装
- 与 LeapVM 自己的 delayed scheduler 对齐

## 6. Pump 与 VM thread 的关系

`VmInstance` 的 VM thread 会周期性 drain 平台消息队列：

- 正常执行路径里需要 pump 任务和微任务
- Inspector pause loop 里更依赖 `DrainMessageLoop()`
- shutdown 前也要做多轮 drain，尽可能排空残留任务

因此：

- `V8 Platform` 是 VM thread 模型的一部分，不只是初始化细节
- Inspector、timer、Promise/microtask、DevTools evaluate 能否正常工作，都和这层有关

## 7. Shutdown 保护

这套平台封装还承担 shutdown 防线：

1. `PrepareIsolateForShutdown()` 先把 Isolate 标记为 shutdown 中。
2. `LeapForegroundTaskRunner::Deactivate()` 解绑 owner 并取消全部 delayed task。
3. `UnregisterIsolate()` 删除 runner 和 metrics 状态。
4. VM thread 结束前反复 drain message loop，避免残留任务命中新 Isolate 地址。

这部分之所以重要，是因为 LeapVM 之前的重复启停、SIGSEGV、Inspector 竞态都与平台任务残留强相关。

## 8. 可观测性

`LeapPlatformMetrics` 当前统计：

- `pending_foreground_tasks`
- `pending_background_tasks`
- `delayed_task_count`
- `pump_count`
- `pump_iterations`
- `average_foreground_wait_ms`
- `average_background_wait_ms`
- `last_drain_ms`
- `overload_score`

这些指标用于判断：

- VM thread 是否堆积
- 背景线程是否饱和
- shutdown / pause loop 是否异常拖慢

## 9. 环境变量

与本模块直接相关的环境变量：

- `LEAPVM_TRACK_GC_OBJECT_STATS`
- `LEAPVM_PLATFORM_WORKER_THREADS`
- `LEAPVM_TRACE_VM_THREAD_AFFINITY`
- `LEAPVM_SHUTDOWN_PLATFORM_ON_VM_THREAD`
- `LEAPVM_PREPARE_SHUTDOWN_AFTER_VM_THREAD`

这些变量主要面向调试和排障，不属于常规业务配置。

## 10. 与其他文档的关系

- `Standalone服务端与Worker模型.md`
  解释 Worker 生命周期和 `VmInstance` 创建/销毁。
- `Inspector调试服务.md`
  解释 pause loop、`DrainMessageLoop()` 和 DevTools 消息分发。
- `运行时入口与任务执行链路.md`
  解释任务脚本如何最终进入 VM 执行。
