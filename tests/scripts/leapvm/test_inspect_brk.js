// test_inspect_brk.js - 类似 Node.js --inspect-brk 的模式
const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));

console.log('=== LeapVM Inspector Break Mode Test ===\n');

// 持续运行事件循环
const loopInterval = setInterval(() => {
    leapvm.runLoop(100);
}, 100);

// DevTools 连接后自动执行脚本
const script = `
    debugger;
    console.log('[VM] ==================');
    console.log('[VM] Test Script Started');
    console.log('[VM] ==================');

    var x = 42;
    var arr = [1, 2, 3, 4, 5];
    var obj = { name: "LeapVM", value: 100 };

    console.log('[VM]');
    console.log('[VM] Variables initialized:');
    console.log('[VM]   x = ' + x);
    console.log('[VM]   arr = [' + arr.join(', ') + ']');
    console.log('[VM]   obj = ' + JSON.stringify(obj));
    console.log('[VM]');
    console.log('[VM]  Pausing at debugger...');
    console.log('[VM]');
    console.log('[VM] Try these in DevTools Console:');
    console.log('[VM]   x');
    console.log('[VM]   x * 2');
    console.log('[VM]   arr[0]');
    console.log('[VM]   arr.length');
    console.log('[VM]   obj.name');
    console.log('[VM]   obj.value * 2');
    console.log('[VM]   JSON.stringify(obj)');
    console.log('[VM]');

    debugger;  //  DevTools is now connected, will pause here!

    console.log('[VM]');
    console.log('[VM]  Resumed from debugger');
    console.log('[VM] Test completed successfully');
    console.log('[VM]');

    //# sourceURL=inspect_brk_test.js
`;

try {
    leapvm.runScriptWithInspectorBrk(script, { port: 9229, filename: 'inspect_brk_test.js' });
    console.log('[Test] Script executed successfully');
    console.log('[Test]');
    console.log('[Test] Connection should remain stable');
    console.log('[Test] Press Ctrl+C to exit');
    console.log('[Test]');
} catch (err) {
    console.error('[Test] Error:', err && err.stack || err);
    clearInterval(loopInterval);
    leapvm.shutdown();
    process.exit(1);
}

// 优雅退出
process.on('SIGINT', () => {
    console.log('\n\n[Test] Shutting down...');
    clearInterval(loopInterval);
    leapvm.shutdown();
    console.log('[Test] Goodbye!');
    process.exit(0);
});
