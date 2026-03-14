'use strict';

const net = require('net');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9800;
const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10MB, matches ipc_server.cc

let _nextRequestId = 0;

function nextRequestId() {
  return `req-${++_nextRequestId}-${Date.now()}`;
}

/**
 * TCP client for leapvm_server, using Length-Prefixed JSON (LPJ) protocol.
 *
 * Frame format: [4-byte uint32 LE payload_length][UTF-8 JSON payload]
 *
 * Supports multiple concurrent in-flight requests via request ID correlation.
 */
class StandaloneClient {
  constructor(options = {}) {
    this._host = options.host || DEFAULT_HOST;
    this._port = options.port || DEFAULT_PORT;
    this._connectTimeoutMs = options.connectTimeoutMs || DEFAULT_CONNECT_TIMEOUT_MS;
    this._requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    /** @type {net.Socket | null} */
    this._socket = null;
    this._connected = false;
    this._recvBuf = Buffer.alloc(0);

    /** @type {Map<string, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
    this._pending = new Map();
  }

  get connected() {
    return this._connected;
  }

  get port() {
    return this._port;
  }

  /**
   * Connect to leapvm_server.
   * @returns {Promise<void>}
   */
  connect() {
    if (this._connected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this._socket) {
          this._socket.destroy();
          this._socket = null;
        }
        reject(new Error(`Connection timeout after ${this._connectTimeoutMs}ms to ${this._host}:${this._port}`));
      }, this._connectTimeoutMs);

      const socket = new net.Socket();
      this._socket = socket;

      socket.connect(this._port, this._host, () => {
        clearTimeout(timeout);
        this._connected = true;
        resolve();
      });

      socket.on('data', (chunk) => this._onData(chunk));

      socket.on('error', (err) => {
        clearTimeout(timeout);
        if (!this._connected) {
          reject(err);
        }
        this._onClose(err);
      });

      socket.on('close', () => {
        clearTimeout(timeout);
        this._onClose(null);
      });
    });
  }

  /**
   * Execute a signature task.
   * @param {Object} payload
   * @param {string} [payload.resourceName]
   * @param {string} [payload.beforeRunScript]
   * @param {Object} [payload.fingerprintSnapshot]
   * @param {Object} [payload.storageSnapshot]
   * @param {Object} [payload.documentSnapshot]
   * @param {Object} [payload.storagePolicy]
   * @param {Object} [payload.siteProfile] - Legacy: entire siteProfile object
   * @param {string} [requestId]
   * @returns {Promise<{result: string, durationMs: number, workerId: string, targetSource: string, targetCacheHit: boolean}>}
   */
  async runSignature(payload, requestId) {
    const id = requestId || nextRequestId();
    const response = await this._request({
      type: 'run_signature',
      id,
      payload,
    });

    if (response.type === 'error') {
      const err = new Error(response.error || 'run_signature failed');
      err.serverId = id;
      err.durationMs = response.durationMs;
      throw err;
    }

    return {
      result: response.result,
      durationMs: response.durationMs,
      workerId: response.workerId,
      targetSource: response.targetSource,
      targetCacheHit: response.targetCacheHit,
    };
  }

  /**
   * Get pool statistics.
   * @returns {Promise<Object>}
   */
  async getStats() {
    const response = await this._request({
      type: 'get_stats',
      id: nextRequestId(),
    });
    return response.stats || response;
  }

  /**
   * Request graceful server shutdown.
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      await this._request({
        type: 'shutdown',
        id: nextRequestId(),
      });
    } catch {
      // Server closes connection after shutdown ACK — ignore errors
    }
  }

  /**
   * Disconnect from the server (synchronous).
   */
  disconnect() {
    this._connected = false;
    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
    }
    // Reject all pending requests
    for (const [id, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Client disconnected'));
    }
    this._pending.clear();
    this._recvBuf = Buffer.alloc(0);
  }

  // ── Internal ──

  /**
   * Send a request and await the correlated response.
   * @param {Object} request - Must have `type` and `id` fields
   * @returns {Promise<Object>}
   */
  _request(request) {
    if (!this._connected || !this._socket) {
      return Promise.reject(new Error('Not connected to leapvm_server'));
    }

    return new Promise((resolve, reject) => {
      const id = request.id;
      const timer = this._requestTimeoutMs > 0
        ? setTimeout(() => {
            this._pending.delete(id);
            reject(new Error(`Request '${id}' timed out after ${this._requestTimeoutMs}ms`));
          }, this._requestTimeoutMs)
        : null; // requestTimeoutMs <= 0: no timeout (for debug sessions)

      this._pending.set(id, { resolve, reject, timer });
      this._socket.write(encodeLPJ(request));
    });
  }

  /**
   * Handle incoming TCP data — reassemble frames and dispatch responses.
   */
  _onData(chunk) {
    this._recvBuf = Buffer.concat([this._recvBuf, chunk]);

    while (this._recvBuf.length >= 4) {
      const payloadLen = this._recvBuf.readUInt32LE(0);

      if (payloadLen > MAX_PAYLOAD_BYTES) {
        this.disconnect();
        return;
      }

      if (this._recvBuf.length < 4 + payloadLen) {
        break; // Incomplete frame
      }

      const jsonStr = this._recvBuf.slice(4, 4 + payloadLen).toString('utf8');
      this._recvBuf = this._recvBuf.slice(4 + payloadLen);

      let msg;
      try {
        msg = JSON.parse(jsonStr);
      } catch {
        continue; // Skip malformed frames
      }

      const id = msg.id;
      if (id && this._pending.has(id)) {
        const entry = this._pending.get(id);
        this._pending.delete(id);
        clearTimeout(entry.timer);
        entry.resolve(msg);
      }
    }
  }

  /**
   * Handle connection close — reject all pending requests.
   */
  _onClose(err) {
    const wasConnected = this._connected;
    this._connected = false;
    this._socket = null;

    for (const [id, entry] of this._pending) {
      clearTimeout(entry.timer);
      entry.reject(err || new Error('Connection closed'));
    }
    this._pending.clear();
    this._recvBuf = Buffer.alloc(0);
  }
}

// ── Protocol Encoding ──

function encodeLPJ(obj) {
  const jsonStr = JSON.stringify(obj);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(jsonBuf.length, 0);
  return Buffer.concat([header, jsonBuf]);
}

module.exports = { StandaloneClient };
