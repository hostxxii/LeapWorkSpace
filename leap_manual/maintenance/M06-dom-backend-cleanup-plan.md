# M06 DOM 后端清理计划（第三轮专项）

> 来源：第二轮审查 M06 §8（2026-03-01 记录）
> **执行状态：§8.1–8.7 全部完成（2026-03-01）。**
> 目标：`00-dom-shared.impl.js` 三路 backend 分支收缩为单一 `dod` 路径，消除所有 `$native.dom` 桥接代码。

---

## ✅ 8.1 `00-dom-shared.impl.js` — 删除 `native` 后端全部代码

| 函数/变量 | 位置 | 操作 |
|-----------|------|------|
| `getNativeDomBridge()` | 第 76 行 | 整体删除 |
| `shouldSyncNativeDom()` | 第 83 行 | 整体删除 |
| `shouldMirrorNativeDom()` | 第 89 行 | 整体删除 |
| `ensureNativeDocumentId()` | 第 290 行 | 整体删除 |
| `flushPendingNativeStyles()` | 第 317 行 | 整体删除 |
| `ensureNativeElementHandle()` | 第 343 行 | 整体删除 |
| `syncNativeAppendChild()` | 第 379 行 | 整体删除 |
| `syncNativeRemoveChild()` | 第 418 行 | 整体删除 |
| `syncNativeSetStyle()` | 第 451 行 | 整体删除 |
| `getNativeLayoutRect()` | 第 2719 行附近 | 整体删除 |

删除上述函数后，同步清理所有调用点：

- `appendChild` 中的 `syncNativeAppendChild(parent, child)` 调用（第 757 行）
- `removeChild` 中的 `syncNativeRemoveChild(parent, child)` 调用（第 769 行）
- `ensureDocumentRegistration` 中的 `ensureNativeDocumentId` 调用
- `ensureElementState` 中的 `ensureNativeElementHandle` 懒调用

`nodeState` 中以下字段同步移除：

```
nativeHandle, nativeTempId, pendingNativeStyleStore  （nodeState 初始化对象）
nativeDocId                                           （documentState 扩展字段）
```

---

## ✅ 8.2 `00-dom-shared.impl.js` — 删除 `js` 后端布局计算代码

| 函数 | 操作 |
|------|------|
| `layoutNodeLocal()` | 整体删除（第 2563 行，约 130 行的纯 JS box-model 递归实现） |
| 被 `layoutNodeLocal` 独占的辅助函数 | 逐一确认是否仅被 `js` 路径调用后删除（含 `readBoxEdges`、`readInsetOffsets`、`getDisplayValue`、`getPositionValue`、`getBoxSizingValue`、`getLayoutRoot` 等） |

> **注意**：`getLayoutRoot` 同时被 `ensureDoDLayout`（dod 路径）调用，**不能直接删除**，需确认后保留。

---

## ✅ 8.3 `00-dom-shared.impl.js` — 简化后端选择逻辑

- `VALID_DOM_BACKENDS`：只保留 `{ dod: true }`，移除 `js`/`native` 键
- `normalizeDomBackend()`：简化为直接返回 `'dod'`（或整体内联删除，改为常量）
- `getDomBackend()` / `setDomBackend()`：可保留接口形状但固定返回 `'dod'`，方便调试时仍能读取
- `getLayoutRect()` 中的三路 `if`：只保留 `dod` 分支，删除 `native` 和 `js` 分支
- `spec backend` 兼容映射（`'spec' → 'dod'`）：连带删除，已无需兼容旧值

---

## ✅ 8.4 `00-dom-shared.impl.js` — 检查 Binary Spec Encoder 是否可删

第 2346–2415 行存在一套 `_specBuffer` / `STYLE_KEY_TO_CODE` / `TAG_CODE_MAP` 编码器（原为 Binary Tree Spec V1/V2 准备），**当前 `ensureDoDLayout` 不使用这套编码**，实际走的是 `buildDoDInputTree` → JS 对象 → `DomToDoDConverter`。

执行前需确认 `dom_core.cc` 的 `BuildTreeFromSpec` 是否还有调用方：
- 若无调用方：删除整个 spec encoder 段落
- 若仍被 native bridge 使用：随 native 整体删除（见 §8.5）

---

## ✅ 8.5 `dom_core.cc` / `dom_core.h` — 评估是否整体删除

- `DomManager` 的全部公开接口均通过 `$native.dom` 桥接从 JS 调用
- 删除 native 后端和轻量镜像后，JS 侧不再调用 `$native.dom.*`，`DomManager` 将无 JS 消费方
- 如确认无其他 C++ 路径（如 Inspector snapshot 直接调用 `DomManager::SnapshotDocument`），可整体删除 `dom_core.cc` 和 `dom_core.h`，并从 `CMakeLists.txt` 中移除对应编译单元

> **前置确认**：需先查阅 Inspector 实现（`leap_inspector_client.cc`）是否直接依赖 `DomManager`，再决定是否整体删除。

---

## ✅ 8.6 环境变量 `LEAP_DOM_BACKEND` — 废弃 `js`/`native` 选项

- `config.js` / `runner.js` 中 `LEAP_DOM_BACKEND` 有效值更新为仅 `dod`（旧值 `spec` 已映射，`js`/`native` 不再支持）
- `reference/环境变量与命令手册.md` 中 M04 对应条目同步更新

---

## ✅ 8.7 架构文档同步更新

清理完成后，[DOM-BOM实现层.md](../architecture/DOM-BOM实现层.md) 以下两节应相应简化或删除：

- 「关键机制 §3 三种 DOM 后端」
- 「主要流程 §样式同步流程（native 后端）」

---

## 执行验证顺序

1. ✅ 完成 §8.1–8.4 JS 代码清理 → `npm run build` 通过（2026-03-01）
2. ✅ 测试验证：`test-leapenv-dom-m3-minimal` PASS、`test-leapenv-hook-isolation` PASS、smoke manifest 全通过
   - **注**：`test-leapenv-dom-m3-minimal.js` 中 `setDomBackend('js')` 调用及依赖 js 引擎的布局数值断言已同步移除（单测环境无 DoD 引擎，布局返回 0）
3. ✅ §8.5：`skeleton_registry.cc` 仍依赖 `DomManager`，**保留 `dom_core.cc/h`**（不删除）
4. ✅ §8.6：`runner.js` `normalizeDomBackend` 简化为直接返回 `'dod'`；文档更新 `LEAP_DOM_BACKEND` 有效值为仅 `dod`
5. ✅ §8.7：`DOM-BOM实现层.md` 删除三路后端表、轻量镜像说明、native 样式同步流程；更新 `nodeState` 字段、DomManager 描述
