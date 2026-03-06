# C2 减桥接实验

- 时间：2026-03-06T12:04:22.477Z
- 重复次数：3
- 控制组：当前默认基线
- 实验组：设置 `LEAP_PERF_DISPATCH_CACHE=1`，在 JS Impl 侧启用任务级热点缓存
- 缓存 API：`Navigator.userAgent`、`Storage.getItem`、`Document.body`、`Document.cookie`、`Location.host`

| 指标 | 基线 | C2 减桥接 | 变化 |
|---|---:|---:|---:|
| req/s | 105.06 | 105.37 | 0.3% |
| p99 (ms) | 157 | 164 | 4.46% |
| CPU% peak | 97.69 | 98.23 | 0.55% |
| RSS peak (MB) | 2599.6 | 2604.59 | 0.19% |

- JSON 结果：benchmarks/results/experiment-c2-reduce-bridge-20260306_200318.json
- 控制组中位 run：benchmarks/results/baseline-baseline-20260306_200339.json
- 实验组中位 run：benchmarks/results/baseline-baseline-20260306_200328.json
