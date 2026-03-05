# 2025-12-04_LeapVM_Inspector集成与调试稳定性改造

日期：2025-12-04（来源文档最后更新时间；章节含 Chapter 7 与后续稳定性修复）  
整理日期：2026-02-22  
来源拆分：`leap-vm/SOLUTION.md`（第七章 Inspector 集成，结合 Cork 修复章节交叉引用）

## 迁移校验状态（补录）

- 状态：已校验（历史迁移摘要）
- 整理日期：2026-02-23
- 来源路径：见本文头部“来源拆分”（子模块 `SOLUTION.md` 已退场；现以 `leap_manual/`（尤其 `maintenance/INDEX.md`）为准）
- 当前适用性：用于维护回溯与背景理解；涉及现行实现时需与当前源码、`leap_manual/*`、`tests/*` 交叉核对
- 纠偏规则：若与来源文档历史表述冲突，以当前源码、脚本结果和手册 SSOT 文档为准

## 背景

来源记录系统性描述了 LeapVM 为 Chrome DevTools 调试能力落地 Inspector 时遇到的一系列问题与修复过程，目标包括：

- 断点调试（`debugger;`）
- Console 求值（`evaluateOnCallFrame` 等）
- `--inspect-brk` 风格等待连接后执行
- WebSocket 链路稳定性
- Console 日志同步到 DevTools

## 架构（来源记录摘要）

来源记录给出的核心组件划分：

- `LeapInspectorClient`（`v8_inspector::V8InspectorClient`）
- `InspectorChannelImpl`（`v8_inspector::V8Inspector::Channel`）
- `WsInspectorServer`（基于 uWebSockets 的 WebSocket 服务）
- VM Task Queue（在 IO 线程与 VM 线程之间转发任务）

该架构目标是保证：

- WebSocket 网络 IO 与 V8 API 调用分线程处理
- V8 API 调用仍在 Isolate 所属线程执行
- DevTools 协议消息可稳定进入 VM 调试循环

## 关键问题与修复（来源记录摘要）

### 1. `evaluateOnCallFrame` 崩溃 / Inspector 消息不被处理

来源记录给出的根因组合：

- 未在关键循环中 `PumpMessageLoop`，Inspector foreground tasks 无法被执行
- 单线程 Platform 不满足 Inspector 的异步任务处理需求
- 历史阶段某些 Inspector 路径与 ICU 初始化状态耦合（来源记录口径）

来源记录修复方向：

- 在 VM 任务循环前后主动 `v8::platform::PumpMessageLoop(...)`
- 在 Inspector 暂停循环（`runMessageLoopOnPause`）中持续 pump 消息
- 切换到支持 Inspector 异步任务的 Platform 实现（来源记录为多线程 Platform）

### 2. WebSocket 空闲自动断开

来源记录问题：

- DevTools 连接一段时间静止后自动断开

来源记录结论：

- uWebSockets 的 `idleTimeout` 存在上限（来源记录指出最大 960 秒）
- 需结合自动 ping 与发送时重置 idle timeout 使用

来源记录方案（历史摘要）：

- `idleTimeout = 960`
- `resetIdleTimeoutOnSend = true`
- `sendPingsAutomatically = true`

当前实现（2026-03-05）：

- `idleTimeout = 0`（默认不断联）
- `resetIdleTimeoutOnSend = true`
- `sendPingsAutomatically = false`（避免 `idleTimeout=0` 场景的 timeout 分量异常）

### 3. `debugger;` 语句不暂停（时序问题）

来源记录的关键洞察：

- 仅等待 WebSocket 建连还不够
- `debugger;` 只有在 DevTools 已发送并处理 `Debugger.enable` 后才会触发暂停

来源记录方案：

- 在 `WaitForConnection()` 返回后增加短暂等待（来源记录示例为 500ms）
- 等待 DevTools 初始化消息（如 `Runtime.enable`、`Debugger.enable`）被处理后再执行脚本

### 4. `--inspect-brk` 风格等待执行

来源记录实现要点：

- `WsInspectorServer::WaitForConnection()`：通过条件变量等待至少一个连接
- `LeapInspectorClient::WaitForConnection()`：在连接建立后继续等待调试器就绪
- Node-API 暴露 `waitForInspectorConnection()` 供 JS 侧调用

价值：

- 降低手工调试操作步骤
- 提升 `debugger;` 首次命中稳定性

### 5. Console 日志同步到 DevTools（后续增强）

来源记录还描述了 Console Bridge 增强：

- VM 内 `console.log/warn/error` 在写宿主 stdout 的同时
- 构造 `Runtime.consoleAPICalled` 事件并通过 Inspector 通道发送给前端
- 当 Inspector 未启用时，对运行时无额外影响（直接短路返回）

这使 DevTools Console 与宿主终端日志更一致。

### 6. Cork Buffer 跨线程发送问题（后续修复，已单独拆文档）

来源记录第七章末尾与 Chapter 9 都提到了 `uWebSockets` cork buffer 冲突问题。该问题已单独整理为维护记录：

- `leap_manual/maintenance/2025-12-04_LeapVM_Inspector_CorkBuffer线程修复.md`

该修复核心是使用 `loop->defer()` 将发送操作投递到 IO 线程，避免跨线程直接 `ws->send()`。

## 验证（来源记录摘要）

来源记录列出的主要验证结论（摘要）：

- `debugger;` 可稳定暂停
- DevTools Console 表达式求值恢复正常
- 变量查看、调用栈、步进调试可用
- `--inspect-brk` 类使用方式可用
- 历史阶段：连接稳定性在 `960s + 自动 ping` 策略下显著改善
- 当前阶段：默认策略已切换为“不断联”
- Inspector 消息链路在 Cork 修复后稳定性进一步提升

## 当前口径说明（2026-02-22）

来源记录中的部分实现细节（如超时策略默认值、等待时长、个别内部结构）可能在后续版本迭代中调整。当前使用与事实校验应优先参考：

- `leap_manual/reference/LEAPVM_API.md`
- `leap_manual/maintenance/2026-02-22_运行时缺陷修复.md`（Inspector 稳定性后续策略；2026-03-05 起默认不断联）
- `leap_manual/maintenance/2025-12-04_LeapVM_Inspector_CorkBuffer线程修复.md`

## 影响文件（来源记录主题映射）

- `leap-vm/src/leapvm/leap_inspector_client.h`
- `leap-vm/src/leapvm/leap_inspector_client.cc`
- `leap-vm/src/leapvm/ws_inspector_server.h`
- `leap-vm/src/leapvm/ws_inspector_server.cc`
- `leap-vm/src/leapvm/vm_instance.h`
- `leap-vm/src/leapvm/vm_instance.cc`
- `leap-vm/src/addon/main.cc`

## 相关文档

- `leap_manual/maintenance/2025-12-04_LeapVM_Inspector_CorkBuffer线程修复.md`
- `leap_manual/maintenance/2026-02-22_运行时缺陷修复.md`
- `leap_manual/reference/LEAPVM_API.md`
- 根 `SOLUTION.md`（里程碑时间线索引）




