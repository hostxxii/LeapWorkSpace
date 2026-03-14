# 2026-02-16_WindowProperties原型constructor修复与SKELETON_OPTIONS文档整理

日期：2026-02-16（迁移摘要整理于 2026-02-23）  
来源拆分：根 `SOLUTION.md`（“修复 WindowProperties 原型层多余 constructor，并补充 skeleton 选项说明文档”）

## 迁移校验状态（补录）

- 状态：已校验（迁移摘要/维护记录）
- 整理日期：2026-02-23
- 来源路径：根 `SOLUTION.md` 对应时间线条目（原文件已收口；历史快照见 `manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`）
- 当前适用性：可作为现行维护/回溯入口，但涉及实现细节时应与当前源码、`tests/results/*`、`manual/*` 交叉核对
- 纠偏规则：若与历史时间线原表述冲突，以当前源码、脚本实测结果和手册 SSOT 文档为准

## 准确性说明（来源约束）

- 本记录基于当前仓库源码与文档可直接核对的事实整理，不重建当日完整变更过程。
- 关键依据：
  - `leap-env/src/skeleton/type/WindowProperties.type.skeleton.js`
  - `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`
  - `manual/reference/SKELETON_OPTIONS.md`
- 因此本文定位为“问题与落地形态摘要”，不是原始实施日志全文。

## 背景

`WindowProperties` 在 Skeleton 系统中承担原型链中间层（mixin/proto-only carrier）的角色：

- 需要参与继承链（例如作为 `Window` 的父类型节点）
- 不应作为用户可见构造函数暴露
- 不应在其原型对象上留下误导性的 `prototype.constructor`

如果该类“proto-only 节点”残留 `constructor`，会干扰对原型层职责的理解，也可能造成调试观察上的误判。

## 实现结果（当前可核对）

### 1. `WindowProperties.type` 作为 proto-only 节点定义

`WindowProperties` skeleton 当前特征：

- `instanceName: ""`
- `exposeCtor: false`
- `super: "EventTarget"`

这表明其定位是“原型链中间层”，而不是全局构造器或实例暴露节点。

相关文件：

- `leap-env/src/skeleton/type/WindowProperties.type.skeleton.js`

### 2. C++ 侧对 proto-only 节点移除 `prototype.constructor`

`SkeletonRegistry` 对满足以下条件的 skeleton 执行特殊处理：

- `!skeleton.expose_ctor`
- `skeleton.instance_name.empty()`

行为：

- 获取该类型模板对应构造器的 `prototype`
- 删除其 own `constructor` 属性

源码注释明确指出这是为类似 `WindowProperties` 的 proto-only hidden ctor nodes 服务。

相关文件：

- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`

### 3. Proto-only 节点跳过实例/构造器暴露

在实例创建/暴露路径中，C++ 侧对 proto-only 节点直接跳过：

- 不创建全局实例
- 不暴露全局构造器

这与 `WindowProperties` 的设计定位保持一致。

相关文件：

- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`

## 文档整理结果（SKELETON_OPTIONS）

`SKELETON_OPTIONS.md` 已将上述语义系统化说明（并与当前源码对照校验）：

- `exposeCtor`
- `instanceName`
- `super`
- `proto-only / mixin carrier` 的语义说明
- C++ parser / registry / builder 对字段的落地行为

这使后续维护者在新增或修改 skeleton 时，不需要再从零推导这些字段含义。

相关文档：

- `manual/reference/SKELETON_OPTIONS.md`

## 对当前主线的意义

- 降低 `Window` / `WindowProperties` 原型链维护的歧义
- 提高 Skeleton 字段配置的可读性与一致性
- 为后续全局对象模型、iframe、多上下文相关改动提供更稳定的字段语义基础

## 相关文档

- `manual/reference/SKELETON_OPTIONS.md`
- `manual/architecture/Window与全局对象模型.md`
- `SOLUTION.md`





