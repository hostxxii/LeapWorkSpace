(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  const weakChannels = typeof WeakMap === 'function' ? new WeakMap() : null;
  const weakPorts = typeof WeakMap === 'function' ? new WeakMap() : null;
  const fallbackChannels = [];
  const fallbackPorts = [];
  const liveChannels = [];
  const livePorts = [];
  const runtimeStats = {
    messageChannelCount: 0,
    messagePortOpenCount: 0,
    messagePortClosedCount: 0,
    messagePortQueueCount: 0
  };

  function trackLive(list, value) {
    if (value == null || list.indexOf(value) !== -1) {
      return;
    }
    list.push(value);
  }

  function untrackLive(list, value) {
    var index = list.indexOf(value);
    if (index === -1) {
      return;
    }
    list.splice(index, 1);
  }

  function getFallbackEntry(list, key) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  }

  function getChannelState(channel) {
    if (weakChannels) return weakChannels.get(channel);
    var entry = getFallbackEntry(fallbackChannels, channel);
    return entry ? entry.state : undefined;
  }

  function setChannelState(channel, state) {
    if (weakChannels) {
      weakChannels.set(channel, state);
      return;
    }
    var entry = getFallbackEntry(fallbackChannels, channel);
    if (entry) {
      entry.state = state;
      return;
    }
    fallbackChannels.push({ key: channel, state: state });
  }

  function getPortState(port) {
    if (weakPorts) return weakPorts.get(port);
    var entry = getFallbackEntry(fallbackPorts, port);
    return entry ? entry.state : undefined;
  }

  function setPortState(port, state) {
    if (weakPorts) {
      weakPorts.set(port, state);
      return;
    }
    var entry = getFallbackEntry(fallbackPorts, port);
    if (entry) {
      entry.state = state;
      return;
    }
    fallbackPorts.push({ key: port, state: state });
  }

  function createSkeletonInstance(ctorName) {
    var bridge = (typeof leapenv.getNativeBridge === 'function')
      ? (function () { try { return leapenv.getNativeBridge(); } catch (_) { return null; } })()
      : null;
    var obj = null;
    if (bridge && typeof bridge.createSkeletonInstance === 'function') {
      try { obj = bridge.createSkeletonInstance(ctorName, ''); } catch (_) { obj = null; }
    }
    if (!obj && bridge && typeof bridge.createNative === 'function') {
      try { obj = bridge.createNative(ctorName); } catch (_) { obj = null; }
    }
    if (!obj) {
      obj = {};
      try {
        var ctor = global[ctorName];
        if (ctor && ctor.prototype) {
          Object.setPrototypeOf(obj, ctor.prototype);
        }
      } catch (_) {}
    }
    if (leapenv.domShared && typeof leapenv.domShared.setCtorName === 'function') {
      try { leapenv.domShared.setCtorName(obj, ctorName); } catch (_) {}
    }
    return obj;
  }

  function reportAsyncError(error) {
    try {
      if (global.console && typeof global.console.error === 'function') {
        global.console.error('[MessagePort] listener error:', error);
      }
    } catch (_) {}
  }

  function createMessageEvent(data) {
    var dom = leapenv.domShared;
    var event = null;
    if (dom && typeof dom.createEvent === 'function') {
      try { event = dom.createEvent('message'); } catch (_) { event = null; }
    }
    if (!event) {
      event = { type: 'message', bubbles: false, cancelable: false };
    }
    try { event.data = data; } catch (_) {}
    try { event.origin = ''; } catch (_) {}
    try { event.lastEventId = ''; } catch (_) {}
    try { event.source = null; } catch (_) {}
    try { event.ports = []; } catch (_) {}
    return event;
  }

  function resolveHostSchedule() {
    if (typeof leapenv.getHostTimers === 'function') {
      try {
        var timers = leapenv.getHostTimers();
        if (timers && typeof timers.setTimeout === 'function') {
          return timers.setTimeout;
        }
      } catch (_) {}
    }
    if (leapenv.__runtime && leapenv.__runtime.host && leapenv.__runtime.host.timers &&
        typeof leapenv.__runtime.host.timers.setTimeout === 'function') {
      return leapenv.__runtime.host.timers.setTimeout;
    }
    if (typeof global.setTimeout === 'function') {
      try {
        return global.setTimeout.bind(global);
      } catch (_) {
        return global.setTimeout;
      }
    }
    return null;
  }

  function dispatchPortMessage(port, payload) {
    var state = getPortState(port);
    if (!state || state.closed) return;

    var event = createMessageEvent(payload);
    var handler = state.onmessage;
    if (typeof handler === 'function') {
      try {
        handler.call(port, event);
      } catch (error) {
        reportAsyncError(error);
      }
    }

    if (state.closed) return;

    try {
      if (typeof port.dispatchEvent === 'function') {
        port.dispatchEvent(event);
      }
    } catch (error) {
      reportAsyncError(error);
    }
  }

  function flushPortQueue(port) {
    var state = getPortState(port);
    if (!state) return;
    state.deliveryScheduled = false;
    if (state.closed || !state.started) return;

    while (!state.closed && state.started && state.queue.length > 0) {
      var item = state.queue.shift();
      if (runtimeStats.messagePortQueueCount > 0) {
        runtimeStats.messagePortQueueCount -= 1;
      }
      dispatchPortMessage(port, item);
    }

    if (!state.closed && state.started && state.queue.length > 0) {
      schedulePortFlush(port);
    }
  }

  function schedulePortFlush(port) {
    var state = getPortState(port);
    if (!state || state.closed || state.deliveryScheduled || !state.started || state.queue.length === 0) {
      return;
    }
    state.deliveryScheduled = true;

    function runScheduledFlush() {
      try {
        flushPortQueue(port);
      } catch (error) {
        var st = getPortState(port);
        if (st) st.deliveryScheduled = false;
        reportAsyncError(error);
      }
    }

    if (typeof Promise === 'function' && Promise.resolve) {
      Promise.resolve().then(runScheduledFlush);
      return;
    }

    if (typeof global.queueMicrotask === 'function') {
      global.queueMicrotask(runScheduledFlush);
      return;
    }

    var schedule = resolveHostSchedule();
    if (schedule) {
      schedule(runScheduledFlush, 0);
      return;
    }

    // No scheduler available: degrade to sync delivery.
    flushPortQueue(port);
  }

  function createPortState(port) {
    var state = {
      port: port,
      entangledPort: null,
      channelState: null,
      onmessage: null,
      onmessageerror: null,
      started: true,
      closed: false,
      deliveryScheduled: false,
      queue: []
    };
    runtimeStats.messagePortOpenCount += 1;
    trackLive(livePorts, port);
    setPortState(port, state);
    return state;
  }

  function ensureChannelState(channel) {
    var state = getChannelState(channel);
    if (state) return state;

    var port1 = createSkeletonInstance('MessagePort');
    var port2 = createSkeletonInstance('MessagePort');
    var port1State = getPortState(port1) || createPortState(port1);
    var port2State = getPortState(port2) || createPortState(port2);

    port1State.entangledPort = port2;
    port2State.entangledPort = port1;

    state = {
      channel: channel,
      port1: port1,
      port2: port2,
      openPorts: 2,
      active: true
    };
    port1State.channelState = state;
    port2State.channelState = state;
    runtimeStats.messageChannelCount += 1;
    trackLive(liveChannels, channel);
    setChannelState(channel, state);
    return state;
  }

  function getMessagePortRuntimeStats() {
    return {
      messageChannelCount: runtimeStats.messageChannelCount,
      messagePortOpenCount: runtimeStats.messagePortOpenCount,
      messagePortClosedCount: runtimeStats.messagePortClosedCount,
      messagePortQueueCount: runtimeStats.messagePortQueueCount
    };
  }

  function notePortClosed(port) {
    var state = getPortState(port);
    if (!state) {
      return;
    }
    untrackLive(livePorts, port);
    if (runtimeStats.messagePortOpenCount > 0) {
      runtimeStats.messagePortOpenCount -= 1;
    }
    runtimeStats.messagePortClosedCount += 1;
    if (runtimeStats.messagePortQueueCount > 0 && Array.isArray(state.queue) && state.queue.length > 0) {
      runtimeStats.messagePortQueueCount = Math.max(0, runtimeStats.messagePortQueueCount - state.queue.length);
    }
    if (state.channelState && state.channelState.active) {
      state.channelState.openPorts = Math.max(0, Number(state.channelState.openPorts || 0) - 1);
      if (state.channelState.openPorts === 0) {
        state.channelState.active = false;
        untrackLive(liveChannels, state.channelState.channel);
        if (runtimeStats.messageChannelCount > 0) {
          runtimeStats.messageChannelCount -= 1;
        }
      }
    }
  }

  function noteMessageQueued() {
    runtimeStats.messagePortQueueCount += 1;
  }

  function resetMessagePortTaskState() {
    var ports = livePorts.slice();
    for (var i = 0; i < ports.length; i++) {
      var port = ports[i];
      try {
        if (port && typeof port.close === 'function') {
          port.close();
        }
      } catch (_) {}
    }
    livePorts.length = 0;
    liveChannels.length = 0;
    runtimeStats.messageChannelCount = 0;
    runtimeStats.messagePortOpenCount = 0;
    runtimeStats.messagePortClosedCount = 0;
    runtimeStats.messagePortQueueCount = 0;
    return true;
  }

  leapenv.messagePortShared = leapenv.messagePortShared || {};
  leapenv.messagePortShared.getPortState = getPortState;
  leapenv.messagePortShared.setPortState = setPortState;
  leapenv.messagePortShared.createPortState = createPortState;
  leapenv.messagePortShared.schedulePortFlush = schedulePortFlush;
  leapenv.messagePortShared.flushPortQueue = flushPortQueue;
  leapenv.messagePortShared.reportAsyncError = reportAsyncError;
  leapenv.messagePortShared.getRuntimeStats = getMessagePortRuntimeStats;
  leapenv.messagePortShared.notePortClosed = notePortClosed;
  leapenv.messagePortShared.noteMessageQueued = noteMessageQueued;
  leapenv.messagePortShared.resetRuntimeState = resetMessagePortTaskState;

  class MessageChannelImpl {
    get port1() {
      return ensureChannelState(this).port1;
    }

    get port2() {
      return ensureChannelState(this).port2;
    }
  }

  leapenv.registerImpl('MessageChannel', MessageChannelImpl);
  try {
    MessageChannelImpl.__leapGetRuntimeStats = getMessagePortRuntimeStats;
    MessageChannelImpl.__leapResetTaskState = resetMessagePortTaskState;
  } catch (_) {}
  try {
    if (leapenv.implRegistry && leapenv.implRegistry.MessageChannel) {
      leapenv.implRegistry.MessageChannel.__leapGetRuntimeStats = getMessagePortRuntimeStats;
      leapenv.implRegistry.MessageChannel.__leapResetTaskState = resetMessagePortTaskState;
    }
  } catch (_) {}
  try {
    if (leapenv.__runtime && typeof leapenv.__runtime === 'object') {
      leapenv.__runtime.messagePortGetStats = getMessagePortRuntimeStats;
      leapenv.__runtime.messagePortTaskReset = resetMessagePortTaskState;
    }
  } catch (_) {}
})(globalThis);
