# DOM-BOM实现层

> 源文件：`leap-env/src/impl/`（30 个文件）、`leap-vm/src/leapvm/dom_core.cc/h`
> 更新：2026-03-05（同步 runtime bridge dispatch 路径）

## 功能概述

DOM-BOM实现层是 Leap 环境中 Web API 行为的实现载体。每个 `.impl.js` 文件对应一种或多种 Web API 类型，通过 `leapenv.registerImpl(TypeName, ImplClass)` 将实现注册到全局 `implRegistry`，供 Skeleton/Dispatch 系统在 dispatch 调用时按需查找。`00-dom-shared.impl.js` 是共享状态管理中枢，为所有 impl 提供节点状态存储、文档注册表、DOM 树操作等核心能力。

## 关键机制

### 1. registerImpl 模式

每个 impl 文件固定结构：

```js
(function (global) {
  const dom = global.leapenv.domShared;

  class FooImpl {
    get someProperty() { return dom.ensureNodeState(this).someField; }
    someMethod() { ... }
  }

  leapenv.registerImpl('Foo', FooImpl);
})(globalThis);
```

`runtime.js` 的 `registerImpl` 将 ImplClass 存入 `leapenv.implRegistry`，同时遍历整个原型链预缓存 descriptor（O1 性能），供 runtime bridge dispatch 在调用时直接查找，避免每次 dispatch 重新遍历原型链。

### 2. domShared — 节点状态中枢

`00-dom-shared.impl.js` 通过 `WeakMap`（无 WeakMap 时降级为线性数组）为每个 DOM 对象绑定内部状态（`nodeState`）：

```
nodeState = {
  nodeType, nodeName, tagName, parentNode, childNodes[],
  ownerDocument, namespaceURI, prefix, localName,
  attributeStore, attributeNSStore, styleStore, styleObject,
  textContent, layoutDirty, layoutRect,
  docId, taskId, ownedNodes,
  nodeRef, _listeners
}
```

全局注册表：
- `documentById: Map<docId, documentNode>` — 文档 ID 到对象
- `taskToDocs: Map<taskId, Set<docId>>` — 任务作用域到文档集合
- `taskPrimaryDocument: Map<taskId, documentNode>` — 任务主文档

### 3. DOM 后端（单一 dod 路径）

M06 清理后仅剩一条路径：`LEAP_DOM_BACKEND` 固定返回 `dod`，`normalizeDomBackend()` / `runner.js` 均已简化。

| 后端 | 说明 |
|------|------|
| `dod`（唯一） | 纯 JS 状态树；布局数据交 DoD 布局引擎（M07） |

> `js`（JS box-model 递归）和 `native`（C++ DomManager 桥接）后端及"轻量镜像"（`shouldMirrorNativeDom`）已在 M06 第三轮清理中整体删除。

### 4. C++ DomManager（dom_core.cc/h）

纯 C++ 实现的 DOM 树。M06 清理后 JS 侧不再通过 `$native.dom` 桥接调用，但 `skeleton_registry.cc` 仍直接使用（`document.all`、节点 generation 查询等 C++ 内部场景），因此**保留 `dom_core.cc/h`**。

```
DomManager 内部接口（仅 C++ 消费）：
  CreateDocument / CreateElement / AppendChild / RemoveChild
  SetStyle* / GetLayoutRect
  SnapshotDocument / BuildTreeFromSpec
  GetNodeGeneration / GetNodeTagName  ← skeleton_registry 使用
```

句柄设计：`NodeHandle.generation` 防止悬空引用；`handle_table_` 以 `(doc_id<<32|node_id)` 为 key 快速查找。

### 5. 默认文档树（懒注入）

访问 `document.documentElement/head/body/children/getElementById/querySelector*` 时，`ensureDocumentDefaultTree` 懒注入 `html/head/body` 子树。`window.document` getter 也主动触发此注入。

**当前约束**：`document` 保持单 `html` 根；直接插入 `Text` 到 `document` 会抛 `HierarchyRequestError`。该约束以“检测边界优先”为目标，不追求完整 WHATWG 规范覆盖。

### 6. DOM 结构与查询能力边界（检测优先）

- 树操作：`appendChild/removeChild/insertBefore/replaceChild/remove/replaceWith/replaceChildren` 已可用，支持 DocumentFragment 展开插入。
- 命名空间：`createElementNS`、`set/get/has/removeAttributeNS` 已接入，`namespaceURI/prefix/localName` 可读。
- 选择器：支持标签、`#id`、`.class`、属性选择器 `= ^= $= *= ~= |=`（含 `i` 标志）、关系选择器 ` ` / `>` / `+` / `~`、伪类子集 `:first-child/:last-child/:only-child/:empty/:nth-child/:nth-of-type/:not/:scope`。
- 明确边界：仍是“检测可用子集”，不是完整浏览器解析与选择器规范实现。

### 7. 任务作用域与文档生命周期

```
beginTaskScope(taskId)
  └─ 设置 currentTaskId，后续 createDocument/getOrCreateTaskDocument 归属此 taskId

endTaskScope(taskId) / releaseTaskScope(taskId)
  └─ 将该任务所有文档标记释放，断开节点 ownerDocument/parentNode 引用
     releaseStats 统计释放文档数/节点数
```

## 主要流程

### dispatch 到 impl 调用链

```
外部 JS 访问属性/调用方法
  → C++ Skeleton stub 触发
  → DispatchBridge 读取 DispatchMeta（typeName + propName + actionType）
  → 品牌校验
  → C++ 调用 leapenv.__runtime.bridge.dispatch(typeName, propName, actionType, ...args)
  → JS dispatch 函数：从 leapenv.implRegistry[typeName] 取 ImplClass
                       从 _implDescCache 取 descriptor
                       对 this（skeleton 实例）执行 getter/setter/method
  → ImplClass 方法内调用 dom.ensureNodeState(this) 获取内部状态
  → 操作状态后返回
```

### 文档创建与节点操作流程

```
window.document getter
  → dom.getOrCreateTaskDocument()       ← 查找或创建当前任务主文档
  → dom.ensureDocumentDefaultTree(doc)  ← 主动注入 html/head/body
  → dom.setDocumentUrl(doc, href)       ← 同步 Location.href

document.createElement(tag)
  → Document.impl: createElementForDocument(documentNode, tag)
  → 创建 skeleton 对象（createNodeObject）
  → ensureElementState(el, tag, documentNode)  ← 初始化 nodeState
  → registerNodeInDocument(documentNode, el)   ← 登记到文档节点表

document.createElementNS(ns, qualifiedName)
  → Document.impl: createElementNSForDocument(documentNode, ns, qualifiedName)
  → 解析 prefix/localName，写入 namespaceURI/prefix/localName
  → 返回对应 Element（HTML namespace 走 TAG_MAP，其他 namespace 走通用 Element）

node.appendChild(child) [通过 Node.impl]
  → dom.appendChild(parent, child)
  → 更新 parentNode/childNodes 链接
  → markNodeDirty(parent)                     ← 标记布局脏位（清除 DoD 树缓存）
```

## 已实现 API 分类清单

### DOM 核心（7个文件）

| 文件 | 注册类型 | 关键 API |
|------|----------|---------|
| `Node.impl.js` | `Node` | nodeType/nodeName/parentNode/childNodes/appendChild/removeChild/insertBefore/replaceChild/contains/cloneNode/normalize/isEqualNode/compareDocumentPosition/lookupNamespaceURI + EventTarget mixin |
| `Element.impl.js` | `Element` | tagName/id/className/children/getAttribute/setAttribute/getAttributeNS/setAttributeNS/classList/querySelector/querySelectorAll/getBoundingClientRect/innerHTML/outerHTML/matches/closest + ARIA stubs |
| `Document.impl.js` | `Document` | createElement/createElementNS/createTextNode/createComment/createDocumentFragment/getElementById/querySelector*/documentElement/head/body/children/readyState/URL/title/domain/charset |
| `HTMLDocument.impl.js` | `HTMLDocument` | document.all（HTMLAllCollection 代理）|
| `CharacterData.impl.js` | `CharacterData` | data/length/appendData/insertData/deleteData/replaceData/substringData |
| `Text.impl.js` | `Text` | splitText/wholeText |
| `DocumentFragment.impl.js` | `DocumentFragment` | querySelector/querySelectorAll/getElementById/append/prepend/replaceChildren + Node 基础增删接口 |

### HTML 元素（4个文件）

| 文件 | 注册类型 | 关键 API |
|------|----------|---------|
| `HTMLElement.impl.js` | `HTMLElement` + 常见 HTML* 别名实现（如 `HTMLParagraphElement/HTMLInputElement/...`） | style/offsetParent/offsetLeft/offsetTop/offsetWidth/offsetHeight/clientWidth/clientHeight/dataset/tabIndex/hidden/click/focus/blur/scrollIntoView |
| `HTMLCanvasElement.impl.js` | `HTMLCanvasElement/CanvasRenderingContext2D/WebGLRenderingContext` | getContext/toDataURL/2D绘图 API/WebGL API（指纹模拟）|
| `HTMLIFrameElement.impl.js` | `HTMLIFrameElement` | src/contentWindow/contentDocument（同源）/跨域安全降级 |
| `HTMLScriptElement.impl.js` | `HTMLScriptElement` | src/type/async/defer/noModule/htmlFor |

### BOM（7个文件）

| 文件 | 注册类型 | 关键 API |
|------|----------|---------|
| `Window.impl.js` | `Window` | document/location/navigator/history/screen/performance/innerWidth/innerHeight/setTimeout/clearTimeout/setInterval/clearInterval/fetch/XMLHttpRequest/crypto + 全局别名 |
| `Location.impl.js` | `Location` | href/protocol/host/hostname/port/pathname/search/hash/origin/assign/replace/reload |
| `History.impl.js` | `History` | length/state/pushState/replaceState/go/back/forward |
| `Navigator.impl.js` | `Navigator` | userAgent/platform/language/languages/hardwareConcurrency/cookieEnabled/onLine/javaEnabled/sendBeacon + geolocation stub |
| `NavigatorBrands.impl.js` | `PluginArray/Plugin/MimeTypeArray/MimeType/PermissionStatus` | plugins/mimeTypes（空集合模拟）/Permissions.query |
| `Screen.impl.js` | `Screen` | width/height/availWidth/availHeight/colorDepth/pixelDepth/orientation |
| `Performance.impl.js` | `Performance` | now/timeOrigin/timing/getEntries/mark/measure/clearMarks（seeded 时间偏移）|

### 集合与映射（5个文件）

| 文件 | 注册类型 | 关键 API |
|------|----------|---------|
| `NodeList.impl.js` | `NodeList` | length/item/[index]/forEach/entries/keys/values |
| `HTMLCollection.impl.js` | `HTMLCollection` | length/item/namedItem/[index]（`children` 为 live collection） |
| `HTMLAllCollection.impl.js` | `HTMLAllCollection` | document.all 代理（HTMLCollection 超集）|
| `NamedNodeMap.impl.js` | `NamedNodeMap` | length/item/getNamedItem/setNamedItem/removeNamedItem/getNamedItemNS/setNamedItemNS/removeNamedItemNS/[index] |
| `DOMTokenList.impl.js` | `DOMTokenList` | length/item/contains/add/remove/toggle/replace/supports/[index]/value |

### 事件（2个文件）

| 文件 | 注册类型 | 关键 API |
|------|----------|---------|
| `EventTarget.impl.js` | `EventTarget` | addEventListener/removeEventListener/dispatchEvent（捕获/目标/冒泡三阶段，支持 once/capture 语义）|
| `Event.impl.js` | `Event` | type/target/currentTarget/eventPhase/bubbles/cancelable/defaultPrevented/stopPropagation/preventDefault/composedPath + LeapEvent/CustomEvent 构造器 |

### 通信与存储（3个文件）

| 文件 | 注册类型 | 关键 API |
|------|----------|---------|
| `MessageChannel.impl.js` | `MessageChannel` | port1/port2（同进程内 postMessage 传递）|
| `MessagePort.impl.js` | `MessagePort` | postMessage/start/close/addEventListener('message') |
| `Storage.impl.js` | `Storage` | getItem/setItem/removeItem/clear/key/length（任务隔离存储）|

### 其他（1个文件）

| 文件 | 注册类型 | 说明 |
|------|----------|------|
| `CryptoJS.impl.js` | — | 第三方 CryptoJS 库包装（MD5/SHA1/SHA256/AES/Base64），非标准 Web Crypto API；由 Window.impl 的 `crypto.getRandomValues` 独立实现 seeded RNG |

> `dod-layout-engine.js` 虽在 `impl/` 目录下，但属于 M07 模块，不属于此分类。
