'use strict';

const fs = require('fs');
const path = require('path');
const {
  resolveRunOptions,
  loadLeapVm,
  configureHooks,
  loadBundle,
  maybeEnableInspector,
  runDebugPrelude,
  runEnvironmentBundle,
  executeSignatureTask,
  shutdownEnvironment
} = require('../runner');

const DEFAULT_BLACKLIST = [
  'hookRuntime',
  '__LEAP_BOOTSTRAP__',
  '__LEAP_HOST_TIMERS__',
  '__LEAP_HOOK_RUNTIME__',
  '__LEAP_DEBUG_JS_HOOKS_RUNTIME__',
  '__LEAP_DOM_BACKEND__',
  '__LEAP_SIGNATURE_PROFILE__',
  '__LEAP_TASK_ID__',
  '__LEAP_DISPATCH__',
  '__LEAP_DOM__'
];
const DEFAULT_WATCH_KEYS = [
  'leapenv',
  '__LEAP_DISPATCH__',
  '__LEAP_DOM__'
];
const DEFAULT_LEAPENV_BLACKLIST = [
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
const DEFAULT_LEAPENV_PUBLIC_KEYS = [
  'applyFingerprintSnapshot',
  'applyStorageSnapshot',
  'applyDocumentSnapshot',
  'resetSignatureTaskState',
  'loadSkeleton',
  'installConstructibleWindowWrappers'
];

function getArg(flag, fallback) {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) {
    return fallback;
  }
  return argv[idx + 1];
}

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function snapshotGlobalSurface(leapvm, label, watchKeys) {
  const watchInput = Array.isArray(watchKeys) ? watchKeys.slice() : [];
  const payload = leapvm.runScript(
    '(function (watchKeys) {' +
      'function toKeyString(k) {' +
        'if (typeof k === "symbol") {' +
          'var d = k.description;' +
          'return "Symbol(" + (d == null ? "" : String(d)) + ")";' +
        '}' +
        'return String(k);' +
      '}' +
      'var keys = Object.keys(globalThis).slice().sort();' +
      'var ownPropertyNames = Object.getOwnPropertyNames(globalThis).slice().sort();' +
      'var ownKeys = Reflect.ownKeys(globalThis).map(toKeyString).sort();' +
      'var leapenvKeys = (globalThis.leapenv && typeof globalThis.leapenv === "object")' +
        ' ? Object.keys(globalThis.leapenv).slice().sort()' +
        ' : [];' +
      'var inspected = [];' +
      'for (var i = 0; i < watchKeys.length; i++) {' +
        'var key = String(watchKeys[i]);' +
        'var desc = Object.getOwnPropertyDescriptor(globalThis, key);' +
        'inspected.push({' +
          'key: key,' +
          'inKeys: keys.indexOf(key) !== -1,' +
          'inOwnPropertyNames: ownPropertyNames.indexOf(key) !== -1,' +
          'inOwnKeys: ownKeys.indexOf(key) !== -1,' +
          'descriptor: desc ? {' +
            'enumerable: !!desc.enumerable,' +
            'configurable: !!desc.configurable,' +
            'writable: !!desc.writable' +
          '} : null' +
        '});' +
      '}' +
      'return JSON.stringify({' +
        'keys: keys,' +
        'ownPropertyNames: ownPropertyNames,' +
        'ownKeys: ownKeys,' +
        'leapenvKeys: leapenvKeys,' +
        'inspected: inspected' +
      '});' +
    '})(' + JSON.stringify(watchInput) + ')'
  );

  const parsed = JSON.parse(payload || '{}');
  return {
    label: label,
    capturedAt: new Date().toISOString(),
    keys: Array.isArray(parsed.keys) ? parsed.keys : [],
    ownPropertyNames: Array.isArray(parsed.ownPropertyNames) ? parsed.ownPropertyNames : [],
    ownKeys: Array.isArray(parsed.ownKeys) ? parsed.ownKeys : [],
    leapenvKeys: Array.isArray(parsed.leapenvKeys) ? parsed.leapenvKeys : [],
    inspected: Array.isArray(parsed.inspected) ? parsed.inspected : []
  };
}

function computeDiff(prev, next, field) {
  const a = new Set(prev[field] || []);
  const b = new Set(next[field] || []);
  const added = [];
  const removed = [];

  for (const key of b) {
    if (!a.has(key)) added.push(key);
  }
  for (const key of a) {
    if (!b.has(key)) removed.push(key);
  }

  added.sort();
  removed.sort();
  return { added, removed };
}

function detectBlacklistHits(snapshot, blacklist) {
  const keysSet = new Set(snapshot.keys || []);
  const namesSet = new Set(snapshot.ownPropertyNames || []);
  const ownKeysSet = new Set(snapshot.ownKeys || []);

  return blacklist.map((item) => {
    const inKeys = keysSet.has(item);
    const inOwnPropertyNames = namesSet.has(item);
    const inOwnKeys = ownKeysSet.has(item);
    return {
      key: item,
      inKeys,
      inOwnPropertyNames,
      inOwnKeys,
      present: inKeys || inOwnPropertyNames || inOwnKeys
    };
  });
}

function summarizeHits(hits) {
  return hits.filter((x) => x.present).map((x) => x.key);
}

function detectLeapenvHits(snapshot, blacklist) {
  const keysSet = new Set(snapshot.leapenvKeys || []);
  return (Array.isArray(blacklist) ? blacklist : []).map((item) => ({
    key: item,
    inLeapenvKeys: keysSet.has(item),
    present: keysSet.has(item)
  }));
}

function detectUnexpectedLeapenvPublicKeys(snapshot, allowed) {
  const allowSet = new Set(Array.isArray(allowed) ? allowed.map((x) => String(x)) : []);
  const keys = Array.isArray(snapshot.leapenvKeys) ? snapshot.leapenvKeys : [];
  const unexpected = [];
  for (let i = 0; i < keys.length; i++) {
    if (!allowSet.has(keys[i])) {
      unexpected.push(keys[i]);
    }
  }
  unexpected.sort();
  return unexpected;
}

function main() {
  const outPathArg = getArg('--out', '');
  const outPath = outPathArg
    ? path.resolve(process.cwd(), outPathArg)
    : path.join(__dirname, '..', 'global-surface-report.json');
  const domBackend = getArg('--dom-backend', 'dod');
  const signatureProfile = getArg('--signature-profile', 'fp-lean');
  const debug = hasFlag('--debug');
  const waitForInspector = hasFlag('--wait-inspector');
  const resourceName = getArg('--resource-name', 'global-surface.task.js');
  const targetScript = getArg('--target-script', 'void 0;');

  const stages = [];
  let leapvm = null;

  try {
    const resolved = resolveRunOptions({
      debug,
      waitForInspector,
      domBackend,
      signatureProfile,
      beforeRunScript: '',
      targetScript: ''
    });

    leapvm = loadLeapVm();
    configureHooks(leapvm, resolved);
    const envCode = loadBundle(resolved.bundlePath, resolved.bundleCode);
    maybeEnableInspector(leapvm, resolved);
    runDebugPrelude(leapvm, resolved);

    stages.push(snapshotGlobalSurface(leapvm, 'beforeBundle', DEFAULT_WATCH_KEYS));

    runEnvironmentBundle(leapvm, envCode);
    stages.push(snapshotGlobalSurface(leapvm, 'afterBundle', DEFAULT_WATCH_KEYS));
    stages.push(snapshotGlobalSurface(leapvm, 'beforeTask', DEFAULT_WATCH_KEYS));

    executeSignatureTask(leapvm, {
      taskId: 'global-surface-task',
      targetScript,
      resourceName
    });

    stages.push(snapshotGlobalSurface(leapvm, 'afterTask', DEFAULT_WATCH_KEYS));

    const transitions = [];
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1];
      const next = stages[i];
      transitions.push({
        from: prev.label,
        to: next.label,
        keys: computeDiff(prev, next, 'keys'),
        ownPropertyNames: computeDiff(prev, next, 'ownPropertyNames'),
        ownKeys: computeDiff(prev, next, 'ownKeys')
      });
    }

    const blacklistMatrix = stages.map((stage) => ({
      stage: stage.label,
      hits: detectBlacklistHits(stage, DEFAULT_BLACKLIST)
    }));
    const watchMatrix = stages.map((stage) => ({
      stage: stage.label,
      inspected: stage.inspected || []
    }));
    const leapenvMatrix = stages.map((stage) => ({
      stage: stage.label,
      hits: detectLeapenvHits(stage, DEFAULT_LEAPENV_BLACKLIST)
    }));
    const leapenvPublicMatrix = stages.map((stage) => ({
      stage: stage.label,
      keys: stage.leapenvKeys || [],
      unexpected: detectUnexpectedLeapenvPublicKeys(stage, DEFAULT_LEAPENV_PUBLIC_KEYS)
    }));

    const report = {
      generatedAt: new Date().toISOString(),
      options: {
        domBackend,
        signatureProfile,
        debug,
        waitForInspector,
        resourceName
      },
      blacklist: DEFAULT_BLACKLIST,
      leapenvBlacklist: DEFAULT_LEAPENV_BLACKLIST,
      leapenvPublicAllowlist: DEFAULT_LEAPENV_PUBLIC_KEYS,
      stages,
      transitions,
      blacklistMatrix,
      watchKeys: DEFAULT_WATCH_KEYS,
      watchMatrix,
      leapenvMatrix,
      leapenvPublicMatrix
    };

    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

    console.log('[global-surface] report:', outPath);
    for (let i = 0; i < blacklistMatrix.length; i++) {
      const row = blacklistMatrix[i];
      const present = summarizeHits(row.hits);
      console.log('[global-surface] ' + row.stage + ' blacklist-present:', present.length ? present.join(', ') : '(none)');
    }
    for (let i = 0; i < leapenvMatrix.length; i++) {
      const row = leapenvMatrix[i];
      const present = summarizeHits(row.hits);
      console.log('[global-surface] ' + row.stage + ' leapenv-blacklist-present:', present.length ? present.join(', ') : '(none)');
    }
    for (let i = 0; i < leapenvPublicMatrix.length; i++) {
      const row = leapenvPublicMatrix[i];
      console.log('[global-surface] ' + row.stage + ' leapenv-public-count:', row.keys.length);
      console.log('[global-surface] ' + row.stage + ' leapenv-unexpected-public:', row.unexpected.length ? row.unexpected.join(', ') : '(none)');
    }
  } finally {
    if (leapvm) {
      try { shutdownEnvironment(leapvm); } catch (_) {}
    }
  }
}

main();
