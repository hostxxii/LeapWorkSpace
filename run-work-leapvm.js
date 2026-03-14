'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const {
  initializeEnvironment,
  executeSignatureTask,
  shutdownEnvironment,
} = require('./leap-env/runner');

const ROOT_DIR = __dirname;
const WORK_DIR = path.join(ROOT_DIR, 'work');

// ─── 在这里直接修改运行参数 ──────────────────────────────────────────
const RUN_CONFIG = {
  file: 'h5st.js',            // work/ 下的目标文件，null = 自动选择第一个 .js
  siteProfile: 'jd',          // site-profiles/ 中的配置名（不带 .json），null = 不使用
  entryFile: null,             // 额外入口文件路径（拼接在 target 后面），null = 不使用
  entryCode: '',               // 额外内联代码，'' = 不使用

  // ── 调试 ──
  debug: true,                 // 启用 V8 Inspector
  inspectorPort: 9229,         // Inspector 监听端口
  breakBeforeTask: false,      // true = 任务前自动插入 debugger;
  allowDevtoolsEvalHookLogs: true,
  allowPausedHookLogs: true,
  inspectorReadyWaitMs: 1500,  // DevTools 建连后等待 Debugger.enable 的上限

  // ── 服务 ──
  serverPort: null,            // null = 自动找空闲端口（从 9800 开始）
  parentWatchdog: true,        // 父 shell 死亡后自动退出
  parentWatchdogIntervalMs: 500,
  workers: 1,                  // 调试建议 1；生产按需调大
  maxTasksPerWorker: 200,
};
// ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function hasFlag(flag) {
  return argv.includes(flag);
}

function getArg(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

function canListenOnPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function resolveServerPort() {
  const raw = getArg('--server-port', RUN_CONFIG.serverPort);
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    const explicit = Number(raw);
    if (!Number.isInteger(explicit) || explicit <= 0) {
      throw new Error('--server-port 必须是正整数');
    }
    return explicit;
  }

  const basePort = 9800;
  const maxAttempts = 50;
  for (let offset = 0; offset < maxAttempts; offset++) {
    const candidate = basePort + offset;
    if (await canListenOnPort(candidate)) {
      return candidate;
    }
  }
  throw new Error(`未找到可用 IPC 端口（尝试范围 ${basePort}-${basePort + maxAttempts - 1}）`);
}

async function ensureInspectorPortAvailable(port) {
  if (!(await canListenOnPort(port, '0.0.0.0'))) {
    throw new Error(
      `Inspector 端口 ${port} 已被占用。请先停止旧的调试会话，或使用 --inspector-port 指定新端口。`
    );
  }
}

function resolveTargetFile() {
  const fileArg = getArg('--file', RUN_CONFIG.file);
  if (!fs.existsSync(WORK_DIR)) throw new Error('work/ 目录不存在: ' + WORK_DIR);

  if (fileArg) {
    const p = path.isAbsolute(fileArg) ? fileArg : path.join(WORK_DIR, fileArg);
    if (!fs.existsSync(p)) throw new Error('目标文件不存在: ' + p);
    return p;
  }

  const files = fs.readdirSync(WORK_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(WORK_DIR, f));

  if (files.length === 0) throw new Error('work/ 中没有 .js 文件');
  if (files.length > 1) {
    console.log('[run-work] 多个 .js 文件，使用第一个（可用 --file 指定）:');
    for (const f of files) console.log('  -', path.basename(f));
  }
  return files[0];
}

function resolveEntryCode() {
  const entryFileArg = getArg('--entry-file', RUN_CONFIG.entryFile);
  if (entryFileArg) {
    const candidates = path.isAbsolute(entryFileArg)
      ? [entryFileArg]
      : [
          path.resolve(process.cwd(), entryFileArg),
          path.join(ROOT_DIR, entryFileArg),
          path.join(WORK_DIR, entryFileArg),
        ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }
    throw new Error('--entry-file 不存在: ' + entryFileArg);
  }
  return getArg('--entry-code', RUN_CONFIG.entryCode) || '';
}

function resolveSiteProfile() {
  const name = getArg('--site-profile', RUN_CONFIG.siteProfile);
  if (!name) return null;

  const profileDirs = [
    path.join(ROOT_DIR, 'site-profiles'),
    path.join(WORK_DIR, 'site-profiles'),
  ];

  const candidates = path.isAbsolute(name)
    ? [name]
    : [
        path.resolve(process.cwd(), name),
        path.join(ROOT_DIR, name),
        ...profileDirs.flatMap((dir) => [
          path.join(dir, name),
          path.join(dir, name.endsWith('.json') ? name : name + '.json'),
        ]),
      ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return { source: p, value: JSON.parse(fs.readFileSync(p, 'utf8')) };
    }
  }

  throw new Error('site-profile 不存在: ' + name);
}

async function main() {
  const debug = hasFlag('--no-debug') ? false : (hasFlag('--debug') || !!RUN_CONFIG.debug);
  const breakBeforeTask = hasFlag('--no-break') ? false : (hasFlag('--break') || !!RUN_CONFIG.breakBeforeTask);
  const inspectorPort = Number(getArg('--inspector-port', RUN_CONFIG.inspectorPort)) || 9229;
  const serverPort = await resolveServerPort();
  const parentWatchdogEnabled = hasFlag('--no-parent-watchdog')
    ? false
    : !!RUN_CONFIG.parentWatchdog;
  const parentWatchdogIntervalMs =
    Number(getArg('--parent-watchdog-interval-ms', RUN_CONFIG.parentWatchdogIntervalMs)) || 500;
  const workers = Number(getArg('--workers', RUN_CONFIG.workers)) || 1;

  if (RUN_CONFIG.allowDevtoolsEvalHookLogs &&
      typeof process.env.LEAPVM_ALLOW_DEVTOOLS_EVAL_HOOK_LOGS === 'undefined') {
    process.env.LEAPVM_ALLOW_DEVTOOLS_EVAL_HOOK_LOGS = '1';
  }
  if (RUN_CONFIG.allowPausedHookLogs &&
      typeof process.env.LEAPVM_ALLOW_PAUSED_HOOK_LOGS === 'undefined') {
    process.env.LEAPVM_ALLOW_PAUSED_HOOK_LOGS = '1';
  }
  if (debug &&
      typeof process.env.LEAPVM_INSPECTOR_READY_WAIT_MS === 'undefined') {
    process.env.LEAPVM_INSPECTOR_READY_WAIT_MS =
      String(Number(getArg('--inspector-ready-wait-ms', RUN_CONFIG.inspectorReadyWaitMs)) || 1500);
  }
  if (debug) {
    await ensureInspectorPortAvailable(inspectorPort);
  }

  const targetPath = resolveTargetFile();
  const targetCode = fs.readFileSync(targetPath, 'utf8');
  const entryCode = resolveEntryCode();
  const siteProfile = resolveSiteProfile();

  const targetScript = entryCode.trim()
    ? targetCode + '\n\n' + entryCode + '\n'
    : targetCode + '\n';

  console.log('[run-work] target :', path.basename(targetPath));
  console.log('[run-work] site   :', siteProfile ? siteProfile.source : '(none)');
  console.log('[run-work] debug  :', debug);
  console.log('[run-work] break  :', breakBeforeTask ? 'debugger' : 'off');
  console.log('[run-work] workers:', workers);
  console.log('[run-work] server port:', serverPort);
  if (parentWatchdogEnabled) {
    console.log('[run-work] parent watchdog:', `on (${parentWatchdogIntervalMs}ms)`);
  } else {
    console.log('[run-work] parent watchdog:', 'off');
  }
  if (debug) {
    console.log('[run-work] inspector port:', inspectorPort);
    console.log('[run-work] inspector ready wait ms:', process.env.LEAPVM_INSPECTOR_READY_WAIT_MS || '(default)');
    console.log('');
    console.log('[run-work] 服务器启动后会等待 DevTools 连接才继续加载 bundle');
    console.log('[run-work] 请在 chrome://inspect 看到 LeapVM 目标后点击 inspect');
  }
  console.log('');

  let ctx = null;
  let shuttingDown = false;
  let parentWatchdog = null;
  const initialParentPid = process.ppid;

  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (parentWatchdog) {
      clearInterval(parentWatchdog);
      parentWatchdog = null;
    }
    if (ctx) {
      try { await shutdownEnvironment(ctx.leapvm); } catch (_) {}
      ctx = null;
    }
  };

  const terminateRun = async (code, message) => {
    if (message) {
      console.log(message);
    }
    await cleanup();
    process.exit(code);
  };

  // 同步 fallback: 进程退出时确保 leapvm_server 被杀死
  process.on('exit', () => {
    if (ctx && ctx.leapvm && ctx.leapvm._serverManager) {
      const pid = ctx.leapvm._serverManager.pid;
      if (pid) {
        try { process.kill(pid, 'SIGKILL'); } catch (_) {}
      }
    }
  });

  process.on('SIGINT', async () => {
    await terminateRun(130, '\n[run-work] SIGINT received, shutting down...');
  });
  process.on('SIGTERM', async () => {
    await terminateRun(143, '[run-work] SIGTERM received, shutting down...');
  });

  if (parentWatchdogEnabled) {
    parentWatchdog = setInterval(() => {
      if (shuttingDown) return;
      const currentParentPid = process.ppid;
      if (currentParentPid !== initialParentPid) {
        void terminateRun(
          0,
          `[run-work] parent watchdog: parent changed ${initialParentPid} -> ${currentParentPid}, shutting down...`
        );
        return;
      }
      try {
        process.kill(initialParentPid, 0);
      } catch (_) {
        void terminateRun(
          0,
          `[run-work] parent watchdog: parent pid ${initialParentPid} exited, shutting down...`
        );
      }
    }, parentWatchdogIntervalMs);
    if (typeof parentWatchdog.unref === 'function') {
      parentWatchdog.unref();
    }
  }

  try {
    ctx = await initializeEnvironment({
      debug,
      enableInspector: debug,
      targetScript,
      standalone: {
        port: serverPort,
        workers,
        inspectorPort,
        maxTasksPerWorker: RUN_CONFIG.maxTasksPerWorker || 200,
        startupTimeoutMs: debug ? 120000 : 30000,
        requestTimeoutMs: debug ? 0 : 30000, // debug 模式禁用超时，避免调试中途断联
      },
    });

    const result = await executeSignatureTask(ctx.leapvm, {
      beforeRunScript: breakBeforeTask ? 'debugger;' : '',
      resourceName: path.basename(targetPath),
      siteProfile: siteProfile ? siteProfile.value : undefined,
    });

    console.log('[run-work] success: true');
    if (typeof result !== 'undefined') {
      console.log('[run-work] result :', result);
    }
  } catch (error) {
    console.error('[run-work] success: false');
    console.error('[run-work] error  :', (error && error.message) || String(error));
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error('[run-work] fatal:', err && err.message ? err.message : String(err));
  process.exitCode = 1;
});
