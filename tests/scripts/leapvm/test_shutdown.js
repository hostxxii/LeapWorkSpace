// test_shutdown.js - 测试优雅关闭功能
const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));

console.log("=== 测试优雅关闭 ===\n");

// 启动一些定时器
leapvm.runScript(`
console.log("设置定时器...");

let count = 0;
const timer = setInterval(() => {
  count++;
  console.log("  间隔定时器执行:", count);
  if (count >= 3) {
    clearInterval(timer);
    console.log("  定时器已清理");
  }
}, 100);

setTimeout(() => {
  console.log("  延迟定时器执行");
}, 200);
`);

// 运行事件循环
console.log("运行事件循环 500ms...\n");
leapvm.runLoop(500);

console.log("\n主动调用 shutdown() 清理资源...");
leapvm.shutdown();

console.log(" 清理完成，进程即将退出");
console.log(" 如果没有看到 Fatal error 就说明成功了!\n");

// 正常退出
process.exit(0);
