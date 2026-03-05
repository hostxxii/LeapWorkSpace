// src/core/10-runtime.js (10_runtime)
// 建立全局的 leapenv 命名空间及基础存储结构

(function (global) {
  if (global.leapenv && global.leapenv._runtimeInitialized) {
    return;
  }

  const leapenv = global.leapenv || (global.leapenv = {});
  const hasOwn = Object.prototype.hasOwnProperty;

  try {
    if (hasOwn.call(global, 'leapenv')) {
      Object.defineProperty(global, 'leapenv', {
        value: leapenv,
        writable: true,
        enumerable: false,
        configurable: true
      });
    }
  } catch (_) {}

  function defineNonEnumerableValue(target, key, value) {
    try {
      Object.defineProperty(target, key, {
        value: value,
        writable: true,
        enumerable: false,
        configurable: true
      });
      return value;
    } catch (_) {
      target[key] = value;
      return target[key];
    }
  }

  function hideLeapenvKeys(keys) {
    if (!Array.isArray(keys)) return;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!hasOwn.call(leapenv, key)) continue;
      defineNonEnumerableValue(leapenv, key, leapenv[key]);
    }
  }

  function setPropertyEnumerable(target, key, enumerable) {
    const desc = Object.getOwnPropertyDescriptor(target, key);
    if (!desc) return false;
    if (!desc.configurable && desc.enumerable !== enumerable) return false;
    const nextDesc = {
      configurable: desc.configurable,
      enumerable: enumerable
    };
    if (Object.prototype.hasOwnProperty.call(desc, 'get') || Object.prototype.hasOwnProperty.call(desc, 'set')) {
      nextDesc.get = desc.get;
      nextDesc.set = desc.set;
    } else {
      nextDesc.value = desc.value;
      nextDesc.writable = desc.writable;
    }
    try {
      Object.defineProperty(target, key, nextDesc);
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeDomBackend(raw) {
    const normalized = String(raw == null ? '' : raw).trim().toLowerCase();
    return normalized === 'dod' || normalized === 'spec' ? 'dod' : 'dod';
  }

  function normalizeSignatureProfile(raw) {
    const normalized = String(raw == null ? '' : raw).trim().toLowerCase();
    return normalized === 'fp-occupy' ? 'fp-occupy' : 'fp-lean';
  }

  function normalizeBridgeExposureMode(raw) {
    const normalized = String(raw == null ? '' : raw).trim().toLowerCase();
    return normalized === 'strict' ? 'strict' : 'compat';
  }

  function normalizeGlobalFacadeMode(raw) {
    const normalized = String(raw == null ? '' : raw).trim().toLowerCase();
    return normalized === 'strict' ? 'strict' : 'compat';
  }

  function bindGlobalTimer(name) {
    if (typeof global[name] !== 'function') {
      return null;
    }
    try {
      return global[name].bind(global);
    } catch (_) {
      return global[name];
    }
  }

  function createDefaultHostTimers() {
    return {
      setTimeout: bindGlobalTimer('setTimeout'),
      clearTimeout: bindGlobalTimer('clearTimeout'),
      setInterval: bindGlobalTimer('setInterval'),
      clearInterval: bindGlobalTimer('clearInterval')
    };
  }

  function normalizeHostTimers(input, fallback) {
    const base = (fallback && typeof fallback === 'object') ? fallback : createDefaultHostTimers();
    const out = {
      setTimeout: base.setTimeout || null,
      clearTimeout: base.clearTimeout || null,
      setInterval: base.setInterval || null,
      clearInterval: base.clearInterval || null
    };
    if (!input || typeof input !== 'object') {
      return out;
    }
    const names = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      if (typeof input[name] === 'function') {
        out[name] = input[name];
      }
    }
    return out;
  }

  function ensureRuntimeStore() {
    const runtimeCandidate = leapenv.__runtime && typeof leapenv.__runtime === 'object'
      ? leapenv.__runtime
      : {};
    const runtime = defineNonEnumerableValue(leapenv, '__runtime', runtimeCandidate);

    runtime.config = runtime.config && typeof runtime.config === 'object'
      ? runtime.config
      : (leapenv.config && typeof leapenv.config === 'object' ? leapenv.config : {});
    leapenv.config = runtime.config;

    runtime.host = runtime.host && typeof runtime.host === 'object'
      ? runtime.host
      : {};
    runtime.host.timers = normalizeHostTimers(runtime.host.timers, createDefaultHostTimers());

    runtime.debug = runtime.debug && typeof runtime.debug === 'object'
      ? runtime.debug
      : {};
    if (!runtime.debug.hookRuntime || typeof runtime.debug.hookRuntime !== 'object') {
      runtime.debug.hookRuntime = { active: false, phase: 'idle' };
    } else {
      runtime.debug.hookRuntime.active = !!runtime.debug.hookRuntime.active;
      runtime.debug.hookRuntime.phase = String(runtime.debug.hookRuntime.phase || 'idle');
    }
    runtime.debug.enabled = !!runtime.debug.enabled;

    runtime.task = runtime.task && typeof runtime.task === 'object'
      ? runtime.task
      : {};
    runtime.task.currentTaskId = typeof runtime.task.currentTaskId === 'string'
      ? runtime.task.currentTaskId
      : '';
    runtime.task.signatureState = runtime.task.signatureState && typeof runtime.task.signatureState === 'object'
      ? runtime.task.signatureState
      : {};

    runtime.bridge = runtime.bridge && typeof runtime.bridge === 'object'
      ? runtime.bridge
      : {};
    runtime.bridge.dispatch = typeof runtime.bridge.dispatch === 'function'
      ? runtime.bridge.dispatch
      : null;
    runtime.bridge.native = runtime.bridge.native && typeof runtime.bridge.native === 'object'
      ? runtime.bridge.native
      : {};

    return runtime;
  }

  function readBootstrapCandidate(primary, fallbackLegacy) {
    if (primary && typeof primary === 'object') {
      return primary;
    }
    if (fallbackLegacy && typeof fallbackLegacy === 'object') {
      return fallbackLegacy;
    }
    return null;
  }

  const LEGACY_BRIDGE_METHODS = [
    ['defineEnvironmentSkeleton', 'defineEnvironmentSkeleton'],
    ['createSkeletonInstance', 'createSkeletonInstance'],
    ['createTrustedEvent', 'createTrustedEvent'],
    ['createNative', '__createNative__'],
    ['applyInstanceSkeleton', '__applyInstanceSkeleton__'],
    ['createChildFrame', '__createChildFrame__'],
    ['destroyChildFrame', '__destroyChildFrame__'],
    ['navigateChildFrame', '__navigateChildFrame__'],
    ['getChildFrameCount', '__getChildFrameCount__'],
    ['getChildFrameProxy', '__getChildFrameProxy__']
  ];

  function defineHiddenGlobalValue(key, value) {
    try {
      Object.defineProperty(global, key, {
        value: value,
        writable: true,
        enumerable: false,
        configurable: true
      });
      return true;
    } catch (_) {
      try {
        global[key] = value;
        return true;
      } catch (__){
        return false;
      }
    }
  }

  function removeGlobalKey(key) {
    if (!hasOwn.call(global, key)) return true;
    try {
      return delete global[key];
    } catch (_) {}
    try {
      Object.defineProperty(global, key, {
        value: undefined,
        writable: false,
        enumerable: false,
        configurable: false
      });
      return true;
    } catch (__){
      return false;
    }
  }

  function getNativeBridge(runtime) {
    if (!runtime || typeof runtime !== 'object') return {};
    const bridge = runtime.bridge && typeof runtime.bridge === 'object'
      ? runtime.bridge
      : null;
    const nativeBridge = bridge && bridge.native && typeof bridge.native === 'object'
      ? bridge.native
      : null;
    return nativeBridge || {};
  }

  function ensureLegacyNativeNamespace(runtime) {
    const nativeBridge = getNativeBridge(runtime);
    const bridge = runtime.bridge && typeof runtime.bridge === 'object'
      ? runtime.bridge
      : (runtime.bridge = {});
    const legacy = bridge.legacyNativeNamespace && typeof bridge.legacyNativeNamespace === 'object'
      ? bridge.legacyNativeNamespace
      : {};

    for (let i = 0; i < LEGACY_BRIDGE_METHODS.length; i++) {
      const pair = LEGACY_BRIDGE_METHODS[i];
      const targetKey = pair[0];
      if (typeof nativeBridge[targetKey] !== 'function') continue;
      defineNonEnumerableValue(legacy, targetKey, nativeBridge[targetKey]);
    }
    if (nativeBridge.dom && typeof nativeBridge.dom === 'object') {
      defineNonEnumerableValue(legacy, 'dom', nativeBridge.dom);
    }

    bridge.legacyNativeNamespace = legacy;
    return legacy;
  }

  function syncLegacyBridgeGlobals(runtime, mode) {
    const normalizedMode = normalizeBridgeExposureMode(mode);
    const nativeBridge = getNativeBridge(runtime);
    if (normalizedMode === 'strict') {
      for (let i = 0; i < LEGACY_BRIDGE_METHODS.length; i++) {
        removeGlobalKey(LEGACY_BRIDGE_METHODS[i][1]);
      }
      removeGlobalKey('$native');
      return {
        mode: 'strict',
        exposedKeys: [],
        removed: true
      };
    }

    const nativeNamespace = ensureLegacyNativeNamespace(runtime);
    const exposedKeys = [];
    for (let i = 0; i < LEGACY_BRIDGE_METHODS.length; i++) {
      const pair = LEGACY_BRIDGE_METHODS[i];
      const targetKey = pair[0];
      const globalKey = pair[1];
      if (typeof nativeBridge[targetKey] !== 'function') continue;
      if (defineHiddenGlobalValue(globalKey, nativeBridge[targetKey])) {
        exposedKeys.push(globalKey);
      }
    }
    if (defineHiddenGlobalValue('$native', nativeNamespace)) {
      exposedKeys.push('$native');
    }
    return {
      mode: 'compat',
      exposedKeys: exposedKeys.sort(),
      removed: false
    };
  }

  function consumeBootstrap(runtime) {
    const leapenvBootstrap = readBootstrapCandidate(
      leapenv && leapenv.__runtimeBootstrap,
      null
    );
    const bootstrap = readBootstrapCandidate(leapenvBootstrap, global.__LEAP_BOOTSTRAP__);
    const legacyDomBackend = typeof global.__LEAP_DOM_BACKEND__ === 'string'
      ? global.__LEAP_DOM_BACKEND__
      : '';
    const legacySignatureProfile = typeof global.__LEAP_SIGNATURE_PROFILE__ === 'string'
      ? global.__LEAP_SIGNATURE_PROFILE__
      : '';
    const legacyHostTimers = readBootstrapCandidate(global.__LEAP_HOST_TIMERS__, null);
    const legacyHookRuntime = readBootstrapCandidate(
      global.__LEAP_HOOK_RUNTIME__,
      global.__LEAP_DEBUG_JS_HOOKS_RUNTIME__
    );

    const bootstrapDomBackend = bootstrap && typeof bootstrap.domBackend === 'string'
      ? bootstrap.domBackend
      : '';
    const bootstrapSignatureProfile = bootstrap && typeof bootstrap.signatureProfile === 'string'
      ? bootstrap.signatureProfile
      : '';
    const bootstrapBridgeExposureMode = bootstrap && typeof bootstrap.bridgeExposureMode === 'string'
      ? bootstrap.bridgeExposureMode
      : '';
    const bootstrapGlobalFacadeMode = bootstrap && typeof bootstrap.globalFacadeMode === 'string'
      ? bootstrap.globalFacadeMode
      : '';
    const bootstrapHostTimers = readBootstrapCandidate(bootstrap && bootstrap.hostTimers, legacyHostTimers);
    const bootstrapHookRuntime = readBootstrapCandidate(bootstrap && bootstrap.hookRuntimeSeed, legacyHookRuntime);

    runtime.config.domBackend = normalizeDomBackend(
      bootstrapDomBackend || runtime.config.domBackend || legacyDomBackend || 'dod'
    );
    runtime.config.signatureProfile = normalizeSignatureProfile(
      bootstrapSignatureProfile || runtime.config.signatureProfile || legacySignatureProfile || 'fp-lean'
    );
    runtime.config.bridgeExposureMode = normalizeBridgeExposureMode(
      bootstrapBridgeExposureMode || runtime.config.bridgeExposureMode || 'strict'
    );
    runtime.config.globalFacadeMode = normalizeGlobalFacadeMode(
      bootstrapGlobalFacadeMode || runtime.config.globalFacadeMode || 'strict'
    );
    runtime.host.timers = normalizeHostTimers(bootstrapHostTimers, runtime.host.timers);
    runtime.debug.enabled = !!(bootstrap && bootstrap.debugEnabled);

    if (bootstrapHookRuntime) {
      runtime.debug.hookRuntime.active = !!bootstrapHookRuntime.active;
      runtime.debug.hookRuntime.phase = String(bootstrapHookRuntime.phase || 'bundle');
    }

    // Capture LeapVM native bridge first, then scrub bridge symbols from global scope.
    (function captureNativeBridge() {
      const bridge = runtime.bridge && typeof runtime.bridge === 'object'
        ? runtime.bridge
        : (runtime.bridge = {});
      const nativeBridge = bridge.native && typeof bridge.native === 'object'
        ? bridge.native
        : (bridge.native = {});

      const nativeNs = (global.$native && typeof global.$native === 'object')
        ? global.$native
        : null;
      const nativeDom = nativeNs && nativeNs.dom && typeof nativeNs.dom === 'object'
        ? nativeNs.dom
        : null;

      function captureMethod(targetKey, holder, key) {
        if (typeof nativeBridge[targetKey] === 'function') return;
        if (!holder || typeof holder[key] !== 'function') return;
        try {
          nativeBridge[targetKey] = holder[key].bind(holder);
        } catch (_) {
          nativeBridge[targetKey] = holder[key];
        }
      }

      captureMethod('defineEnvironmentSkeleton', nativeNs, 'defineEnvironmentSkeleton');
      captureMethod('createSkeletonInstance', nativeNs, 'createSkeletonInstance');
      captureMethod('createTrustedEvent', nativeNs, 'createTrustedEvent');
      captureMethod('createNative', global, '__createNative__');
      captureMethod('applyInstanceSkeleton', global, '__applyInstanceSkeleton__');
      captureMethod('createChildFrame', global, '__createChildFrame__');
      captureMethod('destroyChildFrame', global, '__destroyChildFrame__');
      captureMethod('navigateChildFrame', global, '__navigateChildFrame__');
      captureMethod('getChildFrameCount', global, '__getChildFrameCount__');
      captureMethod('getChildFrameProxy', global, '__getChildFrameProxy__');

      if (!nativeBridge.dom) {
        nativeBridge.dom = nativeDom || null;
      }
    })();

    runtime.config.bridgeExposureMode = normalizeBridgeExposureMode(
      runtime.config.bridgeExposureMode || 'strict'
    );
    syncLegacyBridgeGlobals(runtime, runtime.config.bridgeExposureMode);

    const cleanupKeys = [
      '__LEAP_BOOTSTRAP__',
      '__LEAP_DOM_BACKEND__',
      '__LEAP_SIGNATURE_PROFILE__',
      '__LEAP_HOST_TIMERS__',
      '__LEAP_HOOK_RUNTIME__',
      '__LEAP_DEBUG_JS_HOOKS_RUNTIME__',
      '__LEAP_TASK_ID__'
    ];
    for (let i = 0; i < cleanupKeys.length; i++) {
      removeGlobalKey(cleanupKeys[i]);
    }

    if (hasOwn.call(leapenv, '__runtimeBootstrap')) {
      try {
        delete leapenv.__runtimeBootstrap;
      } catch (_) {
        try {
          leapenv.__runtimeBootstrap = null;
        } catch (__){}
      }
    }
  }

  // 标记已初始化，避免重复执行
  defineNonEnumerableValue(leapenv, '_runtimeInitialized', true);

  // 核心命名空间与存储
  const runtimeStore = ensureRuntimeStore();
  consumeBootstrap(runtimeStore);
  leapenv.config = runtimeStore.config;               // 配置选项
  leapenv.toolsFunc = leapenv.toolsFunc || {};        // 工具函数
  leapenv.impl = leapenv.impl || {};                  // 各接口实现库

  // Impl 类注册表 (新架构)
  leapenv.implRegistry = leapenv.implRegistry || {};

  // 运行时内存与宿主能力
  leapenv.memory = leapenv.memory || {};

  // 私有数据存储（事件监听等）
  if (!leapenv.memory.privateData) {
    leapenv.memory.privateData = (typeof WeakMap === 'function')
      ? new WeakMap()
      : {
          _counter: 0,
          _store: {},
          has: function(key) {
            if (!key.__leapenv_id) return false;
            return key.__leapenv_id in this._store;
          },
          get: function(key) {
            if (!key.__leapenv_id) return undefined;
            return this._store[key.__leapenv_id];
          },
          set: function(key, value) {
            if (!key.__leapenv_id) {
              key.__leapenv_id = '_lpid_' + (this._counter++);
            }
            this._store[key.__leapenv_id] = value;
          }
        };
  }

  leapenv.getRuntimeStore = function getRuntimeStore() {
    return ensureRuntimeStore();
  };

  leapenv.getRuntimeConfig = function getRuntimeConfig() {
    return ensureRuntimeStore().config;
  };

  leapenv.getHostTimers = function getHostTimers() {
    return ensureRuntimeStore().host.timers;
  };

  leapenv.getNativeBridge = function getNativeBridge() {
    const runtime = ensureRuntimeStore();
    const bridge = runtime.bridge && typeof runtime.bridge === 'object'
      ? runtime.bridge
      : null;
    const nativeBridge = bridge && bridge.native && typeof bridge.native === 'object'
      ? bridge.native
      : null;
    return nativeBridge || {};
  };

  leapenv.getHookRuntime = function getHookRuntime() {
    return ensureRuntimeStore().debug.hookRuntime;
  };

  leapenv.beginTask = function beginTask(taskId) {
    const runtime = ensureRuntimeStore();
    const normalizedTaskId = String(taskId == null ? '' : taskId);
    runtime.task.currentTaskId = normalizedTaskId;
    return normalizedTaskId;
  };

  leapenv.endTask = function endTask(taskId) {
    const runtime = ensureRuntimeStore();
    const normalizedTaskId = String(taskId == null ? '' : taskId);
    if (!normalizedTaskId || runtime.task.currentTaskId === normalizedTaskId) {
      runtime.task.currentTaskId = '';
    }
    return runtime.task.currentTaskId;
  };

  leapenv.getCurrentTaskId = function getCurrentTaskId() {
    return ensureRuntimeStore().task.currentTaskId || '';
  };

  leapenv.getTaskState = function getTaskState() {
    const runtime = ensureRuntimeStore();
    runtime.task.signatureState = runtime.task.signatureState && typeof runtime.task.signatureState === 'object'
      ? runtime.task.signatureState
      : {};
    return runtime.task.signatureState;
  };

  try {
    Object.defineProperty(leapenv, 'signatureTaskState', {
      configurable: true,
      enumerable: false,
      get: function () {
        return leapenv.getTaskState();
      },
      set: function (value) {
        const runtime = ensureRuntimeStore();
        runtime.task.signatureState = (value && typeof value === 'object') ? value : {};
      }
    });
  } catch (_) {}

  // O1: 预建 descriptor 缓存，避免每次 dispatch 都调用 getOwnPropertyDescriptor
  var _implDescCache = {};

  // 注册 Impl 类（含 O1 descriptor 预缓存）
  leapenv.registerImpl = function(typeName, implClass) {
    leapenv.implRegistry[typeName] = implClass;
    // 遍历整个原型链，收集各层的 own property descriptor
    var cache = {};
    var proto = implClass.prototype;
    while (proto && proto !== Object.prototype) {
      var names = Object.getOwnPropertyNames(proto);
      for (var i = 0; i < names.length; i++) {
        if (!(names[i] in cache)) {
          cache[names[i]] = Object.getOwnPropertyDescriptor(proto, names[i]);
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
    _implDescCache[typeName] = cache;
  };

  // I-8: 追踪日志（通过 LEAP_TRACE=1 环境变量开启）
  var TRACE = typeof process !== 'undefined' && process.env && process.env.LEAP_TRACE === '1';

  // 统一分发函数 - 由 C++ 侧调用
  function dispatch(typeName, propName, actionType) {
    if (TRACE) {
      console.log(JSON.stringify({
        t: Date.now(),
        type: typeName,
        prop: propName,
        action: actionType
      }));
    }

    var ImplClass = leapenv.implRegistry[typeName];
    if (!ImplClass) {
      var mode = leapenv.config && leapenv.config.dispatchMissingMode;
      if (mode === 'throw') {
        throw new TypeError('[Leap] No implementation found for type: ' + typeName);
      } else if (mode !== 'silent') {
        console.warn('[Leap] No implementation found for type: ' + typeName);
      }
      return undefined;
    }

    var self = this;
    // O1: 使用预缓存的描述符，fallback 到 getOwnPropertyDescriptor
    var cache = _implDescCache[typeName];

    if (actionType === 'GET') {
      var descriptor = cache ? cache[propName] : Object.getOwnPropertyDescriptor(ImplClass.prototype, propName);
      if (descriptor && descriptor.get) {
        return descriptor.get.call(self);
      }
      // 如果没有 getter，尝试直接获取值
      return ImplClass.prototype[propName];
    } else if (actionType === 'SET') {
      // 属性 Setter
      var value = arguments[3];
      var descriptor = cache ? cache[propName] : Object.getOwnPropertyDescriptor(ImplClass.prototype, propName);
      if (descriptor && descriptor.set) {
        descriptor.set.call(self, value);
        return;
      }
    } else if (actionType === 'CALL') {
      // 方法调用
      var descriptor = cache ? cache[propName] : null;
      var method = (descriptor && descriptor.value) ? descriptor.value : ImplClass.prototype[propName];
      if (typeof method === 'function') {
        var args = Array.prototype.slice.call(arguments, 3);
        return method.apply(self, args);
      }
    }

    return undefined;
  }

  runtimeStore.bridge.dispatch = dispatch;

  // I-1: dispatch 路由一致性校验（所有 impl 注册完成后调用一次）
  leapenv.validateDispatchRoutes = function() {
    var skeletonObjects = leapenv.skeletonObjects || [];
    var implRegistry = leapenv.implRegistry;
    var warnCount = 0;

    var verbose = leapenv.config && leapenv.config.validateWarn;

    function checkRoute(skeletonType, prop, objName, implPropName) {
      var impl = implRegistry[objName];
      if (!impl) {
        if (verbose) {
          console.warn('[LeapVM] dispatch route broken: ' + skeletonType + '.' + prop +
            ' → objName="' + objName + '" impl not registered');
        }
        warnCount++;
        return;
      }
      // 沿原型链查找该属性是否存在
      var proto = impl.prototype;
      var found = false;
      while (proto && proto !== Object.prototype) {
        if (Object.prototype.hasOwnProperty.call(proto, implPropName)) { found = true; break; }
        proto = Object.getPrototypeOf(proto);
      }
      if (!found) {
        if (verbose) {
          console.warn('[LeapVM] dispatch route missing: ' + objName + '.prototype.' + implPropName +
            ' (referenced by ' + skeletonType + '.' + prop + ')');
        }
        warnCount++;
      }
    }

    for (var i = 0; i < skeletonObjects.length; i++) {
      var skeleton = skeletonObjects[i];
      var typeName = skeleton.ctorName || skeleton.name;
      var props = skeleton.props || {};
      for (var propName in props) {
        var prop = props[propName];
        var d = prop.dispatch;
        if (!d) continue;

        // 方法：dispatch.objName 直接可用
        if (d.objName) {
          checkRoute(typeName, propName, d.objName, d.propName || propName);
        }
        // accessor：dispatch.getter / dispatch.setter 嵌套结构
        if (d.getter && d.getter.objName) {
          checkRoute(typeName, propName + '.get', d.getter.objName, d.getter.propName || propName);
        }
        if (d.setter && d.setter.objName) {
          checkRoute(typeName, propName + '.set', d.setter.objName, d.setter.propName || propName);
        }
      }
    }

    if (warnCount === 0) {
      console.log('[LeapVM] dispatch route validation passed (' + skeletonObjects.length + ' skeletons checked)');
    } else {
      console.warn('[LeapVM] dispatch route validation found ' + warnCount + ' issue(s)');
    }
  };

  hideLeapenvKeys([
    '_runtimeInitialized',
    '__runtime',
    'getRuntimeStore',
    'getRuntimeConfig',
    'getHostTimers',
    'getNativeBridge',
    'getHookRuntime',
    'beginTask',
    'endTask',
    'getCurrentTaskId',
    'getTaskState',
    'signatureTaskState',
    'registerImpl',
    'validateDispatchRoutes',
    'registerFacadePublicKeys',
    'registerFacadePublicKey',
    'getFacadePublicKeys',
    'definePublicApi'
  ]);

  const DEFAULT_FACADE_PUBLIC_KEYS = [
    // host task lifecycle (runner.js / worker cleanup)
    'domShared',
    'getRuntimeStore',
    'beginTask',
    'endTask',
    'getCurrentTaskId',
    'getTaskState',
    // task override APIs
    'applyFingerprintSnapshot',
    'applyStorageSnapshot',
    'applyDocumentSnapshot',
    'resetSignatureTaskState',
    // bootstrap stage hooks (safe to keep in facade)
    'loadSkeleton',
    'installConstructibleWindowWrappers'
  ];

  function ensureFacadeState() {
    const runtime = ensureRuntimeStore();
    runtime.facade = runtime.facade && typeof runtime.facade === 'object'
      ? runtime.facade
      : {};
    runtime.facade.publicKeys = runtime.facade.publicKeys && typeof runtime.facade.publicKeys === 'object'
      ? runtime.facade.publicKeys
      : Object.create(null);
    runtime.facade.finalized = !!runtime.facade.finalized;
    return runtime.facade;
  }

  function addFacadePublicKeys(input) {
    const facade = ensureFacadeState();
    if (typeof input === 'string') {
      const key = String(input).trim();
      if (key) {
        facade.publicKeys[key] = true;
      }
      return Object.keys(facade.publicKeys).sort();
    }
    if (!Array.isArray(input)) {
      return Object.keys(facade.publicKeys).sort();
    }
    for (let i = 0; i < input.length; i++) {
      const key = String(input[i] == null ? '' : input[i]).trim();
      if (!key) continue;
      facade.publicKeys[key] = true;
    }
    return Object.keys(facade.publicKeys).sort();
  }

  function collectFacadePublicKeys(explicitKeys) {
    const publicSet = Object.create(null);
    const source = Array.isArray(explicitKeys) && explicitKeys.length > 0
      ? explicitKeys
      : DEFAULT_FACADE_PUBLIC_KEYS;
    for (let i = 0; i < source.length; i++) {
      const key = String(source[i] == null ? '' : source[i]).trim();
      if (!key) continue;
      publicSet[key] = true;
    }

    if (!Array.isArray(explicitKeys) || explicitKeys.length === 0) {
      const facade = ensureFacadeState();
      const extraKeys = Object.keys(facade.publicKeys || {});
      for (let i = 0; i < extraKeys.length; i++) {
        publicSet[extraKeys[i]] = true;
      }
    }

    return Object.keys(publicSet).sort();
  }

  function definePublicApi(name, value) {
    const key = String(name == null ? '' : name).trim();
    if (!key) return false;
    addFacadePublicKeys(key);
    defineNonEnumerableValue(leapenv, key, value);
    const facade = ensureFacadeState();
    if (facade.finalized) {
      setPropertyEnumerable(leapenv, key, true);
    }
    return true;
  }

  function finalizeFacade(publicKeys) {
    const source = collectFacadePublicKeys(publicKeys);
    const publicSet = Object.create(null);
    for (let i = 0; i < source.length; i++) {
      publicSet[String(source[i])] = true;
    }

    const ownKeys = Object.getOwnPropertyNames(leapenv);
    let publicCount = 0;
    let hiddenCount = 0;
    for (let i = 0; i < ownKeys.length; i++) {
      const key = ownKeys[i];
      const shouldBePublic = !!publicSet[key];
      const updated = setPropertyEnumerable(leapenv, key, shouldBePublic);
      if (!updated) continue;
      if (shouldBePublic) {
        publicCount += 1;
      } else {
        hiddenCount += 1;
      }
    }

    const facade = ensureFacadeState();
    facade.finalized = true;

    return {
      total: ownKeys.length,
      publicCount: publicCount,
      hiddenCount: hiddenCount,
      publicKeys: Object.keys(publicSet).sort()
    };
  }

  function createForwardingFacade(source, keys, publicSet) {
    const facade = {};
    for (let i = 0; i < keys.length; i++) {
      const key = String(keys[i] == null ? '' : keys[i]).trim();
      if (!key) continue;
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const isPublic = !!(publicSet && publicSet[key]);
      try {
        Object.defineProperty(facade, key, {
          enumerable: isPublic,
          configurable: false,
          get: function () {
            return source[key];
          },
          set: function (value) {
            try { source[key] = value; } catch (_) {}
          }
        });
      } catch (_) {}
    }
    return facade;
  }

  function resolveGlobalFacadeMode(explicitMode) {
    const runtime = ensureRuntimeStore();
    const fromConfig = runtime && runtime.config ? runtime.config.globalFacadeMode : '';
    return normalizeGlobalFacadeMode(explicitMode || fromConfig || 'compat');
  }

  function lockdownGlobalFacade(publicKeys, options) {
    const source = leapenv;
    const runtime = ensureRuntimeStore();
    const requestedMode = (typeof options === 'string')
      ? options
      : (options && typeof options === 'object' && typeof options.mode === 'string'
        ? options.mode
        : '');
    const mode = resolveGlobalFacadeMode(requestedMode);
    runtime.config.globalFacadeMode = mode;

    const publicKeysSorted = collectFacadePublicKeys(publicKeys);
    const publicSet = Object.create(null);
    for (let i = 0; i < publicKeysSorted.length; i++) {
      publicSet[String(publicKeysSorted[i])] = true;
    }

    // Required by C++ dispatch/runtime bridge; keep non-enumerable in facade.
    if (!Object.prototype.hasOwnProperty.call(source, '__runtime')) {
      source.__runtime = ensureRuntimeStore();
    }
    if (!Object.prototype.hasOwnProperty.call(source, 'config')) {
      source.config = ensureRuntimeStore().config;
    }
    if (!Object.prototype.hasOwnProperty.call(source, 'nativeInstances') ||
        !source.nativeInstances ||
        typeof source.nativeInstances !== 'object') {
      source.nativeInstances = {};
    }

    if (mode !== 'strict') {
      runtime.facade = runtime.facade && typeof runtime.facade === 'object' ? runtime.facade : {};
      runtime.facade.internalLeapenv = source;
      runtime.facade.globalFacade = source;
      runtime.facade.globalLocked = false;

      const facadeState = ensureFacadeState();
      facadeState.finalized = true;

      try {
        Object.defineProperty(global, 'leapenv', {
          value: source,
          writable: true,
          enumerable: false,
          configurable: true
        });
      } catch (_) {}

      return {
        exposedCount: Object.keys(source).length,
        exposedKeys: Object.keys(source).sort(),
        locked: false,
        mode: 'compat'
      };
    }

    const internalCompatKeys = ['__runtime', 'config', 'nativeInstances'];

    const allKeySet = Object.create(null);
    for (let i = 0; i < publicKeysSorted.length; i++) {
      allKeySet[String(publicKeysSorted[i])] = true;
    }
    for (let i = 0; i < internalCompatKeys.length; i++) {
      allKeySet[internalCompatKeys[i]] = true;
    }
    const allKeys = Object.keys(allKeySet).sort();

    const facade = createForwardingFacade(source, allKeys, publicSet);
    const facadeOwnKeys = Object.keys(facade);
    const facadeState = ensureFacadeState();

    try { Object.freeze(facade); } catch (_) {}

    // Keep internal reference in runtime store; only expose minimal facade to global.
    runtime.facade = runtime.facade && typeof runtime.facade === 'object' ? runtime.facade : {};
    runtime.facade.internalLeapenv = source;
    runtime.facade.globalFacade = facade;
    runtime.facade.globalLocked = true;
    facadeState.finalized = true;

    try {
      Object.defineProperty(global, 'leapenv', {
        value: facade,
        writable: false,
        enumerable: false,
        configurable: false
      });
    } catch (_) {
      try { global.leapenv = facade; } catch (__){}
    }

    return {
      exposedCount: facadeOwnKeys.length,
      exposedKeys: facadeOwnKeys.slice().sort(),
      locked: true,
      mode: 'strict'
    };
  }

  defineNonEnumerableValue(leapenv, 'registerFacadePublicKeys', addFacadePublicKeys);
  defineNonEnumerableValue(leapenv, 'registerFacadePublicKey', function registerFacadePublicKey(key) {
    addFacadePublicKeys([key]);
    return true;
  });
  defineNonEnumerableValue(leapenv, 'getFacadePublicKeys', function getFacadePublicKeys() {
    return collectFacadePublicKeys(null);
  });
  defineNonEnumerableValue(leapenv, 'definePublicApi', definePublicApi);
  defineNonEnumerableValue(leapenv, 'finalizeFacade', finalizeFacade);
  defineNonEnumerableValue(leapenv, 'lockdownGlobalFacade', lockdownGlobalFacade);
  defineNonEnumerableValue(leapenv, 'DEFAULT_FACADE_PUBLIC_KEYS', DEFAULT_FACADE_PUBLIC_KEYS.slice());

})(globalThis);

// A2: Error.prepareStackTrace 重写
// 格式化堆栈以匹配 Chrome 的格式，并过滤 leap 内部帧。
// 依赖 A1（ScriptOrigin）提供正确的文件名；A1 未实现时此处依然能改善格式。
//
// 注意：在嵌入式 V8 中 CallSite 方法（getFileName 等）调用需谨慎；
//   使用再入守卫 + try-catch 防止递归崩溃。
(function(global) {
  if (typeof Error === 'undefined') return;

  // 再入守卫：防止 prepareStackTrace 自身触发新 Error 导致无限递归
  var _inPrepareStackTrace = false;

  Error.prepareStackTrace = function(error, structuredStack) {
    if (_inPrepareStackTrace) {
      // 再入时返回最小堆栈字符串，避免递归
      return (error && error.name ? error.name : 'Error') +
             (error && error.message ? ': ' + error.message : '');
    }
    _inPrepareStackTrace = true;

    var result;
    try {
      var lines = [];
      var len = structuredStack ? structuredStack.length : 0;
      for (var i = 0; i < len; i++) {
        var frame = structuredStack[i];
        if (!frame) continue;

        var fileName = frame.getFileName ? frame.getFileName() : null;

        // 过滤 leap 内部帧
        if (!fileName) continue;
        if (fileName.indexOf('node:') === 0) continue;
        if (fileName.indexOf('leap-env') !== -1) continue;
        if (fileName.indexOf('leap.bundle.js') !== -1) continue;
        if (fileName.indexOf('bundle.js') !== -1) continue;
        if (fileName.indexOf('entry.js') !== -1) continue;

        var funcName   = frame.getFunctionName  ? frame.getFunctionName()  : null;
        var typeName   = frame.getTypeName      ? frame.getTypeName()      : null;
        var methodName = frame.getMethodName    ? frame.getMethodName()    : null;
        var lineNum    = frame.getLineNumber    ? frame.getLineNumber()    : 0;
        var colNum     = frame.getColumnNumber  ? frame.getColumnNumber()  : 0;

        var location = fileName + ':' + lineNum + ':' + colNum;

        var name = '';
        if (typeName && funcName)    { name = typeName + '.' + funcName; }
        else if (typeName && methodName) { name = typeName + '.' + methodName; }
        else if (funcName)           { name = funcName; }

        lines.push(name ? '    at ' + name + ' (' + location + ')' : '    at ' + location);
      }

      var header = (error && error.name ? error.name : 'Error');
      if (error && error.message) { header = header + ': ' + error.message; }
      result = header + (lines.length ? '\n' + lines.join('\n') : '');
    } catch (_e) {
      // 如果访问 CallSite 方法失败，退回到简单格式
      result = (error && error.name ? error.name : 'Error') +
               (error && error.message ? ': ' + error.message : '');
    } finally {
      _inPrepareStackTrace = false;
    }
    return result;
  };
})(globalThis);
