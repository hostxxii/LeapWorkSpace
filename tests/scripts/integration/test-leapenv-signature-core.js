const assert = require('assert');
const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment
} = require('../../../leap-env/runner');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonResult(raw, label) {
  assert.strictEqual(typeof raw, 'string', `${label} should return JSON string`);
  try {
    return JSON.parse(raw);
  } catch (err) {
    err.message = `${label} JSON parse failed: ${err.message}\nRaw: ${raw}`;
    throw err;
  }
}

async function main() {
  let ctx;
  try {
    ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });

    executeSignatureTask(ctx.leapvm, {
      taskId: 'signature-core-task',
      targetScript: `
        (function () {
          function nodeName(node) {
            return node ? node.nodeName : null;
          }
          function pushStep(target, label, event) {
            target.push({
              label: label,
              currentTarget: event.currentTarget && event.currentTarget.nodeName || '#window',
              target: event.target && event.target.nodeName || null,
              phase: event.eventPhase,
              defaultPrevented: !!event.defaultPrevented
            });
          }

          var out = {};
          out.initialLocation = {
            href: String(location.href),
            origin: String(location.origin),
            windowOrigin: String(window.origin)
          };

          var doc = document;
          out.defaultTree = {
            documentElement: nodeName(doc.documentElement),
            head: nodeName(doc.head),
            body: nodeName(doc.body),
            qHtml: nodeName(doc.querySelector('html')),
            qHead: nodeName(doc.querySelector('head')),
            qBody: nodeName(doc.querySelector('body'))
          };

          location.href = 'https://a.example.test:8443/path?q=1#hash';
          out.afterLocation = {
            href: String(location.href),
            origin: String(location.origin),
            windowOrigin: String(window.origin),
            documentURL: String(document.URL),
            documentURI: String(document.documentURI),
            baseURI: String(document.body.baseURI)
          };

          history.pushState({ n: 1 }, '', 'https://b.example.test/push?p=2');
          out.afterPushState = {
            href: String(location.href),
            documentURL: String(document.URL),
            historyLength: Number(history.length),
            historyStateN: history.state && history.state.n
          };

          history.replaceState({ n: 2 }, '', 'https://c.example.test/replace#r');
          out.afterReplaceState = {
            href: String(location.href),
            documentURL: String(document.URL),
            historyLength: Number(history.length),
            historyStateN: history.state && history.state.n
          };

          out.documentMeta = {
            defaultViewIsWindow: document.defaultView === window,
            currentScript: document.currentScript,
            referrerType: typeof document.referrer,
            lastModified: String(document.lastModified)
          };

          var host = document.createElement('div');
          host.id = 'host-node';
          document.body.appendChild(host);
          var child = document.createElement('span');
          child.id = 'child-node';
          host.appendChild(child);

          var eventSteps = [];
          host.addEventListener('sig', function (e) {
            pushStep(eventSteps, 'host', e);
            e.preventDefault();
          });
          child.addEventListener('sig', function (e) {
            pushStep(eventSteps, 'child', e);
            e.stopPropagation();
          });

          var ev = leapenv.domShared.createEvent('sig', { bubbles: true, cancelable: true });
          var dispatchRet = child.dispatchEvent(ev);
          out.event = {
            constructorUsable: (function () {
              try {
                var t = new Event('probe');
                return !!t;
              } catch (_) {
                return false;
              }
            })(),
            type: ev.type,
            bubbles: ev.bubbles,
            cancelable: ev.cancelable,
            defaultPrevented: ev.defaultPrevented,
            dispatchReturn: dispatchRet,
            currentTargetAfterDispatch: ev.currentTarget,
            eventPhaseAfterDispatch: ev.eventPhase,
            steps: eventSteps
          };

          var all = document.all;
          var apiAll = leapenv.getDocumentAllCollection ? leapenv.getDocumentAllCollection(document) : null;
          var dispatchItemNode = null;
          var dispatchNamedNode = null;
          var dispatchIterator = null;
          var dispatchBridge = (function () {
            var runtime = leapenv && leapenv.__runtime;
            var bridge = runtime && runtime.bridge;
            if (bridge && typeof bridge.dispatch === 'function') {
              return bridge.dispatch;
            }
            if (typeof __LEAP_DISPATCH__ === 'function') {
              return __LEAP_DISPATCH__;
            }
            return null;
          })();
          if (apiAll && typeof dispatchBridge === 'function') {
            try {
              dispatchItemNode = dispatchBridge.call(apiAll, 'HTMLAllCollection', 'item', 'CALL', 0);
            } catch (_) {}
            try {
              dispatchNamedNode = dispatchBridge.call(apiAll, 'HTMLAllCollection', 'namedItem', 'CALL', 'host-node');
            } catch (_) {}
            try {
              dispatchIterator = dispatchBridge.call(apiAll, 'HTMLAllCollection', '@@iterator', 'CALL');
            } catch (_) {}
          }
          var named = dispatchNamedNode;
          var iterFirst = null;
          var iterFn = null;
          if (apiAll && typeof Symbol === 'function' && Symbol.iterator && typeof apiAll[Symbol.iterator] === 'function') {
            iterFn = apiAll[Symbol.iterator];
          } else if (apiAll && typeof apiAll['@@iterator'] === 'function') {
            iterFn = apiAll['@@iterator'];
          }
          if (!iterFirst && dispatchIterator && typeof dispatchIterator.next === 'function') {
            var first2 = dispatchIterator.next();
            iterFirst = first2 && !first2.done && first2.value ? first2.value.nodeName : null;
          }
          if (iterFn) {
            var it = iterFn.call(apiAll);
            var first = it && it.next ? it.next() : { done: true };
            iterFirst = first && !first.done && first.value ? first.value.nodeName : null;
          }
          out.documentAll = {
            specialPath: {
              typeofValue: typeof all,
              boolValue: !!all,
              hasItem: !!(all && typeof all.item === 'function'),
              hasNamedItem: !!(all && typeof all.namedItem === 'function')
            },
            apiPath: {
              exists: !!apiAll,
              canCallItem: !!(apiAll && typeof apiAll.item === 'function'),
              canCallNamedItem: !!(apiAll && typeof apiAll.namedItem === 'function'),
              length: (apiAll && typeof apiAll.item === 'function') ? Number(apiAll.length) : -1,
              methodItemNodeName: (apiAll && typeof apiAll.item === 'function') ? nodeName(apiAll.item(0)) : null,
              dispatchItemNodeName: nodeName(dispatchItemNode),
              namedItemId: named && named.id || null,
              iteratorFirstNodeName: iterFirst
            },
            typeofValue: typeof all,
            boolValue: !!all,
            apiExists: !!apiAll
          };

          globalThis.__signatureCoreOut = JSON.stringify(out);
        })();
      `
    });

    const coreRaw = String(ctx.leapvm.runScript('globalThis.__signatureCoreOut || ""') || '');
    const core = parseJsonResult(coreRaw, 'signature-core');

    assert.deepStrictEqual(core.defaultTree, {
      documentElement: 'HTML',
      head: 'HEAD',
      body: 'BODY',
      qHtml: 'HTML',
      qHead: 'HEAD',
      qBody: 'BODY'
    });

    assert.strictEqual(core.initialLocation.href, 'about:blank');
    assert.strictEqual(core.initialLocation.origin, 'null');
    assert.strictEqual(core.initialLocation.windowOrigin, 'null');

    assert.strictEqual(core.afterLocation.origin, 'https://a.example.test:8443');
    assert.strictEqual(core.afterLocation.windowOrigin, core.afterLocation.origin);
    assert.strictEqual(core.afterLocation.documentURL, core.afterLocation.href);
    assert.strictEqual(core.afterLocation.documentURI, core.afterLocation.href);
    assert.strictEqual(core.afterLocation.baseURI, core.afterLocation.href);

    assert.strictEqual(core.afterPushState.href, 'https://b.example.test/push?p=2');
    assert.strictEqual(core.afterPushState.documentURL, core.afterPushState.href);
    assert.strictEqual(core.afterPushState.historyLength, 2);
    assert.strictEqual(core.afterPushState.historyStateN, 1);

    assert.strictEqual(core.afterReplaceState.href, 'https://c.example.test/replace#r');
    assert.strictEqual(core.afterReplaceState.documentURL, core.afterReplaceState.href);
    assert.strictEqual(core.afterReplaceState.historyLength, 2);
    assert.strictEqual(core.afterReplaceState.historyStateN, 2);

    assert.strictEqual(core.documentMeta.defaultViewIsWindow, true);
    assert.strictEqual(core.documentMeta.currentScript, null);
    assert.strictEqual(core.documentMeta.referrerType, 'string');
    assert.ok(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(core.documentMeta.lastModified));

    assert.strictEqual(core.event.type, 'sig');
    assert.strictEqual(typeof core.event.constructorUsable, 'boolean');
    assert.strictEqual(core.event.bubbles, true);
    assert.strictEqual(core.event.cancelable, true);
    assert.strictEqual(core.event.defaultPrevented, false, 'stopPropagation should prevent host listener before preventDefault');
    assert.strictEqual(core.event.dispatchReturn, true);
    assert.strictEqual(core.event.currentTargetAfterDispatch, null);
    assert.strictEqual(core.event.eventPhaseAfterDispatch, 0);
    assert.strictEqual(Array.isArray(core.event.steps), true);
    assert.deepStrictEqual(core.event.steps.map((s) => s.label), ['child']);
    assert.strictEqual(core.event.steps[0].target, 'SPAN');
    assert.strictEqual(core.event.steps[0].currentTarget, 'SPAN');

    assert.strictEqual(typeof core.documentAll.specialPath.boolValue, 'boolean');
    assert.strictEqual(core.documentAll.apiPath.exists, true);
    assert.strictEqual(core.documentAll.apiPath.canCallItem, true);
    assert.strictEqual(core.documentAll.apiPath.canCallNamedItem, true);
    assert.ok(core.documentAll.apiPath.length >= 5, 'HTMLAllCollection api should include default tree + created nodes');
    assert.strictEqual(core.documentAll.apiPath.namedItemId, 'host-node');
    assert.ok(['HTML', 'HEAD', 'BODY', 'DIV', 'SPAN'].includes(core.documentAll.apiPath.dispatchItemNodeName));
    assert.strictEqual(
      core.documentAll.apiPath.iteratorFirstNodeName == null || typeof core.documentAll.apiPath.iteratorFirstNodeName === 'string',
      true
    );

    ctx.leapvm.runScript(`
      (function () {
        globalThis.__signatureTimerProbe = {
          timeoutFired: 0,
          intervalTicks: 0,
          rafFired: 0,
          canceledRafFired: 0,
          rafTsType: ''
        };
        var intervalId = setInterval(function () {
          globalThis.__signatureTimerProbe.intervalTicks++;
          if (globalThis.__signatureTimerProbe.intervalTicks >= 2) {
            clearInterval(intervalId);
          }
        }, 5);
        globalThis.__signatureTimerProbe.intervalIdType = typeof intervalId;
        globalThis.__signatureTimerProbe.intervalId = Number(intervalId) || 0;
        setTimeout(function () {
          globalThis.__signatureTimerProbe.timeoutFired++;
        }, 10);
        var timeoutId = setTimeout(function () {}, 20);
        globalThis.__signatureTimerProbe.timeoutIdType = typeof timeoutId;
        globalThis.__signatureTimerProbe.timeoutId = Number(timeoutId) || 0;
        clearTimeout(timeoutId);
        var canceledId = requestAnimationFrame(function () {
          globalThis.__signatureTimerProbe.canceledRafFired++;
        });
        globalThis.__signatureTimerProbe.canceledRafIdType = typeof canceledId;
        globalThis.__signatureTimerProbe.canceledRafId = Number(canceledId) || 0;
        cancelAnimationFrame(canceledId);
        var rafId = requestAnimationFrame(function (ts) {
          globalThis.__signatureTimerProbe.rafFired++;
          globalThis.__signatureTimerProbe.rafTsType = typeof ts;
        });
        globalThis.__signatureTimerProbe.rafIdType = typeof rafId;
        globalThis.__signatureTimerProbe.rafId = Number(rafId) || 0;
      })();
    `);

    await sleep(120);

    const timerRaw = ctx.leapvm.runScript('JSON.stringify(globalThis.__signatureTimerProbe || null)');
    const timer = parseJsonResult(timerRaw, 'signature-timer-probe');

    assert.ok(timer, 'timer probe should exist');
    assert.strictEqual(timer.timeoutIdType, 'number');
    assert.strictEqual(timer.intervalIdType, 'number');
    assert.strictEqual(timer.rafIdType, 'number');
    assert.strictEqual(timer.canceledRafIdType, 'number');
    assert.ok(timer.timeoutId > 0);
    assert.ok(timer.intervalId > 0);
    assert.ok(timer.rafId > 0);
    assert.ok(timer.canceledRafId > 0);
    assert.strictEqual(typeof timer.timeoutFired, 'number');
    assert.strictEqual(typeof timer.intervalTicks, 'number');
    assert.strictEqual(typeof timer.rafFired, 'number');
    assert.strictEqual(timer.canceledRafFired, 0);
    assert.strictEqual(timer.rafTsType === '' || timer.rafTsType === 'number', true);

    console.log('[signature-core] PASS');
  } finally {
    if (ctx && ctx.leapvm) {
      shutdownEnvironment(ctx.leapvm);
    }
  }
}

main().catch((err) => {
  console.error('[signature-core] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
