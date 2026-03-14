(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  function getAttr(node, name) {
    dom.ensureElementState(node);
    var v = dom.getNodeAttribute(node, name);
    return v == null ? '' : String(v);
  }

  function setAttr(node, name, value) {
    dom.ensureElementState(node);
    dom.setNodeAttribute(node, name, value == null ? '' : String(value));
  }

  function getBoolAttr(node, name) {
    dom.ensureElementState(node);
    var v = dom.getNodeAttribute(node, name);
    return !(v == null || v === false);
  }

  function setBoolAttr(node, name, value) {
    dom.ensureElementState(node);
    if (value) {
      dom.setNodeAttribute(node, name, '');
      return;
    }
    if (typeof dom.removeNodeAttribute === 'function') {
      dom.removeNodeAttribute(node, name);
      return;
    }
    dom.setNodeAttribute(node, name, null);
  }

  class HTMLScriptElementImpl {
    supports(_type) {
      return false;
    }

    get src() { return getAttr(this, 'src'); }
    set src(v) { setAttr(this, 'src', v); }

    get type() { return getAttr(this, 'type'); }
    set type(v) { setAttr(this, 'type', v); }

    get noModule() { return getBoolAttr(this, 'nomodule'); }
    set noModule(v) { setBoolAttr(this, 'nomodule', !!v); }

    get charset() { return getAttr(this, 'charset'); }
    set charset(v) { setAttr(this, 'charset', v); }

    get async() { return getBoolAttr(this, 'async'); }
    set async(v) { setBoolAttr(this, 'async', !!v); }

    get defer() { return getBoolAttr(this, 'defer'); }
    set defer(v) { setBoolAttr(this, 'defer', !!v); }

    get crossOrigin() { return getAttr(this, 'crossorigin'); }
    set crossOrigin(v) { setAttr(this, 'crossorigin', v); }

    get text() {
      var state = dom.ensureNodeState(this);
      return state.textContent == null ? '' : String(state.textContent);
    }
    set text(v) {
      dom.ensureNodeState(this).textContent = v == null ? '' : String(v);
    }

    get referrerPolicy() { return getAttr(this, 'referrerpolicy'); }
    set referrerPolicy(v) { setAttr(this, 'referrerpolicy', v); }

    get fetchPriority() { return getAttr(this, 'fetchpriority'); }
    set fetchPriority(v) { setAttr(this, 'fetchpriority', v); }

    get event() { return getAttr(this, 'event'); }
    set event(v) { setAttr(this, 'event', v); }

    get htmlFor() { return getAttr(this, 'for'); }
    set htmlFor(v) { setAttr(this, 'for', v); }
  }

  leapenv.registerImpl('HTMLScriptElement', HTMLScriptElementImpl);
})(globalThis);
