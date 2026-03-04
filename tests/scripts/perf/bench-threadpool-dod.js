#!/usr/bin/env node

/**
 * Task 2B-8: DoD 性能基准测试
 * 测试各种树大小的性能表现
 *
 * 配置：
 * - Workers: 4
 * - Tasks per size: 200
 * - Tree sizes: 10, 50, 200, 500, 1000 nodes
 * - Metrics: ops/sec, ms/op, memory usage
 */

const path = require('path');
const { ThreadPool } = require(path.join(__dirname, '../../../leap-env/src/pool/thread-pool.js'));
const { DomToDoDConverter } = require(path.join(__dirname, '../../../leap-env/src/impl/dod-layout-engine.js'));

// ═══════════════════════════════════════════════════════════════════════════
// Mock DOM
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
  const root = new MockElement(1000, 600);
  let currentCount = 1;
  const stack = [root];

  while (currentCount < nodeCount && stack.length > 0) {
    const current = stack.shift();
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
// 性能测试
// ═══════════════════════════════════════════════════════════════════════════

class BenchmarkRunner {
  constructor() {
    this.results = [];
  }

  log(message) {
    console.log(message);
    this.results.push(message);
  }

  async runBenchmark(name, fn) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📊 ${name}`);
    console.log('═'.repeat(80));

    try {
      await fn();
    } catch (err) {
      this.log(`❌ 错误: ${err.message}`);
      console.error(err);
    }
  }

  formatTable(rows) {
    if (rows.length === 0) return '';

    // 计算列宽
    const colWidths = [];
    rows[0].forEach((cell, colIdx) => {
      colWidths[colIdx] = Math.max(
        ...rows.map(row => String(row[colIdx]).length)
      );
    });

    // 格式化表头
    let output = '';
    rows.forEach((row, rowIdx) => {
      const formatted = row.map((cell, colIdx) =>
        String(cell).padEnd(colWidths[colIdx])
      ).join(' | ');

      output += formatted + '\n';

      // 分隔线
      if (rowIdx === 0) {
        const separator = colWidths.map(w => '─'.repeat(w)).join('─┼─');
        output += separator + '\n';
      }
    });

    return output;
  }

  printResults() {
    console.log(`\n${'═'.repeat(80)}`);
    console.log('📈 性能测试总结');
    console.log('═'.repeat(80));
    this.results.forEach(r => console.log(r));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 主测试
// ═══════════════════════════════════════════════════════════════════════════

const bench = new BenchmarkRunner();

(async () => {
  const WORKERS = 4;
  const TASKS_PER_SIZE = 200;
  const TREE_SIZES = [10, 50, 200, 500, 1000];

  let memBefore = process.memoryUsage();

  await bench.runBenchmark('DoD 多树大小性能测试', async () => {
    const pool = new ThreadPool({ size: WORKERS, taskTimeoutMs: 30000 });
    await pool.start();

    const results = [];
    let totalTasks = 0;
    let totalDuration = 0;

    for (const nodeCount of TREE_SIZES) {
      const tasks = [];
      const startTime = Date.now();

      bench.log(`\n  正在测试 ${nodeCount} 节点树 × ${TASKS_PER_SIZE} 任务...`);

      for (let i = 0; i < TASKS_PER_SIZE; i++) {
        const domRoot = generateMockDOM(nodeCount);
        const converter = new DomToDoDConverter();
        const dodTree = converter.convert(domRoot, Math.ceil(nodeCount * 1.2));

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

      const taskResults = await Promise.all(tasks);
      const duration = Date.now() - startTime;
      const successCount = taskResults.filter(r => r !== null).length;
      const throughput = (successCount * 1000) / duration;
      const avgTime = duration / successCount;

      totalTasks += successCount;
      totalDuration += duration;

      results.push({
        nodeCount,
        tasks: successCount,
        durationMs: duration,
        opsPerSec: throughput.toFixed(2),
        msPerOp: avgTime.toFixed(3)
      });

      bench.log(`    ✓ 完成 ${successCount}/${TASKS_PER_SIZE} 个任务`);
      bench.log(`    ✓ 耗时 ${duration}ms，吞吐量 ${throughput.toFixed(2)} ops/sec`);
    }

    await pool.close();

    // 输出表格
    bench.log('\n  性能汇总表：');
    bench.log('  ');

    const table = [
      ['节点数', '完成任务', '总耗时(ms)', '吞吐(ops/sec)', '单操作(ms)']
    ];

    results.forEach(r => {
      table.push([
        r.nodeCount,
        r.tasks,
        r.durationMs,
        r.opsPerSec,
        r.msPerOp
      ]);
    });

    table.forEach(row => {
      const formatted = [
        String(row[0]).padEnd(6),
        String(row[1]).padEnd(8),
        String(row[2]).padEnd(12),
        String(row[3]).padEnd(14),
        String(row[4]).padEnd(10)
      ].join(' | ');
      bench.log('  ' + formatted);
    });

    // 性能分析
    bench.log('\n  性能分析：');

    const avgThroughput = results.reduce((sum, r) => sum + parseFloat(r.opsPerSec), 0) / results.length;
    const minThroughput = Math.min(...results.map(r => parseFloat(r.opsPerSec)));
    const maxThroughput = Math.max(...results.map(r => parseFloat(r.opsPerSec)));

    bench.log(`    平均吞吐量: ${avgThroughput.toFixed(2)} ops/sec`);
    bench.log(`    最小吞吐量: ${minThroughput.toFixed(2)} ops/sec (${TREE_SIZES[results.findIndex(r => parseFloat(r.opsPerSec) === minThroughput)]} 节点)`);
    bench.log(`    最大吞吐量: ${maxThroughput.toFixed(2)} ops/sec (${TREE_SIZES[results.findIndex(r => parseFloat(r.opsPerSec) === maxThroughput)]} 节点)`);

    // 性能性能预期
    if (avgThroughput > 2000) {
      bench.log(`    ✅ 吞吐量目标达成 (>${2000} ops/sec)`);
    } else {
      bench.log(`    ⚠️  吞吐量低于目标 (<${2000} ops/sec)`);
    }

    bench.log('\n  总体统计：');
    bench.log(`    总任务数: ${totalTasks}`);
    bench.log(`    总耗时: ${totalDuration}ms`);
    bench.log(`    平均单操作: ${(totalDuration / totalTasks).toFixed(3)}ms`);
  });

  // 内存测试
  await bench.runBenchmark('内存使用分析', async () => {
    const pool = new ThreadPool({ size: 1, taskTimeoutMs: 30000 });
    await pool.start();

    const memBaseline = process.memoryUsage();
    bench.log(`  基线内存使用:`);
    bench.log(`    Heap Used: ${(memBaseline.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    bench.log(`    RSS: ${(memBaseline.rss / 1024 / 1024).toFixed(2)} MB`);

    // 运行 100 个中等大小的任务
    const tasks = [];
    for (let i = 0; i < 100; i++) {
      const domRoot = generateMockDOM(200);
      const converter = new DomToDoDConverter();
      const dodTree = converter.convert(domRoot, 250);

      tasks.push(
        pool.runSignature({
          targetScript: 'const x = 1; x;',
          domBackend: 'dod',
          dodEnabled: true,
          dodTree: dodTree,
          containerWidth: 1000,
          containerHeight: 600
        }).catch(err => null)
      );
    }

    await Promise.all(tasks);

    const memAfter = process.memoryUsage();
    bench.log(`\n  任务后内存使用:`);
    bench.log(`    Heap Used: ${(memAfter.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    bench.log(`    RSS: ${(memAfter.rss / 1024 / 1024).toFixed(2)} MB`);
    bench.log(`    增长: ${((memAfter.heapUsed - memBaseline.heapUsed) / 1024 / 1024).toFixed(2)} MB`);

    // 触发 GC（如果可用）
    if (global.gc) {
      global.gc();
      const memGC = process.memoryUsage();
      bench.log(`\n  GC 后内存使用:`);
      bench.log(`    Heap Used: ${(memGC.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      bench.log(`    释放: ${((memAfter.heapUsed - memGC.heapUsed) / 1024 / 1024).toFixed(2)} MB`);
    }

    await pool.close();
  });

  // 大树压力测试
  await bench.runBenchmark('大树处理性能', async () => {
    const pool = new ThreadPool({ size: 2, taskTimeoutMs: 30000 });
    await pool.start();

    const nodeCount = 1000;
    const taskCount = 50;
    const tasks = [];

    const startTime = Date.now();

    for (let i = 0; i < taskCount; i++) {
      const domRoot = generateMockDOM(nodeCount);
      const converter = new DomToDoDConverter();
      const dodTree = converter.convert(domRoot, Math.ceil(nodeCount * 1.2));

      tasks.push(
        pool.runSignature({
          targetScript: 'const x = 1; x;',
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

    bench.log(`  树大小: ${nodeCount} 节点`);
    bench.log(`  任务数: ${successCount}/${taskCount}`);
    bench.log(`  总耗时: ${duration}ms`);
    bench.log(`  单操作: ${(duration / successCount).toFixed(2)}ms`);
    bench.log(`  吞吐量: ${throughput.toFixed(2)} ops/sec`);

    await pool.close();
  });

  bench.printResults();

  console.log('\n✅ Task 2B-8 性能基准测试完成！');
  console.log('\n📊 生成的性能报告已显示。');
  console.log('建议：与 OOP 版本对比，应该看到 2.5-4 倍的性能提升。');

  process.exit(0);
})().catch(err => {
  console.error('❌ 基准测试失败:', err);
  process.exit(1);
});
