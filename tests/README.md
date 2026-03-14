# `tests/`（根回归编排模块）

`tests/` 是仓库统一回归编排、结果产物输出和脚本归档模块。

本 README 只保留模块内结构索引与编排概览；具体脚本语义与操作细节见 `manual/`。

## 模块内编排概览

```text
runners/*.ps1
    -> manifest/*.ps1
        -> tests/scripts/* (优先)
        -> 少量模块私有脚本（按策略保留）
    -> results/YYYYMMDD_HHMMSS_<profile>/
        -> summary.txt / summary.json / outputs/*
```

## 模块目录索引

- `runners/`：统一入口脚本（`run-smoke.ps1` / `run-full.ps1` / `run-perf.ps1` / `run-manual.ps1`）
- `manifest/`：各 profile 编排清单（命令名、路径、参数）
- `scripts/`：物理迁移后的集成/压测/手工脚本归档
- `results/`：运行结果产物（按时间戳目录）
- `baselines/`：性能基线与阈值文档

## 运行入口（PowerShell）

```powershell
pwsh -File tests/runners/run-smoke.ps1
pwsh -File tests/runners/run-full.ps1
pwsh -File tests/runners/run-perf.ps1
pwsh -File tests/runners/run-manual.ps1
```

## 结果产物结构

- `summary.txt`
- `summary.json`（结构化摘要）
- `commands.log`
- `env.snapshot.txt`
- `outputs/`（每条命令 stdout/stderr）
- `perf-summary.md`（仅 `perf`）

## 相关文档入口（SSOT）

- `../manual/reference/常用脚本与入口清单.md`
- `../manual/operations/回归执行手册.md`
- `../manual/operations/压测执行手册.md`
- `../manual/maintenance/INDEX.md`
