'use strict';

const fs = require('fs');
const path = require('path');

const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment,
  DEFAULT_DEBUG_CPP_WRAPPER_RULES,
} = require('./leap-env/runner');

const ROOT_DIR = __dirname;
const WORK_DIR = path.join(ROOT_DIR, 'work');
const argv = process.argv.slice(2);

function hasFlag(flag) {
  return argv.includes(flag);
}

function getArg(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeBuiltinRules(override) {
  const base = jsonClone(DEFAULT_DEBUG_CPP_WRAPPER_RULES);
  const next = override && typeof override === 'object' ? override : {};
  const merged = { ...base, ...next };
  merged.whitelist = { ...base.whitelist, ...(next.whitelist || {}) };
  merged.blacklist = { ...base.blacklist, ...(next.blacklist || {}) };
  if (!Array.isArray(merged.operations) || merged.operations.length === 0) {
    merged.operations = base.operations;
  }
  if (!Array.isArray(merged.targets) || merged.targets.length === 0) {
    merged.targets = base.targets;
  }
  return merged;
}

function resolveTargetFile() {
  const fileArg = getArg('--file', null);
  if (!fs.existsSync(WORK_DIR)) throw new Error('work/ 目录不存在: ' + WORK_DIR);

  if (fileArg) {
    const p = path.isAbsolute(fileArg) ? fileArg : path.join(WORK_DIR, fileArg);
    if (!fs.existsSync(p)) throw new Error('目标文件不存在: ' + p);
    return p;
  }

  const files = fs.readdirSync(WORK_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(WORK_DIR, f));

  if (files.length === 0) throw new Error('work/ 中没有 .js 文件: ' + WORK_DIR);
  if (files.length > 1) {
    console.log('[run-work] 多个 .js 文件，默认使用第一个（可用 --file 指定）:');
    for (const f of files) console.log('  -', path.basename(f));
  }
  return files[0];
}

function resolveEntryFile() {
  const entryFileArg = getArg('--entry-file', null);
  if (!entryFileArg) return null;

  const candidates = path.isAbsolute(entryFileArg)
    ? [entryFileArg]
    : [
        path.resolve(process.cwd(), entryFileArg),
        path.join(ROOT_DIR, entryFileArg),
        path.join(WORK_DIR, entryFileArg),
      ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('--entry-file 不存在: ' + entryFileArg);
}

function resolveSiteProfileFile() {
  const arg = getArg('--site-profile', null);
  if (!arg) return null;

  const profileDirCandidates = [
    path.join(ROOT_DIR, 'site-profiles'),
    path.join(WORK_DIR, 'site-profiles'),
  ];

  const directCandidates = path.isAbsolute(arg)
    ? [arg]
    : [
        path.resolve(process.cwd(), arg),
        path.join(ROOT_DIR, arg),
        path.join(WORK_DIR, arg),
      ];

  const profileName = path.basename(arg);
  const profileDirSearch = path.isAbsolute(arg)
    ? []
    : profileDirCandidates.flatMap((dir) => ([
        path.join(dir, arg),
        path.join(dir, profileName),
        path.join(dir, profileName.endsWith('.json') ? profileName : `${profileName}.json`),
      ]));

  const candidates = [...directCandidates, ...profileDirSearch];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(`--site-profile 不存在: ${arg}（也未在 site-profiles/ 中找到）`);
}

function parseJsonInput(flag, raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${flag} JSON 解析失败: ${(err && err.message) || String(err)}`);
  }
}

function resolveSiteProfile() {
  if (hasFlag('--site-profile-json')) {
    throw new Error('参数 --site-profile-json 已移除，请改用 --site-profile 并从 site-profiles/ 读取 JSON 文件');
  }
  const filePath = resolveSiteProfileFile();
  if (filePath) {
    return {
      source: filePath,
      value: parseJsonInput('--site-profile', fs.readFileSync(filePath, 'utf8'))
    };
  }
  return null;
}

function buildTargetScript(targetCode, entryCode) {
  return entryCode && String(entryCode).trim()
    ? (targetCode + '\n\n' + entryCode + '\n')
    : (targetCode + '\n');
}

function resolveBuiltinRules() {
  const fromConfig = mergeBuiltinRules(RUN_CONFIG.debugCppWrapperRules);
  if (hasFlag('--no-builtin')) {
    return { ...fromConfig, enabled: false };
  }

  const forceBuiltin = hasFlag('--builtin');
  const phaseArg = getArg('--builtin-phase', null);
  const maxPerApiRaw = getArg('--builtin-max-per-api', null);
  const maxPerApi = maxPerApiRaw == null ? undefined : Number(maxPerApiRaw);

  const withCli = {
    ...fromConfig,
    enabled: forceBuiltin ? true : fromConfig.enabled,
  };
  if (phaseArg) withCli.phase = String(phaseArg);
  if (maxPerApiRaw != null) {
    if (!Number.isFinite(maxPerApi)) {
      throw new Error('--builtin-max-per-api 必须是数字');
    }
    withCli.maxPerApi = maxPerApi;
  }
  return withCli;
}

function runOnce(options) {
  const {
    targetPath,
    targetScript,
    beforeTaskScript,
    debug,
    domBackend,
    siteProfile,
    waitForInspector,
    debugCppWrapperRules,
  } = options;
  let ctx = null;
  try {
    ctx = initializeEnvironment({
      debug,
      domBackend,
      waitForInspector,
      debugCppWrapperRules,
    });

    if (debugCppWrapperRules.enabled && typeof ctx.leapvm.installBuiltinWrappers !== 'function') {
      throw new Error('当前 leap-vm 未导出 installBuiltinWrappers，builtin 日志不可用');
    }

    const result = executeSignatureTask(ctx.leapvm, {
      beforeRunScript: beforeTaskScript || '',
      targetScript,
      resourceName: path.basename(targetPath),
      siteProfile,
    });
    return { success: true, result };
  } catch (error) {
    return { success: false, error };
  } finally {
    if (ctx) {
      try { shutdownEnvironment(ctx.leapvm); } catch (_) {}
    }
  }
}

// ─── 在这里直接修改运行参数 ────────────────────────────────────────────────────
const RUN_CONFIG = {
  file: 'h5st.js',            // work/ 目录下的目标文件，null = 自动选择
  siteProfile: 'jd',          // site-profiles/ 中的配置名，null = 不使用
  debug: true,                // 是否开启 inspector/native hook
  waitForInspector: true,     // 是否等待 DevTools 连接后再执行
  domBackend: 'dod',          // DOM 后端
  entryFile: null,            // 额外入口文件，null = 不使用
  entryCode: '',              // 额外内联代码，'' = 不使用
  breakBeforeTask: true,      // 在任务脚本执行前先触发一次 VM 内 debugger
  allowDevtoolsEvalHookLogs: true, // 允许在 DevTools Console/eval 场景也输出 hook 日志
  debugCppWrapperRules: {     // 只在任务期输出 builtin 日志
    enabled: true,
    phase: 'task',
  },
};
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  if (RUN_CONFIG.file && !argv.includes('--file')) argv.push('--file', RUN_CONFIG.file);
  if (RUN_CONFIG.siteProfile && !argv.includes('--site-profile')) argv.push('--site-profile', RUN_CONFIG.siteProfile);
  if (RUN_CONFIG.debug && !argv.includes('--debug')) argv.push('--debug');
  if (RUN_CONFIG.waitForInspector && !argv.includes('--wait-inspector')) argv.push('--wait-inspector');

  const targetPath = resolveTargetFile();
  const targetCode = fs.readFileSync(targetPath, 'utf8');
  const entryFile = resolveEntryFile() || RUN_CONFIG.entryFile || null;
  const entryCode = entryFile
    ? fs.readFileSync(entryFile, 'utf8')
    : (getArg('--entry-code', '') || RUN_CONFIG.entryCode || '');

  const siteProfile = resolveSiteProfile();
  const targetScript = buildTargetScript(targetCode, entryCode);
  const breakBeforeTask = hasFlag('--no-break-before-task')
    ? false
    : (hasFlag('--break-before-task') ? true : !!RUN_CONFIG.breakBeforeTask);
  const beforeTaskScript = breakBeforeTask ? 'debugger;' : '';
  const domBackend = getArg('--dom-backend', RUN_CONFIG.domBackend || 'dod');
  const debug = hasFlag('--debug');
  const waitForInspector = hasFlag('--wait-inspector');
  const debugCppWrapperRules = resolveBuiltinRules();
  if (RUN_CONFIG.allowDevtoolsEvalHookLogs &&
      typeof process.env.LEAPVM_ALLOW_DEVTOOLS_EVAL_HOOK_LOGS === 'undefined') {
    process.env.LEAPVM_ALLOW_DEVTOOLS_EVAL_HOOK_LOGS = '1';
  }

  console.log('[run-work] target :', targetPath);
  console.log('[run-work] entry  :', entryFile ? entryFile : (entryCode ? '[inline --entry-code]' : '(none)'));
  console.log('[run-work] site   :', siteProfile ? siteProfile.source : '(none)');
  console.log('[run-work] dom    :', domBackend);
  console.log('[run-work] debug  :', debug);
  console.log('[run-work] break  :', breakBeforeTask ? 'before-task debugger' : 'off');
  console.log('[run-work] builtin:', JSON.stringify({
    enabled: !!debugCppWrapperRules.enabled,
    phase: debugCppWrapperRules.phase,
    operations: debugCppWrapperRules.operations,
    maxPerApi: debugCppWrapperRules.maxPerApi,
    targetCount: Array.isArray(debugCppWrapperRules.targets) ? debugCppWrapperRules.targets.length : 0,
  }));
  console.log('');

  const result = runOnce({
    targetPath,
    targetScript,
    debug,
    domBackend,
    waitForInspector,
    beforeTaskScript,
    debugCppWrapperRules,
    siteProfile: siteProfile ? siteProfile.value : undefined,
  });

  console.log('[run-work] success:', result.success);
  if (!result.success) {
    console.log('[run-work] error  :', (result.error && result.error.message) || String(result.error));
    process.exitCode = 1;
    return;
  }

  if (typeof result.result !== 'undefined') {
    console.log('[run-work] result :', result.result);
  }
}

try {
  main();
} catch (err) {
  console.error('[run-work] fatal:', err && err.message ? err.message : String(err));
  process.exitCode = 1;
}
