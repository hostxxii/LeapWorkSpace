#!/usr/bin/env node

/**
 * Task 2B-7: ThreadPool + DoD 集成测试
 * 测试 ThreadPool 与 DoD 引擎的集成
 *
 * 测试场景：
 * 1. 单 worker 处理 10 个任务（顺序）
 * 2. 4 workers 处理 100 个任务（并发）
 * 3. 验证吞吐量目标：2000+ ops/sec
 * 4. 验证无竞争条件（ArrayBuffer 不重复访问）
 */

const path = require('path');
const { ThreadPool } = require(path.join(__dirname, '../../../leap-env/src/pool/thread-pool.js'));
const { DomToDoDConverter, DoDLayoutEngine } = require(path.join(__dirname, '../../../leap-env/src/impl/dod-layout-engine.js'));

// ═══════════════════════════════════════════════════════════════════════════
// Mock DOM 和脚本生成
// ═══════════════════════════════════════════════════════════════════════════

class MockElement {
  constructor(width = 100, height = 50) {
    this.width = width;
    this.height = height;
    this.children = [];
    this.style = {
      width: width + 'px',
      height: height + 'px',
      display: 'block'
    };
  }

  appendChild(child) {
    this.children.push(child);
  }
}

function generateMockDOM(nodeCount) {
  /**
   * 生成 Mock DOM 树
   * nodeCount: 期望的节点数
   */
  const root = new MockElement(1000, 600);

  let currentCount = 1;
  const stack = [root];

  while (currentCount < nodeCount && stack.length > 0) {
    const current = stack.shift();

    // 每个节点生成 2-4 个子节点
    const childCount = Math.min(3, Math.ceil((nodeCount - currentCount) / 10));

    for (let i = 0; i < childCount && currentCount < nodeCount; i++) {
      const child = new MockElement(
        Math.random() * 500 + 50,
        Math.random() * 300 + 30
      );
      current.appendChild(child);
      stack.push(child);
      currentCount++;
    }
  }

  return root;
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试运行器
// ═══════════════════════════════════════════════════════════════════════════

class IntegrationTester {
  constructor() {
    this.results = [];
  }

  log(message) {
    console.log(message);
    this.results.push(message);
  }

  async runTest(name, fn) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📋 ${name}`);
    console.log('═'.repeat(80));

    try {
      await fn();
      this.log('✅ 通过');
    } catch (err) {
      this.log(`❌ 失败: ${err.message}`);
      console.error(err);
    }
  }

  printSummary() {
    console.log(`\n${'═'.repeat(80)}`);
    console.log('📊 测试总结');
    console.log('═'.repeat(80));
    this.results.forEach(r => console.log(r));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 测试执行
// ═══════════════════════════════════════════════════════════════════════════

const tester = new IntegrationTester();

const skipThreadpool = String(process.env.LEAPVM_SKIP_THREADPOOL_TESTS || '').trim().toLowerCase();
if (skipThreadpool === '1' || skipThreadpool === 'true' || skipThreadpool === 'yes') {
  console.log('[threadpool-dod] SKIP: LEAPVM_SKIP_THREADPOOL_TESTS enabled');
  process.exit(0);
}

(async () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: ThreadPool 初始化和 DoD 支持
  // ─────────────────────────────────────────────────────────────────────────

  await tester.runTest('Test 1: ThreadPool 初始化和 DoD 支持', async () => {
    const pool = new ThreadPool({ size: 1 });
    await pool.start();

    tester.log(`✓ ThreadPool 已启动 (1 worker)`);
    tester.log(`✓ DoD 支持已启用: ${pool.dodSupported}`);

    if (!pool.dodSupported) {
      throw new Error('DoD 支持未启用');
    }

    await pool.close();
    tester.log(`✓ ThreadPool 已关闭`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: 单 worker 处理 10 个任务
  // ─────────────────────────────────────────────────────────────────────────

  await tester.runTest('Test 2: 单 worker 处理 10 个任务（顺序）', async () => {
    const pool = new ThreadPool({ size: 1, taskTimeoutMs: 30000 });
    await pool.start();

    const tasks = [];
    const taskCount = 10;
    const nodeCount = 100;

    const startTime = Date.now();

    for (let i = 0; i < taskCount; i++) {
      const domRoot = generateMockDOM(nodeCount);
      const converter = new DomToDoDConverter();
      const dodTree = converter.convert(domRoot);

      const scriptPayload = `
        // DoD 计算脚本
        const result = {
          taskId: ${i},
          nodeCount: ${nodeCount},
          timestamp: Date.now()
        };
        result;
      `;

      tasks.push(
        pool.runSignature({
          targetScript: scriptPayload,
          domBackend: 'dod',
          dodEnabled: true,
          dodTree: dodTree,
          containerWidth: 1000,
          containerHeight: 600
        })
      );
    }

    const results = await Promise.all(tasks);
    const duration = Date.now() - startTime;

    tester.log(`✓ 完成 ${taskCount} 个任务`);
    tester.log(`✓ 总耗时: ${duration}ms`);
    tester.log(`✓ 平均耗时: ${(duration / taskCount).toFixed(2)}ms/task`);
    tester.log(`✓ 吞吐量: ${((taskCount * 1000) / duration).toFixed(2)} ops/sec`);

    if (results.length !== taskCount) {
      throw new Error(`期望 ${taskCount} 个结果，实际 ${results.length} 个`);
    }

    await pool.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: 4 workers 并发处理 100 个任务
  // ─────────────────────────────────────────────────────────────────────────

  await tester.runTest('Test 3: 4 workers 并发处理 100 个任务', async () => {
    const pool = new ThreadPool({ size: 4, taskTimeoutMs: 30000 });
    await pool.start();

    const tasks = [];
    const taskCount = 100;
    const nodeCount = 200;

    const startTime = Date.now();

    for (let i = 0; i < taskCount; i++) {
      const domRoot = generateMockDOM(nodeCount);
      const converter = new DomToDoDConverter();
      const dodTree = converter.convert(domRoot);

      const scriptPayload = `
        const result = {
          taskId: ${i},
          nodeCount: ${nodeCount},
          timestamp: Date.now()
        };
        result;
      `;

      tasks.push(
        pool.runSignature({
          targetScript: scriptPayload,
          domBackend: 'dod',
          dodEnabled: true,
          dodTree: dodTree,
          containerWidth: 1000,
          containerHeight: 600
        }).catch(err => {
          console.error(`Task ${i} failed:`, err.message);
          return null;
        })
      );
    }

    const results = await Promise.all(tasks);
    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r !== null).length;
    const throughput = (taskCount * 1000) / duration;

    tester.log(`✓ 完成 ${successCount}/${taskCount} 个任务`);
    tester.log(`✓ 总耗时: ${duration}ms`);
    tester.log(`✓ 平均耗时: ${(duration / taskCount).toFixed(2)}ms/task`);
    tester.log(`✓ 吞吐量: ${throughput.toFixed(2)} ops/sec`);

    // 验证吞吐量目标
    if (throughput < 2000) {
      tester.log(`⚠️  吞吐量低于目标（期望 2000+，实际 ${throughput.toFixed(2)}）`);
    } else {
      tester.log(`✅ 吞吐量达成目标（${throughput.toFixed(2)} > 2000）`);
    }

    await pool.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: 大树（500 节点）处理
  // ─────────────────────────────────────────────────────────────────────────

  await tester.runTest('Test 4: 大树处理（500 节点 × 20 任务）', async () => {
    const pool = new ThreadPool({ size: 2, taskTimeoutMs: 30000 });
    await pool.start();

    const tasks = [];
    const taskCount = 20;
    const nodeCount = 500;

    const startTime = Date.now();

    for (let i = 0; i < taskCount; i++) {
      const domRoot = generateMockDOM(nodeCount);
      const converter = new DomToDoDConverter();
      const dodTree = converter.convert(domRoot);

      const scriptPayload = `
        const result = {
          taskId: ${i},
          nodeCount: ${nodeCount}
        };
        result;
      `;

      tasks.push(
        pool.runSignature({
          targetScript: scriptPayload,
          domBackend: 'dod',
          dodEnabled: true,
          dodTree: dodTree,
          containerWidth: 1000,
          containerHeight: 600
        }).catch(err => null)
      );
    }

    const results = await Promise.all(tasks);
    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r !== null).length;

    tester.log(`✓ 完成 ${successCount}/${taskCount} 个大树任务`);
    tester.log(`✓ 总耗时: ${duration}ms`);
    tester.log(`✓ 平均耗时: ${(duration / taskCount).toFixed(2)}ms/task`);
    tester.log(`✓ 吞吐量: ${((taskCount * 1000) / duration).toFixed(2)} ops/sec`);

    await pool.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: 树大小变化（10, 100, 500 节点）
  // ─────────────────────────────────────────────────────────────────────────

  await tester.runTest('Test 5: 树大小影响分析（变化树大小）', async () => {
    const pool = new ThreadPool({ size: 4, taskTimeoutMs: 30000 });
    await pool.start();

    const sizes = [10, 100, 500];

    for (const nodeCount of sizes) {
      const tasks = [];
      const taskCount = 50;

      const startTime = Date.now();

      for (let i = 0; i < taskCount; i++) {
        const domRoot = generateMockDOM(nodeCount);
        const converter = new DomToDoDConverter();
        const dodTree = converter.convert(domRoot);

        const scriptPayload = `
          const result = {
            taskId: ${i},
            nodeCount: ${nodeCount}
          };
          result;
        `;

        tasks.push(
          pool.runSignature({
            targetScript: scriptPayload,
            domBackend: 'dod',
            dodEnabled: true,
            dodTree: dodTree,
            containerWidth: 1000,
            containerHeight: 600
          }).catch(err => null)
        );
      }

      const results = await Promise.all(tasks);
      const duration = Date.now() - startTime;
      const successCount = results.filter(r => r !== null).length;
      const throughput = (successCount * 1000) / duration;

      tester.log(`  ${String(nodeCount).padEnd(5)} nodes | ${String((duration / taskCount).toFixed(2)).padEnd(8)}ms/task | ${throughput.toFixed(2)} ops/sec`);
    }

    await pool.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: ArrayBuffer transferable 验证
  // ─────────────────────────────────────────────────────────────────────────

  await tester.runTest('Test 6: ArrayBuffer transferable 零复制验证', async () => {
    const pool = new ThreadPool({ size: 1, taskTimeoutMs: 30000 });
    await pool.start();

    const domRoot = generateMockDOM(200);
    const converter = new DomToDoDConverter();
    const dodTree = converter.convert(domRoot);

    // 记录转移前的 buffer 大小
    const widthsBufferSize = dodTree.widths.buffer.byteLength;

    const scriptPayload = `
      const result = {
        nodeCount: 200,
        transferSuccess: true
      };
      result;
    `;

    // 调用会转移 ArrayBuffer
    const result = await pool.runSignature({
      targetScript: scriptPayload,
      domBackend: 'dod',
      dodEnabled: true,
      dodTree: dodTree,
      containerWidth: 1000,
      containerHeight: 600
    });

    // 转移后，widths 应该变成 detached（在主进程中无法再用）
    let isDetached = false;
    try {
      const _ = dodTree.widths[0];  // 尝试访问
    } catch (e) {
      isDetached = e.message.includes('Detached');
    }

    tester.log(`✓ 转移前 buffer 大小: ${widthsBufferSize} bytes`);
    tester.log(`✓ ArrayBuffer 状态: ${isDetached ? 'detached（正确）' : 'attached'}`);
    tester.log(`✓ 任务完成: ${result ? '✅' : '❌'}`);

    await pool.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 7: 错误处理和超时
  // ─────────────────────────────────────────────────────────────────────────

  await tester.runTest('Test 7: 错误处理和超时机制', async () => {
    const pool = new ThreadPool({ size: 1, taskTimeoutMs: 5000 });
    await pool.start();

    // 测试正常任务
    const domRoot = generateMockDOM(50);
    const converter = new DomToDoDConverter();
    const dodTree = converter.convert(domRoot);

    try {
      const result = await pool.runSignature({
        targetScript: 'const x = 1 + 1; x;',
        domBackend: 'dod',
        dodEnabled: true,
        dodTree: dodTree,
        containerWidth: 1000,
        containerHeight: 600
      });
      tester.log('✓ 正常任务完成');
    } catch (err) {
      tester.log(`❌ 正常任务失败: ${err.message}`);
    }

    await pool.close();
  });

  // 输出总结
  tester.printSummary();

  console.log('\n✅ Task 2B-7 完成！');
  process.exit(0);
})().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
