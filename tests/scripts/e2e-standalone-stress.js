#!/usr/bin/env node
// Stress test for leapvm standalone server — preload-only
// Usage:
//   node tests/scripts/e2e-standalone-stress.js [port] [count] [concurrency]

'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const numericArgs = argv.filter((arg) => /^\d+$/.test(arg));
const PORT = parseInt(numericArgs[0] || '19800', 10);
const TASK_COUNT = parseInt(numericArgs[1] || '20', 10);
const CONCURRENCY = parseInt(numericArgs[2] || '0', 10); // 0 = blast all at once
const HOST = '127.0.0.1';
const ROOT = path.resolve(__dirname, '../..');

function encodeLPJ(obj) {
  const jsonStr = JSON.stringify(obj);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(jsonBuf.length, 0);
  return Buffer.concat([header, jsonBuf]);
}

const siteProfile = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'site-profiles/jd.json'), 'utf8')
);

const payload = {
  beforeRunScript: '',
  resourceName: 'h5st.js',
  fingerprintSnapshot: siteProfile.fingerprintSnapshot,
  storageSnapshot: siteProfile.storageSnapshot,
  documentSnapshot: siteProfile.documentSnapshot,
  storagePolicy: siteProfile.storagePolicy,
};

let recvBuf = Buffer.alloc(0);
let sent = 0;
let received = 0;
let passed = 0;
let failed = 0;
const durations = [];
let startTime;
let inflight = 0;
let cacheHits = 0;
let cacheMisses = 0;
let targetPreloaded = 0;

const client = new net.Socket();

function sendTask() {
  if (sent >= TASK_COUNT) return;
  sent++;
  inflight++;
  client.write(encodeLPJ({
    type: 'run_signature',
    id: `stress-${sent}`,
    payload,
  }));
}

function processResponse(resp) {
  received++;
  inflight--;
  const dur = resp.durationMs || 0;
  durations.push(dur);

  if (resp.type === 'error') {
    failed++;
    const label = received <= 5 || received === TASK_COUNT ? 'FAIL' : null;
    if (label) console.log(`  [${received}/${TASK_COUNT}] FAIL  ${resp.id}  ${dur.toFixed(1)}ms  ${resp.error}`);
  } else {
    try {
      const parsed = JSON.parse(resp.result);
      if (parsed && parsed.h5st && parsed.h5st.length > 10) {
        passed++;
        // Track cache/target source stats
        if (resp.targetCacheHit) cacheHits++;
        else cacheMisses++;
        if (resp.targetSource === 'preloaded') targetPreloaded++;
        // Only print first 5 and last result to keep output clean
        if (received <= 5 || received === TASK_COUNT) {
          console.log(`  [${received}/${TASK_COUNT}] OK    ${resp.id}  ${dur.toFixed(1)}ms  worker=${resp.workerId}  cache=${resp.targetCacheHit ? 'hit' : 'miss'}  src=${resp.targetSource || '?'}`);
        } else if (received === 6) {
          console.log(`  ... (${TASK_COUNT - 6} more tasks) ...`);
        }
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }

  // If using concurrency limit, send next
  if (CONCURRENCY > 0 && sent < TASK_COUNT) {
    sendTask();
  }

  if (received >= TASK_COUNT) {
    const totalMs = Date.now() - startTime;
    durations.sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

    console.log('\n=== Benchmark Results ===');
    console.log(`  Tasks:      ${TASK_COUNT}  Passed: ${passed}  Failed: ${failed}`);
    console.log(`  Wall time:  ${totalMs}ms`);
    console.log(`  Throughput: ${(TASK_COUNT / totalMs * 1000).toFixed(1)} req/s`);
    console.log(`  Avg:        ${avg.toFixed(1)}ms`);
    console.log(`  p50:        ${p50?.toFixed(1)}ms`);
    console.log(`  p95:        ${p95?.toFixed(1)}ms`);
    console.log(`  p99:        ${p99?.toFixed(1)}ms`);
    console.log(`  Min:        ${durations[0]?.toFixed(1)}ms`);
    console.log(`  Max:        ${durations[durations.length - 1]?.toFixed(1)}ms`);
    console.log(`  Cache:      ${cacheHits} hits / ${cacheMisses} misses (hit rate: ${passed > 0 ? (cacheHits / passed * 100).toFixed(1) : 0}%)`);
    console.log(`  Target src: ${targetPreloaded} preloaded`);
    console.log(`\n=== ${failed === 0 ? 'PASSED' : 'FAILED'} ===`);
    client.destroy();
    return;
  }
}

client.connect(PORT, HOST, () => {
  const mode = CONCURRENCY > 0
    ? `concurrency=${CONCURRENCY}`
    : `blast all ${TASK_COUNT} at once`;
  console.log(`Stress test: ${TASK_COUNT} tasks, ${mode}, ${HOST}:${PORT}, target=preloaded\n`);

  startTime = Date.now();

  if (CONCURRENCY > 0) {
    // Send up to CONCURRENCY tasks initially
    for (let i = 0; i < Math.min(CONCURRENCY, TASK_COUNT); i++) {
      sendTask();
    }
  } else {
    // Blast all tasks at once
    for (let i = 0; i < TASK_COUNT; i++) {
      sendTask();
    }
  }
});

client.on('data', (chunk) => {
  recvBuf = Buffer.concat([recvBuf, chunk]);
  while (recvBuf.length >= 4) {
    const payloadLen = recvBuf.readUInt32LE(0);
    if (recvBuf.length < 4 + payloadLen) break;
    const json = recvBuf.slice(4, 4 + payloadLen).toString('utf8');
    recvBuf = recvBuf.slice(4 + payloadLen);
    processResponse(JSON.parse(json));
  }
});

client.on('error', (err) => {
  console.error('Connection error:', err.message);
  process.exit(1);
});

client.on('close', () => {
  process.exit(failed > 0 ? 1 : 0);
});

setTimeout(() => {
  console.error(`Timeout after 120s (sent=${sent} received=${received} inflight=${inflight})`);
  client.destroy();
  process.exit(1);
}, 120000);
