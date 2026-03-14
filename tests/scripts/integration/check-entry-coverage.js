#!/usr/bin/env node
// scripts/check-entry-coverage.js
// I-4: 检查 src/build/entry.js 是否引入了 src/skeleton/type/ 和 src/skeleton/instance/ 下的所有 skeleton 文件
// 集成到 CI / pretest，漏引入的 skeleton 在构建期暴露，而不是等到运行时

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../leap-env');
const ENTRY_PATH = path.join(ROOT, 'src/build/entry.js');
const TYPE_DIR = path.join(ROOT, 'src/skeleton/type');
const INSTANCE_DIR = path.join(ROOT, 'src/skeleton/instance');

let hasError = false;

const entry = fs.readFileSync(ENTRY_PATH, 'utf8');

function checkDir(dir, label) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.skeleton.js'));
  files.forEach(f => {
    // entry.js 使用 import ... from '...' 引入，检查文件名（不含 .js 后缀也可能匹配）
    const baseName = f.replace(/\.js$/, '');
    if (!entry.includes(baseName)) {
      console.error('[MISSING] ' + label + '/' + f + ' not included in entry.js');
      hasError = true;
    }
  });
  console.log('[OK] ' + label + ': ' + files.length + ' skeleton file(s) checked');
}

checkDir(TYPE_DIR, 'skeleton/type');
checkDir(INSTANCE_DIR, 'skeleton/instance');

if (hasError) {
  console.error('\n[FAIL] Some skeleton files are missing from entry.js. Please add them.');
  process.exit(1);
} else {
  console.log('\n[PASS] All skeleton files are included in entry.js.');
}
