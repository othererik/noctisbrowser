const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const privacyEngine = require('../src/main/privacyEngine');
const torVpnManager = require('../src/main/torVpnManager');
const TabManager = require('../src/main/tabManager');
const NetworkManager = require('../src/main/networkManager');

const os = require('os');
const testEphemeralDir = path.join(os.tmpdir(), `noctis-test-features-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
fs.mkdirSync(testEphemeralDir, { recursive: true });
app.setPath('userData', testEphemeralDir);
app.setPath('sessionData', testEphemeralDir);
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-setuid-sandbox');
}
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('incognito');

// Hard safety timeout so the test process always terminates on its own
setTimeout(() => {
  console.error('❌ TIMEOUT: verify_noctis_tor_vpn_and_features exceeded 25s');
  try { fs.rmSync(testEphemeralDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
}, 25000);

console.log('=== Verifying NoctisBrowser: Branding, Tor/DarkWeb Protocols, Browser VPN & Stealth Defenses ===\n');

async function runTests() {
  // 1. Verify Custom Icons & Branding Assets
  console.log('1. Verifying NoctisBrowser custom icons and branding assets...');
  const assetsDir = path.join(__dirname, '../assets');
  const svgPath = path.join(assetsDir, 'icon.svg');
  const pngPath = path.join(assetsDir, 'icon.png');
  const icnsPath = path.join(assetsDir, 'icon.icns');

  assert(fs.existsSync(svgPath), 'assets/icon.svg must exist');
  assert(fs.existsSync(pngPath), 'assets/icon.png must exist');
  assert(fs.existsSync(icnsPath), 'assets/icon.icns must exist');
  assert(fs.statSync(pngPath).size > 50000, 'assets/icon.png should be a high-res PNG');
  assert(fs.statSync(icnsPath).size > 100000, 'assets/icon.icns should be a valid macOS icon bundle');
  console.log('   ✔ Custom SVG, PNG, and macOS ICNS icons verified.');

  // 2. Verify Dark Web & Decentralized Protocol URL Resolution
  console.log('2. Verifying Tor (.onion), I2P (.i2p), Lokinet (.loki), IPFS (ipfs://), ENS (.eth), ZeroNet & Hyphanet...');

  const onionRes = torVpnManager.resolveProtocolUrl('http://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion/search');
  assert.strictEqual(onionRes.protocol, 'tor');
  assert.strictEqual(onionRes.routed, true);
  assert(onionRes.url.includes('duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion'), 'Onion hostname preserved');

  const ipfsRes = torVpnManager.resolveProtocolUrl('ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/wiki/Test.html');
  assert.strictEqual(ipfsRes.protocol, 'ipfs');
  assert.strictEqual(ipfsRes.routed, true);
  assert(ipfsRes.url.includes('/ipfs/bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/wiki/Test.html'));

  const ipnsRes = torVpnManager.resolveProtocolUrl('ipns://docs.ipfs.tech/concepts/');
  assert.strictEqual(ipnsRes.protocol, 'ipns');
  assert(ipnsRes.url.includes('/ipns/docs.ipfs.tech/concepts/'));

  const i2pRes = torVpnManager.resolveProtocolUrl('http://planet.i2p/index.html');
  assert.strictEqual(i2pRes.protocol, 'i2p');
  assert.strictEqual(i2pRes.routed, true);

  const lokiRes = torVpnManager.resolveProtocolUrl('http://directory.loki');
  assert.strictEqual(lokiRes.protocol, 'loki');
  assert.strictEqual(lokiRes.routed, true);

  const ethRes = torVpnManager.resolveProtocolUrl('https://vitalik.eth/general/');
  assert.strictEqual(ethRes.protocol, 'ens');
  assert.strictEqual(ethRes.url, 'https://vitalik.eth.limo/general/');

  const zeroRes = torVpnManager.resolveProtocolUrl('zero://1HeLLo4uzjaLetFx6NH3PMwFP3qbRbTf3D');
  assert.strictEqual(zeroRes.protocol, 'zeronet');
  assert(zeroRes.url.startsWith('http://127.0.0.1:43110/1HeLLo4uzjaLetFx6NH3PMwFP3qbRbTf3D'));

  const hyphaRes = torVpnManager.resolveProtocolUrl('hyphanet://USK@testkey/site/1/');
  assert.strictEqual(hyphaRes.protocol, 'hyphanet');
  assert(hyphaRes.url.startsWith('http://127.0.0.1:8888/freenet:USK@testkey/site/1/'));
  console.log('   ✔ All 7 Dark Web & Decentralized protocols resolved accurately.');

  // 3. Verify Built-in Browser VPN Local Encrypted Tunnel & Circuit Rotation
  console.log('3. Verifying Built-in Browser VPN tunnel, PAC generation, Kill-Switch, and Circuit Rotation...');
  const sessions = [session.defaultSession, session.fromPartition('in-memory-ephemeral')];
  const initStatus = await torVpnManager.initialize(testEphemeralDir, sessions);
  assert(initStatus.tunnelPort > 0, 'Local encrypted VPN tunnel port should be bound');

  // Spin up a local echo target server to test routing through the Noctis VPN tunnel
  const echoServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      proxiedHost: req.headers.host,
      forwarded: req.headers['x-forwarded-for'] || null
    }));
  });
  await new Promise(r => echoServer.listen(0, '127.0.0.1', r));
  echoServer.unref();
  const echoPort = echoServer.address().port;

  // Send a request through the local Noctis Browser VPN tunnel
  const proxyResponse = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: initStatus.tunnelPort,
      path: `http://127.0.0.1:${echoPort}/vpn-check`,
      method: 'GET',
      headers: {
        'Host': `127.0.0.1:${echoPort}`,
        'X-Forwarded-For': '192.168.1.99'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });

  assert.strictEqual(proxyResponse.ok, true, 'Request through Noctis Browser VPN tunnel succeeded');
  assert.strictEqual(proxyResponse.forwarded, null, 'Noctis VPN tunnel stripped identifying X-Forwarded-For header');

  // Switch modes and test Kill-Switch PAC script
  const vpnStatus = await torVpnManager.updateConfig({
    mode: 'built-in-vpn',
    selectedRelay: 'is-reykjavik',
    killSwitch: true
  });
  assert.strictEqual(vpnStatus.mode, 'built-in-vpn');
  assert.strictEqual(vpnStatus.selectedRelay, 'is-reykjavik');
  assert.strictEqual(vpnStatus.killSwitch, true);

  const pacScript = torVpnManager.generatePacScript();
  assert(pacScript.includes('*.onion'), 'PAC script contains .onion routing rule');
  assert(pacScript.includes('*.i2p'), 'PAC script contains .i2p routing rule');

  // Test Circuit Rotation
  const oldCircuit = vpnStatus.circuitId;
  const rotated = await torVpnManager.rotateCircuit();
  assert.notStrictEqual(rotated.circuitId, oldCircuit, 'Circuit ID must change upon rotation');
  console.log(`   ✔ Browser VPN tunnel (127.0.0.1:${initStatus.tunnelPort}) & Circuit Rotation (${oldCircuit} -> ${rotated.circuitId}) verified.`);

  // Verify DNSSEC forced by default & Require Security / No Plain Text on Onion Router & VPN
  assert.strictEqual(torVpnManager.forceDnssec, true, 'forceDnssec must be true by default');
  assert.strictEqual(torVpnManager.requireSecureTraffic, true, 'requireSecureTraffic must be true by default');
  assert.strictEqual(torVpnManager.shouldUpgradeOrBlockInsecure('http://example.com/api'), true, 'Insecure clearnet HTTP must be upgraded');
  assert.strictEqual(torVpnManager.shouldUpgradeOrBlockInsecure('http://127.0.0.1:8080/local'), false, 'Loopback HTTP is permitted');
  assert.strictEqual(torVpnManager.upgradeInsecureUrl('http://example.com/test'), 'https://example.com/test', 'upgradeInsecureUrl upgrades to https');
  assert.strictEqual(torVpnManager.upgradeInsecureUrl('ws://example.com/socket'), 'wss://example.com/socket', 'upgradeInsecureUrl upgrades ws to wss');

  const dohResolved = await torVpnManager.resolveHostViaDoH('cloudflare.com');
  assert(net.isIP(dohResolved), 'cloudflare.com must resolve via DoH with DNSSEC validation');
  console.log(`   ✔ Strict DNSSEC validation (forced by default) and No Plain Text security policies verified.`);

  // 4. Verify Umbra / Shadow / DarkBrowser Privacy Engine Enhancements
  console.log('4. Verifying Umbra / Shadow / DarkBrowser anti-fingerprinting enhancements...');
  const cleanUrl = privacyEngine.sanitizeUrl('https://example.com/article?id=42&utm_source=news&twclid=abc&ttclid=def&li_fat_id=123&mkt_tok=xyz');
  assert.strictEqual(cleanUrl, 'https://example.com/article?id=42', 'All extended tracking parameters stripped');

  const shieldPath = path.join(__dirname, '../src/renderer/shield/privacyShield.js');
  privacyEngine.updateProfile({ presetKey: 'linux-amd', letterboxing: true, screenCaptureProtection: true });
  privacyEngine.saveShieldScript(shieldPath);

  // 5. Verify Headless E2E Guest Webview & UI Integration
  console.log('5. Running headless E2E verification of NoctisBrowser UI & guest webview shield...');
  const nm = new NetworkManager();
  const tm = new TabManager(nm);

  ipcMain.handle('tabs:create', (_, { url, title }) => tm.createTab(url, title));
  ipcMain.handle('tabs:create-special', (_, { type }) => tm.createSpecialTab(type));
  ipcMain.handle('tabs:close', (_, { tabId }) => tm.closeTab(tabId));
  ipcMain.handle('tabs:set-active', (_, { tabId }) => tm.setActiveTab(tabId));
  ipcMain.handle('tabs:update', (_, { tabId, updates }) => { tm.updateTab(tabId, updates); return true; });
  ipcMain.handle('tabs:get-all', () => tm.getAllTabs());
  ipcMain.handle('network:attach-webview', () => true);
  ipcMain.handle('network:get-snapshot', () => nm.getSnapshot());
  ipcMain.handle('privacy:get-stats', () => privacyEngine.getStats());
  ipcMain.on('privacy:get-shield-path-sync', (e) => { e.returnValue = shieldPath; });
  ipcMain.handle('privacy:get-profile', () => privacyEngine.getProfile());
  ipcMain.handle('privacy:get-presets', () => privacyEngine.getPresets());
  ipcMain.handle('privacy:update-profile', (_, { updates }) => privacyEngine.updateProfile(updates));
  ipcMain.handle('privacy:reroll-profile', () => privacyEngine.reRollProfile());
  ipcMain.handle('privacy:burn-identity', async () => {
    const profile = privacyEngine.reRollProfile();
    const torVpn = await torVpnManager.rotateCircuit();
    return { success: true, profile, torVpn };
  });
  ipcMain.handle('privacy:get-storage-info', () => ({
    ephemeralDirPath: testEphemeralDir,
    totalSizeBytes: 1024,
    totalFilesCount: 1,
    categories: {},
    files: []
  }));
  ipcMain.handle('torvpn:get-status', () => torVpnManager.getStatus());
  ipcMain.handle('torvpn:update-config', (_, { updates }) => torVpnManager.updateConfig(updates));
  ipcMain.handle('torvpn:rotate-circuit', () => torVpnManager.rotateCircuit());
  ipcMain.handle('torvpn:resolve-url', (_, { input }) => torVpnManager.resolveProtocolUrl(input));
  ipcMain.handle('torvpn:get-directory', () => torVpnManager.getDirectory());

  // Switch back to direct mode for local HTTP test server
  await torVpnManager.updateConfig({ mode: 'direct' });

  const win = new BrowserWindow({
    width: 1357,
    height: 863,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/main/preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = shieldPath;
    webPreferences.contextIsolation = false;
    webPreferences.nodeIntegration = false;
  });

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
  await new Promise(r => setTimeout(r, 800));

  // Verify Noctis UI & URL normalization for dark web addresses
  const uiChecks = await win.webContents.executeJavaScript(`
    (async () => {
      const hasNoctisApi = typeof window.noctis === 'object' && typeof window.noctis.getTorVpnStatus === 'function';
      const onionNorm = window.browserApp.normalizeUrl('duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion');
      const ipfsNorm = window.browserApp.normalizeUrl('ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq');
      const ethNorm = window.browserApp.normalizeUrl('vitalik.eth');

      // 1. Verify Default Starter Tab (about:blank, New Tab — No Hacker News default)
      const tab1Record = window.browserApp.tabs.get('tab-1');
      const starterTabUrl = tab1Record ? tab1Record.tabData?.url : null;
      const starterTabTitle = tab1Record ? tab1Record.tabData?.title : null;

      // 2. Verify Validation Quick-Cards on Welcome Screen
      const quickCards = Array.from(document.querySelectorAll('#tab-view-tab-1 .quick-card')).map(c => c.dataset.url);

      // 3. Test Home Action (Home is just default no page open tab)
      // Simulate navigating tab-1 to a dummy webview
      const mockWv = document.createElement('webview');
      mockWv.src = 'about:blank';
      tab1Record.webview = mockWv;
      tab1Record.viewEl.innerHTML = '';
      tab1Record.viewEl.appendChild(mockWv);
      tab1Record.tabData.url = 'https://some-site.com';
      document.getElementById('address-bar').value = 'https://some-site.com';

      // Click Home button
      document.getElementById('nav-home').click();
      const tab1AfterHome = window.browserApp.tabs.get('tab-1');
      const hasWebviewAfterHome = Boolean(tab1AfterHome?.webview);
      const urlAfterHome = tab1AfterHome?.tabData?.url;
      const titleAfterHome = tab1AfterHome?.tabData?.title;
      const addressBarAfterHome = document.getElementById('address-bar').value;
      const welcomeScreenRendered = Boolean(tab1AfterHome?.viewEl.querySelector('.welcome-screen'));

      // Open Tor & VPN Vault tab
      document.getElementById('btn-tor-tab').click();
      const activeAfterTorClick = window.browserApp.activeTabId;

      return {
        title: document.title,
        hasNoctisApi,
        onionNorm,
        ipfsNorm,
        ethNorm,
        starterTabUrl,
        starterTabTitle,
        quickCards,
        hasWebviewAfterHome,
        urlAfterHome,
        titleAfterHome,
        addressBarAfterHome,
        welcomeScreenRendered,
        activeAfterTorClick
      };
    })();
  `);

  assert.strictEqual(uiChecks.title, 'NoctisBrowser');
  assert.strictEqual(uiChecks.hasNoctisApi, true);
  assert(!uiChecks.onionNorm.includes('duckduckgo.com/?q='), '.onion domain must never be sent to clearnet search engine');
  assert(!uiChecks.ipfsNorm.includes('duckduckgo.com/?q='), 'ipfs:// URI must never be sent to clearnet search engine');
  assert(!uiChecks.ethNorm.includes('duckduckgo.com/?q='), '.eth domain must never be sent to clearnet search engine');

  // Assert default page is about:blank (no Hacker News default)
  assert.strictEqual(uiChecks.starterTabUrl, 'about:blank', 'Default starter tab must be about:blank');
  assert.strictEqual(uiChecks.starterTabTitle, 'New Tab', 'Default starter tab title must be New Tab');

  // Assert validation cards are present on welcome screen
  assert(uiChecks.quickCards.includes('https://www.whatismybrowser.com'), 'Welcome screen must include WhatIsMyBrowser audit card');
  assert(uiChecks.quickCards.includes('https://browserleaks.com/ip'), 'Welcome screen must include WhatIsMyIP / BrowserLeaks card');
  assert(uiChecks.quickCards.includes('https://www.dnsleaktest.com'), 'Welcome screen must include DNS Leak & DNSSEC card');
  assert(uiChecks.quickCards.includes('https://check.torproject.org'), 'Welcome screen must include Tor Check card');
  assert(uiChecks.quickCards.includes('https://one.one.one.one/help'), 'Welcome screen must include Cloudflare DNSSEC card');
  assert(uiChecks.quickCards.includes('https://coveryourtracks.eff.org'), 'Welcome screen must include EFF Cover Your Tracks card');
  assert(uiChecks.quickCards.includes('https://browserleaks.com/webrtc'), 'Welcome screen must include WebRTC Leak Test card');
  assert(!uiChecks.quickCards.some(u => u.includes('news.ycombinator.com')), 'Welcome screen must NOT include Hacker News');

  // Assert Home button resets tab to default no page open state
  assert.strictEqual(uiChecks.hasWebviewAfterHome, false, 'Home button must remove active webview');
  assert.strictEqual(uiChecks.urlAfterHome, 'about:blank', 'Home tab URL must be about:blank');
  assert.strictEqual(uiChecks.titleAfterHome, 'New Tab', 'Home tab title must be New Tab');
  assert.strictEqual(uiChecks.addressBarAfterHome, '', 'Address bar must be empty on Home tab');
  assert.strictEqual(uiChecks.welcomeScreenRendered, true, 'Home tab must render welcome screen');
  console.log('   ✔ Default no page open starter tab, state validation links & Home button verified.');

  assert.strictEqual(uiChecks.activeAfterTorClick, 'tab-vault', 'Clicking Tor & VPN button opens Vault tab');

  // Verify Clear Settings Saved/Unsaved Status Indicator & Banner in Vault
  const vaultUnsavedChecks = await win.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      // Ensure Vault sub-tab is open
      window.browserApp.openVaultTab('tab-identity');
      await new Promise(r => setTimeout(r, 600));

      const iframe = document.querySelector('#tab-view-tab-vault iframe');
      if (!iframe || !iframe.contentDocument) return resolve({ error: 'No iframe' });
      const doc = iframe.contentDocument;

      const initialBadge = doc.getElementById('badge-identity-save-state')?.textContent?.trim();
      const initialBannerHidden = doc.getElementById('vault-unsaved-banner')?.classList.contains('hidden');

      // Mutate OS input
      const inputOs = doc.getElementById('input-os');
      inputOs.value = 'CustomStealthOS';
      inputOs.dispatchEvent(new Event('input', { bubbles: true }));

      const dirtyBadge = doc.getElementById('badge-identity-save-state')?.textContent?.trim();
      const dirtyBannerHidden = doc.getElementById('vault-unsaved-banner')?.classList.contains('hidden');
      const btnHasUnsaved = doc.getElementById('btn-save-profile')?.classList.contains('has-unsaved');

      // Click save
      doc.getElementById('btn-save-profile')?.click();
      await new Promise(r => setTimeout(r, 300));

      const savedBadge = doc.getElementById('badge-identity-save-state')?.textContent?.trim();
      const savedBannerHidden = doc.getElementById('vault-unsaved-banner')?.classList.contains('hidden');

      resolve({
        initialBadge,
        initialBannerHidden,
        dirtyBadge,
        dirtyBannerHidden,
        btnHasUnsaved,
        savedBadge,
        savedBannerHidden
      });
    });
  `);

  assert.strictEqual(vaultUnsavedChecks.dirtyBadge, 'UNSAVED', 'Identity badge marks UNSAVED on change');
  assert.strictEqual(vaultUnsavedChecks.dirtyBannerHidden, false, 'Unsaved banner is displayed when settings change');
  assert.strictEqual(vaultUnsavedChecks.btnHasUnsaved, true, 'Apply button gains has-unsaved pulsing class');
  assert.strictEqual(vaultUnsavedChecks.savedBadge, 'SAVED', 'Identity badge marks SAVED after apply');
  assert.strictEqual(vaultUnsavedChecks.savedBannerHidden, true, 'Unsaved banner is hidden after apply');
  console.log('   ✔ Clear settings saved/unsaved status indicator and sticky warning banner verified.');

  // Verify Tor/VPN Tab DNSSEC & Require Security controls in Vault
  const vaultTorVpnChecks = await win.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      window.browserApp.openVaultTab('tab-tor-vpn');
      await new Promise(r => setTimeout(r, 600));

      const iframe = document.querySelector('#tab-view-tab-vault iframe');
      if (!iframe || !iframe.contentDocument) return resolve({ error: 'No iframe' });
      const doc = iframe.contentDocument;

      const toggleDnssec = doc.getElementById('toggle-dnssec');
      const toggleRequireSecure = doc.getElementById('toggle-require-secure');
      const dnssecCountEl = doc.getElementById('torvpn-dnssec-count');

      resolve({
        dnssecChecked: toggleDnssec ? toggleDnssec.checked : null,
        requireSecureChecked: toggleRequireSecure ? toggleRequireSecure.checked : null,
        hasDnssecCount: Boolean(dnssecCountEl)
      });
    });
  `);

  assert.strictEqual(vaultTorVpnChecks.dnssecChecked, true, 'Vault DNSSEC toggle must be checked by default');
  assert.strictEqual(vaultTorVpnChecks.requireSecureChecked, true, 'Vault Require Security toggle must be checked by default');
  assert.strictEqual(vaultTorVpnChecks.hasDnssecCount, true, 'Vault telemetry displays DNSSEC counter');
  console.log('   ✔ Vault Tor/VPN DNSSEC and Require Security toggles verified.');

  // Verify guest webview shield protections (Letterboxing, Storage Quota, Sensors, Gamepad, Noctis Shield)
  const guestChecks = await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const wv = document.createElement('webview');
      wv.setAttribute('partition', 'in-memory-ephemeral');
      wv.src = 'http://127.0.0.1:${echoPort}/guest';
      document.body.appendChild(wv);
      wv.addEventListener('dom-ready', async () => {
        const res = await wv.executeJavaScript(\`
          (async () => {
            const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const kbd = navigator.keyboard && navigator.keyboard.getLayoutMap ? await navigator.keyboard.getLayoutMap() : null;
            return {
              noctisShield: Boolean(window.__NOCTIS_SHIELD_ACTIVE__),
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              widthBucketMod: window.innerWidth % 200,
              heightBucketMod: window.innerHeight % 100,
              quota: est ? est.quota : 0,
              gamepadsLen: gamepads.length,
              accelUndefined: window.Accelerometer === undefined,
              gyroUndefined: window.Gyroscope === undefined,
              kbdQ: kbd ? kbd.get('KeyQ') : null,
              hdrMatch: window.matchMedia('(dynamic-range: high)').matches,
              p3Match: window.matchMedia('(color-gamut: p3)').matches
            };
          })()
        \`);
        resolve(res);
      });
    });
  `);

  assert.strictEqual(guestChecks.noctisShield, true, 'Noctis shield active in guest webview');
  assert.strictEqual(guestChecks.widthBucketMod, 0, `Letterboxed innerWidth (${guestChecks.innerWidth}) must be quantized to 200px bucket`);
  assert.strictEqual(guestChecks.heightBucketMod, 0, `Letterboxed innerHeight (${guestChecks.innerHeight}) must be quantized to 100px bucket`);
  assert.strictEqual(guestChecks.quota, 10737418240, 'Storage quota masked to uniform 10.0 GB');
  assert.strictEqual(guestChecks.gamepadsLen, 0, 'Gamepad enumeration blocked');
  assert.strictEqual(guestChecks.accelUndefined, true, 'Accelerometer sensor blocked');
  assert.strictEqual(guestChecks.gyroUndefined, true, 'Gyroscope sensor blocked');
  assert.strictEqual(guestChecks.kbdQ, 'q', 'Keyboard layout masked to standardized US QWERTY');
  assert.strictEqual(guestChecks.hdrMatch, false, 'HDR display media query normalized');
  assert.strictEqual(guestChecks.p3Match, false, 'P3 wide gamut display media query normalized');

  console.log('   ✔ Guest webview Letterboxing, Storage Quota, Sensors, Gamepads, Keyboard & Display defenses verified.');

  torVpnManager.shutdown();
  try { fs.rmSync(testEphemeralDir, { recursive: true, force: true }); } catch (_) {}
  console.log('\n✅ ALL NOCTISBROWSER TESTS PASSED!');
  process.exit(0);
}

app.whenReady().then(runTests).catch((err) => {
  console.error('❌ Test failed:', err);
  try { fs.rmSync(testEphemeralDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
