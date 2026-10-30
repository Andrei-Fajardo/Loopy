/* Lasso fishing minigame (Stardew-style): cast, hook the bite, then hold to keep the green bar on the fish.
   Catches are fish (they join the album), junk, or treasure chests. Five hats can only be won here.
   Gear shop: rods (bar size), reels (fill/drain), lines (slower fish, longer bite window), plus gag tools
   (metal detector, baseball bat...) that only change the look and the jokes.
   Needs meta.js, water.js and game.js loaded first (it uses Meta, Water and the global Sfx). */
(() => {
  const $ = id => document.getElementById(id);
  const { S, el, fmt, RARITY, hats } = Meta;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = a => a[(Math.random() * a.length) | 0];
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  // ---------- gear ----------
  const RODS = [
    { id: 'twig', name: 'Twig Rod', cost: 0, bar: 0, col: '#8a5a2b' },
    { id: 'bamboo', name: 'Bamboo Rod', cost: 150, bar: 0.025, col: '#c9b458' },
    { id: 'fiber', name: 'Fiberglass Rod', cost: 450, bar: 0.05, col: '#3a86ff' },
    { id: 'carbon', name: 'Carbon Rod', cost: 1100, bar: 0.075, col: '#2a2f3a' },
    { id: 'golden', name: 'Golden Rod', cost: 2500, lv: 10, bar: 0.105, col: '#ffd84d' },
  ];
  const REELS = [
    { id: 'rusty', name: 'Rusty Reel', cost: 0, fill: 0, drain: 0, col: '#9a6a4a' },
    { id: 'bearing', name: 'Ball-Bearing Reel', cost: 150, fill: 0.02, drain: 0.008, col: '#8fa3b0' },
    { id: 'smooth', name: 'Smooth Reel', cost: 400, fill: 0.04, drain: 0.016, col: '#3fb868' },
    { id: 'turbo', name: 'Turbo Reel', cost: 950, fill: 0.06, drain: 0.024, col: '#ff5d73' },
    { id: 'quantum', name: 'Quantum Reel', cost: 2200, lv: 10, fill: 0.085, drain: 0.034, col: '#c86bfa' },
  ];
  const LINES = [
    { id: 'cotton', name: 'Cotton Thread', cost: 0, slow: 0, win: 0, col: '#f0e6d2' },
    { id: 'nylon', name: 'Nylon Line', cost: 120, slow: 0.05, win: 0.1, col: '#cfefff' },
    { id: 'braid', name: 'Braided Line', cost: 350, slow: 0.09, win: 0.2, col: '#7bd389' },
    { id: 'fluoro', name: 'Fluoro Line', cost: 850, slow: 0.13, win: 0.3, col: '#ff8fb8' },
    { id: 'spider', name: 'Spider Silk', cost: 2000, lv: 10, slow: 0.18, win: 0.4, col: '#e8e8ff' },
  ];
  // Gag tools: cosmetic only. They swap the rod art and the jokes.
  const GAGS = [
    { id: 'std', name: 'Regular Rod', cost: 0, icon: '🎣', wait: 'Waiting for a bite…', bite: 'Tap now!!', quips: [] },
    { id: 'detector', name: 'Metal Detector', cost: 500, icon: '📡', wait: 'Sweeping the water…', bite: 'BEEP BEEP BEEP!', sfx: 'beep',
      quips: ['The detector is very proud of itself.', 'Detector says: definitely metal. Also fish.'] },
    { id: 'bat', name: 'Baseball Bat', cost: 400, icon: '⚾', wait: 'Waiting for a pitch…', bite: 'SWING!', sfx: 'clonk',
      quips: ['Home run!', 'You swung. The fish allowed it.'] },
    { id: 'putter', name: 'Golf Putter', cost: 400, icon: '⛳', wait: 'Lining up the shot…', bite: 'FORE!', sfx: 'clonk',
      quips: ['Hole in one!', 'Nice putt. Very nice putt.'] },
    { id: 'broom', name: 'Broom', cost: 300, icon: '🧹', wait: 'Sweeping up…', bite: 'Sweep it!',
      quips: ['Squeaky clean catch.', 'The witches are jealous.'] },
    { id: 'umbrella', name: 'Umbrella', cost: 350, icon: '☂️', wait: 'Looks like rain…', bite: 'Brolly bite!',
      quips: ['Raining fish!', 'Stylish and dry.'] },
    { id: 'trombone', name: 'Trombone', cost: 600, icon: '🎺', wait: 'Warming up…', bite: 'WAH WAH!', sfx: 'honk',
      quips: ['The fish came for the jazz.', 'Fish respect the music.'] },
    { id: 'baguette', name: 'Baguette', cost: 450, icon: '🥖', wait: 'Snack time…', bite: 'Bon appétit!',
      quips: ['Do not eat the rod.', 'Bait and tool in one.'] },
    { id: 'glow', name: 'Glow Sword', cost: 800, icon: '🗡️', wait: 'Charging up…', bite: 'Strike now!',
      quips: ['Dramatic lighting!', 'Fish fear the glow.'] },
  ];
  // Token-only gag tools: bought in the Tokens tab, then equipped from Shop > Gag tools.
  GAGS.push(
    { id: 'trident', name: 'Trident', cost: 0, tokenCost: 60, icon: '🔱', wait: 'Awaiting tribute…', bite: 'BEHOLD!', sfx: 'clonk', quips: ['The sea bows to you.', 'Overkill, but stylish.'] },
    { id: 'noodle', name: 'Pool Noodle', cost: 0, tokenCost: 40, icon: '🏊', wait: 'Floating about…', bite: 'Boing!', sfx: 'boing', quips: ['Surprisingly effective.', 'Squishy but determined.'] },
  );
  const LISTS = { rod: RODS, reel: REELS, line: LINES, gag: GAGS };
  const CAT_NAME = { rod: 'Rods', reel: 'Reels', line: 'Lines', gag: 'Gag tools' };

  // ---------- save (lives in the main save under S.fishing; older saves simply don't have it yet) ----------
  const DEF = { casts: 0, catches: 0, perfects: 0, streak: 0, bestStreak: 0, misses: 0, chests: 0, legend: false, intro: false,
    up: { lure: 0, tackle: 0 }, junk: {}, tokens: 0, boost: { luck: 0, chum: 0 },
    own: { rod: ['twig'], reel: ['rusty'], line: ['cotton'], gag: ['std'] }, eq: { rod: 'twig', reel: 'rusty', line: 'cotton', gag: 'std' } };
  const old = S.fishing || {};
  const F = S.fishing = { ...DEF, ...old, up: { ...DEF.up, ...old.up }, junk: { ...old.junk },
    own: { ...DEF.own, ...old.own }, eq: { ...DEF.eq, ...old.eq }, boost: { ...DEF.boost, ...old.boost } };
  const gear = () => {
    const g = {};
    for (const k in LISTS) g[k] = LISTS[k].find(x => x.id === F.eq[k]) || LISTS[k][0];
    return g;
  };

  // ---------- loot ----------
  const JUNK = [
    { id: 'boot', name: 'Old Boot', e: '🥾' }, { id: 'news', name: 'Soggy Newspaper', e: '📰' }, { id: 'can', name: 'Tin Can', e: '🥫' },
    { id: 'weed', name: 'Seaweed Clump', e: '🌿' }, { id: 'hook', name: 'Rusty Hook', e: '🪝' }, { id: 'sock', name: 'Lost Sock', e: '🧦' },
  ];
  const CHEST_HATS = hats.filter(h => h.fish === 'Treasure chest').map(h => h.id);
  const FISH_TOKENS = { U: 1, R: 2, E: 5, L: 15 };
  const FISH_COINS = { U: 25, R: 60, E: 140, L: 400 }, FISH_XP = { U: 8, R: 15, E: 30, L: 60 };
  const DIFF = { trash: 0.12, chest: 0.55, U: 0.3, R: 0.5, E: 0.7, L: 0.9 };

  const UPS = {
    lure:   { name: 'Shiny Lure',   icon: '✨', desc: 'Fish bite sooner and you get more time to hook', base: 120 },
    tackle: { name: 'Lucky Tackle', icon: '🍀', desc: 'Less junk, more chests, rarer fish', base: 180 },
  };
  const UP_MAX = 5;
  const upCost = k => Math.round(UPS[k].base * Math.pow(1.7, F.up[k]));

  let castLuck = false, castChum = false; // boosts are decided when you cast
  function rollItem() {
    const lk = F.up.tackle + (castLuck ? 3 : 0), r = Math.random() * 100;
    const chest = 3 + 0.7 * lk, trash = Math.max(12, 30 - 3 * lk);
    if (r < chest) return { type: 'chest', diff: DIFF.chest };
    if (r < chest + trash) return { type: 'trash', junk: pick(JUNK), diff: DIFF.trash };
    let sp = Meta.rollSpecies();
    if (Math.random() < lk * 0.08) { const b = Meta.rollSpecies(); if ('ULER'.indexOf(b.rar) < 'ULER'.indexOf(sp.rar)) sp = b; } // luck: keep the rarer of two rolls
    return { type: 'fish', sp, diff: DIFF[sp.rar] };
  }
  const itemName = it => it.type === 'chest' ? 'Treasure Chest' : it.type === 'trash' ? it.junk.name : it.sp.name;

  // ---------- state ----------
  const root = $('fishing'), cv = $('fcv'), mainCtx = cv.getContext('2d'), msg = $('fMsg'), card = $('fResult');
  let ctx = mainCtx;
  let bend = 0, bendS = 0.04; // how far the rod flexes (fraction of its length at the tip)
  let open = false, W = 0, H = 0, last = 0, t = 0, raf = 0;
  let st = 'idle', stT = 0, item = null, holding = false, shake = 0;
  let bar, fsh, prog, dprog, perfect, onTarget = false, spin = 0, rings = [], bits = [], resultReady = 0;

  const setMsg = (a, b = '') => { msg.innerHTML = a + (b ? `<small>${b}</small>` : ''); };
  function go(next, text, sub) { st = next; stT = 0; if (text !== undefined) setMsg(text, sub); }
  function updateGear() {
    const g = gear();
    $('fTokens').textContent = fmt(F.tokens);
    $('fGear').innerHTML = [`🎣 ${g.rod.name}`, `⚙️ ${g.reel.name}`, `🧵 ${g.line.name}`, g.gag.id !== 'std' ? `${g.gag.icon} ${g.gag.name}` : '',
      F.streak > 0 ? `🔥 Perfect ×${F.streak}` : '', F.boost.luck > 0 ? `✨ Golden bait ×${F.boost.luck}` : '', F.boost.chum > 0 ? `🪣 Chum ×${F.boost.chum}` : ''].filter(Boolean).map(x => `<span>${x}</span>`).join('');
  }

  function idle() {
    go('idle', 'Tap to cast', F.intro ? '' : 'Tap when the ! pops up, then HOLD to lift the green bar. Keep it on the fish!');
    card.classList.add('hidden');
    updateGear();
  }
  function cast() {
    Meta.sfx('cast'); F.casts++;
    castLuck = F.boost.luck > 0; castChum = F.boost.chum > 0;
    if (castLuck) F.boost.luck--;
    if (castChum) F.boost.chum--;
    updateGear();
    go('cast', '');
  }
  function startWait() {
    Meta.sfx('plop');
    const g = geo();
    rings.push({ x: g.bx, y: g.SY, r: 4, life: 1 });
    go('wait', gear().gag.wait, 'Tap to reel the line back in');
    stT = -rand(1.4, 4.2) * (1 - F.up.lure * 0.08) * (castChum ? 0.5 : 1);
  }
  function bite() {
    const gag = gear().gag;
    Meta.sfx(gag.sfx || 'bite'); buzz([40, 30, 40]);
    go('bite', gag.bite);
    item = rollItem();
  }
  function startReel() {
    const g = gear();
    bar = { pos: 0.3, vel: 0, size: 0.2 + g.rod.bar };
    fsh = { pos: 0.55, vel: 0, target: 0.6, timer: 0, ph: rand(0, 6) };
    prog = dprog = 0.32; perfect = true;
    go('reel', 'Hold to lift · release to drop', 'Keep the green bar on the fish');
    buzz(30);
  }
  function snapAway(text) {
    F.misses++; F.streak = 0; Meta.save(); updateGear();
    Meta.sfx('snag'); buzz([60, 40, 60]);
    shake = 8;
    go('lost', text, 'Tap to try again');
    resultReady = 0.4;
  }

  // ---------- rewards ----------
  function giveHat(id) {
    if (S.owned.hat.includes(id)) return null;
    S.owned.hat.push(id);
    return hats.find(h => h.id === id);
  }

  function land() {
    F.catches++;
    F.streak = perfect ? F.streak + 1 : 0;
    F.bestStreak = Math.max(F.bestStreak, F.streak);
    if (perfect) F.perfects++;
    F.intro = true;
    const mult = (perfect ? 1.5 : 1) * (1 + Math.min(F.streak, 5) * 0.05);
    let coins = 0, xp = 0, tag = '', tagColor = '#5b8792', icon;
    const extras = [];
    if (item.type === 'fish') {
      const { sp } = item, rar = RARITY[sp.rar];
      coins = FISH_COINS[sp.rar]; xp = FISH_XP[sp.rar]; tag = rar.name; tagColor = rar.c;
      icon = `<img src="${Meta.fishImage({ color: sp.color, species: sp.id }, 96)}" width="96" height="96" alt="">`;
      const fresh = !S.album[sp.id];
      S.album[sp.id] = (S.album[sp.id] || 0) + 1;
      if (fresh) extras.push(`NEW for your album! (${Meta.albumCount()} / ${Meta.SPECIES.length})`);
      if (sp.rar === 'L' && !F.legend) {
        F.legend = true;
        const h = giveHat('lanterncap');
        if (h) extras.push(`🎩 Unlocked the ${h.name}!`);
      }
    } else if (item.type === 'trash') {
      coins = 2 + Math.floor(Math.random() * 5); xp = 2; tag = 'Junk'; icon = `<div class="emoji-big">${item.junk.e}</div>`;
      const fresh = !F.junk[item.junk.id];
      F.junk[item.junk.id] = (F.junk[item.junk.id] || 0) + 1;
      if (fresh) extras.push(`New in your tackle box (${Object.keys(F.junk).length} / ${JUNK.length})`);
      if (Object.keys(F.junk).length === JUNK.length) {
        const h = giveHat('junkcrown');
        if (h) extras.push(`🎩 Full tackle box! Unlocked the ${h.name}!`);
      }
    } else {
      F.chests++;
      xp = 40; tag = 'Treasure'; tagColor = '#e08a00'; icon = '<div class="emoji-big">🧰</div>';
      const pool = CHEST_HATS.filter(id => !S.owned.hat.includes(id));
      if (pool.length && Math.random() < 0.45) {
        const h = giveHat(pick(pool));
        coins = 60;
        extras.push(`🎩 Inside: the ${h.name}! Equip it in Store → Hats.`);
      } else coins = Math.round(rand(150, 400));
    }
    const gag = gear().gag;
    if (gag.quips.length && Math.random() < 0.4) extras.push(`${gag.icon} ${pick(gag.quips)}`);
    let tokens = item.type === 'fish' ? FISH_TOKENS[item.sp.rar] : item.type === 'chest' ? 5 : 0;
    if (tokens && perfect) tokens++;
    F.tokens += tokens;
    Meta.vaultCharge?.(8);
    coins = Math.round(coins * mult); xp = Math.round(xp * (perfect ? 1.5 : 1));
    S.coins += coins; S.stats.coinsEarned += coins;
    const ups = Meta.addXp(xp);
    Meta.mission('angle', 1); if (perfect) Meta.mission('perfect', 1);
    Meta.save();
    $('fCoins').textContent = fmt(S.coins);
    updateGear();

    if (perfect) extras.unshift(`✨ PERFECT!${F.streak > 1 ? ` ${F.streak} in a row (+${Math.min(F.streak, 5) * 5}%)` : ''}`);
    card.innerHTML = `${icon}<b>${itemName(item)}</b><span class="tag" style="background:${tagColor}">${tag}</span>` +
      `<span class="gain">+${fmt(coins)} coins · +${xp} XP${tokens ? ` · +${tokens} 🎟️` : ''}</span>` + extras.map(x => `<small>${x}</small>`).join('') + '<small>Tap to cast again</small>';
    card.classList.remove('hidden');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    go('result', '');
    resultReady = 0.5;
    const big = item.type === 'chest' || (item.sp && item.sp.rar === 'L') || extras.some(x => x.includes('🎩'));
    Meta.sfx(big ? 'discovery' : item.type === 'fish' ? 'best' : 'coin');
    if (item.type === 'chest') Meta.sfx('chest');
    buzz(big ? [30, 40, 30, 40, 80] : [20, 30, 40]);
    const gg = geo();
    for (let i = 0; i < (big ? 40 : 16); i++) bits.push({ x: gg.bx, y: gg.SY, vx: rand(-260, 260), vy: rand(-420, -100), life: rand(0.7, 1.3), c: pick(['#ffd84d', '#ffffff', '#4cc9f0', '#ff5d8f', '#7bd389']) });
    rings.push({ x: gg.bx, y: gg.SY, r: 6, life: 1 });
    ups.forEach((u, i) => setTimeout(() => Meta.toast(u), 400 + i * 2600));
  }

  // ---------- reel minigame ----------
  function updateReel(dt) {
    const g = gear();
    // The bar is lifted by holding and pulled down by gravity, bouncing softly off the bottom.
    bar.vel += (holding ? 2.7 : -2.3) * dt;
    bar.vel *= 1 - Math.min(1, 1.6 * dt);
    bar.pos += bar.vel * dt;
    const lo = bar.size / 2, hi = 1 - bar.size / 2;
    if (bar.pos < lo) { bar.pos = lo; bar.vel = Math.abs(bar.vel) * 0.35; }
    if (bar.pos > hi) { bar.pos = hi; bar.vel = 0; }
    // The fish glides on a damped spring toward a wandering target, so it eases, overshoots a little and never
    // moves in steps. Harder fish pull harder and pick new targets sooner.
    const d = item.diff;
    if ((fsh.timer -= dt) <= 0) {
      fsh.target = clamp(fsh.pos + rand(-1, 1) * (0.25 + d * 0.5), 0.07, 0.93);
      fsh.timer = rand(0.5, 1.4) * (1.25 - d * 0.6);
    }
    const k = 11 + d * 22, c = 2 * Math.sqrt(k) * 0.62, drift = Math.sin(t * 2.3 + fsh.ph) * 0.03 * d;
    fsh.vel += (k * (fsh.target + drift - fsh.pos) - c * fsh.vel) * dt;
    const vmax = (0.4 + d * 0.9) * (1 - g.line.slow);
    fsh.vel = clamp(fsh.vel, -vmax, vmax);
    fsh.pos += fsh.vel * dt;
    if (fsh.pos < 0.05) { fsh.pos = 0.05; fsh.vel = Math.abs(fsh.vel) * 0.4; }
    if (fsh.pos > 0.95) { fsh.pos = 0.95; fsh.vel = -Math.abs(fsh.vel) * 0.4; }

    onTarget = Math.abs(fsh.pos - bar.pos) <= bar.size / 2 + 0.015;
    const before = prog;
    prog += onTarget ? (0.19 + g.reel.fill) * dt : -(0.13 - g.reel.drain) * dt;
    prog = Math.min(prog, 1);
    dprog += (prog - dprog) * Math.min(1, dt * 12);
    spin += dt * (holding || onTarget ? 14 : 3);
    if (!onTarget) perfect = false;
    if (onTarget && Math.floor(prog * 14) !== Math.floor(before * 14)) tick(prog);
    if (prog >= 1) return land();
    if (prog <= 0) snapAway('It got away…');
  }
  let tickAt = 0;
  function tick(p) { if (performance.now() - tickAt > 110) { tickAt = performance.now(); Sfx.reelTick(p); } }

  // ---------- drawing helpers ----------
  const geo = () => {
    const HZ = H * 0.3;
    return { HZ, SY: HZ + H * 0.12, bx: W * 0.5, pierW: W * 0.3, deckY: HZ + 10 };
  };
  const trackBox = () => { const h = Math.min(H * 0.56, 430); return { x: W - 92, w: 54, y: geo().HZ + 44, h }; };
  function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function lerpCol(a, b, k) { return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`; }

  // Mystery-catch silhouettes seen under the water.
  function silhouette(x, y, ang, sc, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc);
    ctx.fillStyle = `rgba(4,28,44,${alpha})`;
    const it = item || { type: 'fish' };
    if (it.type === 'chest') { rr(-16, -11, 32, 22, 4); ctx.fill(); }
    else if (it.type === 'trash') { ctx.beginPath(); [[-16, 4], [-9, -10], [3, -7], [14, -12], [18, 4], [6, 11], [-8, 9]].forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill(); }
    else {
      const big = it.sp && (it.sp.rar === 'E' || it.sp.rar === 'L') ? 1.3 : 1;
      ctx.scale(big, big);
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 11, 0, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-38, -12); ctx.lineTo(-38, 12); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- tools: drawn along +x from the hand (0,0) to the tip (L,0) ----------
  function poly(pts, fill) { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill(); }
  function drawTool(id, L, time, rodCol, reelCol, lineCol = '#f0e6d2') {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const grip = (w, col = '#2b1a0e') => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.2, 0); ctx.stroke(); };
    switch (id) {
      case 'detector': {
        grip(9);
        ctx.strokeStyle = '#7a8591'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(L * 0.2, 0); ctx.lineTo(L * 0.92, 0); ctx.stroke();
        ctx.strokeStyle = '#a9b4be'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L * 0.2, -1.5); ctx.lineTo(L * 0.92, -1.5); ctx.stroke();
        rr(L * 0.3, -14, 30, 14, 4); ctx.fillStyle = '#2a2f3a'; ctx.fill();
        ctx.fillStyle = Math.sin(time * 12) > 0 ? '#7bf09a' : '#2f6b40'; ctx.beginPath(); ctx.arc(L * 0.3 + 8, -7, 3, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#ffb347'; ctx.fillRect(L * 0.3 + 15, -10, 11, 6);
        ctx.fillStyle = '#4a525c'; ctx.beginPath(); ctx.ellipse(L * 0.96, 3, 24, 9, 0.15, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#8b97a3'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = Math.sin(time * 14) > 0.2 ? '#ff4040' : '#702020'; ctx.beginPath(); ctx.arc(L * 0.96, 3, 3.5, 0, 6.28); ctx.fill();
        break;
      }
      case 'bat': {
        poly([[0, -2.5], [L * 0.55, -4], [L * 0.9, -9], [L, -8], [L + 3, 0], [L, 8], [L * 0.9, 9], [L * 0.55, 4], [0, 2.5]], '#d9a05b');
        poly([[L * 0.5, -3.5], [L * 0.9, -8], [L * 0.9, -5], [L * 0.5, -2]], 'rgba(255,255,255,.28)');
        grip(6, '#2a2a2a');
        ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#a4562a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L * 0.78, -8); ctx.lineTo(L * 0.78, 8); ctx.moveTo(L * 0.84, -8.5); ctx.lineTo(L * 0.84, 8.5); ctx.stroke();
        break;
      }
      case 'putter': {
        grip(8, '#1d1d1d');
        ctx.strokeStyle = '#cfd6dd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L * 0.2, 0); ctx.lineTo(L * 0.97, 0); ctx.stroke();
        poly([[L * 0.93, -4], [L + 16, -4], [L + 20, 10], [L * 0.93, 10]], '#b8c2cc');
        poly([[L + 2, -2], [L + 16, -2], [L + 17, 0], [L + 2, 0]], 'rgba(255,255,255,.6)');
        ctx.fillStyle = '#e63946'; ctx.fillRect(L + 6, 4, 8, 3);
        break;
      }
      case 'broom': {
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.84, 0); ctx.stroke();
        poly([[L * 0.8, -5], [L + 12, -17], [L + 12, 17], [L * 0.8, 5]], '#e5c15a');
        ctx.strokeStyle = '#b8902f'; ctx.lineWidth = 1.5;
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(L * 0.82, i * 1.4); ctx.lineTo(L + 12, i * 5); ctx.stroke(); }
        ctx.fillStyle = '#7a4a1e'; ctx.fillRect(L * 0.8, -6, 5, 12);
        break;
      }
      case 'umbrella': {
        ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(-1, 7, 7, -Math.PI / 2, Math.PI, true); ctx.stroke();
        poly([[L * 0.38, 0], [L * 0.6, -8], [L * 0.8, -11], [L * 0.95, -4], [L + 4, 0], [L * 0.95, 4], [L * 0.8, 11], [L * 0.6, 8]], '#2a3f9d');
        ctx.strokeStyle = '#6f86e8'; ctx.lineWidth = 1.5;
        for (const f of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(L * 0.4, f * 2); ctx.lineTo(L * 0.96, f * 3.5); ctx.stroke(); }
        ctx.fillStyle = '#cfd6dd'; ctx.fillRect(L + 2, -1.5, 8, 3);
        break;
      }
      case 'trombone': {
        ctx.strokeStyle = '#e0b020'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(L * 0.05, 0); ctx.lineTo(L * 0.86, 0); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(L * 0.12, 9); ctx.lineTo(L * 0.84, 9); ctx.stroke();
        ctx.beginPath(); ctx.arc(L * 0.12, 4.5, 4.5, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
        ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(L * 0.1, -1.5); ctx.lineTo(L * 0.85, -1.5); ctx.stroke();
        poly([[L * 0.84, -3], [L + 8, -18], [L + 8, 18], [L * 0.84, 12]], '#e0b020');
        ctx.fillStyle = '#7a5a10'; ctx.beginPath(); ctx.ellipse(L + 8, 0, 5, 18, 0, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#1d1d1d'; ctx.fillRect(L * 0.3, -3, 7, 14);
        break;
      }
      case 'baguette': {
        rr(-4, -9, L + 8, 18, 9); ctx.fillStyle = '#d9a45b'; ctx.fill();
        ctx.save(); rr(-4, -9, L + 8, 18, 9); ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, -9, L + 4, 5);
        ctx.strokeStyle = '#a86c2c'; ctx.lineWidth = 2.4;
        for (let x = L * 0.18; x < L; x += L * 0.16) { ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x + 9, -6); ctx.stroke(); }
        ctx.restore();
        ctx.strokeStyle = '#a86c2c'; ctx.lineWidth = 1.5; rr(-4, -9, L + 8, 18, 9); ctx.stroke();
        break;
      }
      case 'glow': {
        ctx.fillStyle = '#6b7480'; ctx.fillRect(0, -4, L * 0.2, 8);
        ctx.fillStyle = '#c0c8d0'; ctx.fillRect(L * 0.2, -9, 5, 18);
        const hue = 180 + Math.sin(time * 2) * 25;
        ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 14 + Math.sin(time * 9) * 3;
        rr(L * 0.2 + 5, -4, L * 0.8 - 5, 8, 4); ctx.fillStyle = `hsl(${hue},100%,62%)`; ctx.fill();
        rr(L * 0.2 + 5, -2, L * 0.8 - 5, 4, 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'trident': {
        ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * 0.9, 0); ctx.stroke();
        ctx.strokeStyle = '#d9dee3'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(L * 0.88, 0); ctx.lineTo(L + 18, 0); ctx.moveTo(L * 0.9, -10); ctx.lineTo(L * 0.9, 10);
        ctx.moveTo(L * 0.9, -10); ctx.lineTo(L + 12, -10); ctx.moveTo(L * 0.9, 10); ctx.lineTo(L + 12, 10); ctx.stroke();
        for (const y of [-10, 0, 10]) poly([[L + (y ? 12 : 18), y - 4], [L + (y ? 22 : 28), y], [L + (y ? 12 : 18), y + 4]], '#eef2f5');
        break;
      }
      case 'noodle': {
        const cols = ['#ff5d73', '#ffd84d', '#4cc9f0', '#7bd389'];
        ctx.lineCap = 'round';
        cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(L * i / 4 + 3, Math.sin(i) * 2); ctx.lineTo(L * (i + 1) / 4, Math.sin(i + 1) * 2); ctx.stroke(); });
        ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(L, -3); ctx.stroke();
        ctx.fillStyle = '#2a2f3a'; ctx.beginPath(); ctx.ellipse(L + 1, 0, 3, 5, 0, 0, 6.28); ctx.fill();
        break;
      }
      default: { // regular rod: cork grip, tapered blank that flexes, wrapped guides, spinning reel in the reel tier's color
        const P = f => ({ x: L * f, y: bend * L * f * f });
        // Cork handle with rings, then the metal reel seat.
        rr(-3, -5.5, L * 0.19, 11, 5); ctx.fillStyle = '#d2a679'; ctx.fill();
        ctx.strokeStyle = 'rgba(120,80,40,.55)'; ctx.lineWidth = 1;
        for (let x = 4; x < L * 0.18; x += 6) { ctx.beginPath(); ctx.moveTo(x, -5); ctx.lineTo(x, 5); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(-1, -4.5, L * 0.17, 2.5, 1.2); ctx.fill();
        ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(-3, 0, 5.5, 0, 6.28); ctx.fill();
        rr(L * 0.17, -4.5, L * 0.07, 9, 2); ctx.fillStyle = '#6b7480'; ctx.fill();
        ctx.fillStyle = '#aab4be'; ctx.fillRect(L * 0.17, -4.5, L * 0.07, 2);
        // The blank: tapered segments along the bend curve, with a light edge.
        const N = 18;
        for (let i = 0; i < N; i++) {
          const f0 = 0.24 + 0.76 * i / N, f1 = 0.24 + 0.76 * (i + 1) / N, p0 = P(f0), p1 = P(f1), w = 4.4 - 3.4 * f0;
          ctx.lineCap = 'butt';
          ctx.strokeStyle = rodCol; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = Math.max(0.8, w * 0.3); ctx.beginPath(); ctx.moveTo(p0.x, p0.y - w * 0.28); ctx.lineTo(p1.x, p1.y - w * 0.28); ctx.stroke();
        }
        ctx.lineCap = 'round';
        // Guides hang under the blank, each with a thread wrap; they shrink toward the tip.
        [0.3, 0.42, 0.54, 0.65, 0.76, 0.86, 0.94].forEach((f, i) => {
          const p = P(f), w = 4.4 - 3.4 * f, r = 4.4 - i * 0.45;
          ctx.fillStyle = '#b8291f'; ctx.fillRect(p.x - 1.8, p.y - w / 2 - 0.3, 3.6, w + 0.6);
          ctx.strokeStyle = '#d9dee3'; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(p.x, p.y + w / 2); ctx.lineTo(p.x, p.y + w / 2 + 1.5); ctx.stroke();
          ctx.beginPath(); ctx.arc(p.x, p.y + w / 2 + 1.5 + r, r, 0, 6.28); ctx.stroke();
        });
        const tp = P(1);
        ctx.strokeStyle = '#d9dee3'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(tp.x + 1.5, tp.y, 2.2, 0, 6.28); ctx.stroke();
        // Spinning reel: foot, body, spool, bail wire and a crank that turns while you reel.
        const rp = P(0.2), rx = rp.x + 5, ry = rp.y + 5;
        ctx.strokeStyle = '#3a3f47'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(rp.x + 2, rp.y + 3); ctx.lineTo(rx, ry + 3); ctx.stroke();
        ctx.fillStyle = reelCol; ctx.beginPath(); ctx.ellipse(rx, ry + 8, 9, 7, 0, 0, 6.28); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(rx - 2.5, ry + 5.5, 4, 2.2, -0.4, 0, 6.28); ctx.fill();
        ctx.fillStyle = '#cfd6dd'; rr(rx + 6, ry + 4, 9, 9, 2); ctx.fill();
        ctx.fillStyle = lineCol; ctx.fillRect(rx + 7, ry + 5.5, 7, 6);
        ctx.strokeStyle = '#8b97a3'; ctx.lineWidth = 1; ctx.strokeRect(rx + 6, ry + 4, 9, 9);
        ctx.strokeStyle = '#d9dee3'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(rx + 10, ry + 8.5, 9, -1.2, 1.2); ctx.stroke();
        const ca = spin, kx = rx - 2 + Math.cos(ca) * 9, ky = ry + 8 + Math.sin(ca) * 9;
        ctx.strokeStyle = '#2a2f3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx - 2, ry + 8); ctx.lineTo(kx, ky); ctx.stroke();
        ctx.fillStyle = '#ff5d73'; ctx.beginPath(); ctx.arc(kx, ky, 2.6, 0, 6.28); ctx.fill();
      }
    }
  }

  // Small icon of a tool for the shop (cached). drawTool draws into the module's `ctx`, so point it at the icon for a moment.
  const toolCache = {};
  function toolImage(id, size, rodCol = '#8a5a2b', reelCol = '#9a6a4a') {
    const key = [id, size, rodCol, reelCol].join();
    if (toolCache[key]) return toolCache[key];
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = c.height = size * 2;
    g.scale(2, 2);
    ctx = g;
    ctx.save();
    ctx.translate(size * 0.06, size * 0.92);
    ctx.rotate(-0.8);
    const keep = bend; bend = 0;
    drawTool(id, size * 1.0, 0.4, rodCol, reelCol);
    bend = keep;
    ctx.restore();
    ctx = mainCtx;
    return (toolCache[key] = c.toDataURL());
  }

  // ---------- scene ----------
  function drawScene() {
    const { HZ, deckY } = geo();
    // Sky with sun, clouds and far hills.
    const sky = ctx.createLinearGradient(0, 0, 0, HZ);
    sky.addColorStop(0, '#6fc4ef'); sky.addColorStop(1, '#d9f3fb');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, HZ + 2);
    const sx = W * 0.78, sy = HZ * 0.42;
    const sun = ctx.createRadialGradient(sx, sy, 4, sx, sy, 90);
    sun.addColorStop(0, 'rgba(255,248,200,1)'); sun.addColorStop(0.2, 'rgba(255,240,170,.8)'); sun.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = sun; ctx.fillRect(sx - 100, sy - 100, 200, 200);
    ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(sx, sy, 20, 0, 6.28); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 3; i++) {
      const cx = ((t * (5 + i * 2) + i * 230) % (W + 260)) - 130, cy = HZ * (0.2 + i * 0.2);
      for (const [dx, dy, r] of [[0, 0, 20], [22, 6, 16], [-22, 8, 14], [8, -10, 15]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, 6.28); ctx.fill(); }
    }
    for (const [col, base, amp, f] of [['#7fb99a', 22, 14, 0.011], ['#4f9172', 8, 10, 0.017]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, HZ);
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, HZ - base - Math.sin(x * f + base) * amp - Math.sin(x * f * 2.7) * 4);
      ctx.lineTo(W, HZ); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#2f6b4f';
    for (const x of [W * 0.55, W * 0.6, W * 0.66, W * 0.93]) { ctx.beginPath(); ctx.moveTo(x - 7, HZ - 6); ctx.lineTo(x, HZ - 30); ctx.lineTo(x + 7, HZ - 6); ctx.closePath(); ctx.fill(); }

    // Water body: depth gradient, moving caustics, ripple lines and the sun's glitter path.
    const wat = ctx.createLinearGradient(0, HZ, 0, H);
    wat.addColorStop(0, '#9bd9e6'); wat.addColorStop(0.12, '#4fb3cb'); wat.addColorStop(0.45, '#1d7f9e'); wat.addColorStop(1, '#06304a');
    ctx.fillStyle = wat; ctx.fillRect(0, HZ, W, H - HZ);
    Water.overlay(ctx, W, H, t, { strength: 1.0, y0: HZ + (H - HZ) * 0.12, y1: H });
    // Surface waves in perspective: thin strokes get longer, thicker and faster toward the viewer.
    // Crests catch the sun near its reflection; troughs are a darker blue underneath.
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const f = i / 69, z = f * f * f * 0.7 + f * 0.3, y = HZ + 5 + z * (H - HZ) * 0.97 + Math.sin(t * 0.7 + i) * 0.8 * (0.3 + z);
      const len = 12 + z * 170, spd = (3 + z * 26) * (i % 2 ? 1 : -0.7);
      const x = (((t * spd + i * 131.7) % (W + len * 2)) + W + len * 2) % (W + len * 2) - len;
      const mid = x + len / 2, near = Math.exp(-Math.pow((mid - sx) / (W * 0.16 + z * W * 0.1), 2));
      const lw = 0.8 + z * 3.2, bow = 1 + z * 4;
      ctx.strokeStyle = `rgba(0,45,70,${0.1 + z * 0.1})`; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x, y + lw); ctx.quadraticCurveTo(mid, y + lw - bow, x + len, y + lw); ctx.stroke();
      ctx.strokeStyle = `rgba(255,${240 + near * 10},${230 - near * 40},${0.07 + z * 0.08 + near * (0.5 - z * 0.25)})`; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mid, y - bow, x + len, y); ctx.stroke();
    }
    // Light mist just under the surface and a faint sky reflection toward the horizon.
    const mist = ctx.createLinearGradient(0, HZ, 0, HZ + (H - HZ) * 0.35);
    mist.addColorStop(0, 'rgba(210,240,250,.4)'); mist.addColorStop(1, 'rgba(210,240,250,0)');
    ctx.fillStyle = mist; ctx.fillRect(0, HZ, W, (H - HZ) * 0.35);
    // Drifting particles in the water column give it depth.
    ctx.fillStyle = 'rgba(220,245,255,.35)';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97 + t * (3 + (i % 5))) % W), y = HZ + 30 + ((i * 53.7 + Math.sin(t * 0.4 + i) * 20) % (H - HZ - 40));
      ctx.beginPath(); ctx.arc(x, y, 0.8 + (i % 3) * 0.5, 0, 6.28); ctx.fill();
    }
    for (let i = 0; i < 12; i++) {
      const y = HZ + 3 + i * 8, w = (46 - i * 2.4) * (0.7 + 0.3 * Math.sin(t * 2 + i * 1.7));
      ctx.fillStyle = `rgba(255,250,210,${0.5 - i * 0.032})`; rr(sx - w / 2 + Math.sin(t + i) * 4, y, w, 2.5, 1.2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(0, HZ, W, 1.5);

    // Life under the surface: slow dark fish, rising bubbles and swaying weed.
    for (let i = 0; i < 4; i++) {
      const x = ((t * (11 + i * 5) + i * 170) % (W + 200)) - 100, y = HZ + H * (0.4 + (i % 3) * 0.1) + Math.sin(t * 0.8 + i) * 8;
      ctx.fillStyle = 'rgba(4,40,60,.17)';
      ctx.beginPath(); ctx.ellipse(x, y, 20 + i * 3, 8 + i, 0, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 18 - i * 3, y); ctx.lineTo(x - 32 - i * 3, y - 9); ctx.lineTo(x - 32 - i * 3, y + 9); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(220,250,255,.28)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      const span = H - HZ, y = H - ((t * (22 + (i % 4) * 5) + i * 83) % span), x = (i * 61 + 30) % W + Math.sin(t + i) * 5;
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, 6.28); ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = (i + 0.5) * W / 9, h = 38 + (i * 37) % 40, sw = Math.sin(t * 1.6 + i) * 9;
      ctx.strokeStyle = i % 2 ? 'rgba(20,110,70,.6)' : 'rgba(30,140,80,.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, H + 4); ctx.quadraticCurveTo(x + sw, H - h * 0.5, x + sw * 1.6, H - h); ctx.stroke();
    }
    // Soft shadow toward the bottom so the message pill reads.
    const sh = ctx.createLinearGradient(0, H * 0.8, 0, H);
    sh.addColorStop(0, 'rgba(0,20,35,0)'); sh.addColorStop(1, 'rgba(0,20,35,.35)');
    ctx.fillStyle = sh; ctx.fillRect(0, H * 0.8, W, H * 0.2);

    // Pier with posts, planks, a bucket and a tackle box.
    const pw = geo().pierW;
    for (const px of [22, pw - 20]) {
      const pg = ctx.createLinearGradient(px, 0, px + 12, 0); pg.addColorStop(0, '#6e4725'); pg.addColorStop(1, '#4a2e15');
      ctx.fillStyle = pg; ctx.fillRect(px, deckY + 14, 12, 92);
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5;
      const wy = deckY + 90 + Math.sin(t * 2 + px) * 1.5; ctx.beginPath(); ctx.ellipse(px + 6, wy, 14, 3.5, 0, 0, 6.28); ctx.stroke();
    }
    const dg = ctx.createLinearGradient(0, deckY - 4, 0, deckY + 14); dg.addColorStop(0, '#b9854a'); dg.addColorStop(1, '#8e6130');
    ctx.fillStyle = dg; ctx.fillRect(0, deckY - 4, pw, 18);
    ctx.fillStyle = '#5a3818'; ctx.fillRect(0, deckY + 10, pw, 5);
    ctx.strokeStyle = 'rgba(60,35,12,.55)'; ctx.lineWidth = 1.5;
    for (let x = 26; x < pw; x += 28) { ctx.beginPath(); ctx.moveTo(x, deckY - 4); ctx.lineTo(x, deckY + 10); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.moveTo(0, deckY - 3); ctx.lineTo(pw, deckY - 3); ctx.stroke();
    // bucket
    const bx = pw * 0.3;
    ctx.fillStyle = '#8f9aa3'; ctx.beginPath(); ctx.moveTo(bx - 14, deckY - 28); ctx.lineTo(bx + 14, deckY - 28); ctx.lineTo(bx + 11, deckY - 4); ctx.lineTo(bx - 11, deckY - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b7c1c9'; ctx.fillRect(bx - 14, deckY - 28, 28, 4);
    ctx.strokeStyle = '#6b7680'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, deckY - 28, 13, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#ff8a4c'; ctx.beginPath(); ctx.moveTo(bx + 4, deckY - 27); ctx.lineTo(bx + 14, deckY - 36); ctx.lineTo(bx + 14, deckY - 22); ctx.closePath(); ctx.fill();
    // tackle box
    rr(pw * 0.52, deckY - 17, 34, 14, 3); ctx.fillStyle = '#e63946'; ctx.fill();
    ctx.fillStyle = '#c1121f'; ctx.fillRect(pw * 0.52, deckY - 11, 34, 2);
    ctx.fillStyle = '#ffd84d'; ctx.fillRect(pw * 0.52 + 14, deckY - 20, 6, 4);

    for (const r of rings) { ctx.strokeStyle = `rgba(255,255,255,${r.life * 0.7})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.35, 0, 0, 6.28); ctx.stroke(); }
  }

  function drawRodAndLine(bobX, bobY, tug = 0) {
    const g = gear(), { pierW, deckY } = geo(), isRod = g.gag.id === 'std';
    const base = { x: pierW - 36, y: deckY - 6 };
    const tipx = pierW + W * 0.15, tipy = deckY - H * 0.15;
    const L = Math.hypot(tipx - base.x, tipy - base.y), ang = Math.atan2(tipy - base.y, tipx - base.x) + tug;
    bend = isRod ? bendS : 0;
    ctx.save();
    ctx.translate(base.x, base.y); ctx.rotate(ang);
    drawTool(isRod ? 'rod' : g.gag.id, L, t, g.rod.col, g.reel.col, g.line.col);
    ctx.restore();
    // The line leaves from the real (flexed) tip.
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const tx = base.x + ca * L - sa * bend * L, ty = base.y + sa * L + ca * bend * L;
    if (bobX === undefined) return { tx, ty };
    ctx.strokeStyle = g.line.col; ctx.lineWidth = g.line.id === 'spider' ? 1.8 : 1.3; ctx.lineCap = 'round';
    if (g.line.id === 'spider') { ctx.shadowColor = '#cfd8ff'; ctx.shadowBlur = 6; }
    ctx.beginPath(); ctx.moveTo(tx, ty);
    const sag = st === 'reel' ? 6 : 38;
    ctx.quadraticCurveTo((tx + bobX) / 2, Math.max(ty, bobY) + sag * (1 - tug * 4), bobX, bobY - 4);
    ctx.stroke(); ctx.shadowBlur = 0;
    return { tx, ty };
  }

  function drawBobber(x, y, dip) {
    const wy = y + dip;
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, wy + 6, 17 + Math.sin(t * 3) * 1.5, 5, 0, 0, 6.28); ctx.stroke();
    ctx.fillStyle = 'rgba(0,30,45,.25)'; ctx.beginPath(); ctx.ellipse(x + 2, wy + 9, 10, 3, 0, 0, 6.28); ctx.fill();
    // A whole ball: white on top, red below (the old version drew only a dome plus one red wedge, so the bottom looked cut off).
    const by = wy - 2;
    ctx.fillStyle = '#ff5d73'; ctx.beginPath(); ctx.arc(x, by, 11, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, by, 11, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(0,30,45,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, by, 11, 0, 6.28); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - 4, by - 5, 3, 2, -0.6, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#ff5d73'; ctx.fillRect(x - 1.5, by - 20, 3, 10);
    ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, wy + 4, 13, 3, 0, 0, Math.PI); ctx.stroke(); // waterline lapping the lower half
  }

  function drawTrack() {
    const b = trackBox(), Y = v => b.y + b.h * (1 - v);
    // Wooden frame with brass studs.
    ctx.fillStyle = 'rgba(0,0,0,.28)'; rr(b.x - 10, b.y - 4, b.w + 20, b.h + 20, 20); ctx.fill();
    const fg = ctx.createLinearGradient(b.x - 12, 0, b.x + b.w + 12, 0);
    fg.addColorStop(0, '#8a5a2b'); fg.addColorStop(0.5, '#c28a45'); fg.addColorStop(1, '#6e4725');
    ctx.fillStyle = fg; rr(b.x - 12, b.y - 12, b.w + 24, b.h + 24, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,180,.5)'; ctx.lineWidth = 2; rr(b.x - 11, b.y - 11, b.w + 22, b.h + 22, 19); ctx.stroke();
    ctx.fillStyle = '#ffd84d';
    for (const [sx2, sy2] of [[b.x - 5, b.y - 5], [b.x + b.w + 5, b.y - 5], [b.x - 5, b.y + b.h + 5], [b.x + b.w + 5, b.y + b.h + 5]]) { ctx.beginPath(); ctx.arc(sx2, sy2, 2.6, 0, 6.28); ctx.fill(); }
    // Inner water with depth marks and bubbles.
    const wg = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    wg.addColorStop(0, '#9fe6f3'); wg.addColorStop(0.35, '#2a9bb8'); wg.addColorStop(1, '#0a4560');
    ctx.save(); rr(b.x, b.y, b.w, b.h, 12); ctx.clip();
    ctx.fillStyle = wg; ctx.fillRect(b.x, b.y, b.w, b.h);
    Water.overlay(ctx, W, H, t, { strength: 1.4, y0: b.y, y1: b.y + b.h, glints: false });
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) { const y = b.y + b.h * i / 10, len = i % 5 ? 8 : 15; ctx.beginPath(); ctx.moveTo(b.x, y); ctx.lineTo(b.x + len, y); ctx.moveTo(b.x + b.w, y); ctx.lineTo(b.x + b.w - len, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) { const y = b.y + b.h - ((t * (30 + i * 6) + i * 70) % b.h); ctx.beginPath(); ctx.arc(b.x + 10 + (i * 17) % (b.w - 20), y, 2 + i % 3, 0, 6.28); ctx.stroke(); }
    // Green catch bar: glossy, glowing while it holds the fish.
    const top = Y(bar.pos + bar.size / 2), hgt = b.h * bar.size;
    const bg = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
    bg.addColorStop(0, holding ? '#7af09a' : '#4fcf74'); bg.addColorStop(0.5, holding ? '#c9ffd8' : '#9ef0b4'); bg.addColorStop(1, holding ? '#7af09a' : '#4fcf74');
    if (onTarget) { ctx.shadowColor = '#9dffb8'; ctx.shadowBlur = 16; }
    ctx.fillStyle = bg; rr(b.x + 3, top, b.w - 6, hgt, 9); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; rr(b.x + 7, top + 3, 7, Math.max(4, hgt - 8), 4); ctx.fill();
    // The hooked catch: a ring around a "?" that bobs and tilts with its speed.
    const fy = Y(fsh.pos) + Math.sin(t * 9) * 1.5;
    ctx.save(); ctx.translate(b.x + b.w / 2, fy); ctx.rotate(clamp(-fsh.vel * 0.5, -0.5, 0.5));
    ctx.shadowColor = onTarget ? '#9dffb8' : 'rgba(0,0,0,.4)'; ctx.shadowBlur = onTarget ? 14 : 6;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 6.28); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = onTarget ? '#2fb861' : '#ff7a8a'; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.fillStyle = '#0b3a4a'; ctx.font = '700 23px Fredoka, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 1);
    ctx.restore();
    ctx.restore();
    // Catch meter: a glass tube whose liquid changes color as it fills.
    const mx = b.x - 44, mw = 20;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; rr(mx - 2, b.y - 2, mw + 4, b.h + 8, 11); ctx.fill();
    ctx.fillStyle = 'rgba(8,40,56,.75)'; rr(mx, b.y - 4, mw, b.h + 8, 10); ctx.fill();
    const fill = Math.max(0.02, dprog), fh = (b.h + 0) * fill;
    const col = dprog > 0.5 ? lerpCol([255, 190, 70], [110, 230, 140], (dprog - 0.5) * 2) : lerpCol([255, 93, 115], [255, 190, 70], dprog * 2);
    ctx.fillStyle = col; rr(mx + 3, b.y + b.h - fh, mw - 6, fh, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(mx + 5, b.y + b.h - fh + 2, 4, Math.max(2, fh - 4), 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
    for (const q of [0.25, 0.5, 0.75]) { const y = b.y + b.h * (1 - q); ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx + 6, y); ctx.moveTo(mx + mw, y); ctx.lineTo(mx + mw - 6, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; rr(mx, b.y - 4, mw, b.h + 8, 10); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 14px Fredoka, system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 3;
    const pct = `${Math.round(dprog * 100)}%`;
    ctx.strokeText(pct, mx + mw / 2, b.y - 12); ctx.fillText(pct, mx + mw / 2, b.y - 12);
  }

  function draw() {
    ctx.save();
    if (shake > 0 && Meta.S.settings?.shake !== false) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    drawScene();
    const g = geo(), bx = g.bx, sy = g.SY;
    if (st === 'idle' || st === 'result' || st === 'lost') {
      const tip = drawRodAndLine();
      // The line hangs slack with the bobber dangling just under the tip.
      ctx.strokeStyle = gear().line.col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tip.tx, tip.ty); ctx.lineTo(tip.tx + 4, tip.ty + 34); ctx.stroke();
      ctx.save(); ctx.translate(tip.tx + 4, tip.ty + 44); ctx.scale(0.8, 0.8); drawBobber(0, 0, Math.sin(t * 2) * 1.5); ctx.restore();
    } else if (st === 'cast') {
      const k = clamp(stT / 0.6, 0, 1), tip = drawRodAndLine();
      const x = tip.tx + (bx - tip.tx) * k, y = tip.ty + (sy - tip.ty) * k - Math.sin(k * Math.PI) * 120;
      ctx.strokeStyle = gear().line.col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tip.tx, tip.ty); ctx.quadraticCurveTo((tip.tx + x) / 2, Math.max(tip.ty, y) + 30, x, y); ctx.stroke();
      drawBobber(x, y, 0);
    } else if (st === 'wait' || st === 'bite') {
      const dip = st === 'bite' ? 7 + Math.sin(stT * 40) * 3 : Math.sin(t * 2.2) * 2;
      if (st === 'bite') silhouette(bx + Math.sin(stT * 12) * 10, sy + 40, Math.sin(stT * 9) * 0.4, 1, 0.4);
      drawRodAndLine(bx, sy + dip, st === 'bite' ? 0.03 : 0);
      drawBobber(bx, sy, dip);
      if (st === 'bite') {
        const win = biteWindow(), k = 1 - stT / win;
        ctx.fillStyle = '#ffd84d'; ctx.strokeStyle = '#0b3a4a'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
        ctx.font = `700 ${64 + Math.sin(stT * 18) * 6}px Fredoka, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeText('!', bx, sy - 80); ctx.fillText('!', bx, sy - 80);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bx, sy - 80, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      }
    } else if (st === 'reel') {
      const wob = Math.sin(t * 25) * 3 * (1 - dprog * 0.5);
      // The hooked fish struggles under the bobber, following the same motion as the minigame fish.
      const fy = sy + 36 + (1 - fsh.pos) * H * 0.34;
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx + wob, sy + 6); ctx.lineTo(bx + Math.sin(t * 6) * 6, fy); ctx.stroke();
      silhouette(bx + Math.sin(t * 6) * 6, fy, clamp(-fsh.vel * 1.2, -0.7, 0.7), 1, 0.5);
      drawRodAndLine(bx + wob, sy + 3, (1 - dprog) * 0.05 + Math.sin(t * 22) * 0.008 * (onTarget ? 0 : 1));
      drawBobber(bx + wob, sy, 3);
      drawTrack();
    }
    for (const p of bits) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  const biteWindow = () => 1.0 + F.up.lure * 0.12 + gear().line.win;

  function frame(now) {
    if (!open) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt; stT += dt;
    const bendTo = st === 'reel' ? (onTarget ? 0.13 : 0.2) + (1 - dprog) * 0.03 + Math.sin(t * 24) * 0.006 : st === 'bite' ? 0.11 : st === 'cast' ? 0.02 : 0.045;
    bendS += (bendTo - bendS) * Math.min(1, dt * 8);
    shake = Math.max(0, shake - dt * 30); resultReady = Math.max(0, resultReady - dt);
    for (const r of rings) { r.r += dt * 50; r.life -= dt * 0.9; } rings = rings.filter(r => r.life > 0);
    for (const p of bits) { p.life -= dt; p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } bits = bits.filter(p => p.life > 0);
    if (st === 'cast' && stT >= 0.6) startWait();
    else if (st === 'wait' && stT >= 0) bite();
    else if (st === 'bite' && stT >= biteWindow()) snapAway('Too slow! It slipped off.');
    else if (st === 'reel') updateReel(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function press() {
    Sfx.init();
    if (st === 'idle') cast();
    else if (st === 'wait') { F.casts--; idle(); setMsg('Reeled in early', 'Tap to cast again'); }
    else if (st === 'bite') startReel();
    else if ((st === 'result' || st === 'lost') && resultReady <= 0) idle();
    else if (st === 'reel') holding = true;
  }
  const release = () => { holding = false; };
  root.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; e.preventDefault(); press(); });
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  addEventListener('keydown', e => {
    if (!open || !$('fSheet').classList.contains('hidden') || e.repeat) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(); }
    // (Escape no longer leaves the minigame: on CrazyGames it exits fullscreen, and a gameplay action must not share that key. Use the Close button.)
  });
  addEventListener('keyup', e => { if (e.key === ' ') release(); });

  // ---------- open / close ----------
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', () => { if (open) resize(); });
  function openFishing() {
    if (open) return;
    open = true;
    resize();
    $('daily').classList.add('hidden');
    root.classList.remove('hidden');
    $('fCoins').textContent = fmt(S.coins);
    holding = false; rings = []; bits = []; t = 0;
    idle();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function close() {
    if (!open) return;
    open = false; holding = false;
    cancelAnimationFrame(raf);
    root.classList.add('hidden');
    $('fSheet').classList.add('hidden');
    Meta.render();
  }
  $('fishBtn').onclick = () => { Meta.sfx('click'); openFishing(); };
  $('fClose').onclick = close;
  $('fTackle').onclick = () => { if (st === 'idle' || st === 'result' || st === 'lost') { Meta.sfx('click'); sheet(); } };
  $('fSheetClose').onclick = () => { $('fSheet').classList.add('hidden'); $('fCoins').textContent = fmt(S.coins); updateGear(); };

  // ---------- tackle box: gear shop, tuning and the journal ----------
  let sheetTab = 'shop', shopCat = 'rod';
  function sheet() {
    const tabs = $('fTabs');
    tabs.innerHTML = '';
    for (const [id, label] of [['shop', 'Shop'], ['tune', 'Tune-up'], ['tokens', '🎟️ Tokens'], ['journal', 'Journal']]) {
      const b = el('button', 'subtab' + (sheetTab === id ? ' active' : ''), label);
      b.onclick = () => { sheetTab = id; sheet(); };
      tabs.appendChild(b);
    }
    const body = $('fBody');
    body.innerHTML = '';
    ({ shop: renderShop, tune: renderTune, tokens: renderTokens, journal: renderJournal })[sheetTab](body);
    $('fSheet').classList.remove('hidden');
  }

  const swatch = (bg, glyph) => `<span class="sw" style="width:46px;height:46px;background:${bg};display:grid;place-items:center;font-size:24px">${glyph}</span>`;
  function gearIcon(cat, it, size = 46) {
    if (cat === 'rod') return `<img src="${toolImage('rod', size, it.col)}" width="${size}" height="${size}" alt="">`;
    if (cat === 'gag') return `<img src="${toolImage(it.id === 'std' ? 'rod' : it.id, size)}" width="${size}" height="${size}" alt="">`;
    if (cat === 'reel') return swatch(`radial-gradient(circle at 35% 30%, #fff8, ${it.col})`, '⚙️');
    return swatch(`linear-gradient(135deg, ${it.col}, #fff6)`, '🧵');
  }
  function statLine(cat, it) {
    if (cat === 'rod') return it.bar ? `Bar +${Math.round(it.bar / 0.2 * 100)}%` : 'Basic bar';
    if (cat === 'reel') return it.fill ? `Fill +${Math.round(it.fill / 0.19 * 100)}% · Drain −${Math.round(it.drain / 0.13 * 100)}%` : 'Basic reel';
    if (cat === 'line') return it.slow ? `Fish ${Math.round(it.slow * 100)}% slower · +${it.win}s bite` : 'Basic line';
    return it.id === 'std' ? 'No joke' : 'Cosmetic · just for laughs';
  }

  function renderShop(body) {
    const sub = el('div', 'subtabs');
    for (const cat of Object.keys(LISTS)) {
      const b = el('button', 'subtab' + (shopCat === cat ? ' active' : ''), CAT_NAME[cat]);
      b.onclick = () => { shopCat = cat; sheet(); };
      sub.appendChild(b);
    }
    body.appendChild(sub);
    body.appendChild(el('p', 'note', `Coins: ${fmt(S.coins)}`));
    const grid = el('div', 'grid');
    for (const it of LISTS[shopCat]) {
      const owned = F.own[shopCat].includes(it.id), on = F.eq[shopCat] === it.id;
      if (it.tokenCost && !owned) continue; // token-only tools show up here once you've bought them
      const locked = !owned && (it.lv || 0) > S.level;
      const label = on ? 'Equipped' : owned ? 'Equip' : locked ? `🔒 Lv ${it.lv}` : '● ' + fmt(it.cost);
      const b = el('button', 'item' + (on ? ' on' : '') + (locked ? ' locked' : ''),
        `${gearIcon(shopCat, it)}<b>${it.name}</b><span class="stat">${statLine(shopCat, it)}</span><small>${label}</small>`);
      b.disabled = locked;
      b.onclick = () => {
        if (owned) { F.eq[shopCat] = it.id; Meta.save(); updateGear(); sheet(); return; }
        Meta.confirmBuy({ name: it.name, desc: `${CAT_NAME[shopCat]} · ${statLine(shopCat, it)} · equips right away`, icon: gearIcon(shopCat, it, 72), price: it.cost }, () => {
          S.coins -= it.cost; F.own[shopCat].push(it.id); F.eq[shopCat] = it.id; Meta.save(); updateGear();
          Meta.toast(`Bought ${it.name}!`);
          sheet();
        });
      };
      grid.appendChild(b);
    }
    body.appendChild(grid);
    body.appendChild(el('p', 'note', shopCat === 'gag' ? 'Gag tools change the look and the jokes, not the stats. Your rod and reel still do the work.' : `${F.own[shopCat].length} / ${LISTS[shopCat].length} owned`));
  }

  // Token shop: fishing tokens (from fish and chests) buy boosts, vault charge and two joke tools you can't get with coins.
  function renderTokens(body) {
    body.appendChild(el('p', 'note', `Tokens: ${fmt(F.tokens)} · earned from fish (1-15 each) and chests (5)`));
    const buyTokens = (name, desc, icon, price, grant) => {
      const row = el('div', 'upg', `<span class="how-ico" style="--c:#fff1b3">${icon}</span><div><b>${name}</b><small>${desc}</small></div>`);
      const b = el('button', 'btn small', `🎟️ ${price}`);
      b.disabled = F.tokens < price;
      b.onclick = () => Meta.confirmBuy({ name, desc, icon: `<span class="emoji" style="font-size:52px;line-height:1.4;display:block">${icon}</span>`, price: 0, skippable: true }, () => {
        F.tokens -= price; grant(); Meta.save(); updateGear(); Meta.toast(`Bought ${name}!`); sheet();
      });
      b.addEventListener('click', () => { $('cfPrice').textContent = `🎟️ ${price} tokens`; $('cfPrice').classList.remove('short'); });
      row.appendChild(b);
      body.appendChild(row);
    };
    buyTokens('Golden Bait ×5', 'Your next 5 casts get better luck: rarer fish and more chests', '✨', 10, () => { F.boost.luck += 5; });
    buyTokens('Chum Bucket ×5', 'Your next 5 casts get bites twice as fast', '🪣', 8, () => { F.boost.chum += 5; });
    for (const g of GAGS.filter(x => x.tokenCost)) {
      if (F.own.gag.includes(g.id)) continue;
      buyTokens(g.name, 'Gag tool: just for laughs. Equip it in Shop > Gag tools', g.icon, g.tokenCost, () => { F.own.gag.push(g.id); F.eq.gag = g.id; });
    }
    if (GAGS.filter(x => x.tokenCost).every(x => F.own.gag.includes(x.id))) body.appendChild(el('p', 'note', 'You own every token-only tool.'));
  }

  function renderTune(body) {
    body.appendChild(el('p', 'note', `Coins: ${fmt(S.coins)}`));
    for (const k of Object.keys(UPS)) {
      const u = UPS[k], lvl = F.up[k], maxed = lvl >= UP_MAX, cost = upCost(k);
      const pips = Array.from({ length: UP_MAX }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const row = el('div', 'upg', `<span class="how-ico" style="--c:#e6f3f6">${u.icon}</span><div><b>${u.name}</b><small>${u.desc}</small><span class="pips">${pips}</span></div>`);
      const b = el('button', 'btn small', maxed ? 'MAX' : `● ${fmt(cost)}`);
      b.disabled = maxed;
      b.onclick = () => Meta.confirmBuy({ name: `${u.name} Lv ${lvl + 1}`, desc: u.desc, icon: `<span class="emoji" style="font-size:44px">${u.icon}</span>`, price: cost }, () => {
        S.coins -= cost; F.up[k]++; Meta.save();
        Meta.toast(`${u.name} is now level ${F.up[k]}!`);
        sheet();
      });
      row.appendChild(b);
      body.appendChild(row);
    }
  }

  function renderJournal(body) {
    const rate = F.casts ? Math.round(F.catches / F.casts * 100) : 0;
    const cards = [['Casts', fmt(F.casts)], ['Catches', fmt(F.catches)], ['Catch rate', `${rate}%`], ['Perfect catches', fmt(F.perfects)],
      ['Best perfect streak', `×${F.bestStreak}`], ['Chests opened', fmt(F.chests)]];
    const stats = el('div', 'stats');
    for (const [k, v] of cards) stats.appendChild(el('div', '', `<small>${k}</small><b>${v}</b>`));
    body.appendChild(stats);

    body.appendChild(el('p', 'chart-title', `Tackle box · ${Object.keys(F.junk).length} / ${JUNK.length} junk found`));
    const junk = el('div', 'junk');
    for (const j of JUNK) {
      const n = F.junk[j.id] || 0;
      junk.appendChild(el('div', n ? '' : 'unknown', `<span class="emoji-big">${n ? j.e : '❔'}</span><b>${n ? j.name : '???'}</b>${n ? `<small>×${n}</small>` : ''}`));
    }
    body.appendChild(junk);

    const fishHats = hats.filter(h => h.fish);
    body.appendChild(el('p', 'chart-title', `Fishing-only hats · ${fishHats.filter(h => S.owned.hat.includes(h.id)).length} / ${fishHats.length}`));
    const grid = el('div', 'grid');
    for (const h of fishHats) {
      const owned = S.owned.hat.includes(h.id);
      grid.appendChild(el('div', 'item' + (owned ? ' on' : ' locked'), `${Meta.iconHtml('hat', h)}<b>${owned ? h.name : '???'}</b><small>${owned ? 'Owned' : '🎣 ' + h.fish}</small>`));
    }
    body.appendChild(grid);
    body.appendChild(el('p', 'note', 'Equip hats in Store → Hats. Chests have a 45% chance to hold one.'));
  }

  // ---------- test hooks: #fish opens the minigame; #fishreel jumps into a reel; #fishshop opens the shop;
  // #fishwin lands a random item; #fishchest lands a chest ----------
  const hook = location.hash.slice(1);
  if (hook === 'fishgag') shopCat = 'gag';
  if (['fishgag', 'fish', 'fishreel', 'fishwin', 'fishchest', 'fishshop', 'fishbite'].includes(hook)) {
    $('daily').classList.add('hidden');
    openFishing();
    if (hook === 'fishreel') setTimeout(() => { item = rollItem(); startReel(); }, 300);
    if (hook === 'fishbite') setTimeout(() => { go('wait', ''); stT = -0.0001; }, 300);
    if (hook === 'fishshop' || hook === 'fishgag') setTimeout(sheet, 300);
    if (hook === 'fishwin' || hook === 'fishchest') setTimeout(() => { item = hook === 'fishchest' ? { type: 'chest', diff: 0.5 } : rollItem(); perfect = true; land(); }, 300);
  }
})();
