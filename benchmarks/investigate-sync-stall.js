const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { PerformanceObserver, constants, monitorEventLoopDelay } = require('perf_hooks');
const { ThreadPool } = require('../leap-env/src/pool/thread-pool');
const { ProcessPool } = require('../leap-env/src/pool/process-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_TASK_PHASE_TRACE) {
  process.env.LEAPVM_TASK_PHASE_TRACE = '1';
}
if (!process.env.LEAPVM_TASK_API_TRACE) {
  process.env.LEAPVM_TASK_API_TRACE = '1';
}

const DEFAULTS = {
  backend: 'thread',
  repeats: 6,
  poolSize: 12,
  concurrency: 48,
  maxTasksPerWorker: 500,
  warmupTasks: 20,
  totalTasks: 550,
  sampleEvery: 50,
  enableVmInspector: false,
  captureVmCpuProfileOnStall: false,
  captureHostThreadSnapshotsOnStall: false,
  threadSnapshotIntervalMs: 100,
  threadSnapshotBufferSize: 160,
  taskTimeoutMs: 30000,
  workerInitTimeoutMs: 30000,
  heartbeatIntervalMs: 60000,
  heartbeatTimeoutMs: 240000,
  signatureProfile: 'fp-occupy',
  slowTaskThresholdMs: 1000,
  disableMessageChannel: false,
  blockSecurityScript: false,
  clearH5stCacheKeys: false,
  stubCanvasFingerprint: false,
  stubCookieEmpty: false,
  disableParamSignAsyncInit: false,
  disableParamSignRds: false,
  disableParamSignRgo: false,
  disableParamSignRam: false,
  stubParamSignWs: false,
  stubParamSignJsonStringify: false,
  stubParamSignWsDispatch: false,
  stubParamSignWsDirectCall: false,
  stubParamSignWsDirectFullArgs: false,
  stubParamSignWsApplyArray: false,
  stubParamSignWsGenericArray: false,
  stubParamSignWsReflectArray: false,
  stubParamSignWsFnApplyCallArray: false,
  stubParamSignWsShallowArg: false,
  stubParamSignEncodeChain: false,
  stubParamSignUtf8Parse: false,
  stubParamSignBase64Encode: false,
  stubInputBodySha256: false,
  stubParamSignAtm: false,
  stubParamSignGdk: false,
  stubParamSignGs: false,
  stubParamSignGsd: false,
  stubParamSignCps: false,
  stubParamSignCpsSingleEntry: false,
  stubParamSignCpsEmpty: false,
  stubParamSignClt: false,
  stubParamSignMs: false,
  stubParamSignSdnmd: false,
  stubParamSignRamEnvOnly: false,
  stubParamSignPv: false,
  traceParamSignMethods: false
};

const SILENCE_CONSOLE_BEFORE_SCRIPT = [
  'console.log = function () {};',
  'console.info = function () {};',
  'console.warn = function () {};',
  'console.error = function () {};'
].join('');

function buildTaskApiTraceBeforeScript() {
  return `
    (function () {
      var g = globalThis;
      var trace = g.__leapTaskApiTrace;
      if (!trace || typeof trace !== 'object') {
        var originalDateNow = Date.now.bind(Date);
        var originalPerfNow = (g.performance && typeof g.performance.now === 'function')
          ? g.performance.now.bind(g.performance)
          : null;
        var state = {
          currentTaskId: '',
          taskStats: {},
          nextPortId: 1,
          pendingPortPosts: {},
          now: function now() {
            if (originalPerfNow) {
              try { return Number(originalPerfNow()) || 0; } catch (_) {}
            }
            try { return Number(originalDateNow()) || 0; } catch (_) {}
            return 0;
          },
          beginTask: function beginTask(taskId) {
            this.currentTaskId = String(taskId || '');
            this.taskStats = {};
            this.pendingPortPosts = {};
          },
          record: function record(name, durationMs) {
            var key = String(name || 'unknown');
            var stats = this.taskStats[key];
            if (!stats) {
              stats = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
              this.taskStats[key] = stats;
            }
            var safeDuration = Number.isFinite(durationMs) ? Number(durationMs) : 0;
            stats.count += 1;
            stats.totalMs += safeDuration;
            stats.lastMs = safeDuration;
            if (safeDuration > stats.maxMs) {
              stats.maxMs = safeDuration;
            }
          },
          defineHiddenValue: function defineHiddenValue(target, key, value) {
            if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
              return value;
            }
            try {
              Object.defineProperty(target, key, {
                value: value,
                writable: true,
                configurable: true,
                enumerable: false
              });
            } catch (_) {
              try {
                target[key] = value;
              } catch (_) {}
            }
            return value;
          },
          assignMessagePort: function assignMessagePort(port) {
            if (!port || (typeof port !== 'object' && typeof port !== 'function')) {
              return '';
            }
            if (port.__leapTracePortId) {
              return String(port.__leapTracePortId);
            }
            var portId = 'port-' + String(this.nextPortId++);
            this.defineHiddenValue(port, '__leapTracePortId', portId);
            return portId;
          },
          linkMessageChannel: function linkMessageChannel(channel) {
            if (!channel || !channel.port1 || !channel.port2) {
              return channel;
            }
            var port1Id = this.assignMessagePort(channel.port1);
            var port2Id = this.assignMessagePort(channel.port2);
            this.defineHiddenValue(channel.port1, '__leapTracePeerPortId', port2Id);
            this.defineHiddenValue(channel.port2, '__leapTracePeerPortId', port1Id);
            return channel;
          },
          enqueuePortPost: function enqueuePortPost(port) {
            if (!port || !port.__leapTracePeerPortId) {
              return;
            }
            var peerId = String(port.__leapTracePeerPortId);
            var queue = this.pendingPortPosts[peerId];
            if (!Array.isArray(queue)) {
              queue = [];
              this.pendingPortPosts[peerId] = queue;
            }
            queue.push(this.now());
          },
          consumePortPostLag: function consumePortPostLag(port) {
            if (!port || !port.__leapTracePortId) {
              return null;
            }
            var portId = String(port.__leapTracePortId);
            var queue = this.pendingPortPosts[portId];
            if (!Array.isArray(queue) || queue.length === 0) {
              return null;
            }
            var postedAt = Number(queue.shift() || 0);
            if (queue.length === 0) {
              delete this.pendingPortPosts[portId];
            }
            return this.now() - postedAt;
          }
        };

        function wrapMethod(holder, key, label) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var original = holder[key];
          if (original.__leapTaskApiTraceWrapped) {
            return;
          }
          function wrapped() {
            var startedAt = state.now();
            try {
              return original.apply(this, arguments);
            } finally {
              state.record(label, state.now() - startedAt);
            }
          }
          wrapped.__leapTaskApiTraceWrapped = true;
          wrapped.__leapTaskApiTraceOriginal = original;
          try {
            Object.defineProperty(wrapped, 'name', {
              value: original.name || key,
              configurable: true
            });
          } catch (_) {}
          holder[key] = wrapped;
        }

        function wrapScheduledCallback(holder, key, scheduleLabel, lagLabel, runtimeLabel) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var original = holder[key];
          if (original.__leapTaskApiTraceWrapped) {
            return;
          }
          function wrapped(callback, delay) {
            var startedAt = state.now();
            var requestedDelay = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
            var args = Array.prototype.slice.call(arguments);
            if (typeof callback === 'function') {
              var scheduledAt = state.now();
              args[0] = function wrappedCallback() {
                var callbackStartedAt = state.now();
                var lagMs = callbackStartedAt - scheduledAt - requestedDelay;
                state.record(lagLabel, lagMs > 0 ? lagMs : 0);
                try {
                  return callback.apply(this, arguments);
                } finally {
                  state.record(runtimeLabel, state.now() - callbackStartedAt);
                }
              };
            }
            try {
              return original.apply(this, args);
            } finally {
              state.record(scheduleLabel, state.now() - startedAt);
            }
          }
          wrapped.__leapTaskApiTraceWrapped = true;
          wrapped.__leapTaskApiTraceOriginal = original;
          try {
            Object.defineProperty(wrapped, 'name', {
              value: original.name || key,
              configurable: true
            });
          } catch (_) {}
          holder[key] = wrapped;
        }

        function wrapMicrotaskCallback(holder, key, scheduleLabel, lagLabel, runtimeLabel) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var original = holder[key];
          if (original.__leapTaskApiTraceWrapped) {
            return;
          }
          function wrapped(callback) {
            var startedAt = state.now();
            var args = Array.prototype.slice.call(arguments);
            if (typeof callback === 'function') {
              var scheduledAt = state.now();
              args[0] = function wrappedCallback() {
                var callbackStartedAt = state.now();
                var lagMs = callbackStartedAt - scheduledAt;
                state.record(lagLabel, lagMs > 0 ? lagMs : 0);
                try {
                  return callback.apply(this, arguments);
                } finally {
                  state.record(runtimeLabel, state.now() - callbackStartedAt);
                }
              };
            }
            try {
              return original.apply(this, args);
            } finally {
              state.record(scheduleLabel, state.now() - startedAt);
            }
          }
          wrapped.__leapTaskApiTraceWrapped = true;
          wrapped.__leapTaskApiTraceOriginal = original;
          try {
            Object.defineProperty(wrapped, 'name', {
              value: original.name || key,
              configurable: true
            });
          } catch (_) {}
          holder[key] = wrapped;
        }

        function wrapConstructor(holder, key, label) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var OriginalCtor = holder[key];
          if (OriginalCtor.__leapTaskApiTraceWrapped) {
            return;
          }
          function WrappedCtor() {
            var startedAt = state.now();
            try {
              return Reflect.construct(OriginalCtor, arguments, new.target || WrappedCtor);
            } finally {
              state.record(label, state.now() - startedAt);
            }
          }
          WrappedCtor.__leapTaskApiTraceWrapped = true;
          WrappedCtor.__leapTaskApiTraceOriginal = OriginalCtor;
          WrappedCtor.prototype = OriginalCtor.prototype;
          try {
            Object.setPrototypeOf(WrappedCtor, OriginalCtor);
          } catch (_) {}
          holder[key] = WrappedCtor;
        }

        function wrapMessageChannelConstructor(holder, key, label) {
          if (!holder || typeof holder[key] !== 'function') {
            return;
          }
          var OriginalCtor = holder[key];
          if (OriginalCtor.__leapTaskApiTraceWrapped) {
            return;
          }
          function WrappedCtor() {
            var startedAt = state.now();
            var channel = null;
            try {
              channel = Reflect.construct(OriginalCtor, arguments, new.target || WrappedCtor);
              if (channel && channel.port1) {
                wrapMessagePortPrototype(Object.getPrototypeOf(channel.port1));
              }
              if (channel && channel.port2) {
                wrapMessagePortPrototype(Object.getPrototypeOf(channel.port2));
              }
              return state.linkMessageChannel(channel);
            } finally {
              state.record(label, state.now() - startedAt);
            }
          }
          WrappedCtor.__leapTaskApiTraceWrapped = true;
          WrappedCtor.__leapTaskApiTraceOriginal = OriginalCtor;
          WrappedCtor.prototype = OriginalCtor.prototype;
          try {
            Object.setPrototypeOf(WrappedCtor, OriginalCtor);
          } catch (_) {}
          holder[key] = WrappedCtor;
        }

        function wrapMessagePortPrototype(proto) {
          if (!proto || (typeof proto !== 'object' && typeof proto !== 'function')) {
            return;
          }

          if (typeof proto.postMessage === 'function' && !proto.postMessage.__leapTaskApiTraceWrapped) {
            var originalPostMessage = proto.postMessage;
            function wrappedPostMessage() {
              var startedAt = state.now();
              state.assignMessagePort(this);
              state.enqueuePortPost(this);
              try {
                return originalPostMessage.apply(this, arguments);
              } finally {
                state.record('MessagePort.postMessage', state.now() - startedAt);
              }
            }
            wrappedPostMessage.__leapTaskApiTraceWrapped = true;
            wrappedPostMessage.__leapTaskApiTraceOriginal = originalPostMessage;
            try {
              Object.defineProperty(wrappedPostMessage, 'name', {
                value: originalPostMessage.name || 'postMessage',
                configurable: true
              });
            } catch (_) {}
            proto.postMessage = wrappedPostMessage;
          }

          var descriptor = null;
          try {
            descriptor = Object.getOwnPropertyDescriptor(proto, 'onmessage');
          } catch (_) {
            descriptor = null;
          }
          if (descriptor && typeof descriptor.set === 'function' && !descriptor.set.__leapTaskApiTraceWrapped) {
            var originalSetter = descriptor.set;
            var originalGetter = typeof descriptor.get === 'function' ? descriptor.get : null;
            function wrappedSetter(handler) {
              if (typeof handler !== 'function') {
                return originalSetter.call(this, handler);
              }
              state.assignMessagePort(this);
              if (handler.__leapTaskApiTraceWrapped) {
                return originalSetter.call(this, handler);
              }
              function wrappedHandler() {
                var receivingPort = this && this.__leapTracePortId
                  ? this
                  : (
                    arguments[0] &&
                    arguments[0].currentTarget &&
                    arguments[0].currentTarget.__leapTracePortId
                  )
                    ? arguments[0].currentTarget
                    : null;
                var lagMs = state.consumePortPostLag(receivingPort);
                if (lagMs != null) {
                  state.record('MessagePort.onmessageLag', lagMs > 0 ? lagMs : 0);
                }
                var callbackStartedAt = state.now();
                try {
                  return handler.apply(this, arguments);
                } finally {
                  state.record('MessagePort.onmessageRuntime', state.now() - callbackStartedAt);
                }
              }
              wrappedHandler.__leapTaskApiTraceWrapped = true;
              wrappedHandler.__leapTaskApiTraceOriginal = handler;
              return originalSetter.call(this, wrappedHandler);
            }
            wrappedSetter.__leapTaskApiTraceWrapped = true;
            try {
              Object.defineProperty(proto, 'onmessage', {
                configurable: true,
                enumerable: descriptor.enumerable,
                get: function getOnMessage() {
                  return originalGetter ? originalGetter.call(this) : null;
                },
                set: wrappedSetter
              });
            } catch (_) {}
          }
        }

        trace = state;
        g.__leapTaskApiTrace = trace;

        wrapScheduledCallback(
          g,
          'setTimeout',
          'setTimeout.schedule',
          'setTimeout.callbackLag',
          'setTimeout.callbackRuntime'
        );
        wrapMethod(g, 'clearTimeout', 'clearTimeout');
        wrapScheduledCallback(
          g,
          'setInterval',
          'setInterval.schedule',
          'setInterval.callbackLag',
          'setInterval.callbackRuntime'
        );
        wrapMethod(g, 'clearInterval', 'clearInterval');
        wrapMicrotaskCallback(
          g,
          'queueMicrotask',
          'queueMicrotask.schedule',
          'queueMicrotask.callbackLag',
          'queueMicrotask.callbackRuntime'
        );

        if (g.crypto) {
          wrapMethod(g.crypto, 'getRandomValues', 'crypto.getRandomValues');
          wrapMethod(g.crypto, 'randomUUID', 'crypto.randomUUID');
        }

        wrapMessageChannelConstructor(g, 'MessageChannel', 'MessageChannel');
        if (g.MessagePort && g.MessagePort.prototype) {
          wrapMessagePortPrototype(g.MessagePort.prototype);
        }

        if (g.XMLHttpRequest && g.XMLHttpRequest.prototype) {
          wrapMethod(g.XMLHttpRequest.prototype, 'open', 'XMLHttpRequest.open');
          wrapMethod(g.XMLHttpRequest.prototype, 'send', 'XMLHttpRequest.send');
          wrapMethod(g.XMLHttpRequest.prototype, 'setRequestHeader', 'XMLHttpRequest.setRequestHeader');
        }

        if (g.HTMLCanvasElement && g.HTMLCanvasElement.prototype) {
          wrapMethod(g.HTMLCanvasElement.prototype, 'toDataURL', 'HTMLCanvasElement.toDataURL');
          wrapMethod(g.HTMLCanvasElement.prototype, 'toBlob', 'HTMLCanvasElement.toBlob');
        }
      }

      var taskId = '';
      try {
        taskId = g.leapenv && typeof g.leapenv.getCurrentTaskId === 'function'
          ? String(g.leapenv.getCurrentTaskId() || '')
          : '';
      } catch (_) {}
      trace.beginTask(taskId);
    })();
  `;
}

function buildBlockSecurityScriptBeforeScript() {
  return `
    (function () {
      var g = globalThis;
      var blockedPattern = /js-security-v3-rac\\.js/i;
      if (!g.Node || !g.Node.prototype || typeof g.Node.prototype.appendChild !== 'function') {
        return;
      }
      var proto = g.Node.prototype;
      if (proto.appendChild.__leapBlockSecurityScriptWrapped) {
        return;
      }
      var originalAppendChild = proto.appendChild;
      function wrappedAppendChild(child) {
        try {
          var tagName = child && typeof child.tagName === 'string'
            ? String(child.tagName).toUpperCase()
            : '';
          var src = child && typeof child.src === 'string' ? String(child.src) : '';
          if (tagName === 'SCRIPT' && blockedPattern.test(src)) {
            var notify = function notifyBlocked() {
              try {
                if (typeof child.onerror === 'function') {
                  child.onerror(new Error('blocked security script for diagnostics'));
                }
              } catch (_) {}
            };
            if (typeof g.setTimeout === 'function') {
              g.setTimeout(notify, 0);
            } else {
              notify();
            }
            return child;
          }
        } catch (_) {}
        return originalAppendChild.apply(this, arguments);
      }
      wrappedAppendChild.__leapBlockSecurityScriptWrapped = true;
      wrappedAppendChild.__leapBlockSecurityScriptOriginal = originalAppendChild;
      try {
        Object.defineProperty(wrappedAppendChild, 'name', {
          value: originalAppendChild.name || 'appendChild',
          configurable: true
        });
      } catch (_) {}
      proto.appendChild = wrappedAppendChild;
    })();
  `;
}

function buildClearH5stCacheBeforeScript() {
  return `
    (function () {
      var keys = [
        'WQ_dy1_vk',
        'WQ_dy1_tk_algo',
        'JDst_behavior_flag',
        'WQ_gather_cv1',
        'WQ_gather_wgl1'
      ];
      function clearStore(store) {
        if (!store || typeof store.removeItem !== 'function') {
          return;
        }
        for (var i = 0; i < keys.length; i++) {
          try {
            store.removeItem(keys[i]);
          } catch (_) {}
        }
      }
      try { clearStore(globalThis.localStorage); } catch (_) {}
      try { clearStore(globalThis.sessionStorage); } catch (_) {}
    })();
  `;
}

function buildStubCanvasFingerprintBeforeScript() {
  return `
    (function () {
      var proto = globalThis.HTMLCanvasElement && globalThis.HTMLCanvasElement.prototype;
      if (!proto) {
        return;
      }
      if (typeof proto.toDataURL === 'function' && !proto.toDataURL.__leapCanvasStubWrapped) {
        var originalToDataURL = proto.toDataURL;
        function wrappedToDataURL() {
          return 'data:image/png;base64,';
        }
        wrappedToDataURL.__leapCanvasStubWrapped = true;
        wrappedToDataURL.__leapCanvasStubOriginal = originalToDataURL;
        proto.toDataURL = wrappedToDataURL;
      }
      if (typeof proto.toBlob === 'function' && !proto.toBlob.__leapCanvasStubWrapped) {
        var originalToBlob = proto.toBlob;
        function wrappedToBlob(callback) {
          if (typeof callback === 'function') {
            try {
              callback(new Blob([''], { type: 'image/png' }));
            } catch (_) {
              callback(null);
            }
          }
        }
        wrappedToBlob.__leapCanvasStubWrapped = true;
        wrappedToBlob.__leapCanvasStubOriginal = originalToBlob;
        proto.toBlob = wrappedToBlob;
      }
    })();
  `;
}

function buildStubCookieEmptyBeforeScript() {
  return `
    (function () {
      var doc = globalThis.document;
      var proto = globalThis.Document && globalThis.Document.prototype;
      if (!doc || !proto) {
        return;
      }
      try {
        Object.defineProperty(proto, 'cookie', {
          configurable: true,
          enumerable: true,
          get: function getCookie() {
            return '';
          },
          set: function setCookie() {
            return '';
          }
        });
      } catch (_) {
        try {
          Object.defineProperty(doc, 'cookie', {
            configurable: true,
            enumerable: true,
            get: function getCookie() {
              return '';
            },
            set: function setCookie() {
              return '';
            }
          });
        } catch (_) {}
      }
    })();
  `;
}

function replaceSegmentBetweenMarkers(source, startMarker, endMarker, replacement) {
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) {
    return source;
  }
  const endIndex = source.indexOf(endMarker, startIndex);
  if (endIndex === -1) {
    return source;
  }
  return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

function rewriteParamSignAsyncInit(source) {
  let rewritten = String(source || '');
  rewritten = replaceSegmentBetweenMarkers(
    rewritten,
    '(_$pz.prototype._$rds = function () {',
    '(_$pz.prototype._$rgo = function () {',
    "(_$pz.prototype._$rds = function () { return; }),\n    "
  );
  rewritten = replaceSegmentBetweenMarkers(
    rewritten,
    '(_$pz.prototype._$rgo = function () {',
    '(_$pz.prototype._$ram = function () {',
    "(_$pz.prototype._$rgo = function () { return Promise.resolve(); }),\n    "
  );
  rewritten = replaceSegmentBetweenMarkers(
    rewritten,
    '(_$pz.prototype._$ram = function () {',
    '(_$pz.prototype._$cps = function (_$py) {',
    "(_$pz.prototype._$ram = function () { return Promise.resolve(); }),\n    "
  );
  return rewritten;
}

function rewriteParamSignRdsOnly(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$rds = function () {',
    '(_$pz.prototype._$rgo = function () {',
    "(_$pz.prototype._$rds = function () { return; }),\n    "
  );
}

function rewriteParamSignRgoOnly(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$rgo = function () {',
    '(_$pz.prototype._$ram = function () {',
    "(_$pz.prototype._$rgo = function () { return Promise.resolve(); }),\n    "
  );
}

function rewriteParamSignRamOnly(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$ram = function () {',
    '(_$pz.prototype._$cps = function (_$py) {',
    "(_$pz.prototype._$ram = function () { return Promise.resolve(); }),\n    "
  );
}

function rewriteParamSignCpsStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$cps = function (_$py) {',
    '(_$pz.prototype._$ms = function (_$py, _$pu) {',
    [
      '(_$pz.prototype._$cps = function (_$py) {',
      '  if (!_$py || typeof _$py !== "object") {',
      '    try { this._onSign && this._onSign({ code: 1, message: "stub_invalid_input" }); } catch (_) {}',
      '    return null;',
      '  }',
      '  var keys = Object.keys(_$py);',
      '  var out = [];',
      '  for (var i = 0; i < keys.length; i++) {',
      '    out.push({ key: keys[i], value: _$py[keys[i]] });',
      '  }',
      '  return out;',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignCpsSingleEntryStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$cps = function (_$py) {',
    '(_$pz.prototype._$ms = function (_$py, _$pu) {',
    [
      '(_$pz.prototype._$cps = function (_$py) {',
      '  if (!_$py || typeof _$py !== "object") {',
      '    try { this._onSign && this._onSign({ code: 1, message: "stub_invalid_input" }); } catch (_) {}',
      '    return null;',
      '  }',
      '  var keys = Object.keys(_$py);',
      '  if (!keys.length) {',
      '    return [];',
      '  }',
      '  var key = keys[0];',
      '  return [{ key: key, value: _$py[key] }];',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignCpsEmptyStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$cps = function (_$py) {',
    '(_$pz.prototype._$ms = function (_$py, _$pu) {',
    [
      '(_$pz.prototype._$cps = function (_$py) {',
      '  if (!_$py || typeof _$py !== "object") {',
      '    try { this._onSign && this._onSign({ code: 1, message: "stub_invalid_input" }); } catch (_) {}',
      '    return null;',
      '  }',
      '  return [];',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignAtmStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$atm = function (_$py, _$pu, _$pG) {',
    '(_$pz.prototype._$pam = function (_$py, _$pu) {',
    [
      '(_$pz.prototype._$atm = function (_$py, _$pu, _$pG) {',
      '  return "0000000000000000000000000000000000000000000000000000000000000000";',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignWsStub(source) {
  return String(source || '').replace(
    '_$ws = _$wL,',
    '_$ws = function () { return "{\\"stub\\":1}"; },'
  );
}

function rewriteParamSignJsonStringifyStub(source) {
  return String(source || '').replace(
    '_$wE.JSON ||\n    (_$wE.JSON = {\n      stringify: JSON.stringify,\n    });',
    [
      '_$wE.JSON ||',
      '    (_$wE.JSON = {',
      '      stringify: function () {',
      '        return "{\\"stub\\":1}";',
      '      },',
      '    });'
    ].join('\n')
  );
}

function rewriteParamSignWsDispatchBypass(source) {
  return String(source || '').replace(
    'var _$wL = function (_$pa, _$py, _$pu) {\n      return _$wc(_$wE.JSON.stringify, null, arguments);\n    },',
    [
      'var _$wL = function (_$pa, _$py, _$pu) {',
      '      return _$wE.JSON.stringify.apply(_$wE.JSON, arguments);',
      '    },'
    ].join('\n')
  );
}

function rewriteParamSignWsDirectCall(source) {
  return String(source || '').replace(
    'var _$wL = function (_$pa, _$py, _$pu) {\n      return _$wc(_$wE.JSON.stringify, null, arguments);\n    },',
    [
      'var _$wL = function (_$pa, _$py, _$pu) {',
      '      return _$wE.JSON.stringify(_$pa);',
      '    },'
    ].join('\n')
  );
}

function rewriteParamSignWsDirectFullArgs(source) {
  return String(source || '').replace(
    'var _$wL = function (_$pa, _$py, _$pu) {\n      return _$wc(_$wE.JSON.stringify, null, arguments);\n    },',
    [
      'var _$wL = function (_$pa, _$py, _$pu) {',
      '      return _$wE.JSON.stringify(_$pa, _$py, _$pu);',
      '    },'
    ].join('\n')
  );
}

function rewriteParamSignWsApplyArray(source) {
  return String(source || '').replace(
    'var _$wL = function (_$pa, _$py, _$pu) {\n      return _$wc(_$wE.JSON.stringify, null, arguments);\n    },',
    [
      'var _$wL = function (_$pa, _$py, _$pu) {',
      '      return _$wE.JSON.stringify.apply(_$wE.JSON, [_$pa, _$py, _$pu]);',
      '    },'
    ].join('\n')
  );
}

function rewriteParamSignWsGenericArray(source) {
  return String(source || '').replace(
    'var _$wL = function (_$pa, _$py, _$pu) {\n      return _$wc(_$wE.JSON.stringify, null, arguments);\n    },',
    [
      'var _$wL = function (_$pa, _$py, _$pu) {',
      '      return _$wc(_$wE.JSON.stringify, null, [_$pa, _$py, _$pu]);',
      '    },'
    ].join('\n')
  );
}

function rewriteParamSignWsReflectArray(source) {
  return String(source || '').replace(
    'var _$wL = function (_$pa, _$py, _$pu) {\n      return _$wc(_$wE.JSON.stringify, null, arguments);\n    },',
    [
      'var _$wL = function (_$pa, _$py, _$pu) {',
      '      return Reflect.apply(_$wE.JSON.stringify, _$wE.JSON, [_$pa, _$py, _$pu]);',
      '    },'
    ].join('\n')
  );
}

function rewriteParamSignWsFnApplyCallArray(source) {
  return String(source || '').replace(
    'var _$wL = function (_$pa, _$py, _$pu) {\n      return _$wc(_$wE.JSON.stringify, null, arguments);\n    },',
    [
      'var _$wL = function (_$pa, _$py, _$pu) {',
      '      return Function.prototype.apply.call(_$wE.JSON.stringify, _$wE.JSON, [_$pa, _$py, _$pu]);',
      '    },'
    ].join('\n')
  );
}

function rewriteParamSignWsShallowArg(source) {
  return String(source || '').replace(
    'var _$wL = function (_$pa, _$py, _$pu) {\n      return _$wc(_$wE.JSON.stringify, null, arguments);\n    },',
    [
      'var _$wL = function (_$pa, _$py, _$pu) {',
      '      var _$ps = {};',
      '      if (_$pa && typeof _$pa === "object") {',
      '        var _$pk = [];',
      '        try { _$pk = Object.keys(_$pa); } catch (_) {}',
      '        _$ps.__keyCount = _$pk.length;',
      '        for (var _$pi = 0; _$pi < _$pk.length && _$pi < 6; _$pi++) {',
      '          var _$pn = _$pk[_$pi];',
      '          var _$pv = _$pa[_$pn];',
      '          if (_$pv && typeof _$pv === "object") {',
      '            if (_$pn === "extend" && _$pv && typeof _$pv === "object") {',
      '              _$ps[_$pn] = { wk: _$pv.wk };',
      '            } else {',
      '              _$ps[_$pn] = "[object]";',
      '            }',
      '          } else {',
      '            _$ps[_$pn] = _$pv;',
      '          }',
      '        }',
      '      } else {',
      '        _$ps = _$pa;',
      '      }',
      '      return _$wE.JSON.stringify(_$ps);',
      '    },'
    ].join('\n')
  );
}

function rewriteParamSignEncodeChainStub(source) {
  let rewritten = String(source || '');
  rewritten = rewritten.replace(
    'var _$OQ = _$OB.exports,\n    _$OE = {\n      exports: {},\n    };',
    [
      'var _$OQ = _$OB.exports;',
      '_$OQ.encode = function () { return "stub_encode"; };',
      'var _$OE = {',
      '  exports: {},',
      '};'
    ].join('\n')
  );
  rewritten = rewritten.replace(
    'var _$Oc = _$OE.exports,\n    _$OL = {\n      exports: {},\n    };',
    [
      'var _$Oc = _$OE.exports;',
      '_$Oc.parse = function () { return "stub_parse"; };',
      'var _$OL = {',
      '  exports: {},',
      '};'
    ].join('\n')
  );
  return rewritten;
}

function rewriteParamSignUtf8ParseStub(source) {
  return String(source || '').replace(
    'var _$Oc = _$OE.exports,\n    _$OL = {\n      exports: {},\n    };',
    [
      'var _$Oc = _$OE.exports;',
      '_$Oc.parse = function () { return "stub_parse"; };',
      'var _$OL = {',
      '  exports: {},',
      '};'
    ].join('\n')
  );
}

function rewriteParamSignBase64EncodeStub(source) {
  return String(source || '').replace(
    'var _$OQ = _$OB.exports,\n    _$OE = {\n      exports: {},\n    };',
    [
      'var _$OQ = _$OB.exports;',
      '_$OQ.encode = function () { return "stub_encode"; };',
      'var _$OE = {',
      '  exports: {},',
      '};'
    ].join('\n')
  );
}

function rewriteInputBodySha256Stub(source) {
  return String(source || '').replace(
    'body: window.SHA256(JSON.stringify(params)),',
    'body: "stub_body_sha256",'
  );
}

function rewriteParamSignGdkStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$gdk = function (_$py, _$pu, _$pG, _$pT) {',
    '(_$pz.prototype._$atm = function (_$py, _$pu, _$pG) {',
    [
      '(_$pz.prototype._$gdk = function (_$py, _$pu, _$pG, _$pT) {',
      '  return "0000000000000000000000000000000000000000000000000000000000000000";',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignGsStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$gs = function (_$py, _$pu) {',
    '(_$pz.prototype._$gsd = function (_$py, _$pu) {',
    [
      '(_$pz.prototype._$gs = function (_$py, _$pu) {',
      '  return "0000000000000000000000000000000000000000000000000000000000000000";',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignGsdStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$gsd = function (_$py, _$pu) {',
    '(_$pz.prototype._$rds = function () {',
    [
      '(_$pz.prototype._$gsd = function (_$py, _$pu) {',
      '  return "0000000000000000000000000000000000000000000000000000000000000000";',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignCltStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$clt = function () {',
    '(_$pz.prototype._$sdnmd = function (_$py) {',
    [
      '(_$pz.prototype._$clt = function () {',
      '  return "stub_clt";',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignMsStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$ms = function (_$py, _$pu) {',
    '(_$pz.prototype._$clt = function () {',
    [
      '(_$pz.prototype._$ms = function (_$py, _$pu) {',
      '  return {',
      '    _stk: "",',
      '    _ste: 1,',
      '    h5st: "stub_h5st"',
      '  };',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignSdnmdStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$sdnmd = function (_$py) {',
    '(_$pz.prototype.sign = function (_$py) {',
    [
      '(_$pz.prototype._$sdnmd = function (_$py) {',
      '  var out = {};',
      '  if (_$py && typeof _$py === "object") {',
      '    var keys = Object.keys(_$py);',
      '    for (var i = 0; i < keys.length; i++) {',
      '      out[keys[i]] = _$py[keys[i]];',
      '    }',
      '  }',
      '  out._stk = "";',
      '  out._ste = 1;',
      '  out.h5st = "stub_h5st";',
      '  return out;',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignRamEnvOnly(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    '(_$pz.prototype._$ram = function () {',
    '(_$pz.prototype._$cps = function (_$py) {',
    [
      '(_$pz.prototype._$ram = function () {',
      '  var _$pG = _$pv(1);',
      '  _$pG.ai = this._appId;',
      '  _$pG.fp = this._fingerprint;',
      '  _$pG.wk = _$pG.extend && _$pG.extend.wk === 1000 ? -1 : (_$pG.extend ? _$pG.extend.wk : 0);',
      '  try {',
      '    var _$pT = _$ws(_$pG, null, 1);',
      '    var _$pM = _$OQ.encode(_$Oc.parse(_$pT));',
      '    this.__leapDiagRamEnvOnly = {',
      '      fingerprint: this._fingerprint,',
      '      envLength: String(_$pM || "").length,',
      '      keys: Object.keys(_$pG).length',
      '    };',
      '  } catch (_) {}',
      '  return Promise.resolve({',
      '    algo: "",',
      '    token: "",',
      '    fp: this._fingerprint,',
      '    ts: Date.now()',
      '  });',
      '}),',
      '    '
    ].join('\n')
  );
}

function rewriteParamSignPvStub(source) {
  return replaceSegmentBetweenMarkers(
    String(source || ''),
    'function _$pv(_$py) {',
    'function _$pz() {',
    [
      'function _$pv(_$py) {',
      '  return {',
      '    extend: { wk: 0 },',
      '    envStub: 1,',
      '    source: "_$pv_stub"', 
      '  };',
      '}',
      ''
    ].join('\n')
  );
}

function injectParamSignMethodTrace(source) {
  const pattern = /\}\)\(\);\r?\n\/+\s*接口制作/;
  const traceBlock = [
    '})();',
    '(function () {',
    '  var g = globalThis;',
    '  var Ctor = g && g.ParamsSign;',
    '  if (!Ctor || !Ctor.prototype) {',
    '    return;',
    '  }',
    '  var state = { methods: {} };',
    '  g.__leapParamSignMethodTrace = state;',
    '  var originalDateNow = Date.now.bind(Date);',
    '  var originalPerfNow = null;',
    '  try {',
    '    if (g.performance && typeof g.performance.now === "function") {',
    '      originalPerfNow = g.performance.now.bind(g.performance);',
    '    }',
    '  } catch (_) {}',
    '  var names = [',
    '    "_$icg", "_$gdk", "_$atm", "_$pam", "_$gsp", "_$gs", "_$gsd",',
    '    "_$rds", "_$rgo", "_$ram", "_$cps", "_$ms", "_$clt", "_$sdnmd",',
    '    "sign", "signSync"',
    '  ];',
    '  function now() {',
    '    try {',
    '      if (originalPerfNow) {',
    '        return Number(originalPerfNow()) || 0;',
    '      }',
    '    } catch (_) {}',
    '    try { return Number(originalDateNow()) || 0; } catch (_) {}',
    '    return 0;',
    '  }',
    '  for (var i = 0; i < names.length; i++) {',
    '    var name = names[i];',
    '    if (typeof Ctor.prototype[name] !== "function") {',
    '      continue;',
    '    }',
    '    var original = Ctor.prototype[name];',
    '    if (original.__leapParamSignWrapped) {',
    '      continue;',
    '    }',
    '    Ctor.prototype[name] = (function (methodName, fn) {',
    '      function wrapped() {',
    '        var startedAt = now();',
    '        var result;',
    '        try {',
    '          result = fn.apply(this, arguments);',
    '          return result;',
    '        } finally {',
    '          var stats = state.methods[methodName];',
    '          if (!stats) {',
    '            stats = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, lastReturn: null };',
    '            state.methods[methodName] = stats;',
    '          }',
    '          var duration = now() - startedAt;',
    '          if (!isFinite(duration) || duration < 0) {',
    '            duration = 0;',
    '          }',
    '          function summarize(value) {',
    '            if (value == null) {',
    '              return { type: String(value) };',
    '            }',
    '            var t = typeof value;',
    '            if (t === "string") {',
    '              return { type: "string", length: value.length };',
    '            }',
    '            if (t === "number" || t === "boolean" || t === "bigint") {',
    '              return { type: t, value: String(value) };',
    '            }',
    '            if (t === "function") {',
    '              return { type: "function", name: value.name || "" };',
    '            }',
    '            if (Array.isArray(value)) {',
    '              var items = [];',
    '              for (var i2 = 0; i2 < value.length && i2 < 6; i2++) {',
    '                var v2 = value[i2];',
    '                if (v2 == null) {',
    '                  items.push({ type: String(v2) });',
    '                } else if (typeof v2 === "string") {',
    '                  items.push({ type: "string", length: v2.length });',
    '                } else if (typeof v2 === "number" || typeof v2 === "boolean") {',
    '                  items.push({ type: typeof v2, value: String(v2) });',
    '                } else if (Array.isArray(v2)) {',
    '                  items.push({ type: "array", length: v2.length });',
    '                } else if (typeof v2 === "object") {',
    '                  var keys2 = [];',
    '                  try { keys2 = Object.keys(v2).slice(0, 8); } catch (_) {}',
    '                  items.push({ type: "object", keys: keys2 });',
    '                } else {',
    '                  items.push({ type: typeof v2 });',
    '                }',
    '              }',
    '              return { type: "array", length: value.length, items: items };',
    '            }',
    '            if (t === "object") {',
    '              var keys = [];',
    '              try { keys = Object.keys(value).slice(0, 12); } catch (_) {}',
    '              return { type: "object", keys: keys, ctor: value && value.constructor && value.constructor.name ? value.constructor.name : "" };',
    '            }',
    '            return { type: t };',
    '          }',
    '          stats.count += 1;',
    '          stats.totalMs += duration;',
    '          stats.lastMs = duration;',
    '          if (duration > stats.maxMs) {',
    '            stats.maxMs = duration;',
    '          }',
    '          stats.lastReturn = summarize(result);',
    '        }',
    '      }',
    '      wrapped.__leapParamSignWrapped = true;',
    '      wrapped.__leapParamSignOriginal = fn;',
    '      return wrapped;',
    '    })(name, original);',
    '  }',
    '})();',
    '//////////////////////////// 接口制作'
  ].join('\n');

  if (!pattern.test(String(source || ''))) {
    return String(source || '');
  }
  return String(source || '').replace(pattern, traceBlock);
}

const INVESTIGATION_BEFORE_SCRIPT = [
  SILENCE_CONSOLE_BEFORE_SCRIPT,
  buildTaskApiTraceBeforeScript()
].join('\n');

function toPositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
}

function sanitizeArtifactName(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'unknown';
}

function hasWebSocketSupport() {
  return typeof WebSocket === 'function';
}

function getInspectorTargets(pool) {
  if (!pool || !pool.workers || typeof pool.workers.values !== 'function') {
    return [];
  }
  return Array.from(pool.workers.values())
    .map((state) => ({
      workerId: state && state.id ? state.id : null,
      inspectorInfo: state && state.inspectorInfo ? state.inspectorInfo : null
    }))
    .filter((entry) => entry.workerId && entry.inspectorInfo && entry.inspectorInfo.port && entry.inspectorInfo.targetId);
}

function inspectorWsUrl(inspectorInfo) {
  return `ws://127.0.0.1:${inspectorInfo.port}/${inspectorInfo.targetId}`;
}

class CdpWebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (!hasWebSocketSupport()) {
      throw new Error('WebSocket is not available. Run with node --experimental-websocket.');
    }
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (event) => {
        cleanup();
        reject(new Error(`WebSocket connect failed: ${event && event.message ? event.message : 'unknown error'}`));
      };
      const onClose = () => {
        cleanup();
        reject(new Error('WebSocket closed before connect'));
      };
      const cleanup = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        ws.removeEventListener('close', onClose);
      };
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
      ws.addEventListener('message', (event) => this._handleMessage(event));
      ws.addEventListener('close', () => this._handleSocketClosed());
      ws.addEventListener('error', () => {});
    });
  }

  _handleMessage(event) {
    let parsed = null;
    try {
      parsed = JSON.parse(String(event.data || ''));
    } catch (_) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    if (parsed.id && this.pending.has(parsed.id)) {
      const handlers = this.pending.get(parsed.id);
      this.pending.delete(parsed.id);
      if (parsed.error) {
        handlers.reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
      } else {
        handlers.resolve(parsed.result || {});
      }
    }
  }

  _handleSocketClosed() {
    for (const { reject } of this.pending.values()) {
      reject(new Error('WebSocket closed'));
    }
    this.pending.clear();
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== 1) {
      return Promise.reject(new Error('WebSocket is not open'));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.ws.send(payload);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async close() {
    if (!this.ws) {
      return;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws.readyState === 1 || ws.readyState === 0) {
      await new Promise((resolve) => {
        const finish = () => resolve();
        ws.addEventListener('close', finish, { once: true });
        try {
          ws.close();
        } catch (_) {
          resolve();
        }
        setTimeout(resolve, 200).unref?.();
      });
    }
  }
}

function summarizeCpuProfile(profile, topN = 12) {
  if (!profile || typeof profile !== 'object' || !Array.isArray(profile.nodes)) {
    return null;
  }
  const nodesById = new Map();
  const parentById = new Map();
  for (const node of profile.nodes) {
    if (node && Number.isFinite(Number(node.id))) {
      const nodeId = Number(node.id);
      nodesById.set(nodeId, node);
      if (Array.isArray(node.children)) {
        for (const childId of node.children) {
          if (Number.isFinite(Number(childId))) {
            parentById.set(Number(childId), nodeId);
          }
        }
      }
    }
  }
  const sampleCounts = new Map();
  const samples = Array.isArray(profile.samples) ? profile.samples : [];
  for (const rawId of samples) {
    const id = Number(rawId);
    sampleCounts.set(id, (sampleCounts.get(id) || 0) + 1);
  }

  const formatFrame = (nodeId) => {
    const node = nodesById.get(nodeId) || {};
    const frame = node.callFrame || {};
    return {
      functionName: frame.functionName || '(anonymous)',
      url: frame.url || '',
      lineNumber: Number(frame.lineNumber || 0) + 1,
      columnNumber: Number(frame.columnNumber || 0) + 1
    };
  };

  const isH5stFrame = (frame) => typeof frame.url === 'string' && frame.url.endsWith('/work/h5st.js');
  const isH5stLine = (frame, functionName, lineNumber) =>
    isH5stFrame(frame) &&
    String(frame.functionName || '') === functionName &&
    Number(frame.lineNumber || 0) === Number(lineNumber);

  const normalizeFrameLabel = (frame) => {
    const functionName = String(frame.functionName || '(anonymous)');
    const lowerName = functionName.toLowerCase();
    if (isH5stFrame(frame)) {
      if (isH5stLine(frame, '_$wL', 5380)) {
        return 'h5st:_$ws';
      }
      if (isH5stLine(frame, 'stringify', 5364)) {
        return 'h5st:JSON.stringify.wrapper';
      }
      if (isH5stLine(frame, 'stringify', 6864)) {
        return 'h5st:Hex.stringify';
      }
      if (isH5stLine(frame, 'parse', 7007)) {
        return 'h5st:Hex.parse';
      }
      if (isH5stLine(frame, 'stringify', 7096)) {
        return 'h5st:Latin1.stringify';
      }
      if (isH5stLine(frame, 'parse', 7117)) {
        return 'h5st:Latin1.parse';
      }
      if (isH5stLine(frame, 'stringify', 7141)) {
        return 'h5st:Utf8.stringify';
      }
      if (isH5stLine(frame, 'parse', 7148)) {
        return 'h5st:Utf8.parse';
      }
      if (isH5stLine(frame, 'stringify', 9383)) {
        return 'h5st:Base64.stringify';
      }
      if (isH5stLine(frame, 'stringify1', 9389)) {
        return 'h5st:Base64.stringify1';
      }
      if (isH5stLine(frame, 'parse', 9488)) {
        return 'h5st:Base64.parse';
      }
      if (isH5stLine(frame, 'encode', 9509)) {
        return 'h5st:Base64.encode';
      }
      if (functionName === '(anonymous)') {
        return `h5st:(anonymous):${frame.lineNumber}`;
      }
      return `h5st:${functionName}`;
    }
    if (
      functionName === 'Reflect.apply' ||
      lowerName === 'apply' ||
      lowerName.endsWith('.apply') ||
      lowerName.includes('reflect.apply') ||
      lowerName.includes('function.prototype.apply')
    ) {
      return 'builtin:apply-family';
    }
    if (
      functionName === 'JSON.stringify' ||
      lowerName === 'stringify' ||
      lowerName.endsWith('.stringify') ||
      lowerName.includes('json.stringify')
    ) {
      return 'builtin:JSON.stringify';
    }
    if (
      functionName === 'Base64.encode' ||
      lowerName === 'encode' ||
      lowerName.endsWith('.encode')
    ) {
      return 'builtin:encode';
    }
    if (
      functionName === 'Utf8.parse' ||
      lowerName === 'parse' ||
      lowerName.endsWith('.parse')
    ) {
      return 'builtin:parse';
    }
    if (!frame.url) {
      return functionName;
    }
    return `${functionName}@${path.basename(frame.url)}`;
  };

  const top = Array.from(sampleCounts.entries())
    .map(([nodeId, hitCount]) => {
      return {
        ...formatFrame(nodeId),
        hitCount
      };
    })
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, topN);

  const inclusiveCounts = new Map();
  const normalizedLeafCounts = new Map();
  const normalizedInclusiveCounts = new Map();
  const stackSignatureCounts = new Map();
  const h5stStackSignatureCounts = new Map();
  const directChildCounts = new Map([
    ['_$clt', new Map()],
    ['_$ms', new Map()]
  ]);
  const parentChainCounts = new Map([
    ['encode', new Map()],
    ['_seData1', new Map()]
  ]);
  const focusMatchers = [
    { key: '_$sdnmd', test: (frame) => frame.functionName.includes('_$sdnmd') },
    { key: '_$ms', test: (frame) => frame.functionName === '_$pz._$ms' || frame.functionName.includes('_$ms') },
    { key: '_$cps', test: (frame) => frame.functionName === '_$pz._$cps' || frame.functionName.includes('_$cps') },
    { key: '_$clt', test: (frame) => frame.functionName === '_$pz._$clt' || frame.functionName.includes('_$clt') },
    { key: '_$ws', test: (frame) => frame.functionName === '_$ws' || frame.functionName.includes('_$ws') },
    { key: 'encode', test: (frame) => frame.functionName === 'encode' || frame.functionName.includes('.encode') },
    { key: 'parse', test: (frame) => frame.functionName === 'parse' || frame.functionName.includes('.parse') },
    { key: '_seData1', test: (frame) => frame.functionName === '_seData1' || frame.functionName.includes('_seData1') },
    { key: 'a0a1b0cv', test: (frame) => frame.functionName === 'a0a1b0cv' || frame.functionName.includes('a0a1b0cv') },
    { key: '_$u', test: (frame) => frame.functionName === '_$u' || frame.functionName.includes('_$u') },
    { key: 'stringify', test: (frame) => frame.functionName.toLowerCase().includes('stringify') },
    { key: 'apply', test: (frame) => frame.functionName.toLowerCase().includes('apply') }
  ];
  const focusCounts = new Map(focusMatchers.map((entry) => [entry.key, 0]));
  const wrapperMatchers = [
    { key: '_$ws', test: (frame) => isH5stLine(frame, '_$wL', 5380) },
    { key: 'JSON.stringify.wrapper', test: (frame) => isH5stLine(frame, 'stringify', 5364) },
    { key: 'Hex.stringify', test: (frame) => isH5stLine(frame, 'stringify', 6864) },
    { key: 'Hex.parse', test: (frame) => isH5stLine(frame, 'parse', 7007) },
    { key: 'Latin1.stringify', test: (frame) => isH5stLine(frame, 'stringify', 7096) },
    { key: 'Latin1.parse', test: (frame) => isH5stLine(frame, 'parse', 7117) },
    { key: 'Utf8.stringify', test: (frame) => isH5stLine(frame, 'stringify', 7141) },
    { key: 'Utf8.parse', test: (frame) => isH5stLine(frame, 'parse', 7148) },
    { key: 'Base64.stringify', test: (frame) => isH5stLine(frame, 'stringify', 9383) },
    { key: 'Base64.stringify1', test: (frame) => isH5stLine(frame, 'stringify1', 9389) },
    { key: 'Base64.parse', test: (frame) => isH5stLine(frame, 'parse', 9488) },
    { key: 'Base64.encode', test: (frame) => isH5stLine(frame, 'encode', 9509) }
  ];
  const wrapperCounts = new Map(wrapperMatchers.map((entry) => [entry.key, 0]));
  const comboMatchers = [
    { key: 'sdnmd+ms', needs: ['_$sdnmd', '_$ms'] },
    { key: 'ms+cps', needs: ['_$ms', '_$cps'] },
    { key: 'ms+clt', needs: ['_$ms', '_$clt'] },
    { key: 'clt+ws', needs: ['_$clt', '_$ws'] },
    { key: 'clt+encode', needs: ['_$clt', 'encode'] },
    { key: 'clt+encode+parse', needs: ['_$clt', 'encode', 'parse'] },
    { key: 'clt+seData1', needs: ['_$clt', '_seData1'] },
    { key: 'decoder+encode', needs: ['a0a1b0cv', 'encode'] },
    { key: 'stringify+apply', needs: ['stringify', 'apply'] }
  ];
  const comboCounts = new Map(comboMatchers.map((entry) => [entry.key, 0]));

  const shortFrameLabel = (frame) => {
    const name = frame.functionName || '(anonymous)';
    if (isH5stFrame(frame)) {
      if (name === '(anonymous)') {
        return `h5st:(anonymous):${frame.lineNumber}`;
      }
      return `h5st:${name}`;
    }
    if (!frame.url) {
      return name;
    }
    return `${name}@${path.basename(frame.url)}`;
  };

  const buildStackForSample = (leafNodeId) => {
    const frames = [];
    let currentId = Number(leafNodeId);
    const seen = new Set();
    while (Number.isFinite(currentId) && currentId > 0 && !seen.has(currentId)) {
      seen.add(currentId);
      frames.push({
        nodeId: currentId,
        ...formatFrame(currentId)
      });
      currentId = parentById.has(currentId) ? parentById.get(currentId) : 0;
    }
    return frames.reverse();
  };

  for (const rawId of samples) {
    const sampleNodeId = Number(rawId);
    if (!Number.isFinite(sampleNodeId)) {
      continue;
    }
    const stack = buildStackForSample(sampleNodeId);
    const leafFrame = formatFrame(sampleNodeId);
    const normalizedLeafLabel = normalizeFrameLabel(leafFrame);
    normalizedLeafCounts.set(normalizedLeafLabel, (normalizedLeafCounts.get(normalizedLeafLabel) || 0) + 1);
    const seenFrameKeys = new Set();
    const seenNormalizedLabels = new Set();
    for (const frame of stack) {
      const frameKey = [
        frame.functionName,
        frame.url,
        frame.lineNumber,
        frame.columnNumber
      ].join('|');
      if (seenFrameKeys.has(frameKey)) {
        continue;
      }
      seenFrameKeys.add(frameKey);
      inclusiveCounts.set(frameKey, (inclusiveCounts.get(frameKey) || 0) + 1);

      const normalizedLabel = normalizeFrameLabel(frame);
      if (!seenNormalizedLabels.has(normalizedLabel)) {
        seenNormalizedLabels.add(normalizedLabel);
        normalizedInclusiveCounts.set(normalizedLabel, (normalizedInclusiveCounts.get(normalizedLabel) || 0) + 1);
      }
    }

    const fullSignatureFrames = stack
      .filter((frame) => frame.functionName !== '(root)')
      .slice(-6)
      .map(shortFrameLabel);
    if (fullSignatureFrames.length > 0) {
      const signature = fullSignatureFrames.join(' > ');
      stackSignatureCounts.set(signature, (stackSignatureCounts.get(signature) || 0) + 1);
    }

    const h5stFrames = stack
      .filter((frame) => isH5stFrame(frame))
      .slice(-6)
      .map(shortFrameLabel);
    if (h5stFrames.length > 0) {
      const signature = h5stFrames.join(' > ');
      h5stStackSignatureCounts.set(signature, (h5stStackSignatureCounts.get(signature) || 0) + 1);
    }

    for (let i = 0; i < stack.length - 1; i += 1) {
      const frame = stack[i];
      const child = stack[i + 1];
      if (!frame || !child) {
        continue;
      }
      if (focusMatchers[3].test(frame)) {
        const label = normalizeFrameLabel(child);
        const counts = directChildCounts.get('_$clt');
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      if (focusMatchers[1].test(frame)) {
        const label = normalizeFrameLabel(child);
        const counts = directChildCounts.get('_$ms');
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }

    for (let i = 0; i < stack.length; i += 1) {
      const frame = stack[i];
      if (!frame) {
        continue;
      }
      if (focusMatchers[5].test(frame)) {
        const signature = stack
          .slice(Math.max(0, i - 4), i + 1)
          .map(normalizeFrameLabel)
          .join(' > ');
        const counts = parentChainCounts.get('encode');
        counts.set(signature, (counts.get(signature) || 0) + 1);
      }
      if (focusMatchers[7].test(frame)) {
        const signature = stack
          .slice(Math.max(0, i - 4), i + 1)
          .map(normalizeFrameLabel)
          .join(' > ');
        const counts = parentChainCounts.get('_seData1');
        counts.set(signature, (counts.get(signature) || 0) + 1);
      }
    }

    const matchedFocus = new Set();
    const matchedWrappers = new Set();
    for (const frame of stack) {
      for (const matcher of focusMatchers) {
        if (matcher.test(frame)) {
          matchedFocus.add(matcher.key);
        }
      }
      for (const matcher of wrapperMatchers) {
        if (matcher.test(frame)) {
          matchedWrappers.add(matcher.key);
        }
      }
    }
    for (const key of matchedFocus) {
      focusCounts.set(key, (focusCounts.get(key) || 0) + 1);
    }
    for (const key of matchedWrappers) {
      wrapperCounts.set(key, (wrapperCounts.get(key) || 0) + 1);
    }
    for (const combo of comboMatchers) {
      if (combo.needs.every((key) => matchedFocus.has(key))) {
        comboCounts.set(combo.key, (comboCounts.get(combo.key) || 0) + 1);
      }
    }
  }

  const topInclusive = Array.from(inclusiveCounts.entries())
    .map(([frameKey, hitCount]) => {
      const [functionName, url, lineNumber, columnNumber] = frameKey.split('|');
      return {
        functionName,
        url,
        lineNumber: Number(lineNumber),
        columnNumber: Number(columnNumber),
        hitCount
      };
    })
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, topN);

  const topStacks = Array.from(stackSignatureCounts.entries())
    .map(([signature, hitCount]) => ({ signature, hitCount }))
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 8);

  const topH5stStacks = Array.from(h5stStackSignatureCounts.entries())
    .map(([signature, hitCount]) => ({ signature, hitCount }))
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, 8);

  const topNormalized = Array.from(normalizedLeafCounts.entries())
    .map(([key, hitCount]) => ({
      key,
      hitCount,
      ratio: samples.length > 0 ? round((hitCount / samples.length) * 100, 2) : 0
    }))
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, topN);

  const topNormalizedInclusive = Array.from(normalizedInclusiveCounts.entries())
    .map(([key, hitCount]) => ({
      key,
      hitCount,
      ratio: samples.length > 0 ? round((hitCount / samples.length) * 100, 2) : 0
    }))
    .sort((a, b) => b.hitCount - a.hitCount)
    .slice(0, topN);

  const focusHits = Array.from(focusCounts.entries())
    .map(([key, hitCount]) => ({
      key,
      hitCount,
      ratio: samples.length > 0 ? round((hitCount / samples.length) * 100, 2) : 0
    }))
    .sort((a, b) => b.hitCount - a.hitCount);

  const comboHits = Array.from(comboCounts.entries())
    .map(([key, hitCount]) => ({
      key,
      hitCount,
      ratio: samples.length > 0 ? round((hitCount / samples.length) * 100, 2) : 0
    }))
    .sort((a, b) => b.hitCount - a.hitCount);

  const wrapperHits = Array.from(wrapperCounts.entries())
    .map(([key, hitCount]) => ({
      key,
      hitCount,
      ratio: samples.length > 0 ? round((hitCount / samples.length) * 100, 2) : 0
    }))
    .sort((a, b) => b.hitCount - a.hitCount);

  const directChildren = Array.from(directChildCounts.entries())
    .map(([parentKey, counts]) => ({
      parentKey,
      children: Array.from(counts.entries())
        .map(([key, hitCount]) => ({
          key,
          hitCount,
          ratio: samples.length > 0 ? round((hitCount / samples.length) * 100, 2) : 0
        }))
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 8)
    }));

  const parentChains = Array.from(parentChainCounts.entries())
    .map(([targetKey, counts]) => ({
      targetKey,
      chains: Array.from(counts.entries())
        .map(([signature, hitCount]) => ({
          signature,
          hitCount,
          ratio: samples.length > 0 ? round((hitCount / samples.length) * 100, 2) : 0
        }))
        .sort((a, b) => b.hitCount - a.hitCount)
        .slice(0, 8)
    }));

  return {
    sampleCount: samples.length,
    nodeCount: profile.nodes.length,
    startTime: Number(profile.startTime || 0),
    endTime: Number(profile.endTime || 0),
    top,
    topInclusive,
    topNormalized,
    topNormalizedInclusive,
    topStacks,
    topH5stStacks,
    focusHits,
    wrapperHits,
    comboHits,
    directChildren,
    parentChains
  };
}

async function startVmCpuProfilers(pool) {
  const targets = getInspectorTargets(pool);
  const sessions = [];
  for (const target of targets) {
    const session = new CdpWebSocketClient(inspectorWsUrl(target.inspectorInfo));
    await session.connect();
    await session.send('Profiler.enable');
    await session.send('Profiler.start');
    sessions.push({
      workerId: target.workerId,
      inspectorInfo: target.inspectorInfo,
      session
    });
  }
  return sessions;
}

async function stopVmCpuProfilers(sessions) {
  const results = [];
  for (const entry of sessions || []) {
    try {
      const stopped = await entry.session.send('Profiler.stop');
      const profile = stopped && stopped.profile ? stopped.profile : null;
      results.push({
        workerId: entry.workerId,
        inspectorInfo: entry.inspectorInfo,
        profile,
        summary: summarizeCpuProfile(profile)
      });
    } catch (error) {
      results.push({
        workerId: entry.workerId,
        inspectorInfo: entry.inspectorInfo,
        error: String(error && error.message ? error.message : error)
      });
    } finally {
      await entry.session.close();
    }
  }
  return results;
}

function nowForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function persistVmCpuProfiles({ repoRoot, artifactBaseName, runIndex, profiles, synchronizedStall }) {
  if (!repoRoot || !artifactBaseName || !Array.isArray(profiles) || profiles.length === 0) {
    return null;
  }
  const baseDir = path.join(
    repoRoot,
    'benchmarks',
    'results',
    'vm-cpu-profiles',
    sanitizeArtifactName(artifactBaseName),
    `run-${String(runIndex).padStart(2, '0')}`
  );
  fs.mkdirSync(baseDir, { recursive: true });
  const persistedEntries = [];
  for (const entry of profiles) {
    const safeWorkerId = sanitizeArtifactName(entry && entry.workerId ? entry.workerId : 'worker');
    const persisted = {
      workerId: entry && entry.workerId ? entry.workerId : null,
      error: entry && entry.error ? entry.error : null,
      summaryPath: null,
      cpuprofilePath: null
    };
    if (entry && entry.summary) {
      const summaryPath = path.join(baseDir, `${safeWorkerId}.summary.json`);
      fs.writeFileSync(summaryPath, JSON.stringify(entry.summary, null, 2));
      persisted.summaryPath = path.relative(repoRoot, summaryPath);
    }
    if (entry && entry.profile) {
      const profilePath = path.join(baseDir, `${safeWorkerId}.cpuprofile`);
      fs.writeFileSync(profilePath, JSON.stringify(entry.profile));
      persisted.cpuprofilePath = path.relative(repoRoot, profilePath);
    }
    persistedEntries.push(persisted);
  }
  const manifest = {
    savedAt: new Date().toISOString(),
    artifactBaseName,
    runIndex,
    synchronizedStall: synchronizedStall || null,
    entries: persistedEntries
  };
  const manifestPath = path.join(baseDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return {
    directory: path.relative(repoRoot, baseDir),
    manifestPath: path.relative(repoRoot, manifestPath),
    entries: persistedEntries
  };
}

function createThreadSnapshotSampler({ pid, intervalMs, bufferSize }) {
  const snapshots = [];
  const safePid = Number(pid);
  const safeIntervalMs = Math.max(50, Number(intervalMs) || 100);
  const safeBufferSize = Math.max(20, Number(bufferSize) || 160);
  let timer = null;

  function summarizeThreads(threads) {
    const statCounts = new Map();
    const wchanCounts = new Map();
    let runnableCount = 0;
    let sleepingCount = 0;
    for (const thread of threads) {
      const stat = String(thread.stat || '');
      const stateKey = stat ? stat[0] : '?';
      statCounts.set(stateKey, (statCounts.get(stateKey) || 0) + 1);
      if (stateKey === 'R') {
        runnableCount += 1;
      } else {
        sleepingCount += 1;
      }
      const wchan = String(thread.wchan || '-');
      if (wchan && wchan !== '-' && wchan !== '0') {
        wchanCounts.set(wchan, (wchanCounts.get(wchan) || 0) + 1);
      }
    }
    return {
      totalThreads: threads.length,
      runnableCount,
      sleepingCount,
      states: Array.from(statCounts.entries())
        .map(([state, count]) => ({ state, count }))
        .sort((a, b) => b.count - a.count),
      topWchan: Array.from(wchanCounts.entries())
        .map(([wchan, count]) => ({ wchan, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      topCpuThreads: threads
        .slice()
        .sort((a, b) => Number(b.pcpu || 0) - Number(a.pcpu || 0))
        .slice(0, 8)
    };
  }

  function captureOnce() {
    if (!Number.isFinite(safePid) || safePid <= 0) {
      return;
    }
    const capturedAtMs = Date.now();
    const result = spawnSync(
      'ps',
      ['-L', '-p', String(safePid), '-o', 'tid,pcpu,stat,wchan:32,comm', '--no-headers'],
      {
        encoding: 'utf8',
        timeout: Math.min(safeIntervalMs, 250) * 2
      }
    );
    const stdout = result && typeof result.stdout === 'string' ? result.stdout : '';
    const stderr = result && typeof result.stderr === 'string' ? result.stderr : '';
    const threads = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          tid: Number(parts[0] || 0),
          pcpu: Number(parts[1] || 0),
          stat: parts[2] || '',
          wchan: parts[3] || '',
          comm: parts.slice(4).join(' ') || ''
        };
      });
    const snapshot = {
      capturedAtMs,
      capturedAtIso: new Date(capturedAtMs).toISOString(),
      ok: result && result.status === 0,
      error: result && result.status === 0
        ? null
        : (stderr.trim() || `ps_exit_${result ? result.status : 'unknown'}`),
      threads
    };
    snapshot.summary = summarizeThreads(threads);
    snapshots.push(snapshot);
    while (snapshots.length > safeBufferSize) {
      snapshots.shift();
    }
  }

  return {
    start() {
      captureOnce();
      timer = setInterval(captureOnce, safeIntervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      return snapshots.slice();
    }
  };
}

function buildStallThreadSnapshotWindow(snapshots, stallWindow, slowTasks) {
  if (!Array.isArray(snapshots) || snapshots.length === 0 || !stallWindow) {
    return null;
  }
  const synchronizedWorkerIds = new Set(
    Array.isArray(slowTasks)
      ? slowTasks.map((task) => task && task.workerId).filter(Boolean)
      : []
  );
  const synchronizedSlowTasks = Array.isArray(slowTasks)
    ? slowTasks.filter((task) => synchronizedWorkerIds.size === 0 || synchronizedWorkerIds.has(task.workerId))
    : [];
  const startedOffsets = synchronizedSlowTasks
    .map((task) => Number(task && task.startedOffsetMs || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const completedOffsets = synchronizedSlowTasks
    .map((task) => Number(task && task.completedOffsetMs || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const firstStartedAtMs = startedOffsets.length > 0
    ? Math.min(...startedOffsets) + Number(stallWindow.measuredStartedAtMs || 0)
    : Number(stallWindow.firstCompletedAtMs || 0);
  const lastCompletedAtMs = completedOffsets.length > 0
    ? Math.max(...completedOffsets) + Number(stallWindow.measuredStartedAtMs || 0)
    : Number(stallWindow.lastCompletedAtMs || 0);
  const startMs = firstStartedAtMs > 0 ? firstStartedAtMs - 500 : 0;
  const endMs = lastCompletedAtMs > 0 ? lastCompletedAtMs + 500 : 0;
  const windowSnapshots = snapshots.filter((entry) => {
    const capturedAtMs = Number(entry && entry.capturedAtMs || 0);
    return capturedAtMs >= startMs && capturedAtMs <= endMs;
  });
  return {
    firstStartedAtMs,
    firstStartedAtIso: firstStartedAtMs > 0 ? new Date(firstStartedAtMs).toISOString() : null,
    lastCompletedAtMs,
    lastCompletedAtIso: lastCompletedAtMs > 0 ? new Date(lastCompletedAtMs).toISOString() : null,
    startMs,
    startIso: startMs > 0 ? new Date(startMs).toISOString() : null,
    endMs,
    endIso: endMs > 0 ? new Date(endMs).toISOString() : null,
    sampleCount: windowSnapshots.length,
    snapshots: windowSnapshots
  };
}

function persistStallThreadSnapshots({ repoRoot, artifactBaseName, runIndex, window }) {
  if (!repoRoot || !artifactBaseName || !window || !Array.isArray(window.snapshots) || window.snapshots.length === 0) {
    return null;
  }
  const baseDir = path.join(
    repoRoot,
    'benchmarks',
    'results',
    'thread-snapshots',
    sanitizeArtifactName(artifactBaseName),
    `run-${String(runIndex).padStart(2, '0')}`
  );
  fs.mkdirSync(baseDir, { recursive: true });
  const outputPath = path.join(baseDir, 'stall-window.json');
  fs.writeFileSync(outputPath, JSON.stringify(window, null, 2));
  return {
    directory: path.relative(repoRoot, baseDir),
    snapshotPath: path.relative(repoRoot, outputPath),
    sampleCount: window.sampleCount
  };
}

function printHelp() {
  console.log(`Usage: node benchmarks/investigate-sync-stall.js [options]

Options:
  --backend <thread|process>       Pool backend (default: ${DEFAULTS.backend})
  --target-script <path>           Override target script path (default: work/h5st.js)
  --repeats <n>                    Number of repeated runs (default: ${DEFAULTS.repeats})
  --pool <n>                       Pool size (default: ${DEFAULTS.poolSize})
  --concurrency <n>                Concurrency (default: ${DEFAULTS.concurrency})
  --max-tasks-per-worker <n>       Max tasks per worker (default: ${DEFAULTS.maxTasksPerWorker})
  --warmup <n>                     Warmup tasks (default: ${DEFAULTS.warmupTasks})
  --total <n>                      Measured tasks (default: ${DEFAULTS.totalTasks})
  --sample-every <n>               Sample window size (default: ${DEFAULTS.sampleEvery})
  --enable-vm-inspector            Enable leap-vm inspector without turning on monitor hooks
  --capture-vm-cpu-profile-on-stall  Capture V8 CPU profiles, dump stalled-run raw .cpuprofile and summaries
  --capture-host-thread-snapshots-on-stall  Sample ps -L snapshots and keep stalled-run thread states
  --thread-snapshot-interval <n>   Host thread snapshot interval in ms (default: ${DEFAULTS.threadSnapshotIntervalMs})
  --thread-snapshot-buffer <n>     Host thread snapshot ring buffer size (default: ${DEFAULTS.threadSnapshotBufferSize})
  --heartbeat-interval <n>         Heartbeat interval in ms (default: ${DEFAULTS.heartbeatIntervalMs})
  --heartbeat-timeout <n>          Heartbeat timeout in ms (default: ${DEFAULTS.heartbeatTimeoutMs})
  --slow-threshold <n>             Slow task threshold in ms (default: ${DEFAULTS.slowTaskThresholdMs})
  --disable-message-channel        Force MessageChannel/MessagePort fallback path
  --block-security-script          Block js-security-v3-rac.js dynamic script injection
  --clear-h5st-cache-keys          Clear known h5st localStorage/sessionStorage keys before each task
  --stub-canvas-fingerprint        Stub HTMLCanvasElement.toDataURL/toBlob for diagnostics
  --stub-cookie-empty              Stub Document.cookie getter/setter for diagnostics
  --disable-paramsign-async-init   Rewrite ParamsSign async init chain (_$rds/_$rgo/_$ram)
  --disable-paramsign-rds          Rewrite ParamsSign._$rds only
  --disable-paramsign-rgo          Rewrite ParamsSign._$rgo only
  --disable-paramsign-ram          Rewrite ParamsSign._$ram only
  --stub-paramsign-ws              Rewrite _$ws serializer helper to a minimal JSON stub
  --stub-paramsign-json-stringify  Rewrite JSON.stringify under _$ws to a fixed stub
  --stub-paramsign-ws-dispatch     Bypass _$wc/_$O dispatch inside _$ws, keep real JSON.stringify
  --stub-paramsign-ws-direct-call  Replace _$ws with direct JSON.stringify(arg) call
  --stub-paramsign-ws-direct-fullargs  Replace _$ws with direct JSON.stringify(arg, replacer, space)
  --stub-paramsign-ws-apply-array  Keep native apply but replace arguments with explicit array
  --stub-paramsign-ws-generic-array  Keep _$wc/_$O path but replace arguments with explicit array
  --stub-paramsign-ws-reflect-array  Force Reflect.apply(JSON.stringify, ctx, array)
  --stub-paramsign-ws-fn-apply-call-array  Force Function.prototype.apply.call(JSON.stringify, ctx, array)
  --stub-paramsign-ws-shallow-arg  Keep real JSON.stringify but shrink _$ws input to a shallow summary
  --stub-paramsign-encode-chain    Rewrite Utf8.parse/Base64.encode helper chain to fixed stubs
  --stub-paramsign-utf8-parse      Rewrite Utf8.parse only to a fixed stub
  --stub-paramsign-base64-encode   Rewrite Base64.encode only to a fixed stub
  --stub-input-body-sha256         Replace task input body SHA256(JSON.stringify(params)) with fixed string
  --stub-paramsign-atm             Rewrite ParamsSign._$atm to a fixed 64-char stub
  --stub-paramsign-gdk             Rewrite ParamsSign._$gdk to a fixed 64-char stub
  --stub-paramsign-gs              Rewrite ParamsSign._$gs to a fixed 64-char stub
  --stub-paramsign-gsd             Rewrite ParamsSign._$gsd to a fixed 64-char stub
  --stub-paramsign-cps             Rewrite ParamsSign._$cps to a shape-preserving stub
  --stub-paramsign-cps-single-entry  Rewrite ParamsSign._$cps to keep only the first key/value pair
  --stub-paramsign-cps-empty       Rewrite ParamsSign._$cps to an empty list stub
  --stub-paramsign-clt             Rewrite ParamsSign._$clt to a fixed string stub
  --stub-paramsign-ms              Rewrite ParamsSign._$ms to a fixed sign-result stub
  --stub-paramsign-sdnmd           Rewrite ParamsSign._$sdnmd to pass through input + fixed sign fields
  --stub-paramsign-ram-env-only    Keep _$pv/env encode, skip remote refresh/save in _$ram
  --stub-paramsign-pv              Rewrite _$pv env collector to a minimal stub
  --trace-paramsign-methods        Inject timing wrappers for ParamsSign prototype methods
  --help                           Show this help
`);
}

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--backend':
        i += 1;
        config.backend = String(argv[i] || config.backend);
        break;
      case '--target-script':
        i += 1;
        config.targetScriptPath = String(argv[i] || '').trim();
        break;
      case '--repeats':
        i += 1;
        config.repeats = toPositiveInt(argv[i], config.repeats);
        break;
      case '--pool':
        i += 1;
        config.poolSize = toPositiveInt(argv[i], config.poolSize);
        break;
      case '--concurrency':
        i += 1;
        config.concurrency = toPositiveInt(argv[i], config.concurrency);
        break;
      case '--max-tasks-per-worker':
        i += 1;
        config.maxTasksPerWorker = toPositiveInt(argv[i], config.maxTasksPerWorker);
        break;
      case '--warmup':
        i += 1;
        config.warmupTasks = toPositiveInt(argv[i], config.warmupTasks);
        break;
      case '--total':
        i += 1;
        config.totalTasks = toPositiveInt(argv[i], config.totalTasks);
        break;
      case '--sample-every':
        i += 1;
        config.sampleEvery = toPositiveInt(argv[i], config.sampleEvery);
        break;
      case '--enable-vm-inspector':
        config.enableVmInspector = true;
        break;
      case '--capture-vm-cpu-profile-on-stall':
        config.captureVmCpuProfileOnStall = true;
        config.enableVmInspector = true;
        break;
      case '--capture-host-thread-snapshots-on-stall':
        config.captureHostThreadSnapshotsOnStall = true;
        break;
      case '--thread-snapshot-interval':
        i += 1;
        config.threadSnapshotIntervalMs = toPositiveInt(argv[i], config.threadSnapshotIntervalMs);
        break;
      case '--thread-snapshot-buffer':
        i += 1;
        config.threadSnapshotBufferSize = toPositiveInt(argv[i], config.threadSnapshotBufferSize);
        break;
      case '--heartbeat-interval':
        i += 1;
        config.heartbeatIntervalMs = toPositiveInt(argv[i], config.heartbeatIntervalMs);
        break;
      case '--heartbeat-timeout':
        i += 1;
        config.heartbeatTimeoutMs = toPositiveInt(argv[i], config.heartbeatTimeoutMs);
        break;
      case '--slow-threshold':
        i += 1;
        config.slowTaskThresholdMs = toPositiveInt(argv[i], config.slowTaskThresholdMs);
        break;
      case '--disable-message-channel':
        config.disableMessageChannel = true;
        break;
      case '--block-security-script':
        config.blockSecurityScript = true;
        break;
      case '--clear-h5st-cache-keys':
        config.clearH5stCacheKeys = true;
        break;
      case '--stub-canvas-fingerprint':
        config.stubCanvasFingerprint = true;
        break;
      case '--stub-cookie-empty':
        config.stubCookieEmpty = true;
        break;
      case '--disable-paramsign-async-init':
        config.disableParamSignAsyncInit = true;
        break;
      case '--disable-paramsign-rds':
        config.disableParamSignRds = true;
        break;
      case '--disable-paramsign-rgo':
        config.disableParamSignRgo = true;
        break;
      case '--disable-paramsign-ram':
        config.disableParamSignRam = true;
        break;
      case '--stub-paramsign-ws':
        config.stubParamSignWs = true;
        break;
      case '--stub-paramsign-json-stringify':
        config.stubParamSignJsonStringify = true;
        break;
      case '--stub-paramsign-ws-dispatch':
        config.stubParamSignWsDispatch = true;
        break;
      case '--stub-paramsign-ws-direct-call':
        config.stubParamSignWsDirectCall = true;
        break;
      case '--stub-paramsign-ws-direct-fullargs':
        config.stubParamSignWsDirectFullArgs = true;
        break;
      case '--stub-paramsign-ws-apply-array':
        config.stubParamSignWsApplyArray = true;
        break;
      case '--stub-paramsign-ws-generic-array':
        config.stubParamSignWsGenericArray = true;
        break;
      case '--stub-paramsign-ws-reflect-array':
        config.stubParamSignWsReflectArray = true;
        break;
      case '--stub-paramsign-ws-fn-apply-call-array':
        config.stubParamSignWsFnApplyCallArray = true;
        break;
      case '--stub-paramsign-ws-shallow-arg':
        config.stubParamSignWsShallowArg = true;
        break;
      case '--stub-paramsign-encode-chain':
        config.stubParamSignEncodeChain = true;
        break;
      case '--stub-paramsign-utf8-parse':
        config.stubParamSignUtf8Parse = true;
        break;
      case '--stub-paramsign-base64-encode':
        config.stubParamSignBase64Encode = true;
        break;
      case '--stub-input-body-sha256':
        config.stubInputBodySha256 = true;
        break;
      case '--stub-paramsign-atm':
        config.stubParamSignAtm = true;
        break;
      case '--stub-paramsign-gdk':
        config.stubParamSignGdk = true;
        break;
      case '--stub-paramsign-gs':
        config.stubParamSignGs = true;
        break;
      case '--stub-paramsign-gsd':
        config.stubParamSignGsd = true;
        break;
      case '--stub-paramsign-cps':
        config.stubParamSignCps = true;
        break;
      case '--stub-paramsign-cps-single-entry':
        config.stubParamSignCpsSingleEntry = true;
        break;
      case '--stub-paramsign-cps-empty':
        config.stubParamSignCpsEmpty = true;
        break;
      case '--stub-paramsign-clt':
        config.stubParamSignClt = true;
        break;
      case '--stub-paramsign-ms':
        config.stubParamSignMs = true;
        break;
      case '--stub-paramsign-sdnmd':
        config.stubParamSignSdnmd = true;
        break;
      case '--stub-paramsign-ram-env-only':
        config.stubParamSignRamEnvOnly = true;
        break;
      case '--stub-paramsign-pv':
        config.stubParamSignPv = true;
        break;
      case '--trace-paramsign-methods':
        config.traceParamSignMethods = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (config.backend !== 'thread' && config.backend !== 'process') {
    throw new Error(`Unsupported backend: ${config.backend}`);
  }
  return config;
}

function createPool(config) {
  const common = {
    size: config.poolSize,
    debug: false,
    enableInspector: !!config.enableVmInspector,
    maxTasksPerWorker: config.maxTasksPerWorker,
    taskTimeoutMs: config.taskTimeoutMs,
    workerInitTimeoutMs: config.workerInitTimeoutMs,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    heartbeatTimeoutMs: config.heartbeatTimeoutMs,
    signatureProfile: config.signatureProfile
  };
  if (config.backend === 'process') {
    return new ProcessPool(common);
  }
  return new ThreadPool(common);
}

async function executeStage({ stageName, pool, totalTasks, concurrency, payload, timeoutMs, onTaskSettled }) {
  let issued = 0;
  let inFlight = 0;
  let completed = 0;

  await new Promise((resolve) => {
    const launch = () => {
      while (inFlight < concurrency && issued < totalTasks) {
        issued += 1;
        inFlight += 1;
        const stageTaskId = `${stageName}-${issued}`;
        const startedAt = Date.now();
        pool.runSignature(
          {
            ...payload,
            taskId: stageTaskId
          },
          { timeoutMs }
        )
          .then((result) => {
            onTaskSettled(null, {
              taskId: stageTaskId,
              startedAt,
              completedAt: Date.now(),
              durationMs: Number.isFinite(result && result.durationMs)
                ? Number(result.durationMs)
                : Date.now() - startedAt,
              result
            });
          })
          .catch((error) => {
            onTaskSettled(error, {
              taskId: stageTaskId,
              startedAt,
              completedAt: Date.now(),
              durationMs: Date.now() - startedAt,
              result: null
            });
          })
          .finally(() => {
            inFlight -= 1;
            completed += 1;
            if (completed >= totalTasks) {
              resolve();
              return;
            }
            launch();
          });
      }
    };

    if (totalTasks <= 0) {
      resolve();
      return;
    }

    launch();
  });
}

function buildGcTracker() {
  const entries = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const detail = entry && entry.detail && typeof entry.detail === 'object'
        ? entry.detail
        : null;
      const gcKind = detail && Number.isFinite(detail.kind)
        ? Number(detail.kind)
        : entry.kind;
      entries.push({
        kind: gcKind,
        kindLabel: gcKindLabel(gcKind),
        startTime: round(entry.startTime, 3),
        duration: round(entry.duration, 3)
      });
    }
  });
  observer.observe({ entryTypes: ['gc'] });
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();
  return {
    entries,
    loopDelay,
    stop() {
      observer.disconnect();
      loopDelay.disable();
      return {
        gcEntries: entries.slice(),
        eventLoopDelay: {
          minMs: round(loopDelay.min / 1e6, 3),
          maxMs: round(loopDelay.max / 1e6, 3),
          meanMs: round(loopDelay.mean / 1e6, 3),
          stddevMs: round(loopDelay.stddev / 1e6, 3),
          p95Ms: round(loopDelay.percentile(95) / 1e6, 3),
          p99Ms: round(loopDelay.percentile(99) / 1e6, 3)
        }
      };
    }
  };
}

function gcKindLabel(kind) {
  switch (kind) {
    case constants.NODE_PERFORMANCE_GC_MAJOR:
      return 'major';
    case constants.NODE_PERFORMANCE_GC_MINOR:
      return 'minor';
    case constants.NODE_PERFORMANCE_GC_INCREMENTAL:
      return 'incremental';
    case constants.NODE_PERFORMANCE_GC_WEAKCB:
      return 'weakcb';
    default:
      return `kind-${kind}`;
  }
}

function detectSynchronizedStall(slowTasks, poolSize) {
  if (!Array.isArray(slowTasks) || slowTasks.length < Math.min(4, poolSize)) {
    return null;
  }
  const offsets = slowTasks
    .map((task) => Number(task.completedOffsetMs || 0))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (offsets.length === 0) {
    return null;
  }
  const spreadMs = offsets[offsets.length - 1] - offsets[0];
  const uniqueWorkers = new Set(
    slowTasks
      .map((task) => task.workerId)
      .filter((value) => value)
  );
  const allWorkersCovered = uniqueWorkers.size >= Math.min(poolSize, slowTasks.length);
  if (!allWorkersCovered || spreadMs > 250) {
    return null;
  }
  return {
    workerCount: uniqueWorkers.size,
    spreadMs: round(spreadMs, 2),
    firstCompletedOffsetMs: offsets[0],
    lastCompletedOffsetMs: offsets[offsets.length - 1]
  };
}

async function runSingleAttempt(config, sharedPayload, runIndex, context = {}) {
  const pool = createPool(config);
  const durations = [];
  const window = [];
  const slowTasks = [];
  let maxSampleP99 = 0;
  let minSampleReqPerSec = Infinity;
  let measuredCompleted = 0;

  const gcTracker = buildGcTracker();
  let cpuProfilerSessions = null;
  let vmCpuProfiles = null;
  let hostThreadSampler = null;
  let hostThreadSnapshots = null;

  await pool.start();
  await executeStage({
    stageName: 'warmup',
    pool,
    totalTasks: config.warmupTasks,
    concurrency: config.concurrency,
    payload: sharedPayload,
    timeoutMs: config.taskTimeoutMs,
    onTaskSettled: () => {}
  });

  if (config.captureVmCpuProfileOnStall) {
    cpuProfilerSessions = await startVmCpuProfilers(pool);
  }
  if (config.captureHostThreadSnapshotsOnStall) {
    hostThreadSampler = createThreadSnapshotSampler({
      pid: process.pid,
      intervalMs: config.threadSnapshotIntervalMs,
      bufferSize: config.threadSnapshotBufferSize
    });
    hostThreadSampler.start();
  }

  const measuredStartedAt = Date.now();
  const measuredStartedAtIso = new Date(measuredStartedAt).toISOString();
  await executeStage({
    stageName: 'measure',
    pool,
    totalTasks: config.totalTasks,
    concurrency: config.concurrency,
    payload: sharedPayload,
    timeoutMs: config.taskTimeoutMs,
    onTaskSettled: (error, record) => {
      measuredCompleted += 1;
      const result = record.result || null;
      const durationMs = Number.isFinite(record.durationMs) ? Number(record.durationMs) : 0;
      if (!error) {
        durations.push(durationMs);
      }
      if (durationMs >= config.slowTaskThresholdMs) {
        const errorDetails = error && error.details && typeof error.details === 'object'
          ? error.details
          : null;
        slowTasks.push({
          taskId: record.taskId,
          workerId: result && result.workerId
            ? result.workerId
            : (error && error.workerId ? error.workerId : null),
          ok: !error,
          errorMessage: error ? String(error.message || error) : null,
          errorDetails,
          durationMs,
          startedOffsetMs: record.startedAt - measuredStartedAt,
          completedOffsetMs: record.completedAt - measuredStartedAt,
          phaseTimings: result && result.phaseTimings
            ? result.phaseTimings
            : (error && error.phaseTimings ? error.phaseTimings : null),
          taskApiTrace: result && result.taskApiTrace
            ? result.taskApiTrace
            : (error && error.taskApiTrace ? error.taskApiTrace : null),
          paramSignMethodTrace: result && result.paramSignMethodTrace
            ? result.paramSignMethodTrace
            : (error && error.paramSignMethodTrace ? error.paramSignMethodTrace : null),
          memoryUsage: result && result.memoryUsage
            ? result.memoryUsage
            : (error && error.memoryUsage ? error.memoryUsage : null),
          runtimeStats: result && result.runtimeStats
            ? result.runtimeStats
            : (error && error.runtimeStats ? error.runtimeStats : null)
        });
      }

      window.push({
        ok: !error,
        durationMs,
        completedAt: record.completedAt
      });
      if (window.length > config.sampleEvery) {
        window.shift();
      }

      if (measuredCompleted % config.sampleEvery === 0 || measuredCompleted === config.totalTasks) {
        const okDurations = window
          .filter((entry) => entry.ok)
          .map((entry) => entry.durationMs);
        const first = window[0];
        const last = window[window.length - 1];
        const windowMs = first && last ? Math.max(1, last.completedAt - first.completedAt) : 1;
        const reqPerSec = window.length / (windowMs / 1000);
        const p99 = percentile(okDurations, 99);
        if (p99 > maxSampleP99) {
          maxSampleP99 = p99;
        }
        if (reqPerSec < minSampleReqPerSec) {
          minSampleReqPerSec = reqPerSec;
        }
      }
    }
  });

  const measuredEndedAt = Date.now();
  const measuredEndedAtIso = new Date(measuredEndedAt).toISOString();
  const overallMs = measuredEndedAt - measuredStartedAt;
  if (cpuProfilerSessions) {
    vmCpuProfiles = await stopVmCpuProfilers(cpuProfilerSessions);
  }
  if (hostThreadSampler) {
    hostThreadSnapshots = hostThreadSampler.stop();
  }
  await pool.close();

  const gcSummary = gcTracker.stop();
  const synchronizedStall = detectSynchronizedStall(slowTasks, config.poolSize);
  const synchronizedWorkerIds = synchronizedStall
    ? new Set(
      slowTasks
        .map((task) => task.workerId)
        .filter((value) => value)
    )
    : null;
  const stalledVmCpuProfiles = synchronizedWorkerIds && Array.isArray(vmCpuProfiles)
    ? vmCpuProfiles.filter((entry) => synchronizedWorkerIds.has(entry.workerId))
    : null;
  const stallWindow = synchronizedStall
    ? {
      benchmarkPid: process.pid,
      measuredStartedAtMs: measuredStartedAt,
      measuredStartedAtIso,
      measuredEndedAtMs: measuredEndedAt,
      measuredEndedAtIso,
      firstCompletedAtMs: measuredStartedAt + Number(synchronizedStall.firstCompletedOffsetMs || 0),
      firstCompletedAtIso: new Date(
        measuredStartedAt + Number(synchronizedStall.firstCompletedOffsetMs || 0)
      ).toISOString(),
      lastCompletedAtMs: measuredStartedAt + Number(synchronizedStall.lastCompletedOffsetMs || 0),
      lastCompletedAtIso: new Date(
        measuredStartedAt + Number(synchronizedStall.lastCompletedOffsetMs || 0)
      ).toISOString()
    }
    : null;
  const stallThreadSnapshotWindow = synchronizedStall
    ? buildStallThreadSnapshotWindow(hostThreadSnapshots, stallWindow, slowTasks)
    : null;
  const vmCpuProfileArtifacts = synchronizedStall
    ? persistVmCpuProfiles({
      repoRoot: context.repoRoot,
      artifactBaseName: context.artifactBaseName,
      runIndex,
      profiles: stalledVmCpuProfiles || [],
      synchronizedStall
    })
    : null;
  const stallThreadSnapshotArtifacts = synchronizedStall
    ? persistStallThreadSnapshots({
      repoRoot: context.repoRoot,
      artifactBaseName: context.artifactBaseName,
      runIndex,
      window: stallThreadSnapshotWindow
    })
    : null;
  const stalledVmCpuProfileSummaries = synchronizedStall && Array.isArray(stalledVmCpuProfiles)
    ? stalledVmCpuProfiles.map((entry) => {
      const artifactEntry = vmCpuProfileArtifacts && Array.isArray(vmCpuProfileArtifacts.entries)
        ? vmCpuProfileArtifacts.entries.find((item) => item.workerId === entry.workerId)
        : null;
      return {
        workerId: entry.workerId,
        inspectorInfo: entry.inspectorInfo,
        error: entry.error || null,
        summary: entry.summary || null,
        cpuprofilePath: artifactEntry ? artifactEntry.cpuprofilePath : null,
        summaryPath: artifactEntry ? artifactEntry.summaryPath : null
      };
    })
    : null;

  return {
    runIndex,
    backend: config.backend,
    benchmarkPid: process.pid,
    measuredStartedAtMs: measuredStartedAt,
    measuredStartedAtIso,
    measuredEndedAtMs: measuredEndedAt,
    measuredEndedAtIso,
    overallMs,
    reqPerSec: round(config.totalTasks / (overallMs / 1000)),
    p95: round(percentile(durations, 95)),
    p99: round(percentile(durations, 99)),
    maxTaskMs: round(durations.length > 0 ? Math.max(...durations) : 0),
    maxSampleP99Ms: round(maxSampleP99),
    minSampleReqPerSec: round(Number.isFinite(minSampleReqPerSec) ? minSampleReqPerSec : 0),
    slowTaskThresholdMs: config.slowTaskThresholdMs,
    slowTasks,
    synchronizedStall,
    stallWindow,
    stallThreadSnapshots: stallThreadSnapshotWindow,
    stallThreadSnapshotArtifacts,
    vmCpuProfiles: stalledVmCpuProfileSummaries,
    vmCpuProfileArtifacts,
    gc: gcSummary.gcEntries,
    eventLoopDelay: gcSummary.eventLoopDelay
  };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.captureVmCpuProfileOnStall && !hasWebSocketSupport()) {
    throw new Error('VM CPU profiling requires WebSocket support. Run with node --experimental-websocket.');
  }
  const repoRoot = path.resolve(__dirname, '..');
  const artifactBaseName = `sync-stall-${config.backend}-${nowForFilename()}`;
  const targetScriptPath = config.targetScriptPath
    ? path.resolve(repoRoot, config.targetScriptPath)
    : path.join(repoRoot, 'work', 'h5st.js');
  const siteProfilePath = path.join(repoRoot, 'site-profiles', 'jd.json');

  if (!fs.existsSync(targetScriptPath)) {
    throw new Error(`Target script not found: ${targetScriptPath}`);
  }
  if (!fs.existsSync(siteProfilePath)) {
    throw new Error(`Site profile not found: ${siteProfilePath}`);
  }

  let targetScript = fs.readFileSync(targetScriptPath, 'utf8');
  if (config.disableParamSignAsyncInit) {
    targetScript = rewriteParamSignAsyncInit(targetScript);
  }
  if (config.disableParamSignRds) {
    targetScript = rewriteParamSignRdsOnly(targetScript);
  }
  if (config.disableParamSignRgo) {
    targetScript = rewriteParamSignRgoOnly(targetScript);
  }
  if (config.disableParamSignRam) {
    targetScript = rewriteParamSignRamOnly(targetScript);
  }
  if (config.stubParamSignWs) {
    targetScript = rewriteParamSignWsStub(targetScript);
  }
  if (config.stubParamSignJsonStringify) {
    targetScript = rewriteParamSignJsonStringifyStub(targetScript);
  }
  if (config.stubParamSignWsDispatch) {
    targetScript = rewriteParamSignWsDispatchBypass(targetScript);
  }
  if (config.stubParamSignWsDirectCall) {
    targetScript = rewriteParamSignWsDirectCall(targetScript);
  }
  if (config.stubParamSignWsDirectFullArgs) {
    targetScript = rewriteParamSignWsDirectFullArgs(targetScript);
  }
  if (config.stubParamSignWsApplyArray) {
    targetScript = rewriteParamSignWsApplyArray(targetScript);
  }
  if (config.stubParamSignWsGenericArray) {
    targetScript = rewriteParamSignWsGenericArray(targetScript);
  }
  if (config.stubParamSignWsReflectArray) {
    targetScript = rewriteParamSignWsReflectArray(targetScript);
  }
  if (config.stubParamSignWsFnApplyCallArray) {
    targetScript = rewriteParamSignWsFnApplyCallArray(targetScript);
  }
  if (config.stubParamSignWsShallowArg) {
    targetScript = rewriteParamSignWsShallowArg(targetScript);
  }
  if (config.stubParamSignEncodeChain) {
    targetScript = rewriteParamSignEncodeChainStub(targetScript);
  }
  if (config.stubParamSignUtf8Parse) {
    targetScript = rewriteParamSignUtf8ParseStub(targetScript);
  }
  if (config.stubParamSignBase64Encode) {
    targetScript = rewriteParamSignBase64EncodeStub(targetScript);
  }
  if (config.stubInputBodySha256) {
    targetScript = rewriteInputBodySha256Stub(targetScript);
  }
  if (config.stubParamSignAtm) {
    targetScript = rewriteParamSignAtmStub(targetScript);
  }
  if (config.stubParamSignGdk) {
    targetScript = rewriteParamSignGdkStub(targetScript);
  }
  if (config.stubParamSignGs) {
    targetScript = rewriteParamSignGsStub(targetScript);
  }
  if (config.stubParamSignGsd) {
    targetScript = rewriteParamSignGsdStub(targetScript);
  }
  if (config.stubParamSignCps) {
    targetScript = rewriteParamSignCpsStub(targetScript);
  }
  if (config.stubParamSignCpsSingleEntry) {
    targetScript = rewriteParamSignCpsSingleEntryStub(targetScript);
  }
  if (config.stubParamSignCpsEmpty) {
    targetScript = rewriteParamSignCpsEmptyStub(targetScript);
  }
  if (config.stubParamSignClt) {
    targetScript = rewriteParamSignCltStub(targetScript);
  }
  if (config.stubParamSignMs) {
    targetScript = rewriteParamSignMsStub(targetScript);
  }
  if (config.stubParamSignSdnmd) {
    targetScript = rewriteParamSignSdnmdStub(targetScript);
  }
  if (config.stubParamSignRamEnvOnly) {
    targetScript = rewriteParamSignRamEnvOnly(targetScript);
  }
  if (config.stubParamSignPv) {
    targetScript = rewriteParamSignPvStub(targetScript);
  }
  if (config.traceParamSignMethods) {
    targetScript = injectParamSignMethodTrace(targetScript);
  }
  const siteProfile = JSON.parse(fs.readFileSync(siteProfilePath, 'utf8'));
  const beforeRunScriptParts = [];
  if (config.disableMessageChannel) {
    beforeRunScriptParts.push([
      '(function () {',
      '  try { globalThis.MessageChannel = undefined; } catch (_) {}',
      '  try { globalThis.MessagePort = undefined; } catch (_) {}',
      '})();'
    ].join('\n'));
  }
  if (config.blockSecurityScript) {
    beforeRunScriptParts.push(buildBlockSecurityScriptBeforeScript());
  }
  if (config.clearH5stCacheKeys) {
    beforeRunScriptParts.push(buildClearH5stCacheBeforeScript());
  }
  if (config.stubCanvasFingerprint) {
    beforeRunScriptParts.push(buildStubCanvasFingerprintBeforeScript());
  }
  if (config.stubCookieEmpty) {
    beforeRunScriptParts.push(buildStubCookieEmptyBeforeScript());
  }
  beforeRunScriptParts.push(INVESTIGATION_BEFORE_SCRIPT);
  const payload = {
    resourceName: targetScriptPath,
    targetScript,
    siteProfile,
    beforeRunScript: beforeRunScriptParts.join('\n')
  };

  const runs = [];
  for (let i = 1; i <= config.repeats; i += 1) {
    const run = await runSingleAttempt(config, payload, i, {
      repoRoot,
      artifactBaseName
    });
    runs.push(run);
    console.log(JSON.stringify({
      runIndex: run.runIndex,
      backend: run.backend,
      reqPerSec: run.reqPerSec,
      p99: run.p99,
      maxTaskMs: run.maxTaskMs,
      maxSampleP99Ms: run.maxSampleP99Ms,
      minSampleReqPerSec: run.minSampleReqPerSec,
      slowTasks: run.slowTasks.length,
      synchronizedStall: run.synchronizedStall
    }));
  }

  const output = {
    timestamp: new Date().toISOString(),
    machine: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : 'unknown',
      logicalCores: os.cpus().length
    },
    config: {
      ...config,
      targetScriptPath: path.relative(repoRoot, targetScriptPath),
      siteProfilePath: path.relative(repoRoot, siteProfilePath)
    },
    runs
  };

  const outputDir = path.join(__dirname, 'results');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${artifactBaseName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[sync-stall] wrote ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
