'use strict';
/**
 * P3-1 多规模 benchmark：找到 spec 路径相对 js 路径的性能拐点
 *
 * 每个规模 N 生成一棵 1 root + (N-1) children 的树，同时对 js/spec 后端跑相同任务数，
 * 比较两者的 RPS 与 p99 延迟。
 *
 * 用法：
 *   node scripts/bench-dom-multi-scale.js
 *   LEAP_DOM_MS_TOTAL_TASKS=200 node scripts/bench-dom-multi-scale.js
 */

const fs   = require('fs');
const path = require('path');
const { ThreadPool } = require('../../../leap-env/src/pool/thread-pool');

if (!process.env.LEAPVM_LOG_LEVEL)      process.env.LEAPVM_LOG_LEVEL      = 'error';
if (!process.env.LEAPVM_HOST_LOG_LEVEL) process.env.LEAPVM_HOST_LOG_LEVEL = 'error';

// ─── 配置 ───────────────────────────────────────────────────────────────────
function toPositiveInt(raw, fallback) {
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const CONFIG = {
  poolSize:        toPositiveInt(process.env.LEAP_DOM_MS_POOL_SIZE,        4),
  concurrency:     toPositiveInt(process.env.LEAP_DOM_MS_CONCURRENCY,      16),
  totalTasks:      toPositiveInt(process.env.LEAP_DOM_MS_TOTAL_TASKS,      200),
  taskTimeoutMs:   toPositiveInt(process.env.LEAP_DOM_MS_TASK_TIMEOUT_MS,  10000),
  maxTasksPerWorker: toPositiveInt(process.env.LEAP_MAX_TASKS_PER_WORKER,  400),
};

// 测试规模（总节点数）
const SCALES = [10, 50, 200, 500];

// ─── 任务脚本生成 ────────────────────────────────────────────────────────────
/**
 * 生成包含 totalNodes 个节点的 DOM workload 脚本。
 * 结构：1 个 root div + (totalNodes-1) 个 span 子节点。
 */
function buildWorkloadScript(totalNodes) {
  const childCount = Math.max(0, totalNodes - 1);
  return `
(function () {
  function dispatch(self, typeName, propName, actionType) {
    var runtime = globalThis.leapenv && globalThis.leapenv.__runtime;
    var bridge = runtime && runtime.bridge;
    var dispatchFn = (bridge && typeof bridge.dispatch === 'function')
      ? bridge.dispatch
      : globalThis.__LEAP_DISPATCH__;
    if (typeof dispatchFn !== 'function') {
      throw new Error('dispatch bridge missing');
    }
    var args = Array.prototype.slice.call(arguments, 4);
    return dispatchFn.apply(self, [typeName, propName, actionType].concat(args));
  }

  var documentObject = dispatch({}, 'Window', 'document', 'GET');
  var root = dispatch(documentObject, 'Document', 'createElement', 'CALL', 'div');
  var rootStyle = dispatch(root, 'HTMLElement', 'style', 'GET');
  rootStyle.position = 'relative';
  rootStyle.width    = '800px';
  rootStyle.height   = '600px';

  for (var i = 0; i < ${childCount}; i++) {
    var child = dispatch(documentObject, 'Document', 'createElement', 'CALL', 'span');
    var childStyle = dispatch(child, 'HTMLElement', 'style', 'GET');
    childStyle.position = 'absolute';
    childStyle.left     = (i % 50) + 'px';
    childStyle.top      = (i % 40) + 'px';
    childStyle.width    = (10 + (i % 30)) + 'px';
    childStyle.height   = (8  + (i % 20)) + 'px';
    dispatch(root, 'Node', 'appendChild', 'CALL', child);
  }

  dispatch(documentObject, 'Node', 'appendChild', 'CALL', root);
  var w = dispatch(root, 'HTMLElement', 'offsetWidth',  'GET');
  var h = dispatch(root, 'HTMLElement', 'offsetHeight', 'GET');
  dispatch(documentObject, 'Node', 'removeChild', 'CALL', root);
  return String(w + h);
})();
`.trim();
}

// ─── 统计工具 ────────────────────────────────────────────────────────────────
function percentile(values, p) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function nowForFilename() {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ─── 单后端、单规模跑一轮 ─────────────────────────────────────────────────────
async function runCase(backend, nodeCount, config) {
  const script = buildWorkloadScript(nodeCount);
  const pool   = new ThreadPool({
    size:                  config.poolSize,
    taskTimeoutMs:         config.taskTimeoutMs,
    workerInitTimeoutMs:   20000,
    heartbeatIntervalMs:   3000,
    heartbeatTimeoutMs:    12000,
    maxTasksPerWorker:     config.maxTasksPerWorker,
    domBackend:            backend,
  });

  const durations = [];
  let success = 0;
  let failed  = 0;

  await pool.start();
  const startedAt = Date.now();
  let inFlight = 0, issued = 0, completed = 0;

  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < config.concurrency && issued < config.totalTasks) {
        issued++;
        inFlight++;
        pool.runSignature({ targetScript: script }, { timeoutMs: config.taskTimeoutMs })
          .then((res) => {
            success++;
            if (res && Number.isFinite(res.durationMs)) durations.push(res.durationMs);
          })
          .catch(() => { failed++; })
          .finally(() => {
            inFlight--;
            completed++;
            if (completed >= config.totalTasks) resolve();
            else launch();
          });
      }
    };
    launch();
  });

  const elapsedMs = Date.now() - startedAt;
  // NOTE: worker-side shutdown remains unstable on Windows in some native DOM
  // runs. Use parent-side terminate to avoid worker shutdown path crashes.
  await pool.close({ forceTerminate: true });

  return {
    backend,
    nodeCount,
    rps:       elapsedMs > 0 ? Number((success / (elapsedMs / 1000)).toFixed(2)) : 0,
    latencyMs: {
      p50: percentile(durations, 50),
      p90: percentile(durations, 90),
      p99: percentile(durations, 99),
    },
    totals: { success, failed },
  };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('[bench-dom-multi-scale] config:', JSON.stringify(CONFIG));
  console.log('[bench-dom-multi-scale] scales:', SCALES.join(', '), 'nodes');
  console.log('');

  const results = [];

  for (const n of SCALES) {
    console.log(`[scale=${n}] running js  backend...`);
    const jsCase   = await runCase('js',   n, CONFIG);

    console.log(`[scale=${n}] running spec backend...`);
    const specCase = await runCase('spec', n, CONFIG);

    const rpsRatio = jsCase.rps > 0 ? (specCase.rps / jsCase.rps) : 0;
    const p99Ratio = jsCase.latencyMs.p99 > 0 ? (specCase.latencyMs.p99 / jsCase.latencyMs.p99) : 0;

    const row = {
      nodes: n,
      js_rps:   jsCase.rps,
      spec_rps: specCase.rps,
      rps_ratio:  Number(rpsRatio.toFixed(4)),   // spec / js; > 1 = spec wins
      js_p99:   jsCase.latencyMs.p99,
      spec_p99: specCase.latencyMs.p99,
      p99_ratio:  Number(p99Ratio.toFixed(4)),   // spec / js; < 1 = spec wins
    };
    results.push(row);

    const arrow = rpsRatio >= 1 ? '▲ spec wins' : '▼ js wins';
    console.log(`[scale=${n}] js_rps=${jsCase.rps}  spec_rps=${specCase.rps}  ratio=${rpsRatio.toFixed(3)}  ${arrow}`);
    console.log(`[scale=${n}] js_p99=${jsCase.latencyMs.p99.toFixed(1)}ms  spec_p99=${specCase.latencyMs.p99.toFixed(1)}ms`);
    console.log('');
  }

  // 摘要表格
  console.log('=== SUMMARY (spec_rps / js_rps) ===');
  console.log('nodes'.padEnd(8) + 'js_rps'.padEnd(10) + 'spec_rps'.padEnd(10) + 'ratio'.padEnd(8) + 'verdict');
  for (const r of results) {
    const verdict = r.rps_ratio >= 1.05 ? 'spec WINS  (+' + ((r.rps_ratio - 1) * 100).toFixed(1) + '%)'
                  : r.rps_ratio >= 0.98 ? 'roughly equal'
                  : 'js  WINS  (-' + ((1 - r.rps_ratio) * 100).toFixed(1) + '%)';
    console.log(
      String(r.nodes).padEnd(8) +
      String(r.js_rps).padEnd(10) +
      String(r.spec_rps).padEnd(10) +
      r.rps_ratio.toFixed(3).padEnd(8) +
      verdict
    );
  }

  // 找拐点
  const breakeven = results.find((r) => r.rps_ratio >= 1.05);
  if (breakeven) {
    console.log(`\nSpec advantage breakeven: ~${breakeven.nodes} nodes (spec +${((breakeven.rps_ratio - 1) * 100).toFixed(1)}% faster)`);
  } else {
    console.log('\nNo clear spec advantage found in tested range (10–500 nodes). spec overhead dominates small trees; consider larger scales or incremental dirty encoding.');
  }

  // 输出 JSON
  const outDir  = path.resolve(__dirname, '..', '..', '..', 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `dom-multi-scale-${nowForFilename()}.json`);
  const report  = { timestamp: new Date().toISOString(), config: CONFIG, scales: results };
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('\n[bench-dom-multi-scale] report saved to:', outFile);
}

main().catch((err) => {
  console.error('[bench-dom-multi-scale] FATAL:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
