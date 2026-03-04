(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;
  const _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getState(self) {
    if (_stateMap) {
      return _stateMap.get(self);
    }
    return self.__leapHtmlAllState || null;
  }

  function setState(self, state) {
    if (_stateMap) {
      _stateMap.set(self, state);
      return;
    }
    Object.defineProperty(self, '__leapHtmlAllState', {
      value: state,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  function createHTMLAllCollectionObject() {
    let obj = null;
    if (global.$native && typeof global.$native.createSkeletonInstance === 'function') {
      try {
        obj = global.$native.createSkeletonInstance('HTMLAllCollection', '');
      } catch (_) {
        obj = null;
      }
    }
    if (!obj && typeof global.__createNative__ === 'function') {
      try {
        obj = global.__createNative__('HTMLAllCollection');
      } catch (_) {
        obj = null;
      }
    }
    if (!obj) {
      obj = {};
    }
    if (typeof global.__applyInstanceSkeleton__ === 'function') {
      try { global.__applyInstanceSkeleton__(obj, 'HTMLAllCollection'); } catch (_) {}
    }
    return obj;
  }

  function getElements(documentNode) {
    if (!documentNode || !dom) {
      return [];
    }
    if (typeof dom.ensureDocumentDefaultTree === 'function') {
      dom.ensureDocumentDefaultTree(documentNode);
    } else {
      dom.ensureDocumentRegistration(documentNode);
    }
    return dom.querySelectorAll(documentNode, '*', false) || [];
  }

  function getDocumentFromCollection(self) {
    const state = getState(self);
    return state ? state.document : null;
  }

  function createOrGetCollectionForDocument(documentNode) {
    if (!documentNode || !dom) {
      return null;
    }
    const docState = dom.ensureNodeState(documentNode);
    if (docState._htmlAllCollection) {
      return docState._htmlAllCollection;
    }
    const collection = createHTMLAllCollectionObject();
    setState(collection, { document: documentNode });
    docState._htmlAllCollection = collection;
    return collection;
  }

  class HTMLAllCollectionImpl {
    get length() {
      return getElements(getDocumentFromCollection(this)).length;
    }

    item(index) {
      const list = getElements(getDocumentFromCollection(this));
      const i = Number(index);
      if (typeof i !== 'number' || i !== i || i === Infinity || i === -Infinity) {
        return null;
      }
      const idx = i < 0 ? -1 : (i < 0 ? Math.ceil(i) : Math.floor(i));
      return idx >= 0 && idx < list.length ? list[idx] : null;
    }

    namedItem(name) {
      const target = String(name == null ? '' : name);
      if (!target) {
        return null;
      }
      const list = getElements(getDocumentFromCollection(this));
      for (let i = 0; i < list.length; i++) {
        const node = list[i];
        let id = null;
        let attrName = null;
        try {
          id = dom.getNodeAttribute(node, 'id');
          attrName = dom.getNodeAttribute(node, 'name');
        } catch (_) {}
        if (id == null) {
          try { id = node.id; } catch (_) {}
        }
        if (attrName == null && node && typeof node.getAttribute === 'function') {
          try { attrName = node.getAttribute('name'); } catch (_) {}
        }
        if (id === target || attrName === target) {
          return node;
        }
      }
      return null;
    }

    ['@@iterator']() {
      const list = getElements(getDocumentFromCollection(this)).slice();
      let idx = 0;
      return {
        next() {
          if (idx >= list.length) {
            return { done: true, value: undefined };
          }
          return { done: false, value: list[idx++] };
        }
      };
    }
  }

  leapenv.getDocumentAllCollection = function(documentNode) {
    return createOrGetCollectionForDocument(documentNode);
  };

  leapenv.registerImpl('HTMLAllCollection', HTMLAllCollectionImpl);
})(globalThis);
