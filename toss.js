/* Playroom ball toss: the physics, with no drawing, so it can be tuned and tested in node (see tools/toss_sim.js).
   World units are metres. x is sideways (0 = centre), y is up, z is away from the player. The basket stands at z = basketZ.
   Toss.launch turns a finger flick into a ball, Toss.step advances it and reports events: 'bounce', 'rim', 'wall', 'score', 'done'. */
(() => {
  const G = 9.8, R = 0.11;
  const cfg = {
    startY: 0.3, startZ: 1.2, basketZ: 4.6, rimH: 0.8, rimR: 0.42, bodyH: 0.8, floorInBasket: 0.14,
    wallX: 3, backZ: 8, ceil: 3.6, theta: 0.9, // launch elevation (rad)
    vMid: 6.1, pMid: 2.75, expo: 0.22,            // launch speed at a typical flick (screen heights per second) and how little it changes with flick speed
    assist: 0.4, assistReach: 1.4,             // a near miss is nudged this fraction toward the basket
    maxAge: 6,
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Where a ball with this velocity crosses rim height on its way down (null if it never reaches it).
  function predict(b, env) {
    const disc = b.vy * b.vy + 2 * G * (b.y - cfg.rimH);
    if (disc < 0) return null;
    const t = (b.vy + Math.sqrt(disc)) / G;
    return { t, x: b.x + b.vx * t + 0.5 * env.wind * t * t, z: b.z + b.vz * t };
  }

  // fx, fy: finger velocity in px/s at release (fy < 0 is up the screen); H: screen height in px.
  function launch(fx, fy, H, env, from) {
    const power = Math.max(0.3, Math.hypot(fx, fy) / H);
    const v = clamp(cfg.vMid * Math.pow(power / cfg.pMid, cfg.expo), 3, 12);
    const phi = clamp(Math.atan2(fx, -fy), -0.75, 0.75);
    const vh = v * Math.cos(cfg.theta);
    const b = { x: from ? from.x : 0, y: from ? from.y : cfg.startY, z: cfg.startZ, vx: vh * Math.sin(phi), vz: vh * Math.cos(phi), vy: v * Math.sin(cfg.theta),
      inside: false, scored: false, rim: false, wall: false, age: 0, still: 0, rest: 0, spin: 0 };
    const p = predict(b, env);
    if (p) {
      const ex = p.x - env.bx, ez = p.z - cfg.basketZ;
      if (Math.hypot(ex, ez) < cfg.assistReach) { b.vx -= cfg.assist * ex / p.t; b.vz -= cfg.assist * ez / p.t; }
    }
    return b;
  }

  function step(b, dt, env) {
    const ev = [];
    b.age += dt;
    b.vx += env.wind * dt; b.vy -= G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.spin += b.vz * dt * 2;
    // the bouncy house: springy walls and ceiling, a very springy floor
    if (b.x < -cfg.wallX + R) { b.x = -cfg.wallX + R; b.vx = -b.vx * 0.65; b.wall = true; ev.push('wall'); }
    if (b.x > cfg.wallX - R) { b.x = cfg.wallX - R; b.vx = -b.vx * 0.65; b.wall = true; ev.push('wall'); }
    if (b.z > cfg.backZ - R) { b.z = cfg.backZ - R; b.vz = -b.vz * 0.6; b.wall = true; ev.push('wall'); }
    if (b.z < R) { b.z = R; b.vz = Math.abs(b.vz) * 0.5; }
    if (b.y > cfg.ceil - R) { b.y = cfg.ceil - R; b.vy = -Math.abs(b.vy) * 0.5; b.wall = true; ev.push('wall'); }
    const dx = b.x - env.bx, dz = b.z - cfg.basketZ, d = Math.hypot(dx, dz) || 1e-6, ux = dx / d, uz = dz / d;
    if (!b.inside) {
      if (b.y < cfg.rimH && d < cfg.rimR - 0.02 && b.vy < 0) { b.inside = true; } // came down through the opening
      else {
        // the rim: a ring at rim height
        const dr = d - cfg.rimR, dy = b.y - cfg.rimH, D = Math.hypot(dr, dy);
        if (D < R && D > 1e-6) {
          const nx = dr * ux / D, ny = dy / D, nz = dr * uz / D, vn = b.vx * nx + b.vy * ny + b.vz * nz;
          if (vn < 0) { b.vx -= 1.55 * vn * nx; b.vy -= 1.55 * vn * ny; b.vz -= 1.55 * vn * nz; }
          const push = R - D; b.x += nx * push; b.y += ny * push; b.z += nz * push;
          if (!b.rim) ev.push('rim'); b.rim = true;
        } else if (b.y < cfg.rimH - 0.02 && d < cfg.rimR + R) { // the solid side of the basket
          const out = cfg.rimR + R;
          b.x = env.bx + ux * out; b.z = cfg.basketZ + uz * out;
          const vr = b.vx * ux + b.vz * uz;
          if (vr < 0) { b.vx -= 1.4 * vr * ux; b.vz -= 1.4 * vr * uz; ev.push('rim'); }
        }
      }
    }
    if (b.inside) {
      const lim = cfg.rimR - R * 0.95;
      if (d > lim) { b.x = env.bx + ux * lim; b.z = cfg.basketZ + uz * lim; const vr = b.vx * ux + b.vz * uz; if (vr > 0) { b.vx -= 1.4 * vr * ux; b.vz -= 1.4 * vr * uz; } }
      if (b.y < cfg.floorInBasket + R) { b.y = cfg.floorInBasket + R; b.vy = -b.vy * 0.3; b.vx *= 0.6; b.vz *= 0.6; }
      if (!b.scored) { b.scored = true; b.scoredAt = b.age; ev.push('score'); }
    } else if (b.y < R) {
      b.y = R;
      if (b.vy < -0.8) ev.push('bounce');
      b.vy = -b.vy * 0.78; b.vx *= 0.92; b.vz *= 0.92;
      if (Math.abs(b.vy) < 0.6) b.vy = 0;
    }
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    b.rest = sp < 0.5 && b.y < R + 0.05 ? b.rest + dt : 0;
    if (b.age > cfg.maxAge || b.rest > 0.6 || (b.scored && b.age > b.scoredAt + 1.3)) { if (!b.done) { b.done = true; ev.push('done'); } }
    return ev;
  }

  // Points for a goal. A clean swish beats a rim-and-in, a bank shot off the padded walls beats both, and a streak multiplies.
  function points(b, streak) {
    const base = b.wall ? 20 : b.rim ? 10 : 15;
    return { base, kind: b.wall ? 'BANK SHOT' : b.rim ? 'Rim in' : 'SWISH', total: base * Math.min(streak, 5) };
  }

  const api = { cfg, launch, step, predict, points, R, G };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof Meta !== 'undefined') Meta.Toss = api;
})();
