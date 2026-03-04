# Regression / Perf Thresholds（初版）

更新日期：2026-02-22

说明：

- 本文件记录当前回归与压测门限的“初版约定”。
- 优先以脚本内已实现门禁为准；本文件用于集中说明与后续调优。

## 1. 已落地（以脚本为准）

### `leap-env/scripts/check-thread-mainline-gate.js`

- `failed <= 0`
- `successRatio >= 1`
- `p99 <= 1200ms`
- `rssGrowth <= 120MB`

说明：当前门限明显偏宽（适合作为主线健康兜底），后续可基于稳定样本收紧。

### `leap-env/scripts/bench-dom-final-shape-baseline.js`

- `RPS_spec >= RPS_js * 0.98`
- `p99_spec <= p99_js * 1.05`
- `rssGrowth_spec <= rssGrowth_js * 1.10`
- `failureRate_spec <= failureRate_js`
- `timeoutRate_spec <= timeoutRate_js`

说明：这是当前最接近“自动性能门禁”的对比基准，应优先保持稳定。

## 2. 暂定观察阈值（尚未脚本化强制）

### `bench-thread-vs-process.js`（线程池 vs 进程池）

- 目标：线程池主线性能不劣化，且延迟不明显恶化
- 建议观察项
  - `thread throughput >= process throughput * 0.95`
  - `thread p99 <= process p99 + 1ms`
- 暂不建议加内存强门禁（当前线程池 RSS 结构与进程池口径差异较大）

### `bench-dom-multi-scale.js`（DOM 多规模）

- 目标：识别不同规模下 Spec/JS 的性能拐点变化
- 建议观察项
  - 关注 `200` / `500` 节点下 `spec_rps / js_rps`
  - 关注 `Spec advantage breakeven` 是否显著右移
- 暂不做硬门禁（受机器负载波动影响较大）

### `bench-process-pool.js`（进程池稳定性）

- `baseline-light` / `heavy-stable`：应保持 `failed=0`, `timedOut=0`
- `recycle-check`：允许出现 `recycled/respawned > 0`，但应保持 `failed=0`
- 后续可考虑加 `p99` 软阈值（如 `<= 5ms`，以多次样本确认后决定）

## 3. 与回归档位的关系

- `smoke`：功能主链路，不做性能门禁
- `full`：功能完整回归，性能仅作日志观察
- `perf`：性能门禁与基线沉淀主入口
- `manual`：人工验证项（不纳入自动门禁）

## 4. 后续收紧策略（建议）

1. 连续保存至少 3 轮同口径 `perf` 基线（空闲机器/同构环境）。
2. 先收紧 `check-thread-mainline-gate` 的 `p99` / `rssGrowth`。
3. 再将 `bench-thread-vs-process` 的吞吐/延迟对比条件脚本化。
4. 对 `bench-dom-multi-scale` 仅做趋势告警，不建议先上硬失败门禁。
