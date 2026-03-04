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

function walkNames(node) {
  const names = [];
  const stack = [node];
  while (stack.length) {
    const cur = stack.pop();
    names.push(dispatch(cur, 'Node', 'nodeName', 'GET'));
    const children = dispatch(cur, 'Node', 'childNodes', 'GET');
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]);
    }
  }
  return names;
}

const windowObject = {};
const domShared = global.leapenv.domShared;
domShared.setDomBackend('dod');

domShared.beginTaskScope('task-a');
const documentObject = dispatch(windowObject, 'Window', 'document', 'GET');

assert.ok(documentObject && typeof documentObject === 'object', 'window.document should be an object');
assert.strictEqual(dispatch(documentObject, 'Node', 'nodeName', 'GET'), '#document');

const div = dispatch(documentObject, 'Document', 'createElement', 'CALL', 'div');
const span = dispatch(documentObject, 'Document', 'createElement', 'CALL', 'span');
const anchor = dispatch(documentObject, 'Document', 'createElement', 'CALL', 'a');

dispatch(div, 'Node', 'appendChild', 'CALL', span);
dispatch(documentObject, 'Node', 'appendChild', 'CALL', div);
dispatch(documentObject, 'Node', 'appendChild', 'CALL', anchor);

const textNodeForDoc = dispatch(documentObject, 'Document', 'createTextNode', 'CALL', 'x');
assert.throws(
  () => dispatch(documentObject, 'Node', 'appendChild', 'CALL', textNodeForDoc),
  /HierarchyRequestError/,
  'document should reject direct text child insertion'
);

const svgCircle = dispatch(documentObject, 'Document', 'createElementNS', 'CALL', 'http://www.w3.org/2000/svg', 'svg:circle');
assert.strictEqual(dispatch(svgCircle, 'Element', 'namespaceURI', 'GET'), 'http://www.w3.org/2000/svg');
assert.strictEqual(dispatch(svgCircle, 'Element', 'prefix', 'GET'), 'svg');
assert.strictEqual(dispatch(svgCircle, 'Element', 'localName', 'GET'), 'circle');
dispatch(svgCircle, 'Element', 'setAttributeNS', 'CALL', 'http://www.w3.org/1999/xlink', 'xlink:href', '#ref');
assert.strictEqual(dispatch(svgCircle, 'Element', 'getAttributeNS', 'CALL', 'http://www.w3.org/1999/xlink', 'href'), '#ref');
assert.strictEqual(dispatch(svgCircle, 'Element', 'getAttribute', 'CALL', 'xlink:href'), '#ref');
assert.strictEqual(dispatch(svgCircle, 'Element', 'hasAttributeNS', 'CALL', 'http://www.w3.org/1999/xlink', 'href'), true);
dispatch(svgCircle, 'Element', 'removeAttributeNS', 'CALL', 'http://www.w3.org/1999/xlink', 'href');
assert.strictEqual(dispatch(svgCircle, 'Element', 'getAttributeNS', 'CALL', 'http://www.w3.org/1999/xlink', 'href'), null);
assert.strictEqual(dispatch(svgCircle, 'Element', 'getAttribute', 'CALL', 'xlink:href'), null);

const htmlDuplicate = dispatch(documentObject, 'Document', 'createElement', 'CALL', 'html');
assert.throws(
  () => dispatch(documentObject, 'Node', 'appendChild', 'CALL', htmlDuplicate),
  /HierarchyRequestError/,
  'document should keep single html root element'
);

assert.strictEqual(dispatch(div, 'Node', 'firstChild', 'GET'), span, 'firstChild should be span');
assert.strictEqual(dispatch(span, 'Node', 'parentNode', 'GET'), div, 'span parent should be div');
assert.strictEqual(dispatch(anchor, 'Node', 'parentNode', 'GET'), documentObject, 'anchor parent should be document');
const relationDivToSpan = dispatch(div, 'Node', 'compareDocumentPosition', 'CALL', span);
const relationSpanToDiv = dispatch(span, 'Node', 'compareDocumentPosition', 'CALL', div);
assert.strictEqual((relationDivToSpan & 0x10) === 0x10, true, 'div should contain span');
assert.strictEqual((relationSpanToDiv & 0x08) === 0x08, true, 'span should be contained by div');

const treeBeforeRemove = walkNames(documentObject);
assert.deepStrictEqual(treeBeforeRemove, ['#document', 'HTML', 'HEAD', 'BODY', 'DIV', 'SPAN', 'A']);

const style = dispatch(div, 'HTMLElement', 'style', 'GET');
style.width = '120px';
style.height = '36px';
style.color = 'red';
style.paddingLeft = '8px';
style.setProperty('margin-top', '10px');
style.setProperty('background-color', 'black');

const width = dispatch(div, 'HTMLElement', 'offsetWidth', 'GET');
const height = dispatch(div, 'HTMLElement', 'offsetHeight', 'GET');
const rect = dispatch(div, 'Element', 'getBoundingClientRect', 'CALL');

assert.strictEqual(width, 128, 'offsetWidth should include padding');
assert.strictEqual(height, 36, 'offsetHeight should read from style.height');
assert.strictEqual(rect.width, 128, 'rect width should match offsetWidth');
assert.strictEqual(rect.height, 36, 'rect height should match offsetHeight');
assert.strictEqual(style.color, '', 'non-layout style should be ignored');
assert.strictEqual(style.getPropertyValue('background-color'), '', 'setProperty should enforce allowlist');
assert.strictEqual(style.getPropertyValue('margin-top'), '10px', 'layout style should be accepted');

dispatch(documentObject, 'Node', 'removeChild', 'CALL', anchor);
assert.strictEqual(dispatch(anchor, 'Node', 'parentNode', 'GET'), null, 'removed node parent should be null');

const treeAfterRemove = walkNames(documentObject);
assert.deepStrictEqual(treeAfterRemove, ['#document', 'HTML', 'HEAD', 'BODY', 'DIV', 'SPAN']);

domShared.endTaskScope('task-a');
domShared.beginTaskScope('task-b');
const nextDocumentObject = dispatch(windowObject, 'Window', 'document', 'GET');
assert.notStrictEqual(nextDocumentObject, documentObject, 'new task should get isolated document');
assert.strictEqual(dispatch(documentObject, 'Node', 'childNodes', 'GET').length, 0, 'released document should be cleared');
domShared.endTaskScope('task-b');

console.log('[DOM Test] PASS');
console.log('[DOM Test] Tree before remove:', treeBeforeRemove.join(' > '));
console.log('[DOM Test] Tree after remove:', treeAfterRemove.join(' > '));
console.log('[DOM Test] div rect:', rect);
