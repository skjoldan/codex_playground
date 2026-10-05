/*
 * Tiny WebAudio synth — every sound is generated, so the game ships with zero audio assets.
 */
window.Sfx = (function () {
  'use strict';
  let ctx = null;
  let master = null;
  let muted = false;
  let adMuted = false;
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyVolume();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function applyVolume() {
    if (master) master.gain.value = muted || adMuted ? 0 : 0.5;
  }

  function tone(freq, { type = 'sine', dur = 0.12, vol = 0.3, at = 0, slide = 0 } = {}) {
    if (muted || adMuted || !ensure()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const note = (semi) => 523.25 * Math.pow(2, semi / 12); // C5 based

  return {
    unlock: ensure,
    get muted() { return muted; },
    setMuted(v) { muted = !!v; applyVolume(); },
    setAdMuted(v) { adMuted = !!v; applyVolume(); },

    place() { tone(880, { type: 'triangle', dur: 0.07, vol: 0.25, slide: 1.3 }); },
    flip() { tone(1046, { type: 'triangle', dur: 0.06, vol: 0.2, slide: 0.8 }); },
    remove() { tone(520, { type: 'triangle', dur: 0.08, vol: 0.2, slide: 0.6 }); },
    click() { tone(660, { type: 'sine', dur: 0.05, vol: 0.15 }); },
    error() { tone(140, { type: 'square', dur: 0.16, vol: 0.12, slide: 0.8 }); },
    gem(k) { tone(note(PENTA[Math.min(k, PENTA.length - 1)]), { dur: 0.35, vol: 0.22 }); },
    hint() { [0, 4, 7].forEach((s, i) => tone(note(s + 7), { dur: 0.25, vol: 0.15, at: i * 0.06 })); },
    win(stars) {
      const seq = [0, 4, 7, 12, 16, 19].slice(0, 3 + stars);
      seq.forEach((s, i) => tone(note(s), { type: 'triangle', dur: 0.4, vol: 0.22, at: i * 0.09 }));
      seq.forEach((s, i) => tone(note(s + 12), { dur: 0.3, vol: 0.06, at: i * 0.09 + 0.02 }));
    },
    star(i) { tone(note(12 + i * 4), { type: 'triangle', dur: 0.25, vol: 0.2 }); },
  };
})();
