/* Loopy minigames for the other skins, the way fishing is for the fish skin:
   - Sheep: "Count Sheep", a bedtime rhythm game. Tap to hop each sheep over the fence in time with a lullaby.
   - Toy balls: "Basket toss", a 60 s round of flicking balls into a basket in a bouncy house (built in home.js / toss.js; this file only holds the menu button). Pure skill, no chance.
   Both pay coins, XP and vault charge, and can add new breeds / toys to the album.
   Needs meta.js, game.js (Sfx, PENTA) and extras.js (Meta.vaultCharge) loaded first. */
(() => {
  const $ = id => document.getElementById(id);
  const { S, fmt } = Meta;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const pick = a => a[(Math.random() * a.length) | 0];
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
  const lvScale = () => Math.min(2, 1 + S.level * 0.05); // capped at x2

  S.minigames = S.minigames || {};
  const rec = k => (S.minigames[k] = { plays: 0, best: 0, perfects: 0, caught: 0, ...S.minigames[k] });

  // ---------- shared pieces ----------
  const css = document.createElement('style');
  css.textContent = `
    .mg { position: fixed; inset: 0; z-index: 4; background: #0b1b3a; touch-action: none; }
    .mg canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .mg-top { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 10px; z-index: 2;
      padding: calc(env(safe-area-inset-top, 0px) + 10px) 14px 0; }
    .mg-hud { margin-left: auto; font-weight: 700; font-size: 20px; text-shadow: 0 2px 0 rgba(0,0,0,.4); }
    .mg-msg { position: absolute; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100% - 28px);
      bottom: calc(env(safe-area-inset-bottom, 0px) + 22px); text-align: center; font-size: 22px; font-weight: 700; padding: 8px 20px 10px;
      border-radius: 18px; background: linear-gradient(rgba(5,20,52,.78), rgba(5,20,52,.6)); border: 2px solid rgba(255,255,255,.18);
      box-shadow: 0 6px 0 rgba(0,0,0,.2); pointer-events: none; z-index: 2; }
    .mg-msg:empty { display: none; }
    .mg-msg small { display: block; font-size: 14px; color: var(--muted); font-weight: 500; margin-top: 3px; }
    .mg-card { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); width: min(310px, calc(100% - 32px)); z-index: 3;
      background: #fff; color: var(--deep); border-radius: 22px; padding: 18px 16px; text-align: center; display: flex; flex-direction: column;
      gap: 7px; align-items: center; box-shadow: 0 10px 0 rgba(0,0,0,.25); animation: fpop .35s cubic-bezier(.2,1.6,.4,1); }
    .mg-card .emoji-big { font-size: 58px; line-height: 1; }
    .mg-card b { font-size: 24px; line-height: 1.1; }
    .mg-card .gain { font-size: 19px; font-weight: 700; color: #c98a00; }
    .mg-card small { color: #5b8792; font-size: 14px; }
    .mg-card .btn { width: 100%; }
    #discovery { z-index: 7; }
    .mg-pill { background: rgba(255,255,255,.92); color: #3a2a6b; border-radius: 999px; padding: 3px 12px; font-size: 17px; text-shadow: none; box-shadow: 0 3px 0 rgba(0,0,0,.12); }
  `;
  document.head.appendChild(css);

  function overlay(id) {
    const root = document.createElement('div');
    root.id = id; root.className = 'mg hidden';
    root.innerHTML = '<canvas></canvas><div class="mg-top"><button class="fbtn" data-close aria-label="Close">✕</button><span class="coin-chip" data-coins>0</span><span class="mg-hud" data-hud></span></div><div class="mg-msg" data-msg></div><div class="mg-card hidden" data-card></div>';
    document.body.appendChild(root);
    const q = s => root.querySelector(s);
    return { root, cv: q('canvas'), ctx: q('canvas').getContext('2d'), close: q('[data-close]'), coins: q('[data-coins]'), hud: q('[data-hud]'), msg: q('[data-msg]'), card: q('[data-card]') };
  }
  function fit(O) {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    O.cv.width = W * dpr; O.cv.height = H * dpr;
    O.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [W, H];
  }
  function payout({ coins = 0, xp = 0, charge = 0 }) {
    S.coins += coins; S.stats.coinsEarned += coins;
    Meta.addXp(xp).forEach((u, i) => setTimeout(() => Meta.toast(u), 700 + i * 2600));
    if (charge) Meta.vaultCharge?.(charge);
    Meta.save();
  }
  // Adds one to a sheep or toy-ball album entry; returns true when it's new.
  function creditAlbum(sk, id) {
    const al = S.albums[sk], fresh = !al[id];
    al[id] = (al[id] || 0) + 1;
    Meta.save();
    if (fresh) { Meta.showDiscovery(id, sk); Meta.sfx('discovery'); }
    return fresh;
  }
  const imgs = {};
  function sprite(sk, f, size) {
    const url = Meta.skinImage(sk, f, size);
    return imgs[url] || (imgs[url] = Object.assign(new Image(), { src: url }));
  }
  function label(g, text, x, y, size, fill, stroke = '#0b1b3a') {
    g.font = `700 ${size}px Fredoka, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(3, size / 6); g.strokeStyle = stroke; g.strokeText(text, x, y); g.fillStyle = fill; g.fillText(text, x, y);
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

  // =====================================================================================================
  // SHEEP: COUNT SHEEP (rhythm)
  // =====================================================================================================
  function makeSheepGame() {
    const O = overlay('sheepGame'), g = O.ctx;
    let W = 0, H = 0, open = false, raf = 0, last = 0, auto = false;
    let groundY, fenceX, takeoffX, V, SC;
    const J = 0.62, HJ = 104, TOTAL = 24, LEAD = 2.2, LIVES = 5;
    let phase = 'intro', st = 0, clock = 0, nextBeat = 0, beatN = 0, pulse = 0, nextCricket = 0, shake = 0;
    let sheep = [], parts = [], floats = [], lives = LIVES, combo = 0, bestCombo = 0, score = 0, jumped = 0, perfects = 0, bonks = 0, endAt = 0;
    let breeds = [], hit = { perfect: 0, good: 0, ok: 0 };
    const MEL = [0, 2, 4, 2, 0, 2, 4, 7, 4, 2, 0, 2, 4, 2, 0, -1]; // lullaby, as steps up the pentatonic scale
    const stars = Array.from({ length: 70 }, (_, i) => ({ x: hash(i + 1), y: hash(i + 99) * 0.55, r: 0.6 + hash(i + 7) * 1.6, ph: hash(i + 3) * 6 }));
    const flies = Array.from({ length: 14 }, (_, i) => ({ x: hash(i + 31), y: 0.78 + hash(i + 41) * 0.2, ph: hash(i + 5) * 6 }));
    const T_of = i => lerp(0.76, 0.5, clamp(i / TOTAL, 0, 1));

    function layout() {
      [W, H] = fit(O);
      groundY = H * 0.74; fenceX = W * 0.62; V = clamp(W * 0.55, 240, 380); SC = clamp(W / 430, 0.8, 1.2);
      takeoffX = fenceX - V * J / 2;
    }

    // ----- the order of sheep for the round -----
    function frames(color, dark, sp) {
      return [0, 3.14, 6.28, 9.42].map(p => sprite('sheep', sp ? { color: sp.color, species: sp.id, phase: p } : { color, dark, phase: p }, 120));
    }
    function makePlan() {
      sheep = []; let t = LEAD, prev = '';
      const breedAt = new Set([4 + Math.floor(rand(0, 4)), 13 + Math.floor(rand(0, 6))]);
      for (let i = 0; i < TOTAL; i++) {
        if (i) t += pick([1, 1, 1, 1, 2, 1.5, 0.75, 1, 1]) * T_of(i);
        let kind = 'normal', sp = null;
        if (breedAt.has(i)) { kind = 'breed'; sp = Meta.rollSpecies('sheep'); }
        else if (i >= 4 && prev !== 'gold' && Math.random() < 0.12) kind = 'gold';
        else if (i >= 6 && prev !== 'dark' && Math.random() < 0.13) kind = 'dark';
        prev = kind;
        const color = kind === 'gold' ? 'gold' : Math.floor(rand(0, 5));
        sheep.push({ kind, sp, color, ta: t, x: -200, y: 0, state: 'queued', seed: Math.random() * 9,
          fr: frames(color, kind === 'dark', sp) });
      }
    }

    // ----- audio: a slow generative lullaby plus crickets, and a reaction to every hop -----
    function onBeat() {
      pulse = 1; beatN++;
      const k = MEL[(beatN - 1) % MEL.length];
      if (k >= 0) Sfx.tone(PENTA[k] * 0.5, 0.5, { type: 'triangle', vol: 0.05, attack: 0.02, echo: true });
      if (beatN % 4 === 1) Sfx.tone(PENTA[0] * 0.25, 0.9, { vol: 0.08, attack: 0.04 });
      if (beatN % 8 === 5) Sfx.tone(PENTA[4] * 0.25, 0.9, { vol: 0.05, attack: 0.05 });
    }
    function chime(q) {
      const i = Math.min(5 + Math.floor(combo / 2) + (q === 'perfect' ? 2 : 0), PENTA.length - 1);
      Sfx.tone(PENTA[i], q === 'perfect' ? 0.5 : 0.3, { type: 'sine', vol: q === 'perfect' ? 0.13 : 0.09, echo: true });
      if (q === 'perfect') Sfx.tone(PENTA[Math.min(i + 2, PENTA.length - 1)], 0.35, { type: 'triangle', vol: 0.05, delay: 0.07, echo: true });
    }

    // ----- spawning effects -----
    const burst = (x, y, n, cols, sp = 140) => { for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(30, sp); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rand(0.4, 0.9), max: 0.9, c: pick(cols), size: rand(2, 4.5), g: 220 }); } };
    const say = (text, x, y, color, size = 24) => floats.push({ text, x, y, color, size, life: 1.1, max: 1.1 });

    // ----- play -----
    function start() {
      phase = 'play'; st = 0; nextBeat = 0; beatN = 0; lives = LIVES; combo = 0; bestCombo = 0; score = 0; jumped = 0; perfects = 0; bonks = 0;
      breeds = []; hit = { perfect: 0, good: 0, ok: 0 }; parts = []; floats = []; endAt = 0;
      makePlan(); setMsg(''); hudUpdate();
      O.card.classList.add('hidden');
    }
    function setMsg(a, b = '') { O.msg.innerHTML = a + (b ? `<small>${b}</small>` : ''); }
    function hudUpdate() { const n = clamp(lives, 0, LIVES); O.hud.textContent = '🌙'.repeat(n) + '🌑'.repeat(LIVES - n); }

    function hop(s, q, dt) {
      s.state = 'jump'; s.t0 = st; s.x0 = s.x; s.q = q;
      const ok = q !== 'bad';
      s.res = ok ? 'clear' : 'short';
      s.land = ok ? fenceX + 82 + rand(-8, 8) : (dt < 0 ? s.x + (fenceX - 62 - s.x) * 0.55 : fenceX - 70);
      s.hj = ok ? HJ * (q === 'ok' ? 0.88 : 1) : 52;
      Sfx.noise(0.05, 0.05, 900, 'lowpass');
    }
    function tap() {
      Sfx.init();
      if (phase === 'intro') { start(); return; }
      if (phase !== 'play') return;
      let best = null, bd = 9;
      for (const s of sheep) if (s.state === 'run' || s.state === 'hold') { const d = Math.abs(st - s.ta); if (d < bd) { bd = d; best = s; } }
      if (!best || bd > 0.5) { Sfx.noise(0.06, 0.03, 2500, 'bandpass'); return; } // nothing near: a harmless whiff
      const dt = st - best.ta, ad = Math.abs(dt);
      let q = ad <= 0.09 ? 'perfect' : ad <= 0.17 ? 'good' : (dt >= -0.25 && dt <= 0.3) ? 'ok' : 'bad';
      if (best.kind === 'dark') q = 'bad'; // the black sheep wants to go alone
      hop(best, q, dt);
      if (q === 'bad') { best.why = best.kind === 'dark' ? 'The black sheep wanted to go alone!' : dt < 0 ? 'Too early!' : 'Too late!'; Sfx.baa(); return; }
      const mult = 1 + Math.min(3, Math.floor(combo / 4)), base = { perfect: 3, good: 2, ok: 1 }[q] * (best.kind === 'gold' ? 3 : 1);
      score += base * mult; jumped++; hit[q]++;
      if (q === 'perfect') perfects++;
      if (q !== 'ok') { combo++; bestCombo = Math.max(bestCombo, combo); } else combo = Math.max(0, combo - 1);
      const col = { perfect: '#ffd84d', good: '#9dffb8', ok: '#bfe6ee' }[q];
      say(q.toUpperCase() + (mult > 1 ? ` ×${mult}` : ''), best.x + 20, groundY - 150 * SC, col, q === 'perfect' ? 28 : 22);
      chime(q); Sfx.baa();
      if (best.kind === 'gold') { [0, 2, 4, 7, 9].forEach((k, i) => Sfx.tone(PENTA[k + 5] || PENTA[12], 0.18, { type: 'triangle', vol: 0.06, delay: i * 0.06, echo: true })); burst(best.x, groundY - 60, 18, ['#ffd84d', '#fff3b0'], 200); }
      if (best.kind === 'breed' && best.sp) {
        const fresh = creditAlbum('sheep', best.sp.id); breeds.push(best.sp.name);
        say(fresh ? `NEW BREED: ${best.sp.name}!` : best.sp.name, W / 2, H * 0.3, '#ffd84d', 22);
      }
      buzz(q === 'perfect' ? [14, 20, 14] : 10);
    }
    function bonk(s, why) {
      s.state = 'bonk'; s.t0 = st; lives = Math.max(0, lives - 1); combo = 0; bonks++; shake = 9;
      Sfx.clonk(); Sfx.tone(160, 0.35, { type: 'sawtooth', vol: 0.07, slide: 0.55 }); Sfx.baa();
      burst(s.x + 30, groundY - 70 * SC, 10, ['#ffd84d', '#fff'], 120);
      say(why || 'BONK!', s.x, groundY - 120 * SC, '#ff8fa3', 22);
      hudUpdate(); buzz([50, 30, 50]);
      if (lives <= 0 && !endAt) endAt = st + 1.0;
    }
    function freeHop(s) { // the black sheep jumps on its own
      hop(s, 'free', 0); s.res = 'clear';
      score += 2; jumped++; say('FREE SPIRIT +2', s.x + 20, groundY - 150 * SC, '#c9a0ff', 20);
      Sfx.tone(PENTA[4] * 0.5, 0.4, { type: 'sine', vol: 0.08, echo: true });
    }

    function update(dt) {
      clock += dt; pulse = Math.max(0, pulse - dt * 4); shake = Math.max(0, shake - dt * 30);
      // music clock runs always: slower in the intro and the results
      const T = phase === 'play' ? T_of(Math.max(0, (st - LEAD) / 1.4 / T_of(0))) : 0.8;
      if (phase === 'play') st += dt;
      const mt = phase === 'play' ? st : clock;
      if (phase !== 'play') { if ((nextBeat -= dt) <= 0) { onBeat(); nextBeat = T; } }
      else while (st >= nextBeat) { onBeat(); nextBeat += T_of(Math.max(0, (nextBeat - LEAD) / 1.4 / T_of(0))); }
      if ((nextCricket -= dt) <= 0) { Sfx.noise(0.05, 0.022, 7000, 'highpass'); nextCricket = rand(0.6, 1.6); }
      void mt;
      for (const p of parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      parts = parts.filter(p => p.life > 0);
      for (const f of floats) { f.life -= dt; f.y -= dt * 32; }
      floats = floats.filter(f => f.life > 0);
      if (phase !== 'play') return;

      for (const s of sheep) {
        if (s.state === 'queued') { if (st >= s.ta - (takeoffX + 140) / V) s.state = 'run'; else continue; }
        if (s.state === 'run') {
          s.x = takeoffX - V * (s.ta - st);
          if (s.kind === 'dark' && st >= s.ta) freeHop(s);
          else if (s.x >= fenceX - 62) { s.x = fenceX - 62; s.state = 'hold'; }
        } else if (s.state === 'hold') {
          if (st > s.ta + 0.3) bonk(s, 'Ran into the fence!');
        } else if (s.state === 'jump') {
          const p = (st - s.t0) / J;
          s.x = lerp(s.x0, s.land, clamp(p, 0, 1)); s.y = s.hj * 4 * clamp(p, 0, 1) * (1 - clamp(p, 0, 1)); // height above the ground, positive is up
          if (p >= 1) {
            s.y = 0;
            if (s.res === 'clear') {
              s.state = 'away'; Sfx.noise(0.08, 0.06, 500, 'lowpass');
              burst(s.x, groundY, 6, ['#9dc9a8', '#cfe8d5'], 70);
            } else bonk(s, s.why);
          }
        } else if (s.state === 'away') {
          s.x += V * 0.8 * dt;
          if (s.x > W + 140) s.state = 'gone';
        } else if (s.state === 'bonk') {
          if (st - s.t0 > 1.0) s.state = 'gone';
          else s.x -= dt * 40 * Math.max(0, 1 - (st - s.t0) * 2);
        }
      }
      if (auto) for (const s of sheep) if ((s.state === 'run') && s.kind !== 'dark' && st >= s.ta - 0.004 && !s.tapped) { s.tapped = true; tap(); }
      const active = sheep.some(s => s.state !== 'gone');
      if (lives <= 0 ? st >= endAt : !active) finish();
    }

    function finish() {
      phase = 'over';
      const pr = rec('sheep');
      const coins = Math.round((score * 0.8 + (bonks === 0 ? 40 : 0)) * lvScale()), xp = jumped * 4, charge = jumped * 2;
      payout({ coins, xp, charge });
      pr.plays++; pr.best = Math.max(pr.best, jumped); pr.perfects += perfects; pr.caught += jumped; Meta.save();
      O.coins.textContent = fmt(S.coins);
      const tired = lives <= 0;
      O.card.innerHTML = `<div class="emoji-big">${tired ? '😴' : '🌙'}</div><b>${tired ? 'Time for bed!' : 'Sweet dreams!'}</b>` +
        `<span class="gain">+${fmt(coins)} coins · +${xp} XP</span>` +
        `<small>${jumped} sheep counted · ${perfects} perfect · best streak ×${bestCombo}${bonks === 0 ? ' · no bonks! +40' : ''}</small>` +
        (breeds.length ? `<small>Breeds found: ${breeds.join(', ')}</small>` : '') +
        `<button class="btn" data-again>Count again</button><button class="btn ghost" data-done>Close</button>`;
      O.card.classList.remove('hidden');
      O.card.style.animation = 'none'; void O.card.offsetWidth; O.card.style.animation = '';
      [0, 2, 4, 7].forEach((k, i) => Sfx.tone(PENTA[k + 3], 0.7, { type: 'triangle', vol: 0.07, delay: i * 0.12, echo: true }));
      setMsg('');
    }

    // ----- drawing -----
    function draw() {
      const t = clock;
      g.save();
      if (shake > 0 && S.settings?.shake !== false) g.translate(rand(-shake, shake), rand(-shake, shake));
      const sky = g.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, '#071230'); sky.addColorStop(0.55, '#1b2f6b'); sky.addColorStop(1, '#6a7fc4');
      g.fillStyle = sky; g.fillRect(-10, -10, W + 20, H + 20);
      for (const s of stars) { g.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 1.6 + s.ph)); g.fillStyle = '#fff'; g.beginPath(); g.arc(s.x * W, s.y * groundY, s.r, 0, 6.28); g.fill(); }
      g.globalAlpha = 1;
      // moon, breathing with the beat
      const mx = W * 0.2, my = H * 0.17, mr = (36 + pulse * 3) * SC;
      const mg = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3.2);
      mg.addColorStop(0, 'rgba(255,248,210,.55)'); mg.addColorStop(1, 'rgba(255,248,210,0)');
      g.fillStyle = mg; g.fillRect(mx - mr * 3.3, my - mr * 3.3, mr * 6.6, mr * 6.6);
      g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(mx, my, mr, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(200,190,150,.35)';
      for (const [dx, dy, r] of [[-0.3, -0.2, 0.2], [0.25, 0.1, 0.28], [-0.1, 0.4, 0.14]]) { g.beginPath(); g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, 6.28); g.fill(); }
      // drifting clouds
      g.fillStyle = 'rgba(180,200,255,.16)';
      for (let i = 0; i < 3; i++) {
        const cx = ((t * (6 + i * 3) + i * 220) % (W + 300)) - 150, cy = H * (0.12 + i * 0.09);
        for (const [dx, dy, r] of [[0, 0, 26], [30, 6, 20], [-30, 8, 18], [8, -10, 20]]) { g.beginPath(); g.arc(cx + dx * SC, cy + dy * SC, r * SC, 0, 6.28); g.fill(); }
      }
      // hills, a farmhouse with a lit window, then the meadow
      for (const [col, base, amp, f, off] of [['#17265e', 62, 26, 0.008, 1], ['#12204f', 34, 20, 0.013, 3]]) {
        g.fillStyle = col; g.beginPath(); g.moveTo(0, groundY);
        for (let x = 0; x <= W; x += 10) g.lineTo(x, groundY - base - Math.sin(x * f + off) * amp - Math.sin(x * f * 2.3 + off) * 6);
        g.lineTo(W, groundY); g.closePath(); g.fill();
      }
      const hx = W * 0.86, hy = groundY - 16;
      g.fillStyle = '#0c1740'; g.fillRect(hx - 30, hy - 36, 60, 38); g.beginPath(); g.moveTo(hx - 38, hy - 36); g.lineTo(hx, hy - 66); g.lineTo(hx + 38, hy - 36); g.closePath(); g.fill();
      g.fillRect(hx + 14, hy - 66, 9, 22);
      g.fillStyle = `rgba(255,210,122,${0.85 + Math.sin(t * 3) * 0.08})`; g.shadowColor = '#ffd27a'; g.shadowBlur = 14; g.fillRect(hx - 18, hy - 28, 14, 14); g.shadowBlur = 0;
      const gr = g.createLinearGradient(0, groundY - 16, 0, H);
      gr.addColorStop(0, '#24565a'); gr.addColorStop(0.35, '#17404a'); gr.addColorStop(1, '#0c2430');
      g.fillStyle = gr; g.fillRect(0, groundY - 14, W, H - groundY + 14);
      g.strokeStyle = 'rgba(120,200,170,.22)'; g.lineWidth = 1.5; g.lineCap = 'round';
      for (let i = 0; i < 70; i++) { const x = hash(i + 11) * W, y = groundY + hash(i + 77) * (H - groundY); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y - 7); g.moveTo(x, y); g.lineTo(x + 2, y - 6); g.stroke(); }
      for (const f of flies) { // fireflies
        const x = (f.x * W + Math.sin(t * 0.6 + f.ph) * 30), y = f.y * H + Math.cos(t * 0.8 + f.ph) * 14, a = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2.2 + f.ph));
        const fg = g.createRadialGradient(x, y, 0, x, y, 9); fg.addColorStop(0, `rgba(255,245,150,${a})`); fg.addColorStop(1, 'rgba(255,245,150,0)');
        g.fillStyle = fg; g.fillRect(x - 9, y - 9, 18, 18);
      }
      // the glowing takeoff mark: the sheep should be here when you tap
      let near = 0;
      for (const s of sheep) if (s.state === 'run' || s.state === 'hold') near = Math.max(near, 1 - Math.min(1, Math.abs(st - s.ta) / 0.25));
      const mkA = 0.25 + pulse * 0.2 + near * 0.55;
      g.save(); g.translate(takeoffX, groundY + 8 * SC);
      g.strokeStyle = `rgba(255,236,150,${mkA})`; g.lineWidth = 3; g.shadowColor = '#ffe9a0'; g.shadowBlur = 8 + near * 14;
      g.beginPath(); g.ellipse(0, 0, 34 * SC * (1 + pulse * 0.08), 10 * SC, 0, 0, 6.28); g.stroke();
      g.restore();
      // fence
      const fh = 50 * SC;
      for (const dx of [-30, 0, 30]) {
        const px = fenceX + dx * SC;
        g.fillStyle = '#6e5436'; rr(g, px - 5 * SC, groundY - fh, 10 * SC, fh + 8 * SC, 3); g.fill();
        g.fillStyle = 'rgba(255,230,180,.25)'; g.fillRect(px - 5 * SC, groundY - fh, 3 * SC, fh);
      }
      g.fillStyle = '#80623f';
      for (const y of [groundY - fh * 0.78, groundY - fh * 0.35]) { rr(g, fenceX - 40 * SC, y, 80 * SC, 7 * SC, 3); g.fill(); }
      // sheep
      const order = sheep.filter(s => s.state !== 'queued' && s.state !== 'gone').sort((a, b) => a.x - b.x);
      for (const s of order) {
        const sc = SC * 0.9, lift = s.y;
        const fi = s.state === 'jump' ? 1 : s.state === 'hold' || s.state === 'bonk' ? 0 : Math.floor(t * 11 + s.seed) % 4;
        g.fillStyle = 'rgba(0,10,20,.35)'; g.beginPath(); g.ellipse(s.x + 4, groundY + 6 * SC, 40 * sc * clamp(1 - lift / 260, 0.4, 1), 9 * sc, 0, 0, 6.28); g.fill();
        g.save();
        g.translate(s.x, groundY - s.y);
        if (s.state === 'jump') { const p = (st - s.t0) / J; g.rotate(-0.38 * (1 - 2 * clamp(p, 0, 1))); }
        if (s.state === 'bonk') { g.rotate(Math.sin((st - s.t0) * 40) * 0.08); }
        if (s.kind === 'gold' || s.kind === 'breed') { g.shadowColor = s.kind === 'gold' ? '#ffd84d' : '#9dc9ff'; g.shadowBlur = 14; }
        const im = s.fr[fi];
        if (im && im.complete) g.drawImage(im, -0.4 * 120 * sc, -105 * sc, 120 * sc, 120 * sc);
        g.restore();
        if (s.state === 'run' && Math.abs(st - s.ta) < 0.4 && s.kind === 'dark') label(g, 'don\'t tap!', s.x + 10, groundY - 120 * SC, 14, '#c9a0ff');
        if (s.state === 'bonk') for (let i = 0; i < 3; i++) { const a = (st - s.t0) * 6 + i * 2.1; g.fillStyle = '#ffd84d'; g.beginPath(); g.arc(s.x + 40 + Math.cos(a) * 18, groundY - 110 * SC + Math.sin(a) * 6, 3.5, 0, 6.28); g.fill(); }
      }
      for (const p of parts) { g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.size, 0, 6.28); g.fill(); }
      g.globalAlpha = 1;
      for (const f of floats) { g.globalAlpha = clamp(f.life * 2, 0, 1); label(g, f.text, f.x, f.y, f.size, f.color); }
      g.globalAlpha = 1;
      // count, streak and a drowsy Z for every sheep
      label(g, `🐑 ${jumped}`, W / 2, H * 0.1, 44 * clamp(SC, 0.85, 1.1), '#ffffff');
      if (combo >= 2) label(g, `streak ×${combo}`, W / 2, H * 0.1 + 40, 18, '#ffd84d');
      if (phase === 'play') {
        const pr = clamp(sheep.filter(s => s.state === 'gone' || s.state === 'away').length / TOTAL, 0, 1);
        g.fillStyle = 'rgba(255,255,255,.18)'; rr(g, W * 0.2, H * 0.1 + 62, W * 0.6, 7, 4); g.fill();
        g.fillStyle = '#9dc9ff'; rr(g, W * 0.2, H * 0.1 + 62, Math.max(8, W * 0.6 * pr), 7, 4); g.fill();
      }
      g.restore();
    }

    // ----- frame loop and input -----
    function frame(now) {
      if (!open) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      update(dt); draw();
      raf = requestAnimationFrame(frame);
    }
    O.root.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      e.preventDefault(); tap();
    });
    O.card.addEventListener('click', e => {
      if (e.target.closest('[data-again]')) { Meta.sfx('click'); start(); }
      if (e.target.closest('[data-done]')) closeIt();
    });
    addEventListener('keydown', e => { if (!open) return; if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); } /* Escape does not leave the minigame: it exits fullscreen on CrazyGames. Use the Close button. */ });
    addEventListener('resize', () => { if (open) layout(); });
    function openIt(opts = {}) {
      if (open) return;
      open = true; auto = !!opts.auto;
      layout();
      $('daily').classList.add('hidden');
      O.root.classList.remove('hidden');
      O.coins.textContent = fmt(S.coins);
      phase = 'intro'; st = 0; clock = 0; nextBeat = 0; beatN = 0; parts = []; floats = []; sheep = []; jumped = 0; combo = 0; lives = LIVES;
      hudUpdate();
      O.card.classList.add('hidden');
      setMsg('Tap to start', 'Hop each sheep over the fence when it reaches the glowing mark. Let the black sheep go alone.');
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function closeIt() {
      if (!open) return;
      open = false; cancelAnimationFrame(raf);
      O.root.classList.add('hidden');
      Meta.render();
    }
    O.close.onclick = closeIt;
    return { openIt, closeIt, step: dt => { update(dt); }, draw, tap, start, sheepAir: () => Math.max(0, ...sheep.filter(s => s.state === 'jump').map(s => s.y)), info: () => ({ phase, st, jumped, score, lives, combo, bonks, perfects, hit, active: sheep.filter(s => s.state !== 'gone').length }) };
  }

  // =====================================================================================================
  // TOY BALLS: BASKET TOSS (a timed round of the bouncy-house toss; the scene and rules live in home.js and toss.js)
  // =====================================================================================================
  function makeBallGame() {
    return { openIt: () => Meta.pages.tossRound && Meta.pages.tossRound(), closeIt: () => {}, step: () => {}, draw: () => {}, drop: () => {}, start: () => {},
      info: () => ({ score: Meta.toss ? Meta.toss.score : 0, flying: Meta.toss ? Meta.toss.flying.length : 0 }) };
  }

  // ---------- menu button: each skin gets its own minigame ----------
  const sheepGame = makeSheepGame(), ballGame = makeBallGame();
  Meta.mg = { sheep: sheepGame, balls: ballGame };
  const btn = document.createElement('button');
  btn.className = 'btn ad'; btn.id = 'miniBtn';
  $('fishBtn').after(btn);
  Meta.onSkin = sk => {
    $('fishBtn').classList.toggle('hidden', sk !== 'fish');
    btn.classList.toggle('hidden', sk === 'fish');
    btn.textContent = sk === 'sheep' ? '🌙 Count sheep' : '🏀 Basket toss';
  };
  btn.onclick = () => { Meta.sfx('click'); (Meta.curSkin() === 'sheep' ? sheepGame : ballGame).openIt(); };
  Meta.onSkin(Meta.curSkin());

  // ---------- test hooks: #sheepgame / #ballgame open them, add "auto" to let a bot play ----------
  const hook = location.hash.slice(1);
  if (hook.startsWith('sheepgame')) { $('daily').classList.add('hidden'); sheepGame.openIt({ auto: hook.includes('auto') }); if (hook.includes('auto')) setTimeout(sheepGame.tap, 400); }
  if (hook.startsWith('ballgame')) setTimeout(() => { $('daily').classList.add('hidden'); ballGame.openIt(); }, 500); // home.js loads after this file
})();
