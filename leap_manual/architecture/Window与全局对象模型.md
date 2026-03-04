# Window与全局对象模型

> 源文件：`leap-env/src/impl/Window.impl.js`，`leap-env/src/instance/skeleton-init.instance.js`，`leap-env/src/skeleton/instance/window.instance.skeleton.js`
> 更新：2026-03-01（M05 全链路审查）

## 功能概述

在 LeapVM V8 Context 中构建接近浏览器语义的全局对象（`window`）模型，使目标脚本对 `window instanceof Window`、BOM 单例访问、定时器、网络 API、事件监听等调用行为符合预期，同时通过签名容器（siteProfile）按任务注入可控的窗口尺寸、随机数种子等参数，保证多任务隔离与可重放性。

## 关键机制

### 1. 全局对象原型链设置

`skeleton-init.instance.js` 在所有 skeleton 加载完毕后执行两件事：

1. 调用 `leapenv.loadSkeleton()` — 触发 C++ 侧 `SkeletonRegistry` 创建所有类型/实例 shell
2. 修复原型链：`Object.setPrototypeOf(global.Window, global.EventTarget)`

Window 类型 skeleton 的特殊分支（`skeleton_registry.cc:CreateInstanceFromInstanceSkeleton`）将当前 context 的 real global 原型指向 `Window.prototype`，使得：

```js
window === globalThis          // true（global proxy 就是 window）
window instanceof Window       // true
window instanceof EventTarget  // true
```

注：`exposeCtor: false`（`window.instance.skeleton.js`），Window 构造器不对外暴露，不可 `new Window()`。

### 2. impl 注册与 dispatch

```js
leapenv.registerImpl('Window', WindowImpl);
```

`WindowImpl` 是标准 ES6 class，通过运行时注册挂入 dispatch 体系（GitNexus 静态分析无法追踪，符合预期）。`window.instance.skeleton.js` 定义实例级属性的 dispatch 路由：`brand: "Window"`，`super: "Window"`，各属性通过 `callType: "apply"` 调用 impl 对应方法。

### 3. BOM 单例（懒加载缓存）

navigator、history、performance、screen、localStorage、sessionStorage、location 均通过 `leapenv.nativeInstances[key]` 懒加载，首次访问时缓存到模块私有变量，后续命中缓存：

```js
get navigator() {
  if (!_navigatorInstance)
    _navigatorInstance = leapenv.nativeInstances && leapenv.nativeInstances['navigator'];
  return _navigatorInstance;
}
```

location 可写（setter 转发到 `this.location.href`）。

### 4. 窗口尺寸注入（signatureTaskState）

`innerWidth/Height`、`outerWidth/Height`、`devicePixelRatio` 从 `leapenv.signatureTaskState.windowMetrics` 按键读取：

```js
getMetricNumber('innerWidth', 1920)  // 优先 signatureTaskState，无则回退默认值
```

默认值：innerWidth/outerWidth=1920，innerHeight/outerHeight=1080，devicePixelRatio=1。

### 5. 定时器（宿主定时器代理）

优先使用 `global.__LEAP_HOST_TIMERS__`（宿主注入对象），回退到全局 `setTimeout/setInterval/clearTimeout/clearInterval`：

- `setTimeout/setInterval/clearTimeout/clearInterval`：透传到宿主定时器
- `requestAnimationFrame(cb)`：用 `setTimeout(16ms)` 模拟，cb 接收 `performance.now()` 或 `Date.now()`
- `cancelAnimationFrame(id)`：取消对应 setTimeout

### 6. 网络 API 占位（全部禁用）

签名容器环境下网络 API 均被禁用，通过 `placeholderPolicy.rejectNetwork` 或内置 `LEAP_NETWORK_DISABLED` 错误拒绝：

| API | 行为 |
|-----|------|
| `fetch(...)` | 返回被拒绝的 Promise（`LEAP_NETWORK_DISABLED`） |
| `new XMLHttpRequest()` | 返回完整占位对象；`send()` 抛错并触发 `onerror` |
| `new DOMParser()` | `parseFromString()` 委托 `dom.parseHTMLUnsafe` 或返回 null |
| `new XMLSerializer()` | `serializeToString()` 委托 `dom.serializeNode` |

### 7. Crypto 占位（确定性 RNG）

`window.crypto.getRandomValues()` 的实现：

- 若 `signatureTaskState.randomSeed` 存在：使用 xorshift32 确定性 PRNG（种子由 seed → FNV-1a hash → uint32）
- 否则：回退到 `Math.random()`

支持所有整数 TypedArray（Int8–BigUint64），字节长度上限 65536（与浏览器规范一致）。

### 8. EventTarget（I-11）

Window 级事件监听不走 DOM 冒泡，纯 JS 实现：

- `addEventListener(type, fn, options)`：支持 `once`（自动移除）、`capture`、`passive`
- `removeEventListener(type, fn)`
- `dispatchEvent(event)`：顺序调用所有监听器，返回 `!event.defaultPrevented`

### 9. 其他实现要点

| 能力 | 说明 |
|------|------|
| `btoa/atob` | 纯 JS 实现，兼容 Latin1 编码范围 |
| `getComputedStyle(el)` | 读取 `dom.ensureNodeState(el).styleStore`，返回 Proxy |
| `window.frames` | 返回 `this`（window 自身） |
| `window.length` | 调用 C++ `__getChildFrameCount__()`（iframe A3 路径） |
| `window.self/top/parent` | 当前顶层语义，均返回 `this` |
| `alert/confirm/prompt` | 存根：alert 打印 log，confirm 返回 false，prompt 返回 null |
| `open()` | 存根，返回 null |
| `scroll/scrollTo/scrollBy/resize/move` | 存根，no-op |
| 事件构造器 | `CustomEvent/MessageEvent/MouseEvent/KeyboardEvent`：优先用全局构造器，否则返回 `createPlaceholderEvent` 对象 |
| `MutationObserver(cb)` | 占位：observe/disconnect/takeRecords 均可用，不监控真实 DOM 变化 |
| `isSecureContext` | 固定返回 `true` |
| `origin` | 从 `this.location.origin` 读取，无则返回 `'null'` |

## 主要流程

```
loadSkeleton()
  └─ C++ SkeletonRegistry 创建 Window type/instance shells
       └─ real global.[[Prototype]] → Window.prototype

skeleton-init.instance.js
  └─ Object.setPrototypeOf(Window, EventTarget)  ← 修复原型链

目标脚本执行：
  window.navigator        → leapenv.nativeInstances['navigator']（懒加载）
  window.innerWidth       → signatureTaskState.windowMetrics.innerWidth || 1920
  window.crypto           → CryptoPlaceholder（xorshift32 / Math.random 回退）
  fetch(url)              → rejected Promise（LEAP_NETWORK_DISABLED）
  new XMLHttpRequest()    → 占位对象（send 时抛错）
  setTimeout(fn, 16)      → 宿主 __LEAP_HOST_TIMERS__.setTimeout
  requestAnimationFrame   → setTimeout(16ms) 模拟
```

## 回归脚本

| 脚本 | 类型 | 结果（2026-03-01） |
|------|------|--------------------|
| `tests/scripts/integration/test-leapenv-dom-minimal.js` | Window + DOM 基础验证 | **PASS** |
