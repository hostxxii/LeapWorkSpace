console.log('[test.js] start');

const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));
console.log('[test.js] exports =', Object.keys(leapvm));

// 新的 API：不再需要手动调用 init()
// 模块加载时会自动初始化（但在 Node 环境中实际上跳过了 V8 Platform 初始化）

console.log('[test.js] running script: 1 + 2');
const result = leapvm.runScript('1 + 2');
console.log('[test.js] result =', result);

// 测试更复杂的脚本
console.log('[test.js] running script: JSON.stringify({a:1,b:2})');
const result2 = leapvm.runScript('JSON.stringify({a:1,b:2})');
console.log('[test.js] result2 =', result2);

console.log('[test.js] end');
leapvm.shutdown();
