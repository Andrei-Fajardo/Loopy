/* Loopy growth features: the loot Vault (a slot machine that charges as you play) and the placeholder Shop (real-money
   packs, with fake purchases until the game ships as an app with Google Play Billing).
   Needs meta.js and game.js loaded first. Registers its tabs through Meta.tabs / Meta.tabBadges. */
(() => {
  const $ = id => document.getElementById(id);
  const { S, el, fmt } = Meta;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const today = new Date().toISOString().slice(0, 10);

  // ---------- save ----------
  const DEF = { charge: 0, spins: 0, opened: 0, pity: 0, adDay: '', adCount: 0, last: [] };
  const V = S.vault = { ...DEF, ...S.vault };
  S.purchases = S.purchases || {};
  if (V.adDay !== today) { V.adDay = today; V.adCount = 0; }
  const MAX_SPINS = 5, CHARGE_PER_SPIN = 100, ADS_PER_DAY = 3;

  // ---------- charging ----------
  // Every fish caught, fishing catch, daily reward, mission claim, milestone and ad adds charge; 100 charge is one spin.
  Meta.vaultCharge = n => {
    const had = V.spins;
    V.charge += n;
    while (V.charge >= CHARGE_PER_SPIN && V.spins < MAX_SPINS) { V.charge -= CHARGE_PER_SPIN; V.spins++; }
    if (V.spins >= MAX_SPINS) V.charge = Math.min(V.charge, CHARGE_PER_SPIN - 1);
    if (V.spins > had) { Meta.toast(`🔐 Vault spin ready! (${V.spins})`); Meta.save(); }
  };

  // ---------- prizes ----------
  const lvScale = () => Math.min(2, 1 + S.level * 0.05); // capped at x2 (it used to reach x4 at level 60)
  const PRIZES = [
    { id: 'small', w: 40, sym: '🪙', label: 'Small coin pile', odds: '40%', make: () => ({ coins: Math.round(rand(80, 200) * lvScale()) }) },
    { id: 'mid', w: 20, sym: '💰', label: 'Big coin pile', odds: '20%', make: () => ({ coins: Math.round(rand(300, 600) * lvScale()) }) },
    { id: 'xp', w: 12, sym: '⭐', label: 'XP boost', odds: '12%', make: () => ({ xp: Math.round(rand(100, 200) * lvScale()) }) },
    { id: 'tok', w: 12, sym: '🎟️', label: 'Fishing tokens', odds: '12%', make: () => ({ tokens: Math.round(rand(6, 15)) }) },
    { id: 'cos', w: 10, sym: '🎩', label: 'A cosmetic you don\'t own', odds: '10%', make: () => ({ cosmetic: true }) },
    { id: 'free', w: 2, sym: '🎰', label: 'Free spin', odds: '2%', make: () => ({ spin: 1 }) },
    { id: 'jack', w: 4, sym: '💎', label: 'JACKPOT', odds: '4%', make: () => ({ coins: Math.round(2500 * lvScale()), tokens: 5 }) },
  ];

  // Decides and applies the prize; returns what to show.
  function roll() {
    let p;
    if (V.pity >= 5) p = PRIZES.find(x => x.id === 'cos'); // a cosmetic is guaranteed at least every 6th spin
    else { let r = Math.random() * PRIZES.reduce((a, x) => a + x.w, 0); p = PRIZES.find(x => (r -= x.w) < 0) || PRIZES[0]; }
    let res = p.make(), parts = [];
    if (res.cosmetic) {
      const name = Meta.grantRandomCosmetic();
      if (name) { V.pity = 0; parts.push(`🎩 ${name}`); }
      else { p = PRIZES[1]; res = p.make(); }
    } else V.pity++;
    if (res.coins) { S.coins += res.coins; S.stats.coinsEarned += res.coins; parts.push(`${fmt(res.coins)} coins`); }
    if (res.xp) { Meta.addXp(res.xp).forEach((u, i) => setTimeout(() => Meta.toast(u), 2600 * (i + 1))); parts.push(`${res.xp} XP`); }
    if (res.tokens) { S.fishing.tokens = (S.fishing.tokens || 0) + res.tokens; parts.push(`${res.tokens} 🎟️ tokens`); }
    if (res.spin) { V.spins = Math.min(MAX_SPINS, V.spins + res.spin); parts.push('1 free spin'); }
    return { p, text: parts.join(' + ') };
  }

  // ---------- the slot machine ----------
  const reels = [0, 1, 2].map(i => $('r' + i)), SYMS = ['🪙', '💰', '⭐', '🎟️', '🎩', '💎', '🎰'];
  let spinning = false;
  function spin() {
    if (spinning || V.spins <= 0) return;
    V.spins--; V.opened++;
    const res = roll();
    V.last = [res.text, ...V.last].slice(0, 5);
    Meta.save();
    spinning = true;
    $('vaultSpin').classList.remove('hidden');
    $('vaultAgain').classList.add('hidden'); $('vaultClose').classList.add('hidden');
    $('vaultMsg').textContent = '…';
    reels.forEach(r => { r.classList.remove('win'); r.classList.add('spin'); });
    const timers = reels.map(r => setInterval(() => { r.textContent = pick(SYMS); Meta.sfx('click'); }, 80));
    [900, 1400, 1900].forEach((t, i) => setTimeout(() => {
      clearInterval(timers[i]);
      reels[i].classList.remove('spin'); reels[i].classList.add('win');
      reels[i].textContent = res.p.sym;
      Meta.sfx('coin');
      if (i < 2) return;
      spinning = false;
      $('vaultMsg').textContent = res.text;
      Meta.sfx(res.p.id === 'jack' ? 'discovery' : res.p.id === 'cos' ? 'chest' : 'best');
      try { navigator.vibrate && navigator.vibrate(res.p.id === 'jack' ? [40, 40, 40, 40, 100] : [30, 30, 30]); } catch (e) {}
      $('vaultAgain').classList.toggle('hidden', V.spins <= 0);
      $('vaultAgain').textContent = `Spin again (${V.spins} left)`;
      $('vaultClose').classList.remove('hidden');
    }, t));
  }
  $('vaultAgain').onclick = spin;
  $('vaultClose').onclick = () => { $('vaultSpin').classList.add('hidden'); Meta.render(); };

  // ---------- Vault tab ----------
  Meta.tabBadges.vault = ['Vault', () => V.spins];
  Meta.tabs.vault = body => {
    body.appendChild(el('div', 'vault-head', `<b>🔐 Loot Vault · ${V.spins} / ${MAX_SPINS} spins</b>
      <div class="bar"><div style="width:${V.charge / CHARGE_PER_SPIN * 100}%"></div></div>
      <small>Charge ${V.charge} / ${CHARGE_PER_SPIN}. Every fish you catch adds 1, fishing +8, daily reward +25, missions +15, run milestones +10.</small>`));
    const go = el('button', 'btn', V.spins ? `Spin the vault (${V.spins})` : 'No spins yet');
    go.disabled = V.spins <= 0;
    go.onclick = () => { Meta.sfx('click'); spin(); };
    body.appendChild(go);
    const left = ADS_PER_DAY - V.adCount;
    const ad = el('button', 'btn ad small', left > 0 ? `▶ Watch ad: +50 charge (${left} left today)` : 'More charge tomorrow');
    ad.disabled = left <= 0;
    ad.onclick = () => Meta.Ads.rewarded('+50 vault charge', () => { V.adCount++; Meta.vaultCharge(50); Meta.save(); Meta.render(); });
    body.appendChild(ad);
    body.appendChild(el('p', 'chart-title', 'What\'s inside'));
    PRIZES.forEach(p => body.appendChild(el('div', 'prize-row', `<span>${p.sym} ${p.label}</span><span>${p.odds}</span>`)));
    body.appendChild(el('p', 'note', 'A cosmetic is guaranteed at least every 6th spin.'));
    if (V.last.length) {
      body.appendChild(el('p', 'chart-title', 'Recent prizes'));
      V.last.forEach(t => body.appendChild(el('div', 'prize-row', `<span>${t}</span><span></span>`)));
    }
  };

  // ---------- Shop tab (placeholder purchases) ----------
  const hasAll = ids => ids.every(id => S.skinsOwned.includes(id));
  const PRODUCTS = [
    { id: 'starter', name: 'Starter Pack', price: 1.99, once: true, icon: '🎁', tag: 'BEST FIRST BUY', desc: '1,000 coins, 3 vault spins and a random cosmetic.',
      grant: () => { S.coins += 1000; V.spins = Math.min(MAX_SPINS, V.spins + 3); Meta.grantRandomCosmetic(); } },
    { id: 'coins1', name: 'Handful of Coins', price: 0.99, icon: '🪙', desc: '600 coins.', grant: () => { S.coins += 600; } },
    { id: 'coins2', name: 'Pile of Coins', price: 4.99, icon: '💰', desc: '3,500 coins.', grant: () => { S.coins += 3500; } },
    { id: 'coins3', name: 'Chest of Coins', price: 9.99, icon: '🧰', tag: 'BEST VALUE', desc: '8,000 coins and a free vault spin.', grant: () => { S.coins += 8000; V.spins = Math.min(MAX_SPINS, V.spins + 1); } },
    { id: 'coins4', name: 'Hoard of Coins', price: 19.99, icon: '🏆', desc: '18,000 coins and 3 vault spins.', grant: () => { S.coins += 18000; V.spins = Math.min(MAX_SPINS, V.spins + 3); } },
    { id: 'spins', name: 'Vault Spins ×3', price: 0.99, icon: '🔐', desc: 'Three spins of the loot vault.', grant: () => { V.spins = Math.min(MAX_SPINS, V.spins + 3); } },
    { id: 'skins', name: 'Skin Bundle', price: 4.99, once: true, icon: '🐑', desc: 'Unlocks the Sheep and Toy balls skins at once.',
      grant: () => { for (const id of ['sheep', 'balls']) if (!S.skinsOwned.includes(id)) S.skinsOwned.push(id); Meta.refreshSkins(); } },
    { id: 'noads', name: 'Ad-free Perks', price: 3.99, once: true, icon: '🚫', desc: 'Rewarded boosts (revive, 2× coins, free coins, vault charge) apply instantly, with no ad to watch.',
      grant: () => { S.noAds = true; } },
  ];
  const owned = p => p.once && (S.purchases[p.id] || (p.id === 'skins' && hasAll(['sheep', 'balls'])));

  function buy(p) {
    if (owned(p)) return;
    Meta.confirmBuy({ name: p.name, desc: `${p.desc} (Test store: nothing is charged.)`, icon: `<span class="emoji" style="font-size:52px;line-height:1.4;display:block">${p.icon}</span>`, price: 0 }, () => {
      p.grant();
      S.purchases[p.id] = true;
      Meta.save();
      Meta.toast(`Purchased ${p.name}!`);
      Meta.sfx('chest');
      Meta.render();
    });
    // The popup is built for coin prices; show the money price instead.
    $('cfPrice').textContent = `$${p.price.toFixed(2)} · test purchase`;
    $('cfPrice').classList.remove('short');
    $('cfYes').textContent = 'Buy (test)';
  }
  Meta.tabs.shop = body => {
    body.appendChild(el('p', 'shop-note', '🧪 Test store: purchases here are placeholders and nothing is charged. Real purchases need the app version with Google Play Billing. Ads in the game are always optional.'));
    for (const p of PRODUCTS) {
      const got = owned(p);
      const row = el('div', 'upg', `<span class="how-ico" style="--c:#fff1b3">${p.icon}</span><div><b>${p.name}${p.tag && !got ? `<span class="tag">${p.tag}</span>` : ''}</b><small>${p.desc}</small></div>`);
      const b = el('button', 'btn small' + (got ? ' ghost' : ''), got ? 'Owned' : `$${p.price.toFixed(2)}`);
      b.disabled = got;
      b.onclick = () => buy(p);
      row.appendChild(b);
      body.appendChild(row);
    }
  };

  // ---------- test hooks: #vault opens the Vault tab with 3 spins; #shop opens the Shop tab ----------
  const hook = location.hash.slice(1);
  if (hook === 'vault') { V.spins = 3; document.querySelector('[data-tab=vault]').click(); $('daily').classList.add('hidden'); }
  if (hook === 'vaultspin') { V.spins = 2; $('daily').classList.add('hidden'); setTimeout(spin, 300); }
  if (hook === 'shop') { document.querySelector('[data-tab=shop]').click(); $('daily').classList.add('hidden'); }
})();
