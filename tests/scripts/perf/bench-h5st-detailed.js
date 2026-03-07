const fs = require('fs');
const os = require('os');
const path = require('path');
const { ThreadPool } = require('../../../leap-env/src/pool/thread-pool');
const { ProcessPool } = require('../../../leap-env/src/pool/process-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

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

function getUniqueWorkerPids(workersDetail) {
  const set = new Set();
  for (const worker of workersDetail || []) {
    if (worker && Number.isFinite(worker.pid)) {
      set.add(worker.pid);
    }
  }
  return Array.from(set.values());
}

async function runCase(mode, PoolCtor, config, targetScript) {
  const pool = new PoolCtor({
    size: config.poolSize,
    taskTimeoutMs: config.taskTimeoutMs,
    workerInitTimeoutMs: config.workerInitTimeoutMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs,
    maxTasksPerWorker: config.maxTasksPerWorker
  });

  const durations = [];
  let success = 0;
  let failed = 0;
  let timeoutFailed = 0;
  let inFlight = 0;
  let issued = 0;
  let completed = 0;

  const tStart = Date.now();
  await pool.start();
  const tWarmupDone = Date.now();
  const startStats = pool.getStats();

  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < config.concurrency && issued < config.totalTasks) {
        issued += 1;
        inFlight += 1;
        pool.runSignature({ targetScript }, { timeoutMs: config.taskTimeoutMs })
          .then((result) => {
            success += 1;
            if (result && Number.isFinite(result.durationMs)) {
              durations.push(result.durationMs);
            }
          })
          .catch((error) => {
            failed += 1;
            const message = error && error.message ? error.message : String(error);
            if (String(message).toLowerCase().includes('timeout')) {
              timeoutFailed += 1;
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

  const tFinish = Date.now();
  const endStats = pool.getStats();
  await pool.close();

  const execMs = tFinish - tWarmupDone;
  const totalMs = tFinish - tStart;
  const successRatio = config.totalTasks > 0 ? success / config.totalTasks : 0;

  const hostRss = Number(endStats.memory && endStats.memory.host && endStats.memory.host.rss || 0);
  const hostHeapUsed = Number(endStats.memory && endStats.memory.host && endStats.memory.host.heapUsed || 0);
  const workerRss = Number(endStats.memory && endStats.memory.workerRssTotal || 0);
  const workerHeapUsed = Number(endStats.memory && endStats.memory.workerHeapUsedTotal || 0);

  const startHostRss = Number(startStats.memory && startStats.memory.host && startStats.memory.host.rss || 0);
  const startWorkerRss = Number(startStats.memory && startStats.memory.workerRssTotal || 0);

  const uniquePids = getUniqueWorkerPids(endStats.workersDetail || []);
  const totalRuntimeRssBytes = mode === 'thread'
    ? hostRss
    : (hostRss + workerRss);
  const totalRuntimeRssGrowthBytes = mode === 'thread'
    ? (hostRss - startHostRss)
    : ((hostRss + workerRss) - (startHostRss + startWorkerRss));

  return {
    mode,
    caseName: `${mode}-p${config.poolSize}-c${config.concurrency}`,
    config: {
      poolSize: config.poolSize,
      concurrency: config.concurrency,
      totalTasks: config.totalTasks,
      taskTimeoutMs: config.taskTimeoutMs,
      workerInitTimeoutMs: config.workerInitTimeoutMs,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs,
      maxTasksPerWorker: config.maxTasksPerWorker
    },
    results: {
      success,
      failed,
      timeoutFailed,
      successRatio: Number(successRatio.toFixed(4)),
      warmupMs: tWarmupDone - tStart,
      execMs,
      totalMs,
      throughputRps: execMs > 0 ? Number((success / (execMs / 1000)).toFixed(2)) : 0,
      latencyMs: {
        min: durations.length ? Math.min(...durations) : 0,
        p50: percentile(durations, 50),
        p90: percentile(durations, 90),
        p95: percentile(durations, 95),
        p99: percentile(durations, 99),
        max: durations.length ? Math.max(...durations) : 0
      }
    },
    memory: {
      host: {
        rssMb: bytesToMb(hostRss),
        heapUsedMb: bytesToMb(hostHeapUsed)
      },
      worker: {
        rssTotalMb: bytesToMb(workerRss),
        heapUsedTotalMb: bytesToMb(workerHeapUsed),
        workersWithMemory: Number(endStats.memory && endStats.memory.workersWithMemory || 0)
      },
      totalRuntimeRssMb: bytesToMb(totalRuntimeRssBytes),
      totalRuntimeRssGrowthMb: bytesToMb(totalRuntimeRssGrowthBytes),
      uniqueWorkerPids: uniquePids
    },
    poolStats: endStats
  };
}

function buildPlan() {
  const totalTasks = toPositiveInt(process.env.LEAP_H5ST_TOTAL_TASKS, 320);
  const taskTimeoutMs = toPositiveInt(process.env.LEAP_H5ST_TASK_TIMEOUT_MS, 15000);
  const workerInitTimeoutMs = toPositiveInt(process.env.LEAP_H5ST_WORKER_INIT_TIMEOUT_MS, 30000);
  const maxTasksPerWorker = toPositiveInt(process.env.LEAP_H5ST_MAX_TASKS_PER_WORKER, 500);

  const common = {
    totalTasks,
    taskTimeoutMs,
    workerInitTimeoutMs,
    heartbeatIntervalMs: 3000,
    heartbeatTimeoutMs: 12000,
    maxTasksPerWorker
  };

  return [
    { mode: 'thread', poolSize: 1, concurrency: 1, ...common },
    { mode: 'thread', poolSize: 2, concurrency: 8, ...common },
    { mode: 'thread', poolSize: 4, concurrency: 16, ...common },
    { mode: 'thread', poolSize: 8, concurrency: 32, ...common },
    { mode: 'thread', poolSize: 12, concurrency: 48, ...common },
    { mode: 'thread', poolSize: 16, concurrency: 64, ...common },
    { mode: 'process', poolSize: 2, concurrency: 8, ...common },
    { mode: 'process', poolSize: 4, concurrency: 16, ...common },
    { mode: 'process', poolSize: 8, concurrency: 32, ...common },
    { mode: 'process', poolSize: 12, concurrency: 48, ...common }
  ];
}

async function main() {
  const scriptPath = path.resolve(process.cwd(), process.env.LEAP_H5ST_SCRIPT_PATH || 'work/h5st.js');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`h5st script not found: ${scriptPath}`);
  }

  const targetScript = fs.readFileSync(scriptPath, 'utf8');
  const plan = buildPlan();
  const reports = [];

  for (const cfg of plan) {
    const label = `${cfg.mode}-p${cfg.poolSize}-c${cfg.concurrency}`;
    console.log(`[bench-h5st] running ${label} ...`);
    const PoolCtor = cfg.mode === 'thread' ? ThreadPool : ProcessPool;
    reports.push(await runCase(cfg.mode, PoolCtor, cfg, targetScript));
  }

  const output = {
    timestamp: new Date().toISOString(),
    machine: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      logicalCores: os.cpus().length
    },
    workload: {
      scriptPath,
      scriptSizeBytes: targetScript.length
    },
    plan: {
      totalCases: plan.length,
      totalTasksPerCase: plan[0] ? plan[0].totalTasks : 0
    },
    reports
  };

  const outDir = path.resolve(process.cwd(), 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `h5st-detailed-${nowForFilename()}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log('[bench-h5st] report file:', outFile);
  console.log(JSON.stringify({
    timestamp: output.timestamp,
    machine: output.machine,
    workload: output.workload,
    plan: output.plan,
    outFile
  }, null, 2));
}

main().catch((error) => {
  console.error('[bench-h5st] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
