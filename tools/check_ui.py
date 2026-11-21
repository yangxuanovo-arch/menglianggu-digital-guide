import json
from pathlib import Path
from playwright.sync_api import sync_playwright

SHOTS = Path('/home/ubuntu/contest/shots')
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.add_init_script("window.__audios=[];const NativeAudio=window.Audio;window.Audio=function(...args){const a=new NativeAudio(...args);window.__audios.push(a);return a};window.Audio.prototype=NativeAudio.prototype;")
    page = context.new_page()
    errors = []
    page.on('console', lambda msg: errors.append('console: ' + msg.text) if msg.type == 'error' else None)
    page.on('pageerror', lambda err: errors.append('pageerror: ' + str(err)))
    for name, width, height in [('desktop',1280,720),('mobile',390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        page.goto('http://localhost:8080',wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.screenshot(path=str(SHOTS / (name+'-intro.png')))
        page.locator('#introStart').click()
        page.wait_for_timeout(2500)
        page.screenshot(path=str(SHOTS / (name+'-map.png')))
        page.get_by_role('button',name='全区概览',exact=True).click()
        page.wait_for_timeout(700)
        page.locator('.leaflet-marker-icon[title="孟良崮战役纪念馆"]').click()
        page.locator('#btnListen').click()
        page.wait_for_function("window.__audios[0].currentTime > 1 && !window.__audios[0].paused")
        first = page.locator('#bubble').inner_text()
        page.screenshot(path=str(SHOTS / (name+'-talking.png')))
        page.wait_for_function("document.querySelector('#bubble').textContent !== " + json.dumps(first),timeout=30000)
        second = page.locator('#bubble').inner_text()
        print(name, 'AUDIO', page.evaluate('({paused:__audios[0].paused,time:__audios[0].currentTime,duration:__audios[0].duration})'), 'SUBTITLE_CHANGED', first != second, flush=True)
        page.locator('#gStop').click()
        for tab, filename in [('route','route'),('stamps','stamps'),('quiz','quiz'),('about','about')]:
            page.locator('[data-tab="'+tab+'"]').click()
            page.wait_for_timeout(900)
            page.screenshot(path=str(SHOTS / (name+'-'+filename+'.png')))
            assert page.locator('#panel').is_visible()
            print(name, tab, page.locator('#panelTitle').inner_text(), flush=True)
        page.locator('#btnLocate').click()
        page.screenshot(path=str(SHOTS / (name+'-context.png')))
        assert page.locator('#panelTitle').inner_text() == '区位与交通'
        print(name, 'context OK', flush=True)
    (SHOTS/'console-errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2))
    print('CONSOLE_ERRORS:',json.dumps(errors,ensure_ascii=False),flush=True)
    assert not errors
