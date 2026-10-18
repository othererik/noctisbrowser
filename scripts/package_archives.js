const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

console.log('=== Packaging Portable Distribution Archives for Release ===\n');

if (!fs.existsSync(distDir)) {
  console.error('Error: dist/ directory not found. Run "npm run dist:portable" first.');
  process.exit(1);
}

function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const fileBuffer = fs.readFileSync(filePath);
  hash.update(fileBuffer);
  return hash.digest('hex');
}

const checksums = [];

// 1. macOS Portable Zip
const macDir = path.join(distDir, 'NoctisBrowser-macOS-Portable');
const macZip = path.join(distDir, 'NoctisBrowser-macOS-Portable.zip');
if (fs.existsSync(macDir)) {
  console.log('Compressing macOS Portable archive...');
  if (fs.existsSync(macZip)) fs.unlinkSync(macZip);
  // Using ditto or zip to preserve symlinks and permissions
  try {
    execSync(`ditto -c -k --sequesterRsrc --keepParent "${macDir}" "${macZip}"`);
  } catch (_) {
    execSync(`cd "${distDir}" && zip -r -q "NoctisBrowser-macOS-Portable.zip" "NoctisBrowser-macOS-Portable"`);
  }
  const sizeMb = (fs.statSync(macZip).size / (1024 * 1024)).toFixed(1);
  const sha = calculateSha256(macZip);
  checksums.push({ file: 'NoctisBrowser-macOS-Portable.zip', size: `${sizeMb} MB`, sha256: sha });
  console.log(`✅ Created: NoctisBrowser-macOS-Portable.zip (${sizeMb} MB)`);
}

// 2. Linux x64 Tarball
const linuxDir = path.join(distDir, 'NoctisBrowser-Linux-x64-Portable');
const linuxTar = path.join(distDir, 'NoctisBrowser-Linux-x64-Portable.tar.gz');
if (fs.existsSync(linuxDir)) {
  console.log('Compressing Linux x64 Portable archive...');
  if (fs.existsSync(linuxTar)) fs.unlinkSync(linuxTar);
  execSync(`tar -czf "${linuxTar}" -C "${distDir}" "NoctisBrowser-Linux-x64-Portable"`);
  const sizeMb = (fs.statSync(linuxTar).size / (1024 * 1024)).toFixed(1);
  const sha = calculateSha256(linuxTar);
  checksums.push({ file: 'NoctisBrowser-Linux-x64-Portable.tar.gz', size: `${sizeMb} MB`, sha256: sha });
  console.log(`✅ Created: NoctisBrowser-Linux-x64-Portable.tar.gz (${sizeMb} MB)`);
}

// 3. Windows x64 Zip
const winDir = path.join(distDir, 'NoctisBrowser-Windows-x64-Portable');
const winZip = path.join(distDir, 'NoctisBrowser-Windows-x64-Portable.zip');
if (fs.existsSync(winDir)) {
  console.log('Compressing Windows x64 Portable archive...');
  if (fs.existsSync(winZip)) fs.unlinkSync(winZip);
  try {
    execSync(`cd "${distDir}" && zip -r -q "NoctisBrowser-Windows-x64-Portable.zip" "NoctisBrowser-Windows-x64-Portable"`);
  } catch (_) {
    execSync(`tar -czf "${path.join(distDir, 'NoctisBrowser-Windows-x64-Portable.tar.gz')}" -C "${distDir}" "NoctisBrowser-Windows-x64-Portable"`);
  }
  const sizeMb = (fs.statSync(winZip).size / (1024 * 1024)).toFixed(1);
  const sha = calculateSha256(winZip);
  checksums.push({ file: 'NoctisBrowser-Windows-x64-Portable.zip', size: `${sizeMb} MB`, sha256: sha });
  console.log(`✅ Created: NoctisBrowser-Windows-x64-Portable.zip (${sizeMb} MB)`);
}

// Write SHA256SUMS.txt
const sumsFile = path.join(distDir, 'SHA256SUMS.txt');
const sumsContent = checksums.map(c => `${c.sha256}  ${c.file}`).join('\n') + '\n';
fs.writeFileSync(sumsFile, sumsContent, 'utf-8');

console.log('\n--- SHA-256 Checksums ---');
checksums.forEach(c => console.log(`${c.sha256}  ${c.file} (${c.size})`));
console.log(`\nChecksums saved to: ${sumsFile}\n`);
