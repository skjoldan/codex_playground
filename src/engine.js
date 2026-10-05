/*
 * Beamline engine — pure puzzle logic, shared by the browser and the Node tests.
 *
 * Grid cells:
 *   '.' empty          '#' wall            '*' gem
 *   '/' '\' fixed mirror                   'x' mine (beam must not touch it)
 *   'S' '/'-splitter   'Z' '\'-splitter    (reflects AND lets the beam pass straight through)
 *   '@' portal         (exactly two per board; entering one exits the other, same direction)
 * Player mirrors live in a Map<cellIndex, '/' | '\'> passed to trace().
 * Directions: 0 = up, 1 = right, 2 = down, 3 = left
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

  const DEFAULTS = { size: 7, turns: 3, fixed: 0, decoys: 0, walls: 0.1, extraGems: 1, mines: 0, splitters: 0, portals: 0 };

  // Daily difficulty ramps through the week, Monday (1) to Sunday (7), and mixes in the special pieces.
  const LEVELS = [
    { size: 6, turns: 2, walls: 0.06 },
    { size: 6, turns: 3, decoys: 1, walls: 0.08, mines: 1 },
    { size: 7, turns: 3, fixed: 1, decoys: 1, splitters: 1 },
    { size: 7, turns: 4, decoys: 1, mines: 2, portals: 1 },
    { size: 7, turns: 4, fixed: 1, decoys: 2, walls: 0.12, extraGems: 2, splitters: 1, mines: 2 },
    { size: 8, turns: 5, fixed: 1, decoys: 2, walls: 0.12, extraGems: 2, splitters: 1, portals: 1, mines: 1 },
    { size: 8, turns: 6, fixed: 1, decoys: 3, walls: 0.12, extraGems: 2, splitters: 2, mines: 2 },
  ].map((l) => Object.assign({}, DEFAULTS, l));
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
  const isSplitter = (ch) => ch === 'S' || ch === 'Z';
  const splitterShape = (ch) => (ch === 'S' ? '/' : '\\');

  function reflect(m, d) {
    return (m === '/' ? SLASH : BACK)[d];
  }

  function mirrorFor(d, nd) {
    return SLASH[d] === nd ? '/' : '\\';
  }

  /**
   * Follow every beam from the emitter (splitters fork it, portals teleport it).
   * Returns {
   *   beams: [{ points: [[r,c],...], end: 'exit'|'wall'|'mine'|'portal'|'merge'|'loop', endDir }],
   *   lit: Set<cellIndex>, mineHit: cellIndex|null, solved
   * }
   */
  function trace(p, placed) {
    const N = p.size;
    const beams = [];
    const lit = new Set();
    const seen = new Set();
    let mineHit = null;
    const queue = [{ r: p.emitter.r, c: p.emitter.c, d: p.emitter.dir }];
    const limit = N * N * 4 + 4;
    let guard = 0;

    while (queue.length && guard++ < 64) {
      let { r, c, d } = queue.shift();
      let points = [[r, c]];
      let end = 'loop';
      for (let step = 0; step < limit; step++) {
        r += DR[d];
        c += DC[d];
        if (r < 0 || c < 0 || r >= N || c >= N) {
          end = 'exit';
          break;
        }
        const i = r * N + c;
        if (seen.has(i * 4 + d)) {
          end = 'merge';
          break;
        }
        seen.add(i * 4 + d);
        const cell = p.grid[i];
        if (cell === '#') {
          end = 'wall';
          break;
        }
        if (cell === 'x') {
          end = 'mine';
          if (mineHit === null) mineHit = i;
          break;
        }
        if (cell === '*') lit.add(i);
        if (cell === '@') {
          const j = p.portals[0] === i ? p.portals[1] : p.portals[0];
          points.push([r, c]);
          beams.push({ points, end: 'portal', endDir: d });
          r = Math.floor(j / N);
          c = j % N;
          seen.add(j * 4 + d);
          points = [[r, c]];
          continue;
        }
        if (isSplitter(cell)) {
          queue.push({ r, c, d });
          d = reflect(splitterShape(cell), d);
          points.push([r, c]);
          continue;
        }
        const m = isMirror(cell) ? cell : placed && placed.get(i);
        if (m) {
          d = reflect(m, d);
          points.push([r, c]);
        }
      }
      points.push([r, c]);
      beams.push({ points, end, endDir: d });
    }
    return { beams, lit, mineHit, solved: lit.size === p.gemCount && mineHit === null };
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

    const grid = new Array(N * N).fill('.');
    const used = new Set();
    const segments = []; // { cells, needGem }
    const route = [];    // mirrors of the intended solution
    const portals = [];
    let splitters = cfg.splitters;
    let portalPairs = cfg.portals;
    const pending = [];

    function freeRun(r, c, d) {
      let run = 0;
      let rr = r + DR[d];
      let cc = c + DC[d];
      while (inside(rr, cc) && !used.has(rr * N + cc)) {
        run++;
        rr += DR[d];
        cc += DC[d];
      }
      return { run, exits: !inside(rr, cc) };
    }

    // Walks one beam; returns false if this layout doesn't work out.
    function walk(r, c, d, turns, needGem) {
      for (let guard = 0; guard < 40; guard++) {
        const { run, exits } = freeRun(r, c, d);
        let event = 'exit';
        if (turns > 0) {
          event = 'mirror';
          if (splitters > 0 && rng() < 0.4) event = 'splitter';
          else if (portalPairs > 0 && rng() < 0.4) event = 'portal';
        } else if (portalPairs > 0 && rng() < 0.6) event = 'portal';

        if (event === 'exit') {
          if (run < 1 || !exits) return false;
          const seg = [];
          for (let s = 0; s < run; s++) {
            r += DR[d];
            c += DC[d];
            used.add(r * N + c);
            seg.push(r * N + c);
          }
          segments.push({ cells: seg, needGem });
          return true;
        }

        if (run < 2) return false;
        const len = 2 + int(run - 1);
        const seg = [];
        for (let s = 0; s < len; s++) {
          r += DR[d];
          c += DC[d];
          used.add(r * N + c);
          seg.push(r * N + c);
        }
        const at = seg.pop(); // the event cell can't hold a gem
        segments.push({ cells: seg, needGem });
        needGem = true;

        if (event === 'mirror') {
          const nd = (d + (rng() < 0.5 ? 1 : 3)) % 4;
          route.push({ i: at, m: mirrorFor(d, nd) });
          d = nd;
          turns--;
        } else if (event === 'splitter') {
          const nd = (d + (rng() < 0.5 ? 1 : 3)) % 4;
          grid[at] = mirrorFor(d, nd) === '/' ? 'S' : 'Z';
          splitters--;
          const branch = int(turns + 1); // turns handed to the straight-through branch
          pending.push({ r, c, d, turns: branch });
          turns -= branch;
          d = nd;
        } else {
          // Portal: jump to a far, free cell and keep the direction.
          const options = [];
          for (let j = 0; j < N * N; j++) {
            const jr = Math.floor(j / N);
            const jc = j % N;
            if (used.has(j) || Math.abs(jr - r) + Math.abs(jc - c) < 3) continue;
            if (freeRun(jr, jc, d).run >= 1) options.push(j);
          }
          if (!options.length) return false;
          const j = options[int(options.length)];
          grid[at] = '@';
          grid[j] = '@';
          portals.push(at, j);
          used.add(j);
          portalPairs--;
          r = Math.floor(j / N);
          c = j % N;
        }
      }
      return false;
    }

    if (!walk(emitter.r, emitter.c, emitter.dir, cfg.turns, false)) return null;
    while (pending.length) {
      const b = pending.shift();
      if (!walk(b.r, b.c, b.d, b.turns, true)) return null;
    }
    if (splitters > 0 || portalPairs > 0) return null;

    // One gem after every event makes each piece earn its place, plus a few extras anywhere.
    const gemCells = new Set();
    for (const s of segments) if (s.needGem && s.cells.length) gemCells.add(s.cells[int(s.cells.length)]);
    const pool = segments.flatMap((s) => s.cells).filter((i) => !gemCells.has(i));
    for (let g = 0; g < cfg.extraGems && pool.length; g++) gemCells.add(pool.splice(int(pool.length), 1)[0]);
    gemCells.forEach((i) => (grid[i] = '*'));

    // Pre-place some of the route's mirrors.
    const order = route.map((_, idx) => idx).sort(() => rng() - 0.5);
    const fixedIdx = new Set(order.slice(0, cfg.fixed));
    route.forEach((m, idx) => {
      if (fixedIdx.has(idx)) grid[m.i] = m.m;
    });
    const solution = route.filter((_, idx) => !fixedIdx.has(idx));

    // Mines, decoys and walls only ever go off the route. Mines prefer to hug the route,
    // where a careless mirror sends the beam straight into them.
    let free = [];
    for (let i = 0; i < N * N; i++) if (!used.has(i)) free.push(i);
    const nearRoute = (i) => [0, 1, 2, 3].some((d) => {
      const r = Math.floor(i / N) + DR[d];
      const c = (i % N) + DC[d];
      return inside(r, c) && used.has(r * N + c);
    });
    for (let n = 0; n < cfg.mines; n++) {
      const near = free.filter(nearRoute);
      const from = near.length && rng() < 0.8 ? near : free;
      if (!from.length) break;
      const i = from[int(from.length)];
      grid[i] = 'x';
      free = free.filter((j) => j !== i);
    }
    for (let n = 0; n < cfg.decoys && free.length; n++) {
      grid[free.splice(int(free.length), 1)[0]] = rng() < 0.5 ? '/' : '\\';
    }
    for (const i of free) if (rng() < cfg.walls) grid[i] = '#';

    const p = {
      size: N,
      grid,
      emitter,
      portals,
      gemCount: gemCells.size,
      mirrors: solution.length,
      solution: solution.map(({ i, m }) => ({ r: Math.floor(i / N), c: i % N, m })),
    };

    if (p.mirrors < 1) return null;
    if (trace(p, new Map()).solved) return null;
    if (!trace(p, new Map(solution.map(({ i, m }) => [i, m]))).solved) return null;
    return p;
  }

  // `level` is a weekday tier 1..7 or a config object (see DEFAULTS for the shape).
  function generate(seed, level) {
    const custom = typeof level === 'object';
    const lv = custom ? 0 : Math.min(7, Math.max(1, level | 0));
    const cfg = Object.assign({}, DEFAULTS, custom ? level : LEVELS[lv - 1]);
    // Every splitter adds a branch that needs room of its own.
    cfg.turns = Math.max(1, Math.min(cfg.turns, 8 - 2 * cfg.splitters));
    const rng = mulberry32(hashString(String(seed)));
    for (let attempt = 0; attempt < 12000; attempt++) {
      // Safety net: if a config is too dense for this seed, relax it step by step instead of failing.
      if (attempt > 0 && attempt % 3000 === 0 && cfg.turns > 1) cfg.turns--;
      const p = buildOnce(rng, cfg);
      if (p) return Object.assign(p, { seed: String(seed), level: lv, levelName: custom ? '' : LEVEL_NAMES[lv - 1] });
    }
    throw new Error('Could not generate puzzle for seed ' + seed);
  }

  // ---- Campaign ------------------------------------------------------------

  const WORLDS = ['Spark', 'Glint', 'Prism', 'Nova', 'Pulsar', 'Quasar'];
  // The piece each world introduces (shown as a "New!" card on its first level).
  const WORLD_FEATURES = [null, 'mine', 'splitter', 'portal', null, null];
  const LEVELS_PER_WORLD = 20;
  const CAMPAIGN_SIZE = WORLDS.length * LEVELS_PER_WORLD;

  function campaignConfig(n) {
    const w = Math.floor((n - 1) / LEVELS_PER_WORLD);
    const k = (n - 1) % LEVELS_PER_WORLD; // position inside the world
    const cfg = Object.assign({}, DEFAULTS, {
      size: n <= 10 ? 5 : n <= 30 ? 6 : n <= 60 ? 7 : 8,
      turns: n <= 3 ? 1 : Math.min(7, 2 + Math.floor((n - 4) / 16)),
      fixed: n >= 11 && n % 3 === 0 ? 1 : 0,
      decoys: n < 21 ? 0 : 1 + Math.floor((n - 21) / 40),
      walls: n < 6 ? 0 : Math.min(0.14, 0.04 + n * 0.0008),
      extraGems: n < 3 ? 0 : n < 20 ? 1 : 2,
    });
    if (w === 1) cfg.mines = 1 + Math.floor(k / 7);
    if (w === 2) {
      cfg.splitters = 1;
      cfg.mines = k % 3 === 2 ? 1 : 0;
    }
    if (w === 3) {
      cfg.portals = 1;
      cfg.splitters = k % 4 === 3 ? 1 : 0;
      cfg.mines = k % 3 === 1 ? 1 : 0;
    }
    if (w >= 4) {
      cfg.splitters = k % 2 === 0 ? 1 : w === 5 && k % 4 === 1 ? 2 : 0;
      cfg.portals = k % 3 === 1 ? 1 : 0;
      cfg.mines = 1 + (k % 3 === 2 ? 1 : 0) + (w === 5 ? 1 : 0);
    }
    // The first two levels of a world teach its new piece on a calmer board.
    if (w >= 1 && k < 2) {
      cfg.turns = Math.max(2, cfg.turns - 2);
      cfg.fixed = 0;
      cfg.decoys = 0;
      cfg.walls = Math.min(cfg.walls, 0.06);
      cfg.mines = Math.min(cfg.mines, 2);
    }
    return cfg;
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
    hashString, mulberry32, reflect, mirrorFor, isSplitter, splitterShape, trace, generate,
    dateKey, parseKey, puzzleNumber, levelForKey, daily,
    WORLDS, WORLD_FEATURES, LEVELS_PER_WORLD, CAMPAIGN_SIZE, campaignConfig, campaign,
  };
});
