# Leap Manual（手册中心）

更新日期：2026-03-01（M01–M13 全链路审查完成，阶段3收尾）

本目录是仓库详细文档的 SSOT。本文件只做模块介绍与入口索引，不承载长篇实现细节或维护过程正文。

## 模块说明与位置

- `architecture/`：现行架构说明（14个文件，涵盖 LeapVM C++ 层与 LeapEnv JS 层，含全局概览）
- `reference/`：参考手册（API、Skeleton 字段、环境变量、命令、测试）
- `maintenance/`：维护记录模块（按日期平铺；含历史快照/废弃路线，需明确状态）

## 模块入口索引

### 架构（`architecture/`）

**概览**

- `architecture/00-全局架构概览.md`（系统整体功能 + 两大子系统关系图 + 13模块一览 + 端到端数据流）

**LeapVM C++ 层**

- `architecture/LeapVM核心与Addon桥接.md`（M01：V8 Isolate 生命周期 + 14 NAPI 接口）
- `architecture/Hook监控与拦截体系.md`（M02：Native Hook + Builtin Wrapper + MonitorEngine）
- `architecture/Inspector调试服务.md`（M11：Chrome DevTools CDP 调试服务）
- `architecture/Intl_ICU与node_napi_only方案.md`（M13：ICU 隔离 + node_napi_only.lib）

**Skeleton / Dispatch**

- `architecture/Skeleton系统与Dispatch.md`（M03：数据驱动 Web API 结构 + DispatchBridge）

**LeapEnv JS 层**

- `architecture/运行时核心与配置.md`（M04：runner.js 三主函数 + config）
- `architecture/Window与全局对象模型.md`（M05：Window 全局对象 + BOM 单例）
- `architecture/DOM-BOM实现层.md`（M06：40+ impl 文件 + domShared 工具层）
- `architecture/DoD布局引擎.md`（M07：TypedArray 布局引擎 + zero-copy）
- `architecture/iframe多上下文.md`（M08：独立 Context 子帧 + 同源/跨域）
- `architecture/并发池.md`（M09：ThreadPool + ProcessPool + worker 生命周期）
- `architecture/签名容器与配置注入.md`（M10：fp-lean/fp-occupy + siteProfile 任务态注入）
- `architecture/构建与打包系统.md`（M12：esbuild 打包 + generate-entry.js 拓扑排序）

### 参考（`reference/`）

- `reference/测试手册.md`（回归、压测、仓库清洁流程；M01–M13 测试记录）
- `reference/API手册.md`（NAPI 接口、runner.js 主函数、$native API、Skeleton API；M01–M13 全覆盖）
- `reference/环境变量与命令手册.md`（所有 LEAP_* / LEAPVM_* 变量 + 命令参考；M01–M13 全覆盖）
- `reference/骨架详细说明手册.md`（type/instance skeleton 字段规范；由 M03 填充）

### 维护（`maintenance/`）

- `maintenance/INDEX.md`（维护记录入口页；模块介绍 + 按日期索引）

## 与根目录的关系

- `README.md`：项目总览（快速开始 + 外层模块索引 + 总览架构图）
- `tests/README.md`：根回归编排模块入口
- `REPO_REVIEW.md`：仓库审查与文档重建计划（已完成 M01–M13 + 阶段3）

## 文档维护约束（SSOT）

- 现行实现说明写入 `architecture/`、`reference/`
- 维修/阶段性收口记录写入 `maintenance/`
- 历史快照/废弃路线也放在 `maintenance/`，但必须明确标注 `已过期（仅历史）`
- 根 README 与各模块 README 只做索引与概览，不重复正文细节
