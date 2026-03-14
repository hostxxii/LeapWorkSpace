# Hook 监控与拦截体系

本文档描述 Hook 体系的两条拦截平面、Hook 日志策略层和输出机制。

## 1. 概述

Hook 体系是 LeapVM 的调试可观测层，拦截并记录 VM 内 JS API 调用，为"Skeleton 缺口发现 → 补充 → 验证"开发循环提供信号。

两条独立拦截平面：

| 平面 | 日志标志 | 触发时机 |
|------|---------|----------|
| **Native Hook** | `[hook][native]` | Skeleton 对象属性 GET / SET / CALL |
| **Builtin Wrapper** | `[hook][builtin]` | 被包装的 C++ 内置函数 call / return / throw |

## 2. Native Hook — 三事件源 + 一套策略

### 事件源

| 事件源 | 代码位置 | 触发场景 |
|--------|---------|----------|
| `DispatchBridge::StubCallback` | `dispatch_bridge.cc` | 普通 skeleton method/accessor 的 GET/SET/CALL |
| `SkeletonSymbolNamedGetter` | `skeleton_registry.cc` | symbol-key 读取（`@@toStringTag` 等） |
| `EmitSpecialNativeGetHookWithValue` | `skeleton_registry.cc` | 特殊对象路径（如 `document.all`） |

三条事件源统一调用策略层，不再各自复制噪声判定逻辑。

### Hook 日志策略层（hook_log_policy.cc）

把"是否应该输出日志"从事件实现中拆出来形成独立策略层，避免三条路径重复实现和行为漂移。

策略层对外提供的判定函数：

| 函数 | 职责 |
|------|------|
| `ShouldSuppressHookNoise()` | 统一静音决策 |
| `CaptureHookStackFrames()` | 采样调用栈 |
| `IsInternalUrl()` | 识别 LeapVM/DevTools/internal URL |
| `HasUserFrame()` | 判断是否含用户帧 |
| `HasDevtoolsEvalFrame()` | 识别 DevTools eval 噪声帧 |
| `IsRuntimeTaskActive()` | 判定是否处于目标任务期 |

### 噪声过滤（三级结构）

**第一级：调用方预检**（dispatch_bridge / skeleton_registry）

1. `g_suppress_hook_logging` 为 true 时静音（Inspector/序列化重入期间）
2. `g_hook_log_depth > 1` 时静音（嵌套 hook 调用）
3. `g_in_dispatch_cdp_emit` 为 true 时静音（CDP 消息发送期间）

**第二级：策略层判定**（`ShouldSuppressHookNoise`）

按顺序执行：
1. VmInstance 不可用 → 静音
2. Inspector paused → 静音
3. 非 `task + active` 阶段 → 静音
4. 栈命中 DevTools eval/internal URL → 静音

仅当以上都不命中时，事件源才继续走 Monitor 和 DevTools 输出。

**第三级：用户栈检查**

仅存在用户代码栈帧（`HasUserFrame`）时才允许发到 DevTools。

### 属性过滤（hook_filter.cc）

`ShouldEnterHookPipeline(cfg, event)` 按以下顺序检查：

| 层 | 类型 | 逻辑 |
|----|------|------|
| 对象级 | `blocked_objects` | `window.X` 精确/前缀匹配 |
| 属性级 | `blocked_properties` | 属性名精确匹配 |
| 前缀级 | `blocked_prefixes` | 属性名前缀匹配 |

白名单优先门控（非空才生效），再走黑名单过滤。

### MonitorEngine（monitor.cc）

在 `ShouldEnterHookPipeline` 通过后二次判断：

- `HookRegistry` 为空 → **全覆盖模式**（所有通过黑名单的属性均记录）
- `HookRegistry` 非空 → **精确白名单模式**（只记录匹配规则的事件）

### 重入守卫

`thread_local bool g_in_native_wrapper_hook` + RAII `NativeWrapperHookGuard`：日志输出调用 `console.log` / Inspector 时，若内部触发同一 interceptor，快速路径直接透传，不再触发日志，防止递归日志风暴。

### Symbol 属性 Hook

`native_wrapper.cc` 中 `ResolveNameKey()` 统一归一化 `v8::Name` 为字符串键：
- well-known symbol：`@@toStringTag`、`@@toPrimitive`、`@@iterator`...
- 用户 symbol：`Symbol(desc)` / `Symbol()`

DevTools 下 symbol 访问输出采用与常规 native hook 一致的三段式格式。

## 3. Builtin Wrapper — C++ 函数替换包装

### 安装

将目标函数（如 `JSON.stringify`）从全局对象取下，用 `BuiltinWrapperCallback` 替换，原函数保存在回调数据中。

### 三级结构

```
BuiltinWrapperManager（VmInstance 拥有）
  └─ BuiltinWrapperContextRegistry（每个 Context 一个）
       └─ BuiltinWrapperCallbackData（每个 target 一个）
```

### 回调流程

1. 重入快速路径：`g_in_builtin_wrapper_callback = true` → 直接调用 original
2. `HookDepthGuard`：`g_hook_log_depth` 计数，深度 > 1 时不记录
3. 阶段过滤（`CheckPhase`）：读取 `__LEAP_HOOK_RUNTIME__.active/phase`
4. 调用栈采样 → 输出 call / return / throw 三阶段日志
5. 调用 original → 返回结果

### Phase 生命周期

`bundle` → `setup` → `task`（active=true）→ `idle`

只有 `task + active` 阶段会输出日志。未找到 `__LEAP_HOOK_RUNTIME__` 时 C++ 侧默认返回 `bootstrap`。

### 调用上限

`max_per_api`（-1 = 不限），超出后只打一行 `reached cap N`，之后静默。

## 4. 全局抑制标志

| 标志 | 声明 | 作用 |
|------|------|------|
| `g_suppress_hook_logging` | `vm_instance.h` | Inspector/builtin wrapper 重入时阻止 Hook 记录 |
| `g_hook_log_depth` | `vm_instance.h` | Builtin Wrapper 回调深度，>1 时不记录 |

均为 `thread_local`，多 Worker 线程各自独立。

## 5. 黑名单默认值

通过 `TaskProtocol::ConfigureHooks()` 在服务端配置：

```
对象级黑名单：console, Object, Function, Array, String, Number, Boolean,
  Symbol, BigInt, Math, Date, RegExp, Error, Map, WeakMap, Set, WeakSet,
  Promise, Proxy, Reflect, JSON, Intl, ArrayBuffer, DataView, 全部 TypedArray
属性级黑名单：constructor, prototype
前缀级黑名单：__
```

> `then` / `toString` / `valueOf` 已从黑名单移除——重入守卫从根本上阻断递归，这些属性可安全拦截。

## 6. 输出通道

### CLI

`LEAPVM_LOG_INFO("[hook][native] ...")`，格式化为 `Error: ...\n    at func (url:line:col)` 以支持 DevTools 行列定位。

### DevTools

通过 `console.log` 回调注入 Inspector → `Runtime.consoleAPICalled` CDP 消息（带 `stackTrace` 和 `RemoteObject` preview），通过 `LeapInspectorClient::SendToFrontend` 发送。
