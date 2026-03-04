const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment
} = require('../../runner');
const {
  toPositiveInteger,
  getMemorySnapshot,
  serializeError,
  buildPostTaskCleanupScript,
  CLEANUP_FAILURE_LIMIT
} = require('./worker-common');

let workerId = process.env.LEAP_WORKER_ID || `worker-${process.pid}`;
let leapvm = null;
let initialized = false;
let shuttingDown = false;
let tasksHandled = 0;
let heartbeatTimer = null;
let cleanupFailureCount = 0;
let currentDomBackend = 'dod';

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
      const activeDocs = Number.parseInt(parsed.activeDocs, 10);
      const activeNodes = Number.parseInt(parsed.activeNodes, 10);
      const activeTasks = Number.parseInt(parsed.activeTasks, 10);
      if (Number.isFinite(releasedDocs) && releasedDocs > 0) {
        summary.leakedDocsReleased = releasedDocs;
        summary.releasedDocs = releasedDocs;
        cleanupFailureCount += releasedDocs;
      }
      if (Number.isFinite(releasedNodes) && releasedNodes > 0) {
        summary.releasedNodes = releasedNodes;
      }
      if (Number.isFinite(activeDocs) && activeDocs >= 0) {
        summary.activeDocs = activeDocs;
      }
      if (Number.isFinite(activeNodes) && activeNodes >= 0) {
        summary.activeNodes = activeNodes;
      }
      if (Number.isFinite(activeTasks) && activeTasks >= 0) {
        summary.activeTasks = activeTasks;
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
  summary.shouldRecycle = cleanupFailureCount >= CLEANUP_FAILURE_LIMIT;
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

  try {
    const result = executeSignatureTask(leapvm, {
      ...payload,
      taskId
    });
    tasksHandled += 1;
    const cleanup = runPostTaskCleanup(taskId);
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
      shouldRecycle: cleanup.shouldRecycle,
      cleanupError: cleanup.cleanupError,
      memoryUsage: getMemorySnapshot()
    });
  } catch (error) {
    const cleanup = runPostTaskCleanup(taskId);
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
      shouldRecycle: cleanup.shouldRecycle,
      cleanupError: cleanup.cleanupError,
      memoryUsage: getMemorySnapshot()
    });
  }
}

function getRuntimeStatsSnapshot() {
  if (!leapvm || typeof leapvm.runScript !== 'function') {
    return null;
  }
  const script = `
    (function () {
      var domService = (globalThis.leapenv && globalThis.leapenv.domShared)
        ? globalThis.leapenv.domShared
        : null;
      if (domService && typeof domService.getRuntimeStats === 'function') {
        return JSON.stringify(domService.getRuntimeStats());
      }
      return '';
    })();
    //# sourceURL=leapenv.worker.runtime-stats.js
  `;
  try {
    const raw = leapvm.runScript(script);
    const parsed = JSON.parse(String(raw || '{}'));
    if (parsed && typeof parsed === 'object') {
      return {
        activeDocs: Number(parsed.activeDocs || 0),
        activeNodes: Number(parsed.activeNodes || 0),
        activeTasks: Number(parsed.activeTasks || 0)
      };
    }
  } catch (_) {
    // ignore runtime snapshot failures on shutdown
  }
  return null;
}

function handleShutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const runtimeStats = getRuntimeStatsSnapshot();
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
