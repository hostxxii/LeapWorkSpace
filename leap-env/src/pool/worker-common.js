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

// Build the post-task cleanup script string.
// Accepts safeTaskId (already JSON.stringify'd task ID string).
function buildPostTaskCleanupScript(safeTaskId) {
  return `
    (function () {
      var out = { releasedDocs: 0, releasedNodes: 0, activeDocs: 0, activeNodes: 0, activeTasks: 0 };
      var domService = (globalThis.leapenv && globalThis.leapenv.domShared)
        ? globalThis.leapenv.domShared
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
      return JSON.stringify(out);
    })();
    //# sourceURL=leapenv.worker.post-task-cleanup.js
  `;
}

const CLEANUP_FAILURE_LIMIT = toPositiveInteger(
  process.env.LEAP_WORKER_CLEANUP_FAIL_LIMIT,
  3
);

module.exports = {
  toPositiveInteger,
  getMemorySnapshot,
  serializeError,
  buildPostTaskCleanupScript,
  CLEANUP_FAILURE_LIMIT
};
