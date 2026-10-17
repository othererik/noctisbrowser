const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- Packaging NoctisBrowser.app for macOS ---');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const targetApp = path.join(distDir, 'NoctisBrowser.app');
const sourceElectronApp = path.join(rootDir, 'node_modules/electron/dist/Electron.app');
const icnsPath = path.join(rootDir, 'assets/icon.icns');

if (!fs.existsSync(sourceElectronApp)) {
  console.error('Electron.app not found in node_modules.');
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(targetApp)) {
  fs.rmSync(targetApp, { recursive: true, force: true });
}

console.log('1. Cloning Electron runtime bundle...');
execSync(`ditto "${sourceElectronApp}" "${targetApp}"`);

console.log('2. Copying NoctisBrowser application source and assets...');
const appResourcesDir = path.join(targetApp, 'Contents/Resources/app');
fs.mkdirSync(appResourcesDir, { recursive: true });

for (const item of ['package.json', 'src', 'assets', 'bin', 'README.md']) {
  const srcPath = path.join(rootDir, item);
  if (fs.existsSync(srcPath)) {
    fs.cpSync(srcPath, path.join(appResourcesDir, item), { recursive: true });
  }
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

console.log('4. Re-signing NoctisBrowser.app bundle (ad-hoc)...');
try {
  execSync(`codesign --force --deep --sign - "${targetApp}"`);
} catch (_) {}

console.log(`✅ Packaged standalone macOS bundle at: ${targetApp}`);
