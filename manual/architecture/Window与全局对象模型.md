# Window 与全局对象模型

本文档描述 VM 内 `window` / `globalThis` 的建立方式、BOM 单例访问、leapenv 运行时隐藏机制和 facade 模式。

## 1. 全局对象原型链

`skeleton-init.instance.js` 在所有 skeleton 加载完毕后：

1. 调用 `leapenv.loadSkeleton()` → 触发 C++ `SkeletonRegistry` 构建
2. 修复原型链：`Object.setPrototypeOf(global.Window, global.EventTarget)`

C++ 侧的 Window instance skeleton 处理将当前 context 的 real global 原型指向 `Window.prototype`：

```js
window === globalThis          // true（global proxy 就是 window）
window instanceof Window       // true
window instanceof EventTarget  // true
```

`window.instance.skeleton.js` 设置 `exposeCtor: false`，Window 构造器不暴露，不可 `new Window()`。

## 2. Leapenv 运行时隐藏机制

运行时初始化阶段，`runtime.js` 依次执行：

### 2.1 Bridge 捕获

```js
(function() {
  // 从 global.$native 和 __createNative__ 等全局桥接符号捕获到内部 bridge
  captureMethod('defineEnvironmentSkeleton', $native, ...);
  captureMethod('createNative', global, '__createNative__');
  captureMethod('createChildFrame', global, '__createChildFrame__');
  // ... 其他 bridge 方法
  // 捕获结果存入 leapenv.__runtime.bridge.native
})();
```

### 2.2 Bridge 全局符号清理（bridgeExposureMode）

根据 `bridgeExposureMode` 配置（默认 `'strict'`）：

| 模式 | 行为 |
|------|------|
| `strict` | 删除所有 `__LEAP_*`、`$native`、`__createNative__` 等全局桥接符号 |
| `compat` | 将桥接方法重新定义为不可枚举的全局属性，保留 `$native` |

还会清理以下 bootstrap 全局键：
- `__LEAP_BOOTSTRAP__`、`__LEAP_DOM_BACKEND__`、`__LEAP_HOST_TIMERS__`
- `__LEAP_DEBUG_JS_HOOKS_RUNTIME__`、`__LEAP_HOOK_RUNTIME__`
- `__LEAP_DISPATCH__`、`__LEAP_DEV__`

### 2.3 Facade 收敛（globalFacadeMode）

`skeleton-init.instance.js` 在 skeleton 加载完成后调用：

```js
leapenv.finalizeFacade();       // 标记 facade 公开键
leapenv.lockdownGlobalFacade(); // 替换 globalThis.leapenv
```

根据 `globalFacadeMode` 配置（默认 `'strict'`）：

| 模式 | 行为 |
|------|------|
| `strict` | `globalThis.leapenv` 替换为只读 facade 对象，只暴露白名单键 |
| `compat` | 非公开键改为不可枚举，`globalThis.leapenv` 仍指向原始对象 |

**白名单键**（`DEFAULT_FACADE_PUBLIC_KEYS`）：
- `config`、`signatureTaskState`、`nativeInstances`
- `registerImpl`、`definePublicApi`
- `getNativeBridge`、`getHostTimers`
- 其他由 `definePublicApi()` 动态注册的键

内部完整 `leapenv` 仍由各模块闭包持有，不影响运行时功能。目标脚本通过 `globalThis.leapenv` 只能访问到最小 facade。

## 3. Impl 注册与 Dispatch

```js
leapenv.registerImpl('Window', WindowImpl);
```

`window.instance.skeleton.js` 定义实例级属性的 dispatch 路由，`brand: "Window"`，各属性通过 StubCallback → dispatch 路由到 WindowImpl 方法。

## 4. BOM 单例（懒加载缓存）

navigator、history、performance、screen、localStorage、sessionStorage、location 均通过 `leapenv.nativeInstances[key]` 懒加载：

```js
get navigator() {
  if (!_navigatorInstance)
    _navigatorInstance = leapenv.nativeInstances && leapenv.nativeInstances['navigator'];
  return _navigatorInstance;
}
```

location 可写（setter 转发到 `this.location.href`）。

## 5. 窗口尺寸注入

`innerWidth/Height`、`outerWidth/Height`、`devicePixelRatio` 从 `leapenv.signatureTaskState.windowMetrics` 读取：

- 默认值：innerWidth/outerWidth=1920，innerHeight/outerHeight=1080，devicePixelRatio=1
- 由 `applyFingerprintSnapshot()` 在任务前注入

## 6. 定时器

优先使用 `leapenv.getHostTimers()`（来源于 `__runtimeBootstrap.hostTimers`），回退到全局定时器：

- `setTimeout/setInterval/clearTimeout/clearInterval`：透传到宿主
- `requestAnimationFrame(cb)`：`setTimeout(16ms)` 模拟，cb 接收 `performance.now()` 或 `Date.now()`
- `cancelAnimationFrame(id)`：取消对应 setTimeout

## 7. 网络 API 占位

签名容器环境下网络 API 均被禁用：

| API | 行为 |
|-----|------|
| `fetch(...)` | 返回被拒绝的 Promise（`LEAP_NETWORK_DISABLED`） |
| `new XMLHttpRequest()` | 占位对象；`send()` 抛错并触发 `onerror` |
| `new DOMParser()` | `parseFromString()` 委托 DOM 或返回 null |
| `new XMLSerializer()` | `serializeToString()` 委托 DOM |

## 8. Crypto 占位（确定性 RNG）

`window.crypto.getRandomValues()`：

- 若 `signatureTaskState.randomSeed` 存在：xorshift32 确定性 PRNG
- 否则：回退到 `Math.random()`
- 支持所有整数 TypedArray，字节长度上限 65536

## 9. EventTarget

Window 级事件监听不走 DOM 冒泡，纯 JS 实现：

- `addEventListener(type, fn, options)`：支持 `once`、`capture`、`passive`
- `removeEventListener(type, fn)`
- `dispatchEvent(event)`：顺序调用所有监听器

## 10. 其他实现

| 能力 | 说明 |
|------|------|
| `btoa/atob` | 纯 JS 实现，兼容 Latin1 |
| `getComputedStyle(el)` | 读取 `nodeState.styleStore`，返回 Proxy |
| `window.frames` | 返回 `this` |
| `window.length` | `getNativeBridge().getChildFrameCount()` |
| `window.self/top/parent` | 均返回 `this` |
| `alert/confirm/prompt` | 存根（alert 打印 log，confirm 返回 false，prompt 返回 null） |
| `open()` | 存根，返回 null |
| `scroll/scrollTo/scrollBy/resize/move` | 存根，no-op |
| `MutationObserver(cb)` | 占位：observe/disconnect/takeRecords 可用，不监控真实 DOM |
| `isSecureContext` | 固定返回 `true` |
| `origin` | 从 `this.location.origin` 读取 |
