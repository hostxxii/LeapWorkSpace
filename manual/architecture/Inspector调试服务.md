# Inspector 调试服务

## 功能概述

Inspector 调试服务使 Chrome DevTools（或任何 CDP 客户端）可连接到 LeapVM Worker 内的 V8 Isolate，支持断点调试、单步执行、调用栈检查和变量查看。

架构分三层：

| 层 | 组件 | 职责 |
|----|------|------|
| WS 传输层 | `WsInspectorServer` | 基于 uWebSockets 的 WebSocket 服务器 + CDP HTTP 发现路由 |
| Inspector 客户端层 | `LeapInspectorClient` | 实现 `v8_inspector::V8InspectorClient`，管理 V8 Inspector 实例、会话、暂停循环 |
| 宿主集成层 | `WorkerPool` / `VmInstance` | 控制 Inspector 生命周期，与 Worker 初始化流程整合 |

## 线程模型

每个 Worker 涉及三个线程：

```
┌─────────────────────────────────────────────────────┐
│  Worker Thread（WorkerPool 创建）                     │
│  - 调用 InitWorkerVm / ExecuteTask                   │
│  - RunScript 通过 PostTask+future 委派到 VM Thread    │
└──────────────────────┬──────────────────────────────┘
                       │ PostTask
┌──────────────────────▼──────────────────────────────┐
│  VM Thread（VmInstance 内部线程）                      │
│  - 持有 v8::Locker，独占 Isolate                      │
│  - 执行所有 V8 操作：脚本编译/运行、Inspector 消息分发  │
│  - ThreadMain 循环：等待任务 → 执行 → DrainPlatform   │
└──────────────────────┬──────────────────────────────┘
                       │ BroadcastToTarget (defer)
┌──────────────────────▼──────────────────────────────┐
│  WS IO Thread（uWebSockets 事件循环）                  │
│  - 处理 HTTP/WS 连接                                  │
│  - 收到 WS 消息 → post_vm_task_ 投递到 VM Thread      │
│  - 发送响应 → app->getLoop()->defer                   │
└─────────────────────────────────────────────────────┘
```

## 启动路径

### 命令行

```bash
leapvm_server --inspector --inspector-port 9229 --workers 1 --bundle <path>
```

Node 侧通过 `ServerManager` spawn 该进程：

```js
// run-work-leapvm.js
initializeEnvironment({
  debug: true,
  enableInspector: true,
  standalone: {
    workers: 1,
    inspectorPort: 9229,
    requestTimeoutMs: 0,       // debug 模式禁用请求超时
    startupTimeoutMs: 120000,  // 启动等待 2 分钟（含 DevTools 连接时间）
  },
});
```

### C++ 初始化时序

```
WorkerPool::Start(config)
  ├─ 生成 code cache（bundle + target，共享只读）
  ├─ 创建 N 个 WorkerThread
  │   └─ WorkerThread(slot)
  │       └─ InitWorkerVm(slot)
  │           ├─ new VmInstance()
  │           │   ├─ 创建 Isolate + Context
  │           │   └─ StartVmThread() → ThreadMain 循环就绪
  │           │
  │           ├─ [Inspector 初始化]
  │           │   ├─ VmInstance::InitInspector(port=9229+slot_id, target_id)
  │           │   │   ├─ new LeapInspectorClient(isolate, owner, post_vm_task)
  │           │   │   ├─ PostTask → VM 线程: Initialize(context)
  │           │   │   │   ├─ V8Inspector::create(isolate)
  │           │   │   │   ├─ inspector_->contextCreated(contextGroupId=1)
  │           │   │   │   └─ inspector_->connectShared(kNotWaitingForDebugger)
  │           │   │   └─ AttachToWebSocket(port, target_id)
  │           │   │       └─ WsInspectorServer::Start() → IO 线程启动
  │           │   │
  │           │   └─ VmInstance::WaitForInspectorConnection()  ← 阻塞 Worker Thread
  │           │       ├─ ws_server_->WaitForConnection()       ← condvar 等待 WS 连接
  │           │       └─ spin wait debugger_enable_processed_  ← 最多 200ms
  │           │
  │           ├─ [脚本加载（Inspector 就绪后）]
  │           │   ├─ ConfigureHooks
  │           │   ├─ RunScript(bootstrap)  → PostTask → VM 线程执行
  │           │   └─ RunScript(bundle)     → PostTask → VM 线程执行（带 code cache）
  │           │
  │           └─ slot->state = kIdle
  │
  └─ spin wait 所有 workers 达到 kIdle → pool.Start() 返回
      → main.cc 打印 "leapvm-server ready"
```

**关键约束**：Inspector 初始化必须在所有脚本执行之前完成。否则 V8 不会追踪 bootstrap/bundle 的编译事件，DevTools 的 Sources 面板将为空。

### 端口分配

每个 Worker 独占一个 Inspector 端口：

| Worker | Inspector 端口 |
|--------|---------------|
| Worker 0 | `inspector_base_port + 0` (9229) |
| Worker 1 | `inspector_base_port + 1` (9230) |
| Worker N | `inspector_base_port + N` |

调试模式建议 `workers: 1`，避免多端口混淆。

## 消息流

### DevTools → VM（入方向）

```
DevTools 发送 CDP 消息
  → WS IO Thread: on_message callback
    → 检测 Debugger.enable → debugger_enable_seen_ = true
    → post_vm_task_(lambda)
      → PostTask → VM Thread task_queue_
        → VM Thread: DispatchInspectorMessage(msg)
          → g_suppress_hook_logging = true (RAII guard)
          → session_->dispatchProtocolMessage(message_view)
          → if Debugger.enable: debugger_enable_processed_ = true
```

### VM → DevTools（出方向）

```
V8 Inspector 生成响应/通知
  → InspectorChannelImpl::sendResponse / sendNotification
    → ObserveProtocolNotification(msg)   // 拦截 scriptParsed 建索引
    → SendToFrontend(msg)
      → WsInspectorServer::BroadcastToTarget(msg)
        → app->getLoop()->defer → IO Thread 仅向当前活跃前端发送
```

## 前端会话模型

Inspector WS 层采用“单活跃前端”模型：

- 同一 target 同时只允许一个活跃 DevTools 前端
- 新前端接入时，旧前端连接会被主动关闭
- 只有活跃前端允许发送 CDP 消息；旧前端/竞态连接的消息会被直接丢弃
- 前端断开时会强制退出 pause loop，避免 VM 因断点停在无前端状态
- 第 2 次及之后的新前端接入，会在 VM 线程重建一份新的 `V8InspectorSession`

这样做的目的，是避免多次打开/关闭 DevTools 后，多条前端连接和同一份长期存活的 session 互相干扰，造成：

- Sources 面板偶发空白
- 自动重连后状态错乱
- 调试越连越慢、越不稳定
- 旧前端消息残留影响新前端

## 断点暂停循环

当 V8 命中断点时调用 `runMessageLoopOnPause(contextGroupId=1)`：

```cpp
while (paused_) {
    // 1. 泵送 V8 平台任务队列（evaluateOnCallFrame 依赖此步）
    DrainMessageLoop(isolate_, kDoNotWait);

    // 2. 等待并处理一个 VM 任务（100ms 超时）
    //    Inspector WS 消息通过 post_vm_task_ 投递到此队列
    owner_->WaitForAndProcessOneTask(100ms);

    // 3. 执行微任务检查点
    isolate_->PerformMicrotaskCheckpoint();
}
```

退出条件：DevTools 发送 `Debugger.resume` → V8 调用 `quitMessageLoopOnPause()` → `paused_ = false`。

**注意**：`WaitForAndProcessOneTask` 内部会再次获取 `v8::Locker`，V8 Locker 支持同线程嵌套，所以不会死锁。

## 等待 DevTools 连接（WaitForConnection）

`LeapInspectorClient::WaitForConnection()` 分两阶段：

**阶段 1：等待 WebSocket 连接**（`WsInspectorServer::WaitForConnection`）
- `ws_cv_.wait()` — condvar 无限等待，直到 `connections_` 非空或 `running_` 为 false
- 无内建超时。如果用户忘记连接 DevTools，Worker 线程将永远阻塞，`pool.Start()` 不会返回
- ServerManager 有启动超时兜底（debug 模式 120s）

**阶段 2：等待 Debugger.enable 处理完成**
- 轮询 `debugger_enable_processed_`，间隔 10ms，上限由 `LEAPVM_INSPECTOR_READY_WAIT_MS` 环境变量控制（默认 200ms，上限 5000ms）
- DevTools 连接后通常立即发送 `Debugger.enable`，IO 线程接收后 post 到 VM 线程处理
- 超时后继续执行（warning 日志），不阻塞 Worker 初始化

## 重入保护

`dispatching_message_` 布尔标志防止 `DispatchInspectorMessage` 重入：

- 首次进入设 `dispatching_message_ = true`，消息入 `pending_protocol_messages_` deque
- 若重入（Inspector 操作触发新 WS 消息到达），新消息追加到 deque 尾部
- 外层 `while (!pending_protocol_messages_.empty())` 顺序处理完所有挂起消息
- 退出时 `dispatching_message_ = false`

## Hook 日志抑制

DevTools 展开对象属性（`Runtime.getProperties`、`evaluateOnCallFrame`）会触发被监控路径的访问。为避免 Inspector 操作产生大量无关 Hook 日志，`DispatchInspectorMessage` 在调用 `dispatchProtocolMessage` 前通过 RAII guard 设置：

```cpp
leapvm::g_suppress_hook_logging = true;   // 进入时设置
// ... dispatchProtocolMessage ...
// guard 析构时自动恢复 previous 值
```

此标志为 `thread_local`，仅影响 VM 线程。

可通过 `LEAPVM_ALLOW_DEVTOOLS_EVAL_HOOK_LOGS=1` 环境变量放开 DevTools eval 触发的 hook 日志（`run-work-leapvm.js` 中 `allowDevtoolsEvalHookLogs` 配置项控制）。

## Script URL 索引

`ObserveProtocolNotification` 监听 `Debugger.scriptParsed` 通知：

- 解析 `scriptId` + `url` 字段，写入 `script_id_by_url_` 哈希表（`script_index_mutex_` 保护）
- 同时以 basename 作为辅助键，兼容 stack trace 只有文件名的情况
- `ResolveScriptIdForUrl(url)` 提供三级查找：精确匹配 → basename 匹配 → suffix 匹配

## HTTP 路由（CDP Discovery）

`WsInspectorServer` 注册以下 HTTP 端点供 `chrome://inspect` 发现：

| 路径 | 说明 |
|------|------|
| `GET /json/list` | 目标列表（含 `webSocketDebuggerUrl`、`devtoolsFrontendUrl`） |
| `GET /json` | 同 `/json/list` |
| `GET /json/version` | `{"Browser":"LeapVM/1.0","Protocol-Version":"1.3"}` |
| `WS /{target_id}` | CDP 双向通信（如 `/leapvm-worker-0`） |

WS 配置要点：
- `idleTimeout = 0` — 关闭空闲超时，长时间断点不会断连
- `sendPingsAutomatically = false` — 不自动发 ping（配合 `idleTimeout=0` 避免 uWS 内部下溢）
- `maxPayloadLength = 16MB`，不压缩，`closeOnBackpressureLimit = false`

## Shutdown 序列

`LeapInspectorClient::Shutdown(context)` 在 VmInstance 析构时、Isolate 销毁前调用：

1. `shutting_down_ = true` — 拒绝后续消息投递和处理
2. `paused_ = false` — 解除可能的暂停循环
3. `WsInspectorServer::Stop()` — defer `app->close()`，清空连接集合，join IO 线程
4. 清空 `pending_protocol_messages_`，重置 `debugger_enable_*` 标志
5. `session_->stop()` + `releaseObjectGroup("leapvm-hook-values")` + `session_.reset()`
6. `inspector_->resetContextGroup(1)` + `contextDestroyed(context)` + `inspector_.reset()`
7. 三轮 `DrainMessageLoop` + `PerformMicrotaskCheckpoint` + `LowMemoryNotification` 排空队列
8. 清空 `script_id_by_url_` 索引

## 请求超时与调试模式

`StandaloneClient` 的 `requestTimeoutMs` 控制单次请求超时。**debug 模式下必须禁用**（设为 0），否则用户在 DevTools 中断点暂停时间超过超时阈值后，Node 侧会 reject 请求，而 C++ 侧 Worker 仍在暂停状态——导致"断联"。

```js
// run-work-leapvm.js
standalone: {
  requestTimeoutMs: debug ? 0 : 30000,  // 0 = 禁用超时
  startupTimeoutMs: debug ? 120000 : 30000,
}
```

`StandaloneClient` 构造函数使用 `??`（而非 `||`）处理 `requestTimeoutMs`，确保 `0` 不会被回退为默认值：

```js
this._requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
```

## 调试入口

`run-work-leapvm.js` 配置项：

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `debug` | `true` | 启用 Inspector |
| `inspectorPort` | `9229` | Inspector 监听端口 |
| `breakBeforeTask` | `false` | 任务前自动插入 `debugger;` |
| `allowDevtoolsEvalHookLogs` | `true` | 允许 DevTools eval 产生 hook 日志 |
| `workers` | `1` | 调试建议 1 |

使用流程：

1. 运行 `node run-work-leapvm.js`
2. 服务器启动后等待 DevTools 连接（控制台提示）
3. 打开 `chrome://inspect`，找到 LeapVM 目标，点击 inspect
4. DevTools 连接后自动加载 bundle，Sources 面板显示所有脚本
5. 可设置断点后继续，或使用 `breakBeforeTask: true` 自动在任务前暂停
6. 进程退出时自动清理 `leapvm_server`（SIGINT/SIGTERM/exit 信号处理）

## 已知限制

- `WaitForConnection()` 无 Worker 级超时：如果用户不连接 DevTools，Worker 线程永远阻塞，仅靠 ServerManager 的 `startupTimeoutMs` 兜底
- Inspector 端口不支持动态分配（`port=0`），必须指定固定端口
- 单个 Inspector 端点支持多个 WS 连接（`BroadcastToTarget` 广播），但 V8 Inspector 会话是单例——多客户端连接行为未定义
- Worker recycle 时会重新调用 `InitWorkerVm`，如果 Inspector 启用则再次阻塞等待 DevTools 连接
