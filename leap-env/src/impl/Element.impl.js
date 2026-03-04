(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  class ElementImpl {
    get tagName() {
      const state = dom.ensureElementState(this);
      return state.tagName || state.nodeName || '';
    }

    get children() {
      dom.ensureElementState(this);
      return dom.createHTMLCollection(null, () => dom.getElementChildren(this));
    }

    get id() {
      dom.ensureElementState(this);
      return dom.getNodeId(this);
    }

    set id(value) {
      dom.ensureElementState(this);
      dom.setNodeId(this, value);
    }

    get className() {
      dom.ensureElementState(this);
      return dom.getNodeClassName(this);
    }

    set className(value) {
      dom.ensureElementState(this);
      dom.setNodeClassName(this, value);
    }

    getAttribute(name) {
      dom.ensureElementState(this);
      return dom.getNodeAttribute(this, name);
    }

    setAttribute(name, value) {
      dom.ensureElementState(this);
      dom.setNodeAttribute(this, name, value);
    }

    hasAttribute(name) {
      dom.ensureElementState(this);
      return dom.hasNodeAttribute(this, name);
    }

    removeAttribute(name) {
      dom.ensureElementState(this);
      dom.removeNodeAttribute(this, name);
    }

    getElementsByClassName(classNameText) {
      dom.ensureElementState(this);
      return dom.createHTMLCollection(dom.getElementsByClassName(this, classNameText, false));
    }

    getElementsByTagName(tagName) {
      dom.ensureElementState(this);
      return dom.createHTMLCollection(dom.getElementsByTagName(this, tagName, false));
    }

    querySelector(selectorText) {
      dom.ensureElementState(this);
      return dom.querySelector(this, selectorText, false);
    }

    querySelectorAll(selectorText) {
      dom.ensureElementState(this);
      return dom.createNodeList(dom.querySelectorAll(this, selectorText, false));
    }

    getBoundingClientRect() {
      dom.ensureElementState(this);
      return dom.getLayoutRect(this);
    }

    get clientWidth() {
      dom.ensureElementState(this);
      return dom.getClientWidth(this);
    }

    get clientHeight() {
      dom.ensureElementState(this);
      return dom.getClientHeight(this);
    }

    // B1: innerHTML / outerHTML
    get innerHTML() {
      dom.ensureElementState(this);
      return dom.serializeChildren(this);
    }

    set innerHTML(html) {
      dom.ensureElementState(this);
      dom.setInnerHTML(this, html);
    }

    get outerHTML() {
      dom.ensureElementState(this);
      return dom.serializeNode(this);
    }

    set outerHTML(html) {
      dom.ensureElementState(this);
      dom.setOuterHTML(this, html);
    }

    // B10: classList
    get classList() {
      dom.ensureElementState(this);
      const state = dom.ensureNodeState(this);
      if (!state._classList) {
        state._classList = dom.createClassList(this);
      }
      if (leapenv.refreshDOMTokenListObject) {
        leapenv.refreshDOMTokenListObject(state._classList);
      }
      return state._classList;
    }

    set classList(value) {
      dom.setNodeClassName(this, value == null ? '' : String(value));
    }

    // B11: matches / closest
    matches(selector) {
      dom.ensureElementState(this);
      return dom.matchesSelector(this, selector);
    }

    closest(selector) {
      dom.ensureElementState(this);
      let cur = this;
      while (cur) {
        const cs = dom.ensureNodeState(cur);
        if (cs.nodeType !== 1) { break; }
        if (dom.matchesSelector(cur, selector)) { return cur; }
        cur = cs.parentNode;
      }
      return null;
    }

    // B13: attributes (NamedNodeMap)
    get attributes() {
      dom.ensureElementState(this);
      const state = dom.ensureNodeState(this);
      if (!state._namedNodeMap) {
        state._namedNodeMap = dom.createNamedNodeMap(this);
      }
      if (leapenv.refreshNamedNodeMapObject) {
        leapenv.refreshNamedNodeMapObject(state._namedNodeMap);
      }
      return state._namedNodeMap;
    }

    getAttributeNames() {
      dom.ensureElementState(this);
      return dom.getNodeAttributeNames(this);
    }

    hasAttributes() {
      dom.ensureElementState(this);
      const state = dom.ensureNodeState(this);
      return !!(state.attributeStore && Object.keys(state.attributeStore).length > 0);
    }

    // B12: remove / after / before / append / prepend / replaceWith
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

    replaceChildren(...nodes) {
      const state = dom.ensureNodeState(this);
      const children = state.childNodes.slice();
      for (let i = 0; i < children.length; i++) { dom.removeChild(this, children[i]); }
      for (let i = 0; i < nodes.length; i++) { dom.appendChild(this, nodes[i]); }
    }

    // Element skeleton 中已声明但 impl 缺失的 stubs
    get namespaceURI() {
      const state = dom.ensureNodeState(this);
      return state.namespaceURI || 'http://www.w3.org/1999/xhtml';
    }
    get prefix() {
      const state = dom.ensureNodeState(this);
      return state.prefix || null;
    }
    get localName() {
      const state = dom.ensureNodeState(this);
      if (state.localName) {
        return String(state.localName);
      }
      return String(state.tagName || state.nodeName || '').toLowerCase();
    }
    get slot() { return dom.getNodeAttribute(this, 'slot') || ''; }
    set slot(v) { dom.setNodeAttribute(this, 'slot', v == null ? '' : String(v)); }
    get shadowRoot() { return null; }
    get part() { return dom.getNodeAttribute(this, 'part') || ''; }
    set part(v) { dom.setNodeAttribute(this, 'part', v == null ? '' : String(v)); }
    get assignedSlot() { return null; }
    get firstElementChild() {
      const c = dom.getElementChildren(this);
      return c.length ? c[0] : null;
    }
    get lastElementChild() {
      const c = dom.getElementChildren(this);
      return c.length ? c[c.length - 1] : null;
    }
    get childElementCount() { return dom.getElementChildren(this).length; }
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
    get scrollTop() { return 0; }
    set scrollTop(_v) {}
    get scrollLeft() { return 0; }
    set scrollLeft(_v) {}
    get scrollWidth() { return dom.getClientWidth(this); }
    get scrollHeight() { return dom.getClientHeight(this); }
    get clientTop() { return 0; }
    get clientLeft() { return 0; }
    getClientRects() { return [dom.getLayoutRect(this)]; }
    insertAdjacentElement(position, element) {
      const pos = String(position).toLowerCase();
      if (pos === 'beforebegin') { this.before(element); }
      else if (pos === 'afterbegin') { this.prepend(element); }
      else if (pos === 'beforeend') { this.append(element); }
      else if (pos === 'afterend') { this.after(element); }
      return element;
    }
    insertAdjacentHTML(position, html) {
      const frag = dom.createNodeObject('DocumentFragment', '');
      dom.ensureNodeState(frag, { nodeType: 11, nodeName: '#document-fragment', tagName: '' });
      dom.parseHTMLFragment(frag, html, dom.ensureNodeState(this).ownerDocument);
      this.insertAdjacentElement(position, frag);
    }
    insertAdjacentText(position, text) {
      const tn = dom.createNodeObject('Text', '');
      dom.ensureNodeState(tn, { nodeType: 3, nodeName: '#text', tagName: '', textContent: String(text == null ? '' : text) });
      this.insertAdjacentElement(position, tn);
    }
    setAttributeNS(ns, name, value) {
      if (typeof dom.setNodeAttributeNS === 'function') {
        dom.setNodeAttributeNS(this, ns, name, value);
        return;
      }
      dom.setNodeAttribute(this, name, value);
    }
    getAttributeNS(ns, name) {
      if (typeof dom.getNodeAttributeNS === 'function') {
        return dom.getNodeAttributeNS(this, ns, name);
      }
      return dom.getNodeAttribute(this, name);
    }
    hasAttributeNS(ns, name) {
      if (typeof dom.hasNodeAttributeNS === 'function') {
        return dom.hasNodeAttributeNS(this, ns, name);
      }
      return dom.hasNodeAttribute(this, name);
    }
    removeAttributeNS(ns, name) {
      if (typeof dom.removeNodeAttributeNS === 'function') {
        dom.removeNodeAttributeNS(this, ns, name);
        return;
      }
      dom.removeNodeAttribute(this, name);
    }
    toggleAttribute(name, force) {
      const has = dom.hasNodeAttribute(this, name);
      if (force === true || (!has && force !== false)) {
        if (!has) { dom.setNodeAttribute(this, name, ''); }
        return true;
      }
      if (has) { dom.removeNodeAttribute(this, name); }
      return false;
    }
    getAttributeNode(name) {
      const v = dom.getNodeAttribute(this, name);
      return v !== null ? { name, value: v, nodeType: 2 } : null;
    }
    getAttributeNodeNS(ns, name) {
      const v = this.getAttributeNS(ns, name);
      return v !== null ? { name, localName: name, namespaceURI: ns == null ? null : String(ns), value: v, nodeType: 2 } : null;
    }
    setAttributeNode(attr) { dom.setNodeAttribute(this, attr.name, attr.value); return null; }
    setAttributeNodeNS(attr) { return this.setAttributeNode(attr); }
    removeAttributeNode(attr) { dom.removeNodeAttribute(this, attr.name); return attr; }
    attachShadow() { return null; }
    animate() { return { play(){}, pause(){}, cancel(){}, finished: Promise.resolve() }; }
    getAnimations() { return []; }
    checkVisibility() { return true; }
    computedStyleMap() { return { get() { return null; } }; }
    getElementsByTagNameNS(_ns, tagName) { return dom.createHTMLCollection(dom.getElementsByTagName(this, tagName, false)); }
    getHTML() { return this.innerHTML; }
    setHTMLUnsafe(html) { this.innerHTML = html; }
    moveBefore(node, ref) { dom.insertBefore(this, node, ref); }
    hasPointerCapture() { return false; }
    releasePointerCapture() {}
    setPointerCapture() {}
    requestFullscreen() { return Promise.resolve(); }
    requestPointerLock() {}
    webkitRequestFullScreen() {}
    webkitRequestFullscreen() {}
    webkitMatchesSelector(sel) { return this.matches(sel); }
    scroll() {}
    scrollBy() {}
    scrollTo() {}
    scrollIntoView() {}
    scrollIntoViewIfNeeded() {}
    get currentCSSZoom() { return 1; }
    get onbeforecopy() { return null; } set onbeforecopy(_v) {}
    get onbeforecut() { return null; }  set onbeforecut(_v) {}
    get onbeforepaste() { return null; } set onbeforepaste(_v) {}
    get onsearch() { return null; } set onsearch(_v) {}
    get elementTiming() { return ''; } set elementTiming(_v) {}
    get onfullscreenchange() { return null; } set onfullscreenchange(_v) {}
    get onfullscreenerror() { return null; } set onfullscreenerror(_v) {}
    get onwebkitfullscreenchange() { return null; } set onwebkitfullscreenchange(_v) {}
    get onwebkitfullscreenerror() { return null; } set onwebkitfullscreenerror(_v) {}
    get role() { return dom.getNodeAttribute(this, 'role') || ''; }
    set role(v) { dom.setNodeAttribute(this, 'role', v == null ? '' : String(v)); }
    // ARIA stubs (读写 aria-* 属性)
    _aria(name) { return dom.getNodeAttribute(this, 'aria-' + name) || null; }
    _setAria(name, v) { dom.setNodeAttribute(this, 'aria-' + name, v == null ? '' : String(v)); }
    get ariaAtomic() { return this._aria('atomic'); } set ariaAtomic(v) { this._setAria('atomic', v); }
    get ariaAutoComplete() { return this._aria('autocomplete'); } set ariaAutoComplete(v) { this._setAria('autocomplete', v); }
    get ariaBusy() { return this._aria('busy'); } set ariaBusy(v) { this._setAria('busy', v); }
    get ariaBrailleLabel() { return this._aria('braillelabel'); } set ariaBrailleLabel(v) { this._setAria('braillelabel', v); }
    get ariaBrailleRoleDescription() { return this._aria('brailleroledescription'); } set ariaBrailleRoleDescription(v) { this._setAria('brailleroledescription', v); }
    get ariaChecked() { return this._aria('checked'); } set ariaChecked(v) { this._setAria('checked', v); }
    get ariaColCount() { return this._aria('colcount'); } set ariaColCount(v) { this._setAria('colcount', v); }
    get ariaColIndex() { return this._aria('colindex'); } set ariaColIndex(v) { this._setAria('colindex', v); }
    get ariaColIndexText() { return this._aria('colindextext'); } set ariaColIndexText(v) { this._setAria('colindextext', v); }
    get ariaColSpan() { return this._aria('colspan'); } set ariaColSpan(v) { this._setAria('colspan', v); }
    get ariaCurrent() { return this._aria('current'); } set ariaCurrent(v) { this._setAria('current', v); }
    get ariaDescription() { return this._aria('description'); } set ariaDescription(v) { this._setAria('description', v); }
    get ariaDisabled() { return this._aria('disabled'); } set ariaDisabled(v) { this._setAria('disabled', v); }
    get ariaExpanded() { return this._aria('expanded'); } set ariaExpanded(v) { this._setAria('expanded', v); }
    get ariaHasPopup() { return this._aria('haspopup'); } set ariaHasPopup(v) { this._setAria('haspopup', v); }
    get ariaHidden() { return this._aria('hidden'); } set ariaHidden(v) { this._setAria('hidden', v); }
    get ariaInvalid() { return this._aria('invalid'); } set ariaInvalid(v) { this._setAria('invalid', v); }
    get ariaKeyShortcuts() { return this._aria('keyshortcuts'); } set ariaKeyShortcuts(v) { this._setAria('keyshortcuts', v); }
    get ariaLabel() { return this._aria('label'); } set ariaLabel(v) { this._setAria('label', v); }
    get ariaLevel() { return this._aria('level'); } set ariaLevel(v) { this._setAria('level', v); }
    get ariaLive() { return this._aria('live'); } set ariaLive(v) { this._setAria('live', v); }
    get ariaModal() { return this._aria('modal'); } set ariaModal(v) { this._setAria('modal', v); }
    get ariaMultiLine() { return this._aria('multiline'); } set ariaMultiLine(v) { this._setAria('multiline', v); }
    get ariaMultiSelectable() { return this._aria('multiselectable'); } set ariaMultiSelectable(v) { this._setAria('multiselectable', v); }
    get ariaOrientation() { return this._aria('orientation'); } set ariaOrientation(v) { this._setAria('orientation', v); }
    get ariaPlaceholder() { return this._aria('placeholder'); } set ariaPlaceholder(v) { this._setAria('placeholder', v); }
    get ariaPosInSet() { return this._aria('posinset'); } set ariaPosInSet(v) { this._setAria('posinset', v); }
    get ariaPressed() { return this._aria('pressed'); } set ariaPressed(v) { this._setAria('pressed', v); }
    get ariaReadOnly() { return this._aria('readonly'); } set ariaReadOnly(v) { this._setAria('readonly', v); }
    get ariaRelevant() { return this._aria('relevant'); } set ariaRelevant(v) { this._setAria('relevant', v); }
    get ariaRequired() { return this._aria('required'); } set ariaRequired(v) { this._setAria('required', v); }
    get ariaRoleDescription() { return this._aria('roledescription'); } set ariaRoleDescription(v) { this._setAria('roledescription', v); }
    get ariaRowCount() { return this._aria('rowcount'); } set ariaRowCount(v) { this._setAria('rowcount', v); }
    get ariaRowIndex() { return this._aria('rowindex'); } set ariaRowIndex(v) { this._setAria('rowindex', v); }
    get ariaRowIndexText() { return this._aria('rowindextext'); } set ariaRowIndexText(v) { this._setAria('rowindextext', v); }
    get ariaRowSpan() { return this._aria('rowspan'); } set ariaRowSpan(v) { this._setAria('rowspan', v); }
    get ariaSelected() { return this._aria('selected'); } set ariaSelected(v) { this._setAria('selected', v); }
    get ariaSetSize() { return this._aria('setsize'); } set ariaSetSize(v) { this._setAria('setsize', v); }
    get ariaSort() { return this._aria('sort'); } set ariaSort(v) { this._setAria('sort', v); }
    get ariaValueMax() { return this._aria('valuemax'); } set ariaValueMax(v) { this._setAria('valuemax', v); }
    get ariaValueMin() { return this._aria('valuemin'); } set ariaValueMin(v) { this._setAria('valuemin', v); }
    get ariaValueNow() { return this._aria('valuenow'); } set ariaValueNow(v) { this._setAria('valuenow', v); }
    get ariaValueText() { return this._aria('valuetext'); } set ariaValueText(v) { this._setAria('valuetext', v); }
    get ariaActiveDescendantElement() { return null; } set ariaActiveDescendantElement(_v) {}
    get ariaControlsElements() { return null; } set ariaControlsElements(_v) {}
    get ariaDescribedByElements() { return null; } set ariaDescribedByElements(_v) {}
    get ariaDetailsElements() { return null; } set ariaDetailsElements(_v) {}
    get ariaErrorMessageElements() { return null; } set ariaErrorMessageElements(_v) {}
    get ariaFlowToElements() { return null; } set ariaFlowToElements(_v) {}
    get ariaLabelledByElements() { return null; } set ariaLabelledByElements(_v) {}
  }

  leapenv.registerImpl('Element', ElementImpl);
})(globalThis);
