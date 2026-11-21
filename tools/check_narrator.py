from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


with sync_playwright() as p:
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'web')))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    browser = p.chromium.launch(args=['--autoplay-policy=document-user-activation-required'], ignore_default_args=['--mute-audio'])
    context = browser.new_context(service_workers='block')
    context.add_init_script('window.__audios=[];const NativeAudio=window.Audio;window.Audio=function(...a){const m=new NativeAudio(...a);__audios.push(m);return m};window.Audio.prototype=NativeAudio.prototype;')
    errors = []

    def new_page():
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        return page

    page = new_page()
    media_requests = []
    page.on('request', lambda r: media_requests.append(r.url) if r.url.endswith(('.mp4', '.mp3')) else None)
    page.goto(base)
    page.locator('#intro [data-module=narrator]').click()
    frame = page.frame_locator('dialog[open] iframe')
    frame.locator('#clip option').nth(9).wait_for(state='attached')
    assert len(media_requests) == 0, media_requests
    assert frame.locator('#video').evaluate('v=>!v.hasAttribute("src") && v.preload==="none" && v.playsInline')
    frame.locator('#play').click()
    child = frame.locator('#video').element_handle().owner_frame()
    child.wait_for_function('document.querySelector("#video").currentTime>.2')
    frame.locator('#play').click()
    assert frame.locator('#video').evaluate('v=>v.paused')
    paused = frame.locator('#video').evaluate('v=>v.currentTime')
    page.wait_for_timeout(200)
    assert abs(frame.locator('#video').evaluate('v=>v.currentTime') - paused) < .1
    frame.locator('#play').click()
    child.wait_for_function('document.querySelector("#video").currentTime>' + str(paused + .1))
    frame.locator('#clip').select_option('hall')
    assert frame.locator('#video').evaluate('v=>v.paused&&!v.hasAttribute("src")')
    frame.locator('#play').click()
    child.wait_for_function('document.querySelector("#video").currentTime>.1')
    frame.locator('#next').click()
    child.wait_for_function('document.querySelector("#video").currentTime>.1')
    assert frame.locator('#clip').input_value() == 'field-command'
    frame.locator('#stop').click()
    assert frame.locator('#video').evaluate('v=>v.paused&&!v.hasAttribute("src")')
    frame.locator('#back').click()
    page.locator('dialog[open]').wait_for(state='hidden')
    assert page.locator('.module-launchers [data-module=narrator]').evaluate('e=>e===document.activeElement')
    page.locator('#hallShortcut').click()
    page.locator('#btnNarrator').click()
    frame = page.frame_locator('dialog[open] iframe')
    frame.locator('#video').evaluate('v=>v.addEventListener("loadedmetadata",()=>v.playbackRate=16)')
    frame.locator('#play').click()
    assert not page.evaluate('JSON.parse(localStorage.getItem("mlg_stamps_v1")||"{}").hall')
    page.evaluate('window.postMessage({type:"guide:narrator-complete",id:"trench"},location.origin)')
    page.wait_for_function('JSON.parse(localStorage.getItem("mlg_stamps_v1")||"{}").hall', timeout=15000)
    assert not page.evaluate('JSON.parse(localStorage.getItem("mlg_stamps_v1")||"{}").trench')
    frame.locator('#back').click()
    page.locator('dialog[open]').wait_for(state='hidden')
    assert '已打卡' in page.locator('#btnStamp').inner_text()
    assert page.locator('#btnNarrator').evaluate('e=>e===document.activeElement')
    print('PASS narrator controls: idle requests no MP4/MP3; real play/pause/resume/stop and chapter switch; actual ended clip earns point stamp; forged parent message ignored; intro/point focus restored', flush=True)
    page.close()

    page = new_page()
    page.route('**/video/narrator/*.mp4', lambda r: r.fulfill(status=200, content_type='video/mp4', body=b''))
    page.goto(base + 'narrator/index.html?clip=unknown')
    assert page.locator('#clip').input_value() == 'intro'
    page.locator('#play').click()
    page.wait_for_function('__audios[0].currentTime>.2 && !__audios[0].paused && !__audios[0].muted')
    assert '静态肖像' in page.locator('#status').inner_text()
    page.locator('summary').click()
    assert page.locator('#transcript').inner_text()
    page.locator('#play').click()
    assert page.evaluate('__audios[0].paused')
    page.locator('#play').click()
    page.wait_for_function('!__audios[0].paused')
    page.locator('#stop').click()
    assert page.evaluate('__audios[0].paused')
    print('PASS narrator invalid video: empty MP4 falls back to unmuted MP3/static portrait; controls work; unknown clip selects intro', flush=True)
    page.close()

    page = new_page()
    page.add_init_script('const nativePlay=HTMLMediaElement.prototype.play;window.blockPlay=true;HTMLMediaElement.prototype.play=function(){return window.blockPlay?Promise.reject(new DOMException("blocked","NotAllowedError")):nativePlay.call(this)}')
    page.goto(base + 'narrator/index.html')
    page.locator('#play').click()
    page.get_by_role('button', name='重试', exact=True).wait_for()
    assert '播放受限' in page.locator('#status').inner_text()
    page.evaluate('window.blockPlay=false')
    page.locator('#play').click()
    page.wait_for_function('document.querySelector("#video").currentTime>.2&&!document.querySelector("#video").muted')
    page.close()

    page = new_page()
    page.route('**/audio/*.srt', lambda r: r.fulfill(status=200, body='not valid captions'))
    page.goto(base + 'narrator/index.html')
    page.get_by_text('字幕暂不可用，可展开讲解全文', exact=True).wait_for()
    page.locator('#play').click()
    page.wait_for_function('document.querySelector("#video").currentTime>.2')
    page.locator('summary').click()
    assert page.locator('#transcript').is_visible()
    page.close()

    page = new_page()
    page.route('**/video/narrator/*.mp4', lambda r: r.fulfill(status=200, content_type='video/mp4', body=b''))
    page.route('**/audio/*.mp3', lambda r: r.fulfill(status=200, content_type='audio/mpeg', body=b''))
    page.goto(base + 'narrator/index.html')
    page.locator('#play').click()
    page.get_by_text('语音暂不可用，可展开讲解全文', exact=True).wait_for()
    assert page.locator('#play').inner_text() == '重试'
    page.locator('summary').click()
    assert page.locator('#transcript').inner_text()
    page.close()

    page = new_page()
    page.route('**/content/data.js', lambda r: r.fulfill(content_type='application/javascript', body='window.GUIDE=null;'))
    page.goto(base + 'narrator/index.html')
    assert page.locator('#play').is_disabled()
    assert '资料暂不可用' in page.locator('#status').inner_text()
    page.close()
    assert not errors, errors
    print(f'PASS narrator resilience: rejected play retries; missing captions retain transcript/playback; failed MP3 keeps retry/transcript; empty data fails safely; page/console errors: {errors}', flush=True)
    context.close()
    browser.close()
    server.shutdown()
