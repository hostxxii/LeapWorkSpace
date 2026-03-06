# Leap 性能优化路线图（2026-03-06）

## 1. 决策摘要

- 短跑主因：当前默认基线下，主要瓶颈已经是 CPU 饱和的核心执行路径，不是初始化重复，也不是热点 JS Cache 缺失。
- 长跑主因：`ThreadPool` worker 生命周期没有闭环，`shutdownEnvironment()` 被绕过，加上 timeout/force-kill 打断 cleanup，导致 native / DOM / Window 状态在 worker 生命周期内累积。
- 当前结论：先修生命周期闭环，再谈吞吐优化；在 P0 未完成前，不要把 `ThreadPool + maxTasksPerWorker>=200` 当最终可用配置。

## 2. 三组实验对比

说明：C1、C2 分别使用各自控制组的 3 次中位 run 做比较，因此“基线”数值不是同一批运行的共享样本；决策时应看各实验相对变化，而不是横向混比绝对值。

| 指标 | 基线 | C1(减观测) | C2(减桥接) | C3(减初始化) |
|---|---:|---:|---:|---:|
| req/s | `110.23 / 105.06` | `114.34` `(+3.73%)` | `105.37` `(+0.30%)` | 跳过，当前已复用 |
| p99 (ms) | `147 / 157` | `148` `(0.68%)` | `164` `(+4.46%)` | 跳过，当前已复用 |
| CPU% peak | `98.90 / 97.69` | `97.65` `(-1.26%)` | `98.23` `(+0.55%)` | 跳过，当前已复用 |
| RSS peak (MB) | `2620.27 / 2599.60` | `2606.75` `(-0.52%)` | `2604.59` `(+0.19%)` | 跳过，当前已复用 |

实验结论：

- C1 有小幅正收益，但量级只有 `+3%~4%`，说明默认基线里的“基础观测”不是主瓶颈。
- C2 基本没有收益，且对 p99 没有稳定改善，不支持把“热点 getter/method JS 缓存”列为前线方案。
- C3 无需继续做，worker 内多任务已经复用同一 `VmInstance/Isolate/Context`，初始化重复不是当前主因。

## 3. 决策矩阵

| 方向 | 数据判断 | 结论 |
|---|---|---|
| C1 减观测 | `req/s +3.73%`，RSS 基本不变 | 可做，但只应作为次级优化项 |
| C2 减桥接 | `req/s +0.30%`，p99 反而变差 | 不应优先投入 |
| C3 减初始化 | 已确认任务间复用同一 Context | 不需要单列优化方向 |
| 长跑生命周期修复 | `maxTasksPerWorker>=200` 时 RSS 升到 `5.8~5.9GB`，p99 恶化到 `4~5.6s` | 必须优先处理 |

## 4. 短跑与长跑结论

### 4.1 短跑瓶颈的主要原因

一句话结论：默认 `debug=false` 基线下，短跑上限主要受 CPU 饱和的核心 dispatch/脚本执行路径约束，观测链路只是次级成本，桥接缓存和初始化复用都不是主矛盾。

数据支撑：

- 基线压测里 CPU 峰值稳定在 `97%~99%`。
- C1 关闭更多观测路径后，吞吐只提升 `3.73%`。
- C2 对热点 API 加任务级缓存后，吞吐只提升 `0.30%`，p99 还变差。
- 第 3 次报告显示 `full(debug=true)` 相比 `minimal` 稳态吞吐下降 `18.31%`，说明 Hook/Monitor/Inspector 只有在 full/debug 模式下才是明显大头，不代表当前默认基线。

### 4.2 长跑退化的主要原因

一句话结论：长跑退化主要由 worker 生命周期失配引起，即 ThreadPool recycle 绕过 native shutdown，加上 timeout/force-kill 打断 cleanup，导致 native 资源和任务级残留在 worker 生命周期内持续累积。

数据支撑：

- 长跑矩阵中，`maxTasksPerWorker` 从 `25` 增到 `200/500/1000` 后，recycle 几乎消失，`peak RSS` 升到 `5901.56 / 5910.50 / 5845.25 MB`，同时 p99 恶化到 `4279 / 3315 / 5628 ms`。
- RSS 大幅上涨时，`heapUsed/external/arrayBuffers` 没有同步上涨，指向 native / isolate 侧累积，而不是普通 JS heap 泄漏。
- 生命周期审计已确认 [thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js) 的正常退出路径会绕过 `shutdownEnvironment()`，而 [worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/worker.js) 的进程池路径会执行它。
- 审计还确认 `Window` 级状态和 DOM cleanup 依赖任务 `finally` 或 worker shutdown；timeout/force-kill 会把这条释放链打断。

## 5. 推荐行动项

| 优先级 | 行动项 | 预期收益 | 复杂度 | 依据 |
|---|---|---|---|---|
| P0 | 在 [thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js) 的 `finalizeExit()` 周围补 `safeShutdownEnvironment()`，并让 [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js) 的 `_recycleWorker()` 等待 `shutdown_ack`/`exit` | 长跑 RSS 明显回落，避免 `5.8~5.9GB` 平台；恢复高 `maxTasksPerWorker` 可用性 | 高 | 长跑矩阵 + 第 5/6 次审计 |
| P0 | 收口 [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js) 的 timeout/terminate 路径，新增统一 `_beginTerminateWorker()`，timeout 后 worker 不再复用 | 避免 cleanup 被截断后脏 worker 回池，降低长跑 p99 崩塌概率 | 中 | 生命周期审计 + fix-plan |
| P1 | 在 [Window.impl.js](/home/hostxxii/LeapWorkSpace/leap-env/src/impl/Window.impl.js) 新增 `resetWindowTaskState()`，并在 [signature-task.instance.js](/home/hostxxii/LeapWorkSpace/leap-env/src/instance/signature-task.instance.js) 的 `resetSignatureTaskState()` 调用 | 清掉 listener/RAF/window.name/status/opener 残留，降低跨任务污染和隐性累积 | 低 | 第 5/6 次审计 |
| P1 | 让 [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js) 的 `_forceKillWorker()` 幂等化，合并 heartbeat/recycle/close 的强杀入口 | 消除重复 terminate 和潜在监听器堆积，降低 warning 和异常终止噪声 | 低 | 审计发现 + `MaxListenersExceededWarning` 线索 |
| P2 | 拆分 [runner.js](/home/hostxxii/LeapWorkSpace/leap-env/runner.js) 的 debug 开关，避免默认 benchmark 隐式带上 Inspector/Hook 常驻能力 | 默认基线再拿 `+3%~5%` 左右空间；debug/full 模式可减少 `18%~45%` 扰动 | 中 | 第 3 次 Hook 影响评估 + C1 |

执行建议：

- 修复完成前的运行策略，优先选 `ProcessPool`，或把 `ThreadPool` 的 `maxTasksPerWorker` 暂时压在 `25` 左右。
- 每完成一个 P0/P1 项，就用 `benchmarks/longevity-runner.js` 复跑 `100/200/500/1000` 四档验证，不要只看短跑 500-task 基线。

## 5.1 本次进展

- 已完成 P0 第一段：
  - [thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js) 已恢复 graceful shutdown
  - [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js) 已识别 `shutdown_ack`
  - `mtp=100/200` 长跑数据已有明显改善
- 已完成 P0 第二段的主骨架：
  - [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js#L628) 已新增统一 `_beginTerminateWorker()`
  - `pool shutdown / close timeout / init timeout / task timeout / dispatch failure / heartbeat timeout` 已统一走同一 terminate 状态机
  - worker state 已补 `terminateReason / terminateMode / terminateRequestedAt / cleanupSkipped`
- 已验证 Window 级 reset 功能正确，但当前不作为下一轮主线，因为它对 `mtp=500/1000` 的高驻留长跑退化不是决定性收益项

## 5.2 下轮执行方案

下一轮不要再扩散改动面，聚焦“把活跃 worker 内残留看清楚”：

1. 在 [worker-common.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/worker-common.js)、[thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js) 和 [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js) 增加更细的 runtime stats
   - `windowListenerCount`
   - `rafCount`
   - `activeDocs`
   - `activeTasks`
   - `terminateReason`
   - `cleanupSkipped`
2. 让 benchmark JSON 持久化这些指标，避免只在 CLI 日志里出现
3. 重跑三档长跑验证：
   - `mtp=200`
   - `mtp=500`
   - `mtp=1000`
4. 根据采样结果决定下一步：
   - 如果 `activeDocs/activeTasks` 持续非零，继续加大 task-scope cleanup/recycle 收口
   - 如果 DOM 指标干净但 RSS 仍涨，进一步怀疑 isolate/native 侧常驻状态或 timer/bridge 残留

## 6. 不推荐做的事

- 不要继续投入“热点 API 的 JS 侧实验缓存”作为主线。C2 已显示它对当前 workload 几乎没有收益。
- 不要再花时间证明“初始化是否已复用”。C3 已确认这件事不是瓶颈，继续实验只会重复已有结论。
- 不要在 P0 修好前继续把 `ThreadPool + 高 maxTasksPerWorker` 的长跑结果当成“正常容量上限”。
- 不要直接做大面积 API 下沉或全量 bridge 改造。当前数据不支持这是 ROI 最高的方向。

## 7. 相关产物

- C1 报告：[experiment-c1-reduce-observe-20260306_200158.md](/home/hostxxii/LeapWorkSpace/benchmarks/report/experiment-c1-reduce-observe-20260306_200158.md)
- C2 报告：[experiment-c2-reduce-bridge-20260306_200318.md](/home/hostxxii/LeapWorkSpace/benchmarks/report/experiment-c2-reduce-bridge-20260306_200318.md)
- C3 报告：[experiment-c3-reduce-init-20260306_200428.md](/home/hostxxii/LeapWorkSpace/benchmarks/report/experiment-c3-reduce-init-20260306_200428.md)
- 长跑报告：[H5ST_LONGEVITY_REPRO_REPORT_20260306.md](/home/hostxxii/LeapWorkSpace/benchmarks/report/H5ST_LONGEVITY_REPRO_REPORT_20260306.md)
- P0 验证报告：[P0_VALIDATION_REPORT_20260306.md](/home/hostxxii/LeapWorkSpace/benchmarks/report/P0_VALIDATION_REPORT_20260306.md)
- 生命周期修复方案：[fix-plan.md](/home/hostxxii/LeapWorkSpace/benchmarks/report/fix-plan.md)
