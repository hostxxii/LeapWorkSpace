# H5ST 长跑退化复现初报（2026-03-06）

## 1. 本轮完成项

- 新增长跑脚本：`benchmarks/longevity-runner.js`
- 支持两种运行方式：
  - 不带 `--max-tasks-per-worker`：顺序跑完整矩阵 `10,25,50,100,200,500,1000`
  - 带 `--max-tasks-per-worker <n>`：只跑单个配置
- 每 50 个任务采样一次，输出：
  - `req/s`
  - 窗口 `p50/p95/p99`
  - `RSS / heapUsed / heapTotal / external / arrayBuffers`
  - 每个 worker 的 `tasksHandled / status / memoryUsage`
  - `activeWorkers`
  - `workerRecycles / workerRespawns`
  - `warningsCount`
- 结果输出到：
  - `benchmarks/results/longevity-mtp{N}-{timestamp}.json`

## 2. worker 内采样结论

本轮没有新增 worker 采样逻辑，因为当前代码里已经具备：

- `leap-env/src/pool/thread-worker.js`
- `leap-env/src/pool/worker.js`

两处在每次任务完成后都随结果回传：

```js
memoryUsage: getMemorySnapshot()
```

主进程里的 `ThreadPool/ProcessPool` 也已经把这部分数据挂到 `result.memoryUsage` 和 `getStats().workersDetail[*].memoryUsage`。

因此本轮重点放在“长跑采样编排”和“退化曲线输出”，没有再改 worker 业务路径。

## 3. 已验证配置：`maxTasksPerWorker=50`

运行命令：

```bash
node benchmarks/longevity-runner.js --max-tasks-per-worker 50
```

产物：

- JSON：`benchmarks/results/longevity-mtp50-20260306_185058.json`

总体结果：

| 指标 | 数值 |
|---|---:|
| 总任务数 | `2000` |
| 总耗时 | `19991 ms` |
| 总体 req/s | `100.05` |
| p50 / p95 / p99 | `102 / 140 / 169 ms` |
| 峰值 RSS | `2735.96 MB` |
| 最终 RSS | `1707.55 MB` |
| worker recycle 次数 | `36` |
| warnings | `0` |

## 4. 关键观察

### 4.1 曲线呈明显锯齿，不是单向失控

- RSS 从 `1008.13 MB` 持续涨到 `2735.96 MB`
- 在 recycle 发生后会明显回落：
  - `550 -> 600` 任务附近，recycle 从 `0` 跳到 `12`，RSS 从高位回落到 `1541.61 MB`
  - `1150 -> 1250` 任务区间，recycle 从 `18` 增到 `24`，RSS 继续分段回落到 `1309.34 MB`
  - `1700 -> 1850` 区间，recycle 从 `26` 增到 `36`，RSS 从 `2558.83 MB` 回落到 `1343.53 MB`

结论：

- 这更像“worker 生命周期内状态累积 + recycle 后释放”，不是整个进程一旦涨上去就再也不掉。

### 4.2 RSS 增长没有跟随 V8 heap / external / arrayBuffers

从首样本到峰值样本（`50 -> 550` 任务）：

| 指标 | 起点 | 峰值 | 增量 |
|---|---:|---:|---:|
| RSS | `1008.13` | `2735.96` | `+1727.83 MB` |
| heapUsed | `13.16` | `11.51` | `-1.65 MB` |
| heapTotal | `16.37` | `17.14` | `+0.77 MB` |
| external | `2.09` | `2.09` | `0 MB` |
| arrayBuffers | `0.58` | `0.58` | `0 MB` |

结论：

- 这组 `mtp=50` 数据里，RSS 的上涨基本不能归因到 JS heap、external 或 ArrayBuffer。
- 更像 native 侧 / isolate 内部状态 / 非 JS heap 资源在 worker 生命周期内累积。

### 4.3 recycle 会带来吞吐波谷

- `tasksDone=600` 时窗口 req/s 掉到 `62.81`
- `tasksDone=1200` 时窗口 req/s 掉到 `80.52`
- `tasksDone=1750~1850` 区间又出现一轮 `87.41 -> 92.94 -> 85.91`

结论：

- recycle 能压回 RSS，但会带来可见的吞吐波谷。
- 所以后续矩阵重点就是看：不同 `maxTasksPerWorker` 下，究竟是“更频繁 recycle 的波谷成本大”，还是“让 worker 活太久的累计成本大”。

## 5. 下一步建议

- 先跑完整矩阵：

```bash
node benchmarks/longevity-runner.js
```

- 如果只看某一个点：

```bash
node benchmarks/longevity-runner.js --max-tasks-per-worker 100
node benchmarks/longevity-runner.js --max-tasks-per-worker 200
node benchmarks/longevity-runner.js --max-tasks-per-worker 500
node benchmarks/longevity-runner.js --max-tasks-per-worker 1000
```

- 看矩阵时重点盯三类信号：
  - `peakRss` 是否随 `maxTasksPerWorker` 单调上升
  - `workerRecycles` 与 `req/s` 是否存在明显拐点
  - `RSS` 涨幅是否仍持续与 `heap/external/arrayBuffers` 脱钩

## 6. 完整矩阵结果

本轮已实际跑完以下配置：

- `10`：`benchmarks/results/longevity-mtp10-20260306_185515.json`
- `25`：`benchmarks/results/longevity-mtp25-20260306_185541.json`
- `50`：`benchmarks/results/longevity-mtp50-20260306_185602.json`
- `100`：`benchmarks/results/longevity-mtp100-20260306_185625.json`
- `200`：`benchmarks/results/longevity-mtp200-20260306_185648.json`
- `500`：`benchmarks/results/longevity-mtp500-20260306_190422.json`
- `1000`：`benchmarks/results/longevity-mtp1000-20260306_190250.json`

矩阵汇总：

| maxTasksPerWorker | req/s | p95 | p99 | peak RSS (MB) | final RSS (MB) | recycles | warnings |
|---|---:|---:|---:|---:|---:|---:|---:|
| `10` | `80.24` | `139` | `163` | `1071.73` | `1049.90` | `197` | `0` |
| `25` | `99.25` | `133` | `148` | `1752.00` | `1501.20` | `74` | `0` |
| `50` | `88.87` | `134` | `166` | `2856.39` | `1731.16` | `36` | `0` |
| `100` | `92.49` | `131` | `155` | `4119.38` | `3405.39` | `12` | `0` |
| `200` | `34.98` | `2270` | `4279` | `5901.56` | `5901.56` | `1` | `0` |
| `500` | `53.94` | `344` | `3315` | `5910.50` | `5910.50` | `0` | `0` |
| `1000` | `27.59` | `573` | `5628` | `5845.25` | `5845.25` | `0` | `0*` |

`0*` 说明：`mtp=1000` 单跑结束时，CLI 上实际出现了一条 `MaxListenersExceededWarning`，但该 warning 没有被收进 JSON 的 `warnings` 数组，说明 warning 触发时机落在当前采样/清理窗口之外，后续如要严谨归档，需要再补一层更外侧的 warning 落盘逻辑。

### 6.1 矩阵结论

- `mtp=25` 是当前这轮里最平衡的点：
  - 吞吐最高，`99.25 req/s`
  - RSS 仍控制在 `1.75GB` 量级
  - recycle 次数 `74`，虽然不少，但还没明显把吞吐打崩
- `mtp=50` 和 `mtp=100` 进入“可跑但明显增重”的中间带：
  - 吞吐还在 `88~92 req/s`
  - peak RSS 已升到 `2.86GB / 4.12GB`
  - recycle 明显减少，但内存峰值抬得很快
- `mtp>=200` 后进入灾难区：
  - `200`：`req/s` 掉到 `34.98`，`p95/p99=2270/4279 ms`
  - `500`：`req/s=53.94`，`p99=3315 ms`
  - `1000`：`req/s=27.59`，`p99=5628 ms`
  - 这三档的 peak RSS 全都在 `5.8~5.9GB`

### 6.2 最关键的归因信号

- `maxTasksPerWorker` 增大后，recycle 急剧减少：
  - `10 -> 25 -> 50 -> 100 -> 200 -> 500 -> 1000`
  - `197 -> 74 -> 36 -> 12 -> 1 -> 0 -> 0`
- 同时 RSS 峰值几乎单调抬升到 `~5.9GB`
- 但 `heapUsed / external / arrayBuffers` 没有同步抬升到同量级

这说明长跑退化的主因更像：

- worker 生命周期内 native / isolate / 非 JS heap 状态累积
- recycle 是当前唯一能明显压回 RSS 的机制
- 一旦 recycle 不再及时发生，吞吐和尾延迟会一起塌

### 6.3 为什么 `500` 比 `200` 看起来 req/s 更高

表面上 `500` 的总体吞吐 `53.94 req/s` 高于 `200` 的 `34.98 req/s`，但这不代表 `500` 更健康。

更合理的解释是：

- `200` 在后半段更早进入极端长尾，窗口被持续拖慢
- `500` 有较长的“前半段尚可”区间，把 overall 均值抬高了一些
- 两者最终都在接近 `5.9GB` RSS 时表现出非常差的尾延迟和明显退化

所以判断边界不应只看 overall req/s，而要同时看：

- peak/final RSS
- p95/p99
- recycle 是否基本消失
