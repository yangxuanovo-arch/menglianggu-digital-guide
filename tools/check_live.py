"""Check the deployed guide, including clean-install offline navigation."""
import argparse
from pathlib import Path
import re
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='https://menglianggu-guide.pages.dev/')
    parser.add_argument('--shots', type=Path, default=Path.home() / 'contest/shots')
    args = parser.parse_args()
    base = args.base_url.rstrip('/') + '/'
    args.shots.mkdir(parents=True, exist_ok=True)
    cache = re.search(r"const CACHE='([^']+)'", (ROOT / 'web/sw.js').read_text())[1]
    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
            ignore_default_args=['--mute-audio'])
        for width, height in [(1280, 720), (375, 667)]:
            context = browser.new_context(viewport={'width': width, 'height': height})
            context.add_init_script('''window.__audios=[];const NativeAudio=window.Audio;
                window.Audio=function(...args){const a=new NativeAudio(...args);__audios.push(a);return a};
                window.Audio.prototype=NativeAudio.prototype;''')
            page = context.new_page()
            page.set_default_timeout(60000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
            page.goto(base, wait_until='networkidle')
            page.wait_for_function('navigator.serviceWorker.controller', timeout=180000)
            assert page.evaluate('(expected)=>caches.has(expected)', cache)
            state = page.evaluate('''async (name)=>{
                const c=await caches.open(name),keys=await c.keys();
                return Promise.all(keys.filter(k=>k.url.endsWith('/')).map(async k=>{
                    const r=await c.match(k);return {url:k.url,redirected:r.redirected}}))
            }''', cache)
            assert {entry['url'] for entry in state} == {urljoin(base, path) for path in ['', 'terrain/', 'narrator/', 'scene/']}
            assert all(not entry['redirected'] for entry in state), state
            for offline in [False, True]:
                phase = 'OFFLINE' if offline else 'LIVE'
                context.set_offline(offline)
                if offline:
                    page.reload(wait_until='networkidle')
                    assert page.locator('#networkStatus').is_visible()
                page.locator('#introStart').click()
                if not offline:
                    page.get_by_role('button', name='全区概览', exact=True).click()
                    page.locator('.leaflet-control-zoom-in').click()
                page.locator('#hallShortcut').click()
                page.locator('.cover img').evaluate('im=>im.decode()')
                page.locator('#btnListen').click()
                page.wait_for_function('__audios[0].currentTime>.5 && !__audios[0].paused && !__audios[0].muted')
                page.wait_for_function('document.querySelector("#bubble").textContent.length>8')
                page.locator('#gStop').click()
                page.keyboard.press('Escape')
                for module in ['terrain', 'narrator', 'panorama']:
                    portal = page.locator(f'.module-launchers [data-module={module}]')
                    portal.click()
                    iframe = page.locator('dialog[open] iframe')
                    frame = page.frame_locator('dialog[open] iframe')
                    src = iframe.get_attribute('src')
                    assert src.startswith(base) and 'index.html' not in src, src
                    if module == 'terrain':
                        frame.locator('#data-status').filter(has_text='真实数字高程').wait_for()
                        frame.locator('#loading').wait_for(state='hidden')
                        assert frame.locator('#scene canvas').is_visible()
                        frame.locator('[data-phase="2"]').click()
                    elif module == 'narrator':
                        frame.locator('#play').click()
                        video = frame.locator('#video').element_handle()
                        video.owner_frame().wait_for_function(
                            'v=>v.currentTime>.4&&!v.paused&&!v.muted&&v.webkitAudioDecodedByteCount>0', arg=video)
                        video.owner_frame().wait_for_function('document.querySelector("#subtitle").textContent.length>5')
                    else:
                        frame.locator('#start.ready').wait_for()
                        frame.locator('#free').click()
                        frame.locator('#start.hide').wait_for()
                        assert frame.locator('#stage canvas').is_visible()
                    if not offline:
                        page.screenshot(path=str(args.shots / f'cloudflare-{width}-{module}.png'))
                    if module == 'narrator':
                        frame.locator('#back').focus()
                        page.keyboard.press('Escape')
                    else:
                        frame.locator('#back').click(force=True)
                    page.locator('dialog[open]').wait_for(state='hidden')
                    assert portal.evaluate('e=>e===document.activeElement')
                page.locator('[data-tab=quiz]').click()
                for question in page.locator('.q').all():
                    text = question.locator('b').inner_text().split('. ', 1)[1]
                    answer = page.evaluate('(t)=>GUIDE.quiz.find(q=>q.q===t).a', text)
                    question.locator('.opt').nth(answer).click()
                assert '5 / 5' in page.locator('#quizRes').inner_text()
                page.keyboard.press('Escape')
                page.locator('[data-tab=about]').click()
                about = page.locator('#panelBody').inner_text()
                assert '迟庆宇，2024级机器人工程专业本科生' in about
                assert '@' not in about
                for term in ['RealVisXL', 'SadTalker', 'GFPGAN', 'edge-tts', 'SRTM']:
                    assert term in about, term
                assert page.locator('#panelBody a').count() > 50
                page.keyboard.press('Escape')
                if offline:
                    for path in ['index.html', 'terrain/index.html', 'narrator/index.html', 'scene/index.html']:
                        result = page.evaluate('''async path=>{const r=await fetch(path,{redirect:'manual'});
                            return {status:r.status,redirected:r.redirected}}''', path)
                        assert result == {'status': 200, 'redirected': False}, (path, result)
                    for media in ['audio/intro.mp3', 'video/narrator/intro.mp4']:
                        result = page.evaluate('''async path=>{const r=await fetch(path,{headers:{Range:'bytes=0-1023'}});
                            return {status:r.status,bytes:(await r.arrayBuffer()).byteLength}}''', media)
                        assert result == {'status': 206, 'bytes': 1024}, result
                    page.goto(urljoin(base, 'narrator/index.html?clip=hall'), wait_until='networkidle')
                    assert page.locator('#clip').input_value() == 'hall'
                    page.locator('#back').click()
                    page.locator('#introStart').wait_for()
                assert not errors, errors
                print(f'PASS {phase} {width}x{height}: map -> point/photo/unmuted audio + captions -> terrain/narrator/panorama -> return/focus -> quiz 5/5 -> About sources/AI; console/page errors: {errors}', flush=True)
            print(f'PASS cache {width}x{height}: {cache}; four canonical directory responses without redirects; offline reload, legacy index.html navigation and MP3/MP4 byte ranges', flush=True)
            context.close()
        browser.close()


if __name__ == '__main__':
    main()
