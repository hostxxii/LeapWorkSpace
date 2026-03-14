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
        var doc = document;

        // 1. 创建元素并设置样式
        var root = doc.createElement('div');
        root.style.position = 'relative';
        root.style.width = '120px';
        root.style.height = '24px';
        root.style.padding = '4px 6px';
        root.style.borderLeftWidth = '2px';
        root.style.borderRightWidth = '2px';

        var child = doc.createElement('span');
        child.style.position = 'absolute';
        child.style.left = '9px';
        child.style.top = '5px';
        child.style.width = '11px';
        child.style.height = '7px';

        root.appendChild(child);
        doc.body.appendChild(root);

        // 2. 读取布局值 — 通过公共 DOM API
        var rootOffsetWidth = root.offsetWidth;
        var rootOffsetHeight = root.offsetHeight;
        var childOffsetLeft = child.offsetLeft;
        var childOffsetTop = child.offsetTop;
        var childOffsetWidth = child.offsetWidth;
        var childOffsetHeight = child.offsetHeight;

        // offsetWidth = width + paddingLeft + paddingRight + borderLeft + borderRight
        // = 120 + 6 + 6 + 2 + 2 = 136
        var expectedRootWidth = 136;

        // 3. getBoundingClientRect 一致性
        var rootRect = root.getBoundingClientRect();
        var childRect = child.getBoundingClientRect();
        var rootRectWidth = rootRect ? rootRect.width : -1;

        // 4. removeChild → 验证布局变化
        var childCountBefore = root.childNodes.length;
        root.removeChild(child);
        var childCountAfter = root.childNodes.length;

        // 5. 动态样式修改 → 布局更新
        root.style.width = '200px';
        var updatedWidth = root.offsetWidth;
        // expectedUpdatedWidth = 200 + 6 + 6 + 2 + 2 = 216
        var expectedUpdatedWidth = 216;

        // 6. DOM 树结构一致性
        var secondChild = doc.createElement('div');
        secondChild.id = 'second';
        root.appendChild(secondChild);
        var foundById = doc.getElementById('second');
        var idMatch = (foundById === secondChild);

        var thirdChild = doc.createElement('p');
        root.insertBefore(thirdChild, secondChild);
        var firstChildIsP = (root.firstChild === thirdChild);
        var lastChildIsDiv = (root.lastChild === secondChild);
        var childCountFinal = root.childNodes.length;

        return JSON.stringify({
          rootOffsetWidth: rootOffsetWidth,
          expectedRootWidth: expectedRootWidth,
          rootOffsetHeight: rootOffsetHeight,
          childOffsetLeft: childOffsetLeft,
          childOffsetTop: childOffsetTop,
          childOffsetWidth: childOffsetWidth,
          childOffsetHeight: childOffsetHeight,
          rootRectWidth: rootRectWidth,
          childCountBefore: childCountBefore,
          childCountAfter: childCountAfter,
          updatedWidth: updatedWidth,
          expectedUpdatedWidth: expectedUpdatedWidth,
          idMatch: idMatch,
          firstChildIsP: firstChildIsP,
          lastChildIsDiv: lastChildIsDiv,
          childCountFinal: childCountFinal
        });
      })()`,
      {
        taskId: 'dom-ssot-consistency',
      },
      { debug: false },
      'dom-ssot-consistency'
    ), 'dom-ssot-consistency');

    // 布局一致性
    assert.strictEqual(result.rootOffsetWidth, result.expectedRootWidth,
      `root offsetWidth should be ${result.expectedRootWidth}, got ${result.rootOffsetWidth}`);
    assert.ok(result.rootOffsetHeight > 0,
      'root offsetHeight should be positive');
    assert.strictEqual(result.childOffsetWidth, 11,
      'child offsetWidth should be 11');
    assert.strictEqual(result.childOffsetHeight, 7,
      'child offsetHeight should be 7');

    // getBoundingClientRect 与 offsetWidth 一致
    if (result.rootRectWidth > 0) {
      assert.strictEqual(result.rootRectWidth, result.expectedRootWidth,
        'getBoundingClientRect().width should match offsetWidth');
    }

    // removeChild 反映在 DOM 结构
    assert.strictEqual(result.childCountBefore, 1,
      'should have 1 child before remove');
    assert.strictEqual(result.childCountAfter, 0,
      'should have 0 children after remove');

    // 动态样式修改后布局更新
    assert.strictEqual(result.updatedWidth, result.expectedUpdatedWidth,
      `updated offsetWidth should be ${result.expectedUpdatedWidth}, got ${result.updatedWidth}`);

    // DOM 树结构操作一致性
    assert.strictEqual(result.idMatch, true,
      'getElementById should find dynamically appended element');
    assert.strictEqual(result.firstChildIsP, true,
      'insertBefore should place p before div');
    assert.strictEqual(result.lastChildIsDiv, true,
      'last child should still be the div');
    assert.strictEqual(result.childCountFinal, 2,
      'should have 2 children after insertBefore');

    console.log('[DOM Native SSOT Consistency Test] PASS');
}

main().catch((err) => {
  console.error('[DOM Native SSOT Consistency Test] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
