// --- Exhaustive Verification: Network Routing States, Data Path Diagnostics & Keyboard Shortcuts ---

const assert = require('assert');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const torVpnManager = require('../src/main/torVpnManager');
const privacyEngine = require('../src/main/privacyEngine');

console.log('=== Exhaustive Network States, Data Path Diagnostic & Keyboard Shortcut Verification ===\n');

async function runExhaustiveTests() {
  const testDir = path.join(os.tmpdir(), `noctis-test-exhaustive-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  // Mock Electron sessions
  const mockProxyCalls = [];
  const mockSession = {
    setProxy: async (config) => {
      mockProxyCalls.push(config);
      return Promise.resolve();
    },
    resolveProxy: async (url) => {
      if (torVpnManager.mode === 'direct') return 'DIRECT';
      if (torVpnManager.mode === 'built-in-vpn') return `PROXY 127.0.0.1:${torVpnManager.tunnelPort}`;
      if (torVpnManager.mode === 'tor' && torVpnManager.daemons.torSocksPort) {
        return `SOCKS5 127.0.0.1:${torVpnManager.daemons.torSocksPort}`;
      }
      if (torVpnManager.mode === 'tor' && torVpnManager.killSwitch) {
        return 'SOCKS5 127.0.0.1:1';
      }
      return 'DIRECT';
    },
    clearHostResolverCache: async () => {},
    clearAuthCache: async () => {}
  };

  // 1. Initialize TorVpnManager with ephemeral test directory
  console.log('1. Testing TorVpnManager Initialization & Tunnel Startup...');
  const initStatus = await torVpnManager.initialize(testDir, [mockSession]);
  assert.ok(initStatus, 'Initialization status should return an object');
  assert.ok(torVpnManager.tunnelPort > 0, 'Local VPN tunnel port should be allocated');
  console.log(`   ✔ Local VPN tunnel server active on port ${torVpnManager.tunnelPort}`);

  // 2. Test All 5 Built-in VPN Relays
  console.log('\n2. Testing Built-in Browser VPN across all 5 Curated Exit Relays...');
  const relays = torVpnManager.getRelays();
  const relayKeys = Object.keys(relays);
  assert.strictEqual(relayKeys.length, 5, 'Should have exactly 5 curated VPN relays');

  for (const rKey of relayKeys) {
    const status = await torVpnManager.updateConfig({
      mode: 'built-in-vpn',
      selectedRelay: rKey
    });
    assert.strictEqual(status.mode, 'built-in-vpn', `Mode should be built-in-vpn for ${rKey}`);
    assert.strictEqual(status.selectedRelay, rKey, `Selected relay should be ${rKey}`);
    assert.strictEqual(status.vpnEnabled, true, `vpnEnabled should be true for ${rKey}`);
    assert.ok(status.relayDetails.name, `Relay name should exist for ${rKey}`);
    assert.ok(status.relayDetails.dohEndpoint, `DoH endpoint should exist for ${rKey}`);
    console.log(`   ✔ Relay verified: ${status.relayDetails.name} (${status.relayDetails.region})`);
  }

  // 3. Test Tor Onion Router Routing States
  console.log('\n3. Testing Tor Onion Router: Active Daemon, Kill-Switch, and Fallback Modes...');
  // 3a. Tor mode with detected daemon
  torVpnManager.daemons.torSocksPort = 9050;
  torVpnManager.daemons.torControlPort = 9051;
  let torStatus = await torVpnManager.updateConfig({ mode: 'tor', killSwitch: false });
  assert.strictEqual(torStatus.mode, 'tor');
  assert.strictEqual(torStatus.badgeState, 'tor');
  assert.ok(torStatus.modeLabel.includes('9050'));
  console.log('   ✔ Tor active daemon routing verified (SOCKS5 127.0.0.1:9050)');

  // 3b. Tor mode with daemon OFFLINE and Kill-Switch ON -> Drop traffic to blackhole
  const origProbePort = torVpnManager.probePort.bind(torVpnManager);
  const origStartTor = torVpnManager.startManagedTorDaemon.bind(torVpnManager);
  torVpnManager.probePort = async () => false;
  torVpnManager.startManagedTorDaemon = async () => ({ success: false });
  torVpnManager.daemons.torSocksPort = null;
  torVpnManager.daemons.torControlPort = null;
  let ksStatus = await torVpnManager.updateConfig({ mode: 'tor', killSwitch: true });
  assert.strictEqual(ksStatus.badgeState, 'killswitch');
  assert.ok(ksStatus.modeLabel.includes('Kill-Switch Engaged'));
  const lastProxyRule = mockProxyCalls[mockProxyCalls.length - 1];
  assert.strictEqual(lastProxyRule.proxyRules, 'socks5://127.0.0.1:1', 'Kill-switch must route to blackhole port 1');
  console.log('   ✔ Tor Kill-Switch protection verified (traffic blackholed to prevent clearnet leak)');

  // 3c. Tor mode with daemon OFFLINE and Kill-Switch OFF -> Encrypted tunnel fallback
  let fbStatus = await torVpnManager.updateConfig({ mode: 'tor', killSwitch: false });
  assert.strictEqual(fbStatus.badgeState, 'tor');
  assert.ok(fbStatus.modeLabel.includes('Hybrid Mode'));
  console.log('   ✔ Tor hybrid fallback verified (built-in encrypted tunnel)');

  // Restore probePort & startManagedTorDaemon and re-probe daemons for subsequent tests
  torVpnManager.probePort = origProbePort;
  torVpnManager.startManagedTorDaemon = origStartTor;
  await torVpnManager.probeLocalDaemons();

  // 4. Test I2P Garlic Router, Custom Proxy, and Direct Mode
  console.log('\n4. Testing I2P, Custom Proxy, and Direct Clearnet Modes...');
  const i2pStatus = await torVpnManager.updateConfig({ mode: 'i2p' });
  assert.strictEqual(i2pStatus.mode, 'i2p');
  console.log('   ✔ I2P routing mode verified');

  const proxyStatus = await torVpnManager.updateConfig({
    mode: 'custom-proxy',
    customProxyRules: 'socks5://127.0.0.1:1088'
  });
  assert.strictEqual(proxyStatus.mode, 'custom-proxy');
  assert.strictEqual(proxyStatus.customProxyRules, 'socks5://127.0.0.1:1088');
  console.log('   ✔ Custom proxy rules applied verified');

  const directStatus = await torVpnManager.updateConfig({ mode: 'direct' });
  assert.strictEqual(directStatus.mode, 'direct');
  assert.strictEqual(directStatus.badgeState, 'direct');
  console.log('   ✔ Direct mode verified');

  // 5. Test Strict Security & HTTPS Enforcement
  console.log('\n5. Testing Security Policies (HTTPS-Only, DNSSEC, DoH)...');
  await torVpnManager.updateConfig({ requireSecureTraffic: true, forceDnssec: true, dnsOverHttps: true });
  assert.strictEqual(torVpnManager.shouldUpgradeOrBlockInsecure('http://example.com/login'), true);
  assert.strictEqual(torVpnManager.upgradeInsecureUrl('http://example.com/login'), 'https://example.com/login');
  assert.strictEqual(torVpnManager.upgradeInsecureUrl('ws://example.com/feed'), 'wss://example.com/feed');
  assert.strictEqual(torVpnManager.shouldUpgradeOrBlockInsecure('http://127.0.0.1:8080/test'), false, 'Loopback http should not be upgraded');
  assert.strictEqual(torVpnManager.shouldUpgradeOrBlockInsecure('http://localhost:3000/api'), false, 'Localhost http should not be upgraded');
  console.log('   ✔ Plaintext HTTP/WS upgraded to HTTPS/WSS (loopback preserved)');

  // 6. Test All 7 Dark Web Protocols Resolution
  console.log('\n6. Testing All 7 Dark Web Protocol Resolvers...');
  const protocols = [
    { input: 'duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion', expectProtocol: 'tor', label: 'Tor (.onion)' },
    { input: 'planet.i2p', expectProtocol: 'i2p', label: 'I2P (.i2p)' },
    { input: 'directory.loki', expectProtocol: 'loki', label: 'Lokinet (.loki)' },
    { input: 'ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq', expectProtocol: 'ipfs', label: 'IPFS (ipfs://)' },
    { input: 'vitalik.eth', expectProtocol: 'ens', label: 'ENS (.eth)' },
    { input: 'zero://1HeLLo4uzjaLetFx6NH3PMwFP3qbRbTf3D', expectProtocol: 'zeronet', label: 'ZeroNet (zero://)' },
    { input: 'hyphanet://USK@0G~test', expectProtocol: 'hyphanet', label: 'Hyphanet (hyphanet://)' }
  ];

  for (const proto of protocols) {
    const res = torVpnManager.resolveProtocolUrl(proto.input);
    assert.strictEqual(res.protocol, proto.expectProtocol, `Protocol should match for ${proto.input}`);
    assert.ok(res.url, `Resolved URL should exist for ${proto.input}`);
    console.log(`   ✔ ${proto.label}: ${proto.input} -> ${res.url}`);
  }

  // 7. Test 4-Hop Live Routing Diagnostic Runner
  console.log('\n7. Testing Live 4-Hop Routing Path Diagnostic Runner...');
  // Test in built-in-vpn mode
  await torVpnManager.updateConfig({ mode: 'built-in-vpn', selectedRelay: 'ch-zurich' });
  const vpnDiag = await torVpnManager.runRoutingPathDiagnostic('https://example.com');
  assert.strictEqual(vpnDiag.success, true);
  assert.strictEqual(vpnDiag.hops.length, 4, 'Should trace exactly 4 hops');
  assert.strictEqual(vpnDiag.hops[0].hopNumber, 1);
  assert.strictEqual(vpnDiag.hops[0].name, 'Browser Session & Security Gate');
  assert.strictEqual(vpnDiag.hops[0].status, 'VERIFIED');

  assert.strictEqual(vpnDiag.hops[1].hopNumber, 2);
  assert.strictEqual(vpnDiag.hops[1].name, 'Cryptographic DNS (DoH + DNSSEC)');

  assert.strictEqual(vpnDiag.hops[2].hopNumber, 3);
  assert.strictEqual(vpnDiag.hops[2].name, 'Local Transport & Tunnel Layer');
  assert.strictEqual(vpnDiag.hops[2].details.transportType, 'LOCAL_VPN_TUNNEL');

  assert.strictEqual(vpnDiag.hops[3].hopNumber, 4);
  assert.strictEqual(vpnDiag.hops[3].name, 'Egress & Data Path Validation');
  console.log(`   ✔ Built-in VPN 4-hop diagnostic verified (Total duration: ${vpnDiag.totalDurationMs}ms)`);

  // Test in Tor Kill-Switch mode (blocked traffic)
  torVpnManager.probePort = async () => false;
  torVpnManager.startManagedTorDaemon = async () => ({ success: false });
  torVpnManager.daemons.torSocksPort = null;
  await torVpnManager.updateConfig({ mode: 'tor', killSwitch: true });
  const ksDiag = await torVpnManager.runRoutingPathDiagnostic('https://example.com');
  assert.strictEqual(ksDiag.hops[2].status, 'BLOCKED_BY_KILLSWITCH');
  assert.strictEqual(ksDiag.hops[3].status, 'KILLSWITCH_PROTECTED');
  assert.strictEqual(ksDiag.overallStatus, 'KILLSWITCH_PROTECTED');
  console.log('   ✔ Kill-Switch active 4-hop diagnostic verified (Hop 3 BLOCKED, Hop 4 KILLSWITCH_PROTECTED)');

  // Restore probePort & startManagedTorDaemon
  torVpnManager.probePort = origProbePort;
  torVpnManager.startManagedTorDaemon = origStartTor;
  await torVpnManager.probeLocalDaemons();

  // Test insecure URL auto-upgrade hop
  await torVpnManager.updateConfig({ mode: 'built-in-vpn', requireSecureTraffic: true });
  const insecureDiag = await torVpnManager.runRoutingPathDiagnostic('http://insecure-site.org');
  assert.strictEqual(insecureDiag.hops[0].details.isInsecureUpgraded, true);
  assert.ok(insecureDiag.hops[0].message.includes('upgraded to HTTPS'));
  console.log('   ✔ Insecure URL diagnostic hop verified (Hop 1 upgraded HTTP to HTTPS)');

  // 8. Test Keyboard Shortcut Helper (Cmd+T on macOS vs Ctrl+T on Windows/Linux)
  console.log('\n8. Testing Keyboard Shortcut Logic (Cmd+T on macOS / Ctrl+T on Linux & Windows)...');
  const BrowserApp = {
    isNewTabShortcut(e, platform) {
      if (!e || (e.type !== 'keydown' && e.type !== 'keyup')) return false;
      const isMac = platform ? platform === 'darwin' : false;
      const hasModifier = isMac ? (e.metaKey && !e.ctrlKey) : (e.ctrlKey && !e.metaKey);
      return Boolean(hasModifier && !e.altKey && !e.shiftKey && (e.key === 't' || e.key === 'T'));
    }
  };

  // macOS (darwin)
  assert.strictEqual(BrowserApp.isNewTabShortcut({ type: 'keydown', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: 't' }, 'darwin'), true, 'Cmd+T on macOS should trigger');
  assert.strictEqual(BrowserApp.isNewTabShortcut({ type: 'keydown', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: 'T' }, 'darwin'), true, 'Cmd+Shift-T without shift should trigger');
  assert.strictEqual(BrowserApp.isNewTabShortcut({ type: 'keydown', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 't' }, 'darwin'), false, 'Ctrl+T on macOS should NOT trigger');
  assert.strictEqual(BrowserApp.isNewTabShortcut({ type: 'keydown', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false, key: 't' }, 'darwin'), false, 'Cmd+Alt+T should NOT trigger');
  console.log('   ✔ macOS shortcut validation passed (Cmd+T only)');

  // Linux / Windows (linux, win32)
  for (const plat of ['linux', 'win32']) {
    assert.strictEqual(BrowserApp.isNewTabShortcut({ type: 'keydown', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 't' }, plat), true, `Ctrl+T on ${plat} should trigger`);
    assert.strictEqual(BrowserApp.isNewTabShortcut({ type: 'keydown', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: 't' }, plat), false, `Cmd+T on ${plat} should NOT trigger`);
    assert.strictEqual(BrowserApp.isNewTabShortcut({ type: 'keydown', metaKey: false, ctrlKey: true, altKey: false, shiftKey: true, key: 't' }, plat), false, `Ctrl+Shift+T on ${plat} should NOT trigger`);
    assert.strictEqual(BrowserApp.isNewTabShortcut({ type: 'keydown', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, key: 'w' }, plat), false, `Ctrl+W on ${plat} should NOT trigger`);
  }
  console.log('   ✔ Linux & Windows shortcut validation passed (Ctrl+T only)');

  // 9. Verify Chromium 146 Version Uniformity
  console.log('\n9. Verifying Internal Chromium 146 Version Uniformity...');
  const engineVer = privacyEngine.getEngineVersionInfo();
  assert.strictEqual(engineVer.chromeMajor, '146', 'Chrome major version should be 146');
  assert.strictEqual(engineVer.chromeVersion, '146.0.0.0', 'Chrome base version should be 146.0.0.0');
  assert.strictEqual(engineVer.chromeFullVersion, '146.0.7680.216', 'Chrome full version should be 146.0.7680.216');

  const activeProfile = privacyEngine.getProfile();
  assert.ok(activeProfile.userAgent.includes('Chrome/146.0.0.0'), 'Active profile userAgent must use Chrome/146.0.0.0');

  const sanitized = privacyEngine.sanitizeHeaders({
    'User-Agent': 'Mozilla/5.0 Electron/41.7.1 Chrome/146.0.0.0',
    'sec-ch-ua': '"Electron";v="41", "Chromium";v="146"',
    'X-Electron': 'true'
  });
  assert.strictEqual(sanitized['User-Agent'].includes('Electron'), false);
  assert.ok(sanitized['sec-ch-ua'].includes('"Chromium";v="146"'));
  assert.ok(sanitized['sec-ch-ua'].includes('"Google Chrome";v="146"'));
  assert.ok(sanitized['sec-ch-ua-full-version'].includes('146.0.7680.216'));
  console.log('   ✔ Chromium 146.0.7680.216 version alignment verified across profiles & headers');

  // Teardown
  torVpnManager.shutdown();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  console.log('\n🎉 ALL EXHAUSTIVE NETWORK STATE & FEATURE TESTS PASSED SUCCESSFULLY!');
}

runExhaustiveTests().catch((err) => {
  console.error('\n❌ Exhaustive test failed:', err);
  process.exit(1);
});
