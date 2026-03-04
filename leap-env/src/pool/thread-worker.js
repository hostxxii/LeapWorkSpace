const { parentPort, threadId } = require('worker_threads');
const {
  initializeEnvironment,
  executeSignatureTask
} = require('../../runner');
const {
  toPositiveInteger,
  getMemorySnapshot,
  serializeError,
  buildPostTaskCleanupScript,
  CLEANUP_FAILURE_LIMIT
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
      var activeDocs = Number.parseInt(parsed.activeDocs, 10);
      var activeNodes = Number.parseInt(parsed.activeNodes, 10);
      var activeTasks = Number.parseInt(parsed.activeTasks, 10);
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
      threadId,
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
  // NOTE: Any leapvm call (runScript, shutdown) in a worker_threads context
  // causes a SIGSEGV on Windows after multiple DOM tasks have been processed
  // (the V8 isolate accumulates state that makes teardown unsafe). Skip all
  // VM calls; the OS reclaims native resources when the process exits.
  process.exit(code);
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
  var script = `
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
    var raw = leapvm.runScript(script);
    var parsed = JSON.parse(String(raw || '{}'));
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
  stopHeartbeat();

  // Windows + worker_threads 下，部分 DOM 任务后在关闭阶段再次调用
  // leapvm.runScript() 可能触发 native 崩溃。关闭路径只上报基础心跳，
  // 不再采集 runtime stats（避免触发 runScript）。
  var runtimeStats = null;
  send({
    type: 'heartbeat',
    workerId,
    threadId,
    pid: process.pid,
    uptimeMs: Math.floor(process.uptime() * 1000),
    tasksHandled,
    cleanupFailureCount,
    runtimeStats: runtimeStats,
    memoryUsage: getMemorySnapshot()
  });

  finalizeExit(0);
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
  finalizeExit(1);
});
