(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  const _pluginArrayState = (typeof WeakMap === 'function') ? new WeakMap() : null;
  const _pluginState = (typeof WeakMap === 'function') ? new WeakMap() : null;
  const _mimeTypeArrayState = (typeof WeakMap === 'function') ? new WeakMap() : null;
  const _mimeTypeState = (typeof WeakMap === 'function') ? new WeakMap() : null;
  const _permissionStatusState = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getState(map, self, key) {
    if (map) return map.get(self) || null;
    return self && self[key] ? self[key] : null;
  }

  function setState(map, self, key, state) {
    if (map) {
      map.set(self, state);
      return;
    }
    Object.defineProperty(self, key, {
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

  function createNativeObject(ctorName) {
    var bridge = getNativeBridge();
    var obj = null;
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

  function toFiniteIndex(value) {
    var n = Number(value);
    if (!(Number.isFinite ? Number.isFinite(n) : isFinite(n))) return -1;
    if (n < 0) return -1;
    return Math.trunc ? Math.trunc(n) : Math.floor(n);
  }

  function iteratorFromArray(items) {
    var copy = Array.isArray(items) ? items.slice() : [];
    var i = 0;
    return {
      next: function next() {
        if (i >= copy.length) return { done: true, value: undefined };
        return { done: false, value: copy[i++] };
      }
    };
  }

  function clearExposedProps(obj, state) {
    var keys = state && Array.isArray(state._exposedKeys) ? state._exposedKeys : [];
    for (var i = 0; i < keys.length; i++) {
      try { delete obj[keys[i]]; } catch (_) {}
    }
    state._exposedKeys = [];
  }

  function defineExposedProp(obj, state, key, value) {
    if (!key) return;
    try {
      Object.defineProperty(obj, key, {
        value: value,
        writable: false,
        enumerable: true,
        configurable: true
      });
    } catch (_) {
      try { obj[key] = value; } catch (_) {}
    }
    state._exposedKeys.push(key);
  }

  function syncCollectionExposedProps(obj, state, items, nameSelector) {
    clearExposedProps(obj, state);
    for (var i = 0; i < items.length; i++) {
      defineExposedProp(obj, state, String(i), items[i]);
    }
    if (typeof nameSelector === 'function') {
      for (var j = 0; j < items.length; j++) {
        var name = nameSelector(items[j]);
        if (!name) continue;
        if (state._exposedKeys.indexOf(name) !== -1) continue;
        defineExposedProp(obj, state, name, items[j]);
      }
    }
  }

  function normalizeMimeRecord(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    return {
      type: src.type == null ? '' : String(src.type),
      suffixes: src.suffixes == null ? '' : String(src.suffixes),
      description: src.description == null ? '' : String(src.description)
    };
  }

  function normalizePluginRecord(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    return {
      name: src.name == null ? '' : String(src.name),
      filename: src.filename == null ? '' : String(src.filename),
      description: src.description == null ? '' : String(src.description),
      mimeTypes: Array.isArray(src.mimeTypes) ? src.mimeTypes.slice() : []
    };
  }

  function getPluginArrayItems(self) {
    var s = getState(_pluginArrayState, self, '__leapPluginArrayState');
    return s && Array.isArray(s.items) ? s.items : [];
  }

  function getPluginItems(self) {
    var s = getState(_pluginState, self, '__leapPluginState');
    return s && Array.isArray(s.mimeTypes) ? s.mimeTypes : [];
  }

  function getMimeTypeArrayItems(self) {
    var s = getState(_mimeTypeArrayState, self, '__leapMimeTypeArrayState');
    return s && Array.isArray(s.items) ? s.items : [];
  }

  function createMimeTypeObject(raw, enabledPlugin) {
    var rec = normalizeMimeRecord(raw);
    var obj = createNativeObject('MimeType');
    setState(_mimeTypeState, obj, '__leapMimeTypeState', {
      type: rec.type,
      suffixes: rec.suffixes,
      description: rec.description,
      enabledPlugin: enabledPlugin || null
    });
    return obj;
  }

  function createPluginObject(raw) {
    var rec = normalizePluginRecord(raw);
    var obj = createNativeObject('Plugin');
    var state = {
      name: rec.name,
      filename: rec.filename,
      description: rec.description,
      mimeTypes: [],
      _exposedKeys: []
    };
    setState(_pluginState, obj, '__leapPluginState', state);
    for (var i = 0; i < rec.mimeTypes.length; i++) {
      state.mimeTypes.push(createMimeTypeObject(rec.mimeTypes[i], obj));
    }
    syncCollectionExposedProps(obj, state, state.mimeTypes, function (mime) {
      var s = getState(_mimeTypeState, mime, '__leapMimeTypeState');
      return s ? s.type : '';
    });
    return obj;
  }

  function createPluginArrayObject(rawList) {
    var inputs = Array.isArray(rawList) ? rawList : [];
    var obj = createNativeObject('PluginArray');
    var items = [];
    for (var i = 0; i < inputs.length; i++) {
      items.push(createPluginObject(inputs[i]));
    }
    var state = {
      items: items,
      _exposedKeys: []
    };
    setState(_pluginArrayState, obj, '__leapPluginArrayState', state);
    syncCollectionExposedProps(obj, state, items, function (plugin) {
      var s = getState(_pluginState, plugin, '__leapPluginState');
      return s ? s.name : '';
    });
    return obj;
  }

  function createMimeTypeArrayObject(rawList, pluginArrayObj) {
    var obj = createNativeObject('MimeTypeArray');
    var items = [];

    if (Array.isArray(rawList) && rawList.length) {
      for (var i = 0; i < rawList.length; i++) {
        items.push(createMimeTypeObject(rawList[i], null));
      }
    } else {
      var plugins = getPluginArrayItems(pluginArrayObj);
      for (var p = 0; p < plugins.length; p++) {
        var pluginMimes = getPluginItems(plugins[p]);
        for (var m = 0; m < pluginMimes.length; m++) {
          items.push(pluginMimes[m]);
        }
      }
    }

    var state = {
      items: items,
      _exposedKeys: []
    };
    setState(_mimeTypeArrayState, obj, '__leapMimeTypeArrayState', state);
    syncCollectionExposedProps(obj, state, items, function (mime) {
      var s = getState(_mimeTypeState, mime, '__leapMimeTypeState');
      return s ? s.type : '';
    });
    return obj;
  }

  function createPermissionStatusObject(stateValue, nameValue) {
    var obj = createNativeObject('PermissionStatus');
    setState(_permissionStatusState, obj, '__leapPermissionStatusState', {
      name: nameValue == null ? '' : String(nameValue),
      state: stateValue == null ? 'prompt' : String(stateValue),
      onchange: null
    });
    return obj;
  }

  class PluginArrayImpl {
    get length() { return getPluginArrayItems(this).length; }
    item(index) {
      var list = getPluginArrayItems(this);
      var i = toFiniteIndex(index);
      return (i >= 0 && i < list.length) ? list[i] : null;
    }
    namedItem(name) {
      var needle = String(name == null ? '' : name);
      if (!needle) return null;
      var list = getPluginArrayItems(this);
      for (var i = 0; i < list.length; i++) {
        var s = getState(_pluginState, list[i], '__leapPluginState');
        if (s && s.name === needle) return list[i];
      }
      return null;
    }
    refresh() { return undefined; }
    ['@@iterator']() { return iteratorFromArray(getPluginArrayItems(this)); }
  }

  class PluginImpl {
    get name() { var s = getState(_pluginState, this, '__leapPluginState'); return s ? s.name : ''; }
    get filename() { var s = getState(_pluginState, this, '__leapPluginState'); return s ? s.filename : ''; }
    get description() { var s = getState(_pluginState, this, '__leapPluginState'); return s ? s.description : ''; }
    get length() { return getPluginItems(this).length; }
    item(index) {
      var list = getPluginItems(this);
      var i = toFiniteIndex(index);
      return (i >= 0 && i < list.length) ? list[i] : null;
    }
    namedItem(name) {
      var needle = String(name == null ? '' : name);
      if (!needle) return null;
      var list = getPluginItems(this);
      for (var i = 0; i < list.length; i++) {
        var s = getState(_mimeTypeState, list[i], '__leapMimeTypeState');
        if (s && s.type === needle) return list[i];
      }
      return null;
    }
    ['@@iterator']() { return iteratorFromArray(getPluginItems(this)); }
  }

  class MimeTypeArrayImpl {
    get length() { return getMimeTypeArrayItems(this).length; }
    item(index) {
      var list = getMimeTypeArrayItems(this);
      var i = toFiniteIndex(index);
      return (i >= 0 && i < list.length) ? list[i] : null;
    }
    namedItem(name) {
      var needle = String(name == null ? '' : name);
      if (!needle) return null;
      var list = getMimeTypeArrayItems(this);
      for (var i = 0; i < list.length; i++) {
        var s = getState(_mimeTypeState, list[i], '__leapMimeTypeState');
        if (s && s.type === needle) return list[i];
      }
      return null;
    }
    ['@@iterator']() { return iteratorFromArray(getMimeTypeArrayItems(this)); }
  }

  class MimeTypeImpl {
    get type() { var s = getState(_mimeTypeState, this, '__leapMimeTypeState'); return s ? s.type : ''; }
    get suffixes() { var s = getState(_mimeTypeState, this, '__leapMimeTypeState'); return s ? s.suffixes : ''; }
    get description() { var s = getState(_mimeTypeState, this, '__leapMimeTypeState'); return s ? s.description : ''; }
    get enabledPlugin() { var s = getState(_mimeTypeState, this, '__leapMimeTypeState'); return s ? (s.enabledPlugin || null) : null; }
  }

  class PermissionStatusImpl {
    get name() {
      var s = getState(_permissionStatusState, this, '__leapPermissionStatusState');
      return s ? s.name : '';
    }
    get state() {
      var s = getState(_permissionStatusState, this, '__leapPermissionStatusState');
      return s ? s.state : 'prompt';
    }
    get onchange() {
      var s = getState(_permissionStatusState, this, '__leapPermissionStatusState');
      return s ? s.onchange : null;
    }
    set onchange(v) {
      var s = getState(_permissionStatusState, this, '__leapPermissionStatusState');
      if (!s) return;
      s.onchange = (typeof v === 'function' || v == null) ? v : null;
    }
  }

  leapenv.navigatorBrandObjects = leapenv.navigatorBrandObjects || {
    createPluginArrayObject: createPluginArrayObject,
    createMimeTypeArrayObject: createMimeTypeArrayObject,
    createPermissionStatusObject: createPermissionStatusObject
  };

  leapenv.registerImpl('PluginArray', PluginArrayImpl);
  leapenv.registerImpl('Plugin', PluginImpl);
  leapenv.registerImpl('MimeTypeArray', MimeTypeArrayImpl);
  leapenv.registerImpl('MimeType', MimeTypeImpl);
  leapenv.registerImpl('PermissionStatus', PermissionStatusImpl);
})(globalThis);
