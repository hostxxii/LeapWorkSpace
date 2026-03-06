# P0 修复验证报告（2026-03-06）

## 1. 本轮改动

- 在线程 worker 退出路径恢复 graceful shutdown：
  - [thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js)
  - 增加 `safeShutdownEnvironment()`，shutdown 时先执行 `releaseAllScopes`，再调用 `shutdownEnvironment()`
  - worker 回传 `shutdown_ack`，不再直接裸 `process.exit()`
- 在线程池增加 terminate 状态机：
  - [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js)
  - 增加 `terminating / terminatingHard / terminateReason / terminateMode / cleanupSkipped`
  - `_recycleWorker()`、`_forceKillWorker()` 幂等化
  - 识别 `shutdown_ack`，shutdown 后短暂等待 `exit`
- 在线程池继续收口 terminate 入口：
  - [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js#L628)
  - 新增统一 `_beginTerminateWorker()`
  - `pool shutdown / close timeout / init timeout / task timeout / dispatch failure / heartbeat timeout` 全部纳入同一 helper
  - worker exit 日志现可带出 `terminateReason / terminateMode / terminateRequestedAt / cleanupSkipped / runtimeStats / memoryUsage`
- 收紧 post-task cleanup 触发 recycle 条件：
  - [worker-common.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/worker-common.js)
  - 只要 `cleanupError`、`activeDocs > 0`、`activeTasks > 0` 就直接标记 `shouldRecycle`
- 增加 Window 级任务 reset：
  - [Window.impl.js](/home/hostxxii/LeapWorkSpace/leap-env/src/impl/Window.impl.js)
  - [signature-task.instance.js](/home/hostxxii/LeapWorkSpace/leap-env/src/instance/signature-task.instance.js)
  - 清理 `_windowListeners`、`_rafMap`、`window.name/status/opener`
- 重要：运行时实际加载的是 [leap.bundle.js](/home/hostxxii/LeapWorkSpace/leap-env/src/build/dist/leap.bundle.js)，不是 `src/impl/*.js` 直接执行。
  - 本轮中途确认这点后，已执行 `npm run build`
  - 在重建 bundle 之前，Window reset 改动并不会进入实际 benchmark

## 2. 功能回归

### 2.1 线程池 recycle/shutdown 冒烟

- 小规模 `perf-baseline-runner` 已通过
- 极端 `maxTasksPerWorker=1` 冒烟已通过
- 结果里能看到 `recycled=28`、`respawned=27`
- 说明 `shutdown_ack -> exit -> respawn` 主链没有卡死
- timeout smoke 已通过
  - 单个超时任务后，旧 worker 被 force terminate
  - 新 worker 正常补位
  - 结果能看到 `timedOut=1`、`respawned=1`
  - 说明统一 terminate helper 没把 timeout/respawn 路径打坏

### 2.2 Window reset 回归

同一 `VmInstance` 内连续执行两次任务：

- 第 1 任务设置：
  - `window.name = 'persist-me'`
  - `window.status = 'busy'`
  - `window.opener = { leaked: true }`
  - 注册 `window.addEventListener('probe', ...)`
  - 调用 `requestAnimationFrame()`
- 第 2 任务观测结果：
  - `window.name === ''`
  - `window.status === ''`
  - `!!window.opener === false`
  - 旧 listener 不再触发

结论：Window 级任务 reset 已实际生效。

## 3. 长跑复验结果

对比基线使用第 4/6 步旧矩阵；本轮复验结果文件：

- [longevity-mtp100-20260306_201602.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp100-20260306_201602.json)
- [longevity-mtp200-20260306_201633.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp200-20260306_201633.json)
- [longevity-mtp500-20260306_202454.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp500-20260306_202454.json)
- [longevity-mtp1000-20260306_202555.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp1000-20260306_202555.json)

| mtp | 旧 req/s | 新 req/s | 变化 | 旧 p99 | 新 p99 | 变化 | 旧 peak RSS | 新 peak RSS | 变化 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `100` | `92.49` | `107.30` | `+16.01%` | `155` | `154` | `-0.65%` | `4119.38` | `3984.68` | `-3.27%` |
| `200` | `34.98` | `63.10` | `+80.39%` | `4279` | `2871` | `-32.90%` | `5901.56` | `5606.41` | `-5.00%` |
| `500` | `53.94` | `40.29` | `-25.31%` | `3315` | `3981` | `+20.09%` | `5910.50` | `6013.59` | `+1.74%` |
| `1000` | `27.59` | `34.44` | `+24.83%` | `5628` | `2922` | `-48.08%` | `5845.25` | `5888.54` | `+0.74%` |

## 4. 结论

- P0 修复是有效的，但收益主要体现在：
  - 会发生 recycle 的档位
  - 或接近 recycle/退出边界的档位
- 最明显的是 `mtp=200`：
  - `req/s` 从 `34.98` 回到 `63.10`
  - `p99` 从 `4279ms` 降到 `2871ms`
  - `peak RSS` 从 `5901MB` 降到 `5606MB`
- `mtp=100` 也有稳定改善，说明 graceful shutdown + terminate 收口确实修掉了一部分 native 残留
- 但 `mtp=500/1000` 仍然会把 RSS 推到 `~5.9GB`
  - 这说明当前主问题不再只是“worker 退出时没走析构”
  - 还存在“worker 活着时，任务之间持续累积”的残留链路
- Window reset 功能正确，但从本轮结果看，它不是高 `mtp` 长跑退化的主控制项

## 5. 下一步建议

按优先级继续做：

1. 在 worker 结果里补更细的残留指标：
   - Window listener 数
   - RAF 数
   - active docs/tasks
   - terminate reason / cleanupSkipped
2. 在 post-task cleanup 后增加更强的“脏 worker 立即回收”判定，不只看 DOM task scope，也要覆盖 Window/BOM 残留
3. 如需继续验证，下一轮优先重跑：
   - `mtp=200`
   - `mtp=500`
   - `mtp=1000`

## 6. 下轮执行清单

建议下个对话按这个顺序直接执行：

1. 在 [worker-common.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/worker-common.js) 的 cleanup/runtime snapshot 脚本里增加：
   - `windowListenerCount`
   - `rafCount`
2. 在 [thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js) 把这些指标随 `result / error / shutdown_ack` 一起上报
3. 在 [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js) 持久化这些字段，并放进 `getStats().workersDetail`
4. 复跑：
   - `node benchmarks/longevity-runner.js --max-tasks-per-worker 200`
   - `node benchmarks/longevity-runner.js --max-tasks-per-worker 500`
   - `node benchmarks/longevity-runner.js --max-tasks-per-worker 1000`
5. 用结果回答两个问题：
   - 高 `mtp` 时是 DOM/Window 残留在涨，还是这些指标已经干净但 RSS 仍涨
   - recycle 触发前是否已经能从 runtime stats 看到明确的脏信号

## 7. 当前判断

长跑主因已经从“退出时不析构”收敛为“两段式问题”：

- 第一段：worker recycle/shutdown 链路原本确实有缺口，P0 已部分修复
- 第二段：worker 存活期间仍有跨任务残留持续累积，这才是 `mtp=500/1000` 仍然失控的核心原因

## 8. 第六节执行结果

### 8.1 指标落地情况

第六节清单已执行完成：

1. [worker-common.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/worker-common.js) 已把 `windowListenerCount / rafCount` 并入 cleanup snapshot 和 runtime snapshot
2. [Window.impl.js](/home/hostxxii/LeapWorkSpace/leap-env/src/impl/Window.impl.js) 已新增 `getWindowTaskRuntimeStats()`，把 `_windowListeners` 和 `_rafMap` 暴露给 runtime store
3. [thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js) 已把 `runtimeStats` 随 `init / heartbeat / result / error / shutdown_ack` 一起上报
4. [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js) 的 `workersDetail` 已持久化：
   - `terminateReason`
   - `terminateMode`
   - `terminateRequestedAt`
   - `shutdownAckAt`
   - `cleanupSkipped`
   - `runtimeStats`
5. [longevity-runner.js](/home/hostxxii/LeapWorkSpace/benchmarks/longevity-runner.js) 已把这些字段写入 benchmark JSON
6. 已再次执行 `npm run build`，确认实际 benchmark 使用的是重建后的 bundle

### 8.2 新一轮长跑结果

本轮新结果文件：

- [longevity-mtp200-20260306_204637.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp200-20260306_204637.json)
- [longevity-mtp500-20260306_204801.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp500-20260306_204801.json)
- [longevity-mtp1000-20260306_204925.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp1000-20260306_204925.json)

说明：这一组运行基于 2026-03-06 20:46-20:49 的当前 worktree + 新 bundle，应视为“带 runtime stats 仪表的最新基线”；它和第 3 节 20:16-20:25 的结果不应被过度解读成“纯仪表开销”。

| mtp | 本轮 req/s | 相比第 3 节 | 本轮 p99 | 相比第 3 节 | 本轮 peak RSS | 相比第 3 节 | recycle |
|---|---:|---:|---:|---:|---:|---:|---:|
| `200` | `26.07` | `-58.68%` | `5494` | `+91.36%` | `6218.26` | `+10.91%` | `2` |
| `500` | `27.31` | `-32.22%` | `3132` | `-21.33%` | `5902.05` | `-1.85%` | `0` |
| `1000` | `28.56` | `-17.07%` | `5302` | `+81.45%` | `5831.39` | `-0.97%` | `0` |

新一轮曲线特征：

- 三档都再次复现了“RSS 单边上涨到 `5.8~6.2GB`，随后吞吐塌陷、p99 拉长”的模式
- `mtp=200` 在接近 `maxTasksPerWorker` 边界后才出现 recycle，且最终 recycle 原因是 `max tasks reached`
- `mtp=500/1000` 整轮几乎没有 recycle，但 RSS 仍持续上涨到高位

### 8.3 runtime stats 观测结论

对三份 JSON 全量扫描后的结果：

- `activeDocs` 最大值：`0`
- `activeNodes` 最大值：`0`
- `activeTasks` 最大值：`0`
- `windowListenerCount` 最大值：`0`
- `rafCount` 最大值：`0`

也就是说，在本轮所有采样点里：

- 没有观测到 DOM task scope 残留
- 没有观测到 Window listener 残留
- 没有观测到 RAF 残留
- recycle 触发前，也没有出现任何可见的“脏 worker”信号

`mtp=200` 末段样本还有一个额外事实：

- worker 进入 `recycling` 时，`runtimeStats` 仍然全 0
- `terminateReason` 是 `max tasks reached`
- `cleanupSkipped=true` 来自 graceful shutdown 超时后的 force fallback，而不是因为 cleanup/runtime stats 判脏

因此，第 6 节里的两个问题现在都可以回答：

1. 高 `mtp` 时，不是当前已观测的 DOM/Window 残留在涨；这些指标是干净的，但 RSS 仍然持续上涨
2. recycle 触发前，runtime stats 没有提供明确脏信号

## 9. 更新结论

第 7 节里的“第二段问题”需要进一步收窄：

- 可以先排除“当前可观测的 DOM task scope / Window listener / RAF 残留”是主因
- 更可疑的方向变成：
  - isolate / native 侧常驻内存
  - bridge / addon 内部对象生命周期
  - 未纳入当前 runtime stats 的 timer / message / placeholder / native handle 残留

换句话说，P0 修复后，问题已经不再像一开始那样是“明显的 JS/DOM cleanup 缺口”，而更像“worker 存活期间某类 native 资源持续累积，但当前 JS runtime stats 看不见它”。

## 10. 下一步建议

不要继续优先扩 `Window reset` 或 DOM cleanup 逻辑，下一轮主线应改成“补 native/isolate 侧观测”：

1. 在 worker 侧继续补更底层的 runtime stats：
   - pending timer count
   - MessagePort / MessageChannel 残留数
   - placeholder XHR / fetch 相关容器大小
   - 如果 `leap-vm` 可提供接口，补 isolate/native allocation 指标
2. 在 `maxTasksPerWorker` 命中前后，单独记录一次“worker 退出前快照”，确认 RSS 高位时哪些指标仍不可见
3. 在下一轮修复落地前，运行策略不要把 `ThreadPool + mtp>=200` 视为稳定配置
   - 保守策略可退回 `ProcessPool`
   - 或把 `ThreadPool` 暂时压在 `mtp<=100`

## 11. 第10节执行结果

### 11.1 观测项落地情况

第 10 节建议已继续推进：

1. [worker-common.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/worker-common.js) 的 runtime stats / post-task cleanup 脚本已新增：
   - `timeoutCount`
   - `intervalCount`
   - `pendingTimerCount`
   - `messageChannelCount`
   - `messagePortOpenCount`
   - `messagePortClosedCount`
   - `messagePortQueueCount`
   - `placeholderXhrCreatedCount`
   - `placeholderXhrFallbackCount`
2. [Window.impl.js](/home/hostxxii/LeapWorkSpace/leap-env/src/impl/Window.impl.js) 已把 timer 与 placeholder XHR 计数并入 `getWindowTaskRuntimeStats()`
3. [MessageChannel.impl.js](/home/hostxxii/LeapWorkSpace/leap-env/src/impl/MessageChannel.impl.js) / [MessagePort.impl.js](/home/hostxxii/LeapWorkSpace/leap-env/src/impl/MessagePort.impl.js) 已新增 `MessageChannel/Port` runtime stats
4. [longevity-runner.js](/home/hostxxii/LeapWorkSpace/benchmarks/longevity-runner.js) 已把这些字段写入 sample worker snapshot 和最终 `workerTasksHandledFinal`
5. 已再次执行 `npm run build`，确认实际 benchmark 使用的是包含新观测项的最新 bundle

说明：

- 本轮没有补到真正的 isolate/native allocation 指标
- 在当前 repo 内未发现 JS 侧已暴露的 `leap-vm` isolate 内存查询接口
- 因此这轮新增的是“native 侧代理信号”，不是直接的 V8/native allocation 真值

### 11.2 单档长跑验证

为验证字段是否真实可见，先重跑一档：

- [longevity-mtp200-20260306_205921.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp200-20260306_205921.json)

结果摘要：

- `total req/s = 25.22`
- `p95 = 3150ms`
- `p99 = 5172ms`
- `peak RSS = 5941.19MB`
- `recycles = 3`

曲线仍然复现老问题：

- 前半段吞吐正常
- RSS 持续单边上涨
- 接近 `~5.9GB` 后吞吐急剧塌陷
- `maxTasksPerWorker=200` 命中后才开始 recycle

### 11.3 新 runtime stats 观测结果

这次不再是“全部 0，看不见任何残留”。新增指标已经给出非常明确的信号：

全量扫描本轮 JSON 后，最大值为：

- `activeDocs = 0`
- `activeNodes = 0`
- `activeTasks = 0`
- `windowListenerCount = 0`
- `rafCount = 0`
- `intervalCount = 0`
- `messagePortClosedCount = 0`
- `messagePortQueueCount = 0`
- `placeholderXhrCreatedCount = 0`
- `placeholderXhrFallbackCount = 0`
- `timeoutCount = 202`
- `pendingTimerCount = 202`
- `messageChannelCount = 200`
- `messagePortOpenCount = 400`

更关键的是，这几个新指标与 `tasksHandled` 呈近乎严格线性关系：

- `messageChannelCount == tasksHandled`
- `messagePortOpenCount == tasksHandled * 2`
- `timeoutCount == tasksHandled + 2`

例如本轮末尾的高位 worker：

- `thread-worker-10`
  - `tasksHandled = 200`
  - `timeoutCount = 202`
  - `messageChannelCount = 200`
  - `messagePortOpenCount = 400`
  - `terminateReason = max tasks reached`
  - `cleanupSkipped = true`

而新补位的 `thread-worker-13`：

- `tasksHandled = 0`
- 上述新增指标全部为 `0`

这说明残留不是随机噪声，而是“每执行 1 个任务，就新增一组长期存活对象/句柄”。

## 12. 修正结论

第 9 节里的判断需要明确修正：

- 之前“当前 JS runtime stats 看不见明显残留”的结论，已经不再成立
- 当前已经能稳定观测到跨任务累积的 JS 侧宿主对象残留：
  - `MessageChannel`
  - `MessagePort`
  - `setTimeout` pending handle

更准确的结论应改为：

- DOM task scope / Window listener / RAF 不是当前主因
- 但 worker 存活期间，确实存在“每任务一组”的 `MessageChannel/Port + timeout` 残留
- 这些对象本身是 JS 可见的，但其背后很可能绑定宿主/事件循环/native handle
- 这也解释了为什么 `heapUsed` 基本不涨，而 RSS 却一路升到 `~5.9GB`

换句话说，问题不是“纯 isolate/native 黑盒泄漏、JS 完全看不见”，而更像：

- JS 层有稳定可见的宿主对象未释放
- 这些宿主对象进一步拖住 native/event-loop 侧资源
- 最终表现为高 RSS + 长尾崩塌

## 13. 当前最可疑方向

结合 [work/h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js) 中 `setImmediate` fallback 片段可见：

- 脚本在无 `setImmediate` 时会尝试走 `MessageChannel` 路径
- 否则再退回 `setTimeout`

而本轮观测恰好表现为：

- 每任务新增 `1` 个 `MessageChannel`
- 每任务新增 `2` 个 `MessagePort`
- 同时多出 `1` 个 pending timeout

这使得下一步最可疑链路变成：

1. 某个任务级初始化/调度 polyfill 在每任务都会重新建立 `MessageChannel`
2. 这些 `port` 在任务结束后没有 `close()`
3. 相关 timeout 句柄也没有在任务 cleanup 后归零

`messagePortQueueCount=0` 也很关键：

- 当前不像是“消息队列积压未消费”
- 更像是“空闲但未关闭的 port / timer handle 持续堆积”

## 14. 下一步建议

下一轮不要再优先追 isolate allocation 黑盒，先把这条已显形的残留链打穿：

1. 审计 `MessageChannel/MessagePort` 的创建与任务结束路径
   - 重点看是否存在“每任务重建，但无 close/reset”
2. 在任务 reset / post-task cleanup 中补 `MessageChannel/Port` 清理
   - 目标是让 `messageChannelCount / messagePortOpenCount / pendingTimerCount` 在任务后回到接近 `0`
3. 结合 [work/h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js) 的调度 fallback，确认是不是该脚本或其 polyfill 每任务都重建 scheduler
4. 修复后优先复跑：
   - `node benchmarks/longevity-runner.js --max-tasks-per-worker 200`
   - `node benchmarks/longevity-runner.js --max-tasks-per-worker 500`
5. 新的验证标准不要只看 RSS：
   - `messageChannelCount` 是否不再随 `tasksHandled` 线性增长
   - `messagePortOpenCount` 是否能回落
   - `pendingTimerCount` 是否在任务后归零
   - 若这些已归零但 RSS 仍继续上涨，再回到 isolate/native allocation 方向

## 15. 第14节执行结果

### 15.1 修复落地情况

第 14 节建议已继续推进：

1. [MessageChannel.impl.js](/home/hostxxii/LeapWorkSpace/leap-env/src/impl/MessageChannel.impl.js) 已新增任务级 reset：
   - 追踪当前 task 生命周期内创建的 `MessageChannel/MessagePort`
   - 在 `resetMessagePortTaskState()` 中主动关闭未关闭的 port
   - 把 reset 挂到 runtime store / impl registry，供任务 cleanup 调用
2. [Window.impl.js](/home/hostxxii/LeapWorkSpace/leap-env/src/impl/Window.impl.js) 的 `resetWindowTaskState()` 已补齐：
   - `setTimeout`
   - `setInterval`
   - 既有 `RAF / listener / window.name/status/opener`
3. [signature-task.instance.js](/home/hostxxii/LeapWorkSpace/leap-env/src/instance/signature-task.instance.js) 的 `resetSignatureTaskState()` 已接入：
   - `resetWindowTaskState()`
   - `resetMessagePortTaskState()`
4. [worker-common.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/worker-common.js) 的 post-task recycle 判定已收紧：
   - 不再只看 `activeDocs / activeTasks`
   - 还会看 `windowListenerCount / rafCount / pendingTimerCount / messageChannelCount / messagePortOpenCount / messagePortQueueCount`
5. 已再次执行 `npm run build`，确认 benchmark 使用的是包含上述修复的最新 bundle

### 15.2 单 worker 定向验证

先用单 worker 验证“每任务线性增长”是否被切断：

- [longevity-mtp200-20260306_210908.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp200-20260306_210908.json)
- 命令：
  - `node benchmarks/longevity-runner.js --max-tasks-per-worker 200 --pool 1 --concurrency 1 --warmup 5 --total 60 --sample-every 10`

结果要点：

- 吞吐稳定在 `~21~22 req/s`
- `peak RSS = 381.36MB`
- 末尾 worker `tasksHandled = 65`
- 末尾 `runtimeStats` 全量为 `0`：
  - `pendingTimerCount = 0`
  - `messageChannelCount = 0`
  - `messagePortOpenCount = 0`

结论：

- 这说明任务级 reset 已经生效
- 旧报告里“随 `tasksHandled` 线性增长”的这组可见残留，在定向验证下已不再出现

### 15.3 默认并发 `mtp=200` 复跑

随后按默认并发重跑一档：

- [longevity-mtp200-20260306_210936.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp200-20260306_210936.json)
- 命令：
  - `node benchmarks/longevity-runner.js --max-tasks-per-worker 200`

结果摘要：

- `total req/s = 45.32`
- `p95 = 360ms`
- `p99 = 3304ms`
- `peak RSS = 5737.09MB`
- `recycles = 4`

更关键的是，对整份 JSON 的 worker snapshot 扫描后：

- `activeDocs` 最大值：`0`
- `activeNodes` 最大值：`0`
- `activeTasks` 最大值：`0`
- `windowListenerCount` 最大值：`0`
- `rafCount` 最大值：`0`
- `timeoutCount` 最大值：`0`
- `intervalCount` 最大值：`0`
- `pendingTimerCount` 最大值：`0`
- `messageChannelCount` 最大值：`0`
- `messagePortOpenCount` 最大值：`0`
- `messagePortQueueCount` 最大值：`0`

也就是说：

- 旧的 `MessageChannel/Port + timeout` 残留链，在当前修复后已经被切断
- 但默认并发下，RSS 仍然会涨到 `~5.7GB`
- 吞吐与尾延迟仍会在高 RSS 区间明显恶化

## 16. 更新结论

第 12~14 节里的怀疑方向需要继续收窄：

- 现在可以先排除“当前已观测到的 JS 宿主对象残留”是主因：
  - DOM task scope
  - Window listener / RAF
  - pending timer
  - MessageChannel / MessagePort
- 这些指标在本轮修复后已经稳定归零，但高 `mtp` 长跑仍会出现高 RSS + 吞吐塌陷

因此，当前更合理的判断变成：

- 第 14 节锁定的那条 JS 可见残留链，确实存在且已经修掉
- 但它不是 `mtp=200` 默认并发长跑退化的最终主控制项
- 当前主因需要进一步转向更底层的方向，例如：
  - isolate / native allocation
  - bridge / addon 内部常驻对象
  - worker 生命周期内未进入当前 runtime stats 的固定增长结构

## 17. 下一步建议

下一轮主线不再优先扩 JS cleanup/reset，而应改成：

1. 补更底层的 worker 侧观测：
   - 如果 `leap-vm` 可加接口，优先补 isolate/native allocation 指标
   - 否则先补 bridge/addon 侧可见容器大小、handle 数、cache 大小
2. 在 `maxTasksPerWorker` 命中前后增加“退出前快照”：
   - 重点比对高 RSS worker 在 `cleanupSkipped=false` 与 `cleanupSkipped=true` 时的差别
3. 用当前修复后的代码继续复跑：
   - `node benchmarks/longevity-runner.js --max-tasks-per-worker 500`
   - 如有必要再跑 `1000`
4. 新的判断标准应改为：
   - 若 JS runtime stats 继续全 0，但 RSS 仍单边上涨，则优先进入 native/isolate 方向
   - 不要再把 `MessageChannel/Port` 作为当前第一嫌疑链路

## 18. 第17节执行结果

### 18.1 更底层观测已落地

按第 17 节继续推进后，本轮已在 `leap-vm` 的 `getRuntimeStats()` 中补齐更底层指标，并把采样切到 VM 线程执行：

- bridge/addon 侧：
  - `vmStaleTimerQueueCount`
  - 既有 `vmTimerQueueSize / vmTimerCount / dom/skeleton/cache` 容器计数
- isolate/V8 侧：
  - `v8TotalHeapSize`
  - `v8TotalPhysicalSize`
  - `v8UsedHeapSize`
  - `v8MallocedMemory`
  - `v8ExternalMemory`
  - `v8TotalGlobalHandlesSize / v8UsedGlobalHandlesSize`
  - `v8NumberOfNativeContexts / v8NumberOfDetachedContexts`
  - `v8CodeAndMetadataSize / v8BytecodeAndMetadataSize`
  - `v8OldSpace* / v8NewSpace* / v8CodeSpace* / v8LargeObjectSpace*`

这些字段已透传到 worker runtime stats，并写入 benchmark JSON。

### 18.2 `mtp=500` 复跑结果

结果文件：

- [longevity-mtp500-20260306_214354.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/longevity-mtp500-20260306_214354.json)

结果摘要：

- `avg req/s = 43.42`
- `p99 = 5914ms`
- `peak RSS = 6032.09MB`
- `recycles = 0`

曲线与前几轮一致：

- 前半段吞吐可维持在 `~100 req/s`
- `tasksDone ≈ 1300` 后明显退化
- RSS 继续单边上涨到 `~6.0GB`
- `heapUsed/external` 依旧看起来很低，但这次已确认那只是宿主 Node isolate 的视角

### 18.3 新观测结论

这轮最关键的新事实是：

- `process.memoryUsage().heapUsed` 基本不涨，并不代表 worker 内所有 V8 heap 都没涨
- 它只反映宿主 Node isolate，不覆盖 `leap-vm` 内每个 `VmInstance` 的独立 isolate

把 12 个 worker 的 `leapvm` isolate 指标聚合后：

- 聚合 `RSS`：`1014.28MB -> 6032.09MB`，增量 `+5017.81MB`
- 聚合 `v8TotalPhysicalSize`：`404.75MB -> 4482.09MB`，增量 `+4077.35MB`
- 聚合 `v8UsedHeapSize`：`262.72MB -> 3567.22MB`，增量 `+3304.50MB`
- 聚合 `v8MallocedMemory`：`45.03MB -> 321.38MB`，增量 `+276.35MB`
- `RSS` 与 `v8TotalPhysicalSize` 相关系数：`0.9936`
- `RSS` 与 `v8UsedHeapSize` 相关系数：`0.9867`

这说明当前 RSS 主增量已经可以直接映射到 `leapvm` isolate 自身的 V8 heap 增长，而不是“完全不可见的 native 黑盒”。

空间分解后，增长主要集中在：

- `v8LargeObjectSpaceUsedSize`：`+1851.22MB`
- `v8OldSpaceUsedSize`：`+614.38MB`
- `v8CodeSpaceUsedSize`：`+445.30MB`
- `v8NewSpaceUsedSize`：`+119.72MB`

也就是说，当前最重的增长不是新生代抖动，而是：

- Large Object Space 持续堆积
- Old Space 持续晋升
- Code Space 也在持续上涨

相比之下，其它候选方向明显弱很多：

- `v8UsedGlobalHandlesSize` 全程基本恒定，聚合仅 `~25.6KB`
- `v8NumberOfNativeContexts` 始终等于 worker 数，没有 detached context 残留
- `vmStaleTimerQueueCount` 确实随任务线性增长，但它只是“取消定时器节点未及时出队”的次级问题
  - 聚合值：`94 -> 2044`
  - 这条信号值得单独修，但量级上解释不了 `+5GB` RSS

高位 worker 的末尾快照也支持这个结论。例如：

- `thread-worker-5`
  - `tasksHandled = 287`
  - `v8TotalPhysicalSize = 594.99MB`
  - `v8UsedHeapSize = 540.59MB`
  - `vmStaleTimerQueueCount = 289`

### 18.4 修正结论

第 16~17 节的判断需要继续修正：

- 当前主问题已经不是“Node 宿主进程 heap 看起来不涨，所以只能怀疑 native 黑盒”
- 更准确的描述应是：
  - `ThreadPool` 下每个 `VmInstance` 的独立 V8 isolate heap 在跨任务持续累积
  - 聚合后，这部分增长与 RSS 高度一致
  - 其中 Large Object Space / Old Space / Code Space 是当前最主要的增长来源

因此，当前主因更像：

- 任务执行后，某类大对象/大字符串/大数组仍被 isolate 持有
- 或每任务都在持续生成新的代码对象、函数、脚本元数据，并被长期保留
- 这些对象不在当前 DOM/Window/Message/timer 清理链路里，所以之前的 JS runtime stats 看起来“很干净”

### 18.5 下一步建议

下一轮不应再优先补 native 容器计数，而应直接进入“isolate heap 内部对象来源”排查：

1. 补更细的 V8 heap 诊断：
   - 优先看 `HeapObjectStatisticsAtLastGC` / heap snapshot / object type top-N
   - 目标是回答：Large Object Space 里到底是字符串、数组、脚本源码，还是别的对象
2. 审计任务执行路径中会跨任务留存代码或大对象的点：
   - `eval / new Function / Script compile`
   - 挂在 `globalThis` 或 runtime store 上的任务结果缓存
   - 大字符串、大数组、解析结果、源码副本
3. `vmStaleTimerQueueCount` 仍建议单独修：
   - 它不是当前 `6GB RSS` 主因
   - 但确实反映了 `clearTimeout()` 后 canceled 节点未及时从优先队列移除
4. 在根因修掉前，运行策略仍不应把 `ThreadPool + mtp=500` 视为稳定配置

## 19. 第18节后续排故结果

### 19.1 Heap object top-N 已给出直接指向

第 18 节之后，继续使用 `HeapObjectStatisticsAtLastGC` 做了单 VM 定向实验，并补了一组可复现对照：

- 结果 JSON：
  - [experiment-c4-stabilize-script-source-20260306_221220.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/experiment-c4-stabilize-script-source-20260306_221220.json)
- 实验说明：
  - [experiment-c4-stabilize-script-source-20260306_221220.md](/home/hostxxii/LeapWorkSpace/benchmarks/report/experiment-c4-stabilize-script-source-20260306_221220.md)

在真实 `executeSignatureTask()` 路径下，之前已经观察到：

- `SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE`
  - `count ≈ tasksHandled + 1`
  - `size` 与 `v8LargeObjectSpaceUsedSize` 基本等量
- 同时伴随 `BASELINE / MAGLEV / BYTECODE_ARRAY_TYPE / TURBOFAN_JS` 持续增长

这说明第 18 节里怀疑的“脚本源码 / 代码对象持续保留”方向是对的，而且来源不是随机业务对象，而是任务执行路径自身生成的脚本源码和代码产物。

### 19.2 关键对照：固定 taskId vs 唯一 taskId

对同一份 `work/h5st.js` 连续执行 `100` 次，只改 `taskId` 的生成方式：

| case | v8UsedHeap | Large Object Space | Code Space | Old Space | `SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE` |
|---|---:|---:|---:|---:|---:|
| `constant-task-id` | `29.47MB` | `4.47MB` | `5.67MB` | `17.02MB` | `2` |
| `unique-task-id` | `181.54MB` | `99.03MB` | `32.09MB` | `33.41MB` | `101` |

这个对照非常关键，因为：

- 两组都执行同一份 `h5st.js`
- cleanup 路径相同
- siteProfile 相同
- 唯一显著差异就是 `taskId` 是否每次变化

而 `taskId` 固定后，`Large Object Space` 直接从 `99.03MB` 掉到 `4.47MB`，`SCRIPT_SOURCE_*` 从 `101` 掉到 `2`。这说明当前主要不是“执行 100 次任务必然产生 100 份业务残留”，而是：

- `executeSignatureTask()` 每次把 `taskId`、snapshot、`targetScript` 一起拼进 `combinedScript`
- `taskId` 每次不同，导致 V8 每任务都看到一份新的 `48w+` 字符大源码
- 这些唯一源码文本被保留在 `SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE` 中，直接顶高了 Large Object Space

### 19.3 PoC：大脚本只编译一次后，增长基本消失

又做了一组 PoC：

- 先把 `h5st.js` 通过 `new Function(targetScript)` 预装成一次性的缓存函数
- 每个任务只执行小包装脚本，负责：
  - begin/end task
  - apply snapshot
  - 调用缓存函数
  - reset task state

结果：

| case | v8UsedHeap | Large Object Space | Code Space | Old Space | `SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE` |
|---|---:|---:|---:|---:|---:|
| `cached-target-small-wrapper` | `20.27MB` | `6.36MB` | `1.09MB` | `12.04MB` | `3` |

这组结果进一步证明：

- 真正危险的不是“任务逻辑必须产生大量常驻对象”
- 而是“每任务重新编译唯一大源码文本”这件事本身
- 一旦把大脚本变成“一次编译，多次调用”，Large Object Space 和 Code Space 都会明显回落

### 19.4 修正后的根因结论

到这里，主因已经可以进一步收敛为：

- `ThreadPool` 长跑下的主要增长链，不是 DOM/Window/Message/timer 残留
- 也不主要是 Node 宿主 isolate 的普通 JS heap
- 而是 `executeSignatureTask()` 当前的“动态拼接大脚本”执行模型：
  - `targetScript` 本身接近 `486KB`
  - `taskId` 和 snapshot 被直接内联进大脚本
  - 导致每任务都生成一份唯一源码，并触发新的源码对象与代码对象保留

换句话说，第 18 节看到的 `Large Object Space + Code Space` 增长，已经可以直接落到具体代码形态，而不是抽象的“V8 heap 在涨”。

### 19.5 下一步建议

下一轮如果继续，不要再把重心放在补更多观测；优先验证执行模型修复：

1. 优先改 [runner.js](/home/hostxxii/LeapWorkSpace/leap-env/runner.js) 的 `executeSignatureTask()`：
   - 改成“稳定小包装脚本 + 缓存目标脚本/函数”
   - 不要再把 `taskId`、snapshot、`targetScript` 一起内联成新的大源码
2. 如需兼容可变任务参数：
   - 可把可变数据放进小 payload
   - 或写入 `globalThis` / runtime store 后由稳定包装脚本读取
3. 修复后优先复跑：
   - `node benchmarks/experiment-c4-stabilize-script-source.js`
   - `node benchmarks/longevity-runner.js --max-tasks-per-worker 500`
4. 验证标准应改为：
   - `SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE` 不再随任务数线性增长
   - `v8LargeObjectSpaceUsedSize / v8CodeSpaceUsedSize` 曲线明显变平
   - 长跑 RSS 不再在 `tasksDone ≈ 1300` 后单边推到 `~6GB`
