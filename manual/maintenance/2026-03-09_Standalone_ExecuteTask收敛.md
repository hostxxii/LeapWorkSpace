# 2026-03-09 Standalone ExecuteTask 收敛

日期：2026-03-09
范围：`leap-vm/src/service`、`leap-vm/CMakeLists.txt`

## 1. 背景

本轮目标不是继续堆 standalone 热路径优化，而是先把 `WorkerPool::ExecuteTask()` 从不断膨胀的热路径函数收敛成更可维护的结构。

同时补一个当前阶段的结论口径：

- `sync-stall` 的已命中样本目前仍只出现在 `ThreadPool / addon` 路径
- `SA Pre-loaded` 在本轮 benchmark 中没有观察到同类的秒级同步长尾模式
- `VmInstance` 的“off creator thread”析构告警当前证据仍只指向 `ThreadPool / addon` 路径

关于“Native CLI / 无 Node 客户端”的尝试，后续评估认为没有必要继续保留：

- standalone 运行时独立于 Node 的主目标已经由 `leapvm_server` 本身满足
- 额外维护一套 native 客户端与控制面文档，会扩大代码面和维护成本
- bundle / target / siteProfile 的生产链路仍然依赖现有工具链，单独做 native 控制面收益不足

因此该方向已清理，不再作为当前主线。

## 2. 代码修改

### 2.1 `ExecuteTask()` 收敛为两层结构

原问题：

- `ExecuteTask()` 同时承担 target 来源决策、snapshot 默认值回退、split/combined 执行分支、cache 命中处理、fallback cleanup
- 热路径优化加入后，函数继续膨胀，可读性和后续维护都变差

本轮将其拆成：

- `ResolveTaskExecution()`
- `ExecuteSplitCachedTask()`
- `ExecuteCombinedTask()`

对应新增结构体：

- `WorkerPool::ResolvedTaskExecution`

落点：

- `leap-vm/src/service/worker_pool.h`
- `leap-vm/src/service/worker_pool.cc`

当前主流程变为：

1. `ExecuteTask()` 只负责计时、调度 helper、写回 `TaskResult`
2. `ResolveTaskExecution()` 负责：
   - 选择 `per-task target` / `preloaded target` / `none`
   - 计算 target hash / size
   - 注入 preloaded snapshots 作为默认回退
3. `ExecuteSplitCachedTask()` 负责：
   - setup
   - 可选 `beforeRunScript`
   - target cache 查找 / 编译 / 执行
   - cleanup
4. `ExecuteCombinedTask()` 负责 combined 脚本路径和 fallback cleanup

这次拆分的目标是降低主函数复杂度，不是引入新的执行语义。

### 2.2 移除 Native CLI 尝试

已清理：

- standalone `ipc_client` 代码
- standalone CLI 构建目标
- 对应维护文档中的“无 Node 客户端”落地口径

保留的边界是：

- standalone server 仍通过现有 IPC 协议工作
- 客户端和压测链路继续使用现有 Node 侧入口

## 3. 验证记录

### 3.1 编译

通过：

```bash
cmake --build leap-vm/build-server --target leapvm_server -j4
```

说明：

- `leapvm_server` 可单独编译通过
- 本轮不再保留 standalone native client target

### 3.2 Standalone 回归

回归命令：

```bash
node benchmarks/addon-vs-standalone.js standalone-preload 12 2000
```

结果：

- `Throughput: 219.9 req/s`
- `p50: 51.2ms`
- `p95: 78.4ms`
- `p99: 99.8ms`
- `RSS: 1781.4 MB`

结论：

- `ExecuteTask()` 收敛后未引入明显回归
- standalone preloaded 仍保持在之前的稳定区间

### 3.3 存留析构问题口径

当前仍保留一个需要单独标记的生命周期问题：

- `VmInstance::~VmInstance()` 的 `destroy_tid != creator_tid`
- 会在日志中表现为 `same_as_creator=0`
- 对应代码位置：
  - `leap-vm/src/leapvm/vm_instance.cc`
  - `VmInstance destroyed off creator thread`

本轮结论口径：

- 该告警在 `ThreadPool / addon` 的重复启停与关闭路径里仍然能观察到
- 它与本轮 standalone server 的 `ExecuteTask()` 收敛不是同一个问题面
- standalone worker 当前按“创建线程内销毁 VM”的模型工作；本轮 standalone 的 `recycle + shutdown` 复现里未命中该告警，线程亲和日志为 `same_as_creator=1`
- 因此这条“off creator thread”析构告警，当前证据仍只指向 `ThreadPool / addon` 路径；但不能据此宣布生命周期问题已经彻底解决

这条风险的详细排故上下文，仍应回看：

- `manual/maintenance/2026-03-08_VmInstance停机协议与重复启停竞态继续排故记录.md`

## 4. 当前边界

### 4.1 关于 `sync-stall`

当前证据口径：

- 已命中的 `sync-stall` artifact 仍来自 `benchmarks/investigate-sync-stall.js --backend thread`
- 当前没有在 `SA Pre-loaded` benchmark 中观察到同类的秒级同步长尾

因此本阶段更准确的说法是：

- `sync-stall` 目前只在 `ThreadPool / addon` 路径上被明确复现过
- `SA Pre-loaded` 暂未观测到同类现象

### 4.2 关于“完全脱离 Node”

当前更合适的边界是：

- standalone server 运行时本身不依赖 Node 进程驻留
- 但客户端入口、压测链路、bundle / target / siteProfile 生产链路继续沿用现有工具链

也就是说：

- 不再追求额外维护一套 native CLI 或 native SDK
- 当前主线仍以 standalone server 本体和现有调用链的稳定性为先

## 5. 影响文件

- `leap-vm/src/service/worker_pool.h`
- `leap-vm/src/service/worker_pool.cc`
- `leap-vm/CMakeLists.txt`

## 6. 结论

本轮最重要的结果是：

- standalone 执行主路径的代码复杂度开始收敛
- `sync-stall` 当前仍应视为 `ThreadPool / addon` 路径问题，standalone 暂无同类命中证据
- `VmInstance` 的“off creator thread”析构问题仍是存留风险，应继续按生命周期问题跟踪，而不是当作 standalone 主线已解决
- “Native CLI / 无 Node 客户端”方向已清理，不再增加额外维护面

后续若继续推进，应优先围绕：

- standalone 主执行路径的可维护性
- 生命周期与停机协议问题
- 是否为 standalone 单独补一套 `sync-stall` 级别的探针

而不是先继续追加控制面分叉。

## 7. 交叉参考

- `manual/maintenance/2026-03-08_VmInstance停机协议与重复启停竞态继续排故记录.md`
  - 记录 `ThreadPool / addon` 路径下 `VmInstance` 停机协议、重复启停竞态与 `same_as_creator=0` 的详细排故过程
- `manual/maintenance/2026-03-08_ThreadPool同步停顿与重复启停SIGSEGV排故过程记录.md`
  - 记录 `sync-stall` 与重复启停 `SIGSEGV` 的定位、修复和验证背景
