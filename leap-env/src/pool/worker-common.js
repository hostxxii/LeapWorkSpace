'use strict';

// worker-common has been removed — concurrency is now managed by leapvm_server.

function toPositiveInteger() {
  throw new Error('worker-common.js has been removed. Use leapvm_server standalone mode.');
}

function parseRuntimeStats() {
  throw new Error('worker-common.js has been removed. Use leapvm_server standalone mode.');
}

module.exports = { toPositiveInteger, parseRuntimeStats };
