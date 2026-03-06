# C4 稳定脚本源码实验

- 时间：2026-03-06T14:12:20.843Z
- 迭代次数：每组 100 次
- JSON 结果：[benchmarks/results/experiment-c4-stabilize-script-source-20260306_221220.json](benchmarks/results/experiment-c4-stabilize-script-source-20260306_221220.json)

## 结论

- 唯一大源码路径（每任务不同 taskId）下，`Large Object Space` 达到 `99.03MB`，`SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE` 为 `101` 个。
- 固定 taskId 后，同样 100 次任务只剩 `4.47MB`，脚本源码对象降到 `2` 个。
- 将 `h5st.js` 预装为一次性缓存函数、每任务仅执行小包装脚本后，`Large Object Space` 进一步压到 `6.36MB`，脚本源码对象仅 `3` 个。

## 数据表

| case | usedHeap(MB) | largeObject(MB) | codeSpace(MB) | oldSpace(MB) | top-1 | top-1 count | top-1 size(MB) |
|---|---:|---:|---:|---:|---|---:|---:|
| constant-task-id | 29.47 | 4.47 | 5.67 | 17.02 | ARRAY_ELEMENTS_TYPE | 1321 | 5.07 |
| unique-task-id | 181.54 | 99.03 | 32.09 | 33.41 | SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE | 101 | 99.03 |
| cached-target-small-wrapper | 20.27 | 6.36 | 1.09 | 12.04 | SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE | 3 | 5.43 |

## 解释

- `executeSignatureTask()` 当前把 `taskId`、snapshot 和 `targetScript` 一起拼进 `combinedScript`。
- benchmark 下 `targetScript` 是同一份 `work/h5st.js`，但 `taskId` 每次不同，导致 V8 每任务都看到一份全新的 48 万字符大脚本。
- 当大脚本只编译一次、后续任务只运行小包装脚本时，Large Object Space 和 Code Space 都明显回落。

## 下一步

- 优先把 `executeSignatureTask()` 改成“稳定小包装脚本 + 缓存目标脚本/函数”的执行模型。
- `taskId`、站点 snapshot 等可变数据不要继续直接内联进 48 万字符的大源码文本。
- 如果要继续验证，可直接复跑本脚本：`node benchmarks/experiment-c4-stabilize-script-source.js`。
