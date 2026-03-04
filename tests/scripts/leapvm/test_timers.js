// test_timers.js
const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));

// 给没有 performance 的环境做个简单 polyfill
leapvm.runScript(`
if (typeof performance === "undefined") {
  globalThis.performance = { now: () => Date.now() };
}

console.log("--- 测试 1：4ms 嵌套限制 ---");

let lastTime = performance.now();
let depth = 0;

function checkClamping() {
  const now = performance.now();
  const delta = now - lastTime;
  lastTime = now;
  depth++;

  console.log("层级: " + depth + ", 实际延迟: " + delta.toFixed(3) + " ms");

  if (depth < 15) {
    // 嵌套 setTimeout，delay = 0，浏览器会在第 5 层之后 clamp 到 >= 4ms
    setTimeout(checkClamping, 0);
  } else {
    console.log("--- 4ms 限制测试结束 ---");
  }
}

// 启动第一次调用
setTimeout(checkClamping, 0);

// --------------------------------------------------

console.log("");
console.log("--- 测试 2：字符串代码 ---");
setTimeout("console.log('字符串支持验证通过：浏览器式字符串代码执行 OK');", 100);

// --------------------------------------------------

console.log("");
console.log("--- 测试 3：参数透传 ---");
setTimeout(function (a, b, c) {
  console.log("参数透传结果:", a, b, c);
}, 50, "foo", 42, { ok: true });

setInterval(function (x) {
  console.log("setInterval 参数:", x);
}, 200, "interval-arg");

// --------------------------------------------------

console.log("");
console.log("--- 测试 4：异常静默 ---");
setTimeout(function () {
  console.log("计时器中抛出异常（应该只在 stderr 看到日志，不影响后续定时器）");
  throw new Error("boom from timer");
}, 150);

setTimeout(function () {
  console.log("异常之后的定时器仍然正常执行");
}, 250);

// --------------------------------------------------

console.log("");
console.log("--- 测试 5：delay=0 FIFO 顺序 ---");
// 同一轮内连续注册 5 个 delay=0 的 setTimeout，期望按注册顺序触发
const fifoOrder = [];
setTimeout(function() { fifoOrder.push(1); }, 0);
setTimeout(function() { fifoOrder.push(2); }, 0);
setTimeout(function() { fifoOrder.push(3); }, 0);
setTimeout(function() { fifoOrder.push(4); }, 0);
setTimeout(function() {
  fifoOrder.push(5);
  const expected = "1,2,3,4,5";
  const actual = fifoOrder.join(",");
  if (actual === expected) {
    console.log("FIFO 顺序正确: " + actual);
  } else {
    console.log("FIFO 顺序错误！期望: " + expected + " 实际: " + actual);
  }
}, 0);

// --------------------------------------------------

console.log("");
console.log("--- 测试 6：setInterval 节奏稳定性 ---");
// 注册一个 interval=50ms 的 setInterval，采集 5 次触发时间
// 期望：相邻两次间隔在 [45ms, 65ms] 范围内，不因回调耗时而持续漂移
const intervalTimings = [];
let intervalId = setInterval(function() {
  intervalTimings.push(performance.now());
  if (intervalTimings.length >= 5) {
    clearInterval(intervalId);
    const diffs = [];
    for (let i = 1; i < intervalTimings.length; i++) {
      diffs.push((intervalTimings[i] - intervalTimings[i - 1]).toFixed(1));
    }
    console.log("setInterval 间隔(ms): " + diffs.join(", "));
    // 简单漂移检测：最大间隔与最小间隔之差不超过 20ms
    const nums = diffs.map(Number);
    const drift = Math.max(...nums) - Math.min(...nums);
    if (drift <= 20) {
      console.log("节奏稳定，最大漂移: " + drift.toFixed(1) + "ms");
    } else {
      console.log("节奏漂移过大: " + drift.toFixed(1) + "ms（阈值 20ms）");
    }
  }
}, 50);

"tests scheduled";
`);

// 跑一段时间的事件循环，足够让所有定时器触发几轮
console.log("[node] 开始 RunLoop...");
leapvm.runLoop(3000);
console.log("[node] RunLoop 结束");

// 优雅关闭：清理 VM 资源
console.log("[node] 调用 shutdown...");
leapvm.shutdown();
console.log("[node] shutdown 完成");
