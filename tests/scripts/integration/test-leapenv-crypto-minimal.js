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

function runTaskJson(ctx, taskId, targetScript, fingerprintSnapshot) {
  return parseJson(executeSignatureTask(ctx.leapvm, {
    taskId,
    targetScript,
    fingerprintSnapshot
  }), taskId);
}

function testCryptoExposure(profile) {
  const ctx = initializeEnvironment({ debug: false, signatureProfile: profile });
  try {
    const result = runTaskJson(ctx, `crypto-exposure-${profile}`, `
      (function () {
        return JSON.stringify({
          profile: (globalThis.leapenv && globalThis.leapenv.config && globalThis.leapenv.config.signatureProfile) || '',
          cryptoType: typeof window.crypto,
          getRandomValuesType: window.crypto ? typeof window.crypto.getRandomValues : 'undefined'
        });
      })();
    `);
    assert.strictEqual(result.profile, profile);
    assert.strictEqual(result.cryptoType, 'object');
    assert.strictEqual(result.getRandomValuesType, 'function');
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

function testGetRandomValuesBehavior() {
  const ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  try {
    const behavior = runTaskJson(ctx, 'crypto-shape', `
      (function () {
        var u8 = new Uint8Array(16);
        for (var i = 0; i < u8.length; i++) u8[i] = 0;
        var ret = crypto.getRandomValues(u8);
        var sum = 0;
        for (var j = 0; j < u8.length; j++) sum += Number(u8[j] || 0);
        var u32 = new Uint32Array(4);
        var ret32 = crypto.getRandomValues(u32);
        return JSON.stringify({
          u8SameRef: ret === u8,
          u8Length: u8.length,
          u8Sum: sum,
          u8Values: Array.prototype.slice.call(u8),
          u32SameRef: ret32 === u32,
          u32Length: u32.length,
          u32Type: Object.prototype.toString.call(u32)
        });
      })();
    `);
    assert.strictEqual(behavior.u8SameRef, true);
    assert.strictEqual(behavior.u8Length, 16);
    assert.ok(Array.isArray(behavior.u8Values));
    assert.strictEqual(behavior.u8Values.length, 16);
    assert.strictEqual(behavior.u32SameRef, true);
    assert.strictEqual(behavior.u32Length, 4);
    assert.strictEqual(behavior.u32Type, '[object Uint32Array]');

    const validation = runTaskJson(ctx, 'crypto-validation', `
      (function () {
        function safe(fn) {
          try { return { ok: true, value: fn() }; }
          catch (e) { return { ok: false, name: e && e.name || '', message: e && e.message || '', code: e && e.code || '' }; }
        }
        return JSON.stringify({
          float32: safe(function () { return crypto.getRandomValues(new Float32Array(4)); }),
          array: safe(function () { return crypto.getRandomValues([1, 2, 3]); }),
          dataView: safe(function () { return crypto.getRandomValues(new DataView(new ArrayBuffer(8))); }),
          quota: safe(function () { return crypto.getRandomValues(new Uint8Array(70000)); })
        });
      })();
    `);
    assert.strictEqual(validation.float32.ok, false);
    assert.strictEqual(validation.float32.name, 'TypeError');
    assert.strictEqual(validation.float32.code, 'LEAP_CRYPTO_INVALID_TARGET');
    assert.strictEqual(validation.array.ok, false);
    assert.strictEqual(validation.array.name, 'TypeError');
    assert.strictEqual(validation.dataView.ok, false);
    assert.strictEqual(validation.dataView.name, 'TypeError');
    assert.strictEqual(validation.quota.ok, false);
    assert.strictEqual(validation.quota.name, 'QuotaExceededError');
    assert.strictEqual(validation.quota.code, 'LEAP_CRYPTO_QUOTA_EXCEEDED');
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

function testDeterministicSeed() {
  const ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  try {
    const script = `
      (function () {
        function hex(arr) {
          var out = '';
          for (var i = 0; i < arr.length; i++) {
            var h = Number(arr[i]).toString(16);
            if (h.length < 2) h = '0' + h;
            out += h;
          }
          return out;
        }
        var a = new Uint8Array(16);
        var b = new Uint8Array(16);
        crypto.getRandomValues(a);
        crypto.getRandomValues(b);
        return JSON.stringify({
          first: hex(a),
          second: hex(b)
        });
      })();
    `;
    const a1 = runTaskJson(ctx, 'crypto-seed-a1', script, { randomSeed: 'seed-A' });
    const a2 = runTaskJson(ctx, 'crypto-seed-a2', script, { randomSeed: 'seed-A' });
    const b1 = runTaskJson(ctx, 'crypto-seed-b1', script, { randomSeed: 'seed-B' });

    assert.strictEqual(typeof a1.first, 'string');
    assert.strictEqual(a1.first.length, 32);
    assert.strictEqual(a1.second.length, 32);
    assert.strictEqual(a1.first, a2.first);
    assert.strictEqual(a1.second, a2.second);
    assert.notStrictEqual(a1.first, a1.second);
    assert.notStrictEqual(a1.first, b1.first);
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

function runMode(mode) {
  if (mode === 'exposure-lean') return testCryptoExposure('fp-lean');
  if (mode === 'exposure-occupy') return testCryptoExposure('fp-occupy');
  if (mode === 'behavior') return testGetRandomValuesBehavior();
  if (mode === 'seed') return testDeterministicSeed();
  throw new Error('Unknown mode: ' + mode);
}

function runModeInSubprocess(mode) {
  const result = spawnSync(process.execPath, [__filename, `--mode=${mode}`], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`[crypto-minimal] subprocess failed for mode=${mode}, exit=${result.status}`);
  }
}

const modeArg = process.argv.find((arg) => arg.indexOf('--mode=') === 0);
const mode = modeArg ? modeArg.slice('--mode='.length) : '';

try {
  if (mode) {
    runMode(mode);
    console.log(`[crypto-minimal:${mode}] PASS`);
  } else {
    runModeInSubprocess('exposure-lean');
    runModeInSubprocess('exposure-occupy');
    runModeInSubprocess('behavior');
    runModeInSubprocess('seed');
    console.log('[crypto-minimal] PASS');
  }
} catch (err) {
  console.error(mode ? `[crypto-minimal:${mode}] FAIL` : '[crypto-minimal] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
