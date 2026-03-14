# 2025-12-04_LeapVM_Inspector_CorkBuffer线程修复

日期：2025-12-04（来源章节日期）  
整理日期：2026-02-22  
来源拆分：`leap-vm/SOLUTION.md`（Chapter 9: Inspector Cork Buffer 问题修复）

## 迁移校验状态（补录）

- 状态：已校验（历史迁移摘要）
- 整理日期：2026-02-23
- 来源路径：见本文头部“来源拆分”（子模块 `SOLUTION.md` 已退场；现以 `manual/`（尤其 `maintenance/INDEX.md`）为准）
- 当前适用性：用于维护回溯与背景理解；涉及现行实现时需与当前源码、`manual/*`、`tests/*` 交叉核对
- 纠偏规则：若与来源文档历史表述冲突，以当前源码、脚本结果和手册 SSOT 文档为准

## 背景

在 Chrome DevTools Inspector 场景下，`leap-vm` 曾出现概率性连接异常，报错信息为：

- `Error: Cork buffer must not be acquired without checking canCork!`

来源记录最终确认该问题并非单纯的同步发送逻辑错误，而是跨线程调用 uWebSockets API 导致的线程模型冲突。

## 问题

来源记录总结的根因：

- Inspector 消息处理存在 VM 线程与 IO 线程分工
- `uWebSockets` 的 WebSocket API 需在事件循环线程（IO 线程）调用
- 历史实现中从 VM 线程直接触发 `ws->send()`（通过 `BroadcastToTarget` 路径）
- Cork buffer 为 per-loop 全局状态，跨线程访问会触发冲突与异常

## 修复

来源记录方案：

- 使用 `loop->defer()` 将发送操作投递到 IO 线程执行
- 在 defer 回调中统一持锁并遍历连接发送消息
- 删除/简化不必要的跨线程消息队列代码（来源记录给出“代码行数下降”对比）

关键改动思路（来源记录口径）：

- `BroadcastToTarget(...)` 不直接在 VM 线程发送
- 改为 post 到 `uWS` loop 的 defer 队列
- 由 IO 线程实际执行 `ws->send(...)`

## 验证（来源记录摘要）

来源记录给出的验证结论：

- Cork buffer 错误从“20-30% 概率复现”降低到“未复现”
- 快速连续发送消息、通知 + 响应组合路径均通过
- Inspector 功能恢复稳定

说明：

- 本文为历史修复摘要；具体测试脚本名称和内部实现细节以代码仓库当前状态为准

## 影响文件（来源记录主题映射）

- `leap-vm/src/leapvm/ws_inspector_server.h`
- `leap-vm/src/leapvm/ws_inspector_server.cc`
- `leap-vm/test_defer_fix.js`（来源记录中的测试脚本）

## 相关文档

- `manual/maintenance/2026-02-22_运行时缺陷修复.md`（Inspector 稳定性后续折中策略）
- `manual/reference/LEAPVM_API.md`
- 根 `SOLUTION.md`（里程碑时间线索引）




