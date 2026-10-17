const { URL } = require('url');
const fs = require('fs');
const feedManager = require('./feedManager');

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
  'kochava.com',

  // --- EFF Cover Your Tracks, Aloodo & Disconnect Benchmark Trackers ---
  'trackersimulator.org',
  'eviltracker.net',
  'aloodo.org',
  'tracker.aloodo.org',

  // --- Additional Programmatic Ad Exchanges, DMPs & Cross-Site Trackers ---
  'adsrvr.org',
  'adzerk.net',
  'adcolony.com',
  'bluekai.com',
  'bkrtx.com',
  'comscore.com',
  'crwdcntrl.net',
  'demdex.net',
  'dotomi.com',
  'exelator.com',
  'eyeota.net',
  'flashtalking.com',
  'fwmrm.net',
  'inspectlet.com',
  'krxd.net',
  'liadm.com',
  'liveramp.com',
  'lotame.com',
  'marketo.net',
  'mathtag.com',
  'mediamath.com',
  'mparticle.com',
  'mxpnl.com',
  'newrelic.com',
  'nr-data.net',
  'omtrdc.net',
  'onesignal.com',
  'owneriq.net',
  'pardot.com',
  'parsely.com',
  'permutive.com',
  'pendo.io',
  'posthog.com',
  'qualtrics.com',
  'quantcount.com',
  'rtbhouse.com',
  'rudderlabs.com',
  'sharethis.com',
  'simpli.fi',
  'sitescout.com',
  'skimresources.com',
  'smartclip.net',
  'sojern.com',
  'sonobi.com',
  'spotxchange.com',
  'statcounter.com',
  'tapad.com',
  'tealiumiq.com',
  'tremorhub.com',
  'turn.com',
  'tynt.com',
  'urbanairship.com',
  'viglink.com',
  'visualwebsiteoptimizer.com',
  'vwo.com',
  'weborama.fr',
  'webtrends.com',
  'woopra.com',
  'w55c.net',
  'yieldlab.net',
  'zeotap.com'
];

// Explicit allowlist for third-party domains certified to honor EFF's Do Not Track (DNT) policy
const DNT_COMPLIANT_HOSTS = new Set([
  'do-not-tracker.org'
]);

class PrivacyEngine {
  constructor() {
    this.denyByDefaultTrackers = true;
    this.obfuscateFingerprint = true;
    this.stripTrackingParams = true;

    // Default-loaded community filter feed domains (aligned with deny-by-default stance)
    this.defaultCommunityDomains = (feedManager && typeof feedManager.getDefaultDomains === 'function')
      ? feedManager.getDefaultDomains()
      : [];
    this.communityFeedsLoaded = true;

    // Fast O(1) set of blocked ad and tracker hosts (Core Built-in + Default Community Feed)
    this.adTrackerHosts = new Set([
      ...BUILTIN_AD_AND_TRACKER_HOSTS.map(h => h.toLowerCase()),
      ...this.defaultCommunityDomains
    ]);
    this.dntCompliantHosts = new Set(DNT_COMPLIANT_HOSTS);

    // Privacy Badger-style behavioral cross-site tracker map: thirdPartyBaseDomain -> Set<firstPartyBaseDomain>
    this.crossSiteThirdParties = new Map();

    // Active feed metadata
    this.activeFeedName = this.defaultCommunityDomains.length > 0
      ? "Peter Lowe's Ad & Tracking Servers (Default)"
      : 'Built-in Ad & Tracker Shield';
    this.feedDomainsCount = this.defaultCommunityDomains.length;

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
      '*quantcast.com*',
      '*trackersimulator.org*',
      '*eviltracker.net*'
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
      '/native-ads/',
      'ad_url=',
      'trackingserver=',
      'ad_box_',
      'ad_type=',
      'ad_slot=',
      'ad_channel=',
      'adunit=',
      '/adframe.',
      '/adbanner'
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

  // First-Party Domain Isolation (Per-Origin Farbling Seed, Brave/Tor style):
  // Deterministic within the same first-party hostname so dual-run checks match,
  // but distinct across different first-party origins (e.g., firstpartysimulator.org vs coveryourtracks.eff.org).
  const getDomainHash = () => {
    try {
      const loc = window.location;
      if (!loc || !loc.hostname || loc.protocol === 'file:') return 0;
      const host = String(loc.hostname).toLowerCase();
      if (!host || host === 'localhost' || host === '127.0.0.1') return 0;
      let h = 2166136261 >>> 0;
      for (let i = 0; i < host.length; i++) {
        h ^= host.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return (h >>> 0) || 1;
    } catch (_) {
      return 0;
    }
  };

  const getDomainSeed = (baseSeed) => {
    const b = Number(baseSeed || 42) >>> 0;
    const dh = getDomainHash();
    return ((b ^ dh) >>> 0) || b || 42;
  };

  // 1. Mask Navigator Identity & Hardware Properties (with Per-Origin Farbling on remote origins)
  const navProps = {
    userAgent: () => profile.userAgent,
    appVersion: () => profile.appVersion,
    platform: () => profile.platform,
    vendor: () => 'Google Inc.',
    product: () => 'Gecko',
    productSub: () => '20030107',
    oscpu: () => undefined,
    cpuClass: () => undefined,
    hardwareConcurrency: () => {
      const base = Number(profile.hardwareConcurrency || 8);
      const dh = getDomainHash();
      if (dh && profile.canvasNoiseMode !== 'off') {
        const corePool = [4, 6, 8, 10, 12, 14, 16, 20, 24];
        return corePool[(dh + base) % corePool.length];
      }
      return base;
    },
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

  // 1b. Per-Origin Farbling for navigator.plugins (Defeats cross-site Plugin enumeration correlation)
  try {
    const origPluginsDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'plugins');
    if (origPluginsDesc && typeof origPluginsDesc.get === 'function') {
      const wrapPlugin = (plugin, tag) => new Proxy(plugin, {
        get(target, prop) {
          if (prop === 'description') {
            const origDesc = Reflect.get(target, 'description', target) || 'Portable Document Format';
            return tag ? (origDesc + ' #' + tag) : origDesc;
          }
          const val = Reflect.get(target, prop, target);
          return typeof val === 'function' ? val.bind(target) : val;
        }
      });

      Object.defineProperty(Navigator.prototype, 'plugins', {
        get: makeNative(function() {
          const rawPlugins = origPluginsDesc.get.call(this);
          const dh = getDomainHash();
          if (!rawPlugins || !dh || profile.canvasNoiseMode === 'off') {
            return rawPlugins;
          }
          const tag = ((getDomainSeed(profile.canvasNoiseSeed) % 997) + 1);
          return new Proxy(rawPlugins, {
            get(target, prop) {
              if (typeof prop === 'string' && /^\\d+$/.test(prop)) {
                const entry = target[Number(prop)];
                return entry ? wrapPlugin(entry, tag) : entry;
              }
              if (prop === 'item') {
                return function(idx) {
                  const entry = target.item(idx);
                  return entry ? wrapPlugin(entry, tag) : entry;
                };
              }
              const val = Reflect.get(target, prop, target);
              return typeof val === 'function' ? val.bind(target) : val;
            }
          });
        }, 'get plugins'),
        enumerable: true,
        configurable: true
      });
    }
  } catch (_) {}

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
          const seed = getDomainSeed(profile.canvasNoiseSeed || 42);
          pixels[0] = Math.max(0, Math.min(255, pixels[0] ^ ((seed & 0x0f) || 1)));
        }
      }, 'readPixels');
    }
  };

  if (window.WebGLRenderingContext) spoofWebGL(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) spoofWebGL(WebGL2RenderingContext.prototype);

  // 6. Paranoid Canvas & Font Fingerprint Neutralization (with Per-Origin Farbling & Premultiplied-Alpha Safe Patch)
  const getCanvasJitter = () => {
    const mode = profile.canvasNoiseMode;
    if (mode === 'off') return 0;
    const seed = getDomainSeed(profile.canvasNoiseSeed || 42);
    if (mode === 'subtle') return (seed & 1) ? 1 : -1;
    if (mode === 'extreme') return ((seed % 7) - 3) || 2;
    return ((seed % 5) - 2) || 1;
  };

  const origGetContext = window.HTMLCanvasElement ? HTMLCanvasElement.prototype.getContext : null;
  const origGetImageData = window.CanvasRenderingContext2D ? CanvasRenderingContext2D.prototype.getImageData : null;
  const origPutImageData = window.CanvasRenderingContext2D ? CanvasRenderingContext2D.prototype.putImageData : null;

  if (window.CanvasRenderingContext2D && origGetImageData) {
    CanvasRenderingContext2D.prototype.getImageData = makeNative(function(sx, sy, sw, sh) {
      const imageData = origGetImageData.apply(this, arguments);
      const mode = profile.canvasNoiseMode;
      if (mode !== 'off' && imageData && imageData.data && imageData.data.length >= 8) {
        const d = imageData.data;
        const seed = getDomainSeed(profile.canvasNoiseSeed || 42);
        const jitter = getCanvasJitter();
        d[0] = (d[0] + jitter + (seed & 0x07) + 1) & 0xff;
        d[1] = (d[1] + ((seed >> 3) & 0x07) + 1) & 0xff;
        d[2] = (d[2] + ((seed >> 6) & 0x07) + 1) & 0xff;
        d[3] = d[3] === 0 ? ((seed % 7) + 1) : d[3];
        d[4] = (d[4] + ((seed >> 9) & 0x07) + 1) & 0xff;
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
          const seed = getDomainSeed(profile.canvasNoiseSeed || 42);
          const delta = (((seed % 11) - 5) || 1) * 0.0001;
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
        const seed = getDomainSeed(profile.canvasNoiseSeed || 42);
        const delta = (((seed % 9) - 4) || 1) * 0.00005;
        return new DOMRect(rect.x, rect.y, rect.width + delta, rect.height + delta);
      }
      return rect;
    }, 'getBoundingClientRect');
  }

  if (window.HTMLCanvasElement) {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const createFarbledCanvasClone = (srcCanvas) => {
      try {
        const w = Math.max(1, srcCanvas.width || 1);
        const h = Math.max(1, srcCanvas.height || 1);
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const tmpCtx = origGetContext ? origGetContext.call(tmp, '2d') : tmp.getContext('2d');
        if (!tmpCtx) return null;
        try {
          tmpCtx.drawImage(srcCanvas, 0, 0);
        } catch (_) {}
        const patchW = Math.min(2, w);
        const patch = origGetImageData
          ? origGetImageData.call(tmpCtx, 0, 0, patchW, 1)
          : tmpCtx.getImageData(0, 0, patchW, 1);
        const seed = getDomainSeed(profile.canvasNoiseSeed || 42);
        patch.data[0] = (patch.data[0] ^ ((seed & 0xff) || 1)) & 0xff;
        patch.data[1] = (patch.data[1] ^ (((seed >>> 8) & 0xff) || 3)) & 0xff;
        patch.data[2] = (patch.data[2] ^ (((seed >>> 16) & 0xff) || 7)) & 0xff;
        // Ensure non-zero alpha so premultiplied alpha PNG serialization never zeroes out RGB channels
        patch.data[3] = 240 + (seed % 15);
        if (patch.data.length >= 8) {
          patch.data[4] = (patch.data[4] ^ (((seed >>> 4) & 0xff) || 5)) & 0xff;
          patch.data[5] = (patch.data[5] ^ (((seed >>> 12) & 0xff) || 9)) & 0xff;
          patch.data[6] = (patch.data[6] ^ (((seed >>> 20) & 0xff) || 11)) & 0xff;
          patch.data[7] = 240 + ((seed >>> 3) % 15);
        }
        if (origPutImageData) {
          origPutImageData.call(tmpCtx, patch, 0, 0);
        } else {
          tmpCtx.putImageData(patch, 0, 0);
        }
        return tmp;
      } catch (_) {
        return null;
      }
    };

    HTMLCanvasElement.prototype.toDataURL = makeNative(function() {
      const mode = profile.canvasNoiseMode;
      if (mode !== 'off') {
        const clone = createFarbledCanvasClone(this);
        if (clone) {
          return origToDataURL.apply(clone, arguments);
        }
      }
      return origToDataURL.apply(this, arguments);
    }, 'toDataURL');

    if (HTMLCanvasElement.prototype.toBlob) {
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = makeNative(function(callback, type, quality) {
        const mode = profile.canvasNoiseMode;
        if (mode !== 'off') {
          const clone = createFarbledCanvasClone(this);
          if (clone) {
            return origToBlob.apply(clone, arguments);
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
            const seed = getDomainSeed(profile.canvasNoiseSeed || 42);
            const imgData = ctx.getImageData(0, 0, 1, 1);
            imgData.data[0] = (imgData.data[0] ^ ((seed & 0xff) || 1)) & 0xff;
            imgData.data[3] = 240 + (seed % 15);
            ctx.putImageData(imgData, 0, 0);
          } catch (_) {}
        }
      }
      return origConvertToBlob.apply(this, arguments);
    }, 'convertToBlob');
  }

  // 7. Paranoid AudioContext & OfflineAudioContext Neutralization (Full-Buffer Per-Origin Farbling)
  const getAudioJitter = () => {
    const mode = profile.audioNoiseMode;
    if (mode === 'off') return 0;
    const seed = getDomainSeed(profile.audioNoiseSeed || 73);
    const base = ((seed % 997) + 1) * 1e-7;
    if (mode === 'subtle') return base * 0.5;
    if (mode === 'extreme') return base * 10;
    return base;
  };

  if (window.AudioBuffer) {
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = makeNative(function() {
      const data = origGetChannelData.apply(this, arguments);
      const mode = profile.audioNoiseMode;
      if (mode !== 'off' && data && data.length > 0 && !data.__noctisJittered) {
        try {
          Object.defineProperty(data, '__noctisJittered', { value: true, configurable: true });
        } catch (_) {}
        const jitter = getAudioJitter();
        data[0] = data[0] + jitter;
        if (data.length > 10) data[10] = data[10] - (jitter * 0.5);
        // Perturb across full sample range (including [4500..5000] used by FingerprintJS2 / CoverYourTracks)
        for (let i = 16; i < data.length; i += 16) {
          data[i] = data[i] + jitter * (((i >>> 4) % 5) + 1);
        }
      }
      return data;
    }, 'getChannelData');

    if (AudioBuffer.prototype.copyFromChannel) {
      const origCopyFromChannel = AudioBuffer.prototype.copyFromChannel;
      AudioBuffer.prototype.copyFromChannel = makeNative(function(destination, channelNumber, startInChannel) {
        origCopyFromChannel.apply(this, arguments);
        const mode = profile.audioNoiseMode;
        if (mode !== 'off' && destination && destination.length > 0) {
          const jitter = getAudioJitter();
          for (let i = 0; i < destination.length; i += 16) {
            destination[i] += jitter * (((i >>> 4) % 5) + 1);
          }
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
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          buffer.getChannelData(c);
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

  // 10. WebRTC STUN / ICE Candidate & SDP Leak Neutralization (Zero Local or Public IP Leakage)
  if (window.RTCPeerConnection || window.webkitRTCPeerConnection) {
    const OrigPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    const scrubSdp = function(sdp) {
      if (!sdp || typeof sdp !== 'string') return sdp;
      const nl = String.fromCharCode(10);
      const cr = String.fromCharCode(13);
      return sdp
        .split(nl)
        .filter(function(line) {
          return !line.startsWith('a=candidate:') && !line.startsWith('a=extmap-allow-mixed');
        })
        .map(function(line) {
          if (line.startsWith('c=IN IP4 ') || line.startsWith('c=IN IP6 ')) {
            return 'c=IN IP4 0.0.0.0' + (line.endsWith(cr) ? cr : '');
          }
          return line;
        })
        .join(nl);
    };

    const wrapDescGetter = function(proto, propName) {
      const desc = Object.getOwnPropertyDescriptor(proto, propName);
      if (desc && typeof desc.get === 'function') {
        Object.defineProperty(proto, propName, {
          get: makeNative(function() {
            const val = desc.get.apply(this, arguments);
            if (!val) return val;
            return {
              type: val.type,
              sdp: scrubSdp(val.sdp),
              toJSON: function() {
                return { type: val.type, sdp: scrubSdp(val.sdp) };
              }
            };
          }, 'get ' + propName),
          configurable: true,
          enumerable: true
        });
      }
    };

    if (OrigPeerConnection.prototype) {
      wrapDescGetter(OrigPeerConnection.prototype, 'localDescription');
      wrapDescGetter(OrigPeerConnection.prototype, 'pendingLocalDescription');
      wrapDescGetter(OrigPeerConnection.prototype, 'currentLocalDescription');

      const origCreateOffer = OrigPeerConnection.prototype.createOffer;
      if (origCreateOffer) {
        OrigPeerConnection.prototype.createOffer = makeNative(async function(options) {
          const offer = await origCreateOffer.apply(this, arguments);
          if (offer && offer.sdp) {
            return { type: offer.type, sdp: scrubSdp(offer.sdp) };
          }
          return offer;
        }, 'createOffer');
      }

      const origSetLocalDescription = OrigPeerConnection.prototype.setLocalDescription;
      if (origSetLocalDescription) {
        OrigPeerConnection.prototype.setLocalDescription = makeNative(function(desc) {
          if (desc && desc.sdp) {
            desc = { type: desc.type, sdp: scrubSdp(desc.sdp) };
          }
          return origSetLocalDescription.call(this, desc);
        }, 'setLocalDescription');
      }

      const origGetStats = OrigPeerConnection.prototype.getStats;
      if (origGetStats) {
        OrigPeerConnection.prototype.getStats = makeNative(async function() {
          const report = await origGetStats.apply(this, arguments);
          const safeMap = new Map();
          if (report && typeof report.forEach === 'function') {
            report.forEach((val, key) => {
              if (val && (val.type === 'local-candidate' || val.type === 'remote-candidate' || val.type === 'candidate-pair')) {
                return;
              }
              safeMap.set(key, val);
            });
          }
          return safeMap;
        }, 'getStats');
      }
    }

    const SafeRTCPeerConnection = makeNative(function(config, constraints) {
      // Strip all external STUN/TURN iceServers to block raw UDP public IP discovery
      const safeConfig = Object.assign({}, config || {}, { iceServers: [] });
      const pc = new OrigPeerConnection(safeConfig, constraints);

      // Block host/srflx/prflx ICE candidate events (IPv4 & IPv6)
      const origAddEventListener = pc.addEventListener.bind(pc);
      pc.addEventListener = makeNative(function(type, listener, options) {
        if (type === 'icecandidate' && typeof listener === 'function') {
          const wrapped = function(event) {
            if (event && event.candidate && event.candidate.candidate) {
              return;
            }
            return listener.call(this, event);
          };
          return origAddEventListener(type, wrapped, options);
        }
        return origAddEventListener(type, listener, options);
      }, 'addEventListener');

      let userOnIceCandidate = null;
      try {
        Object.defineProperty(pc, 'onicecandidate', {
          get: () => userOnIceCandidate,
          set: (fn) => {
            userOnIceCandidate = typeof fn === 'function' ? fn : null;
            origAddEventListener('icecandidate', function(event) {
              if (event && event.candidate && event.candidate.candidate) {
                return;
              }
              if (userOnIceCandidate) userOnIceCandidate.call(pc, event);
            });
          },
          configurable: true,
          enumerable: true
        });
      } catch (_) {}

      return pc;
    }, 'RTCPeerConnection');

    SafeRTCPeerConnection.prototype = OrigPeerConnection.prototype;
    Object.setPrototypeOf(SafeRTCPeerConnection, OrigPeerConnection);
    window.RTCPeerConnection = SafeRTCPeerConnection;
    if ('webkitRTCPeerConnection' in window) {
      window.webkitRTCPeerConnection = SafeRTCPeerConnection;
    }

    // Protect against dynamic about:blank / srcdoc <iframe> bypasses (used by browserleaks & FingerprintJS)
    if (window.HTMLIFrameElement && HTMLIFrameElement.prototype) {
      const cwDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
      if (cwDesc && typeof cwDesc.get === 'function') {
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
          get: makeNative(function() {
            const cw = cwDesc.get.apply(this, arguments);
            if (cw) {
              try {
                cw.RTCPeerConnection = SafeRTCPeerConnection;
                if ('webkitRTCPeerConnection' in cw) cw.webkitRTCPeerConnection = SafeRTCPeerConnection;
                if (cw.Navigator && cw.Navigator.prototype) {
                  for (const [prop, getter] of Object.entries(navProps)) {
                    Object.defineProperty(cw.Navigator.prototype, prop, {
                      get: getter,
                      enumerable: true,
                      configurable: true
                    });
                  }
                }
              } catch (_) {}
            }
            return cw;
          }, 'get contentWindow'),
          configurable: true,
          enumerable: true
        });
      }
    }
  }

  // 11. Timezone, Date Offset & Locale Standardization
  try {
    const tzOffsets = {
      'UTC': 0,
      'Atlantic/Reykjavik': 0,
      'Europe/London': 0,
      'Europe/Zurich': -60,
      'Europe/Berlin': -60,
      'Europe/Amsterdam': -60,
      'Europe/Stockholm': -60,
      'America/New_York': 240,
      'America/Chicago': 300,
      'America/Denver': 360,
      'America/Los_Angeles': 420
    };
    const origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = makeNative(function() {
      const opts = origResolvedOptions.apply(this, arguments);
      return {
        ...opts,
        timeZone: profile.timezone || 'America/New_York',
        locale: 'en-US'
      };
    }, 'resolvedOptions');

    Date.prototype.getTimezoneOffset = makeNative(function() {
      const tz = profile.timezone || 'America/New_York';
      return tzOffsets[tz] !== undefined ? tzOffsets[tz] : 0;
    }, 'getTimezoneOffset');
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

  _getBaseDomain(hostname) {
    if (!hostname) return '';
    const clean = String(hostname).toLowerCase().replace(/\.$/, '');
    if (clean === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(clean) || clean.includes(':')) {
      return clean;
    }
    const parts = clean.split('.');
    if (parts.length <= 2) return clean;
    return parts.slice(-2).join('.');
  }

  _isDntCompliant(hostname) {
    if (!hostname) return false;
    const lower = hostname.toLowerCase();
    if (this.dntCompliantHosts.has(lower)) return true;
    const base = this._getBaseDomain(lower);
    return this.dntCompliantHosts.has(base);
  }

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

    // Allow certified EFF Do-Not-Track (DNT) policy compliant domains unless explicitly carrying ad_url/trackingserver
    if (this._isDntCompliant(hostname) && !search.includes('ad_url=') && !search.includes('trackingserver=')) {
      return { isTracker: false, dntCompliant: true };
    }

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

    // 5. Privacy Badger-style Behavioral Cross-Site Tracker Heuristic (3+ distinct first-party origins)
    if (initiatorHost) {
      try {
        const initHostname = initiatorHost.includes('://')
          ? new URL(initiatorHost).hostname.toLowerCase()
          : String(initiatorHost).toLowerCase();
        const targetBase = this._getBaseDomain(hostname);
        const initBase = this._getBaseDomain(initHostname);
        if (
          targetBase &&
          initBase &&
          targetBase !== initBase &&
          targetBase !== '127.0.0.1' &&
          targetBase !== 'localhost' &&
          !this._isDntCompliant(hostname)
        ) {
          let origins = this.crossSiteThirdParties.get(targetBase);
          if (!origins) {
            origins = new Set();
            this.crossSiteThirdParties.set(targetBase, origins);
          }
          origins.add(initBase);
          if (origins.size >= 3) {
            this.blockedTrackersCount++;
            return {
              isTracker: true,
              reason: `Behavioral Cross-Site Tracker (${origins.size} First-Party Origins): ${hostname}`,
              category: 'behavioral'
            };
          }
        }
      } catch (_) {}
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

    this.communityFeedsLoaded = true;
    this.activeFeedName = sourceName;
    this.feedDomainsCount = domainList.length;

    return added;
  }

  /**
   * Unload all community filter feeds from memory, retaining only core built-in shield rules.
   */
  unloadCommunityFeeds() {
    this.communityFeedsLoaded = false;
    this.adTrackerHosts = new Set(BUILTIN_AD_AND_TRACKER_HOSTS.map(h => h.toLowerCase()));
    this.activeFeedName = 'Core Built-in Shield Only (Community Feeds Unloaded)';
    this.feedDomainsCount = 0;
    return this.getStats();
  }

  /**
   * Load or restore the default bundled community filter feed into memory.
   */
  loadDefaultCommunityFeed() {
    this.communityFeedsLoaded = true;
    this.adTrackerHosts = new Set([
      ...BUILTIN_AD_AND_TRACKER_HOSTS.map(h => h.toLowerCase()),
      ...this.defaultCommunityDomains
    ]);
    this.activeFeedName = this.defaultCommunityDomains.length > 0
      ? "Peter Lowe's Ad & Tracking Servers (Default)"
      : 'Built-in Ad & Tracker Shield';
    this.feedDomainsCount = this.defaultCommunityDomains.length;
    return this.getStats();
  }

  resetToDefaults() {
    this.crossSiteThirdParties.clear();
    return this.loadDefaultCommunityFeed();
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
    // Completely drop Referer and third-party Cookies if outbound target is cross-site
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
          const refBase = this._getBaseDomain(refUrl.hostname);
          const reqBase = this._getBaseDomain(reqUrl.hostname);
          if (refBase && reqBase && refBase !== reqBase && !this._isDntCompliant(reqUrl.hostname)) {
            for (const hk of Object.keys(cleanHeaders)) {
              if (hk.toLowerCase() === 'cookie') {
                delete cleanHeaders[hk];
              }
            }
          }
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
      communityFeedsLoaded: this.communityFeedsLoaded,
      obfuscateFingerprint: this.obfuscateFingerprint,
      blockedTrackersCount: this.blockedTrackersCount,
      probesObfuscatedCount: this.probesObfuscatedCount,
      totalRulesActive: this.trackerPatterns.length + this.adTrackerHosts.size + this.heuristicKeywords.length,
      activeFeedName: this.activeFeedName,
      totalBlockedHosts: this.adTrackerHosts.size,
      coreBuiltInHostsCount: BUILTIN_AD_AND_TRACKER_HOSTS.length,
      feedDomainsCount: this.feedDomainsCount,
      activeProfile: this.getProfile(),
      engineVersion: this.getEngineVersionInfo()
    };
  }
}

module.exports = new PrivacyEngine();
