# DoD布局引擎

> 源文件：`leap-env/src/impl/dod-layout-engine.js`
> 更新：2026-03-03（M07 传输策略与树结构索引更新）

## 功能概述

数据导向设计（Data-Oriented Design）布局引擎，以连续 TypedArray 替代 OOP 对象树进行 DOM 布局计算。目标是消除 GC 停顿、提升 3-4 倍布局吞吐，适配线程池传输场景（默认 `transfer` 零拷贝，可回退 `clone`）。

本模块为纯 JS 实现，不依赖 NAPI，与 dispatch 系统无直接耦合。该文件有**双重使用路径**：① 位于 `impl/` 目录，会被 `generate-entry.js` 扫描并打包进 `leap.bundle.js`（IIFE 上下文，`module.exports` 无效，仅作为 VM 内可用代码）；② 线程池的 `thread-worker.js` 通过 `require` 独立加载原始文件（Node.js 上下文，`module.exports` 生效），用于 worker 侧布局计算。

## 关键机制

### 核心类

| 类 | 职责 |
|----|------|
| `DoDTree` | 数据结构：所有节点属性存储于 TypedArray，以节点 ID（数组 index）代替对象引用；支持 `getTransferables()` 获取所有 ArrayBuffer 用于 worker `postMessage` 转移 |
| `DomToDoDConverter` | 转换器：DFS 遍历 OOP DOM 树，提取样式（优先 `getComputedStyle`，fallback inline style）写入 DoDTree；支持 px/百分比/auto/`calc()` 类型编码 |
| `DoDLayoutEngine` | 纯静态引擎：`compute()` 自顶向下遍历 DoDTree 计算绝对坐标；`_computeNode()` 使用内联闭包 + 局部变量缓存数组引用，避免属性查找开销；`computeNodeDirty()` 支持增量子树重算 |
| `ArrayBufferPool` | 内存池（Phase 2C）：按尺寸分桶缓存 Float64/Int32/Uint8 数组，每个 size 最多保留 16 个；`releaseTree()` 一次性回收整棵树的所有 TypedArray |
| `DoDTreeCache` | LRU 缓存（Phase 2C）：key 由调用方传入（如 URL+版本哈希），默认容量 100、TTL 60s；Map 保持插入顺序，淘汰策略 LRU |
| `DoDLayoutEngineIncremental` | 增量引擎（Phase 2C）：维护 dirty 节点 Set（-1 表示全量），`computeIfDirty()` 判断是否需要全量或增量重算 |
| `DoDLayoutBenchmark` | 性能基准工具：生成宽树/深树，内置 V8 JIT 预热阶段 |

### 职责边界（与 DOM 树解耦）

- `DoDTree` 是布局阶段的**计算快照结构**，节点写入是 append/index 化设计，优先服务吞吐和可转移性。
- 真实 DOM 增删改查由 `domShared` 维护（`appendChild/removeChild/insertBefore/...`）；每次布局计算前由 `DomToDoDConverter` 重新投影为 DoD 输入。
- 因此“DoDTree 内部 append-only”不等于“DOM 无法删除节点”：两者职责不同，删除能力在 DOM 层已支持。
- 本模块不承担渲染绘制，仅提供检测边界所需的盒模型坐标计算。

### DoDTree 数据布局

```
Float64Array × 10：widths / heights / left / top / margins(×4) / paddings(×4)
                    computedWidths / computedHeights / computedLefts / computedTops / calcOffsets
Int32Array × 7：    parents / childrenStart / childrenCount / firstChild / nextSibling / lastChild / childrenList
Uint8Array × 3：    flags / widthTypes / heightTypes
```

宽度/高度类型编码：`0=px, 1=%, 2=auto, 3=calc(% + offset)`

说明：
- `firstChild/nextSibling/lastChild` 是当前推荐父子遍历索引，避免 DFS 插入场景下按连续区间读取 `childrenList` 的错配风险。
- `childrenStart/childrenCount/childrenList` 保留用于历史兼容和调试。

### 线程池集成路径

```
主线程：DomToDoDConverter.convert(domNode) → DoDTree
主线程：tree.getTransferables() → ArrayBuffer[]
主线程：postMessage({ tree, meta }, transferables)  ← 默认 transfer 零拷贝
Worker：DoDLayoutEngine.compute(tree, containerW, containerH)
Worker：postMessage({ computedXxx }, transferables)  ← 结果转回
```

如需回退拷贝模式：`dodTransferMode='clone'` 或 `LEAP_DOD_TRANSFER_MODE=clone`。

### Phase 2C 优化叠加

`_computeNode` 关键优化：进入递归前将所有 TypedArray 引用拷贝到局部变量，子节点遍历直接走 `firstChild/nextSibling` 链式索引（不创建临时数组），并避免对象属性重复查找。实测约减少 40% 的属性查找开销。

## 主要流程

### 全量计算

```
1. DomToDoDConverter.convert(domNode, expectedCount)
     └─ _dfs(node, parentId)
          ├─ DoDTree.addNode(parentId)   // O(1)，childrenList 动态扩容
          ├─ _getStyles(node)             // computed → inline fallback
          ├─ _parseValue(val)             // 解析 px/% /auto/calc()
          └─ 递归子节点

2. DoDLayoutEngine.compute(tree, containerW, containerH)
     └─ _computeNode(tree, rootId, 0, 0, containerW, containerH)
          └─ inline compute(id, pLeft, pTop, pWidth, pHeight)
               ├─ 根据 widthType/heightType 计算实际尺寸
               ├─ 写入 computedLefts/Tops/Widths/Heights
               └─ 遍历 firstChild -> nextSibling 链

3. 调用方读取 tree.computedWidths[nodeId] 等映射结果
```

### 增量更新（DoDLayoutEngineIncremental）

```
style 变化 → markDirty(nodeId)
下一帧     → computeIfDirty(tree, w, h)
               ├─ 若 dirty=-1 或容器变化 → 全量 compute()
               └─ 否则 → 对每个 dirty 节点调 computeNodeDirty()
```
