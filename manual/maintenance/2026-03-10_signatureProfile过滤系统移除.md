# 2026-03-10 signatureProfile 过滤系统移除

> 承接 `2026-03-09_Addon残留清理与测试async修复.md` 存留事项 9.2。

## 1. 背景

signatureProfile 系统在骨架加载时按 `fp-lean`/`fp-occupy` 模式过滤 window 属性：
- `fp-lean`：Tier B API（fetch、XMLHttpRequest、DOMParser 等）直接隐藏（属性不存在）
- `fp-occupy`：Tier B API 保留但调用报错（placeholder）

**移除理由**：站点如果用到某 API，就在 impl 中最小实现；没用到的，dispatch 返回 undefined 即可（这本身就是设计行为）。hide/placeholder 中间层没有实际价值——藏起来不影响检测，空壳也不能真正使用。

## 2. 删除的文件

| 文件 | 行数 | 作用 |
|------|------|------|
| `leap-env/src/core/fingerprint-profile.js` | 244 | Tier A/B/C 分层定义、fp-lean/fp-occupy 规则 |
| `leap-env/src/core/placeholder-policy.js` | 79 | 占位错误工厂（networkDisabledError、rejectNetwork 等） |
| `tests/scripts/integration/test-leapenv-placeholder-policy.js` | 265 | fp-lean/fp-occupy 行为测试 |

## 3. 核心模块改动

### skeleton-loader.js
- 删除 `filterSkeletonObjectsForProfile()`、`filterWindowInstanceProps()`、`resolveProfileAction()`、`cloneSkeletonObjectWithProps()`、`toLookup()` 等过滤函数（~140 行）
- `loadSkeleton()` 直接用 `leapenv.skeletonObjects` 构建 envDescriptor，不再过滤
- 删除 `leapenv.filterSkeletonObjectsForProfile` 导出和 `leapenv.lastSkeletonProfileStats` 赋值

### generate-entry.js
- CORE_ORDER 移除 `'fingerprint-profile.js'` 和 `'placeholder-policy.js'`

### config.js
- 删除 signatureProfile 规范化逻辑（~15 行）

### runtime.js
- 删除 `normalizeSignatureProfile()` 函数
- `consumeBootstrap()` 中删除 signatureProfile 读取/设置
- 全局清理列表移除 `__LEAP_SIGNATURE_PROFILE__`

### task_protocol.cc
- `BuildBootstrapScript()` 的 bootstrap 对象中删除 `"signatureProfile": "fp-lean"` 行

### runner.js
- 删除 `normalizeSignatureProfile()` 函数
- `resolveRunOptions()` 中删除 signatureProfile 相关代码

## 4. Window.impl.js 清理

删除的空壳代码（~290 行）：
- `makeNetworkDisabledError()`、`rejectNetwork()` 网络错误辅助函数
- `_xhrSeq`、`_placeholderXhrMap`、`_fallbackXhrStateList`、`_placeholderXhrCreatedCount` 变量
- `getFallbackXhrEntry()`、`ensurePlaceholderXhrState()`、`createXmlHttpRequestPlaceholder()` XHR 状态管理
- impl 类中的 `fetch()` 和 `XMLHttpRequest()` 方法
- `resetWindowTaskState()` 中的 XHR 清理代码
- `getWindowTaskRuntimeStats()` 中的 XHR 统计字段

**保留的真实实现**：
- `DOMParser()` — 委托给 DOM 引擎 `parseHTMLUnsafe()`
- `XMLSerializer()` — 委托给 DOM 引擎 `serializeNode()`
- `MutationObserver()` — 有 observe/disconnect/takeRecords
- `CustomEvent()`、`MessageEvent()`、`MouseEvent()`、`KeyboardEvent()` — 事件构造器

## 5. Crypto.impl.js / HTMLCanvasElement.impl.js

- 删除 `placeholderPolicy` 变量引用
- `makeCryptoTypeError()`、`makeQuotaExceededError()`、`makeNotSupportedError()` 简化为直接构造错误（原 fallback 路径），删除对 `placeholderPolicy.*` 的委托分支

## 6. 测试更新

| 文件 | 改动 |
|------|------|
| `test-leapenv-placeholder-policy.js` | 删除（整个文件测试 fp-lean/fp-occupy 行为） |
| `test-leapenv-branded-collections.js` | 移除 `signatureProfile: 'fp-occupy'` 选项 |
| `test-leapenv-fingerprint-snapshot.js` | 移除 `signatureProfile: 'fp-occupy'` 选项 |
| `test-leapenv-crypto-minimal.js` | 合并 `exposure-lean`/`exposure-occupy` 为单一 `exposure` 测试；移除 profile 断言 |
| `test-leapenv-canvas-minimal.js` | 移除 `signatureProfile: 'fp-occupy'` 选项 |
| `test-leapenv-signature-core.js` | 移除 fp-occupy 注释 |
| `test-leapenv-global-surface.js` | 移除 `__LEAP_SIGNATURE_PROFILE__` 和 `signatureProfile` 引用 |

## 7. 验证结果

- `npm run build`（bundle 构建）— 通过
- `cmake --build leap-vm/build-server --target leapvm_server`（C++ 编译）— 通过
- `node run-work-leapvm.js`（基本运行）— 通过

## 8. 未清理的残留（低优先级）

- `benchmarks/*.js` 中仍传 `signatureProfile` 选项 — 无害（被忽略），下次重构 benchmark 时清理
- `leap-env/global-surface-report.json` 中记录了旧 signatureProfile — 生成产物，重新生成时自动更新
- `tests/scripts/INVENTORY.md` 中仍列出 placeholder-policy 测试 — 文档更新
