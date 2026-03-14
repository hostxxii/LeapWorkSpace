# API 手册

本文档只记录当前 standalone 主线会直接使用的 API、CLI 和 IPC 结构。

## 1. `leap-env/runner.js`

### `initializeEnvironment(options?)`

```ts
async function initializeEnvironment(options?: {
  debug?: boolean;
  enableInspector?: boolean;
  waitForInspector?: boolean;
  beforeRunScript?: string;
  targetScript?: string;
  bundlePath?: string;
  standalone?: {
    serverBinPath?: string;
    workers?: number;
    port?: number;
    host?: string;
    connectTimeoutMs?: number;
    requestTimeoutMs?: number;
    startupTimeoutMs?: number;
    maxTasksPerWorker?: number;
    siteProfilePath?: string;
    targetScriptPath?: string;
    targetVersion?: string;
    inspectorPort?: number;
    env?: Record<string, string>;
  };
}): Promise<{
  leapvm: {
    _client: StandaloneClient;
    _serverManager: ServerManager;
  };
  resolved: object;
  inspectorInfo: null;
}>
```

作用：

- 规范化运行参数
- 准备预加载 target 脚本
- 启动 `leapvm_server`
- 建立 `StandaloneClient` 连接

说明：

- standalone 不再支持 addon 模式。
- `targetScript` 会被写入临时文件并在服务端启动时预加载。

### `executeSignatureTask(leapvm, task?)`

```ts
async function executeSignatureTask(
  leapvm: { _client: StandaloneClient },
  task?: {
    beforeRunScript?: string;
    resourceName?: string;
    siteProfile?: object;
    fingerprintSnapshot?: object;
    storageSnapshot?: object;
    documentSnapshot?: object;
    storagePolicy?: object;
    targetScript?: string;
  }
): Promise<string>
```

说明：

- 只允许执行“预加载 target script”。
- 若 `task.targetScript` 非空，会直接抛错。
- 调用前会执行 `validateSiteProfile()` 和 `buildEffectiveTaskOverrides()`。

### `shutdownEnvironment(leapvm)`

```ts
async function shutdownEnvironment(leapvm: {
  _client?: StandaloneClient;
  _serverManager?: ServerManager;
}): Promise<void>
```

顺序：

1. `client.shutdown()`
2. `client.disconnect()`
3. `serverManager.stop()`
4. 删除临时 target 文件

### 其他导出

| 标识 | 说明 |
|------|------|
| `runEnvironment(options)` | 初始化 → 执行一次任务 → 关闭环境 |
| `resolveRunOptions(options)` | 合并默认值并补 `bundlePath` |
| `DEFAULT_TARGET_SCRIPT` | 演示用默认 target 脚本 |

## 2. `ServerManager`

文件：`leap-env/src/client/server-manager.js`

### 构造参数

```ts
new ServerManager({
  serverBinPath?: string,
  workers?: number,
  port?: number,
  bundlePath?: string,
  siteProfilePath?: string,
  targetScriptPath?: string,
  targetVersion?: string,
  maxTasksPerWorker?: number,
  inspector?: boolean,
  inspectorPort?: number,
  startupTimeoutMs?: number,
  env?: Record<string, string>,
})
```

### 实例 API

| API | 说明 |
|-----|------|
| `start()` | spawn `leapvm_server`，等待 ready 日志 |
| `stop(gracePeriodMs?)` | 先 `SIGTERM`，超时后 `SIGKILL` |
| `pid` | 子进程 PID |
| `port` | 实际监听端口 |
| `running` | 是否已进入 ready 状态 |

## 3. `StandaloneClient`

文件：`leap-env/src/client/standalone-client.js`

### 构造参数

```ts
new StandaloneClient({
  host?: string,
  port?: number,
  connectTimeoutMs?: number,
  requestTimeoutMs?: number, // 0 或负值表示不设超时
})
```

### 实例 API

| API | 说明 |
|-----|------|
| `connect()` | 建立 TCP 连接 |
| `runSignature(payload, requestId?)` | 发送 `run_signature` 请求 |
| `getStats()` | 发送 `get_stats` 请求 |
| `shutdown()` | 发送 `shutdown` 请求 |
| `disconnect()` | 本地断开并 reject 所有 pending 请求 |
| `connected` | 当前连接状态 |
| `port` | 当前服务端端口 |

### `runSignature(payload)`

```ts
type RunSignaturePayload = {
  resourceName?: string;
  beforeRunScript?: string;
  fingerprintSnapshot?: object;
  storageSnapshot?: object;
  documentSnapshot?: object;
  storagePolicy?: object;
}
```

返回值：

```ts
{
  result: string;
  durationMs: number;
  workerId: string;
  targetSource: string;
  targetCacheHit: boolean;
}
```

## 4. IPC 请求与响应

协议：Length-Prefixed JSON。

### 请求

```json
{ "type": "run_signature", "id": "req-1", "payload": { ... } }
{ "type": "get_stats", "id": "req-2" }
{ "type": "shutdown", "id": "req-3" }
```

### `run_signature` 成功响应

```json
{
  "type": "result",
  "id": "req-1",
  "result": "...",
  "durationMs": 12,
  "workerId": "worker-1",
  "targetSource": "preloaded-target@v1",
  "targetCacheHit": true
}
```

### 错误响应

```json
{
  "type": "error",
  "id": "req-1",
  "error": "message",
  "durationMs": 12
}
```

### `get_stats` 响应字段

```ts
{
  total_workers: number;
  idle_workers: number;
  busy_workers: number;
  recycling_workers: number;
  total_tasks_completed: number;
  total_tasks_failed: number;
  pending_tasks: number;
  target_cache_hits: number;
  target_cache_misses: number;
  target_cache_rejected: number;
}
```

## 5. `leapvm_server` CLI

文件：`leap-vm/src/service/main.cc`

```bash
leapvm_server \
  --workers 4 \
  --port 9800 \
  --bundle leap-env/src/build/dist/leap.bundle.js \
  --site-profile site-profiles/jd.json \
  --target-script work/h5st.js \
  --target-version h5st@2026-03-11 \
  --max-tasks-per-worker 200 \
  --inspector \
  --inspector-port 9229
```

| 参数 | 说明 |
|------|------|
| `--workers` | Worker 数量 |
| `--port` | IPC 监听端口 |
| `--bundle` | bundle 文件路径 |
| `--site-profile` | 站点配置 JSON 路径 |
| `--target-script` | 启动时预加载的目标脚本 |
| `--target-version` | target 版本标识，用于 cache 语义区分 |
| `--max-tasks-per-worker` | recycle 阈值 |
| `--inspector` | 启用 Inspector |
| `--inspector-port` | Inspector 基础端口 |

## 6. VM 内公开任务 API

这些 API 不经过 Node.js 边界，但属于当前任务模型的一部分：

| API | 作用 |
|-----|------|
| `leapenv.applyFingerprintSnapshot(snapshot)` | 写入 navigator/screen/windowMetrics/randomSeed/canvasProfile 等任务态 |
| `leapenv.applyStorageSnapshot(snapshot, policy?)` | 写入 local/session storage |
| `leapenv.applyDocumentSnapshot(snapshot)` | 写入 cookie/referrer/lastModified |
| `leapenv.resetSignatureTaskState()` | 清空任务态，并触发额外 reset |
| `leapenv.definePublicApi(name, fn)` | 注册 facade 可见 API |

更细的字段说明见 [站点配置与任务态注入.md](/home/hostxxii/LeapWorkSpace/manual/architecture/站点配置与任务态注入.md)。
