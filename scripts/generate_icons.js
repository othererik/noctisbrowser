const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Hard timeout so script always exits cleanly
setTimeout(() => {
  console.error('Icon generation timed out');
  process.exit(1);
}, 15000);

app.whenReady().then(async () => {
  try {
    const assetsDir = path.join(__dirname, '../assets');
    const svgPath = path.join(assetsDir, 'icon.svg');
    const pngPath = path.join(assetsDir, 'icon.png');
    const icnsPath = path.join(assetsDir, 'icon.icns');
    const iconsetDir = path.join(assetsDir, 'NoctisBrowser.iconset');

    const win = new BrowserWindow({
      width: 1024,
      height: 1024,
      show: false,
      frame: false,
      transparent: true,
      enableLargerThanScreen: true,
      webPreferences: {
        offscreen: true
      }
    });

    win.setContentSize(1024, 1024);
    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    const html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;background:transparent;overflow:hidden;}body{width:1024px;height:1024px;display:flex;align-items:center;justify-content:center;}</style></head><body>${svgContent}</body></html>`;
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    await new Promise(r => setTimeout(r, 200));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
    const pngBuffer = image.resize({ width: 1024, height: 1024 }).toPNG();
    fs.writeFileSync(pngPath, pngBuffer);
    console.log('Generated:', pngPath, `(${pngBuffer.length} bytes)`);

    // Build macOS .icns using sips + iconutil
    if (fs.existsSync(iconsetDir)) {
      fs.rmSync(iconsetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(iconsetDir, { recursive: true });

    const sizes = [
      { size: 16, name: 'icon_16x16.png' },
      { size: 32, name: 'icon_16x16@2x.png' },
      { size: 32, name: 'icon_32x32.png' },
      { size: 64, name: 'icon_32x32@2x.png' },
      { size: 128, name: 'icon_128x128.png' },
      { size: 256, name: 'icon_128x128@2x.png' },
      { size: 256, name: 'icon_256x256.png' },
      { size: 512, name: 'icon_256x256@2x.png' },
      { size: 512, name: 'icon_512x512.png' },
      { size: 1024, name: 'icon_512x512@2x.png' }
    ];

    for (const s of sizes) {
      const out = path.join(iconsetDir, s.name);
      execSync(`sips -z ${s.size} ${s.size} "${pngPath}" --out "${out}" >/dev/null 2>&1`);
    }

    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
    fs.rmSync(iconsetDir, { recursive: true, force: true });
    console.log('Generated:', icnsPath);

    process.exit(0);
  } catch (err) {
    console.error('Failed to generate icons:', err);
    process.exit(1);
  }
});
