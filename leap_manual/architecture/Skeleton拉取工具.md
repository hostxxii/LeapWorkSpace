# Skeleton拉取工具

> 源文件：`leap-env/skeleton_puller_extension/manifest.json`，`leap-env/skeleton_puller_extension/content.js`
> 更新：2026-03-02

---

## 功能概述

Skeleton 拉取工具是一个 Chrome MV3 扩展，用于从真实浏览器中提取 Web API 对象的结构描述（skeleton）。提取的数据直接生成 `*.type.skeleton.js` 和 `*.instance.skeleton.js` 文件，供 LeapVM Skeleton 系统消费。

### 为什么需要从真实浏览器拉取

1. **原生监控覆盖**：未通过 skeleton 构建的对象不会安装 `DispatchBridge::StubCallback`，对 `__LEAP_DISPATCH__` 完全不可见——属于监控盲区；
2. **精确属性描述**：`brandCheck`、`ctorIllegal`、属性的 `enumerable`/`configurable`/`writable` 等标志必须与真实浏览器一致，否则会被站点指纹检测发现；
3. **空白页不完整**：`about:blank` 缺少部分浏览器 API 对象的完整初始化，与正常页面的 `document_start` 阶段存在差异。

### 拉取时机

扩展在 `document_start`（MAIN world）阶段同步执行，此时：
- 浏览器已为页面初始化完整的原生环境（DOM/BOM API 全部就位）；
- 站点脚本尚未执行（无任何 JS 污染）；
- `call({})` 品牌探测安全，不会触发站点的检测/监控逻辑。

因此，拉取结果代表**浏览器原生 API 的干净快照**，与具体网站无关，仅与 Chrome 版本有关。

---

## 关键机制

### 1. 扩展配置（manifest.json）

```json
{
  "manifest_version": 3,
  "name": "Leap Skeleton Puller",
  "version": "1.0",
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "world": "MAIN"
    }
  ]
}
```

- `run_at: "document_start"`：在 HTML 解析前注入，保证先于站点脚本；
- `world: "MAIN"`：注入到页面主世界（非 isolated world），可直接访问 `window`、原型链等原生对象。

### 2. 过滤表

**V8_GLOBALS**：V8 引擎内建的全局对象/函数（`Object`、`Array`、`Promise` 等 68 项），在抓取 `Window.instance` 时跳过，避免重复定义 V8 已提供的内容。

**PULL_SCRIPT_INJECTED**：扩展自身注入到 `window` 上的函数名（`generateSkeleton`、`generateInstanceSkeleton`、`batchPull`、`downloadBundle`、`downloadAll`、`__PULL_RESULTS__`），抓取 `Window.instance` 时过滤。

### 3. PULL_LIST（拉取清单）

维护所有需要拉取的 Web API 对象列表，格式：

```js
{ ctor: string, instance?: string|null, instanceOnly?: boolean }
```

| 字段 | 说明 |
|------|------|
| `ctor` | 构造函数名（如 `"Navigator"`） |
| `instance` | `null`=仅拉取 type；`"document"`=指定实例路径；省略=默认首字母小写 |
| `instanceOnly` | `true`=跳过 type 生成（用于同类型多实例，如 `sessionStorage`） |

当前清单覆盖 40 个 type + 9 个 instance，分为：基础原型链、DOM 集合、HTML 元素、事件、浏览器 API、存储、通信、插件/MIME、权限、Canvas/WebGL、特殊对象。

### 4. 属性抓取逻辑（collectPropsFromTarget）

对每个目标对象（constructor / prototype / instance），通过 `Reflect.ownKeys()` 遍历所有自有属性：

```
Reflect.ownKeys(target)
  → 跳过内部属性（prototype, name, length, caller, arguments, constructor）
  → Object.getOwnPropertyDescriptor(target, prop)
  → 判断 kind:
     accessor（有 get/set） → 探测 brandCheck → 记录 dispatch getter/setter
     method（value 是函数） → 探测 brandCheck → 记录 dispatch apply + length
     data（其余）           → 记录 valueType + value
  → 记录 attributes（enumerable, configurable, writable）
```

**brandCheck 探测**：`desc.get.call({})` / `desc.value.call({})` — 如果抛出 `Illegal invocation` 则 `brandCheck = true`。这是精确模式的核心，必须在站点脚本执行前完成。

**ctorIllegal 探测**：`new Ctor()` — 如果抛出 `Illegal constructor` 则 `ctorIllegal = true`。

**Symbol 属性**：仅处理 well-known Symbol（`@@iterator`、`@@toStringTag` 等 6 种），编码为 `"@@name"` 格式。

### 5. 隐形对象搜索（findHiddenPrototype）

部分对象（如 `WindowProperties`）不作为全局构造函数暴露，需要从 `window` 原型链向上查找：

```js
let p = window;
while (p) {
  if (Object.prototype.toString.call(p) === "[object WindowProperties]")
    return { proto: p, ctor: null };
  p = Object.getPrototypeOf(p);
}
```

### 6. 父类识别

通过 `Object.getPrototypeOf(Proto)` 获取父原型，优先用 `@@toStringTag` 识别，回退到 `constructor.name`。

### 7. 输出格式

生成两种 skeleton 对象，通过 `formatOutput()` 包装成标准 IIFE：

**Type skeleton**（`_buildTypeObj`）：合并 constructor + prototype 属性
```js
{ name: "Navigator.type", ctorName, brand, ctorIllegal, exposeCtor, super, props: {...} }
```

**Instance skeleton**（`_buildInstanceObj`）：仅包含 instance 自有属性
```js
{ name: "navigator.instance", instanceName, brand: ctorName, super: ctorName, props: {...} }
```

输出 IIFE 格式：
```js
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  leapenv.skeletonObjects = leapenv.skeletonObjects || [];
  const XXX_skeleton = { ... };
  leapenv.skeletonObjects.push(XXX_skeleton);
})(globalThis);
```

---

## 使用方式

### 安装扩展

1. Chrome → `chrome://extensions/` → 开启开发者模式；
2. "加载已解压的扩展程序" → 选择 `leap-env/skeleton_puller_extension/` 目录；
3. 打开任意非受限页面（避免 `chrome://`、Google 等 CSP 严格的页面）。

### 自动批量拉取

扩展加载后自动执行 `batchPull()`，结果缓存在 `window.__PULL_RESULTS__` 中。DOM 就绪后控制台会打印拉取摘要。

### 控制台命令

| 命令 | 说明 |
|------|------|
| `downloadBundle()` | 下载 `skeleton_bundle.json`（单个 JSON，推荐） |
| `downloadAll()` | 逐个下载为独立 `.js` 文件 |
| `generateSkeleton('Navigator')` | 生成 type + instance（默认实例名） |
| `generateSkeleton('Storage', 'localStorage')` | 生成 type + 指定实例 |
| `generateSkeleton('EventTarget', null)` | 仅生成 type |
| `generateInstanceSkeleton('Storage', 'sessionStorage')` | 仅生成 instance |
| `copy(generateSkeleton('Screen'))` | 生成并复制到剪贴板 |

### Bundle 拆分到项目

下载 `skeleton_bundle.json` 后，拷贝到 `leap-env/src/skeleton/` 目录，执行：

```bash
cd leap-env/src/skeleton && node -e "
const fs=require('fs'),path=require('path'),b=require('./skeleton_bundle.json');
for(const[f,c]of Object.entries(b)){
  fs.mkdirSync(path.dirname(f),{recursive:true});
  fs.writeFileSync(f,c);
  console.log('  wrote',f)
}"
```

拆分后需重新打包：

```bash
cd leap-env && npm run build
```

---

## 文件结构

```
leap-env/src/skeleton/
├── type/                      # 40 个 type skeleton 文件
│   ├── EventTarget.type.skeleton.js
│   ├── Node.type.skeleton.js
│   ├── Navigator.type.skeleton.js
│   └── ...
└── instance/                  # 9 个 instance skeleton 文件
    ├── window.instance.skeleton.js
    ├── document.instance.skeleton.js
    ├── navigator.instance.skeleton.js
    └── ...
```

---

## 注意事项

1. **Chrome 版本敏感**：不同 Chrome 版本的原生 API 可能不同（新增/废弃属性），骨架应与目标模拟的 Chrome 版本匹配；
2. **CSP 限制**：部分页面（如 Google）的 Content Security Policy 会阻止扩展的 MAIN world 注入，属正常现象，换一个普通页面即可；
3. **新增对象**：如需支持新的 Web API 类型，在 `content.js` 的 `PULL_LIST` 中添加条目，重新拉取；
4. **打包不可忘**：覆盖 `src/skeleton/` 后必须 `npm run build` 重新打包，runner 加载的是 `dist/leap.bundle.js`。
