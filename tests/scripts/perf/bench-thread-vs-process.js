const fs = require('fs');
const path = require('path');
const { ProcessPool } = require('../../../leap-env/src/pool/process-pool');
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
  for (var i = 0; i < 300000; i++) {
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

async function runCase(mode, PoolCtor, opts) {
  const pool = new PoolCtor({
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

  const t0 = Date.now();
  await pool.start();

  let inFlight = 0;
  let issued = 0;
  let completed = 0;

  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < opts.concurrency && issued < opts.totalTasks) {
        issued += 1;
        inFlight += 1;

        pool.runSignature({ targetScript: TARGET_SCRIPT }, { timeoutMs: opts.taskTimeoutMs })
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

  const t1 = Date.now();
  const stats = pool.getStats();
  await pool.close();

  const elapsedMs = t1 - t0;
  return {
    mode,
    config: opts,
    results: {
      success,
      failed,
      elapsedMs,
      throughputRps: elapsedMs > 0 ? Number((success / (elapsedMs / 1000)).toFixed(2)) : 0,
      latencyMs: {
        min: durations.length ? Math.min(...durations) : 0,
        p50: percentile(durations, 50),
        p90: percentile(durations, 90),
        p99: percentile(durations, 99),
        max: durations.length ? Math.max(...durations) : 0
      }
    },
    poolStats: stats
  };
}

async function main() {
  const opts = {
    poolSize: Number.parseInt(process.env.LEAP_BENCH_POOL_SIZE || '4', 10),
    concurrency: Number.parseInt(process.env.LEAP_BENCH_CONCURRENCY || '16', 10),
    totalTasks: Number.parseInt(process.env.LEAP_BENCH_TOTAL_TASKS || '200', 10),
    taskTimeoutMs: Number.parseInt(process.env.LEAP_BENCH_TASK_TIMEOUT_MS || '8000', 10),
    maxTasksPerWorker: Number.parseInt(process.env.LEAP_MAX_TASKS_PER_WORKER || '200', 10)
  };

  const reports = [];
  console.log('[bench-thread-vs-process] running process pool...');
  reports.push(await runCase('process', ProcessPool, opts));

  console.log('[bench-thread-vs-process] running thread pool...');
  reports.push(await runCase('thread', ThreadPool, opts));

  const output = {
    timestamp: new Date().toISOString(),
    reports
  };

  const outDir = path.resolve(process.cwd(), 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `thread-vs-process-${nowForFilename()}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log('[bench-thread-vs-process] report file:', outFile);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error('[bench-thread-vs-process] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
