# 特殊 API 模块

本文档收敛那些“不适合只靠普通 skeleton + 通用 dispatch 描述”的 API。它们通常至少满足以下一项：

- 语义本身带有浏览器历史包袱或私有槽行为，普通属性转发不够。
- 返回值会形成一整组带品牌关系的对象图，不是单点 getter。
- 行为强依赖任务态快照，属于高指纹风险面。
- 需要维护异步队列、跨对象 entangle、缓存或重置逻辑。

## 1. `document.all`

### 为什么特殊

- 它既是历史遗留对象，又带有非常规的判断语义。
- 返回值不是普通 JS 对象，而是 `HTMLAllCollection` 风格集合。
- Hook 路径不是常规 dispatch，而是 C++ special getter。

### 当前实现

1. `InstallDocumentAllOnObject` 在 document 实例上安装 native getter。
2. `DocumentAllNativeGetter` 构造或复用 `HTMLAllCollection`。
3. 支持 `length`、`item`、`namedItem`、索引访问与 named 访问。
4. Hook 输出走 special native get 路径，并统一进入 `hook_log_policy`。

## 2. `Event.prototype.isTrusted`

### 为什么特殊

- 该值在浏览器里依赖事件来源，不是纯 JS 可推导状态。
- 需要在构造时写入私有键，再由 getter 读取。

### 当前实现

1. `EventConstructorCallback` 写入 `leapvm:isTrusted=false`。
2. `IsTrustedGetterCallback` 从私有键读取，缺省兜底 `false`。
3. JS impl 继续以 `false` 作为最小语义基线。

## 3. `crypto` / `randomUUID`

### 为什么特殊

- 这是典型高指纹面，尤其 `getRandomValues()` 和 `randomUUID()`。
- 行为不能简单透传 `Math.random()`，还要满足 TypedArray 类型校验、配额限制和任务级确定性。

### 当前实现

1. `Crypto.impl.js` 读取 `signatureTaskState.randomSeed`，按 task 维度维护确定性 RNG。
2. `getRandomValues()` 只接受整数 TypedArray，超过 65536 字节抛 `QuotaExceededError`。
3. `randomUUID()` 基于同一随机源生成 v4 UUID。
4. `subtle` 当前固定返回 `undefined`，不模拟完整 WebCrypto。

## 4. `canvas` / `CanvasRenderingContext2D` / `WebGLRenderingContext`

### 为什么特殊

- Canvas/WebGL 是核心指纹面，普通 skeleton 只能给出壳，不能表达缓冲区、绘制历史和 profile 注入。
- 2D 上下文、WebGL 上下文和 canvas 元素之间有共享状态。
- WebGL 还涉及扩展列表、上下文属性和参数表。

### 当前实现

1. `HTMLCanvasElement.impl.js` 为 canvas 维护私有 `canvasState`。
2. 2D context 记录 draw call、尺寸、文本度量等最小语义。
3. WebGL context 从 `signatureTaskState.canvasProfile.webgl` 读取扩展、参数和 contextAttributes。
4. `toDataURL()`、`getContext()`、尺寸变更与上下文缓存都走专项实现。

## 5. Navigator 品牌集合：`PluginArray` / `Plugin` / `MimeTypeArray` / `MimeType` / `PermissionStatus`

### 为什么特殊

- 这组对象不是单值返回，而是带品牌关系、索引属性、named 属性和互相引用的集合图。
- `navigator.plugins`、`navigator.mimeTypes`、`navigator.permissions.query()` 都依赖任务态快照。
- 普通 skeleton 只能定义类型轮廓，无法维护集合实例状态。

### 当前实现

1. `NavigatorBrands.impl.js` 负责创建 branded collection 和成员对象。
2. `PluginArray` / `MimeTypeArray` 支持 `length`、`item()`、`namedItem()`、索引访问和 named 暴露。
3. `MimeType.enabledPlugin`、`Plugin[i]` 等关系在构造时建立。
4. `PermissionStatus` 维护 `name`、`state`、`onchange` 最小语义。

## 6. `MessageChannel` / `MessagePort`

### 为什么特殊

- 它们依赖双端口 entangle、消息队列、异步分发和关闭状态。
- 不是同步 getter/call 就能表达的 API。
- 任务结束后还要显式 reset，避免跨任务残留队列。

### 当前实现

1. `MessageChannel.impl.js` 创建 entangled ports，并维护 live 列表和运行时统计。
2. `MessagePort.impl.js` 负责 `postMessage()`、`start()`、`close()`、`onmessage`。
3. 队列优先走 microtask / host timer flush，必要时立即 drain 兜底。
4. `resetSignatureTaskState()` 会额外调用 `resetMessagePortTaskState()` 清理残留状态。

## 7. 判定标准

一个 API 是否应进入本模块，当前看三条标准：

1. 语义是否依赖私有状态、跨对象关系或浏览器历史兼容逻辑。
2. 是否属于高指纹风险面，站点会主动读取并比对。
3. 是否需要任务态注入、额外 reset、缓存或专门 Hook 路径。

满足任意两条，通常就不该只写成“普通 impl”。
