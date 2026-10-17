#!/usr/bin/env node
/**
 * Cross-platform Electron launcher that automatically appends
 * --no-sandbox and --disable-setuid-sandbox as CLI arguments on Linux
 * before Chromium's C++ setuid_sandbox_host check runs.
 */
const { spawnSync } = require('child_process');
const electronBin = require('electron');

const userArgs = process.argv.slice(2);
const cliArgs = process.platform === 'linux'
  ? ['--no-sandbox', '--disable-setuid-sandbox', ...userArgs]
  : userArgs;

const result = spawnSync(electronBin, cliArgs, {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error('Failed to launch Electron:', result.error);
  process.exit(1);
}

process.exit(result.status !== null ? result.status : 0);
