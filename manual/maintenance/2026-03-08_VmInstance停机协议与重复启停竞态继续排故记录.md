# 2026-03-08 VmInstance 停机协议与重复启停竞态继续排故记录

## 目标

继续围绕以下问题收口：

- `ThreadPool close() -> start()` 长 soak 中的原生 `SIGSEGV`
- `VmInstance` 停机协议是否还有未收口的后台状态
- 旧 VM 完全析构与新 VM 重新创建之间是否仍存在竞态窗口

## 当前已知边界

截至本文件创建时，已知结论如下：

- Linux 侧先前的同步停顿/慢窗口塌陷已基本被压住，当前主症状不再是执行期 stall
- 当前主问题收缩为：`close/start` 多轮后，在旧 `VmInstance` 收尾与新一轮 VM 初始化之间触发原生崩溃
- 旧 VM 的延迟回收已经从 worker ctor 挪到主线程 `ThreadPool.close()/start()` 之间的显式 drain
- worker 对 addon 隐式 `default_vm` 的依赖已经明显减弱，不再是当前第一嫌疑

## 本轮排故策略

优先顺序：

1. 直接核对 `VmInstance::~VmInstance()` 的停机序列
2. 结合 `ThreadPool` 的 `close/start` 时序找仍可能重叠的窗口
3. 使用最小复现或 trace 版重复启停脚本抓崩溃前最后动作
4. 只做基于证据的收口修改，不扩大改造面

## 过程记录

### 初始状态

- 新文件创建，用于持续追加本轮排故结论
- 当前代码状态仍保留：
  - 主线程 `drainDeferredVmTeardown()`
  - worker 显式 `VmInstance`
  - 启动并发/节流/冷却相关辅助机制

### 新增最小复现：纯 start/close 探针

本轮新增了一个不跑业务任务的最小复现脚本：

- `work/repro-threadpool-close-start.js`

复现方式：

- `ThreadPool size=12`
- 只做 `start() -> close()` 循环
- 不提交任何签名任务

结果：

- 当前版本无需 `h5st.js`、无需真实任务执行，也能在第 `4` 轮左右稳定 `SIGSEGV`

这一步把问题进一步收缩为：

- 不是业务执行路径
- 不是慢窗口塌陷残留
- 而是纯 `VmInstance` 生命周期 / isolate 重建链条本身就会累计出错

### 新增 gdb 结论

直接对最小复现脚本跑 `gdb` 后，崩溃栈再次落在：

- `v8::Isolate::Initialize()`
- 调用链：`v8::Isolate::New()` -> `leapvm::VmInstance::VmInstance()` -> `VmInstanceWrapper::VmInstanceWrapper()`

并且崩溃发生在：

- `cycle 3 close` 已完成
- 主线程 `drainDeferredVmTeardown()` 已完成
- `cycle 4 start` 新 worker 创建到中途时

这说明当前最强结论是：

- 第一嫌疑已不是“drain 与 ctor 并发”
- 更像“旧 VM 虽然已经析构完，但某些进程级 V8/Platform 状态仍未回到可安全继续批量新建 isolate 的状态”

### 新增对照实验

#### 1. 平台线程数下探

对最小复现加：

- `LEAPVM_PLATFORM_WORKER_THREADS=1`

结果：

- 仍然崩溃，而且可在更早轮次触发

结论：

- `DefaultPlatform` 后台线程数不是唯一根因

#### 2. 关闭 bundle code cache

对最小复现加：

- `LEAPVM_DISABLE_BUNDLE_CODE_CACHE=1`

结果：

- 仍然在第 `4` 轮前后崩溃

结论：

- 主线程 `createCodeCache/default_vm` 路径不是纯生命周期崩溃的唯一触发点

#### 3. 增加 restart cooldown

对最小复现加：

- `LEAPVM_THREADPOOL_RESTART_COOLDOWN_MS=2000`

结果：

- 仍然在第 `4` 轮前后崩溃

结论：

- 不是简单“多等一会儿旧尾巴沉底”就能解决

#### 4. graceful close 对照

最小复现改为：

- `pool.close({ forceTerminate: false })`

结果：

- worker 能正常 `code=0` 退出
- 但同样会在后续第 `4` 轮 `start` 中崩在 `Isolate::Initialize()`

结论：

- 问题不只在默认 `forceTerminate` 路径
- `force` 与 `graceful` 最终都收敛到相同的原生重建崩溃

### 尝试过但已回退

本轮做过一个针对性诊断改动：

- 将 `LeapForegroundTaskRunner` 的 delayed callback 从强引用 `shared_from_this()` 改为 `weak_ptr`

结果：

- 纯 `start/close` 探针反而从第 `4` 轮前后提前到第 `3` 轮崩溃

处理：

- 已回退，不保留该改动

当前含义：

- “dead runner 被 delayed task 续命”不是单独改这一刀就能解决的主根因

## 本轮阶段性结论

截至当前记录点，新增的最硬结论是：

1. 剩余问题已经和 `h5st`/业务任务执行脱钩，纯 `ThreadPool start/close` 就能稳定复现
2. 崩点仍然稳定落在新一轮 `v8::Isolate::Initialize()`
3. `forceTerminate` / `graceful`、`bundle code cache`、`restart cooldown`、平台 worker 线程数都不是决定性开关
4. 当前最值得继续怀疑的是：
   - `VmInstance` 析构虽然形式上完成，但 V8/Platform 进程级状态没有真正 quiesce
   - 或者 `VmInstance` 被迁移到主线程做 deferred teardown 本身仍带有线程归属/尾任务收口问题

## 新增对照：Node 源码与当前 VmInstance 的关键差异

本轮补对了 Node `v20.20.0` 的官方源码，重点参考：

- `src/node_platform.cc`
- `src/node_platform.h`
- `src/env.cc`

对照后，当前 `VmInstance` 与 Node 在三个关键点上差异非常大。

### 1. 前台任务 flushing 模型不同

Node 的做法：

- `PerIsolatePlatformData::FlushForegroundTasksInternal()` 先把当前批次前台任务整体搬到一个局部队列
- 本轮 flush 只处理这一批
- flush 过程中新增的任务留到下一轮

这样可以避免：

- 任务在 flush 中递归扩散
- stop/shutdown 边界被“新任务继续涌入”破坏

当前 `VmInstance` 的做法：

- VM 线程主循环直接从 `task_queue_` 取一个、执行一个
- 每个任务执行后立刻 `DrainPlatformTasks()`
- 本质上是一个简单的“单队列 + 边执行边回投”模型

含义：

- 这类模型在低复杂度场景能工作
- 但在 close/start、inspector、平台回投叠加时，很容易让“当前轮次正在 flush 的任务”和“新产生的前台任务”交织

### 2. delayed task 调度模型不同

Node 的做法：

- 前台 delayed task 挂到 `uv_timer_t`
- 到点后只把任务重新送回前台队列
- owner/foreground 线程本身不会为了等 timer 而 `sleep_for()`
- shutdown 时 `DelayedTaskScheduler::Stop()` 会显式把所有 timer 拿下来并关闭

当前 `VmInstance` 的做法有两层差异：

- `RunLoopOnce()` 里仍有“owner thread 为 timer 直接 `sleep_for()`”的模型
- `LeapDelayedTaskScheduler` 自己有后台线程，但没有 isolate 级取消机制；它只是在 runner 已经失效后，等 callback 真正执行时才发现 owner 没了

含义：

- 当前队列/定时器模型仍然比 Node 粗糙
- 即使 stale timer bug 已经修掉，延迟任务与 stop/shutdown 的边界仍然不够硬

### 3. shutdown / cleanup 协议不同

Node 的做法更像“阶段化清场”：

- 先 `ClosePerEnvHandles()`
- 再 `CleanupHandles()`
- 然后持续循环：
  - 跑 cleanup hooks
  - drain cleanup queue
  - 再次 `CleanupHandles()`
- 直到 handle、cleanup hook、native immediate 全部归零

当前 `VmInstance` 的析构更像：

- `PrepareIsolateForShutdown()`
- 停止接任务
- `StopVmThread()`
- `DrainPlatformTasks()` 两次
- `LowMemoryNotification()`
- `UnregisterFromPlatform()`
- `Dispose()`

含义：

- 当前实现是“步骤齐全，但 quiesce 证据不足”
- 它更像“假设 drain 两次差不多够了”，而不是像 Node 那样循环到所有 cleanup / handle / immediate 都真正见底

### 4. Inspector/辅助线程入口也更脆弱

Node 把 foreground task、cleanup、immediate、timer 都挂在更统一的 loop/handle 模型上。

当前 `VmInstance` 则同时存在：

- `task_queue_`
- `timer_queue_`
- `LeapForegroundTaskRunner`
- `LeapDelayedTaskScheduler`
- `WaitForAndProcessOneTask()` 这种 legacy 入口

含义：

- 路径数偏多
- 每条路径各自看都能工作，但 stop/shutdown 时很难保证“所有入口都遵守同一套停机协议”

## 基于 Node 对照后的新方向

这轮对照之后，后续不应该再泛泛地“继续看平台”了，而应该聚焦下面几条具体方向。

### 方向 A：把前台任务 flush 改成批次模型

目标：

- 不再让 VM 线程边执行边直接消费一个共享主队列
- 改成每轮先搬走当前批次，再执行这一批
- 执行过程中新增的任务留到下一轮

理由：

- 这是当前最接近 Node `FlushForegroundTasksInternal()` 的低风险改造
- 能先把 shutdown 边界和回投边界做硬

### 方向 B：给 delayed task 增加 isolate 级显式取消

目标：

- 不是等 callback 执行时才发现 runner dead
- 而是在 isolate shutdown / unregister 时，把属于该 isolate 的 delayed task 从 scheduler 中显式撤销

理由：

- Node 的 delayed task 是 handle 化、可 stop 的
- 当前 `LeapDelayedTaskScheduler` 还没有这层能力

### 方向 C：把析构从“固定两次 drain”改成“循环 quiesce”

目标：

- 在 `Dispose()` 前引入一个真正的 quiesce 循环
- 依据至少这些量判断是否还能继续 drain：
  - isolate 前台 pending
  - 全局 delayed task 数
  - 后台 pending
  - 本轮 drain 是否仍有 work
- 达到清零或超时后再进入 `Dispose()`

理由：

- 当前崩点长期稳定在下一轮 `Isolate::Initialize()`
- 很像前一轮的某些平台/cleanup 状态还没真正见底

### 方向 D：收拢 legacy 入口

目标：

- 重新审 `WaitForAndProcessOneTask()`
- 尽量不要让 inspector/外部线程再直接碰同一份 `task_queue_`
- 统一到与 VM owner thread 一致的前台任务协议

理由：

- 当前这条路径仍然会直接 drain 后备平台并消费主任务队列
- 对 stop/shutdown 协议来说，它是额外的边界复杂度

## 新尝试：直接移植 Node 式“批次 flush”前台队列

本轮按 Node `FlushForegroundTasksInternal()` 的思路，做过一轮最直接的本地化尝试：

- VM owner thread 主循环不再“取一个跑一个”
- 改成每轮先把当前 `task_queue_` 整包 swap 到局部队列，再只处理这一批
- `WaitForAndProcessOneTask()` 也同步改成同样的批次语义

预期目的：

- 把“本轮正在 flush 的任务”与“flush 中新投递的任务”分离
- 先把前台任务协议做成更接近 Node 的边界

### 结果

最小纯生命周期探针没有改善，反而更早回归：

- 原先大多在第 `4` 轮前后崩
- 这轮改动后，`start/close` 最小复现提前到第 `2` 轮左右崩溃

### 处理

- 已回退，不保留该改动

### 含义

这次结果本身很重要：

- 不能只把 Node 的“批次 flush 表层模式”单独搬过来
- Node 的前台批次 flush 之所以成立，是建立在：
  - `uv_async`/`uv_timer_t` 驱动
  - delayed task handle 化
  - cleanup/close 循环
  - isolate unregister 之后的完整 shutdown 协议
    这些配套机制之上

当前 LeapVM 的 `VmInstance` 还没有这些配套层，所以只搬一个“批次 flush”壳子，会打乱现有时序，甚至把 crash 提前。

结论：

- 方向本身不是错
- 但需要更成体系地一起改，不能再用“只拍一刀队列”这种方式推进

## 新尝试：给 delayed foreground task 增加 isolate 级显式取消

本轮补了 Node 风格基础设施里更低风险的一层：

- `LeapDelayedTaskScheduler::Schedule()` 改为返回 `TaskId`
- 新增 `LeapDelayedTaskScheduler::Cancel(TaskId)`
- scheduler 内部新增 `scheduled_task_ids_` / `canceled_task_ids_`
- `LeapForegroundTaskRunner` 现在会记录自己挂出去的 delayed foreground task
- `Deactivate()` 时显式取消这批 delayed task，而不是等 callback 到点后才发现 owner 已失效
- 平台 metrics 同步补了 `OnDelayedTaskCanceled()`

这次改动的目标不是直接“修好崩溃”，而是先把 delayed task 生命周期补成更接近 Node 的 stop/cancel 协议。

### 回归结果

对最小复现 `work/repro-threadpool-close-start.js` 连跑两次：

- 一次在第 `2` 轮前后崩溃
- 一次仍然在第 `4` 轮前后崩溃

结论：

- 当前还看不出它对纯 `start/close` 崩溃有明确改善
- 但这层能力本身是合理补齐，先保留
- 现阶段更准确的表述是：
  - delayed task 的 isolate 级 cancel 机制已经补上
  - 但它还没有形成“足以解释并修复当前 close/start 崩溃”的证据

## 新尝试：析构阶段引入平台 quiesce 循环

本轮把 `VmInstance::~VmInstance()` 中原先“固定两次 `DrainPlatformTasks()`”的做法，改成了显式 quiesce helper：

- 在 `LowMemoryNotification()` 之后循环 `DrainPlatformTasks(kDoNotWait)`
- 每轮读取当前 isolate 的平台快照
- 只有在连续多轮满足下面条件时才认为平台已 quiesce：
  - 本轮 `drained == 0`
  - `pending_foreground_tasks == 0`
- 否则继续 drain，直到超时

目标：

- 不再假设“drain 两次差不多够了”
- 而是给 `Dispose()` 前的平台收口一个明确判据

### 回归结果

最小复现脚本仍然会在 `cycle 2` 附近触发 `SIGSEGV`，未见稳定改善。

更关键的是，析构日志显示每个 `VmInstance` 在析构时都很快得到：

- `platform quiesced drained=0 idle_rounds=3`

结论：

- 当前这条 close/start 崩溃，至少不是“还有一批前台平台任务没 pump 干净”这种简单情形
- 当前 quiesce helper 没有提供新的正向改善信号

当前推断：

- 这一步会明显削弱“前台平台消息没 drain 干净”这条假设
- 下一层更值得怀疑的是：
  - `VmInstance` 被延迟到主线程统一析构这件事本身，可能与创建线程/原始环境的线程归属不一致
  - 或者 `Dispose()` 前看起来前台平台队列为空，但 V8 进程级状态仍有别的未显式可见尾巴

## 新证据：VmInstance 存在稳定的跨线程析构

为了把“线程归属不一致”从推断变成硬证据，本轮给 `VmInstance` 和 `VmInstanceWrapper` 补了线程埋点：

- `VmInstance` 记录：
  - creator thread
  - VM thread
  - destructor thread
- `VmInstanceWrapper` 记录：
  - env cleanup thread
  - deferred teardown enqueue/drain thread

使用：

- `LEAPVM_TRACE_VM_THREAD_AFFINITY=1`
- `LEAPVM_TRACE_VM_WRAPPER_TEARDOWN=1`

对最小复现 `work/repro-threadpool-close-start.js` 跑 trace 后，证据非常明确：

- `VmInstanceWrapper`/`VmInstance` 都是在 worker 线程创建
- 每个 `VmInstance` 自己还有单独 VM thread
- `OnEnvCleanup()` 运行在线程池 worker 上，而且它的 thread id 与 `VmInstance` creator thread 一致
- 但 `DrainDeferredVmTeardown()` 总是在主线程执行
- 最终每个 `VmInstance::~VmInstance()` 都在主线程执行，且日志稳定显示：
  - `same_as_creator=0`

也就是说，当前实际线程模型是：

- worker 线程创建 VM
- 独立 VM thread 运行 isolate/context
- worker env cleanup 把 VM 移交给 deferred teardown 队列
- 主线程统一析构所有 VM

这一步把一个关键猜测坐实了：

- 当前 close/start 崩溃里，`VmInstance` 确实存在系统性的“创建在线程 A，析构在线程 B”

## 新实验：在 env cleanup 原线程直接串行析构 VM

为了验证“跨线程析构”到底是不是主因之一，本轮又加了一个仅用于实验的开关：

- `LEAPVM_DIRECT_VM_TEARDOWN_ON_ENV_CLEANUP=1`

行为：

- 不再把 `vm_` 丢到 deferred teardown 队列
- 改为在 `OnEnvCleanup()` 所在线程直接 `reset()`
- 仍然通过 `g_vm_wrapper_lifecycle_mutex` 串行化，避免多 worker 同时原生析构

### 实验结果

#### 1. trace 模式，`LEAP_REPRO_REPEATS=4`

结果：

- 最小复现完整跑过 `cycle 4`
- 进程正常退出，没有再像默认路径那样在 `cycle 2~4` 之间崩掉

而且线程日志也变成了：

- `VmInstance::~VmInstance()` 的 `destroy_tid == creator_tid`
- 日志稳定显示：
  - `same_as_creator=1`

这说明：

- 这条实验路径确实成功消除了“主线程代析构”这一现象
- 并且对崩溃窗口产生了实质改善

#### 2. 非 trace 模式，`LEAP_REPRO_REPEATS=6`

结果：

- 前 `5` 轮完整通过
- 在第 `6` 轮附近再次触发 `SIGSEGV`

### 含义

这轮实验给出的结论非常强：

1. “跨线程 deferred teardown”不是噪音，而是当前 close/start 崩溃的重要组成部分
2. 只要把析构拉回 env cleanup 原线程，崩溃窗口就会明显后移
3. 但它还不是唯一剩余根因
4. 当前更准确的判断应为：
   - 跨线程析构是主因之一
   - 修掉它能显著改善
   - 但还存在第二层 stop/shutdown 问题，导致长一点的纯生命周期复现仍会在更后面的轮次崩掉

## 当前阶段判断更新

截至这一轮，优先级已经可以重新排序：

### 第一层已基本坐实

- `VmInstance` 不能继续默认走“worker 创建，主线程统一析构”的 deferred teardown 模型

### 第二层仍待继续收口

- 即便回到 env cleanup 原线程析构，`repeat=6` 仍会崩
- 说明剩余问题更可能在：
  - isolate 所在线程 / creator 线程 / VM thread 三者的 stop 协议仍不够严
  - 或者 `Dispose()` 前后仍有更底层的 V8/Platform 状态尾巴没有真正收净

下一步更值得做的是：

- 围绕“同线程析构”继续向默认实现推进，而不是再回到主线程 deferred teardown
- 同时把 `VmInstance::~VmInstance()` 内部的 stop/Dispose 顺序继续细化，重点看 creator thread 与 VM thread 的归属是否还违背 V8 预期

## 新实验：把 shutdown prelude 挪到 VM thread

基于上一轮“同线程析构仍会在更后轮次崩”的结果，本轮继续下探析构内部顺序。

当前 `VmInstance::~VmInstance()` 的原始形态是：

- creator thread 上执行 `PrepareIsolateForShutdown()`
- creator thread 停掉 `vm_thread_`
- creator thread 再做 `LowMemoryNotification()` / `QuiescePlatformForShutdown()`
- creator thread 最终 `Dispose()`

为验证“creator thread 代做 shutdown prelude”是否是第二层根因，本轮增加了实验开关：

- `LEAPVM_SHUTDOWN_PLATFORM_ON_VM_THREAD=1`

行为：

- 在真正停 VM thread 之前
- 先 `PostTask()` 到 VM thread
- 让 VM thread 自己执行：
  - `PrepareIsolateForShutdown()`
  - `LowMemoryNotification()`
  - `QuiescePlatformForShutdown()`
- 然后 creator thread 再走后续停线程/析构流程

### 对照结果

#### 1. 只开 `LEAPVM_SHUTDOWN_PLATFORM_ON_VM_THREAD=1`

对最小复现：

- `LEAP_REPRO_REPEATS=4`：可以完整通过
- `LEAP_REPRO_REPEATS=6`：崩溃大约后移到 `cycle 5` 附近

这说明：

- 单独把 shutdown prelude 挪到 VM thread，并不是纯负收益
- 它看起来也能把 crash 窗口向后推一些

#### 2. 组合实验

同时打开：

- `LEAPVM_DIRECT_VM_TEARDOWN_ON_ENV_CLEANUP=1`
- `LEAPVM_SHUTDOWN_PLATFORM_ON_VM_THREAD=1`

结果：

- 反而在 `cycle 3 start` 左右更早崩溃

### 含义

这轮实验说明两件事。

1. `VM thread shutdown prelude` 不是完全错误方向，它单独跑时也有一定改善。
2. 但它和“env cleanup 原线程直接析构”叠在一起时，会把时序打坏，至少当前实现下两者不兼容。

因此当前优先级可以更明确地排序为：

- 第一优先：`direct env cleanup teardown`
  - 改善最明显
  - 直接打中了“跨线程析构”这个已坐实的问题
- 第二优先：`shutdown prelude on VM thread`
  - 可能有一定帮助
  - 但暂时只能单独看，不能直接和第一优先项机械叠加

## 当前阶段判断再更新

截至这一轮，最有价值的结论是：

1. 当前问题不是单根因，而是至少两层 shutdown 时序问题叠加。
2. 其中最硬、最稳定的一层仍然是：
   - `VmInstance` 被主线程 deferred teardown 跨线程析构
3. 第二层更像是：
   - creator thread、VM thread、平台收尾顺序之间仍有额外敏感窗口
4. 但这第二层目前还不能用“简单把 shutdown prelude 全挪到 VM thread”来直接修穿
5. 现阶段最稳的推进方向仍然是：
   - 先围绕 `direct env cleanup teardown` 继续细化
   - 暂时不要把 `VM thread shutdown prelude` 和它直接捆绑启用

## 新实验：全生命周期串行化 create/destroy

为了验证是否还存在“进程级 V8 生命周期需要更强串行化”的问题，本轮又加了实验开关：

- `LEAPVM_SERIALIZE_VM_LIFECYCLE=1`

行为：

- `VmInstanceWrapper` 构造阶段在 `make_unique<VmInstance>()` 外也拿 `g_vm_wrapper_lifecycle_mutex`
- 也就是把 `VmInstance` 的 create 与前面已存在的 destroy 串到同一把锁下

目的：

- 验证是不是 `Isolate::New()` / `VmInstance::~VmInstance()` 之间还需要更强的全局串行化

### 结果

组合：

- `LEAPVM_DIRECT_VM_TEARDOWN_ON_ENV_CLEANUP=1`
- `LEAPVM_SERIALIZE_VM_LIFECYCLE=1`

对最小复现 `LEAP_REPRO_REPEATS=6`：

- 仍然崩溃
- 而且从日志看，崩溃点大约已经前移到 `cycle 5 start`

结论：

- “把 create 也全串起来”并没有进一步改善
- 这说明剩余问题不太像是简单的 `Isolate create/destroy` 并发互斥不足

## 新实验：只调整 PrepareIsolateForShutdown 的时机

基于上一轮对 shutdown prelude 的观察，本轮又做了更窄的一刀：

- `LEAPVM_PREPARE_SHUTDOWN_AFTER_VM_THREAD=1`

行为：

- 不改线程归属
- 只把 `PrepareIsolateForShutdown()` 从 `StopVmThread()` 之前挪到之后

目的：

- 验证是不是 `PrepareIsolateForShutdown()` 过早发生，和仍在退出中的 VM thread 时序冲突

### 结果

组合：

- `LEAPVM_DIRECT_VM_TEARDOWN_ON_ENV_CLEANUP=1`
- `LEAPVM_PREPARE_SHUTDOWN_AFTER_VM_THREAD=1`

对最小复现 `LEAP_REPRO_REPEATS=6`：

- 同样仍然崩溃
- 日志显示崩溃窗口也大约在 `cycle 5 start`

结论：

- 单改 `PrepareIsolateForShutdown()` 的前后顺序，没有带来优于 `direct teardown only` 的改善

## 当前结论再收敛

截至这一轮，几个方向可以明确排个序：

### 已证明显著有效

- `LEAPVM_DIRECT_VM_TEARDOWN_ON_ENV_CLEANUP=1`
  - 把崩溃窗口从基线的 `cycle 2~4` 明显后移到了 `cycle 6` 左右

### 有一定信号，但不能和主方向直接叠加

- `LEAPVM_SHUTDOWN_PLATFORM_ON_VM_THREAD=1`
  - 单独开时比基线稳一些
  - 但和 `direct teardown` 叠加会明显回退

### 当前可视为低价值或回退方向

- `LEAPVM_SERIALIZE_VM_LIFECYCLE=1`
- `LEAPVM_PREPARE_SHUTDOWN_AFTER_VM_THREAD=1`

它们在当前实验组合里都没有带来更好的结果，反而把 crash 窗口提前到了 `cycle 5 start` 左右。

因此当前最稳妥的判断是：

1. 跨线程析构仍然是最硬的主因之一。
2. 剩余问题暂时不像“再加全局互斥”或“微调 Prepare 时机”就能解决。
3. 下一步更值得继续深挖的是：
   - `Dispose()` / `LowMemoryNotification()` / `QuiescePlatformForShutdown()` 本身和 creator thread / VM thread 的更底层归属关系
   - 而不是继续在 wrapper 层加更粗的串行化

## 重要更新：当前默认基线已连续通过最小 close/start soak

本轮重新回到**当前默认路径**验证，也就是：

- 不开任何实验开关
- 只跑最小复现 `work/repro-threadpool-close-start.js`

结果如下：

- `LEAP_REPRO_REPEATS=6`：完整通过，退出码 `0`
- `LEAP_REPRO_REPEATS=10`：完整通过，退出码 `0`
- `LEAP_REPRO_REPEATS=20`：完整通过，退出码 `0`
- `LEAP_REPRO_REPEATS=30`：完整通过，退出码 `0`

对应日志：

- `work/repro-baseline-current-6.log`
- `work/repro-baseline-current-10.log`
- `work/repro-baseline-current-20.log`
- `work/repro-baseline-current-30.log`

这说明：

- 按当前代码状态，之前“纯 `ThreadPool start()/close()` 在第 2~4 轮附近崩”的最小复现，现阶段已经无法再复现出来

## 关键含义：需要重新修正根因排序

更重要的是，虽然默认基线已经稳定通过，但日志里仍然持续能看到：

- `VmInstance::~VmInstance()` 依旧是 `same_as_creator=0`
- 也就是：
  - `VmInstance` 仍然是 worker 创建
  - 最终仍然由主线程 deferred teardown 析构

换句话说：

- “跨线程析构”这个现象并没有消失
- 但默认最小复现已经不再崩

这会直接推翻之前一个过强的判断：

- 跨线程析构不是“只要存在就必然触发当前这次 close/start 崩溃”

更准确的说法应该是：

- 它仍然是一个高风险生命周期现象
- 也可能解释过为什么某些实验会改变崩溃窗口
- 但它不是这次最小 close/start 崩溃被修掉的唯一决定性条件

## 当前最可能真正修穿问题的改动

结合当前代码状态与通过结果，现阶段最有解释力的默认改动是下面两刀。

### 1. `LeapPlatform::UnregisterIsolate()` 现在会清理 `shutdown_isolates_`

文件：

- `leap-vm/src/leapvm/leap_platform.cc`

当前实现里：

- `RegisterIsolate()` 会先 `shutdown_isolates_.erase(isolate)`
- `UnregisterIsolate()` 也会同步 `shutdown_isolates_.erase(isolate)`

这能修掉一类非常危险的 stale per-isolate 状态：

- 旧 isolate 指针虽然已经失效
- 但其地址仍然残留在 `shutdown_isolates_`
- 当新 isolate 恰好被分配到相同地址时
- `GetForegroundTaskRunner()` 会错误命中“shutdown isolate”分支并返回空 runner

### 2. `Dispose()` 前现在调用了 `v8::platform::NotifyIsolateShutdown()`

文件：

- `leap-vm/src/leapvm/vm_instance.cc`

当前实现里：

- 在 `isolate_->Dispose()` 前
- 会先对 `DefaultPlatform` 调用 `v8::platform::NotifyIsolateShutdown(backend, isolate_)`

这一步的作用是：

- 让 backend `DefaultPlatform` 也同步清理它内部按 isolate 维护的状态
- 避免新 isolate 地址复用时撞上 backend 的 stale per-isolate 条目

## 当前最合理的新判断

截至这一轮，更合理的判断顺序是：

1. 当前这次最小 `close/start` 崩溃，大概率已经被“stale isolate state 清理”这条线修掉了。
2. 最关键的默认改动，很可能就是：
   - `shutdown_isolates_` 清理
   - `NotifyIsolateShutdown()` 清理 backend per-isolate 状态
3. 之前观察到的“direct teardown 能把崩溃窗口后移”，现在更可能说明：
   - 它改变了地址复用与收尾时序
   - 因而影响了 stale isolate state 被撞上的概率
   - 而不一定意味着“跨线程析构本身就是唯一根因”
4. 跨线程析构依旧值得继续关注，但它现在更像：
   - 结构性风险
   - 潜在后续隐患
   - 而不是当前这次最小 close/start 崩溃是否存在的决定性开关

## 当前阶段结论

可以把当前状态总结为：

- `fix-shutdown-isolates-leak.patch.md` 对应的修复思路，在当前代码里已经落地
- 而且从当前最小复现结果看，它现在**很可能确实已经解决了原先那条 close/start 崩溃**
- 但这不等于所有生命周期风险都已经消失
- 至少“worker 创建，主线程 deferred teardown 析构”的结构仍然存在，只是目前没有再触发该最小复现崩溃

## 业务侧 soak 复测：`h5st` 任务下也未再打出 close/start 崩溃

在最小复现连续通过之后，本轮又切回业务侧长跑，直接使用：

- `benchmarks/longevity-runner.js`
- 工作负载：`work/h5st.js`
- backend：`ThreadPool`

优先挑了两档：

### 1. recycle-heavy 档：`maxTasksPerWorker=10`

运行：

```bash
node benchmarks/longevity-runner.js --max-tasks-per-worker 10 --total 1000 --warmup 20 --sample-every 50
```

产物：

- `benchmarks/results/longevity-mtp10-20260308_183613.json`

结果要点：

- `1000` 个业务任务完整跑完
- `warnings=0`
- `recycles=96`
- 没有出现 native crash / `SIGSEGV`
- 结束后正常写出 JSON

这条结果尤其重要，因为：

- `mtp=10` 会非常频繁地触发 worker recycle
- 也就等价于频繁触发 `VmInstance` close/start 链
- 如果 close/start 仍然脆弱，这档最容易重新打出问题

### 2. 中等 recycle 档：`maxTasksPerWorker=50`

运行：

```bash
node benchmarks/longevity-runner.js --max-tasks-per-worker 50 --total 1000 --warmup 20 --sample-every 50
```

产物：

- `benchmarks/results/longevity-mtp50-20260308_183634.json`

结果要点：

- `1000` 个业务任务完整跑完
- `warnings=0`
- `recycles=12`
- 同样没有 native crash / `SIGSEGV`

## 这轮业务侧证据的含义

当前已经有两层证据同时成立：

1. 最小生命周期探针：
   - 默认基线已通过 `repeat=6/10/20/30`
2. 业务侧 `h5st` soak：
   - `mtp=10` 的高频 recycle 场景也完整通过
   - `mtp=50` 的中等 recycle 场景也完整通过

因此当前可以更有把握地说：

- 原先那条 `ThreadPool close/start` 原生崩溃链，至少在当前代码状态下已经被压住
- 而且不仅是“纯生命周期探针不崩”
- 连真实业务负载下频繁 recycle 的 close/start 也没有再打出 native 崩溃

## 为什么现在更像是 stale isolate state 被修掉了

这轮业务侧结果进一步支持了前面的新判断。

原因很简单：

- 如果根因真是“跨线程析构本身必然导致崩溃”
- 那么在业务侧 `mtp=10`、`96` 次 recycle 的过程中，问题大概率会重新出现
- 但实际上没有

与此同时，日志里仍然能稳定看到：

- `same_as_creator=0`

说明：

- 跨线程析构这个现象还在
- 但业务侧频繁 recycle 也没有再崩

所以当前最有解释力的模型仍然是：

- 真正被修掉的是 stale per-isolate 生命周期状态
  - `shutdown_isolates_` 清理
  - `NotifyIsolateShutdown()` 对 backend `DefaultPlatform` 的清理
- `direct teardown` 那些实验之所以会影响窗口，更可能是改变了地址复用/时序碰撞概率
- 而不是因为“只要不是 same-thread destroy 就一定崩”

## 当前可落地结论

到这一步，关于“close/start 崩溃是否已解”的结论已经可以从“高度怀疑已修好”上调为：

- 当前最小复现已稳定通过
- 当前业务侧高频 recycle soak 也已通过
- 因此这条崩溃链在现代码状态下，已经可以视为**基本修复**

后续仍值得继续关注的是：

- 长跑内存曲线本身（尤其 `mtp=10` 下 RSS 仍然明显累积）
- 以及“跨线程析构”这类结构性风险是否会在别的问题上再次冒头

但这些已经不再等同于“当前 close/start native crash 仍未解决”

## 交叉参考

- `manual/maintenance/2026-03-09_Standalone_ExecuteTask收敛.md`
  - 记录后续 standalone 路径中的 `ExecuteTask()` 收敛、最小 native CLI 落地，以及对 `sync-stall` / `off creator thread` 当前口径的整理
