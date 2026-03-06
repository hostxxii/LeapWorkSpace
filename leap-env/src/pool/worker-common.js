'use strict';

// ---------------------------------------------------------------------------
// worker-common.js
// Shared utilities used by both worker.js (process pool) and
// thread-worker.js (thread pool) to eliminate duplicated code.
// ---------------------------------------------------------------------------

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function getMemorySnapshot() {
  if (typeof process.memoryUsage !== 'function') {
    return null;
  }
  try {
    const usage = process.memoryUsage();
    return {
      rss: Number(usage.rss || 0),
      heapTotal: Number(usage.heapTotal || 0),
      heapUsed: Number(usage.heapUsed || 0),
      external: Number(usage.external || 0),
      arrayBuffers: Number(usage.arrayBuffers || 0)
    };
  } catch (_) {
    return null;
  }
}

function serializeError(error) {
  if (!error) {
    return { message: 'Unknown error' };
  }
  return {
    message: error.message || String(error),
    stack: error.stack || '',
    name: error.name || 'Error'
  };
}

function buildReleaseAllScopesScript() {
  return `
    (function () {
      try {
        var domService = (globalThis.leapenv && globalThis.leapenv.domShared)
          ? globalThis.leapenv.domShared
          : null;
        if (domService && typeof domService.releaseAllScopes === 'function') {
          domService.releaseAllScopes();
        }
      } catch (_) {}
    })();
    //# sourceURL=leapenv.task-scope.shutdown.js
  `;
}

function buildRuntimeStatsScript() {
  return `
    (function () {
      var out = {
        activeDocs: 0,
        activeNodes: 0,
        activeTasks: 0,
        windowListenerCount: 0,
        rafCount: 0,
        timeoutCount: 0,
        intervalCount: 0,
        pendingTimerCount: 0,
        messageChannelCount: 0,
        messagePortOpenCount: 0,
        messagePortClosedCount: 0,
        messagePortQueueCount: 0,
        placeholderXhrCreatedCount: 0,
        placeholderXhrFallbackCount: 0
      };
      var leapenv = globalThis.leapenv || null;
      var domService = (leapenv && leapenv.domShared) ? leapenv.domShared : null;
      try {
        if (domService && typeof domService.getRuntimeStats === 'function') {
          var runtime = domService.getRuntimeStats();
          if (runtime && typeof runtime === 'object') {
            out.activeDocs = Number(runtime.activeDocs || 0);
            out.activeNodes = Number(runtime.activeNodes || 0);
            out.activeTasks = Number(runtime.activeTasks || 0);
          }
        }
      } catch (_) {}

      var runtimeStore = null;
      try {
        if (leapenv && typeof leapenv.getRuntimeStore === 'function') {
          runtimeStore = leapenv.getRuntimeStore();
        }
      } catch (_) {}
      if (!runtimeStore && leapenv && leapenv.__runtime && typeof leapenv.__runtime === 'object') {
        runtimeStore = leapenv.__runtime;
      }

      var getWindowStats = runtimeStore && runtimeStore.windowTaskGetStats;
      if (typeof getWindowStats !== 'function') {
        var windowImpl = leapenv && leapenv.implRegistry && leapenv.implRegistry.Window;
        getWindowStats = windowImpl && windowImpl.__leapGetTaskRuntimeStats;
      }

      try {
        if (typeof getWindowStats === 'function') {
          var windowStats = getWindowStats();
          if (windowStats && typeof windowStats === 'object') {
            out.windowListenerCount = Number(windowStats.windowListenerCount || 0);
            out.rafCount = Number(windowStats.rafCount || 0);
            out.timeoutCount = Number(windowStats.timeoutCount || 0);
            out.intervalCount = Number(windowStats.intervalCount || 0);
            out.pendingTimerCount = Number(windowStats.pendingTimerCount || 0);
            out.placeholderXhrCreatedCount = Number(windowStats.placeholderXhrCreatedCount || 0);
            out.placeholderXhrFallbackCount = Number(windowStats.placeholderXhrFallbackCount || 0);
          }
        }
      } catch (_) {}

      var getMessageStats = runtimeStore && runtimeStore.messagePortGetStats;
      if (typeof getMessageStats !== 'function') {
        var messageChannelImpl = leapenv && leapenv.implRegistry && leapenv.implRegistry.MessageChannel;
        getMessageStats = messageChannelImpl && messageChannelImpl.__leapGetRuntimeStats;
      }
      try {
        if (typeof getMessageStats === 'function') {
          var messageStats = getMessageStats();
          if (messageStats && typeof messageStats === 'object') {
            out.messageChannelCount = Number(messageStats.messageChannelCount || 0);
            out.messagePortOpenCount = Number(messageStats.messagePortOpenCount || 0);
            out.messagePortClosedCount = Number(messageStats.messagePortClosedCount || 0);
            out.messagePortQueueCount = Number(messageStats.messagePortQueueCount || 0);
          }
        }
      } catch (_) {}

      return JSON.stringify(out);
    })();
    //# sourceURL=leapenv.worker.runtime-stats.js
  `;
}

function buildTaskApiTraceSnapshotScript() {
  return `
    (function () {
      try {
        var trace = globalThis.__leapTaskApiTrace;
        if (!trace || typeof trace !== 'object') {
          return 'null';
        }
        var stats = trace.taskStats && typeof trace.taskStats === 'object'
          ? trace.taskStats
          : {};
        var out = {
          taskId: trace.currentTaskId || '',
          stats: {}
        };
        var keys = Object.keys(stats);
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var entry = stats[key];
          if (!entry || typeof entry !== 'object') {
            continue;
          }
          out.stats[key] = {
            count: Number(entry.count || 0),
            totalMs: Number(entry.totalMs || 0),
            maxMs: Number(entry.maxMs || 0),
            lastMs: Number(entry.lastMs || 0)
          };
        }
        return JSON.stringify(out);
      } catch (_) {
        return 'null';
      }
    })();
    //# sourceURL=leapenv.worker.task-api-trace.snapshot.js
  `;
}

function parseRuntimeStats(raw) {
  var parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  var topHeapObjectTypes = Array.isArray(parsed.v8TopHeapObjectTypes)
    ? parsed.v8TopHeapObjectTypes
      .filter(function (entry) { return entry && typeof entry === 'object'; })
      .map(function (entry) {
        return {
          type: String(entry.type || ''),
          subType: String(entry.subType || entry.sub_type || ''),
          count: Number(entry.count || 0),
          size: Number(entry.size || 0)
        };
      })
    : [];
  return {
    activeDocs: Number(parsed.activeDocs || 0),
    activeNodes: Number(parsed.activeNodes || 0),
    activeTasks: Number(parsed.activeTasks || 0),
    windowListenerCount: Number(parsed.windowListenerCount || 0),
    rafCount: Number(parsed.rafCount || 0),
    timeoutCount: Number(parsed.timeoutCount || 0),
    intervalCount: Number(parsed.intervalCount || 0),
    pendingTimerCount: Number(parsed.pendingTimerCount || 0),
    messageChannelCount: Number(parsed.messageChannelCount || 0),
    messagePortOpenCount: Number(parsed.messagePortOpenCount || 0),
    messagePortClosedCount: Number(parsed.messagePortClosedCount || 0),
    messagePortQueueCount: Number(parsed.messagePortQueueCount || 0),
    placeholderXhrCreatedCount: Number(parsed.placeholderXhrCreatedCount || 0),
    placeholderXhrFallbackCount: Number(parsed.placeholderXhrFallbackCount || 0),
    vmPendingTaskCount: Number(parsed.vmPendingTaskCount || 0),
    vmTimerCount: Number(parsed.vmTimerCount || 0),
    vmTimerQueueSize: Number(parsed.vmTimerQueueSize || 0),
    vmStaleTimerQueueCount: Number(parsed.vmStaleTimerQueueCount || 0),
    vmDomWrapperCacheSize: Number(parsed.vmDomWrapperCacheSize || 0),
    vmPendingDomWrapperCleanupCount: Number(parsed.vmPendingDomWrapperCleanupCount || 0),
    vmChildFrameCount: Number(parsed.vmChildFrameCount || 0),
    vmChildFrameDispatchFnCount: Number(parsed.vmChildFrameDispatchFnCount || 0),
    vmMainDispatchFnCached: Number(parsed.vmMainDispatchFnCached || 0),
    domDocumentCount: Number(parsed.domDocumentCount || 0),
    domTaskScopeCount: Number(parsed.domTaskScopeCount || 0),
    domHandleCount: Number(parsed.domHandleCount || 0),
    skeletonCount: Number(parsed.skeletonCount || 0),
    skeletonTemplateCount: Number(parsed.skeletonTemplateCount || 0),
    skeletonDispatchMetaCount: Number(parsed.skeletonDispatchMetaCount || 0),
    skeletonBrandCompatCacheSize: Number(parsed.skeletonBrandCompatCacheSize || 0),
    v8TotalHeapSize: Number(parsed.v8TotalHeapSize || 0),
    v8TotalHeapSizeExecutable: Number(parsed.v8TotalHeapSizeExecutable || 0),
    v8TotalPhysicalSize: Number(parsed.v8TotalPhysicalSize || 0),
    v8TotalAvailableSize: Number(parsed.v8TotalAvailableSize || 0),
    v8UsedHeapSize: Number(parsed.v8UsedHeapSize || 0),
    v8HeapSizeLimit: Number(parsed.v8HeapSizeLimit || 0),
    v8MallocedMemory: Number(parsed.v8MallocedMemory || 0),
    v8PeakMallocedMemory: Number(parsed.v8PeakMallocedMemory || 0),
    v8ExternalMemory: Number(parsed.v8ExternalMemory || 0),
    v8TotalGlobalHandlesSize: Number(parsed.v8TotalGlobalHandlesSize || 0),
    v8UsedGlobalHandlesSize: Number(parsed.v8UsedGlobalHandlesSize || 0),
    v8NumberOfNativeContexts: Number(parsed.v8NumberOfNativeContexts || 0),
    v8NumberOfDetachedContexts: Number(parsed.v8NumberOfDetachedContexts || 0),
    v8CodeAndMetadataSize: Number(parsed.v8CodeAndMetadataSize || 0),
    v8BytecodeAndMetadataSize: Number(parsed.v8BytecodeAndMetadataSize || 0),
    v8ExternalScriptSourceSize: Number(parsed.v8ExternalScriptSourceSize || 0),
    v8CpuProfilerMetadataSize: Number(parsed.v8CpuProfilerMetadataSize || 0),
    v8OldSpaceUsedSize: Number(parsed.v8OldSpaceUsedSize || 0),
    v8OldSpacePhysicalSize: Number(parsed.v8OldSpacePhysicalSize || 0),
    v8NewSpaceUsedSize: Number(parsed.v8NewSpaceUsedSize || 0),
    v8NewSpacePhysicalSize: Number(parsed.v8NewSpacePhysicalSize || 0),
    v8CodeSpaceUsedSize: Number(parsed.v8CodeSpaceUsedSize || 0),
    v8CodeSpacePhysicalSize: Number(parsed.v8CodeSpacePhysicalSize || 0),
    v8MapSpaceUsedSize: Number(parsed.v8MapSpaceUsedSize || 0),
    v8MapSpacePhysicalSize: Number(parsed.v8MapSpacePhysicalSize || 0),
    v8LargeObjectSpaceUsedSize: Number(parsed.v8LargeObjectSpaceUsedSize || 0),
    v8LargeObjectSpacePhysicalSize: Number(parsed.v8LargeObjectSpacePhysicalSize || 0),
    v8TrackedHeapObjectTypeCount: Number(parsed.v8TrackedHeapObjectTypeCount || 0),
    v8HeapObjectStatsAvailable: Number(parsed.v8HeapObjectStatsAvailable || 0),
    v8TopHeapObjectTypes: topHeapObjectTypes
  };
}

function getNativeRuntimeStats(leapvm) {
  if (!leapvm || typeof leapvm.getRuntimeStats !== 'function') {
    return null;
  }
  var options = arguments.length > 1 ? arguments[1] : null;
  try {
    return parseRuntimeStats(leapvm.getRuntimeStats(options || undefined));
  } catch (_) {
    return null;
  }
}

function mergeRuntimeStats(primary, secondary) {
  var base = parseRuntimeStats(primary) || {};
  var extra = parseRuntimeStats(secondary);
  if (!extra) {
    return Object.keys(base).length > 0 ? parseRuntimeStats(base) : null;
  }
  return parseRuntimeStats(Object.assign({}, base, extra));
}

// Build the post-task cleanup script string.
// Accepts safeTaskId (already JSON.stringify'd task ID string).
function buildPostTaskCleanupScript(safeTaskId) {
  return `
    (function () {
      var out = {
        releasedDocs: 0,
        releasedNodes: 0,
        activeDocs: 0,
        activeNodes: 0,
        activeTasks: 0,
        windowListenerCount: 0,
        rafCount: 0,
        timeoutCount: 0,
        intervalCount: 0,
        pendingTimerCount: 0,
        messageChannelCount: 0,
        messagePortOpenCount: 0,
        messagePortClosedCount: 0,
        messagePortQueueCount: 0,
        placeholderXhrCreatedCount: 0,
        placeholderXhrFallbackCount: 0
      };
      var leapenv = globalThis.leapenv || null;
      var domService = (leapenv && leapenv.domShared)
        ? leapenv.domShared
        : null;
      try {
        if (domService && typeof domService.releaseTaskScope === 'function') {
          var leaked = Number(domService.releaseTaskScope(${safeTaskId})) || 0;
          out.releasedDocs = leaked > 0 ? leaked : 0;
        }
      } catch (_) {}
      try {
        if (domService && typeof domService.drainReleaseStats === 'function') {
          var stats = domService.drainReleaseStats();
          if (stats && typeof stats === 'object') {
            var releasedNodes = Number(stats.releasedNodes || 0);
            out.releasedNodes = releasedNodes > 0 ? releasedNodes : 0;
          }
        }
      } catch (_) {}
      try {
        if (domService && typeof domService.getRuntimeStats === 'function') {
          var runtime = domService.getRuntimeStats();
          if (runtime && typeof runtime === 'object') {
            out.activeDocs = Number(runtime.activeDocs || 0);
            out.activeNodes = Number(runtime.activeNodes || 0);
            out.activeTasks = Number(runtime.activeTasks || 0);
          }
        }
      } catch (_) {}
      var runtimeStore = null;
      try {
        if (leapenv && typeof leapenv.getRuntimeStore === 'function') {
          runtimeStore = leapenv.getRuntimeStore();
        }
      } catch (_) {}
      if (!runtimeStore && leapenv && leapenv.__runtime && typeof leapenv.__runtime === 'object') {
        runtimeStore = leapenv.__runtime;
      }
      var getWindowStats = runtimeStore && runtimeStore.windowTaskGetStats;
      if (typeof getWindowStats !== 'function') {
        var windowImpl = leapenv && leapenv.implRegistry && leapenv.implRegistry.Window;
        getWindowStats = windowImpl && windowImpl.__leapGetTaskRuntimeStats;
      }
      try {
        if (typeof getWindowStats === 'function') {
          var windowStats = getWindowStats();
          if (windowStats && typeof windowStats === 'object') {
            out.windowListenerCount = Number(windowStats.windowListenerCount || 0);
            out.rafCount = Number(windowStats.rafCount || 0);
            out.timeoutCount = Number(windowStats.timeoutCount || 0);
            out.intervalCount = Number(windowStats.intervalCount || 0);
            out.pendingTimerCount = Number(windowStats.pendingTimerCount || 0);
            out.placeholderXhrCreatedCount = Number(windowStats.placeholderXhrCreatedCount || 0);
            out.placeholderXhrFallbackCount = Number(windowStats.placeholderXhrFallbackCount || 0);
          }
        }
      } catch (_) {}
      var getMessageStats = runtimeStore && runtimeStore.messagePortGetStats;
      if (typeof getMessageStats !== 'function') {
        var messageChannelImpl = leapenv && leapenv.implRegistry && leapenv.implRegistry.MessageChannel;
        getMessageStats = messageChannelImpl && messageChannelImpl.__leapGetRuntimeStats;
      }
      try {
        if (typeof getMessageStats === 'function') {
          var messageStats = getMessageStats();
          if (messageStats && typeof messageStats === 'object') {
            out.messageChannelCount = Number(messageStats.messageChannelCount || 0);
            out.messagePortOpenCount = Number(messageStats.messagePortOpenCount || 0);
            out.messagePortClosedCount = Number(messageStats.messagePortClosedCount || 0);
            out.messagePortQueueCount = Number(messageStats.messagePortQueueCount || 0);
          }
        }
      } catch (_) {}
      return JSON.stringify(out);
    })();
    //# sourceURL=leapenv.worker.post-task-cleanup.js
  `;
}

const CLEANUP_FAILURE_LIMIT = toPositiveInteger(
  process.env.LEAP_WORKER_CLEANUP_FAIL_LIMIT,
  3
);

function shouldRecycleAfterCleanup(summary) {
  if (!summary || typeof summary !== 'object') {
    return false;
  }
  var runtimeStats = summary.runtimeStats && typeof summary.runtimeStats === 'object'
    ? summary.runtimeStats
    : summary;
  if (summary.cleanupError) {
    return true;
  }
  if (Number(summary.activeDocs || 0) > 0) {
    return true;
  }
  if (Number(summary.activeNodes || 0) > 0) {
    return true;
  }
  if (Number(summary.activeTasks || 0) > 0) {
    return true;
  }
  if (Number(runtimeStats.windowListenerCount || 0) > 0) {
    return true;
  }
  if (Number(runtimeStats.rafCount || 0) > 0) {
    return true;
  }
  if (Number(runtimeStats.pendingTimerCount || 0) > 0) {
    return true;
  }
  if (Number(runtimeStats.messageChannelCount || 0) > 0) {
    return true;
  }
  if (Number(runtimeStats.messagePortOpenCount || 0) > 0) {
    return true;
  }
  if (Number(runtimeStats.messagePortQueueCount || 0) > 0) {
    return true;
  }
  if (Number(runtimeStats.placeholderXhrFallbackCount || 0) > 0) {
    return true;
  }
  return Number(summary.cleanupFailureCount || 0) >= CLEANUP_FAILURE_LIMIT;
}

module.exports = {
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
  CLEANUP_FAILURE_LIMIT,
  shouldRecycleAfterCleanup
};
