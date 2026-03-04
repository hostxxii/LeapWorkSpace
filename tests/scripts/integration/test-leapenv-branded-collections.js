const assert = require('assert');
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

function runTaskJson(ctx, taskId, targetScript) {
  return parseJson(executeSignatureTask(ctx.leapvm, { taskId, targetScript }), taskId);
}

function main() {
  const ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  try {
    const result = runTaskJson(ctx, 'branded-collections', `
      (function () {
        var root = document.createElement('div');
        root.id = 'root';
        var a = document.createElement('span');
        a.id = 'a';
        a.className = 'k1 k2';
        a.setAttribute('name', 'nodeA');
        a.setAttribute('data-x', '1');
        var b = document.createElement('span');
        b.id = 'b';
        b.className = 'k2';
        root.appendChild(a);
        root.appendChild(b);
        document.body.appendChild(root);

        var childNodes = root.childNodes;
        var children = root.children;
        var qsa = root.querySelectorAll('span');
        var byTag = root.getElementsByTagName('span');
        var byClass = root.getElementsByClassName('k2');

        var classList = a.classList;
        classList.add('k3');
        classList.remove('k1');
        var toggled = classList.toggle('k4');
        var replaced = classList.replace('k2', 'k2x');

        var attrs = a.attributes;
        var attr0 = attrs.item(0);
        var dataX = attrs.getNamedItem('data-x');
        attrs.setNamedItem({ name: 'data-y', value: '2' });
        var dataY = attrs.getNamedItem('data-y');
        var removed = attrs.removeNamedItem('data-x');

        function iterToArray(it, mapper) {
          var out = [];
          var cur;
          while (it && typeof it.next === 'function' && !(cur = it.next()).done) {
            out.push(mapper ? mapper(cur.value) : cur.value);
          }
          return out;
        }

        var nodeListEntries = iterToArray(childNodes.entries(), function (v) {
          return [v[0], v[1] && v[1].id || null];
        });
        var nodeListValues = iterToArray(childNodes.values(), function (v) { return v && v.id || null; });

        var domTokenEntries = iterToArray(classList.entries(), function (v) { return [v[0], v[1]]; });
        return JSON.stringify({
          brands: {
            childNodes: Object.prototype.toString.call(childNodes),
            children: Object.prototype.toString.call(children),
            qsa: Object.prototype.toString.call(qsa),
            byTag: Object.prototype.toString.call(byTag),
            byClass: Object.prototype.toString.call(byClass),
            classList: Object.prototype.toString.call(classList),
            attributes: Object.prototype.toString.call(attrs)
          },
          nodeList: {
            length: childNodes.length,
            item0Id: childNodes.item(0) && childNodes.item(0).id || null,
            idx1Id: childNodes[1] && childNodes[1].id || null,
            forEachIds: (function () {
              var out = [];
              childNodes.forEach(function (n) { out.push(n && n.id || null); });
              return out;
            })(),
            entries: nodeListEntries,
            values: nodeListValues
          },
          htmlCollection: {
            childrenLength: children.length,
            childrenItem0: children.item(0) && children.item(0).id || null,
            childrenIdx1: children[1] && children[1].id || null,
            byTagLength: byTag.length,
            byClassLength: byClass.length,
            byClassNamedItemA: byClass.namedItem('a') && byClass.namedItem('a').id || null,
            byTagNamedItemNodeA: byTag.namedItem('nodeA') && byTag.namedItem('nodeA').id || null
          },
          domTokenList: {
            length: classList.length,
            value: classList.value,
            item0: classList.item(0),
            idx0: classList[0],
            containsK3: classList.contains('k3'),
            containsK1: classList.contains('k1'),
            toggled: toggled,
            replaced: replaced,
            toStringValue: classList.toString(),
            entries: domTokenEntries
          },
          namedNodeMap: {
            length: attrs.length,
            item0Name: attr0 && attr0.name || null,
            dataXValue: dataX && dataX.value || null,
            dataYValue: dataY && dataY.value || null,
            removedName: removed && removed.name || null,
            hasDataXAfterRemove: !!attrs.getNamedItem('data-x'),
            idx0Name: attrs[0] && attrs[0].name || null
          }
        });
      })();
    `);

    assert.strictEqual(result.brands.childNodes, '[object NodeList]');
    assert.strictEqual(result.brands.children, '[object HTMLCollection]');
    assert.strictEqual(result.brands.qsa, '[object NodeList]');
    assert.strictEqual(result.brands.byTag, '[object HTMLCollection]');
    assert.strictEqual(result.brands.byClass, '[object HTMLCollection]');
    assert.strictEqual(result.brands.classList, '[object DOMTokenList]');
    assert.strictEqual(result.brands.attributes, '[object NamedNodeMap]');

    assert.strictEqual(result.nodeList.length, 2);
    assert.strictEqual(result.nodeList.item0Id, 'a');
    assert.strictEqual(result.nodeList.idx1Id, 'b');
    assert.deepStrictEqual(result.nodeList.forEachIds, ['a', 'b']);
    assert.deepStrictEqual(result.nodeList.values, ['a', 'b']);
    assert.deepStrictEqual(result.nodeList.entries, [[0, 'a'], [1, 'b']]);

    assert.strictEqual(result.htmlCollection.childrenLength, 2);
    assert.strictEqual(result.htmlCollection.childrenItem0, 'a');
    assert.strictEqual(result.htmlCollection.childrenIdx1, 'b');
    assert.strictEqual(result.htmlCollection.byTagLength, 2);
    assert.strictEqual(result.htmlCollection.byClassLength, 2);
    assert.strictEqual(result.htmlCollection.byClassNamedItemA, 'a');
    assert.strictEqual(result.htmlCollection.byTagNamedItemNodeA, 'a');

    assert.strictEqual(result.domTokenList.length >= 2, true);
    assert.strictEqual(result.domTokenList.containsK3, true);
    assert.strictEqual(result.domTokenList.containsK1, false);
    assert.strictEqual(result.domTokenList.toggled, true);
    assert.strictEqual(result.domTokenList.replaced, true);
    assert.strictEqual(result.domTokenList.toStringValue, result.domTokenList.value);
    assert.strictEqual(typeof result.domTokenList.item0, 'string');
    assert.strictEqual(typeof result.domTokenList.idx0, 'string');
    assert.ok(Array.isArray(result.domTokenList.entries));

    assert.strictEqual(result.namedNodeMap.dataXValue, '1');
    assert.strictEqual(result.namedNodeMap.dataYValue, '2');
    assert.strictEqual(result.namedNodeMap.removedName, 'data-x');
    assert.strictEqual(result.namedNodeMap.hasDataXAfterRemove, false);
    assert.strictEqual(typeof result.namedNodeMap.idx0Name, 'string');

    console.log('[branded-collections] PASS');
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

try {
  main();
} catch (err) {
  console.error('[branded-collections] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
