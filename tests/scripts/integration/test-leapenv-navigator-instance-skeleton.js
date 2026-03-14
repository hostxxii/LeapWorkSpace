/**
 * 验证 Navigator.instance.skeleton.js 是否真正必要
 * 通过 runner.js 完整 VM 路径运行，而非 mock dispatch
 */
const { runWithPreloadedTarget } = require('./standalone-preload-helper');

const TEST_SCRIPT = `
(function() {
  var results = {};

  // 1. typeof 检查
  results.typeof = typeof window.navigator;

  // 2. instanceof 检查
  try {
    results.instanceof = window.navigator instanceof Navigator;
  } catch(e) {
    results.instanceof = 'ERROR: ' + e.message;
  }

  // 3. 同一性检查（缓存是否生效）
  results.identity = (window.navigator === window.navigator);

  // 4. 属性访问
  results.userAgent = typeof window.navigator.userAgent === 'string'
    ? window.navigator.userAgent.slice(0, 40) + '...'
    : 'NOT_STRING';

  results.platform   = window.navigator.platform;
  results.language   = window.navigator.language;
  results.webdriver  = window.navigator.webdriver;
  results.onLine     = window.navigator.onLine;

  // 5. 原型链检查
  try {
    results.proto1 = Object.getPrototypeOf(window.navigator) === Navigator.prototype;
  } catch(e) {
    results.proto1 = 'ERROR: ' + e.message;
  }

  // 6. 属性描述符检查（brand check 核心）
  try {
    var desc = Object.getOwnPropertyDescriptor(window, 'navigator');
    results.navigatorDescKind = desc
      ? (desc.get ? 'accessor' : 'data')
      : 'not-own-property';
  } catch(e) {
    results.navigatorDescKind = 'ERROR: ' + e.message;
  }

  // 7. brand check 验证（Illegal invocation）
  try {
    var nav = window.navigator;
    var boundGetter = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
    if (boundGetter && boundGetter.get) {
      boundGetter.get.call({}); // 用非 Navigator 对象调用 → 应该抛出
      results.brandCheck = 'FAIL: no error thrown';
    } else {
      results.brandCheck = 'SKIP: no getter descriptor';
    }
  } catch(e) {
    results.brandCheck = 'PASS: ' + e.message;
  }

  console.log('[NAV_TEST]', JSON.stringify(results, null, 2));
})();
`;

async function runTest(label) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${label}`);
  console.log('='.repeat(60));

  try {
    await runWithPreloadedTarget(TEST_SCRIPT, {}, { debug: false });
  } catch(e) {
    console.error('[FATAL]', e.message);
  }
}

runTest('Navigator instance skeleton 验证').catch((err) => {
  console.error('[navigator-instance-skeleton] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
