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

const MATRIX = [10, 25, 50, 100, 200, 500, 1000];

const DEFAULTS = {
  poolSize: 12,
  concurrency: 48,
  maxTasksPerWorker: null,
  maxTasksPerWorkerMatrix: MATRIX,
  warmupTasks: 20,
  totalTasks: 2000,
  sampleEvery: 50,
  taskTimeoutMs: 30000,
  workerInitTimeoutMs: 30000,
  heartbeatIntervalMs: 3000,
  heartbeatTimeoutMs: 12000,
  signatureProfile: 'fp-occupy'
};

function printHelp() {
  console.log(`Usage: node benchmarks/longevity-runner.js [options]

Options:
  --max-tasks-per-worker <n>   Run a single configuration
  --pool <n>                   Override pool size (default: ${DEFAULTS.poolSize})
  --concurrency <n>            Override concurrency (default: ${DEFAULTS.concurrency})
  --total <n>                  Override measured task count (default: ${DEFAULTS.totalTasks})
  --warmup <n>                 Override warmup task count (default: ${DEFAULTS.warmupTasks})
  --sample-every <n>           Override sample frequency (default: ${DEFAULTS.sampleEvery})
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
    maxTasksPerWorkerMatrix: DEFAULTS.maxTasksPerWorkerMatrix,
    warmupTasks: DEFAULTS.warmupTasks,
    totalTasks: DEFAULTS.totalTasks,
    sampleEvery: DEFAULTS.sampleEvery,
    taskTimeoutMs: DEFAULTS.taskTimeoutMs,
    workerInitTimeoutMs: DEFAULTS.workerInitTimeoutMs,
    heartbeatIntervalMs: DEFAULTS.heartbeatIntervalMs,
    heartbeatTimeoutMs: DEFAULTS.heartbeatTimeoutMs,
    signatureProfile: DEFAULTS.signatureProfile
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--max-tasks-per-worker':
        i += 1;
        config.maxTasksPerWorker = toPositiveInt(argv[i], config.maxTasksPerWorker);
        break;
      case '--pool':
        i += 1;
        config.poolSize = toPositiveInt(argv[i], config.poolSize);
        break;
      case '--concurrency':
        i += 1;
        config.concurrency = toPositiveInt(argv[i], config.concurrency);
        break;
      case '--total':
        i += 1;
        config.totalTasks = toPositiveInt(argv[i], config.totalTasks);
        break;
      case '--warmup':
        i += 1;
        config.warmupTasks = toPositiveInt(argv[i], config.warmupTasks);
        break;
      case '--sample-every':
        i += 1;
        config.sampleEvery = toPositiveInt(argv[i], config.sampleEvery);
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
            if (errors.length < 20) {
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

function buildWorkerSnapshotMap(workersDetail) {
  const out = {};
  const source = Array.isArray(workersDetail) ? workersDetail : [];
  for (let i = 0; i < source.length; i += 1) {
    const worker = source[i];
    const runtimeStats = worker.runtimeStats || null;
    out[String(worker.workerId)] = {
      tasksHandled: Number(worker.tasksHandled || 0),
      status: worker.status || 'unknown',
      cleanupFailureCount: Number(worker.cleanupFailureCount || 0),
      terminateReason: worker.terminateReason || null,
      terminateMode: worker.terminateMode || null,
      terminateRequestedAt: worker.terminateRequestedAt || null,
      shutdownAckAt: worker.shutdownAckAt || null,
      cleanupSkipped: worker.cleanupSkipped === true,
      memoryUsage: worker.memoryUsage
        ? {
            rssMb: bytesToMb(worker.memoryUsage.rss),
            heapUsedMb: bytesToMb(worker.memoryUsage.heapUsed),
            heapTotalMb: bytesToMb(worker.memoryUsage.heapTotal),
            externalMb: bytesToMb(worker.memoryUsage.external),
            arrayBuffersMb: bytesToMb(worker.memoryUsage.arrayBuffers)
          }
        : null,
      runtimeStats: runtimeStats
        ? {
            activeDocs: Number(runtimeStats.activeDocs || 0),
            activeNodes: Number(runtimeStats.activeNodes || 0),
            activeTasks: Number(runtimeStats.activeTasks || 0),
            windowListenerCount: Number(runtimeStats.windowListenerCount || 0),
            rafCount: Number(runtimeStats.rafCount || 0),
            timeoutCount: Number(runtimeStats.timeoutCount || 0),
            intervalCount: Number(runtimeStats.intervalCount || 0),
            pendingTimerCount: Number(runtimeStats.pendingTimerCount || 0),
            messageChannelCount: Number(runtimeStats.messageChannelCount || 0),
            messagePortOpenCount: Number(runtimeStats.messagePortOpenCount || 0),
            messagePortClosedCount: Number(runtimeStats.messagePortClosedCount || 0),
            messagePortQueueCount: Number(runtimeStats.messagePortQueueCount || 0),
            placeholderXhrCreatedCount: Number(runtimeStats.placeholderXhrCreatedCount || 0),
            placeholderXhrFallbackCount: Number(runtimeStats.placeholderXhrFallbackCount || 0),
            vmPendingTaskCount: Number(runtimeStats.vmPendingTaskCount || 0),
            vmTimerCount: Number(runtimeStats.vmTimerCount || 0),
            vmTimerQueueSize: Number(runtimeStats.vmTimerQueueSize || 0),
            vmStaleTimerQueueCount: Number(runtimeStats.vmStaleTimerQueueCount || 0),
            vmDomWrapperCacheSize: Number(runtimeStats.vmDomWrapperCacheSize || 0),
            vmPendingDomWrapperCleanupCount: Number(runtimeStats.vmPendingDomWrapperCleanupCount || 0),
            vmChildFrameCount: Number(runtimeStats.vmChildFrameCount || 0),
            vmChildFrameDispatchFnCount: Number(runtimeStats.vmChildFrameDispatchFnCount || 0),
            vmMainDispatchFnCached: Number(runtimeStats.vmMainDispatchFnCached || 0),
            domDocumentCount: Number(runtimeStats.domDocumentCount || 0),
            domTaskScopeCount: Number(runtimeStats.domTaskScopeCount || 0),
            domHandleCount: Number(runtimeStats.domHandleCount || 0),
            skeletonCount: Number(runtimeStats.skeletonCount || 0),
            skeletonTemplateCount: Number(runtimeStats.skeletonTemplateCount || 0),
            skeletonDispatchMetaCount: Number(runtimeStats.skeletonDispatchMetaCount || 0),
            skeletonBrandCompatCacheSize: Number(runtimeStats.skeletonBrandCompatCacheSize || 0),
            v8TotalHeapSize: Number(runtimeStats.v8TotalHeapSize || 0),
            v8TotalHeapSizeExecutable: Number(runtimeStats.v8TotalHeapSizeExecutable || 0),
            v8TotalPhysicalSize: Number(runtimeStats.v8TotalPhysicalSize || 0),
            v8TotalAvailableSize: Number(runtimeStats.v8TotalAvailableSize || 0),
            v8UsedHeapSize: Number(runtimeStats.v8UsedHeapSize || 0),
            v8HeapSizeLimit: Number(runtimeStats.v8HeapSizeLimit || 0),
            v8MallocedMemory: Number(runtimeStats.v8MallocedMemory || 0),
            v8PeakMallocedMemory: Number(runtimeStats.v8PeakMallocedMemory || 0),
            v8ExternalMemory: Number(runtimeStats.v8ExternalMemory || 0),
            v8TotalGlobalHandlesSize: Number(runtimeStats.v8TotalGlobalHandlesSize || 0),
            v8UsedGlobalHandlesSize: Number(runtimeStats.v8UsedGlobalHandlesSize || 0),
            v8NumberOfNativeContexts: Number(runtimeStats.v8NumberOfNativeContexts || 0),
            v8NumberOfDetachedContexts: Number(runtimeStats.v8NumberOfDetachedContexts || 0),
            v8CodeAndMetadataSize: Number(runtimeStats.v8CodeAndMetadataSize || 0),
            v8BytecodeAndMetadataSize: Number(runtimeStats.v8BytecodeAndMetadataSize || 0),
            v8ExternalScriptSourceSize: Number(runtimeStats.v8ExternalScriptSourceSize || 0),
            v8CpuProfilerMetadataSize: Number(runtimeStats.v8CpuProfilerMetadataSize || 0),
            v8OldSpaceUsedSize: Number(runtimeStats.v8OldSpaceUsedSize || 0),
            v8OldSpacePhysicalSize: Number(runtimeStats.v8OldSpacePhysicalSize || 0),
            v8NewSpaceUsedSize: Number(runtimeStats.v8NewSpaceUsedSize || 0),
            v8NewSpacePhysicalSize: Number(runtimeStats.v8NewSpacePhysicalSize || 0),
            v8CodeSpaceUsedSize: Number(runtimeStats.v8CodeSpaceUsedSize || 0),
            v8CodeSpacePhysicalSize: Number(runtimeStats.v8CodeSpacePhysicalSize || 0),
            v8MapSpaceUsedSize: Number(runtimeStats.v8MapSpaceUsedSize || 0),
            v8MapSpacePhysicalSize: Number(runtimeStats.v8MapSpacePhysicalSize || 0),
            v8LargeObjectSpaceUsedSize: Number(runtimeStats.v8LargeObjectSpaceUsedSize || 0),
            v8LargeObjectSpacePhysicalSize: Number(runtimeStats.v8LargeObjectSpacePhysicalSize || 0),
            v8TrackedHeapObjectTypeCount: Number(runtimeStats.v8TrackedHeapObjectTypeCount || 0),
            v8HeapObjectStatsAvailable: Number(runtimeStats.v8HeapObjectStatsAvailable || 0),
            v8TopHeapObjectTypes: Array.isArray(runtimeStats.v8TopHeapObjectTypes)
              ? runtimeStats.v8TopHeapObjectTypes.map((entry) => ({
                  type: String(entry && entry.type || ''),
                  subType: String(entry && entry.subType || ''),
                  count: Number(entry && entry.count || 0),
                  size: Number(entry && entry.size || 0)
                }))
              : []
          }
        : null
    };
  }
  return out;
}

function buildSample({
  completedTasks,
  formalStartedAt,
  sampleEvery,
  windowRecords,
  stats,
  warnings
}) {
  const successfulDurations = windowRecords
    .filter((record) => record.ok)
    .map((record) => record.durationMs)
    .filter((value) => Number.isFinite(value));
  const first = windowRecords[0] || null;
  const last = windowRecords[windowRecords.length - 1] || null;
  const windowElapsedMs = first && last
    ? Math.max(1, last.completedAt - first.completedAt)
    : 1;
  const host = stats && stats.memory && stats.memory.host ? stats.memory.host : null;
  const activeWorkers = Math.max(
    0,
    Number(stats && stats.workers || 0) - Number(stats && stats.idleWorkers || 0)
  );

  return {
    sampleIndex: Math.ceil(completedTasks / sampleEvery),
    timestamp: new Date().toISOString(),
    elapsedMs: Math.max(0, Date.now() - formalStartedAt),
    tasksDone: completedTasks,
    windowSize: windowRecords.length,
    windowSuccesses: successfulDurations.length,
    reqPerSec: round((windowRecords.length / (windowElapsedMs / 1000))),
    latencyMs: {
      p50: round(percentile(successfulDurations, 50)),
      p95: round(percentile(successfulDurations, 95)),
      p99: round(percentile(successfulDurations, 99))
    },
    memory: {
      rssMb: bytesToMb(host && host.rss),
      heapUsedMb: bytesToMb(host && host.heapUsed),
      heapTotalMb: bytesToMb(host && host.heapTotal),
      externalMb: bytesToMb(host && host.external),
      arrayBuffersMb: bytesToMb(host && host.arrayBuffers)
    },
    activeWorkers,
    workerRecycles: Number(stats && stats.recycled || 0),
    workerRespawns: Number(stats && stats.respawned || 0),
    workers: buildWorkerSnapshotMap(stats && stats.workersDetail),
    warningsCount: Array.isArray(warnings) ? warnings.length : 0
  };
}

function summarizeCurve(samples, key) {
  return samples.map((sample) => {
    const value = key(sample);
    return Number.isFinite(value) ? String(value) : '0';
  }).join(' -> ');
}

function buildGrowthSummary(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return null;
  }
  const first = samples[0];
  let peak = first;
  for (let i = 1; i < samples.length; i += 1) {
    if (Number(samples[i].memory.rssMb || 0) > Number(peak.memory.rssMb || 0)) {
      peak = samples[i];
    }
  }
  return {
    firstSample: {
      tasksDone: first.tasksDone,
      rssMb: first.memory.rssMb,
      heapUsedMb: first.memory.heapUsedMb,
      heapTotalMb: first.memory.heapTotalMb,
      externalMb: first.memory.externalMb,
      arrayBuffersMb: first.memory.arrayBuffersMb
    },
    peakSample: {
      tasksDone: peak.tasksDone,
      rssMb: peak.memory.rssMb,
      heapUsedMb: peak.memory.heapUsedMb,
      heapTotalMb: peak.memory.heapTotalMb,
      externalMb: peak.memory.externalMb,
      arrayBuffersMb: peak.memory.arrayBuffersMb
    },
    deltaToPeak: {
      rssMb: round(peak.memory.rssMb - first.memory.rssMb),
      heapUsedMb: round(peak.memory.heapUsedMb - first.memory.heapUsedMb),
      heapTotalMb: round(peak.memory.heapTotalMb - first.memory.heapTotalMb),
      externalMb: round(peak.memory.externalMb - first.memory.externalMb),
      arrayBuffersMb: round(peak.memory.arrayBuffersMb - first.memory.arrayBuffersMb)
    }
  };
}

async function runSingleConfig({
  repoRoot,
  targetScriptPath,
  siteProfilePath,
  targetScript,
  siteProfile,
  config,
  maxTasksPerWorker
}) {
  const pool = new ThreadPool({
    size: config.poolSize,
    debug: false,
    maxTasksPerWorker,
    taskTimeoutMs: config.taskTimeoutMs,
    workerInitTimeoutMs: config.workerInitTimeoutMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs,
    signatureProfile: config.signatureProfile
  });

  const basePayload = {
    resourceName: targetScriptPath,
    targetScript,
    siteProfile
  };

  const outputDir = path.join(__dirname, 'results');
  const outputPath = path.join(outputDir, `longevity-mtp${maxTasksPerWorker}-${nowForFilename()}.json`);
  const samples = [];
  const measuredDurations = [];
  const formalErrors = [];
  const slidingWindow = [];
  const warnings = [];
  let poolClosed = false;
  let formalCompletedTasks = 0;
  let peakRssMb = 0;
  let warmupResult;
  let measuredResult;
  let formalStartedAt = 0;
  let formalFinishedAt = 0;

  const warningHandler = (warning) => {
    const label = warning && warning.name ? warning.name : 'Warning';
    const message = warning && warning.message ? warning.message : String(warning);
    warnings.push({
      timestamp: new Date().toISOString(),
      completedTasks: formalCompletedTasks,
      name: label,
      message
    });
  };

  process.on('warning', warningHandler);

  console.log(`[longevity] start maxTasksPerWorker=${maxTasksPerWorker} pool=${config.poolSize} concurrency=${config.concurrency} total=${config.totalTasks}`);

  await pool.start();

  try {
    warmupResult = await executeStage({
      stageName: 'warmup',
      pool,
      totalTasks: config.warmupTasks,
      concurrency: config.concurrency,
      payload: basePayload,
      timeoutMs: config.taskTimeoutMs,
      onTaskSettled: () => {}
    });

    formalStartedAt = Date.now();
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
          if (formalErrors.length < 20) {
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

        const stats = pool.getStats();
        const sample = buildSample({
          completedTasks: formalCompletedTasks,
          formalStartedAt,
          sampleEvery: config.sampleEvery,
          windowRecords: slidingWindow,
          stats,
          warnings
        });

        peakRssMb = Math.max(peakRssMb, sample.memory.rssMb);
        samples.push(sample);

        console.log(
          `[longevity] mtp=${maxTasksPerWorker} sample ${sample.sampleIndex} tasks=${sample.tasksDone}/${config.totalTasks} ` +
          `req/s=${sample.reqPerSec} p95=${sample.latencyMs.p95}ms p99=${sample.latencyMs.p99}ms ` +
          `rss=${sample.memory.rssMb}MB heapUsed=${sample.memory.heapUsedMb}MB ext=${sample.memory.externalMb}MB ` +
          `activeWorkers=${sample.activeWorkers} recycled=${sample.workerRecycles} warnings=${sample.warningsCount}`
        );
      }
    });
    formalFinishedAt = Date.now();

    const preCloseStats = pool.getStats();
    const preCloseHostMemory = preCloseStats && preCloseStats.memory && preCloseStats.memory.host
      ? preCloseStats.memory.host
      : null;
    peakRssMb = Math.max(peakRssMb, bytesToMb(preCloseHostMemory && preCloseHostMemory.rss));

    await pool.close();
    poolClosed = true;

    const finalStats = pool.getStats();
    const finalHostMemory = finalStats && finalStats.memory && finalStats.memory.host
      ? finalStats.memory.host
      : null;
    peakRssMb = Math.max(peakRssMb, bytesToMb(finalHostMemory && finalHostMemory.rss));

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
        backend: finalStats && finalStats.backend ? finalStats.backend : 'thread',
        poolSize: config.poolSize,
        concurrency: config.concurrency,
        maxTasksPerWorker,
        warmupTasks: config.warmupTasks,
        totalTasks: config.totalTasks,
        sampleEvery: config.sampleEvery,
        debug: false,
        taskTimeoutMs: config.taskTimeoutMs,
        workerInitTimeoutMs: config.workerInitTimeoutMs,
        heartbeatIntervalMs: config.heartbeatIntervalMs,
        heartbeatTimeoutMs: config.heartbeatTimeoutMs,
        signatureProfile: config.signatureProfile,
        targetScriptPath: path.relative(repoRoot, targetScriptPath),
        siteProfilePath: path.relative(repoRoot, siteProfilePath)
      },
      warmup: {
        tasks: config.warmupTasks,
        succeeded: warmupResult.succeeded,
        failed: warmupResult.failed,
        errors: warmupResult.errors
      },
      samples,
      warnings,
      errors: formalErrors,
      workerRecycles: Number(finalStats && finalStats.recycled || 0),
      workerRespawns: Number(finalStats && finalStats.respawned || 0),
      summary: {
        startedAt: new Date(formalStartedAt).toISOString(),
        finishedAt: new Date(formalFinishedAt).toISOString(),
        durationMs: overallDurationMs,
        success: measuredResult.succeeded,
        failed: measuredResult.failed,
        totalReqPerSec: round(measuredResult.succeeded / (overallDurationMs / 1000)),
        latencyMs: {
          p50: round(percentile(measuredDurations, 50)),
          p95: round(percentile(measuredDurations, 95)),
          p99: round(percentile(measuredDurations, 99))
        },
        peakRssMb: round(peakRssMb),
        finalMemory: finalHostMemory
          ? {
              rssMb: bytesToMb(finalHostMemory.rss),
              heapUsedMb: bytesToMb(finalHostMemory.heapUsed),
              heapTotalMb: bytesToMb(finalHostMemory.heapTotal),
              externalMb: bytesToMb(finalHostMemory.external),
              arrayBuffersMb: bytesToMb(finalHostMemory.arrayBuffers)
            }
          : null,
        workerTasksHandledBeforeClose: buildWorkerSnapshotMap(preCloseStats && preCloseStats.workersDetail),
        workerTasksHandledFinal: buildWorkerSnapshotMap(finalStats && finalStats.workersDetail),
        growth: buildGrowthSummary(samples)
      }
    };

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

    console.log(`[longevity] output ${outputPath}`);
    console.log(`maxTasksPerWorker=${maxTasksPerWorker}, ${config.totalTasks} tasks:`);
    console.log(`  req/s: ${summarizeCurve(samples, (sample) => sample.reqPerSec)} (avg=${result.summary.totalReqPerSec})`);
    console.log(`  RSS: ${summarizeCurve(samples, (sample) => sample.memory.rssMb)} (peak=${result.summary.peakRssMb})`);
    console.log(`  recycles: ${result.workerRecycles}`);
    console.log(`  warnings: ${warnings.length}`);

    return result;
  } finally {
    process.removeListener('warning', warningHandler);
    if (!poolClosed) {
      await pool.close();
    }
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
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
  const targets = config.maxTasksPerWorker
    ? [config.maxTasksPerWorker]
    : config.maxTasksPerWorkerMatrix;

  const results = [];
  for (let i = 0; i < targets.length; i += 1) {
    const maxTasksPerWorker = targets[i];
    const result = await runSingleConfig({
      repoRoot,
      targetScriptPath,
      siteProfilePath,
      targetScript,
      siteProfile,
      config,
      maxTasksPerWorker
    });
    results.push({
      maxTasksPerWorker,
      totalReqPerSec: result.summary.totalReqPerSec,
      peakRssMb: result.summary.peakRssMb,
      warnings: result.warnings.length,
      workerRecycles: result.workerRecycles,
      p95: result.summary.latencyMs.p95,
      p99: result.summary.latencyMs.p99
    });
  }

  if (results.length > 1) {
    console.log('');
    console.log('[longevity] matrix summary');
    for (let i = 0; i < results.length; i += 1) {
      const item = results[i];
      console.log(
        `  mtp=${item.maxTasksPerWorker} req/s=${item.totalReqPerSec} p95=${item.p95} p99=${item.p99} ` +
        `peakRss=${item.peakRssMb}MB recycles=${item.workerRecycles} warnings=${item.warnings}`
      );
    }
  }
}

main().catch((error) => {
  console.error('[longevity] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
