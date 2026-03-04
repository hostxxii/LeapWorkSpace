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

function runTaskJson(ctx, taskId, targetScript, fingerprintSnapshot) {
  return parseJson(executeSignatureTask(ctx.leapvm, {
    taskId,
    targetScript,
    fingerprintSnapshot
  }), taskId);
}

function testCanvasCore() {
  const ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  try {
    const result = runTaskJson(ctx, 'canvas-core', `
      (function () {
        var c = document.createElement('canvas');
        var tag = Object.prototype.toString.call(c);
        var width0 = c.width;
        var height0 = c.height;
        c.width = 640;
        c.height = 360;
        var attrWidth = c.getAttribute('width');
        var attrHeight = c.getAttribute('height');
        var ctx2d = c.getContext('2d');
        var ctx2dAgain = c.getContext('2d');
        var gl = c.getContext('webgl');
        var glAgain = c.getContext('webgl');
        ctx2d.fillStyle = '#f00';
        ctx2d.fillRect(0, 0, 10, 10);
        ctx2d.fillText('abc', 1, 2);
        var metrics = ctx2d.measureText('abc');
        var imageData = ctx2d.getImageData(0, 0, 2, 3);
        var dataUrl = c.toDataURL();
        var blobInfo = null;
        c.toBlob(function (blob) {
          blobInfo = {
            type: blob && blob.type || null,
            size: blob && blob.size || 0,
            hasText: !!(blob && typeof blob.text === 'function'),
            hasArrayBuffer: !!(blob && typeof blob.arrayBuffer === 'function')
          };
        }, 'image/png');
        var badToBlob = null;
        try { c.toBlob(null); } catch (e) {
          badToBlob = { name: e && e.name || '', message: e && e.message || '' };
        }
        var captureErr = null;
        try { c.captureStream(); } catch (e2) {
          captureErr = { name: e2 && e2.name || '', code: e2 && e2.code || '' };
        }
        return JSON.stringify({
          tag: tag,
          width0: width0,
          height0: height0,
          width1: c.width,
          height1: c.height,
          attrWidth: attrWidth,
          attrHeight: attrHeight,
          ctx2dType: typeof ctx2d,
          ctx2dTag: ctx2d ? Object.prototype.toString.call(ctx2d) : '',
          sameCtx: ctx2d === ctx2dAgain,
          ctxCanvasEq: !!(ctx2d && ctx2d.canvas === c),
          ctxMethods: {
            fillRect: typeof ctx2d.fillRect,
            measureText: typeof ctx2d.measureText,
            getImageData: typeof ctx2d.getImageData
          },
          webgl: {
            type: typeof gl,
            tag: gl ? Object.prototype.toString.call(gl) : '',
            sameCtx: gl === glAgain,
            canvasEq: !!(gl && gl.canvas === c),
            methods: gl ? {
              getParameter: typeof gl.getParameter,
              getExtension: typeof gl.getExtension,
              getSupportedExtensions: typeof gl.getSupportedExtensions,
              getContextAttributes: typeof gl.getContextAttributes
            } : null,
            drawingBufferWidth: gl ? gl.drawingBufferWidth : null,
            drawingBufferHeight: gl ? gl.drawingBufferHeight : null,
            renderer: gl ? gl.getParameter(7937) : null,
            unmaskedVendor: (function () {
              if (!gl) return null;
              var ext = gl.getExtension('WEBGL_debug_renderer_info');
              if (!ext) return null;
              return gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
            })(),
            attrs: gl ? gl.getContextAttributes() : null,
            extCount: gl ? ((gl.getSupportedExtensions() || []).length) : 0
          },
          metricsWidth: metrics && metrics.width || 0,
          imageData: {
            width: imageData && imageData.width || 0,
            height: imageData && imageData.height || 0,
            dataLen: imageData && imageData.data && imageData.data.length || 0,
            dataTag: imageData && imageData.data ? Object.prototype.toString.call(imageData.data) : ''
          },
          dataUrlPrefix: String(dataUrl).slice(0, 22),
          dataUrlType: typeof dataUrl,
          blobInfo: blobInfo,
          badToBlob: badToBlob,
          captureErr: captureErr
        });
      })();
    `);

    assert.strictEqual(result.tag, '[object HTMLCanvasElement]');
    assert.strictEqual(result.width0, 300);
    assert.strictEqual(result.height0, 150);
    assert.strictEqual(result.width1, 640);
    assert.strictEqual(result.height1, 360);
    assert.strictEqual(result.attrWidth, '640');
    assert.strictEqual(result.attrHeight, '360');
    assert.strictEqual(result.ctx2dType, 'object');
    assert.strictEqual(result.ctx2dTag, '[object CanvasRenderingContext2D]');
    assert.strictEqual(result.sameCtx, true);
    assert.strictEqual(result.ctxCanvasEq, true);
    assert.strictEqual(result.ctxMethods.fillRect, 'function');
    assert.strictEqual(result.ctxMethods.measureText, 'function');
    assert.strictEqual(result.ctxMethods.getImageData, 'function');
    assert.ok(result.metricsWidth > 0);
    assert.strictEqual(result.imageData.width, 2);
    assert.strictEqual(result.imageData.height, 3);
    assert.strictEqual(result.imageData.dataLen, 24);
    assert.strictEqual(result.imageData.dataTag, '[object Uint8ClampedArray]');
    assert.strictEqual(result.webgl.type, 'object');
    assert.strictEqual(result.webgl.tag, '[object WebGLRenderingContext]');
    assert.strictEqual(result.webgl.sameCtx, true);
    assert.strictEqual(result.webgl.canvasEq, true);
    assert.strictEqual(result.webgl.methods.getParameter, 'function');
    assert.strictEqual(result.webgl.methods.getExtension, 'function');
    assert.strictEqual(result.webgl.methods.getSupportedExtensions, 'function');
    assert.strictEqual(result.webgl.methods.getContextAttributes, 'function');
    assert.strictEqual(result.webgl.drawingBufferWidth, 640);
    assert.strictEqual(result.webgl.drawingBufferHeight, 360);
    assert.strictEqual(typeof result.webgl.renderer, 'string');
    assert.strictEqual(typeof result.webgl.unmaskedVendor, 'string');
    assert.ok(result.webgl.attrs && typeof result.webgl.attrs === 'object');
    assert.ok(result.webgl.extCount > 0);
    assert.strictEqual(result.dataUrlType, 'string');
    assert.ok(result.dataUrlPrefix.indexOf('data:image/png;base64,') === 0 || result.dataUrlPrefix === 'data:,');
    assert.strictEqual(result.blobInfo.type, 'image/png');
    assert.ok(result.blobInfo.size > 0);
    assert.strictEqual(result.blobInfo.hasText, true);
    assert.strictEqual(result.blobInfo.hasArrayBuffer, true);
    assert.strictEqual(result.badToBlob.name, 'TypeError');
    assert.ok(result.captureErr && result.captureErr.name);
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

function testCanvasProfileOverrideAndReset() {
  const ctx = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
  try {
    const custom = 'data:image/png;base64,TEVBUF9DQU5WQVNfUFJPRklMRQ==';
    const a = runTaskJson(ctx, 'canvas-profile-a', `
      (function () {
        var c = document.createElement('canvas');
        c.width = 320;
        c.height = 200;
        var gl = c.getContext('webgl');
        return JSON.stringify({
          url: c.toDataURL(),
          glRenderer: gl && gl.getParameter(7937),
          glVendor: gl && (function () {
            var ext = gl.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null;
          })(),
          glAttrs: gl && gl.getContextAttributes(),
          glExts: gl && gl.getSupportedExtensions()
        });
      })();
    `, {
      canvasProfile: {
        toDataURL: custom,
        webgl: {
          renderer: 'MyRenderer',
          unmaskedVendor: 'MyVendor',
          contextAttributes: {
            antialias: false,
            alpha: false
          },
          supportedExtensions: ['WEBGL_debug_renderer_info'],
          parameters: {
            7937: 'RendererByParam'
          }
        }
      }
    });

    const b = runTaskJson(ctx, 'canvas-profile-b', `
      (function () {
        var c = document.createElement('canvas');
        var gl = c.getContext('webgl');
        return JSON.stringify({
          url: c.toDataURL(),
          glRenderer: gl && gl.getParameter(7937),
          glAttrs: gl && gl.getContextAttributes(),
          glExtsCount: gl ? (gl.getSupportedExtensions() || []).length : 0
        });
      })();
    `);

    assert.strictEqual(a.url, custom);
    assert.strictEqual(a.glRenderer, 'RendererByParam');
    assert.strictEqual(a.glVendor, 'MyVendor');
    assert.strictEqual(a.glAttrs.antialias, false);
    assert.strictEqual(a.glAttrs.alpha, false);
    assert.deepStrictEqual(a.glExts, ['WEBGL_debug_renderer_info']);
    assert.strictEqual(typeof b.url, 'string');
    assert.notStrictEqual(b.url, custom);
    assert.ok(b.url.indexOf('data:image/png;base64,') === 0 || b.url === 'data:,');
    assert.strictEqual(typeof b.glRenderer, 'string');
    assert.notStrictEqual(b.glRenderer, 'RendererByParam');
    assert.ok(b.glAttrs && typeof b.glAttrs === 'object');
    assert.ok(b.glExtsCount > 0);
  } finally {
    shutdownEnvironment(ctx.leapvm);
  }
}

try {
  testCanvasCore();
  testCanvasProfileOverrideAndReset();
  console.log('[canvas-minimal] PASS');
} catch (err) {
  console.error('[canvas-minimal] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
