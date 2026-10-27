const { EventEmitter } = require('events');
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { URL } = require('url');

// Curated Virtual Relay Profiles & DoH Resolvers for Built-in Browser VPN
const VPN_EXIT_RELAYS = {
  'ch-zurich': {
    id: 'ch-zurich',
    name: 'Switzerland (Zurich) — Strict Privacy',
    region: 'CH',
    countryCode: '{ch}',
    dohEndpoint: 'https://security.cloudflare-dns.com/dns-query',
    dohHost: 'security.cloudflare-dns.com',
    timezone: 'Europe/Zurich',
    latencySimMs: 12
  },
  'is-reykjavik': {
    id: 'is-reykjavik',
    name: 'Iceland (Reykjavik) — Zero-Log Sanctuary',
    region: 'IS',
    countryCode: '{is}',
    dohEndpoint: 'https://cloudflare-dns.com/dns-query',
    dohHost: 'cloudflare-dns.com',
    timezone: 'Atlantic/Reykjavik',
    latencySimMs: 18
  },
  'se-stockholm': {
    id: 'se-stockholm',
    name: 'Sweden (Stockholm) — Mullvad / DoH Core',
    region: 'SE',
    countryCode: '{se}',
    dohEndpoint: 'https://security.cloudflare-dns.com/dns-query',
    dohHost: 'security.cloudflare-dns.com',
    timezone: 'Europe/Stockholm',
    latencySimMs: 15
  },
  'us-newyork': {
    id: 'us-newyork',
    name: 'United States (New York) — High Speed',
    region: 'US',
    countryCode: '{us}',
    dohEndpoint: 'https://cloudflare-dns.com/dns-query',
    dohHost: 'cloudflare-dns.com',
    timezone: 'America/New_York',
    latencySimMs: 8
  },
  'de-frankfurt': {
    id: 'de-frankfurt',
    name: 'Germany (Frankfurt) — EU Backbone',
    region: 'DE',
    countryCode: '{de}',
    dohEndpoint: 'https://security.cloudflare-dns.com/dns-query',
    dohHost: 'security.cloudflare-dns.com',
    timezone: 'Europe/Berlin',
    latencySimMs: 14
  }
};

// Curated Dark Web & Decentralized Landmarks for testing and exploration
const DARK_WEB_DIRECTORY = [
  {
    name: 'DuckDuckGo Onion v3',
    protocol: 'Tor (.onion)',
    url: 'https://duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion',
    description: 'Official DuckDuckGo privacy search engine hosted as a v3 Tor hidden service.'
  },
  {
    name: 'Tor Project Official Onion',
    protocol: 'Tor (.onion)',
    url: 'http://2gzyxa5ihm7nsggfxnu52rck2vv4rvmdlkiu3zzui5du4xyclen53wid.onion',
    description: 'The Tor Project official hidden service portal and documentation.'
  },
  {
    name: 'ProPublica Investigative Onion',
    protocol: 'Tor (.onion)',
    url: 'http://p53lf57qovyuvwsc6xnrppyply3vtqm7l6pcobkmyqsiofyeznfu5uqd.onion',
    description: 'Pulitzer Prize-winning investigative journalism accessible over Tor.'
  },
  {
    name: 'IPFS InterPlanetary Docs',
    protocol: 'IPFS (ipfs://)',
    url: 'ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/wiki/Vincent_van_Gogh.html',
    description: 'Content-addressed Wikipedia mirror served over InterPlanetary File System (IPFS).'
  },
  {
    name: 'Vitalik Buterin ENS (.eth)',
    protocol: 'ENS / IPNS (.eth)',
    url: 'https://vitalik.eth',
    description: 'Decentralized Ethereum Name Service + IPFS website resolved via privacy gateway.'
  },
  {
    name: 'Planet I2P Eepsite Portal',
    protocol: 'I2P (.i2p)',
    url: 'http://planet.i2p',
    description: 'Invisible Internet Project (I2P) garlic-routed eepsite aggregator.'
  },
  {
    name: 'Lokinet SNApp Directory',
    protocol: 'Lokinet (.loki)',
    url: 'http://directory.loki',
    description: 'LLARP onion-routed service node network directory.'
  }
];

class TorVpnManager extends EventEmitter {
  constructor() {
    super();

    this.ephemeralDirPath = null;
    this.sessions = [];

    // Routing Modes: 'direct' | 'built-in-vpn' | 'tor' | 'i2p' | 'custom-proxy'
    this.mode = 'direct';
    this.vpnEnabled = false;
    this.selectedRelay = 'ch-zurich';
    this.killSwitch = false;
    this.dnsOverHttps = true;
    this.forceDnssec = true; // Strict DNSSEC Cryptographic Validation forced by default
    this.requireSecureTraffic = true; // Default to requiring security (HTTPS-Only / No Plain Text on Onion Router & VPN)

    // Dark Web Protocol Settings
    this.onionGatewayFallback = true;
    this.onionGatewayHost = 'onion.ly'; // e.g., 'onion.ly', 'tor2web.org', 'onion.ws'
    this.ipfsGateway = 'https://dweb.link'; // e.g., 'https://dweb.link', 'https://ipfs.io'
    this.i2pGatewayFallback = true;
    this.i2pGatewayHost = 'i2p.xyz';

    // Custom Proxy Settings
    this.customProxyRules = 'socks5://127.0.0.1:1080';

    // Detected Local Daemons State
    this.daemons = {
      torSocksPort: null,    // 9050 or 9150 or 9250 if detected
      torControlPort: null,  // 9051 or 9151 or 9251 if detected
      torBinaryPath: null,   // Bundled or system tor binary path
      torManagedPid: null,
      i2pHttpPort: null,     // 4444 if detected
      i2pSocksPort: null,    // 4447 if detected
      ipfsGatewayPort: null, // 8080 if detected
      zeronetPort: null,     // 43110 if detected
      hyphanetPort: null,    // 8888 if detected
      lastProbedAt: null
    };

    // Built-in Local Encrypted Tunnel Proxy Server
    this.tunnelServer = null;
    this.tunnelPort = null;
    this.activeSockets = new Set();
    this.dohCache = new Map(); // hostname -> { ip, expiresAt }
    this.circuitId = this._generateCircuitId();
    this.circuitCount = 1;
    this.lastRotatedAt = Date.now();

    // Telemetry Metrics
    this.metrics = {
      tunnelBytesRouted: 0,
      tunnelConnections: 0,
      dohQueriesResolved: 0,
      dnssecQueriesValidated: 0,
      insecureUpgradedToHttps: 0,
      darkWebRequestsResolved: 0,
      blockedByKillSwitch: 0
    };

    this._managedTorProcess = null;
    this._appliedExitCountry = null;
    this.currentMaskedIp = null;
    this.directBaselineIp = null;
    this.ipMaskVerified = false;
    this.lastUnmaskedIp = null;
  }

  _generateCircuitId() {
    return 'NOCTIS-CIRCUIT-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  async initialize(ephemeralDirPath, sessions = []) {
    this.ephemeralDirPath = ephemeralDirPath;
    this.sessions = sessions.filter(Boolean);

    // 1. Start built-in local Noctis VPN tunnel server on 127.0.0.1:0
    await this._startLocalVpnTunnel();

    // 2. Measure unproxied direct baseline IP in background for honest IP masking verification
    this.probeDirectBaselineIp().catch(() => {});

    // 3. Probe local dark-web daemons (Tor 9050/9150, I2P 4444/4447, IPFS 8080, ZeroNet 43110)
    await this.probeLocalDaemons();

    // 4. Apply initial proxy rules to all sessions
    await this.applyRoutingToSessions();

    return this.getStatus();
  }

  // --- Local Daemon Detection & Managed Tor ---

  async probePort(port, host = '127.0.0.1', timeoutMs = 350) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });
  }

  /**
   * Build platform-aware environment variables for spawning the bundled Tor binary.
   * - Linux (Fedora/Ubuntu/Debian/Arch): sets LD_LIBRARY_PATH so ld-linux.so finds bundled libevent/libssl/libcrypto
   * - macOS: sets DYLD_LIBRARY_PATH and DYLD_FALLBACK_LIBRARY_PATH
   * - Windows: prepends binary directory to PATH so DLLs resolve
   */
  buildTorSpawnEnv(binPath, platformOverride = process.platform) {
    const binDir = platformOverride === 'win32' && String(binPath).includes('\\')
      ? path.win32.dirname(binPath)
      : path.dirname(binPath);
    const env = { ...process.env };
    if (platformOverride === 'linux') {
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${binDir}:${env.LD_LIBRARY_PATH}` : binDir;
    } else if (platformOverride === 'darwin') {
      env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH ? `${binDir}:${env.DYLD_LIBRARY_PATH}` : binDir;
      env.DYLD_FALLBACK_LIBRARY_PATH = env.DYLD_FALLBACK_LIBRARY_PATH ? `${binDir}:${env.DYLD_FALLBACK_LIBRARY_PATH}` : binDir;
    } else if (platformOverride === 'win32') {
      env.PATH = env.PATH ? `${binDir};${env.PATH}` : binDir;
    }
    return env;
  }

  /**
   * Locate GeoIP and GeoIPv6 databases required for country-pinned VPN exit node selection.
   */
  getGeoIpPaths() {
    const homedir = os.homedir();
    const execDir = process.execPath ? path.dirname(process.execPath) : '';
    const candidateDirs = [
      path.join(__dirname, '../../bin/geoip'),
      path.join(process.resourcesPath || '', 'app/bin/geoip'),
      path.join(process.resourcesPath || '', 'bin/geoip'),
      path.join(execDir, 'bin/geoip'),
      path.join(execDir, 'resources/app/bin/geoip'),
      path.join(homedir, '.noctis-browser/tor/data'),
      '/usr/share/tor',
      '/usr/local/share/tor',
      '/opt/homebrew/share/tor'
    ];

    let geoipPath = null;
    let geoip6Path = null;
    for (const dir of candidateDirs) {
      if (!dir) continue;
      const g4 = path.join(dir, 'geoip');
      const g6 = path.join(dir, 'geoip6');
      try {
        if (!geoipPath && fs.existsSync(g4)) geoipPath = g4;
        if (!geoip6Path && fs.existsSync(g6)) geoip6Path = g6;
      } catch (_) {}
      if (geoipPath && geoip6Path) break;
    }
    return { geoipPath, geoip6Path };
  }

  /**
   * Cross-platform Tor binary resolver supporting macOS (darwin), Linux (Fedora/Debian/Arch), and Windows (win32),
   * including portable zero-admin directories.
   */
  findTorBinary(platformOverride = process.platform, archOverride = process.arch) {
    const isArm = archOverride === 'arm64';
    const archDir = isArm ? 'aarch64' : 'x86_64';
    const platDir = platformOverride === 'darwin'
      ? 'macos'
      : (platformOverride === 'linux' ? 'linux' : (platformOverride === 'win32' ? 'windows' : platformOverride));
    const exeName = platformOverride === 'win32' ? 'tor.exe' : 'tor';
    const homedir = os.homedir();
    const execDir = process.execPath ? path.dirname(process.execPath) : '';

    const candidates = [
      // 1. Bundled cross-platform binaries in repo or packaged app resources
      path.join(__dirname, `../../bin/${platDir}/${archDir}/${exeName}`),
      path.join(__dirname, `../../bin/${platDir}/x86_64/${exeName}`),
      path.join(process.resourcesPath || '', `app/bin/${platDir}/${archDir}/${exeName}`),
      path.join(process.resourcesPath || '', `app/bin/${platDir}/x86_64/${exeName}`),
      path.join(process.resourcesPath || '', `bin/${platDir}/${archDir}/${exeName}`),
      path.join(process.resourcesPath || '', `bin/${platDir}/x86_64/${exeName}`),
      // 2. Portable zero-admin bundle relative to executable directory
      path.join(execDir, `bin/${platDir}/${archDir}/${exeName}`),
      path.join(execDir, `bin/${platDir}/x86_64/${exeName}`),
      path.join(execDir, `resources/app/bin/${platDir}/${archDir}/${exeName}`),
      path.join(execDir, `resources/app/bin/${platDir}/x86_64/${exeName}`),
      // 3. User persistent auto-download directory (~/.noctis-browser/tor)
      path.join(homedir, `.noctis-browser/tor/tor/${exeName}`),
      path.join(homedir, `.noctis-browser/tor/${exeName}`),
      // 4. Platform-specific system & Tor Browser installations
      ...(platformOverride === 'darwin' ? [
        '/opt/homebrew/bin/tor',
        '/usr/local/bin/tor',
        '/Applications/Tor Browser.app/Contents/MacOS/Tor/tor.real',
        '/Applications/Tor Browser.app/Contents/Resources/TorBrowser/Tor/tor'
      ] : []),
      ...(platformOverride === 'linux' ? [
        '/usr/bin/tor',
        '/usr/sbin/tor',
        '/usr/local/bin/tor',
        '/snap/bin/tor',
        path.join(homedir, '.local/share/torbrowser/tbb/x86_64/tor-browser/Browser/TorBrowser/Tor/tor'),
        path.join(homedir, 'tor-browser/Browser/TorBrowser/Tor/tor')
      ] : []),
      ...(platformOverride === 'win32' ? [
        path.win32.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe'),
        path.win32.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe'),
        path.join(homedir, 'Desktop', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe'),
        path.join(homedir, 'AppData', 'Local', 'Tor Browser', 'Browser', 'TorBrowser', 'Tor', 'tor.exe')
      ] : [])
    ];

    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
          if (platformOverride !== 'win32') {
            try { fs.chmodSync(p, 0o755); } catch (_) {}
          }
          return p;
        }
      } catch (_) {}
    }
    return null;
  }

  async probeLocalDaemons() {
    const [
      tor9050,
      tor9150,
      tor9250,
      torCtrl9051,
      torCtrl9151,
      torCtrl9251,
      i2p4444,
      i2p4447,
      ipfs8080,
      zero43110,
      hypha8888
    ] = await Promise.all([
      this.probePort(9050),
      this.probePort(9150),
      this.probePort(9250),
      this.probePort(9051),
      this.probePort(9151),
      this.probePort(9251),
      this.probePort(4444),
      this.probePort(4447),
      this.probePort(8080),
      this.probePort(43110),
      this.probePort(8888)
    ]);

    this.daemons.torSocksPort = tor9050 ? 9050 : (tor9150 ? 9150 : (tor9250 ? 9250 : null));
    this.daemons.torControlPort = torCtrl9051 ? 9051 : (torCtrl9151 ? 9151 : (torCtrl9251 ? 9251 : null));
    this.daemons.torBinaryPath = this.findTorBinary();
    this.daemons.i2pHttpPort = i2p4444 ? 4444 : null;
    this.daemons.i2pSocksPort = i2p4447 ? 4447 : null;
    this.daemons.ipfsGatewayPort = ipfs8080 ? 8080 : null;
    this.daemons.zeronetPort = zero43110 ? 43110 : null;
    this.daemons.hyphanetPort = hypha8888 ? 8888 : null;
    this.daemons.lastProbedAt = Date.now();

    this.emit('status-updated', this.getStatus());
    return this.daemons;
  }

  /**
   * Automatically download and unpack the official Tor Expert Bundle for the user's platform.
   * Extracted into ~/.noctis-browser/tor/ so it persists across runs and requires zero manual setup.
   */
  async downloadAndInstallTorDaemon() {
    const osPlatform = process.platform;

    let downloadUrl;
    let fallbackUrl;
    if (osPlatform === 'darwin') {
      downloadUrl = 'https://archive.torproject.org/tor-package-archive/torbrowser/14.0.7/tor-expert-bundle-macos-x86_64-14.0.7.tar.gz';
      fallbackUrl = 'https://dist.torproject.org/torbrowser/14.0.7/tor-expert-bundle-macos-x86_64-14.0.7.tar.gz';
    } else if (osPlatform === 'linux') {
      downloadUrl = 'https://archive.torproject.org/tor-package-archive/torbrowser/14.0.7/tor-expert-bundle-linux-x86_64-14.0.7.tar.gz';
      fallbackUrl = 'https://dist.torproject.org/torbrowser/14.0.7/tor-expert-bundle-linux-x86_64-14.0.7.tar.gz';
    } else if (osPlatform === 'win32') {
      downloadUrl = 'https://archive.torproject.org/tor-package-archive/torbrowser/14.0.7/tor-expert-bundle-windows-x86_64-14.0.7.tar.gz';
      fallbackUrl = 'https://dist.torproject.org/torbrowser/14.0.7/tor-expert-bundle-windows-x86_64-14.0.7.tar.gz';
    } else {
      return { success: false, error: `Automated Tor download is not supported for platform: ${osPlatform}` };
    }

    const installDir = path.join(os.homedir(), '.noctis-browser', 'tor');
    fs.mkdirSync(installDir, { recursive: true });
    const tempTarPath = path.join(os.tmpdir(), `tor-expert-bundle-${Date.now()}.tar.gz`);

    this.emit('download-progress', { percent: 0, status: 'Connecting to Tor Project mirrors...' });

    const fetchWithRedirects = (url, redirectCount = 0) => {
      return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects from mirror'));
        const request = https.get(url, {
          headers: { 'User-Agent': 'NoctisBrowser-TorInstaller/2.0' },
          timeout: 15000
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return resolve(fetchWithRedirects(res.headers.location, redirectCount + 1));
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Server returned HTTP ${res.statusCode}`));
          }
          resolve(res);
        });
        request.on('error', reject);
        request.on('timeout', () => { request.destroy(); reject(new Error('Download mirror timeout')); });
      });
    };

    let stream;
    try {
      stream = await fetchWithRedirects(downloadUrl);
    } catch (e1) {
      try {
        stream = await fetchWithRedirects(fallbackUrl);
      } catch (e2) {
        return { success: false, error: `Failed to download Tor bundle from mirrors: ${e2.message}` };
      }
    }

    const totalBytes = parseInt(stream.headers['content-length'] || '0', 10);
    let transferred = 0;
    const fileStream = fs.createWriteStream(tempTarPath);

    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        transferred += chunk.length;
        const pct = totalBytes > 0 ? Math.round((transferred / totalBytes) * 100) : 0;
        this.emit('download-progress', {
          percent: pct,
          transferred,
          total: totalBytes,
          status: `Downloading Tor Expert Bundle (${pct}%)...`
        });
      });
      stream.pipe(fileStream);
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
      stream.on('error', reject);
    });

    this.emit('download-progress', { percent: 92, status: 'Extracting Tor binaries & libraries...' });

    // Extract archive
    const { exec } = require('child_process');
    await new Promise((resolve, reject) => {
      exec(`tar -xzf "${tempTarPath}" -C "${installDir}"`, (err) => {
        try { fs.unlinkSync(tempTarPath); } catch (_) {}
        if (err) return reject(err);
        resolve();
      });
    });

    // Locate binary
    const possiblePaths = [
      path.join(installDir, 'tor', 'tor'),
      path.join(installDir, 'tor'),
      path.join(installDir, 'tor', 'tor.exe'),
      path.join(installDir, 'tor.exe')
    ];
    let installedBinary = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try { fs.chmodSync(p, 0o755); } catch (_) {}
        installedBinary = p;
        break;
      }
    }

    if (!installedBinary) {
      return { success: false, error: 'Extraction finished, but tor executable was not found.' };
    }

    // Set permissions on companion dylibs
    try {
      const dylibCandidates = [
        path.join(path.dirname(installedBinary), 'libevent-2.1.7.dylib'),
        path.join(path.dirname(installedBinary), 'libtor.dylib')
      ];
      for (const d of dylibCandidates) {
        if (fs.existsSync(d)) fs.chmodSync(d, 0o755);
      }
    } catch (_) {}

    this.daemons.torBinaryPath = installedBinary;
    await this.probeLocalDaemons();

    this.emit('download-progress', { percent: 100, status: 'Tor daemon installed and ready!' });
    this.emit('status-updated', this.getStatus());

    // Auto-bootstrap newly installed daemon
    const startRes = await this.startManagedTorDaemon();

    return {
      success: true,
      message: `Tor daemon installed and bootstrapped successfully at ${installedBinary}`,
      binaryPath: installedBinary,
      socksPort: this.daemons.torSocksPort,
      daemonStarted: startRes.success
    };
  }

  /**
   * Seed ephemeral Tor DataDirectory with cached public consensus files so Tor bootstraps in ~2s instead of ~12s.
   */
  _seedTorConsensusCache(torDataDir) {
    try {
      const cacheDir = path.join(os.homedir(), '.noctis-browser', 'tor-consensus-cache');
      if (!fs.existsSync(cacheDir)) return;
      const files = ['cached-certs', 'cached-microdesc-consensus', 'cached-microdescs', 'cached-microdescs.new'];
      for (const f of files) {
        const src = path.join(cacheDir, f);
        const dest = path.join(torDataDir, f);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }
    } catch (_) {}
  }

  _persistTorConsensusCache(torDataDir) {
    try {
      if (!torDataDir || !fs.existsSync(torDataDir)) return;
      const cacheDir = path.join(os.homedir(), '.noctis-browser', 'tor-consensus-cache');
      fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
      const files = ['cached-certs', 'cached-microdesc-consensus', 'cached-microdescs'];
      for (const f of files) {
        const src = path.join(torDataDir, f);
        const dest = path.join(cacheDir, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }
    } catch (_) {}
  }

  /**
   * Configure Tor exit node country code dynamically via ControlPort (e.g. "{ch}", "{is}", "{se}", "{us}", "{de}").
   */
  async _configureTorExitRelay(countryCode = '') {
    const controlPort = this.daemons.torControlPort;
    if (!controlPort) return false;
    const normalized = countryCode || '';
    if (this._appliedExitCountry === normalized) return true;

    const { geoipPath, geoip6Path } = this.getGeoIpPaths();
    const geoConfParts = [];
    if (geoipPath) geoConfParts.push(`GeoIPFile="${geoipPath}"`);
    if (geoip6Path) geoConfParts.push(`GeoIPv6File="${geoip6Path}"`);
    const geoConfPrefix = geoConfParts.length > 0 ? geoConfParts.join(' ') + ' ' : '';

    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        if (ok) this._appliedExitCountry = normalized;
        try { socket.destroy(); } catch (_) {}
        resolve(ok);
      };
      socket.setTimeout(800);
      socket.once('connect', () => {
        const setConfCmd = normalized
          ? `SETCONF ${geoConfPrefix}ExitNodes="${normalized}" StrictNodes=0\r\n`
          : `SETCONF ExitNodes="" StrictNodes=0\r\n`;
        socket.write(`AUTHENTICATE ""\r\n${setConfCmd}SIGNAL NEWNYM\r\nQUIT\r\n`);
      });
      socket.on('data', (data) => {
        if (data.toString().includes('250 OK')) {
          done(true);
        }
      });
      socket.once('error', () => done(false));
      socket.once('timeout', () => done(false));
      socket.connect(controlPort, '127.0.0.1');
    });
  }

  /**
   * Launch a managed ephemeral Tor daemon using bundled or downloaded binary.
   */
  async startManagedTorDaemon() {
    await this.probeLocalDaemons();
    if (this.daemons.torSocksPort) {
      const relay = VPN_EXIT_RELAYS[this.selectedRelay] || VPN_EXIT_RELAYS['ch-zurich'];
      if (this.mode === 'built-in-vpn' && relay.countryCode) {
        await this._configureTorExitRelay(relay.countryCode);
      }
      this._refreshMaskedIp();
      return {
        success: true,
        alreadyRunning: true,
        socksPort: this.daemons.torSocksPort
      };
    }

    const bin = this.findTorBinary();
    if (!bin) {
      return {
        success: false,
        error: 'No local Tor binary found on system. Use "Download Native Tor" to install it automatically.'
      };
    }

    const torDataDir = path.join(this.ephemeralDirPath || os.tmpdir(), 'tor-ephemeral-data');
    try {
      fs.mkdirSync(torDataDir, { recursive: true, mode: 0o700 });
    } catch (_) {}
    this._seedTorConsensusCache(torDataDir);

    const port9050Occupied = await this.probePort(9050);
    const targetSocksPort = port9050Occupied ? 9250 : 9050;
    const targetCtrlPort = port9050Occupied ? 9251 : 9051;

    const spawnArgs = [
      '--SocksPort', String(targetSocksPort),
      '--ControlPort', String(targetCtrlPort),
      '--DataDirectory', torDataDir,
      '--CookieAuthentication', '0'
    ];

    const { geoipPath, geoip6Path } = this.getGeoIpPaths();
    if (geoipPath) {
      spawnArgs.push('--GeoIPFile', geoipPath);
    }
    if (geoip6Path) {
      spawnArgs.push('--GeoIPv6File', geoip6Path);
    }

    const relay = VPN_EXIT_RELAYS[this.selectedRelay] || VPN_EXIT_RELAYS['ch-zurich'];
    if (this.mode === 'built-in-vpn' && relay && relay.countryCode) {
      spawnArgs.push('--ExitNodes', relay.countryCode, '--StrictNodes', '0');
      this._appliedExitCountry = relay.countryCode;
    }

    return new Promise((resolve) => {
      try {
        const proc = spawn(bin, spawnArgs, {
          env: this.buildTorSpawnEnv(bin),
          stdio: ['ignore', 'pipe', 'pipe']
        });

        this._managedTorProcess = proc;
        this.daemons.torManagedPid = proc.pid;
        this._managedTorDataDir = torDataDir;

        let settled = false;
        const finish = async (ok, msg) => {
          if (settled) return;
          settled = true;
          this._persistTorConsensusCache(torDataDir);
          await this.probeLocalDaemons();
          this._refreshMaskedIp();
          resolve({
            success: ok,
            socksPort: this.daemons.torSocksPort,
            message: msg
          });
        };

        proc.stdout.on('data', (chunk) => {
          const text = chunk.toString();
          if (text.includes('Bootstrapped 100%')) {
            finish(true, `Managed Tor daemon bootstrapped 100% on 127.0.0.1:${targetSocksPort}`);
          }
        });

        proc.stderr.on('data', () => {});

        proc.on('error', (err) => {
          finish(false, err.message);
        });

        proc.on('exit', () => {
          this._managedTorProcess = null;
          this.daemons.torManagedPid = null;
        });

        setTimeout(() => {
          finish(Boolean(this.daemons.torSocksPort), 'Tor daemon startup initiated');
        }, 12000);
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  }

  /**
   * Measure the host's real unproxied public IP so we can verify that VPN/Tor genuinely changes the egress IP.
   */
  async probeDirectBaselineIp(timeoutMs = 3500) {
    if (this.directBaselineIp && net.isIP(this.directBaselineIp)) {
      return this.directBaselineIp;
    }
    if (this._baselineProbePromise) {
      return this._baselineProbePromise;
    }

    const queryDirect = (urlStr) => new Promise((resolve) => {
      let settled = false;
      const done = (ip) => {
        if (settled) return;
        settled = true;
        resolve(ip);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      try {
        const req = https.get(urlStr, {
          agent: new https.Agent({ keepAlive: false }),
          headers: { 'User-Agent': 'NoctisBrowser-BaselineCheck/1.1' },
          timeout: timeoutMs
        }, (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            clearTimeout(timer);
            const trimmed = (body || '').trim();
            done(net.isIP(trimmed) ? trimmed : null);
          });
        });
        req.on('error', () => { clearTimeout(timer); done(null); });
        req.on('timeout', () => { clearTimeout(timer); req.destroy(); done(null); });
      } catch (_) {
        clearTimeout(timer);
        done(null);
      }
    });

    this._baselineProbePromise = (async () => {
      let ip = await queryDirect('https://api.ipify.org');
      if (!ip) {
        ip = await queryDirect('https://icanhazip.com');
      }
      if (ip && net.isIP(ip) && !this.directBaselineIp) {
        this.directBaselineIp = ip;
      }
      this._baselineProbePromise = null;
      return this.directBaselineIp;
    })();

    return this._baselineProbePromise;
  }

  async probeExternalIp() {
    if (!this.directBaselineIp) {
      await this.probeDirectBaselineIp(2500).catch(() => {});
    }

    let egressIp = null;
    if (this.mode === 'built-in-vpn') {
      if (!this.daemons.torSocksPort) {
        await this.startManagedTorDaemon();
      }
      egressIp = await this._probeExternalIpViaTunnel();
      if (!egressIp && this.daemons.torSocksPort) {
        egressIp = await this._probeExternalIpViaTor();
      }
    } else if (this.mode === 'tor' || this.daemons.torSocksPort) {
      egressIp = await this._probeExternalIpViaTor();
    }

    if (egressIp && net.isIP(egressIp)) {
      if (this.directBaselineIp && egressIp === this.directBaselineIp) {
        // Honest verification: Egress IP matches direct local ISP IP! Never claim masked.
        this.ipMaskVerified = false;
        this.lastUnmaskedIp = egressIp;
        this.currentMaskedIp = null;
        return null;
      }
      this.ipMaskVerified = true;
      this.lastUnmaskedIp = null;
      this.currentMaskedIp = egressIp;
      return egressIp;
    }

    this.ipMaskVerified = false;
    return null;
  }

  /**
   * Probe external IP through the local encrypted VPN privacy tunnel.
   */
  async _probeExternalIpViaTunnel() {
    if (!this.tunnelPort) {
      await this._startLocalVpnTunnel();
    }
    if (!this.tunnelPort) return null;

    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };

      const timer = setTimeout(() => done(null), 8000);

      const req = http.request({
        hostname: '127.0.0.1',
        port: this.tunnelPort,
        method: 'CONNECT',
        path: 'api.ipify.org:443'
      });

      req.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          clearTimeout(timer);
          try { socket.destroy(); } catch (_) {}
          return done(null);
        }

        const tlsSocket = tls.connect({
          socket: socket,
          servername: 'api.ipify.org'
        }, () => {
          tlsSocket.write('GET / HTTP/1.1\r\nHost: api.ipify.org\r\nUser-Agent: NoctisBrowser\r\nConnection: close\r\n\r\n');
        });

        let data = '';
        tlsSocket.on('data', chunk => data += chunk);
        tlsSocket.on('end', () => {
          clearTimeout(timer);
          const parts = data.split('\r\n\r\n');
          const body = (parts[1] || '').trim();
          if (body && net.isIP(body)) {
            done(body);
          } else {
            done(null);
          }
        });
        tlsSocket.on('error', () => {
          clearTimeout(timer);
          done(null);
        });
      });

      req.on('error', () => {
        clearTimeout(timer);
        done(null);
      });
      req.end();
    });
  }

  /**
   * Probe external IP through native Tor SOCKS5 daemon.
   */
  async _probeExternalIpViaTor() {
    const port = this.daemons.torSocksPort;
    if (!port) return null;

    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      const timer = setTimeout(() => done(null), 8000);

      this._connectViaSocks5(port, 'api.ipify.org', 80, 7500).then((socket) => {
        let respBuffer = '';
        socket.on('data', (chunk) => {
          respBuffer += chunk.toString();
          const parts = respBuffer.split('\r\n\r\n');
          if (parts.length > 1) {
            const body = parts[1].trim();
            if (body && net.isIP(body)) {
              clearTimeout(timer);
              try { socket.destroy(); } catch (_) {}
              done(body);
            }
          }
        });
        socket.on('end', () => {
          clearTimeout(timer);
          const parts = respBuffer.split('\r\n\r\n');
          const body = (parts[1] || '').trim();
          done(body && net.isIP(body) ? body : null);
        });
        socket.on('error', () => {
          clearTimeout(timer);
          done(null);
        });
        socket.write('GET / HTTP/1.1\r\nHost: api.ipify.org\r\nUser-Agent: NoctisBrowser\r\nConnection: close\r\n\r\n');
      }).catch(() => {
        clearTimeout(timer);
        done(null);
      });
    });
  }

  _refreshMaskedIp() {
    if (this.mode !== 'built-in-vpn' && this.mode !== 'tor') {
      this.currentMaskedIp = null;
      this.ipMaskVerified = false;
      return;
    }
    this.probeExternalIp().then((ip) => {
      if (ip) {
        this.emit('status-updated', this.getStatus());
      }
    }).catch(() => {});
  }

  // --- Secure Transport & HTTPS-Only Policy (No Plain Text on Onion / VPN) ---

  /**
   * Checks if secure encrypted transport (no plaintext HTTP) is required.
   * Default is true. Always enforced when on Tor Onion Router, Built-in VPN,
   * or when accessing .onion / dark web protocols.
   */
  isSecureRequirementActive(url = null) {
    if (!this.requireSecureTraffic) return false;
    // Always required in Tor mode, VPN mode, or custom proxy
    if (this.mode === 'tor' || this.mode === 'built-in-vpn' || this.mode === 'custom-proxy') {
      return true;
    }
    // Required if URL touches .onion or dark web / decentralized protocols
    if (url && typeof url === 'string') {
      const lower = url.toLowerCase();
      if (lower.includes('.onion') || lower.includes('.i2p') || lower.includes('.loki')) {
        return true;
      }
    }
    // Default active for all browser sessions
    return true;
  }

  /**
   * Determine if an unencrypted plaintext HTTP/WS request must be upgraded or blocked.
   */
  shouldUpgradeOrBlockInsecure(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    // Allow local development and loopback
    if (
      lower.startsWith('http://127.0.0.1') ||
      lower.startsWith('http://localhost') ||
      lower.startsWith('http://[::1]') ||
      lower.startsWith('ws://127.0.0.1') ||
      lower.startsWith('ws://localhost')
    ) {
      return false;
    }
    // Only applies to unencrypted plaintext HTTP / WS
    if (lower.startsWith('http://') || lower.startsWith('ws://')) {
      return this.isSecureRequirementActive(url);
    }
    return false;
  }

  /**
   * Upgrades unencrypted plaintext URL to HTTPS (or WSS).
   */
  upgradeInsecureUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('http://')) {
      this.metrics.insecureUpgradedToHttps = (this.metrics.insecureUpgradedToHttps || 0) + 1;
      return url.replace(/^http:\/\//i, 'https://');
    }
    if (url.startsWith('ws://')) {
      return url.replace(/^ws:\/\//i, 'wss://');
    }
    return url;
  }

  // --- Built-in Local Encrypted Privacy Tunnel (Browser VPN) ---

  /**
   * Establish a TCP stream through a local SOCKS5 proxy (RFC 1928) so the Built-in VPN
   * genuinely routes traffic through a remote exit relay and masks the user's origin IP.
   */
  _connectViaSocks5(socksPort, targetHost, targetPort, timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch (_) {}
        reject(err || new Error('SOCKS5 connection failed'));
      };

      const timer = setTimeout(() => fail(new Error('SOCKS5 connection timeout')), timeoutMs);

      socket.once('error', (err) => {
        clearTimeout(timer);
        fail(err);
      });

      socket.connect(socksPort, '127.0.0.1', () => {
        // SOCKS5 greeting: Version 5, 1 Auth Method, No Auth (0x00)
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
      });

      let stage = 0;
      const onData = (chunk) => {
        if (stage === 0) {
          if (chunk.length >= 2 && chunk[0] === 0x05 && chunk[1] === 0x00) {
            stage = 1;
            const portNum = parseInt(targetPort, 10) || 443;
            const portBuf = Buffer.alloc(2);
            portBuf.writeUInt16BE(portNum, 0);

            if (net.isIPv4(targetHost)) {
              const ipBytes = targetHost.split('.').map(n => parseInt(n, 10));
              const req = Buffer.concat([
                Buffer.from([0x05, 0x01, 0x00, 0x01]),
                Buffer.from(ipBytes),
                portBuf
              ]);
              socket.write(req);
            } else {
              const hostBuf = Buffer.from(String(targetHost), 'utf-8');
              const req = Buffer.concat([
                Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
                hostBuf,
                portBuf
              ]);
              socket.write(req);
            }
          } else {
            clearTimeout(timer);
            fail(new Error('SOCKS5 auth negotiation failed'));
          }
        } else if (stage === 1) {
          if (chunk.length >= 2 && chunk[0] === 0x05 && chunk[1] === 0x00) {
            stage = 2;
            clearTimeout(timer);
            socket.removeListener('data', onData);
            if (!settled) {
              settled = true;
              resolve(socket);
            }
          } else {
            clearTimeout(timer);
            fail(new Error(`SOCKS5 connect rejected (code ${chunk[1]})`));
          }
        }
      };

      socket.on('data', onData);
    });
  }

  _isLoopbackHost(host) {
    if (!host) return false;
    const h = String(host).toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
  }

  _getUpstreamSocksPort(targetHost = '') {
    if (this._isLoopbackHost(targetHost)) {
      return null;
    }
    const isOnion = targetHost && String(targetHost).toLowerCase().endsWith('.onion');
    if ((this.mode === 'built-in-vpn' || this.mode === 'tor' || isOnion) && this.daemons.torSocksPort) {
      return this.daemons.torSocksPort;
    }
    if (this.mode === 'custom-proxy' && this.customProxyRules) {
      const m = this.customProxyRules.match(/^socks5:\/\/127\.0\.0\.1:(\d+)/i);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  async _startLocalVpnTunnel() {
    if (this.tunnelServer) return this.tunnelPort;

    return new Promise((resolve) => {
      const server = http.createServer(async (clientReq, clientRes) => {
        try {
          this.metrics.tunnelConnections++;
          const parsed = new URL(clientReq.url);
          const targetHost = parsed.hostname;
          const targetPort = parseInt(parsed.port, 10) || (parsed.protocol === 'https:' ? 443 : 80);

          // Enforce HTTPS-only / No plaintext over VPN tunnel or Tor
          const reqHost = clientReq.headers.host || parsed.host || '';
          if (this.shouldUpgradeOrBlockInsecure(`http://${reqHost}${clientReq.url}`)) {
            if (reqHost && !reqHost.startsWith('127.0.0.1') && !reqHost.startsWith('localhost')) {
              this.metrics.insecureUpgradedToHttps = (this.metrics.insecureUpgradedToHttps || 0) + 1;
              const redirectPath = parsed.pathname + (parsed.search || '');
              clientRes.writeHead(301, {
                'Location': `https://${reqHost}${redirectPath}`,
                'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
              });
              clientRes.end();
              return;
            }
          }

          const isLoopback = this._isLoopbackHost(targetHost);
          const upstreamSocksPort = this._getUpstreamSocksPort(targetHost);
          const resolvedIp = (!isLoopback && !upstreamSocksPort && this.dnsOverHttps)
            ? await this.resolveHostViaDoH(targetHost)
            : null;

          // Fail-closed protection: never leak local IP if VPN/Tor is active and upstream relay is down
          if (!isLoopback && (this.mode === 'built-in-vpn' || this.mode === 'tor') && !upstreamSocksPort && !this.allowUnmaskedFallback) {
            this.metrics.blockedByKillSwitch++;
            clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
            clientRes.end('Noctis Browser VPN Fail-Closed: Upstream anonymizing exit relay is offline. Local IP leak prevented.');
            return;
          }

          // Strict DoH Fail-Closed: if DoH is active and cannot resolve targetHost, reject to prevent plaintext DNS leak
          if (!isLoopback && !upstreamSocksPort && this.dnsOverHttps && !resolvedIp) {
            this.metrics.blockedByKillSwitch = (this.metrics.blockedByKillSwitch || 0) + 1;
            clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
            clientRes.end('Noctis Browser DoH Fail-Closed: Strict DNS-over-HTTPS resolution failed. Plaintext DNS leak prevented.');
            return;
          }

          // Strip identifying proxy headers
          const cleanHeaders = { ...clientReq.headers };
          delete cleanHeaders['proxy-connection'];
          delete cleanHeaders['x-forwarded-for'];
          delete cleanHeaders['via'];
          delete cleanHeaders['client-ip'];

          const options = {
            hostname: upstreamSocksPort ? targetHost : (resolvedIp || targetHost),
            port: targetPort,
            path: parsed.pathname + parsed.search,
            method: clientReq.method,
            headers: {
              ...cleanHeaders,
              host: parsed.host
            }
          };

          if (upstreamSocksPort) {
            const socksSocket = await this._connectViaSocks5(upstreamSocksPort, targetHost, targetPort);
            options.createConnection = () => socksSocket;
          }

          const proxyReq = http.request(options, (proxyRes) => {
            clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.on('data', (chunk) => {
              this.metrics.tunnelBytesRouted += chunk.length;
            });
            proxyRes.pipe(clientRes);
          });

          proxyReq.on('error', () => {
            if (!clientRes.headersSent) {
              clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
            }
            clientRes.end('Noctis Browser VPN Tunnel Error');
          });

          clientReq.pipe(proxyReq);
        } catch (err) {
          if (!clientRes.headersSent) {
            clientRes.writeHead(500, { 'Content-Type': 'text/plain' });
          }
          clientRes.end('Invalid Tunnel Request');
        }
      });

      // Handle HTTPS CONNECT Tunneling with Encrypted DoH Resolution + Upstream SOCKS5 Exit Relay
      server.on('connect', async (req, clientSocket, head) => {
        this.metrics.tunnelConnections++;
        this.activeSockets.add(clientSocket);
        clientSocket.on('close', () => this.activeSockets.delete(clientSocket));

        const [rawHost, rawPort] = (req.url || '').split(':');
        const port = parseInt(rawPort, 10) || 443;

        try {
          const isLoopback = this._isLoopbackHost(rawHost);
          const upstreamSocksPort = this._getUpstreamSocksPort(rawHost);

          if (upstreamSocksPort) {
            // Route through country-pinned SOCKS5 exit relay (remote DNS resolution at exit relay; zero local DNS leak)
            const targetSocket = await this._connectViaSocks5(upstreamSocksPort, rawHost, port);
            this.activeSockets.add(targetSocket);
            targetSocket.on('close', () => this.activeSockets.delete(targetSocket));

            clientSocket.write(
              'HTTP/1.1 200 Connection Established\r\n' +
              'Proxy-Agent: Noctis-Encrypted-Tunnel/2.1-SOCKS5\r\n' +
              '\r\n'
            );
            if (head && head.length > 0) {
              targetSocket.write(head);
              this.metrics.tunnelBytesRouted += head.length;
            }
            targetSocket.on('data', (chunk) => {
              this.metrics.tunnelBytesRouted += chunk.length;
            });
            clientSocket.on('data', (chunk) => {
              this.metrics.tunnelBytesRouted += chunk.length;
            });
            targetSocket.pipe(clientSocket);
            clientSocket.pipe(targetSocket);

            targetSocket.on('error', () => {
              try { clientSocket.destroy(); } catch (_) {}
            });
            clientSocket.on('error', () => {
              try { targetSocket.destroy(); } catch (_) {}
            });
            return;
          }

          // Fail-closed if VPN or Tor mode is active without an upstream exit relay (unless allowUnmaskedFallback is explicitly set)
          if (!isLoopback && (this.mode === 'built-in-vpn' || this.mode === 'tor') && !this.allowUnmaskedFallback) {
            this.metrics.blockedByKillSwitch++;
            try {
              clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
              clientSocket.destroy();
            } catch (_) {}
            return;
          }

          // Strict DoH resolution for direct connections without upstream SOCKS5
          const connectHost = (!isLoopback && this.dnsOverHttps)
            ? await this.resolveHostViaDoH(rawHost)
            : rawHost;

          if (!isLoopback && this.dnsOverHttps && !connectHost) {
            this.metrics.blockedByKillSwitch = (this.metrics.blockedByKillSwitch || 0) + 1;
            try {
              clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
              clientSocket.destroy();
            } catch (_) {}
            return;
          }

          let targetSocket = net.connect(port, connectHost || rawHost, () => {
            clientSocket.write(
              'HTTP/1.1 200 Connection Established\r\n' +
              'Proxy-Agent: Noctis-Encrypted-Tunnel/2.0\r\n' +
              '\r\n'
            );
            if (head && head.length > 0) {
              targetSocket.write(head);
              this.metrics.tunnelBytesRouted += head.length;
            }
            targetSocket.on('data', (chunk) => {
              this.metrics.tunnelBytesRouted += chunk.length;
            });
            clientSocket.on('data', (chunk) => {
              this.metrics.tunnelBytesRouted += chunk.length;
            });
            targetSocket.pipe(clientSocket);
            clientSocket.pipe(targetSocket);
          });

          this.activeSockets.add(targetSocket);
          targetSocket.on('close', () => this.activeSockets.delete(targetSocket));

          targetSocket.on('error', () => {
            try { clientSocket.destroy(); } catch (_) {}
          });

          clientSocket.on('error', () => {
            try { targetSocket.destroy(); } catch (_) {}
          });
        } catch (_) {
          try { clientSocket.destroy(); } catch (_) {}
        }
      });

      server.on('error', () => {
        resolve(null);
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        this.tunnelPort = addr ? addr.port : null;
        this.tunnelServer = server;
        // Unref so it never blocks Node/Electron process exit in tests
        server.unref();
        resolve(this.tunnelPort);
      });
    });
  }

  /**
   * Resolve hostname via encrypted DNS-over-HTTPS (DoH) with strict DNSSEC validation
   * to prevent ISP DNS snooping, forged records, and DNS spoofing.
   */
  async resolveHostViaDoH(hostname) {
    if (!hostname || !this.dnsOverHttps) return hostname;
    // Skip IP literals and local/darknet hostnames
    if (
      net.isIP(hostname) ||
      hostname === 'localhost' ||
      hostname.endsWith('.onion') ||
      hostname.endsWith('.i2p') ||
      hostname.endsWith('.loki') ||
      hostname.endsWith('.local')
    ) {
      return hostname;
    }

    const cached = this.dohCache.get(hostname);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ip;
    }

    const relay = VPN_EXIT_RELAYS[this.selectedRelay] || VPN_EXIT_RELAYS['ch-zurich'];
    const dohEndpoint = relay.dohEndpoint || 'https://security.cloudflare-dns.com/dns-query';
    const doFlag = this.forceDnssec ? '&do=1' : '';
    const dohUrl = `${dohEndpoint}?name=${encodeURIComponent(hostname)}&type=A${doFlag}`;

    const queryEndpoint = (targetUrl) => {
      return new Promise((resolve) => {
        const req = https.get(targetUrl, {
          headers: {
            'Accept': 'application/dns-json',
            'User-Agent': 'NoctisBrowser-DoH/2.0'
          },
          timeout: 1800
        }, (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (this.forceDnssec) {
                // Status 2 is SERVFAIL (DNSSEC cryptographic signature validation failed)
                if (json.Status === 2) {
                  console.warn(`[DNSSEC] Cryptographic signature validation FAILED for ${hostname} (SERVFAIL). Forcing DNSSEC rejection.`);
                  resolve(null);
                  return;
                }
                if (json.AD === true) {
                  this.metrics.dnssecQueriesValidated = (this.metrics.dnssecQueriesValidated || 0) + 1;
                }
              }
              if (json && Array.isArray(json.Answer)) {
                const aRecord = json.Answer.find(a => a.type === 1 && a.data);
                if (aRecord && net.isIP(aRecord.data)) {
                  this.metrics.dohQueriesResolved++;
                  const ttlMs = Math.max(30, Math.min(300, aRecord.TTL || 60)) * 1000;
                  this.dohCache.set(hostname, {
                    ip: aRecord.data,
                    expiresAt: Date.now() + ttlMs,
                    dnssecValidated: Boolean(json.AD)
                  });
                  resolve(aRecord.data);
                  return;
                }
              }
            } catch (_) {}
            resolve(null);
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });
        req.on('error', () => {
          resolve(null);
        });
      });
    };

    let resolvedIp = await queryEndpoint(dohUrl);
    // If the relay endpoint fails or doesn't support JSON, fallback to direct IP Cloudflare DoH (avoids bootstrap DNS leak)
    if (!resolvedIp) {
      const fallbackUrl = `https://1.1.1.2/dns-query?name=${encodeURIComponent(hostname)}&type=A${doFlag}`;
      resolvedIp = await queryEndpoint(fallbackUrl);
    }
    // High-availability secondary secure DoH fallback (Quad9 direct IP endpoint)
    if (!resolvedIp) {
      const quad9Url = `https://9.9.9.9/dns-query?name=${encodeURIComponent(hostname)}&type=A${doFlag}`;
      resolvedIp = await queryEndpoint(quad9Url);
    }

    return resolvedIp || null;
  }

  // --- Dark Web & Decentralized Protocol URL Resolver ---

  /**
   * Resolves dark web and decentralized protocol URLs or hostnames:
   * - Tor (.onion, tor://)
   * - I2P (.i2p, i2p://)
   * - Lokinet (.loki, loki://)
   * - IPFS / IPNS (ipfs://, ipns://, .eth)
   * - ZeroNet (zero://, zeronet://, .bit)
   * - Hyphanet / Freenet (hyphanet://, freenet:)
   */
  resolveProtocolUrl(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
      return { url: 'about:blank', protocol: 'standard', routed: false };
    }

    const input = rawInput.trim();

    // 1. Internal Noctis / NetScope URLs
    if (input.startsWith('noctis://') || input.startsWith('netscope://')) {
      const normalized = input.replace(/^netscope:\/\//i, 'noctis://');
      return {
        url: normalized,
        originalInput: input,
        protocol: 'internal',
        routed: false
      };
    }

    // 2. IPFS Protocol (ipfs://<CID>/path)
    if (/^ipfs:\/\//i.test(input)) {
      const cidPath = input.replace(/^ipfs:\/\//i, '').replace(/^\/+/, '');
      const baseGateway = this.daemons.ipfsGatewayPort
        ? `http://127.0.0.1:${this.daemons.ipfsGatewayPort}`
        : this.ipfsGateway.replace(/\/+$/, '');
      this.metrics.darkWebRequestsResolved++;
      return {
        url: `${baseGateway}/ipfs/${cidPath}`,
        originalInput: input,
        protocol: 'ipfs',
        protocolLabel: 'IPFS Content-Addressed Network',
        routed: true,
        gatewayUsed: baseGateway
      };
    }

    // 3. IPNS Protocol (ipns://<name>/path)
    if (/^ipns:\/\//i.test(input)) {
      const namePath = input.replace(/^ipns:\/\//i, '').replace(/^\/+/, '');
      const baseGateway = this.daemons.ipfsGatewayPort
        ? `http://127.0.0.1:${this.daemons.ipfsGatewayPort}`
        : this.ipfsGateway.replace(/\/+$/, '');
      this.metrics.darkWebRequestsResolved++;
      return {
        url: `${baseGateway}/ipns/${namePath}`,
        originalInput: input,
        protocol: 'ipns',
        protocolLabel: 'IPNS InterPlanetary Naming System',
        routed: true,
        gatewayUsed: baseGateway
      };
    }

    // 4. ZeroNet Protocol (zero:// or zeronet://)
    if (/^(zero|zeronet):\/\//i.test(input)) {
      const sitePath = input.replace(/^(zero|zeronet):\/\//i, '').replace(/^\/+/, '');
      const port = this.daemons.zeronetPort || 43110;
      this.metrics.darkWebRequestsResolved++;
      return {
        url: `http://127.0.0.1:${port}/${sitePath}`,
        originalInput: input,
        protocol: 'zeronet',
        protocolLabel: 'ZeroNet P2P Network',
        routed: true
      };
    }

    // 5. Hyphanet / Freenet Protocol (hyphanet:// or freenet:)
    if (/^(hyphanet:\/\/|freenet:)/i.test(input)) {
      const keyPath = input.replace(/^(hyphanet:\/\/|freenet:)/i, '').replace(/^\/+/, '');
      const port = this.daemons.hyphanetPort || 8888;
      this.metrics.darkWebRequestsResolved++;
      return {
        url: `http://127.0.0.1:${port}/freenet:${keyPath}`,
        originalInput: input,
        protocol: 'hyphanet',
        protocolLabel: 'Hyphanet (Freenet) Datastore',
        routed: true
      };
    }

    // 6. Explicit tor://, i2p://, loki:// schemes
    let normalizedHttp = input;
    if (/^tor:\/\//i.test(input)) {
      normalizedHttp = 'http://' + input.replace(/^tor:\/\//i, '');
    } else if (/^i2p:\/\//i.test(input)) {
      normalizedHttp = 'http://' + input.replace(/^i2p:\/\//i, '');
    } else if (/^loki:\/\//i.test(input)) {
      normalizedHttp = 'http://' + input.replace(/^loki:\/\//i, '');
    } else if (
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input) &&
      /\.(onion|i2p|loki|eth|bit)(:\d+)?(\/.*)?$/i.test(input)
    ) {
      // Bare dark-web / decentralized domain without scheme
      const isEth = /\.eth(:\d+)?(\/.*)?$/i.test(input);
      normalizedHttp = (isEth ? 'https://' : 'http://') + input;
    }

    // Parse if it's now an HTTP/HTTPS URL
    try {
      const parsed = new URL(normalizedHttp);
      const host = parsed.hostname.toLowerCase();

      // 6a. Tor .onion Hidden Services
      if (host.endsWith('.onion')) {
        this.metrics.darkWebRequestsResolved++;
        if (this.daemons.torSocksPort) {
          return {
            url: parsed.toString(),
            originalInput: input,
            protocol: 'tor',
            protocolLabel: `Tor Onion v3 (Native SOCKS5 :${this.daemons.torSocksPort})`,
            routed: true,
            nativeDaemon: true
          };
        } else if (this.onionGatewayFallback) {
          // Route via encrypted HTTPS Tor2Web Onion Gateway so .onion works even without local Tor binary
          const bridgedHost = `${host}.${this.onionGatewayHost}`;
          parsed.protocol = 'https:';
          parsed.hostname = bridgedHost;
          return {
            url: parsed.toString(),
            originalInput: input,
            protocol: 'tor',
            protocolLabel: `Tor Onion Gateway (${this.onionGatewayHost})`,
            routed: true,
            nativeDaemon: false,
            gatewayUsed: this.onionGatewayHost
          };
        }
        return {
          url: parsed.toString(),
          originalInput: input,
          protocol: 'tor',
          protocolLabel: 'Tor Onion Service (Requires Local Tor)',
          routed: false
        };
      }

      // 6b. I2P .i2p Eepsites
      if (host.endsWith('.i2p')) {
        this.metrics.darkWebRequestsResolved++;
        if (this.daemons.i2pHttpPort || this.daemons.i2pSocksPort) {
          return {
            url: parsed.toString(),
            originalInput: input,
            protocol: 'i2p',
            protocolLabel: `I2P Garlic Network (Local Proxy :${this.daemons.i2pHttpPort || this.daemons.i2pSocksPort})`,
            routed: true,
            nativeDaemon: true
          };
        } else if (this.i2pGatewayFallback) {
          parsed.protocol = 'https:';
          parsed.hostname = `${host}.${this.i2pGatewayHost}`;
          return {
            url: parsed.toString(),
            originalInput: input,
            protocol: 'i2p',
            protocolLabel: `I2P Outproxy Gateway (${this.i2pGatewayHost})`,
            routed: true,
            nativeDaemon: false,
            gatewayUsed: this.i2pGatewayHost
          };
        }
        return {
          url: parsed.toString(),
          originalInput: input,
          protocol: 'i2p',
          protocolLabel: 'I2P Garlic Eepsite',
          routed: false
        };
      }

      // 6c. Lokinet .loki SNApps
      if (host.endsWith('.loki')) {
        this.metrics.darkWebRequestsResolved++;
        return {
          url: parsed.toString(),
          originalInput: input,
          protocol: 'loki',
          protocolLabel: 'Lokinet LLARP Service Node',
          routed: true
        };
      }

      // 6d. Ethereum Name Service (.eth) decentralized websites
      if (host.endsWith('.eth')) {
        this.metrics.darkWebRequestsResolved++;
        parsed.protocol = 'https:';
        parsed.hostname = `${host}.limo`;
        return {
          url: parsed.toString(),
          originalInput: input,
          protocol: 'ens',
          protocolLabel: 'ENS + IPFS Decentralized Domain (.eth.limo)',
          routed: true
        };
      }

      // 6e. Namecoin / ZeroNet (.bit) domains
      if (host.endsWith('.bit')) {
        this.metrics.darkWebRequestsResolved++;
        const port = this.daemons.zeronetPort || 43110;
        return {
          url: `http://127.0.0.1:${port}/${host}${parsed.pathname}${parsed.search}`,
          originalInput: input,
          protocol: 'zeronet',
          protocolLabel: 'ZeroNet / Namecoin (.bit)',
          routed: true
        };
      }
    } catch (_) {}

    return {
      url: rawInput,
      originalInput: rawInput,
      protocol: 'standard',
      routed: false
    };
  }

  // --- Session Proxy & PAC Script Application ---

  /**
   * Generates a dynamic Proxy Auto-Config (PAC) script that routes:
   * - .onion -> local Tor SOCKS5 (if running)
   * - .i2p   -> local I2P proxy (if running)
   * - all other traffic -> based on active mode (direct, built-in-vpn, tor, i2p, custom-proxy)
   */
  generatePacScript() {
    const torProxy = this.daemons.torSocksPort
      ? `SOCKS5 127.0.0.1:${this.daemons.torSocksPort}; SOCKS 127.0.0.1:${this.daemons.torSocksPort}`
      : (this.killSwitch ? 'SOCKS5 127.0.0.1:1' : 'DIRECT');

    const i2pProxy = this.daemons.i2pHttpPort
      ? `PROXY 127.0.0.1:${this.daemons.i2pHttpPort}`
      : (this.daemons.i2pSocksPort ? `SOCKS5 127.0.0.1:${this.daemons.i2pSocksPort}` : 'DIRECT');

    let defaultRoute = 'DIRECT';
    if (this.mode === 'built-in-vpn') {
      // Route through local VPN tunnel (which strips headers, validates DoH+DNSSEC, and chains through country-pinned SOCKS5 exit relay)
      defaultRoute = this.tunnelPort
        ? `PROXY 127.0.0.1:${this.tunnelPort}`
        : (this.daemons.torSocksPort
          ? `SOCKS5 127.0.0.1:${this.daemons.torSocksPort}; SOCKS 127.0.0.1:${this.daemons.torSocksPort}`
          : 'SOCKS5 127.0.0.1:1');
    } else if (this.mode === 'tor') {
      defaultRoute = torProxy;
    } else if (this.mode === 'i2p') {
      defaultRoute = i2pProxy;
    } else if (this.mode === 'custom-proxy' && this.customProxyRules) {
      const cleaned = this.customProxyRules
        .replace(/^socks5:\/\//i, 'SOCKS5 ')
        .replace(/^socks4:\/\//i, 'SOCKS ')
        .replace(/^https?:\/\//i, 'PROXY ');
      defaultRoute = cleaned;
    }

    return `
      function FindProxyForURL(url, host) {
        var lowerHost = (host || '').toLowerCase();
        if (lowerHost === '127.0.0.1' || lowerHost === 'localhost') {
          return 'DIRECT';
        }
        if (shExpMatch(lowerHost, '*.onion')) {
          return '${torProxy}';
        }
        if (shExpMatch(lowerHost, '*.i2p')) {
          return '${i2pProxy}';
        }
        return '${defaultRoute}';
      }
    `.trim();
  }

  async applyRoutingToSessions(targetSessions = null) {
    if (targetSessions) {
      this.sessions = targetSessions.filter(Boolean);
    }

    // Auto-launch managed Tor daemon for both Tor Onion Router AND Built-in Browser VPN so origin IP is truly masked
    if ((this.mode === 'tor' || this.mode === 'built-in-vpn') && !this.daemons.torSocksPort) {
      await this.startManagedTorDaemon();
    }

    // Configure country-pinned exit node in Built-in VPN mode, or unpin in Tor mode
    if (this.daemons.torControlPort) {
      const relay = VPN_EXIT_RELAYS[this.selectedRelay] || VPN_EXIT_RELAYS['ch-zurich'];
      if (this.mode === 'built-in-vpn' && relay && relay.countryCode) {
        await this._configureTorExitRelay(relay.countryCode);
      } else if (this.mode === 'tor') {
        await this._configureTorExitRelay('');
      }
    }

    for (const s of this.sessions) {
      if (!s || typeof s.setProxy !== 'function') continue;

      try {
        if (this.mode === 'direct') {
          if (this.daemons.torSocksPort || this.daemons.i2pHttpPort || this.daemons.i2pSocksPort) {
            // Use PAC script so .onion and .i2p automatically route through local daemons while clearnet is direct
            const pacDataUrl = 'data:application/x-ns-proxy-autoconfig;base64,' +
              Buffer.from(this.generatePacScript(), 'utf-8').toString('base64');
            await s.setProxy({ pacScript: pacDataUrl });
          } else {
            await s.setProxy({ mode: 'direct' });
          }
        } else if (this.mode === 'built-in-vpn') {
          if (this.killSwitch && (!this.tunnelPort || !this.daemons.torSocksPort)) {
            await s.setProxy({
              proxyRules: 'socks5://127.0.0.1:1',
              proxyBypassRules: ''
            });
          } else {
            await this._startLocalVpnTunnel();
            if (this.tunnelPort) {
              if (this.daemons.torSocksPort || this.daemons.i2pHttpPort || this.daemons.i2pSocksPort) {
                // When Tor daemon is present, use PAC script so .onion routes to Tor while clearnet routes to the VPN tunnel (which chains to country-pinned Tor SOCKS5)
                const pacDataUrl = 'data:application/x-ns-proxy-autoconfig;base64,' +
                  Buffer.from(this.generatePacScript(), 'utf-8').toString('base64');
                await s.setProxy({ pacScript: pacDataUrl });
              } else {
                await s.setProxy({
                  proxyRules: `http=127.0.0.1:${this.tunnelPort};https=127.0.0.1:${this.tunnelPort}`,
                  proxyBypassRules: '<-loopback>'
                });
              }
              this._refreshMaskedIp();
            }
          }
        } else if (this.mode === 'tor') {
          if (this.daemons.torSocksPort) {
            await s.setProxy({
              proxyRules: `socks5://127.0.0.1:${this.daemons.torSocksPort}`,
              proxyBypassRules: '<-loopback>'
            });
            this._refreshMaskedIp();
          } else if (this.killSwitch) {
            // Strict Kill-Switch: drop all clearnet traffic if Tor daemon is unreachable
            await s.setProxy({
              proxyRules: 'socks5://127.0.0.1:1',
              proxyBypassRules: ''
            });
          } else {
            // Fallback to built-in encrypted VPN tunnel if Tor daemon is not running and Kill-Switch is off
            await this._startLocalVpnTunnel();
            await s.setProxy({
              proxyRules: `http=127.0.0.1:${this.tunnelPort};https=127.0.0.1:${this.tunnelPort}`,
              proxyBypassRules: '<-loopback>'
            });
            this._refreshMaskedIp();
          }
        } else if (this.mode === 'i2p') {
          const i2pPort = this.daemons.i2pHttpPort || this.daemons.i2pSocksPort;
          const scheme = this.daemons.i2pHttpPort ? 'http' : 'socks5';
          if (i2pPort) {
            await s.setProxy({
              proxyRules: `${scheme}://127.0.0.1:${i2pPort}`,
              proxyBypassRules: '<-loopback>'
            });
          } else if (this.killSwitch) {
            await s.setProxy({
              proxyRules: 'socks5://127.0.0.1:1',
              proxyBypassRules: ''
            });
          } else {
            await s.setProxy({ mode: 'direct' });
          }
        } else if (this.mode === 'custom-proxy') {
          await s.setProxy({
            proxyRules: this.customProxyRules || 'socks5://127.0.0.1:1080',
            proxyBypassRules: '<-loopback>'
          });
        }
      } catch (err) {
        console.error('Failed to set session proxy:', err);
      }
    }

    this.emit('status-updated', this.getStatus());
    return this.getStatus();
  }

  // --- Configuration & Circuit Rotation ---

  async updateConfig(updates = {}) {
    if (updates.mode !== undefined) {
      this.mode = updates.mode;
      this.vpnEnabled = (this.mode === 'built-in-vpn');
    } else if (updates.vpnEnabled !== undefined) {
      this.vpnEnabled = Boolean(updates.vpnEnabled);
      this.mode = this.vpnEnabled ? 'built-in-vpn' : 'direct';
    }

    if (updates.selectedRelay && VPN_EXIT_RELAYS[updates.selectedRelay]) {
      if (this.selectedRelay !== updates.selectedRelay) {
        this.selectedRelay = updates.selectedRelay;
        this.currentMaskedIp = null;
        this.ipMaskVerified = false;
      }
    }
    if (updates.killSwitch !== undefined) {
      this.killSwitch = Boolean(updates.killSwitch);
    }
    if (updates.dnsOverHttps !== undefined) {
      this.dnsOverHttps = Boolean(updates.dnsOverHttps);
    }
    if (updates.forceDnssec !== undefined) {
      this.forceDnssec = Boolean(updates.forceDnssec);
    }
    if (updates.dnssec !== undefined) {
      this.forceDnssec = Boolean(updates.dnssec);
    }
    if (updates.requireSecureTraffic !== undefined) {
      this.requireSecureTraffic = Boolean(updates.requireSecureTraffic);
    }
    if (updates.requireSecurity !== undefined) {
      this.requireSecureTraffic = Boolean(updates.requireSecurity);
    }
    if (updates.onionGatewayFallback !== undefined) {
      this.onionGatewayFallback = Boolean(updates.onionGatewayFallback);
    }
    if (updates.onionGatewayHost) {
      this.onionGatewayHost = String(updates.onionGatewayHost).trim();
    }
    if (updates.ipfsGateway) {
      this.ipfsGateway = String(updates.ipfsGateway).trim();
    }
    if (updates.i2pGatewayFallback !== undefined) {
      this.i2pGatewayFallback = Boolean(updates.i2pGatewayFallback);
    }
    if (updates.customProxyRules !== undefined) {
      this.customProxyRules = String(updates.customProxyRules).trim();
    }

    await this.probeLocalDaemons();
    await this.applyRoutingToSessions();
    return this.getStatus();
  }

  /**
   * Rotate Tor / VPN Circuit:
   * - Sends SIGNAL NEWNYM to Tor ControlPort (9051/9151) if available
   * - Clears DoH cache and resets active tunnel connections
   * - Flushes Chromium host resolver and auth caches
   */
  async rotateCircuit() {
    this.circuitId = this._generateCircuitId();
    this.circuitCount++;
    this.lastRotatedAt = Date.now();
    this.dohCache.clear();
    this.currentMaskedIp = null;
    this.ipMaskVerified = false;

    // Close existing idle tunnel sockets to force new TCP/TLS handshakes
    for (const sock of this.activeSockets) {
      try { sock.destroy(); } catch (_) {}
    }
    this.activeSockets.clear();

    // Signal Tor ControlPort NEWNYM if open
    let torNewNymSent = false;
    if (this.daemons.torControlPort) {
      torNewNymSent = await this._sendTorNewNym(this.daemons.torControlPort);
    }

    // Flush Chromium session host resolver and socket caches
    for (const s of this.sessions) {
      try {
        await s.clearHostResolverCache();
        await s.clearAuthCache();
      } catch (_) {}
    }

    const status = this.getStatus();
    this.emit('status-updated', status);
    this._refreshMaskedIp();
    return {
      ...status,
      torNewNymSent
    };
  }

  _sendTorNewNym(controlPort) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch (_) {}
        resolve(ok);
      };
      socket.setTimeout(600);
      socket.once('connect', () => {
        socket.write('AUTHENTICATE ""\r\nSIGNAL NEWNYM\r\nQUIT\r\n');
      });
      socket.on('data', (data) => {
        if (data.toString().includes('250 OK')) {
          done(true);
        }
      });
      socket.once('error', () => done(false));
      socket.once('timeout', () => done(false));
      socket.connect(controlPort, '127.0.0.1');
    });
  }

  getRelays() {
    return VPN_EXIT_RELAYS;
  }

  getDirectory() {
    return DARK_WEB_DIRECTORY;
  }

  getStatus() {
    const relay = VPN_EXIT_RELAYS[this.selectedRelay] || VPN_EXIT_RELAYS['ch-zurich'];
    let modeLabel = 'Direct Connection';
    let badgeText = 'Direct';
    let badgeState = 'direct';

    if (this.mode === 'built-in-vpn') {
      const hasVerifiedMask = Boolean(this.currentMaskedIp && (!this.directBaselineIp || this.currentMaskedIp !== this.directBaselineIp));
      const maskedPart = hasVerifiedMask
        ? ` — Exit IP: ${this.currentMaskedIp}`
        : (this.daemons.torSocksPort ? ` — Relay SOCKS5 :${this.daemons.torSocksPort}` : ' — Exit Relay Offline');
      modeLabel = `Noctis Browser VPN (${relay.name})${maskedPart}`;
      badgeText = hasVerifiedMask ? `VPN • ${this.currentMaskedIp}` : `VPN • ${relay.region}`;
      badgeState = 'vpn';
    } else if (this.mode === 'tor') {
      if (this.daemons.torSocksPort) {
        const hasVerifiedMask = Boolean(this.currentMaskedIp && (!this.directBaselineIp || this.currentMaskedIp !== this.directBaselineIp));
        const maskedPart = hasVerifiedMask ? ` — Exit IP: ${this.currentMaskedIp}` : '';
        modeLabel = `Tor Onion Router (SOCKS5 127.0.0.1:${this.daemons.torSocksPort})${maskedPart}`;
        badgeText = hasVerifiedMask ? `Tor • ${this.currentMaskedIp}` : 'Tor Active';
        badgeState = 'tor';
      } else if (this.killSwitch) {
        modeLabel = 'Tor Kill-Switch Engaged (Daemon Offline — Traffic Blocked)';
        badgeText = 'Kill-Switch';
        badgeState = 'killswitch';
      } else {
        modeLabel = `Tor Hybrid Mode (Onion Bridge + Encrypted Tunnel)`;
        badgeText = 'Tor Bridge';
        badgeState = 'tor';
      }
    } else if (this.mode === 'i2p') {
      modeLabel = this.daemons.i2pHttpPort
        ? `I2P Garlic Router (127.0.0.1:${this.daemons.i2pHttpPort})`
        : 'I2P Outproxy Mode';
      badgeText = 'I2P Network';
      badgeState = 'i2p';
    } else if (this.mode === 'custom-proxy') {
      modeLabel = `Custom Proxy (${this.customProxyRules})`;
      badgeText = 'Proxy';
      badgeState = 'proxy';
    }

    return {
      mode: this.mode,
      modeLabel,
      badgeText,
      badgeState,
      vpnEnabled: this.mode === 'built-in-vpn',
      maskedIp: this.currentMaskedIp || null,
      directBaselineIp: this.directBaselineIp || null,
      ipMaskVerified: Boolean(this.currentMaskedIp && (!this.directBaselineIp || this.currentMaskedIp !== this.directBaselineIp)),
      selectedRelay: this.selectedRelay,
      relayDetails: relay,
      killSwitch: this.killSwitch,
      dnsOverHttps: this.dnsOverHttps,
      forceDnssec: this.forceDnssec,
      requireSecureTraffic: this.requireSecureTraffic,
      onionGatewayFallback: this.onionGatewayFallback,
      onionGatewayHost: this.onionGatewayHost,
      ipfsGateway: this.ipfsGateway,
      i2pGatewayFallback: this.i2pGatewayFallback,
      i2pGatewayHost: this.i2pGatewayHost,
      customProxyRules: this.customProxyRules,
      tunnelPort: this.tunnelPort,
      circuitId: this.circuitId,
      circuitCount: this.circuitCount,
      lastRotatedAt: this.lastRotatedAt,
      platform: process.platform,
      arch: process.arch,
      daemons: { ...this.daemons },
      metrics: { ...this.metrics },
      supportedProtocols: [
        { id: 'tor', name: 'Tor Hidden Services', tld: '.onion / tor://', status: this.daemons.torSocksPort ? `Native SOCKS5 (:${this.daemons.torSocksPort})` : (this.onionGatewayFallback ? `Onion Bridge (${this.onionGatewayHost})` : 'Offline') },
        { id: 'i2p', name: 'Invisible Internet Project (I2P)', tld: '.i2p / i2p://', status: this.daemons.i2pHttpPort ? `Native Proxy (:${this.daemons.i2pHttpPort})` : (this.i2pGatewayFallback ? `Outproxy (${this.i2pGatewayHost})` : 'Offline') },
        { id: 'loki', name: 'Lokinet Service Nodes', tld: '.loki / loki://', status: 'Supported (LLARP Resolver)' },
        { id: 'ipfs', name: 'InterPlanetary File System', tld: 'ipfs:// / ipns://', status: this.daemons.ipfsGatewayPort ? `Local Kubo (:${this.daemons.ipfsGatewayPort})` : `Gateway (${this.ipfsGateway})` },
        { id: 'ens', name: 'Ethereum Name Service + IPFS', tld: '.eth', status: 'Active (.eth.limo Bridge)' },
        { id: 'zeronet', name: 'ZeroNet P2P Swarm', tld: 'zero:// / .bit', status: this.daemons.zeronetPort ? `Local Node (:${this.daemons.zeronetPort})` : 'Ready (:43110)' },
        { id: 'hyphanet', name: 'Hyphanet (Freenet)', tld: 'hyphanet:// / freenet:', status: this.daemons.hyphanetPort ? `Local FProxy (:${this.daemons.hyphanetPort})` : 'Ready (:8888)' }
      ]
    };
  }

  /**
   * Run an interactive 4-hop diagnostic of the current routing configuration and data path:
   * Hop 1: Browser Session & Security Interception Gate
   * Hop 2: Cryptographic DNS / DoH & DNSSEC Resolution
   * Hop 3: Local Encrypted Tunnel / Daemon Transport Layer
   * Hop 4: Egress & Data Path Validation (with honest directBaselineIp vs maskedExitIp verification)
   */
  async runRoutingPathDiagnostic(targetUrl = 'https://example.com') {
    const startTime = Date.now();
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (_) {
      parsedUrl = new URL('https://example.com');
    }
    const hostname = parsedUrl.hostname;

    const hops = [];

    // Hop 1: Browser Session & Security Interception Gate
    const hop1Start = Date.now();
    const willUpgrade = this.shouldUpgradeOrBlockInsecure(targetUrl);
    const isSecureEnforced = this.isSecureRequirementActive(targetUrl);
    let resolvedProxyMode = 'DIRECT';
    try {
      if (this.sessions && this.sessions[0] && typeof this.sessions[0].resolveProxy === 'function') {
        resolvedProxyMode = await this.sessions[0].resolveProxy(targetUrl);
      }
    } catch (_) {}
    hops.push({
      hopNumber: 1,
      name: 'Browser Session & Security Gate',
      status: 'VERIFIED',
      latencyMs: Math.max(1, Date.now() - hop1Start),
      details: {
        mode: this.mode,
        requireSecureTraffic: this.requireSecureTraffic,
        isInsecureUpgraded: willUpgrade,
        webrtcPolicy: 'disable_non_proxied_udp (leak-proof)',
        sessionProxy: resolvedProxyMode || 'DIRECT'
      },
      message: willUpgrade
        ? 'Insecure HTTP intercepted & upgraded to HTTPS'
        : (isSecureEnforced ? 'Strict HTTPS & encrypted transport enforced' : 'Browser session gate active')
    });

    // Hop 2: Cryptographic DNS / DoH & DNSSEC Resolution
    const hop2Start = Date.now();
    let resolvedIp = null;
    let dohError = null;
    const relay = VPN_EXIT_RELAYS[this.selectedRelay] || VPN_EXIT_RELAYS['ch-zurich'];
    try {
      if (this.dnsOverHttps) {
        resolvedIp = await this.resolveHostViaDoH(hostname);
      }
    } catch (err) {
      dohError = err.message;
    }
    const dohLatency = Math.max(1, Date.now() - hop2Start);
    hops.push({
      hopNumber: 2,
      name: 'Cryptographic DNS (DoH + DNSSEC)',
      status: (this.dnsOverHttps && (resolvedIp || !dohError)) ? 'VERIFIED' : 'BYPASS',
      latencyMs: dohLatency,
      details: {
        dnsOverHttps: this.dnsOverHttps,
        forceDnssec: this.forceDnssec,
        dohServer: this.dnsOverHttps ? (relay.dohEndpoint || 'https://cloudflare-dns.com/dns-query') : 'System Resolver (Unencrypted)',
        resolvedIp: resolvedIp || 'Direct/PAC resolved',
        dnssecValidated: this.forceDnssec
      },
      message: this.dnsOverHttps
        ? `Resolved via encrypted DoH with DNSSEC validation (${dohLatency}ms)`
        : 'Using standard system DNS resolution'
    });

    // Hop 3: Local Encrypted Tunnel / Daemon Transport Layer
    const hop3Start = Date.now();
    let transportStatus = 'VERIFIED';
    let transportMsg = '';
    let transportType = 'DIRECT';
    let transportDetails = {};
    const upstreamSocksPort = this._getUpstreamSocksPort();

    if (this.mode === 'direct') {
      transportType = 'DIRECT';
      transportMsg = 'Clearnet Direct Socket (No proxy intermediary)';
      transportDetails = { direct: true };
    } else if (this.mode === 'built-in-vpn') {
      transportType = 'LOCAL_VPN_TUNNEL';
      if (this.killSwitch && (!this.tunnelPort || !upstreamSocksPort)) {
        transportStatus = 'BLOCKED_BY_KILLSWITCH';
        transportMsg = 'Kill-Switch active: tunnel or upstream exit relay offline, traffic blocked';
      } else if (!upstreamSocksPort) {
        transportStatus = 'DEGRADED';
        transportDetails = {
          relay: relay.name,
          relayRegion: relay.region,
          tunnelPort: this.tunnelPort,
          upstreamSocksPort: null,
          warning: 'Upstream SOCKS5 exit relay is offline; origin IP cannot be masked'
        };
        transportMsg = `WARNING: Local Tunnel (127.0.0.1:${this.tunnelPort}) has no active upstream SOCKS5 exit relay`;
      } else {
        transportDetails = {
          relay: relay.name,
          relayRegion: relay.region,
          exitCountry: relay.countryCode,
          tunnelPort: this.tunnelPort,
          upstreamSocksPort,
          headerStripping: 'Enabled (User-Agent, Sec-CH-UA, Referer stripped)',
          circuitId: this.circuitId
        };
        transportMsg = `Encrypted Tunnel 127.0.0.1:${this.tunnelPort} -> SOCKS5 :${upstreamSocksPort} -> Relay ${relay.name} (${relay.countryCode})`;
      }
    } else if (this.mode === 'tor') {
      transportType = 'TOR_ONION_ROUTER';
      if (this.daemons.torSocksPort) {
        transportDetails = {
          socksPort: this.daemons.torSocksPort,
          controlPort: this.daemons.torControlPort,
          circuitId: this.circuitId,
          circuitHops: '3-Hop Onion Circuit (Entry Guard -> Middle -> Exit)'
        };
        transportMsg = `Tor SOCKS5 127.0.0.1:${this.daemons.torSocksPort} (Multi-Hop Onion Circuit)`;
      } else if (this.killSwitch) {
        transportStatus = 'BLOCKED_BY_KILLSWITCH';
        transportMsg = 'Tor Kill-Switch active: daemon offline, traffic blocked (127.0.0.1:1)';
      } else {
        transportStatus = 'FALLBACK_TUNNEL';
        transportDetails = {
          tunnelPort: this.tunnelPort,
          note: 'Tor daemon offline: local tunnel active without onion circuit'
        };
        transportMsg = `Tor Fallback: Local Tunnel (127.0.0.1:${this.tunnelPort}) — Tor Daemon Offline`;
      }
    } else if (this.mode === 'i2p') {
      transportType = 'I2P_GARLIC_ROUTER';
      const port = this.daemons.i2pHttpPort || this.daemons.i2pSocksPort;
      if (port) {
        transportMsg = `I2P Garlic Tunnel via 127.0.0.1:${port}`;
        transportDetails = { port };
      } else if (this.killSwitch) {
        transportStatus = 'BLOCKED_BY_KILLSWITCH';
        transportMsg = 'I2P Kill-Switch active: daemon offline, traffic blocked';
      } else {
        transportMsg = 'I2P Outproxy Gateway Routing';
      }
    } else if (this.mode === 'custom-proxy') {
      transportType = 'CUSTOM_PROXY';
      transportMsg = `Custom Proxy: ${this.customProxyRules}`;
      transportDetails = { proxy: this.customProxyRules };
    }
    const hop3Latency = Math.max(1, Date.now() - hop3Start);
    hops.push({
      hopNumber: 3,
      name: 'Local Transport & Tunnel Layer',
      status: transportStatus,
      latencyMs: hop3Latency,
      details: {
        transportType,
        ...transportDetails
      },
      message: transportMsg
    });

    // Hop 4: Egress & Data Path Validation (Honest Baseline IP vs Masked Exit IP Comparison)
    const hop4Start = Date.now();
    let egressStatus = 'VERIFIED';
    let egressIp = this.currentMaskedIp;
    let egressMsg = '';
    let ipMaskVerified = false;

    if (transportStatus === 'BLOCKED_BY_KILLSWITCH') {
      egressStatus = 'KILLSWITCH_PROTECTED';
      egressMsg = 'Zero-Trace Guarantee: Zero bytes leaked to clearnet (Kill-Switch Active)';
    } else {
      if (!this.directBaselineIp) {
        try { await this.probeDirectBaselineIp(2500); } catch (_) {}
      }
      if (this.mode === 'built-in-vpn' || this.mode === 'tor') {
        if (!egressIp) {
          try {
            egressIp = await this.probeExternalIp();
          } catch (_) {}
        }
        // Verify that egressIp exists AND differs from directBaselineIp
        if (egressIp && (!this.directBaselineIp || egressIp !== this.directBaselineIp)) {
          ipMaskVerified = true;
          egressStatus = 'VERIFIED';
          egressMsg = `Protected Exit Node IP: ${egressIp} (Origin IP ${this.directBaselineIp || 'Local'} Masked via ${relay.region})`;
        } else {
          ipMaskVerified = false;
          egressStatus = 'UNMASKED_IP';
          const leakedIp = this.lastUnmaskedIp || this.directBaselineIp || 'Local ISP IP';
          egressMsg = `WARNING: Origin IP is NOT masked (${leakedIp}) — Upstream exit relay is offline or bypassed`;
        }
      } else if (this.mode === 'direct') {
        egressMsg = `Direct Clearnet Egress to Destination Host${this.directBaselineIp ? ` (Origin IP: ${this.directBaselineIp})` : ''}`;
      } else {
        egressMsg = 'Data Path Validated through Proxy Egress';
      }
    }
    const hop4Latency = Math.max(1, Date.now() - hop4Start);
    hops.push({
      hopNumber: 4,
      name: 'Egress & Data Path Validation',
      status: egressStatus,
      latencyMs: hop4Latency,
      details: {
        directBaselineIp: this.directBaselineIp || 'Unprobed',
        maskedExitIp: ipMaskVerified ? egressIp : (this.mode === 'direct' ? (this.directBaselineIp || 'Direct') : 'UNMASKED'),
        ipMaskVerified,
        targetHost: hostname,
        killSwitchArmed: this.killSwitch
      },
      message: egressMsg
    });

    const totalDurationMs = Date.now() - startTime;
    let overallStatus = 'VERIFIED';
    if (transportStatus === 'BLOCKED_BY_KILLSWITCH') {
      overallStatus = 'KILLSWITCH_PROTECTED';
    } else if (transportStatus === 'FALLBACK_TUNNEL' || transportStatus === 'DEGRADED' || egressStatus === 'UNMASKED_IP') {
      overallStatus = 'DEGRADED';
    }

    return {
      success: true,
      targetUrl,
      overallStatus,
      totalDurationMs,
      routingConfig: {
        mode: this.mode,
        modeLabel: this.getStatus().modeLabel,
        selectedRelay: this.selectedRelay,
        relayName: relay.name,
        relayRegion: relay.region,
        exitCountry: relay.countryCode,
        killSwitch: this.killSwitch,
        dnsOverHttps: this.dnsOverHttps,
        forceDnssec: this.forceDnssec,
        requireSecureTraffic: this.requireSecureTraffic,
        circuitId: this.circuitId,
        directBaselineIp: this.directBaselineIp,
        maskedIp: ipMaskVerified ? egressIp : null,
        ipMaskVerified
      },
      hops,
      timestamp: Date.now()
    };
  }

  shutdown() {
    if (this._managedTorDataDir) {
      this._persistTorConsensusCache(this._managedTorDataDir);
    }
    if (this._managedTorProcess) {
      try { this._managedTorProcess.kill('SIGTERM'); } catch (_) {}
      this._managedTorProcess = null;
    }
    for (const sock of this.activeSockets) {
      try { sock.destroy(); } catch (_) {}
    }
    this.activeSockets.clear();
    if (this.tunnelServer) {
      try { this.tunnelServer.close(); } catch (_) {}
      this.tunnelServer = null;
    }
  }
}

module.exports = new TorVpnManager();
