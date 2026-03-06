'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function nowForFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function metricAt(obj, pathExpr) {
  const parts = String(pathExpr || '').split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length; i++) {
    if (!cursor || typeof cursor !== 'object') {
      return NaN;
    }
    cursor = cursor[parts[i]];
  }
  return Number(cursor);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
}

function pctDelta(base, next) {
  const lhs = Number(base);
  const rhs = Number(next);
  if (!Number.isFinite(lhs) || !Number.isFinite(rhs) || lhs === 0) {
    return 0;
  }
  return round(((rhs - lhs) / lhs) * 100);
}

function pickMedianRun(runs, metricPath = 'overall.reqPerSec') {
  if (!Array.isArray(runs) || runs.length === 0) {
    return null;
  }
  const ordered = [...runs].sort((a, b) => metricAt(a.result, metricPath) - metricAt(b.result, metricPath));
  return ordered[Math.floor(ordered.length / 2)];
}

function parseOutputPath(stdout, stderr) {
  const combined = `${stdout || ''}\n${stderr || ''}`;
  const match = combined.match(/output:\s+([^\n]+\.json)/);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

function runBaselineCase({
  repoRoot,
  label,
  args,
  env,
  runIndex
}) {
  const runnerPath = path.join(repoRoot, 'benchmarks', 'perf-baseline-runner.js');
  const child = spawnSync(
    process.execPath,
    [runnerPath, ...args],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env
      },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10
    }
  );

  process.stdout.write(`[experiment] ${label} run ${runIndex}\n`);
  if (child.stdout) {
    process.stdout.write(child.stdout);
  }
  if (child.stderr) {
    process.stderr.write(child.stderr);
  }

  if (child.status !== 0) {
    throw new Error(`${label} run ${runIndex} failed with exit code ${child.status}`);
  }

  const outputPath = parseOutputPath(child.stdout, child.stderr);
  if (!outputPath) {
    throw new Error(`${label} run ${runIndex} did not report an output path`);
  }

  const absoluteOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.join(repoRoot, outputPath);

  return {
    label,
    runIndex,
    outputPath: absoluteOutputPath,
    result: readJson(absoluteOutputPath)
  };
}

function buildSummary(controlRun, experimentRun) {
  const control = controlRun.result;
  const experiment = experimentRun.result;
  return {
    control: {
      reqPerSec: metricAt(control, 'overall.reqPerSec'),
      p99Ms: metricAt(control, 'overall.latencyMs.p99'),
      cpuPct: metricAt(control, 'overall.peakCpuPct'),
      rssPeakMb: metricAt(control, 'overall.peakRssMb')
    },
    experiment: {
      reqPerSec: metricAt(experiment, 'overall.reqPerSec'),
      p99Ms: metricAt(experiment, 'overall.latencyMs.p99'),
      cpuPct: metricAt(experiment, 'overall.peakCpuPct'),
      rssPeakMb: metricAt(experiment, 'overall.peakRssMb')
    },
    deltaPct: {
      reqPerSec: pctDelta(metricAt(control, 'overall.reqPerSec'), metricAt(experiment, 'overall.reqPerSec')),
      p99Ms: pctDelta(metricAt(control, 'overall.latencyMs.p99'), metricAt(experiment, 'overall.latencyMs.p99')),
      cpuPct: pctDelta(metricAt(control, 'overall.peakCpuPct'), metricAt(experiment, 'overall.peakCpuPct')),
      rssPeakMb: pctDelta(metricAt(control, 'overall.peakRssMb'), metricAt(experiment, 'overall.peakRssMb'))
    }
  };
}

function summaryTable(summary, controlLabel, experimentLabel) {
  return [
    '| 指标 | ' + controlLabel + ' | ' + experimentLabel + ' | 变化 |',
    '|---|---:|---:|---:|',
    `| req/s | ${summary.control.reqPerSec} | ${summary.experiment.reqPerSec} | ${summary.deltaPct.reqPerSec}% |`,
    `| p99 (ms) | ${summary.control.p99Ms} | ${summary.experiment.p99Ms} | ${summary.deltaPct.p99Ms}% |`,
    `| CPU% peak | ${summary.control.cpuPct} | ${summary.experiment.cpuPct} | ${summary.deltaPct.cpuPct}% |`,
    `| RSS peak (MB) | ${summary.control.rssPeakMb} | ${summary.experiment.rssPeakMb} | ${summary.deltaPct.rssPeakMb}% |`
  ].join('\n');
}

module.exports = {
  nowForFilename,
  ensureDir,
  pickMedianRun,
  runBaselineCase,
  buildSummary,
  summaryTable
};
