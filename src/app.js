(function () {
  'use strict';
  const B = window.Beamline;
  const CFG = window.BEAMLINE_CONFIG || {};
  const S = 10; // svg units per cell
  const NS = 'http://www.w3.org/2000/svg';
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const $ = (id) => document.getElementById(id);

  // ---- storage -------------------------------------------------------------
  const STORE_KEY = 'beamline:v1';
  function loadStore() {
    try {
      return Object.assign({ days: {}, progress: {}, seenHelp: false }, JSON.parse(localStorage.getItem(STORE_KEY)));
    } catch (e) {
      return { days: {}, progress: {}, seenHelp: false };
    }
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
  }
  const store = loadStore();

  // ---- which puzzle? -------------------------------------------------------
  const todayKey = B.dateKey(new Date());
  const params = new URLSearchParams(location.search);
  let mode = 'daily';
  let puzzle;
  let progressKey;

  const archiveKey = params.get('d');
  if (archiveKey && /^\d{4}-\d{2}-\d{2}$/.test(archiveKey) && archiveKey < todayKey && B.puzzleNumber(archiveKey) >= 1) {
    mode = 'archive';
    puzzle = B.daily(archiveKey);
    progressKey = 'd:' + archiveKey;
  } else if (params.has('p')) {
    mode = 'practice';
    let seed = params.get('p');
    const level = Math.min(7, Math.max(1, parseInt(params.get('l'), 10) || 3));
    if (!seed || seed === 'random') {
      seed = Math.random().toString(36).slice(2, 8);
      history.replaceState(null, '', `?p=${seed}&l=${level}`);
    }
    puzzle = B.generate('practice:' + seed, level);
    puzzle.practiceSeed = seed;
    progressKey = 'p:' + seed + ':' + level;
  } else {
    puzzle = B.daily(todayKey);
    progressKey = 'd:' + todayKey;
  }

  // ---- game state ----------------------------------------------------------
  const N = puzzle.size;
  let placed = new Map();
  let undoStack = [];
  let moves = 0;
  let elapsed = 0;
  let runningSince = null;
  let solved = false;
  let cursor = -1;
  let lastBeamSig = '';

  const saved = store.progress[progressKey];
  if (saved) {
    placed = new Map(saved.placed);
    moves = saved.moves;
    elapsed = saved.elapsed;
    solved = saved.solved;
  }

  function persist() {
    store.progress[progressKey] = { placed: [...placed], moves, elapsed: currentElapsed(), solved };
    // keep progress for the last ~60 puzzles only
    const keys = Object.keys(store.progress);
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach((k) => delete store.progress[k]);
    saveStore();
  }

  function currentElapsed() {
    return elapsed + (runningSince ? Date.now() - runningSince : 0);
  }
  function startClock() {
    if (!runningSince && !solved) runningSince = Date.now();
  }
  function stopClock() {
    if (runningSince) {
      elapsed += Date.now() - runningSince;
      runningSince = null;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopClock();
      persist();
    } else if (moves > 0 && !solved) startClock();
  });

  // ---- svg helpers ---------------------------------------------------------
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

  const board = $('board');
  const size = (N + 2) * S;
  board.setAttribute('viewBox', `0 0 ${size} ${size}`);

  const defs = el('defs', {}, board);
  defs.innerHTML = `
    <filter id="glow-beam" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter>
    <filter id="glow-gem" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  const layerCells = el('g', {}, board);
  const layerBeam = el('g', { 'pointer-events': 'none' }, board);
  const layerPieces = el('g', { 'pointer-events': 'none' }, board);

  const cellRects = [];
  const gemEls = new Map();

  function buildStatic() {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const i = r * N + c;
        const ch = puzzle.grid[i];
        const rect = el('rect', {
          x: (c + 1) * S, y: (r + 1) * S, width: S, height: S,
          class: 'cell' + (ch === '.' ? ' can' : ''),
          'data-i': i,
        }, layerCells);
        cellRects.push(rect);
        if (ch === '#') {
          el('rect', { x: (c + 1) * S + 0.8, y: (r + 1) * S + 0.8, width: S - 1.6, height: S - 1.6, rx: 1.2, class: 'wall' }, layerCells);
          const x0 = (c + 1) * S + 0.8;
          const y0 = (r + 1) * S;
          for (const f of [0.37, 0.63]) {
            el('line', { x1: x0, y1: y0 + S * f, x2: x0 + S - 1.6, y2: y0 + S * f, class: 'wall-hatch' }, layerCells);
          }
          el('line', { x1: x0 + S * 0.42, y1: y0 + S * 0.37, x2: x0 + S * 0.42, y2: y0 + S * 0.63, class: 'wall-hatch' }, layerCells);
        }
      }
    }
    // emitter
    const e = puzzle.emitter;
    const ex = cx(e.c);
    const ey = cy(e.r);
    const rot = [270, 0, 90, 180][e.dir];
    el('path', { d: `M${ex - 3} ${ey - 3.2} L${ex + 3.4} ${ey} L${ex - 3} ${ey + 3.2} Z`, class: 'emitter', transform: `rotate(${rot} ${ex} ${ey})` }, layerCells);
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
        gemEls.set(i, el('path', { d: `M${x} ${y - 3.2} L${x + 3.2} ${y} L${x} ${y + 3.2} L${x - 3.2} ${y} Z`, class: 'gem' }, layerPieces));
      } else if (ch === '/' || ch === '\\') {
        mirrorLine(layerPieces, r, c, ch, 'mirror fixed');
        el('circle', { cx: cx(c), cy: cy(r), r: 0.9, class: 'mirror-pin' }, layerPieces);
      } else if (placed.has(i)) {
        mirrorLine(layerPieces, r, c, placed.get(i), 'mirror');
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
    const pointsAttr = pts.map((p) => p.join(',')).join(' ');
    for (const cls of ['beam-glow', 'beam-core']) {
      const pl = el('polyline', { points: pointsAttr, class: cls }, layerBeam);
      if (animate) {
        pl.style.strokeDasharray = len;
        pl.style.setProperty('--len', len);
        pl.classList.add('beam-anim');
      }
    }
    if (t.end === 'wall') el('circle', { cx: last[0], cy: last[1], r: 1.4, class: 'hit' }, layerBeam);
  }

  // ---- update loop ---------------------------------------------------------
  function update() {
    const t = B.trace(puzzle, placed);
    renderPieces();
    renderBeam(t);
    gemEls.forEach((g, i) => g.classList.toggle('lit', t.lit.has(i)));
    cellRects.forEach((rc, i) => rc.classList.toggle('cursor', i === cursor));

    const left = puzzle.mirrors - placed.size;
    $('hud-mirrors').textContent = `${left}/${puzzle.mirrors}`;
    $('hud-mirrors').parentElement.classList.toggle('warn', left === 0 && !solved);
    $('hud-gems').textContent = `${t.lit.size}/${puzzle.gemCount}`;
    $('hud-moves').textContent = moves;
    $('btn-undo').disabled = solved || undoStack.length === 0;
    $('btn-reset').disabled = solved || placed.size === 0;

    if (t.solved && !solved) win();
    board.classList.toggle('won', solved);
    $('btn-results').classList.toggle('hidden', !solved);
    $('hint').classList.toggle('hidden', solved);
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }
  setInterval(() => { $('hud-time').textContent = fmtTime(currentElapsed()); }, 250);

  function shake(msg) {
    board.classList.remove('shake');
    void board.getBoundingClientRect();
    board.classList.add('shake');
    if (msg) toast(msg);
  }

  function tap(i) {
    if (solved) return;
    if (puzzle.grid[i] !== '.') return shake();
    const cur = placed.get(i);
    if (!cur && placed.size >= puzzle.mirrors) return shake('No mirrors left — flip or remove one');
    undoStack.push(new Map(placed));
    if (!cur) {
      placed.set(i, '/');
      moves++;
    } else if (cur === '/') placed.set(i, '\\');
    else placed.delete(i);
    startClock();
    update();
    persist();
  }

  board.addEventListener('click', (ev) => {
    const i = ev.target.getAttribute && ev.target.getAttribute('data-i');
    if (i !== null && i !== undefined) {
      cursor = -1;
      tap(Number(i));
    }
  });

  $('btn-undo').onclick = () => {
    if (!undoStack.length || solved) return;
    placed = undoStack.pop();
    update();
    persist();
  };
  $('btn-reset').onclick = () => {
    if (solved || !placed.size) return;
    undoStack.push(new Map(placed));
    placed.clear();
    update();
    persist();
  };

  document.addEventListener('keydown', (ev) => {
    if (document.querySelector('dialog[open]')) return;
    const k = ev.key;
    if ((k === 'z' && (ev.ctrlKey || ev.metaKey)) || k === 'u') {
      $('btn-undo').click();
      ev.preventDefault();
      return;
    }
    const moveMap = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moveMap[k]) {
      if (cursor < 0) cursor = Math.floor(N / 2) * N + Math.floor(N / 2);
      else {
        const r = Math.min(N - 1, Math.max(0, Math.floor(cursor / N) + moveMap[k][0]));
        const c = Math.min(N - 1, Math.max(0, (cursor % N) + moveMap[k][1]));
        cursor = r * N + c;
      }
      update();
      ev.preventDefault();
    } else if ((k === ' ' || k === 'Enter') && cursor >= 0) {
      tap(cursor);
      ev.preventDefault();
    }
  });

  // ---- winning, stats & sharing -------------------------------------------
  function starsFor(m, par) {
    return m <= par ? 3 : m <= par + 2 ? 2 : 1;
  }

  function win() {
    solved = true;
    stopClock();
    const time = currentElapsed();
    if (mode !== 'practice') {
      const key = puzzle.dateKey;
      if (!store.days[key]) {
        store.days[key] = { stars: starsFor(moves, puzzle.mirrors), moves, par: puzzle.mirrors, time, live: key === todayKey };
      }
    }
    persist();
    if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
    setTimeout(openResult, 900);
  }

  function puzzleLabel() {
    if (mode === 'practice') return `Practice · ${puzzle.levelName}`;
    const wd = DAY_NAMES[B.parseKey(puzzle.dateKey).getDay()];
    return `#${puzzle.number} · ${wd} · ${puzzle.levelName}`;
  }

  function shareText() {
    const stars = starsFor(moves, puzzle.mirrors);
    const head = mode === 'practice' ? `Beamline practice (${puzzle.levelName})` : `Beamline #${puzzle.number} (${puzzle.levelName})`;
    const starStr = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    const par = moves < puzzle.mirrors ? 'under par!' : `par ${puzzle.mirrors}`;
    let url = CFG.siteUrl || location.origin + location.pathname;
    if (mode === 'practice') url += `?p=${puzzle.practiceSeed}&l=${puzzle.level}`;
    return [
      `${head} ${starStr}`,
      `🪞 ${moves} placed (${par}) · ⏱ ${fmtTime(currentElapsed())}`,
      '💎'.repeat(puzzle.gemCount) + ' lit',
      url,
    ].join('\n');
  }

  function computeStats() {
    const keys = Object.keys(store.days).sort();
    const liveSet = new Set(keys.filter((k) => store.days[k].live));
    let max = 0;
    let run = 0;
    let prev = null;
    for (const k of [...liveSet].sort()) {
      const d = B.parseKey(k);
      if (prev) {
        const p = new Date(prev);
        p.setDate(p.getDate() + 1);
        run = B.dateKey(p) === k ? run + 1 : 1;
      } else run = 1;
      max = Math.max(max, run);
      prev = d;
    }
    let cur = 0;
    const d = new Date();
    if (!liveSet.has(B.dateKey(d))) d.setDate(d.getDate() - 1);
    while (liveSet.has(B.dateKey(d))) {
      cur++;
      d.setDate(d.getDate() - 1);
    }
    const dist = { 3: 0, 2: 0, 1: 0 };
    keys.forEach((k) => dist[store.days[k].stars]++);
    const perfect = keys.length ? Math.round((dist[3] / keys.length) * 100) : 0;
    return { solved: keys.length, cur, max, perfect, dist };
  }

  function statGridHTML(s) {
    return [
      [s.solved, 'Solved'],
      [s.cur, 'Streak'],
      [s.max, 'Best streak'],
      [s.perfect + '%', 'Perfect'],
    ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  }

  function openResult() {
    const stars = starsFor(moves, puzzle.mirrors);
    $('res-title').textContent = ['', 'Solved!', 'Nicely done!', moves < puzzle.mirrors ? 'Under par!' : 'Perfect beam!'][stars];
    $('res-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('res-line').textContent = `${puzzleLabel()} · ${moves} placed, par ${puzzle.mirrors} · ${fmtTime(currentElapsed())}`;
    $('res-share').textContent = shareText();
    $('res-stats').innerHTML = statGridHTML(computeStats());
    $('res-stats').classList.toggle('hidden', mode === 'practice');
    loadAd();
    $('dlg-result').showModal();
  }

  $('btn-share').onclick = async () => {
    const text = shareText();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) { /* fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    } catch (e) {
      toast('Copy failed — select the text above');
    }
  };

  function tickCountdown() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    $('res-countdown').textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  }
  setInterval(tickCountdown, 1000);
  tickCountdown();

  let adLoaded = false;
  function loadAd() {
    if (adLoaded || !CFG.adsenseClient || !CFG.adsenseSlot) return;
    adLoaded = true;
    const slot = $('ad-slot');
    slot.classList.remove('hidden');
    slot.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${CFG.adsenseClient}" data-ad-slot="${CFG.adsenseSlot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CFG.adsenseClient}`;
    s.onload = () => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* blocked */ } };
    document.head.appendChild(s);
  }

  // ---- dialogs -------------------------------------------------------------
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (ev) => {
      if (ev.target === d || ev.target.hasAttribute('data-close')) d.close();
    });
  });

  $('btn-help').onclick = () => $('dlg-help').showModal();
  $('btn-results').onclick = openResult;

  $('btn-stats').onclick = () => {
    const s = computeStats();
    $('stats-grid').innerHTML = statGridHTML(s);
    const maxN = Math.max(1, s.dist[3], s.dist[2], s.dist[1]);
    $('stats-dist').innerHTML = [3, 2, 1].map((n) =>
      `<div class="dist-row"><span>${'★'.repeat(n)}</span><div class="dist-bar" style="width:${Math.max(8, (s.dist[n] / maxN) * 100)}%">${s.dist[n]}</div></div>`
    ).join('');
    $('dlg-stats').showModal();
  };

  function openArchive() {
    const lv = $('practice-levels');
    lv.innerHTML = B.LEVEL_NAMES.map((n, k) => `<a class="btn ghost" href="?p=random&l=${k + 1}">${n}</a>`).join('');
    const list = [];
    const d = new Date();
    for (let n = 0; n < 120; n++) {
      const key = B.dateKey(d);
      const num = B.puzzleNumber(key);
      if (num < 1) break;
      const done = store.days[key];
      const href = key === todayKey ? './' : `?d=${key}`;
      const label = key === todayKey ? 'Today' : key.slice(5);
      list.push(`<a href="${href}" class="${done ? 'done' : ''}">#${num}<small>${label} ${done ? '★'.repeat(done.stars) : ''}</small></a>`);
      d.setDate(d.getDate() - 1);
    }
    $('archive-list').innerHTML = list.join('');
    $('dlg-archive').showModal();
  }
  $('btn-archive').onclick = openArchive;
  $('btn-practice-from-result').onclick = () => {
    $('dlg-result').close();
    openArchive();
  };

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  if (CFG.supportUrl) {
    for (const id of ['foot-support', 'res-support']) {
      $(id).href = CFG.supportUrl;
      $(id).classList.remove('hidden');
    }
  }

  // ---- boot ----------------------------------------------------------------
  $('subtitle').textContent = puzzleLabel() + (mode === 'archive' ? ' (archive)' : '');
  buildStatic();
  update();
  $('hud-time').textContent = fmtTime(currentElapsed());
  if (solved) setTimeout(openResult, 300);
  else if (!store.seenHelp) {
    store.seenHelp = true;
    saveStore();
    $('dlg-help').showModal();
  }
})();
