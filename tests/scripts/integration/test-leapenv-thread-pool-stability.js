const { ThreadPool } = require('../../../leap-env/src/pool/thread-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'info';
}

const TOTAL_TASKS = Number.parseInt(process.env.LEAP_STABILITY_TASKS || '500', 10);
const CONCURRENCY = Number.parseInt(process.env.LEAP_STABILITY_CONCURRENCY || '16', 10);

const TARGET_SCRIPT = `
(function () {
  var sum = 0;
  for (var i = 0; i < 50000; i++) {
    sum += (i % 17);
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

async function main() {
  const pool = new ThreadPool({
    size: Number.parseInt(process.env.LEAP_POOL_SIZE || '4', 10),
    taskTimeoutMs: Number.parseInt(process.env.LEAP_TASK_TIMEOUT_MS || '8000', 10),
    workerInitTimeoutMs: 20000,
    heartbeatIntervalMs: 3000,
    heartbeatTimeoutMs: 12000,
    maxTasksPerWorker: Number.parseInt(process.env.LEAP_MAX_TASKS_PER_WORKER || '200', 10)
  });

  await pool.start();
  const startedAt = Date.now();

  let inFlight = 0;
  let issued = 0;
  let completed = 0;
  let failed = 0;

  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < CONCURRENCY && issued < TOTAL_TASKS) {
        issued += 1;
        inFlight += 1;

        pool.runSignature({ targetScript: TARGET_SCRIPT })
          .catch(() => {
            failed += 1;
          })
          .finally(() => {
            inFlight -= 1;
            completed += 1;
            if (completed >= TOTAL_TASKS) {
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
  const stats = pool.getStats();
  await pool.close();

  console.log(JSON.stringify({
    totalTasks: TOTAL_TASKS,
    concurrency: CONCURRENCY,
    failed,
    elapsedMs,
    throughputRps: elapsedMs > 0 ? Number((TOTAL_TASKS / (elapsedMs / 1000)).toFixed(2)) : 0,
    stats
  }, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[test-thread-pool-stability] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
