# Intl_ICU与node_napi_only方案

> 源文件：`leap-vm/CMakeLists.txt`（ICU 配置段），`leap-vm/src/leapvm/v8_platform.cc`（InitOnce/InitializeICU），`leap-vm/third_party/node/node_napi_only.lib`，`leap-vm/third_party/node/node_napi_only.def`
> 更新：2026-03-01

## 功能概述

解决 leapvm 作为 Node.js addon 加载时的两个链接冲突问题，使 V8 内嵌 `Intl` API 可用：

1. **ICU 符号冲突**：leapvm 使用的 `v8_monolith.lib` 包含 ICU 符号（`u_*`），与 Node.js 进程内已加载的 ICU 符号同名，导致进程内重复符号冲突（原来通过 `/FORCE:MULTIPLE` 强制忽略）。
2. **node.lib 过重**：完整 `node.lib` 包含大量 V8 符号，与 `v8_monolith.lib` 中的 V8 符号产生重叠，`/FORCE:MULTIPLE` 会掩盖真正的重复符号 bug。

解决方案：**ICU 符号重命名隔离** + **最小化 `node_napi_only.lib`**，彻底消除 `/FORCE:MULTIPLE`，恢复链接阶段重复符号检测。

## 关键机制

### 1. ICU 符号重命名（U_ICU_VERSION_SUFFIX）

`v8_monolith.lib` 在编译时通过 `U_ICU_VERSION_SUFFIX(_leapvm)` 对所有 ICU 公开符号做后缀重命名：

```
标准 ICU 符号：u_init_75         → leapvm 内：u_init_75_leapvm
               ucnv_open_75      → 标准:ucnv_open_75   leapvm内:ucnv_open_75_leapvm
```

两套 ICU 符号在同一进程内**命名空间完全隔离**，不再产生冲突。`CMakeLists.txt` 注释确认这一策略：

```cmake
# v8_monolith.lib 使用 v8_enable_i18n_support=true 编译，ICU 符号已通过
# U_ICU_VERSION_SUFFIX(_leapvm) rename，不与 Node.js 自带 ICU 冲突
```

### 2. node_napi_only.lib（最小化 NAPI 链接库）

用 `leap-vm/third_party/node/node_napi_only.lib` 代替完整 `node.lib`：

- 只含 `napi_*` / `node_api_*` 符号（纯 NAPI 面），无 V8 符号
- 与 `v8_monolith.lib` **零重叠**，不需要 `/FORCE:MULTIPLE`
- 导出符号列表产物保存在 `leap-vm/third_party/node/node_napi_only.def`

CMakeLists.txt 链接顺序：`v8_monolith.lib` → `node_napi_only.lib`（顺序重要，V8 符号先解析）。

### 3. 显式 ICU 初始化（v8_platform.cc）

由于 leapvm 使用独立的 ICU 数据（重命名后的符号），需在 `V8Platform::InitOnce()` 中显式调用初始化（不能依赖 Node.js 已完成的 ICU 初始化）：

```cpp
// v8_platform.cc: InitOnce()
// ICU 符号已通过 U_ICU_VERSION_SUFFIX(_leapvm) rename，与 Node.js ICU 完全隔离
v8::V8::InitializeICU();
```

此调用是唯一的 ICU 初始化路径，保证 Intl API 在 leapvm 内的 V8 Isolate 中可用。

## 主要流程

```
构建阶段：
  编译 v8_monolith.lib（外部预编译）
    └── v8_enable_i18n_support=true + U_ICU_VERSION_SUFFIX(_leapvm)
          → 所有 ICU 符号带 _leapvm 后缀

  链接 leapvm.node：
    v8_monolith.lib（含重命名 ICU）
    + node_napi_only.lib（仅 napi_* 符号）
    → 无重叠，无需 /FORCE:MULTIPLE

运行阶段（addon 加载）：
  Node.js 进程已初始化自身 ICU（标准符号 u_init_75 等）
  ↓
  require('./leap-vm')  →  leapvm.node 加载
  ↓
  V8Platform::InitOnce(exec_path)
    → v8::V8::InitializeICU()   // 初始化 _leapvm 后缀的独立 ICU 数据
    → V8::InitializePlatform()
  ↓
  new VmInstance()  →  Isolate 内 Intl API 可用
```
