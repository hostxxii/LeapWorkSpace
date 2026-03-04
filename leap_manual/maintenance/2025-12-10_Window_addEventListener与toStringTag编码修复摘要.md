# 2025-12-10_Window_addEventListener与toStringTag编码修复摘要

日期：2025-12-10（历史修复；迁移摘要整理于 2026-02-23）  
来源拆分：根 `SOLUTION.md`（“修复 `addEventListener` 调用失败与 `Symbol.toStringTag` 问题” + “Symbol 编码方案调整”）

## 迁移校验状态（补录）

- 状态：已校验（历史修复摘要）
- 整理日期：2026-02-23
- 来源路径：根 `SOLUTION.md` 历史时间线条目（原文件已收口；快照见 `leap_manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`）
- 当前适用性：用于解释 Window 事件方法与 `@@toStringTag` 编码口径的历史来源；现行实现以源码与手册为准
- 纠偏规则：若与历史条目表述冲突，以当前 `dispatch_bridge.cc` / `skeleton_builder.cc` / skeleton 文件为准

## 事实校验（补录）

- 核对依据：
  - `leap-env/src/skeleton/type/Window.type.skeleton.js`
  - `leap-env/src/skeleton/type/WindowProperties.type.skeleton.js`
  - `leap-vm/src/leapvm/skeleton/dispatch_bridge.cc`
  - `leap-vm/src/leapvm/skeleton/skeleton_builder.cc`
  - `leap_manual/architecture/Dispatch分发与__LEAP_DISPATCH__.md`
- 核对结论：
  - `Window.type` 当前已声明 `addEventListener/removeEventListener/dispatchEvent` 的 dispatch 路由
  - `dispatch_bridge.cc` 当前对 `Window` 的品牌校验有兼容处理，并对原型链品牌标签做回退检查，避免误报 `Illegal invocation`
  - 当前 symbol 编码口径为 `@@toStringTag`，`skeleton_builder.cc` 可识别该键并映射到 `Symbol.toStringTag`
  - `Window.type` / `WindowProperties.type` 当前 skeleton 均已使用 `@@toStringTag`
- 纠偏说明：
  - 历史条目中的 `@@wk:toStringTag` 编码方案已不应作为当前写法；当前实现以 `@@toStringTag` 为准
  - 当前 dispatch 主路径已是 `__LEAP_DISPATCH__`，不应再按旧 `innerFunc` 主路径理解

## 背景

该条历史记录实际包含两类容易耦合的问题：

1. `window.addEventListener(...)` 调用阶段出现 `Illegal invocation` 误报
2. `Symbol.toStringTag` 的 skeleton 编码与 C++ 识别规则不一致，导致对象外观不正确

这两类问题都直接影响“结构拟真 + 可调用性”的基础观感，因此属于早期高优先级兼容修复。

## 实现摘要（当前可见形态）

### 1. Window 事件方法 dispatch 路由已稳定存在

`Window.type` skeleton 当前包含：

- `addEventListener`
- `removeEventListener`
- `dispatchEvent`

并通过 skeleton method dispatch 路由到 JS impl（当前主路径为 `__LEAP_DISPATCH__`）。

### 2. `Illegal invocation` 品牌校验已包含 Window 特殊兼容处理

`dispatch_bridge.cc` 的品牌校验逻辑当前包含：

- `Window` 品牌特判放行（避免全局 proxy / real global 差异导致误报）
- 对象自身与原型链品牌标签回退检查

这与历史问题“Window 方法误触发 `Illegal invocation`”属于同一问题域的防线。

### 3. `toStringTag` 的 skeleton 编码口径统一为 `@@toStringTag`

`skeleton_builder.cc` 当前在 `ToPropertyName(...)` 中识别：

- `@@toStringTag`
- `@@iterator`
- 其他常见 well-known symbol 键

因此手写/生成 skeleton 的当前口径应统一使用 `@@toStringTag`。

## 当前适用性

- 本记录适合用于解释：
  - 为什么 `Window` 事件方法的品牌校验不能简单按普通对象处理
  - 为什么 skeleton symbol 键要使用 `@@toStringTag` 这类编码
- 不适合作为逐行 patch 历史还原（原始修复过程细节已不完整保留）

## 影响文件（摘要）

- `leap-env/src/skeleton/type/Window.type.skeleton.js`
- `leap-env/src/skeleton/type/WindowProperties.type.skeleton.js`
- `leap-vm/src/leapvm/skeleton/dispatch_bridge.cc`
- `leap-vm/src/leapvm/skeleton/skeleton_builder.cc`

## 验证

本次迁移整理采用源码与文档事实核对（无运行时代码改动）：

- 核对 `Window.type` skeleton 中事件方法与 `@@toStringTag` 条目存在
- 核对 `skeleton_builder.cc` 当前仅识别 `@@toStringTag`（非 `@@wk:toStringTag`）
- 核对 `dispatch_bridge.cc` 的 `Window` 品牌兼容逻辑与原型链回退检查存在

## 相关入口

- `leap_manual/maintenance/INDEX.md`
- `leap_manual/architecture/Dispatch分发与__LEAP_DISPATCH__.md`
- `leap_manual/architecture/Window与全局对象模型.md`
- `leap_manual/reference/SKELETON_OPTIONS.md`

