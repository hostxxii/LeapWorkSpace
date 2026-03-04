# 2026-03-03 ThreadPool DoD 默认零拷贝与多 Isolate 崩溃修复

日期：2026-03-03  
范围：`leap-env`、`leap-vm`、`tests`

## 1. 背景

- 目标一：ThreadPool 的 DoD 传输策略改为“默认零拷贝（transfer）”。
- 目标二：确认此前 `threadpool-dod` 的原生崩溃问题已消除后，再更新维护记录。

## 2. 本次代码修改

### 2.1 DoD 传输模式默认值切换为 `transfer`

- 文件：`leap-env/src/pool/thread-pool.js`
- 变更：
  - 默认值从 `clone` 改为 `transfer`
  - 保留显式回退：
    - 构造参数：`dodTransferMode: 'clone'`
    - 环境变量：`LEAP_DOD_TRANSFER_MODE=clone`
  - 新增标准化字段：
    - `this.dodTransferMode`（`clone` 或 `transfer`）
    - `this.enableDodZeroCopy`（由 `dodTransferMode` 推导）

### 2.2 多 isolate 崩溃根因修复（已纳入当前稳定基线）

- 文件：`leap-vm/src/leapvm/skeleton/dispatch_bridge.cc`
- 根因：
  - 进程级 `static v8::Eternal<v8::Private>` 在 `worker_threads` 多 isolate 场景被跨 isolate 复用，触发 `0xC0000005`。
- 修复：
  - 去掉进程级 `Eternal` 缓存
  - 每次按当前 isolate 通过 `v8::Private::ForApi(...)` 获取 key

## 3. 验证结果

### 3.1 ThreadPool DoD 稳定性回归

命令：

```powershell
node tests/scripts/integration/test-leapenv-threadpool-dod.js
```

补充连续回归：

```powershell
for($i=1;$i -le 3;$i++){ node tests/scripts/integration/test-leapenv-threadpool-dod.js }
```

结果：3/3 通过，退出码均为 0。

### 3.2 全量回归（含 unstable threadpool-dod）

命令：

```powershell
$env:LEAP_ENABLE_UNSTABLE_THREADPOOL_DOD='1'
./tests/runners/run-full.ps1
```

结果：`fail=0`（样本目录：`tests/results/20260303_113254_full`）。

### 3.3 传输模式性能快照（同机同场景）

场景：`size=4`、`taskCount=100`、`nodeCount=200`

- `clone`：约 `1960.78 ops/sec`
- `transfer`：约 `2439.02 ops/sec`

结论：`transfer` 吞吐更高；`clone` 可作为兼容回退模式保留。

## 4. 使用口径（当前）

- 默认：零拷贝（`transfer`）
- 显式回退到拷贝模式：

```powershell
$env:LEAP_DOD_TRANSFER_MODE='clone'
```

或：

```js
new ThreadPool({ dodTransferMode: 'clone' })
```

## 5. 结论

- DoD ThreadPool 已切换为默认零拷贝策略。
- `threadpool-dod` 原生崩溃链路在当前基线下已复现通过并稳定。
- `clone` 模式保留为兜底开关，不作为默认路径。

