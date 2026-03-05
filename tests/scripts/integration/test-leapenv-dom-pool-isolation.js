const assert = require('assert');
const { ProcessPool } = require('../../../leap-env/src/pool/process-pool');
const { ThreadPool } = require('../../../leap-env/src/pool/thread-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

const TASK_COUNT = Number.parseInt(process.env.LEAP_DOM_ISO_TASKS || '8', 10);

const DOM_TASK_SCRIPT = `
(function () {
  try {
    var startChildCount = document.childNodes.length;
    var div = document.createElement('div');
    div.style.width = '37px';
    div.style.paddingLeft = '5px';
    div.style.color = 'red';
    document.appendChild(div);

    return JSON.stringify({
      ok: true,
      startChildCount: startChildCount,
      endChildCount: document.childNodes.length,
      offsetWidth: div.offsetWidth,
      colorValue: div.style.color
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      message: String(e && e.message ? e.message : e)
    });
  }
})();
`;

async function runIsolationCase(mode, PoolCtor) {
  const pool = new PoolCtor({
    size: 1,
    taskTimeoutMs: 8000,
    workerInitTimeoutMs: 15000,
    heartbeatIntervalMs: 3000,
    heartbeatTimeoutMs: 12000,
    maxTasksPerWorker: 100
  });

  await pool.start();
  const snapshots = [];
  try {
    for (let i = 0; i < TASK_COUNT; i += 1) {
      const taskResult = await pool.runSignature({ targetScript: DOM_TASK_SCRIPT });
      const rawPayload = taskResult && typeof taskResult === 'object' && 'result' in taskResult
        ? taskResult.result
        : taskResult;
      const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
      snapshots.push(payload);

      assert.ok(payload && payload.ok, `[${mode}] task ${i} failed: ${JSON.stringify(payload)}`);
      assert.strictEqual(payload.startChildCount, 0, `[${mode}] task ${i} leaked previous DOM nodes`);
      assert.strictEqual(payload.endChildCount, 1, `[${mode}] task ${i} appendChild failed`);
      assert.strictEqual(payload.offsetWidth, 42, `[${mode}] task ${i} layout width mismatch`);
      assert.strictEqual(payload.colorValue, '', `[${mode}] task ${i} non-layout style should be filtered`);
    }
  } finally {
    await pool.close();
  }

  return {
    mode,
    taskCount: TASK_COUNT,
    snapshots
  };
}

async function main() {
  const processResult = await runIsolationCase('process', ProcessPool);

  const skipThreadRaw = String(process.env.LEAPVM_SKIP_THREADPOOL_TESTS || '').trim().toLowerCase();
  const skipThread = skipThreadRaw === '1' || skipThreadRaw === 'true' || skipThreadRaw === 'yes';
  const threadResult = skipThread ? null : await runIsolationCase('thread', ThreadPool);

  const report = {
    ok: true,
    process: { taskCount: processResult.taskCount }
  };
  if (skipThread) {
    report.thread = { skipped: true, reason: 'LEAPVM_SKIP_THREADPOOL_TESTS enabled' };
    console.log('[dom-pool-isolation] ThreadPool skipped by LEAPVM_SKIP_THREADPOOL_TESTS');
  } else {
    report.thread = { taskCount: threadResult.taskCount };
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[test-dom-pool-isolation] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
