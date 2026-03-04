(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const DEFAULT_SCREEN_STATE = {
    width: 1920,
    height: 1080,
    availWidth: 1920,
    availHeight: 1040,
    availLeft: 0,
    availTop: 0,
    colorDepth: 24,
    pixelDepth: 24
  };

  function getTaskState() {
    if (typeof leapenv.getTaskState === 'function') {
      try {
        var runtimeState = leapenv.getTaskState();
        if (runtimeState && typeof runtimeState === 'object') {
          return runtimeState;
        }
      } catch (_) {}
    }
    return leapenv.signatureTaskState || null;
  }

  function getTaskScreenOverrides() {
    var state = getTaskState();
    return state && state.screen ? state.screen : null;
  }

  function getScreenNumber(key) {
    var overrides = getTaskScreenOverrides();
    var raw = overrides && Object.prototype.hasOwnProperty.call(overrides, key)
      ? overrides[key]
      : DEFAULT_SCREEN_STATE[key];
    var n = Number(raw);
    return Number.isFinite ? (Number.isFinite(n) ? n : DEFAULT_SCREEN_STATE[key]) : (isFinite(n) ? n : DEFAULT_SCREEN_STATE[key]);
  }

  class ScreenImpl {
    get width()       { return getScreenNumber('width'); }
    get height()      { return getScreenNumber('height'); }
    get availWidth()  { return getScreenNumber('availWidth'); }
    get availHeight() { return getScreenNumber('availHeight'); }
    get availLeft()   { return getScreenNumber('availLeft'); }
    get availTop()    { return getScreenNumber('availTop'); }
    get colorDepth()  { return getScreenNumber('colorDepth'); }
    get pixelDepth()  { return getScreenNumber('pixelDepth'); }
    get orientation() {
      return { type: 'landscape-primary', angle: 0 };
    }
  }

  leapenv.registerImpl('Screen', ScreenImpl);

  leapenv.screenImplDefaults = leapenv.screenImplDefaults || {
    getDefaults: function () {
      return { ...DEFAULT_SCREEN_STATE };
    }
  };
})(globalThis);
