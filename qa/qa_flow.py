"""Flow QA for the CrazyGames build, on http://localhost with the SDK in demo mode (ads are replaced by a fake that finishes after 300 ms,
so the order and rules can be checked deterministically). Checks: practice -> auto run, gameplayStart/Stop, midgame and rewarded
ad rules, revive pacing, adblock path. Run: python qa/qa_flow.py"""
import subprocess, sys, time, os, math
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1280, 720
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors, ok = [], []
def check(name, cond, extra=''):
    ok.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (' | ' + str(extra) if extra and not cond else ''))

HOOK = """
window.__ev = [];
const G = CrazyGames.SDK.game, A = CrazyGames.SDK.ad;
const realAd = A.requestAd.bind(A);
A.requestAd = (type, cb) => { if (!cb || (type !== 'midgame' && type !== 'rewarded')) return realAd(type, cb); __ev.push('ad:' + type); if (window.__adFail) { setTimeout(() => cb.adError({ code: 'unfilled' }), 100); return; }
  setTimeout(() => cb.adStarted && cb.adStarted(), 50); setTimeout(() => { __ev.push('muted:' + Sfx.muted); cb.adFinished(); }, 300); };
"""

def circle(pg, grp, pad=30):
    cx = sum(a[0] for a in grp) / len(grp); cy = sum(a[1] for a in grp) / len(grp)
    r = max(math.hypot(a[0] - cx, a[1] - cy) for a in grp) + pad
    pg.mouse.move(cx, cy - r); pg.mouse.down()
    for k in range(1, 61):
        a = -math.pi / 2 + k / 60 * 2 * math.pi * 1.04
        pg.mouse.move(cx + math.cos(a) * r, cy + math.sin(a) * r); pg.wait_for_timeout(8)
    pg.mouse.up()

try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True)
        pg = b.new_context(viewport={'width': W, 'height': H}).new_page()
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        sdk = []
        def on_console(m):
            t = m.text
            if m.type == 'error' and 'throttled' not in t: errors.append('console.error: ' + t[:160])
            if 'Requesting gameplay' in t: sdk.append('start' if 'start' in t.lower() else 'stop')
        pg.on('console', on_console)
        pg.goto('http://localhost:8767/index.html', wait_until='domcontentloaded')
        pg.wait_for_function("typeof Meta !== 'undefined' && Meta.Practice && Meta.Practice.state().active", timeout=15000)
        pg.wait_for_function("CrazyGames.SDK.environment === 'local'")
        pg.wait_for_timeout(500)
        pg.evaluate(HOOK)
        # ---- practice, driven with the real mouse: nearest fish by step
        for step in range(4):
            pg.wait_for_function(f'Meta.Practice.state().idx === {step} && Meta.Practice.state().busy <= 0', timeout=15000)
            pg.wait_for_timeout(500)
            fish = pg.evaluate('fish.filter(f => !f.pop && !f.caught && !f.rise).map(f => [f.x * ZOOM, f.y * ZOOM, f.color])')
            cx0, cy0 = W / 2, H / 2
            fish.sort(key=lambda a: (a[0] - cx0) ** 2 + (a[1] - cy0) ** 2)
            n = {0: 5, 1: 10, 2: 8, 3: 8}[step]
            grp = fish[:n]
            if step == 3:  # one colour only: the most common colour among the nearest eight
                cols = [a[2] for a in grp]; c = max(set(cols), key=cols.count); grp = [a for a in grp if a[2] == c]
            circle(pg, [(a[0], a[1]) for a in grp], pad=26 if step == 3 else 34)
            pg.wait_for_timeout(600)
        pg.wait_for_function("Meta.runInfo().state === 'play' && !Meta.Practice.state().active", timeout=15000)
        check('practice (4 core steps) ends and a real run starts by itself', True)
        check('S.practiceDone set', pg.evaluate('Meta.S.practiceDone === true'))
        pg.wait_for_timeout(600)
        ev = pg.evaluate('__ev')
        check('gameplayStart sent, and no midgame ad before/after practice', 'start' in sdk and not any(e.startswith('ad:') for e in ev), (sdk, ev))
        # ---- run 1 ends: revive offered, no midgame yet (first real run)
        pg.evaluate('gameOver()'); pg.wait_for_timeout(900)
        print('body class:', pg.evaluate('document.body.className'), 'sdk:', sdk)
        check('game over screen shows', pg.evaluate("!document.getElementById('over').classList.contains('hidden')"))
        check('run 1: revive offered', pg.evaluate("getComputedStyle(document.getElementById('revive')).display !== 'none'"))
        check('gameplayStop sent', 'stop' in sdk, sdk)
        pg.evaluate("document.getElementById('replay').click()"); pg.wait_for_timeout(900)
        ev = pg.evaluate('__ev')
        check('run 1 -> Play again: NO midgame ad (first run is onboarding)', 'ad:midgame' not in ev, ev)
        # ---- run 2 ends: revive hidden (every other run), midgame on Play again
        pg.evaluate('gameOver()'); pg.wait_for_timeout(900)
        check('run 2: revive hidden (not every death)', pg.evaluate("getComputedStyle(document.getElementById('revive')).display === 'none'"))
        pg.evaluate("document.getElementById('replay').click()"); pg.wait_for_timeout(1200)
        ev = pg.evaluate('__ev')
        check('run 2 -> Play again: one midgame ad, game muted during it, then a new run starts',
              ev.count('ad:midgame') == 1 and 'muted:true' in ev and pg.evaluate("Meta.runInfo().state === 'play'"), (ev, pg.evaluate('Meta.runInfo().state')))
        check('sound restored after the ad', pg.evaluate('Sfx.muted === false'))
        # ---- run 3: watch the 2x ad, then Play again must NOT add a midgame
        pg.evaluate('gameOver()'); pg.wait_for_timeout(900)
        n0 = pg.evaluate('__ev').count('ad:midgame')
        pg.evaluate("document.getElementById('double').click()"); pg.wait_for_timeout(900)
        pg.evaluate("document.getElementById('replay').click && Meta.showMenu && 0"); pg.wait_for_timeout(100)
        ev = pg.evaluate('__ev')
        check('rewarded 2x ad ran', ev.count('ad:rewarded') >= 1, ev)
        # after the rewarded ad the over card is closed; start the next run from the menu with Play
        pg.wait_for_function("!document.getElementById('menu').classList.contains('hidden')", timeout=5000)
        pg.evaluate("document.getElementById('play').click()"); pg.wait_for_timeout(1200)
        ev = pg.evaluate('__ev')
        check('rewarded then Play: no midgame stacked at the same break', ev.count('ad:midgame') == n0, ev)
        # ---- ad error: reward must not be granted
        pg.evaluate('window.__adFail = true')
        coins0 = pg.evaluate('Meta.S.coins')
        pg.evaluate("Meta.showMenu()"); pg.wait_for_timeout(500)
        pg.evaluate("document.getElementById('freeBtn').click()"); pg.wait_for_timeout(700)
        check('ad error: no coins granted', pg.evaluate('Meta.S.coins') == coins0, (coins0, pg.evaluate('Meta.S.coins')))
        check('screen not left blocked after an ad error', pg.evaluate("[...document.body.children].every(e => !(e.style.zIndex === '9999' && e.style.display === 'block'))"))
        pg.evaluate('window.__adFail = false')
        # ---- adblock path
        pg.evaluate("document.body.classList.add('noads')")
        check('adblock: free-coins, 2x and revive buttons are hidden',
              pg.evaluate("['freeBtn','double','revive'].every(id => getComputedStyle(document.getElementById(id)).display === 'none')"))
        pg.evaluate("document.body.classList.remove('noads')")
        # ---- no tabs for removed features
        check('no Vault / Shop buttons', pg.evaluate("!document.getElementById('dock-vault') && !document.getElementById('dock-shop')"))
        pg.screenshot(path=os.path.join(ROOT, 'qa', 'shots', 'flow_menu.png'))
        print('errors:', errors or 'none')
        b.close()
finally:
    srv.terminate()
bad = [n for n, v in ok if not v]
print('\n%d/%d checks passed' % (len(ok) - len(bad), len(ok)), '| FAILED:' if bad else '', bad if bad else '')
