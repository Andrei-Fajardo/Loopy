/* Loopy "feel good" layer: the full-screen level-up celebration and the achievements (a badge page plus unlock banners).
   Needs meta.js and game.js (Sfx, PENTA, state) loaded first. */
(() => {
  const $ = id => document.getElementById(id);
  const { S, fmt, el } = Meta;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  const css = document.createElement('style');
  css.textContent = `
    #lvUp { z-index: 10; background: radial-gradient(circle at 50% 40%, rgba(90,60,0,.9), rgba(3,22,32,.97) 70%); cursor: pointer; }
    #lvUp canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .lv-card { position: relative; z-index: 1; width: min(330px, 100%); text-align: center; color: #fff; display: flex; flex-direction: column; align-items: center; gap: 8px;
      animation: lvpop .5s cubic-bezier(.2,1.6,.4,1); }
    .lv-rays { position: absolute; width: 520px; height: 520px; top: -150px; left: 50%; margin-left: -260px; z-index: -1; opacity: .5; border-radius: 50%;
      background: repeating-conic-gradient(rgba(255,230,120,.55) 0 8deg, transparent 8deg 24deg); animation: lvspin 14s linear infinite;
      -webkit-mask-image: radial-gradient(circle, #000 20%, transparent 68%); mask-image: radial-gradient(circle, #000 20%, transparent 68%); }
    .lv-title { font-size: 26px; font-weight: 700; letter-spacing: 3px; color: #ffe08a; text-shadow: 0 3px 0 #0b3a4a; }
    .lv-badge { width: 150px; height: 150px; border-radius: 50%; display: grid; place-items: center; font-size: 78px; font-weight: 700; color: #0b3a4a;
      background: radial-gradient(circle at 35% 30%, #fff6c9, #ffd84d 55%, #e0a400); box-shadow: 0 0 0 6px #fff, 0 0 40px 10px rgba(255,216,77,.6), 0 10px 0 rgba(0,0,0,.25); }
    .lv-reward { font-size: 22px; font-weight: 700; text-shadow: 0 2px 0 #0b3a4a; }
    .lv-unlock { font-size: 15px; background: rgba(255,255,255,.14); border: 2px solid rgba(255,255,255,.35); border-radius: 14px; padding: 6px 12px; }
    .lv-hint { font-size: 13px; opacity: .7; }
    @keyframes lvpop { 0% { transform: scale(.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes lvspin { to { transform: rotate(360deg); } }
    #achPop { position: fixed; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 12px); transform: translate(-50%, -140%); z-index: 11; width: min(340px, calc(100% - 24px));
      display: flex; align-items: center; gap: 12px; background: linear-gradient(#fffbe8, #fff1b8); color: var(--deep); border-radius: 18px; padding: 10px 14px;
      border: 3px solid #ffd84d; box-shadow: 0 8px 0 rgba(0,0,0,.2); transition: transform .45s cubic-bezier(.2,1.4,.4,1), visibility 0s .45s; pointer-events: none; visibility: hidden; }
    #achPop.show { transform: translate(-50%, 0); visibility: visible; transition-delay: 0s; } /* hidden means hidden: its shadow used to peek in along the top edge */
    #achPop .ai { font-size: 34px; } #achPop b { display: block; font-size: 17px; } #achPop small { color: #7a5a00; font-weight: 700; font-size: 13px; }
    .ach-row { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; background: #fff; border: 2px solid #d3e8ed; border-radius: 14px; padding: 8px 10px; }
    .ach-row.done { background: linear-gradient(#fffbe8, #fff3c4); border-color: #ffd84d; }
    .ach-row .ai { width: 42px; height: 42px; display: grid; place-items: center; font-size: 24px; background: #eaf3f5; border-radius: 12px; }
    .ach-row.done .ai { background: #ffe9a0; }
    .ach-row b { display: block; font-size: 15px; line-height: 1.15; } .ach-row small { display: block; font-size: 12.5px; color: #5b8792; }
    .ach-row .bar { height: 7px; background: #d8ebef; margin-top: 4px; } .ach-row .bar > span { display: block; height: 100%; background: #2a9d8f; border-radius: 4px; }
    .ach-row.done .bar > span { background: #e0a400; }
    .ach-row .rw { font-size: 13px; font-weight: 700; color: #c98a00; white-space: nowrap; }
    .ach-head { background: #fff; border: 2px solid #d3e8ed; border-radius: 14px; padding: 10px 12px; text-align: center; }
    .ach-head b { font-size: 20px; } .ach-head .bar { margin-top: 6px; background: #d8ebef; } .ach-head .bar > div { height: 100%; background: linear-gradient(90deg, #ffb347, #ffd84d); border-radius: 5px; }
    @media (prefers-reduced-motion: reduce) { .lv-card, .lv-rays { animation: none; } }
  `;
  document.head.appendChild(css);

  // ================= level-up celebration =================
  const lv = document.createElement('div');
  lv.id = 'lvUp'; lv.className = 'screen hidden'; lv.setAttribute('role', 'dialog'); lv.setAttribute('aria-label', 'Level up');
  lv.innerHTML = '<canvas></canvas><div class="lv-card"><div class="lv-rays"></div><div class="lv-title">LEVEL UP!</div><div class="lv-badge"></div><div class="lv-reward"></div><div class="lv-unlock hidden"></div><div class="lv-hint">Tap to continue</div></div>';
  document.body.appendChild(lv);
  const lvc = lv.querySelector('canvas'), lvg = lvc.getContext('2d');
  let queue = [], showing = false, bits = [], raf = 0, lastT = 0;
  const COLORS = ['#ff6b6b', '#ffb347', '#ffd84d', '#7bd389', '#4cc9f0', '#c86bfa', '#ff8fb8', '#ffffff'];

  function confettiLoop(now) {
    if (lv.classList.contains('hidden')) return;
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const w = lvc.width, h = lvc.height;
    lvg.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 380 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt;
      lvg.save(); lvg.translate(b.x, b.y); lvg.rotate(b.r); lvg.fillStyle = b.c; lvg.fillRect(-b.s, -b.s * 0.5, b.s * 2, b.s); lvg.restore();
    }
    bits = bits.filter(b => b.y < h + 30);
    raf = requestAnimationFrame(confettiLoop);
  }
  function burst(n, y = 0.35) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (let i = 0; i < n; i++) bits.push({ x: lvc.width * rand(0.1, 0.9), y: lvc.height * y, vx: rand(-260, 260) * dpr, vy: rand(-620, -120) * dpr, r: rand(0, 6), vr: rand(-9, 9), s: rand(4, 8) * dpr, c: pick(COLORS) });
  }
  function nextLevel() {
    const e = queue.shift();
    if (!e) { showing = false; lv.classList.add('hidden'); cancelAnimationFrame(raf); Meta.render(); return; }
    showing = true;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    lvc.width = innerWidth * dpr; lvc.height = innerHeight * dpr;
    lv.querySelector('.lv-badge').textContent = e.level;
    lv.querySelector('.lv-reward').textContent = `+${fmt(e.reward)} coins`;
    const u = lv.querySelector('.lv-unlock');
    u.classList.toggle('hidden', !e.unlocked.length);
    u.textContent = e.unlocked.length ? `🎁 New in the store: ${e.unlocked.join(', ')}` : '';
    lv.classList.remove('hidden');
    const card = lv.querySelector('.lv-card'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    bits = []; burst(70); setTimeout(() => burst(50, 0.3), 350);
    [0, 2, 4, 7, 9, 12].forEach((k, i) => Sfx.tone(PENTA[k + 4], 0.35, { type: 'triangle', vol: 0.09, delay: i * 0.09, echo: true }));
    Sfx.tone(PENTA[0] * 0.5, 0.7, { vol: 0.12, delay: 0.1 });
    buzz([30, 40, 30, 40, 90]);
    lastT = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(confettiLoop);
  }
  Meta.onLevelUp = events => { queue.push(...events); if (!showing) setTimeout(nextLevel, 450); };
  lv.addEventListener('click', () => { if (showing) { Meta.sfx('click'); nextLevel(); } });
  addEventListener('keydown', e => { if (showing && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); nextLevel(); } });

  // ================= achievements =================
  const st = () => S.stats, fish = () => S.fishing || {}, mg = k => (S.minigames || {})[k] || {};
  const albumTotal = () => ['fish', 'sheep', 'balls'].reduce((a, sk) => a + Meta.albumCount(sk), 0);
  const legendaries = () => Object.keys(S.album).filter(id => (Meta.speciesOf('fish')[id] || {}).rar === 'L').length;
  const ACH = [
    { id: 'first', icon: '🎣', name: 'First Catch', desc: 'Catch your first fish', goal: 1, get: () => st().fish, reward: 25 },
    { id: 'fish100', icon: '🐟', name: 'Hundred Club', desc: 'Catch 100 fish', goal: 100, get: () => st().fish, reward: 100 },
    { id: 'fish1k', icon: '🐠', name: 'Fish Fiesta', desc: 'Catch 1,000 fish', goal: 1000, get: () => st().fish, reward: 400 },
    { id: 'fish10k', icon: '🐋', name: 'Ocean Emptier', desc: 'Catch 10,000 fish', goal: 10000, get: () => st().fish, reward: 1500 },
    { id: 'big10', icon: '⭕', name: 'Big Loop', desc: 'Catch 10 fish in one loop', goal: 10, get: () => st().biggest, reward: 100 },
    { id: 'big20', icon: '🌀', name: 'Huge Loop', desc: 'Catch 20 fish in one loop', goal: 20, get: () => st().biggest, reward: 300 },
    { id: 'combo5', icon: '🔥', name: 'Combo Cadet', desc: 'Reach a ×5 combo', goal: 5, get: () => st().bestCombo, reward: 80 },
    { id: 'combo12', icon: '☄️', name: 'Combo King', desc: 'Reach a ×12 combo', goal: 12, get: () => st().bestCombo, reward: 300 },
    { id: 'sweep10', icon: '🧹', name: 'Clean Sweeper', desc: 'Get 10 clean sweeps', goal: 10, get: () => st().sweeps, reward: 150 },
    { id: 'frenzy10', icon: '⚡', name: 'Frenzy Fan', desc: 'Trigger Frenzy 10 times', goal: 10, get: () => st().frenzies, reward: 150 },
    { id: 'king3', icon: '👑', name: 'Royal Catch', desc: 'Catch the King 3 times', goal: 3, get: () => st().kings, reward: 200 },
    { id: 'gold25', icon: '⭐', name: 'Gold Digger', desc: 'Catch 25 golden fish', goal: 25, get: () => st().golds, reward: 150 },
    { id: 'games10', icon: '🎮', name: 'Regular', desc: 'Play 10 games', goal: 10, get: () => st().games, reward: 100 },
    { id: 'album10', icon: '📖', name: 'Collector', desc: 'Fill 10 album spots (any skin)', goal: 10, get: albumTotal, reward: 100 },
    { id: 'album30', icon: '📚', name: 'Curator', desc: 'Fill 30 album spots', goal: 30, get: albumTotal, reward: 250 },
    { id: 'album60', icon: '🏛️', name: 'Museum Owner', desc: 'Fill 60 album spots', goal: 60, get: albumTotal, reward: 600 },
    { id: 'legend', icon: '✨', name: 'Legend Hunter', desc: 'Catch a Legendary fish', goal: 1, get: legendaries, reward: 300 },
    { id: 'sheep', icon: '🐑', name: 'Shepherd', desc: 'Unlock the Sheep skin', goal: 1, get: () => +S.skinsOwned.includes('sheep'), reward: 100 },
    { id: 'balls', icon: '🏀', name: 'Toy Collector', desc: 'Unlock the Toy balls skin', goal: 1, get: () => +S.skinsOwned.includes('balls'), reward: 100 },
    { id: 'angler', icon: '🪝', name: 'Angler', desc: 'Reel in 25 catches while fishing', goal: 25, get: () => fish().catches || 0, reward: 100 },
    { id: 'perfect10', icon: '🎯', name: 'Perfect Angler', desc: 'Land 10 perfect fishing catches', goal: 10, get: () => fish().perfects || 0, reward: 200 },
    { id: 'chest3', icon: '🧰', name: 'Treasure Finder', desc: 'Open 3 treasure chests', goal: 3, get: () => fish().chests || 0, reward: 150 },
    { id: 'sleepy', icon: '🌙', name: 'Sleepyhead', desc: 'Count 20 sheep in one night', goal: 20, get: () => mg('sheep').best || 0, reward: 150 },
    { id: 'bop100', icon: '🏐', name: 'Bop Master', desc: 'Bop 100 balls in one round', goal: 100, get: () => mg('balls').best || 0, reward: 150 },
    { id: 'streak7', icon: '📅', name: 'Daily Devotee', desc: 'Play 7 days in a row', goal: 7, get: () => S.streak, reward: 200 },
    { id: 'lvl10', icon: '🔟', name: 'Level 10', desc: 'Reach level 10', goal: 10, get: () => S.level, reward: 200 },
    { id: 'rich', icon: '💰', name: 'Big Spender', desc: 'Earn 10,000 coins in total', goal: 10000, get: () => st().coinsEarned, reward: 150 },
  ];
  S.ach = S.ach || null; // { id: time unlocked }
  const done = a => !!(S.ach && S.ach[a.id]);
  const popQ = []; let popBusy = false;
  const pop = document.createElement('div');
  pop.id = 'achPop'; document.body.appendChild(pop);
  function nextPop() {
    const p = popQ.shift();
    if (!p) { popBusy = false; return; }
    popBusy = true;
    pop.innerHTML = `<span class="ai">${p.icon}</span><div><small>🏅 ACHIEVEMENT UNLOCKED</small><b>${p.name}</b><small>${p.sub}</small></div>`;
    pop.classList.add('show');
    [0, 4, 7].forEach((k, i) => Sfx.tone(PENTA[k + 7], 0.25, { type: 'triangle', vol: 0.08, delay: i * 0.08, echo: true }));
    buzz([20, 30, 20]);
    setTimeout(() => { pop.classList.remove('show'); setTimeout(nextPop, 500); }, 3100);
  }
  const announce = p => { popQ.push(p); if (!popBusy) nextPop(); };

  function check() {
    if (typeof state !== 'undefined' && state === 'play') return; // celebrate between runs, not mid-loop
    if (!$('over').classList.contains('hidden')) return;        // and let the game-over screen finish first
    const fresh = ACH.filter(a => !done(a) && a.get() >= a.goal);
    if (!fresh.length) return;
    const first = S.ach === null; // the very first check: credit what the player's history already earned, in one summary
    S.ach = S.ach || {};
    let coins = 0;
    for (const a of fresh) { S.ach[a.id] = Date.now(); coins += a.reward; }
    S.coins += coins; S.stats.coinsEarned += coins;
    Meta.save();
    if (first && fresh.length > 2) announce({ icon: '🏅', name: `${fresh.length} achievements from your history!`, sub: `+${fmt(coins)} coins` });
    else for (const a of fresh) announce({ icon: a.icon, name: a.name, sub: `+${fmt(a.reward)} coins` });
    Meta.render();
  }
  if (S.ach === null) { S.ach = null; } // stays null until the first check so the summary logic can tell
  setInterval(check, 1200);
  setTimeout(check, 1500);

  Meta.tabs.ach = body => {
    const n = ACH.filter(done).length;
    body.appendChild(el('div', 'ach-head', `<b>🏅 ${n} / ${ACH.length}</b><div class="bar"><div style="width:${n / ACH.length * 100}%"></div></div>`));
    const rows = [...ACH].sort((a, b) => done(a) - done(b) || (b.get() / b.goal) - (a.get() / a.goal)); // closest to done first, finished ones last
    for (const a of rows) {
      const v = Math.min(a.get(), a.goal), d = done(a);
      body.appendChild(el('div', 'ach-row' + (d ? ' done' : ''),
        `<span class="ai">${a.icon}</span><div><b>${a.name}</b><small>${a.desc}${d ? '' : ` · ${fmt(v)} / ${fmt(a.goal)}`}</small><div class="bar"><span style="width:${v / a.goal * 100}%"></span></div></div><span class="rw">${d ? '✓' : '+' + fmt(a.reward)}</span>`));
    }
  };
  Meta.checkAchievements = check;

  // test hooks: #levelup shows the celebration, #achievements opens the page
  const hook = location.hash.slice(1);
  if (hook === 'levelup') setTimeout(() => Meta.onLevelUp([{ level: 12, reward: 290, unlocked: ['Crown', 'Rainbow Rope'] }]), 600);
  if (hook === 'achievements') { document.querySelector('[data-tab=ach]').click(); $('daily').classList.add('hidden'); }
})();
