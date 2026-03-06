const fs = require('fs');
const os = require('os');
const path = require('path');
const { ThreadPool } = require('../leap-env/src/pool/thread-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

const DEFAULTS = {
  poolSize: 12,
  concurrency: 48,
  maxTasksPerWorker: 50,
  warmupTasks: 20,
  totalTasks: 500,
  sampleEvery: 50,
  mode: 'baseline',
  debug: false,
  taskTimeoutMs: 30000,
  workerInitTimeoutMs: 30000,
  heartbeatIntervalMs: 3000,
  heartbeatTimeoutMs: 12000
};

function printHelp() {
  console.log(`Usage: node benchmarks/perf-baseline-runner.js [options]

Options:
  --pool <n>                   Override pool size (default: ${DEFAULTS.poolSize})
  --concurrency <n>            Override concurrency (default: ${DEFAULTS.concurrency})
  --max-tasks-per-worker <n>   Override max tasks per worker (default: ${DEFAULTS.maxTasksPerWorker})
  --total <n>                  Override measured task count (default: ${DEFAULTS.totalTasks})
  --mode <baseline|minimal|full>
                               Execution mode (default: ${DEFAULTS.mode})
  --debug                      Enable Hook/Inspector debug mode
  --help                       Show this help
`);
}

function toPositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseArgs(argv) {
  const config = {
    poolSize: DEFAULTS.poolSize,
    concurrency: DEFAULTS.concurrency,
    maxTasksPerWorker: DEFAULTS.maxTasksPerWorker,
    warmupTasks: DEFAULTS.warmupTasks,
    totalTasks: DEFAULTS.totalTasks,
    sampleEvery: DEFAULTS.sampleEvery,
    mode: DEFAULTS.mode,
    debug: DEFAULTS.debug,
    taskTimeoutMs: DEFAULTS.taskTimeoutMs,
    workerInitTimeoutMs: DEFAULTS.workerInitTimeoutMs,
    heartbeatIntervalMs: DEFAULTS.heartbeatIntervalMs,
    heartbeatTimeoutMs: DEFAULTS.heartbeatTimeoutMs
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--pool':
        i += 1;
        config.poolSize = toPositiveInt(argv[i], config.poolSize);
        break;
      case '--concurrency':
        i += 1;
        config.concurrency = toPositiveInt(argv[i], config.concurrency);
        break;
      case '--max-tasks-per-worker':
        i += 1;
        config.maxTasksPerWorker = toPositiveInt(argv[i], config.maxTasksPerWorker);
        break;
      case '--total':
        i += 1;
        config.totalTasks = toPositiveInt(argv[i], config.totalTasks);
        break;
      case '--mode':
        i += 1;
        config.mode = String(argv[i] || '').trim().toLowerCase() || config.mode;
        break;
      case '--debug':
        config.debug = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return config;
}

function resolveModeConfig(rawMode, config) {
  const mode = ['baseline', 'minimal', 'full'].includes(rawMode)
    ? rawMode
    : DEFAULTS.mode;

  if (mode === 'full') {
    return {
      mode,
      debug: true,
      debugCppWrapperRules: {
        enabled: true,
        phase: 'task'
      }
    };
  }

  if (mode === 'minimal') {
    return {
      mode,
      debug: false,
      debugCppWrapperRules: {
        enabled: false
      }
    };
  }

  return {
    mode,
    debug: !!config.debug,
    debugCppWrapperRules: {
      enabled: false
    }
  };
}

function nowForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function bytesToMb(bytes) {
  return Number((Number(bytes || 0) / (1024 * 1024)).toFixed(2));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function snapshotCpuTimes() {
  return os.cpus().map((cpu) => {
    const times = cpu.times || {};
    const idle = Number(times.idle || 0);
    const total = Object.values(times).reduce((sum, value) => sum + Number(value || 0), 0);
    return { idle, total };
  });
}

function diffCpuUsage(previous, current) {
  const cores = Math.min(previous.length, current.length);
  let totalIdle = 0;
  let totalAll = 0;
  const perCorePct = [];

  for (let i = 0; i < cores; i += 1) {
    const idleDelta = Math.max(0, current[i].idle - previous[i].idle);
    const totalDelta = Math.max(0, current[i].total - previous[i].total);
    totalIdle += idleDelta;
    totalAll += totalDelta;
    const usedPct = totalDelta > 0 ? (1 - (idleDelta / totalDelta)) * 100 : 0;
    perCorePct.push(round(usedPct));
  }

  const totalPct = totalAll > 0 ? (1 - (totalIdle / totalAll)) * 100 : 0;
  return {
    totalPct: round(totalPct),
    perCorePct
  };
}

function getPoolMemorySnapshot(stats) {
  const host = stats && stats.memory && stats.memory.host ? stats.memory.host : null;
  return {
    rssMb: bytesToMb(host && host.rss),
    heapUsedMb: bytesToMb(host && host.heapUsed),
    heapTotalMb: bytesToMb(host && host.heapTotal),
    externalMb: bytesToMb(host && host.external)
  };
}

function buildSample({ completedTasks, formalStartedAt, sampleEvery, windowRecords, cpuUsage, stats }) {
  const successfulDurations = windowRecords
    .filter((record) => record.ok)
    .map((record) => record.durationMs)
    .filter((value) => Number.isFinite(value));
  const first = windowRecords[0] || null;
  const last = windowRecords[windowRecords.length - 1] || null;
  const windowElapsedMs = first && last
    ? Math.max(1, last.completedAt - first.completedAt)
    : 1;
  const activeWorkers = Math.max(
    0,
    Number(stats && stats.workers || 0) - Number(stats && stats.idleWorkers || 0)
  );
  const memory = getPoolMemorySnapshot(stats);

  return {
    sampleIndex: Math.ceil(completedTasks / sampleEvery),
    timestamp: new Date().toISOString(),
    elapsedMs: Math.max(0, Date.now() - formalStartedAt),
    completedTasks,
    windowSize: windowRecords.length,
    windowSuccesses: successfulDurations.length,
    reqPerSec: round((windowRecords.length / (windowElapsedMs / 1000))),
    latencyMs: {
      p50: round(percentile(successfulDurations, 50)),
      p95: round(percentile(successfulDurations, 95)),
      p99: round(percentile(successfulDurations, 99))
    },
    cpu: cpuUsage,
    memory,
    activeWorkers,
    pool: {
      workers: Number(stats && stats.workers || 0),
      idleWorkers: Number(stats && stats.idleWorkers || 0),
      activeTasks: Number(stats && stats.activeTasks || 0),
      pendingTasks: Number(stats && stats.pendingTasks || 0)
    }
  };
}

async function executeStage({ stageName, pool, totalTasks, concurrency, payload, timeoutMs, onTaskSettled }) {
  let issued = 0;
  let inFlight = 0;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors = [];

  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < concurrency && issued < totalTasks) {
        issued += 1;
        inFlight += 1;
        const stageTaskId = `${stageName}-${issued}`;
        const startedAt = Date.now();

        pool.runSignature(
          {
            ...payload,
            taskId: stageTaskId
          },
          { timeoutMs }
        )
          .then((result) => {
            succeeded += 1;
            const completedAt = Date.now();
            onTaskSettled(null, {
              taskId: stageTaskId,
              startedAt,
              completedAt,
              durationMs: Number.isFinite(result && result.durationMs)
                ? Number(result.durationMs)
                : completedAt - startedAt,
              result
            });
          })
          .catch((error) => {
            failed += 1;
            const completedAt = Date.now();
            if (errors.length < 10) {
              errors.push({
                taskId: stageTaskId,
                message: error && error.message ? error.message : String(error)
              });
            }
            onTaskSettled(error, {
              taskId: stageTaskId,
              startedAt,
              completedAt,
              durationMs: completedAt - startedAt,
              result: null
            });
          })
          .finally(() => {
            inFlight -= 1;
            completed += 1;
            if (completed >= totalTasks) {
              resolve();
              return;
            }
            launch();
          });
      }
    };

    if (totalTasks <= 0) {
      resolve();
      return;
    }

    launch();
  });

  return {
    totalTasks,
    succeeded,
    failed,
    errors
  };
}

function summarizePoolStats(stats) {
  const memory = getPoolMemorySnapshot(stats);
  return {
    workers: Number(stats && stats.workers || 0),
    idleWorkers: Number(stats && stats.idleWorkers || 0),
    activeTasks: Number(stats && stats.activeTasks || 0),
    pendingTasks: Number(stats && stats.pendingTasks || 0),
    metrics: {
      enqueued: Number(stats && stats.enqueued || 0),
      started: Number(stats && stats.started || 0),
      succeeded: Number(stats && stats.succeeded || 0),
      failed: Number(stats && stats.failed || 0),
      timedOut: Number(stats && stats.timedOut || 0),
      recycled: Number(stats && stats.recycled || 0),
      respawned: Number(stats && stats.respawned || 0)
    },
    memory
  };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const modeConfig = resolveModeConfig(config.mode, config);
  const repoRoot = path.resolve(__dirname, '..');
  const targetScriptPath = path.join(repoRoot, 'work', 'h5st.js');
  const siteProfilePath = path.join(repoRoot, 'site-profiles', 'jd.json');

  if (!fs.existsSync(targetScriptPath)) {
    throw new Error(`Target script not found: ${targetScriptPath}`);
  }
  if (!fs.existsSync(siteProfilePath)) {
    throw new Error(`Site profile not found: ${siteProfilePath}`);
  }

  const targetScript = fs.readFileSync(targetScriptPath, 'utf8');
  const siteProfile = JSON.parse(fs.readFileSync(siteProfilePath, 'utf8'));
  const pool = new ThreadPool({
    size: config.poolSize,
    debug: modeConfig.debug,
    debugCppWrapperRules: modeConfig.debugCppWrapperRules,
    maxTasksPerWorker: config.maxTasksPerWorker,
    taskTimeoutMs: config.taskTimeoutMs,
    workerInitTimeoutMs: config.workerInitTimeoutMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs
  });

  const basePayload = {
    resourceName: targetScriptPath,
    targetScript,
    siteProfile
  };

  const outputDir = path.join(__dirname, 'results');
  const outputPath = path.join(outputDir, `baseline-${modeConfig.mode}-${nowForFilename()}.json`);
  const samples = [];
  const measuredDurations = [];
  const formalErrors = [];
  const slidingWindow = [];
  let formalCompletedTasks = 0;
  let lastCpuSnapshot = snapshotCpuTimes();
  let peakRssMb = 0;
  let peakCpuPct = 0;
  let warmupResult;
  let measuredResult;
  let formalStartedAt = 0;
  let formalFinishedAt = 0;

  console.log('[baseline] starting thread-pool benchmark');
  console.log(
    `[baseline] config mode=${modeConfig.mode} pool=${config.poolSize} concurrency=${config.concurrency} ` +
    `maxTasksPerWorker=${config.maxTasksPerWorker} warmup=${config.warmupTasks} total=${config.totalTasks} ` +
    `debug=${modeConfig.debug} builtinWrapper=${!!(modeConfig.debugCppWrapperRules && modeConfig.debugCppWrapperRules.enabled)}`
  );

  await pool.start();

  try {
    console.log(`[baseline] warmup ${config.warmupTasks} tasks ...`);
    const warmupStartedAt = Date.now();
    warmupResult = await executeStage({
      stageName: 'warmup',
      pool,
      totalTasks: config.warmupTasks,
      concurrency: config.concurrency,
      payload: basePayload,
      timeoutMs: config.taskTimeoutMs,
      onTaskSettled: () => {}
    });
    const warmupFinishedAt = Date.now();

    formalStartedAt = Date.now();
    lastCpuSnapshot = snapshotCpuTimes();
    console.log(`[baseline] measuring ${config.totalTasks} tasks ...`);
    measuredResult = await executeStage({
      stageName: 'measure',
      pool,
      totalTasks: config.totalTasks,
      concurrency: config.concurrency,
      payload: basePayload,
      timeoutMs: config.taskTimeoutMs,
      onTaskSettled: (error, taskRecord) => {
        formalCompletedTasks += 1;
        if (error) {
          if (formalErrors.length < 10) {
            formalErrors.push({
              taskId: taskRecord.taskId,
              message: error && error.message ? error.message : String(error)
            });
          }
        } else {
          measuredDurations.push(taskRecord.durationMs);
        }

        slidingWindow.push({
          ok: !error,
          durationMs: taskRecord.durationMs,
          completedAt: taskRecord.completedAt
        });
        if (slidingWindow.length > config.sampleEvery) {
          slidingWindow.shift();
        }

        const shouldSample = (
          formalCompletedTasks % config.sampleEvery === 0 ||
          formalCompletedTasks === config.totalTasks
        );

        if (!shouldSample) {
          return;
        }

        const nextCpuSnapshot = snapshotCpuTimes();
        const cpuUsage = diffCpuUsage(lastCpuSnapshot, nextCpuSnapshot);
        lastCpuSnapshot = nextCpuSnapshot;

        const stats = pool.getStats();
        const sample = buildSample({
          completedTasks: formalCompletedTasks,
          formalStartedAt,
          sampleEvery: config.sampleEvery,
          windowRecords: slidingWindow,
          cpuUsage,
          stats
        });

        peakRssMb = Math.max(peakRssMb, sample.memory.rssMb);
        peakCpuPct = Math.max(peakCpuPct, sample.cpu.totalPct);
        samples.push(sample);

        console.log(
          `[baseline] sample ${samples.length} completed=${sample.completedTasks}/${config.totalTasks} req/s=${sample.reqPerSec} p95=${sample.latencyMs.p95}ms p99=${sample.latencyMs.p99}ms cpu=${sample.cpu.totalPct}% rss=${sample.memory.rssMb}MB activeWorkers=${sample.activeWorkers}`
        );
      }
    });
    formalFinishedAt = Date.now();

    const finalStats = pool.getStats();
    const finalMemory = getPoolMemorySnapshot(finalStats);
    peakRssMb = Math.max(peakRssMb, finalMemory.rssMb);

    const overallDurationMs = Math.max(1, formalFinishedAt - formalStartedAt);
    const result = {
      timestamp: new Date().toISOString(),
      machine: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        logicalCores: os.cpus().length,
        cpuModel: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
        totalMemoryMb: bytesToMb(os.totalmem())
      },
      config: {
        mode: modeConfig.mode,
        backend: 'thread',
        poolSize: config.poolSize,
        concurrency: config.concurrency,
        maxTasksPerWorker: config.maxTasksPerWorker,
        warmupTasks: config.warmupTasks,
        totalTasks: config.totalTasks,
        sampleEvery: config.sampleEvery,
        debug: modeConfig.debug,
        builtinWrapperEnabled: !!(modeConfig.debugCppWrapperRules && modeConfig.debugCppWrapperRules.enabled),
        taskTimeoutMs: config.taskTimeoutMs,
        workerInitTimeoutMs: config.workerInitTimeoutMs,
        heartbeatIntervalMs: config.heartbeatIntervalMs,
        heartbeatTimeoutMs: config.heartbeatTimeoutMs,
        targetScriptPath: path.relative(repoRoot, targetScriptPath),
        siteProfilePath: path.relative(repoRoot, siteProfilePath)
      },
      warmup: {
        tasks: config.warmupTasks,
        succeeded: warmupResult.succeeded,
        failed: warmupResult.failed,
        durationMs: warmupFinishedAt - warmupStartedAt,
        errors: warmupResult.errors
      },
      overall: {
        startedAt: new Date(formalStartedAt).toISOString(),
        finishedAt: new Date(formalFinishedAt).toISOString(),
        durationMs: overallDurationMs,
        success: measuredResult.succeeded,
        failed: measuredResult.failed,
        reqPerSec: round(measuredResult.succeeded / (overallDurationMs / 1000)),
        latencyMs: {
          p50: round(percentile(measuredDurations, 50)),
          p95: round(percentile(measuredDurations, 95)),
          p99: round(percentile(measuredDurations, 99))
        },
        peakRssMb: round(peakRssMb),
        peakCpuPct: round(peakCpuPct)
      },
      finalSnapshot: {
        cpu: samples.length > 0 ? samples[samples.length - 1].cpu : { totalPct: 0, perCorePct: [] },
        memory: finalMemory,
        pool: summarizePoolStats(finalStats)
      },
      samples,
      errors: formalErrors
    };

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

    console.log('');
    console.log('[baseline] summary');
    console.log(`  output: ${outputPath}`);
    console.log(`  overall req/s: ${result.overall.reqPerSec}`);
    console.log(`  latency p50/p95/p99: ${result.overall.latencyMs.p50} / ${result.overall.latencyMs.p95} / ${result.overall.latencyMs.p99} ms`);
    console.log(`  peak rss: ${result.overall.peakRssMb} MB`);
    console.log(`  peak cpu: ${result.overall.peakCpuPct}%`);
    console.log(`  success/failed: ${result.overall.success}/${result.overall.failed}`);
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error('[baseline] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
