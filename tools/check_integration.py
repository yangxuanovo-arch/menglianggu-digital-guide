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
    assert frame.locator('#sources-open').count() == 0
    assert frame.locator('#disclosure').count() == 0
    return frame


def panorama_ready(page, inspect=False):
    frame = page.frame_locator('dialog[open] iframe')
    frame.locator('#start.ready').wait_for(timeout=30000)
    assert frame.locator('#stage canvas').is_visible()
    assert frame.locator('#info').count() == 0
    frame.locator('#free').click()
    frame.locator('#start.hide').wait_for()
    if inspect:
        for _ in range(6):
            frame.locator('#next').click()
        page.wait_for_timeout(3900)
        assert frame.locator('#card-title').inner_text() == '胜利之本'
        assert frame.locator('#card-num').inner_text() == '6/7'
    return frame


def narrator_ready(page, clip='intro'):
    frame = page.frame_locator('dialog[open] iframe')
    frame.locator('#clip').wait_for()
    assert frame.locator('#clip').input_value() == clip
    assert '/menglianggu-digital-guide/narrator/index.html?' in page.locator('dialog[open] iframe').get_attribute('src')
    assert frame.locator('#video').evaluate('v=>v.preload==="none" && v.playsInline && !v.hasAttribute("src")')
    return frame


def play_narrator(frame):
    frame.locator('#play').click()
    video = frame.locator('#video').element_handle()
    video.owner_frame().wait_for_function('v=>v.currentTime>.2&&!v.paused&&!v.muted&&v.volume>0&&v.webkitAudioDecodedByteCount>0', arg=video, timeout=15000)
    video.owner_frame().wait_for_function('document.querySelector("#subtitle").textContent.length>5', timeout=15000)
    assert frame.locator('#subtitle').get_attribute('aria-live') == 'polite'
    assert frame.locator('#play').inner_text() == '暂停'


with sync_playwright() as p:
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'web')))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/menglianggu-digital-guide/'
    browser = p.chromium.launch(args=['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required'], ignore_default_args=['--mute-audio'])
    for name, width, height in [('desktop', 1280, 720), ('phone', 375, 667)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        context.add_init_script('window.__audios=[];const NativeAudio=window.Audio;window.Audio=function(...a){const m=new NativeAudio(...a);__audios.push(m);return m};window.Audio.prototype=NativeAudio.prototype;')
        page = context.new_page()
        errors = []
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base, wait_until='networkidle')
        page.wait_for_function('[...document.querySelectorAll("[data-module]")].every(b=>b.dataset.ready==="true")')
        assert '整合中' not in page.locator('body').text_content()
        page.locator('#introStart').click()
        page.screenshot(path=str(SHOTS / f'integrate-{name}-map.png'))
        page.locator('#hallShortcut').click()
        page.locator('.cover img').wait_for()
        page.screenshot(path=str(SHOTS / f'integrate-{name}-point.png'))
        page.locator('#btnListen').click()
        page.wait_for_function('__audios[0].currentTime>.2&&!__audios[0].paused')
        page.locator('#btnNarrator').click()
        frame = narrator_ready(page, 'hall')
        assert page.evaluate('__audios[0].paused')
        assert page.locator('#bubble').text_content() == ''
        play_narrator(frame)
        frame.locator('#back').click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert page.locator('#btnNarrator').evaluate('e=>e===document.activeElement')
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
        narrator = page.locator('.module-launchers [data-module=narrator]')
        narrator.click()
        frame = narrator_ready(page)
        play_narrator(frame)
        page.screenshot(path=str(SHOTS / f'integrate-{name}-narrator.png'))
        frame.locator('summary').focus()
        page.keyboard.press('Tab')
        assert frame.locator('#back').evaluate('e=>e===document.activeElement')
        page.keyboard.press('Shift+Tab')
        assert frame.locator('summary').evaluate('e=>e===document.activeElement')
        page.keyboard.press('Escape')
        page.locator('dialog[open]').wait_for(state='hidden')
        assert narrator.evaluate('e=>e===document.activeElement')
        narrator.click()
        frame = narrator_ready(page)
        frame.locator('#back').click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert narrator.evaluate('e=>e===document.activeElement')
        panorama = page.locator('.module-launchers [data-module=panorama]')
        panorama.click()
        frame = panorama_ready(page, inspect=True)
        page.screenshot(path=str(SHOTS / f'integrate-{name}-panorama.png'))
        frame.locator('#back').click()
        page.locator('dialog[open]').wait_for(state='hidden')
        assert panorama.evaluate('e=>e===document.activeElement')
        page.locator('[data-tab=quiz]').click()
        assert page.locator('.q').count() == 5
        page.screenshot(path=str(SHOTS / f'integrate-{name}-quiz.png'))
        page.keyboard.press('Escape')
        page.locator('[data-tab=about]').click()
        scene_credits = page.locator('[data-module-credit=panorama]')
        terrain_credits = page.locator('[data-module-credit=terrain]')
        assert scene_credits.locator('a[href*="commons.wikimedia.org"]').count() == 4
        assert scene_credits.locator('a[href*="polyhaven.com"]').count() == 9
        assert scene_credits.locator('a[href="https://polyhaven.com/a/pine_sapling_small"]').count() == 1
        assert scene_credits.locator('a[href="https://polyhaven.com/a/grass_medium_01"]').count() == 1
        assert 'zh-CN-YunyangNeural' in scene_credits.inner_text()
        assert 'SRTM' in terrain_credits.inner_text() and 'AI' in terrain_credits.inner_text()
        narrator_credits = page.locator('[data-module-credit=narrator]')
        for term in ['RealVisXL V4.0 Lightning', 'SadTalker', 'GFPGAN', 'edge-tts', 'zh-CN-XiaoxiaoNeural', 'Open RAIL++-M', 'Apache-2.0']:
            assert term in narrator_credits.inner_text(), term
        for module in ['panorama', 'terrain', 'narrator']:
            page.locator(f'[data-module-credit={module}] h3').evaluate("e=>e.scrollIntoView({block:'start'})")
            page.screenshot(path=str(SHOTS / f'integrate-{name}-about-{module}.png'))
        narrator_credits.locator('a').first.scroll_into_view_if_needed()
        page.screenshot(path=str(SHOTS / f'integrate-{name}-about-narrator-licenses.png'))
        page.keyboard.press('Escape')
        panorama.click()
        frame = panorama_ready(page)
        frame.locator('#back').focus()
        page.keyboard.press('Escape')
        page.locator('dialog[open]').wait_for(state='hidden')
        assert panorama.evaluate('e=>e===document.activeElement')
        assert not errors, errors
        print(f'PASS integration {width}x{height}: map -> point/audio -> per-point video -> terrain -> narrator (real unmuted video/AAC after gesture, captions, keyboard loop) -> panorama hotspot 6 -> quiz -> About; Back/Escape restore portal and point focus; no integration labels or module corner disclosures; all three modules credits retained; console errors: {errors}', flush=True)
        context.close()
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base, wait_until='networkidle')
    page.wait_for_function('navigator.serviceWorker.controller')
    context.set_offline(True)
    page.reload()
    page.locator('#introStart').click()
    page.locator('.module-launchers [data-module=terrain]').click()
    frame = terrain_ready(page)
    assert '/menglianggu-digital-guide/terrain/index.html?embedded=1' in page.locator('dialog[open] iframe').get_attribute('src')
    frame.locator('#back').click()
    page.locator('dialog[open]').wait_for(state='hidden')
    page.locator('.module-launchers [data-module=narrator]').click()
    frame = narrator_ready(page)
    play_narrator(frame)
    frame.locator('#back').click()
    page.locator('dialog[open]').wait_for(state='hidden')
    for media in ['video/narrator/intro.mp4', 'audio/intro.mp3']:
        for value, status, length in [('bytes=0-1023', 206, 1024), ('bytes=-512', 206, 512), ('bytes=999999999-', 416, 0)]:
            result = page.evaluate('''async ({media,value})=>{const r=await fetch(media,{headers:{Range:value}});return {status:r.status,length:(await r.arrayBuffer()).byteLength,range:r.headers.get('Content-Range')}}''', {'media': media, 'value': value})
            assert result['status'] == status and result['length'] == length and result['range'], result
    page.locator('.module-launchers [data-module=panorama]').click()
    frame = panorama_ready(page)
    assert '/menglianggu-digital-guide/scene/index.html?embed=1' in page.locator('dialog[open] iframe').get_attribute('src')
    frame.locator('#back').click()
    page.locator('dialog[open]').wait_for(state='hidden')
    assert not errors, errors
    print(f'PASS offline subpath integration: terrain/elevation, panorama/textures and real narrator video/AAC play through Pages-safe portals; MP3/MP4 byte ranges (prefix, suffix, invalid) work offline; page errors: {errors}', flush=True)
    context.close()
    server.shutdown()
    browser.close()
