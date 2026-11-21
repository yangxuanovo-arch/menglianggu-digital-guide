from pathlib import Path

from playwright.sync_api import sync_playwright

SHOTS = Path('/home/ubuntu/contest/shots')
with sync_playwright() as p:
    browser = p.chromium.launch()
    for fail in [False, True]:
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://localhost:8080', wait_until='networkidle')
        page.evaluate("localStorage.setItem('mlg_stamps_v1', JSON.stringify(Object.fromEntries([...GUIDE.points.map(p=>[p.id,1]),['__quiz',1]])))")
        page.reload(wait_until='networkidle')
        page.locator('#introStart').click()
        page.locator('[data-tab="stamps"]').click()
        if fail:
            page.evaluate("() => {document.fonts.load=()=>Promise.reject(new Error('Simulated font failure'))}")
        page.locator('#certName').fill('研学体验者')
        page.locator('#btnCert').click()
        page.locator('canvas.cert').wait_for()
        with page.expect_download() as download:
            page.get_by_text('保存证书图片', exact=True).click()
        name = 'certificate-font-fallback.png' if fail else 'certificate-font-normal.png'
        path = SHOTS / name
        download.value.save_as(str(path))
        assert path.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'
        assert errors == [], errors
        print(f'PASS certificate font {"failure fallback" if fail else "normal"}: 1000x700 PNG downloaded; page errors: {errors}')
        context.close()
