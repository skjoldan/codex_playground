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
  assert.strictEqual(t.end, 'wall');
  assert.ok(t.solved);
  assert.deepStrictEqual(t.points, [[-1, 1], [1, 1]]);
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
    assert.strictEqual(p.mirrors, B.LEVELS[p.level - 1].turns - B.LEVELS[p.level - 1].fixed);
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
