const assert = require('assert');
const fs = require('fs');
const path = require('path');
const privacyEngine = require('../src/main/privacyEngine');

console.log('--- Verifying NetScope Privacy Shield & Anti-Fingerprinting Engine ---');

// 1. Test Tracker Blocking (Deny-by-default)
console.log('1. Testing Deny-by-default Tracker Detection...');
assert.strictEqual(privacyEngine.isTracker('https://www.google-analytics.com/analytics.js').isTracker, true);
assert.strictEqual(privacyEngine.isTracker('https://connect.facebook.net/en_US/fbevents.js').isTracker, true);
assert.strictEqual(privacyEngine.isTracker('https://www.clarity.ms/tag/abc123').isTracker, true);
assert.strictEqual(privacyEngine.isTracker('https://api.fpjs.io/v3/fingerprint').isTracker, true);
assert.strictEqual(privacyEngine.isTracker('https://cdn.segment.io/analytics.js/v1/xyz').isTracker, true);
assert.strictEqual(privacyEngine.isTracker('https://example.com/api/telemetry/events').isTracker, true);
assert.strictEqual(privacyEngine.isTracker('https://stats.somevendor.com/collect?v=1').isTracker, true);
assert.strictEqual(privacyEngine.isTracker('https://news.ycombinator.com/news').isTracker, false);
assert.strictEqual(privacyEngine.isTracker('https://en.wikipedia.org/wiki/Main_Page').isTracker, false);
console.log('   ✅ All tracker checks passed!');

// 2. Test URL Parameter Stripping
console.log('2. Testing Tracking URL Parameter Stripping...');
const dirtyUrl = 'https://example.com/article?utm_source=twitter&utm_medium=social&fbclid=IwAR123&keep_this=true';
const cleanUrl = privacyEngine.sanitizeUrl(dirtyUrl);
assert.strictEqual(cleanUrl.includes('utm_source'), false);
assert.strictEqual(cleanUrl.includes('fbclid'), false);
assert.strictEqual(cleanUrl.includes('keep_this=true'), true);
console.log('   ✅ URL parameter sanitizer passed!');

// 3. Test HTTP Header Sanitization
console.log('3. Testing HTTP Header Sanitization & Electron Leak Prevention...');
const testHeaders = {
  'User-Agent': 'Mozilla/5.0 Electron/41.7.1 Chrome/146',
  'sec-ch-ua': '"Electron";v="41", "Chromium";v="146"',
  'X-Electron': 'true',
  'Accept': 'text/html'
};
const sanitized = privacyEngine.sanitizeHeaders(testHeaders);
assert.strictEqual(sanitized['User-Agent'].includes('Electron'), false, 'User-Agent must not leak Electron');
assert.strictEqual(sanitized['sec-ch-ua'].includes('Electron'), false, 'sec-ch-ua must not leak Electron');
assert.strictEqual(sanitized['X-Electron'], undefined, 'X-Electron header must be stripped');
assert.strictEqual(sanitized['DNT'], '1', 'DNT must be set to 1');
assert.strictEqual(sanitized['Sec-GPC'], '1', 'Sec-GPC must be set to 1');
console.log('   ✅ Header sanitization passed!');

// 4. Test Injected Privacy Shield Script
console.log('4. Verifying Injected Privacy Shield Preload Script...');
const shieldScriptPath = path.join(__dirname, '..', 'src', 'renderer', 'shield', 'privacyShield.js');
assert.strictEqual(fs.existsSync(shieldScriptPath), true, 'privacyShield.js must exist');
const shieldContent = fs.readFileSync(shieldScriptPath, 'utf8');
assert.strictEqual(/hardwareConcurrency["']?\s*:\s*\d+/.test(shieldContent), true, 'Must spoof hardware concurrency');
assert.strictEqual(/deviceMemory["']?\s*:\s*\d+/.test(shieldContent), true, 'Must spoof device memory');
assert.strictEqual(shieldContent.includes('UNMASKED_VENDOR_WEBGL'), true, 'Must mask WebGL vendor');
assert.strictEqual(shieldContent.includes('UNMASKED_RENDERER_WEBGL'), true, 'Must mask WebGL renderer');
assert.strictEqual(shieldContent.includes('CanvasRenderingContext2D'), true, 'Must neutralize Canvas fingerprinting');
assert.strictEqual(shieldContent.includes('AudioBuffer'), true, 'Must neutralize Audio fingerprinting');
console.log('   ✅ Privacy Shield script verified!');

console.log('✅ ALL PRIVACY & ANONYMITY TESTS PASSED!');
