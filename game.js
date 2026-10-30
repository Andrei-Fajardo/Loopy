/* Lasso: the pond, fish, lasso, catch sequence, Frenzy, special fish, the King, pace director,
   sound and rendering. Progression, store, album and menus live in meta.js. */

// ---------- tuning ----------
const START_FISH = 14;
const FAIL_EXTRA_FISH = 2;
const spawnEvery = t => Math.max(0.65, 2.2 - t * 0.008);  // seconds between new fish, shrinks over time
const colorCount = s => (s < 3000 ? 4 : 5);               // a 5th color joins later
const FRENZY_TIME = 8, SLOW_TIME = 5, FRENZY_MULT = 2;
const MULT_CAP = 14;     // the most all of a catch's multipliers together may reach (see catchFish)
const KING_BONUS = 1000; // per combo level, added when the King is caught (was 5000)
// Rainbow is NOT in this random list any more: it appears on a schedule (see `rainbowT` and `spawnRainbow`). As a random special it rolled on every
// spawn, and big catches refill with many fish at once, so a big clear often brought a rainbow right back, which makes any mix of colours a valid
// loop: that snowballed into huge scores every few runs.
const SPECIALS = ['bomb', 'bomb', 'clock', 'treasure'];
const { COLORS, GOLD } = Meta;

// ---------- setup ----------
const $ = id => document.getElementById(id);
const cv = $('c'), mainCtx = cv.getContext('2d');
let ctx = mainCtx; // swapped briefly to draw store and album icons
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let W, H, bounds, bg, mods = Meta.mods();
let fish = [], particles = [], rings = [], floats = [], lights = [], orbs = [], bubbles = [], bursts = [];
let lasso = null, lastLasso = null, cinch = null, liveCount = 0, lastPointer = null;
let state = 'menu', score = 0, shown = 0, combo = 0, comboT = 0, time = 0, spawnT = 0, revived = false;
// Juice state: shake, white flash, red flash, zoom punch, hit-stop freeze.
let shake = 0, flash = 0, redFlash = 0, zoom = 0, hitstop = 0, bubbleT = 0;
// Pace director state, Frenzy, slow-mo, the King, and the personal-best chase.
let recentCatches = [], schoolT = 0, frenzy = 0, meter = 0, slow = 0, kingT = 0, beatBest = false;
// After Frenzy ends, a short grace period while its bonus fish swim away (no overflow, no new arrivals).
let grace = 0;
const FRENZY_EXTRA = 16; // how far over the normal limit Frenzy keeps the pond packed
// Frenzy zooms the view out so the pond is bigger; `view` is the world scale (1 = normal).
let view = 1, screenB = null;
let ZOOM = 1; // world scale on landscape windows (see resize())
const ZOOM_REF_H = 640, ZOOM_MAX = 1.9;
const DPR = () => Math.min(devicePixelRatio || 1, 2) * ZOOM; // canvas pixels per logical unit
const FRENZY_VIEW = 0.8;
// Skins: the player picks fish, sheep or toy balls from the menu dropdown. Same rules and scoring, only the art, background and sounds change.
const SKINS = {
  fish:  { label: '🐟 Fish', place: 'POND', noun: 'fish', tag: 'Loop the fish. Pop the pond.', over: 'The pond overflowed!', cleared: 'POND CLEARED!', scale: 1, cost: 0 },
  sheep: { label: '🐑 Sheep', place: 'PASTURE', noun: 'sheep', tag: 'Loop the sheep. Pen the flock.', over: 'The pasture is full!', cleared: 'PASTURE CLEARED!', scale: 1.25, hit: 'baa', start: 'sheepStart', cost: 1500, blurb: 'herd sheep that stamp and then charge in sudden sprints, on a pasture with their own gear, fields and breed album.' },
  balls: { label: '🏀 Toy balls', place: 'PLAYROOM', noun: 'balls', tag: 'Loop the balls. Clear the playroom.', over: 'The playroom is full!', cleared: 'PLAYROOM CLEARED!', scale: 1.15, hit: 'boing', start: 'ballStart', cost: 2500, blurb: 'herd toy balls that roll away when they bump a ball of another color, in a playroom with their own gear, rooms and toy album.' },
};
const ownsSkin = id => (Meta.S.skinsOwned || ['fish']).includes(id);
const pickSkin = () => (SKINS[Meta.S.skin] && ownsSkin(Meta.S.skin) ? Meta.S.skin : 'fish');
let skin = pickSkin(), bgPasture = null, bgPlay = null;
// Water trails: faint ripples (and streaks in Frenzy) left behind moving fish.
let wakes = [];
let paused = false;
// Fish you catch are owed back: replacements arrive soon after (see director). A big clear (8+ fish) is refilled by a surge instead:
// groups surface in the emptiest open water right after the pops finish, so the board never sits half empty.
let owed = 0, replT = 0, surge = 0, surgeT = 0;
// The hands-on tutorial (practice.js) runs on the real game with its own scripted fish: no spawning, no pond overflow, no stats, coins or
// missions. It sets `practice` to { onCatch(ev), onTangle(caught) }; everything below checks it.
let practice = null;
// "Juice" state (the satisfaction pass): perfect-loop streak and the roundness of the loop being drawn, the combo's heat (0-1) that warms the world,
// sparkle timing, the cool-down flash when a big combo breaks, the pond's fullness (danger), the heartbeat timer, and the coins counted into the HUD chip.
let rainbowT = 80; // seconds until the next rainbow fish
let perfectStreak = 0, lassoQ = 0, lassoReady = false, heat = 0, sparkT = 0, coolFlash = 0, dangerNow = 0, heartT = 0, runCoinsShown = 0;
const PERFECT_Q = 0.84, NICE_Q = 0.72; // loop roundness needed for the Perfect and Nice bonuses (a careful circle scores ~0.90, a typical hand-drawn one ~0.81)
// HUD writes touch the DOM, so spawns only mark it dirty and the frame redraws it once.
let hudDirty = false;
const hudSoon = () => { hudDirty = true; };

// ---------- sound (all generated, no files) ----------
// Notes of a major pentatonic scale: any sequence of them sounds happy.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36].map(k => 392 * Math.pow(2, k / 12));
const Sfx = {
  ctx: null, out: null, echo: null, muted: false, scribble: null, beat: 0, step: 0, note: 4,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      this.comp = comp; // the music bus joins here, so the effects volume setting doesn't scale it
      this.out = c.createGain(); this.out.gain.value = 0.9 * (this.vol ?? 1);
      this.out.connect(comp).connect(c.destination);
      // Short echo used for sparkles so they shimmer.
      this.echo = c.createDelay(); this.echo.delayTime.value = 0.16;
      const fb = c.createGain(); fb.gain.value = 0.32;
      const wet = c.createGain(); wet.gain.value = 0.5;
      this.echo.connect(fb).connect(this.echo); this.echo.connect(wet).connect(this.out);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  setVolume(v) { this.vol = v; if (this.out) this.out.gain.value = 0.9 * v; }, // the Settings effects volume
  tone(f, dur, { type = 'sine', vol = 0.15, slide = 1, delay = 0, attack = 0.005, echo = false } = {}) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); if (echo) g.connect(this.echo);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, freq, type = 'bandpass', delay = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; f.type = type; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(this.out); s.start(c.currentTime + delay);
  },
  // Each fish in a catch plays the next note up, so a big catch is a little melody.
  popNote(i, n) {
    const f = PENTA[Math.min(i + Math.max(0, 6 - n), PENTA.length - 1)] * (frenzy ? 1.5 : 1);
    this.tone(f, 0.16, { type: 'triangle', vol: 0.14, echo: i === n - 1 });
    this.tone(f * 2, 0.08, { vol: 0.05 });
    this.noise(0.04, 0.1, 2500);
  },
  tick(count) { this.tone(PENTA[Math.min(count, PENTA.length - 1)] * 0.5, 0.06, { type: 'square', vol: 0.04 }); },
  cinch() { this.noise(0.18, 0.16, 1200, 'bandpass'); this.tone(300, 0.15, { vol: 0.06, slide: 1.8 }); },
  coin(i = 0) { this.tone(1568 + (i % 5) * 120, 0.05, { type: 'square', vol: 0.025 }); },
  big(level) {
    const chord = level >= 2 ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    chord.forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.11, delay: i * 0.07, echo: true }));
    this.tone(65, 0.5, { vol: 0.35, slide: 0.5 });                       // bass thump
    for (let i = 0; i < 6; i++) this.tone(2093 + Math.random() * 1500, 0.12, { vol: 0.04, delay: 0.3 + i * 0.05, echo: true });
  },
  sweep() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, { vol: 0.1, delay: i * 0.06, echo: true })); },
  comboUp(c) { this.tone(PENTA[Math.min(4 + c * 2, PENTA.length - 1)], 0.12, { type: 'sawtooth', vol: 0.04, delay: 0.05 }); },
  comboLost(c = 0) { this.tone(500, 0.18, { type: 'triangle', vol: 0.05, slide: 0.6 }); if (c >= 4) { [880, 660, 494].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', vol: 0.05, delay: 0.08 + i * 0.07, slide: 0.8 })); this.noise(0.12, 0.05, 5000, 'highpass', 0.05); } }, // a big combo breaking sounds like glass
  fail() { this.tone(330, 0.22, { type: 'sawtooth', vol: 0.09, slide: 0.75 }); this.tone(247, 0.4, { type: 'sawtooth', vol: 0.09, slide: 0.6, delay: 0.22 }); },
  bubble() { this.tone(rand(500, 900), 0.06, { vol: 0.03, slide: 1.6 }); },
  frenzy() {
    this.tone(200, 0.6, { type: 'sawtooth', vol: 0.08, slide: 4 });
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'square', vol: 0.05, delay: 0.25 + i * 0.05, echo: true }));
    this.tone(55, 0.7, { vol: 0.4, slide: 0.5, delay: 0.25 });
  },
  boom() { this.noise(0.6, 0.5, 300, 'lowpass'); this.tone(80, 0.5, { vol: 0.4, slide: 0.3 }); },
  clock() { for (let i = 0; i < 4; i++) this.tone(i % 2 ? 1200 : 900, 0.05, { type: 'square', vol: 0.05, delay: i * 0.25 }); },
  treasure() { for (let i = 0; i < 8; i++) this.tone(1800 + Math.random() * 1200, 0.07, { type: 'square', vol: 0.03, delay: i * 0.04 }); },
  king() { [392, 392, 523, 659].forEach((f, i) => this.tone(f, 0.25, { type: 'sawtooth', vol: 0.07, delay: i * 0.18 })); },
  discovery() { [784, 988, 1319, 1568, 1976].forEach((f, i) => this.tone(f, 0.4, { vol: 0.08, delay: i * 0.09, echo: true })); },
  best() { [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.1, delay: i * 0.1, echo: true })); },
  chest() { this.noise(0.15, 0.2, 900); [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.08, delay: 0.1 + i * 0.06, echo: true })); },
  baa() { const f = rand(210, 290); this.tone(f, 0.35, { type: 'sawtooth', vol: 0.05, slide: 0.8 }); this.tone(f * 1.5, 0.3, { type: 'square', vol: 0.018, slide: 0.8, delay: 0.02 }); },
  sheepStart() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.09, delay: i * 0.09, echo: true })); this.baa(); },
  // Fishing minigame sounds.
  cast() { this.noise(0.25, 0.1, 1800, 'bandpass'); this.tone(500, 0.2, { vol: 0.05, slide: 2 }); },
  plop() { this.tone(260, 0.12, { vol: 0.12, slide: 0.4 }); this.noise(0.12, 0.08, 600, 'lowpass'); },
  bite() { [988, 1319].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.07, delay: i * 0.09 })); },
  reelTick(p) { this.tone(300 + p * 500, 0.04, { type: 'triangle', vol: 0.035 }); },
  snag() { this.tone(180, 0.3, { type: 'sawtooth', vol: 0.07, slide: 0.5 }); },
  beep() { [0, 0.12, 0.24].forEach(d => this.tone(1400, 0.07, { type: 'square', vol: 0.05, delay: d })); },
  honk() { this.tone(180, 0.3, { type: 'sawtooth', vol: 0.09, slide: 1.5 }); this.tone(270, 0.3, { type: 'square', vol: 0.03, slide: 1.5 }); },
  clonk() { this.tone(200, 0.1, { type: 'triangle', vol: 0.14, slide: 0.5 }); this.noise(0.05, 0.12, 1500); },
  boing() { const f = rand(300, 420); this.tone(f, 0.28, { vol: 0.09, slide: 1.9 }); this.tone(f * 2, 0.12, { vol: 0.03, slide: 1.4, delay: 0.02 }); },
  ballStart() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, { type: 'square', vol: 0.05, delay: i * 0.07, echo: true })); this.boing(); },
  // UI sounds: a soft rounded "pop" (a little pitch jitter so repeats don't sound mechanical). Every button gets one from the delegate below.
  click() { this._ui = performance.now(); const f = rand(640, 720); this.tone(f, 0.07, { type: 'sine', vol: 0.09, slide: 1.35 }); this.tone(f * 2, 0.04, { type: 'triangle', vol: 0.03, delay: 0.005 }); },
  tab() { this._ui = performance.now(); this.tone(587, 0.08, { type: 'triangle', vol: 0.07 }); this.tone(880, 0.1, { type: 'sine', vol: 0.08, delay: 0.05 }); },
  back() { this._ui = performance.now(); this.tone(520, 0.1, { type: 'sine', vol: 0.08, slide: 0.7 }); },
  deny() { this._ui = performance.now(); this.tone(240, 0.09, { type: 'triangle', vol: 0.07 }); this.tone(200, 0.12, { type: 'triangle', vol: 0.07, delay: 0.07 }); },
  // the satisfaction pass
  ready(n) { this.tone(PENTA[Math.min(6 + n, 12)], 0.12, { type: 'sine', vol: 0.05, echo: true }); },   // the loop is about to close on something
  perfect(k) { const b = PENTA[Math.min(5 + k, 11)]; [1, 1.26, 1.5, 2].forEach((m, i) => this.tone(b * m, 0.22, { type: 'triangle', vol: 0.09, delay: i * 0.055, echo: true })); this.tone(b * 4, 0.3, { vol: 0.03, delay: 0.2, echo: true }); },
  nice() { this.tone(PENTA[7], 0.14, { type: 'triangle', vol: 0.07, echo: true }); this.tone(PENTA[9], 0.16, { type: 'triangle', vol: 0.06, delay: 0.07, echo: true }); },
  goldPop() { [1568, 1976, 2349, 3136].forEach((f, i) => this.tone(f, 0.09, { type: 'triangle', vol: 0.05, delay: i * 0.04 })); this.noise(0.05, 0.03, 6000, 'highpass'); },
  rainbowPop() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.16, { type: 'sine', vol: 0.055, delay: i * 0.045, echo: true })); },
  legendPop() { [392, 587, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.08, delay: i * 0.03, echo: true })); this.tone(98, 0.5, { vol: 0.12, slide: 0.6 }); },
  clutch() { this.tone(110, 0.5, { vol: 0.2, slide: 0.5 }); [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.08, delay: 0.12 + i * 0.06, echo: true })); },
  // Rope "scribble": looping noise whose volume follows finger speed.
  scribbleStart() {
    const c = this.ctx; if (!c || this.muted || this.scribble) return;
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; s.loop = true; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.5; g.gain.value = 0;
    s.connect(f).connect(g).connect(this.out); s.start();
    this.scribble = { s, f, g };
  },
  scribbleSpeed(v, len) {
    if (!this.scribble) return;
    const t = this.ctx.currentTime;
    this.scribble.g.gain.setTargetAtTime(Math.min(0.06, v * 0.00004), t, 0.03);
    this.scribble.f.frequency.setTargetAtTime(900 + Math.min(len, 200) * 8, t, 0.05);
  },
  scribbleStop() { if (this.scribble) { this.scribble.s.stop(); this.scribble = null; } },
  // The soundtrack lives in music.js (slow atmospheric moods per skin); this stays so the game loop can keep calling it.
  music() {},
};
Sfx.muted = Meta.S.muted;
// Every button, tab, dropdown and card in the app answers a tap with a sound. Code that already plays its own sound (Meta.sfx('click'), 'buy', ...)
// is left alone: the delegate waits one tick and only speaks if nothing UI-ish played. The runs themselves (canvas) are not buttons, so they stay quiet here.
document.addEventListener('click', e => {
  const b = e.target.closest?.('button, select, .tab, [data-tab], .card[role=button], label[for]');
  if (!b || b.closest('#practiceCard')) return;
  const t0 = performance.now();
  setTimeout(() => {
    if ((Sfx._ui || 0) >= t0 || b.dataset.silent != null) return;
    Sfx.init();
    if (b.disabled || b.classList.contains('locked')) Sfx.deny();
    else if (b.matches('.tab, [data-tab]')) Sfx.tab();
    else if (/✕|close|back|cancel|no thanks|exit/i.test(b.textContent + (b.getAttribute('aria-label') || ''))) Sfx.back();
    else Sfx.click();
  }, 0);
}, true);
Meta.runInfo = () => ({ state, skin, combo, frenzy, paused, danger: dangerNow }); // read by music.js (it ducks and adds a heartbeat when the pond is nearly full)
Meta.sfx = name => { Sfx.init(); Sfx._ui = performance.now(); Sfx[name === 'buy' ? 'chest' : name]?.(); };
$('mute').textContent = Sfx.muted ? '🔇' : '🔊';
$('mute').onclick = () => {
  Sfx.muted = Meta.S.muted = !Sfx.muted;
  Meta.save();
  $('mute').textContent = Sfx.muted ? '🔇' : '🔊';
  if (Sfx.muted) Sfx.scribbleStop();
};

// ---------- pond ----------
function resize() {
  // CrazyGames build: on a landscape window the whole world is drawn ZOOM times bigger (fish, sheep, balls, ropes, text), so a big monitor gets big
  // targets instead of a few tiny ones lost in a huge pond. The logical size W x H stays near what the game was balanced for (about 1100 x 640);
  // pointer input is divided by ZOOM in toWorld(). Portrait windows (phones, tablets) keep ZOOM 1 and are unchanged.
  const landscape = innerWidth > innerHeight * 1.1;
  ZOOM = landscape ? clamp(innerHeight / ZOOM_REF_H, 1, ZOOM_MAX) : 1;
  const dpr = DPR();
  W = innerWidth / ZOOM; H = innerHeight / ZOOM;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // The play area reaches to a few percent of the window edges (not all the way), under the HUD bars (96 real px).
  const mx = (landscape ? Math.max(14, innerWidth * 0.03) : 14) / ZOOM, mb = (landscape ? Math.max(14, innerHeight * 0.035) : 14) / ZOOM;
  screenB = { x0: mx, y0: 96 / ZOOM, x1: W - mx, y1: H - mb };
  updateBounds(0);
  paintPond();
  paintPasture();
  paintPlayroom();
  lights = Array.from({ length: 6 }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(60, 160), vx: rand(-8, 8), vy: rand(-6, 6) }));
}
// Static pond art (the equipped pond theme) is drawn once into an offscreen canvas.
function paintPond() {
  const dpr = DPR();
  bg = document.createElement('canvas');
  bg.width = W * dpr; bg.height = H * dpr;
  const g = bg.getContext('2d');
  g.scale(dpr, dpr);
  Meta.paintPond(g, W, H);
  Water.depth(g, W, H);
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 6;
  g.strokeRect(screenB.x0 - 4, screenB.y0 - 4, screenB.x1 - screenB.x0 + 8, screenB.y1 - screenB.y0 + 8);
}
// Sheep-skin art: a meadow with a fence border, painted once with a fixed seed so it never shimmers.
function paintPasture() {
  const dpr = DPR();
  bgPasture = document.createElement('canvas');
  bgPasture.width = W * dpr; bgPasture.height = H * dpr;
  const g = bgPasture.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  const th = Meta.skinTheme('sheep');
  sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  if (th.glow) { g.fillStyle = th.glow; g.fillRect(0, 0, W, H); }
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Mown stripes, then grass tufts and daisies.
  g.fillStyle = 'rgba(255,255,255,.05)';
  for (let y = 0; y < H; y += 80) g.fillRect(0, y, W, 40);
  g.strokeStyle = th.tuft; g.lineWidth = 2; g.lineCap = 'round';
  for (let i = 0; i < W * H / 5000; i++) {
    const x = r() * W, y = r() * H;
    g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x - 2, y - 7); g.moveTo(x, y); g.lineTo(x, y - 9); g.moveTo(x + 4, y); g.lineTo(x + 2, y - 7); g.stroke();
  }
  for (let i = 0; i < W * H / 14000; i++) {
    const x = r() * W, y = r() * H;
    if (th.decor === 'flowers') {
      g.fillStyle = '#ffffff';
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.257) * 3.5, y + Math.sin(k * 1.257) * 3.5, 2.2, 0, 6.28); g.fill(); }
      g.fillStyle = '#ffd84d'; g.beginPath(); g.arc(x, y, 2, 0, 6.28); g.fill();
    } else if (th.decor === 'leaves') {
      g.save(); g.translate(x, y); g.rotate(r() * 6.28);
      g.fillStyle = ['#c0392b', '#e67e22', '#f1c40f', '#a0522d'][i % 4]; g.beginPath(); g.ellipse(0, 0, 6, 3, 0, 0, 6.28); g.fill();
      g.strokeStyle = 'rgba(80,40,10,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke(); g.restore();
    } else if (th.decor === 'snow') {
      g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(x, y, 9, 4, 0, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(150,180,200,.35)'; g.beginPath(); g.ellipse(x + 2, y + 3, 9, 3, 0, 0, 6.28); g.fill();
    } else {
      const gl = g.createRadialGradient(x, y, 0, x, y, 14); gl.addColorStop(0, 'rgba(255,245,150,.9)'); gl.addColorStop(1, 'rgba(255,245,150,0)');
      g.fillStyle = gl; g.fillRect(x - 14, y - 14, 28, 28);
    }
  }
  if (th.decor === 'fireflies') { g.fillStyle = 'rgba(0,0,30,.2)'; g.fillRect(0, 0, W, H); }
  // Wooden fence around the play area.
  const { x0, y0, x1, y1 } = screenB;
  g.strokeStyle = th.fence[0]; g.lineWidth = 6;
  g.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
  g.fillStyle = th.fence[1];
  for (let x = x0; x <= x1; x += 40) { g.fillRect(x - 3, y0 - 10, 6, 12); g.fillRect(x - 3, y1 - 2, 6, 12); }
  for (let y = y0; y <= y1; y += 40) { g.fillRect(x0 - 10, y - 3, 12, 6); g.fillRect(x1 - 2, y - 3, 12, 6); }
}
// Toy-ball skin art: pastel foam play-mat tiles inside a rainbow play pen, with a few letter blocks.
function paintPlayroom() {
  const dpr = DPR();
  bgPlay = document.createElement('canvas');
  bgPlay.width = W * dpr; bgPlay.height = H * dpr;
  const g = bgPlay.getContext('2d');
  g.scale(dpr, dpr);
  const room = Meta.skinTheme('balls'), cols = room.tiles, T = 96;
  for (let y = 0, j = 0; y < H + T; y += T, j++) {
    for (let x = 0, i = 0; x < W + T; x += T, i++) {
      g.fillStyle = cols[(i + j * 2) % 4]; g.fillRect(x, y, T, T);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, y, T, 4); g.fillRect(x, y, 4, T);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y + T - 4, T, 4); g.fillRect(x + T - 4, y, 4, T);
      if (!room.neon && !room.pit) { g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(x + T / 2, y + T / 2, 11, 0, 6.28); g.fill(); }
    }
  }
  if (room.neon) { // glow room: neon seams between dark tiles
    g.strokeStyle = 'rgba(80,255,220,.7)'; g.lineWidth = 2; g.shadowColor = '#4dffe0'; g.shadowBlur = 8;
    for (let y = 0; y < H + T; y += T) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let x = 0; x < W + T; x += T) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.shadowBlur = 0;
  }
  if (room.pit) { // ball pit: a floor of little balls
    let seed = 11; const rn = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pc = ['#ff5d73', '#4cc9f0', '#ffd84d', '#7bd389', '#c86bfa', '#ff8a4c'];
    for (let i = 0; i < W * H / 1300; i++) {
      const x = rn() * W, y = rn() * H, rr = 11 + rn() * 4, c = pc[(rn() * 6) | 0];
      const bg2 = g.createRadialGradient(x - rr * 0.35, y - rr * 0.4, 1, x, y, rr);
      bg2.addColorStop(0, '#fff'); bg2.addColorStop(0.3, c); bg2.addColorStop(1, 'rgba(0,0,60,.5)');
      g.fillStyle = bg2; g.beginPath(); g.arc(x, y, rr, 0, 6.28); g.fill();
    }
  }
  if (room.pit) { g.fillStyle = 'rgba(20,35,90,.38)'; g.fillRect(0, 0, W, H); }
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(60,40,90,0)'); vg.addColorStop(1, 'rgba(60,40,90,.22)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // Letter blocks near the edges.
  [[0.12, 0.9, 'A', '#ff5d73', -0.2], [0.9, 0.22, 'B', '#4cc9f0', 0.25], [0.86, 0.9, 'C', '#ffd84d', -0.1], [0.1, 0.3, '1', '#7bd389', 0.3]].forEach(([fx, fy, ch, c, rot]) => {
    g.save(); g.translate(W * fx, H * fy); g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(-15, -13, 36, 36);
    g.fillStyle = c; g.fillRect(-18, -18, 36, 36);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(-18, -18, 36, 5);
    g.fillStyle = '#fff'; g.font = '700 24px Fredoka, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 0, 2);
    g.restore();
  });
  // Rainbow play-pen rails.
  const { x0, y0, x1, y1 } = screenB, rc = ['#ff5d73', '#ffb347', '#ffd84d', '#7bd389', '#4cc9f0', '#c86bfa'];
  g.lineCap = 'round';
  let k = 0;
  const rail = (xa, ya, xb, yb) => {
    const len = Math.hypot(xb - xa, yb - ya), n = Math.max(1, Math.round(len / 70));
    for (let s = 0; s < n; s++) {
      const a = s / n + 0.012, b = (s + 1) / n - 0.012, c = rc[k++ % 6];
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 11;
      g.beginPath(); g.moveTo(xa + (xb - xa) * a + 2, ya + (yb - ya) * a + 3); g.lineTo(xa + (xb - xa) * b + 2, ya + (yb - ya) * b + 3); g.stroke();
      g.strokeStyle = c; g.lineWidth = 9;
      g.beginPath(); g.moveTo(xa + (xb - xa) * a, ya + (yb - ya) * a); g.lineTo(xa + (xb - xa) * b, ya + (yb - ya) * b); g.stroke();
    }
  };
  rail(x0 - 4, y0 - 4, x1 + 4, y0 - 4); rail(x1 + 4, y0 - 4, x1 + 4, y1 + 4); rail(x1 + 4, y1 + 4, x0 - 4, y1 + 4); rail(x0 - 4, y1 + 4, x0 - 4, y0 - 4);
}
// The swim area in world units. When the view zooms out (Frenzy) the same screen holds more pond.
const viewCenter = () => ({ x: W / 2, y: (screenB.y0 + screenB.y1) / 2 });
function updateBounds(dt) {
  view += ((frenzy ? FRENZY_VIEW : 1) - view) * Math.min(1, dt * 2.5);
  const c = viewCenter();
  bounds = { x0: c.x - (c.x - screenB.x0) / view, x1: c.x + (screenB.x1 - c.x) / view,
    y0: c.y - (c.y - screenB.y0) / view, y1: c.y + (screenB.y1 - c.y) / view };
}
const toWorld = (sx, sy) => { sx /= ZOOM; sy /= ZOOM; const c = viewCenter(); return { x: c.x + (sx - c.x) / view, y: c.y + (sy - c.y) / view }; };
Meta.onEquip = cat => { if (cat === 'theme') { paintPond(); paintPasture(); paintPlayroom(); } };
addEventListener('resize', resize);

// ---------- fish ----------
// Ordinary fish have a color 0–4. 'gold' is wild for one-color catches. Special kinds:
// rainbow (makes any loop valid), bomb (pops every nearby fish, any color), clock (slow-mo),
// treasure (coins, swims off if ignored), king (rare giant, fills 40% of the Frenzy meter).
function makeFish(inside = true, opts = {}) {
  const roll = Math.random();
  const f = { color: Math.floor(Math.random() * colorCount(score)), size: rand(16, 21), species: -1,
    speed: rand(22, 42), phase: rand(0, 6), pop: 0, enter: !inside };
  if (opts.plain) { /* schools and frenzy waves are ordinary fish */ }
  else if (roll < mods.gold) f.color = 'gold';
  else if (roll < mods.gold + mods.special) {
    f.kind = SPECIALS[Math.floor(Math.random() * SPECIALS.length)];
    if (f.kind === 'rainbow') f.color = -1;
    if (f.kind === 'treasure') { f.life = 8; f.speed = 60; }
    if (f.kind === 'bomb') f.size *= 1.1;
  } else if (roll < mods.gold + mods.special + mods.rare) {
    const sp = Meta.rollSpecies(skin);
    f.species = sp.id;
    f.color = sp.color;
    if (sp.pat === 'tiny') f.size *= 0.7;
    if (sp.pat === 'chubby') f.size *= 1.1;
    if (sp.pat === 'lamb') f.size *= 0.82;
  }
  if (skin !== 'fish') { f.skin = skin; f.size *= SKINS[skin].scale; f.seed = Math.floor(Math.random() * 4); } // art only: the hit test and speed are unchanged
  if (frenzy) f.fromFrenzy = true; // Frenzy's bonus fish swim off again when it ends
  if (opts.at) { // surfaces in place: grows and fades in with a ripple
    f.x = opts.at.x; f.y = opts.at.y; f.a = rand(0, Math.PI * 2); f.enter = false; f.rise = 0;
    rings.push({ x: f.x, y: f.y, r: 4, life: 0.7, w: 3 });
  } else if (inside) {
    f.x = rand(bounds.x0 + 30, bounds.x1 - 30); f.y = rand(bounds.y0 + 30, bounds.y1 - 30); f.a = rand(0, Math.PI * 2);
  } else {
    // Swim in from a random edge toward a point inside.
    const side = Math.floor(Math.random() * 4);
    f.x = side === 0 ? bounds.x0 - 40 : side === 1 ? bounds.x1 + 40 : rand(bounds.x0, bounds.x1);
    f.y = side === 2 ? bounds.y0 - 40 : side === 3 ? bounds.y1 + 40 : rand(bounds.y0, bounds.y1);
    f.a = Math.atan2(rand(bounds.y0 + 60, bounds.y1 - 60) - f.y, rand(bounds.x0 + 60, bounds.x1 - 60) - f.x);
  }
  fish.push(f);
  return f;
}
const living = () => fish.filter(f => !f.pop && !f.caught && !f.leaving);
// The same count without building an array: the HUD, the director and the overflow check ask for it every frame.
function liveN() { let n = 0; for (const f of fish) if (!f.pop && !f.caught && !f.leaving) n++; return n; }
// The emptiest open water: of a few random spots, the one farthest from any fish (and not under the finger drawing a loop).
// Refills land in the holes a big catch leaves instead of all swimming in from the edges.
function openSpot(margin = 50) {
  let best = null, bd = -1;
  const tip = lasso && lasso.length ? lasso[lasso.length - 1] : null;
  for (let k = 0; k < 10; k++) {
    const x = rand(bounds.x0 + margin, bounds.x1 - margin), y = rand(bounds.y0 + margin, bounds.y1 - margin);
    if (tip && Math.hypot(tip.x - x, tip.y - y) < 90) continue;
    let d = 1e9;
    for (const f of fish) if (!f.pop && !f.caught && !f.leaving) { const q = (f.x - x) ** 2 + (f.y - y) ** 2; if (q < d) d = q; }
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return best || { x: rand(bounds.x0 + margin, bounds.x1 - margin), y: rand(bounds.y0 + margin, bounds.y1 - margin) };
}
// A small same-colored group bubbles up in open water, one after another: a ready-made loop.
function surfaceGroup(k) {
  const at = openSpot(), lead = makeFish(true, { at });
  const color = typeof lead.color === 'number' && lead.color >= 0 && !lead.kind ? lead.color : Math.floor(Math.random() * colorCount(score));
  for (let i = 1; i < k; i++) {
    const a = rand(0, Math.PI * 2), d = rand(20, 48);
    const f = makeFish(true, { plain: true, at: { x: clamp(at.x + Math.cos(a) * d, bounds.x0 + 30, bounds.x1 - 30), y: clamp(at.y + Math.sin(a) * d, bounds.y0 + 30, bounds.y1 - 30) } });
    f.color = color; f.rise = -i * 0.12; // staggered: they pop up one after another
  }
  if (skin === 'fish') Sfx.bubble();
  hudSoon();
}
// Fish still fleeing after Frenzy can be looped too (they're just fast and weave); they don't count toward the pond or owe a replacement.
const catchable = () => fish.filter(f => !f.pop && !f.caught && !(f.rise <= 0) && (!f.leaving || f.fromFrenzy));
const angleTo = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// The King: a giant golden fish that crosses the pond. Loop it before it leaves.
function spawnKing() {
  const fromLeft = Math.random() < 0.5;
  fish.push({ kind: 'king', skin: skin === 'fish' ? undefined : skin, seed: 0, color: -1, species: -1, size: 46, speed: 75, phase: 0, pop: 0, life: 9, enter: true,
    x: fromLeft ? bounds.x0 - 60 : bounds.x1 + 60, y: rand(bounds.y0 + 80, bounds.y1 - 80), a: fromLeft ? 0 : Math.PI });
  banner('👑 THE KING!', 'king');
  Sfx.king();
}

// ---------- how each skin behaves ----------
// Fish slip away from the tip of your rope, sheep stamp and then charge in sudden sprints, toy balls glide on momentum and bounce.
function evade(f, dt) {
  if (f.lazy === undefined) f.lazy = Math.random() < 0.3; // some fish don't bother
  if (f.lazy || !lasso || lasso.length < 2) return 1;
  const tip = lasso[lasso.length - 1], d = Math.hypot(f.x - tip.x, f.y - tip.y);
  if (d > 120) return 1;
  f.a += angleTo(f.a, Math.atan2(f.y - tip.y, f.x - tip.x)) * Math.min(1, dt * 5);
  return 1 + (1 - d / 120) * 0.6;
}
function sheepCharge(f, dt) {
  if (f.chT === undefined) f.chT = rand(1.5, 5);
  if (f.wind > 0) { // winding up: stamping in place with a "!" over its head, then off
    f.wind -= dt;
    if (f.wind <= 0) { f.charge = 0.9; f.a += rand(-0.7, 0.7); Meta.Music?.chargeGo(clamp((f.x - W / 2) / (W / 2), -1, 1) * 0.6); }
    return 0.1;
  }
  if (f.charge > 0) {
    f.charge -= dt;
    if ((f.dustT = (f.dustT || 0) - dt) <= 0) {
      f.dustT = 0.05;
      particles.push({ x: f.x - Math.cos(f.a) * f.size, y: f.y - Math.sin(f.a) * f.size + 6, vx: rand(-20, 20), vy: rand(-30, -5), life: 0.5, max: 0.5, color: 'rgba(235,220,180,.8)', size: rand(3, 6), g: 0 });
    }
    return 3.4;
  }
  if ((f.chT -= dt) <= 0) { f.wind = 0.4; f.chT = rand(3.5, 8); Meta.Music?.chargeWind(clamp((f.x - W / 2) / (W / 2), -1, 1) * 0.6); }
  return 1;
}
function moveBall(f, dt, speedMul, cx, cy) {
  const m = 36;
  if (f.vx === undefined) { f.vx = Math.cos(f.a) * f.speed; f.vy = Math.sin(f.a) * f.speed; }
  if (f.enter) { // arriving: roll in from the edge before the physics takes over
    const a = Math.atan2(cy - f.y, cx - f.x);
    f.vx = Math.cos(a) * 80; f.vy = Math.sin(a) * 80;
    if (f.x > bounds.x0 + m && f.x < bounds.x1 - m && f.y > bounds.y0 + m && f.y < bounds.y1 - m) f.enter = false;
  } else {
    if (f.flee > 0) { f.flee -= dt; f.vx = Math.cos(f.a) * 230; f.vy = Math.sin(f.a) * 230; }
    // No random movement: a ball just drifts gently. Only a bump from a ball of another color sends it rolling (see ballContacts),
    // and the shove fades back to the drift as it glides.
    if (f.drift === undefined) f.drift = rand(0, 6.28);
    f.drift += (Math.random() - 0.5) * dt * 1.2;
    const bs = f.speed * 0.45, k = Math.min(1, dt * 0.8);
    f.vx += (Math.cos(f.drift) * bs - f.vx) * k; f.vy += (Math.sin(f.drift) * bs - f.vy) * k;
    const v = Math.hypot(f.vx, f.vy);
    if (v > 190) { f.vx *= 190 / v; f.vy *= 190 / v; }
  }
  f.x += f.vx * speedMul * dt; f.y += f.vy * speedMul * dt;
  if (!f.enter) { // bounce off the sides of the playroom
    if (f.x < bounds.x0 + 20) { f.x = bounds.x0 + 20; f.vx = Math.abs(f.vx) * 0.9; f.drift = Math.atan2(f.vy, f.vx); }
    if (f.x > bounds.x1 - 20) { f.x = bounds.x1 - 20; f.vx = -Math.abs(f.vx) * 0.9; f.drift = Math.atan2(f.vy, f.vx); }
    if (f.y < bounds.y0 + 20) { f.y = bounds.y0 + 20; f.vy = Math.abs(f.vy) * 0.9; f.drift = Math.atan2(f.vy, f.vx); }
    if (f.y > bounds.y1 - 20) { f.y = bounds.y1 - 20; f.vy = -Math.abs(f.vy) * 0.9; f.drift = Math.atan2(f.vy, f.vx); }
  }
  f.a = Math.atan2(f.vy, f.vx);
  f.phase += dt * 6;
  f.roll = (f.roll || 0) + f.vx * speedMul * dt / (f.size * 0.9);
}

// Two toy balls of different colors that touch shove each other apart and roll away. Same color (and wild balls) ignore each other.
let lastBump = 0;
function ballContacts(dt) {
  if (skin !== 'balls') return;
  const balls = fish.filter(f => f.skin === 'balls' && f.kind !== 'king' && !f.pop && !f.caught && !f.leaving && !f.enter);
  for (const f of balls) if (f.hitT > 0) f.hitT -= dt;
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      if (typeof a.color !== 'number' || typeof b.color !== 'number' || a.color < 0 || b.color < 0 || a.color === b.color) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = (a.size + b.size) * 0.95;
      if (d >= min) continue;
      const nx = dx / d, ny = dy / d, push = (min - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; // pull them out of each other
      if (a.hitT > 0 || b.hitT > 0) continue; // one shove per touch
      a.hitT = b.hitT = 0.3;
      const k = 150 + Math.max(0, (a.vx - b.vx) * nx + (a.vy - b.vy) * ny) * 0.5;
      a.vx -= nx * k; a.vy -= ny * k; b.vx += nx * k; b.vy += ny * k;
      for (const [x, y, c] of [[a.x, a.y, a.color], [b.x, b.y, b.color]]) {
        for (let q = 0; q < 3; q++) particles.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: rand(-90, 90), vy: rand(-90, 90), life: 0.35, max: 0.35, color: COLORS[c].c, size: rand(2, 3.5), g: 0 });
      }
      if (performance.now() - lastBump > 70) { lastBump = performance.now(); Sfx.tone(rand(500, 700), 0.07, { type: 'triangle', vol: 0.05, slide: 1.4 }); }
    }
  }
}

function updateFish(dt) {
  const cx = (bounds.x0 + bounds.x1) / 2, cy = (bounds.y0 + bounds.y1) / 2;
  const speedMul = mods.speed * (slow ? 0.35 : 1) * (frenzy ? 1.15 : 1);
  for (const f of fish) {
    if (f.pop) { f.pop += dt * 6; continue; }
    if (f.rise < 1) f.rise = Math.min(1, f.rise + dt * 3.2);
    if (f.caught) {
      // Reeled in: slide toward the knot, wriggle, then pop on its turn.
      const k = f.caught;
      k.t += dt;
      f.x += (k.tx - f.x) * Math.min(1, dt * 9);
      f.y += (k.ty - f.y) * Math.min(1, dt * 9);
      f.phase += dt * 30;
      if (k.t >= k.delay) popFish(f);
      continue;
    }
    // Treasure fish and the King leave if you don't catch them in time.
    if (f.life !== undefined && !f.leaving && (f.life -= dt) <= 0) {
      f.leaving = true;
      f.a = f.x < cx ? Math.PI : 0;
    }
    if (f.leaving) {
      const run = f.fromFrenzy ? 3.2 : 2, weave = f.fromFrenzy ? Math.sin(f.phase * 0.5 + f.x * 0.02) * f.speed * 1.4 : 0; // Frenzy leftovers dart off, hard but not impossible to loop
      f.x += Math.cos(f.a) * f.speed * run * dt; f.y += (Math.sin(f.a) * f.speed * run + weave) * dt; f.phase += dt * 14;
      if (f.x < bounds.x0 - 160 || f.x > bounds.x1 + 160) f.gone = true;
      continue;
    }
    if (f.skin === 'balls' && f.kind !== 'king') { moveBall(f, dt, speedMul, cx, cy); continue; }
    const m = 36;
    const nearEdge = f.x < bounds.x0 + m || f.x > bounds.x1 - m || f.y < bounds.y0 + m || f.y > bounds.y1 - m;
    if (f.enter) {
      if (!nearEdge) f.enter = false;
    } else if (nearEdge && f.kind !== 'king') {
      f.a += angleTo(f.a, Math.atan2(cy - f.y, cx - f.x)) * dt * 3;   // turn back toward open water
    } else if (f.kind !== 'king') {
      f.a += (Math.random() - 0.5) * dt * (f.kind === 'treasure' ? 7 : 3); // lazy wandering (treasure darts about)
    }
    if (f.flee) f.flee -= dt;
    const quirk = f.kind === 'king' ? 1 : f.skin === 'sheep' ? sheepCharge(f, dt) : !f.skin ? evade(f, dt) : 1;
    const sp = f.speed * (f.flee > 0 ? 3.5 : 1) * speedMul * quirk;
    f.x += Math.cos(f.a) * sp * dt;
    f.y += Math.sin(f.a) * sp * dt;
    f.phase += dt * (6 + sp * 0.12);
    if (skin === 'fish' && (f.wakeT = (f.wakeT ?? rand(0, 0.8)) - dt) <= 0) {
      f.wakeT = rand(0.5, 1.1) / (frenzy ? 1.8 : 1);
      if (wakes.length < 140 && Math.random() < (frenzy ? 0.5 : 0.22) * (f.flee > 0 ? 2 : 1)) emitWake(f, sp);
    }
  }
  ballContacts(dt);
  fish = fish.filter(f => f.pop < 1 && !f.gone);
}

// A ripple spreads where the fish's tail was; in Frenzy it's brighter, longer-lived and comes with a streak.
function emitWake(f, sp) {
  const x = f.x - Math.cos(f.a) * f.size * 0.9, y = f.y - Math.sin(f.a) * f.size * 0.9, life = frenzy ? 1.1 : 0.85;
  const color = frenzy ? `hsl(${(performance.now() / 6 + x * 0.4) % 360},90%,72%)` : '#eafaff';
  wakes.push({ kind: 'ring', x, y, r: f.size * 0.35, grow: 16 + sp * 0.15, life, max: life, rot: f.a, color, a: frenzy ? 0.5 : 0.26 });
  if (frenzy) wakes.push({ kind: 'streak', x, y, len: 24 + sp * 0.25, life: 0.45, max: 0.45, rot: f.a, color, a: 0.45, grow: 0, r: 0 });
}
function drawWakes() {
  ctx.lineCap = 'round';
  for (const w of wakes) {
    const k = w.life / w.max;
    ctx.globalAlpha = k * w.a;
    ctx.strokeStyle = w.color;
    ctx.beginPath();
    if (w.kind === 'ring') { ctx.lineWidth = 0.6 + 1.6 * k; ctx.ellipse(w.x, w.y, w.r * 0.55, w.r, w.rot, 0, Math.PI * 2); }
    else { ctx.lineWidth = 2.4 * k + 0.6; ctx.moveTo(w.x, w.y); ctx.lineTo(w.x - Math.cos(w.rot) * w.len, w.y - Math.sin(w.rot) * w.len); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFish(f, t) {
  const rs = f.rise < 1 ? f.rise : 1; if (rs <= 0) return; // a surfacing fish that hasn't appeared yet
  const pop = rs < 1 ? 1 + 2.7 * (rs - 1) ** 3 + 1.7 * (rs - 1) ** 2 : 1; // ease out with a little overshoot
  const sc = (f.pop ? 1 + f.pop * 0.8 : f.caught ? (1 + Math.sin(f.phase) * 0.08) * (1 - 0.16 * clamp(f.caught.t / Math.max(0.01, f.caught.delay), 0, 1)) : 1) * (0.3 + 0.7 * pop); // a caught fish squeezes in just before it pops
  ctx.save();
  ctx.globalAlpha = (f.pop ? 1 - f.pop : f.life !== undefined && f.life < 2 && !f.caught ? 0.55 + Math.abs(Math.sin(t * 12)) * 0.45 : 1) * rs;
  ctx.translate(f.x, f.y);
  if (f.inLoop) ctx.translate(Math.sin(t * 45 + f.phase * 3) * 1.7 * (f.inLoop === 2 ? 1.6 : 1), Math.cos(t * 39 + f.phase * 2) * 1.7); // shivering inside the loop
  if (f.skin === 'balls') { // balls don't turn to face where they go; they roll
    ctx.scale(sc, sc);
    drawBall(f, t);
    if (f.kind !== 'king') Meta.drawAcc(ctx, 'balls', f.size, t + f.phase * 0.1);
    ctx.restore();
    return;
  }
  if (f.wind > 0) ctx.translate(Math.sin(t * 70) * 1.8, 0); // stamping before a charge
  if (f.skin === 'sheep') {
    // A sheep stays on its feet: it only ever faces left or right (kept while it heads mostly up or down) and leans a touch toward
    // where it is going, so its hooves are always on the ground even when it walks diagonally. Fish still turn to face their heading.
    if (Math.abs(Math.cos(f.a)) > 0.2 || !f.face) f.face = Math.cos(f.a) >= 0 ? 1 : -1;
    ctx.rotate(f.caught ? Math.sin(f.phase) * 0.3 : Math.sin(f.a) * 0.1 * f.face);
    ctx.scale(sc * f.face, sc);
    drawSheep(f, t); if (f.kind !== 'king') Meta.drawAcc(ctx, 'sheep', f.size, t + f.phase * 0.1);
  } else {
    ctx.rotate(f.a + (f.caught ? Math.sin(f.phase) * 0.3 : 0));
    // Keep fish upright (and their hats on top) when swimming left.
    ctx.scale(sc, Math.cos(f.a) < 0 ? -sc : sc);
    Meta.drawFishBody(ctx, f, t);
  }
  if (f.kind !== 'king' && !f.skin) Meta.drawHat(ctx, f.size, t + f.phase * 0.1);
  ctx.restore();
  if (f.wind > 0) { // warning mark over a sheep about to charge
    ctx.save(); ctx.fillStyle = '#ff5d73'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.font = '700 24px Fredoka, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText('!', f.x, f.y - f.size * 1.35); ctx.fillText('!', f.x, f.y - f.size * 1.35); ctx.restore();
  }
}

// Wool and rubber take the fish color groups; legendary breeds and toys get their own palettes.
const SKIN_PALETTES = {
  dragonegg: { c: '#7a1d3a', d: '#ffb347' }, blackhole: { c: '#0a0614', d: '#9d4edd' },
  golden: GOLD, glitterball: GOLD, cloud: { c: '#dff3ff', d: '#9cc9e8' }, galaxy: { c: '#2b1055', d: '#9d4edd' }, spirit: { c: '#bff5e6', d: '#6fd1b5' },
  disco: { c: '#cfd6dd', d: '#8b97a3' }, crystal: { c: '#aee9ff', d: '#5bb8dd' }, cosmic: { c: '#1b1055', d: '#7b2cbf' }, pearl: { c: '#fbeff5', d: '#e6b8cc' },
};
function skinColors(f, t) {
  if (f.dark) return { c: '#3d3d52', d: '#1b1b28' }; // the black sheep of the sheep minigame
  const sk = f.skin === 'sheep' || f.skin === 'balls' ? f.skin : null, sp = sk && f.species >= 0 ? Meta.speciesOf(sk)[f.species] : null;
  if (sp && sp.pat === 'rainbowball') return { c: `hsl(${(t * 140) % 360},90%,62%)`, d: `hsl(${(t * 140 + 50) % 360},80%,42%)` };
  if (sp && sp.pat === 'rainbowwool') return { c: `hsl(${(t * 120) % 360},85%,70%)`, d: `hsl(${(t * 120 + 40) % 360},75%,50%)` };
  if (sp && SKIN_PALETTES[sp.pat]) return SKIN_PALETTES[sp.pat];
  return Meta.fishColors(f, t);
}
const skinPat = f => (f.species >= 0 ? Meta.speciesOf(f.skin)[f.species].pat : '');

// A toy ball: color is the fish color so the one-color rule reads the same; four patterns, rolling as it moves.
const NOROLL = new Set(['eight', 'fire', 'alien', 'panda', 'robot', 'ghost', 'penguin', 'ladybug', 'bee', 'eyeball', 'sun', 'yinyang', 'dice', 'cheese', 'cookie', 'pingpong']);
const OWNFACE = new Set(['alien', 'panda', 'robot', 'ghost', 'penguin', 'ladybug', 'bee', 'eyeball', 'sun', 'smiley', 'yinyang']);
// add-ons that go with a particular picture (the rest are picked by id)
const PATBX = { panda: 'panda', bee: 'wings', ladybug: 'antenna', robot: 'antenna', penguin: 'feet', pumpkin: 'stem', blackhole: 'ring', planet: 'ring', donut: 'none', eight: 'none', dice: 'none', cookie: 'none', cheese: 'none', baseball: 'none', ghost: 'none', yinyang: 'none', moon: 'none', eyeball: 'none', dragonegg: 'none', fire: 'none', pingpong: 'none', cricket: 'none', globe: 'none', basketball: 'none', tennis: 'none', golf: 'none', bowling: 'none', volley: 'none', soccer: 'none', sun: 'none', alien: 'none' };
function drawBall(f, t) {
  const r = f.size * 0.95, col = skinColors(f, t), roll = f.roll || 0;
  const pat = skinPat(f) || ['beach', 'polka', 'swirl', 'seams'][f.seed || 0];
  const still = NOROLL.has(pat); // pictures with a face or a number stay upright instead of rolling
  ctx.fillStyle = 'rgba(20,20,40,.22)';
  ctx.beginPath(); ctx.ellipse(r * 0.18, r * 0.78, r * 0.95, r * 0.45, 0, 0, 6.28); ctx.fill();
  // Each toy has its own add-on (ears, antenna, wings, spikes, a ring or feet) so the album reads as different toys, not recolors.
  const bid = f.species, bx = bid >= 0 ? PATBX[pat] || ['none', 'cat', 'bunny', 'antenna', 'wings', 'spikes', 'ring', 'feet', 'horns', 'leaf'][(bid * 7 + (bid >> 2)) % 10] : 'none';
  const face = bid >= 0 && !OWNFACE.has(pat) && !(pat in PATBX) && (bid * 3 + (bid >> 1)) % 3 === 0;
  const bcol = bid >= 0 ? ['#ffd23f', '#7bf6ff', '#ff7aa8', '#9bf06a', '#fff', '#ff9d3c'][(bid * 5) % 6] : '#fff';
  if (bx !== 'none') {
    ctx.fillStyle = col.d; ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
    const tri = (x, y, dx, dy, w) => { ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x + dx, y + dy); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill(); };
    if (bx === 'cat') { tri(-r * 0.55, -r * 0.72, -r * 0.1, -r * 0.55, r * 0.28); tri(r * 0.55, -r * 0.72, r * 0.1, -r * 0.55, r * 0.28); }
    else if (bx === 'bunny') { for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * r * 0.4, -r * 1.2, r * 0.2, r * 0.55, k * 0.15, 0, 6.28); ctx.fill(); ctx.fillStyle = 'rgba(255,190,210,.85)'; ctx.beginPath(); ctx.ellipse(k * r * 0.4, -r * 1.2, r * 0.09, r * 0.38, k * 0.15, 0, 6.28); ctx.fill(); ctx.fillStyle = col.d; } }
    else if (bx === 'antenna') { ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.quadraticCurveTo(r * 0.3, -r * 1.4, r * 0.1, -r * 1.55); ctx.stroke(); ctx.fillStyle = bcol; ctx.beginPath(); ctx.arc(r * 0.1, -r * 1.6, r * 0.2, 0, 6.28); ctx.fill(); }
    else if (bx === 'wings') { for (const k of [-1, 1]) { ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.ellipse(k * r * 0.95, -r * 0.2, r * 0.5, r * 0.25, k * -0.6, 0, 6.28); ctx.fill(); ctx.strokeStyle = col.d; ctx.lineWidth = 1.5; ctx.stroke(); } }
    else if (bx === 'spikes') { ctx.fillStyle = bcol; for (let i = 0; i < 10; i++) { const a = i * 0.6283; tri2(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, a, r * 0.32, r * 0.14); } }
    else if (bx === 'ring') { ctx.strokeStyle = bcol; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.5, r * 0.4, -0.35, 0, 6.28); ctx.stroke(); }
    else if (bx === 'feet') { ctx.fillStyle = bcol; for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * r * 0.45, r * 0.95, r * 0.3, r * 0.17, 0, 0, 6.28); ctx.fill(); } }
    else if (bx === 'horns') { ctx.fillStyle = bcol; tri(-r * 0.5, -r * 0.8, -r * 0.18, -r * 0.55, r * 0.14); tri(r * 0.5, -r * 0.8, r * 0.18, -r * 0.55, r * 0.14); }
    else if (bx === 'panda') { ctx.fillStyle = '#26242c'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * r * 0.62, -r * 0.7, r * 0.3, 0, 6.28); ctx.fill(); } }
    else if (bx === 'stem') { ctx.fillStyle = '#6b8e23'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-r * 0.1, -r * 1.3, r * 0.2, r * 0.42, r * 0.06) : ctx.rect(-r * 0.1, -r * 1.3, r * 0.2, r * 0.42); ctx.fill(); ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(r * 0.26, -r * 1.05, r * 0.3, r * 0.12, -0.5, 0, 6.28); ctx.fill(); }
    else if (bx === 'leaf') { ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 1.12, r * 0.4, r * 0.17, -0.5, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.ellipse(r * 0.22, -r * 1.1, r * 0.4, r * 0.17, 0.5, 0, 6.28); ctx.fill(); }
  }
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.clip();
  ctx.fillStyle = col.c; ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.rotate(still ? 0 : roll);
  const dots = (pts, fill, k = 1) => { ctx.fillStyle = fill; for (const [x, y, s] of pts) { ctx.beginPath(); ctx.arc(x * r, y * r, s * r * k, 0, 6.28); ctx.fill(); } };
  switch (pat) {
    case 'beach':
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 6; i += 2) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 1.5, i * Math.PI / 3, (i + 1) * Math.PI / 3); ctx.closePath(); ctx.fill(); }
      dots([[0, 0, 0.2]], col.d); break;
    case 'polka': dots([[-0.45, -0.35, 0.2], [0.4, -0.4, 0.17], [0, 0.05, 0.22], [-0.5, 0.5, 0.16], [0.5, 0.45, 0.2], [0.05, -0.75, 0.13]], 'rgba(255,255,255,.88)'); break;
    case 'swirl':
      ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.24; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.58, 0.4, 4.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 3.6, 7.4); ctx.stroke(); break;
    case 'checker':
      ctx.fillStyle = col.d;
      for (let i = -3; i < 3; i++) for (let j = -3; j < 3; j++) if ((i + j) & 1) ctx.fillRect(i * r / 2.2, j * r / 2.2, r / 2.2, r / 2.2);
      break;
    case 'stripes':
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = -3; i <= 3; i += 2) { ctx.save(); ctx.rotate(0.6); ctx.fillRect(-r * 2, i * r * 0.28 - r * 0.1, r * 4, r * 0.2); ctx.restore(); }
      break;
    case 'soccer':
      ctx.fillStyle = '#fff'; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = col.d;
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 1.2566; ctx.lineTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36); } ctx.fill();
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 1.2566 + 0.63; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3, 0, 6.28); ctx.fill(); }
      break;
    case 'smiley':
      dots([[-0.3, -0.2, 0.12], [0.3, -0.2, 0.12]], col.d);
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0.05, r * 0.5, 0.35, Math.PI - 0.35); ctx.stroke(); break;
    case 'star':
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * 0.6283, rr = i % 2 ? r * 0.28 : r * 0.7; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.fill(); break;
    case 'marble':
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = r * 0.18; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.2); ctx.bezierCurveTo(-r * 0.3, -r * 0.9, r * 0.3, r * 0.6, r, r * 0.1); ctx.stroke();
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.1;
      ctx.beginPath(); ctx.moveTo(-r, r * 0.5); ctx.bezierCurveTo(-r * 0.2, r * 0.1, r * 0.4, r * 1.1, r, r * 0.6); ctx.stroke(); break;
    case 'disco':
      for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) {
        const k = (i * 7 + j * 3 + 20) % 4;
        ctx.fillStyle = ['#e6edf3', '#aeb9c4', '#ffffff', '#c9a0ff'][k]; ctx.fillRect(i * r / 3.2 + 0.7, j * r / 3.2 + 0.7, r / 3.2 - 1.4, r / 3.2 - 1.4);
      }
      break;
    case 'glitterball':
      for (let i = 0; i < 14; i++) { const a = i * 2.4 + t * (i % 3 ? 1.2 : -0.9); dots([[Math.cos(a) * r * (0.2 + (i % 5) * 0.14), Math.sin(a) * r * (0.2 + (i % 4) * 0.17), 0.06]], i % 2 ? '#fff' : '#fff1a8'); }
      break;
    case 'crystal':
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(0, -r * 0.7); ctx.lineTo(r, 0); ctx.lineTo(0, r * 0.7); ctx.closePath();
      ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke(); break;
    case 'cosmic':
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.3; ctx.beginPath(); ctx.arc(-r * 0.2, r * 0.1, r * 0.55, 0.2, 4.2); ctx.stroke();
      for (let i = 0; i < 9; i++) dots([[Math.cos(i * 2.1) * r * 0.8, Math.sin(i * 3.3) * r * 0.8, 0.05 + (i % 3) * 0.015]], '#fff');
      break;
    case 'pearl':
      ctx.fillStyle = 'rgba(180,220,255,.25)'; ctx.fillRect(-r, -r, r, r * 2); ctx.fillStyle = 'rgba(255,200,230,.25)'; ctx.fillRect(0, -r, r, r * 2); break;
    case 'basketball':
      ctx.strokeStyle = '#2b1408'; ctx.lineWidth = r * 0.09; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
      ctx.beginPath(); ctx.arc(-r * 1.25, 0, r * 0.95, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.8, Math.PI + 0.8); ctx.stroke();
      dots([[-0.5, -0.5, 0.02], [0.4, -0.6, 0.02], [0.55, 0.45, 0.02], [-0.45, 0.55, 0.02], [0.1, 0.3, 0.02], [-0.2, -0.3, 0.02]], 'rgba(60,25,5,.5)'); break;
    case 'donut':
      ctx.fillStyle = '#e9b46f'; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.fillStyle = col.c; ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const a = i * 0.2618, rr = r * (0.84 + 0.07 * (i % 2)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.fill();
      for (let i = 0; i < 16; i++) { const a = i * 2.4, d = r * (0.38 + (i % 5) * 0.09); ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(i); ctx.fillStyle = ['#fff', '#ffd84d', '#4cc9f0', '#7bd389'][i % 4]; ctx.fillRect(-r * 0.07, -r * 0.02, r * 0.14, r * 0.04); ctx.restore(); }
      ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 6.28); ctx.fill(); ctx.fillStyle = '#5a3818'; ctx.beginPath(); ctx.arc(0, r * 0.03, r * 0.17, 0, 6.28); ctx.fill(); break;
    case 'bowling':
      ctx.fillStyle = col.d; ctx.fillRect(-r, -r, r * 2, r * 2);
      dots([[-0.15, -0.34, 0.095], [0.15, -0.34, 0.095], [0, -0.08, 0.11]], '#0f0818');
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 2.2, 3.4); ctx.stroke(); break;
    case 'tennis':
      ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-r * 1.25, 0, r * 0.95, -0.85, 0.85); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.85, Math.PI + 0.85); ctx.stroke();
      for (let i = 0; i < 22; i++) dots([[Math.cos(i * 2.3) * r * 0.8, Math.sin(i * 3.1) * r * 0.8, 0.018]], 'rgba(255,255,255,.55)'); break;
    case 'pumpkin':
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round';
      for (const k of [-0.9, -0.45, 0, 0.45, 0.9]) { ctx.beginPath(); ctx.moveTo(k * r * 0.5, -r); ctx.quadraticCurveTo(k * r * 1.35, 0, k * r * 0.5, r); ctx.stroke(); } break;
    case 'volley':
      ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i * 2.094); ctx.lineWidth = r * 0.3; ctx.beginPath(); ctx.arc(0, r * 1.45, r * 1.25, -2.3, -0.85); ctx.stroke(); ctx.lineWidth = r * 0.05; ctx.strokeStyle = col.d; ctx.beginPath(); ctx.arc(0, r * 1.45, r * 1.45, -2.3, -0.85); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.restore(); } break;
    case 'pizza':
      ctx.fillStyle = '#ffcf5a'; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.strokeStyle = '#d88a3a'; ctx.lineWidth = r * 0.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.93, 0, 6.28); ctx.stroke();
      dots([[-0.4, -0.35, 0.17], [0.38, -0.4, 0.15], [0.05, 0.05, 0.17], [-0.5, 0.35, 0.14], [0.45, 0.4, 0.16], [0.02, -0.7, 0.1]], '#d9382a');
      dots([[-0.4, -0.38, 0.06], [0.04, 0.02, 0.06], [0.42, 0.38, 0.06]], 'rgba(120,20,10,.55)'); dots([[-0.15, -0.55, 0.05], [0.6, 0.0, 0.05], [-0.25, 0.55, 0.05]], '#5fae4a'); break;
    case 'watermelon':
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round';
      for (const k of [-0.75, -0.38, 0, 0.38, 0.75]) { ctx.beginPath(); ctx.moveTo(k * r * 0.7, -r); ctx.bezierCurveTo(k * r * 1.5, -r * 0.3, k * r * 0.1, r * 0.3, k * r * 1.4, r); ctx.stroke(); } break;
    case 'globe':
      ctx.fillStyle = '#4cae5c'; for (const [x, y, a, b, rot] of [[-0.35, -0.2, 0.34, 0.22, 0.5], [0.3, 0.15, 0.28, 0.4, -0.3], [-0.05, 0.6, 0.22, 0.12, 0], [0.62, -0.5, 0.18, 0.12, 0.7], [-0.8, 0.4, 0.2, 0.14, 0.2]]) { ctx.beginPath(); ctx.ellipse(x * r, y * r, a * r, b * r, rot, 0, 6.28); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.5, r, 0, 0, 6.28); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke(); break;
    case 'eight':
      ctx.fillStyle = col.d; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `700 ${r * 0.7}px Fredoka, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('8', 0, r * 0.04); break;
    case 'yarn':
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(0, 0, r * (0.95 - i * 0.08), r * (0.35 + i * 0.1), i * 0.55 + 0.3, 0.3, 4.9); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = r * 0.04; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(0, 0, r * (0.9 - i * 0.12), r * (0.5 + i * 0.1), i * 0.9, 1, 5); ctx.stroke(); } break;
    case 'fire':
      ctx.fillStyle = '#ff6a1f'; ctx.fillRect(-r, -r, r * 2, r * 2);
      for (const [x, h, c] of [[-0.55, 0.9, '#ff9d1f'], [-0.2, 1.3, '#ffcf33'], [0.2, 1.1, '#ff9d1f'], [0.55, 0.8, '#ffcf33']]) {
        const w = Math.sin(t * 6 + x * 9) * r * 0.05; ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x * r - r * 0.28, r); ctx.quadraticCurveTo(x * r - r * 0.25 + w, r * 0.2, x * r + w, r - h * r * 1.1); ctx.quadraticCurveTo(x * r + r * 0.25 + w, r * 0.2, x * r + r * 0.28, r); ctx.fill();
      }
      ctx.fillStyle = '#fff6c4'; ctx.beginPath(); ctx.ellipse(0, r * 0.55, r * 0.22, r * 0.34, 0, 0, 6.28); ctx.fill(); break;
    case 'alien':
      ctx.save(); for (const k of [-1, 1]) { ctx.translate(0, 0); ctx.fillStyle = '#10151a'; ctx.beginPath(); ctx.ellipse(k * r * 0.34, -r * 0.05, r * 0.27, r * 0.16, k * 0.55, 0, 6.28); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(k * r * 0.28, -r * 0.1, r * 0.05, 0, 6.28); ctx.fill(); } ctx.restore();
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.arc(0, r * 0.28, r * 0.15, 0.2, Math.PI - 0.2); ctx.stroke(); break;
    case 'snowball':
      ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * 1.047); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.78); ctx.moveTo(0, -r * 0.45); ctx.lineTo(r * 0.16, -r * 0.62); ctx.moveTo(0, -r * 0.45); ctx.lineTo(-r * 0.16, -r * 0.62); ctx.stroke(); ctx.restore(); }
      dots([[-0.75, -0.2, 0.04], [0.7, 0.3, 0.04], [0.1, 0.85, 0.04]], 'rgba(255,255,255,.8)'); break;
    case 'golf':
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const px = (x + (y & 1) * 0.5) * r * 0.3, py = y * r * 0.26; if (Math.hypot(px, py) < r * 1.05) dots([[px / r, py / r, 0.075]], 'rgba(255,255,255,.5)'); } break;
    case 'sun':
      ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#ffb703'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round'; for (let i = 0; i < 10; i++) { const a = i * 0.6283 + t * 0.6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); ctx.stroke(); }
      dots([[-0.2, -0.1, 0.06], [0.2, -0.1, 0.06]], '#5a3a0a'); ctx.strokeStyle = '#5a3a0a'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.arc(0, 0.04 * r, r * 0.26, 0.3, Math.PI - 0.3); ctx.stroke(); break;
    case 'planet':
      for (const [y, h, c] of [[-0.6, 0.18, 'rgba(255,255,255,.28)'], [-0.15, 0.22, 'rgba(0,30,90,.28)'], [0.35, 0.2, 'rgba(255,255,255,.22)'], [0.75, 0.14, 'rgba(0,30,90,.3)']]) { ctx.fillStyle = c; ctx.fillRect(-r, y * r - h * r / 2, r * 2, h * r); }
      ctx.fillStyle = 'rgba(0,20,70,.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.28, r * 0.12, r * 0.2, r * 0.12, 0, 0, 6.28); ctx.fill(); break;
    case 'pinball':
      ctx.fillStyle = '#cfd6e6'; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.fillStyle = col.d; ctx.fillRect(-r, r * 0.1, r * 2, r);
      dots([[-0.4, -0.35, 0.2], [0.4, -0.35, 0.2], [0, 0.35, 0.22]], '#ff4d6d'); dots([[-0.4, -0.35, 0.1], [0.4, -0.35, 0.1], [0, 0.35, 0.11]], '#ffe3ea');
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = r * 0.05; ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * 0.1); ctx.lineTo(r * 0.9, r * 0.1); ctx.stroke(); break;
    case 'kiwi':
      ctx.fillStyle = '#a2d86b'; ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, 6.28); ctx.fill(); ctx.fillStyle = '#f4f9d6'; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, 6.28); ctx.fill();
      for (let i = 0; i < 14; i++) { const a = i * 0.4488; ctx.save(); ctx.translate(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.rotate(a); ctx.fillStyle = '#26210f'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.07, r * 0.035, 0, 0, 6.28); ctx.fill(); ctx.restore(); }
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, 6.28); ctx.stroke(); break;
    case 'eyeball':
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(220,60,70,.55)'; ctx.lineWidth = 1.2; for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.lineTo(Math.cos(a + 0.2) * r * 0.5, Math.sin(a + 0.2) * r * 0.5); ctx.stroke(); }
      { const lx = Math.sin(t * 1.3) * r * 0.1, ly = Math.cos(t * 0.9) * r * 0.06; ctx.fillStyle = col.d; ctx.beginPath(); ctx.arc(lx, ly, r * 0.38, 0, 6.28); ctx.fill(); ctx.fillStyle = '#0d0d12'; ctx.beginPath(); ctx.arc(lx, ly, r * 0.2, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx - r * 0.1, ly - r * 0.1, r * 0.07, 0, 6.28); ctx.fill(); } break;
    case 'cookie':
      ctx.fillStyle = '#c9965b'; ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, 6.28); ctx.fill();
      dots([[-0.35, -0.3, 0.13], [0.3, -0.35, 0.11], [0.05, 0.05, 0.14], [-0.4, 0.38, 0.1], [0.4, 0.3, 0.13], [0.0, -0.62, 0.08]], '#4a2a12'); dots([[-0.1, 0.55, 0.05], [0.62, -0.05, 0.05]], '#8a5a2b'); break;
    case 'cricket':
      ctx.strokeStyle = '#f4ead2'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke(); ctx.lineWidth = r * 0.035;
      for (let i = -5; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.17, -r * 0.14); ctx.lineTo(i * r * 0.17 + r * 0.05, r * 0.14); ctx.stroke(); } break;
    case 'pingpong':
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, 6.28); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * 0.6283, rr = i % 2 ? r * 0.07 : r * 0.17; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.fill(); break;
    case 'yinyang':
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, 6.28); ctx.fill(); ctx.fillStyle = '#1c1c28'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, -Math.PI / 2, Math.PI / 2); ctx.arc(0, r * 0.4, r * 0.4, Math.PI / 2, -Math.PI / 2, true); ctx.arc(0, -r * 0.4, r * 0.4, Math.PI / 2, -Math.PI / 2); ctx.fill();
      dots([[0, -0.4, 0.12]], '#1c1c28'); dots([[0, 0.4, 0.12]], '#fff'); break;
    case 'moon':
      ctx.fillStyle = '#d9dae4'; ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, 6.28); ctx.fill();
      for (const [x, y, k] of [[-0.3, -0.3, 0.2], [0.35, 0.05, 0.15], [-0.1, 0.4, 0.13], [0.3, -0.5, 0.09], [-0.55, 0.15, 0.09]]) { dots([[x, y, k]], 'rgba(120,120,145,.55)'); dots([[x + k * 0.15, y + k * 0.15, k * 0.72]], 'rgba(190,190,210,.8)'); } break;
    case 'baseball': // two curved seams with stitches
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round';
      for (const k of [-1, 1]) {
        const cx = k * r * 1.35; ctx.beginPath(); ctx.arc(cx, 0, r * 0.95, k > 0 ? Math.PI - 0.95 : -0.95, k > 0 ? Math.PI + 0.95 : 0.95); ctx.stroke();
        ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.045;
        for (let i = -4; i <= 4; i++) { const a = (k > 0 ? Math.PI : 0) + i * 0.2, x = cx + Math.cos(a) * r * 0.95, y = Math.sin(a) * r * 0.95, nx = Math.cos(a), ny = Math.sin(a);
          ctx.beginPath(); ctx.moveTo(x - nx * r * 0.09 - ny * r * 0.05, y - ny * r * 0.09 + nx * r * 0.05); ctx.lineTo(x + nx * r * 0.09 - ny * r * 0.05, y + ny * r * 0.09 + nx * r * 0.05); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = r * 0.07;
      }
      break;
    case 'dice':
      ctx.fillStyle = '#fdfdfd'; ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, 6.28); ctx.fill();
      dots([[-0.38, -0.38, 0.13], [0.38, -0.38, 0.13], [-0.38, 0.38, 0.13], [0.38, 0.38, 0.13], [0, 0, 0.13]], '#1c1c28'); break;
    case 'cheese':
      ctx.fillStyle = '#ffd04a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, 6.28); ctx.fill();
      dots([[-0.4, -0.3, 0.17], [0.3, -0.4, 0.12], [0.1, 0.1, 0.2], [-0.45, 0.4, 0.11], [0.5, 0.35, 0.14], [-0.05, -0.65, 0.08]], '#e9a416'); dots([[0.1, 0.13, 0.12], [-0.4, -0.27, 0.1]], '#c27c0a'); break;
    case 'ladybug':
      ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(0, 0.12 * r, r * 0.8, 0, 6.28); ctx.fill(); ctx.strokeStyle = '#1c1114'; ctx.lineWidth = r * 0.06; ctx.beginPath(); ctx.moveTo(0, -r * 0.65); ctx.lineTo(0, r * 0.9); ctx.stroke();
      dots([[-0.38, -0.1, 0.14], [0.38, -0.1, 0.14], [-0.36, 0.42, 0.12], [0.36, 0.42, 0.12]], '#1c1114'); ctx.fillStyle = '#1c1114'; ctx.beginPath(); ctx.ellipse(0, -r * 0.62, r * 0.32, r * 0.22, 0, 0, 6.28); ctx.fill();
      dots([[-0.12, -0.64, 0.07], [0.12, -0.64, 0.07]], '#fff'); break;
    case 'bee':
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, 6.28); ctx.fill(); ctx.fillStyle = '#2a1d0a'; for (const y of [-0.25, 0.2, 0.62]) ctx.fillRect(-r, y * r - r * 0.08, r * 2, r * 0.17);
      dots([[-0.28, -0.52, 0.12], [0.28, -0.52, 0.12]], '#fff'); dots([[-0.26, -0.5, 0.06], [0.3, -0.5, 0.06]], '#111'); break;
    case 'penguin':
      ctx.fillStyle = '#24324f'; ctx.beginPath(); ctx.arc(0, 0, r * 0.88, 0, 6.28); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, r * 0.22, r * 0.55, r * 0.62, 0, 0, 6.28); ctx.fill();
      dots([[-0.2, -0.3, 0.12], [0.2, -0.3, 0.12]], '#fff'); dots([[-0.18, -0.28, 0.06], [0.22, -0.28, 0.06]], '#111'); ctx.fillStyle = '#ff9d1f'; ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 0.1); ctx.lineTo(r * 0.12, -r * 0.1); ctx.lineTo(0, r * 0.1); ctx.fill(); break;
    case 'panda':
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#26242c'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * r * 0.33, -r * 0.1, r * 0.2, r * 0.26, k * 0.4, 0, 6.28); ctx.fill(); }
      dots([[-0.33, -0.1, 0.07], [0.33, -0.1, 0.07]], '#fff'); ctx.fillStyle = '#26242c'; ctx.beginPath(); ctx.ellipse(0, r * 0.2, r * 0.12, r * 0.08, 0, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#26242c'; ctx.lineWidth = r * 0.05; ctx.beginPath(); ctx.arc(0, r * 0.22, r * 0.17, 0.3, Math.PI - 0.3); ctx.stroke(); break;
    case 'robot':
      ctx.fillStyle = '#aeb9c4'; ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, 6.28); ctx.fill(); ctx.fillStyle = '#1b2430'; ctx.fillRect(-r * 0.62, -r * 0.34, r * 1.24, r * 0.4);
      dots([[-0.3, -0.14, 0.11], [0.3, -0.14, 0.11]], '#4cf0c5'); ctx.fillStyle = '#4cf0c5'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * r * 0.14 - r * 0.04, r * 0.3, r * 0.08, r * 0.14);
      dots([[-0.7, 0.2, 0.05], [0.7, 0.2, 0.05]], '#6b7885'); break;
    case 'ghost':
      ctx.fillStyle = '#f4f7ff'; ctx.beginPath(); ctx.arc(0, -r * 0.08, r * 0.62, Math.PI, 0); ctx.lineTo(r * 0.62, r * 0.7); for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(r * (0.62 - i * 0.31 - 0.15), r * 0.45, r * (0.62 - (i + 1) * 0.31), r * 0.7); ctx.closePath(); ctx.fill();
      dots([[-0.2, -0.12, 0.1], [0.2, -0.12, 0.1]], '#2a3350'); ctx.fillStyle = '#2a3350'; ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * 0.09, r * 0.12, 0, 0, 6.28); ctx.fill(); break;
    case 'dragonegg':
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.06; for (let row = -4; row <= 4; row++) for (let x = -4; x <= 4; x++) { const px = (x + (row & 1) * 0.5) * r * 0.3, py = row * r * 0.24; if (Math.hypot(px, py) < r * 1.05) { ctx.beginPath(); ctx.arc(px, py, r * 0.14, 0, Math.PI); ctx.stroke(); } }
      { const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g2.addColorStop(0, `rgba(255,170,60,${0.35 + Math.sin(t * 3) * 0.15})`); g2.addColorStop(1, 'rgba(255,170,60,0)'); ctx.fillStyle = g2; ctx.fillRect(-r, -r, r * 2, r * 2); } break;
    case 'blackhole':
      for (let i = 0; i < 4; i++) { ctx.strokeStyle = ['#9d4edd', '#ff7ac8', '#4cc9f0', '#ffd23f'][i]; ctx.globalAlpha = 0.7; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(0, 0, r * (0.3 + i * 0.16), t * 2 + i, t * 2 + i + 3.4); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 6.28); ctx.fill(); break;
    case 'rainbowball':
      for (let i = 0; i < 6; i++) { ctx.fillStyle = `hsla(${i * 60 + t * 80},95%,62%,.75)`; ctx.fillRect(-r, -r + i * r / 3, r * 2, r / 3 + 1); }
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, 6.28); ctx.fill(); break;
    default: // 'seams': like a basketball
      ctx.strokeStyle = col.d; ctx.lineWidth = r * 0.13;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
      ctx.beginPath(); ctx.arc(-r * 1.25, 0, r * 0.95, -0.8, 0.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.8, Math.PI + 0.8); ctx.stroke();
  }
  ctx.rotate(still ? 0 : -roll);
  const sh = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05); // fixed light from the top left
  sh.addColorStop(0, 'rgba(255,255,255,.5)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,40,.38)');
  ctx.fillStyle = sh; ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  ctx.strokeStyle = col.d; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.16, r * 0.1, -0.7, 0, 6.28); ctx.fill();
  if (face) { // a little face on top of the pattern
    ctx.fillStyle = '#fff'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * r * 0.3, -r * 0.05, r * 0.17, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = '#10232b'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * r * 0.3 + r * 0.03, -r * 0.03, r * 0.08, 0, 6.28); ctx.fill(); }
    ctx.strokeStyle = '#10232b'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.arc(0, r * 0.18, r * 0.2, 0.3, Math.PI - 0.3); ctx.stroke();
  }
}
// a triangle pointing out of a ball's edge (spikes)
function tri2(x, y, a, len, w) {
  ctx.beginPath(); ctx.moveTo(x + Math.cos(a + 1.57) * w, y + Math.sin(a + 1.57) * w); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.lineTo(x + Math.cos(a - 1.57) * w, y + Math.sin(a - 1.57) * w); ctx.closePath(); ctx.fill();
}

// A sheep faces +x like a fish. Wool takes the fish's color so the one-color rule reads the same.
// What makes it read as a sheep (an earlier version was a smooth colored dome with a tiny black head, thin legs and antenna-like horns,
// which people took for a ladybug): a wide scalloped, curly cloud of wool; a big face (cream, tan, brown or charcoal) with sideways ears, a
// muzzle and a tuft of wool on the forehead; short, thick, dark legs with hooves; a fluffy tail; and horns only as thick ram curls.
function drawSheep(f, t) {
  const s = f.size, col = skinColors(f, t), w = Math.sin(f.phase * 0.5), pat = skinPat(f);
  if (pat === 'spirit') { ctx.globalAlpha *= 0.78; ctx.shadowColor = '#9ff0d8'; ctx.shadowBlur = 14; }
  ctx.fillStyle = 'rgba(20,60,20,.25)';
  ctx.beginPath(); ctx.ellipse(3, 6, s * 1.05, s * 0.7, 0, 0, 6.28); ctx.fill();
  // Each breed also gets its own face color, ears, horns, forehead tuft, socks and tail so the album and the pasture show distinct animals.
  const id = f.species, tr = id >= 0 && !f.dark ? {
    horns: ['none', 'curl', 'none', 'tiny'][(id * 3 + (id >> 2)) % 4], ears: ['floppy', 'wide'][(id * 2 + (id >> 1)) % 2],
    hair: ['topknot', 'bangs', 'topknot', 'none'][(id * 5 + (id >> 2) + 1) % 4], sock: ['#3a2f2a', '#fff', '#e0a060', '#7a4a2a', '#d17a9a'][(id * 7 + (id >> 3)) % 5],
    pom: id % 3 === 0, blush: id % 4 === 1, face: ['#f4e4c8', '#f4e4c8', '#e2c9a0', '#8b6a55', '#4a3d37'][(id * 3 + (id >> 1)) % 5],
  } : null;
  const face = tr ? tr.face : f.dark ? '#2f2a2a' : '#f4e4c8', darkFace = face === '#8b6a55' || face === '#4a3d37' || face === '#2f2a2a';
  const legCol = darkFace ? '#2f2622' : '#6b5646', hy = 0.02 * s + w * 0.8, hx = s * 1.0;
  ctx.lineCap = 'round';
  // Short, thick legs that trot with the walk cycle; a hoof on each.
  [[-0.55, 1], [-0.25, -1], [0.32, -1], [0.6, 1]].forEach(([x, d]) => {
    const fx = s * x + w * d * s * 0.14;
    ctx.strokeStyle = legCol; ctx.lineWidth = s * 0.2; ctx.beginPath(); ctx.moveTo(s * x, s * 0.25); ctx.lineTo(fx, s * 0.84); ctx.stroke();
    if (tr && tr.sock !== '#3a2f2a') { ctx.strokeStyle = tr.sock; ctx.lineWidth = s * 0.205; ctx.beginPath(); ctx.moveTo(s * x + (fx - s * x) * 0.72, s * 0.7); ctx.lineTo(fx, s * 0.82); ctx.stroke(); }
    ctx.fillStyle = '#241a15'; ctx.beginPath(); ctx.ellipse(fx, s * 0.88, s * 0.13, s * 0.06, 0, 0, 6.28); ctx.fill(); // hoof
  });
  // A fluffy little tail sticking out behind.
  const tail = (tr && tr.pom) ? 0.2 : 0.15, ty = -s * 0.1 + w * 2;
  ctx.fillStyle = col.d; ctx.beginPath(); ctx.arc(-s * 0.92, ty, s * (tail + 0.02), 0, 6.28); ctx.fill();
  ctx.fillStyle = col.c; ctx.beginPath(); ctx.arc(-s * 0.92, ty, s * tail, 0, 6.28); ctx.fill();
  // Ram horns: thick curls (an earlier thin pair looked like antennae), drawn behind the head.
  if (tr && tr.horns !== 'none') {
    ctx.lineCap = 'round';
    if (tr.horns === 'curl') for (const [lw, c2] of [[0.2, '#b8a47c'], [0.145, '#eadfc4']]) { ctx.strokeStyle = c2; ctx.lineWidth = s * lw; ctx.beginPath(); ctx.arc(s * 0.82, hy - s * 0.2, s * 0.17, 0.5, 4.9); ctx.stroke(); }
    else { ctx.fillStyle = '#eadfc4'; ctx.strokeStyle = '#b8a47c'; ctx.lineWidth = 1.5; for (const dx of [0.86, 1.04]) { ctx.beginPath(); ctx.ellipse(s * dx, hy - s * 0.27, s * 0.06, s * 0.085, 0.2, 0, 6.28); ctx.fill(); ctx.stroke(); } }
  }
  // The head: a long oval tipped a little downward, a lighter muzzle, a pink nose, a big shiny eye and a smile.
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(hx, hy, s * 0.37, s * 0.28, 0.16, 0, 6.28); ctx.fill();
  ctx.strokeStyle = darkFace ? 'rgba(0,0,0,.25)' : 'rgba(110,75,40,.28)'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.fillStyle = darkFace ? '#6b5648' : '#fbf0dc'; ctx.beginPath(); ctx.ellipse(hx + s * 0.29, hy + s * 0.07, s * 0.16, s * 0.12, 0.2, 0, 6.28); ctx.fill();
  ctx.fillStyle = darkFace ? '#e8a0a8' : '#e0808c'; ctx.beginPath(); ctx.ellipse(hx + s * 0.42, hy + s * 0.04, s * 0.05, s * 0.036, 0.2, 0, 6.28); ctx.fill();
  ctx.strokeStyle = darkFace ? 'rgba(255,230,210,.7)' : 'rgba(90,55,35,.6)'; ctx.lineWidth = s * 0.028; ctx.beginPath(); ctx.arc(hx + s * 0.3, hy + s * 0.09, s * 0.075, 0.25, 1.7); ctx.stroke();
  ctx.fillStyle = `rgba(255,120,140,${tr && tr.blush ? 0.6 : 0.3})`; ctx.beginPath(); ctx.ellipse(hx + s * 0.08, hy + s * 0.12, s * 0.09, s * 0.055, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(hx + s * 0.1, hy - s * 0.06, s * 0.085, s * 0.095, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#1b1411'; ctx.beginPath(); ctx.arc(hx + s * 0.125, hy - s * 0.05, s * 0.06, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx + s * 0.145, hy - s * 0.075, s * 0.022, 0, 6.28); ctx.fill();
  // The fleece: a wide cloud with a bumpy edge and a few curls, overlapping the back of the head and the neck.
  const bumps = [], N = pat === 'fluffy' ? 16 : 12;
  for (let i = 0; i < N; i++) { const a = i / N * 6.283 + 0.3; bumps.push([-0.08 + Math.cos(a) * 0.6, -0.03 + Math.sin(a) * 0.4, (pat === 'fluffy' ? 0.25 : 0.22) + (i % 3) * 0.025]); }
  const core = [[-0.08, -0.03, 0.5], [0.2, 0.0, 0.42], [-0.38, 0.0, 0.42], [0.05, -0.2, 0.42]];
  ctx.fillStyle = col.d; for (const [x, y, r] of [...bumps, ...core]) { ctx.beginPath(); ctx.arc(s * x, s * y, s * r + 1.6, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = col.c; for (const [x, y, r] of [...bumps, ...core]) { ctx.beginPath(); ctx.arc(s * x, s * y, s * r, 0, 6.28); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,.3)'; for (const [x, y, r] of bumps) { ctx.beginPath(); ctx.arc(s * x - s * 0.06, s * y - s * 0.07, s * r * 0.5, 0, 6.28); ctx.fill(); }
  ctx.strokeStyle = col.d; ctx.globalAlpha *= 0.5; ctx.lineWidth = s * 0.035; ctx.lineCap = 'round'; // curly wool
  for (const [x, y, r] of bumps) { ctx.beginPath(); ctx.arc(s * x + s * 0.02, s * y + s * 0.02, s * r * 0.5, 0.3, 4.4); ctx.stroke(); }
  ctx.globalAlpha /= 0.5;
  ctx.fillStyle = 'rgba(40,30,90,.12)'; ctx.beginPath(); ctx.ellipse(-s * 0.05, s * 0.4, s * 0.75, s * 0.15, 0, 0, 6.28); ctx.fill(); // soft shade under the fleece
  // Sideways ears, in front of the neck wool.
  const earFill = darkFace ? '#3a2f2a' : '#e2c9a0', earTilt = tr && tr.ears === 'wide' ? 0.12 : 0.6;
  ctx.fillStyle = earFill; ctx.beginPath(); ctx.ellipse(hx - s * 0.18, hy - s * (earTilt > 0.3 ? 0.02 : 0.14), s * 0.2, s * 0.075, earTilt > 0.3 ? 0.55 : -0.12, 0, 6.28); ctx.fill();
  ctx.fillStyle = 'rgba(245,170,170,.85)'; ctx.beginPath(); ctx.ellipse(hx - s * 0.17, hy - s * (earTilt > 0.3 ? 0.02 : 0.14), s * 0.11, s * 0.035, earTilt > 0.3 ? 0.55 : -0.12, 0, 6.28); ctx.fill();
  // A tuft of wool on the forehead.
  if (!tr || tr.hair !== 'none') {
    const tx = hx - s * 0.1, tyy = hy - s * 0.27, big = !tr || tr.hair === 'topknot';
    const tuft = big ? [[-0.1, 0.02, 0.13], [0.04, -0.02, 0.13], [-0.03, -0.1, 0.12]] : [[-0.14, 0.0, 0.08], [-0.02, 0.02, 0.08], [0.1, 0.0, 0.08]];
    ctx.fillStyle = col.d; for (const [x, y, r] of tuft) { ctx.beginPath(); ctx.arc(tx + s * x, tyy + s * y, s * r + 1.3, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = col.c; for (const [x, y, r] of tuft) { ctx.beginPath(); ctx.arc(tx + s * x, tyy + s * y, s * r, 0, 6.28); ctx.fill(); }
  }
  // Breed markings.
  const mark = (pts, fill, k = 1) => { ctx.fillStyle = fill; for (const [x, y, r] of pts) { ctx.beginPath(); ctx.arc(s * x, s * y, s * r * k, 0, 6.28); ctx.fill(); } };
  switch (pat) {
    case 'spots': mark([[-0.5, -0.05, 0.14], [0.05, -0.3, 0.12], [0.3, 0.12, 0.15], [-0.15, 0.3, 0.11]], 'rgba(40,30,30,.6)'); break;
    case 'striped': ctx.strokeStyle = col.d; ctx.globalAlpha *= 0.6; ctx.lineWidth = s * 0.08;
      for (const y of [-0.35, -0.12, 0.12, 0.35]) { ctx.beginPath(); ctx.moveTo(-s * 0.85, s * y); ctx.lineTo(s * 0.7, s * y); ctx.stroke(); }
      ctx.globalAlpha /= 0.6; break;
    case 'belled': ctx.strokeStyle = '#e63946'; ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.moveTo(s * 0.55, -s * 0.3); ctx.lineTo(s * 0.62, s * 0.2); ctx.stroke();
      mark([[0.62, 0.3, 0.1]], '#ffcf33'); break;
    case 'hearts': for (const [x, y] of [[-0.45, 0], [0.05, -0.28], [0.3, 0.15]]) { ctx.save(); ctx.translate(s * x, s * y); ctx.fillStyle = 'rgba(255,255,255,.85)'; heart(0, 0, s * 0.16); ctx.restore(); } break;
    case 'starry': ctx.fillStyle = 'rgba(255,255,255,.9)'; for (const [x, y, k] of [[-0.45, -0.05, 1], [0.0, -0.3, 0.8], [0.3, 0.1, 1.1], [-0.1, 0.28, 0.7]]) star(s * x, s * y, s * 0.12 * k, t * 0.8); break;
    case 'sunny': mark([[0, -0.02, 0.2]], '#ffd84d'); ctx.strokeStyle = '#ffb703'; ctx.lineWidth = s * 0.05;
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + t; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.24, s * -0.02 + Math.sin(a) * s * 0.24); ctx.lineTo(Math.cos(a) * s * 0.34, s * -0.02 + Math.sin(a) * s * 0.34); ctx.stroke(); }
      break;
    case 'golden': case 'cloud': ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) star(s * (-0.5 + i * 0.28), s * (Math.sin(i * 2.3) * 0.3), s * 0.06 * (0.6 + 0.4 * Math.sin(t * 4 + i * 2)), t); break;
    case 'galaxy': mark([[-0.5, -0.1, 0.04], [-0.1, -0.3, 0.05], [0.3, 0.05, 0.045], [0, 0.25, 0.04], [0.5, -0.1, 0.035]], '#fff'); mark([[-0.2, 0.05, 0.18]], 'rgba(200,120,255,.35)'); break;
  }
  ctx.shadowBlur = 0;
}

function star(x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}
function heart(x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.6);
  ctx.bezierCurveTo(x + s * 1.2, y - s * 0.2, x + s * 0.5, y - s, x, y - s * 0.35);
  ctx.bezierCurveTo(x - s * 0.5, y - s, x - s * 1.2, y - s * 0.2, x, y + s * 0.6);
  ctx.fill();
}
function drawParticle(p) {
  const k = Math.max(0, p.life / p.max);
  ctx.globalAlpha = k;
  ctx.fillStyle = p.color;
  switch (p.shape) {
    case 'star': star(p.x, p.y, p.size * (k + 0.3), p.rot); break;
    case 'heart': heart(p.x, p.y, p.size); break;
    case 'rect':
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8); ctx.restore(); break;
    case 'coin': // spinning coin: squash horizontally as it turns
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(Math.abs(Math.cos(p.rot)) + 0.05, 1);
      ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(-p.size * 0.25, -p.size * 0.25, p.size * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); break;
    default: ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function confettiBurst(x, y, n, speed = 1) {
  const cols = ['#ff006e', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#ffffff'];
  for (let k = 0; k < n; k++) {
    const a = rand(0, Math.PI * 2), sp = rand(120, 420) * speed;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, life: rand(0.8, 1.4), max: 1.4,
      color: cols[k % cols.length], size: rand(4, 7), shape: k % 3 ? 'rect' : 'star', rot: rand(0, 3), spin: rand(-10, 10), g: 300 });
  }
}

// ---------- lasso ----------
function insidePoly(x, y, pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}
// Which fish a loop holds and whether it's clean: one color (gold joins any), or any mix if a
// rainbow fish or the King is inside.
function judge(pts) {
  const caught = catchable().filter(f => insidePoly(f.x, f.y, pts));
  const wild = caught.some(f => f.kind === 'rainbow' || f.kind === 'king');
  const colors = new Set(caught.filter(f => f.color !== 'gold' && f.color !== -1).map(f => f.color));
  return { caught, wild, clean: caught.length > 0 && (wild || colors.size <= 1), color: colors.size === 1 ? [...colors][0] : undefined };
}

// How round is a drawn loop? 1 = a perfect circle. It uses how much the points' distances from the loop's centre vary, whether the loop goes
// all the way around, and how far it ends from where it began (a little overshoot is fine). Calibrated in node against wobbly circles
// (careful 0.90, typical 0.81, sloppy 0.64), ellipses (1.25:1 = 0.73), squares (0.61), open C shapes (0.2) and scribbles (0).
// A colour with a given transparency. Works for #rrggbb and hsl(...) (a rainbow loop's colour is hsl, and appending hex alpha to it threw).
function withAlpha(c, a) {
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  const m = /^hsl\((.+)\)$/.exec(c);
  return m ? `hsla(${m[1]},${a})` : c;
}
function loopQuality(pts) {
  const n = pts.length; if (n < 8) return { q: 0 };
  let cx = 0, cy = 0, per = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  for (let i = 1; i < n; i++) per += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let mean = 0; const r = pts.map(p => Math.hypot(p.x - cx, p.y - cy)); for (const v of r) mean += v; mean /= n;
  if (mean < 14 || per < 80) return { q: 0 };
  let varr = 0; for (const v of r) varr += (v - mean) ** 2;
  const cv = Math.sqrt(varr / n) / mean;
  let turn = 0;
  for (let i = 1; i < n; i++) { let d = Math.atan2(pts[i].y - cy, pts[i].x - cx) - Math.atan2(pts[i - 1].y - cy, pts[i - 1].x - cx); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d; }
  const gap = Math.hypot(pts[n - 1].x - pts[0].x, pts[n - 1].y - pts[0].y) / (2 * mean);
  const around = Math.min(1, Math.abs(turn) / (2 * Math.PI * 0.92));
  return { q: Math.max(0, 1 - cv * 3.4) * around * Math.max(0, 1 - Math.max(0, gap - 0.34) * 2.2) };
}

cv.addEventListener('pointerdown', e => {
  if (state !== 'play' || paused) return;
  lassoQ = 0; lassoReady = false;
  Sfx.init();
  Sfx.scribbleStart();
  lasso = [toWorld(e.clientX, e.clientY)];
  lastPointer = { x: e.clientX, y: e.clientY, t: performance.now() };
  liveCount = 0;
});
addEventListener('pointermove', e => {
  if (!lasso) return;
  const now = performance.now();
  const v = Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y) / Math.max(1, now - lastPointer.t) * 1000;
  lastPointer = { x: e.clientX, y: e.clientY, t: now };
  Sfx.scribbleSpeed(v, lasso.length);
  const p = lasso[lasso.length - 1], w = toWorld(e.clientX, e.clientY);
  if (Math.hypot(w.x - p.x, w.y - p.y) > 5) {
    lasso.push(w);
    // Anticipation: a tick each time another fish falls inside the loop, and a rising chime when the loop is about to close on a valid catch.
    const j = lasso.length > 6 ? judge(lasso) : null, n = j ? j.caught.length : 0;
    if (n > liveCount) Sfx.tick(n);
    liveCount = n;
    const toStart = Math.hypot(w.x - lasso[0].x, w.y - lasso[0].y);
    if (j && j.clean && n > 0 && lasso.length > 14 && toStart < 70) { if (!lassoReady) { lassoReady = true; Sfx.ready(n); } }
    else if (toStart > 110) lassoReady = false;
    lassoQ = lasso.length >= 14 ? loopQuality(lasso).q : 0; // the rope turns gold while the loop is round enough for a Perfect
    if (heat > 0.2) for (let k = 0; k < (heat > 0.6 ? 2 : 1); k++) // sparkles trail from the fingertip, more the hotter the combo
      particles.push({ x: w.x + rand(-5, 5), y: w.y + rand(-5, 5), vx: rand(-20, 20), vy: rand(-40, -8), life: rand(0.35, 0.6), max: 0.6, color: Math.random() < 0.5 ? '#fff6c4' : '#ffd84d', size: rand(2, 3.6), shape: 'star', rot: rand(0, 3), g: 0 });
  }
});
addEventListener('pointerup', () => {
  Sfx.scribbleStop(); lassoReady = false;
  if (!lasso) return;
  const pts = lasso;
  lasso = null;
  if (pts.length < 6 || state !== 'play') return;
  const r = judge(pts);
  if (!r.caught.length) return;
  r.clean ? catchFish(r, pts) : tangle(r.caught, pts);
});

function centroid(list) {
  return { x: list.reduce((a, f) => a + f.x, 0) / list.length, y: list.reduce((a, f) => a + f.y, 0) / list.length };
}

// A catch plays out over time: the rope cinches, fish are reeled in and pop one by one, then the finale.
function catchFish(r, pts) {
  const caught = [...r.caught], dangerBefore = liveN() / mods.cap;
  // Puffer bombs blow up every fish close by, whatever its color, and add them to the catch.
  let booms = 0;
  for (const b of caught.filter(f => f.kind === 'bomb')) {
    const extra = catchable().filter(f => !caught.includes(f) && Math.hypot(f.x - b.x, f.y - b.y) < 130);
    caught.push(...extra);
    booms++;
  }
  const n = caught.length, golds = caught.filter(f => f.color === 'gold').length;
  if (!frenzy) {
    const back = caught.filter(f => !f.leaving).length;
    // A big clear comes back as a surge (85% of it; the trickle covers the rest), starting just after the last pop.
    if (back >= 8) { surge += Math.round(back * 0.85); surgeT = Math.max(surgeT, 0.3 + back * (back > 10 ? 0.045 : 0.07)); }
    else owed = Math.min(owed + back, mods.cap);
  }
  const king = caught.some(f => f.kind === 'king');
  combo++;
  comboT = mods.comboTime;
  const left = r.color === undefined ? 0 : living().filter(f => f.color === r.color && !caught.includes(f)).length;
  const sweep = !r.wild && r.color !== undefined && n >= 5 && left <= n / 2; // 5+ fish, with at most half as many of that colour left behind (so at least 2/3 of that colour)
  // Score grows with the square of the catch, so one big loop beats many small ones.
  // A rainbow fish (or the King) makes any mix valid, which could wipe the whole board for a squared payout. So in a wild loop
  // only the first 10 fish pay at the full rate, the rest count 30% each, and the wild bonus is x1.5.
  const eff = r.wild && n > 10 ? 10 + (n - 10) * 0.3 : n;
  // Every multiplier except the fish count goes into `mult`, which is capped at MULT_CAP so stacked bonuses can't decide a whole run.
  let mult = Math.min(combo, 5) * (golds ? 2 : 1) * (r.wild ? 1.5 : 1) * (frenzy ? FRENZY_MULT : 1) * (sweep ? 1.5 : 1);
  // Round loops pay more: Perfect (x1.25, growing 0.05 per perfect in a row up to x1.45) and Nice (x1.1). A scribble or a square gets nothing extra.
  let perfect = 0, pmult = 1;
  const lq = loopQuality(pts).q;
  if (n >= 2) {
    if (lq >= PERFECT_Q) { perfectStreak++; pmult = 1.25 + Math.min(perfectStreak - 1, 4) * 0.05; perfect = 2; }
    else { perfectStreak = 0; if (lq >= NICE_Q) { pmult = 1.1; perfect = 1; } }
  }
  mult *= pmult;
  let total = Math.round(10 * eff * eff * Math.min(mult, MULT_CAP));
  if (king) total += KING_BONUS * Math.min(combo, 5);
  const c = centroid(caught);
  const ev = { n, eff, total, golds, sweep, popped: 0, c, color: r.color, wild: r.wild, king, booms, perfect, pmult, perfectStreak, dangerBefore,
    species: caught.filter(f => f.species >= 0).map(f => f.species),
    specials: caught.filter(f => f.kind && f.kind !== 'king').length,
    clocks: caught.some(f => f.kind === 'clock'), treasure: caught.filter(f => f.kind === 'treasure').length,
    nearSweep: !sweep && !r.wild && r.color !== undefined && n >= 4 && left <= n / 2 ? left : 0 };
  // Pop order: closest to the knot first.
  caught.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y));
  const gap = n > 10 ? 0.045 : 0.07;
  caught.forEach((f, i) => {
    const a = rand(0, Math.PI * 2), d = Math.min(30, 6 + n * 2) * Math.random();
    f.caught = { ev, i, t: 0, delay: 0.24 + i * gap, tx: c.x + Math.cos(a) * d, ty: c.y + Math.sin(a) * d };
  });
  const tint = perfect === 2 ? GOLD.c : r.wild ? `hsl(${(performance.now() / 4) % 360},90%,65%)` : r.color === undefined ? GOLD.c : COLORS[r.color].c;
  cinch = { pts: [...pts, pts[0]], c, t: 0, color: tint };
  if (booms) { Sfx.boom(); shake = 14; flash = 0.35; banner('💥 BOOM!'); }
  Sfx.cinch();
  if (SKINS[skin].hit) Sfx[SKINS[skin].hit]();
  if (combo >= 2) Sfx.comboUp(combo);
  hud();
}

function popFish(f) {
  const { ev, i } = f.caught;
  f.caught = null;
  f.pop = 0.01;
  const col = Meta.fishColors(f, performance.now() / 1000);
  ev.popped++;
  particles.push(...Meta.popParticles(f.x, f.y, col.c));
  // Every kind of fish pops its own way (one sound per catch, however many of that kind are in it).
  const spc = f.species >= 0 ? Meta.speciesOf(f.skin || 'fish')[f.species] : null;
  if (f.color === 'gold') { // gold bursts into coins
    for (let k = 0; k < 6; k++) { const a = rand(0, 6.28), sp = rand(80, 260); particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: rand(0.6, 1), max: 1, color: '#ffcf33', size: rand(5, 8), shape: 'coin', rot: rand(0, 3), g: 420 }); }
    if (!ev.goldSfx) { ev.goldSfx = true; Sfx.goldPop(); }
  } else if (f.kind === 'bomb') { // the puffer pops with a rubbery boing and a ring of orange sparks
    rings.push({ x: f.x, y: f.y, r: 10, life: 1, w: 9 });
    for (let k = 0; k < 10; k++) { const a = rand(0, 6.28), sp = rand(120, 300); particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.35, 0.7), max: 0.7, color: k % 2 ? '#ff7a3d' : '#ffd23f', size: rand(3, 6), shape: k % 3 ? undefined : 'star', rot: rand(0, 3), g: 80 }); }
    if (!ev.bombSfx) { ev.bombSfx = true; Sfx.boing(); }
  } else if (f.kind === 'rainbow') { // the rainbow fish leaves a trail of light in every color
    for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28 + rand(-0.2, 0.2), sp = rand(90, 280); particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.7, 1.1), max: 1.1, color: `hsl(${k * 26},95%,62%)`, size: rand(3, 6), shape: k % 2 ? 'star' : undefined, rot: rand(0, 3), g: 30 }); }
    if (!ev.rbSfx) { ev.rbSfx = true; Sfx.rainbowPop(); }
  } else if (f.kind === 'clock') { // the clock fish rings out twice
    rings.push({ x: f.x, y: f.y, r: 8, life: 1, w: 5 }); rings.push({ x: f.x, y: f.y, r: 2, life: 1.2, w: 3 });
    if (!ev.clkSfx) { ev.clkSfx = true; Sfx.clock(); }
  }
  if (spc && spc.rar === 'L') { // any legendary gets a short cinematic pause with a golden burst
    hitstop = Math.max(hitstop, 0.1); zoom = Math.max(zoom, 0.03);
    bursts.push({ x: f.x, y: f.y, life: 1, max: 1, color: GOLD.c });
    for (let k = 0; k < 14; k++) { const a = rand(0, 6.28), sp = rand(60, 240); particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.7, 1.2), max: 1.2, color: k % 2 ? '#ffd84d' : '#ffffff', size: rand(4, 8), shape: 'star', rot: rand(0, 3), g: 20 }); }
    if (!ev.legSfx) { ev.legSfx = true; Sfx.legendPop(); }
  }
  rings.push({ x: f.x, y: f.y, r: 6, life: 1, w: f.kind === 'king' ? 10 : 4 });
  if (f.skin) for (let k = 0; k < 5; k++) { // wool puffs for sheep, colored sparkles for balls
    const a = rand(0, Math.PI * 2), sp = rand(40, 140), ball = f.skin === 'balls';
    particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: rand(0.5, 0.9), max: 0.9, color: ball ? col.c : '#ffffff',
      size: rand(3, 6), g: 60, shape: ball && k % 2 ? 'star' : undefined, rot: rand(0, 3) });
  }
  if (f.kind === 'king') confettiBurst(f.x, f.y, 70, 1.4);
  // Glowing points fly up into the score.
  const rect = $('score').getBoundingClientRect(), target = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  for (let k = 0; k < (f.kind ? 5 : 2); k++) {
    orbs.push({ x0: f.x, y0: f.y, cx: f.x + rand(-120, 120), cy: f.y - rand(80, 200), x1: target.x,
      y1: target.y, t: -k * 0.06 - rand(0, 0.08), dur: rand(0.45, 0.65), color: col.c });
  }
  Sfx.popNote(i, ev.n);
  try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
  shake = Math.max(shake, 2 + Math.min(ev.n, 10) * 0.3);
  if (ev.popped === ev.n) finale(ev);
}

function finale(ev) {
  const coins0 = practice ? 0 : Meta.liveCoins(score);
  score += ev.total;
  if (practice) {
    floats.push({ x: ev.c.x, y: ev.c.y, text: '+' + ev.total.toLocaleString(), life: 1.4, max: 1.4, color: ev.golds ? GOLD.c : '#ffffff', size: 26 + Math.min(ev.n, 14) * 2.5 });
    if (combo >= 2) floats.push({ x: ev.c.x, y: ev.c.y + 34 + ev.n, text: `COMBO ×${Math.min(combo, 5)}`, life: 1.1, max: 1.1, color: '#ffb347', size: 17 });
    hud(); practice.onCatch(ev); return;
  }
  // A perfect (or nice) loop: a gold ring, a chime and a callout.
  if (ev.perfect) {
    const top = ev.c.y - 58 - ev.n * 0.5;
    floats.push({ x: ev.c.x, y: top, text: ev.perfect === 2 ? `🎯 PERFECT ×${ev.pmult.toFixed(2)}${ev.perfectStreak > 1 ? '  ·  ' + ev.perfectStreak + ' in a row' : ''}` : 'NICE LOOP ×1.1', life: 1.5, max: 1.5, color: ev.perfect === 2 ? GOLD.c : '#bfe6ee', size: ev.perfect === 2 ? 21 : 16 });
    if (ev.perfect === 2) {
      Sfx.perfect(ev.perfectStreak); Meta.onPerfect(2);
      bursts.push({ x: ev.c.x, y: ev.c.y, life: 0.9, max: 0.9, color: GOLD.c }); rings.push({ x: ev.c.x, y: ev.c.y, r: 10, life: 1, w: 7 });
      for (let k = 0; k < 14; k++) { const a = rand(0, 6.28), sp = rand(100, 280); particles.push({ x: ev.c.x, y: ev.c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.5, 0.9), max: 0.9, color: '#ffd84d', size: rand(3, 6), shape: 'star', rot: rand(0, 3), g: 60 }); }
    } else Sfx.nice();
  }
  // A clutch save: a catch that pulls a nearly full pond (88%+) back to 78% or less.
  if (!frenzy && !grace && ev.dangerBefore >= 0.88 && liveN() / mods.cap <= 0.78) {
    score += 1000; Meta.onClutch();
    setTimeout(() => { banner('🛟 CLUTCH SAVE!', 'sweep'); Sfx.clutch(); }, 550); // after any Clean Sweep / Net Haul banner from the same catch
    flash = Math.max(flash, 0.5); zoom = Math.max(zoom, 0.03); shake = Math.max(shake, 8);
    floats.push({ x: W / 2, y: H * 0.36, text: '+1,000', life: 1.6, max: 1.6, color: '#7bf0ff', size: 30 });
    bursts.push({ x: ev.c.x, y: ev.c.y, life: 1.2, max: 1.2, color: '#7bf0ff' });
    try { navigator.vibrate && navigator.vibrate([30, 40, 30, 40, 70]); } catch (e) {}
  }
  Meta.vaultCharge?.(ev.n); // every fish you catch charges the vault
  checkMilestones();
  recentCatches.push({ t: time, n: ev.n });
  // Album: first catch of a species gets the discovery card.
  let found = false;
  for (const id of ev.species) {
    if (!Meta.onSpecies(id, skin) || found) continue;
    found = true;
    const legendary = Meta.speciesOf(skin)[id].rar === 'L';
    setTimeout(() => {
      Meta.showDiscovery(id, skin);
      Sfx.discovery();
      // Legendaries get the full celebration on top of the card.
      if (legendary) { Sfx.big(2); confettiBurst(W / 2, H / 2, 90, 1.3); flash = 0.5; shake = 10; bursts.push({ x: W / 2, y: H / 2, life: 1.8, max: 1.8, color: GOLD.c }); }
    }, 350);
  }
  Meta.onCatch({ n: ev.n, golds: ev.golds, sweep: ev.sweep, combo, color: ev.color, species: ev.species.length, specials: ev.specials, total: ev.total });  if (ev.clocks) { slow = SLOW_TIME; banner('⏱️ SLOW-MO', 'slow'); Sfx.clock(); }
  if (ev.treasure) {
    const coins = Math.round(ev.treasure * rand(30, 60) * (1 + Math.min(time / 150, 2))); // deeper into a run, treasure pays more
    Meta.addCoins(coins);
    floats.push({ x: ev.c.x, y: ev.c.y - 40, text: `+${coins} coins`, life: 1.5, max: 1.5, color: GOLD.c, size: 24 });
    Sfx.treasure();
  }
  if (ev.king) { Meta.onKing(); Meta.addCoins(Math.round(100 * (1 + Math.min(time / 150, 2)))); }

  const n = ev.n, level = n >= 12 ? 2 : n >= 8 ? 1 : 0;
  floats.push({ x: ev.c.x, y: ev.c.y, text: '+' + ev.total.toLocaleString(), life: 1.4, max: 1.4,
    color: ev.wild ? '#ffffff' : ev.golds ? GOLD.c : '#ffffff', size: 26 + Math.min(n, 14) * 2.5 });
  const tags = [];
  if (combo >= 2) tags.push(`COMBO ×${Math.min(combo, 5)}`);
  if (frenzy) tags.push(`FRENZY ×${FRENZY_MULT}`);
  if (ev.wild && !ev.king) tags.push('RAINBOW ×1.5');
  if (tags.length) floats.push({ x: ev.c.x, y: ev.c.y + 34 + n, text: tags.join(' · '), life: 1.1, max: 1.1, color: '#ffb347', size: 17 });
  // Near misses: the "so close" messages that make you go again.
  const near = ev.nearSweep ? 'Almost a Clean Sweep!' : n === 7 ? '1 more for a NET HAUL!' : n === 11 ? '1 more for a JACKPOT!' : '';
  if (near) floats.push({ x: ev.c.x, y: ev.c.y - 44, text: near, life: 1.6, max: 1.6, color: '#bfe6ee', size: 16 });

  if (ev.king) {
    banner('👑 KING CAUGHT!', 'king');
    Sfx.big(2); flash = 0.8; zoom = 0.07; hitstop = 0.15; shake = 18;
    bursts.push({ x: ev.c.x, y: ev.c.y, life: 1.6, max: 1.6, color: GOLD.c });
  } else if (ev.sweep) {
    banner('CLEAN SWEEP!', 'sweep');
    Sfx.sweep();
    for (let k = 0; k < 40; k++) {
      const a = rand(0, Math.PI * 2), sp = rand(150, 420);
      particles.push({ x: ev.c.x, y: ev.c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.6, 1.1), max: 1.1,
        color: ['#7bf0ff', '#ffffff', '#ffd84d'][k % 3], size: rand(4, 8), shape: 'star', rot: rand(0, 3), g: 80 });
    }
  }
  if (level && !ev.king) {
    if (!ev.sweep) banner(level === 2 ? 'JACKPOT!' : 'NET HAUL!');
    Sfx.big(level);
    flash = level === 2 ? 0.7 : 0.45;
    zoom = level === 2 ? 0.06 : 0.035;
    hitstop = level === 2 ? 0.12 : 0.07;
    shake = level === 2 ? 14 : 9;
    bursts.push({ x: ev.c.x, y: ev.c.y, life: 1.2, max: 1.2, color: ev.golds ? GOLD.c : ev.color === undefined ? GOLD.c : COLORS[ev.color].c });
    try { navigator.vibrate && navigator.vibrate(level === 2 ? [30, 40, 30, 40, 80] : [20, 30, 50]); } catch (e) {}
  } else if (n >= 5 && !ev.sweep && !ev.king) {
    banner('NICE CATCH');
    zoom = 0.015;
  }
  // Frenzy meter fills with every clean catch.
  if (!frenzy) {
    meter += (ev.eff * 0.045 + (ev.wild ? 0.1 : 0) + (ev.sweep ? 0.15 : 0)) * mods.charge + (ev.king ? 0.4 : 0);
    if (meter >= 1) startFrenzy();
  }
  // Personal best: celebrate the moment you pass it.
  if (!beatBest && Meta.S.best > 0 && score > Meta.S.best) {
    beatBest = true;
    setTimeout(() => { banner('🏆 NEW BEST!', 'best'); Sfx.best(); confettiBurst(W / 2, H * 0.3, 60); }, 500);
  }
  // Emptying the pond completely is a bonus moment.
  if (!living().length && !fish.some(f => f.caught)) {
    score += 2000;
    setTimeout(() => { banner(SKINS[skin].cleared + ' +2,000', 'sweep'); Sfx.sweep(); confettiBurst(W / 2, H / 2, 80); }, 700);
  }
  const gain = Meta.liveCoins(score) - coins0; // what this catch earned, as a stream of coins into the HUD chip
  if (gain > 0) coinsFly(ev.c.x, ev.c.y, gain);
  hud();
}
// Coins pour from the catch into the little coin chip under the HUD, each one counted in with a clink.
function setRunCoins() { const n = $('runCoinsN'); if (n) n.textContent = Math.floor(runCoinsShown).toLocaleString(); }
function coinsFly(x, y, gain) {
  const chip = $('runCoins');
  if (!chip || chip.classList.contains('hidden')) { runCoinsShown += gain; return; }
  const rect = chip.getBoundingClientRect(), tgt = toWorld(rect.left + rect.width * 0.18, rect.top + rect.height / 2);
  const n = clamp(Math.ceil(gain / 7), 1, 14), per = gain / n;
  for (let k = 0; k < n; k++) orbs.push({ coin: true, v: per, x0: x + rand(-14, 14), y0: y + rand(-10, 10), cx: x + rand(-90, 90), cy: y - rand(40, 150), x1: tgt.x, y1: tgt.y, t: -k * 0.05 - rand(0, 0.06), dur: rand(0.55, 0.8), color: '#ffcf33' });
}

function startFrenzy() {
  frenzy = FRENZY_TIME;
  meter = 0;
  Meta.onFrenzy();
  banner('🔥 FRENZY!', 'frenzy');
  Sfx.frenzy(); Meta.Music?.frenzyHit();
  flash = 0.6; zoom = 0.05; shake = 12;
  for (let i = 0; i < 3; i++) setTimeout(() => state === 'play' && school(6 + Math.floor(rand(0, 4))), 300 + i * 900);
  try { navigator.vibrate && navigator.vibrate([40, 30, 40, 30, 40]); } catch (e) {}
}

// Frenzy ends: its leftover bonus fish swim away, so the flood can never cost you the game.
function endFrenzy() {
  frenzy = 0;
  const cx = (bounds.x0 + bounds.x1) / 2;
  for (const f of living()) if (f.fromFrenzy) { f.leaving = true; f.a = f.x < cx ? Math.PI : 0; }
  grace = 3;
  floats.push({ x: W / 2, y: H * 0.4, text: 'Frenzy over', life: 1.2, max: 1.2, color: '#bfe6ee', size: 22 });
}

function tangle(caught, pts) {
  if (combo) Sfx.comboLost(combo);
  combo = 0; perfectStreak = 0;
  meter = Math.max(0, meter - 0.25);
  if (!practice) Meta.onTangle();
  const c = centroid(caught);
  for (const f of caught) { f.a = Math.atan2(f.y - c.y, f.x - c.x); f.flee = 0.6; }  // they scatter
  if (!practice) for (let i = 0; i < FAIL_EXTRA_FISH; i++) makeFish(false, { plain: true });
  floats.push({ x: c.x, y: c.y, text: 'Tangled!', life: 1.1, max: 1.1, color: '#ff5d73', size: 30 });
  lastLasso = { pts, life: 1 };
  shake = 10; redFlash = 0.45;
  Sfx.fail();
  try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch (e) {}
  hud();
  if (practice) practice.onTangle(caught);
}

function banner(text, cls = '') {
  const el = $('banner');
  el.textContent = text;
  el.className = cls;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(banner.t);
  banner.t = setTimeout(() => el.classList.add('hidden'), 1500);
}
function bump(id) {
  const el = $(id);
  el.classList.add('bump');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('bump'), 90);
}

// ---------- run milestones: score thresholds that pay coins and charge the vault as a run goes on ----------
const MILESTONES = [[5000, 40], [15000, 90], [40000, 200], [100000, 400], [250000, 700], [500000, 1100], [1000000, 1800]]; // was up to 6,000 for the 1M mark
let nextMs = 0;
function checkMilestones() {
  while (nextMs < MILESTONES.length && score >= MILESTONES[nextMs][0]) {
    const [at, coins] = MILESTONES[nextMs++];
    Meta.onMilestone(coins);
    Meta.vaultCharge?.(10);
    floats.push({ x: W / 2, y: H * 0.3, text: `🏆 ${at.toLocaleString()}!  +${coins} coins`, life: 2, max: 2, color: '#ffd84d', size: 26 });
    setTimeout(() => { Sfx.best(); confettiBurst(W / 2, H * 0.3, 30); }, 200);
  }
}

// ---------- game flow ----------
function startGame() {
  Sfx.init();
  setPaused(false);
  nextMs = 0;
  owed = 0; replT = 0; surge = 0; surgeT = 0;
  skin = pickSkin();
  mods = Meta.mods();
  fish = []; particles = []; rings = []; floats = []; orbs = []; bursts = []; wakes = [];
  score = 0; shown = 0; combo = 0; comboT = 0; time = 0; spawnT = 1; revived = false; lastLasso = null; cinch = null;
  rainbowT = rand(35, 50); perfectStreak = 0; heat = 0; coolFlash = 0; dangerNow = 0; heartT = 0.3; runCoinsShown = 0; lassoQ = 0; setRunCoins(); $('runCoins').classList.remove('hidden');
  recentCatches = []; schoolT = 0; frenzy = 0; meter = 0; slow = 0; grace = 0; kingT = rand(40, 55); beatBest = false; view = 1;
  for (let i = 0; i < START_FISH; i++) makeFish(true, { plain: i < 8 });
  $('score').textContent = '0';
  Meta.startRun();
  document.querySelector('#over h2').textContent = SKINS[skin].over;
  state = 'play';
  ['menu', 'over'].forEach(id => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden');
  hud();
}

// ---------- the hands-on tutorial ----------
// A calm, fish-skin copy of the real game board: fish barely move (mods.speed 0.12) and never evade, and practice.js places them.
function startPractice(p) {
  Sfx.init(); setPaused(false);
  practice = p; skin = 'fish'; mods = { ...Meta.mods(), speed: 0.12 };
  fish = []; particles = []; rings = []; floats = []; orbs = []; bursts = []; wakes = [];
  score = 0; shown = 0; combo = 0; comboT = 0; time = 0; spawnT = 999; schoolT = 999; kingT = 99999; owed = 0; surge = 0; surgeT = 0;
  frenzy = 0; meter = 0; slow = 0; grace = 0; view = 1; lasso = null; lastLasso = null; cinch = null; recentCatches = []; nextMs = 99;
  perfectStreak = 0; heat = 0; dangerNow = 0; $('runCoins').classList.add('hidden');
  $('score').textContent = '0';
  state = 'play';
  ['menu', 'over', 'daily'].forEach(id => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden'); $('hud').classList.add('practice');
  hud();
}
function endPractice() {
  practice = null; setPaused(false);
  $('hud').classList.remove('practice');
  state = 'menu'; skin = pickSkin(); mods = Meta.mods(); nextMs = 0; frenzy = 0; meter = 0; combo = 0; slow = 0;
  fish = []; floats = []; particles = []; orbs = []; bursts = []; wakes = [];
  for (let i = 0; i < START_FISH; i++) makeFish(true); // fish swim behind the menu
  Meta.showMenu();
}
Meta.startPracticeRun = startPractice; Meta.endPracticeRun = endPractice;

function gameOver() {
  setPaused(false); $('runCoins').classList.add('hidden'); dangerNow = 0;
  state = 'over';
  lasso = null;
  frenzy = 0; slow = 0;
  Sfx.scribbleStop();
  Meta.gameOver(score, time, !revived, revive, replay => {
    if (replay) return startGame();
    state = 'menu';
    fish = [];
    for (let i = 0; i < START_FISH; i++) makeFish(true); // fish swim behind the menu
  });
}

// PLACEHOLDER rewarded ad: clear 12 fish and keep playing.
function revive() {
  Meta.Ads.rewarded('clear 12 fish', () => {
    revived = true;
    living().sort(() => Math.random() - 0.5).slice(0, 12).forEach(f => { f.pop = 0.01; });
    state = 'play';
    hud();
  });
}

// ---------- pace director ----------
// Keeps the pond busy instead of letting a fast player sit and wait. Skill = fish caught in the
// last 30 s. Better players get a fuller target pond and faster arrivals; an emptying pond gets
// a school of same-colored fish (a ready-made big loop) and a quick refill. Frenzy floods it.
function director(dt) {
  if (practice) return; // the tutorial places every fish itself
  // Replacements for fish you caught stop two short of the limit, so refilling never pushes you over. The normal trickle of new
  // arrivals has no ceiling: that's what slowly fills the pond if you stall, and it's how a run ends.
  const ceiling = mods.cap - 2;
  // Frenzy: keep the pond packed past the normal limit so there's always a huge loop to draw.
  if (frenzy) {
    if ((spawnT -= dt) <= 0) {
      const n = liveN(), room = mods.cap + FRENZY_EXTRA - n;
      // after a big Frenzy catch, refill faster (two at a time, half of them surfacing in the holes)
      if (room > 0) { makeFish(false, { plain: Math.random() < 0.7 }); if (room > 12) surfaceGroup(1); }
      spawnT = room > 12 ? 0.1 : 0.18;
      hudSoon();
    }
    return;
  }
  // The rainbow fish comes on a schedule: the first after 35 to 50 s, then one every 70 to 100 s (a little sooner with Hunter upgrades, never faster
  // than 47 s), never during Frenzy, and never a second one while one is still swimming. It leaves after 22 s if nobody loops it.
  if ((rainbowT -= dt) <= 0) {
    if (fish.some(f => f.kind === 'rainbow' && !f.leaving && !f.caught && !f.pop)) rainbowT = 5;
    else { spawnRainbow(); rainbowT = rand(70, 100) / Math.min(1.5, Math.sqrt(mods.special / 0.05)); }
  }
  recentCatches = recentCatches.filter(c => time - c.t < 30);
  const rate = recentCatches.reduce((a, c) => a + c.n, 0) / 30;      // fish per second
  const skill = clamp(rate / 1.2, 0, 1);
  let n = liveN();
  // Surge after a big clear: groups of 3 to 5 surface in the emptiest water, quickly while the pond is empty, easing off as it fills.
  if (surge > 0 && (surgeT -= dt) <= 0) {
    const room = ceiling - n;
    if (room <= 0) surge = 0; // already full again
    else {
      const k = Math.min(surge, room, 3 + ((Math.random() * 3) | 0));
      surfaceGroup(k); surge -= k; n += k;
      surgeT = 0.16 + (n / mods.cap) * 0.3;
    }
  }
  // Replacements for smaller catches: faster the more are owed, and a bigger debt partly surfaces in open water instead of swimming in.
  // Never paused by slow-mo or by Frenzy's aftermath.
  if (owed > 0 && (replT -= dt) <= 0) {
    if (n < ceiling) { if (owed > 4 && Math.random() < 0.5) surfaceGroup(1); else makeFish(false); n++; hudSoon(); }
    owed--;
    replT = clamp(0.5 / (1 + owed * 0.35), 0.06, 0.25);
  }
  const target = mods.cap * (0.3 + 0.3 * skill + Math.min(time / 300, 0.15));
  let interval = spawnEvery(time) * (1 - skill * 0.35);
  if (n < target * 0.5) interval *= 0.25;
  else if (n < target) interval *= 0.6;
  else if (n > target * 1.25) interval *= 1.5;
  if (surge > 0) interval *= 1.6; // the surge is doing the refilling; don't pile the trickle on top of it
  if ((spawnT -= dt) <= 0) { makeFish(false); spawnT = interval; hudSoon(); }
  if (surge <= 0 && (schoolT -= dt) <= 0 && n < Math.max(6, target * 0.4)) {
    school(Math.min(4 + Math.floor(rand(0, 3 + skill * 4)), Math.max(0, ceiling - n)));
    schoolT = 5;
  }
  if ((kingT -= dt) <= 0 && !fish.some(f => f.kind === 'king')) { spawnKing(); kingT = rand(90, 130); }
}
function spawnRainbow() {
  const f = makeFish(false, { plain: true });
  f.kind = 'rainbow'; f.color = -1; f.life = 22;
  // a soft chime panned toward where it swims in from, and a ripple of colour at the edge so the eye can find it
  Meta.Music?.rainbowSpawn(clamp((f.x / W - 0.5) * 1.3, -0.7, 0.7));
  const x = clamp(f.x, 34, W - 34), y = clamp(f.y, 130, H - 34);
  rings.push({ x, y, r: 8, life: 1, w: 4 });
  for (let k = 0; k < 10; k++) { const a = rand(0, 6.28), sp = rand(40, 130); particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.6, 1), max: 1, color: `hsl(${k * 36},95%,65%)`, size: rand(2.5, 4.5), shape: k % 2 ? 'star' : undefined, rot: rand(0, 3), g: 0 }); }
  return f;
}
function school(size) {
  if (size < 1) return;
  const color = Math.floor(Math.random() * colorCount(score));
  const lead = makeFish(false, { plain: true });
  lead.color = color;
  for (let i = 1; i < size; i++) {
    const f = makeFish(false, { plain: true });
    Object.assign(f, { color, x: lead.x + rand(-40, 40), y: lead.y + rand(-40, 40), a: lead.a + rand(-0.2, 0.2) });
  }
  if (SKINS[skin].hit) Sfx[SKINS[skin].hit](); else Sfx.bubble();
  hudSoon();
}

// ---------- HUD ----------
function hud() {
  const n = liveN(), cap = mods.cap, pct = n / cap;
  $('comboTxt').textContent = '×' + Math.max(1, Math.min(combo, 5)) + (combo >= 5 ? '🔥' : '');
  $('combo').classList.toggle('hot', combo >= 3 && combo < 5);
  $('combo').classList.toggle('max', combo >= 5);
  const place = SKINS[skin].place;
  $('fishCount').textContent = frenzy ? `FRENZY · NO LIMIT · ${n} ${SKINS[skin].noun}` : grace ? `${place} ${n} / ${cap} · SAFE` : `${place} ${n} / ${cap}`;
  $('fill').style.width = clamp(pct, 0, 1) * 100 + '%';
  $('fill').style.background = frenzy ? 'linear-gradient(90deg,red,orange,yellow,lime,cyan,blue,violet)'
    : pct < 0.6 ? 'var(--good)' : pct < 0.85 ? 'var(--accent)' : 'var(--bad)';
}
function hudFrame() {
  $('comboTimer').style.width = combo ? clamp(comboT / mods.comboTime, 0, 1) * 100 + '%' : '0%';
  $('frenzyFill').style.width = (frenzy ? frenzy / FRENZY_TIME : meter) * 100 + '%';
  $('frenzyBar').classList.toggle('on', !!frenzy);
  $('frenzyLbl').textContent = frenzy ? `FRENZY ${Math.ceil(frenzy)}s` : meter > 0.8 ? 'FRENZY READY SOON' : 'FRENZY';
  const best = Meta.S.best;
  $('bestFill').style.width = best ? clamp(shown / best, 0, 1) * 100 + '%' : '0%';
  $('bestLbl').textContent = !best ? 'FIRST GAME' : beatBest ? 'NEW BEST!' : `BEST ${best.toLocaleString()}`;
  $('bestBar').classList.toggle('beat', beatBest);
}

$('play').onclick = startGame;

// ---------- pause ----------
function setPaused(p) {
  if (p && state !== 'play') return;
  paused = p;
  $('quit').classList.toggle('hidden', !!practice); // in the tutorial you can only resume
  $('pauseScreen').classList.toggle('hidden', !p);
  if (p) {
    lasso = null; shake = 0; flash = 0; redFlash = 0;
    Sfx.scribbleStop();
    const nx = MILESTONES[nextMs];
    $('pauseInfo').textContent = `Score ${score.toLocaleString()} · ${SKINS[skin].place.toLowerCase()} ${living().length} / ${mods.cap}` + (nx ? ` · next milestone ${nx[0].toLocaleString()} (+${nx[1]} coins)` : '');
  }
}
$('pause').onclick = () => setPaused(true);
$('resume').onclick = () => setPaused(false);
$('quit').onclick = () => { setPaused(false); gameOver(); };
addEventListener('keydown', e => { if (state === 'play' && !practice && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) setPaused(!paused); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); }); // leaving the tab pauses

// ---------- loop ----------
let last = performance.now();
let frameErrors = 0;
// One bad frame must never end the game loop: before this, an error while drawing skipped the final requestAnimationFrame, so the picture froze
// (the music kept playing) and the player was stuck. Now the error is logged, the canvas is put back in a clean state and the next frame runs.
function frame(now) {
  try { frameBody(now); }
  catch (e) {
    if (frameErrors++ < 5) console.error('frame error', e);
    for (let i = 0; i < 16; i++) ctx.restore(); // drawing may have died between a save() and its restore()
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.setLineDash([]);
    const dpr = DPR(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // back to the base transform (cheap, so a repeating error can't flicker)
  }
  requestAnimationFrame(frame);
}
function frameBody(now) {
  const real = paused ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  updateBounds(real);
  // Hit-stop: the world freezes for a split second on big catches.
  let dt = real;
  if (hitstop > 0) { hitstop -= real; dt = 0; }
  if (state === 'play' && !paused) {
    time += dt;
    director(dt);
    if (hudDirty) { hudDirty = false; hud(); }
    if (combo && (comboT -= dt) <= 0) { // a big combo breaking cools the world with a little flash
      if (combo >= 4) { coolFlash = 0.35; floats.push({ x: W / 2, y: H * 0.42, text: 'Combo lost', life: 1.1, max: 1.1, color: '#bfe6ee', size: 22 }); }
      Sfx.comboLost(combo); combo = 0; hud();
    }
    // The combo's heat warms the world; at high heat fish twinkle.
    heat += ((frenzy ? 1 : practice ? 0 : clamp((combo - 1) / 6, 0, 1)) - heat) * Math.min(1, real * 2.5);
    if (heat > 0.35 && (sparkT -= dt) <= 0) {
      sparkT = 0.13 - heat * 0.08;
      const f = fish[(Math.random() * fish.length) | 0];
      if (f && !f.pop && !f.caught) particles.push({ x: f.x + rand(-f.size, f.size), y: f.y + rand(-f.size, f.size), vx: 0, vy: -18, life: 0.7, max: 0.7, color: '#fff6c4', size: rand(2, 4), shape: 'star', rot: rand(0, 3), g: 0 });
    }
    // Danger: a nearly full pond pulses red at the edges, ducks the music and starts a heartbeat that quickens as it fills.
    dangerNow = practice ? 0 : liveN() / mods.cap;
    if (dangerNow > 0.88 && !frenzy && !grace) {
      if ((heartT -= dt) <= 0) { const k = clamp((dangerNow - 0.88) / 0.12, 0, 1); Meta.Music?.heartbeat(k); heartT = 1.05 - k * 0.5; }
    } else heartT = 0.3;
    if (frenzy && (frenzy -= dt) <= 0) { endFrenzy(); hud(); }
    if (slow && (slow -= dt) <= 0) slow = 0;
    if (grace && (grace -= dt) <= 0) grace = 0;
    // The pond can only overflow outside Frenzy and its grace period.
    if (!practice && !frenzy && !grace && liveN() > mods.cap && !fish.some(f => f.caught)) gameOver();
    Sfx.music(real);
    if ((bubbleT -= dt) <= 0) {
      bubbleT = rand(0.2, 0.6);
      bubbles.push({ x: rand(bounds.x0, bounds.x1), y: rand(bounds.y0 + 40, bounds.y1), r: rand(2, 5), life: rand(1.5, 3), max: 3, ph: rand(0, 6) });
    }
    hudFrame();
  }
  if (state !== 'over') updateFish(dt);
  for (const p of particles) { p.life -= dt; p.vy += p.g * dt; p.vx *= 1 - dt * 1.5; p.x += p.vx * dt; p.y += p.vy * dt; p.rot = (p.rot || 0) + dt * (p.spin || 6); }
  particles = particles.filter(p => p.life > 0);
  for (const w of wakes) { w.life -= dt; w.r += dt * w.grow; }
  wakes = wakes.filter(w => w.life > 0);
  for (const r of rings) { r.life -= dt * 1.8; r.r += dt * 110; }
  rings = rings.filter(r => r.life > 0);
  for (const f of floats) { f.life -= dt; f.y -= dt * 45; }
  floats = floats.filter(f => f.life > 0);
  for (const b of bursts) b.life -= real;
  bursts = bursts.filter(b => b.life > 0);
  for (const b of bubbles) { b.life -= dt; b.y -= dt * 22; b.ph += dt * 4; if (b.life <= 0 && skin === 'fish' && Math.random() < 0.15) Sfx.bubble(); }
  bubbles = bubbles.filter(b => b.life > 0);
  for (const o of orbs) {
    o.t += real / o.dur;
    if (o.t >= 1 && !o.done) {
      o.done = true;
      if (o.coin) { runCoinsShown += o.v; setRunCoins(); bump('runCoins'); Sfx.coin(Math.floor(Math.random() * 5)); }
      else { bump('score'); Sfx.coin(Math.floor(Math.random() * 5)); }
    }
  }
  orbs = orbs.filter(o => !o.done);
  for (const l of lights) { l.x += l.vx * dt; l.y += l.vy * dt; if (l.x < -200 || l.x > W + 200) l.vx *= -1; if (l.y < -200 || l.y > H + 200) l.vy *= -1; }
  if (cinch && (cinch.t += real * 4) >= 1) cinch = null;
  if (lastLasso && (lastLasso.life -= real * 2.5) <= 0) lastLasso = null;
  // Score counts up instead of jumping.
  if (shown < score) { shown = Math.min(score, shown + Math.max(1, (score - shown) * real * 8)); $('score').textContent = Math.floor(shown).toLocaleString(); }
  shake = Math.max(0, shake - real * 40);
  flash = Math.max(0, flash - real * 2.5);
  coolFlash = Math.max(0, coolFlash - real * 1.6);
  redFlash = Math.max(0, redFlash - real * 1.8);
  zoom = Math.max(0, zoom - real * 0.15);
  draw(now);
}

// Rope look comes from the equipped rope; Frenzy turns any rope rainbow; the combo adds glow.
function ropeColor(now) {
  const skin = Meta.rope();
  return skin.rainbow || frenzy ? `hsl(${(now / 4) % 360}, 90%, 65%)` : skin.color;
}
function rope(pts, color, width, glow) {
  const skin = Meta.rope();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.strokeStyle = 'rgba(20,15,10,.45)'; ctx.lineWidth = width + 4; ctx.stroke();
  if (glow || skin.glow) { ctx.shadowColor = color; ctx.shadowBlur = 12 + heat * 16 + (frenzy ? 6 : 0); }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  ctx.shadowBlur = 0;
  if (skin.core) { ctx.strokeStyle = skin.core; ctx.lineWidth = width * 0.35; ctx.stroke(); }
  if (skin.dash) { ctx.setLineDash(skin.dashLen || [3, 7]); ctx.strokeStyle = skin.dash; ctx.lineWidth = width * 0.55; ctx.stroke(); ctx.setLineDash([]); }
}

function draw(now) {
  const t = now / 1000;
  ctx.save();
  // Zoom punch around the screen centre, plus shake.
  if (zoom) { ctx.translate(W / 2, H / 2); ctx.scale(1 + zoom, 1 + zoom); ctx.translate(-W / 2, -H / 2); }
  if (shake && Meta.S.settings?.shake !== false) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  ctx.drawImage((skin === 'sheep' ? bgPasture : skin === 'balls' ? bgPlay : null) || bg, 0, 0, W, H);
  if (skin === 'fish') Water.overlay(ctx, W, H, t, { strength: (frenzy ? 1.2 : 1) + heat * 0.35 });
  // Soft moving light patches on the water.
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  // Everything that lives in the pond is drawn in world units, so Frenzy's zoom-out shows more pond.
  { const c = viewCenter(); ctx.translate(c.x, c.y); ctx.scale(view, view); ctx.translate(-c.x, -c.y); }
  // Light rays behind big catches.
  for (const b of bursts) {
    const k = b.life / b.max;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(now / 900);
    ctx.globalAlpha = k * 0.45; ctx.fillStyle = b.color;
    const R = 120 + (1 - k) * 260;
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, -R * 0.12); ctx.lineTo(R, R * 0.12); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  for (const b of bubbles) {
    ctx.globalAlpha = Math.min(1, b.life) * 0.5;
    if (skin === 'sheep') { // drifting dandelion seeds instead of bubbles
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x + Math.sin(b.ph) * 6, b.y, b.r * 0.7, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (skin === 'balls') { // floating confetti
      ctx.save(); ctx.translate(b.x + Math.sin(b.ph) * 6, b.y); ctx.rotate(b.ph);
      ctx.fillStyle = `hsl(${(b.ph * 57 + b.r * 70) % 360},85%,65%)`; ctx.fillRect(-b.r, -b.r * 0.6, b.r * 2, b.r * 1.2);
      ctx.restore();
      continue;
    }
    ctx.strokeStyle = '#d9f6ff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(b.x + Math.sin(b.ph) * 3, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (skin === 'fish') drawWakes();
  // Live preview while drawing: the loop tints with the color it would catch, red if mixed.
  let preview = null;
  if (lasso && lasso.length > 2) {
    preview = judge(lasso);
    const tint = !preview.caught.length ? 'rgba(255,255,255,.12)'
      : !preview.clean ? 'rgba(255,93,115,.3)' : preview.wild ? `hsla(${(now / 4) % 360},90%,65%,.3)`
      : preview.color === undefined ? 'rgba(255,216,77,.3)' : COLORS[preview.color].c + '55';
    ctx.fillStyle = tint;
    ctx.beginPath(); lasso.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill();
  }
  for (const r of rings) {
    ctx.strokeStyle = `rgba(255,255,255,${r.life * 0.7})`; ctx.lineWidth = r.w * r.life;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
  // Special fish get a soft halo so they're easy to spot.
  for (const f of fish) {
    if (!f.kind || f.pop || f.caught) continue;
    const col = f.kind === 'bomb' ? '255,80,60' : f.kind === 'clock' ? '120,200,255' : f.kind === 'king' ? '255,216,77' : '255,255,255';
    const R = f.size * (f.kind === 'king' ? 2 : 2.2), g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
    g.addColorStop(0, `rgba(${col},${0.35 + Math.sin(t * 5) * 0.1})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill();
  }
  // Fish inside the loop being drawn glow in the loop's color and shiver with anticipation.
  for (const f of fish) f.inLoop = 0;
  let loopCol = '#ffffff';
  if (preview && preview.caught.length) {
    loopCol = !preview.clean ? '#ff5d73' : preview.wild ? `hsl(${(now / 4) % 360},90%,60%)` : preview.color === undefined ? GOLD.c : COLORS[preview.color].c;
    for (const f of preview.caught) {
      f.inLoop = preview.clean ? 1 : 2;
      const R = f.size * 1.9, gl = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
      gl.addColorStop(0, withAlpha(loopCol, 0.67)); gl.addColorStop(1, withAlpha(loopCol, 0));
      ctx.globalAlpha = 0.55 + Math.sin(t * 9 + f.phase) * 0.2; ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  fish.forEach(f => drawFish(f, t));
  for (const p of particles) drawParticle(p);

  // Rope being drawn, the cinch closing on a catch, or the rope snapping on a tangle.
  if (lasso && lasso.length > 1) { const perf = lassoQ >= PERFECT_Q && lasso.length > 14; rope(lasso, perf ? GOLD.c : ropeColor(now), perf ? 6 : 5, combo >= 3 || perf); }
  // The closing guide: when the loop is nearly back at its start with fish inside, a dashed line and a pulsing ring show where to let go.
  if (preview && preview.caught.length && lasso && lasso.length > 10) {
    const tip = lasso[lasso.length - 1], st = lasso[0], d = Math.hypot(tip.x - st.x, tip.y - st.y);
    if (d < 170) {
      ctx.save(); ctx.setLineDash([8, 8]); ctx.lineDashOffset = -now / 40; ctx.strokeStyle = loopCol; ctx.globalAlpha = 0.45 + Math.sin(t * 8) * 0.2; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(st.x, st.y); ctx.stroke(); ctx.setLineDash([]);
      if (d < 70) { ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(st.x, st.y, 14 + Math.sin(t * 10) * 3, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
  }
  if (cinch) {
    const k = cinch.t * cinch.t;
    const pts = cinch.pts.map(p => ({ x: p.x + (cinch.c.x - p.x) * k * 0.85, y: p.y + (cinch.c.y - p.y) * k * 0.85 }));
    ctx.globalAlpha = 1 - k * 0.6;
    rope(pts, cinch.color, 6, true);
    ctx.globalAlpha = 1;
  }
  if (lastLasso) {
    ctx.globalAlpha = lastLasso.life;
    rope([...lastLasso.pts, lastLasso.pts[0]], '#ff9aa9', 6, false);
    ctx.globalAlpha = 1;
  }
  // Count bubble at the fingertip: how many fish the loop holds right now.
  if (preview && preview.caught.length && lasso) {
    const p = lasso[lasso.length - 1], n = preview.caught.length;
    const col = !preview.clean ? '#ff5d73' : preview.wild ? `hsl(${(now / 4) % 360},90%,60%)` : preview.color === undefined ? GOLD.c : COLORS[preview.color].c;
    ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x + 28, p.y - 30, 17 + Math.min(n, 12), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${18 + Math.min(n, 12)}px Fredoka, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(preview.clean ? n : '✕', p.x + 28, p.y - 29);
  }
  // Points flying to the score.
  for (const o of orbs) {
    if (o.t <= 0) continue;
    const q = o.t * o.t, u = 1 - q;
    const x = u * u * o.x0 + 2 * u * q * o.cx + q * q * o.x1, y = u * u * o.y0 + 2 * u * q * o.cy + q * q * o.y1;
    ctx.shadowColor = o.color; ctx.shadowBlur = 12;
    if (o.coin) { // a spinning gold coin
      const sx = Math.abs(Math.cos(o.t * 14 + o.x0)) * 0.8 + 0.2;
      ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.ellipse(x, y, 7 * sx, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffcf33'; ctx.beginPath(); ctx.ellipse(x, y, 5.6 * sx, 5.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.ellipse(x - 1.5 * sx, y - 1.8, 1.8 * sx, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  for (const f of floats) {
    const age = 1 - f.life / f.max, pop = age < 0.15 ? 0.6 + age / 0.15 * 0.6 : age < 0.25 ? 1.2 - (age - 0.15) * 2 : 1;
    ctx.globalAlpha = Math.min(1, f.life * 2);
    ctx.font = `700 ${f.size * pop}px Fredoka, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#0b3a4a'; ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Screen-wide tints (outside the shake so they cover everything).
  if (frenzy) { // pulsing rainbow edge
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `hsla(${(now / 5) % 360},95%,60%,${0.35 + Math.sin(t * 8) * 0.1})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (heat > 0.05 && !frenzy) { // the combo's heat: a warm glow creeping in from the edges
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,160,60,0)'); g.addColorStop(1, `rgba(255,140,40,${heat * 0.42})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (coolFlash) { ctx.fillStyle = `rgba(150,200,255,${coolFlash * 0.45})`; ctx.fillRect(0, 0, W, H); }
  if (dangerNow > 0.8 && !frenzy && !grace && state === 'play') { // a nearly full pond pulses red
    const k = clamp((dangerNow - 0.8) / 0.2, 0, 1), pulse = 0.5 + 0.5 * Math.sin(t * (5 + k * 5));
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.66);
    g.addColorStop(0, 'rgba(255,40,60,0)'); g.addColorStop(1, `rgba(255,30,50,${k * (0.22 + 0.34 * pulse)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (slow) { ctx.fillStyle = 'rgba(120,190,255,.12)'; ctx.fillRect(0, 0, W, H); }
  if (flash) { ctx.fillStyle = `rgba(255,255,240,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  if (redFlash) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,60,80,0)'); g.addColorStop(1, `rgba(255,60,80,${redFlash})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

// ---------- icons of sheep and balls for the store and album ----------
const skinIconCache = {};
Meta.skinImage = (sk, f, size, accId) => {
  const key = JSON.stringify([sk, f.color, f.species, size, accId, f.phase, f.dark, f.seed, f.kind]);
  if (skinIconCache[key]) return skinIconCache[key];
  const c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = c.height = size * 2;
  g.scale(2, 2);
  const prev = ctx;
  ctx = g;
  const o = { size: size * (sk === 'sheep' ? 0.36 : 0.34), phase: 0.6, species: -1, color: 0, skin: sk, seed: 0, roll: 0.5, ...f };
  ctx.translate(size * (sk === 'sheep' ? 0.4 : 0.5), size * 0.62);
  if (sk === 'sheep') drawSheep(o, 0.4); else drawBall(o, 0.4);
  if (accId && accId !== 'none') Meta.drawAcc(ctx, sk, o.size, 0.4, accId);
  ctx = prev;
  return (skinIconCache[key] = c.toDataURL());
};

// ---------- skin selector (menu) ----------
const skinSel = $('skin');
// Skins other than the fish cost coins: locked ones show a price, and picking one opens the purchase popup.
function buildSkinOptions() {
  skinSel.innerHTML = '';
  for (const [id, s] of Object.entries(SKINS)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = ownsSkin(id) ? s.label : `${s.label} · 🔒 ● ${s.cost.toLocaleString()}`;
    skinSel.appendChild(o);
  }
  skinSel.value = skin;
}
function renderSkin() {
  buildSkinOptions();
  document.querySelector('.tagline').textContent = SKINS[skin].tag;
  Meta.onSkin?.(skin); // minigames.js shows the right minigame button
}
function setSkin(name) {
  Meta.S.skin = name; Meta.save();
  skin = pickSkin();
  if (state === 'menu') { fish = []; wakes = []; for (let i = 0; i < START_FISH; i++) makeFish(true); }
  renderSkin();
  Sfx.init();
  if (SKINS[skin].start) Sfx[SKINS[skin].start](); else Sfx.click();
}
Meta.refreshSkins = () => { skin = pickSkin(); renderSkin(); };
skinSel.onchange = () => {
  const id = skinSel.value, s = SKINS[id];
  if (ownsSkin(id)) return setSkin(id);
  skinSel.value = skin; // stay on the current skin until it's bought
  Meta.confirmBuy({ name: `${s.label.replace(/^\S+\s/, '')} skin`, desc: `New skin: ${s.blurb}`,
    icon: `<span class="emoji" style="font-size:52px;line-height:1.4;display:block">${s.label.split(' ')[0]}</span>`, price: s.cost }, () => {
    Meta.S.coins -= s.cost; Meta.S.skinsOwned.push(id); Meta.save();
    buildSkinOptions(); setSkin(id); Meta.render();
  });
};

resize();
for (let i = 0; i < START_FISH; i++) makeFish(true);   // fish swim behind the menu
renderSkin();
Meta.showMenu();
requestAnimationFrame(frame);

// Test hooks: #store #upgrades #album #stats open that menu tab; #play skips the menu;
// #catch also auto-catches every fish of one color after 1 s; #frenzy starts a Frenzy; #king calls the King;
// #sheep and #balls start a game with that skin.
const hook = location.hash.slice(1);
if (['store', 'upgrades', 'album', 'stats'].includes(hook)) { $('daily').classList.add('hidden'); document.querySelector(`[data-tab=${hook}]`).click(); }
// #surge: start a run, fill the pond, clear 12 fish at once and log how fast the board refills (headless check of the director)
if (hook === 'surge') setTimeout(() => {
  $('daily').classList.add('hidden'); startGame(); for (let i = 0; i < 18; i++) makeFish(true);
  setTimeout(() => {
    // 12 (was 20): a 20-fish one-colour catch now counts as a Clean Sweep, which fills the Frenzy meter and starts a Frenzy (refills are off during Frenzy by design)
    const all = living().slice(0, 12); all.forEach(f => { f.color = 0; f.kind = undefined; f.species = -1; });
    catchFish({ caught: all, wild: false, clean: true, color: 0 }, all.map(f => ({ x: f.x, y: f.y })));
    const t0 = time; console.log('SURGE before', liveN() + all.length, 'after catch', liveN());
    paused = true; // step the director and fish by hand at 60 fps (headless Chrome barely runs animation frames)
    for (let i = 1; i <= 300; i++) { time += 1 / 60; director(1 / 60); updateFish(1 / 60); if (i % 30 === 0) console.log('SURGE t=' + (time - t0).toFixed(1), 'fish', liveN(), 'surge', surge, 'owed', owed); }
    paused = false;
  }, 800);
}, 400);
if (hook === 'sheep' || hook === 'balls') { Meta.S.skinsOwned.push(hook); Meta.S.skin = hook; skin = hook; fish = []; for (let i = 0; i < START_FISH; i++) makeFish(true); }
if (['play', 'catch', 'frenzy', 'king', 'sheep', 'balls'].includes(hook)) { $('daily').classList.add('hidden'); startGame(); }
if (hook === 'frenzy') setTimeout(startFrenzy, 500);
if (hook === 'king') setTimeout(spawnKing, 500);
if (hook === 'catch') setTimeout(() => {
  const caught = living().filter(f => f.color === 0);
  const c = centroid(caught);
  const pts = Array.from({ length: 24 }, (_, i) => ({ x: c.x + Math.cos(i / 24 * Math.PI * 2) * 120, y: c.y + Math.sin(i / 24 * Math.PI * 2) * 120 }));
  catchFish({ caught, clean: true, color: 0, wild: false }, pts);
}, 1000);
