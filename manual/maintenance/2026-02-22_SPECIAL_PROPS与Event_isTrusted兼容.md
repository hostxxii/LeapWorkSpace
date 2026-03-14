# 2026-02-22_SPECIAL_PROPS与Event_isTrusted兼容

日期：2026-02-22  
来源拆分：根 `SOLUTION.md`（`document.all` / `Event.isTrusted` 特殊属性兼容实现）

## 迁移校验状态（补录）

- 状态：已校验（迁移摘要/维护记录）
- 整理日期：2026-02-23
- 来源路径：根 `SOLUTION.md` 对应时间线条目（原文件已收口；历史快照见 `manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`）
- 当前适用性：可作为现行维护/回溯入口，但涉及实现细节时应与当前源码、`tests/results/*`、`manual/*` 交叉核对
- 纠偏规则：若与历史时间线原表述冲突，以当前源码、脚本实测结果和手册 SSOT 文档为准

## 准确性说明（来源约束）

- 本记录依据当前仓库代码与本地测试脚本整理（`leap-env/`、`leap-vm/` 源码可见）。
- `SOLUTION.md` 中提到的 `IMPL_PLAN_SPECIAL_PROPS.md` 在当前仓库未找到（疑似历史文件已改名或未保留）。
- 因此本记录聚焦“已落地实现与可验证行为”，不展开缺失计划文档中的过程性讨论。

## 背景

在 DOM 兼容性推进中，需要补齐一组浏览器语义敏感的特殊属性行为，重点包括：

- `document.all` 的兼容外观与访问语义
- `HTMLAllCollection` 的品牌与基础方法/属性形态
- `Event.isTrusted` 的只读 getter 行为（默认脚本构造事件为 `false`）

## 实现摘要

### 1. `document.all` 由 C++ 层原生安装到文档实例

`leap-vm` 的 `SkeletonRegistry` 在文档实例上通过原生属性安装 `all`：

- 使用 `Object::SetNativeDataProperty(...)` 直接挂到具体 document 实例（而非模板层）
- 避免模板校验路径触发的 V8 校验问题（源码注释中已说明）
- getter 内部按 document 缓存 `HTMLAllCollection` 对象，重复访问可命中缓存

相关实现位置（摘要）：

- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`（`DocumentAllNativeGetter`、安装 `document.all` 的实例属性逻辑）

### 2. `HTMLAllCollection` 外观由 skeleton + C++ 方法安装共同完成

`leap-env` 侧提供 `HTMLAllCollection` 类型 skeleton（用于原型外观/分发声明）：

- `length` accessor
- `item()` / `namedItem()` 方法
- `@@toStringTag = "HTMLAllCollection"`
- `@@iterator`

同时 `leap-vm` 侧在原生 getter 创建集合实例后补装方法/品牌信息并设置原型。

相关实现位置（摘要）：

- `leap-env/src/skeleton/type/HTMLAllCollection.type.skeleton.js`
- `leap-env/src/build/entry.js`（包含该 skeleton 的打包入口）
- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`

### 3. `Event.isTrusted` 通过原生 accessor + JS fallback 默认值协同实现

`leap-vm` 侧：

- `SetupEventIsTrustedProperty(...)` 在 `Event` 实例模板上安装 `isTrusted` accessor
- getter 优先读取私有字段；没有私有值时返回 `false`
- setter 不暴露（表现为只读 getter）

`leap-env` JS fallback（`LeapEvent`）侧：

- 构造函数初始化 `this.isTrusted = false`

相关实现位置（摘要）：

- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`
- `leap-env/src/impl/00-dom-shared.impl.js`

## 验证（本地脚本）

用于观察/验证的脚本（当前仍在 `leap-env/` 根下，偏开发验证性质）：

- `leap-env/test_special_props.js`
  - 检查 `typeof document.all`
  - 检查 `== null` 与 `=== undefined` 差异
  - 检查 `length`
  - 检查重复访问缓存引用（`document.all === document.all`）
- `leap-env/test_istrusted.js`
  - 检查 `new Event('click').isTrusted`
  - 检查 `typeof isTrusted`
  - 检查写入 `isTrusted` 的行为（只读预期）

## 影响文件（摘要）

核心实现：

- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`
- `leap-vm/src/leapvm/skeleton/skeleton_registry.h`

JS runtime / fallback：

- `leap-env/src/impl/00-dom-shared.impl.js`

Skeleton / 打包：

- `leap-env/src/skeleton/type/HTMLAllCollection.type.skeleton.js`
- `leap-env/src/build/entry.js`

验证脚本：

- `leap-env/test_special_props.js`
- `leap-env/test_istrusted.js`

## 相关文档

- 根索引：`SOLUTION.md`
- 架构：`manual/architecture/Window与全局对象模型.md`
- 维护索引：`manual/maintenance/INDEX.md`





