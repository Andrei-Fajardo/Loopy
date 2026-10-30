"""Escape pauses and resumes a run; 'P' too. Run: python qa/qa_esc.py"""
import subprocess, sys, time, os, json
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8770', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
SAVE = json.dumps({'tutorialDone': True, 'practiceDone': True, 'stats': {'games': 5}})
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
        pg.add_init_script("localStorage.setItem('lasso-save-v1', %s)" % json.dumps(SAVE))
        pg.goto('http://localhost:8770/index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
        pg.evaluate("document.getElementById('daily') && document.getElementById('daily').classList.add('hidden'); document.getElementById('play').click()")
        pg.wait_for_timeout(800)
        st = lambda: pg.evaluate('Meta.runInfo().paused')
        r = [st()]
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300); r.append(st())
        shown = pg.evaluate("!document.getElementById('pauseScreen').classList.contains('hidden')")
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300); r.append(st())
        pg.keyboard.press('p'); pg.wait_for_timeout(300); r.append(st())
        pg.keyboard.press('p'); pg.wait_for_timeout(300); r.append(st())
        print('paused states (run, Esc, Esc, P, P):', r, '| pause screen shown after first Esc:', shown)
        print('PASS' if r == [False, True, False, True, False] and shown else 'FAIL')
        b.close()
finally:
    srv.terminate()
