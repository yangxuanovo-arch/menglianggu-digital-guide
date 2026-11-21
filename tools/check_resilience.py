from pathlib import Path

from playwright.sync_api import sync_playwright

URL = 'http://localhost:8080'
with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(service_workers='block')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.locator('#introStart').click()
    page.locator('[data-tab=quiz]').click()
    first = page.locator('.q b').all_inner_texts()
    page.locator('.q .opt').first.click()
    page.reload()
    page.locator('#introStart').click()
    page.locator('[data-tab=quiz]').click()
    assert page.locator('.q b').all_inner_texts() == first
    assert page.locator('.exp:not(.hidden)').count() == 1
    page.evaluate("localStorage.setItem('mlg_quiz_session_v1','{broken')")
    page.reload()
    page.locator('#introStart').click()
    page.locator('[data-tab=quiz]').click()
    assert page.locator('.exp:not(.hidden)').count() == 0
    page.locator('#panelClose').click()
    page.locator('#hallShortcut').click()
    page.evaluate("()=>{window.HTMLMediaElement.prototype.play=()=>Promise.reject(new Error('test playback restriction'))}")
    page.locator('#btnListen').click()
    page.wait_for_function('document.querySelector("#gPause").textContent==="重试"')
    page.locator('#gPause').click()
    page.wait_for_timeout(200)
    assert page.locator('#gPause').inner_text() == '重试'
    page.locator('[data-tab=quiz]').click()
    page.locator('#panelClose').click()
    assert page.locator('#guide').is_visible()
    page.locator('#gStop').click()
    assert not errors, errors
    print('PASS resilience: partial quiz survives reload; corrupt session starts fresh; rejected play/resume remains retryable; panel close restores active guide; page errors: []')
    context.close()
    context = browser.new_context(service_workers='block')
    page = context.new_page()
    page.route('**/audio/hall.srt', lambda route: route.fulfill(status=503, body='unavailable'))
    page.goto(URL)
    page.locator('#introStart').click()
    page.locator('#hallShortcut').click()
    page.locator('#btnListen').click()
    page.wait_for_function('document.querySelector("#announcer").textContent.includes("字幕暂不可用")')
    assert len(page.locator('#sheetBody .text').all_inner_texts()) > 0
    page.locator('[data-tab=about]').click()
    page.locator('summary').click()
    assert '开场与结束讲解全文' in page.locator('#panelBody').inner_text()
    print('PASS missing captions: nonfatal notice, point transcript and full intro/outro transcripts available')
    context.close()
    context = browser.new_context(service_workers='block', viewport={'width': 390, 'height': 844})
    page = context.new_page()
    cdp = context.new_cdp_session(page)
    cdp.send('Network.enable')
    cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 400, 'downloadThroughput': 50000, 'uploadThroughput': 50000})
    page.goto(URL, wait_until='domcontentloaded')
    page.locator('#introStart').click()
    assert page.locator('#hallShortcut').is_visible()
    page.screenshot(path='/home/ubuntu/contest/shots/slow-network-system-font.png')
    print('PASS slow-network shell: 400kbit/s + 400ms, interactive map and local Chinese system UI; DCL %.0f ms' % page.evaluate('performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd'))
    context.close()
    browser.close()
