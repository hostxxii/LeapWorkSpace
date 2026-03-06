# H5ST 热点定位与 Hook 影响评估报告（2026-03-06）

## 1. 结论

- 本轮 A5 + A6 已完成：
  - `__LEAP_DISPATCH__` 已支持按 `(typeName, propName, operationType)` 三元组聚合。
  - `LEAP_PERF_TRACE=1` 下，任务结束会输出 dispatch Top 30 热点表、Top 10 集中度、`getter/setter/apply/construct` 占比。
  - `benchmarks/perf-baseline-runner.js` 已支持 `--mode baseline|minimal|full`。
  - `ThreadPool/ProcessPool` 已能把 `debugCppWrapperRules`、`signatureProfile` 透传到 worker 初始化。
- 单任务热点显示：`Storage.setItem` 是绝对第一热点，单项占全部 dispatch 的 `40.23%`；Top 10 合计覆盖 `74.71%`，热点集中度高。
- Hook/Monitor/Inspector 全开后，500 任务总吞吐从 `102.61 req/s` 降到 `56.45 req/s`，整体下降 `44.99%`。
- 如果只看第 2~10 个采样窗口的稳态区间，`full` 相比 `minimal` 吞吐仍下降 `18.31%`，说明 Hook 系统本身就是明显扰动项，不只是首窗口冷启动抖动。
- 结合上一轮单任务拆分与本轮数据，短跑瓶颈更像“两层叠加”：
  - `minimal` 下仍是 CPU 饱和主导。
  - `full` 下观测链路（Monitor + Inspector + builtin wrapper）本身已足够重，会显著压低吞吐并放大尾延迟。

## 2. 热点 API 统计

### 2.1 测试对象

- 运行方式：单任务 `LEAP_PERF_TRACE=1`
- 目标脚本：`work/h5st.js`
- 站点配置：`site-profiles/jd.json`
- 初始化参数：`debug=false`，`signatureProfile='fp-occupy'`

### 2.2 dispatch 汇总

| 指标 | 数值 |
|---|---:|
| 总 dispatch 次数 | `87` |
| Top 10 占总调用 | `74.71%` |
| getter 占比 | `34.48%` |
| setter 占比 | `8.05%` |
| apply 占比 | `57.47%` |
| construct 占比 | `0.00%` |

判断：

- 跨边界调用以 `apply` 为主，说明热点更偏“方法调用”而不是构造或简单写属性。
- Top 10 已覆盖接近 `3/4` 的 dispatch，热点集中度足够高，后续如果要做定向优化，优先级可以很明确。

### 2.3 热点 Top 10

| 排名 | typeName.propName | 调用次数 | 类型 | 占总调用% |
|---|---|---:|---|---:|
| 1 | `Storage.setItem` | `35` | `apply` | `40.23%` |
| 2 | `Navigator.userAgent` | `6` | `getter` | `6.90%` |
| 3 | `Storage.getItem` | `5` | `apply` | `5.75%` |
| 4 | `Storage.clear` | `4` | `apply` | `4.60%` |
| 5 | `Document.body` | `3` | `getter` | `3.45%` |
| 6 | `Document.cookie` | `3` | `getter` | `3.45%` |
| 7 | `Location.host` | `3` | `getter` | `3.45%` |
| 8 | `Document.documentElement` | `2` | `getter` | `2.30%` |
| 9 | `Element.childElementCount` | `2` | `getter` | `2.30%` |
| 10 | `Location.href` | `2` | `setter` | `2.30%` |

补充观察：

- `Storage.*` 三项合计 `44/87`，占全部 dispatch 的 `50.58%`，是最明确的绝对热点簇。
- `Navigator.userAgent`、`Document.cookie`、`Location.host/href` 都是典型检测脚本常见探针，说明本轮统计结果符合目标脚本行为特征。
- 这组数据里 dispatch 总量本身不算夸张，说明“是否要大面积下沉 C++”不能只凭调用次数拍板；更值得优先关注的是少数高频稳定点。

## 3. Hook 影响评估

### 3.1 模式定义

- `minimal`：`debug=false`，只保留核心 dispatch + skeleton + impl
- `full`：`debug=true`，开启 Hook / Monitor / Inspector，并启用 builtin wrapper
- `baseline`：当前默认基线配置；本轮代码中它与当前默认行为一致，仍是 `debug=false`

### 3.2 压测参数

- pool：`12`
- concurrency：`48`
- measured tasks：`500`
- warmup：`20`
- maxTasksPerWorker：`50`
- backend：`ThreadPool`

### 3.3 overall 对比

| 指标 | minimal | full | 差值 | 影响% |
|---|---:|---:|---:|---:|
| req/s | `102.61` | `56.45` | `-46.16` | `-44.99%` |
| p50 (ms) | `108` | `136` | `+28` | `+25.93%` |
| p95 (ms) | `147` | `180` | `+33` | `+22.45%` |
| p99 (ms) | `184` | `3079` | `+2895` | `+1573.37%` |
| CPU% peak | `98.12` | `96.04` | `-2.08` | `-2.12%` |
| RSS peak (MB) | `2603.63` | `2693.57` | `+89.94` | `+3.45%` |

### 3.4 稳态窗口对比（样本 2~10）

之所以单独列这一项，是因为 `full` 的第 1 个采样窗口出现了异常长尾：`50` 个任务窗口里 `p95/p99=3085/3087ms`，明显高于后续窗口。

把第 2~10 个窗口单独看，得到更接近稳态的结论：

| 指标 | minimal | full | 影响% |
|---|---:|---:|---:|
| 平均 req/s | `107.22` | `87.59` | `-18.31%` |
| 平均 p95 (ms) | `143.89` | `164.00` | `+13.98%` |
| 平均 p99 (ms) | `153.22` | `173.89` | `+13.49%` |

判断：

- 即使排除首窗口异常，`full` 仍明显慢于 `minimal`。
- 因此可以确认：Hook/Monitor/Inspector 并不是“只在启动期扰动一次”，而是会持续影响吞吐。
- 但 `p99` 的极端放大主要由首窗口触发，说明 full 模式还叠加了一个明显的前段冷态成本。

## 4. 对排故问题的回答

### 4.1 哪些 API 是绝对热点

- 最明确的是 `Storage.setItem / getItem / clear`。
- 单独看 `Storage.setItem` 就占 `40.23%`，这一项已经足够进入后续优先关注名单。
- 第二梯队是 `Navigator.userAgent`、`Document.cookie`、`Location.host/href` 这类高频探针访问。

### 4.2 热点调用集中度如何

- Top 10 覆盖 `74.71%`。
- 这说明热点非常集中，不是“长尾分散型”调用图。

### 4.3 Hook 系统对吞吐的影响百分比

- 按 overall 口径：`-44.99%`。
- 按稳态窗口口径：`-18.31%`。
- 因此如果目标是评估生产吞吐上限，`full` 不能当作基线模式使用。

### 4.4 基于这些数据，短跑瓶颈更可能在哪里

- 在 `minimal` 下，短跑上限仍更像 CPU 饱和问题。
- 在 `full` 下，更大的瓶颈来自观测链路本身：Monitor、Inspector、builtin wrapper 组合会明显压低吞吐并放大尾延迟。
- 从 dispatch 热点看，后续若要继续深挖“核心业务调用”的优化优先级，最值得先看的不是所有 API，而是 `Storage.*` 这一组。

## 5. 产物

- 热点/Hook 报告：`benchmarks/report/H5ST_HOTSPOT_HOOK_IMPACT_REPORT_20260306.md`
- minimal 结果：`benchmarks/results/baseline-minimal-20260306_184033.json`
- full 结果：`benchmarks/results/baseline-full-20260306_184046.json`
- 基准脚本：`benchmarks/perf-baseline-runner.js`

## 6. 复现命令

单任务热点：

```bash
LEAP_PERF_TRACE=1 node <<'NODE'
const fs = require('fs');
const path = require('path');
const { initializeEnvironment, executeSignatureTask, shutdownEnvironment } = require('./leap-env/runner');
const targetScriptPath = path.join(process.cwd(), 'work', 'h5st.js');
const siteProfilePath = path.join(process.cwd(), 'site-profiles', 'jd.json');
let ctx = null;
try {
  ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  executeSignatureTask(ctx.leapvm, {
    taskId: 'hotspot-single-run',
    resourceName: targetScriptPath,
    targetScript: fs.readFileSync(targetScriptPath, 'utf8'),
    siteProfile: JSON.parse(fs.readFileSync(siteProfilePath, 'utf8'))
  });
} finally {
  if (ctx) shutdownEnvironment(ctx.leapvm);
}
NODE
```

Hook 对比：

```bash
node benchmarks/perf-baseline-runner.js --mode minimal --pool 12 --concurrency 48 --total 500
node benchmarks/perf-baseline-runner.js --mode full --pool 12 --concurrency 48 --total 500
```
