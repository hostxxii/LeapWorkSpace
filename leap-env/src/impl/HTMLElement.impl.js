(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  class HTMLElementImpl {
    get style() {
      const state = dom.ensureElementState(this);
      return dom.ensureStyleObject(state);
    }

    set style(value) {
      const state = dom.ensureElementState(this);
      const styleObj = dom.ensureStyleObject(state);
      if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          styleObj[key] = value[key];
        }
        return;
      }
      if (typeof value === 'string') {
        styleObj.cssText = value;
      }
    }

    get offsetWidth() {
      dom.ensureElementState(this);
      return dom.getLayoutRect(this).width;
    }

    get offsetHeight() {
      dom.ensureElementState(this);
      return dom.getLayoutRect(this).height;
    }

    get offsetLeft() {
      dom.ensureElementState(this);
      return dom.getOffsetLeft(this);
    }

    get offsetTop() {
      dom.ensureElementState(this);
      return dom.getOffsetTop(this);
    }

    get offsetParent() {
      dom.ensureElementState(this);
      return dom.getOffsetParent(this);
    }
  }

  leapenv.registerImpl('HTMLElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLUnknownElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLHtmlElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLHeadElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLBodyElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLTitleElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLMetaElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLLinkElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLStyleElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLFormElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLInputElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLButtonElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLTextAreaElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLSelectElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLOptionElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLImageElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLParagraphElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLUListElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLOListElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLLIElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLDivElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLSpanElement', HTMLElementImpl);
  leapenv.registerImpl('HTMLAnchorElement', HTMLElementImpl);
})(globalThis);
