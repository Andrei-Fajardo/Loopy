# Loopy! → CrazyGames: conversion plan and handover

Written 2026-10-30 by Opus for the next agent (Sonnet). You are taking over the conversion of
**Loopy!**, a mobile-first HTML/JS game, into a browser-native game for **crazygames.com**.
Read this whole file, then `CLAUDE.md` in this folder (the game's own notes, copied from the
original project), before touching code.

---

## 0. Ground rules

- **Work only in `<repo-root>`.** The original
  `..\Lasso` folder is the mobile version and must stay untouched.
- **Never upload, submit, or publish anything** to CrazyGames or anywhere else. The owner
  submits by hand. Publishing is irreversible and outward-facing.
- **The owner's standing design rules** (from `CLAUDE.md`, still binding here):
  - no chance-based prizes, no fake urgency, no gambling-like mechanics;
  - don't re-add levels or lives, the timed sheep round, free-roaming bouncing balls, or a cap on all spawns;
  - coin payouts stay sublinear in score;
  - species lists are append-only;
  - use `withAlpha()` for transparent colours, never concatenate hex alpha onto a colour.
- **Bump the `?v=` query** on any script you edit in `index.html`, or browsers serve the stale file.
- **Report honestly.** Say what you ran and what you only syntax-checked. `node --check file.js`
  works on this machine. Playwright (Python) and Chrome are installed (see `tools/` in the
  original project for examples). Test locally on **`http://localhost`** (e.g. `python -m http.server`),
  not `file://`: the CrazyGames SDK runs in demo mode on localhost and is `disabled` elsewhere.
- Ask the owner before any change that alters game feel or economy beyond what is listed here.

---

## 1. What "viral" means on CrazyGames (research summary)

On a portal, a game doesn't go viral through social sharing. It goes viral because the
portal's algorithm gives it more traffic once its numbers beat other games'. Every task below
serves those numbers.

**How a game earns traffic:**
- **Two-stage launch.** A **Basic Launch** runs the game with no ads and no revenue. CrazyGames
  then compares **average playtime, gameplay conversion and retention** against other games on
  the platform. If the game meets the benchmarks, it is invited to **Full Launch** (SDK
  required, ads on, wider promotion). If it misses most of them, it can't proceed. The
  benchmark numbers aren't public. ([CrazyGames docs][cg-docs])
- **Poki's published test targets** are a useful proxy, since the audience overlaps. Treat them
  as targets, not CrazyGames rules. ([Defold/Poki best practices][poki-bp])
  - average playtime **5+ min** (7–10+ is very strong);
  - **conversion to play 65%+**;
  - **under 20 MB**.
  - The guidance also asks: *"Can the player start having fun within ten seconds?"* It names
    long intros, dialogue-heavy tutorials, complex menus and slow unlocks as the things that
    struggle on web.
- **Hits are quick and instantly readable.** CrazyGames' best-known titles (Basket Random,
  Moto X3M, Smash Karts, 1v1.lol) are short-session games you understand in seconds.
  ([tech-insider][ti])
- **Most traffic is desktop, but mobile still matters.** Across top browser-game sites, mobile is
  roughly 28–52% of players. Poki reports 40% and requires mobile support. ([Naavik][naavik])
- **Web games can't use push notifications to bring players back**, so retention comes from
  in-game reasons: collections, daily rewards, leaderboards and progression. ([Naavik][naavik])
- **Ads earn less per player on web than on mobile**, so the game earns through volume and
  session length rather than per-user payment. ([Naavik][naavik])

**What this means for Loopy!** Its strengths fit the web well: the collection and album, daily
calendar, missions, achievements, minigames and the satisfying pop. Its weaknesses for web are
mostly in the opening minutes: a 7-slide video tutorial, then a mandatory 8-step practice, then
a menu, before real play. The single most important change is **getting a new player into a
real run within ~10 seconds**.

---

## 2. CrazyGames hard requirements (verified 2026-10-30)

Sources: [technical][cg-tech], [gameplay][cg-game], [ads][cg-ads], [video ads][cg-video],
[intro][cg-intro].

**Size, loading and platform**
- Initial download ≤ **50 MB**, and **≤ 20 MB for mobile homepage eligibility**. With the SDK,
  this is measured from load start to the first `gameplayStart`.
  - Total ≤ 250 MB, ≤ 1,500 files, **relative paths only**.
  - Target: < 20 MB, with the tutorial videos kept out of the initial download.
- Desktop must be **playable in landscape**. Portrait is allowed with side bars or a background.
  The site handles rotation prompts.
- **Text must be legible at DPR 1** in iframe sizes **800×450** (mobile) and **1080×607** (tablet),
  plus normal desktop sizes.
- **Mouse, keyboard and touch** must all work. Set `user-select: none` on body.
- Mobile in the CrazyGames app runs fullscreen: respect safe-area padding.
- **No custom in-game fullscreen button.** CrazyGames provides it and prohibits game-made ones.
- **Physics must behave the same at 144/165 Hz.** Movement must be scaled by `dt`, and Frenzy,
  evade and charge timers must not run faster on high-refresh monitors.
- **Chrome and Edge must work.** Safari is disabled if it misbehaves, and ChromeOS is disabled
  if the game is slow on a 4 GB RAM device.
- **iOS audio:** if the `AudioContext` is suspended, call `resume()` inside a `click` or
  `touchend` handler. A visibility-change listener alone isn't enough.

**Getting into play and the rules**
- **New users land in gameplay immediately, or within at most 1 click** (Full Launch).
- **English required.** Use the SDK system-info locale with an English fallback. Translations
  are optional but must be good if added.
- **PEGI 12.**
- **No links that promote other games, platforms or app stores.**
- **Basic Launch:** needs a `gameplayStart` event, has no ads, and the game must work with ads
  off. **Full Launch:** needs `gameplayStart`/`gameplayStop`, plus the Data and User modules
  where applicable.

**Ads**
- **Midgame ads:**
  - only at natural breaks: after a run ends, between rounds;
  - **never during play, and never on navigation buttons** (menu, settings, shop);
  - pause and block input while the ad is requested or showing;
  - **mute only on `adStarted`**, unmute on finish or error;
  - continue normally if unfilled;
  - the SDK caps them at about 1 per 3 min.
- **Rewarded ads:**
  - always optional and user-initiated;
  - **never shown on an active gameplay screen**;
  - a decline option **the same size and style** as accept;
  - a video icon on the button;
  - **an alternative way to get the reward** (e.g. coins);
  - a reward confirmation animation on `adFinished`, **no reward on `adError`**;
  - never offered every time the player dies;
  - never one midgame and one rewarded at the same break;
  - offered rarely, with a timer or hidden button between offers.
- **Adblock:** the game must stay fully playable. A gated feature needs an inline notice, not a
  popup. Never leave a rewarded button clickable when it can't work.

---

## 3. Current state of this folder

The copy was made from `..\Lasso` on 2026-10-30.

**Changes already made:**
- **`crazy.js`** (new, loaded last). All of it is guarded, so it is a no-op without the SDK.
  - **Removed features:** deletes the Vault and Shop tabs, sets `Meta.vaultCharge` to a no-op,
    and forces `S.noAds = false`.
  - **Rewarded ads:** replaces `Meta.Ads.rewarded` with SDK rewarded video, and falls back to
    the old 3 s placeholder if the SDK isn't ready.
  - **Midgame ad:** intercepts the `#play` click after a finished run.
  - **Gameplay events:** polls `Meta.runInfo()` every 250 ms and sends
    `gameplayStart`/`gameplayStop` (playing = `state === 'play' && !paused`).
- **`index.html`:**
  - SDK script tag in `<head>`;
  - Fredoka self-hosted from `fonts/` (Google Fonts link removed);
  - Vault and Shop dock buttons removed;
  - `crazy.js` included.
- **`game.js`:** Escape no longer toggles pause (it exits fullscreen on the site); P still does.
- **`fun.js`:** the "Vault Opener" achievement was removed.
- **`fishing.js`:** the token item "Vault Charge" was removed.

**Known problems with that work, which you must fix:**
1. `crazy.js` mutes with `Sfx.muted = true` **on `adStarted`**, which is correct. But it never
   **pauses the run or blocks input** while a rewarded ad is requested. Fix that.
   - Also check that `music.js` actually goes silent: it may not read `Sfx.muted`.
2. **The game-over "2× coins" rewarded button and the next Play click can stack** a rewarded ad
   and a midgame ad at the same break, which is prohibited.
   - Rule: if the player watched a rewarded ad on this game-over, skip the midgame for that
     break.
3. **The "clear 12 fish" rewarded continue** (`game.js` ~line 1472) is offered on the run-over
   screen. Make sure it is never offered on every death (add a cooldown or limit it to once per
   session), and that it shows the video icon and an equal-size decline.
4. **The free-coins dock button** (`#freeBtn`, "+N (3 left)") sits on the main menu.
   - That is allowed (it isn't gameplay), but it needs a video icon (it already has ▶; use 📺 or
     a clear "Watch ad" label).
   - It must be hidden or disabled with an inline note when an adblocker is detected
     (`await CrazyGames.SDK.ad.hasAdblock()`).
5. **Leftover Vault text** still appears in run milestones, minigames, the daily calendar,
   mission rewards and how-to-play. Grep for `vault`/`Vault` and remove what players can see.
6. **Text left over from the mobile and store versions:** remove any Google Play, Capacitor,
   "test store", "app version" or ad-free-purchase wording players can see.
7. **SDK method names were written from the intro docs only.** Confirm `SDK.game.loadingStart`,
   `loadingStop`, `gameplayStart`, `gameplayStop` and `SDK.ad.requestAd(type, callbacks)`
   against the [SDK docs][cg-sdk] and the Game module page. Then test on localhost, where
   demo ads should appear.

**Nothing has been run in a browser yet.** Only `node --check` passed on the changed files.

---

## 4. Task list (in priority order)

Each task has acceptance criteria. Do them in order and report after each group.

### Group A: get players into a run within 10 seconds (biggest impact on conversion)

**A1. First launch goes straight into play.**
- New player (no save): skip the 7 video slides. Start the **hands-on practice** immediately
  on the real board (`Meta.startPractice(0)`).
  - Trim it to the core: steps 1–3 (loop a group, big loop, colour rule).
  - The golden, rainbow and puffer steps become **contextual one-line tips** the first time each
    special appears in a real run. They don't block play: a small card, auto-dismissed.
- When practice step 3 is done, roll straight into a **real run** with no menu in between.
- The video slides stay reachable from the `?` page only.
- **Accept when:** a fresh profile (clear localStorage) on `http://localhost` is drawing its first
  loop within 10 s of page load, with zero clicks before the first loop, or at most one.

**A2. Returning players get one click to play.**
- The menu's **Play** button is the dominant element and the first focus target, and
  **Enter/Space starts a run**.
- **Accept when:** from a cold load with an existing save, one click (or one key) starts a run.

**A3. Initial download under 20 MB, and tutorial videos out of it.**
- The tutorial `<video>` elements use `preload="auto"` and a warm-up loader (`tutorial.js`
  lines ~22 and ~70). Change both to load only when the slides are opened from `?`.
- **Accept when:** a Network-tab capture of a fresh load (until first `gameplayStart`) is under
  20 MB and includes no `.mp4` or `.webm`.

### Group B: works as a desktop game

**B1. Landscape layout.**
- The game was built for portrait phones. At 1920×1080 and 1280×720, and in the CrazyGames
  iframe sizes **800×450** and **1080×607**:
  - the pond should use the wide area;
  - the menu should not be a tall 400 px column floating in a sea of background.
- Suggested approach:
  - **Menu:** in landscape, a two-column layout, with the logo, Play and Fish buttons on the
    left and the Store/Upgrades/Album panel on the right.
  - **In-run:** confirm the pond `cap` and spawn edges scale sensibly with a wide canvas, so a
    wide window is not trivially easier or harder.
- Measure with the bot (`tools/balance_par.py` in the original project) at 1280×720 vs 390×844
  before and after.
- **Accept when:** headless screenshots at all four sizes show no clipped or overlapping UI, and
  all text is readable at DPR 1.

**B2. Mouse feel.**
- Drawing loops with a mouse is the core action on desktop. Verify that:
  - loop detection doesn't need touch-style point density at fast mouse speeds;
  - `loopQuality` (perfect loops) isn't unfairly strict or lenient with a mouse;
  - fish evasion (`evade`, which dodges the rope tip within 120 px at up to 1.6× speed) isn't
    frustrating with a precise, fast mouse. If it is, reduce it on pointer type `mouse` only.
- Add hover states and `cursor: pointer` on all buttons, and a custom crosshair or rope cursor
  over the pond.
- **Accept when:** Playwright drives real mouse circles (see the `juice*.py` approach in
  `CLAUDE.md`) and perfect-loop rates for a careful circle are close to the touch calibration
  (0.90).

**B3. High-refresh consistency.**
- Audit `game.js`, `fishing.js`, `minigames.js` and `home.js` for anything per-frame that isn't
  scaled by `dt`: velocities, timers, spawn counters, decay.
- Test with Chrome forced to a high frame rate, or simulate a dt of 1/165.
- **Accept when:** a 60 s bot run gives statistically the same spawn count and fish speeds at
  dt = 1/60 and dt = 1/165.

**B4. Keyboard.**
- **P** pauses; **Esc** must not be bound to gameplay (already done for the run). Check the
  other `Escape` listeners:
  - closing dialogs is fine;
  - pausing or quitting gameplay is not.
- **Enter/Space** starts or replays.
- **Accept when:** no gameplay state changes on Escape.

**B5. Audio unlock.** Make sure the first `click` or `pointerup` resumes both the `Sfx` and
`music.js` AudioContexts, and that they resume after a tab or app switch on iOS. The
requirement is `resume()` inside a gesture handler.

**B6. No in-game fullscreen button.** Don't add one; CrazyGames prohibits it.

### Group C: SDK and ads done to the rules

**C1. Fix the seven known problems** listed in section 3.

**C2. Locale.** Read the locale from the SDK system info. The game ships English only for now,
so just confirm English is used and nothing breaks. Don't machine-translate.

**C3. Data module (Full Launch).**
- Save is `localStorage` key `lasso-save-v1` in `meta.js` (`save()`, plus the load near the top).
- When `SDK.data` is available, mirror the save through it, so progress follows a logged-in
  CrazyGames user. Keep `localStorage` as the fallback.
- **Accept when:** progress survives clearing localStorage when a CrazyGames user is logged in
  (demo mode: confirm the calls succeed without errors).

**C4. Adblock path.**
- Use `hasAdblock()`. If it returns true:
  - hide `#freeBtn`, the game-over 2× button and the revive offer;
  - show a small inline note ("Ads are blocked, so ad rewards are off"), never a popup.
- **Accept when:** with an adblocker (or with `hasAdblock` stubbed to true), the game is fully
  playable and no button does nothing.

**C5. Basic Launch build.**
- Basic Launch has ads disabled, and the game must still work with only `gameplayStart`.
- Make sure every ad path degrades:
  - the rewarded buttons hide, or show their coin alternative;
  - the midgame just continues.

### Group D: retention without push notifications (playtime and day-2 return)

These raise **average playtime** and **retention**, the two benchmark metrics. Keep the owner's
rule: no gambling, no fake urgency.

**D1. Daily reasons to return.**
- The daily calendar and streak already exist. Make the streak and tomorrow's reward visible on
  the game-over screen ("Come back tomorrow: Day 4 → 300 coins").
- No timers counting down to create pressure.

**D2. Session pull.**
- After a run, show the **closest goal**:
  - next species, mission or achievement progress;
  - "x more points to beat your best".
- `nextUnlock` already does some of this.
- **Play again** stays the biggest button.

**D3. Short-run friendliness.**
- Web players often play 1–3 runs. Make sure the first 3 runs each unlock or show something new
  (a species, a hat, an achievement), so playtime builds.

**D4. Leaderboard (optional, ask the owner first).**
- Check whether the CrazyGames SDK offers a leaderboard or scores feature in the current docs.
- If it does, a daily best-score board is the classic web retention hook. If it doesn't, skip
  this; don't build a backend.

### Group E: submission materials

These are prepared locally, not uploaded.

**E1. Store text.**
- Draft in `submission/`:
  - title;
  - a 2–3 sentence description;
  - controls text ("Draw a loop with your mouse or finger around fish of one colour…").
- English, PEGI 12.

**E2. Cover images and video.**
- Check the current cover specs on the CrazyGames docs ("game covers" page) and list them in
  `submission/README.md`.
- Capture gameplay stills with Playwright at 2× (see `tools/capture_tutorial.py` in the original
  project for the approach), and draft a 15–20 s gameplay video with ffmpeg.
  - ffmpeg: `C:\Program Files\File Converter\ffmpeg.exe`
- Don't make the full 4K trailer from `TRAILER_AND_LAUNCH.md`. Not needed.

**E3. Privacy check.** The game collects nothing beyond localStorage and SDK events, so no
privacy notice is needed. Re-confirm that after your changes.

---

## 5. Testing checklist (run before reporting done)

1. `node --check` on every changed `.js` file.
2. Serve with `python -m http.server 8000` in this folder, then open `http://localhost:8000/`.
   - The SDK runs in **local/demo mode**, with demo ads.
3. Playwright (Chrome) on a **fresh profile**:
   - time from load to first loop drawn;
   - no `pageerror` or console errors;
   - `gameplayStart` fires once the run begins, and `gameplayStop` fires on pause and run end.
     Wrap the SDK calls to log them.
4. Same at viewports 800×450, 1080×607, 1280×720 and 1920×1080. Save screenshots to
   `submission/qa/`.
5. Ad flows in demo mode:
   - free coins, 2× coins and revive each grant only on finish;
   - an error grants nothing;
   - no midgame plus rewarded at the same break;
   - audio is muted only while the ad plays.
6. The adblock stub path (C4).
7. Network capture: initial download under 20 MB until the first `gameplayStart`.
8. Re-run the regression loop script described in `CLAUDE.md` (real mouse loops around gold,
   rainbow, mixed and plain fish; no page errors).

Report: what passed, what failed (with output), what you could not test. The owner then runs
the CrazyGames **QA Tool** on the Developer Portal; you can't.

---

## 6. Open questions for the owner (ask, don't assume)

- **Fishing and minigames:** keep them in the web version? They add playtime, but also menu
  weight. Recommendation: keep them, but not on the first-launch path.
- **The 3 skins:** keep coin unlocks for Sheep (1,500) and Toy balls (2,500)? Recommendation:
  yes. They are a good mid-term goal for playtime.
- **Revenue share and exclusivity:** the owner should read the Developer Portal terms before
  submitting. No official split is published. One third-party source cites 60% of ad revenue
  for developers, unverified.

---

## Sources

- [CrazyGames docs: launch process and metrics][cg-docs]
- [CrazyGames requirements: intro][cg-intro]
- [CrazyGames requirements: technical][cg-tech]
- [CrazyGames requirements: gameplay][cg-game]
- [CrazyGames requirements: advertisement][cg-ads]
- [CrazyGames SDK: intro][cg-sdk]
- [CrazyGames SDK: video ads][cg-video]
- [Defold: Poki SDK best practices (playtime, conversion, size benchmarks)][poki-bp]
- [Naavik: Web Gaming Strikes Back][naavik]
- [Tech Insider: CrazyGames vs Poki vs Coolmath][ti]
- [PocketGamer.biz: Inside Poki's vision][pg]

[cg-docs]: https://docs.crazygames.com
[cg-intro]: https://docs.crazygames.com/requirements/intro/
[cg-tech]: https://docs.crazygames.com/requirements/technical/
[cg-game]: https://docs.crazygames.com/requirements/gameplay/
[cg-ads]: https://docs.crazygames.com/requirements/ads/
[cg-sdk]: https://docs.crazygames.com/sdk/intro/
[cg-video]: https://docs.crazygames.com/sdk/video-ads/
[poki-bp]: https://defold.com/extension-poki-sdk/best-practices
[naavik]: https://naavik.co/digest/web-gaming-strikes-back/
[ti]: https://tech-insider.org/crazygames-vs-poki-vs-coolmath-games-2026/
[pg]: https://www.pocketgamer.biz/inside-pokis-vision-for-the-future-of-browser-gaming/

---

## 7. Status update (2026-10-31, Sonnet)

Done and checked with `qa/` scripts on localhost (SDK demo mode, fake ads): A1–A3, C1, C4, B3, B4 (Escape pauses again at the owner's request; see below), plus:
- **World zoom** (`ZOOM` in `game.js` `resize()`): on landscape windows the whole play world is drawn up to 1.9x bigger (fish, sheep, balls, ropes) and the play area stretches to ~3% of the window edges. Input is divided by `ZOOM` in `toWorld()`. Portrait is unchanged. `practice.js` spotlight multiplies by `ZOOM`. The QA scripts multiply world coordinates by `ZOOM`.
- **Landscape menu** (CSS at the end of `index.html`): two columns when the window is landscape and at least 700 px wide.
- **Escape**: the owner wants Escape to pause the run, so it does again (and P). CrazyGames' quality guideline says to avoid Escape because the browser uses it to leave fullscreen; in fullscreen Chrome handles it first, so the pause shortcut only fires outside fullscreen. Fishing and the sheep minigame still ignore Escape.
- Not done: Group D, leaderboards, cover art/video, B2 mouse-feel balance test with the bot at the new zoom, Data-module test with a real logged-in user.
