/* First-launch introduction: a short swipe-through of looping gameplay videos (tutorial/*.mp4 and .webm, recorded with Playwright,
   with a finger shown on screen; the .jpg stills are the posters) that teaches the basics. Shown once (S.tutorialDone), replayable from the ? button's page. Test hook: #tutorial. */
(() => {
  const $ = id => document.getElementById(id);
  const { S } = Meta;

  const STEPS = [
    { img: '1-loop.jpg', title: 'Loop the fish', text: 'Draw a circle around fish of the same color with your finger. The number shows how many are inside.' },
    { img: '2-pop.jpg', title: 'Lift to pop them', text: 'Let go and the net closes. The more fish in one loop, the more points. Keep catching to build a combo.' },
    { img: '3-tangle.jpg', title: 'Watch the colors', text: 'Mixed colors tangle the net: you lose your combo and two more fish swim in. Gold and rainbow fish are wild.' },
    { img: '4-full.jpg', title: 'Don\'t let the pond fill up', text: 'Fish keep arriving. If the pond overflows, the run is over. The bar at the top shows how full it is.' },
    { img: '5-frenzy.jpg', title: 'Frenzy!', text: 'Catches fill the Frenzy bar. When it\'s full you get 8 seconds of double points and a flood of fish to loop.' },
    { img: '6-menu.jpg', title: 'Make it yours', text: 'Earn coins for hats, ropes and upgrades. Pick Sheep or Toy balls under "Play as" for new ways to play. Missions are along the bottom.' },
    { img: '7-minigame.jpg', title: 'Mini-games', text: 'Each skin has its own mini-game: fishing for the fish, counting sheep, and basket toss for the toy balls. They pay coins and rare finds.' },
  ];

  const root = document.createElement('div');
  root.id = 'tut'; root.className = 'screen hidden';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'How to play');
  root.innerHTML = `<div class="tut-card">
    <button class="tut-skip" data-skip>Skip</button>
    <div class="tut-shot"><video muted loop playsinline preload="auto" disablepictureinpicture></video></div>
    <div class="tut-body">
      <h2></h2><p></p>
      <div class="tut-dots"></div>
      <div class="tut-nav"><button class="btn ghost" data-back>Back</button><button class="btn" data-next>Next</button></div>
    </div>
  </div>`;
  document.body.appendChild(root);

  const css = document.createElement('style');
  css.textContent = `
    #tut { z-index: 9; background: rgba(3, 22, 32, .8); backdrop-filter: blur(3px); }
    .tut-card { position: relative; background: #fff; color: var(--deep); border-radius: 26px; padding: 14px 18px 16px; width: min(420px, 100%);
      max-height: 100%; display: flex; flex-direction: column; gap: 8px; text-align: center; box-shadow: 0 12px 0 rgba(0,0,0,.2); }
    .tut-skip { position: absolute; top: 12px; right: 14px; z-index: 2; font: inherit; font-weight: 700; font-size: 14px; border: 0; border-radius: 999px;
      padding: 5px 12px; background: rgba(255,255,255,.92); color: var(--deep); cursor: pointer; box-shadow: 0 2px 0 rgba(0,0,0,.15); }
    .tut-shot { height: clamp(150px, 46dvh, 540px); min-height: 0; display: flex; align-items: center; justify-content: center; border-radius: 18px; overflow: hidden; background: #0d4a5e; }
    .tut-shot video { height: 100%; aspect-ratio: 1 / 2; max-width: 100%; object-fit: contain; background: #0d4a5e; animation: tutin .35s ease-out; }
    .tut-body { display: flex; flex-direction: column; gap: 8px; }
    /* wide screens (landscape tablets and desktops): the screenshot sits beside the text */
    @media (orientation: landscape) and (min-width: 700px) {
      .tut-card { width: min(800px, 100%); display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 20px; align-items: center; padding: 18px 22px; text-align: left; }
      .tut-shot { height: clamp(220px, 76dvh, 600px); }
      .tut-dots { justify-content: flex-start; }
      .tut-card p { min-height: 0; font-size: clamp(15px, 2.6dvh, 19px); }
      .tut-card h2 { font-size: clamp(24px, 4.6dvh, 36px); }
      .tut-skip { top: 14px; right: 18px; }
    }
    @keyframes tutin { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
    .tut-card h2 { font-size: clamp(22px, 3.4dvh, 28px); line-height: 1.1; }
    .tut-card p { font-size: clamp(14px, 2.2dvh, 16px); color: #3d6670; line-height: 1.35; min-height: 3.9em; }
    .tut-dots { display: flex; gap: 7px; justify-content: center; }
    .tut-dots i { width: 8px; height: 8px; border-radius: 50%; background: #cfe3e8; transition: all .2s; }
    .tut-dots i.on { width: 22px; border-radius: 5px; background: #2a9d8f; }
    .tut-nav { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; }
    .tut-nav .btn { padding-block: clamp(7px, 1.5dvh, 12px); font-size: clamp(16px, 2.6dvh, 20px); }
    @media (prefers-reduced-motion: reduce) { .tut-shot video { animation: none; } }
  `;
  document.head.appendChild(css);

  let i = 0;
  const q = s => root.querySelector(s);
  const dots = q('.tut-dots');
  dots.innerHTML = STEPS.map(() => '<i></i>').join('');
  const V = '?v=2'; // bump when the clips are re-recorded so browsers don't keep the old ones (v2 = the HD set, 780 x 1560)
  const base = s => 'tutorial/' + s.img.replace(/\.jpg$/, '');
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const vid = q('.tut-shot video');
  const warm = k => { const s = STEPS[k]; if (!s) return; const v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.src = base(s) + '.mp4' + V; new Image().src = 'tutorial/' + s.img + V; }; // fetch the next clip ahead of time

  function render() {
    const s = STEPS[i];
    vid.poster = 'tutorial/' + s.img + V; // shown while the clip loads, and if video can't play
    vid.innerHTML = `<source src="${base(s)}.mp4${V}" type="video/mp4"><source src="${base(s)}.webm${V}" type="video/webm">`;
    vid.load();
    if (!reduceMotion) vid.play().catch(() => {}); // people who prefer reduced motion get the still frame
    vid.style.animation = 'none'; void vid.offsetWidth; vid.style.animation = '';
    q('h2').textContent = s.title;
    q('p').textContent = s.text;
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    q('[data-back]').style.visibility = i ? 'visible' : 'hidden';
    q('[data-next]').textContent = i === STEPS.length - 1 ? "Let's play!" : 'Next';
    warm(i + 1);
  }
  function show(from = 0) {
    i = from; render();
    root.classList.remove('hidden');
    q('[data-next]').focus();
  }
  function finish() {
    root.classList.add('hidden');
    vid.pause();
    if (!S.tutorialDone) { S.tutorialDone = true; Meta.save(); }
    Meta.sfx('click');
    // the slides are followed by the hands-on practice (practice.js), which every new player must finish once
    if (!S.practiceDone && Meta.startPractice) setTimeout(() => Meta.startPractice(0), 300);
  }
  const next = () => { Meta.sfx('click'); if (i >= STEPS.length - 1) finish(); else { i++; render(); } };
  const back = () => { if (i > 0) { Meta.sfx('click'); i--; render(); } };
  q('[data-next]').onclick = next;
  q('[data-back]').onclick = back;
  q('[data-skip]').onclick = finish;
  // swipe or arrow keys, like a photo gallery
  let sx = null;
  root.addEventListener('pointerdown', e => { sx = e.clientX; });
  root.addEventListener('pointerup', e => { if (sx === null) return; const d = e.clientX - sx; sx = null; if (Math.abs(d) > 50) (d < 0 ? next : back)(); });
  addEventListener('keydown', e => {
    if (root.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') back();
    if (e.key === 'Escape') finish();
  });

  // Replay button on the How to play page.
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#replayTut')) show(0); });

  // First launch only. Anyone who already has finished games knows the ropes, so they just get the replay button.
  if (S.tutorialDone === undefined && S.stats.games > 0) { S.tutorialDone = true; Meta.save(); }
  // CrazyGames build: no slides on first launch. A new player goes straight into the hands-on practice (practice.js) and then a real run;
  // the video slides stay on the ? page ("Replay the tutorial"), and their files only load when opened.
  if (!S.tutorialDone && location.hash !== '#tutorial') { S.tutorialDone = true; Meta.save(); }
  if (location.hash === '#tutorial') setTimeout(() => show(0), 350);
})();
