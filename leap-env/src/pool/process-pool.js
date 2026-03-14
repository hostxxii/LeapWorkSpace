'use strict';

// ProcessPool has been removed — concurrency is now managed by leapvm_server's C++ WorkerPool.
// Use StandaloneClient + ServerManager from leap-env/src/client/ instead.

class ProcessPool {
  constructor() {
    throw new Error(
      'ProcessPool has been removed. ' +
      'Use StandaloneClient + ServerManager (leap-env/src/client/) for concurrent execution.'
    );
  }
}

module.exports = { ProcessPool };
