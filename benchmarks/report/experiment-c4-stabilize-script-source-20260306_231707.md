# C4 稳定脚本源码实验

- 时间：2026-03-06T15:17:07.640Z
- 迭代次数：每组 100 次
- JSON 结果：[benchmarks/results/experiment-c4-stabilize-script-source-20260306_231707.json](benchmarks/results/experiment-c4-stabilize-script-source-20260306_231707.json)

## 结论

- 唯一 taskId 与固定 taskId 两组已经收敛：两者的 `Large Object Space` 都约为 `4.44MB`，说明当前 `executeSignatureTask()` 已不再因为任务唯一 payload 生成线性增长的大源码对象。
- 固定 taskId 后，同样 100 次任务的 `Large Object Space` 为 `4.44MB`，脚本源码对象为 `2` 个。
- 将 `h5st.js` 预装为一次性缓存函数、每任务仅执行小包装脚本后，`Large Object Space` 为 `6.36MB`，脚本源码对象为 `3` 个。

## 数据表

| case | usedHeap(MB) | largeObject(MB) | codeSpace(MB) | oldSpace(MB) | top-1 | top-1 count | top-1 size(MB) |
|---|---:|---:|---:|---:|---|---:|---:|
| constant-task-id | 29.31 | 4.44 | 5.58 | 17.01 | ARRAY_ELEMENTS_TYPE | 1321 | 5.07 |
| unique-task-id | 29.51 | 4.44 | 5.72 | 17.03 | ARRAY_ELEMENTS_TYPE | 1321 | 5.07 |
| cached-target-small-wrapper | 20.27 | 6.36 | 1.09 | 12.04 | SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE | 3 | 5.43 |

## 解释

- 当前 runner 已把大 `targetScript` 从动态拼接路径切到稳定源码执行路径；因此即使 `taskId` 每次变化，V8 看到的主脚本源码也不再持续变化。
- `cached-target-small-wrapper` 仍然代表更激进的“一次安装函数、后续只跑小包装脚本”下限，可作为后续继续优化的对照组。

## 下一步

- 下一步优先把这套执行模型带到真实 longevity 跑法，确认 `mtp=500` 下 RSS 和 `Code Space` 曲线是否同步回落。
- `taskId`、站点 snapshot 等可变数据都不应继续直接内联进 48 万字符级别的大源码文本。
- 如果要继续验证，可直接复跑本脚本：`node benchmarks/experiment-c4-stabilize-script-source.js`。
