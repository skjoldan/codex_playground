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
    const base = { levels: {}, skipped: {}, daily: {}, hints: 3, cleared: 0, tips: {}, seen: {}, muted: false, music: true };
    try { return Object.assign(base, JSON.parse(P.storage.get(STORE_KEY) || '{}')); } catch (e) { return base; }
  })();
  const save = () => P.storage.set(STORE_KEY, JSON.stringify(store));

  A.setMuted(store.muted);
  A.setMusic(store.music);
  P.on('pause', () => A.setAdMuted(true));
  P.on('resume', () => A.setAdMuted(false));

  // ---- screens & overlays --------------------------------------------------
  const screens = ['menu', 'levels', 'game'];
  let current = null;
  function show(name) {
    current = name;
    screens.forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== name));
    if (name !== 'game') {
      P.gameplayStop();
      setWorldTheme(name === 'levels' ? worldTab : 0);
    }
    if (name === 'menu') renderMenu();
    if (name === 'levels') renderLevels();
  }
  const overlay = (id, on) => $(id).classList.toggle('hidden', !on);
  const overlayOpen = () => document.querySelector('.overlay:not(.hidden)');
  const setWorldTheme = (w) => (document.body.dataset.world = String(w));

  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { A.click(); show(b.dataset.go); }));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerdown', () => A.unlock(), { once: true });
  document.addEventListener('keydown', () => A.unlock(), { once: true });

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 1900);
  }

  function updateAudioBtns() {
    document.querySelectorAll('.mute-btn').forEach((b) => (b.textContent = store.muted ? '🔇' : '🔊'));
    document.querySelectorAll('.music-btn').forEach((b) => b.classList.toggle('off', !store.music));
  }
  document.querySelectorAll('.mute-btn').forEach((b) => (b.onclick = () => {
    store.muted = !store.muted;
    A.setMuted(store.muted);
    A.click();
    updateAudioBtns();
    save();
  }));
  document.querySelectorAll('.music-btn').forEach((b) => (b.onclick = () => {
    store.music = !store.music;
    A.setMusic(store.music);
    A.click();
    updateAudioBtns();
    save();
  }));
  updateAudioBtns();

  // ---- progress helpers ----------------------------------------------------
  const stars = (n) => store.levels[n] || 0;
  const cleared = (n) => stars(n) > 0 || !!store.skipped[n];
  const unlocked = (n) => n === 1 || cleared(n - 1);
  const nextLevel = () => {
    for (let n = 1; n <= B.CAMPAIGN_SIZE; n++) if (!cleared(n)) return n;
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
    $('btn-play').textContent = cleared(1) ? `Continue · Level ${nl}` : 'Play';
    const newDaily = !store.daily[todayKey()];
    $('daily-badge').classList.toggle('hidden', !newDaily);
    const streak = dailyStreak();
    $('menu-stats').innerHTML =
      `<span>★ ${totalStars()} / ${B.CAMPAIGN_SIZE * 3}</span>` +
      (streak ? `<span>🔥 ${streak}-day streak</span>` : '');
  }

  let worldTab = 0;
  function renderLevels() {
    setWorldTheme(worldTab);
    $('star-total').textContent = `★ ${totalStars()}`;
    $('daily-badge-2').classList.toggle('hidden', !!store.daily[todayKey()]);
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
    const nl = nextLevel();
    for (let n = worldTab * L + 1; n <= (worldTab + 1) * L; n++) {
      const s = stars(n);
      const lock = !unlocked(n);
      const skipped = !s && store.skipped[n];
      const isNew = (n - 1) % L === 0 && B.WORLD_FEATURES[worldTab];
      cells.push(`<button class="lvl ${lock ? 'locked' : ''} ${s ? 'done' : ''} ${skipped ? 'skipped' : ''} ${n === nl ? 'next' : ''}" data-n="${n}" ${lock ? 'disabled' : ''}>
        ${isNew && !lock ? '<span class="newpiece">NEW</span>' : ''}
        <b>${lock ? '🔒' : n}</b><small>${lock ? '' : skipped ? 'skipped' : '★'.repeat(s) + '<i>' + '★'.repeat(3 - s) + '</i>'}</small></button>`);
    }
    $('level-grid').innerHTML = cells.join('');
    $('level-grid').querySelectorAll('button:not([disabled])').forEach((b) => (b.onclick = () => {
      A.click();
      startCampaign(Number(b.dataset.n));
    }));
  }

  const openLevels = () => {
    worldTab = Math.floor((nextLevel() - 1) / B.LEVELS_PER_WORLD);
    show('levels');
  };
  $('btn-play').onclick = () => { A.click(); startCampaign(nextLevel()); };
  $('btn-levels').onclick = () => { A.click(); openLevels(); };
  $('btn-daily').onclick = () => { A.click(); startDaily(); };
  $('btn-daily-2').onclick = () => { A.click(); startDaily(); };

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
  let prevMine = null;
  let lastBeamSig = '';

  function startCampaign(n) {
    mode = 'campaign';
    const p = B.campaign(n);
    setWorldTheme(p.world);
    $('game-title').textContent = `Level ${n}`;
    $('game-sub').textContent = `${p.levelName} · ${((n - 1) % B.LEVELS_PER_WORLD) + 1}/${B.LEVELS_PER_WORLD}`;
    loadPuzzle(p);
  }

  function startDaily() {
    mode = 'daily';
    const key = todayKey();
    setWorldTheme(0);
    const p = B.daily(key);
    $('game-title').textContent = `Daily #${p.number}`;
    $('game-sub').textContent = p.levelName;
    loadPuzzle(p);
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
    prevMine = null;
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
    if (!maybeShowFeature()) P.gameplayStart();
  }

  // ---- teaching: tips, pointer, new-piece cards ----------------------------
  const has = (ch) => puzzle.grid.includes(ch);
  const TIPS = [
    ['tap', () => true, 'Tap a cell to place a mirror. Tap again to flip it.'],
    ['gems', () => true, 'Light up every gem to wake them all!'],
    ['par', () => puzzle.mirrors > 1, 'Every new mirror counts. Use no more than you have for ★★★.'],
    ['walls', () => has('#'), 'Walls block the beam.'],
    ['fixed', () => has('/') || has('\\'), 'Grey mirrors are fixed in place — use them, or work around them.'],
    ['hint', () => mode === 'campaign' && puzzle.campaignLevel >= 8, 'Stuck? Hints reveal a mirror (max ★★ when used).'],
  ];
  function showTip() {
    const tip = TIPS.find(([id, when]) => !store.tips[id] && when());
    $('tip').classList.remove('bad');
    $('tip').classList.toggle('hidden', !tip);
    if (tip) {
      $('tip').textContent = tip[2];
      store.tips[tip[0]] = 1;
      save();
    }
  }

  // Animated finger on the first levels, until the player gets the idea.
  function pointerTarget() {
    if (mode !== 'campaign' || puzzle.campaignLevel > 2 || solved) return null;
    const next = puzzle.solution.find(({ r, c, m }) => placed.get(r * N + c) !== m);
    return next ? next.r * N + next.c : null;
  }

  const FEATURES = {
    mine: {
      present: () => has('x'),
      title: 'Mines',
      text: 'If the beam touches a mine, the level can’t be cleared. Steer around them!',
      art: () => `${beamArt('0,25 46,25')}<g transform="translate(55 25) scale(2.2)">${mineShape()}</g>
        <text x="80" y="29" font-size="12" fill="#ff4747">✕</text>`,
    },
    splitter: {
      present: () => has('S') || has('Z'),
      title: 'Splitters',
      text: 'Glass splitters bounce the beam AND let it pass straight through — two beams for the price of one!',
      art: () => `${beamArt('0,25 50,25 100,25')}${beamArt('50,25 50,0')}
        <line x1="42" y1="33" x2="58" y2="17" class="splitter-glass" style="stroke-width:6"/>
        <line x1="42" y1="33" x2="58" y2="17" class="splitter-core" style="stroke-width:1.5"/>`,
    },
    portal: {
      present: () => has('@'),
      title: 'Portals',
      text: 'The beam enters one portal and shoots out of the other, in the same direction.',
      art: () => `${beamArt('0,15 30,15')}${beamArt('70,35 100,35')}
        <g transform="translate(30 15) scale(2)">${portalShape()}</g><g transform="translate(70 35) scale(2)">${portalShape()}</g>
        <path d="M36 20 Q50 34 64 30" stroke="#c56bff" stroke-dasharray="2 2" fill="none" stroke-width="1"/>`,
    },
  };
  const beamArt = (pts) => `<polyline points="${pts}" class="beam-glow" style="stroke-width:5;filter:url(#glow-art)"/><polyline points="${pts}" class="beam-core" style="stroke-width:1.6"/>`;

  function maybeShowFeature() {
    const key = Object.keys(FEATURES).find((k) => !store.seen[k] && FEATURES[k].present());
    if (!key) return false;
    const f = FEATURES[key];
    store.seen[key] = 1;
    save();
    $('feature-title').textContent = f.title;
    $('feature-text').textContent = f.text;
    $('feature-art').innerHTML = '<defs><filter id="glow-art" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>' + f.art();
    A.whoosh();
    overlay('ov-feature', true);
    return true;
  }
  $('btn-feature-ok').onclick = () => {
    A.click();
    overlay('ov-feature', false);
    P.gameplayStart();
  };

  // ---- board rendering -----------------------------------------------------
  const board = $('board');
  let layerBeam, layerPieces, layerFx;
  let cellRects = [];
  const gemEls = new Map();
  const mineEls = new Map();

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const cx = (c) => (c + 1.5) * S;
  const cy = (r) => (r + 1.5) * S;

  function diagPts(r, c, m, k = 3.6) {
    const x = cx(c);
    const y = cy(r);
    return m === '/' ? { x1: x - k, y1: y + k, x2: x + k, y2: y - k } : { x1: x - k, y1: y - k, x2: x + k, y2: y + k };
  }
  function mirrorLine(parent, r, c, m, cls) {
    el('line', Object.assign(diagPts(r, c, m), { class: 'mirror-back' }), parent);
    el('line', Object.assign(diagPts(r, c, m), { class: cls }), parent);
  }

  // Piece shapes are drawn around (0,0) so they can be reused in the feature cards.
  function mineShape() {
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const a = (Math.PI * 2 * k) / 16;
      const rad = k % 2 ? 1.7 : 3.4;
      pts.push(`${(Math.cos(a) * rad).toFixed(2)},${(Math.sin(a) * rad).toFixed(2)}`);
    }
    return `<polygon class="mine-body" points="${pts.join(' ')}"/><circle class="mine-core" r="1"/>`;
  }
  function portalShape() {
    return '<circle class="portal-glow" r="3.6"/><circle class="portal-core" r="2.7"/><circle class="portal-ring" r="3.6"/>';
  }
  function gemShape() {
    const h = 3.7;
    const w = 3.2;
    return `<path class="gem" d="M0 ${-h} L${w} ${-h * 0.15} L0 ${h} L${-w} ${-h * 0.15} Z"/>
      <path class="gem-shine" d="M0 ${-h} L${-w} ${-h * 0.15} L${-w * 0.45} ${-h * 0.12} Z"/>
      <g class="face-sleep"><path d="M-1.6 .1 q.55 .4 1.1 0 M.5 .1 q.55 .4 1.1 0"/></g>
      <g class="face-happy">
        <circle cx="-1.05" cy="0" r=".62" fill="#fff"/><circle cx="1.05" cy="0" r=".62" fill="#fff"/>
        <circle cx="-.95" cy=".1" r=".36" fill="#14093a"/><circle cx="1.15" cy=".1" r=".36" fill="#14093a"/>
        <path d="M-.6 .9 Q0 1.7 .6 .9 Z" fill="#14093a"/>
      </g>`;
  }

  function buildBoard() {
    board.textContent = '';
    board.classList.remove('won', 'danger');
    const size = (N + 2) * S;
    board.setAttribute('viewBox', `0 0 ${size} ${size}`);
    el('defs', {}, board).innerHTML = `
      <filter id="glow-beam" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>`;
    const layerCells = el('g', {}, board);
    layerBeam = el('g', { 'pointer-events': 'none' }, board);
    layerPieces = el('g', { 'pointer-events': 'none' }, board);
    layerFx = el('g', { 'pointer-events': 'none' }, board);
    cellRects = [];
    gemEls.clear();
    mineEls.clear();
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
    // Static pieces (everything except player mirrors) live in their own layer under the beam's glow.
    const layerStatic = el('g', { 'pointer-events': 'none' }, layerCells);
    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N);
      const c = i % N;
      const ch = puzzle.grid[i];
      const at = `translate(${cx(c)} ${cy(r)})`;
      if (ch === '*') {
        const g = el('g', { transform: at }, layerStatic);
        gemEls.set(i, el('g', { class: 'gem-g' }, g));
        gemEls.get(i).innerHTML = gemShape();
      } else if (ch === 'x') {
        const g = el('g', { transform: at }, layerStatic);
        mineEls.set(i, el('g', { class: 'mine-g' }, g));
        mineEls.get(i).innerHTML = mineShape();
      } else if (ch === '@') {
        el('g', { transform: at }, layerStatic).innerHTML = portalShape();
      } else if (B.isSplitter(ch)) {
        const m = B.splitterShape(ch);
        el('rect', { x: cx(c) - 4, y: cy(r) - 4, width: 8, height: 8, rx: 1.5, class: 'splitter-ring' }, layerStatic);
        el('line', Object.assign(diagPts(r, c, m, 3.8), { class: 'splitter-glass' }), layerStatic);
        el('line', Object.assign(diagPts(r, c, m, 3.8), { class: 'splitter-core' }), layerStatic);
      } else if (ch === '/' || ch === '\\') {
        mirrorLine(layerStatic, r, c, ch, 'mirror fixed');
        el('circle', { cx: cx(c), cy: cy(r), r: 0.9, class: 'mirror-pin' }, layerStatic);
      }
    }
    const e = puzzle.emitter;
    const ex = cx(e.c);
    const ey = cy(e.r);
    const rot = [270, 0, 90, 180][e.dir];
    el('rect', { x: ex - 4, y: ey - 3, width: 6, height: 6, rx: 1.4, class: 'emitter-box', transform: `rotate(${rot} ${ex} ${ey})` }, layerCells);
    el('path', { d: `M${ex + 0.5} ${ey - 2.2} L${ex + 3.6} ${ey} L${ex + 0.5} ${ey + 2.2} Z`, class: 'emitter', transform: `rotate(${rot} ${ex} ${ey})` }, layerCells);
  }

  function renderPieces() {
    layerPieces.textContent = '';
    placed.forEach((m, i) => {
      const r = Math.floor(i / N);
      const c = i % N;
      mirrorLine(layerPieces, r, c, m, hinted.has(i) ? 'mirror hinted' : 'mirror');
      if (hinted.has(i)) el('circle', { cx: cx(c), cy: cy(r), r: 0.9, class: 'hint-pin' }, layerPieces);
    });
    const target = pointerTarget();
    if (target !== null) {
      const x = cx(target % N);
      const y = cy(Math.floor(target / N));
      const g = el('g', { class: 'pointer' }, layerPieces);
      el('circle', { cx: x, cy: y, r: 4, class: 'pointer-ring' }, g);
      const hand = el('text', { x: x - 1, y: y + 7.5, class: 'pointer-hand' }, g);
      hand.textContent = '👆';
    }
  }

  function renderBeams(t) {
    const all = t.beams.map((b) => {
      const pts = b.points.map(([r, c]) => [cx(c), cy(r)]);
      const last = pts[pts.length - 1];
      if (b.end === 'wall' || b.end === 'mine') {
        last[0] -= B.DC[b.endDir] * S * (b.end === 'wall' ? 0.5 : 0.3);
        last[1] -= B.DR[b.endDir] * S * (b.end === 'wall' ? 0.5 : 0.3);
      }
      return { pts, end: b.end };
    });
    const sig = all.map((b) => b.pts.join(';')).join('|');
    const animate = sig !== lastBeamSig;
    lastBeamSig = sig;
    layerBeam.textContent = '';
    for (const b of all) {
      let len = 0;
      for (let k = 1; k < b.pts.length; k++) len += Math.abs(b.pts[k][0] - b.pts[k - 1][0]) + Math.abs(b.pts[k][1] - b.pts[k - 1][1]);
      const attr = b.pts.map((p) => p.join(',')).join(' ');
      for (const cls of ['beam-glow', 'beam-core']) {
        const pl = el('polyline', { points: attr, class: cls }, layerBeam);
        if (animate) {
          pl.style.strokeDasharray = len + 0.01;
          pl.style.setProperty('--len', len);
          pl.classList.add('beam-anim');
        }
      }
      const last = b.pts[b.pts.length - 1];
      if (b.end === 'wall') el('circle', { cx: last[0], cy: last[1], r: 1.4, class: 'hit' }, layerBeam);
    }
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
    renderBeams(t);
    let k = prevLit.size;
    gemEls.forEach((g, i) => {
      const on = t.lit.has(i);
      g.classList.toggle('lit', on);
      if (on && !prevLit.has(i) && !silent) {
        g.classList.remove('pop');
        void g.getBoundingClientRect();
        g.classList.add('pop');
        const j = k++;
        setTimeout(() => A.gem(j), 70 * (j - prevLit.size));
        sparkle(i, 5);
      }
    });
    prevLit = t.lit;
    mineEls.forEach((m, i) => m.classList.toggle('boom', t.mineHit === i));
    board.classList.toggle('danger', t.mineHit !== null);
    if (t.mineHit !== null && t.mineHit !== prevMine && !silent) A.zap();
    if (t.mineHit !== null) {
      if (!store.tips.mineHit) {
        store.tips.mineHit = 1;
        save();
        $('tip').textContent = 'The beam hit a mine! Reroute it — the level can’t be cleared like this.';
        $('tip').classList.add('bad');
        $('tip').classList.remove('hidden');
      }
    }
    prevMine = t.mineHit;
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

  // ---- hints & skipping ----------------------------------------------------
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
    $('btn-skip-watch').classList.toggle('hidden', mode !== 'campaign');
    overlay('ov-hint', true);
  };
  $('btn-hint-cancel').onclick = () => {
    A.click();
    overlay('ov-hint', false);
    P.gameplayStart();
  };

  async function watch() {
    overlay('ov-hint', false);
    overlay('ov-ad', true);
    const ok = await P.rewarded();
    overlay('ov-ad', false);
    if (!ok) toast('No video available right now — try again soon');
    return ok;
  }
  $('btn-hint-watch').onclick = async () => {
    const ok = await watch();
    P.gameplayStart();
    if (ok) {
      applyHint();
      toast('Hint revealed!');
    }
  };
  $('btn-skip-watch').onclick = async () => {
    const ok = await watch();
    if (!ok) return P.gameplayStart();
    const n = puzzle.campaignLevel;
    store.skipped[n] = 1;
    save();
    toast(`Level ${n} skipped`);
    if (n < B.CAMPAIGN_SIZE) startCampaign(n + 1);
    else openLevels();
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
      const first = !stars(n);
      store.levels[n] = Math.max(stars(n), s);
      delete store.skipped[n];
      if (first) {
        store.cleared++;
        if (store.cleared % 5 === 0) {
          store.hints++;
          extra = '+1 free hint!';
        }
        if (n % B.LEVELS_PER_WORLD === 0 && n < B.CAMPAIGN_SIZE) {
          extra = `🎉 World ${B.WORLDS[n / B.LEVELS_PER_WORLD]} unlocked!`;
          setTimeout(() => A.fanfare(), 600);
        }
      }
    } else {
      const key = puzzle.dateKey;
      store.daily[key] = Math.max(store.daily[key] || 0, s);
      extra = `🔥 ${dailyStreak()}-day streak · new puzzle tomorrow`;
    }
    save();
    if (s === 3) P.happytime();
    const solvedPuzzle = puzzle;
    setTimeout(() => {
      if (current === 'game' && puzzle === solvedPuzzle) openWin(s, extra);
    }, 900);
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
      return openLevels();
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
    if (!$('ov-feature').classList.contains('hidden')) {
      if (k === 'Enter' || k === ' ') $('btn-feature-ok').click();
      return;
    }
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
  // Portals measure how fast players reach gameplay, so we skip the menu and drop straight into a level.
  P.loadingDone();
  startCampaign(nextLevel());
})();
