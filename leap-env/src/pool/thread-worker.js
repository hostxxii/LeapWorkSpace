const { parentPort, threadId } = require('worker_threads');
const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment
} = require('../../runner');
const {
  toPositiveInteger,
  getMemorySnapshot,
  serializeError,
  buildReleaseAllScopesScript,
  buildRuntimeStatsScript,
  buildTaskApiTraceSnapshotScript,
  buildPostTaskCleanupScript,
  parseRuntimeStats,
  getNativeRuntimeStats,
  mergeRuntimeStats,
  shouldRecycleAfterCleanup
} = require('./worker-common');

// DoD (Data-Oriented Design) imports - required (dod is the only supported backend)
let DoDLayoutEngine = null;
let DomToDoDConverter = null;
let DoDTree = null;

if (!parentPort) {
  throw new Error('thread-worker.js must run inside worker_threads');
}

let workerId = `thread-${threadId}`;
let leapvm = null;
let initialized = false;
let shuttingDown = false;
let tasksHandled = 0;
let heartbeatTimer = null;
let cleanupFailureCount = 0;
let currentDomBackend = 'dod';
const forceGcOnShutdownStats = /^(1|true|yes)$/i.test(String(process.env.LEAPVM_TRACK_GC_OBJECT_STATS || ''));
const taskPhaseTraceEnabled = /^(1|true|yes)$/i.test(String(process.env.LEAPVM_TASK_PHASE_TRACE || ''));
const taskApiTraceEnabled = /^(1|true|yes)$/i.test(String(process.env.LEAPVM_TASK_API_TRACE || ''));

function send(message) {
  try {
    parentPort.postMessage(message);
  } catch (_) {
    // ignore channel errors during shutdown
  }
}

function runPostTaskCleanup(taskId) {
  var summary = {
    leakedDocsReleased: 0,
    releasedDocs: 0,
    releasedNodes: 0,
    activeDocs: 0,
    activeNodes: 0,
    activeTasks: 0,
    windowListenerCount: 0,
    rafCount: 0,
    runtimeStats: null,
    cleanupFailureCount: cleanupFailureCount,
    shouldRecycle: false,
    cleanupError: null
  };

  if (!leapvm || typeof leapvm.runScript !== 'function') {
    return summary;
  }

  var safeTaskId = JSON.stringify(String(taskId || 'task-default'));
  var script = buildPostTaskCleanupScript(safeTaskId);

  try {
    var raw = leapvm.runScript(script);
    var parsed = null;
    try {
      parsed = JSON.parse(String(raw || ''));
    } catch (_) {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object') {
      var releasedDocs = Number.parseInt(parsed.releasedDocs, 10);
      var releasedNodes = Number.parseInt(parsed.releasedNodes, 10);
      var runtimeStats = mergeRuntimeStats(parsed, getNativeRuntimeStats(leapvm));
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
      var released = Number.parseInt(raw, 10);
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
      threadId,
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
  process.exit(code);
}

function safeShutdownEnvironment(reason) {
  var cleanupError = null;
  var shutdownError = null;
  var runtimeStats = null;

  if (leapvm && typeof leapvm.runScript === 'function') {
    try {
      leapvm.runScript(buildReleaseAllScopesScript());
    } catch (error) {
      cleanupError = serializeError(error);
    }
  }

  runtimeStats = getRuntimeStatsSnapshot(forceGcOnShutdownStats ? { forceGc: true } : null);

  try {
    shutdownEnvironment(leapvm, { skipTaskScopeRelease: true });
  } catch (error) {
    shutdownError = serializeError(error);
  } finally {
    leapvm = null;
  }

  return {
    reason: reason || null,
    runtimeStats: runtimeStats,
    cleanupError: cleanupError,
    shutdownError: shutdownError
  };
}

function handleInit(message) {
  if (initialized) {
    send({
      type: 'init',
      workerId,
      threadId,
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

    const dodModule = require('../impl/dod-layout-engine');
    DoDLayoutEngine = dodModule.DoDLayoutEngine;
    DomToDoDConverter = dodModule.DomToDoDConverter;
    DoDTree = dodModule.DoDTree;
    if (!DoDLayoutEngine || !DomToDoDConverter || !DoDTree) {
      throw new Error('[Worker] Failed to initialize DoD engine exports.');
    }

    // Register in globalThis for access from DOM scripts
    if (typeof globalThis !== 'undefined') {
      globalThis.DoDLayoutEngine = DoDLayoutEngine;
      globalThis.DomToDoDConverter = DomToDoDConverter;
      globalThis.DoDTree = DoDTree;
    }

    initialized = true;

    startHeartbeat(heartbeatIntervalMs);
    send({
      type: 'init',
      workerId,
      threadId,
      pid: process.pid,
      warmupMs: Date.now() - begin,
      tasksHandled,
      cleanupFailureCount,
      runtimeStats: getRuntimeStatsSnapshot(),
      inspectorInfo: envContext.inspectorInfo || null,
      memoryUsage: getMemorySnapshot()
    });
  } catch (error) {
    send({
      type: 'error',
      workerId,
      threadId,
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
      error: { message: 'Worker is shutting down' }
    });
    return;
  }

  if (!initialized || !leapvm) {
    send({
      type: 'error',
      workerId,
      taskId,
      fatal: true,
      error: { message: 'Worker is not initialized' }
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
      shouldRecycle: cleanup.shouldRecycle,
      cleanupError: cleanup.cleanupError,
      memoryUsage: getMemorySnapshot()
    });
  } catch (error) {
    const executeFailedAt = taskPhaseTraceEnabled ? Date.now() : 0;
    const taskApiTrace = getTaskApiTraceSnapshot();
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
    var raw = leapvm.runScript(buildRuntimeStatsScript());
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
    var raw = leapvm.runScript(buildTaskApiTraceSnapshotScript());
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
  stopHeartbeat();
  var shutdownSummary = safeShutdownEnvironment('shutdown');
  send({
    type: 'shutdown_ack',
    workerId,
    threadId,
    pid: process.pid,
    uptimeMs: Math.floor(process.uptime() * 1000),
    tasksHandled,
    cleanupFailureCount,
    runtimeStats: shutdownSummary.runtimeStats,
    cleanupError: shutdownSummary.cleanupError,
    shutdownError: shutdownSummary.shutdownError,
    memoryUsage: getMemorySnapshot()
  });
  finalizeExit(shutdownSummary.shutdownError ? 1 : 0);
}

parentPort.on('message', (message) => {
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
    threadId,
    fatal: true,
    error: serializeError(error)
  });
  try {
    safeShutdownEnvironment('uncaughtException');
  } catch (_) {
    // ignore cleanup failures on fatal exit
  }
  finalizeExit(1);
});

process.on('unhandledRejection', (reason) => {
  send({
    type: 'error',
    workerId,
    threadId,
    fatal: true,
    error: serializeError(reason instanceof Error ? reason : new Error(String(reason)))
  });
  try {
    safeShutdownEnvironment('unhandledRejection');
  } catch (_) {
    // ignore cleanup failures on fatal exit
  }
  finalizeExit(1);
});
