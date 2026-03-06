# H5ST 基线与 CPU 诊断报告（2026-03-06）

## 1. 结论

- 本次基线配置下，`ThreadPool pool=12 / concurrency=48 / maxTasksPerWorker=50` 已经处于明显的 CPU 高负载区间。
- 10 个采样窗口里，总 CPU 平均约 `95.21%`，峰值 `98.27%`；各核心长期处于高位，没有明显“单核打满、其余空闲”的失衡现象。
- 前 5 个窗口的滑动吞吐基本稳定在 `117~129 req/s`，且 `activeWorkers=12`、`pendingTasks=35`，说明 12 个 worker 长时间处于满负荷工作状态。
- 但这次不只是“纯 CPU 饱和”。在第 6 个采样窗口（完成 `300/500` 任务）出现一次明显长尾停顿：`req/s=18.61`，`p95/p99=2364/2369ms`，RSS 同步升到 `1841.74MB`。
- 全程没有 timeout、没有 recycle、没有 respawn，说明这次抖动不是 worker 回收机制触发的，更像运行期状态累积、GC、或任务内部阶段性停顿。

## 2. 测试对象与环境

- 测试时间：`2026-03-06T09:21:16.813Z ~ 2026-03-06T09:21:23.363Z`
- 工作负载脚本：`work/h5st.js`
- 站点配置：`site-profiles/jd.json`
- 压测脚本：`benchmarks/perf-baseline-runner.js`
- 系统：Linux x64
- Node：`v20.20.0`
- CPU：`Intel(R) Core(TM) i9-9900KS CPU @ 4.00GHz`
- 逻辑核数：`16`
- 总内存：`15954.18 MB`

## 3. 基线配置

- backend：`ThreadPool`
- pool size：`12`
- concurrency：`48`
- maxTasksPerWorker：`50`
- warmup：`20`
- measured tasks：`500`
- sampleEvery：`50`
- debug：`false`
- taskTimeoutMs：`30000`
- workerInitTimeoutMs：`30000`

## 4. 总体结果

| 指标 | 数值 |
|---|---:|
| warmup 耗时 | `224 ms` |
| 正式任务耗时 | `6550 ms` |
| 成功 / 失败 | `500 / 0` |
| 整体 req/s | `76.34` |
| 整体 p50 | `95 ms` |
| 整体 p95 | `134 ms` |
| 整体 p99 | `2362 ms` |
| 峰值 RSS | `2583.52 MB` |
| 峰值 CPU | `98.27%` |

说明：

- 整体 `76.34 req/s` 被第 6 个窗口的长尾停顿明显拉低，不能直接代表这组配置的“短跑稳定窗口上限”。
- 从滑动窗口看，正常区间的短跑吞吐更接近 `117~136 req/s`。

## 5. 采样时序

| 样本 | 完成任务 | req/s | p50 | p95 | p99 | CPU | RSS(MB) | activeWorkers | pendingTasks |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50 | 125.00 | 94 | 113 | 122 | 93.28% | 997.90 | 12 | 35 |
| 2 | 100 | 129.20 | 92 | 112 | 141 | 94.74% | 1119.80 | 12 | 35 |
| 3 | 150 | 117.37 | 96 | 136 | 157 | 93.52% | 1381.08 | 12 | 35 |
| 4 | 200 | 125.00 | 95 | 117 | 133 | 95.96% | 1537.39 | 12 | 35 |
| 5 | 250 | 127.88 | 90 | 107 | 128 | 96.67% | 1635.25 | 12 | 35 |
| 6 | 300 | 18.61 | 95 | 2364 | 2369 | 97.36% | 1841.74 | 12 | 35 |
| 7 | 350 | 104.38 | 114 | 134 | 163 | 93.55% | 2230.73 | 12 | 35 |
| 8 | 400 | 108.46 | 104 | 145 | 152 | 98.27% | 2366.21 | 12 | 35 |
| 9 | 450 | 122.85 | 96 | 112 | 119 | 96.66% | 2484.44 | 12 | 35 |
| 10 | 500 | 136.61 | 90 | 106 | 107 | 92.09% | 2583.40 | 0 | 0 |

## 6. CPU 诊断

### 6.1 CPU 是否已饱和

结论：**是，已接近饱和。**

判断依据：

- 总 CPU 在全部采样窗口都高于 `92%`，平均约 `95.21%`。
- 每核心 CPU 分布整体均匀，最低核心也长期处于 `82%~93%` 区间，不存在明显的单核热点或严重空闲核。
- 样本 1 到样本 9 期间，`activeWorkers` 始终是 `12`，与 pool size 一致，且队列长期存在 `35` 个待处理任务。
- 吞吐的正常窗口并没有继续显著上升空间，说明当前配置已经把 CPU 吃满，继续抬并发更可能只会放大尾延迟。

### 6.2 是否存在“只有 CPU 问题”的结论

结论：**不能只归因于 CPU。**

理由：

- 第 6 个窗口里，CPU 仍然处在 `97.36%` 高位，但吞吐突然掉到 `18.61 req/s`。
- 同一个窗口里，`p95/p99` 跳到 `2364/2369ms`，已经不是普通调度抖动量级。
- RSS 从样本 1 的 `997.90MB` 一路升到最终 `2583.40MB`，且没有回落迹象。
- `heapUsed` 没有同步暴涨，说明问题未必是纯 JS heap；更可能要继续看 native 侧、外部对象、DOM 状态累积，或某类运行期资源未及时回收。

## 7. 额外观察

- 本轮 `maxTasksPerWorker=50`，但 500 个正式任务里没有触发 worker recycle，说明这轮异常不是“达到回收阈值后抖动”。
- `finalSnapshot.pool.metrics` 显示：
  - `enqueued=520`
  - `started=520`
  - `succeeded=520`
  - `failed=0`
  - `timedOut=0`
  - `recycled=0`
  - `respawned=0`
- 这意味着 warmup 和正式任务都成功完成，异常是性能层的，而不是功能失败。

## 8. 建议的后续排查方向

- A 线结论已经足够明确：当前短跑峰值受 CPU 限制，不能指望单靠简单“代码清洗”再拿到大幅吞吐提升。
- 下一步建议优先进入 `A3` 和 `B1/B2`：
  - 拆分单任务阶段耗时，确认停顿发生在初始化、执行、清理、还是结果回传。
  - 固定 `pool=12 / concurrency=48`，只改 `maxTasksPerWorker` 做退化矩阵。
  - 对 `RSS` 增长与 `p99` 抖动做更细粒度采样，尤其围绕 `250~350` 任务区间。

## 9. 产物文件

- 原始 JSON：`benchmarks/results/baseline-20260306_172116.json`
- 压测脚本：`benchmarks/perf-baseline-runner.js`
- 本报告：`benchmarks/H5ST_BASELINE_CPU_REPORT_20260306.md`

## 10. 复现实验命令

```bash
node benchmarks/perf-baseline-runner.js
```

对比 pool size 时，建议先固定其余变量，只改 `--pool`：

```bash
node benchmarks/perf-baseline-runner.js --pool 8
node benchmarks/perf-baseline-runner.js --pool 12
node benchmarks/perf-baseline-runner.js --pool 16
```
