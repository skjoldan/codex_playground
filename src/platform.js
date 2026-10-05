/*
 * Thin adapter over game-portal SDKs so the game code never talks to a portal directly.
 * The build script sets BEAMLINE_CONFIG.platform to 'crazygames', 'poki' or 'web' and injects the SDK tag.
 *
 * Every call is safe to make when the SDK is missing or blocked (ad blockers, local dev).
 */
window.Platform = (function () {
  'use strict';
  const kind = (window.BEAMLINE_CONFIG || {}).platform || 'web';
  let cg = null;   // window.CrazyGames.SDK once initialised
  let poki = null; // window.PokiSDK once initialised
  let playing = false;
  const listeners = { pause: [], resume: [] };

  function emit(ev) {
    listeners[ev].forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }

  function safe(fn) {
    try { return fn(); } catch (e) { console.warn('[Platform]', e); return undefined; }
  }

  const api = {
    kind,

    async init() {
      if (kind === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK) {
        try {
          await window.CrazyGames.SDK.init();
          cg = window.CrazyGames.SDK;
          safe(() => cg.game.loadingStart());
        } catch (e) {
          console.warn('[Platform] CrazyGames init failed', e);
        }
      } else if (kind === 'poki' && window.PokiSDK) {
        try {
          await window.PokiSDK.init();
          poki = window.PokiSDK;
        } catch (e) {
          // Poki rejects init when an ad blocker is active; the game must still work.
          poki = window.PokiSDK;
        }
      }
    },

    loadingDone() {
      if (cg) safe(() => cg.game.loadingStop());
      if (poki) safe(() => poki.gameLoadingFinished());
    },

    gameplayStart() {
      if (playing) return;
      playing = true;
      if (cg) safe(() => cg.game.gameplayStart());
      if (poki) safe(() => poki.gameplayStart());
    },

    gameplayStop() {
      if (!playing) return;
      playing = false;
      if (cg) safe(() => cg.game.gameplayStop());
      if (poki) safe(() => poki.gameplayStop());
    },

    /** Celebration moment (CrazyGames uses it for confetti/analytics). */
    happytime() {
      if (cg) safe(() => cg.game.happytime());
    },

    /** Interstitial at a natural break. The portal decides whether an ad actually plays. Never rejects. */
    midgame() {
      api.gameplayStop();
      if (cg) {
        return new Promise((resolve) => {
          const done = () => { emit('resume'); resolve(); };
          try {
            cg.ad.requestAd('midgame', { adStarted: () => emit('pause'), adFinished: done, adError: done });
          } catch (e) {
            done();
          }
        });
      }
      if (poki) {
        return Promise.resolve(safe(() => poki.commercialBreak(() => emit('pause'))))
          .catch(() => {})
          .then(() => emit('resume'));
      }
      return Promise.resolve();
    },

    /** Rewarded video. Resolves true only if the reward should be granted. */
    rewarded() {
      api.gameplayStop();
      if (cg) {
        return new Promise((resolve) => {
          try {
            cg.ad.requestAd('rewarded', {
              adStarted: () => emit('pause'),
              adFinished: () => { emit('resume'); resolve(true); },
              adError: () => { emit('resume'); resolve(false); },
            });
          } catch (e) {
            resolve(false);
          }
        });
      }
      if (poki) {
        return Promise.resolve(safe(() => poki.rewardedBreak(() => emit('pause'))))
          .then((ok) => !!ok)
          .catch(() => false)
          .then((ok) => { emit('resume'); return ok; });
      }
      // Own website / local dev: no ad network, so the reward is free.
      return new Promise((resolve) => setTimeout(() => resolve(true), 400));
    },

    /** Called with 'pause' when an ad starts (mute audio) and 'resume' when it ends. */
    on(ev, fn) {
      listeners[ev].push(fn);
    },

    // Synchronous key-value save. CrazyGames mirrors localStorage into its cloud save.
    storage: {
      get(key) {
        if (cg && cg.data) {
          const v = safe(() => cg.data.getItem(key));
          if (v !== undefined) return v;
        }
        try { return localStorage.getItem(key); } catch (e) { return null; }
      },
      set(key, value) {
        if (cg && cg.data && safe(() => { cg.data.setItem(key, value); return true; })) return;
        try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
      },
    },
  };
  return api;
})();
