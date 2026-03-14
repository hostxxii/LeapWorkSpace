const { ThreadPool } = require('../../../leap-env/src/pool/thread-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

const TARGET_SCRIPT = `
(function () {
  var sum = 0;
  for (var i = 0; i < 200000; i++) {
    sum += (i % 97);
  }

  var width = 0;
  try {
    width = (typeof window !== 'undefined' && Number(window.innerWidth)) || 0;
  } catch (_) {}

  var uaLen = 0;
  try {
    var ua = (typeof navigator !== 'undefined') ? navigator.userAgent : '';
    uaLen = (typeof ua === 'string') ? ua.length : 0;
  } catch (_) {}

  return String(sum + width + uaLen);
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

async function runGateCase() {
  const config = {
    poolSize: toPositiveInt(process.env.LEAP_GATE_POOL_SIZE, 4),
    totalTasks: toPositiveInt(process.env.LEAP_GATE_TOTAL_TASKS, 300),
    concurrency: toPositiveInt(process.env.LEAP_GATE_CONCURRENCY, 16),
    taskTimeoutMs: toPositiveInt(process.env.LEAP_GATE_TASK_TIMEOUT_MS, 8000),
    maxTasksPerWorker: toPositiveInt(process.env.LEAP_MAX_TASKS_PER_WORKER, 400),
    domBackend: String(process.env.LEAP_DOM_BACKEND || 'js').trim().toLowerCase() === 'native' ? 'native' : 'js'
  };

  const gate = {
    maxFailed: Math.max(0, Number.parseInt(process.env.LEAP_GATE_MAX_FAILED || '0', 10)),
    minSuccessRatio: Number.isFinite(Number(process.env.LEAP_GATE_MIN_SUCCESS_RATIO))
      ? Number(process.env.LEAP_GATE_MIN_SUCCESS_RATIO)
      : 1,
    maxP99Ms: toPositiveInt(process.env.LEAP_GATE_MAX_P99_MS, 1200),
    maxRssGrowthMb: Number.isFinite(Number(process.env.LEAP_GATE_MAX_RSS_GROWTH_MB))
      ? Number(process.env.LEAP_GATE_MAX_RSS_GROWTH_MB)
      : 120
  };

  const pool = new ThreadPool({
    size: config.poolSize,
    taskTimeoutMs: config.taskTimeoutMs,
    workerInitTimeoutMs: 20000,
    heartbeatIntervalMs: 3000,
    heartbeatTimeoutMs: 12000,
    maxTasksPerWorker: config.maxTasksPerWorker,
    domBackend: config.domBackend
  });

  let finalStats = null;
  const durations = [];
  let success = 0;
  let failed = 0;

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
        pool.runSignature({ targetScript: TARGET_SCRIPT }, { timeoutMs: config.taskTimeoutMs })
          .then((result) => {
            success += 1;
            if (result && Number.isFinite(result.durationMs)) {
              durations.push(result.durationMs);
            }
          })
          .catch(() => {
            failed += 1;
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
  finalStats = pool.getStats();
  await pool.close();

  const startRssTotal = Number(startStats.memory.host.rss || 0) + Number(startStats.memory.workerRssTotal || 0);
  const endRssTotal = Number(finalStats.memory.host.rss || 0) + Number(finalStats.memory.workerRssTotal || 0);
  const rssGrowthMb = bytesToMb(endRssTotal - startRssTotal);
  const successRatio = config.totalTasks > 0 ? success / config.totalTasks : 0;

  const metrics = {
    success,
    failed,
    successRatio: Number(successRatio.toFixed(4)),
    throughputRps: elapsedMs > 0 ? Number((success / (elapsedMs / 1000)).toFixed(2)) : 0,
    latencyMs: {
      p50: percentile(durations, 50),
      p90: percentile(durations, 90),
      p99: percentile(durations, 99),
      max: durations.length ? Math.max(...durations) : 0
    },
    rssGrowthMb
  };

  const checks = [
    {
      name: 'failed<=maxFailed',
      pass: failed <= gate.maxFailed,
      actual: failed,
      expected: `<= ${gate.maxFailed}`
    },
    {
      name: 'successRatio>=minSuccessRatio',
      pass: successRatio >= gate.minSuccessRatio,
      actual: Number(successRatio.toFixed(4)),
      expected: `>= ${gate.minSuccessRatio}`
    },
    {
      name: 'p99<=maxP99Ms',
      pass: metrics.latencyMs.p99 <= gate.maxP99Ms,
      actual: metrics.latencyMs.p99,
      expected: `<= ${gate.maxP99Ms}`
    },
    {
      name: 'rssGrowth<=maxRssGrowthMb',
      pass: rssGrowthMb <= gate.maxRssGrowthMb,
      actual: rssGrowthMb,
      expected: `<= ${gate.maxRssGrowthMb}`
    }
  ];

  return {
    ok: checks.every((item) => item.pass),
    config,
    gate,
    metrics,
    checks,
    poolStats: finalStats
  };
}

runGateCase()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error('[check-thread-mainline-gate] failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
