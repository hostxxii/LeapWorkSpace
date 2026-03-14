# IPC 协议与通信模型

本文档描述 Node.js 侧 `StandaloneClient` 与 C++ 侧 `IpcServer` 之间的通信协议。

## 1. 角色

| 组件 | 位置 | 职责 |
|------|------|------|
| `StandaloneClient` | `leap-env/src/client/standalone-client.js` | TCP 客户端，发送请求、接收响应 |
| `IpcServer` | `leap-vm/src/service/ipc_server.cc` | TCP 服务端，接收请求、分发给 WorkerPool、返回结果 |

## 2. 帧格式：Length-Prefixed JSON (LPJ)

```
┌──────────────────┬──────────────────────────┐
│  4 bytes LE u32  │  UTF-8 JSON payload      │
│  payload length  │  (最大 10 MB)            │
└──────────────────┴──────────────────────────┘
```

- 长度字段为小端（Little-Endian）无符号 32 位整数
- payload 最大 10 MB
- 一个 TCP 连接可承载多个并发请求（通过 `id` 字段匹配）

## 3. 请求类型

### run_signature

执行一次签名任务。

```json
{
  "type": "run_signature",
  "id": "req-1",
  "payload": {
    "resourceName": "preloaded-target.js",
    "beforeRunScript": "",
    "fingerprintSnapshot": { ... },
    "storageSnapshot": { ... },
    "documentSnapshot": { ... },
    "storagePolicy": { ... }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `resourceName` | string | 源映射标签（调试用） |
| `beforeRunScript` | string | 目标前注入脚本（调试用，非标准） |
| `fingerprintSnapshot` | object | navigator/screen 等指纹快照 |
| `storageSnapshot` | object | localStorage/sessionStorage 初始数据 |
| `documentSnapshot` | object | cookie/referrer 等文档快照 |
| `storagePolicy` | object | storage 合并策略（`replace` / `merge`） |

未携带的字段由服务端预加载默认值填充。

### get_stats

查询 WorkerPool 统计。

```json
{ "type": "get_stats", "id": "req-2" }
```

### shutdown

请求优雅停机。

```json
{ "type": "shutdown", "id": "req-3" }
```

### recycle_all

触发所有 Worker 立即 recycle（内部调试用）。

```json
{ "type": "recycle_all", "id": "req-4" }
```

## 4. 响应格式

### 成功

```json
{
  "type": "result",
  "id": "req-1",
  "result": "h5st=...",
  "durationMs": 17.5,
  "workerId": "worker-3",
  "targetSource": "preloaded",
  "targetCacheHit": true
}
```

| 字段 | 说明 |
|------|------|
| `result` | 目标脚本的执行结果（签名值） |
| `durationMs` | 服务端执行耗时 |
| `workerId` | 处理该任务的 Worker 标识 |
| `targetSource` | 目标来源（`preloaded` / `none`） |
| `targetCacheHit` | 目标 code cache 是否命中 |

### 错误

```json
{
  "type": "error",
  "id": "req-1",
  "error": "Script execution failed: ReferenceError: ..."
}
```

## 5. StandaloneClient 实现细节

### 构造参数

```javascript
new StandaloneClient({
  host: '127.0.0.1',        // 仅 loopback
  port: 9800,
  connectTimeoutMs: 10000,
  requestTimeoutMs: 30000    // 0 = 无超时（调试用）
})
```

### 并发模型

- 内部维护 `Map<requestId, {resolve, reject, timer}>`
- 支持多个 in-flight 请求
- 每个请求独立超时（默认 30s）
- 响应通过 `id` 匹配 pending promise

### 帧重组

```javascript
_onData(chunk) {
  // 追加到 buffer
  while (buffer.length >= 4) {
    payloadLen = buffer.readUInt32LE(0);
    if (buffer.length < 4 + payloadLen) break; // 帧不完整
    json = buffer.slice(4, 4 + payloadLen).toString('utf8');
    // 解析 JSON → 分发到 pending[msg.id]
  }
}
```

### disconnect()

强制关闭 socket，reject 所有 pending 请求。

## 6. IpcServer 实现细节

### I/O 模型

- 非阻塞 socket（POSIX）
- `poll()` 多路复用（Linux）
- 客户端缓冲区自动压缩（阈值 64 KB）
- 畸形 payload → 优雅关闭连接

### 异步任务提交

1. 解析 `run_signature` 请求
2. 调用 `WorkerPool::SubmitTask(TaskRequest, callback)`
3. Worker 完成 → callback 推入 completion queue + 写 eventfd
4. 主循环 `Poll()` 周期排空 completion queue
5. 编码 LPJ 响应帧 + 写回 client fd

### shutdown 行为

收到 `shutdown` 请求后：
1. 发送确认响应
2. 设置停机标志
3. 主循环退出
4. `server.Stop()` 关闭所有连接
5. `pool.Stop()` 等待 Worker 线程结束

## 7. 超时与异常处理

| 场景 | 行为 |
|------|------|
| Client 连接超时 | `connectTimeoutMs`（默认 10s）后 reject |
| 请求超时 | `requestTimeoutMs`（默认 30s）后 reject |
| Server 启动超时 | `startupTimeoutMs`（默认 30s）后 ServerManager reject |
| 畸形帧 | 服务端关闭连接 |
| Worker 心跳超时 | 15s 强制 kill + 重启（由 WorkerPool 管理） |
