#!/usr/bin/env node
// Records a ~30 s gameplay trailer from the real game into promo/gameplay.mp4 (1920x1080, H.264, silent).
// Needs Playwright, ffmpeg with libx264, and a static server on :8766 serving dist/ (npm run build first):
//   (cd dist && python3 -m http.server 8766 &) && NODE_PATH=$(npm root -g) node scripts/video.js
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8766/web/';
const OUT = path.join(__dirname, '..', 'promo', 'gameplay.mp4');
const TIPS = { tap: 1, gems: 1, par: 1, walls: 1, fixed: 1, hint: 1, mineHit: 1 };

// Each clip: which level, what the save looks like, and whether to show its "NEW!" card first.
const CLIPS = [
  { level: 1, store: {}, pace: 900 },
  { level: 18, store: { tips: TIPS }, pace: 650 },
  { level: 41, store: { tips: TIPS, seen: { mine: 1 } }, pace: 650, card: true },
  { level: 66, store: { tips: TIPS, seen: { mine: 1, splitter: 1, portal: 1 } }, pace: 550 },
];

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beamline-video-'));
  const browser = await browser0();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  const start = Date.now();
  const marks = [];

  for (const clip of CLIPS) {
    const levels = Object.fromEntries(Array.from({ length: clip.level - 1 }, (_, i) => [i + 1, 3]));
    await page.goto('about:blank');
    await page.goto(BASE);
    await page.evaluate((s) => { localStorage.setItem('beamline:v2', s); }, JSON.stringify(Object.assign({ levels, music: false }, clip.store)));
    marks.push((Date.now() - start) / 1000);
    await page.reload();
    await page.waitForTimeout(1300);
    if (clip.card) {
      await page.waitForTimeout(1600);
      await page.click('#btn-feature-ok');
      await page.waitForTimeout(500);
    }
    const p = await page.evaluate((n) => Beamline.campaign(n), clip.level);
    for (const s of p.solution) {
      const i = s.r * p.size + s.c;
      const box = await page.locator(`rect[data-i="${i}"]`).boundingBox();
      const tap = () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await tap();
      await page.waitForTimeout(clip.pace);
      if (s.m === '\\') {
        await tap();
        await page.waitForTimeout(clip.pace);
      }
    }
    await page.waitForTimeout(3000); // win overlay + stars
  }

  const webm = await page.video().path();
  await ctx.close();
  await browser.close();

  // Skip the blank first moment of each reload: keep from the first mark on, upscale to 1080p.
  const from = Math.max(0, marks[0] + 0.8);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(from), '-i', webm,
    '-vf', 'scale=1920:1080:flags=lanczos,fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-an', OUT]);
  console.log('wrote', path.relative(process.cwd(), OUT));
})();

function browser0() {
  return chromium.launch();
}
