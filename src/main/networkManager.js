const { EventEmitter } = require('events');
const { URL } = require('url');
const privacyEngine = require('./privacyEngine');

class NetworkManager extends EventEmitter {
  constructor() {
    super();

    // Live state
    this.isGlobalPaused = false;
    this.attachedContents = new Map(); // webContentsId -> { webContents, tabId }
    this.requests = new Map();         // requestId -> RequestDetail
    this.pausedRequests = new Map();   // requestId -> PausedDetail
    this.urlToRequestId = new Map();   // helper mapping

    // Firewall & Blocking Rules (All ad networks, trackers, and feeds blocked by default)
    this.blockRules = [
      { id: 'rule-doubleclick', pattern: '*doubleclick.net*', enabled: true, hits: 0, label: 'Google DoubleClick Ads', category: 'ads' },
      { id: 'rule-google-ads', pattern: '*pagead2.googlesyndication.com*', enabled: true, hits: 0, label: 'Google AdSense Delivery', category: 'ads' },
      { id: 'rule-google-adservice', pattern: '*adservice.google.*', enabled: true, hits: 0, label: 'Google Ad Services', category: 'ads' },
      { id: 'rule-amazon-ads', pattern: '*amazon-adsystem.com*', enabled: true, hits: 0, label: 'Amazon Ad System', category: 'ads' },
      { id: 'rule-adnxs', pattern: '*adnxs.com*', enabled: true, hits: 0, label: 'AppNexus / Xandr Ads', category: 'ads' },
      { id: 'rule-criteo', pattern: '*criteo.com*', enabled: true, hits: 0, label: 'Criteo Retargeting', category: 'ads' },
      { id: 'rule-taboola', pattern: '*taboola.com*', enabled: true, hits: 0, label: 'Taboola Sponsored Feeds', category: 'feed' },
      { id: 'rule-outbrain', pattern: '*outbrain.com*', enabled: true, hits: 0, label: 'Outbrain Recommendation Feeds', category: 'feed' },
      { id: 'rule-revcontent', pattern: '*revcontent.com*', enabled: true, hits: 0, label: 'Revcontent Native Ad Feeds', category: 'feed' },
      { id: 'rule-yahoo-gemini', pattern: '*gemini.yahoo.com*', enabled: true, hits: 0, label: 'Yahoo Gemini Native Ads', category: 'feed' },
      { id: 'rule-analytics', pattern: '*google-analytics.com*', enabled: true, hits: 0, label: 'Google Analytics', category: 'analytics' },
      { id: 'rule-gtm', pattern: '*googletagmanager.com*', enabled: true, hits: 0, label: 'Google Tag Manager', category: 'analytics' },
      { id: 'rule-facebook-tr', pattern: '*facebook.com/tr*', enabled: true, hits: 0, label: 'Meta Pixel Tracker', category: 'tracker' },
      { id: 'rule-telemetry', pattern: '*telemetry*', enabled: true, hits: 0, label: 'Generic Telemetry', category: 'telemetry' },
      { id: 'rule-segment', pattern: '*segment.io*', enabled: true, hits: 0, label: 'Segment Analytics', category: 'analytics' },
      { id: 'rule-clarity', pattern: '*clarity.ms*', enabled: true, hits: 0, label: 'Microsoft Clarity', category: 'tracker' },
      { id: 'rule-hotjar', pattern: '*hotjar.com*', enabled: true, hits: 0, label: 'Hotjar Session Recording', category: 'tracker' }
    ];

    // Breakpoint Rules
    this.breakpoints = []; // { id, type: 'url'|'host'|'method', value, enabled: true }

    // Summary Metrics
    this.metrics = {
      totalRequests: 0,
      totalBytes: 0,
      totalBlocked: 0,
      totalPaused: 0,
      activeHosts: new Set()
    };
  }

  attach(webContents, tabId) {
    const wcId = webContents.id;
    if (this.attachedContents.has(wcId)) {
      return;
    }

    try {
      if (!webContents.debugger.isAttached()) {
        webContents.debugger.attach('1.3');
      }

      this.attachedContents.set(wcId, { webContents, tabId });

      // Enable CDP domains
      webContents.debugger.sendCommand('Network.enable', {
        maxPostDataSize: 10485760, // 10MB
        maxResourceBufferSize: 10485760
      }).catch(err => console.error('Failed to enable Network domain:', err));

      webContents.debugger.sendCommand('Fetch.enable', {
        patterns: [{ urlPattern: '*' }]
      }).catch(err => console.error('Failed to enable Fetch domain:', err));

      // Handle CDP messages
      webContents.debugger.on('message', (event, method, params) => {
        this.handleCDPMessage(wcId, tabId, method, params);
      });

      webContents.on('destroyed', () => {
        this.attachedContents.delete(wcId);
      });

    } catch (err) {
      console.error(`Failed to attach debugger to webContents ${wcId}:`, err);
    }
  }

  detach(webContentsId) {
    const entry = this.attachedContents.get(webContentsId);
    if (entry && entry.webContents && !entry.webContents.isDestroyed()) {
      try {
        if (entry.webContents.debugger.isAttached()) {
          entry.webContents.debugger.detach();
        }
      } catch (e) {
        // ignore detachment error
      }
    }
    this.attachedContents.delete(webContentsId);
  }

  handleCDPMessage(wcId, tabId, method, params) {
    switch (method) {
      case 'Fetch.requestPaused':
        this.handleFetchRequestPaused(wcId, tabId, params);
        break;

      case 'Network.requestWillBeSent':
        this.handleNetworkRequestWillBeSent(wcId, tabId, params);
        break;

      case 'Network.responseReceived':
        this.handleNetworkResponseReceived(wcId, tabId, params);
        break;

      case 'Network.loadingFinished':
        this.handleNetworkLoadingFinished(wcId, tabId, params);
        break;

      case 'Network.loadingFailed':
        this.handleNetworkLoadingFailed(wcId, tabId, params);
        break;

      default:
        break;
    }
  }

  // Check if URL matches any active block rule or tracker pattern
  checkBlocked(url) {
    // 1. User-configured custom block rules
    for (const rule of this.blockRules) {
      if (rule.enabled && this.matchesPattern(url, rule.pattern)) {
        rule.hits++;
        return { blocked: true, rule };
      }
    }

    // 2. Deny-by-default Tracker Shield
    const trackerCheck = privacyEngine.isTracker(url);
    if (trackerCheck.isTracker) {
      return {
        blocked: true,
        rule: {
          id: 'tracker-shield',
          pattern: trackerCheck.reason,
          label: trackerCheck.reason,
          hits: privacyEngine.blockedTrackersCount,
          isTrackerShield: true
        }
      };
    }

    return { blocked: false };
  }

  // Check if request matches any breakpoint rule
  checkBreakpoint(request) {
    if (this.isGlobalPaused) return true;
    for (const bp of this.breakpoints) {
      if (!bp.enabled) continue;
      if (bp.type === 'url' && request.url.toLowerCase().includes(bp.value.toLowerCase())) {
        return true;
      }
      if (bp.type === 'host') {
        try {
          const u = new URL(request.url);
          if (u.hostname.toLowerCase().includes(bp.value.toLowerCase())) return true;
        } catch (_) {}
      }
      if (bp.type === 'method' && request.method.toUpperCase() === bp.value.toUpperCase()) {
        return true;
      }
    }
    return false;
  }

  matchesPattern(string, pattern) {
    const regexStr = '^' + pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
    const regex = new RegExp(regexStr, 'i');
    return regex.test(string);
  }

  handleFetchRequestPaused(wcId, tabId, params) {
    const { requestId, request, resourceType, networkId } = params;
    const entry = this.attachedContents.get(wcId);
    if (!entry || !entry.webContents || entry.webContents.isDestroyed()) return;

    // 1. Check if blocked by rules
    const blockCheck = this.checkBlocked(request.url);
    if (blockCheck.blocked) {
      this.metrics.totalBlocked++;
      entry.webContents.debugger.sendCommand('Fetch.failRequest', {
        requestId,
        errorReason: 'BlockedByClient'
      }).catch(() => {});

      this.emit('request-blocked', {
        requestId,
        url: request.url,
        method: request.method,
        rule: blockCheck.rule,
        timestamp: Date.now()
      });
      return;
    }

    // 2. Check if should pause
    const shouldPause = this.checkBreakpoint(request);
    if (shouldPause) {
      this.metrics.totalPaused++;
      const pausedItem = {
        requestId,
        networkId,
        tabId,
        wcId,
        url: request.url,
        method: request.method,
        headers: request.headers || {},
        postData: request.postData ? (request.postData.length > 2048 ? request.postData.slice(0, 2048) + '... (truncated)' : request.postData) : null,
        hasPostData: !!request.hasPostData,
        resourceType: resourceType || 'Other',
        pausedAt: Date.now()
      };

      this.pausedRequests.set(requestId, pausedItem);

      this.emit('request-paused', pausedItem);
      return;
    }

    // 3. Otherwise, continue request seamlessly without mutating headers in CDP.
    // Native Chromium webRequest.onBeforeSendHeaders safely manages header sanitization without HTTP/2 collisions.
    entry.webContents.debugger.sendCommand('Fetch.continueRequest', {
      requestId
    }).catch(() => {});
  }

  handleNetworkRequestWillBeSent(wcId, tabId, params) {
    const { requestId, request, initiator, timestamp, wallTime, type } = params;
    this.metrics.totalRequests++;

    let destination = 'unknown';
    try {
      const u = new URL(request.url);
      destination = u.hostname;
      this.metrics.activeHosts.add(destination);
    } catch (_) {}

    // Identify Source / Initiator
    let source = 'Main Frame';
    if (initiator) {
      if (initiator.type === 'script') {
        if (initiator.stack && initiator.stack.callFrames && initiator.stack.callFrames.length > 0) {
          const topFrame = initiator.stack.callFrames[0];
          try {
            const u = new URL(topFrame.url);
            const pathParts = u.pathname.split('/');
            source = `${pathParts[pathParts.length - 1] || topFrame.url}:${topFrame.lineNumber}:${topFrame.columnNumber}`;
          } catch (_) {
            source = topFrame.url || 'Script';
          }
        } else {
          source = initiator.url || 'Script';
        }
      } else if (initiator.type === 'parser') {
        source = 'HTML Parser';
      } else if (initiator.type === 'other') {
        source = 'Document Loader';
      }
    }

    // Bound postData size to avoid bloating IPC serializer
    let safePostData = null;
    if (request.postData) {
      safePostData = request.postData.length > 2048 
        ? request.postData.slice(0, 2048) + '... (truncated)' 
        : request.postData;
    }

    const item = {
      requestId,
      tabId,
      url: request.url,
      method: request.method,
      requestHeaders: request.headers || {},
      postData: safePostData,
      resourceType: type || 'Other',
      source,
      destination,
      initiator: null, // Avoid passing recursive CDP V8 stack trace objects across IPC
      startTime: Date.now(),
      cdpTimestamp: timestamp,
      wallTime: wallTime ? wallTime * 1000 : Date.now(),
      status: null,
      statusText: '',
      responseHeaders: {},
      mimeType: '',
      remoteIPAddress: '',
      protocol: '',
      encodedDataLength: 0,
      duration: 0,
      timing: null,
      responseBody: null,
      hasBody: false,
      state: 'pending' // pending, completed, failed, blocked
    };

    // Cap total stored requests to prevent unbounded memory growth on media portals
    if (this.requests.size >= 500) {
      const oldestKey = this.requests.keys().next().value;
      if (oldestKey) this.requests.delete(oldestKey);
    }

    this.requests.set(requestId, item);
    this.emit('request-started', item);
  }

  handleNetworkResponseReceived(wcId, tabId, params) {
    const { requestId, response, type } = params;
    const item = this.requests.get(requestId);
    if (!item) return;

    item.status = response.status;
    item.statusText = response.statusText;
    item.responseHeaders = response.headers || {};
    item.mimeType = response.mimeType || '';
    item.remoteIPAddress = response.remoteIPAddress || '';
    item.protocol = response.protocol || '';
    item.timing = response.timing || null;
    if (type) item.resourceType = type;

    this.emit('response-received', {
      requestId,
      status: item.status,
      statusText: item.statusText,
      responseHeaders: item.responseHeaders,
      mimeType: item.mimeType,
      remoteIPAddress: item.remoteIPAddress,
      protocol: item.protocol
    });
  }

  handleNetworkLoadingFinished(wcId, tabId, params) {
    const { requestId, encodedDataLength, timestamp } = params;
    const item = this.requests.get(requestId);
    if (!item) return;

    item.state = 'completed';
    item.encodedDataLength = encodedDataLength || 0;
    this.metrics.totalBytes += item.encodedDataLength;

    if (item.cdpTimestamp && timestamp) {
      item.duration = Math.max(1, Math.round((timestamp - item.cdpTimestamp) * 1000));
    } else {
      item.duration = Math.max(1, Date.now() - item.startTime);
    }

    // Flag inspectable types as having a body available; retrieval is deferred on-demand
    // via getResponseBody(requestId) to eliminate CDP debugger promise storms on media portals
    const isInspectableType = ['Document', 'XHR', 'Fetch', 'Script', 'Stylesheet'].includes(item.resourceType);
    if (isInspectableType && item.encodedDataLength > 0) {
      item.hasBody = true;
    }

    this.emit('request-finished', {
      requestId,
      encodedDataLength: item.encodedDataLength,
      duration: item.duration,
      state: 'completed'
    });
  }

  handleNetworkLoadingFailed(wcId, tabId, params) {
    const { requestId, errorText, canceled, blockedReason } = params;
    const item = this.requests.get(requestId);
    if (!item) return;

    item.state = blockedReason ? 'blocked' : (canceled ? 'canceled' : 'failed');
    item.errorText = errorText || blockedReason || 'Failed';
    item.duration = Math.max(1, Date.now() - item.startTime);

    this.emit('request-failed', {
      requestId,
      errorText: item.errorText,
      state: item.state,
      duration: item.duration
    });
  }

  // --- Controls & Actions from UI ---

  resumeRequest(requestId, modifiedData = null) {
    const paused = this.pausedRequests.get(requestId);
    if (!paused) return false;

    const entry = this.attachedContents.get(paused.wcId);
    if (entry && entry.webContents && !entry.webContents.isDestroyed()) {
      const options = { requestId };
      if (modifiedData) {
        if (modifiedData.url) options.url = modifiedData.url;
        if (modifiedData.method) options.method = modifiedData.method;
        if (modifiedData.headers) {
          options.headers = Object.entries(modifiedData.headers).map(([name, value]) => ({ name, value: String(value) }));
        }
        if (modifiedData.postData !== undefined) {
          options.postData = Buffer.from(modifiedData.postData).toString('base64');
        }
      }
      entry.webContents.debugger.sendCommand('Fetch.continueRequest', options).catch(() => {});
    }

    this.pausedRequests.delete(requestId);
    this.emit('request-resumed', { requestId });
    return true;
  }

  blockPausedRequest(requestId) {
    const paused = this.pausedRequests.get(requestId);
    if (!paused) return false;

    const entry = this.attachedContents.get(paused.wcId);
    if (entry && entry.webContents && !entry.webContents.isDestroyed()) {
      entry.webContents.debugger.sendCommand('Fetch.failRequest', {
        requestId,
        errorReason: 'BlockedByClient'
      }).catch(() => {});
    }

    this.metrics.totalBlocked++;
    this.pausedRequests.delete(requestId);
    this.emit('request-blocked-manual', { requestId, url: paused.url });
    return true;
  }

  fulfillPausedRequest(requestId, responseCode = 200, responseHeaders = {}, responseBody = '') {
    const paused = this.pausedRequests.get(requestId);
    if (!paused) return false;

    const entry = this.attachedContents.get(paused.wcId);
    if (entry && entry.webContents && !entry.webContents.isDestroyed()) {
      const headerList = Object.entries(responseHeaders).map(([name, value]) => ({ name, value: String(value) }));
      entry.webContents.debugger.sendCommand('Fetch.fulfillRequest', {
        requestId,
        responseCode: Number(responseCode),
        responseHeaders: headerList,
        body: Buffer.from(responseBody).toString('base64')
      }).catch(() => {});
    }

    this.pausedRequests.delete(requestId);
    this.emit('request-fulfilled', { requestId, responseCode });
    return true;
  }

  resumeAllPaused() {
    for (const requestId of Array.from(this.pausedRequests.keys())) {
      this.resumeRequest(requestId);
    }
  }

  setGlobalPause(enabled) {
    this.isGlobalPaused = Boolean(enabled);
    this.emit('global-pause-changed', { isGlobalPaused: this.isGlobalPaused });
    return this.isGlobalPaused;
  }

  // Firewall Rule Management
  addBlockRule(pattern, label = '') {
    const rule = {
      id: 'rule-' + Date.now(),
      pattern: pattern.trim(),
      enabled: true,
      hits: 0,
      label: label.trim() || pattern.trim()
    };
    this.blockRules.push(rule);
    this.emit('rules-updated', this.getBlockRules());
    return rule;
  }

  toggleBlockRule(id, enabled) {
    const rule = this.blockRules.find(r => r.id === id);
    if (rule) {
      rule.enabled = enabled !== undefined ? Boolean(enabled) : !rule.enabled;
      this.emit('rules-updated', this.getBlockRules());
      return true;
    }
    return false;
  }

  removeBlockRule(id) {
    const idx = this.blockRules.findIndex(r => r.id === id);
    if (idx !== -1) {
      this.blockRules.splice(idx, 1);
      this.emit('rules-updated', this.getBlockRules());
      return true;
    }
    return false;
  }

  getBlockRules() {
    return this.blockRules.map(r => ({ ...r }));
  }

  // Breakpoints Management
  addBreakpoint(type, value) {
    const bp = {
      id: 'bp-' + Date.now(),
      type, // 'url', 'host', 'method'
      value: value.trim(),
      enabled: true
    };
    this.breakpoints.push(bp);
    this.emit('breakpoints-updated', this.breakpoints);
    return bp;
  }

  removeBreakpoint(id) {
    const idx = this.breakpoints.findIndex(b => b.id === id);
    if (idx !== -1) {
      this.breakpoints.splice(idx, 1);
      this.emit('breakpoints-updated', this.breakpoints);
      return true;
    }
    return false;
  }

  toggleBreakpoint(id, enabled) {
    const bp = this.breakpoints.find(b => b.id === id);
    if (bp) {
      bp.enabled = enabled !== undefined ? Boolean(enabled) : !bp.enabled;
      this.emit('breakpoints-updated', this.breakpoints);
      return true;
    }
    return false;
  }

  getBreakpoints() {
    return [...this.breakpoints];
  }

  // Inspection & Details
  getRequestDetails(requestId) {
    const req = this.requests.get(requestId);
    if (!req) return null;
    return { ...req };
  }

  async getResponseBody(requestId) {
    const req = this.requests.get(requestId);
    if (!req) return null;
    if (req.responseBody) return req.responseBody;

    // If not cached, attempt to query CDP on-demand for the inspector
    if (req.tabId) {
      for (const [wcId, entry] of this.attachedContents.entries()) {
        if (entry.tabId === req.tabId && entry.webContents && !entry.webContents.isDestroyed()) {
          try {
            const result = await entry.webContents.debugger.sendCommand('Network.getResponseBody', { requestId });
            if (result && result.body) {
              const bodyStr = result.body.length > 65536 ? result.body.slice(0, 65536) + '\n... (truncated for performance)' : result.body;
              req.responseBody = {
                body: bodyStr,
                base64Encoded: !!result.base64Encoded
              };
              req.hasBody = true;
              return req.responseBody;
            }
          } catch (_) {}
        }
      }
    }
    return null;
  }

  getPausedRequest(requestId) {
    return this.pausedRequests.get(requestId) || null;
  }

  clearHistory() {
    this.requests.clear();
    this.metrics.totalRequests = 0;
    this.metrics.totalBytes = 0;
    this.metrics.totalBlocked = 0;
    this.metrics.totalPaused = 0;
    this.metrics.activeHosts.clear();
    this.emit('history-cleared');
  }

  getSnapshot() {
    // Strip response bodies and large headers from periodic overview snapshot
    const safeRecentRequests = Array.from(this.requests.values()).slice(-200).map(r => ({
      requestId: r.requestId,
      tabId: r.tabId,
      url: r.url,
      method: r.method,
      resourceType: r.resourceType,
      source: r.source,
      destination: r.destination,
      startTime: r.startTime,
      status: r.status,
      statusText: r.statusText,
      mimeType: r.mimeType,
      encodedDataLength: r.encodedDataLength,
      duration: r.duration,
      state: r.state,
      hasBody: !!r.responseBody
    }));

    return {
      isGlobalPaused: this.isGlobalPaused,
      metrics: {
        totalRequests: this.metrics.totalRequests,
        totalBytes: this.metrics.totalBytes,
        totalBlocked: this.metrics.totalBlocked,
        totalPaused: this.metrics.totalPaused,
        activeHostsCount: this.metrics.activeHosts.size
      },
      blockRules: this.getBlockRules(),
      breakpoints: this.getBreakpoints(),
      privacyStats: privacyEngine.getStats(),
      pausedCount: this.pausedRequests.size,
      pausedRequests: Array.from(this.pausedRequests.values()),
      recentRequests: safeRecentRequests
    };
  }

  // Export to standard HAR format
  exportHAR() {
    const entries = Array.from(this.requests.values()).map(req => {
      const headers = Object.entries(req.requestHeaders || {}).map(([name, value]) => ({ name, value: String(value) }));
      const responseHeaders = Object.entries(req.responseHeaders || {}).map(([name, value]) => ({ name, value: String(value) }));

      return {
        startedDateTime: new Date(req.wallTime || req.startTime).toISOString(),
        time: req.duration || 0,
        request: {
          method: req.method,
          url: req.url,
          httpVersion: req.protocol || 'HTTP/1.1',
          cookies: [],
          headers,
          queryString: [],
          postData: req.postData ? { mimeType: 'application/json', text: req.postData } : undefined,
          headersSize: -1,
          bodySize: req.postData ? Buffer.byteLength(req.postData) : 0
        },
        response: {
          status: req.status || 0,
          statusText: req.statusText || '',
          httpVersion: req.protocol || 'HTTP/1.1',
          cookies: [],
          headers: responseHeaders,
          content: {
            size: req.encodedDataLength || 0,
            mimeType: req.mimeType || 'application/octet-stream',
            text: req.responseBody ? req.responseBody.body : ''
          },
          redirectURL: '',
          headersSize: -1,
          bodySize: req.encodedDataLength || 0
        },
        cache: {},
        timings: {
          send: 0,
          wait: req.timing ? req.timing.receiveHeadersEnd - req.timing.sendEnd : 0,
          receive: req.duration || 0
        },
        serverIPAddress: req.remoteIPAddress || ''
      };
    });

    return {
      log: {
        version: '1.2',
        creator: { name: 'NoctisBrowser', version: '1.1.0' },
        pages: [],
        entries
      }
    };
  }
}

module.exports = NetworkManager;
