'use strict';

const fs = require('fs');
const path = require('path');
const {
  nowForFilename,
  ensureDir,
  pickMedianRun,
  runBaselineCase,
  buildSummary,
  summaryTable
} = require('./experiment-common');

const REPEATS = 3;
const BASE_ARGS = [
  '--mode', 'baseline',
  '--pool', '12',
  '--concurrency', '48',
  '--max-tasks-per-worker', '50',
  '--total', '500'
];

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const timestamp = nowForFilename();
  const resultsDir = path.join(__dirname, 'results');
  const reportDir = path.join(__dirname, 'report');
  ensureDir(resultsDir);
  ensureDir(reportDir);

  const controlRuns = [];
  const experimentRuns = [];

  for (let i = 1; i <= REPEATS; i++) {
    controlRuns.push(runBaselineCase({
      repoRoot,
      label: 'c1-control',
      args: BASE_ARGS,
      env: {},
      runIndex: i
    }));
    experimentRuns.push(runBaselineCase({
      repoRoot,
      label: 'c1-reduce-observe',
      args: BASE_ARGS,
      env: {
        LEAP_PERF_DISABLE_OBSERVE: '1'
      },
      runIndex: i
    }));
  }

  const medianControl = pickMedianRun(controlRuns, 'overall.reqPerSec');
  const medianExperiment = pickMedianRun(experimentRuns, 'overall.reqPerSec');
  const summary = buildSummary(medianControl, medianExperiment);

  const output = {
    timestamp: new Date().toISOString(),
    experiment: 'C1 reduce observe',
    repeats: REPEATS,
    controlLabel: 'baseline',
    experimentLabel: 'reduce-observe',
    controlRuns,
    experimentRuns,
    medianControlRun: medianControl,
    medianExperimentRun: medianExperiment,
    summary
  };

  const jsonPath = path.join(resultsDir, `experiment-c1-reduce-observe-${timestamp}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  const markdown = [
    '# C1 减观测实验',
    '',
    `- 时间：${new Date().toISOString()}`,
    `- 重复次数：${REPEATS}`,
    `- 控制组：当前默认基线（debug=false）`,
    `- 实验组：设置 \`LEAP_PERF_DISABLE_OBSERVE=1\`，短路 native 观测门控`,
    '',
    summaryTable(summary, '基线', 'C1 减观测'),
    '',
    `- JSON 结果：${path.relative(repoRoot, jsonPath)}`,
    `- 控制组中位 run：${path.relative(repoRoot, medianControl.outputPath)}`,
    `- 实验组中位 run：${path.relative(repoRoot, medianExperiment.outputPath)}`
  ].join('\n');

  const mdPath = path.join(reportDir, `experiment-c1-reduce-observe-${timestamp}.md`);
  fs.writeFileSync(mdPath, `${markdown}\n`, 'utf8');

  console.log('\n[C1] median summary');
  console.log(summaryTable(summary, '基线', 'C1 减观测'));
  console.log(`[C1] json: ${jsonPath}`);
  console.log(`[C1] report: ${mdPath}`);
}

main();
