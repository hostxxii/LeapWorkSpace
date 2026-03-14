(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared || null;

  // 每个 Location 实例的私有状态（WeakMap 隔离，为将来多 Context 场景做准备）
  var _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getState(self) {
    if (!_stateMap) {
      if (!self.__leapLocationState) {
        Object.defineProperty(self, '__leapLocationState', {
          value: { href: 'about:blank' },
          writable: true, enumerable: false, configurable: true
        });
      }
      return self.__leapLocationState;
    }
    if (!_stateMap.has(self)) {
      _stateMap.set(self, { href: 'about:blank' });
    }
    return _stateMap.get(self);
  }

  function syncActiveDocumentUrl(href) {
    if (!dom) {
      return;
    }
    var nativeInstances = leapenv.nativeInstances || {};
    var doc = nativeInstances.document || null;
    if (!doc && typeof dom.getOrCreateTaskDocument === 'function') {
      try {
        doc = dom.getOrCreateTaskDocument();
      } catch (_) {
        doc = null;
      }
    }
    if (!doc) {
      return;
    }
    try {
      if (typeof dom.setDocumentUrl === 'function') {
        dom.setDocumentUrl(doc, href);
      } else {
        dom.ensureNodeState(doc).url = String(href == null || href === '' ? 'about:blank' : href);
      }
    } catch (_) {}
  }

  function setHrefAndSync(self, href) {
    var nextHref = String(href == null || href === '' ? 'about:blank' : href);
    var state = getState(self);
    state.href = nextHref;
    if (state.__perfDispatchCache && typeof state.__perfDispatchCache === 'object') {
      delete state.__perfDispatchCache.host;
    }
    syncActiveDocumentUrl(nextHref);
  }

  function isDispatchCacheEnabled() {
    return typeof leapenv.isPerfDispatchCacheEnabled === 'function' &&
      leapenv.isPerfDispatchCacheEnabled();
  }

  function getStateDispatchCache(state, createIfMissing) {
    if (!isDispatchCacheEnabled()) {
      return null;
    }
    if (!state.__perfDispatchCache || typeof state.__perfDispatchCache !== 'object') {
      if (!createIfMissing) {
        return null;
      }
      state.__perfDispatchCache = {};
    }
    return state.__perfDispatchCache;
  }

  // ── URL 解析 ────────────────────────────────────────────────────────────────
  function _parseUrl(url) {
    var r = { protocol:'', hostname:'', port:'', pathname:'/', search:'', hash:'', host:'', origin:'null' };
    var s = String(url || '');
    if (s === 'about:blank' || s === '') return r;
    var hashIdx = s.indexOf('#');
    if (hashIdx !== -1) { r.hash = s.substring(hashIdx); s = s.substring(0, hashIdx); }
    var searchIdx = s.indexOf('?');
    if (searchIdx !== -1) { r.search = s.substring(searchIdx); s = s.substring(0, searchIdx); }
    var protoEnd = s.indexOf('://');
    if (protoEnd !== -1) { r.protocol = s.substring(0, protoEnd + 1); s = s.substring(protoEnd + 3); }
    var pathIdx = s.indexOf('/');
    if (pathIdx !== -1) { r.pathname = s.substring(pathIdx) || '/'; s = s.substring(0, pathIdx); }
    var portIdx = s.lastIndexOf(':');
    if (portIdx !== -1) { r.port = s.substring(portIdx + 1); r.hostname = s.substring(0, portIdx); }
    else { r.hostname = s; }
    r.host   = r.hostname + (r.port ? ':' + r.port : '');
    r.origin = r.protocol ? r.protocol + '//' + r.host : 'null';
    return r;
  }

  // ── URL 重建（从各组件拼回完整 href）────────────────────────────────────────
  function _buildUrl(parts) {
    var url = '';
    if (parts.protocol) url += parts.protocol + '//';
    url += parts.host || parts.hostname;
    url += parts.pathname;
    url += parts.search;
    url += parts.hash;
    return url || 'about:blank';
  }

  class LocationImpl {
    // ── href ────────────────────────────────────────────────────────────────────
    get href() { return getState(this).href; }
    set href(val) { setHrefAndSync(this, val); }

    // ── protocol ────────────────────────────────────────────────────────────────
    get protocol() { return _parseUrl(getState(this).href).protocol; }
    set protocol(val) {
      var p = _parseUrl(getState(this).href);
      p.protocol = String(val || '').replace(/:*$/, '') + ':';
      setHrefAndSync(this, _buildUrl(p));
    }

    // ── hostname ────────────────────────────────────────────────────────────────
    get hostname() { return _parseUrl(getState(this).href).hostname; }
    set hostname(val) {
      var p = _parseUrl(getState(this).href);
      p.hostname = String(val || '');
      p.host = p.hostname + (p.port ? ':' + p.port : '');
      setHrefAndSync(this, _buildUrl(p));
    }

    // ── port ────────────────────────────────────────────────────────────────────
    get port() { return _parseUrl(getState(this).href).port; }
    set port(val) {
      var p = _parseUrl(getState(this).href);
      p.port = String(val || '');
      p.host = p.hostname + (p.port ? ':' + p.port : '');
      setHrefAndSync(this, _buildUrl(p));
    }

    // ── pathname ────────────────────────────────────────────────────────────────
    get pathname() { return _parseUrl(getState(this).href).pathname; }
    set pathname(val) {
      var p = _parseUrl(getState(this).href);
      var pn = String(val || '/');
      p.pathname = pn.charAt(0) === '/' ? pn : '/' + pn;
      setHrefAndSync(this, _buildUrl(p));
    }

    // ── search ──────────────────────────────────────────────────────────────────
    get search() { return _parseUrl(getState(this).href).search; }
    set search(val) {
      var p = _parseUrl(getState(this).href);
      var s = String(val || '');
      p.search = (s && s.charAt(0) !== '?') ? '?' + s : s;
      setHrefAndSync(this, _buildUrl(p));
    }

    // ── hash ────────────────────────────────────────────────────────────────────
    get hash() { return _parseUrl(getState(this).href).hash; }
    set hash(val) {
      var p = _parseUrl(getState(this).href);
      var h = String(val || '');
      p.hash = (h && h.charAt(0) !== '#') ? '#' + h : h;
      setHrefAndSync(this, _buildUrl(p));
    }

    // ── host ────────────────────────────────────────────────────────────────────
    get host() {
      var state = getState(this);
      var cache = getStateDispatchCache(state, true);
      if (cache && Object.prototype.hasOwnProperty.call(cache, 'host')) {
        return cache.host;
      }
      var value = _parseUrl(state.href).host;
      if (cache) {
        cache.host = value;
      }
      return value;
    }
    set host(val) {
      var p = _parseUrl(getState(this).href);
      var hostStr = String(val || '');
      var colonIdx = hostStr.lastIndexOf(':');
      if (colonIdx !== -1) {
        p.hostname = hostStr.substring(0, colonIdx);
        p.port     = hostStr.substring(colonIdx + 1);
      } else {
        p.hostname = hostStr;
        p.port     = '';
      }
      p.host = p.hostname + (p.port ? ':' + p.port : '');
      setHrefAndSync(this, _buildUrl(p));
    }

    // ── origin (只读) ───────────────────────────────────────────────────────────
    get origin() { return _parseUrl(getState(this).href).origin; }

    // ── ancestorOrigins (只读，空列表) ──────────────────────────────────────────
    get ancestorOrigins() {
      return { length: 0, item: function() { return null; }, contains: function() { return false; } };
    }

    // ── 导航方法 ────────────────────────────────────────────────────────────────
    assign(url)  { setHrefAndSync(this, url); }
    replace(url) { setHrefAndSync(this, url); }
    reload()     { /* no-op in headless VM */ }

    // ── 字符串化 ────────────────────────────────────────────────────────────────
    toString() { return getState(this).href; }
    valueOf()  { return this; }
  }

  leapenv.registerImpl('Location', LocationImpl);
})(globalThis);
