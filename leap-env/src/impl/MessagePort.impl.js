(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});
  const shared = leapenv.messagePortShared || {};

  function ensureShared() {
    if (!shared || typeof shared.getPortState !== 'function') {
      throw new Error('MessagePort shared state is not initialized (load MessageChannel.impl.js first)');
    }
    return shared;
  }

  function ensurePortState(port) {
    var s = ensureShared();
    var state = s.getPortState(port);
    if (state) return state;
    return s.createPortState(port);
  }

  function normalizeHandler(value) {
    return typeof value === 'function' ? value : null;
  }

  class MessagePortImpl {
    get onmessage() {
      return ensurePortState(this).onmessage;
    }

    set onmessage(listener) {
      var state = ensurePortState(this);
      state.onmessage = normalizeHandler(listener);
      state.started = true;
      if (state.queue && state.queue.length > 0) {
        ensureShared().schedulePortFlush(this);
      }
    }

    get onmessageerror() {
      return ensurePortState(this).onmessageerror;
    }

    set onmessageerror(listener) {
      ensurePortState(this).onmessageerror = normalizeHandler(listener);
    }

    close() {
      var state = ensurePortState(this);
      if (state.closed) return;

      state.closed = true;
      state.started = false;
      state.onmessage = null;
      state.onmessageerror = null;
      state.deliveryScheduled = false;
      if (typeof ensureShared().notePortClosed === 'function') {
        ensureShared().notePortClosed(this);
      }
      if (Array.isArray(state.queue)) {
        state.queue.length = 0;
      }

      var peer = state.entangledPort;
      state.entangledPort = null;
      if (peer) {
        var peerState = ensurePortState(peer);
        if (peerState.entangledPort === this) {
          peerState.entangledPort = null;
        }
      }
    }

    postMessage(message /*, transfer */) {
      var state = ensurePortState(this);
      if (state.closed) return;

      var peer = state.entangledPort;
      if (!peer) return;

      var peerState = ensurePortState(peer);
      if (peerState.closed) return;

      peerState.queue.push(message);
      if (typeof ensureShared().noteMessageQueued === 'function') {
        ensureShared().noteMessageQueued();
      }
      if (peerState.started) {
        var s = ensureShared();
        s.schedulePortFlush(peer);
        // Some LeapVM host flows do not pump queued async callbacks reliably
        // between runScript boundaries; fall back to immediate drain so
        // MessageChannel remains functional for scheduler-style usage.
        if (peerState.queue.length > 0 && typeof s.flushPortQueue === 'function') {
          s.flushPortQueue(peer);
        }
      }
    }

    start() {
      var state = ensurePortState(this);
      if (state.closed) return;
      state.started = true;
      if (state.queue && state.queue.length > 0) {
        ensureShared().schedulePortFlush(this);
      }
    }
  }

  leapenv.registerImpl('MessagePort', MessagePortImpl);
})(globalThis);
