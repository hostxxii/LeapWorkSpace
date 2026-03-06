const fs = require('fs');
const os = require('os');
const path = require('path');
const { PerformanceObserver, constants, monitorEventLoopDelay } = require('perf_hooks');
const { ThreadPool } = require('../leap-env/src/pool/thread-pool');
const { ProcessPool } = require('../leap-env/src/pool/process-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_TASK_PHASE_TRACE) {
  process.env.LEAPVM_TASK_PHASE_TRACE = '1';
}
if (!process.env.LEAPVM_TASK_API_TRACE) {
  process.env.LEAPVM_TASK_API_TRACE = '1';
}

const DEFAULTS = {
  backend: 'thread',
  repeats: 6,
  poolSize: 12,
  concurrency: 48,
  maxTasksPerWorker: 500,
  warmupTasks: 20,
  totalTasks: 550,
  sampleEvery: 50,
  taskTimeoutMs: 30000,
  workerInitTimeoutMs: 30000,
  heartbeatIntervalMs: 60000,
  heartbeatTimeoutMs: 240000,
  signatureProfile: 'fp-occupy',
  slowTaskThresholdMs: 1000
};

const SILENCE_CONSOLE_BEFORE_SCRIPT = [
  'console.log = function () {};',
  'console.info = function () {};',
  'console.warn = function () {};',
  'console.error = function () {};'
].join('');

function buildTaskApiTraceBeforeScript() {
  return `
    (function () {
      var g = globalThis;
      var trace = g.__leapTaskApiTrace;
      if (!trace || typeof trace !== 'object') {
        var originalDateNow = Date.now.bind(Date);
        var originalPerfNow = (g.performance && typeof g.performance.now === 'function')
          ? g.performance.now.bind(g.performance)
          : null;
        var state = {
          currentTaskId: '',
          taskStats: {},
          now: function now() {
            if (originalPerfNow) {
              try { return Number(originalPerfNow()) || 0; } catch (_) {}
            }
            try { return Number(originalDateNow()) || 0; } catch (_) {}
            return 0;
          },
          beginTask: function beginTask(taskId) {
            this.currentTaskId = String(taskId || '');
            this.taskStats = {};
          },
          record: function record(name, durationMs) {
            var key = String(name || 'unknown');
            var stats = this.taskStats[key];
            if (!stats) {
              stats = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
              this.taskStats[key] = stats;
            }
            var safeDuration = Number.isFinite(durationMs) ? Number(durationMs) : 0;
            stats.count += 1;
            stats.totalMs += safeDuration;
            stats.lastMs = safeDuration;
            if (safeDuration > stats.maxMs) {
              stats.maxMs = safeDuration;
            }
          }
        };

        function wrapMethod(holder, key, label) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var original = holder[key];
          if (original.__leapTaskApiTraceWrapped) {
            return;
          }
          function wrapped() {
            var startedAt = state.now();
            try {
              return original.apply(this, arguments);
            } finally {
              state.record(label, state.now() - startedAt);
            }
          }
          wrapped.__leapTaskApiTraceWrapped = true;
          wrapped.__leapTaskApiTraceOriginal = original;
          try {
            Object.defineProperty(wrapped, 'name', {
              value: original.name || key,
              configurable: true
            });
          } catch (_) {}
          holder[key] = wrapped;
        }

        function wrapScheduledCallback(holder, key, scheduleLabel, lagLabel, runtimeLabel) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var original = holder[key];
          if (original.__leapTaskApiTraceWrapped) {
            return;
          }
          function wrapped(callback, delay) {
            var startedAt = state.now();
            var requestedDelay = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
            var args = Array.prototype.slice.call(arguments);
            if (typeof callback === 'function') {
              var scheduledAt = state.now();
              args[0] = function wrappedCallback() {
                var callbackStartedAt = state.now();
                var lagMs = callbackStartedAt - scheduledAt - requestedDelay;
                state.record(lagLabel, lagMs > 0 ? lagMs : 0);
                try {
                  return callback.apply(this, arguments);
                } finally {
                  state.record(runtimeLabel, state.now() - callbackStartedAt);
                }
              };
            }
            try {
              return original.apply(this, args);
            } finally {
              state.record(scheduleLabel, state.now() - startedAt);
            }
          }
          wrapped.__leapTaskApiTraceWrapped = true;
          wrapped.__leapTaskApiTraceOriginal = original;
          try {
            Object.defineProperty(wrapped, 'name', {
              value: original.name || key,
              configurable: true
            });
          } catch (_) {}
          holder[key] = wrapped;
        }

        function wrapMicrotaskCallback(holder, key, scheduleLabel, lagLabel, runtimeLabel) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var original = holder[key];
          if (original.__leapTaskApiTraceWrapped) {
            return;
          }
          function wrapped(callback) {
            var startedAt = state.now();
            var args = Array.prototype.slice.call(arguments);
            if (typeof callback === 'function') {
              var scheduledAt = state.now();
              args[0] = function wrappedCallback() {
                var callbackStartedAt = state.now();
                var lagMs = callbackStartedAt - scheduledAt;
                state.record(lagLabel, lagMs > 0 ? lagMs : 0);
                try {
                  return callback.apply(this, arguments);
                } finally {
                  state.record(runtimeLabel, state.now() - callbackStartedAt);
                }
              };
            }
            try {
              return original.apply(this, args);
            } finally {
              state.record(scheduleLabel, state.now() - startedAt);
            }
          }
          wrapped.__leapTaskApiTraceWrapped = true;
          wrapped.__leapTaskApiTraceOriginal = original;
          try {
            Object.defineProperty(wrapped, 'name', {
              value: original.name || key,
              configurable: true
            });
          } catch (_) {}
          holder[key] = wrapped;
        }

        function wrapConstructor(holder, key, label) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var OriginalCtor = holder[key];
          if (OriginalCtor.__leapTaskApiTraceWrapped) {
            return;
          }
          function WrappedCtor() {
            var startedAt = state.now();
            try {
              return Reflect.construct(OriginalCtor, arguments, new.target || WrappedCtor);
            } finally {
              state.record(label, state.now() - startedAt);
            }
          }
          WrappedCtor.__leapTaskApiTraceWrapped = true;
          WrappedCtor.__leapTaskApiTraceOriginal = OriginalCtor;
          WrappedCtor.prototype = OriginalCtor.prototype;
          try {
            Object.setPrototypeOf(WrappedCtor, OriginalCtor);
          } catch (_) {}
          holder[key] = WrappedCtor;
        }

        trace = state;
        g.__leapTaskApiTrace = trace;

        wrapScheduledCallback(
          g,
          'setTimeout',
          'setTimeout.schedule',
          'setTimeout.callbackLag',
          'setTimeout.callbackRuntime'
        );
        wrapMethod(g, 'clearTimeout', 'clearTimeout');
        wrapScheduledCallback(
          g,
          'setInterval',
          'setInterval.schedule',
          'setInterval.callbackLag',
          'setInterval.callbackRuntime'
        );
        wrapMethod(g, 'clearInterval', 'clearInterval');
        wrapMicrotaskCallback(
          g,
          'queueMicrotask',
          'queueMicrotask.schedule',
          'queueMicrotask.callbackLag',
          'queueMicrotask.callbackRuntime'
        );

        if (g.crypto) {
          wrapMethod(g.crypto, 'getRandomValues', 'crypto.getRandomValues');
          wrapMethod(g.crypto, 'randomUUID', 'crypto.randomUUID');
        }

        wrapConstructor(g, 'MessageChannel', 'MessageChannel');

        if (g.XMLHttpRequest && g.XMLHttpRequest.prototype) {
          wrapMethod(g.XMLHttpRequest.prototype, 'open', 'XMLHttpRequest.open');
          wrapMethod(g.XMLHttpRequest.prototype, 'send', 'XMLHttpRequest.send');
          wrapMethod(g.XMLHttpRequest.prototype, 'setRequestHeader', 'XMLHttpRequest.setRequestHeader');
        }

        if (g.HTMLCanvasElement && g.HTMLCanvasElement.prototype) {
          wrapMethod(g.HTMLCanvasElement.prototype, 'toDataURL', 'HTMLCanvasElement.toDataURL');
          wrapMethod(g.HTMLCanvasElement.prototype, 'toBlob', 'HTMLCanvasElement.toBlob');
        }
      }

      var taskId = '';
      try {
        taskId = g.leapenv && typeof g.leapenv.getCurrentTaskId === 'function'
          ? String(g.leapenv.getCurrentTaskId() || '')
          : '';
      } catch (_) {}
      trace.beginTask(taskId);
    })();
  `;
}

const INVESTIGATION_BEFORE_SCRIPT = [
  SILENCE_CONSOLE_BEFORE_SCRIPT,
  buildTaskApiTraceBeforeScript()
].join('\n');

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
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
}

function nowForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function printHelp() {
  console.log(`Usage: node benchmarks/investigate-sync-stall.js [options]

Options:
  --backend <thread|process>       Pool backend (default: ${DEFAULTS.backend})
  --repeats <n>                    Number of repeated runs (default: ${DEFAULTS.repeats})
  --pool <n>                       Pool size (default: ${DEFAULTS.poolSize})
  --concurrency <n>                Concurrency (default: ${DEFAULTS.concurrency})
  --max-tasks-per-worker <n>       Max tasks per worker (default: ${DEFAULTS.maxTasksPerWorker})
  --warmup <n>                     Warmup tasks (default: ${DEFAULTS.warmupTasks})
  --total <n>                      Measured tasks (default: ${DEFAULTS.totalTasks})
  --sample-every <n>               Sample window size (default: ${DEFAULTS.sampleEvery})
  --heartbeat-interval <n>         Heartbeat interval in ms (default: ${DEFAULTS.heartbeatIntervalMs})
  --heartbeat-timeout <n>          Heartbeat timeout in ms (default: ${DEFAULTS.heartbeatTimeoutMs})
  --slow-threshold <n>             Slow task threshold in ms (default: ${DEFAULTS.slowTaskThresholdMs})
  --help                           Show this help
`);
}

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--backend':
        i += 1;
        config.backend = String(argv[i] || config.backend);
        break;
      case '--repeats':
        i += 1;
        config.repeats = toPositiveInt(argv[i], config.repeats);
        break;
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
      case '--warmup':
        i += 1;
        config.warmupTasks = toPositiveInt(argv[i], config.warmupTasks);
        break;
      case '--total':
        i += 1;
        config.totalTasks = toPositiveInt(argv[i], config.totalTasks);
        break;
      case '--sample-every':
        i += 1;
        config.sampleEvery = toPositiveInt(argv[i], config.sampleEvery);
        break;
      case '--heartbeat-interval':
        i += 1;
        config.heartbeatIntervalMs = toPositiveInt(argv[i], config.heartbeatIntervalMs);
        break;
      case '--heartbeat-timeout':
        i += 1;
        config.heartbeatTimeoutMs = toPositiveInt(argv[i], config.heartbeatTimeoutMs);
        break;
      case '--slow-threshold':
        i += 1;
        config.slowTaskThresholdMs = toPositiveInt(argv[i], config.slowTaskThresholdMs);
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
  if (config.backend !== 'thread' && config.backend !== 'process') {
    throw new Error(`Unsupported backend: ${config.backend}`);
  }
  return config;
}

function createPool(config) {
  const common = {
    size: config.poolSize,
    debug: false,
    maxTasksPerWorker: config.maxTasksPerWorker,
    taskTimeoutMs: config.taskTimeoutMs,
    workerInitTimeoutMs: config.workerInitTimeoutMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs,
    signatureProfile: config.signatureProfile
  };
  if (config.backend === 'process') {
    return new ProcessPool(common);
  }
  return new ThreadPool(common);
}

async function executeStage({ stageName, pool, totalTasks, concurrency, payload, timeoutMs, onTaskSettled }) {
  let issued = 0;
  let inFlight = 0;
  let completed = 0;

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
            onTaskSettled(null, {
              taskId: stageTaskId,
              startedAt,
              completedAt: Date.now(),
              durationMs: Number.isFinite(result && result.durationMs)
                ? Number(result.durationMs)
                : Date.now() - startedAt,
              result
            });
          })
          .catch((error) => {
            onTaskSettled(error, {
              taskId: stageTaskId,
              startedAt,
              completedAt: Date.now(),
              durationMs: Date.now() - startedAt,
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
}

function buildGcTracker() {
  const entries = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const detail = entry && entry.detail && typeof entry.detail === 'object'
        ? entry.detail
        : null;
      const gcKind = detail && Number.isFinite(detail.kind)
        ? Number(detail.kind)
        : entry.kind;
      entries.push({
        kind: gcKind,
        kindLabel: gcKindLabel(gcKind),
        startTime: round(entry.startTime, 3),
        duration: round(entry.duration, 3)
      });
    }
  });
  observer.observe({ entryTypes: ['gc'] });
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();
  return {
    entries,
    loopDelay,
    stop() {
      observer.disconnect();
      loopDelay.disable();
      return {
        gcEntries: entries.slice(),
        eventLoopDelay: {
          minMs: round(loopDelay.min / 1e6, 3),
          maxMs: round(loopDelay.max / 1e6, 3),
          meanMs: round(loopDelay.mean / 1e6, 3),
          stddevMs: round(loopDelay.stddev / 1e6, 3),
          p95Ms: round(loopDelay.percentile(95) / 1e6, 3),
          p99Ms: round(loopDelay.percentile(99) / 1e6, 3)
        }
      };
    }
  };
}

function gcKindLabel(kind) {
  switch (kind) {
    case constants.NODE_PERFORMANCE_GC_MAJOR:
      return 'major';
    case constants.NODE_PERFORMANCE_GC_MINOR:
      return 'minor';
    case constants.NODE_PERFORMANCE_GC_INCREMENTAL:
      return 'incremental';
    case constants.NODE_PERFORMANCE_GC_WEAKCB:
      return 'weakcb';
    default:
      return `kind-${kind}`;
  }
}

function detectSynchronizedStall(slowTasks, poolSize) {
  if (!Array.isArray(slowTasks) || slowTasks.length < Math.min(4, poolSize)) {
    return null;
  }
  const offsets = slowTasks
    .map((task) => Number(task.completedOffsetMs || 0))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (offsets.length === 0) {
    return null;
  }
  const spreadMs = offsets[offsets.length - 1] - offsets[0];
  const uniqueWorkers = new Set(
    slowTasks
      .map((task) => task.workerId)
      .filter((value) => value)
  );
  const allWorkersCovered = uniqueWorkers.size >= Math.min(poolSize, slowTasks.length);
  if (!allWorkersCovered || spreadMs > 250) {
    return null;
  }
  return {
    workerCount: uniqueWorkers.size,
    spreadMs: round(spreadMs, 2),
    firstCompletedOffsetMs: offsets[0],
    lastCompletedOffsetMs: offsets[offsets.length - 1]
  };
}

async function runSingleAttempt(config, sharedPayload, runIndex) {
  const pool = createPool(config);
  const durations = [];
  const window = [];
  const slowTasks = [];
  let maxSampleP99 = 0;
  let minSampleReqPerSec = Infinity;
  let measuredCompleted = 0;

  const gcTracker = buildGcTracker();

  await pool.start();
  await executeStage({
    stageName: 'warmup',
    pool,
    totalTasks: config.warmupTasks,
    concurrency: config.concurrency,
    payload: sharedPayload,
    timeoutMs: config.taskTimeoutMs,
    onTaskSettled: () => {}
  });

  const measuredStartedAt = Date.now();
  await executeStage({
    stageName: 'measure',
    pool,
    totalTasks: config.totalTasks,
    concurrency: config.concurrency,
    payload: sharedPayload,
    timeoutMs: config.taskTimeoutMs,
    onTaskSettled: (error, record) => {
      measuredCompleted += 1;
      const result = record.result || null;
      const durationMs = Number.isFinite(record.durationMs) ? Number(record.durationMs) : 0;
      if (!error) {
        durations.push(durationMs);
      }
      if (durationMs >= config.slowTaskThresholdMs) {
        const errorDetails = error && error.details && typeof error.details === 'object'
          ? error.details
          : null;
        slowTasks.push({
          taskId: record.taskId,
          workerId: result && result.workerId
            ? result.workerId
            : (error && error.workerId ? error.workerId : null),
          ok: !error,
          errorMessage: error ? String(error.message || error) : null,
          errorDetails,
          durationMs,
          startedOffsetMs: record.startedAt - measuredStartedAt,
          completedOffsetMs: record.completedAt - measuredStartedAt,
          phaseTimings: result && result.phaseTimings
            ? result.phaseTimings
            : (error && error.phaseTimings ? error.phaseTimings : null),
          taskApiTrace: result && result.taskApiTrace
            ? result.taskApiTrace
            : (error && error.taskApiTrace ? error.taskApiTrace : null),
          memoryUsage: result && result.memoryUsage
            ? result.memoryUsage
            : (error && error.memoryUsage ? error.memoryUsage : null),
          runtimeStats: result && result.runtimeStats
            ? result.runtimeStats
            : (error && error.runtimeStats ? error.runtimeStats : null)
        });
      }

      window.push({
        ok: !error,
        durationMs,
        completedAt: record.completedAt
      });
      if (window.length > config.sampleEvery) {
        window.shift();
      }

      if (measuredCompleted % config.sampleEvery === 0 || measuredCompleted === config.totalTasks) {
        const okDurations = window
          .filter((entry) => entry.ok)
          .map((entry) => entry.durationMs);
        const first = window[0];
        const last = window[window.length - 1];
        const windowMs = first && last ? Math.max(1, last.completedAt - first.completedAt) : 1;
        const reqPerSec = window.length / (windowMs / 1000);
        const p99 = percentile(okDurations, 99);
        if (p99 > maxSampleP99) {
          maxSampleP99 = p99;
        }
        if (reqPerSec < minSampleReqPerSec) {
          minSampleReqPerSec = reqPerSec;
        }
      }
    }
  });

  const overallMs = Date.now() - measuredStartedAt;
  await pool.close();

  const gcSummary = gcTracker.stop();
  const synchronizedStall = detectSynchronizedStall(slowTasks, config.poolSize);

  return {
    runIndex,
    backend: config.backend,
    overallMs,
    reqPerSec: round(config.totalTasks / (overallMs / 1000)),
    p95: round(percentile(durations, 95)),
    p99: round(percentile(durations, 99)),
    maxTaskMs: round(durations.length > 0 ? Math.max(...durations) : 0),
    maxSampleP99Ms: round(maxSampleP99),
    minSampleReqPerSec: round(Number.isFinite(minSampleReqPerSec) ? minSampleReqPerSec : 0),
    slowTaskThresholdMs: config.slowTaskThresholdMs,
    slowTasks,
    synchronizedStall,
    gc: gcSummary.gcEntries,
    eventLoopDelay: gcSummary.eventLoopDelay
  };
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
  const payload = {
    resourceName: targetScriptPath,
    targetScript,
    siteProfile,
    beforeRunScript: INVESTIGATION_BEFORE_SCRIPT
  };

  const runs = [];
  for (let i = 1; i <= config.repeats; i += 1) {
    const run = await runSingleAttempt(config, payload, i);
    runs.push(run);
    console.log(JSON.stringify({
      runIndex: run.runIndex,
      backend: run.backend,
      reqPerSec: run.reqPerSec,
      p99: run.p99,
      maxTaskMs: run.maxTaskMs,
      maxSampleP99Ms: run.maxSampleP99Ms,
      minSampleReqPerSec: run.minSampleReqPerSec,
      slowTasks: run.slowTasks.length,
      synchronizedStall: run.synchronizedStall
    }));
  }

  const output = {
    timestamp: new Date().toISOString(),
    machine: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
      logicalCores: os.cpus().length
    },
    config: {
      ...config,
      targetScriptPath: path.relative(repoRoot, targetScriptPath),
      siteProfilePath: path.relative(repoRoot, siteProfilePath)
    },
    runs
  };

  const outputDir = path.join(__dirname, 'results');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(
    outputDir,
    `sync-stall-${config.backend}-${nowForFilename()}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[sync-stall] wrote ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
