# Leap Manual

本目录是仓库详细文档的 SSOT。

根 `README.md` 负责项目定位、总体架构、端到端流程和快速开始；本目录负责模块级细节。

## 架构（`architecture/`）

| 文档 | 范围 |
|------|------|
| `运行时入口与任务执行链路.md` | `runner.js` 三主函数、bootstrap 注入、bundle 执行、任务 setup/cleanup 全链路 |
| `Standalone服务端与Worker模型.md` | `main.cc`、`worker_pool.cc`、Worker 生命周期、code cache、recycle |
| `IPC协议与通信模型.md` | `StandaloneClient`、`IpcServer`、LPJ 帧格式、请求/响应字段 |
| `并发执行模型.md` | WorkerPool 调度、round-robin、异步回调和并发统计 |
| `V8 Platform与任务调度.md` | `V8Platform`、`LeapPlatform`、前台/延迟/后台任务调度、platform metrics |
| `Skeleton系统.md` | skeleton 文件格式、registry/builder、brand/inheritance、拉取工具 |
| `Dispatch桥接与运行时路由.md` | StubCallback、dispatch meta/fn、impl 注册表与缺失策略 |
| `Window与全局对象模型.md` | Window/globalThis 建立、leapenv 隐藏、facade 模式 |
| `DoD布局引擎.md` | TypedArray 布局引擎、转换器、零拷贝传输 |
| `iframe多上下文.md` | 多 Context 子帧、同源/跨域访问、跨帧品牌校验 |
| `站点配置与任务态注入.md` | siteProfile、snapshot 合并、任务前注入与任务后清理 |
| `Hook监控与拦截体系.md` | Native Hook、Builtin Wrapper、MonitorEngine、Hook 日志策略 |
| `Inspector调试服务.md` | Chrome DevTools CDP 调试服务 |
| `构建系统.md` | bundle 生成、generate-entry.js、validate-skeleton-context、CMake 主线目标 |
| `Code-Cache预编译缓存.md` | V8 code cache 生成、共享、拒绝回退 |
| `错误堆栈伪装.md` | `Error.prepareStackTrace` 伪装 |
| `特殊API模块.md` | 语义特殊或高指纹风险 API 的专项实现 |

## 参考（`reference/`）

| 文档 | 范围 |
|------|------|
| `API手册.md` | `runner.js`、`StandaloneClient`、`ServerManager`、CLI/IPC 形状 |
| `环境变量与命令手册.md` | `LEAP_*` / `LEAPVM_*` 环境变量、构建/调试/测试命令 |
| `骨架详细说明手册.md` | skeleton 字段、约束、示例、symbol 编码与实例规则 |
| `测试手册.md` | 回归入口、manifest、脚本分类、perf 基线与手工调试入口 |

## 维护（`maintenance/`）

按日期平铺的维护记录，包括：

- 历史迁移过程（addon → standalone）
- 排障记录（SIGSEGV、同步停顿、竞态等）
- 未完全落地的方案稿
- 变更清单与整改记录

## 文档维护约束

- 现行实现说明写入 `architecture/`、`reference/`
- 维护记录与整改过程写入 `maintenance/`
- 根 README 与本文件只做索引，不重复正文
- 旧路线与已删除设计不留在 `architecture/`
