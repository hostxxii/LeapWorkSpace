'use strict';

const fs = require('fs');
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

module.exports = require(resolveBinaryPath());
