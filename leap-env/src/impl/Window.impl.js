// Window 实现类 (新架构)
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;
  const placeholderPolicy = leapenv.placeholderPolicy || {};
  function getHostTimers() {
    if (typeof leapenv.getHostTimers === 'function') {
      try {
        var timers = leapenv.getHostTimers();
        if (timers && typeof timers === 'object') {
          return timers;
        }
      } catch (_) {}
    }
    if (leapenv.__runtime && leapenv.__runtime.host && leapenv.__runtime.host.timers) {
      return leapenv.__runtime.host.timers;
    }
    return null;
  }

  function getNativeBridge() {
    if (typeof leapenv.getNativeBridge === 'function') {
      try { return leapenv.getNativeBridge(); } catch (_) {}
    }
    return null;
  }

  function bindGlobalTimer(name) {
    if (typeof global[name] !== 'function') {
      return null;
    }
    try {
      return global[name].bind(global);
    } catch (_) {
      return global[name];
    }
  }

  function getNativeTimer(name) {
    var hostTimers = getHostTimers();
    if (hostTimers && typeof hostTimers[name] === 'function') {
      return hostTimers[name];
    }
    return bindGlobalTimer(name);
  }

  const nativeSetTimeout = getNativeTimer('setTimeout');
  const nativeSetInterval = getNativeTimer('setInterval');
  const nativeClearTimeout = getNativeTimer('clearTimeout');
  const nativeClearInterval = getNativeTimer('clearInterval');

  // I-11 Window 级事件监听器存储（Map<type, Map<originalFn, entry>>）
  var _windowListeners = new Map();

  // 缓存 navigator 实例
  var _navigatorInstance = null;
  // 缓存 BOM 单例实例
  var _historyInstance = null;
  var _performanceInstance = null;
  var _screenInstance = null;
  var _localStorageInstance = null;
  var _sessionStorageInstance = null;
  var _cryptoInstance = null;
  // window.name 状态
  var _windowName = '';
  // window.status 状态
  var _windowStatus = '';
  // window.opener 状态
  var _opener = null;
  // window.location —— 使用原生 Location 对象（通过 Location.impl.js 分发）
  var _locationInstance = null;
  var _rafSeq = 0;
  var _rafMap = new Map();
  var _xhrSeq = 0;
  var _placeholderXhrMap = (typeof WeakMap === 'function') ? new WeakMap() : null;
  var _fallbackXhrStateList = [];
  var _cryptoRngTaskId = null;
  var _cryptoRngSeedKey = null;
  var _cryptoRngState = 0;

  function makeNetworkDisabledError(apiName, detail) {
    if (placeholderPolicy && typeof placeholderPolicy.networkDisabledError === 'function') {
      return placeholderPolicy.networkDisabledError(apiName, detail);
    }
    var err = new TypeError(String(apiName || 'network API') + ' is disabled in signature container');
    err.code = 'LEAP_NETWORK_DISABLED';
    return err;
  }

  function rejectNetwork(apiName, detail) {
    if (placeholderPolicy && typeof placeholderPolicy.rejectNetwork === 'function') {
      return placeholderPolicy.rejectNetwork(apiName, detail);
    }
    return Promise.reject(makeNetworkDisabledError(apiName, detail));
  }

  function makePlaceholderTypeError(message, code) {
    if (placeholderPolicy && typeof placeholderPolicy.createTypeError === 'function') {
      return placeholderPolicy.createTypeError(message, code || 'LEAP_CRYPTO_TYPE_ERROR');
    }
    var err = new TypeError(String(message || 'Type error'));
    err.code = code || 'LEAP_CRYPTO_TYPE_ERROR';
    return err;
  }

  function makeQuotaExceededError(message) {
    if (placeholderPolicy && typeof placeholderPolicy.notImplementedError === 'function') {
      var err0 = placeholderPolicy.notImplementedError(message || 'crypto.getRandomValues');
      err0.name = 'QuotaExceededError';
      err0.code = 'LEAP_CRYPTO_QUOTA_EXCEEDED';
      return err0;
    }
    var err = new Error(String(message || 'Quota exceeded'));
    err.name = 'QuotaExceededError';
    err.code = 'LEAP_CRYPTO_QUOTA_EXCEEDED';
    return err;
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

  function getTaskRandomSeed() {
    var state = getTaskState();
    if (!state || !Object.prototype.hasOwnProperty.call(state, 'randomSeed')) {
      return undefined;
    }
    return state.randomSeed;
  }

  function getCurrentTaskId() {
    if (typeof leapenv.getCurrentTaskId === 'function') {
      try {
        return String(leapenv.getCurrentTaskId() || '');
      } catch (_) {}
    }
    if (dom && typeof dom.getCurrentTaskId === 'function') {
      try {
        return String(dom.getCurrentTaskId() || '');
      } catch (_) {}
    }
    return '';
  }

  function seedToStableKey(seed) {
    if (seed === undefined) return 'undefined';
    if (seed === null) return 'null';
    var t = typeof seed;
    if (t === 'string') return 's:' + seed;
    if (t === 'number') return 'n:' + String(seed);
    if (t === 'boolean') return 'b:' + String(seed);
    if (t === 'bigint') return 'bi:' + String(seed);
    try {
      return 'j:' + JSON.stringify(seed);
    } catch (_) {
      return 'o:' + Object.prototype.toString.call(seed);
    }
  }

  function seedStringToUint32(str) {
    var s = String(str == null ? '' : str);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    if (h === 0) h = 0x9e3779b9;
    return h >>> 0;
  }

  function nextSeededUint32() {
    // xorshift32
    var x = _cryptoRngState >>> 0;
    if (x === 0) x = 0x6d2b79f5;
    x ^= (x << 13);
    x ^= (x >>> 17);
    x ^= (x << 5);
    _cryptoRngState = x >>> 0;
    return _cryptoRngState;
  }

  function ensureCryptoRngState() {
    var seed = getTaskRandomSeed();
    var taskId = getCurrentTaskId();
    if (seed === undefined) {
      _cryptoRngTaskId = null;
      _cryptoRngSeedKey = null;
      _cryptoRngState = 0;
      return false;
    }
    var seedKey = seedToStableKey(seed);
    if (_cryptoRngTaskId !== taskId || _cryptoRngSeedKey !== seedKey || !_cryptoRngState) {
      _cryptoRngTaskId = taskId;
      _cryptoRngSeedKey = seedKey;
      _cryptoRngState = seedStringToUint32(seedKey);
    }
    return true;
  }

  function nextRandomByte() {
    if (ensureCryptoRngState()) {
      return nextSeededUint32() & 0xFF;
    }
    return Math.floor(Math.random() * 256) & 0xFF;
  }

  function getTypedArrayTag(value) {
    return Object.prototype.toString.call(value);
  }

  function isSupportedGetRandomValuesTarget(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.byteLength !== 'number' || typeof value.byteOffset !== 'number') return false;
    if (!value.buffer || typeof value.buffer !== 'object') return false;
    var tag = getTypedArrayTag(value);
    return tag === '[object Int8Array]' ||
      tag === '[object Uint8Array]' ||
      tag === '[object Uint8ClampedArray]' ||
      tag === '[object Int16Array]' ||
      tag === '[object Uint16Array]' ||
      tag === '[object Int32Array]' ||
      tag === '[object Uint32Array]' ||
      tag === '[object BigInt64Array]' ||
      tag === '[object BigUint64Array]';
  }

  function fillRandomBytes(byteView) {
    for (var i = 0; i < byteView.length; i++) {
      byteView[i] = nextRandomByte();
    }
  }

  function createCryptoPlaceholder() {
    return {
      getRandomValues: function getRandomValues(typedArray) {
        if (!isSupportedGetRandomValuesTarget(typedArray)) {
          throw makePlaceholderTypeError('crypto.getRandomValues requires an integer TypedArray', 'LEAP_CRYPTO_INVALID_TARGET');
        }
        var byteLength = Number(typedArray.byteLength || 0);
        if (byteLength > 65536) {
          throw makeQuotaExceededError('crypto.getRandomValues quota exceeded');
        }
        var bytes;
        try {
          bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, byteLength);
        } catch (_) {
          throw makePlaceholderTypeError('crypto.getRandomValues cannot access target buffer', 'LEAP_CRYPTO_INVALID_TARGET');
        }
        fillRandomBytes(bytes);
        return typedArray;
      }
    };
  }

  function createPlaceholderEvent(type, init, extra) {
    var eventObj;
    if (dom && typeof dom.createEvent === 'function') {
      eventObj = dom.createEvent(type, init || {});
    } else if (typeof global.CustomEvent === 'function') {
      eventObj = new global.CustomEvent(type, init || {});
    } else {
      eventObj = { type: String(type || '') };
    }
    var extras = extra || {};
    var keys = Object.keys(extras);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      try {
        Object.defineProperty(eventObj, key, {
          value: extras[key],
          writable: true,
          configurable: true,
          enumerable: true
        });
      } catch (_) {
        eventObj[key] = extras[key];
      }
    }
    return eventObj;
  }

  function createMutationObserverPlaceholder(callback) {
    var records = [];
    var cb = (typeof callback === 'function') ? callback : null;
    return {
      observe: function observe(_target, _options) {
        return undefined;
      },
      disconnect: function disconnect() {
        records.length = 0;
      },
      takeRecords: function takeRecords() {
        var out = records.slice();
        records.length = 0;
        return out;
      },
      _enqueueForTest: function _enqueueForTest(record) {
        records.push(record);
        if (cb) {
          try { cb(records.slice(), this); } catch (_) {}
        }
      }
    };
  }

  function createDomParserPlaceholder() {
    return {
      parseFromString: function parseFromString(input, type) {
        var mime = String(type == null ? '' : type).toLowerCase();
        if (mime && mime !== 'text/html' && mime !== 'application/xhtml+xml' &&
            mime !== 'text/xml' && mime !== 'application/xml' && mime !== 'image/svg+xml') {
          throw makeNetworkDisabledError('DOMParser.parseFromString', 'unsupported mime: ' + mime);
        }
        if (global.Document && typeof global.Document.parseHTMLUnsafe === 'function') {
          return global.Document.parseHTMLUnsafe(String(input == null ? '' : input));
        }
        if (dom && typeof dom.parseHTMLUnsafe === 'function') {
          return dom.parseHTMLUnsafe(String(input == null ? '' : input));
        }
        return null;
      }
    };
  }

  function createXmlSerializerPlaceholder() {
    return {
      serializeToString: function serializeToString(node) {
        if (!node || !dom || typeof dom.ensureNodeState !== 'function') {
          return '';
        }
        var state = dom.ensureNodeState(node);
        if (state.nodeType === 9) {
          return typeof dom.serializeChildren === 'function' ? dom.serializeChildren(node) : '';
        }
        return typeof dom.serializeNode === 'function' ? dom.serializeNode(node) : '';
      }
    };
  }

  function getFallbackXhrEntry(instance) {
    for (var i = 0; i < _fallbackXhrStateList.length; i++) {
      if (_fallbackXhrStateList[i].node === instance) {
        return _fallbackXhrStateList[i];
      }
    }
    return null;
  }

  function ensurePlaceholderXhrState(instance) {
    if (_placeholderXhrMap) {
      var state0 = _placeholderXhrMap.get(instance);
      if (state0) return state0;
      state0 = {
        id: ++_xhrSeq,
        method: '',
        url: '',
        async: true,
        readyState: 0,
        status: 0,
        statusText: '',
        responseText: '',
        responseURL: '',
        headers: Object.create(null),
        requestHeaders: Object.create(null),
        sent: false,
        aborted: false,
        timeout: 0,
        withCredentials: false
      };
      _placeholderXhrMap.set(instance, state0);
      return state0;
    }

    var entry = getFallbackXhrEntry(instance);
    if (entry) return entry.state;
    var state = {
      id: ++_xhrSeq,
      method: '',
      url: '',
      async: true,
      readyState: 0,
      status: 0,
      statusText: '',
      responseText: '',
      responseURL: '',
      headers: Object.create(null),
      requestHeaders: Object.create(null),
      sent: false,
      aborted: false,
      timeout: 0,
      withCredentials: false
    };
    _fallbackXhrStateList.push({ node: instance, state: state });
    return state;
  }

  function createXmlHttpRequestPlaceholder() {
    var xhr = {
      onreadystatechange: null,
      onload: null,
      onerror: null,
      onabort: null,
      responseType: '',
      response: null,
      upload: {}
    };
    var state = ensurePlaceholderXhrState(xhr);

    Object.defineProperties(xhr, {
      UNSENT: { value: 0, enumerable: true },
      OPENED: { value: 1, enumerable: true },
      HEADERS_RECEIVED: { value: 2, enumerable: true },
      LOADING: { value: 3, enumerable: true },
      DONE: { value: 4, enumerable: true },
      readyState: {
        enumerable: true,
        get: function() { return state.readyState; }
      },
      status: {
        enumerable: true,
        get: function() { return state.status; }
      },
      statusText: {
        enumerable: true,
        get: function() { return state.statusText; }
      },
      responseText: {
        enumerable: true,
        get: function() { return state.responseText; }
      },
      responseURL: {
        enumerable: true,
        get: function() { return state.responseURL; }
      },
      timeout: {
        enumerable: true,
        get: function() { return state.timeout; },
        set: function(v) {
          var n = Number(v);
          state.timeout = (Number.isFinite ? Number.isFinite(n) : isFinite(n)) && n >= 0 ? n : 0;
        }
      },
      withCredentials: {
        enumerable: true,
        get: function() { return !!state.withCredentials; },
        set: function(v) { state.withCredentials = !!v; }
      }
    });

    xhr.open = function open(method, url, async) {
      state.method = String(method == null ? 'GET' : method).toUpperCase();
      state.url = String(url == null ? '' : url);
      state.responseURL = state.url;
      state.async = async !== false;
      state.readyState = 1;
      state.sent = false;
      state.aborted = false;
      state.status = 0;
      state.statusText = '';
      state.responseText = '';
      return undefined;
    };
    xhr.send = function send(_body) {
      if (state.readyState !== 1) {
        throw makeNetworkDisabledError('XMLHttpRequest.send', 'open() not called');
      }
      state.sent = true;
      state.readyState = 4;
      state.status = 0;
      state.statusText = '';
      state.responseText = '';
      var err = makeNetworkDisabledError('XMLHttpRequest.send');
      if (typeof xhr.onerror === 'function') {
        try { xhr.onerror(createPlaceholderEvent('error', { bubbles: false }, {})); } catch (_) {}
      }
      throw err;
    };
    xhr.abort = function abort() {
      state.aborted = true;
      state.sent = false;
      state.readyState = 0;
      if (typeof xhr.onabort === 'function') {
        try { xhr.onabort(createPlaceholderEvent('abort', { bubbles: false }, {})); } catch (_) {}
      }
      return undefined;
    };
    xhr.setRequestHeader = function setRequestHeader(name, value) {
      if (state.readyState !== 1) {
        throw makeNetworkDisabledError('XMLHttpRequest.setRequestHeader', 'invalid state');
      }
      state.requestHeaders[String(name)] = String(value == null ? '' : value);
      return undefined;
    };
    xhr.getResponseHeader = function getResponseHeader(_name) { return null; };
    xhr.getAllResponseHeaders = function getAllResponseHeaders() { return ''; };
    xhr.overrideMimeType = function overrideMimeType(_mime) { return undefined; };
    xhr.addEventListener = function addEventListener() { return undefined; };
    xhr.removeEventListener = function removeEventListener() { return undefined; };
    xhr.dispatchEvent = function dispatchEvent() { return true; };
    return xhr;
  }

  function getWindowMetricsOverrides() {
    var state = getTaskState();
    return state && state.windowMetrics ? state.windowMetrics : null;
  }

  function getMetricNumber(key, fallback) {
    var overrides = getWindowMetricsOverrides();
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
      var n = Number(overrides[key]);
      if (Number.isFinite ? Number.isFinite(n) : isFinite(n)) {
        return n;
      }
    }
    return fallback;
  }

  // ── Base64 辅助 ──────────────────────────────────────────────────────────
  var _b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  function _btoa(data) {
    var str = String(data == null ? '' : data);
    var output = '';
    for (var block, charCode, idx = 0, map = _b64chars;
         str.charAt(idx | 0) || (map = '=', idx % 1);
         output += map.charAt(63 & block >> 8 - idx % 1 * 8)) {
      charCode = str.charCodeAt(idx += 3 / 4);
      if (charCode > 0xFF) {
        throw new Error('btoa: The string to be encoded contains characters outside of the Latin1 range.');
      }
      block = block << 8 | charCode;
    }
    return output;
  }

  function _atob(encoded) {
    var str = String(encoded == null ? '' : encoded).replace(/=+$/, '');
    var output = '';
    for (var bc = 0, bs, buffer, idx = 0;
         buffer = str.charAt(idx++);
         ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4)
           ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
      buffer = _b64chars.indexOf(buffer);
    }
    return output;
  }

  class WindowImpl {
    // ── 视口尺寸 ────────────────────────────────────────────────────────────
    get innerWidth()  { return getMetricNumber('innerWidth', 1920); }
    get innerHeight() { return getMetricNumber('innerHeight', 1080); }
    get outerWidth()  { return getMetricNumber('outerWidth', 1920); }
    get outerHeight() { return getMetricNumber('outerHeight', 1080); }

    // ── 屏幕位置 ────────────────────────────────────────────────────────────
    get screenX()    { return 0; }
    get screenY()    { return 0; }
    get screenLeft() { return 0; }
    get screenTop()  { return 0; }

    // ── 滚动位置 ────────────────────────────────────────────────────────────
    get scrollX()     { return 0; }
    get scrollY()     { return 0; }
    get pageXOffset() { return 0; }
    get pageYOffset() { return 0; }

    // ── 设备像素比 ──────────────────────────────────────────────────────────
    get devicePixelRatio() { return getMetricNumber('devicePixelRatio', 1); }

    // ── 安全上下文 ──────────────────────────────────────────────────────────
    get isSecureContext() { return true; }

    // ── origin ──────────────────────────────────────────────────────────────
    get origin() {
      var loc = this.location;
      if (loc && typeof loc.origin === 'string') {
        return loc.origin || 'null';
      }
      return 'null';
    }
    set origin(_val)   { /* read-only in practice */ }

    // ── name / status ────────────────────────────────────────────────────────
    get name()      { return _windowName; }
    set name(val)   { _windowName = String(val == null ? '' : val); }
    get status()    { return _windowStatus; }
    set status(val) { _windowStatus = String(val == null ? '' : val); }

    // ── opener / closed ──────────────────────────────────────────────────────
    get opener()    { return _opener; }
    set opener(val) { _opener = val; }
    get closed()    { return false; }

    // ── frame 相关 ───────────────────────────────────────────────────────────
    get self()       { return this; }    // self === window
    set self(_val)   { /* read-only in browsers, no-op */ }
    get frames()     { return this; }
    set frames(_val) { /* no-op */ }
    get length() {
      // A3: return actual child frame count from C++ side
      var bridge = getNativeBridge();
      if (bridge && typeof bridge.getChildFrameCount === 'function') {
        return bridge.getChildFrameCount();
      }
      return 0;
    }
    set length(_val) { /* no-op */ }
    get top()        { return this; }    // 顶层 window
    get parent()     { return this; }    // 无父框架时 parent === self

    // ── navigator ────────────────────────────────────────────────────────────
    get navigator() {
      if (!_navigatorInstance) {
        _navigatorInstance = leapenv.nativeInstances && leapenv.nativeInstances['navigator'];
      }
      return _navigatorInstance;
    }

    // ── history ──────────────────────────────────────────────────────────────
    get history() {
      if (!_historyInstance) {
        _historyInstance = leapenv.nativeInstances && leapenv.nativeInstances['history'];
      }
      return _historyInstance;
    }

    // ── performance ──────────────────────────────────────────────────────────
    get performance() {
      if (!_performanceInstance) {
        _performanceInstance = leapenv.nativeInstances && leapenv.nativeInstances['performance'];
      }
      return _performanceInstance;
    }

    // ── screen ───────────────────────────────────────────────────────────────
    get screen() {
      if (!_screenInstance) {
        _screenInstance = leapenv.nativeInstances && leapenv.nativeInstances['screen'];
      }
      return _screenInstance;
    }

    // ── localStorage / sessionStorage ─────────────────────────────────────────
    get localStorage() {
      if (!_localStorageInstance) {
        _localStorageInstance = leapenv.nativeInstances && leapenv.nativeInstances['localStorage'];
      }
      return _localStorageInstance;
    }

    get sessionStorage() {
      if (!_sessionStorageInstance) {
        _sessionStorageInstance = leapenv.nativeInstances && leapenv.nativeInstances['sessionStorage'];
      }
      return _sessionStorageInstance;
    }

    get crypto() {
      if (!_cryptoInstance) {
        _cryptoInstance = createCryptoPlaceholder();
      }
      return _cryptoInstance;
    }

    // ── document ────────────────────────────────────────────────────────────
    // createNodeObject('HTMLDocument') 内部已通过 __applyInstanceSkeleton__ 将
    // document.instance.skeleton 的 C++ 拦截器（含 location）安装到对象上，
    // 无需再用 JS Object.defineProperty 补丁。
    get document() {
      if (dom && typeof dom.getOrCreateTaskDocument === 'function') {
        var doc = dom.getOrCreateTaskDocument();
        if (dom && typeof dom.ensureDocumentDefaultTree === 'function') {
          try { dom.ensureDocumentDefaultTree(doc); } catch (_) {}
        }
        if (dom && typeof dom.setDocumentUrl === 'function') {
          try {
            var loc = this.location;
            if (loc && typeof loc.href === 'string') {
              dom.setDocumentUrl(doc, loc.href || 'about:blank');
            }
          } catch (_) {}
        }
        return doc;
      }
      if (dom && typeof dom.createNodeObject === 'function') {
        var doc = dom.createNodeObject('HTMLDocument');
        dom.ensureDocumentState(doc);
        return doc;
      }
      return {};
    }

    // ── location ─────────────────────────────────────────────────────────────
    // skeleton_registry.cc 在创建命名实例后会将其存入 leapenv.nativeInstances，
    // 因此可在此取到含所有 instance 级 dispatch 拦截器的原生 Location 单例。
    get location() {
      if (!_locationInstance) {
        _locationInstance = leapenv.nativeInstances && leapenv.nativeInstances['location'];
      }
      return _locationInstance;
    }

    set location(url) {
      this.location.href = String(url == null ? '' : url);
    }

    // ── 弹窗 & UI（存根）────────────────────────────────────────────────────
    alert(message)             { console.log('[Window.alert]', message); }
    confirm(_message)          { return false; }
    prompt(_message, _default) { return null; }
    print()                    { /* no-op */ }
    focus()                    { /* no-op */ }
    blur()                     { /* no-op */ }
    close()                    { /* no-op */ }
    open(_url, _target, _feat) { return null; }
    scroll(_x, _y)             { /* no-op */ }
    scrollTo(_x, _y)           { /* no-op */ }
    scrollBy(_x, _y)           { /* no-op */ }
    resizeTo(_w, _h)           { /* no-op */ }
    resizeBy(_dw, _dh)         { /* no-op */ }
    moveTo(_x, _y)             { /* no-op */ }
    moveBy(_dx, _dy)           { /* no-op */ }

    // ── 标准占位空壳（Patch 4）──────────────────────────────────────────────
    fetch(_input, _init) {
      return rejectNetwork('fetch');
    }

    XMLHttpRequest() {
      return createXmlHttpRequestPlaceholder();
    }

    DOMParser() {
      return createDomParserPlaceholder();
    }

    XMLSerializer() {
      return createXmlSerializerPlaceholder();
    }

    MutationObserver(callback) {
      return createMutationObserverPlaceholder(callback);
    }

    CustomEvent(type, init) {
      if (typeof global.CustomEvent === 'function') {
        try { return new global.CustomEvent(type, init); } catch (_) {}
      }
      return createPlaceholderEvent(type, init, {
        detail: init && Object.prototype.hasOwnProperty.call(init, 'detail') ? init.detail : null
      });
    }

    MessageEvent(type, init) {
      var opts = init || {};
      return createPlaceholderEvent(type, init, {
        data: Object.prototype.hasOwnProperty.call(opts, 'data') ? opts.data : null,
        origin: opts.origin == null ? '' : String(opts.origin),
        lastEventId: opts.lastEventId == null ? '' : String(opts.lastEventId),
        source: opts.source == null ? null : opts.source,
        ports: Array.isArray(opts.ports) ? opts.ports.slice() : []
      });
    }

    MouseEvent(type, init) {
      var opts = init || {};
      return createPlaceholderEvent(type, init, {
        clientX: Number(opts.clientX || 0),
        clientY: Number(opts.clientY || 0),
        screenX: Number(opts.screenX || 0),
        screenY: Number(opts.screenY || 0),
        button: Number(opts.button || 0),
        buttons: Number(opts.buttons || 0),
        ctrlKey: !!opts.ctrlKey,
        shiftKey: !!opts.shiftKey,
        altKey: !!opts.altKey,
        metaKey: !!opts.metaKey
      });
    }

    KeyboardEvent(type, init) {
      var opts = init || {};
      return createPlaceholderEvent(type, init, {
        key: opts.key == null ? '' : String(opts.key),
        code: opts.code == null ? '' : String(opts.code),
        keyCode: Number(opts.keyCode || 0),
        which: Number(opts.which || opts.keyCode || 0),
        ctrlKey: !!opts.ctrlKey,
        shiftKey: !!opts.shiftKey,
        altKey: !!opts.altKey,
        metaKey: !!opts.metaKey,
        repeat: !!opts.repeat
      });
    }

    // ── 定时器（存根）────────────────────────────────────────────────────────
    setTimeout(callback, delay) {
      if (!nativeSetTimeout) { return 0; }
      var args = Array.prototype.slice.call(arguments, 2);
      var id = nativeSetTimeout.apply(global, [callback, delay].concat(args));
      return Number(id) || 0;
    }

    setInterval(callback, delay) {
      if (!nativeSetInterval) { return 0; }
      var args = Array.prototype.slice.call(arguments, 2);
      var id = nativeSetInterval.apply(global, [callback, delay].concat(args));
      return Number(id) || 0;
    }

    clearTimeout(id) {
      if (nativeClearTimeout) {
        try { nativeClearTimeout(id); } catch (_) {}
      }
    }
    clearInterval(id) {
      if (nativeClearInterval) {
        try { nativeClearInterval(id); } catch (_) {}
      }
    }

    requestAnimationFrame(cb) {
      if (typeof cb !== 'function') {
        throw new TypeError('requestAnimationFrame callback must be a function');
      }
      if (!nativeSetTimeout) { return 0; }
      var rafId = (++_rafSeq) || 1;
      var self = this;
      var timeoutId = nativeSetTimeout(function() {
        _rafMap.delete(rafId);
        var ts = 0;
        try {
          var perf = self.performance;
          ts = perf && typeof perf.now === 'function' ? Number(perf.now()) || 0 : Date.now();
        } catch (_) {
          ts = Date.now();
        }
        cb.call(self, ts);
      }, 16);
      _rafMap.set(rafId, timeoutId);
      return rafId;
    }
    cancelAnimationFrame(id)  {
      var timeoutId = _rafMap.get(id);
      if (timeoutId == null) {
        return;
      }
      _rafMap.delete(id);
      if (nativeClearTimeout) {
        try { nativeClearTimeout(timeoutId); } catch (_) {}
      }
    }

    // ── getComputedStyle (B17) ───────────────────────────────────────────────
    getComputedStyle(element, _pseudoElement) {
      if (!dom || !element) { return {}; }
      const state = dom.ensureNodeState(element);
      const styleStore = (state && state.styleStore) ? state.styleStore : {};
      const api = {
        getPropertyValue: (name) => styleStore[name] || '',
        setProperty: () => {},
        removeProperty: () => '',
        get cssText() {
          return Object.keys(styleStore).map(k => k + ': ' + styleStore[k] + ';').join(' ');
        }
      };
      return typeof Proxy === 'function' ? new Proxy(api, {
        get(target, prop, receiver) {
          if (typeof prop === 'string' && !(prop in target)) { return styleStore[prop] || ''; }
          return Reflect.get(target, prop, receiver);
        }
      }) : api;
    }

    // ── C6: Base64 ───────────────────────────────────────────────────────────
    btoa(data)    { return _btoa(data); }
    atob(encoded) { return _atob(encoded); }

    // ── I-11 EventTarget（Window 级，不走 DOM 冒泡） ──────────────────────────
    addEventListener(type, listener, options) {
      if (typeof listener !== 'function') return;
      var t = String(type);
      if (!_windowListeners.has(t)) _windowListeners.set(t, new Map());
      var typeMap = _windowListeners.get(t);
      if (typeMap.has(listener)) return;

      var capture = false, once = false, passive = false;
      if (options && typeof options === 'object') {
        capture = !!options.capture;
        once    = !!options.once;
        passive = !!options.passive;
      } else if (typeof options === 'boolean') {
        capture = options;
      }

      var entry = { fn: listener, wrappedFn: null, once: once, capture: capture, passive: passive };
      if (once) {
        var self = this;
        entry.wrappedFn = (function(originalFn, tp, opts) {
          return function(event) {
            self.removeEventListener(tp, originalFn, opts);
            originalFn.call(self, event);
          };
        })(listener, t, options);
      }
      typeMap.set(listener, entry);
    }

    removeEventListener(type, listener) {
      var t = String(type);
      var typeMap = _windowListeners.get(t);
      if (typeMap) typeMap.delete(listener);
    }

    dispatchEvent(event) {
      var t = String(event && event.type);
      var typeMap = _windowListeners.get(t);
      if (!typeMap) return true;
      event.target = event.currentTarget = this;
      var entries = Array.from(typeMap.values());
      for (var i = 0; i < entries.length; i++) {
        var callFn = entries[i].wrappedFn || entries[i].fn;
        try { callFn.call(this, event); } catch (e) {}
      }
      return !event.defaultPrevented;
    }
  }

  leapenv.registerImpl('Window', WindowImpl);

  // Some Window-exposed APIs are used as constructors in site scripts.
  // If native skeleton stubs expose them as non-constructible callables,
  // replace them with constructible JS wrappers that delegate to WindowImpl.
  function installConstructibleWindowWrappers() {
    var ctorNames = [
      'XMLHttpRequest',
      'DOMParser',
      'XMLSerializer',
      'MutationObserver',
      'CustomEvent',
      'MessageEvent',
      'MouseEvent',
      'KeyboardEvent'
    ];
    for (var i = 0; i < ctorNames.length; i++) {
      var name = ctorNames[i];
      if (typeof global[name] !== 'function') {
        continue;
      }
      var wrapper = (function(apiName) {
        var fn = function LeapCtorWrapper() {
          var implProto = leapenv.implRegistry &&
            leapenv.implRegistry.Window &&
            leapenv.implRegistry.Window.prototype;
          if (!implProto || typeof implProto[apiName] !== 'function') {
            throw new TypeError(apiName + ' is not available');
          }
          return implProto[apiName].apply(global, arguments);
        };
        try {
          Object.defineProperty(fn, 'name', {
            value: apiName,
            writable: false,
            configurable: true
          });
        } catch (_) {}
        return fn;
      })(name);
      try {
        Object.defineProperty(global, name, {
          value: wrapper,
          writable: true,
          configurable: true,
          enumerable: false
        });
      } catch (_) {
        try { global[name] = wrapper; } catch (_) {}
      }
      try {
        if (global.window && typeof global.window === 'object') {
          global.window[name] = wrapper;
        }
      } catch (_) {}
    }
  }
  leapenv.installConstructibleWindowWrappers = installConstructibleWindowWrappers;
  installConstructibleWindowWrappers();

})(globalThis);
