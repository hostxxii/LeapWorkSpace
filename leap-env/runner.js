const fs = require('fs');
const os = require('os');
const path = require('path');
const { hostLog } = require('./src/instance/host-log');
const { StandaloneClient } = require('./src/client/standalone-client');
const { ServerManager } = require('./src/client/server-manager');

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

function resolveRunOptions(options = {}) {
  const defaultBundlePath = path.join(__dirname, 'src', 'build', 'dist', 'leap.bundle.js');
  return {
    debug: false,
    enableInspector: false,
    waitForInspector: false,
    beforeRunScript: '',
    targetScript: DEFAULT_TARGET_SCRIPT,
    ...options,
    bundlePath: options.bundlePath || defaultBundlePath,
  };
}

function preparePreloadedTargetScriptPath(resolved, standaloneOptions = {}) {
  if (standaloneOptions.targetScriptPath) {
    return {
      targetScriptPath: standaloneOptions.targetScriptPath,
      tempTargetScriptPath: null,
      tempTargetScriptDir: null,
    };
  }

  const inlineTargetScript = String(resolved.targetScript || '').trim();
  if (!inlineTargetScript) {
    return {
      targetScriptPath: null,
      tempTargetScriptPath: null,
      tempTargetScriptDir: null,
    };
  }

  const tempTargetScriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leapvm-preload-target-'));
  const tempTargetScriptPath = path.join(tempTargetScriptDir, 'target.js');
  fs.writeFileSync(tempTargetScriptPath, inlineTargetScript + '\n', 'utf8');
  return {
    targetScriptPath: tempTargetScriptPath,
    tempTargetScriptPath,
    tempTargetScriptDir,
  };
}

// ── Deep merge utilities ──────────────────────────────────────────

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

// ── Core API ──────────────────────────────────────────────────────

async function initializeEnvironment(options = {}) {
  const resolved = resolveRunOptions(options);

  const saOpts = options.standalone || {};
  const preparedTarget = preparePreloadedTargetScriptPath(resolved, saOpts);
  const serverManager = new ServerManager({
    serverBinPath: saOpts.serverBinPath,
    workers: saOpts.workers,
    port: saOpts.port,
    bundlePath: resolved.bundlePath,
    siteProfilePath: saOpts.siteProfilePath,
    targetScriptPath: preparedTarget.targetScriptPath,
    targetVersion: saOpts.targetVersion,
    maxTasksPerWorker: saOpts.maxTasksPerWorker,
    inspector: resolved.debug && resolved.enableInspector,
    inspectorPort: saOpts.inspectorPort,
    startupTimeoutMs: saOpts.startupTimeoutMs,
    env: saOpts.env,
  });

  let client = null;
  try {
    hostLog('info', 'Starting leapvm_server...');
    await serverManager.start();
    hostLog('info', `leapvm_server started (pid=${serverManager.pid}, port=${serverManager.port})`);

    client = new StandaloneClient({
      host: saOpts.host,
      port: serverManager.port,
      connectTimeoutMs: saOpts.connectTimeoutMs,
      requestTimeoutMs: saOpts.requestTimeoutMs,
    });
    await client.connect();
    hostLog('info', 'StandaloneClient connected.');

    const leapvm = {
      _client: client,
      _serverManager: serverManager,
      _targetScriptPath: preparedTarget.targetScriptPath,
      _tempTargetScriptPath: preparedTarget.tempTargetScriptPath,
      _tempTargetScriptDir: preparedTarget.tempTargetScriptDir,
    };

    return {
      leapvm,
      resolved,
      inspectorInfo: null
    };
  } catch (error) {
    if (client) {
      try { client.disconnect(); } catch (_) {}
    }
    try { await serverManager.stop(); } catch (_) {}
    if (preparedTarget.tempTargetScriptPath) {
      try { fs.unlinkSync(preparedTarget.tempTargetScriptPath); } catch (_) {}
    }
    if (preparedTarget.tempTargetScriptDir) {
      try { fs.rmdirSync(preparedTarget.tempTargetScriptDir); } catch (_) {}
    }
    throw error;
  }
}

async function executeSignatureTaskStandalone(client, task) {
  const resolvedTask = { beforeRunScript: '', targetScript: '', ...task };
  if ((resolvedTask.targetScript || '').trim()) {
    throw new Error(
      'Standalone only supports preloaded target scripts. ' +
      'Set `standalone.targetScriptPath` during initializeEnvironment() ' +
      'or pass `targetScript` in initializeEnvironment()/runEnvironment() options.'
    );
  }
  const effectiveOverrides = buildEffectiveTaskOverrides(resolvedTask);

  const payload = {
    beforeRunScript: (resolvedTask.beforeRunScript || '').trim(),
    resourceName: resolvedTask.resourceName || '',
  };

  if (effectiveOverrides.fingerprintSnapshot !== undefined) {
    payload.fingerprintSnapshot = effectiveOverrides.fingerprintSnapshot;
  }
  if (effectiveOverrides.storageSnapshot !== undefined) {
    payload.storageSnapshot = effectiveOverrides.storageSnapshot;
  }
  if (effectiveOverrides.documentSnapshot !== undefined) {
    payload.documentSnapshot = effectiveOverrides.documentSnapshot;
  }
  if (effectiveOverrides.storagePolicy !== undefined) {
    payload.storagePolicy = effectiveOverrides.storagePolicy;
  }

  const response = await client.runSignature(payload);
  return response.result;
}

async function executeSignatureTask(leapvm, task = {}) {
  if (leapvm && leapvm._client) {
    return executeSignatureTaskStandalone(leapvm._client, task);
  }
  throw new Error(
    'executeSignatureTask: leapvm must have a _client (standalone mode). ' +
    'Addon mode is no longer supported.'
  );
}

async function shutdownEnvironment(leapvm, options = {}) {
  hostLog('info', 'Shutting down...');

  if (leapvm && leapvm._client) {
    try { await leapvm._client.shutdown(); } catch (_) {}
    leapvm._client.disconnect();
    if (leapvm._serverManager) {
      await leapvm._serverManager.stop();
    }
    if (leapvm._tempTargetScriptPath) {
      try { fs.unlinkSync(leapvm._tempTargetScriptPath); } catch (_) {}
    }
    if (leapvm._tempTargetScriptDir) {
      try { fs.rmdirSync(leapvm._tempTargetScriptDir); } catch (_) {}
    }
    hostLog('info', 'Standalone server stopped.');
    return;
  }
}

async function runEnvironment(options = {}) {
  let context;
  try {
    context = await initializeEnvironment(options);
    await executeSignatureTask(context.leapvm, {
      resourceName: 'preloaded-target.js'
    });
  } finally {
    await shutdownEnvironment(context && context.leapvm);
  }
}

module.exports = {
  runEnvironment,
  DEFAULT_TARGET_SCRIPT,
  resolveRunOptions,
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment
};
