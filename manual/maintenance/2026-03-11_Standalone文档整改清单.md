# 2026-03-11 Standalone 文档整改清单

范围：`manual/README.md`、`manual/architecture/`、`manual/reference/`

## 1. 本轮已落地

- 重写 `manual/README.md`，移除旧“待重写/待拆分”描述。
- 扩写 `特殊API模块.md`，补入 `crypto`、canvas/webgl、navigator 品牌集合、MessageChannel/MessagePort。
- 扩写 `站点配置与任务态注入.md`，补入 plugins/mimeTypes/permissions 和额外 reset 钩子。
- 新增 `V8 Platform与任务调度.md`。
- 全量重写 `manual/reference/` 四篇到当前 standalone 主线。

## 2. 为什么这些 API 算“特殊 API”

判定标准：

1. 不能只靠普通 skeleton 描述完成语义。
2. 涉及跨对象状态、私有槽、异步队列或高指纹风险面。
3. 需要任务态注入、专项 reset、专门 Hook 路径或缓存管理。

按这个标准，当前属于“特殊”的主要有：

- `document.all`
  历史兼容语义 + special getter + 特殊集合返回值。
- `Event.prototype.isTrusted`
  依赖构造期私有状态，不是普通 JS 属性。
- `crypto`
  高指纹面，带类型校验、额度限制和任务级确定性随机源。
- `canvas` / `CanvasRenderingContext2D` / `WebGLRenderingContext`
  高指纹面，依赖 profile、私有状态和上下文缓存。
- `PluginArray` / `MimeTypeArray` / `PermissionStatus`
  不是单值，而是带品牌关系和 named/index 属性的对象图。
- `MessageChannel` / `MessagePort`
  依赖 entangle、消息队列、异步 flush 和任务后 reset。

## 3. 当前仍建议补的项

### 必做

- 给根 `README.md` 增补 `V8 Platform与任务调度` 的文档入口。
- 在 `Inspector调试服务.md` 中补一段指向 `V8 Platform与任务调度.md` 的显式链接。
- 在 `运行时入口与任务执行链路.md` 中补一段指向 `站点配置与任务态注入.md` 和 `V8 Platform与任务调度.md` 的交叉引用。

### 可选

- 给 `特殊API模块.md` 增补最小验证脚本索引。
- 给 `测试手册.md` 增补“推荐最小回归组合”小节。
- 单独补一篇 Windows / macOS 与 Linux 差异附录。

## 4. 验收口径

完成状态可按两层看：

- `manual/architecture` 主体：已进入可交付状态。
- 仓库文档整体：仍需继续做交叉引用和平台差异附录，才能算完全收口。
