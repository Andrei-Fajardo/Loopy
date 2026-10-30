/* "My collection": a living scene for each skin.
   Pond and Pasture: every fish / sheep you've collected roams around. Tap one to name it and put one of your hats on it; tap
   elsewhere to drop a treat and watch them come running. Feeding everyone gives a small daily bonus.
   Playroom: a trophy room, every toy ball on a lit pedestal (uncollected ones are dark silhouettes). Tap one to name and dress it.
   Basket toss (menu button, Meta.pages.tossRound): a timed round in a bouncy house where the player flicks a ball into a basket, like
   Paper Toss (physics in toss.js; the scene is drawn here and shares the naming and hats).
   Names go through Meta.checkName (namefilter.js). Names and hats are saved per species: S.home.names[skin][id], S.home.hats[skin][id].
   Needs meta.js, water.js, game.js (Sfx, PENTA), namefilter.js and toss.js. Registers Meta.pages.home. */
(() => {
  const { S, el, fmt } = Meta;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const today = new Date().toISOString().slice(0, 10);
  S.home = { fedDay: '', fedToday: 0, ...S.home };
  S.home.names = { fish: {}, sheep: {}, balls: {}, ...S.home.names };
  S.home.hats = { fish: {}, sheep: {}, balls: {}, ...S.home.hats };
  S.home.toss = { best: 0, goals: 0, ...S.home.toss };
  if (S.home.fedDay !== today) { S.home.fedDay = today; S.home.fedToday = 0; S.home.paid = false; S.home.tossCoins = 0; }
  S.home.tossCoins = S.home.tossCoins || 0;
  for (const sk of ['fish', 'sheep', 'balls']) for (const id of Object.keys(S.home.names[sk])) if (!Meta.checkName(S.home.names[sk][id]).ok) delete S.home.names[sk][id]; // the list may have grown since it was saved

  const imgs = {};
  const img = url => imgs[url] || (imgs[url] = Object.assign(new Image(), { src: url }));
  const PH = [0, 3.14, 6.28, 9.42];
  let gameMode = false; // true while the Basket toss round is on screen (opened from the menu); the Playroom tab itself is the trophy room
  let homeSkin = null, ents = [], sig = '', treats = [], hearts = [], raf = 0, clock = 0;
  // Feeding: you have a small supply of food that refills over time. Food really falls (a shrimp into the water, pellets onto the grass),
  // splashes or bounces, and `fx` holds the ripples, droplets and dust that come from it.
  const FEED_MAX = 6;
  let fx = [], feed = { n: FEED_MAX, t: 0 };
  const ownedSkins = () => ['fish', ...['sheep', 'balls'].filter(sk => S.skinsOwned.includes(sk))];
  const albumOf = sk => (sk === 'fish' ? S.album : S.albums[sk]);
  const nameOf = (sk, id) => S.home.names[sk][id] || '';
  const hatOf = (sk, id) => S.home.hats[sk][id] || null;
  const speciesIds = sk => { const list = Meta.speciesOf(sk); return Object.keys(albumOf(sk)).map(Number).filter(i => list[i]).slice(0, 64); };

  // one picture of an animal or ball, wearing its placed hat
  function pic(sk, sp, size, hat, phase) {
    if (sk === 'fish') return Meta.fishImage({ color: sp.color, species: sp.id }, size, hat);
    return Meta.skinImage(sk, { color: sp.color, species: sp.id, phase }, size, hat);
  }
  function sprites(e, sk) {
    const hat = e.id >= 0 ? hatOf(sk, e.id) : null;
    if (sk === 'fish') e.im = [img(Meta.fishImage({ color: e.color, species: e.id }, 128, hat))]; // drawn about 92 px: fish used to be 52 px (a ~31 px body), far smaller than the 78 px sheep
    else if (sk === 'sheep') e.im = PH.map(p => img(Meta.skinImage('sheep', { color: e.color, species: e.id, phase: p }, 96, hat)));
    else e.im = [img(Meta.skinImage('balls', { color: e.color, species: e.id }, 56, hat))];
  }
  function build(sk, W, H) {
    if (sk === 'balls') { buildTrophy(); return; }
    const list = Meta.speciesOf(sk), ids = speciesIds(sk);
    const specs = ids.length ? ids.map(id => ({ id, color: list[id].color, sp: list[id] })) : [0, 1, 2, 3].map(c => ({ id: -1, color: c, sp: null }));
    ents = specs.map(s => {
      const e = { id: s.id, sp: s.sp, color: s.color, sk, x: rand(40, W - 40), y: sk === 'sheep' ? H * rand(0.6, 0.86) : rand(60, H - 60),
        a: rand(0, 6.28), v: sk === 'sheep' ? rand(22, 42) : rand(34, 62), dir: Math.random() < 0.5 ? -1 : 1, ph: rand(0, 6), pause: 0, size: sk === 'sheep' ? 78 : clamp(Math.min(W, H) * 0.16, 58, 76) }; // fish scale with the screen: ~62 px on a phone, up to 76 on a big window (52 was too far, 74-96 too close)
      sprites(e, sk);
      return e;
    });
    sig = sk + ids.join(',');
  }

  // ---------- Pond and Pasture ----------
  const panOf = x => clamp((x / W - 0.5) * 1.3, -0.65, 0.65);
  function ripple(x, y, mr, delay = 0, life = 1.0) { fx.push({ t: 'ring', x, y, r: 2, mr, life, max: life, delay }); }
  function dustPuff(x, y, n) { for (let i = 0; i < n; i++) fx.push({ t: 'dust', x: x + rand(-4, 4), y: y + rand(-2, 2), vx: rand(-26, 26), vy: rand(-16, -2), r: rand(2, 4), life: 0.55, max: 0.55 }); }
  function splashAt(x, y) { // rings spreading in turn, droplets thrown up, and the sound
    ripple(x, y, 50, 0, 1.2); ripple(x, y, 34, 0.1, 1.0); ripple(x, y, 20, 0.2, 0.9);
    for (let i = 0; i < 8; i++) fx.push({ t: 'drop', x, y, z: 2, vx: rand(-46, 46), vy: rand(-26, 26), vz: rand(120, 230), life: 1.2, max: 1.2 });
    Meta.Music?.splash(panOf(x));
  }
  function dropFood(x, y) {
    if (sk === 'fish') treats.push({ kind: 'shrimp', x, y, z: 150, vz: 0, rot: rand(-0.6, 0.6), spin: rand(-3.5, 3.5), landed: false, life: 8, bounce: 0, delay: 0, age: 0 });
    else for (let k = 0; k < 3; k++) { // a little handful of pellets, thrown a little apart
      treats.push({ kind: 'pellet', x: clamp(x + rand(-28, 28), 30, W - 30), y: clamp(y + rand(-20, 20), H * 0.52, H * 0.9), z: 130 + k * 22, vz: 0, rot: rand(0, 6.28), spin: rand(-6, 6), landed: false, life: 9, bounce: 0, delay: k * 0.09, age: 0 });
    }
  }
  function updateFood(dt) {
    for (const t of treats) {
      if (t.delay > 0) { t.delay -= dt; continue; }
      if (!t.landed) {
        t.vz -= 760 * dt; t.z += t.vz * dt; t.rot += t.spin * dt;
        if (t.z <= 0) {
          if (t.kind === 'shrimp') { t.z = 0; t.landed = true; t.age = 0; splashAt(t.x, t.y); }
          else if (t.vz < -150 && t.bounce < 2) { t.vz = -t.vz * 0.36; t.z = 0.01; t.bounce++; t.spin *= 0.5; dustPuff(t.x, t.y, 3); Meta.Music?.pelletTick(panOf(t.x), t.bounce - 1); }
          else { t.z = 0; t.landed = true; t.age = 0; dustPuff(t.x, t.y, 2); Meta.Music?.pelletTick(panOf(t.x), 2); }
        }
      } else {
        t.age += dt; t.life -= dt;
        if (t.kind === 'shrimp' && (t.rip = (t.rip ?? 0.9) - dt) <= 0) { t.rip = rand(1.3, 1.9); ripple(t.x, t.y, 15, 0, 0.9); } // it keeps making small ripples while it floats
      }
    }
    treats = treats.filter(t => t.life > 0);
    const spawned = [];
    for (const p of fx) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.t === 'ring') p.r += (p.mr - p.r) * Math.min(1, dt * 3.2);
      else if (p.t === 'drop') { p.vz -= 520 * dt; p.z += p.vz * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.z <= 0 && p.life > 0) { p.life = 0; spawned.push({ t: 'ring', x: p.x, y: p.y, r: 1, mr: 8, life: 0.5, max: 0.5, delay: 0 }); } }
      else if (p.t === 'dust') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; p.r += dt * 14; }
    }
    fx = fx.filter(p => p.life > 0 || p.delay > 0); fx.push(...spawned);
    if (fx.length > 160) fx.splice(0, fx.length - 160);
  }
  function update(dt, W, H, sk) {
    clock += dt;
    if (sk === 'balls') return;
    if (feed.n < FEED_MAX && (feed.t += dt) >= 1.1) { feed.t = 0; feed.n++; feedHud(); } // the food supply refills
    updateFood(dt);
    for (const e of ents) {
      e.ph += dt * 6;
      if (e.turnT > 0) e.turnT -= dt;
      // the closest bit of food that has landed (and is within reach) pulls the animal toward it
      let tr = null, td = 300;
      for (const t of treats) { if (!t.landed) continue; const d = Math.hypot(t.x - e.x, t.y - e.y); if (d < td) { td = d; tr = t; } }
      if (sk === 'fish') {
        if (tr) { const want = Math.atan2(tr.y - e.y, tr.x - e.x); e.a += Math.atan2(Math.sin(want - e.a), Math.cos(want - e.a)) * Math.min(1, dt * 4); }
        else e.a += (Math.random() - 0.5) * dt * 2.4;
        const s = e.v * (tr ? 2.2 : 1);
        e.x += Math.cos(e.a) * s * dt; e.y += Math.sin(e.a) * s * dt;
        const m = 48;
        if (e.x < m || e.x > W - m || e.y < m || e.y > H - m) { const c = Math.atan2(H / 2 - e.y, W / 2 - e.x); e.a += Math.atan2(Math.sin(c - e.a), Math.cos(c - e.a)) * Math.min(1, dt * 5); }
        e.x = clamp(e.x, 6, W - 6); e.y = clamp(e.y, 6, H - 6);
      } else {
        if (e.chew > 0) e.chew -= dt; // chewing: it stands still and bobs (see draw)
        else if (tr) {
          // Walk straight to the food and stop on it. The old version re-chose its facing every frame, so a sheep that reached the food
          // flipped left and right dozens of times a second (ghost images). Now it turns at most every 0.4 s, never when it is nearly on top
          // of the food, and each step is capped so it cannot overshoot.
          const dx = tr.x - e.x, dy = tr.y - e.y, step = e.v * 2 * dt;
          if (Math.abs(dx) > 22 && !(e.turnT > 0)) { const want = dx > 0 ? 1 : -1; if (want !== e.dir) { e.dir = want; e.turnT = 0.4; } }
          e.x += clamp(dx, -step, step); e.y += clamp(dy, -step * 0.8, step * 0.8); e.pause = 0;
        } else if (e.pause > 0) e.pause -= dt;
        else {
          e.x += e.dir * e.v * dt;
          if (Math.random() < dt * 0.25) e.pause = rand(0.8, 2.2);
          if (Math.random() < dt * 0.15) e.dir *= -1;
        }
        if (e.x < 40) { e.x = 40; e.dir = 1; } if (e.x > W - 40) { e.x = W - 40; e.dir = -1; }
        e.y = clamp(e.y, H * 0.5, H * 0.9);
      }
      if (tr && !(e.chew > 0) && Math.hypot(tr.x - e.x, tr.y - e.y) < (sk === 'fish' ? e.size * 0.37 : 26)) { // got it
        tr.life = 0; tr.eaten = true;
        if (sk === 'fish') { ripple(tr.x, tr.y, 22, 0, 0.7); Meta.Music?.nibble(panOf(e.x)); }
        else { dustPuff(tr.x, tr.y, 2); Meta.Music?.munch(panOf(e.x)); e.chew = 0.55; }
        for (let k = 0; k < 3; k++) hearts.push({ x: e.x + rand(-12, 12), y: e.y - 14, life: 1.1, vy: rand(-50, -30), t: '❤️' });
        Meta.Music?.chime(2 + (Math.random() * 4 | 0), 0.035);
        fed();
      }
    }
  }
  function fed() {
    S.home.fedToday++; feedHud();
    if (S.home.fedToday >= 5 && !S.home.paid) { // a small daily thank-you for looking after everyone
      S.home.paid = true; S.coins += 15; S.stats.coinsEarned += 15; Meta.vaultCharge?.(5); Meta.save();
      Meta.toast('🍤 Everyone is full and happy! +15 coins'); Meta.sfx('chest');
    }
  }



  // ---------- shared scene helpers ----------
  const hh = n => { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); };
  const rrect = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
  const mix = (a, b, k) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16), f = (i) => Math.round(((A >> i) & 255) * (1 - k) + ((B >> i) & 255) * k); return `rgb(${f(16)},${f(8)},${f(0)})`; };
  const hex = c => { // rgb(...) back to #rrggbb so mix() can chain
    const m = /(\d+),(\d+),(\d+)/.exec(c); return m ? '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('') : c;
  };
  const mixh = (a, b, k) => hex(mix(a, b, k));

  // ---------- Pasture: a layered countryside in the spirit of the fishing scene ----------
  const SKY = { Meadow: ['#6fc4ef', '#dff4fb'], 'Sunset Hill': ['#f08a5d', '#ffe2a8'], 'Autumn Farm': ['#8fc1e6', '#f7e6c4'], 'Snowy Field': ['#bcd6e6', '#f6fbfe'], 'Moonlit Farm': ['#0b1630', '#2c4a72'] };
  function hill(g, y0, amp, f, ph, fill) {
    g.fillStyle = fill; g.beginPath(); g.moveTo(0, y0 + amp * 3);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.3 + ph * 2) * amp * 0.35);
    g.lineTo(W, y0 + amp * 3); g.closePath(); g.fill();
  }
  function drawPasture(g, t) {
    const th = Meta.skinTheme('sheep'), night = th.decor === 'fireflies', sky = SKY[th.name] || SKY.Meadow, HZ = H * 0.36;
    const grd = g.createLinearGradient(0, 0, 0, HZ); grd.addColorStop(0, sky[0]); grd.addColorStop(1, sky[1]); g.fillStyle = grd; g.fillRect(0, 0, W, HZ + 2);
    const sx = W * 0.78, sy = HZ * 0.42;
    if (night) {
      g.fillStyle = '#fff'; for (let i = 0; i < 46; i++) { g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + i)); g.fillRect(hh(i) * W, hh(i + 50) * HZ * 0.9, 1.6, 1.6); } g.globalAlpha = 1;
      const mg = g.createRadialGradient(sx, sy, 4, sx, sy, 110); mg.addColorStop(0, 'rgba(255,248,210,.9)'); mg.addColorStop(0.25, 'rgba(255,248,210,.35)'); mg.addColorStop(1, 'rgba(255,248,210,0)'); g.fillStyle = mg; g.fillRect(sx - 120, sy - 120, 240, 240);
      g.fillStyle = '#fffbe6'; g.beginPath(); g.arc(sx, sy, 20, 0, 6.28); g.fill(); g.fillStyle = 'rgba(180,170,140,.35)'; for (const [dx, dy, r] of [[-6, -4, 5], [6, 5, 4]]) { g.beginPath(); g.arc(sx + dx, sy + dy, r, 0, 6.28); g.fill(); }
    } else {
      const sun = g.createRadialGradient(sx, sy, 4, sx, sy, 100); sun.addColorStop(0, 'rgba(255,248,200,1)'); sun.addColorStop(0.2, 'rgba(255,240,170,.8)'); sun.addColorStop(1, 'rgba(255,240,170,0)');
      g.fillStyle = sun; g.fillRect(sx - 110, sy - 110, 220, 220); g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(sx, sy, 20, 0, 6.28); g.fill();
    }
    g.fillStyle = night ? 'rgba(160,185,230,.28)' : 'rgba(255,255,255,.88)'; // drifting clouds
    for (let i = 0; i < 4; i++) {
      const cx = ((t * (4 + i * 2.2) + i * 190) % (W + 280)) - 140, cy = HZ * (0.14 + i * 0.17), k = 0.8 + (i % 2) * 0.35;
      for (const [dx, dy, r] of [[0, 0, 20], [22, 6, 16], [-22, 8, 14], [8, -10, 15]]) { g.beginPath(); g.arc(cx + dx * k, cy + dy * k, r * k, 0, 6.28); g.fill(); }
    }
    // hills, far to near, the far ones fading into the sky like the fishing scene's mist
    const far = mixh(th.sky[1], sky[1], 0.6), mid = mixh(th.sky[1], sky[1], 0.3);
    hill(g, HZ - 6, 18, 0.011, 1, far);
    // a windmill on the far hill
    { const wx = W * 0.2, wy = HZ - 16; g.fillStyle = night ? '#2a3550' : '#e9e2d0'; g.beginPath(); g.moveTo(wx - 7, wy + 18); g.lineTo(wx - 4, wy - 8); g.lineTo(wx + 4, wy - 8); g.lineTo(wx + 7, wy + 18); g.closePath(); g.fill();
      g.save(); g.translate(wx, wy - 9); g.rotate(t * 0.7); g.strokeStyle = night ? '#3a4668' : '#b5a98c'; g.lineWidth = 2.4; g.lineCap = 'round'; for (let b = 0; b < 4; b++) { g.rotate(1.5708); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -19); g.stroke(); } g.restore(); }
    hill(g, HZ + 4, 14, 0.017, 3, mid);
    // the barn and a few round trees on the near hill
    { const bx = W * 0.7, by = HZ - 4, bw = 46, bh = 26; g.fillStyle = night ? '#3a2430' : '#c8473a'; g.fillRect(bx - bw / 2, by - bh, bw, bh);
      g.fillStyle = night ? '#2a1a24' : '#8f2d28'; g.beginPath(); g.moveTo(bx - bw / 2 - 4, by - bh); g.lineTo(bx, by - bh - 20); g.lineTo(bx + bw / 2 + 4, by - bh); g.closePath(); g.fill();
      g.strokeStyle = night ? '#6b4a52' : '#f4ead2'; g.lineWidth = 2; g.strokeRect(bx - 9, by - 16, 18, 16); g.beginPath(); g.moveTo(bx - 9, by - 16); g.lineTo(bx + 9, by); g.moveTo(bx + 9, by - 16); g.lineTo(bx - 9, by); g.stroke();
      if (night) { g.fillStyle = '#ffd98a'; g.fillRect(bx - 3, by - bh - 8, 6, 6); } }
    for (const [fx, r] of [[0.05, 15], [0.38, 12], [0.47, 17], [0.9, 14], [0.96, 11]]) {
      const tx = W * fx, ty = HZ - 2; g.fillStyle = night ? '#1b2a3a' : '#7a5230'; g.fillRect(tx - 2, ty - 8, 4, 12);
      g.fillStyle = th.decor === 'leaves' ? '#d9822b' : th.decor === 'snow' ? '#dff0f2' : night ? '#1f4033' : mixh(th.sky[1], '#2f7a45', 0.5); g.beginPath(); g.arc(tx, ty - 14, r, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(tx - r * 0.3, ty - 14 - r * 0.3, r * 0.5, 0, 6.28); g.fill();
    }
    // the field, with mown stripes in perspective
    const fg = g.createLinearGradient(0, HZ, 0, H); fg.addColorStop(0, th.sky[0]); fg.addColorStop(1, th.sky[1]); g.fillStyle = fg; g.fillRect(0, HZ + 4, W, H - HZ);
    for (let i = 0; i < 10; i += 2) { const y0 = HZ + (H - HZ) * Math.pow(i / 10, 1.7), y1 = HZ + (H - HZ) * Math.pow((i + 1) / 10, 1.7); g.fillStyle = night ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.08)'; g.fillRect(0, y0, W, y1 - y0); }
    const mist = g.createLinearGradient(0, HZ, 0, HZ + (H - HZ) * 0.25); mist.addColorStop(0, night ? 'rgba(120,150,200,.25)' : 'rgba(235,250,235,.45)'); mist.addColorStop(1, 'rgba(235,250,235,0)'); g.fillStyle = mist; g.fillRect(0, HZ, W, (H - HZ) * 0.25);
    // a small back fence along the horizon
    g.strokeStyle = th.fence[1]; g.fillStyle = th.fence[0]; g.lineWidth = 2;
    for (let x = 4; x < W; x += 24) g.fillRect(x, HZ + 2, 4, 14);
    g.beginPath(); g.moveTo(0, HZ + 6); g.lineTo(W, HZ + 6); g.moveTo(0, HZ + 12); g.lineTo(W, HZ + 12); g.stroke();
    // cloud shadows rolling over the grass
    if (!night) for (let i = 0; i < 3; i++) { const cx = ((t * 9 + i * 240) % (W + 400)) - 200, cy = HZ + (H - HZ) * (0.3 + i * 0.28); g.fillStyle = 'rgba(15,60,25,.08)'; g.beginPath(); g.ellipse(cx, cy, 120, 34, 0, 0, 6.28); g.fill(); }
    // swaying tufts, flowers and decor, bigger toward the viewer
    for (let i = 0; i < 80; i++) {
      const z = Math.pow(hh(i + 7), 1.3), x = hh(i) * W, y = HZ + 14 + z * (H - HZ - 20), k = 0.5 + z * 1.3, sw = Math.sin(t * 1.5 + i) * 2.5 * k;
      g.strokeStyle = th.tuft; g.lineWidth = 1.6 * k; g.lineCap = 'round';
      for (const d of [-3, 0, 3]) { g.beginPath(); g.moveTo(x + d * k, y); g.quadraticCurveTo(x + d * k + sw * 0.5, y - 5 * k, x + d * k + sw, y - 9 * k); g.stroke(); }
      if (th.decor === 'flowers' && i % 5 === 0) { g.fillStyle = ['#fff', '#ffd84d', '#ff8fb8', '#c9a0ff'][i % 4]; g.beginPath(); g.arc(x + 7 * k, y - 3 * k, 2.4 * k, 0, 6.28); g.fill(); g.fillStyle = '#ffb703'; g.beginPath(); g.arc(x + 7 * k, y - 3 * k, 0.9 * k, 0, 6.28); g.fill(); }
    }
    if (th.decor === 'flowers') for (let i = 0; i < 2; i++) { // butterflies
      const bx = (W * (0.2 + i * 0.5) + Math.sin(t * 0.7 + i * 3) * 80 + W) % W, by = H * (0.5 + i * 0.15) + Math.sin(t * 1.9 + i) * 24, fl = Math.abs(Math.sin(t * 14 + i)) * 5 + 1.5;
      g.fillStyle = i ? '#ffd84d' : '#ff8fb8'; g.beginPath(); g.ellipse(bx - 3, by, fl, 5, -0.5, 0, 6.28); g.ellipse(bx + 3, by, fl, 5, 0.5, 0, 6.28); g.fill();
    }
    if (th.decor === 'leaves' || th.decor === 'snow') for (let i = 0; i < 26; i++) {
      const x = (hh(i) * W + t * (10 + i % 4 * 4) + Math.sin(t + i) * 20 + W) % W, y = (hh(i + 9) * H + t * (24 + i % 5 * 8)) % H;
      if (th.decor === 'snow') { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x, y, 1.6 + i % 3 * 0.7, 0, 6.28); g.fill(); }
      else { g.save(); g.translate(x, y); g.rotate(t * 2 + i); g.fillStyle = ['#d9822b', '#c8473a', '#e8b83a'][i % 3]; g.beginPath(); g.ellipse(0, 0, 5, 2.6, 0, 0, 6.28); g.fill(); g.restore(); }
    }
    if (night) for (let i = 0; i < 22; i++) {
      const x = (hh(i) * W + Math.sin(t * 0.6 + i) * 30 + W) % W, y = HZ + 20 + (hh(i + 3) * (H - HZ - 40)) + Math.sin(t * 0.9 + i * 2) * 12, a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 1.8 + i * 1.7));
      const fg2 = g.createRadialGradient(x, y, 0, x, y, 12); fg2.addColorStop(0, `rgba(230,255,150,${a})`); fg2.addColorStop(1, 'rgba(230,255,150,0)'); g.fillStyle = fg2; g.fillRect(x - 12, y - 12, 24, 24);
    }
    const vg = g.createLinearGradient(0, H * 0.78, 0, H); vg.addColorStop(0, 'rgba(10,40,20,0)'); vg.addColorStop(1, night ? 'rgba(0,10,20,.5)' : 'rgba(10,40,20,.3)'); g.fillStyle = vg; g.fillRect(0, H * 0.78, W, H * 0.22);
  }

  // ---------- Playroom: the trophy room ----------
  function buildTrophy() {
    const list = Meta.speciesOf('balls'), owned = albumOf('balls');
    ents = Meta.byRarity(list).map(sp => { const e = { id: sp.id, sp, color: sp.color, sk: 'balls', have: !!owned[sp.id], count: owned[sp.id] || 0, x: 0, y: 0, size: 60, ph: rand(0, 6) }; sprites(e, 'balls'); return e; });
    sig = sigOf('balls'); layoutTrophy();
  }
  let trophy = { cell: 90, shelfY: [], rh: 100 };
  function layoutTrophy() {
    const n = ents.length, top = 150, availH = H - top - 16;
    let c = Math.min(120, W / 3), cols = 3, rows = 1;
    for (; c > 40; c -= 2) { cols = Math.floor(W / c); rows = Math.ceil(n / cols); if (rows * c * 1.2 <= availH) break; }
    const x0 = (W - cols * c) / 2 + c / 2, rh = c * 1.2;
    trophy = { cell: c, shelfY: [], rh };
    // one row, top to bottom: the lamp (0-.145c), the ball (.217c-.77c), its pedestal, the shelf (at .864c) and the nameplate below it (to 1.2c)
    for (let r = 0; r < rows; r++) trophy.shelfY.push(top + r * rh + c * 0.864);
    ents.forEach((e, i) => { const row = Math.floor(i / cols); e.x = x0 + (i % cols) * c; e.y = top + row * rh + c * 0.4136; e.size = c * 0.452; e.sy = trophy.shelfY[row]; });
  }
  function drawTrophy(g) {
    const t = clock, c = trophy.cell, rh = trophy.rh;
    // the wall: deep plum with a faint damask and a warm lamp glow from above
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#5a2a68'); bg.addColorStop(1, '#1f0e2f'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.045)';
    for (let y = 134, j = 0; y < H + 30; y += 38, j++) for (let x = (j % 2) * 24; x < W + 30; x += 48) { g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 7, y); g.lineTo(x, y + 9); g.lineTo(x - 7, y); g.closePath(); g.fill(); }
    const lamp = g.createRadialGradient(W / 2, 90, 10, W / 2, 90, H * 0.85); lamp.addColorStop(0, 'rgba(255,214,150,.3)'); lamp.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = lamp; g.fillRect(0, 0, W, H);
    // crown moulding
    const mo = g.createLinearGradient(0, 112, 0, 130); mo.addColorStop(0, '#d9a35f'); mo.addColorStop(0.5, '#8a5a2b'); mo.addColorStop(1, '#5a3818'); g.fillStyle = mo; g.fillRect(0, 112, W, 18);
    g.fillStyle = 'rgba(255,235,190,.45)'; g.fillRect(0, 112, W, 2); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 130, W, 5);
    // light beams, added on top of the wall
    // Each ball has a small brass spotlight hanging over it from the shelf above (or the moulding), and the beam comes from that lamp's lens.
    const lampOf = e => { const lw = c * 0.22, top = e.sy - c * 0.864, ly = top + c * 0.02, lens = ly + lw * 0.55; return { lw, top, ly, lens, rail: e.sy === trophy.shelfY[0] ? 135 : e.sy - rh + 11 }; };
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const e of ents) if (e.have) {
      const legend = e.sp.rar === 'L', L = lampOf(e), bg2 = g.createLinearGradient(0, L.lens, 0, e.sy), tw = L.lw * 0.4;
      bg2.addColorStop(0, legend ? 'rgba(255,225,140,.36)' : 'rgba(255,245,225,.22)'); bg2.addColorStop(1, 'rgba(255,245,225,0)');
      g.fillStyle = bg2; g.beginPath(); g.moveTo(e.x - tw, L.lens); g.lineTo(e.x + tw, L.lens); g.lineTo(e.x + c * 0.5, e.sy); g.lineTo(e.x - c * 0.5, e.sy); g.closePath(); g.fill();
      const pool = g.createRadialGradient(e.x, e.sy, 1, e.x, e.sy, c * 0.5); pool.addColorStop(0, legend ? 'rgba(255,230,150,.28)' : 'rgba(255,245,225,.18)'); pool.addColorStop(1, 'rgba(255,245,225,0)');
      g.fillStyle = pool; g.beginPath(); g.ellipse(e.x, e.sy, c * 0.5, 7, 0, 0, 6.28); g.fill(); // where the light lands on the shelf
    }
    g.restore();
    for (const e of ents) { // the lamps themselves
      const L = lampOf(e), lit = e.have;
      g.strokeStyle = '#2d2014'; g.lineWidth = 2; g.beginPath(); g.moveTo(e.x, L.rail); g.lineTo(e.x, L.ly); g.stroke(); // the hanging rod
      g.fillStyle = '#5a3d14'; g.fillRect(e.x - 3, L.rail, 6, 3);
      const hg = g.createLinearGradient(e.x - L.lw / 2, 0, e.x + L.lw / 2, 0); hg.addColorStop(0, '#7a5a1e'); hg.addColorStop(0.4, '#f0cf78'); hg.addColorStop(1, '#6b4c14');
      g.fillStyle = hg; g.beginPath(); g.moveTo(e.x - L.lw * 0.2, L.ly); g.lineTo(e.x + L.lw * 0.2, L.ly); g.lineTo(e.x + L.lw * 0.5, L.lens); g.lineTo(e.x - L.lw * 0.5, L.lens); g.closePath(); g.fill();
      g.fillStyle = lit ? '#fffbe0' : '#2b2133'; g.beginPath(); g.ellipse(e.x, L.lens, L.lw * 0.46, L.lw * 0.13, 0, 0, 6.28); g.fill();
      if (lit) { const gl = g.createRadialGradient(e.x, L.lens, 0, e.x, L.lens, L.lw * 1.3); gl.addColorStop(0, 'rgba(255,240,180,.75)'); gl.addColorStop(1, 'rgba(255,240,180,0)'); g.fillStyle = gl; g.fillRect(e.x - L.lw * 1.4, L.lens - L.lw * 1.3, L.lw * 2.8, L.lw * 2.6); }
    }
    // wooden shelves with a lip, grain, a shadow on the wall and brackets
    for (const sy of trophy.shelfY) {
      const sh = g.createLinearGradient(0, sy + 11, 0, sy + 40); sh.addColorStop(0, 'rgba(0,0,0,.4)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(0, sy + 11, W, 29);
      const wd = g.createLinearGradient(0, sy, 0, sy + 11); wd.addColorStop(0, '#d9a35f'); wd.addColorStop(0.3, '#b07a3e'); wd.addColorStop(1, '#6b4220'); g.fillStyle = wd; g.fillRect(0, sy, W, 11);
      g.strokeStyle = 'rgba(60,30,10,.25)'; g.lineWidth = 1; for (let x = 0; x < W; x += 37) { g.beginPath(); g.moveTo(x, sy + 3 + hh(x) * 5); g.lineTo(x + 20, sy + 3 + hh(x + 1) * 5); g.stroke(); }
      g.fillStyle = 'rgba(255,235,190,.5)'; g.fillRect(0, sy, W, 2);
      g.fillStyle = '#5a3818'; for (const bx of [W * 0.06, W * 0.94]) { g.beginPath(); g.moveTo(bx - 8, sy + 11); g.lineTo(bx + 8, sy + 11); g.lineTo(bx, sy + 26); g.closePath(); g.fill(); }
    }
    // dust floating in the light
    for (let i = 0; i < 36; i++) { const x = (hh(i) * W + t * (2 + i % 4) + Math.sin(t * 0.5 + i) * 10) % W, y = 140 + ((hh(i + 20) * (H - 150) - t * (5 + i % 5 * 2)) % (H - 150) + (H - 150)) % (H - 150); g.fillStyle = `rgba(255,236,190,${0.12 + 0.16 * Math.abs(Math.sin(t + i))})`; g.beginPath(); g.arc(x, y, 0.9 + (i % 3) * 0.5, 0, 6.28); g.fill(); }
    for (const e of ents) {
      const have = e.have, legend = e.sp.rar === 'L', bob = have ? Math.sin(t * 1.6 + e.ph) * 2 : 0, s = e.size, rar = Meta.RARITY[e.sp.rar];
      const py = e.y + s * 0.68, ph = Math.max(6, e.sy - py);
      // soft contact shadow on the shelf
      g.fillStyle = 'rgba(0,0,0,.32)'; g.beginPath(); g.ellipse(e.x + 2, e.sy + 2, s * 0.52, s * 0.09, 0, 0, 6.28); g.fill();
      // the pedestal: a little gold drum with a shiny top
      const pg = g.createLinearGradient(e.x - s * 0.36, 0, e.x + s * 0.36, 0);
      if (have) { pg.addColorStop(0, '#9a6d1e'); pg.addColorStop(0.35, '#f6d26b'); pg.addColorStop(0.55, '#d9a63f'); pg.addColorStop(1, '#7a5214'); } else { pg.addColorStop(0, '#2a1f35'); pg.addColorStop(0.4, '#5d4a6c'); pg.addColorStop(1, '#241a2e'); }
      g.fillStyle = pg; g.fillRect(e.x - s * 0.36, py, s * 0.72, ph);
      g.beginPath(); g.ellipse(e.x, e.sy, s * 0.36, s * 0.07, 0, 0, Math.PI); g.fill();
      g.fillStyle = have ? '#fbe9a6' : '#6d5a7d'; g.beginPath(); g.ellipse(e.x, py, s * 0.36, s * 0.08, 0, 0, 6.28); g.fill();
      if (have) { // a glow in the rarity color behind the ball
        const gl = g.createRadialGradient(e.x, e.y + s * 0.18, s * 0.2, e.x, e.y + s * 0.18, s * (legend ? 1.15 : 0.95)); gl.addColorStop(0, rar.c + (legend ? '88' : '44')); gl.addColorStop(1, rar.c + '00'); g.fillStyle = gl; g.fillRect(e.x - s * 1.2, e.y - s, s * 2.4, s * 2.2);
      }
      const frame = e.im[0];
      if (frame && frame.complete) {
        g.save(); if (!have) g.filter = 'brightness(0) opacity(.5)';
        g.drawImage(frame, e.x - s * 0.95, e.y + bob - s * 0.62 * 1.9 + s * 0.18, s * 1.9, s * 1.9); g.restore();
      }
      if (!have) label(g, '?', e.x, e.y + s * 0.15, Math.max(14, s * 0.4));
      if (have && legend) { g.fillStyle = '#fff'; for (let k = 0; k < 3; k++) { const a = Math.sin(t * 3 + e.ph + k * 2.1); if (a > 0) { const sx = e.x + Math.cos(k * 2.4 + e.ph) * s * 0.7, sy2 = e.y + Math.sin(k * 3.1 + e.ph) * s * 0.55; g.globalAlpha = a; g.beginPath(); g.moveTo(sx, sy2 - 4); g.lineTo(sx + 1.4, sy2 - 1.4); g.lineTo(sx + 4, sy2); g.lineTo(sx + 1.4, sy2 + 1.4); g.lineTo(sx, sy2 + 4); g.lineTo(sx - 1.4, sy2 + 1.4); g.lineTo(sx - 4, sy2); g.lineTo(sx - 1.4, sy2 - 1.4); g.closePath(); g.fill(); } } g.globalAlpha = 1; }
      // the nameplate under the shelf
      const nm = have ? (nameOf('balls', e.id) || e.sp.name) : '???', fs = Math.max(8, Math.min(11, c * 0.125));
      g.font = `700 ${fs}px Fredoka, system-ui`; const tw = Math.min(c * 0.94, g.measureText(nm).width + 12), px = e.x - tw / 2, pyy = e.sy + 13;
      const pl = g.createLinearGradient(0, pyy, 0, pyy + fs + 6); if (have) { pl.addColorStop(0, '#f6d98a'); pl.addColorStop(1, '#c79a3b'); } else { pl.addColorStop(0, '#4a3a58'); pl.addColorStop(1, '#2f2440'); }
      g.fillStyle = pl; rrect(g, px, pyy, tw, fs + 6, 3); g.fill();
      g.strokeStyle = have ? 'rgba(90,56,10,.5)' : 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = have ? '#4a2f0c' : '#8d7aa0'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let txt = nm; while (txt.length > 3 && g.measureText(txt).width > tw - 8) txt = txt.slice(0, -2);
      g.fillText(txt === nm ? nm : txt + '…', e.x, pyy + (fs + 6) / 2 + 0.5);
    }
    drawHearts(g);
  }


  // ---------- drawing the food and what it does to the water and the ground ----------
  function drawShrimp(g, x, y, k, rot) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k); g.lineCap = 'round'; g.lineJoin = 'round';
    g.fillStyle = '#ff6a3d'; g.beginPath(); g.moveTo(-10, 5); g.lineTo(-17, 0); g.lineTo(-15, 6); g.lineTo(-17, 11); g.closePath(); g.fill(); // tail fan
    g.strokeStyle = '#e0502a'; g.lineWidth = 10; g.beginPath(); g.moveTo(-10, 5); g.quadraticCurveTo(-9, -8, 5, -7); g.quadraticCurveTo(13, -5, 12, 3); g.stroke(); // body
    g.strokeStyle = '#ff8a5c'; g.lineWidth = 7; g.beginPath(); g.moveTo(-9, 4); g.quadraticCurveTo(-8, -7, 5, -6); g.quadraticCurveTo(12, -4, 11, 2); g.stroke();
    g.strokeStyle = 'rgba(255,220,190,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-7, 0); g.quadraticCurveTo(-4, -6, 4, -6.5); g.stroke(); // shine
    g.strokeStyle = 'rgba(160,40,10,.55)'; g.lineWidth = 1.4; for (const [sx, sy] of [[-5, -4], [0, -7], [5, -6.5]]) { g.beginPath(); g.moveTo(sx, sy - 3); g.lineTo(sx + 1, sy + 3); g.stroke(); } // segments
    g.fillStyle = '#1b1411'; g.beginPath(); g.arc(11, -1, 1.6, 0, 6.28); g.fill();
    g.strokeStyle = '#ffb08a'; g.lineWidth = 1; g.beginPath(); g.moveTo(12, -3); g.quadraticCurveTo(18, -9, 21, -6); g.moveTo(12, -2); g.quadraticCurveTo(19, -3, 22, 0); g.stroke(); // feelers
    g.restore();
  }
  function drawPellet(g, x, y, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = '#6f7d2e'; rrect(g, -5.5, -3.2, 11, 6.4, 3); g.fill();
    g.fillStyle = '#8fa23f'; rrect(g, -5, -3, 8, 3, 1.5); g.fill();
    g.strokeStyle = 'rgba(40,50,10,.55)'; g.lineWidth = 1; rrect(g, -5.5, -3.2, 11, 6.4, 3); g.stroke();
    g.restore();
  }
  function drawFxLow(g, sk) { // ripples on the water, dust on the ground: under the animals
    for (const p of fx) {
      if (p.delay > 0) continue;
      const a = clamp(p.life / p.max, 0, 1);
      if (p.t === 'ring') { g.strokeStyle = `rgba(235,252,255,${a * 0.7})`; g.lineWidth = 0.8 + a * 2.2; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.28); g.stroke(); g.strokeStyle = `rgba(0,60,90,${a * 0.12})`; g.lineWidth = 3 * a; g.beginPath(); g.arc(p.x, p.y, p.r + 1.5, 0, 6.28); g.stroke(); }
      else if (p.t === 'dust') { g.fillStyle = `rgba(214,190,140,${a * 0.5})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.28); g.fill(); }
    }
  }
  function drawFood(g, sk) {
    for (const t of treats) {
      if (t.delay > 0) continue;
      const k = 1 + t.z / 220, fade = clamp(t.life / 1.5, 0, 1);
      g.globalAlpha = fade;
      if (t.kind === 'shrimp') {
        // its shadow on the water gets sharper as it falls; once landed it floats and bobs, then slowly sinks out of sight
        const sink = t.landed ? clamp((t.age - 4) / 4, 0, 1) : 0, bob = t.landed ? Math.sin(clock * 3 + t.x) * 1.3 : 0;
        g.fillStyle = `rgba(0,40,60,${(0.12 + 0.2 * (1 - t.z / 150)) * (1 - sink)})`; g.beginPath(); g.ellipse(t.x + t.z * 0.1 + 2, t.y + 8 + t.z * 0.06, 11 * k, 4 * k, 0, 0, 6.28); g.fill();
        g.globalAlpha = fade * (1 - sink * 0.55);
        drawShrimp(g, t.x, t.y - t.z + bob, k * (1 - sink * 0.25), t.rot + (t.landed ? Math.sin(clock * 1.7 + t.x) * 0.12 : 0));
      } else {
        g.fillStyle = `rgba(40,30,10,${0.12 + 0.2 * (1 - clamp(t.z / 130, 0, 1))})`; g.beginPath(); g.ellipse(t.x + 1, t.y + 3, 6 * k, 2.4 * k, 0, 0, 6.28); g.fill();
        drawPellet(g, t.x, t.y - t.z, t.rot);
      }
      g.globalAlpha = 1;
    }
  }
  function drawFxHigh(g) { // droplets thrown up by a splash
    for (const p of fx) {
      if (p.t !== 'drop' || p.delay > 0) continue;
      g.fillStyle = 'rgba(0,50,80,.15)'; g.beginPath(); g.ellipse(p.x, p.y + 2, 1.8, 0.8, 0, 0, 6.28); g.fill();
      g.fillStyle = 'rgba(240,252,255,.9)'; g.beginPath(); g.arc(p.x, p.y - p.z, 2.1, 0, 6.28); g.fill();
    }
  }

  function label(g, text, x, y, size = 12) {
    g.font = `700 ${size}px Fredoka, system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 4; g.strokeStyle = 'rgba(10,40,60,.7)'; g.strokeText(text, x, y);
    g.fillStyle = '#fff'; g.fillText(text, x, y);
  }

  function draw(g, W, H, sk) {
    const t = clock;
    if (sk === 'balls') { drawTrophy(g); return; }
    if (sk === 'fish') {
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#3fb4cc'); bg.addColorStop(1, '#0f5f7e');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      Water.overlay(g, W, H, t, { strength: 1.1 });
      for (const [fx, fy, r] of [[0.1, 0.2, 40], [0.88, 0.35, 50], [0.2, 0.82, 34], [0.78, 0.86, 44]]) { g.fillStyle = 'rgba(0,50,40,.2)'; g.beginPath(); g.ellipse(fx * W + 3, fy * H + 5, r, r * 0.9, 0, 0, 6.28); g.fill(); g.fillStyle = '#3f9a52'; g.beginPath(); g.moveTo(fx * W, fy * H); g.arc(fx * W, fy * H, r, 0.4, 6.28 - 0.4); g.fill(); }
    } else drawPasture(g, t);
    drawFxLow(g, sk);
    // creatures, drawn back to front
    for (const e of [...ents].sort((a, b) => a.y - b.y)) {
      const s = e.size;
      g.save(); g.translate(e.x, e.y);
      if (sk === 'fish') {
        g.rotate(e.a); if (Math.cos(e.a) < 0) g.scale(1, -1);
        g.rotate(Math.sin(e.ph) * 0.06);
      } else {
        e.depth = clamp(0.62 + (e.y - H * 0.36) / (H * 0.64) * 0.75, 0.6, 1.25); g.scale(e.depth, e.depth); // farther sheep are smaller
        const sg = g.createRadialGradient(2, s * 0.34, 2, 2, s * 0.34, s * 0.5); sg.addColorStop(0, 'rgba(10,50,10,.38)'); sg.addColorStop(1, 'rgba(10,50,10,0)');
        g.fillStyle = sg; g.beginPath(); g.ellipse(2, s * 0.34, s * 0.52, s * 0.14, 0, 0, 6.28); g.fill();
        if (e.dir < 0) g.scale(-1, 1);
        g.translate(0, e.chew > 0 ? Math.sin(clock * 30) * 1.7 : e.pause > 0 ? 0 : -Math.abs(Math.sin(e.ph * 0.8)) * 3);
      }
      const frame = sk === 'sheep' ? e.im[e.pause > 0 ? 0 : Math.floor(e.ph * 0.7) % 4] : e.im[0];
      if (frame && frame.complete) {
        if (sk === 'sheep') g.drawImage(frame, -0.4 * s * 1.2, -s * 1.1 * 0.9 + s * 0.05, s * 1.2, s * 1.2);
        else g.drawImage(frame, -s / 2, -s / 2, s, s);
      }
      g.restore();
      if (e.id >= 0 && nameOf(sk, e.id)) label(g, nameOf(sk, e.id), e.x, e.y + s * (sk === 'fish' ? 0.46 : 0.62) * (e.depth || 1));
    }
    drawFood(g, sk); drawFxHigh(g);
    drawHearts(g);
  }
  function drawHearts(g) {
    for (const h of hearts) { h.life -= 0.016; h.y += h.vy * 0.016; }
    hearts = hearts.filter(h => h.life > 0);
    for (const h of hearts) { g.globalAlpha = clamp(h.life, 0, 1); g.font = '16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(h.t, h.x, h.y); }
    g.globalAlpha = 1;
  }

  // ---------- Playroom: the bouncy-house ball toss ----------
  const T = Meta.Toss, TC = T.cfg, CAM = 1.4;
  const toss = { pool: [], sel: 0, flying: [], pops: [], held: null, samples: [], score: 0, streak: 0, wind: 0, bx: 0, readyIn: 0, trayX: 0, drag: null, shake: 0 };
  let round = null; // set while a timed round (the Ball toss minigame from the menu) is running
  const ROUND_TIME = 60, ROUND_HEARTS = 5;
  let F = 400, HY = 180;
  const P = (x, y, z) => { const k = F / z; return { x: W / 2 + x * k, y: HY + (CAM - y) * k, k }; };

  function tossBuild() {
    const list = Meta.speciesOf('balls'), ids = speciesIds('balls');
    toss.pool = ids.length ? ids.map(id => ({ id, color: list[id].color, sp: list[id] })) : [0, 1, 2, 3].map(c => ({ id: -1, color: c, sp: null }));
    toss.sel = clamp(toss.sel, 0, toss.pool.length - 1);
    toss.flying = []; toss.held = null; toss.readyIn = 0;
    sig = 'balls' + ids.join(',');
    for (const p of toss.pool) p.im = img(Meta.skinImage('balls', { color: p.color, species: p.id }, 96, p.id >= 0 ? hatOf('balls', p.id) : null));
  }
  const tossLayout = () => { F = 0.61 * H; HY = 0.28 * H; };
  const readyPos = () => { const p = P(0, TC.startY, TC.startZ); return { x: p.x, y: p.y, r: T.R * p.k }; };
  const trayY = () => H - 34;
  const curBall = () => toss.pool[toss.sel];
  const windNow = () => (S.home.toss.goals < 2 ? 0 : toss.wind);
  function newWind() {
    const g = S.home.toss.goals, mag = clamp(0.3 + g * 0.08, 0, 2.2);
    toss.wind = g < 2 ? 0 : (Math.random() < 0.5 ? -1 : 1) * rand(mag * 0.4, mag);
  }
  const basketX = () => { const g = S.home.toss.goals; const amp = g < 8 ? 0 : Math.min(1.1, 0.15 * (g - 7)); return amp * Math.sin(clock * 0.9); };

  function tossHud() {
    const wind = Math.abs(windNow()) < 0.05 ? '' : `<span class="th-wind"><i style="transform:rotate(${windNow() > 0 ? 0 : 180}deg)">➜</i>${Math.abs(windNow()).toFixed(1)}</span>`;
    const rd = round && !round.over ? `<span><small>Time</small><b>${Math.max(0, Math.ceil(ROUND_TIME - round.t))}</b></span><span class="th-hearts">${'❤️'.repeat(round.hearts)}${'🤍'.repeat(ROUND_HEARTS - round.hearts)}</span>` : '';
    tossEl.innerHTML = `<span><small>Score</small><b>${toss.score}</b></span>${rd || `<span><small>Best</small><b>${S.home.toss.best}</b></span>`}${toss.streak > 1 ? `<span class="th-streak">×${Math.min(toss.streak, 5)} streak</span>` : ''}${wind}`;
  }

  function onScore(b) {
    toss.streak++;
    const pts = T.points(b, toss.streak);
    toss.score += pts.total; S.home.toss.goals++;
    if (toss.score > S.home.toss.best) S.home.toss.best = toss.score;
    const p = P(b.x, TC.rimH + 0.3, b.z);
    toss.pops.push({ x: p.x, y: p.y - 10, life: 1.4, txt: `${pts.kind}! +${pts.total}`, col: pts.kind === 'BANK SHOT' ? '#ffd23f' : '#fff' });
    for (let i = 0; i < 6; i++) hearts.push({ x: p.x + rand(-30, 30), y: p.y + rand(-10, 10), life: 1, vy: rand(-90, -40), t: ['⭐', '✨', '🎉'][i % 3] });
    toss.shake = 0.25;
    Sfx.tone(PENTA[5 + Math.min(toss.streak, 4)], 0.22, { type: 'triangle', vol: 0.09, echo: true });
    if (round) { round.goals++; if (round.goals === 5 && !round.toy) rareToy(); }
    Meta.save();
    newWind(); tossHud();
  }
  function onMiss() {
    if (toss.streak) toss.streak = 0;
    if (round && !round.over) { round.hearts--; toss.pops.push({ x: W / 2, y: H * 0.5, life: 1, txt: 'Miss!', col: '#ff8fa3' }); if (round.hearts <= 0) endRound(); }
    tossHud();
  }
  // five goals in a round and a rare toy ball joins the album
  function rareToy() {
    const sp = Meta.rollSpecies('balls'), al = S.albums.balls, fresh = !al[sp.id];
    al[sp.id] = (al[sp.id] || 0) + 1; round.toy = sp.name; Meta.save();
    toss.pops.push({ x: W / 2, y: H * 0.38, life: 1.8, txt: (fresh ? 'NEW TOY: ' : '') + sp.name, col: '#ffd23f' });
    if (fresh) { Meta.showDiscovery(sp.id, 'balls'); Meta.sfx('discovery'); tossBuild(); }
  }
  function startRound() {
    round = { t: 0, hearts: ROUND_HEARTS, goals: 0, over: false, toy: null };
    toss.score = 0; toss.streak = 0; toss.flying = []; toss.readyIn = 0; S.home.toss.goals = 0; newWind();
    resultEl.classList.add('hidden'); tossHud();
    msg.innerHTML = 'Toss time!<small>60 seconds · 5 misses and it is over</small>'; clearTimeout(chrome.t); chrome.t = setTimeout(() => { msg.innerHTML = ''; }, 3500);
  }
  function endRound() {
    if (!round || round.over) return;
    round.over = true; tossHud();
    const lv = Math.min(2, 1 + S.level * 0.05), goals = round.goals, coins = Math.min(400, Math.round(toss.score * 0.4 * lv)), xp = goals * 8, charge = goals * 3 + (round.toy ? 20 : 0);
    S.coins += coins; S.stats.coinsEarned += coins; Meta.addXp(xp).forEach((u, i) => setTimeout(() => Meta.toast(u), 700 + i * 2600)); Meta.vaultCharge?.(charge);
    S.minigames = S.minigames || {}; const pr = (S.minigames.balls = { plays: 0, best: 0, perfects: 0, caught: 0, ...S.minigames.balls });
    pr.plays++; pr.best = Math.max(pr.best, toss.score); pr.caught += round.toy ? 1 : 0;
    if (toss.score > S.home.toss.best) S.home.toss.best = toss.score;
    Meta.save(); ov.querySelector('[data-coins]').textContent = fmt(S.coins);
    const early = round.hearts <= 0;
    resultEl.innerHTML = `<div class="he-card"><div style="font-size:54px;line-height:1">${early ? '🧺' : '🎉'}</div><b class="he-sp">${early ? 'Out of tries!' : 'Time is up!'}</b>
      <span style="font-weight:700;color:#c98a00;font-size:19px">+${fmt(coins)} coins · +${xp} XP</span>
      <small>${goals} goal${goals === 1 ? '' : 's'} · score ${toss.score}${round.toy ? ' · toy: ' + round.toy : ''}</small>
      <div class="he-btns"><button class="btn small" data-again>Play again</button><button class="btn small ghost" data-end>Close</button></div></div>`;
    resultEl.classList.remove('hidden'); Meta.sfx('chest');
    resultEl.querySelector('[data-again]').onclick = () => { Meta.sfx('click'); startRound(); };
    resultEl.querySelector('[data-end]').onclick = closeHome;
  }

  function tossUpdate(dt) {
    clock += dt;
    const env = { wind: windNow(), bx: (toss.bx = basketX()) };
    for (let n = Math.ceil(dt / (1 / 120)), i = 0; i < n; i++) {
      for (const b of toss.flying) {
        for (const ev of T.step(b, dt / n, env)) {
          if (ev === 'score') onScore(b);
          else if (ev === 'bounce') Sfx.tone(180 + Math.random() * 40, 0.08, { type: 'sine', vol: 0.04, slide: 1.6 });
          else if (ev === 'rim') Sfx.tone(520, 0.06, { type: 'square', vol: 0.03 });
          else if (ev === 'wall') Sfx.tone(140, 0.09, { type: 'sine', vol: 0.05, slide: 0.7 });
          else if (ev === 'done' && !b.scored) onMiss();
        }
      }
    }
    toss.flying = toss.flying.filter(b => !b.done);
    for (const p of toss.pops) { p.life -= dt; p.y -= 26 * dt; }
    toss.pops = toss.pops.filter(p => p.life > 0);
    if (toss.readyIn > 0) toss.readyIn -= dt;
    if (round && !round.over) { const before = Math.ceil(ROUND_TIME - round.t); round.t += dt; if (Math.ceil(ROUND_TIME - round.t) !== before) tossHud(); if (round.t >= ROUND_TIME) endRound(); }
    toss.shake = Math.max(0, toss.shake - dt);
  }

  const quad = (g, a, b, c, d, fill) => { g.fillStyle = fill; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill(); };
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = c => clamp(Math.round(c * k), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

  function drawHouse(g) {
    const tiles = Meta.skinTheme('balls').tiles, ZB = TC.backZ, WX = TC.wallX, CE = TC.ceil;
    // ceiling and back wall
    const sky = g.createLinearGradient(0, 0, 0, HY); sky.addColorStop(0, '#ffe3ee'); sky.addColorStop(1, '#ffd0e2'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const bl = P(-WX, CE, ZB), br = P(WX, 0, ZB);
    for (let i = 0; i < 6; i++) { // inflated panels
      const x0 = P(-WX + i, 0, ZB), x1 = P(-WX + i + 1, 0, ZB);
      g.fillStyle = i % 2 ? shade(tiles[1], 1.02) : shade(tiles[3], 1.0); g.fillRect(x0.x, bl.y, x1.x - x0.x + 1, br.y - bl.y);
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x1.x, bl.y); g.lineTo(x1.x, br.y); g.stroke();
    }
    const gate = P(-1.1, 2.6, ZB), gateR = P(1.1, 0, ZB); // the castle gate: a netted window onto the sunny day
    const gw = gateR.x - gate.x, gh = gateR.y - gate.y, gr = gw / 2;
    const gs = g.createLinearGradient(0, gate.y, 0, gateR.y); gs.addColorStop(0, '#9fdcff'); gs.addColorStop(1, '#e6f7ff');
    g.fillStyle = gs; g.beginPath(); g.moveTo(gate.x, gateR.y); g.lineTo(gate.x, gate.y + gr); g.arc(gate.x + gr, gate.y + gr, gr, Math.PI, 0); g.lineTo(gateR.x, gateR.y); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; for (let x = gate.x; x <= gateR.x; x += gw / 7) { g.beginPath(); g.moveTo(x, gate.y); g.lineTo(x, gateR.y); g.stroke(); }
    for (let y = gate.y + gr; y <= gateR.y; y += gh / 8) { g.beginPath(); g.moveTo(gate.x, y); g.lineTo(gateR.x, y); g.stroke(); }
    g.strokeStyle = tiles[0]; g.lineWidth = 9; g.beginPath(); g.moveTo(gate.x, gateR.y); g.lineTo(gate.x, gate.y + gr); g.arc(gate.x + gr, gate.y + gr, gr, Math.PI, 0); g.lineTo(gateR.x, gateR.y); g.stroke();
    // side walls: bands of inflated padding that get darker toward the back
    const bands = 9;
    for (let i = 0; i < bands; i++) {
      const z0 = 0.5 + (ZB - 0.5) * (i / bands) ** 1.2, z1 = 0.5 + (ZB - 0.5) * ((i + 1) / bands) ** 1.2, col = shade(tiles[i % 2 ? 0 : 2], 0.9 - i * 0.02);
      for (const sd of [-1, 1]) quad(g, P(sd * WX, 0, z0), P(sd * WX, CE, z0), P(sd * WX, CE, z1), P(sd * WX, 0, z1), col);
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
      for (const sd of [-1, 1]) { const a = P(sd * WX, 0, z1), b = P(sd * WX, CE, z1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    }
    // corner towers
    for (const sd of [-1, 1]) {
      const a = P(sd * WX, 0, ZB), b = P(sd * (WX - 0.9), 0, ZB), top = P(sd * WX, CE + 0.4, ZB);
      const x0 = Math.min(a.x, b.x), w = Math.abs(a.x - b.x), tg = g.createLinearGradient(x0, 0, x0 + w, 0); tg.addColorStop(0, shade(tiles[0], 1.1)); tg.addColorStop(0.5, '#fff'); tg.addColorStop(1, shade(tiles[0], 0.85));
      g.fillStyle = tg; g.fillRect(x0, top.y, w, a.y - top.y);
      g.fillStyle = tiles[2]; g.beginPath(); g.arc(x0 + w / 2, top.y, w * 0.62, Math.PI, 0); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0 + w / 2, top.y - w * 0.6); g.lineTo(x0 + w / 2, top.y - w * 1.2); g.stroke();
      g.fillStyle = tiles[1]; g.beginPath(); g.moveTo(x0 + w / 2, top.y - w * 1.2); g.lineTo(x0 + w / 2 + w * 0.7 * sd * -1, top.y - w * 1.0); g.lineTo(x0 + w / 2, top.y - w * 0.8); g.fill();
    }
    // the springy floor, in perspective
    const rows = 9;
    for (let i = 0; i < rows; i++) {
      const z0 = 0.5 + (ZB - 0.5) * (i / rows) ** 1.25, z1 = 0.5 + (ZB - 0.5) * ((i + 1) / rows) ** 1.25;
      for (let c = 0; c < 6; c++) quad(g, P(-WX + c, 0, z0), P(-WX + c + 1, 0, z0), P(-WX + c + 1, 0, z1), P(-WX + c, 0, z1), tiles[(c + i * 2) % 4]);
    }
    const fv = g.createLinearGradient(0, HY, 0, H); fv.addColorStop(0, 'rgba(255,255,255,.35)'); fv.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = fv; g.fillRect(0, HY, W, H - HY);
  }

  function ballSprite(g, pick, x, y, r, spin) {
    const im = pick.im; if (!im || !im.complete) return;
    const w = r * 3.1; // a ball is 0.323 of its picture's width wide, centred at (0.5, 0.62)
    g.save(); g.translate(x, y);
    if (spin && pick.id >= 0 && !hatOf('balls', pick.id)) g.rotate(spin);
    g.drawImage(im, -w * 0.5, -w * 0.62, w, w); g.restore();
  }
  function ballShadow(g, b) {
    const s = P(b.x, 0, b.z), a = clamp(0.3 - b.y * 0.1, 0.08, 0.3);
    g.fillStyle = `rgba(60,20,80,${a})`; g.beginPath(); g.ellipse(s.x, s.y, T.R * s.k * (1 - Math.min(0.4, b.y * 0.15)), T.R * s.k * 0.35, 0, 0, 6.28); g.fill();
  }
  function drawBasket(g) {
    const bz = TC.basketZ, bx = toss.bx, top = P(bx, TC.rimH, bz), bot = P(bx, 0, bz), rx = TC.rimR * top.k, ry = rx * 0.38, bx2 = TC.rimR * 0.8 * bot.k;
    g.fillStyle = 'rgba(60,20,80,.22)'; g.beginPath(); g.ellipse(bot.x + 4, bot.y + 2, rx * 1.05, ry * 0.9, 0, 0, 6.28); g.fill();
    // back of the rim and the dark inside
    g.fillStyle = '#5a2a1a'; g.beginPath(); g.ellipse(top.x, top.y, rx, ry, 0, 0, 6.28); g.fill();
    // balls that dropped in, drawn inside the basket
    for (const b of toss.flying) if (b.inside) { const p = P(b.x, b.y, b.z); g.save(); g.beginPath(); g.rect(top.x - rx - 4, 0, rx * 2 + 8, bot.y + 4); g.clip(); ballSprite(g, b.pick, p.x, p.y, T.R * p.k, b.spin); g.restore(); }
    // the front of the basket
    const wick = g.createLinearGradient(top.x - rx, 0, top.x + rx, 0); wick.addColorStop(0, '#c0602e'); wick.addColorStop(0.45, '#f0a060'); wick.addColorStop(1, '#a8501f');
    g.fillStyle = wick; g.beginPath(); g.moveTo(top.x - rx, top.y); g.ellipse(top.x, top.y, rx, ry, 0, Math.PI, 0, true); g.lineTo(bot.x + bx2, bot.y); g.ellipse(bot.x, bot.y, bx2, ry * 0.8, 0, 0, Math.PI); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(90,40,10,.45)'; g.lineWidth = 2;
    for (let i = 1; i < 6; i++) { const f = i / 6; g.beginPath(); g.moveTo(top.x - rx + rx * 2 * f, top.y + ry * Math.sqrt(1 - (2 * f - 1) ** 2)); g.lineTo(bot.x - bx2 + bx2 * 2 * f, bot.y + ry * 0.8 * Math.sqrt(1 - (2 * f - 1) ** 2)); g.stroke(); }
    for (let i = 1; i < 4; i++) { const y = top.y + (bot.y - top.y) * i / 4, r = rx + (bx2 - rx) * i / 4; g.beginPath(); g.ellipse(top.x, y, r, ry * (1 - i * 0.05), 0, 0.05, Math.PI - 0.05); g.stroke(); }
    g.strokeStyle = '#ffd9a0'; g.lineWidth = Math.max(3, rx * 0.1); g.beginPath(); g.ellipse(top.x, top.y, rx, ry, 0, 0, 6.28); g.stroke();
  }
  function drawToss(g) {
    g.save();
    if (toss.shake > 0 && S.settings?.shake !== false) g.translate(rand(-2, 2) * toss.shake * 8, rand(-2, 2) * toss.shake * 8);
    drawHouse(g);
    const front = [], back = [];
    for (const b of toss.flying) if (!b.inside) (b.z > TC.basketZ + 0.05 ? back : front).push(b);
    for (const b of toss.flying) ballShadow(g, b);
    const drawB = b => { const p = P(b.x, b.y, b.z); ballSprite(g, b.pick, p.x, p.y, T.R * p.k, b.spin); };
    back.sort((a, c) => c.z - a.z).forEach(drawB);
    drawBasket(g);
    front.sort((a, c) => c.z - a.z).forEach(drawB);
    // the ball in hand
    const rp = readyPos(), pick = curBall();
    if (toss.held) { ballShadow(g, { x: 0, y: 0.3, z: TC.startZ }); ballSprite(g, pick, toss.held.x, toss.held.y, rp.r * 1.08, 0); }
    else if (toss.readyIn <= 0) { const bob = Math.sin(clock * 3) * 3; ballShadow(g, { x: 0, y: 0.3, z: TC.startZ }); ballSprite(g, pick, rp.x, rp.y + bob, rp.r, 0); }
    // the tray of every ball you own
    const ty = trayY(), tr = g.createLinearGradient(0, ty - 36, 0, H); tr.addColorStop(0, 'rgba(60,30,90,0)'); tr.addColorStop(0.35, 'rgba(60,30,90,.55)'); tr.addColorStop(1, 'rgba(60,30,90,.8)');
    g.fillStyle = tr; g.fillRect(0, ty - 36, W, H - ty + 36);
    toss.pool.forEach((p, i) => {
      const x = 34 + i * 52 + toss.trayX; if (x < -30 || x > W + 30) return;
      if (i === toss.sel) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(x, ty, 25, 0, 6.28); g.stroke(); }
      ballSprite(g, p, x, ty, 17, 0);
    });
    const nm = pick.id >= 0 ? nameOf('balls', pick.id) || pick.sp.name : 'Toy ball';
    label(g, nm, W / 2, ty - 42);
    // popups and sparkles
    for (const p of toss.pops) { g.globalAlpha = clamp(p.life, 0, 1); g.font = '700 22px Fredoka, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 5; g.strokeStyle = 'rgba(80,20,100,.8)'; g.lineJoin = 'round'; g.strokeText(p.txt, p.x, p.y); g.fillStyle = p.col; g.fillText(p.txt, p.x, p.y); }
    g.globalAlpha = 1;
    drawHearts(g);
    g.restore();
  }

  // tossing: grab the ball, flick it up the screen
  function tossDown(x, y, id) {
    const ty = trayY();
    if (y > ty - 30) { toss.drag = { x0: x, tx0: toss.trayX, moved: 0, id, ax: x }; return; }
    const rp = readyPos();
    if (toss.readyIn <= 0 && Math.hypot(x - rp.x, y - rp.y) < rp.r * 1.8) { toss.held = { x: rp.x, y: rp.y, id, t0: performance.now(), sx: x, sy: y }; toss.samples = [{ x, y, t: performance.now() }]; Sfx.tone(420, 0.05, { type: 'sine', vol: 0.04 }); }
  }
  function tossMove(x, y) {
    if (toss.drag) {
      toss.drag.moved = Math.max(toss.drag.moved, Math.abs(x - toss.drag.x0));
      const maxScroll = Math.min(0, W - (toss.pool.length * 52 + 20));
      toss.trayX = clamp(toss.drag.tx0 + x - toss.drag.x0, maxScroll, 0);
    } else if (toss.held) {
      toss.held.x = x; toss.held.y = clamp(y, HY + 30, H - 20);
      const now = performance.now(); toss.samples.push({ x, y, t: now }); toss.samples = toss.samples.filter(s => now - s.t < 140);
    }
  }
  function tossUp(x, y) {
    if (toss.drag) {
      const d = toss.drag; toss.drag = null;
      if (d.moved < 8) { // a tap on a tray ball: pick it, or open its card if it is already picked
        const i = Math.round((x - 34 - toss.trayX) / 52);
        if (i >= 0 && i < toss.pool.length && Math.abs(x - (34 + i * 52 + toss.trayX)) < 26) { if (i === toss.sel && toss.pool[i].id >= 0 && !round) openEditor('balls', toss.pool[i].id); else { toss.sel = i; Sfx.tone(520, 0.06, { type: 'triangle', vol: 0.05 }); } }
      }
      return;
    }
    const h = toss.held; if (!h) return;
    toss.held = null;
    const now = performance.now(), s0 = toss.samples.find(s => now - s.t < 130) || toss.samples[0], s1 = toss.samples[toss.samples.length - 1];
    const dtm = Math.max(16, s1.t - s0.t) / 1000, fx = (s1.x - s0.x) / dtm, fy = (s1.y - s0.y) / dtm;
    const tap = Math.hypot(x - h.sx, y - h.sy) < 10 && now - h.t0 < 350;
    if (tap) { if (!round && curBall().id >= 0) openEditor('balls', curBall().id); return; }
    if (fy > -450) { Sfx.tone(300, 0.07, { type: 'sine', vol: 0.04, slide: 0.7 }); return; } // dropped it, not thrown
    const k = F / TC.startZ, from = { x: clamp((h.x - W / 2) / k, -1.2, 1.2), y: clamp(CAM - (h.y - HY) / k, 0.12, 1.5) };
    const b = T.launch(fx, fy, H, { wind: windNow(), bx: toss.bx }, from);
    b.pick = curBall(); toss.flying.push(b); toss.readyIn = 0.45;
    Sfx.tone(260, 0.12, { type: 'sine', vol: 0.06, slide: 1.8 });
  }

  // ---------- naming and dressing (the card that opens when you tap an animal or ball) ----------
  const ov = document.createElement('div');
  ov.id = 'homeOv'; ov.className = 'mg hidden'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'My collection');
  ov.innerHTML = `<canvas></canvas><div class="mg-top"><button class="fbtn" data-close aria-label="Close">✕</button><span class="coin-chip" data-coins>0</span><span class="mg-hud" data-hud></span></div>
    <div class="home-tabs"></div><div class="toss-hud hidden"></div><div class="feed-hud hidden"></div><div class="mg-msg" data-msg></div>
    <div class="home-edit hidden"><div class="he-card"><img class="he-img" alt=""><b class="he-sp"></b><small class="he-rar"></small>
      <label class="he-label">Name<input class="he-name" type="text" maxlength="14" autocomplete="off" spellcheck="false" placeholder="Give it a name"></label>
      <div class="he-err"></div><div class="he-label">Hat</div><div class="he-hats"></div>
      <div class="he-btns"><button class="btn small" data-save>Save name</button><button class="btn small ghost" data-done>Done</button></div></div></div>
    <div class="home-edit hidden" data-result></div>`;
  document.body.appendChild(ov);
  const cv = ov.querySelector('canvas'), g = cv.getContext('2d'), tabs = ov.querySelector('.home-tabs'), msg = ov.querySelector('[data-msg]'), hud = ov.querySelector('[data-hud]');
  const tossEl = ov.querySelector('.toss-hud'), feedEl = ov.querySelector('.feed-hud'), edit = ov.querySelector('.home-edit'), resultEl = ov.querySelector('[data-result]'), nameIn = ov.querySelector('.he-name'), errEl = ov.querySelector('.he-err'), hatsEl = ov.querySelector('.he-hats');
  let W = 360, H = 640, sk = 'fish', opened = false, last = 0, editing = null;

  const hatList = skn => {
    const own = skn === 'fish' ? S.owned.hat : S.skinOwned[skn].hat, cat = skn === 'fish' ? Meta.hats : Meta.SKIN_CATALOG[skn].hat;
    return own.map(id => cat.find(h => h.id === id) || Meta.hats.find(h => h.id === id)).filter(Boolean);
  };
  function openEditor(skn, id) {
    const sp = Meta.speciesOf(skn)[id]; if (!sp) return;
    editing = { sk: skn, id, sp };
    ov.querySelector('.he-sp').textContent = sp.name;
    const rar = Meta.RARITY[sp.rar], r = ov.querySelector('.he-rar'); r.textContent = `${rar.name} · caught ×${albumOf(skn)[id] || 1}`; r.style.color = rar.c;
    nameIn.value = nameOf(skn, id); nameIn.placeholder = sp.name; errEl.textContent = '';
    refreshEditor();
    edit.classList.remove('hidden');
    Meta.sfx('click');
  }
  function refreshEditor() {
    const { sk: skn, id, sp } = editing, cur = hatOf(skn, id);
    ov.querySelector('.he-img').src = pic(skn, sp, 120, cur, 0.6);
    hatsEl.innerHTML = '';
    const list = hatList(skn);
    for (const h of [{ id: 'none', name: 'No hat' }, ...list.filter(h => h.id !== 'none')]) {
      const b = el('button', 'he-hat' + ((cur || 'none') === h.id ? ' on' : ''), h.id === 'none' ? '<span>🚫</span>' : `<img src="${pic(skn, sp, 52, h.id, 0.6)}" alt="">`);
      b.title = h.name; b.setAttribute('aria-label', h.name);
      b.onclick = () => { S.home.hats[skn][id] = h.id === 'none' ? undefined : h.id; if (h.id === 'none') delete S.home.hats[skn][id]; Meta.save(); Meta.sfx('click'); refreshEditor(); rebuildSprites(skn, id); };
      hatsEl.appendChild(b);
    }
    if (list.length <= 1) hatsEl.appendChild(el('small', 'he-hint', 'Buy hats in the Store and they show up here.'));
  }
  function rebuildSprites(skn, id) {
    if (skn === 'balls') { const p = toss.pool.find(q => q.id === id); if (p) p.im = img(Meta.skinImage('balls', { color: p.color, species: id }, 96, hatOf('balls', id))); for (const e of ents) if (e.id === id) sprites(e, skn); }
    else for (const e of ents) if (e.id === id) sprites(e, skn);
  }
  function saveName() {
    const raw = nameIn.value.trim(), { sk: skn, id } = editing;
    if (!raw) { delete S.home.names[skn][id]; Meta.save(); errEl.textContent = ''; Meta.toast('Name cleared'); return true; }
    const res = Meta.checkName(raw);
    if (!res.ok) { errEl.textContent = res.why; nameIn.classList.add('bad'); setTimeout(() => nameIn.classList.remove('bad'), 600); Meta.sfx('click'); return false; }
    S.home.names[skn][id] = res.name; Meta.save(); nameIn.value = res.name; errEl.textContent = '';
    Meta.toast(`Meet ${res.name}! 💖`); Meta.sfx('chest');
    return true;
  }
  function closeEditor() { edit.classList.add('hidden'); editing = null; nameIn.blur(); }
  ov.querySelector('[data-save]').onclick = saveName;
  ov.querySelector('[data-done]').onclick = () => { if (nameIn.value.trim() !== nameOf(editing.sk, editing.id) && !saveName()) return; closeEditor(); };
  nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') saveName(); if (e.key === 'Escape') closeEditor(); });
  edit.addEventListener('pointerdown', e => { if (e.target === edit) closeEditor(); });

  // ---------- the full-screen page ----------
  const labels = { fish: '🐟 Pond', sheep: '🐑 Pasture', balls: '🏀 Playroom' };
  const sigOf = s => s + speciesIds(s).join(',');

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    tossLayout();
    if (sig !== (gameMode ? 'balls' + speciesIds('balls').join(',') : sigOf(sk)) || (gameMode ? !toss.pool.length : !ents.length)) (gameMode ? tossBuild : () => build(sk, W, H))();
    if (sk === 'balls' && !gameMode) layoutTrophy();
    for (const e of ents) { e.x = clamp(e.x, 20, W - 20); e.y = clamp(e.y, 20, H - 20); }
  }
  // The feeding chip: how much food you have left (it refills) and the daily "everyone is fed" progress.
  function feedHud() {
    if (typeof feedEl === 'undefined' || sk === 'balls') return;
    const icon = sk === 'fish' ? '🍤' : '🌿', dots = '●'.repeat(feed.n) + '<u>' + '●'.repeat(FEED_MAX - feed.n) + '</u>', n = Math.min(S.home.fedToday, 5);
    feedEl.innerHTML = `<span class="fh-food" title="Tap the scene to drop food"><i>${icon}</i><b>${dots}</b></span><span class="fh-fed${S.home.paid ? ' done' : ''}"><small>Fed today</small><b>${S.home.paid ? '✓ 5/5' : n + '/5'}</b></span>`;
  }
  function chrome() {
    const list = Meta.speciesOf(sk), have = Object.keys(albumOf(sk)).length;
    tabs.innerHTML = '';
    const owned = ownedSkins();
    if (owned.length > 1) for (const id of owned) {
      const b = el('button', 'home-tab' + (sk === id ? ' on' : ''), labels[id]);
      b.onclick = () => { Meta.sfx('click'); closeEditor(); round = null; resultEl.classList.add('hidden'); sk = homeSkin = id; ents = []; treats = []; toss.pool = []; size(); chrome(); };
      tabs.appendChild(b);
    }
    hud.innerHTML = `<span class="mg-pill">${have} / ${list.length}</span>`;
    feedEl.classList.toggle('hidden', gameMode || sk === 'balls'); feedHud();
    tossEl.classList.toggle('hidden', !gameMode); msg.classList.toggle('toss', gameMode); tabs.style.display = gameMode ? 'none' : '';
    if (gameMode) { tossHud(); msg.innerHTML = ''; }
    else if (sk === 'balls') msg.innerHTML = have ? 'Your toy ball trophies<small>Tap one to name it and give it a hat</small>' : 'No toys collected yet<small>Play as toy balls and catch rare ones to fill this room</small>';
    else msg.innerHTML = have ? 'Tap an animal to name it and give it a hat<small>Tap anywhere else to drop a treat</small>' : 'Nothing collected here yet<small>Catch rare ones to move them in. Tap to drop a treat!</small>';
    ov.querySelector('[data-coins]').textContent = fmt(S.coins);
    clearTimeout(chrome.t); chrome.t = setTimeout(() => { msg.innerHTML = ''; }, 5000); // the hint fades so it never sits on the animals
  }
  function loop(now) {
    if (!opened) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (gameMode) { tossUpdate(dt); drawToss(g); } else { update(dt, W, H, sk); draw(g, W, H, sk); }
    raf = requestAnimationFrame(loop);
  }
  function openHome() {
    if (opened) return;
    opened = true;
    sk = homeSkin && ownedSkins().includes(homeSkin) ? homeSkin : Meta.curSkin();
    document.getElementById('daily').classList.add('hidden');
    ov.classList.remove('hidden');
    ents = []; treats = []; hearts = []; toss.pool = []; toss.score = 0; toss.streak = 0; round = null; resultEl.classList.add('hidden'); closeEditor();
    size(); chrome(); newWind();
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function closeHome() { if (!opened) return; opened = false; round = null; gameMode = false; closeEditor(); cancelAnimationFrame(raf); ov.classList.add('hidden'); Meta.render(); }
  ov.querySelector('[data-close]').onclick = closeHome;
  addEventListener('keydown', e => { if (opened && e.key === 'Escape') { if (editing) closeEditor(); else closeHome(); } });
  addEventListener('resize', () => { if (opened) size(); });
  cv.addEventListener('pointerdown', ev => {
    Sfx.init();
    const x = ev.clientX, y = ev.clientY;
    if (editing) { closeEditor(); return; }
    if (gameMode) { cv.setPointerCapture?.(ev.pointerId); tossDown(x, y, curBall().id); return; }
    const hit = ents.find(e => Math.abs(e.x - x) < e.size * 0.6 * (e.depth || 1) && Math.abs(e.y - y) < e.size * 0.6 * (e.depth || 1));
    if (hit) {
      for (let k = 0; k < 4; k++) hearts.push({ x: hit.x + rand(-14, 14), y: hit.y - 18, life: 1, vy: rand(-60, -30), t: '✨' });
      Meta.Music?.chime(1 + (Math.random() * 5 | 0), 0.06);
      if (hit.id >= 0 && hit.have !== false) openEditor(sk, hit.id);
      return;
    }
    if (sk === 'balls') return;
    if (feed.n > 0) { feed.n--; feed.t = 0; feedHud(); dropFood(x, y); }
    else { feedEl.classList.remove('empty'); void feedEl.offsetWidth; feedEl.classList.add('empty'); } // out of food: the chip shakes
  });
  cv.addEventListener('pointermove', ev => { if (opened && gameMode) tossMove(ev.clientX, ev.clientY); });
  cv.addEventListener('pointerup', ev => { if (opened && gameMode) tossUp(ev.clientX, ev.clientY); });
  cv.addEventListener('pointercancel', () => { toss.held = null; toss.drag = null; });
  Meta.homeInfo = () => ({ opened, sk, game: gameMode }); // read by music.js
  Meta.pages.home = openHome;
  Meta.pages.tossRound = () => { if (!S.skinsOwned.includes('balls')) return; if (opened) closeHome(); gameMode = true; homeSkin = 'balls'; openHome(); startRound(); }; // the menu's Ball toss button
  Meta.homeEnts = () => ents; // for tests
  Meta.toss = toss; // for tests

  const css = document.createElement('style');
  css.textContent = `#homeOv { background: #0d4a5e; touch-action: none; }
    .home-tabs { position: absolute; left: 0; right: 0; top: calc(env(safe-area-inset-top, 0px) + 62px); display: flex; gap: 8px; justify-content: center; z-index: 2; padding: 0 12px; }
    .home-tab { font: inherit; font-weight: 700; font-size: 15px; border: 0; border-radius: 999px; padding: 6px 14px; cursor: pointer; background: rgba(255,255,255,.88); color: var(--deep); box-shadow: 0 3px 0 rgba(0,0,0,.18); }
    .home-tab.on { background: var(--deep); color: #fff; }
    .home-tabs ~ .mg-msg.toss { bottom: auto; top: 38%; }
    .toss-hud { position: absolute; left: 0; right: 0; top: calc(env(safe-area-inset-top, 0px) + 106px); display: flex; gap: 10px; justify-content: center; align-items: center; z-index: 2; pointer-events: none; }
    .toss-hud.hidden, .feed-hud.hidden { display: none; }
    .feed-hud { position: absolute; left: 0; right: 0; top: calc(env(safe-area-inset-top, 0px) + 106px); display: flex; gap: 10px; justify-content: center; align-items: center; z-index: 2; pointer-events: none; }
    .feed-hud span { background: rgba(255,255,255,.9); color: var(--deep); border-radius: 14px; padding: 4px 12px; display: flex; align-items: center; gap: 8px; box-shadow: 0 3px 0 rgba(0,0,0,.14); line-height: 1.1; }
    .feed-hud .fh-food i { font-style: normal; font-size: 18px; }
    .feed-hud .fh-food b { font-size: 13px; letter-spacing: 2px; color: #e0502a; }
    .feed-hud .fh-food b u { text-decoration: none; color: #c5d5da; }
    .feed-hud .fh-fed { flex-direction: column; gap: 1px; align-items: center; padding: 3px 12px; }
    .feed-hud small { font-size: 9px; opacity: .65; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; }
    .feed-hud .fh-fed b { font-size: 15px; }
    .feed-hud .fh-fed.done { background: #d9f5df; }
    .feed-hud.empty .fh-food { animation: fhshake .4s; background: #ffe1dc; }
    @keyframes fhshake { 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
    .toss-hud span { background: rgba(255,255,255,.9); color: var(--deep); border-radius: 14px; padding: 3px 12px; text-align: center; font-weight: 700; line-height: 1.1; box-shadow: 0 3px 0 rgba(0,0,0,.14); }
    .toss-hud small { display: block; font-size: 10px; opacity: .65; text-transform: uppercase; letter-spacing: .5px; }
    .toss-hud b { font-size: 20px; }
    .toss-hud .th-streak { background: #ffd23f; font-size: 13px; padding: 8px 12px; }
    .toss-hud .th-hearts { font-size: 14px; padding: 8px 10px; }
    .toss-hud .th-wind { background: #d6f1ff; display: flex; gap: 6px; align-items: center; padding: 6px 12px; }
    .toss-hud .th-wind i { font-style: normal; display: inline-block; font-size: 18px; }
    .home-edit { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center; background: rgba(8,30,50,.55); padding: 16px; }
    .home-edit.hidden { display: none; }
    .he-card { background: #fff; color: var(--deep); border-radius: 22px; padding: 16px 18px 18px; width: min(340px, 100%); display: flex; flex-direction: column; align-items: center; gap: 6px; box-shadow: 0 10px 0 rgba(0,0,0,.18); max-height: 100%; overflow: auto; }
    .he-img { width: 104px; height: 104px; }
    .he-sp { font-size: 20px; }
    .he-label { align-self: stretch; font-weight: 700; font-size: 13px; display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .he-name { font: inherit; font-size: 17px; font-weight: 700; padding: 8px 12px; border-radius: 12px; border: 2px solid #c9dbe5; color: var(--deep); width: 100%; box-sizing: border-box; }
    .he-name:focus { outline: none; border-color: #3a86ff; }
    .he-name.bad { border-color: #e63946; animation: he-shake .4s; }
    @keyframes he-shake { 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
    .he-err { min-height: 16px; color: #e63946; font-size: 12px; font-weight: 700; align-self: stretch; }
    .he-hats { display: flex; flex-wrap: wrap; gap: 6px; align-self: stretch; justify-content: center; }
    .he-hat { width: 52px; height: 52px; border-radius: 14px; border: 2px solid #c9dbe5; background: #eef7fb; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .he-hat img { width: 46px; height: 46px; }
    .he-hat.on { border-color: #3a86ff; background: #dcebff; box-shadow: 0 0 0 2px #3a86ff55; }
    .he-hint { opacity: .7; width: 100%; text-align: center; }
    .he-btns { display: flex; gap: 8px; margin-top: 6px; }`;
  document.head.appendChild(css);

  if (location.hash === '#disc') setTimeout(() => { document.getElementById('daily')?.classList.add('hidden'); Meta.showDiscovery(24, 'balls'); }, 700); // test: the discovery card
  if (location.hash === '#home') setTimeout(openHome, 300);
  if (location.hash === '#homeedit') setTimeout(() => { openHome(); const e = ents.find(q => q.id >= 0); if (e) openEditor('fish', e.id); }, 300);
  if (location.hash === '#homethrow') setTimeout(() => { // test: open the Playroom and throw one ball straight up the screen
    if (!S.skinsOwned.includes('balls')) S.skinsOwned.push('balls');
    Meta.pages.tossRound();
    setTimeout(() => { const b = T.launch(0, -2200 * H / 640, H, { wind: 0, bx: 0 }); b.pick = curBall(); toss.flying.push(b); toss.readyIn = 0.45; }, 400);
  }, 300);
  if (location.hash === '#homeballs' || location.hash === '#homesheep') setTimeout(() => { const s = location.hash.slice(5); if (!S.skinsOwned.includes(s)) S.skinsOwned.push(s); homeSkin = s; openHome(); }, 300);
})();
