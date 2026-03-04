const { Worker, isMainThread, threadId } = require('worker_threads');
const path = require('path');

const WORKER_COUNT = 4;
const TIMEOUT_MS = 10000;

if (isMainThread) {
  console.log(`[Main] Starting ${WORKER_COUNT} worker_threads...`);

  let completed = 0;
  const results = [];
  const workers = [];

  const timeout = setTimeout(() => {
    console.error('[Main] Timeout! Killing workers...');
    workers.forEach(w => w.terminate());
    process.exit(1);
  }, TIMEOUT_MS);

  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker(__filename);
    workers.push(worker);

    worker.on('message', (msg) => {
      console.log(`[Main] Worker ${msg.workerId} result:`, msg.result);
      results.push(msg);

      if (results.length === WORKER_COUNT) {
        clearTimeout(timeout);
        console.log('\n[Main] All workers completed successfully!');
        console.log('[Main] Results:', results.map(r => r.result));
        process.exit(0);
      }
    });

    worker.on('error', (err) => {
      console.error(`[Main] Worker error:`, err.message);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`[Main] Worker exited with code ${code}`);
      }
    });
  }

} else {
  const workerId = threadId;

  try {
    console.log(`[Worker ${workerId}] Loading leap-vm...`);

    const leapvm = require(path.resolve(__dirname, '../../../leap-vm'));

    console.log(`[Worker ${workerId}] Running script...`);

    const result = leapvm.runScript(`1 + ${workerId}`);

    console.log(`[Worker ${workerId}] Result: ${result}`);

    if (typeof process.send === 'function') {
      process.send({ workerId, result });
    }

    leapvm.shutdown();

  } catch (err) {
    console.error(`[Worker ${workerId}] Error:`, err.message);
    console.error(err.stack);
    process.exit(1);
  }
}
