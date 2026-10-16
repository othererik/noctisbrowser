# NoctisBrowser

<p align="center">
  <img src="assets/icon.svg" alt="NoctisBrowser Logo" width="128" height="128" />
</p>

**NoctisBrowser** is a zero-trace, ephemeral privacy and dark-web browser built on Chromium/Electron with a live CDP Network Observability Cockpit, Paranoid Anti-Fingerprinting (inspired by *Umbra*, *Shadow*, *DarkBrowser*, *Tor Browser*, and *Mullvad Browser*), a built-in encrypted Browser VPN tunnel, and native/bridged support for **Tor (`.onion`)** and decentralized dark-web protocols.

---

## Key Capabilities

### 1. Paranoid Anti-Fingerprinting & Stealth Engine
- **Coherent OS & Hardware Persona Spoofing**: Synchronizes HTTP `User-Agent`, `Sec-CH-UA-*` Client Hints headers, `Navigator.prototype` (`userAgent`, `appVersion`, `platform`, `userAgentData`, `hardwareConcurrency`, `deviceMemory`), and WebGL unmasked GPU vendor/renderer across macOS Apple Silicon, Windows 11 NVIDIA RTX, and Linux AMD Radeon presets.
- **Dynamic Runtime Parameter Drift**: Continuously rotates cryptographic noise seeds and sub-audible audio harmonics during runtime to defeat cross-session correlation.
- **Viewport Letterboxing (200×100 Bucket Quantization)**: Standardizes `window.innerWidth`, `window.innerHeight`, and `visualViewport` dimensions to 200×100 pixel buckets to defeat screen-dimension and window-resize tracking.
- **WebGPU, Canvas, Font & Audio Perturbation**: Injects deterministic seed-driven micro-jitter into `CanvasRenderingContext2D`, `WebGLRenderingContext`, `AudioBuffer`, `OfflineAudioContext`, `measureText`, and `DOMRect` while masking `navigator.gpu` adapter descriptors.
- **Hardware Sensor, Gamepad, Storage Quota & Keyboard Shield**:
  - Standardizes `navigator.storage.estimate()` to a uniform `10.0 GB` quota to defeat incognito and disk-size fingerprinting.
  - Blocks `Accelerometer`, `Gyroscope`, `Magnetometer`, `AmbientLightSensor`, `DeviceOrientation`, `navigator.getGamepads()`, and `navigator.xr`.
  - Masks `navigator.keyboard.getLayoutMap()` to a standardized US-QWERTY layout and normalizes HDR / P3 wide-gamut `matchMedia` probes.
- **Shadow Mode (OS Screen-Capture Protection)**: Optional window compositor flag (`setContentProtection`) that blocks unauthorized third-party screen recording and screenshot telemetry.
- **Instant "Burn Identity" Panic Button**: One-click toolbar button that immediately purges all ephemeral caches/storage, rotates the fingerprint persona and noise seeds, rotates the active Tor/VPN circuit, clears network logs, and resets open tabs.

### 2. Tor (`.onion`) & Decentralized Dark Web Protocols
NoctisBrowser natively recognizes and routes 7 dark-web and decentralized protocols without ever leaking addresses to clearnet search engines:
- **Tor Hidden Services (`.onion`, `tor://`)**: Auto-detects local Tor SOCKS5 daemons (`127.0.0.1:9050` / `9150`), supports one-click managed Tor daemon bootstrapping, and provides an automatic HTTPS Onion Gateway Bridge (`onion.ly` / `tor2web.org`) when no local Tor binary is installed.
- **Invisible Internet Project (`.i2p`, `i2p://`)**: Routes eepsites via local I2P HTTP/SOCKS proxies (`127.0.0.1:4444` / `4447`) or configurable outproxy bridges.
- **Lokinet (`.loki`, `loki://`)**: Supports LLARP service node `.loki` SNApps.
- **IPFS & IPNS (`ipfs://`, `ipns://`)**: Resolves content-addressed CIDs via local Kubo daemon (`127.0.0.1:8080`) or privacy-preserving gateways (`https://dweb.link`).
- **Ethereum Name Service (`.eth`)**: Resolves decentralized `.eth` domains via `.eth.limo`.
- **ZeroNet (`zero://`, `.bit`)**: Routes peer-to-peer ZeroSites via local ZeroNet node (`127.0.0.1:43110`).
- **Hyphanet / Freenet (`hyphanet://`, `freenet:`)**: Routes freesites via local FProxy (`127.0.0.1:8888`).

### 3. Built-in Browser VPN & Encrypted DoH Tunnel
- **Self-Contained Encrypted Local Tunnel**: Includes an embedded HTTP/HTTPS `CONNECT` proxy server that resolves hostnames over **Encrypted DNS-over-HTTPS (DoH)** (Quad9 Switzerland, Mullvad Sweden, Cloudflare Iceland/US/DE) so local ISP DNS servers never see plaintext domain lookups.
- **Strict Network Kill-Switch**: Optional kill-switch that blocks all clearnet traffic (`SOCKS5 127.0.0.1:1`) if Tor or I2P daemon connectivity drops.
- **Circuit Rotation (`NEWNYM`)**: Flushes DoH caches, closes active tunnel sockets, clears Chromium host/auth caches, and sends `SIGNAL NEWNYM` to Tor ControlPort (`9051`/`9151`).

### 4. Zero-Trace Ephemeral Architecture & Transparent Storage Inspector
- Every launch creates an isolated session directory in OS temp (`/tmp/noctis-ephemeral-<timestamp>-<random>`) with Chromium disk caches disabled (`--disable-http-cache --disk-cache-size=0 --incognito`).
- The **Privacy Vault (`noctis://vault`)** provides a live file explorer showing every single ephemeral file in RAM/temp, categorized by Cookies, Local Storage, IndexedDB, and Config, with one-click purge and guaranteed background reaper cleanup on exit.

### 5. Real-Time CDP Network Cockpit & Monitor (`noctis://monitor`)
- Inspect live requests, group traffic by destination host or initiator script, pause/intercept requests with breakpoints, block ad/tracker hosts, opt-in to community blocklist feeds (Peter Lowe, StevenBlack, AdGuard DNS), and export standard HAR archives.

---

## Quick Start

```bash
# Launch NoctisBrowser
./start.sh
# or
npm start
```

## Running the Automated Verification Suite

All unit and headless E2E tests run automatically and exit cleanly without manual intervention:

```bash
npm test
```

## Packaging a Standalone macOS Application (`dist/NoctisBrowser.app`)

```bash
npm run build:icons
npm run package:mac
```
