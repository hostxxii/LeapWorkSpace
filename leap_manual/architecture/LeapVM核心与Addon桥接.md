# LeapVM核心与Addon桥接

> 源文件：`leap-vm/src/leapvm/vm_instance.cc`，`leap-vm/src/leapvm/vm_instance.h`，`leap-vm/src/leapvm/v8_platform.cc`，`leap-vm/src/leapvm/v8_platform.h`，`leap-vm/src/addon/main.cc`，`leap-vm/src/addon/vm_instance_wrapper.cc`，`leap-vm/src/addon/vm_instance_wrapper.h`
> 更新：2026-02-28

---

## 功能概述

LeapVM 以 Node.js NAPI Addon（`leapvm.node`）的形式加载，内部静态链接独立的 V8（`v8_monolith.lib`）。JS 侧通过 NAPI 接口创建和控制 `VmInstance`，每个实例持有独立的 V8 Isolate 和 Context，与 Node.js 宿主的 V8 完全隔离。

| 组件 | 文件 | 职责 |
|------|------|------|
| `V8Platform` | `v8_platform.cc/h` | 进程级 V8 初始化，单例，只执行一次 |
| `VmInstance` | `vm_instance.cc/h` | 独立 Isolate/Context，JS 运行容器 |
| `VmInstanceWrapper` | `vm_instance_wrapper.cc/h` | NAPI ObjectWrap，暴露 `VmInstance` 给 JS |
| `main.cc` | addon 注册入口 | 初始化 Platform，导出 NAPI 接口 |

---

## 关键机制

### 1. 双 V8 共存（静态链接隔离）

```
Node.exe
  └─ Node.js 内置 V8（动态链接）     ← 宿主 JS 环境
  └─ leapvm.node（NAPI addon）
       └─ 静态链接 v8_monolith.lib  ← LeapVM 独立 V8
```

因为是静态链接，LeapVM 的 V8 全局状态存储在 `leapvm.node` 数据段，与 Node.js 完全隔离。

**ICU 隔离**：`v8_monolith.lib` 使用 `V8_ENABLE_I18N_SUPPORT=true` 编译，ICU 符号通过 `U_ICU_VERSION_SUFFIX(_leapvm)` rename，不与 Node.js 自带 ICU 冲突。`v8_platform.cc:29` 中 `v8::V8::InitializeICU()` 在 `#ifdef V8_ENABLE_I18N_SUPPORT` 保护下调用。

### 2. V8Platform 单例

```cpp
// v8_platform.cc:36
platform_ = v8::platform::NewDefaultPlatform(
    0,                                                   // 默认线程池大小
    v8::platform::IdleTaskSupport::kDisabled,
    v8::platform::InProcessStackDumping::kDisabled
);
```

- 使用 `NewDefaultPlatform(0)` 创建多线程平台（Inspector `evaluateOnCallFrame` 需要多线程）
- `~V8Platform()` **故意跳过** V8 全局销毁，避免静态析构顺序导致的 use-after-free（代码注释明确说明）

### 3. AddonData（单例辅助数据）

`main.cc` 中通过 `napi_set/get_instance_data` 挂载 `AddonData`：

```cpp
struct AddonData {
    std::unique_ptr<leapvm::VmInstance> default_vm;   // 平级 API 的懒创建单例
    std::atomic<uint64_t> inspector_target_seq{0};    // 单调递增的 target ID 计数器
};
```

- **平级 API**：`GetOrCreateDefaultVm()` 懒创建 `default_vm`；`shutdown()` 调用 `data->default_vm.reset()`
- **Inspector target ID**：`NextInspectorTargetId()` 生成 `leapvm-target-N`（N 单调递增），保证多次 `enableInspector()` 不冲突

### 4. VmInstance 构造序列

```
VmInstance()
  1. 创建独立 ArrayBuffer::Allocator
  2. Isolate::New()，allow_atomics_wait=true（Inspector 暂停需要）
     + isolate_->SetData(0, this)   ← static callback 反向取回 self
     + ApplyPendingHookConfig()     ← 应用构造前设置的 hook 配置
  3. 构建 global ObjectTemplate：
     - SetInternalFieldCount(1)     ← Window 品牌标记槽位
     - 预建 leapenv 命名空间（config/toolsFunc/impl/innerFunc/memory 子对象模板）
     - NamedPropertyHandler(nullptr, WindowNamedSetter, kNonMasking)  ← setter 监控
     - IndexedPropertyHandler(FramesIndexedGetter, kNonMasking)       ← window[n] 帧访问
     - global_template_.Reset()    ← 保存供子帧复用
  4. Context::New()
  5. 设置全局自引用别名（window/self/top/parent/frames/globalThis）
     via CreateDataProperty()，绕过拦截器直写
  6. 实例化 leapenv 对象 + memory.privateData = new WeakMap()
  7. 跳过旧 InstallWindow（注释掉，Window 原型链由 Skeleton 在 bundle 执行时建立）
  8. InstallConsole / InstallTimers / InstallNativeWrapper
  9. context_.Reset()
 10. StartVmThread()
```

### 5. VmInstance 析构序列（安全关闭）

```
~VmInstance()
  1. is_disposing_ = true          ← I-6 UAF 防护：StubCallback 检测后立即返回
  2. PostTask(inspector_->Shutdown) + wait promise（在 VM 线程关闭 Inspector）
     → inspector_client_.reset()
  3. StopVmThread()
  4. 清理 dom_wrapper_cache_（ClearWeak + Reset 防内存泄漏）
  5. PumpMessageLoop() × 2 + LowMemoryNotification()   ← 排空 V8 平台队列
  6. 清理所有子帧（dispatch_fn / registry / context）
     + global_template_.Reset()
  7. skeleton_registry_.reset()
  8. isolate_->Dispose() / isolate_ = nullptr
  9. allocator_.reset()
```

### 6. NAPI 暴露层（VmInstanceWrapper）

`VmInstanceWrapper` 继承 `Napi::ObjectWrap<VmInstanceWrapper>`，持有 `std::unique_ptr<VmInstance>`，生命周期由 JS GC 控制。

**class 模式实例方法（`vm_instance_wrapper.cc:77` DefineClass 注册）：**

| JS 方法 | C++ 方法 | 说明 |
|--------|---------|------|
| `runScript(code, [name])` | `RunScript` | 执行 JS 字符串 |
| `runLoop(maxMs)` | `RunLoop` | 驱动 timer 事件循环 |
| `shutdown()` | `Shutdown` | `vm_.reset()`（幂等，不调用 EnsureAlive） |
| `setMonitorEnabled(bool)` | `SetMonitorEnabled` | 开关 Hook 监控 |
| `setHookLogEnabled(bool)` | `SetHookLogEnabled` | 开关 Hook 日志 |
| `setPropertyBlacklist(objs, props, pfx)` | `SetPropertyBlacklist` | 设置黑名单（覆盖） |
| `setPropertyWhitelist(objs, props, pfx)` | `SetPropertyWhitelist` | 设置白名单（覆盖） |
| `enableInspector(opts)` | `EnableInspector` | 启动 Inspector |
| `waitForInspectorConnection()` | `WaitForInspectorConnection` | 阻塞等待调试器 |
| `installBuiltinWrappers(cfg)` | `InstallBuiltinWrappers` | 安装 C++ Builtin Wrapper |

**构造时 Inspector**：`new VmInstance({ port, targetId, waitForInspectorConnection })`——仅当 `has_port_override=true` 时才调用 `InitInspector()`。类模式默认 target_id 为 `leapvm-target-1`；平级模式使用单调递增计数器。

**EnsureAlive**：除 `Shutdown` 外，所有方法调用前均检查 `vm_` 非空，否则抛 `"VmInstance has been shutdown"`。

### 7. Addon 导出（main.cc）

**导出清单（14项，`main.cc:492–506` 逐行核查）：**

```js
// 类模式（多实例）
"VmInstance"

// 平级函数（单例 default_vm）
"runScript"  "runLoop"  "enableHighResTimer"  "disableHighResTimer"
"shutdown"  "setMonitorEnabled"  "setHookLogEnabled"  "installBuiltinWrappers"
"setPropertyBlacklist"  "setPropertyWhitelist"
"runScriptWithInspectorBrk"  "enableInspector"  "waitForInspectorConnection"
```

---

## 主要流程

### JS 调用链（以 `runScript` 为例）

```
JS: require('leapvm.node').runScript(code)
  → main.cc::RunScript()
      ├─ GetOrCreateDefaultVm()       [懒创建 AddonData.default_vm]
      └─ VmInstance::RunScript()
           ├─ pending_script_source_ = source
           ├─ v8::Script::Compile() + Run()
           └─ 返回 JSON.stringify 结果
```

### bundle 执行与 Skeleton 初始化

```
JS: $native.defineEnvironmentSkeleton(skeletonDef)
  → NativeDefineEnvironmentSkeleton()   [vm_instance.cc]
      ├─ bundle_source_ = pending_script_source_   ← 供子帧 replay
      └─ SkeletonParser::Parse() → SkeletonRegistry 建立
```

### 子帧创建流程

```
JS: __createChildFrame__(url, sameOrigin)
  → NativeCreateChildFrame()
      ├─ global_template_ 复用创建新 Context
      ├─ 设置子帧全局别名
      ├─ RunScriptInContextInternal(bundle_source_)   ← replay bundle
      └─ child_frames_[id] = ChildFrame{context, registry, dispatch_fn}
```

