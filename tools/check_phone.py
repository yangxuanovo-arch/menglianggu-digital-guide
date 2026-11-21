import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path.home() / 'contest/shots'
guide = json.loads((ROOT/'web/content/data.js').read_text().removeprefix('window.GUIDE = ').removesuffix(';\n'))
for point in guide['points']:
    count = sum('\u4e00' <= c <= '\u9fff' for c in point['text'])
    assert 150 <= count <= 400
    assert all(word not in point['text']+' '.join(point['facts'])+point['tagline'] for word in ['本次研究', '未核实', '未经', '不应把', '不入题', '不臆断'])
    assert 'coordNote' not in point
    assert point.get('imageCredit', {}).get('license') == 'CC BY-SA 4.0'
print('PASS visitor copy: 8 introductions 150–400 Chinese characters; no research instructions; 8 licensed point photos')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width, height in [(375,667),(320,568),(844,390),(1280,720)]:
        context = browser.new_context(viewport={'width':width,'height':height}, has_touch=width<900)
        context.add_init_script("window.__audios=[];const A=window.Audio;window.Audio=function(...args){const a=new A(...args);__audios.push(a);return a};window.Audio.prototype=A.prototype")
        page = context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://localhost:8080',wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.locator('#introTour').scroll_into_view_if_needed()
        assert page.locator('#introTour').is_visible()
        if height<500: page.screenshot(path=str(SHOTS/'phone-landscape-intro-fixed.png'))
        page.locator('#introStart').click()
        page.wait_for_timeout(600)
        page.screenshot(path=str(SHOTS/f'phone-map-{width}.png'))
        for point in guide['points']:
            page.locator('[data-tab="map"]').click();page.wait_for_timeout(650)
            marker = page.locator('#hallShortcut') if point['id']=='hall' else page.locator('.leaflet-marker-icon').filter(has=page.locator('.poi')).filter(has_text=str(point['no']))
            assert marker.count()==1,point['id']
            assert marker.evaluate("e=>{const r=e.getBoundingClientRect(),n=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n&&(e===n||e.contains(n))}"), (width,point['id'],'not touchable')
            marker.click()
            assert page.locator('#sheetBody h2').inner_text().startswith(str(point['no'])+'. '+point['name'])
            page.wait_for_function("document.querySelector('.cover img')?.complete && document.querySelector('.cover img').naturalWidth>0")
            page.locator('#sheetClose').click()
        page.locator('[data-tab="map"]').click();page.get_by_role('button',name='全区概览',exact=True).click();page.wait_for_timeout(700)
        assert page.locator('.leaflet-marker-icon[title="孟良崮战役纪念馆"]').is_visible()
        assert page.locator('.transport-line').get_attribute('stroke')=='#586268'
        assert page.locator('.transport-label').is_visible()
        page.screenshot(path=str(SHOTS/f'phone-overview-{width}.png'))
        page.locator('#hallShortcut').click();page.locator('#btnListen').click()
        page.wait_for_function('__audios[0].currentTime>.2')
        assert page.locator('.voice-label').is_visible()
        assert page.locator('#guide').evaluate("e=>{const a=e.getBoundingClientRect(),b=document.querySelector('#topbar').getBoundingClientRect();return a.top>=b.bottom}")
        for control in [page.locator('.leaflet-control-zoom'), page.locator('#topbar'), page.get_by_role('button',name='全区概览',exact=True)]:
            assert control.evaluate("e=>{const a=e.getBoundingClientRect(),b=document.querySelector('#guide').getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom}"), (width,'guide overlaps control')
        page.locator('#gMin').click();assert page.locator('#guide').evaluate("e=>e.classList.contains('minimized')")
        page.locator('#gMin').click()
        page.screenshot(path=str(SHOTS/f'phone-playing-{width}.png'))
        page.evaluate("__guide.openPoint('trench')")
        assert page.evaluate('__audios[0].paused')
        assert page.locator('#bubble').inner_text()==''
        page.locator('#btnListen').click();page.wait_for_function('__audios[0].currentTime>.2')
        page.locator('[data-tab="quiz"]').click()
        assert page.locator('#guide').is_hidden()
        assert 'AI合成语音' in page.locator('#panelAudioStatus').inner_text()
        assert not page.evaluate('__audios[0].paused'), 'manual listening must continue earning its stamp behind a panel'
        page.evaluate("__audios[0].dispatchEvent(new Event('ended'))")
        assert page.locator('#panelTitle').inner_text()=='红色知识问答'
        page.locator('[data-tab="route"]').click();page.locator('#btnTour').click()
        page.wait_for_function('!__audios[0].paused')
        page.locator('[data-tab="quiz"]').click()
        page.evaluate("__audios[0].dispatchEvent(new Event('ended'))")
        page.wait_for_timeout(1400)
        assert page.locator('#panelTitle').inner_text()=='红色知识问答' and page.locator('#sheet').is_hidden()
        page.locator('[data-tab="route"]').click();page.locator('#btnTour').click()
        page.wait_for_function('!__audios[0].paused')
        page.evaluate("__audios[0].dispatchEvent(new Event('ended'))")
        page.locator('#sheet').wait_for(state='visible')
        page.locator('#sheetClose').click()
        page.evaluate("__audios[0].dispatchEvent(new Event('ended'))")
        page.wait_for_timeout(1400)
        assert page.locator('#sheet').is_hidden()
        page.locator('[data-tab="about"]').click()
        text=page.locator('#panelBody').inner_text()
        assert '【' not in text and '提交前须' not in text
        assert '由团队对照所列资料来源逐条核对' in text and '实景图片署名' in text
        page.locator('#aCtx').click();page.locator('#panelClose').click()
        assert page.locator('.city').count()==0
        assert not errors, errors
        print(f'PASS {width}x{height}: own-point marker clicks 1–8, elementFromPoint touchability, overview + shuttle, photo heroes, audio switch, tour cancellation, panel playback, AI disclosure, context reset; page errors: {errors}',flush=True)
        context.close()
    browser.close()
