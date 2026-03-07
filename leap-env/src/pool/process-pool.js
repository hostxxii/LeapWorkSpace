const { fork } = require('child_process');
const os = require('os');
const path = require('path');
const { hostLog } = require('../instance/host-log');
const { resolveRunOptions } = require('../../runner');
const { parseRuntimeStats } = require('./worker-common');

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function getCpuCount() {
  if (typeof os.availableParallelism === 'function') {
    return os.availableParallelism();
  }

  const cpus = os.cpus();
  return Array.isArray(cpus) && cpus.length > 0 ? cpus.length : 1;
}

function computeDefaultWorkerCount(multiplier = 1) {
  const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return Math.max(1, Math.floor(getCpuCount() * safeMultiplier));
}

function createTaskError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function toMemorySnapshot(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return {
    rss: Number(raw.rss || 0),
    heapTotal: Number(raw.heapTotal || 0),
    heapUsed: Number(raw.heapUsed || 0),
    external: Number(raw.external || 0),
    arrayBuffers: Number(raw.arrayBuffers || 0)
  };
}

function getHostMemorySnapshot() {
  if (typeof process.memoryUsage !== 'function') {
    return null;
  }
  const usage = process.memoryUsage();
  return {
    rss: Number(usage.rss || 0),
    heapTotal: Number(usage.heapTotal || 0),
    heapUsed: Number(usage.heapUsed || 0),
    external: Number(usage.external || 0),
    arrayBuffers: Number(usage.arrayBuffers || 0)
  };
}

class ProcessPool {
  constructor(options = {}) {
    const defaultSize = computeDefaultWorkerCount(options.workerMultiplier || 1);

    this.size = toPositiveInteger(options.size, defaultSize);
    this.workerScriptPath = options.workerScriptPath || path.join(__dirname, 'worker.js');
    this.cwd = options.cwd || path.resolve(__dirname, '..', '..');
    this.taskTimeoutMs = toPositiveInteger(options.taskTimeoutMs, 5000);
    this.workerInitTimeoutMs = toPositiveInteger(options.workerInitTimeoutMs, 15000);
    this.maxTasksPerWorker = toPositiveInteger(options.maxTasksPerWorker, 200);
    this.heartbeatIntervalMs = toPositiveInteger(options.heartbeatIntervalMs, 5000);
    this.heartbeatTimeoutMs = toPositiveInteger(options.heartbeatTimeoutMs, this.heartbeatIntervalMs * 3);
    this.shutdownGraceMs = toPositiveInteger(options.shutdownGraceMs, 2000);

    const initOptions = {
      debug: !!options.debug,
      enableInspector: !!options.enableInspector,
      waitForInspector: !!options.waitForInspector,
      beforeRunScript: options.beforeRunScript || '',
      bundlePath: options.bundlePath,
      domBackend: options.domBackend,
      signatureProfile: options.signatureProfile,
      debugCppWrapperRules: options.debugCppWrapperRules
    };
    this.workerInitOptions = resolveRunOptions(initOptions);

    this.workers = new Map();
    this.idleWorkerIds = new Set();
    this.pendingQueue = [];
    this.activeTasks = new Map();

    this.started = false;
    this.closing = false;
    this.workerSeq = 0;
    this.taskSeq = 0;
    this.heartbeatMonitor = null;
    this.metrics = {
      enqueued: 0,
      started: 0,
      succeeded: 0,
      failed: 0,
      timedOut: 0,
      recycled: 0,
      respawned: 0
    };
  }

  async start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.closing = false;

    const bootPromises = [];
    for (let i = 0; i < this.size; i += 1) {
      bootPromises.push(this._spawnWorker());
    }

    await Promise.all(bootPromises);
    this._startHeartbeatMonitor();
    hostLog('info', `Process pool started with ${this.size} workers`);
  }

  runTask(payload = {}, options = {}) {
    return this.runSignature(payload, options);
  }

  runSignature(payload = {}, options = {}) {
    if (!this.started) {
      return Promise.reject(createTaskError('Process pool is not started'));
    }
    if (this.closing) {
      return Promise.reject(createTaskError('Process pool is closing'));
    }

    const timeoutMs = toPositiveInteger(options.timeoutMs, this.taskTimeoutMs);
    const taskId = `task-${++this.taskSeq}`;

    return new Promise((resolve, reject) => {
      this.pendingQueue.push({
        taskId,
        payload,
        timeoutMs,
        resolve,
        reject
      });
      this.metrics.enqueued += 1;
      this._drainQueue();
    });
  }

  async close(options = {}) {
    if (!this.started) {
      return;
    }

    this.closing = true;
    this._stopHeartbeatMonitor();
    this._rejectPendingQueue(createTaskError('Process pool is shutting down'));

    const closeTimeoutMs = toPositiveInteger(options.timeoutMs, 5000);
    const exitPromises = [];

    for (const [workerId, state] of this.workers.entries()) {
      exitPromises.push(state.exitPromise);
      this._recycleWorker(workerId, 'pool shutdown');
    }

    await Promise.race([
      Promise.allSettled(exitPromises),
      new Promise((resolve) => setTimeout(resolve, closeTimeoutMs))
    ]);

    for (const workerId of this.workers.keys()) {
      this._forceKillWorker(workerId, 'pool close timeout');
    }

    await Promise.allSettled(Array.from(this.workers.values()).map((state) => state.exitPromise));
    this.started = false;
    this.closing = false;
    hostLog('info', 'Process pool closed');
  }

  _spawnWorker() {
    const workerId = `worker-${++this.workerSeq}`;
    const child = fork(this.workerScriptPath, [], {
      cwd: this.cwd,
      env: {
        ...process.env,
        LEAP_WORKER_ID: workerId
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    });

    let resolveInit;
    let rejectInit;
    const initPromise = new Promise((resolve, reject) => {
      resolveInit = resolve;
      rejectInit = reject;
    });

    let resolveExit;
    const exitPromise = new Promise((resolve) => {
      resolveExit = resolve;
    });

    const state = {
      id: workerId,
      child,
      status: 'starting',
      lastHeartbeatAt: Date.now(),
      tasksHandled: 0,
      pid: null,
      threadId: null,
      memoryUsage: null,
      cleanupFailureCount: 0,
      runtimeStats: null,
      currentTaskId: null,
      resolveInit,
      rejectInit,
      initDone: false,
      exitPromise,
      resolveExit,
      forceKillTimer: null
    };

    const initTimer = setTimeout(() => {
      if (state.initDone || this.closing) {
        return;
      }
      state.rejectInit(createTaskError(`Worker init timeout: ${workerId}`));
      this._forceKillWorker(workerId, 'init timeout');
    }, this.workerInitTimeoutMs);
    initTimer.unref();
    state.initTimer = initTimer;

    this.workers.set(workerId, state);

    child.on('message', (message) => this._onWorkerMessage(workerId, message));
    child.on('exit', (code, signal) => this._onWorkerExit(workerId, code, signal));
    child.on('error', (error) => {
      hostLog('error', `Worker process error (${workerId})`, error);
    });

    child.send({
      type: 'init',
      workerId,
      payload: {
        runnerOptions: this.workerInitOptions,
        heartbeatIntervalMs: this.heartbeatIntervalMs
      }
    });

    return initPromise;
  }

  _onWorkerMessage(workerId, message) {
    const state = this.workers.get(workerId);
    if (!state || !message || typeof message !== 'object') {
      return;
    }

    state.lastHeartbeatAt = Date.now();
    if (message.memoryUsage) {
      state.memoryUsage = toMemorySnapshot(message.memoryUsage);
    }
    if (message.runtimeStats && typeof message.runtimeStats === 'object') {
      state.runtimeStats = parseRuntimeStats(message.runtimeStats);
    }
    if (Number.isFinite(message.cleanupFailureCount)) {
      state.cleanupFailureCount = Number(message.cleanupFailureCount);
    }

    switch (message.type) {
      case 'init':
        this._onWorkerInit(workerId, message);
        break;
      case 'result':
        this._onTaskResult(workerId, message);
        break;
      case 'error':
        this._onTaskError(workerId, message);
        break;
      case 'heartbeat':
        state.tasksHandled = toPositiveInteger(message.tasksHandled, state.tasksHandled);
        if (Number.isFinite(message.cleanupFailureCount)) {
          state.cleanupFailureCount = Number(message.cleanupFailureCount);
        }
        break;
      default:
        break;
    }
  }

  _onWorkerInit(workerId, message) {
    const state = this.workers.get(workerId);
    if (!state || state.initDone) {
      return;
    }

    state.initDone = true;
    state.status = 'idle';
    state.pid = message.pid || state.pid;
    state.threadId = message.threadId || state.threadId;
    state.inspectorInfo = message.inspectorInfo || state.inspectorInfo || null;
    state.memoryUsage = toMemorySnapshot(message.memoryUsage) || state.memoryUsage;
    state.cleanupFailureCount = Number.isFinite(message.cleanupFailureCount)
      ? Number(message.cleanupFailureCount)
      : state.cleanupFailureCount;
    clearTimeout(state.initTimer);
    this.idleWorkerIds.add(workerId);
    state.resolveInit({
      workerId,
      pid: message.pid,
      warmupMs: message.warmupMs,
      inspectorInfo: message.inspectorInfo || null
    });
    this._drainQueue();
  }

  _onTaskResult(workerId, message) {
    const state = this.workers.get(workerId);
    const active = this.activeTasks.get(message.taskId);
    if (!state || !active || active.workerId !== workerId) {
      return;
    }

    clearTimeout(active.timeoutTimer);
    this.activeTasks.delete(message.taskId);
    state.currentTaskId = null;
    state.tasksHandled = toPositiveInteger(message.tasksHandled, state.tasksHandled + 1);
    state.cleanupFailureCount = Number.isFinite(message.cleanupFailureCount)
      ? Number(message.cleanupFailureCount)
      : state.cleanupFailureCount;
    state.runtimeStats = parseRuntimeStats(message.runtimeStats || message);
    this.metrics.succeeded += 1;

    active.resolve({
      taskId: message.taskId,
      workerId,
      result: message.result,
      durationMs: message.durationMs,
      leakedDocsReleased: Number(message.leakedDocsReleased || 0),
      releasedDocs: Number(message.releasedDocs || message.leakedDocsReleased || 0),
      releasedNodes: Number(message.releasedNodes || 0),
      activeDocs: Number(message.activeDocs || 0),
      activeNodes: Number(message.activeNodes || 0),
      activeTasks: Number(message.activeTasks || 0),
      windowListenerCount: Number(message.windowListenerCount || 0),
      rafCount: Number(message.rafCount || 0),
      runtimeStats: parseRuntimeStats(message.runtimeStats || message),
      phaseTimings: message.phaseTimings && typeof message.phaseTimings === 'object'
        ? {
            executeSignatureTaskMs: Number(message.phaseTimings.executeSignatureTaskMs || 0),
            postTaskCleanupMs: Number(message.phaseTimings.postTaskCleanupMs || 0),
            taskExecutionBreakdown: message.phaseTimings.taskExecutionBreakdown || null
          }
        : null,
      taskApiTrace: message.taskApiTrace && typeof message.taskApiTrace === 'object'
        ? message.taskApiTrace
        : null,
      paramSignMethodTrace: message.paramSignMethodTrace && typeof message.paramSignMethodTrace === 'object'
        ? message.paramSignMethodTrace
        : null,
      cleanupFailureCount: Number(message.cleanupFailureCount || 0),
      memoryUsage: toMemorySnapshot(message.memoryUsage) || state.memoryUsage || null
    });

    if (message.shouldRecycle) {
      this._recycleWorker(workerId, 'cleanup failure threshold reached');
      return;
    }

    this._releaseWorkerAfterTask(workerId);
  }

  _onTaskError(workerId, message) {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    if (message.taskId) {
      const active = this.activeTasks.get(message.taskId);
      if (!active || active.workerId !== workerId) {
        return;
      }

      clearTimeout(active.timeoutTimer);
      this.activeTasks.delete(message.taskId);
      state.currentTaskId = null;
      state.tasksHandled = toPositiveInteger(message.tasksHandled, state.tasksHandled);
      state.cleanupFailureCount = Number.isFinite(message.cleanupFailureCount)
        ? Number(message.cleanupFailureCount)
        : state.cleanupFailureCount;
      state.runtimeStats = parseRuntimeStats(message.runtimeStats || message);
      this.metrics.failed += 1;

      const taskError = createTaskError(
        `Worker task failed (${message.taskId})`,
        {
          workerId,
          taskId: message.taskId,
          details: message.error || null,
          runtimeStats: parseRuntimeStats(message.runtimeStats || message),
          phaseTimings: message.phaseTimings && typeof message.phaseTimings === 'object'
            ? {
                executeSignatureTaskMs: Number(message.phaseTimings.executeSignatureTaskMs || 0),
                postTaskCleanupMs: Number(message.phaseTimings.postTaskCleanupMs || 0),
                taskExecutionBreakdown: message.phaseTimings.taskExecutionBreakdown || null
              }
            : null,
          taskApiTrace: message.taskApiTrace && typeof message.taskApiTrace === 'object'
            ? message.taskApiTrace
            : null,
          paramSignMethodTrace: message.paramSignMethodTrace && typeof message.paramSignMethodTrace === 'object'
            ? message.paramSignMethodTrace
            : null,
          memoryUsage: toMemorySnapshot(message.memoryUsage) || state.memoryUsage || null
        }
      );
      active.reject(taskError);

      if (message.shouldRecycle) {
        this._recycleWorker(workerId, 'cleanup failure threshold reached');
        return;
      }

      this._releaseWorkerAfterTask(workerId);
      return;
    }

    hostLog('error', `Worker fatal error (${workerId})`, message.error || message);
    this._recycleWorker(workerId, 'worker fatal');
  }

  _releaseWorkerAfterTask(workerId) {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    if (this.closing) {
      this._recycleWorker(workerId, 'pool closing');
      return;
    }

    if (state.tasksHandled >= this.maxTasksPerWorker) {
      this._recycleWorker(workerId, 'max tasks reached');
      return;
    }

    state.status = 'idle';
    this.idleWorkerIds.add(workerId);
    this._drainQueue();
  }

  _drainQueue() {
    if (!this.started || this.closing) {
      return;
    }

    while (this.pendingQueue.length > 0 && this.idleWorkerIds.size > 0) {
      const task = this.pendingQueue.shift();
      const workerId = this.idleWorkerIds.values().next().value;
      this.idleWorkerIds.delete(workerId);
      this._assignTask(workerId, task);
    }
  }

  _assignTask(workerId, task) {
    const state = this.workers.get(workerId);
    if (!state || state.status !== 'idle') {
      task.reject(createTaskError(`Worker is not ready: ${workerId}`));
      return;
    }

    state.status = 'busy';
    state.currentTaskId = task.taskId;
    this.metrics.started += 1;

    const timeoutTimer = setTimeout(() => {
      const active = this.activeTasks.get(task.taskId);
      if (!active) {
        return;
      }

      this.activeTasks.delete(task.taskId);
      state.currentTaskId = null;
      this.metrics.failed += 1;
      this.metrics.timedOut += 1;
      active.reject(
        createTaskError(
          `Task timeout after ${task.timeoutMs}ms`,
          { workerId, taskId: task.taskId }
        )
      );
      this._forceKillWorker(workerId, 'task timeout');
    }, task.timeoutMs);
    timeoutTimer.unref();

    this.activeTasks.set(task.taskId, {
      ...task,
      workerId,
      timeoutTimer
    });

    try {
      state.child.send({
        type: 'run_signature',
        taskId: task.taskId,
        payload: task.payload
      });
    } catch (error) {
      clearTimeout(timeoutTimer);
      this.activeTasks.delete(task.taskId);
      state.currentTaskId = null;
      task.reject(
        createTaskError(
          `Failed to dispatch task: ${task.taskId}`,
          { workerId, taskId: task.taskId, cause: error }
        )
      );
      this._forceKillWorker(workerId, 'dispatch failure');
    }
  }

  _onWorkerExit(workerId, code, signal) {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    this.idleWorkerIds.delete(workerId);
    clearTimeout(state.initTimer);
    clearTimeout(state.forceKillTimer);

    if (state.currentTaskId) {
      const active = this.activeTasks.get(state.currentTaskId);
      if (active) {
        clearTimeout(active.timeoutTimer);
        this.activeTasks.delete(state.currentTaskId);
        active.reject(
          createTaskError(
            `Worker exited while running task (${state.currentTaskId})`,
            { workerId, taskId: state.currentTaskId, code, signal }
          )
        );
      }
    }

    if (!state.initDone) {
      state.rejectInit(
        createTaskError(`Worker exited during init: ${workerId}`, { code, signal })
      );
    }

    state.resolveExit({ code, signal });
    this.workers.delete(workerId);

    if (!this.closing && this.started) {
      this.metrics.respawned += 1;
      this._spawnWorker().catch((error) => {
        hostLog('error', 'Failed to respawn worker', error);
      });
    }

    this._drainQueue();
  }

  _recycleWorker(workerId, reason) {
    const state = this.workers.get(workerId);
    if (!state || state.status === 'recycling') {
      return;
    }

    this.idleWorkerIds.delete(workerId);
    state.status = 'recycling';
    this.metrics.recycled += 1;

    try {
      state.child.send({
        type: 'shutdown',
        reason
      });
    } catch (_) {
      this._forceKillWorker(workerId, `recycle send failed (${reason})`);
      return;
    }

    state.forceKillTimer = setTimeout(() => {
      this._forceKillWorker(workerId, `recycle timeout (${reason})`);
    }, this.shutdownGraceMs);
    state.forceKillTimer.unref();
  }

  _forceKillWorker(workerId, reason) {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    this.idleWorkerIds.delete(workerId);
    hostLog('warn', `Force killing ${workerId}: ${reason}`);

    if (state.child.exitCode === null) {
      state.child.kill();
    }
  }

  _rejectPendingQueue(error) {
    while (this.pendingQueue.length > 0) {
      const task = this.pendingQueue.shift();
      task.reject(error);
    }
  }

  _startHeartbeatMonitor() {
    this._stopHeartbeatMonitor();

    this.heartbeatMonitor = setInterval(() => {
      if (this.closing) {
        return;
      }

      const now = Date.now();
      for (const [workerId, state] of this.workers.entries()) {
        if (now - state.lastHeartbeatAt > this.heartbeatTimeoutMs) {
          this._forceKillWorker(workerId, 'heartbeat timeout');
        }
      }
    }, this.heartbeatIntervalMs);

    this.heartbeatMonitor.unref();
  }

  _stopHeartbeatMonitor() {
    if (!this.heartbeatMonitor) {
      return;
    }
    clearInterval(this.heartbeatMonitor);
    this.heartbeatMonitor = null;
  }

  getStats() {
    let workerRssTotal = 0;
    let workerHeapUsedTotal = 0;
    let workersWithMemory = 0;
    const workersDetail = [];
    for (const [workerId, state] of this.workers.entries()) {
      const memoryUsage = state.memoryUsage || null;
      if (memoryUsage) {
        workersWithMemory += 1;
        workerRssTotal += Number(memoryUsage.rss || 0);
        workerHeapUsedTotal += Number(memoryUsage.heapUsed || 0);
      }
      workersDetail.push({
        workerId,
        pid: state.pid || null,
        tasksHandled: state.tasksHandled,
        cleanupFailureCount: state.cleanupFailureCount,
        status: state.status,
        memoryUsage,
        runtimeStats: state.runtimeStats
      });
    }

    return {
      ...this.metrics,
      workers: this.workers.size,
      idleWorkers: this.idleWorkerIds.size,
      activeTasks: this.activeTasks.size,
      pendingTasks: this.pendingQueue.length,
      memory: {
        host: getHostMemorySnapshot(),
        workersWithMemory,
        workerRssTotal,
        workerHeapUsedTotal
      },
      workersDetail
    };
  }
}

module.exports = {
  ProcessPool,
  computeDefaultWorkerCount
};
