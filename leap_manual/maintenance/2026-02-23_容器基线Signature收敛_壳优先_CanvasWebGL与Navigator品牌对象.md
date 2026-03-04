# 2026-02-23_容器基线Signature收敛_壳优先_CanvasWebGL与Navigator品牌对象

日期：2026-02-23  
来源拆分：当前仓库实装收口（容器基线阶段，非历史迁移条目）

## 迁移校验状态（补录）

- 状态：已校验（现行维护依据 / 收口摘要）
- 整理日期：2026-02-23
- 来源路径：当前源码与本地集成测试（根 `SOLUTION.md` 已退场；历史快照见 `leap_manual/maintenance/2026-02-23_SOLUTION时间线快照_收口前.md`）
- 当前适用性：可作为容器基线阶段的实现口径说明；具体行为以当前源码和测试为准
- 纠偏规则：若与后续目标站点适配策略冲突，以“壳真实、值走 snapshot/profile”的容器基线原则为准

## 背景

本轮收敛重点不是“为某个目标脚本做兼容”，而是明确容器基线阶段的边界：

- 大多数对象优先做真实壳（品牌 / 原型链 / descriptor / 方法面）
- 动态值（显卡参数、`href`、站点特有字段等）统一通过 `snapshot/profile` 覆盖
- 仅少数必须联动的能力保留较重 JS 实现（例如事件分发、DOM 树、`location/history` 一致性）

该原则用于避免在高并发计算容器中引入不必要的真实渲染/联网/复杂语义实现，同时保留足够的指纹外观一致性。

## 事实校验（源码与实测）

核对依据（当前仓库）：

- `leap-env/src/impl/HTMLCanvasElement.impl.js`
- `leap-env/src/instance/signature-task.instance.js`
- `leap-env/src/impl/Navigator.impl.js`
- `leap-env/src/impl/NavigatorBrands.impl.js`
- `leap-env/src/skeleton/type/PermissionStatus.type.skeleton.js`
- `tests/scripts/integration/test-leapenv-canvas-minimal.js`
- `tests/scripts/integration/test-leapenv-fingerprint-snapshot.js`
- `tests/scripts/integration/test-leapenv-signature-core.js`

核对结论：

- `CanvasRenderingContext2D` / `WebGLRenderingContext` 已接入 skeleton-backed 品牌壳，且 `WebGL` 参数可由 `snapshot.canvasProfile.webgl.*` 覆盖。
- `navigator.plugins` / `navigator.mimeTypes` 已从 plain object/array 风格升级为品牌对象壳（`PluginArray` / `Plugin` / `MimeTypeArray` / `MimeType`）。
- `PermissionStatus` skeleton 已落盘并进入构建，`navigator.permissions.query()` 可返回品牌壳（最小行为）。
- `EventTarget.impl` 本体仍较薄（委托 `domShared`），当前“较重”的核心在 `Event.impl + domShared.dispatchEvent`，属于基线应保留能力。

纠偏说明：

- 容器基线阶段不应以 `work/h5st.js` 命中路径驱动主线实现优先级；目标脚本命中优化属于后续适配阶段。
- `EventTarget.type` 中的 `when` 为非标准方法，可能形成特征点；后续建议从 skeleton 暴露面移除（本轮仅记录策略，未执行删除）。

## 实现摘要

### 1. Canvas / WebGL：壳真实，值走 `canvasProfile`

`HTMLCanvasElement` 相关实现从“仅 2D plain object 最小占位”升级为：

- `CanvasRenderingContext2D` 品牌对象壳（skeleton-backed）
- `WebGLRenderingContext` 品牌对象壳（skeleton-backed）
- `getContext('webgl')` 返回最小稳定对象（不做真实渲染）
- `getParameter/getExtension/getSupportedExtensions/getContextAttributes` 提供最小行为
- 关键值通过 `snapshot.canvasProfile.webgl` 覆盖

设计要点：

- 壳与方法面真实，用于通过反射/品牌检测
- 不做真实图像生成与 GPU 语义模拟
- 将 GPU/扩展/renderer/vendor 等动态值从 skeleton 移到 snapshot/profile 层

相关实现位置（摘要）：

- `leap-env/src/impl/HTMLCanvasElement.impl.js`
- `leap-env/src/instance/signature-task.instance.js`

### 2. `canvasProfile` 深拷贝扩展（任务隔离）

为避免高并发任务间共享引用导致串号，本轮扩展了 `canvasProfile` 克隆逻辑，支持以下字段的嵌套克隆：

- `canvasProfile.toDataURL`
- `canvasProfile.webgl.supportedExtensions`
- `canvasProfile.webgl.contextAttributes`
- `canvasProfile.webgl.parameters`

这保证外部传入的快照对象不会直接挂进任务态状态对象。

### 3. Navigator 品牌对象壳（壳优先）

新增 `NavigatorBrands.impl`，提供最小品牌对象工厂与 impl：

- `PluginArray`
- `Plugin`
- `MimeTypeArray`
- `MimeType`
- `PermissionStatus`（与 skeleton 存在时配合使用）

`Navigator.impl` 改为：

- 优先返回品牌对象壳
- 失败时回退旧 plain object 路径（降低回归风险）

`navigator.permissions.query()` 改为：

- 优先返回 `PermissionStatus` 品牌壳（最小 `name/state/onchange`）
- 无法创建品牌壳时回退 plain object 占位

相关实现位置（摘要）：

- `leap-env/src/impl/NavigatorBrands.impl.js`
- `leap-env/src/impl/Navigator.impl.js`
- `leap-env/src/skeleton/type/PermissionStatus.type.skeleton.js`

### 4. `PermissionStatus` skeleton 接入与路由对齐

新增 `PermissionStatus` type skeleton 后，本轮完成以下对齐：

- 构建入口自动纳入 `PermissionStatus.type.skeleton.js`
- `PermissionStatus` impl 补齐 `name` getter（匹配 skeleton dispatch 面）
- `createPermissionStatusObject(state, name)` 工厂支持写入权限名
- `permissions.query(desc)` 将 `desc.name` 传递给品牌壳状态

## 验证（本地）

本轮已执行并通过：

- `npm run build`
- `node tests/scripts/integration/test-leapenv-canvas-minimal.js`
- `node tests/scripts/integration/test-leapenv-fingerprint-snapshot.js`
- `node tests/scripts/integration/test-leapenv-signature-core.js`

新增/增强验证点（摘要）：

- `canvas-minimal`：验证 `CanvasRenderingContext2D` / `WebGLRenderingContext` 品牌壳与 `canvasProfile.webgl` 覆盖/复位
- `fingerprint-snapshot`：验证 `PluginArray/Plugin/MimeTypeArray/MimeType` 品牌壳与 `PermissionStatus` 工厂品牌壳

注意事项（过程性）：

- 在 Windows 环境并行执行 `build` 与依赖 bundle 的测试，可能导致测试读到旧 bundle 并出现误报。
- 本轮回归以串行重跑结果为准。

## 基线阶段策略结论（当前口径）

- 容器基线阶段优先级：
  - 壳真实（品牌 / 原型链 / descriptor / 方法面）
  - 少量必须联动的基础设施（事件、DOM 树、`location/history`）
  - 动态值统一由 `snapshot/profile` 注入
- 不在基线阶段追求：
  - 真实图像渲染
  - 真实网络请求
  - 针对单一目标脚本的深度行为模拟

## 影响文件（摘要）

核心实现：

- `leap-env/src/impl/HTMLCanvasElement.impl.js`
- `leap-env/src/impl/Navigator.impl.js`
- `leap-env/src/impl/NavigatorBrands.impl.js`
- `leap-env/src/instance/signature-task.instance.js`

Skeleton：

- `leap-env/src/skeleton/type/PermissionStatus.type.skeleton.js`

测试：

- `tests/scripts/integration/test-leapenv-canvas-minimal.js`
- `tests/scripts/integration/test-leapenv-fingerprint-snapshot.js`
- `tests/scripts/integration/test-leapenv-signature-core.js`

## 相关入口

- 维护索引：`leap_manual/maintenance/INDEX.md`
- 容器收敛计划：`SIGNATURE_CONTAINER_PLAN.md`
- 架构文档目录：`leap_manual/architecture/`

