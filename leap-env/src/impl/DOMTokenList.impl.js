(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;
  const _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  function getState(self) {
    if (_stateMap) return _stateMap.get(self) || null;
    return self.__leapDOMTokenListState || null;
  }

  function setState(self, state) {
    if (_stateMap) {
      _stateMap.set(self, state);
      return;
    }
    Object.defineProperty(self, '__leapDOMTokenListState', {
      value: state,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  function createNativeCollectionObject(ctorName) {
    let obj = null;
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

  function getTokens(self) {
    const state = getState(self);
    if (!state || !state.node) return [];
    const className = dom.getNodeClassName(state.node) || '';
    return className ? className.split(/\s+/).filter(Boolean) : [];
  }

  function setTokens(self, tokens) {
    const state = getState(self);
    if (!state || !state.node) return;
    dom.setNodeClassName(state.node, (tokens || []).join(' '));
  }

  function clearIndexedProps(obj, state) {
    const prev = (state && state._indexedKeys) ? state._indexedKeys : [];
    for (let i = 0; i < prev.length; i++) {
      try { delete obj[prev[i]]; } catch (_) {}
    }
    state._indexedKeys = [];
  }

  function syncIndexedProps(obj) {
    const state = getState(obj);
    if (!state) return;
    const tokens = getTokens(obj);
    clearIndexedProps(obj, state);
    for (let i = 0; i < tokens.length; i++) {
      const key = String(i);
      try {
        Object.defineProperty(obj, key, {
          value: tokens[i],
          writable: false,
          enumerable: true,
          configurable: true
        });
      } catch (_) {
        try { obj[key] = tokens[i]; } catch (_) {}
      }
      state._indexedKeys.push(key);
    }
  }

  function normalizeToken(token) {
    const value = String(token == null ? '' : token);
    if (!value || /\s/.test(value)) {
      throw new TypeError("Failed to execute DOMTokenList method: token contains invalid characters");
    }
    return value;
  }

  function createDOMTokenListObject(node) {
    const obj = createNativeCollectionObject('DOMTokenList');
    setState(obj, { node: node, _indexedKeys: [] });
    syncIndexedProps(obj);
    return obj;
  }

  class DOMTokenListImpl {
    get length() {
      syncIndexedProps(this);
      return getTokens(this).length;
    }

    get value() {
      syncIndexedProps(this);
      const state = getState(this);
      return state && state.node ? (dom.getNodeClassName(state.node) || '') : '';
    }

    set value(v) {
      const text = v == null ? '' : String(v);
      const state = getState(this);
      if (!state || !state.node) return;
      dom.setNodeClassName(state.node, text);
      syncIndexedProps(this);
    }

    add() {
      const tokens = getTokens(this);
      for (let i = 0; i < arguments.length; i++) {
        const t = normalizeToken(arguments[i]);
        if (tokens.indexOf(t) < 0) tokens.push(t);
      }
      setTokens(this, tokens);
      syncIndexedProps(this);
    }

    remove() {
      const tokens = getTokens(this);
      for (let i = 0; i < arguments.length; i++) {
        const t = normalizeToken(arguments[i]);
        let idx = tokens.indexOf(t);
        while (idx >= 0) {
          tokens.splice(idx, 1);
          idx = tokens.indexOf(t);
        }
      }
      setTokens(this, tokens);
      syncIndexedProps(this);
    }

    toggle(token, force) {
      const t = normalizeToken(token);
      const tokens = getTokens(this);
      const idx = tokens.indexOf(t);
      if (idx >= 0) {
        if (force === true) return true;
        tokens.splice(idx, 1);
        setTokens(this, tokens);
        syncIndexedProps(this);
        return false;
      }
      if (force === false) return false;
      tokens.push(t);
      setTokens(this, tokens);
      syncIndexedProps(this);
      return true;
    }

    contains(token) {
      const t = normalizeToken(token);
      return getTokens(this).indexOf(t) >= 0;
    }

    replace(oldToken, newToken) {
      const oldT = normalizeToken(oldToken);
      const newT = normalizeToken(newToken);
      const tokens = getTokens(this);
      const idx = tokens.indexOf(oldT);
      if (idx < 0) return false;
      if (tokens.indexOf(newT) >= 0) {
        tokens.splice(idx, 1);
      } else {
        tokens[idx] = newT;
      }
      setTokens(this, tokens);
      syncIndexedProps(this);
      return true;
    }

    supports(_token) {
      return false;
    }

    item(index) {
      syncIndexedProps(this);
      const tokens = getTokens(this);
      const n = Number(index);
      if (!(Number.isFinite ? Number.isFinite(n) : isFinite(n))) return null;
      const i = n < 0 ? -1 : Math.floor(n);
      return (i >= 0 && i < tokens.length) ? tokens[i] : null;
    }

    toString() {
      return this.value;
    }

    forEach(callback, thisArg) {
      if (typeof callback !== 'function') {
        throw new TypeError('DOMTokenList.forEach callback must be a function');
      }
      const tokens = getTokens(this);
      for (let i = 0; i < tokens.length; i++) {
        callback.call(thisArg, tokens[i], i, this);
      }
    }

    entries() {
      const tokens = getTokens(this).slice();
      let i = 0;
      return {
        next() {
          if (i >= tokens.length) return { done: true, value: undefined };
          return { done: false, value: [i, tokens[i++]] };
        }
      };
    }

    keys() {
      const tokens = getTokens(this);
      let i = 0;
      return {
        next() {
          if (i >= tokens.length) return { done: true, value: undefined };
          return { done: false, value: i++ };
        }
      };
    }

    values() {
      const tokens = getTokens(this).slice();
      let i = 0;
      return {
        next() {
          if (i >= tokens.length) return { done: true, value: undefined };
          return { done: false, value: tokens[i++] };
        }
      };
    }

    ['@@iterator']() {
      return this.values();
    }
  }

  leapenv.createDOMTokenListObject = createDOMTokenListObject;
  leapenv.refreshDOMTokenListObject = function (obj) {
    try { syncIndexedProps(obj); } catch (_) {}
    return obj;
  };
  leapenv.registerImpl('DOMTokenList', DOMTokenListImpl);
})(globalThis);

