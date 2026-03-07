# 2026-03-07 ThreadPool 同步停顿排故进展：MessageChannel 路径排除

## 背景

`ThreadPool + h5st.js` 在长跑或重复短跑中会偶发一次同步停顿：

- 不是所有 run 都出现
- 但批量重复跑可以稳定抓到
- 一旦出现，通常表现为 `10~12` 个 worker 同时变慢
- 停顿持续大约 `2.7s ~ 4.4s`
- 所有慢任务完成时间 spread 通常只有 `几十毫秒`

这类形态更像同进程 `worker_threads` 下的全局 pause，而不是某一个 worker 独立卡顿。

## 已确认排除项

截至本记录，已确认以下方向不是主因：

1. `heartbeat` 不是主因
   - 将 `heartbeatIntervalMs` 提高到 `60000ms` 后仍可复现

2. 主进程 GC / event-loop 不是主因
   - 异常轮次中主进程 `gc` 和 `monitorEventLoopDelay` 没有秒级异常

3. `code cache` 不是主因
   - 强制退回 `combined` 路径后仍可复现

4. “486KB 大脚本体积”本身不是主因
   - 同体积合成空脚本在线程池下未复现同步停顿

5. `MessageChannel` 调度路径不是必要条件
   - 本次新增 `--disable-message-channel` 对照后，停顿仍然存在

6. `js-security-v3-rac.js` 外链脚本加载不是必要条件
   - 本次新增 `--block-security-script` 对照后，停顿仍然存在

## 本次新增诊断能力

相关文件：

- [investigate-sync-stall.js](/home/hostxxii/LeapWorkSpace/benchmarks/investigate-sync-stall.js)
- [runner.js](/home/hostxxii/LeapWorkSpace/leap-env/runner.js)
- [thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js)
- [worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/worker.js)
- [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js)
- [process-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/process-pool.js)

本阶段补了三类诊断：

1. 任务阶段耗时
   - `executeSignatureTaskMs`
   - `postTaskCleanupMs`
   - `executeSignatureTask` 内部的 `setup / before / target / cleanup`

2. 任务级 API trace
   - 慢任务会带回 `taskApiTrace`
   - 错误路径也会带回 `phaseTimings / taskApiTrace / runtimeStats / memoryUsage`

3. `MessageChannel` 对照开关
   - `benchmarks/investigate-sync-stall.js` 新增 `--disable-message-channel`
   - 通过任务 `beforeRunScript` 将 `globalThis.MessageChannel / MessagePort` 置空，强制脚本走 fallback 路径

4. 外链脚本阻断开关
   - `benchmarks/investigate-sync-stall.js` 新增 `--block-security-script`
   - 通过任务 `beforeRunScript` 拦截 `Node.prototype.appendChild`
   - 当脚本 URL 命中 `js-security-v3-rac.js` 时，不真正注入并异步触发 `onerror`

5. 业务态缓存对照开关
   - `benchmarks/investigate-sync-stall.js` 新增 `--clear-h5st-cache-keys`
   - 每任务开始前清理：
     - `WQ_dy1_vk`
     - `WQ_dy1_tk_algo`
     - `JDst_behavior_flag`
     - `WQ_gather_cv1`
     - `WQ_gather_wgl1`

6. Canvas 指纹对照开关
   - `benchmarks/investigate-sync-stall.js` 新增 `--stub-canvas-fingerprint`
   - 将 `HTMLCanvasElement.toDataURL / toBlob` stub 成固定结果

7. Cookie 对照开关
   - `benchmarks/investigate-sync-stall.js` 新增 `--stub-cookie-empty`
   - 将 `Document.cookie` getter/setter stub 成空串

8. ParamsSign 源码级改写开关
   - `benchmarks/investigate-sync-stall.js` 新增：
     - `--disable-paramsign-async-init`
     - `--disable-paramsign-rds`
     - `--disable-paramsign-rgo`
     - `--disable-paramsign-ram`
     - `--stub-paramsign-ram-env-only`
     - `--stub-paramsign-pv`
   - 通过直接改写 `h5st.js` 源码中的 `ParamsSign` 原型方法做最小对照

9. ParamsSign 方法级 trace 实验开关
   - `benchmarks/investigate-sync-stall.js` 新增 `--trace-paramsign-methods`
   - worker 结果中会额外带回 `paramSignMethodTrace`
   - 当前时间统计仍受脚本内时间伪造影响，方法级 `ms` 基本不可用
   - 但返回值摘要已经可用，可用于判断方法短路时需要保留的返回形状

## h5st.js 静态线索

在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js) 中可以看到明确的调度分支：

- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L3969) 命中 `MessageChannel`
- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L4020) 使用 `port1.onmessage`
- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L4021) 绑定 `port2.postMessage`
- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L4043) fallback 到 `setTimeout`

这也是本次优先验证 `MessageChannel` 路径的原因。

## 实际命中路径（来自 hook 日志）

参考日志：

- [log.md](/home/hostxxii/LeapWorkSpace/log.md)

这份日志说明，当前 workload 在已有 `site-profile` 覆盖下，实际命中的宿主路径比“全量强指纹”窄得多，更接近下面这条链路：

1. 基础环境探测
   - `Document.all`
   - `Navigator.userAgent`
   - `Document.documentElement`

2. 调度初始化
   - `MessageChannel.port1 / port2`
   - `MessagePort.onmessage`
   - `Promise.prototype.then`

3. 外链脚本加载
   - `Window.setTimeout`
   - `Document.createElement('script')`
   - `HTMLScriptElement.src = https://storage.360buyimg.com/webcontainer/main/js-security-v3-rac.js?...`
   - `Node.appendChild`
   - 多次 `Promise.prototype.then`

4. 缓存与状态读取
   - `Storage.getItem(WQ_dy1_vk)`
   - `Storage.getItem(WQ_dy1_tk_algo)`
   - `Storage.getItem(JDst_behavior_flag)`
   - `Storage.getItem(WQ_gather_cv1)`
   - `Storage.getItem(WQ_gather_wgl1)`
   - `Document.cookie`

5. 轻量导航/DOM读取
   - `Navigator.webdriver`
   - `Navigator.languages`
   - `Navigator.plugins`
   - `Document.head / body`
   - `Location.host`
   - `Element.innerHTML`

当前日志里没有真正命中的 `canvas.toDataURL / XMLHttpRequest / crypto.getRandomValues`，因此这轮排故不应再默认假设“强指纹 API 本身过重”。

## ParamsSign 入口结构

根据 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js) 尾部代码，当前脚本的直接入口已经比较清晰：

- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L15458) `signSync` 最终走 `this._$sdnmd(_$py)`
- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L14500) 附近可见 `_$pz.prototype._$rds`
- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L14548) 附近可见 `_$pz.prototype._$rgo`
- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L14595) 附近可见 `_$pz.prototype._$ram`
- [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L12734) 附近可见 `function _$pv(_$py)`，这是环境采集器

从源码结构上看：

- `_$pv` 更像环境/指纹采集
- `_$rds/_$rgo/_$ram` 更像异步初始化或远端 token 刷新链
- `signSync -> _$sdnmd` 是同步签名主路径

## 关键实验与结果

### 1. 普通 thread 重复跑仍稳定抓到异常

结果文件：

- [sync-stall-thread-20260307_002553.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_002553.json)
- [sync-stall-thread-20260307_002738.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_002738.json)

代表性现象：

- `runIndex=2/11` 出现 `10~11` worker 同步停顿
- 停顿约 `2.77s`
- spread 约 `55~57ms`

阶段归因：

- 大多数慢任务停顿落在 `targetScriptMs`
- 少数样本会落在 `postTaskCleanupMs`
- 这说明 pause 更像是“全局停顿打在哪个阶段就记到哪个阶段”

### 2. 任务级 API trace 没发现常规宿主 API 异常变慢

已观测的慢任务 API trace 基本只看到：

- `MessageChannel`
- `setTimeout.schedule`

且它们的 `totalMs / maxMs` 基本都是 `0`。

结论：

- 暂无证据表明 `crypto / XHR / canvas / timer` 这类同步宿主 API 自身耗时暴涨

### 3. 强制关闭 MessageChannel 后，异常仍可复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 10 --disable-message-channel
```

结果文件：

- [sync-stall-thread-20260307_152140.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_152140.json)

关键结果：

- `runIndex=4` 仍然出现同步停顿
- `11` 个 worker 同时受影响
- spread `48ms`
- 最大任务耗时 `4392ms`

更关键的是，这次在 fallback 路径下，异常大多数仍然直接落在 `targetScriptMs ~4.36s`：

- 说明停顿不是 `MessageChannel` 调度实现特有
- 禁用 `MessageChannel` 后问题没有消失，反而在该次样本中持续时间更长

### 4. 阻断 `js-security-v3-rac.js` 外链脚本后，异常仍可复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 10 --block-security-script
```

结果文件：

- [sync-stall-thread-20260307_153019.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_153019.json)

关键结果：

- `runIndex=1` 仍然出现同步停顿
- `11` 个 worker 同时受影响
- spread `49ms`
- 最大任务耗时 `2990ms`

而且任务本身仍然可以跑完，说明：

- 这条远程脚本加载链路不是“任务能否完成”的必要条件
- 至少在当前缓存/站点态下，阻断 `js-security-v3-rac.js` 后 `h5st.js` 仍能继续执行

阶段归因上，大多数慢任务仍然直接落在 `targetScriptMs ~2.97s`，少数样本落在 `beforeScriptMs ~2.93s` 或 `postTaskCleanupMs ~2.94s`。这与前面的判断一致：

- pause 更像是全局停顿
- 它打到哪个阶段，就被统计到哪个阶段
- 外链脚本加载本身不是必要条件

### 5. 清理 h5st 缓存键后，脚本会切回 canvas 路径，但异常仍可复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 10 --clear-h5st-cache-keys
```

结果文件：

- [sync-stall-thread-20260307_153914.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_153914.json)

关键观察：

- 慢任务 `taskApiTrace` 开始稳定出现 `HTMLCanvasElement.toDataURL`
- 说明这几组 `localStorage` 键确实会影响 `h5st.js` 走哪条业务路径
- 但异常仍可复现
  - `runIndex=3`
  - `10` 个 worker 同步停顿
  - spread `61ms`
  - 最大任务耗时 `3003ms`

结论：

- 这些缓存键是“路径选择条件”
- 但不是同步停顿的根因

### 6. 在“清缓存键”前提下再 stub canvas，异常仍可复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 20 --clear-h5st-cache-keys --stub-canvas-fingerprint
```

结果文件：

- [sync-stall-thread-20260307_154208.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_154208.json)

关键结果：

- 异常轮中 `taskApiTrace` 已不再出现 `HTMLCanvasElement.toDataURL`
- 但 `runIndex=4` 仍然出现同步停顿
  - `12` 个 worker 同步受影响
  - spread `59ms`
  - 最大任务耗时 `3014ms`

结论：

- canvas 指纹分支不是必要条件
- 即使把“清缓存键后新出现的 canvas 路径”拿掉，同步停顿仍然存在

### 7. 将 cookie stub 为空后，异常仍可复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 20 --stub-cookie-empty
```

结果文件：

- [sync-stall-thread-20260307_154518.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_154518.json)

关键结果：

- 任务仍然能够完成
- 宿主路径收缩到 `MessageChannel + setTimeout.schedule`
- 但异常依旧出现了多次：
  - `runIndex=2`
  - `runIndex=11`
  - `runIndex=20`

结论：

- 长 cookie 字符串解析不是必要条件
- `Document.cookie` 读取也不能单独解释这次同步停顿

### 8. 直接禁用 ParamsSign 异步初始化链后，异常仍会出现，但复现频率下降

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 20 --disable-paramsign-async-init
```

结果文件：

- [sync-stall-thread-20260307_155020.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_155020.json)

这个开关会直接改写源码中的：

- `_$pz.prototype._$rds`
- `_$pz.prototype._$rgo`
- `_$pz.prototype._$ram`

关键结果：

- 任务仍能完成
- 宿主 trace 进一步收缩，异常轮里基本只剩 `MessageChannel`
- 20 轮中仍然出现 1 次同步停顿
  - `runIndex=18`
  - `11` 个 worker 同步受影响
  - spread `68ms`

结论：

- `ParamsSign` 异步初始化链不是唯一根因
- 但它可能在放大停顿触发概率
- 这一结论当前只算“有嫌疑”，还不够定案

### 9. 只禁用 `_$rds` 不够，异常仍会多次复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 20 --disable-paramsign-rds
```

结果文件：

- [sync-stall-thread-20260307_155231.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_155231.json)

关键结果：

- 任务仍能完成
- 20 轮中出现 2 次同步停顿
  - `runIndex=2`
  - `runIndex=11`

保守解读：

- 只移除 `_$rds` 入口，并没有像“整条异步初始化链一起禁用”那样干净
- 但由于样本量仍有限，当前还不能据此断言 `_$rgo/_$ram` 必然就是主因
- 更安全的表述是：`ParamsSign` 异步初始化链整体值得继续细分

### 10. 只禁用 `_$ram` 时，复现率与“整条异步初始化链禁用”接近

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 20 --disable-paramsign-ram
```

结果文件：

- [sync-stall-thread-20260307_160052.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_160052.json)

关键结果：

- 20 轮里出现 1 次同步停顿
  - `runIndex=3`
- `avgReqPerSec=187.39`
- `avgP99=236ms`

对比：

- `--disable-paramsign-async-init`：20 轮 1 次
- `--disable-paramsign-rds`：20 轮 2 次

这说明：

- 如果只看当前样本，`_$ram` 比 `_$rds` 更接近“真正有影响的那部分”
- 但仍不足以直接认定 `_$ram` 就是唯一根因

### 11. 只把 `_$pv` 环境采集器改成最小 stub 时，吞吐明显提升，但异常仍会出现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 20 --stub-paramsign-pv
```

结果文件：

- [sync-stall-thread-20260307_160212.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_160212.json)

关键结果：

- 20 轮里出现 2 次同步停顿
  - `runIndex=10`
  - `runIndex=20`
- 但平均吞吐明显上升：
  - `avgReqPerSec=197.58`
  - 相比普通 thread 对照的 `176.72` 有明显提升

这说明：

- `_$pv` 的环境采集内容本身是负担
- 它会放大总体执行成本
- 但单独把 `_$pv` stub 掉，还不足以消除同步停顿

### 12. “整条异步初始化链禁用 + _$pv 最小 stub” 组合对照，在当前样本中完全消除异常

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --repeats 20 --disable-paramsign-async-init --stub-paramsign-pv
```

结果文件：

- [sync-stall-thread-20260307_160340.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_160340.json)

关键结果：

- 20 轮里 `0` 次同步停顿
- `avgReqPerSec=196.32`
- `avgP99=95ms`

这是目前最强的一组对照结果。

保守结论：

- 高风险区已经明显收敛到两块：
  - `ParamsSign` 异步初始化链
  - `_$pv` 环境采集器
- 单独去掉其中一块，异常仍可能出现
- 两块同时拿掉后，在当前 20 轮样本里没有再复现

这还不能证明“根因只在这两块”，但已经足够说明：

- 后续路径二分应该优先围绕 `_$pv` 和 `_$ram/_$rgo` 继续展开
- 不需要再把注意力放回 `canvas / cookie / MessageChannel / 安全脚本` 这类外围单点

### 13. 同参数 `thread 12/48` 轻量复测，仍可再次复现同步停顿

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 12 --warmup 20 --total 360 --sample-every 30
```

结果文件：

- [sync-stall-thread-20260307_161051.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_161051.json)

关键结果：

- `12` 轮里出现 `1` 次同步停顿
  - `runIndex=7`
  - `9` 个 worker 同步受影响
  - spread `51ms`
  - 最大任务耗时 `3031ms`
  - 异常轮吞吐降到 `73.76 req/s`

阶段归因：

- 大多数慢任务仍落在 `targetScriptMs ~3.0s`
- 也有样本落在 `cleanupMs ~2.94s`

这再次说明：

- 当前问题在较轻负载样本下仍可抓到
- pause 仍然像“打到哪个阶段就记到哪个阶段”

### 14. `thread 12/12` 对照在当前样本中完全不复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 12 --repeats 12 --warmup 20 --total 360 --sample-every 30
```

结果文件：

- [sync-stall-thread-20260307_160918.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_160918.json)

关键结果：

- `12` 轮里 `0` 次慢任务
- `0` 次同步停顿
- `avgReqPerSec=177.17`
- `avgP99=101.42ms`
- `maxTaskMs=139ms`

结论：

- 仅有同进程 `worker_threads` 多 worker 还不够
- `pool=12` 但 `concurrency=12` 时没有出现这类 `3s` 级同步塌陷
- 当前更像是“同进程多 isolate + 过量并发压载”共同触发

### 15. `process 12/48` 对照在同样高并发下不复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend process --pool 12 --concurrency 48 --repeats 12 --warmup 20 --total 360 --sample-every 30
```

结果文件：

- [sync-stall-process-20260307_161009.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-process-20260307_161009.json)

关键结果：

- `12` 轮里 `0` 次慢任务
- `0` 次同步停顿
- `avgReqPerSec=144.5`
- `avgP99=74.25ms`
- `maxTaskMs=86ms`

结论：

- 单看 `concurrency=48` 并不足以触发问题
- 相同 `12/48` 压载形态下，`ProcessPool` 没有出现这类同步停顿
- 这进一步加强了“问题与同进程 `worker_threads` 隔离模型相关”的判断

### 16. `thread 1/1` 边界样本也不出现秒级停顿

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 1 --concurrency 1 --repeats 6 --warmup 10 --total 120 --sample-every 20
```

结果文件：

- [sync-stall-thread-20260307_161121.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_161121.json)

关键结果：

- `6` 轮里 `0` 次慢任务
- `0` 次同步停顿
- `avgReqPerSec=37.43`
- `avgP99=30.17ms`
- `maxTaskMs=35ms`

结论：

- 单 worker 下没有观察到 `3s` 级长停顿
- 当前触发条件已经进一步收敛到：
  - `worker_threads` 同进程多 worker
  - 并且需要明显高于 pool size 的并发压载

### 17. 触发阈值继续收窄到 `pool=12` 时的 `concurrency 15 -> 16` 附近

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 14 --repeats 10 --warmup 20 --total 360 --sample-every 30
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 15 --repeats 10 --warmup 20 --total 360 --sample-every 30
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 16 --repeats 10 --warmup 20 --total 360 --sample-every 30
```

结果文件：

- [sync-stall-thread-20260307_161431.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_161431.json)
- [sync-stall-thread-20260307_161508.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_161508.json)
- [sync-stall-thread-20260307_161349.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_161349.json)

关键结果：

- `concurrency=14`
  - `10` 轮里 `0` 次慢任务
  - `0` 次同步停顿
  - 但有一轮 `reqPerSec=74.57`，没有伴随 `>1000ms` 慢任务
- `concurrency=15`
  - `10` 轮里 `0` 次慢任务
  - `0` 次同步停顿
  - `maxTaskMs=139ms`
- `concurrency=16`
  - `10` 轮里出现 `1` 次同步停顿
  - `runIndex=9`
  - `12` 个 worker 全部受影响
  - spread `59ms`
  - `maxTaskMs=3002ms`
  - 异常轮吞吐降到 `75.2 req/s`

保守结论：

- 在当前脚本与机器样本下，触发阈值已经明显逼近 `pool=12` 时的 `concurrency=16`
- `concurrency=15` 尚未复现，`concurrency=16` 已可复现整池同步停顿
- `concurrency=14` 的单次吞吐异常说明阈值附近可能存在“先出现轻度抖动，再进入可判定同步停顿”的过渡区
- 由于问题具有随机性，这里更适合表述为“高风险起点接近 `16`”，而不是直接断言“严格阈值就是 `16`”

### 18. 只禁用 `_$rgo` 仍然会复现，说明“真正进入 _$ram”不是必要条件

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 12 --warmup 20 --total 360 --sample-every 30 --disable-paramsign-rgo
```

结果文件：

- [sync-stall-thread-20260307_162129.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_162129.json)

关键结果：

- `12` 轮里出现 `1` 次同步停顿
  - `runIndex=10`
  - `11` 个 worker 同步受影响
  - spread `57ms`
  - `maxTaskMs=2998ms`
  - 异常轮吞吐降到 `73.68 req/s`

结论：

- 即使 `_$rgo` 直接 `Promise.resolve()`，同步停顿仍会出现
- 这说明 `_$rgo -> _$ram` 这条“真正执行远端刷新”的链路不是必要条件
- 因此 `ParamsSign` 异步初始化链更适合被视作“可能放大触发概率”，而不是足够解释问题的唯一根因

### 19. `_$ram` 只保留 `_$pv + env encode` 时，异常仍然会复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 12 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-ram-env-only
```

结果文件：

- [sync-stall-thread-20260307_162214.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_162214.json)

关键结果：

- `12` 轮里出现 `1` 次同步停顿
  - `runIndex=6`
  - `11` 个 worker 同步受影响
  - spread `49ms`
  - `maxTaskMs=3002ms`
  - 异常轮吞吐降到 `74.3 req/s`

阶段归因：

- 慢任务大多数仍落在 `targetScriptMs ~2.97s ~ 2.99s`

结论：

- 远端 token 刷新 / 保存并不是必要条件
- 仅保留 `_$pv + _$ws + encode` 这一段，仍然足以复现同步停顿
- 但由于“禁用 `_$rgo` 仍可复现”，当前也不能再把根因简单收敛成“只在 `_$ram` 内部”

### 20. 关于 `_$pv` 的最新保守判断

本轮新增了一个重要静态事实：

- 在当前源码里，`_$pv(` 的直接调用点只看到 `_$ram` 一处

这与实验结果结合后，得到一个更保守但更可靠的结论：

- `_$pv` 仍然是高风险区
- 但“`_$pv` 的那次调用”已经不足以单独解释全部同步停顿
- 更合理的理解是：
  - `_$pv` 和异步初始化链会影响触发概率
  - 但真正需要优先二分的范围，已经回到了 `signSync -> _$sdnmd` 同步主路径

### 21. `ParamsSign` 返回值摘要已经足够支撑“形状安全”的主链短路

通过 `--trace-paramsign-methods` 的返回摘要，可以确认当前主链上几段关键返回形状：

- `_$cps`
  - 返回 `length=6` 的数组
  - 前 `6` 项都形如 `{ key, value }`
- `_$clt`
  - 返回长字符串
  - 当前样本长度约 `728`
- `_$ms`
  - 返回对象
  - 关键键为：
    - `_stk`
    - `_ste`
    - `h5st`
- `_$sdnmd`
  - 返回对象
  - 形状接近“原请求参数 + `_ms` 的返回字段”

这说明后续做 `_$cps / _$clt / _$ms / _$sdnmd` 的源码级 stub 已经具备基本安全性。

### 22. 直接 stub `_$ms` 后，异常在当前样本中完全消失

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-ms
```

结果文件：

- [sync-stall-thread-20260307_163658.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_163658.json)

关键结果：

- `10` 轮里 `0` 次同步停顿
- `avgReqPerSec=284.01`
- `avgP99=58ms`
- `maxTaskMs=75ms`

结论：

- `_$ms` 及其下游已经是当前最强的同步主链嫌疑点
- 与此前 baseline 相比，吞吐显著提升
- 这说明真正重的同步工作，已经非常靠近 `signSync` 主链后半段

### 23. 直接 stub `_$sdnmd` 后，异常同样完全消失

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-sdnmd
```

结果文件：

- [sync-stall-thread-20260307_163726.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_163726.json)

关键结果：

- `10` 轮里 `0` 次同步停顿
- `avgReqPerSec=360.55`
- `avgP99=45.9ms`
- `maxTaskMs=63ms`

结论：

- `signSync -> _$sdnmd` 后半段的确承载了主要同步压力
- 但这组结果本身只是上界确认
- 真正更有信息量的是：`stub _$ms` 已经足以把异常压掉，因此下一轮应优先细分 `_$ms`

### 24. 只 stub `_$cps` 不够，异常仍会复现

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps
```

结果文件：

- [sync-stall-thread-20260307_163801.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_163801.json)

关键结果：

- `10` 轮里仍出现 `1` 次同步停顿
  - `runIndex=3`
  - `5` 个 worker 同步受影响
  - spread `9ms`
  - `maxTaskMs=3016ms`

阶段归因：

- 多数慢任务仍直接落在 `targetScriptMs ~2.97s ~ 3.01s`
- 也有样本落在 `postTaskCleanupMs ~2.94s`

结论：

- `_$cps` 本身不是唯一根因
- 但它可能是 `_$ms` 内部的一部分负担
- 只把参数整理逻辑简化掉，不足以消除同步停顿

### 25. 只 stub `_$clt` 时，复现概率下降，但仍不足以完全消除

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-clt
```

结果文件：

- [sync-stall-thread-20260307_163941.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_163941.json)

关键结果：

- `20` 轮里出现 `1` 次同步停顿
  - `runIndex=15`
  - `12` 个 worker 同步受影响
  - spread `74ms`
  - `maxTaskMs=3048ms`
- 但整体吞吐明显提升：
  - `avgReqPerSec=207.05`
  - `avgP99=227.15ms`

结论：

- `_$clt` 是强负担区
- 单独把它替换成固定串，确实会明显减轻总体成本
- 但它仍不是唯一解释

### 26. `_$cps + _$clt` 组合对照，在当前样本中可将异常压到 `0/10`

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-clt
```

结果文件：

- [sync-stall-thread-20260307_164028.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_164028.json)

关键结果：

- `10` 轮里 `0` 次同步停顿
- `avgReqPerSec=210.39`
- `avgP99=81.4ms`
- `maxTaskMs=108ms`

结论：

- 当前最合理的收敛范围已经落到 `_$ms`
- 而且更像是：
  - `_$cps` 负责的一段参数整理
  - `_$clt` 负责的一段长串生成/编码
  - 两块叠加后共同构成高风险同步压力
- 单独拿掉其中一块都不够稳定
- 两块同时拿掉后，当前样本中可以把异常压掉

### 27. `_$gdk` 单独 stub 不仅无效，反而把整体表现拉差

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-gdk
```

结果文件：

- [sync-stall-thread-20260307_164756.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_164756.json)

关键结果：

- `10` 轮里仍出现 `1` 次同步停顿
  - `runIndex=1`
  - `12` 个 worker 同步受影响
  - spread `121ms`
  - `maxTaskMs=3082ms`
- 整体吞吐明显劣化：
  - `avgReqPerSec=119.7`
  - `avgP99=496ms`

结论：

- `_$gdk` 不是当前最值得优先追的同步热点
- 单独改写它并没有把异常压掉，反而破坏了正常路径表现
- 这类 `64` 位摘要函数更适合暂时降级处理，不再作为主方向继续细分

### 28. `_$atm + _$gs + _$gsd` 组合 stub 同样无效

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-atm --stub-paramsign-gs --stub-paramsign-gsd
```

结果文件：

- [sync-stall-thread-20260307_164755.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_164755.json)

关键结果：

- `10` 轮里仍出现 `1` 次同步停顿
  - `runIndex=1`
  - `12` 个 worker 同步受影响
  - spread `124ms`
  - `maxTaskMs=3079ms`
- 整体吞吐同样很差：
  - `avgReqPerSec=121.52`
  - `avgP99=485.4ms`

结论：

- `_$atm / _$gs / _$gsd` 这一支也不是当前主因
- 继续在“64 位摘要函数”上细分，信息收益已经明显变低
- 当前主方向仍应维持在 `_$ms` 中的：
  - `_$cps`
  - `_$clt`
  - 以及二者之外的剩余拼装逻辑

### 29. 只把 `_$clt` 的单个 helper 简化掉仍然不够

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --disable-paramsign-rgo --stub-paramsign-cps --stub-paramsign-pv
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --disable-paramsign-rgo --stub-paramsign-cps --stub-paramsign-ws
```

结果文件：

- [sync-stall-thread-20260307_165315.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_165315.json)
- [sync-stall-thread-20260307_165317.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_165317.json)

关键结果：

- `disable-rgo + cps + pv`
  - `10` 轮里仍有 `1` 次同步停顿
  - `avgReqPerSec=117.69`
- `disable-rgo + cps + ws`
  - `10` 轮里仍有 `2` 次同步停顿
  - `avgReqPerSec=109.09`

结论：

- 只把 `_$clt` 的“环境采集”或“序列化”某一侧单独简化，都还不够
- 这说明 `_$clt` 的高风险负担不是单点，而更像一整条 helper 链的组合

### 30. `_$cps + _$clt helper 链` 一起简化后，在当前样本中可稳定压到 `0/10`

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-pv --stub-paramsign-ws --stub-paramsign-encode-chain
```

结果文件：

- [sync-stall-thread-20260307_165556.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_165556.json)

关键结果：

- `10` 轮里 `0` 次同步停顿
- `avgReqPerSec=205.22`
- `avgP99=82.3ms`
- `maxTaskMs=97ms`

这个对照里：

- `_$cps` 被 shape-preserving stub 掉
- `_$clt` 没有整体替换成固定串
- 但它依赖的几段 helper 被一起简化：
  - `_$pv`
  - `_$ws`
  - `Utf8.parse / Base64.encode`

结论：

- 当前最强嫌疑已经可以进一步写得更具体：
  - 问题集中在 `_$ms`
  - 而且更像是 `_$cps + _$clt helper 链` 的组合压力
- 不需要整体把 `_$clt` 替成固定值，单靠把它的关键 helper 链一起简化，就足以把异常压掉
- 这比“直接 stub 整个 `_$clt`”更接近真实根因

### 31. `disable-rgo` 在这组 helper 链对照里已经不是必要条件

对照结果：

- [sync-stall-thread-20260307_165519.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_165519.json)
  - `disable-rgo + cps + pv + ws + encode-chain`
  - `0/10`
- [sync-stall-thread-20260307_165556.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_165556.json)
  - `cps + pv + ws + encode-chain`
  - `0/10`

结论：

- 当 `_$cps` 与 `_$clt helper 链` 已经被一起简化后，是否禁用 `_$rgo` 对结果已经不再关键
- 这进一步说明：
  - `ParamsSign` 异步初始化链不是这一步的必要条件
  - 当前真正应优先关注的，仍是 `signSync -> _$sdnmd -> _$ms`

### 32. 在当前已测子集里，`pv` 不是必要项，`ws + encode-chain` 更像关键组合

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-pv --stub-paramsign-encode-chain
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws --stub-paramsign-encode-chain
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-pv --stub-paramsign-ws
```

结果文件：

- [sync-stall-thread-20260307_165824.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_165824.json)
- [sync-stall-thread-20260307_165854.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_165854.json)
- [sync-stall-thread-20260307_165937.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_165937.json)

关键结果：

- `cps + pv + encode-chain`
  - `10` 轮里仍有 `1` 次同步停顿
  - `runIndex=10`
  - `11` 个 worker 同步受影响
  - spread `49ms`
- `cps + ws + encode-chain`
  - `10` 轮里 `0` 次同步停顿
  - `avgReqPerSec=195.04`
  - `avgP99=91.1ms`
- `cps + pv + ws`
  - `10` 轮里仍有 `1` 次同步停顿
  - `runIndex=9`
  - `12` 个 worker 同步受影响
  - spread `50ms`

结论：

- 在当前已经覆盖的 helper 子集里：
  - `pv` 不是必要项
  - `ws` 和 `encode-chain` 的组合更像关键项
- 换句话说：
  - 少了 `ws`，仍会复现
  - 少了 `encode-chain`，仍会复现
  - `ws + encode-chain` 一起简化后，当前样本可以压到 `0/10`
- 因此 `_$clt helper 链` 的优先级已经可以进一步收窄到：
  - `_$ws`
  - `Utf8.parse / Base64.encode`

### 33. 独立贡献对照显示：`ws` 比 `encode-chain` 更强，但单独仍不足以稳定消除异常

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-encode-chain
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws
```

结果文件：

- [sync-stall-thread-20260307_170301.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_170301.json)
- [sync-stall-thread-20260307_170341.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_170341.json)
- [sync-stall-thread-20260307_170447.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_170447.json)

关键结果：

- `cps + ws`
  - `10` 轮里 `0` 次同步停顿
  - `avgReqPerSec=196.91`
  - `avgP99=87.2ms`
- `cps + encode-chain`
  - `10` 轮里仍有 `1` 次同步停顿
  - `runIndex=10`
  - `8` 个 worker 同步受影响
  - spread `34ms`
- `cps + ws` 扩样本到 `20` 轮后
  - 仍出现 `1` 次同步停顿
  - `runIndex=7`
  - `12` 个 worker 同步受影响
  - spread `43ms`

结论：

- `_$ws` 的影响强于 `Utf8.parse / Base64.encode`
- 但单独简化 `_$ws` 仍不足以稳定消除异常
- 更准确的表述应为：
  - `_$ws` 是当前 helper 链里更强的关键项
  - `Utf8.parse / Base64.encode` 仍然是辅助必要项之一
  - 当前已测最小有效组合仍然是：
    - `_$cps + _$ws + Utf8.parse / Base64.encode`

### 34. 拆开 `_$ws` 后发现：`JSON.stringify` 本体和 `_$wc/_$O` dispatch 都会单独放大风险，但各自都不是单独必要条件

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-json-stringify
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 10 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-dispatch
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-json-stringify
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-dispatch
```

结果文件：

- [sync-stall-thread-20260307_172102.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_172102.json)
- [sync-stall-thread-20260307_172133.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_172133.json)
- [sync-stall-thread-20260307_172245.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_172245.json)
- [sync-stall-thread-20260307_172345.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_172345.json)

关键结果：

- `cps + json-stringify`
  - `10` 轮里 `0` 次同步停顿
  - `avgReqPerSec=185.34`
  - `avgP99=95.4ms`
- `cps + ws-dispatch`
  - `10` 轮里 `0` 次同步停顿
  - `avgReqPerSec=189.42`
  - `avgP99=93.5ms`
- `cps + json-stringify` 扩样本到 `20` 轮后
  - 仍出现 `1` 次同步停顿
  - `runIndex=19`
  - `11` 个 worker 同步受影响
  - spread `51ms`
  - 最大任务耗时 `4394ms`
- `cps + ws-dispatch` 扩样本到 `20` 轮后
  - 仍出现 `1` 次同步停顿
  - `runIndex=9`
  - `12` 个 worker 同步受影响
  - spread `8ms`
  - 最大任务耗时 `2979ms`

结论：

- `_$ws` 不能再被当成单点看待
- 在当前样本里：
  - 只压平 `JSON.stringify` 本体，不够
  - 只绕过 `_$wc/_$O` dispatch，不够
- 更准确的描述应为：
  - `JSON.stringify` 本体和 `_$wc/_$O` dispatch 都是 `_$ws` 内部的高风险放大器
  - 但两者各自都不是单独必要条件
  - 当前已测最小有效组合仍然是：
    - `_$cps + _$ws + Utf8.parse / Base64.encode`

### 35. `_$ws` 再细分后，`apply(arguments)` 比“对象大/深”更像当前主嫌疑

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-direct-call
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-direct-call --stub-paramsign-encode-chain
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-shallow-arg
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-shallow-arg --stub-paramsign-encode-chain
```

结果文件：

- [sync-stall-thread-20260307_172934.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_172934.json)
- [sync-stall-thread-20260307_173038.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_173038.json)
- [sync-stall-thread-20260307_173147.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_173147.json)
- [sync-stall-thread-20260307_173247.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_173247.json)

关键结果：

- `cps + ws-direct-call`
  - `20` 轮里 `0` 次同步停顿
  - `avgReqPerSec=191.75`
  - `avgP99=91.15ms`
- `cps + ws-direct-call + encode-chain`
  - `20` 轮里仍有 `2` 次同步停顿
  - `runIndex=6/19`
  - `12` 个 worker 同步受影响
  - spread `52ms / 36ms`
- `cps + ws-shallow-arg`
  - `20` 轮里仍有 `2` 次同步停顿
  - `runIndex=7/20`
  - `12 / 10` 个 worker 同步受影响
  - spread `51ms / 58ms`
- `cps + ws-shallow-arg + encode-chain`
  - `20` 轮里 `0` 次同步停顿
  - `avgReqPerSec=189.79`
  - `avgP99=93.4ms`

结论：

- 当前 `_$ws` 内部最强的新信号不是“对象太大/太深”本身
- 更像是：
  - 去掉 `apply(arguments)` 这条调用方式后，当前样本可压到 `0/20`
  - 单独把输入对象压成浅层摘要，仍然不够
  - 但“浅层摘要 + encode-chain 简化”这组组合又能压到 `0/20`
- 这说明：
  - `_$ws` 内部存在比“对象形状”更强的调用方式风险
  - 同时对象形状 / 分配压力仍会和 `Utf8.parse / Base64.encode` 形成组合效应

### 36. `direct-fullargs` 对照说明：附加参数不是主嫌疑，`encode-chain` 组合才会把风险重新放大

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-direct-fullargs
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-direct-fullargs --stub-paramsign-encode-chain
```

结果文件：

- [sync-stall-thread-20260307_173507.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_173507.json)
- [sync-stall-thread-20260307_173721.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_173721.json)

关键结果：

- `cps + ws-direct-fullargs`
  - `20` 轮里 `0` 次同步停顿
  - `avgReqPerSec=191.78`
  - `avgP99=91.15ms`
- `cps + ws-direct-fullargs + encode-chain`
  - `20` 轮里仍有 `1` 次同步停顿
  - `runIndex=5`
  - `12` 个 worker 同步受影响
  - spread `49ms`
  - `avgReqPerSec=186.31`
  - `avgP99=237.4ms`

结论：

- `JSON.stringify(_$pa, _$py, _$pu)` 直接调用也能稳定压到当前样本 `0/20`
- 因此：
  - `replacer / space` 这两个附加参数本身不是当前主嫌疑
  - `JSON.stringify` 本体也不再像最强单点
  - 当前更集中的嫌疑是：
    - `apply(arguments)`
    - `arguments` 对象物化
    - 以及它们和 `_$wc/_$O` 泛型调用路径的组合开销
- 同时：
  - 一旦配上 `encode-chain` 改写，`direct-fullargs` 也会重新漏出同步停顿
  - 这与 `ws-direct-call + encode-chain` 的表现一致
  - 说明 `encode-chain` 与 `_$ws` 调用方式之间确实存在组合效应，而不是 `replacer / space` 这两个参数单独在作怪

### 37. 把 `apply(arguments)` 再拆成 `apply` 和 `arguments` 后，当前更像是“native apply 更重，arguments 继续放大”

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-apply-array
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-generic-array
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-apply-array --stub-paramsign-encode-chain
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30 --stub-paramsign-cps --stub-paramsign-ws-generic-array --stub-paramsign-encode-chain
```

结果文件：

- [sync-stall-thread-20260307_175038.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_175038.json)
- [sync-stall-thread-20260307_175143.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_175143.json)
- [sync-stall-thread-20260307_175241.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_175241.json)
- [sync-stall-thread-20260307_175346.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_175346.json)

关键结果：

- `cps + ws-apply-array`
  - `20` 轮里仍有 `1` 次同步停顿
  - `runIndex=17`
  - `12` 个 worker 同步受影响
  - spread `42ms`
  - `avgReqPerSec=182.12`
  - `avgP99=239.65ms`
- `cps + ws-generic-array`
  - `20` 轮里 `0` 次同步停顿
  - `avgReqPerSec=188.87`
  - `avgP99=92.1ms`
- `cps + ws-apply-array + encode-chain`
  - `20` 轮里仍有 `1` 次同步停顿
  - `runIndex=10`
  - `11` 个 worker 同步受影响
  - spread `67ms`
  - `avgReqPerSec=184.23`
  - `avgP99=236.15ms`
- `cps + ws-generic-array + encode-chain`
  - `20` 轮里仍有 `1` 次同步停顿
  - `runIndex=19`
  - `12` 个 worker 同步受影响
  - spread `36ms`
  - `avgReqPerSec=181.67`
  - `avgP99=308.7ms`

结论：

- 去掉 `arguments` 对象后，风险会明显下降，但不会自动归零
- 在不改 `encode-chain` 的样本里：
  - `native apply + array` 仍会复现
  - `_$wc/_$O + array` 已可压到当前样本 `0/20`
- 这说明当前更准确的排序应为：
  - `arguments` 对象物化是强放大器
  - `native Function.prototype.apply` 本身也是高风险项
  - `_$wc/_$O` 泛型调用路径单独看反而不像最强主因
- 一旦叠上 `encode-chain`：
  - `generic-array` 也会重新漏出异常
  - 说明 `_$wc/_$O` 不是完全无关，而是更像次一级放大器
  - 当前更像是 `apply / arguments / encode-chain` 三者存在组合效应

### 38. runtime 侧先行确认时发现：`ThreadPool + inspector` 本身就会稳定触发 native `SIGSEGV`

执行命令：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 1 --concurrency 1 --repeats 1 --warmup 1 --total 4 --sample-every 2 --enable-vm-inspector
node benchmarks/investigate-sync-stall.js --backend process --pool 2 --concurrency 2 --repeats 1 --warmup 1 --total 4 --sample-every 2 --enable-vm-inspector
node --experimental-websocket benchmarks/investigate-sync-stall.js --backend process --pool 2 --concurrency 2 --repeats 1 --warmup 1 --total 8 --sample-every 4 --enable-vm-inspector --capture-vm-cpu-profile-on-stall
```

补充对照：

- `thread 2/2 + enable-vm-inspector`
- `thread 2/2 + enable-vm-inspector + capture-vm-cpu-profile-on-stall`

关键结果：

- `thread 1/1 + enable-vm-inspector`
  - 进程直接 `SIGSEGV`
  - shell 退出码 `139`
  - 无 benchmark JSON 输出
- `thread 2/2 + enable-vm-inspector`
  - 同样直接 `SIGSEGV`
  - shell 退出码 `139`
- `thread 2/2 + enable-vm-inspector + capture-vm-cpu-profile-on-stall`
  - 同样直接 `SIGSEGV`
  - shell 退出码 `139`
- `process 2/2 + enable-vm-inspector`
  - 正常完成
  - 结果文件：[sync-stall-process-20260307_182154.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-process-20260307_182154.json)
- `process 2/2 + enable-vm-inspector + capture-vm-cpu-profile-on-stall`
  - 也能正常完成
  - 结果文件：[sync-stall-process-20260307_182239.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-process-20260307_182239.json)

结论：

- 当前无法直接在 `ThreadPool` 复现样本上用 leap-vm inspector / CDP 去采样异常窗口
- 阻塞点不是“CDP client 没接好”，而是：
  - `worker_threads` 场景下，只要在 thread worker 内启 inspector，进程就会稳定 native 崩溃
  - 这个问题甚至不依赖高并发，也不依赖 `Profiler.start`
- 因此：
  - “异常窗口到底卡在哪里”的 inspector 路线目前被一个更底层的 runtime 缺陷拦住了
  - 这本身已经是一个强 runtime 侧证据
- 反过来看：
  - `ProcessPool + inspector (+ profiler attach)` 正常，说明外部 CDP/profiler 接入路径本身没有问题
  - 当前真正异常的是 `ThreadPool / worker_threads + leap-vm inspector` 组合

## 当前判断

截至本记录，更合理的判断是：

1. 该问题更具体地与 `worker_threads` 同进程多 isolate + 过量并发压载更相关
2. 它不是 `code cache`、`heartbeat`、普通宿主 API、`MessageChannel` 单一路径、`js-security-v3-rac.js` 外链脚本加载、canvas 指纹分支、或 cookie 读取单独导致
3. `thread 12/12` 与 `thread 1/1` 在当前样本中都没有复现，说明“多 worker”本身还不够，触发还需要额外压载
4. `process 12/48` 在同样压载形态下不复现，说明问题并不是“高并发本身”导致，而更像是 `ThreadPool` / `worker_threads` 特有现象
5. 在当前样本中，`pool=12` 时的高风险起点已经逼近 `concurrency=16`，说明这更像“接近某个压载阈值后触发”的现象
6. `h5st.js` 的若干业务态缓存键会改变脚本走哪条路径，但路径切换本身不能消除同步停顿
7. `ParamsSign` 异步初始化链不是必要条件；截至当前样本，它更像“会影响复现概率的放大器”
8. `_$pv` 环境采集器本身仍然是高风险区，但已不足以单独解释全部同步停顿
9. “异步初始化链 + _$pv” 的组合对照在当前样本中能够把异常压到 `0/20`，但这更像是“同时移除了两块高风险放大器”，还不能据此认定根因只在这两块
10. `signSync -> _$sdnmd` 的主要同步压力已经进一步收敛到 `_$ms`
11. `_$ms` 内部当前最可疑的两块是：
   - `_$cps`
   - `_$clt`
12. 其中：
   - 单独去掉 `_$cps` 不够
   - 单独去掉 `_$clt` 也不够稳定
   - 同时去掉 `_$cps + _$clt` 后，当前样本可压到 `0/10`
13. `_$gdk / _$atm / _$gs / _$gsd` 这类 `64` 位摘要函数当前不是最优先方向
14. `_$clt` 内部也已经可以进一步收敛为 helper 链组合：
   - `_$ws`
   - `Utf8.parse / Base64.encode`
15. `_$ws` 内部目前又能继续拆成三层高风险子路径：
   - `JSON.stringify` 本体
   - `_$wc / _$O` dispatch
   - `apply(arguments)` / `arguments` 对象物化
16. 在当前已测子集里，`_$pv` 已经不是必要项
17. 在 `_$clt helper` 中，`_$ws` 比 `Utf8.parse / Base64.encode` 更像强关键项，而 `_$ws` 内部当前最强的新嫌疑已经从“纯 `JSON.stringify` 本体”继续收敛到：
   - `arguments` 对象物化
   - `native Function.prototype.apply`
   - `_$wc / _$O` 泛型调用路径
18. 其中按当前样本强度看：
   - `arguments` 是最强放大器之一
   - `native apply` 比 `_$wc / _$O` 更像主风险项
   - `_$wc / _$O` 更像次一级组合放大器
19. `JSON.stringify` 的输入对象形状 / 分配压力仍有贡献，但它更像组合放大器：
   - 单独把输入压成浅层摘要，不够
   - 配合 `Utf8.parse / Base64.encode` 简化后，可压到当前样本 `0/20`
20. `replacer / space` 这两个附加参数本身不是当前主嫌疑；更像是 `_$ws` 调用方式与 `encode-chain` 的组合在放大风险
21. `ThreadPool + leap-vm inspector` 曾存在独立 native 崩溃缺陷，但已确认不是当前 runtime 观察的长期 blocker：
   - 历史症状是 `thread 1/1`、`thread 2/2`、`thread 2/2 + profiler attach` 都会稳定 `SIGSEGV`
   - `gdb` 回溯已把崩溃链收敛到 `us_internal_loop_unlink -> us_socket_context_free -> uWS::TemplatedApp::~TemplatedApp -> leapvm::WsInspectorServer::Stop -> LeapInspectorClient::Shutdown`
   - 当前更像是 `WsInspectorServer` 在宿主线程销毁 `UwsApp`，踩到了 uWebSockets 的关闭线程亲和性
   - 把 `UwsApp` 的析构收回 IO 线程后，`thread 1/1`、`thread 2/2`、`thread 2/2 + profiler attach` 都已恢复正常
22. 在 inspector blocker 解开后，`ThreadPool 12/48 + profiler` 已经抓到一次真实异常窗口：
   - 结果文件：[sync-stall-thread-20260307_183252.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_183252.json)
   - `runIndex=4` 出现 `12/12` worker、约 `3s` 同步停顿，spread `60ms`
   - 宿主侧 `eventLoopDelay` 仍在 `~19-28ms`，该轮 `gc=[]`，没有出现“主线程事件循环卡死”或“宿主 GC 明显冲高”的证据
   - 已成功保留 `8` 个停顿 worker 的 CPU profile 摘要；其余 `4` 个 worker 在 `Profiler.stop` 返回 `No recording profiles found`
23. 当前 runtime 侧的新证据更支持：
   - 异常窗口并不是先卡在宿主主线程 event loop
   - 热点一致落在 `h5st.js` 内部同步路径，当前最集中的函数是：
     - `_$u`（[h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L689)）
     - `a0a1b0cv`（[h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L682)）
     - `encode`（[h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L9508)）
     - `_seData1`（[h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L7404)）
     - `_$pz._$clt`（[h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L15175)）
   - 因而当前更像是 `h5st.js` 在 `_$ms` 内部的 `_$cps + (_$ws[arguments + native apply + _$wc/_$O + object-shape] + Utf8.parse / Base64.encode)` 与 `ThreadPool` 压载阈值共同触发了统一停顿，而不是单纯宿主线程卡死

## 下一步建议

优先级建议如下：

1. 固定在最容易复现的触发模型上继续二分
   - 建议先固定 `ThreadPool + pool=12 + concurrency=48`
   - 不要再把主样本切回 `12/12` 或 `ProcessPool`

2. 优先做 `signSync -> _$sdnmd` 路径二分
   - 分段短路或替换内部阶段
   - 找出“保留哪一段就会复现”
   - 现阶段已经可以把优先级进一步收窄到 `_$ms`
   - 不需要再优先切整个 `_$sdnmd`

3. 优先细分 `_$ms` 自身剩余逻辑
   - 当前建议顺序：
     - 保留 `_$cps`，继续细分 `_$clt helper 链`
     - 不再把 `_$ws` 当成单点，而是优先细分：
       - `arguments` 对象物化
       - `native apply`
       - `_$wc / _$O` 泛型 dispatch 路径
       - 然后才是 `JSON.stringify` 输入对象形状 / 分配压力
     - `Utf8.parse / Base64.encode` 继续保留为组合对照项
     - `_$pv` 暂时可降级
   - 暂时不要再优先切 `_$gdk / _$atm / _$gs / _$gsd`

4. 把 `_$pv / _$ram / _$rgo` 退到“次优先级细分”
   - `_$pv` 仍值得继续细分
   - 但它更适合当作“放大器模块”看待
   - 不应再默认把它当成唯一主路径

5. 做触发阈值对照
   - 固定 `pool=12`
   - 优先扩大 `concurrency=15 / 16` 的样本量
   - 必要时补 `13 / 14 / 17 / 18`
   - 对照不同 `maxTasksPerWorker`
   - 看问题是“越过阈值后突然出现”，还是“阈值附近先有吞吐抖动再进入同步停顿”

6. 如继续走方法级 trace，先解决“脚本内时间伪造”问题
   - 当前 `paramSignMethodTrace` 已接线完成
   - 但 `Date.now / getTime` 被脚本重写，导致方法级 `ms` 统计全部为 `0`
   - 若要继续走这条路，需要引入 VM 外部单调时钟

7. runtime 侧已可以直接继续采样 `ThreadPool`
   - `ThreadPool + inspector` 的关闭崩溃已通过调整 `WsInspectorServer` 销毁线程修通
   - 当前不需要再绕回 `ProcessPool` 做 profiler 管线验证

8. runtime 侧下一步优先把异常窗口里的热点再压实
   - 继续固定 `ThreadPool + pool=12 + concurrency=48 + capture-vm-cpu-profile-on-stall`
   - 重点观察 `_$u / a0a1b0cv / encode / _seData1 / _$clt`
   - 同时排查为什么 `12` 个停顿 worker 里会有 `4` 个在 `Profiler.stop` 返回 `No recording profiles found`

## 建议作为下一轮对话起点的最短结论

可以直接承接下面这句继续：

> `ThreadPool` 的偶发吞吐塌陷已经进一步确认依赖 `worker_threads` 同进程多 worker + 压载阈值：`thread 12/48` 可复现，`thread 12/12`、`thread 1/1`、`process 12/48` 均未复现，而且在当前样本里 `pool=12` 的高风险起点已经逼近 `concurrency=16`；源码侧的主嫌疑已经从“泛化的 `ParamsSign` 初始化链”进一步收缩到 `signSync -> _$sdnmd -> _$ms`，其中 `_$cps + _$clt` 组合是当前最强的同步高风险区。

### 39. `ThreadPool + inspector` 关闭崩溃已修通，并首次拿到真实异常窗口的 `vmCpuProfiles`

为确认“异常窗口到底卡在哪里”，这轮先处理了上一节暴露的 inspector blocker。

先用 `gdb` 复核 `thread 1/1 + enable-vm-inspector` 的崩溃链，关键回溯收敛到：

- `us_internal_loop_unlink`
- `us_socket_context_free`
- `uWS::TemplatedApp<false>::~TemplatedApp()`
- `leapvm::WsInspectorServer::Stop()`
- `leapvm::LeapInspectorClient::Shutdown(...)`

这说明先前的 `SIGSEGV` 不在签名逻辑主链，而更像是 uWebSockets teardown 的线程亲和性问题。对照源码后，`WsInspectorServer::Stop()` 之前是在宿主线程 `join()` 后再 `delete UwsApp`；而 `UwsApp` 实例本身是在 inspector IO 线程里创建并运行的。

因此本轮改成：

- `UwsApp` 仍由 IO 线程创建
- `Stop()` 只负责 `loop->defer(app->close()) + join`
- `UwsApp` 的真正析构移回 IO 线程，在 `app->run()` 返回后完成
- `app_` 改为原子指针，避免跨线程读写悬空指针

修补后的最小回归：

- `thread 1/1 + enable-vm-inspector`
  - 正常完成
  - 结果文件：[sync-stall-thread-20260307_183119.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_183119.json)
- `thread 2/2 + enable-vm-inspector`
  - 正常完成
  - 结果文件：[sync-stall-thread-20260307_183133.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_183133.json)
- `thread 2/2 + enable-vm-inspector + capture-vm-cpu-profile-on-stall`
  - 也能正常完成
  - 结果文件：[sync-stall-thread-20260307_183134.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_183134.json)

在 blocker 清除后，重新跑真实样本：

- `thread 12/48 + enable-vm-inspector + capture-vm-cpu-profile-on-stall`
  - 结果文件：[sync-stall-thread-20260307_183252.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_183252.json)
  - `runIndex=4` 复现 `12/12` worker 同步停顿
  - `workerCount=12`
  - `spreadMs=60`
  - 最慢任务约 `2995ms`

这次 runtime 侧最关键的新证据是：

- 宿主主线程没有明显一起卡死：
  - 该异常轮 `eventLoopDelay.maxMs=28.082`
  - `gc=[]`
- 已保留到 `8` 个停顿 worker 的 CPU profile 摘要
- 汇总热点一致指向 `h5st.js` 内部同步路径，而不是 Node 宿主侧：
  - `_$u` / `a0a1b0cv`
  - `encode`
  - `_seData1`
  - `_$pz._$clt`
- 其中聚合命中数最高的几项大致为：
  - `(program)`：`5742`
  - `_$u`：`2932`
  - `a0a1b0cv`：`2529`
  - `(garbage collector)`：`1019`
  - `encode`：`993`
  - `_seData1`：`848`
  - `_$pz._$clt`：`355`

当前结论更新为：

- “直接用 inspector 观察 ThreadPool 异常窗口”这条路已经打通
- 异常窗口没有先表现成宿主 event loop 或宿主 GC 的同步大停顿
- 当前最强的新证据是：停顿窗口内，各 worker 的 CPU 时间集中落在 `h5st.js` 的同步热路径，尤其是 `_$u / a0a1b0cv / encode / _seData1 / _$clt`
- 这与前面源码二分收敛到 `signSync -> _$sdnmd -> _$ms -> _$cps + _$clt` 是一致的

仍需补充确认的点：

- 为什么 `12` 个停顿 worker 里只有 `8` 个留下有效 `Profiler.stop` 结果，另 `4` 个返回 `No recording profiles found`
- `_$u / a0a1b0cv` 这组热点与前面 `arguments / native apply / encode-chain` 的关系，还需要继续做最小化和热路径映射

### 40. 热点函数与既有二分结果已能对上：`a0a1b0cv/_$u` 是全局解码器，`_$clt` 内部确实直接串着 `_$ws + Utf8.parse + Base64.encode`

这一轮没有再先扩 JS 二分，而是先把前一节 profiler 里的热点函数和源码里的真实职责逐个对上。

先看 profiler 里命中最高的 `a0a1b0cv / _$u`：

- `a0a1b0cv` 定义在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L682)
- 其内部的 `_$u` 定义在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L689)
- 这段逻辑本质上是全局字符串表解码器 / Base64 风格解码器
- `pW = a0a1b0cv` 的别名关系在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L1196)

因此：

- `a0a1b0cv / _$u` 很热，说明 JSVMP/混淆壳本身在大量解码字符串
- 但它更像“全局通用开销”，不能直接当成“唯一根因函数”

再看前面已经通过 rewrite 验证过的 `_$clt helper`：

- `_$ws` 定义在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L5379)
- 它的原始实现就是：
  - `return _$wc(_$wE.JSON.stringify, null, arguments);`
- `Utf8.parse` 的导出别名是 `_$Oc`，定义在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L9731)
- `Base64.encode` 的导出别名是 `_$OQ`，定义在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L9727)

关键是：在 `_$clt` 的 VM 循环里，源码已经能直接看到它把这三段 helper 都压进了执行栈：

- `a.push(_$ws);` 在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L15235)
- `a.push(_$OQ);` 在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L15255)
- `a.push(_$Oc);` 在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L15274)

这和前面 benchmark 二分得出的最小高风险组合是完全一致的：

- `_$clt helper` 里，当前最小有效组合仍然是
  - `_$ws + Utf8.parse + Base64.encode`
- 而 `_$ws` 的主风险又已经收敛到
  - `arguments`
  - `native apply`
  - `_$wc / _$O`

另外，profiler 里的 `_seData1` 也已经能定位职责：

- `_seData1` 定义在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L7404)
- 它是 CryptoJS `Hasher` 内核的一部分
- `SHA256` helper 在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L10013) 导出
- 当前 benchmark 脚本尾部还显式执行了：
  - `body: window.SHA256(JSON.stringify(params))`
  - 位置在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L15505)

因此 `_seData1` 这个热点不能直接理解成：

- “它一定来自 `signSync -> _$clt`”

更准确地说，它至少包含两部分来源：

- 任务入口处对 `body` 做的 `SHA256(JSON.stringify(params))`
- 以及脚本内部其它走到 CryptoJS Hasher 的路径

为确认 `_seData1 / body SHA256` 是否是同步停顿的必要项，这轮补了一个新的 benchmark rewrite：

- 新开关：`--stub-input-body-sha256`
- 代码位置：[investigate-sync-stall.js](/home/hostxxii/LeapWorkSpace/benchmarks/investigate-sync-stall.js)
- 行为：把
  - `body: window.SHA256(JSON.stringify(params))`
  - 改写成
  - `body: "stub_body_sha256"`

实际对照结果：

- `thread 12/48 + --stub-input-body-sha256`
  - 结果文件：[sync-stall-thread-20260307_191151.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_191151.json)
  - 仍然 `1/10` 复现
  - `runIndex=8`
  - `11` 个 worker
  - 约 `2s` 同步停顿
  - `spreadMs=51`
- `thread 12/48 + --stub-input-body-sha256 + profiler`
  - 结果文件：[sync-stall-thread-20260307_191250.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_191250.json)
  - 这一组 `0/10`
  - 只能说明“小样本里未再抓到”，不能当成“已消除”

这一轮最重要的结论是：

1. `a0a1b0cv / _$u` 已确认更像全局字符串解码器，不宜直接当作根因函数
2. `_$clt` 内部已经能从源码上直接确认：
   - 它确实串着 `_$ws + Utf8.parse + Base64.encode`
3. `_seData1` 对应的是 CryptoJS Hasher 内核，而 benchmark 当前样本又把 `body SHA256` 也算进了每次任务
4. 但即便把任务入口 `body SHA256` 直接 stub 掉，异常仍可复现
5. 所以：
   - `_seData1 / body SHA256` 不是当前同步停顿的必要条件
   - 它更像“额外同步压力 / 放大器”
   - 当前主线仍应回到 `signSync -> _$sdnmd -> _$ms -> _$cps + _$clt`
   - 而 `_$clt` 主线里最该继续盯的仍是 `_$ws + Utf8.parse + Base64.encode`

### 41. `apply-family` 路径已经可以单独坐实：不只是 `fn.apply(...)`，`Reflect.apply` / `Function.prototype.apply.call` 都会把同步停顿重新带回来

上一轮已经收敛出：

- `cps + ws-apply-array` 仍会复现
- `cps + ws-generic-array` 在当时样本里能压到 `0/20`

但 `_$O / _$wc` 的真实实现这轮已经补上了源码确认：

- `_$O` 定义在 [h5st.js](/home/hostxxii/LeapWorkSpace/work/h5st.js#L1940)
- 它优先走：
  - `Reflect.apply`
- 没有 `Reflect.apply` 时才退回：
  - `Function.prototype.apply` / `call` 组合

因此这轮新增了两组更窄的 rewrite：

- `--stub-paramsign-ws-reflect-array`
  - 强制改成 `Reflect.apply(JSON.stringify, ctx, array)`
- `--stub-paramsign-ws-fn-apply-call-array`
  - 强制改成 `Function.prototype.apply.call(JSON.stringify, ctx, array)`

两组实际结果如下：

- `thread 12/48 + cps + ws-reflect-array`
  - 结果文件：[sync-stall-thread-20260307_191854.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_191854.json)
  - `3/20` 复现
  - 复现轮次：`runIndex=3 / 12 / 17`
  - 都是 `12/12` worker 同步停顿
  - `spreadMs` 分别约为 `94 / 168 / 240`
- `thread 12/48 + cps + ws-fn-apply-call-array`
  - 结果文件：[sync-stall-thread-20260307_192047.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_192047.json)
  - `2/20` 复现
  - 复现轮次：`runIndex=6 / 15`
  - 分别出现 `12/12` 和 `11/12` worker 同步停顿
  - `spreadMs` 分别约为 `71 / 53`

这组对照的意义很直接：

1. 问题已经不能再表述成“只有 `fn.apply(...)` 这个 JS 语法糖危险”
2. `Reflect.apply` 也同样能把同步停顿重新带回来
3. `Function.prototype.apply.call` 也同样会复现
4. 因而更准确的说法应更新为：
   - 风险点不是某一个 wrapper 函数名
   - 而是 `apply-family native 调用路径` 本身，与 `_$ws + encode-chain` 组合后会重新进入高风险区

结合前面的对照，当前对 `_$ws` 这一层最准确的收敛已经变成：

- 不是单纯 `JSON.stringify` 本体
- 也不只是 `arguments` 单独有问题
- 更像是：
  - `arguments` / 参数数组物化
  - `apply-family` native 调用路径（`fn.apply` / `Reflect.apply` / `Function.prototype.apply.call`）
  - 再叠加 `Utf8.parse + Base64.encode`
  - 在 `ThreadPool + 高并发阈值` 下共同放大成同步停顿

也就是说，到这一步为止，`_$ws` 这一层已经基本可以不再泛化成“某个黑盒 serializer”，而是能更具体地写成：

- `_$ws` 的高风险核心不在 `JSON.stringify` 结果值本身
- 而在它的调用方式，尤其是 `apply-family` 路径

### 42. 配对 profiler 样本说明：`direct-fullargs` 在观测器介入后也会被抬高风险，但异常窗口热点仍与 `Reflect.apply` 同构

为避免把“调用方式本身的风险”和“profiler 观测器扰动”混在一起，这轮补了两组配对样本：

- `thread 12/48 + cps + ws-direct-fullargs + profiler`
- `thread 12/48 + cps + ws-reflect-array + profiler`

结果文件分别是：

- [sync-stall-thread-20260307_193346.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_193346.json)
- [sync-stall-thread-20260307_193442.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_193442.json)

这两组和前面“不带 profiler”的结论要分开看：

- 不带 profiler 时：
  - `cps + ws-direct-fullargs` 在当前样本里可以压到 `0/20`
  - `cps + ws-reflect-array` 仍然 `3/20`
- 但带 profiler 时：
  - `cps + ws-direct-fullargs + profiler` 也会被抬高到可复现
  - `runIndex=9` 抓到一次 `12/12` worker 同步停顿，`spreadMs=57`
  - `cps + ws-reflect-array + profiler` 在 `runIndex=4` 也抓到一次 `12/12` worker 同步停顿，`spreadMs=35`

这说明：

1. leap-vm inspector / profiler 会明显抬高风险，不适合直接拿来替代“裸跑复现率”
2. 但即使在这种观测器扰动下，两组异常窗口的热点结构仍然几乎同构

聚合热点对比如下：

- `direct-fullargs + profiler`：
  - `(program)`：`4865`
  - `_$u`：`2501`
  - `a0a1b0cv`：`2297`
  - `encode`：`829`
  - `_seData1`：`812`
  - `_$pz._$clt`：`297`
- `reflect-array + profiler`：
  - `(program)`：`5884`
  - `_$u`：`2746`
  - `a0a1b0cv`：`2497`
  - `encode`：`990`
  - `_seData1`：`929`
  - `_$pz._$clt`：`363`

因此这轮更准确的结论是：

- profiler 不适合用来比较“哪种改写复现率更低”
- 但它仍然适合用来观察“复现时卡在哪条链上”
- 从热点同构性看，不管是 `direct-fullargs + profiler` 还是 `reflect-array + profiler`，异常窗口都还是回到同一条同步热链：
  - `_$u / a0a1b0cv`
  - `encode`
  - `_seData1`
  - `_$clt`

也就是说，当前最稳妥的口径应当同时保留两点：

1. 裸跑复现率说明：
   - `Reflect.apply` 比固定参数直调更危险
   - `apply-family` 路径整体处于高风险区
2. profiler 热点说明：
   - 一旦真的进入异常窗口，两者都会重新汇聚到同一条 `_$clt + encode-chain` 热链

### 43. `Utf8.parse` 与 `Base64.encode` 单独都不是必要项，只有整条 encode-chain 一起简化时才看到明显收益

上一轮已经能确认：

- `_$clt` 内部确实直接串着
  - `_$ws`
  - `Utf8.parse`
  - `Base64.encode`
- 并且此前整条 `encode-chain` 一起 stub 时，当前样本能明显压住

这轮继续把它拆成两个单点对照：

- `--stub-paramsign-utf8-parse`
- `--stub-paramsign-base64-encode`

对应结果文件：

- [sync-stall-thread-20260307_194045.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_194045.json)
  - `cps + utf8-parse`
  - `3/20` 复现
  - 复现轮次：`runIndex=1 / 6 / 13`
  - 分别是 `12/12`、`11/12`、`12/12`
  - `spreadMs` 分别约 `177 / 113 / 98`
- [sync-stall-thread-20260307_194046.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_194046.json)
  - `cps + base64-encode`
  - `2/20` 复现
  - 复现轮次：`runIndex=1 / 6`
  - 都是 `12/12`
  - `spreadMs` 分别约 `130 / 195`

这轮的含义比较直接：

1. 单独 stub `Utf8.parse` 不够
2. 单独 stub `Base64.encode` 也不够
3. 两者单独任意一个都不是“去掉就稳定消失”的必要项
4. 这和前面“整条 `encode-chain` 一起简化时收益明显”是相容的

因此到这里，`_$clt helper` 这条链更准确的说法应更新为：

- 真正高风险的不是单个 `Utf8.parse`
- 也不是单个 `Base64.encode`
- 而是 `_$ws + Utf8.parse + Base64.encode` 这组连续同步链路整体

也就是说，当前最小高风险组合的表述可以继续保持为：

- `signSync -> _$sdnmd -> _$ms -> _$cps + (_$ws + Utf8.parse + Base64.encode)`

而不应再把 `Utf8.parse` 或 `Base64.encode` 单独拔高成“唯一必要项”。

### 44. `_$cps` 内容规模有贡献，但已经不像唯一主因；继续深挖 `_$cps` 的收益开始下降

考虑到前面已经在 `_$ws + encode-chain` 这条线上收敛得比较细，这轮改成做一个更决断的 `_$cps` 对照：

- 如果把 `_$cps` 压到只剩 `1` 个 entry，甚至直接压成空列表，异常仍然高频出现，那么 `_$cps` 这条线就基本可以降级
- 如果复现率明显下降，说明 `_$cps` 的“内容规模 / 输出规模”确实也是重要放大器

为此新增了两个更极端的 rewrite：

- `--stub-paramsign-cps-single-entry`
  - 只保留第一个 `{ key, value }`
- `--stub-paramsign-cps-empty`
  - 直接返回 `[]`

对应结果如下：

- [sync-stall-thread-20260307_194840.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_194840.json)
  - `cps-single-entry`
  - `2/20` 复现
  - 复现轮次：`runIndex=11 / 16`
  - 分别是 `12/12`、`11/12`
  - `maxTaskMs` 约 `2759 / 3100`
- [sync-stall-thread-20260307_194839.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_194839.json)
  - `cps-empty`
  - `1/20` 复现
  - 复现轮次：`runIndex=11`
  - `12/12`
  - `maxTaskMs` 约 `2523`

这组结果非常关键，因为它和早前的普通 `cps stub` 形成了一个更完整的梯度：

- 普通 `cps stub`：仍会复现
- `cps-single-entry`：复现率继续下降
- `cps-empty`：复现率继续下降到 `1/20`

因此这轮可以比较明确地说：

1. `_$cps` 不是完全无关
2. `_$cps` 的输出规模 / 内容规模确实会影响复现概率和停顿时长
3. 但即便把 `_$cps` 压到极小，异常仍没有被稳定消除
4. 所以 `_$cps` 更像“强放大器”，而不是当前唯一主因

这也意味着，当前最稳妥的责任边界可以更新为：

- `_$cps` 有明显贡献
- `_$ws + Utf8.parse + Base64.encode` 这条 `_$clt helper` 链也有明显贡献
- 当前异常更像这两块同步压力叠加后，在 `ThreadPool + 高并发阈值` 下共同放大

到这里为止，我认为这条线已经接近一个工程上足够的停点：

- 已经能明确排除“大量外围猜测”
- 已经能把风险区压到 `signSync -> _$sdnmd -> _$ms -> (_$cps + _$clt helper)`
- 已经能确认 `_$ws` 的高风险核心在 `apply-family` 调用方式
- 已经能确认 `Utf8.parse` / `Base64.encode` 单点都不是唯一必要项
- 已经能确认 `_$cps` 内容规模是放大器，但不是唯一主因

如果后续还要继续往下挖，我建议不再默认承诺“还能继续稳定缩到唯一一行代码”。
更现实的目标应该改成二选一：

1. 工程停点：
   - 基于当前结论给出可规避版本，例如优先避开 `ThreadPool`、或改写 `_$ws` 这类调用方式
2. runtime 停点：
   - 接受 JS 层已经基本收口，改去做更底层的 runtime / V8 侧采样

### 45. 当前状态、建议停点与下个对话接续方向

截至当前，已经可以把状态收口成下面这几句：

- `ThreadPool` 的偶发同步停顿不是 `MessageChannel`、不是宿主主线程 event loop 卡死、也不是宿主 GC 先卡死
- 它依赖 `worker_threads` 同进程多 worker + 高并发阈值；`process` 后端和低压样本都不满足同样症状
- 脚本侧风险区已经压到：
  - `signSync -> _$sdnmd -> _$ms -> (_$cps + _$clt helper)`
- `_$clt helper` 当前最可信的高风险链是：
  - `_$ws + Utf8.parse + Base64.encode`
- `_$ws` 的高风险核心不在 `JSON.stringify` 结果值本身，而更像在：
  - `apply-family` 调用方式
  - 即 `fn.apply` / `Reflect.apply` / `Function.prototype.apply.call`
- `_$cps` 不是唯一主因，但它的输出规模 / 内容规模会明显放大复现概率
- 因而当前最稳妥的责任边界是：
  - `_$cps` 与 `_$clt helper` 都是放大器
  - 当前问题更像两块同步压力叠加后，在 `ThreadPool + 高并发阈值` 下共同放大

也要明确写下当前这条线的边界：

- 如果目标是“继续稳定缩到唯一一行 JS 代码”，这条线的收益已经开始明显下降
- 如果目标是“得到工程上足够硬的解释、规避方向和责任边界”，当前结论已经基本够用

因此下一轮不建议再默认继续做细粒度 JS 二分。更合适的方向只有两个：

1. 工程停点方向
   - 直接基于当前结论给出可规避方案
   - 例如：
     - 优先避开 `ThreadPool`
     - 或在可控版本中改写 `_$ws` 的调用方式，尽量避开 `apply-family`
     - 或降低并发阈值 / 拆分任务形态

2. runtime 最终确认方向
   - 接受 JS 层已经基本收口
   - 不再期待继续稳定缩到唯一一行脚本
   - 改去做更底层的 runtime / V8 侧采样、trace 或 builtin 路径确认

如果下个对话直接继续，建议把起点固定成下面这段，不再重复走前面的 JS 二分：

> 当前已基本确认：`ThreadPool` 的同步停顿依赖 `worker_threads` 同进程多 worker + 高并发阈值，脚本侧风险区已经压到 `signSync -> _$sdnmd -> _$ms -> (_$cps + _$clt helper)`；其中 `_$clt helper` 当前最可信的高风险链是 `_$ws + Utf8.parse + Base64.encode`，而 `_$ws` 的高风险核心更像 `apply-family` 调用方式（`fn.apply` / `Reflect.apply` / `Function.prototype.apply.call`）；`_$cps` 内容规模也是强放大器，但不像唯一主因。下一轮不应再默认做细粒度 JS 二分，而应在“工程规避方案”与“runtime 最终确认”之间二选一。

### 46. 替换底层 allocator（`jemalloc` / `mimalloc`）后，异常仍可复现；分配器锁竞争不是当前最可信主因

基于上一节“工程停点方向”的建议，这轮优先验证了一个成本最低、结论很硬的 runtime 对照：

- 不改业务代码
- 不改 Node.js
- 只在启动时通过 `LD_PRELOAD` 替换底层 `malloc/free`

本机实际使用的库路径是：

- `jemalloc`: `/lib/x86_64-linux-gnu/libjemalloc.so.2`
- `mimalloc`: `/lib/x86_64-linux-gnu/libmimalloc.so.2`

三组命令分别是：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30

LD_PRELOAD=/lib/x86_64-linux-gnu/libjemalloc.so.2 \
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30

LD_PRELOAD=/lib/x86_64-linux-gnu/libmimalloc.so.2 \
node benchmarks/investigate-sync-stall.js --backend thread --pool 12 --concurrency 48 --repeats 20 --warmup 20 --total 360 --sample-every 30
```

对应结果文件：

- 基线：
  - [sync-stall-thread-20260307_202214.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_202214.json)
- `jemalloc`：
  - [sync-stall-thread-20260307_202318.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_202318.json)
- `mimalloc`：
  - [sync-stall-thread-20260307_202421.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_202421.json)

结果摘要如下：

| 方案 | 复现次数 | 复现轮次 | workerCount | spreadMs | maxTaskMs | 平均 req/s |
| --- | --- | --- | --- | --- | --- | --- |
| 基线 | `2/20` | `4, 17` | `12, 11` | `61, 47` | `2990, 3010` | `176.22` |
| `jemalloc` | `2/20` | `7, 20` | `12, 12` | `78, 53` | `3030, 3017` | `175.82` |
| `mimalloc` | `1/20` | `9` | `12` | `60` | `3002` | `178.08` |

这组结果的含义比较直接：

1. 换成 `jemalloc` 后，异常没有减弱到可视为“基本消失”
   - 复现率仍是 `2/20`
   - 停顿时长仍在 `~3.0s`
   - 仍然是 `12/12` worker 几乎同时完成

2. 换成 `mimalloc` 后，当前样本里复现率降到 `1/20`
   - 但异常形态没有变
   - 一旦出现，依旧是 `12/12` worker、`spreadMs=60`、`maxTaskMs=3002ms`

3. 三组样本的吞吐没有出现足以解释问题的结构性变化
   - 平均 `req/s` 基本都在 `176~178`
   - 没有出现“换 allocator 后吞吐明显上升且同步停顿消失”的信号

因此，这轮最稳妥的结论应写成：

- `ptmalloc` arena 锁竞争不是当前最可信主因
- 至少从这轮 `20` 次对照看，替换成 `jemalloc` / `mimalloc` 并不能把异常稳定消除
- 最多只能说：
  - `mimalloc` 在这组小样本里看起来略有改善
  - 但证据强度远不足以把问题归因为“glibc allocator 锁竞争”

也就是说，前一节关于责任边界的结论应继续保留：

- 问题仍然更像 `worker_threads` 同进程多 worker 下的共享 runtime 级 pause
- JS 侧的 `_$cps + _$clt helper` 仍然是强放大器
- 但底层分配器并不是当前最好用的解释

如果还要继续沿 runtime 方向推进，下一步更值得做的不是继续换 allocator，而是：

1. 接受 allocator 这条线已经基本排除
2. 转去看更底层的共享资源或 runtime 路径，例如：
   - V8 builtin / string 编码链路
   - isolate 共用的 runtime 资源
   - `worker_threads` 下更底层的同步点
3. 工程上则不应把“生产加一行 `LD_PRELOAD`”当成当前问题的确定解法

这轮实验的价值在于：

- 成本很低
- 结论很硬
- 它把“glibc allocator 锁竞争”从一个很像的猜测，降级成了一个当前证据不足的次级假设

### 47. 增强 `vmCpuProfiles` 摘要后再次抓到真实异常窗口：`signSync -> _$sdnmd -> _$clt -> encode` 已经在 stall 样本里直接变成高频采样栈

allocator 这条线排除后，下一步就不再继续做 JS 二分，而是回到 runtime 最终确认。

为避免 profiler 结果继续停留在“零散热点函数名”层面，这轮先增强了 [investigate-sync-stall.js](/home/hostxxii/LeapWorkSpace/benchmarks/investigate-sync-stall.js) 的 `summarizeCpuProfile()`：

- 保留原有 leaf 热点 `top`
- 新增 `topInclusive`
  - 看某个函数是否反复出现在采样栈里
- 新增 `topH5stStacks`
  - 直接汇总 `h5st.js` 里的高频调用链片段
- 新增 `focusHits / comboHits`
  - 直接统计：
    - `_$sdnmd / _$ms / _$cps / _$clt / _$ws`
    - `encode / parse / _seData1`
    - `stringify / apply`

然后重新跑基线 profiler 样本：

```bash
node --experimental-websocket benchmarks/investigate-sync-stall.js \
  --backend thread \
  --pool 12 \
  --concurrency 48 \
  --repeats 20 \
  --warmup 20 \
  --total 360 \
  --sample-every 30 \
  --enable-vm-inspector \
  --capture-vm-cpu-profile-on-stall
```

结果文件：

- [sync-stall-thread-20260307_205157.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260307_205157.json)

这轮在 `runIndex=17` 抓到一次新的真实异常窗口：

- `12/12` worker 同步停顿
- `spreadMs=56`
- `maxTaskMs=3953ms`

宿主侧仍然没有秒级异常：

- `eventLoopDelay.maxMs=28.262`
- `gc` 只有 `7` 次 minor GC
- 每次都在 `0.555ms ~ 0.914ms`

也就是说，这一轮继续支持前面的判断：

- 这不是“宿主 event loop 先卡死”
- 也不是“宿主 GC 先卡出 4 秒空洞”

这次共保留到：

- `12` 个停顿 worker 的 profiler stop 结果
- 其中 `9` 个有有效 profile 摘要
- `3` 个返回 `No recording profiles found`
  - 分别是 `thread-worker-9/10/11`

这一点和前面观察过的现象一致：即使是同一轮同步停顿，也不是每个 worker 都一定能稳定交回有效 CPU profile。

但关键是，这次有效 profile 的聚合样本已经够硬：

- 共 `9` 份有效 profile
- 总样本数 `17294`

聚合 `focusHits` 如下：

- `a0a1b0cv`: `4593` (`26.56%`)
- `_$sdnmd`: `4464` (`25.81%`)
- `_$ms`: `2820` (`16.31%`)
- `_$u`: `2307` (`13.34%`)
- `_$clt`: `1521` (`8.79%`)
- `encode`: `1058` (`6.12%`)
- `_seData1`: `923` (`5.34%`)
- `apply`: `184` (`1.06%`)
- `stringify`: `183` (`1.06%`)
- `parse`: `100` (`0.58%`)
- `_$cps`: `10` (`0.06%`)
- `_$ws`: `0`

这里最有价值的不是单个百分比高低，而是它已经能和高频栈片段直接对上。

聚合 `topH5stStacks` 里最关键的几条是：

- `h5st:(anonymous):0 > h5st:(anonymous):2 > h5st:(anonymous):747 > h5st:a0a1b0cv > h5st:a0a1b0cv > h5st:_$u`
  - `2208` hits (`12.77%`)
- `h5st:(anonymous):0 > h5st:geth5st > h5st:_$pz.signSync > h5st:_$pz._$sdnmd > h5st:_$pz._$clt > h5st:encode`
  - `598` hits (`3.46%`)
- `h5st:(anonymous):0 > h5st:geth5st > h5st:_$pz.signSync > h5st:_$pz._$sdnmd > h5st:_$pz._$clt`
  - `272` hits (`1.57%`)
- `h5st:(anonymous):13712 > h5st:_$pz._$atm > h5st:(anonymous):7595 > h5st:finalize > h5st:_seData > h5st:_seData1`
  - `398` hits (`2.30%`)
- `h5st:_$pz._$ms > h5st:_$pz._$gsd > h5st:(anonymous):7595 > h5st:finalize > h5st:_seData > h5st:_seData1`
  - `159` hits (`0.92%`)

这组样本把 runtime 侧结论又往前推了一步：

1. `signSync -> _$sdnmd -> _$clt -> encode` 已经不是“几个热点函数刚好同时出现”
   - 它已经在真实 stall 窗口里直接变成了高频采样栈
   - 这比之前只看 leaf hotspot 更硬

2. `_seData1` 的来源也更具体了
   - 这次不仅看到 `_$atm -> finalize -> _seData1`
   - 还看到 `_$ms -> _$gsd -> finalize -> _seData1`
   - 说明 `_seData1` 在 stall 窗口里至少有一部分来自 `_$ms` 内部分支
   - 它不只是“任务入口 body SHA256”这一个来源

3. `a0a1b0cv / _$u` 仍然是全局最热的大头
   - 这继续说明混淆壳字符串解码器是强背景负载
   - 但它仍更像“通用高频底噪 / 放大器”
   - 不是已经足以单独解释全部停顿的唯一根因

4. `apply / stringify / parse` 在 profiler 里只浮出很低的 inclusive 命中
   - `apply` 和 `stringify` 都只有约 `1.06%`
   - `parse` 约 `0.58%`
   - `_$ws` 甚至没有直接露出函数名

这个现象很重要，但不能误读成：

- “所以 `apply-family / _$ws / parse` 已经被否定”

更准确的解释应当是：

- profiler 已经能稳定证明：
  - `_$clt -> encode`
  - `_$ms -> _seData1`
  - `a0a1b0cv / _$u`
  这些链路确实落在 stall 样本里
- 但对于 `_$ws / apply-family / stringify / parse` 这层更靠近 builtin / native dispatch 的细节：
  - profiler 暂时只能给出“弱可见”或“不可见”
  - 这更像采样窗口、优化/inlining、以及 VM/native wrapper 命名暴露能力的限制
  - 不能反过来推翻前面裸跑二分已经得到的 `apply-family` 结论

因此，这一轮最稳妥的更新口径应当是：

- runtime 侧已经能直接坐实两条真实 stall 热栈：
  - `signSync -> _$sdnmd -> _$clt -> encode`
  - `_$ms -> (_$atm / _$gsd) -> finalize -> _seData1`
- 这与前面的 JS 侧结论是相容的：
  - `_$clt helper` 仍然是强风险区
  - `_$ms` 内部也仍有另一条偏摘要/Hasher 的同步热链
- 但 `_$ws / apply-family` 这层目前更像“已被裸跑二分坐实、但在 profiler 里不稳定显名”的上游触发器

换句话说，当前最接近完整的责任边界已经变成：

- 背景高频负载：
  - `a0a1b0cv / _$u`
- 第一条已被 runtime 直接看见的 stall 热链：
  - `signSync -> _$sdnmd -> _$clt -> encode`
- 第二条已被 runtime 直接看见的 stall 热链：
  - `_$ms -> (_$atm / _$gsd) -> finalize -> _seData1`
- 仍主要由前面裸跑二分支撑、但在 profiler 里不稳定显名的上游触发器：
  - `_$ws`
  - `apply-family`
  - `stringify / parse`

如果下一轮继续推进，我认为更合适的目标已经不是再问“是不是 allocator”，也不是再回到细粒度 JS 二分，而是：

1. 接受当前已经拿到两条真实 stall 热栈
2. 在 native / builtin 可见性层面继续补证据
   - 例如更底层的 builtin 名称暴露、trace 或 native wrapper 采样
3. 或者直接进入工程规避口径
   - 把 `ThreadPool` 视为当前有明确 runtime 风险边界的高性能选项
   - 在需要稳定性时优先回退 `ProcessPool`

### 48. `Phase B` 第一轮改用 `ps -L` 线程快照后，当前更像“CPU 热链主导，夹杂等待态线程”，不像单一共享锁把全池一起挂死

由于本机当前没有 `perf` / `strace`，这一轮没有继续空等系统工具，而是先在 [investigate-sync-stall.js](/home/hostxxii/LeapWorkSpace/benchmarks/investigate-sync-stall.js) 里补了一个低侵入替代方案：

- 新增 `benchmarkPid / measuredStartedAtIso / measuredEndedAtIso / stallWindow`
- 新增 `--capture-host-thread-snapshots-on-stall`
- 通过 `ps -L -p <pid> -o tid,pcpu,stat,wchan:32,comm` 按固定间隔采样
- 只在命中 stall 的轮次保留窗口样本到：
  - `benchmarks/results/thread-snapshots/.../stall-window.json`

本轮相关结果：

- 基线 `thread 12/48 + profiler + host thread snapshots`
  - 结果文件：[sync-stall-thread-20260308_001122.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260308_001122.json)
  - `runIndex=1`
  - `12/12` worker
  - `maxTaskMs=3017ms`
  - `spreadMs=4`
- 扩大线程快照窗口后的长样本
  - 结果文件：[sync-stall-thread-20260308_001407.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260308_001407.json)
  - `runIndex=3`
  - `10/12` worker
  - `maxTaskMs=3046ms`
  - `spreadMs=14`
  - 线程快照窗口：
    - [stall-window.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/thread-snapshots/sync-stall-thread-20260308_001407/run-03/stall-window.json)

这轮最关键的新观察不是某一个线程名，而是线程状态分布：

1. 在完整 stall 窗口内，并没有出现“几乎所有线程都长期停在同一个等待点”的形态
   - `run-03` 的 `stall-window` 覆盖约 `2026-03-07T16:14:19.967Z ~ 16:14:24.510Z`
   - 共 `15` 个快照
   - 多数快照里 `runnableCount` 明显不低：
     - `10`
     - `25`
     - `22`
     - `27`
     - `19`
     - `21`
     - `23`
     - `26`
     - `24`
     - 最高到 `32`

2. 同时又确实存在一批等待态线程
   - `topWchan` 主要集中在：
     - `futex_wait_queue`
     - `do_epoll_wait`
   - 代表性快照：
     - 某个窗口点为 `10` runnable / `58` sleeping，`futex_wait_queue=35`，`do_epoll_wait=23`
     - 另一个窗口点为 `32` runnable / `36` sleeping，`futex_wait_queue=20`，`do_epoll_wait=15`

3. 因而这轮最保守也最稳妥的解释应更新为：
   - 当前 stall 不像“单一共享锁把整池线程一起挂在 futex 上 `~3s`”
   - 更像是在同一个异常窗口里：
     - 有一批线程仍在同步热链里实际跑 CPU
     - 同时有另一批线程落在 `futex_wait_queue / epoll_wait`
   - 也就是说，现象更偏“CPU 热链主导，伴随等待态线程”，而不是“纯 lock-wait 型 pause”

4. 这和前面的 profiler 证据是相容的
   - profiler 已直接看到：
     - `signSync -> _$sdnmd -> _$clt -> encode`
     - `_$ms -> (_$atm / _$gsd) -> finalize -> _seData1`
   - 线程快照没有把这些热链推翻
   - 相反，它更像是在补一条 runtime 侧负证据：
     - 当前没有看到“所有线程都长期卡在同一个等待通道”的强信号

因此，`Phase B` 第一轮之后，当前主假设排序应进一步调整为：

- `H1 / H2`（同步 CPU 热链主导）继续上升
  - 即：
    - `_$clt -> encode`
    - `_$ms -> _seData1`
    - 以及背景负载 `a0a1b0cv / _$u`
    - 在 `worker_threads` 同进程高压阈值下共同放大
- `H3 / H4`（纯共享锁 / 纯 worker_threads 等待点）没有被完全排除
  - 但至少在这轮 `ps -L` 线程状态样本里
  - 它们已经不像最强解释

这轮也要明确写下一个方法学边界：

- `ps -L` 线程快照会显著拖低整体吞吐
  - 例如无异常轮也会掉到 `~90-116 req/s`
- 所以它适合回答“stall 窗口里线程更像在跑还是在等”
- 不适合再拿来比较不同改写方案的复现率高低

基于这轮结果，下一步更合适的方向不是继续扩大 `ps` 采样，而是：

1. 接受 `Phase B` 已经初步给出倾向
   - 更偏 CPU-bound 主链
   - 不像纯 lock-wait
2. 回到 `Phase D`
   - 继续用最少控制变量做：
     - baseline + profiler
     - `stub-paramsign-clt` + profiler
     - `stub-paramsign-ms` + profiler
   - 把“主链 vs 次级放大器”再压实
3. 如仍要补 runtime 证据
   - 优先考虑更底层 builtin/native 可见性
   - 而不是继续扩大线程状态采样覆盖面

### 49. `Phase D` 三组 profiler 对照已经足够把主次关系再压一层：`_$ms` 更像主链容器，`_$clt` 更像其中一条高风险分支

在 `Phase B` 初步确认“现象更偏 CPU-bound 主链，而不是纯 lock-wait”之后，这轮没有再换方向，而是回到专项方案里原本建议的最少控制变量复验：

1. baseline + profiler
2. `stub-paramsign-clt` + profiler
3. `stub-paramsign-ms` + profiler

对应结果文件：

- baseline：
  - [sync-stall-thread-20260308_000038.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260308_000038.json)
  - stall profiles 目录：
    - `benchmarks/results/vm-cpu-profiles/sync-stall-thread-20260308_000038/run-06`
- `stub-paramsign-clt`：
  - [sync-stall-thread-20260308_000205.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260308_000205.json)
  - stall profiles 目录：
    - `benchmarks/results/vm-cpu-profiles/sync-stall-thread-20260308_000205/run-01`
- `stub-paramsign-ms`：
  - [sync-stall-thread-20260308_000257.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260308_000257.json)

结果先看最外层形态：

- baseline + profiler
  - 复现 `1/12`
  - `runIndex=6`
  - `12/12` worker
  - `maxTaskMs=2814ms`
- `stub-clt` + profiler
  - 复现 `1/10`
  - `runIndex=1`
  - `12/12` worker
  - `maxTaskMs=2860ms`
  - 但后续正常轮吞吐显著抬高到 `~190+ req/s`
- `stub-ms` + profiler
  - 当前样本 `0/10`
  - 吞吐直接抬到 `236~264 req/s`

只看这个层面就已经有一个很强的信号：

- 单独拿掉 `_$clt`，还不足以阻止 stall
- 直接拿掉 `_$ms`，当前样本已经足以把 stall 压掉

为了避免只凭“是否复现”下结论，这轮又把 baseline stall 和 `stub-clt` stall 的 `summary.json` 做了聚合比较（都按各自有效 profiler summary 平均）：

#### baseline stall 聚合

- `focusHits` 前几项大致是：
  - `a0a1b0cv`: `25.79`
  - `_$sdnmd`: `24.51`
  - `_$ms`: `15.10`
  - `_$u`: `12.92`
  - `_$clt`: `8.63`
  - `encode`: `6.25`
  - `_seData1`: `4.76`
- `directChildren`
  - `_$clt -> encode`: `3.93`
  - `_$clt -> zfqvc`: `2.92`
  - `_$ms -> _$gdk`: `5.01`
  - `_$ms -> _$Ok`: `3.46`
  - `_$ms -> _$gs`: `2.34`
  - `_$ms -> _$gsd`: `2.26`
  - `_$ms -> encode`: `1.38`
- `parentChains`
  - `geth5st -> signSync -> _$sdnmd -> _$clt -> encode`: `3.93`
  - `geth5st -> signSync -> _$sdnmd -> _$ms -> encode`: `1.38`
  - `_$atm -> finalize -> _seData1`: `2.14`
  - `_$gsd -> finalize -> _seData1`: `1.26`

#### `stub-clt` stall 聚合

- `focusHits` 前几项变成：
  - `a0a1b0cv`: `27.11`
  - `_$sdnmd`: `17.19`
  - `_$ms`: `16.52`
  - `_$u`: `13.55`
  - `_seData1`: `5.30`
  - `encode`: `2.32`
  - `apply`: `1.14`
- `directChildren`
  - `_$clt` 子节点已经为空
  - `_$ms -> _$gdk`: `5.66`
  - `_$ms -> _$Ok`: `3.29`
  - `_$ms -> _$gs`: `2.52`
  - `_$ms -> _$gsd`: `2.42`
  - `_$ms -> encode`: `1.88`
- `parentChains`
  - `geth5st -> signSync -> _$sdnmd -> _$clt -> encode`
    - 已消失
  - `geth5st -> signSync -> _$sdnmd -> _$ms -> encode`
    - 仍在，且均值约 `1.88`
  - `_seData1` 相关链
    - `_$atm / _$gsd / _$gs -> finalize -> _seData1`
    - 仍然稳定存在，且与 baseline 接近或略高

这一组对照的意义非常直接：

1. `_$clt` 不是假热点
   - 拿掉它以后，`_$clt -> encode` 这条链确实会从 profiler 样本里消失

2. 但 `_$clt` 也不是当前唯一主链
   - 因为即使 `_$clt` 整条链已经退场
   - stall 仍然可以发生

3. 真正更靠近“容器级主链”的仍然是 `_$ms`
   - `stub-clt` 后，`_$ms` 相关命中没有一起消失
   - 相反：
     - `_$ms -> encode`
     - `_$ms -> (_$atm / _$gs / _$gsd) -> _seData1`
     - 这些链路继续留在异常窗口里

4. `stub-ms` 当前样本 `0/10` 的意义因此变得更强
   - 它不只是“改动更大所以全压掉了”
   - 而是和 `stub-clt` 的迁移结果一起说明：
     - `_$ms` 更像主链容器
     - `_$clt` 更像 `_$ms` 里面的一条高风险分支

所以到这一步为止，当前更准确的责任边界应更新成：

- `a0a1b0cv / _$u`
  - 仍是背景高频负载
- `_$ms`
  - 更像真正的同步主链容器
- `_$clt -> encode`
  - 是 `_$ms` 内部一条已被直接看见的高风险分支
- `_$ms -> (_$atm / _$gs / _$gsd) -> _seData1`
  - 是另一条已被直接看见、在 `stub-clt` 后仍然保留的高风险分支
- `_$ws / apply-family / stringify / parse`
  - 仍更像上游触发器或放大器
  - 但不是当前 profiler 里最稳定显名的最终热栈

换句话说，`Phase D` 到这里已经能把“主链 vs 次级放大器”写得更具体：

- 主链容器：
  - `_$ms`
- 明确高风险分支：
  - `_$clt -> encode`
  - `(_$atm / _$gs / _$gsd) -> _seData1`
- 背景放大器：
  - `a0a1b0cv / _$u`
- 更上游但当前在 profiler 中不稳定显名的触发器：
  - `_$ws`
  - `apply-family`
  - `stringify / parse`

如果还要继续推进，我认为下一步不应再做新的大面积 stub 组合，而应只剩两个高收益方向：

1. native / builtin 可见性方向
   - 继续追 `encode`、`parse`、`apply-family` 到更底层 builtin/native 命名
2. 工程停点方向
   - 接受当前已经足够解释：
     - 为什么只有 `ThreadPool` / `worker_threads` 高压阈值下会出这类同步停顿
     - 以及脚本侧最可信的主链和分支边界

### 50. builtin 可见性这条线的当前停点：CDP profiler 基本只能稳定看到 `h5st.js` 自己的编码 wrapper，最强显名点是 `Base64.encode`，`_$ws / apply-family` 仍然只弱显名

在上一节把主次关系继续压到 `_$ms` 之后，这轮没有再扩新的运行对照，而是专门做了两件事：

1. 先直接离线分析已有 raw `cpuprofile`
2. 再把这些已确认的 `h5st` 编码 wrapper 接进 [investigate-sync-stall.js](/home/hostxxii/LeapWorkSpace/benchmarks/investigate-sync-stall.js) 的 `summarizeCpuProfile()`
   - 新增 `wrapperHits`
   - 直接把以下 wrapper 单独归类：
     - `_$ws`
     - `JSON.stringify.wrapper`
     - `Hex.stringify / Hex.parse`
     - `Latin1.stringify / Latin1.parse`
     - `Utf8.stringify / Utf8.parse`
     - `Base64.stringify / Base64.stringify1 / Base64.parse / Base64.encode`

先说离线分析结论。

对 baseline stall 的 raw `cpuprofile` 做按函数名聚合后，当前最稳定能看到的名字分布大致是：

- `encode@h5st.js:9509`
  - 总命中约 `472`
- `parse@h5st.js:7117`
  - 总命中约 `50`
- `stringify@h5st.js:6864`
  - 总命中约 `46`
- `parse@h5st.js:7148`
  - 总命中约 `33`
- `stringify1@h5st.js:9389`
  - 总命中约 `31`
- `_$wL@h5st.js:5380`
  - 只看到 `1` 次

再把这些行号回对源码，可以明确对应到：

- `6864`
  - `Hex.stringify`
- `7007`
  - `Hex.parse`
- `7096`
  - `Latin1.stringify`
- `7117`
  - `Latin1.parse`
- `7148`
  - `Utf8.parse`
- `9389`
  - `Base64.stringify1`
- `9509`
  - `Base64.encode`
- `5380`
  - `_$ws`

这一步的意义很关键，因为它说明：

1. profiler 里现在最稳定显名的“encode-chain”并不是 V8 builtin 名
   - 它主要还是 `h5st.js` 自己包在外面的 JS wrapper 名字

2. 当前最强显名点是：
   - `Base64.encode`

3. `_$ws / apply-family` 这层虽然前面已经被裸跑二分坐实是高风险触发器
   - 但在 profiler 里依旧几乎不显名
   - 即使是 raw `cpuprofile`，`_$wL@5380` 也只看到极少命中

随后用新增的 `wrapperHits` 再跑了一组真实样本：

- 结果文件：
  - [sync-stall-thread-20260308_003347.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260308_003347.json)
- stall profiles：
  - `benchmarks/results/vm-cpu-profiles/sync-stall-thread-20260308_003347/run-01`
- 该次 `runIndex=1`
  - `11/12` worker
  - `maxTaskMs=4214ms`
  - `spreadMs=64`

对这次有效 `summary.json` 聚合后，`wrapperHits` 平均值大致是：

- `Base64.encode`
  - `5.60`
- `Hex.stringify`
  - `0.62`
- `Utf8.parse`
  - `0.54`
- `Latin1.parse`
  - `0.30`
- `Base64.stringify1`
  - `0.26`
- `Base64.parse`
  - `0.09`
- `_$ws`
  - `0.02`
- `JSON.stringify.wrapper`
  - `0.01`

这一组结果把 builtin/native 可见性这条线又往前推了一点：

1. 现在已经能稳定从 profiler 摘要里看到：
   - `encode-chain` 的 JS wrapper 层
2. 而且当前最强显名项非常明确：
   - `Base64.encode`
3. `Utf8.parse / Latin1.parse / Hex.stringify / Base64.stringify1`
   - 也能看到，但强度明显次一级
4. `_$ws / JSON.stringify.wrapper`
   - 依然只弱显名
   - 这继续支持前面的判断：
     - 它们更像上游触发器
     - 而不是 stall 窗口里最稳定显名的最终热栈

因此，这轮之后 builtin 可见性这条线的最稳妥口径应更新为：

- CDP profiler 当前已经足够稳定地看到：
  - `h5st.js` 自己的 encode-chain wrapper
  - 尤其是 `Base64.encode`
- 但它仍不足以把：
  - `_$ws`
  - `apply-family`
  - `Reflect.apply`
  - `Function.prototype.apply.call`
  稳定下钻到更底层 builtin/native 命名

换句话说，到这一步为止：

- “encode-chain 在 stall 窗口里确实在烧”已经被进一步坐实
- 但“`apply-family` 最终落到了哪个更底层 builtin/native 路径”这件事，CDP profiler 仍然给不出足够清晰的名字

所以如果还要继续推进 runtime 最终确认，下一步更合适的方向已经很明确：

1. 不再指望单靠 CDP profiler 继续自动冒出更底层 builtin 名字
2. 如要继续追 `apply-family`
   - 需要更靠近 native / builtin 的可见性方案
   - 例如 native wrapper / builtin trace / 更底层采样
3. 如果不再继续下探 runtime
   - 那当前证据已经足够把工程停点写实：
     - 主链容器：`_$ms`
     - 高风险分支：`_$clt -> encode`
     - 另一条高风险分支：`_$ms -> _seData1`
     - 上游触发器：`_$ws / apply-family`

### 51. 非 `h5st` 复杂替代脚本在线程池下仍可复现同类慢窗口，问题不能再表述成“只有 h5st 才会触发”

为了回答“如果换一个复杂脚本，是否还能出现塌陷”，这轮新增了一个不依赖 `h5st` 业务态的合成压力脚本：

- [synthetic-window-stress.js](/home/hostxxii/LeapWorkSpace/work/synthetic-window-stress.js)

它刻意保留了几类高风险形态：

- `window / navigator / document / location` 多点读取
- `Reflect.apply(JSON.stringify, ...)`
- `Utf8.parse / Base64.encode / Hex.stringify` 一类编码链
- 纯 JS digest / mix 计算

先在线程池下跑与原问题同档位的复现实验：

```bash
node benchmarks/investigate-sync-stall.js --backend thread --target-script work/synthetic-window-stress.js --repeats 6 --pool 12 --concurrency 48 --total 550 --slow-threshold 1000
```

结果文件：

- [sync-stall-thread-20260308_005621.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260308_005621.json)

关键结果：

- `6` 轮里有 `2` 轮出现了 `3s+` 级慢窗口
- `runIndex=3`
  - `12` 个慢任务
  - `p99=3142ms`
  - `maxTaskMs=3237ms`
  - `synchronizedStall.workerCount=12`
  - `spreadMs=177`
- `runIndex=5`
  - `12` 个慢任务
  - `p99=3197ms`
  - `maxTaskMs=3348ms`
  - 这轮没有命中当前 `synchronizedStall` 结构化判定，但形态上仍是明显的批量慢窗口

这一步很关键，因为它直接改写了之前可以使用的最强表述边界：

- 现在已经不能再说：
  - “只有 `h5st.js` 才会触发这类问题”
- 更准确的说法变成：
  - `h5st.js` 是当前证据链最完整、最可信的主触发 workload
  - 但“高复杂度同步 JS 负载”本身，在当前 `pool=12 / concurrency=48` 档位下也可能触发同类慢窗口

也就是说，`h5st` 不是这类现象唯一可能的脚本来源；它更像是当前已被完整定位到主链和高风险分支的“最强实证样本”。

### 52. 同一替代脚本切到 `ProcessPool` 后也能出现一次较小规模同步慢窗口，但频率和规模低于 `ThreadPool`

为了避免把上节结论误写成“这是 `ThreadPool` 独有现象”，这轮继续补了同 workload 的 `process` 后端对照：

```bash
node benchmarks/investigate-sync-stall.js --backend process --target-script work/synthetic-window-stress.js --repeats 6 --pool 12 --concurrency 48 --total 550 --slow-threshold 1000
```

结果文件：

- [sync-stall-process-20260308_011030.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-process-20260308_011030.json)

关键结果：

- 前 `5` 轮都没有 `>=1000ms` 的慢任务
- `runIndex=6`
  - `8` 个慢任务
  - `p99=2488ms`
  - `maxTaskMs=2510ms`
  - `synchronizedStall.workerCount=8`
  - `spreadMs=34`

和上一节线程池结果并排看，当前可以谨慎成立的是：

- 对这个合成脚本，`ThreadPool` 更容易出现、更大规模地出现慢窗口
  - `6` 轮里 `2` 轮 `3.2s~3.3s`
  - 影响面到 `12` 个 worker
- `ProcessPool` 不是“绝对无风险”
  - 同样也能出现一次较小规模同步慢窗口
  - 但这次样本里频率更低、影响 worker 数更少

因此问题边界还要再修正一次：

- 不能再把它写成：
  - “只要换成 `ProcessPool` 就绝不会出现类似塌陷”
- 更稳妥的写法是：
  - `ProcessPool` 对当前 `h5st` 主 workload 更稳
  - 但面对其他复杂同步脚本时，也仍可能出现重尾或局部同步慢窗口

### 53. `ThreadPool` vs `ProcessPool` 的性能性价比：不存在全局单边最优，取决于 workload 和是否踩中塌陷档位

为回答“进程池虽然更稳，但综合下来不一定更划算”，这轮新增了同规格的详细 benchmark 对照，并把 `process-p12-c48` 也补进了计划里。

#### 53.1 `h5st.js` 结果：中低档位线程池性价比更高，但一旦踩中 `12/48` 塌陷区，进程池反超

结果文件：

- [h5st-detailed-20260308_005913.json](/home/hostxxii/LeapWorkSpace/benchmarks/h5st-detailed-20260308_005913.json)

同规格对照：

1. `2/8`
   - `thread`
     - `70.75 rps`
     - `p99=35ms`
     - `RSS=570.62MB`
   - `process`
     - `55.54 rps`
     - `p99=40ms`
     - `RSS=1283.47MB`

2. `4/16`
   - `thread`
     - `116.11 rps`
     - `p99=74ms`
     - `RSS=773.85MB`
   - `process`
     - `101.17 rps`
     - `p99=74ms`
     - `RSS=1744.54MB`

3. `8/32`
   - `thread`
     - `163.60 rps`
     - `p99=105ms`
     - `RSS=1298.31MB`
   - `process`
     - `132.40 rps`
     - `p99=113ms`
     - `RSS=2580.00MB`

4. `12/48`
   - `thread`
     - `57.75 rps`
     - `p99=3701ms`
     - `RSS=1342.72MB`
   - `process`
     - `126.23 rps`
     - `p99=133ms`
     - `RSS=3038.14MB`

这组结果可以直接给出工程判断：

- 在 `2/8 ~ 8/32` 档位，`ThreadPool` 的综合性价比明显更好
  - 吞吐更高
  - 尾延迟相近或更优
  - 总 RSS 只有 `ProcessPool` 的约一半
- 但在当前问题档位 `12/48`，`ThreadPool` 会因为同步塌陷把前面的优势一次性吐回去
  - 吞吐只剩 `ProcessPool` 的约 `46%`
  - `p99` 从百毫秒级直接劣化到 `3.7s`

所以对 `h5st` 这个真实 workload，当前最准确的性价比结论是：

- 不踩塌陷档位时，线程池更值
- 若生产目标档位就是 `12/48` 且首要指标是尾延迟稳定性，进程池反而更值

#### 53.2 合成复杂脚本结果：线程池通常仍更省内存，但最优后端会随 workload 改变

结果文件：

- [h5st-detailed-20260308_010658.json](/home/hostxxii/LeapWorkSpace/benchmarks/h5st-detailed-20260308_010658.json)

同规格对照：

1. `2/8`
   - `thread`
     - `39.87 rps`
     - `p99=69ms`
     - `RSS=437.04MB`
   - `process`
     - `40.13 rps`
     - `p99=63ms`
     - `RSS=935.12MB`

2. `4/16`
   - `thread`
     - `72.73 rps`
     - `p99=74ms`
     - `RSS=663.88MB`
   - `process`
     - `69.28 rps`
     - `p99=86ms`
     - `RSS=1307.95MB`

3. `8/32`
   - `thread`
     - `100.50 rps`
     - `p99=118ms`
     - `RSS=1053.25MB`
   - `process`
     - `92.78 rps`
     - `p99=110ms`
     - `RSS=1995.15MB`

4. `12/48`
   - `thread`
     - `110.08 rps`
     - `p99=172ms`
     - `RSS=1513.41MB`
   - `process`
     - `49.16 rps`
     - `p99=3354ms`
     - `RSS=2701.08MB`

这说明：

- “哪个后端更稳”不是固定答案
- 同样是复杂同步脚本，`thread/process` 的重尾触发面会随着 workload 改变
- 线程池的长期稳定性问题，不能只看某一份 benchmark；必须结合重复跑的 stall probe 一起看

综合 `53.1 + 53.2`，当前更稳妥的工程结论是：

1. 没有“线程池永远更好”或“进程池永远更好”的全局答案
2. `ThreadPool` 的通用优势仍然存在
   - 内存占用显著更低
   - 多数中低档位吞吐更高
3. 但是否值得用 `ThreadPool`，最终取决于：
   - 当前 workload 是否命中它的塌陷区
   - 生产更重视平均吞吐，还是更重视尾延迟/最坏情况
4. 对当前 `h5st` 主场景，如果维持 `12/48` 这一问题档位不变：
   - `ProcessPool` 的综合性价比已经不再低于 `ThreadPool`
   - 至少在“稳定产出”这个目标上，它反而更有优势
