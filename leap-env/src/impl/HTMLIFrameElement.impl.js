// A3: HTMLIFrameElement implementation
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  // Track iframe instances to their child frame index
  var _iframeFrameIndex = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  // Determine if a URL is same-origin relative to the main page.
  // For v1, treat all URLs with same scheme+host as same-origin;
  // absent or relative URLs are considered same-origin.
  function isSameOrigin(url) {
    if (!url || url === 'about:blank') return true;
    try {
      // Simple heuristic: if it starts with the same origin, it's same-origin.
      // Main page origin is https://www.example.com by default.
      var mainOrigin = (typeof location !== 'undefined' && location && location.origin)
        ? location.origin
        : 'https://www.example.com';
      if (url.indexOf('://') === -1) return true; // relative URL
      var urlOrigin = url.split('/').slice(0, 3).join('/');
      return urlOrigin === mainOrigin;
    } catch (e) {
      return true;
    }
  }

  function ensureChildFrame(iframe, url) {
    if (typeof __createChildFrame__ !== 'function') return -1;
    var existingIndex = _iframeFrameIndex ? _iframeFrameIndex.get(iframe) : undefined;
    if (existingIndex !== undefined && existingIndex >= 0) {
      // Already has a frame - navigate it
      if (typeof __navigateChildFrame__ === 'function') {
        __navigateChildFrame__(existingIndex, url);
      }
      return existingIndex;
    }
    // Create new child frame
    var sameOrigin = isSameOrigin(url);
    var index = __createChildFrame__(url, sameOrigin);
    if (index >= 0 && _iframeFrameIndex) {
      _iframeFrameIndex.set(iframe, index);
    }
    return index;
  }

  class HTMLIFrameElementImpl {
    // ── src getter/setter ──────────────────────────────────────────────────
    get src() {
      if (dom) {
        dom.ensureElementState(this);
        return dom.getNodeAttribute(this, 'src') || '';
      }
      return '';
    }

    set src(value) {
      var url = String(value == null ? '' : value);
      if (dom) {
        dom.ensureElementState(this);
        dom.setNodeAttribute(this, 'src', url);
      }
      // Trigger child frame creation/navigation
      if (url) {
        ensureChildFrame(this, url);
      }
    }

    // ── contentWindow ──────────────────────────────────────────────────────
    get contentWindow() {
      if (typeof __getChildFrameProxy__ !== 'function') return null;
      var index = _iframeFrameIndex ? _iframeFrameIndex.get(this) : undefined;
      if (index === undefined || index < 0) return null;
      return __getChildFrameProxy__(index);
    }

    // ── contentDocument ────────────────────────────────────────────────────
    get contentDocument() {
      var cw = this.contentWindow;
      if (cw && cw.document) return cw.document;
      return null;
    }

    // ── setAttribute override for 'src' linkage ────────────────────────────
    setAttribute(name, value) {
      if (dom) {
        dom.ensureElementState(this);
        dom.setNodeAttribute(this, name, value);
      }
      if (String(name).toLowerCase() === 'src') {
        var url = String(value == null ? '' : value);
        if (url) {
          ensureChildFrame(this, url);
        }
      }
    }

    // ── width/height accessors ─────────────────────────────────────────────
    get width() {
      if (dom) {
        dom.ensureElementState(this);
        return dom.getNodeAttribute(this, 'width') || '';
      }
      return '';
    }

    set width(value) {
      if (dom) {
        dom.ensureElementState(this);
        dom.setNodeAttribute(this, 'width', String(value));
      }
    }

    get height() {
      if (dom) {
        dom.ensureElementState(this);
        return dom.getNodeAttribute(this, 'height') || '';
      }
      return '';
    }

    set height(value) {
      if (dom) {
        dom.ensureElementState(this);
        dom.setNodeAttribute(this, 'height', String(value));
      }
    }

    // ── style (inherit from HTMLElement) ────────────────────────────────────
    get style() {
      if (dom) {
        const state = dom.ensureElementState(this);
        return dom.ensureStyleObject(state);
      }
      return {};
    }

    set style(value) {
      if (dom) {
        const state = dom.ensureElementState(this);
        const styleObj = dom.ensureStyleObject(state);
        if (value && typeof value === 'object') {
          const keys = Object.keys(value);
          for (let i = 0; i < keys.length; i++) {
            styleObj[keys[i]] = value[keys[i]];
          }
        } else if (typeof value === 'string') {
          styleObj.cssText = value;
        }
      }
    }

    // ── offsetWidth/offsetHeight ────────────────────────────────────────────
    get offsetWidth() {
      if (dom) {
        dom.ensureElementState(this);
        return dom.getLayoutRect(this).width;
      }
      return 0;
    }

    get offsetHeight() {
      if (dom) {
        dom.ensureElementState(this);
        return dom.getLayoutRect(this).height;
      }
      return 0;
    }

    get offsetLeft() {
      if (dom) {
        dom.ensureElementState(this);
        return dom.getOffsetLeft(this);
      }
      return 0;
    }

    get offsetTop() {
      if (dom) {
        dom.ensureElementState(this);
        return dom.getOffsetTop(this);
      }
      return 0;
    }

    get offsetParent() {
      if (dom) {
        dom.ensureElementState(this);
        return dom.getOffsetParent(this);
      }
      return null;
    }
  }

  leapenv.registerImpl('HTMLIFrameElement', HTMLIFrameElementImpl);
})(globalThis);
