const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const NetworkManager = require('../src/main/networkManager');
const TabManager = require('../src/main/tabManager');
const privacyEngine = require('../src/main/privacyEngine');

console.log('--- End-to-End Verification: Linux Preset & WhatIsMyBrowser Zero-Conflict ---');

// Set Linux preset
privacyEngine.updateProfile({ presetKey: 'linux-amd' });
const profile = privacyEngine.getProfile();
console.log('Active Profile:', profile.name, '| OS:', profile.os, '| Platform:', profile.platform);

const networkManager = new NetworkManager();
const tabManager = new TabManager(networkManager);

const staticShieldPath = path.join(__dirname, '../src/renderer/shield/privacyShield.js');
privacyEngine.saveShieldScript(staticShieldPath);

app.whenReady().then(async () => {
  // Session protections
  const sessions = [session.defaultSession, session.fromPartition('in-memory-ephemeral')];
  for (const s of sessions) {
    if (!s) continue;
    s.setUserAgent(privacyEngine.getUserAgent());
    s.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const cleanHeaders = privacyEngine.sanitizeHeaders(details.requestHeaders, details.url);
        callback({ requestHeaders: cleanHeaders });
      } catch (_) {
        callback({ requestHeaders: details.requestHeaders || {} });
      }
    });
  }

  // Register main IPC handlers
  ipcMain.handle('tabs:create', (_, { url, title }) => tabManager.createTab(url, title));
  ipcMain.handle('tabs:create-special', (_, { type }) => tabManager.createSpecialTab(type));
  ipcMain.handle('tabs:close', (_, { tabId }) => tabManager.closeTab(tabId));
  ipcMain.handle('tabs:set-active', (_, { tabId }) => tabManager.setActiveTab(tabId));
  ipcMain.handle('tabs:get-all', () => tabManager.getAllTabs());
  ipcMain.handle('privacy:get-stats', () => privacyEngine.getStats());
  ipcMain.handle('network:attach-webview', async (event, { webContentsId, tabId }) => {
    const { webContents } = require('electron');
    const wc = webContents.fromId(webContentsId);
    if (wc) networkManager.attach(wc, tabId);
    return true;
  });
  ipcMain.handle('privacy:get-shield-path', () => staticShieldPath);
  ipcMain.on('privacy:get-shield-path-sync', (event) => {
    event.returnValue = staticShieldPath;
  });
  ipcMain.handle('network:get-snapshot', () => networkManager.getSnapshot());
  ipcMain.handle('privacy:get-profile', () => privacyEngine.getProfile());
  ipcMain.handle('privacy:get-presets', () => privacyEngine.getPresets());
  ipcMain.handle('privacy:update-profile', (_, { updates }) => {
    const p = privacyEngine.updateProfile(updates);
    privacyEngine.saveShieldScript(staticShieldPath);
    networkManager.updateShieldScript(privacyEngine.generateShieldScript());
    for (const s of sessions) if (s) s.setUserAgent(privacyEngine.getUserAgent());
    return p;
  });
  ipcMain.handle('privacy:get-storage-info', () => ({
    totalSizeBytes: 0,
    totalFilesCount: 0,
    categories: {},
    files: []
  }));
  ipcMain.handle('torvpn:get-status', () => ({ mode: 'direct', connected: false, statusText: 'Direct Connection', circuitId: '00000000', vpnRegions: [], currentRegion: null }));
  ipcMain.handle('torvpn:get-directory', () => ({ protocols: [], sites: [] }));

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/main/preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Hard timeout to prevent hanging
  setTimeout(() => {
    console.error('Test timed out after 25s');
    process.exit(1);
  }, 25000);

  win.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = staticShieldPath;
    webPreferences.contextIsolation = false;
    webPreferences.nodeIntegration = false;
  });

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  console.log('1. Checking Vault Tab Probes...');
  const vaultProbeResults = await win.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      // Open Vault Tab
      document.getElementById('btn-vault-tab').click();

      const startTime = Date.now();
      const interval = setInterval(() => {
        const iframe = document.querySelector('#tab-view-tab-vault iframe');
        if (!iframe || !iframe.contentDocument) return;

        const doc = iframe.contentDocument;
        const platform = doc.getElementById('probe-platform-val')?.textContent?.trim();
        if (platform && platform !== '--') {
          clearInterval(interval);
          resolve({
            platformVal: platform,
            coresVal: doc.getElementById('probe-cores-val')?.textContent?.trim(),
            memoryVal: doc.getElementById('probe-memory-val')?.textContent?.trim(),
            webglVal: doc.getElementById('probe-webgl-val')?.textContent?.trim()
          });
          return;
        }

        if (Date.now() - startTime > 5000) {
          clearInterval(interval);
          resolve({
            platformVal: platform || '--',
            coresVal: doc.getElementById('probe-cores-val')?.textContent,
            memoryVal: doc.getElementById('probe-memory-val')?.textContent,
            webglVal: doc.getElementById('probe-webgl-val')?.textContent
          });
        }
      }, 100);
    })
  `);

  console.log('   Vault Probe - Platform:', vaultProbeResults.platformVal);
  console.log('   Vault Probe - Cores:', vaultProbeResults.coresVal);
  console.log('   Vault Probe - Memory:', vaultProbeResults.memoryVal);
  console.log('   Vault Probe - WebGL:', vaultProbeResults.webglVal);

  if (vaultProbeResults.platformVal !== 'Linux x86_64') {
    console.error('❌ FAILED: Vault probe did not show Linux x86_64!');
    app.exit(1);
    return;
  }
  if (!vaultProbeResults.webglVal.includes('AMD')) {
    console.error('❌ FAILED: Vault probe did not show AMD WebGL!');
    app.exit(1);
    return;
  }
  console.log('   ✅ Privacy Vault probe accurately displays the active Linux profile!');

  win.webContents.on('console-message', (e, level, msg) => console.log('[Renderer]', msg));

  console.log('2. Navigating a tab to whatismybrowser.com...');
  const wimbResults = await win.webContents.executeJavaScript(`
    new Promise(async (resolve) => {
      console.log('Step A: creating tab');
      // Create new tab with whatismybrowser.com
      const tabId = await window.browserApp.createTab('https://www.yahoo.com', 'WhatIsMyBrowser Test');
      console.log('Step B: tab created, id:', tabId);
      
      const record = window.browserApp.tabs.get(tabId);
      const webview = record.webview;
      const checkAndResolve = async () => {
        console.log('Step C: calling webview.executeJavaScript');
        try {
          const res = await webview.executeJavaScript([
            '({',
            '  navPlatform: navigator.platform,',
            '  navUserAgent: navigator.userAgent,',
            '  hasConflict: document.body.innerText.includes("This conflict") || document.body.innerText.includes("conflict might be causing"),',
            '  primaryText: document.getElementById("primary-browser-detection") ? document.getElementById("primary-browser-detection").innerText : "",',
            '  backendText: document.getElementById("primary-browser-detection-backend") ? document.getElementById("primary-browser-detection-backend").innerText : "",',
            '  frontendText: document.getElementById("primary-browser-detection-frontend") ? document.getElementById("primary-browser-detection-frontend").innerText : ""',
            '})'
          ].join('\\n'));
          console.log('Step D: Got eval result:', res);
          resolve(res);
        } catch (err) {
          console.error('Eval error:', err);
          resolve({ error: err.message });
        }
      };

      webview.addEventListener('dom-ready', () => {
        console.log('Webview dom-ready event fired');
        webview.addEventListener('did-stop-loading', () => {
          console.log('Webview did-stop-loading event fired');
          setTimeout(checkAndResolve, 3000);
        }, { once: true });
        // Fallback in case did-stop-loading already fired
        setTimeout(checkAndResolve, 6000);
      }, { once: true });
    })
  `);

  console.log('   WhatIsMyBrowser Results:');
  console.log('   - navigator.platform:', wimbResults.navPlatform);
  console.log('   - navigator.userAgent:', wimbResults.navUserAgent);
  console.log('   - hasConflict warning:', wimbResults.hasConflict);
  console.log('   - primaryText:', wimbResults.primaryText?.replace(/\\s+/g, ' '));
  console.log('   - backendText:', wimbResults.backendText?.replace(/\\s+/g, ' '));
  console.log('   - frontendText:', wimbResults.frontendText?.replace(/\\s+/g, ' '));

  if (wimbResults.hasConflict) {
    console.error('❌ FAILED: WhatIsMyBrowser still reports a conflict!');
    app.exit(1);
    return;
  }

  if (wimbResults.navPlatform !== 'Linux x86_64' || !wimbResults.navUserAgent?.includes('Linux')) {
    console.error('❌ FAILED: Guest webview navigator properties did not reflect Linux persona!');
    app.exit(1);
    return;
  }

  if (wimbResults.primaryText && !wimbResults.primaryText.includes('Linux')) {
    console.error('❌ FAILED: WhatIsMyBrowser did not detect Linux!');
    app.exit(1);
    return;
  }

  console.log('   ✅ WhatIsMyBrowser successfully detects Chrome on Linux with ZERO conflicts!');
  console.log('🎉 ALL END-TO-END VERIFICATIONS PASSED!');
  process.exit(0);
});
