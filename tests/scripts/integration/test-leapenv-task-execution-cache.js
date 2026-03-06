const assert = require('assert');
const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment
} = require('../../../leap-env/runner');

function parseJson(raw, label) {
  try {
    return JSON.parse(String(raw));
  } catch (error) {
    error.message = `[${label}] JSON parse failed: ${error.message}\nraw=${raw}`;
    throw error;
  }
}

const LARGE_PREFIX = '/*' + 'x'.repeat(40 * 1024) + '*/\n';
const RESOURCE_NAME = 'large-cache-probe.js';
const TARGET_SCRIPT = LARGE_PREFIX + `
  (function () {
    return JSON.stringify({
      taskId: (globalThis.leapenv && typeof globalThis.leapenv.getCurrentTaskId === 'function')
        ? String(globalThis.leapenv.getCurrentTaskId())
        : '',
      href: String(location.href),
      userAgent: String(navigator.userAgent),
      cookie: String(document.cookie),
      innerWidth: Number(window.innerWidth),
      localToken: localStorage.getItem('token'),
      sessionToken: sessionStorage.getItem('token')
    });
  })();
`;

function runTask(leapvm, taskId, siteProfile) {
  const raw = executeSignatureTask(leapvm, {
    taskId,
    resourceName: RESOURCE_NAME,
    targetScript: TARGET_SCRIPT,
    siteProfile
  });
  return parseJson(raw, taskId);
}

function main() {
  let ctx;
  try {
    ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });

    const resultA = runTask(ctx.leapvm, 'cache-task-A', {
      fingerprintSnapshot: {
        location: {
          href: 'https://cache-a.example.test/path?a=1#ha'
        },
        navigator: {
          userAgent: 'Cache-UA-A/1.0'
        },
        windowMetrics: {
          innerWidth: 111
        }
      },
      storagePolicy: {
        localStorage: 'replace',
        sessionStorage: 'replace'
      },
      storageSnapshot: {
        localStorage: {
          token: 'alpha'
        },
        sessionStorage: {
          token: 'alpha-session'
        }
      },
      documentSnapshot: {
        cookie: 'sid=A'
      }
    });

    const resultB = runTask(ctx.leapvm, 'cache-task-B', {
      fingerprintSnapshot: {
        location: {
          href: 'https://cache-b.example.test/path?b=2#hb'
        },
        navigator: {
          userAgent: 'Cache-UA-B/2.0'
        },
        windowMetrics: {
          innerWidth: 222
        }
      },
      storagePolicy: {
        localStorage: 'replace',
        sessionStorage: 'replace'
      },
      storageSnapshot: {
        localStorage: {
          token: 'beta'
        },
        sessionStorage: {
          token: 'beta-session'
        }
      },
      documentSnapshot: {
        cookie: 'sid=B'
      }
    });

    assert.deepStrictEqual(resultA, {
      taskId: 'cache-task-A',
      href: 'https://cache-a.example.test/path?a=1#ha',
      userAgent: 'Cache-UA-A/1.0',
      cookie: 'sid=A',
      innerWidth: 111,
      localToken: 'alpha',
      sessionToken: 'alpha-session'
    });

    assert.deepStrictEqual(resultB, {
      taskId: 'cache-task-B',
      href: 'https://cache-b.example.test/path?b=2#hb',
      userAgent: 'Cache-UA-B/2.0',
      cookie: 'sid=B',
      innerWidth: 222,
      localToken: 'beta',
      sessionToken: 'beta-session'
    });

    const cacheState = ctx.leapvm.__leapTaskExecutionCache;
    assert.ok(cacheState && cacheState.targetScriptsByResource instanceof Map, 'cache state should exist on leapvm');
    const resourceMap = cacheState.targetScriptsByResource.get(RESOURCE_NAME);
    assert.ok(resourceMap instanceof Map, 'resource cache map should exist');
    assert.strictEqual(resourceMap.size, 1, 'same large target script should reuse one cache entry');
    const cacheEntry = Array.from(resourceMap.values())[0];
    assert.ok(cacheEntry, 'cache entry should be addressable by target source');
    assert.strictEqual(cacheEntry.cacheReady, true, 'large target script should build code cache');
    assert.ok(Buffer.isBuffer(cacheEntry.codeCache), 'cache entry should keep code cache buffer');

    console.log('[test-leapenv-task-execution-cache] PASS');
  } finally {
    shutdownEnvironment(ctx && ctx.leapvm);
  }
}

main();
