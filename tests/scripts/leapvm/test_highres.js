// test_highres.js - 测试高精度定时器
const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));

console.log("=== 高精度定时器测试 ===\n");

// 测试 1: 不启用高精度（默认 15ms）
console.log("【测试 1】默认精度 (Windows 15.625ms 时间片):");
leapvm.runScript(`
if (typeof performance === "undefined") {
  globalThis.performance = { now: () => Date.now() };
}

let lastTime = performance.now();
let depth = 0;

function testDefault() {
  const now = performance.now();
  const delta = now - lastTime;
  lastTime = now;
  depth++;

  console.log("  层级", depth, "延迟:", delta.toFixed(2), "ms");

  if (depth < 8) {
    setTimeout(testDefault, 0);
  }
}

setTimeout(testDefault, 0);
`);

leapvm.runLoop(500);

// 测试 2: 启用高精度（~1ms 时间片）
console.log("\n【测试 2】启用高精度定时器:");
leapvm.enableHighResTimer();

leapvm.runScript(`
if (typeof performance === "undefined") {
  globalThis.performance = { now: () => Date.now() };
}

let lastTime2 = performance.now();
let depth2 = 0;

function testHighRes() {
  const now = performance.now();
  const delta = now - lastTime2;
  lastTime2 = now;
  depth2++;

  console.log("  层级", depth2, "延迟:", delta.toFixed(2), "ms");

  if (depth2 < 8) {
    setTimeout(testHighRes, 0);
  } else {
    console.log("\\n 观察：启用高精度后，第6层开始延迟应该接近 4-5ms");
  }
}

setTimeout(testHighRes, 0);
`);

leapvm.runLoop(500);

console.log("\n测试完成！");

// 优雅关闭（避免退出时的 Fatal error）
leapvm.shutdown();
