const { Worker, isMainThread, parentPort, threadId } = require('worker_threads');
const fs = require('fs');

const logFile = require('path').join(__dirname, 'test-leapenv-simple-worker.log');

function log(s) {
  const msg = `[${new Date().toISOString()}] ${s}\n`;
  fs.appendFileSync(logFile, msg);
  process.stdout.write(msg);
}

log(`isMainThread: ${isMainThread}`);

if (isMainThread) {
  log('Main: creating worker...');
  const w = new Worker(__filename);
  w.on('message', m => {
    log(`Main: got message: ${m}`);
    process.exit(0);
  });
  w.on('error', e => {
    log(`Main: error: ${e.message}`);
  });
  w.on('exit', code => {
    log(`Main: worker exited with code ${code}`);
  });
  setTimeout(() => {
    log('Main: timeout!');
    process.exit(1);
  }, 5000);
} else {
  log(`Worker ${threadId}: starting`);
  setTimeout(() => {
    log(`Worker ${threadId}: sending message`);
    parentPort.postMessage('hello from worker');
  }, 100);
}
