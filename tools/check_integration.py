from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path.home() / 'contest/shots'


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return super().translate_path(path.replace('/menglianggu-digital-guide/', '/', 1))

    def log_message(self, *args):
        pass


def terrain_ready(page):
    frame = page.frame_locator('dialog[open] iframe')
    frame.locator('#data-status').filter(has_text='真实数字高程').wait_for(timeout=30000)
    assert frame.locator('#scene canvas').is_visible()
    return frame


def panorama_ready(page, inspect=False):
    frame = page.frame_locator('dialog[open] iframe')
    frame.locator('#start.ready').wait_for(timeout=30000)
    assert frame.locator('#stage canvas').is_visible()
    assert frame.locator('#info').count() == 0
    frame.locator('#free').click()
    frame.locator('#start.hide').wait_for()
    if inspect:
        frame.locator('#next').click()
        frame.locator('#next').click()
        page.wait_for_timeout(3300)
        assert frame.locator('#card-title').inner_text()
    return frame


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'])
    for name, width, height in [('desktop', 1280, 720), ('phone', 375, 667)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page()
        errors = []
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://localhost:8090', wait_until='networkidle')
        page.locator('#intro [data-module=terrain]').click()
        frame = terrain_ready(page)
        frame.locator('#back').click()
        page.locator('dialog[open]').wait_for(state='hidden')
        page.screenshot(path=str(SHOTS / f'integrate-{name}-map.png'))
        page.locator('#hallShortcut').click()
        page.locator('.cover img').wait_for()
        page.screenshot(path=str(SHOTS / f'integrate-{name}-point.png'))
        page.keyboard.press('Escape')
        page.locator('[data-tab=quiz]').click()
        page.screenshot(path=str(SHOTS / f'integrate-{name}-quiz.png'))
        page.keyboard.press('Escape')
        portal = page.locator('.module-launchers [data-module=terrain]')
        portal.click()
        frame = terrain_ready(page)
        frame.locator('[data-phase="2"]').click()
        page.screenshot(path=str(SHOTS / f'integrate-{name}-sandbox.png'))
        frame.locator('#back').click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert portal.evaluate('e=>e===document.activeElement')
        portal.click()
        frame = terrain_ready(page)
        frame.locator('#back').focus()
        page.keyboard.press('Escape')
        page.locator('dialog[open]').wait_for(state='hidden')
        assert portal.evaluate('e=>e===document.activeElement')
        panorama = page.locator('.module-launchers [data-module=panorama]')
        panorama.click()
        frame = panorama_ready(page, inspect=True)
        page.screenshot(path=str(SHOTS / f'integrate-{name}-panorama.png'))
        frame.locator('#back').click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert panorama.evaluate('e=>e===document.activeElement')
        page.locator('[data-tab=about]').click()
        scene_credits = page.locator('[data-module-credit=panorama]')
        terrain_credits = page.locator('[data-module-credit=terrain]')
        assert scene_credits.locator('a[href*="commons.wikimedia.org"]').count() == 4
        assert scene_credits.locator('a[href*="polyhaven.com"]').count() == 7
        assert 'zh-CN-YunyangNeural' in scene_credits.inner_text()
        assert 'SRTM' in terrain_credits.inner_text() and 'AI' in terrain_credits.inner_text()
        for module in ['panorama', 'terrain']:
            page.locator(f'[data-module-credit={module}] h3').evaluate("e=>e.scrollIntoView({block:'start'})")
            page.screenshot(path=str(SHOTS / f'integrate-{name}-about-{module}.png'))
        page.keyboard.press('Escape')
        panorama.click()
        frame = panorama_ready(page)
        frame.locator('#back').focus()
        page.keyboard.press('Escape')
        page.locator('dialog[open]').wait_for(state='hidden')
        assert panorama.evaluate('e=>e===document.activeElement')
        assert not errors, errors
        print(f'PASS integration {width}x{height}: terrain/panorama portals render 3D and return with focus; top-right AI entry removed; About retains both modules sources, 4 photos, 7 CC0 assets, DEM and AI credits; console errors: {errors}', flush=True)
        context.close()
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'web')))
    Thread(target=server.serve_forever, daemon=True).start()
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{server.server_port}/menglianggu-digital-guide/', wait_until='networkidle')
    page.wait_for_function('navigator.serviceWorker.controller')
    context.set_offline(True)
    page.reload()
    page.locator('#introStart').click()
    page.locator('.module-launchers [data-module=terrain]').click()
    frame = terrain_ready(page)
    assert '/menglianggu-digital-guide/terrain/index.html?embedded=1' in page.locator('dialog[open] iframe').get_attribute('src')
    frame.locator('#back').click()
    page.locator('dialog[open]').wait_for(state='hidden')
    page.locator('.module-launchers [data-module=panorama]').click()
    frame = panorama_ready(page)
    assert '/menglianggu-digital-guide/scene/index.html?embed=1' in page.locator('dialog[open] iframe').get_attribute('src')
    frame.locator('#back').click()
    page.locator('dialog[open]').wait_for(state='hidden')
    assert not errors, errors
    print(f'PASS offline subpath integration: cached terrain/elevation and panorama/textures load through portals and return; page errors: {errors}', flush=True)
    context.close()
    server.shutdown()
    browser.close()
