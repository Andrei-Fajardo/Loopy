/* CrazyGames build glue. Loaded last. Everything is guarded: off CrazyGames (or if the SDK is blocked) the game behaves as before,
   with the placeholder ads. See CRAZYGAMES_PLAN.md for the rules this follows. It:
   1. removes the Vault (chance-based) and Shop (real-money placeholder),
   2. runs rewarded and midgame ads through the SDK, following their ad rules:
        - rewarded: always the player's choice, never two ads for one reward, no reward on error, screen is input-blocked while it runs;
        - midgame: only at a natural break (Play again / Play after a run), never right after a rewarded ad, never on the very first run;
        - game audio is muted only while an ad is really playing,
   3. tells the SDK when gameplay starts and stops (a run that is playing and not paused),
   4. hides the ad buttons (with an inline note, no popup) when an adblocker is detected,
   5. mirrors the save through the SDK data module so progress follows a logged-in CrazyGames account,
   6. Enter / Space starts a run from the menu. */
(() => {
  const SDKROOT = window.CrazyGames && window.CrazyGames.SDK;
  const usable = () => SDKROOT && SDKROOT.environment && SDKROOT.environment !== 'disabled';
  const SAVE_KEY = 'lasso-save-v1';
  let ready = false;
  const guard = fn => { try { return fn(); } catch (e) { return undefined; } };
  const $ = id => document.getElementById(id);

  // 1. Features CrazyGames does not allow or does not need. extras.js stays loaded because other code calls Meta.vaultCharge.
  delete Meta.tabs.vault; delete Meta.tabs.shop; Meta.tabBadges = {};
  Meta.S.noAds = false;
  Meta.vaultCharge = () => {}; // nothing charges a vault that no longer exists

  // 2. Ads.
  const shield = document.createElement('div'); // swallows every tap while an ad is requested or showing
  shield.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;background:transparent;touch-action:none';
  document.body.appendChild(shield);
  const muteFor = on => { if (typeof Sfx !== 'undefined') { if (on) { muteFor.was = Sfx.muted; Sfx.muted = true; } else Sfx.muted = muteFor.was; } };
  let adBusy = false, adMuted = false, rewardedThisBreak = false;
  const runAd = (type, onDone, onFail) => {
    if (adBusy) return;
    adBusy = true; shield.style.display = 'block';
    const end = ok => {
      if (!adBusy) return;
      adBusy = false; shield.style.display = 'none';
      if (adMuted) { muteFor(false); adMuted = false; }
      (ok ? onDone : onFail)?.();
    };
    try {
      const p = SDKROOT.ad.requestAd(type, {
        adStarted: () => { if (!adMuted) { muteFor(true); adMuted = true; } },
        adFinished: () => end(true),
        adError: err => { if (err && err.code === 'adblock') setNoAds(true); end(false); },
      });
      if (p && p.catch) p.catch(() => end(false)); // end() only acts once
    } catch (e) { end(false); }
  };
  const placeholder = Meta.Ads.rewarded;
  Meta.Ads.rewarded = (label, done) => {
    if (!ready) { placeholder(label, done); return; } // SDK missing (e.g. a file:// test): the old 3 s placeholder
    runAd('rewarded', () => { rewardedThisBreak = true; done(); }, () => Meta.toast?.('No ad available right now. Try again in a moment.'));
  };

  // Midgame ad at the break between runs. Intercepts "Play again" (game over) and "Play" (menu).
  let finishedRuns = 0, ranSinceAd = false, passThrough = false;
  for (const id of ['replay', 'play']) {
    $(id)?.addEventListener('click', e => {
      if (passThrough) { passThrough = false; return; }
      if (ranSinceAd) document.body.classList.toggle('noRevive'); // a new run is starting: every other run's game-over hides the revive offer
      const wantAd = ready && ranSinceAd && finishedRuns >= 2 && !rewardedThisBreak;
      ranSinceAd = false; rewardedThisBreak = false; // a new break begins when this run ends
      if (!wantAd) return;
      e.stopImmediatePropagation(); e.preventDefault();
      const go = () => { passThrough = true; e.target.click(); };
      runAd('midgame', go, go); // unfilled / adblock: just carry on
    }, true);
  }

  // 3. Gameplay events, from the same state music.js reads. A run ending also flips whether the next game-over offers a revive:
  // never on every death, so every other run hides the button.
  let playing = false;
  setInterval(() => {
    if (!ready) return;
    const i = guard(() => Meta.runInfo());
    const now = !!i && i.state === 'play' && !i.paused;
    if (now === playing) return;
    playing = now;
    guard(() => (now ? SDKROOT.game.gameplayStart() : SDKROOT.game.gameplayStop()));
  }, 250);
  // A real run ending (the practice never calls Meta.gameOver) starts a new break between runs.
  const realGameOver = Meta.gameOver;
  Meta.gameOver = (...a) => {
    const r = realGameOver(...a);
    ranSinceAd = true; finishedRuns++;
    return r;
  };
  // the revive offer is shown at most every other run, and never when ads are blocked
  const css = document.createElement('style');
  css.textContent = `
    body.noRevive #revive { display: none !important; }
    body.noads #revive, body.noads #double, body.noads #freeBtn { display: none !important; }
    #adNote { display: none; text-align: center; color: #bfe6ee; font-size: 12px; margin: 0; }
    body.noads #adNote { display: block; }`;
  document.head.appendChild(css);

  // 4. Adblock: hide every ad button and say why, inline (a popup would fight CrazyGames' own notice and fullscreen).
  function setNoAds(on) { document.body.classList.toggle('noads', !!on); }

  // 5. Save mirror (SDK data module). Local save stays the fallback; the one with more finished games wins on load.
  function mirrorSave() {
    const D = SDKROOT.data;
    if (!D || !D.getItem || !D.setItem) return;
    const remote = guard(() => D.getItem(SAVE_KEY)), local = localStorage.getItem(SAVE_KEY);
    const games = s => { try { return (JSON.parse(s).stats || {}).games || 0; } catch (e) { return -1; } };
    if (remote && games(remote) > games(local) && !sessionStorage.getItem('cgRestored')) {
      sessionStorage.setItem('cgRestored', '1');
      localStorage.setItem(SAVE_KEY, remote);
      location.reload();
      return;
    }
    let sent = local;
    const push = () => { const cur = localStorage.getItem(SAVE_KEY); if (cur && cur !== sent) { sent = cur; guard(() => D.setItem(SAVE_KEY, cur)); } };
    setInterval(push, 15000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) push(); });
    addEventListener('pagehide', push);
  }

  // 6. Enter / Space starts a run from the bare menu (nothing else open, nothing focused that would take the key).
  const openIds = ['over', 'daily', 'confirm', 'pauseScreen', 'ad', 'fSheet', 'homeOv', 'fishing', 'tutorial', 'practice', 'lvUp', 'settings'];
  const shown = id => { const e = $(id); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
  addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    if (t && /^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(t.tagName)) return;
    if ($('menu').classList.contains('hidden') || openIds.some(shown)) return;
    e.preventDefault(); $('play').click();
  });

  if (!SDKROOT) return;
  SDKROOT.init().then(() => {
    ready = usable();
    if (!ready) return;
    Promise.resolve(guard(() => SDKROOT.ad.hasAdblock())).then(b => setNoAds(b)).catch(() => {});
    mirrorSave();
  }).catch(() => {});
})();
