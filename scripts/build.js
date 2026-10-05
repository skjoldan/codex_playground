#!/usr/bin/env node
// Builds one folder + zip per distribution target into dist/.
//   web         -> own hosting (GitHub Pages); no ads, hints are free
//   crazygames  -> CrazyGames SDK v3
//   poki        -> Poki SDK v2
// Usage: node scripts/build.js [target ...]   (default: all)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const SDK = {
  web: null,
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SDK);

for (const t of targets) {
  if (!(t in SDK)) throw new Error(`Unknown target "${t}". Use one of: ${Object.keys(SDK).join(', ')}`);
  const out = path.join(DIST, t);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  for (const f of fs.readdirSync(SRC)) fs.copyFileSync(path.join(SRC, f), path.join(out, f));

  fs.writeFileSync(
    path.join(out, 'config.js'),
    `window.BEAMLINE_CONFIG = { platform: '${t}' };\n`
  );

  let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  if (SDK[t]) {
    const marker = '<script src="config.js"></script>';
    if (!html.includes(marker)) throw new Error('config.js script tag not found in index.html');
    html = html.replace(marker, `<script src="${SDK[t]}"></script>\n  ${marker}`);
  }
  fs.writeFileSync(path.join(out, 'index.html'), html);

  const zip = path.join(DIST, `beamline-${t}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: out });
  const kb = (fs.statSync(zip).size / 1024).toFixed(1);
  console.log(`built ${t.padEnd(10)} dist/${t}/  dist/beamline-${t}.zip (${kb} KB)`);
}
