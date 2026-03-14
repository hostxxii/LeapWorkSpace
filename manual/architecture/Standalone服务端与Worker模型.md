# Standalone 服务端与 Worker 模型

本文档描述 `leapvm_server` C++ 服务端的启动流程、Worker 线程池管理和 code cache 策略。

## 1. 入口（main.cc）

### 启动序列

1. 初始化日志（`LEAPVM_LOG_*` 宏）
2. 解析 CLI 参数
3. 安装信号处理器（SIGINT / SIGTERM）
4. 初始化 V8 Platform（进程级单例）
5. 加载文件：bundle JS、siteProfile JSON（提取 snapshot 字段）、预加载目标脚本
6. 启动 WorkerPool（配置 + 预加载数据）
7. 启动 IpcServer（监听端口 + eventfd）
8. 输出 `[INFO] leapvm-server ready`（ServerManager 据此判定启动成功）
9. 主循环：`server.Poll(100ms)` 直到收到 shutdown 信号
10. 优雅停机：`server.Stop()` → `pool.Stop()`

### CLI 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--workers N` | 4 | Worker 线程数 |
| `--port PORT` | 9800 | TCP 监听端口 |
| `--bundle PATH` | — | bundle JS 文件路径 |
| `--site-profile PATH` | — | siteProfile JSON 路径（可选） |
| `--target-script PATH` | — | 预加载目标脚本路径（可选） |
| `--target-version VER` | — | 目标版本号，用于 cache 失效判定 |
| `--max-tasks-per-worker N` | 200 | 单 Worker 任务阈值，达到后 recycle |
| `--inspector` | false | 启用 V8 DevTools |
| `--inspector-port PORT` | 9229 | Inspector 基础端口（实际为 base + worker_id） |

## 2. WorkerPool

### 配置结构

```cpp
struct WorkerPoolConfig {
  int num_workers;                          // 线程数
  int max_tasks_per_worker;                 // recycle 阈值
  std::string bundle_code;                  // leap.bundle.js 内容
  bool enable_inspector;
  int inspector_base_port;
  std::string preloaded_target_script;      // 预加载目标脚本
  std::string preloaded_fingerprint_json;   // 预加载指纹快照
  std::string preloaded_storage_json;       // 预加载 storage 快照
  std::string preloaded_document_json;      // 预加载 document 快照
  std::string preloaded_storage_policy_json;
  std::string target_version;               // cache 失效标识
};
```

### Worker 初始化（InitWorkerVm）

每个 Worker 线程上：

1. 创建 `VmInstance`（独立 V8 Isolate + Context）
2. 如果 inspector 启用：等待 DevTools 连接
3. 配置 Hook 黑名单（console、Object、Array 等内建对象）
4. 执行 bootstrap 脚本（注入 `__runtimeBootstrap`）
5. 执行 wrapped bundle（带 code cache，如果可用）

### 任务执行（ExecuteTask）

1. 解析缺省字段：任务未携带的 snapshot → 用预加载默认值填充
2. 选择执行路径：
   - **CombinedTask**（首选）：单脚本包含 setup + target + cleanup
   - **SplitCachedTask**：分步执行 setup → before → target(with cache) → cleanup
3. CombinedTask 失败时：执行 fallback cleanup 脚本

### Worker Recycle

当单个 Worker 执行任务数达到 `maxTasksPerWorker`（默认 200）：

1. 销毁旧 `VmInstance`
2. 在同一线程创建新 `VmInstance`
3. 重新执行 bootstrap + bundle（使用共享 code cache）
4. 累计统计数据保留（cache_hits、cache_misses 等）

Recycle 开销约 ~500ms（一次性），但能防止长期运行的内存膨胀。

### 任务分派

- **Lock-free round-robin**：原子计数器分配，最小化争用
- 每个 Worker 有独立的任务队列（mutex 保护）
- Worker 在自己的线程上创建和销毁 VmInstance，无跨线程析构问题

## 3. Code Cache 策略

### 生成阶段（WorkerPool::Start）

1. 创建临时 `VmInstance`
2. 编译 wrapped bundle → `CreateCodeCache()` → 生成 bundle code cache
3. 如果预加载目标脚本 ≥ 32KB → 编译目标 → 生成 target code cache
4. 销毁临时 VmInstance
5. code cache 以只读方式共享给所有 Worker

### 使用阶段

- **Bundle cache**：每个 Worker 初始化时使用 `RunScriptWithCache()`
- **Target cache**：每次 SplitCachedTask 执行时使用
- Cache 命中 → 约 50% 编译加速
- Cache 被 V8 拒绝（版本不匹配等） → fallback 到无 cache 执行，不重试

### cache 不可变原则

code cache 在 `Start()` 生成后只读，不会因 Worker recycle 或任务失败而重新生成。

## 4. 统计

```cpp
struct PoolStats {
  int total_workers;
  int idle_workers;
  int busy_workers;
  int recycling_workers;
  uint64_t total_tasks_completed;
  uint64_t total_tasks_failed;
  size_t pending_tasks;
  uint64_t target_cache_hits;
  uint64_t target_cache_misses;
  uint64_t target_cache_rejected;
  uint64_t target_from_preloaded;
  uint64_t target_from_none;
};
```

通过 `get_stats` IPC 请求可查询。

## 5. Node.js 侧进程管理

`ServerManager`（`leap-env/src/client/server-manager.js`）负责：

### start()

1. 解析服务端二进制路径：`options.serverBinPath` → `LEAPVM_SERVER_PATH` 环境变量 → 默认 `../../../leap-vm/build-server/leapvm_server`
2. spawn 子进程（stdio: `['ignore', 'pipe', 'pipe']`）
3. 强制设置 `LEAPVM_LOG_LEVEL=info`（确保 ready 信号可见）
4. 等待 stdout/stderr 出现 `leapvm-server ready`（30s 超时）
5. 超时或提前退出 → reject 并附带 stderr 尾部

### stop(gracePeriodMs=5000)

1. SIGTERM → 等待退出（5s）
2. 超时 → SIGKILL 强杀
3. 返回 `{ code, signal }`

## 6. V8 Isolate 隔离红线

- 每个 Worker 线程持有独立的 V8 Isolate，不可跨线程共享 V8 对象
- 禁止 `static v8::Eternal<v8::Private>` 跨 Isolate 共享 brand key
- 必须用 `v8::Private::ForApi()` 逐 Isolate 获取
- ICU 符号带 `_leapvm` 后缀与 Node.js 隔离

## 7. 内存特征

| 项目 | 估算 |
|------|------|
| 单 Worker | ~50-100 MB（V8 Isolate + bundle） |
| 共享 | code cache + bundle JS 文本 |
| 4 Workers | ~250-500 MB 常驻 |
