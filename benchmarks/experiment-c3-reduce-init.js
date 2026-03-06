'use strict';

const fs = require('fs');
const path = require('path');
const { nowForFilename, ensureDir } = require('./experiment-common');

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const resultsDir = path.join(__dirname, 'results');
  const reportDir = path.join(__dirname, 'report');
  ensureDir(resultsDir);
  ensureDir(reportDir);

  const timestamp = nowForFilename();
  const result = {
    timestamp: new Date().toISOString(),
    experiment: 'C3 reduce init',
    skipped: true,
    reason: 'Worker 内多任务已复用同一 VmInstance/Isolate/Context；当前主要问题是 shutdown 不闭环，不是每任务重复初始化。',
    evidence: [
      'leap-env/src/pool/thread-worker.js: handleInit() 中 initializeEnvironment() 只在 worker 初始化时调用一次',
      'leap-env/src/pool/thread-worker.js: handleRunSignature() 仅执行 executeSignatureTask()，不会重建环境',
      'leap-vm/src/leapvm/vm_instance.cc: VmInstance 在 worker 生命周期内创建一次主 Context',
      'benchmarks/report/lifecycle-audit.md: 第 5 次审计已确认任务间复用同一 Context'
    ],
    conclusion: 'C3 不再单独跑对照实验，直接在最终路线图中判定为“已复用，无独立优化空间；应优先修 worker 生命周期闭环”。'
  };

  const jsonPath = path.join(resultsDir, `experiment-c3-reduce-init-${timestamp}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const markdown = [
    '# C3 减初始化实验',
    '',
    '- 结果：跳过独立实验',
    `- 原因：${result.reason}`,
    '',
    '## 证据',
    '',
    ...result.evidence.map((item) => `- ${item}`),
    '',
    `- JSON 结果：${path.relative(repoRoot, jsonPath)}`
  ].join('\n');

  const mdPath = path.join(reportDir, `experiment-c3-reduce-init-${timestamp}.md`);
  fs.writeFileSync(mdPath, `${markdown}\n`, 'utf8');

  console.log('[C3] skipped');
  console.log(`[C3] json: ${jsonPath}`);
  console.log(`[C3] report: ${mdPath}`);
}

main();
