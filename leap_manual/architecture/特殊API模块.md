# 特殊API模块

> 源文件：`leap-vm/src/leapvm/skeleton/skeleton_registry.cc/.h`，`leap-env/src/impl/Event.impl.js`，`leap-env/src/impl/00-dom-shared.impl.js`
> 更新：2026-03-02（并入统一 hook_log_policy）

## 模块目标

本模块用于收敛少数“语义特殊、容易触发反调试/指纹差异”的 API，不走纯通用 skeleton 生成路径，而是使用最小可控语义实现，保证：

1. Hook 可观测（CLI 与 DevTools 都可见）。
2. 行为与真实浏览器关键语义对齐。
3. 与 native 路径的日志格式尽量一致（序号、分隔线、调用栈链接）。

## API-1: `document.all`

### 语义要点

1. 历史遗留对象，语义特殊（可影响 `typeof` / 松散比较等判断）。
2. 在本项目中通过 `HTMLAllCollection` 专项模板实现，而不是普通 `Document` 属性骨架。
3. 运行时返回值由 C++ special getter 生成并缓存在 document 私有字段中。

### 当前实现

1. 安装入口：`InstallDocumentAllOnObject` 在 document 实例上安装 native getter。
2. Getter：`DocumentAllNativeGetter` 构造/复用 `HTMLAllCollection` 对象并返回。
3. 集合能力：支持 `length`、`item`、`namedItem`、索引访问与 named 访问。
4. Hook 输出：走 special-path 监控链，DevTools 输出包含调用栈链接（与 native 路径一致的 `stackTrace.callFrames` 结构）。
5. DevTools 值展示策略：按当前决策回退为函数样式展示（避免与真实浏览器对象渲染差异反复拉扯）。

### 取舍说明

1. 真实浏览器控制台中 `document.all` 展示通常是 `HTMLAllCollection(...)` 列表对象。
2. VM 中为稳定和兼容（含 V8 undetectable/call-handler 约束）当前接受函数样式展示。
3. 若后续要追求外观一致，应在“语义正确”优先级之后再做展示层微调，不影响 hook 链路。

## API-2: `Event.prototype.isTrusted`

### 语义要点

1. 浏览器中，脚本 `new Event(...)` 创建的事件 `isTrusted === false`。
2. 只有用户真实输入/浏览器内部派发事件才会是 `true`。

### 当前实现

1. `Event` 构造路径在 C++ 侧通过 `EventConstructorCallback` 写入私有键 `leapvm:isTrusted=false`。
2. `isTrusted` getter 由 `IsTrustedGetterCallback` 读取私有键，默认兜底 `false`。
3. JS impl 层（`Event.impl.js` / `00-dom-shared.impl.js`）也以 `false` 作为最小语义基线。

### 取舍说明

1. 当前项目采用“最小语义”策略：默认始终 `false`。
2. 在你最终要与真实浏览器输出做比对覆盖的流程下，这个策略足够稳定，且能避免过度模拟导致的新偏差。

## 与 Hook 体系的关系

1. 两个 API 都纳入 Hook 监控：
   - `document.all`：special getter 路径。
   - `isTrusted`：`Event` 实例 getter 路径。
2. `document.all` special getter 不再自带独立噪声判定，统一走 `skeleton/hook_log_policy`：
   - paused 静音；
   - 非 task+active 静音；
   - DevTools eval/internal 栈静音；
   - 仅用户栈进入 DevTools 输出。
3. 仍保留 `g_suppress_hook_logging` + 深度门控，避免 Inspector/序列化重入导致伪日志。

## 后续扩展规则

新增“特殊 API”应满足：

1. 有明确的浏览器语义差异风险或反调试价值。
2. 通用 skeleton 路径难以稳定覆盖。
3. 能提供可验证的行为基线（至少有 CLI/DevTools 对比样例）。
