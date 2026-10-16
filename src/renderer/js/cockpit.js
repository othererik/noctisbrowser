// --- Network Cockpit Controller ---

class NetworkCockpit {
  constructor() {
    this.requests = new Map();
    this.pausedRequests = new Map();
    this.destinations = new Map(); // host -> { domain, count, bytes, requests: [] }
    this.sources = new Map();      // source -> { source, count, requests: [] }
    this.rules = [];

    this.activeSubView = 'stream';
    this.activeTypeFilter = 'ALL';
    this.searchQuery = '';
    this.selectedRequestId = null;
    this.isPaused = false;

    this.initElements();
    this.bindEvents();
    this.listenToIPC();
    this.loadInitialSnapshot();
  }

  initElements() {
    // Toolbar & Ticker
    this.metricReqsEl = document.getElementById('metric-reqs');
    this.metricBytesEl = document.getElementById('metric-bytes');
    this.metricBlockedEl = document.getElementById('metric-blocked');
    this.metricPausedEl = document.getElementById('metric-paused');
    this.btnPauseGlobal = document.getElementById('btn-pause-traffic');
    this.btnToggleCockpit = document.getElementById('btn-toggle-cockpit');
    this.cockpitEl = document.getElementById('network-cockpit');

    // Cockpit Navigation & Filter
    this.filterInput = document.getElementById('cockpit-filter-input');
    this.typeChips = document.querySelectorAll('.type-chip');
    this.tabButtons = document.querySelectorAll('.cockpit-tab-btn');
    this.views = {
      stream: document.getElementById('view-stream'),
      destinations: document.getElementById('view-destinations'),
      sources: document.getElementById('view-sources'),
      intercept: document.getElementById('view-intercept'),
      firewall: document.getElementById('view-firewall'),
      routing: document.getElementById('view-routing')
    };

    // Sub-view Containers
    this.streamTableBody = document.getElementById('stream-table-body');
    this.destinationsList = document.getElementById('destinations-list');
    this.sourcesList = document.getElementById('sources-list');
    this.interceptList = document.getElementById('intercept-list');
    this.firewallRulesList = document.getElementById('firewall-rules-list');
    this.pausedBadge = document.getElementById('paused-tab-badge');

    // Controls
    this.btnClear = document.getElementById('btn-cockpit-clear');
    this.btnExportHar = document.getElementById('btn-cockpit-har');
    this.btnResumeAll = document.getElementById('btn-resume-all-paused');
    this.inputAddRule = document.getElementById('input-add-rule');
    this.btnAddRule = document.getElementById('btn-add-rule');
    this.toggleDenyTrackers = document.getElementById('toggle-deny-trackers');
    this.shieldStatusText = document.getElementById('shield-status-text');
    this.shieldBlockedCount = document.getElementById('shield-blocked-count');

    // Opt-in Feed Elements
    this.selectBlocklistFeed = document.getElementById('select-blocklist-feed');
    this.inputCustomFeedUrl = document.getElementById('input-custom-feed-url');
    this.btnFetchFeed = document.getElementById('btn-fetch-feed');
    this.btnFetchText = document.getElementById('btn-fetch-text');
    this.btnResetFeed = document.getElementById('btn-reset-feed');
    this.feedFeedbackMsg = document.getElementById('feed-feedback-msg');
    this.feedActiveName = document.getElementById('feed-active-name');
    this.feedDomainsCount = document.getElementById('feed-domains-count');
    this.feedActiveBadge = document.getElementById('feed-active-badge');

    // Inspector Drawer
    this.inspectorDrawer = document.getElementById('inspector-drawer');
    this.btnCloseInspector = document.getElementById('btn-close-inspector');
    this.inspectorSummary = document.getElementById('inspector-summary');
    this.inspectorTabBtns = document.querySelectorAll('.inspector-tab-btn');
    this.inspectorTabs = {
      headers: document.getElementById('inspector-tab-headers'),
      payload: document.getElementById('inspector-tab-payload'),
      response: document.getElementById('inspector-tab-response'),
      timing: document.getElementById('inspector-tab-timing')
    };
  }

  bindEvents() {
    // Global pause toggle
    this.btnPauseGlobal.addEventListener('click', async () => {
      this.isPaused = !this.isPaused;
      await window.netscope.setGlobalPause(this.isPaused);
      this.updatePauseButtonUI();
    });

    // Toggle Cockpit Drawer
    this.btnToggleCockpit.addEventListener('click', () => {
      this.cockpitEl.classList.toggle('collapsed');
      const isOpen = !this.cockpitEl.classList.contains('collapsed');
      this.btnToggleCockpit.classList.toggle('open', isOpen);
    });

    // Sub-view switcher
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewName = btn.dataset.view;
        this.switchSubView(viewName);
      });
    });

    // Type filter chips
    this.typeChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.typeChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeTypeFilter = chip.dataset.type;
        this.applyFilters();
      });
    });

    // Search filter
    this.filterInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.applyFilters();
    });

    // Clear history
    this.btnClear.addEventListener('click', async () => {
      await window.netscope.clearHistory();
      this.clearLocalData();
    });

    // Export HAR
    this.btnExportHar.addEventListener('click', async () => {
      await window.netscope.saveHARFile();
    });

    // Resume all paused
    this.btnResumeAll.addEventListener('click', async () => {
      await window.netscope.resumeAllPaused();
    });

    // Add Firewall Rule
    this.btnAddRule.addEventListener('click', () => this.handleAddNewRule());
    this.inputAddRule.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleAddNewRule();
    });

    // Toggle Deny-by-default Tracker Shield
    if (this.toggleDenyTrackers) {
      this.toggleDenyTrackers.addEventListener('change', async (e) => {
        const stats = await window.netscope.toggleDenyTrackers(e.target.checked);
        this.updatePrivacyUI(stats);
      });
    }

    // Feed Selector dropdown change
    if (this.selectBlocklistFeed && this.inputCustomFeedUrl) {
      this.selectBlocklistFeed.addEventListener('change', () => {
        this.inputCustomFeedUrl.style.display = this.selectBlocklistFeed.value === 'custom' ? 'block' : 'none';
      });
    }

    // Trigger Opt-in Feed Download & Update
    if (this.btnFetchFeed) {
      this.btnFetchFeed.addEventListener('click', () => this.handleFetchFeed());
    }

    // Reset Feed to Defaults
    if (this.btnResetFeed) {
      this.btnResetFeed.addEventListener('click', () => this.handleResetFeed());
    }

    // Data Path & Routing View Controls
    const btnCockpitTestPath = document.getElementById('btn-cockpit-test-path');
    const inputCockpitTestUrl = document.getElementById('cockpit-test-url');
    const btnOpenMatrix = document.getElementById('btn-cockpit-open-matrix');

    if (btnCockpitTestPath) {
      btnCockpitTestPath.addEventListener('click', () => {
        const url = (inputCockpitTestUrl ? inputCockpitTestUrl.value : '') || 'https://example.com';
        this.testCockpitRoutingPath(url);
      });
    }

    if (inputCockpitTestUrl) {
      inputCockpitTestUrl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const url = inputCockpitTestUrl.value || 'https://example.com';
          this.testCockpitRoutingPath(url);
        }
      });
    }

    if (btnOpenMatrix) {
      btnOpenMatrix.addEventListener('click', () => {
        if (window.browserApp && window.browserApp.openMatrixTab) {
          window.browserApp.openMatrixTab();
        }
      });
    }

    // Inspector close button
    this.btnCloseInspector.addEventListener('click', () => {
      this.closeInspector();
    });

    // Inspector tab switcher
    this.inspectorTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.inspectorTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tabKey = btn.dataset.itab;
        Object.keys(this.inspectorTabs).forEach(k => {
          this.inspectorTabs[k].style.display = (k === tabKey) ? 'block' : 'none';
        });
      });
    });
  }

  listenToIPC() {
    window.netscope.onRequestStarted(req => this.handleRequestStarted(req));
    window.netscope.onResponseReceived(res => this.handleResponseReceived(res));
    window.netscope.onRequestFinished(fin => this.handleRequestFinished(fin));
    window.netscope.onRequestFailed(fail => this.handleRequestFailed(fail));
    window.netscope.onRequestPaused(paused => this.handleRequestPaused(paused));
    window.netscope.onRequestBlocked(blocked => this.handleRequestBlocked(blocked));
    window.netscope.onRequestResumed(res => this.handleRequestResumed(res));
    window.netscope.onResponseBodyReady(data => this.handleResponseBodyReady(data));
    window.netscope.onGlobalPauseChanged(data => {
      this.isPaused = data.isGlobalPaused;
      this.updatePauseButtonUI();
    });
    window.netscope.onRulesUpdated(rules => {
      this.rules = rules;
      this.renderFirewallRules();
    });
    if (window.netscope.onFeedUpdated) {
      window.netscope.onFeedUpdated(data => this.handleFeedUpdated(data));
    }
    if (window.netscope.onTorVpnStatusUpdated) {
      window.netscope.onTorVpnStatusUpdated(status => this.updateCockpitRoutingUI(status));
    }
    window.netscope.onHistoryCleared(() => {
      this.clearLocalData();
    });
  }

  async loadInitialSnapshot() {
    const snapshot = await window.netscope.getSnapshot();
    if (!snapshot) return;

    this.isPaused = snapshot.isGlobalPaused;
    this.updatePauseButtonUI();
    this.rules = snapshot.blockRules || [];
    this.renderFirewallRules();

    if (snapshot.privacyStats) {
      this.updatePrivacyUI(snapshot.privacyStats);
    }

    this.refreshCockpitRoutingStatus();

    if (snapshot.recentRequests) {
      snapshot.recentRequests.forEach(req => this.handleRequestStarted(req));
    }
    if (snapshot.pausedRequests) {
      snapshot.pausedRequests.forEach(p => this.handleRequestPaused(p));
    }
  }

  async refreshCockpitRoutingStatus() {
    const api = window.noctis || window.netscope;
    if (!api || !api.getTorVpnStatus) return;
    try {
      const status = await api.getTorVpnStatus();
      this.updateCockpitRoutingUI(status);
    } catch (_) {}
  }

  updateCockpitRoutingUI(status) {
    if (!status) return;
    const modeEl = document.getElementById('cockpit-route-mode');
    const relayEl = document.getElementById('cockpit-route-relay');
    const dnssecEl = document.getElementById('cockpit-route-dnssec');
    const httpsEl = document.getElementById('cockpit-route-https');
    const exitIpEl = document.getElementById('cockpit-route-exit-ip');

    if (modeEl) modeEl.textContent = status.modeLabel || status.mode.toUpperCase();
    if (relayEl) {
      if (status.mode === 'built-in-vpn' && status.relayDetails) {
        relayEl.textContent = status.relayDetails.name;
      } else if (status.mode === 'tor') {
        relayEl.textContent = status.daemons && status.daemons.torSocksPort
          ? `Tor SOCKS5 (:${status.daemons.torSocksPort})`
          : 'Tor Hybrid Bridge';
      } else {
        relayEl.textContent = 'Direct Clearnet Socket';
      }
    }
    if (dnssecEl) {
      dnssecEl.textContent = status.dnsOverHttps
        ? (status.forceDnssec ? 'DoH + DNSSEC (Strict)' : 'DoH (Active)')
        : 'Disabled (System DNS)';
    }
    if (httpsEl) {
      httpsEl.textContent = status.requireSecureTraffic ? 'Enforced (No Plaintext)' : 'Permissive';
    }
    if (exitIpEl) {
      exitIpEl.textContent = status.maskedIp ? status.maskedIp : 'Protected';
    }
  }

  async testCockpitRoutingPath(targetUrl) {
    const api = window.noctis || window.netscope;
    if (!api || !api.testRoutingPath) return;

    const btn = document.getElementById('btn-cockpit-test-path');
    const display = document.getElementById('cockpit-hops-display');
    if (btn) {
      btn.textContent = '...';
      btn.disabled = true;
    }

    try {
      const diag = await api.testRoutingPath(targetUrl);
      if (display && diag && diag.hops) {
        display.innerHTML = '';
        diag.hops.forEach(hop => {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.justifyContent = 'space-between';
          row.style.padding = '4px 6px';
          row.style.background = 'rgba(255, 255, 255, 0.03)';
          row.style.borderRadius = '4px';
          row.style.fontSize = '10.5px';
          row.style.fontFamily = 'var(--font-mono)';

          const left = document.createElement('div');
          left.style.display = 'flex';
          left.style.gap = '6px';
          left.style.alignItems = 'center';
          left.innerHTML = `<span style="color: var(--accent-cyan); font-weight: 700;">${hop.hopNumber}.</span> <span>${hop.name}</span>`;

          const right = document.createElement('div');
          right.style.display = 'flex';
          right.style.gap = '6px';
          right.style.alignItems = 'center';
          const isOk = hop.status === 'VERIFIED';
          right.innerHTML = `
            <span style="color: ${isOk ? 'var(--accent-green)' : 'var(--accent-amber)'}; font-weight: 600;">${hop.status}</span>
            <span style="color: var(--text-dim);">${hop.latencyMs}ms</span>
          `;

          row.appendChild(left);
          row.appendChild(right);
          display.appendChild(row);
        });
      }
    } catch (err) {
      console.error('Cockpit routing test failed:', err);
    } finally {
      if (btn) {
        btn.textContent = 'Test';
        btn.disabled = false;
      }
    }
  }

  updatePauseButtonUI() {
    if (this.isPaused) {
      this.btnPauseGlobal.classList.add('active');
      this.btnPauseGlobal.innerHTML = `<span>▶</span> Resume Traffic`;
    } else {
      this.btnPauseGlobal.classList.remove('active');
      this.btnPauseGlobal.innerHTML = `<span>⏸</span> Pause Traffic`;
    }
  }

  switchSubView(viewName) {
    this.activeSubView = viewName;
    this.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    Object.keys(this.views).forEach(key => {
      this.views[key].classList.toggle('active', key === viewName);
    });

    if (viewName === 'destinations') this.renderDestinationsView();
    if (viewName === 'sources') this.renderSourcesView();
    if (viewName === 'intercept') this.renderInterceptView();
  }

  handleRequestStarted(req) {
    this.requests.set(req.requestId, req);
    this.updateMetrics();

    // Grouping by Destination
    const host = req.destination || 'other';
    if (!this.destinations.has(host)) {
      this.destinations.set(host, { domain: host, count: 0, bytes: 0, requests: [] });
    }
    const dGroup = this.destinations.get(host);
    dGroup.count++;
    dGroup.requests.push(req);

    // Grouping by Source
    const src = req.source || 'Main Frame';
    if (!this.sources.has(src)) {
      this.sources.set(src, { source: src, count: 0, requests: [] });
    }
    const sGroup = this.sources.get(src);
    sGroup.count++;
    sGroup.requests.push(req);

    // Add to Live Stream Table
    this.renderStreamRow(req);

    // Refresh active tree view if open
    if (this.activeSubView === 'destinations') this.renderDestinationsView();
    if (this.activeSubView === 'sources') this.renderSourcesView();
  }

  handleResponseReceived(res) {
    const req = this.requests.get(res.requestId);
    if (!req) return;
    Object.assign(req, res);
    this.updateStreamRow(req);
    if (this.selectedRequestId === req.requestId) this.renderInspectorDetails(req);
  }

  handleRequestFinished(fin) {
    const req = this.requests.get(fin.requestId);
    if (!req) return;
    Object.assign(req, fin);

    // Update destination byte counts
    const dGroup = this.destinations.get(req.destination);
    if (dGroup) dGroup.bytes += fin.encodedDataLength || 0;

    this.updateMetrics();
    this.updateStreamRow(req);
    if (this.selectedRequestId === req.requestId) this.renderInspectorDetails(req);
  }

  handleRequestFailed(fail) {
    const req = this.requests.get(fail.requestId);
    if (!req) return;
    Object.assign(req, fail);
    this.updateStreamRow(req);
    if (this.selectedRequestId === req.requestId) this.renderInspectorDetails(req);
  }

  handleRequestPaused(paused) {
    this.pausedRequests.set(paused.requestId, paused);
    this.updateMetrics();
    this.renderInterceptView();

    // Visual badge pulse
    const count = this.pausedRequests.size;
    this.pausedBadge.textContent = count;
    const tabBtn = document.querySelector('[data-view="intercept"]');
    if (tabBtn) tabBtn.classList.toggle('has-paused', count > 0);

    // If global pause is ON and this is the first paused item, auto-switch to Intercept tab
    if (count === 1 && this.activeSubView !== 'intercept') {
      this.switchSubView('intercept');
    }
  }

  handleRequestResumed({ requestId }) {
    this.pausedRequests.delete(requestId);
    this.updateMetrics();
    this.renderInterceptView();

    const count = this.pausedRequests.size;
    this.pausedBadge.textContent = count;
    const tabBtn = document.querySelector('[data-view="intercept"]');
    if (tabBtn) tabBtn.classList.toggle('has-paused', count > 0);
  }

  handleRequestBlocked(blocked) {
    this.updateMetrics();
    const req = this.requests.get(blocked.requestId);
    if (req) {
      req.state = 'blocked';
      req.status = 'BLKD';
      this.updateStreamRow(req);
    }
  }

  handleResponseBodyReady({ requestId }) {
    if (this.selectedRequestId === requestId) {
      const req = this.requests.get(requestId);
      if (req) this.renderInspectorDetails(req);
    }
  }

  updateMetrics() {
    this.metricReqsEl.textContent = this.requests.size;

    let totalBytes = 0;
    let blockedCount = 0;
    for (const req of this.requests.values()) {
      totalBytes += req.encodedDataLength || 0;
      if (req.state === 'blocked') blockedCount++;
    }

    this.metricBytesEl.textContent = formatBytes(totalBytes);
    this.metricBlockedEl.textContent = blockedCount;
    this.metricPausedEl.textContent = this.pausedRequests.size;

    if (window.netscope && window.netscope.getPrivacyStats) {
      window.netscope.getPrivacyStats().then(stats => this.updatePrivacyUI(stats));
    }
  }

  updatePrivacyUI(stats) {
    if (!stats) return;
    if (this.shieldBlockedCount) {
      this.shieldBlockedCount.textContent = `${stats.blockedTrackersCount || 0} blocked`;
    }
    if (this.shieldStatusText) {
      this.shieldStatusText.textContent = stats.denyByDefaultTrackers ? 'DENY ALL TRACKERS' : 'ALLOWLIST ONLY';
      this.shieldStatusText.style.color = stats.denyByDefaultTrackers ? 'var(--accent-green)' : 'var(--accent-amber)';
    }
    if (this.toggleDenyTrackers) {
      this.toggleDenyTrackers.checked = !!stats.denyByDefaultTrackers;
    }

    if (stats.activeFeedName && this.feedActiveName) {
      this.feedActiveName.textContent = stats.activeFeedName;
    }
    if (this.feedDomainsCount) {
      const count = stats.totalBlockedHosts || 0;
      this.feedDomainsCount.textContent = `${count.toLocaleString()} Hosts in RAM`;
    }
    if (this.feedActiveBadge) {
      if (stats.feedDomainsCount > 0) {
        this.feedActiveBadge.textContent = 'Feed Active';
        this.feedActiveBadge.style.color = '#34d399';
        this.feedActiveBadge.style.background = 'rgba(52, 211, 153, 0.15)';
        this.feedActiveBadge.style.borderColor = 'rgba(52, 211, 153, 0.3)';
      } else {
        this.feedActiveBadge.textContent = 'Pre-loaded';
        this.feedActiveBadge.style.color = '#818cf8';
        this.feedActiveBadge.style.background = 'rgba(99, 102, 241, 0.18)';
        this.feedActiveBadge.style.borderColor = 'rgba(99, 102, 241, 0.3)';
      }
    }
  }

  async handleFetchFeed() {
    if (!this.selectBlocklistFeed || !this.btnFetchFeed) return;

    const feedId = this.selectBlocklistFeed.value;
    const customUrl = (this.inputCustomFeedUrl && feedId === 'custom') ? this.inputCustomFeedUrl.value.trim() : null;

    if (feedId === 'custom' && !customUrl) {
      this.showFeedFeedback('Please enter a valid feed URL.', 'error');
      return;
    }

    // Set loading state
    this.btnFetchFeed.disabled = true;
    if (this.btnFetchText) this.btnFetchText.textContent = '⏳ Fetching & Parsing...';
    this.showFeedFeedback('Downloading filter list into ephemeral session...', 'loading');

    try {
      const res = await window.netscope.fetchFeed(feedId, customUrl);
      if (res && res.success) {
        this.showFeedFeedback(`Added ${res.domainsCount.toLocaleString()} domains from ${res.feedName} into memory!`, 'success');
        if (res.stats) {
          this.updatePrivacyUI(res.stats);
        }
      } else {
        this.showFeedFeedback(`Failed: ${res ? res.error : 'Unknown error'}`, 'error');
      }
    } catch (err) {
      this.showFeedFeedback(`Error: ${err.message}`, 'error');
    } finally {
      this.btnFetchFeed.disabled = false;
      if (this.btnFetchText) this.btnFetchText.textContent = 'Update Filter List (Opt-In)';
    }
  }

  async handleResetFeed() {
    try {
      const res = await window.netscope.resetFeed();
      this.showFeedFeedback('Reset to default built-in protection list.', 'success');
      if (res && res.stats) {
        this.updatePrivacyUI(res.stats);
      }
    } catch (err) {
      this.showFeedFeedback(`Error resetting: ${err.message}`, 'error');
    }
  }

  handleFeedUpdated(data) {
    if (data && data.stats) {
      this.updatePrivacyUI(data.stats);
    }
  }

  showFeedFeedback(msg, type = 'info') {
    if (!this.feedFeedbackMsg) return;
    this.feedFeedbackMsg.style.display = 'block';
    this.feedFeedbackMsg.className = `feed-feedback-msg ${type}`;
    this.feedFeedbackMsg.textContent = msg;

    if (type === 'success') {
      setTimeout(() => {
        if (this.feedFeedbackMsg && this.feedFeedbackMsg.textContent === msg) {
          this.feedFeedbackMsg.style.display = 'none';
        }
      }, 5000);
    }
  }

  // --- Live Stream Rendering ---

  renderStreamRow(req) {
    const row = document.createElement('tr');
    row.className = `stream-row ${req.state ? 'state-' + req.state : ''}`;
    row.id = `row-${req.requestId}`;
    row.dataset.id = req.requestId;
    row.dataset.type = (req.resourceType || 'other').toUpperCase();

    row.innerHTML = this.buildStreamRowHtml(req);
    row.addEventListener('click', () => this.selectRequest(req.requestId));

    this.streamTableBody.prepend(row);
    this.checkRowVisibility(row);

    // Limit live DOM rows to 500 for high performance
    if (this.streamTableBody.children.length > 500) {
      this.streamTableBody.removeChild(this.streamTableBody.lastChild);
    }
  }

  updateStreamRow(req) {
    const row = document.getElementById(`row-${req.requestId}`);
    if (row) {
      row.className = `stream-row ${req.state ? 'state-' + req.state : ''} ${this.selectedRequestId === req.requestId ? 'selected' : ''}`;
      row.innerHTML = this.buildStreamRowHtml(req);
    }
  }

  buildStreamRowHtml(req) {
    let statusClass = 'status-pending';
    let statusLabel = req.status || '...';

    if (req.state === 'blocked') {
      statusClass = 'status-blocked';
      statusLabel = 'BLOCKED';
    } else if (req.state === 'failed') {
      statusClass = 'status-5xx';
      statusLabel = 'FAILED';
    } else if (req.status) {
      const code = Number(req.status);
      if (code >= 200 && code < 300) statusClass = 'status-2xx';
      else if (code >= 300 && code < 400) statusClass = 'status-3xx';
      else if (code >= 400 && code < 500) statusClass = 'status-4xx';
      else if (code >= 500) statusClass = 'status-5xx';
    }

    const method = req.method || 'GET';
    const methodClass = `method-${method}`;

    let parsedUrl = { pathname: req.url, hostname: '' };
    try {
      const u = new URL(req.url);
      parsedUrl = { pathname: u.pathname || '/', hostname: u.hostname };
    } catch (_) {}

    const sizeStr = req.encodedDataLength ? formatBytes(req.encodedDataLength) : '-';
    const timeStr = req.duration ? `${req.duration}ms` : '...';

    return `
      <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
      <td><span class="method-pill ${methodClass}">${method}</span></td>
      <td class="cell-url">
        <div class="url-path" title="${escapeHtml(req.url)}">${escapeHtml(parsedUrl.pathname)}</div>
        <div class="url-host">${escapeHtml(parsedUrl.hostname)}</div>
      </td>
      <td style="color: var(--text-dim);">${escapeHtml(req.resourceType || 'Other')}</td>
      <td style="text-align: right;">${sizeStr}</td>
      <td style="text-align: right; color: var(--text-dim);">${timeStr}</td>
    `;
  }

  checkRowVisibility(row) {
    const req = this.requests.get(row.dataset.id);
    if (!req) return;

    let matchType = true;
    if (this.activeTypeFilter !== 'ALL') {
      const filter = this.activeTypeFilter;
      const type = (req.resourceType || '').toUpperCase();
      if (filter === 'FETCH') matchType = (type === 'FETCH' || type === 'XHR');
      else if (filter === 'DOC') matchType = (type === 'DOCUMENT');
      else if (filter === 'JS') matchType = (type === 'SCRIPT');
      else if (filter === 'CSS') matchType = (type === 'STYLESHEET');
      else if (filter === 'IMG') matchType = (type === 'IMAGE');
      else if (filter === 'BLOCKED') matchType = (req.state === 'blocked');
      else if (filter === 'PAUSED') matchType = this.pausedRequests.has(req.requestId);
    }

    let matchSearch = true;
    if (this.searchQuery) {
      const q = this.searchQuery;
      matchSearch = req.url.toLowerCase().includes(q) ||
                    (req.destination && req.destination.toLowerCase().includes(q)) ||
                    (req.source && req.source.toLowerCase().includes(q)) ||
                    req.method.toLowerCase().includes(q);
    }

    row.style.display = (matchType && matchSearch) ? '' : 'none';
  }

  applyFilters() {
    const rows = this.streamTableBody.querySelectorAll('.stream-row');
    rows.forEach(r => this.checkRowVisibility(r));

    if (this.activeSubView === 'destinations') this.renderDestinationsView();
    if (this.activeSubView === 'sources') this.renderSourcesView();
  }

  // --- View 2: Destination Tree (Grouped by Domain) ---

  renderDestinationsView() {
    this.destinationsList.innerHTML = '';
    const sorted = Array.from(this.destinations.values()).sort((a, b) => b.count - a.count);

    if (sorted.length === 0) {
      this.destinationsList.innerHTML = '<div style="padding: 20px; color: var(--text-dim); text-align: center;">No destinations captured yet.</div>';
      return;
    }

    sorted.forEach(group => {
      if (this.searchQuery && !group.domain.toLowerCase().includes(this.searchQuery)) return;

      const card = document.createElement('div');
      card.className = 'group-card';

      // Check if domain is blocked
      const isBlocked = this.rules.some(r => r.enabled && r.pattern.includes(group.domain));

      card.innerHTML = `
        <div class="group-card-header">
          <div class="group-card-title">
            <span class="group-arrow">▶</span>
            <span>${escapeHtml(group.domain)}</span>
          </div>
          <div class="group-card-stats">
            <span>${group.count} reqs</span>
            <span>${formatBytes(group.bytes)}</span>
            <div class="group-actions">
              <button class="btn-mini-block ${isBlocked ? 'is-blocked' : ''}" data-domain="${escapeHtml(group.domain)}">
                ${isBlocked ? 'Blocked' : 'Block Host'}
              </button>
            </div>
          </div>
        </div>
        <div class="group-items-list">
          ${group.requests.slice(-50).reverse().map(r => `
            <div class="group-sub-item" data-id="${r.requestId}">
              <span class="method-pill method-${r.method}">${r.method}</span>
              <span class="sub-item-path" title="${escapeHtml(r.url)}">${escapeHtml(r.url)}</span>
              <span style="color: var(--text-dim);">${r.duration ? r.duration + 'ms' : ''}</span>
            </div>
          `).join('')}
        </div>
      `;

      const header = card.querySelector('.group-card-header');
      header.addEventListener('click', (e) => {
        if (e.target.closest('.btn-mini-block')) return;
        card.classList.toggle('open');
      });

      const blockBtn = card.querySelector('.btn-mini-block');
      blockBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const domain = blockBtn.dataset.domain;
        await window.netscope.addBlockRule(`*${domain}*`, `Block ${domain}`);
        blockBtn.classList.add('is-blocked');
        blockBtn.textContent = 'Blocked';
      });

      card.querySelectorAll('.group-sub-item').forEach(item => {
        item.addEventListener('click', () => this.selectRequest(item.dataset.id));
      });

      this.destinationsList.appendChild(card);
    });
  }

  // --- View 3: Source Tree (Grouped by Initiator Script) ---

  renderSourcesView() {
    this.sourcesList.innerHTML = '';
    const sorted = Array.from(this.sources.values()).sort((a, b) => b.count - a.count);

    if (sorted.length === 0) {
      this.sourcesList.innerHTML = '<div style="padding: 20px; color: var(--text-dim); text-align: center;">No sources captured yet.</div>';
      return;
    }

    sorted.forEach(group => {
      if (this.searchQuery && !group.source.toLowerCase().includes(this.searchQuery)) return;

      const card = document.createElement('div');
      card.className = 'group-card';

      card.innerHTML = `
        <div class="group-card-header">
          <div class="group-card-title">
            <span class="group-arrow">▶</span>
            <span>${escapeHtml(group.source)}</span>
          </div>
          <div class="group-card-stats">
            <span>${group.count} calls</span>
          </div>
        </div>
        <div class="group-items-list">
          ${group.requests.slice(-50).reverse().map(r => `
            <div class="group-sub-item" data-id="${r.requestId}">
              <span class="method-pill method-${r.method}">${r.method}</span>
              <span class="sub-item-path" title="${escapeHtml(r.url)}">${escapeHtml(r.destination)} ${escapeHtml(r.url)}</span>
              <span style="color: var(--text-dim);">${r.resourceType}</span>
            </div>
          `).join('')}
        </div>
      `;

      card.querySelector('.group-card-header').addEventListener('click', () => {
        card.classList.toggle('open');
      });

      card.querySelectorAll('.group-sub-item').forEach(item => {
        item.addEventListener('click', () => this.selectRequest(item.dataset.id));
      });

      this.sourcesList.appendChild(card);
    });
  }

  // --- View 4: Intercept Queue ---

  renderInterceptView() {
    this.interceptList.innerHTML = '';
    const pausedItems = Array.from(this.pausedRequests.values());

    if (pausedItems.length === 0) {
      this.interceptList.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-dim);">
          <div style="font-size: 14px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Intercept Queue is Empty</div>
          <div style="font-size: 11.5px;">Click "Pause Traffic" in the top bar to hold outgoing requests for live inspection, modification, or dropping.</div>
        </div>
      `;
      return;
    }

    pausedItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'paused-card';
      card.id = `paused-card-${item.requestId}`;

      card.innerHTML = `
        <div class="paused-card-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="status-pill status-paused">PAUSED</span>
            <span class="method-pill method-${item.method}">${item.method}</span>
            <span style="color: var(--text-dim); font-size: 11px;">${item.resourceType}</span>
          </div>
          <div style="color: var(--accent-amber); font-size: 11px; font-weight: 600;">Held</div>
        </div>
        <div>
          <input type="text" class="paused-url-input" value="${escapeHtml(item.url)}" />
        </div>
        ${item.postData ? `
          <div>
            <div style="font-size: 10.5px; color: var(--text-dim); margin-bottom: 2px;">Payload Body:</div>
            <textarea class="paused-payload-area">${escapeHtml(item.postData)}</textarea>
          </div>
        ` : ''}
        <div class="paused-actions-row">
          <button class="btn-card-action btn-action-drop">Drop / Block</button>
          <button class="btn-card-action btn-action-mock">Mock 200 OK</button>
          <button class="btn-card-action btn-action-continue">Continue Request</button>
        </div>
      `;

      const urlInput = card.querySelector('.paused-url-input');
      const payloadArea = card.querySelector('.paused-payload-area');

      card.querySelector('.btn-action-continue').addEventListener('click', async () => {
        const modified = {
          url: urlInput.value.trim(),
          postData: payloadArea ? payloadArea.value : undefined
        };
        await window.netscope.resumeRequest(item.requestId, modified);
      });

      card.querySelector('.btn-action-drop').addEventListener('click', async () => {
        await window.netscope.blockPausedRequest(item.requestId);
      });

      card.querySelector('.btn-action-mock').addEventListener('click', async () => {
        await window.netscope.fulfillPausedRequest(item.requestId, 200, { 'Content-Type': 'application/json' }, '{"mocked": true, "message": "Fulfilled by NetScope"}');
      });

      this.interceptList.appendChild(card);
    });
  }

  // --- View 5: Firewall & Rules ---

  renderFirewallRules() {
    this.firewallRulesList.innerHTML = '';
    this.rules.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'rule-item';

      item.innerHTML = `
        <div class="rule-info">
          <div class="rule-pattern">${escapeHtml(rule.pattern)}</div>
          <div class="rule-label">${escapeHtml(rule.label || rule.pattern)}</div>
        </div>
        <div class="rule-controls">
          <span class="rule-hits-badge">${rule.hits} blocked</span>
          <label class="toggle-switch">
            <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-id="${rule.id}" />
            <span class="toggle-slider"></span>
          </label>
          <button class="icon-btn" data-delete-id="${rule.id}" title="Delete Rule">✕</button>
        </div>
      `;

      item.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
        await window.netscope.toggleBlockRule(rule.id, e.target.checked);
      });

      item.querySelector('[data-delete-id]').addEventListener('click', async () => {
        await window.netscope.removeBlockRule(rule.id);
      });

      this.firewallRulesList.appendChild(item);
    });
  }

  async handleAddNewRule() {
    const pattern = this.inputAddRule.value.trim();
    if (!pattern) return;
    await window.netscope.addBlockRule(pattern, `Custom: ${pattern}`);
    this.inputAddRule.value = '';
  }

  // --- Inspector Drawer ---

  selectRequest(requestId) {
    this.selectedRequestId = requestId;
    const req = this.requests.get(requestId);
    if (!req) return;

    // Highlight row
    document.querySelectorAll('.stream-row').forEach(r => {
      r.classList.toggle('selected', r.dataset.id === requestId);
    });

    this.inspectorDrawer.classList.remove('hidden');
    this.renderInspectorDetails(req);
  }

  closeInspector() {
    this.selectedRequestId = null;
    this.inspectorDrawer.classList.add('hidden');
    document.querySelectorAll('.stream-row').forEach(r => r.classList.remove('selected'));
  }

  renderInspectorDetails(req) {
    // Top summary banner
    this.inspectorSummary.innerHTML = `
      <span class="method-pill method-${req.method}">${req.method}</span>
      <span class="status-pill ${req.status ? 'status-2xx' : 'status-pending'}">${req.status || 'Pending'}</span>
      <span style="color: var(--text-main); font-weight: 500;">${escapeHtml(req.url)}</span>
    `;

    // 1. Headers Tab
    let headersHtml = `
      <div class="headers-section-title">General</div>
      <table class="headers-table">
        <tr><td class="header-name">Request URL:</td><td class="header-value">${escapeHtml(req.url)}</td></tr>
        <tr><td class="header-name">Request Method:</td><td class="header-value">${escapeHtml(req.method)}</td></tr>
        <tr><td class="header-name">Status Code:</td><td class="header-value">${escapeHtml(req.status || 'Pending')} ${escapeHtml(req.statusText || '')}</td></tr>
        <tr><td class="header-name">Remote Address:</td><td class="header-value">${escapeHtml(req.remoteIPAddress || 'unknown')}</td></tr>
        <tr><td class="header-name">Initiator (Source):</td><td class="header-value">${escapeHtml(req.source || 'Main Frame')}</td></tr>
      </table>

      <div class="headers-section-title">Response Headers</div>
      <table class="headers-table">
        ${Object.entries(req.responseHeaders || {}).map(([k, v]) => `
          <tr><td class="header-name">${escapeHtml(k)}:</td><td class="header-value">${escapeHtml(v)}</td></tr>
        `).join('') || '<tr><td colspan="2" style="color: var(--text-dim);">No response headers received yet</td></tr>'}
      </table>

      <div class="headers-section-title">Request Headers</div>
      <table class="headers-table">
        ${Object.entries(req.requestHeaders || {}).map(([k, v]) => `
          <tr><td class="header-name">${escapeHtml(k)}:</td><td class="header-value">${escapeHtml(v)}</td></tr>
        `).join('') || '<tr><td colspan="2" style="color: var(--text-dim);">No request headers captured</td></tr>'}
      </table>
    `;
    this.inspectorTabs.headers.innerHTML = headersHtml;

    // 2. Request Payload Tab
    this.inspectorTabs.payload.innerHTML = '';
    if (req.postData) {
      renderJsonTree(req.postData, this.inspectorTabs.payload);
    } else {
      this.inspectorTabs.payload.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">No request payload body for this request.</div>';
    }

    // 3. Response Body Preview Tab
    this.inspectorTabs.response.innerHTML = '';
    if (req.responseBody && req.responseBody.body) {
      if (req.responseBody.base64Encoded && req.mimeType && req.mimeType.startsWith('image/')) {
        this.inspectorTabs.response.innerHTML = `<img src="data:${req.mimeType};base64,${req.responseBody.body}" style="max-width: 100%; border-radius: 6px;" />`;
      } else {
        renderJsonTree(req.responseBody.body, this.inspectorTabs.response);
      }
    } else if (req.hasBody && window.netscope && window.netscope.getResponseBody) {
      this.inspectorTabs.response.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">Loading response body...</div>';
      window.netscope.getResponseBody(req.requestId).then(bodyData => {
        if (bodyData && bodyData.body) {
          req.responseBody = bodyData;
          if (this.selectedRequestId === req.requestId) {
            this.inspectorTabs.response.innerHTML = '';
            if (bodyData.base64Encoded && req.mimeType && req.mimeType.startsWith('image/')) {
              this.inspectorTabs.response.innerHTML = `<img src="data:${req.mimeType};base64,${bodyData.body}" style="max-width: 100%; border-radius: 6px;" />`;
            } else {
              renderJsonTree(bodyData.body, this.inspectorTabs.response);
            }
          }
        } else {
          this.inspectorTabs.response.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">Response body is not available (or was blocked / stream).</div>';
        }
      }).catch(() => {
        this.inspectorTabs.response.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">Response body could not be retrieved.</div>';
      });
    } else {
      this.inspectorTabs.response.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">Response body is not available (or request is in progress / stream).</div>';
    }

    // 4. Timing Waterfall Tab
    const timing = req.timing || {};
    const duration = req.duration || 1;
    this.inspectorTabs.timing.innerHTML = `
      <div class="waterfall-container">
        <div class="waterfall-row">
          <div class="waterfall-label">Total Duration</div>
          <div class="waterfall-bar-track">
            <div class="waterfall-bar-fill" style="width: 100%; background: var(--accent-blue);"></div>
          </div>
          <div class="waterfall-val">${duration} ms</div>
        </div>
        ${timing.dnsStart !== undefined ? `
          <div class="waterfall-row">
            <div class="waterfall-label">DNS Lookup</div>
            <div class="waterfall-bar-track">
              <div class="waterfall-bar-fill" style="width: ${Math.min(100, Math.max(5, (timing.dnsEnd - timing.dnsStart)))}%; background: var(--accent-cyan);"></div>
            </div>
            <div class="waterfall-val">${Math.round(Math.max(0, timing.dnsEnd - timing.dnsStart))} ms</div>
          </div>
        ` : ''}
        ${timing.connectStart !== undefined ? `
          <div class="waterfall-row">
            <div class="waterfall-label">Initial Connect</div>
            <div class="waterfall-bar-track">
              <div class="waterfall-bar-fill" style="width: ${Math.min(100, Math.max(5, (timing.connectEnd - timing.connectStart)))}%; background: var(--accent-green);"></div>
            </div>
            <div class="waterfall-val">${Math.round(Math.max(0, timing.connectEnd - timing.connectStart))} ms</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  clearLocalData() {
    this.requests.clear();
    this.pausedRequests.clear();
    this.destinations.clear();
    this.sources.clear();
    this.streamTableBody.innerHTML = '';
    this.destinationsList.innerHTML = '';
    this.sourcesList.innerHTML = '';
    this.interceptList.innerHTML = '';
    this.closeInspector();
    this.updateMetrics();
  }
}

// Utility: Format bytes into readable string
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
