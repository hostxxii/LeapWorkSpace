# 2026-03-07 ThreadPool 同步停顿根因定位专项方案

## 目标

这份方案只服务一个目标：

- 不再继续扩“工程规避”讨论
- 不再继续做低收益外围排除
- 直接把问题从“责任边界”推进到“最可能的底层触发点”

本轮要回答的不是：

- 生产先怎么绕过去
- `ProcessPool` 是否更稳
- `LD_PRELOAD` 是否能缓一缓

本轮只回答：

- `ThreadPool + worker_threads + 同进程多 worker` 下，这次同步停顿到底卡在哪一类共享 runtime 资源
- 它更接近：
  - V8 builtin / string encode 链路
  - V8/Isolate 共享资源
  - leap-vm native 包装层
  - 还是 Node worker_threads 自身的同步点

## 当前已知事实

截至 [2026-03-07_ThreadPool同步停顿排故进展_MessageChannel排除.md](/home/hostxxii/LeapWorkSpace/leap_manual/maintenance/2026-03-07_ThreadPool同步停顿排故进展_MessageChannel排除.md)，当前已经能稳定成立的事实是：

1. 症状形态
   - `thread 12/48` 下会偶发一次 `10~12` worker 同步变慢
   - 停顿通常 `2.7s ~ 4.4s`
   - 慢任务完成时间 spread 通常只有 `几十毫秒`

2. 依赖条件
   - 依赖 `worker_threads` 同进程多 worker
   - 依赖高并发阈值
   - `process` 后端在同压载下不出现同样形态

3. 已基本排除
   - 不是宿主主线程 event loop 秒级卡死
   - 不是宿主 GC 秒级 stop-the-world
   - 不是 `MessageChannel`
   - 不是 `js-security-v3-rac.js`
   - 不是 canvas/cookie 这类外围宿主点
   - 不是 glibc `ptmalloc` 锁竞争

4. 脚本侧风险区
   - `signSync -> _$sdnmd -> _$ms -> (_$cps + _$clt helper)`
   - `_$clt helper` 当前最可信热链是：
     - `_$ws + Utf8.parse + Base64.encode`
   - `_$ws` 的高风险核心更像：
     - `apply-family`
     - `arguments` / 参数数组物化

5. runtime 侧已直接看见的热栈
   - `signSync -> _$sdnmd -> _$clt -> encode`
   - `_$ms -> (_$atm / _$gsd) -> finalize -> _seData1`
   - `a0a1b0cv / _$u` 是强背景负载

## 问题定义

当前最准确的问题定义不是：

- “哪个 JS API 最慢”

而是：

- 为什么同一个 Node 进程里的多个 worker，在进入 `h5st` 同步热链后，会在接近同一时刻集体出现 `~3s` 级停顿

所以接下来的所有实验，都必须优先回答下面两个判别问题：

1. 这是“同一时段大家都在烧 CPU”，还是“同一时段大家都在等某个共享点”
2. 这个共享点更偏：
   - V8 builtin / 编码 / 字符串处理
   - leap-vm native wrapper / VM thread
   - Node worker_threads / Inspector / runtime glue

## 当前主假设排序

### H1. V8 builtin / string encode 链路在 `worker_threads` 多 worker 下触发共享 runtime 级竞争或 pause

支持证据：

- 已直接抓到 `signSync -> _$sdnmd -> _$clt -> encode`
- `_$ws + Utf8.parse + Base64.encode` 在脚本侧已经多轮收敛
- `apply-family` 是高风险触发器，但 profiler 中不稳定显名，符合“上游 JS 触发 builtin / native”这一形态

当前缺口：

- 还没把 `encode / parse / stringify / apply-family` 稳定映射到 V8 builtin / native frame

### H2. `_$ms` 内部的摘要/Hasher 支路与 `_$clt` 热链叠加，触发共享 runtime 压力

支持证据：

- 已直接抓到：
  - `_$ms -> _$gsd -> finalize -> _seData1`
  - `_$atm -> finalize -> _seData1`
- `_seData1` 不是只来自任务入口 `body SHA256`

当前缺口：

- 还没确认这条支路是主暂停源，还是次级放大器

### H3. leap-vm native 包装层或 VM thread 存在共享锁/串行化点，被这两条同步热链放大

支持证据：

- 问题只在 `worker_threads` / 同进程场景下成立
- profiler 对更底层 builtin/native 可见性仍然不足

当前缺口：

- 还没有直接的 native 级栈或锁等待证据

### H4. Node `worker_threads` 自身存在更底层同步点，但必须由当前 workload 触发

支持证据：

- `process` 后端不复现
- `thread` 后端在同压载下复现

当前缺口：

- 还没有把停顿窗口稳定映射到 Node / libuv / platform thread 的共享路径

## 不再继续做的事情

为了避免继续烧时间在低收益方向，下面这些默认停止：

1. 不再继续外围宿主 API 排除
   - `MessageChannel`
   - canvas
   - cookie
   - 安全脚本
   - storage

2. 不再继续把 `h5st.js` 拆到更碎的 JS 单点
   - 除非新的 runtime 证据明确指出某个更细节点

3. 不再继续换 allocator、换 heartbeat、换 code cache 这类已经基本排除的方向

4. 不再继续把 profiler 只当热点榜单看
   - 之后必须优先看真实栈片段、builtin/native 可见性、共享点证据

## 专项方案

### Phase A. 把“热点函数名”推进成“builtin / native 可见栈”

目标：

- 把当前已经看见的：
  - `_$clt -> encode`
  - `_$ms -> _seData1`
  再往下推进一层
- 尽量让 `stringify / parse / apply-family` 从“弱可见”变成“可定位”

动作：

1. 保留 stalled run 的原始 `Profiler.stop` profile
   - 当前 JSON 只保留摘要，不够反复离线分析
   - 对 stall 样本新增可选落盘：
     - 每 worker 一份 `.cpuprofile`
     - 只保留触发 stall 的那一轮

2. 增强 `summarizeCpuProfile()` 的 builtin 归一化规则
   - 把：
     - `JSON.stringify`
     - `Reflect.apply`
     - `Function.prototype.apply.call`
     - `parse`
     - `encode`
   - 统一折叠成更稳定的 key
   - 避免因为优化/匿名 frame 命名漂移看不到真实分布

3. 对 stall 样本增加“按 parent-child 关系追一层”的摘要
   - 不是只看 leaf / inclusive
   - 而是明确输出：
     - `_$clt` 的直接子热节点
     - `_$ms` 的直接子热节点
     - `encode` / `_seData1` 的父链

成功标准：

- 在至少 `1` 个真实 stall 样本里，把：
  - `_$clt`
  - `_$ms`
  - `encode`
  - `_seData1`
  之间的父子关系写清楚
- 至少拿到 `1` 条更靠近 builtin/native 的可解释链

停点：

- 如果做完这一步仍然只能看到同一批 JS 名字，说明 CDP profiler 的可见性已经到头
- 那么直接进入 Phase B

### Phase B. 用系统级采样区分“CPU 打满”还是“等待共享点”

目标：

- 回答这次 pause 到底是：
  - 多个 worker 同时忙在 CPU 上
  - 还是同时被卡在某个共享锁/共享资源

动作：

1. 对 stall 样本运行系统级采样
   - 优先 `perf record -g`
   - 采样对象是 benchmark 进程本身
   - 只抓一次真实 stall 窗口

2. 配套保留 benchmark 时间线
   - 记录：
     - stall runIndex
     - 最慢任务开始/结束时间
     - 对应 PID
   - 让 `perf script` 能和 JSON 对齐

3. 分析重点不是“哪个符号最热”，而是：
   - V8 builtin / runtime entry 是否大量出现
   - futex / pthread mutex / condvar / epoll wait 是否集中出现
   - leap-vm native 方法是否反复出现在热栈

成功标准：

- 明确把问题归到二选一：
  - CPU-bound 热链
  - lock/wait 类共享点

停点：

- 如果系统采样确认是 lock/wait，直接转 Phase C
- 如果系统采样确认是 CPU-bound，直接转 Phase D

### Phase C. 如果是 lock/wait，追共享锁或串行化点

目标：

- 找到究竟是谁在让多 worker 一起等

优先排查对象：

1. leap-vm native wrapper / VM thread
2. V8 platform / isolate 周边共享资源
3. Node worker_threads / inspector glue

动作：

1. 在 leap-vm native 关键入口加低成本等待计数
   - 不是全量 debug log
   - 是只统计：
     - 调用次数
     - 等待时长
     - 最大等待

2. 对 VM thread / inspector / wrapper dispatch 的锁或串行区做定点埋点

3. 如果 `perf` 已看到明确 futex 热点
   - 直接顺着符号回到对应锁对象

成功标准：

- 能指出“是哪一个锁/串行区在 stall 窗口里被放大”

### Phase D. 如果是 CPU-bound，追 builtin / 编码链的根触发器

目标：

- 确认是：
  - `_$clt -> encode`
  - 还是 `_$ms -> _seData1`
  - 或两者叠加
  在真正主导 stall

动作：

1. 做最少量的控制变量复验
   - 不是再大规模二分
   - 只保留三组：
     - baseline + profiler
     - `stub-paramsign-clt` + profiler
     - `stub-paramsign-ms` + profiler

2. 对比三组 stall 样本的：
   - 是否还复现
   - 若复现，热栈是否整体迁移

3. 如 `stub-paramsign-clt` 后 stall 热栈大幅转移到 `_seData1`
   - 说明两条链是竞争关系
4. 如 `stub-paramsign-ms` 后 stall 仍稳定停在 `_$clt -> encode`
   - 说明 `_$clt` 更接近主链

成功标准：

- 能把问题从“两条热链都相关”推进成：
  - 主链
  - 次级放大器

## 具体执行顺序

建议严格按下面顺序，不要跳：

1. Phase A
   - 先把 raw cpuprofile 落盘和 parent-child 摘要补齐
2. 再跑一次真实 stall profiler
   - 只要抓到 `1` 次即可
3. 如果 builtin/native 仍不可见，立刻上 Phase B
4. 根据 Phase B 的结果分叉：
   - lock/wait -> Phase C
   - CPU-bound -> Phase D

## 代码落点

### JS 侧

- [investigate-sync-stall.js](/home/hostxxii/LeapWorkSpace/benchmarks/investigate-sync-stall.js)
  - raw `.cpuprofile` 落盘
  - parent-child 栈摘要
  - stall run 元数据对齐

### native 侧

- [vm_instance.cc](/home/hostxxii/LeapWorkSpace/leap-vm/src/leapvm/vm_instance.cc)
  - VM thread / native wrapper / 调度点埋点候选
- [ws_inspector_server.cc](/home/hostxxii/LeapWorkSpace/leap-vm/src/leapvm/ws_inspector_server.cc)
  - profiler/inspector 生命周期相关排查点

### pool 侧

- [thread-pool.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-pool.js)
  - stall run 元信息补充
- [thread-worker.js](/home/hostxxii/LeapWorkSpace/leap-env/src/pool/thread-worker.js)
  - worker 侧运行时统计补充

## 通过标准

这轮“找到根因”不要求到“某一行 JS”。

通过标准定义为下面三选一：

1. 锁等待型根因
   - 明确指出某个共享锁/串行区

2. builtin/root-runtime 型根因
   - 明确指出某个 V8 builtin / runtime 路径在 `worker_threads` 下被共同放大

3. 组合型根因
   - 明确写出：
     - 主链
     - 次级放大器
     - 为什么只有 `thread` 后端会一起 pause

只有拿到上面三类之一，才算这轮专项结束。

## 不接受的结束方式

下面这些都不算“找到根因”：

1. 只说“可能是 V8 的问题”
2. 只说“可能是 worker_threads 的问题”
3. 只说“`_$clt` 很热”
4. 只说“`apply-family` 看起来危险”
5. 只拿一份热点榜单，不给共享点解释

## 时间预估

在不扩散范围的前提下，这份专项方案的现实预估是：

- Phase A: 半天到 1 天
- Phase B: 半天到 1 天
- Phase C 或 D: 1 到 3 天

也就是说，顺利的话：

- `2~4` 天能把问题推进到“底层触发点”

如果系统级采样可见性仍差，或者落到更深的 V8 / Node runtime 行为：

- 可能拉长到 `5~7` 天

## 结论

现在最不该做的，是继续无限扩外围排除。

当前已经具备启动“根因专项”的条件：

- 现象足够稳定
- 边界已经收口
- 热链已经有 runtime 样本支撑

接下来只需要按这份方案执行，不再分心。
