/*
 * Beamline engine — pure puzzle logic, shared by the browser and the Node tests.
 *
 * Grid cells:  '.' empty   '#' wall   '*' gem   '/' '\' fixed mirror
 * Player mirrors live in a Map<cellIndex, '/' | '\'> passed to trace().
 * Directions:  0 = up, 1 = right, 2 = down, 3 = left
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Beamline = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DR = [-1, 0, 1, 0];
  const DC = [0, 1, 0, -1];
  const SLASH = [1, 0, 3, 2]; // '/'  up->right, right->up, down->left, left->down
  const BACK = [3, 2, 1, 0];  // '\'  up->left, right->down, down->right, left->up

  // Difficulty ramps through the week, Monday (1) to Sunday (7).
  // turns: mirrors in the intended route; fixed: how many of those are pre-placed;
  // decoys: fixed mirrors off the route; extraGems: gems beyond one per post-turn segment.
  const LEVELS = [
    { size: 6, turns: 2, fixed: 0, decoys: 0, walls: 0.06, extraGems: 1 },
    { size: 6, turns: 3, fixed: 0, decoys: 1, walls: 0.08, extraGems: 1 },
    { size: 7, turns: 4, fixed: 1, decoys: 1, walls: 0.10, extraGems: 1 },
    { size: 7, turns: 4, fixed: 0, decoys: 2, walls: 0.10, extraGems: 1 },
    { size: 7, turns: 5, fixed: 1, decoys: 2, walls: 0.12, extraGems: 2 },
    { size: 8, turns: 6, fixed: 1, decoys: 3, walls: 0.12, extraGems: 2 },
    { size: 8, turns: 7, fixed: 2, decoys: 3, walls: 0.14, extraGems: 2 },
  ];
  const LEVEL_NAMES = ['Spark', 'Glint', 'Gleam', 'Shine', 'Blaze', 'Flare', 'Supernova'];

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const isMirror = (ch) => ch === '/' || ch === '\\';

  function reflect(m, d) {
    return (m === '/' ? SLASH : BACK)[d];
  }

  function mirrorFor(d, nd) {
    return SLASH[d] === nd ? '/' : '\\';
  }

  /**
   * Follow the beam from the emitter.
   * Returns { points: [[r,c],...] turning points incl. start/end,
   *           lit: Set<cellIndex>, end: 'exit'|'wall'|'loop', endDir, solved }
   */
  function trace(p, placed) {
    const N = p.size;
    let r = p.emitter.r;
    let c = p.emitter.c;
    let d = p.emitter.dir;
    const points = [[r, c]];
    const lit = new Set();
    const seen = new Set();
    let end = 'loop';
    const limit = N * N * 4 + 4;
    for (let step = 0; step < limit; step++) {
      r += DR[d];
      c += DC[d];
      if (r < 0 || c < 0 || r >= N || c >= N) {
        end = 'exit';
        break;
      }
      const i = r * N + c;
      const key = i * 4 + d;
      if (seen.has(key)) break;
      seen.add(key);
      const cell = p.grid[i];
      if (cell === '#') {
        end = 'wall';
        break;
      }
      if (cell === '*') lit.add(i);
      const m = isMirror(cell) ? cell : placed && placed.get(i);
      if (m) {
        d = reflect(m, d);
        points.push([r, c]);
      }
    }
    points.push([r, c]);
    return { points, lit, end, endDir: d, solved: lit.size === p.gemCount };
  }

  function buildOnce(rng, cfg) {
    const N = cfg.size;
    const int = (n) => Math.floor(rng() * n);
    const inside = (r, c) => r >= 0 && c >= 0 && r < N && c < N;

    const side = int(4);
    const k = 1 + int(N - 2);
    const emitter = [
      { r: -1, c: k, dir: 2 },
      { r: k, c: N, dir: 3 },
      { r: N, c: k, dir: 0 },
      { r: k, c: -1, dir: 1 },
    ][side];

    const used = new Set();
    const segments = [];
    const route = []; // mirrors of the intended solution
    let r = emitter.r;
    let c = emitter.c;
    let d = emitter.dir;

    for (let t = 0; t <= cfg.turns; t++) {
      let run = 0;
      let rr = r + DR[d];
      let cc = c + DC[d];
      while (inside(rr, cc) && !used.has(rr * N + cc)) {
        run++;
        rr += DR[d];
        cc += DC[d];
      }
      const last = t === cfg.turns;
      if (last && (run < 1 || inside(rr, cc))) return null; // must leave the board cleanly
      if (!last && run < 2) return null;

      const len = last ? run : 2 + int(run - 1);
      const seg = [];
      for (let s = 0; s < len; s++) {
        r += DR[d];
        c += DC[d];
        const i = r * N + c;
        used.add(i);
        seg.push(i);
      }
      if (!last) {
        const nd = (d + (rng() < 0.5 ? 1 : 3)) % 4;
        route.push({ i: r * N + c, m: mirrorFor(d, nd) });
        d = nd;
        segments.push(seg.slice(0, -1)); // the mirror cell itself can't hold a gem
      } else {
        segments.push(seg);
      }
    }

    const grid = new Array(N * N).fill('.');

    // One gem after every turn makes each mirror earn its place, plus a few extras anywhere.
    const gemCells = new Set();
    for (let s = 1; s < segments.length; s++) {
      const seg = segments[s];
      gemCells.add(seg[int(seg.length)]);
    }
    const pool = segments.flat().filter((i) => !gemCells.has(i));
    for (let g = 0; g < cfg.extraGems && pool.length; g++) {
      gemCells.add(pool.splice(int(pool.length), 1)[0]);
    }
    gemCells.forEach((i) => (grid[i] = '*'));

    // Pre-place some of the route's mirrors.
    const order = route.map((_, idx) => idx).sort(() => rng() - 0.5);
    const fixedIdx = new Set(order.slice(0, cfg.fixed));
    route.forEach((m, idx) => {
      if (fixedIdx.has(idx)) grid[m.i] = m.m;
    });
    const solution = route.filter((_, idx) => !fixedIdx.has(idx));

    // Walls and decoy mirrors only ever go off the route.
    const free = [];
    for (let i = 0; i < N * N; i++) if (!used.has(i)) free.push(i);
    for (let n = 0; n < cfg.decoys && free.length; n++) {
      grid[free.splice(int(free.length), 1)[0]] = rng() < 0.5 ? '/' : '\\';
    }
    for (const i of free) if (rng() < cfg.walls) grid[i] = '#';

    const p = {
      size: N,
      grid,
      emitter,
      gemCount: gemCells.size,
      mirrors: solution.length,
      solution: solution.map(({ i, m }) => ({ r: Math.floor(i / N), c: i % N, m })),
    };

    if (trace(p, new Map()).solved) return null;
    if (!trace(p, new Map(solution.map(({ i, m }) => [i, m]))).solved) return null;
    return p;
  }

  // `level` is a weekday tier 1..7 or a full config object (see LEVELS for the shape).
  function generate(seed, level) {
    const custom = typeof level === 'object';
    const lv = custom ? 0 : Math.min(7, Math.max(1, level | 0));
    const cfg = custom ? level : LEVELS[lv - 1];
    const rng = mulberry32(hashString(String(seed)));
    for (let attempt = 0; attempt < 5000; attempt++) {
      const p = buildOnce(rng, cfg);
      if (p) return Object.assign(p, { seed: String(seed), level: lv, levelName: custom ? '' : LEVEL_NAMES[lv - 1] });
    }
    throw new Error('Could not generate puzzle for seed ' + seed);
  }

  // ---- Campaign ------------------------------------------------------------

  const WORLDS = ['Spark', 'Glint', 'Prism', 'Nova', 'Pulsar', 'Quasar'];
  const LEVELS_PER_WORLD = 20;
  const CAMPAIGN_SIZE = WORLDS.length * LEVELS_PER_WORLD;

  // Smooth ramp from a one-mirror tutorial (level 1) to 8-mirror routes with decoys (level 120).
  function campaignConfig(n) {
    return {
      size: n <= 10 ? 5 : n <= 30 ? 6 : n <= 60 ? 7 : 8,
      turns: n <= 3 ? 1 : Math.min(8, 2 + Math.floor((n - 4) / 14)),
      fixed: n >= 11 && n % 3 === 0 ? 1 : 0,
      decoys: n < 21 ? 0 : 1 + Math.floor((n - 21) / 30),
      walls: n < 6 ? 0 : Math.min(0.16, 0.04 + n * 0.001),
      extraGems: n < 3 ? 0 : n < 20 ? 1 : 2,
    };
  }

  function campaign(n) {
    const p = generate('campaign:' + n, campaignConfig(n));
    p.campaignLevel = n;
    p.world = Math.floor((n - 1) / LEVELS_PER_WORLD);
    p.levelName = WORLDS[p.world];
    return p;
  }

  // ---- Daily schedule ------------------------------------------------------

  const EPOCH = Date.UTC(2026, 9, 5); // puzzle #1 = 2026-10-05

  function dateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function puzzleNumber(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000) + 1;
  }

  function levelForKey(key) {
    const wd = parseKey(key).getDay(); // 0 = Sunday
    return wd === 0 ? 7 : wd;
  }

  function daily(key) {
    const p = generate('beamline:' + key, levelForKey(key));
    p.dateKey = key;
    p.number = puzzleNumber(key);
    return p;
  }

  return {
    DR, DC, LEVELS, LEVEL_NAMES,
    hashString, mulberry32, reflect, mirrorFor, trace, generate,
    dateKey, parseKey, puzzleNumber, levelForKey, daily,
    WORLDS, LEVELS_PER_WORLD, CAMPAIGN_SIZE, campaignConfig, campaign,
  };
});
