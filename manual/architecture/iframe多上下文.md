# iframe 多上下文

## 功能概述

为 `<iframe>` 元素提供独立子上下文（独立 V8 Context）模拟。每个 iframe 对应一个 `ChildFrame` 条目，持有独立的 V8 Context、SkeletonRegistry 和 dispatch_fn 缓存。同源 iframe 支持 `contentWindow` / `contentDocument` 访问和跨帧品牌校验；跨域 iframe 降级返回 `null`。

---

## 关键机制

### 1. ChildFrame 数据结构（C++）

```cpp
// vm_instance.cc 内部结构（非头文件暴露）
struct ChildFrame {
    std::string url;
    bool same_origin;
    v8::Global<v8::Context> context;
    std::unique_ptr<skeleton::SkeletonRegistry> registry;
    v8::Global<v8::Function> dispatch_fn;
};
std::map<int, ChildFrame> child_frames_;  // key = 自增 frame index
int next_child_frame_id_ = 0;
```

每个子帧拥有完全独立的 Skeleton + dispatch 系统，与主上下文并行存在于同一 Isolate 内。

### 2. 同源判断（JS 侧 isSameOrigin）

```js
// HTMLIFrameElement.impl.js
function isSameOrigin(url) {
    var mainOrigin = location.origin || 'https://www.example.com';
    if (url.indexOf('://') === -1) return true; // 相对 URL 视为同源
    var urlOrigin = url.split('/').slice(0, 3).join('/');
    return urlOrigin === mainOrigin;
}
```

JS 侧计算同源结果后通过 `leapenv.getNativeBridge().createChildFrame(url, sameOrigin)` 传入 C++，C++ 侧以此值（`cf.same_origin`）决定所有后续访问是否允许。**此判断一旦写入 C++，不可在运行时更改。**

### 3. 全局函数注册

```cpp
// vm_instance.cc 约 4335 行
register_global_fn("__createChildFrame__",   NativeCreateChildFrame);
register_global_fn("__destroyChildFrame__",  NativeDestroyChildFrame);
register_global_fn("__navigateChildFrame__", NativeNavigateChildFrame);
register_global_fn("__getChildFrameCount__", NativeGetChildFrameCount);
register_global_fn("__getChildFrameProxy__", NativeGetChildFrameProxy);
```

这 5 个函数先注册到主上下文全局对象，随后由 `runtime.js` 在 bootstrap 阶段捕获到内部 bridge（`leapenv.getNativeBridge()`）并按默认 strict 策略从 `window/globalThis` 清理名称；JS impl 层通过内部 bridge 间接调用。

### 4. window.frames / window.length（C++ 拦截）

- `window[n]`：由 C++ `IndexedPropertyHandler`（`FramesIndexedGetter`）拦截，直接返回 `child_ctx->Global()`（同源）或 `null`（跨域）。
- `window.length`：`WindowImpl.get length()` → `leapenv.getNativeBridge().getChildFrameCount()`，返回当前子帧数量。
- `window.frames`：WindowImpl 中定义为只读属性（setter no-op），读取时返回 `this`（即 window 自身）。

### 5. IsSameOriginBrandCompatible（跨帧品牌校验）

`dispatch_bridge` 在 StubCallback 中调用此函数，允许同源子帧之间共享品牌校验结果：

1. 从接收者（receiver_obj）获取其创建上下文 `receiver_ctx`
2. 检查 caller/receiver 是否均在同源子帧中
3. 优先查 receiver 侧 SkeletonRegistry，再查 caller 侧，最后允许 main 上下文兜底
4. 跨域帧或非子帧上下文一律返回 `false`

---

## 主要流程

### 子帧创建（`iframe.src = url` 触发）

```
HTMLIFrameElementImpl.set src(url)
  └─ ensureChildFrame(iframe, url)
       ├─ isSameOrigin(url) → sameOrigin:bool
       └─ leapenv.getNativeBridge().createChildFrame(url, sameOrigin)
            └─ CreateChildFrameOnVmThread(url, same_origin)
                 1. 以 global_template_ 创建新 V8 Context
                 2. 安装 Console / Timer / NativeWrapper
                 3. 注册 ChildFrame 条目到 child_frames_（先注册再执行 bundle）
                 4. 在子 Context 中执行 bundle_source_
                    └─ NativeDefineEnvironmentSkeleton 检测到子上下文
                         └─ 构建独立 SkeletonRegistry，存入 ChildFrame.registry
                 5. 设置 child location.href
                 6. 返回 frame index（从 next_child_frame_id_ 获取后自增）
       └─ _iframeFrameIndex.set(iframe, index)  // WeakMap 存储映射
```

### 访问 contentWindow

```
HTMLIFrameElementImpl.get contentWindow()
  ├─ index = _iframeFrameIndex.get(this)
  └─ leapenv.getNativeBridge().getChildFrameProxy(index)
       └─ GetChildFrameProxyOnVmThread(caller_ctx, index)
            ├─ 查 child_frames_[index]
            ├─ cf.same_origin=false → return empty (→ null)
            └─ cf.same_origin=true  → return child_ctx->Global()
```

### 子帧导航（已有子帧，更新 src）

```
ensureChildFrame(iframe, url)  // existingIndex >= 0
  └─ leapenv.getNativeBridge().navigateChildFrame(existingIndex, url)
       └─ NavigateChildFrameOnVmThread(index, url)
            └─ 更新 cf.url，在子 Context 内重新设置 location.href
               （不重建 Context，不重新执行 bundle）
```

### 子帧销毁

```
leapenv.getNativeBridge().destroyChildFrame(frameId)     // 需 JS 侧主动调用
  └─ DestroyChildFrameOnVmThread(frame_id)
       ├─ Reset dispatch_fn / registry（释放 V8 GC 引用）
       └─ child_frames_.erase(frame_id)

VmInstance 析构（shutdownEnvironment）
  └─ 遍历 child_frames_，逐一 Reset + clear
```

---

## 验证测试

| 脚本 | 状态 | 说明 |
|------|------|------|
| `tests/scripts/integration/test-leapenv-iframe.js` T21 | **PASS** | 需注入 `siteProfile.fingerprintSnapshot.location.origin = 'https://www.example.com'` |
| `tests/scripts/integration/test-leapenv-iframe.js` T22 | **PASS** | 跨域 contentWindow 正确降级返回 null |
