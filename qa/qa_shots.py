"""Screenshots of the menu and a run at the CrazyGames sizes, as a returning player. Output: qa/shots/<name>_<w>x<h>.png"""
import subprocess, sys, time, os, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZES = [(800, 450), (1080, 607), (1280, 720), (1920, 1080), (390, 844)]
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
SAVE = json.dumps({'tutorialDone': True, 'practiceDone': True, 'stats': {'games': 5}, 'coins': 1500, 'level': 4})
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        for (w, h) in SIZES:
            ctx = b.new_context(viewport={'width': w, 'height': h})
            pg = ctx.new_page()
            pg.add_init_script("localStorage.setItem('lasso-save-v1', %s)" % json.dumps(SAVE))
            pg.goto('http://localhost:8768/index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
            pg.evaluate("document.getElementById('daily') && document.getElementById('daily').classList.add('hidden')")
            pg.screenshot(path=f'{ROOT}/qa/shots/menu_{w}x{h}.png')
            pg.evaluate("document.getElementById('play').click()"); pg.wait_for_timeout(3500)
            pg.screenshot(path=f'{ROOT}/qa/shots/run_{w}x{h}.png')
            ctx.close()
        b.close()
finally:
    srv.terminate()
