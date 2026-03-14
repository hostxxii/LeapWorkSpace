(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  // 每个 performance 实例的私有状态（WeakMap 隔离）
  var _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;
  var _globalStart = Date.now();

  function getState(self) {
    if (!_stateMap) return { startTime: _globalStart };
    if (!_stateMap.has(self)) {
      _stateMap.set(self, { startTime: Date.now() });
    }
    return _stateMap.get(self);
  }

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

  function getPerformanceSeed() {
    var state = getTaskState();
    return state && state.performanceSeed ? state.performanceSeed : null;
  }

  function getResolvedTimeOrigin(self) {
    var seed = getPerformanceSeed();
    if (seed && seed.timeOrigin != null) {
      var seeded = Number(seed.timeOrigin);
      if (Number.isFinite ? Number.isFinite(seeded) : isFinite(seeded)) {
        return seeded;
      }
    }
    return getState(self).startTime;
  }

  function getResolvedNowOffset() {
    var seed = getPerformanceSeed();
    if (!seed) return 0;
    var raw = seed.startOffset;
    if (raw == null) raw = seed.startOffsetMs;
    var n = Number(raw || 0);
    return (Number.isFinite ? Number.isFinite(n) : isFinite(n)) ? n : 0;
  }

  class PerformanceImpl {
    now() {
      var timeOrigin = getResolvedTimeOrigin(this);
      return Date.now() - timeOrigin + getResolvedNowOffset() + Math.random() * 0.001;
    }

    get timeOrigin() {
      return getResolvedTimeOrigin(this);
    }

    get timing() {
      var t = getResolvedTimeOrigin(this);
      return {
        navigationStart:            t,
        unloadEventStart:           0,
        unloadEventEnd:             0,
        redirectStart:              0,
        redirectEnd:                0,
        fetchStart:                 t + 1,
        domainLookupStart:          t + 2,
        domainLookupEnd:            t + 3,
        connectStart:               t + 3,
        connectEnd:                 t + 5,
        secureConnectionStart:      t + 4,
        requestStart:               t + 6,
        responseStart:              t + 20,
        responseEnd:                t + 30,
        domLoading:                 t + 31,
        domInteractive:             t + 40,
        domContentLoadedEventStart: t + 41,
        domContentLoadedEventEnd:   t + 42,
        domComplete:                t + 50,
        loadEventStart:             t + 51,
        loadEventEnd:               t + 80
      };
    }

    get navigation() {
      return { type: 0, redirectCount: 0 };
    }

    get memory() {
      return {
        jsHeapSizeLimit:  2172649472,
        totalJSHeapSize:  10000000,
        usedJSHeapSize:   8000000
      };
    }

    get eventCounts() {
      return { size: 0 };
    }

    get onresourcetimingbufferfull() { return null; }
    set onresourcetimingbufferfull(val) { /* no-op */ }

    getEntries()                      { return []; }
    getEntriesByName(_name, _type)    { return []; }
    getEntriesByType(_type)           { return []; }
    mark(_name)                       { /* no-op */ }
    measure(_name, _start, _end)      { /* no-op */ }
    clearMarks(_name)                 { /* no-op */ }
    clearMeasures(_name)              { /* no-op */ }
    clearResourceTimings()            { /* no-op */ }
    setResourceTimingBufferSize(_size){ /* no-op */ }
    toJSON() {
      return {
        timeOrigin: this.timeOrigin,
        timing: this.timing,
        navigation: this.navigation
      };
    }
  }

  leapenv.registerImpl('Performance', PerformanceImpl);

  leapenv.performanceImplHelpers = leapenv.performanceImplHelpers || {
    reset: function (instance, seed) {
      if (!instance) return;
      var state = getState(instance);
      var next = seed && seed.timeOrigin != null ? Number(seed.timeOrigin) : Date.now();
      if (!(Number.isFinite ? Number.isFinite(next) : isFinite(next))) {
        next = Date.now();
      }
      state.startTime = next;
    }
  };
})(globalThis);
