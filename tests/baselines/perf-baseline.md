# Perf Baseline (初版)

更新日期：2026-02-22

## 基线运行信息

- 执行时间：2026-02-22 22:47（本地时区）
- 统一入口：`tests/runners/run-perf.ps1`
- 结果目录：`tests/results/20260222_224717_perf`
- 汇总文件：`tests/results/20260222_224717_perf/perf-summary.md`

## 总览

- `perf`：5/5 通过
- `summary.txt`：`tests/results/20260222_224717_perf/summary.txt`

## 关键结果（首轮清洁前基线）

### 1) `check-thread-mainline-gate.js`

- 结果：PASS（脚本退出码 `0`）
- 配置：`poolSize=4`, `totalTasks=300`, `concurrency=16`
- 吞吐：`3333.33 rps`
- 延迟：`p50=1ms`, `p90=2ms`, `p99=2ms`, `max=2ms`
- RSS 增长：`48.91 MB`
- Gate 阈值（脚本内）：`maxP99Ms=1200`, `maxRssGrowthMb=120`
- 原始输出：`tests/results/20260222_224717_perf/outputs/01_gate-thread-mainline.stdout.log`

### 2) `bench-thread-vs-process.js`

- 结果：PASS（脚本退出码 `0`）
- 结果文件：`benchmarks/thread-vs-process-20260222_224724.json`
- Process 池：
  - 吞吐：`1142.86 rps`
  - 延迟：`p99=2ms`
  - Host RSS：`33,624,064` bytes
  - Worker RSS Total：`232,628,224` bytes
- Thread 池：
  - 吞吐：`1257.86 rps`
  - 延迟：`p99=2ms`
  - Host RSS：`147,263,488` bytes
  - Worker RSS Total：`589,053,952` bytes
- 观察：本次线程池吞吐高于进程池（约 `+10.1%`），但内存占用显著更高（需持续跟踪）。
- 原始输出：`tests/results/20260222_224717_perf/outputs/02_bench-thread-vs-process.stdout.log`

### 3) `bench-process-pool.js`

- 结果：PASS（脚本退出码 `0`）
- 结果文件：`benchmarks/process-pool-20260222_224730.json`
- `baseline-light`
  - 吞吐：`12000 rps`
  - 延迟：`p99=1ms`
  - 回收/拉起：`recycled=0`, `respawned=0`
- `heavy-stable`
  - 吞吐：`2439.02 rps`
  - 延迟：`p99=3ms`
  - 回收/拉起：`recycled=0`, `respawned=0`
- `recycle-check`
  - 吞吐：`1100.92 rps`
  - 延迟：`p99=1ms`
  - 回收/拉起：`recycled=5`, `respawned=4`（符合回收场景预期）
- 原始输出：`tests/results/20260222_224717_perf/outputs/03_bench-process-pool.stdout.log`

### 4) `bench-dom-multi-scale.js`

- 结果：PASS（脚本退出码 `0`）
- 结果文件：`benchmarks/dom-multi-scale-20260222_224738.json`
- 规模对比（`spec_rps / js_rps`）
  - `10` 节点：`0.976`（JS 略优）
  - `50` 节点：`1.037`（接近）
  - `200` 节点：`1.093`（Spec 优势明显）
  - `500` 节点：`1.041`（接近）
- P99 对比
  - `10`：JS `4ms` / Spec `5ms`
  - `50`：JS `5ms` / Spec `6ms`
  - `200`：JS `9ms` / Spec `10ms`
  - `500`：JS `19ms` / Spec `18ms`
- 观察：输出报告给出的拐点约为 `~200 nodes`。
- 原始输出：`tests/results/20260222_224717_perf/outputs/04_bench-dom-multi-scale.stdout.log`

### 5) `bench-dom-final-shape-baseline.js`

- 结果：PASS（脚本退出码 `0`）
- 结果文件：`benchmarks/dom-final-shape-baseline-20260222_224745.json`
- JS 吞吐：`1098.9 rps`
- Spec 吞吐：`1333.33 rps`
- `gate_spec`：`PASS`
- 关键门禁检查（脚本输出）
  - `RPS_spec >= RPS_js * 0.98`：PASS
  - `p99_spec <= p99_js * 1.05`：PASS（实际 `9`，阈值 `<= 9.45`）
  - `rssGrowth_spec <= rssGrowth_js * 1.10`：PASS（实际 `379.53`，阈值 `<= 566.23`）
  - `failureRate_spec <= failureRate_js`：PASS
  - `timeoutRate_spec <= timeoutRate_js`：PASS
- 原始输出：`tests/results/20260222_224717_perf/outputs/05_bench-dom-final-shape-baseline.stdout.log`

## 备注

- 本基线为“清洁前首轮”样本，后续文档迁移/清洁过程中建议在关键节点复跑并与本文件对比。
- 如脚本参数（任务数、并发度、池大小）变更，应新建一版基线，不直接覆盖同口径数据。
