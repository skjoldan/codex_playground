#!/usr/bin/env node
// Renders portal cover art into promo/ from the real game.
// Needs Playwright and a static server on :8766 serving dist/ (npm run build first):
//   (cd dist && python3 -m http.server 8766 &) && NODE_PATH=$(npm root -g) node scripts/covers.js
const { chromium } = require('playwright');
const path = require('path');
const { gem, gemDefs } = require('./logo.js');

const OUT = path.join(__dirname, '..', 'promo');
const BASE = process.env.BASE || 'http://localhost:8766/web/';
const LEVEL = 65; // a portal level whose solved board looks busy and bright
const SIZES = [
  ['cover-landscape', 1920, 1080],
  ['cover-portrait', 800, 1200],
  ['cover-square', 800, 800],
];

async function solvedBoard(browser) {
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.addInitScript((lv) => localStorage.setItem('beamline:v2', JSON.stringify({
    levels: Object.fromEntries(Array.from({ length: lv - 1 }, (_, i) => [i + 1, 3])),
    tips: { tap: 1, gems: 1, par: 1, walls: 1, fixed: 1, hint: 1, mineHit: 1 },
    seen: { mine: 1, splitter: 1, portal: 1 },
  })), LEVEL);
  await page.goto(BASE);
  await page.waitForTimeout(800);
  const p = await page.evaluate((lv) => Beamline.campaign(lv), LEVEL);
  for (const s of p.solution) {
    const i = s.r * p.size + s.c;
    await page.dispatchEvent(`rect[data-i="${i}"]`, 'pointerdown');
    if (s.m === '\\') await page.dispatchEvent(`rect[data-i="${i}"]`, 'pointerdown');
  }
  await page.waitForTimeout(1200);
  const svg = await page.evaluate(() => {
    document.querySelectorAll('.beam-anim,.pop,.enter').forEach((e) => e.classList.remove('beam-anim', 'pop', 'enter'));
    document.querySelectorAll('.spark,.pointer').forEach((e) => e.remove());
    const b = document.getElementById('board');
    b.classList.remove('won');
    return b.outerHTML;
  });
  await page.close();
  return svg;
}

function mascot(size) {
  return `<svg viewBox="-60 -60 120 120" width="${size}" height="${size}" style="overflow:visible">
    <defs>${gemDefs('m')}<filter id="mglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <circle r="48" fill="#5ef2ff" opacity=".55" filter="url(#mglow)"/>
    ${gem(0, 0, 50, { id: 'm' })}
    <g fill="#fff"><path d="M-58 -40 l4 11 11 4 -11 4 -4 11 -4 -11 -11 -4 11 -4z"/><path d="M46 -52 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/></g>
  </svg>`;
}

function scene({ w, h, svg, text }) {
  const land = w > h;
  const u = Math.min(w, h) / 100; // 1 unit = 1% of the short side
  const boardSize = land ? 80 * u : 78 * u;
  const rays = Array.from({ length: 14 }, (_, k) => {
    const a = (360 / 14) * k;
    return `<div style="position:absolute;left:50%;top:50%;width:${Math.max(w, h) * 1.2}px;height:${7 * u}px;transform-origin:0 50%;transform:rotate(${a}deg);background:linear-gradient(90deg,#ffffff22,#ffffff00 80%)"></div>`;
  }).join('');
  const logoW = land ? 80 * u : 92 * u;
  return `
  <div style="position:fixed;inset:0;overflow:hidden;background:radial-gradient(circle at ${land ? '62% 45%' : '50% 58%'}, #b23cff 0%, #6a1fd1 32%, #2b0b72 68%, #14053a 100%)">
    <div style="position:absolute;left:${land ? 62 : 50}%;top:${land ? 45 : 58}%;width:0;height:0">${rays}</div>
    <div style="position:absolute;left:${land ? (text ? 73 : 58) : 50}%;top:${land ? 50 : text ? 62 : 52}%;width:${boardSize}px;height:${boardSize}px;
         transform:translate(-50%,-50%) perspective(${boardSize * 2.6}px) rotateX(24deg) rotateZ(-9deg);
         filter:drop-shadow(0 ${3 * u}px ${4 * u}px #0009)">
      <div style="position:absolute;inset:6%;border-radius:${3 * u}px;background:#1c1647;box-shadow:0 0 0 ${1.2 * u}px #14093a, 0 0 ${10 * u}px #ff3d7f88"></div>
      ${svg}
    </div>
    <div style="position:absolute;left:${land ? (text ? 86 : 78) : 76}%;top:${land ? 72 : text ? 84 : 78}%;z-index:2;transform:translate(-50%,-50%) rotate(8deg)">${mascot(land ? 46 * u : 40 * u)}</div>
    ${text ? `<img src="logo.svg" style="position:absolute;z-index:3;left:${land ? 4 : 50}%;top:${land ? 50 : 4}%;width:${logoW}px;transform:${land ? 'translateY(-50%)' : 'translateX(-50%)'};filter:drop-shadow(0 ${1.2 * u}px ${2 * u}px #0008)">` : ''}
  </div>`;
}

(async () => {
  const browser = await chromium.launch();
  const svg = await solvedBoard(browser);
  for (const [name, w, h] of SIZES) {
    for (const text of [true, false]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(BASE);
      await page.waitForTimeout(300);
      await page.evaluate((html) => {
        document.querySelectorAll('.overlay').forEach((o) => o.classList.add('hidden'));
        document.body.dataset.world = '0';
        document.body.innerHTML = html;
      }, scene({ w, h, svg, text }));
      await page.waitForTimeout(500);
      const file = `${name}${text ? '' : '-notext'}.png`;
      await page.screenshot({ path: path.join(OUT, file) });
      console.log('wrote promo/' + file);
      await page.close();
    }
  }
  await browser.close();
})();
