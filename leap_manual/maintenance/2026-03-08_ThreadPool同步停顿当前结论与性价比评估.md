# 2026-03-08 ThreadPool 同步停顿当前结论与性价比评估

## 这份文档回答什么

这份文档只回答四件事：

1. 当前最可信的根因结论到底收口到哪里
2. “换一个复杂脚本”之后，原结论是否还成立
3. `ThreadPool` 和 `ProcessPool` 的综合性价比怎么判断
4. 现阶段哪些点已经足够停，哪些点还不能下结论

## 当前最可信结论

截至本轮实验，最稳妥的结论不是：

- “根因已经被唯一定位到 `h5st.js` 某一行”

而是：

- `h5st.js` 是当前证据链最完整、最可信的主触发 workload
- 其最可信同步热链已经收敛到：
  - 主链容器：`signSync -> _$sdnmd -> _$ms`
  - 明确高风险分支：`_$clt -> encode`
  - 另一条高风险分支：`_$ms -> (_$atm / _$gs / _$gsd) -> _seData1`
  - 更上游但在 profiler 中弱显名的触发器：`_$ws / apply-family`
- 但问题不能再表述成“只有 `h5st` 才会触发”
  - 非 `h5st` 的复杂同步脚本，在当前高并发档位下也可能触发同类慢窗口

所以当前最准确的根因表述应写成：

- 这不是一个“纯 `h5st` 私有 bug”
- 更像是：
  - `worker_threads`/当前并发模型
  - 遇到特定形态的高复杂同步 JS 热链
  - 会出现共享 runtime 压力被共同放大的现象
- 在这个大前提下，`h5st.js` 是目前定位最深入、证据最充分、可重复性最强的主问题样本

## 证据链收口

### 1. `h5st` 侧证据仍然最强

来自前序排故的核心收敛点已经比较稳定：

- `MessageChannel`
- `js-security-v3-rac.js`
- canvas/cookie 等外围宿主点
- allocator
- 主进程 GC / event-loop

这些都已被排除为主因。

留下来的强证据集中在 `h5st` 同步签名主路径：

- `signSync -> _$sdnmd -> _$ms`
- `_$clt -> encode`
- `_seData1`
- `_$ws / apply-family`

并且多轮 profiler / stub 对照都支持：

- `_$ms` 是当前最可信的主链容器
- `_$clt -> encode` 是明确高风险分支
- `_seData1` 是另一条高风险摘要链
- `_$ws / apply-family` 更像上游触发器或放大器

### 2. CDP profiler 的可见性已经接近上限

目前 profiler 已经可以稳定看到：

- `h5st.js` 自己的 encode wrapper
- 尤其是 `Base64.encode`

但还不能稳定把：

- `apply-family`
- `Reflect.apply`
- `Function.prototype.apply.call`

继续下钻到更底层 builtin/native 名字。

因此现阶段可以确认：

- “encode-chain 确实在 stall 窗口里发热”已经足够成立

但仍不能仅靠现有 CDP profiler 完成下面这句更强的话：

- “最终就是某一个具体 V8 builtin 在 `worker_threads` 下触发共享 pause”

## 替代脚本对照后的边界修正

### 1. `synthetic-window-stress.js` 在线程池下也能复现

为了验证“是否只有 `h5st` 才会塌陷”，新增了：

- [synthetic-window-stress.js](/home/hostxxii/LeapWorkSpace/work/synthetic-window-stress.js)

这个脚本不依赖 `h5st` 业务逻辑，但刻意保留了：

- DOM/BOM 读取
- `Reflect.apply(JSON.stringify, ...)`
- 编码链
- JS digest 计算

在线程池下的 stall probe 结果：

- [sync-stall-thread-20260308_005621.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-thread-20260308_005621.json)

结论：

- `6` 轮里有 `2` 轮出现 `3s+` 慢窗口
- 其中 `runIndex=3` 命中了 `12 worker / spread 177ms` 的同步收敛形态

这说明：

- 替代脚本并没有把问题彻底洗掉
- 因此不能再把结论写成“这就是 `h5st` 独有问题”

### 2. 同一替代脚本在进程池下也不是绝对无风险

对应 `ProcessPool` stall probe 结果：

- [sync-stall-process-20260308_011030.json](/home/hostxxii/LeapWorkSpace/benchmarks/results/sync-stall-process-20260308_011030.json)

结论：

- 前 `5` 轮正常
- `runIndex=6` 出现一次 `8 worker / spread 34ms / p99=2488ms` 的同步慢窗口

这进一步说明：

- `ProcessPool` 对复杂同步 workload 也不是绝对无风险
- 但对这个替代脚本，当前样本里它的复现频率和影响规模仍低于线程池

因此替代脚本对照的最终含义不是“排除 h5st”，而是：

- 证明底层还存在一个更普遍的、会被复杂同步 JS 触发的风险面
- 只是 `h5st` 目前恰好是最强、最完整、最可分析的触发样本

## ThreadPool vs ProcessPool 性价比

## `h5st` workload

结果文件：

- [h5st-detailed-20260308_005913.json](/home/hostxxii/LeapWorkSpace/benchmarks/h5st-detailed-20260308_005913.json)

同规格对照结论：

1. `2/8` 到 `8/32`
   - `ThreadPool` 吞吐更高
   - 尾延迟相近或略优
   - 总 RSS 大约只有 `ProcessPool` 的一半

2. `12/48`
   - `ThreadPool`
     - `57.75 rps`
     - `p99=3701ms`
   - `ProcessPool`
     - `126.23 rps`
     - `p99=133ms`

工程解释很直接：

- 对 `h5st` 来说，线程池平时更省、更快
- 但一旦命中当前塌陷档位，之前所有优势都会被重尾吞掉

所以对 `h5st` 主场景：

- 如果能把生产档位控制在 `8/32` 一类非塌陷区，线程池更划算
- 如果生产必须长期跑 `12/48`，并且看重尾延迟稳定性，进程池反而更划算

## 合成复杂脚本 workload

结果文件：

- [h5st-detailed-20260308_010658.json](/home/hostxxii/LeapWorkSpace/benchmarks/h5st-detailed-20260308_010658.json)

这组结果说明：

- 线程池依然有明显内存优势
- 但后端优劣并不是固定的
- 不同 workload 会命中不同的重尾触发面

尤其要注意：

- 详细 benchmark 里，`synthetic` 的 `process-p12/c48` 出现了明显重尾
- 而重复跑的 stall probe 又显示 `thread` 侧复现更频繁、规模更大

这说明不能只拿单份 benchmark 就决定后端，必须同时看：

- 吞吐
- p99
- 重复跑的 stall 频率
- 总 RSS

## 当前可以停到哪里

现阶段已经足够停在下面这个工程结论：

1. `h5st` 仍是当前最可信主触发器
2. 其最可信风险链路已经收敛到：
   - `_$ms`
   - `_$clt -> encode`
   - `_seData1`
   - `_$ws / apply-family`
3. 但底层还存在一个对复杂同步 JS 更普遍敏感的并发风险面
4. 对 `h5st` 当前生产档位，如果维持 `12/48`
   - `ProcessPool` 在稳定性维度上已经具备明显现实优势

## 当前还不能下的结论

下面这些话现在都还不能写死：

1. “根因已经唯一定位到 `h5st.js` 某一行”
2. “Windows 一定也会同样复现”
3. “换成 `ProcessPool` 就绝不会再有类似塌陷”
4. “复杂同步脚本的风险只在 `ThreadPool`”

尤其是 Windows：

- 当前这轮所有实测都来自 Linux 环境
- 还没有 Windows 客户端上的对照结果
- 所以这件事目前只能列为待验证项，不能提前下结论

## 建议停点

如果目标是工程决策而不是继续做 runtime 深挖，那么当前建议停点是：

1. 把 `h5st` 的根因口径停在“主触发 workload + 最可信热链边界”
2. 把后端决策停在“按 workload 和档位分流”
3. 不再继续扩新的外围排除

如果还要继续深挖底层 runtime，那么下一步只剩一个高收益方向：

- 想办法提升 native/builtin 级可见性

因为单靠现在这套 CDP profiler，已经很难再把 `apply-family` 下钻到更底层名字了。
