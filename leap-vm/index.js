'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveBinaryPath() {
  const candidates = [];

  if (process.env.LEAP_VM_BINARY_PATH) {
    candidates.push(path.resolve(process.env.LEAP_VM_BINARY_PATH));
  }

  candidates.push(path.join(__dirname, 'build', 'Release', 'leapvm.node'));
  candidates.push(path.join(__dirname, 'build', 'Debug', 'leapvm.node'));

  for (let i = 0; i < candidates.length; i += 1) {
    if (fs.existsSync(candidates[i])) {
      return candidates[i];
    }
  }

  const tried = candidates.join(', ');
  throw new Error(`Unable to locate leapvm.node. Tried: ${tried}`);
}

function parseInteger(raw, fallback) {
  if (raw == null || raw === '') {
    return fallback;
  }
  const text = String(raw).trim();
  const parsed = text.startsWith('0x') || text.startsWith('0X')
    ? Number.parseInt(text, 16)
    : Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isEnabled(raw) {
  const normalized = String(raw || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function shouldUseRtldNoDelete() {
  if (process.platform !== 'linux') {
    return false;
  }
  if (isEnabled(process.env.LEAPVM_DISABLE_RTLD_NODELETE)) {
    return false;
  }
  if (isEnabled(process.env.LEAPVM_FORCE_RTLD_NODELETE)) {
    return true;
  }
  try {
    const workerThreads = require('worker_threads');
    return !!workerThreads && workerThreads.isMainThread === false;
  } catch (_) {
    return false;
  }
}

function loadAddonWithRtldNoDelete(binaryPath) {
  const addonModule = { exports: {} };
  const dlopenConstants = (os.constants && os.constants.dlopen) || {};
  const baseFlags = dlopenConstants.RTLD_NOW || dlopenConstants.RTLD_LAZY || 2;
  const rtldNodeleteFlag = parseInteger(process.env.LEAPVM_RTLD_NODELETE_FLAG, 0x1000);
  const flags = baseFlags | rtldNodeleteFlag;
  process.dlopen(addonModule, binaryPath, flags);
  return addonModule.exports;
}

function loadNativeAddon(binaryPath) {
  if (shouldUseRtldNoDelete() && typeof process.dlopen === 'function') {
    try {
      return loadAddonWithRtldNoDelete(binaryPath);
    } catch (_) {
      // Fallback to Node's default .node loader when custom flags are unavailable.
    }
  }
  return require(binaryPath);
}

module.exports = loadNativeAddon(resolveBinaryPath());
