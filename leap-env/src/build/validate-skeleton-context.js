const fs = require('fs');
const path = require('path');

function collectJsFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(fullPath);
    }
  }
  return out;
}

function validateSkeletonContext(srcRoot = path.join(__dirname, '..')) {
  const skeletonRoot = path.join(srcRoot, 'skeleton');
  if (!fs.existsSync(skeletonRoot)) {
    console.warn(`[Validate] skeleton directory not found: ${skeletonRoot}`);
    return true;
  }

  const violations = [];
  const files = collectJsFiles(skeletonRoot);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('})(this);')) {
        violations.push(`${path.relative(srcRoot, file).replace(/\\/g, '/')}:${i + 1}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('[Validate] Found invalid skeleton context `})(this);` in:');
    violations.forEach((item) => console.error(`  - ${item}`));
    console.error('[Validate] Replace them with `})(globalThis);` before build.');
    return false;
  }

  console.log('[Validate] Skeleton context check passed.');
  return true;
}

if (require.main === module) {
  const ok = validateSkeletonContext(path.join(__dirname, '..'));
  if (!ok) {
    process.exit(1);
  }
}

module.exports = {
  validateSkeletonContext
};
