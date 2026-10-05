const test = require('node:test');
const assert = require('node:assert');
const B = require('../src/engine.js');

function solutionMap(p) {
  return new Map(p.solution.map(({ r, c, m }) => [r * p.size + c, m]));
}

function addDays(key, n) {
  const d = B.parseKey(key);
  d.setDate(d.getDate() + n);
  return B.dateKey(d);
}

test('mirrors reflect correctly', () => {
  // '/' : up->right, right->up, down->left, left->down
  assert.deepStrictEqual([0, 1, 2, 3].map((d) => B.reflect('/', d)), [1, 0, 3, 2]);
  // '\' : up->left, right->down, down->right, left->up
  assert.deepStrictEqual([0, 1, 2, 3].map((d) => B.reflect('\\', d)), [3, 2, 1, 0]);
  for (let d = 0; d < 4; d++) {
    for (const nd of [(d + 1) % 4, (d + 3) % 4]) assert.strictEqual(B.reflect(B.mirrorFor(d, nd), d), nd);
  }
});

test('trace stops at walls and lights gems it passes', () => {
  const p = {
    size: 3,
    grid: ['.', '*', '.', '.', '#', '.', '.', '.', '.'],
    emitter: { r: -1, c: 1, dir: 2 },
    gemCount: 1,
  };
  const t = B.trace(p, new Map());
  assert.strictEqual(t.beams[0].end, 'wall');
  assert.ok(t.solved);
  assert.deepStrictEqual(t.beams[0].points, [[-1, 1], [1, 1]]);
});

test('splitters fork the beam, portals teleport it, mines fail the board', () => {
  // Beam enters top of column 1, hits a '\'-splitter at (1,1): one branch goes right, one continues down.
  const split = {
    size: 3,
    grid: ['.', '.', '.', '.', 'Z', '*', '.', '*', '.'],
    emitter: { r: -1, c: 1, dir: 2 },
    portals: [],
    gemCount: 2,
  };
  const t = B.trace(split, new Map());
  assert.strictEqual(t.beams.length, 2);
  assert.ok(t.solved);

  // Portal at (0,0) sends the beam to (2,0); it continues right through a gem at (2,2).
  const portal = {
    size: 3,
    grid: ['@', '.', '.', '.', '.', '.', '@', '.', '*'],
    emitter: { r: 0, c: -1, dir: 1 },
    portals: [0, 6],
    gemCount: 1,
  };
  const tp = B.trace(portal, new Map());
  assert.ok(tp.solved);
  assert.deepStrictEqual(tp.beams.map((b) => b.end), ['portal', 'exit']);

  const mine = Object.assign({}, split, { grid: ['.', '.', '.', '.', 'Z', '*', '.', 'x', '.'], gemCount: 1 });
  const tm = B.trace(mine, new Map());
  assert.strictEqual(tm.mineHit, 7);
  assert.ok(!tm.solved, 'all gems lit but a mine was hit');
});

test('generation is deterministic', () => {
  assert.deepStrictEqual(B.generate('abc', 5), B.generate('abc', 5));
  assert.notDeepStrictEqual(B.generate('abc', 5).grid, B.generate('abd', 5).grid);
});

test('two years of dailies: solvable, unsolved at start, correct mirror budget', () => {
  let key = '2026-10-05';
  for (let n = 0; n < 730; n++, key = addDays(key, 1)) {
    const p = B.daily(key);
    assert.strictEqual(p.number, n + 1, key);
    assert.ok(!B.trace(p, new Map()).solved, `${key} solved with no mirrors`);
    assert.ok(B.trace(p, solutionMap(p)).solved, `${key} intended solution fails`);
    assert.strictEqual(p.mirrors, p.solution.length);
    for (const { r, c } of p.solution) assert.strictEqual(p.grid[r * p.size + c], '.');
  }
});

test('weekday drives difficulty', () => {
  assert.strictEqual(B.levelForKey('2026-10-05'), 1); // Monday
  assert.strictEqual(B.levelForKey('2026-10-11'), 7); // Sunday
});

test('practice seeds work at every level', () => {
  for (let lv = 1; lv <= 7; lv++) {
    for (let s = 0; s < 200; s++) {
      const p = B.generate('practice:' + s, lv);
      assert.ok(B.trace(p, solutionMap(p)).solved);
    }
  }
});

test('campaign: every level generates, is solvable and uses its world\'s pieces', () => {
  for (let n = 1; n <= B.CAMPAIGN_SIZE; n++) {
    const p = B.campaign(n);
    const cfg = B.campaignConfig(n);
    assert.ok(!B.trace(p, new Map()).solved, `level ${n} solved with no mirrors`);
    assert.ok(B.trace(p, solutionMap(p)).solved, `level ${n} intended solution fails`);
    assert.ok(p.mirrors >= 1, `level ${n} needs no mirrors`);
    const count = (ch) => p.grid.filter((c) => c === ch).length;
    assert.strictEqual(count('S') + count('Z'), cfg.splitters, `level ${n} splitters`);
    assert.strictEqual(count('@'), cfg.portals * 2, `level ${n} portals`);
    assert.ok(count('x') <= cfg.mines, `level ${n} mines`);
  }
  assert.strictEqual(B.campaign(1).mirrors, 1);
  assert.ok(B.campaign(21).grid.includes('x'), 'Glint introduces mines');
  assert.ok(B.campaign(41).grid.some((c) => c === 'S' || c === 'Z'), 'Prism introduces splitters');
  assert.ok(B.campaign(61).grid.includes('@'), 'Nova introduces portals');
  assert.deepStrictEqual(B.campaign(57), B.campaign(57));
});

test('difficulty curve: curated levels get gradually harder and stop being readable at a glance', () => {
  const D = require('../scripts/difficulty.js');
  assert.strictEqual(require('../src/levels.js').length, B.CAMPAIGN_SIZE, 'run node scripts/curate.js');
  const scores = [];
  for (let n = 1; n <= B.CAMPAIGN_SIZE; n++) scores.push(D.score(B.campaign(n), 3000));
  const avg = (a, b) => scores.slice(a, b).reduce((x, y) => x + y, 0) / (b - a);
  const worlds = B.WORLDS.map((_, w) => avg(w * 20, w * 20 + 20));
  for (let w = 1; w < worlds.length; w++) assert.ok(worlds[w] > worlds[w - 1], `world ${w} not harder: ${worlds.map((x) => x.toFixed(1))}`);
  // Only the tutorial and the odd breather may be solvable by greedy reading.
  const trivial = scores.map((s, i) => (s === 0 ? i + 1 : 0)).filter((n) => n > 5);
  assert.ok(trivial.length <= 3, `too many trivial levels: ${trivial}`);
  assert.ok(scores.slice(5, 20).every((s) => s > 0), 'levels 6-20 must need more than greedy reading');
});
