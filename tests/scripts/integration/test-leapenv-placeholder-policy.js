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

function runScriptJson(ctx, taskId, targetScript) {
  return parseJson(
    executeSignatureTask(ctx.leapvm, { taskId, targetScript }),
    taskId
  );
}

function testLeanProfile() {
  const ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-lean' });
  try {
    const result = runScriptJson(ctx, 'placeholder-lean', `
      (function () {
        return JSON.stringify({
          profile: (globalThis.leapenv && globalThis.leapenv.config && globalThis.leapenv.config.signatureProfile) || '',
          placeholderPolicyExists: !!(globalThis.leapenv && globalThis.leapenv.placeholderPolicy),
          types: {
            fetch: typeof window.fetch,
            XMLHttpRequest: typeof window.XMLHttpRequest,
            DOMParser: typeof window.DOMParser,
            XMLSerializer: typeof window.XMLSerializer,
            MutationObserver: typeof window.MutationObserver
          }
        });
      })();
    `);

    assert.strictEqual(result.profile, 'fp-lean');
    assert.strictEqual(result.placeholderPolicyExists, true);
    assert.strictEqual(result.types.fetch, 'undefined');
    assert.strictEqual(result.types.XMLHttpRequest, 'undefined');
    assert.strictEqual(result.types.DOMParser, 'undefined');
    assert.strictEqual(result.types.XMLSerializer, 'undefined');
    assert.strictEqual(result.types.MutationObserver, 'undefined');
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

function testOccupyProfile() {
  const ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  try {
    const profileAndTypes = runScriptJson(ctx, 'placeholder-occupy-types', `
      (function () {
        return JSON.stringify({
          profile: (globalThis.leapenv && globalThis.leapenv.config && globalThis.leapenv.config.signatureProfile) || '',
          placeholderPolicyExists: !!(globalThis.leapenv && globalThis.leapenv.placeholderPolicy),
          types: {
            fetch: typeof window.fetch,
            XMLHttpRequest: typeof window.XMLHttpRequest,
            DOMParser: typeof window.DOMParser,
            XMLSerializer: typeof window.XMLSerializer,
            MutationObserver: typeof window.MutationObserver,
            MessageEvent: typeof window.MessageEvent,
            MouseEvent: typeof window.MouseEvent,
            KeyboardEvent: typeof window.KeyboardEvent,
            CustomEvent: typeof window.CustomEvent
          }
        });
      })();
    `);

    const fetchResult = runScriptJson(ctx, 'placeholder-occupy-fetch', `
      (function () {
        var ret = null;
        var err = null;
        try {
          ret = window.fetch('https://example.test/api');
          if (ret && typeof ret.catch === 'function') ret.catch(function () {});
        } catch (e) {
          err = { name: e && e.name || '', code: e && e.code || '', message: e && e.message || '' };
        }
        return JSON.stringify({
          syncThrow: !!err,
          error: err,
          isThenable: !!(ret && typeof ret.then === 'function' && typeof ret.catch === 'function')
        });
      })();
    `);

    const xhrResult = runScriptJson(ctx, 'placeholder-occupy-xhr', `
      (function () {
        function safeCall(fn) {
          try { return { ok: true, value: fn() }; }
          catch (e) { return { ok: false, name: e && e.name || '', message: e && e.message || '', code: e && e.code || '' }; }
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://example.test/x');
        xhr.setRequestHeader('X-Test', '1');
        var readyStateAfterOpen = xhr.readyState;
        var sent = safeCall(function () { return xhr.send(); });
        return JSON.stringify({
          readyStateAfterOpen: readyStateAfterOpen,
          sendOk: sent.ok,
          sendErrorName: sent.name,
          sendErrorCode: sent.code,
          statusAfterSend: xhr.status,
          responseTextAfterSend: xhr.responseText,
          headers: xhr.getAllResponseHeaders()
        });
      })();
    `);

    const domParserResult = runScriptJson(ctx, 'placeholder-occupy-domparser', `
      (function () {
        var p = new DOMParser();
        var d = p.parseFromString('<!doctype html><html><body><div id="x"></div></body></html>', 'text/html');
        return JSON.stringify({
          docNodeName: d && d.nodeName || null,
          bodyNodeName: d && d.body && d.body.nodeName || null,
          idXNodeName: d && d.getElementById && d.getElementById('x') && d.getElementById('x').nodeName || null
        });
      })();
    `);

    const serializerResult = runScriptJson(ctx, 'placeholder-occupy-serializer', `
      (function () {
        var p = new DOMParser();
        var d = p.parseFromString('<!doctype html><html><body><div id="x"></div></body></html>', 'text/html');
        var s = new XMLSerializer();
        return JSON.stringify({
          body: s.serializeToString(document.body),
          parsedBody: s.serializeToString(d.body)
        });
      })();
    `);

    const observerResult = runScriptJson(ctx, 'placeholder-occupy-mutationobserver', `
      (function () {
        function safeCall(fn) {
          try { return { ok: true, value: fn() }; }
          catch (e) { return { ok: false, name: e && e.name || '', message: e && e.message || '', code: e && e.code || '' }; }
        }
        var mo = new MutationObserver(function() {});
        var observed = safeCall(function () { return mo.observe(document.body, { childList: true }); });
        return JSON.stringify({
          observeOk: observed.ok,
          takeRecordsIsArray: Array.isArray(mo.takeRecords()),
          disconnectType: typeof mo.disconnect
        });
      })();
    `);

    const eventsResult = runScriptJson(ctx, 'placeholder-occupy-events', `
      (function () {
        var ce = new CustomEvent('c1', { detail: { a: 1 }, bubbles: true });
        var me = new MessageEvent('m1', { data: 'hello', origin: 'https://origin.test' });
        var mouse = new MouseEvent('click', { clientX: 12, clientY: 34 });
        var key = new KeyboardEvent('keydown', { key: 'A', code: 'KeyA', keyCode: 65 });
        return JSON.stringify({
          customType: ce && ce.type || null,
          customDetailA: ce && ce.detail && ce.detail.a || null,
          messageType: me && me.type || null,
          messageData: me && me.data || null,
          mouseType: mouse && mouse.type || null,
          mouseXY: [mouse && mouse.clientX || 0, mouse && mouse.clientY || 0],
          keyType: key && key.type || null,
          keyKey: key && key.key || null,
          keyCode: key && key.keyCode || 0
        });
      })();
    `);

    assert.strictEqual(profileAndTypes.profile, 'fp-occupy');
    assert.strictEqual(profileAndTypes.placeholderPolicyExists, true);
    assert.strictEqual(profileAndTypes.types.fetch, 'function');
    assert.strictEqual(profileAndTypes.types.XMLHttpRequest, 'function');
    assert.strictEqual(profileAndTypes.types.DOMParser, 'function');
    assert.strictEqual(profileAndTypes.types.XMLSerializer, 'function');
    assert.strictEqual(profileAndTypes.types.MutationObserver, 'function');

    assert.strictEqual(fetchResult.syncThrow, false);
    assert.strictEqual(fetchResult.isThenable, true);

    assert.strictEqual(xhrResult.readyStateAfterOpen, 1);
    assert.strictEqual(xhrResult.sendOk, false);
    assert.strictEqual(xhrResult.sendErrorCode, 'LEAP_NETWORK_DISABLED');
    assert.strictEqual(xhrResult.statusAfterSend, 0);
    assert.strictEqual(xhrResult.responseTextAfterSend, '');
    assert.strictEqual(xhrResult.headers, '');

    assert.strictEqual(domParserResult.docNodeName, '#document');
    assert.strictEqual(domParserResult.bodyNodeName, 'BODY');
    assert.strictEqual(domParserResult.idXNodeName, 'DIV');

    assert.strictEqual(typeof serializerResult.body, 'string');
    assert.strictEqual(typeof serializerResult.parsedBody, 'string');
    assert.ok(serializerResult.parsedBody.indexOf('<body') >= 0 || serializerResult.parsedBody.indexOf('<BODY') >= 0);

    assert.strictEqual(observerResult.observeOk, true);
    assert.strictEqual(observerResult.takeRecordsIsArray, true);
    assert.strictEqual(observerResult.disconnectType, 'function');

    assert.strictEqual(eventsResult.customType, 'c1');
    assert.strictEqual(eventsResult.customDetailA, 1);
    assert.strictEqual(eventsResult.messageType, 'm1');
    assert.strictEqual(eventsResult.messageData, 'hello');
    assert.strictEqual(eventsResult.mouseType, 'click');
    assert.deepStrictEqual(eventsResult.mouseXY, [12, 34]);
    assert.strictEqual(eventsResult.keyType, 'keydown');
    assert.strictEqual(eventsResult.keyKey, 'A');
    assert.strictEqual(eventsResult.keyCode, 65);
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

function runMode(mode) {
  if (mode === 'lean') {
    testLeanProfile();
    return;
  }
  if (mode === 'occupy') {
    testOccupyProfile();
    return;
  }
  throw new Error('Unknown mode: ' + mode);
}

function runModeInSubprocess(mode) {
  const result = spawnSync(process.execPath, [__filename, `--mode=${mode}`], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`[placeholder-policy] subprocess failed for mode=${mode}, exit=${result.status}`);
  }
}

const modeArg = process.argv.find((arg) => arg.indexOf('--mode=') === 0);
const mode = modeArg ? modeArg.slice('--mode='.length) : '';

try {
  if (mode) {
    runMode(mode);
    console.log(`[placeholder-policy:${mode}] PASS`);
  } else {
    // Work around a leap-vm lifecycle crash (Windows 0xC0000005) observed when
    // probing several placeholder window props in fp-occupy after a prior fp-lean
    // VM run in the same Node process. Running each profile in a subprocess keeps
    // coverage while avoiding the unrelated native crash.
    runModeInSubprocess('lean');
    runModeInSubprocess('occupy');
    console.log('[placeholder-policy] PASS');
  }
} catch (err) {
  console.error(mode ? `[placeholder-policy:${mode}] FAIL` : '[placeholder-policy] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
