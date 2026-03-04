# LeapWorkSpace

Leap 是一个面向补环境/反检测场景的浏览器环境容器：用 C++ V8 embedder 提供"真实地基"，再用 JS Impl 按需补全行为。

根 `README.md` 保留产品定位与核心思想；实现细节统一进入 `leap_manual/`（SSOT）。

---

## 一、定位

Leap 是一个**底层级可复用补环境容器**，不是一个"把浏览器所有 API 都实现一遍"的全量模拟器。

| 维度 | 传统补环境 | Leap |
|------|----------|------|
| 实现层级 | 纯 JS 层面 mock | C++ V8 embedder + JS 双层 |
| 对象真实性 | JS 模拟，`toString`/原型链容易穿帮 | C++ 创建原生对象，InternalField + Brand check，原型链由 V8 FunctionTemplate 构建 |
| 属性描述符 | 手动 defineProperty，容易遗漏 | Skeleton 自动从真实浏览器导出，批量还原 |
| 扩展方式 | 全量预装 | Hook 检测 + 按需补全 |
| 并发能力 | 通常单线程 | 线程池 / 进程池，每个 Worker 独立 V8 Isolate |
| 可检测性 | 高（堆栈、描述符、原型链均有破绽） | 低（C++ 层面还原，指纹级别拟真） |

**一句话：Leap 提供"真实地基 + 按需盖楼"，而不是"预建好整栋大楼"。**

---

## 二、核心架构原则

### 2.1 三层职责分离

```
┌─────────────────────────────────────────┐
│  目标代码 (用户注入的 JS)                  │
│  通过 window/document/navigator 访问 API   │
├─────────────────────────────────────────┤
│  Skeleton 层 (结构蓝图)                    │
│  · 从真实 Chrome 导出的属性描述符            │
│  · 定义原型链继承关系                       │
│  · 定义 dispatch 路由元数据                 │
│  · 不包含任何业务逻辑                       │
├─────────────────────────────────────────┤
│  C++ Bridge 层 (V8 原生)                   │
│  · FunctionTemplate 构建真实构造函数         │
│  · InternalField 绑定品牌标记               │
│  · StubCallback 统一拦截 → __LEAP_DISPATCH__ │
│  · Monitor/Hook 全链路属性访问追踪           │
├─────────────────────────────────────────┤
│  Impl 层 (JS 业务逻辑)                     │
│  · 基础 DOM 操作 (始终内置)                  │
│  · BOM 对象 (按需补全)                      │
│  · registerImpl() 热注册，无需改 C++         │
└─────────────────────────────────────────┘
```

### 2.2 U 型调用链

```
目标代码 JS  ──→  C++ StubCallback  ──→  __LEAP_DISPATCH__  ──→  Impl 类
   ↑                                                              │
   └──────────────── 返回值原路返回 ────────────────────────────────┘
```

目标代码看到的是 C++ 层面创建的"真实"对象（带正确原型链、描述符、品牌标记），但实际业务逻辑在 JS Impl 层执行，实现了**真实性与灵活性的统一**。

### 2.3 按需补全模式

Leap 的核心工作流不是"实现所有 API"，而是：

```
1. 开启 Hook Monitor
2. 注入目标代码运行
3. Monitor 输出报告：哪些属性被访问了、返回了什么
4. 对缺失的属性编写 Impl（仅需 JS 层面）
5. 重新运行验证
```

这意味着：
- **Window.instance.skeleton 声明了数百个属性** → 这是正确的，Skeleton 是蓝图
- **Window.impl.js 只实现了少数属性** → 这也是正确的，按需补全
- **dispatch 找不到实现时返回 undefined** → 这是设计行为，不是 bug

---

## 三、必须内置 vs 按需补全

### 必须内置（地基层）

这些是所有目标代码都会用到的基础设施，不能靠"缺了再补"：

| 类别 | 内容 | 原因 |
|------|------|------|
| **DOM 树操作** | Node / Element / Document 全套方法 | 任何涉及 DOM 的脚本都需要 |
| **原型链正确性** | Window → WindowProperties → EventTarget 链 | instanceof / getPrototypeOf 检测 |
| **属性描述符** | 所有 Skeleton 声明的 configurable/enumerable/writable | Object.getOwnPropertyDescriptor 检测 |
| **堆栈伪装** | ScriptOrigin + Error.prepareStackTrace | `new Error().stack` 检测 |
| **品牌标记** | InternalField + BrandCheck | Illegal invocation 检测 |
| **基础 BOM 壳** | Screen / Location / History / Performance 的空壳构造函数 | typeof / instanceof 检测 |

### 按需补全（用户层）

这些根据目标代码的实际需求补充：

| 类别 | 示例 | 补全方式 |
|------|------|---------|
| 具体 BOM 属性值 | screen.width=1920 | 在 Screen.impl.js 添加 getter |
| Cookie 管理 | document.cookie | 在 Document.impl.js 添加 get/set |
| 网络请求 | fetch / XMLHttpRequest | 根据业务需要实现或 stub |
| 存储 | localStorage | 内存 Map 实现 |
| 特定 API | WebGL / Canvas / MediaDevices | 根据检测脚本需要 |

---

## 四、拟真的三个层次

### 层次 1：结构拟真 (Skeleton)
- 属性存在性：`'screen' in window` → true
- 描述符一致：`Object.getOwnPropertyDescriptor(window, 'screen')` 与真实浏览器一致
- 原型链正确：`window instanceof Window` → true
- 构造函数名称：`Window.prototype[Symbol.toStringTag]` → "Window"

**现状：已实现。** Skeleton 从真实 Chrome 导出，C++ 层面还原。

### 层次 2：行为拟真 (Impl)
- 属性返回合理值：`navigator.userAgent` 返回 Chrome UA
- DOM 操作正确：`document.createElement('div').tagName` → "DIV"
- 方法可调用：`document.querySelector('body')` 返回 body 元素

**现状：DOM 基本实现，BOM 按需补全。**

### 层次 3：深度拟真 (反检测)
- 堆栈格式：`new Error().stack` 格式与 Chrome 一致，无 `<anonymous>`
- 函数 toString：`navigator.userAgent.toString()` 返回正确格式
- iframe 隔离：多 Context 模拟，SecurityToken 正确
- 时序一致：performance.now() 精度与浏览器一致
- 属性枚举顺序：Object.keys(window) 顺序与浏览器一致

**现状：部分待实现，是接下来的重点。**

---

## 五、并发模型

```
                Main Process
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    Worker 1    Worker 2    Worker N
    ┌──────┐    ┌──────┐    ┌──────┐
    │  V8  │    │  V8  │    │  V8  │
    │Isolate│   │Isolate│   │Isolate│
    │Context│   │Context│   │Context│
    │(独立) │   │(独立) │   │(独立) │
    └──────┘    └──────┘    └──────┘
```

- 每个 Worker 持有独立的 V8 Isolate → 完全隔离
- Skeleton + Bundle 每个 Worker 独立加载 → 无共享状态
- 任务结束释放所有 DOM 文档 → 无泄漏
- 心跳监控 + 自动回收 → 稳定运行

---

## 六、项目边界

### Leap 做什么
- 提供指纹级别拟真的浏览器环境骨架
- 完整的 DOM 树操作能力
- Hook/Monitor 全链路属性访问追踪
- 高并发隔离执行
- 支持外部注入 `cookie + 指纹快照` 的签名计算任务执行
- 按需补全的灵活扩展机制

### Leap 不做什么
- 不实现完整的浏览器渲染引擎
- 不承担真实网络请求主链路（`fetch/XHR` 默认由用户按需 stub 或稳定占位，真实请求在外部系统完成）
- 不实现完整的 CSS 计算（DoD 布局引擎提供基本盒模型）
- 不运行真实的 Web Workers / Service Workers

---

## 七、当前主线：高并发签名计算容器

### 7.1 主线定位

当前阶段 Leap 的主线目标不是"通用浏览器"，而是：

- **高并发签名计算容器**
- **指纹浏览器补环境内核**
- **外部注入 cookie + 指纹快照，容器内执行签名脚本**

工作流：
- 真实浏览器/外部系统先负责拿到每个号的 `cookie` 与指纹信息
- Leap 容器负责在隔离 V8 环境中复现该指纹并执行签名计算
- 最终输出签名结果供外部请求链路使用

### 7.2 设计优先级

1. **高并发吞吐与稳定性**
2. **对象真实性**（C++ skeleton 创建、品牌/原型链/descriptor）
3. **目标脚本所需 API 的最小真实行为**
4. **低频 API 的占位与枚举外观**
5. 全量浏览器 API 覆盖

### 7.3 对象三态策略

针对被检测对象，Leap 采用三态策略：

| 态 | 定义 | 场景 |
|----|------|------|
| **真实最小实现** | 完整可用的行为 | 高频会被调用的对象/方法 |
| **标准占位空壳** | C++ skeleton 创建，保留品牌/原型链/descriptor，但无业务逻辑 | 高频被枚举/反射检测，但调用概率低的对象 |
| **不暴露** | 完全隐藏 | 低价值且高成本、暴露后更易穿帮的对象 |

"占位空壳"优先使用 C++ skeleton 体系创建对象（而非 JS mock），以保留正确品牌、原型链、descriptor 和属性顺序外观。

---

## 架构图（总览）

```
目标代码 JS
    │
    ▼
+---------------------------+
|  leap-vm (C++ / V8)       |
|  - 原生对象 / 品牌标记       |
|  - StubCallback           |
|  - Hook / Monitor         |
+-------------+-------------+
              │
              ▼
      __LEAP_DISPATCH__
              │
              ▼
+---------------------------+
|  leap-env (JS Runtime)    |
|  - Skeleton 蓝图           |
|  - Impl 行为实现           |
|  - Bundle / 实例初始化      |
+-------------+-------------+
              │
              ▼
+---------------------------+
|  tests/ (根编排)          |
|  smoke / full / perf      |
|  结果产物与基线管理          |
+---------------------------+
```
