# Hook监控与拦截体系

> 源文件：`leap-vm/src/leapvm/monitor.cc/.h`，`leap-vm/src/leapvm/hook_filter.cc/.h`，`leap-vm/src/leapvm/native_wrapper.cc/.h`，`leap-vm/src/leapvm/skeleton/dispatch_bridge.cc/.h`，`leap-vm/src/leapvm/skeleton/skeleton_registry.cc/.h`，`leap-vm/src/leapvm/skeleton/hook_log_policy.cc/.h`，`leap-vm/src/leapvm/builtin_wrapper.cc/.h`，`leap-env/runner.js`（黑名单配置段）
> 更新：2026-03-02

## 功能概述

Hook 体系是 LeapVM 的调试可观测层，拦截并记录 VM 内部 JS API 调用，为“Skeleton 缺口发现 → 补充 → 验证”开发循环提供信号来源。

两条独立拦截平面：

| 平面 | 日志标志 | 触发时机 |
|------|---------|----------|
| **Native Hook** | `[hook][native]` / `[hook][native#N]` | Skeleton 对象属性 GET / SET / CALL（V8 interceptor，含 Symbol 属性） |
| **Builtin Wrapper** | `[hook][builtin]` | 被包装的 C++ 内置函数 call / return / throw |

两条平面各有独立的过滤配置，互不干扰。

Native Hook 现在按“事件源”和“策略层”解耦，避免 `dispatch/special/symbol` 三条路径各自维护一套噪声逻辑：

| 层级 | 模块 | 责任 |
|------|------|------|
| **事件源层** | `dispatch_bridge.cc`、`skeleton_registry.cc`（symbol/special） | 捕获 GET/SET/CALL 事件并组装日志载荷 |
| **策略层** | `hook_log_policy.cc` | 统一判定是否允许日志（任务期、暂停态、DevTools eval 噪声、用户栈识别） |
| **输出层** | `monitor.cc` + Inspector 发送 | 输出到 CLI / DevTools，序号与格式保持一致 |

## 关键机制

### 1. Native Hook — 三事件源 + 一套策略

**核心文件：** [native_wrapper.cc](../../leap-vm/src/leapvm/native_wrapper.cc)、[dispatch_bridge.cc](../../leap-vm/src/leapvm/skeleton/dispatch_bridge.cc)、[skeleton_registry.cc](../../leap-vm/src/leapvm/skeleton/skeleton_registry.cc)、[hook_log_policy.cc](../../leap-vm/src/leapvm/skeleton/hook_log_policy.cc)、[monitor.cc](../../leap-vm/src/leapvm/monitor.cc)、[hook_filter.cc](../../leap-vm/src/leapvm/hook_filter.cc)

V8 ObjectTemplate 绑定 `NamedPropertyHandlerConfiguration` + `IndexedPropertyHandlerConfiguration`，拦截任意 JS 对象的属性访问。每个 wrapper 持有两个内部字段：`backing`（原始对象）和 `meta_id`（元信息 ID）。

`NativeWrapperRegistry`（单例）维护 `meta_id → NativeWrapperMeta{label}` 映射，用于生成日志标签（如 `window.navigator`）。

**重入守卫：** `thread_local bool g_in_native_wrapper_hook` + RAII `NativeWrapperHookGuard`。日志输出调用 `console.log` / Inspector 时，若内部触发同一 interceptor，快速路径直接透传 backing，不再触发任何日志，防止递归日志风暴。

**三层过滤（`hook_filter.cc`：`ShouldEnterHookPipeline`）：**

| 层 | 类型 | 逻辑 |
|----|------|------|
| 对象级 | `blocked_objects` | `window.X` 精确匹配或前缀匹配 |
| 属性级 | `blocked_properties` | 精确匹配属性名 |
| 前缀级 | `blocked_prefixes` | 属性名前缀匹配 |

白名单优先门控（非空才生效），再走黑名单过滤。Symbol 属性不再直接透传，统一归一化后进入同一过滤链。

Native Hook 在 skeleton 体系中有 3 个事件源：

1. `dispatch_bridge.cc`：普通 skeleton method/accessor 的 GET/SET/CALL。
2. `skeleton_registry.cc::SkeletonSymbolNamedGetter`：symbol-key 读取。
3. `skeleton_registry.cc::EmitSpecialNativeGetHookWithValue`：特殊对象路径（如 `document.all`）。

这 3 条事件源统一调用 `hook_log_policy`，不再各自复制一份噪声判定。

**Symbol 属性 Hook（2026-03）：**

- `native_wrapper.cc` 中 `ResolveNameKey()` 将 `v8::Name` 统一归一化为字符串键，Named GET/SET/QUERY/DELETE 均可进入 hook：
  - well-known symbol：`@@toStringTag`、`@@toPrimitive`、`@@iterator`...
  - 用户 symbol：`Symbol(desc)` / `Symbol()`
- `skeleton_registry.cc` 中 `SkeletonSymbolNamedGetter` 负责 skeleton 对象的 symbol-key 原型访问日志。
- DevTools 下 symbol 访问输出采用与常规 native hook 一致的三段式（同一序号）：
  - `[hook][native#N] get <Root>.<@@symbol>`
  - `[hook][native#N] => <value>`
  - `[hook][native#N] --------------------------------`

**统一噪声门控（多层结构）：**

噪声过滤分为两级，由调用方和策略层协同完成：

**第一级：调用方预检（`dispatch_bridge.cc` / `skeleton_registry.cc`）**
1. `g_suppress_hook_logging` 为 true 时静音（Inspector/序列化重入期间）。
2. `g_hook_log_depth > 1` 时静音（嵌套 hook 调用）。
3. `g_in_dispatch_cdp_emit` 为 true 时静音（CDP 消息发送期间）。

**第二级：策略层判定（`hook_log_policy.cc::ShouldSuppressHookNoise`）**
1. `inspector->is_paused()` 为 true 时静音。
2. 非 `__LEAP_HOOK_RUNTIME__` 的 `task + active` 阶段静音。
3. `HasDevtoolsEvalFrame()` 命中 DevTools/eval/internal URL 时静音。

**第三级：用户栈检查（调用方后检）**
- 仅存在用户代码栈帧（`HasUserFrame`）时才允许发到 DevTools（CLI 与 Monitor 同步遵循同一准入结果）。

**MonitorEngine（`monitor.cc`）：** 在 `ShouldEnterHookPipeline` 通过后二次判断：
- `HookRegistry` 为空 → **全覆盖模式**：所有通过黑名单的属性均记录
- `HookRegistry` 非空 → **精确白名单模式**：只记录匹配规则（`root + path + log_get/log_set/log_call`）的事件

**输出通道：**
1. CLI stdout：`LEAPVM_LOG_INFO`，格式化为 `Error: ...\n    at func (url:line:col)` 以支持 DevTools 行列定位
2. DevTools：通过 `console.log` 回调注入 Inspector（受 `g_in_native_wrapper_hook` 保护防递归）

---

### 2. Builtin Wrapper — C++ 函数替换包装

**核心文件：** [builtin_wrapper.cc](../../leap-vm/src/leapvm/builtin_wrapper.cc)

安装时将目标函数（如 `JSON.stringify`）从全局对象上取下，用 `BuiltinWrapperCallback` 替换，原函数保存在 `BuiltinWrapperCallbackData.original_fn`（Global 引用）。

**三级结构：**
```
BuiltinWrapperManager（VmInstance 拥有，持有 config）
  └─ BuiltinWrapperContextRegistry（每个 Context 一个）
       └─ BuiltinWrapperCallbackData（每个 target 一个，堆分配，地址稳定）
```

**单一回调 `BuiltinWrapperCallback`：**
- 重入快速路径：`g_in_builtin_wrapper_callback = true` 时直接调用 original，不记录
- `HookDepthGuard`：维护 `g_hook_log_depth` 计数，深度 > 1 时 `BaseEligible` 返回 false，防止嵌套日志
- 调用 original 前捕获 JS 调用栈（`CollectCallFrames`），分别输出 call / return / throw 三个阶段

**阶段过滤（`CheckPhase`）：** 读取全局 `__LEAP_HOOK_RUNTIME__.active`（task 模式）或 `phase` 字段，决定当前是否为目标阶段。兼容旧 key `__LEAP_DEBUG_JS_HOOKS_RUNTIME__`。

phase 完整生命周期：`bundle`（初始 bundle 加载）→ `setup`（任务前置注入）→ `task`（目标脚本执行，`active=true`）→ `idle`（任务结束）。未找到 `__LEAP_HOOK_RUNTIME__` 时 C++ 侧默认返回 `bootstrap`。

**输出通道：**
1. CLI stdout：`LEAPVM_LOG_INFO("[hook][builtin] call/return/throw ...")`
2. DevTools CDP：`Runtime.consoleAPICalled` 消息（带 `stackTrace` 和 `RemoteObject` preview），通过 `LeapInspectorClient::SendToFrontend` 发送

**调用上限：** `max_per_api`（-1 = 不限），超出后只打一行 `reached cap N`，之后静默。

---

### 3. 全局抑制标志

| 标志 | 声明 | 作用 |
|------|------|------|
| `thread_local bool g_suppress_hook_logging` | `vm_instance.h:30` | Inspector 回调、builtin wrapper 日志代码执行期间设为 true，阻止 Native Hook 和 Builtin Wrapper 重入记录 |
| `thread_local int g_hook_log_depth` | `vm_instance.h:33` | Builtin Wrapper 回调深度计数，> 1 时 `BaseEligible` 返回 false |

两者均为 thread-local，多线程（线程池）场景下各 worker 独立。

---

### 4. 黑名单默认值（`runner.js`）

```js
// 对象级：这些对象的所有属性访问均跳过 hook
DEFAULT_OBJECT_BLACKLIST = [
  'console',
  'Object', 'Function', 'Array', 'String', 'Number', 'Boolean',
  'Symbol', 'BigInt', 'Math', 'Date', 'RegExp', 'Error',
  'Map', 'WeakMap', 'Set', 'WeakSet',
  'Promise', 'Proxy', 'Reflect', 'JSON', 'Intl',
  'ArrayBuffer', 'DataView',
  /* 全部 TypedArray 类型 */
]

// 属性级：频率高但信息量低
DEFAULT_PROPERTY_BLACKLIST = ['constructor', 'prototype']

// 前缀级
DEFAULT_PREFIX_BLACKLIST = ['__']
```

> 注：`then` / `toString` / `valueOf` 已从黑名单移除——重入守卫从根本上阻断递归，这些属性现在可安全拦截。

---

### 5. NAPI 导出接口（`main.cc` 模块级）

| JS 名称 | C++ 实现 | 说明 |
|---------|---------|------|
| `setPropertyBlacklist(objs, props, prefixes)` | `VmInstance::SetPropertyBlacklist` | 设置 `GlobalHookConfig.blacklist` |
| `setPropertyWhitelist(objs, props, prefixes)` | `VmInstance::SetPropertyWhitelist` | 设置 `GlobalHookConfig.whitelist` |
| `setMonitorEnabled(bool)` | `VmInstance::SetMonitorEnabled` | 启用/禁用 MonitorEngine |
| `setHookLogEnabled(bool)` | `VmInstance::SetHookLogEnabled` | 全局开关（独立于 MonitorEngine） |
| `installBuiltinWrappers(config)` | `VmInstance::InstallBuiltinWrappers` | 配置并安装 Builtin Wrapper |

同名方法也通过 `VmInstanceWrapper`（NAPI Class）暴露，供 `VmInstance` 实例调用。

## 主要流程

### Native Hook 完整链路

```
runner.js: configureHooks()
  │  leapvm.setPropertyBlacklist(DEFAULT_*_BLACKLIST)  ← 始终调用
  │  leapvm.setMonitorEnabled(true)                    ← 仅 debug:true
  │
  ↓ 目标脚本执行时
JS: window.navigator.userAgent
  │
V8: NativeWrapperNamedGetter(property="userAgent", info)
  ├─ g_in_native_wrapper_hook? → fast-path（透传 backing）
  ├─ ShouldEnterHookPipeline(cfg, {root="window.navigator", path="userAgent", op=kGet})
  │    ├─ whitelist 门控（allowed_objects 非空时才生效）
  │    ├─ blocked_objects 匹配 → false（跳过）
  │    ├─ blocked_properties 匹配 → false
  │    └─ blocked_prefixes 匹配 → false
  │    → true（进入 hook 管线）
  ├─ backing->Get(ctx, property) → result
  ├─ ShouldLogWrapper() → monitor_engine().ShouldLog(ctx)
  │    ├─ cfg.enabled? → false → return false
  │    └─ registry_.IsEmpty()? → true（全覆盖模式）→ return true
  └─ EmitWrapperHook(isolate, "window.navigator", "userAgent", kGet)
       ├─ NativeWrapperHookGuard guard  ← 设置重入标志
       ├─ LEAPVM_LOG_INFO("[hook][native] ...")  ← stdout
       └─ console.log → Inspector CDP            ← DevTools
```

### Builtin Wrapper 完整链路

```
runner.js: run({ debugCppWrapperRules: { enabled: true } })
  └─ leapvm.installBuiltinWrappers(cfg)
       └─ BuiltinWrapperManager::InstallInContext()
            └─ BuiltinWrapperContextRegistry::InstallAll()
                 └─ InstallOne("JSON.stringify")
                      ├─ ResolvePath("JSON.stringify") → holder=JSON, key="stringify"
                      ├─ 取原函数，存入 BuiltinWrapperCallbackData.original_fn
                      └─ 替换: JSON["stringify"] = BuiltinWrapperCallback（带 External*data）

目标脚本: JSON.stringify(obj)
  └─ BuiltinWrapperCallback(args)
       ├─ g_in_builtin_wrapper_callback? → fast-path
       ├─ HookDepthGuard ++g_hook_log_depth
       ├─ BaseEligible() → g_suppress_hook_logging / g_hook_log_depth / enabled / whitelist / blacklist / phase
       ├─ log_call = true → CollectCallFrames() → EmitLog("call", ...) + EmitBuiltinHookCDP(...)
       ├─ original_fn->Call(ctx, this, argv) → result
       ├─ log_return = true → EmitLog("return", ...) + EmitBuiltinHookCDP(...)
       └─ args.GetReturnValue().Set(result)
```
