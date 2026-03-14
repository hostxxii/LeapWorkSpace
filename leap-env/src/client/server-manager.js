'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_PORT = 9800;
const DEFAULT_WORKERS = 4;
const DEFAULT_MAX_TASKS_PER_WORKER = 200;
const DEFAULT_STARTUP_TIMEOUT_MS = 30000;
const READY_SIGNAL = 'leapvm-server ready';
const ACTIVE_SERVER_MANAGERS = new Set();
let EXIT_CLEANUP_INSTALLED = false;

/**
 * Manages the leapvm_server process lifecycle.
 *
 * Handles spawning, ready-detection, and graceful shutdown.
 */
class ServerManager {
  /**
   * @param {Object} options
   * @param {string} [options.serverBinPath] - Path to leapvm_server binary
   * @param {number} [options.workers=4]
   * @param {number} [options.port=9800]
   * @param {string} options.bundlePath - Path to leap.bundle.js
   * @param {string} [options.siteProfilePath] - Path to site-profile JSON
   * @param {string} [options.targetScriptPath] - Pre-load target script
   * @param {string} [options.targetVersion] - Target version identifier
   * @param {number} [options.maxTasksPerWorker=200]
   * @param {boolean} [options.inspector=false]
   * @param {number} [options.inspectorPort=9229]
   * @param {number} [options.startupTimeoutMs=30000]
   * @param {Object} [options.env] - Additional environment variables
   */
  constructor(options = {}) {
    this._options = options;
    this._serverBinPath = resolveServerBinPath(options.serverBinPath);
    this._port = options.port || DEFAULT_PORT;
    this._process = null;
    this._running = false;
    this._exitPromise = null;
  }

  get pid() {
    return this._process ? this._process.pid : null;
  }

  get port() {
    return this._port;
  }

  get running() {
    return this._running;
  }

  /**
   * Start the leapvm_server process.
   * Resolves when the server prints the ready signal.
   * @returns {Promise<void>}
   */
  async start() {
    if (this._running) {
      return;
    }

    const opts = this._options;
    const args = buildArgs(opts, this._port);

    const env = Object.assign({}, process.env, opts.env || {});
    // The ready signal ("leapvm-server ready") is emitted at LOG_INFO level.
    // LEAPVM_LOG_LEVEL must be 'info' or lower for ready detection to work.
    // Override here — user can control host-side noise via LEAPVM_HOST_LOG_LEVEL.
    env.LEAPVM_LOG_LEVEL = 'info';

    const proc = spawn(this._serverBinPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    this._process = proc;
    registerActiveManager(this);

    // Capture stderr/stdout for diagnostics
    const stderrChunks = [];
    proc.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    this._exitPromise = new Promise((resolve) => {
      proc.on('close', (code, signal) => {
        this._running = false;
        this._process = null;
        unregisterActiveManager(this);
        resolve({ code, signal });
      });
    });

    // Wait for ready signal
    const timeoutMs = opts.startupTimeoutMs || DEFAULT_STARTUP_TIMEOUT_MS;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        reject(new Error(
          `leapvm_server startup timeout after ${timeoutMs}ms.\n` +
          `Binary: ${this._serverBinPath}\n` +
          `Args: ${args.join(' ')}\n` +
          `Stderr:\n${stderr.slice(-2000)}`
        ));
      }, timeoutMs);

      const onData = (data) => {
        const text = data.toString();
        if (text.includes(READY_SIGNAL)) {
          clearTimeout(timeout);
          this._running = true;
          resolve();
        }
      };

      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn leapvm_server: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (!this._running) {
          clearTimeout(timeout);
          const stderr = Buffer.concat(stderrChunks).toString('utf8');
          reject(new Error(
            `leapvm_server exited prematurely (code=${code}).\n` +
            `Stderr:\n${stderr.slice(-2000)}`
          ));
        }
      });
    });
  }

  /**
   * Stop the server process gracefully (SIGTERM), with a hard kill fallback.
   * @param {number} [gracePeriodMs=5000]
   * @returns {Promise<{code: number|null, signal: string|null}>}
   */
  async stop(gracePeriodMs = 5000) {
    if (!this._process) {
      return { code: null, signal: null };
    }

    const proc = this._process;
    unregisterActiveManager(this);
    try {
      proc.kill('SIGTERM');
    } catch (_) {
      this._running = false;
      this._process = null;
      return { code: null, signal: null };
    }

    const result = await Promise.race([
      this._exitPromise,
      new Promise((resolve) =>
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch (_) {}
          resolve({ code: null, signal: 'SIGKILL' });
        }, gracePeriodMs)
      ),
    ]);

    this._running = false;
    this._process = null;
    return result;
  }
}

// ── Helpers ──

function installExitCleanupOnce() {
  if (EXIT_CLEANUP_INSTALLED) {
    return;
  }
  EXIT_CLEANUP_INSTALLED = true;
  process.on('exit', () => {
    for (const manager of Array.from(ACTIVE_SERVER_MANAGERS)) {
      manager._forceKillFromParentExit();
    }
  });
}

function registerActiveManager(manager) {
  installExitCleanupOnce();
  ACTIVE_SERVER_MANAGERS.add(manager);
}

function unregisterActiveManager(manager) {
  ACTIVE_SERVER_MANAGERS.delete(manager);
}

function resolveServerBinPath(explicit) {
  if (explicit && fs.existsSync(explicit)) {
    return explicit;
  }

  const envPath = process.env.LEAPVM_SERVER_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  // Default: relative to this file's location in leap-env/src/client/
  const defaultPath = path.resolve(__dirname, '../../../leap-vm/build-server/leapvm_server');
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  throw new Error(
    'leapvm_server binary not found. Tried:\n' +
    `  1. options.serverBinPath: ${explicit || '(not set)'}\n` +
    `  2. $LEAPVM_SERVER_PATH: ${envPath || '(not set)'}\n` +
    `  3. Default: ${defaultPath}`
  );
}

function buildArgs(opts, port) {
  const args = [
    '--workers', String(opts.workers || DEFAULT_WORKERS),
    '--port', String(port),
    '--max-tasks-per-worker', String(opts.maxTasksPerWorker ?? DEFAULT_MAX_TASKS_PER_WORKER),
  ];

  if (opts.bundlePath) {
    args.push('--bundle', opts.bundlePath);
  }

  if (opts.siteProfilePath) {
    args.push('--site-profile', opts.siteProfilePath);
  }

  if (opts.targetScriptPath) {
    args.push('--target-script', opts.targetScriptPath);
  }

  if (opts.targetVersion) {
    args.push('--target-version', opts.targetVersion);
  }

  if (opts.inspector) {
    args.push('--inspector');
    if (opts.inspectorPort) {
      args.push('--inspector-port', String(opts.inspectorPort));
    }
  }

  return args;
}

ServerManager.prototype._forceKillFromParentExit = function _forceKillFromParentExit() {
  const proc = this._process;
  unregisterActiveManager(this);
  if (!proc || proc.killed) {
    return;
  }
  try {
    proc.kill('SIGKILL');
  } catch (_) {}
};

module.exports = { ServerManager };
