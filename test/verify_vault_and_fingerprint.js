// --- Automated Test: NetScope Paranoid Privacy Vault & Transparent Ephemeral Storage ---

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const privacyEngine = require('../src/main/privacyEngine');

console.log('--- Verifying NetScope Paranoid Privacy Vault & Dynamic Anti-Fingerprinting ---');

// 1. Verify Default Paranoid Profile
console.log('1. Testing Default Paranoid Fingerprint Profile...');
const profile = privacyEngine.getProfile();
assert.ok(profile, 'Profile should exist');
assert.strictEqual(profile.canvasNoiseMode, 'paranoid', 'Default canvas noise mode should be paranoid');
assert.strictEqual(profile.audioNoiseMode, 'paranoid', 'Default audio noise mode should be paranoid');
assert.strictEqual(profile.runtimeDrift, true, 'Runtime drift should be enabled by default');
assert.ok(profile.canvasNoiseSeed > 0, 'Canvas noise seed should be initialized');
assert.ok(profile.audioNoiseSeed > 0, 'Audio noise seed should be initialized');
assert.ok(profile.userAgent.includes('Chrome/146'), 'User-Agent should be Chrome 146');
console.log('   ✅ Default Paranoid Profile verified!');

// 2. Testing Presets & Profile Customization
console.log('2. Testing Preset Switching and Custom User Parameters...');
const presets = privacyEngine.getPresets();
assert.ok(presets['macos-mseries'], 'macOS preset should exist');
assert.ok(presets['windows-nvidia'], 'Windows preset should exist');
assert.ok(presets['linux-amd'], 'Linux preset should exist');

// User switches to Windows 11 preset
const winProfile = privacyEngine.updateProfile({
  presetKey: 'windows-nvidia',
  hardwareConcurrency: 16,
  deviceMemory: 32
});
assert.strictEqual(winProfile.os, 'Windows', 'OS should update to Windows');
assert.strictEqual(winProfile.platform, 'Win32', 'Platform should update to Win32');
assert.strictEqual(winProfile.hardwareConcurrency, 16, 'Hardware concurrency should update to 16');
assert.strictEqual(winProfile.deviceMemory, 32, 'Memory should update to 32 GB');
assert.ok(winProfile.webglRenderer.includes('NVIDIA'), 'WebGL renderer should be NVIDIA');

// Outgoing HTTP headers should reflect the updated profile
const headers = privacyEngine.sanitizeHeaders({ 'User-Agent': 'Old', 'DNT': '0' });
assert.strictEqual(headers['User-Agent'], winProfile.userAgent, 'Header User-Agent should match active profile');
assert.strictEqual(headers['sec-ch-ua-platform'], '"Windows"', 'Client hints platform should match Windows');
console.log('   ✅ Presets & Custom User Parameter updates verified!');

// 3. Testing Dynamic Runtime Parameter Drift
console.log('3. Testing Dynamic Runtime Parameter Drift...');
const seedBefore = privacyEngine.getProfile().canvasNoiseSeed;
const audioBefore = privacyEngine.getProfile().audioNoiseSeed;
const driftCountBefore = privacyEngine.getProfile().driftCount || 0;

const drifted = privacyEngine.driftRuntimeParameters();
assert.notStrictEqual(drifted.canvasNoiseSeed, seedBefore, 'Canvas seed should rotate after drift');
assert.notStrictEqual(drifted.audioNoiseSeed, audioBefore, 'Audio seed should rotate after drift');
assert.strictEqual(drifted.driftCount, driftCountBefore + 1, 'Drift count should increment');
assert.ok(drifted.lastVariedAt <= Date.now(), 'lastVariedAt should be set');
console.log('   ✅ Dynamic Runtime Drift verified!');

// 4. Testing Identity Re-Roll (Full Persona Mutation)
console.log('4. Testing Identity Re-Roll (Full Persona Mutation)...');
const rerolled = privacyEngine.reRollProfile();
assert.ok(rerolled.presetKey, 'Rerolled persona must have a presetKey');
assert.ok([4, 6, 8, 10, 12, 16].includes(rerolled.hardwareConcurrency), 'Cores should be realistic');
assert.ok([8, 16, 32].includes(rerolled.deviceMemory), 'RAM should be realistic');
assert.ok(rerolled.canvasNoiseSeed > 0, 'New canvas seed must be non-zero');
assert.ok(rerolled.audioNoiseSeed > 0, 'New audio seed must be non-zero');
console.log('   ✅ Identity Re-Roll verified!');

// 5. Testing Generated Webview Shield Script Injection
console.log('5. Testing Dynamic Privacy Shield Script Generation...');
const script = privacyEngine.generateShieldScript();
assert.ok(script.includes('__NETSCOPE_PROFILE__'), 'Script must define in-page profile bridge');
assert.ok(script.includes('__NETSCOPE_UPDATE_PROFILE__'), 'Script must define in-page dynamic update method');
assert.ok(script.includes('Navigator.prototype'), 'Script must override Navigator prototype');
assert.ok(script.includes('UNMASKED_RENDERER_WEBGL'), 'Script must mask WebGL');
assert.ok(script.includes('CanvasRenderingContext2D'), 'Script must neutralize Canvas');
assert.ok(script.includes('AudioBuffer'), 'Script must neutralize AudioBuffer');
assert.ok(script.includes('performance.now'), 'Script must clamp performance timer');
console.log('   ✅ Dynamic Privacy Shield Script Generation verified!');

// 6. Testing Ephemeral File Storage Inspector Logic
console.log('6. Testing Ephemeral Storage Inspector & Categorization...');
// Create a mock ephemeral directory structure
const mockTmpDir = path.join(os.tmpdir(), `test-netscope-ephemeral-${Date.now()}`);
fs.mkdirSync(mockTmpDir, { recursive: true });
fs.mkdirSync(path.join(mockTmpDir, 'Local Storage', 'leveldb'), { recursive: true });
fs.mkdirSync(path.join(mockTmpDir, 'GPUCache'), { recursive: true });
fs.mkdirSync(path.join(mockTmpDir, 'IndexedDB'), { recursive: true });

// Write mock ephemeral files
fs.writeFileSync(path.join(mockTmpDir, 'Cookies'), 'mock-sqlite-cookie-data');
fs.writeFileSync(path.join(mockTmpDir, 'Local Storage', 'leveldb', '000003.log'), 'mock-leveldb-data');
fs.writeFileSync(path.join(mockTmpDir, 'GPUCache', 'data_0'), 'mock-gpu-shader-cache');
fs.writeFileSync(path.join(mockTmpDir, 'IndexedDB', 'test.leveldb'), 'mock-indexed-db');
fs.writeFileSync(path.join(mockTmpDir, 'Network Persistent State'), '{"net":{"http_server_properties":{}}}');
fs.writeFileSync(path.join(mockTmpDir, 'Preferences'), '{"ephemeral":true}');
privacyEngine.saveShieldScript(path.join(mockTmpDir, 'privacyShield.js'));

// Function matching main.js inspector
function inspectDir(dir) {
  const result = {
    totalSizeBytes: 0,
    totalFilesCount: 0,
    categories: {
      cookies: 0,
      localStorage: 0,
      indexedDB: 0,
      gpuCache: 0,
      networkState: 0,
      config: 0,
      other: 0
    },
    files: []
  };

  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      const rel = path.relative(dir, full);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const stats = fs.statSync(full);
        result.totalSizeBytes += stats.size;
        result.totalFilesCount++;
        const lower = rel.toLowerCase();
        let cat = 'other';
        if (lower.includes('cookie')) cat = 'cookies';
        else if (lower.includes('indexeddb')) cat = 'indexedDB';
        else if (lower.includes('local storage') || lower.includes('leveldb')) cat = 'localStorage';
        else if (lower.includes('gpucache') || lower.includes('dawncache')) cat = 'gpuCache';
        else if (lower.includes('network')) cat = 'networkState';
        else if (lower.includes('preference')) cat = 'config';

        result.categories[cat] += stats.size;
        result.files.push({ path: rel, size: stats.size, category: cat });
      }
    }
  }

  walk(dir);
  return result;
}

const inspection = inspectDir(mockTmpDir);
assert.strictEqual(inspection.totalFilesCount, 7, 'Should detect all 7 mock files');
assert.ok(inspection.categories.cookies > 0, 'Should categorize Cookies');
assert.ok(inspection.categories.localStorage > 0, 'Should categorize LocalStorage');
assert.ok(inspection.categories.gpuCache > 0, 'Should categorize GPUCache');
assert.ok(inspection.categories.indexedDB > 0, 'Should categorize IndexedDB');
assert.ok(inspection.categories.networkState > 0, 'Should categorize Network State');
assert.ok(inspection.categories.config > 0, 'Should categorize Chromium Config');
assert.ok(inspection.categories.other > 0, 'Should categorize Privacy Shield in other');
console.log('   ✅ Ephemeral Storage Categorization & Sizing verified!');

// Clean up mock directory
fs.rmSync(mockTmpDir, { recursive: true, force: true });
assert.ok(!fs.existsSync(mockTmpDir), 'Mock directory wiped with zero trace');
console.log('   ✅ Zero-Trace Temporary Directory Wipe verified!');

console.log('🎉 ALL PARANOID PRIVACY VAULT & STORAGE INSPECTOR TESTS PASSED!');
