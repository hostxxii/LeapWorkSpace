const { initializeEnvironment, executeSignatureTask, shutdownEnvironment } = require('../../../leap-env/runner');

try {
  const { leapvm } = initializeEnvironment({
    targetScript: ''
  });

  // T21: Same-origin iframe test
  // siteProfile 注入 location.origin = 'https://www.example.com'，
  // 使 HTMLIFrameElement.impl.js 内 isSameOrigin('https://www.example.com/sub') 返回 true。
  console.log('\n=== T21: Same-origin iframe test ===');
  const result = executeSignatureTask(leapvm, {
    siteProfile: {
      fingerprintSnapshot: {
        location: {
          origin: 'https://www.example.com',
          href: 'https://www.example.com/'
        }
      }
    },
    targetScript: [
      "try {",
      "  var iframe = document.createElement('iframe');",
      "  console.log('[T21] createElement OK:', typeof iframe);",
      "",
      "  if (document && document.body && typeof document.body.appendChild === 'function') {",
      "    document.body.appendChild(iframe);",
      "  }",
      "",
      "  iframe.src = 'https://www.example.com/sub';",
      "",
      "  var cw = iframe.contentWindow;",
      "",
      "  var test1 = !!cw;",
      "  var test2 = false;",
      "  try {",
      "    test2 = cw ? !!cw.document : false;",
      "  } catch(e2) {",
      "    console.log('[T21] cw.document error:', e2.message);",
      "  }",
      "  var test3 = false;",
      "  try {",
      "    test3 = window.frames[0] === cw;",
      "  } catch(e3) {",
      "    console.log('[T21] frames[0] error:', e3.message);",
      "  }",
      "  var test4 = window.length === 1;",
      "  var test5 = false;",
      "  try {",
      "    test5 = !!(cw && cw.location && cw.location.href === 'https://www.example.com/sub');",
      "  } catch(e4) {",
      "    console.log('[T21] cw.location.href error:', e4.message);",
      "  }",
      "  var test6 = false;",
      "  try {",
      "    var crossCreate = Document && Document.prototype && Document.prototype.createElement;",
      "    if (typeof crossCreate === 'function' && cw && cw.document) {",
      "      var fromMainProto = crossCreate.call(cw.document, 'div');",
      "      test6 = !!fromMainProto;",
      "    }",
      "  } catch(e5) {",
      "    console.log('[T21] cross-frame brand call error:', e5.message);",
      "  }",
      "",
      "  console.log('[T21] contentWindow exists:', test1);",
      "  console.log('[T21] contentDocument exists:', test2);",
      "  console.log('[T21] frames[0] === cw:', test3);",
      "  console.log('[T21] window.length === 1:', test4);",
      "  console.log('[T21] child href match:', test5);",
      "  console.log('[T21] cross-frame brand call:', test6);",
      "",
      "  String(test1 && test2 && test3 && test4 && test5 && test6);",
      "} catch(e) {",
      "  console.log('[T21] ERROR:', e.message);",
      "  'error: ' + e.message;",
      "}"
    ].join('\n')
  });
  console.log('[T21] Result:', result);
  console.log('[T21] PASS:', result === 'true');

  // T22: Cross-origin degradation test (skip appendChild, not needed)
  console.log('\n=== T22: Cross-origin degradation test ===');
  const result2 = executeSignatureTask(leapvm, {
    targetScript: [
      "try {",
      "  var x = document.createElement('iframe');",
      "  if (document && document.body && typeof document.body.appendChild === 'function') {",
      "    document.body.appendChild(x);",
      "  }",
      "  x.src = 'https://other.example/';",
      "",
      "  var w = x.contentWindow;",
      "  console.log('[T22] cross-origin contentWindow:', w);",
      "  String(w === null || typeof w === 'object');",
      "} catch(e) {",
      "  console.log('[T22] ERROR:', e.message);",
      "  'error: ' + e.message;",
      "}"
    ].join('\n')
  });
  console.log('[T22] Result:', result2);
  console.log('[T22] PASS:', result2 === 'true');

  shutdownEnvironment(leapvm);
  console.log('\n=== All tests completed ===');
} catch (e) {
  console.error('ERROR:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
}
