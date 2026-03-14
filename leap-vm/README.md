# LeapVM（模块入口）

`leap-vm` 是 Leap 的 C++ Native Addon（Node.js + V8），负责独立 V8 实例、原生对象构建、dispatch 桥接、定时器/Hook/Inspector 等运行时基础能力。

本 README 只保留模块内架构概览与模块索引；详细 API/架构正文统一在 `../manual/`。

## 模块内架构概览

```text
Node Addon 导出层 (main.cc / wrapper)
          |
          v
VmInstance / 平台初始化 (vm_instance.*, v8_platform.*)
          |
          +--> 定时器 / Hook / Monitor / Inspector
          |
          +--> Skeleton Builder / Registry / Dispatch Bridge
          |
          v
JS 侧 __LEAP_DISPATCH__ / leap-env Impl
```

关键职责：

- 创建与管理独立 V8 Isolate/Context
- 构建 skeleton 驱动的原生对象外壳与品牌检查
- 将 stub 调用桥接到 JS 侧 `__LEAP_DISPATCH__`
- 提供定时器、Hook/Monitor、Inspector、运行控制接口

## 模块目录索引

- `src/leapvm/`：核心运行时实现（`vm_instance` / platform / skeleton / dispatch / timers / hooks）
- `scripts/`：模块私有测试/演示脚本（root 编排保留部分直连）
- `package.json`：addon 构建依赖与基础入口
- `CMakeLists.txt`：构建配置（V8/Node 链接、平台编译选项）

## 模块内常用入口（最小）

- 构建（Windows 主线）：`cmake -S leap-vm -B leap-vm/build -G "Visual Studio 17 2022" -A x64`
- 编译：`cmake --build leap-vm/build --config Release`
- 根回归入口（推荐）：`../tests/README.md`

## 模块相关手册（SSOT）

- `../manual/README.md`
- `../manual/architecture/Standalone服务端与Worker模型.md`
- `../manual/architecture/Dispatch桥接与运行时路由.md`
- `../manual/architecture/Hook监控与拦截体系.md`
- `../manual/architecture/Window与全局对象模型.md`
- `../manual/architecture/Inspector调试服务.md`

## 历史迁移记录入口（非正文）

- `../manual/maintenance/2025-12-04_LeapVM_双V8共存与构建链路.md`
- `../manual/maintenance/2025-12-02_LeapVM_定时器与Hook监控基础能力落地.md`
- `../manual/maintenance/2025-12-04_LeapVM_Inspector集成与调试稳定性改造.md`
- `../manual/maintenance/2025-12-04_LeapVM_Inspector_CorkBuffer线程修复.md`

说明：本目录不再保留 `LEAPVM_API.md` 等详细文档副本，现行说明统一以 `../manual/` 为准。

