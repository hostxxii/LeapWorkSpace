# Skeleton系统与Dispatch

> 源文件：`leap-vm/src/leapvm/skeleton/skeleton_types.h`，`skeleton_parser.cc/.h`，`skeleton_registry.cc/.h`，`skeleton_builder.cc/.h`，`dispatch_bridge.cc/.h`，`hook_log_policy.cc/.h`，`leap-env/src/core/skeleton-loader.js`，`leap-env/src/skeleton/type/*.type.skeleton.js`，`leap-env/src/skeleton/instance/*.instance.skeleton.js`
> 更新：2026-03-03（M03 品牌 key 多 isolate 安全约束补充）

---

## 功能概述

Skeleton 系统是 LeapVM 实现 Web API 对象（DOM/BOM）的数据驱动架构，将**结构描述（Skeleton）**与**行为实现（Impl）**解耦：

- **Skeleton**（结构层）：JS 文件描述每个 Web API 类型的属性名、owner（constructor/prototype/instance）、kind（data/method/accessor）、brand 校验要求、继承关系；
- **Impl**（行为层）：JS 文件通过 `__LEAP_DISPATCH__` 注册每个属性/方法的具体逻辑；
- **C++ 组装层**：`SkeletonRegistry` 读取 Skeleton 描述，用 V8 FunctionTemplate 构建原型链，所有 method/accessor stub 都通过 `DispatchBridge::StubCallback` 路由到 `__LEAP_DISPATCH__`。

Dispatch 系统是 Skeleton 的运行时路由层：所有 stub 触发后统一调用全局 JS 函数 `__LEAP_DISPATCH__(typeName, propName, actionType, ...args)`，在 JS impl 注册表中查找并执行对应实现。

---

## 关键机制

### 1. Skeleton 文件格式

每个类型对应两类文件（均在 `leap-env/src/skeleton/`）：

**type skeleton**（`*.type.skeleton.js`）：描述类型定义（FunctionTemplate）

```js
{
  "name": "Navigator.type",       // 内部名，必须以 .type 结尾
  "ctorName": "Navigator",        // V8 ClassName / 暴露给全局的构造函数名
  "instanceName": "",             // 遗留字段，type skeleton 通常为空
  "brand": "Navigator",           // 品牌标签（Illegal invocation 检查用）
  "ctorIllegal": true,            // true = new Navigator() → TypeError
  "exposeCtor": true,             // 是否把构造函数暴露到全局对象
  "super": null,                  // 父类 type skeleton 名（如 "EventTarget.type"），null=无
  "props": {
    "userAgent": {
      "owner": "prototype",       // "constructor" | "prototype" | "instance"
      "kind": "accessor",         // "data" | "method" | "accessor"
      "brandCheck": true,
      "attributes": { "enumerable": true, "configurable": true },
      "dispatch": {
        "getter": { "objName": "Navigator", "propName": "userAgent" }
        // setter 可选
      }
    }
  }
}
```

**instance skeleton**（`*.instance.skeleton.js`）：描述单例对象

```js
{
  "name": "navigator.instance",   // 必须以 .instance 结尾
  "instanceName": "navigator",    // 安装到全局的属性名
  "brand": "Navigator",           // 复用类型品牌（支持跨帧兼容检查）
  "super": "Navigator",           // 继承自哪个 type skeleton 的 brand chain
  "ctorName": "",
  "exposeCtor": false,
  "ctorIllegal": false,
  "props": {}                     // 通常为空；特殊实例属性可在此定义
}
```

### 2. JS 侧加载流程（skeleton-loader.js）

```
各 *.skeleton.js 文件 → 追加到 leapenv.skeletonObjects[]
↓
leapenv.loadSkeleton()
  ├── filterSkeletonObjectsForProfile()  // 按 fingerprintProfile 过滤（hide/placeholder）
  ├── 构建 envDescriptor = { schemaVersion:1, envVersion, objects: [...] }
  └── $native.defineEnvironmentSkeleton(envDescriptor)  // 调用 C++ API
```

`filterSkeletonObjectsForProfile` 对 `window.instance` 的 props 执行属性级过滤（hide/placeholder/allow），对其他 skeleton 执行对象级过滤。

### 3. C++ 三阶段构建（SkeletonRegistry）

`defineEnvironmentSkeleton` NAPI 入口 → `SkeletonParser::ParseFromV8Object()` → 填充 `EnvironmentSkeleton` → `SkeletonRegistry::RegisterSkeleton()` × N → 三阶段构建：

| 阶段 | 方法 | 动作 |
|------|------|------|
| Phase 1 | `BuildPhase1_CreateTemplates()` | 为每个 `.type` skeleton 创建 `v8::FunctionTemplate`，设置 ClassName 和可选构造回调 |
| Phase 2 | `BuildPhase2_SetupInheritance()` | 递归（parent-first）设置 `Inherit()`，确保原型链正确 |
| Phase 3 | `BuildPhase3_DefinePropertiesAndInstances()` | 3.1 为 type skeleton 定义属性（DATA/METHOD/ACCESSOR）；3.2 创建实例（type 遗留模式 + instance skeleton 模式）；3.3 暴露构造函数到全局 |

**Phase 3 顺序细节**：`skeleton_order_` 以注册顺序迭代（`generate-entry.js` 控制，`window.instance` 第一）。Phase 3.3 的构造函数暴露必须在 Phase 3.2 之后执行，因为 `window.instance` 处理会临时覆盖全局构造函数，Phase 3.3 负责恢复。

### 4. DispatchBridge::StubCallback — 核心分发路径

所有 method/accessor stub 的 V8 回调函数（`skeleton_builder.cc` 中 method 和 accessor 均注册此回调）：

```
用户访问 navigator.userAgent
→ V8 触发 accessor getter stub（FunctionTemplate 回调）
→ DispatchBridge::StubCallback(args)
  ├── 安全检查：VmInstance 是否正在析构（is_disposing()）
  ├── 从 args.Data() 取 DispatchMeta（obj_name, prop_name, call_type, brand_check）
  ├── CheckBrand()：验证 this 对象的 [[leapvm_brand]] Private 属性
  │     └── Window brand 直接放行；跨帧场景走 IsSameOriginBrandCompatible()
  ├── 失败 → ThrowIllegalInvocation()
  ├── 监控 Hook 日志（若 monitor 启用且通过 HookFilter）
  ├── GetDispatchFn()：从 VmInstance 缓存取 __LEAP_DISPATCH__（首次从全局查找并缓存）
  ├── 组装 dispatch_args = [typeName, propName, "GET"|"SET"|"CALL", ...原始args]
  └── __LEAP_DISPATCH__.call(this, typeName, propName, actionType, ...args)
        → JS impl 层查找并执行
```

**call_type 到 actionType 映射**：`"get"→"GET"`，`"set"→"SET"`，`"apply"→"CALL"`

### 4.1 Native Hook 归一策略（避免“三套日志系统”）

Skeleton 侧 Native Hook 有 3 个事件源：

1. `DispatchBridge::StubCallback`：普通属性/方法。
2. `SkeletonSymbolNamedGetter`：symbol 属性（如 `@@toPrimitive`）。
3. `EmitSpecialNativeGetHookWithValue`：特殊对象（如 `document.all`）。

三者都调用 `hook_log_policy`，统一执行以下判定：

1. 当前是否任务期（`__LEAP_HOOK_RUNTIME__.phase==="task"` 且 `active===true`）。
2. Inspector 是否处于 paused 状态。
3. 调用栈是否为 DevTools eval/internal 噪声。
4. 是否存在用户代码栈帧（用于 DevTools 展示）。

所以现在路径是“事件源不同”，不是“规则不同”。

### 5. 品牌校验（Brand Check）

品牌标签存储在对象的 V8 Private 属性 `[[leapvm_brand]]` 中。校验逻辑：
1. 先检查 receiver 自身的 brand
2. 再检查 receiver 原型的 brand（兼容 global proxy 场景）
3. brand 相等 → 通过；否则走 `IsBrandCompatible()`（缓存继承链查找）
4. 跨帧场景：走 `IsSameOriginBrandCompatible()`
5. Window brand 无条件放行（避免 global proxy 差异误触发）

品牌兼容性缓存：`brand_compat_cache_` (`unordered_map<string,bool>`)，避免每次调用遍历继承链（O2 优化）。

多 isolate 约束：
- `[[leapvm_brand]]` 对应的 V8 `Private` key 必须按当前 isolate 获取（`v8::Private::ForApi`）。
- 禁止使用进程级静态 V8 句柄缓存（如 `static v8::Eternal<v8::Private>`）跨 isolate 复用；在 `worker_threads` 下会导致原生崩溃风险。

### 6. DispatchMeta 生命周期

`DispatchMeta`（obj_name + prop_name + call_type + brand_check + brand）由 `SkeletonRegistry::CreateDispatchMeta()` 创建，所有权归 `dispatch_metas_`（`vector<unique_ptr<DispatchMeta>>`），生命周期与 `SkeletonRegistry` 绑定。作为 `v8::External` 存储在 V8 stub 的 Data 字段中，C++ 侧负责 VmInstance 析构时的安全门（`is_disposing()` 检查）。

### 7. iframe 多上下文支持

子帧创建时，C++ 在新 Context 中重新执行 `bundle_source_`，由 `NativeDefineEnvironmentSkeleton` 检测到子上下文后**独立构建** `SkeletonRegistry`，保证子帧拥有与主帧相同的类型定义。`__LEAP_DISPATCH__` 缓存存储在 `VmInstance` 中（每个 context 各自一份）。

---

## 主要流程

### 初始化流程（完整路径）

```
1. JS: require('leap-vm') → addon NAPI → VmInstance::RunScript()
2. JS: 执行 leap-env bundle (leapenv.js)
   a. runtime.js: 注册 __LEAP_DISPATCH__(typeName, propName, actionType, ...args)
   b. config.js: 读取配置（dispatchMissingMode 等）
   c. 各 *.skeleton.js: 填充 leapenv.skeletonObjects[]
   d. skeleton-loader.js: leapenv.loadSkeleton()
      → filterSkeletonObjectsForProfile()
      → $native.defineEnvironmentSkeleton(envDescriptor)
3. C++: VmInstance::NativeDefineEnvironmentSkeleton()
   → SkeletonParser::ParseFromV8Object()     // JS Object → EnvironmentSkeleton
   → registry.RegisterSkeleton() × N
   → registry.BuildPhase1_CreateTemplates()
   → registry.BuildPhase2_SetupInheritance()
   → registry.BuildPhase3_DefinePropertiesAndInstances()
4. 结果: window/document/Navigator 等全部就位，可供目标脚本使用
```

### 运行时 dispatch 流程（以 navigator.userAgent 为例）

```
目标脚本: navigator.userAgent
→ V8: 触发 Navigator.prototype 上的 userAgent accessor getter stub
→ DispatchBridge::StubCallback(args)
  meta = { obj:"Navigator", prop:"userAgent", call_type:"get", brand_check:true, brand:"Navigator" }
→ CheckBrand(this=navigator) → 通过（Navigator brand 匹配）
→ GetDispatchFn() → __LEAP_DISPATCH__（缓存命中）
→ __LEAP_DISPATCH__.call(navigator, "Navigator", "userAgent", "GET")
→ JS: impl 注册表查找 Navigator.userAgent.GET
→ 返回配置注入的 userAgent 值
```
