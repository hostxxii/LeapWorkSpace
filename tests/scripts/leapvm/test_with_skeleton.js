const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));
const fs = require('fs');
const path = require('path');

console.log('=== globalThis 测试 (带 Skeleton) ===\n');

// 1. 加载 skeleton 文件
const skeletonPath = path.join(__dirname, '../../../leap-env/.collection/skeleton_pull.js');
if (!fs.existsSync(skeletonPath)) {
    console.error('⚠️  skeleton_pull.js 不存在，请先运行 leap-env 的构建');
    process.exit(1);
}

const skeletonCode = fs.readFileSync(skeletonPath, 'utf-8');

try {
    // 2. 加载 skeleton 定义
    console.log('Loading skeleton definitions...');
    leapvm.runScript(skeletonCode);
    console.log('✓ Skeleton loaded\n');

    // 3. 测试 globalThis
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

    console.log('\n✓ All tests passed!');
} catch (e) {
    console.error('✗ Error:', e.message);
    process.exit(1);
} finally {
    leapvm.shutdown();
    console.log('✓ Shutdown completed');
}
