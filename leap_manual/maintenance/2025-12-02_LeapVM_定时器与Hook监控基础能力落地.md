# 2025-12-02_LeapVM_定时器与Hook监控基础能力落地

日期：2025-12-02（来源章节日期）  
整理日期：2026-02-22  
来源拆分：`leap-vm/SOLUTION.md`（Timer / High-Resolution Timer / Graceful Shutdown / Hook / 黑名单章节）

## 迁移校验状态（补录）

- 状态：已校验（历史迁移摘要）
- 整理日期：2026-02-23
- 来源路径：见本文头部“来源拆分”（子模块 `SOLUTION.md` 已退场；现以 `leap_manual/`（尤其 `maintenance/INDEX.md`）为准）
- 当前适用性：用于维护回溯与背景理解；涉及现行实现时需与当前源码、`leap_manual/*`、`tests/*` 交叉核对
- 纠偏规则：若与来源文档历史表述冲突，以当前源码、脚本结果和手册 SSOT 文档为准

## 背景

`leap-vm/SOLUTION.md` 中 2025-12-02 的多段记录构成了 LeapVM 运行时基础能力的一次集中落地：

- 浏览器风格定时器（`setTimeout` / `setInterval` / `clear*`）
- Windows 高精度定时器支持（改善 4ms nesting clamp 观感）
- `shutdown()` 优雅关闭（避免进程退出时 V8 相关 fatal）
- Hook 监控与函数调用日志
- 黑名单过滤（降噪、防递归）

这些内容目前已被根手册拆散到 API / 架构 / 运维文档中，本记录用于保留历史实现脉络。

## 问题与实现摘要

### 1. 定时器系统（浏览器兼容行为）

来源记录覆盖的能力点：

- `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval`
- 4ms nesting clamp（第 5 层后最小延迟钳制）
- 字符串代码回调（legacy browser 风格）
- 参数透传
- 定时器回调异常捕获与 stderr 记录（不中断 VM）
- 事件循环中基于下一到期时间睡眠，避免 busy-wait
- 回调后运行 microtasks（Promise 支持语义）

来源记录价值：

- 明确将“浏览器定时器行为”作为兼容目标，而不仅是简单延时执行
- 将事件循环与 VM 生命周期绑定到 `runLoop(ms)` / VM 实例模型

### 2. Windows 高精度定时器（High-Resolution Timer）

来源记录问题：

- Windows 默认时间片约 15.625ms，使 4ms clamp 在观测上常接近 15ms

来源记录方案：

- 提供高精度定时器 API（`enableHighResTimer()` / `disableHighResTimer()`）
- 使用系统高精度时间片能力改善嵌套定时器观测结果（更接近浏览器）
- `shutdown()` 时自动回收/关闭高精度模式

说明：

- 该能力主要用于仿真场景与高精度调试，存在功耗权衡

### 3. `shutdown()` 优雅关闭

来源记录问题：

- Node.js 进程退出阶段出现 V8 相关 fatal（独立静态链接 V8 的资源清理时序问题）

来源记录方案：

- 暴露 `shutdown()` API，显式释放 LeapVM 资源
- 典型调用方式：`try/finally`、进程信号处理、测试框架 `afterAll`

沉淀价值：

- 把“资源销毁”从进程退出隐式行为改成应用层显式行为
- 为长期运行与测试场景提供稳定退出路径

### 4. Hook 监控（属性访问 + 函数调用）

来源记录落地点：

- 使用 V8 `NamedPropertyHandler` 拦截 `window` 属性操作
- 在 GET 阶段识别函数并返回包装函数，以记录 CALL 参数与返回值
- 提供细粒度日志开关（名称/类型/值/参数/返回值等）
- 创建浏览器别名：`window === self === top === parent === frames === globalThis`

说明（当前口径）：

- Hook 相关 API、导出项与过滤顺序已在根手册中按当前实现重新校验
- 本文保留的是“首轮实现设计意图与历史说明”

### 5. 黑名单过滤（降噪 + 防递归）

来源记录问题：

- `console` 被 Hook 会导致递归日志甚至死循环
- `then` / `constructor` / Symbol 等访问造成大量噪音日志

来源记录方案：

- 三层黑名单：对象 / 属性 / 前缀
- 在 Hook 处理早期进行过滤，减少日志与字符串处理成本
- Node-API 暴露 `setPropertyBlacklist(...)`，支持替换语义与即时生效

沉淀价值：

- 黑名单不仅降低日志噪音，也实际降低监控开销
- 为“补环境调试”提供可用默认配置模式

## 验证（来源记录摘要）

定时器相关（来源记录）：

- 4ms nesting clamp 行为通过验证（Windows 默认时间片下表现为约 11-16ms，高精度模式下约 4-5ms）
- 字符串代码、参数透传、异常不中断、`setInterval` 均通过示例/脚本验证

Hook / 黑名单相关（来源记录）：

- 基础 Hook、细粒度日志、浏览器别名、推荐黑名单配置均有配套测试脚本
- 黑名单过滤在对象/属性/前缀三个维度完成验证

当前推荐验证入口（2026-02-22）：

- 根目录回归：`tests/runners/run-smoke.ps1`、`tests/runners/run-full.ps1`
- API 说明与导出：`leap_manual/reference/LEAPVM_API.md`
- 并发/压测：`tests/runners/run-perf.ps1`

## 影响文件（来源记录主题映射）

核心：

- `leap-vm/src/leapvm/vm_instance.h`
- `leap-vm/src/leapvm/vm_instance.cc`
- `leap-vm/src/addon/main.cc`

来源记录中的历史测试/示例脚本（可能已移动或替换）：

- `leap-vm/test_timers.js`
- `leap-vm/test_highres.js`
- `leap-vm/test_shutdown.js`
- `leap-vm/test_hooks_granular.js`
- `leap-vm/test_globalthis.js`
- `leap-vm/test_blacklist*.js`

## 相关文档

- `leap_manual/reference/LEAPVM_API.md`
- `leap_manual/architecture/Dispatch分发与__LEAP_DISPATCH__.md`
- `leap_manual/architecture/Window与全局对象模型.md`
- `leap_manual/architecture/并发池（线程池与进程池）.md`
- `leap_manual/operations/回归执行手册.md`




