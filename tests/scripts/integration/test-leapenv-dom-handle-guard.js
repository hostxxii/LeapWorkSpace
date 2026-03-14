'use strict';

const assert = require('assert');
const { runJsonWithPreloadedTarget } = require('./standalone-preload-helper');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

function parseJson(raw, label) {
  try {
    return JSON.parse(String(raw));
  } catch (err) {
    err.message = `[${label}] JSON parse failed: ${err.message}\nraw=${raw}`;
    throw err;
  }
}

async function main() {
  const result = parseJson(await runJsonWithPreloadedTarget(`
      (function () {
        // 1. 基本 DOM 创建与引用一致性
        var div1 = document.createElement('div');
        div1.id = 'guard-test';
        document.body.appendChild(div1);

        // getElementById 应返回同一个引用
        var div2 = document.getElementById('guard-test');
        var sameRef = (div1 === div2);

        // 2. 多次获取同一节点应返回同一 wrapper
        var body1 = document.body;
        var body2 = document.body;
        var bodySameRef = (body1 === body2);

        // 3. childNodes 一致性 — live collection 返回的节点是同一引用
        var parent = document.createElement('div');
        var child = document.createElement('span');
        parent.appendChild(child);
        var childFromNodes = parent.childNodes[0];
        var childSameRef = (child === childFromNodes);

        // 4. removeChild 后节点状态
        parent.removeChild(child);
        var parentAfterRemove = child.parentNode;
        var childNodesAfterRemove = parent.childNodes.length;

        // 5. 从 DOM 树移除后 — 节点仍可操作（不崩溃）
        var detachedOk = false;
        try {
          child.id = 'detached';
          child.setAttribute('data-test', '1');
          var attrVal = child.getAttribute('data-test');
          detachedOk = (child.id === 'detached' && attrVal === '1');
        } catch (e) {
          detachedOk = false;
        }

        // 6. replaceChild 正确性
        var newChild = document.createElement('em');
        parent.appendChild(document.createElement('b'));
        var oldChild = parent.firstChild;
        parent.replaceChild(newChild, oldChild);
        var replacedOk = (parent.firstChild === newChild);
        var oldParentAfterReplace = oldChild.parentNode;

        return JSON.stringify({
          sameRef: sameRef,
          bodySameRef: bodySameRef,
          childSameRef: childSameRef,
          parentAfterRemoveIsNull: parentAfterRemove === null,
          childNodesAfterRemove: childNodesAfterRemove,
          detachedOk: detachedOk,
          replacedOk: replacedOk,
          oldParentAfterReplaceIsNull: oldParentAfterReplace === null
        });
      })()`,
      {
        taskId: 'dom-handle-guard',
      },
      { debug: false },
      'dom-handle-guard'
    ), 'dom-handle-guard');

    assert.strictEqual(result.sameRef, true,
      'getElementById should return same reference as createElement');
    assert.strictEqual(result.bodySameRef, true,
      'multiple accesses to document.body should return same reference');
    assert.strictEqual(result.childSameRef, true,
      'childNodes[0] should be same reference as appended child');
    assert.strictEqual(result.parentAfterRemoveIsNull, true,
      'removed child parentNode should be null');
    assert.strictEqual(result.childNodesAfterRemove, 0,
      'parent childNodes should be empty after removeChild');
    assert.strictEqual(result.detachedOk, true,
      'detached node should still be operable');
    assert.strictEqual(result.replacedOk, true,
      'replaceChild should place new child correctly');
    assert.strictEqual(result.oldParentAfterReplaceIsNull, true,
      'replaced child parentNode should be null');

    console.log('[DOM Handle Guard Test] PASS');
}

main().catch((err) => {
  console.error('[DOM Handle Guard Test] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
