const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment
} = require('../../runner');
const {
  toPositiveInteger,
  getMemorySnapshot,
  serializeError,
  buildRuntimeStatsScript,
  buildTaskApiTraceSnapshotScript,
  buildPostTaskCleanupScript,
  parseRuntimeStats,
  getNativeRuntimeStats,
  mergeRuntimeStats,
  shouldRecycleAfterCleanup
} = require('./worker-common');

let workerId = process.env.LEAP_WORKER_ID || `worker-${process.pid}`;
let leapvm = null;
let initialized = false;
let shuttingDown = false;
let tasksHandled = 0;
let heartbeatTimer = null;
let cleanupFailureCount = 0;
const taskPhaseTraceEnabled = /^(1|true|yes)$/i.test(String(process.env.LEAPVM_TASK_PHASE_TRACE || ''));
const taskApiTraceEnabled = /^(1|true|yes)$/i.test(String(process.env.LEAPVM_TASK_API_TRACE || ''));
let currentDomBackend = 'dod';
const forceGcOnShutdownStats = /^(1|true|yes)$/i.test(String(process.env.LEAPVM_TRACK_GC_OBJECT_STATS || ''));

function send(message) {
  if (typeof process.send !== 'function') {
    return;
  }

  try {
    process.send(message);
  } catch (_) {
    // ignore broken IPC channel on shutdown
  }
}

function runPostTaskCleanup(taskId) {
  const summary = {
    leakedDocsReleased: 0,
    releasedDocs: 0,
    releasedNodes: 0,
    activeDocs: 0,
    activeNodes: 0,
    activeTasks: 0,
    windowListenerCount: 0,
    rafCount: 0,
    runtimeStats: null,
    cleanupFailureCount,
    shouldRecycle: false,
    cleanupError: null
  };

  if (!leapvm || typeof leapvm.runScript !== 'function') {
    return summary;
  }

  const safeTaskId = JSON.stringify(String(taskId || 'task-default'));
  const script = buildPostTaskCleanupScript(safeTaskId);

  try {
    const raw = leapvm.runScript(script);
    let parsed = null;
    try {
      parsed = JSON.parse(String(raw || ''));
    } catch (_) {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object') {
      const releasedDocs = Number.parseInt(parsed.releasedDocs, 10);
      const releasedNodes = Number.parseInt(parsed.releasedNodes, 10);
      const runtimeStats = mergeRuntimeStats(parsed, getNativeRuntimeStats(leapvm));
      if (Number.isFinite(releasedDocs) && releasedDocs > 0) {
        summary.leakedDocsReleased = releasedDocs;
        summary.releasedDocs = releasedDocs;
        cleanupFailureCount += releasedDocs;
      }
      if (Number.isFinite(releasedNodes) && releasedNodes > 0) {
        summary.releasedNodes = releasedNodes;
      }
      if (runtimeStats) {
        summary.activeDocs = runtimeStats.activeDocs;
        summary.activeNodes = runtimeStats.activeNodes;
        summary.activeTasks = runtimeStats.activeTasks;
        summary.windowListenerCount = runtimeStats.windowListenerCount;
        summary.rafCount = runtimeStats.rafCount;
        summary.runtimeStats = runtimeStats;
      }
    } else {
      const released = Number.parseInt(raw, 10);
      if (Number.isFinite(released) && released > 0) {
        summary.leakedDocsReleased = released;
        summary.releasedDocs = released;
        cleanupFailureCount += released;
      }
    }
  } catch (error) {
    cleanupFailureCount += 1;
    summary.cleanupError = String(error && error.message ? error.message : error);
  }

  summary.cleanupFailureCount = cleanupFailureCount;
  summary.shouldRecycle = shouldRecycleAfterCleanup(summary);
  return summary;
}

function stopHeartbeat() {
  if (!heartbeatTimer) {
    return;
  }
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startHeartbeat(intervalMs) {
  stopHeartbeat();

  heartbeatTimer = setInterval(() => {
    send({
      type: 'heartbeat',
      workerId,
      pid: process.pid,
      uptimeMs: Math.floor(process.uptime() * 1000),
      tasksHandled,
      cleanupFailureCount,
      runtimeStats: getRuntimeStatsSnapshot(),
      memoryUsage: getMemorySnapshot()
    });
  }, intervalMs);

  heartbeatTimer.unref();
}

function finalizeExit(code) {
  stopHeartbeat();
  try {
    shutdownEnvironment(leapvm);
  } catch (_) {
    // ignore shutdown errors during exit
  }
  process.exit(code);
}

function handleInit(message) {
  if (initialized) {
    send({
      type: 'init',
      workerId,
      pid: process.pid,
      warmupMs: 0,
      tasksHandled
    });
    return;
  }

  workerId = message.workerId || workerId;
  const payload = message.payload || {};
  const runnerOptions = payload.runnerOptions || {};
  const heartbeatIntervalMs = Number.isFinite(payload.heartbeatIntervalMs) && payload.heartbeatIntervalMs > 0
    ? payload.heartbeatIntervalMs
    : 5000;

  const begin = Date.now();
  try {
    const envContext = initializeEnvironment(runnerOptions);
    leapvm = envContext.leapvm;
    currentDomBackend = (envContext.resolved && envContext.resolved.domBackend) || 'dod';
    if (currentDomBackend !== 'dod') {
      throw new Error(`[Worker] Unsupported domBackend "${currentDomBackend}", only "dod" is supported.`);
    }
    initialized = true;

    startHeartbeat(heartbeatIntervalMs);
    send({
      type: 'init',
      workerId,
      pid: process.pid,
      warmupMs: Date.now() - begin,
      tasksHandled,
      cleanupFailureCount,
      runtimeStats: getRuntimeStatsSnapshot(),
      memoryUsage: getMemorySnapshot()
    });
  } catch (error) {
    send({
      type: 'error',
      workerId,
      fatal: true,
      error: serializeError(error)
    });
    finalizeExit(1);
  }
}

function handleRunSignature(message) {
  const taskId = message.taskId;
  if (!taskId) {
    return;
  }

  if (shuttingDown) {
    send({
      type: 'error',
      workerId,
      taskId,
      error: {
        message: 'Worker is shutting down'
      }
    });
    return;
  }

  if (!initialized || !leapvm) {
    send({
      type: 'error',
      workerId,
      taskId,
      fatal: true,
      error: {
        message: 'Worker is not initialized'
      }
    });
    return;
  }

  const payload = message.payload || {};
  const begin = Date.now();
  const phaseTimings = taskPhaseTraceEnabled ? {} : null;
  const executeStartedAt = taskPhaseTraceEnabled ? Date.now() : 0;

  try {
    const result = executeSignatureTask(leapvm, {
      ...payload,
      taskId
    });
    const taskApiTrace = getTaskApiTraceSnapshot();
    const paramSignMethodTrace = getParamSignMethodTraceSnapshot();
    if (phaseTimings && leapvm && leapvm.__leapLastTaskExecutionPhaseTimings) {
      phaseTimings.taskExecutionBreakdown = leapvm.__leapLastTaskExecutionPhaseTimings;
    }
    if (phaseTimings) {
      phaseTimings.executeSignatureTaskMs = Date.now() - executeStartedAt;
    }
    tasksHandled += 1;
    const cleanupStartedAt = taskPhaseTraceEnabled ? Date.now() : 0;
    const cleanup = runPostTaskCleanup(taskId);
    if (phaseTimings) {
      phaseTimings.postTaskCleanupMs = Date.now() - cleanupStartedAt;
    }
    send({
      type: 'result',
      workerId,
      taskId,
      result,
      durationMs: Date.now() - begin,
      tasksHandled,
      cleanupFailureCount: cleanup.cleanupFailureCount,
      leakedDocsReleased: cleanup.leakedDocsReleased,
      releasedDocs: cleanup.releasedDocs,
      releasedNodes: cleanup.releasedNodes,
      activeDocs: cleanup.activeDocs,
      activeNodes: cleanup.activeNodes,
      activeTasks: cleanup.activeTasks,
      windowListenerCount: cleanup.windowListenerCount,
      rafCount: cleanup.rafCount,
      runtimeStats: cleanup.runtimeStats,
      phaseTimings: phaseTimings,
      taskApiTrace: taskApiTrace,
      paramSignMethodTrace: paramSignMethodTrace,
      shouldRecycle: cleanup.shouldRecycle,
      cleanupError: cleanup.cleanupError,
      memoryUsage: getMemorySnapshot()
    });
  } catch (error) {
    const executeFailedAt = taskPhaseTraceEnabled ? Date.now() : 0;
    const taskApiTrace = getTaskApiTraceSnapshot();
    const paramSignMethodTrace = getParamSignMethodTraceSnapshot();
    if (phaseTimings && leapvm && leapvm.__leapLastTaskExecutionPhaseTimings) {
      phaseTimings.taskExecutionBreakdown = leapvm.__leapLastTaskExecutionPhaseTimings;
    }
    const cleanupStartedAt = taskPhaseTraceEnabled ? Date.now() : 0;
    const cleanup = runPostTaskCleanup(taskId);
    if (phaseTimings) {
      phaseTimings.executeSignatureTaskMs = executeFailedAt - executeStartedAt;
      phaseTimings.postTaskCleanupMs = Date.now() - cleanupStartedAt;
    }
    send({
      type: 'error',
      workerId,
      taskId,
      error: serializeError(error),
      durationMs: Date.now() - begin,
      tasksHandled,
      cleanupFailureCount: cleanup.cleanupFailureCount,
      leakedDocsReleased: cleanup.leakedDocsReleased,
      releasedDocs: cleanup.releasedDocs,
      releasedNodes: cleanup.releasedNodes,
      activeDocs: cleanup.activeDocs,
      activeNodes: cleanup.activeNodes,
      activeTasks: cleanup.activeTasks,
      windowListenerCount: cleanup.windowListenerCount,
      rafCount: cleanup.rafCount,
      runtimeStats: cleanup.runtimeStats,
      phaseTimings: phaseTimings,
      taskApiTrace: taskApiTrace,
      paramSignMethodTrace: paramSignMethodTrace,
      shouldRecycle: cleanup.shouldRecycle,
      cleanupError: cleanup.cleanupError,
      memoryUsage: getMemorySnapshot()
    });
  }
}

function getRuntimeStatsSnapshot(options) {
  if (!leapvm || typeof leapvm.runScript !== 'function') {
    return null;
  }
  try {
    const raw = leapvm.runScript(buildRuntimeStatsScript());
    return mergeRuntimeStats(String(raw || ''), getNativeRuntimeStats(leapvm, options));
  } catch (_) {
    // ignore runtime snapshot failures on shutdown
  }
  return null;
}

function getTaskApiTraceSnapshot() {
  if (!taskApiTraceEnabled || !leapvm || typeof leapvm.runScript !== 'function') {
    return null;
  }
  try {
    const raw = leapvm.runScript(buildTaskApiTraceSnapshotScript());
    if (!raw || raw === 'null') {
      return null;
    }
    return JSON.parse(String(raw));
  } catch (_) {
    return null;
  }
}

function getParamSignMethodTraceSnapshot() {
  if (!leapvm || typeof leapvm.runScript !== 'function') {
    return null;
  }
  try {
    const raw = leapvm.runScript(
      '(function () {' +
        'var trace = globalThis.__leapParamSignMethodTrace;' +
        'if (!trace || typeof trace !== "object") return "null";' +
        'try { return JSON.stringify(trace); } catch (_) { return "null"; }' +
      '})()'
    );
    if (!raw || raw === 'null') {
      return null;
    }
    return JSON.parse(String(raw));
  } catch (_) {
    return null;
  }
}

function handleShutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const runtimeStats = getRuntimeStatsSnapshot(forceGcOnShutdownStats ? { forceGc: true } : null);
  send({
    type: 'heartbeat',
    workerId,
    pid: process.pid,
    uptimeMs: Math.floor(process.uptime() * 1000),
    tasksHandled,
    cleanupFailureCount,
    runtimeStats,
    memoryUsage: getMemorySnapshot()
  });

  finalizeExit(0);
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  switch (message.type) {
    case 'init':
      handleInit(message);
      break;
    case 'run_signature':
      handleRunSignature(message);
      break;
    case 'shutdown':
      handleShutdown();
      break;
    default:
      break;
  }
});

process.on('uncaughtException', (error) => {
  send({
    type: 'error',
    workerId,
    fatal: true,
    error: serializeError(error)
  });
  finalizeExit(1);
});

process.on('unhandledRejection', (reason) => {
  send({
    type: 'error',
    workerId,
    fatal: true,
    error: serializeError(reason instanceof Error ? reason : new Error(String(reason)))
  });
  finalizeExit(1);
});
