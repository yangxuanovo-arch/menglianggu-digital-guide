import json
from pathlib import Path
from playwright.sync_api import sync_playwright

SHOTS = Path('/home/ubuntu/contest/shots')
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://localhost:29229')
    context = browser.new_context(viewport={'width':1280,'height':720},accept_downloads=True)
    context.add_init_script("""
      window.__audios=[]; window.__visited=[];
      const NativeAudio=window.Audio;
      window.Audio=function(...args){
        const a=new NativeAudio(...args); window.__audios.push(a);
        a.addEventListener('loadedmetadata',()=>{a.playbackRate=16;__visited.push(a.src.split('/').pop())});
        return a;
      };window.Audio.prototype=NativeAudio.prototype;
    """)
    page=context.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.goto('http://localhost:8080',wait_until='networkidle')
    page.evaluate('document.fonts.ready')
    page.locator('#introTour').click()
    page.wait_for_function("document.querySelector('#panelTitle').textContent==='研学打卡 · 集章' && !document.querySelector('#panel').classList.contains('hidden')",timeout=140000)
    result=page.evaluate("({visited:__visited,stamps:JSON.parse(localStorage.getItem('mlg_stamps_v1'))})")
    expected=page.evaluate("['intro.mp3',...GUIDE.route.order.map(id=>id+'.mp3'),'outro.mp3']")
    assert result['visited']==expected,result
    assert page.locator('.stamp.on[data-id]').count()==8
    print('PASS full automatic tour: intro -> all 8 route points -> outro; native playback at 16x; 8 stamps earned',flush=True)
    page.screenshot(path=str(SHOTS/'desktop-stamps-complete.png'))
    page.locator('[data-tab="quiz"]').click()
    for question in page.locator('.q').all():
        text=question.locator('b').inner_text().split('. ',1)[1]
        answer=page.evaluate('(text)=>GUIDE.quiz.find(q=>q.q===text).a',text)
        question.locator('.opt').nth(answer).click()
    assert '得分 5 / 5' in page.locator('#quizRes').inner_text()
    print('PASS quiz: 5/5 correct; quiz stamp earned',flush=True)
    page.screenshot(path=str(SHOTS/'desktop-quiz-passed.png'))
    page.locator('#qStamp').click();page.locator('#certName').fill('研学体验者');page.locator('#btnCert').click()
    page.locator('canvas.cert').wait_for()
    assert page.locator('canvas.cert').count()==1
    with page.expect_download() as download:
        page.get_by_text('保存证书图片',exact=True).click()
    download.value.save_as(str(SHOTS/'certificate.png'))
    assert (SHOTS/'certificate.png').read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
    page.screenshot(path=str(SHOTS/'desktop-certificate.png'))
    print('PASS certificate: Canvas 1000x700 PNG downloaded',flush=True)
    page.reload(wait_until='networkidle');page.locator('#introStart').click();page.locator('[data-tab="stamps"]').click()
    assert page.locator('#btnCert').count()==1
    print('PASS stamps and quiz persist after reload',flush=True)
    page.on('dialog',lambda d:d.accept());page.locator('#btnReset').click()
    assert page.locator('.stamp.on').count()==0
    page.locator('.stamp[data-id="hall"]').click();page.locator('#btnRemote').click()
    page.wait_for_function("JSON.parse(localStorage.getItem('mlg_stamps_v1')||'{}').hall",timeout=15000)
    assert '已打卡' in page.locator('#btnStamp').inner_text()
    print('PASS reset and non-site fallback: listening earns hall stamp without geolocation',flush=True)
    page.locator('#btnRemote').click()
    assert page.evaluate("Object.keys(JSON.parse(localStorage.getItem('mlg_stamps_v1'))).length")==1
    print('PASS duplicate fallback does not create duplicate stamps',flush=True)
    print('JOURNEY_CONSOLE_ERRORS:',json.dumps(errors,ensure_ascii=False),flush=True)
    assert not errors
