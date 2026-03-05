const fs = require('fs');
const path = require('path');
const { hostLog } = require('./src/instance/host-log');

const DEFAULT_OBJECT_BLACKLIST = [
  'console',
  'Object', 'Function', 'Array', 'String', 'Number', 'Boolean',
  'Symbol', 'BigInt', 'Math', 'Date', 'RegExp', 'Error',
  'Map', 'WeakMap', 'Set', 'WeakSet',
  'Promise', 'Proxy', 'Reflect',
  'JSON', 'Intl',
  'ArrayBuffer', 'DataView',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
  'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array'
];

// 'then'/'toString'/'valueOf' 已从黑名单移除：重入守卫（g_in_native_wrapper_hook）
// 从根本上阻断递归，这些属性现在可以被正常拦截和记录。
// 'constructor'/'prototype' 访问频率高但信息量低，暂时保留减少噪音。
const DEFAULT_PROPERTY_BLACKLIST = ['constructor', 'prototype'];
const DEFAULT_PREFIX_BLACKLIST = ['__'];

// C++ builtin wrapper config (§10.B/C migration plan).
// `targets` defines which builtins to intercept.
// Disabled by default; enable via options.debugCppWrapperRules = { enabled: true, ... }.
const DEFAULT_DEBUG_CPP_WRAPPER_RULES = {
  enabled: false,
  phase: 'task',
  operations: ['call', 'return', 'throw'],
  whitelist: {
    apiNames: [],
    apiPrefixes: []
  },
  blacklist: {
    apiNames: ["Object.defineProperty"],
    apiPrefixes: []
  },
  maxPerApi: null,
  // ── Builtin wrapper targets ──────────────────────────────────────
  // 按优先级分层，先全量开启再用 blacklist 收紧。
  // 参见：检测点与对应函数映射.md
  targets: [
    // ── P0：核心检测点 ─────────────────────────────────────────────
    // Hook 伪装 & descriptor
    { name: 'Function.prototype.toString',     path: 'Function.prototype.toString' },
    { name: 'Object.getOwnPropertyDescriptor', path: 'Object.getOwnPropertyDescriptor' },
    { name: 'Object.getOwnPropertyDescriptors',path: 'Object.getOwnPropertyDescriptors' },
    { name: 'Object.getOwnPropertyNames',      path: 'Object.getOwnPropertyNames' },
    { name: 'Object.getOwnPropertySymbols',    path: 'Object.getOwnPropertySymbols' },
    { name: 'Object.keys',                     path: 'Object.keys' },
    { name: 'Reflect.ownKeys',                 path: 'Reflect.ownKeys' },
    { name: 'Reflect.getOwnPropertyDescriptor',path: 'Reflect.getOwnPropertyDescriptor' },
    // 原型链
    { name: 'Object.getPrototypeOf',           path: 'Object.getPrototypeOf' },
    { name: 'Reflect.getPrototypeOf',          path: 'Reflect.getPrototypeOf' },
    { name: 'Object.prototype.hasOwnProperty', path: 'Object.prototype.hasOwnProperty' },
    // toString / 类型标签
    { name: 'Object.prototype.toString',       path: 'Object.prototype.toString' },
    // stack.toString() 常见落到 String.prototype.toString（stack 多数是字符串）
    { name: 'String.prototype.toString',       path: 'String.prototype.toString' },
    { name: 'Error.prototype.toString',        path: 'Error.prototype.toString' },
    // JSON & 编码
    { name: 'eval',                            path: 'eval' },
    // 时间 & 定时
    { name: 'Date.now',                        path: 'Date.now' },
    { name: 'Date.prototype.getTime',          path: 'Date.prototype.getTime' },
    { name: 'performance.now',                 path: 'performance.now' },
    { name: 'setTimeout',                      path: 'setTimeout' },
    { name: 'clearTimeout',                    path: 'clearTimeout' },
    { name: 'setInterval',                     path: 'setInterval' },
    { name: 'clearInterval',                   path: 'clearInterval' },
    // 异步 & 错误
    { name: 'Promise.prototype.then',          path: 'Promise.prototype.then' },
    { name: 'Error',                           path: 'Error' },
    // Symbol
    { name: 'Symbol.for',                      path: 'Symbol.for' },
    { name: 'Symbol.keyFor',                   path: 'Symbol.keyFor' },
    // 属性定义 / 反篡改
    { name: 'Object.defineProperty',           path: 'Object.defineProperty' },

    // P1/P2 默认关闭：这些 API 调用频率过高，容易导致 DevTools 卡顿。
    // 如需排查特定问题，可在 run-work-leapvm.js 中按需覆写 debugCppWrapperRules.targets 临时开启。
  ]
};

const DEFAULT_TARGET_SCRIPT = `
  console.log('--------------------------------');
  console.log('[Target] Script Started');
  console.log('[Target] UA:', navigator.userAgent);
  console.log('[Target] Platform:', navigator.platform);
  console.log('[Target] Language:', navigator.language);
  window.testProp = 123;
  var w = window.innerWidth;
  console.log('[Target] innerWidth:', w);
  console.log('[Target] Script Finished');
  console.log('--------------------------------');
`;

function normalizeDomBackend() {
  return 'dod';
}

function normalizeSignatureProfile(raw) {
  const normalized = String(raw == null ? '' : raw).trim().toLowerCase();
  return normalized === 'fp-occupy' ? 'fp-occupy' : 'fp-lean';
}

const DEFAULT_HARDENING_MODE = 'strict';

function buildBootstrapPayload(options = {}) {
  return {
    domBackend: normalizeDomBackend(options.domBackend),
    signatureProfile: normalizeSignatureProfile(options.signatureProfile),
    bridgeExposureMode: DEFAULT_HARDENING_MODE,
    globalFacadeMode: DEFAULT_HARDENING_MODE,
    debugEnabled: !!options.debug,
    hookRuntimeSeed: {
      active: false,
      phase: 'bundle'
    }
  };
}

function resolveRunOptions(options = {}) {
  const defaultBundlePath = path.join(__dirname, 'src', 'build', 'dist', 'leap.bundle.js');
  const domBackend = normalizeDomBackend(
    options.domBackend != null ? options.domBackend : process.env.LEAP_DOM_BACKEND
  );
  const signatureProfile = normalizeSignatureProfile(
    options.signatureProfile != null ? options.signatureProfile : process.env.LEAP_SIGNATURE_PROFILE
  );
  return {
    debug: false,
    waitForInspector: false,
    beforeRunScript: '',
    targetScript: DEFAULT_TARGET_SCRIPT,
    debugCppWrapperRules: options.debugCppWrapperRules || DEFAULT_DEBUG_CPP_WRAPPER_RULES,
    ...options,
    bundlePath: options.bundlePath || defaultBundlePath,
    domBackend,
    signatureProfile
  };
}

function resolveLeapVmEntry() {
  if (process.env.LEAP_VM_PACKAGE_PATH) {
    return path.resolve(process.env.LEAP_VM_PACKAGE_PATH);
  }

  const workspacePackagePath = path.resolve(__dirname, '../leap-vm');
  if (fs.existsSync(workspacePackagePath)) {
    return workspacePackagePath;
  }

  return 'leap-vm';
}

function loadLeapVm() {
  const entry = resolveLeapVmEntry();
  hostLog('info', `Loading leap-vm from unified package entry: ${entry}`);
  return require(entry);
}

function configureHooks(leapvm, options = {}) {
  hostLog('info', 'Configuring Hook rules...');

  // Blacklist is always applied (low overhead; prevents accidental recursion
  // into JS builtins regardless of debug mode).
  leapvm.setPropertyBlacklist(
    DEFAULT_OBJECT_BLACKLIST,
    DEFAULT_PROPERTY_BLACKLIST,
    DEFAULT_PREFIX_BLACKLIST
  );

  // 所有非黑名单 Skeleton 对象的 GET/SET/CALL 均输出日志。
  if (options.debug) {
    leapvm.setMonitorEnabled(true);
  }

  // C++ builtin wrapper subsystem (independent of debug mode; opt-in via enabled:true).
  // Shallow-merge user config with defaults so partial overrides (e.g. {enabled:true})
  // still pick up default targets/phase/operations.
  const cppWrapperRules = options.debugCppWrapperRules
    ? { ...DEFAULT_DEBUG_CPP_WRAPPER_RULES, ...options.debugCppWrapperRules }
    : DEFAULT_DEBUG_CPP_WRAPPER_RULES;
  if (cppWrapperRules.enabled) {
    if (typeof leapvm.installBuiltinWrappers === 'function') {
      hostLog('info', 'Installing C++ builtin wrappers...');
      leapvm.installBuiltinWrappers(cppWrapperRules);
    } else {
      hostLog('warn', 'debugCppWrapperRules.enabled=true but leap-vm does not export installBuiltinWrappers(); C++ wrapper hooks were skipped.');
    }
  }
}

function loadBundle(bundlePath, bundleCode) {
  if (bundleCode && typeof bundleCode === 'string') {
    hostLog('info', 'Using pre-loaded environment bundle (skipping disk read).');
    return bundleCode;
  }
  hostLog('info', 'Loading environment bundle...');
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Bundle not found at ${bundlePath}. Run \`npm run build\` first.`);
  }
  return fs.readFileSync(bundlePath, 'utf8');
}

function maybeEnableInspector(leapvm, options) {
  if (!options.debug) return null;
  if (typeof leapvm.enableInspector !== 'function') {
    hostLog('warn', 'Inspector API is not available in current leap-vm build.');
    return null;
  }

  hostLog('info', 'Enabling V8 Inspector...');
  const inspectorInfo = leapvm.enableInspector();
  const wsPath = `/${inspectorInfo.targetId}`;
  hostLog('info', `Inspector listening on ws://127.0.0.1:${inspectorInfo.port}${wsPath}`);
  hostLog('info', `Open DevTools: devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${inspectorInfo.port}${wsPath}`);
  hostLog('info', `Inspector targets: http://127.0.0.1:${inspectorInfo.port}/json/list`);

  if (options.waitForInspector && typeof leapvm.waitForInspectorConnection === 'function') {
    hostLog('info', 'Waiting for Inspector connection...');
    leapvm.waitForInspectorConnection();
    hostLog('info', 'Inspector connected, starting execution...');
  }

  return inspectorInfo;
}

function runDebugPrelude(leapvm, options = {}) {
  const bootstrapPayload = buildBootstrapPayload(options);
  const debugPrelude = `
    (function () {
      try {
        var localConsole = (typeof console !== 'undefined') ? console : {};
        localConsole.log = localConsole.log || function(){};
        localConsole.warn = localConsole.warn || function(){};
        localConsole.error = localConsole.error || function(){};
        localConsole.info = localConsole.info || function(){};
        Object.defineProperty(globalThis, 'console', {
          value: localConsole,
          writable: true,
          configurable: false,
          enumerable: true
        });
        if (typeof globalThis.leapenv === 'undefined') {
          globalThis.leapenv = {};
        }
        Object.defineProperty(globalThis, 'leapenv', {
          value: globalThis.leapenv,
          writable: true,
          enumerable: false,
          configurable: true
        });
        var leapenvOwnKeys = Object.keys(globalThis.leapenv || {});
        for (var i = 0; i < leapenvOwnKeys.length; i++) {
          var key = leapenvOwnKeys[i];
          try {
            var desc = Object.getOwnPropertyDescriptor(globalThis.leapenv, key);
            if (!desc) continue;
            if (!desc.configurable && desc.enumerable) continue;
            if ((desc.get || desc.set)) {
              Object.defineProperty(globalThis.leapenv, key, {
                get: desc.get,
                set: desc.set,
                enumerable: false,
                configurable: desc.configurable
              });
            } else {
              Object.defineProperty(globalThis.leapenv, key, {
                value: desc.value,
                writable: desc.writable,
                enumerable: false,
                configurable: desc.configurable
              });
            }
          } catch (_) {}
        }
        var bootstrap = ${JSON.stringify(bootstrapPayload)};
        bootstrap.hostTimers = {
          setTimeout: (typeof globalThis.setTimeout === 'function') ? globalThis.setTimeout.bind(globalThis) : null,
          clearTimeout: (typeof globalThis.clearTimeout === 'function') ? globalThis.clearTimeout.bind(globalThis) : null,
          setInterval: (typeof globalThis.setInterval === 'function') ? globalThis.setInterval.bind(globalThis) : null,
          clearInterval: (typeof globalThis.clearInterval === 'function') ? globalThis.clearInterval.bind(globalThis) : null
        };
        try {
          Object.defineProperty(globalThis.leapenv, '__runtimeBootstrap', {
            value: bootstrap,
            writable: true,
            configurable: true,
            enumerable: false
          });
        } catch (_) {
          globalThis.leapenv.__runtimeBootstrap = bootstrap;
        }
      } catch (e) {}
    })();
    //# sourceURL=leapenv.debug.prelude.js
  `;

  leapvm.runScript(debugPrelude);
}

function applyDomBackendSetting(leapvm, domBackend) {
  const backend = normalizeDomBackend(domBackend);
  leapvm.runScript(`
    (function () {
      var bootstrap =
        (globalThis.leapenv && globalThis.leapenv.__runtimeBootstrap) ||
        globalThis.__LEAP_BOOTSTRAP__;
      if (!bootstrap || typeof bootstrap !== 'object') {
        bootstrap = {};
      }
      bootstrap.domBackend = ${JSON.stringify(backend)};
      if (globalThis.leapenv) {
        try {
          Object.defineProperty(globalThis.leapenv, '__runtimeBootstrap', {
            value: bootstrap,
            writable: true,
            configurable: true,
            enumerable: false
          });
        } catch (_) {
          globalThis.leapenv.__runtimeBootstrap = bootstrap;
        }
      }
    })();
    //# sourceURL=leapenv.dom-backend.prelude.js
  `);
}

function applySignatureProfileSetting(leapvm, signatureProfile) {
  const profile = normalizeSignatureProfile(signatureProfile);
  leapvm.runScript(`
    (function () {
      var bootstrap =
        (globalThis.leapenv && globalThis.leapenv.__runtimeBootstrap) ||
        globalThis.__LEAP_BOOTSTRAP__;
      if (!bootstrap || typeof bootstrap !== 'object') {
        bootstrap = {};
      }
      bootstrap.signatureProfile = ${JSON.stringify(profile)};
      if (globalThis.leapenv) {
        try {
          Object.defineProperty(globalThis.leapenv, '__runtimeBootstrap', {
            value: bootstrap,
            writable: true,
            configurable: true,
            enumerable: false
          });
        } catch (_) {
          globalThis.leapenv.__runtimeBootstrap = bootstrap;
        }
      }
    })();
    //# sourceURL=leapenv.signature-profile.prelude.js
  `);
}

function runEnvironmentBundle(leapvm, envCode, bundleCodeCache) {
  const wrappedEnv =
    "try {\n" +
    envCode +
    "\n} catch (e) { try { globalThis.__envError = e; } catch(_) {} if (typeof console !== 'undefined' && console && typeof console.error === 'function') { console.error('[env error]', e && e.stack ? e.stack : e); } throw e; }\n//# sourceURL=leapenv.bundle.exec.js";

  // bundleCodeCache may arrive as Uint8Array after worker_threads postMessage.
  const cacheBuffer = bundleCodeCache
    ? (Buffer.isBuffer(bundleCodeCache) ? bundleCodeCache : Buffer.from(bundleCodeCache))
    : null;
  if (cacheBuffer && cacheBuffer.length > 0 &&
      typeof leapvm.runScriptWithCache === 'function') {
    leapvm.runScriptWithCache(wrappedEnv, cacheBuffer, 'leapenv.bundle.exec.js');
  } else {
    leapvm.runScript(wrappedEnv);
  }
}

function runBeforeScript(leapvm, beforeRunScript) {
  if (!beforeRunScript || !beforeRunScript.trim()) {
    return;
  }
  leapvm.runScript(beforeRunScript);
}

function runTargetScript(leapvm, targetScript) {
  if (!targetScript || !targetScript.trim()) {
    return '';
  }

  hostLog('info', 'Executing target script...');
  return leapvm.runScript(targetScript);
}


function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepCloneJsonLike(value) {
  if (Array.isArray(value)) {
    return value.map((v) => deepCloneJsonLike(v));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out = {};
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = deepCloneJsonLike(value[keys[i]]);
  }
  return out;
}

function deepMergeReplaceArrays(base, override) {
  if (override === undefined) {
    return deepCloneJsonLike(base);
  }
  if (Array.isArray(override)) {
    return override.map((v) => deepCloneJsonLike(v));
  }
  if (!isPlainObject(override)) {
    return override;
  }
  const out = isPlainObject(base) ? deepCloneJsonLike(base) : {};
  const keys = Object.keys(override);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const next = override[key];
    const prev = out[key];
    out[key] = deepMergeReplaceArrays(prev, next);
  }
  return out;
}

function hasOwnPath(obj, dottedPath) {
  if (!isPlainObject(obj) || typeof dottedPath !== 'string' || !dottedPath) {
    return false;
  }
  const parts = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (!cur || (typeof cur !== 'object' && typeof cur !== 'function')) return false;
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return false;
    cur = cur[key];
  }
  return cur !== undefined;
}

function normalizeOverrideMode(raw) {
  return String(raw == null ? 'merge' : raw).trim().toLowerCase() === 'strict'
    ? 'strict'
    : 'merge';
}

function validateStringArray(value, pathLabel) {
  if (!Array.isArray(value)) {
    throw new Error(`siteProfile invalid ${pathLabel}: expected string[]`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new Error(`siteProfile invalid ${pathLabel}[${i}]: expected string`);
    }
  }
}

function validateStorageMap(value, pathLabel) {
  if (value == null) return;
  if (!isPlainObject(value)) {
    throw new Error(`siteProfile invalid ${pathLabel}: expected object or null`);
  }
}

function validateSiteProfile(rawSiteProfile) {
  if (rawSiteProfile === undefined) return undefined;
  if (!isPlainObject(rawSiteProfile)) {
    throw new Error('siteProfile must be a plain object');
  }
  const siteProfile = deepCloneJsonLike(rawSiteProfile);
  siteProfile.overrideMode = normalizeOverrideMode(siteProfile.overrideMode);

  if (siteProfile.overrideMode === 'strict') {
    if (!Array.isArray(siteProfile.requiredFields) || siteProfile.requiredFields.length === 0) {
      throw new Error('siteProfile(strict) requires non-empty requiredFields');
    }
    for (let i = 0; i < siteProfile.requiredFields.length; i++) {
      if (typeof siteProfile.requiredFields[i] !== 'string' || !siteProfile.requiredFields[i]) {
        throw new Error(`siteProfile requiredFields[${i}] must be a non-empty string`);
      }
    }
    const missing = [];
    for (let i = 0; i < siteProfile.requiredFields.length; i++) {
      const pathExpr = siteProfile.requiredFields[i];
      if (!hasOwnPath(siteProfile, pathExpr)) {
        missing.push(pathExpr);
      }
    }
    if (missing.length > 0) {
      throw new Error(`siteProfile(strict) missing required fields: ${missing.join(', ')}`);
    }
  }

  if (isPlainObject(siteProfile.fingerprintSnapshot) &&
      isPlainObject(siteProfile.fingerprintSnapshot.navigator) &&
      Object.prototype.hasOwnProperty.call(siteProfile.fingerprintSnapshot.navigator, 'languages')) {
    validateStringArray(siteProfile.fingerprintSnapshot.navigator.languages, 'fingerprintSnapshot.navigator.languages');
  }

  if (Object.prototype.hasOwnProperty.call(siteProfile, 'storageSnapshot')) {
    if (!isPlainObject(siteProfile.storageSnapshot)) {
      throw new Error('siteProfile.storageSnapshot must be an object');
    }
    if (Object.prototype.hasOwnProperty.call(siteProfile.storageSnapshot, 'localStorage')) {
      validateStorageMap(siteProfile.storageSnapshot.localStorage, 'storageSnapshot.localStorage');
    }
    if (Object.prototype.hasOwnProperty.call(siteProfile.storageSnapshot, 'sessionStorage')) {
      validateStorageMap(siteProfile.storageSnapshot.sessionStorage, 'storageSnapshot.sessionStorage');
    }
  }

  if (Object.prototype.hasOwnProperty.call(siteProfile, 'documentSnapshot')) {
    if (!isPlainObject(siteProfile.documentSnapshot)) {
      throw new Error('siteProfile.documentSnapshot must be an object');
    }
    if (Object.prototype.hasOwnProperty.call(siteProfile.documentSnapshot, 'cookie')) {
      const cookieVal = siteProfile.documentSnapshot.cookie;
      if (!(cookieVal === null || typeof cookieVal === 'string')) {
        throw new Error('siteProfile.documentSnapshot.cookie must be string or null');
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(siteProfile, 'storagePolicy')) {
    if (!isPlainObject(siteProfile.storagePolicy)) {
      throw new Error('siteProfile.storagePolicy must be an object');
    }
    const names = ['localStorage', 'sessionStorage'];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (!Object.prototype.hasOwnProperty.call(siteProfile.storagePolicy, name)) continue;
      const mode = String(siteProfile.storagePolicy[name] == null ? '' : siteProfile.storagePolicy[name]).trim().toLowerCase();
      if (mode !== 'replace' && mode !== 'merge') {
        throw new Error(`siteProfile.storagePolicy.${name} must be 'replace' or 'merge'`);
      }
      siteProfile.storagePolicy[name] = mode;
    }
  }

  return siteProfile;
}

function buildEffectiveTaskOverrides(resolvedTask) {
  const siteProfile = validateSiteProfile(
    Object.prototype.hasOwnProperty.call(resolvedTask, 'siteProfile') ? resolvedTask.siteProfile : undefined
  );
  const explicitFingerprintSnapshot = Object.prototype.hasOwnProperty.call(resolvedTask, 'fingerprintSnapshot')
    ? resolvedTask.fingerprintSnapshot
    : undefined;
  const explicitStorageSnapshot = Object.prototype.hasOwnProperty.call(resolvedTask, 'storageSnapshot')
    ? resolvedTask.storageSnapshot
    : undefined;
  const explicitDocumentSnapshot = Object.prototype.hasOwnProperty.call(resolvedTask, 'documentSnapshot')
    ? resolvedTask.documentSnapshot
    : undefined;
  const explicitStoragePolicy = Object.prototype.hasOwnProperty.call(resolvedTask, 'storagePolicy')
    ? resolvedTask.storagePolicy
    : undefined;

  const fingerprintSnapshot = deepMergeReplaceArrays(
    siteProfile && siteProfile.fingerprintSnapshot,
    explicitFingerprintSnapshot
  );
  const storageSnapshot = deepMergeReplaceArrays(
    siteProfile && siteProfile.storageSnapshot,
    explicitStorageSnapshot
  );
  const documentSnapshot = deepMergeReplaceArrays(
    siteProfile && siteProfile.documentSnapshot,
    explicitDocumentSnapshot
  );
  const storagePolicy = deepMergeReplaceArrays(
    siteProfile && siteProfile.storagePolicy,
    explicitStoragePolicy
  );

  return {
    siteProfile,
    fingerprintSnapshot,
    storageSnapshot,
    documentSnapshot,
    storagePolicy
  };
}

function initializeEnvironment(options = {}) {
  const resolved = resolveRunOptions(options);

  let leapvm;
  try {
    leapvm = loadLeapVm();
  } catch (error) {
    hostLog('error', 'Failed to load leap-vm. Make sure it is compiled or installed.', error);
    throw error;
  }

  configureHooks(leapvm, resolved);
  const envCode = loadBundle(resolved.bundlePath, resolved.bundleCode);
  const inspectorInfo = maybeEnableInspector(leapvm, resolved);

  hostLog('info', 'Executing environment bundle...');
  runDebugPrelude(leapvm, resolved);
  runBeforeScript(leapvm, resolved.beforeRunScript);

  const bundleCodeCache = resolved.bundleCodeCache || null;
  runEnvironmentBundle(leapvm, envCode, bundleCodeCache);
  hostLog('info', 'Environment bundle executed successfully!');

  return {
    leapvm,
    resolved,
    inspectorInfo
  };
}

function executeSignatureTask(leapvm, task = {}) {
  const resolvedTask = {
    beforeRunScript: '',
    targetScript: '',
    ...task
  };

  if (!leapvm || typeof leapvm.runScript !== 'function') {
    return '';
  }

  const taskId = resolvedTask.taskId || `task-${Date.now()}`;
  const safeTaskId = JSON.stringify(String(taskId));
  const beforeScript = resolvedTask.beforeRunScript
    ? resolvedTask.beforeRunScript.trim()
    : '';
  const targetScript = resolvedTask.targetScript
    ? resolvedTask.targetScript.trim()
    : '';
  const effectiveOverrides = buildEffectiveTaskOverrides(resolvedTask);
  const fingerprintSnapshot = effectiveOverrides.fingerprintSnapshot;
  const storageSnapshot = effectiveOverrides.storageSnapshot;
  const documentSnapshot = effectiveOverrides.documentSnapshot;
  const storagePolicy = effectiveOverrides.storagePolicy;
  const fingerprintSnapshotJson = fingerprintSnapshot === undefined
    ? 'undefined'
    : JSON.stringify(fingerprintSnapshot);
  const storageSnapshotJson = storageSnapshot === undefined
    ? 'undefined'
    : JSON.stringify(storageSnapshot);
  const documentSnapshotJson = documentSnapshot === undefined
    ? 'undefined'
    : JSON.stringify(documentSnapshot);
  const storagePolicyJson = storagePolicy === undefined
    ? 'undefined'
    : JSON.stringify(storagePolicy);

  // Merge begin-scope + beforeScript + targetScript + end-scope into a single
  // runScript call, reducing per-task VM overhead from 3-5 calls to 1.
  // A1: 支持调用方通过 task.resourceName 指定脚本来源 URL，
  // 该 URL 将作为 ScriptOrigin 传给 V8，使 Error.stack 显示真实文件名。
  // 不再注入 //# sourceURL=，由 C++ ScriptOrigin 接管命名权。
  const resourceName = resolvedTask.resourceName || '';

  const combinedScript =
    '{\n' +
    '  const __leapEnv = (typeof globalThis.leapenv !== \'undefined\') ? globalThis.leapenv : null;\n' +
    '  const __leapDomService = (__leapEnv && __leapEnv.domShared) ? __leapEnv.domShared : null;\n' +
    '  const __leapRuntime = (__leapEnv && typeof __leapEnv.getRuntimeStore === \'function\')\n' +
    '    ? __leapEnv.getRuntimeStore()\n' +
    '    : (__leapEnv && __leapEnv.__runtime ? __leapEnv.__runtime : null);\n' +
    '  const __leapHookRuntime = (__leapRuntime && __leapRuntime.debug) ? __leapRuntime.debug.hookRuntime : null;\n' +
    '  try {\n' +
    '    if (__leapHookRuntime) {\n' +
    '      __leapHookRuntime.phase = \'setup\';\n' +
    '      __leapHookRuntime.active = false;\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.beginTask === \'function\') {\n' +
    '      __leapEnv.beginTask(' + safeTaskId + ');\n' +
    '    }\n' +
    '    if (__leapDomService && typeof __leapDomService.beginTaskScope === \'function\') {\n' +
    '      __leapDomService.beginTaskScope(' + safeTaskId + ');\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.applyFingerprintSnapshot === \'function\') {\n' +
    '      const __leapFingerprintSnapshot = ' + fingerprintSnapshotJson + ';\n' +
    '      if (typeof __leapFingerprintSnapshot !== \'undefined\') {\n' +
    '        __leapEnv.applyFingerprintSnapshot(__leapFingerprintSnapshot);\n' +
    '      }\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.applyStorageSnapshot === \'function\') {\n' +
    '      const __leapStorageSnapshot = ' + storageSnapshotJson + ';\n' +
    '      const __leapStoragePolicy = ' + storagePolicyJson + ';\n' +
    '      if (typeof __leapStorageSnapshot !== \'undefined\') {\n' +
    '        __leapEnv.applyStorageSnapshot(__leapStorageSnapshot, __leapStoragePolicy);\n' +
    '      }\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.applyDocumentSnapshot === \'function\') {\n' +
    '      const __leapDocumentSnapshot = ' + documentSnapshotJson + ';\n' +
    '      if (typeof __leapDocumentSnapshot !== \'undefined\') {\n' +
    '        __leapEnv.applyDocumentSnapshot(__leapDocumentSnapshot);\n' +
    '      }\n' +
    '    }\n' +
    '    if (__leapHookRuntime) {\n' +
    '      __leapHookRuntime.phase = \'task\';\n' +
    '      __leapHookRuntime.active = true;\n' +
    '    }\n' +
    (beforeScript ? beforeScript + '\n' : '') +
    targetScript + '\n' +
    '  } finally {\n' +
    '    if (__leapHookRuntime) {\n' +
    '      try {\n' +
    '        __leapHookRuntime.active = false;\n' +
    '        __leapHookRuntime.phase = \'idle\';\n' +
    '      } catch (_) {}\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.resetSignatureTaskState === \'function\') {\n' +
    '      try { __leapEnv.resetSignatureTaskState(); } catch (_) {}\n' +
    '    }\n' +
    '    if (__leapDomService && typeof __leapDomService.endTaskScope === \'function\') {\n' +
    '      __leapDomService.endTaskScope(' + safeTaskId + ');\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.endTask === \'function\') {\n' +
    '      try { __leapEnv.endTask(' + safeTaskId + '); } catch (_) {}\n' +
    '    }\n' +
    '  }\n' +
    '}';

  return leapvm.runScript(combinedScript, resourceName);
}

function shutdownEnvironment(leapvm) {
  hostLog('info', 'Shutting down...');
  if (leapvm && typeof leapvm.runScript === 'function') {
    try {
      leapvm.runScript(`
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
      `);
    } catch (_) {
      // ignore cleanup errors during shutdown
    }
  }
  if (leapvm && typeof leapvm.shutdown === 'function') {
    leapvm.shutdown();
  }
}

function runEnvironment(options = {}) {
  let context;
  try {
    context = initializeEnvironment(options);
    executeSignatureTask(context.leapvm, {
      targetScript: context.resolved.targetScript
    });
  } finally {
    shutdownEnvironment(context && context.leapvm);
  }
}

function generateBundleCodeCache(leapvm, bundleCode) {
  if (!leapvm || typeof leapvm.createCodeCache !== 'function') {
    return null;
  }
  const wrappedEnv =
    "try {\n" +
    bundleCode +
    "\n} catch (e) { try { globalThis.__envError = e; } catch(_) {} if (typeof console !== 'undefined' && console && typeof console.error === 'function') { console.error('[env error]', e && e.stack ? e.stack : e); } throw e; }\n//# sourceURL=leapenv.bundle.exec.js";
  try {
    return leapvm.createCodeCache(wrappedEnv, 'leapenv.bundle.exec.js');
  } catch (err) {
    hostLog('warn', `Failed to generate bundle code cache: ${err && err.message}`);
    return null;
  }
}

module.exports = {
  runEnvironment,
  DEFAULT_TARGET_SCRIPT,
  DEFAULT_DEBUG_CPP_WRAPPER_RULES,
  resolveRunOptions,
  loadLeapVm,
  configureHooks,
  loadBundle,
  maybeEnableInspector,
  runDebugPrelude,
  applyDomBackendSetting,
  applySignatureProfileSetting,
  runEnvironmentBundle,
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment,
  generateBundleCodeCache
};
