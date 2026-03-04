# 2025-12-11_RunScript编译错误诊断与退出fatal规避摘要

日期：2025-12-11（历史修复；迁移摘要整理于 2026-02-23）  
来源拆分：根 `SOLUTION.md`（“修复 `RunScript` 偶发 Compile error 与退出 fatal”）

## 迁移校验状态（补录）

- 状态：已校验（历史修复摘要）
- 整理日期：2026-02-23
- 来源路径：根 `SOLUTION.md` 历史时间线条目（原文件已收口；快照见 `leap_manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`）
- 当前适用性：用于理解 `RunScript` 错误诊断与脚本侧优雅关闭习惯的历史来源；现行行为以源码为准
- 纠偏规则：若与历史条目表述冲突，以当前 `vm_instance.cc` / addon 导出 / 测试脚本实践为准

## 事实校验（补录）

- 核对依据：
  - `leap-vm/src/leapvm/vm_instance.cc`（`VmInstance::RunScript`）
  - `leap-vm/src/leapvm/vm_instance.h`
  - `leap-vm/src/addon/main.cc` / `leap-vm/src/addon/vm_instance_wrapper.cc`（`runScript` 导出）
  - `leap-vm/scripts/test_globalthis.js`
  - `leap_manual/maintenance/2025-12-02_LeapVM_定时器与Hook监控基础能力落地.md`
- 核对结论：
  - `VmInstance::RunScript` 当前包含完整 `TryCatch`、编译失败诊断输出、`error_out` 填充与失败返回路径
  - `RunScript` 当前通过投递到 VM 线程执行（`PostTask + promise/future`）维持同步语义
  - 现有脚本（如 `test_globalthis.js`）仍在 `finally` 中显式调用 `shutdown()`，用于降低退出阶段 V8 fatal 风险
- 纠偏说明：
  - 历史条目中的“偶发 Compile error / 退出 fatal 修复”不应解读为“当前永不再发生”；现行策略更准确的表述是：已有更强诊断信息与更稳定的关闭习惯/路径

## 背景

该条历史记录对应的是两个相关但不同的问题面：

1. `runScript` 失败时错误信息不足，导致定位“编译失败”原因困难
2. 脚本异常或提前退出后，若未正确关闭 VM，可能在进程退出阶段触发 V8 相关 fatal

这类问题会直接影响开发调试效率与测试脚本稳定性，因此在早期阶段具有较高工程价值。

## 实现摘要（当前可见形态）

### 1. `VmInstance::RunScript` 的编译失败诊断增强

当前 `RunScript` 在 `v8::Script::Compile(...)` 失败时会：

- 打印源码长度
- 对短源码打印完整内容，对长源码打印前后预览
- 通过 `TryCatch` + `Message` 提取异常、源码行、行号（可用时）
- 将可读错误信息写入 `error_out`

这使“Compile error”不再只是笼统失败，而是更接近可定位的问题描述。

### 2. `RunScript` 执行路径的稳定性防线（当前形态）

当前 `RunScript` 还包含：

- 在 VM 线程执行（避免跨线程直接操作 isolate）
- `ScriptOrigin` 设置（有助于堆栈与错误定位）
- 运行后 `PerformMicrotaskCheckpoint()`（Promise 微任务在返回前冲刷）

这些能力共同提高了脚本执行与诊断的一致性。

### 3. 脚本侧保留“显式 shutdown”习惯以规避退出阶段风险

以 `leap-vm/scripts/test_globalthis.js` 为例，当前仍采用：

- `try { runScript(...) } finally { leapvm.shutdown(); }`

说明“显式优雅关闭 VM”仍是推荐实践，而不是仅依赖进程退出时的隐式清理。

## 当前适用性

- 本记录可作为 `runScript` 调试体验与退出稳定性习惯的历史说明
- 适合用于解释为什么示例/测试脚本常见 `finally -> shutdown()`
- 不替代 `VmInstance::RunScript` 源码的逐行行为定义

## 影响文件（摘要）

- `leap-vm/src/leapvm/vm_instance.cc`
- `leap-vm/src/leapvm/vm_instance.h`
- `leap-vm/src/addon/main.cc`
- `leap-vm/src/addon/vm_instance_wrapper.cc`
- `leap-vm/scripts/test_globalthis.js`

## 验证

本次迁移整理采用源码与脚本事实核对（无运行时代码改动）：

- 核对 `RunScript` 的编译失败诊断与 `error_out` 填充逻辑存在
- 核对 `test_globalthis.js` 使用 `finally -> shutdown()` 模式
- 交叉参考 `2025-12-02` 维护记录中的 V8 退出阶段风险背景说明

## 相关入口

- `leap_manual/maintenance/INDEX.md`
- `leap_manual/maintenance/2025-12-02_LeapVM_定时器与Hook监控基础能力落地.md`
- `leap_manual/reference/LEAPVM_API.md`

