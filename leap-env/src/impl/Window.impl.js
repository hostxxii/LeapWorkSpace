// Window 实现类 (新架构)
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;
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

  function getInternalLeapenv() {
    if (typeof leapenv.getRuntimeStore === 'function') {
      try {
        var runtime = leapenv.getRuntimeStore();
        var internal = runtime && runtime.facade && runtime.facade.internalLeapenv;
        if (internal && typeof internal === 'object') {
          return internal;
        }
      } catch (_) {}
    }
    return leapenv;
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
  var _cryptoInstance = null;  // from leapenv.nativeInstances (Crypto skeleton)
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
  var _timeoutMap = new Map();
  var _intervalMap = new Map();
  function resetWindowVisibleField(target, key, value) {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
      return;
    }
    try {
      target[key] = value;
      return;
    } catch (_) {}
    try {
      Object.defineProperty(target, key, {
        value: value,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch (_) {}
  }

  function getWindowTaskRuntimeStats() {
    var windowListenerCount = 0;
    if (_windowListeners && typeof _windowListeners.forEach === 'function') {
      _windowListeners.forEach(function(typeMap) {
        if (!typeMap) {
          return;
        }
        if (typeof typeMap.size === 'number') {
          windowListenerCount += typeMap.size;
          return;
        }
        if (typeof typeMap.forEach === 'function') {
          typeMap.forEach(function() {
            windowListenerCount += 1;
          });
        }
      });
    }
    return {
      windowListenerCount: windowListenerCount,
      rafCount: _rafMap && typeof _rafMap.size === 'number' ? _rafMap.size : 0,
      timeoutCount: _timeoutMap && typeof _timeoutMap.size === 'number' ? _timeoutMap.size : 0,
      intervalCount: _intervalMap && typeof _intervalMap.size === 'number' ? _intervalMap.size : 0,
      pendingTimerCount:
        (_timeoutMap && typeof _timeoutMap.size === 'number' ? _timeoutMap.size : 0) +
        (_intervalMap && typeof _intervalMap.size === 'number' ? _intervalMap.size : 0)
    };
  }

  function resetWindowTaskState() {
    if (nativeClearTimeout && _rafMap && typeof _rafMap.forEach === 'function') {
      _rafMap.forEach(function(timeoutId) {
        try { nativeClearTimeout(timeoutId); } catch (_) {}
      });
    }
    _rafMap.clear();
    if (nativeClearTimeout && _timeoutMap && typeof _timeoutMap.forEach === 'function') {
      _timeoutMap.forEach(function(timeoutId) {
        try { nativeClearTimeout(timeoutId); } catch (_) {}
      });
    }
    _timeoutMap.clear();
    if (nativeClearInterval && _intervalMap && typeof _intervalMap.forEach === 'function') {
      _intervalMap.forEach(function(intervalId) {
        try { nativeClearInterval(intervalId); } catch (_) {}
      });
    }
    _intervalMap.clear();
    _windowListeners.clear();
    _windowName = '';
    _windowStatus = '';
    _opener = null;
    resetWindowVisibleField(global, 'name', '');
    resetWindowVisibleField(global, 'status', '');
    resetWindowVisibleField(global, 'opener', null);
    if (global.window && global.window !== global) {
      resetWindowVisibleField(global.window, 'name', '');
      resetWindowVisibleField(global.window, 'status', '');
      resetWindowVisibleField(global.window, 'opener', null);
    }
    return true;
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
          throw new TypeError('DOMParser.parseFromString: unsupported mime type: ' + mime);
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
        _cryptoInstance = leapenv.nativeInstances && leapenv.nativeInstances['crypto'];
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

    // ── 最小实现（DOMParser / XMLSerializer / MutationObserver / Events）────
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
      var wrappedCallback = callback;
      if (typeof callback === 'function') {
        wrappedCallback = function() {
          _timeoutMap.delete(publicId);
          return callback.apply(this, arguments);
        };
      }
      var id = nativeSetTimeout.apply(global, [wrappedCallback, delay].concat(args));
      var publicId = Number(id) || 0;
      _timeoutMap.set(publicId, id);
      return publicId;
    }

    setInterval(callback, delay) {
      if (!nativeSetInterval) { return 0; }
      var args = Array.prototype.slice.call(arguments, 2);
      var id = nativeSetInterval.apply(global, [callback, delay].concat(args));
      var publicId = Number(id) || 0;
      _intervalMap.set(publicId, id);
      return publicId;
    }

    clearTimeout(id) {
      var publicId = Number(id) || 0;
      var handle = _timeoutMap.get(publicId);
      _timeoutMap.delete(publicId);
      if (nativeClearTimeout) {
        try { nativeClearTimeout(handle == null ? id : handle); } catch (_) {}
      }
    }
    clearInterval(id) {
      var publicId = Number(id) || 0;
      var handle = _intervalMap.get(publicId);
      _intervalMap.delete(publicId);
      if (nativeClearInterval) {
        try { nativeClearInterval(handle == null ? id : handle); } catch (_) {}
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
  try {
    WindowImpl.__leapResetTaskState = resetWindowTaskState;
  } catch (_) {}
  try {
    WindowImpl.__leapGetTaskRuntimeStats = getWindowTaskRuntimeStats;
  } catch (_) {}
  try {
    if (leapenv.implRegistry && leapenv.implRegistry.Window) {
      leapenv.implRegistry.Window.__leapResetTaskState = resetWindowTaskState;
      leapenv.implRegistry.Window.__leapGetTaskRuntimeStats = getWindowTaskRuntimeStats;
    }
  } catch (_) {}
  try {
    if (leapenv.__runtime && typeof leapenv.__runtime === 'object') {
      leapenv.__runtime.windowTaskReset = resetWindowTaskState;
      leapenv.__runtime.windowTaskGetStats = getWindowTaskRuntimeStats;
    }
  } catch (_) {}

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
