/* Settings: one panel, opened from the gear on the home screen and from the pause menu (Meta.openSettings).
   Everything is saved in S.settings and takes effect immediately, so you can listen to the music change while the panel is open.
   Music: on/off, volume, tempo (Relaxed / Lively / Peppy), style (Auto = the mood of your skin, or force one), nature sounds.
   Sound: sound on/off (the old mute button), effects volume.  Feel: vibration, screen shake.  Game: purchase confirmations.
   Read elsewhere: music.js (music, musicVol, tempo, style, nature), game.js / home.js / minigames.js / fishing.js (shake),
   Sfx.setVolume (sfxVol), navigator.vibrate is swapped for a no-op when vibration is off. Needs game.js (Sfx), meta.js. */
(() => {
  const { S, el } = Meta;
  const DEFAULTS = { music: true, musicVol: 0.8, tempo: 'lively', style: 'auto', nature: true, sfxVol: 1, vibration: true, shake: true };
  S.settings = { ...DEFAULTS, ...S.settings };
  const cfg = S.settings;

  const realVibrate = navigator.vibrate ? navigator.vibrate.bind(navigator) : null;
  function apply() {
    if (Sfx.setVolume) Sfx.setVolume(cfg.sfxVol);
    if (realVibrate) navigator.vibrate = cfg.vibration ? realVibrate : () => false;
  }
  apply();

  const root = document.createElement('div');
  root.id = 'settingsScreen'; root.className = 'screen hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Settings');
  root.innerHTML = '<div class="card set-card"><h2>⚙️ Settings</h2><div class="set-list"></div><button class="btn" data-done>Done</button></div>';
  document.body.appendChild(root);
  const list = root.querySelector('.set-list');
  let open = false;

  const save = () => { Meta.save(); apply(); };
  const section = t => list.appendChild(el('h3', 'set-h', t));
  function row(label, hint) { const r = el('div', 'set-row'); r.appendChild(el('div', 'set-lab', `<b>${label}</b>${hint ? `<small>${hint}</small>` : ''}`)); list.appendChild(r); return r; }
  function toggle(label, hint, get, set) {
    const r = row(label, hint), b = el('button', 'set-switch');
    b.setAttribute('role', 'switch');
    const paint = () => { b.setAttribute('aria-checked', get() ? 'true' : 'false'); b.classList.toggle('on', !!get()); };
    b.onclick = () => { set(!get()); paint(); Meta.sfx('click'); save(); refresh(); };
    paint(); r.appendChild(b); return b;
  }
  function slider(label, key, hint) {
    const r = row(label, hint), wrap = el('div', 'set-slider'), inp = document.createElement('input'), val = el('span', 'set-val');
    inp.type = 'range'; inp.min = 0; inp.max = 100; inp.step = 5; inp.value = Math.round(cfg[key] * 100); inp.setAttribute('aria-label', label);
    const paint = () => { val.textContent = inp.value + '%'; inp.style.setProperty('--p', inp.value + '%'); };
    inp.oninput = () => { cfg[key] = inp.value / 100; paint(); apply(); };
    inp.onchange = () => { Meta.save(); if (key === 'sfxVol') { Sfx.init(); Meta.sfx('chest'); } };
    paint(); wrap.append(inp, val); r.appendChild(wrap);
  }
  function seg(label, key, opts, hint) {
    const r = row(label, hint), box = el('div', 'set-seg');
    for (const [id, text] of opts) {
      const b = el('button', 'set-opt', text);
      b.onclick = () => { cfg[key] = id; Meta.sfx('click'); save(); paint(); };
      b.dataset.id = id; box.appendChild(b);
    }
    const paint = () => box.querySelectorAll('.set-opt').forEach(b => b.classList.toggle('on', b.dataset.id === cfg[key]));
    paint(); r.appendChild(box);
  }

  function build() {
    list.innerHTML = '';
    section('🎵 Music');
    toggle('Music', 'Background music while you play and browse', () => cfg.music, v => { cfg.music = v; });
    slider('Music volume', 'musicVol');
    seg('Tempo', 'tempo', [['relaxed', 'Relaxed'], ['lively', 'Lively'], ['peppy', 'Peppy']], 'How fast the music moves');
    seg('Style', 'style', [['auto', 'Auto'], ['pond', 'Pond'], ['pasture', 'Pasture'], ['toybox', 'Toy box']], 'Auto picks the mood of the skin you play as');
    toggle('Nature sounds', 'Water, wind, crickets and birds under the music', () => cfg.nature, v => { cfg.nature = v; });
    section('🔊 Sound');
    toggle('Sound', 'Turn off to silence music and effects', () => !S.muted, v => { S.muted = !v; Sfx.muted = S.muted; const m = document.getElementById('mute'); if (m) m.textContent = S.muted ? '🔇' : '🔊'; if (S.muted) Sfx.scribbleStop(); });
    slider('Effects volume', 'sfxVol', 'Pops, catches and menu sounds');
    section('✋ Feel');
    if (realVibrate) toggle('Vibration', 'Little buzzes when you catch things', () => cfg.vibration, v => { cfg.vibration = v; });
    toggle('Screen shake', 'Turn off if big catches feel too jumpy', () => cfg.shake, v => { cfg.shake = v; });
    section('🛍️ Game');
    toggle('Ask before buying', 'Confirm coin purchases', () => !S.skipConfirm, v => { S.skipConfirm = !v; });
    const reset = el('button', 'btn small ghost', 'Reset settings to default');
    reset.onclick = () => { Object.assign(cfg, DEFAULTS); Meta.save(); apply(); Meta.sfx('click'); build(); };
    list.appendChild(reset);
  }
  function refresh() { /* hook for rows that depend on each other; none yet */ }

  Meta.openSettings = () => { if (open) return; open = true; build(); root.classList.remove('hidden'); Meta.sfx('click'); };
  function close() { if (!open) return; open = false; root.classList.add('hidden'); Meta.save(); }
  Meta.Settings = { isOpen: () => open, cfg, close };
  root.querySelector('[data-done]').onclick = close;
  root.addEventListener('pointerdown', e => { if (e.target === root) close(); });
  addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); } }, true); // Esc closes this, not the pause menu behind it

  // the two entry points
  for (const id of ['settingsBtn', 'pauseSettings']) { const b = document.getElementById(id); if (b) b.addEventListener('click', () => Meta.openSettings()); }

  if (location.hash === '#settings') setTimeout(() => { document.getElementById('daily')?.classList.add('hidden'); Meta.openSettings(); }, 500); // test hook

  const css = document.createElement('style');
  css.textContent = `
    #settingsScreen { z-index: 9; }
    .set-card { text-align: left; gap: 8px; max-height: 100%; }
    .set-card h2 { text-align: center; }
    .screen .card > .set-list { flex-shrink: 1; } /* the list scrolls so Done stays on screen */
    .set-list { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; min-height: 0; padding-right: 2px; }
    .set-h { font-size: 15px; color: #0f5465; margin: 8px 0 0; }
    .set-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #eef7fa; border-radius: 14px; padding: 8px 12px; flex-wrap: wrap; }
    .set-lab { display: flex; flex-direction: column; min-width: 0; flex: 1 1 130px; }
    .set-lab b { font-size: 15px; }
    .set-lab small { color: #5b8792; font-size: 12px; line-height: 1.2; }
    .set-switch { position: relative; flex: none; width: 48px; height: 28px; border: 0; border-radius: 999px; background: #b9cdd3; cursor: pointer; transition: background .15s; }
    .set-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform .15s; }
    .set-switch.on { background: #2a9d8f; }
    .set-switch.on::after { transform: translateX(20px); }
    .set-slider { display: flex; align-items: center; gap: 8px; flex: 1 1 140px; max-width: 200px; }
    .set-slider input { flex: 1; min-width: 0; accent-color: #2a9d8f; height: 28px; }
    .set-val { width: 38px; text-align: right; font-weight: 700; font-size: 13px; color: #0f5465; }
    .set-seg { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 100%; }
    .set-opt { flex: 1 1 auto; font: inherit; font-weight: 700; font-size: 13px; border: 2px solid #c9dbe0; border-radius: 10px; background: #fff; color: #0f5465; padding: 5px 8px; cursor: pointer; }
    .set-opt.on { background: #0f5465; border-color: #0f5465; color: #fff; }
    .icon-btn.gear { font-size: 17px; }
  `;
  document.head.appendChild(css);
})();
