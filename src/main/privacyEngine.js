const { URL } = require('url');
const fs = require('fs');

const CHROME_MAJOR = '146';
const CHROME_VERSION = '146.0.0.0';
const CHROME_FULL_VERSION = '146.0.7680.216';

// Curated fingerprint personas with matched user-agents, client hints, and GPUs
const FINGERPRINT_PRESETS = {
  'macos-mseries': {
    name: 'macOS Apple Silicon (M-Series)',
    os: 'macOS',
    platform: 'MacIntel',
    platformVersion: '15.0.0',
    architecture: 'arm',
    bitness: '64',
    model: '',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    timezone: 'America/New_York',
    screen: {
      width: 1728,
      height: 1117,
      availWidth: 1728,
      availHeight: 1080,
      colorDepth: 24,
      pixelDepth: 24,
      devicePixelRatio: 2
    }
  },
  'windows-nvidia': {
    name: 'Windows 11 x64 (NVIDIA RTX 4070)',
    os: 'Windows',
    platform: 'Win32',
    platformVersion: '15.0.0',
    architecture: 'x86',
    bitness: '64',
    model: '',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    hardwareConcurrency: 16,
    deviceMemory: 16,
    timezone: 'America/New_York',
    screen: {
      width: 1920,
      height: 1080,
      availWidth: 1920,
      availHeight: 1040,
      colorDepth: 24,
      pixelDepth: 24,
      devicePixelRatio: 1
    }
  },
  'linux-amd': {
    name: 'Linux Ubuntu x86_64 (AMD Radeon RX 6700)',
    os: 'Linux',
    platform: 'Linux x86_64',
    platformVersion: '6.5.0',
    architecture: 'x86',
    bitness: '64',
    model: '',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    appVersion: '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    webglVendor: 'Google Inc. (AMD)',
    webglRenderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)',
    hardwareConcurrency: 12,
    deviceMemory: 16,
    timezone: 'UTC',
    screen: {
      width: 2560,
      height: 1440,
      availWidth: 2560,
      availHeight: 1400,
      colorDepth: 24,
      pixelDepth: 24,
      devicePixelRatio: 1
    }
  }
};

// Core built-in ad networks, tracking platforms, and sponsored feed domains
const BUILTIN_AD_AND_TRACKER_HOSTS = [
  // --- Major Ad Networks & Ad Delivery ---
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'adservice.google.ca',
  'adservice.google.co.uk',
  'amazon-adsystem.com',
  'aax.amazon-adsystem.com',
  'adnxs.com',
  'adnxs-simple.com',
  'appnexus.com',
  'criteo.com',
  'criteo.net',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'openx.com',
  'casalemedia.com',
  'media.net',
  'lijit.com',
  '3lift.com',
  'triplelift.com',
  'smartadserver.com',
  'buysellads.com',
  'buysellads.net',
  'bidswitch.net',
  'ezoic.net',
  'infolinks.com',
  'yieldmo.com',
  'teads.tv',
  'gumgum.com',
  'sharethrough.com',
  'kargo.com',
  'smaato.net',
  'adform.net',
  'rlcdn.com',
  'popads.net',
  'adblade.com',
  'moatads.com',
  'adsafeprotected.com',
  'doubleverify.com',
  'aniview.com',
  'undertone.com',
  'contextweb.com',
  'adtech.de',
  'adtechus.com',
  'exponential.com',
  'advertising.com',
  'adroll.com',
  'bidtheatre.com',
  'serving-sys.com',

  // --- Sponsored Recommendation Feeds & Content Widgets ---
  'taboola.com',
  'taboolasyndication.com',
  'outbrain.com',
  'outbrainimg.com',
  'zemanta.com',
  'revcontent.com',
  'nativo.com',
  'nativo.net',
  'content.ad',
  'mgid.com',
  'zergnet.com',
  'dianomi.com',
  'gemini.yahoo.com',
  'advertising.yahoo.com',
  'cpro.baidustatic.com',

  // --- Analytics, Telemetry & User Profiling Trackers ---
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'googletagservices.com',
  'connect.facebook.net',
  'analytics.tiktok.com',
  'static.ads-twitter.com',
  'analytics.twitter.com',
  'snap.licdn.com',
  'px.ads.linkedin.com',
  'ct.pinterest.com',
  'sc-static.net',
  'tr.snapchat.com',
  'clarity.ms',
  'hotjar.com',
  'segment.io',
  'segment.com',
  'amplitude.com',
  'mixpanel.com',
  'heapanalytics.com',
  'fullstory.com',
  'logrocket.io',
  'mouseflow.com',
  'crazyegg.com',
  'luckyorange.com',
  'smartlook.com',
  'optimizely.com',
  'scorecardresearch.com',
  'quantserve.com',
  'quantcast.com',
  'chartbeat.com',
  'mc.yandex.ru',
  'hm.baidu.com',
  'fpjs.io',
  'fingerprintjs.com',
  'iovation.com',
  'threatmetrix.com',
  'maxmind.com',
  'perimeterx.net',
  'siftscience.com',
  'castle.io',
  'appsflyer.com',
  'branch.io',
  'adjust.com',
  'kochava.com'
];

class PrivacyEngine {
  constructor() {
    this.denyByDefaultTrackers = true;
    this.obfuscateFingerprint = true;
    this.stripTrackingParams = true;

    // Fast O(1) set of blocked ad and tracker hosts
    this.adTrackerHosts = new Set(BUILTIN_AD_AND_TRACKER_HOSTS.map(h => h.toLowerCase()));

    // Active feed metadata
    this.activeFeedName = 'Built-in Ad & Tracker Shield';
    this.feedDomainsCount = 0;

    // Dynamic Fingerprint Profile
    const basePreset = FINGERPRINT_PRESETS['macos-mseries'];
    this.activeProfile = {
      ...basePreset,
      presetKey: 'macos-mseries',
      canvasNoiseMode: 'paranoid', // 'off', 'subtle', 'paranoid', 'extreme'
      canvasNoiseSeed: Math.floor(Math.random() * 900000) + 100000,
      audioNoiseMode: 'paranoid',  // 'off', 'subtle', 'paranoid', 'extreme'
      audioNoiseSeed: Math.floor(Math.random() * 900000) + 100000,
      letterboxing: true,          // 200x100 viewport quantization (Tor/Mullvad/DarkBrowser)
      screenCaptureProtection: false, // OS screen-capture exclusion (Shadow Browser)
      runtimeDrift: true,
      driftIntervalSec: 60,
      driftOnNavigation: true,
      driftCount: 0,
      lastVariedAt: Date.now()
    };

    // Pattern-based rules (for specific paths, query endpoints, and CDN sub-bundles)
    this.trackerPatterns = [
      '*google-analytics.com*',
      '*googletagmanager.com*',
      '*googletagservices.com*',
      '*doubleclick.net*',
      '*googleadservices.com*',
      '*google.com/pagead/*',
      '*google.com/analytics/*',
      '*analytics.google.com*',
      '*pagead2.googlesyndication.com*',
      '*adservice.google.*',
      '*facebook.com/tr*',
      '*connect.facebook.net*',
      '*facebook.net/signals*',
      '*clarity.ms*',
      '*bing.com/bat.js*',
      '*msads.net*',
      '*taboola.com*',
      '*taboolasyndication.com*',
      '*outbrain.com*',
      '*revcontent.com*',
      '*gemini.yahoo.com*',
      '*cpro.baidustatic.com*',
      '*fpjs.io*',
      '*fingerprintjs.com*',
      '*api.fpjs.io*',
      '*cdn.jsdelivr.net/npm/@fingerprintjs/*',
      '*iovation.com*',
      '*threatmetrix.com*',
      '*perimeterx.net*',
      '*hotjar.com*',
      '*segment.io*',
      '*segment.com/analytics.js*',
      '*mixpanel.com*',
      '*amplitude.com*',
      '*heapanalytics.com*',
      '*fullstory.com*',
      '*logrocket.io*',
      '*mouseflow.com*',
      '*crazyegg.com*',
      '*luckyorange.com*',
      '*smartlook.com*',
      '*scorecardresearch.com*',
      '*quantserve.com*',
      '*quantcast.com*'
    ];

    this.heuristicKeywords = [
      '/telemetry',
      '/analytics',
      '/tracking',
      '/tracker',
      '/beacon',
      '/collect?',
      '/collect/',
      '/pixel.gif',
      '/pixel.png',
      '/event/track',
      '/events/log',
      '/track/event',
      '/stats/log',
      '/ads.js',
      '/adsbygoogle.js',
      '/prebid.js',
      '/adservice/',
      '/adserver/',
      '/sponsored-feed/',
      '/recommendation-feed/',
      '/native-ads/'
    ];

    this.compiledPatterns = this.trackerPatterns.map(p => ({
      pattern: p,
      regex: new RegExp('^' + p.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i')
    }));

    // Counters
    this.blockedTrackersCount = 0;
    this.blockedAdsCount = 0;
    this.probesObfuscatedCount = 0;
  }

  // --- Dynamic Fingerprint Management & Runtime Variation ---

  getProfile() {
    return JSON.parse(JSON.stringify(this.activeProfile));
  }

  getPresets() {
    return FINGERPRINT_PRESETS;
  }

  updateProfile(updates = {}) {
    if (typeof updates !== 'object' || updates === null) return this.getProfile();

    // If presetKey changed, apply base preset first
    if (updates.presetKey && FINGERPRINT_PRESETS[updates.presetKey]) {
      const preset = FINGERPRINT_PRESETS[updates.presetKey];
      Object.assign(this.activeProfile, preset, { presetKey: updates.presetKey });
    }

    // Merge scalar attributes
    const allowedKeys = [
      'os', 'platform', 'platformVersion', 'architecture', 'bitness', 'model',
      'userAgent', 'appVersion', 'webglVendor', 'webglRenderer',
      'hardwareConcurrency', 'deviceMemory', 'timezone',
      'canvasNoiseMode', 'canvasNoiseSeed',
      'audioNoiseMode', 'audioNoiseSeed',
      'letterboxing', 'screenCaptureProtection',
      'runtimeDrift', 'driftIntervalSec', 'driftOnNavigation'
    ];

    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        this.activeProfile[key] = updates[key];
      }
    }

    if (updates.screen && typeof updates.screen === 'object') {
      this.activeProfile.screen = {
        ...this.activeProfile.screen,
        ...updates.screen
      };
    }

    this.activeProfile.lastVariedAt = Date.now();
    return this.getProfile();
  }

  /**
   * Re-roll an entirely fresh randomized persona with plausible combinations.
   */
  reRollProfile(targetPresetKey = null) {
    const presetKeys = Object.keys(FINGERPRINT_PRESETS);
    const key = targetPresetKey && FINGERPRINT_PRESETS[targetPresetKey]
      ? targetPresetKey
      : presetKeys[Math.floor(Math.random() * presetKeys.length)];

    const basePreset = FINGERPRINT_PRESETS[key];
    const realisticCores = [4, 6, 8, 10, 12, 16];
    const realisticMem = [8, 16, 32];
    const cores = realisticCores[Math.floor(Math.random() * realisticCores.length)];
    const mem = realisticMem[Math.floor(Math.random() * realisticMem.length)];

    // Fresh cryptographic noise seeds
    const canvasSeed = Math.floor(Math.random() * 900000) + 100000;
    const audioSeed = Math.floor(Math.random() * 900000) + 100000;

    // Mutate WebGL renderer string slightly
    let renderer = basePreset.webglRenderer;
    if (key === 'macos-mseries') {
      const chips = ['M1 Pro', 'M2 Pro', 'M2 Max', 'M3 Pro', 'M3 Max'];
      const chip = chips[Math.floor(Math.random() * chips.length)];
      renderer = `ANGLE (Apple, Apple ${chip}, OpenGL 4.1)`;
    } else if (key === 'windows-nvidia') {
      const gpus = ['RTX 3070', 'RTX 3080', 'RTX 4070', 'RTX 4080'];
      const gpu = gpus[Math.floor(Math.random() * gpus.length)];
      renderer = `ANGLE (NVIDIA, NVIDIA GeForce ${gpu} Direct3D11 vs_5_0 ps_5_0, D3D11)`;
    }

    this.activeProfile = {
      ...basePreset,
      presetKey: key,
      webglRenderer: renderer,
      hardwareConcurrency: cores,
      deviceMemory: mem,
      canvasNoiseMode: this.activeProfile.canvasNoiseMode || 'paranoid',
      canvasNoiseSeed: canvasSeed,
      audioNoiseMode: this.activeProfile.audioNoiseMode || 'paranoid',
      audioNoiseSeed: audioSeed,
      letterboxing: this.activeProfile.letterboxing !== undefined ? this.activeProfile.letterboxing : true,
      screenCaptureProtection: Boolean(this.activeProfile.screenCaptureProtection),
      runtimeDrift: this.activeProfile.runtimeDrift,
      driftIntervalSec: this.activeProfile.driftIntervalSec || 60,
      driftOnNavigation: this.activeProfile.driftOnNavigation,
      driftCount: (this.activeProfile.driftCount || 0) + 1,
      lastVariedAt: Date.now()
    };

    return this.getProfile();
  }

  /**
   * Apply subtle dynamic runtime drift. Rotates noise seeds and audio harmonics
   * while keeping page layout unbroken.
   */
  driftRuntimeParameters() {
    // Linear congruential rotation of seeds
    this.activeProfile.canvasNoiseSeed = ((this.activeProfile.canvasNoiseSeed * 16807) + 7) % 2147483647;
    this.activeProfile.audioNoiseSeed = ((this.activeProfile.audioNoiseSeed * 48271) + 13) % 2147483647;

    this.activeProfile.driftCount = (this.activeProfile.driftCount || 0) + 1;
    this.activeProfile.lastVariedAt = Date.now();

    return this.getProfile();
  }

  /**
   * Generate complete executable JavaScript string for webview preload injection.
   */
  generateShieldScript(profile = this.activeProfile) {
    const profileJson = JSON.stringify(profile);

    return `// --- NoctisBrowser Paranoid Privacy Shield & Dynamic Anti-Fingerprinting Engine ---
// Injected into guest webviews at document_start to defeat advanced browser fingerprinting
(function () {
  'use strict';
  console.log('--- NOCTIS PRIVACY SHIELD INITIALIZING ---');

  // Prevent double wrapping
  if (window.__NOCTIS_SHIELD_ACTIVE__ || window.__NETSCOPE_SHIELD_ACTIVE__) {
    if (window.__NOCTIS_UPDATE_PROFILE__) {
      window.__NOCTIS_UPDATE_PROFILE__(${profileJson});
    }
    return;
  }
  window.__NOCTIS_SHIELD_ACTIVE__ = true;
  window.__NETSCOPE_SHIELD_ACTIVE__ = true;

  let profile = ${profileJson};

  // Expose bridge for in-page dynamic runtime drift updates
  try {
    Object.defineProperty(window, '__NOCTIS_PROFILE__', {
      get: () => ({ ...profile }),
      configurable: true
    });
    Object.defineProperty(window, '__NETSCOPE_PROFILE__', {
      get: () => ({ ...profile }),
      configurable: true
    });
    window.__NOCTIS_ACTIVE_PROFILE__ = profile;
    window.__NETSCOPE_ACTIVE_PROFILE__ = profile;
    const updateFn = function(updated) {
      if (updated && typeof updated === 'object') {
        Object.assign(profile, updated);
      }
    };
    window.__NOCTIS_UPDATE_PROFILE__ = updateFn;
    window.__NETSCOPE_UPDATE_PROFILE__ = updateFn;
  } catch (_) {}

  // Defeat Function.prototype.toString tampering checks (Bot & Hook Detection)
  const nativeToString = Function.prototype.toString;
  const hookedFns = new WeakSet();
  const makeNative = (fn, name) => {
    hookedFns.add(fn);
    try {
      if (name) Object.defineProperty(fn, 'name', { value: name, configurable: true });
    } catch (_) {}
    return fn;
  };
  try {
    Function.prototype.toString = function() {
      if (hookedFns.has(this)) {
        return 'function ' + (this.name || '') + '() { [native code] }';
      }
      return nativeToString.apply(this, arguments);
    };
    makeNative(Function.prototype.toString, 'toString');
  } catch (_) {}

  // 1. Mask Navigator Identity & Hardware Properties
  const navProps = {
    userAgent: () => profile.userAgent,
    appVersion: () => profile.appVersion,
    platform: () => profile.platform,
    vendor: () => 'Google Inc.',
    product: () => 'Gecko',
    productSub: () => '20030107',
    oscpu: () => undefined,
    cpuClass: () => undefined,
    hardwareConcurrency: () => Number(profile.hardwareConcurrency || 8),
    deviceMemory: () => Number(profile.deviceMemory || 8),
    webdriver: () => false,
    maxTouchPoints: () => 0,
    doNotTrack: () => '1',
    globalPrivacyControl: () => true,
    pdfViewerEnabled: () => true,
    languages: () => Object.freeze(['en-US', 'en'])
  };

  for (const [prop, getter] of Object.entries(navProps)) {
    try {
      Object.defineProperty(Navigator.prototype, prop, {
        get: getter,
        enumerable: true,
        configurable: true
      });
    } catch (_) {}
  }

  // 2. Client Hints API (navigator.userAgentData)
  if ('userAgentData' in Navigator.prototype) {
    try {
      const brands = Object.freeze([
        { brand: 'Chromium', version: '146' },
        { brand: 'Google Chrome', version: '146' },
        { brand: 'Not?A_Brand', version: '99' }
      ]);
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => ({
          brands,
          mobile: false,
          platform: profile.os,
          toJSON: () => ({
            brands,
            mobile: false,
            platform: profile.os
          }),
          getHighEntropyValues: async (hints) => ({
            brands,
            mobile: false,
            platform: profile.os,
            platformVersion: profile.platformVersion || '6.5.0',
            architecture: profile.architecture || 'x86',
            bitness: profile.bitness || '64',
            model: profile.model || '',
            uaFullVersion: '146.0.7680.216',
            fullVersionList: Object.freeze([
              { brand: 'Chromium', version: '146.0.7680.216' },
              { brand: 'Google Chrome', version: '146.0.7680.216' },
              { brand: 'Not?A_Brand', version: '99.0.0.0' }
            ])
          })
        }),
        enumerable: true,
        configurable: true
      });
    } catch (_) {}
  }

  // 3. Battery Status API Obfuscation
  if ('getBattery' in Navigator.prototype) {
    Navigator.prototype.getBattery = makeNative(async () => ({
      charging: true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: 1.0,
      addEventListener: () => {},
      removeEventListener: () => {}
    }), 'getBattery');
  }

  // 4. Network Information API (navigator.connection)
  if ('connection' in Navigator.prototype) {
    try {
      Object.defineProperty(Navigator.prototype, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false
        }),
        enumerable: true,
        configurable: true
      });
    } catch (_) {}
  }

  // 4b. Hardware Probes (Bluetooth / USB)
  if (navigator.bluetooth && navigator.bluetooth.getAvailability) {
    navigator.bluetooth.getAvailability = makeNative(async () => false, 'getAvailability');
  }

  // 5. WebGL Vendor, Renderer & Shader Masking (Hiding Physical GPU & Shaders)
  const spoofWebGL = (proto) => {
    if (!proto || !proto.getParameter) return;
    const origGetParameter = proto.getParameter;
    proto.getParameter = makeNative(function(param) {
      // UNMASKED_VENDOR_WEBGL (37445)
      if (param === 37445) return profile.webglVendor;
      // UNMASKED_RENDERER_WEBGL (37446)
      if (param === 37446) return profile.webglRenderer;
      // VENDOR (7936)
      if (param === 7936) return 'WebKit';
      // RENDERER (7937)
      if (param === 7937) return 'WebKit WebGL';
      // SHADING_LANGUAGE_VERSION (35724)
      if (param === 35724) return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
      // VERSION (7938)
      if (param === 7938) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
      return origGetParameter.apply(this, arguments);
    }, 'getParameter');

    if (proto.getShaderPrecisionFormat) {
      proto.getShaderPrecisionFormat = makeNative(function(shaderType, precisionType) {
        return { rangeMin: 127, rangeMax: 127, precision: 23 };
      }, 'getShaderPrecisionFormat');
    }

    if (proto.readPixels) {
      const origReadPixels = proto.readPixels;
      proto.readPixels = makeNative(function(x, y, width, height, format, type, pixels) {
        origReadPixels.apply(this, arguments);
        const mode = profile.canvasNoiseMode;
        if (mode !== 'off' && pixels && pixels.length > 0) {
          const seed = Number(profile.canvasNoiseSeed || 42);
          pixels[0] = Math.max(0, Math.min(255, pixels[0] ^ (seed & 1)));
        }
      }, 'readPixels');
    }
  };

  if (window.WebGLRenderingContext) spoofWebGL(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) spoofWebGL(WebGL2RenderingContext.prototype);

  // 6. Paranoid Canvas & Font Fingerprint Neutralization
  const getCanvasJitter = () => {
    const mode = profile.canvasNoiseMode;
    if (mode === 'off') return 0;
    const seed = Number(profile.canvasNoiseSeed || 42);
    if (mode === 'subtle') return (seed & 1) ? 1 : 0;
    if (mode === 'extreme') return ((seed % 7) - 3);
    return ((seed % 3) === 0 ? 1 : ((seed % 3) === 1 ? -1 : 0));
  };

  if (window.CanvasRenderingContext2D) {
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = makeNative(function(sx, sy, sw, sh) {
      const imageData = origGetImageData.apply(this, arguments);
      const mode = profile.canvasNoiseMode;
      if (mode !== 'off' && imageData && imageData.data && imageData.data.length >= 8) {
        const d = imageData.data;
        const seed = Number(profile.canvasNoiseSeed || 42);
        const jitter = getCanvasJitter();
        d[0] = Math.max(0, Math.min(255, d[0] + jitter));
        d[1] = Math.max(0, Math.min(255, d[1] - jitter));
        d[2] = Math.max(0, Math.min(255, d[2] + ((seed % 2) ? 1 : 0)));
        d[4] = Math.max(0, Math.min(255, d[4] - jitter));
      }
      return imageData;
    }, 'getImageData');

    // Font Enumeration & Measurement Neutralization (Anti-Canvas-Font-Probe)
    if (CanvasRenderingContext2D.prototype.measureText) {
      const origMeasureText = CanvasRenderingContext2D.prototype.measureText;
      CanvasRenderingContext2D.prototype.measureText = makeNative(function(text) {
        const metrics = origMeasureText.apply(this, arguments);
        const mode = profile.canvasNoiseMode;
        if (mode !== 'off' && metrics && typeof metrics.width === 'number') {
          const seed = Number(profile.canvasNoiseSeed || 42);
          const delta = ((seed % 5) - 2) * 0.0001;
          const perturbedWidth = metrics.width + delta;
          try {
            return new Proxy(metrics, {
              get(target, prop) {
                if (prop === 'width') return perturbedWidth;
                return target[prop];
              }
            });
          } catch (_) {
            return metrics;
          }
        }
        return metrics;
      }, 'measureText');
    }
  }

  // 6b. DOMRect & Sub-pixel Font Rendering Jitter (Anti-DOMRect-Font-Fingerprint)
  if (window.Element && Element.prototype.getBoundingClientRect) {
    const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = makeNative(function() {
      const rect = origGetBoundingClientRect.apply(this, arguments);
      const mode = profile.canvasNoiseMode;
      if (mode !== 'off' && rect) {
        const seed = Number(profile.canvasNoiseSeed || 42);
        const delta = ((seed % 7) - 3) * 0.00005;
        return new DOMRect(rect.x, rect.y, rect.width + delta, rect.height + delta);
      }
      return rect;
    }, 'getBoundingClientRect');
  }

  if (window.HTMLCanvasElement) {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = makeNative(function() {
      const mode = profile.canvasNoiseMode;
      if (mode !== 'off') {
        const ctx = this.getContext('2d');
        if (ctx) {
          try {
            const seed = Number(profile.canvasNoiseSeed || 42);
            const imgData = ctx.getImageData(0, 0, 1, 1);
            imgData.data[0] = (imgData.data[0] + (seed % 2 === 0 ? 1 : 0)) % 256;
            ctx.putImageData(imgData, 0, 0);
          } catch (_) {}
        }
      }
      return origToDataURL.apply(this, arguments);
    }, 'toDataURL');

    if (HTMLCanvasElement.prototype.toBlob) {
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = makeNative(function(callback, type, quality) {
        const mode = profile.canvasNoiseMode;
        if (mode !== 'off') {
          const ctx = this.getContext('2d');
          if (ctx) {
            try {
              const seed = Number(profile.canvasNoiseSeed || 42);
              const imgData = ctx.getImageData(0, 0, 1, 1);
              imgData.data[0] = (imgData.data[0] + (seed % 2 === 0 ? 1 : 0)) % 256;
              ctx.putImageData(imgData, 0, 0);
            } catch (_) {}
          }
        }
        return origToBlob.apply(this, arguments);
      }, 'toBlob');
    }
  }

  if (window.OffscreenCanvas && OffscreenCanvas.prototype.convertToBlob) {
    const origConvertToBlob = OffscreenCanvas.prototype.convertToBlob;
    OffscreenCanvas.prototype.convertToBlob = makeNative(function() {
      const mode = profile.canvasNoiseMode;
      if (mode !== 'off') {
        const ctx = this.getContext('2d');
        if (ctx) {
          try {
            const seed = Number(profile.canvasNoiseSeed || 42);
            const imgData = ctx.getImageData(0, 0, 1, 1);
            imgData.data[0] = (imgData.data[0] + (seed % 2 === 0 ? 1 : 0)) % 256;
            ctx.putImageData(imgData, 0, 0);
          } catch (_) {}
        }
      }
      return origConvertToBlob.apply(this, arguments);
    }, 'convertToBlob');
  }

  // 7. Paranoid AudioContext & OfflineAudioContext Neutralization
  const getAudioJitter = () => {
    const mode = profile.audioNoiseMode;
    if (mode === 'off') return 0;
    const seed = Number(profile.audioNoiseSeed || 73);
    if (mode === 'subtle') return (seed % 2 ? 0.00000005 : -0.00000005);
    if (mode === 'extreme') return (seed % 5 ? 0.000001 : -0.000001);
    return ((seed % 3) * 0.0000001);
  };

  if (window.AudioBuffer) {
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = makeNative(function() {
      const data = origGetChannelData.apply(this, arguments);
      const mode = profile.audioNoiseMode;
      if (mode !== 'off' && data && data.length > 0) {
        const jitter = getAudioJitter();
        data[0] = data[0] + jitter;
        if (data.length > 10) data[10] = data[10] - (jitter * 0.5);
      }
      return data;
    }, 'getChannelData');

    if (AudioBuffer.prototype.copyFromChannel) {
      const origCopyFromChannel = AudioBuffer.prototype.copyFromChannel;
      AudioBuffer.prototype.copyFromChannel = makeNative(function(destination, channelNumber, startInChannel) {
        origCopyFromChannel.apply(this, arguments);
        const mode = profile.audioNoiseMode;
        if (mode !== 'off' && destination && destination.length > 0) {
          destination[0] += getAudioJitter();
        }
      }, 'copyFromChannel');
    }
  }

  // Neutralize OfflineAudioContext Rendering (Primary Vector of FingerprintJS)
  if (window.OfflineAudioContext) {
    const origStartRendering = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = makeNative(async function() {
      const buffer = await origStartRendering.apply(this, arguments);
      const mode = profile.audioNoiseMode;
      if (mode !== 'off' && buffer) {
        const jitter = getAudioJitter();
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const data = buffer.getChannelData(c);
          const startIdx = Math.max(0, data.length - 500);
          for (let i = startIdx; i < data.length; i += 7) {
            data[i] += jitter * (1 + (i % 3));
          }
        }
      }
      return buffer;
    }, 'startRendering');
  }

  if (window.AnalyserNode) {
    const origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = makeNative(function(array) {
      origGetFloatFreq.apply(this, arguments);
      const mode = profile.audioNoiseMode;
      if (mode !== 'off' && array && array.length > 0) {
        const jitter = getAudioJitter() * 1000;
        array[0] = array[0] + jitter;
      }
    }, 'getFloatFrequencyData');
  }

  // 8. MediaDevices Hardware ID & Label Masking
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = makeNative(async function() {
      return [
        { deviceId: 'default', kind: 'audioinput', label: 'Default Audio Input (Internal)', groupId: 'audio-group-generic' },
        { deviceId: 'default', kind: 'audiooutput', label: 'Default Audio Output (Internal)', groupId: 'audio-group-generic' },
        { deviceId: 'default', kind: 'videoinput', label: 'Default Camera', groupId: 'video-group-generic' }
      ];
    }, 'enumerateDevices');
  }

  // 9. SpeechSynthesis Voice Fingerprint Normalization
  if (window.speechSynthesis && window.speechSynthesis.getVoices) {
    const mockVoices = [
      { voiceURI: 'Google US English', name: 'Google US English', lang: 'en-US', localService: false, default: true },
      { voiceURI: 'Google UK English Female', name: 'Google UK English Female', lang: 'en-GB', localService: false, default: false }
    ];
    window.speechSynthesis.getVoices = makeNative(() => mockVoices, 'getVoices');
  }

  // 10. WebRTC SDP Candidate Filtering (Zero Local IP Leakage)
  if (window.RTCPeerConnection) {
    const origCreateOffer = RTCPeerConnection.prototype.createOffer;
    RTCPeerConnection.prototype.createOffer = makeNative(async function(options) {
      const offer = await origCreateOffer.apply(this, arguments);
      if (offer && offer.sdp) {
        const nl = String.fromCharCode(10);
        offer.sdp = offer.sdp.split(nl).filter(function(line) {
          return !line.startsWith('a=candidate:') || (!line.includes('192.168.') && !line.includes('10.') && !line.includes('172.') && !line.includes('127.0.0.1'));
        }).join(nl);
      }
      return offer;
    }, 'createOffer');

    const origSetLocalDescription = RTCPeerConnection.prototype.setLocalDescription;
    RTCPeerConnection.prototype.setLocalDescription = makeNative(function(desc) {
      if (desc && desc.sdp) {
        const nl = String.fromCharCode(10);
        desc.sdp = desc.sdp.split(nl).filter(function(line) {
          return !line.startsWith('a=candidate:') || (!line.includes('192.168.') && !line.includes('10.') && !line.includes('172.') && !line.includes('127.0.0.1'));
        }).join(nl);
      }
      return origSetLocalDescription.apply(this, arguments);
    }, 'setLocalDescription');
  }

  // 11. Timezone & Locale Standardization
  try {
    const origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = makeNative(function() {
      const opts = origResolvedOptions.apply(this, arguments);
      return {
        ...opts,
        timeZone: profile.timezone || 'America/New_York',
        locale: 'en-US'
      };
    }, 'resolvedOptions');
  } catch (_) {}

  // 12. Standard Genuine Chrome Plugins & MimeTypes
  try {
    const fakePlugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
    ];
    Object.defineProperty(Navigator.prototype, 'plugins', {
      get: () => fakePlugins,
      enumerable: true,
      configurable: true
    });
  } catch (_) {}

  // 13. Genuine window.chrome Runtime Mock
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.app) {
    window.chrome.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
    };
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
      OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
      PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
      RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }
    };
  }

  // 14. Screen Metrics Normalization & Viewport Letterboxing (Tor / Mullvad / DarkBrowser 200x100 Buckets)
  try {
    const scr = profile.screen || { width: 1728, height: 1117, availWidth: 1728, availHeight: 1080 };
    Object.defineProperty(Screen.prototype, 'width', { get: () => scr.width, configurable: true });
    Object.defineProperty(Screen.prototype, 'height', { get: () => scr.height, configurable: true });
    Object.defineProperty(Screen.prototype, 'availWidth', { get: () => scr.availWidth, configurable: true });
    Object.defineProperty(Screen.prototype, 'availHeight', { get: () => scr.availHeight, configurable: true });
    Object.defineProperty(Screen.prototype, 'availTop', { get: () => 0, configurable: true });
    Object.defineProperty(Screen.prototype, 'availLeft', { get: () => 0, configurable: true });
    Object.defineProperty(Screen.prototype, 'colorDepth', { get: () => scr.colorDepth || 24, configurable: true });
    Object.defineProperty(Screen.prototype, 'pixelDepth', { get: () => scr.pixelDepth || 24, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => scr.devicePixelRatio || 2, configurable: true });
    Object.defineProperty(window, 'outerWidth', { get: () => scr.availWidth, configurable: true });
    Object.defineProperty(window, 'outerHeight', { get: () => scr.availHeight, configurable: true });
    Object.defineProperty(window, 'screenX', { get: () => 0, configurable: true });
    Object.defineProperty(window, 'screenY', { get: () => 0, configurable: true });
    if ('orientation' in Screen.prototype) {
      Object.defineProperty(Screen.prototype, 'orientation', {
        get: () => ({ type: 'landscape-primary', angle: 0 }),
        configurable: true
      });
    }

    // Viewport Letterboxing (Quantizes innerWidth/innerHeight to 200x100 buckets to defeat window-resize fingerprinting)
    const initialW = typeof window.innerWidth === 'number' && window.innerWidth > 0 ? window.innerWidth : (scr.availWidth || 1400);
    const initialH = typeof window.innerHeight === 'number' && window.innerHeight > 0 ? window.innerHeight : (scr.availHeight || 800);
    const getQuantizedWidth = () => {
      if (!profile.letterboxing) return initialW;
      return Math.max(1000, Math.floor(initialW / 200) * 200);
    };
    const getQuantizedHeight = () => {
      if (!profile.letterboxing) return initialH;
      return Math.max(600, Math.floor(initialH / 100) * 100);
    };
    Object.defineProperty(window, 'innerWidth', { get: getQuantizedWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { get: getQuantizedHeight, configurable: true });

    if (window.visualViewport) {
      const vvProto = Object.getPrototypeOf(window.visualViewport);
      if (vvProto) {
        Object.defineProperty(vvProto, 'width', { get: getQuantizedWidth, configurable: true });
        Object.defineProperty(vvProto, 'height', { get: getQuantizedHeight, configurable: true });
      }
    }
  } catch (_) {}

  // 15. Precision Timing Clamp (Mitigate CPU Cache & Spectre Side-Channel Probes)
  if (window.performance && window.performance.now) {
    const origPerfNow = window.performance.now.bind(window.performance);
    window.performance.now = makeNative(function() {
      const val = origPerfNow();
      return Math.floor(val * 10) / 10;
    }, 'now');
  }

  // 16. WebGPU Adapter Fingerprint Neutralization (navigator.gpu)
  if (navigator.gpu && navigator.gpu.requestAdapter) {
    const origRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = makeNative(async function(options) {
      const adapter = await origRequestAdapter(options).catch(() => null);
      if (!adapter) return null;
      const osLower = (profile.os || '').toLowerCase();
      const fakeVendor = osLower.includes('mac') ? 'apple' : (osLower.includes('win') ? 'nvidia' : 'amd');
      const fakeArch = osLower.includes('mac') ? 'common-3' : (osLower.includes('win') ? 'ada-lovelace' : 'rdna-2');
      const fakeInfo = Object.freeze({
        vendor: fakeVendor,
        architecture: fakeArch,
        device: '',
        description: ''
      });
      try {
        Object.defineProperty(adapter, 'info', { get: () => fakeInfo, configurable: true });
        if (adapter.requestAdapterInfo) {
          adapter.requestAdapterInfo = makeNative(async () => fakeInfo, 'requestAdapterInfo');
        }
      } catch (_) {}
      return adapter;
    }, 'requestAdapter');
  }

  // 17. Storage Quota Masking (Defeats Incognito & Disk-Size Fingerprinting — Umbra / Brave / Tor Defense)
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate = makeNative(async function() {
      return {
        usage: 0,
        quota: 10737418240, // Standardized 10.0 GB uniform quota
        usageDetails: {}
      };
    }, 'estimate');
  }

  // 18. Gamepad, WebXR & Hardware Sensor Enumeration Blocking
  if (Navigator.prototype.getGamepads) {
    Navigator.prototype.getGamepads = makeNative(function() {
      return [];
    }, 'getGamepads');
  }
  if ('xr' in Navigator.prototype && navigator.xr) {
    try {
      navigator.xr.isSessionSupported = makeNative(async () => false, 'isSessionSupported');
    } catch (_) {}
  }
  const blockedSensors = [
    'Accelerometer', 'Gyroscope', 'LinearAccelerationSensor',
    'AbsoluteOrientationSensor', 'RelativeOrientationSensor',
    'Magnetometer', 'AmbientLightSensor'
  ];
  for (const sensorName of blockedSensors) {
    if (sensorName in window) {
      try {
        Object.defineProperty(window, sensorName, {
          get: () => undefined,
          configurable: true
        });
      } catch (_) {}
    }
  }

  // 19. Physical Keyboard Layout Masking (navigator.keyboard.getLayoutMap)
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    const standardKeys = new Map([
      ['KeyQ', 'q'], ['KeyW', 'w'], ['KeyE', 'e'], ['KeyR', 'r'], ['KeyT', 't'], ['KeyY', 'y'],
      ['KeyA', 'a'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyF', 'f'], ['KeyZ', 'z'], ['KeyX', 'x']
    ]);
    navigator.keyboard.getLayoutMap = makeNative(async function() {
      return {
        size: standardKeys.size,
        get: (k) => standardKeys.get(k),
        has: (k) => standardKeys.has(k),
        entries: () => standardKeys.entries(),
        keys: () => standardKeys.keys(),
        values: () => standardKeys.values(),
        forEach: (cb) => standardKeys.forEach(cb)
      };
    }, 'getLayoutMap');
  }

  // 20. Display Hardware Media Query Normalization (Prevent HDR / P3 Color Gamut Fingerprinting)
  if (window.matchMedia) {
    const origMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = makeNative(function(query) {
      const q = String(query || '').toLowerCase();
      if (q.includes('color-gamut: p3') || q.includes('color-gamut: rec2020') || q.includes('dynamic-range: high')) {
        const res = origMatchMedia(query);
        try {
          return new Proxy(res, {
            get(target, prop) {
              if (prop === 'matches') return false;
              const val = target[prop];
              return typeof val === 'function' ? val.bind(target) : val;
            }
          });
        } catch (_) {
          return res;
        }
      }
      return origMatchMedia(query);
    }, 'matchMedia');
  }

})();
`;
  }

  saveShieldScript(targetFilePath) {
    const code = this.generateShieldScript();
    fs.writeFileSync(targetFilePath, code, 'utf-8');
    return targetFilePath;
  }

  // --- Ad, Tracker & Feed Blocking ---

  isTracker(url, initiatorHost = null) {
    if (!this.denyByDefaultTrackers) return { isTracker: false };

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (_) {
      return { isTracker: false };
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    const search = parsedUrl.search.toLowerCase();

    // 1. Fast O(1) Hostname & Domain Hierarchy Check
    if (this._matchesHost(hostname)) {
      this.blockedTrackersCount++;
      return { isTracker: true, reason: `Ad / Tracker Host: ${hostname}`, category: 'ad-host' };
    }

    // 2. Pattern Matching (Wildcards & Paths)
    for (const item of this.compiledPatterns) {
      if (item.regex.test(url)) {
        this.blockedTrackersCount++;
        return { isTracker: true, reason: `Ad / Tracker Pattern: ${item.pattern}`, category: 'pattern' };
      }
    }

    // 3. Heuristic Keywords in Path or Query
    for (const keyword of this.heuristicKeywords) {
      if (pathname.includes(keyword) || search.includes(keyword)) {
        this.blockedTrackersCount++;
        return { isTracker: true, reason: `Heuristic Ad/Tracker: ${keyword}`, category: 'heuristic' };
      }
    }

    // 4. Standalone Subdomain Prefixes
    if (
      hostname.startsWith('telemetry.') ||
      hostname.startsWith('analytics.') ||
      hostname.startsWith('tracking.') ||
      hostname.startsWith('tracker.') ||
      hostname.startsWith('metrics.') ||
      hostname.startsWith('stats.') ||
      hostname.startsWith('pixel.') ||
      hostname.startsWith('beacon.') ||
      hostname.startsWith('adserver.') ||
      hostname.startsWith('ads.') ||
      hostname.startsWith('ad.') ||
      hostname.startsWith('pagead.')
    ) {
      this.blockedTrackersCount++;
      return { isTracker: true, reason: `Ad/Tracker Subdomain: ${hostname}`, category: 'subdomain' };
    }

    return { isTracker: false };
  }

  _matchesHost(hostname) {
    if (this.adTrackerHosts.has(hostname)) {
      return true;
    }

    const parts = hostname.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parentDomain = parts.slice(i).join('.');
      if (this.adTrackerHosts.has(parentDomain)) {
        return true;
      }
    }

    return false;
  }

  addFeedDomains(domainList, sourceName = 'Community Feed') {
    if (!Array.isArray(domainList)) return 0;

    let added = 0;
    for (const d of domainList) {
      const clean = String(d).trim().toLowerCase();
      if (clean && !this.adTrackerHosts.has(clean)) {
        this.adTrackerHosts.add(clean);
        added++;
      }
    }

    this.activeFeedName = sourceName;
    this.feedDomainsCount = domainList.length;

    return added;
  }

  resetToDefaults() {
    this.adTrackerHosts = new Set(BUILTIN_AD_AND_TRACKER_HOSTS.map(h => h.toLowerCase()));
    this.activeFeedName = 'Built-in Ad & Tracker Shield';
    this.feedDomainsCount = 0;
  }

  sanitizeUrl(rawUrl) {
    if (!this.stripTrackingParams) return rawUrl;
    try {
      const u = new URL(rawUrl);
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
        'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'twclid', 'ttclid', 'li_fat_id',
        'mc_eid', 'vero_id', 'oly_enc_id', 'oly_anon_id', '_hsenc', '_hsmi', 'mkt_tok',
        'rb_clickid', 's_kwcid', 'yclid', '_openstat', 'zanpid', 'igshid', 'si', 'ref_src',
        'spm', 'scm'
      ];

      let modified = false;
      for (const param of trackingParams) {
        if (u.searchParams.has(param)) {
          u.searchParams.delete(param);
          modified = true;
        }
      }
      return modified ? u.toString() : rawUrl;
    } catch (_) {
      return rawUrl;
    }
  }

  sanitizeHeaders(headers, requestUrl = null) {
    if (!headers || typeof headers !== 'object') return {};
    const cleanHeaders = {};
    const p = this.activeProfile || {};

    // Strip case-insensitively any headers we replace, manage, or block
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (
        lower === 'user-agent' ||
        lower.startsWith('sec-ch-ua') ||
        lower === 'accept-language' ||
        lower === 'dnt' ||
        lower === 'sec-gpc' ||
        lower === 'referer' ||
        lower === 'x-client-data' ||
        lower === 'x-chrome-uma-enabled' ||
        lower === 'x-chrome-connected' ||
        lower === 'x-goog-visitor-id' ||
        lower === 'x-youtube-client-name' ||
        lower === 'x-youtube-client-version' ||
        lower === 'x-electron' ||
        lower === 'x-requested-with' ||
        lower === 'x-forwarded-for'
      ) {
        continue;
      }
      cleanHeaders[key] = String(value);
    }

    // Set standardized User-Agent based on active profile
    cleanHeaders['User-Agent'] = p.userAgent || this.getUserAgent();

    // Standardize Client Hints (Sec-CH-UA) to match active OS and Chrome
    cleanHeaders['sec-ch-ua'] = `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not?A_Brand";v="99"`;
    cleanHeaders['sec-ch-ua-mobile'] = '?0';
    cleanHeaders['sec-ch-ua-platform'] = `"${p.os || 'Linux'}"`;
    cleanHeaders['sec-ch-ua-platform-version'] = `"${p.platformVersion || '6.5.0'}"`;
    cleanHeaders['sec-ch-ua-arch'] = `"${p.architecture || 'x86'}"`;
    cleanHeaders['sec-ch-ua-bitness'] = `"${p.bitness || '64'}"`;
    cleanHeaders['sec-ch-ua-model'] = '""';
    cleanHeaders['sec-ch-ua-full-version'] = `"${CHROME_FULL_VERSION}"`;
    cleanHeaders['sec-ch-ua-full-version-list'] = `"Chromium";v="${CHROME_FULL_VERSION}", "Google Chrome";v="${CHROME_FULL_VERSION}", "Not?A_Brand";v="99.0.0.0"`;
    cleanHeaders['device-memory'] = String(p.deviceMemory || 8);
    cleanHeaders['dpr'] = String(p.screen?.devicePixelRatio || 1);
    cleanHeaders['viewport-width'] = String(p.screen?.availWidth || 1920);

    // Standardize Accept-Language (prevent leaking OS native regional language pack)
    cleanHeaders['Accept-Language'] = 'en-US,en;q=0.9';

    // Privacy & Anti-tracking flags
    cleanHeaders['DNT'] = '1';
    cleanHeaders['Sec-GPC'] = '1';

    // Truncate cross-origin Referrer to origin only (prevents leaking URL paths, search queries, session tokens)
    // Completely drop Referer if outbound target is a known tracker or ad host
    let originalReferer = null;
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'referer') {
        originalReferer = v;
        break;
      }
    }

    if (originalReferer && requestUrl) {
      try {
        const refUrl = new URL(originalReferer);
        const reqUrl = new URL(requestUrl);
        if (refUrl.origin !== reqUrl.origin) {
          if (this._matchesHost(reqUrl.hostname)) {
            // Drop Referer for known ad/tracker hosts
          } else {
            cleanHeaders['Referer'] = refUrl.origin + '/';
          }
        } else {
          cleanHeaders['Referer'] = originalReferer;
        }
      } catch (_) {
        cleanHeaders['Referer'] = originalReferer;
      }
    } else if (originalReferer) {
      cleanHeaders['Referer'] = originalReferer;
    }

    return cleanHeaders;
  }

  getUserAgent() {
    return this.activeProfile.userAgent;
  }

  getEngineVersionInfo() {
    return {
      chromeMajor: CHROME_MAJOR,
      chromeVersion: CHROME_VERSION,
      chromeFullVersion: CHROME_FULL_VERSION,
      runtimeChrome: (typeof process !== 'undefined' && process.versions && process.versions.chrome) ? process.versions.chrome : CHROME_FULL_VERSION,
      runtimeElectron: (typeof process !== 'undefined' && process.versions && process.versions.electron) ? process.versions.electron : '41.7.1',
      runtimeNode: (typeof process !== 'undefined' && process.versions && process.versions.node) ? process.versions.node : '24.15.0',
      runtimeV8: (typeof process !== 'undefined' && process.versions && process.versions.v8) ? process.versions.v8 : '14.6.202.34'
    };
  }

  getStats() {
    return {
      denyByDefaultTrackers: this.denyByDefaultTrackers,
      obfuscateFingerprint: this.obfuscateFingerprint,
      blockedTrackersCount: this.blockedTrackersCount,
      probesObfuscatedCount: this.probesObfuscatedCount,
      totalRulesActive: this.trackerPatterns.length + this.adTrackerHosts.size + this.heuristicKeywords.length,
      activeFeedName: this.activeFeedName,
      totalBlockedHosts: this.adTrackerHosts.size,
      feedDomainsCount: this.feedDomainsCount,
      activeProfile: this.getProfile(),
      engineVersion: this.getEngineVersionInfo()
    };
  }
}

module.exports = new PrivacyEngine();
