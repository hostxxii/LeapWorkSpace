(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;
  const placeholderPolicy = leapenv.placeholderPolicy || {};

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  const DEFAULT_CANVAS_WIDTH = 300;
  const DEFAULT_CANVAS_HEIGHT = 150;
  const DEFAULT_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZxJkAAAAASUVORK5CYII=';

  function toUint32CanvasSize(value, fallback) {
    var n = Number(value);
    if (!(Number.isFinite ? Number.isFinite(n) : isFinite(n)) || n < 0) {
      return fallback;
    }
    n = Math.floor(n);
    if (n > 2147483647) {
      n = 2147483647;
    }
    return n;
  }

  function getTaskState() {
    if (typeof leapenv.getTaskState === 'function') {
      try {
        var runtimeState = leapenv.getTaskState();
        if (runtimeState && typeof runtimeState === 'object') {
          return runtimeState;
        }
      } catch (_) {}
    }
    return leapenv.signatureTaskState || null;
  }

  function getCanvasProfile() {
    var state = getTaskState();
    return (state && state.canvasProfile && typeof state.canvasProfile === 'object')
      ? state.canvasProfile
      : null;
  }

  function getCanvasState(canvas) {
    var state = dom.ensureNodeState(canvas);
    if (!state._canvasState || typeof state._canvasState !== 'object') {
      var widthAttr = dom.getNodeAttribute(canvas, 'width');
      var heightAttr = dom.getNodeAttribute(canvas, 'height');
      var widthInit = (widthAttr == null || String(widthAttr).trim() === '')
        ? DEFAULT_CANVAS_WIDTH
        : toUint32CanvasSize(widthAttr, DEFAULT_CANVAS_WIDTH);
      var heightInit = (heightAttr == null || String(heightAttr).trim() === '')
        ? DEFAULT_CANVAS_HEIGHT
        : toUint32CanvasSize(heightAttr, DEFAULT_CANVAS_HEIGHT);
      state._canvasState = {
        width: widthInit,
        height: heightInit,
        contexts: Object.create(null),
        drawCalls: [],
        version: 1
      };
    }
    return state._canvasState;
  }

  function resetCanvasBuffer(canvasState) {
    canvasState.version = (canvasState.version || 0) + 1;
    canvasState.drawCalls = [];
    canvasState.contexts = Object.create(null);
  }

  function pushDrawCall(canvasState, op, args) {
    if (!canvasState || !Array.isArray(canvasState.drawCalls)) return;
    var entry = {
      op: String(op || ''),
      args: []
    };
    for (var i = 0; i < args.length; i++) {
      var v = args[i];
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v == null) {
        entry.args.push(v);
      } else if (Array.isArray(v)) {
        entry.args.push(v.slice());
      } else {
        entry.args.push(Object.prototype.toString.call(v));
      }
    }
    canvasState.drawCalls.push(entry);
    if (canvasState.drawCalls.length > 64) {
      canvasState.drawCalls.shift();
    }
  }

  function createTextMetrics(width) {
    return {
      width: Number(width || 0),
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: Number(width || 0),
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
      fontBoundingBoxAscent: 0,
      fontBoundingBoxDescent: 0
    };
  }

  function createImageDataLike(width, height) {
    var w = toUint32CanvasSize(width, 0);
    var h = toUint32CanvasSize(height, 0);
    var bytes = w * h * 4;
    return {
      data: new Uint8ClampedArray(bytes),
      width: w,
      height: h
    };
  }

  function createNativeCanvasObject(ctorName) {
    var obj = null;
    if (global.$native && typeof global.$native.createSkeletonInstance === 'function') {
      try { obj = global.$native.createSkeletonInstance(ctorName, ''); } catch (_) { obj = null; }
    }
    if (!obj && typeof global.__createNative__ === 'function') {
      try { obj = global.__createNative__(ctorName); } catch (_) { obj = null; }
    }
    if (!obj) obj = {};
    if (typeof global.__applyInstanceSkeleton__ === 'function') {
      try { global.__applyInstanceSkeleton__(obj, ctorName); } catch (_) {}
    }
    return obj;
  }

  var _ctx2dStateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;
  var _webglStateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getPrivateState(map, self, fallbackKey) {
    if (map) return map.get(self) || null;
    return self[fallbackKey] || null;
  }

  function setPrivateState(map, self, fallbackKey, state) {
    if (map) {
      map.set(self, state);
      return;
    }
    Object.defineProperty(self, fallbackKey, {
      value: state,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  function get2DState(self) {
    return getPrivateState(_ctx2dStateMap, self, '__leapCanvas2DState');
  }

  function set2DState(self, state) {
    setPrivateState(_ctx2dStateMap, self, '__leapCanvas2DState', state);
  }

  function getWebGLState(self) {
    return getPrivateState(_webglStateMap, self, '__leapWebGLState');
  }

  function setWebGLState(self, state) {
    setPrivateState(_webglStateMap, self, '__leapWebGLState', state);
  }

  function mark2DDraw(self, op, argsLike) {
    var state = get2DState(self);
    if (!state) return;
    pushDrawCall(state.canvasState, op, Array.prototype.slice.call(argsLike || []));
  }

  function create2DContext(canvas, canvasState) {
    var ctx = createNativeCanvasObject('CanvasRenderingContext2D');
    set2DState(ctx, {
      canvas: canvas,
      canvasState: canvasState,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      direction: 'inherit',
      fontKerning: 'auto',
      fontStretch: 'normal',
      fontVariantCaps: 'normal',
      letterSpacing: '0px',
      textRendering: 'auto',
      wordSpacing: '0px',
      globalCompositeOperation: 'source-over',
      filter: 'none',
      globalAlpha: 1,
      lineWidth: 1,
      _lineDash: []
    });
    return ctx;
  }

  function cloneReturnValue(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.slice();
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
      try { return new value.constructor(value); } catch (_) { return value; }
    }
    if (typeof value === 'object') {
      var out = {};
      var keys = Object.keys(value);
      for (var i = 0; i < keys.length; i++) out[keys[i]] = cloneReturnValue(value[keys[i]]);
      return out;
    }
    return value;
  }

  function getWebGLProfile() {
    var profile = getCanvasProfile();
    if (!profile || !profile.webgl || typeof profile.webgl !== 'object') return null;
    return profile.webgl;
  }

  function getWebGLSupportedExtensions() {
    var profile = getWebGLProfile();
    if (profile && Array.isArray(profile.supportedExtensions)) {
      return profile.supportedExtensions.slice();
    }
    return [
      'ANGLE_instanced_arrays',
      'EXT_blend_minmax',
      'EXT_texture_filter_anisotropic',
      'OES_element_index_uint',
      'OES_standard_derivatives',
      'OES_texture_float',
      'OES_texture_float_linear',
      'OES_vertex_array_object',
      'WEBGL_debug_renderer_info',
      'WEBGL_debug_shaders',
      'WEBGL_lose_context'
    ];
  }

  function getWebGLContextAttributes() {
    var out = {
      alpha: true,
      antialias: true,
      depth: true,
      desynchronized: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
      xrCompatible: false
    };
    var profile = getWebGLProfile();
    if (profile && profile.contextAttributes && typeof profile.contextAttributes === 'object') {
      var keys = Object.keys(profile.contextAttributes);
      for (var i = 0; i < keys.length; i++) {
        out[keys[i]] = profile.contextAttributes[keys[i]];
      }
    }
    return out;
  }

  function createDebugRendererInfoObject() {
    return {
      UNMASKED_VENDOR_WEBGL: 37445,
      UNMASKED_RENDERER_WEBGL: 37446
    };
  }

  function getWebGLParameterDefault(self, pname) {
    var state = getWebGLState(self);
    var canvasState = state && state.canvasState;
    var width = canvasState ? canvasState.width : DEFAULT_CANVAS_WIDTH;
    var height = canvasState ? canvasState.height : DEFAULT_CANVAS_HEIGHT;
    var profile = getWebGLProfile();

    var defaults = {
      7936: (profile && typeof profile.vendor === 'string') ? profile.vendor : 'WebKit',
      7937: (profile && typeof profile.renderer === 'string') ? profile.renderer : 'WebKit WebGL',
      7938: (profile && typeof profile.version === 'string') ? profile.version : 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
      35724: (profile && typeof profile.shadingLanguageVersion === 'string')
        ? profile.shadingLanguageVersion
        : 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)',
      37445: (profile && typeof profile.unmaskedVendor === 'string') ? profile.unmaskedVendor : 'Google Inc. (Google)',
      37446: (profile && typeof profile.unmaskedRenderer === 'string') ? profile.unmaskedRenderer : 'ANGLE (Google, SwiftShader)',
      3415: 16, // STENCIL_BITS
      3414: 24, // DEPTH_BITS
      34024: 16384, // MAX_RENDERBUFFER_SIZE
      3379: 16384, // MAX_TEXTURE_SIZE
      34921: 16, // MAX_VERTEX_ATTRIBS
      35660: 16, // MAX_VERTEX_TEXTURE_IMAGE_UNITS
      35661: 32, // MAX_COMBINED_TEXTURE_IMAGE_UNITS
      36347: 4096, // MAX_VARYING_VECTORS
      36348: 1024, // MAX_FRAGMENT_UNIFORM_VECTORS
      36349: 1024, // MAX_VERTEX_UNIFORM_VECTORS
      2978: new Int32Array([0, 0, width, height]), // VIEWPORT
      3088: new Int32Array([0, 0, width, height]), // SCISSOR_BOX
      3386: new Int32Array([width, height]), // MAX_VIEWPORT_DIMS
      33901: new Float32Array([1, 1]), // ALIASED_POINT_SIZE_RANGE
      33902: new Float32Array([1, 1]), // ALIASED_LINE_WIDTH_RANGE
      34047: 16, // MAX_TEXTURE_MAX_ANISOTROPY_EXT fallback
      7939: getWebGLSupportedExtensions().join(' ') // EXTENSIONS (legacy)
    };

    if (Object.prototype.hasOwnProperty.call(defaults, pname)) {
      return cloneReturnValue(defaults[pname]);
    }
    return null;
  }

  function getWebGLParameterValue(self, pname) {
    var profile = getWebGLProfile();
    if (profile && profile.parameters && typeof profile.parameters === 'object') {
      var key = String(pname);
      if (Object.prototype.hasOwnProperty.call(profile.parameters, key)) {
        return cloneReturnValue(profile.parameters[key]);
      }
    }
    return getWebGLParameterDefault(self, pname);
  }

  function createWebGLContext(canvas, canvasState, kind) {
    var gl = createNativeCanvasObject('WebGLRenderingContext');
    setWebGLState(gl, {
      canvas: canvas,
      canvasState: canvasState,
      kind: kind || 'webgl',
      extensionCache: Object.create(null),
      contextAttributes: getWebGLContextAttributes()
    });
    return gl;
  }

  class CanvasRenderingContext2DImpl {
    get canvas() {
      var state = get2DState(this);
      return state ? state.canvas : null;
    }

    get fillStyle() {
      var state = get2DState(this);
      return state ? state.fillStyle : '#000000';
    }

    set fillStyle(v) {
      var state = get2DState(this);
      if (state) state.fillStyle = String(v == null ? '' : v);
    }

    get strokeStyle() {
      var state = get2DState(this);
      return state ? state.strokeStyle : '#000000';
    }

    set strokeStyle(v) {
      var state = get2DState(this);
      if (state) state.strokeStyle = String(v == null ? '' : v);
    }

    get font() {
      var state = get2DState(this);
      return state ? state.font : '10px sans-serif';
    }

    set font(v) {
      var state = get2DState(this);
      if (state) state.font = String(v == null ? '' : v);
    }

    get textAlign() {
      var state = get2DState(this);
      return state ? state.textAlign : 'start';
    }

    set textAlign(v) {
      var state = get2DState(this);
      if (state) state.textAlign = String(v == null ? '' : v);
    }

    get textBaseline() {
      var state = get2DState(this);
      return state ? state.textBaseline : 'alphabetic';
    }

    set textBaseline(v) {
      var state = get2DState(this);
      if (state) state.textBaseline = String(v == null ? '' : v);
    }

    get direction() { var s = get2DState(this); return s ? s.direction : 'inherit'; }
    set direction(v) { var s = get2DState(this); if (s) s.direction = String(v == null ? '' : v); }
    get fontKerning() { var s = get2DState(this); return s ? s.fontKerning : 'auto'; }
    set fontKerning(v) { var s = get2DState(this); if (s) s.fontKerning = String(v == null ? '' : v); }
    get fontStretch() { var s = get2DState(this); return s ? s.fontStretch : 'normal'; }
    set fontStretch(v) { var s = get2DState(this); if (s) s.fontStretch = String(v == null ? '' : v); }
    get fontVariantCaps() { var s = get2DState(this); return s ? s.fontVariantCaps : 'normal'; }
    set fontVariantCaps(v) { var s = get2DState(this); if (s) s.fontVariantCaps = String(v == null ? '' : v); }
    get letterSpacing() { var s = get2DState(this); return s ? s.letterSpacing : '0px'; }
    set letterSpacing(v) { var s = get2DState(this); if (s) s.letterSpacing = String(v == null ? '' : v); }
    get textRendering() { var s = get2DState(this); return s ? s.textRendering : 'auto'; }
    set textRendering(v) { var s = get2DState(this); if (s) s.textRendering = String(v == null ? '' : v); }
    get wordSpacing() { var s = get2DState(this); return s ? s.wordSpacing : '0px'; }
    set wordSpacing(v) { var s = get2DState(this); if (s) s.wordSpacing = String(v == null ? '' : v); }
    get globalCompositeOperation() { var s = get2DState(this); return s ? s.globalCompositeOperation : 'source-over'; }
    set globalCompositeOperation(v) { var s = get2DState(this); if (s) s.globalCompositeOperation = String(v == null ? '' : v); }
    get filter() { var s = get2DState(this); return s ? s.filter : 'none'; }
    set filter(v) { var s = get2DState(this); if (s) s.filter = String(v == null ? '' : v); }

    get globalAlpha() {
      var state = get2DState(this);
      return state ? state.globalAlpha : 1;
    }

    set globalAlpha(v) {
      var state = get2DState(this);
      if (!state) return;
      var n = Number(v);
      if ((Number.isFinite ? Number.isFinite(n) : isFinite(n)) && n >= 0 && n <= 1) {
        state.globalAlpha = n;
      }
    }

    get lineWidth() {
      var state = get2DState(this);
      return state ? state.lineWidth : 1;
    }

    set lineWidth(v) {
      var state = get2DState(this);
      if (!state) return;
      var n = Number(v);
      if ((Number.isFinite ? Number.isFinite(n) : isFinite(n)) && n > 0) {
        state.lineWidth = n;
      }
    }

    save() { mark2DDraw(this, 'save', arguments); }
    restore() { mark2DDraw(this, 'restore', arguments); }
    reset() { mark2DDraw(this, 'reset', arguments); }
    beginPath() { mark2DDraw(this, 'beginPath', arguments); }
    closePath() { mark2DDraw(this, 'closePath', arguments); }
    moveTo() { mark2DDraw(this, 'moveTo', arguments); }
    lineTo() { mark2DDraw(this, 'lineTo', arguments); }
    arc() { mark2DDraw(this, 'arc', arguments); }
    rect() { mark2DDraw(this, 'rect', arguments); }
    fill() { mark2DDraw(this, 'fill', arguments); }
    stroke() { mark2DDraw(this, 'stroke', arguments); }
    clip() { mark2DDraw(this, 'clip', arguments); }
    fillRect() { mark2DDraw(this, 'fillRect', arguments); }
    strokeRect() { mark2DDraw(this, 'strokeRect', arguments); }
    clearRect() { mark2DDraw(this, 'clearRect', arguments); }
    fillText() { mark2DDraw(this, 'fillText', arguments); }
    strokeText() { mark2DDraw(this, 'strokeText', arguments); }
    drawImage() { mark2DDraw(this, 'drawImage', arguments); }
    translate() { mark2DDraw(this, 'translate', arguments); }
    rotate() { mark2DDraw(this, 'rotate', arguments); }
    scale() { mark2DDraw(this, 'scale', arguments); }
    transform() { mark2DDraw(this, 'transform', arguments); }
    setTransform() { mark2DDraw(this, 'setTransform', arguments); }
    resetTransform() { mark2DDraw(this, 'resetTransform', arguments); }

    createImageData(width, height) {
      if (arguments.length >= 2) {
        return createImageDataLike(width, height);
      }
      if (width && typeof width === 'object') {
        return createImageDataLike(width.width, width.height);
      }
      return createImageDataLike(0, 0);
    }

    getImageData(_sx, _sy, sw, sh) {
      mark2DDraw(this, 'getImageData', arguments);
      return createImageDataLike(sw, sh);
    }

    putImageData() { mark2DDraw(this, 'putImageData', arguments); }

    measureText(text) {
      var s = String(text == null ? '' : text);
      var base = Math.max(1, s.length) * 7;
      mark2DDraw(this, 'measureText', arguments);
      return createTextMetrics(base);
    }

    getLineDash() {
      var state = get2DState(this);
      return state ? state._lineDash.slice() : [];
    }

    setLineDash(segments) {
      var state = get2DState(this);
      if (!state) return;
      mark2DDraw(this, 'setLineDash', arguments);
      if (!segments || typeof segments.length !== 'number') {
        state._lineDash = [];
        return;
      }
      var out = [];
      for (var i = 0; i < segments.length; i++) {
        var n = Number(segments[i]);
        out.push((Number.isFinite ? Number.isFinite(n) : isFinite(n)) ? n : 0);
      }
      state._lineDash = out;
    }
  }

  class WebGLRenderingContextImpl {
    get canvas() {
      var state = getWebGLState(this);
      return state ? state.canvas : null;
    }

    get drawingBufferWidth() {
      var state = getWebGLState(this);
      return state && state.canvasState ? state.canvasState.width : 0;
    }

    get drawingBufferHeight() {
      var state = getWebGLState(this);
      return state && state.canvasState ? state.canvasState.height : 0;
    }

    getContextAttributes() {
      var state = getWebGLState(this);
      if (!state) return getWebGLContextAttributes();
      state.contextAttributes = getWebGLContextAttributes();
      return cloneReturnValue(state.contextAttributes);
    }

    getSupportedExtensions() {
      return getWebGLSupportedExtensions();
    }

    getExtension(name) {
      var state = getWebGLState(this);
      if (!state) return null;
      var extName = String(name == null ? '' : name);
      if (!extName) return null;
      var supported = getWebGLSupportedExtensions();
      var matched = null;
      for (var i = 0; i < supported.length; i++) {
        if (String(supported[i]).toLowerCase() === extName.toLowerCase()) {
          matched = String(supported[i]);
          break;
        }
      }
      if (!matched) return null;
      if (state.extensionCache[matched]) {
        return state.extensionCache[matched];
      }
      if (matched === 'WEBGL_debug_renderer_info') {
        state.extensionCache[matched] = createDebugRendererInfoObject();
        return state.extensionCache[matched];
      }
      if (matched === 'WEBGL_lose_context') {
        state.extensionCache[matched] = {
          loseContext: function loseContext() { return undefined; },
          restoreContext: function restoreContext() { return undefined; }
        };
        return state.extensionCache[matched];
      }
      state.extensionCache[matched] = {};
      return state.extensionCache[matched];
    }

    getParameter(pname) {
      var n = Number(pname);
      if (!((Number.isFinite ? Number.isFinite(n) : isFinite(n)))) return null;
      return getWebGLParameterValue(this, Math.floor(n));
    }

    getShaderPrecisionFormat(/* shaderType, precisionType */) {
      return {
        rangeMin: 127,
        rangeMax: 127,
        precision: 23
      };
    }

    clear() { return undefined; }
    clearColor() { return undefined; }
    enable() { return undefined; }
    disable() { return undefined; }
    depthFunc() { return undefined; }
    blendFunc() { return undefined; }
    viewport() { return undefined; }
    useProgram() { return undefined; }
    finish() { return undefined; }
    flush() { return undefined; }
  }

  function resolveCanvasMimeType(type) {
    var mime = String(type == null ? '' : type).trim().toLowerCase();
    if (!mime) return 'image/png';
    if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp') {
      return mime;
    }
    return 'image/png';
  }

  function resolveCanvasDataURL(canvas, type) {
    var profile = getCanvasProfile();
    var canvasState = getCanvasState(canvas);
    var mime = resolveCanvasMimeType(type);

    if (profile) {
      if (typeof profile.toDataURL === 'string' && profile.toDataURL) {
        return profile.toDataURL;
      }
      if (profile.toDataURL && typeof profile.toDataURL === 'object') {
        if (typeof profile.toDataURL[mime] === 'string' && profile.toDataURL[mime]) {
          return profile.toDataURL[mime];
        }
        if (typeof profile.toDataURL.default === 'string' && profile.toDataURL.default) {
          return profile.toDataURL.default;
        }
      }
    }

    if (canvasState.width === 0 || canvasState.height === 0) {
      return 'data:,';
    }

    if (mime !== 'image/png') {
      // minimal fallback: reuse png placeholder for unsupported encoding implementations
      return DEFAULT_DATA_URL;
    }
    return DEFAULT_DATA_URL;
  }

  function createBlobLike(dataUrl, mime) {
    var textValue = String(dataUrl == null ? '' : dataUrl);
    return {
      size: textValue.length,
      type: String(mime || 'image/png'),
      text: function text() {
        return Promise.resolve(textValue);
      },
      arrayBuffer: function arrayBuffer() {
        var out = new Uint8Array(textValue.length);
        for (var i = 0; i < textValue.length; i++) {
          out[i] = textValue.charCodeAt(i) & 0xFF;
        }
        return Promise.resolve(out.buffer);
      },
      slice: function slice() {
        return createBlobLike(textValue, mime);
      }
    };
  }

  function makeNotSupportedError(message) {
    if (placeholderPolicy && typeof placeholderPolicy.notImplementedError === 'function') {
      return placeholderPolicy.notImplementedError(message || 'HTMLCanvasElement API');
    }
    var err = new Error(String(message || 'Not supported'));
    err.name = 'NotSupportedError';
    err.code = 'LEAP_NOT_SUPPORTED';
    return err;
  }

  class HTMLCanvasElementImpl {
    get width() {
      return getCanvasState(this).width;
    }

    set width(value) {
      var state = getCanvasState(this);
      var next = toUint32CanvasSize(value, DEFAULT_CANVAS_WIDTH);
      if (state.width !== next) {
        state.width = next;
        dom.setNodeAttribute(this, 'width', String(next));
        resetCanvasBuffer(state);
      }
    }

    get height() {
      return getCanvasState(this).height;
    }

    set height(value) {
      var state = getCanvasState(this);
      var next = toUint32CanvasSize(value, DEFAULT_CANVAS_HEIGHT);
      if (state.height !== next) {
        state.height = next;
        dom.setNodeAttribute(this, 'height', String(next));
        resetCanvasBuffer(state);
      }
    }

    getContext(contextId /*, options */) {
      var kind = String(contextId == null ? '' : contextId).trim().toLowerCase();
      var state = getCanvasState(this);
      if (!kind) return null;
      if (kind === '2d') {
        if (!state.contexts['2d']) {
          state.contexts['2d'] = create2DContext(this, state);
        }
        return state.contexts['2d'];
      }
      if (kind === 'webgl' || kind === 'experimental-webgl') {
        if (!state.contexts.webgl) {
          state.contexts.webgl = createWebGLContext(this, state, kind);
        }
        return state.contexts.webgl;
      }
      // minimal policy for unsupported contexts in signature container
      return null;
    }

    toDataURL(type /*, quality */) {
      return resolveCanvasDataURL(this, type);
    }

    toBlob(callback, type /*, quality */) {
      if (typeof callback !== 'function') {
        throw new TypeError("Failed to execute 'toBlob' on 'HTMLCanvasElement': callback is not a function");
      }
      var mime = resolveCanvasMimeType(type);
      var dataUrl = resolveCanvasDataURL(this, mime);
      var blob = createBlobLike(dataUrl, mime);
      // Use synchronous callback to avoid relying on leap-vm timer execution.
      callback(blob);
      return undefined;
    }

    captureStream(/* frameRate */) {
      throw makeNotSupportedError('HTMLCanvasElement.captureStream');
    }

    transferControlToOffscreen() {
      throw makeNotSupportedError('HTMLCanvasElement.transferControlToOffscreen');
    }
  }

  leapenv.registerImpl('CanvasRenderingContext2D', CanvasRenderingContext2DImpl);
  leapenv.registerImpl('WebGLRenderingContext', WebGLRenderingContextImpl);
  leapenv.registerImpl('HTMLCanvasElement', HTMLCanvasElementImpl);
})(globalThis);
