// CharacterData 实现类 (Text/Comment 的公共基类)
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  class CharacterDataImpl {
    // data 等同于文本内容
    get data() {
      return dom.ensureNodeState(this).textContent || '';
    }

    set data(value) {
      const state = dom.ensureNodeState(this);
      state.textContent = value == null ? '' : String(value);
      dom.markNodeDirty(this);
    }

    get length() {
      return (dom.ensureNodeState(this).textContent || '').length;
    }

    get previousElementSibling() {
      let cur = dom.getSiblingAtOffset(this, -1);
      while (cur) {
        if (dom.ensureNodeState(cur).nodeType === 1) { return cur; }
        cur = dom.getSiblingAtOffset(cur, -1);
      }
      return null;
    }

    get nextElementSibling() {
      let cur = dom.getSiblingAtOffset(this, 1);
      while (cur) {
        if (dom.ensureNodeState(cur).nodeType === 1) { return cur; }
        cur = dom.getSiblingAtOffset(cur, 1);
      }
      return null;
    }

    // ChildNode mixin
    remove() {
      const state = dom.ensureNodeState(this);
      if (state.parentNode) { dom.removeChild(state.parentNode, this); }
    }

    after(...nodes) {
      const state = dom.ensureNodeState(this);
      const parent = state.parentNode;
      if (!parent) { return; }
      const ps = dom.ensureNodeState(parent);
      const idx = ps.childNodes.indexOf(this);
      const ref = ps.childNodes[idx + 1] || null;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (typeof n === 'string') {
          const tn = dom.createNodeObject('Text', '');
          dom.ensureNodeState(tn, { nodeType: 3, nodeName: '#text', tagName: '', textContent: n, ownerDocument: state.ownerDocument });
          dom.insertBefore(parent, tn, ref);
        } else {
          dom.insertBefore(parent, n, ref);
        }
      }
    }

    before(...nodes) {
      const state = dom.ensureNodeState(this);
      const parent = state.parentNode;
      if (!parent) { return; }
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (typeof n === 'string') {
          const tn = dom.createNodeObject('Text', '');
          dom.ensureNodeState(tn, { nodeType: 3, nodeName: '#text', tagName: '', textContent: n, ownerDocument: state.ownerDocument });
          dom.insertBefore(parent, tn, this);
        } else {
          dom.insertBefore(parent, n, this);
        }
      }
    }

    replaceWith(...nodes) {
      const state = dom.ensureNodeState(this);
      const parent = state.parentNode;
      if (!parent) { return; }
      const ps = dom.ensureNodeState(parent);
      const idx = ps.childNodes.indexOf(this);
      const ref = ps.childNodes[idx + 1] || null;
      dom.removeChild(parent, this);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (typeof n === 'string') {
          const tn = dom.createNodeObject('Text', '');
          dom.ensureNodeState(tn, { nodeType: 3, nodeName: '#text', tagName: '', textContent: n, ownerDocument: state.ownerDocument });
          dom.insertBefore(parent, tn, ref);
        } else {
          dom.insertBefore(parent, n, ref);
        }
      }
    }

    // CharacterData 字符串操作方法
    appendData(data) {
      const state = dom.ensureNodeState(this);
      state.textContent = (state.textContent || '') + String(data == null ? '' : data);
      dom.markNodeDirty(this);
    }

    deleteData(offset, count) {
      const state = dom.ensureNodeState(this);
      const text = state.textContent || '';
      state.textContent = text.slice(0, offset) + text.slice(offset + count);
      dom.markNodeDirty(this);
    }

    insertData(offset, data) {
      const state = dom.ensureNodeState(this);
      const text = state.textContent || '';
      state.textContent = text.slice(0, offset) + String(data == null ? '' : data) + text.slice(offset);
      dom.markNodeDirty(this);
    }

    replaceData(offset, count, data) {
      const state = dom.ensureNodeState(this);
      const text = state.textContent || '';
      state.textContent = text.slice(0, offset) + String(data == null ? '' : data) + text.slice(offset + count);
      dom.markNodeDirty(this);
    }

    substringData(offset, count) {
      return (dom.ensureNodeState(this).textContent || '').substr(offset, count);
    }
  }

  leapenv.registerImpl('CharacterData', CharacterDataImpl);

})(globalThis);
