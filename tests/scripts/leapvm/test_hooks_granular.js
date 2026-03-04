const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));

console.log('=== Hook 细粒度功能测试 ===\n');

try {
    console.log('测试 1: 完整日志（所有选项开启）');
    console.log('=' .repeat(60));
    leapvm.setHookTargets(['window'], {
        operations: ['GET', 'SET', 'CALL'],
        logName: true,
        logType: true,
        logValue: true,
        logFuncParams: true,
        logCallArgs: true,
        logCallReturn: true
    });

    leapvm.runScript(`
        console.log('\\n--- SET 测试 ---');
        window.count = 42;
        window.add = function add(a, b) { return a + b; };

        console.log('\\n--- GET 测试 ---');
        const x = window.count;
        const fn = window.add;

        console.log('\\n--- CALL 测试 ---');
        const result = window.add(10, 20);
        console.log('JavaScript 侧结果:', result);
    `);

    console.log('\n' + '='.repeat(60));
    console.log('\n测试 2: 只记录类型和参数（不记录值）');
    console.log('=' .repeat(60));

    // 清理之前的 Hook 配置需要重启 VM
    leapvm.shutdown();

    leapvm.setHookTargets(['window'], {
        operations: ['SET', 'CALL'],
        logName: true,
        logType: true,
        logValue: false,          // 关闭值记录
        logFuncParams: true,
        logCallArgs: true,
        logCallReturn: false       // 关闭返回值记录
    });

    leapvm.runScript(`
        window.multiply = function(x, y) { return x * y; };
        const product = window.multiply(5, 6);
        console.log('JavaScript 侧结果:', product);
    `);

    console.log('\n' + '='.repeat(60));
    console.log('\n测试 3: 只监控函数调用（不监控属性）');
    console.log('=' .repeat(60));

    leapvm.shutdown();

    leapvm.setHookTargets(['window'], {
        operations: ['CALL'],      // 只监控 CALL
        logName: true,
        logType: false,
        logValue: false,
        logFuncParams: false,
        logCallArgs: true,
        logCallReturn: true
    });

    leapvm.runScript(`
        window.greet = function(name, age) {
            return 'Hello, ' + name + '! Age: ' + age;
        };

        console.log('设置函数（不应有日志）');

        const msg = window.greet('Alice', 25);
        console.log('JavaScript 侧结果:', msg);
    `);

    console.log('\n' + '='.repeat(60));
    console.log('\n测试 4: 测试箭头函数和匿名函数');
    console.log('=' .repeat(60));

    leapvm.shutdown();

    leapvm.setHookTargets(['window'], {
        operations: ['SET', 'CALL'],
        logName: true,
        logType: true,
        logValue: true,
        logFuncParams: true,
        logCallArgs: true,
        logCallReturn: true
    });

    leapvm.runScript(`
        // 箭头函数
        window.arrow = (a, b, c) => a + b + c;

        // 匿名函数
        window.anon = function(x) { return x * 2; };

        console.log('\\n调用箭头函数:');
        const r1 = window.arrow(1, 2, 3);
        console.log('结果:', r1);

        console.log('\\n调用匿名函数:');
        const r2 = window.anon(21);
        console.log('结果:', r2);
    `);

    console.log('\n' + '='.repeat(60));
    console.log('\n测试 5: 验证 window === globalThis');
    console.log('=' .repeat(60));

    leapvm.shutdown();

    leapvm.runScript(`
        console.log('window === self:', window === self);
        console.log('window === globalThis:', window === globalThis);
        console.log('window === top:', window === top);
        console.log('window === parent:', window === parent);
        console.log('window === frames:', window === frames);
    `);

} finally {
    leapvm.shutdown();
}

console.log('\n=== 所有测试通过！ ===');
