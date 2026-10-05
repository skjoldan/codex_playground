// Difficulty measurement for generated boards (Node only; used by curate.js and the tests).
//
// Model: a player who always tries the most promising move first — the mirror that lights the most
// gems right now — and backtracks when they run out of mirrors. `effort` is how many placements that
// player tries before solving the board. A board the greedy reading solves outright costs exactly
// `mirrors` placements; every tempting dead end adds to it.
const B = require('../src/engine.js');

function beamCells(p, placed) {
  const N = p.size;
  const cells = new Set();
  for (const b of B.trace(p, placed).beams) {
    for (let k = 1; k < b.points.length; k++) {
      let [r, c] = b.points[k - 1];
      const [r2, c2] = b.points[k];
      const dr = Math.sign(r2 - r);
      const dc = Math.sign(c2 - c);
      while (r !== r2 || c !== c2) {
        r += dr;
        c += dc;
        const i = r * N + c;
        if (r >= 0 && c >= 0 && r < N && c < N && p.grid[i] === '.' && !placed.has(i)) cells.add(i);
      }
    }
  }
  return [...cells];
}

function effort(p, cap = 3000) {
  let tries = 0;
  const seen = new Set();
  function dfs(placed) {
    if (B.trace(p, placed).solved) return true;
    if (placed.size >= p.mirrors) return false;
    const moves = [];
    for (const i of beamCells(p, placed)) {
      for (const m of ['/', '\\']) {
        const q = new Map(placed);
        q.set(i, m);
        const key = [...q].sort((a, b) => a[0] - b[0]).join(';');
        if (seen.has(key)) continue;
        seen.add(key);
        const t = B.trace(p, q);
        moves.push({ q, score: t.lit.size - (t.mineHit !== null ? 100 : 0) });
      }
    }
    moves.sort((a, b) => b.score - a.score);
    for (const mv of moves) {
      if (++tries > cap) return false;
      if (dfs(mv.q)) return true;
    }
    return false;
  }
  const solved = dfs(new Map());
  return { tries: Math.min(tries, cap), capped: !solved };
}

// One number per board: 0 = solved by pure greedy reading; grows roughly with log2 of wasted tries.
function score(p, cap) {
  const e = effort(p, cap);
  return Math.log2(1 + Math.max(0, e.tries - p.mirrors)) + (e.capped ? 2 : 0);
}

module.exports = { effort, score, beamCells };
