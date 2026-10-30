"""High-refresh consistency: drive frameBody() by hand with dt = 1/60 and dt = 1/165 for 40 simulated seconds (rAF disabled) and compare
spawn counts and fish speeds. Run: python qa/qa_hz.py"""
import subprocess, sys, time, os, json, statistics
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8769', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
SAVE = json.dumps({'tutorialDone': True, 'practiceDone': True, 'stats': {'games': 5}})
SIM = """(hz) => {
  const dt = 1 / hz; let t = performance.now(); last = t;
  let spawned = 0; const orig = makeFish; makeFish = function (...a) { spawned++; return orig.apply(this, a); };
  const speeds = []; let prev = null;
  const steps = Math.round(40 * hz);
  for (let i = 0; i < steps; i++) {
    t += dt * 1000; frameBody(t);
    if (i === Math.round(20 * hz)) prev = new Map(fish.map(f => [f, [f.x, f.y]]));
    if (i === Math.round(21 * hz) && prev) for (const f of fish) { const p = prev.get(f); if (p) speeds.push(Math.hypot(f.x - p[0], f.y - p[1])); }
  }
  makeFish = orig;
  return { simTime: +time.toFixed(2), spawned, live: fish.length, meanDispPerSec: speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0, n: speeds.length };
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        for hz in (60, 165, 60, 165):
            ctx = b.new_context(viewport={'width': 1280, 'height': 720})
            pg = ctx.new_page()
            pg.add_init_script("window.requestAnimationFrame = () => 0; localStorage.setItem('lasso-save-v1', %s)" % json.dumps(SAVE))
            pg.goto('http://localhost:8769/index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
            pg.evaluate("document.getElementById('daily') && document.getElementById('daily').classList.add('hidden'); document.getElementById('play').click()")
            pg.wait_for_timeout(300)
            print(hz, pg.evaluate(SIM, hz))
            ctx.close()
        b.close()
finally:
    srv.terminate()
