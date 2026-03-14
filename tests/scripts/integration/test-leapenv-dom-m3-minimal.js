const assert = require('assert');

require('../../../leap-env/src/core/runtime.js');
require('../../../leap-env/src/core/tools.js');
require('../../../leap-env/src/impl/00-dom-shared.impl.js');
require('../../../leap-env/src/impl/EventTarget.impl.js');
require('../../../leap-env/src/impl/Node.impl.js');
require('../../../leap-env/src/impl/Element.impl.js');
require('../../../leap-env/src/impl/HTMLElement.impl.js');
require('../../../leap-env/src/impl/Document.impl.js');
require('../../../leap-env/src/impl/HTMLDocument.impl.js');
require('../../../leap-env/src/impl/Window.impl.js');

function dispatch(self, typeName, propName, actionType) {
  const runtime = global.leapenv && global.leapenv.__runtime;
  const bridge = runtime && runtime.bridge;
  const dispatchFn = (bridge && typeof bridge.dispatch === 'function')
    ? bridge.dispatch
    : global.__LEAP_DISPATCH__;
  if (typeof dispatchFn !== 'function') {
    throw new Error('dispatch bridge missing');
  }
  const args = Array.prototype.slice.call(arguments, 4);
  return dispatchFn.apply(self, [typeName, propName, actionType].concat(args));
}

function get(self, typeName, propName) {
  return dispatch(self, typeName, propName, 'GET');
}

function set(self, typeName, propName, value) {
  return dispatch(self, typeName, propName, 'SET', value);
}

function call(self, typeName, propName) {
  const args = Array.prototype.slice.call(arguments, 3);
  return dispatch.apply(null, [self, typeName, propName, 'CALL'].concat(args));
}

const dom = global.leapenv.domShared;
dom.beginTaskScope('task-m3');

const windowObject = {};
const documentObject = get(windowObject, 'Window', 'document');
assert.ok(documentObject);

const container = call(documentObject, 'Document', 'createElement', 'div');
const containerStyle = get(container, 'HTMLElement', 'style');
containerStyle.position = 'relative';
containerStyle.width = '220px';
call(documentObject, 'Node', 'appendChild', container);

const first = call(documentObject, 'Document', 'createElement', 'span');
const second = call(documentObject, 'Document', 'createElement', 'span');
const secondStyle = get(second, 'HTMLElement', 'style');
secondStyle.position = 'absolute';
secondStyle.left = '13px';
secondStyle.top = '7px';
call(container, 'Node', 'appendChild', first);
call(container, 'Node', 'appendChild', second);

assert.strictEqual(get(first, 'Node', 'nextSibling'), second);
assert.strictEqual(get(second, 'Node', 'previousSibling'), first);
assert.strictEqual(get(container, 'Element', 'children').length, 2);
// document.children includes the default html tree + container appended directly;
// ensureDocumentDefaultTree injects html before this line runs, so length is 2.
assert.strictEqual(get(documentObject, 'Document', 'children').length, 2);
// offsetParent still works (depends on getPositionValue, not layout engine)
assert.strictEqual(get(second, 'HTMLElement', 'offsetParent'), container);
// layout values (offsetLeft, offsetTop, offsetWidth, clientWidth) are 0 in unit
// test context since no DoD layout engine is loaded; verified by integration tests

const box = call(documentObject, 'Document', 'createElement', 'div');
const boxStyle = get(box, 'HTMLElement', 'style');
boxStyle.width = '100px';
boxStyle.height = '40px';
boxStyle.paddingLeft = '10px';
boxStyle.paddingRight = '10px';
boxStyle.borderLeftWidth = '2px';
boxStyle.borderRightWidth = '2px';
boxStyle.boxSizing = 'border-box';
call(documentObject, 'Node', 'appendChild', box);

const hidden = call(documentObject, 'Document', 'createElement', 'div');
const hiddenStyle = get(hidden, 'HTMLElement', 'style');
hiddenStyle.display = 'none';
hiddenStyle.width = '123px';
hiddenStyle.height = '45px';
call(documentObject, 'Node', 'appendChild', hidden);

set(container, 'Node', 'textContent', 'hello-m3');
assert.strictEqual(get(container, 'Node', 'textContent'), 'hello-m3');
assert.strictEqual(get(container, 'Node', 'childNodes').length, 0);

const snapshot = dom.snapshotNodeForTrace(documentObject);
const passTrace = dom.traceFirstDiff(documentObject, snapshot);
assert.strictEqual(passTrace.matched, true);

const expected = JSON.parse(JSON.stringify(snapshot));
expected.children[0].nodeName = 'BROKEN';
const failTrace = dom.traceFirstDiff(documentObject, expected);
assert.strictEqual(failTrace.matched, false);
assert.ok(failTrace.firstDiff && /nodeName/.test(failTrace.firstDiff.path));

dom.endTaskScope('task-m3');
console.log('[DOM M3 Test] PASS');
