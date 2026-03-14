# Skeleton 系统

本文档描述 Skeleton 数据格式、三阶段构建流程和 Skeleton 拉取工具。Dispatch 路由部分见 `Dispatch桥接与运行时路由.md`。

## 1. 设计原则

Skeleton 是 Leap 实现 Web API 对象的数据驱动架构：

- **Skeleton（结构层）**：JS 文件描述每个 Web API 类型的属性名、owner、kind、brand 校验要求、继承关系——纯数据，无逻辑
- **Impl（行为层）**：JS 文件通过 `registerImpl()` 注册行为实现
- **C++ 组装层**：`SkeletonRegistry` 读取 Skeleton 描述，用 V8 FunctionTemplate 构建原型链，所有 stub 路由到 `DispatchBridge::StubCallback`

## 2. Skeleton 文件格式

每个 Web API 类型对应两类文件，均位于 `leap-env/src/skeleton/`：

### Type skeleton（`skeleton/type/*.type.skeleton.js`）

描述类型定义（对应一个 V8 FunctionTemplate）：

```js
{
  "name": "Navigator.type",       // 内部名，必须以 .type 结尾
  "ctorName": "Navigator",        // V8 ClassName / 暴露给全局的构造函数名
  "brand": "Navigator",           // 品牌标签（Illegal invocation 检查用）
  "ctorIllegal": true,            // true = new Navigator() → TypeError
  "exposeCtor": true,             // 是否暴露构造函数到全局对象
  "super": null,                  // 父类 type skeleton 名（如 "EventTarget.type"）
  "props": {
    "userAgent": {
      "owner": "prototype",       // "constructor" | "prototype" | "instance"
      "kind": "accessor",         // "data" | "method" | "accessor"
      "brandCheck": true,
      "attributes": { "enumerable": true, "configurable": true },
      "dispatch": {
        "getter": { "objName": "Navigator", "propName": "userAgent" }
      }
    }
  }
}
```

### Instance skeleton（`skeleton/instance/*.instance.skeleton.js`）

描述单例对象（如 navigator、document）：

```js
{
  "name": "navigator.instance",   // 必须以 .instance 结尾
  "instanceName": "navigator",    // 安装到全局的属性名
  "brand": "Navigator",           // 复用类型品牌
  "super": "Navigator",           // 继承自哪个 type skeleton
  "exposeCtor": false,
  "ctorIllegal": false,
  "props": {}                     // 通常为空
}
```

### IIFE 包装

所有 skeleton 文件必须以 `})(globalThis);` 结尾（不是 `})(this);`），否则在 esbuild IIFE 模式下 `this` 会绑定到 `exports`。构建时由 `validate-skeleton-context.js` 校验。

## 3. JS 侧加载流程

```
各 *.skeleton.js 文件 → 追加到 leapenv.skeletonObjects[]
↓
leapenv.loadSkeleton()
  ├── 构建 envDescriptor = { schemaVersion:1, envVersion, objects: [...] }
  └── nativeBridge.defineEnvironmentSkeleton(envDescriptor)  // 调用 C++ API
```

加载顺序由 `generate-entry.js` 控制（见 `构建系统.md`）：type skeleton 按继承拓扑排序，instance skeleton 中 `window.instance.skeleton.js` 强制排首。

## 4. C++ 三阶段构建

`defineEnvironmentSkeleton` 入口 → `SkeletonParser::ParseFromV8Object()` → 填充 `EnvironmentSkeleton` → 三阶段构建：

| 阶段 | 方法 | 动作 |
|------|------|------|
| Phase 1 | `BuildPhase1_CreateTemplates()` | 为每个 `.type` skeleton 创建 `v8::FunctionTemplate`，设置 ClassName 和可选构造回调 |
| Phase 2 | `BuildPhase2_SetupInheritance()` | 递归（parent-first）设置 `Inherit()`，确保原型链正确 |
| Phase 3 | `BuildPhase3_DefinePropertiesAndInstances()` | 3.1 定义属性（DATA/METHOD/ACCESSOR）；3.2 创建实例；3.3 暴露构造函数到全局 |

**Phase 3 顺序约束**：`skeleton_order_` 以注册顺序迭代（`window.instance` 第一），Phase 3.3 的构造函数暴露必须在 Phase 3.2 之后执行。

### 品牌校验

品牌标签存储在对象的 V8 Private 属性 `[[leapvm_brand]]` 中：

1. 检查 receiver 自身的 brand
2. 检查 receiver 原型的 brand（兼容 global proxy）
3. brand 相等 → 通过；否则走 `IsBrandCompatible()`（缓存继承链查找）
4. 跨帧场景：走 `IsSameOriginBrandCompatible()`
5. Window brand 无条件放行

品牌兼容性缓存：`brand_compat_cache_`（`unordered_map<string,bool>`），避免每次遍历继承链。

**多 Isolate 约束**：`[[leapvm_brand]]` 的 V8 Private key 必须用 `v8::Private::ForApi()` 按 Isolate 获取。禁止 `static v8::Eternal<v8::Private>` 跨 Isolate 共享。

### iframe 子上下文

子帧创建时，C++ 在新 Context 中重新执行 bundle，`defineEnvironmentSkeleton` 检测到子上下文后独立构建 `SkeletonRegistry`。

## 5. Skeleton 拉取工具

### 概述

`leap-env/skeleton_puller_extension/` 是一个 Chrome MV3 扩展，用于从真实浏览器中提取 Web API 结构描述。

### 为什么需要从真实浏览器拉取

- 未通过 skeleton 构建的对象不会安装 StubCallback，对 dispatch 不可见
- `brandCheck`、`ctorIllegal`、属性描述符标志必须与真实浏览器一致
- 拉取在 `document_start`（MAIN world）阶段执行，此时浏览器原生环境已完整初始化、站点脚本尚未执行

### 拉取机制

扩展通过 `Reflect.ownKeys()` 遍历目标对象所有自有属性：

- **属性分类**：accessor（有 get/set）→ 探测 brandCheck；method（value 是函数）→ 探测 brandCheck；data（其余）→ 记录值
- **brandCheck 探测**：`desc.get.call({})` / `desc.value.call({})` — 抛 `Illegal invocation` 则 `brandCheck = true`
- **ctorIllegal 探测**：`new Ctor()` — 抛 `Illegal constructor` 则 `ctorIllegal = true`
- **Symbol 属性**：仅处理 well-known Symbol（`@@iterator`、`@@toStringTag` 等），编码为 `"@@name"` 格式
- **父类识别**：`Object.getPrototypeOf(Proto)` → 优先用 `@@toStringTag`，回退 `constructor.name`

### PULL_LIST

当前覆盖约 40 个 type + 9 个 instance。

### 使用方式

1. Chrome `chrome://extensions/` → 开启开发者模式 → 加载 `skeleton_puller_extension/` 目录
2. 打开任意非受限页面，扩展自动执行 `batchPull()`
3. 控制台：`downloadBundle()` 下载 `skeleton_bundle.json`
4. 拆分到项目后重新打包：`cd leap-env && npm run build`

### 注意事项

- Chrome 版本敏感：骨架应与目标模拟的 Chrome 版本匹配
- CSP 限制：部分页面会阻止 MAIN world 注入，换一个普通页面即可
- 覆盖 `src/skeleton/` 后必须 `npm run build` 重新打包

## 6. 文件结构

```
leap-env/src/skeleton/
├── type/                      # ~40 个 type skeleton 文件
│   ├── EventTarget.type.skeleton.js
│   ├── Node.type.skeleton.js
│   ├── Navigator.type.skeleton.js
│   └── ...
└── instance/                  # ~9 个 instance skeleton 文件
    ├── window.instance.skeleton.js
    ├── document.instance.skeleton.js
    ├── navigator.instance.skeleton.js
    └── ...
```
