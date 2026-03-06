(function (global) {
  var leapenv = global.leapenv || (global.leapenv = {});
  var dom = leapenv.domShared;
  var placeholderPolicy = leapenv.placeholderPolicy || {};

  var _cryptoRngTaskId = null;
  var _cryptoRngSeedKey = null;
  var _cryptoRngState = 0;

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

  function getTaskRandomSeed() {
    var state = getTaskState();
    if (!state || !Object.prototype.hasOwnProperty.call(state, 'randomSeed')) {
      return undefined;
    }
    return state.randomSeed;
  }

  function getCurrentTaskId() {
    if (typeof leapenv.getCurrentTaskId === 'function') {
      try {
        return String(leapenv.getCurrentTaskId() || '');
      } catch (_) {}
    }
    if (dom && typeof dom.getCurrentTaskId === 'function') {
      try {
        return String(dom.getCurrentTaskId() || '');
      } catch (_) {}
    }
    return '';
  }

  function seedToStableKey(seed) {
    if (seed === undefined) return 'undefined';
    if (seed === null) return 'null';
    var t = typeof seed;
    if (t === 'string') return 's:' + seed;
    if (t === 'number') return 'n:' + String(seed);
    if (t === 'boolean') return 'b:' + String(seed);
    if (t === 'bigint') return 'bi:' + String(seed);
    try {
      return 'j:' + JSON.stringify(seed);
    } catch (_) {
      return 'o:' + Object.prototype.toString.call(seed);
    }
  }

  function seedStringToUint32(str) {
    var s = String(str == null ? '' : str);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    if (h === 0) h = 0x9e3779b9;
    return h >>> 0;
  }

  function nextSeededUint32() {
    var x = _cryptoRngState >>> 0;
    if (x === 0) x = 0x6d2b79f5;
    x ^= (x << 13);
    x ^= (x >>> 17);
    x ^= (x << 5);
    _cryptoRngState = x >>> 0;
    return _cryptoRngState;
  }

  function ensureCryptoRngState() {
    var seed = getTaskRandomSeed();
    var taskId = getCurrentTaskId();
    if (seed === undefined) {
      _cryptoRngTaskId = null;
      _cryptoRngSeedKey = null;
      _cryptoRngState = 0;
      return false;
    }
    var seedKey = seedToStableKey(seed);
    if (_cryptoRngTaskId !== taskId || _cryptoRngSeedKey !== seedKey || !_cryptoRngState) {
      _cryptoRngTaskId = taskId;
      _cryptoRngSeedKey = seedKey;
      _cryptoRngState = seedStringToUint32(seedKey);
    }
    return true;
  }

  function nextRandomByte() {
    if (ensureCryptoRngState()) {
      return nextSeededUint32() & 0xFF;
    }
    return Math.floor(Math.random() * 256) & 0xFF;
  }

  function fillRandomBytes(byteView) {
    for (var i = 0; i < byteView.length; i++) {
      byteView[i] = nextRandomByte();
    }
  }

  function isSupportedGetRandomValuesTarget(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.byteLength !== 'number' || typeof value.byteOffset !== 'number') return false;
    if (!value.buffer || typeof value.buffer !== 'object') return false;
    var tag = Object.prototype.toString.call(value);
    return tag === '[object Int8Array]' ||
      tag === '[object Uint8Array]' ||
      tag === '[object Uint8ClampedArray]' ||
      tag === '[object Int16Array]' ||
      tag === '[object Uint16Array]' ||
      tag === '[object Int32Array]' ||
      tag === '[object Uint32Array]' ||
      tag === '[object BigInt64Array]' ||
      tag === '[object BigUint64Array]';
  }

  function makeCryptoTypeError(message, code) {
    if (placeholderPolicy && typeof placeholderPolicy.createTypeError === 'function') {
      return placeholderPolicy.createTypeError(message, code || 'LEAP_CRYPTO_TYPE_ERROR');
    }
    var err = new TypeError(String(message || 'Type error'));
    err.code = code || 'LEAP_CRYPTO_TYPE_ERROR';
    return err;
  }

  function makeQuotaExceededError(message) {
    if (placeholderPolicy && typeof placeholderPolicy.notImplementedError === 'function') {
      var err0 = placeholderPolicy.notImplementedError(message || 'crypto.getRandomValues');
      err0.name = 'QuotaExceededError';
      err0.code = 'LEAP_CRYPTO_QUOTA_EXCEEDED';
      return err0;
    }
    var err = new Error(String(message || 'Quota exceeded'));
    err.name = 'QuotaExceededError';
    err.code = 'LEAP_CRYPTO_QUOTA_EXCEEDED';
    return err;
  }

  function generateRandomHex(byteCount) {
    var hex = '';
    for (var i = 0; i < byteCount; i++) {
      var b = nextRandomByte();
      var h = (b >>> 0).toString(16);
      if (h.length < 2) h = '0' + h;
      hex += h;
    }
    return hex;
  }

  class CryptoImpl {
    getRandomValues(typedArray) {
      if (!isSupportedGetRandomValuesTarget(typedArray)) {
        throw makeCryptoTypeError('crypto.getRandomValues requires an integer TypedArray', 'LEAP_CRYPTO_INVALID_TARGET');
      }
      var byteLength = Number(typedArray.byteLength || 0);
      if (byteLength > 65536) {
        throw makeQuotaExceededError('crypto.getRandomValues quota exceeded');
      }
      var bytes;
      try {
        bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, byteLength);
      } catch (_) {
        throw makeCryptoTypeError('crypto.getRandomValues cannot access target buffer', 'LEAP_CRYPTO_INVALID_TARGET');
      }
      fillRandomBytes(bytes);
      return typedArray;
    }

    get subtle() {
      return undefined;
    }

    randomUUID() {
      var hex = generateRandomHex(16);
      // Set version 4 (bits 12-15 of time_hi_and_version)
      var versionNibble = (parseInt(hex.charAt(12), 16) & 0x0f | 0x40).toString(16);
      // Set variant (bits 6-7 of clock_seq_hi_and_reserved)
      var variantNibble = (parseInt(hex.charAt(16), 16) & 0x3f | 0x80).toString(16);
      hex = hex.substring(0, 12) + versionNibble + hex.substring(13, 16) + variantNibble + hex.substring(17);
      return hex.substring(0, 8) + '-' +
        hex.substring(8, 12) + '-' +
        hex.substring(12, 16) + '-' +
        hex.substring(16, 20) + '-' +
        hex.substring(20, 32);
    }
  }

  leapenv.registerImpl('Crypto', CryptoImpl);
})(globalThis);
