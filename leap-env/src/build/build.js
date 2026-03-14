const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { validateSkeletonContext } = require('./validate-skeleton-context');

// 配置选项
const isWatch = process.argv.includes('--watch');

const buildOptions = {
    entryPoints: [path.join(__dirname, 'entry.js')],  // src/build/entry.js
    bundle: true,
    outfile: path.join(__dirname, 'dist', 'leap.bundle.js'),  // src/build/dist/
    format: 'iife',  // 立即执行函数格式
    platform: 'neutral',  // 中性平台，不依赖 Node.js 或浏览器特定 API
    target: 'es2020',  // 目标语法版本
    minify: false,  // 开发时不压缩，便于调试
    sourcemap: true,  // 生成 source map
    logLevel: 'info',
};

async function build() {
    try {
        console.log('[Build] Starting build...');

        // 1. 生成 entry.js
        console.log('[Build] Generating entry.js...');
        require('./generate-entry.js');

        // 2. 校验 skeleton 执行上下文，避免 this 被错误绑定到 exports
        console.log('[Build] Validating skeleton context...');
        const validContext = validateSkeletonContext(path.join(__dirname, '..'));
        if (!validContext) {
            throw new Error('Skeleton context validation failed.');
        }

        // 3. 确保 dist 目录存在
        const distDir = path.join(__dirname, 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }

        if (isWatch) {
            console.log('[Build] Watch mode enabled...');
            const ctx = await esbuild.context(buildOptions);
            await ctx.watch();
            console.log('[Build] Watching for changes...');
        } else {
            await esbuild.build(buildOptions);
            console.log('[Build] Build completed successfully!');
            console.log('[Build] Output:', buildOptions.outfile);
        }
    } catch (error) {
        console.error('[Build] Build failed:', error);
        process.exit(1);
    }
}

build();
