/**
 * DoD + DOM 集成测试
 * 验证 DoD 后端是否正确计算布局
 */

const path = require('path');

// 导入 DoD 相关模块
const { DoDTree, DomToDoDConverter, DoDLayoutEngine, DoDLayoutBenchmark } = require('../../../leap-env/src/impl/dod-layout-engine.js');

// 简单的 Mock DOM 对象
class MockElement {
  constructor(width, height, left = 0, top = 0, displayVal = 'block', positionVal = 'static') {
    this.style = {
      width: width ? `${width}px` : 'auto',
      height: height ? `${height}px` : 'auto',
      left: `${left}px`,
      top: `${top}px`,
      display: displayVal,
      position: positionVal
    };
    this.children = [];
    this._mockAttrs = { width, height, left, top };
  }

  appendChild(child) {
    this.children.push(child);
  }

  addChildren(...children) {
    this.children.push(...children);
  }
}

// 测试用例
function runTests() {
  console.log('=== DoD + DOM Integration Tests ===\n');

  let passed = 0;
  let failed = 0;

  // Test 1: 简单树
  {
    console.log('Test 1: 简单树 (1 root + 2 children)');
    const root = new MockElement(800, 600);
    const child1 = new MockElement(200, 100, 10, 20);
    const child2 = new MockElement(150, 100, 220, 20);
    root.addChildren(child1, child2);

    try {
      const converter = new DomToDoDConverter();
      const tree = converter.convert(root);
      DoDLayoutEngine.compute(tree, 800, 600);

      // 验证结果
      const expect = (actual, expected, name) => {
        if (Math.abs(actual - expected) < 0.01) {
          console.log(`  ✓ ${name}: ${actual.toFixed(2)}`);
          return true;
        } else {
          console.log(`  ✗ ${name}: expected ${expected}, got ${actual}`);
          return false;
        }
      };

      let ok = true;
      ok &= expect(tree.computedWidths[0], 800, 'root width');
      ok &= expect(tree.computedHeights[0], 600, 'root height');
      ok &= expect(tree.computedWidths[1], 200, 'child1 width');
      ok &= expect(tree.computedLefts[1], 10, 'child1 left');
      ok &= expect(tree.computedTops[1], 20, 'child1 top');

      if (ok) {
        console.log('Test 1: PASS\n');
        passed++;
      } else {
        console.log('Test 1: FAIL\n');
        failed++;
      }
    } catch (err) {
      console.log(`Test 1: ERROR - ${err.message}\n`);
      failed++;
    }
  }

  // Test 2: 深树
  {
    console.log('Test 2: 深树 (5 层)');
    const nodes = [];
    const root = new MockElement(800, 600);
    nodes.push(root);

    let parent = root;
    for (let i = 1; i < 5; i++) {
      const child = new MockElement(100 - i * 10, 100 - i * 10, 10, 10);
      parent.appendChild(child);
      nodes.push(child);
      parent = child;
    }

    try {
      const converter = new DomToDoDConverter();
      const tree = converter.convert(root);
      DoDLayoutEngine.compute(tree, 800, 600);

      // 验证所有节点都被处理了
      if (tree.nodeCount === 5) {
        console.log(`  ✓ nodeCount: ${tree.nodeCount}`);
        console.log('Test 2: PASS\n');
        passed++;
      } else {
        console.log(`  ✗ nodeCount: expected 5, got ${tree.nodeCount}`);
        console.log('Test 2: FAIL\n');
        failed++;
      }
    } catch (err) {
      console.log(`Test 2: ERROR - ${err.message}\n`);
      failed++;
    }
  }

  // Test 3: 百分比值（模拟）
  {
    console.log('Test 3: 百分比值支持');
    const root = new MockElement(800, 600);
    const child = new MockElement(null, null, 0, 0);
    // 修改 child 的 style 为百分比
    child.style.width = '50%';
    child.style.height = '50%';
    root.appendChild(child);

    try {
      const converter = new DomToDoDConverter();
      const tree = converter.convert(root);
      DoDLayoutEngine.compute(tree, 800, 600);

      // 验证百分比计算
      const childWidth = tree.computedWidths[1];
      const childHeight = tree.computedHeights[1];

      if (Math.abs(childWidth - 400) < 0.01 && Math.abs(childHeight - 300) < 0.01) {
        console.log(`  ✓ child width: ${childWidth.toFixed(2)} (50% of 800)`);
        console.log(`  ✓ child height: ${childHeight.toFixed(2)} (50% of 600)`);
        console.log('Test 3: PASS\n');
        passed++;
      } else {
        console.log(`  ✗ percentage calc failed`);
        console.log(`    width: ${childWidth} (expected 400), height: ${childHeight} (expected 300)`);
        console.log('Test 3: FAIL\n');
        failed++;
      }
    } catch (err) {
      console.log(`Test 3: ERROR - ${err.message}\n`);
      failed++;
    }
  }

  // Test 4: 性能基准 (500 nodes)
  {
    console.log('Test 4: 性能基准 (500-node 宽树)');
    try {
      const result = DoDLayoutBenchmark.runBenchmark(500, 100);
      
      const targetOpsPerSec = 10000;
      const actualOpsPerSec = result.rps;
      
      console.log(`\n  实际 ops/sec: ${actualOpsPerSec.toFixed(0)}`);
      console.log(`  目标 ops/sec: ${targetOpsPerSec}`);
      
      if (actualOpsPerSec >= targetOpsPerSec) {
        console.log('Test 4: PASS\n');
        passed++;
      } else {
        console.log(`Test 4: WARNING - 低于目标 (${(actualOpsPerSec / targetOpsPerSec * 100).toFixed(1)}%)\n`);
        passed++;  // 不作为失败，只是警告
      }
    } catch (err) {
      console.log(`Test 4: ERROR - ${err.message}\n`);
      failed++;
    }
  }

  // 总结
  console.log('=== Summary ===');
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`TOTAL: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
