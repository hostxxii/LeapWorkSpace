/**
 * 验证路线图新实现项：B16, C1-C6, A2
 */
const { initializeEnvironment, executeSignatureTask, shutdownEnvironment } = require('../../../leap-env/runner');

const SCRIPT = `
(function() {
  var pass = 0, fail = 0;
  function check(label, actual, expected) {
    var ok = expected === undefined ? !!actual : actual === expected;
    if (ok) {
      console.log('[PASS] ' + label + ': ' + actual);
      pass++;
    } else {
      console.log('[FAIL] ' + label + ': got=' + actual + ' expected=' + expected);
      fail++;
    }
  }

  // ── B16: Location 完整属性 ───────────────────────────────────────────
  var loc = window.location;
  check('B16 initial href', loc.href, 'about:blank');
  loc.href = 'https://www.example.com:8080/path/to/page?q=1&r=2#top';
  check('B16 protocol', loc.protocol, 'https:');
  check('B16 hostname', loc.hostname, 'www.example.com');
  check('B16 port', loc.port, '8080');
  check('B16 pathname', loc.pathname, '/path/to/page');
  check('B16 search', loc.search, '?q=1&r=2');
  check('B16 hash', loc.hash, '#top');
  check('B16 host', loc.host, 'www.example.com:8080');
  check('B16 origin', loc.origin, 'https://www.example.com:8080');
  check('B16 toString', loc.toString(), 'https://www.example.com:8080/path/to/page?q=1&r=2#top');

  // ── B16+: document.location 与 window.location 一致性 ───────────────
  check('B16+ doc.location===win.location', document.location === window.location, true);
  check('B16+ doc.hasOwnProp(location)', Object.prototype.hasOwnProperty.call(document, 'location'), true);
  check('B16+ doc.location.href', document.location.href, 'https://www.example.com:8080/path/to/page?q=1&r=2#top');

  // ── C5: Window 检测属性 ──────────────────────────────────────────────
  check('C5 outerWidth', window.outerWidth, 1920);
  check('C5 outerHeight', window.outerHeight, 1080);
  check('C5 devicePixelRatio', window.devicePixelRatio, 1);
  check('C5 scrollX', window.scrollX, 0);
  check('C5 scrollY', window.scrollY, 0);
  check('C5 pageXOffset', window.pageXOffset, 0);
  check('C5 pageYOffset', window.pageYOffset, 0);
  check('C5 screenX', window.screenX, 0);
  check('C5 screenY', window.screenY, 0);
  check('C5 screenLeft', window.screenLeft, 0);
  check('C5 screenTop', window.screenTop, 0);
  check('C5 isSecureContext', window.isSecureContext, true);
  check('C5 origin', window.origin, 'https://www.example.com:8080');
  check('C5 closed', window.closed, false);
  check('C5 opener', window.opener, null);
  check('C5 length', window.length, 0);
  check('C5 top===window', window.top === window, true);
  check('C5 parent===window', window.parent === window, true);
  window.name = 'testWin';
  check('C5 name get/set', window.name, 'testWin');
  window.status = 'loaded';
  check('C5 status get/set', window.status, 'loaded');

  // ── C6: atob / btoa ─────────────────────────────────────────────────
  var enc = btoa('Hello, World!');
  check('C6 btoa', enc, 'SGVsbG8sIFdvcmxkIQ==');
  check('C6 atob', atob(enc), 'Hello, World!');
  check('C6 roundtrip', atob(btoa('leap')), 'leap');

  // ── C3: History ──────────────────────────────────────────────────────
  try { check('C3 history.length', history.length, 1); } catch(e) { console.log('[ERR] C3 history.length: ' + e.message); }
  try { check('C3 history.state initial', history.state, null); } catch(e) { console.log('[ERR] C3 history.state: ' + e.message); }
  try { history.pushState({x:42},'','/p'); check('C3 pushState state.x', history.state && history.state.x, 42); } catch(e) { console.log('[ERR] C3 pushState: ' + e.message); }
  try { check('C3 pushState length', history.length, 2); } catch(e) { console.log('[ERR] C3 history.length2: ' + e.message); }

  // ── C2: Performance ──────────────────────────────────────────────────
  try { check('C2 timeOrigin>0', performance.timeOrigin > 0, true); } catch(e) { console.log('[ERR] C2 timeOrigin: ' + e.message); }
  try { check('C2 now()>0', performance.now() > 0, true); } catch(e) { console.log('[ERR] C2 now: ' + e.message); }
  try { check('C2 timing.navStart>0', performance.timing.navigationStart > 0, true); } catch(e) { console.log('[ERR] C2 timing: ' + e.message); }
  try { check('C2 getEntries array', Array.isArray(performance.getEntries()), true); } catch(e) { console.log('[ERR] C2 getEntries: ' + e.message); }

  // ── C4: localStorage ─────────────────────────────────────────────────
  try { localStorage.setItem('foo','bar'); check('C4 ls.getItem', localStorage.getItem('foo'), 'bar'); } catch(e) { console.log('[ERR] C4 ls: ' + e.message); }
  try { check('C4 ls.length', localStorage.length, 1); } catch(e) { console.log('[ERR] C4 ls.length: ' + e.message); }
  try { sessionStorage.setItem('foo','sess'); check('C4 ss.getItem', sessionStorage.getItem('foo'), 'sess'); } catch(e) { console.log('[ERR] C4 ss: ' + e.message); }
  try { sessionStorage.clear(); check('C4 ss.clear length', sessionStorage.length, 0); } catch(e) { console.log('[ERR] C4 ss.clear: ' + e.message); }

  // ── C1: Screen ───────────────────────────────────────────────────────
  try { check('C1 screen.width', window.screen.width, 1920); } catch(e) { console.log('[ERR] C1 screen: ' + e.message); }

  //ORIG_TESTS_PLACEHOLDER
  console.log('\\n=== Result: ' + pass + ' passed, ' + fail + ' failed ===');
})();
`;

var ctx = initializeEnvironment({ debug: false });
executeSignatureTask(ctx.leapvm, { targetScript: SCRIPT });
shutdownEnvironment(ctx.leapvm);
