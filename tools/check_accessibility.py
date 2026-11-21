from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

WEB = Path(__file__).resolve().parent.parent / 'web'
SHOTS = Path('/home/ubuntu/contest/shots')


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return super().translate_path(path.replace('/menglianggu-digital-guide/', '/', 1))

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(WEB)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/menglianggu-digital-guide/'
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.add_init_script('const NativeAudio=window.Audio;window.Audio=function(){window.offlineAudio=new NativeAudio();return offlineAudio};window.Audio.prototype=NativeAudio.prototype')
    page = context.new_page()
    errors, fonts = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: fonts.append(r.url) if any(x in r.url for x in ['.otf', '.woff2']) else None)
    page.goto(url)
    page.wait_for_function('navigator.serviceWorker.controller')
    assert not fonts, fonts
    assert 'maximum-scale' not in page.locator('meta[name=viewport]').get_attribute('content')
    assert page.locator('#intro').get_attribute('role') == 'dialog'
    intro_buttons = page.locator('#intro button')
    intro_buttons.first.focus()
    page.keyboard.press('Shift+Tab')
    assert intro_buttons.last.evaluate('(e)=>e===document.activeElement')
    page.keyboard.press('Tab')
    assert intro_buttons.first.evaluate('(e)=>e===document.activeElement')
    page.locator('#introStart').focus()
    page.keyboard.press('Enter')
    page.locator('#hallShortcut').focus()
    page.keyboard.press('Enter')
    page.locator('#sheetClose').wait_for()
    page.keyboard.press('Escape')
    page.wait_for_function('document.activeElement.id === "hallShortcut"')
    page.locator('[data-tab=stamps]').focus()
    page.keyboard.press('Enter')
    stamp = page.locator('button.stamp[data-id=trench]')
    assert '未集章' in stamp.get_attribute('aria-label')
    stamp.focus()
    page.keyboard.press('Space')
    page.wait_for_function('document.querySelector("#pointTitle").textContent.includes("华野战壕")')
    page.keyboard.press('Escape')
    page.locator('[data-tab=map]').click()
    assert page.locator('.leg-label').evaluate_all('es=>es.every(e=>e.parentElement.tabIndex<0)')
    print('PASS keyboard: dialog Tab loop, Enter/Space stamp and point activation, Escape and focus return; named markers; decorative labels unfocusable')
    page.locator('[data-tab=about]').focus()
    page.keyboard.press('Enter')
    summary = page.locator('#panelBody summary')
    credits = page.locator('#panelBody .src a').filter(has_text='CC BY-SA')
    for expanded in [False, True]:
        summary.focus()
        if expanded:
            page.keyboard.press('Enter')
        assert summary.evaluate('(e)=>e.parentElement.open') == expanded
        page.keyboard.press('Tab')
        assert credits.first.evaluate('(e)=>e===document.activeElement')
        page.keyboard.press('Shift+Tab')
        assert summary.evaluate('(e)=>e===document.activeElement')
    links = page.locator('#panelBody a')
    first_credit = links.evaluate_all("es=>es.findIndex(e=>e.textContent.includes('CC BY-SA'))")
    credits.first.focus()
    for i in range(first_credit + 1, links.count()):
        page.keyboard.press('Tab')
        assert links.nth(i).evaluate('(e)=>e===document.activeElement')
    page.keyboard.press('Tab')
    assert page.locator('#panelClose').evaluate('(e)=>e===document.activeElement')
    page.keyboard.press('Shift+Tab')
    assert links.last.evaluate('(e)=>e===document.activeElement')
    page.locator('#panelBody').evaluate("e=>{const fixture=document.createElement('div');fixture.innerHTML='<select aria-label=Test><option>Test</option></select><textarea aria-label=Test></textarea><div contenteditable=true>Test</div>';e.appendChild(fixture)}")
    for selector in ['select', 'textarea', '[contenteditable]']:
        page.keyboard.press('Tab')
        assert page.locator('#panelBody '+selector).evaluate('(e)=>e===document.activeElement')
    page.keyboard.press('Tab')
    assert page.locator('#panelClose').evaluate('(e)=>e===document.activeElement')
    page.keyboard.press('Escape')
    print(f'PASS About focus regression: closed/open summary reaches all {links.count() - first_credit} photo-credit links; reverse Tab and wrap; native select, textarea and contenteditable remain reachable')
    await_ready = page.evaluate('navigator.serviceWorker.ready.then(r=>r.scope)')
    assert await_ready.endswith('/menglianggu-digital-guide/')
    context.set_offline(True)
    page.reload()
    page.locator('#introStart').click()
    assert page.locator('#networkStatus').is_visible()
    page.locator('#networkStatus').click()
    assert page.locator('#panelBody a[data-id]').count() == 8
    page.locator('#panelBody a[data-id=hall]').click()
    page.locator('#btnListen').click()
    page.wait_for_function('offlineAudio.currentTime>.4 && !offlineAudio.paused')
    page.wait_for_function('document.querySelector("#bubble").textContent.length>8')
    page.wait_for_timeout(1500)
    assert page.locator('#gPause').inner_text() == '暂停'
    page.screenshot(path=str(SHOTS/'offline-accessible-guide.png'))
    page.locator('#gStop').click()
    page.keyboard.press('Escape')
    context.set_offline(False)
    page.evaluate("localStorage.setItem('mlg_stamps_v1',JSON.stringify(Object.fromEntries([...GUIDE.points.map(p=>[p.id,1]),['__quiz',1]])))")
    page.reload()
    page.locator('#introStart').click()
    page.locator('[data-tab=stamps]').click()
    assert not fonts, fonts
    page.locator('#certName').fill('张明')
    page.locator('#btnCert').click()
    page.locator('canvas.cert').wait_for()
    assert len(fonts) == 1 and fonts[0].endswith('certificate.woff2'), fonts
    assert '张明同学' in page.locator('#certBox').inner_text()
    page.screenshot(path=str(SHOTS/'accessible-certificate.png'))
    assert not errors, errors
    print('PASS subpath offline reload: 8-point text list, local photos, captions and audio controls; no map tile caching')
    print('PASS font: zero initial requests; certificate-only 19628-byte WOFF2 loaded lazily; DOM certificate summary; page errors: []')
    browser.close()
server.shutdown()
