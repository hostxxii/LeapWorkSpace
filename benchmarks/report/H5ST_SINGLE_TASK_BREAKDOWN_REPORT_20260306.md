# H5ST 单任务耗时拆分与跨边界统计报告（2026-03-06）

## 1. 结论

- 本轮第 2 次排故的核心目标已基本达成：
  - `LEAP_PERF_TRACE=1` 开关已落地。
  - 单任务阶段耗时 breakdown 已可输出到 `stderr`。
  - `__LEAP_DISPATCH__` 总调用次数及 `getter / setter / apply / construct` 分类计数已可输出。
  - 默认关闭时仍走原有业务路径，没有改变正常逻辑。
- 仍有 2 个保留项未完全达成：
  - `script compile` 耗时目前无法在 JS 侧与 execute 无歧义拆开。
  - Hook 回调触发次数当前无法在 JS 侧稳定观测，因此未纳入摘要。

结论判断：**这轮可以视为达到计划主目标，可进入下一步热点 API / 热点对象排查（A5）。**

## 2. 目标完成情况

| 项目 | 预期 | 状态 | 说明 |
|---|---|---|---|
| addon 加载耗时 | 需要 | 已完成 | 在 `runner.js` 统计 `require leap-vm` |
| Isolate/Context 创建耗时 | 需要 | 已完成 | 以 JS 侧 `configureHooks()` 前后作为当前可观测近似边界 |
| Bundle + Skeleton 装配耗时 | 需要 | 已完成 | 统计 bundle 读取 + bundle 内 skeleton load |
| Impl 注册耗时 | 需要 | 已完成 | 在 `registerImpl()` 内累计 |
| siteProfile 注入耗时 | 需要 | 已完成 | trace 模式下拆为 setup 阶段 |
| script compile 耗时 | 如果能区分 | 未完成 | 现有 `runScript()` API 为 compile+execute 黑盒 |
| execute 耗时 | 需要 | 已完成 | trace 模式下单独统计目标脚本执行 |
| 结果提取耗时 | 需要 | 已完成 | 已输出，当前样例中接近 0ms |
| cleanup 耗时 | 需要 | 已完成 | 已统计 `resetSignatureTaskState` 等清理阶段 |
| dispatch 总次数 | 需要 | 已完成 | 在 `runtime.js` dispatch 入口统计 |
| dispatch 分类次数 | 需要 | 已完成 | `getter / setter / apply / construct` |
| Hook 回调次数 | 如果能观测 | 未完成 | 当前 JS 侧无稳定观测点 |
| stderr JSON 摘要 | 需要 | 已完成 | 任务结束输出一行 JSON |

## 3. 实现摘要

- 改动文件：
  - `leap-env/runner.js`
  - `leap-env/src/core/runtime.js`
  - `leap-env/src/core/skeleton-loader.js`
- 关键实现：
  - 通过 bootstrap 将 `perfTraceEnabled` 注入 VM 内部，避免 VM 内 `process.env` 不可见导致开关失效。
  - 初始化阶段在宿主 JS 侧统计；bundle 内部的 skeleton load 和 impl register 通过 runtime store 回传。
  - 任务执行在 trace 模式下拆为 `setup / execute / cleanup` 三段，以得到 `siteProfileInject`、`scriptExecute`、`cleanup`。
  - 每次任务结束后从 VM 读取 perf snapshot，并向 `stderr` 输出一行 JSON 摘要。

## 4. 验证结果

### 4.1 DOM/dispatch 冒烟样例

验证脚本包含：

- `document.createElement`
- `setAttribute`
- `appendChild`
- `navigator.userAgent`
- `window.innerWidth`

输出摘要：

```json
{"perfTrace":{"phases":{"addonLoad":4.484,"isolateCreate":1.79,"bundleLoad":16.1,"implRegister":2,"siteProfileInject":0.268,"scriptExecute":2.683,"resultExtract":0,"cleanup":0.705},"dispatch":{"total":14,"getter":6,"setter":2,"apply":6,"construct":0}}}
```

结论：

- `dispatch` 计数已经生效，不再是 0。
- 冷启动单任务里，初始化阶段仍明显重于脚本本体执行。

### 4.2 带 `jd` siteProfile 的样例

输出摘要：

```json
{"perfTrace":{"phases":{"addonLoad":4.7,"isolateCreate":1.8,"bundleLoad":17.287,"implRegister":3,"siteProfileInject":3.056,"scriptExecute":1.176,"resultExtract":0,"cleanup":0.487},"dispatch":{"total":52,"getter":8,"setter":3,"apply":41,"construct":0}}}
```

结论：

- `siteProfileInject` 在带站点配置时明显上升，已经成为单任务内可见成本。
- 跨边界调用以 `apply` 为主，说明下一轮适合继续做热点方法聚合，而不是直接讨论全量下沉 C++。

## 5. 当前认知边界

### 5.1 为什么 `scriptCompile` 还不能报

- 当前 `leap-vm` 暴露给 JS 的 `runScript()` / `runScriptWithCache()` 只返回最终执行结果。
- JS 侧拿不到独立的 compile 起止点，也没有 compile-only API。
- 因此如果强行输出 `scriptCompile`，会是伪精度数据，不适合进入正式报告。

### 5.2 为什么 Hook 次数还没报

- 这轮约束是不改 C++。
- Hook 触发当前主要发生在 native 侧监控链路，JS 侧没有统一、稳定、低成本的计数入口。
- 因此暂不纳入本轮 JSON 摘要。

## 6. 建议的下一步

- 进入 `A5`：
  - 在现有 `dispatch` 计数基础上，继续加 `typeName.propName` 维度的聚合表。
  - 输出“热点对象/方法、调用次数、分类、占比”。
- 若后续必须拿到 `scriptCompile`：
  - 需要新增 addon 级别的 compile/execute 细分 API，或在 C++ 侧显式回传 compile timing。
- 若后续必须拿到 Hook 次数：
  - 需要放宽“不改 C++”约束，在 native hook/monitor 入口补计数器。

## 7. 复现命令

单次最小验证：

```bash
LEAP_PERF_TRACE=1 node <<'NODE'
const { initializeEnvironment, executeSignatureTask, shutdownEnvironment } = require('./leap-env/runner');
let ctx = null;
try {
  ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  const result = executeSignatureTask(ctx.leapvm, {
    taskId: 'perf-trace-final-check',
    resourceName: 'perf-trace-final-check.js',
    targetScript: `
      var el = document.createElement('div');
      el.setAttribute('data-x', '1');
      document.body.appendChild(el);
      el.textContent = navigator.userAgent;
      JSON.stringify({
        width: window.innerWidth,
        childCount: document.body.childNodes.length,
        attr: el.getAttribute('data-x')
      });
    `
  });
  console.log(result);
} finally {
  if (ctx) shutdownEnvironment(ctx.leapvm);
}
NODE
```

带 `jd` siteProfile 的验证：

```bash
LEAP_PERF_TRACE=1 node <<'NODE'
const { initializeEnvironment, executeSignatureTask, shutdownEnvironment } = require('./leap-env/runner');
const siteProfile = require('./site-profiles/jd.json');
let ctx = null;
try {
  ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  const result = executeSignatureTask(ctx.leapvm, {
    taskId: 'perf-trace-jd-sample',
    resourceName: 'perf-trace-jd-sample.js',
    siteProfile,
    targetScript: `
      var el = document.createElement('div');
      el.id = 'probe';
      document.body.appendChild(el);
      JSON.stringify({
        ua: navigator.userAgent,
        lang: navigator.language,
        href: location.href,
        width: window.innerWidth,
        nodeCount: document.body.childNodes.length
      });
    `
  });
  console.log(result);
} finally {
  if (ctx) shutdownEnvironment(ctx.leapvm);
}
NODE
```

## 8. 报告与产物

- 本报告：`benchmarks/report/H5ST_SINGLE_TASK_BREAKDOWN_REPORT_20260306.md`
- 插桩入口：`leap-env/runner.js`
- VM 内计数：`leap-env/src/core/runtime.js`
- skeleton 阶段计时：`leap-env/src/core/skeleton-loader.js`
