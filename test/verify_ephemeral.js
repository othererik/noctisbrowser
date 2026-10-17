const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

console.log('--- Verifying Zero-Trace Ephemeral Storage & Exit Cleanup ---');

const tmpBase = os.tmpdir();
const projectRoot = path.join(__dirname, '..');
const electronBin = require('electron');

// Check initial count of noctis ephemeral directories
const getNetscopeDirs = () => {
  return fs.readdirSync(tmpBase).filter(f => f.startsWith('noctis-ephemeral-') || f.startsWith('netscope-ephemeral-'));
};

console.log('1. Checking initial state in temp dir...');
const initialDirs = getNetscopeDirs();
console.log(`   Found ${initialDirs.length} pre-existing ephemeral directories.`);

console.log('2. Spawning NoctisBrowser process (headless)...');
const spawnArgs = ['.'];
if (process.platform === 'linux') {
  spawnArgs.push('--no-sandbox', '--disable-setuid-sandbox');
}
const nodeDir = path.dirname(process.execPath);
const child = spawn(electronBin, spawnArgs, {
  cwd: projectRoot,
  env: {
    ...process.env,
    NOCTIS_HEADLESS: '1',
    PATH: process.env.PATH ? `${nodeDir}${path.delimiter}${process.env.PATH}` : nodeDir
  }
});

let spawnedEphemeralDir = null;

// Wait 4 seconds for app to initialize its ephemeral directory
setTimeout(() => {
  const currentDirs = getNetscopeDirs();
  console.log(`   Found ${currentDirs.length} ephemeral directories while running.`);
  assert(currentDirs.length >= 1, 'Expected at least 1 ephemeral directory while browser is active');

  // Identify newly created directory
  const newDirs = currentDirs.filter(d => !initialDirs.includes(d));
  spawnedEphemeralDir = newDirs.length > 0 ? newDirs[0] : currentDirs[0];
  const fullPath = path.join(tmpBase, spawnedEphemeralDir);
  console.log(`   Active ephemeral path: ${fullPath}`);
  assert(fs.existsSync(fullPath), 'Ephemeral directory should exist during runtime');

  console.log('3. Terminating browser process (SIGTERM) to trigger exit cleanup...');
  try {
    if (child.stdin && !child.stdin.destroyed) {
      child.stdin.write('QUIT\n');
    }
  } catch (_) {}
  setTimeout(() => {
    try { child.kill('SIGTERM'); } catch (_) {}
  }, 300);

  // Wait 2.5 seconds for cleanup to finish
  setTimeout(() => {
    console.log('4. Verifying disk cleanup...');
    const existsAfterKill = fs.existsSync(fullPath);
    console.log(`   Directory exists after termination: ${existsAfterKill}`);
    assert.strictEqual(existsAfterKill, false, 'Ephemeral directory MUST be unconditionally deleted on exit!');

    console.log('✅ PASS: Zero-trace ephemeral cleanup verified! No temp files or history persisted.');
    process.exit(0);
  }, 2500);

}, 4000);
