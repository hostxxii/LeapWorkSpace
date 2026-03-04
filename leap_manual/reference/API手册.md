# API手册

> 更新：2026-03-01（M02 填充：Hook 接口细节修正、$native API 节）

---

## 第一部分：leapvm.node NAPI 接口（M01）

> 来源：`leap-vm/src/addon/main.cc`、`leap-vm/src/addon/vm_instance_wrapper.cc`（M01 逐行审查，2026-02-28）

### 1. 导出清单（14 项）

```js
Object.keys(require('./leap-vm'))
// [
//   "VmInstance",               // 类接口（显式多实例）
//   "runScript",
//   "runLoop",
//   "enableHighResTimer",       // 仅测试用，生产代码无调用
//   "disableHighResTimer",      // 仅测试用，生产代码无调用
//   "shutdown",
//   "setMonitorEnabled",
//   "setHookLogEnabled",
//   "installBuiltinWrappers",
//   "setPropertyBlacklist",
//   "setPropertyWhitelist",
//   "runScriptWithInspectorBrk",
//   "enableInspector",
//   "waitForInspectorConnection"
// ]
```

顶层函数操作 addon 内部懒创建的默认 `VmInstance`。`VmInstance` 类提供显式多实例入口。

### 2. 执行与生命周期

| 函数 | 签名 | 说明 |
|------|------|------|
| `runScript` | `(code: string, resourceName?: string): string` | 执行 JS，返回最后表达式结果的字符串化 |
| `runLoop` | `(maxMs: number): void` | 阻塞驱动 VM 事件循环（定时器/Inspector 需要） |
| `shutdown` | `(): void` | 销毁默认 VM；后续调用会懒创建新实例 |

### 3. 定时器精度（Windows 专用，测试接口）

| 函数 | 说明 |
|------|------|
| `enableHighResTimer()` | 启用 Windows 高精度定时器（`timeBeginPeriod(1)`） |
| `disableHighResTimer()` | 恢复默认定时器精度 |

> 仅 `tests/scripts/leapvm/test_highres.js` 使用，`leap-env/` 生产代码零调用。

### 4. Hook / 监控

| 函数 | 签名 | 说明 |
|------|------|------|
| `setMonitorEnabled` | `(enabled: boolean): void` | 开关 Hook 监控日志输出 |
| `setHookLogEnabled` | `(enabled: boolean): void` | 同样控制 MonitorEngine 启用状态，但通过 pending 机制写入（`hook_config_.pending_monitor_enabled`），适合在 VM 初始化前调用；运行时效果等同 `setMonitorEnabled` |
| `setPropertyBlacklist` | `(objects?, properties?, prefixes?): void` | 完全替换黑名单（覆盖语义） |
| `setPropertyWhitelist` | `(objects?, properties?, prefixes?): void` | 完全替换白名单（覆盖语义） |
| `installBuiltinWrappers` | `(config: BuiltinWrapperConfig): void` | 安装 C++ Builtin Wrapper 体系 |

**`BuiltinWrapperConfig` 结构（来源：`main.cc:280–353` 解析逻辑）：**

```ts
interface BuiltinWrapperConfig {
  enabled?: boolean;
  phase?: string;
  operations?: string[];
  whitelist?: { apiNames?: string[]; apiPrefixes?: string[] };
  blacklist?: { apiNames?: string[]; apiPrefixes?: string[] };
  maxPerApi?: number | null;   // null 或不传 = 不限制（内部转为 -1）
  targets?: Array<{ name: string; path: string }>;
}
```

> Hook 过滤顺序（以 `hook_filter.cc:ShouldEnterHookPipeline` 为准）：白名单 gate（非空才生效）→ 黑名单过滤 → 进入 pipeline。MonitorEngine 在 pipeline 内做二次判断（全覆盖模式 vs 精确规则模式）。详见 [Hook监控与拦截体系](../architecture/Hook监控与拦截体系.md)。

### 5. Inspector / DevTools

| 函数 | 签名 | 说明 |
|------|------|------|
| `enableInspector` | `(opts?): { port, targetId }` | 启动 Inspector，返回实际端口和 targetId |
| `waitForInspectorConnection` | `(): void` | 阻塞等待 DevTools 连接就绪 |
| `runScriptWithInspectorBrk` | `(code, opts?): boolean` | 一站式断点模式 |

**`enableInspector` 选项（来源：`main.cc::ParseInspectorOptions`）：**

```ts
interface InspectorOptions {
  port?: number;                      // 也接受 inspectorPort（别名）
  targetId?: string;                  // 也接受 inspectorTargetId（别名）
  waitForInspectorConnection?: boolean;
}
```

> 平级 API 每次 `enableInspector()` 自动生成单调递增 `leapvm-target-N` ID。类模式构造时仅当显式传 `port` 才启动 Inspector（`has_port_override=true`）。

**`runScriptWithInspectorBrk` 选项：**

```ts
interface RunScriptBrkOptions {
  port?: number;       // 默认 9229
  filename?: string;   // 注入为 //# sourceURL=<filename>
  targetId?: string;
}
```

**推荐调试用法：**

```js
// 低层组合
leapvm.enableInspector({ port: 9229 });
leapvm.waitForInspectorConnection();
leapvm.runScript(code);
leapvm.runLoop(5000);

// 一站式（推荐）
leapvm.runScriptWithInspectorBrk(code, { port: 9229, filename: 'debug.js' });
```

### 6. VmInstance 类接口

```js
const { VmInstance } = require('./leap-vm');
// 构造时仅当显式传 port 才启动 Inspector
const vm = new VmInstance({ port: 9229, targetId: 'my-target', waitForInspectorConnection: true });
vm.runScript(code, [resourceName]);
vm.runLoop(maxMs);
vm.shutdown();                         // 幂等，可多次调用
vm.setMonitorEnabled(bool);
vm.setHookLogEnabled(bool);
vm.setPropertyBlacklist(objs, props, prefixes);
vm.setPropertyWhitelist(objs, props, prefixes);
vm.enableInspector(opts);
vm.waitForInspectorConnection();
vm.installBuiltinWrappers(config);
```

---

## 第二部分：runner.js 主函数

> 来源：`leap-env/runner.js`（M04 全链路审查，2026-03-01）

### initializeEnvironment(options?)

初始化 LeapVM 环境，返回可复用的执行上下文。

```ts
interface RunOptions {
  bundlePath?: string;          // 默认 src/build/dist/leap.bundle.js
  bundleCode?: string;          // 预加载 bundle 字符串（跳过磁盘读取）
  domBackend?: 'dod' | 'js' | 'native';   // 默认 'dod'（也接受 'spec'，自动映射到 'dod'）
  signatureProfile?: 'fp-lean' | 'fp-occupy';  // 默认 'fp-lean'
  debug?: boolean;              // true = 开启 Hook 监控日志 + Inspector
  waitForInspector?: boolean;   // debug=true 时是否阻塞等待 DevTools 连接
  beforeRunScript?: string;     // bundle 执行后、任务执行前注入的脚本
  targetScript?: string;        // 默认演示脚本（打印 navigator.userAgent 等）
  debugCppWrapperRules?: Partial<BuiltinWrapperConfig>; // C++ builtin wrapper 配置
}

interface InitResult {
  leapvm: LeapVm;               // VmInstance 句柄
  resolved: RunOptions;         // 完整规范化后的选项
  inspectorInfo: { port: number; targetId: string } | null;
}

function initializeEnvironment(options?: RunOptions): InitResult
```

**副作用（按顺序）：**
1. `loadLeapVm()` — 加载 `leap-vm` addon
2. `configureHooks()` — 设置黑名单 + 可选监控/builtin wrappers
3. `loadBundle()` — 读取 bundle 文件（或 bundleCode）
4. `maybeEnableInspector()` — debug 模式下启动 Inspector
5. VM 内执行：prelude → dom-backend 注入 → signature-profile 注入 → beforeRunScript → bundle

### executeSignatureTask(leapvm, task?)

在已初始化的 VM 中执行一次签名任务，任务前后自动管理指纹注入和状态清理。

```ts
interface TaskOptions {
  taskId?: string;              // 默认 `task-${Date.now()}`
  beforeRunScript?: string;     // 在 targetScript 之前注入
  targetScript: string;         // 目标脚本内容
  resourceName?: string;        // ScriptOrigin 名称，使 Error.stack 显示真实文件名（A1）
  siteProfile?: SiteProfile;    // 站点配置（见 M10）
  fingerprintSnapshot?: object; // 覆盖 siteProfile.fingerprintSnapshot
  storageSnapshot?: object;     // 覆盖 siteProfile.storageSnapshot
  documentSnapshot?: object;    // 覆盖 siteProfile.documentSnapshot
  storagePolicy?: object;       // 覆盖 siteProfile.storagePolicy
}

function executeSignatureTask(leapvm: LeapVm, task?: TaskOptions): string
```

**合并脚本执行顺序（单次 runScript）：**

```
setup 阶段：beginTaskScope → applyFingerprintSnapshot → applyStorageSnapshot → applyDocumentSnapshot
task 阶段：[beforeScript] → [targetScript]
finally：resetSignatureTaskState → endTaskScope
```

**返回值：** `leapvm.runScript` 的返回值（最后表达式的字符串化结果）。

### shutdownEnvironment(leapvm)

释放所有 DOM scope 后调用 `leapvm.shutdown()`。

```ts
function shutdownEnvironment(leapvm: LeapVm): void
```

### runEnvironment(options?)

便捷函数，等同于 `initializeEnvironment` → `executeSignatureTask` → `shutdownEnvironment`。适合单次脚本执行场景。

```ts
function runEnvironment(options?: RunOptions): void
```

### 其他导出（辅助函数）

| 函数 | 说明 |
|------|------|
| `resolveRunOptions(options)` | 规范化 options，填充默认值 |
| `loadLeapVm()` | 按优先级加载 `leap-vm` 包 |
| `configureHooks(leapvm, options)` | 配置黑名单 + 监控 + builtin wrappers |
| `loadBundle(bundlePath, bundleCode?)` | 读取 bundle（磁盘或预加载） |
| `maybeEnableInspector(leapvm, options)` | debug 模式下启动 Inspector |
| `runDebugPrelude(leapvm, options)` | 注入全局基础变量 |
| `applyDomBackendSetting(leapvm, backend)` | 向 VM 注入 `__LEAP_DOM_BACKEND__` |
| `applySignatureProfileSetting(leapvm, profile)` | 向 VM 注入 `__LEAP_SIGNATURE_PROFILE__` |
| `runEnvironmentBundle(leapvm, envCode)` | 执行 bundle 代码 |
| `DEFAULT_TARGET_SCRIPT` | 默认演示目标脚本（打印 navigator 信息） |
| `DEFAULT_DEBUG_CPP_WRAPPER_RULES` | builtin wrapper 默认配置（enabled:false） |

---

## 第三部分：VM 内 $native API

> M02 审查（2026-03-01）：`native_wrapper.cc` 提供 ObjectTemplate 和内部字段设置，不直接注入全局函数。VM 内部通过 `NativeSetMonitorEnabled` 安装了一个可在 JS 上下文内调用的内部路径（`vm_instance.cc:3981`），挂载在 `__leapvm__` 命名空间下。

### __leapvm__ 内部注入（VM 上下文内可用）

| 函数 | 说明 |
|------|------|
| `__leapvm__.setMonitorEnabled(bool)` | VM 线程内部路径，等同于 NAPI 侧 `setMonitorEnabled`；由 `NativeSetMonitorEnabled` 回调实现（`vm_instance.cc:2066`） |

> 其余 `__leapvm__` 注入项（Skeleton/Dispatch 相关）待 M03 审查后补充。

---

## 第四部分：Skeleton 分发路径

> 来源：`leap-vm/src/leapvm/skeleton/dispatch_bridge.cc`、`skeleton_builder.cc`、`skeleton_registry.cc`（M03 全链路审查，2026-03-01）

### 1. $native.defineEnvironmentSkeleton(envDescriptor)

VM 上下文内可用（通过 `$native` 全局注入）。

```ts
interface EnvDescriptor {
  schemaVersion: number;    // 当前固定为 1
  envVersion: string;       // 如 "1.0.0"，从 LEAP_ENV_VERSION 或 leapenv.envVersion 读取
  objects: ObjectSkeleton[];
}

interface ObjectSkeleton {
  name: string;             // 内部名，".type" 或 ".instance" 结尾
  ctorName?: string;        // 暴露到全局的构造函数名（如 "Navigator"）
  instanceName?: string;    // 安装到全局的单例属性名（如 "navigator"）
  brand: string;            // 品牌标签（Illegal invocation 检查用）
  ctorIllegal?: boolean;    // true = new Xxx() 抛 TypeError
  exposeCtor?: boolean;     // 是否把 ctorName 暴露到全局（默认 true）
  super?: string | null;    // 父类 type skeleton 名，null = 无继承
  props: {
    [propName: string]: PropertyDescriptor;
  };
}

interface PropertyDescriptor {
  owner: "constructor" | "prototype" | "instance";
  kind: "data" | "method" | "accessor";
  brandCheck?: boolean;
  attributes?: { enumerable?: boolean; configurable?: boolean; writable?: boolean };
  // kind=data
  valueType?: "string" | "number" | "boolean" | "null" | "undefined";
  value?: any;
  // kind=method
  length?: number;          // Function.length 属性值
  dispatch?: { objName: string; propName: string };
  // kind=accessor
  dispatch?: {
    getter?: { objName: string; propName: string };
    setter?: { objName: string; propName: string };
  };
}
```

> 调用后立即执行三阶段构建（Phase1→2→3），完成后 window/document/Navigator 等全部就位。

### 2. Dispatch Bridge（内部）

VM stub 分发函数由 `leap-env/src/core/runtime.js` 注册到
`leapenv.__runtime.bridge.dispatch`，供 `DispatchBridge::StubCallback` 调用。

| 参数 | 类型 | 说明 |
|------|------|------|
| `typeName` | string | 对象类型名，如 `"Navigator"` |
| `propName` | string | 属性/方法名，如 `"userAgent"` |
| `actionType` | `"GET"` \| `"SET"` \| `"CALL"` | 操作类型 |
| `...args` | any[] | 原始调用参数（SET 时为新值，CALL 时为方法实参） |

调用时 `this` 绑定为触发 stub 的原始 receiver 对象。

> 该桥接函数属于内部运行时接口，不再通过 `window.__LEAP_DISPATCH__` 暴露。
> C++ 侧仍会在 VmInstance 中缓存函数句柄（按 context 维度缓存）。

### 3. leapenv.loadSkeleton()

JS 侧 skeleton 加载入口，在所有 `*.skeleton.js` 文件加载后调用。

```js
leapenv.loadSkeleton()  // → $native.defineEnvironmentSkeleton(envDescriptor)
```

流程：收集 `leapenv.skeletonObjects[]` → `filterSkeletonObjectsForProfile()` → 构建 `envDescriptor` → 调用 C++ API。

### 4. leapenv.filterSkeletonObjectsForProfile(objects)

按当前 `config.signatureProfile` 对 skeleton 列表执行对象级 + 属性级过滤，返回 `{ objects, stats }`。

| stats 字段 | 说明 |
|-----------|------|
| `hiddenObjects` | 被 objectPolicy.hide 移除的 skeleton 数量 |
| `hiddenWindowProps` | window.instance 中被 hide 移除的属性数量 |
| `placeholderWindowProps` | 标记为 placeholder 的属性数量 |
| `allowlistedWindowProps` | 被 allowlist 明确保留的属性数量 |

> 过滤结果记录到 `leapenv.lastSkeletonProfileStats`，可用于调试。

---

## 第五部分：M05 — Window JS impl 接口说明

> M05 审查（2026-03-01）：`WindowImpl` 是纯 JS class，通过 `leapenv.registerImpl('Window', WindowImpl)` 注册，无新增 NAPI 或 runner.js 接口。

Window impl 内部消费的已有接口：

| 来源 | 接口 | 用途 |
|------|------|------|
| `leapenv.signatureTaskState.windowMetrics` | `{ innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio }` | 窗口尺寸注入（M10 siteProfile 字段） |
| `leapenv.signatureTaskState.randomSeed` | any | crypto.getRandomValues 确定性种子 |
| `global.__LEAP_HOST_TIMERS__` | `{ setTimeout, setInterval, clearTimeout, clearInterval }` | 宿主定时器代理 |
| `leapenv.nativeInstances[key]` | `navigator / history / performance / screen / localStorage / sessionStorage / location` | BOM 单例懒加载入口 |
| `leapenv.placeholderPolicy` | `{ rejectNetwork, networkDisabledError, createTypeError, notImplementedError }` | 网络/类型错误工厂 |
| `leapenv.domShared` | `createEvent / ensureNodeState / getOrCreateTaskDocument / ...` | DOM 辅助方法 |

---

## 第六部分：M06 — DOM-BOM实现层接口

> M06 审查（2026-03-01）：所有 impl 文件通过 `leapenv.registerImpl` 注册，无新增 NAPI 或 runner.js 导出接口。

### leapenv.registerImpl(typeName, implClass)

> 定义于 `leap-env/src/core/runtime.js`

将 ImplClass 注册到 `leapenv.implRegistry[typeName]`，并预缓存整个原型链的 descriptor（O1 性能），供 dispatch bridge 调用时直接查找。

### leapenv.domShared（扩充接口）

`00-dom-shared.impl.js` 暴露到 `leapenv.domShared` 的关键函数（M06 审查确认）：

| 函数 | 说明 |
|------|------|
| `beginTaskScope(taskId)` | 开始任务作用域，后续创建的文档归属此 taskId |
| `endTaskScope(taskId)` | 结束作用域（逻辑结束，不立即释放） |
| `releaseTaskScope(taskId)` | 批量释放任务所有文档节点 |
| `getOrCreateTaskDocument()` | 获取或创建当前任务主文档 |
| `ensureDocumentDefaultTree(doc)` | 懒注入 html/head/body 默认树 |
| `createDocument(taskId?)` | 显式创建新文档，返回 docId |
| `releaseDocument(doc)` | 释放单个文档 |
| `snapshotNodeForTrace(node)` | 生成节点快照（用于 diff 对比） |
| `traceFirstDiff(node, snapshot)` | 对比当前 DOM 与快照，返回第一个差异路径 |
| `getDomBackend() / setDomBackend(val)` | 读写 DOM 后端（dod/js/native） |
| `getRuntimeStats() / drainReleaseStats()` | 获取/消费释放统计 |

### $native.dom（native 后端桥接）

仅在 `native` 后端或启用轻量镜像时可用，由 C++ `DomManager` 提供：

| 方法 | 说明 |
|------|------|
| `createDocument(taskId)` | 创建 C++ 侧文档，返回 nativeDocId |
| `createElement(nativeDocId, tagName)` | 创建 C++ 侧元素，返回 nativeHandle |
| `appendChild(nativeDocId, parentHandle, childHandle)` | C++ 侧树操作 |
| `removeChild(nativeDocId, parentHandle, childHandle)` | C++ 侧树操作 |
| `setStyle(nativeDocId, handle, name, value)` | C++ 侧样式设置 |
| `bindDocumentNativeDocId(doc, nativeDocId)` | 绑定 JS 文档对象与 C++ 文档 ID |

本模块无新增独立 NAPI 接口（DomManager 通过 `$native.dom` 桥接，属 VM 内部注入）。

---

## 第七部分：M07 — DoD布局引擎接口

> M07 审查（2026-03-01）：纯 JS 模块，无新增 NAPI 或 runner.js 接口。

本模块通过 `module.exports` 暴露，由 worker/thread-pool 侧 `require()` 消费，与 dispatch 系统无耦合。

| 导出 | 说明 |
|------|------|
| `DoDTree` | TypedArray 数据结构，存储节点树所有属性 |
| `DomToDoDConverter` | OOP DOM → DoDTree 转换器，`convert(domNode, expectedCount)` |
| `DoDLayoutEngine` | 静态引擎，`compute(tree, w, h)`、`computeNodeDirty(tree, nodeId)` |
| `ArrayBufferPool` | TypedArray 内存池，避免 GC 压力；`releaseTree(tree)` 一次性归还 |
| `DoDTreeCache` | LRU 缓存，`get(key)` / `set(key, tree)` / `invalidate(key)` |
| `DoDLayoutEngineIncremental` | 增量引擎，`markDirty(id)` / `markAllDirty()` / `computeIfDirty(tree, w, h)` |
| `globalArrayBufferPool` | 全局共享 `ArrayBufferPool` 单例（可选使用） |
| `DoDLayoutBenchmark` | 基准工具（测试/分析用）：`createWidthTree()` / `createDeepTree()` / `runBenchmark()` |

---

## 第八部分：M08 — iframe多上下文（VM 内全局函数）

> M08 审查（2026-03-01）：无新增 NAPI 接口或 runner.js 导出。子帧能力通过 5 个全局函数注入 VM 上下文，由 `HTMLIFrameElement.impl.js` 和 `WindowImpl` 内部消费。

### VM 上下文内可用的子帧全局函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `__createChildFrame__(url, sameOrigin)` | `(string, bool): number` | 创建子帧，返回 frame index（≥0），失败返回 -1 |
| `__destroyChildFrame__(frameId)` | `(number): bool` | 销毁子帧，返回是否成功；**当前无 JS impl 调用方** |
| `__navigateChildFrame__(index, url)` | `(number, string): bool` | 更新已有子帧的 location.href（不重建 Context） |
| `__getChildFrameCount__()` | `(): number` | 返回当前活跃子帧数量（供 `window.length` 使用） |
| `__getChildFrameProxy__(index)` | `(number): object \| null` | 返回子帧 Global 对象（同源）或 null（跨域） |

> 以上函数由 `vm_instance.cc:RegisterGlobalFunctions` 注册，仅在 VM 内 JS 上下文可用，不经过 NAPI 边界。

---

## 第九部分：M09 — 并发池公共接口

> M09 审查（2026-03-01）：ThreadPool / ProcessPool 不通过 runner.js 导出，无新增 NAPI 接口；调用方直接 `require` 对应池文件自行实例化。

### ThreadPool（`leap-env/src/pool/thread-pool.js`）

```ts
interface PoolOptions {
  size?: number;                    // worker 数量，默认 CPU 核数 × workerMultiplier
  workerMultiplier?: number;        // 默认 1
  workerScriptPath?: string;        // 默认 ./thread-worker.js
  taskTimeoutMs?: number;           // 默认 5000ms
  workerInitTimeoutMs?: number;     // 默认 15000ms
  maxTasksPerWorker?: number;       // 默认 200，达到后主动 recycle
  heartbeatIntervalMs?: number;     // 默认 5000ms
  heartbeatTimeoutMs?: number;      // 默认 heartbeatIntervalMs × 3
  shutdownGraceMs?: number;         // 默认 2000ms
  debug?: boolean;
  waitForInspector?: boolean;
  beforeRunScript?: string;
  bundlePath?: string;
  bundleCode?: string;              // 预加载 bundle（跳过磁盘读取）
  domBackend?: string;
}

class ThreadPool {
  start(): Promise<void>
  runTask(payload, options?): Promise<TaskResult>       // alias of runSignature
  runSignature(payload, options?): Promise<TaskResult>
  close(options?: { timeoutMs?: number; forceTerminate?: boolean }): Promise<void>
  getStats(): PoolStats
}

interface TaskResult {
  taskId: string;
  workerId: string;
  result: string;                   // leapvm.runScript 的返回值
  durationMs: number;
  leakedDocsReleased: number;
  releasedDocs: number;
  releasedNodes: number;
  activeDocs: number;
  activeNodes: number;
  activeTasks: number;
  cleanupFailureCount: number;
  memoryUsage: MemorySnapshot | null;
}
```

### ProcessPool（`leap-env/src/pool/process-pool.js`）

与 ThreadPool 接口相同（`start` / `runSignature` / `close` / `getStats`），构造选项相同。差异：
- 不支持 DoD ArrayBuffer 零拷贝（IPC 序列化）
- 不支持 bundle 预读（每个子进程独立 fork，自行读取磁盘）
- 关闭时 worker 正常调用 `shutdownEnvironment()`（线程池跳过该步骤）
- `getStats().workersDetail` 无 `threadId` 字段（进程池无线程 ID 概念）

> **调用方说明：** 生产代码中无内置池选择逻辑，调用方根据需求直接实例化 `ThreadPool`（主线）或 `ProcessPool`（回退）。

---

## 第十部分：M10 — 签名容器与配置注入接口

> M10 审查（2026-03-01）：无新增 NAPI 接口或 runner.js 主函数；接口均通过 leapenv 全局对象暴露，在 bundle 内执行阶段注册。

### leapenv 任务态注入 API

由 `leap-env/src/instance/signature-task.instance.js` 注册到 `leapenv`：

| 函数 | 签名 | 说明 |
|------|------|------|
| `leapenv.applyFingerprintSnapshot(snapshot)` | `(object): true` | 写入 navigator/screen/windowMetrics/performanceSeed/featureFlags/canvasProfile/randomSeed 到任务态，同时更新 location/history/document 状态 |
| `leapenv.applyStorageSnapshot(snapshot, policy?)` | `(object, object?): true` | 写入 localStorage / sessionStorage；policy 控制 `replace`（先清空）或 `merge` 模式 |
| `leapenv.applyDocumentSnapshot(snapshot)` | `(object): true` | 写入 document cookie / referrer / lastModified |
| `leapenv.resetSignatureTaskState()` | `(): true` | 清空全部任务态（navigator/screen/... + storage + location/history + performance + document），任务结束后调用 |

### 新增 leapenv API（推荐方式）

新增对外 API 时，统一使用：

```js
leapenv.definePublicApi('myApiName', function myApiName(arg) {
  // ...
});
```

行为说明：

| 接口 | 作用 |
|------|------|
| `leapenv.definePublicApi(name, fn)` | 注册 API，并自动加入 facade 白名单；若 facade 已 finalize，会立刻变为可枚举公开 API |
| `leapenv.registerFacadePublicKey(name)` | 仅登记白名单键，不设置函数体 |
| `leapenv.registerFacadePublicKeys(names)` | 批量登记白名单键 |
| `leapenv.getFacadePublicKeys()` | 读取当前公开键集合（默认键 + 动态注册键） |

不建议再直接依赖 `leapenv.xxx = fn` + 手工改白名单，这样容易漏改并造成暴露面不一致。

**任务态对象（`leapenv.signatureTaskState`）关键字段：**

```ts
interface SignatureTaskState {
  navigator: Partial<NavigatorSnapshot>;
  screen: Partial<ScreenSnapshot>;
  windowMetrics: Partial<WindowMetricsSnapshot>;
  performanceSeed: object;
  featureFlags: object;
  randomSeed?: any;
  canvasProfile?: CanvasProfileSnapshot;
}
```

### leapenv.placeholderPolicy（完整接口）

由 `leap-env/src/core/placeholder-policy.js` 注册，供 impl 在占位属性被调用时使用：

| 方法 | 说明 | 错误 code |
|------|------|----------|
| `networkDisabledError(apiName, detail?)` | 创建"网络 API 被禁用"TypeError | `LEAP_NETWORK_DISABLED` |
| `rejectNetwork(apiName, detail?)` | 同上，返回 `Promise.reject(err)` | `LEAP_NETWORK_DISABLED` |
| `notImplementedError(apiName, detail?)` | 创建"未实现"DOMException-like | `LEAP_NOT_SUPPORTED` |
| `invalidStateError(apiName, detail?)` | 创建"无效状态"DOMException-like | `LEAP_INVALID_STATE` |
| `createTypeError(message, code?)` | 创建通用 TypeError | `LEAP_PLACEHOLDER_TYPE_ERROR` |
| `emptyHeaders()` | 返回空字符串 `''`（网络头占位） | — |
| `emptyRecords()` | 返回空数组 `[]`（记录集占位） | — |

### leapenv.fingerprintProfile（完整接口）

由 `leap-env/src/core/fingerprint-profile.js` 注册：

| 属性/方法 | 说明 |
|----------|------|
| `fingerprintProfile.tiers` | `{ tierA, tierB, tierC }`：三个 Tier 对象名称清单（数组） |
| `fingerprintProfile.lookups` | `{ tierA, tierB, tierC }`：快速查找表（对象，key=名称） |
| `fingerprintProfile.profiles` | `{ 'fp-lean', 'fp-occupy' }`：预构建的 profile 规则对象 |
| `fingerprintProfile.normalizeProfileName(name)` | 规范化 profile 名称（任意输入 → `'fp-lean'` 或 `'fp-occupy'`） |
| `fingerprintProfile.resolveProfile(name)` | 返回完整 profile 规则（`{ name, rules: { objectPolicy, windowInstance } }`） |

---

## 第十一部分：M11 — Inspector调试服务

> M11 审查（2026-03-01）：Inspector NAPI 接口已在第一部分（M01）完整记录（`enableInspector` / `waitForInspectorConnection` / `runScriptWithInspectorBrk`）。本模块无新增接口。

本模块无新增接口。详见第一部分 §5（Inspector / DevTools）。

---

## 第十二部分：M12 — 构建与打包系统

> M12 审查（2026-03-01）：构建系统为开发工具链，无 NAPI 接口或 runner.js 导出。

本模块无新增接口。

---

## 第十三部分：M13 — Intl/ICU方案

> M13 审查（2026-03-01）：Intl/ICU 通过 V8 内置支持提供，无 NAPI 接口或 runner.js 导出。

本模块无新增接口。Intl API（`Intl.NumberFormat`、`Intl.DateTimeFormat` 等）直接由 V8 Intl 层提供，目标脚本可直接使用。
