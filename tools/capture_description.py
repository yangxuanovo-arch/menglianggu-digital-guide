"""Capture the deployed guide for the submission document (not a local preview)."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'https://yangxuanovo-arch.github.io/menglianggu-digital-guide/'
OUT = Path(__file__).resolve().parent.parent / 'docs/images'

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'], ignore_default_args=['--mute-audio'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until='networkidle')
    page.locator('#introStart').click()
    page.wait_for_function('[...document.querySelectorAll("[data-module]")].every(b=>b.dataset.ready==="true")')
    def shot(name):
        page.screenshot(path=str(OUT / (name + '.png')))
        print('LIVE screenshot:', name, page.url, flush=True)
    shot('map')
    page.locator('#hallShortcut').click()
    page.locator('.cover img').evaluate('im=>im.decode()')
    shot('point')
    page.keyboard.press('Escape')
    for tab in ['route', 'stamps', 'quiz']:
        page.locator(f'[data-tab={tab}]').click()
        shot(tab)
        page.keyboard.press('Escape')
    for module in ['terrain', 'narrator', 'panorama']:
        page.locator(f'.module-launchers [data-module={module}]').click()
        frame = page.frame_locator('dialog[open] iframe')
        if module == 'terrain':
            frame.locator('#data-status').filter(has_text='真实数字高程').wait_for(timeout=60000)
            frame.locator('[data-phase="2"]').click()
        elif module == 'narrator':
            frame.locator('#play').click()
            frame.locator('#video').evaluate('v=>new Promise(r=>{if(v.currentTime>.5)r();else v.addEventListener("timeupdate",()=>{if(v.currentTime>.5)r()})})')
            frame.locator('#play').click()
        else:
            frame.locator('#start.ready').wait_for(timeout=60000)
            frame.locator('#free').click()
            for _ in range(6):
                frame.locator('#next').click()
            page.wait_for_timeout(4000)
            assert frame.locator('#card-title').inner_text() == '胜利之本'
        shot(module)
        frame.locator('#back').click()
        page.locator('dialog[open]').wait_for(state='hidden')
    # Demonstration progress only, isolated to this browser context; not an attendance claim.
    page.evaluate('localStorage.setItem("mlg_stamps_v1",JSON.stringify(Object.fromEntries(GUIDE.points.map(p=>[p.id,Date.now()]).concat([["__quiz",Date.now()]]))))')
    page.reload(wait_until='networkidle')
    page.locator('#introStart').click()
    page.locator('[data-tab=stamps]').click()
    page.locator('#certName').fill('研学体验者')
    page.locator('#btnCert').click()
    page.locator('canvas.cert').wait_for()
    page.locator('canvas.cert').screenshot(path=str(OUT / 'certificate.png'))
    page.keyboard.press('Escape')
    page.set_viewport_size({'width': 375, 'height': 667})
    shot('phone-map')
    page.locator('#hallShortcut').click()
    page.locator('.cover img').evaluate('im=>im.decode()')
    shot('phone-point')
    assert not errors, errors
    print('PASS live description captures: 9 desktop surfaces and 2 phone views; page errors:', errors)
    browser.close()
