# 2026-03-06 任务执行模型收敛：Code Cache 长跑修复与 Resident 实验回退

日期：2026-03-06  
范围：`leap-env`、`benchmarks`、`leap_manual`

## 1. 背景

- P0 长跑排查已收敛出一条明确主因：`executeSignatureTask()` 过去会把 `taskId`、snapshot 和 `targetScript` 拼成唯一大源码；在 `work/h5st.js` 这类约 486KB 大脚本下，V8 会为每个任务保留新的脚本源码与代码对象，导致 `Large Object Space`、`Code Space` 和 RSS 持续上涨。
- `benchmarks/report/P0_VALIDATION_REPORT_20260306.md` 第 19 节已经通过 `experiment-c4` 证明：只要把“大脚本唯一源码”变成“稳定源码 + 复用执行”，`SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE` 就会明显回落。

## 2. 本轮代码改动

### 2.1 `runner.js`：保留单一主线执行模型

`leap-env/runner.js`

- 为任务执行新增“稳定源码 + 每 `VmInstance` code cache”路径：
  - 只要 `targetScript` 超过阈值（默认 `32KB`）且 addon 支持 `createCodeCache/runScriptWithCache`，就不再把它和 `taskId/siteProfile` 拼进唯一大脚本。
  - 改为：
    1. 小型 setup 脚本：`beginTask` + `beginTaskScope` + 注入 `siteProfile`
    2. 大脚本本体：以稳定块级源码 `{\n targetScript \n}` 执行，并按 `resourceName + wrapped targetScript` 在单个 `VmInstance` 上懒生成一份 code cache
    3. 小型 cleanup 脚本：`resetSignatureTaskState` + `endTaskScope` + `endTask`
- `leapvm.__leapTaskExecutionCache` 仅保存目标脚本 code cache，作用域为单个 worker / 单个 `VmInstance`。
- 仍保留小脚本旧路径：小脚本继续走单次合并 `runScript`，避免为了优化大脚本而把所有任务都拆成多次 VM 调用。

### 2.2 `resident` 方案只做实验，最终回退

实验期间曾短暂落地过“常驻函数注册（resident）”方案：

- 启动后将目标脚本注册为常驻 `Function`
- 每任务只执行小 wrapper 调用该函数

该方案随后已全部回退，不再保留在项目主线，原因：

- `mtp=500` 实测未优于 code cache 主线
- 吞吐反而低于当前稳定方案
- 语义风险更高（更接近函数执行而不是普通 script completion value）
- 项目当前不需要同时保留多条执行模型回退链

当前主线已重新收敛为：**仅保留 code cache 任务执行路径**。

### 2.3 测试与 benchmark 工具补充

- 新增：
  - `tests/scripts/integration/test-leapenv-task-execution-cache.js`
- 作用：
  - 验证同一大脚本多任务执行时，`taskId/siteProfile` 仍然按任务生效
  - 验证每个 `VmInstance` 只保留一份目标脚本 cache entry

## 3. 关键结论

### 3.1 `experiment-c4` 结果已证明主因被切断

结果文件：

- `benchmarks/results/experiment-c4-stabilize-script-source-20260306_231707.json`
- `benchmarks/report/experiment-c4-stabilize-script-source-20260306_231707.md`

结论：

- `unique-task-id` 与 `constant-task-id` 两组已经收敛
- 两组的 `Large Object Space` 都约为 `4.44MB`
- `SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE` 都为 `2`

这说明当前 `executeSignatureTask()` 已不再因为任务唯一 payload 持续生成新的大源码对象。

### 3.2 长跑结果：`mtp=500/1000` 已显著回落

#### `mtp=500`

旧基线（P0 报告第 18 节）：

- `req/s = 43.42`
- `p99 = 5914ms`
- `peak RSS = 6032.09MB`

新结果：

- 文件：`benchmarks/results/longevity-mtp500-20260306_232125.json`
- `req/s = 178.28`
- `p99 = 113ms`
- `peak RSS = 2613.77MB`

#### `mtp=1000`

旧基线（P0 报告第 8 节）：

- `req/s = 28.56`
- `p99 = 5302ms`
- `peak RSS = 5831.39MB`

新结果：

- 文件：`benchmarks/results/longevity-mtp1000-20260306_232603.json`
- `req/s = 137.69`
- `p99 = 162ms`
- `peak RSS = 2591.18MB`

### 3.3 仍有一个剩余问题：单窗口抖动

在当前纯 code cache 主线下，`mtp=500` 重新复跑仍可见一次孤立的 sample 抖动：

- 文件：`benchmarks/results/longevity-mtp500-20260306_234443.json`
- `tasks≈500` 的 sample：
  - `req/s = 19.71`
  - `p99 = 2352ms`

但该抖动不会继续扩散：

- 后续 sample 会立即恢复
- RSS 不会重新冲到 `~6GB`
- 因此它不再是“结构性内存失控”，更像单次阻塞/暂停

## 4. 对架构的影响

### 4.1 `siteProfile` 的职责边界被进一步明确

`siteProfile` / 配置注入链路只承担任务态数据覆盖：

- `fingerprintSnapshot`
- `storageSnapshot`
- `documentSnapshot`

不承担：

- 编译后的大脚本产物
- 常驻函数句柄
- 任意执行缓存元数据

这些内容属于 runner 的任务执行模型，应挂在 `leapvm` 宿主对象或 worker 生命周期内，而不是并入 JSON 配置注入。

### 4.2 任务执行模型的当前结论

当前推荐主线：

- 小脚本：继续走单次合并 `runScript`
- 大脚本：稳定源码 + 每 `VmInstance` code cache

当前不推荐主线：

- 常驻函数注册（resident）

## 5. 后续建议

下一轮如果继续排查，不应再优先改执行模型，而应直接围绕“单窗口抖动”做观测：

1. 在异常 sample 前后对 worker 级 `runtimeStats` / V8 指标做聚焦比对
2. 判断是否存在单次 GC、单 worker 停顿、某个 worker 任务分布异常
3. 若后续仍要再试更激进方案，必须以独立实验模式进行，不回到项目默认主线
