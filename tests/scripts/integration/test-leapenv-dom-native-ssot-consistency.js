const assert = require('assert');
const {
  initializeEnvironment,
  shutdownEnvironment
} = require('../../../leap-env/runner');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

const context = initializeEnvironment({
  domBackend: 'native'
});

try {
  if (!context || !context.resolved || context.resolved.domBackend !== 'native') {
    console.log('[DOM Native SSOT Consistency Test] SKIP (native backend unavailable)');
  } else {
    const output = context.leapvm.runScript(`
    (function () {
      var domShared = globalThis.leapenv && globalThis.leapenv.domShared;
      if (!domShared || !globalThis.$native || !globalThis.$native.dom) {
        return JSON.stringify({ ok: false, reason: 'dom bridge missing' });
      }

      domShared.beginTaskScope('task-native-ssot');

      var doc = window.document;
      var root = doc.createElement('div');
      var child = doc.createElement('span');

      root.style.position = 'relative';
      root.style.width = '120px';
      root.style.height = '24px';
      root.style.padding = '4px 6px';
      root.style.borderLeftWidth = '2px';
      root.style.borderRightWidth = '2px';

      child.style.position = 'absolute';
      child.style.left = '9px';
      child.style.top = '5px';
      child.style.width = '11px';
      child.style.height = '7px';

      root.appendChild(child);
      doc.appendChild(root);

      var jsRootWidth = root.offsetWidth;

      var docState = domShared.ensureDocumentState(doc);
      var rootState = domShared.ensureNodeState(root);
      var childState = domShared.ensureNodeState(child);
      var nativeDocId = Number(docState.nativeDocId || 0);
      var rootHandle = rootState.nativeHandle;

      var nativeRootRect = nativeDocId > 0 ? $native.dom.getLayoutRect(nativeDocId, rootHandle) : null;
      var nativeChildRect = nativeDocId > 0 ? $native.dom.getLayoutRect(nativeDocId, childState.nativeHandle) : null;
      var nativeSnapshot = nativeDocId > 0 ? $native.dom.snapshotDocument(nativeDocId) : null;
      var nativeTrace = nativeDocId > 0 ? $native.dom.traceFirstDiff(nativeDocId, nativeSnapshot) : null;

      root.removeChild(child);
      var afterRemoveSnapshot = nativeDocId > 0 ? $native.dom.snapshotDocument(nativeDocId) : null;
      var rootChildrenAfterRemove = (
        afterRemoveSnapshot &&
        afterRemoveSnapshot.children &&
        afterRemoveSnapshot.children[0] &&
        afterRemoveSnapshot.children[0].children
      ) ? afterRemoveSnapshot.children[0].children.length : -1;

      var releasedDocs = domShared.endTaskScope('task-native-ssot');
      var staleRect = nativeDocId > 0 ? $native.dom.getLayoutRect(nativeDocId, rootHandle) : null;
      var staleSetStyle = nativeDocId > 0 ? $native.dom.setStyle(nativeDocId, rootHandle, 'width', '1px') : null;

      return JSON.stringify({
        ok: true,
        nativeDocId: nativeDocId,
        jsRootWidth: Number(jsRootWidth || 0),
        nativeRootWidth: nativeRootRect ? Number(nativeRootRect.width || 0) : -1,
        nativeChildX: nativeChildRect ? Number(nativeChildRect.x || 0) : -1,
        nativeChildY: nativeChildRect ? Number(nativeChildRect.y || 0) : -1,
        traceMatched: !!(nativeTrace && nativeTrace.matched === true),
        rootChildrenAfterRemove: rootChildrenAfterRemove,
        releasedDocs: Number(releasedDocs || 0),
        staleRectIsNull: staleRect === null,
        staleSetStyleFailed: staleSetStyle === false
      });
    })();
  `);

    const payload = JSON.parse(output);
    assert.ok(payload.ok, payload.reason || 'native ssot script failed');
    assert.ok(payload.nativeDocId > 0, 'native document id should be allocated');
    assert.strictEqual(payload.jsRootWidth, payload.nativeRootWidth, 'JS and native root width should match');
    assert.ok(payload.nativeChildX >= 0 && payload.nativeChildY >= 0, 'native child rect should be readable');
    assert.strictEqual(payload.traceMatched, true, 'native trace should match its own snapshot');
    assert.strictEqual(payload.rootChildrenAfterRemove, 0, 'native tree should reflect JS removeChild');
    assert.ok(payload.releasedDocs >= 1, 'task scope release should release at least one document');
    assert.strictEqual(payload.staleRectIsNull, true, 'released handles should not resolve to layout');
    assert.strictEqual(payload.staleSetStyleFailed, true, 'released handles should reject native writes');
    console.log('[DOM Native SSOT Consistency Test] PASS');
  }
} finally {
  shutdownEnvironment(context.leapvm);
}
