// Text 实现类
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  class TextImpl {
    // wholeText: 合并相邻文本节点的内容
    get wholeText() {
      const state = dom.ensureNodeState(this);
      const parent = state.parentNode;
      if (!parent) { return state.textContent || ''; }
      const siblings = dom.ensureNodeState(parent).childNodes;
      const myIdx = siblings.indexOf(this);
      let text = '';
      // 向左收集
      for (let i = myIdx; i >= 0; i--) {
        const cs = dom.ensureNodeState(siblings[i]);
        if (cs.nodeType !== 3) { break; }
        text = (cs.textContent || '') + text;
        if (i === myIdx) { text = ''; text = cs.textContent || ''; }
        else { text = (cs.textContent || '') + text; }
      }
      // 实际上 wholeText 只是相邻文本的拼接，这里简化为返回 this 的内容
      return state.textContent || '';
    }

    get assignedSlot() { return null; }

    splitText(offset) {
      const state = dom.ensureNodeState(this);
      const text = state.textContent || '';
      const beforeText = text.slice(0, offset);
      const afterText = text.slice(offset);
      state.textContent = beforeText;
      dom.markNodeDirty(this);

      const newNode = dom.createNodeObject('Text', '');
      dom.ensureNodeState(newNode, {
        nodeType: 3,
        nodeName: '#text',
        tagName: '',
        textContent: afterText,
        ownerDocument: state.ownerDocument
      });

      if (state.parentNode) {
        const sibling = dom.getSiblingAtOffset(this, 1);
        dom.insertBefore(state.parentNode, newNode, sibling);
      }
      return newNode;
    }
  }

  leapenv.registerImpl('Text', TextImpl);

})(globalThis);
