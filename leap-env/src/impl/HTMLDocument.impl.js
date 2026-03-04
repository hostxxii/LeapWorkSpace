(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const dom = leapenv.domShared;

  if (!dom) {
    throw new Error('[leapenv][dom] domShared not initialized');
  }

  class HTMLDocumentImpl {
    // document.location 与 window.location 是同一个原生 Location 单例
    get location() {
      return leapenv.nativeInstances && leapenv.nativeInstances['location'];
    }

    set location(value) {
      const loc = leapenv.nativeInstances && leapenv.nativeInstances['location'];
      if (loc) loc.href = String(value == null ? 'about:blank' : value);
    }
  }

  leapenv.registerImpl('HTMLDocument', HTMLDocumentImpl);
})(globalThis);
