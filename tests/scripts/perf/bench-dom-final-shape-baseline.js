const fs = require('fs');
const path = require('path');
const { ThreadPool } = require('../../../leap-env/src/pool/thread-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

const DOM_WORKLOAD_SCRIPT = `
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
  rootStyle.width = '320px';
  rootStyle.height = '40px';
  rootStyle.padding = '6px 8px';
  rootStyle.borderLeftWidth = '2px';
  rootStyle.borderRightWidth = '2px';
  rootStyle.marginBottom = '2px';

  for (var i = 0; i < 120; i++) {
    var child = dispatch(documentObject, 'Document', 'createElement', 'CALL', 'span');
    var childStyle = dispatch(child, 'HTMLElement', 'style', 'GET');
    childStyle.position = 'absolute';
    childStyle.left = (i % 17) + 'px';
    childStyle.top = (i % 13) + 'px';
    childStyle.width = (12 + (i % 11)) + 'px';
    childStyle.height = (7 + (i % 5)) + 'px';
    dispatch(root, 'Node', 'appendChild', 'CALL', child);
  }

  dispatch(documentObject, 'Node', 'appendChild', 'CALL', root);
  var rect = dispatch(root, 'Element', 'getBoundingClientRect', 'CALL');
  var layoutValue =
    dispatch(root, 'HTMLElement', 'offsetWidth', 'GET') +
    dispatch(root, 'HTMLElement', 'offsetHeight', 'GET') +
    Number(rect.width || 0) +
    Number(rect.height || 0);
  var count = dispatch(documentObject, 'Document', 'querySelectorAll', 'CALL', 'span').length;
  dispatch(documentObject, 'Node', 'removeChild', 'CALL', root);
  return String(layoutValue + count);
})();
`;

function toPositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function bytesToMb(bytes) {
  return Number((Number(bytes || 0) / (1024 * 1024)).toFixed(2));
}

function nowForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function classifyTimeout(error) {
  const text = String(
    (error && error.message) ||
    (error && error.details && error.details.message) ||
    ''
  ).toLowerCase();
  return text.includes('timeout');
}

async function runCase(backend, config) {
  const pool = new ThreadPool({
    size: config.poolSize,
    taskTimeoutMs: config.taskTimeoutMs,
    workerInitTimeoutMs: 20000,
    heartbeatIntervalMs: 3000,
    heartbeatTimeoutMs: 12000,
    maxTasksPerWorker: config.maxTasksPerWorker,
    domBackend: backend
  });

  const durations = [];
  let success = 0;
  let failed = 0;
  let timedOut = 0;
  let leakedDocsAutoReleased = 0;
  let releasedNodes = 0;
  const errorSamples = [];

  await pool.start();
  const startStats = pool.getStats();
  const startedAt = Date.now();
  let inFlight = 0;
  let issued = 0;
  let completed = 0;

  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < config.concurrency && issued < config.totalTasks) {
        issued += 1;
        inFlight += 1;
        pool.runSignature({ targetScript: DOM_WORKLOAD_SCRIPT }, { timeoutMs: config.taskTimeoutMs })
          .then((taskResult) => {
            success += 1;
            if (taskResult && Number.isFinite(taskResult.durationMs)) {
              durations.push(taskResult.durationMs);
            }
            leakedDocsAutoReleased += Number(taskResult && taskResult.leakedDocsReleased || 0);
            releasedNodes += Number(taskResult && taskResult.releasedNodes || 0);
          })
          .catch((error) => {
            failed += 1;
            if (classifyTimeout(error)) {
              timedOut += 1;
            }
            if (errorSamples.length < 5) {
              errorSamples.push({
                message: String((error && error.message) || error),
                details: error && error.details ? error.details : null
              });
            }
          })
          .finally(() => {
            inFlight -= 1;
            completed += 1;
            if (completed >= config.totalTasks) {
              resolve();
            } else {
              launch();
            }
          });
      }
    };
    launch();
  });

  const elapsedMs = Date.now() - startedAt;
  const endStats = pool.getStats();
  // Use forceTerminate to avoid flaky worker shutdown crashes on Windows.
  await pool.close({ forceTerminate: true });

  const startRss = Number(startStats.memory.host.rss || 0) + Number(startStats.memory.workerRssTotal || 0);
  const endRss = Number(endStats.memory.host.rss || 0) + Number(endStats.memory.workerRssTotal || 0);
  const rssGrowthMb = bytesToMb(endRss - startRss);

  const failureRate = config.totalTasks > 0 ? failed / config.totalTasks : 0;
  const timeoutRate = config.totalTasks > 0 ? timedOut / config.totalTasks : 0;
  const recycleRate = config.totalTasks > 0
    ? (Number(endStats.recycled || 0) + Number(endStats.respawned || 0)) / config.totalTasks
    : 0;

  return {
    backend,
    config,
    totals: {
      success,
      failed,
      timedOut
    },
    throughputRps: elapsedMs > 0 ? Number((success / (elapsedMs / 1000)).toFixed(2)) : 0,
    latencyMs: {
      p50: percentile(durations, 50),
      p90: percentile(durations, 90),
      p99: percentile(durations, 99),
      max: durations.length > 0 ? Math.max(...durations) : 0
    },
    memory: {
      rssGrowthMb
    },
    stability: {
      failureRate: Number(failureRate.toFixed(5)),
      timeoutRate: Number(timeoutRate.toFixed(5)),
      workerRecycleRate: Number(recycleRate.toFixed(5)),
      leakedDocsAutoReleased,
      releasedNodes
    },
    errorSamples,
    poolStats: endStats
  };
}

function compareBaseline(jsCase, targetCase, targetName) {
  const label = targetName || targetCase.backend;
  const checks = [
    {
      name: `RPS_${label} >= RPS_js * 0.98`,
      pass: targetCase.throughputRps >= jsCase.throughputRps * 0.98,
      actual: targetCase.throughputRps,
      expected: `>= ${(jsCase.throughputRps * 0.98).toFixed(2)}`
    },
    {
      name: `p99_${label} <= p99_js * 1.05`,
      pass: targetCase.latencyMs.p99 <= jsCase.latencyMs.p99 * 1.05,
      actual: targetCase.latencyMs.p99,
      expected: `<= ${(jsCase.latencyMs.p99 * 1.05).toFixed(2)}`
    },
    {
      name: `rssGrowth_${label} <= rssGrowth_js * 1.10`,
      pass: targetCase.memory.rssGrowthMb <= jsCase.memory.rssGrowthMb * 1.1,
      actual: targetCase.memory.rssGrowthMb,
      expected: `<= ${(jsCase.memory.rssGrowthMb * 1.1).toFixed(2)}`
    },
    {
      name: `failureRate_${label} <= failureRate_js`,
      pass: targetCase.stability.failureRate <= jsCase.stability.failureRate,
      actual: targetCase.stability.failureRate,
      expected: `<= ${jsCase.stability.failureRate}`
    },
    {
      name: `timeoutRate_${label} <= timeoutRate_js`,
      pass: targetCase.stability.timeoutRate <= jsCase.stability.timeoutRate,
      actual: targetCase.stability.timeoutRate,
      expected: `<= ${jsCase.stability.timeoutRate}`
    }
  ];

  return {
    ok: checks.every((item) => item.pass),
    checks
  };
}

async function main() {
  const config = {
    poolSize: toPositiveInt(process.env.LEAP_DOM_BASELINE_POOL_SIZE, 4),
    concurrency: toPositiveInt(process.env.LEAP_DOM_BASELINE_CONCURRENCY, 16),
    totalTasks: toPositiveInt(process.env.LEAP_DOM_BASELINE_TOTAL_TASKS, 300),
    taskTimeoutMs: toPositiveInt(process.env.LEAP_DOM_BASELINE_TASK_TIMEOUT_MS, 10000),
    maxTasksPerWorker: toPositiveInt(process.env.LEAP_MAX_TASKS_PER_WORKER, 400)
  };

  console.log('[bench-dom-final-shape-baseline] running js backend...');
  const jsCase = await runCase('js', config);
  console.log('[bench-dom-final-shape-baseline] running spec backend (submitTreeSpec)...');
  const specCase = await runCase('spec', config);

  const comparisonSpec = compareBaseline(jsCase, specCase, 'spec');

  const report = {
    timestamp: new Date().toISOString(),
    config,
    js: jsCase,
    spec: specCase,
    comparison: {
      spec: comparisonSpec
    }
  };

  const outDir = path.resolve(__dirname, '..', '..', '..', 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `dom-final-shape-baseline-${nowForFilename()}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[bench-dom-final-shape-baseline] report file:', outFile);
  console.log(JSON.stringify({
    js_rps: jsCase.throughputRps,
    spec_rps: specCase.throughputRps,
    gate_spec: comparisonSpec.ok ? 'PASS' : 'FAIL',
    comparison: report.comparison
  }, null, 2));

  if (!comparisonSpec.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[bench-dom-final-shape-baseline] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
