# Code Cache 预编译缓存

## 功能概述

leapvm_server 在启动阶段（`WorkerPool::Start()`）对 Bundle 和 Target 脚本各执行一次 V8 预编译，生成 code cache（序列化字节码），存储在 WorkerPool 级别。所有 Worker 线程以只读方式共享这两份 cache，跳过重复的解析和编译步骤。

两份 cache 策略完全对齐：编译一次，全局共享，Worker recycle 后无需重新生成。

## 两份 Code Cache

### 1. Bundle Code Cache（`code_cache_`）

| 属性 | 值 |
|------|-----|
| 源码 | `leap.bundle.js`（经 `WrapBundleScript()` 包装） |
| 生成时机 | `WorkerPool::Start()` |
| 存储 | `WorkerPool::code_cache_`（`std::vector<uint8_t>`） |
| 消费点 | `InitWorkerVm()` → `RunScriptWithCache()` |
| 消费时机 | Worker 启动 / recycle 重建 VM |

Bundle 包含整个 Skeleton 加载器、Impl 注册、运行时初始化逻辑。体积较大（通常 200-400KB 源码），编译耗时相对显著，code cache 的收益最明显。

### 2. Target Code Cache（`target_code_cache_`）

| 属性 | 值 |
|------|-----|
| 源码 | 预加载的目标脚本（如 `h5st.js`），经 `BuildCachedTaskTargetSource()` 包装为 `{ \n <脚本> \n }` |
| 生成时机 | `WorkerPool::Start()` |
| 存储 | `WorkerPool::target_code_cache_`（`std::vector<uint8_t>`） |
| 消费点 | `ExecuteSplitCachedTask()` → `RunScriptWithCache()` |
| 消费时机 | 每次签名任务的 target 执行阶段 |

Target 脚本是签名计算的核心逻辑，每次任务都会执行。code cache 省掉了每次执行前的编译，直接从序列化字节码恢复。

## 生成流程

```
WorkerPool::Start(config)
│
│  // 1. 准备 target 预构建产物
│  preloaded_target_cached_source_ = "{ \n" + h5st原始脚本 + "\n}"
│  preloaded_target_resource_name_ = "preloaded-target" 或 "preloaded-target@版本"
│  preloaded_target_hash_ = FNV-1a(原始脚本)
│
│  // 2. 创建临时 VM，生成两份 code cache
│  {
│      temp_vm = new VmInstance()
│
│      // Bundle code cache
│      wrapped_bundle_ = WrapBundleScript(bundle_code)
│      temp_vm->CreateCodeCache(wrapped_bundle_) → code_cache_
│
│      // Target code cache
│      temp_vm->CreateCodeCache(preloaded_target_cached_source_) → target_code_cache_
│
│      delete temp_vm    // 同线程创建销毁，无跨线程析构问题
│  }
│
│  // 3. 启动 Worker 线程（共享 cache 已就绪）
│  for i in 0..num_workers:
│      WorkerThread(slot[i]) → InitWorkerVm() → 消费 code_cache_
│
```

## 消费流程

### Worker 初始化（消费 Bundle Cache）

```
InitWorkerVm(slot)
│
│  slot->vm = new VmInstance()
│  RunScript(bootstrap_script)                           // 注入 console / leapenv
│
│  if code_cache_valid_:
│      RunScriptWithCache(wrapped_bundle_, code_cache_)  // ← 消费共享 Bundle Cache
│  else:
│      RunScript(wrapped_bundle_)                        // 回退：无 cache，全量编译
│
```

### 任务执行（消费 Target Cache）

每次签名任务拆分为三段执行，只有 target 段走 cache：

```
ExecuteSplitCachedTask(slot, request)
│
│  ① RunScript(setup_script)          // 注入指纹/cookie/storage（每次不同，不缓存）
│
│  ② if target_code_cache_valid_:
│      RunScriptWithCache(             // ← 消费共享 Target Cache
│          cached_source,              //    源码不变 → cache 命中
│          target_code_cache_)
│    else:
│      RunScript(cached_source)        //    回退：无 cache，全量编译
│
│  ③ RunScript(cleanup_script)         // 重置任务状态（每次不同，不缓存）
│
```

**为什么拆三段？** 如果把 setup + target + cleanup 拼成一个大脚本（Combined 路径），每次任务的指纹数据不同导致整个源码变化，V8 code cache 永远无法命中。拆开后，变化的 setup/cleanup 很小（几十行，编译 < 0.1ms），不变的 target 走 cache 零编译。

## Worker Recycle 行为

Worker 执行 `maxTasksPerWorker`（默认 200）次后自动 recycle：

```
RecycleWorker(slot)
│  slot->vm.reset()        // 销毁旧 VM
│  InitWorkerVm(slot)      // 重建 VM，消费共享 code_cache_
│                          // target_code_cache_ 也保持可用
│
│  // 两份共享 cache 均不受 recycle 影响
```

## Cache Rejected 处理

V8 code cache 在源码不匹配或 V8 版本不兼容时会被 reject。两份 cache 的处理策略：

| Cache | Rejected 处理 |
|-------|--------------|
| **Bundle** | 日志警告，回退到无 cache 编译（`RunScript`）。不影响后续 Worker。 |
| **Target** | 日志警告，当次任务回退到无 cache 编译。共享 cache 是只读的，不清除。 |

共享 cache 被设计为只读（`Start()` 之后不再修改），即使某个 Worker reject 了 cache，也不影响其他 Worker 继续使用。在同一进程内，所有 Worker 使用相同版本的 V8，reject 理论上不会发生。

## V8 Code Cache 原理

`VmInstance::CreateCodeCache()` 的内部流程：

```
CreateCodeCache(source, out_cache)
│  ScriptCompiler::CompileUnboundScript(source)   // 解析 + 编译为字节码
│  ScriptCompiler::CreateCodeCache(unbound)        // 序列化字节码为二进制 blob
│  out_cache = blob                                // 拷贝到 std::vector<uint8_t>
```

`VmInstance::RunScriptWithCache()` 的内部流程：

```
RunScriptWithCache(source, cache_data, cache_size)
│  CachedData = new CachedData(cache_data, cache_size)
│  ScriptCompiler::Compile(source, CachedData,
│                          kConsumeCodeCache)       // 跳过解析+编译，直接反序列化
│  script->Run(context)                             // 执行
│  if CachedData->rejected:
│      return cache_rejected = true                 // 调用方决定回退策略
```

关键约束：**生成 cache 时的源码必须与消费时完全一致**（逐字节匹配），否则 V8 reject。这就是为什么 bundle 要用 `WrapBundleScript()` 包装后的源码生成 cache，target 要用 `BuildCachedTaskTargetSource()` 包装后的源码。

## 每次任务的实际编译开销

| 阶段 | 是否编译 | 耗时 |
|------|---------|------|
| setup_script（注入指纹等） | 是（每次源码不同） | < 0.1ms |
| target_script（h5st.js） | 否（消费 code cache） | ~0ms（反序列化） |
| cleanup_script（状态重置） | 是（每次 task_id 不同） | < 0.1ms |
| **合计** | | **< 0.2ms** |

对比无 cache 时 target 全量编译约 2-5ms，code cache 将每次任务的编译开销从 ~3ms 降到 ~0.2ms。

## 可观测性

### 统计字段（通过 `get_stats` IPC 命令获取）

| 字段 | 含义 |
|------|------|
| `targetCacheHits` | 所有 Worker 累计的 target cache 命中次数 |
| `targetCacheMisses` | 所有 Worker 累计的 target cache 未命中次数（无 cache 可用） |
| `targetCacheRejected` | 所有 Worker 累计的 target cache 被 V8 reject 次数 |

### 启动日志

```
Generating bundle code cache from wrapped bundle (234567 bytes)...
Bundle code cache generated: 345678 bytes
Generating target code cache from preloaded target (486300 bytes)...
Target code cache generated: 567890 bytes
```

### Recycle 日志

```
Worker 3: recycling after 200 tasks (cache: 200 hits, 0 misses, 0 rejected; ...)
Worker 3: recycled (shared target cache preserved).
```
