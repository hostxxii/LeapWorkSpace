const { Worker } = require('worker_threads');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hostLog } = require('../instance/host-log');
const { resolveRunOptions, generateBundleCodeCache } = require('../../runner');
const { toPositiveInteger, parseRuntimeStats } = require('./worker-common');
const { ProcessPool } = require('./process-pool');

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

function resolveLeapVmEntryForPin() {
  if (process.env.LEAP_VM_PACKAGE_PATH) {
    return path.resolve(process.env.LEAP_VM_PACKAGE_PATH);
  }

  const workspacePackagePath = path.resolve(__dirname, '../../..', 'leap-vm');
  if (fs.existsSync(workspacePackagePath)) {
    return workspacePackagePath;
  }

  return 'leap-vm';
}

function shouldUseProcessPoolDelegate(options = {}) {
  if (options && options.forceProcessPool === true) {
    return true;
  }
  const forceProcessRaw = String(
    process.env.LEAPVM_THREADPOOL_FORCE_PROCESSPOOL || ''
  ).trim().toLowerCase();
  return forceProcessRaw === '1' || forceProcessRaw === 'true' || forceProcessRaw === 'yes';
}

class ThreadPool {
  constructor(options = {}) {
    this.delegate = null;
    this.fallbackReason = null;

    if (shouldUseProcessPoolDelegate(options)) {
      this.fallbackReason = 'explicit-processpool-delegate';
      this.delegate = new ProcessPool(options);
      this.size = this.delegate.size;
      this.workerScriptPath = this.delegate.workerScriptPath;
      this.taskTimeoutMs = this.delegate.taskTimeoutMs;
      this.workerInitTimeoutMs = this.delegate.workerInitTimeoutMs;
      this.maxTasksPerWorker = this.delegate.maxTasksPerWorker;
      this.heartbeatIntervalMs = this.delegate.heartbeatIntervalMs;
      this.heartbeatTimeoutMs = this.delegate.heartbeatTimeoutMs;
      this.shutdownGraceMs = this.delegate.shutdownGraceMs;
      this.workerInitOptions = this.delegate.workerInitOptions;
      this.started = false;
      this.closing = false;
      this.metrics = this.delegate.metrics;
      this.dodSupported = false;
      this.dodTransferMode = 'clone';
      this.enableDodZeroCopy = false;
      hostLog(
        'warn',
        '[ThreadPool] Using ProcessPool delegate due to forceProcessPool/LEAPVM_THREADPOOL_FORCE_PROCESSPOOL.'
      );
      return;
    }

    const defaultSize = computeDefaultWorkerCount(options.workerMultiplier || 1);

    this.size = toPositiveInteger(options.size, defaultSize);
    this.workerScriptPath = options.workerScriptPath || path.join(__dirname, 'thread-worker.js');
    this.taskTimeoutMs = toPositiveInteger(options.taskTimeoutMs, 5000);
    this.workerInitTimeoutMs = toPositiveInteger(options.workerInitTimeoutMs, 15000);
    this.maxTasksPerWorker = toPositiveInteger(options.maxTasksPerWorker, 200);
    this.heartbeatIntervalMs = toPositiveInteger(options.heartbeatIntervalMs, 5000);
    this.heartbeatTimeoutMs = toPositiveInteger(options.heartbeatTimeoutMs, this.heartbeatIntervalMs * 3);
    this.shutdownGraceMs = toPositiveInteger(options.shutdownGraceMs, 2000);

    const initOptions = {
      debug: !!options.debug,
      waitForInspector: !!options.waitForInspector,
      beforeRunScript: options.beforeRunScript || '',
      bundlePath: options.bundlePath,
      domBackend: options.domBackend,
      signatureProfile: options.signatureProfile,
      debugCppWrapperRules: options.debugCppWrapperRules
    };
    this.workerInitOptions = resolveRunOptions(initOptions);

    this.workers = new Map();
    this.closedWorkers = new Map();
    this.idleWorkerIds = new Set();
    this.pendingQueue = [];
    this.activeTasks = new Map();

    this.started = false;
    this.closing = false;
    this.workerSeq = 0;
    this.taskSeq = 0;
    this.heartbeatMonitor = null;

    // DoD support is always enabled; zero-copy transfer is the default mode.
    // Use dodTransferMode/LEAP_DOD_TRANSFER_MODE='clone' to force clone mode.
    this.dodSupported = true;
    const dodTransferModeRaw = String(
      options.dodTransferMode || process.env.LEAP_DOD_TRANSFER_MODE || 'transfer'
    ).trim().toLowerCase();
    this.dodTransferMode = dodTransferModeRaw === 'clone' ? 'clone' : 'transfer';
    this.enableDodZeroCopy = this.dodTransferMode === 'transfer';
    this.metrics = {
      enqueued: 0,
      started: 0,
      succeeded: 0,
      failed: 0,
      timedOut: 0,
      recycled: 0,
      respawned: 0
    };

    this.pinnedLeapVmAddon = null;
    this._pinLeapVmAddonForLinuxWorkers();
  }

  _pinLeapVmAddonForLinuxWorkers() {
    if (process.platform !== 'linux') {
      return;
    }

    if (this.delegate) {
      return;
    }

    const disablePinRaw = String(process.env.LEAPVM_DISABLE_MAIN_ADDON_PIN || '')
      .trim()
      .toLowerCase();
    if (disablePinRaw === '1' || disablePinRaw === 'true' || disablePinRaw === 'yes') {
      return;
    }

    if (global.__leapvmMainAddonPin) {
      this.pinnedLeapVmAddon = global.__leapvmMainAddonPin;
      return;
    }

    try {
      const entry = resolveLeapVmEntryForPin();
      this.pinnedLeapVmAddon = require(entry);
      global.__leapvmMainAddonPin = this.pinnedLeapVmAddon;
      hostLog('info', `[ThreadPool] Pinned leap-vm addon in main thread: ${entry}`);
    } catch (error) {
      hostLog('warn', `[ThreadPool] Failed to pin leap-vm addon in main thread: ${error && error.message}`);
    }
  }

  async start() {
    if (this.delegate) {
      await this.delegate.start();
      this.started = true;
      this.closing = false;
      return;
    }

    if (this.started) {
      return;
    }

    this.started = true;
    this.closing = false;
    this.closedWorkers.clear();

    // Pre-read the bundle once so all workers share the same in-memory string
    // instead of each worker issuing its own readFileSync on startup/recycle.
    if (!this.workerInitOptions.bundleCode && this.workerInitOptions.bundlePath) {
      try {
        if (fs.existsSync(this.workerInitOptions.bundlePath)) {
          this.workerInitOptions = {
            ...this.workerInitOptions,
            bundleCode: fs.readFileSync(this.workerInitOptions.bundlePath, 'utf8')
          };
          hostLog('info', 'Bundle pre-loaded into pool (workers will skip disk read).');
        }
      } catch (err) {
        hostLog('warn', `Failed to pre-load bundle; workers will read from disk. ${err && err.message}`);
      }
    }

    // Generate V8 code cache for the bundle so workers skip parse+compile.
    if (this.workerInitOptions.bundleCode && !this.workerInitOptions.bundleCodeCache) {
      try {
        if (this.pinnedLeapVmAddon && typeof this.pinnedLeapVmAddon.createCodeCache === 'function') {
          const cache = generateBundleCodeCache(this.pinnedLeapVmAddon, this.workerInitOptions.bundleCode);
          if (cache && cache.length > 0) {
            this.workerInitOptions = {
              ...this.workerInitOptions,
              bundleCodeCache: cache
            };
            hostLog('info', `Bundle code cache generated (${cache.length} bytes), workers will use cached compilation.`);
          }
        }
      } catch (err) {
        hostLog('warn', `Failed to generate bundle code cache: ${err && err.message}`);
      }
    }

    const bootPromises = [];
    for (let i = 0; i < this.size; i += 1) {
      bootPromises.push(this._spawnWorker());
    }

    await Promise.all(bootPromises);
    this._startHeartbeatMonitor();
    hostLog('info', `Thread pool started with ${this.size} workers`);
  }

  runTask(payload = {}, options = {}) {
    if (this.delegate) {
      return this.delegate.runTask(payload, options);
    }
    return this.runSignature(payload, options);
  }

  runSignature(payload = {}, options = {}) {
    if (this.delegate) {
      return this.delegate.runSignature(payload, options);
    }

    if (!this.started) {
      return Promise.reject(createTaskError('Thread pool is not started'));
    }
    if (this.closing) {
      return Promise.reject(createTaskError('Thread pool is closing'));
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
    if (this.delegate) {
      this.closing = true;
      await this.delegate.close(options);
      this.started = false;
      this.closing = false;
      return;
    }

    if (!this.started) {
      return;
    }

    this.closing = true;
    this._stopHeartbeatMonitor();
    this._rejectPendingQueue(createTaskError('Thread pool is shutting down'));

    const closeTimeoutMs = toPositiveInteger(options.timeoutMs, 5000);
    const forceTerminate = !!options.forceTerminate;
    const exitPromises = [];

    for (const [workerId, state] of this.workers.entries()) {
      exitPromises.push(state.exitPromise);
      if (forceTerminate) {
        this._beginTerminateWorker(workerId, 'pool shutdown (forceTerminate)', 'force');
      } else {
        this._beginTerminateWorker(workerId, 'pool shutdown', 'graceful', {
          countRecycle: true,
          status: 'recycling'
        });
      }
    }

    await Promise.race([
      Promise.allSettled(exitPromises),
      new Promise((resolve) => setTimeout(resolve, closeTimeoutMs))
    ]);

    for (const workerId of this.workers.keys()) {
      this._beginTerminateWorker(workerId, 'pool close timeout', 'force');
    }

    await Promise.allSettled(Array.from(this.workers.values()).map((state) => state.exitPromise));
    this.started = false;
    this.closing = false;
    hostLog('info', 'Thread pool closed');
  }

  _spawnWorker() {
    const workerId = `thread-worker-${++this.workerSeq}`;
    const worker = new Worker(this.workerScriptPath);

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
      worker,
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
      forceKillTimer: null,
      terminating: false,
      terminatingHard: false,
      terminateReason: null,
      terminateMode: null,
      terminateRequestedAt: null,
      cleanupSkipped: false,
      shutdownAckAt: null,
      shutdownAck: null
    };

    state.terminatePromise = Promise.race([
      exitPromise,
      new Promise((resolve) => {
        state.resolveShutdownSignal = resolve;
      })
    ]);

    const initTimer = setTimeout(() => {
      if (state.initDone || this.closing) {
        return;
      }
      state.rejectInit(createTaskError(`Worker init timeout: ${workerId}`));
      this._beginTerminateWorker(workerId, 'init timeout', 'force');
    }, this.workerInitTimeoutMs);
    initTimer.unref();
    state.initTimer = initTimer;

    this.workers.set(workerId, state);

    worker.on('message', (message) => this._onWorkerMessage(workerId, message));
    worker.on('exit', (code) => this._onWorkerExit(workerId, code, null));
    worker.on('error', (error) => {
      hostLog('error', `Worker thread error (${workerId})`, error);
    });

    worker.postMessage({
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
      case 'shutdown_ack':
        this._onWorkerShutdownAck(workerId, message);
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
    state.memoryUsage = toMemorySnapshot(message.memoryUsage) || state.memoryUsage;
    state.cleanupFailureCount = Number.isFinite(message.cleanupFailureCount)
      ? Number(message.cleanupFailureCount)
      : state.cleanupFailureCount;
    clearTimeout(state.initTimer);
    this.idleWorkerIds.add(workerId);
    state.resolveInit({
      workerId,
      pid: message.pid,
      threadId: message.threadId,
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
    state.cleanupSkipped = false;
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
      state.cleanupSkipped = false;
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

  _onWorkerShutdownAck(workerId, message) {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    state.shutdownAckAt = Date.now();
    state.shutdownAck = {
      cleanupError: message.cleanupError || null,
      shutdownError: message.shutdownError || null
    };
    state.status = 'terminating';
    state.cleanupSkipped = false;
    if (message.memoryUsage) {
      state.memoryUsage = toMemorySnapshot(message.memoryUsage) || state.memoryUsage;
    }
    if (message.runtimeStats && typeof message.runtimeStats === 'object') {
      state.runtimeStats = parseRuntimeStats(message.runtimeStats);
    }
    if (typeof state.resolveShutdownSignal === 'function') {
      state.resolveShutdownSignal({
        type: 'shutdown_ack',
        workerId,
        cleanupError: message.cleanupError || null,
        shutdownError: message.shutdownError || null
      });
      state.resolveShutdownSignal = null;
    }
    clearTimeout(state.forceKillTimer);
    state.forceKillTimer = setTimeout(() => {
      this._beginTerminateWorker(
        workerId,
        `shutdown ack exit timeout (${state.terminateReason || 'unknown'})`,
        'force'
      );
    }, Math.min(this.shutdownGraceMs, 500));
    state.forceKillTimer.unref();
  }

  _beginTerminateWorker(workerId, reason, mode = 'graceful', options = {}) {
    const state = this.workers.get(workerId);
    if (!state) {
      return null;
    }

    if (mode === 'force') {
      return this._forceKillWorker(workerId, reason, options);
    }

    if (state.terminating) {
      return state.terminatePromise;
    }

    this.idleWorkerIds.delete(workerId);
    clearTimeout(state.forceKillTimer);
    state.terminating = true;
    state.terminateReason = state.terminateReason || reason;
    state.terminateMode = 'graceful';
    state.terminateRequestedAt = Date.now();
    state.cleanupSkipped = options.cleanupSkipped === true;
    state.status = options.status || 'terminating';

    if (options.countRecycle) {
      this.metrics.recycled += 1;
    }

    try {
      state.worker.postMessage({
        type: 'shutdown',
        reason
      });
    } catch (_) {
      return this._forceKillWorker(workerId, `recycle send failed (${reason})`, options);
    }

    state.forceKillTimer = setTimeout(() => {
      this._beginTerminateWorker(workerId, `recycle timeout (${reason})`, 'force', options);
    }, this.shutdownGraceMs);
    state.forceKillTimer.unref();
    return state.terminatePromise;
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
      state.cleanupSkipped = true;
      this.metrics.failed += 1;
      this.metrics.timedOut += 1;
      active.reject(
        createTaskError(
          `Task timeout after ${task.timeoutMs}ms`,
          { workerId, taskId: task.taskId }
        )
      );
      this._beginTerminateWorker(workerId, 'task timeout', 'force', {
        cleanupSkipped: true,
        status: 'terminating'
      });
    }, task.timeoutMs);
    timeoutTimer.unref();

    this.activeTasks.set(task.taskId, {
      ...task,
      workerId,
      timeoutTimer
    });

    try {
      // Collect transferable ArrayBuffers for zero-copy transmission (optional)
      const transferables = [];
      if (this.enableDodZeroCopy && this.dodSupported && task.payload && task.payload.dodTree) {
        const tree = task.payload.dodTree;
        const pushUnique = (buffer) => {
          if (!buffer || transferables.indexOf(buffer) >= 0) return;
          transferables.push(buffer);
        };
        // Collect all ArrayBuffers from DoD tree structure
        if (tree.widths && tree.widths.buffer) pushUnique(tree.widths.buffer);
        if (tree.heights && tree.heights.buffer) pushUnique(tree.heights.buffer);
        if (tree.left && tree.left.buffer) pushUnique(tree.left.buffer);
        if (tree.top && tree.top.buffer) pushUnique(tree.top.buffer);
        if (tree.margins && tree.margins.buffer) pushUnique(tree.margins.buffer);
        if (tree.paddings && tree.paddings.buffer) pushUnique(tree.paddings.buffer);
        if (tree.computedWidths && tree.computedWidths.buffer) pushUnique(tree.computedWidths.buffer);
        if (tree.computedHeights && tree.computedHeights.buffer) pushUnique(tree.computedHeights.buffer);
        if (tree.computedLefts && tree.computedLefts.buffer) pushUnique(tree.computedLefts.buffer);
        if (tree.computedTops && tree.computedTops.buffer) pushUnique(tree.computedTops.buffer);
        if (tree.parents && tree.parents.buffer) pushUnique(tree.parents.buffer);
        if (tree.childrenStart && tree.childrenStart.buffer) pushUnique(tree.childrenStart.buffer);
        if (tree.childrenCount && tree.childrenCount.buffer) pushUnique(tree.childrenCount.buffer);
        if (tree.firstChild && tree.firstChild.buffer) pushUnique(tree.firstChild.buffer);
        if (tree.nextSibling && tree.nextSibling.buffer) pushUnique(tree.nextSibling.buffer);
        if (tree.lastChild && tree.lastChild.buffer) pushUnique(tree.lastChild.buffer);
        if (tree.childrenList && tree.childrenList.buffer) pushUnique(tree.childrenList.buffer);
        if (tree.flags && tree.flags.buffer) pushUnique(tree.flags.buffer);
      }

      // Send message with transferables list for zero-copy transfer
      if (transferables.length > 0) {
        state.worker.postMessage({
          type: 'run_signature',
          taskId: task.taskId,
          payload: task.payload
        }, transferables);
      } else {
        state.worker.postMessage({
          type: 'run_signature',
          taskId: task.taskId,
          payload: task.payload
        });
      }
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
      this._beginTerminateWorker(workerId, 'dispatch failure', 'force', {
        cleanupSkipped: true,
        status: 'terminating'
      });
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
    if (typeof state.resolveShutdownSignal === 'function') {
      state.resolveShutdownSignal({ type: 'exit', workerId, code, signal });
      state.resolveShutdownSignal = null;
    }
    hostLog(
      state.terminateMode === 'force' ? 'warn' : 'info',
      `[ThreadPool] Worker exit ${workerId}: ${JSON.stringify({
        code,
        signal,
        terminateReason: state.terminateReason,
        terminateMode: state.terminateMode,
        terminateRequestedAt: state.terminateRequestedAt,
        shutdownAckAt: state.shutdownAckAt,
        cleanupSkipped: state.cleanupSkipped,
        tasksHandled: state.tasksHandled,
        currentTaskId: state.currentTaskId,
        cleanupFailureCount: state.cleanupFailureCount,
        runtimeStats: state.runtimeStats,
        memoryUsage: state.memoryUsage
      })}`
    );
    if (state.shutdownAck && (state.shutdownAck.cleanupError || state.shutdownAck.shutdownError)) {
      hostLog(
        'warn',
        `[ThreadPool] ${workerId} acknowledged shutdown with cleanup errors: ${JSON.stringify(state.shutdownAck)}`
      );
    }
    this.closedWorkers.set(workerId, {
      workerId,
      pid: state.pid || null,
      threadId: state.threadId || null,
      tasksHandled: state.tasksHandled,
      cleanupFailureCount: state.cleanupFailureCount,
      status: state.status,
      terminateReason: state.terminateReason,
      terminateMode: state.terminateMode,
      terminateRequestedAt: state.terminateRequestedAt,
      shutdownAckAt: state.shutdownAckAt,
      cleanupSkipped: state.cleanupSkipped,
      memoryUsage: state.memoryUsage || null,
      runtimeStats: state.runtimeStats || null
    });
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
    return this._beginTerminateWorker(workerId, reason, 'graceful', {
      countRecycle: true,
      status: 'recycling'
    });
  }

  _forceKillWorker(workerId, reason, options = {}) {
    const state = this.workers.get(workerId);
    if (!state) {
      return null;
    }
    if (state.terminatingHard) {
      return state.terminatePromise;
    }

    this.idleWorkerIds.delete(workerId);
    state.terminating = true;
    state.terminatingHard = true;
    state.terminateReason = state.terminateReason || reason;
    state.terminateMode = 'force';
    state.terminateRequestedAt = state.terminateRequestedAt || Date.now();
    state.cleanupSkipped = options.cleanupSkipped !== false;
    state.status = options.status || 'terminating';
    clearTimeout(state.forceKillTimer);
    hostLog('warn', `Force terminating ${workerId}: ${reason}`);

    state.worker.terminate().catch(() => {
      // ignore terminate errors
    });
    return state.terminatePromise;
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
          this._beginTerminateWorker(workerId, 'heartbeat timeout', 'force', {
            cleanupSkipped: true,
            status: 'terminating'
          });
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
    if (this.delegate) {
      const delegateStats = this.delegate.getStats();
      return {
        ...delegateStats,
        backend: 'process-fallback',
        fallbackReason: this.fallbackReason
      };
    }

    let workerRssTotal = 0;
    let workerHeapUsedTotal = 0;
    let workersWithMemory = 0;
    const workersDetail = [];
    const sourceWorkers = this.workers.size > 0
      ? Array.from(this.workers.entries()).map(([workerId, state]) => ({ workerId, state }))
      : Array.from(this.closedWorkers.entries()).map(([workerId, snapshot]) => ({ workerId, state: snapshot }));
    for (const { workerId, state } of sourceWorkers) {
      const memoryUsage = state.memoryUsage || null;
      if (memoryUsage) {
        workersWithMemory += 1;
        workerRssTotal += Number(memoryUsage.rss || 0);
        workerHeapUsedTotal += Number(memoryUsage.heapUsed || 0);
      }
      workersDetail.push({
        workerId,
        pid: state.pid || null,
        threadId: state.threadId || null,
        tasksHandled: state.tasksHandled,
        cleanupFailureCount: state.cleanupFailureCount,
        status: state.status,
        terminateReason: state.terminateReason,
        terminateMode: state.terminateMode,
        terminateRequestedAt: state.terminateRequestedAt,
        shutdownAckAt: state.shutdownAckAt,
        cleanupSkipped: state.cleanupSkipped,
        memoryUsage,
        runtimeStats: state.runtimeStats
      });
    }

    return {
      ...this.metrics,
      workers: sourceWorkers.length,
      idleWorkers: this.workers.size > 0 ? this.idleWorkerIds.size : sourceWorkers.length,
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
  ThreadPool,
  computeDefaultWorkerCount
};
