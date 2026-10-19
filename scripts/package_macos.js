const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const icnsPath = path.join(rootDir, 'assets/icon.icns');
const electronPkgPath = path.join(rootDir, 'node_modules/electron/package.json');
const electronVersion = fs.existsSync(electronPkgPath)
  ? JSON.parse(fs.readFileSync(electronPkgPath, 'utf-8')).version
  : '41.7.1';

/**
 * Obtain a clean Electron.app template for the target macOS architecture ('arm64' or 'x64')
 * even when building on a different host architecture (e.g. building arm64 on an Intel Mac).
 */
async function resolveElectronAppForArch(arch) {
  const localElectronApp = path.join(rootDir, 'node_modules/electron/dist/Electron.app');
  if (arch === process.arch && fs.existsSync(localElectronApp)) {
    return { appPath: localElectronApp, cleanupDir: null };
  }

  console.log(`   Fetching official Electron v${electronVersion} darwin-${arch} runtime...`);
  const { downloadArtifact } = require('@electron/get');
  const zipPath = await downloadArtifact({
    version: electronVersion,
    platform: 'darwin',
    arch,
    artifactName: 'electron'
  });

  const tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), `noctis-electron-darwin-${arch}-`));
  execSync(`ditto -x -k "${zipPath}" "${tempExtractDir}"`);
  return {
    appPath: path.join(tempExtractDir, 'Electron.app'),
    cleanupDir: tempExtractDir
  };
}

/**
 * Package a standalone NoctisBrowser.app bundle for a specific macOS CPU architecture ('arm64' or 'x64').
 * Copies only the matching native Tor architecture binary so no cross-arch binaries trigger Rosetta warnings.
 */
async function buildMacAppForArch(arch, targetApp) {
  console.log(`\n--- Packaging NoctisBrowser.app for macOS (${arch}) ---`);
  fs.mkdirSync(distDir, { recursive: true });
  if (fs.existsSync(targetApp)) {
    fs.rmSync(targetApp, { recursive: true, force: true });
  }

  const { appPath: sourceElectronApp, cleanupDir } = await resolveElectronAppForArch(arch);
  try {
    console.log(`1. Cloning Electron (${arch}) runtime bundle...`);
    execSync(`ditto "${sourceElectronApp}" "${targetApp}"`);

    console.log('2. Copying NoctisBrowser application source and architecture-matched assets...');
    const appResourcesDir = path.join(targetApp, 'Contents/Resources/app');
    fs.mkdirSync(appResourcesDir, { recursive: true });

    for (const item of ['package.json', 'src', 'assets', 'README.md']) {
      const srcPath = path.join(rootDir, item);
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, path.join(appResourcesDir, item), { recursive: true });
      }
    }

    // Copy only the matching macOS Tor architecture ('aarch64' for arm64, 'x86_64' for x64) + GeoIP databases
    const torArchDir = arch === 'arm64' ? 'aarch64' : 'x86_64';
    const srcTorDir = path.join(rootDir, 'bin/macos', torArchDir);
    const dstTorDir = path.join(appResourcesDir, 'bin/macos', torArchDir);
    if (fs.existsSync(srcTorDir)) {
      fs.mkdirSync(dstTorDir, { recursive: true });
      fs.cpSync(srcTorDir, dstTorDir, { recursive: true });
      for (const f of fs.readdirSync(dstTorDir)) {
        try { fs.chmodSync(path.join(dstTorDir, f), 0o755); } catch (_) {}
      }
    }

    const srcGeoIpDir = path.join(rootDir, 'bin/geoip');
    const dstGeoIpDir = path.join(appResourcesDir, 'bin/geoip');
    if (fs.existsSync(srcGeoIpDir)) {
      fs.mkdirSync(dstGeoIpDir, { recursive: true });
      fs.cpSync(srcGeoIpDir, dstGeoIpDir, { recursive: true });
    }

    console.log('3. Installing custom NoctisBrowser.icns & updating Info.plist...');
    if (fs.existsSync(icnsPath)) {
      fs.copyFileSync(icnsPath, path.join(targetApp, 'Contents/Resources/electron.icns'));
    }

    const plistPath = path.join(targetApp, 'Contents/Info.plist');
    if (fs.existsSync(plistPath)) {
      let plist = fs.readFileSync(plistPath, 'utf-8');
      plist = plist.replace(/<key>CFBundleDisplayName<\/key>\s*<string>.*?<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>NoctisBrowser</string>');
      plist = plist.replace(/<key>CFBundleName<\/key>\s*<string>.*?<\/string>/, '<key>CFBundleName</key>\n\t<string>NoctisBrowser</string>');
      plist = plist.replace(/<key>CFBundleIdentifier<\/key>\s*<string>.*?<\/string>/, '<key>CFBundleIdentifier</key>\n\t<string>io.noctis.browser</string>');
      fs.writeFileSync(plistPath, plist, 'utf-8');
    }

    console.log(`4. Re-signing NoctisBrowser.app (${arch}) bundle (ad-hoc)...`);
    try {
      execSync(`codesign --force --deep --sign - "${targetApp}"`);
    } catch (_) {}

    console.log(`✅ Packaged macOS (${arch}) bundle at: ${targetApp}`);
  } finally {
    if (cleanupDir && fs.existsSync(cleanupDir)) {
      try { fs.rmSync(cleanupDir, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

async function buildAllMacBundles() {
  const arm64App = path.join(distDir, 'NoctisBrowser-arm64.app');
  const x64App = path.join(distDir, 'NoctisBrowser-x64.app');
  const defaultApp = path.join(distDir, 'NoctisBrowser.app');

  await buildMacAppForArch('arm64', arm64App);
  await buildMacAppForArch('x64', x64App);

  // Keep dist/NoctisBrowser.app matching current host architecture
  const hostApp = process.arch === 'arm64' ? arm64App : x64App;
  if (fs.existsSync(defaultApp)) {
    fs.rmSync(defaultApp, { recursive: true, force: true });
  }
  execSync(`ditto "${hostApp}" "${defaultApp}"`);
}

if (require.main === module) {
  buildAllMacBundles().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildMacAppForArch, buildAllMacBundles };
