(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const tools = leapenv.toolsFunc || {};

  if (leapenv.domShared) {
    return;
  }

  const hasOwn = Object.prototype.hasOwnProperty;
  const weakState = typeof WeakMap === 'function' ? new WeakMap() : null;
  const fallbackState = [];
  let currentTaskId = 'task-default';
  let docSeq = 0;
  const documentById = new Map();
  const taskToDocs = new Map();
  const taskPrimaryDocument = new Map();
  const releaseStats = {
    releasedDocs: 0,
    releasedNodes: 0
  };
  const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
  const STYLE_LAYOUT_ALLOWLIST = new Set([
    'display',
    'position',
    'box-sizing',
    'width',
    'height',
    'min-width',
    'min-height',
    'max-width',
    'max-height',
    'left',
    'top',
    'right',
    'bottom'
  ]);
  function normalizeDomBackend() {
    return 'dod';
  }

  function getRuntimeStore() {
    if (typeof leapenv.getRuntimeStore === 'function') {
      try {
        var runtime = leapenv.getRuntimeStore();
        if (runtime && typeof runtime === 'object') {
          return runtime;
        }
      } catch (_) {}
    }
    if (leapenv.__runtime && typeof leapenv.__runtime === 'object') {
      return leapenv.__runtime;
    }
    return null;
  }

  function getDomBackend() {
    var runtime = getRuntimeStore();
    var fromRuntime = runtime && runtime.config ? runtime.config.domBackend : '';
    var fromConfig = leapenv && leapenv.config ? leapenv.config.domBackend : '';
    return normalizeDomBackend(fromRuntime || fromConfig || 'dod');
  }

  function setDomBackend(value) {
    var normalized = normalizeDomBackend(value);
    var runtime = getRuntimeStore();
    if (runtime) {
      runtime.config = runtime.config && typeof runtime.config === 'object' ? runtime.config : {};
      runtime.config.domBackend = normalized;
    }
    leapenv.config = leapenv.config || {};
    leapenv.config.domBackend = normalized;
    return normalized;
  }

  function getFallbackEntry(node) {
    for (var i = 0; i < fallbackState.length; i++) {
      if (fallbackState[i].node === node) {
        return fallbackState[i];
      }
    }
    return null;
  }

  function getState(node) {
    if (weakState) {
      return weakState.get(node);
    }
    var entry = getFallbackEntry(node);
    return entry ? entry.state : undefined;
  }

  function setState(node, state) {
    if (weakState) {
      weakState.set(node, state);
      return;
    }
    var entry = getFallbackEntry(node);
    if (entry) {
      entry.state = state;
      return;
    }
    fallbackState.push({ node: node, state: state });
  }

  function setCtorName(node, ctorName) {
    if (!node || typeof node !== 'object') {
      return;
    }
    try {
      Object.defineProperty(node, '__leapCtorName', {
        value: ctorName,
        configurable: true,
        enumerable: false,
        writable: true
      });
    } catch (_) {
      node.__leapCtorName = ctorName;
    }
  }

  function getCtorName(node) {
    if (!node || typeof node !== 'object') {
      return '';
    }
    return node.__leapCtorName || '';
  }

  function inferNodeMeta(ctorName, label) {
    var ctor = String(ctorName || '');
    if (ctor === 'Document' || ctor === 'HTMLDocument') {
      return {
        nodeType: 9,
        nodeName: '#document',
        tagName: ''
      };
    }
    if (ctor === 'Text') {
      return { nodeType: 3, nodeName: '#text', tagName: '' };
    }
    if (ctor === 'Comment') {
      return { nodeType: 8, nodeName: '#comment', tagName: '' };
    }
    if (ctor === 'DocumentFragment') {
      return { nodeType: 11, nodeName: '#document-fragment', tagName: '' };
    }
    if (ctor === 'CharacterData') {
      return { nodeType: 3, nodeName: '#text', tagName: '' };
    }

    var tag = String(label || '').trim().toUpperCase();
    if (!tag) {
      if (ctor.indexOf('HTML') === 0 && ctor.indexOf('Element') > 4) {
        tag = ctor.slice(4, -7).toUpperCase();
      } else {
        tag = 'UNKNOWN';
      }
    }

    return {
      nodeType: 1,
      nodeName: tag,
      tagName: tag
    };
  }

  function ensureNodeState(node, defaults) {
    if (!node || (typeof node !== 'object' && typeof node !== 'function')) {
      throw new TypeError('DOM node must be an object');
    }

    var state = getState(node);
    if (!state) {
      state = {
        nodeType: 0,
        nodeName: '',
        tagName: '',
        parentNode: null,
        childNodes: [],
        ownerDocument: null,
        attributeStore: null,
        attributeNSStore: null,
        styleStore: null,
        styleObject: null,
        locationObject: null,
        textContent: '',
        layoutDirty: true,
        layoutRect: null,
        docId: 0,
        taskId: '',
        ownedNodes: null,
        isReleased: false,
        nodeRef: node,
        _listeners: null
      };
      setState(node, state);
    }

    if (defaults && typeof defaults === 'object') {
      var keys = Object.keys(defaults);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = defaults[key];
        if (value === undefined) {
          continue;
        }
        if (key === 'childNodes' && Array.isArray(value)) {
          state.childNodes = value.slice();
          continue;
        }
        state[key] = value;
      }
    }

    if (!state.nodeRef) {
      state.nodeRef = node;
    }

    return state;
  }

  function ensureDocumentState(node) {
    return ensureNodeState(node, {
      nodeType: 9,
      nodeName: '#document',
      tagName: '',
      ownerDocument: null
    });
  }

  function ensureDocumentRegistration(documentNode, taskId) {
    var state = ensureDocumentState(documentNode);
    if (state.docId && documentById.has(state.docId) && !state.isReleased) {
      return state;
    }
    registerDocumentState(documentNode, normalizeTaskId(taskId));
    state.isReleased = false;
    return state;
  }

  function ensureElementState(node, tagName, ownerDocument) {
    var existing = ensureNodeState(node);
    var inputTagRaw = String(tagName || '').trim();
    var inputTag = inputTagRaw.toUpperCase();
    var resolvedTag = inputTag || existing.tagName || existing.nodeName || 'UNKNOWN';
    var resolvedOwner = ownerDocument !== undefined ? ownerDocument : existing.ownerDocument;
    var resolvedLocalName = existing.localName || inputTagRaw.toLowerCase() || String(resolvedTag || '').toLowerCase();
    var state = ensureNodeState(node, {
      nodeType: 1,
      nodeName: existing.nodeName || resolvedTag,
      tagName: existing.tagName || resolvedTag,
      ownerDocument: resolvedOwner,
      namespaceURI: existing.namespaceURI || HTML_NAMESPACE,
      prefix: existing.prefix || null,
      localName: resolvedLocalName
    });
    if (resolvedOwner) {
      ensureDocumentRegistration(resolvedOwner);
      registerNodeInDocument(resolvedOwner, node);
    }
    return state;
  }

  function normalizeNamespaceURI(namespaceURI) {
    if (namespaceURI == null || namespaceURI === '') {
      return null;
    }
    return String(namespaceURI);
  }

  function parseQualifiedName(qualifiedName) {
    var raw = String(qualifiedName == null ? '' : qualifiedName).trim();
    if (!raw) {
      throw new Error('InvalidCharacterError');
    }
    var firstColon = raw.indexOf(':');
    var lastColon = raw.lastIndexOf(':');
    if (firstColon !== lastColon) {
      throw new Error('NamespaceError');
    }
    if (firstColon <= 0 || firstColon === raw.length - 1) {
      if (firstColon >= 0) {
        throw new Error('NamespaceError');
      }
      return { qualifiedName: raw, prefix: null, localName: raw };
    }
    return {
      qualifiedName: raw,
      prefix: raw.slice(0, firstColon),
      localName: raw.slice(firstColon + 1)
    };
  }

  function normalizeAttrName(name) {
    if (name == null) {
      return '';
    }
    return String(name).trim().toLowerCase();
  }

  function ensureAttributeStore(state) {
    if (!state.attributeStore) {
      state.attributeStore = {};
    }
    return state.attributeStore;
  }

  function ensureAttributeNSStore(state) {
    if (!state.attributeNSStore) {
      state.attributeNSStore = {};
    }
    return state.attributeNSStore;
  }

  function normalizeAttrLocalName(name) {
    return normalizeAttrName(name);
  }

  function buildAttrNSKey(namespaceURI, localName) {
    var nsKey = namespaceURI == null ? '' : String(namespaceURI);
    return nsKey + '\u001f' + String(localName == null ? '' : localName);
  }

  function setNodeAttributeNS(node, namespaceURI, qualifiedName, value) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1) {
      return;
    }
    var parsed = parseQualifiedName(qualifiedName);
    var normalizedNamespace = normalizeNamespaceURI(namespaceURI);
    if (parsed.prefix && !normalizedNamespace) {
      throw new Error('NamespaceError');
    }
    var normalizedName = normalizeAttrName(parsed.qualifiedName);
    if (!normalizedName) {
      return;
    }
    var localName = normalizedNamespace == null
      ? normalizeAttrLocalName(parsed.localName)
      : String(parsed.localName);
    if (!localName) {
      return;
    }
    var serialized = String(value == null ? '' : value);
    var attrStore = ensureAttributeStore(state);
    var attrNSStore = ensureAttributeNSStore(state);
    var nsKey = buildAttrNSKey(normalizedNamespace, localName);
    var oldRecord = attrNSStore[nsKey];
    if (oldRecord && oldRecord.name && oldRecord.name !== normalizedName) {
      delete attrStore[oldRecord.name];
    }
    var nsKeys = Object.keys(attrNSStore);
    for (var i = 0; i < nsKeys.length; i++) {
      var key = nsKeys[i];
      var record = attrNSStore[key];
      if (!record || key === nsKey) {
        continue;
      }
      if (record.name === normalizedName) {
        delete attrNSStore[key];
      }
    }

    attrStore[normalizedName] = serialized;
    attrNSStore[nsKey] = {
      namespaceURI: normalizedNamespace,
      prefix: parsed.prefix || null,
      localName: localName,
      name: normalizedName,
      value: serialized
    };

    if (normalizedNamespace == null && normalizedName === 'style') {
      ensureStyleObject(state).cssText = serialized;
    }
  }

  function setNodeAttribute(node, name, value) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1) {
      return;
    }
    var normalizedName = normalizeAttrName(name);
    if (!normalizedName) {
      return;
    }
    var localName = normalizeAttrLocalName(normalizedName);
    if (!localName) {
      return;
    }
    var serialized = String(value == null ? '' : value);
    var store = ensureAttributeStore(state);
    store[normalizedName] = serialized;
    var nsStore = ensureAttributeNSStore(state);
    var nullNsKey = buildAttrNSKey(null, localName);
    var existingKeys = Object.keys(nsStore);
    for (var i = 0; i < existingKeys.length; i++) {
      var key = existingKeys[i];
      if (key === nullNsKey) {
        continue;
      }
      if (nsStore[key] && nsStore[key].name === normalizedName) {
        delete nsStore[key];
      }
    }
    nsStore[nullNsKey] = {
      namespaceURI: null,
      prefix: null,
      localName: localName,
      name: normalizedName,
      value: serialized
    };
    if (normalizedName === 'style') {
      ensureStyleObject(state).cssText = serialized;
    }
  }

  function getNodeAttributeNS(node, namespaceURI, localName) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1 || !state.attributeNSStore) {
      return null;
    }
    var normalizedNamespace = normalizeNamespaceURI(namespaceURI);
    var normalizedLocalName = normalizedNamespace == null
      ? normalizeAttrLocalName(localName)
      : String(localName == null ? '' : localName);
    if (!normalizedLocalName) {
      return null;
    }
    var record = state.attributeNSStore[buildAttrNSKey(normalizedNamespace, normalizedLocalName)];
    return record ? record.value : null;
  }

  function getNodeAttribute(node, name) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1 || !state.attributeStore) {
      return null;
    }
    var normalizedName = normalizeAttrName(name);
    if (!normalizedName || !hasOwn.call(state.attributeStore, normalizedName)) {
      return null;
    }
    return state.attributeStore[normalizedName];
  }

  function hasNodeAttributeNS(node, namespaceURI, localName) {
    return getNodeAttributeNS(node, namespaceURI, localName) != null;
  }

  function hasNodeAttribute(node, name) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1 || !state.attributeStore) {
      return false;
    }
    var normalizedName = normalizeAttrName(name);
    if (!normalizedName) {
      return false;
    }
    return hasOwn.call(state.attributeStore, normalizedName);
  }

  function removeNodeAttributeNS(node, namespaceURI, localName) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1 || !state.attributeNSStore) {
      return;
    }
    var normalizedNamespace = normalizeNamespaceURI(namespaceURI);
    var normalizedLocalName = normalizedNamespace == null
      ? normalizeAttrLocalName(localName)
      : String(localName == null ? '' : localName);
    if (!normalizedLocalName) {
      return;
    }
    var nsKey = buildAttrNSKey(normalizedNamespace, normalizedLocalName);
    var record = state.attributeNSStore[nsKey];
    if (!record) {
      return;
    }
    delete state.attributeNSStore[nsKey];
    if (state.attributeStore && record.name) {
      delete state.attributeStore[record.name];
    }
    if (normalizedNamespace == null && record.name === 'style') {
      state.styleStore = {};
      markNodeDirty(state.nodeRef);
    }
  }

  function removeNodeAttribute(node, name) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1 || !state.attributeStore) {
      return;
    }
    var normalizedName = normalizeAttrName(name);
    if (!normalizedName || !hasOwn.call(state.attributeStore, normalizedName)) {
      return;
    }
    delete state.attributeStore[normalizedName];
    if (state.attributeNSStore) {
      var keys = Object.keys(state.attributeNSStore);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var record = state.attributeNSStore[key];
        if (record && record.name === normalizedName) {
          delete state.attributeNSStore[key];
        }
      }
    }
    if (normalizedName === 'style') {
      state.styleStore = {};
      markNodeDirty(state.nodeRef);
    }
  }

  function setNodeId(node, value) {
    setNodeAttribute(node, 'id', value);
  }

  function getNodeId(node) {
    var value = getNodeAttribute(node, 'id');
    return value == null ? '' : value;
  }

  function setNodeClassName(node, value) {
    setNodeAttribute(node, 'class', value);
  }

  function getNodeClassName(node) {
    var value = getNodeAttribute(node, 'class');
    return value == null ? '' : value;
  }

  function getNodeClassList(node) {
    var className = getNodeClassName(node);
    if (!className) {
      return [];
    }
    return className.split(/\s+/).filter(function (name) {
      return !!name;
    });
  }

  function createNodeList(children, resolver) {
    if (leapenv && typeof leapenv.createNodeListObject === 'function') {
      try { return leapenv.createNodeListObject(children, resolver); } catch (_) {}
    }
    var source = typeof resolver === 'function' ? (resolver() || []) : children;
    var list = Array.isArray(source) ? source.slice() : [];
    Object.defineProperty(list, 'item', {
      value: function item(index) {
        if (index < 0 || index >= list.length) {
          return null;
        }
        return list[index];
      },
      enumerable: false,
      configurable: true
    });
    return list;
  }

  function createHTMLCollection(children, resolver) {
    if (leapenv && typeof leapenv.createHTMLCollectionObject === 'function') {
      try { return leapenv.createHTMLCollectionObject(children, resolver); } catch (_) {}
    }
    var source = typeof resolver === 'function' ? (resolver() || []) : children;
    var list = Array.isArray(source) ? source.slice() : [];
    Object.defineProperty(list, 'item', {
      value: function item(index) {
        if (index < 0 || index >= list.length) {
          return null;
        }
        return list[index];
      },
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(list, 'namedItem', {
      value: function namedItem(name) {
        var target = String(name == null ? '' : name);
        if (!target) return null;
        for (var i = 0; i < list.length; i++) {
          var node = list[i];
          var id = null;
          var attrName = null;
          try { id = getNodeAttribute(node, 'id'); } catch (_) {}
          try { attrName = getNodeAttribute(node, 'name'); } catch (_) {}
          if (id === target || attrName === target) return node;
        }
        return null;
      },
      enumerable: false,
      configurable: true
    });
    return list;
  }

  function getElementChildren(node) {
    var state = ensureNodeState(node);
    var children = state.childNodes || [];
    var out = [];
    for (var i = 0; i < children.length; i++) {
      if (ensureNodeState(children[i]).nodeType === 1) {
        out.push(children[i]);
      }
    }
    return out;
  }

  function getSiblingAtOffset(node, offset) {
    var state = ensureNodeState(node);
    var parent = state.parentNode;
    if (!parent) {
      return null;
    }
    var siblings = ensureNodeState(parent).childNodes;
    var index = siblings.indexOf(node);
    if (index < 0) {
      return null;
    }
    var nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= siblings.length) {
      return null;
    }
    return siblings[nextIndex];
  }

  function getTextContent(node) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1 && state.nodeType !== 9) {
      return state.textContent || '';
    }

    var out = state.textContent || '';
    for (var i = 0; i < state.childNodes.length; i++) {
      out += getTextContent(state.childNodes[i]);
    }
    return out;
  }

  function setTextContent(node, value) {
    var state = ensureNodeState(node);
    state.textContent = String(value == null ? '' : value);

    if (state.nodeType === 1 || state.nodeType === 9) {
      var children = state.childNodes.slice();
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        ensureNodeState(child).parentNode = null;
      }
      state.childNodes = [];
      markNodeDirty(node);
    }
  }

  function detachFromParent(node) {
    var state = ensureNodeState(node);
    var parent = state.parentNode;
    if (!parent) {
      return;
    }
    var parentState = ensureNodeState(parent);
    var idx = parentState.childNodes.indexOf(node);
    if (idx >= 0) {
      parentState.childNodes.splice(idx, 1);
    }
    state.parentNode = null;
    markNodeDirty(parent);
  }

  function isAncestor(ancestor, target) {
    var cur = target;
    while (cur) {
      if (cur === ancestor) {
        return true;
      }
      cur = ensureNodeState(cur).parentNode;
    }
    return false;
  }

  function isParentNodeTypeInsertable(nodeType) {
    return nodeType === 9 || nodeType === 11 || nodeType === 1;
  }

  function isAllowedChildNodeType(parentType, childType) {
    if (parentType === 9) {
      // Keep a minimal subset for compatibility: document accepts element/comment/fragment.
      return childType === 1 || childType === 8 || childType === 11;
    }
    if (parentType === 1 || parentType === 11) {
      return childType === 1 || childType === 3 || childType === 8 || childType === 11;
    }
    return false;
  }

  function countDocumentHtmlChildrenExcluding(documentNode, excludeNodeSet) {
    var docChildren = ensureNodeState(documentNode).childNodes || [];
    var count = 0;
    for (var i = 0; i < docChildren.length; i++) {
      var child = docChildren[i];
      if (excludeNodeSet && excludeNodeSet.has(child)) {
        continue;
      }
      var childState = ensureNodeState(child);
      if (childState.nodeType === 1 &&
          String(childState.localName || childState.tagName || '').toLowerCase() === 'html') {
        count++;
      }
    }
    return count;
  }

  function collectFragmentChildren(fragmentNode) {
    return ensureNodeState(fragmentNode).childNodes.slice();
  }

  function validateDocumentInsert(parent, child, beforeNode) {
    var parentState = ensureNodeState(parent);
    if (parentState.nodeType !== 9) {
      return;
    }

    var childState = ensureNodeState(child);
    if (childState.nodeType === 3) {
      throw new Error('HierarchyRequestError');
    }
    if (childState.nodeType !== 1 && childState.nodeType !== 8 && childState.nodeType !== 11) {
      throw new Error('HierarchyRequestError');
    }

    if (!beforeNode) {
      return;
    }
    var beforeState = ensureNodeState(beforeNode);
    if (beforeState.nodeType === 3) {
      throw new Error('HierarchyRequestError');
    }
  }

  function validateInsertion(parent, child, beforeNode) {
    var parentState = ensureNodeState(parent);
    var childState = ensureNodeState(child);

    if (!isParentNodeTypeInsertable(parentState.nodeType)) {
      throw new Error('HierarchyRequestError');
    }
    if (!isAllowedChildNodeType(parentState.nodeType, childState.nodeType)) {
      throw new Error('HierarchyRequestError');
    }
    if (parentState.nodeType === 9) {
      validateDocumentInsert(parent, child, beforeNode || null);
      if (childState.nodeType === 1) {
        var childLocalName = String(childState.localName || childState.tagName || '').toLowerCase();
        if (childLocalName === 'html') {
          var exclude = new Set();
          if (childState.parentNode === parent) {
            exclude.add(child);
          }
          var existingHtmlCount = countDocumentHtmlChildrenExcluding(parent, exclude);
          if (existingHtmlCount >= 1) {
            throw new Error('HierarchyRequestError');
          }
        }
      }
      if (childState.nodeType === 11) {
        var fragChildren = collectFragmentChildren(child);
        var fragHtmlElements = 0;
        var movedWithinSameDoc = new Set();
        for (var fi = 0; fi < fragChildren.length; fi++) {
          var fragChildState = ensureNodeState(fragChildren[fi]);
          if (!isAllowedChildNodeType(9, fragChildState.nodeType)) {
            throw new Error('HierarchyRequestError');
          }
          if (fragChildState.nodeType === 3) {
            throw new Error('HierarchyRequestError');
          }
          if (fragChildState.nodeType === 1 &&
              String(fragChildState.localName || fragChildState.tagName || '').toLowerCase() === 'html') {
            fragHtmlElements++;
          }
          if (fragChildState.parentNode === parent) {
            movedWithinSameDoc.add(fragChildren[fi]);
          }
        }
        var existing = countDocumentHtmlChildrenExcluding(parent, movedWithinSameDoc);
        if (existing + fragHtmlElements > 1) {
          throw new Error('HierarchyRequestError');
        }
      }
    }
  }

  function appendChild(parent, child) {
    if (!child || (typeof child !== 'object' && typeof child !== 'function')) {
      throw new TypeError('appendChild expects a node object');
    }
    if (parent === child) {
      throw new Error('HierarchyRequestError');
    }
    // DocumentFragment: 将其所有子节点依次插入 parent
    var childState0 = ensureNodeState(child);
    validateInsertion(parent, child, null);
    if (childState0.nodeType === 11) {
      var fragChildren = childState0.childNodes.slice();
      for (var fi = 0; fi < fragChildren.length; fi++) {
        appendChild(parent, fragChildren[fi]);
      }
      return child;
    }
    if (isAncestor(child, parent)) {
      throw new Error('HierarchyRequestError');
    }

    var parentState = ensureNodeState(parent);
    var childState = ensureNodeState(child);
    var oldParent = childState.parentNode || null;
    var nextOwner = null;
    if (parentState.nodeType === 9) {
      nextOwner = parent;
      ensureDocumentRegistration(parent);
    } else if (parentState.ownerDocument) {
      nextOwner = parentState.ownerDocument;
      ensureDocumentRegistration(parentState.ownerDocument);
    }

    detachFromParent(child);
    parentState.childNodes.push(child);
    childState.parentNode = parent;
    adoptOwnerDocument(child, nextOwner);
    markNodeDirty(parent);

    return child;
  }

  function removeChild(parent, child) {
    var parentState = ensureNodeState(parent);
    var idx = parentState.childNodes.indexOf(child);
    if (idx < 0) {
      throw new Error('NotFoundError');
    }

    parentState.childNodes.splice(idx, 1);
    ensureNodeState(child).parentNode = null;
    markNodeDirty(parent);
    return child;
  }

  function insertBefore(parent, child, beforeNode) {
    if (!beforeNode) {
      return appendChild(parent, child);
    }
    var parentState = ensureNodeState(parent);
    var beforeIndex = parentState.childNodes.indexOf(beforeNode);
    if (beforeIndex < 0) {
      throw new Error('NotFoundError');
    }
    if (parent === child || isAncestor(child, parent)) {
      throw new Error('HierarchyRequestError');
    }
    validateInsertion(parent, child, beforeNode);
    // DocumentFragment: 将其所有子节点依次插入 beforeNode 之前
    var childState0 = ensureNodeState(child);
    if (childState0.nodeType === 11) {
      var fragChildren = childState0.childNodes.slice();
      for (var fi = 0; fi < fragChildren.length; fi++) {
        insertBefore(parent, fragChildren[fi], beforeNode);
      }
      return child;
    }

    detachFromParent(child);
    parentState.childNodes.splice(beforeIndex, 0, child);
    var childState = ensureNodeState(child);
    childState.parentNode = parent;
    var nextOwner = null;
    if (parentState.nodeType === 9) {
      nextOwner = parent;
      ensureDocumentRegistration(parent);
    } else if (parentState.ownerDocument) {
      nextOwner = parentState.ownerDocument;
      ensureDocumentRegistration(parentState.ownerDocument);
    }
    adoptOwnerDocument(child, nextOwner);
    markNodeDirty(parent);
    return child;
  }

  function parsePixels(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    if (typeof value !== 'string') {
      return 0;
    }
    var trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }
    var matched = trimmed.match(/^(-?\d+(\.\d+)?)(px)?$/i);
    if (!matched) {
      return 0;
    }
    var parsed = Number.parseFloat(matched[1]);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, parsed);
  }

  function normalizeTaskId(taskId) {
    if (taskId == null || taskId === '') {
      return currentTaskId || 'task-default';
    }
    return String(taskId);
  }

  function registerDocumentState(documentNode, taskId) {
    var state = ensureDocumentState(documentNode);
    if (state.docId && documentById.has(state.docId) && !state.isReleased) {
      return state.docId;
    }

    state.docId = ++docSeq;
    state.taskId = normalizeTaskId(taskId || currentTaskId);
    state.ownedNodes = new Set();
    state.isReleased = false;
    state.layoutDirty = true;
    state.layoutRect = null;
    state.parentNode = null;
    state.nativeDocId = 0;
    state._defaultTreeInitialized = false;
    if (!state.url) {
      state.url = 'about:blank';
    }

    documentById.set(state.docId, documentNode);
    var docSet = taskToDocs.get(state.taskId);
    if (!docSet) {
      docSet = new Set();
      taskToDocs.set(state.taskId, docSet);
    }
    docSet.add(state.docId);
    taskPrimaryDocument.set(state.taskId, documentNode);
    return state.docId;
  }

  function registerNodeInDocument(documentNode, node) {
    if (!documentNode || !node || node === documentNode) {
      return;
    }
    var documentState = ensureDocumentRegistration(documentNode);
    if (!documentState.ownedNodes) {
      documentState.ownedNodes = new Set();
    }
    documentState.ownedNodes.add(node);
  }

  function unregisterNodeFromDocument(documentNode, node) {
    if (!documentNode || !node || node === documentNode) {
      return;
    }
    var documentState = ensureDocumentState(documentNode);
    if (!documentState.ownedNodes) {
      return;
    }
    documentState.ownedNodes.delete(node);
  }

  function adoptOwnerDocument(node, ownerDocument) {
    var stack = [node];
    while (stack.length > 0) {
      var cur = stack.pop();
      var curState = ensureNodeState(cur);
      var oldOwner = curState.ownerDocument || null;
      if (oldOwner && oldOwner !== ownerDocument) {
        unregisterNodeFromDocument(oldOwner, cur);
      }
      curState.ownerDocument = ownerDocument || null;
      if (ownerDocument) {
        registerNodeInDocument(ownerDocument, cur);
      }
      var children = curState.childNodes;
      for (var i = 0; i < children.length; i++) {
        stack.push(children[i]);
      }
      curState.layoutDirty = true;
      curState.layoutRect = null;
      curState.isReleased = false;
    }
  }

  function splitSelectorGroups(selectorText) {
    if (selectorText == null) {
      return [];
    }
    var raw = String(selectorText).trim();
    if (!raw) {
      return [];
    }
    var groups = [];
    var current = '';
    var bracketDepth = 0;
    var parenDepth = 0;
    var quote = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (quote) {
        current += ch;
        if (ch === quote) {
          quote = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === '[') {
        bracketDepth++;
        current += ch;
        continue;
      }
      if (ch === ']') {
        if (bracketDepth > 0) {
          bracketDepth--;
        }
        current += ch;
        continue;
      }
      if (ch === '(') {
        parenDepth++;
        current += ch;
        continue;
      }
      if (ch === ')') {
        if (parenDepth > 0) {
          parenDepth--;
        }
        current += ch;
        continue;
      }
      if (ch === ',' && bracketDepth === 0 && parenDepth === 0) {
        var part = current.trim();
        if (part) {
          groups.push(part);
        }
        current = '';
        continue;
      }
      current += ch;
    }
    var tail = current.trim();
    if (tail) {
      groups.push(tail);
    }
    return groups;
  }

  function parseSelectorToken(rawToken) {
    var token = String(rawToken || '').trim();
    if (!token) {
      return null;
    }

    var out = {
      tag: '',
      id: '',
      classes: [],
      attrs: [],
      pseudos: []
    };

    var parseError = false;

    var attrRegex = /\[([^\]=~|^$*\s]+)\s*(?:(~=|\|=|\^=|\$=|\*=|=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(?:([iIsS]))?)?\]/g;
    token = token.replace(attrRegex, function (_all, name, op, v1, v2, v3, flag) {
      if (parseError) {
        return '';
      }
      var normalizedName = normalizeAttrName(name);
      if (!normalizedName) {
        parseError = true;
        return '';
      }
      out.attrs.push({
        name: normalizedName,
        op: op || null,
        value: v1 != null ? v1 : (v2 != null ? v2 : (v3 != null ? v3 : null)),
        flag: flag ? String(flag).toLowerCase() : ''
      });
      return '';
    });
    if (parseError) {
      return null;
    }

    var pseudoRegex = /:([A-Za-z-]+)(?:\(([^()]*)\))?/g;
    token = token.replace(pseudoRegex, function (_all, pseudoName, pseudoArg) {
      if (parseError) {
        return '';
      }
      var name = String(pseudoName || '').toLowerCase();
      if (!name) {
        parseError = true;
        return '';
      }
      if (name === 'first-child' || name === 'last-child' || name === 'only-child' || name === 'empty' || name === 'scope') {
        if (pseudoArg != null) {
          parseError = true;
          return '';
        }
        out.pseudos.push({ name: name });
        return '';
      }
      if (name === 'nth-child' || name === 'nth-of-type') {
        if (pseudoArg == null) {
          parseError = true;
          return '';
        }
        out.pseudos.push({ name: name, arg: String(pseudoArg) });
        return '';
      }
      if (name === 'not') {
        if (pseudoArg == null) {
          parseError = true;
          return '';
        }
        var notGroups = splitSelectorGroups(pseudoArg);
        if (!notGroups.length) {
          parseError = true;
          return '';
        }
        var notTokens = [];
        for (var gi = 0; gi < notGroups.length; gi++) {
          var group = parseSelectorGroup(notGroups[gi]);
          if (!group || group.length !== 1 || group[0].combinator != null) {
            parseError = true;
            return '';
          }
          notTokens.push(group[0].token);
        }
        out.pseudos.push({ name: name, tokens: notTokens });
        return '';
      }
      parseError = true;
      return '';
    });
    if (parseError) {
      return null;
    }

    var idRegex = /#([A-Za-z0-9_-]+)/g;
    token = token.replace(idRegex, function (_all, value) {
      if (!out.id) {
        out.id = value;
      }
      return '';
    });

    var classRegex = /\.([A-Za-z0-9_-]+)/g;
    token = token.replace(classRegex, function (_all, value) {
      out.classes.push(value);
      return '';
    });

    var left = token.trim();
    if (left && left !== '*') {
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(left)) {
        return null;
      }
      out.tag = left.toLowerCase();
    } else if (left === '*') {
      out.tag = '*';
    }

    return out;
  }

  function parseSelectorGroup(groupText) {
    var text = String(groupText || '').trim();
    if (!text) {
      return null;
    }

    // 解析为 left-to-right 选择器步骤：
    // [{ token, combinator }]，combinator 表示“前一项到当前项”的关系。
    var steps = [];
    var buf = '';
    var bracketDepth = 0;
    var parenDepth = 0;
    var quote = '';
    var pendingCombinator = null;

    function flushToken() {
      var rawToken = buf.trim();
      if (!rawToken) {
        return false;
      }
      var parsedToken = parseSelectorToken(rawToken);
      if (!parsedToken) {
        return null;
      }
      if (steps.length === 0) {
        if (pendingCombinator != null) {
          return null;
        }
        steps.push({ token: parsedToken, combinator: null });
      } else {
        steps.push({ token: parsedToken, combinator: pendingCombinator || ' ' });
      }
      buf = '';
      pendingCombinator = null;
      return true;
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);

      if (quote) {
        buf += ch;
        if (ch === quote) {
          quote = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        buf += ch;
        continue;
      }
      if (ch === '[') {
        bracketDepth++;
        buf += ch;
        continue;
      }
      if (ch === ']') {
        if (bracketDepth > 0) {
          bracketDepth--;
        }
        buf += ch;
        continue;
      }
      if (ch === '(') {
        parenDepth++;
        buf += ch;
        continue;
      }
      if (ch === ')') {
        if (parenDepth > 0) {
          parenDepth--;
        }
        buf += ch;
        continue;
      }

      if (bracketDepth === 0 && parenDepth === 0) {
        if (ch === '>' || ch === '+' || ch === '~') {
          if (buf.trim()) {
            var ok1 = flushToken();
            if (!ok1) {
              return null;
            }
          } else if (steps.length === 0) {
            return null;
          }
          pendingCombinator = ch;
          continue;
        }
        if (/\s/.test(ch)) {
          if (buf.trim()) {
            var ok2 = flushToken();
            if (!ok2) {
              return null;
            }
            if (pendingCombinator == null && steps.length > 0) {
              pendingCombinator = ' ';
            }
          } else if (pendingCombinator == null && steps.length > 0) {
            pendingCombinator = ' ';
          }
          continue;
        }
      }

      buf += ch;
    }

    if (quote || bracketDepth !== 0 || parenDepth !== 0) {
      return null;
    }
    if (buf.trim()) {
      var ok3 = flushToken();
      if (!ok3) {
        return null;
      }
    } else if (pendingCombinator != null) {
      return null;
    }
    if (steps.length === 0) {
      return null;
    }
    return steps;
  }

  function collectElementDescendants(rootNode, includeRoot) {
    var results = [];
    var stack = [];
    if (includeRoot) {
      stack.push(rootNode);
    } else {
      var rootState = ensureNodeState(rootNode);
      for (var i = rootState.childNodes.length - 1; i >= 0; i--) {
        stack.push(rootState.childNodes[i]);
      }
    }

    while (stack.length > 0) {
      var cur = stack.pop();
      var curState = ensureNodeState(cur);
      if (curState.nodeType === 1) {
        results.push(cur);
      }
      var children = curState.childNodes;
      for (var j = children.length - 1; j >= 0; j--) {
        stack.push(children[j]);
      }
    }

    return results;
  }

  function getNextElementSibling(node) {
    var state = ensureNodeState(node);
    var parent = state.parentNode;
    if (!parent) {
      return null;
    }
    var siblings = ensureNodeState(parent).childNodes || [];
    var idx = siblings.indexOf(node);
    if (idx < 0 || idx >= siblings.length - 1) {
      return null;
    }
    for (var i = idx + 1; i < siblings.length; i++) {
      if (ensureNodeState(siblings[i]).nodeType === 1) {
        return siblings[i];
      }
    }
    return null;
  }

  function getElementIndexInParent(node, sameTagOnly) {
    var state = ensureNodeState(node);
    var parent = state.parentNode;
    if (!parent) {
      return 0;
    }
    var siblings = ensureNodeState(parent).childNodes || [];
    var targetTag = String(state.tagName || '').toLowerCase();
    var index = 0;
    for (var i = 0; i < siblings.length; i++) {
      var siblingState = ensureNodeState(siblings[i]);
      if (siblingState.nodeType !== 1) {
        continue;
      }
      if (sameTagOnly && String(siblingState.tagName || '').toLowerCase() !== targetTag) {
        continue;
      }
      index++;
      if (siblings[i] === node) {
        return index;
      }
    }
    return 0;
  }

  function matchesNthExpression(exprText, index) {
    var expr = String(exprText == null ? '' : exprText).replace(/\s+/g, '').toLowerCase();
    if (!expr || index <= 0) {
      return false;
    }
    if (expr === 'odd') {
      return index % 2 === 1;
    }
    if (expr === 'even') {
      return index % 2 === 0;
    }
    if (/^[+-]?\d+$/.test(expr)) {
      return index === Number(expr);
    }
    var match = expr.match(/^([+-]?\d*)n([+-]\d+)?$/);
    if (!match) {
      return false;
    }
    var aRaw = match[1];
    var bRaw = match[2];
    var a = 0;
    if (aRaw === '' || aRaw === '+') {
      a = 1;
    } else if (aRaw === '-') {
      a = -1;
    } else {
      a = Number(aRaw);
    }
    var b = bRaw ? Number(bRaw) : 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return false;
    }
    if (a === 0) {
      return index === b;
    }
    var n = (index - b) / a;
    return n >= 0 && Math.floor(n) === n;
  }

  function matchesSelectorAttribute(actualValue, attr) {
    if (!attr) {
      return true;
    }
    var op = attr.op || null;
    if (op == null) {
      return actualValue != null;
    }
    if (actualValue == null) {
      return false;
    }
    var expected = String(attr.value == null ? '' : attr.value);
    var got = String(actualValue);
    var flag = attr.flag || '';
    if (flag === 'i') {
      expected = expected.toLowerCase();
      got = got.toLowerCase();
    }
    if (op === '=') {
      return got === expected;
    }
    if (op === '^=') {
      return expected !== '' && got.indexOf(expected) === 0;
    }
    if (op === '$=') {
      return expected !== '' && got.slice(-expected.length) === expected;
    }
    if (op === '*=') {
      return expected !== '' && got.indexOf(expected) >= 0;
    }
    if (op === '~=') {
      if (!expected) {
        return false;
      }
      return got.split(/\s+/).indexOf(expected) >= 0;
    }
    if (op === '|=') {
      if (!expected) {
        return false;
      }
      return got === expected || got.indexOf(expected + '-') === 0;
    }
    return false;
  }

  function matchesSelectorPseudo(node, pseudo, scopeNode) {
    if (!pseudo || !pseudo.name) {
      return true;
    }
    if (pseudo.name === 'first-child') {
      return getPreviousElementSibling(node) == null;
    }
    if (pseudo.name === 'last-child') {
      return getNextElementSibling(node) == null;
    }
    if (pseudo.name === 'only-child') {
      return getPreviousElementSibling(node) == null && getNextElementSibling(node) == null;
    }
    if (pseudo.name === 'empty') {
      var children = ensureNodeState(node).childNodes || [];
      for (var i = 0; i < children.length; i++) {
        var childState = ensureNodeState(children[i]);
        if (childState.nodeType === 1 || childState.nodeType === 3) {
          return false;
        }
      }
      return true;
    }
    if (pseudo.name === 'scope') {
      return !!scopeNode && node === scopeNode;
    }
    if (pseudo.name === 'nth-child') {
      return matchesNthExpression(pseudo.arg, getElementIndexInParent(node, false));
    }
    if (pseudo.name === 'nth-of-type') {
      return matchesNthExpression(pseudo.arg, getElementIndexInParent(node, true));
    }
    if (pseudo.name === 'not') {
      var notTokens = pseudo.tokens || [];
      for (var j = 0; j < notTokens.length; j++) {
        if (matchesSelectorToken(node, notTokens[j], scopeNode)) {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  function matchesSelectorToken(node, token, scopeNode) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1) {
      return false;
    }

    if (token.tag && token.tag !== '*' && token.tag !== String(state.tagName || '').toLowerCase()) {
      return false;
    }

    if (token.id) {
      var nodeId = getNodeId(node);
      if (nodeId !== token.id) {
        return false;
      }
    }

    if (token.classes && token.classes.length > 0) {
      var classes = getNodeClassList(node);
      for (var i = 0; i < token.classes.length; i++) {
        if (classes.indexOf(token.classes[i]) < 0) {
          return false;
        }
      }
    }

    if (token.attrs && token.attrs.length > 0) {
      for (var j = 0; j < token.attrs.length; j++) {
        var attr = token.attrs[j];
        var value = getNodeAttribute(node, attr.name);
        if (!matchesSelectorAttribute(value, attr)) {
          return false;
        }
      }
    }

    if (token.pseudos && token.pseudos.length > 0) {
      for (var k = 0; k < token.pseudos.length; k++) {
        if (!matchesSelectorPseudo(node, token.pseudos[k], scopeNode || null)) {
          return false;
        }
      }
    }

    return true;
  }

  function getPreviousElementSibling(node) {
    var state = ensureNodeState(node);
    var parent = state.parentNode;
    if (!parent) {
      return null;
    }
    var siblings = ensureNodeState(parent).childNodes || [];
    var idx = siblings.indexOf(node);
    if (idx <= 0) {
      return null;
    }
    for (var i = idx - 1; i >= 0; i--) {
      if (ensureNodeState(siblings[i]).nodeType === 1) {
        return siblings[i];
      }
    }
    return null;
  }

  function matchesSelectorChain(node, chainSteps, scopeNode) {
    if (!chainSteps || chainSteps.length === 0) {
      return false;
    }

    var last = chainSteps[chainSteps.length - 1];
    if (!last || !matchesSelectorToken(node, last.token, scopeNode || null)) {
      return false;
    }

    var current = node;
    for (var i = chainSteps.length - 1; i > 0; i--) {
      var combinator = chainSteps[i].combinator || ' ';
      var need = chainSteps[i - 1].token;

      if (combinator === ' ') {
        var ancestor = ensureNodeState(current).parentNode;
        var foundAncestor = null;
        while (ancestor) {
          if (matchesSelectorToken(ancestor, need, scopeNode || null)) {
            foundAncestor = ancestor;
            break;
          }
          ancestor = ensureNodeState(ancestor).parentNode;
        }
        if (!foundAncestor) {
          return false;
        }
        current = foundAncestor;
      } else if (combinator === '>') {
        var parent = ensureNodeState(current).parentNode;
        if (!parent || !matchesSelectorToken(parent, need, scopeNode || null)) {
          return false;
        }
        current = parent;
      } else if (combinator === '+') {
        var prev = getPreviousElementSibling(current);
        if (!prev || !matchesSelectorToken(prev, need, scopeNode || null)) {
          return false;
        }
        current = prev;
      } else if (combinator === '~') {
        var sibling = getPreviousElementSibling(current);
        var foundSibling = null;
        while (sibling) {
          if (matchesSelectorToken(sibling, need, scopeNode || null)) {
            foundSibling = sibling;
            break;
          }
          sibling = getPreviousElementSibling(sibling);
        }
        if (!foundSibling) {
          return false;
        }
        current = foundSibling;
      } else {
        return false;
      }
    }

    return true;
  }

  function querySelectorAll(rootNode, selectorText, includeRoot) {
    var groups = splitSelectorGroups(selectorText);
    if (groups.length === 0) {
      return [];
    }

    var chains = [];
    for (var i = 0; i < groups.length; i++) {
      var chain = parseSelectorGroup(groups[i]);
      if (chain && chain.length > 0) {
        chains.push(chain);
      }
    }
    if (chains.length === 0) {
      return [];
    }

    var candidates = collectElementDescendants(rootNode, !!includeRoot);
    var output = [];
    for (var j = 0; j < candidates.length; j++) {
      var cur = candidates[j];
      for (var k = 0; k < chains.length; k++) {
        if (matchesSelectorChain(cur, chains[k], rootNode)) {
          output.push(cur);
          break;
        }
      }
    }
    return output;
  }

  function querySelector(rootNode, selectorText, includeRoot) {
    var list = querySelectorAll(rootNode, selectorText, includeRoot);
    return list.length > 0 ? list[0] : null;
  }

  function getElementsByTagName(rootNode, tagName, includeRoot) {
    var target = String(tagName == null ? '*' : tagName).trim().toLowerCase();
    if (!target) {
      target = '*';
    }
    var list = collectElementDescendants(rootNode, !!includeRoot);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      var nodeTag = String(ensureNodeState(node).tagName || '').toLowerCase();
      if (target === '*' || target === nodeTag) {
        out.push(node);
      }
    }
    return out;
  }

  function getElementsByClassName(rootNode, classNameText, includeRoot) {
    var classes = String(classNameText == null ? '' : classNameText).trim().split(/\s+/).filter(function (item) {
      return !!item;
    });
    if (classes.length === 0) {
      return [];
    }

    var list = collectElementDescendants(rootNode, !!includeRoot);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var node = list[i];
      var nodeClasses = getNodeClassList(node);
      var matched = true;
      for (var j = 0; j < classes.length; j++) {
        if (nodeClasses.indexOf(classes[j]) < 0) {
          matched = false;
          break;
        }
      }
      if (matched) {
        out.push(node);
      }
    }
    return out;
  }

  function getElementById(rootNode, idValue) {
    var target = String(idValue == null ? '' : idValue);
    if (!target) {
      return null;
    }
    var list = collectElementDescendants(rootNode, false);
    for (var i = 0; i < list.length; i++) {
      if (getNodeId(list[i]) === target) {
        return list[i];
      }
    }
    return null;
  }

  function getDocumentElement(documentNode) {
    var docState = ensureDocumentState(documentNode);
    var firstElement = null;
    for (var i = 0; i < docState.childNodes.length; i++) {
      var child = docState.childNodes[i];
      var childState = ensureNodeState(child);
      if (childState.nodeType === 1) {
        if (!firstElement) {
          firstElement = child;
        }
        if (String(childState.localName || childState.tagName || '').toLowerCase() === 'html') {
          return child;
        }
      }
    }
    return firstElement;
  }

  function getDocumentHead(documentNode) {
    return querySelector(documentNode, 'head', false);
  }

  function getDocumentBody(documentNode) {
    return querySelector(documentNode, 'body', false);
  }

  function ensureDocumentDefaultTree(documentNode) {
    var docState = ensureDocumentRegistration(documentNode);
    var html = getDocumentElement(documentNode);
    var head = null;
    var body = null;

    if (!html) {
      html = createElementForDocument(documentNode, 'html');
      appendChild(documentNode, html);
    }

    head = querySelector(html, 'head', false);
    body = querySelector(html, 'body', false);

    if (!head) {
      head = createElementForDocument(documentNode, 'head');
      if (body) {
        insertBefore(html, head, body);
      } else {
        appendChild(html, head);
      }
    }

    if (!body) {
      body = createElementForDocument(documentNode, 'body');
      appendChild(html, body);
    }

    docState._defaultTreeInitialized = true;
    return documentNode;
  }

  function setDocumentUrl(documentNode, href) {
    var state = ensureDocumentRegistration(documentNode);
    state.url = String(href == null || href === '' ? 'about:blank' : href);
    return state.url;
  }

  function getDocumentUrl(documentNode) {
    var state = ensureDocumentRegistration(documentNode);
    if (!state.url) {
      state.url = 'about:blank';
    }
    return state.url;
  }

  function clearDocumentChildren(documentNode) {
    var docState = ensureDocumentRegistration(documentNode);

    var oldChildren = docState.childNodes.slice();
    docState.childNodes = [];
    docState.ownedNodes = new Set();
    for (var i = 0; i < oldChildren.length; i++) {
      detachSubtreeFromDocument(oldChildren[i], documentNode);
    }
    markNodeDirty(documentNode);
  }

  function detachSubtreeFromDocument(rootNode, documentNode) {
    var stack = [rootNode];
    while (stack.length > 0) {
      var cur = stack.pop();
      var state = ensureNodeState(cur);
      if (state.ownerDocument === documentNode) {
        state.ownerDocument = null;
      }
      state.parentNode = null;
      unregisterNodeFromDocument(documentNode, cur);
      for (var i = 0; i < state.childNodes.length; i++) {
        stack.push(state.childNodes[i]);
      }
    }
  }

  function createElementNSForDocument(documentNode, namespaceURI, qualifiedName) {
    var docState = documentNode ? ensureNodeState(documentNode) : null;
    var ownerDocument = null;
    if (docState) {
      ownerDocument = docState.nodeType === 9 ? documentNode : (docState.ownerDocument || null);
    }
    var parsed = parseQualifiedName(qualifiedName);
    var normalizedNamespace = normalizeNamespaceURI(namespaceURI);
    if (parsed.prefix && !normalizedNamespace) {
      throw new Error('NamespaceError');
    }
    var effectiveNamespace = normalizedNamespace || HTML_NAMESPACE;
    var isHtmlNamespace = effectiveNamespace === HTML_NAMESPACE;
    var localNameNormalized = parsed.localName.toLowerCase();
    var ctorName = 'Element';
    if (isHtmlNamespace) {
      ctorName = typeof tools.getConstructorName === 'function'
        ? tools.getConstructorName(localNameNormalized)
        : 'HTMLUnknownElement';
    }
    var createLabel = isHtmlNamespace ? localNameNormalized : parsed.qualifiedName;
    var node = createNodeObject(ctorName, createLabel, null);
    var initialTag = isHtmlNamespace ? localNameNormalized : parsed.qualifiedName;
    var state = ensureElementState(node, initialTag, ownerDocument);
    state.namespaceURI = effectiveNamespace;
    state.prefix = parsed.prefix;
    state.localName = isHtmlNamespace ? localNameNormalized : parsed.localName;
    if (isHtmlNamespace) {
      state.tagName = localNameNormalized.toUpperCase();
      state.nodeName = state.tagName;
    } else {
      state.tagName = parsed.qualifiedName;
      state.nodeName = parsed.qualifiedName;
    }
    return node;
  }

  function createElementForDocument(documentNode, tagName) {
    var normalizedTag = String(tagName == null ? '' : tagName).trim().toLowerCase();
    if (!normalizedTag) {
      normalizedTag = 'unknown';
    }
    return createElementNSForDocument(documentNode, HTML_NAMESPACE, normalizedTag);
  }

  function parseAttributesIntoNode(node, sourceText) {
    if (!sourceText) {
      return;
    }
    var attrRegex = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;
    var match = null;
    while ((match = attrRegex.exec(sourceText)) !== null) {
      var name = match[1];
      var value = match[2] != null ? match[2] : (match[3] != null ? match[3] : (match[4] != null ? match[4] : ''));
      setNodeAttribute(node, name, value);
    }
  }

  function parseHTMLIntoDocument(documentNode, htmlText) {
    ensureDocumentRegistration(documentNode);
    clearDocumentChildren(documentNode);

    var html = String(htmlText == null ? '' : htmlText);
    if (!html.trim()) {
      return documentNode;
    }

    var stack = [documentNode];
    var voidTags = {
      area: true, base: true, br: true, col: true, embed: true, hr: true,
      img: true, input: true, link: true, meta: true, param: true,
      source: true, track: true, wbr: true
    };
    var tokenRegex = /<!--[\s\S]*?-->|<!DOCTYPE[\s\S]*?>|<\/?[A-Za-z][^>]*>|[^<]+/gi;
    var tokenMatch = null;
    while ((tokenMatch = tokenRegex.exec(html)) !== null) {
      var token = tokenMatch[0];
      if (!token) {
        continue;
      }
      if (token.indexOf('<!--') === 0 || /^<!DOCTYPE/i.test(token)) {
        continue;
      }
      if (token.charAt(0) !== '<') {
        continue;
      }

      if (token.indexOf('</') === 0) {
        var closeMatch = token.match(/^<\s*\/\s*([^\s>\/]+)/);
        if (!closeMatch) {
          continue;
        }
        var closingTag = String(closeMatch[1]).toUpperCase();
        for (var i = stack.length - 1; i > 0; i--) {
          var openNode = stack[i];
          if (String(ensureNodeState(openNode).tagName || '').toUpperCase() === closingTag) {
            stack.length = i;
            break;
          }
        }
        continue;
      }

      var openMatch = token.match(/^<\s*([^\s>\/]+)\s*([^>]*)>/);
      if (!openMatch) {
        continue;
      }
      var tagName = openMatch[1];
      var attrChunk = openMatch[2] || '';
      var isSelfClosing = /\/\s*>$/.test(token) || !!voidTags[String(tagName).toLowerCase()];
      if (isSelfClosing) {
        attrChunk = attrChunk.replace(/\/\s*$/, '');
      }

      var parentNode = stack[stack.length - 1];
      var elementNode = createElementForDocument(documentNode, tagName);
      parseAttributesIntoNode(elementNode, attrChunk);
      appendChild(parentNode, elementNode);

      if (!isSelfClosing) {
        stack.push(elementNode);
      }
    }

    return documentNode;
  }

  // ── HTML 序列化工具 ─────────────────────────────────────────────────────────

  var VOID_TAGS = {
    area:true, base:true, br:true, col:true, embed:true, hr:true,
    img:true, input:true, link:true, meta:true, param:true,
    source:true, track:true, wbr:true
  };

  function escapeHTML(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function serializeNode(node) {
    var state = ensureNodeState(node);
    var nt = state.nodeType;
    if (nt === 3) { return escapeHTML(state.textContent || ''); }
    if (nt === 8) { return '<!--' + (state.textContent || '') + '-->'; }
    if (nt === 11) { return serializeChildren(node); }
    if (nt !== 1) { return ''; }
    var rawTag = String(state.tagName || state.nodeName || 'UNKNOWN');
    var tag = state.namespaceURI && state.namespaceURI !== HTML_NAMESPACE
      ? rawTag
      : rawTag.toLowerCase();
    var out = '<' + tag;
    if (state.attributeStore) {
      var attrKeys = Object.keys(state.attributeStore);
      for (var ai = 0; ai < attrKeys.length; ai++) {
        out += ' ' + attrKeys[ai] + '="' + escapeAttr(state.attributeStore[attrKeys[ai]]) + '"';
      }
    }
    if (state.styleStore && Object.keys(state.styleStore).length > 0) {
      if (!state.attributeStore || !hasOwn.call(state.attributeStore, 'style')) {
        var sChunks = [];
        var sKeys = Object.keys(state.styleStore);
        for (var si = 0; si < sKeys.length; si++) {
          sChunks.push(sKeys[si] + ': ' + state.styleStore[sKeys[si]] + ';');
        }
        out += ' style="' + escapeAttr(sChunks.join(' ')) + '"';
      }
    }
    out += '>';
    if (VOID_TAGS[tag]) { return out; }
    out += serializeChildren(node) + '</' + tag + '>';
    return out;
  }

  function serializeChildren(node) {
    var state = ensureNodeState(node);
    var out = '';
    for (var i = 0; i < state.childNodes.length; i++) {
      out += serializeNode(state.childNodes[i]);
    }
    return out;
  }

  // ── innerHTML / fragment 解析 ────────────────────────────────────────────────

  function parseHTMLFragment(parent, html, ownerDoc) {
    var str = String(html == null ? '' : html);
    if (!str) { return; }
    var parentState = ensureNodeState(parent);
    var doc = ownerDoc || parentState.ownerDocument || parent;
    var stack = [parent];
    var voidTags = VOID_TAGS;
    var tokenRegex = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/g;
    var tokenMatch = null;
    while ((tokenMatch = tokenRegex.exec(str)) !== null) {
      var token = tokenMatch[0];
      if (!token) { continue; }
      if (token.indexOf('<!--') === 0) {
        var commentContent = token.slice(4, token.length - 3);
        var commentNode = createNodeObject('Comment', '');
        ensureNodeState(commentNode, { nodeType: 8, nodeName: '#comment', tagName: '', textContent: commentContent, ownerDocument: doc });
        appendChild(stack[stack.length - 1], commentNode);
        continue;
      }
      if (token.charAt(0) !== '<') {
        // Text node
        var textNode = createNodeObject('Text', '');
        var decoded = token.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(Number(n));});
        ensureNodeState(textNode, { nodeType: 3, nodeName: '#text', tagName: '', textContent: decoded, ownerDocument: doc });
        appendChild(stack[stack.length - 1], textNode);
        continue;
      }
      if (token.indexOf('</') === 0) {
        var closeMatch = token.match(/^<\s*\/\s*([^\s>\/]+)/);
        if (!closeMatch) { continue; }
        var closingTag = String(closeMatch[1]).toUpperCase();
        for (var ci = stack.length - 1; ci > 0; ci--) {
          if (String(ensureNodeState(stack[ci]).tagName || '').toUpperCase() === closingTag) {
            stack.length = ci;
            break;
          }
        }
        continue;
      }
      var openMatch = token.match(/^<\s*([^\s>\/]+)\s*([^>]*)>/);
      if (!openMatch) { continue; }
      var tagName = openMatch[1];
      var attrChunk = openMatch[2] || '';
      var isSelf = /\/\s*>$/.test(token) || !!voidTags[String(tagName).toLowerCase()];
      if (isSelf) { attrChunk = attrChunk.replace(/\/\s*$/, ''); }
      var el = (typeof doc.createElement === 'function')
        ? doc.createElement(tagName)
        : createElementForDocument(doc, tagName);
      parseAttributesIntoNode(el, attrChunk);
      appendChild(stack[stack.length - 1], el);
      if (!isSelf) { stack.push(el); }
    }
  }

  function setInnerHTML(node, html) {
    var state = ensureNodeState(node);
    var children = state.childNodes.slice();
    for (var i = 0; i < children.length; i++) { removeChild(node, children[i]); }
    parseHTMLFragment(node, String(html == null ? '' : html), state.ownerDocument || null);
    markNodeDirty(node);
  }

  function setOuterHTML(node, html) {
    var state = ensureNodeState(node);
    var parent = state.parentNode;
    if (!parent) { return; }
    var frag = createNodeObject('DocumentFragment', '');
    ensureNodeState(frag, { nodeType: 11, nodeName: '#document-fragment', tagName: '' });
    parseHTMLFragment(frag, String(html == null ? '' : html), state.ownerDocument || null);
    insertBefore(parent, frag, node);
    removeChild(parent, node);
  }

  // ── cloneNode ─────────────────────────────────────────────────────────────

  function cloneNode(node, deep) {
    var state = ensureNodeState(node);
    var ctor = getCtorName(node) || 'HTMLUnknownElement';
    var cloned = createNodeObject(ctor, state.tagName || '');
    var cs = ensureNodeState(cloned);
    cs.nodeType = state.nodeType;
    cs.nodeName = state.nodeName;
    cs.tagName = state.tagName;
    cs.namespaceURI = state.namespaceURI || null;
    cs.prefix = state.prefix || null;
    cs.localName = state.localName || '';
    cs.textContent = state.textContent || '';
    if (state.attributeStore) {
      cs.attributeStore = {};
      var aKeys = Object.keys(state.attributeStore);
      for (var ai = 0; ai < aKeys.length; ai++) {
        cs.attributeStore[aKeys[ai]] = state.attributeStore[aKeys[ai]];
      }
    }
    if (state.styleStore) {
      cs.styleStore = {};
      var sKeys = Object.keys(state.styleStore);
      for (var si = 0; si < sKeys.length; si++) {
        cs.styleStore[sKeys[si]] = state.styleStore[sKeys[si]];
      }
    }
    if (deep) {
      for (var ci = 0; ci < state.childNodes.length; ci++) {
        appendChild(cloned, cloneNode(state.childNodes[ci], true));
      }
    }
    return cloned;
  }

  // ── classList (DOMTokenList) ───────────────────────────────────────────────

  function createClassList(node) {
    if (leapenv && typeof leapenv.createDOMTokenListObject === 'function') {
      try { return leapenv.createDOMTokenListObject(node); } catch (_) {}
    }
    function getClasses() {
      var cn = getNodeClassName(node) || '';
      return cn ? cn.split(/\s+/).filter(Boolean) : [];
    }
    function setClasses(arr) { setNodeClassName(node, arr.join(' ')); }

    var api = {
      add: function() {
        var cls = getClasses();
        for (var i = 0; i < arguments.length; i++) {
          var c = String(arguments[i]);
          if (cls.indexOf(c) < 0) { cls.push(c); }
        }
        setClasses(cls);
      },
      remove: function() {
        var cls = getClasses();
        for (var i = 0; i < arguments.length; i++) {
          var idx = cls.indexOf(String(arguments[i]));
          if (idx >= 0) { cls.splice(idx, 1); }
        }
        setClasses(cls);
      },
      toggle: function(token, force) {
        var cls = getClasses();
        var idx = cls.indexOf(token);
        if (idx >= 0) {
          if (force === true) { return true; }
          cls.splice(idx, 1); setClasses(cls); return false;
        }
        if (force === false) { return false; }
        cls.push(token); setClasses(cls); return true;
      },
      contains: function(token) { return getClasses().indexOf(token) >= 0; },
      replace: function(oldTok, newTok) {
        var cls = getClasses();
        var idx = cls.indexOf(oldTok);
        if (idx < 0) { return false; }
        cls[idx] = newTok; setClasses(cls); return true;
      },
      item: function(i) { var cls = getClasses(); return cls[i] !== undefined ? cls[i] : null; },
      get length() { return getClasses().length; },
      get value() { return getNodeClassName(node) || ''; },
      set value(v) { setNodeClassName(node, v == null ? '' : String(v)); },
      toString: function() { return getNodeClassName(node) || ''; },
      forEach: function(cb, thisArg) {
        var cls = getClasses();
        for (var i = 0; i < cls.length; i++) { cb.call(thisArg, cls[i], i, api); }
      },
      entries: function() {
        var cls = getClasses(); var i = 0;
        return { next: function() { return i < cls.length ? { value: [i, cls[i++]], done: false } : { done: true }; } };
      },
      keys: function() {
        var cls = getClasses(); var i = 0;
        return { next: function() { return i < cls.length ? { value: i++, done: false } : { done: true }; } };
      },
      values: function() {
        var cls = getClasses(); var i = 0;
        return { next: function() { return i < cls.length ? { value: cls[i++], done: false } : { done: true }; } };
      }
    };
    if (typeof Proxy === 'function') {
      return new Proxy(api, {
        get: function(target, prop, receiver) {
          if (typeof prop === 'string' && /^\d+$/.test(prop)) {
            return api.item(Number(prop));
          }
          return Reflect.get(target, prop, receiver);
        }
      });
    }
    return api;
  }

  // ── CSS selector matching ─────────────────────────────────────────────────

  function matchesSingleSelector(node, selector) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1) { return false; }
    var sel = selector.trim();
    if (!sel || sel === '*') { return true; }
    var remaining = sel;
    // 标签名
    var tagM = remaining.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    if (tagM) {
      var nodeTag = String(state.tagName || state.nodeName || '').toUpperCase();
      if (nodeTag !== tagM[1].toUpperCase()) { return false; }
      remaining = remaining.slice(tagM[1].length);
    }
    while (remaining.length > 0) {
      if (remaining.charAt(0) === '.') {
        var cm = remaining.match(/^\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/);
        if (!cm) { return false; }
        var classes = (getNodeClassName(node) || '').split(/\s+/).filter(Boolean);
        if (classes.indexOf(cm[1]) < 0) { return false; }
        remaining = remaining.slice(cm[0].length);
      } else if (remaining.charAt(0) === '#') {
        var im = remaining.match(/^#(-?[a-zA-Z_][a-zA-Z0-9_-]*)/);
        if (!im) { return false; }
        if (getNodeId(node) !== im[1]) { return false; }
        remaining = remaining.slice(im[0].length);
      } else if (remaining.charAt(0) === '[') {
        var am = remaining.match(/^\[([^\]=~|^$*\s]+)(?:([~|^$*]?=)"([^"]*)"|=([^\]]*))?\]/);
        if (!am) { return false; }
        var attrN = am[1], op2 = am[2] || (am[4] !== undefined ? '=' : null);
        var attrExpect = am[3] !== undefined ? am[3] : am[4];
        var attrGot = getNodeAttribute(node, attrN);
        if (op2 === null) { if (attrGot === null) { return false; } }
        else if (op2 === '=') { if (attrGot !== attrExpect) { return false; } }
        else if (op2 === '^=') { if (!attrGot || attrGot.indexOf(attrExpect) !== 0) { return false; } }
        else if (op2 === '$=') { if (!attrGot || attrGot.slice(-attrExpect.length) !== attrExpect) { return false; } }
        else if (op2 === '*=') { if (!attrGot || attrGot.indexOf(attrExpect) < 0) { return false; } }
        else if (op2 === '~=') { if (!attrGot || attrGot.split(/\s+/).indexOf(attrExpect) < 0) { return false; } }
        remaining = remaining.slice(am[0].length);
      } else { return false; }
    }
    return true;
  }

  function matchesSelector(node, selector) {
    if (!selector) { return false; }
    var state = ensureNodeState(node);
    if (state.nodeType !== 1) { return false; }
    var groups = splitSelectorGroups(selector);
    for (var i = 0; i < groups.length; i++) {
      var chain = parseSelectorGroup(groups[i]);
      if (chain && matchesSelectorChain(node, chain, node)) {
        return true;
      }
    }
    return false;
  }

  // ── NamedNodeMap ──────────────────────────────────────────────────────────

  function createNamedNodeMap(node) {
    if (leapenv && typeof leapenv.createNamedNodeMapObject === 'function') {
      try { return leapenv.createNamedNodeMapObject(node); } catch (_) {}
    }
    function records() {
      var state = ensureNodeState(node);
      var nsStore = state.attributeNSStore || {};
      var keys = Object.keys(nsStore);
      var out = [];
      for (var i = 0; i < keys.length; i++) {
        out.push(nsStore[keys[i]]);
      }
      return out;
    }
    function makeAttr(record) {
      if (!record) {
        return null;
      }
      return {
        name: record.name,
        localName: record.localName,
        namespaceURI: record.namespaceURI,
        prefix: record.prefix,
        value: record.value,
        nodeType: 2,
        nodeValue: record.value
      };
    }
    var map = {
      getNamedItem: function(name) {
        var n = normalizeAttrName(name);
        if (!n) {
          return null;
        }
        var all = records();
        for (var i = 0; i < all.length; i++) {
          if (all[i] && all[i].name === n) {
            return makeAttr(all[i]);
          }
        }
        return null;
      },
      getNamedItemNS: function(namespaceURI, localName) {
        var value = getNodeAttributeNS(node, namespaceURI, localName);
        if (value == null) {
          return null;
        }
        var normalizedNamespace = normalizeNamespaceURI(namespaceURI);
        var normalizedLocalName = normalizedNamespace == null
          ? normalizeAttrLocalName(localName)
          : String(localName == null ? '' : localName);
        var state = ensureNodeState(node);
        if (!state.attributeNSStore) {
          return null;
        }
        return makeAttr(state.attributeNSStore[buildAttrNSKey(normalizedNamespace, normalizedLocalName)]);
      },
      setNamedItem: function(attr) {
        setNodeAttribute(node, attr.name, attr.value); return null;
      },
      setNamedItemNS: function(attr) {
        var qName = attr && attr.name != null ? attr.name : (attr && attr.localName != null ? attr.localName : '');
        setNodeAttributeNS(node, attr ? attr.namespaceURI : null, qName, attr ? attr.value : '');
        return null;
      },
      removeNamedItem: function(name) {
        var old = map.getNamedItem(name);
        removeNodeAttribute(node, name); return old;
      },
      removeNamedItemNS: function(namespaceURI, localName) {
        var old = map.getNamedItemNS(namespaceURI, localName);
        removeNodeAttributeNS(node, namespaceURI, localName);
        return old;
      },
      item: function(index) {
        var all = records();
        return (index >= 0 && index < all.length) ? makeAttr(all[index]) : null;
      },
      get length() { return records().length; }
    };
    if (typeof Proxy === 'function') {
      return new Proxy(map, {
        get: function(target, prop, receiver) {
          if (typeof prop === 'string' && /^\d+$/.test(prop)) { return map.item(Number(prop)); }
          return Reflect.get(target, prop, receiver);
        }
      });
    }
    return map;
  }

  function parseHTMLUnsafe(htmlText, maybeDocument) {
    var targetDocument = null;
    if (maybeDocument && (typeof maybeDocument === 'object' || typeof maybeDocument === 'function')) {
      var maybeState = ensureNodeState(maybeDocument);
      if (maybeState.nodeType === 9) {
        targetDocument = maybeDocument;
      }
    }

    if (!targetDocument) {
      targetDocument = createNodeObject('HTMLDocument');
      ensureDocumentRegistration(targetDocument, normalizeTaskId(currentTaskId));
    } else {
      ensureDocumentRegistration(targetDocument, normalizeTaskId(currentTaskId));
    }

    return parseHTMLIntoDocument(targetDocument, htmlText);
  }

  function normalizeStyleName(name) {
    if (name == null) {
      return '';
    }
    var raw = String(name).trim();
    if (!raw) {
      return '';
    }
    var converted = raw.indexOf('-') >= 0
      ? raw.toLowerCase()
      : raw.replace(/[A-Z]/g, function (m) {
          return '-' + m.toLowerCase();
        }).toLowerCase();
    return converted.replace(/\s+/g, '');
  }

  function isWhitelistedStyle(styleName) {
    if (!styleName) {
      return false;
    }
    if (STYLE_LAYOUT_ALLOWLIST.has(styleName)) {
      return true;
    }
    if (styleName === 'margin' || styleName.indexOf('margin-') === 0) {
      return true;
    }
    if (styleName === 'padding' || styleName.indexOf('padding-') === 0) {
      return true;
    }
    if (styleName === 'border-width' || /^border-(top|right|bottom|left)-width$/.test(styleName)) {
      return true;
    }
    if (styleName === 'flex' || styleName.indexOf('flex-') === 0) {
      return true;
    }
    if (styleName === 'inset' || styleName.indexOf('inset-') === 0) {
      return true;
    }
    return false;
  }

  function markNodeDirty(node) {
    var cur = node;
    while (cur) {
      var state = ensureNodeState(cur);
      state.layoutDirty = true;
      state.layoutRect = null;
      cur = state.parentNode;
    }
    // R2: 清除布局根节点的 DoD 树缓存，强制下次重新计算布局
    var root = getLayoutRoot(node);
    var rootState = ensureNodeState(root);
    rootState._dodTree = null;
  }

  function setStyleValue(state, styleName, value) {
    if (!state || !styleName) {
      return;
    }
    var normalized = normalizeStyleName(styleName);
    if (!isWhitelistedStyle(normalized)) {
      return;
    }
    var serialized = String(value == null ? '' : value).trim();

    state.styleStore = state.styleStore || {};
    if (!serialized) {
      delete state.styleStore[normalized];
    } else {
      state.styleStore[normalized] = serialized;
    }
    markNodeDirty(state.nodeRef);
  }

  function getStyleValue(state, styleName) {
    if (!state || !state.styleStore) {
      return '';
    }
    var normalized = normalizeStyleName(styleName);
    if (!normalized || !isWhitelistedStyle(normalized)) {
      return '';
    }
    return state.styleStore[normalized] || '';
  }

  function removeStyleValue(state, styleName) {
    if (!state || !state.styleStore) {
      return '';
    }
    var normalized = normalizeStyleName(styleName);
    if (!normalized || !isWhitelistedStyle(normalized)) {
      return '';
    }
    var oldValue = state.styleStore[normalized] || '';
    setStyleValue(state, normalized, '');
    return oldValue;
  }

  function parseBoxValues(value) {
    var parts = String(value == null ? '' : value).trim().split(/\s+/);
    if (!parts[0]) {
      return [0, 0, 0, 0];
    }
    if (parts.length === 1) {
      var v = parsePixels(parts[0]);
      return [v, v, v, v];
    }
    if (parts.length === 2) {
      var v1 = parsePixels(parts[0]);
      var v2 = parsePixels(parts[1]);
      return [v1, v2, v1, v2];
    }
    if (parts.length === 3) {
      var a = parsePixels(parts[0]);
      var b = parsePixels(parts[1]);
      var c = parsePixels(parts[2]);
      return [a, b, c, b];
    }
    var top = parsePixels(parts[0]);
    var right = parsePixels(parts[1]);
    var bottom = parsePixels(parts[2]);
    var left = parsePixels(parts[3]);
    return [top, right, bottom, left];
  }

  function readBoxEdges(state, baseName) {
    var topKey = baseName + '-top';
    var rightKey = baseName + '-right';
    var bottomKey = baseName + '-bottom';
    var leftKey = baseName + '-left';

    if (baseName === 'border-width') {
      topKey = 'border-top-width';
      rightKey = 'border-right-width';
      bottomKey = 'border-bottom-width';
      leftKey = 'border-left-width';
    }

    var top = hasOwn.call(state.styleStore, topKey) ? parsePixels(state.styleStore[topKey]) : null;
    var right = hasOwn.call(state.styleStore, rightKey) ? parsePixels(state.styleStore[rightKey]) : null;
    var bottom = hasOwn.call(state.styleStore, bottomKey) ? parsePixels(state.styleStore[bottomKey]) : null;
    var left = hasOwn.call(state.styleStore, leftKey) ? parsePixels(state.styleStore[leftKey]) : null;

    var shorthand = state.styleStore[baseName];
    var values = shorthand != null ? parseBoxValues(shorthand) : [0, 0, 0, 0];
    return {
      top: top == null ? values[0] : top,
      right: right == null ? values[1] : right,
      bottom: bottom == null ? values[2] : bottom,
      left: left == null ? values[3] : left
    };
  }

  function getPositionValue(state) {
    if (!state || !state.styleStore) {
      return 'static';
    }
    var raw = String(state.styleStore.position || '').trim().toLowerCase();
    if (!raw) {
      return 'static';
    }
    if (
      raw === 'relative' ||
      raw === 'absolute' ||
      raw === 'fixed' ||
      raw === 'sticky' ||
      raw === 'static'
    ) {
      return raw;
    }
    return 'static';
  }

  function createRectAt(left, top, width, height) {
    var safeWidth = Math.max(0, width || 0);
    var safeHeight = Math.max(0, height || 0);
    var rect = {
      x: left,
      y: top,
      top: top,
      left: left,
      width: safeWidth,
      height: safeHeight
    };
    rect.right = rect.left + rect.width;
    rect.bottom = rect.top + rect.height;
    rect.flowBottom = rect.bottom;
    rect.toJSON = function () {
      return {
        x: rect.x,
        y: rect.y,
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        flowBottom: rect.flowBottom
      };
    };
    return rect;
  }


  function getLayoutRoot(node) {
    var state = ensureNodeState(node);
    if (state.nodeType === 9) {
      return node;
    }
    if (state.ownerDocument) {
      return state.ownerDocument;
    }
    var cur = node;
    var parent = state.parentNode;
    while (parent) {
      cur = parent;
      parent = ensureNodeState(cur).parentNode;
    }
    return cur;
  }


  function resolveDocumentNode(docOrId) {
    if (docOrId && (typeof docOrId === 'object' || typeof docOrId === 'function')) {
      return docOrId;
    }
    var parsed = Number.parseInt(docOrId, 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return documentById.get(parsed) || null;
  }

  function clearNodeState(node) {
    var state = ensureNodeState(node);
    state.parentNode = null;
    state.childNodes = [];
    state.ownerDocument = null;
    state.attributeStore = null;
    state.styleStore = null;
    state.styleObject = null;
    state.textContent = '';
    state.layoutDirty = true;
    state.layoutRect = null;
    state.isReleased = true;
  }

  function createDocument(taskId) {
    var documentNode = createNodeObject('HTMLDocument');
    var normalizedTaskId = normalizeTaskId(taskId || currentTaskId);
    ensureDocumentRegistration(documentNode, normalizedTaskId);
    ensureDocumentDefaultTree(documentNode);
    return ensureDocumentState(documentNode).docId;
  }

  function getOrCreateTaskDocument(taskId) {
    var normalizedTaskId = normalizeTaskId(taskId || currentTaskId);
    var existing = taskPrimaryDocument.get(normalizedTaskId);
    if (existing) {
      var existingState = ensureDocumentState(existing);
      if (!existingState.isReleased && existingState.docId && documentById.has(existingState.docId)) {
        ensureDocumentDefaultTree(existing);
        return existing;
      }
    }
    var created = createNodeObject('HTMLDocument');
    ensureDocumentRegistration(created, normalizedTaskId);
    ensureDocumentDefaultTree(created);
    return created;
  }

  function releaseDocument(docOrId) {
    var documentNode = resolveDocumentNode(docOrId);
    if (!documentNode) {
      return 0;
    }

    var documentState = ensureDocumentState(documentNode);
    if (!documentState.docId || documentState.isReleased) {
      return 0;
    }

    var docId = documentState.docId;
    var nativeDocId = Number(documentState.nativeDocId || 0);
    var taskId = documentState.taskId;
    var nodes = documentState.ownedNodes ? Array.from(documentState.ownedNodes) : [];
    releaseStats.releasedDocs += 1;
    releaseStats.releasedNodes += nodes.length;
    for (var i = 0; i < nodes.length; i++) {
      clearNodeState(nodes[i]);
    }

    documentState.ownedNodes = new Set();
    documentState.childNodes = [];
    documentState.parentNode = null;
    documentState.layoutDirty = true;
    documentState.layoutRect = null;
    documentState.locationObject = null;
    documentState.isReleased = true;
    documentState.nativeDocId = 0;
    documentById.delete(docId);
    if (taskId) {
      var docSet = taskToDocs.get(taskId);
      if (docSet) {
        docSet.delete(docId);
        if (docSet.size === 0) {
          taskToDocs.delete(taskId);
        }
      }
      if (taskPrimaryDocument.get(taskId) === documentNode) {
        taskPrimaryDocument.delete(taskId);
      }
    }

    if (nativeDocId > 0) {
      var bridge = getNativeDomBridge();
      if (bridge && typeof bridge.releaseDocument === 'function') {
        try {
          bridge.releaseDocument(nativeDocId);
        } catch (_) {}
      }
    }

    return 1;
  }

  function releaseTaskScope(taskId) {
    var normalizedTaskId = normalizeTaskId(taskId || currentTaskId);
    var docSet = taskToDocs.get(normalizedTaskId);
    if (!docSet || docSet.size === 0) {
      taskPrimaryDocument.delete(normalizedTaskId);
      return 0;
    }
    var docIds = Array.from(docSet);
    var released = 0;
    for (var i = 0; i < docIds.length; i++) {
      released += releaseDocument(docIds[i]);
    }
    taskToDocs.delete(normalizedTaskId);
    taskPrimaryDocument.delete(normalizedTaskId);
    return released;
  }

  function releaseAllScopes() {
    var taskIds = Array.from(taskToDocs.keys());
    var released = 0;
    for (var i = 0; i < taskIds.length; i++) {
      released += releaseTaskScope(taskIds[i]);
    }
    return released;
  }

  function getRuntimeStats() {
    var docIds = Array.from(documentById.keys());
    var activeNodes = 0;
    for (var i = 0; i < docIds.length; i++) {
      var docNode = documentById.get(docIds[i]);
      if (!docNode) {
        continue;
      }
      var state = ensureDocumentState(docNode);
      activeNodes += state.ownedNodes ? state.ownedNodes.size : 0;
    }
    return {
      activeDocs: documentById.size,
      activeNodes: activeNodes,
      activeTasks: taskToDocs.size
    };
  }

  function drainReleaseStats() {
    var out = {
      releasedDocs: releaseStats.releasedDocs,
      releasedNodes: releaseStats.releasedNodes
    };
    releaseStats.releasedDocs = 0;
    releaseStats.releasedNodes = 0;
    return out;
  }

  function releaseStaleTaskScopes(nextTaskId) {
    var normalizedTaskId = normalizeTaskId(nextTaskId || currentTaskId);
    var taskIds = Array.from(taskToDocs.keys());
    var released = 0;
    for (var i = 0; i < taskIds.length; i++) {
      if (taskIds[i] !== normalizedTaskId) {
        released += releaseTaskScope(taskIds[i]);
      }
    }
    return released;
  }

  function beginTaskScope(taskId) {
    var normalizedTaskId = normalizeTaskId(taskId || 'task-default');
    releaseStaleTaskScopes(normalizedTaskId);
    currentTaskId = normalizedTaskId;
    if (typeof leapenv.beginTask === 'function') {
      try { leapenv.beginTask(normalizedTaskId); } catch (_) {}
    }
    return normalizedTaskId;
  }

  function endTaskScope(taskId) {
    var normalizedTaskId = normalizeTaskId(taskId || currentTaskId);
    var released = releaseTaskScope(normalizedTaskId);
    if (currentTaskId === normalizedTaskId) {
      currentTaskId = 'task-default';
    }
    if (typeof leapenv.endTask === 'function') {
      try { leapenv.endTask(normalizedTaskId); } catch (_) {}
    }
    return released;
  }

  function getCurrentTaskId() {
    if (typeof leapenv.getCurrentTaskId === 'function') {
      try {
        var runtimeTaskId = leapenv.getCurrentTaskId();
        if (runtimeTaskId) {
          return runtimeTaskId;
        }
      } catch (_) {}
    }
    return currentTaskId;
  }

  function createStyleObject(state) {
    state.styleStore = state.styleStore || {};

    var api = {
      setProperty: function setProperty(name, value) {
        setStyleValue(state, name, value);
      },
      getPropertyValue: function getPropertyValue(name) {
        return getStyleValue(state, name);
      },
      removeProperty: function removeProperty(name) {
        return removeStyleValue(state, name);
      }
    };

    Object.defineProperty(api, 'cssText', {
      enumerable: true,
      configurable: true,
      get: function () {
        var keys = Object.keys(state.styleStore);
        var chunks = [];
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          chunks.push(key + ': ' + state.styleStore[key] + ';');
        }
        return chunks.join(' ');
      },
      set: function (text) {
        var previous = Object.keys(state.styleStore || {});
        for (var p = 0; p < previous.length; p++) {
          setStyleValue(state, previous[p], '');
        }
        state.styleStore = {};
        if (typeof text !== 'string') {
          return;
        }
        var parts = text.split(';');
        for (var i = 0; i < parts.length; i++) {
          var part = parts[i].trim();
          if (!part) continue;
          var splitIndex = part.indexOf(':');
          if (splitIndex <= 0) continue;
          var key = part.slice(0, splitIndex).trim();
          var value = part.slice(splitIndex + 1).trim();
          setStyleValue(state, key, value);
        }
      }
    });

    return new Proxy(api, {
      get: function (target, prop, receiver) {
        if (typeof prop === 'string' && !(prop in target)) {
          return getStyleValue(state, prop);
        }
        return Reflect.get(target, prop, receiver);
      },
      set: function (target, prop, value, receiver) {
        if (typeof prop === 'string' && !(prop in target)) {
          setStyleValue(state, prop, value);
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },
      ownKeys: function (target) {
        return Reflect.ownKeys(target).concat(Object.keys(state.styleStore));
      },
      getOwnPropertyDescriptor: function (target, prop) {
        var normalized = normalizeStyleName(prop);
        if (
          typeof prop === 'string' &&
          !(prop in target) &&
          normalized &&
          state.styleStore &&
          hasOwn.call(state.styleStore, normalized)
        ) {
          return {
            enumerable: true,
            configurable: true,
            writable: true,
            value: state.styleStore[normalized]
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    });
  }

  function ensureStyleObject(state) {
    if (!state.styleObject) {
      state.styleObject = createStyleObject(state);
    }
    return state.styleObject;
  }

  function getStyleSize(state, key) {
    if (!state || !state.styleStore) {
      return 0;
    }
    var raw = state.styleStore[normalizeStyleName(key)];
    return parsePixels(raw);
  }

  function createRect(width, height) {
    return createRectAt(0, 0, width, height);
  }

  function getDoDConstructors() {
    var DomToDoDConverter = (typeof global !== 'undefined' && global.DomToDoDConverter) ||
                            (typeof window !== 'undefined' && window.DomToDoDConverter);
    var DoDLayoutEngine = (typeof global !== 'undefined' && global.DoDLayoutEngine) ||
                          (typeof window !== 'undefined' && window.DoDLayoutEngine);

    if ((!DomToDoDConverter || !DoDLayoutEngine) && typeof require === 'function') {
      try {
        var mod = require('./dod-layout-engine.js');
        DomToDoDConverter = DomToDoDConverter || (mod && mod.DomToDoDConverter);
        DoDLayoutEngine = DoDLayoutEngine || (mod && mod.DoDLayoutEngine);
      } catch (_) {}
    }

    return {
      DomToDoDConverter: DomToDoDConverter,
      DoDLayoutEngine: DoDLayoutEngine
    };
  }

  function styleNameToCamel(styleName) {
    return String(styleName || '').replace(/-([a-z])/g, function (_, c) {
      return c.toUpperCase();
    });
  }

  function buildDoDStyleObject(state) {
    var out = {};
    if (!state || !state.styleStore) {
      return out;
    }
    var keys = Object.keys(state.styleStore);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      out[styleNameToCamel(key)] = state.styleStore[key];
    }
    return out;
  }

  function getDoDChildNodes(domNode) {
    var state = ensureNodeState(domNode);
    var children = state.childNodes || [];
    var out = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (!child) {
        continue;
      }
      var childState = ensureNodeState(child);
      if (childState.nodeType === 1) {
        out.push(child);
      }
    }
    return out;
  }

  function countDoDNodes(domNode) {
    var count = 1;
    var children = getDoDChildNodes(domNode);
    for (var i = 0; i < children.length; i++) {
      count += countDoDNodes(children[i]);
    }
    return count;
  }

  function buildDoDInputTree(domNode) {
    var state = ensureNodeState(domNode);
    var children = getDoDChildNodes(domNode);
    var outChildren = [];
    for (var i = 0; i < children.length; i++) {
      outChildren.push(buildDoDInputTree(children[i]));
    }
    return {
      style: buildDoDStyleObject(state),
      children: outChildren
    };
  }

  /**
   * DoD 辅助函数：从 DOM 树转换为 DoD 并计算布局
   */
  function ensureDoDLayout(node) {
    var root = getLayoutRoot(node);
    var rootState = ensureNodeState(root);
    var ctors = getDoDConstructors();
    if (!ctors.DomToDoDConverter || !ctors.DoDLayoutEngine) {
      return false;
    }

    if (!rootState._dodTree) {
      try {
        var converter = new ctors.DomToDoDConverter();
        var containerWidth = 800;
        var containerHeight = 600;
        if (typeof window !== 'undefined' && window.innerWidth) {
          containerWidth = window.innerWidth;
          containerHeight = window.innerHeight;
        }
        var dodInput = buildDoDInputTree(root);
        var tree = converter.convert(dodInput, countDoDNodes(root));
        ctors.DoDLayoutEngine.compute(tree, containerWidth, containerHeight);
        mapDOMToDoD(root, tree);
        rootState._dodTree = tree;
      } catch (_) {
        return false;
      }
    }

    return true;
  }

  /**
   * 递归计算 DOM 树中的节点数
   */
  function countNodes(node) {
    var count = 1;
    var children = node.childNodes || node.children || [];
    for (var i = 0; i < children.length; i++) {
      count += countNodes(children[i]);
    }
    return count;
  }

  /**
   * 建立 DOM 节点和 DoD 树节点的映射关系
   */
  function mapDOMToDoD(domNode, tree, nodeId) {
    if (nodeId === undefined) {
      nodeId = tree.rootId;
    }

    var state = ensureNodeState(domNode);
    state._dodNodeId = nodeId;
    state._dodTree = tree;

    // 递归处理子节点
    var children = getDoDChildNodes(domNode);
    var childIds = [];
    if (tree.firstChild && tree.nextSibling) {
      var linkedChildId = tree.firstChild[nodeId];
      while (linkedChildId >= 0) {
        childIds.push(linkedChildId);
        linkedChildId = tree.nextSibling[linkedChildId];
      }
    } else {
      // Legacy fallback: contiguous children slice.
      var childStart = tree.childrenStart[nodeId];
      var childCount = tree.childrenCount[nodeId];
      for (var j = 0; j < childCount; j++) {
        childIds.push(tree.childrenList[childStart + j]);
      }
    }

    for (var i = 0; i < childIds.length && i < children.length; i++) {
      mapDOMToDoD(children[i], tree, childIds[i]);
    }
  }

  function getDoDLayoutRect(node, state) {
    if (!state || !node) {
      return null;
    }
    if (!ensureDoDLayout(node)) {
      return null;
    }
    var tree = state._dodTree;
    var nodeId = state._dodNodeId;
    if (!tree || !Number.isFinite(nodeId) || nodeId < 0) {
      return null;
    }
    var left = Number(tree.computedLefts[nodeId]);
    var top = Number(tree.computedTops[nodeId]);
    var width = Number(tree.computedWidths[nodeId]);
    var height = Number(tree.computedHeights[nodeId]);

    // DoD computed width/height are treated as content-box.
    // DOM offset metrics should include padding + border.
    state.styleStore = state.styleStore || {};
    var padding = readBoxEdges(state, 'padding');
    var border = readBoxEdges(state, 'border-width');
    width += padding.left + padding.right + border.left + border.right;
    height += padding.top + padding.bottom + border.top + border.bottom;

    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }
    return createRectAt(left, top, width, height);
  }

  function getLayoutRect(node) {
    var state = ensureNodeState(node);
    var dodRect = getDoDLayoutRect(node, state);
    if (dodRect) {
      state.layoutRect = dodRect;
      state.layoutDirty = false;
      return dodRect;
    }
    return createRectAt(0, 0, 0, 0);
  }

  function ensureLayout(node) {
    return getLayoutRect(node);
  }

  function getClientWidth(node) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1) {
      return 0;
    }
    var rect = getLayoutRect(node);
    state.styleStore = state.styleStore || {};
    var border = readBoxEdges(state, 'border-width');
    return Math.max(0, rect.width - border.left - border.right);
  }

  function getClientHeight(node) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1) {
      return 0;
    }
    var rect = getLayoutRect(node);
    state.styleStore = state.styleStore || {};
    var border = readBoxEdges(state, 'border-width');
    return Math.max(0, rect.height - border.top - border.bottom);
  }

  function getOffsetParent(node) {
    var state = ensureNodeState(node);
    if (state.nodeType !== 1) {
      return null;
    }
    if (getPositionValue(state) === 'fixed') {
      return null;
    }

    var cur = state.parentNode;
    while (cur) {
      var curState = ensureNodeState(cur);
      if (curState.nodeType === 1 && getPositionValue(curState) !== 'static') {
        return cur;
      }
      cur = curState.parentNode;
    }

    if (state.ownerDocument) {
      return getDocumentBody(state.ownerDocument) || getDocumentElement(state.ownerDocument);
    }
    return null;
  }

  function getOffsetLeft(node) {
    var rect = getLayoutRect(node);
    var parent = getOffsetParent(node);
    if (!parent) {
      return rect.left;
    }
    var parentRect = getLayoutRect(parent);
    return rect.left - parentRect.left;
  }

  function getOffsetTop(node) {
    var rect = getLayoutRect(node);
    var parent = getOffsetParent(node);
    if (!parent) {
      return rect.top;
    }
    var parentRect = getLayoutRect(parent);
    return rect.top - parentRect.top;
  }

  function getNodeAttributesForTrace(state) {
    if (!state || !state.attributeStore) {
      return {};
    }
    var keys = Object.keys(state.attributeStore).sort();
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = state.attributeStore[keys[i]];
    }
    return out;
  }

  function getNodePath(node) {
    var chain = [];
    var cur = node;
    while (cur) {
      var state = ensureNodeState(cur);
      if (state.nodeType === 9) {
        chain.push('#document');
        break;
      }
      var tag = String(state.nodeName || state.tagName || 'UNKNOWN').toUpperCase();
      var id = getNodeId(cur);
      chain.push(id ? tag + '#' + id : tag);
      cur = state.parentNode;
    }
    chain.reverse();
    return chain.join(' > ');
  }

  function snapshotNodeForTrace(node) {
    if (!node || (typeof node !== 'object' && typeof node !== 'function')) {
      return null;
    }

    var state = ensureNodeState(node);
    var rect = ensureLayout(node);
    var children = state.childNodes || [];
    var childSnapshots = [];
    for (var i = 0; i < children.length; i++) {
      childSnapshots.push(snapshotNodeForTrace(children[i]));
    }
    return {
      nodeType: state.nodeType,
      nodeName: state.nodeName || '',
      tagName: state.tagName || '',
      id: getNodeId(node),
      className: getNodeClassName(node),
      textContent: state.textContent || '',
      path: getNodePath(node),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      },
      attrs: getNodeAttributesForTrace(state),
      children: childSnapshots
    };
  }

  function valueTypeOf(input) {
    if (input === null) return 'null';
    if (Array.isArray(input)) return 'array';
    return typeof input;
  }

  function makeTraceDiff(path, expected, actual, reason) {
    return {
      path: path || '$',
      reason: reason || 'value mismatch',
      expected: expected,
      actual: actual
    };
  }

  function findFirstTraceDiff(actual, expected, path) {
    var currentPath = path || '$';
    var expectedType = valueTypeOf(expected);
    var actualType = valueTypeOf(actual);
    if (expectedType !== actualType) {
      return makeTraceDiff(currentPath, expected, actual, 'type mismatch');
    }

    if (expectedType === 'array') {
      if (expected.length !== actual.length) {
        return makeTraceDiff(currentPath + '.length', expected.length, actual.length, 'array length mismatch');
      }
      for (var i = 0; i < expected.length; i++) {
        var childDiff = findFirstTraceDiff(actual[i], expected[i], currentPath + '[' + i + ']');
        if (childDiff) {
          return childDiff;
        }
      }
      return null;
    }

    if (expectedType === 'object') {
      var expectedKeys = Object.keys(expected).sort();
      var actualKeys = Object.keys(actual).sort();
      if (expectedKeys.length !== actualKeys.length) {
        return makeTraceDiff(currentPath + '.__keys__', expectedKeys, actualKeys, 'object keys mismatch');
      }
      for (var j = 0; j < expectedKeys.length; j++) {
        if (expectedKeys[j] !== actualKeys[j]) {
          return makeTraceDiff(currentPath + '.__keys__', expectedKeys, actualKeys, 'object keys mismatch');
        }
      }
      for (var k = 0; k < expectedKeys.length; k++) {
        var key = expectedKeys[k];
        var diff = findFirstTraceDiff(actual[key], expected[key], currentPath + '.' + key);
        if (diff) {
          return diff;
        }
      }
      return null;
    }

    if (actual !== expected) {
      return makeTraceDiff(currentPath, expected, actual, 'value mismatch');
    }
    return null;
  }

  function traceFirstDiff(actualNode, expectedInput) {
    var actualState = (actualNode && (typeof actualNode === 'object' || typeof actualNode === 'function'))
      ? ensureNodeState(actualNode)
      : null;
    var actualSnapshot = snapshotNodeForTrace(actualNode);
    var expectedSnapshot = expectedInput;

    if (expectedInput && (typeof expectedInput === 'object' || typeof expectedInput === 'function')) {
      var maybeNodeState = getState(expectedInput);
      if (maybeNodeState && maybeNodeState.nodeRef === expectedInput) {
        expectedSnapshot = snapshotNodeForTrace(expectedInput);
      }
    }

    if (typeof expectedInput === 'string') {
      try {
        expectedSnapshot = JSON.parse(expectedInput);
      } catch (_) {
        expectedSnapshot = expectedInput;
      }
    }

    var diff = findFirstTraceDiff(actualSnapshot, expectedSnapshot, '$');
    return {
      matched: !diff,
      firstDiff: diff,
      actual: actualSnapshot,
      expected: expectedSnapshot
    };
  }

  function createNodeObject(ctorName, label) {
    var bridge = (typeof leapenv.getNativeBridge === 'function')
      ? (function () { try { return leapenv.getNativeBridge(); } catch (_) { return null; } })()
      : null;
    var created = null;

    if (bridge && typeof bridge.createSkeletonInstance === 'function') {
      try {
        created = bridge.createSkeletonInstance(ctorName, label || '');
      } catch (_) {
        created = null;
      }
    }

    if (!created && bridge && typeof bridge.createNative === 'function') {
      try {
        created = bridge.createNative(ctorName);
      } catch (_) {
        created = null;
      }
    }

    if (!created) {
      created = {};
    }

    setCtorName(created, ctorName);

    // Layer 2：为有 instance skeleton 的类型补装 C++ 级 instance-level 拦截器
    // C++ 通过 super_type == ctorName 自动匹配，无需手动维护映射表
    // 没有 instance skeleton 的类型（如 HTMLDivElement）C++ 侧静默返回
    if (bridge && typeof bridge.applyInstanceSkeleton === 'function') {
      try {
        bridge.applyInstanceSkeleton(created, ctorName);
      } catch (_) {}
    }

    var meta = inferNodeMeta(ctorName, label);
    ensureNodeState(created, {
      nodeType: meta.nodeType,
      nodeName: meta.nodeName,
      tagName: meta.tagName,
      nativeHandle: null
    });

    return created;
  }

  // ── I-11 事件系统分层设计 ────────────────────────────────────────────────────

  // Event 构造函数（真实原型链，确保 instanceof Event 通过）
  function LeapEvent(type, init) {
    if (!(this instanceof LeapEvent)) return new LeapEvent(type, init);
    var opts = init || {};
    this.type             = String(type);
    this.bubbles          = !!opts.bubbles;
    this.cancelable       = !!opts.cancelable;
    this.composed         = !!opts.composed;
    this.defaultPrevented = false;
    this.target           = null;
    this.currentTarget    = null;
    this.eventPhase       = 0;
    this.timeStamp        = Date.now();
    this._stopPropagation = false;
    this._stopImmediate   = false;
  }

  LeapEvent.prototype.NONE            = 0;
  LeapEvent.prototype.CAPTURING_PHASE = 1;
  LeapEvent.prototype.AT_TARGET       = 2;
  LeapEvent.prototype.BUBBLING_PHASE  = 3;
  Object.defineProperty(LeapEvent.prototype, 'isTrusted', {
    get: function() { return false; },
    enumerable: true,
    configurable: true
  });

  LeapEvent.prototype.preventDefault = function() {
    if (this.cancelable) this.defaultPrevented = true;
  };
  LeapEvent.prototype.stopPropagation = function() {
    this._stopPropagation = true;
  };
  LeapEvent.prototype.stopImmediatePropagation = function() {
    this._stopPropagation = true;
    this._stopImmediate   = true;
  };

  function createEvent(type, init) {
    return new LeapEvent(type, init);
  }

  // 确保节点 state 上的 _listeners Map 已初始化
  function ensureListeners(state) {
    if (!state._listeners) {
      // type -> entry[]（按注册顺序）
      state._listeners = new Map();
    }
    return state._listeners;
  }

  // 取某 type 下的监听器列表（按注册顺序）
  function getTypeMap(state, typeStr) {
    var listeners = ensureListeners(state);
    if (!listeners.has(typeStr)) {
      listeners.set(typeStr, []);
    }
    return listeners.get(typeStr);
  }

  function normalizeEventListenerOptions(options) {
    var capture = false, once = false, passive = false;
    if (options && typeof options === 'object') {
      capture = !!options.capture;
      once = !!options.once;
      passive = !!options.passive;
    } else if (typeof options === 'boolean') {
      capture = options;
    }
    return { capture: capture, once: once, passive: passive };
  }

  function addEventListener(node, type, listener, options) {
    if (typeof listener !== 'function') return;
    var state = ensureNodeState(node);
    var typeStr = String(type);

    var normalized = normalizeEventListenerOptions(options);
    var capture = normalized.capture;
    var once = normalized.once;
    var passive = normalized.passive;

    var typeMap = getTypeMap(state, typeStr);

    // 同一个 (fn, capture) 组合只注册一次（浏览器规范）
    for (var i = 0; i < typeMap.length; i++) {
      if (typeMap[i].fn === listener && !!typeMap[i].capture === capture) {
        return;
      }
    }

    typeMap.push({ fn: listener, once: once, capture: capture, passive: passive });
  }

  function removeEventListener(node, type, listener, options) {
    var state = ensureNodeState(node);
    if (!state._listeners) return;
    var typeStr = String(type);
    var typeMap = state._listeners.get(typeStr);
    if (!typeMap) return;
    var capture = normalizeEventListenerOptions(options).capture;
    for (var i = typeMap.length - 1; i >= 0; i--) {
      var entry = typeMap[i];
      if (entry && entry.fn === listener && !!entry.capture === capture) {
        typeMap.splice(i, 1);
      }
    }
    if (typeMap.length === 0) {
      state._listeners.delete(typeStr);
    }
  }

  function invokeEventListenersAtNode(nodeAtPhase, event, captureWanted, eventStateApi) {
    var stateAtPhase = ensureNodeState(nodeAtPhase);
    if (!stateAtPhase._listeners) {
      return;
    }
    var typeMap = stateAtPhase._listeners.get(event.type);
    if (!typeMap || typeMap.length === 0) {
      return;
    }

    // 快照：避免回调中增删监听器导致迭代错误
    var entries = typeMap.slice();
    for (var i = 0; i < entries.length; i++) {
      if ((eventStateApi && eventStateApi.isImmediateStopped && eventStateApi.isImmediateStopped(event)) ||
          event._stopImmediate) {
        break;
      }
      var entry = entries[i];
      if (!entry || !!entry.capture !== !!captureWanted) {
        continue;
      }
      try {
        entry.fn.call(nodeAtPhase, event);
      } catch (e) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[dispatchEvent] listener error:', e);
        }
      }
      if (entry.once) {
        removeEventListener(nodeAtPhase, event.type, entry.fn, { capture: !!entry.capture });
      }
    }
  }

  function dispatchEvent(node, event) {
    var eventStateApi = leapenv.EventImplState || null;
    // 构建冒泡路径（从目标到根）
    var path = [];
    var cur = node;
    while (cur) {
      path.push(cur);
      var s = ensureNodeState(cur);
      cur = s.parentNode || null;
    }

    event.target = node;
    if (eventStateApi && typeof eventStateApi.setPath === 'function') {
      try { eventStateApi.setPath(event, path); } catch (_) {}
    }
    if (eventStateApi && typeof eventStateApi.setDispatchPhase === 'function') {
      try { eventStateApi.setDispatchPhase(event, node, node, 2); } catch (_) {}
    }

    // 捕获阶段：根 -> 目标父
    for (var ci = path.length - 1; ci >= 1; ci--) {
      if ((eventStateApi && eventStateApi.isPropagationStopped && eventStateApi.isPropagationStopped(event)) ||
          event._stopPropagation) {
        break;
      }
      var captureNode = path[ci];
      event.currentTarget = captureNode;
      event.eventPhase = 1; // CAPTURING_PHASE
      if (eventStateApi && typeof eventStateApi.setDispatchPhase === 'function') {
        try { eventStateApi.setDispatchPhase(event, node, captureNode, 1); } catch (_) {}
      }
      invokeEventListenersAtNode(captureNode, event, true, eventStateApi);
    }

    // 目标阶段：先 capture 监听器，再 bubble 监听器
    if (!((eventStateApi && eventStateApi.isPropagationStopped && eventStateApi.isPropagationStopped(event)) ||
          event._stopPropagation)) {
      var targetNode = path[0];
      event.currentTarget = targetNode;
      event.eventPhase = 2; // AT_TARGET
      if (eventStateApi && typeof eventStateApi.setDispatchPhase === 'function') {
        try { eventStateApi.setDispatchPhase(event, node, targetNode, 2); } catch (_) {}
      }
      invokeEventListenersAtNode(targetNode, event, true, eventStateApi);
      if (!((eventStateApi && eventStateApi.isImmediateStopped && eventStateApi.isImmediateStopped(event)) ||
            event._stopImmediate)) {
        invokeEventListenersAtNode(targetNode, event, false, eventStateApi);
      }
    }

    // 冒泡阶段：目标父 -> 根
    if (event.bubbles) {
      for (var bi = 1; bi < path.length; bi++) {
        if ((eventStateApi && eventStateApi.isPropagationStopped && eventStateApi.isPropagationStopped(event)) ||
            event._stopPropagation) {
          break;
        }
        var bubbleNode = path[bi];
        event.currentTarget = bubbleNode;
        event.eventPhase = 3; // BUBBLING_PHASE
        if (eventStateApi && typeof eventStateApi.setDispatchPhase === 'function') {
          try { eventStateApi.setDispatchPhase(event, node, bubbleNode, 3); } catch (_) {}
        }
        invokeEventListenersAtNode(bubbleNode, event, false, eventStateApi);
      }
    }

    event.currentTarget = null;
    event.eventPhase = 0;
    if (eventStateApi && typeof eventStateApi.clearCurrentTarget === 'function') {
      try { eventStateApi.clearCurrentTarget(event); } catch (_) {}
    }
    return !event.defaultPrevented;
  }

  // 暴露 Event / CustomEvent 到全局
  (function() {
    global.Event = LeapEvent;

    function CustomEvent(type, init) {
      if (!(this instanceof CustomEvent)) return new CustomEvent(type, init);
      LeapEvent.call(this, type, init);
      this.detail = (init && init.detail !== undefined) ? init.detail : null;
    }
    CustomEvent.prototype = Object.create(LeapEvent.prototype);
    CustomEvent.prototype.constructor = CustomEvent;

    global.CustomEvent = CustomEvent;
  })();

  var domSharedApi = {
    getDomBackend: getDomBackend,
    setDomBackend: setDomBackend,
    getCtorName: getCtorName,
    setCtorName: setCtorName,
    ensureNodeState: ensureNodeState,
    ensureDocumentState: ensureDocumentState,
    ensureDocumentRegistration: ensureDocumentRegistration,
    ensureElementState: ensureElementState,
    createNodeList: createNodeList,
    createHTMLCollection: createHTMLCollection,
    appendChild: appendChild,
    removeChild: removeChild,
    insertBefore: insertBefore,
    setNodeAttribute: setNodeAttribute,
    setNodeAttributeNS: setNodeAttributeNS,
    getNodeAttribute: getNodeAttribute,
    getNodeAttributeNS: getNodeAttributeNS,
    hasNodeAttribute: hasNodeAttribute,
    hasNodeAttributeNS: hasNodeAttributeNS,
    removeNodeAttribute: removeNodeAttribute,
    removeNodeAttributeNS: removeNodeAttributeNS,
    setNodeId: setNodeId,
    getNodeId: getNodeId,
    setNodeClassName: setNodeClassName,
    getNodeClassName: getNodeClassName,
    getElementChildren: getElementChildren,
    getSiblingAtOffset: getSiblingAtOffset,
    getTextContent: getTextContent,
    setTextContent: setTextContent,
    querySelector: querySelector,
    querySelectorAll: querySelectorAll,
    getElementsByTagName: getElementsByTagName,
    getElementsByClassName: getElementsByClassName,
    getElementById: getElementById,
    getDocumentElement: getDocumentElement,
    getDocumentHead: getDocumentHead,
    getDocumentBody: getDocumentBody,
    ensureDocumentDefaultTree: ensureDocumentDefaultTree,
    setDocumentUrl: setDocumentUrl,
    getDocumentUrl: getDocumentUrl,
    getStyleSize: getStyleSize,
    ensureStyleObject: ensureStyleObject,
    createRect: createRect,
    getLayoutRect: getLayoutRect,
    getClientWidth: getClientWidth,
    getClientHeight: getClientHeight,
    getOffsetParent: getOffsetParent,
    getOffsetLeft: getOffsetLeft,
    getOffsetTop: getOffsetTop,
    createNodeObject: createNodeObject,
    createElementForDocument: createElementForDocument,
    createElementNSForDocument: createElementNSForDocument,
    parseHTMLIntoDocument: parseHTMLIntoDocument,
    parseHTMLUnsafe: parseHTMLUnsafe,
    inferNodeMeta: inferNodeMeta,
    createDocument: createDocument,
    getOrCreateTaskDocument: getOrCreateTaskDocument,
    releaseDocument: releaseDocument,
    releaseTaskScope: releaseTaskScope,
    releaseAllScopes: releaseAllScopes,
    getRuntimeStats: getRuntimeStats,
    drainReleaseStats: drainReleaseStats,
    beginTaskScope: beginTaskScope,
    endTaskScope: endTaskScope,
    getCurrentTaskId: getCurrentTaskId,
    snapshotNodeForTrace: snapshotNodeForTrace,
    traceFirstDiff: traceFirstDiff,
    markNodeDirty: markNodeDirty,
    serializeNode: serializeNode,
    serializeChildren: serializeChildren,
    escapeHTML: escapeHTML,
    setInnerHTML: setInnerHTML,
    setOuterHTML: setOuterHTML,
    parseHTMLFragment: parseHTMLFragment,
    cloneNode: cloneNode,
    createClassList: createClassList,
    matchesSelector: matchesSelector,
    createNamedNodeMap: createNamedNodeMap,
    getNodeAttributeNames: function(node) {
      var state = ensureNodeState(node);
      return state.attributeStore ? Object.keys(state.attributeStore) : [];
    },
    // I-11 事件系统
    addEventListener:    addEventListener,
    removeEventListener: removeEventListener,
    dispatchEvent:       dispatchEvent,
    createEvent:         createEvent,
    Event:               LeapEvent
  };
  try {
    Object.defineProperty(leapenv, 'domShared', {
      value: domSharedApi,
      writable: true,
      enumerable: false,
      configurable: true
    });
  } catch (_) {
    leapenv.domShared = domSharedApi;
  }
})(globalThis);
