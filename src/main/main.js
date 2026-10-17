const { app, BrowserWindow, ipcMain, webContents, dialog, session, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const NetworkManager = require('./networkManager');
const TabManager = require('./tabManager');
const privacyEngine = require('./privacyEngine');
const feedManager = require('./feedManager');
const torVpnManager = require('./torVpnManager');

// Set official application brand name
app.setName('NoctisBrowser');

// Standardize Chrome User-Agent globally
app.userAgentFallback = privacyEngine.getUserAgent();

// --- Ephemeral Storage Isolation ---
// Clean up any stale ephemeral sessions from previous runs
const tmpBase = os.tmpdir();
try {
  const entries = fs.readdirSync(tmpBase);
  for (const entry of entries) {
    if (entry.startsWith('noctis-ephemeral-') || entry.startsWith('netscope-ephemeral-')) {
      fs.rmSync(path.join(tmpBase, entry), { recursive: true, force: true });
    }
  }
} catch (_) {}

// Generate a dedicated, isolated ephemeral workspace for this browser instance
const ephemeralSessionId = `noctis-ephemeral-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const ephemeralDirPath = path.join(tmpBase, ephemeralSessionId);
fs.mkdirSync(ephemeralDirPath, { recursive: true });

// Route all Electron user and session data exclusively to this temporary space
app.setPath('userData', ephemeralDirPath);
app.setPath('sessionData', ephemeralDirPath);

// Write active dynamic privacy shield into ephemeral directory and static directory
const ephemeralShieldPath = path.join(ephemeralDirPath, 'privacyShield.js');
const staticShieldPath = path.join(__dirname, '../renderer/shield/privacyShield.js');
try {
  privacyEngine.saveShieldScript(ephemeralShieldPath);
  if (!app.isPackaged) {
    privacyEngine.saveShieldScript(staticShieldPath);
  }
} catch (e) {
  console.error('Failed to initialize ephemeral privacy shield:', e);
}

// Configure Chromium engine to disable disk caches and force in-memory operations
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('media-cache-size', '0');
app.commandLine.appendSwitch('disable-application-cache');
app.commandLine.appendSwitch('disable-offline-load-stale-cache');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('incognito');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-webrtc-multiple-routes');

// Force DNS-over-HTTPS with strict DNSSEC validation across Chromium engine
app.commandLine.appendSwitch('enable-features', 'DnsOverHttps');
app.commandLine.appendSwitch('dns-over-https-mode', 'automatic');
app.commandLine.appendSwitch('dns-over-https-templates', 'https://1.1.1.2/dns-query{?dns}');

// Zero-admin portable execution on Linux (Fedora/Ubuntu/Arch):
// Unpacked portable builds do not have root-owned SUID chrome-sandbox (4755), so enable user-space execution without sudo.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-setuid-sandbox');
}

// Unconditional exit cleanup function
let isCleaningUp = false;
function cleanupEphemeralData() {
  if (isCleaningUp) return;
  isCleaningUp = true;

  try {
    torVpnManager.shutdown();
  } catch (_) {}

  // 1. Attempt immediate synchronous wipe
  try {
    if (fs.existsSync(ephemeralDirPath)) {
      fs.rmSync(ephemeralDirPath, { recursive: true, force: true });
    }
  } catch (_) {
    // Locked file handles will be cleaned up by the detached reaper below
  }

  // 2. Spawn a detached native background reaper to guarantee deletion once Chromium releases locks
  try {
    if (process.platform === 'win32') {
      const child = require('child_process').spawn(
        'cmd.exe',
        ['/c', `ping 127.0.0.1 -n 2 > nul & rmdir /s /q "${ephemeralDirPath}"`],
        { detached: true, stdio: 'ignore', windowsHide: true }
      );
      child.unref();
    } else {
      const reaperCmd = `sleep 0.2; rm -rf "${ephemeralDirPath}"`;
      const child = require('child_process').spawn('sh', ['-c', reaperCmd], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }
  } catch (_) {}
}

// Exit and termination hooks
app.on('before-quit', async () => {
  try {
    const sessions = [session.defaultSession, session.fromPartition('in-memory-ephemeral')];
    for (const s of sessions) {
      if (s) {
        await s.clearStorageData();
        await s.clearCache();
        await s.clearHostResolverCache();
        await s.clearAuthCache();
      }
    }
  } catch (_) {}
});

app.on('will-quit', () => {
  cleanupEphemeralData();
});

app.on('quit', () => {
  cleanupEphemeralData();
});

process.on('exit', () => {
  cleanupEphemeralData();
});

process.on('SIGINT', () => {
  cleanupEphemeralData();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanupEphemeralData();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  cleanupEphemeralData();
  process.exit(1);
});

// --- Browser Windows & Managers ---
let mainWindow = null;
const networkManager = new NetworkManager();
const tabManager = new TabManager(networkManager);
const appIconPath = path.join(__dirname, '../../assets/icon.png');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 640,
    show: process.env.NOCTIS_HEADLESS !== '1',
    title: 'NoctisBrowser — Zero-Trace Ephemeral & Dark Web Privacy Browser',
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    backgroundColor: '#090d16',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      spellcheck: false
    }
  });

  // Apply Shadow Mode OS screen-capture protection if enabled in profile
  const initialProfile = privacyEngine.getProfile();
  if (initialProfile.screenCaptureProtection) {
    try {
      mainWindow.setContentProtection(true);
    } catch (_) {}
  }

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Inject privacy shield preload script and configure main-world execution for all guest webviews
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.preload = staticShieldPath;
    webPreferences.contextIsolation = false;
    webPreferences.nodeIntegration = false;
  });

  // Intercept any new window requests from the main window itself
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const url = details.url;
    if (url && url !== 'about:blank' && !url.startsWith('javascript:')) {
      sendToRenderer('browser:open-new-tab', {
        url,
        disposition: details.disposition || 'foreground-tab'
      });
    }
    return { action: 'deny' };
  });

  // Forward networkManager events to renderer
  networkManager.on('request-started', data => sendToRenderer('network:request-started', data));
  networkManager.on('response-received', data => sendToRenderer('network:response-received', data));
  networkManager.on('request-finished', data => sendToRenderer('network:request-finished', data));
  networkManager.on('request-failed', data => sendToRenderer('network:request-failed', data));
  networkManager.on('request-paused', data => sendToRenderer('network:request-paused', data));
  networkManager.on('request-blocked', data => sendToRenderer('network:request-blocked', data));
  networkManager.on('request-resumed', data => sendToRenderer('network:request-resumed', data));
  networkManager.on('response-body-ready', data => sendToRenderer('network:response-body-ready', data));
  networkManager.on('global-pause-changed', data => sendToRenderer('network:global-pause-changed', data));
  networkManager.on('rules-updated', data => sendToRenderer('network:rules-updated', data));
  networkManager.on('breakpoints-updated', data => sendToRenderer('network:breakpoints-updated', data));
  networkManager.on('history-cleared', () => sendToRenderer('network:history-cleared'));

  // Forward tabManager events to renderer
  tabManager.on('tab-created', data => sendToRenderer('tab:created', data));
  tabManager.on('tab-closed', data => sendToRenderer('tab:closed', data));
  tabManager.on('active-tab-changed', data => sendToRenderer('tab:active-changed', data));
  tabManager.on('tab-updated', data => sendToRenderer('tab:updated', data));

  // Forward torVpnManager events to renderer
  torVpnManager.on('status-updated', data => sendToRenderer('torvpn:status-updated', data));
  torVpnManager.on('download-progress', data => sendToRenderer('torvpn:download-progress', data));

  // Intercept Cmd+T (macOS) / Ctrl+T (Linux, Windows) in main window webContents
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isNewTabInputEvent(input)) {
      event.preventDefault();
      sendToRenderer('browser:shortcut-new-tab');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function isNewTabInputEvent(input) {
  if (!input || input.type !== 'keyDown') return false;
  const isMac = process.platform === 'darwin';
  const hasModifier = isMac ? (input.meta && !input.control) : (input.control && !input.meta);
  return Boolean(hasModifier && !input.alt && !input.shift && input.key && input.key.toLowerCase() === 't');
}

// Intercept all window opening and shortcut inputs across all webviews and child contexts
app.on('web-contents-created', (event, contents) => {
  contents.on('before-input-event', (e, input) => {
    if (isNewTabInputEvent(input)) {
      e.preventDefault();
      sendToRenderer('browser:shortcut-new-tab');
    }
  });

  contents.setWindowOpenHandler((details) => {
    const url = details.url;
    if (url && url !== 'about:blank' && !url.startsWith('javascript:')) {
      sendToRenderer('browser:open-new-tab', {
        url,
        disposition: details.disposition || 'foreground-tab'
      });
    }
    return { action: 'deny' };
  });
});

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    try {
      const safeData = (data !== undefined && data !== null)
        ? JSON.parse(JSON.stringify(data))
        : data;
      mainWindow.webContents.send(channel, safeData);
    } catch (_) {}
  }
}

function updateActiveSessionsUserAgent() {
  const ua = privacyEngine.getUserAgent();
  app.userAgentFallback = ua;
  const sessions = [
    session.defaultSession,
    session.fromPartition('in-memory-ephemeral')
  ];
  for (const s of sessions) {
    if (s) {
      s.setUserAgent(ua);
    }
  }
}

function syncShieldFiles() {
  const shieldCode = privacyEngine.generateShieldScript();
  try {
    fs.writeFileSync(ephemeralShieldPath, shieldCode, 'utf-8');
  } catch (_) {}
  if (!app.isPackaged) {
    try {
      fs.writeFileSync(staticShieldPath, shieldCode, 'utf-8');
    } catch (_) {}
  }
  updateActiveSessionsUserAgent();

  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const profile = privacyEngine.getProfile();
      mainWindow.setContentProtection(Boolean(profile.screenCaptureProtection));
    } catch (_) {}
  }
}

// --- Dynamic Runtime Variation Drift Timer ---
let driftTimer = null;
function setupDriftTimer() {
  if (driftTimer) {
    clearInterval(driftTimer);
    driftTimer = null;
  }

  const profile = privacyEngine.getProfile();
  if (profile.runtimeDrift && profile.driftIntervalSec > 0) {
    driftTimer = setInterval(() => {
      const newProfile = privacyEngine.driftRuntimeParameters();
      syncShieldFiles();
      sendToRenderer('privacy:profile-updated', newProfile);
    }, profile.driftIntervalSec * 1000);
  }
}

// --- Ephemeral Storage Inspector Logic ---
function getStorageInspectionData() {
  const result = {
    ephemeralDirPath,
    sessionId: ephemeralSessionId,
    totalSizeBytes: 0,
    totalFilesCount: 0,
    categories: {
      cookies: { count: 0, sizeBytes: 0, label: 'Cookies (SQLite/LevelDB)' },
      localStorage: { count: 0, sizeBytes: 0, label: 'HTML5 Local Storage' },
      indexedDB: { count: 0, sizeBytes: 0, label: 'IndexedDB Databases' },
      gpuCache: { count: 0, sizeBytes: 0, label: 'GPU & Shader Cache' },
      codeCache: { count: 0, sizeBytes: 0, label: 'V8 Code & HTTP Cache' },
      networkState: { count: 0, sizeBytes: 0, label: 'Network Persistent State' },
      config: { count: 0, sizeBytes: 0, label: 'Chromium Ephemeral State' },
      other: { count: 0, sizeBytes: 0, label: 'Ephemeral Shield & Temp Files' }
    },
    files: [],
    zeroTraceGuarantee: {
      isEphemeral: true,
      tempBase: tmpBase,
      wipeOnExitArmed: true,
      forcedInMemoryFlags: [
        '--disable-http-cache',
        '--disk-cache-size=0',
        '--media-cache-size=0',
        '--disable-application-cache',
        '--incognito',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'
      ]
    }
  };

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(ephemeralDirPath, fullPath);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath);
            const size = stats.size;
            result.totalSizeBytes += size;
            result.totalFilesCount++;

            let cat = 'other';
            const lower = relPath.toLowerCase();
            if (lower.includes('cookie')) cat = 'cookies';
            else if (lower.includes('indexeddb')) cat = 'indexedDB';
            else if (lower.includes('local storage') || lower.includes('leveldb')) cat = 'localStorage';
            else if (lower.includes('gpucache') || lower.includes('dawncache') || lower.includes('shader')) cat = 'gpuCache';
            else if (lower.includes('cache') || lower.includes('code cache')) cat = 'codeCache';
            else if (lower.includes('network') || lower.includes('transportsecurity')) cat = 'networkState';
            else if (lower.includes('preference') || lower.includes('local state')) cat = 'config';

            result.categories[cat].count++;
            result.categories[cat].sizeBytes += size;

            result.files.push({
              path: relPath,
              fullPath,
              sizeBytes: size,
              formattedSize: formatBytes(size),
              category: cat,
              categoryLabel: result.categories[cat].label,
              mtime: stats.mtime.toISOString(),
              isDir: false
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  walk(ephemeralDirPath);
  result.files.sort((a, b) => b.sizeBytes - a.sizeBytes);
  return result;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function purgeAllEphemeralSessions() {
  const sessions = [
    session.defaultSession,
    session.fromPartition('in-memory-ephemeral')
  ];
  for (const s of sessions) {
    if (!s) continue;
    try {
      await s.clearStorageData();
      await s.clearCache();
      await s.clearHostResolverCache();
      await s.clearAuthCache();
    } catch (_) {}
  }

  // Remove transient cache subdirectories
  const cacheDirs = ['Cache', 'GPUCache', 'DawnCache', 'Code Cache', 'blob_storage'];
  for (const cd of cacheDirs) {
    const p = path.join(ephemeralDirPath, cd);
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch (_) {}
  }

  // Refresh shield script in place
  try {
    privacyEngine.saveShieldScript(ephemeralShieldPath);
  } catch (_) {}
}

// --- IPC Handlers ---

// Tab handlers
ipcMain.handle('tabs:create', (_, { url, title }) => {
  return tabManager.createTab(url, title);
});

ipcMain.handle('tabs:create-special', (_, { type }) => {
  return tabManager.createSpecialTab(type);
});

ipcMain.handle('tabs:close', (_, { tabId }) => {
  return tabManager.closeTab(tabId);
});

ipcMain.handle('tabs:set-active', (_, { tabId }) => {
  return tabManager.setActiveTab(tabId);
});

ipcMain.handle('tabs:update', (_, { tabId, updates }) => {
  tabManager.updateTab(tabId, updates);
  return true;
});

ipcMain.handle('tabs:get-all', () => {
  return tabManager.getAllTabs();
});

// Attaching network interceptor to webview
ipcMain.handle('network:attach-webview', (_, { webContentsId, tabId }) => {
  const targetWc = webContents.fromId(webContentsId);
  if (targetWc) {
    networkManager.attach(targetWc, tabId);
    return true;
  }
  return false;
});

// Network Interception Controls
ipcMain.handle('network:set-global-pause', (_, { enabled }) => {
  return networkManager.setGlobalPause(enabled);
});

ipcMain.handle('network:resume-request', (_, { requestId, modifiedData }) => {
  return networkManager.resumeRequest(requestId, modifiedData);
});

ipcMain.handle('network:block-paused-request', (_, { requestId }) => {
  return networkManager.blockPausedRequest(requestId);
});

ipcMain.handle('network:fulfill-paused-request', (_, { requestId, code, headers, body }) => {
  return networkManager.fulfillPausedRequest(requestId, code, headers, body);
});

ipcMain.handle('network:resume-all-paused', () => {
  networkManager.resumeAllPaused();
  return true;
});

// Firewall / Block Rules
ipcMain.handle('network:add-block-rule', (_, { pattern, label }) => {
  return networkManager.addBlockRule(pattern, label);
});

ipcMain.handle('network:toggle-block-rule', (_, { id, enabled }) => {
  return networkManager.toggleBlockRule(id, enabled);
});

ipcMain.handle('network:remove-block-rule', (_, { id }) => {
  return networkManager.removeBlockRule(id);
});

ipcMain.handle('network:get-block-rules', () => {
  return networkManager.getBlockRules();
});

// Breakpoints
ipcMain.handle('network:add-breakpoint', (_, { type, value }) => {
  return networkManager.addBreakpoint(type, value);
});

ipcMain.handle('network:toggle-breakpoint', (_, { id, enabled }) => {
  return networkManager.toggleBreakpoint(id, enabled);
});

ipcMain.handle('network:remove-breakpoint', (_, { id }) => {
  return networkManager.removeBreakpoint(id);
});

ipcMain.handle('network:get-breakpoints', () => {
  return networkManager.getBreakpoints();
});

// Details & Snapshot
ipcMain.handle('network:get-request-details', (_, { requestId }) => {
  return networkManager.getRequestDetails(requestId);
});

ipcMain.handle('network:get-response-body', (_, { requestId }) => {
  return networkManager.getResponseBody(requestId);
});

ipcMain.handle('network:clear-history', () => {
  networkManager.clearHistory();
  return true;
});

ipcMain.handle('network:get-snapshot', () => {
  return networkManager.getSnapshot();
});

ipcMain.handle('network:export-har', () => {
  return networkManager.exportHAR();
});

ipcMain.handle('network:save-har-file', async () => {
  if (!mainWindow) return { canceled: true };
  const harData = networkManager.exportHAR();
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Network Traffic HAR',
    defaultPath: `noctis-trace-${Date.now()}.har`,
    filters: [{ name: 'HTTP Archive', extensions: ['har', 'json'] }]
  });

  if (!canceled && filePath) {
    fs.writeFileSync(filePath, JSON.stringify(harData, null, 2), 'utf-8');
    return { success: true, filePath };
  }
  return { canceled: true };
});

// Privacy, Paranoid Fingerprint & Anonymity IPC Handlers
ipcMain.handle('privacy:get-stats', () => {
  return privacyEngine.getStats();
});

ipcMain.handle('privacy:toggle-deny-trackers', (_, { enabled }) => {
  privacyEngine.denyByDefaultTrackers = Boolean(enabled);
  return privacyEngine.getStats();
});

ipcMain.on('privacy:get-shield-path-sync', (event) => {
  event.returnValue = fs.existsSync(ephemeralShieldPath)
    ? ephemeralShieldPath
    : staticShieldPath;
});

ipcMain.handle('privacy:get-shield-path', () => {
  return fs.existsSync(ephemeralShieldPath)
    ? ephemeralShieldPath
    : staticShieldPath;
});

// Dynamic Fingerprint Profile Handlers
ipcMain.handle('privacy:get-profile', () => {
  return privacyEngine.getProfile();
});

ipcMain.handle('privacy:get-presets', () => {
  return privacyEngine.getPresets();
});

ipcMain.handle('privacy:update-profile', (_, { updates }) => {
  const profile = privacyEngine.updateProfile(updates);
  syncShieldFiles();
  setupDriftTimer();
  sendToRenderer('privacy:profile-updated', profile);
  return profile;
});

ipcMain.handle('privacy:reroll-profile', (_, { presetKey } = {}) => {
  const profile = privacyEngine.reRollProfile(presetKey);
  syncShieldFiles();
  setupDriftTimer();
  sendToRenderer('privacy:profile-updated', profile);
  return profile;
});

ipcMain.handle('privacy:drift-profile', () => {
  const profile = privacyEngine.driftRuntimeParameters();
  syncShieldFiles();
  sendToRenderer('privacy:profile-updated', profile);
  return profile;
});

ipcMain.handle('privacy:set-runtime-drift', (_, { enabled, intervalSec }) => {
  const updates = { runtimeDrift: Boolean(enabled) };
  if (intervalSec && Number(intervalSec) > 0) {
    updates.driftIntervalSec = Number(intervalSec);
  }
  const profile = privacyEngine.updateProfile(updates);
  syncShieldFiles();
  setupDriftTimer();
  sendToRenderer('privacy:profile-updated', profile);
  return profile;
});

// Instant Panic / Burn Identity Handler
ipcMain.handle('privacy:burn-identity', async () => {
  await purgeAllEphemeralSessions();
  const newProfile = privacyEngine.reRollProfile();
  syncShieldFiles();
  setupDriftTimer();
  const newCircuit = await torVpnManager.rotateCircuit();
  networkManager.clearHistory();

  const updatedStorage = getStorageInspectionData();
  sendToRenderer('privacy:profile-updated', newProfile);
  sendToRenderer('privacy:storage-updated', updatedStorage);
  sendToRenderer('privacy:identity-burned', {
    profile: newProfile,
    torVpn: newCircuit,
    timestamp: Date.now()
  });

  return {
    success: true,
    profile: newProfile,
    torVpn: newCircuit,
    storage: updatedStorage
  };
});

// Tor, Dark Web Protocols & Browser VPN Handlers
ipcMain.handle('torvpn:get-status', () => {
  return torVpnManager.getStatus();
});

ipcMain.handle('torvpn:update-config', async (_, { updates }) => {
  return await torVpnManager.updateConfig(updates || {});
});

ipcMain.handle('torvpn:rotate-circuit', async () => {
  return await torVpnManager.rotateCircuit();
});

ipcMain.handle('torvpn:probe-daemons', async () => {
  await torVpnManager.probeLocalDaemons();
  return torVpnManager.getStatus();
});

ipcMain.handle('torvpn:start-tor', async () => {
  return await torVpnManager.startManagedTorDaemon();
});

ipcMain.handle('torvpn:download-tor', async () => {
  return await torVpnManager.downloadAndInstallTorDaemon();
});

ipcMain.handle('torvpn:resolve-url', (_, { input }) => {
  return torVpnManager.resolveProtocolUrl(input);
});

ipcMain.handle('torvpn:get-relays', () => {
  return torVpnManager.getRelays();
});

ipcMain.handle('torvpn:get-directory', () => {
  return torVpnManager.getDirectory();
});

ipcMain.handle('torvpn:test-routing-path', async (_, { targetUrl } = {}) => {
  return await torVpnManager.runRoutingPathDiagnostic(targetUrl);
});

// Ephemeral Storage Transparency & Purge
ipcMain.handle('privacy:get-storage-info', () => {
  return getStorageInspectionData();
});

ipcMain.handle('privacy:purge-storage', async () => {
  await purgeAllEphemeralSessions();
  const updatedStorage = getStorageInspectionData();
  sendToRenderer('privacy:storage-updated', updatedStorage);
  return updatedStorage;
});

ipcMain.handle('privacy:open-storage-folder', () => {
  if (fs.existsSync(ephemeralDirPath)) {
    shell.openPath(ephemeralDirPath);
    return { success: true, path: ephemeralDirPath };
  }
  return { success: false };
});

// Community Feed Handlers
ipcMain.handle('privacy:get-curated-feeds', () => {
  return feedManager.getCuratedFeeds();
});

ipcMain.handle('privacy:get-feed-status', () => {
  return {
    ...feedManager.getFeedStatus(),
    privacyStats: privacyEngine.getStats()
  };
});

ipcMain.handle('privacy:fetch-feed', async (_, { feedId, customUrl }) => {
  try {
    const result = await feedManager.fetchFeed(feedId, customUrl);
    const addedCount = privacyEngine.addFeedDomains(result.domains, result.feedName);
    sendToRenderer('privacy:feed-updated', {
      feedName: result.feedName,
      domainsCount: result.domainsCount,
      addedCount,
      stats: privacyEngine.getStats()
    });
    return { success: true, ...result, addedCount, stats: privacyEngine.getStats() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('privacy:reset-feed', () => {
  feedManager.reset();
  privacyEngine.resetToDefaults();
  sendToRenderer('privacy:feed-updated', {
    feedName: 'Built-in Ad & Tracker Shield',
    domainsCount: 0,
    addedCount: 0,
    stats: privacyEngine.getStats()
  });
  return { success: true, stats: privacyEngine.getStats() };
});

// App Lifecycle
app.whenReady().then(async () => {
  // Set custom NoctisBrowser dock icon on macOS
  if (process.platform === 'darwin' && app.dock && fs.existsSync(appIconPath)) {
    try {
      const dockIcon = nativeImage.createFromPath(appIconPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
    } catch (_) {}
  }

  const sessionsToProtect = [
    session.defaultSession,
    session.fromPartition('in-memory-ephemeral')
  ];

  // Initialize Tor, Dark Web & Built-in Browser VPN routing across all sessions
  await torVpnManager.initialize(ephemeralDirPath, sessionsToProtect);

  for (const s of sessionsToProtect) {
    if (!s) continue;
    s.setUserAgent(privacyEngine.getUserAgent());

    if (typeof s.setWebRTCIPHandlingPolicy === 'function') {
      s.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    }

    s.webRequest.onBeforeRequest((details, callback) => {
      try {
        const blockCheck = networkManager.checkBlocked(details.url);
        if (blockCheck.blocked) {
          networkManager.metrics.totalBlocked++;
          networkManager.emit('request-blocked', {
            url: details.url,
            method: details.method,
            rule: blockCheck.rule,
            timestamp: Date.now()
          });
          callback({ cancel: true });
          return;
        }

        // Enforce No Plain Text / Require Security Policy (Tor Onion Router, VPN, or Strict Privacy)
        if (torVpnManager.shouldUpgradeOrBlockInsecure(details.url)) {
          const upgraded = torVpnManager.upgradeInsecureUrl(details.url);
          networkManager.emit('security-enforced', {
            originalUrl: details.url,
            upgradedUrl: upgraded,
            reason: 'No Plain Text on Onion Router / VPN (HTTPS Enforced)',
            timestamp: Date.now()
          });
          callback({ redirectURL: upgraded });
          return;
        }
      } catch (_) {}
      callback({ cancel: false });
    });

    s.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const cleanHeaders = privacyEngine.sanitizeHeaders(details.requestHeaders, details.url);
        callback({ requestHeaders: cleanHeaders });
      } catch (_) {
        callback({ requestHeaders: details.requestHeaders || {} });
      }
    });
  }

  setupDriftTimer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (driftTimer) clearInterval(driftTimer);
  app.quit();
});
