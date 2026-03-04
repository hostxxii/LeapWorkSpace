const fs = require('fs');
const path = require('path');
const { ProcessPool } = require('../../../leap-env/src/pool/process-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

const LIGHT_SCRIPT = `
(function () {
  var ua = navigator.userAgent;
  var w = window.innerWidth;
  var h = window.innerHeight;
  return ua.length + w + h;
})();
`;

const HEAVY_SCRIPT = `
(function () {
  var sum = 0;
  for (var i = 0; i < 500000; i++) {
    sum += (i % 97);
  }
  var ua = navigator.userAgent;
  var p = navigator.platform;
  var w = window.innerWidth;
  var h = window.innerHeight;
  var token = (ua + '|' + p + '|' + (w + h + sum)).slice(0, 64);
  return token.length;
})();
`;

const TIMEOUT_SCRIPT = `
(function () {
  var sum = 0;
  for (var i = 0; i < 6000000; i++) {
    sum += (i % 13);
  }
  return sum;
})();
`;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function nowForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function runCase(label, opts) {
  const pool = new ProcessPool({
    size: opts.poolSize,
    taskTimeoutMs: opts.taskTimeoutMs,
    workerInitTimeoutMs: 20000,
    maxTasksPerWorker: opts.maxTasksPerWorker,
    heartbeatIntervalMs: 3000,
    heartbeatTimeoutMs: 12000
  });

  const durations = [];
  let success = 0;
  let failed = 0;
  let timeoutFailed = 0;

  const t0 = Date.now();
  await pool.start();
  const warmupDoneAt = Date.now();

  let inFlight = 0;
  let issued = 0;
  let completed = 0;

  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < opts.concurrency && issued < opts.totalTasks) {
        issued += 1;
        inFlight += 1;

        pool.runSignature({ targetScript: opts.targetScript }, { timeoutMs: opts.taskTimeoutMs })
          .then((result) => {
            success += 1;
            if (result && Number.isFinite(result.durationMs)) {
              durations.push(result.durationMs);
            }
          })
          .catch((error) => {
            failed += 1;
            const msg = (error && error.message) ? error.message : String(error);
            if (msg.toLowerCase().includes('timeout')) {
              timeoutFailed += 1;
            }
          })
          .finally(() => {
            inFlight -= 1;
            completed += 1;
            if (completed >= opts.totalTasks) {
              resolve();
            } else {
              launch();
            }
          });
      }
    };

    launch();
  });

  const finishedAt = Date.now();
  const poolStats = pool.getStats();
  await pool.close();

  const execMs = finishedAt - warmupDoneAt;
  const totalMs = finishedAt - t0;

  return {
    label,
    config: {
      poolSize: opts.poolSize,
      concurrency: opts.concurrency,
      totalTasks: opts.totalTasks,
      taskTimeoutMs: opts.taskTimeoutMs,
      maxTasksPerWorker: opts.maxTasksPerWorker
    },
    results: {
      success,
      failed,
      timeoutFailed,
      warmupMs: warmupDoneAt - t0,
      execMs,
      totalMs,
      throughputRps: execMs > 0 ? Number((success / (execMs / 1000)).toFixed(2)) : 0,
      latencyMs: {
        min: durations.length ? Math.min(...durations) : 0,
        p50: percentile(durations, 50),
        p90: percentile(durations, 90),
        p99: percentile(durations, 99),
        max: durations.length ? Math.max(...durations) : 0
      }
    },
    poolStats
  };
}

function buildCases() {
  const profile = (process.env.LEAP_BENCH_PROFILE || 'default').toLowerCase();
  const poolSize = Number.parseInt(process.env.LEAP_BENCH_POOL_SIZE || '4', 10);
  const concurrency = Number.parseInt(process.env.LEAP_BENCH_CONCURRENCY || '16', 10);

  const base = [
    {
      label: 'baseline-light',
      poolSize,
      concurrency,
      totalTasks: 120,
      taskTimeoutMs: 8000,
      maxTasksPerWorker: 200,
      targetScript: LIGHT_SCRIPT
    },
    {
      label: 'heavy-stable',
      poolSize,
      concurrency,
      totalTasks: 200,
      taskTimeoutMs: 8000,
      maxTasksPerWorker: 200,
      targetScript: HEAVY_SCRIPT
    },
    {
      label: 'recycle-check',
      poolSize,
      concurrency,
      totalTasks: 120,
      taskTimeoutMs: 8000,
      maxTasksPerWorker: 20,
      targetScript: LIGHT_SCRIPT
    }
  ];

  if (profile === 'quick') {
    return base.slice(0, 2).map((c) => ({
      ...c,
      totalTasks: Math.max(40, Math.floor(c.totalTasks / 3))
    }));
  }

  if (profile === 'chaos') {
    base.push({
      label: 'timeout-chaos',
      poolSize,
      concurrency,
      totalTasks: 60,
      taskTimeoutMs: 10,
      maxTasksPerWorker: 200,
      targetScript: TIMEOUT_SCRIPT
    });
  }

  return base;
}

async function main() {
  const cases = buildCases();
  const reports = [];

  for (const c of cases) {
    // Keep case-level progress visible in terminal for long runs.
    console.log(`[bench:pool] running case: ${c.label}`);
    reports.push(await runCase(c.label, c));
  }

  const output = {
    timestamp: new Date().toISOString(),
    profile: (process.env.LEAP_BENCH_PROFILE || 'default').toLowerCase(),
    reports
  };

  const outDir = path.resolve(process.cwd(), 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `process-pool-${nowForFilename()}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log('[bench:pool] report file:', outFile);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('[bench:pool] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
