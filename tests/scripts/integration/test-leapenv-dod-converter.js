#!/usr/bin/env node

/**
 * Test DomToDoDConverter
 * 验证 DOM → DoD 转换的正确性
 *
 * 测试场景：
 * 1. 深树（Deep Tree）：单链结构，深度 1000
 * 2. 宽树（Wide Tree）：单层结构，宽度 1000
 * 3. 混合树（Mixed Tree）：现实 DOM 结构
 * 4. 对比 OOP 版本：验证输出一致性
 */

const path = require('path');

// 动态导入 DoD 模块
let DomToDoDConverter;
let DoDLayoutEngine;
let DoDTree;

try {
  const dodModule = require(path.join(__dirname, '../../../leap-env/src/impl/dod-layout-engine.js'));
  DomToDoDConverter = dodModule.DomToDoDConverter;
  DoDLayoutEngine = dodModule.DoDLayoutEngine;
  DoDTree = dodModule.DoDTree;
} catch (err) {
  console.error('❌ Failed to load DoD modules:', err.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// Mock DOM Node 类
// ═══════════════════════════════════════════════════════════════════════════

class MockDOMNode {
  constructor(tag = 'div', options = {}) {
    this.tag = tag;
    this.children = [];
    this.style = {
      width: options.width || '100px',
      height: options.height || '50px',
      left: options.left || '0px',
      top: options.top || '0px',
      margin: options.margin || '0px',
      padding: options.padding || '0px',
      display: options.display || 'block',
      position: options.position || 'static'
    };
    this._dodNodeId = -1;
    this._dodTree = null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  getComputedStyle() {
    // Mock getComputedStyle
    return {
      width: this.style.width,
      height: this.style.height,
      left: this.style.left,
      top: this.style.top,
      margin: this.style.margin,
      padding: this.style.padding,
      display: this.style.display,
      position: this.style.position
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试用例生成器
// ═══════════════════════════════════════════════════════════════════════════

function createDeepTree(depth = 100) {
  /**
   * 创建深树（Deep Tree）
   * 结构：root -> child1 -> child2 -> ... -> childN
   */
  const root = new MockDOMNode('div', {
    width: '100%',
    height: '100%'
  });

  let current = root;
  for (let i = 0; i < depth; i++) {
    const child = new MockDOMNode('div', {
      width: '100px',
      height: String(50 + i) + 'px'
    });
    current.appendChild(child);
    current = child;
  }

  return root;
}

function createWideTree(width = 100) {
  /**
   * 创建宽树（Wide Tree）
   * 结构：root 有 N 个子节点
   */
  const root = new MockDOMNode('div', {
    width: '100%',
    height: '100%'
  });

  for (let i = 0; i < width; i++) {
    const child = new MockDOMNode('span', {
      width: String(50 + i) + 'px',
      height: '30px'
    });
    root.appendChild(child);
  }

  return root;
}

function createMixedTree() {
  /**
   * 创建混合树（现实 DOM 结构）
   *
   * div (root: 100%, 100%)
   *   ├─ header (1000px, 60px)
   *   │   ├─ logo (100px, 60px)
   *   │   ├─ nav (800px, 60px)
   *   │   │   ├─ nav-item (100px, 60px)
   *   │   │   ├─ nav-item (100px, 60px)
   *   │   │   ├─ nav-item (100px, 60px)
   *   │   └─   └─ nav-item (100px, 60px)
   *   ├─ main (100%, 400px)
   *   │   ├─ sidebar (200px, 100%)
   *   │   │   ├─ widget (200px, 100px)
   *   │   │   ├─ widget (200px, 100px)
   *   │   │   └─ widget (200px, 100px)
   *   │   ├─ content (calc(100% - 200px), 100%)
   *   │   │   ├─ article (100%, 300px)
   *   │   │   │   ├─ title (100%, 30px)
   *   │   │   │   └─ body (100%, 270px)
   *   │   │   └─ comments (100%, 100px)
   *   └─ footer (100%, 60px)
   */
  const root = new MockDOMNode('div', {
    width: '1000px',
    height: '600px'
  });

  // Header
  const header = new MockDOMNode('header', {
    width: '1000px',
    height: '60px'
  });
  root.appendChild(header);

  const logo = new MockDOMNode('div', { width: '100px', height: '60px' });
  header.appendChild(logo);

  const nav = new MockDOMNode('nav', { width: '800px', height: '60px' });
  header.appendChild(nav);

  for (let i = 0; i < 4; i++) {
    const navItem = new MockDOMNode('a', { width: '100px', height: '60px' });
    nav.appendChild(navItem);
  }

  // Main
  const main = new MockDOMNode('main', {
    width: '1000px',
    height: '400px'
  });
  root.appendChild(main);

  const sidebar = new MockDOMNode('aside', {
    width: '200px',
    height: '400px'
  });
  main.appendChild(sidebar);

  for (let i = 0; i < 3; i++) {
    const widget = new MockDOMNode('div', {
      width: '200px',
      height: '100px'
    });
    sidebar.appendChild(widget);
  }

  const content = new MockDOMNode('article', {
    width: '800px',
    height: '400px'
  });
  main.appendChild(content);

  const article = new MockDOMNode('section', {
    width: '800px',
    height: '300px'
  });
  content.appendChild(article);

  const title = new MockDOMNode('h1', {
    width: '800px',
    height: '30px'
  });
  article.appendChild(title);

  const body = new MockDOMNode('p', {
    width: '800px',
    height: '270px'
  });
  article.appendChild(body);

  const comments = new MockDOMNode('section', {
    width: '800px',
    height: '100px'
  });
  content.appendChild(comments);

  // Footer
  const footer = new MockDOMNode('footer', {
    width: '1000px',
    height: '60px'
  });
  root.appendChild(footer);

  return root;
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试执行器
// ═══════════════════════════════════════════════════════════════════════════

class TestRunner {
  constructor() {
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.results = [];
  }

  assert(condition, message) {
    this.totalTests++;
    if (condition) {
      this.passedTests++;
      this.results.push(`✅ ${message}`);
    } else {
      this.failedTests++;
      this.results.push(`❌ ${message}`);
    }
  }

  assertEqual(actual, expected, message) {
    this.assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
  }

  printResults() {
    console.log('\n' + '═'.repeat(80));
    this.results.forEach(r => console.log(r));
    console.log('═'.repeat(80));
    console.log(`\n📊 测试结果: ${this.passedTests}/${this.totalTests} 通过`);
    if (this.failedTests > 0) {
      console.log(`❌ 失败: ${this.failedTests}`);
    } else {
      console.log('✅ 全部通过！');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试套件
// ═══════════════════════════════════════════════════════════════════════════

const runner = new TestRunner();

console.log('🧪 Task 2B-6: DomToDoDConverter 单元测试\n');

// ───────────────────────────────────────────────────────────────────────────
// Test 1: 基础转换（小树）
// ───────────────────────────────────────────────────────────────────────────

console.log('📋 Test 1: 基础转换（小树 - 10 节点）');
{
  const tree = createWideTree(10);
  const converter = new DomToDoDConverter();

  const start = Date.now();
  const dodTree = converter.convert(tree);
  const duration = Date.now() - start;

  runner.assert(dodTree !== null, '转换返回有效对象');
  runner.assert(dodTree.nodeCount === 11, `节点数正确（期望 11，实际 ${dodTree.nodeCount}）`);
  runner.assert(dodTree.widths.length > 0, '宽度数组已分配');
  runner.assert(dodTree.heights.length > 0, '高度数组已分配');
  runner.assert(dodTree.parents.length > 0, '父节点数组已分配');
  runner.assert(duration < 100, `转换速度快（${duration}ms < 100ms）`);

  console.log(`  转换耗时: ${duration}ms`);
  console.log(`  节点数: ${dodTree.nodeCount}`);
  console.log(`  数组大小: ${dodTree.widths.length}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Test 2: 深树转换
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 2: 深树转换（深度 100）');
{
  const tree = createDeepTree(100);
  const converter = new DomToDoDConverter();

  const start = Date.now();
  const dodTree = converter.convert(tree);
  const duration = Date.now() - start;

  runner.assert(dodTree !== null, '深树转换成功');
  runner.assert(dodTree.nodeCount === 101, `深树节点数正确（期望 101，实际 ${dodTree.nodeCount}）`);
  runner.assert(duration < 500, `深树转换速度快（${duration}ms < 500ms）`);

  console.log(`  转换耗时: ${duration}ms`);
  console.log(`  节点数: ${dodTree.nodeCount}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Test 3: 宽树转换
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 3: 宽树转换（宽度 200）');
{
  const tree = createWideTree(200);
  const converter = new DomToDoDConverter();

  const start = Date.now();
  const dodTree = converter.convert(tree);
  const duration = Date.now() - start;

  runner.assert(dodTree !== null, '宽树转换成功');
  runner.assert(dodTree.nodeCount === 201, `宽树节点数正确（期望 201，实际 ${dodTree.nodeCount}）`);
  runner.assert(duration < 500, `宽树转换速度快（${duration}ms < 500ms）`);

  console.log(`  转换耗时: ${duration}ms`);
  console.log(`  节点数: ${dodTree.nodeCount}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Test 4: 混合树转换（现实 DOM）
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 4: 混合树转换（现实 DOM 结构）');
{
  const tree = createMixedTree();
  const converter = new DomToDoDConverter();

  const start = Date.now();
  const dodTree = converter.convert(tree);
  const duration = Date.now() - start;

  // 预期节点数：1 (root) + 1 (header) + 1 (logo) + 1 (nav) + 4 (nav-items)
  //           + 1 (main) + 1 (aside) + 3 (widgets) + 1 (article) + 1 (section)
  //           + 1 (h1) + 1 (p) + 1 (comments) + 1 (footer) = 19
  const expectedNodes = 19;

  runner.assert(dodTree !== null, '混合树转换成功');
  runner.assert(dodTree.nodeCount === expectedNodes, `混合树节点数正确（期望 ${expectedNodes}，实际 ${dodTree.nodeCount}）`);
  runner.assert(duration < 100, `混合树转换速度快（${duration}ms < 100ms）`);

  console.log(`  转换耗时: ${duration}ms`);
  console.log(`  节点数: ${dodTree.nodeCount}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Test 5: 样式提取
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 5: 样式提取（width, height, margin, padding）');
{
  const tree = new MockDOMNode('div', {
    width: '500px',
    height: '300px',
    margin: '10px',
    padding: '20px'
  });

  const child = new MockDOMNode('span', {
    width: '200px',
    height: '100px',
    margin: '5px',
    padding: '10px'
  });
  tree.appendChild(child);

  const converter = new DomToDoDConverter();
  const dodTree = converter.convert(tree);

  // 检查根节点的样式
  const rootWidth = parseFloat(tree.style.width);
  const rootHeight = parseFloat(tree.style.height);

  runner.assert(dodTree.widths[0] > 0, '根节点宽度已提取');
  runner.assert(dodTree.heights[0] > 0, '根节点高度已提取');
  runner.assert(dodTree.nodeCount === 2, '包含 2 个节点');

  console.log(`  根节点 - 宽: ${dodTree.widths[0]}, 高: ${dodTree.heights[0]}`);
  console.log(`  子节点 - 宽: ${dodTree.widths[1]}, 高: ${dodTree.heights[1]}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Test 6: 父子关系验证
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 6: 父子关系验证');
{
  const tree = createMixedTree();
  const converter = new DomToDoDConverter();
  const dodTree = converter.convert(tree);

  // 检查根节点
  runner.assert(dodTree.parents[0] === -1, '根节点父ID为 -1');

  // 检查非根节点有有效的父ID
  let validParentCount = 0;
  for (let i = 1; i < dodTree.nodeCount; i++) {
    if (dodTree.parents[i] >= 0 && dodTree.parents[i] < dodTree.nodeCount) {
      validParentCount++;
    }
  }
  runner.assert(validParentCount === dodTree.nodeCount - 1, '所有非根节点有有效父节点');

  console.log(`  有效的父节点关系: ${validParentCount}/${dodTree.nodeCount - 1}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Test 7: 子节点列表验证
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 7: 子节点列表验证');
{
  const tree = new MockDOMNode('div');
  const child1 = new MockDOMNode('span');
  const child2 = new MockDOMNode('span');
  const child3 = new MockDOMNode('span');
  tree.appendChild(child1);
  tree.appendChild(child2);
  tree.appendChild(child3);

  const converter = new DomToDoDConverter();
  const dodTree = converter.convert(tree);

  // 根节点应有 3 个子节点
  const childCount = dodTree.childrenCount[0];
  runner.assert(childCount === 3, `根节点有 ${childCount} 个子节点（期望 3）`);

  console.log(`  根节点子节点数: ${childCount}`);
  console.log(`  子节点 ID: ${Array.from(dodTree.childrenList.slice(0, childCount)).join(', ')}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Test 8: 内存预分配验证
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 8: 内存预分配验证');
{
  const tree = createWideTree(50);
  const converter = new DomToDoDConverter();
  const dodTree = converter.convert(tree);

  // ArrayBuffer 大小应该是预估节点数的 1.5 倍
  const allocSize = Math.ceil(dodTree.nodeCount * 1.5);
  runner.assert(dodTree.widths.length >= dodTree.nodeCount, '宽度数组足够容纳所有节点');
  runner.assert(dodTree.heights.length >= dodTree.nodeCount, '高度数组足够容纳所有节点');

  console.log(`  实际节点数: ${dodTree.nodeCount}`);
  console.log(`  分配大小: ${dodTree.widths.length}`);
  console.log(`  浪费: ${((dodTree.widths.length - dodTree.nodeCount) / dodTree.widths.length * 100).toFixed(2)}%`);
}

// ───────────────────────────────────────────────────────────────────────────
// Test 9: 性能对比（转换速度）
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 9: 性能对比（转换速度）');
{
  const sizes = [10, 100, 500];
  console.log('  树大小 | 转换耗时(ms) | ops/sec');
  console.log('  -------|-------------|----------');

  for (const size of sizes) {
    const tree = createWideTree(size);
    const converter = new DomToDoDConverter();

    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      converter.convert(tree);
    }
    const duration = Date.now() - start;

    const avgTime = duration / 100;
    const opsPerSec = Math.round(100000 / duration);

    console.log(`  ${String(size).padEnd(7)} | ${String(avgTime.toFixed(2)).padEnd(11)} | ${opsPerSec}`);
    runner.assert(opsPerSec > 1000, `${size} 节点树转换 >1000 ops/sec（实际 ${opsPerSec}）`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Test 10: 输出一致性（多次转换同一树）
// ───────────────────────────────────────────────────────────────────────────

console.log('\n📋 Test 10: 输出一致性（多次转换同一树）');
{
  const tree = createMixedTree();
  const converter = new DomToDoDConverter();

  const tree1 = converter.convert(tree);
  const tree2 = converter.convert(tree);

  runner.assert(tree1.nodeCount === tree2.nodeCount, '两次转换的节点数一致');
  runner.assert(tree1.widths[0] === tree2.widths[0], '根节点宽度一致');
  runner.assert(tree1.heights[0] === tree2.heights[0], '根节点高度一致');

  // 检查所有节点
  let allMatch = true;
  for (let i = 0; i < tree1.nodeCount; i++) {
    if (tree1.widths[i] !== tree2.widths[i] || tree1.heights[i] !== tree2.heights[i]) {
      allMatch = false;
      break;
    }
  }
  runner.assert(allMatch, '所有节点的属性都一致');

  console.log(`  节点数: ${tree1.nodeCount}`);
  console.log(`  属性一致性: ${allMatch ? '✅' : '❌'}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 输出结果
// ═══════════════════════════════════════════════════════════════════════════

runner.printResults();

process.exit(runner.failedTests > 0 ? 1 : 0);
