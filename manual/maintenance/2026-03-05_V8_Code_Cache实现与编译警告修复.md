# 2026-03-05 V8 Code Cache 实现与编译警告修复

日期：2026-03-05
范围：`leap-vm`、`leap-env`、`tests`

## 1. 背景

- 目标一：实现 V8 Code Cache（沙箱优化方案 Phase 1），在主线程预编译环境 bundle 生成字节码缓存，worker 启动时消费缓存跳过编译，降低 worker 初始化耗时。
- 目标二：修复 skeleton_registry.cc 和 vm_instance.cc 中共 12 处 `warn_unused_result` 编译警告。

## 2. 代码修改

### 2.1 C++ 层：Code Cache 核心实现

#### `leap-vm/src/leapvm/vm_instance.h`

新增两个公开方法声明：

```cpp
bool CreateCodeCache(const std::string& source_utf8,
                     std::vector<uint8_t>& cache_out,
                     std::string* error_out = nullptr,
                     const std::string& resource_name = "");

bool RunScriptWithCache(const std::string& source_utf8,
                        const uint8_t* cache_data,
                        size_t cache_length,
                        std::string& result_out,
                        bool* cache_rejected_out = nullptr,
                        std::string* error_out = nullptr,
                        const std::string& resource_name = "");
```

#### `leap-vm/src/leapvm/vm_instance.cc`

在 `RunScript` 与 Timer Implementation 之间新增约 140 行实现：

- **`CreateCodeCache`**：向 VM 线程 Post 任务，使用 `v8::ScriptCompiler::CompileUnboundScript` + `v8::ScriptCompiler::CreateCodeCache` 生成缓存字节，拷贝至 `std::vector<uint8_t>`。
- **`RunScriptWithCache`**：向 VM 线程 Post 任务，将缓存数据复制到 `new uint8_t[]`（V8 `BufferOwned` 所有权模型），使用 `kConsumeCodeCache` 编译执行，检查 `rejected` 标志。包含 `pending_script_source_` 处理以兼容 NativeDefineEnvironmentSkeleton。

### 2.2 NAPI 层：Addon 桥接

#### `leap-vm/src/addon/vm_instance_wrapper.h`

新增方法声明：

```cpp
Napi::Value CreateCodeCache(const Napi::CallbackInfo& info);
Napi::Value RunScriptWithCache(const Napi::CallbackInfo& info);
```

#### `leap-vm/src/addon/vm_instance_wrapper.cc`

- 新增 `#include <cstring>`
- 在 `Init()` 注册 `"createCodeCache"` 和 `"runScriptWithCache"` 两个 InstanceMethod
- `CreateCodeCache`：参数 `(string[, string])` → 调用 `vm_->CreateCodeCache()` → 返回 `Napi::Buffer<uint8_t>::Copy()`
- `RunScriptWithCache`：参数 `(string, Buffer[, string])` → 调用 `vm_->RunScriptWithCache()` → 返回 `Napi::String`

#### `leap-vm/src/addon/main.cc`

- 新增 `#include <cstring>`
- 新增模块级函数 `CreateCodeCache` 和 `RunScriptWithCache`（使用 `GetOrCreateDefaultVm`）
- 在 `Init` 中注册 `exports.Set("createCodeCache", ...)` 和 `exports.Set("runScriptWithCache", ...)`

### 2.3 JS 层：Runner 与 ThreadPool 集成

#### `leap-env/runner.js`

- `runEnvironmentBundle(leapvm, envCode, bundleCodeCache)`：新增第三参数，若有缓存且 addon 支持 `runScriptWithCache`，优先走缓存路径。
- 新增 Buffer/Uint8Array 兼容处理：`Buffer.isBuffer(bundleCodeCache) ? bundleCodeCache : Buffer.from(bundleCodeCache)`（worker_threads 的 structured clone 会将 Buffer 转为 Uint8Array）。
- 新增 `generateBundleCodeCache(leapvm, bundleCode)` 函数并导出。

#### `leap-env/src/pool/thread-pool.js`

- 在 `start()` 方法中，bundle 预读之后、worker 启动之前，调用主线程 pinned addon 生成 code cache：

```javascript
if (this.workerInitOptions.bundleCode && !this.workerInitOptions.bundleCodeCache) {
  const cache = generateBundleCodeCache(this.pinnedLeapVmAddon, this.workerInitOptions.bundleCode);
  if (cache && cache.length > 0) {
    this.workerInitOptions = { ...this.workerInitOptions, bundleCodeCache: cache };
  }
}
```

- 缓存通过 `workerInitOptions` 随 worker 初始化消息传递给各 worker 线程。

### 2.4 编译警告修复

#### `leap-vm/src/leapvm/skeleton/skeleton_registry.cc`（11 处）

行号：463, 797, 1211, 1274, 1305, 1308, 1349, 1390, 1402, 1405, 2416

所有 `MaybeLocal::ToLocal()` 调用前添加 `(void)` 前缀。下游代码已通过 `.IsEmpty()` 检查，返回值可安全忽略。

#### `leap-vm/src/leapvm/vm_instance.cc`（1 处）

行号 5823：`(void)v8::Script::Compile(ctx, test_source).ToLocal(&test_script);`

修复后编译零警告。

## 3. 数据流

```
ThreadPool.start()
  |
  v
主线程 pinned addon: createCodeCache(bundleCode)
  |  -> CompileUnboundScript + CreateCodeCache -> bytes
  v
workerInitOptions.bundleCodeCache = cache (Buffer)
  |
  v  (postMessage / structured clone)
Worker 线程收到 workerInitOptions
  |  -> bundleCodeCache 可能为 Uint8Array，做 Buffer.from() 兼容
  v
runner.runEnvironmentBundle(leapvm, envCode, bundleCodeCache)
  |  -> runScriptWithCache(wrappedEnv, cacheBuffer, resourceName)
  |  -> V8 kConsumeCodeCache 跳过编译
  v
环境就绪，开始执行任务
```

## 4. 压测结果

工具：`tests/scripts/perf/bench-h5st-detailed.js`
脚本：h5st.js（486 KB）
任务数：320/case

### 4.1 关键对比（thread-p8-c32）

| 指标 | 无 Code Cache | 有 Code Cache | 变化 |
|------|-------------|-------------|------|
| Warmup | 166 ms | 134 ms | -19.3% |
| p50 延迟 | 98 ms | 96 ms | -2.0% |
| p99 延迟 | 133 ms | 133 ms | 0% |
| 吞吐 RPS | 77.27 | 78.74 | +1.9% |

### 4.2 高 worker 数场景（thread-p12/p16）

| 配置 | Warmup 变化 | p50 变化 | RPS 变化 |
|------|-----------|---------|---------|
| p12-c48 | -12% | -13% | +14% |
| p16-c64 | -11% | -10% | +12% |

### 4.3 结论

- Warmup（含 bundle 编译）稳定降低 11-19%，worker 数越多效果越明显。
- 稳态吞吐在低 worker 数时改善有限（~2%），在高 worker 数时提升显著（~14%）。
- Code Cache 对大脚本（486 KB）更有价值；小脚本编译成本本身不高，收益有限。

## 5. 使用说明

- 默认行为：ThreadPool 启动时自动生成并分发 code cache，无需额外配置。
- 禁用 code cache（调试/对比）：

```bash
export LEAPVM_DISABLE_MAIN_ADDON_PIN=1
```

- 若 addon 不支持 `createCodeCache`（旧版二进制），自动降级为无缓存路径，无兼容性风险。

## 6. 新增测试文件

- `tests/scripts/integration/bench-code-cache.js`：Code Cache A/B 对比基准测试，通过 `LEAPVM_DISABLE_MAIN_ADDON_PIN` 环境变量切换有/无缓存模式，输出 startup、avg/task、throughput 对比表。
