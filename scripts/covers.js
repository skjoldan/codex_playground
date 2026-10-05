#!/usr/bin/env node
// Renders portal cover images into promo/ from the live game (needs Playwright + a local server on :8766 serving dist/).
//   npx playwright ... is not a dependency on purpose; run with: NODE_PATH=$(npm root -g) node scripts/covers.js
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'promo');
const BASE = process.env.BASE || 'http://localhost:8766/web/';
const SIZES = [['cover-landscape', 1920, 1080], ['cover-portrait', 800, 1200], ['cover-square', 800, 800]];
const LEVEL = 40;

(async () => {
  const b = await chromium.launch();
  // Grab a solved board as SVG markup from the real game.
  const g = await b.newPage({ viewport: { width: 900, height: 900 } });
  await g.addInitScript((lv) => localStorage.setItem('beamline:v2', JSON.stringify({
    levels: Object.fromEntries(Array.from({ length: lv - 1 }, (_, i) => [i + 1, 3])), tips: { tap: 1, gems: 1, par: 1, walls: 1, fixed: 1, hint: 1 },
  })), LEVEL);
  await g.goto(BASE);
  await g.click('#btn-play');
  await g.waitForTimeout(600);
  const p = await g.evaluate((lv) => Beamline.campaign(lv), LEVEL);
  for (const s of p.solution) {
    const i = s.r * p.size + s.c;
    await g.dispatchEvent(`rect[data-i="${i}"]`, 'pointerdown');
    if (s.m === '\\') await g.dispatchEvent(`rect[data-i="${i}"]`, 'pointerdown');
  }
  await g.waitForTimeout(500);
  const svg = await g.evaluate(() => {
    document.querySelectorAll('.beam-anim,.pop,.enter').forEach((e) => e.classList.remove('beam-anim', 'pop', 'enter'));
    document.querySelectorAll('.spark').forEach((e) => e.remove());
    return document.getElementById('board').outerHTML;
  });

  for (const [name, w, h] of SIZES) {
    const page = await b.newPage({ viewport: { width: w, height: h } });
    await page.goto(BASE);
    await page.evaluate(({ svg, w, h }) => {
      const land = w > h;
      const k = land ? h / 1080 : w / 800;
      document.body.innerHTML = `
        <div style="position:fixed;inset:0;display:flex;flex-direction:${land ? 'row' : 'column'};align-items:center;justify-content:center;gap:${(land ? 90 : 40) * k}px;padding:${40 * k}px">
          <div style="text-align:center">
            <h1 class="logo" style="font-size:${(land ? 140 : 100) * k}px">Beam<span>line</span></h1>
            <p class="tagline" style="font-size:${(land ? 34 : 30) * k}px;margin-top:${14 * k}px">Bend the beam. Light every gem.</p>
          </div>
          <div style="position:relative;width:${(land ? 860 : 560) * k}px;height:${(land ? 860 : 560) * k}px;flex:none">${svg}</div>
        </div>`;
      document.querySelector('svg').classList.remove('won');
    }, { svg, w, h });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('wrote promo/' + name + '.png');
  }
  await b.close();
})();
