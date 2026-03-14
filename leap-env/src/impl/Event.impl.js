(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  const EVENT_NONE = 0;
  const EVENT_CAPTURING_PHASE = 1;
  const EVENT_AT_TARGET = 2;
  const EVENT_BUBBLING_PHASE = 3;
  const _stateMap = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function getFallbackState(self) {
    if (!self.__leapEventState) {
      Object.defineProperty(self, '__leapEventState', {
        value: null,
        writable: true,
        configurable: true,
        enumerable: false
      });
    }
    return self.__leapEventState;
  }

  function setFallbackState(self, state) {
    if (!Object.prototype.hasOwnProperty.call(self, '__leapEventState')) {
      Object.defineProperty(self, '__leapEventState', {
        value: state,
        writable: true,
        configurable: true,
        enumerable: false
      });
      return;
    }
    self.__leapEventState = state;
  }

  function ensureEventState(self) {
    let state = _stateMap ? _stateMap.get(self) : getFallbackState(self);
    if (!state) {
      const ownDescType = Object.getOwnPropertyDescriptor(self, 'type');
      const ownDescTarget = Object.getOwnPropertyDescriptor(self, 'target');
      const ownDescCurrentTarget = Object.getOwnPropertyDescriptor(self, 'currentTarget');
      const ownDescEventPhase = Object.getOwnPropertyDescriptor(self, 'eventPhase');
      const ownDescBubbles = Object.getOwnPropertyDescriptor(self, 'bubbles');
      const ownDescCancelable = Object.getOwnPropertyDescriptor(self, 'cancelable');
      const ownDescComposed = Object.getOwnPropertyDescriptor(self, 'composed');
      const ownDescDefaultPrevented = Object.getOwnPropertyDescriptor(self, 'defaultPrevented');
      const ownDescIsTrusted = Object.getOwnPropertyDescriptor(self, 'isTrusted');
      const ownDescTimeStamp = Object.getOwnPropertyDescriptor(self, 'timeStamp');
      const ownDescStopPropagation = Object.getOwnPropertyDescriptor(self, '_stopPropagation');
      const ownDescStopImmediate = Object.getOwnPropertyDescriptor(self, '_stopImmediate');
      state = {
        type: ownDescType && 'value' in ownDescType ? String(ownDescType.value == null ? '' : ownDescType.value) : '',
        target: ownDescTarget && 'value' in ownDescTarget ? (ownDescTarget.value || null) : null,
        currentTarget: ownDescCurrentTarget && 'value' in ownDescCurrentTarget ? (ownDescCurrentTarget.value || null) : null,
        eventPhase: ownDescEventPhase && 'value' in ownDescEventPhase ? (Number(ownDescEventPhase.value) || EVENT_NONE) : EVENT_NONE,
        bubbles: !!(ownDescBubbles && 'value' in ownDescBubbles ? ownDescBubbles.value : false),
        cancelable: !!(ownDescCancelable && 'value' in ownDescCancelable ? ownDescCancelable.value : false),
        composed: !!(ownDescComposed && 'value' in ownDescComposed ? ownDescComposed.value : false),
        defaultPrevented: !!(ownDescDefaultPrevented && 'value' in ownDescDefaultPrevented ? ownDescDefaultPrevented.value : false),
        isTrusted: !!(ownDescIsTrusted && 'value' in ownDescIsTrusted ? ownDescIsTrusted.value : false),
        timeStamp: ownDescTimeStamp && 'value' in ownDescTimeStamp ? (Number(ownDescTimeStamp.value) || Date.now()) : Date.now(),
        stopPropagation: !!(ownDescStopPropagation && 'value' in ownDescStopPropagation ? ownDescStopPropagation.value : false),
        stopImmediate: !!(ownDescStopImmediate && 'value' in ownDescStopImmediate ? ownDescStopImmediate.value : false),
        path: Array.isArray(self._path) ? self._path.slice() : null
      };
      if (_stateMap) {
        _stateMap.set(self, state);
      } else {
        setFallbackState(self, state);
      }
    }
    return state;
  }

  function mirrorStopFlags(self, state) {
    try { self._stopPropagation = !!state.stopPropagation; } catch (_) {}
    try { self._stopImmediate = !!state.stopImmediate; } catch (_) {}
  }

  class EventImpl {
    get type() { return ensureEventState(this).type; }
    get target() { return ensureEventState(this).target; }
    get currentTarget() { return ensureEventState(this).currentTarget; }
    get eventPhase() { return ensureEventState(this).eventPhase; }
    get bubbles() { return ensureEventState(this).bubbles; }
    get cancelable() { return ensureEventState(this).cancelable; }
    get defaultPrevented() { return ensureEventState(this).defaultPrevented; }
    get composed() { return ensureEventState(this).composed; }
    get timeStamp() { return ensureEventState(this).timeStamp; }
    get srcElement() { return ensureEventState(this).target; }

    get returnValue() {
      return !ensureEventState(this).defaultPrevented;
    }
    set returnValue(value) {
      if (value === false) {
        this.preventDefault();
      }
    }

    get cancelBubble() {
      return !!ensureEventState(this).stopPropagation;
    }
    set cancelBubble(value) {
      const state = ensureEventState(this);
      state.stopPropagation = !!value;
      if (state.stopPropagation) {
        mirrorStopFlags(this, state);
      }
    }

    composedPath() {
      const state = ensureEventState(this);
      if (Array.isArray(state.path)) {
        return state.path.slice();
      }
      if (state.target) {
        return [state.target];
      }
      return [];
    }

    initEvent(type, bubbles, cancelable) {
      const state = ensureEventState(this);
      state.type = String(type == null ? '' : type);
      state.bubbles = !!bubbles;
      state.cancelable = !!cancelable;
      state.defaultPrevented = false;
      state.target = null;
      state.currentTarget = null;
      state.eventPhase = EVENT_NONE;
      state.stopPropagation = false;
      state.stopImmediate = false;
      state.path = null;
      mirrorStopFlags(this, state);
    }

    preventDefault() {
      const state = ensureEventState(this);
      if (state.cancelable) {
        state.defaultPrevented = true;
      }
    }

    stopPropagation() {
      const state = ensureEventState(this);
      state.stopPropagation = true;
      mirrorStopFlags(this, state);
    }

    stopImmediatePropagation() {
      const state = ensureEventState(this);
      state.stopPropagation = true;
      state.stopImmediate = true;
      mirrorStopFlags(this, state);
    }
  }

  leapenv.EventImplState = leapenv.EventImplState || {
    NONE: EVENT_NONE,
    CAPTURING_PHASE: EVENT_CAPTURING_PHASE,
    AT_TARGET: EVENT_AT_TARGET,
    BUBBLING_PHASE: EVENT_BUBBLING_PHASE,
    ensureEventState: ensureEventState,
    setPath(event, path) {
      const state = ensureEventState(event);
      state.path = Array.isArray(path) ? path.slice() : null;
    },
    setDispatchPhase(event, target, currentTarget, phase) {
      const state = ensureEventState(event);
      state.target = target || null;
      state.currentTarget = currentTarget || null;
      state.eventPhase = Number(phase) || EVENT_NONE;
    },
    clearCurrentTarget(event) {
      const state = ensureEventState(event);
      state.currentTarget = null;
      state.eventPhase = EVENT_NONE;
    },
    isPropagationStopped(event) {
      const state = ensureEventState(event);
      return !!state.stopPropagation || !!event._stopPropagation;
    },
    isImmediateStopped(event) {
      const state = ensureEventState(event);
      return !!state.stopImmediate || !!event._stopImmediate;
    }
  };

  leapenv.registerImpl('Event', EventImpl);
})(globalThis);
