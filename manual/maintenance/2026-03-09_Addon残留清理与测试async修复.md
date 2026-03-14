# 2026-03-09 Addon 残留清理与测试 async 修复

> 承接 `2026-03-09_Addon退场_Standalone全面迁移.md` 的存留事项 5.1–5.4。

## 1. 概述

本次完成 addon 退场后的残留代码彻底清理，以及发现并修复了集成测试中普遍存在的 **async/await 缺失** bug。

主要工作：
1. 删除 addon C++ 源文件、CMake 条件块、npm 依赖
2. 精简 `runner.js`（1541 → ~370 行）
3. 重写/修复 9 个集成测试
4. 新建 `standalone-benchmark.js` 替换旧 benchmark
5. 修复测试中系统性的 async/await 缺失问题

## 2. Addon 源文件删除（Phase 1）

已删除：
- `leap-vm/src/addon/main.cc`（797 行）
- `leap-vm/src/addon/vm_instance_wrapper.cc`（~900 行）
- `leap-vm/src/addon/vm_instance_wrapper.h`
- `leap-vm/index.js`（addon 加载器）
- `leap-vm/src/addon/` 整个目录

## 3. CMakeLists.txt 清理（Phase 2）

文件：`leap-vm/CMakeLists.txt`

移除内容：
- `option(LEAPVM_BUILD_ADDON ...)` 开关
- Node.js 头文件探测块（`node_api.h` / `napi.h` 搜索）
- Node-API include 路径配置
- addon 目标定义（`leapvm` shared library + 链接）
- `add_definitions(-DNAPI_DISABLE_CPP_EXCEPTIONS)` — 仅 addon 需要
- addon uSockets 链接块

**关键修复**：Lexbor `FetchContent` 段原本嵌套在 `if(LEAPVM_BUILD_ADDON)` 条件块内，导致 server-only 构建时缺少 Lexbor。已将其移至无条件编译区域。

## 4. 依赖清理（Phase 3）

文件：`leap-vm/package.json`

移除：
- `dependencies.node-addon-api`
- `devDependencies.cmake-js`
- `"main": "index.js"`（index.js 已删除）

## 5. runner.js 精简（Phase 4）

文件：`leap-env/runner.js`（1541 → ~370 行）

### 删除的 addon-only 代码

常量：`DEFAULT_OBJECT_BLACKLIST`、`DEFAULT_PROPERTY_BLACKLIST`、`DEFAULT_PREFIX_BLACKLIST`、`DEFAULT_DEBUG_CPP_WRAPPER_RULES`、`TASK_EXECUTION_CACHE_PROPERTY`、`TASK_PHASE_DETAIL_TRACE_ENABLED` 等

函数（18+）：`loadLeapVm()`、`createLeapVmRuntime()`、`configureHooks()`、`getTaskExecutionCacheState()`、`shouldUseSplitCachedTaskExecution()`、`getOrCreateTargetScriptCacheEntry()`、`buildCachedTaskTargetSource()`、`runTargetScriptWithExecutionStrategy()`、`maybeEnableInspector()`、`runDebugPrelude()`、`applyDomBackendSetting()`、`applySignatureProfileSetting()`、`runEnvironmentBundle()`、`runBeforeScript()`、`runTargetScript()`、`generateBundleCodeCache()`、`attachTaskExecutionTrace()`、`defineHiddenHostValue()`

### 保留的代码

- `StandaloneClient` / `ServerManager` 导入
- `DEFAULT_TARGET_SCRIPT`
- `normalizeDomBackend()`、`normalizeSignatureProfile()`、`resolveRunOptions()`
- Deep merge 工具函数（`deepCloneJsonLike`、`deepMergeReplaceArrays`、`hasOwnPath`）
- `validateSiteProfile()`、`buildEffectiveTaskOverrides()`
- `initializeEnvironment()` — 仅 standalone 路径
- `executeSignatureTaskStandalone()` + 简化的 `executeSignatureTask()`
- `shutdownEnvironment()` — 仅 standalone 路径

### 关键行为变更

- `executeSignatureTask()` 在无 `_client` 时抛错（而非静默回退到 addon 路径）
- Exports 收缩为：`runEnvironment`、`DEFAULT_TARGET_SCRIPT`、`resolveRunOptions`、`initializeEnvironment`、`executeSignatureTask`、`shutdownEnvironment`

### run-work-leapvm.js 联动更新

- 移除 `DEFAULT_DEBUG_CPP_WRAPPER_RULES` 导入
- 移除 `mergeBuiltinRules()`、`resolveBuiltinRules()` 函数
- 移除 `debugCppWrapperRules` 配置项

## 6. 测试修复（Phase 5）

### 6.1 系统性 async/await 缺失

**根因**：多个测试调用 async 函数（`runTaskJson()`、`runProbe()`、`runScriptJson()`）时缺少 `await`，导致变量接收的是 Promise 对象而非解析后的值。同时底部入口使用同步 `try { main() } catch` 无法捕获 async 错误。

**症状**：
- 断言对 Promise 对象（而非结果值）执行 → TypeError
- TypeError 触发 finally 块 → `shutdownEnvironment()` 在任务 Promise 仍 pending 时运行
- `disconnect()` 拒绝 pending 的任务 Promise → 无人 catch → `Error: Client disconnected` 未处理拒绝

**修复的文件（6 个）**：

| 文件 | 缺失 await 数量 | 入口修复 |
|------|:---:|---|
| `test-leapenv-branded-collections.js` | 1 | `try{main()}catch` → `main().catch()` |
| `test-leapenv-fingerprint-snapshot.js` | 3 | 同上 |
| `test-leapenv-crypto-minimal.js` | 6 | `runMode()` 改 async + async IIFE |
| `test-leapenv-canvas-minimal.js` | 3 | async IIFE |
| `test-leapenv-placeholder-policy.js` | 8 | `runMode()` 改 async + async IIFE |
| `test-leapenv-navigator-instance-skeleton.js` | 0（函数声明缺 async） | `runTest()` 改 async + `.catch()` |

### 6.2 test-leapenv-signature-core.js 重写

- `globalThis.__signatureCoreOut = JSON.stringify(out)` → `return JSON.stringify(out)`，直接从 `executeSignatureTask` 返回值获取结果
- Timer 部分：改为单个 `executeSignatureTask` 验证 timer API 表面（ID 类型、取消语义），不再跨任务检查异步回调
- `documentAll.apiPath` 断言改为条件式（`fp-occupy` 在 standalone 不可用）

### 6.3 test-leapenv-hardening-modes.js 修复

- `testDefaultMode()`、`testStrictMode()` 加 `async` + `await runProbe()`
- `runMode()` 加 `async`
- 底部改为 `(async () => { ... })().catch(...)`

### 6.4 test-leapenv-task-execution-cache.js 删除

依赖 `__leapTaskExecutionCache` addon 内部属性，standalone 下缓存由 C++ WorkerPool 内部管理，无法从客户端检查。

### 6.5 fp-occupy 兼容性处理

`task_protocol.cc:103` 将 `signatureProfile` 硬编码为 `"fp-lean"`，standalone server 不支持 `fp-occupy`。

受影响测试的处理方式：

| 文件 | 处理 |
|------|------|
| `test-leapenv-fingerprint-snapshot.js` | `permissionStatusFactory*` 断言改为条件式 |
| `test-leapenv-crypto-minimal.js` | profile 断言改为接受任意合法值 |
| `test-leapenv-placeholder-policy.js` | 移除 `placeholderPolicyExists` 断言（严格 facade 不暴露内部属性）；occupy 模式检测实际 profile，不匹配时 SKIP |
| `test-leapenv-canvas-minimal.js` | 无影响（canvas 功能不依赖 profile） |
| `test-leapenv-branded-collections.js` | 无影响（DOM 品牌标记不依赖 profile） |

## 7. Benchmark 更新（Phase 6）

- 删除 `benchmarks/addon-vs-standalone.js`
- 新建 `benchmarks/standalone-benchmark.js`
  - 保留 `benchStandaloneFull()`（full payload）和 `benchStandalonePreload()`（预加载模式）
  - 提取公共函数：`encodeLPJ()`、`startServer()`、`runBenchTasks()`
  - 简化对比表为 Full vs Pre-loaded 两列

## 8. 验证结果

```
=== branded-collections ===   PASS
=== fingerprint-snapshot ===  PASS
=== hardening-modes ===       PASS (default + strict)
=== signature-core ===        PASS
=== bom-ownership ===         PASS
=== new-features ===          PASS
=== canvas-minimal ===        PASS
=== crypto-minimal ===        PASS (exposure-lean + exposure-occupy + behavior + seed)
=== placeholder-policy ===    PASS (lean + occupy SKIP)
```

构建验证：
- `cmake --build leap-vm/build-server --target leapvm_server` — 编译通过
- `cd leap-env && npm run build` — bundle 构建通过

## 9. 仍存留的事项

### 9.1 ~~需完整重写的测试（使用已删除 addon API）~~ — 已完成（2026-03-10）

三个测试已重写为 standalone 模式（`initializeEnvironment` + `executeSignatureTask`）：

- `test-leapenv-global-surface.js` — 通过 task 内快照 globalThis 表面，验证内部 key 不泄漏、leapenv 公共 API 表面符合预期。不再有多阶段快照（standalone 无法在 bundle 前执行探针），改为单次 task 内完整快照。
- `test-leapenv-dom-handle-guard.js` — 通过公共 DOM API 验证：引用一致性（getElementById / childNodes / body 返回同一引用）、removeChild 后 parentNode 为 null、detached 节点仍可操作、replaceChild 正确性。不再依赖 `$native.dom` 内部 API。
- `test-leapenv-dom-native-ssot-consistency.js` — 通过公共 DOM API 验证布局一致性：offsetWidth/Height 计算正确（含 padding+border）、getBoundingClientRect 一致、removeChild 反映在结构、动态 style 修改触发布局更新、insertBefore 树结构正确。不再依赖 `$native.dom.snapshotDocument()` / `getLayoutRect()`。

### 9.2 ~~signatureProfile 不可配置~~ — 已解决（2026-03-10）

signatureProfile（fp-lean / fp-occupy）过滤系统已整体移除。理由：站点如果用到某 API 就在 impl 最小实现，没用到则 dispatch 返回 undefined，不需要中间层决定"藏起来还是摆空壳"。

具体改动见 `manual/maintenance/2026-03-10_signatureProfile过滤系统移除.md`。

删除的文件：
- `leap-env/src/core/fingerprint-profile.js`（Tier A/B/C 分层 + fp-lean/fp-occupy 规则）
- `leap-env/src/core/placeholder-policy.js`（占位错误工厂）
- `tests/scripts/integration/test-leapenv-placeholder-policy.js`

清理涉及：skeleton-loader.js、config.js、runtime.js、task_protocol.cc、runner.js、Window.impl.js（fetch/XHR 空壳删除）、Crypto.impl.js、HTMLCanvasElement.impl.js、6 个测试文件。

所有骨架属性现在直接传入 C++ defineEnvironmentSkeleton，不做任何过滤。
