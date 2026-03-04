# Hook日志策略层

> 源文件：`leap-vm/src/leapvm/skeleton/hook_log_policy.cc/.h`，`leap-vm/src/leapvm/skeleton/dispatch_bridge.cc`，`leap-vm/src/leapvm/skeleton/skeleton_registry.cc`
> 更新：2026-03-02

## 目标

把 Native Hook 的“是否应该输出日志”从事件实现中拆出来，形成独立策略层，避免 `dispatch/special/symbol` 三条路径重复实现和行为漂移。

## 三层结构

| 层 | 代码位置 | 职责 |
|---|---|---|
| 事件源层 | `dispatch_bridge.cc`、`skeleton_registry.cc` | 产生日志事件与值（get/set/call、返回值、参数） |
| 策略层 | `hook_log_policy.cc` | 判定是否允许记录与输出 |
| 输出层 | `monitor.cc` + Inspector 发送 | 统一格式落地到 CLI / DevTools |

## 策略函数

`hook_log_policy` 当前对外提供：

1. `CaptureHookStackFrames()`：采样调用栈。
2. `IsInternalUrl()`：识别 LeapVM/DevTools/internal URL。
3. `HasUserFrame()`：判断是否含用户帧。
4. `HasDevtoolsEvalFrame()`：识别断点控制台/eval 噪声帧。
5. `IsRuntimeTaskActive()`：判定是否处于目标任务期。
6. `ShouldSuppressHookNoise()`：统一静音决策。

## 统一静音判定

按顺序执行：

1. `VmInstance` 不可用 -> 静音。
2. Inspector paused -> 静音。
3. 非 `task + active` -> 静音。
4. 栈命中 DevTools eval/internal -> 静音。

仅当以上都不命中时，事件源才继续走 Monitor 和 DevTools 输出。

## 接入点

1. `DispatchBridge::StubCallback`（普通 skeleton 路径）。
2. `SkeletonSymbolNamedGetter`（symbol 路径）。
3. `EmitSpecialNativeGetHookWithValue`（special 路径，如 `document.all`）。

这三个入口共享同一策略函数，保证行为一致。
