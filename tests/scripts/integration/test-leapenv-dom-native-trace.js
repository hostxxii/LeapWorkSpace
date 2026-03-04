const assert = require('assert');

process.env.LEAP_DOM_BACKEND = 'native';

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

function call(self, typeName, propName) {
  const args = Array.prototype.slice.call(arguments, 3);
  return dispatch.apply(null, [self, typeName, propName, 'CALL'].concat(args));
}

const dom = global.leapenv.domShared;
dom.beginTaskScope('task-native-trace');

const windowObject = {};
const documentObject = get(windowObject, 'Window', 'document');
assert.ok(documentObject);

const div = call(documentObject, 'Document', 'createElement', 'div');
const style = get(div, 'HTMLElement', 'style');
style.width = '100px';
style.height = '20px';
call(documentObject, 'Node', 'appendChild', div);

const snapshot = dom.snapshotNodeForTrace(documentObject);
assert.ok(snapshot && snapshot.nodeName === '#document');
const pass = dom.traceFirstDiff(documentObject, snapshot);
assert.strictEqual(pass.matched, true);

const expected = JSON.parse(JSON.stringify(snapshot));
expected.children[0].nodeName = 'BROKEN';
const fail = dom.traceFirstDiff(documentObject, expected);
assert.strictEqual(fail.matched, false);
assert.ok(fail.firstDiff && /nodeName/.test(fail.firstDiff.path));

dom.endTaskScope('task-native-trace');
console.log('[DOM Native Trace Test] PASS');
