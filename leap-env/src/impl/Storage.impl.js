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

  class StorageImpl {
    get length() {
      return Object.keys(getData(this)).length;
    }

    key(index) {
      var keys = Object.keys(getData(this));
      return index >= 0 && index < keys.length ? keys[index] : null;
    }

    getItem(key) {
      var data = getData(this);
      var k = String(key);
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
    }

    setItem(key, value) {
      getData(this)[String(key)] = String(value == null ? '' : value);
    }

    removeItem(key) {
      delete getData(this)[String(key)];
    }

    clear() {
      var data = getData(this);
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        delete data[keys[i]];
      }
    }
  }

  leapenv.registerImpl('Storage', StorageImpl);
})(globalThis);
