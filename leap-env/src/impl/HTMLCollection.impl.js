(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared || null;
  const _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getState(self) {
    if (_stateMap) return _stateMap.get(self) || null;
    return self.__leapHTMLCollectionState || null;
  }

  function setState(self, state) {
    if (_stateMap) {
      _stateMap.set(self, state);
      return;
    }
    Object.defineProperty(self, '__leapHTMLCollectionState', {
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

  function normalizeItems(items) {
    return Array.isArray(items) ? items.slice() : [];
  }

  function clearIndexedProps(obj, state) {
    const prev = (state && state._indexedKeys) ? state._indexedKeys : [];
    for (let i = 0; i < prev.length; i++) {
      try { delete obj[prev[i]]; } catch (_) {}
    }
    state._indexedKeys = [];
  }

  function syncIndexedProps(obj, items) {
    const state = getState(obj);
    if (!state) return;
    clearIndexedProps(obj, state);
    for (let i = 0; i < items.length; i++) {
      const key = String(i);
      try {
        Object.defineProperty(obj, key, {
          value: items[i],
          writable: false,
          enumerable: true,
          configurable: true
        });
      } catch (_) {
        try { obj[key] = items[i]; } catch (_) {}
      }
      state._indexedKeys.push(key);
    }
  }

  function refreshState(self) {
    const state = getState(self);
    if (!state) return [];
    if (typeof state.resolver === 'function') {
      const next = state.resolver();
      state.items = Array.isArray(next) ? next : [];
      syncIndexedProps(self, state.items);
    }
    return Array.isArray(state.items) ? state.items : [];
  }

  function getItems(self) {
    return refreshState(self);
  }

  function createHTMLCollectionObject(items, resolver) {
    const obj = createNativeCollectionObject('HTMLCollection');
    const state = {
      items: typeof resolver === 'function' ? [] : normalizeItems(items),
      _indexedKeys: [],
      resolver: typeof resolver === 'function' ? resolver : null
    };
    setState(obj, state);
    if (state.resolver) {
      refreshState(obj);
    } else {
      syncIndexedProps(obj, state.items);
    }
    return obj;
  }

  function getNodeNames(node) {
    let id = '';
    let name = '';
    if (!node) return { id, name };
    if (dom) {
      try {
        const v = dom.getNodeAttribute(node, 'id');
        if (v != null && v !== '') id = String(v);
      } catch (_) {}
      try {
        const v = dom.getNodeAttribute(node, 'name');
        if (v != null && v !== '') name = String(v);
      } catch (_) {}
    }
    try {
      if (!id && node.id) id = String(node.id);
    } catch (_) {}
    try {
      if (typeof node.getAttribute === 'function') {
        const n = node.getAttribute('name');
        if (!name && n) name = String(n);
      }
    } catch (_) {}
    return { id, name };
  }

  class HTMLCollectionImpl {
    get length() {
      return getItems(this).length;
    }

    item(index) {
      const list = getItems(this);
      const n = Number(index);
      if (!(Number.isFinite ? Number.isFinite(n) : isFinite(n))) return null;
      const i = n < 0 ? -1 : Math.floor(n);
      return (i >= 0 && i < list.length) ? list[i] : null;
    }

    namedItem(name) {
      const needle = String(name == null ? '' : name);
      if (!needle) return null;
      const list = getItems(this);
      for (let i = 0; i < list.length; i++) {
        const node = list[i];
        const names = getNodeNames(node);
        if (names.id === needle || names.name === needle) return node;
      }
      return null;
    }

    ['@@iterator']() {
      const list = getItems(this).slice();
      let i = 0;
      return {
        next() {
          if (i >= list.length) return { done: true, value: undefined };
          return { done: false, value: list[i++] };
        }
      };
    }
  }

  leapenv.createHTMLCollectionObject = createHTMLCollectionObject;
  leapenv.registerImpl('HTMLCollection', HTMLCollectionImpl);
})(globalThis);
