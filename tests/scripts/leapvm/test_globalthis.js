const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));

console.log('=== globalThis 测试 ===\n');

try {
    leapvm.runScript(`
        console.log('window:', typeof window);
        console.log('self:', typeof self);
        console.log('globalThis:', typeof globalThis);

        console.log('\\nwindow === self:', window === self);
        console.log('window === top:', window === top);
        console.log('window === parent:', window === parent);
        console.log('window === frames:', window === frames);
        console.log('window === globalThis:', window === globalThis);

        console.log('\\nglobalThis === self:', globalThis === self);
        console.log('globalThis === top:', globalThis === top);

        // 检查它们的实际值
        console.log('\\nwindow:', window);
        console.log('globalThis:', globalThis);
    `);
} finally {
    // 确保即使编译/执行抛错也会优雅关闭，避免退出时的 V8 fatal
    leapvm.shutdown();
}
