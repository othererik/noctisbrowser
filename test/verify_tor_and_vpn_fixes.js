const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const { app, BrowserWindow, session, ipcMain } = require('electron');
const torVpnManager = require('../src/main/torVpnManager');

const testDir = path.join(os.tmpdir(), 'noctis-test-fixes-' + Date.now());
fs.mkdirSync(testDir, { recursive: true });
app.setPath('userData', testDir);
app.setPath('sessionData', testDir);

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-setuid-sandbox');
}
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('incognito');
app.commandLine.appendSwitch('enable-features', 'DnsOverHttps');
app.commandLine.appendSwitch('dns-over-https-mode', 'automatic');
app.commandLine.appendSwitch('dns-over-https-templates', 'https://1.1.1.2/dns-query{?dns}');

setTimeout(() => {
  console.error('❌ TIMEOUT: verify_tor_and_vpn_fixes exceeded 30s');
  torVpnManager.shutdown();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
}, 30000);

console.log('=== Verifying NoctisBrowser: Built-in VPN Restoration, Tor Bundling & Auto-Download ===\n');

async function run() {
  const s = session.defaultSession;
  await torVpnManager.initialize(testDir, [s]);

  // 1. Verify Bundled Tor Binary Detection
  console.log('1. Checking bundled / installed Tor binary detection...');
  const torBin = torVpnManager.findTorBinary();
  console.log('   Tor binary located at:', torBin);
  assert(torBin && fs.existsSync(torBin), 'A valid Tor binary must be detected');
  console.log('   ✔ Bundled native Tor binary successfully discovered.');

  // 2. Verify Built-in Browser VPN Mode Navigation (Fixing Broken VPN Connections)
  console.log('2. Verifying Built-in Browser VPN navigation and tunnel routing...');
  const vpnStatus = await torVpnManager.updateConfig({ mode: 'built-in-vpn', selectedRelay: 'ch-zurich' });
  assert.strictEqual(vpnStatus.mode, 'built-in-vpn');
  assert.strictEqual(vpnStatus.vpnEnabled, true);
  assert(vpnStatus.tunnelPort > 0, 'VPN local tunnel port must be bound');

  // Verify external IP probe via VPN tunnel
  const vpnIp = await torVpnManager.probeExternalIp();
  console.log('   External IP probed via Built-in VPN tunnel:', vpnIp);
  assert(vpnIp, 'External IP should be resolved through the VPN tunnel');

  // Load a test page through Electron in built-in-vpn mode
  const testWin = new BrowserWindow({ show: false });
  const loadPromise = new Promise((resolve, reject) => {
    testWin.webContents.on('did-finish-load', () => resolve(testWin.webContents.getURL()));
    testWin.webContents.on('did-fail-load', (e, code, desc, url) => reject(new Error(`Failed to load ${url}: ${desc} (${code})`)));
  });

  console.log('   Navigating to https://example.com in built-in-vpn mode...');
  testWin.loadURL('https://example.com');
  const loadedUrl = await loadPromise;
  console.log('   Loaded URL successfully:', loadedUrl);
  assert(loadedUrl.includes('example.com'), 'example.com loaded successfully through Built-in VPN');
  console.log('   ✔ Built-in VPN mode navigation verified working flawlessly!');

  // 3. Verify Tor Mode and Native Daemon Bootstrapping
  console.log('3. Verifying Tor Onion Router mode and native daemon execution...');
  const torStartRes = await torVpnManager.startManagedTorDaemon();
  console.log('   Tor bootstrap result:', torStartRes.message || torStartRes.error);
  assert(torStartRes.socksPort === 9050 || torStartRes.socksPort === 9250, 'Tor daemon must be listening on SOCKS port');

  const torStatus = await torVpnManager.updateConfig({ mode: 'tor' });
  assert.strictEqual(torStatus.mode, 'tor');
  assert(torVpnManager.daemons.torSocksPort > 0, 'Tor SOCKS port must be active');

  // 4. Verify DownloadTorDaemon API interface
  console.log('4. Verifying Tor Auto-Download API...');
  assert.strictEqual(typeof torVpnManager.downloadAndInstallTorDaemon, 'function');
  console.log('   ✔ downloadAndInstallTorDaemon method is present and callable.');

  // 5. Verify UI Vault Components
  console.log('5. Verifying Vault UI Tor Daemon Box and Controls...');
  const vaultHtml = fs.readFileSync(path.join(__dirname, '../src/renderer/vault.html'), 'utf-8');
  assert(vaultHtml.includes('id="tor-daemon-box"'), 'vault.html contains tor-daemon-box');
  assert(vaultHtml.includes('id="btn-download-tor"'), 'vault.html contains btn-download-tor');
  assert(vaultHtml.includes('id="tor-download-progress-wrap"'), 'vault.html contains download progress indicator');
  console.log('   ✔ Vault UI Tor management controls verified.');

  torVpnManager.shutdown();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  console.log('\n🎉 ALL VPN RESTORATION AND TOR BUNDLING TESTS PASSED!');
  process.exit(0);
}

app.whenReady().then(run).catch((err) => {
  console.error('❌ Test failed with error:', err);
  torVpnManager.shutdown();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
