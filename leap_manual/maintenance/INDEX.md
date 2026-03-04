# Maintenance Index

更新日期：2026-03-03

说明：

- 本目录用于存放维修记录、流程记录、回归记录。
- 本文件是 `maintenance` 模块入口页（简介 + 位置说明 + 按日期/主题索引）。
- 维修记录文件保持平铺管理（按日期命名），不按“每次修改”再创建子目录。
- 历史快照/废弃路线也并入本目录平铺管理，但必须在标题或正文中明确标注“历史/已过期（仅历史）”。
- 根 `SOLUTION.md` 已退场；历史时间线收口前快照见 `leap_manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`。
- 后续新增/变更维修记录直接写入本目录（不再先写根 `SOLUTION.md`）。

## 目录（按日期 + 主题）

### 2026-03-03

- `2026-03-03_ThreadPool_DoD默认零拷贝与多Isolate崩溃修复.md`（ThreadPool 默认零拷贝切换、跨 isolate 崩溃根因修复与回归结果）

### 流程

- `PROC_回归与清洁流程.md`（待创建）
- `PROC_文档迁移流程.md`（待创建）
- `TEMPLATE_维护记录迁移校验模板.md`（迁移记录统一校验字段模板）

### 2026-02-22

- `2026-02-22_运行时缺陷修复.md`（BUG_FIX_PLAN 分析 + 落地实现汇总）
- `2026-02-22_Intl_ICU修复.md`（ICU 符号隔离 + `node_napi_only.lib`）
- `2026-02-22_SPECIAL_PROPS与Event_isTrusted兼容.md`（`document.all` / `HTMLAllCollection` / `Event.isTrusted` 特殊属性兼容）

### 2026-02-25

- `2026-02-25_JSHook调试前奏与站点API覆盖注入落地.md`（Hook 日志统一、JSHook 阶段控制、`siteProfile` 严格模式与 `storage/cookie` 注入最小落地）

### 2026-02-27

- `2026-02-27_C++Wrapper收尾_JS包装退场与Hook模块清理.md`（JS 侧 wrapper 退场、Hook runtime 命名统一、残留清理与验证记录）

### 2026-02-23

- `2026-02-23_容器基线Signature收敛_壳优先_CanvasWebGL与Navigator品牌对象.md`（容器基线阶段的“壳优先”口径；Canvas/WebGL 壳化、Navigator 品牌对象壳、PermissionStatus 接入与验证）
- `2026-02-23_测试脚本与压测脚本物理迁移评估.md`（J1：物理迁移评估与分阶段建议）
- `2026-02-23_回归结果JSON结构化摘要落地.md`（J3：`summary.json` 结构化摘要）
- `2026-02-23_根SOLUTION退场前引用去依赖清单（准备）.md`（根 `SOLUTION.md` 最终删除前的引用分类与执行顺序准备）
- `2026-02-23_SOLUTION时间线快照_收口前.md`（历史快照：根 `SOLUTION.md` 收口前时间线，仅回溯）

### 2026-02-21

- `2026-02-21_iframe多上下文实现.md`（A3 iframe 多上下文模拟）
- `2026-02-21_BOM单例C++化与applyInstanceSkeleton_super_type自动匹配.md`（BOM 命名实例原生化、动态对象补装 instance skeleton、`super_type` 自动匹配）

### 2026-02-20

- `2026-02-20_DoD迁移Phase2C收口与验收摘要.md`（DoD 实现收口、`full`/`perf` 验收映射与当前快照）

### 2026-02-18

- `2026-02-18_线程池改造收口与验证闭环.md`（线程池主线能力、门禁脚本与验证闭环映射）
- `2026-02-18_DOM路线图M3收口_布局兼容trace摘要.md`（DOM M3 的 layout/兼容/trace 能力在当前 `tests/scripts/*` 与 `full` 编排中的映射）

### 2026-02-19（历史废弃路线）

- `2026-02-19_DOM废弃路线说明.md`（历史废弃 DOM 路线说明；仅术语回溯，不作为当前实现依据）

### 2026-02-17

- `2026-02-17_进程池压测命令与并发验证结论整理.md`（root `perf` 入口固化、基线与阈值文档沉淀）

### 2026-02-16

- `2026-02-16_WindowProperties原型constructor修复与SKELETON_OPTIONS文档整理.md`（proto-only `WindowProperties` 的 `constructor` 处理与 Skeleton 字段文档化）

### 2025-12-04

- `2025-12-04_LeapEnv_v2架构迁移与构建系统整理.md`（来自 `leap-env/SOLUTION.md` 的首批迁移摘要）
- `2025-12-04_LeapVM_双V8共存与构建链路.md`（双 V8 共存原理、构建与链接关键点）
- `2025-12-04_LeapVM_Inspector集成与调试稳定性改造.md`（Inspector 集成、--inspect-brk、稳定性修复摘要）
- `2025-12-04_LeapVM_Inspector_CorkBuffer线程修复.md`（Inspector Cork buffer 跨线程发送修复）

### 2025-12-02

- `2025-12-02_LeapVM_定时器与Hook监控基础能力落地.md`（Timer / High-Res Timer / shutdown / Hook / 黑名单）

### 2025-12-11

- `2025-12-11_RunScript编译错误诊断与退出fatal规避摘要.md`（`RunScript` 编译失败诊断增强与脚本侧显式 `shutdown()` 习惯的历史背景）

### 2025-12-10

- `2025-12-10_Window_addEventListener与toStringTag编码修复摘要.md`（Window 事件方法 `Illegal invocation` 问题域与 `@@toStringTag` 编码口径统一）

### 2024-XX-XX

- `2024-XX-XX_Skeleton继承字段prototype_chain退场与super_super_type统一.md`（`prototype_chain` 历史字段退场、`super`/`super_type` 统一与当前 parser/registry 口径）

## 当前阶段记录位置

- 仓库改造计划：`REPO_REORG_PLAN.md`
- 执行勾选清单：`REPO_REORG_TODO.md`
- 严格版执行清单：`REPO_REORG_TODO_STRICT_SSOT.md`
- 性能基线：`tests/baselines/perf-baseline.md`
- 架构拆分文档：`leap_manual/architecture/`
- 历史快照与废弃路线入口：`leap_manual/maintenance/INDEX.md`（见 2026-02-23 / 2026-02-19 条目）

