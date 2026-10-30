/* Hands-on practice: a spotlighted tutorial that new players PLAY, right after the intro slides. It runs on the real game board (game.js
   `startPractice`: calm fish that barely move, no spawning, no stats, coins or missions) with scripted fish and a dimmed screen that
   spotlights what to loop next. Seven steps: loop, bigger loops, the color rule (and what a tangle is), the golden fish, the rainbow
   fish, the puffer bomb, then a wrap-up of the rest (clock, treasure, the King, Frenzy, the pond filling).
   It is mandatory the first time (S.practiceDone is false until the last step), has no skip, and recovers by itself: if the player pops
   the wrong fish the step is set up again. Replayable from the ? page ("Replay the hands-on practice"); a replay has an Exit button.
   Test hooks: #practice (start), #practice4 (start at step 4), #practicetest (a bot plays every step and logs it; used for headless checks).
   Needs game.js (practice hooks, makeFish, bounds, judge, catchFish, tangle), meta.js, tutorial.js (starts this when the slides finish). */
(() => {
  const { S } = Meta;
  const $ = id => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- staging helpers (read the game's board; fish are ordinary game fish placed by hand) ----------
  const centre = () => ({ x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 });
  function put(x, y, o = {}) {
    const f = makeFish(true, { plain: true });
    Object.assign(f, { x: clamp(x, bounds.x0 + 30, bounds.x1 - 30), y: clamp(y, bounds.y0 + 30, bounds.y1 - 30), a: rand(0, 6.28), enter: false, lazy: true, speed: rand(3, 7), species: -1, color: o.color ?? 0 });
    if (o.kind === 'gold') f.color = 'gold';
    else if (o.kind) { f.kind = o.kind; if (o.kind === 'rainbow') f.color = -1; if (o.kind === 'bomb') f.size *= 1.1; }
    rings.push({ x: f.x, y: f.y, r: 4, life: 0.7, w: 3 }); // a ripple where it appears
    return f;
  }
  function blob(n, x, y, r, opt) { // a loose clump that one loop can hold
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + rand(-0.2, 0.2), d = r * Math.sqrt((i + 0.6) / n);
      out.push(put(x + Math.cos(a) * d, y + Math.sin(a) * d, typeof opt === 'function' ? opt(i) : opt));
    }
    return out;
  }
  function scatter(colors, minR = 150, maxR = 215) { // fish that are not part of the exercise, out toward the edges
    const c = centre();
    return colors.map((col, i) => { const a = (i + 0.5) / colors.length * 6.283 + rand(-0.3, 0.3), d = rand(minR, maxR); return put(c.x + Math.cos(a) * d * 0.85, c.y + Math.sin(a) * d * 1.1, { color: col }); });
  }

  // ---------- the steps ----------
  // stage() sets the board up and returns { targets, need }: the fish to spotlight and how many must still be alive.
  // catch(ev) / tangle() return 'done' (next step), 'retry' (set the same step up again) or a string (feedback text; also retries).
  const STEPS = [
    { title: 'Loop the fish', icon: '✏️', text: 'Draw a circle around the glowing fish with your finger, then lift to close the net.',
      stage() { const c = centre(); const t = blob(5, c.x, c.y, 44, { color: 0 }); scatter([1, 2, 3, 1, 4, 2]); return { targets: t, need: 3 }; },
      catch: ev => (ev.n >= 3 ? 'done' : 'Try to circle all of the glowing fish.'),
      done: 'Nice! The number that floats up is your score for that net.' },
    { title: 'Bigger loops, bigger points', icon: '🎯', text: 'Points grow fast with every extra fish. One loop around ten fish beats ten loops of one. Catch this whole group in a single loop!',
      stage() { const c = centre(); const t = blob(10, c.x, c.y - 10, 72, { color: 1 }); scatter([0, 2, 3, 4]); return { targets: t, need: 8 }; },
      catch: ev => (ev.n >= 8 ? 'done' : 'Almost! Try to get the whole group in ONE loop, because bigger nets score far more.'),
      done: 'See that score? Big nets are the secret to a high score.' },
    { title: 'One color per loop', icon: '🎨', text: 'A loop that holds two colors tangles your net. Go ahead, loop BOTH groups and see what happens!',
      stage() { const c = centre(); const a = blob(4, c.x - 52, c.y, 28, { color: 0 }), b = blob(4, c.x + 52, c.y, 28, { color: 1 }); scatter([2, 3, 4, 2]); return { targets: [...a, ...b], need: 6 }; },
      catch: ev => (ev.n >= 3 ? 'done' : 'Try looping both groups.'),
      tangle: () => 'done',
      done: 'Tangled! Mixed colors break your combo and bring more fish. Loop one color at a time.' },
    { title: 'Now loop just one color', icon: '✅', text: 'Loop only one of the two groups. Keep a loop to a single color.',
      stage() { const c = centre(); const a = blob(4, c.x - 52, c.y, 28, { color: 0 }), b = blob(4, c.x + 52, c.y, 28, { color: 1 }); scatter([2, 3, 4, 2]); return { targets: [...a, ...b], need: 6 }; },
      catch: ev => (ev.n >= 3 ? 'done' : 'Try to circle one whole group.'),
      tangle: () => 'Tangled again. Circle just one color this time.',
      done: 'Perfect. That is the whole core of the game.' },
    { title: 'Golden fish are wild', icon: '⭐', text: 'Golden fish join ANY color and double the points. Loop the blue fish together with the golden one!',
      stage() { const c = centre(); const a = blob(4, c.x - 70, c.y, 30, { color: 1 }); const g = put(c.x - 70, c.y, { kind: 'gold' }); const b = blob(4, c.x + 72, c.y, 28, { color: 0 }); scatter([2, 3, 4]); return { targets: [...a, g], need: 4, extra: b }; },
      catch: ev => (ev.golds > 0 && ev.n >= 3 ? 'done' : 'Include the golden fish in your loop with the blue ones.'),
      tangle: () => 'Keep the loop around the blue fish and the golden one only.',
      done: 'Doubled! Golden fish are great to hunt for.' },
    { title: 'Rainbow fish break the rules', icon: '🌈', text: 'One rainbow fish makes ANY loop valid, even with every color mixed. Loop them all, rainbow fish included!',
      stage() { const c = centre(); const t = [put(c.x, c.y, { kind: 'rainbow' }), ...blob(6, c.x, c.y, 56, i => ({ color: [0, 1, 2][i % 3] }))]; scatter([3, 4, 3, 4]); return { targets: t, need: 5 }; },
      catch: ev => (ev.wild && ev.n >= 5 ? 'done' : 'Loop the whole mixed group with the rainbow fish inside.'),
      tangle: () => 'Make sure the rainbow fish is inside your loop.',
      done: 'Any mix, no tangle. Rainbow fish also fill the Frenzy bar faster.' },
    { title: 'Puffer fish are bombs', icon: '💣', text: 'Loop just the puffer. It blows up every fish near it, whatever their color!',
      stage() { const c = centre(); const bomb = put(c.x, c.y, { kind: 'bomb', color: 0 }); const ring = []; for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; ring.push(put(c.x + Math.cos(a) * 82, c.y + Math.sin(a) * 82, { color: [1, 2, 3, 4][i % 4] })); } scatter([0, 1, 2]); return { targets: [bomb], need: 1, extra: ring, radius: 52 }; },
      catch: ev => (ev.booms > 0 ? 'done' : 'Loop only the puffer.'),
      tangle: () => 'Loop only the puffer. The neighbors go off with it.',
      done: 'BOOM! Great for clearing a crowded board in one go.' },
    { title: 'You are ready!', icon: '🎣', info: true,
      text: 'A few more things you will meet:',
      list: [['⏱️', 'Clock fish slow time down.'], ['💰', 'Treasure fish pay coins, but swim off fast.'], ['👑', 'The King is worth a fortune: loop it before it leaves.'],
        ['🔥', 'Catches fill the Frenzy bar. When it is full, 8 seconds of double points!'], ['🌊', 'Keep an eye on the pond. If it fills up, the run is over.']] },
  ];

  // ---------- the overlay: a dimmed screen with a spotlight, a hint finger and a small card ----------
  const root = document.createElement('div');
  root.id = 'practice'; root.className = 'hidden';
  root.innerHTML = '<canvas></canvas><div class="p-card bot"><div class="p-top"><span class="p-step"></span><button class="p-exit hidden">Exit</button></div><h3></h3><p></p><ul class="p-list hidden"></ul><div class="p-fb"></div><div class="p-dots"></div><button class="btn p-go hidden">Start playing</button></div>';
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d'), card = root.querySelector('.p-card');
  const q = s => root.querySelector(s);
  // CrazyGames build: a first-time player does only the CORE steps (loop a group, big loops, the colour rule) and then drops straight into a real run.
  // The golden / rainbow / puffer / "ready" steps are still in the replay (the ? page); the real run teaches them as one-line tips (see the end of this file).
  const CORE = 4;
  const total = () => (replay ? STEPS.length : CORE);
  const buildDots = () => { q('.p-dots').innerHTML = Array.from({ length: total() }, () => '<i></i>').join(''); };

  const css = document.createElement('style');
  css.textContent = `
    #practice { position: fixed; inset: 0; z-index: 3; pointer-events: none; }
    #practice.hidden { display: none; }
    #practice canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .p-card { position: absolute; left: 50%; transform: translateX(-50%); width: min(360px, calc(100% - 24px)); background: #fff; color: var(--deep); border-radius: 20px; padding: 10px 16px 12px;
      box-shadow: 0 8px 0 rgba(0,0,0,.2), 0 0 0 3px rgba(255,216,77,.85); pointer-events: auto; transition: top .4s ease, bottom .4s ease, box-shadow .2s; display: flex; flex-direction: column; gap: 4px; text-align: center; }
    .p-card.bot { bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); }
    .p-card.top { top: calc(env(safe-area-inset-top, 0px) + 122px); }
    .p-card.ok { box-shadow: 0 8px 0 rgba(0,0,0,.2), 0 0 0 3px #2a9d8f; }
    .p-top { display: flex; align-items: center; justify-content: center; position: relative; }
    .p-step { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #e08a00; text-transform: uppercase; }
    .p-exit { position: absolute; right: 0; font: inherit; font-weight: 700; font-size: 12px; border: 0; border-radius: 999px; padding: 2px 10px; background: #e6eff2; color: var(--deep); cursor: pointer; }
    .p-card h3 { font-size: 20px; line-height: 1.1; }
    .p-card p { font-size: 14px; color: #3d6670; line-height: 1.3; }
    .p-fb { min-height: 17px; font-size: 13px; font-weight: 700; color: #c0392b; line-height: 1.25; }
    .p-card.ok .p-fb { color: #1d7a6f; }
    .p-dots { display: flex; gap: 6px; justify-content: center; }
    .p-dots i { width: 7px; height: 7px; border-radius: 50%; background: #cfe3e8; transition: all .2s; }
    .p-dots i.on { width: 20px; border-radius: 4px; background: #2a9d8f; }
    .p-dots i.did { background: #2a9d8f; }
    .p-list { list-style: none; text-align: left; display: flex; flex-direction: column; gap: 5px; font-size: 13px; padding: 2px 0; }
    .p-list.hidden, .p-go.hidden, .p-exit.hidden { display: none; }
    .p-go { margin-top: 4px; }
  `;
  document.head.appendChild(css);

  // ---------- state ----------
  let active = false, idx = 0, cur = null, busy = 0, idle = 0, clock = 0, replay = false, raf = 0, last = 0, pending = null, W2 = 0, H2 = 0;
  const alive = f => !f.pop && !f.caught && fish.includes(f);
  const targets = () => (cur ? cur.targets.filter(alive) : []);

  function setCard() {
    const s = STEPS[idx];
    if (q('.p-dots').children.length !== total()) buildDots();
    q('.p-step').textContent = `Step ${idx + 1} of ${total()}`;
    q('h3').textContent = `${s.icon} ${s.title}`;
    q('p').textContent = s.text;
    const list = q('.p-list');
    list.classList.toggle('hidden', !s.list); list.innerHTML = (s.list || []).map(([i, t]) => `<li><span>${i}</span> ${t}</li>`).join('');
    q('.p-go').classList.toggle('hidden', !s.info);
    q('.p-fb').textContent = ''; card.classList.remove('ok');
    [...q('.p-dots').children].forEach((d, k) => { d.classList.toggle('on', k === idx); d.classList.toggle('did', k < idx); });
  }
  function stage(withRipples = true) {
    const s = STEPS[idx];
    for (const f of fish) if (!f.caught) f.pop = Math.max(f.pop || 0, 0.01); // anything left over fades away
    cur = s.info ? { targets: [], need: 0 } : s.stage();
    busy = 0; idle = 0;
  }
  function begin(from = 0, isReplay = false) {
    if (active) return;
    active = true; replay = isReplay; idx = from; pending = null;
    Meta.startPracticeRun({ onCatch, onTangle });
    root.classList.remove('hidden');
    q('.p-exit').classList.toggle('hidden', !replay);
    fish.length = 0;
    setCard(); stage();
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function finish() {
    const first = !S.practiceDone;
    active = false; cancelAnimationFrame(raf); root.classList.add('hidden');
    S.practiceDone = true;
    if (first) { S.coins += 100; S.stats.coinsEarned += 100; }
    Meta.save();
    Meta.endPracticeRun();
    if (first) setTimeout(() => Meta.toast('🎉 Nice! +100 coins'), 300);
    // a first-time player goes straight into a real run instead of landing on the menu
    if (first && !replay) setTimeout(() => document.getElementById('play').click(), 450);
  }
  function exit() { active = false; cancelAnimationFrame(raf); root.classList.add('hidden'); Meta.endPracticeRun(); }

  // ---------- reacting to what the player does ----------
  function result(r, s) {
    if (busy) return;
    if (r === 'done') {
      busy = 1.7; pending = 'next';
      card.classList.add('ok'); q('.p-fb').textContent = '✓ ' + (s.done || 'Great!');
      banner('👏 GREAT!', 'sweep');
    } else {
      busy = 1.6; pending = 'retry';
      q('.p-fb').textContent = r || 'Let us try that again.'; card.classList.remove('ok');
    }
  }
  function onCatch(ev) { const s = STEPS[idx]; if (s && !s.info) result(s.catch(ev), s); }
  function onTangle() { const s = STEPS[idx]; if (s && !s.info) result(s.tangle ? s.tangle() : 'Tangled! Loop one color at a time.', s); }
  q('.p-go').onclick = () => { Meta.sfx('click'); finish(); };
  q('.p-exit').onclick = () => { Meta.sfx('click'); exit(); };
  addEventListener('keydown', e => { if (active && STEPS[idx].info && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); finish(); } });

  // ---------- the loop: timers, safety net, drawing ----------
  function tick(dt) {
    if (!active) return;
    clock += dt; idle += dt;
    if (busy > 0) {
      busy -= dt;
      if (busy <= 0) {
        if (pending === 'next') { idx++; pending = null; if (idx >= total()) { finish(); return; } setCard(); stage(); } else { q('.p-fb').textContent = ''; stage(); }
        pending = null;
      }
    } else if (cur && cur.need && !fish.some(f => f.caught) && targets().length < cur.need) {
      // the player used up the exercise's fish some other way: set it up again
      q('.p-fb').textContent = 'Let us set that up again.'; busy = 1.0; pending = 'retry';
    }
  }
  function spot() { // where the spotlight goes: the centre of the fish still to catch
    const t = targets();
    if (!t.length) return null;
    let x = 0, y = 0; for (const f of t) { x += f.x; y += f.y; } x /= t.length; y /= t.length;
    let r = 0; for (const f of t) r = Math.max(r, Math.hypot(f.x - x, f.y - y));
    return { x: x * ZOOM, y: y * ZOOM, r: Math.max(cur.radius || 0, r + 42) * ZOOM }; // world -> screen px (this overlay canvas is not zoomed)
  }
  function draw() {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = innerWidth, h = innerHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const sp = spot();
    g.fillStyle = sp ? 'rgba(2,24,34,.6)' : 'rgba(2,24,34,.45)'; g.fillRect(0, 0, w, h);
    if (!sp) return;
    // a soft hole in the dimming
    g.globalCompositeOperation = 'destination-out';
    const hole = g.createRadialGradient(sp.x, sp.y, sp.r * 0.8, sp.x, sp.y, sp.r * 1.45);
    hole.addColorStop(0, 'rgba(0,0,0,1)'); hole.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hole; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    // a gold ring that breathes
    const pulse = 1 + Math.sin(clock * 3) * 0.04;
    g.strokeStyle = `rgba(255,216,77,${0.55 + 0.25 * Math.sin(clock * 3)})`; g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = -clock * 18;
    g.beginPath(); g.arc(sp.x, sp.y, sp.r * 1.02 * pulse, 0, 6.283); g.stroke(); g.setLineDash([]);
    // the hint finger traces the loop to draw (always on the first two steps, after a few idle seconds on the others)
    const hint = !busy && (idx < 2 || idle > 7) && !lasso;
    if (hint) {
      const T = 2.4, k = (clock % (T + 0.9)) / T, e = Math.min(1, k), R = sp.r * 0.95;
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); for (let a = 0; a <= e * 6.283; a += 0.12) { const px = sp.x + Math.cos(a - 1.57) * R, py = sp.y + Math.sin(a - 1.57) * R; a ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
      const a = e * 6.283 - 1.57; g.font = '34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.globalAlpha = k > 1 ? 0 : 1;
      g.fillText('👆', sp.x + Math.cos(a) * R + 8, sp.y + Math.sin(a) * R + 18); g.globalAlpha = 1;
    }
    // keep the card out of the way of what is being looked at
    const top = sp.y > innerHeight * 0.52;
    card.classList.toggle('top', top); card.classList.toggle('bot', !top);
  }
  function loop(now) {
    if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) { tick(dt); draw(); }
    raf = requestAnimationFrame(loop);
  }

  // ---------- entry points ----------
  Meta.startPractice = (from = 0) => begin(from, false);
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#replayPractice')) { Meta.sfx('click'); begin(0, true); } });
  Meta.Practice = { STEPS, begin, tick, state: () => ({ active, idx, busy, pending, targets: targets().length, score }) };

  // Anyone who already has finished games knows the ropes. Anyone else who got through the slides but not the practice does it now.
  if (S.practiceDone === undefined && S.stats.games > 0) { S.practiceDone = true; Meta.save(); }
  const hash = location.hash;
  if (hash === '#practice' || /^#practice\d$/.test(hash)) setTimeout(() => begin(hash.length > 9 ? +hash.slice(9) - 1 : 0, true), 500);
  else if (S.tutorialDone && !S.practiceDone && hash !== '#tutorial') setTimeout(() => begin(0, false), 150);

  // One-line tips in real runs, the first time each special fish shows up (shown once ever, saved in S.tips). They never pause or block the game.
  const TIPS = {
    gold: '⭐ Golden fish are wild: loop one with any single colour for double points.',
    rainbow: '🌈 Rainbow fish make ANY loop valid, even with every colour mixed. Grab it!',
    bomb: '💣 Puffer fish blow up every fish near them. Loop just the puffer.',
    king: '👑 The King is worth a fortune. Loop it before it leaves!',
    clock: '⏱️ Clock fish slow time down. Loop one for breathing room.',
    treasure: '💰 Treasure fish pay coins, but swim off fast.',
  };
  setInterval(() => {
    if (active || practice || state !== 'play' || paused) return;
    S.tips = S.tips || {};
    for (const f of fish) {
      const k = f.color === 'gold' ? 'gold' : f.kind;
      if (TIPS[k] && !S.tips[k] && !f.pop && !f.rise) {
        S.tips[k] = 1; Meta.save();
        Meta.toast(TIPS[k]);
        return; // one tip per tick, so two new fish never stack two cards
      }
    }
  }, 700);

  // Test: a bot plays every step (stepping the game by hand), logging each result. Used for headless checks.
  if (hash === '#practicetest') setTimeout(() => {
    const logs = []; const P = Meta.Practice;
    begin(0, true);
    const step = (frames = 100) => { for (let i = 0; i < frames; i++) { time += 1 / 60; updateFish(1 / 60); tick(1 / 60); } };
    const loopAround = (x, y, r) => { const pts = []; for (let a = 0; a < 6.3; a += 0.25) pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }); const res = judge(pts); res.clean ? catchFish(res, pts) : tangle(res.caught, pts); return res; };
    const sp = () => spot();
    for (let n = 0; n < 12 && active; n++) {
      const st = P.state(), s = STEPS[st.idx]; if (s.info) break;
      const c = sp(); let res;
      if (s.title.startsWith('One color')) res = loopAround(centre().x, centre().y, 115);           // both groups: a tangle
      else if (s.title.startsWith('Now loop')) res = loopAround(centre().x - 52, centre().y, 40);   // one group
      else if (s.title.startsWith('Puffer')) res = loopAround(c.x, c.y, 38);                          // just the bomb
      else res = loopAround(c.x, c.y, c.r + 4);
      step(150);
      logs.push(`step ${st.idx + 1} ${s.title}: caught ${res.caught.length}, clean ${res.clean} -> now step ${P.state().idx + 1}, busy ${P.state().busy.toFixed(1)}`);
      step(130);
    }
    logs.push('ended on step ' + (P.state().idx + 1) + ' of ' + STEPS.length + ', info card: ' + !!STEPS[P.state().idx].info);
    const coins0 = S.coins; q('.p-go').click();
    logs.push(`after Start playing: practiceDone ${S.practiceDone}, state ${state}, menu hidden ${$('menu').classList.contains('hidden')}, hud hidden ${$('hud').classList.contains('hidden')}, practice object cleared ${practice === null}, coins +${S.coins - coins0}, fish behind menu ${fish.length}`);
    for (const l of logs) console.log('PRACTICE ' + l);
  }, 900);
})();
