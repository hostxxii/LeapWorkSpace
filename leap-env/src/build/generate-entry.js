// generate-entry.js
// 自动扫描 src/ 目录，并按可控顺序生成 entry.js
// 关键约束：
// 1) skeleton/type 必须先于 skeleton/instance
// 2) skeleton/type 内部按 super 依赖进行父类优先拓扑排序

const fs = require('fs');
const path = require('path');

const WINDOW_INSTANCE_SKELETON = 'window.instance.skeleton.js';

const CORE_ORDER = [
    'runtime.js',
    'config.js',
    'tools.js',
    'skeleton-loader.js'
];

function compareByNameAndPath(a, b) {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
        return byName;
    }
    return a.path.localeCompare(b.path);
}

function compareInstanceSkeleton(a, b) {
    if (a.name === WINDOW_INSTANCE_SKELETON) return -1;
    if (b.name === WINDOW_INSTANCE_SKELETON) return  1;
    return compareByNameAndPath(a, b);
}

// 扫描目录获取所有 .js 文件
function scanDirectory(dir, basePath = 'src') {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');

        // 排除 Node-only 或自动生成目录：
        // - build: 生成脚本与产物目录
        // - pool: 主机并发池实现（已废弃），不应进入 VM 环境 bundle
        // - client: standalone TCP 客户端，宿主侧模块
        // - entry.js: 输出文件本身
        if (entry.name === 'build' || entry.name === 'pool' || entry.name === 'client' || entry.name === 'entry.js') {
            continue;
        }

        if (entry.isDirectory()) {
            files.push(...scanDirectory(fullPath, basePath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push({
                name: entry.name,
                path: './' + relativePath,
                fullPath
            });
        }
    }

    return files;
}

function getModuleGroup(filePath) {
    if (filePath.includes('core/')) return 'core';
    if (filePath.includes('skeleton/type/')) return 'skeleton-type';
    if (filePath.includes('skeleton/instance/')) return 'skeleton-instance';
    if (filePath.includes('skeleton/')) return 'skeleton-other';
    if (filePath.includes('impl/')) return 'impl';
    if (filePath.includes('instance/')) return 'instance';
    return 'other';
}

function extractTypeSkeletonMeta(file) {
    let content = '';
    try {
        content = fs.readFileSync(file.fullPath, 'utf8');
    } catch (error) {
        console.warn(`[Generate] Warning: failed to read ${file.path}:`, error.message);
        return null;
    }

    const nameMatch = content.match(/"name"\s*:\s*"([^"]+\.type)"/);
    if (!nameMatch) {
        return null;
    }

    const ctorNameMatch = content.match(/"ctorName"\s*:\s*"([^"]*)"/);
    const ctorName = ctorNameMatch ? ctorNameMatch[1] : null;

    const superMatch = content.match(/"super"\s*:\s*(null|"[^"]+")/);
    if (!superMatch) {
        return {
            typeName: nameMatch[1],
            ctorName,
            superTypeName: null
        };
    }

    const superTypeName = superMatch[1] === 'null'
        ? null
        : superMatch[1].slice(1, -1);

    return {
        typeName: nameMatch[1],
        ctorName,
        superTypeName
    };
}

function sortTypeSkeletonByInheritance(typeFiles) {
    const nodes = [...typeFiles].sort(compareByNameAndPath);
    const metaByPath = new Map();
    const typeKeyToNode = new Map();

    for (const file of nodes) {
        const meta = extractTypeSkeletonMeta(file);
        metaByPath.set(file.path, meta);
        if (!meta || !meta.typeName) {
            continue;
        }

        const keys = [meta.typeName];
        if (meta.ctorName) {
            keys.push(meta.ctorName);
        }
        if (meta.typeName.endsWith('.type')) {
            keys.push(meta.typeName.slice(0, -5));
        }

        for (const key of keys) {
            if (!key) continue;
            if (!typeKeyToNode.has(key)) {
                typeKeyToNode.set(key, file);
                continue;
            }
            const oldFile = typeKeyToNode.get(key);
            if (oldFile.path !== file.path) {
                console.warn(
                    `[Generate] Warning: duplicated skeleton type key "${key}" found in ${oldFile.path} and ${file.path}.`
                );
            }
        }
    }

    const indegree = new Map();
    const edges = new Map();
    for (const file of nodes) {
        indegree.set(file.path, 0);
        edges.set(file.path, []);
    }

    for (const file of nodes) {
        const meta = metaByPath.get(file.path);
        if (!meta || !meta.superTypeName) {
            continue;
        }

        const parentNode = typeKeyToNode.get(meta.superTypeName);
        if (!parentNode) {
            console.warn(
                `[Generate] Warning: parent type "${meta.superTypeName}" for ${file.path} not found in skeleton/type; fallback to lexical order for this dependency.`
            );
            continue;
        }

        edges.get(parentNode.path).push(file.path);
        indegree.set(file.path, indegree.get(file.path) + 1);
    }

    const queue = nodes
        .filter((file) => indegree.get(file.path) === 0)
        .sort(compareByNameAndPath);

    const nodeByPath = new Map(nodes.map((file) => [file.path, file]));
    const result = [];

    while (queue.length > 0) {
        const current = queue.shift();
        result.push(current);

        const nextPaths = edges.get(current.path) || [];
        for (const nextPath of nextPaths) {
            indegree.set(nextPath, indegree.get(nextPath) - 1);
            if (indegree.get(nextPath) === 0) {
                queue.push(nodeByPath.get(nextPath));
                queue.sort(compareByNameAndPath);
            }
        }
    }

    if (result.length !== nodes.length) {
        console.warn('[Generate] Warning: cyclic skeleton/type inheritance detected, using lexical fallback for unresolved nodes.');
        const chosen = new Set(result.map((file) => file.path));
        const remains = nodes.filter((file) => !chosen.has(file.path));
        remains.sort(compareByNameAndPath);
        result.push(...remains);
    }

    return result;
}

function sortCoreFiles(coreFiles) {
    return [...coreFiles].sort((a, b) => {
        const idxA = CORE_ORDER.indexOf(a.name);
        const idxB = CORE_ORDER.indexOf(b.name);
        if (idxA !== -1 || idxB !== -1) {
            return (idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA) -
                   (idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB);
        }
        return compareByNameAndPath(a, b);
    });
}

function buildOrderedFileList(files) {
    const groups = {
        core: [],
        'skeleton-type': [],
        'skeleton-instance': [],
        'skeleton-other': [],
        impl: [],
        instance: [],
        other: []
    };

    for (const file of files) {
        groups[getModuleGroup(file.path)].push(file);
    }

    const ordered = [];
    ordered.push(...sortCoreFiles(groups.core));
    ordered.push(...sortTypeSkeletonByInheritance(groups['skeleton-type']));
    ordered.push(...groups['skeleton-instance'].sort(compareInstanceSkeleton));
    ordered.push(...groups['skeleton-other'].sort(compareByNameAndPath));
    ordered.push(...groups.impl.sort(compareByNameAndPath));
    ordered.push(...groups.instance.sort(compareByNameAndPath));
    ordered.push(...groups.other.sort(compareByNameAndPath));

    return ordered;
}

// 主函数
function generateEntry() {
    const srcDir = path.join(__dirname, '..');  // src 目录（上一级）
    const entryPath = path.join(__dirname, 'entry.js');  // 生成在 build 目录

    console.log('[Generate] Scanning src/ directory...');

    // 扫描所有文件
    const files = scanDirectory(srcDir, srcDir);
    const orderedFiles = buildOrderedFileList(files);

    console.log('[Generate] Found files:');
    orderedFiles.forEach((f) => {
        console.log(`    - ${f.path}`);
    });

    // 生成 entry.js 内容
    const header = `// src/entry.js
// ⚠️ 此文件由 generate-entry.js 自动生成，请勿手动编辑
// 自动扫描并按以下顺序加载所有模块：
//   1. core/ - 核心运行时 (runtime → config → tools → loader)
//   2. skeleton/type/ - 类型壳（父类优先）
//   3. skeleton/instance/ - 实例壳
//   4. impl/ - 实现层
//   5. instance/ - 实例层

`;

    let currentDir = '';
    const imports = [];

    orderedFiles.forEach((file) => {
        const dir = path.dirname(file.path);

        // 添加目录分隔注释
        if (dir !== currentDir) {
            currentDir = dir;
            const dirName = dir.replace('./', '');
            const dirLabel =
                dirName === 'core' ? '1. 核心运行时 (core/)' :
                dirName === 'skeleton/type' ? '2. 类型壳 (skeleton/type/)' :
                dirName === 'skeleton/instance' ? '3. 实例壳 (skeleton/instance/)' :
                dirName === 'impl' ? '4. 实现层 (impl/)' :
                dirName === 'instance' ? '5. 实例层 (instance/)' :
                `${dirName}/`;

            imports.push(`\n// ========== ${dirLabel} ==========`);
        }

        // 添加 import 语句（从 build 目录引用上一级的模块）
        const importPath = '../' + file.path.replace('./', '');
        imports.push(`import '${importPath}';`);
    });

    const footer = `\n// ========== 初始化完成 ==========\n`;

    const content = header + imports.join('\n') + footer;

    // 写入文件
    fs.writeFileSync(entryPath, content, 'utf8');

    console.log('[Generate] ✅ entry.js generated successfully!');
    console.log(`[Generate] Output: ${entryPath}`);
}

// 执行生成
try {
    generateEntry();
} catch (error) {
    console.error('[Generate] ❌ Failed to generate entry.js:', error);
    process.exit(1);
}
