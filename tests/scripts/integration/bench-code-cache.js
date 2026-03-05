#!/usr/bin/env node
'use strict';

/**
 * Code Cache A/B benchmark
 *
 * Compares ThreadPool worker init + task throughput with and without
 * V8 code cache for the environment bundle.
 *
 * Usage:
 *   node tests/scripts/integration/bench-code-cache.js [--tasks N] [--workers N]
 */

const path = require('path');
const { ThreadPool } = require(path.join(__dirname, '../../../leap-env/src/pool/thread-pool.js'));

const argv = process.argv.slice(2);
function getArg(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? Number(argv[i + 1]) : fallback;
}

const TASK_COUNT = getArg('--tasks', 50);
const WORKER_COUNT = getArg('--workers', 2);
const TASK_TIMEOUT_MS = 30000;

const TASK_SCRIPT = `
  (function() {
    var ua = navigator.userAgent;
    var w = window.innerWidth;
    var h = window.innerHeight;
    return JSON.stringify({ ua: ua, w: w, h: h });
  })();
`;

async function runBatch(pool, count) {
  const tasks = [];
  for (let i = 0; i < count; i++) {
    tasks.push(
      pool.runSignature({ targetScript: TASK_SCRIPT }).catch(() => null)
    );
  }
  return Promise.all(tasks);
}

async function bench(label, poolOptions) {
  const pool = new ThreadPool({
    size: WORKER_COUNT,
    taskTimeoutMs: TASK_TIMEOUT_MS,
    ...poolOptions,
  });

  // Measure startup (includes worker init + bundle compile)
  const t0 = process.hrtime.bigint();
  await pool.start();
  const startupNs = Number(process.hrtime.bigint() - t0);

  // Warmup: run a few tasks to stabilize JIT
  await runBatch(pool, Math.min(5, TASK_COUNT));

  // Measure task throughput
  const t1 = process.hrtime.bigint();
  const results = await runBatch(pool, TASK_COUNT);
  const batchNs = Number(process.hrtime.bigint() - t1);

  const succeeded = results.filter(r => r !== null).length;
  const avgMs = (batchNs / 1e6) / TASK_COUNT;
  const throughput = (TASK_COUNT * 1e9) / batchNs;

  await pool.close({ forceTerminate: true });

  return { label, startupNs, batchNs, succeeded, avgMs, throughput };
}

function fmt(ns) {
  return (ns / 1e6).toFixed(1) + 'ms';
}

(async () => {
  console.log(`Code Cache A/B Benchmark`);
  console.log(`  workers: ${WORKER_COUNT}, tasks: ${TASK_COUNT}`);
  console.log('');

  // --- A: without code cache (force disable by clearing bundleCodeCache) ---
  // We set an env var that the pool will check to skip code cache generation.
  // Actually, the simplest way: just don't pin the addon (no pinnedLeapVmAddon => no cache).
  // But pinning is automatic on Linux. Instead, we run two pools in sequence and
  // compare: first pool generates cache, second reuses it. We can also disable by
  // passing a dummy bundleCodeCache=null override... but the pool auto-generates.
  //
  // Cleanest approach: measure the same pool config twice; the key metric is
  // startup time (which includes bundle compilation in workers).

  // Run A: disable code cache by setting env
  process.env.LEAPVM_DISABLE_MAIN_ADDON_PIN = '1';
  const resultA = await bench('WITHOUT code cache', {});
  delete process.env.LEAPVM_DISABLE_MAIN_ADDON_PIN;

  // Run B: enable code cache (default behavior with addon pin)
  const resultB = await bench('WITH code cache', {});

  // --- Report ---
  console.log('');
  console.log('='.repeat(70));
  console.log('Results');
  console.log('='.repeat(70));
  console.log('');

  const col = (s, w) => String(s).padEnd(w);
  const num = (n, w) => String(n).padStart(w);

  console.log(
    col('', 25) +
    col('Startup', 15) +
    col('Avg/task', 15) +
    col('Throughput', 15) +
    col('OK', 8)
  );
  console.log('-'.repeat(70));

  for (const r of [resultA, resultB]) {
    console.log(
      col(r.label, 25) +
      col(fmt(r.startupNs), 15) +
      col(r.avgMs.toFixed(2) + 'ms', 15) +
      col(r.throughput.toFixed(1) + ' ops/s', 15) +
      col(r.succeeded + '/' + TASK_COUNT, 8)
    );
  }

  console.log('');

  const startupDelta = ((resultA.startupNs - resultB.startupNs) / resultA.startupNs * 100);
  const throughputDelta = ((resultB.throughput - resultA.throughput) / resultA.throughput * 100);

  console.log(`Startup improvement:    ${startupDelta.toFixed(1)}%  (${fmt(resultA.startupNs)} -> ${fmt(resultB.startupNs)})`);
  console.log(`Throughput improvement:  ${throughputDelta.toFixed(1)}%  (${resultA.throughput.toFixed(1)} -> ${resultB.throughput.toFixed(1)} ops/s)`);
  console.log('');

  process.exit(0);
})().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
