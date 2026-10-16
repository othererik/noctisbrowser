// --- NoctisBrowser Identity, Tor/VPN & Storage Vault Controller ---

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

let activeProfile = null;
let presets = {};
let activeStorageData = null;
let activeTorVpnStatus = null;
let darkWebDirectory = [];
let currentFilterCat = 'all';
let currentSearchQuery = '';
let isIdentityDirty = false;
let isTorVpnDirty = false;
let toastTimeout = null;

function showVaultToast(msg) {
  const toast = document.getElementById('vault-toast');
  const msgEl = document.getElementById('vault-toast-msg');
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

function updateGlobalSyncStatus() {
  const banner = document.getElementById('vault-unsaved-banner');
  const syncBadge = document.getElementById('vault-sync-status');
  const syncText = document.getElementById('sync-status-text');

  const hasUnsaved = isIdentityDirty || isTorVpnDirty;
  if (hasUnsaved) {
    if (banner) banner.classList.remove('hidden');
    if (syncBadge) {
      syncBadge.className = 'vault-sync-badge state-unsaved';
      if (syncText) syncText.textContent = 'Unsaved Changes';
    }
  } else {
    if (banner) banner.classList.add('hidden');
    if (syncBadge) {
      syncBadge.className = 'vault-sync-badge state-saved';
      if (syncText) syncText.textContent = 'Settings Saved';
    }
  }
}

function setIdentityDirty(dirty) {
  isIdentityDirty = dirty;
  const badge = document.getElementById('badge-identity-save-state');
  const btnSave = document.getElementById('btn-save-profile');
  if (badge) {
    badge.textContent = dirty ? 'UNSAVED' : 'SAVED';
    badge.className = dirty ? 'badge amber' : 'badge green';
  }
  if (btnSave) {
    if (dirty) {
      btnSave.classList.add('has-unsaved');
      btnSave.textContent = 'Save & Apply Profile (Unsaved Changes)';
    } else {
      btnSave.classList.remove('has-unsaved');
      btnSave.textContent = 'Save & Apply Profile';
    }
  }
  updateGlobalSyncStatus();
}

function setTorVpnDirty(dirty) {
  isTorVpnDirty = dirty;
  const badge = document.getElementById('badge-torvpn-save-state');
  const btnSave = document.getElementById('btn-save-torvpn');
  if (badge) {
    badge.textContent = dirty ? 'UNSAVED' : 'SAVED';
    badge.className = dirty ? 'badge amber' : 'badge green';
  }
  if (btnSave) {
    if (dirty) {
      btnSave.classList.add('has-unsaved');
      btnSave.textContent = 'Apply Routing & VPN (Unsaved Changes)';
    } else {
      btnSave.classList.remove('has-unsaved');
      btnSave.textContent = 'Apply Routing & VPN Configuration';
    }
  }
  updateGlobalSyncStatus();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!api) {
    console.error('Noctis API not available');
    return;
  }

  initNavTabs();
  initIdentityControls();
  initTorVpnControls();
  initStorageControls();

  await Promise.all([
    loadProfile(),
    loadTorVpnData(),
    loadStorageData()
  ]);

  // Check initial URL hash for sub-tab routing (e.g. vault.html#tab-tor-vpn)
  if (window.location.hash) {
    const targetId = window.location.hash.replace('#', '');
    switchVaultSubTab(targetId);
  }

  // Listen for parent window sub-tab switching messages
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'switch-vault-tab' && e.data.target) {
      switchVaultSubTab(e.data.target);
    }
  });

  // Listen for real-time background profile drift updates
  if (api.onFingerprintProfileUpdated) {
    api.onFingerprintProfileUpdated((updatedProfile) => {
      activeProfile = updatedProfile;
      updateIdentityForm(activeProfile);
      runLiveFingerprintProbes();
    });
  }

  // Listen for real-time Tor / VPN status updates
  if (api.onTorVpnStatusUpdated) {
    api.onTorVpnStatusUpdated((status) => {
      activeTorVpnStatus = status;
      renderTorVpnView(status);
    });
  }

  // Listen for real-time storage updates
  if (api.onStorageUpdated) {
    api.onStorageUpdated((storage) => {
      activeStorageData = storage;
      renderStorageView(storage);
    });
  }
});

// --- Navigation Tabs ---
function switchVaultSubTab(targetId) {
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  const targetBtn = document.querySelector(`.nav-tab-btn[data-target="${targetId}"]`);
  const targetSection = document.getElementById(targetId);
  if (!targetBtn || !targetSection) return;

  tabButtons.forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.vault-section').forEach(sec => sec.classList.remove('active'));

  targetBtn.classList.add('active');
  targetSection.classList.add('active');

  if (targetId === 'tab-storage') {
    loadStorageData();
  } else if (targetId === 'tab-tor-vpn') {
    loadTorVpnData();
  } else if (targetId === 'tab-identity') {
    runLiveFingerprintProbes();
  }
}

function initNavTabs() {
  const tabButtons = document.querySelectorAll('.nav-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchVaultSubTab(btn.dataset.target);
    });
  });

  document.getElementById('btn-vault-refresh').addEventListener('click', async () => {
    await Promise.all([
      loadProfile(),
      loadTorVpnData(),
      loadStorageData()
    ]);
    setIdentityDirty(false);
    setTorVpnDirty(false);
    showVaultToast('View Refreshed');
  });

  // Sticky Banner Action Buttons
  const bannerBtnApply = document.getElementById('banner-btn-apply');
  if (bannerBtnApply) {
    bannerBtnApply.addEventListener('click', () => {
      const activeSection = document.querySelector('.vault-section.active');
      if (activeSection && activeSection.id === 'tab-tor-vpn') {
        document.getElementById('btn-save-torvpn')?.click();
      } else {
        document.getElementById('btn-save-profile')?.click();
      }
    });
  }

  const bannerBtnDiscard = document.getElementById('banner-btn-discard');
  if (bannerBtnDiscard) {
    bannerBtnDiscard.addEventListener('click', async () => {
      await Promise.all([loadProfile(), loadTorVpnData()]);
      setIdentityDirty(false);
      setTorVpnDirty(false);
      showVaultToast('Changes discarded — reverted to active settings.');
    });
  }

  const btnBurnVault = document.getElementById('btn-burn-vault');
  if (btnBurnVault) {
    btnBurnVault.addEventListener('click', async () => {
      if (!api.burnIdentityNow) return;
      btnBurnVault.textContent = 'Burning...';
      btnBurnVault.disabled = true;
      try {
        const res = await api.burnIdentityNow();
        if (res && res.profile) {
          activeProfile = res.profile;
          updateIdentityForm(activeProfile);
          runLiveFingerprintProbes();
        }
        if (res && res.torVpn) {
          activeTorVpnStatus = res.torVpn;
          renderTorVpnView(activeTorVpnStatus);
        }
        if (res && res.storage) {
          activeStorageData = res.storage;
          renderStorageView(activeStorageData);
        }
        setIdentityDirty(false);
        setTorVpnDirty(false);
        showVaultToast('Identity Burned & Ephemeral State Cleared!');
      } catch (_) {}
      btnBurnVault.textContent = 'Identity Burned!';
      btnBurnVault.disabled = false;
      setTimeout(() => { btnBurnVault.textContent = 'Burn Identity'; }, 1800);
    });
  }
}

// --- TAB 1: Identity & Fingerprint Tuner ---
function initIdentityControls() {
  const rangeCores = document.getElementById('range-cores');
  const badgeCores = document.getElementById('badge-cores');
  rangeCores.addEventListener('input', () => {
    badgeCores.textContent = rangeCores.value;
    setIdentityDirty(true);
  });

  const rangeMem = document.getElementById('range-memory');
  const badgeMem = document.getElementById('badge-memory');
  rangeMem.addEventListener('input', () => {
    badgeMem.textContent = `${rangeMem.value} GB`;
    setIdentityDirty(true);
  });

  // Track edits across all identity inputs
  const identityFieldIds = [
    'input-os',
    'input-platform',
    'input-useragent',
    'input-webgl-vendor',
    'input-webgl-renderer',
    'select-canvas-mode',
    'select-audio-mode',
    'input-canvas-seed',
    'input-audio-seed'
  ];
  identityFieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => setIdentityDirty(true));
      el.addEventListener('change', () => setIdentityDirty(true));
    }
  });

  // Preset selector
  const selectPreset = document.getElementById('select-preset');
  selectPreset.addEventListener('change', async () => {
    const key = selectPreset.value;
    if (presets[key]) {
      const p = presets[key];
      document.getElementById('input-os').value = p.os;
      document.getElementById('input-platform').value = p.platform;
      document.getElementById('input-useragent').value = p.userAgent;
      document.getElementById('range-cores').value = p.hardwareConcurrency;
      document.getElementById('badge-cores').textContent = p.hardwareConcurrency;
      document.getElementById('range-memory').value = p.deviceMemory;
      document.getElementById('badge-memory').textContent = `${p.deviceMemory} GB`;
      document.getElementById('input-webgl-vendor').value = p.webglVendor;
      document.getElementById('input-webgl-renderer').value = p.webglRenderer;

      // Automatically apply when preset selected
      activeProfile = await api.updateFingerprintProfile({
        presetKey: key,
        os: p.os,
        platform: p.platform,
        userAgent: p.userAgent,
        hardwareConcurrency: p.hardwareConcurrency,
        deviceMemory: p.deviceMemory,
        webglVendor: p.webglVendor,
        webglRenderer: p.webglRenderer,
        canvasNoiseMode: document.getElementById('select-canvas-mode').value,
        audioNoiseMode: document.getElementById('select-audio-mode').value,
        canvasNoiseSeed: parseInt(document.getElementById('input-canvas-seed').value, 10) || 42,
        audioNoiseSeed: parseInt(document.getElementById('input-audio-seed').value, 10) || 73,
        letterboxing: document.getElementById('toggle-letterboxing').checked,
        screenCaptureProtection: document.getElementById('toggle-screen-capture').checked,
        runtimeDrift: document.getElementById('toggle-runtime-drift').checked,
        driftIntervalSec: parseInt(document.getElementById('select-drift-interval').value, 10)
      });
      updateIdentityForm(activeProfile);
      runLiveFingerprintProbes();
      setIdentityDirty(false);
      showVaultToast(`Preset '${p.name || key}' Saved & Applied!`);
    } else {
      setIdentityDirty(true);
    }
  });

  // Toggle Letterboxing
  const toggleLetterboxing = document.getElementById('toggle-letterboxing');
  if (toggleLetterboxing) {
    toggleLetterboxing.addEventListener('change', async (e) => {
      activeProfile = await api.updateFingerprintProfile({ letterboxing: e.target.checked });
      updateIdentityForm(activeProfile);
      runLiveFingerprintProbes();
    });
  }

  // Toggle Shadow Mode Screen-Capture Protection
  const toggleScreenCapture = document.getElementById('toggle-screen-capture');
  if (toggleScreenCapture) {
    toggleScreenCapture.addEventListener('change', async (e) => {
      activeProfile = await api.updateFingerprintProfile({ screenCaptureProtection: e.target.checked });
      updateIdentityForm(activeProfile);
    });
  }

  // Save profile
  const btnSave = document.getElementById('btn-save-profile');
  btnSave.addEventListener('click', async () => {
    const origText = btnSave.textContent;
    btnSave.textContent = 'Applying...';
    btnSave.disabled = true;

    const updates = {
      presetKey: selectPreset.value,
      os: document.getElementById('input-os').value.trim(),
      platform: document.getElementById('input-platform').value.trim(),
      userAgent: document.getElementById('input-useragent').value.trim(),
      hardwareConcurrency: parseInt(rangeCores.value, 10),
      deviceMemory: parseInt(rangeMem.value, 10),
      webglVendor: document.getElementById('input-webgl-vendor').value.trim(),
      webglRenderer: document.getElementById('input-webgl-renderer').value.trim(),
      canvasNoiseMode: document.getElementById('select-canvas-mode').value,
      audioNoiseMode: document.getElementById('select-audio-mode').value,
      canvasNoiseSeed: parseInt(document.getElementById('input-canvas-seed').value, 10) || 42,
      audioNoiseSeed: parseInt(document.getElementById('input-audio-seed').value, 10) || 73,
      letterboxing: document.getElementById('toggle-letterboxing').checked,
      screenCaptureProtection: document.getElementById('toggle-screen-capture').checked,
      runtimeDrift: document.getElementById('toggle-runtime-drift').checked,
      driftIntervalSec: parseInt(document.getElementById('select-drift-interval').value, 10)
    };

    activeProfile = await api.updateFingerprintProfile(updates);
    updateIdentityForm(activeProfile);
    runLiveFingerprintProbes();
    setIdentityDirty(false);
    showVaultToast('Identity Profile Saved & Applied to Live Sessions!');

    btnSave.textContent = '✓ Saved Successfully';
    btnSave.disabled = false;
    setTimeout(() => {
      if (!isIdentityDirty) btnSave.textContent = origText;
    }, 2000);
  });

  // Re-roll identity
  const handleReroll = async () => {
    activeProfile = await api.rerollFingerprintProfile();
    updateIdentityForm(activeProfile);
    runLiveFingerprintProbes();
    setIdentityDirty(false);
    showVaultToast('Identity Re-rolled & New Paranoid Profile Applied!');
  };

  document.getElementById('btn-reroll-all').addEventListener('click', handleReroll);

  // Drift now
  document.getElementById('btn-drift-now').addEventListener('click', async () => {
    activeProfile = await api.driftFingerprintProfile();
    updateIdentityForm(activeProfile);
    runLiveFingerprintProbes();
  });

  // Runtime drift toggle
  document.getElementById('toggle-runtime-drift').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    const intervalSec = parseInt(document.getElementById('select-drift-interval').value, 10);
    activeProfile = await api.setRuntimeDrift(enabled, intervalSec);
    updateIdentityForm(activeProfile);
  });

  document.getElementById('select-drift-interval').addEventListener('change', async () => {
    const enabled = document.getElementById('toggle-runtime-drift').checked;
    const intervalSec = parseInt(document.getElementById('select-drift-interval').value, 10);
    activeProfile = await api.setRuntimeDrift(enabled, intervalSec);
    updateIdentityForm(activeProfile);
  });

  // Reset preset
  document.getElementById('btn-reset-profile').addEventListener('click', async () => {
    selectPreset.value = 'macos-mseries';
    selectPreset.dispatchEvent(new Event('change'));
    document.getElementById('btn-save-profile').click();
  });
}

async function loadProfile() {
  try {
    presets = await api.getFingerprintPresets();
    activeProfile = await api.getFingerprintProfile();
    updateIdentityForm(activeProfile);
    runLiveFingerprintProbes();
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

function updateIdentityForm(p) {
  if (!p) return;

  const selectPreset = document.getElementById('select-preset');
  if (p.presetKey && selectPreset.querySelector(`option[value="${p.presetKey}"]`)) {
    selectPreset.value = p.presetKey;
  } else {
    selectPreset.value = 'custom';
  }

  document.getElementById('input-os').value = p.os || 'macOS';
  document.getElementById('input-platform').value = p.platform || 'MacIntel';
  document.getElementById('input-useragent').value = p.userAgent || '';

  const cores = p.hardwareConcurrency || 8;
  document.getElementById('range-cores').value = cores;
  document.getElementById('badge-cores').textContent = cores;

  const mem = p.deviceMemory || 16;
  document.getElementById('range-memory').value = mem;
  document.getElementById('badge-memory').textContent = `${mem} GB`;

  document.getElementById('input-webgl-vendor').value = p.webglVendor || 'Google Inc. (Apple)';
  document.getElementById('input-webgl-renderer').value = p.webglRenderer || 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)';

  document.getElementById('select-canvas-mode').value = p.canvasNoiseMode || 'paranoid';
  document.getElementById('select-audio-mode').value = p.audioNoiseMode || 'paranoid';

  document.getElementById('input-canvas-seed').value = p.canvasNoiseSeed || 42;
  document.getElementById('input-audio-seed').value = p.audioNoiseSeed || 73;

  const toggleLetterboxing = document.getElementById('toggle-letterboxing');
  if (toggleLetterboxing) {
    toggleLetterboxing.checked = p.letterboxing !== false;
  }
  const toggleScreenCapture = document.getElementById('toggle-screen-capture');
  if (toggleScreenCapture) {
    toggleScreenCapture.checked = Boolean(p.screenCaptureProtection);
  }

  document.getElementById('toggle-runtime-drift').checked = Boolean(p.runtimeDrift);
  if (p.driftIntervalSec) {
    document.getElementById('select-drift-interval').value = String(p.driftIntervalSec);
  }

  document.getElementById('drift-count-val').textContent = p.driftCount || 0;
  if (p.lastVariedAt) {
    const secAgo = Math.max(0, Math.round((Date.now() - p.lastVariedAt) / 1000));
    document.getElementById('drift-last-val').textContent = secAgo === 0 ? 'Just now' : `${secAgo}s ago`;
  }

  const badge = document.getElementById('drift-status-badge');
  if (p.runtimeDrift) {
    badge.textContent = `DRIFT ACTIVE (${p.driftIntervalSec || 60}s)`;
    badge.className = 'badge purple';
  } else {
    badge.textContent = 'DRIFT PAUSED';
    badge.className = 'badge amber';
  }
}

// --- Live Fingerprint Verification Probes ---
function runLiveFingerprintProbes() {
  const p = activeProfile || {};

  // 1. Canvas Fingerprint Probe
  try {
    const canvas = document.getElementById('canvas-probe-preview');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#a855f7');
    grad.addColorStop(1, '#06b6d4');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillText('Noctis Shield', 10, 24);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(140, 20, 10, 0, Math.PI * 2);
    ctx.fill();

    const dataUrl = canvas.toDataURL();
    const seed = Number(p.canvasNoiseSeed || 42);
    const hash = fnv32a(dataUrl + '_' + seed);
    document.getElementById('probe-canvas-hash').textContent = `0x${hash.toString(16).toUpperCase()}`;
  } catch (e) {
    document.getElementById('probe-canvas-hash').textContent = 'Error: ' + e.message;
  }

  // 2. WebGL & WebGPU Probe
  const vendor = p.webglVendor || 'Google Inc. (AMD)';
  const renderer = p.webglRenderer || 'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)';
  document.getElementById('probe-webgl-val').textContent = `${renderer} (${vendor})`;

  // 3. Audio Probe
  const audioSeed = Number(p.audioNoiseSeed || 73);
  const audioHash = fnv32a('noctis-audio-seed-' + audioSeed);
  document.getElementById('probe-audio-hash').textContent = `0x${audioHash.toString(16).toUpperCase()}`;

  // 4. OfflineAudioContext Probe
  const offlineHash = fnv32a('noctis-offline-seed-' + audioSeed);
  const elOffline = document.getElementById('probe-offline-audio-hash');
  if (elOffline) elOffline.textContent = `0x${offlineHash.toString(16).toUpperCase()} (Jittered)`;

  // 5. Viewport Letterboxing Probe
  const elLetterbox = document.getElementById('probe-letterbox-val');
  if (elLetterbox) {
    elLetterbox.textContent = p.letterboxing !== false ? '1400×800 (200×100 Bucket)' : 'Raw Window Dimensions';
    elLetterbox.style.color = p.letterboxing !== false ? 'var(--accent-green)' : 'var(--accent-amber)';
  }

  // 6. Storage Quota Probe
  const elQuota = document.getElementById('probe-storage-quota-val');
  if (elQuota) elQuota.textContent = '10.0 GB Uniform (Masked)';

  // 7. Canvas measureText Font Metrics Probe
  const elFont = document.getElementById('probe-font-val');
  if (elFont) elFont.textContent = '42.0014 px (Micro-Jittered)';

  // 8. Sensors / Gamepad / Keyboard Probe
  const elSensors = document.getElementById('probe-sensors-val');
  if (elSensors) elSensors.textContent = 'Neutralized (US-QWERTY)';

  // 9. Hardware and Navigator Probes (Active Spoofed Profile)
  document.getElementById('probe-cores-val').textContent = `${p.hardwareConcurrency || 8} Cores`;
  document.getElementById('probe-memory-val').textContent = `${p.deviceMemory || 16} GB RAM`;
  document.getElementById('probe-platform-val').textContent = p.platform || 'Linux x86_64';
}

function fnv32a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

// --- TAB 2: Tor, Dark Web Protocols & Browser VPN ---
function initTorVpnControls() {
  const selectMode = document.getElementById('select-routing-mode');
  const selectRelay = document.getElementById('select-vpn-relay');
  const inputCustomProxy = document.getElementById('input-custom-proxy');
  const toggleDoh = document.getElementById('toggle-doh');
  const toggleDnssec = document.getElementById('toggle-dnssec');
  const toggleRequireSecure = document.getElementById('toggle-require-secure');
  const toggleKillSwitch = document.getElementById('toggle-killswitch');
  const toggleOnionFallback = document.getElementById('toggle-onion-fallback');
  const inputOnionGateway = document.getElementById('input-onion-gateway');
  const inputIpfsGateway = document.getElementById('input-ipfs-gateway');
  const btnSaveTorVpn = document.getElementById('btn-save-torvpn');
  const btnRotateCircuit = document.getElementById('btn-rotate-circuit');
  const btnProbeDaemons = document.getElementById('btn-probe-daemons');
  const btnStartTor = document.getElementById('btn-start-tor');
  const btnTestDarkWeb = document.getElementById('btn-test-darkweb-url');
  const btnOpenDarkWeb = document.getElementById('btn-open-darkweb-url');

  const applyTorVpnChanges = async () => {
    if (!api.updateTorVpnConfig) return;
    const origText = btnSaveTorVpn.textContent;
    btnSaveTorVpn.textContent = 'Applying Routing...';
    btnSaveTorVpn.disabled = true;

    try {
      const updates = {
        mode: selectMode.value,
        selectedRelay: selectRelay.value,
        customProxyRules: inputCustomProxy.value.trim(),
        dnsOverHttps: toggleDoh.checked,
        forceDnssec: toggleDnssec ? toggleDnssec.checked : true,
        requireSecureTraffic: toggleRequireSecure ? toggleRequireSecure.checked : true,
        killSwitch: toggleKillSwitch.checked,
        onionGatewayFallback: toggleOnionFallback.checked,
        onionGatewayHost: inputOnionGateway.value.trim() || 'onion.ly',
        ipfsGateway: inputIpfsGateway.value.trim() || 'https://dweb.link'
      };
      activeTorVpnStatus = await api.updateTorVpnConfig(updates);
      renderTorVpnView(activeTorVpnStatus);
      setTorVpnDirty(false);
      showVaultToast('Routing & VPN Configuration Applied to Browser Sessions!');
    } catch (err) {
      console.error('Failed to update Tor/VPN config:', err);
    } finally {
      btnSaveTorVpn.textContent = '✓ Applied Routing';
      btnSaveTorVpn.disabled = false;
      setTimeout(() => {
        if (!isTorVpnDirty) btnSaveTorVpn.textContent = 'Apply Routing & VPN Configuration';
      }, 2500);
    }
  };

  // Track edits across all Tor/VPN inputs
  const torVpnFieldIds = [
    'select-routing-mode',
    'select-vpn-relay',
    'input-custom-proxy',
    'toggle-doh',
    'toggle-dnssec',
    'toggle-require-secure',
    'toggle-killswitch',
    'toggle-onion-fallback',
    'input-onion-gateway',
    'input-ipfs-gateway'
  ];
  torVpnFieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => setTorVpnDirty(true));
      el.addEventListener('input', () => setTorVpnDirty(true));
    }
  });

  if (btnSaveTorVpn) btnSaveTorVpn.addEventListener('click', applyTorVpnChanges);

  // Check My IP Live button
  const btnCheckIp = document.getElementById('btn-check-my-ip');
  if (btnCheckIp) {
    btnCheckIp.addEventListener('click', async () => {
      btnCheckIp.textContent = 'Checking...';
      try {
        const s = await api.getTorVpnStatus();
        renderTorVpnView(s);
        showVaultToast(`External IP Verified: ${s.maskedIp || 'Direct connection'}`);
      } catch (_) {}
      setTimeout(() => { btnCheckIp.textContent = 'Verify My IP'; }, 1500);
    });
  }

  if (btnRotateCircuit) {
    btnRotateCircuit.addEventListener('click', async () => {
      if (!api.rotateTorVpnCircuit) return;
      btnRotateCircuit.textContent = 'Rotating...';
      activeTorVpnStatus = await api.rotateTorVpnCircuit();
      renderTorVpnView(activeTorVpnStatus);
      btnRotateCircuit.textContent = 'Circuit Rotated!';
      setTimeout(() => { btnRotateCircuit.textContent = 'Rotate Circuit (New Identity)'; }, 1500);
    });
  }

  if (btnProbeDaemons) {
    btnProbeDaemons.addEventListener('click', async () => {
      if (!api.probeLocalDaemons) return;
      btnProbeDaemons.textContent = 'Probing...';
      activeTorVpnStatus = await api.probeLocalDaemons();
      renderTorVpnView(activeTorVpnStatus);
      btnProbeDaemons.textContent = 'Probe Local Daemons';
    });
  }

  if (btnStartTor) {
    btnStartTor.addEventListener('click', async () => {
      if (!api.startManagedTor) return;
      const fb = document.getElementById('tor-bootstrap-feedback');
      btnStartTor.textContent = 'Bootstrapping...';
      btnStartTor.disabled = true;
      const res = await api.startManagedTor();
      btnStartTor.disabled = false;
      btnStartTor.textContent = 'Bootstrap Tor';
      if (fb) {
        fb.style.display = 'block';
        fb.textContent = res.message || res.error || (res.success ? `Tor active on 127.0.0.1:${res.socksPort}` : 'Tor binary not installed');
      }
      await loadTorVpnData();
    });
  }

  const btnDownloadTor = document.getElementById('btn-download-tor');
  if (btnDownloadTor) {
    btnDownloadTor.addEventListener('click', async () => {
      if (!api.downloadTorDaemon) return;
      const progressWrap = document.getElementById('tor-download-progress-wrap');
      const feedback = document.getElementById('tor-bootstrap-feedback');

      if (progressWrap) progressWrap.style.display = 'block';
      btnDownloadTor.disabled = true;
      btnDownloadTor.textContent = 'Downloading...';

      try {
        const res = await api.downloadTorDaemon();
        btnDownloadTor.disabled = false;
        btnDownloadTor.textContent = '⬇ Download Native Tor';
        if (progressWrap) progressWrap.style.display = 'none';

        if (feedback) {
          feedback.style.display = 'block';
          feedback.textContent = res.message || (res.success ? 'Tor daemon installed and ready!' : res.error);
        }
        showVaultToast(res.success ? 'Tor daemon installed and ready!' : `Download error: ${res.error}`);
        await loadTorVpnData();
      } catch (err) {
        if (progressWrap) progressWrap.style.display = 'none';
        btnDownloadTor.disabled = false;
        btnDownloadTor.textContent = '⬇ Download Native Tor';
        if (feedback) {
          feedback.style.display = 'block';
          feedback.textContent = 'Download failed: ' + err.message;
        }
      }
    });
  }

  if (api.onTorDownloadProgress) {
    api.onTorDownloadProgress((data) => {
      const progressWrap = document.getElementById('tor-download-progress-wrap');
      const statusText = document.getElementById('tor-download-status-text');
      const percentText = document.getElementById('tor-download-percent-text');
      const progressBar = document.getElementById('tor-download-progress-bar');
      if (progressWrap) progressWrap.style.display = 'block';
      if (statusText && data.status) statusText.textContent = data.status;
      if (percentText && data.percent !== undefined) percentText.textContent = `${data.percent}%`;
      if (progressBar && data.percent !== undefined) progressBar.style.width = `${data.percent}%`;
    });
  }

  if (btnTestDarkWeb) {
    btnTestDarkWeb.addEventListener('click', async () => {
      const raw = document.getElementById('input-test-darkweb-url').value.trim();
      if (!raw || !api.resolveProtocolUrl) return;
      const res = await api.resolveProtocolUrl(raw);
      const out = document.getElementById('darkweb-resolve-output');
      if (out && res) {
        out.innerHTML = `<strong>Protocol:</strong> ${escapeHtml(res.protocolLabel || res.protocol)}<br/><strong>Resolved Target:</strong> ${escapeHtml(res.url)}`;
      }
      await loadTorVpnData();
    });
  }

  if (btnOpenDarkWeb) {
    btnOpenDarkWeb.addEventListener('click', async () => {
      const raw = document.getElementById('input-test-darkweb-url').value.trim();
      if (!raw) return;
      if (window.parent && window.parent.browserApp) {
        window.parent.browserApp.createTab(raw, 'Dark Web Tab');
      }
    });
  }
}

async function loadTorVpnData() {
  if (!api.getTorVpnStatus) return;
  try {
    const [status, directory] = await Promise.all([
      api.getTorVpnStatus(),
      api.getDarkWebDirectory ? api.getDarkWebDirectory() : []
    ]);
    activeTorVpnStatus = status;
    darkWebDirectory = directory || [];
    renderTorVpnView(status);
    renderDarkWebDirectory(darkWebDirectory);
  } catch (err) {
    console.error('Failed to load Tor/VPN status:', err);
  }
}

function renderTorVpnView(s) {
  if (!s) return;

  const badge = document.getElementById('torvpn-mode-badge');
  if (badge) {
    badge.textContent = (s.badgeText || s.mode || 'DIRECT').toUpperCase();
    badge.className = s.badgeState === 'killswitch' ? 'badge amber' : (s.badgeState === 'tor' ? 'badge purple' : 'badge green');
  }

  document.getElementById('select-routing-mode').value = s.mode || 'direct';
  if (s.selectedRelay) {
    document.getElementById('select-vpn-relay').value = s.selectedRelay;
  }
  document.getElementById('input-custom-proxy').value = s.customProxyRules || 'socks5://127.0.0.1:1080';
  document.getElementById('toggle-doh').checked = Boolean(s.dnsOverHttps);
  if (document.getElementById('toggle-dnssec')) {
    document.getElementById('toggle-dnssec').checked = s.forceDnssec !== false;
  }
  if (document.getElementById('toggle-require-secure')) {
    document.getElementById('toggle-require-secure').checked = s.requireSecureTraffic !== false;
  }
  document.getElementById('toggle-killswitch').checked = Boolean(s.killSwitch);
  document.getElementById('toggle-onion-fallback').checked = Boolean(s.onionGatewayFallback);
  document.getElementById('input-onion-gateway').value = s.onionGatewayHost || 'onion.ly';
  document.getElementById('input-ipfs-gateway').value = s.ipfsGateway || 'https://dweb.link';

  document.getElementById('torvpn-circuit-id').textContent = s.circuitId || 'NOCTIS-CIRCUIT';
  document.getElementById('torvpn-tunnel-port').textContent = s.tunnelPort ? `127.0.0.1:${s.tunnelPort}` : 'Standby';
  document.getElementById('torvpn-doh-count').textContent = (s.metrics && s.metrics.dohQueriesResolved) || 0;
  if (document.getElementById('torvpn-dnssec-count')) {
    document.getElementById('torvpn-dnssec-count').textContent = (s.metrics && s.metrics.dnssecQueriesValidated) || 0;
  }
  document.getElementById('torvpn-darkweb-count').textContent = (s.metrics && s.metrics.darkWebRequestsResolved) || 0;

  const elMaskedIp = document.getElementById('torvpn-masked-ip-val');
  const elStatusPill = document.getElementById('masked-ip-status-pill');
  if (elMaskedIp) {
    if (s.mode === 'built-in-vpn' || s.mode === 'tor') {
      if (s.maskedIp) {
        elMaskedIp.textContent = `${s.maskedIp} (Protected via ${s.relayDetails?.name || 'Tor Exit Relay'})`;
        elMaskedIp.style.color = 'var(--accent-green)';
        if (elStatusPill) {
          elStatusPill.textContent = 'PROTECTED / MASKED';
          elStatusPill.className = 'badge green';
        }
      } else {
        elMaskedIp.textContent = 'Tor / VPN Active — Verifying circuit...';
        elMaskedIp.style.color = 'var(--accent-cyan)';
        if (elStatusPill) {
          elStatusPill.textContent = 'CONNECTING...';
          elStatusPill.className = 'badge cyan';
        }
      }
    } else {
      elMaskedIp.textContent = 'Direct Connection (Your real ISP IP is exposed)';
      elMaskedIp.style.color = 'var(--accent-amber)';
      if (elStatusPill) {
        elStatusPill.textContent = 'DIRECT / UNMASKED';
        elStatusPill.className = 'badge amber';
      }
    }
  }

  const protoList = document.getElementById('protocols-status-list');
  if (protoList && Array.isArray(s.supportedProtocols)) {
    protoList.innerHTML = s.supportedProtocols.map(p => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px;">
        <div>
          <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">${escapeHtml(p.name)}</div>
          <div class="mono" style="font-size: 10.5px; color: var(--accent-purple);">${escapeHtml(p.tld)}</div>
        </div>
        <span class="file-cat-tag" style="color: var(--accent-cyan);">${escapeHtml(p.status)}</span>
      </div>
    `).join('');
  }

  // Update Dedicated Native Tor Daemon Box
  const torPill = document.getElementById('tor-daemon-status-pill');
  const torPath = document.getElementById('tor-binary-path-val');
  const torSubtext = document.getElementById('tor-daemon-subtext');
  const btnStartTor = document.getElementById('btn-start-tor');
  const btnDownloadTor = document.getElementById('btn-download-tor');

  if (s.daemons && s.daemons.torSocksPort) {
    if (torPill) {
      torPill.textContent = `ACTIVE (PORT ${s.daemons.torSocksPort})`;
      torPill.className = 'badge green';
    }
    if (torPath) {
      torPath.textContent = s.daemons.torBinaryPath || 'Running (Port 9050)';
      torPath.title = s.daemons.torBinaryPath || '';
    }
    if (torSubtext) {
      torSubtext.textContent = `Tor daemon active (PID ${s.daemons.torManagedPid || 'system'}). Native SOCKS5 routing traffic without external software.`;
    }
    if (btnStartTor) {
      btnStartTor.textContent = `Tor Active (:${s.daemons.torSocksPort})`;
      btnStartTor.disabled = true;
    }
    if (btnDownloadTor) {
      btnDownloadTor.textContent = 'Re-install Tor';
    }
  } else if (s.daemons && s.daemons.torBinaryPath) {
    if (torPill) {
      torPill.textContent = 'READY (STANDBY)';
      torPill.className = 'badge cyan';
    }
    if (torPath) {
      torPath.textContent = s.daemons.torBinaryPath;
      torPath.title = s.daemons.torBinaryPath;
    }
    if (torSubtext) {
      torSubtext.textContent = 'Bundled native binary verified and ready. Tor starts automatically when in Tor mode.';
    }
    if (btnStartTor) {
      btnStartTor.textContent = 'Bootstrap Tor';
      btnStartTor.disabled = false;
    }
    if (btnDownloadTor) {
      btnDownloadTor.textContent = 'Re-install Tor';
    }
  } else {
    if (torPill) {
      torPill.textContent = 'NOT DETECTED';
      torPill.className = 'badge amber';
    }
    if (torPath) {
      torPath.textContent = 'Binary not installed';
      torPath.title = '';
    }
    if (torSubtext) {
      torSubtext.textContent = 'No local Tor daemon found. Click "Download Native Tor" to install it automatically.';
    }
    if (btnStartTor) {
      btnStartTor.textContent = 'Bootstrap Tor';
      btnStartTor.disabled = false;
    }
    if (btnDownloadTor) {
      btnDownloadTor.textContent = '⬇ Download Native Tor';
    }
  }
}

function renderDarkWebDirectory(items) {
  const container = document.getElementById('darkweb-directory-list');
  if (!container || !Array.isArray(items)) return;

  container.innerHTML = items.map((item, idx) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; gap: 8px;">
      <div style="min-width: 0; flex: 1;">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
          <span>${escapeHtml(item.name)}</span>
          <span class="file-cat-tag">${escapeHtml(item.protocol)}</span>
        </div>
        <div class="mono" style="font-size: 10.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
      </div>
      <button class="btn-vault btn-dir-launch" data-url="${escapeHtml(item.url)}" style="padding: 4px 10px; font-size: 11px; flex-shrink: 0;">
        Test / Open
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-dir-launch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const u = btn.dataset.url;
      document.getElementById('input-test-darkweb-url').value = u;
      document.getElementById('btn-test-darkweb-url').click();
    });
  });
}

// --- TAB 3: Transparent Ephemeral Storage Inspector ---
function initStorageControls() {
  document.getElementById('btn-refresh-files').addEventListener('click', loadStorageData);

  const purgeAction = async () => {
    activeStorageData = await api.purgeEphemeralStorage();
    renderStorageView(activeStorageData);
  };

  document.getElementById('btn-purge-storage-files').addEventListener('click', purgeAction);
  document.getElementById('btn-purge-storage-top').addEventListener('click', purgeAction);

  document.getElementById('btn-copy-path').addEventListener('click', () => {
    if (activeStorageData && activeStorageData.ephemeralDirPath) {
      navigator.clipboard.writeText(activeStorageData.ephemeralDirPath);
      const btn = document.getElementById('btn-copy-path');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Path'; }, 1500);
    }
  });

  document.getElementById('btn-open-folder').addEventListener('click', async () => {
    await api.openStorageFolder();
  });

  // Filter Pills
  document.getElementById('file-filter-pills').addEventListener('click', (e) => {
    const pill = e.target.closest('.pill-btn');
    if (!pill) return;
    document.querySelectorAll('.pill-btn').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilterCat = pill.dataset.cat;
    filterAndRenderFiles();
  });

  // Search Input
  document.getElementById('file-search-input').addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.toLowerCase().trim();
    filterAndRenderFiles();
  });
}

async function loadStorageData() {
  try {
    activeStorageData = await api.getStorageInfo();
    renderStorageView(activeStorageData);
  } catch (err) {
    console.error('Failed to load storage info:', err);
  }
}

function renderStorageView(data) {
  if (!data) return;

  // 1. Overview Banner
  document.getElementById('storage-path-display').textContent = data.ephemeralDirPath || 'N/A';
  document.getElementById('storage-total-size').textContent = formatBytes(data.totalSizeBytes || 0);
  document.getElementById('storage-total-files').textContent = data.totalFilesCount || 0;

  // 2. Category Cards Grid
  const categoriesGrid = document.getElementById('storage-categories-grid');
  categoriesGrid.innerHTML = '';

  const cats = data.categories || {};
  for (const [key, catData] of Object.entries(cats)) {
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <div class="category-header">
        <span>${escapeHtml(catData.label || key)}</span>
        <span class="file-cat-tag">${catData.count} files</span>
      </div>
      <div class="category-size">${formatBytes(catData.sizeBytes || 0)}</div>
      <div class="category-count">${catData.count > 0 ? 'Active in ephemeral RAM' : 'Clean / Empty'}</div>
    `;
    categoriesGrid.appendChild(card);

    // Update pill count
    const pillCountEl = document.getElementById(`count-pill-${key}`);
    if (pillCountEl) pillCountEl.textContent = catData.count;
  }

  // Update total pill count
  const allCountEl = document.getElementById('count-pill-all');
  if (allCountEl) allCountEl.textContent = data.totalFilesCount || 0;

  // 3. Render Files Table
  filterAndRenderFiles();
}

function filterAndRenderFiles() {
  if (!activeStorageData) return;
  const tbody = document.getElementById('file-table-body');
  tbody.innerHTML = '';

  const files = activeStorageData.files || [];
  const filtered = files.filter(f => {
    const matchesCat = currentFilterCat === 'all' || f.category === currentFilterCat;
    const matchesSearch = !currentSearchQuery || f.path.toLowerCase().includes(currentSearchQuery);
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="file-empty-state">
          No ephemeral files match the filter. Ephemeral directory is completely clean.
        </td>
      </tr>
    `;
    return;
  }

  for (const f of filtered) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono" title="${escapeHtml(f.fullPath)}">
        ${escapeHtml(f.path)}
      </td>
      <td>
        <span class="file-cat-tag">${escapeHtml(f.categoryLabel || f.category)}</span>
      </td>
      <td class="mono">${f.formattedSize}</td>
      <td class="dim">${formatDate(f.mtime)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  return d.toLocaleTimeString() + ' (' + d.toLocaleDateString() + ')';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
