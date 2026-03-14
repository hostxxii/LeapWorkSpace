'use strict';

const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment,
} = require('../../../leap-env/runner');

async function withPreloadedEnvironment(targetScript, initOptions, fn) {
  const ctx = await initializeEnvironment({
    ...(initOptions || {}),
    targetScript,
  });
  try {
    return await fn(ctx.leapvm);
  } finally {
    await shutdownEnvironment(ctx.leapvm);
  }
}

async function runWithPreloadedTarget(targetScript, task, initOptions) {
  return withPreloadedEnvironment(
    targetScript,
    initOptions,
    (leapvm) => executeSignatureTask(leapvm, task || {})
  );
}

async function runJsonWithPreloadedTarget(targetScript, task, initOptions, label) {
  const raw = await runWithPreloadedTarget(targetScript, task, initOptions);
  try {
    return JSON.parse(String(raw));
  } catch (err) {
    err.message = `[${label || 'task'}] JSON parse failed: ${err.message}\nraw=${raw}`;
    throw err;
  }
}

module.exports = {
  withPreloadedEnvironment,
  runWithPreloadedTarget,
  runJsonWithPreloadedTarget,
};
