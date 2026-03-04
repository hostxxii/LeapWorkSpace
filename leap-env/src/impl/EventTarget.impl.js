// EventTarget 实现类 (I-11 更新：委托给 domShared 事件 API，支持冒泡)
(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  class EventTargetImpl {
    addEventListener(type, listener, options) {
      var dom = leapenv.domShared;
      if (dom && dom.addEventListener) {
        dom.addEventListener(this, type, listener, options);
      }
    }

    removeEventListener(type, listener, options) {
      var dom = leapenv.domShared;
      if (dom && dom.removeEventListener) {
        dom.removeEventListener(this, type, listener, options);
      }
    }

    dispatchEvent(event) {
      var dom = leapenv.domShared;
      if (dom && dom.dispatchEvent) {
        return dom.dispatchEvent(this, event);
      }
      return true;
    }

    when(type) {
      // Promise-based one-time event listener
      var self = this;
      return new Promise(function(resolve) {
        self.addEventListener(type, resolve, { once: true });
      });
    }
  }

  // 注册到 implRegistry
  leapenv.registerImpl('EventTarget', EventTargetImpl);

})(globalThis);
