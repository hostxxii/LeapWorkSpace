# Inspector调试服务

> 源文件：`leap-vm/src/leapvm/leap_inspector_client.cc`，`leap-vm/src/leapvm/leap_inspector_client.h`，`leap-vm/src/leapvm/ws_inspector_server.cc`，`leap-vm/src/leapvm/ws_inspector_server.h`
> 更新：2026-03-05

## 功能概述

Inspector 调试服务使 Chrome DevTools（或任何 CDP 客户端）可连接到 LeapVM 内的 V8 Isolate，支持断点调试、单步执行、调用栈检查和变量查看。实现分两层：

- **`LeapInspectorClient`**：实现 `v8_inspector::V8InspectorClient` 接口，管理 V8 Inspector 实例和会话
- **`WsInspectorServer`**：基于 uWebSockets 的 WebSocket 服务器，提供 CDP 标准 HTTP 路由（`/json/*`）和 WS 端点

## 关键机制

### 1. 启动路径

```
JS: leapvm.enableInspector({ port, targetId })
  → NAPI: EnableInspector (main.cc:505)
    → vm->InitInspector(port, target_id)
      → inspector_client_->AttachToWebSocket(port, target_id)
        → WsInspectorServer::Create(port, target_id, on_message_cb)
          → WsInspectorServer::Start()  // 独立 IO 线程运行 uWS 事件循环
```

### 2. 上下文注册（Initialize）

`VmInstance` 构造时（或首次 `enableInspector` 时）调用 `LeapInspectorClient::Initialize(context)`：

1. `v8_inspector::V8Inspector::create(isolate_, this)` — 创建 V8 Inspector 实例
2. `inspector_->contextCreated(V8ContextInfo(context, 1, "leapvm-context"))` — 注册上下文（contextGroupId=1）
3. `inspector_->connectShared(1, channel, ...)` — 建立调试会话，`InspectorChannelImpl` 作为通道

### 3. 消息流

**DevTools → VM（入方向）：**
```
WS 消息到达 IO 线程
  → WsInspectorServer.on_message callback
    → inspector_client_->post_vm_task_([msg] { DispatchInspectorMessage(msg) })
      → VM 线程执行 DispatchInspectorMessage
        → session_->dispatchProtocolMessage(message_view)
```

**VM → DevTools（出方向）：**
```
V8 Inspector 响应
  → InspectorChannelImpl::sendResponse / sendNotification
    → LeapInspectorClient::ObserveProtocolNotification(msg)   // 拦截 scriptParsed 建索引
    → LeapInspectorClient::SendToFrontend(msg)
      → WsInspectorServer::BroadcastToTarget(msg)   // defer 到 IO 线程，向所有连接广播
```

### 4. 断点暂停循环

当 V8 命中断点时调用 `runMessageLoopOnPause(contextGroupId=1)`，进入嵌套消息循环：

```
while (paused_) {
    // 泵送 V8 平台任务队列（evaluateOnCallFrame 依赖此步）
    PumpMessageLoop(kDoNotWait)

    // 等待并处理一个 VM 任务（Inspector 消息由 post_vm_task 投递至此）
    owner_->WaitForAndProcessOneTask(100ms)

    isolate_->PerformMicrotaskCheckpoint()
}
```

退出条件：DevTools 发送 `Debugger.resume` → V8 调用 `quitMessageLoopOnPause()` → `paused_ = false`。

### 5. 重入保护

`dispatching_message_` 布尔标志防止 `DispatchInspectorMessage` 重入：
- 重入时将消息追加到 `pending_protocol_messages_` deque
- 外层循环 `while (!pending_protocol_messages_.empty())` 顺序处理完所有挂起消息后退出

### 6. Hook 日志抑制

DevTools 展开对象属性（`Runtime.getProperties`、`evaluateOnCallFrame`）会访问被监控路径。`DispatchInspectorMessage` 在调用 `dispatchProtocolMessage` 前设置：

```cpp
leapvm::g_suppress_hook_logging = true;  // RAII guard，出作用域自动恢复
```

避免 Inspector 展开操作产生大量无关 Hook 日志噪音。

### 7. Script URL 索引

`ObserveProtocolNotification` 监听 `Debugger.scriptParsed` 通知：
- 解析 `scriptId` + `url` 字段，写入 `script_id_by_url_` 哈希表
- 同时以文件名（basename）作为辅助键，兼容 stack trace 只有文件名的情况
- `ResolveScriptIdForUrl(url)` 提供精确匹配 → basename 匹配 → suffix 匹配三级查找

### 8. 等待 DevTools 连接（WaitForConnection）

`leapvm.waitForInspectorConnection()` 对应 `LeapInspectorClient::WaitForConnection()`：

1. `WsInspectorServer::WaitForConnection()` 阻塞直到至少一个 WS 连接建立
2. 随后等待 `debugger_enable_processed_` 标志置位（`Debugger.enable` 已在 VM 线程处理）
3. 超时由 `LEAPVM_INSPECTOR_READY_WAIT_MS` 控制（默认 200ms，上限 5000ms）

### 9. HTTP 路由（标准 CDP Discovery）

`WsInspectorServer` 在 IO 线程注册以下 HTTP 端点：

| 路径 | 说明 |
|------|------|
| `GET /json/list` | DevTools 发现目标列表（含 `webSocketDebuggerUrl`） |
| `GET /json` | 同 `/json/list` |
| `GET /json/version` | 返回 `{"Browser":"LeapVM/1.0","Protocol-Version":"1.3"}` |
| `WS /devtools/page/{target_id}` | CDP 双向通信端点 |

WS 配置：`idleTimeout=0`（关闭空闲超时，默认不断联），`maxPayloadLength=16MB`，不压缩，`sendPingsAutomatically=false`，`resetIdleTimeoutOnSend=true`。

### 10. Shutdown 序列

`LeapInspectorClient::Shutdown(context)` 在 VM 线程调用（Isolate 析构前）：

1. `shutting_down_ = true` — 拒绝后续消息投递
2. `WsInspectorServer::Stop()` — defer `app->close()`，等待 IO 线程退出，join 线程
3. `session_->stop()` + `releaseObjectGroup` + `session_.reset()`
4. `inspector_->resetContextGroup(1)` + `contextDestroyed(context)` + `inspector_.reset()`
5. 三轮 `PumpMessageLoop` + `PerformMicrotaskCheckpoint` 排空平台队列和微任务
6. `isolate_->LowMemoryNotification()` 触发 GC

## 主要流程

```
启用 Inspector：
  enableInspector({port:9229}) → InitInspector → AttachToWebSocket → WS 服务器就绪

连接等待（--inspect-brk 模式）：
  waitForInspectorConnection() → 阻塞直到 DevTools 连接 + Debugger.enable 处理完成

脚本执行（带断点）：
  runScript(code) → 命中断点 → runMessageLoopOnPause → 嵌套循环 → DevTools 交互 → resume → 继续执行

关闭：
  leapvm.shutdown() → VmInstance::Destroy → inspector_client_->Shutdown(context)
```
