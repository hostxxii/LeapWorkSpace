# `tests/scripts/` 迁移命名规范

说明：

- 本目录用于承接从 `leap-env/scripts/`、`leap-vm/scripts/` 逐步物理迁移出来的跨模块集成脚本与压测脚本。
- 原路径在迁移阶段可保留兼容 wrapper（打印迁移提示并转发调用），避免 root manifest / 本地习惯路径突变。

## 目录约定

- `integration/`：跨模块集成回归脚本（优先迁移）
- `perf/`：压测/基线/门禁脚本
- `manual/`：需要人工交互或 DevTools 的脚本

## 命名规范

- 集成脚本建议前缀：`test-<module>-<topic>.js`
- 压测脚本建议保留原 bench 名称或使用：`bench-<topic>.js`
- 当脚本从模块目录迁入时，建议在名称中补模块前缀（如 `test-leapenv-*`），避免与后续 `leap-vm` 同名脚本冲突。

## 迁移要求（样板阶段）

- 修改脚本内部相对 `require()` 路径，使其在 `tests/scripts/*` 下可直接执行
- 更新 `tests/manifest/*` 指向新路径
- 原路径保留 wrapper，并在输出中提示新路径

## 台账

- 盘点与分类台账：`tests/scripts/INVENTORY.md`
