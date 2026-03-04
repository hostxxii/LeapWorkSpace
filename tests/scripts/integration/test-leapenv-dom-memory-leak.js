const { ProcessPool } = require('../../../leap-env/src/pool/process-pool');
const { ThreadPool } = require('../../../leap-env/src/pool/thread-pool');

if (!process.env.LEAPVM_LOG_LEVEL) {
  process.env.LEAPVM_LOG_LEVEL = 'error';
}
if (!process.env.LEAPVM_HOST_LOG_LEVEL) {
  process.env.LEAPVM_HOST_LOG_LEVEL = 'error';
}

const WARMUP_TASKS = Number.parseInt(process.env.LEAP_DOM_MEM_WARMUP || '10', 10);
const MEASURE_TASKS = Number.parseInt(process.env.LEAP_DOM_MEM_TASKS || '120', 10);
const SAMPLE_WINDOW = Number.parseInt(process.env.LEAP_DOM_MEM_WINDOW || '8', 10);
const PROCESS_GROWTH_LIMIT_MB = Number.parseFloat(process.env.LEAP_DOM_MEM_LIMIT_PROCESS_MB || '80');
const THREAD_GROWTH_LIMIT_MB = Number.parseFloat(process.env.LEAP_DOM_MEM_LIMIT_THREAD_MB || '120');
const MB = 1024 * 1024;

const DOM_HEAVY_TASK_SCRIPT = `
(function () {
  var root = document.createElement('div');
  root.style.width = '320px';
  root.style.height = '20px';
  root.style.padding = '8px 10px';
  root.style.marginBottom = '3px';

  for (var i = 0; i < 240; i++) {
    var child = document.createElement('span');
    child.style.width = (80 + (i % 40)) + 'px';
    child.style.height = (12 + (i % 7)) + 'px';
    child.style.marginLeft = (i % 5) + 'px';
    root.appendChild(child);
  }

  document.appendChild(root);
  var layoutValue = root.offsetWidth + root.offsetHeight;
  return String(layoutValue + document.childNodes.length);
})();
`;

function avg(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
  }
  return sum / values.length;
}

function pickWorkerRss(taskResult, fallbackStats) {
  if (taskResult && taskResult.memoryUsage && Number.isFinite(taskResult.memoryUsage.rss)) {
    return Number(taskResult.memoryUsage.rss);
  }
  if (
    fallbackStats &&
    fallbackStats.memory &&
    Number.isFinite(fallbackStats.memory.workerRssTotal) &&
    fallbackStats.memory.workerRssTotal > 0
  ) {
    return Number(fallbackStats.memory.workerRssTotal);
  }
  if (
    fallbackStats &&
    fallbackStats.memory &&
    fallbackStats.memory.host &&
    Number.isFinite(fallbackStats.memory.host.rss)
  ) {
    return Number(fallbackStats.memory.host.rss);
  }
  return 0;
}

async function runCase(mode, PoolCtor) {
  const totalTasks = WARMUP_TASKS + MEASURE_TASKS;
  const pool = new PoolCtor({
    size: 1,
    taskTimeoutMs: 10000,
    workerInitTimeoutMs: 20000,
    heartbeatIntervalMs: 3000,
    heartbeatTimeoutMs: 12000,
    maxTasksPerWorker: totalTasks + 20
  });

  await pool.start();
  const rssSamples = [];
  try {
    for (let i = 0; i < totalTasks; i += 1) {
      const taskResult = await pool.runSignature({ targetScript: DOM_HEAVY_TASK_SCRIPT });
      const stats = pool.getStats();
      const rss = pickWorkerRss(taskResult, stats);
      if (i >= WARMUP_TASKS && rss > 0) {
        rssSamples.push(rss);
      }
    }
  } finally {
    await pool.close();
  }

  if (rssSamples.length < Math.max(4, SAMPLE_WINDOW)) {
    throw new Error(`[${mode}] insufficient RSS samples: ${rssSamples.length}`);
  }

  const win = Math.min(SAMPLE_WINDOW, rssSamples.length);
  const startAvg = avg(rssSamples.slice(0, win));
  const endAvg = avg(rssSamples.slice(-win));
  let peak = 0;
  for (let i = 0; i < rssSamples.length; i += 1) {
    if (rssSamples[i] > peak) {
      peak = rssSamples[i];
    }
  }

  const growth = endAvg - startAvg;
  const growthMb = Number((growth / MB).toFixed(2));
  const startMb = Number((startAvg / MB).toFixed(2));
  const endMb = Number((endAvg / MB).toFixed(2));
  const peakMb = Number((peak / MB).toFixed(2));
  const limitMb = mode === 'process' ? PROCESS_GROWTH_LIMIT_MB : THREAD_GROWTH_LIMIT_MB;

  return {
    mode,
    samples: rssSamples.length,
    startMb,
    endMb,
    peakMb,
    growthMb,
    limitMb,
    pass: growthMb <= limitMb
  };
}

async function main() {
  const processCase = await runCase('process', ProcessPool);
  const threadCase = await runCase('thread', ThreadPool);
  const pass = processCase.pass && threadCase.pass;

  const report = {
    ok: pass,
    config: {
      warmupTasks: WARMUP_TASKS,
      measureTasks: MEASURE_TASKS,
      sampleWindow: SAMPLE_WINDOW,
      processGrowthLimitMb: PROCESS_GROWTH_LIMIT_MB,
      threadGrowthLimitMb: THREAD_GROWTH_LIMIT_MB
    },
    process: processCase,
    thread: threadCase
  };

  console.log(JSON.stringify(report, null, 2));
  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[test-dom-memory-leak] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
