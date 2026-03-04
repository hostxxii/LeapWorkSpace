// Signature task snapshot apply/reset coordinator
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared || null;

  function cloneArray(input) {
    return Array.isArray(input) ? input.slice() : [];
  }

  function clonePlainObject(input) {
    const out = {};
    if (!input || typeof input !== 'object') {
      return out;
    }
    const keys = Object.keys(input);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = input[key];
      out[key] = Array.isArray(value) ? value.slice() : value;
    }
    return out;
  }

  function cloneValueDeepLite(input, depth) {
    if (depth <= 0 || input == null) {
      return input;
    }
    if (Array.isArray(input)) {
      return input.map((v) => cloneValueDeepLite(v, depth - 1));
    }
    if (typeof input !== 'object') {
      return input;
    }
    const out = {};
    const keys = Object.keys(input);
    for (let i = 0; i < keys.length; i++) {
      out[keys[i]] = cloneValueDeepLite(input[keys[i]], depth - 1);
    }
    return out;
  }

  function cloneCanvasProfile(input) {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const out = clonePlainObject(input);
    if (out.toDataURL && typeof out.toDataURL === 'object') {
      out.toDataURL = clonePlainObject(out.toDataURL);
    }
    if (out.webgl && typeof out.webgl === 'object') {
      out.webgl = clonePlainObject(out.webgl);
      if (Array.isArray(out.webgl.supportedExtensions)) {
        out.webgl.supportedExtensions = cloneArray(out.webgl.supportedExtensions);
      }
      if (out.webgl.contextAttributes && typeof out.webgl.contextAttributes === 'object') {
        out.webgl.contextAttributes = clonePlainObject(out.webgl.contextAttributes);
      }
      if (out.webgl.parameters && typeof out.webgl.parameters === 'object') {
        out.webgl.parameters = cloneValueDeepLite(out.webgl.parameters, 3);
      }
    }
    return out;
  }

  function cloneNavigatorPluginList(input) {
    if (!Array.isArray(input)) {
      return [];
    }
    const out = [];
    for (let i = 0; i < input.length; i++) {
      const plugin = input[i];
      if (!plugin || typeof plugin !== 'object') {
        out.push(plugin);
        continue;
      }
      const copy = clonePlainObject(plugin);
      if (Array.isArray(plugin.mimeTypes)) {
        copy.mimeTypes = plugin.mimeTypes.map((mime) => clonePlainObject(mime));
      }
      out.push(copy);
    }
    return out;
  }

  function getRuntimeTaskState() {
    if (typeof leapenv.getTaskState === 'function') {
      try {
        const state = leapenv.getTaskState();
        if (state && typeof state === 'object') {
          return state;
        }
      } catch (_) {}
    }
    if (!leapenv.signatureTaskState || typeof leapenv.signatureTaskState !== 'object') {
      leapenv.signatureTaskState = {};
    }
    return leapenv.signatureTaskState;
  }

  function ensureTaskState() {
    const state = getRuntimeTaskState();
    if (!state.navigator) state.navigator = {};
    if (!state.screen) state.screen = {};
    if (!state.windowMetrics) state.windowMetrics = {};
    if (!state.performanceSeed) state.performanceSeed = {};
    if (!state.featureFlags) state.featureFlags = {};
    return state;
  }

  function clearObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      delete obj[keys[i]];
    }
  }

  function getNativeInstance(name) {
    return leapenv.nativeInstances && leapenv.nativeInstances[name];
  }

  function getActiveDocument() {
    let doc = getNativeInstance('document');
    if (!doc && global.document) {
      doc = global.document;
    }
    return doc || null;
  }

  function getActiveLocation() {
    let loc = getNativeInstance('location');
    if (!loc && global.location) {
      loc = global.location;
    }
    return loc || null;
  }

  function getActiveHistory() {
    let history = getNativeInstance('history');
    if (!history && global.history) {
      history = global.history;
    }
    return history || null;
  }

  function getActivePerformance() {
    let perf = getNativeInstance('performance');
    if (!perf && global.performance) {
      perf = global.performance;
    }
    return perf || null;
  }

  function getActiveStorage(name) {
    let store = getNativeInstance(name);
    if (!store && global[name]) {
      store = global[name];
    }
    return store || null;
  }

  function applyObjectPatch(target, patch) {
    if (!patch || typeof patch !== 'object') {
      return;
    }
    const keys = Object.keys(patch);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = patch[key];
      target[key] = Array.isArray(value) ? value.slice() : value;
    }
  }

  function buildHrefFromLocationParts(locationPatch) {
    if (!locationPatch || typeof locationPatch !== 'object') {
      return '';
    }
    if (typeof locationPatch.href === 'string' && locationPatch.href) {
      return locationPatch.href;
    }
    const protocol = locationPatch.protocol ? String(locationPatch.protocol) : '';
    const host = locationPatch.host
      ? String(locationPatch.host)
      : (locationPatch.hostname ? String(locationPatch.hostname) + (locationPatch.port ? ':' + String(locationPatch.port) : '') : '');
    const pathnameRaw = locationPatch.pathname == null ? '/' : String(locationPatch.pathname);
    const pathname = pathnameRaw ? (pathnameRaw.charAt(0) === '/' ? pathnameRaw : '/' + pathnameRaw) : '/';
    let search = locationPatch.search == null ? '' : String(locationPatch.search);
    if (search && search.charAt(0) !== '?') search = '?' + search;
    let hash = locationPatch.hash == null ? '' : String(locationPatch.hash);
    if (hash && hash.charAt(0) !== '#') hash = '#' + hash;

    if (!protocol && !host) {
      return 'about:blank';
    }
    const normalizedProtocol = protocol ? protocol.replace(/:*$/, '') + ':' : 'https:';
    return normalizedProtocol + '//' + host + pathname + search + hash;
  }

  function parseCookieHeaderToStore(cookieText) {
    const store = {};
    const text = String(cookieText == null ? '' : cookieText).trim();
    if (!text) {
      return store;
    }
    const chunks = text.split(';');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim();
      if (!chunk) continue;
      const eq = chunk.indexOf('=');
      if (eq <= 0) continue;
      const name = chunk.slice(0, eq).trim();
      const value = chunk.slice(eq + 1).trim();
      if (!name) continue;
      store[name] = value;
    }
    return store;
  }

  function applyDocumentCookie(doc, cookieText) {
    if (!doc || !dom) return;
    const state = dom.ensureNodeState(doc);
    state._cookieStore = parseCookieHeaderToStore(cookieText);
  }

  function resetDocumentState(doc) {
    if (!doc || !dom) return;
    const state = dom.ensureNodeState(doc);
    state._cookieStore = {};
    state.referrer = '';
    state._lastModifiedString = null;
    if (typeof dom.setDocumentUrl === 'function') {
      dom.setDocumentUrl(doc, 'about:blank');
    } else {
      state.url = 'about:blank';
    }
  }

  function applyDocumentSnapshotFields(doc, snapshot) {
    if (!doc || !dom || !snapshot || typeof snapshot !== 'object') return;
    const state = dom.ensureNodeState(doc);
    if (Object.prototype.hasOwnProperty.call(snapshot, 'cookie')) {
      applyDocumentCookie(doc, snapshot.cookie == null ? '' : snapshot.cookie);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'referrer')) {
      state.referrer = snapshot.referrer == null ? '' : String(snapshot.referrer);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'lastModified')) {
      state._lastModifiedString = snapshot.lastModified == null ? null : String(snapshot.lastModified);
    }
  }

  function clearStorage(store) {
    if (!store || typeof store.clear !== 'function') return;
    try { store.clear(); } catch (_) {}
  }

  function normalizeStorageMode(raw) {
    return String(raw == null ? 'replace' : raw).trim().toLowerCase() === 'merge'
      ? 'merge'
      : 'replace';
  }

  function applyStorageEntries(store, entries, mode) {
    if (!store) return;
    if (mode !== 'merge') {
      clearStorage(store);
    }
    if (entries == null || typeof entries !== 'object') {
      return;
    }
    const keys = Object.keys(entries);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        store.setItem(String(key), String(entries[key] == null ? '' : entries[key]));
      } catch (_) {}
    }
  }

  function applyLocationSnapshot(snapshot) {
    const loc = getActiveLocation();
    if (!loc || !snapshot || typeof snapshot !== 'object' || !snapshot.location) {
      return;
    }
    const href = buildHrefFromLocationParts(snapshot.location);
    try {
      loc.href = href || 'about:blank';
    } catch (_) {}
  }

  function resetLocationAndHistory() {
    const history = getActiveHistory();
    if (leapenv.historyImplHelpers && typeof leapenv.historyImplHelpers.reset === 'function') {
      try { leapenv.historyImplHelpers.reset(history); } catch (_) {}
    }
    const loc = getActiveLocation();
    if (loc) {
      try { loc.href = 'about:blank'; } catch (_) {}
    }
  }

  function resetPerformanceSeed() {
    const perf = getActivePerformance();
    if (leapenv.performanceImplHelpers && typeof leapenv.performanceImplHelpers.reset === 'function') {
      try { leapenv.performanceImplHelpers.reset(perf, null); } catch (_) {}
    }
  }

  function applyPerformanceSeed(seed) {
    const perf = getActivePerformance();
    if (leapenv.performanceImplHelpers && typeof leapenv.performanceImplHelpers.reset === 'function') {
      try { leapenv.performanceImplHelpers.reset(perf, seed || null); } catch (_) {}
    }
  }

  function definePublicTaskMethod(name, fn) {
    if (typeof leapenv.definePublicApi === 'function') {
      try {
        leapenv.definePublicApi(name, fn);
        return;
      } catch (_) {}
    }
    try {
      Object.defineProperty(leapenv, name, {
        value: fn,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (_) {
      leapenv[name] = fn;
    }
  }

  function applyFingerprintSnapshot(snapshot) {
    const taskState = ensureTaskState();
    const input = (snapshot && typeof snapshot === 'object') ? snapshot : {};

    clearObject(taskState.navigator);
    clearObject(taskState.screen);
    clearObject(taskState.windowMetrics);
    clearObject(taskState.performanceSeed);
    clearObject(taskState.featureFlags);
    taskState.randomSeed = undefined;
    taskState.canvasProfile = undefined;

    if (input.navigator && typeof input.navigator === 'object') {
      applyObjectPatch(taskState.navigator, input.navigator);
      if (Array.isArray(input.navigator.languages)) {
        taskState.navigator.languages = cloneArray(input.navigator.languages);
      }
      if (Array.isArray(input.navigator.plugins)) {
        taskState.navigator.plugins = cloneNavigatorPluginList(input.navigator.plugins);
      }
      if (Array.isArray(input.navigator.mimeTypes)) {
        taskState.navigator.mimeTypes = input.navigator.mimeTypes.map((mime) => clonePlainObject(mime));
      }
      if (input.navigator.permissions && typeof input.navigator.permissions === 'object') {
        taskState.navigator.permissions = clonePlainObject(input.navigator.permissions);
      }
    }
    if (input.screen && typeof input.screen === 'object') {
      applyObjectPatch(taskState.screen, input.screen);
    }
    if (input.windowMetrics && typeof input.windowMetrics === 'object') {
      applyObjectPatch(taskState.windowMetrics, input.windowMetrics);
    }
    if (input.performanceSeed && typeof input.performanceSeed === 'object') {
      applyObjectPatch(taskState.performanceSeed, input.performanceSeed);
      applyPerformanceSeed(taskState.performanceSeed);
    } else {
      resetPerformanceSeed();
    }
    if (input.featureFlags && typeof input.featureFlags === 'object') {
      applyObjectPatch(taskState.featureFlags, input.featureFlags);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'randomSeed')) {
      taskState.randomSeed = input.randomSeed;
    }
    if (input.canvasProfile && typeof input.canvasProfile === 'object') {
      taskState.canvasProfile = cloneCanvasProfile(input.canvasProfile);
    }

    applyLocationSnapshot(input);

    const doc = getActiveDocument();
    if (doc && dom && typeof dom.ensureDocumentDefaultTree === 'function') {
      try { dom.ensureDocumentDefaultTree(doc); } catch (_) {}
    }
    applyDocumentSnapshotFields(doc, input);

    return true;
  }

  function applyStorageSnapshot(snapshot, policy) {
    const input = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    const modeCfg = (policy && typeof policy === 'object') ? policy : {};
    if (Object.prototype.hasOwnProperty.call(input, 'localStorage')) {
      applyStorageEntries(
        getActiveStorage('localStorage'),
        input.localStorage,
        normalizeStorageMode(modeCfg.localStorage)
      );
    }
    if (Object.prototype.hasOwnProperty.call(input, 'sessionStorage')) {
      applyStorageEntries(
        getActiveStorage('sessionStorage'),
        input.sessionStorage,
        normalizeStorageMode(modeCfg.sessionStorage)
      );
    }
    return true;
  }

  function applyDocumentSnapshot(snapshot) {
    const input = (snapshot && typeof snapshot === 'object') ? snapshot : {};
    const doc = getActiveDocument();
    if (doc && dom && typeof dom.ensureDocumentDefaultTree === 'function') {
      try { dom.ensureDocumentDefaultTree(doc); } catch (_) {}
    }
    applyDocumentSnapshotFields(doc, input);
    return true;
  }

  function resetSignatureTaskState() {
    const taskState = ensureTaskState();
    clearObject(taskState.navigator);
    clearObject(taskState.screen);
    clearObject(taskState.windowMetrics);
    clearObject(taskState.performanceSeed);
    clearObject(taskState.featureFlags);
    delete taskState.randomSeed;
    delete taskState.canvasProfile;

    clearStorage(getActiveStorage('localStorage'));
    clearStorage(getActiveStorage('sessionStorage'));
    resetLocationAndHistory();
    resetPerformanceSeed();
    resetDocumentState(getActiveDocument());
    return true;
  }

  definePublicTaskMethod('applyFingerprintSnapshot', applyFingerprintSnapshot);
  definePublicTaskMethod('applyStorageSnapshot', applyStorageSnapshot);
  definePublicTaskMethod('applyDocumentSnapshot', applyDocumentSnapshot);
  definePublicTaskMethod('resetSignatureTaskState', resetSignatureTaskState);
})(globalThis);
