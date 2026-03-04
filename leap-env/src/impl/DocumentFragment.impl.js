// DocumentFragment 实现类
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  class DocumentFragmentImpl {
    get children() {
      return dom.createHTMLCollection(null, () => dom.getElementChildren(this));
    }

    get firstElementChild() {
      const c = dom.getElementChildren(this);
      return c.length ? c[0] : null;
    }

    get lastElementChild() {
      const c = dom.getElementChildren(this);
      return c.length ? c[c.length - 1] : null;
    }

    get childElementCount() {
      return dom.getElementChildren(this).length;
    }

    append(...nodes) {
      const state = dom.ensureNodeState(this);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (typeof n === 'string') {
          const tn = dom.createNodeObject('Text', '');
          dom.ensureNodeState(tn, { nodeType: 3, nodeName: '#text', tagName: '', textContent: n, ownerDocument: state.ownerDocument });
          dom.appendChild(this, tn);
        } else {
          dom.appendChild(this, n);
        }
      }
    }

    prepend(...nodes) {
      const state = dom.ensureNodeState(this);
      const firstChild = state.childNodes[0] || null;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (typeof n === 'string') {
          const tn = dom.createNodeObject('Text', '');
          dom.ensureNodeState(tn, { nodeType: 3, nodeName: '#text', tagName: '', textContent: n, ownerDocument: state.ownerDocument });
          dom.insertBefore(this, tn, firstChild);
        } else {
          dom.insertBefore(this, n, firstChild);
        }
      }
    }

    getElementById(id) {
      return dom.getElementById(this, id);
    }

    querySelector(selector) {
      return dom.querySelector(this, selector, false);
    }

    querySelectorAll(selector) {
      return dom.createNodeList(dom.querySelectorAll(this, selector, false));
    }

    replaceChildren(...nodes) {
      const state = dom.ensureNodeState(this);
      const children = state.childNodes.slice();
      for (let i = 0; i < children.length; i++) { dom.removeChild(this, children[i]); }
      for (let i = 0; i < nodes.length; i++) { dom.appendChild(this, nodes[i]); }
    }

    moveBefore(node, ref) {
      dom.insertBefore(this, node, ref);
    }
  }

  leapenv.registerImpl('DocumentFragment', DocumentFragmentImpl);

})(globalThis);
