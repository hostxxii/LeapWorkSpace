# `tests/scripts/` Migration Inventory (E1)

更新日期：2026-02-28

说明：

- 本台账用于支撑 `REPO_REORG_TODO_STRICT_SSOT.md` 的 `E1. 盘点与分类（先做）`。
- 统计范围：`leap-env/scripts/`、`leap-vm/scripts/` 当前文件（含非脚本产物单独标记）。
- `root编排` 列含义：
  - `smoke/full/perf`：已纳入 `tests/manifest/*`
  - `manual`：已纳入 `tests/runners/run-manual.ps1`
  - `-`：未纳入 root 编排
  - `via tests/scripts/*`：原路径已迁移为 wrapper，root 实际指向新路径
- `跨模块候选` 用于标记后续 `E4` 优先迁移对象（尤其 root 已纳入的集成/压测脚本）。

## 摘要

- `leap-env/scripts/`：`31` 个 `.js` 脚本 + `3` 个 `.txt` 非脚本产物 — **全部完成迁移**
- `leap-vm/scripts/`：`10` 个 `.js` 脚本 — **全部完成迁移**
- 所有脚本实体文件均已集中到 `tests/scripts/`，原路径保留 wrapper 兼容壳

## 当前已迁移到 `tests/scripts/*` 的脚本（全部）

| Root 路径 | 原路径 | 分类 | root编排 | 兼容壳 |
| --- | --- | --- | --- | --- |
| `tests/scripts/integration/test-leapenv-new-features.js` | `leap-env/scripts/test-new-features.js` | `smoke/full` | `smoke, full` | 是 |
| `tests/scripts/integration/test-leapenv-hook-isolation.js` | `leap-env/scripts/test-hook-isolation.js` | `smoke/full` | `smoke, full` | 是 |
| `tests/scripts/integration/test-leapenv-thread-pool-stability.js` | `leap-env/scripts/test-thread-pool-stability.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dom-minimal.js` | `leap-env/scripts/test-dom-minimal.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dom-m2-minimal.js` | `leap-env/scripts/test-dom-m2-minimal.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dom-m3-minimal.js` | `leap-env/scripts/test-dom-m3-minimal.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dom-native-ssot-consistency.js` | `leap-env/scripts/test-dom-native-ssot-consistency.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dom-pool-isolation.js` | `leap-env/scripts/test-dom-pool-isolation.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-iframe.js` | `leap-env/scripts/test_iframe.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dom-memory-leak.js` | `leap-env/scripts/test-dom-memory-leak.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dod-layout.js` | `leap-env/scripts/test-dod-layout.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dom-handle-guard.js` | `leap-env/scripts/test-dom-handle-guard.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dom-native-trace.js` | `leap-env/scripts/test-dom-native-trace.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dod-integration.js` | `leap-env/scripts/test-dod-integration.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-dod-converter.js` | `leap-env/scripts/test-dod-converter.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-threadpool-dod.js` | `leap-env/scripts/test-threadpool-dod.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-branded-collections.js` | `leap-env/scripts/test-branded-collections.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-canvas-minimal.js` | `leap-env/scripts/test-canvas-minimal.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-crypto-minimal.js` | `leap-env/scripts/test-crypto-minimal.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-fingerprint-snapshot.js` | `leap-env/scripts/test-fingerprint-snapshot.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-placeholder-policy.js` | `leap-env/scripts/test-placeholder-policy.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-signature-core.js` | `leap-env/scripts/test-signature-core.js` | `full` | `full` | 是 |
| `tests/scripts/integration/test-leapenv-bom-ownership.js` | `leap-env/scripts/test-bom-ownership.js` | `debug` | `-` | 是 |
| `tests/scripts/integration/test-leapenv-navigator-instance-skeleton.js` | `leap-env/scripts/test-navigator-instance-skeleton.js` | `full` | `-` | 是 |
| `tests/scripts/integration/test-leapenv-gvm-isolation.js` | `leap-env/scripts/test-gvm-isolation.js` | `debug` | `-` | 是 |
| `tests/scripts/integration/test-leapenv-leapvm-worker.js` | `leap-env/scripts/test-leapvm-worker.js` | `experimental` | `-` | 是 |
| `tests/scripts/integration/test-leapenv-simple-worker.js` | `leap-env/scripts/test-simple-worker.js` | `experimental` | `-` | 是 |
| `tests/scripts/integration/test-leapenv-worker-threads.js` | `leap-env/scripts/test-worker-threads.js` | `experimental` | `-` | 是 |
| `tests/scripts/integration/check-entry-coverage.js` | `leap-env/scripts/check-entry-coverage.js` | `debug` | `-` | 是 |
| `tests/scripts/perf/check-thread-mainline-gate.js` | `leap-env/scripts/check-thread-mainline-gate.js` | `perf` | `perf` | 是 |
| `tests/scripts/perf/bench-dom-multi-scale.js` | `leap-env/scripts/bench-dom-multi-scale.js` | `perf` | `perf` | 是 |
| `tests/scripts/perf/bench-process-pool.js` | `leap-env/scripts/bench-process-pool.js` | `perf` | `perf` | 是 |
| `tests/scripts/perf/bench-thread-vs-process.js` | `leap-env/scripts/bench-thread-vs-process.js` | `perf` | `perf` | 是 |
| `tests/scripts/perf/bench-dom-final-shape-baseline.js` | `leap-env/scripts/bench-dom-final-shape-baseline.js` | `perf` | `perf` | 是 |
| `tests/scripts/perf/bench-css-vs-dod.js` | `leap-env/scripts/bench-css-vs-dod.js` | `perf` | `-` | 是 |
| `tests/scripts/perf/bench-threadpool-dod.js` | `leap-env/scripts/bench-threadpool-dod.js` | `perf` | `-` | 是 |
| `tests/scripts/perf/stress-test-threadpool-dod.js` | `leap-env/scripts/stress-test-threadpool-dod.js` | `perf` | `-` | 是 |
| `tests/scripts/leapvm/test_api.js` | `leap-vm/scripts/test_api.js` | `smoke/full` | `smoke, full` | 是 |
| `tests/scripts/leapvm/test_dom_native_parse.js` | `leap-vm/scripts/test_dom_native_parse.js` | `full` | `-` | 是 |
| `tests/scripts/leapvm/test_globalthis.js` | `leap-vm/scripts/test_globalthis.js` | `smoke/full` | `smoke, full` | 是 |
| `tests/scripts/leapvm/test_highres.js` | `leap-vm/scripts/test_highres.js` | `manual` | `-` | 是 |
| `tests/scripts/leapvm/test_hooks_granular.js` | `leap-vm/scripts/test_hooks_granular.js` | `debug` | `-` | 是 |
| `tests/scripts/leapvm/test_inspect_brk.js` | `leap-vm/scripts/test_inspect_brk.js` | `manual` | `manual` | 是 |
| `tests/scripts/leapvm/test_native_wrapper.js` | `leap-vm/scripts/test_native_wrapper.js` | `debug` | `-` | 是 |
| `tests/scripts/leapvm/test_shutdown.js` | `leap-vm/scripts/test_shutdown.js` | `full` | `-` | 是 |
| `tests/scripts/leapvm/test_timers.js` | `leap-vm/scripts/test_timers.js` | `smoke/full` | `smoke, full` | 是 |
| `tests/scripts/leapvm/test_with_skeleton.js` | `leap-vm/scripts/test_with_skeleton.js` | `full` | `-` | 是 |

## `leap-env/scripts/` 盘点（`.js`）

| 脚本 | 分类 | root编排 | 迁移状态 | 跨模块候选 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `bench-css-vs-dod.js` | `perf` | `perf (via tests/scripts/perf)` | wrapper | 否 | CSS 兼容路径 / DoD 基准 |
| `bench-dom-final-shape-baseline.js` | `perf` | `perf (via tests/scripts/perf)` | wrapper | 是 | 已迁移（E4 批次） |
| `bench-dom-multi-scale.js` | `perf` | `perf (via tests/scripts/perf)` | wrapper | 是 | 已迁移（E4 批次） |
| `bench-process-pool.js` | `perf` | `perf (via tests/scripts/perf)` | wrapper | 是 | 已迁移（E4 批次） |
| `bench-thread-vs-process.js` | `perf` | `perf (via tests/scripts/perf)` | wrapper | 是 | 已迁移样板 |
| `bench-threadpool-dod.js` | `perf` | `perf (via tests/scripts/perf)` | wrapper | 是 | ThreadPool + DoD 基准 |
| `check-entry-coverage.js` | `debug` | `integration (via tests/scripts/integration)` | wrapper | 否 | skeleton 构建覆盖检查 |
| `check-thread-mainline-gate.js` | `perf` | `perf (via tests/scripts/perf)` | wrapper | 是 | 已迁移（E4 批次） |
| `stress-test-threadpool-dod.js` | `perf` | `perf (via tests/scripts/perf)` | wrapper | 是 | 长时压力测试 |
| `test_iframe.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-bom-ownership.js` | `debug` | `integration (via tests/scripts/integration)` | wrapper | 是 | 诊断类归属检查 |
| `test-branded-collections.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移 |
| `test-canvas-minimal.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移 |
| `test-crypto-minimal.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移 |
| `test-dod-converter.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次，基线已知失败项之一） |
| `test-dod-integration.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-dod-layout.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-dom-handle-guard.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-dom-m2-minimal.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-dom-m3-minimal.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-dom-memory-leak.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-dom-minimal.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-dom-native-ssot-consistency.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-dom-native-trace.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 原生 trace（已迁移 E4 批次） |
| `test-dom-pool-isolation.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次，基线已知失败项之一） |
| `test-fingerprint-snapshot.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移 |
| `test-gvm-isolation.js` | `debug` | `integration (via tests/scripts/integration)` | wrapper | 是 | 线程隔离诊断（日志写入 tests/scripts/integration/） |
| `test-hook-isolation.js` | `smoke/full` | `smoke, full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-leapvm-worker.js` | `experimental` | `integration (via tests/scripts/integration)` | wrapper | 否 | worker 实验脚本（日志写入 tests/scripts/integration/） |
| `test-navigator-instance-skeleton.js` | `full` | `integration (via tests/scripts/integration)` | wrapper | 是 | skeleton 实例校验 |
| `test-new-features.js` | `smoke/full` | `smoke, full (via tests/scripts/integration)` | wrapper | 是 | 已迁移样板 |
| `test-placeholder-policy.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移 |
| `test-signature-core.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移 |
| `test-simple-worker.js` | `experimental` | `integration (via tests/scripts/integration)` | wrapper | 否 | worker_threads 最小实验（日志写入 tests/scripts/integration/） |
| `test-thread-pool-stability.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-threadpool-dod.js` | `full` | `full (via tests/scripts/integration)` | wrapper | 是 | 已迁移（E4 批次） |
| `test-worker-threads.js` | `experimental` | `integration (via tests/scripts/integration)` | wrapper | 否 | worker + leap-vm 试验 |

## `leap-env/scripts/` 非脚本产物（不纳入迁移计数）

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `test-isolation-log.txt` | 日志产物（已删除） | 日志现写入 `tests/scripts/integration/test-leapenv-gvm-isolation.log` |
| `test-leapvm-log.txt` | 日志产物（已删除） | 日志现写入 `tests/scripts/integration/test-leapenv-leapvm-worker.log` |
| `test-log.txt` | 日志产物（已删除） | 日志现写入 `tests/scripts/integration/test-leapenv-simple-worker.log` |

## `leap-vm/scripts/` 盘点（`.js`）

| 脚本 | 分类 | root编排 | 迁移状态 | 跨模块候选 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `test_api.js` | `smoke/full` | `smoke, full (via tests/scripts/leapvm)` | wrapper | 否 | root smoke 基础 API |
| `test_dom_native_parse.js` | `full` | `leapvm (via tests/scripts/leapvm)` | wrapper | 否 | 原生 DOM 解析能力 |
| `test_globalthis.js` | `smoke/full` | `smoke, full (via tests/scripts/leapvm)` | wrapper | 否 | root smoke |
| `test_highres.js` | `manual` | `leapvm (via tests/scripts/leapvm)` | wrapper | 否 | 输出观察型脚本 |
| `test_hooks_granular.js` | `debug` | `leapvm (via tests/scripts/leapvm)` | wrapper | 否 | Hook 细粒度功能演示 |
| `test_inspect_brk.js` | `manual` | `manual (via tests/scripts/leapvm)` | wrapper | 否 | root manual 入口 |
| `test_native_wrapper.js` | `debug` | `leapvm (via tests/scripts/leapvm)` | wrapper | 否 | NativeWrapper 演示/诊断 |
| `test_shutdown.js` | `full` | `leapvm (via tests/scripts/leapvm)` | wrapper | 否 | 优雅关闭验证 |
| `test_timers.js` | `smoke/full` | `smoke, full (via tests/scripts/leapvm)` | wrapper | 否 | root smoke |
| `test_with_skeleton.js` | `full` | `leapvm (via tests/scripts/leapvm)` | wrapper | 是 | 依赖 `leap-env` 构建产物 |

## `E4` 迁移状态（全部完成）

所有脚本已完成迁移：

- `leap-env/scripts/` — 31 个 `.js` 脚本全部变为 wrapper，实体文件集中于 `tests/scripts/integration/` 和 `tests/scripts/perf/`
- `leap-vm/scripts/` — 10 个 `.js` 脚本全部变为 wrapper，实体文件集中于 `tests/scripts/leapvm/`
