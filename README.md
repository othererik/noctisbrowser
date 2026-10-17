# NoctisBrowser

<p align="center">
  <img src="assets/icon.svg" alt="NoctisBrowser Logo" width="128" height="128" />
</p>

<p align="center">
  <a href="https://github.com/othererik/noctisbrowser/actions/workflows/ci.yml"><img src="https://github.com/othererik/noctisbrowser/actions/workflows/ci.yml/badge.svg" alt="CI & Pull Request Gates" /></a>
</p>

**NoctisBrowser** is a cross-platform, zero-trace ephemeral privacy and dark-web browser built on Chromium/Electron (`v41+` / Chromium `146`). It features a live CDP Network Observability Cockpit, Paranoid Anti-Fingerprinting, a built-in country-pinned Browser VPN tunnel, and native zero-config support for **Tor (`.onion`)** and decentralized dark-web protocols across **macOS**, **Linux**, and **Windows**.

---

## Table of Contents
1. [Key Capabilities](#key-capabilities)
2. [Prerequisites & Quick Start](#prerequisites--quick-start)
3. [Building Zero-Admin Portable Distributions](#building-zero-admin-portable-distributions)
4. [Testing & Verification Guide](#testing--verification-guide)
5. [CI/CD & Pull Request Gates](#cicd--pull-request-gates)
6. [Repository Structure](#repository-structure)

---

## Key Capabilities

### 1. Paranoid Anti-Fingerprinting & Stealth Engine
- **Coherent OS & Hardware Persona Spoofing**: Synchronizes HTTP `User-Agent`, `Sec-CH-UA-*` Client Hints headers, `Navigator.prototype` (`userAgent`, `appVersion`, `platform`, `userAgentData`, `hardwareConcurrency`, `deviceMemory`), and WebGL unmasked GPU vendor/renderer across macOS Apple Silicon, Windows 11 NVIDIA RTX, and Linux AMD Radeon presets.
- **Dynamic Runtime Parameter Drift**: Continuously rotates cryptographic noise seeds and sub-audible audio harmonics during runtime to defeat cross-session correlation.
- **Viewport Letterboxing (`200×100` Bucket Quantization)**: Standardizes `window.innerWidth`, `window.innerHeight`, and `visualViewport` dimensions to `200×100` pixel buckets to defeat screen-dimension and window-resize tracking.
- **WebGPU, Canvas, Font & Audio Perturbation**: Injects deterministic seed-driven micro-jitter into `CanvasRenderingContext2D`, `WebGLRenderingContext`, `AudioBuffer`, `OfflineAudioContext`, `measureText`, and `DOMRect` while masking `navigator.gpu` adapter descriptors.
- **Hardware Sensor, Gamepad, Storage Quota & Keyboard Shield**:
  - Standardizes `navigator.storage.estimate()` to a uniform `10.0 GB` quota to defeat incognito and disk-size fingerprinting.
  - Blocks `Accelerometer`, `Gyroscope`, `Magnetometer`, `AmbientLightSensor`, `DeviceOrientation`, `navigator.getGamepads()`, and `navigator.xr`.
  - Masks `navigator.keyboard.getLayoutMap()` to a standardized US-QWERTY layout and normalizes HDR / P3 wide-gamut `matchMedia` probes.
- **Shadow Mode (OS Screen-Capture Protection)**: Optional window compositor flag (`setContentProtection`) that blocks unauthorized third-party screen recording and screenshot telemetry.
- **Instant "Burn Identity" Panic Button**: One-click toolbar button that immediately purges all ephemeral caches/storage, rotates the fingerprint persona and noise seeds, rotates the active Tor/VPN circuit, clears network logs, and resets open tabs.

### 2. Tor (`.onion`) & Decentralized Dark Web Protocols
NoctisBrowser natively recognizes and routes 7 dark-web and decentralized protocols without ever leaking addresses to clearnet search engines:
- **Tor Hidden Services (`.onion`, `tor://`)**: Uses bundled native Tor binaries (`bin/macos`, `bin/linux`, `bin/windows`) or auto-detects local Tor SOCKS5 daemons (`127.0.0.1:9050` / `9150`), and provides an optional HTTPS Onion Gateway Bridge (`onion.ly` / `tor2web.org`).
- **Invisible Internet Project (`.i2p`, `i2p://`)**: Routes eepsites via local I2P HTTP/SOCKS proxies (`127.0.0.1:4444` / `4447`) or configurable outproxy bridges.
- **Lokinet (`.loki`, `loki://`)**: Supports LLARP service node `.loki` SNApps.
- **IPFS & IPNS (`ipfs://`, `ipns://`)**: Resolves content-addressed CIDs via local Kubo daemon (`127.0.0.1:8080`) or privacy-preserving gateways (`https://dweb.link`).
- **Ethereum Name Service (`.eth`)**: Resolves decentralized `.eth` domains via `.eth.limo`.
- **ZeroNet (`zero://`, `.bit`)**: Routes peer-to-peer ZeroSites via local ZeroNet node (`127.0.0.1:43110`).
- **Hyphanet / Freenet (`hyphanet://`, `freenet:`)**: Routes freesites via local FProxy (`127.0.0.1:8888`).

### 3. Built-in Browser VPN, Country-Pinned Exit Relays & Honest Egress Verification
- **True Multi-Hop IP Masking (`SOCKS5` Exit Relay + Encrypted DoH/DNSSEC Tunnel)**: Chains the local header-stripping HTTP/HTTPS `CONNECT` tunnel (`127.0.0.1:<tunnelPort>`) through a managed user-space SOCKS5 exit relay with GeoIP country pinning (`{ch}` Switzerland, `{is}` Iceland, `{se}` Sweden, `{us}` United States, `{de}` Germany) so your public egress IP genuinely changes without requiring root/TUN kernel privileges.
- **Honest Baseline vs. Masked IP Verification**: Automatically measures your unproxied `directBaselineIp` and compares it against the tunnel's `maskedExitIp`. The 4-Hop Data Path Validator (`noctis://monitor`) only reports `VERIFIED` when `maskedExitIp !== directBaselineIp` and fails closed (`502` / `UNMASKED_IP` warning) if the upstream exit relay is offline.
- **Cross-Platform Bundled Daemon (`macOS`, `Linux`, `Windows`)**: Bundles native `aarch64` and `x86_64` macOS Mach-O binaries, Linux `x86_64` ELF binaries + shared libraries (`libevent-2.1.so.7`, `libssl.so.3`, `libcrypto.so.3`), Windows `x86_64` PE executable (`tor.exe`), and IPv4/IPv6 GeoIP databases (`bin/geoip/{geoip,geoip6}`) with automatic `LD_LIBRARY_PATH` / `DYLD_LIBRARY_PATH` / `PATH` resolution.
- **Strict Network Kill-Switch & Circuit Rotation (`NEWNYM`)**: Flushes DoH caches, closes active tunnel sockets, clears Chromium host/auth caches, and sends `SIGNAL NEWNYM` to Tor ControlPort (`9051`/`9251`).

### 4. Zero-Trace Ephemeral Architecture & Transparent Storage Inspector
- Every launch creates an isolated session directory in the OS temp directory (`os.tmpdir()`) with Chromium disk caches disabled (`--disable-http-cache --disk-cache-size=0 --incognito`).
- The **Privacy Vault (`noctis://vault`)** provides a live file explorer showing every single ephemeral file in temp storage, categorized by Cookies, Local Storage, IndexedDB, and Config, with one-click purge and guaranteed background reaper cleanup on exit.

### 5. Real-Time CDP Network Cockpit & Monitor (`noctis://monitor`)
- Inspect live requests, group traffic by destination host or initiator script, validate the live 4-hop routing path (`Run Live Routing Test`), pause/intercept requests with breakpoints, block ad/tracker hosts, opt-in to community blocklist feeds (Peter Lowe, StevenBlack, AdGuard DNS), and export standard HAR archives.

---

## Prerequisites & Quick Start

### Prerequisites
- **Node.js**: `v18+` or `v20+` (LTS recommended)
- **npm**: Included with Node.js
- **No administrator/root privileges or external Tor installation required** — native Tor binaries and GeoIP databases for macOS (`arm64`/`x64`), Linux (`x64`), and Windows (`x64`) are bundled inside `bin/`.

### Clone, Install & Run
```bash
# 1. Clone the repository
git clone https://github.com/othererik/noctisbrowser.git
cd noctisbrowser

# 2. Install dependencies
npm install

# 3. Start NoctisBrowser
npm start
# Or use the zero-admin POSIX launcher on macOS / Linux:
./start.sh
```

> **Note for Linux Users (Fedora, Ubuntu, Debian, Arch)**: NoctisBrowser automatically appends `--no-sandbox` and `--disable-setuid-sandbox` on Linux when running as a portable/user-space app so no `root`-owned `chrome-sandbox` SUID binary is needed.

---

## Building Zero-Admin Portable Distributions

You can generate self-contained, zero-admin portable folders in `dist/` that require **no installer and no admin/root privileges**:

```bash
# Optional: regenerate SVG/PNG/ICNS icons
npm run build:icons

# Build Zero-Admin Portable Bundles for macOS, Linux x64, and Windows x64
npm run dist:portable
```

### Generated Artifacts in `dist/`
| Platform | Output Directory | How to Run (Zero-Admin) |
| :--- | :--- | :--- |
| **macOS (`arm64` / `x64`)** | `dist/NoctisBrowser.app`<br>`dist/NoctisBrowser-macOS-Portable/` | Double-click `NoctisBrowser.app` or `Launch-NoctisBrowser.command` (automatically strips Gatekeeper quarantine in user-space) |
| **Linux (`x86_64`)** | `dist/NoctisBrowser-Linux-x64-Portable/` | Run `./launch-noctis-browser.sh` or open `NoctisBrowser.desktop` |
| **Windows (`x64`)** | `dist/NoctisBrowser-Windows-x64-Portable/` | Double-click `Launch-NoctisBrowser.bat` |

---

## Testing & Verification Guide

NoctisBrowser includes an automated verification suite covering unit logic, anti-fingerprinting coherence, adblock/feed rules, exhaustive network state combinations, cross-platform Tor/VPN IP masking, and headless Electron E2E browser tests.

### 1. Run Cross-Platform Unit & Routing Suite (Fast, No Display Required)
Runs on macOS, Linux, and Windows without requiring a GUI display server:
```bash
npm run test:unit
```
Included unit & routing verifications:
- `test/verify.js`: Core tab management, firewall rules, and HAR export.
- `test/verify_privacy.js`: Fingerprint profile generation, header sanitization, and URL tracker stripping.
- `test/verify_adblock_feed.js`: Built-in ad/tracker/feed rules and external hostlist parser.
- `test/verify_vault_and_fingerprint.js`: OS/GPU/Client-Hints coherence and runtime drift rotation.
- `test/verify_exhaustive_network_states.js`: Exhaustive matrix of `direct`, `built-in-vpn` (all 5 country relays), `tor`, Kill-Switch ON/OFF, DNSSEC ON/OFF, and Require-Secure ON/OFF, plus 4-hop Data Path Validator checks.
- `test/verify_cross_platform_vpn_and_portable.js`: Verifies macOS Mach-O, Linux ELF + `.so`, and Windows PE (`tor.exe`) binaries, GeoIP files, live `directBaselineIp !== maskedExitIp` VPN IP masking, and honest `UNMASKED_IP` / `DEGRADED` detection when upstream relays are offline.

### 2. Run Electron Headless E2E Browser Suite
Spawns headless Electron browser instances and guest `<webview>` sandboxes to verify DOM/Navigator spoofing, Viewport Letterboxing, Ephemeral session wiping, and Vault UI controls:
```bash
# On macOS or Windows (or Linux with a display server):
npm run test:e2e

# On headless Linux servers / CI runners using Xvfb:
xvfb-run --auto-servernum npm run test:e2e
```

### 3. Run the Full Combined Test Suite (`unit` + `e2e`)
```bash
npm test
```

---

## CI/CD & Pull Request Gates

GitHub Actions automatically runs on every push to `main`/`release/**` and acts as a **Pull Request Gate** via [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
1. **Cross-Platform Matrix Gate (`ubuntu-latest`, `macos-latest`, `windows-latest`)**:
   - Scans source, test, and build scripts to enforce **zero hardcoded personal or system paths**.
   - Runs `npm run test:unit` across Linux, macOS, and Windows runners.
   - Runs `npm run dist:portable` to verify portable bundle packaging on every OS.
2. **Electron Headless E2E Gate (`macos-latest`, `ubuntu-latest` with `xvfb-run`)**:
   - Runs `npm run test:e2e` to validate live Chromium guest webviews, anti-fingerprinting shields, and ephemeral session cleanup.

---

## Repository Structure

```text
noctisbrowser/
├── .github/workflows/ci.yml      # Multi-OS GitHub Actions CI & Pull Request Gates
├── assets/                       # Custom SVG, PNG, and macOS ICNS branding assets
├── bin/
│   ├── geoip/                    # Bundled IPv4 (geoip) & IPv6 (geoip6) databases
│   ├── linux/x86_64/             # Native Linux x86_64 Tor ELF binary + .so libraries
│   ├── macos/aarch64/            # Native macOS Apple Silicon Tor binary + libtor.dylib
│   ├── macos/x86_64/             # Native macOS Intel Tor binary + libtor.dylib
│   └── windows/x86_64/           # Native Windows x64 Tor PE executable (tor.exe)
├── scripts/
│   ├── generate_icons.js         # Generates icon.png & icon.icns from icon.svg
│   ├── package_macos.js          # Packages standalone macOS NoctisBrowser.app
│   └── package_portable.js       # Builds Zero-Admin Portable bundles (macOS/Linux/Windows)
├── src/
│   ├── main/                     # Electron Main process (TorVpnManager, PrivacyEngine, CDP NetworkManager)
│   └── renderer/                 # Browser UI, Network Cockpit, Privacy Vault & Guest Webview Shield
├── test/                         # Automated Unit, Exhaustive Routing & Headless Electron E2E Suites
├── package.json
└── start.sh                      # Zero-Admin POSIX launcher for macOS & Linux
```
