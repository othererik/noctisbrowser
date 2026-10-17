const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Building Zero-Admin Portable Distributions (macOS, Linux x64, Windows x64) ===\n');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
fs.mkdirSync(distDir, { recursive: true });

// 1. Build standalone macOS bundle (dist/NoctisBrowser.app) when running on macOS
if (process.platform === 'darwin') {
  require('./package_macos.js');

  // 2. Build Zero-Admin macOS Portable Folder (dist/NoctisBrowser-macOS-Portable)
  const macPortableDir = path.join(distDir, 'NoctisBrowser-macOS-Portable');
  if (fs.existsSync(macPortableDir)) {
    fs.rmSync(macPortableDir, { recursive: true, force: true });
  }
  fs.mkdirSync(macPortableDir, { recursive: true });

  const builtMacApp = path.join(distDir, 'NoctisBrowser.app');
  if (fs.existsSync(builtMacApp)) {
    console.log('\nCreating macOS Zero-Admin Portable Bundle...');
    execSync(`ditto "${builtMacApp}" "${path.join(macPortableDir, 'NoctisBrowser.app')}"`);

    const macLauncherPath = path.join(macPortableDir, 'Launch-NoctisBrowser.command');
    const macLauncherScript = [
      '#!/usr/bin/env bash',
      '# Zero-Admin Portable Launcher for NoctisBrowser (macOS)',
      'DIR="$(cd "$(dirname "$0")" && pwd)"',
      'APP="$DIR/NoctisBrowser.app"',
      '# Strip Gatekeeper quarantine flags in user-space (no admin/sudo required)',
      'xattr -cr "$APP" 2>/dev/null || true',
      'chmod +x "$APP/Contents/MacOS/Electron" 2>/dev/null || true',
      'chmod +x "$APP/Contents/Resources/app/bin/macos/aarch64/tor" 2>/dev/null || true',
      'chmod +x "$APP/Contents/Resources/app/bin/macos/x86_64/tor" 2>/dev/null || true',
      'exec "$APP/Contents/MacOS/Electron" "$@"'
    ].join('\n') + '\n';
    fs.writeFileSync(macLauncherPath, macLauncherScript, { mode: 0o755 });
    fs.chmodSync(macLauncherPath, 0o755);

    fs.writeFileSync(
      path.join(macPortableDir, 'README-PORTABLE.txt'),
      [
        'NoctisBrowser v1.1.1 — Zero-Admin Portable Edition (macOS)',
        '==========================================================',
        '1. No administrator/root privileges or installer required.',
        '2. Place this folder anywhere (Desktop, Downloads, USB drive).',
        '3. Double-click "NoctisBrowser.app" or "Launch-NoctisBrowser.command" to start.',
        '4. All session data is isolated in ephemeral RAM/tmp storage and wiped on exit.'
      ].join('\n') + '\n',
      'utf-8'
    );
    console.log(`✅ Created macOS Portable folder: ${macPortableDir}`);
  }
} else {
  console.log(`ℹ Skipping macOS .app ditto bundle on ${process.platform} host.`);
}

// 3. Build Zero-Admin Linux x86_64 Portable Folder (Fedora / Ubuntu / Debian / Arch)
console.log('\nCreating Linux x86_64 Zero-Admin Portable Bundle (Fedora / Debian / Arch)...');
const linuxPortableDir = path.join(distDir, 'NoctisBrowser-Linux-x64-Portable');
if (fs.existsSync(linuxPortableDir)) {
  fs.rmSync(linuxPortableDir, { recursive: true, force: true });
}
const linuxAppDir = path.join(linuxPortableDir, 'resources', 'app');
fs.mkdirSync(linuxAppDir, { recursive: true });

for (const item of ['package.json', 'src', 'assets', 'bin', 'README.md']) {
  const srcPath = path.join(rootDir, item);
  if (fs.existsSync(srcPath)) {
    fs.cpSync(srcPath, path.join(linuxAppDir, item), { recursive: true });
  }
}

// Ensure Linux Tor binary & shared libraries have 0755 permissions
const linuxTorDir = path.join(linuxAppDir, 'bin', 'linux', 'x86_64');
if (fs.existsSync(linuxTorDir)) {
  for (const f of fs.readdirSync(linuxTorDir)) {
    try { fs.chmodSync(path.join(linuxTorDir, f), 0o755); } catch (_) {}
  }
}

const linuxLauncherPath = path.join(linuxPortableDir, 'launch-noctis-browser.sh');
const linuxLauncherScript = [
  '#!/usr/bin/env bash',
  '# Zero-Admin Portable Launcher for NoctisBrowser (Fedora / Ubuntu / Debian / Arch Linux)',
  'set -e',
  'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
  'APP_DIR="$DIR/resources/app"',
  'export LD_LIBRARY_PATH="$APP_DIR/bin/linux/x86_64:${LD_LIBRARY_PATH:-}"',
  'chmod +x "$APP_DIR/bin/linux/x86_64/tor" 2>/dev/null || true',
  '',
  'if [ -x "$DIR/electron" ]; then',
  '  exec "$DIR/electron" "$APP_DIR" --no-sandbox --disable-setuid-sandbox "$@"',
  'elif [ -x "$DIR/noctis-browser" ]; then',
  '  exec "$DIR/noctis-browser" --no-sandbox --disable-setuid-sandbox "$@"',
  'elif command -v electron >/dev/null 2>&1; then',
  '  exec electron "$APP_DIR" --no-sandbox --disable-setuid-sandbox "$@"',
  'elif [ -x "$DIR/../../node_modules/.bin/electron" ]; then',
  '  exec "$DIR/../../node_modules/.bin/electron" "$APP_DIR" --no-sandbox --disable-setuid-sandbox "$@"',
  'else',
  '  echo "Launching via npx electron (zero-admin user space)..."',
  '  exec npx --yes electron@41.7.1 "$APP_DIR" --no-sandbox --disable-setuid-sandbox "$@"',
  'fi'
].join('\n') + '\n';
fs.writeFileSync(linuxLauncherPath, linuxLauncherScript, { mode: 0o755 });
try { fs.chmodSync(linuxLauncherPath, 0o755); } catch (_) {}

const linuxDesktopFile = [
  '[Desktop Entry]',
  'Type=Application',
  'Name=NoctisBrowser (Portable)',
  'Comment=Zero-Trace Ephemeral Privacy Browser with Built-in VPN & Tor',
  'Exec=./launch-noctis-browser.sh',
  'Icon=resources/app/assets/icon.png',
  'Terminal=false',
  'Categories=Network;WebBrowser;Security;'
].join('\n') + '\n';
fs.writeFileSync(path.join(linuxPortableDir, 'NoctisBrowser.desktop'), linuxDesktopFile, { mode: 0o755 });

fs.writeFileSync(
  path.join(linuxPortableDir, 'README-PORTABLE.txt'),
  [
    'NoctisBrowser v1.1.1 — Zero-Admin Portable Edition (Linux x86_64)',
    '=================================================================',
    '1. No root/sudo or chrome-sandbox SUID permissions required.',
    '2. Bundled with native Linux x86_64 Tor daemon + libevent/libssl/libcrypto + GeoIP databases.',
    '3. Run "./launch-noctis-browser.sh" from any directory to start immediately.'
  ].join('\n') + '\n',
  'utf-8'
);
console.log(`✅ Created Linux x86_64 Portable folder: ${linuxPortableDir}`);

// 4. Build Zero-Admin Windows x64 Portable Folder
console.log('\nCreating Windows x64 Zero-Admin Portable Bundle...');
const winPortableDir = path.join(distDir, 'NoctisBrowser-Windows-x64-Portable');
if (fs.existsSync(winPortableDir)) {
  fs.rmSync(winPortableDir, { recursive: true, force: true });
}
const winAppDir = path.join(winPortableDir, 'resources', 'app');
fs.mkdirSync(winAppDir, { recursive: true });

for (const item of ['package.json', 'src', 'assets', 'bin', 'README.md']) {
  const srcPath = path.join(rootDir, item);
  if (fs.existsSync(srcPath)) {
    fs.cpSync(srcPath, path.join(winAppDir, item), { recursive: true });
  }
}

const winLauncherBat = [
  '@echo off',
  'REM Zero-Admin Portable Launcher for NoctisBrowser (Windows x64)',
  'SET DIR=%~dp0',
  'SET APP_DIR=%DIR%resources\\app',
  'SET PATH=%APP_DIR%\\bin\\windows\\x86_64;%PATH%',
  'IF EXIST "%DIR%electron.exe" (',
  '  "%DIR%electron.exe" "%APP_DIR%" %*',
  ') ELSE (',
  '  npx --yes electron@41.7.1 "%APP_DIR%" %*',
  ')'
].join('\r\n') + '\r\n';
fs.writeFileSync(path.join(winPortableDir, 'Launch-NoctisBrowser.bat'), winLauncherBat, 'utf-8');

fs.writeFileSync(
  path.join(winPortableDir, 'README-PORTABLE.txt'),
  [
    'NoctisBrowser v1.1.1 — Zero-Admin Portable Edition (Windows x64)',
    '================================================================',
    '1. No administrator privileges or installer required.',
    '2. Bundled with native Windows x64 Tor daemon (tor.exe) + GeoIP databases.',
    '3. Double-click "Launch-NoctisBrowser.bat" from any folder to start immediately.'
  ].join('\r\n') + '\r\n',
  'utf-8'
);
console.log(`✅ Created Windows x64 Portable folder: ${winPortableDir}`);

console.log('\n🎉 All Zero-Admin Portable Distributions Built Successfully!');
