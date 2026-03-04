const { runEnvironment, DEFAULT_TARGET_SCRIPT } = require('./runner');

// 调试入口默认使用更稳妥的等待窗口，避免 Debugger.enable 尚未处理就开始执行，
// 导致 debugger 语句“看起来没断住”。
if (!process.env.LEAPVM_INSPECTOR_READY_WAIT_MS) {
  process.env.LEAPVM_INSPECTOR_READY_WAIT_MS = '1200';
}

const DEBUG_TARGET_SCRIPT = `
debugger;
${DEFAULT_TARGET_SCRIPT}
//# sourceURL=leapenv.debug.target.js
`;

try {
  runEnvironment({
    debug: true,
    waitForInspector: true,
    targetScript: DEBUG_TARGET_SCRIPT
  });
} catch (error) {
  console.error('[Host] Script Execution Error:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
