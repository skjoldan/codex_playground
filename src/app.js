(async function () {
  'use strict';
  const B = window.Beamline;
  const P = window.Platform;
  const A = window.Sfx;
  const S = 10; // svg units per cell
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);

  await P.init();

  // ---- persistence ---------------------------------------------------------
  const STORE_KEY = 'beamline:v2';
  const store = (() => {
    const base = { levels: {}, daily: {}, hints: 3, cleared: 0, tips: {}, muted: false };
    try { return Object.assign(base, JSON.parse(P.storage.get(STORE_KEY) || '{}')); } catch (e) { return base; }
  })();
  const save = () => P.storage.set(STORE_KEY, JSON.stringify(store));

  A.setMuted(store.muted);
  P.on('pause', () => A.setAdMuted(true));
  P.on('resume', () => A.setAdMuted(false));

  // ---- screens & overlays --------------------------------------------------
  const screens = ['menu', 'levels', 'game'];
  let current = 'menu';
  function show(name) {
    current = name;
    screens.forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== name));
    if (name !== 'game') P.gameplayStop();
    if (name === 'menu') renderMenu();
    if (name === 'levels') renderLevels();
  }
  const overlay = (id, on) => $(id).classList.toggle('hidden', !on);
  const overlayOpen = () => document.querySelector('.overlay:not(.hidden)');

  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { A.click(); show(b.dataset.go); }));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerdown', () => A.unlock(), { once: true });

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 1900);
  }

  function updateMuteBtn() {
    document.querySelectorAll('.mute-btn').forEach((b) => (b.textContent = store.muted ? '🔇' : '🔊'));
  }
  document.querySelectorAll('.mute-btn').forEach((b) => (b.onclick = () => {
    store.muted = !store.muted;
    A.setMuted(store.muted);
    A.click();
    updateMuteBtn();
    save();
  }));
  updateMuteBtn();

  // ---- progress helpers ----------------------------------------------------
  const stars = (n) => store.levels[n] || 0;
  const unlocked = (n) => n === 1 || stars(n - 1) > 0;
  const nextLevel = () => {
    for (let n = 1; n <= B.CAMPAIGN_SIZE; n++) if (!stars(n)) return n;
    return B.CAMPAIGN_SIZE;
  };
  const totalStars = () => Object.values(store.levels).reduce((a, b) => a + b, 0);
  const todayKey = () => B.dateKey(new Date());

  function dailyStreak() {
    const d = new Date();
    if (!store.daily[B.dateKey(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    while (store.daily[B.dateKey(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  // ---- menu & level select -------------------------------------------------
  function renderMenu() {
    const nl = nextLevel();
    $('btn-play').textContent = stars(1) ? `Continue · Level ${nl}` : 'Play';
    $('daily-badge').classList.toggle('hidden', !!store.daily[todayKey()]);
    const streak = dailyStreak();
    $('menu-stats').innerHTML =
      `<span>★ ${totalStars()} / ${B.CAMPAIGN_SIZE * 3}</span>` +
      (streak ? `<span>🔥 ${streak}-day streak</span>` : '');
  }

  let worldTab = 0;
  function renderLevels() {
    $('star-total').textContent = `★ ${totalStars()}`;
    const L = B.LEVELS_PER_WORLD;
    $('world-tabs').innerHTML = B.WORLDS.map((w, k) => {
      let st = 0;
      for (let n = k * L + 1; n <= (k + 1) * L; n++) st += stars(n);
      const locked = !unlocked(k * L + 1);
      return `<button class="world ${k === worldTab ? 'on' : ''} ${locked ? 'locked' : ''}" data-w="${k}">
        <b>${locked ? '🔒 ' : ''}${w}</b><small>★ ${st}/${L * 3}</small></button>`;
    }).join('');
    $('world-tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => {
      A.click();
      worldTab = Number(b.dataset.w);
      renderLevels();
    }));
    const cells = [];
    for (let n = worldTab * L + 1; n <= (worldTab + 1) * L; n++) {
      const s = stars(n);
      const lock = !unlocked(n);
      cells.push(`<button class="lvl ${lock ? 'locked' : ''} ${s ? 'done' : ''} ${n === nextLevel() ? 'next' : ''}" data-n="${n}" ${lock ? 'disabled' : ''}>
        <b>${lock ? '🔒' : n}</b><small>${lock ? '' : '★'.repeat(s) + '<i>' + '★'.repeat(3 - s) + '</i>'}</small></button>`);
    }
    $('level-grid').innerHTML = cells.join('');
    $('level-grid').querySelectorAll('button:not([disabled])').forEach((b) => (b.onclick = () => {
      A.click();
      startCampaign(Number(b.dataset.n));
    }));
  }

  $('btn-play').onclick = () => { A.click(); startCampaign(nextLevel()); };
  $('btn-levels').onclick = () => {
    A.click();
    worldTab = Math.floor((nextLevel() - 1) / B.LEVELS_PER_WORLD);
    show('levels');
  };
  $('btn-daily').onclick = () => { A.click(); startDaily(); };

  // ---- game session --------------------------------------------------------
  let mode = 'campaign';
  let puzzle = null;
  let N = 0;
  let placed = new Map();
  let hinted = new Set();
  let undoStack = [];
  let moves = 0;
  let usedHint = false;
  let solved = false;
  let cursor = -1;
  let prevLit = new Set();
  let lastBeamSig = '';

  function startCampaign(n) {
    mode = 'campaign';
    loadPuzzle(B.campaign(n));
    $('game-title').textContent = `Level ${n}`;
    $('btn-back').setAttribute('aria-label', 'Back to levels');
  }

  function startDaily() {
    mode = 'daily';
    const key = todayKey();
    loadPuzzle(B.daily(key));
    $('game-title').textContent = `Daily #${puzzle.number}`;
    if (store.daily[key]) toast('Already solved today — play it again for fun!');
  }

  function resetState() {
    placed = new Map();
    hinted = new Set();
    undoStack = [];
    moves = 0;
    usedHint = false;
    solved = false;
    cursor = -1;
    prevLit = new Set();
    lastBeamSig = '';
  }

  function loadPuzzle(p) {
    puzzle = p;
    N = p.size;
    resetState();
    buildBoard();
    show('game');
    showTip();
    update(true);
    P.gameplayStart();
  }

  // ---- tips (first-time teaching) -----------------------------------------
  const TIPS = [
    ['tap', () => true, 'Tap a cell to place a mirror. Tap again to flip it, once more to remove it.'],
    ['gems', () => true, 'Light every gem ◆ to clear the level.'],
    ['par', () => puzzle.mirrors > 1, 'Each new mirror you place counts. Use no more than you have for ★★★.'],
    ['walls', () => puzzle.grid.includes('#'), 'Walls block the beam.'],
    ['fixed', () => puzzle.grid.some((c) => c === '/' || c === '\\'), 'Grey mirrors are fixed in place — use them, or work around them.'],
    ['hint', () => mode === 'campaign' && puzzle.campaignLevel >= 8, 'Stuck? A hint reveals one mirror (max ★★ when used).'],
  ];
  function showTip() {
    const tip = TIPS.find(([id, when]) => !store.tips[id] && when());
    $('tip').classList.toggle('hidden', !tip);
    if (tip) {
      $('tip').innerHTML = tip[2];
      store.tips[tip[0]] = 1;
      save();
    }
  }

  // ---- board rendering -----------------------------------------------------
  const board = $('board');
  let layerBeam, layerPieces, layerFx;
  let cellRects = [];
  const gemEls = new Map();

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const cx = (c) => (c + 1.5) * S;
  const cy = (r) => (r + 1.5) * S;

  function mirrorLine(parent, r, c, m, cls) {
    const x = cx(c);
    const y = cy(r);
    const k = 3.6;
    const pts = m === '/' ? [x - k, y + k, x + k, y - k] : [x - k, y - k, x + k, y + k];
    el('line', { x1: pts[0], y1: pts[1], x2: pts[2], y2: pts[3], class: cls }, parent);
  }

  function buildBoard() {
    board.textContent = '';
    board.classList.remove('won');
    const size = (N + 2) * S;
    board.setAttribute('viewBox', `0 0 ${size} ${size}`);
    el('defs', {}, board).innerHTML = `
      <filter id="glow-beam" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>
      <filter id="glow-gem" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`;
    const layerCells = el('g', {}, board);
    layerBeam = el('g', { 'pointer-events': 'none' }, board);
    layerPieces = el('g', { 'pointer-events': 'none' }, board);
    layerFx = el('g', { 'pointer-events': 'none' }, board);
    cellRects = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        const ch = puzzle.grid[i];
        const g = el('g', { class: 'enter', style: `animation-delay:${(r + c) * 22}ms` }, layerCells);
        cellRects.push(el('rect', {
          x: (c + 1) * S, y: (r + 1) * S, width: S, height: S,
          class: 'cell' + (ch === '.' ? ' can' : ''), 'data-i': i,
        }, g));
        if (ch === '#') {
          el('rect', { x: (c + 1) * S + 0.8, y: (r + 1) * S + 0.8, width: S - 1.6, height: S - 1.6, rx: 1.2, class: 'wall', 'pointer-events': 'none' }, g);
          const x0 = (c + 1) * S + 0.8;
          const y0 = (r + 1) * S;
          for (const f of [0.37, 0.63]) el('line', { x1: x0, y1: y0 + S * f, x2: x0 + S - 1.6, y2: y0 + S * f, class: 'wall-hatch' }, g);
          el('line', { x1: x0 + S * 0.42, y1: y0 + S * 0.37, x2: x0 + S * 0.42, y2: y0 + S * 0.63, class: 'wall-hatch' }, g);
        }
      }
    }
    const e = puzzle.emitter;
    const ex = cx(e.c);
    const ey = cy(e.r);
    el('path', {
      d: `M${ex - 3} ${ey - 3.2} L${ex + 3.4} ${ey} L${ex - 3} ${ey + 3.2} Z`,
      class: 'emitter', transform: `rotate(${[270, 0, 90, 180][e.dir]} ${ex} ${ey})`,
    }, layerCells);
  }

  function renderPieces() {
    layerPieces.textContent = '';
    gemEls.clear();
    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N);
      const c = i % N;
      const ch = puzzle.grid[i];
      if (ch === '*') {
        const x = cx(c);
        const y = cy(r);
        gemEls.set(i, el('path', { d: `M${x} ${y - 3.2} L${x + 3.2} ${y} L${x} ${y + 3.2} L${x - 3.2} ${y} Z`, class: 'gem', style: `transform-origin:${x}px ${y}px` }, layerPieces));
      } else if (ch === '/' || ch === '\\') {
        mirrorLine(layerPieces, r, c, ch, 'mirror fixed');
        el('circle', { cx: cx(c), cy: cy(r), r: 0.9, class: 'mirror-pin' }, layerPieces);
      } else if (placed.has(i)) {
        mirrorLine(layerPieces, r, c, placed.get(i), hinted.has(i) ? 'mirror hinted' : 'mirror');
        if (hinted.has(i)) el('circle', { cx: cx(c), cy: cy(r), r: 0.9, class: 'hint-pin' }, layerPieces);
      }
    }
  }

  function renderBeam(t) {
    const pts = t.points.map(([r, c]) => [cx(c), cy(r)]);
    const last = pts[pts.length - 1];
    if (t.end === 'wall') {
      last[0] -= B.DC[t.endDir] * S * 0.5;
      last[1] -= B.DR[t.endDir] * S * 0.5;
    }
    const sig = pts.join(';');
    const animate = sig !== lastBeamSig;
    lastBeamSig = sig;
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]);
    layerBeam.textContent = '';
    const attr = pts.map((p) => p.join(',')).join(' ');
    for (const cls of ['beam-glow', 'beam-core']) {
      const pl = el('polyline', { points: attr, class: cls }, layerBeam);
      if (animate) {
        pl.style.strokeDasharray = len;
        pl.style.setProperty('--len', len);
        pl.classList.add('beam-anim');
      }
    }
    if (t.end === 'wall') el('circle', { cx: last[0], cy: last[1], r: 1.4, class: 'hit' }, layerBeam);
  }

  function sparkle(i, count) {
    const x = cx(i % N);
    const y = cy(Math.floor(i / N));
    for (let k = 0; k < count; k++) {
      const a = (Math.PI * 2 * k) / count + Math.random() * 0.5;
      const d = 6 + Math.random() * 6;
      const s = el('circle', { cx: x, cy: y, r: 0.7 + Math.random() * 0.6, class: 'spark' }, layerFx);
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
      setTimeout(() => s.remove(), 900);
    }
  }

  // ---- update loop ---------------------------------------------------------
  function update(silent) {
    const t = B.trace(puzzle, placed);
    renderPieces();
    renderBeam(t);
    let k = prevLit.size;
    gemEls.forEach((g, i) => {
      const on = t.lit.has(i);
      g.classList.toggle('lit', on);
      if (on && !prevLit.has(i) && !silent) {
        g.classList.add('pop');
        const j = k++;
        setTimeout(() => A.gem(j), 70 * (j - prevLit.size));
        sparkle(i, 5);
      }
    });
    prevLit = t.lit;
    cellRects.forEach((rc, i) => rc.classList.toggle('cursor', i === cursor));

    const left = puzzle.mirrors - placed.size;
    $('hud-mirrors').textContent = left;
    $('pill-mirrors').classList.toggle('warn', left === 0 && !solved);
    $('hud-gems').textContent = `${t.lit.size}/${puzzle.gemCount}`;
    $('hud-moves').textContent = moves;
    $('hud-par').textContent = `par ${puzzle.mirrors}`;
    $('btn-undo').disabled = solved || !undoStack.length;
    $('btn-hint').disabled = solved;
    $('hint-count').textContent = store.hints > 0 ? store.hints : '▶';

    if (t.solved && !solved) win(t);
  }

  function shake(msg) {
    board.classList.remove('shake');
    void board.getBoundingClientRect();
    board.classList.add('shake');
    A.error();
    if (msg) toast(msg);
  }

  function tap(i) {
    if (solved || overlayOpen()) return;
    if (puzzle.grid[i] !== '.') return shake();
    if (hinted.has(i)) return shake('Hint mirrors are locked');
    const cur = placed.get(i);
    if (!cur && placed.size >= puzzle.mirrors) return shake('No mirrors left — flip or remove one');
    undoStack.push(new Map(placed));
    if (!cur) {
      placed.set(i, '/');
      moves++;
      A.place();
    } else if (cur === '/') {
      placed.set(i, '\\');
      A.flip();
    } else {
      placed.delete(i);
      A.remove();
    }
    update();
  }

  board.addEventListener('pointerdown', (ev) => {
    const i = ev.target.getAttribute && ev.target.getAttribute('data-i');
    if (i !== null && i !== undefined) {
      ev.preventDefault();
      cursor = -1;
      tap(Number(i));
    }
  });

  $('btn-undo').onclick = () => {
    if (!undoStack.length || solved) return;
    placed = undoStack.pop();
    A.remove();
    update();
  };
  $('btn-restart').onclick = () => {
    if (solved) return;
    A.click();
    const keep = new Map([...placed].filter(([i]) => hinted.has(i)));
    if (placed.size === keep.size && moves === 0) return;
    undoStack = [];
    placed = keep;
    moves = 0;
    update();
  };
  $('btn-back').onclick = () => {
    A.click();
    if (mode === 'daily') return show('menu');
    worldTab = puzzle.world;
    show('levels');
  };

  // ---- hints ---------------------------------------------------------------
  function hintTarget() {
    return puzzle.solution.find(({ r, c, m }) => {
      const i = r * N + c;
      return !hinted.has(i) || placed.get(i) !== m;
    });
  }

  function applyHint() {
    const target = hintTarget();
    if (!target) return;
    const i = target.r * N + target.c;
    const sol = new Set(puzzle.solution.map(({ r, c }) => r * N + c));
    if (!placed.has(i) && placed.size >= puzzle.mirrors) {
      const wrong = [...placed.keys()].find((j) => !sol.has(j) && !hinted.has(j));
      if (wrong !== undefined) placed.delete(wrong);
    }
    placed.set(i, target.m);
    hinted.add(i);
    usedHint = true;
    undoStack = [];
    A.hint();
    sparkle(i, 8);
    update();
  }

  $('btn-hint').onclick = () => {
    if (solved) return;
    A.click();
    if (!hintTarget()) return toast('No more hints for this level');
    if (store.hints > 0) {
      store.hints--;
      save();
      applyHint();
      return;
    }
    P.gameplayStop();
    overlay('ov-hint', true);
  };
  $('btn-hint-cancel').onclick = () => {
    A.click();
    overlay('ov-hint', false);
    P.gameplayStart();
  };
  $('btn-hint-watch').onclick = async () => {
    overlay('ov-hint', false);
    overlay('ov-ad', true);
    const ok = await P.rewarded();
    overlay('ov-ad', false);
    P.gameplayStart();
    if (ok) {
      applyHint();
      toast('Hint revealed!');
    } else {
      toast('No video available right now — try again soon');
    }
  };

  // ---- winning -------------------------------------------------------------
  function starsFor() {
    const s = moves <= puzzle.mirrors ? 3 : moves <= puzzle.mirrors + 2 ? 2 : 1;
    return usedHint ? Math.min(2, s) : s;
  }

  function win(t) {
    solved = true;
    P.gameplayStop();
    board.classList.add('won');
    t.lit.forEach((i) => sparkle(i, 10));
    const s = starsFor();
    A.win(s);
    let extra = '';

    if (mode === 'campaign') {
      const n = puzzle.campaignLevel;
      const first = !store.levels[n];
      store.levels[n] = Math.max(stars(n), s);
      if (first) {
        store.cleared++;
        if (store.cleared % 5 === 0) {
          store.hints++;
          extra = '+1 free hint!';
        }
        if (n % B.LEVELS_PER_WORLD === 0 && n < B.CAMPAIGN_SIZE) extra = `World ${B.WORLDS[n / B.LEVELS_PER_WORLD]} unlocked!`;
      }
    } else {
      const key = puzzle.dateKey;
      store.daily[key] = Math.max(store.daily[key] || 0, s);
      extra = `🔥 ${dailyStreak()}-day streak · new daily puzzle tomorrow`;
    }
    save();
    if (s === 3) P.happytime();
    const solvedPuzzle = puzzle;
    setTimeout(() => {
      if (current === 'game' && puzzle === solvedPuzzle) openWin(s, extra);
    }, 850);
  }

  function openWin(s, extra) {
    const last = mode === 'campaign' && puzzle.campaignLevel === B.CAMPAIGN_SIZE;
    $('win-title').textContent = last ? 'You beat Beamline!' : ['', 'Solved!', 'Nicely done!', moves < puzzle.mirrors ? 'Under par!' : 'Perfect beam!'][s];
    $('win-line').textContent = `${moves} placed · par ${puzzle.mirrors}${usedHint ? ' · hint used' : ''}`;
    $('win-extra').textContent = extra;
    $('win-extra').classList.toggle('hidden', !extra);
    $('btn-next').textContent = mode === 'daily' ? 'Play levels' : last ? 'All levels' : 'Next level';
    const starEls = $('win-stars').children;
    [...starEls].forEach((e) => e.classList.remove('on'));
    overlay('ov-win', true);
    for (let k = 0; k < s; k++) {
      setTimeout(() => { starEls[k].classList.add('on'); A.star(k); }, 250 + k * 280);
    }
  }

  async function breakThen(fn) {
    overlay('ov-win', false);
    if (P.kind !== 'web') overlay('ov-ad', true);
    await P.midgame();
    overlay('ov-ad', false);
    fn();
  }

  $('btn-next').onclick = () => {
    A.click();
    if (mode === 'daily') return breakThen(() => startCampaign(nextLevel()));
    const n = puzzle.campaignLevel;
    if (n >= B.CAMPAIGN_SIZE) {
      overlay('ov-win', false);
      return show('levels');
    }
    breakThen(() => startCampaign(n + 1));
  };
  $('btn-replay').onclick = () => {
    A.click();
    breakThen(() => (mode === 'daily' ? startDaily() : startCampaign(puzzle.campaignLevel)));
  };
  $('btn-win-levels').onclick = () => {
    A.click();
    overlay('ov-win', false);
    if (mode === 'campaign') worldTab = puzzle.world;
    show('levels');
  };

  // ---- keyboard ------------------------------------------------------------
  document.addEventListener('keydown', (ev) => {
    const k = ev.key;
    // Never let the host page scroll inside the portal iframe.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) ev.preventDefault();
    if (current !== 'game' || overlayOpen()) {
      if (k === 'Enter' && !$('ov-win').classList.contains('hidden')) $('btn-next').click();
      return;
    }
    if (k === 'z' || k === 'u' || k === 'Backspace') return $('btn-undo').click();
    if (k === 'r') return $('btn-restart').click();
    if (k === 'h') return $('btn-hint').click();
    if (k === 'Escape') return $('btn-back').click();
    const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
    if (move) {
      if (cursor < 0) cursor = Math.floor(N / 2) * N + Math.floor(N / 2);
      else {
        const r = Math.min(N - 1, Math.max(0, Math.floor(cursor / N) + move[0]));
        const c = Math.min(N - 1, Math.max(0, (cursor % N) + move[1]));
        cursor = r * N + c;
      }
      update(true);
    } else if ((k === ' ' || k === 'Enter') && cursor >= 0) {
      tap(cursor);
    }
  });

  // ---- boot ----------------------------------------------------------------
  show('menu');
  P.loadingDone();
})();
