(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;
  const _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  function getState(self) {
    if (_stateMap) return _stateMap.get(self) || null;
    return self.__leapNamedNodeMapState || null;
  }

  function setState(self, state) {
    if (_stateMap) {
      _stateMap.set(self, state);
      return;
    }
    Object.defineProperty(self, '__leapNamedNodeMapState', {
      value: state,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  function getNativeBridge() {
    if (typeof leapenv.getNativeBridge === 'function') {
      try { return leapenv.getNativeBridge(); } catch (_) {}
    }
    return null;
  }

  function createNativeCollectionObject(ctorName) {
    const bridge = getNativeBridge();
    let obj = null;
    if (bridge && typeof bridge.createSkeletonInstance === 'function') {
      try { obj = bridge.createSkeletonInstance(ctorName, ''); } catch (_) { obj = null; }
    }
    if (!obj && bridge && typeof bridge.createNative === 'function') {
      try { obj = bridge.createNative(ctorName); } catch (_) { obj = null; }
    }
    if (!obj) obj = {};
    if (bridge && typeof bridge.applyInstanceSkeleton === 'function') {
      try { bridge.applyInstanceSkeleton(obj, ctorName); } catch (_) {}
    }
    return obj;
  }

  function getNode(self) {
    const state = getState(self);
    return state ? state.node : null;
  }

  function getStore(self) {
    const node = getNode(self);
    if (!node) return {};
    const state = dom.ensureNodeState(node);
    return state.attributeStore || {};
  }

  function makeAttr(name, value) {
    const v = value == null ? '' : String(value);
    return {
      name: String(name || ''),
      localName: String(name || ''),
      value: v,
      nodeType: 2,
      nodeValue: v
    };
  }

  function listAttrs(self) {
    const store = getStore(self);
    const keys = Object.keys(store);
    const out = [];
    for (let i = 0; i < keys.length; i++) {
      out.push(makeAttr(keys[i], store[keys[i]]));
    }
    return out;
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
    const attrs = listAttrs(obj);
    clearIndexedProps(obj, state);
    for (let i = 0; i < attrs.length; i++) {
      const key = String(i);
      try {
        Object.defineProperty(obj, key, {
          value: attrs[i],
          writable: false,
          enumerable: true,
          configurable: true
        });
      } catch (_) {
        try { obj[key] = attrs[i]; } catch (_) {}
      }
      state._indexedKeys.push(key);
    }
  }

  function normalizeName(name) {
    return String(name == null ? '' : name).trim().toLowerCase();
  }

  function createNamedNodeMapObject(node) {
    const obj = createNativeCollectionObject('NamedNodeMap');
    setState(obj, { node: node, _indexedKeys: [] });
    syncIndexedProps(obj);
    return obj;
  }

  class NamedNodeMapImpl {
    get length() {
      syncIndexedProps(this);
      return listAttrs(this).length;
    }

    getNamedItem(name) {
      const store = getStore(this);
      const key = normalizeName(name);
      return Object.prototype.hasOwnProperty.call(store, key) ? makeAttr(key, store[key]) : null;
    }

    getNamedItemNS(_ns, name) {
      return this.getNamedItem(name);
    }

    item(index) {
      syncIndexedProps(this);
      const attrs = listAttrs(this);
      const n = Number(index);
      if (!(Number.isFinite ? Number.isFinite(n) : isFinite(n))) return null;
      const i = n < 0 ? -1 : Math.floor(n);
      return (i >= 0 && i < attrs.length) ? attrs[i] : null;
    }

    removeNamedItem(name) {
      const old = this.getNamedItem(name);
      if (!old) {
        throw new Error('NotFoundError');
      }
      const node = getNode(this);
      dom.removeNodeAttribute(node, name);
      syncIndexedProps(this);
      return old;
    }

    removeNamedItemNS(_ns, name) {
      return this.removeNamedItem(name);
    }

    setNamedItem(attr) {
      if (!attr || typeof attr !== 'object') {
        throw new TypeError('setNamedItem expects an attribute-like object');
      }
      const node = getNode(this);
      dom.setNodeAttribute(node, attr.name, attr.value);
      syncIndexedProps(this);
      return null;
    }

    setNamedItemNS(attr) {
      return this.setNamedItem(attr);
    }

    ['@@iterator']() {
      const attrs = listAttrs(this);
      let i = 0;
      return {
        next() {
          if (i >= attrs.length) return { done: true, value: undefined };
          return { done: false, value: attrs[i++] };
        }
      };
    }
  }

  leapenv.createNamedNodeMapObject = createNamedNodeMapObject;
  leapenv.refreshNamedNodeMapObject = function (obj) {
    try { syncIndexedProps(obj); } catch (_) {}
    return obj;
  };
  leapenv.registerImpl('NamedNodeMap', NamedNodeMapImpl);
})(globalThis);
