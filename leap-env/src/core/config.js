// src/core/20-config.js (20_config)
// 配置选项管理

(function (global) {
  const leapenv = global.leapenv || (global.leapenv = {});

  function readRuntimeConfig() {
    if (typeof leapenv.getRuntimeConfig === 'function') {
      try {
        const config = leapenv.getRuntimeConfig();
        if (config && typeof config === 'object') {
          return config;
        }
      } catch (_) {}
    }
    if (leapenv.__runtime && typeof leapenv.__runtime === 'object' &&
        leapenv.__runtime.config && typeof leapenv.__runtime.config === 'object') {
      return leapenv.__runtime.config;
    }
    leapenv.config = leapenv.config && typeof leapenv.config === 'object' ? leapenv.config : {};
    return leapenv.config;
  }

  // 兜底：确保 config 存在（即便 runtime.js 未先运行）
  const runtimeConfig = readRuntimeConfig();
  leapenv.config = runtimeConfig;

  function normalizeHardeningMode(raw) {
    const normalized = String(raw == null ? '' : raw).trim().toLowerCase();
    return normalized === 'strict' ? 'strict' : 'compat';
  }

  // dispatch 缺失实现时的行为
  // 'warn': 打印警告 (默认)
  // 'silent': 静默返回 undefined
  // 'throw': 抛出 TypeError
  runtimeConfig.dispatchMissingMode = 'warn';

  // validateDispatchRoutes 是否打印每条缺失路由的详细警告
  // false (默认): 只在最后汇总显示 N 条问题，不逐条 warn
  // true: 逐条打印，适合调试
  runtimeConfig.validateWarn = false;

  // 环境版本（默认读取环境变量，否则使用包版本占位）
  if (!leapenv.envVersion) {
    const fromEnv = (typeof process !== 'undefined' && process.env && process.env.LEAP_ENV_VERSION) || null;
    leapenv.envVersion = fromEnv || '1.0.0';
  }

  // DOM backend 开关：唯一有效值 dod（遗留值 spec 兼容映射到 dod，js/native 已废弃）
  const backendFromRuntime = typeof runtimeConfig.domBackend === 'string'
    ? runtimeConfig.domBackend
    : '';
  const backendFromEnv = (typeof process !== 'undefined' && process.env && process.env.LEAP_DOM_BACKEND) || '';
  const normalizedBackend = String(backendFromRuntime || backendFromEnv || 'dod').trim().toLowerCase();
  if (normalizedBackend !== 'dod' && normalizedBackend !== 'spec' && normalizedBackend !== '') {
    console.warn('[Leap] Unknown domBackend "' + normalizedBackend + '", falling back to "dod".');
  }
  runtimeConfig.domBackend = 'dod';

  // 签名容器 profile：fp-lean | fp-occupy
  // 优先级：runtime store > 环境变量 > 默认值
  const signatureProfileFromRuntime = typeof runtimeConfig.signatureProfile === 'string'
    ? runtimeConfig.signatureProfile
    : '';
  const signatureProfileFromEnv =
    (typeof process !== 'undefined' && process.env && process.env.LEAP_SIGNATURE_PROFILE) || '';
  const normalizedSignatureProfile = String(
    signatureProfileFromRuntime || signatureProfileFromEnv || 'fp-lean'
  ).trim().toLowerCase();
  if (normalizedSignatureProfile === 'fp-occupy') {
    runtimeConfig.signatureProfile = 'fp-occupy';
  } else {
    runtimeConfig.signatureProfile = 'fp-lean';
  }

  // 全局收敛策略（风险优先）：
  // compat: 兼容优先，保留旧桥接名（不可枚举）且不冻结替换 globalThis.leapenv
  // strict: 彻底去名 + 严格 facade 锁定
  runtimeConfig.bridgeExposureMode = normalizeHardeningMode(
    runtimeConfig.bridgeExposureMode || 'strict'
  );
  runtimeConfig.globalFacadeMode = normalizeHardeningMode(
    runtimeConfig.globalFacadeMode || 'strict'
  );

})(globalThis);
