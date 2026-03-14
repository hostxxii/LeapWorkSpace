# 2026-03-08 ThreadPool 同步停顿与重复启停 SIGSEGV 排故过程记录

## 范围说明

本文只整理 `/home/hostxxii/LeapWorkSpace/对话.md` 中“独立 C++ 服务”讨论之前的排故过程，重点记录：

- Linux `ThreadPool` 同步停顿/慢窗口塌陷的定位与修复
- Windows 与 Linux 上 `pool.close() -> pool.start()` 重复启停触发的原生 `SIGSEGV` 排故
- 已验证有效、已验证无效或已回退的修正

不包含后续“改成独立 C++ 服务”的架构评估。

## 问题起点

本轮排故一开始已经有两个明确现象：

- Linux：`ThreadPool 12/48` 会出现秒级同步停顿，历史基线最差约 `p99=3701ms`
- Windows：不是慢窗口，而是在 `pool.close() -> pool.start()` 重复轮次中直接 `segmentation fault`

进一步确认的约束条件：

- `pool >= 5` 开始更容易触发，pool 越大越快崩
- `pool = 4` 跑 `12` 轮 `x 550 tasks` 可以稳定
- `ProcessPool` 不受这类重复启停崩溃影响
- `h5st.js` 与 `synthetic-window-stress.js` 都能触发，说明不只是单脚本问题

## 第一阶段：先把平台改造与构建链路跑通

### 1. 自定义 Platform 骨架落地

先按“Node 式平台分层 + Leap 自己的 owner-thread 治理”搭了可回退的自定义 `v8::Platform` 骨架，核心包括：

- `LeapPlatform`
- `LeapForegroundTaskRunner`
- `LeapBackgroundScheduler`
- `LeapDelayedTaskScheduler`
- `LeapPlatformMetrics`

同时把原先散落在不同位置的 `PumpMessageLoop()` 统一收口，新增平台指标：

- 前台/后台 pending
- delayed task 数量
- pump 次数
- drain 耗时
- overload score

### 2. 构建环境问题清理

排查中确认，早期一轮 `cmake-js` 实际落到了系统 `gcc/g++`，没有使用 V8 文档要求的 `clang/lld/libc++` 工具链，导致 Linux 构建结果不可靠。随后做了两件事：

- 在 `leap-vm/CMakeLists.txt` 中钉死 Linux 下优先使用 V8 clang 工具链；未命中 Clang 直接失败
- `lexbor` 改为优先使用项目内本地源码副本，避免 `_deps/lexbor-src` 残留和 `FetchContent` 不稳定

结果：

- `npx cmake-js compile --CDCMAKE_BUILD_TYPE=Release --out build-native` 可编译通过
- `leapvm.node` 可被 Node 加载
- 最小 smoke test `new VmInstance().runScript('1+2')` 正常

这一步解决的是“构建环境不可信”，不是业务根因。

## 第二阶段：Linux 同步停顿定位到 VmInstance timer/stale queue

### 1. 先用平台指标复跑基线

在平台骨架和指标链路接通后重新压测：

- `synthetic-window-stress.js`：线程池与进程池都偶发慢窗，不再适合作为 thread-only 判别器
- `h5st.js`：仍可复现秒级慢窗，但最差值已从历史约 `3701ms` 降到约 `2164ms`

这一步的重要收获不是“问题消失”，而是新指标开始显影：

- 塌陷轮 `platformMaxDrainMs` 可冲到 `21ms+`
- 但高 `drain` 不必然对应 stall，说明它更像临界信号，不是唯一根因

### 2. 加入慢任务“当下快照”

随后给 `benchmarks/investigate-sync-stall.js` 增加了慢任务即时 `pool.getStats()` 快照，而不是只看 run 结束后的尸检数据。这样能直接看到：

- 慢任务发生瞬间的 `runtimeStats`
- 焦点 worker
- 最热 workers
- 平台聚合状态

### 3. 发现 VmInstance timer 队列累计异常

通过快照与 `VmInstance` 审计，确认了一个真实 bug：

- `vmTimerQueueSize` 明显大于 `vmTimerCount`
- `pendingTimerCount` 已经是 `0`
- 但 C++ 层 `priority_queue` 里还残留大量已取消的 stale timer

更关键的逻辑缺陷在 `RunLoopOnce()`：

- 旧实现是“先看 `due_time`，后看 `canceled`”
- 如果堆顶 timer 早已 `clearTimeout()`，但 `due_time` 还没到，VM owner thread 会白白睡到 deadline

这会直接制造假阻塞。

### 4. 第一轮修复

针对 timer/stale queue 做了三类修正：

- `clearTimeout/clearInterval` 后记录 stale 数量
- stale 累积达到条件后 compact 队列
- `RunLoopOnce()` 改成先弹出 canceled 项，再判断 `due_time`

随后又补了一刀 compact 条件：

- 当 `timers_by_id_` 已经清空时立即 compact
- 不再让十几个 stale 项挂到下一轮

### 5. 验证结果

这组修复后，Linux 同步停顿问题明显缓解并基本消失：

- `synthetic-window-stress` 在原始 `12/48/550` 档位可做到 `slowTasks=0`
- `h5st.js` 复测可达到 `p99=128ms`
- 所有 worker 的 `vmTimerQueueSize=0`
- 所有 worker 的 `vmStaleTimerQueueCount=0`

这一阶段的明确结论：

- `VmInstance` timer/stale queue 确实是一个真实异常累计源
- 它已经被修掉，并且不再是当前主导矛盾
- 但 `VmInstance` 生命周期与平台边界仍然没有完全达到 Node 的一致性标准

## 第三阶段：按 Node 原则收紧 VmInstance 生命周期

在同步停顿收口后，开始对照 Node 的 `node_platform` 设计，重点补了三类一致性问题：

- `PostTask()` 拒收语义与 shutdown gate
- 平台 runner 在销毁前更早停接客
- shutdown 顺序改成更接近“先停接客，再清队列，再停线程”

这一步单轮/短轮验证是正向的，但很快暴露出另一条主问题：

- `repeats=3` 的 close/start 场景仍可快速触发 `SIGSEGV`
- 说明“单轮不塌陷”不等于“重复启停已经稳定”

## 第四阶段：重复启停 SIGSEGV 定位，从 default_vm/unload 继续收缩

### 1. 首个直接嫌疑：thread-worker 的 graceful shutdown 路径

沿 `close/start` 链路排查时，先发现：

- `thread-worker.js` 的 graceful shutdown 仍会调用 `shutdownEnvironment(leapvm)`
- 这和项目里“线程池 worker 在 Windows/Linux 都应避免走完整 VM teardown”这条红线冲突

先后尝试了两类修正：

- worker 关闭默认走更硬的 terminate 策略
- worker 环境默认设置 `LEAPVM_SKIP_VM_TEARDOWN_ON_UNLOAD=1`

短期效果：

- `repeats=3` 可稳定通过
- `h5st` 与 `synthetic-window-stress` 都不再在第 1~3 轮快速崩溃

但长跑结果表明：

- `repeats=6` 仍会在更后面的轮次崩溃
- 所以这条线只能减轻，不是根治

### 2. gdb 抓到关键栈：崩在新建 isolate 的早期

进一步用 `gdb` 抓 native 回溯后，得到一个关键结论：

- 崩点在主线程的 `v8::Isolate::Initialize()`
- 不是 `VmInstance` 析构尾巴直接崩
- 更像是“上一轮平台/线程全局状态没有完全收口，新一轮 isolate 又开始初始化”

据此做了两个方向的收缩：

- 平台后台线程数改成“可配置 + 保守默认”，新增 `LEAPVM_PLATFORM_WORKER_THREADS`
- 修复 `GetForegroundTaskRunner()` 启动期 fallback 被过早切掉的问题，避免 isolate 初始化阶段拿到空 runner

结果：

- 单轮恢复正常
- `repeats=2` 可稳定通过
- 但 `repeats=3` 以后仍可能出现累计崩溃

### 3. bundle code cache 不是唯一根因

随后针对主线程 `createCodeCache/default_vm` 路径做对照：

- 新增 `disableBundleCodeCache` 开关
- 新增默认 VM 生命周期 trace

验证结果：

- 关闭 bundle code cache 后仍然会崩
- 因此 `code cache` 不是唯一触发点

### 4. 发现 worker 线程误走 addon 平级 default_vm 路径

继续顺调用链后确认：

- `initializeEnvironment()` 拿到的是 `require('../leap-vm')` 的平级导出对象
- 后续 `configureHooks()`、`runScript()`、`getRuntimeStats()`、`createCodeCache()` 都可能走 addon 的 `default_vm`
- 这导致每个 worker 线程都可能依赖 `AddonData.default_vm`

针对这条线做了一个实质性修正：

- `runner.initializeEnvironment()` 改成显式 `new leapvm.VmInstance()`
- worker 不再依赖 addon 的隐式 `default_vm` 单例

效果：

- worker 侧隐式 `default_vm` 基本被切掉
- 但长跑仍会在更后轮次出现 crash，说明这也不是最终根因

## 第五阶段：把旧 VM 回收从 worker ctor 挪到主线程显式阶段

trace 继续显示一个更直接的问题：

- 旧 worker 的 `VmInstance` 被放进延迟回收队列
- 新一轮启动时，worker ctor 里还在顺手 drain 这批旧 VM
- 形成“旧 VM 正在析构，新 VM 已并发创建”的明显竞争窗口

据此调整为严格阶段化回收：

- addon 新导出 `drainDeferredVmTeardown()`
- `VmInstanceWrapper` 不再在 worker ctor 里主动 drain
- `ThreadPool.close()` 完成后由主线程统一 drain
- `ThreadPool.start()` 前再做一次兜底 drain

这一步的效果是本轮排故里最明确的一次改善：

- `repeats=3` 稳定通过
- trace 能证明 drain 已从 worker ctor 移到主线程 close/start 阶段
- 长跑崩溃轮次从早期 `run1/run2` 明显后移到 `run3/run4`

结论：

- “主线程显式 drain 旧 VM”方向有效
- 但旧 VM 真正析构完成时，内部仍有一部分 V8/平台尾巴没有完全沉底

## 第六阶段：尝试过但最终回退的方向

以下方向做过实验，但已确认要么无效，要么会引入回归，因此没有保留为最终状态：

- 直接把 `PumpMessageLoop` 更彻底切到自定义 `LeapPlatform`
  - 会更快触发崩溃或 mutex/segfault 回归
- 弱化 delayed runner 生命周期
  - 会把早期 stall 带回来
- 让 worker 直接主动 `shutdownEnvironment()` 做完整销毁
  - 会把 `repeats=3` 打回快速崩溃
- 仅靠关闭 bundle code cache 解决 close/start crash
  - 对照已证明无效

这些回退项的意义是：

- 当前剩余问题不是“继续多拍几刀平台配置”就能消失
- 必须围绕真实的 native 生命周期竞争继续收缩

## 第七阶段：启动并发、节流、冷却窗口的辅助实验

为了验证“是否是批量重建节拍过猛”导致的竞态，还做过几类辅助实验：

- `ThreadPool.start()` 启动并发收窄，Linux 默认串行启动
- worker 启动间插入轻微 stagger
- `close()` 与下一轮 `start()` 之间增加 restart cooldown

这些实验的结论比较一致：

- 说明“批量重建竞争”确实是问题的一部分
- 但只能改变崩溃出现的轮次和时间窗口
- 不能根治

同时也再次证明：

- 当前剩余问题已经更像纯 close/start 生命周期竞争
- 不再是执行期平台压力或同步停顿主导

## 本轮最终状态

到“独立 C++ 服务”讨论开始前，排故已经收口到下面这些结论：

### 已经明确解决的部分

- Linux 侧早期“慢窗口塌陷”已基本不再复现
- `VmInstance` timer/stale queue 是真实 bug，已修复并验证生效
- worker 对 addon 隐式 `default_vm` 的依赖已经显著减弱
- 旧 VM 真正回收已从 worker ctor 挪到主线程显式阶段

### 尚未完全解决的部分

- `ThreadPool close/start` 长跑仍可能在 `run3/run4` 以后触发原生 `SIGSEGV`
- 剩余根因更像：
  - 旧 `VmInstance` 析构尾巴仍有 V8/平台后台状态未彻底收口
  - 新一轮 worker/isolate 初始化又过早开始

### 当时的最优工作版本

当轮排故给出的相对最优组合是：

- 去掉 worker 对 `default_vm` 的隐式依赖
- 主线程在 `close()/start()` 之间显式 `drainDeferredVmTeardown()`
- Linux 下保留启动串行化/轻微节流
- 不继续碰会直接引入回归的 `PumpMessageLoop`/激进平台边界改动

## 建议的后续切入点

若后续继续沿这条线排故，优先级应当是：

1. 只围绕 `VmInstance::~VmInstance()` 最后的收口阶段加更细 native trace
2. 重点核对 `PrepareIsolateForShutdown -> StopVmThread -> DrainPlatformTasks -> UnregisterFromPlatform -> isolate->Dispose()` 这一串是否还有后台尾巴
3. 继续把“旧 VM 完全收口”与“新 VM 开始创建”做成更严格、可观测的两阶段

不建议回到以下方向继续发散：

- 再次尝试 worker 内主动完整 shutdown
- 仅靠调平台线程数/overload score 阈值解决 close/start 崩溃
- 在证据不足时继续扩大平台结构改造面

## 相关结果与线索文件

本轮对话中反复引用或产出的关键文件包括：

- `benchmarks/results/sync-stall-thread-20260308_110739.json`
- `benchmarks/results/sync-stall-process-20260308_110845.json`
- `benchmarks/results/sync-stall-thread-20260308_111002.json`
- `benchmarks/results/sync-stall-thread-20260308_112149.json`
- `benchmarks/results/sync-stall-thread-20260308_112212.json`
- `benchmarks/results/sync-stall-thread-20260308_113022.json`
- `benchmarks/results/sync-stall-thread-20260308_113247.json`
- `tips.md`
- `对话.md`

