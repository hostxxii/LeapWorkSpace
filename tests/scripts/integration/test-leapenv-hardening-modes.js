const assert = require('assert');
const { spawnSync } = require('child_process');
const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment
} = require('../../../leap-env/runner');

function parseJson(raw, label) {
  try {
    return JSON.parse(String(raw));
  } catch (err) {
    err.message = `[${label}] JSON parse failed: ${err.message}\nraw=${raw}`;
    throw err;
  }
}

function runProbe(options, label) {
  const ctx = initializeEnvironment(options);
  try {
    const raw = executeSignatureTask(ctx.leapvm, {
      taskId: `hardening-${label}`,
      targetScript: `
        (function () {
          var leapenvObj = (typeof globalThis.leapenv !== 'undefined') ? globalThis.leapenv : null;
          var runtimeConfig = (leapenvObj && leapenvObj.config && typeof leapenvObj.config === 'object')
            ? leapenvObj.config
            : {};
          return JSON.stringify({
            bridgeExposureMode: String(runtimeConfig.bridgeExposureMode || ''),
            globalFacadeMode: String(runtimeConfig.globalFacadeMode || ''),
            hasNativeNamespace: ('$native' in globalThis),
            hasCreateNativeAlias: ('__createNative__' in globalThis),
            nativeNamespaceEnumerable: Object.keys(globalThis).indexOf('$native') !== -1,
            createNativeEnumerable: Object.keys(globalThis).indexOf('__createNative__') !== -1,
            leapenvFrozen: !!(leapenvObj && Object.isFrozen(leapenvObj)),
            leapenvType: typeof leapenvObj
          });
        })();
      `
    });
    return parseJson(raw, label);
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

function testDefaultMode() {
  const result = runProbe({
    debug: false
  }, 'default');

  assert.strictEqual(result.bridgeExposureMode, 'strict');
  assert.strictEqual(result.globalFacadeMode, 'strict');
  assert.strictEqual(result.hasNativeNamespace, false);
  assert.strictEqual(result.hasCreateNativeAlias, false);
  assert.strictEqual(result.leapenvFrozen, true);
  assert.strictEqual(result.leapenvType, 'object');
}

function testStrictMode() {
  const result = runProbe({
    debug: false,
    bridgeExposureMode: 'strict',
    globalFacadeMode: 'strict'
  }, 'strict');

  assert.strictEqual(result.bridgeExposureMode, 'strict');
  assert.strictEqual(result.globalFacadeMode, 'strict');
  assert.strictEqual(result.hasNativeNamespace, false);
  assert.strictEqual(result.hasCreateNativeAlias, false);
  assert.strictEqual(result.leapenvFrozen, true);
  assert.strictEqual(result.leapenvType, 'object');
}

function runMode(mode) {
  if (mode === 'default') return testDefaultMode();
  if (mode === 'strict') return testStrictMode();
  throw new Error('Unknown mode: ' + mode);
}

function runModeInSubprocess(mode) {
  const result = spawnSync(process.execPath, [__filename, `--mode=${mode}`], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`[hardening-modes] subprocess failed for mode=${mode}, exit=${result.status}`);
  }
}

const modeArg = process.argv.find((arg) => arg.indexOf('--mode=') === 0);
const mode = modeArg ? modeArg.slice('--mode='.length) : '';

try {
  if (mode) {
    runMode(mode);
    console.log(`[hardening-modes:${mode}] PASS`);
  } else {
    runModeInSubprocess('default');
    runModeInSubprocess('strict');
    console.log('[hardening-modes] PASS');
  }
} catch (err) {
  console.error(mode ? `[hardening-modes:${mode}] FAIL` : '[hardening-modes] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
}
