/* Shared water look for the pond and the fishing scene: a tileable caustic web (thin bright network, like
   sunlight through ripples) scrolled in two layers, a few twinkling glints, and a static depth vignette.
   Everything is low-alpha and slow so it reads as water without pulling the eye off the fish. */
const Water = (() => {
  const reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let tiles = null;
  const pats = new WeakMap();

  // Seamless caustic tile: distance difference between the nearest two feature points (wrapping at the edges)
  // is ~0 along cell borders, which gives the glowing web.
  function makeTile(seed, size, n) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const pts = Array.from({ length: n }, () => [rnd() * size, rnd() * size]);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    const wrap = [-size, 0, size];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let d1 = 1e9, d2 = 1e9;
        for (const p of pts) for (const ox of wrap) for (const oy of wrap) {
          const dx = x - p[0] - ox, dy = y - p[1] - oy, q = dx * dx + dy * dy;
          if (q < d1) { d2 = d1; d1 = q; } else if (q < d2) d2 = q;
        }
        const v = Math.max(0, 1 - (Math.sqrt(d2) - Math.sqrt(d1)) / (size * 0.042));
        const i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = v * v * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // Tileable fractal value noise (grey). Drawn with soft-light it gives the surface organic bright and dark patches
  // instead of a flat gradient.
  function makeNoise(seed, size) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const octs = [[4, 0.55], [8, 0.3], [16, 0.15]].map(([n, amp]) => ({ n, amp, g: Array.from({ length: n * n }, rnd) }));
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    const sm = f => f * f * (3 - 2 * f);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0;
        for (const { n, amp, g: grid } of octs) {
          const u = x / size * n, w = y / size * n, ix = Math.floor(u), iy = Math.floor(w), fx = sm(u - ix), fy = sm(w - iy);
          const a = grid[(iy % n) * n + (ix % n)], b = grid[(iy % n) * n + ((ix + 1) % n)];
          const c = grid[((iy + 1) % n) * n + (ix % n)], e = grid[((iy + 1) % n) * n + ((ix + 1) % n)];
          v += amp * (a + (b - a) * fx + (c - a + (a - b - c + e) * fx) * fy);
        }
        const k = Math.max(0, Math.min(255, ((v - 0.5) * 2.4 + 0.5) * 255)), i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = k; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  let noise = null;

  const GLINTS = Array.from({ length: 10 }, (_, i) => ({ x: (i * 0.37 + 0.11) % 1, y: (i * 0.61 + 0.07) % 1, ph: i * 2.1 }));

  // Draw the moving light over the water between y0 and y1. strength 1 is the default calm look.
  function overlay(ctx, W, H, t, { strength = 1, y0 = 0, y1 = H, glints = true } = {}) {
    if (!tiles) { tiles = [makeTile(11, 128, 22), makeTile(97, 128, 18)]; noise = makeNoise(5, 128); }
    let p = pats.get(ctx);
    if (!p) { p = [...tiles, noise].map(c => ctx.createPattern(c, 'repeat')); pats.set(ctx, p); }
    const move = reduce ? 0 : 1;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, W, y1 - y0); ctx.clip();
    // Slow organic light and shade across the surface.
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.55 * Math.min(1.3, strength);
    try { p[2].setTransform(new DOMMatrix().translate(t * 2.5 * move, t * 1.6 * move).scale(4.5)); } catch (e) {}
    ctx.fillStyle = p[2];
    ctx.fillRect(0, y0, W, y1 - y0);
    ctx.globalCompositeOperation = 'lighter';
    [[0, 2.1, 7, 4, 0.085], [1, 2.9, -5, 6, 0.065]].forEach(([i, sc, vx, vy, a]) => {
      ctx.globalAlpha = a * strength * (0.78 + 0.22 * Math.sin(t * 0.5 + i * 2));
      try { p[i].setTransform(new DOMMatrix().translate(t * vx * move, t * vy * move).scale(sc)); } catch (e) {}
      ctx.fillStyle = p[i];
      ctx.fillRect(0, y0, W, y1 - y0);
    });
    if (glints && !reduce) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      for (const gl of GLINTS) {
        const a = Math.pow(Math.max(0, Math.sin(t * 1.3 + gl.ph)), 8) * 0.55 * strength;
        if (a < 0.04) continue;
        const x = gl.x * W, y = y0 + gl.y * (y1 - y0), r = 3 + a * 4;
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Static depth: the edges of the pond fall into shadow. Painted once into the background.
  function depth(g, W, H) {
    const grad = g.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.78);
    grad.addColorStop(0, 'rgba(0,25,45,0)'); grad.addColorStop(1, 'rgba(0,25,45,.38)');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  }

  return { overlay, depth };
})();
