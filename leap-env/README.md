# LeapEnv（模块入口）

`leap-env` 是 Leap 的 JS 运行时与补环境层，负责 skeleton 蓝图、JS Impl 行为实现、环境 bundle 构建，以及与 `leap-vm` 的分发协作。

本 README 只保留模块内架构概览与模块索引；详细正文统一在 `../leap_manual/`。

## 模块内架构概览

```text
Skeleton 数据 (src/skeleton/*, .collection/*)
        |
        v
实例初始化 / 补装 (src/instance/*)
        |
        v
__LEAP_DISPATCH__ -> Impl (src/impl/*)
        |
        v
bundle 构建与运行入口 (index.js / runner.js / pool)
```

关键职责：

- Skeleton：描述对象结构、原型链、描述符与分发元数据
- Impl：实现 DOM/BOM 行为（按需补全）
- Instance：运行时初始化、日志、宿主桥接
- Pool：线程池/进程池调度与 worker 运行

## 模块目录索引

- `src/skeleton/`：skeleton 类型定义与运行时使用的结构数据
- `src/impl/`：JS 侧具体行为实现（DOM/BOM/Storage 等）
- `src/instance/`：实例初始化、运行时桥接、日志等
- `src/pool/`：线程池/进程池与 worker 调度
- `.collection/`：skeleton 导出/整理相关脚本与产物
- `scripts/`：模块私有脚本与兼容 wrapper（root 编排优先走 `tests/scripts/*`）
- `runner.js` / `index.js` / `index_debug.js`：常用入口

## 模块内常用入口（最小）

- 构建/运行：`npm run build`、`npm run start`
- 调试入口：`npm run debug`（`index_debug.js`）
- 根回归入口（推荐）：`../tests/README.md`

## 模块相关手册（SSOT）

- `../leap_manual/README.md`
- `../leap_manual/architecture/Skeleton系统.md`
- `../leap_manual/architecture/Dispatch分发与__LEAP_DISPATCH__.md`
- `../leap_manual/architecture/Window与全局对象模型.md`
- `../leap_manual/architecture/DoD布局引擎.md`
- `../leap_manual/architecture/iframe多上下文（A3）.md`
- `../leap_manual/reference/SKELETON_OPTIONS.md`
- `../leap_manual/reference/常用脚本与入口清单.md`
- `../leap_manual/maintenance/INDEX.md`

## 历史迁移记录入口（非正文）

- `../leap_manual/maintenance/2025-12-04_LeapEnv_v2架构迁移与构建系统整理.md`

说明：本目录不再保留 `SKELETON_OPTIONS.md` 等详细文档，现行说明统一以 `../leap_manual/` 为准。
