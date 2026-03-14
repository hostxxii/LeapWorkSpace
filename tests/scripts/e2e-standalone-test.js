#!/usr/bin/env node
// E2E test for leapvm standalone server
// Usage:
//   node tests/scripts/e2e-standalone-test.js [port]
//
// Prerequisites: leapvm_server must be running with bundle + site-profile + preloaded target:
//   ./leap-vm/build-server/leapvm_server \
//     --workers 1 --port 19800 \
//     --bundle leap-env/src/build/dist/leap.bundle.js \
//     --site-profile site-profiles/jd.json \
//     --target-script /path/to/processed-h5st.js

'use strict';

const net = require('net');

const argv = process.argv.slice(2);
const PORT = parseInt((argv.find((arg) => /^\d+$/.test(arg)) || '19800'), 10);
const HOST = '127.0.0.1';

// ── helpers ──

function encodeLPJ(obj) {
  const jsonStr = JSON.stringify(obj);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(jsonBuf.length, 0);
  return Buffer.concat([header, jsonBuf]);
}

function decodeLPJ(buf) {
  const messages = [];
  let offset = 0;
  while (offset + 4 <= buf.length) {
    const payloadLen = buf.readUInt32LE(offset);
    if (offset + 4 + payloadLen > buf.length) break;
    const json = buf.slice(offset + 4, offset + 4 + payloadLen).toString('utf8');
    messages.push(JSON.parse(json));
    offset += 4 + payloadLen;
  }
  return { messages, remaining: buf.slice(offset) };
}

// ── build requests ──

const requests = [
  // 1) get_stats — verify server is alive
  {
    type: 'get_stats',
    id: 'stats-1',
  },
  // 2) run_signature — real h5st task
  {
    type: 'run_signature',
    id: 'e2e-h5st-1',
    payload: {
      beforeRunScript: '',
      resourceName: 'h5st.js',
    },
  },
];

// ── run test ──

let recvBuf = Buffer.alloc(0);
let responseCount = 0;
let hasError = false;

const client = new net.Socket();

client.connect(PORT, HOST, () => {
  console.log(`Connected to leapvm-server at ${HOST}:${PORT}\n`);

  // Send get_stats first
  console.log('[1/2] Sending get_stats...');
  client.write(encodeLPJ(requests[0]));
});

client.on('data', (chunk) => {
  recvBuf = Buffer.concat([recvBuf, chunk]);
  const { messages, remaining } = decodeLPJ(recvBuf);
  recvBuf = remaining;

  for (const resp of messages) {
    responseCount++;

    if (responseCount === 1) {
      // get_stats response
      const s = resp.stats;
      console.log('  Workers:    ', s.totalWorkers, '(idle:', s.idleWorkers, ')');
      console.log('  Tasks:      ', s.totalTasksCompleted, 'completed,', s.totalTasksFailed, 'failed');
      if (s.targetCacheHits !== undefined) {
        console.log('  Cache:       hits=' + s.targetCacheHits,
          'misses=' + s.targetCacheMisses, 'rejected=' + s.targetCacheRejected);
        console.log('  Target src:  preloaded=' + s.targetFromPreloaded,
          'none=' + s.targetNone);
      }
      console.log();

      // Now send the h5st task
      console.log('[2/2] Sending run_signature (h5st)...');
      client.write(encodeLPJ(requests[1]));

    } else if (responseCount === 2) {
      // h5st result
      console.log('\n=== h5st Result ===');
      console.log('  Type:     ', resp.type);
      console.log('  ID:       ', resp.id);
      console.log('  Duration: ', resp.durationMs?.toFixed(1), 'ms');
      console.log('  Worker:   ', resp.workerId);
      console.log('  Mode:     ', 'preloaded-target');
      if (resp.targetSource) {
        console.log('  Target:   ', resp.targetSource, '(cache hit:', resp.targetCacheHit, ')');
      }

      if (resp.type === 'error') {
        console.log('  ERROR:    ', resp.error);
        hasError = true;
      } else {
        console.log('  Result:   ', resp.result);

        // Validate result
        try {
          const parsed = JSON.parse(resp.result);
          if (parsed && parsed.h5st && typeof parsed.h5st === 'string' && parsed.h5st.length > 10) {
            console.log('\n  ✓ h5st value looks valid (length=' + parsed.h5st.length + ')');
            console.log('  ✓ h5st prefix:', parsed.h5st.substring(0, 60) + '...');
          } else {
            console.log('\n  ✗ h5st value missing or too short');
            hasError = true;
          }
        } catch (e) {
          console.log('\n  ✗ Failed to parse result as JSON:', e.message);
          console.log('  Raw result:', String(resp.result).substring(0, 200));
          hasError = true;
        }
      }

      console.log('\n=== E2E Test', hasError ? 'FAILED' : 'PASSED', '===');
      client.destroy();
    }
  }
});

client.on('error', (err) => {
  console.error('Connection error:', err.message);
  console.error('Is leapvm_server running on port', PORT, '?');
  process.exit(1);
});

client.on('close', () => {
  process.exit(hasError ? 1 : 0);
});

// Timeout after 30s
setTimeout(() => {
  console.error('Test timed out after 30s');
  client.destroy();
  process.exit(1);
}, 30000);
