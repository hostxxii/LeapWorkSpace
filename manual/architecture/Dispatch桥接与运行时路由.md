# Dispatch 桥接与运行时路由

本文档描述 C++ StubCallback 到 JS impl 的运行时路由机制。Skeleton 数据格式和构建流程见 `Skeleton系统.md`。

## 1. 核心调用链

```text
目标脚本访问 navigator.userAgent
  → V8 触发 Navigator.prototype 上的 accessor getter stub
  → DispatchBridge::StubCallback(args)
    → CheckBrand(this)
    → GetDispatchFn() → leapenv.__runtime.bridge.dispatch
    → dispatch_fn.call(this, "Navigator", "userAgent", "GET")
  → JS impl 注册表查找 Navigator.userAgent.GET
  → 返回值原路返回
```

## 2. DispatchMeta

每个 stub 对应一个 `DispatchMeta`：

```cpp
struct DispatchMeta {
  std::string obj_name;     // 类型名（如 "Navigator"）
  std::string prop_name;    // 属性名（如 "userAgent"）
  std::string call_type;    // "get" | "set" | "apply"
  bool brand_check;         // 是否做品牌校验
  std::string brand;        // 品牌标签
};
```

- 由 `SkeletonRegistry::CreateDispatchMeta()` 创建
- 所有权归 `dispatch_metas_`（`vector<unique_ptr<DispatchMeta>>`）
- 作为 `v8::External` 存储在 stub 的 Data 字段中
- 生命周期与 `SkeletonRegistry` 绑定

## 3. StubCallback 流程

`DispatchBridge::StubCallback(args)` 的完整路径：

1. **安全检查**：VmInstance 是否正在析构（`is_disposing()`）
2. **提取 DispatchMeta**：从 `args.Data()` 获取
3. **品牌校验**（`CheckBrand`）：
   - 验证 `this` 对象的 `[[leapvm_brand]]` Private 属性
   - Window brand 直接放行
   - 跨帧场景走 `IsSameOriginBrandCompatible()`
   - 失败 → `ThrowIllegalInvocation()`
4. **Hook 日志**：若 monitor 启用且通过 HookFilter → 记录
5. **获取 dispatch 函数**：`GetDispatchFn()` 从 VmInstance 缓存取（首次从 `leapenv.__runtime.bridge.dispatch` 查找并缓存）
6. **调用 dispatch**：`dispatch_fn.call(this, typeName, propName, actionType, ...args)`

**call_type → actionType 映射**：`"get"→"GET"`, `"set"→"SET"`, `"apply"→"CALL"`

## 4. JS 侧 dispatch 注册

`runtime.js` 建立 dispatch 函数并挂载到 `leapenv.__runtime.bridge.dispatch`。dispatch 函数内部：

1. 查找 impl 注册表：`implRegistry[typeName]`
2. 查找属性处理器：`impl[propName]`
3. 按 actionType 执行对应处理器
4. 返回结果

### registerImpl

```js
leapenv.registerImpl('Navigator', NavigatorImpl);
```

注册时预缓存整条原型链描述符（`registerImpl()` 调用时捕获）。**注册后原型链不可变**——注册后增删 impl 方法会导致缓存过时。

## 5. dispatchMissingMode

当 dispatch 找不到对应 impl 实现时：

| 模式 | 行为 |
|------|------|
| `'warn'`（默认） | 控制台警告 + 返回 `undefined` |
| `'silent'` | 静默返回 `undefined` |
| `'throw'` | 抛出 Error |

当前硬编码为 `'warn'`。

## 6. dispatch_fn 缓存

- 每个 VmInstance 维护 `dispatch_fn` 缓存（`v8::Global<v8::Function>`）
- 首次调用时从 `leapenv.__runtime.bridge.dispatch` 查找并缓存
- iframe 子帧拥有独立的 dispatch_fn 缓存
- VmInstance 析构时释放

## 7. Native Hook 归一策略

Skeleton 侧 Native Hook 有 3 个事件源：

1. `DispatchBridge::StubCallback`：普通属性/方法
2. `SkeletonSymbolNamedGetter`：symbol 属性（如 `@@toPrimitive`）
3. `EmitSpecialNativeGetHookWithValue`：特殊对象（如 `document.all`）

三者统一调用 `hook_log_policy` 判定是否输出日志（见 `Hook监控与拦截体系.md`），保证行为一致。
