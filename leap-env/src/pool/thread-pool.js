'use strict';

// ThreadPool has been removed — concurrency is now managed by leapvm_server's C++ WorkerPool.
// Use StandaloneClient + ServerManager from leap-env/src/client/ instead.

class ThreadPool {
  constructor() {
    throw new Error(
      'ThreadPool has been removed. ' +
      'Use StandaloneClient + ServerManager (leap-env/src/client/) for concurrent execution.'
    );
  }
}

module.exports = { ThreadPool };
