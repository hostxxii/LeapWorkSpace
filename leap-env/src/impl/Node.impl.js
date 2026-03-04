(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  class NodeImpl {
    get nodeType() {
      return dom.ensureNodeState(this).nodeType;
    }

    get nodeName() {
      return dom.ensureNodeState(this).nodeName || '';
    }

    get parentNode() {
      return dom.ensureNodeState(this).parentNode;
    }

    get childNodes() {
      return dom.createNodeList(null, () => dom.ensureNodeState(this).childNodes);
    }

    get firstChild() {
      const state = dom.ensureNodeState(this);
      return state.childNodes.length ? state.childNodes[0] : null;
    }

    get lastChild() {
      const state = dom.ensureNodeState(this);
      return state.childNodes.length ? state.childNodes[state.childNodes.length - 1] : null;
    }

    get previousSibling() {
      return dom.getSiblingAtOffset(this, -1);
    }

    get nextSibling() {
      return dom.getSiblingAtOffset(this, 1);
    }

    get ownerDocument() {
      return dom.ensureNodeState(this).ownerDocument;
    }

    get textContent() {
      return dom.getTextContent(this);
    }

    set textContent(value) {
      dom.setTextContent(this, value);
    }

    appendChild(child) {
      return dom.appendChild(this, child);
    }

    removeChild(child) {
      return dom.removeChild(this, child);
    }

    insertBefore(child, beforeNode) {
      return dom.insertBefore(this, child, beforeNode);
    }

    hasChildNodes() {
      return dom.ensureNodeState(this).childNodes.length > 0;
    }

    contains(otherNode) {
      if (!otherNode || (typeof otherNode !== 'object' && typeof otherNode !== 'function')) {
        return false;
      }
      if (otherNode === this) {
        return true;
      }
      const state = dom.ensureNodeState(this);
      const stack = state.childNodes.slice();
      while (stack.length) {
        const cur = stack.pop();
        if (cur === otherNode) {
          return true;
        }
        const curState = dom.ensureNodeState(cur);
        for (let i = 0; i < curState.childNodes.length; i++) {
          stack.push(curState.childNodes[i]);
        }
      }
      return false;
    }

    // B8: nodeValue
    get nodeValue() {
      const state = dom.ensureNodeState(this);
      const nt = state.nodeType;
      if (nt === 3 || nt === 8) { return state.textContent || ''; }
      return null;
    }

    set nodeValue(value) {
      const state = dom.ensureNodeState(this);
      const nt = state.nodeType;
      if (nt === 3 || nt === 8) {
        state.textContent = value == null ? '' : String(value);
        dom.markNodeDirty(this);
      }
    }

    // B9: baseURI
    get baseURI() {
      const state = dom.ensureNodeState(this);
      const doc = state.ownerDocument || (state.nodeType === 9 ? this : null);
      if (doc) {
        const ds = dom.ensureNodeState(doc);
        return ds.url || 'about:blank';
      }
      return 'about:blank';
    }

    // B7: isConnected
    get isConnected() {
      const state = dom.ensureNodeState(this);
      if (state.nodeType === 9) { return true; }
      let cur = state.parentNode;
      while (cur) {
        const cs = dom.ensureNodeState(cur);
        if (cs.nodeType === 9) { return true; }
        cur = cs.parentNode;
      }
      return false;
    }

    // B7: parentElement
    get parentElement() {
      const state = dom.ensureNodeState(this);
      const p = state.parentNode;
      if (!p) { return null; }
      const ps = dom.ensureNodeState(p);
      return ps.nodeType === 1 ? p : null;
    }

    // B5: cloneNode
    cloneNode(deep) {
      return dom.cloneNode(this, !!deep);
    }

    // B6: replaceChild
    replaceChild(newChild, oldChild) {
      const state = dom.ensureNodeState(this);
      const idx = state.childNodes.indexOf(oldChild);
      if (idx < 0) { throw new Error('NotFoundError'); }
      dom.insertBefore(this, newChild, oldChild);
      dom.removeChild(this, oldChild);
      return oldChild;
    }

    // Node skeleton 已声明但 impl 缺失的其余方法 (stubs)
    getRootNode() {
      let cur = this;
      while (true) {
        const s = dom.ensureNodeState(cur);
        if (!s.parentNode) { return cur; }
        cur = s.parentNode;
      }
    }

    normalize() {
      // 合并相邻文本节点，移除空文本节点
      const state = dom.ensureNodeState(this);
      const children = state.childNodes.slice();
      for (let i = 0; i < children.length; i++) {
        const cs = dom.ensureNodeState(children[i]);
        if (cs.nodeType === 3) {
          if (!cs.textContent) {
            dom.removeChild(this, children[i]);
          } else {
            let j = i + 1;
            while (j < children.length && dom.ensureNodeState(children[j]).nodeType === 3) {
              cs.textContent += dom.ensureNodeState(children[j]).textContent || '';
              dom.removeChild(this, children[j]);
              children.splice(j, 1);
            }
          }
        } else {
          children[i].normalize && children[i].normalize();
        }
      }
    }

    isEqualNode(other) {
      if (!other) { return false; }
      const s1 = dom.ensureNodeState(this), s2 = dom.ensureNodeState(other);
      if (s1.nodeType !== s2.nodeType) { return false; }
      if (s1.nodeName !== s2.nodeName) { return false; }
      if (s1.textContent !== s2.textContent) { return false; }
      if (s1.childNodes.length !== s2.childNodes.length) { return false; }
      for (let i = 0; i < s1.childNodes.length; i++) {
        if (!s1.childNodes[i].isEqualNode || !s1.childNodes[i].isEqualNode(s2.childNodes[i])) {
          return false;
        }
      }
      return true;
    }

    isSameNode(other) { return this === other; }
    lookupPrefix(namespaceURI) {
      const target = namespaceURI == null ? null : String(namespaceURI);
      if (!target) { return null; }
      let cur = this;
      while (cur) {
        const s = dom.ensureNodeState(cur);
        if (s.nodeType === 1 && s.namespaceURI === target) {
          return s.prefix || null;
        }
        cur = s.parentNode || null;
      }
      return null;
    }

    lookupNamespaceURI(prefix) {
      const targetPrefix = prefix == null ? null : String(prefix);
      let cur = this;
      while (cur) {
        const s = dom.ensureNodeState(cur);
        if (s.nodeType === 1) {
          const nodePrefix = s.prefix || null;
          if (nodePrefix === targetPrefix) {
            return s.namespaceURI || null;
          }
          if (targetPrefix === null && !nodePrefix && s.namespaceURI) {
            return s.namespaceURI;
          }
        }
        cur = s.parentNode || null;
      }
      return null;
    }

    isDefaultNamespace(ns) {
      const currentDefault = this.lookupNamespaceURI(null);
      const target = ns == null || ns === '' ? null : String(ns);
      return currentDefault === target;
    }
    compareDocumentPosition(other) {
      if (!other || (typeof other !== 'object' && typeof other !== 'function')) {
        return 1; // DISCONNECTED
      }
      if (other === this) {
        return 0;
      }

      const DOCUMENT_POSITION_DISCONNECTED = 0x01;
      const DOCUMENT_POSITION_PRECEDING = 0x02;
      const DOCUMENT_POSITION_FOLLOWING = 0x04;
      const DOCUMENT_POSITION_CONTAINS = 0x08;
      const DOCUMENT_POSITION_CONTAINED_BY = 0x10;
      const DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC = 0x20;

      function getPath(node) {
        const out = [];
        let cur = node;
        while (cur) {
          out.push(cur);
          const s = dom.ensureNodeState(cur);
          cur = s.parentNode || null;
        }
        out.reverse(); // root -> node
        return out;
      }

      const pathA = getPath(this);
      const pathB = getPath(other);
      if (pathA.length === 0 || pathB.length === 0 || pathA[0] !== pathB[0]) {
        return DOCUMENT_POSITION_DISCONNECTED |
          DOCUMENT_POSITION_PRECEDING |
          DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
      }

      let i = 0;
      while (i < pathA.length && i < pathB.length && pathA[i] === pathB[i]) {
        i++;
      }

      // this 是 other 的祖先：other 相对 this 为 FOLLOWING + CONTAINED_BY
      if (i === pathA.length) {
        return DOCUMENT_POSITION_FOLLOWING | DOCUMENT_POSITION_CONTAINED_BY;
      }
      // this 是 other 的后代：other 相对 this 为 PRECEDING + CONTAINS
      if (i === pathB.length) {
        return DOCUMENT_POSITION_PRECEDING | DOCUMENT_POSITION_CONTAINS;
      }

      const lca = pathA[i - 1];
      const childA = pathA[i];
      const childB = pathB[i];
      const siblings = dom.ensureNodeState(lca).childNodes || [];
      const idxA = siblings.indexOf(childA);
      const idxB = siblings.indexOf(childB);
      if (idxA < 0 || idxB < 0 || idxA === idxB) {
        return DOCUMENT_POSITION_DISCONNECTED |
          DOCUMENT_POSITION_PRECEDING |
          DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
      }
      // this 在前 => other 在后（FOLLOWING）
      return idxA < idxB
        ? DOCUMENT_POSITION_FOLLOWING
        : DOCUMENT_POSITION_PRECEDING;
    }

    // I-11 EventTarget mixin（委托给 domShared 事件 API，支持冒泡）
    addEventListener(type, listener, options) {
      dom.addEventListener(this, type, listener, options);
    }

    removeEventListener(type, listener, options) {
      dom.removeEventListener(this, type, listener, options);
    }

    dispatchEvent(event) {
      return dom.dispatchEvent(this, event);
    }
  }

  leapenv.registerImpl('Node', NodeImpl);
})(globalThis);
