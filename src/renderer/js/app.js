// --- NoctisBrowser Controller & Tab Manager ---

const noctisApi = window.noctis || window.netscope;

class BrowserApp {
  constructor() {
    this.tabs = new Map(); // tabId -> { tabData, tabEl, viewEl, webview }
    this.activeTabId = null;
    this.torVpnStatus = null;

    this.shieldPath = (noctisApi && noctisApi.getShieldPathSync)
      ? noctisApi.getShieldPathSync()
      : null;

    this.initElements();
    this.bindEvents();
    this.initResizer();
    this.initTorVpnStatus();

    // Create default starter tab (Home: default no page open tab)
    this.createTab('about:blank', 'New Tab');
  }

  initElements() {
    this.tabListEl = document.getElementById('tab-list');
    this.btnNewTab = document.getElementById('btn-new-tab');
    this.btnTorTab = document.getElementById('btn-tor-tab');
    this.btnMatrixTab = document.getElementById('btn-matrix-tab');
    this.btnVaultTab = document.getElementById('btn-vault-tab');
    this.btnCockpitOpenVault = document.getElementById('btn-cockpit-open-vault');
    this.webviewContainer = document.getElementById('webview-container');

    // Navigation Toolbar
    this.btnBack = document.getElementById('nav-back');
    this.btnForward = document.getElementById('nav-forward');
    this.btnReload = document.getElementById('nav-reload');
    this.btnHome = document.getElementById('nav-home');
    this.addressBar = document.getElementById('address-bar');

    // Toolbar Privacy / VPN / Burn Controls
    this.btnVpnStatus = document.getElementById('btn-vpn-status');
    this.vpnPillDot = document.getElementById('vpn-pill-dot');
    this.vpnPillText = document.getElementById('vpn-pill-text');
    this.btnBurnIdentity = document.getElementById('btn-burn-identity');
  }

  async initTorVpnStatus() {
    if (!noctisApi || !noctisApi.getTorVpnStatus) return;
    try {
      const status = await noctisApi.getTorVpnStatus();
      this.updateTorVpnUI(status);
    } catch (_) {}

    if (noctisApi.onTorVpnStatusUpdated) {
      noctisApi.onTorVpnStatusUpdated((status) => {
        this.updateTorVpnUI(status);
      });
    }
  }

  updateTorVpnUI(status) {
    if (!status) return;
    this.torVpnStatus = status;

    if (this.vpnPillText) {
      this.vpnPillText.textContent = status.badgeText || 'Direct';
    }
    if (this.btnVpnStatus) {
      this.btnVpnStatus.className = `vpn-status-pill state-${status.badgeState || 'direct'}`;
      this.btnVpnStatus.title = `${status.modeLabel} — Click to toggle Built-in Browser VPN`;
    }
    if (this.vpnPillDot) {
      if (status.badgeState === 'vpn' || status.badgeState === 'tor') {
        this.vpnPillDot.className = 'btn-dot green';
      } else if (status.badgeState === 'killswitch') {
        this.vpnPillDot.className = 'btn-dot red';
      } else {
        this.vpnPillDot.className = 'btn-dot amber';
      }
    }
  }

  static isNewTabShortcut(e, platform) {
    if (!e || (e.type !== 'keydown' && e.type !== 'keyup')) return false;
    const isMac = platform ? platform === 'darwin' : (typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform));
    const hasModifier = isMac ? (e.metaKey && !e.ctrlKey) : (e.ctrlKey && !e.metaKey);
    return Boolean(hasModifier && !e.altKey && !e.shiftKey && (e.key === 't' || e.key === 'T'));
  }

  bindEvents() {
    // New tab button
    this.btnNewTab.addEventListener('click', () => {
      this.createTab('about:blank', 'New Tab');
    });

    // Keyboard shortcut for New Tab: Cmd+T on macOS, Ctrl+T on Windows/Linux
    if (noctisApi && noctisApi.onShortcutNewTab) {
      noctisApi.onShortcutNewTab(() => {
        this.createTab('about:blank', 'New Tab');
      });
    }

    window.addEventListener('keydown', (e) => {
      const platform = (noctisApi && noctisApi.getPlatform) ? noctisApi.getPlatform() : (navigator.platform.includes('Mac') ? 'darwin' : 'linux');
      if (BrowserApp.isNewTabShortcut(e, platform)) {
        e.preventDefault();
        e.stopPropagation();
        this.createTab('about:blank', 'New Tab');
      }
    }, true);

    // Pinned Tor & VPN tab button
    if (this.btnTorTab) {
      this.btnTorTab.addEventListener('click', () => {
        this.openVaultTab('tab-tor-vpn');
      });
    }

    // Pinned Network Monitor tab button
    this.btnMatrixTab.addEventListener('click', () => {
      this.openMatrixTab();
    });

    // Pinned Privacy & Storage Vault tab button
    if (this.btnVaultTab) {
      this.btnVaultTab.addEventListener('click', () => {
        this.openVaultTab('tab-identity');
      });
    }

    if (this.btnCockpitOpenVault) {
      this.btnCockpitOpenVault.addEventListener('click', () => {
        this.openVaultTab('tab-identity');
      });
    }

    // Quick VPN Status Pill toggle in toolbar
    if (this.btnVpnStatus) {
      this.btnVpnStatus.addEventListener('click', async () => {
        if (!noctisApi || !noctisApi.updateTorVpnConfig) return;
        const currentMode = this.torVpnStatus ? this.torVpnStatus.mode : 'direct';
        const nextMode = currentMode === 'direct' ? 'built-in-vpn' : 'direct';
        const updated = await noctisApi.updateTorVpnConfig({ mode: nextMode });
        this.updateTorVpnUI(updated);
      });
    }

    // Instant Panic / Burn Identity Button
    if (this.btnBurnIdentity) {
      this.btnBurnIdentity.addEventListener('click', async () => {
        await this.burnIdentityAndResetTabs();
      });
    }

    // Navigation buttons
    this.btnBack.addEventListener('click', () => {
      const active = this.getActiveTabRecord();
      if (active && active.webview && active.webview.canGoBack()) active.webview.goBack();
    });

    this.btnForward.addEventListener('click', () => {
      const active = this.getActiveTabRecord();
      if (active && active.webview && active.webview.canGoForward()) active.webview.goForward();
    });

    this.btnReload.addEventListener('click', () => {
      const active = this.getActiveTabRecord();
      if (active && active.webview) {
        if (active.webview.isLoading()) {
          active.webview.stop();
        } else {
          active.webview.reload();
        }
      }
    });

    this.btnHome.addEventListener('click', () => {
      this.goHome();
    });

    // Address Bar navigation
    this.addressBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const input = this.addressBar.value.trim();
        if (input) this.navigateTo(this.normalizeUrl(input));
      }
    });

    this.addressBar.addEventListener('focus', () => {
      this.addressBar.select();
    });

    // Listen for window open requests from main process setWindowOpenHandler
    if (noctisApi && noctisApi.onOpenNewTab) {
      noctisApi.onOpenNewTab((data) => {
        if (data && data.url) {
          this.openTabFromExternal(data.url);
        }
      });
    }

    // Sync live fingerprint profile updates to running webviews
    if (noctisApi && noctisApi.onFingerprintProfileUpdated) {
      noctisApi.onFingerprintProfileUpdated((updatedProfile) => {
        this.tabs.forEach((record) => {
          if (record.webview && record.webview._domReady && !record.tabData?.isSpecial) {
            try {
              record.webview.executeJavaScript(`
                if (window.__NOCTIS_UPDATE_PROFILE__) {
                  window.__NOCTIS_UPDATE_PROFILE__(${JSON.stringify(updatedProfile)});
                } else if (window.__NETSCOPE_UPDATE_PROFILE__) {
                  window.__NETSCOPE_UPDATE_PROFILE__(${JSON.stringify(updatedProfile)});
                }
              `).catch(() => {});
            } catch (_) {}
          }
        });
      });
    }
  }

  async burnIdentityAndResetTabs() {
    if (!noctisApi || !noctisApi.burnIdentityNow) return;
    const origText = this.btnBurnIdentity ? this.btnBurnIdentity.textContent : 'Burn Identity';
    if (this.btnBurnIdentity) {
      this.btnBurnIdentity.textContent = 'Burning...';
      this.btnBurnIdentity.disabled = true;
    }

    try {
      const res = await noctisApi.burnIdentityNow();
      if (res && res.torVpn) {
        this.updateTorVpnUI(res.torVpn);
      }

      // Close all existing tabs and open a fresh clean tab
      for (const [id, record] of Array.from(this.tabs.entries())) {
        try {
          record.tabEl.remove();
          record.viewEl.remove();
        } catch (_) {}
        this.tabs.delete(id);
      }
      if (this.btnMatrixTab) this.btnMatrixTab.classList.remove('active');
      if (this.btnVaultTab) this.btnVaultTab.classList.remove('active');
      if (this.btnTorTab) this.btnTorTab.classList.remove('active');

      await this.createTab('about:blank', 'New Identity');
    } catch (err) {
      console.error('Burn identity failed:', err);
    } finally {
      if (this.btnBurnIdentity) {
        this.btnBurnIdentity.textContent = 'Identity Burned';
        this.btnBurnIdentity.disabled = false;
        setTimeout(() => {
          if (this.btnBurnIdentity) this.btnBurnIdentity.textContent = origText;
        }, 1800);
      }
    }
  }

  openTabFromExternal(url) {
    if (!url || url === 'about:blank' || url.startsWith('javascript:')) return;
    const now = Date.now();
    if (this._lastOpenedUrl === url && now - (this._lastOpenedTime || 0) < 300) {
      return;
    }
    this._lastOpenedUrl = url;
    this._lastOpenedTime = now;
    this.createTab(url, 'New Tab');
  }

  initResizer() {
    const resizer = document.getElementById('split-resizer');
    const cockpit = document.getElementById('network-cockpit');
    let isDragging = false;

    resizer.addEventListener('mousedown', (e) => {
      isDragging = true;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 360 && newWidth <= window.innerWidth * 0.75) {
        cockpit.style.width = `${newWidth}px`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = 'default';
      }
    });

    // Double-click splitter to toggle collapse
    resizer.addEventListener('dblclick', () => {
      cockpit.classList.toggle('collapsed');
      const isOpen = !cockpit.classList.contains('collapsed');
      document.getElementById('btn-toggle-cockpit').classList.toggle('open', isOpen);
    });
  }

  isDarkWebOrDecentralizedInput(input) {
    const trimmed = (input || '').trim();
    if (/^(ipfs|ipns|tor|i2p|loki|zero|zeronet|hyphanet):\/\//i.test(trimmed)) return true;
    if (/^freenet:/i.test(trimmed)) return true;
    if (/^(https?:\/\/)?[a-zA-Z0-9.-]+\.(onion|i2p|loki|eth|bit)(:\d+)?(\/.*)?$/i.test(trimmed)) return true;
    return false;
  }

  normalizeUrl(input) {
    const trimmed = (input || '').trim();
    if (
      trimmed.startsWith('noctis://') ||
      trimmed.startsWith('netscope://') ||
      trimmed.startsWith('about:')
    ) {
      return trimmed;
    }

    // Preserve dark web / decentralized schemes and domains so they never leak to clearnet search
    if (this.isDarkWebOrDecentralizedInput(trimmed)) {
      return trimmed;
    }

    let normalized = trimmed;
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      // Check if input looks like a domain name
      if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(normalized) || normalized.startsWith('localhost:')) {
        normalized = 'https://' + normalized;
      } else {
        // Otherwise, perform search on DuckDuckGo
        return `https://duckduckgo.com/?q=${encodeURIComponent(normalized)}`;
      }
    }

    // Strip invasive tracking query parameters (Umbra Browser defense)
    try {
      const u = new URL(normalized);
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
        'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'twclid', 'ttclid', 'li_fat_id',
        'mc_eid', 'vero_id', 'oly_enc_id', 'oly_anon_id', '_hsenc', '_hsmi', 'mkt_tok',
        'rb_clickid', 's_kwcid', 'yclid', '_openstat', 'zanpid', 'igshid', 'si', 'ref_src'
      ];
      for (const p of trackingParams) u.searchParams.delete(p);
      return u.toString();
    } catch (_) {
      return normalized;
    }
  }

  async resolveBeforeLoad(rawUrl) {
    if (!rawUrl) return 'about:blank';
    if (this.isDarkWebOrDecentralizedInput(rawUrl) && noctisApi && noctisApi.resolveProtocolUrl) {
      try {
        const res = await noctisApi.resolveProtocolUrl(rawUrl);
        if (res && res.url) return res.url;
      } catch (_) {}
    }
    return rawUrl;
  }

  renderWelcomeScreen(tabId, viewEl) {
    viewEl.innerHTML = `
      <div class="welcome-screen">
        <div class="welcome-logo">
          <img src="../../assets/icon.svg" alt="NoctisBrowser" width="76" height="76" />
        </div>
        <div class="welcome-title">NoctisBrowser</div>
        <div class="welcome-subtitle">Zero-Trace Ephemeral Privacy Browser with Paranoid Anti-Fingerprinting, Built-in Browser VPN, Tor (.onion) &amp; Decentralized Dark Web Protocols.</div>

        <div class="quick-section-label">Validate Privacy, Security &amp; Network Routing State</div>
        <div class="quick-links">
          <div class="quick-card audit-card" data-url="https://www.whatismybrowser.com">
            <span class="audit-tag">Audit</span> WhatIsMyBrowser (Fingerprint &amp; UA)
          </div>
          <div class="quick-card audit-card" data-url="https://browserleaks.com/ip">
            <span class="audit-tag">WhatIsMyIP</span> BrowserLeaks IP &amp; Location
          </div>
          <div class="quick-card audit-card" data-url="https://www.dnsleaktest.com">
            <span class="audit-tag">DNS Leak</span> DNS Leak &amp; DNSSEC Test
          </div>
          <div class="quick-card audit-card" data-url="https://check.torproject.org">
            <span class="audit-tag">Tor Check</span> Tor Network Routing Test
          </div>
          <div class="quick-card audit-card" data-url="https://one.one.one.one/help">
            <span class="audit-tag">DNSSEC</span> Cloudflare 1.1.1.1 / DNSSEC Diagnostic
          </div>
          <div class="quick-card audit-card" data-url="https://coveryourtracks.eff.org">
            <span class="audit-tag">Tracker Shield</span> EFF Cover Your Tracks
          </div>
          <div class="quick-card audit-card" data-url="https://browserleaks.com/webrtc">
            <span class="audit-tag">WebRTC Shield</span> WebRTC Leak Test
          </div>
        </div>

        <div class="quick-section-label">Dark Web, Onion &amp; Decentralized Protocols</div>
        <div class="quick-links">
          <div class="quick-card darkweb-card" data-url="https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion">
            <span class="proto-tag">.onion</span> DuckDuckGo Onion v3
          </div>
          <div class="quick-card darkweb-card" data-url="ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/wiki/Vincent_van_Gogh.html">
            <span class="proto-tag">ipfs://</span> Wikipedia on IPFS
          </div>
          <div class="quick-card darkweb-card" data-url="https://vitalik.eth">
            <span class="proto-tag">.eth</span> Vitalik ENS Portal
          </div>
          <div class="quick-card darkweb-card" data-url="noctis://tor">
            <span class="proto-tag">VPN / Tor</span> Configure Routing
          </div>
          <div class="quick-card darkweb-card" data-url="noctis://vault">
            <span class="proto-tag">Vault</span> Privacy &amp; Fingerprint Vault
          </div>
          <div class="quick-card darkweb-card" data-url="noctis://monitor">
            <span class="proto-tag">Cockpit</span> Network Monitor
          </div>
        </div>
      </div>
    `;

    viewEl.querySelectorAll('.quick-card').forEach(card => {
      card.addEventListener('click', () => {
        const target = card.dataset.url;
        if (target.startsWith('noctis://')) {
          this.navigateTo(target);
        } else {
          this.loadWebviewInTab(tabId, target);
        }
      });
    });
  }

  goHome() {
    const active = this.getActiveTabRecord();
    if (!active) {
      this.createTab('about:blank', 'New Tab');
      return;
    }

    // If current active tab is a special tab (Vault or Monitor), switch to or create an about:blank tab
    if (active.tabData && active.tabData.isSpecial) {
      for (const [id, rec] of this.tabs.entries()) {
        if (!rec.tabData?.isSpecial && (!rec.webview || rec.tabData?.url === 'about:blank')) {
          this.setActiveTab(id);
          return;
        }
      }
      this.createTab('about:blank', 'New Tab');
      return;
    }

    // Return current web tab to default no page open state (welcome screen)
    if (active.webview) {
      try {
        if (active.webview.isLoading()) active.webview.stop();
      } catch (_) {}
      try {
        active.webview.remove();
      } catch (_) {}
      active.webview = null;
    }

    this.renderWelcomeScreen(this.activeTabId, active.viewEl);
    if (active.tabEl) {
      const titleSpan = active.tabEl.querySelector('.tab-title');
      if (titleSpan) titleSpan.textContent = 'New Tab';
      const favEl = active.tabEl.querySelector('.tab-favicon');
      if (favEl) {
        favEl.className = 'tab-favicon dot-indicator';
        favEl.innerHTML = '';
      }
    }
    if (active.tabData) {
      active.tabData.url = 'about:blank';
      active.tabData.title = 'New Tab';
      active.tabData.favicon = null;
    }
    this.addressBar.value = '';
    this.updateNavButtons();
    if (noctisApi && noctisApi.updateTab) {
      noctisApi.updateTab(this.activeTabId, { url: 'about:blank', title: 'New Tab', favicon: null }).catch(() => {});
    }
  }

  async createTab(initialUrl = 'about:blank', title = 'New Tab') {
    const tabData = await noctisApi.createTab(initialUrl, title);
    const tabId = tabData.id;

    // 1. Create Tab DOM element in top strip
    const tabEl = document.createElement('div');
    tabEl.className = 'browser-tab';
    tabEl.id = `tab-header-${tabId}`;
    tabEl.innerHTML = `
      <div class="tab-favicon dot-indicator"></div>
      <span class="tab-title">${escapeHtml(title)}</span>
      <span class="tab-close" title="Close Tab">✕</span>
    `;

    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        this.setActiveTab(tabId);
      }
    });

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    this.tabListEl.appendChild(tabEl);

    // 2. Create Webview Container View
    const viewEl = document.createElement('div');
    viewEl.className = 'tab-view';
    viewEl.id = `tab-view-${tabId}`;

    let webview = null;
    if (initialUrl === 'about:blank') {
      this.renderWelcomeScreen(tabId, viewEl);
    } else {
      const targetUrl = await this.resolveBeforeLoad(initialUrl);
      webview = this.createWebviewElement(tabId, targetUrl);
      viewEl.appendChild(webview);
    }

    this.webviewContainer.appendChild(viewEl);

    this.tabs.set(tabId, { tabData, tabEl, viewEl, webview });
    this.setActiveTab(tabId);

    return tabId;
  }

  createWebviewElement(tabId, url) {
    const webview = document.createElement('webview');
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('partition', 'in-memory-ephemeral');
    webview.setAttribute('webpreferences', 'contextIsolation=no, nodeIntegration=no');

    if (!this.shieldPath && noctisApi && noctisApi.getShieldPathSync) {
      this.shieldPath = noctisApi.getShieldPathSync();
    }
    if (this.shieldPath) {
      webview.setAttribute('preload', this.shieldPath);
    }
    webview.src = url;

    // Attach CDP network interception when webview emits dom-ready
    const attachNetwork = () => {
      webview._domReady = true;
      try {
        const wcId = webview.getWebContentsId();
        if (wcId && !webview._netscopeAttached) {
          webview._netscopeAttached = true;
          noctisApi.attachWebview(wcId, tabId);
        }
      } catch (err) {
        console.error('Failed to attach webview to noctis:', err);
      }
    };

    webview.addEventListener('dom-ready', attachNetwork);

    // Intercept window.open and target="_blank" from webview to open as in-browser tabs
    webview.addEventListener('new-window', (e) => {
      e.preventDefault();
      if (e.url && e.url !== 'about:blank' && !e.url.startsWith('javascript:')) {
        this.openTabFromExternal(e.url);
      }
    });

    // Navigation and status listeners
    webview.addEventListener('did-start-loading', () => {
      this.updateTabLoading(tabId, true);
    });

    webview.addEventListener('did-stop-loading', () => {
      this.updateTabLoading(tabId, false);
      this.updateNavButtons();
    });

    webview.addEventListener('did-navigate', (e) => {
      if (this.activeTabId === tabId) {
        this.addressBar.value = e.url;
      }
      this.updateNavButtons();
    });

    webview.addEventListener('did-navigate-in-page', (e) => {
      if (this.activeTabId === tabId) {
        this.addressBar.value = e.url;
      }
      this.updateNavButtons();
    });

    webview.addEventListener('page-title-updated', (e) => {
      const record = this.tabs.get(tabId);
      if (record && record.tabEl) {
        record.tabEl.querySelector('.tab-title').textContent = e.title;
      }
    });

    webview.addEventListener('page-favicon-updated', (e) => {
      if (e.favicons && e.favicons.length > 0) {
        const record = this.tabs.get(tabId);
        if (record && record.tabEl) {
          const favEl = record.tabEl.querySelector('.tab-favicon');
          favEl.innerHTML = `<img src="${e.favicons[0]}" style="width: 14px; height: 14px; border-radius: 2px;" onerror="this.remove()" />`;
        }
      }
    });

    return webview;
  }

  async loadWebviewInTab(tabId, url) {
    const record = this.tabs.get(tabId);
    if (!record) return;

    const resolvedUrl = await this.resolveBeforeLoad(url);
    record.viewEl.innerHTML = '';
    const webview = this.createWebviewElement(tabId, resolvedUrl);
    record.webview = webview;
    record.viewEl.appendChild(webview);

    if (this.activeTabId === tabId) {
      this.addressBar.value = url;
    }
  }

  openMatrixTab() {
    const tabId = 'tab-matrix';
    if (this.tabs.has(tabId)) {
      this.setActiveTab(tabId);
      return;
    }

    if (noctisApi && noctisApi.createSpecialTab) {
      noctisApi.createSpecialTab('matrix').catch(() => {});
    }

    // 1. Tab header
    const tabEl = document.createElement('div');
    tabEl.className = 'browser-tab special-matrix';
    tabEl.id = `tab-header-${tabId}`;
    tabEl.innerHTML = `
      <div class="tab-favicon dot-cyan"></div>
      <span class="tab-title">Network Monitor</span>
      <span class="tab-close">✕</span>
    `;

    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        this.setActiveTab(tabId);
      }
    });

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    this.tabListEl.appendChild(tabEl);

    // 2. Tab view with iframe loading matrix.html
    const viewEl = document.createElement('div');
    viewEl.className = 'tab-view';
    viewEl.id = `tab-view-${tabId}`;

    const iframe = document.createElement('iframe');
    iframe.src = 'matrix.html';
    viewEl.appendChild(iframe);
    this.webviewContainer.appendChild(viewEl);

    this.tabs.set(tabId, { tabData: { id: tabId, isSpecial: true }, tabEl, viewEl, webview: null });
    this.setActiveTab(tabId);
  }

  openVaultTab(targetSubTab = null) {
    const tabId = 'tab-vault';
    if (this.tabs.has(tabId)) {
      this.setActiveTab(tabId);
      if (targetSubTab) {
        const record = this.tabs.get(tabId);
        const iframe = record && record.viewEl ? record.viewEl.querySelector('iframe') : null;
        if (iframe && iframe.contentWindow) {
          try {
            iframe.contentWindow.postMessage({ type: 'switch-vault-tab', target: targetSubTab }, '*');
          } catch (_) {}
        }
      }
      return;
    }

    if (noctisApi && noctisApi.createSpecialTab) {
      noctisApi.createSpecialTab('vault').catch(() => {});
    }

    // 1. Tab header
    const tabEl = document.createElement('div');
    tabEl.className = 'browser-tab special-vault';
    tabEl.id = `tab-header-${tabId}`;
    tabEl.innerHTML = `
      <div class="tab-favicon dot-purple"></div>
      <span class="tab-title">Privacy Vault</span>
      <span class="tab-close">✕</span>
    `;

    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        this.setActiveTab(tabId);
      }
    });

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    this.tabListEl.appendChild(tabEl);

    // 2. Tab view with iframe loading vault.html
    const viewEl = document.createElement('div');
    viewEl.className = 'tab-view';
    viewEl.id = `tab-view-${tabId}`;

    const iframe = document.createElement('iframe');
    iframe.src = targetSubTab ? `vault.html#${targetSubTab}` : 'vault.html';
    viewEl.appendChild(iframe);
    this.webviewContainer.appendChild(viewEl);

    this.tabs.set(tabId, { tabData: { id: tabId, isSpecial: true, specialType: 'vault' }, tabEl, viewEl, webview: null });
    this.setActiveTab(tabId);
  }

  setActiveTab(tabId) {
    if (!this.tabs.has(tabId)) return;
    this.activeTabId = tabId;

    try {
      if (noctisApi && noctisApi.setActiveTab) {
        noctisApi.setActiveTab(tabId).catch(() => {});
      }
    } catch (_) {}

    this.tabs.forEach((record, id) => {
      const isActive = id === tabId;
      record.tabEl.classList.toggle('active', isActive);
      record.viewEl.classList.toggle('active', isActive);
    });

    // Sync pinned header buttons active state
    if (this.btnMatrixTab) {
      this.btnMatrixTab.classList.toggle('active', tabId === 'tab-matrix');
    }
    if (this.btnVaultTab) {
      this.btnVaultTab.classList.toggle('active', tabId === 'tab-vault');
    }

    const active = this.tabs.get(tabId);
    if (active && active.webview) {
      try {
        this.addressBar.value = active.webview.getURL() || '';
      } catch (_) {
        this.addressBar.value = '';
      }
    } else if (tabId === 'tab-matrix') {
      this.addressBar.value = 'noctis://monitor';
    } else if (tabId === 'tab-vault') {
      this.addressBar.value = 'noctis://vault';
    } else {
      this.addressBar.value = '';
    }

    this.updateNavButtons();
  }

  closeTab(tabId) {
    const record = this.tabs.get(tabId);
    if (!record) return;

    try {
      if (noctisApi && noctisApi.closeTab) {
        noctisApi.closeTab(tabId).catch(() => {});
      }
    } catch (_) {}

    record.tabEl.remove();
    record.viewEl.remove();
    this.tabs.delete(tabId);

    if (tabId === 'tab-matrix' && this.btnMatrixTab) {
      this.btnMatrixTab.classList.remove('active');
    }
    if (tabId === 'tab-vault' && this.btnVaultTab) {
      this.btnVaultTab.classList.remove('active');
    }
    if (tabId === 'tab-vault' && this.btnTorTab) {
      this.btnTorTab.classList.remove('active');
    }

    if (this.activeTabId === tabId) {
      const remaining = Array.from(this.tabs.keys());
      if (remaining.length > 0) {
        this.setActiveTab(remaining[remaining.length - 1]);
      } else {
        this.createTab('about:blank', 'New Tab');
      }
    }
  }

  async navigateTo(url) {
    if (!url || url === 'about:blank' || url === 'noctis://home' || url === 'netscope://home') {
      this.goHome();
      return;
    }
    if (url === 'noctis://vault' || url === 'noctis://privacy' || url === 'netscope://vault' || url === 'netscope://privacy') {
      this.openVaultTab('tab-identity');
      return;
    }
    if (url === 'noctis://tor' || url === 'noctis://vpn' || url === 'netscope://tor' || url === 'netscope://vpn') {
      this.openVaultTab('tab-tor-vpn');
      return;
    }
    if (url === 'noctis://matrix' || url === 'noctis://monitor' || url === 'netscope://matrix' || url === 'netscope://monitor') {
      this.openMatrixTab();
      return;
    }

    const active = this.getActiveTabRecord();
    if (!active) return;

    // If current active tab is a special tab (Vault or Monitor), open in a new web tab
    if (active.tabData && active.tabData.isSpecial) {
      await this.createTab(url, 'New Tab');
      return;
    }

    if (!active.webview) {
      await this.loadWebviewInTab(this.activeTabId, url);
    } else {
      const resolvedUrl = await this.resolveBeforeLoad(url);
      this.addressBar.value = url;
      active.webview.loadURL(resolvedUrl);
    }
  }

  updateTabLoading(tabId, isLoading) {
    const record = this.tabs.get(tabId);
    if (record && record.tabEl) {
      record.tabEl.classList.toggle('tab-loading', isLoading);
    }

    if (this.activeTabId === tabId) {
      this.btnReload.textContent = isLoading ? '✕' : '⟳';
    }
  }

  updateNavButtons() {
    const active = this.getActiveTabRecord();
    if (active && active.webview) {
      try {
        this.btnBack.disabled = !active.webview.canGoBack();
        this.btnForward.disabled = !active.webview.canGoForward();
      } catch (_) {
        this.btnBack.disabled = true;
        this.btnForward.disabled = true;
      }
    } else {
      this.btnBack.disabled = true;
      this.btnForward.disabled = true;
    }
  }

  getActiveTabRecord() {
    return this.tabs.get(this.activeTabId) || null;
  }
}

// Instantiate App & NetworkCockpit when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.browserApp = new BrowserApp();
  window.networkCockpit = new NetworkCockpit();
});
