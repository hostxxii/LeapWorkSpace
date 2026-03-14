'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runJsonWithPreloadedTarget } = require('./standalone-preload-helper');

// 不应出现在 globalThis 上的内部 key
const GLOBAL_BLACKLIST = [
  'hookRuntime',
  '__LEAP_BOOTSTRAP__',
  '__LEAP_HOST_TIMERS__',
  '__LEAP_HOOK_RUNTIME__',
  '__LEAP_DEBUG_JS_HOOKS_RUNTIME__',
  '__LEAP_DOM_BACKEND__',
  '__LEAP_TASK_ID__',
  '__LEAP_DISPATCH__',
  '__LEAP_DOM__'
];

// 不应暴露给目标代码的 leapenv 内部 key
const LEAPENV_BLACKLIST = [
  '__runtime',
  '_runtimeInitialized',
  'getRuntimeStore',
  'getRuntimeConfig',
  'getHostTimers',
  'getHookRuntime',
  'getTaskState',
  'beginTask',
  'endTask',
  'getCurrentTaskId',
  'domShared'
];

// 允许存在的 leapenv 公共 key
const LEAPENV_PUBLIC_ALLOWLIST = [
  'applyFingerprintSnapshot',
  'applyStorageSnapshot',
  'applyDocumentSnapshot',
  'resetSignatureTaskState',
  'loadSkeleton',
  'installConstructibleWindowWrappers'
];

// 观察的关键 key
const WATCH_KEYS = [
  'leapenv',
  '__LEAP_DISPATCH__',
  '__LEAP_DOM__'
];

function parseJson(raw, label) {
  try {
    return JSON.parse(String(raw));
  } catch (err) {
    err.message = `[${label}] JSON parse failed: ${err.message}\nraw=${raw}`;
    throw err;
  }
}

function getArg(flag, fallback) {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(flag);
  return (idx !== -1 && idx + 1 < argv.length) ? argv[idx + 1] : fallback;
}

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

async function main() {
  const outPathArg = getArg('--out', '');
  const outPath = outPathArg
    ? path.resolve(process.cwd(), outPathArg)
    : path.join(__dirname, '..', '..', '..', 'leap-env', 'global-surface-report.json');

  const snapshot = parseJson(await runJsonWithPreloadedTarget(`
      (function () {
        function toKeyString(k) {
          if (typeof k === 'symbol') {
            var d = k.description;
            return 'Symbol(' + (d == null ? '' : String(d)) + ')';
          }
          return String(k);
        }

        var keys = Object.keys(globalThis).slice().sort();
        var ownPropertyNames = Object.getOwnPropertyNames(globalThis).slice().sort();
        var ownKeys = Reflect.ownKeys(globalThis).map(toKeyString).sort();
        var leapenvKeys = (globalThis.leapenv && typeof globalThis.leapenv === 'object')
          ? Object.keys(globalThis.leapenv).slice().sort()
          : [];

        var watchKeys = ${JSON.stringify(WATCH_KEYS)};
        var inspected = [];
        for (var i = 0; i < watchKeys.length; i++) {
          var key = String(watchKeys[i]);
          var desc = Object.getOwnPropertyDescriptor(globalThis, key);
          inspected.push({
            key: key,
            inKeys: keys.indexOf(key) !== -1,
            inOwnPropertyNames: ownPropertyNames.indexOf(key) !== -1,
            inOwnKeys: ownKeys.indexOf(key) !== -1,
            descriptor: desc ? {
              enumerable: !!desc.enumerable,
              configurable: !!desc.configurable,
              writable: !!desc.writable
            } : null
          });
        }

        return JSON.stringify({
          keys: keys,
          ownPropertyNames: ownPropertyNames,
          ownKeys: ownKeys,
          leapenvKeys: leapenvKeys,
          inspected: inspected
        });
      })()`,
      {
        taskId: 'global-surface-probe',
      },
      { debug: false },
      'global-surface-probe'
    ), 'global-surface-probe');

    // ── 断言：globalThis 黑名单 ──
    const keysSet = new Set(snapshot.keys || []);
    const namesSet = new Set(snapshot.ownPropertyNames || []);
    const ownKeysSet = new Set(snapshot.ownKeys || []);

    const globalHits = [];
    for (const key of GLOBAL_BLACKLIST) {
      if (keysSet.has(key) || namesSet.has(key) || ownKeysSet.has(key)) {
        globalHits.push(key);
      }
    }
    assert.deepStrictEqual(globalHits, [],
      'globalThis should not expose internal keys: ' + globalHits.join(', '));

    // ── 断言：leapenv 内部 key 不应暴露 ──
    const leapenvKeysSet = new Set(snapshot.leapenvKeys || []);
    const leapenvHits = [];
    for (const key of LEAPENV_BLACKLIST) {
      if (leapenvKeysSet.has(key)) {
        leapenvHits.push(key);
      }
    }
    assert.deepStrictEqual(leapenvHits, [],
      'leapenv should not expose internal keys: ' + leapenvHits.join(', '));

    // ── 断言：leapenv 不应有意外的公共 key ──
    const allowSet = new Set(LEAPENV_PUBLIC_ALLOWLIST);
    const unexpected = (snapshot.leapenvKeys || []).filter(k => !allowSet.has(k));
    assert.deepStrictEqual(unexpected, [],
      'leapenv has unexpected public keys: ' + unexpected.join(', '));

    // ── 断言：watch keys 描述符 ──
    for (const item of (snapshot.inspected || [])) {
      if (item.key === 'leapenv') {
        assert.ok(item.descriptor, 'leapenv should exist on globalThis');
        assert.strictEqual(item.descriptor.enumerable, false,
          'leapenv should be non-enumerable');
      }
      if (item.key === '__LEAP_DISPATCH__') {
        assert.strictEqual(item.inKeys, false,
          '__LEAP_DISPATCH__ should not be in Object.keys');
      }
      if (item.key === '__LEAP_DOM__') {
        assert.strictEqual(item.inKeys, false,
          '__LEAP_DOM__ should not be in Object.keys');
      }
    }

    // ── 写报告 ──
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'standalone',
      globalBlacklist: GLOBAL_BLACKLIST,
      leapenvBlacklist: LEAPENV_BLACKLIST,
      leapenvPublicAllowlist: LEAPENV_PUBLIC_ALLOWLIST,
      snapshot,
      globalHits,
      leapenvHits,
      unexpectedPublicKeys: unexpected
    };
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    console.log('[global-surface] report:', outPath);
    console.log('[global-surface] global blacklist hits:', globalHits.length ? globalHits.join(', ') : '(none)');
    console.log('[global-surface] leapenv blacklist hits:', leapenvHits.length ? leapenvHits.join(', ') : '(none)');
    console.log('[global-surface] leapenv unexpected public:', unexpected.length ? unexpected.join(', ') : '(none)');
    console.log('[global-surface] PASS');
}

main().catch((err) => {
  console.error('[global-surface] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
