# H5ST 性能压测报告（详细版）

## 1. 测试结论（先看结果）

- 当前机器上，`h5st.js` 单机单实例的**短跑上限**大约在 **100 req/s**（ThreadPool）。
- **最佳平衡点**：`ThreadPool pool=12, concurrency=48`  
  吞吐 `100.22 req/s`，`p99=148ms`，总 RSS 约 `1.63 GB`。
- **极限吞吐点**：`ThreadPool pool=16, concurrency=64`  
  吞吐仅再提升到 `103.09 req/s`（+2.9%），但 `p99` 上升到 `207ms`（明显变差）。
- **持续运行必须配置 worker 回收**：  
  在 `ThreadPool pool=12/concurrency=48` 下，`maxTasksPerWorker=1000` 的 2000 任务测试出现严重退化（吞吐掉到 `14.55 req/s`，RSS 到 `6.16 GB`）；  
  改为 `maxTasksPerWorker=50` 后恢复稳定（2000 任务吞吐 `87.37 req/s`，p99 `156ms`，RSS `1.74 GB`）。
- 同档位下，`ThreadPool` 相比 `ProcessPool`：
  - 吞吐高约 `9%`
  - 总内存低约 `23%~27%`
  - 尾延迟（p99）基本同级，部分档位 Thread 略优。

## 2. 测试对象与环境

- 工作负载脚本：`work/h5st.js`
- 脚本大小：`486,286 bytes`
- 压测时间：`2026-03-03`
- 系统：Windows x64
- Node：`v20.19.2`
- CPU：`Intel(R) Core(TM) i9-9900KS CPU @ 4.00GHz`
- 物理核/线程：`8C/16T`
- 内存：`31.93 GB`

## 3. 测试方法与口径

- 压测脚本：`tests/scripts/perf/bench-h5st-detailed.js`
- 每个 case 固定 `320` 请求，统计：
  - `throughput (req/s)`
  - `p50/p90/p95/p99/max`（来自每个任务 `durationMs`）
  - 成功率、warmup、总耗时
  - 内存 RSS
- Pool 参数：
  - `taskTimeoutMs=15000`
  - `workerInitTimeoutMs=30000`
  - `maxTasksPerWorker=500`

### 内存口径说明（重要）

- `ThreadPool` 是同一进程多线程，worker 内存快照里的 RSS 会重复统计同一个 PID。  
  所以 Thread 场景的“总 RSS”以 **host.rss** 为准。
- `ProcessPool` 是多进程，total RSS = **host.rss + workerRssTotal**。

## 4. 全量结果表

| Case | 模式 | Pool | 并发 | 吞吐(req/s) | p50(ms) | p95(ms) | p99(ms) | max(ms) | 成功/失败 | 总RSS(MB) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| thread-p1-c1 | Thread | 1 | 1 | 18.59 | 53 | 57 | 61 | 71 | 320/0 | 889.29 |
| thread-p2-c8 | Thread | 2 | 8 | 36.80 | 53 | 58 | 64 | 69 | 320/0 | 993.51 |
| thread-p4-c16 | Thread | 4 | 16 | 66.60 | 58 | 67 | 72 | 77 | 320/0 | 1189.55 |
| thread-p8-c32 | Thread | 8 | 32 | 92.65 | 83 | 97 | 103 | 105 | 320/0 | 1599.37 |
| thread-p12-c48 | Thread | 12 | 48 | 100.22 | 113 | 138 | 148 | 159 | 320/0 | 1634.26 |
| thread-p16-c64 | Thread | 16 | 64 | 103.09 | 141 | 189 | 207 | 238 | 320/0 | 1888.26 |
| process-p2-c8 | Process | 2 | 8 | 33.77 | 53 | 58 | 63 | 71 | 320/0 | 1290.77 |
| process-p4-c16 | Process | 4 | 16 | 60.59 | 58 | 68 | 74 | 76 | 320/0 | 1617.69 |
| process-p8-c32 | Process | 8 | 32 | 84.86 | 83 | 98 | 103 | 111 | 320/0 | 2198.63 |

## 5. 关键分析

### 5.1 扩展性（ThreadPool）

- 从 `p1/c1 -> p8/c32`，吞吐从 `18.59 -> 92.65`，约 **4.98x**。
- 从 `p8/c32 -> p12/c48`，吞吐只增加 **8.2%**（92.65 -> 100.22），但 p99 从 `103 -> 148ms`。
- 从 `p12/c48 -> p16/c64`，吞吐再增 **2.9%**，p99 从 `148 -> 207ms`。  
  说明已接近饱和，继续拉并发主要换来尾延迟恶化。

### 5.2 Thread vs Process（同档位对比）

| Pool/并发 | Thread 吞吐 | Process 吞吐 | Thread/Process 吞吐比 | Thread RSS | Process RSS | Thread/Process RSS比 |
|---|---:|---:|---:|---:|---:|---:|
| 2/8 | 36.80 | 33.77 | 1.09x | 993.51MB | 1290.77MB | 0.77x |
| 4/16 | 66.60 | 60.59 | 1.10x | 1189.55MB | 1617.69MB | 0.74x |
| 8/32 | 92.65 | 84.86 | 1.09x | 1599.37MB | 2198.63MB | 0.73x |

结论：在这类 `h5st` 任务上，ThreadPool 的性价比更高（更快、更省内存）。

### 5.3 你提到“为什么看起来并发少”

- 之前的“并发低”是统计口径问题（把整批任务脚本当 1 请求计）。
- 这次按真实单任务统计后，当前单实例吞吐是 `~100 req/s` 级，不是 `~3 req/s`。

### 5.4 长跑稳定性补测（关键）

以下是额外补测（不在 320 任务矩阵内）：

| 场景 | 配置 | 任务数 | 成功/失败 | 吞吐(req/s) | p99(ms) | RSS(MB) | 结论 |
|---|---|---:|---|---:|---:|---:|---|
| Thread 长跑（高阈值回收） | `p12/c48, maxTasksPerWorker=1000` | 2000 | 1999/1 | 14.55 | 5871 | 6162.19 | 明显退化 |
| Thread 长跑（低阈值回收） | `p12/c48, maxTasksPerWorker=50` | 2000 | 2000/0 | 87.37 | 156 | 1735.93 | 稳定可用 |
| Process 长跑（高阈值回收） | `p8/c32, maxTasksPerWorker=1000` | 2000 | 2000/0 | 85.35 | 117 | 5754.21 | 吞吐稳定但内存高 |
| Process 长跑（中阈值回收） | `p8/c32, maxTasksPerWorker=200` | 2000 | 2000/0 | 83.26 | 111 | 2197.58 | 吞吐近似，内存明显下降 |

附加异常：

- `ThreadPool p12/c48, totalTasks=5000, maxTasksPerWorker=1000` 发生 Node OOM（`Fatal JavaScript out of memory`）。
- 长跑中出现 `MaxListenersExceededWarning`，说明 worker 生命周期/监听器管理需要进一步审查。

## 6. 参数建议（可直接落地）

### 突发流量（短时压峰）

- `poolSize=12`
- `concurrency=48`
- `maxTasksPerWorker=500`（可接受）
- 预期：`~100 req/s`，`p99 ~148ms`，RSS `~1.6GB`

### 持续流量（推荐默认）

- `ThreadPool: poolSize=12, concurrency=48, maxTasksPerWorker=50`
- 预期（2000任务样本）：`~87 req/s`，`p99 ~156ms`，RSS `~1.7GB`
- 说明：吞吐比短跑峰值低，但避免长跑退化/超高内存。

### 高隔离方案（可替代）

- `ProcessPool: poolSize=8, concurrency=32, maxTasksPerWorker=200`
- 预期（2000任务样本）：`~83 req/s`，`p99 ~111ms`，RSS `~2.2GB`
- 说明：更稳定、隔离更强，但内存成本高于 ThreadPool。

### 激进吞吐档位（不建议长期默认）

- `poolSize=16`
- `concurrency=64`
- 预期：`~103 req/s`，但 `p99 ~207ms`，尾延迟明显变差。
- 若持续运行，请务必同时下调 `maxTasksPerWorker`。

## 7. 容量估算（给部署用）

- 以“持续流量推荐档”（Thread `~87 req/s`）估算，按 **70% 安全水位** 计：`~60 req/s/实例`。
- 目标 QPS 估算：
  - `200 req/s` -> 至少 `4` 实例
  - `500 req/s` -> 至少 `9` 实例
  - `1000 req/s` -> 至少 `17` 实例

## 8. 产物文件

- 原始 JSON：`benchmarks/h5st-detailed-20260303_234155.json`
- 长跑补测 JSON：`benchmarks/h5st-soak-supplement-20260303.json`
- 压测脚本：`tests/scripts/perf/bench-h5st-detailed.js`

## 9. 复现实验命令

```powershell
$env:LEAPVM_LOG_LEVEL='error'
$env:LEAPVM_HOST_LOG_LEVEL='error'
node tests/scripts/perf/bench-h5st-detailed.js
```
