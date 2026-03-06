# C1 减观测实验

- 时间：2026-03-06T12:03:04.423Z
- 重复次数：3
- 控制组：当前默认基线（debug=false）
- 实验组：设置 `LEAP_PERF_DISABLE_OBSERVE=1`，短路 native 观测门控

| 指标 | 基线 | C1 减观测 | 变化 |
|---|---:|---:|---:|
| req/s | 110.23 | 114.34 | 3.73% |
| p99 (ms) | 147 | 148 | 0.68% |
| CPU% peak | 98.9 | 97.65 | -1.26% |
| RSS peak (MB) | 2620.27 | 2606.75 | -0.52% |

- JSON 结果：benchmarks/results/experiment-c1-reduce-observe-20260306_200158.json
- 控制组中位 run：benchmarks/results/baseline-baseline-20260306_200222.json
- 实验组中位 run：benchmarks/results/baseline-baseline-20260306_200254.json
