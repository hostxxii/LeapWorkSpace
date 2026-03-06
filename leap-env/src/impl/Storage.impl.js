(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  // 每个 Storage 实例（localStorage / sessionStorage）独立存储
  // 用 WeakMap 以 C++ native 对象为 key 隔离各实例数据
  var _storeMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getData(self) {
    if (!_storeMap) {
      // WeakMap 不可用时降级到实例属性（罕见）
      if (!self.__leapStorageData) {
        Object.defineProperty(self, '__leapStorageData', {
          value: Object.create(null),
          writable: true,
          enumerable: false,
          configurable: true
        });
      }
      return self.__leapStorageData;
    }
    if (!_storeMap.has(self)) {
      _storeMap.set(self, Object.create(null));
    }
    return _storeMap.get(self);
  }

  function getDispatchCacheRoot() {
    if (typeof leapenv.isPerfDispatchCacheEnabled !== 'function' ||
        !leapenv.isPerfDispatchCacheEnabled() ||
        typeof leapenv.getDispatchExperimentCache !== 'function') {
      return null;
    }
    try {
      var root = leapenv.getDispatchExperimentCache();
      if (!root || typeof root !== 'object') {
        return null;
      }
      if (!root.storage || typeof root.storage !== 'object') {
        root.storage = {};
      }
      return root.storage;
    } catch (_) {
      return null;
    }
  }

  function getStorageCacheEntry(self, createIfMissing) {
    var root = getDispatchCacheRoot();
    if (!root) {
      return null;
    }

    if (typeof WeakMap === 'function') {
      if (!(root.byInstance instanceof WeakMap)) {
        root.byInstance = new WeakMap();
      }
      var weakEntry = root.byInstance.get(self);
      if (!weakEntry && createIfMissing) {
        weakEntry = { getItem: Object.create(null) };
        root.byInstance.set(self, weakEntry);
      }
      return weakEntry || null;
    }

    if (!Array.isArray(root.entries)) {
      root.entries = [];
    }
    for (var i = 0; i < root.entries.length; i++) {
      if (root.entries[i].self === self) {
        return root.entries[i].entry;
      }
    }
    if (!createIfMissing) {
      return null;
    }
    var entry = { getItem: Object.create(null) };
    root.entries.push({ self: self, entry: entry });
    return entry;
  }

  class StorageImpl {
    get length() {
      return Object.keys(getData(this)).length;
    }

    key(index) {
      var keys = Object.keys(getData(this));
      return index >= 0 && index < keys.length ? keys[index] : null;
    }

    getItem(key) {
      var k = String(key);
      var cacheEntry = getStorageCacheEntry(this, true);
      if (cacheEntry && Object.prototype.hasOwnProperty.call(cacheEntry.getItem, k)) {
        return cacheEntry.getItem[k];
      }
      var data = getData(this);
      var value = Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
      if (cacheEntry) {
        cacheEntry.getItem[k] = value;
      }
      return value;
    }

    setItem(key, value) {
      var k = String(key);
      getData(this)[k] = String(value == null ? '' : value);
      var cacheEntry = getStorageCacheEntry(this, false);
      if (cacheEntry) {
        delete cacheEntry.getItem[k];
      }
    }

    removeItem(key) {
      var k = String(key);
      delete getData(this)[k];
      var cacheEntry = getStorageCacheEntry(this, false);
      if (cacheEntry) {
        delete cacheEntry.getItem[k];
      }
    }

    clear() {
      var data = getData(this);
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        delete data[keys[i]];
      }
      var cacheEntry = getStorageCacheEntry(this, false);
      if (cacheEntry) {
        cacheEntry.getItem = Object.create(null);
      }
    }
  }

  leapenv.registerImpl('Storage', StorageImpl);
})(globalThis);
