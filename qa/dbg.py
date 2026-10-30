import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
        pg.on('pageerror', lambda e: print('PAGEERROR', e))
        pg.on('console', lambda m: print('CONSOLE', m.type, m.text[:200]))
        pg.on('requestfailed', lambda r: print('REQFAIL', r.url[:100]))
        pg.goto('http://localhost:8766/index.html', wait_until='domcontentloaded')
        pg.wait_for_timeout(4000)
        print(pg.evaluate('({meta: typeof Meta, prac: !!(window.Meta && Meta.Practice), st: window.Meta && Meta.Practice && Meta.Practice.state(), tutDone: Meta.S.tutorialDone, pracDone: Meta.S.practiceDone, games: Meta.S.stats.games, sdk: !!(window.CrazyGames && CrazyGames.SDK), env: window.CrazyGames && CrazyGames.SDK && CrazyGames.SDK.environment})'))
        b.close()
finally:
    srv.terminate()
