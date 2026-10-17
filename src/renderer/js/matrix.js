// --- Full-Screen Network Matrix Dashboard Controller ---

const api = window.noctis || window.netscope || (window.parent && (window.parent.noctis || window.parent.netscope));

// Global shortcut support (Cmd+T / Ctrl+T) inside iframe
window.addEventListener('keydown', (e) => {
  const isMac = (typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform));
  const hasModifier = isMac ? (e.metaKey && !e.ctrlKey) : (e.ctrlKey && !e.metaKey);
  if (hasModifier && !e.altKey && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
    e.preventDefault();
    if (api && api.createTab) {
      api.createTab('about:blank', 'New Tab');
    } else if (window.parent && window.parent.browserApp) {
      window.parent.browserApp.createTab('about:blank', 'New Tab');
    }
  }
});

let isDiagnosingPath = false;

async function initMatrixDashboard() {
  if (!api) return;

  const btnRefresh = document.getElementById('btn-matrix-refresh');
  const btnExport = document.getElementById('btn-matrix-export');
  const btnTestPath = document.getElementById('btn-test-routing-path');
  const inputTestUrl = document.getElementById('input-test-url');

  btnRefresh.addEventListener('click', () => {
    loadMatrixData();
    refreshRoutingStatus();
  });

  btnExport.addEventListener('click', async () => {
    await api.saveHARFile();
  });

  if (btnTestPath) {
    btnTestPath.addEventListener('click', () => {
      const targetUrl = (inputTestUrl ? inputTestUrl.value : '') || 'https://example.com';
      runRoutingDiagnostic(targetUrl);
    });
  }

  if (inputTestUrl) {
    inputTestUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const targetUrl = inputTestUrl.value || 'https://example.com';
        runRoutingDiagnostic(targetUrl);
      }
    });
  }

  // Real-time Tor/VPN status listener
  if (api.onTorVpnStatusUpdated) {
    api.onTorVpnStatusUpdated((status) => {
      updateRoutingConfigDisplay(status);
    });
  }

  await refreshRoutingStatus();
  await loadMatrixData();

  // Run initial diagnostic check on load
  const initialUrl = (inputTestUrl ? inputTestUrl.value : '') || 'https://example.com';
  runRoutingDiagnostic(initialUrl);

  // Auto-refresh telemetry every 3 seconds while viewing
  setInterval(loadMatrixData, 3000);
}

async function refreshRoutingStatus() {
  if (!api || !api.getTorVpnStatus) return;
  try {
    const status = await api.getTorVpnStatus();
    updateRoutingConfigDisplay(status);
  } catch (_) {}
}

function updateRoutingConfigDisplay(status) {
  if (!status) return;

  const chipMode = document.getElementById('chip-routing-mode');
  const chipRelay = document.getElementById('chip-routing-relay');
  const chipDoh = document.getElementById('chip-routing-doh');
  const chipSec = document.getElementById('chip-routing-sec');
  const chipIp = document.getElementById('chip-routing-ip');
  const liveDot = document.getElementById('routing-live-dot');

  if (chipMode) {
    chipMode.textContent = status.modeLabel || status.mode.toUpperCase();
    chipMode.className = `routing-chip chip-mode mode-${status.badgeState || 'direct'}`;
  }

  if (chipRelay) {
    if (status.mode === 'built-in-vpn' && status.relayDetails) {
      chipRelay.textContent = `Relay: ${status.relayDetails.name}`;
      chipRelay.style.display = 'inline-flex';
    } else if (status.mode === 'tor') {
      chipRelay.textContent = status.daemons && status.daemons.torSocksPort
        ? `Tor Onion Circuit (: ${status.daemons.torSocksPort})`
        : 'Tor Circuit (Hybrid)';
      chipRelay.style.display = 'inline-flex';
    } else {
      chipRelay.style.display = 'none';
    }
  }

  if (chipDoh) {
    chipDoh.textContent = status.dnsOverHttps
      ? (status.forceDnssec ? 'DoH + DNSSEC Strict' : 'DNS-over-HTTPS')
      : 'System DNS';
    chipDoh.className = `routing-chip chip-doh ${status.dnsOverHttps ? 'active' : 'disabled'}`;
  }

  if (chipSec) {
    chipSec.textContent = status.requireSecureTraffic ? 'HTTPS-Only Enforced' : 'Plaintext Permitted';
    chipSec.className = `routing-chip chip-sec ${status.requireSecureTraffic ? 'active' : 'warning'}`;
  }

  if (chipIp) {
    if (status.mode === 'built-in-vpn' || status.mode === 'tor') {
      if (status.maskedIp && status.ipMaskVerified !== false) {
        const originNote = status.directBaselineIp ? ` (Origin ${status.directBaselineIp} Masked)` : '';
        chipIp.textContent = `Exit IP: ${status.maskedIp}${originNote}`;
        chipIp.className = 'routing-chip chip-ip active';
      } else {
        chipIp.textContent = 'Exit IP: UNMASKED (Relay Offline)';
        chipIp.className = 'routing-chip chip-ip warning';
      }
      chipIp.style.display = 'inline-flex';
    } else if (status.directBaselineIp) {
      chipIp.textContent = `Origin IP: ${status.directBaselineIp}`;
      chipIp.className = 'routing-chip chip-ip';
      chipIp.style.display = 'inline-flex';
    } else {
      chipIp.style.display = 'none';
    }
  }

  if (liveDot) {
    liveDot.className = `routing-dot ${status.badgeState === 'killswitch' ? 'killswitch' : 'active'}`;
  }
}

async function runRoutingDiagnostic(targetUrl) {
  if (!api || !api.testRoutingPath || isDiagnosingPath) return;

  isDiagnosingPath = true;
  const btnTest = document.getElementById('btn-test-routing-path');
  const btnText = document.getElementById('btn-test-text');
  const btnIcon = document.getElementById('btn-test-icon');

  if (btnTest) btnTest.disabled = true;
  if (btnText) btnText.textContent = 'Tracing Path...';
  if (btnIcon) btnIcon.textContent = '⏳';

  // Set all hop badges to active checking
  for (let i = 1; i <= 4; i++) {
    const badge = document.getElementById(`hop-status-${i}`);
    if (badge) {
      badge.textContent = 'PROBING';
      badge.className = 'hop-status-badge status-probing';
    }
  }

  try {
    const diagnostic = await api.testRoutingPath(targetUrl);
    if (diagnostic && diagnostic.hops) {
      renderDiagnosticHops(diagnostic);
      if (diagnostic.routingConfig) {
        updateRoutingConfigDisplay(diagnostic.routingConfig);
      }
    }
  } catch (err) {
    console.error('Failed to run routing path diagnostic:', err);
  } finally {
    isDiagnosingPath = false;
    if (btnTest) btnTest.disabled = false;
    if (btnText) btnText.textContent = 'Test & Validate Path';
    if (btnIcon) btnIcon.textContent = '⚡';
  }
}

function renderDiagnosticHops(diag) {
  const hops = diag.hops || [];

  hops.forEach(hop => {
    const num = hop.hopNumber;
    const card = document.getElementById(`hop-card-${num}`);
    const statusBadge = document.getElementById(`hop-status-${num}`);
    const msgEl = document.getElementById(`hop-msg-${num}`);
    const latencyEl = document.getElementById(`hop-latency-${num}`);

    if (statusBadge) {
      statusBadge.textContent = hop.status;
      statusBadge.className = `hop-status-badge status-${hop.status.toLowerCase()}`;
    }

    if (msgEl) {
      msgEl.textContent = hop.message || '';
    }

    if (latencyEl) {
      latencyEl.textContent = `${hop.latencyMs || 1} ms`;
    }

    if (card) {
      card.className = `routing-hop-card state-${hop.status.toLowerCase()}`;
    }

    // Dynamic Meta Tags
    if (num === 1) {
      const metaProxy = document.getElementById('hop-meta-1-proxy');
      if (metaProxy && hop.details) {
        metaProxy.textContent = `Policy: ${hop.details.isInsecureUpgraded ? 'Auto-Upgraded' : (hop.details.requireSecureTraffic ? 'HTTPS-Only' : 'Permissive')}`;
      }
    } else if (num === 2) {
      const metaDnssec = document.getElementById('hop-meta-2-dnssec');
      if (metaDnssec && hop.details) {
        metaDnssec.textContent = hop.details.dnssecValidated ? 'DNSSEC: Validated' : 'DNSSEC: Off';
      }
    } else if (num === 3) {
      const metaTransport = document.getElementById('hop-meta-3-transport');
      if (metaTransport && hop.details) {
        metaTransport.textContent = `Transport: ${hop.details.transportType || 'DIRECT'}`;
      }
    } else if (num === 4) {
      const metaIp = document.getElementById('hop-meta-4-ip');
      if (metaIp && hop.details) {
        if (hop.details.ipMaskVerified && hop.details.maskedExitIp) {
          metaIp.textContent = `Exit: ${hop.details.maskedExitIp} (Origin Masked)`;
        } else if (hop.status === 'UNMASKED_IP') {
          metaIp.textContent = `UNMASKED (${hop.details.directBaselineIp || 'Local IP'})`;
        } else {
          metaIp.textContent = `Exit: ${hop.details.maskedExitIp || 'Direct'}`;
        }
      }
    }
  });
}

async function loadMatrixData() {
  if (!api) return;
  const snapshot = await api.getSnapshot();
  if (!snapshot) return;

  const reqs = snapshot.recentRequests || [];
  const metrics = snapshot.metrics || {};

  // 1. KPI Cards
  document.getElementById('kpi-total-reqs').textContent = metrics.totalRequests || reqs.length;
  document.getElementById('kpi-total-bytes').textContent = formatBytes(metrics.totalBytes || 0);
  document.getElementById('kpi-total-blocked').textContent = metrics.totalBlocked || 0;
  document.getElementById('kpi-total-paused').textContent = snapshot.pausedCount || 0;
  document.getElementById('kpi-active-hosts').textContent = metrics.activeHostsCount || 0;

  // 2. Bandwidth by Destination
  const destBytesMap = new Map();
  const destReqsMap = new Map();
  const flowsMap = new Map(); // "source -> dest" -> { source, dest, count, bytes }
  const latencyList = [];

  reqs.forEach(r => {
    const dest = r.destination || 'other';
    const bytes = r.encodedDataLength || 0;
    const src = r.source || 'Main Frame';

    destBytesMap.set(dest, (destBytesMap.get(dest) || 0) + bytes);
    destReqsMap.set(dest, (destReqsMap.get(dest) || 0) + 1);

    const flowKey = `${src} -> ${dest}`;
    if (!flowsMap.has(flowKey)) {
      flowsMap.set(flowKey, { source: src, dest, count: 0, bytes: 0 });
    }
    const f = flowsMap.get(flowKey);
    f.count++;
    f.bytes += bytes;

    if (r.duration) {
      latencyList.push({ url: r.url, dest: r.destination, duration: r.duration, method: r.method });
    }
  });

  // Render Top Destinations by Bandwidth
  const sortedDest = Array.from(destBytesMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxBytes = sortedDest.length > 0 ? (sortedDest[0][1] || 1) : 1;
  const destListEl = document.getElementById('leaderboard-destinations');
  destListEl.innerHTML = '';

  if (sortedDest.length === 0) {
    destListEl.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">No network traffic recorded yet.</div>';
  } else {
    sortedDest.forEach(([host, bytes]) => {
      const pct = Math.max(4, Math.round((bytes / maxBytes) * 100));
      const reqCount = destReqsMap.get(host) || 0;

      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      item.innerHTML = `
        <div class="leaderboard-row">
          <span class="leaderboard-name" title="${host}">${host}</span>
          <span class="leaderboard-val">${formatBytes(bytes)} (${reqCount} reqs)</span>
        </div>
        <div class="leaderboard-track">
          <div class="leaderboard-fill" style="width: ${pct}%; background: var(--accent-cyan);"></div>
        </div>
      `;
      destListEl.appendChild(item);
    });
  }

  // Render Slowest Requests (Latency Leaderboard)
  const sortedLatency = latencyList.sort((a, b) => b.duration - a.duration).slice(0, 8);
  const maxLatency = sortedLatency.length > 0 ? (sortedLatency[0].duration || 1) : 1;
  const latencyListEl = document.getElementById('leaderboard-latency');
  latencyListEl.innerHTML = '';

  if (sortedLatency.length === 0) {
    latencyListEl.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">No completed requests with latency yet.</div>';
  } else {
    sortedLatency.forEach(r => {
      const pct = Math.max(4, Math.round((r.duration / maxLatency) * 100));
      const item = document.createElement('div');
      item.className = 'leaderboard-item';
      item.innerHTML = `
        <div class="leaderboard-row">
          <span class="leaderboard-name" title="${r.url}">[${r.method}] ${r.dest}</span>
          <span class="leaderboard-val">${r.duration} ms</span>
        </div>
        <div class="leaderboard-track">
          <div class="leaderboard-fill" style="width: ${pct}%; background: var(--accent-amber);"></div>
        </div>
      `;
      latencyListEl.appendChild(item);
    });
  }

  // Render Source -> Destination Flow Matrix
  const sortedFlows = Array.from(flowsMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  const flowContainer = document.getElementById('flow-matrix-container');
  flowContainer.innerHTML = '';

  if (sortedFlows.length === 0) {
    flowContainer.innerHTML = '<div style="color: var(--text-dim); padding: 12px;">No source-to-destination linkages detected yet.</div>';
  } else {
    sortedFlows.forEach(f => {
      const card = document.createElement('div');
      card.className = 'flow-card';
      card.innerHTML = `
        <span class="flow-source" title="${f.source}">${f.source}</span>
        <span class="flow-arrow">&rarr;</span>
        <span class="flow-destination" title="${f.dest}">${f.dest}</span>
        <span class="flow-meta">${f.count} reqs &bull; ${formatBytes(f.bytes)}</span>
      `;
      flowContainer.appendChild(card);
    });
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

window.addEventListener('DOMContentLoaded', initMatrixDashboard);
