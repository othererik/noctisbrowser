const { contextBridge, ipcRenderer } = require('electron');

const browserApi = {
  // --- Tab Management ---
  createTab: (url, title) => ipcRenderer.invoke('tabs:create', { url, title }),
  createSpecialTab: (type) => ipcRenderer.invoke('tabs:create-special', { type }),
  closeTab: (tabId) => ipcRenderer.invoke('tabs:close', { tabId }),
  setActiveTab: (tabId) => ipcRenderer.invoke('tabs:set-active', { tabId }),
  updateTab: (tabId, updates) => ipcRenderer.invoke('tabs:update', { tabId, updates }),
  getAllTabs: () => ipcRenderer.invoke('tabs:get-all'),
  attachWebview: (webContentsId, tabId) => ipcRenderer.invoke('network:attach-webview', { webContentsId, tabId }),

  // --- Network Interception & Controls ---
  setGlobalPause: (enabled) => ipcRenderer.invoke('network:set-global-pause', { enabled }),
  resumeRequest: (requestId, modifiedData) => ipcRenderer.invoke('network:resume-request', { requestId, modifiedData }),
  blockPausedRequest: (requestId) => ipcRenderer.invoke('network:block-paused-request', { requestId }),
  fulfillPausedRequest: (requestId, code, headers, body) => ipcRenderer.invoke('network:fulfill-paused-request', { requestId, code, headers, body }),
  resumeAllPaused: () => ipcRenderer.invoke('network:resume-all-paused'),

  // --- Blocklist & Firewall ---
  addBlockRule: (pattern, label) => ipcRenderer.invoke('network:add-block-rule', { pattern, label }),
  toggleBlockRule: (id, enabled) => ipcRenderer.invoke('network:toggle-block-rule', { id, enabled }),
  removeBlockRule: (id) => ipcRenderer.invoke('network:remove-block-rule', { id }),
  getBlockRules: () => ipcRenderer.invoke('network:get-block-rules'),

  // --- Privacy, Ads & Feed Blocklist ---
  getPrivacyStats: () => ipcRenderer.invoke('privacy:get-stats'),
  toggleDenyTrackers: (enabled) => ipcRenderer.invoke('privacy:toggle-deny-trackers', { enabled }),
  getShieldPath: () => ipcRenderer.invoke('privacy:get-shield-path'),
  getShieldPathSync: () => ipcRenderer.sendSync('privacy:get-shield-path-sync'),
  getCuratedFeeds: () => ipcRenderer.invoke('privacy:get-curated-feeds'),
  getFeedStatus: () => ipcRenderer.invoke('privacy:get-feed-status'),
  fetchFeed: (feedId, customUrl) => ipcRenderer.invoke('privacy:fetch-feed', { feedId, customUrl }),
  unloadFeed: () => ipcRenderer.invoke('privacy:unload-feed'),
  resetFeed: () => ipcRenderer.invoke('privacy:reset-feed'),
  toggleCommunityFeeds: (enabled) => ipcRenderer.invoke('privacy:toggle-community-feeds', { enabled }),
  onFeedUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('privacy:feed-updated', handler);
    return () => ipcRenderer.removeListener('privacy:feed-updated', handler);
  },

  // --- Paranoid Fingerprint & Dynamic Runtime Profile ---
  getFingerprintProfile: () => ipcRenderer.invoke('privacy:get-profile'),
  getFingerprintPresets: () => ipcRenderer.invoke('privacy:get-presets'),
  updateFingerprintProfile: (updates) => ipcRenderer.invoke('privacy:update-profile', { updates }),
  rerollFingerprintProfile: (presetKey) => ipcRenderer.invoke('privacy:reroll-profile', { presetKey }),
  driftFingerprintProfile: () => ipcRenderer.invoke('privacy:drift-profile'),
  setRuntimeDrift: (enabled, intervalSec) => ipcRenderer.invoke('privacy:set-runtime-drift', { enabled, intervalSec }),
  burnIdentityNow: () => ipcRenderer.invoke('privacy:burn-identity'),
  onFingerprintProfileUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('privacy:profile-updated', handler);
    return () => ipcRenderer.removeListener('privacy:profile-updated', handler);
  },
  onIdentityBurned: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('privacy:identity-burned', handler);
    return () => ipcRenderer.removeListener('privacy:identity-burned', handler);
  },

  // --- Tor, Dark Web Protocols & Browser VPN ---
  getTorVpnStatus: () => ipcRenderer.invoke('torvpn:get-status'),
  updateTorVpnConfig: (updates) => ipcRenderer.invoke('torvpn:update-config', { updates }),
  rotateTorVpnCircuit: () => ipcRenderer.invoke('torvpn:rotate-circuit'),
  probeLocalDaemons: () => ipcRenderer.invoke('torvpn:probe-daemons'),
  startManagedTor: () => ipcRenderer.invoke('torvpn:start-tor'),
  downloadTorDaemon: () => ipcRenderer.invoke('torvpn:download-tor'),
  resolveProtocolUrl: (input) => ipcRenderer.invoke('torvpn:resolve-url', { input }),
  getVpnRelays: () => ipcRenderer.invoke('torvpn:get-relays'),
  getDarkWebDirectory: () => ipcRenderer.invoke('torvpn:get-directory'),
  testRoutingPath: (targetUrl) => ipcRenderer.invoke('torvpn:test-routing-path', { targetUrl }),
  onTorVpnStatusUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('torvpn:status-updated', handler);
    return () => ipcRenderer.removeListener('torvpn:status-updated', handler);
  },
  onTorDownloadProgress: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('torvpn:download-progress', handler);
    return () => ipcRenderer.removeListener('torvpn:download-progress', handler);
  },

  // --- Transparent Ephemeral Storage Inspector ---
  getStorageInfo: () => ipcRenderer.invoke('privacy:get-storage-info'),
  purgeEphemeralStorage: () => ipcRenderer.invoke('privacy:purge-storage'),
  openStorageFolder: () => ipcRenderer.invoke('privacy:open-storage-folder'),
  onStorageUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('privacy:storage-updated', handler);
    return () => ipcRenderer.removeListener('privacy:storage-updated', handler);
  },

  // --- Breakpoints ---
  addBreakpoint: (type, value) => ipcRenderer.invoke('network:add-breakpoint', { type, value }),
  toggleBreakpoint: (id, enabled) => ipcRenderer.invoke('network:toggle-breakpoint', { id, enabled }),
  removeBreakpoint: (id) => ipcRenderer.invoke('network:remove-breakpoint', { id }),
  getBreakpoints: () => ipcRenderer.invoke('network:get-breakpoints'),

  // --- Inspection & Export ---
  getRequestDetails: (requestId) => ipcRenderer.invoke('network:get-request-details', { requestId }),
  getResponseBody: (requestId) => ipcRenderer.invoke('network:get-response-body', { requestId }),
  clearHistory: () => ipcRenderer.invoke('network:clear-history'),
  getSnapshot: () => ipcRenderer.invoke('network:get-snapshot'),
  exportHAR: () => ipcRenderer.invoke('network:export-har'),
  saveHARFile: () => ipcRenderer.invoke('network:save-har-file'),

  // --- Real-Time Stream Listeners ---
  onRequestStarted: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:request-started', handler);
    return () => ipcRenderer.removeListener('network:request-started', handler);
  },
  onResponseReceived: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:response-received', handler);
    return () => ipcRenderer.removeListener('network:response-received', handler);
  },
  onRequestFinished: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:request-finished', handler);
    return () => ipcRenderer.removeListener('network:request-finished', handler);
  },
  onRequestFailed: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:request-failed', handler);
    return () => ipcRenderer.removeListener('network:request-failed', handler);
  },
  onRequestPaused: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:request-paused', handler);
    return () => ipcRenderer.removeListener('network:request-paused', handler);
  },
  onRequestBlocked: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:request-blocked', handler);
    return () => ipcRenderer.removeListener('network:request-blocked', handler);
  },
  onRequestResumed: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:request-resumed', handler);
    return () => ipcRenderer.removeListener('network:request-resumed', handler);
  },
  onResponseBodyReady: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:response-body-ready', handler);
    return () => ipcRenderer.removeListener('network:response-body-ready', handler);
  },
  onGlobalPauseChanged: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:global-pause-changed', handler);
    return () => ipcRenderer.removeListener('network:global-pause-changed', handler);
  },
  onRulesUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:rules-updated', handler);
    return () => ipcRenderer.removeListener('network:rules-updated', handler);
  },
  onBreakpointsUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:breakpoints-updated', handler);
    return () => ipcRenderer.removeListener('network:breakpoints-updated', handler);
  },
  onHistoryCleared: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('network:history-cleared', handler);
    return () => ipcRenderer.removeListener('network:history-cleared', handler);
  },

  // --- Tab Event Listeners ---
  onTabCreated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('tab:created', handler);
    return () => ipcRenderer.removeListener('tab:created', handler);
  },
  onTabClosed: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('tab:closed', handler);
    return () => ipcRenderer.removeListener('tab:closed', handler);
  },
  onActiveTabChanged: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('tab:active-changed', handler);
    return () => ipcRenderer.removeListener('tab:active-changed', handler);
  },
  onTabUpdated: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('tab:updated', handler);
    return () => ipcRenderer.removeListener('tab:updated', handler);
  },
  onOpenNewTab: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('browser:open-new-tab', handler);
    return () => ipcRenderer.removeListener('browser:open-new-tab', handler);
  },
  getPlatform: () => process.platform,
  onShortcutNewTab: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('browser:shortcut-new-tab', handler);
    return () => ipcRenderer.removeListener('browser:shortcut-new-tab', handler);
  }
};

// Expose both window.noctis (primary brand) and window.netscope (compatibility alias)
contextBridge.exposeInMainWorld('noctis', browserApi);
contextBridge.exposeInMainWorld('netscope', browserApi);
