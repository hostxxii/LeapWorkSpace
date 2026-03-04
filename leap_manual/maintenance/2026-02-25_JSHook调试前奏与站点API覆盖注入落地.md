# 2026-02-25_JSHook调试前奏与站点API覆盖注入落地

日期：2026-02-25  
来源：当日联调与代码落地记录（h5st 流程对齐、Hook 调试、站点覆盖注入）

## 背景

围绕 `work/h5st.js` 的流程对齐与补环境调试，集中落地了两条能力线：

1. Hook 调试能力增强（含 JS 内置调用路径可观测）
2. 站点 API 返回值覆盖（任务级注入 + 严格模式防默认值泄露）

同时补充了若干兼容项（`HTMLScriptElement`、`MessageChannel/MessagePort` 等）并推进 `h5st.js` 可运行性。

## 本次落地内容（摘要）

### A. Hook 调试与日志收口

- C++ Hook monitor 命名统一为 `[hook][native]`
- JS prelude hook（JSHook）命名统一为 `[hook][js]`
- JSHook 支持：
  - 黑白名单（按 API 名称 / 前缀）
  - `call/return/throw` 操作过滤
  - 阶段控制（`bundle | task | all`）
- 默认 `phase=task`，避免环境 bundle 初始化时 `Object.getOwnPropertyDescriptor` 等噪音刷屏
- 静音高频信息日志：
  - `[skeleton]`
  - `[special]`
  - `[A3]`

### B. Hook 覆盖面补齐（h5st 对比导向）

- 扩展 debug targets：`Node/Element/HTMLElement/HTMLScriptElement/HTMLCollection/PluginArray/...`
- 增加 debug-only JS prelude 包裹：
  - `JSON.parse/stringify`
  - `Object.getOwnPropertyDescriptor`
  - `Function.prototype.toString`
  - `window.encodeURIComponent/decodeURIComponent/escape/unescape`
- 补齐 `Document.all`、`HTMLAllCollection.length` 特殊 getter Hook

### C. `HTMLScriptElement` 接入 DOM 系统

- 新增 `HTMLScriptElement` skeleton（用户侧先行添加，后续接入链路验证）
- 新增 `HTMLScriptElement.impl.js`
- `script` tag 映射从 `HTMLElement` 切换为 `HTMLScriptElement`
- `Document.createElement('script')` 返回值与 `type/src` Hook 日志对齐

### D. `MessageChannel/MessagePort` 与构造器品牌修复（联调前置）

- 修复通用可构造类型 `new Xxx()` 的品牌初始化链路（brand）
- 补齐 `MessageChannel/MessagePort` impl 最小可用能力（`port1/port2`, `onmessage`, `postMessage`）
- 推动 `h5st.js` 错误从 `Illegal invocation` 前进到后续依赖缺失

### E. `SHA256` 兼容与污染收口

- 注入 `window.SHA256`（兼容 `h5st.js` 直接调用）
- 移除 `globalThis.CryptoJS` 和 `require('crypto-js')` shim 默认注入，减少全局污染与 Hook 噪音

### F. 站点 API 覆盖（最小可用版 Phase 1）

新增 `siteProfile` 任务级注入能力：

- `run-work-leapvm.js`
  - `--site-profile <path>`
  - （初版联调曾支持 `--site-profile-json <json>`，后续已收口为文件模式）
- `runner.js`
  - `siteProfile` 校验与合并
  - 严格模式（`overrideMode: strict`） + `requiredFields` 校验
- `signature-task.instance.js`
  - `applyStorageSnapshot(snapshot, policy)`
  - `applyDocumentSnapshot(snapshot)`
  - `cookie=null` 清空语义

## 验证结果（本次实测）

### 1. Hook 与流程对齐

- `h5st流程.md` 对比当前 Hook 日志，已覆盖绝大多数关键 API 流程
- `HTMLScriptElement.type/src`、`Node.appendChild`、`PluginArray.length`、`Element.innerHTML` 等已可见
- 浏览器插桩与 Leap Hook 的剩余差异主要集中在：
  - 条件分支差异（是否触发某路径）
  - 对象预览是否主动读取 getter（如 `HTMLCollection.length`）

### 2. 站点覆盖与严格模式

最小测试已通过：

- 严格模式缺字段时执行前拦截（防默认值泄露）
- 严格模式成功覆盖：
  - `navigator.userAgent`
  - `localStorage`
  - `sessionStorage`
  - `document.cookie`
- `storagePolicy=merge` 在同一任务内二次注入语义成立
- `cookie=null` 清空语义成立
- `--site-profile` 文件模式解析成功（后续统一文件模式，移除内联 JSON 参数）

### 3. `h5st.js` 回归

- 使用 `siteProfile`（严格模式最小配置）执行 `h5st.js` 成功
- 保持签名流程输出可用

## 影响文件（摘要）

### 运行与注入层

- `run-work-leapvm.js`
- `leap-env/runner.js`
- `leap-env/src/instance/signature-task.instance.js`

### Hook / 日志层

- `leap-vm/src/leapvm/log.cc`
- `leap-vm/src/leapvm/monitor.cc`
- `leap-vm/src/leapvm/vm_instance.cc`
- `leap-vm/src/leapvm/skeleton/dispatch_bridge.cc`

### DOM / API 兼容层（本轮相关）

- `leap-env/src/core/tools.js`
- `leap-env/src/impl/HTMLScriptElement.impl.js`
- `leap-env/src/skeleton/type/HTMLScriptElement.type.skeleton.js`
- `leap-env/src/impl/MessageChannel.impl.js`
- `leap-env/src/impl/MessagePort.impl.js`
- `leap-env/src/impl/CryptoJS.impl.js`

## 风险与后续事项

- `siteProfile.strict` 当前为路径存在性校验，后续可升级为更完整 schema 校验
- JSHook 仍是预定义 API 列表包裹，不是通用 JS 插桩框架
- `HTMLCollection.length` 等“对象返回值后自动探测”类流程如需与浏览器插桩更一致，建议仅在 debug-only 探针中追加，不改核心返回值预览逻辑

## 相关文档

- `leap_manual/architecture/Hook监控与JSHook调试前奏模块.md`
- `leap_manual/architecture/站点API返回值覆盖与任务态注入.md`
- `站点API返回值覆盖方案.md`
