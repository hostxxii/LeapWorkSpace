#!/usr/bin/env node
'use strict';

const path = require('path');
const assert = require('assert');

// --- Load leap-env runtime for CSS-compatible DOM layout path ---
require(path.resolve(__dirname, '../../../leap-env/src/core/runtime.js'));
require(path.resolve(__dirname, '../../../leap-env/src/core/tools.js'));
require(path.resolve(__dirname, '../../../leap-env/src/impl/00-dom-shared.impl.js'));
require(path.resolve(__dirname, '../../../leap-env/src/impl/EventTarget.impl.js'));
require(path.resolve(__dirname, '../../../leap-env/src/impl/Node.impl.js'));
require(path.resolve(__dirname, '../../../leap-env/src/impl/Element.impl.js'));
require(path.resolve(__dirname, '../../../leap-env/src/impl/HTMLElement.impl.js'));
require(path.resolve(__dirname, '../../../leap-env/src/impl/Document.impl.js'));
require(path.resolve(__dirname, '../../../leap-env/src/impl/HTMLDocument.impl.js'));
require(path.resolve(__dirname, '../../../leap-env/src/impl/Window.impl.js'));

const {
  DoDTree,
  DomToDoDConverter,
  DoDLayoutEngine,
} = require(path.resolve(__dirname, '../../../leap-env/src/impl/dod-layout-engine.js'));

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

function benchCssCompat(nodeCount, iterations) {
  const dom = global.leapenv.domShared;
  dom.setDomBackend('dod');

  const taskId = 'bench-css-' + nodeCount + '-' + Date.now();
  dom.beginTaskScope(taskId);

  const windowObject = {};
  const documentObject = get(windowObject, 'Window', 'document');
  assert.ok(documentObject, 'document object missing');

  const root = call(documentObject, 'Document', 'createElement', 'div');
  const rootStyle = get(root, 'HTMLElement', 'style');
  rootStyle.position = 'relative';
  rootStyle.width = '1024px';
  rootStyle.height = '768px';
  rootStyle.paddingLeft = '8px';
  rootStyle.paddingTop = '8px';
  rootStyle.borderLeftWidth = '1px';
  rootStyle.borderTopWidth = '1px';

  const children = [];
  for (let i = 0; i < nodeCount - 1; i++) {
    const child = call(documentObject, 'Document', 'createElement', 'div');
    const style = get(child, 'HTMLElement', 'style');
    style.position = 'absolute';
    style.left = (i % 64) + 'px';
    style.top = ((i * 3) % 64) + 'px';
    style.width = (20 + (i % 20)) + 'px';
    style.height = (12 + (i % 18)) + 'px';
    style.paddingLeft = (i % 3) + 'px';
    style.paddingRight = (i % 2) + 'px';
    style.borderLeftWidth = '1px';
    style.borderRightWidth = '1px';
    call(root, 'Node', 'appendChild', child);
    children.push(child);
  }
  call(documentObject, 'Node', 'appendChild', root);

  for (let i = 0; i < 20; i++) {
    const idx = i % children.length;
    const s = get(children[idx], 'HTMLElement', 'style');
    s.left = ((i * 7) % 97) + 'px';
    get(root, 'HTMLElement', 'offsetWidth');
  }

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    const idx = i % children.length;
    const s = get(children[idx], 'HTMLElement', 'style');
    s.left = ((i * 13) % 211) + 'px';
    s.top = ((i * 17) % 149) + 'px';
    s.width = (20 + (i % 23)) + 'px';

    // 触发布局读取
    const w = get(root, 'HTMLElement', 'offsetWidth');
    const h = get(root, 'HTMLElement', 'offsetHeight');
    const x = get(children[idx], 'HTMLElement', 'offsetLeft');
    if (w < 0 || h < 0 || x < 0) {
      throw new Error('invalid layout result');
    }
  }
  const t1 = process.hrtime.bigint();

  call(documentObject, 'Node', 'removeChild', root);
  dom.endTaskScope(taskId);

  const totalMs = Number(t1 - t0) / 1e6;
  return {
    totalMs,
    msPerOp: totalMs / iterations,
    opsPerSec: (iterations * 1000) / totalMs,
  };
}

function createDoDTree(nodeCount) {
  const tree = new DoDTree(Math.max(512, nodeCount + 16));
  const rootId = tree.addNode(-1);
  tree.rootId = rootId;
  tree.setStyle(rootId, 1024, 768, 0, 0);

  for (let i = 0; i < nodeCount - 1; i++) {
    const childId = tree.addNode(rootId);
    tree.setStyle(
      childId,
      20 + (i % 20),
      12 + (i % 18),
      i % 64,
      (i * 3) % 64
    );
    tree.setPadding(childId, i % 3, 0, i % 2, 0);
    tree.setMargin(childId, 0, 0, 0, 0);
  }
  return tree;
}

function benchPureDoD(nodeCount, iterations) {
  const tree = createDoDTree(nodeCount);

  for (let i = 0; i < 20; i++) {
    const id = 1 + (i % (nodeCount - 1));
    tree.left[id] = (i * 7) % 97;
    DoDLayoutEngine.compute(tree, 1024, 768);
  }

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    const id = 1 + (i % (nodeCount - 1));
    tree.left[id] = (i * 13) % 211;
    tree.top[id] = (i * 17) % 149;
    tree.widths[id] = 20 + (i % 23);

    DoDLayoutEngine.compute(tree, 1024, 768);

    const w = tree.computedWidths[0];
    const h = tree.computedHeights[0];
    const x = tree.computedLefts[id];
    if (w < 0 || h < 0 || x < 0) {
      throw new Error('invalid dod layout result');
    }
  }
  const t1 = process.hrtime.bigint();

  const totalMs = Number(t1 - t0) / 1e6;
  return {
    totalMs,
    msPerOp: totalMs / iterations,
    opsPerSec: (iterations * 1000) / totalMs,
  };
}

function createMockDomTree(nodeCount) {
  const root = {
    style: {
      position: 'relative',
      width: '1024px',
      height: '768px',
      paddingLeft: '8px',
      paddingTop: '8px'
    },
    children: []
  };

  for (let i = 0; i < nodeCount - 1; i++) {
    root.children.push({
      style: {
        position: 'absolute',
        left: (i % 64) + 'px',
        top: ((i * 3) % 64) + 'px',
        width: (20 + (i % 20)) + 'px',
        height: (12 + (i % 18)) + 'px',
        paddingLeft: (i % 3) + 'px',
        paddingRight: (i % 2) + 'px'
      },
      children: []
    });
  }
  return root;
}

function benchDoDRebuild(nodeCount, iterations) {
  const root = createMockDomTree(nodeCount);
  const converter = new DomToDoDConverter();
  const children = root.children;

  for (let i = 0; i < 20; i++) {
    const idx = i % children.length;
    children[idx].style.left = ((i * 7) % 97) + 'px';
    const tree = converter.convert(root, nodeCount + 8);
    DoDLayoutEngine.compute(tree, 1024, 768);
  }

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    const idx = i % children.length;
    children[idx].style.left = ((i * 13) % 211) + 'px';
    children[idx].style.top = ((i * 17) % 149) + 'px';
    children[idx].style.width = (20 + (i % 23)) + 'px';

    const tree = converter.convert(root, nodeCount + 8);
    DoDLayoutEngine.compute(tree, 1024, 768);

    const w = tree.computedWidths[0];
    const h = tree.computedHeights[0];
    const x = tree.computedLefts[1 + idx];
    if (w < 0 || h < 0 || x < 0) {
      throw new Error('invalid dod rebuild result');
    }
  }
  const t1 = process.hrtime.bigint();

  const totalMs = Number(t1 - t0) / 1e6;
  return {
    totalMs,
    msPerOp: totalMs / iterations,
    opsPerSec: (iterations * 1000) / totalMs,
  };
}

function fmt(n, d = 2) {
  return Number(n).toFixed(d);
}

function main() {
  const scales = [50, 200, 500, 1000];
  const iterations = Number.parseInt(process.env.LEAP_BENCH_ITERS || '400', 10);

  console.log('[bench-css-vs-dod] iterations per scale =', iterations);
  console.log('nodes | css(ms/op) | dod-fast(ms/op) | dod-rebuild(ms/op) | css vs dod-fast | css vs dod-rebuild');
  console.log('----- | ---------- | --------------- | ------------------ | --------------- | ------------------');

  let cssSum = 0;
  let dodFastSum = 0;
  let dodRebuildSum = 0;

  for (const n of scales) {
    const css = benchCssCompat(n, iterations);
    const dodFast = benchPureDoD(n, iterations);
    const dodRebuild = benchDoDRebuild(n, iterations);
    const lossFastPct = ((css.msPerOp - dodFast.msPerOp) / dodFast.msPerOp) * 100;
    const lossRebuildPct = ((css.msPerOp - dodRebuild.msPerOp) / dodRebuild.msPerOp) * 100;

    cssSum += css.msPerOp;
    dodFastSum += dodFast.msPerOp;
    dodRebuildSum += dodRebuild.msPerOp;

    console.log(
      `${String(n).padEnd(5)} | ${fmt(css.msPerOp, 4).padEnd(10)} | ${fmt(dodFast.msPerOp, 4).padEnd(15)} | ${fmt(dodRebuild.msPerOp, 4).padEnd(18)} | ${fmt(lossFastPct, 2).padEnd(15)} | ${fmt(lossRebuildPct, 2)}`
    );
  }

  const avgLossFast = ((cssSum - dodFastSum) / dodFastSum) * 100;
  const avgLossRebuild = ((cssSum - dodRebuildSum) / dodRebuildSum) * 100;
  console.log('\n[summary] avg loss vs dod-fast =', fmt(avgLossFast, 2) + '%');
  console.log('[summary] avg loss vs dod-rebuild =', fmt(avgLossRebuild, 2) + '%');
}

main();
