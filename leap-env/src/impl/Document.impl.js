(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;
  const tools = leapenv.toolsFunc || {};

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  function normalizeTag(tagName) {
    if (tagName == null) {
      return '';
    }
    return String(tagName).trim().toLowerCase();
  }

  function resolveCtorName(tagName) {
    if (typeof tools.getConstructorName === 'function') {
      return tools.getConstructorName(tagName);
    }
    return 'HTMLUnknownElement';
  }

  function ensureDefaultTree(documentObject) {
    if (typeof dom.ensureDocumentDefaultTree === 'function') {
      dom.ensureDocumentDefaultTree(documentObject);
    } else {
      dom.ensureDocumentRegistration(documentObject);
    }
  }

  function getDispatchCacheRoot() {
    if (typeof leapenv.isPerfDispatchCacheEnabled !== 'function' ||
        !leapenv.isPerfDispatchCacheEnabled() ||
        typeof leapenv.getDispatchExperimentCache !== 'function') {
      return null;
    }
    try {
      const root = leapenv.getDispatchExperimentCache();
      if (!root || typeof root !== 'object') {
        return null;
      }
      if (!root.document || typeof root.document !== 'object') {
        root.document = {};
      }
      return root.document;
    } catch (_) {
      return null;
    }
  }

  function getDocumentCacheEntry(self, createIfMissing) {
    const root = getDispatchCacheRoot();
    if (!root) {
      return null;
    }

    if (typeof WeakMap === 'function') {
      if (!(root.byInstance instanceof WeakMap)) {
        root.byInstance = new WeakMap();
      }
      let entry = root.byInstance.get(self);
      if (!entry && createIfMissing) {
        entry = {};
        root.byInstance.set(self, entry);
      }
      return entry || null;
    }

    if (!Array.isArray(root.entries)) {
      root.entries = [];
    }
    for (let i = 0; i < root.entries.length; i++) {
      if (root.entries[i].self === self) {
        return root.entries[i].entry;
      }
    }
    if (!createIfMissing) {
      return null;
    }
    const entry = {};
    root.entries.push({ self, entry });
    return entry;
  }

  function syncDocumentUrlFromLocation(documentObject) {
    const state = dom.ensureNodeState(documentObject);
    const nativeInstances = leapenv.nativeInstances || {};
    if (nativeInstances.document === documentObject && nativeInstances.location) {
      try {
        const href = nativeInstances.location.href;
        if (typeof dom.setDocumentUrl === 'function') {
          dom.setDocumentUrl(documentObject, href);
        } else {
          state.url = href || 'about:blank';
        }
      } catch (_) {}
    }
    if (!state.url) {
      state.url = 'about:blank';
    }
    return state.url;
  }

  function formatStableLastModified(state) {
    if (state._lastModifiedString) {
      return state._lastModifiedString;
    }
    const d = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    state._lastModifiedString =
      pad2(d.getMonth() + 1) + '/' +
      pad2(d.getDate()) + '/' +
      d.getFullYear() + ' ' +
      pad2(d.getHours()) + ':' +
      pad2(d.getMinutes()) + ':' +
      pad2(d.getSeconds());
    return state._lastModifiedString;
  }

  class DocumentImpl {
    parseHTMLUnsafe(htmlText) {
      return dom.parseHTMLUnsafe(htmlText, this);
    }

    createElement(tagName) {
      const state = dom.ensureDocumentRegistration(this);
      const tag = normalizeTag(tagName);
      if (typeof dom.createElementForDocument === 'function') {
        return dom.createElementForDocument(this, tag);
      }
      const ctorName = resolveCtorName(tag);
      const element = dom.createNodeObject(ctorName, tag);
      dom.ensureElementState(element, tag, this);
      if (state.nodeType !== 9) {
        dom.ensureDocumentRegistration(this);
      }
      return element;
    }

    createElementNS(_namespace, qualifiedName) {
      const state = dom.ensureDocumentRegistration(this);
      if (typeof dom.createElementNSForDocument === 'function') {
        return dom.createElementNSForDocument(this, _namespace, qualifiedName);
      }
      const fallbackTag = normalizeTag(qualifiedName);
      const ctorName = resolveCtorName(fallbackTag);
      const element = dom.createNodeObject(ctorName, fallbackTag);
      dom.ensureElementState(element, fallbackTag, this);
      if (state.nodeType !== 9) {
        dom.ensureDocumentRegistration(this);
      }
      return element;
    }

    get documentElement() {
      const cacheEntry = getDocumentCacheEntry(this, true);
      if (cacheEntry && Object.prototype.hasOwnProperty.call(cacheEntry, 'documentElement')) {
        return cacheEntry.documentElement;
      }
      ensureDefaultTree(this);
      const value = dom.getDocumentElement(this);
      if (cacheEntry) {
        cacheEntry.documentElement = value;
      }
      return value;
    }

    get head() {
      ensureDefaultTree(this);
      return dom.getDocumentHead(this);
    }

    get body() {
      const cacheEntry = getDocumentCacheEntry(this, true);
      if (cacheEntry && Object.prototype.hasOwnProperty.call(cacheEntry, 'body')) {
        return cacheEntry.body;
      }
      ensureDefaultTree(this);
      const value = dom.getDocumentBody(this);
      if (cacheEntry) {
        cacheEntry.body = value;
      }
      return value;
    }

    get children() {
      ensureDefaultTree(this);
      return dom.createHTMLCollection(null, () => dom.getElementChildren(this));
    }

    getElementById(idValue) {
      ensureDefaultTree(this);
      return dom.getElementById(this, idValue);
    }

    getElementsByClassName(classNameText) {
      ensureDefaultTree(this);
      return dom.createHTMLCollection(dom.getElementsByClassName(this, classNameText, false));
    }

    getElementsByTagName(tagName) {
      ensureDefaultTree(this);
      return dom.createHTMLCollection(dom.getElementsByTagName(this, tagName, false));
    }

    querySelector(selectorText) {
      ensureDefaultTree(this);
      return dom.querySelector(this, selectorText, false);
    }

    querySelectorAll(selectorText) {
      ensureDefaultTree(this);
      return dom.createNodeList(dom.querySelectorAll(this, selectorText, false));
    }

    // B2: createTextNode
    createTextNode(data) {
      dom.ensureDocumentRegistration(this);
      const node = dom.createNodeObject('Text', '');
      dom.ensureNodeState(node, {
        nodeType: 3,
        nodeName: '#text',
        tagName: '',
        textContent: data == null ? '' : String(data),
        ownerDocument: this
      });
      return node;
    }

    // B4: createComment
    createComment(data) {
      dom.ensureDocumentRegistration(this);
      const node = dom.createNodeObject('Comment', '');
      dom.ensureNodeState(node, {
        nodeType: 8,
        nodeName: '#comment',
        tagName: '',
        textContent: data == null ? '' : String(data),
        ownerDocument: this
      });
      return node;
    }

    // B3: createDocumentFragment
    createDocumentFragment() {
      const node = dom.createNodeObject('DocumentFragment', '');
      dom.ensureNodeState(node, {
        nodeType: 11,
        nodeName: '#document-fragment',
        tagName: '',
        ownerDocument: this
      });
      return node;
    }

    // B14: readyState / URL / documentURI / title / domain / compatMode / charset
    get readyState() { return 'complete'; }
    get URL() {
      return syncDocumentUrlFromLocation(this);
    }
    get documentURI() { return this.URL; }
    get title() {
      const state = dom.ensureNodeState(this);
      return state._title || '';
    }
    set title(v) {
      const state = dom.ensureNodeState(this);
      state._title = v == null ? '' : String(v);
    }
    get domain() {
      const url = this.URL;
      if (!url || url === 'about:blank') { return ''; }
      try {
        return new URL(url).hostname;
      } catch (_) { return ''; }
    }
    get compatMode() { return 'CSS1Compat'; }
    get characterSet() { return 'UTF-8'; }
    get charset() { return 'UTF-8'; }
    get inputEncoding() { return 'UTF-8'; }
    get contentType() { return 'text/html'; }
    get defaultView() { return global; }
    get referrer() {
      const state = dom.ensureNodeState(this);
      return state.referrer == null ? '' : String(state.referrer);
    }
    get lastModified() {
      const state = dom.ensureNodeState(this);
      return formatStableLastModified(state);
    }
    get currentScript() { return null; }
    get all() {
      if (typeof leapenv.getDocumentAllCollection === 'function') {
        return leapenv.getDocumentAllCollection(this);
      }
      return null;
    }
    get implementation() {
      return {
        hasFeature: () => true,
        createDocumentType: () => null,
        createDocument: () => null,
        createHTMLDocument: () => null
      };
    }

    // B15: cookie
    get cookie() {
      const cacheEntry = getDocumentCacheEntry(this, true);
      if (cacheEntry && Object.prototype.hasOwnProperty.call(cacheEntry, 'cookie')) {
        return cacheEntry.cookie;
      }
      dom.ensureDocumentRegistration(this);
      const state = dom.ensureNodeState(this);
      if (!state._cookieStore) {
        if (cacheEntry) {
          cacheEntry.cookie = '';
        }
        return '';
      }
      const value = Object.entries(state._cookieStore)
        .map(([k, v]) => k + '=' + v)
        .join('; ');
      if (cacheEntry) {
        cacheEntry.cookie = value;
      }
      return value;
    }
    set cookie(value) {
      dom.ensureDocumentRegistration(this);
      const state = dom.ensureNodeState(this);
      if (!state._cookieStore) { state._cookieStore = {}; }
      const str = String(value == null ? '' : value);
      const semi = str.indexOf(';');
      const pair = semi >= 0 ? str.slice(0, semi) : str;
      const eq = pair.indexOf('=');
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        state._cookieStore[name] = val;
      }
      const cacheEntry = getDocumentCacheEntry(this, false);
      if (cacheEntry) {
        delete cacheEntry.cookie;
      }
    }

    // Document skeleton 中已声明的其余方法
    static parseHTMLUnsafe(html) { return dom.parseHTMLUnsafe(html, null); }
  }

  leapenv.registerImpl('Document', DocumentImpl);
})(globalThis);
