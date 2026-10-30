/* Loopy's soundtrack: slow, warm, atmospheric background music, synthesized live with Web Audio (no audio files, so nothing to license
   and nothing to download). The feel is cozy farm-life: fingerpicked guitar, soft piano and music box, a breathy flute, slow strings,
   a wide reverb, and quiet ambient beds (water, wind, crickets, birds). Melodies are short phrases that return and change slightly,
   with plenty of rests, instead of random notes.
   One mood per skin:  pond (fish) = piano arpeggios, water, in D;  pasture (sheep) = fingerpicked guitar and flute in a 6/8 lilt, in G;
   toybox (balls) = music box and strings, in C.
   Where it plays: the collection page (mood of the tab; the Basket toss round a little livelier), a run (mood of the skin; livelier with a
   combo, brightest in Frenzy), and the menu (softest). It stays silent during Count Sheep and Fishing (they have their own sound), when
   paused, when the tab is hidden or when sound is muted. Needs game.js (Sfx, Meta.runInfo); Meta.homeInfo comes from home.js.
   Tune the base loudness with MUSIC_VOL. Everything else is a player setting (settings.js): music on/off, volume, tempo (Relaxed 1x,
   Lively 0.55x = the default, Peppy 0.43x), style (auto or a forced mood) and nature sounds.
   The same engine also makes a few soft sound effects (Meta.Music.chargeWind / chargeGo for charging sheep: hoof thumps and a rush of air) on their own bus, so they
   follow the effects volume and still play when the music is off. */
(() => {
  const MUSIC_VOL = 0.8;
  const ring = () => M.ring || 2; // how long a plucked note rings: shorter when the music is faster
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cfg = () => (Meta.S && Meta.S.settings) || {};
  const TEMPO = { relaxed: 0.85, lively: 0.55, peppy: 0.43 }; // multiplies each mood's eighth-note length (smaller = faster)
  const M = { gen: null, tempoKey: undefined, c: null, bus: null, send: null, fxBus: null, fxSend: null, nb: null, cur: null, switchAt: 0, next: 0, bar: 0, motif: null, beds: null, started: false };

  // ---------- plumbing: a bus, a soft reverb, and the beds ----------
  function newGen() { // one gain for the music's notes and one for their reverb send
    const c = M.c, g = c.createGain(), sg = c.createGain(); g.connect(M.bus); sg.connect(M.send); return { g, sg };
  }
  // Notes are scheduled up to a bar ahead, so to change tempo right away the queued notes are silenced and a new bar starts now.
  function setEcho(sd) { // quarter note, dotted quarter, dotted half
    if (!M.echo || M.echoSd === sd) return; M.echoSd = sd; const now = M.c.currentTime;
    [sd * 2, sd * 3, sd * 6].forEach((t, i) => M.echo[i].delayTime.setTargetAtTime(clamp(t, 0.12, 1.9), now, 0.25));
  }
  function restart() {
    if (!M.c || !M.gen) return; const now = M.c.currentTime, old = M.gen;
    old.g.gain.setTargetAtTime(0, now, 0.05); old.sg.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(() => { try { old.g.disconnect(); old.sg.disconnect(); } catch (e) {} }, 6000);
    M.gen = newGen(); M.next = now + 0.06; M.motif = null;
  }
  function init() {
    if (M.bus) return true;
    const c = Sfx.ctx; if (!c || !Sfx.out) return false;
    M.c = c;
    M.bus = c.createGain(); M.bus.gain.value = 0; M.bus.connect(Sfx.comp || Sfx.out);
    M.send = c.createGain();
    M.gen = newGen();
    const wet = c.createGain(); wet.gain.value = 0.55; wet.connect(M.bus);
    M.echo = [];
    for (const [d, fb, lpf] of [[0.19, 0.36, 2600], [0.31, 0.3, 2000], [0.47, 0.26, 1500]]) { // three delays with darkening feedback sound like a hall; their times follow the tempo (setEcho)
      const dl = c.createDelay(2), lp = c.createBiquadFilter(), g = c.createGain(); M.echo.push(dl);
      dl.delayTime.value = d; lp.type = 'lowpass'; lp.frequency.value = lpf; g.gain.value = fb;
      M.send.connect(dl); dl.connect(lp); lp.connect(g); g.connect(dl); lp.connect(wet);
    }
    // ambient beds: looping noise (water, wind) and crickets, each with its own level that follows the mood
    const nb = M.nb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0, y = 0; i < nd.length; i++) { y = y * 0.6 + (Math.random() * 2 - 1) * 0.4; nd[i] = y; }
    const bed = (type, freq, q, lfoHz, lfoAmt) => {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), mod = c.createGain(), lvl = c.createGain();
      s.buffer = nb; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; mod.gain.value = 0.6; lvl.gain.value = 0;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = lfoHz; lg.gain.value = lfoAmt; lfo.connect(lg); lg.connect(mod.gain); lfo.start();
      s.connect(f); f.connect(mod); mod.connect(lvl); lvl.connect(M.bus); s.start();
      return lvl;
    };
    const cr = (() => {
      const o = c.createOscillator(), g1 = c.createGain(), g2 = c.createGain(), lvl = c.createGain(), l1 = c.createOscillator(), l1g = c.createGain(), l2 = c.createOscillator(), l2g = c.createGain();
      o.type = 'sine'; o.frequency.value = 4300; g1.gain.value = 0.5; g2.gain.value = 0.5; lvl.gain.value = 0;
      l1.frequency.value = 6.4; l1g.gain.value = 0.5; l1.connect(l1g); l1g.connect(g1.gain); l1.start();
      l2.frequency.value = 0.21; l2g.gain.value = 0.5; l2.connect(l2g); l2g.connect(g2.gain); l2.start();
      o.connect(g1); g1.connect(g2); g2.connect(lvl); lvl.connect(M.bus); o.start();
      return lvl;
    })();
    M.fxBus = c.createGain(); M.fxBus.gain.value = 1; M.fxBus.connect(Sfx.out);
    M.fxSend = c.createGain();
    const fwet = c.createGain(); fwet.gain.value = 0.5; fwet.connect(M.fxBus);
    for (const [d, fb, lpf] of [[0.17, 0.4, 2400], [0.29, 0.34, 1700]]) {
      const dl = c.createDelay(1), lp = c.createBiquadFilter(), g = c.createGain();
      dl.delayTime.value = d; lp.type = 'lowpass'; lp.frequency.value = lpf; g.gain.value = fb;
      M.fxSend.connect(dl); dl.connect(lp); lp.connect(g); g.connect(dl); lp.connect(fwet);
    }
    M.beds = { water: bed('bandpass', 900, 0.5, 0.13, 0.4), wind: bed('lowpass', 420, 0.7, 0.07, 0.5), crickets: cr };
    return true;
  }
  const route = (node, wet, pan = 0, fx = false) => {
    const c = M.c; let out = node;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; node.connect(p); out = p; }
    out.connect(fx ? M.fxBus : M.gen.g);
    if (wet) { const s = c.createGain(); s.gain.value = wet; out.connect(s); s.connect(fx ? M.fxSend : M.gen.sg); }
  };
  // one oscillator with a gentle envelope, optional filter and vibrato
  function voice(type, f, t, dur, { vol, atk = 0.01, rel = dur * 0.8, lp = 0, wet = 0.4, det = 0, vib = 0, pan = 0, to = 0, fx = false }) {
    const c = M.c, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = det;
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.9); // a glide
    const v = Math.max(vol, 0.0003);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + atk);
    g.gain.setValueAtTime(v, t + Math.max(atk + 0.01, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let head = o;
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); head = fl; }
    head.connect(g); route(g, wet, pan, fx);
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.2 + Math.random(); lg.gain.value = vib; l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(t + dur + 0.1); }
    o.start(t); o.stop(t + dur + 0.1);
  }
  // ---------- instruments ----------
  const guitar = (m, t, vol, pan) => { const f = mtof(m), d = Math.min(1.3, ring() * 0.65 + 0.2); voice('triangle', f, t, d, { vol, atk: 0.004, rel: d * 0.95, lp: 2300, wet: 0.3, pan }); voice('sine', f * 2, t, d * 0.35, { vol: vol * 0.3, atk: 0.003, rel: d * 0.3, wet: 0.25, pan }); };
  const piano = (m, t, vol, pan) => { const f = mtof(m), d = Math.min(2.2, ring()); voice('sine', f, t, d, { vol, atk: 0.006, rel: d * 0.95, lp: 3400, wet: 0.45, pan }); voice('sine', f * 2, t, d * 0.4, { vol: vol * 0.38, atk: 0.004, rel: d * 0.38, wet: 0.45, pan }); voice('triangle', f * 3, t, 0.25, { vol: vol * 0.1, atk: 0.003, rel: 0.22, wet: 0.35, pan }); };
  const bell = (m, t, vol, pan) => { const f = mtof(m), d = Math.min(1.8, ring() * 0.9); voice('sine', f, t, d, { vol, atk: 0.004, rel: d * 0.97, wet: 0.6, pan }); voice('sine', f * 2.76, t, d * 0.4, { vol: vol * 0.25, atk: 0.003, rel: d * 0.36, wet: 0.5, pan }); voice('sine', f * 5.4, t, 0.2, { vol: vol * 0.08, atk: 0.002, rel: 0.18, wet: 0.4, pan }); };
  const flute = (m, t, dur, vol) => { const f = mtof(m); voice('sine', f, t, dur, { vol, atk: 0.1, rel: dur * 0.65, lp: 2800, wet: 0.5, vib: 9, pan: 0.15 }); voice('sine', f * 2, t, dur, { vol: vol * 0.16, atk: 0.14, rel: dur * 0.6, wet: 0.5, vib: 12 }); };
  const bass = (m, t, dur, vol) => voice('sine', mtof(m), t, dur, { vol, atk: 0.03, rel: dur * 0.85, wet: 0.12 });
  const strings = (notes, t, dur, vol) => notes.forEach((n, i) => { const f = mtof(n), v = vol / notes.length * 1.4; voice('sawtooth', f, t, dur, { vol: v, atk: dur * 0.42, rel: dur * 0.5, lp: 640, wet: 0.65, det: 6, pan: i % 2 ? 0.3 : -0.3 }); voice('sawtooth', f, t, dur, { vol: v * 0.8, atk: dur * 0.45, rel: dur * 0.5, lp: 640, wet: 0.65, det: -7, pan: i % 2 ? -0.3 : 0.3 }); });
  const droplet = (t, vol) => { const c = M.c, o = c.createOscillator(), g = c.createGain(), f = rand(1500, 2600); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.14); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); route(g, 0.8, rand(-0.5, 0.5)); o.start(t); o.stop(t + 0.2); };
  const chirp = (t, vol) => { const c = M.c, base = rand(2400, 3400), pan = rand(-0.6, 0.6); for (let i = 0; i < 3 + ((Math.random() * 3) | 0); i++) { const o = c.createOscillator(), g = c.createGain(), s = t + i * 0.09; o.type = 'sine'; o.frequency.setValueAtTime(base + i * 120, s); o.frequency.exponentialRampToValueAtTime(base * 1.25, s + 0.06); g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(vol, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.07); o.connect(g); route(g, 0.5, pan); o.start(s); o.stop(s + 0.1); } };

  // ---------- phrases: a short motif that returns, sometimes changed, sometimes resting ----------
  function newMotif(sc, U) { // U = how many grid steps one melody unit spans (1 at slow tempos, 2 when the steps are very short)
    const out = [], span = Math.floor(sc.steps * 2 / U) - 1; let pos = 0, idx = 1 + ((Math.random() * (sc.pent.length - 2)) | 0);
    for (let i = 0; i < 6; i++) {
      const d = 1 + ((Math.random() * 3) | 0); out.push({ p: pos, i: idx, d });
      pos += d + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0); idx = clamp(idx + pick([-2, -1, -1, 1, 1, 2]), 0, sc.pent.length - 1);
      if (pos >= span - 1) break;
    }
    return out;
  }
  function varyMotif(m, sc) {
    const n = m.map(x => ({ ...x })), k = (Math.random() * n.length) | 0;
    n[k].i = clamp(n[k].i + pick([-2, -1, 1, 2]), 0, sc.pent.length - 1);
    if (Math.random() < 0.35 && n.length > 3) n.pop();
    return n;
  }
  function phrase(sc, b, t, sd, lvl, play) {
    if (b % 2) return;
    const U = Math.max(1, Math.ceil(0.36 / sd));
    if (M.motifU !== U) { M.motif = null; M.motifU = U; }
    if (b % 4 === 0 || !M.motif) M.motif = !M.motif || Math.random() < 0.3 ? newMotif(sc, U) : varyMotif(M.motif, sc); // a new idea now and then, otherwise a variation
    if (Math.random() > [0.55, 0.7, 0.85, 0.95][lvl]) return; // rests
    for (const n of M.motif) play(sc.pent[n.i], t + n.p * U * sd + rand(0, 0.02), n.d * U * sd);
  }
  const bars = (sc, b, t, sd, lvl, chord, pattern, inst, vol, dens) => { // a fingerpicked pattern with soft, uneven touch
    for (let i = 0; i < sc.steps; i++) if (Math.random() < dens * (i % 2 ? 0.78 : 1)) inst(chord[pattern[i % pattern.length] % chord.length] + sc.up, t + i * sd + rand(0, 0.012), vol * (i % 4 === 0 ? 1.15 : i % 2 ? 0.62 : 0.9) * rand(0.85, 1.1), rand(-0.35, 0.35));
  };


  // ---------- Frenzy: ambient zaps and zings for suspense ----------
  // On top of the faster music: a low drone that swells every bar, a heartbeat thump, and sparse electric zaps and rising zings.
  const zap = (t, vol, pan) => { // a short crackle: a fast downward sweep through a narrow band
    const c = M.c, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), f0 = rand(2200, 3400);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(rand(260, 520), t + 0.11);
    f.type = 'bandpass'; f.frequency.value = rand(1500, 2600); f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(f); f.connect(g); route(g, 0.55, pan); o.start(t); o.stop(t + 0.16);
  };
  const zing = (t, vol, pan) => voice('sine', rand(900, 1300), t, 0.5, { vol, atk: 0.06, rel: 0.34, to: rand(3000, 4200), vib: 14, wet: 0.7, pan });
  function frenzyBar(sc, b, t, sd) {
    const root = sc.chords[(b >> 1) % 4][0] - 12, dur = sd * sc.steps * 1.1;
    voice('sawtooth', mtof(root), t, dur, { vol: 0.011, atk: dur * 0.55, rel: dur * 0.4, lp: 380, wet: 0.3, det: 5 });
    voice('sawtooth', mtof(root + 7), t, dur, { vol: 0.008, atk: dur * 0.6, rel: dur * 0.4, lp: 340, wet: 0.3, det: -6 });
    for (let i = 0; i < sc.steps; i += 4) { // lub-dub
      voice('sine', 62, t + i * sd, 0.2, { vol: 0.05, atk: 0.006, rel: 0.17, to: 42, wet: 0.1 });
      voice('sine', 58, t + i * sd + sd * 0.8, 0.18, { vol: 0.03, atk: 0.006, rel: 0.15, to: 40, wet: 0.1 });
    }
    for (let k = 0, n = 2 + ((Math.random() * 3) | 0); k < n; k++) zap(t + rand(0, sc.steps - 1) * sd, 0.012 + Math.random() * 0.01, rand(-0.7, 0.7));
    if (b % 2 === 0 || Math.random() < 0.3) zing(t + rand(1, sc.steps - 2) * sd, 0.012, rand(-0.6, 0.6));
  }

  // ---------- the three moods ----------
  const SCENES = {
    pond: { // D major: slow piano over strings, water underneath
      steps: 8, sd: 0.55, up: 12, pent: [74, 76, 78, 81, 83, 86, 88], chords: [[50, 57, 61, 64], [47, 54, 57, 62], [43, 50, 54, 59], [45, 52, 57, 59]],
      bar(b, t, sd, lvl) {
        const ch = this.chords[(b >> 1) % 4];
        if (b % 2 === 0) { strings(ch, t, sd * 17, 0.03); bass(ch[0] - 12, t, sd * 14, 0.05); }
        if (lvl >= 2 && b % 2 === 1) bass(ch[0] - 12, t + sd * 4, sd * 4, 0.035);
        bars(this, b, t, sd, lvl, ch, [0, 2, 1, 3, 2, 3, 1, 2], piano, 0.028, [0.42, 0.6, 0.78, 0.95][lvl]);
        phrase(this, b, t, sd, lvl, (m, tt, d) => piano(m, tt, 0.034, 0.2));
        if (Math.random() < 0.3) droplet(t + rand(0, 7) * sd, 0.012);
        if (lvl === 3) for (let i = 0; i < 4; i++) bell(pick(this.pent) + 12, t + (i * 2 + 1) * sd, 0.012, rand(-0.5, 0.5));
      },
    },
    pasture: { // G major, 6/8: fingerpicked guitar and a flute
      steps: 6, sd: 0.38, up: 12, pent: [67, 69, 71, 74, 76, 79, 81], chords: [[43, 50, 55, 59], [40, 47, 52, 55], [48, 55, 59, 64], [50, 54, 57, 62]],
      bar(b, t, sd, lvl) {
        const ch = this.chords[b % 4];
        strings(ch.slice(1), t, sd * 7, 0.022); bass(ch[0], t, sd * 5.5, 0.05); bass(ch[0] + 7, t + sd * 3, sd * 2.5, 0.025);
        bars(this, b, t, sd, lvl, ch, [0, 1, 2, 3, 2, 1], guitar, 0.034, [0.62, 0.76, 0.88, 0.96][lvl]);
        phrase(this, b, t, sd, lvl, (m, tt, d) => flute(m, tt, Math.min(d * sd * 1.4 + 0.3, 3.2), 0.03));
        if (lvl === 0 && Math.random() < 0.14) chirp(t + rand(0, 5) * sd, 0.01);
      },
    },
    toybox: { // C major: a music box over soft strings, a little dreamy
      steps: 8, sd: 0.44, up: 24, pent: [79, 81, 84, 86, 88, 91], chords: [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]],
      bar(b, t, sd, lvl) {
        const ch = this.chords[(b >> 1) % 4];
        if (b % 2 === 0) { strings(ch, t, sd * 17, 0.026); bass(ch[0] - 12, t, sd * 12, 0.045); }
        bars(this, b, t, sd, lvl, ch, [0, 1, 2, 3, 2, 1, 2, 1], bell, 0.026, [0.5, 0.66, 0.82, 0.95][lvl]);
        phrase(this, b, t, sd, lvl, (m, tt, d) => bell(m, tt, 0.03, 0.25));
        if (lvl >= 1 && b % 4 === 3) [0, 1, 2, 3].forEach(i => bell(this.pent[i] - 12, t + (4 + i) * sd * 0.75, 0.016, 0.1 * i - 0.15));
      },
    },
  };
  const MOOD = { fish: 'pond', sheep: 'pasture', balls: 'toybox' };

  // ---------- what should be playing right now ----------
  function want() {
    const st = cfg();
    if (document.hidden || Sfx.muted || st.music === false) return null;
    if (document.querySelector('#sheepGame:not(.hidden), #fishing:not(.hidden), #tutorial:not(.hidden)')) return null;
    const forced = st.style && st.style !== 'auto' && SCENES[st.style] ? st.style : null;
    const h = Meta.homeInfo && Meta.homeInfo();
    if (h && h.opened) return { mood: forced || MOOD[h.sk] || 'pond', lvl: h.game ? 1 : 0 };
    const r = Meta.runInfo && Meta.runInfo();
    if (r && r.state === 'play') {
      if (r.paused && !(Meta.Settings && Meta.Settings.isOpen())) return null; // the pause menu is quiet, except while you are tuning the music
      // a nearly full pond ducks the music (down to half) so the heartbeat and the tension come through
      return { mood: forced || MOOD[r.skin] || 'pond', lvl: r.paused ? 1 : r.frenzy ? 3 : r.combo >= 3 ? 2 : 1, duck: 1 - 0.5 * clamp(((r.danger || 0) - 0.85) / 0.15, 0, 1) };
    }
    return { mood: forced || MOOD[Meta.curSkin()] || 'pond', lvl: 0 };
  }
  function setBeds(mood, on) {
    if (!M.beds) return; const t = M.c.currentTime, night = mood === 'pasture' && Meta.skinTheme && Meta.skinTheme('sheep').decor === 'fireflies';
    on = on && cfg().nature !== false;
    M.beds.water.gain.setTargetAtTime(on && mood === 'pond' ? 0.05 : 0, t, 1.2);
    M.beds.wind.gain.setTargetAtTime(on && mood === 'pasture' ? 0.05 : 0, t, 1.2);
    M.beds.crickets.gain.setTargetAtTime(on && night ? 0.006 : 0, t, 1.5);
  }
  function tick() {
    if (!Sfx.ctx || !init()) return;
    const c = M.c, now = c.currentTime, w = want();
    if (!w) { M.bus.gain.setTargetAtTime(0, now, 0.3); if (M.cur) { M.cur = null; M.motif = null; } return; }
    if (w.mood !== M.cur) { // crossfade to the new mood
      M.bus.gain.setTargetAtTime(0, now, 0.25);
      if (!M.cur) M.switchAt = now; else if (!M.switching) { M.switching = true; M.switchAt = now + 0.9; }
      if (now >= M.switchAt) { M.cur = w.mood; M.switching = false; M.bar = 0; M.next = now + 0.15; M.motif = null; setBeds(w.mood, true); }
      else return;
    }
    M.switching = false;
    const tk = cfg().tempo || 'lively';
    if (M.tempoKey !== undefined && tk !== M.tempoKey) restart(); // the new tempo is heard straight away
    M.tempoKey = tk;
    const vol = MUSIC_VOL * clamp(cfg().musicVol ?? 0.8, 0, 1) * (w.duck ?? 1);
    M.bus.gain.setTargetAtTime(vol, now, 0.7); setBeds(M.cur, true);
    const sc = SCENES[M.cur], sd = sc.sd * (TEMPO[cfg().tempo] || TEMPO.lively) * [1, 0.96, 0.9, 0.8][w.lvl];
    M.ring = clamp(sd * 5.5, 0.5, 2.2); setEcho(sd);
    if (M.next < now) M.next = now + 0.1; // the tab was throttled; don't try to catch up
    while (M.next < now + 0.6) { sc.bar(M.bar, M.next, sd, w.lvl); if (w.lvl === 3) frenzyBar(sc, M.bar, M.next, sd); M.bar++; M.next += sc.steps * sd; }
  }
  setInterval(tick, 120);


  // ---------- soft sound effects from the same voices ----------
  // A charging sheep: a quiet inhale when it starts stamping, then a warm low swell with a little air as it sets off.
  // Gentle on purpose: no hard attacks, slow rise, a short reverb, and never more than one every 0.35 s.
  let lastCharge = 0;
  const air = (t, dur, vol, f0, f1, pan) => {
    const c = M.c, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = M.nb; s.loop = true; f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); route(g, 0.4, pan, true); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  };
  const frenzyHit = () => {
    if (!ready()) return; const t = M.c.currentTime + 0.01, V = { wet: 0.6, fx: true };
    voice('sine', 260, t, 0.9, { vol: 0.03, atk: 0.5, rel: 0.3, to: 2600, lp: 3500, vib: 10, ...V });                 // a rising swell
    voice('sine', 130, t, 0.6, { vol: 0.06, atk: 0.02, rel: 0.5, to: 70, lp: 400, ...V });                              // a low whump
    air(t, 0.8, 0.014, 600, 4200, 0);
    for (let i = 0; i < 4; i++) { // a cluster of crackles as it peaks
      const s0 = t + 0.5 + i * 0.1 + rand(0, 0.05), o = M.c.createOscillator(), f = M.c.createBiquadFilter(), g = M.c.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(rand(2400, 3400), s0); o.frequency.exponentialRampToValueAtTime(rand(300, 500), s0 + 0.1);
      f.type = 'bandpass'; f.frequency.value = rand(1600, 2600); f.Q.value = 3; g.gain.setValueAtTime(0.0001, s0); g.gain.exponentialRampToValueAtTime(0.02, s0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.12);
      o.connect(f); f.connect(g); route(g, 0.5, rand(-0.7, 0.7), true); o.start(s0); o.stop(s0 + 0.15);
    }
  };
  const ready = () => !Sfx.muted && Sfx.ctx && init();
  const FXV = { wet: 0.5, fx: true };
  // A muffled hoof thump: a short low sine that drops a little, with a soft tick of "ground" on top.
  const thump = (t, vol, pan, f = 100) => {
    voice('sine', f, t, 0.16, { vol, atk: 0.004, rel: 0.14, to: f * 0.62, lp: 320, wet: 0.2, pan, fx: true });
    const c = M.c, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = M.nb; s.loop = true; fl.type = 'bandpass'; fl.frequency.value = 700; fl.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(fl); fl.connect(g); route(g, 0.1, pan, true); s.start(t, Math.random() * 2); s.stop(t + 0.07);
  };
  // Winding up: two soft stamps. Setting off: a little gallop of thumps that fade, with a low rush of air.
  const chargeWind = (pan = 0) => {
    if (!ready()) return; const t = M.c.currentTime + 0.01;
    thump(t, 0.04, pan, 105); thump(t + 0.17, 0.045, pan, 98);
  };
  const chargeGo = (pan = 0) => {
    if (!ready()) return; const t = M.c.currentTime + 0.01;
    if (t - lastCharge < 0.35) return; lastCharge = t;
    [0, 0.1, 0.2, 0.31, 0.43].forEach((d, i) => thump(t + d, 0.05 * (1 - i * 0.15), pan, 92 - i * 4));
    const c = M.c, sr = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    sr.buffer = M.nb; sr.loop = true; fl.type = 'lowpass'; fl.frequency.setValueAtTime(260, t); fl.frequency.exponentialRampToValueAtTime(900, t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    sr.connect(fl); fl.connect(g); route(g, 0.25, pan, true); sr.start(t, Math.random() * 2); sr.stop(t + 0.6);
  };


  // ---------- food and water sounds (collection page) ----------
  // A short burst of filtered noise: the body of a splash, a nibble or a pellet landing.
  const puff = (t, dur, vol, f0, type = 'bandpass', pan = 0, q = 1) => {
    const c = M.c, sr = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    sr.buffer = M.nb; sr.loop = true; fl.type = type; fl.frequency.value = f0; fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    sr.connect(fl); fl.connect(g); route(g, 0.25, pan, true); sr.start(t, Math.random() * 2); sr.stop(t + dur + 0.05);
  };
  // food hits the water: a soft bloop, a splash of water and two small droplets landing after it
  const splash = (pan = 0, size = 1) => {
    if (!ready()) return; const t = M.c.currentTime + 0.005;
    voice('sine', 560, t, 0.2, { vol: 0.045 * size, atk: 0.004, rel: 0.18, to: 170, lp: 1100, wet: 0.35, pan, fx: true });
    puff(t, 0.16, 0.03 * size, 2200, 'lowpass', pan);
    voice('sine', 1500, t + 0.08, 0.06, { vol: 0.012, atk: 0.003, rel: 0.05, to: 820, wet: 0.4, pan, fx: true });
    voice('sine', 1250, t + 0.15, 0.06, { vol: 0.009, atk: 0.003, rel: 0.05, to: 700, wet: 0.4, pan, fx: true });
  };
  // a fish takes the food: two tiny bubble pops
  const nibble = (pan = 0) => {
    if (!ready()) return; const t = M.c.currentTime + 0.005;
    voice('sine', 880, t, 0.06, { vol: 0.026, atk: 0.003, rel: 0.05, to: 1250, wet: 0.3, pan, fx: true });
    voice('sine', 1040, t + 0.075, 0.06, { vol: 0.02, atk: 0.003, rel: 0.05, to: 1500, wet: 0.3, pan, fx: true });
    puff(t, 0.04, 0.008, 3000, 'highpass', pan);
  };
  // a pellet lands on the grass: a dull little tick, quieter and lower with each bounce
  const pelletTick = (pan = 0, k = 0) => {
    if (!ready()) return; const t = M.c.currentTime + 0.003, v = 1 - k * 0.28;
    puff(t, 0.05, 0.03 * v, 1300 - k * 250, 'bandpass', pan, 1.6);
    voice('sine', 330 - k * 50, t, 0.07, { vol: 0.03 * v, atk: 0.002, rel: 0.06, to: 190, lp: 900, wet: 0.15, pan, fx: true });
  };
  // a sheep eats the pellet: three quick, round little chomps that rise a touch, then a happy "mm!" (the sheep chews for about half a second)
  const munch = (pan = 0) => {
    if (!ready()) return; const t0 = M.c.currentTime + 0.005;
    [0, 0.12, 0.24].forEach((d, i) => {
      const t = t0 + d;
      puff(t, 0.05, 0.018, 1100 + i * 70, 'bandpass', pan, 1.4);                                                                   // the crunch
      voice('sine', 520 + i * 45, t, 0.075, { vol: 0.03, atk: 0.003, rel: 0.065, to: 330 + i * 25, lp: 1500, wet: 0.15, pan, fx: true }); // the soft "nom"
    });
    voice('sine', 640, t0 + 0.37, 0.13, { vol: 0.016, atk: 0.012, rel: 0.1, to: 980, wet: 0.25, vib: 5, pan, fx: true });             // the happy "mm!"
  };

  // the pond is nearly full: a low two-beat heartbeat, louder as it gets closer to overflowing (k 0 to 1)
  const heartbeat = (k = 0) => {
    if (!ready()) return; const t = M.c.currentTime + 0.005, v = 0.06 + 0.05 * k;
    voice('sine', 64, t, 0.2, { vol: v, atk: 0.006, rel: 0.17, to: 42, lp: 260, wet: 0.1, fx: true });
    voice('sine', 58, t + 0.17, 0.2, { vol: v * 0.75, atk: 0.006, rel: 0.17, to: 40, lp: 260, wet: 0.1, fx: true });
  };

  // A rainbow fish has swum in: a short, soft run of four bell notes climbing a pentatonic scale, with a faint shimmer gliding up behind it. Quiet enough
  // to ignore while you are looping, but unlike any other sound in the game, so you learn it means "rainbow". Panned to where the fish enters.
  const rainbowSpawn = (pan = 0) => {
    if (!ready()) return; const t = M.c.currentTime + 0.01, V = { wet: 0.7, fx: true, pan };
    [[1319, 0], [1760, 0.09], [2349, 0.18], [3136, 0.3]].forEach(([f, d], i) => {
      voice('sine', f, t + d, 0.95 - i * 0.1, { vol: 0.03 - i * 0.004, atk: 0.004, rel: 0.9 - i * 0.1, ...V });
      voice('sine', f * 2.76, t + d, 0.28, { vol: 0.006, atk: 0.003, rel: 0.25, ...V });
    });
    voice('sine', 1700, t + 0.05, 0.55, { vol: 0.008, atk: 0.12, rel: 0.38, to: 4300, ...V });
  };

  // a soft note for interface sounds (feeding, tapping a trophy), in the key of the current mood
  Meta.Music = {
    chime(i = 0, vol = 0.04) { if (!M.c || Sfx.muted) return; const sc = SCENES[M.cur || 'toybox']; bell(sc.pent[((i % sc.pent.length) + sc.pent.length) % sc.pent.length] - 12, M.c.currentTime + 0.01, vol, rand(-0.3, 0.3)); },
    chargeWind, chargeGo, frenzyHit, restart, splash, nibble, pelletTick, munch, heartbeat, rainbowSpawn,
    mood: () => M.cur,
    _scenes: SCENES,
  };
})();
