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
  const output = context.leapvm.runScript(`
    (function () {
      var dom = $native && $native.dom;
      if (!dom) {
        return JSON.stringify({ ok: false, reason: 'native dom missing' });
      }

      var doc = dom.createDocument('task-handle-guard');
      var handle = dom.createElement(doc, 'div');
      var w1 = $native.createSkeletonInstance('HTMLDivElement', 'div', handle);
      var w2 = $native.createSkeletonInstance('HTMLDivElement', 'div', handle);
      var cacheHit = (w1 === w2);

      dom.releaseDocument(doc);
      var appendAfterRelease = dom.appendChild(doc, null, handle);
      var rectAfterRelease = dom.getLayoutRect(doc, handle);

      return JSON.stringify({
        ok: true,
        cacheHit: cacheHit,
        appendAfterRelease: appendAfterRelease,
        rectAfterReleaseIsNull: rectAfterRelease === null
      });
    })();
  `);

  const payload = JSON.parse(output);
  assert.ok(payload.ok, 'native dom api should exist');
  assert.strictEqual(payload.cacheHit, true, 'wrapper cache should reuse same wrapper for same handle');
  assert.strictEqual(payload.appendAfterRelease, false, 'released document should reject stale handle writes');
  assert.strictEqual(payload.rectAfterReleaseIsNull, true, 'released document should invalidate stale handle reads');
  console.log('[DOM Handle Guard Test] PASS');
} finally {
  shutdownEnvironment(context.leapvm);
}
