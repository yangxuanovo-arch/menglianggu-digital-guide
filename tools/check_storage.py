from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://localhost:29229')
    for mode in ['normal', 'empty', 'blocked', 'write-blocked', 'malformed', 'null', 'array']:
        context = browser.new_context()
        context.add_init_script("""window.__audios=[];const NativeAudio=window.Audio;
            window.Audio=function(...args){const a=new NativeAudio(...args);__audios.push(a);return a};
            window.Audio.prototype=NativeAudio.prototype;""")
        if mode == 'blocked':
            context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}})")
        elif mode == 'write-blocked':
            context.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}")
        elif mode in ['normal', 'malformed', 'null', 'array']:
            value = {'normal': '{"trench":1}', 'malformed': '{', 'null': 'null', 'array': '[]'}[mode]
            context.add_init_script(f"localStorage.setItem('mlg_stamps_v1', {value!r})")
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://localhost:8080', wait_until='networkidle')
        page.locator('#introStart').click()
        page.locator('[data-tab="stamps"]').click()
        assert page.locator('.stamp.on[data-id]').count() == (1 if mode == 'normal' else 0)
        page.locator('.stamp[data-id="hall"]').click()
        page.locator('#btnRemote').click()
        page.evaluate("__audios[0].dispatchEvent(new Event('ended'))")
        page.locator('#gStop').click()
        page.locator('[data-tab="stamps"]').click()
        assert page.locator('.stamp.on[data-id="hall"]').count() == 1
        page.evaluate('window.confirm=()=>true')
        page.locator('#btnReset').click()
        assert page.locator('.stamp.on[data-id]').count() == 0
        assert errors == [], errors
        print(f'PASS storage {mode}: load, stamp (simulated audio completion), reset; page errors: {errors}')
        context.close()
