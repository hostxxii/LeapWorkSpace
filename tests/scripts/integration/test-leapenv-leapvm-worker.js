const { Worker, isMainThread, threadId, parentPort } = require('worker_threads');
const path = require('path');
const fs = require('fs');

const logFile = require('path').join(__dirname, 'test-leapenv-leapvm-worker.log');

function log(s) {
  const msg = `[${new Date().toISOString()}] [${isMainThread ? 'Main' : 'W' + threadId}] ${s}\n`;
  fs.appendFileSync(logFile, msg);
}

const WORKER_COUNT = 2;
const TIMEOUT_MS = 15000;

if (isMainThread) {
  fs.writeFileSync(logFile, '');

  log(`Starting ${WORKER_COUNT} worker_threads...`);

  const results = [];
  const workers = [];

  const timeout = setTimeout(() => {
    log('Timeout! Killing workers...');
    workers.forEach(w => w.terminate());
    log('Results so far: ' + JSON.stringify(results));
    process.exit(1);
  }, TIMEOUT_MS);

  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker(__filename);
    workers.push(worker);

    worker.on('message', (msg) => {
      log(`Received: ${JSON.stringify(msg)}`);
      results.push(msg);
      if (results.length === WORKER_COUNT) {
        clearTimeout(timeout);
        log('All workers completed!');
        log('Results: ' + JSON.stringify(results));
        process.exit(0);
      }
    });

    worker.on('error', (err) => {
      log(`Worker error: ${err.message}`);
    });

    worker.on('exit', (code) => {
      log(`Worker exited with code ${code}`);
    });
  }

} else {
  log('Worker starting...');

  try {
    log('Loading leapvm from package entry');
    const leapvm = require(path.resolve(__dirname, '../../../leap-vm'));
    log('leapvm loaded');

    log('Running script: 1 + 1');
    const result = leapvm.runScript('1 + 1');
    log(`Result: ${result}`);

    parentPort.postMessage({ threadId, result, success: true });

    log('Calling shutdown...');
    leapvm.shutdown();
    log('Shutdown complete');

  } catch (err) {
    log(`Error: ${err.message}`);
    log(`Stack: ${err.stack}`);
    parentPort.postMessage({ threadId, error: err.message, success: false });
  }
}
