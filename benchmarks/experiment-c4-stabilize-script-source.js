'use strict';

const fs = require('fs');
const path = require('path');
const { nowForFilename, ensureDir } = require('./experiment-common');
const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment
} = require('../leap-env/runner');
const {
  buildPostTaskCleanupScript,
  getNativeRuntimeStats
} = require('../leap-env/src/pool/worker-common');

process.env.LEAPVM_TRACK_GC_OBJECT_STATS = process.env.LEAPVM_TRACK_GC_OBJECT_STATS || '1';
process.env.LEAPVM_LOG_LEVEL = process.env.LEAPVM_LOG_LEVEL || 'error';
process.env.LEAPVM_HOST_LOG_LEVEL = process.env.LEAPVM_HOST_LOG_LEVEL || 'error';

const ITERATIONS = 100;

function bytesToMb(bytes) {
  return Number((Number(bytes || 0) / (1024 * 1024)).toFixed(2));
}

function topHeapTypes(stats, limit) {
  return (stats.v8TopHeapObjectTypes || [])
    .slice(0, limit)
    .map((entry) => ({
      type: String(entry.type || ''),
      subType: String(entry.subType || ''),
      count: Number(entry.count || 0),
      sizeMb: bytesToMb(entry.size)
    }));
}

function summarizeCase(name, stats) {
  return {
    name,
    iterations: ITERATIONS,
    v8UsedHeapMb: bytesToMb(stats.v8UsedHeapSize),
    v8LargeObjectSpaceUsedMb: bytesToMb(stats.v8LargeObjectSpaceUsedSize),
    v8CodeSpaceUsedMb: bytesToMb(stats.v8CodeSpaceUsedSize),
    v8OldSpaceUsedMb: bytesToMb(stats.v8OldSpaceUsedSize),
    v8TrackedHeapObjectTypeCount: Number(stats.v8TrackedHeapObjectTypeCount || 0),
    topHeapObjectTypes: topHeapTypes(stats, 5)
  };
}

function getTopHeapType(item, typeName) {
  return (item.topHeapObjectTypes || []).find((entry) => entry.type === typeName) || null;
}

function buildCachedTargetInstallScript(targetScript) {
  return (
    'globalThis.__leapCachedTarget = new Function(' +
    JSON.stringify(targetScript) +
    ');\n' +
    '//# sourceURL=leapenv.cached-target.install.js\n'
  );
}

function buildCachedTaskScript(taskId, overrides) {
  const safeTaskId = JSON.stringify(String(taskId));
  const fingerprintSnapshotJson = JSON.stringify(overrides.fingerprintSnapshot);
  const storageSnapshotJson = JSON.stringify(overrides.storageSnapshot);
  const documentSnapshotJson = JSON.stringify(overrides.documentSnapshot);
  const storagePolicyJson = JSON.stringify(overrides.storagePolicy);
  return (
    '{\n' +
    '  const __leapEnv = (typeof globalThis.leapenv !== \'undefined\') ? globalThis.leapenv : null;\n' +
    '  const __leapDomService = (__leapEnv && __leapEnv.domShared) ? __leapEnv.domShared : null;\n' +
    '  const __leapRuntime = (__leapEnv && typeof __leapEnv.getRuntimeStore === \'function\')\n' +
    '    ? __leapEnv.getRuntimeStore()\n' +
    '    : (__leapEnv && __leapEnv.__runtime ? __leapEnv.__runtime : null);\n' +
    '  const __leapHookRuntime = (__leapRuntime && __leapRuntime.debug) ? __leapRuntime.debug.hookRuntime : null;\n' +
    '  try {\n' +
    '    if (__leapHookRuntime) {\n' +
    '      __leapHookRuntime.phase = \'setup\';\n' +
    '      __leapHookRuntime.active = false;\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.beginTask === \'function\') {\n' +
    '      __leapEnv.beginTask(' + safeTaskId + ');\n' +
    '    }\n' +
    '    if (__leapDomService && typeof __leapDomService.beginTaskScope === \'function\') {\n' +
    '      __leapDomService.beginTaskScope(' + safeTaskId + ');\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.applyFingerprintSnapshot === \'function\') {\n' +
    '      const __leapFingerprintSnapshot = ' + fingerprintSnapshotJson + ';\n' +
    '      if (typeof __leapFingerprintSnapshot !== \'undefined\') {\n' +
    '        __leapEnv.applyFingerprintSnapshot(__leapFingerprintSnapshot);\n' +
    '      }\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.applyStorageSnapshot === \'function\') {\n' +
    '      const __leapStorageSnapshot = ' + storageSnapshotJson + ';\n' +
    '      const __leapStoragePolicy = ' + storagePolicyJson + ';\n' +
    '      if (typeof __leapStorageSnapshot !== \'undefined\') {\n' +
    '        __leapEnv.applyStorageSnapshot(__leapStorageSnapshot, __leapStoragePolicy);\n' +
    '      }\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.applyDocumentSnapshot === \'function\') {\n' +
    '      const __leapDocumentSnapshot = ' + documentSnapshotJson + ';\n' +
    '      if (typeof __leapDocumentSnapshot !== \'undefined\') {\n' +
    '        __leapEnv.applyDocumentSnapshot(__leapDocumentSnapshot);\n' +
    '      }\n' +
    '    }\n' +
    '    if (__leapHookRuntime) {\n' +
    '      __leapHookRuntime.phase = \'task\';\n' +
    '      __leapHookRuntime.active = true;\n' +
    '    }\n' +
    '    if (typeof globalThis.__leapCachedTarget === \'function\') {\n' +
    '      globalThis.__leapCachedTarget();\n' +
    '    }\n' +
    '  } finally {\n' +
    '    if (__leapHookRuntime) {\n' +
    '      try {\n' +
    '        __leapHookRuntime.active = false;\n' +
    '        __leapHookRuntime.phase = \'idle\';\n' +
    '      } catch (_) {}\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.resetSignatureTaskState === \'function\') {\n' +
    '      try { __leapEnv.resetSignatureTaskState(); } catch (_) {}\n' +
    '    }\n' +
    '    if (__leapDomService && typeof __leapDomService.endTaskScope === \'function\') {\n' +
    '      __leapDomService.endTaskScope(' + safeTaskId + ');\n' +
    '    }\n' +
    '    if (__leapEnv && typeof __leapEnv.endTask === \'function\') {\n' +
    '      try { __leapEnv.endTask(' + safeTaskId + '); } catch (_) {}\n' +
    '    }\n' +
    '  }\n' +
    '}\n' +
    '//# sourceURL=leapenv.task.cached-wrapper.js\n'
  );
}

function runCase(name, handler) {
  const targetScriptPath = path.join(process.cwd(), 'work', 'h5st.js');
  const siteProfilePath = path.join(process.cwd(), 'site-profiles', 'jd.json');
  const targetScript = fs.readFileSync(targetScriptPath, 'utf8');
  const siteProfile = JSON.parse(fs.readFileSync(siteProfilePath, 'utf8'));
  const overrides = {
    fingerprintSnapshot: siteProfile.fingerprintSnapshot,
    storageSnapshot: siteProfile.storageSnapshot,
    documentSnapshot: siteProfile.documentSnapshot,
    storagePolicy: siteProfile.storagePolicy
  };

  let context = null;
  try {
    context = initializeEnvironment({ debug: false, signatureProfile: 'fp-occupy' });
    handler({
      leapvm: context.leapvm,
      targetScript,
      siteProfile,
      overrides
    });
    const stats = getNativeRuntimeStats(context.leapvm, { forceGc: true }) || {};
    return summarizeCase(name, stats);
  } finally {
    shutdownEnvironment(context && context.leapvm, { skipTaskScopeRelease: false });
  }
}

function writeReport(repoRoot, jsonPath, result) {
  const uniqueCase = result.cases.find((item) => item.name === 'unique-task-id');
  const constantCase = result.cases.find((item) => item.name === 'constant-task-id');
  const cachedCase = result.cases.find((item) => item.name === 'cached-target-small-wrapper');
  const uniqueScriptSource = getTopHeapType(uniqueCase, 'SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE');
  const constantScriptSource = getTopHeapType(constantCase, 'SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE');
  const cachedScriptSource = getTopHeapType(cachedCase, 'SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE');
  const uniqueScriptSourceCount = Number(uniqueScriptSource && uniqueScriptSource.count || 0);
  const constantScriptSourceCount = Number(constantScriptSource && constantScriptSource.count || 0);
  const cachedScriptSourceCount = Number(cachedScriptSource && cachedScriptSource.count || 0);
  const uniqueLooksStabilized =
    uniqueScriptSourceCount > 0 &&
    constantScriptSourceCount > 0 &&
    uniqueScriptSourceCount <= (constantScriptSourceCount + 1);
  const lines = [
    '# C4 稳定脚本源码实验',
    '',
    `- 时间：${result.timestamp}`,
    `- 迭代次数：每组 ${ITERATIONS} 次`,
    `- JSON 结果：[${path.relative(repoRoot, jsonPath)}](${path.relative(repoRoot, jsonPath)})`,
    '',
    '## 结论',
    '',
    uniqueLooksStabilized
      ? `- 唯一 taskId 与固定 taskId 两组已经收敛：两者的 \`Large Object Space\` 都约为 \`${uniqueCase.v8LargeObjectSpaceUsedMb}MB\`，说明当前 \`executeSignatureTask()\` 已不再因为任务唯一 payload 生成线性增长的大源码对象。`
      : `- 唯一大源码路径（每任务不同 taskId）下，\`Large Object Space\` 达到 \`${uniqueCase.v8LargeObjectSpaceUsedMb}MB\`，\`SCRIPT_SOURCE_NON_EXTERNAL_TWO_BYTE_TYPE\` 为 \`${uniqueScriptSourceCount}\` 个。`,
    `- 固定 taskId 后，同样 100 次任务的 \`Large Object Space\` 为 \`${constantCase.v8LargeObjectSpaceUsedMb}MB\`，脚本源码对象为 \`${constantScriptSourceCount}\` 个。`,
    `- 将 \`h5st.js\` 预装为一次性缓存函数、每任务仅执行小包装脚本后，\`Large Object Space\` 为 \`${cachedCase.v8LargeObjectSpaceUsedMb}MB\`，脚本源码对象为 \`${cachedScriptSourceCount}\` 个。`,
    '',
    '## 数据表',
    '',
    '| case | usedHeap(MB) | largeObject(MB) | codeSpace(MB) | oldSpace(MB) | top-1 | top-1 count | top-1 size(MB) |',
    '|---|---:|---:|---:|---:|---|---:|---:|',
    ...result.cases.map((item) => {
      const top = item.topHeapObjectTypes[0] || { type: '', count: 0, sizeMb: 0 };
      return `| ${item.name} | ${item.v8UsedHeapMb} | ${item.v8LargeObjectSpaceUsedMb} | ${item.v8CodeSpaceUsedMb} | ${item.v8OldSpaceUsedMb} | ${top.type} | ${top.count} | ${top.sizeMb} |`;
    }),
    '',
    '## 解释',
    '',
    uniqueLooksStabilized
      ? '- 当前 runner 已把大 `targetScript` 从动态拼接路径切到稳定源码执行路径；因此即使 `taskId` 每次变化，V8 看到的主脚本源码也不再持续变化。'
      : '- `executeSignatureTask()` 仍会把 `taskId`、snapshot 和 `targetScript` 一起拼进唯一源码，导致 V8 为每个任务保留新的大脚本源码对象。',
    '- `cached-target-small-wrapper` 仍然代表更激进的“一次安装函数、后续只跑小包装脚本”下限，可作为后续继续优化的对照组。',
    '',
    '## 下一步',
    '',
    uniqueLooksStabilized
      ? '- 下一步优先把这套执行模型带到真实 longevity 跑法，确认 `mtp=500` 下 RSS 和 `Code Space` 曲线是否同步回落。'
      : '- 优先把 `executeSignatureTask()` 改成“稳定小包装脚本 + 缓存目标脚本/函数”的执行模型。',
    '- `taskId`、站点 snapshot 等可变数据都不应继续直接内联进 48 万字符级别的大源码文本。',
    '- 如果要继续验证，可直接复跑本脚本：`node benchmarks/experiment-c4-stabilize-script-source.js`。'
  ];

  const reportPath = path.join(
    path.dirname(jsonPath).replace(path.sep + 'results', path.sep + 'report'),
    `experiment-c4-stabilize-script-source-${path.basename(jsonPath, '.json').split('-').pop()}.md`
  );
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  return reportPath;
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const resultsDir = path.join(__dirname, 'results');
  const reportDir = path.join(__dirname, 'report');
  ensureDir(resultsDir);
  ensureDir(reportDir);

  const cases = [
    runCase('constant-task-id', ({ leapvm, targetScript, siteProfile }) => {
      for (let i = 0; i < ITERATIONS; i += 1) {
        const taskId = 'task-fixed';
        executeSignatureTask(leapvm, {
          taskId,
          resourceName: 'work/h5st.js',
          targetScript,
          siteProfile
        });
        leapvm.runScript(
          buildPostTaskCleanupScript(JSON.stringify(taskId)),
          'leapenv.worker.post-task-cleanup.js'
        );
      }
    }),
    runCase('unique-task-id', ({ leapvm, targetScript, siteProfile }) => {
      for (let i = 0; i < ITERATIONS; i += 1) {
        const taskId = `task-${i + 1}`;
        executeSignatureTask(leapvm, {
          taskId,
          resourceName: 'work/h5st.js',
          targetScript,
          siteProfile
        });
        leapvm.runScript(
          buildPostTaskCleanupScript(JSON.stringify(taskId)),
          'leapenv.worker.post-task-cleanup.js'
        );
      }
    }),
    runCase('cached-target-small-wrapper', ({ leapvm, targetScript, overrides }) => {
      leapvm.runScript(
        buildCachedTargetInstallScript(targetScript),
        'leapenv.cached-target.install.js'
      );
      for (let i = 0; i < ITERATIONS; i += 1) {
        const taskId = `task-${i + 1}`;
        leapvm.runScript(
          buildCachedTaskScript(taskId, overrides),
          'leapenv.task.cached-wrapper.js'
        );
        leapvm.runScript(
          buildPostTaskCleanupScript(JSON.stringify(taskId)),
          'leapenv.worker.post-task-cleanup.js'
        );
      }
    })
  ];

  const result = {
    timestamp: new Date().toISOString(),
    experiment: 'C4 stabilize script source',
    iterations: ITERATIONS,
    cases
  };

  const timestamp = nowForFilename();
  const jsonPath = path.join(resultsDir, `experiment-c4-stabilize-script-source-${timestamp}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  const reportPath = writeReport(repoRoot, jsonPath, result);

  console.log('[C4] completed');
  console.log(`[C4] json: ${jsonPath}`);
  console.log(`[C4] report: ${reportPath}`);
}

main();
