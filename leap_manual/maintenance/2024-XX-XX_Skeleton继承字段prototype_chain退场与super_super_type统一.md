# 2024-XX-XX_Skeleton继承字段prototype_chain退场与super_super_type统一

日期：2024-XX-XX（历史基础改造；迁移摘要整理于 2026-02-23）  
来源拆分：根 `SOLUTION.md`（“原型链继承问题修复（`prototype_chain` 废弃，转 `super` 字段）”）

## 迁移校验状态（补录）

- 状态：已校验（历史基础改造摘要）
- 整理日期：2026-02-23
- 来源路径：根 `SOLUTION.md` 历史时间线条目（原文件已收口；快照见 `leap_manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`）
- 当前适用性：用于理解当前 Skeleton 继承字段语义（JS `super` / C++ `super_type`）与历史兼容边界
- 纠偏规则：涉及具体实现行为时，以当前 `skeleton_parser.cc` / `skeleton_registry.cc` / `SKELETON_OPTIONS.md` 为准

## 事实校验（补录）

- 核对依据：
  - `leap-vm/src/leapvm/skeleton/skeleton_types.h`
  - `leap-vm/src/leapvm/skeleton/skeleton_parser.cc`
  - `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`
  - `leap-env/.collection/skeleton_pull.js`
  - `leap_manual/reference/SKELETON_OPTIONS.md`
  - `leap_manual/reference/SKELETON_OPTIONS.md`
  - `rg -n "prototype_chain|prototypeChain" leap-vm leap-env leap_manual`
- 核对结论：
  - 当前仓库源码与手册口径均使用 JS 字段 `super`（C++ 内部字段为 `super_type`）
  - C++ parser 当前从对象 skeleton 的 `super` 字段读取父类型名，并写入 `ObjectSkeleton.super_type`
  - `SkeletonRegistry::FindSkeletonName()` 当前支持为 `super_type="EventTarget"` 自动匹配 `EventTarget.type`
  - 当前仓库未发现 `prototype_chain` / `prototypeChain` 在现行源码与手册中的残留使用（仅 `maintenance` 中历史快照保留历史提及）
- 纠偏说明：
  - 历史条目中提到的 `skeleton_pull` 覆盖范围在当前仓库对应为 `leap-env/.collection/skeleton_pull.js`（生成字段为 `super`）
  - 本记录无法重建当年的完整批量修改清单，仅保留“当前事实可验证”的字段语义与实现结果

## 背景

Skeleton 系统需要在 JS 描述层表达继承关系，并由 C++ 侧据此建立模板继承链。

历史条目描述了一次基础字段收敛：

- 废弃旧的 `prototype_chain` 表达方式
- 改为使用单一父类字段 `super`
- 在 C++ 内部使用 `super_type` 保存解析后的父类信息

这次收敛的价值在于：

- 简化 schema（只表达“直接父类”，不重复完整链）
- 让 parser / registry / skeleton 生成工具使用统一语义
- 降低手写 skeleton 与生成 skeleton 的字段分叉风险

## 实现摘要（当前可见形态）

### 1. JS Skeleton 字段使用 `super`

当前手册和生成脚本都使用：

- `super: "EventTarget"`（示例）

含义是“直接父类型名”，不是完整继承链。

相关位置：

- `leap_manual/reference/SKELETON_OPTIONS.md`
- `leap_manual/reference/SKELETON_OPTIONS.md`
- `leap-env/.collection/skeleton_pull.js`

### 2. C++ 内部字段为 `super_type`

`ObjectSkeleton` 结构体中保存：

- `std::string super_type;`

这是内部实现字段，用于 parser 与 registry 处理继承关系，不直接暴露给 JS schema。

相关位置：

- `leap-vm/src/leapvm/skeleton/skeleton_types.h`

### 3. parser 读取 `super` -> 写入 `super_type`

`skeleton_parser.cc` 当前逻辑：

- 从对象字段 `super` 读取父类名（字符串）
- 若 `super` 为 `null/undefined` 则保持空（无继承）
- 写入 `skeleton.super_type`

相关位置：

- `leap-vm/src/leapvm/skeleton/skeleton_parser.cc`

### 4. registry 支持 `.type` 自动匹配

为了让 `super: "EventTarget"` 能映射到 `EventTarget.type` skeleton，registry 当前会：

- 先尝试精确匹配
- 再尝试追加 `.type` 后缀匹配

这使手写 skeleton 和生成 skeleton 的父类表达更直接，不需要在 JS 侧显式写 `EventTarget.type`。

相关位置：

- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`

## 当前适用性

- 本记录仍有价值，因为它解释了当前文档中“JS 写 `super`，C++ 内部叫 `super_type`”这一命名差异的来源
- 可用于排查 skeleton 继承链异常时的字段层面问题（schema / parser / registry 三段）
- 不作为完整历史 patch 清单替代品

## 影响文件（摘要）

- `leap-vm/src/leapvm/skeleton/skeleton_types.h`
- `leap-vm/src/leapvm/skeleton/skeleton_parser.cc`
- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`
- `leap-env/.collection/skeleton_pull.js`
- `leap_manual/reference/SKELETON_OPTIONS.md`
- `leap_manual/reference/SKELETON_OPTIONS.md`

## 验证

本次迁移整理采用源码与文档事实核对（无运行时代码改动）：

- 扫描确认 `prototype_chain` / `prototypeChain` 仅在 `maintenance` 中历史快照保留历史提及
- 核对确认当前生成脚本、参考文档、parser、registry 对 `super` / `super_type` 的口径一致

## 相关入口

- `leap_manual/maintenance/INDEX.md`
- `leap_manual/reference/SKELETON_OPTIONS.md`
- `leap_manual/reference/SKELETON_OPTIONS.md`
- `leap_manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`

