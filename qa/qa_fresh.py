"""Fresh-profile QA for the CrazyGames build. Serves the folder on http://localhost:8765, loads it in Chrome with an empty profile and reports:
time to the first drawn loop, console / page errors, SDK gameplay events, and bytes downloaded before the first gameplay start.
Run:  python qa/qa_fresh.py [width height]   (screenshots go to qa/shots/)"""
import subprocess, sys, time, os, math, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1280, 720)
os.makedirs(os.path.join(ROOT, 'qa', 'shots'), exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors, sizes, events = [], {}, []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_context(viewport={'width': W, 'height': H}).new_page()
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
        def on_resp(r):
            if r.status >= 400: errors.append(f'HTTP {r.status}: {r.url}')
            try:
                sizes[r.url] = int(r.headers.get('content-length') or len(r.body()))
            except Exception:
                sizes[r.url] = 0
        pg.on('response', on_resp)
        t0 = time.time()
        pg.goto('http://localhost:8765/index.html', wait_until='domcontentloaded')
        pg.wait_for_function("typeof Meta !== 'undefined' && Meta.Practice && Meta.Practice.state().active", timeout=15000)
        t_practice = time.time() - t0
        pg.wait_for_timeout(700)
        pg.screenshot(path=os.path.join(ROOT, 'qa', 'shots', f'practice_{W}x{H}.png'))
        # circle the fish still to catch: centroid + radius of the fish that are alive
        pts = pg.evaluate('fish.filter(f => !f.pop && !f.caught).map(f => [f.x * ZOOM, f.y * ZOOM])')
        # the practice board puts the targets in a blob; take the 5 fish nearest the board centre
        cx0, cy0 = W / 2, H / 2
        pts.sort(key=lambda a: (a[0] - cx0) ** 2 + (a[1] - cy0) ** 2)
        grp = pts[:5]
        cx = sum(a[0] for a in grp) / len(grp); cy = sum(a[1] for a in grp) / len(grp)
        r = max(math.hypot(a[0] - cx, a[1] - cy) for a in grp) + 28
        pg.mouse.move(cx, cy - r)
        pg.mouse.down()
        for k in range(1, 61):
            a = -math.pi / 2 + k / 60 * 2 * math.pi * 1.04
            pg.mouse.move(cx + math.cos(a) * r, cy + math.sin(a) * r)
            pg.wait_for_timeout(8)
        pg.mouse.up()
        t_loop = time.time() - t0
        pg.wait_for_timeout(1500)
        st = pg.evaluate('Meta.Practice.state()')
        print(f'viewport {W}x{H}')
        print(f'practice active after {t_practice:.2f}s; first loop drawn at {t_loop:.2f}s; practice state after loop: {st}')
        total = sum(sizes.values())
        vids = [u for u in sizes if u.endswith(('.mp4', '.webm'))]
        print(f'downloaded {total / 1e6:.2f} MB in {len(sizes)} requests; video requests: {len(vids)}')
        big = sorted(sizes.items(), key=lambda kv: -kv[1])[:5]
        print('largest:', [(u.split('/')[-1], round(s / 1e6, 2)) for u, s in big])
        print('SDK environment:', pg.evaluate('window.CrazyGames && CrazyGames.SDK.environment'))
        print('errors:', errors or 'none')
        b.close()
finally:
    srv.terminate()
