// --- NoctisBrowser Paranoid Privacy Shield & Dynamic Anti-Fingerprinting Engine ---
// Injected into guest webviews at document_start to defeat advanced browser fingerprinting
(function () {
  'use strict';
  console.log('--- NOCTIS PRIVACY SHIELD INITIALIZING ---');

  // Prevent double wrapping
  if (window.__NOCTIS_SHIELD_ACTIVE__ || window.__NETSCOPE_SHIELD_ACTIVE__) {
    if (window.__NOCTIS_UPDATE_PROFILE__) {
      window.__NOCTIS_UPDATE_PROFILE__({"name":"Linux Ubuntu x86_64 (AMD Radeon RX 6700)","os":"Linux","platform":"Linux x86_64","platformVersion":"6.5.0","architecture":"x86","bitness":"64","model":"","userAgent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36","appVersion":"5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36","webglVendor":"Google Inc. (AMD)","webglRenderer":"ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)","hardwareConcurrency":12,"deviceMemory":16,"timezone":"UTC","screen":{"width":2560,"height":1440,"availWidth":2560,"availHeight":1400,"colorDepth":24,"pixelDepth":24,"devicePixelRatio":1},"presetKey":"linux-amd","canvasNoiseMode":"paranoid","canvasNoiseSeed":453691,"audioNoiseMode":"paranoid","audioNoiseSeed":891193,"letterboxing":true,"screenCaptureProtection":true,"runtimeDrift":true,"driftIntervalSec":60,"driftOnNavigation":true,"driftCount":0,"lastVariedAt":1792206674149});
    }
    return;
  }
  window.__NOCTIS_SHIELD_ACTIVE__ = true;
  window.__NETSCOPE_SHIELD_ACTIVE__ = true;

  let profile = {"name":"Linux Ubuntu x86_64 (AMD Radeon RX 6700)","os":"Linux","platform":"Linux x86_64","platformVersion":"6.5.0","architecture":"x86","bitness":"64","model":"","userAgent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36","appVersion":"5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36","webglVendor":"Google Inc. (AMD)","webglRenderer":"ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)","hardwareConcurrency":12,"deviceMemory":16,"timezone":"UTC","screen":{"width":2560,"height":1440,"availWidth":2560,"availHeight":1400,"colorDepth":24,"pixelDepth":24,"devicePixelRatio":1},"presetKey":"linux-amd","canvasNoiseMode":"paranoid","canvasNoiseSeed":453691,"audioNoiseMode":"paranoid","audioNoiseSeed":891193,"letterboxing":true,"screenCaptureProtection":true,"runtimeDrift":true,"driftIntervalSec":60,"driftOnNavigation":true,"driftCount":0,"lastVariedAt":1792206674149};

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
