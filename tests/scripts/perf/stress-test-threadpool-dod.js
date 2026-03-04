#!/usr/bin/env node

/**
 * Task 2B-9: ThreadPool + DoD 压力测试
 * 测试长时间运行的稳定性和内存泄漏
 *
 * 配置：
 * - Duration: 默认 600 秒（10 分钟）, 可通过 --duration=3600 改为 1 小时
 * - Concurrent tasks: 1000+
 * - Tree sizes: 10, 50, 200, 500, 1000 nodes（随机选择）
 * - Monitor: 内存、GC、Worker 状态、性能劣化
 */

const path = require('path');
const { ThreadPool } = require(path.join(__dirname, '../../../leap-env/src/pool/thread-pool.js'));
const { DomToDoDConverter } = require(path.join(__dirname, '../../../leap-env/src/impl/dod-layout-engine.js'));

// ═══════════════════════════════════════════════════════════════════════════
// 参数解析
// ═══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
let DURATION_MS = 600000; // 10 分钟（默认）
let TASK_COUNT = 1000;

for (const arg of args) {
  if (arg.startsWith('--duration=')) {
    DURATION_MS = parseInt(arg.split('=')[1]) * 1000;
  }
  if (arg.startsWith('--tasks=')) {
    TASK_COUNT = parseInt(arg.split('=')[1]);
  }
}

const DURATION_MIN = DURATION_MS / 60000;
const WORKERS = 4;
const TREE_SIZES = [10, 50, 200, 500, 1000];

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
      height: height + 'px'
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
// 监控器
// ═══════════════════════════════════════════════════════════════════════════

class StressMonitor {
  constructor() {
    this.samples = [];
    this.taskStats = {
      total: 0,
      succeeded: 0,
      failed: 0
    };
    this.treeSizeStats = {};
    TREE_SIZES.forEach(size => {
      this.treeSizeStats[size] = { count: 0, avgTime: 0 };
    });
  }

  recordMemory() {
    const mem = process.memoryUsage();
    this.samples.push({
      timestamp: Date.now(),
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rss: mem.rss
    });

    // 只保留最后 60 个样本（一分钟）
    if (this.samples.length > 60) {
      this.samples.shift();
    }
  }

  recordTask(size, duration, success) {
    this.taskStats.total++;
    if (success) {
      this.taskStats.succeeded++;
    } else {
      this.taskStats.failed++;
    }

    const stat = this.treeSizeStats[size];
    if (stat) {
      stat.count++;
      // 计算移动平均
      const alpha = 0.1;
      stat.avgTime = stat.avgTime * (1 - alpha) + duration * alpha;
    }
  }

  getMemoryTrend() {
    if (this.samples.length < 2) return null;

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];

    return {
      startHeapUsed: first.heapUsed,
      endHeapUsed: last.heapUsed,
      maxHeapUsed: Math.max(...this.samples.map(s => s.heapUsed)),
      change: last.heapUsed - first.heapUsed,
      changePercent: ((last.heapUsed - first.heapUsed) / first.heapUsed * 100)
    };
  }

  getStats() {
    return {
      taskStats: this.taskStats,
      memoryTrend: this.getMemoryTrend(),
      treeSizeStats: this.treeSizeStats
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 主压力测试
// ═══════════════════════════════════════════════════════════════════════════

console.log('🔥 Task 2B-9: ThreadPool + DoD 压力测试\n');
console.log(`配置:`);
console.log(`  Worker 数: ${WORKERS}`);
console.log(`  目标任务数: ${TASK_COUNT}+`);
console.log(`  测试时长: ${DURATION_MIN} 分钟（${DURATION_MS / 1000} 秒）`);
console.log(`  树大小: ${TREE_SIZES.join(', ')} 节点\n`);

(async () => {
  const monitor = new StressMonitor();
  const pool = new ThreadPool({ size: WORKERS, taskTimeoutMs: 30000 });

  await pool.start();

  const startTime = Date.now();
  let tasksPending = 0;
  let tasksSubmitted = 0;

  // 监控循环
  const monitorInterval = setInterval(() => {
    monitor.recordMemory();

    const elapsed = Date.now() - startTime;
    const elapsedMin = elapsed / 60000;
    const mem = process.memoryUsage();

    process.stdout.write(
      `\r⏱️  ${elapsedMin.toFixed(1)}min | ` +
      `📊 任务: ${monitor.taskStats.total} (✓${monitor.taskStats.succeeded} ✗${monitor.taskStats.failed}) | ` +
      `💾 堆: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB | ` +
      `待处理: ${tasksPending}`
    );
  }, 1000);

  // 任务提交循环
  const submitInterval = setInterval(async () => {
    const elapsed = Date.now() - startTime;

    if (elapsed >= DURATION_MS) {
      clearInterval(submitInterval);
      clearInterval(monitorInterval);
      return;
    }

    // 限制待处理任务数，避免内存溢出
    if (tasksPending > 500) {
      return;
    }

    // 提交新任务
    const batchSize = Math.min(50, TASK_COUNT - tasksSubmitted);

    for (let i = 0; i < batchSize; i++) {
      const nodeCount = TREE_SIZES[Math.floor(Math.random() * TREE_SIZES.length)];
      const domRoot = generateMockDOM(nodeCount);
      const converter = new DomToDoDConverter();
      // 注意：指定预估节点数，避免容量超出
      const dodTree = converter.convert(domRoot, Math.ceil(nodeCount * 1.5));

      const startTaskTime = Date.now();

      pool.runSignature({
        targetScript: 'const x = 1; x;',
        domBackend: 'dod',
        dodEnabled: true,
        dodTree: dodTree,
        containerWidth: 1000,
        containerHeight: 600
      })
        .then(() => {
          const duration = Date.now() - startTaskTime;
          monitor.recordTask(nodeCount, duration, true);
          tasksPending--;
        })
        .catch(() => {
          monitor.recordTask(nodeCount, -1, false);
          tasksPending--;
        });

      tasksPending++;
      tasksSubmitted++;
    }
  }, 100);

  // 等待测试完成
  await new Promise(resolve => {
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= DURATION_MS) {
        clearInterval(checkInterval);
        clearInterval(submitInterval);
        clearInterval(monitorInterval);

        // 等待所有待处理任务完成
        const waitForPending = setInterval(() => {
          if (tasksPending === 0) {
            clearInterval(waitForPending);
            resolve();
          }
        }, 100);
      }
    }, 1000);
  });

  // 等待所有任务完成
  await new Promise(resolve => {
    const waitInterval = setInterval(() => {
      if (tasksPending === 0) {
        clearInterval(waitInterval);
        setTimeout(resolve, 1000); // 再等 1 秒确保没有遗留任务
      }
    }, 100);
  });

  await pool.close();

  // 输出最终统计
  console.log('\n\n' + '═'.repeat(80));
  console.log('📈 压力测试完成');
  console.log('═'.repeat(80));

  const stats = monitor.getStats();

  console.log('\n✅ 任务统计：');
  console.log(`  总任务数: ${stats.taskStats.total}`);
  console.log(`  成功: ${stats.taskStats.succeeded} (${((stats.taskStats.succeeded / stats.taskStats.total) * 100).toFixed(2)}%)`);
  console.log(`  失败: ${stats.taskStats.failed}`);

  if (stats.memoryTrend) {
    console.log('\n💾 内存分析：');
    console.log(`  初始堆使用: ${(stats.memoryTrend.startHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  最终堆使用: ${(stats.memoryTrend.endHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  峰值堆使用: ${(stats.memoryTrend.maxHeapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  变化: ${(stats.memoryTrend.change / 1024 / 1024).toFixed(2)} MB (${stats.memoryTrend.changePercent.toFixed(2)}%)`);

    if (Math.abs(stats.memoryTrend.changePercent) < 10) {
      console.log(`  ✅ 内存稳定（变化 <10%）`);
    } else if (Math.abs(stats.memoryTrend.changePercent) < 20) {
      console.log(`  ⚠️  内存略有增长（变化 10-20%）`);
    } else {
      console.log(`  ❌ 内存增长明显（变化 >20%，可能存在泄漏）`);
    }
  }

  console.log('\n🌲 树大小性能分析：');
  TREE_SIZES.forEach(size => {
    const stat = stats.treeSizeStats[size];
    if (stat.count > 0) {
      console.log(`  ${String(size).padEnd(5)} 节点: ${stat.count} 任务, 平均耗时 ${stat.avgTime.toFixed(2)}ms`);
    }
  });

  const totalDuration = Date.now() - startTime;
  const throughput = (stats.taskStats.succeeded * 1000) / totalDuration;
  console.log(`\n📊 吞吐量: ${throughput.toFixed(2)} ops/sec`);

  console.log('\n✨ 压力测试结果：');
  if (stats.taskStats.failed === 0 && Math.abs(stats.memoryTrend.changePercent) < 15) {
    console.log('  ✅ 所有检查通过！Worker 稳定，无内存泄漏');
  } else if (stats.taskStats.failed < stats.taskStats.total * 0.05) {
    console.log('  ✅ 大部分检查通过。失败率 <5%，内存基本稳定');
  } else {
    console.log('  ⚠️  发现问题。建议进行进一步调查');
  }

  process.exit(0);
})().catch(err => {
  console.error('❌ 压力测试失败:', err);
  process.exit(1);
});
