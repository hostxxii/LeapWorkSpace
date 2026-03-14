(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getState(self) {
    if (_stateMap) return _stateMap.get(self) || null;
    return self.__leapNodeListState || null;
  }

  function setState(self, state) {
    if (_stateMap) {
      _stateMap.set(self, state);
      return;
    }
    Object.defineProperty(self, '__leapNodeListState', {
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

  function createNodeListObject(items, resolver) {
    const obj = createNativeCollectionObject('NodeList');
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

  class NodeListImpl {
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

    forEach(callback, thisArg) {
      if (typeof callback !== 'function') {
        throw new TypeError('NodeList.forEach callback must be a function');
      }
      const list = getItems(this);
      for (let i = 0; i < list.length; i++) {
        callback.call(thisArg, list[i], i, this);
      }
    }

    entries() {
      const list = getItems(this).slice();
      let i = 0;
      return {
        next() {
          if (i >= list.length) return { done: true, value: undefined };
          return { done: false, value: [i, list[i++]] };
        }
      };
    }

    keys() {
      const list = getItems(this);
      let i = 0;
      return {
        next() {
          if (i >= list.length) return { done: true, value: undefined };
          return { done: false, value: i++ };
        }
      };
    }

    values() {
      const list = getItems(this).slice();
      let i = 0;
      return {
        next() {
          if (i >= list.length) return { done: true, value: undefined };
          return { done: false, value: list[i++] };
        }
      };
    }

    ['@@iterator']() {
      return this.values();
    }
  }

  leapenv.createNodeListObject = createNodeListObject;
  leapenv.registerImpl('NodeList', NodeListImpl);
})(globalThis);
