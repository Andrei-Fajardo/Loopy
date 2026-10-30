/* Lasso meta layer: save data, coins, levels, daily reward calendar, missions, upgrades,
   the fish collection album, the store (hats, ponds, ropes, pop effects), fish art, stats and menus. */
const Meta = (() => {
  const $ = id => document.getElementById(id);
  const fmt = n => Math.floor(n).toLocaleString();
  const r = Math.random;
  const pick = a => a[(r() * a.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- colors shared with the game ----------
  const COLORS = [
    { c: '#ff8a4c', d: '#d65a1f' }, { c: '#4cc9f0', d: '#1d8fb8' },
    { c: '#c86bfa', d: '#8a35bf' }, { c: '#ff5d8f', d: '#c42d5f' }, { c: '#7bd389', d: '#3f9a52' },
  ];
  const GOLD = { c: '#ffd84d', d: '#d9a400' };

  // ---------- save ----------
  const KEY = 'lasso-save-v1';
  const DEFAULT = {
    coins: 0, level: 1, xp: 0, best: 0, muted: false, lastDay: '', streak: 0, dailyClaimed: '', missions: null,
    freeAds: { day: '', count: 0 },
    owned: { hat: ['none'], theme: ['lily'], rope: ['rope'], pop: ['splash'] },
    equip: { hat: 'none', theme: 'lily', rope: 'rope', pop: 'splash' },
    up: { bait: 0, calm: 0, pond: 0, charge: 0, keeper: 0, hunter: 0 },
    album: {}, albumClaimed: [],
    stats: { games: 0, fish: 0, catches: 0, biggest: 0, bestCombo: 0, sweeps: 0, golds: 0, tangles: 0, time: 0,
      coinsEarned: 0, colors: [0, 0, 0, 0, 0], history: [], frenzies: 0, kings: 0, specials: 0 },
  };
  let S = JSON.parse(JSON.stringify(DEFAULT));
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d) S = { ...S, ...d, owned: { ...S.owned, ...d.owned }, equip: { ...S.equip, ...d.equip }, up: { ...S.up, ...d.up }, stats: { ...S.stats, ...d.stats } };
    else S.best = +(localStorage.getItem('lasso-best') || 0);
  } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  // Per-skin collections: the sheep and toy-ball versions of the album and of the cosmetics.
  S.albums = { sheep: {}, balls: {}, ...S.albums };
  S.albumClaimedBy = { sheep: [], balls: [], ...S.albumClaimedBy };
  S.skinOwned = { sheep: { hat: ['none'], theme: ['meadow'] }, balls: { hat: ['none'], theme: ['mat'] }, ...S.skinOwned };
  S.skinEquip = { sheep: { hat: 'none', theme: 'meadow' }, balls: { hat: 'none', theme: 'mat' }, ...S.skinEquip };
  S.skinsOwned = S.skinsOwned || ['fish']; // skins are bought with coins; the fish skin is free
  const curSkin = () => ((S.skin === 'sheep' || S.skin === 'balls') && S.skinsOwned.includes(S.skin) ? S.skin : 'fish');

  // Streak counts consecutive days opened; the reward itself is claimed from the daily calendar.
  const dayKey = d => d.toISOString().slice(0, 10);
  const today = dayKey(new Date()), yesterday = dayKey(new Date(Date.now() - 864e5));
  if (S.lastDay !== today) {
    S.streak = S.lastDay === yesterday ? S.streak + 1 : 1;
    S.lastDay = today;
  }
  if (S.freeAds.day !== today) S.freeAds = { day: today, count: 0 };

  // ---------- levels ----------
  const xpNeed = lv => 100 + lv * 60;
  const levelItems = lv => [...Object.values(CATALOG).flat(), ...['sheep', 'balls'].flatMap(sk => ['hat', 'theme'].flatMap(c => SKIN_CATALOG[sk][c]))].filter(i => i.lv === lv).map(i => i.name);
  function addXp(n) {
    S.xp += n;
    const ups = [], events = [];
    while (S.xp >= xpNeed(S.level)) {
      S.xp -= xpNeed(S.level);
      S.level++;
      const reward = 40 + Math.min(S.level, 40) * 8; // was 50 + level x 20, uncapped (1,250 at level 60)
      S.coins += reward;
      const unlocked = levelItems(S.level);
      events.push({ level: S.level, reward, unlocked });
      ups.push(`Level ${S.level}! +${reward} coins` + (unlocked.length ? ` · Unlocked ${unlocked.join(', ')}` : ''));
    }
    if (events.length && Meta.onLevelUp) { Meta.onLevelUp(events); return []; } // the celebration screen replaces the toasts
    return ups;
  }

  // ---------- upgrades: permanent, and they change how the game plays ----------
  // The effects apply to every skin (the levels are shared), but the wording follows the skin you're playing as.
  // `max` is the level cap. `show(m)` describes an upgrade from a mods() result, so its card can print "now → next" in numbers.
  const pct = x => Math.round(x * 1000) / 10 + '%';
  const UPGRADES = {
    bait:   { name: 'Lucky Bait',      icon: '🪱', desc: 'More golden and rare fish', base: 200, max: 10, show: m => `${pct(m.gold)} golden, ${pct(m.rare)} rare`,
      skin: { sheep: { name: 'Golden Clover', icon: '🍀', desc: 'More golden and rare sheep' }, balls: { name: 'Lucky Charm', icon: '🧿', desc: 'More golden and rare toys' } } },
    calm:   { name: 'Calm Water',      icon: '🌊', desc: 'Fish swim slower', base: 200, max: 10, show: m => `${pct(m.speed)} speed`,
      skin: { sheep: { name: 'Calm Flock', icon: '🧘', desc: 'Sheep move slower' }, balls: { name: 'Soft Floor', icon: '🧸', desc: 'Balls move slower' } } },
    pond:   { name: 'Bigger Pond',     icon: '🏞️', desc: '+1 fish before the pond overflows', base: 725, max: 6, show: m => `holds ${m.cap}`,
      skin: { sheep: { name: 'Bigger Pasture', icon: '🌾', desc: '+1 sheep before the pasture is full' }, balls: { name: 'Bigger Playroom', icon: '🧱', desc: '+1 balls before the playroom is full' } } },
    charge: { name: 'Frenzy Charge',   icon: '⚡', desc: 'Frenzy meter fills faster', base: 325, max: 10, show: m => `fills ×${m.charge.toFixed(2)}` },
    keeper: { name: 'Combo Keeper',    icon: '⏳', desc: 'Combo timer lasts longer', base: 175, max: 10, show: m => `${m.comboTime.toFixed(2)} s` },
    hunter: { name: 'Treasure Hunter', icon: '🧭', desc: 'More special fish', base: 275, max: 10, show: m => `${pct(m.special)} special`,
      skin: { sheep: { desc: 'More special sheep' }, balls: { desc: 'More special balls' } } },
  };
  const upgradeFor = k => ({ ...UPGRADES[k], ...((UPGRADES[k].skin || {})[curSkin()] || {}) });
  const upMax = k => UPGRADES[k].max;
  const UP_GROWTH = 1.32; // each level costs this much more than the one before
  const upCost = k => Math.round(UPGRADES[k].base * Math.pow(UP_GROWTH, S.up[k]));
  // Effects scale with the share of the cap reached (t = 0 to 1), so the top effect is the tuning knob. Bigger Pond is +1 per level.
  function mods(u = S.up) {
    const t = k => Math.min(u[k] || 0, upMax(k)) / upMax(k);
    return {
      gold: 0.05 * (1 + 0.7 * t('bait')), rare: 0.045 * (1 + 0.85 * t('bait')), speed: 1 - 0.2 * t('calm'),
      cap: 36 + Math.min(u.pond || 0, upMax('pond')), charge: 1 + 0.4 * t('charge'), comboTime: 4 + 3.5 * t('keeper'), special: 0.05 * (1 + 0.45 * t('hunter')),
    };
  }
  // One-time migration (upgrade pass, 2026-10): caps went from 5 to `max`, so old levels are scaled up and every effect stays the same.
  // Never put upV2 in DEFAULT: saves are merged onto DEFAULT, so a default of true would skip this for everyone.
  if (!S.upV2) {
    for (const k of Object.keys(UPGRADES)) S.up[k] = Math.min(upMax(k), Math.round((S.up[k] || 0) * upMax(k) / 5));
    S.upV2 = true; save();
  }

  // ---------- fish collection album ----------
  const RARITY = {
    U: { name: 'Uncommon', w: 58, c: '#2a9d8f' }, R: { name: 'Rare', w: 28, c: '#3a86ff' },
    E: { name: 'Epic', w: 11, c: '#8338ec' }, L: { name: 'Legendary', w: 3, c: '#e08a00' },
  };
  // Order matters: saved album progress is stored by index, so new species are only ever appended.
  const SPECIES = [
    ['Tiger Tetra', 0, 'stripes', 'U'], ['Dotty', 1, 'spots', 'U'], ['Polka Plum', 2, 'spots', 'U'], ['Candy Stripe', 3, 'stripes', 'U'],
    ['Bigeye Plum', 2, 'eyes', 'U'], ['Bigeye Rose', 3, 'eyes', 'U'], ['Chubby Plum', 2, 'chubby', 'U'], ['Chubby Rose', 3, 'chubby', 'U'],
    ['Tiny Ember', 0, 'tiny', 'U'], ['Tiny Sky', 1, 'tiny', 'U'],
    ['Koi Ember', 0, 'patches', 'R'], ['Koi Sky', 1, 'patches', 'R'], ['Ghost Plum', 2, 'ghost', 'R'], ['Ghost Rose', 3, 'ghost', 'R'],
    ['Fanfin Ember', 0, 'fins', 'R'], ['Fanfin Sky', 1, 'fins', 'R'], ['Zebra Plum', 2, 'zebra', 'R'],
    ['Lantern Ember', 0, 'lantern', 'E'], ['Lantern Sky', 1, 'lantern', 'E'], ['Neon Rose', 3, 'neon', 'E'],
    ['Starry Ember', 0, 'starry', 'E'], ['Crystal Sky', 1, 'crystal', 'E'],
    ['Emperor Plum', 2, 'emperor', 'L'], ['Phoenix Rose', 3, 'phoenix', 'L'],
    // Added with the Bloop! rename (the game is now called Loopy!): 12 more regulars and 8 more legendaries.
    ['Dotty Ember', 0, 'spots', 'U'], ['Bigeye Sky', 1, 'eyes', 'U'], ['Chubby Ember', 0, 'chubby', 'U'], ['Tiny Rose', 3, 'tiny', 'U'],
    ['Koi Rose', 3, 'patches', 'R'], ['Ghost Sky', 1, 'ghost', 'R'], ['Fanfin Rose', 3, 'fins', 'R'], ['Zebra Ember', 0, 'zebra', 'R'],
    ['Lantern Plum', 2, 'lantern', 'E'], ['Neon Sky', 1, 'neon', 'E'], ['Crystal Rose', 3, 'crystal', 'E'], ['Starry Plum', 2, 'starry', 'E'],
    ['Nebula', 2, 'galaxy', 'L'], ['Aurora', 1, 'aurora', 'L'], ['Magma', 0, 'lava', 'L'], ['Pearl Queen', 3, 'pearl', 'L'],
    ['Volt', 1, 'electric', 'L'], ['Dragon Koi', 0, 'dragon', 'L'], ['Abyss', 2, 'shadow', 'L'], ['Sakura', 3, 'sakura', 'L'],
  ].map(([name, color, pat, rar], id) => ({ id, name, color, pat, rar }));
  const FULL_ALBUM = SPECIES.length;
  const ALBUM_REWARDS = [[8, 300], [16, 700], [24, 1200], [32, 2000], [FULL_ALBUM, 4000]]; // the full album also unlocks the Captain's Hat
  // Sheep breeds and toy balls: same rarity system as the fish. Order matters (progress is stored by index), so only append.
  const mkList = list => list.map(([name, color, pat, rar], id) => ({ id, name, color, pat, rar }));
  const SHEEP_SPECIES = mkList([
    ['Amber Lamb', 0, 'lamb', 'U'], ['Sky Lamb', 1, 'lamb', 'U'], ['Rose Lamb', 3, 'lamb', 'U'], ['Spotty Amber', 0, 'spots', 'U'], ['Spotty Plum', 2, 'spots', 'U'],
    ['Spotty Mint', 4, 'spots', 'U'], ['Fluffy Sky', 1, 'fluffy', 'U'], ['Fluffy Rose', 3, 'fluffy', 'U'], ['Fluffy Mint', 4, 'fluffy', 'U'], ['Fluffy Plum', 2, 'fluffy', 'U'],
    ['Stripy Amber', 0, 'striped', 'R'], ['Stripy Sky', 1, 'striped', 'R'], ['Stripy Plum', 2, 'striped', 'R'], ['Whiteface Rose', 3, 'whiteface', 'R'],
    ['Whiteface Mint', 4, 'whiteface', 'R'], ['Belle Amber', 0, 'belled', 'R'], ['Belle Sky', 1, 'belled', 'R'], ['Belle Mint', 4, 'belled', 'R'],
    ['Lovely Rose', 3, 'hearts', 'E'], ['Lovely Plum', 2, 'hearts', 'E'], ['Starry Sky', 1, 'starry', 'E'], ['Starry Amber', 0, 'starry', 'E'],
    ['Starry Mint', 4, 'starry', 'E'], ['Sunny Amber', 0, 'sunny', 'E'],
    ['Golden Fleece', 0, 'golden', 'L'], ['Cloud Sheep', 1, 'cloud', 'L'], ['Galaxy Ram', 2, 'galaxy', 'L'], ['Rainbow Wool', 3, 'rainbowwool', 'L'], ['Mint Spirit', 4, 'spirit', 'L'],
  ]);
  // Toy balls: sports balls and playful ones. Order matters (progress is stored by index): ids 0-28 kept their color and rarity when they
  // were redesigned on 2026-10-26, and the rest were appended. Only append from here.
  const BALL_SPECIES = mkList([
    ['Basketball', 0, 'basketball', 'U'], ['Beach Ball', 1, 'beach', 'U'], ['Donut Ball', 3, 'donut', 'U'], ['Bowling Ball', 2, 'bowling', 'U'], ['Tennis Ball', 4, 'tennis', 'U'],
    ['Pumpkin Ball', 0, 'pumpkin', 'U'], ['Volleyball', 1, 'volley', 'U'], ['Candy Swirl', 3, 'swirl', 'U'], ['Pizza Ball', 0, 'pizza', 'U'], ['Watermelon', 4, 'watermelon', 'U'],
    ['Globe', 1, 'globe', 'R'], ['Eight Ball', 2, 'eight', 'R'], ['Yarn Ball', 3, 'yarn', 'R'], ['Fireball', 0, 'fire', 'R'], ['Alien Ball', 4, 'alien', 'R'],
    ['Snowball', 1, 'snowball', 'R'], ['Soccer Ball', 2, 'soccer', 'R'], ['Golf Ball', 4, 'golf', 'R'],
    ['Sunny Ball', 0, 'sun', 'E'], ['Neptune', 1, 'planet', 'E'], ['Starburst', 3, 'star', 'E'], ['Pinball', 2, 'pinball', 'E'], ["Cat's Eye", 1, 'marble', 'E'], ['Kiwi Ball', 4, 'kiwi', 'E'],
    ['Disco Ball', 2, 'disco', 'L'], ['Glitter Gold', 0, 'glitterball', 'L'], ['Crystal Orb', 1, 'crystal', 'L'], ['Cosmic Ball', 2, 'cosmic', 'L'], ['Pearl Ball', 3, 'pearl', 'L'],
    // appended
    ['Eyeball', 3, 'eyeball', 'R'], ['Cookie Ball', 0, 'cookie', 'U'], ['Cricket Ball', 3, 'cricket', 'R'], ['Ping-Pong', 0, 'pingpong', 'U'], ['Yin-Yang', 2, 'yinyang', 'E'],
    ['Moon Ball', 1, 'moon', 'E'], ['Baseball', 3, 'baseball', 'R'], ['Dice Ball', 4, 'dice', 'R'], ['Cheese Ball', 0, 'cheese', 'R'], ['Ladybug', 3, 'ladybug', 'R'],
    ['Bee Ball', 0, 'bee', 'R'], ['Penguin Ball', 1, 'penguin', 'E'], ['Panda Ball', 4, 'panda', 'E'], ['Robot Ball', 2, 'robot', 'E'], ['Ghost Ball', 1, 'ghost', 'E'],
    ['Dragon Egg', 0, 'dragonegg', 'L'], ['Black Hole', 2, 'blackhole', 'L'], ['Rainbow Orb', 3, 'rainbowball', 'L'],
  ]);
  const SPECIES_BY = { fish: SPECIES, sheep: SHEEP_SPECIES, balls: BALL_SPECIES };
  const speciesOf = sk => SPECIES_BY[sk] || SPECIES;
  const albumOf = sk => (sk !== 'fish' && S.albums[sk]) || S.album;
  const claimedOf = sk => (sk !== 'fish' && S.albumClaimedBy[sk]) || S.albumClaimed;
  const albumCount = (sk = 'fish') => Object.keys(albumOf(sk)).length;
  const rewardsOf = sk => (sk === 'fish' ? ALBUM_REWARDS : [[8, 300], [16, 700], [24, 1200], [speciesOf(sk).length, 4000]]);
  const FULL_HAT = { fish: 'captain', sheep: 'woolcrown', balls: 'champion' }; // full album unlocks an exclusive per skin
  const NOUN = { fish: 'fish', sheep: 'sheep', balls: 'balls' };
  function rollSpecies(sk = 'fish') {
    let roll = r() * 100, rar = 'U';
    for (const k of ['L', 'E', 'R', 'U']) { roll -= RARITY[k].w; if (roll < 0) { rar = k; break; } }
    return pick(speciesOf(sk).filter(s => s.rar === rar));
  }

  // ---------- fish art (shared by the game and the menus). Fish faces +x, size s ----------
  const rainbow = t => ({ c: `hsl(${(t * 120) % 360},90%,62%)`, d: `hsl(${(t * 120 + 40) % 360},80%,45%)` });
  // Legendary species have their own palettes instead of their color group's.
  const LEGEND_COLORS = {
    phoenix: { c: '#ff9d3c', d: '#e0402b' }, emperor: { c: '#7b2cbf', d: '#ffcf33' }, galaxy: { c: '#2b1055', d: '#9d4edd' },
    lava: { c: '#3b1a12', d: '#ff5a1f' }, pearl: { c: '#fbeff5', d: '#e6b8cc' }, electric: { c: '#2f6fed', d: '#ffd23f' },
    dragon: { c: '#d62828', d: '#ffcf33' }, shadow: { c: '#16131f', d: '#3d2e6b' }, sakura: { c: '#ffc2d6', d: '#ff7aa8' },
  };
  function fishColors(f, t) {
    if (f.kind === 'rainbow') return rainbow(t);
    if (f.kind === 'king' || f.color === 'gold') return GOLD;
    const sp = f.species >= 0 && !f.skin ? SPECIES[f.species] : null;
    if (sp && sp.pat === 'aurora') return { c: `hsl(${160 + Math.sin(t * 1.5) * 40},80%,55%)`, d: `hsl(${270 + Math.sin(t) * 30},70%,55%)` };
    if (sp && LEGEND_COLORS[sp.pat]) return LEGEND_COLORS[sp.pat];
    return COLORS[f.color] || COLORS[0];
  }
  // Every album species gets its own silhouette on top of its pattern: tail, back fin, body proportions and one extra feature.
  // The picks are spread by id so neighbours in the list (and the color variants of one pattern) never share a combination.
  const ASPECT = [1, 1.18, 0.86, 1.3, 0.92, 1.1], TAILS = ['fork', 'paddle', 'ribbon', 'crescent'], FINS = ['oval', 'sail', 'spiny', 'twin'];
  const EXTRAS = ['none', 'whiskers', 'crest', 'pectoral', 'blush', 'beard'], ACCENT = ['#ffd23f', '#7bf6ff', '#ff7aa8', '#9bf06a', '#ffffff', '#ff9d3c'];
  const traitsOf = id => ({
    tail: TAILS[(id * 3 + (id >> 2)) % 4], fin: FINS[(id * 5 + (id >> 1)) % 4], aspect: ASPECT[(id * 5 + 1) % 6],
    extra: EXTRAS[(id * 7 + (id >> 2) + 1) % 6], accent: ACCENT[(id * 11 + 2) % 6],
  });
  function drawFishBody(c, f, t) {
    const s = f.size, col = fishColors(f, t), sp = f.species >= 0 ? SPECIES[f.species] : null, pat = sp ? sp.pat : f.kind;
    const tr = sp ? traitsOf(sp.id) : null;
    const bh = (pat === 'chubby' ? 0.78 : pat === 'bomb' ? 0.85 : 0.56) * (tr ? tr.aspect : 1);
    if (pat === 'ghost') c.globalAlpha *= 0.6;
    // Shadow on the pond floor.
    c.fillStyle = 'rgba(0,30,40,.25)';
    c.beginPath(); c.ellipse(4, 6, s, s * bh * 0.9, 0, 0, 6.28); c.fill();
    // Tail wags with swimming speed.
    const tail = pat === 'fins' || pat === 'emperor' || pat === 'phoenix' ? 1.6 : 1;
    c.save();
    c.translate(-s * 0.75, 0);
    c.rotate(Math.sin(f.phase) * 0.45);
    c.fillStyle = pat === 'phoenix' ? '#ffd23f' : col.d;
    c.beginPath();
    const tk = tr ? tr.tail : 'fork';
    if (tk === 'paddle') c.ellipse(-s * 0.42, 0, s * 0.5, s * 0.46 * tail, 0, 0, 6.28);
    else if (tk === 'crescent') { c.moveTo(0, 0); c.quadraticCurveTo(-s * 0.3, -s * 0.2, -s * 0.8 * tail, -s * 0.75 * tail); c.quadraticCurveTo(-s * 0.6, 0, -s * 0.8 * tail, s * 0.75 * tail); c.quadraticCurveTo(-s * 0.3, s * 0.2, 0, 0); }
    else if (tk === 'ribbon') { // two long streamers that sway
      const sw = Math.sin(f.phase * 0.8) * s * 0.12;
      c.moveTo(0, -s * 0.08); c.quadraticCurveTo(-s * 0.6, -s * 0.45 + sw, -s * 1.15, -s * 0.3 + sw * 2); c.quadraticCurveTo(-s * 0.7, -s * 0.12, -s * 0.5, 0);
      c.quadraticCurveTo(-s * 0.7, s * 0.12, -s * 1.15, s * 0.3 - sw * 2); c.quadraticCurveTo(-s * 0.6, s * 0.45 - sw, 0, s * 0.08);
    } else { c.moveTo(0, 0); c.lineTo(-s * 0.7 * tail, -s * 0.5 * tail); c.lineTo(-s * 0.55 * tail, 0); c.lineTo(-s * 0.7 * tail, s * 0.5 * tail); c.closePath(); }
    c.fill();
    if (tr && tk !== 'fork') { c.strokeStyle = tr.accent; c.lineWidth = s * 0.05; c.globalAlpha *= 0.8; c.beginPath(); c.moveTo(-s * 0.1, 0); c.lineTo(-s * (tk === 'ribbon' ? 0.9 : 0.6), 0); c.stroke(); c.globalAlpha /= 0.8; }
    c.restore();
    // Body (with glow for caught, golden, neon, legendary and king fish).
    const legend = sp && sp.rar === 'L';
    if (f.caught || f.color === 'gold' || pat === 'neon' || legend || f.kind === 'king' || f.kind === 'rainbow') {
      c.shadowColor = legend ? col.d : col.c; c.shadowBlur = f.caught ? 18 : legend ? 16 : 12;
    }
    c.fillStyle = col.c;
    c.beginPath(); c.ellipse(0, 0, s, s * bh, 0, 0, 6.28); c.fill();
    c.shadowBlur = 0;
    // Pattern, clipped to the body.
    c.save();
    c.beginPath(); c.ellipse(0, 0, s, s * bh, 0, 0, 6.28); c.clip();
    if (pat === 'stripes') { c.fillStyle = col.d; for (const x of [-0.45, -0.05, 0.3]) c.fillRect(x * s, -s, s * 0.14, s * 2); }
    if (pat === 'zebra') { c.fillStyle = '#2b1640'; for (let x = -0.9; x < 0.6; x += 0.18) c.fillRect(x * s, -s, s * 0.07, s * 2); }
    if (pat === 'spots' || pat === 'starry') {
      c.fillStyle = pat === 'starry' ? '#fff' : 'rgba(255,255,255,.65)';
      for (const [x, y, rr] of [[-0.5, -0.15, 0.12], [-0.2, 0.25, 0.1], [0.05, -0.28, 0.09], [-0.65, 0.2, 0.08], [0.25, 0.2, 0.08], [-0.3, -0.05, 0.06]]) {
        c.beginPath(); c.arc(x * s, y * s, rr * s * (pat === 'starry' ? 0.6 : 1), 0, 6.28); c.fill();
      }
    }
    if (pat === 'patches') { c.fillStyle = '#fff'; c.beginPath(); c.ellipse(-0.35 * s, -0.1 * s, 0.32 * s, 0.25 * s, 0.4, 0, 6.28); c.fill(); c.beginPath(); c.ellipse(0.25 * s, 0.25 * s, 0.2 * s, 0.14 * s, 0, 0, 6.28); c.fill(); }
    if (pat === 'crystal') { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = s * 0.05; c.beginPath(); c.moveTo(-s, 0); c.lineTo(-0.2 * s, -s); c.moveTo(-0.5 * s, s); c.lineTo(0.3 * s, -s); c.moveTo(-s * 0.9, -0.3 * s); c.lineTo(0.6 * s, 0.4 * s); c.stroke(); }
    if (pat === 'phoenix') { const g = c.createLinearGradient(-s, 0, s, 0); g.addColorStop(0, '#e0402b'); g.addColorStop(1, '#ffd23f'); c.fillStyle = g; c.fillRect(-s, -s, s * 2, s * 2); }
    if (pat === 'emperor') { c.fillStyle = '#ffcf33'; for (const x of [-0.6, -0.2, 0.2]) { c.beginPath(); c.arc(x * s, 0.3 * s, 0.07 * s, 0, 6.28); c.fill(); } }
    if (pat === 'bomb') { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-s, s * 0.25, s * 2, s); }
    // Legendary patterns.
    if (pat === 'galaxy') {
      const g = c.createRadialGradient(-s * 0.2, 0, 0, -s * 0.2, 0, s);
      g.addColorStop(0, 'rgba(157,78,221,.8)'); g.addColorStop(1, 'rgba(43,16,85,0)');
      c.fillStyle = g; c.fillRect(-s, -s, s * 2, s * 2);
      c.fillStyle = '#fff';
      const a0 = c.globalAlpha; // twinkle, but keep any pop fade
      for (const [x, y, rr] of [[-0.6, -0.2, 0.05], [-0.3, 0.25, 0.04], [0, -0.3, 0.06], [0.25, 0.15, 0.04], [-0.75, 0.15, 0.03], [-0.1, 0.05, 0.03], [0.4, -0.15, 0.03]]) {
        c.globalAlpha = a0 * (0.6 + Math.sin(t * 4 + x * 9) * 0.4); c.beginPath(); c.arc(x * s, y * s, rr * s, 0, 6.28); c.fill();
      }
      c.globalAlpha = a0;
    }
    if (pat === 'aurora') {
      for (let k = 0; k < 3; k++) {
        c.fillStyle = `hsla(${120 + k * 70 + Math.sin(t * 2 + k) * 30},90%,65%,.55)`;
        c.beginPath(); c.ellipse(-s * 0.1, (-0.3 + k * 0.3) * s + Math.sin(t * 2 + k) * s * 0.08, s, s * 0.12, 0, 0, 6.28); c.fill();
      }
    }
    if (pat === 'lava') {
      c.strokeStyle = '#ff7b2f'; c.lineWidth = s * 0.07; c.shadowColor = '#ff5a1f'; c.shadowBlur = 10;
      c.beginPath(); c.moveTo(-s, 0.1 * s); c.lineTo(-0.5 * s, -0.2 * s); c.lineTo(-0.2 * s, 0.15 * s); c.lineTo(0.2 * s, -0.1 * s);
      c.moveTo(-0.5 * s, -0.2 * s); c.lineTo(-0.45 * s, -0.5 * s); c.moveTo(-0.2 * s, 0.15 * s); c.lineTo(-0.1 * s, 0.5 * s); c.stroke();
      c.shadowBlur = 0;
    }
    if (pat === 'pearl') {
      const g = c.createLinearGradient(-s, -s, s, s);
      g.addColorStop(0, 'rgba(255,200,230,.6)'); g.addColorStop(0.5, `rgba(190,240,255,${0.4 + Math.sin(t * 3) * 0.2})`); g.addColorStop(1, 'rgba(255,240,200,.6)');
      c.fillStyle = g; c.fillRect(-s, -s, s * 2, s * 2);
    }
    if (pat === 'electric') {
      c.strokeStyle = '#ffd23f'; c.lineWidth = s * 0.08; c.shadowColor = '#ffd23f'; c.shadowBlur = 8 + Math.abs(Math.sin(t * 12)) * 10;
      for (const y0 of [-0.2, 0.2]) {
        c.beginPath(); c.moveTo(-s, y0 * s);
        for (let k = 0; k < 8; k++) c.lineTo((-0.8 + k * 0.2) * s, (y0 + (k % 2 ? 0.12 : -0.12)) * s);
        c.stroke();
      }
      c.shadowBlur = 0;
    }
    if (pat === 'dragon') {
      c.strokeStyle = '#ffcf33'; c.lineWidth = s * 0.05;
      for (let row = -1; row <= 1; row++) for (let x = -0.8; x < 0.4; x += 0.22) { c.beginPath(); c.arc(x * s, row * 0.25 * s, s * 0.1, 0, Math.PI); c.stroke(); }
    }
    if (pat === 'sakura') {
      for (const [x, y] of [[-0.55, -0.15], [-0.15, 0.22], [0.15, -0.25], [-0.75, 0.25]]) {
        c.fillStyle = '#fff';
        for (let k = 0; k < 5; k++) { const a = k * 1.256; c.beginPath(); c.arc((x + Math.cos(a) * 0.07) * s, (y + Math.sin(a) * 0.07) * s, s * 0.055, 0, 6.28); c.fill(); }
        c.fillStyle = '#ff7aa8'; c.beginPath(); c.arc(x * s, y * s, s * 0.04, 0, 6.28); c.fill();
      }
    }
    c.restore();
    // Dorsal fin and shine.
    c.fillStyle = pat === 'emperor' ? '#ffcf33' : col.d;
    const fk = tr && pat !== 'fins' ? tr.fin : 'oval', top = -s * bh;
    if (fk === 'sail') { c.beginPath(); c.moveTo(-s * 0.5, top * 0.8); c.quadraticCurveTo(-s * 0.35, top - s * 0.7, s * 0.2, top * 0.9); c.closePath(); c.fill(); }
    else if (fk === 'spiny') for (const x of [-0.45, -0.15, 0.15]) { c.beginPath(); c.moveTo((x - 0.1) * s, top * 0.9); c.lineTo(x * s, top - s * 0.38); c.lineTo((x + 0.1) * s, top * 0.9); c.fill(); }
    else if (fk === 'twin') for (const [x, k] of [[-0.4, 1], [0.05, 0.7]]) { c.beginPath(); c.ellipse(x * s, top * 0.95, s * 0.2 * k, s * 0.2 * k, 0, Math.PI, 0); c.fill(); }
    else { c.beginPath(); c.ellipse(-s * 0.1, -s * bh * 0.78, s * (pat === 'fins' ? 0.55 : 0.38), s * (pat === 'fins' ? 0.26 : 0.16), -0.2, 0, 6.28); c.fill(); }
    // The one extra feature of this species.
    if (tr) {
      const ex = tr.extra;
      if (ex === 'whiskers') { c.strokeStyle = tr.accent; c.lineWidth = s * 0.05; c.lineCap = 'round'; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.88, s * 0.15); c.quadraticCurveTo(s * 1.25, s * (0.15 + k * 0.2), s * 1.4, s * (0.2 + k * 0.5 + Math.sin(t * 3 + k) * 0.08)); c.stroke(); } }
      else if (ex === 'crest') { c.fillStyle = tr.accent; for (const x of [0.25, 0.45, 0.65]) { c.beginPath(); c.moveTo((x - 0.08) * s, -s * bh * 0.85); c.lineTo(x * s, -s * bh * 0.85 - s * (0.5 - (x - 0.25) * 0.5)); c.lineTo((x + 0.08) * s, -s * bh * 0.8); c.fill(); } }
      else if (ex === 'pectoral') { c.save(); c.translate(s * 0.15, s * bh * 0.25); c.rotate(0.5 + Math.sin(f.phase * 1.3) * 0.25); c.fillStyle = tr.accent; c.globalAlpha *= 0.9; c.beginPath(); c.ellipse(-s * 0.25, s * 0.2, s * 0.5, s * 0.2, -0.3, 0, 6.28); c.fill(); c.restore(); }
      else if (ex === 'blush') { c.fillStyle = 'rgba(255,90,140,.55)'; c.beginPath(); c.ellipse(s * 0.5, s * bh * 0.38, s * 0.16, s * 0.1, 0, 0, 6.28); c.fill(); }
      else if (ex === 'beard') { c.fillStyle = tr.accent; c.beginPath(); c.moveTo(s * 0.7, s * bh * 0.7); c.quadraticCurveTo(s * 0.8, s * bh * 1.5, s * 0.55, s * bh * 1.25); c.quadraticCurveTo(s * 0.4, s * bh * 1.05, s * 0.4, s * bh * 0.85); c.fill(); }
    }
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.beginPath(); c.ellipse(s * 0.1, -s * bh * 0.33, s * 0.45, s * 0.14, 0, 0, 6.28); c.fill();
    // Special-fish features.
    if (pat === 'bomb') { // puffer spikes and a lit fuse
      c.fillStyle = col.d;
      for (let a = 0; a < 6.28; a += 0.7) { c.beginPath(); c.moveTo(Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.72); c.lineTo(Math.cos(a) * s * 1.15, Math.sin(a) * s * 1.0); c.lineTo(Math.cos(a + 0.2) * s * 0.85, Math.sin(a + 0.2) * s * 0.72); c.fill(); }
      c.strokeStyle = '#333'; c.lineWidth = s * 0.08; c.beginPath(); c.moveTo(0, -s * 0.85); c.quadraticCurveTo(s * 0.2, -s * 1.2, s * 0.05, -s * 1.35); c.stroke();
      c.fillStyle = Math.sin(t * 20) > 0 ? '#ffd23f' : '#ff5d2f'; c.beginPath(); c.arc(s * 0.05, -s * 1.38, s * 0.12, 0, 6.28); c.fill();
    }
    if (pat === 'clock') {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-s * 0.15, 0, s * 0.36, 0, 6.28); c.fill();
      c.strokeStyle = '#1d3557'; c.lineWidth = s * 0.06;
      c.beginPath(); c.moveTo(-s * 0.15, 0); c.lineTo(-s * 0.15 + Math.cos(t * 3) * s * 0.26, Math.sin(t * 3) * s * 0.26); c.moveTo(-s * 0.15, 0); c.lineTo(-s * 0.15, -s * 0.2); c.stroke();
    }
    if (pat === 'treasure') {
      c.fillStyle = '#ffcf33'; c.beginPath(); c.arc(-s * 0.15, 0, s * 0.3, 0, 6.28); c.fill();
      c.fillStyle = '#9a6b00'; c.font = `bold ${s * 0.42}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', -s * 0.15, s * 0.02);
    }
    if (pat === 'lantern') {
      c.strokeStyle = col.d; c.lineWidth = s * 0.06;
      c.beginPath(); c.moveTo(s * 0.4, -s * 0.45); c.quadraticCurveTo(s * 0.9, -s * 1.2, s * 1.2, -s * 0.6); c.stroke();
      const g = c.createRadialGradient(s * 1.2, -s * 0.6, 0, s * 1.2, -s * 0.6, s * 0.5);
      g.addColorStop(0, 'rgba(255,250,180,1)'); g.addColorStop(1, 'rgba(255,250,180,0)');
      c.fillStyle = g; c.beginPath(); c.arc(s * 1.2, -s * 0.6, s * 0.5, 0, 6.28); c.fill();
    }
    if (pat === 'dragon') { // whiskers
      c.strokeStyle = '#ffcf33'; c.lineWidth = s * 0.05;
      c.beginPath(); c.moveTo(s * 0.85, s * 0.05); c.quadraticCurveTo(s * 1.3, s * 0.1 + Math.sin(t * 3) * s * 0.15, s * 1.5, s * 0.4);
      c.moveTo(s * 0.85, s * 0.15); c.quadraticCurveTo(s * 1.2, s * 0.4, s * 1.25, s * 0.7 + Math.sin(t * 3 + 1) * s * 0.1); c.stroke();
    }
    if (pat === 'pearl') { c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 10; c.beginPath(); c.arc(-s * 0.1, -s * 0.62, s * 0.14, 0, 6.28); c.fill(); c.shadowBlur = 0; }
    // Eye (the Abyss has glowing cyan eyes).
    const eye = pat === 'eyes' ? 1.7 : pat === 'tiny' ? 1.25 : 1;
    if (pat === 'shadow') {
      c.fillStyle = '#7bf6ff'; c.shadowColor = '#7bf6ff'; c.shadowBlur = 14;
      c.beginPath(); c.ellipse(s * 0.5, -s * 0.12, s * 0.17, s * 0.09, -0.2, 0, 6.28); c.fill(); c.shadowBlur = 0;
    } else {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(s * 0.5, -s * 0.12, s * 0.17 * eye, 0, 6.28); c.fill();
      c.fillStyle = '#10232b'; c.beginPath(); c.arc(s * 0.55, -s * 0.12, s * (f.caught ? 0.05 : 0.09) * eye, 0, 6.28); c.fill();
    }
    if (pat === 'ghost') { c.globalAlpha /= 0.6; }
    if (f.kind === 'king') HATS.crown(c, s, s * 0.42, -s * 0.5);
  }
  // A still picture of a fish (album tiles, discovery card, store previews).
  const imgCache = {};
  function fishImage(f, size, hatId = null) {
    const key = JSON.stringify([f.color, f.species, f.kind, size, hatId]);
    if (imgCache[key]) return imgCache[key];
    const cv = document.createElement('canvas'), dpr = 2;
    cv.width = cv.height = size * dpr;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(size * 0.52, size * 0.62);
    const fish = { size: size * 0.3, phase: 0.6, species: -1, ...f };
    drawFishBody(g, fish, 0.4);
    if (hatId) drawHat(g, fish.size, 0, hatId);
    return (imgCache[key] = cv.toDataURL());
  }

  // ---------- daily missions ----------
  // 'add' missions accumulate across the day; 'max' missions track the best single moment.
  const MISSIONS = {
    fish:  { mode: 'add', goals: [60, 120, 200], reward: 80,  text: n => `Catch ${n} fish` },
    big:   { mode: 'max', goals: [6, 9, 12],     reward: 120, text: n => `Catch ${n}+ fish in one loop` },
    sweep: { mode: 'add', goals: [1, 2, 4],      reward: 120, text: n => `Get ${n} Clean Sweep${n > 1 ? 's' : ''}` },
    score: { mode: 'max', goals: [2000, 5000, 10000], reward: 100, text: n => `Score ${n.toLocaleString()} in one game` },
    combo: { mode: 'max', goals: [3, 4, 5],      reward: 90,  text: n => `Reach a ×${n} combo` },
    gold:  { mode: 'add', goals: [2, 4, 8],      reward: 110, text: n => `Catch ${n} golden fish` },
    games: { mode: 'add', goals: [3, 5, 8],      reward: 70,  text: n => `Play ${n} games` },
    frenzy:{ mode: 'add', goals: [1, 2, 4],      reward: 130, text: n => `Trigger Frenzy ${n} time${n > 1 ? 's' : ''}` },
    rare:  { mode: 'add', goals: [2, 4, 6],      reward: 120, text: n => `Catch ${n} album fish` },
    angle: { mode: 'add', goals: [3, 5, 8],      reward: 100, text: n => `Reel in ${n} catches while fishing` },
    perfect: { mode: 'add', goals: [1, 2, 3],    reward: 130, text: n => `Land ${n} perfect fishing catch${n > 1 ? 'es' : ''}` },
  };
  if (!S.missions || S.missions.day !== today) {
    const ids = Object.keys(MISSIONS).sort(() => r() - 0.5).slice(0, 3);
    S.missions = { day: today, list: ids.map(id => ({ id, goal: pick(MISSIONS[id].goals), prog: 0, done: false, claimed: false })) };
  }
  save();
  function mission(id, value) {
    for (const m of S.missions.list) {
      if (m.id !== id || m.done) continue;
      m.prog = MISSIONS[id].mode === 'add' ? m.prog + value : Math.max(m.prog, value);
      if (m.prog >= m.goal) { m.prog = m.goal; m.done = true; toast('Mission complete: ' + MISSIONS[id].text(m.goal)); }
    }
  }
  const claimable = () => S.missions.list.filter(m => m.done && !m.claimed).length;

  // ---------- pond themes: water colors plus decor painted once onto the background ----------
  const edgeX = (W) => (r() < 0.5 ? r() * W * 0.22 : W - r() * W * 0.22);
  function blob(g, x, y, rx, ry, fill, rot = 0) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); }
  const DECOR = {
    lily(g, W, H, dark) {
      for (let i = 0; i < 9; i++) {
        const x = edgeX(W), y = H * 0.12 + r() * H * 0.88, rr = 18 + r() * 18, a = r() * 6.28;
        blob(g, x + 4, y + 5, rr, rr * 0.9, 'rgba(0,40,40,.25)');
        g.fillStyle = dark ? (i % 3 ? '#2f6b3f' : '#3c7d4c') : (i % 3 ? '#3f9a52' : '#57b368');
        g.beginPath(); g.moveTo(x, y); g.arc(x, y, rr, a + 0.35, a + 6.28 - 0.35); g.closePath(); g.fill();
        if (i % 4 === 0) blob(g, x + rr * 0.2, y - rr * 0.2, rr * 0.28, rr * 0.28, '#ffc2d6');
      }
    },
    reef(g, W, H) {
      for (let i = 0; i < 6; i++) blob(g, edgeX(W), H * (0.2 + r() * 0.8), 50 + r() * 50, 30 + r() * 20, 'rgba(242,212,155,.55)');
      for (let i = 0; i < 10; i++) {
        const x = edgeX(W), y = H * (0.15 + r() * 0.85), col = pick(['#ff7f7f', '#ffb347', '#ff6fb5', '#c86bfa']);
        for (let k = 0; k < 6; k++) blob(g, x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, 7 + r() * 8, 7 + r() * 8, col);
      }
      for (let i = 0; i < 6; i++) blob(g, edgeX(W), H * r(), 6, 5, '#fff3e0');
    },
    koi(g, W, H) {
      for (let i = 0; i < 14; i++) {
        const x = edgeX(W), y = H * r(), rr = 14 + r() * 22;
        blob(g, x + 3, y + 4, rr, rr * 0.8, 'rgba(0,0,0,.25)');
        blob(g, x, y, rr, rr * 0.8, pick(['#8d9aa3', '#a7b2b8', '#76838c']));
        blob(g, x - rr * 0.3, y - rr * 0.3, rr * 0.35, rr * 0.2, 'rgba(255,255,255,.25)');
        if (r() < 0.5) blob(g, x + rr * 0.4, y + rr * 0.3, rr * 0.3, rr * 0.2, '#5d8f4e');
      }
    },
    arctic(g, W, H) {
      for (let i = 0; i < 9; i++) {
        const x = edgeX(W), y = H * r(), rr = 22 + r() * 30, n = 6 + ((r() * 3) | 0);
        g.fillStyle = 'rgba(40,90,130,.25)';
        g.beginPath(); for (let k = 0; k < n; k++) { const a = k / n * 6.28, d = rr * (0.7 + r() * 0.4); g.lineTo(x + 4 + Math.cos(a) * d, y + 6 + Math.sin(a) * d); } g.fill();
        g.fillStyle = '#f4fbff';
        g.beginPath(); for (let k = 0; k < n; k++) { const a = k / n * 6.28, d = rr * (0.7 + r() * 0.4); g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.fill();
      }
    },
    sunset(g, W, H) { DECOR.lily(g, W, H, true); },
    candy(g, W, H) {
      for (let i = 0; i < 8; i++) {
        const x = edgeX(W), y = H * r(), rr = 14 + r() * 12, col = pick(['#ff5d8f', '#4cc9f0', '#ffd84d', '#7bd389']);
        g.fillStyle = '#fff'; g.fillRect(x - 2, y, 4, rr * 2.2);
        blob(g, x, y, rr, rr, col);
        g.strokeStyle = '#fff'; g.lineWidth = 3;
        g.beginPath(); for (let a = 0; a < 12; a += 0.3) g.lineTo(x + Math.cos(a) * a / 12 * rr, y + Math.sin(a) * a / 12 * rr); g.stroke();
      }
      for (let i = 0; i < 70; i++) { g.save(); g.translate(r() * W, r() * H); g.rotate(r() * 3); g.fillStyle = pick(['#ff5d8f', '#4cc9f0', '#ffd84d', '#fff']); g.fillRect(-4, -1.5, 8, 3); g.restore(); }
    },
    deep(g, W, H) {
      g.strokeStyle = '#1f5a3a'; g.lineWidth = 6; g.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const x = edgeX(W), h = 80 + r() * 140;
        g.beginPath(); g.moveTo(x, H); g.bezierCurveTo(x + 30, H - h * 0.3, x - 30, H - h * 0.7, x + 10, H - h); g.stroke();
      }
      for (let i = 0; i < 60; i++) {
        const x = r() * W, y = r() * H, rr = 1 + r() * 2.5, gr = g.createRadialGradient(x, y, 0, x, y, rr * 4);
        gr.addColorStop(0, 'rgba(120,255,240,.9)'); gr.addColorStop(1, 'rgba(120,255,240,0)');
        g.fillStyle = gr; g.fillRect(x - rr * 4, y - rr * 4, rr * 8, rr * 8);
      }
    },
    neon(g, W, H) {
      g.strokeStyle = 'rgba(255,79,216,.14)'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let i = 0; i < 6; i++) {
        const x = edgeX(W), y = H * r(), rr = 20 + r() * 30;
        g.shadowColor = g.strokeStyle = pick(['#ff4fd8', '#4cf0ff', '#b8ff4c']); g.shadowBlur = 16; g.lineWidth = 3;
        g.beginPath(); g.arc(x, y, rr, 0, 6.28); g.stroke();
      }
      g.shadowBlur = 0;
    },
    space(g, W, H) {
      for (let i = 0; i < 160; i++) blob(g, r() * W, r() * H, r() * 1.4 + 0.3, r() * 1.4 + 0.3, `rgba(255,255,255,${0.3 + r() * 0.7})`);
      for (let i = 0; i < 3; i++) {
        const x = edgeX(W), y = H * r(), rr = 16 + r() * 22, col = pick(['#ff8a4c', '#4cc9f0', '#c86bfa', '#7bd389']);
        blob(g, x, y, rr, rr, col);
        blob(g, x - rr * 0.3, y - rr * 0.3, rr * 0.4, rr * 0.3, 'rgba(255,255,255,.25)');
        if (i === 0) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, rr * 1.7, rr * 0.45, -0.3, 0, 6.28); g.stroke(); }
      }
    },
  };
  const themes = [
    { id: 'lily', name: 'Lily Pond', cost: 0, water: ['#2fa3a8', '#167a8a', '#0b4f60'] },
    { id: 'reef', name: 'Coral Reef', cost: 500, water: ['#5fd3e0', '#2a9fc0', '#13628a'] },
    { id: 'koi', name: 'Koi Garden', cost: 700, water: ['#3c8f7c', '#22695c', '#123f38'] },
    { id: 'arctic', name: 'Arctic', cost: 900, lv: 3, water: ['#bfe9f7', '#79c3e3', '#3d86b0'] },
    { id: 'sunset', name: 'Sunset Bay', cost: 1200, lv: 4, water: ['#ffb38a', '#d8667a', '#5b3a7a'] },
    { id: 'candy', name: 'Candy Lagoon', cost: 1500, lv: 5, water: ['#ffd1e8', '#ff9ccc', '#c45a9a'] },
    { id: 'deep', name: 'Deep Sea', cost: 2000, lv: 7, water: ['#1d3f73', '#0f2650', '#060f26'] },
    { id: 'neon', name: 'Neon Pool', cost: 2800, lv: 9, water: ['#2a1846', '#160c2b', '#07030f'] },
    { id: 'space', name: 'Space Pond', cost: 4000, lv: 12, water: ['#3a2a6e', '#1a1240', '#05030f'] },
  ];
  themes.forEach(t => { t.sw = `linear-gradient(135deg, ${t.water[0]}, ${t.water[2]})`; });
  function paintPond(g, W, H) {
    const t = themes.find(t => t.id === S.equip.theme) || themes[0];
    const grad = g.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H / 2, Math.max(W, H) * 0.75);
    grad.addColorStop(0, t.water[0]); grad.addColorStop(0.6, t.water[1]); grad.addColorStop(1, t.water[2]);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    DECOR[t.id](g, W, H);
  }

  // ---------- fish hats, drawn in the fish's own frame ----------
  function shape(c, fill, path) { c.fillStyle = fill; c.beginPath(); path(); c.closePath(); c.fill(); }
  const HATS = {
    party(c, s, hx, hy) {
      shape(c, '#ff5d8f', () => { c.moveTo(hx - s * 0.24, hy); c.lineTo(hx + s * 0.24, hy); c.lineTo(hx, hy - s * 0.85); });
      shape(c, '#ffd84d', () => c.arc(hx - s * 0.05, hy - s * 0.3, s * 0.05, 0, 6.28));
      shape(c, '#4cc9f0', () => c.arc(hx + s * 0.06, hy - s * 0.12, s * 0.05, 0, 6.28));
      shape(c, '#ffd84d', () => c.arc(hx, hy - s * 0.88, s * 0.11, 0, 6.28));
    },
    beanie(c, s, hx, hy) {
      shape(c, '#e63946', () => c.arc(hx, hy + s * 0.04, s * 0.3, Math.PI, 0));
      shape(c, '#fff', () => c.rect(hx - s * 0.32, hy - s * 0.02, s * 0.64, s * 0.1));
      shape(c, '#fff', () => c.arc(hx, hy - s * 0.3, s * 0.1, 0, 6.28));
    },
    bow(c, s, hx, hy) {
      shape(c, '#ff5d8f', () => { c.moveTo(hx, hy - s * 0.12); c.lineTo(hx - s * 0.32, hy - s * 0.34); c.lineTo(hx - s * 0.32, hy + s * 0.04); });
      shape(c, '#ff5d8f', () => { c.moveTo(hx, hy - s * 0.12); c.lineTo(hx + s * 0.32, hy - s * 0.34); c.lineTo(hx + s * 0.32, hy + s * 0.04); });
      shape(c, '#c42d5f', () => c.arc(hx, hy - s * 0.12, s * 0.09, 0, 6.28));
    },
    tophat(c, s, hx, hy) {
      shape(c, '#1a1a1a', () => c.rect(hx - s * 0.34, hy - s * 0.06, s * 0.68, s * 0.09));
      shape(c, '#1a1a1a', () => c.rect(hx - s * 0.21, hy - s * 0.62, s * 0.42, s * 0.58));
      shape(c, '#e63946', () => c.rect(hx - s * 0.21, hy - s * 0.18, s * 0.42, s * 0.08));
    },
    cowboy(c, s, hx, hy) {
      shape(c, '#8b5a2b', () => c.ellipse(hx, hy - s * 0.02, s * 0.46, s * 0.09, 0, 0, 6.28));
      shape(c, '#8b5a2b', () => { c.moveTo(hx - s * 0.22, hy); c.lineTo(hx - s * 0.18, hy - s * 0.4); c.lineTo(hx, hy - s * 0.32); c.lineTo(hx + s * 0.18, hy - s * 0.4); c.lineTo(hx + s * 0.22, hy); });
      shape(c, '#3d2410', () => c.rect(hx - s * 0.21, hy - s * 0.12, s * 0.42, s * 0.07));
    },
    shades(c, s) {
      shape(c, '#111', () => { c.rect(s * 0.3, -s * 0.24, s * 0.4, s * 0.2); });
      shape(c, '#111', () => c.rect(-s * 0.1, -s * 0.17, s * 0.42, s * 0.04));
      shape(c, 'rgba(255,255,255,.6)', () => c.rect(s * 0.36, -s * 0.21, s * 0.12, s * 0.04));
    },
    propeller(c, s, hx, hy, t) {
      shape(c, '#3a86ff', () => c.arc(hx, hy + s * 0.04, s * 0.28, Math.PI, 0));
      shape(c, '#ffd84d', () => c.rect(hx - s * 0.03, hy - s * 0.42, s * 0.06, s * 0.2));
      shape(c, '#e63946', () => c.ellipse(hx, hy - s * 0.44, s * 0.42 * Math.abs(Math.cos(t * 18)) + s * 0.03, s * 0.06, 0, 0, 6.28));
    },
    chef(c, s, hx, hy) {
      shape(c, '#fff', () => c.rect(hx - s * 0.24, hy - s * 0.22, s * 0.48, s * 0.22));
      for (const dx of [-0.18, 0, 0.18]) shape(c, '#fff', () => c.arc(hx + dx * s, hy - s * 0.36, s * 0.18, 0, 6.28));
    },
    pirate(c, s, hx, hy) {
      shape(c, '#1a1a1a', () => { c.moveTo(hx - s * 0.4, hy); c.quadraticCurveTo(hx, hy - s * 0.75, hx + s * 0.4, hy); c.quadraticCurveTo(hx, hy - s * 0.15, hx - s * 0.4, hy); });
      shape(c, '#fff', () => c.arc(hx, hy - s * 0.25, s * 0.08, 0, 6.28));
    },
    wizard(c, s, hx, hy) {
      shape(c, '#5a189a', () => c.ellipse(hx, hy - s * 0.02, s * 0.4, s * 0.08, 0, 0, 6.28));
      shape(c, '#7b2cbf', () => { c.moveTo(hx - s * 0.25, hy); c.lineTo(hx + s * 0.25, hy); c.lineTo(hx - s * 0.12, hy - s * 1.0); });
      shape(c, '#ffd84d', () => c.arc(hx - s * 0.02, hy - s * 0.35, s * 0.07, 0, 6.28));
    },
    halo(c, s, hx, hy, t) {
      c.strokeStyle = '#ffe066'; c.lineWidth = s * 0.08; c.shadowColor = '#ffe066'; c.shadowBlur = 8;
      c.beginPath(); c.ellipse(hx, hy - s * 0.38 - Math.sin(t * 4) * s * 0.05, s * 0.3, s * 0.09, 0, 0, 6.28); c.stroke();
      c.shadowBlur = 0;
    },
    crown(c, s, hx, hy) {
      shape(c, '#ffcf33', () => {
        c.moveTo(hx - s * 0.3, hy); c.lineTo(hx - s * 0.3, hy - s * 0.38); c.lineTo(hx - s * 0.15, hy - s * 0.2); c.lineTo(hx, hy - s * 0.45);
        c.lineTo(hx + s * 0.15, hy - s * 0.2); c.lineTo(hx + s * 0.3, hy - s * 0.38); c.lineTo(hx + s * 0.3, hy);
      });
      shape(c, '#e63946', () => c.arc(hx, hy - s * 0.12, s * 0.06, 0, 6.28));
      shape(c, '#3a86ff', () => c.arc(hx - s * 0.17, hy - s * 0.1, s * 0.045, 0, 6.28));
      shape(c, '#3a86ff', () => c.arc(hx + s * 0.17, hy - s * 0.1, s * 0.045, 0, 6.28));
    },
    captain(c, s, hx, hy) {
      shape(c, '#1d3557', () => c.ellipse(hx + s * 0.12, hy, s * 0.4, s * 0.07, 0, 0, 6.28));
      shape(c, '#ffffff', () => { c.moveTo(hx - s * 0.3, hy - s * 0.04); c.quadraticCurveTo(hx, hy - s * 0.55, hx + s * 0.32, hy - s * 0.04); });
      shape(c, '#1d3557', () => c.rect(hx - s * 0.3, hy - s * 0.14, s * 0.62, s * 0.12));
      shape(c, '#ffcf33', () => c.arc(hx, hy - s * 0.26, s * 0.08, 0, 6.28));
    },
    // Fishing-only hats (see fishing.js for how each one drops).
    anglercap(c, s, hx, hy) {
      shape(c, '#2f7d4f', () => c.ellipse(hx, hy - s * 0.02, s * 0.44, s * 0.08, 0, 0, 6.28));
      shape(c, '#3f9a62', () => c.arc(hx, hy, s * 0.27, Math.PI, 0));
      shape(c, '#e9c98b', () => c.rect(hx - s * 0.27, hy - s * 0.1, s * 0.54, s * 0.06));
      shape(c, '#ff5d73', () => c.ellipse(hx + s * 0.18, hy - s * 0.2, s * 0.09, s * 0.04, -0.6, 0, 6.28));
      c.strokeStyle = '#d8d8d8'; c.lineWidth = s * 0.035; c.beginPath(); c.arc(hx + s * 0.23, hy - s * 0.1, s * 0.05, 0, Math.PI * 1.4); c.stroke();
    },
    kelp(c, s, hx, hy, t) {
      for (const [dx, h, col] of [[-0.16, 0.5, '#2f9a52'], [0, 0.7, '#3fb868'], [0.16, 0.5, '#2f9a52']]) {
        const sway = Math.sin(t * 3 + dx * 9) * s * 0.07;
        c.strokeStyle = col; c.lineWidth = s * 0.1; c.lineCap = 'round';
        c.beginPath(); c.moveTo(hx + dx * s, hy); c.quadraticCurveTo(hx + dx * s + sway * 2, hy - s * h * 0.5, hx + dx * s + sway, hy - s * h); c.stroke();
      }
      shape(c, '#1f7a3e', () => c.ellipse(hx, hy, s * 0.3, s * 0.07, 0, 0, 6.28));
    },
    pearltiara(c, s, hx, hy, t) {
      c.strokeStyle = '#dfe8f0'; c.lineWidth = s * 0.06;
      c.beginPath(); c.arc(hx, hy + s * 0.08, s * 0.3, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      [[-0.26, -0.06], [-0.13, -0.2], [0, -0.26], [0.13, -0.2], [0.26, -0.06]].forEach(([dx, dy], i) => {
        shape(c, '#fff', () => c.arc(hx + dx * s, hy + dy * s, s * (i === 2 ? 0.075 : 0.055), 0, 6.28));
        shape(c, `rgba(255,190,225,${0.5 + Math.sin(t * 5 + i) * 0.3})`, () => c.arc(hx + dx * s - s * 0.015, hy + dy * s - s * 0.015, s * 0.02, 0, 6.28));
      });
    },
    junkcrown(c, s, hx, hy) {
      shape(c, '#8f9aa3', () => {
        c.moveTo(hx - s * 0.3, hy); c.lineTo(hx - s * 0.32, hy - s * 0.34); c.lineTo(hx - s * 0.14, hy - s * 0.16); c.lineTo(hx, hy - s * 0.4);
        c.lineTo(hx + s * 0.14, hy - s * 0.16); c.lineTo(hx + s * 0.32, hy - s * 0.34); c.lineTo(hx + s * 0.3, hy);
      });
      shape(c, '#a4562a', () => c.arc(hx - s * 0.12, hy - s * 0.08, s * 0.045, 0, 6.28));
      shape(c, '#a4562a', () => c.arc(hx + s * 0.14, hy - s * 0.1, s * 0.035, 0, 6.28));
      shape(c, '#3fb868', () => c.arc(hx, hy - s * 0.4, s * 0.07, 0, 6.28));
    },
    lanterncap(c, s, hx, hy, t) {
      shape(c, '#22303a', () => c.arc(hx, hy + s * 0.04, s * 0.28, Math.PI, 0));
      shape(c, '#22303a', () => c.ellipse(hx + s * 0.1, hy, s * 0.38, s * 0.06, 0, 0, 6.28));
      c.strokeStyle = '#22303a'; c.lineWidth = s * 0.04;
      c.beginPath(); c.moveTo(hx, hy - s * 0.25); c.quadraticCurveTo(hx + s * 0.25, hy - s * 0.55, hx + s * 0.45, hy - s * 0.3); c.stroke();
      c.shadowColor = '#fff59d'; c.shadowBlur = 10 + Math.sin(t * 5) * 4;
      shape(c, '#fff59d', () => c.arc(hx + s * 0.45, hy - s * 0.3, s * 0.09, 0, 6.28));
      c.shadowBlur = 0;
    },
  };
  const hats = [
    { id: 'none', name: 'No hat', cost: 0 },
    { id: 'party', name: 'Party Hat', cost: 120 }, { id: 'beanie', name: 'Beanie', cost: 200 },
    { id: 'bow', name: 'Bow', cost: 250 }, { id: 'tophat', name: 'Top Hat', cost: 400 },
    { id: 'cowboy', name: 'Cowboy', cost: 500 }, { id: 'shades', name: 'Cool Shades', cost: 600 },
    { id: 'propeller', name: 'Propeller Cap', cost: 800, lv: 3 }, { id: 'chef', name: 'Chef Hat', cost: 900 },
    { id: 'pirate', name: 'Pirate Hat', cost: 1200, lv: 5 }, { id: 'wizard', name: 'Wizard Hat', cost: 1500, lv: 6 },
    { id: 'halo', name: 'Halo', cost: 2500, lv: 8 }, { id: 'crown', name: 'Crown', cost: 4000, lv: 10 },
    { id: 'captain', name: "Captain's Hat", cost: 0, album: true },
    // Only from fishing: treasure chests, a full tackle box, or a legendary catch.
    { id: 'anglercap', name: "Angler's Cap", cost: 0, fish: 'Treasure chest' },
    { id: 'kelp', name: 'Kelp Crown', cost: 0, fish: 'Treasure chest' },
    { id: 'pearltiara', name: 'Pearl Tiara', cost: 0, fish: 'Treasure chest' },
    { id: 'junkcrown', name: 'Junk Crown', cost: 0, fish: 'Full tackle box' },
    { id: 'lanterncap', name: 'Lantern Cap', cost: 0, fish: 'Legendary catch' },
  ];
  function drawHat(c, s, t, id = S.equip.hat) {
    if (HATS[id]) HATS[id](c, s, s * 0.42, -s * 0.48, t);
  }

  // Sheep and ball accessories. Some are exclusive to a skin; the rest reuse the hats above, re-anchored to the sheep's head
  // or the top of the ball.
  const ACC = {
    flowers(c, s, hx, hy) {
      [['#ff7aa8', -2], ['#fff', -1], ['#ffd84d', 0], ['#ff7aa8', 1], ['#c9a0ff', 2]].forEach(([col, i]) => {
        const x = hx + i * s * 0.14, y = hy - s * 0.02 - (2 - Math.abs(i)) * s * 0.03;
        shape(c, col, () => c.arc(x, y, s * 0.085, 0, 6.28)); shape(c, '#ffb703', () => c.arc(x, y, s * 0.035, 0, 6.28));
      });
    },
    bell(c, s, hx, hy, t) {
      c.strokeStyle = '#e63946'; c.lineWidth = s * 0.12; c.lineCap = 'round';
      c.beginPath(); c.moveTo(s * 0.6, -s * 0.34); c.lineTo(s * 0.7, s * 0.28); c.stroke();
      const sw = Math.sin(t * 6) * s * 0.03;
      shape(c, '#ffcf33', () => c.arc(s * 0.7 + sw, s * 0.36, s * 0.11, 0, 6.28));
      shape(c, 'rgba(255,255,255,.7)', () => c.arc(s * 0.67 + sw, s * 0.33, s * 0.035, 0, 6.28));
    },
    scarf(c, s) {
      shape(c, '#e63946', () => { c.moveTo(s * 0.5, -s * 0.34); c.lineTo(s * 0.74, -s * 0.3); c.lineTo(s * 0.8, s * 0.3); c.lineTo(s * 0.56, s * 0.34); });
      shape(c, '#fff', () => { c.moveTo(s * 0.55, -s * 0.12); c.lineTo(s * 0.77, -s * 0.1); c.lineTo(s * 0.78, s * 0.02); c.lineTo(s * 0.56, 0); });
      shape(c, '#e63946', () => { c.moveTo(s * 0.52, s * 0.2); c.lineTo(s * 0.7, s * 0.3); c.lineTo(s * 0.5, s * 0.62); c.lineTo(s * 0.36, s * 0.5); });
    },
    woolcrown(c, s, hx, hy) {
      shape(c, '#cfe9ff', () => c.rect(hx - s * 0.3, hy - s * 0.1, s * 0.6, s * 0.1));
      [-0.24, -0.08, 0.08, 0.24].forEach((dx, i) => shape(c, '#fff', () => c.arc(hx + dx * s, hy - s * (i % 2 ? 0.2 : 0.14), s * 0.14, 0, 6.28)));
      shape(c, '#ffd84d', () => c.arc(hx, hy - s * 0.3, s * 0.06, 0, 6.28));
    },
    googly(c, s, hx, hy, t) {
      for (const dx of [-0.32, 0.3]) {
        const x = dx * s, y = -s * 0.12;
        shape(c, '#fff', () => c.arc(x, y, s * 0.26, 0, 6.28));
        c.strokeStyle = '#222'; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, s * 0.26, 0, 6.28); c.stroke();
        shape(c, '#111', () => c.arc(x + Math.cos(t * 5 + dx * 9) * s * 0.09, y + Math.sin(t * 7 + dx * 5) * s * 0.09 + s * 0.03, s * 0.11, 0, 6.28));
      }
    },
    mustache(c, s) {
      shape(c, '#2a1a10', () => {
        c.moveTo(0, s * 0.14); c.quadraticCurveTo(s * 0.18, s * 0.02, s * 0.42, s * 0.2); c.quadraticCurveTo(s * 0.2, s * 0.3, 0, s * 0.24);
        c.quadraticCurveTo(-s * 0.2, s * 0.3, -s * 0.42, s * 0.2); c.quadraticCurveTo(-s * 0.18, s * 0.02, 0, s * 0.14);
      });
    },
    ribbon(c, s, hx, hy) {
      c.strokeStyle = '#e63946'; c.lineWidth = s * 0.2;
      c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(0, -s); c.lineTo(0, s); c.stroke();
      shape(c, '#e63946', () => { c.moveTo(0, hy + s * 0.04); c.lineTo(-s * 0.3, hy - s * 0.18); c.lineTo(-s * 0.3, hy + s * 0.1); });
      shape(c, '#e63946', () => { c.moveTo(0, hy + s * 0.04); c.lineTo(s * 0.3, hy - s * 0.18); c.lineTo(s * 0.3, hy + s * 0.1); });
      shape(c, '#b3202f', () => c.arc(0, hy + s * 0.02, s * 0.08, 0, 6.28));
    },
    champion(c, s, hx, hy) {
      HATS.crown(c, s * 0.9, hx, hy);
      shape(c, '#fff', () => c.arc(hx, hy - s * 0.5, s * 0.1, 0, 6.28)); shape(c, '#e63946', () => c.arc(hx, hy - s * 0.5, s * 0.055, 0, 6.28));
    },
  };
  function drawAcc(c, sk, s, t, id = (S.skinEquip[sk] || {}).hat) {
    if (!id || id === 'none') return;
    if (sk === 'sheep') {
      if (ACC[id]) ACC[id](c, s, s * 0.95, -s * 0.36, t);
      else if (HATS[id]) HATS[id](c, s * 0.85, s * 0.95, -s * 0.34, t);
    } else {
      const rr = s * 0.95;
      if (ACC[id]) ACC[id](c, rr, 0, -rr * 0.82, t);
      else if (HATS[id]) HATS[id](c, rr * 0.95, 0, -rr * 0.78, t);
    }
  }

  // Sheep fields and playrooms (backdrops for the sheep and toy-ball skins), painted in game.js.
  const PASTURES = {
    meadow: { name: 'Meadow', cost: 0, sky: ['#9be36d', '#5fae4a'], decor: 'flowers', fence: ['#8a5a2b', '#b07a3e'], tuft: 'rgba(30,100,40,.45)' },
    sunset: { name: 'Sunset Hill', cost: 600, lv: 3, sky: ['#ffd27a', '#8fb84a'], decor: 'flowers', fence: ['#7a4a22', '#b57a3a'], tuft: 'rgba(70,90,20,.45)', glow: 'rgba(255,120,60,.16)' },
    autumn: { name: 'Autumn Farm', cost: 1000, lv: 5, sky: ['#e6b85a', '#b0722f'], decor: 'leaves', fence: ['#6b4a2b', '#a87a47'], tuft: 'rgba(120,70,20,.45)' },
    snow: { name: 'Snowy Field', cost: 1500, lv: 7, sky: ['#f7fcff', '#cfe3ee'], decor: 'snow', fence: ['#6b5a4a', '#a89a8a'], tuft: 'rgba(120,150,170,.5)' },
    night: { name: 'Moonlit Farm', cost: 2400, lv: 9, sky: ['#2f4d70', '#14283d'], decor: 'fireflies', fence: ['#3d2a1a', '#6b4a30'], tuft: 'rgba(10,30,40,.5)' },
  };
  const ROOMS = {
    mat: { name: 'Foam Mat', cost: 0, tiles: ['#ffb3c7', '#ffe08a', '#a8e6cf', '#a5d8ff'] },
    candy: { name: 'Candy Floor', cost: 600, lv: 3, tiles: ['#ff9ecb', '#ffd1e8', '#d6b3ff', '#fff0f7'] },
    primary: { name: 'Primary Play', cost: 1000, lv: 5, tiles: ['#ff6b6b', '#4d96ff', '#ffd93d', '#6bcf7f'] },
    ballpit: { name: 'Ball Pit', cost: 1500, lv: 7, tiles: ['#4d96ff', '#4d96ff', '#4d96ff', '#4d96ff'], pit: true },
    glow: { name: 'Glow Room', cost: 2400, lv: 9, tiles: ['#1b1035', '#241446', '#14304d', '#2b1450'], neon: true },
  };
  const swOf = (a, b) => `linear-gradient(135deg, ${a}, ${b})`;
  const SKIN_CATALOG = {
    sheep: {
      hat: [
        { id: 'none', name: 'No gear', cost: 0 }, { id: 'flowers', name: 'Flower Crown', cost: 300 }, { id: 'bell', name: 'Bell Collar', cost: 350 },
        { id: 'scarf', name: 'Woolly Scarf', cost: 500 }, { id: 'party', name: 'Party Hat', cost: 120 }, { id: 'bow', name: 'Bow', cost: 200 },
        { id: 'beanie', name: 'Beanie', cost: 250 }, { id: 'cowboy', name: 'Cowboy', cost: 400 }, { id: 'wizard', name: 'Wizard Hat', cost: 900, lv: 6 },
        { id: 'halo', name: 'Halo', cost: 2000, lv: 8 }, { id: 'crown', name: 'Crown', cost: 3500, lv: 10 }, { id: 'woolcrown', name: 'Wool Crown', cost: 0, album: true },
      ],
      theme: Object.entries(PASTURES).map(([id, p]) => ({ id, ...p, sw: swOf(p.sky[0], p.sky[1]) })),
    },
    balls: {
      hat: [
        { id: 'none', name: 'No gear', cost: 0 }, { id: 'googly', name: 'Googly Eyes', cost: 250 }, { id: 'mustache', name: 'Mustache', cost: 350 },
        { id: 'ribbon', name: 'Gift Ribbon', cost: 450 }, { id: 'party', name: 'Party Hat', cost: 120 }, { id: 'bow', name: 'Bow', cost: 200 },
        { id: 'tophat', name: 'Top Hat', cost: 400 }, { id: 'propeller', name: 'Propeller Cap', cost: 800, lv: 3 }, { id: 'chef', name: 'Chef Hat', cost: 900 },
        { id: 'halo', name: 'Halo', cost: 2000, lv: 8 }, { id: 'champion', name: 'Champion Crown', cost: 0, album: true },
      ],
      theme: Object.entries(ROOMS).map(([id, p]) => ({ id, ...p, sw: swOf(p.tiles[0], p.tiles[2]) })),
    },
  };
  const skinTheme = sk => (sk === 'sheep' ? PASTURES[S.skinEquip.sheep.theme] || PASTURES.meadow : ROOMS[S.skinEquip.balls.theme] || ROOMS.mat);

  // ---------- ropes ----------
  const ropes = [
    { id: 'rope', name: 'Classic Rope', cost: 0, color: '#e9c98b', dash: 'rgba(120,80,30,.55)', sw: 'repeating-linear-gradient(45deg,#e9c98b 0 6px,#b8925a 6px 9px)' },
    { id: 'vine', name: 'Jungle Vine', cost: 150, color: '#6cbf4f', dash: '#2f7a2a', sw: 'repeating-linear-gradient(45deg,#6cbf4f 0 6px,#2f7a2a 6px 9px)' },
    { id: 'candy', name: 'Candy Cane', cost: 300, color: '#ffffff', dash: '#e63946', dashLen: [9, 9], sw: 'repeating-linear-gradient(45deg,#fff 0 7px,#e63946 7px 14px)' },
    { id: 'neon', name: 'Neon', cost: 600, lv: 2, color: '#ff4fd8', glow: true, sw: '#ff4fd8' },
    { id: 'gold', name: 'Gold Chain', cost: 1200, lv: 4, color: '#ffd84d', dash: '#9a7000', dashLen: [5, 4], glow: true, sw: 'linear-gradient(135deg,#fff1a8,#d9a400)' },
    { id: 'laser', name: 'Laser', cost: 2000, lv: 7, color: '#ff3b3b', core: '#ffffff', glow: true, sw: 'linear-gradient(90deg,#ff3b3b,#fff,#ff3b3b)' },
    { id: 'rainbow', name: 'Rainbow', cost: 3500, lv: 10, rainbow: true, glow: true, sw: 'linear-gradient(90deg,red,orange,yellow,lime,cyan,blue,violet)' },
  ];
  const rope = () => ropes.find(x => x.id === S.equip.rope) || ropes[0];

  // ---------- pop effects ----------
  const pops = [
    { id: 'splash', name: 'Splash', cost: 0, icon: '💦' }, { id: 'confetti', name: 'Confetti', cost: 300, icon: '🎉' },
    { id: 'hearts', name: 'Hearts', cost: 500, icon: '💖' }, { id: 'stars', name: 'Stardust', cost: 700, lv: 3, icon: '⭐' },
    { id: 'coins', name: 'Coin Shower', cost: 1200, lv: 5, icon: '🪙' }, { id: 'fireworks', name: 'Fireworks', cost: 2500, lv: 8, icon: '🎆' },
  ];
  const BRIGHT = ['#ff006e', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#ff8a4c'];
  function popParticles(x, y, color) {
    const out = [], P = (o) => out.push({ x, y, rot: r() * 3, spin: (r() - 0.5) * 12, ...o });
    const burst = (n, sp0, sp1, o) => { for (let k = 0; k < n; k++) { const a = r() * 6.28, sp = sp0 + r() * (sp1 - sp0); P({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ...o() }); } };
    const life = (a, b) => { const l = a + r() * (b - a); return { life: l, max: l }; };
    switch (S.equip.pop) {
      case 'confetti': burst(16, 80, 280, () => ({ shape: 'rect', color: pick(BRIGHT), size: 4 + r() * 3, g: 260, ...life(0.6, 1.1) })); break;
      case 'hearts': burst(9, 40, 160, () => ({ shape: 'heart', color: pick(['#ff4d6d', '#ff8fab', '#ffc2d1']), size: 7 + r() * 5, g: -40, ...life(0.6, 1) })); break;
      case 'stars': burst(12, 60, 240, () => ({ shape: 'star', color: pick(['#ffd84d', '#fff', '#ffe9a8']), size: 5 + r() * 6, g: 40, ...life(0.5, 0.9) })); break;
      case 'coins': burst(8, 60, 220, () => ({ shape: 'coin', color: '#ffcf33', size: 6 + r() * 3, g: 420, ...life(0.7, 1.1) })); break;
      case 'fireworks':
        burst(22, 180, 320, () => ({ shape: 'dot', color: pick(BRIGHT), size: 2.5 + r() * 2, g: 120, ...life(0.5, 0.9) }));
        burst(6, 20, 80, () => ({ shape: 'star', color: '#fff', size: 8 + r() * 4, g: 0, ...life(0.3, 0.5) }));
        break;
      default:
        burst(10, 80, 260, () => ({ shape: 'dot', color, size: 2.5 + r() * 3, g: 300, ...life(0.4, 0.8) }));
        burst(4, 40, 140, () => ({ shape: 'star', color: '#fff', size: 5 + r() * 4, g: 0, ...life(0.4, 0.7) }));
        for (let k = 0; k < 5; k++) P({ vx: (r() - 0.5) * 120, vy: -120 - r() * 100, shape: 'dot', color: 'rgba(220,250,255,.9)', size: 2 + r() * 1.5, g: 600, life: 0.6, max: 0.6 });
    }
    return out;
  }

  const CATALOG = { hat: hats, theme: themes, rope: ropes, pop: pops };
  // Adds a random cosmetic the player doesn't own yet (never album, fishing or level-locked items) and returns its name, or null.
  function grantRandomCosmetic() {
    const pool = [];
    for (const [cat, list] of Object.entries(CATALOG)) {
      for (const it of list) if (!it.album && !it.fish && it.cost > 0 && (it.lv || 0) <= S.level && !S.owned[cat].includes(it.id)) pool.push({ own: S.owned[cat], id: it.id, label: it.name });
    }
    for (const sk of ['sheep', 'balls']) {
      if (!S.skinsOwned.includes(sk)) continue;
      for (const cat of ['hat', 'theme']) {
        for (const it of SKIN_CATALOG[sk][cat]) if (!it.album && it.cost > 0 && (it.lv || 0) <= S.level && !S.skinOwned[sk][cat].includes(it.id)) pool.push({ own: S.skinOwned[sk][cat], id: it.id, label: `${it.name} (${sk})` });
      }
    }
    if (!pool.length) return null;
    const p = pick(pool);
    p.own.push(p.id);
    save();
    return p.label;
  }
  const CAT_LABEL = { hat: 'Fish hat', theme: 'Pond', rope: 'Rope', pop: 'Pop effect' };
  // Hats and backdrops are per skin; ropes and pop effects are shared by all skins.
  const skinned = c => curSkin() !== 'fish' && (c === 'hat' || c === 'theme');
  const catalogOf = c => (skinned(c) ? SKIN_CATALOG[curSkin()][c] : CATALOG[c]);
  const ownedOf = c => (skinned(c) ? S.skinOwned[curSkin()][c] : S.owned[c]);
  const equipOf = c => (skinned(c) ? S.skinEquip[curSkin()][c] : S.equip[c]);
  const setEquip = (c, id) => { if (skinned(c)) S.skinEquip[curSkin()][c] = id; else S.equip[c] = id; };
  const catLabel = c => ({ hat: curSkin() === 'fish' ? 'Fish hat' : 'Gear', theme: { fish: 'Pond', sheep: 'Field', balls: 'Room' }[curSkin()], rope: 'Rope', pop: 'Pop effect' }[c]);

  // ---------- run tracking ----------
  let run = null;
  function startRun() {
    run = { fish: 0, catches: 0, biggest: 0, bestCombo: 0, sweeps: 0, golds: 0, tangles: 0, colors: [0, 0, 0, 0, 0],
      frenzies: 0, kings: 0, specials: 0, bonusCoins: 0, newSpecies: [], milestones: 0, msCoins: 0, perfects: 0, clutches: 0, bestPts: 0, bestN: 0, bestCombo: 0 };
  }
  function onCatch({ n, golds, sweep, combo, color, species = 0, specials = 0, total = 0 }) {
    run.fish += n; run.catches++; run.golds += golds; run.biggest = Math.max(run.biggest, n);
    if (total > run.bestPts) { run.bestPts = total; run.bestN = n; run.bestCombo = Math.min(combo, 5); } // the best single catch, shown on the results screen
    run.bestCombo = Math.max(run.bestCombo, combo); run.specials += specials;
    if (sweep) run.sweeps++;
    if (color !== undefined && color >= 0) run.colors[color] += n - golds;
    mission('fish', n); mission('big', n); mission('combo', combo);
    if (golds) mission('gold', golds);
    if (sweep) mission('sweep', 1);
    if (species) mission('rare', species);
  }
  const onTangle = () => { run.tangles++; };
  const onPerfect = tier => { if (tier === 2) run.perfects++; };
  const onClutch = () => { run.clutches++; };
  // The coins this run has earned so far (what the game-over card will pay), for the live coin chip.
  const liveCoins = score => coinsForScore(score) + run.bonusCoins;
  const onFrenzy = () => { run.frenzies++; mission('frenzy', 1); };
  const onKing = () => { run.kings++; };
  // Treasure fish and the King pay coins straight away.
  // The free-coins ad pays more as you level up (100 at the start, 600 from level 42), so it stays worth a tap as your income grows.
  const adCoins = () => Math.min(600, 100 + 12 * S.level);
  const addCoins = n => { run.bonusCoins += n; };
  const onMilestone = coins => { run.bonusCoins += coins; run.milestones++; run.msCoins += coins; };
  // Returns true the first time a species is caught (in the fish, sheep or toy-ball album).
  function onSpecies(id, sk = 'fish') {
    const al = albumOf(sk), isNew = !al[id];
    al[id] = (al[id] || 0) + 1;
    if (isNew) run.newSpecies.push({ sk, id, name: speciesOf(sk)[id].name });
    save();
    return isNew;
  }

  // ---------- game over: rewards shown, applied on collect ----------
  let pending = null, pendingNew = [];
  // Coins fall down the screen when the results appear, with a clink for the first dozen.
  function coinRain(coins) {
    if (coins <= 0) return;
    const box = document.createElement('div'); box.className = 'coin-rain';
    const n = Math.max(8, Math.min(36, Math.round(8 + coins / 25)));
    for (let i = 0; i < n; i++) { const c = document.createElement('i'); c.textContent = '🪙'; c.style.left = (Math.random() * 96 + 1) + '%'; c.style.animationDelay = (Math.random() * 0.9) + 's'; c.style.animationDuration = (1.2 + Math.random() * 0.8) + 's'; c.style.fontSize = (20 + Math.random() * 14) + 'px'; box.appendChild(c); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 3200);
    for (let k = 0; k < 12; k++) setTimeout(() => Sfx.coin(k % 5), 250 + k * 85);
  }
  function gameOver(score, time, canRevive, onRevive, onDone) {
    const coins = coinsForScore(score) + run.bonusCoins; // the same formulas applyRun pays out (this card used to show the old, much larger linear ones)
    const xp = xpForScore(score) + run.fish;
    pending = { score, time, coins, xp, onDone };
    countUp($('final'), score, fmt, 1000);
    $('bestLine').textContent = score > S.best ? '🏆 New best!' : `Best ${fmt(S.best)}`;
    // A grade stamped on the card: S for a new best, then A, B, C by how close the run was to your best.
    { const best = S.best, ratio = best > 0 ? score / best : score >= 20000 ? 1 : score >= 5000 ? 0.7 : 0.4, grade = best > 0 && score > best ? 'S' : ratio >= 0.85 ? 'A' : ratio >= 0.6 ? 'B' : 'C';
      $('ovGrade').innerHTML = `<span class="g-${grade}">${grade}</span>`;
      setTimeout(() => { if (!$('over').classList.contains('hidden')) (grade === 'S' ? Sfx.sweep() : Sfx.clonk()); }, 750); }
    // The highlights of the run, then the wallet counting up while coins rain down.
    { const mo = [];
      if (run.bestPts > 0) mo.push(`⭐ Best catch: ${run.bestN} fish${run.bestCombo > 1 ? ' · ×' + run.bestCombo : ''} = +${fmt(run.bestPts)}`);
      if (run.perfects) mo.push(`🎯 Perfect loops: ${run.perfects}`);
      if (run.clutches) mo.push(`🛟 Clutch saves: ${run.clutches}`);
      if (run.frenzies) mo.push(`🔥 Frenzies: ${run.frenzies}`);
      $('ovMoments').innerHTML = mo.map(t => `<span>${t}</span>`).join('');
      const w = $('ovWallet'), from = S.coins, to = S.coins + coins, t0 = performance.now() + 500; w.textContent = fmt(from);
      const tick = now => { const k = clamp((now - t0) / 1300, 0, 1); w.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      coinRain(coins); }
    $('replay').classList.add('pulse');
    countUp($('ovCoins'), coins, v => '+' + fmt(v), 1100);
    countUp($('ovXp'), xp, v => '+' + fmt(v), 1100);
    // "So close" nudges: how near you were to your best, and what the coins can buy next.
    const nu = nextUnlock(), after = S.coins + coins, nudge = [];
    if (score <= S.best && S.best > 0 && score >= S.best * 0.6) nudge.push(`Only ${fmt(S.best - score)} points from your best!`);
    if (nu) nudge.push(after >= nu.cost ? `You can buy ${nu.name} now!` : `Next goal: ${nu.name}, ${fmt(nu.cost - after)} more coins`);
    $('ovNudge').textContent = nudge.join(' · ');
    $('ovFish').textContent = fmt(run.fish);
    $('ovBig').textContent = run.biggest;
    // Each new album entry is a button that opens its card (see showSpecies).
    const chips = run.newSpecies.map((n, i) => `<button class="sp-chip" data-sp="${i}" style="--rc:${RARITY[speciesOf(n.sk)[n.id].rar].c}">${n.name}</button>`).join('');
    $('ovNew').innerHTML = (run.milestones ? `<span>🏆 ${run.milestones} milestone${run.milestones > 1 ? 's' : ''} (+${fmt(run.msCoins)} coins)</span>` : '') +
      (chips ? `<span>New in your album (tap to view):</span><span class="sp-chips">${chips}</span>` : '');
    pendingNew = run.newSpecies.slice();
    $('revive').classList.toggle('hidden', !canRevive);
    $('revive').onclick = () => { $('over').classList.add('hidden'); onRevive(); };
    $('double').classList.toggle('hidden', coins === 0);
    $('over').classList.remove('hidden');
  }
  // Fold a finished run into lifetime stats, pay coins and XP.
  // Payouts grow more slowly than the score, so a monster run still feels good but can't flood the economy. Old rule: coins = score / 40
  // (a 1M run paid 25,000) and xp = score / 25 (level 60 in a few runs, each level paying more coins). Sample payouts:
  //   score 2k -> ~80 coins | 10k -> ~190 | 100k -> ~675 | 430k -> ~1,500 | 1.2M -> ~2,600
  const coinsForScore = score => Math.round(1.2 * Math.pow(Math.max(0, score), 0.55));
  const xpForScore = score => Math.floor(0.9 * Math.pow(Math.max(0, score), 0.6));
  function applyRun(score, time, coins, mult = 1, isEndless = false) {
    const st = S.stats;
    st.games++; st.fish += run.fish; st.catches += run.catches; st.biggest = Math.max(st.biggest, run.biggest);
    st.bestCombo = Math.max(st.bestCombo, run.bestCombo); st.sweeps += run.sweeps; st.golds += run.golds;
    st.tangles += run.tangles; st.time += time;
    st.frenzies += run.frenzies; st.kings += run.kings; st.specials += run.specials;
    run.colors.forEach((n, i) => { st.colors[i] += n; });
    st.history = [...st.history, score].slice(-20);
    if (isEndless) S.best = Math.max(S.best, score);
    const total = (coinsForScore(score) + run.bonusCoins + (isEndless ? 0 : coins)) * mult;
    S.coins += total;
    st.coinsEarned += total;
    mission('games', 1);
    mission('score', score);
    const ups = addXp(xpForScore(score) + run.fish);
    save();
    return ups;
  }
  function collect(mult, replay = false) {
    const p = pending; if (!p) return;
    pending = null;
    const ups = applyRun(p.score, p.time, 0, mult, true);
    $('over').classList.add('hidden');
    ups.forEach((u, i) => setTimeout(() => toast(u), 300 + i * 2600));
    if (replay) { p.onDone(true); return; }
    tab = claimable() ? 'missions' : albumClaimable() ? 'album' : tab === 'how' && S.stats.games > 1 ? 'store' : tab;
    showMenu();
    p.onDone(false);
  }

  // ---------- UI helpers ----------
  // Counts a number up from 0 with a tick sound; used on the game-over screen.
  function countUp(el, to, fmtFn = fmt, ms = 900) {
    const t0 = performance.now(); let lastTick = 0;
    const step = now => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtFn(to * e);
      if (k < 1 && now - lastTick > 80) { lastTick = now; Meta.sfx('coin'); }
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // The cheapest thing in the store (for the skin you're playing) that you don't own yet.
  function nextUnlock() {
    let best = null;
    for (const c of ['hat', 'theme', 'rope', 'pop']) {
      for (const it of catalogOf(c)) {
        if (it.album || it.fish || !(it.cost > 0) || (it.lv || 0) > S.level || ownedOf(c).includes(it.id)) continue;
        if (!best || it.cost < best.cost) best = { name: it.name, cost: it.cost };
      }
    }
    return best;
  }
  let shownCoins = S.coins, coinAnim = false;
  function showCoins() {
    const el = $('coins');
    if (S.coins > shownCoins && !coinAnim) {
      const from = shownCoins, to = S.coins, t0 = performance.now();
      shownCoins = to; coinAnim = true; el.classList.add('pulse');
      const step = now => {
        const k = Math.min(1, (now - t0) / 900);
        el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step); else { coinAnim = false; el.classList.remove('pulse'); el.textContent = fmt(S.coins); }
      };
      requestAnimationFrame(step);
    } else if (!coinAnim) { shownCoins = S.coins; el.textContent = fmt(S.coins); }
  }
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.add('hidden'), 2500);
  }
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

  // Purchase confirmation for everything that costs coins.
  let confirmYes = null;
  // Coin purchases ask first, with a "Don't ask me again" box. Real-money purchases never skip the popup (they don't pass
  // `skippable` and have price 0). The setting can be turned back on in Stats.
  function confirmBuy({ name, desc, icon, price, skippable }, onYes) {
    const askable = price > 0 || skippable;
    if (S.skipConfirm && askable && S.coins >= price) { onYes(); Meta.sfx('buy'); return; }
    $('cfSkipRow').classList.toggle('hidden', !askable);
    $('cfSkip').checked = false;
    const short = S.coins < price;
    $('cfIcon').innerHTML = icon;
    $('cfTitle').textContent = `Buy ${name}?`;
    $('cfDesc').textContent = desc;
    $('cfPrice').textContent = short ? `● ${fmt(price)} · you have ● ${fmt(S.coins)}` : `● ${fmt(price)}`;
    $('cfPrice').classList.toggle('short', short);
    $('cfYes').disabled = short;
    $('cfYes').textContent = short ? 'Not enough coins' : 'Buy';
    confirmYes = onYes;
    $('confirm').classList.remove('hidden');
    $('cfNo').focus();
  }
  const closeConfirm = () => { $('confirm').classList.add('hidden'); confirmYes = null; };
  $('cfNo').onclick = closeConfirm;
  $('confirm').addEventListener('click', e => { if (e.target === $('confirm')) closeConfirm(); });
  $('cfYes').onclick = () => {
    const f = confirmYes, skip = $('cfSkip').checked && !$('cfSkipRow').classList.contains('hidden');
    closeConfirm();
    if (skip) { S.skipConfirm = true; save(); toast('Purchases will no longer ask. Turn it back on in Stats.'); }
    if (f) { f(); Meta.sfx('buy'); }
  };
  addEventListener('keydown', e => { if (e.key === 'Escape') closeConfirm(); });

  function iconHtml(cat, item, size = 46) {
    if (cat === 'hat') {
      const src = curSkin() === 'fish' ? fishImage({ color: 0 }, size, item.id) : Meta.skinImage(curSkin(), { color: 0 }, size, item.id);
      return `<img src="${src}" width="${size}" height="${size}" alt="">`;
    }
    if (cat === 'pop') return `<span class="emoji" style="font-size:${size * 0.6}px;width:${size}px;height:${size}px">${item.icon}</span>`;
    return `<span class="sw" style="width:${size}px;height:${size}px;background:${item.sw}"></span>`;
  }

  // ---------- daily reward calendar ----------
  const DAILY = [50, 80, 120, 160, 220, 300, 600];
  function showDaily() {
    if (S.dailyClaimed === today) return;
    const day = (S.streak - 1) % 7;
    const box = $('days');
    box.innerHTML = '';
    DAILY.forEach((c, i) => {
      box.appendChild(el('div', 'day' + (i < day ? ' past' : i === day ? ' now' : ''),
        `<small>Day ${i + 1}</small><span class="chest">${i < day ? '✅' : i === 6 ? '🎁' : '🪙'}</span><b>${c}${i === 6 ? ' + hat' : ''}</b>`));
    });
    $('dailySub').textContent = S.streak > 1 ? `${S.streak}-day streak! Come back tomorrow to keep it going.` : 'Come back every day for bigger rewards.';
    $('daily').classList.remove('hidden');
    $('claimDaily').onclick = () => {
      S.coins += DAILY[day];
      let extra = '';
      if (day === 6) { // day 7: a random hat you don't own yet
        const hat = pick(hats.filter(h => !h.album && !h.fish && !S.owned.hat.includes(h.id)) || []);
        if (hat) { S.owned.hat.push(hat.id); extra = ` and the ${hat.name}!`; } else S.coins += 500;
      }
      S.dailyClaimed = today;
      save();
      Meta.vaultCharge?.(25);
      box.children[day].classList.add('opened');
      Meta.sfx('chest');
      toast(`+${DAILY[day]} coins${extra}`);
      setTimeout(() => { $('daily').classList.add('hidden'); render(); }, 700);
    };
  }

  // ---------- menu ----------
  let tab = S.stats.games ? 'store' : 'how', storeCat = 'hat';
  let albumSkin = null;
  const albumClaimable = () => ['fish', 'sheep', 'balls'].reduce((a, sk) => a + rewardsOf(sk).filter(([n]) => albumCount(sk) >= n && !claimedOf(sk).includes(n)).length, 0);
  function showMenu() {
    $('menu').classList.remove('hidden', 'browse');
    $('hud').classList.add('hidden');
    render();
    showDaily();
  }
  let prevTab = 'store';
  function render() {
    if (Meta.pages[tab]) { const open = Meta.pages[tab]; tab = prevTab; render(); open(); return; } // full-screen pages (My collection)
    if (['store', 'upgrades', 'album'].includes(tab)) prevTab = tab;
    showCoins();
    $('lv').textContent = S.level;
    $('xpFill').style.width = S.xp / xpNeed(S.level) * 100 + '%';
    const left = 3 - S.freeAds.count;
    $('freeBtn').innerHTML = left > 0 ? `<span class="di">📺</span><span class="dl">+${adCoins()} (${left} left)</span>` : '<span class="di">✓</span><span class="dl">Back tomorrow</span>';
    $('freeBtn').disabled = left <= 0;
    document.querySelectorAll('#menu .tab, #menu .dock-btn[data-tab]').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    document.querySelectorAll('#menu .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    // Badges: the Album tab, and the dock buttons for Missions, Vault and so on.
    const badge = (id, label, n) => { $(id).innerHTML = label + (n ? `<span class="badge">${n}</span>` : ''); };
    const dockBadge = (id, n) => { const b = $('dock-' + id)?.querySelector('.badge'); if (b) { b.textContent = n; b.classList.toggle('hidden', !n); } };
    badge('tab-album', '📖 Album', albumClaimable());
    dockBadge('missions', claimable());
    for (const [id, [, count]] of Object.entries(Meta.tabBadges)) dockBadge(id, count());
    const body = $('tabBody');
    body.innerHTML = '';
    // Pages that live outside the three main tabs get a title and a close button.
    const TITLES = { how: 'How to play', stats: 'Stats', missions: 'Missions', vault: 'Loot Vault', shop: 'Shop', home: 'My collection', ach: 'Achievements' };
    if (!['store', 'upgrades', 'album'].includes(tab)) {
      const head = el('div', 'page-head', `<b>${TITLES[tab] || tab}</b>`);
      const close = el('button', '', '✕ Close');
      close.onclick = () => { tab = 'store'; Meta.sfx('click'); render(); };
      head.appendChild(close);
      body.appendChild(head);
    }
    ({ how: renderHow, store: renderStore, upgrades: renderUpgrades, album: renderAlbum, missions: renderMissions, stats: renderStats, ...Meta.tabs })[tab](body);
  }
  function renderHow(body) { body.innerHTML = $('howTemplate').innerHTML; }

  function renderStore(body) {
    const sk = curSkin();
    const sub = el('div', 'subtabs');
    const labels = [['hat', sk === 'fish' ? 'Hats' : 'Gear'], ['theme', { fish: 'Ponds', sheep: 'Fields', balls: 'Rooms' }[sk]], ['rope', 'Ropes'], ['pop', 'Pops']];
    for (const [cat, label] of labels) {
      const b = el('button', 'subtab' + (storeCat === cat ? ' active' : ''), label);
      b.onclick = () => { storeCat = cat; render(); };
      sub.appendChild(b);
    }
    body.appendChild(sub);
    const nu = nextUnlock();
    if (nu) body.appendChild(el('div', 'goal', `<span>🎯 Next: <b>${nu.name}</b></span><span class="bar"><span style="width:${Math.min(100, S.coins / nu.cost * 100)}%"></span></span><small>● ${fmt(Math.min(S.coins, nu.cost))} / ${fmt(nu.cost)}</small>`));
    if (sk !== 'fish') body.appendChild(el('p', 'note', `Playing as ${NOUN[sk]}: gear and ${sk === 'sheep' ? 'fields' : 'rooms'} are for this skin. Ropes and pops are shared.`));
    const grid = el('div', 'grid');
    for (const item of catalogOf(storeCat)) {
      const owned = ownedOf(storeCat).includes(item.id), on = equipOf(storeCat) === item.id;
      const locked = !owned && (item.album || item.fish || (item.lv || 0) > S.level);
      const label = on ? 'Equipped' : owned ? 'Equip' : item.album ? '📖 Full album' : item.fish ? `🎣 ${item.fish}` : locked ? `🔒 Lv ${item.lv}` : '● ' + fmt(item.cost);
      const b = el('button', 'item' + (on ? ' on' : '') + (locked ? ' locked' : ''), `${iconHtml(storeCat, item)}<b>${item.name}</b><small>${label}</small>`);
      b.disabled = locked;
      b.onclick = () => {
        if (owned) { setEquip(storeCat, item.id); save(); Meta.onEquip(storeCat); render(); return; }
        confirmBuy({ name: item.name, desc: `${catLabel(storeCat)} · equips right away`, icon: iconHtml(storeCat, item, 72), price: item.cost }, () => {
          S.coins -= item.cost;
          ownedOf(storeCat).push(item.id);
          setEquip(storeCat, item.id);
          save();
          Meta.onEquip(storeCat);
          toast(`Unlocked ${item.name}!`);
          render();
        });
      };
      grid.appendChild(b);
    }
    body.appendChild(grid);
    body.appendChild(el('p', 'note', `${ownedOf(storeCat).length} / ${catalogOf(storeCat).length} owned`));
  }

  function renderUpgrades(body) {
    body.appendChild(el('p', 'note', 'Upgrades work for every skin: the levels carry over when you switch.'));
    for (const k of Object.keys(UPGRADES)) {
      const u = upgradeFor(k), lvl = S.up[k], top = upMax(k), maxed = lvl >= top, cost = upCost(k);
      const pips = Array.from({ length: top }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const now = u.show(mods()), next = maxed ? '' : u.show(mods({ ...S.up, [k]: lvl + 1 }));
      const row = el('div', 'upg', `<span class="how-ico" style="--c:#e6f3f6">${u.icon}</span><div><b>${u.name} <span class="lv">Lv ${lvl}/${top}</span></b><small>${u.desc}</small>`
        + `<small class="fx">${now}${maxed ? '' : ` → ${next}`}</small><span class="pips">${pips}</span></div>`);
      const b = el('button', 'btn small', maxed ? 'MAX' : `● ${fmt(cost)}`);
      b.disabled = maxed;
      b.onclick = () => confirmBuy({ name: `${u.name} Lv ${lvl + 1}`, desc: `${u.desc}: ${now} → ${next}`, icon: `<span class="emoji" style="font-size:44px">${u.icon}</span>`, price: cost }, () => {
        S.coins -= cost;
        S.up[k]++;
        save();
        toast(`${u.name} is now level ${S.up[k]}!`);
        render();
      });
      row.appendChild(b);
      body.appendChild(row);
    }
  }

  const RORDER = { U: 0, R: 1, E: 2, L: 3 };
  const byRarity = list => [...list].sort((a, b) => RORDER[a.rar] - RORDER[b.rar] || a.id - b.id);
  function albumIcon(sk, sp, size) {
    return sk === 'fish' ? fishImage({ color: sp.color, species: sp.id }, size) : Meta.skinImage(sk, { color: sp.color, species: sp.id }, size);
  }
  function renderAlbum(body) {
    const sk = albumSkin || curSkin(), list = speciesOf(sk), n = albumCount(sk), done = claimedOf(sk), owned = albumOf(sk);
    const sub = el('div', 'subtabs');
    for (const [id, label] of [['fish', '🐟 Fish'], ['sheep', '🐑 Sheep'], ['balls', '🏀 Balls']]) {
      const b = el('button', 'subtab' + (sk === id ? ' active' : ''), label);
      b.onclick = () => { albumSkin = id; render(); };
      sub.appendChild(b);
    }
    body.appendChild(sub);
    body.appendChild(el('div', 'album-head', `<b>${n} / ${list.length} ${sk === 'fish' ? 'species' : sk === 'sheep' ? 'breeds' : 'toys'}</b><div class="bar"><div style="width:${n / list.length * 100}%"></div></div>
      <small>Rare ${NOUN[sk]} appear now and then while you play as ${NOUN[sk]}. Catch one to add it here. Lucky Bait makes them more common.</small>`));
    const rewards = el('div', 'album-rewards');
    for (const [need, coins] of rewardsOf(sk)) {
      const got = done.includes(need), ready = n >= need && !got, full = need === list.length;
      const hatId = FULL_HAT[sk], hatName = (hats.find(h => h.id === hatId) || SKIN_CATALOG[sk]?.hat.find(h => h.id === hatId) || {}).name;
      const b = el('button', 'btn small' + (got ? ' ghost' : ''), got ? `✓ ${need}` : `${need} ${NOUN[sk]}: ● ${fmt(coins)}${full ? ' + hat' : ''}`);
      b.disabled = !ready;
      b.onclick = () => {
        done.push(need);
        S.coins += coins;
        if (full) {
          const own = sk === 'fish' ? S.owned.hat : S.skinOwned[sk].hat;
          if (!own.includes(hatId)) own.push(hatId);
        }
        save();
        Meta.sfx('chest');
        toast(`Album reward: +${coins} coins` + (full ? ` and the ${hatName}!` : ''));
        render();
      };
      rewards.appendChild(b);
    }
    body.appendChild(rewards);
    const grid = el('div', 'album');
    // Species were added over time (so ids interleave rarities); the page groups them: common, rare, epic, then all the legendaries together.
    for (const sp of byRarity(list)) {
      const count = owned[sp.id] || 0, rar = RARITY[sp.rar];
      grid.appendChild(el('div', 'fishcard' + (count ? '' : ' unknown') + ` r-${sp.rar} k-${sk}`,
        `<img src="${albumIcon(sk, sp, 60)}" width="60" height="60" alt="">
         <b>${count ? sp.name : '???'}</b><small style="color:${rar.c}">${rar.name}</small>${count ? `<span class="count">×${count}</span>` : ''}`));
    }
    body.appendChild(grid);
  }

  function renderMissions(body) {
    for (const m of S.missions.list) {
      const def = MISSIONS[m.id];
      const row = el('div', 'mission', `<b>${def.text(m.goal)}</b><div class="bar"><div style="width:${m.prog / m.goal * 100}%"></div></div>`);
      const b = el('button', 'btn small' + (m.claimed ? ' ghost' : ''), m.claimed ? 'Done' : `Claim ● ${def.reward}`);
      b.disabled = !m.done || m.claimed;
      b.onclick = () => {
        m.claimed = true;
        S.coins += def.reward;
        Meta.vaultCharge?.(15);
        const ups = addXp(25);
        save();
        Meta.sfx('chest');
        toast(`+${def.reward} coins · +25 XP`);
        ups.forEach((u, i) => setTimeout(() => toast(u), 2600 * (i + 1)));
        render();
      };
      row.appendChild(b);
      body.appendChild(row);
    }
    body.appendChild(el('p', 'note', `New missions every day · Day ${S.streak} streak`));
  }

  // Analytics: lifetime numbers, catch quality, color breakdown, recent scores.
  function renderStats(body) {
    const st = S.stats, mins = Math.floor(st.time / 60);
    const attempts = st.catches + st.tangles;
    const accuracy = attempts ? Math.round(st.catches / attempts * 100) : 0;
    const avg = st.history.length ? Math.round(st.history.reduce((a, b) => a + b, 0) / st.history.length) : 0;
    body.appendChild(el('div', 'profile', `<span class="lvbig">${S.level}</span><div><b>Level ${S.level} Angler</b>
      <small>${fmt(S.xp)} / ${fmt(xpNeed(S.level))} XP to level ${S.level + 1}</small>
      <div class="bar"><div style="width:${S.xp / xpNeed(S.level) * 100}%"></div></div></div>`));
    const cards = [
      ['Best score', fmt(S.best)], ['Average (last 20)', fmt(avg)], ['Games played', fmt(st.games)], ['Fish caught', fmt(st.fish)],
      ['Biggest loop', `${st.biggest} fish`], ['Best combo', `×${st.bestCombo}`], ['Frenzies', fmt(st.frenzies)], ['Kings caught', fmt(st.kings)],
      ['Clean sweeps', fmt(st.sweeps)], ['Golden fish', fmt(st.golds)], ['Special fish', fmt(st.specials)], ['Album', `${albumCount()} / ${SPECIES.length}`],
      ['Catch accuracy', `${accuracy}%`], ['Tangles', fmt(st.tangles)], ['Time played', mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} m` : `${mins} m`],
      ['Coins earned', fmt(st.coinsEarned)],
    ];
    const grid = el('div', 'stats');
    for (const [k, v] of cards) grid.appendChild(el('div', '', `<small>${k}</small><b>${v}</b>`));
    body.appendChild(grid);

    const total = Math.max(1, ...st.colors);
    const colors = el('div', 'chart');
    colors.appendChild(el('p', 'chart-title', 'Fish caught by color'));
    COLORS.forEach(({ c }, i) => {
      colors.appendChild(el('div', 'hbar', `<span class="dot" style="background:${c}"></span><div class="track"><div style="width:${st.colors[i] / total * 100}%;background:${c}"></div></div><b>${fmt(st.colors[i])}</b>`));
    });
    body.appendChild(colors);

    const hist = el('div', 'chart');
    hist.appendChild(el('p', 'chart-title', `Last ${st.history.length || 20} games`));
    const hmax = Math.max(1, ...st.history);
    const bars = el('div', 'vbars');
    if (!st.history.length) bars.appendChild(el('p', 'note', 'Play a game to see your scores here.'));
    st.history.forEach((v, i) => {
      const b = el('div', i === st.history.length - 1 ? 'latest' : '');
      b.style.height = Math.max(4, v / hmax * 100) + '%';
      b.title = fmt(v);
      bars.appendChild(b);
    });
    hist.appendChild(bars);
    body.appendChild(hist);
    const ask = el('button', 'btn small ghost', S.skipConfirm ? 'Purchase confirmations: OFF (tap to turn on)' : 'Purchase confirmations: ON (tap to turn off)');
    ask.onclick = () => { S.skipConfirm = !S.skipConfirm; save(); render(); };
    body.appendChild(ask);
  }

  // A sleek card for one album entry, opened from the game-over list. Tap anywhere to close.
  function showSpecies(id, sk = 'fish') {
    const sp = speciesOf(sk)[id], rar = RARITY[sp.rar], count = albumOf(sk)[id] || 0;
    let pop = $('specPop');
    if (!pop) {
      pop = el('div', 'screen hidden');
      pop.id = 'specPop';
      pop.addEventListener('click', () => pop.classList.add('hidden'));
      document.body.appendChild(pop);
    }
    const kind = { fish: 'Species', sheep: 'Breed', balls: 'Toy' }[sk];
    pop.innerHTML = `<div class="spec-card${sp.rar === 'L' ? ' legendary' : ''}" style="--rc:${rar.c}">
      <div class="spec-art"><img src="${albumIcon(sk, sp, 132)}" width="132" height="132" alt=""></div>
      <span class="spec-rar" style="background:${rar.c}">${rar.name}</span>
      <b>${sp.name}</b>
      <small>${kind} ${sp.id + 1} of ${speciesOf(sk).length} · ${{ fish: 'fish', sheep: 'sheep', balls: 'toy balls' }[sk]} album</small>
      <div class="spec-stats"><div><small>Caught</small><b>×${count}</b></div><div><small>Album</small><b>${albumCount(sk)} / ${speciesOf(sk).length}</b></div></div>
      <small class="spec-hint">Tap anywhere to close</small></div>`;
    pop.classList.remove('hidden');
    Meta.sfx('click');
  }
  document.addEventListener('click', e => {
    const chip = e.target.closest && e.target.closest('.sp-chip');
    if (chip) { const n = pendingNew[+chip.dataset.sp]; if (n) showSpecies(n.id, n.sk); }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && $('specPop')) $('specPop').classList.add('hidden'); });

  // In-run "NEW SPECIES!" card.
  function showDiscovery(id, sk = 'fish') {
    const sp = speciesOf(sk)[id], rar = RARITY[sp.rar];
    $('discImg').src = albumIcon(sk, sp, 120);
    $('discName').textContent = sp.name;
    $('discRar').textContent = rar.name;
    $('discovery').classList.toggle('legendary', sp.rar === 'L');
    document.querySelector('.disc-eyebrow').textContent = sp.rar === 'L' ? '✨ LEGENDARY CATCH! ✨' : sk === 'fish' ? 'NEW SPECIES!' : sk === 'sheep' ? 'NEW BREED!' : 'NEW TOY!';
    $('discRar').style.background = rar.c;
    $('discCount').textContent = `${albumCount(sk)} / ${speciesOf(sk).length} in your ${NOUN[sk]} album`;
    const d = $('discovery');
    d.classList.remove('hidden');
    d.style.animation = 'none'; void d.offsetWidth; d.style.animation = '';
    clearTimeout(showDiscovery.t);
    showDiscovery.t = setTimeout(() => d.classList.add('hidden'), 2600);
  }

  // Tabs, dock buttons, the level pill (stats) and the ? button (how to play) all just pick a page.
  document.querySelectorAll('#menu [data-tab]').forEach(t => { t.onclick = () => { tab = t.dataset.tab; Meta.sfx('tab'); render(); }; });
  // Touching or scrolling the panel (or a dock page) shrinks the logo, tagline and skin picker so the list gets the room.
  // The "Show logo" bar (#browseUp) brings them back; showMenu() resets it.
  const browse = on => $('menu').classList.toggle('browse', on);
  const panel = document.querySelector('#menu .panel');
  panel.addEventListener('click', () => browse(true), true); // click, not pointerdown: the layout shift must not move the target mid-tap
  panel.addEventListener('wheel', () => browse(true), { passive: true, capture: true });
  panel.addEventListener('scroll', () => browse(true), true);
  document.querySelectorAll('#menu .dock-btn[data-tab]').forEach(b => b.addEventListener('click', () => browse(true)));
  $('browseUp').onclick = () => { Meta.sfx('click'); browse(false); };
  $('double').onclick = () => { $('over').classList.add('hidden'); Ads.rewarded('2× coins', () => collect(2)); };
  $('collect').onclick = () => collect(1);
  $('replay').onclick = () => collect(1, true);
  $('freeBtn').onclick = () => Ads.rewarded('free coins', () => { const n = adCoins(); S.coins += n; S.freeAds.count++; save(); toast(`+${n} coins`); render(); });

  // PLACEHOLDER ads: swap for AdMob / AppLovin later.
  const Ads = {
    rewarded(label, done) {
      if (S.noAds) { done(); return; } // the Ad-free Perks purchase
      const box = $('ad');
      $('adText').textContent = 'Rewarded ad: ' + label;
      box.classList.remove('hidden');
      let left = 3;
      $('adCount').textContent = left;
      const id = setInterval(() => {
        $('adCount').textContent = --left;
        if (left <= 0) { clearInterval(id); box.classList.add('hidden'); done(); }
      }, 1000);
    },
  };

  return {
    S, save, COLORS, GOLD, SPECIES, mods, rollSpecies, paintPond, drawFishBody, fishColors, drawHat, rope, popParticles,
    startRun, onCatch, onTangle, onPerfect, onClutch, liveCoins, onFrenzy, onKing, onSpecies, addCoins, onMilestone, grantRandomCosmetic,
    tabs: {}, pages: {}, tabBadges: {}, // extras.js registers the Vault and Shop tabs here
    refreshSkins: () => {},   // the game sets this to rebuild the skin dropdown after a purchase
 showDiscovery, gameOver, showMenu, render, Ads,
    applyRun, confirmBuy, toast,
    // Shared with fishing.js
    fishImage, addXp, mission, fmt, el, iconHtml, RARITY, hats, SKIN_CATALOG, albumCount, speciesOf, curSkin, drawAcc, skinTheme,
    skinImage: () => '', // the game sets this: draws sheep and balls for the store and album
    showSpecies, nextUnlock, countUp, albumIcon, albumOf, byRarity,
    onEquip: () => {}, // the game sets this to repaint the pond when the theme changes
    sfx: () => {},     // the game sets this to play menu sounds
  };
})();
