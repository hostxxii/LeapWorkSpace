# Context 复用与 DOM 接入大纲

> 更新：2026-03-06

---

## 一、Context 复用架构

### 1. 核心思想

同一账号/站点的多次签名请求（翻页、加购、搜索等）共享同一个 Context，
就像真实浏览器中用户在同一标签页内反复操作一样。

### 2. 生命周期模型

```
VmInstance 创建（一次）
  │
  ├─ runScript(bundle)                    // 编译 + skeleton 三阶段构建（~15-20ms）
  │   └─ Code Cache 缓存编译产物          // 第二次起编译接近 0ms
  │
  └─ Context 就绪，进入复用循环
      │
      ├─ 绑定会话：bindSession(sessionConfig)
      │   ├─ applyFingerprintSnapshot()   // UA、screen、plugins 等
      │   ├─ applyStorageSnapshot()       // localStorage、sessionStorage
      │   ├─ applyDocumentSnapshot()      // cookie、referrer
      │   └─ injectSiteDOM()             // 可选：注入站点 DOM 片段
      │
      ├─ 请求 1：executeTask(script1)     // 翻页签名
      │   └─ 签名脚本执行，可能增删改查 DOM
      │
      ├─ 请求 2：executeTask(script2)     // 加购签名
      │   └─ DOM 保持上次状态（符合真实浏览器行为）
      │
      ├─ ...（同一会话的 N 次请求）
      │
      ├─ 解绑会话：unbindSession()
      │   └─ resetSignatureTaskState()    // 清理指纹 + DOM + storage
      │
      └─ 绑定新会话：bindSession(newConfig)  // 切换账号/站点
          └─ ...
```

### 3. 复用层级

| 层级 | 作用域 | 生命周期 | 包含内容 |
|------|--------|----------|----------|
| VmInstance | 进程级 | 长期 | V8 Isolate + 编译缓存 |
| Context | 站点级 | 中期（同一 skeleton 版本内） | skeleton 模板 + 原型链 + impl 注册表 |
| Session | 账号级 | 短期（一个账号的一批请求） | 指纹数据 + cookie + DOM 状态 |
| Task | 请求级 | 瞬时 | 单次签名执行 |

### 4. Session 内的 DOM 状态策略

签名脚本在 Session 内对 DOM 的修改，有两种处理策略：

**策略 A：保留修改（推荐，更像真实浏览器）**

```
请求 1：脚本创建了 <script id="h5st-loader"> 并插入 body
请求 2：document.querySelector('#h5st-loader') 能找到
         → 和真实浏览器行为一致
```

适用于：同一签名脚本的连续调用（翻页场景）。
脚本通常会检查"我是否已经初始化过"，保留 DOM 状态避免重复初始化。

**策略 B：每次重置到初始 DOM**

```
请求 1：脚本修改 DOM
Session.resetDOM()：DOM 恢复到 bindSession 时的状态
请求 2：脚本看到干净的 DOM
```

适用于：每次请求都是独立签名的场景。
需要实现 DOM 树的快照/恢复（DOD 结构天然适合做浅拷贝）。

### 5. 池化管理

```
ContextPool
  ├─ idle contexts（空闲，已完成 skeleton 构建）
  ├─ bound contexts（已绑定 Session）
  └─ 淘汰策略：
      ├─ skeleton 版本变更 → 销毁旧 Context，创建新的
      ├─ Session 超时（如 5 分钟无请求）→ unbind，回收到 idle
      └─ 内存压力 → 销毁最久未使用的 idle Context
```

### 6. 与现有代码的对接点

| 功能 | 现有实现 | 复用架构需要的改动 |
|------|----------|-------------------|
| 指纹注入 | applyFingerprintSnapshot() | 无需改动，直接复用 |
| 指纹清理 | resetSignatureTaskState() | 无需改动，unbindSession 时调用 |
| DOM 初始化 | ensureDocumentDefaultTree() | 无需改动 |
| DOM 重置 | releaseTaskScope() | 可能需要一个"重置到骨架"的轻量版本 |
| skeleton 替换 | 重新 build + runScript | 需要销毁旧 Context 池，创建新的 |
| Code Cache | CreateCodeCache/RunScriptWithCache | 已有，加速 Context 创建 |

---

## 二、DOM 接入分析：是否需要真实 HTML

### 1. 核心认知：目标代码的感知边界

目标脚本操作的每一个 DOM 节点都是 skeleton 实例，每一次属性访问
都经过 C++ interceptor → impl dispatch。目标代码**无法绕过 impl 层
直接触及 DOD 内部数据**。

因此，目标代码的感知边界 = skeleton impl 的返回值。

以 h5st 的实际 hook log 为证（log.md）：

```
Document.createElement('script')     → skeleton HTMLScriptElement 实例
Document.getElementsByTagName('head') → HTMLCollection {length: 1}
Document.head                         → skeleton HTMLHeadElement 实例
Element.childElementCount             → 数字（impl 返回值）
Document.body                         → skeleton HTMLBodyElement 实例
Element.innerHTML                     → 空字符串（impl 返回值）
Element.getAttribute('xxx')           → null（impl 返回值）
Node.appendChild(script)              → DOD 挂载，返回同一个 skeleton 实例
```

**所有返回值都可以在 impl 层控制**，不需要底层真的存在对应的 DOM 结构。

### 2. 绝大多数场景不需要真实 HTML

| 操作 | 为什么不需要真实 HTML |
|------|----------------------|
| `document.cookie` / `referrer` / `URL` | getter 直接返回注入值 |
| `navigator.*` / `screen.*` | signatureTaskState 覆盖 |
| `document.createElement(tag)` + 增删改查 | DOD 闭环，节点是 skeleton 实例 |
| `document.body.appendChild(...)` | 骨架有 body，挂载正常 |
| `document.scripts.length` | 可拦截，impl 返回任意值 |
| `document.body.childElementCount` | 可拦截，impl 返回任意值 |
| `document.body.innerHTML` | 可拦截，impl 返回任意字符串 |
| `element.getBoundingClientRect()` | DOD layout engine 返回合理值 |
| `window.getComputedStyle(el)` | 返回 inline style 或默认值 |
| `document.querySelector('meta')` | 返回 null，脚本通常有 fallback |

### 3. 唯一需要真实 HTML 的情况

**签名脚本从 DOM 节点内容中提取值，直接参与签名计算：**

```js
var token = document.getElementById('__TOKEN__').textContent;
sign = hmac(token + timestamp);  // token 值影响最终签名
```

这不是 DOM 结构问题，而是**签名参数缺失**的问题。
解决方式也不一定需要 HTML —— 知道 token 值后，可以通过
siteProfile 注入一个包含该值的节点即可。

从 h5st 的 log 看，它没有这种行为。DOM 操作纯粹是环境检测，
不影响签名计算结果。

### 4. 如果将来遇到需要 DOM 内容的站点

在 siteProfile 中可选注入 DOM 片段：

```json
{
  "domTemplate": "<meta name='csrf-token' content='{{token}}'>"
}
```

bindSession 时用已有的 `parseHTMLIntoDocument` 注入即可。
这是数据层面的扩展，不需要改动架构。

---

## 三、实施优先级

```
阶段 1（当前可做）：
  └─ Context 复用基础
     ├─ 同一 Context 连续执行多个 Task
     ├─ Session bind/unbind 生命周期
     └─ 验证 resetSignatureTaskState() 清理的完整性

阶段 2（按需）：
  └─ DOM 模板注入
     ├─ siteProfile 增加 domTemplate 字段
     ├─ bindSession 时调用 parseHTMLIntoDocument
     └─ unbindSession 时清空 DOM 回骨架

阶段 3（优化）：
  └─ Context 池化
     ├─ idle/bound 状态管理
     ├─ skeleton 版本热切换
     └─ 超时回收 + 内存压力淘汰

阶段 4（可选）：
  └─ Session 内 DOM 快照/恢复
     ├─ DOD 结构浅拷贝实现 snapshotDOM()
     └─ 每次 Task 前可选恢复到初始状态
```
