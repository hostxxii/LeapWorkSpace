// Navigator 实现类 (新架构)
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const DEFAULT_NAVIGATOR_STATE = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    platform: 'Win32',
    language: 'zh-CN',
    languages: ['zh-CN', 'zh', 'en'],
    vendor: 'Google Inc.',
    webdriver: false,
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
    pdfViewerEnabled: true,
    plugins: [
      {
        name: 'Chrome PDF Viewer',
        filename: 'internal-pdf-viewer',
        description: 'Portable Document Format',
        mimeTypes: [
          {
            type: 'application/pdf',
            suffixes: 'pdf',
            description: 'Portable Document Format'
          }
        ]
      }
    ],
    mimeTypes: [
      {
        type: 'application/pdf',
        suffixes: 'pdf',
        description: 'Portable Document Format'
      }
    ],
    permissions: {
      geolocation: 'prompt',
      notifications: 'default'
    }
  };

  function cloneArray(arr) {
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function cloneRecord(input) {
    if (!input || typeof input !== 'object') return {};
    var out = {};
    var keys = Object.keys(input);
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = input[keys[i]];
    }
    return out;
  }

  function buildArrayLike(items, keyField) {
    var list = [];
    for (var i = 0; i < items.length; i++) {
      list.push(items[i]);
    }
    list.item = function item(index) {
      var n = Number(index);
      if (!(Number.isFinite ? Number.isFinite(n) : isFinite(n))) return null;
      n = Math.trunc ? Math.trunc(n) : (n < 0 ? Math.ceil(n) : Math.floor(n));
      return (n >= 0 && n < list.length) ? list[n] : null;
    };
    list.namedItem = function namedItem(name) {
      var needle = String(name == null ? '' : name);
      if (!needle) return null;
      for (var j = 0; j < list.length; j++) {
        var entry = list[j];
        if (entry && String(entry[keyField] || '') === needle) {
          return entry;
        }
      }
      return null;
    };
    return list;
  }

  function normalizeMimeTypeEntry(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    return {
      type: src.type == null ? '' : String(src.type),
      suffixes: src.suffixes == null ? '' : String(src.suffixes),
      description: src.description == null ? '' : String(src.description),
      enabledPlugin: null
    };
  }

  function normalizePluginEntry(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    var mimeInputs = Array.isArray(src.mimeTypes) ? src.mimeTypes : [];
    var mimeItems = [];
    for (var i = 0; i < mimeInputs.length; i++) {
      mimeItems.push(normalizeMimeTypeEntry(mimeInputs[i]));
    }
    var plugin = buildArrayLike(mimeItems, 'type');
    plugin.name = src.name == null ? '' : String(src.name);
    plugin.filename = src.filename == null ? '' : String(src.filename);
    plugin.description = src.description == null ? '' : String(src.description);
    for (var j = 0; j < mimeItems.length; j++) {
      try { mimeItems[j].enabledPlugin = plugin; } catch (_) {}
    }
    return plugin;
  }

  function normalizePluginsValue(value) {
    var inputs = Array.isArray(value) ? value : [];
    var plugins = [];
    for (var i = 0; i < inputs.length; i++) {
      plugins.push(normalizePluginEntry(inputs[i]));
    }
    return buildArrayLike(plugins, 'name');
  }

  function normalizeMimeTypesValue(value, pluginsList) {
    var out = [];
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        out.push(normalizeMimeTypeEntry(value[i]));
      }
      return buildArrayLike(out, 'type');
    }
    var plugins = Array.isArray(pluginsList) ? pluginsList : [];
    for (var p = 0; p < plugins.length; p++) {
      var plugin = plugins[p];
      for (var m = 0; plugin && m < plugin.length; m++) {
        if (plugin[m]) out.push(plugin[m]);
      }
    }
    return buildArrayLike(out, 'type');
  }

  function getPermissionsStates() {
    var value = getNavigatorValue('permissions');
    if (!value || typeof value !== 'object') {
      return cloneRecord(DEFAULT_NAVIGATOR_STATE.permissions);
    }
    if (value.states && typeof value.states === 'object') {
      return cloneRecord(value.states);
    }
    return cloneRecord(value);
  }

  function createPermissionsPlaceholder() {
    return {
      query: function query(desc) {
        var states = getPermissionsStates();
        var name = desc && typeof desc === 'object' && desc.name != null ? String(desc.name) : '';
        var resolved = Object.prototype.hasOwnProperty.call(states, name)
          ? String(states[name])
          : 'prompt';
        var status = null;
        if (leapenv.navigatorBrandObjects && typeof leapenv.navigatorBrandObjects.createPermissionStatusObject === 'function') {
          try {
            status = leapenv.navigatorBrandObjects.createPermissionStatusObject(resolved, name);
          } catch (_) {
            status = null;
          }
        }
        if (!status) {
          status = { name: name, state: resolved, onchange: null };
        }
        return Promise.resolve(status);
      }
    };
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

  function getTaskNavigatorOverrides() {
    var state = getTaskState();
    return state && state.navigator ? state.navigator : null;
  }

  function getNavigatorValue(key) {
    var overrides = getTaskNavigatorOverrides();
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
      return overrides[key];
    }
    return DEFAULT_NAVIGATOR_STATE[key];
  }

  class NavigatorImpl {
    get userAgent() {
      return String(getNavigatorValue('userAgent'));
    }

    get platform() {
      return String(getNavigatorValue('platform'));
    }

    get language() {
      return String(getNavigatorValue('language'));
    }

    get languages() {
      var value = getNavigatorValue('languages');
      return Array.isArray(value) ? value.slice() : [String(this.language)];
    }

    get cookieEnabled() {
      return true;
    }

    get onLine() {
      return true;
    }

    get vendor() {
      return String(getNavigatorValue('vendor'));
    }

    get appName() {
      return 'Netscape';
    }

    get appVersion() {
      var ua = this.userAgent;
      return ua.indexOf('Mozilla/') === 0 ? ua.slice('Mozilla/'.length) : ua;
    }

    get appCodeName() {
      return 'Mozilla';
    }

    get product() {
      return 'Gecko';
    }

    get productSub() {
      return '20030107';
    }

    get hardwareConcurrency() {
      var value = Number(getNavigatorValue('hardwareConcurrency'));
      return value > 0 ? Math.floor(value) : 8;
    }

    get maxTouchPoints() {
      var value = Number(getNavigatorValue('maxTouchPoints'));
      return value >= 0 ? Math.floor(value) : 0;
    }

    get plugins() {
      if (leapenv.navigatorBrandObjects && typeof leapenv.navigatorBrandObjects.createPluginArrayObject === 'function') {
        try {
          return leapenv.navigatorBrandObjects.createPluginArrayObject(getNavigatorValue('plugins'));
        } catch (_) {}
      }
      return normalizePluginsValue(getNavigatorValue('plugins'));
    }

    get mimeTypes() {
      if (leapenv.navigatorBrandObjects && typeof leapenv.navigatorBrandObjects.createMimeTypeArrayObject === 'function') {
        try {
          return leapenv.navigatorBrandObjects.createMimeTypeArrayObject(getNavigatorValue('mimeTypes'), this.plugins);
        } catch (_) {}
      }
      var plugins = this.plugins;
      return normalizeMimeTypesValue(getNavigatorValue('mimeTypes'), plugins);
    }

    get pdfViewerEnabled() {
      return !!getNavigatorValue('pdfViewerEnabled');
    }

    get permissions() {
      return createPermissionsPlaceholder();
    }

    get webdriver() {
      return !!getNavigatorValue('webdriver');
    }

    get doNotTrack() {
      return null;
    }

    get connection() {
      return null;
    }

    sendBeacon(url, _data) {
      void url;
      return true;
    }

    javaEnabled() {
      return false;
    }
  }

  // 注册到 implRegistry
  leapenv.registerImpl('Navigator', NavigatorImpl);

  leapenv.navigatorImplDefaults = leapenv.navigatorImplDefaults || {
    getDefaults: function () {
      return {
        userAgent: DEFAULT_NAVIGATOR_STATE.userAgent,
        platform: DEFAULT_NAVIGATOR_STATE.platform,
        language: DEFAULT_NAVIGATOR_STATE.language,
        languages: DEFAULT_NAVIGATOR_STATE.languages.slice(),
        vendor: DEFAULT_NAVIGATOR_STATE.vendor,
        webdriver: DEFAULT_NAVIGATOR_STATE.webdriver,
        hardwareConcurrency: DEFAULT_NAVIGATOR_STATE.hardwareConcurrency,
        maxTouchPoints: DEFAULT_NAVIGATOR_STATE.maxTouchPoints,
        pdfViewerEnabled: DEFAULT_NAVIGATOR_STATE.pdfViewerEnabled,
        plugins: DEFAULT_NAVIGATOR_STATE.plugins.map(function (plugin) {
          return {
            name: plugin.name,
            filename: plugin.filename,
            description: plugin.description,
            mimeTypes: (plugin.mimeTypes || []).map(function (mime) {
              return {
                type: mime.type,
                suffixes: mime.suffixes,
                description: mime.description
              };
            })
          };
        }),
        mimeTypes: DEFAULT_NAVIGATOR_STATE.mimeTypes.map(function (mime) {
          return {
            type: mime.type,
            suffixes: mime.suffixes,
            description: mime.description
          };
        }),
        permissions: cloneRecord(DEFAULT_NAVIGATOR_STATE.permissions)
      };
    }
  };

})(globalThis);
