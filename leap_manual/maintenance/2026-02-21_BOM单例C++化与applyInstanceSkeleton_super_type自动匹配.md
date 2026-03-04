# 2026-02-21_BOM单例C++化与applyInstanceSkeleton_super_type自动匹配

日期：2026-02-21（迁移摘要整理于 2026-02-23）  
来源拆分：根 `SOLUTION.md`（“BOM 单例 C++ 化 + `__applyInstanceSkeleton__` + `super_type` 自动检测”）

## 迁移校验状态（补录）

- 状态：已校验（迁移摘要/维护记录）
- 整理日期：2026-02-23
- 来源路径：根 `SOLUTION.md` 对应时间线条目（原文件已收口；历史快照见 `leap_manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`）
- 当前适用性：可作为现行维护/回溯入口；实现细节应以当前源码与架构文档为准
- 纠偏规则：若与历史时间线原表述冲突，以当前源码、脚本实测结果和手册 SSOT 文档为准

## 事实校验（补录）

- 核对依据：
  - `leap-vm/src/leapvm/vm_instance.cc`（`__applyInstanceSkeleton__` 导出与 native callback）
  - `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`（`ApplyInstanceSkeletonToObject()` / `super_type` 自动匹配）
  - `leap-vm/src/leapvm/skeleton/skeleton_parser.cc`、`leap-vm/src/leapvm/skeleton/skeleton_types.h`（`super` → `super_type` 解析/字段）
  - `leap-env/src/impl/Window.impl.js`（BOM 单例缓存读取）
  - `leap-env/src/impl/00-dom-shared.impl.js`（动态对象创建后调用 `__applyInstanceSkeleton__`）
- 核对结论：
  - `__applyInstanceSkeleton__` 当前仍由 `leap-vm` 暴露到 `globalThis`，用于给动态创建对象补装 instance-level C++ 拦截器
  - `ApplyInstanceSkeletonToObject()` 当前通过 `instance skeleton.super_type == ctorName` 自动匹配，无需手工映射表
  - `WindowImpl` 当前使用 `leapenv.nativeInstances` 缓存并返回 `navigator/history/performance/screen/location/storage` 等 BOM 单例
- 纠偏说明：
  - 该条中的“自动检测”在当前实现中具体表现为 `super_type` 匹配与 `.type` 名称推断，而不是额外独立的配置注册机制

## 背景

该条时间线关注的是两个经常被混在一起的问题：

1. BOM 命名实例（如 `navigator` / `history` / `location`）如何保持 C++ 创建的“原生对象身份”，避免退化成纯 JS 临时对象。
2. 动态创建对象（尤其 per-task `HTMLDocument`）绕过常规实例构建路径后，如何补装 instance skeleton 的 C++ 级拦截器。

这两点共同影响：

- BOM 单例的品牌/原型链/dispatch 行为一致性
- 动态文档对象的实例属性（如 `document` 相关 instance-level 拦截器）可用性

## 实现摘要（当前可见形态）

### 1. `WindowImpl` 使用 `leapenv.nativeInstances` 缓存 BOM 单例

`WindowImpl` 当前对以下对象采用“懒加载 + 缓存引用”模式：

- `navigator`
- `history`
- `performance`
- `screen`
- `localStorage`
- `sessionStorage`
- `location`

这些对象由 C++ 侧命名实例安装路径提供，并存入 `leapenv.nativeInstances`，JS 侧只做读取与缓存，不再自行构造替代对象。

相关实现：

- `leap-env/src/impl/Window.impl.js`

### 2. `leap-vm` 向 `globalThis` 暴露 `__applyInstanceSkeleton__`

`VmInstance` 在全局注册：

- `__createNative__`
- `__applyInstanceSkeleton__`

其中 `__applyInstanceSkeleton__(targetObj, instanceName)` 用于在 JS 动态创建对象后，将对应 instance skeleton 的 INSTANCE-owned 属性拦截器补装到目标对象上。

相关实现：

- `leap-vm/src/leapvm/vm_instance.cc`

### 3. `super_type` 自动匹配 instance skeleton（免手工映射）

`SkeletonRegistry::ApplyInstanceSkeletonToObject()` 当前逻辑：

- 遍历 instance skeleton
- 查找 `skeleton.super_type == instance_name`
- 对命中的 skeleton，把 `owner == INSTANCE` 的属性安装到目标对象
- `HTMLDocument` 额外补装 `document.all`

这使 JS 侧调用 `__applyInstanceSkeleton__(created, ctorName)` 时无需维护 `ctorName -> instance skeleton` 映射表。

相关实现：

- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`

### 4. JS 动态对象创建路径会主动调用 `__applyInstanceSkeleton__`

`domShared.createNodeObject(...)` 在创建对象后会执行：

- 设置 ctorName 元信息
- 调用 `global.__applyInstanceSkeleton__(created, ctorName)`（若存在）

这保证了动态对象（如 `HTMLDocument`）即便不是通过标准实例构建路径创建，也能补齐 C++ 层 instance-level 拦截器。

相关实现：

- `leap-env/src/impl/00-dom-shared.impl.js`

## 当前适用性

- 本记录可作为“为什么要有 `__applyInstanceSkeleton__` / `super_type` 自动匹配”的维护摘要
- 适合用于解释动态文档对象与 BOM 单例行为的一致性来源
- 不替代 `skeleton_registry.cc` 与 `Window.impl.js` 的源码阅读

## 影响文件（摘要）

- `leap-vm/src/leapvm/vm_instance.cc`
- `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`
- `leap-vm/src/leapvm/skeleton/skeleton_parser.cc`
- `leap-vm/src/leapvm/skeleton/skeleton_types.h`
- `leap-env/src/impl/Window.impl.js`
- `leap-env/src/impl/00-dom-shared.impl.js`

## 验证

本次迁移整理采用源码与现行文档事实核对，未新增运行时变更。

- 源码核对：已确认 `__applyInstanceSkeleton__` 导出存在、`super_type` 自动匹配逻辑存在、`WindowImpl` 的 BOM 单例缓存存在
- 文档核对：与 `Window` / `Skeleton` 架构文档主线口径一致（并在本轮同步修正旧脚本路径）

## 相关入口

- `leap_manual/maintenance/INDEX.md`
- `leap_manual/architecture/Window与全局对象模型.md`
- `leap_manual/architecture/Skeleton系统.md`
- `leap_manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`

