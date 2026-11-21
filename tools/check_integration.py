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
    frame = page.frame_locator('dialog iframe')
    frame.locator('#data-status').filter(has_text='真实数字高程').wait_for(timeout=30000)
    assert frame.locator('#scene canvas').is_visible()
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
        assert not errors, errors
        print(f'PASS integration {width}x{height}: opening/map portals render real terrain; back and iframe Escape restore map/focus; console errors: {errors}', flush=True)
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
    assert '/menglianggu-digital-guide/terrain/index.html?embedded=1' in page.locator('dialog iframe').get_attribute('src')
    frame.locator('#back').click()
    page.locator('dialog[open]').wait_for(state='hidden')
    assert not errors, errors
    print(f'PASS offline subpath integration: cached terrain bundle, elevation and interface load through portal and return; page errors: {errors}', flush=True)
    context.close()
    server.shutdown()
    browser.close()
