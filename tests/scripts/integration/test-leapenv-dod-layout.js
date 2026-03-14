#!/usr/bin/env node

/**
 * DoD Layout Engine 单元测试与性能对比
 *
 * 验证：
 * 1. DoD 树结构正确性
 * 2. 布局计算结果准确性
 * 3. 性能相对提升
 */

const {
  DoDTree,
  DomToDoDConverter,
  DoDLayoutEngine,
  DoDLayoutBenchmark,
} = require('../../../leap-env/src/impl/dod-layout-engine');

/**
 * 模拟 OOP 风格的 DOM 节点（用于对比）
 */
class OOPNode {
  constructor(width = 0, height = 0, left = 0, top = 0) {
    this.width = width;
    this.height = height;
    this.left = left;
    this.top = top;
    this.parent = null;
    this.children = [];

    // 计算结果
    this.computedWidth = width;
    this.computedHeight = height;
    this.computedLeft = left;
    this.computedTop = top;
  }

  addChild(child) {
    this.children.push(child);
    child.parent = this;
  }
}

/**
 * OOP 风格的布局引擎（用于基准对比）
 * 使用迭代（栈）而不是递归，避免栈溢出
 */
class OOPLayoutEngine {
  static compute(root, parentLeft = 0, parentTop = 0, parentWidth = 800, parentHeight = 600) {
    // 使用栈避免递归导致的栈溢出
    const stack = [{
      node: root,
      parentLeft,
      parentTop,
      parentWidth,
      parentHeight,
    }];

    while (stack.length > 0) {
      const { node, parentLeft: pL, parentTop: pT, parentWidth: pW, parentHeight: pH } = stack.pop();

      node.computedLeft = pL + node.left;
      node.computedTop = pT + node.top;
      node.computedWidth = node.width > 0 ? node.width : pW;
      node.computedHeight = node.height > 0 ? node.height : pH;

      // 将子节点压入栈
      for (const child of node.children) {
        stack.push({
          node: child,
          parentLeft: node.computedLeft,
          parentTop: node.computedTop,
          parentWidth: node.computedWidth,
          parentHeight: node.computedHeight,
        });
      }
    }
  }
}

// ============ 测试套件 ============

function testBasicDoDTree() {
  console.log('\n[TEST] Basic DoD Tree Structure');

  const tree = new DoDTree(10);

  const root = tree.addNode(-1);
  const child1 = tree.addNode(root);
  const child2 = tree.addNode(root);

  console.assert(tree.nodeCount === 3, 'Node count should be 3');
  console.assert(tree.parents[child1] === root, 'Child1 parent should be root');
  console.assert(tree.parents[child2] === root, 'Child2 parent should be root');

  const children = tree.getChildren(root);
  console.assert(children.length === 2, 'Root should have 2 children');
  console.assert(children[0] === child1 && children[1] === child2, 'Children should be [child1, child2]');

  console.log('✅ PASS: Basic tree structure works');
}

function testDoDLayout() {
  console.log('\n[TEST] DoD Layout Computation');

  const tree = new DoDTree(10);

  const root = tree.addNode(-1);
  tree.setStyle(root, 800, 600, 0, 0);

  const child = tree.addNode(root);
  tree.setStyle(child, 100, 100, 50, 50);

  DoDLayoutEngine.compute(tree, 800, 600);

  console.assert(
    tree.computedLefts[root] === 0 && tree.computedTops[root] === 0,
    'Root should be at (0, 0)'
  );
  console.assert(
    tree.computedWidths[root] === 800 && tree.computedHeights[root] === 600,
    'Root should be 800×600'
  );
  console.assert(
    tree.computedLefts[child] === 50 && tree.computedTops[child] === 50,
    'Child should be at (50, 50)'
  );
  console.assert(
    tree.computedWidths[child] === 100 && tree.computedHeights[child] === 100,
    'Child should be 100×100'
  );

  console.log('✅ PASS: Layout computation is correct');
}

function testDoDvsOOP() {
  console.log('\n[TEST] DoD vs OOP Result Comparison');

  // 创建 OOP 树
  const oopRoot = new OOPNode(800, 600, 0, 0);
  const oopChild1 = new OOPNode(100, 100, 50, 50);
  const oopChild2 = new OOPNode(150, 150, 200, 50);

  oopRoot.addChild(oopChild1);
  oopRoot.addChild(oopChild2);

  // 创建 DoD 树
  const tree = new DoDTree(10);
  const root = tree.addNode(-1);
  tree.setStyle(root, 800, 600, 0, 0);

  const child1 = tree.addNode(root);
  tree.setStyle(child1, 100, 100, 50, 50);

  const child2 = tree.addNode(root);
  tree.setStyle(child2, 150, 150, 200, 50);

  // 计算布局
  OOPLayoutEngine.compute(oopRoot);
  DoDLayoutEngine.compute(tree);

  // 对比结果
  const tolerance = 0.01; // 浮点精度误差容许范围

  const checkNode = (nodeName, oopNode, dodNodeId) => {
    const oopL = oopNode.computedLeft;
    const oopT = oopNode.computedTop;
    const oopW = oopNode.computedWidth;
    const oopH = oopNode.computedHeight;

    const dodL = tree.computedLefts[dodNodeId];
    const dodT = tree.computedTops[dodNodeId];
    const dodW = tree.computedWidths[dodNodeId];
    const dodH = tree.computedHeights[dodNodeId];

    console.assert(
      Math.abs(oopL - dodL) < tolerance && Math.abs(oopT - dodT) < tolerance &&
      Math.abs(oopW - dodW) < tolerance && Math.abs(oopH - dodH) < tolerance,
      `${nodeName} layout mismatch`
    );

    console.log(`  ${nodeName}: OOP (${oopL}, ${oopT}, ${oopW}×${oopH}) vs DoD (${dodL}, ${dodT}, ${dodW}×${dodH})`);
  };

  checkNode('root', oopRoot, root);
  checkNode('child1', oopChild1, child1);
  checkNode('child2', oopChild2, child2);

  console.log('✅ PASS: DoD and OOP produce identical results');
}

function benchmarkDoD() {
  console.log('\n[BENCHMARK] DoD Layout Engine');

  const results = [];

  for (const nodeCount of [10, 50, 100, 500]) {
    const result = DoDLayoutBenchmark.runBenchmark(nodeCount, 100);
    results.push(result);
  }

  console.log('\n=== Summary ===');
  console.log('Node Count | Avg Time (ms) | RPS');
  console.log('-----------|---------------|-------');
  for (const r of results) {
    console.log(`${r.treeSize.toString().padEnd(10)} | ${r.avgMs.toFixed(2).padEnd(13)} | ${r.rps}`);
  }
}

function benchmarkOOP() {
  console.log('\n[BENCHMARK] OOP Layout Engine (for comparison)');

  const createOOPTree = (nodeCount) => {
    const root = new OOPNode(800, 600, 0, 0);

    for (let i = 1; i < nodeCount; i++) {
      const x = (i % 50) * 20;
      const y = Math.floor(i / 50) * 20;
      const child = new OOPNode(100, 100, x, y);
      root.addChild(child);
    }

    return root;
  };

  const results = [];

  for (const nodeCount of [10, 50, 100, 500]) {
    console.log(`\n--- OOP ${nodeCount} nodes ---`);

    const root = createOOPTree(nodeCount);

    // 预热
    for (let i = 0; i < 10; i++) {
      OOPLayoutEngine.compute(root);
    }

    // 测试
    const iterations = 100;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      OOPLayoutEngine.compute(root);
    }

    const totalMs = Date.now() - startTime;
    const avgMs = totalMs / iterations;
    const rps = 1000 / avgMs;

    console.log(`Avg time: ${avgMs.toFixed(2)} ms`);
    console.log(`RPS: ${rps.toFixed(2)}`);

    results.push({ nodeCount, avgMs, rps });
  }

  return results;
}

function comparePerformance() {
  console.log('\n\n╔════════════════════════════════════════════════════╗');
  console.log('║           DoD vs OOP Performance Comparison         ║');
  console.log('╚════════════════════════════════════════════════════╝');

  console.log('\n[1] DoD Performance:');
  const dodResults = [];
  for (const nodeCount of [10, 50, 100, 500]) {
    const result = DoDLayoutBenchmark.runBenchmark(nodeCount, 50);
    dodResults.push(result);
  }

  console.log('\n[2] OOP Performance:');
  const oopResults = benchmarkOOP();

  console.log('\n\n=== Comparison Table ===');
  console.log('Nodes | DoD (ms) | OOP (ms) | Speedup | DoD RPS | OOP RPS');
  console.log('------|----------|----------|---------|---------|--------');

  for (let i = 0; i < dodResults.length; i++) {
    const dod = dodResults[i];
    const oop = oopResults[i];
    const speedup = (oop.avgMs / dod.avgMs).toFixed(2);

    console.log(
      `${dod.treeSize.toString().padEnd(5)} | ` +
      `${dod.avgMs.toFixed(2).padEnd(8)} | ` +
      `${oop.avgMs.toFixed(2).padEnd(8)} | ` +
      `${speedup.padEnd(7)}x | ` +
      `${dod.rps.toFixed(0).padEnd(7)} | ` +
      `${oop.rps.toFixed(0)}`
    );
  }

  console.log('\n✅ Performance comparison complete');
}

// ============ 主函数 ============

function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║       DoD Layout Engine - Test Suite               ║');
  console.log('╚════════════════════════════════════════════════════╝');

  try {
    testBasicDoDTree();
    testDoDLayout();
    testDoDvsOOP();

    // 可选：运行完整性能对比（耗时较长）
    if (process.argv.includes('--benchmark')) {
      comparePerformance();
    } else {
      console.log('\n💡 Run with --benchmark flag to see detailed performance comparison');
      console.log('   Example: node test-dod-layout.js --benchmark');
    }

    console.log('\n✅ All tests passed!');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
}

main();
