(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared || null;

  // 每个 history 实例的私有状态（WeakMap 隔离）
  var _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getState(self) {
    if (!_stateMap) return { length: 1, state: null, scrollRestoration: 'auto' };
    if (!_stateMap.has(self)) {
      _stateMap.set(self, { length: 1, state: null, scrollRestoration: 'auto' });
    }
    return _stateMap.get(self);
  }

  function syncLocationFromHistory(url) {
    if (url == null || url === '') {
      return;
    }
    var nativeInstances = leapenv.nativeInstances || {};
    var location = nativeInstances.location || null;
    if (location) {
      try {
        location.href = String(url);
        return;
      } catch (_) {}
    }
    if (dom && typeof dom.getOrCreateTaskDocument === 'function' && typeof dom.setDocumentUrl === 'function') {
      try {
        var doc = nativeInstances.document || dom.getOrCreateTaskDocument();
        if (doc) {
          dom.setDocumentUrl(doc, String(url));
        }
      } catch (_) {}
    }
  }

  class HistoryImpl {
    get length()  { return getState(this).length; }
    get state()   { return getState(this).state; }

    get scrollRestoration()      { return getState(this).scrollRestoration; }
    set scrollRestoration(val) {
      var s = String(val || 'auto');
      if (s === 'manual' || s === 'auto') {
        getState(this).scrollRestoration = s;
      }
    }

    back()    { /* no-op in headless VM */ }
    forward() { /* no-op in headless VM */ }
    go(_delta){ /* no-op in headless VM */ }

    pushState(stateObj, _title, url) {
      var s = getState(this);
      s.state = stateObj != null ? stateObj : null;
      s.length++;
      syncLocationFromHistory(url);
    }

    replaceState(stateObj, _title, url) {
      var s = getState(this);
      s.state = stateObj != null ? stateObj : null;
      syncLocationFromHistory(url);
    }
  }

  leapenv.registerImpl('History', HistoryImpl);

  leapenv.historyImplHelpers = leapenv.historyImplHelpers || {
    reset: function (historyObj) {
      if (!historyObj) return;
      var s = getState(historyObj);
      s.length = 1;
      s.state = null;
      s.scrollRestoration = 'auto';
    }
  };
})(globalThis);
