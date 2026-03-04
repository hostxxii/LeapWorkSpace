// src/core/placeholder-policy.js
// 标准占位空壳策略（签名容器 profile）

(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  function defineCode(err, code) {
    try {
      Object.defineProperty(err, 'code', {
        value: code,
        configurable: true,
        enumerable: false,
        writable: true
      });
    } catch (_) {
      err.code = code;
    }
    return err;
  }

  function createTypeError(message, code) {
    const err = new TypeError(String(message || 'Type error'));
    return defineCode(err, code || 'LEAP_PLACEHOLDER_TYPE_ERROR');
  }

  function createDomExceptionLike(name, message, code) {
    const err = new Error(String(message || name || 'Error'));
    err.name = String(name || 'Error');
    return defineCode(err, code || 'LEAP_PLACEHOLDER_ERROR');
  }

  const placeholderPolicy = leapenv.placeholderPolicy || {};

  placeholderPolicy.createTypeError = function (message, code) {
    return createTypeError(message, code);
  };

  placeholderPolicy.networkDisabledError = function (apiName, detail) {
    const suffix = detail ? ': ' + String(detail) : '';
    return createTypeError(
      String(apiName || 'network API') + ' is disabled in signature container' + suffix,
      'LEAP_NETWORK_DISABLED'
    );
  };

  placeholderPolicy.rejectNetwork = function (apiName, detail) {
    const err = placeholderPolicy.networkDisabledError(apiName, detail);
    return Promise.reject(err);
  };

  placeholderPolicy.notImplementedError = function (apiName, detail) {
    const suffix = detail ? ': ' + String(detail) : '';
    return createDomExceptionLike(
      'NotSupportedError',
      String(apiName || 'API') + ' placeholder not implemented' + suffix,
      'LEAP_NOT_SUPPORTED'
    );
  };

  placeholderPolicy.invalidStateError = function (apiName, detail) {
    const suffix = detail ? ': ' + String(detail) : '';
    return createDomExceptionLike(
      'InvalidStateError',
      String(apiName || 'API') + ' invalid state' + suffix,
      'LEAP_INVALID_STATE'
    );
  };

  placeholderPolicy.emptyHeaders = function () {
    return '';
  };

  placeholderPolicy.emptyRecords = function () {
    return [];
  };

  leapenv.placeholderPolicy = placeholderPolicy;
})(globalThis);
