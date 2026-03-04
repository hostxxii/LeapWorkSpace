/**
 * Data-Oriented Design (DoD) Layout Engine
 *
 * 纯数据导向的布局引擎，用连续的 ArrayBuffer 替代 OOP 的对象树
 * 目标：3-4 倍性能提升，消除 GC 停顿
 *
 * 使用场景：
 * - 单 worker 中计算大型 DOM 树
 * - worker pool 中处理多棵独立树（并发）
 * - 需要高频率布局更新的应用
 */

/**
 * DoD 树数据结构
 *
 * 所有节点数据存储在数组中，而非对象树
 * 使用节点 ID（index）作为引用
 */
class DoDTree {
  constructor(nodeCount = 512) {
    this.nodeCount = 0;
    this.capacity = nodeCount;

    // ============ 浮点属性 (Float64Array) ============
    // 输入样式
    this.widths = new Float64Array(nodeCount);
    this.heights = new Float64Array(nodeCount);
    this.left = new Float64Array(nodeCount);        // 相对父的 left
    this.top = new Float64Array(nodeCount);         // 相对父的 top
    this.margins = new Float64Array(nodeCount * 4); // left, top, right, bottom
    this.paddings = new Float64Array(nodeCount * 4);

    // 计算结果
    this.computedWidths = new Float64Array(nodeCount);
    this.computedHeights = new Float64Array(nodeCount);
    this.computedLefts = new Float64Array(nodeCount);
    this.computedTops = new Float64Array(nodeCount);

    // ============ 整数属性 (Int32Array) ============
    this.parents = new Int32Array(nodeCount);       // parent[i] = node i 的父节点 ID
    this.childrenStart = new Int32Array(nodeCount); // 子节点列表的起始位置
    this.childrenCount = new Int32Array(nodeCount); // 子节点数量
    // 稳定父子关系索引（避免 DFS 插入导致 childrenStart 连续区间失真）
    this.firstChild = new Int32Array(nodeCount);
    this.nextSibling = new Int32Array(nodeCount);
    this.lastChild = new Int32Array(nodeCount);

    // 子节点列表（平坦化存储）
    this.childrenList = new Int32Array(nodeCount * 4); // 平均 4 个子节点
    this.childrenListSize = 0;

    this.childrenStart.fill(-1);
    this.firstChild.fill(-1);
    this.nextSibling.fill(-1);
    this.lastChild.fill(-1);

    // 位标志（可选优化）
    this.flags = new Uint8Array(nodeCount); // 用于标记 dirty, visited 等

    // ============ 支持百分比和 calc() ============
    // 存储原始的样式元数据（支持百分比/calc/auto）
    // widthType: 0=px, 1=%, 2=auto, 3=calc-percentage
    this.widthTypes = new Uint8Array(nodeCount);
    this.heightTypes = new Uint8Array(nodeCount);
    this.calcOffsets = new Float64Array(nodeCount); // 用于 calc() 的 offset（如 100% - 20px）

    // 元数据
    this.rootId = 0;
    this.timestamp = Date.now();
  }

  /**
   * 添加节点
   * @returns {number} 节点 ID
   */
  addNode(parentId = -1) {
    if (this.nodeCount >= this.capacity) {
      throw new Error(`Tree capacity ${this.capacity} exceeded`);
    }

    const nodeId = this.nodeCount++;
    this.parents[nodeId] = parentId;

    if (parentId >= 0) {
      // 添加到父节点的子节点列表
      const count = this.childrenCount[parentId];

      if (this.childrenListSize + 1 > this.childrenList.length) {
        // 扩展 childrenList
        const newList = new Int32Array(Math.ceil(this.childrenList.length * 1.5));
        newList.set(this.childrenList);
        this.childrenList = newList;
      }

      // 如果是第一个子节点，记录起始位置
      if (count === 0) {
        this.childrenStart[parentId] = this.childrenListSize;
      }

      // 维护稳定父子链表（推荐读取方式）
      if (count === 0) {
        this.firstChild[parentId] = nodeId;
      } else {
        const prevLast = this.lastChild[parentId];
        if (prevLast >= 0) {
          this.nextSibling[prevLast] = nodeId;
        }
      }
      this.lastChild[parentId] = nodeId;

      // 保留 legacy childrenList（用于历史兼容）
      this.childrenList[this.childrenListSize] = nodeId;
      this.childrenCount[parentId]++;
      this.childrenListSize++;
    }

    return nodeId;
  }

  /**
   * 设置节点的样式属性
   */
  setStyle(nodeId, width, height, left = 0, top = 0) {
    this.widths[nodeId] = width;
    this.heights[nodeId] = height;
    this.left[nodeId] = left;
    this.top[nodeId] = top;
  }

  /**
   * 设置内外边距
   */
  setMargin(nodeId, left, top, right, bottom) {
    const idx = nodeId * 4;
    this.margins[idx] = left;
    this.margins[idx + 1] = top;
    this.margins[idx + 2] = right;
    this.margins[idx + 3] = bottom;
  }

  setPadding(nodeId, left, top, right, bottom) {
    const idx = nodeId * 4;
    this.paddings[idx] = left;
    this.paddings[idx + 1] = top;
    this.paddings[idx + 2] = right;
    this.paddings[idx + 3] = bottom;
  }

  /**
   * 获取节点的所有子节点 ID
   */
  getChildren(nodeId) {
    const result = [];
    let childId = this.firstChild[nodeId];
    while (childId >= 0) {
      result.push(childId);
      childId = this.nextSibling[childId];
    }
    return result;
  }

  /**
   * 调试：输出树的结构（JSON 格式）
   */
  debug(nodeId = 0, indent = 0) {
    const prefix = '  '.repeat(indent);
    const w = this.computedWidths[nodeId];
    const h = this.computedHeights[nodeId];
    const l = this.computedLefts[nodeId];
    const t = this.computedTops[nodeId];

    console.log(`${prefix}[${nodeId}] ${w}×${h} @ (${l}, ${t})`);

    const children = this.getChildren(nodeId);
    for (const childId of children) {
      this.debug(childId, indent + 1);
    }
  }

  /**
   * 获取所有用于 transferable 的 ArrayBuffer
   * （用于 worker 消息传递）
   */
  getTransferables() {
    const buffers = new Set();

    // 收集所有 ArrayBuffer
    [
      this.widths,
      this.heights,
      this.left,
      this.top,
      this.margins,
      this.paddings,
      this.computedWidths,
      this.computedHeights,
      this.computedLefts,
      this.computedTops,
      this.parents,
      this.childrenStart,
      this.childrenCount,
      this.firstChild,
      this.nextSibling,
      this.lastChild,
      this.childrenList,
      this.flags,
    ].forEach((arr) => {
      if (arr.buffer) {
        buffers.add(arr.buffer);
      }
    });

    return Array.from(buffers);
  }
}

/**
 * 从 OOP DOM 树转换为 DoD 结构
 */
class DomToDoDConverter {
  constructor() {
    this.tree = null;
    this.nodeId = 0;
  }

  /**
   * 转换一个 DOM 节点树
   */
  convert(domNode, expectedNodeCount = 512) {
    this.tree = new DoDTree(Math.max(expectedNodeCount, 512));
    this.nodeId = 0;

    const rootId = this._dfs(domNode, -1);
    this.tree.rootId = rootId;

    return this.tree;
  }

  _dfs(domNode, parentId) {
    const nodeId = this.tree.addNode(parentId);

    // 提取样式，优先使用 computed style（用于真实DOM），fallback 到 inline style
    const styles = this._getStyles(domNode);

    // 解析宽度和高度，处理百分比/auto/calc()
    const widthInfo = this._parseValue(styles.width, 0);
    const heightInfo = this._parseValue(styles.height, 0);
    const leftInfo = this._parseValue(styles.left, 0);
    const topInfo = this._parseValue(styles.top, 0);

    // 存储样式（使用解析值）
    this.tree.setStyle(
      nodeId,
      widthInfo.value,
      heightInfo.value,
      leftInfo.value,
      topInfo.value
    );

    // 存储类型信息
    this.tree.widthTypes[nodeId] = this._getTypeCode(widthInfo);
    this.tree.heightTypes[nodeId] = this._getTypeCode(heightInfo);
    if (widthInfo.hasOffset) {
      this.tree.calcOffsets[nodeId] = widthInfo.offset;
    }

    // 设置 margin 和 padding
    if (styles.marginLeft || styles.marginTop || styles.marginRight || styles.marginBottom) {
      this.tree.setMargin(
        nodeId,
        this._parseLength(styles.marginLeft, 0),
        this._parseLength(styles.marginTop, 0),
        this._parseLength(styles.marginRight, 0),
        this._parseLength(styles.marginBottom, 0)
      );
    }

    if (styles.paddingLeft || styles.paddingTop || styles.paddingRight || styles.paddingBottom) {
      this.tree.setPadding(
        nodeId,
        this._parseLength(styles.paddingLeft, 0),
        this._parseLength(styles.paddingTop, 0),
        this._parseLength(styles.paddingRight, 0),
        this._parseLength(styles.paddingBottom, 0)
      );
    }

    // 递归处理子节点
    if (domNode.children) {
      for (const child of domNode.children) {
        this._dfs(child, nodeId);
      }
    }

    return nodeId;
  }

  /**
   * 获取类型编码
   * 0 = px, 1 = %, 2 = auto, 3 = calc with percentage
   */
  _getTypeCode(valueInfo) {
    if (valueInfo.isPercentage && valueInfo.hasOffset) return 3;
    if (valueInfo.isPercentage) return 1;
    if (valueInfo.value === 0 && valueInfo.isAuto) return 2;
    return 0;
  }

  /**
   * 获取节点的样式属性
   * 优先使用 getComputedStyle（真实 DOM），fallback 到 inline style（Mock 对象）
   */
  _getStyles(domNode) {
    // 尝试使用 getComputedStyle（真实 DOM 环境）
    if (typeof domNode.getBoundingClientRect === 'function') {
      try {
        const computed = typeof window !== 'undefined' && window.getComputedStyle
          ? window.getComputedStyle(domNode)
          : null;

        if (computed) {
          return {
            width: computed.width,
            height: computed.height,
            left: computed.left,
            top: computed.top,
            marginLeft: computed.marginLeft,
            marginTop: computed.marginTop,
            marginRight: computed.marginRight,
            marginBottom: computed.marginBottom,
            paddingLeft: computed.paddingLeft,
            paddingTop: computed.paddingTop,
            paddingRight: computed.paddingRight,
            paddingBottom: computed.paddingBottom,
            display: computed.display,
            position: computed.position
          };
        }
      } catch (_) {
        // fallthrough to inline style
      }
    }

    // Fallback：使用 inline style（Mock 对象或简单 DOM）
    const style = domNode.style || {};
    return {
      width: style.width || domNode.width || 0,
      height: style.height || domNode.height || 0,
      left: style.left || domNode.left || 0,
      top: style.top || domNode.top || 0,
      marginLeft: style.marginLeft || domNode.marginLeft || 0,
      marginTop: style.marginTop || domNode.marginTop || 0,
      marginRight: style.marginRight || domNode.marginRight || 0,
      marginBottom: style.marginBottom || domNode.marginBottom || 0,
      paddingLeft: style.paddingLeft || domNode.paddingLeft || 0,
      paddingTop: style.paddingTop || domNode.paddingTop || 0,
      paddingRight: style.paddingRight || domNode.paddingRight || 0,
      paddingBottom: style.paddingBottom || domNode.paddingBottom || 0,
      display: style.display || 'block',
      position: style.position || 'static'
    };
  }

  _parseLength(val, defaultVal = 0) {
    if (!val) return defaultVal;
    if (typeof val === 'number') return val;
    if (val === 'auto') return defaultVal;

    const num = parseFloat(val);
    return isNaN(num) ? defaultVal : num;
  }

  /**
   * 处理百分比值（需要上下文信息）
   * 返回 { value, isPercentage, isAuto, hasOffset, offset }
   */
  _parseValue(val, defaultVal = 0) {
    if (!val) return { value: defaultVal, isPercentage: false, isAuto: false };
    if (typeof val === 'number') return { value: val, isPercentage: false, isAuto: false };
    if (val === 'auto') return { value: defaultVal, isPercentage: false, isAuto: true };

    const strVal = String(val).trim();
    if (strVal.endsWith('%')) {
      const num = parseFloat(strVal);
      return { value: isNaN(num) ? defaultVal : num, isPercentage: true, isAuto: false };
    }

    if (strVal.includes('calc(')) {
      return { ...this._parseCalc(strVal), isAuto: false };
    }

    const num = parseFloat(strVal);
    return { value: isNaN(num) ? defaultVal : num, isPercentage: false, isAuto: false };
  }

  /**
   * 简单的 calc() 解析（支持 calc(100% - 20px) 格式）
   */
  _parseCalc(expr) {
    // 简化版：只处理 "calc(Apx ± Bpx)" 或 "calc(A% ± Bpx)"
    const match = expr.match(/calc\s*\(\s*([^)]+)\s*\)/);
    if (!match) return { value: 0, isPercentage: false };

    const content = match[1].trim();

    // 处理 "100% - 20px" 这样的表达式
    const percentMatch = content.match(/(\d+(?:\.\d+)?)\%\s*([+\-*\/])\s*(\d+(?:\.\d+)?)px/);
    if (percentMatch) {
      const percentVal = parseFloat(percentMatch[1]);
      const op = percentMatch[2];
      const pxVal = parseFloat(percentMatch[3]);

      // 返回一个特殊格式表示 "percentage + offset"
      return {
        value: percentVal,
        offset: op === '+' ? pxVal : -pxVal,
        isPercentage: true,
        hasOffset: true
      };
    }

    // 处理简单的数字
    const num = parseFloat(content);
    return { value: isNaN(num) ? 0 : num, isPercentage: false };
  }
}

/**
 * DoD 布局计算引擎
 *
 * 简化的布局算法（不包含 Yoga 的复杂特性）
 */
class DoDLayoutEngine {
  /**
   * 计算树的布局
   *
   * @param {DoDTree} tree
   * @param {number} containerWidth - 容器宽度（通常是 window.innerWidth）
   * @param {number} containerHeight - 容器高度
   * @param {boolean} resetComputed - 是否重置计算结果（用于 profile）
   */
  static compute(tree, containerWidth = 800, containerHeight = 600, resetComputed = true) {
    // 清空计算结果（可选，用于性能测试）
    if (resetComputed) {
      tree.computedWidths.fill(0);
      tree.computedHeights.fill(0);
      tree.computedLefts.fill(0);
      tree.computedTops.fill(0);
    }

    // 从根节点开始，自顶向下计算
    this._computeNode(tree, tree.rootId, 0, 0, containerWidth, containerHeight);
  }

  /**
   * 递归计算节点及其子节点的布局
   *
   * 性能优化（Phase 2C-4）：
   *   - 直接访问 firstChild/nextSibling，避免 getChildren() 创建临时数组
   *   - 局部变量缓存频繁访问的数组引用，减少属性查找开销
   */
  static _computeNode(tree, nodeId, parentLeft, parentTop, parentWidth, parentHeight) {
    // 局部变量缓存数组引用（避免重复属性查找）
    const widths = tree.widths;
    const heights = tree.heights;
    const lefts = tree.left;
    const tops = tree.top;
    const widthTypes = tree.widthTypes;
    const heightTypes = tree.heightTypes;
    const calcOffsets = tree.calcOffsets;
    const computedWidths = tree.computedWidths;
    const computedHeights = tree.computedHeights;
    const computedLefts = tree.computedLefts;
    const computedTops = tree.computedTops;
    const firstChild = tree.firstChild;
    const nextSibling = tree.nextSibling;

    // 内联递归函数，避免外层方法调用开销
    const compute = (id, pLeft, pTop, pWidth, pHeight) => {
      const width = widths[id];
      const height = heights[id];
      const widthType = widthTypes[id];
      const heightType = heightTypes[id];

      // 计算实际宽度
      let computedWidth;
      if (widthType === 0) {
        computedWidth = width > 0 ? width : pWidth;
      } else if (widthType === 1) {
        computedWidth = pWidth * (width / 100);
      } else if (widthType === 2) {
        computedWidth = pWidth;
      } else {
        // type === 3：calc(%) + offset
        computedWidth = pWidth * (width / 100) + calcOffsets[id];
      }

      // 计算实际高度
      let computedHeight;
      if (heightType === 0) {
        computedHeight = height > 0 ? height : pHeight;
      } else if (heightType === 1) {
        computedHeight = pHeight * (height / 100);
      } else if (heightType === 2) {
        computedHeight = pHeight;
      } else {
        computedHeight = pHeight * (height / 100) + calcOffsets[id];
      }

      // 绝对坐标
      const cLeft = pLeft + lefts[id];
      const cTop = pTop + tops[id];

      // 确保非负
      if (computedWidth < 0) computedWidth = 0;
      if (computedHeight < 0) computedHeight = 0;

      // 写入结果
      computedLefts[id] = cLeft;
      computedTops[id] = cTop;
      computedWidths[id] = computedWidth;
      computedHeights[id] = computedHeight;

      // 遍历子节点（稳定链表，无临时数组）
      let childId = firstChild[id];
      while (childId >= 0) {
        compute(childId, cLeft, cTop, computedWidth, computedHeight);
        childId = nextSibling[childId];
      }
    };

    compute(nodeId, parentLeft, parentTop, parentWidth, parentHeight);
  }

  /**
   * 计算单个节点的布局（用于增量更新）
   * 从父节点的已计算结果获取上下文，仅重算该节点及其子树
   */
  static computeNodeDirty(tree, nodeId) {
    const parentId = tree.parents[nodeId];
    if (parentId < 0) {
      // 根节点：用容器尺寸（保存在 computedWidths/Heights[0] 前需另存，此处退化为全量）
      this._computeNode(tree, nodeId, 0, 0, tree.computedWidths[nodeId] || 800, tree.computedHeights[nodeId] || 600);
    } else {
      this._computeNode(
        tree, nodeId,
        tree.computedLefts[parentId],
        tree.computedTops[parentId],
        tree.computedWidths[parentId],
        tree.computedHeights[parentId]
      );
    }
  }
}

// ============ Phase 2C：性能优化 ============

/**
 * ArrayBuffer 内存池
 * 避免频繁的 GC 压力，复用 TypedArray 缓冲区
 */
class ArrayBufferPool {
  constructor() {
    // size (元素数) -> Float64Array[]
    this.float64Pools = new Map();
    // size (元素数) -> Int32Array[]
    this.int32Pools = new Map();
    // size (元素数) -> Uint8Array[]
    this.uint8Pools = new Map();

    this.maxPerSize = 16; // 每个 size 最多缓存的数组数
    this.stats = { acquired: 0, released: 0, hits: 0, misses: 0 };
  }

  acquireFloat64(size) {
    this.stats.acquired++;
    const pool = this.float64Pools.get(size);
    if (pool && pool.length > 0) {
      this.stats.hits++;
      const arr = pool.pop();
      arr.fill(0); // 清零后复用
      return arr;
    }
    this.stats.misses++;
    return new Float64Array(size);
  }

  acquireInt32(size) {
    this.stats.acquired++;
    const pool = this.int32Pools.get(size);
    if (pool && pool.length > 0) {
      this.stats.hits++;
      const arr = pool.pop();
      arr.fill(0);
      return arr;
    }
    this.stats.misses++;
    return new Int32Array(size);
  }

  acquireUint8(size) {
    this.stats.acquired++;
    const pool = this.uint8Pools.get(size);
    if (pool && pool.length > 0) {
      this.stats.hits++;
      const arr = pool.pop();
      arr.fill(0);
      return arr;
    }
    this.stats.misses++;
    return new Uint8Array(size);
  }

  _releaseToPool(pools, arr, size) {
    this.stats.released++;
    if (!pools.has(size)) {
      pools.set(size, []);
    }
    const pool = pools.get(size);
    if (pool.length < this.maxPerSize) {
      pool.push(arr);
    }
    // 超过上限时直接丢弃（让 GC 回收）
  }

  releaseFloat64(arr) {
    this._releaseToPool(this.float64Pools, arr, arr.length);
  }

  releaseInt32(arr) {
    this._releaseToPool(this.int32Pools, arr, arr.length);
  }

  releaseUint8(arr) {
    this._releaseToPool(this.uint8Pools, arr, arr.length);
  }

  /**
   * 释放一棵 DoDTree 的所有数组回到池中
   * 注意：调用后不得再使用该 tree 的任何数组！
   */
  releaseTree(tree) {
    if (!tree) return;
    this.releaseFloat64(tree.widths);
    this.releaseFloat64(tree.heights);
    this.releaseFloat64(tree.left);
    this.releaseFloat64(tree.top);
    this.releaseFloat64(tree.margins);
    this.releaseFloat64(tree.paddings);
    this.releaseFloat64(tree.computedWidths);
    this.releaseFloat64(tree.computedHeights);
    this.releaseFloat64(tree.computedLefts);
    this.releaseFloat64(tree.computedTops);
    this.releaseFloat64(tree.calcOffsets);
    this.releaseInt32(tree.parents);
    this.releaseInt32(tree.childrenStart);
    this.releaseInt32(tree.childrenCount);
    this.releaseInt32(tree.firstChild);
    this.releaseInt32(tree.nextSibling);
    this.releaseInt32(tree.lastChild);
    this.releaseInt32(tree.childrenList);
    this.releaseUint8(tree.flags);
    this.releaseUint8(tree.widthTypes);
    this.releaseUint8(tree.heightTypes);
  }

  getStats() {
    const hitRate = this.stats.acquired > 0
      ? ((this.stats.hits / this.stats.acquired) * 100).toFixed(1)
      : '0.0';
    return { ...this.stats, hitRate: `${hitRate}%` };
  }
}

/**
 * 全局共享的 ArrayBufferPool（可选使用）
 */
const globalArrayBufferPool = new ArrayBufferPool();

/**
 * DoDTree 的 LRU 缓存
 *
 * 用于复用相同结构的 DOM 树转换结果（如爬虫多次访问同一页面模板）
 * 键策略：使用调用方传入的 key（例如 URL + 版本哈希），或自动生成
 */
class DoDTreeCache {
  /**
   * @param {number} maxSize - 最大缓存条数
   * @param {number} ttlMs - 每条缓存的 TTL（ms），0 表示永不过期
   */
  constructor(maxSize = 100, ttlMs = 60000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    // 使用 Map 保持插入顺序（最旧的在前面），便于 LRU 淘汰
    this.cache = new Map(); // key -> { tree, lastUsed, createdAt }
    this.stats = { gets: 0, hits: 0, misses: 0, evictions: 0, expired: 0 };
  }

  /**
   * 获取缓存的树；若不存在或已过期则返回 null
   */
  get(key) {
    this.stats.gets++;
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查 TTL
    if (this.ttlMs > 0 && Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      this.stats.expired++;
      this.stats.misses++;
      return null;
    }

    // LRU：移到末尾（最近使用）
    this.cache.delete(key);
    entry.lastUsed = Date.now();
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.tree;
  }

  /**
   * 存入缓存
   */
  set(key, tree) {
    // 如果 key 已存在，先删除（重新插入以更新顺序）
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // LRU 淘汰：当容量满时删除最久未使用的
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      tree,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    });
  }

  /**
   * 删除特定 key
   */
  invalidate(key) {
    return this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }

  getStats() {
    const hitRate = this.stats.gets > 0
      ? ((this.stats.hits / this.stats.gets) * 100).toFixed(1)
      : '0.0';
    return { ...this.stats, hitRate: `${hitRate}%`, size: this.cache.size };
  }
}

/**
 * 带增量更新的 DoD 布局引擎
 *
 * 适用于高频修改小部分 DOM 的场景（如动画、交互）
 * 工作原理：标记 dirty 节点，只重算受影响的子树
 */
class DoDLayoutEngineIncremental {
  constructor() {
    this.lastTree = null;
    this.lastContainerWidth = 0;
    this.lastContainerHeight = 0;
    // dirty set：存储需要重算的节点 ID
    this._dirtyNodes = new Set();
  }

  /**
   * 标记某个节点为 dirty（当其样式或结构改变时调用）
   * @param {number} nodeId
   */
  markDirty(nodeId) {
    this._dirtyNodes.add(nodeId);
  }

  /**
   * 标记整棵树为 dirty（用于强制全量重算）
   */
  markAllDirty() {
    this._dirtyNodes.add(-1); // -1 代表"全量"
  }

  /**
   * 判断是否需要重算
   */
  _needsFullRecompute(tree, containerWidth, containerHeight) {
    if (!this.lastTree) return true;
    if (this.lastTree !== tree) return true;
    if (this.lastContainerWidth !== containerWidth) return true;
    if (this.lastContainerHeight !== containerHeight) return true;
    if (this._dirtyNodes.has(-1)) return true;
    return false;
  }

  /**
   * 按需计算布局
   * @param {DoDTree} tree
   * @param {number} containerWidth
   * @param {number} containerHeight
   * @returns {{ fullRecompute: boolean, dirtyCount: number }}
   */
  computeIfDirty(tree, containerWidth = 800, containerHeight = 600) {
    const fullRecompute = this._needsFullRecompute(tree, containerWidth, containerHeight);

    if (fullRecompute) {
      // 全量重算
      DoDLayoutEngine.compute(tree, containerWidth, containerHeight);
      this.lastTree = tree;
      this.lastContainerWidth = containerWidth;
      this.lastContainerHeight = containerHeight;
      this._dirtyNodes.clear();
      return { fullRecompute: true, dirtyCount: 0 };
    }

    if (this._dirtyNodes.size === 0) {
      // 无变化，直接返回缓存结果
      return { fullRecompute: false, dirtyCount: 0 };
    }

    // 增量重算：对每个 dirty 节点从其父节点开始重算子树
    const dirtyCount = this._dirtyNodes.size;
    for (const nodeId of this._dirtyNodes) {
      DoDLayoutEngine.computeNodeDirty(tree, nodeId);
    }
    this._dirtyNodes.clear();

    return { fullRecompute: false, dirtyCount };
  }
}

/**
 * 性能基准
 */
class DoDLayoutBenchmark {
  /**
   * 生成一个宽树（用于性能测试）
   */
  static createWidthTree(nodeCount = 500) {
    const tree = new DoDTree(nodeCount);
    const rootId = tree.addNode(-1);

    tree.setStyle(rootId, 800, 600, 0, 0);

    // 添加子节点
    for (let i = 1; i < nodeCount; i++) {
      const childId = tree.addNode(rootId);
      const x = (i % 50) * 20;
      const y = Math.floor(i / 50) * 20;

      tree.setStyle(childId, 100, 100, x, y);
    }

    return tree;
  }

  /**
   * 生成一个深树（用于性能测试）
   */
  static createDeepTree(nodeCount = 500) {
    const tree = new DoDTree(nodeCount);
    let parentId = tree.addNode(-1);
    tree.setStyle(parentId, 800, 600, 0, 0);

    for (let i = 1; i < nodeCount; i++) {
      const childId = tree.addNode(parentId);
      tree.setStyle(childId, 100, 100, 10, 10);
      parentId = childId;
    }

    return tree;
  }

  /**
   * 运行性能基准
   */
  static runBenchmark(treeCount = 500, iterations = 100) {
    console.log(`\n=== DoD Layout Engine Benchmark ===`);
    console.log(`Tree size: ${treeCount} nodes, Iterations: ${iterations}\n`);

    // 创建测试树
    const tree = this.createWidthTree(treeCount);

    // 预热（让 V8 JIT 编译）
    for (let i = 0; i < 10; i++) {
      DoDLayoutEngine.compute(tree, 800, 600);
    }

    // 实际测试
    const startTime = Date.now();
    let totalTime = 0;

    for (let i = 0; i < iterations; i++) {
      const t0 = Date.now();
      DoDLayoutEngine.compute(tree, 800, 600);
      totalTime += Date.now() - t0;
    }

    const totalMs = Date.now() - startTime;
    const avgMs = totalMs / iterations;
    const rps = (1000 / avgMs).toFixed(2);

    console.log(`Total time: ${totalMs} ms`);
    console.log(`Avg time per layout: ${avgMs.toFixed(2)} ms`);
    console.log(`RPS (requests/sec): ${rps}`);
    console.log(`\nExpected improvement over OOP js: 3-4x`);
    console.log(`Expected RPS with OOP: ~${(rps / 3.5).toFixed(0)}`);

    return {
      totalMs,
      avgMs,
      rps: parseFloat(rps),
      treeSize: treeCount,
      iterations,
    };
  }
}

// ============ 导出 ============
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DoDTree,
    DomToDoDConverter,
    DoDLayoutEngine,
    DoDLayoutBenchmark,
    // Phase 2C 新增
    ArrayBufferPool,
    DoDTreeCache,
    DoDLayoutEngineIncremental,
    globalArrayBufferPool,
  };
}
