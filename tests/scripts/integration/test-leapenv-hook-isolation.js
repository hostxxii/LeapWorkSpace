const { spawn } = require('child_process');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

const WORKER_TIMEOUT_MS = Number.parseInt(process.env.LEAP_HOOK_ISO_TIMEOUT_MS || '10000', 10);
const HOOK_A = '__hookIsoA';
const HOOK_B = '__hookIsoB';

function runWorkerRole(role) {
  try {
    const leapvm = require(path.resolve(__dirname, '../../../leap-vm'));

    const ownHook = role === 'a' ? HOOK_A : HOOK_B;
    const ownValue = role === 'a' ? 'A' : 'B';

    leapvm.setPropertyWhitelist(null, [ownHook], null);
    leapvm.setMonitorEnabled(true);

    leapvm.runScript(
      `window.${HOOK_A}='${ownValue}-on-A'; window.${HOOK_B}='${ownValue}-on-B';`
    );

    parentPort.postMessage({ type: 'done', role });
    try {
      leapvm.shutdown();
    } catch (_) {}
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      role,
      error: error && error.stack ? error.stack : String(error)
    });
    process.exit(1);
  }
}

function runChildScenarioMain() {
  const workers = [
    new Worker(__filename, { workerData: { role: 'a' } }),
    new Worker(__filename, { workerData: { role: 'b' } })
  ];

  let done = 0;
  let failed = false;
  const timer = setTimeout(() => {
    failed = true;
    for (const worker of workers) {
      worker.terminate().catch(() => {});
    }
    process.exit(1);
  }, WORKER_TIMEOUT_MS);
  timer.unref();

  for (const worker of workers) {
    worker.on('message', (msg) => {
      if (!msg || msg.type !== 'done') {
        if (msg && msg.type === 'error') {
          failed = true;
          console.error('[test-hook-isolation][child] worker error:', msg.role, msg.error);
          clearTimeout(timer);
          process.exit(1);
        }
        return;
      }
      done += 1;
      if (done === workers.length && !failed) {
        clearTimeout(timer);
        process.exit(0);
      }
    });
    worker.on('error', (error) => {
      failed = true;
      console.error('[test-hook-isolation][child] worker thread emitted error event:', error && error.stack ? error.stack : error);
      clearTimeout(timer);
      process.exit(1);
    });
    worker.on('exit', (code) => {
      if (code !== 0 && !failed) {
        failed = true;
        console.error(`[test-hook-isolation][child] worker exited with code ${code}`);
        clearTimeout(timer);
        process.exit(1);
      }
    });
  }
}

function countMatches(content, pattern) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function runParentCheck() {
  const child = spawn(process.execPath, [__filename, '--child'], {
    cwd: path.resolve(__dirname, '../../../leap-env'),
    env: {
      ...process.env,
      LEAPVM_LOG_LEVEL: process.env.LEAPVM_LOG_LEVEL || 'info',
      LEAPVM_HOST_LOG_LEVEL: process.env.LEAPVM_HOST_LOG_LEVEL || 'error',
      LEAPVM_CLI_SHOW_HOOK_LOGS: process.env.LEAPVM_CLI_SHOW_HOOK_LOGS || '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error('[test-hook-isolation] child scenario failed');
      console.error(stdout);
      console.error(stderr);
      process.exitCode = 1;
      return;
    }

    const combined = `${stdout}\n${stderr}`;
    const hookASetCount = countMatches(combined, new RegExp(`\\[hook\\]\\[native\\][^\\n]*path=${HOOK_A}\\b[^\\n]*op=set`, 'g'));
    const hookBSetCount = countMatches(combined, new RegExp(`\\[hook\\]\\[native\\][^\\n]*path=${HOOK_B}\\b[^\\n]*op=set`, 'g'));

    const ok = hookASetCount === 1 && hookBSetCount === 1;
    const report = {
      hookASetCount,
      hookBSetCount,
      expected: { hookASetCount: 1, hookBSetCount: 1 }
    };

    console.log(JSON.stringify(report, null, 2));

    if (!ok) {
      console.error('[test-hook-isolation] hook config appears to leak across worker threads');
      process.exitCode = 1;
    }
  });
}

if (!isMainThread) {
  runWorkerRole(workerData.role);
} else if (process.argv.includes('--child')) {
  runChildScenarioMain();
} else {
  runParentCheck();
}
