const assert = require('assert');
const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));

const script = `
function createNode(tagName) {
  const upper = tagName ? String(tagName).toUpperCase() : '#document';
  return {
    tagName: upper,
    attrs: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(name, value) {
      this.attrs[String(name)] = String(value == null ? '' : value);
    }
  };
}

const doc = createNode('');
doc.createElement = function createElement(tag) {
  return createNode(tag);
};

$native.dom.parseHTMLIntoDocument(doc, '<!doctype html><html><head></head><body><div id="root" class="card"><span data-k="v"></span><img src="/a.png"></body></html>');

function snapshot(node) {
  return {
    tagName: node.tagName,
    attrs: node.attrs || {},
    children: (node.children || []).map(snapshot)
  };
}

JSON.stringify(snapshot(doc));
`;

try {
  const result = leapvm.runScript(script);
  const tree = JSON.parse(result);

  assert.strictEqual(tree.tagName, '#document');
  // Public backend label is "native-core".
  // When LEAPVM_HAS_LEXBOR is enabled, parseHTMLIntoDocument may internally
  // take the Lexbor fast path, then fallback to native parser if needed.
  assert.strictEqual(
    leapvm.runScript("String(($native.dom && $native.dom.backend) || 'unknown')"),
    'native-core'
  );
  assert.strictEqual(tree.children.length, 1);
  assert.strictEqual(tree.children[0].tagName, 'HTML');
  assert.strictEqual(tree.children[0].children[1].tagName, 'BODY');

  const body = tree.children[0].children[1];
  assert.strictEqual(body.children.length, 1);
  assert.strictEqual(body.children[0].tagName, 'DIV');
  assert.strictEqual(body.children[0].attrs.id, 'root');
  assert.strictEqual(body.children[0].attrs.class, 'card');
  assert.strictEqual(body.children[0].children[0].tagName, 'SPAN');
  assert.strictEqual(body.children[0].children[0].attrs['data-k'], 'v');
  assert.strictEqual(body.children[0].children[1].tagName, 'IMG');
  assert.strictEqual(body.children[0].children[1].attrs.src, '/a.png');

  console.log('[DOM Native Parse Test] PASS');
} finally {
  leapvm.shutdown();
}
