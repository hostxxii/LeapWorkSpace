const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };

function normalize(level) {
  return (level || '').toLowerCase();
}

function hostLog(level, msg, ...args) {
  const configured = normalize(process.env.LEAPVM_HOST_LOG_LEVEL || 'info');
  const current = LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
  const target = LEVEL_ORDER[normalize(level)] ?? LEVEL_ORDER.info;
  if (target < current) return;

  const prefix = `[Host][${normalize(level) || 'info'}]`;
  if (args.length > 0) {
    console.log(prefix, msg, ...args);
  } else {
    console.log(prefix, msg);
  }
}

module.exports = { hostLog };

