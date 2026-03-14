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

const dom = global.leapenv.domShared;
dom.beginTaskScope('task-m2');

const html = `
<!doctype html>
<html>
  <head><title>x</title></head>
  <body>
    <div id="root" class="card hero">
      <span class="item active" data-k="v"></span>
      <p class="note">hello</p>
      <custom-x class="x"></custom-x>
    </div>
    <a id="lnk" class="btn primary"></a>
  </body>
</html>
`;

const parsedDoc = dispatch({}, 'Document', 'parseHTMLUnsafe', 'CALL', html);
assert.ok(parsedDoc && typeof parsedDoc === 'object');
assert.strictEqual(dispatch(parsedDoc, 'Node', 'nodeName', 'GET'), '#document');

const documentElement = dispatch(parsedDoc, 'Document', 'documentElement', 'GET');
const head = dispatch(parsedDoc, 'Document', 'head', 'GET');
const body = dispatch(parsedDoc, 'Document', 'body', 'GET');
assert.ok(documentElement);
assert.ok(head);
assert.ok(body);
assert.strictEqual(dispatch(documentElement, 'Node', 'nodeName', 'GET'), 'HTML');

const root = dispatch(parsedDoc, 'Document', 'getElementById', 'CALL', 'root');
assert.ok(root);
assert.strictEqual(dispatch(root, 'Element', 'id', 'GET'), 'root');
assert.strictEqual(dispatch(root, 'Element', 'className', 'GET'), 'card hero');

const span = dispatch(parsedDoc, 'Document', 'querySelector', 'CALL', '#root span.item.active');
assert.ok(span);
assert.strictEqual(dispatch(span, 'Element', 'getAttribute', 'CALL', 'data-k'), 'v');
assert.strictEqual(dispatch(span, 'Element', 'matches', 'CALL', '#root > span.item.active'), true);
assert.strictEqual(dispatch(span, 'Element', 'matches', 'CALL', 'body > span.item.active'), false);
assert.strictEqual(dispatch(span, 'Element', 'hasAttribute', 'CALL', 'data-k'), true);
dispatch(span, 'Element', 'removeAttribute', 'CALL', 'data-k');
assert.strictEqual(dispatch(span, 'Element', 'getAttribute', 'CALL', 'data-k'), null);

const allButtons = dispatch(parsedDoc, 'Document', 'querySelectorAll', 'CALL', '.btn.primary');
assert.strictEqual(allButtons.length, 1);
assert.strictEqual(dispatch(allButtons.item(0), 'Node', 'nodeName', 'GET'), 'A');

const classNodes = dispatch(parsedDoc, 'Document', 'getElementsByClassName', 'CALL', 'card hero');
assert.strictEqual(classNodes.length, 1);

const tagNodes = dispatch(parsedDoc, 'Document', 'getElementsByTagName', 'CALL', 'span');
assert.strictEqual(tagNodes.length, 1);

const firstInRoot = dispatch(root, 'Element', 'querySelector', 'CALL', 'p.note');
assert.ok(firstInRoot);

const inRootAll = dispatch(root, 'Element', 'querySelectorAll', 'CALL', '.x, .note');
assert.strictEqual(inRootAll.length, 2);

const pNode = dispatch(parsedDoc, 'Document', 'querySelector', 'CALL', 'p.note');
const customNode = dispatch(parsedDoc, 'Document', 'querySelector', 'CALL', 'custom-x');
assert.strictEqual(dispatch(parsedDoc, 'Document', 'querySelector', 'CALL', '#root > span.item.active + p.note'), pNode);
assert.strictEqual(dispatch(parsedDoc, 'Document', 'querySelector', 'CALL', '#root > span.item.active ~ custom-x.x'), customNode);
assert.strictEqual(dom.getCtorName(pNode), 'HTMLParagraphElement');
assert.strictEqual(dom.getCtorName(customNode), 'HTMLUnknownElement');

dispatch(customNode, 'Element', 'setAttribute', 'CALL', 'data-val', 'alpha-beta gamma');
dispatch(customNode, 'Element', 'setAttribute', 'CALL', 'lang', 'en-US');
assert.strictEqual(dispatch(parsedDoc, 'Document', 'querySelector', 'CALL', '#root > :first-child'), span);
assert.strictEqual(dispatch(parsedDoc, 'Document', 'querySelector', 'CALL', '#root > :last-child'), customNode);
assert.strictEqual(dispatch(pNode, 'Element', 'matches', 'CALL', 'p.note:nth-child(2)'), true);
assert.strictEqual(dispatch(pNode, 'Element', 'matches', 'CALL', 'p.note:nth-of-type(1)'), true);
assert.strictEqual(dispatch(pNode, 'Element', 'matches', 'CALL', 'p.note:not(.active)'), true);
assert.strictEqual(dispatch(root, 'Element', 'querySelector', 'CALL', ':scope > p.note'), pNode);
assert.strictEqual(dispatch(customNode, 'Element', 'matches', 'CALL', '[data-val^="alpha"]'), true);
assert.strictEqual(dispatch(customNode, 'Element', 'matches', 'CALL', '[data-val$="gamma"]'), true);
assert.strictEqual(dispatch(customNode, 'Element', 'matches', 'CALL', '[data-val*="beta"]'), true);
assert.strictEqual(dispatch(customNode, 'Element', 'matches', 'CALL', '[data-val~="gamma"]'), true);
assert.strictEqual(dispatch(customNode, 'Element', 'matches', 'CALL', '[lang|="en"]'), true);
assert.strictEqual(dispatch(customNode, 'Element', 'matches', 'CALL', '[lang="en-us" i]'), true);

dom.endTaskScope('task-m2');

console.log('[DOM M2 Test] PASS');
