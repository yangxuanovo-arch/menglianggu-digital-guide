const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const base = process.env.NARRATOR_TEST_URL || 'http://127.0.0.1:8080';
const shots = process.env.NARRATOR_SHOTS || path.join(process.env.HOME, 'narrator_work/shots');
const fixture = path.join(shots, 'intro-test.mp4');
const audioDirectory = path.resolve(__dirname, '../../web/audio');
fs.mkdirSync(shots, { recursive: true });
assert.ok(fs.existsSync(fixture), 'Prepare the five-second intro-test.mp4 fixture first');

function serveMedia(route, file, contentType) {
  const data = fs.readFileSync(file);
  const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
  const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes' };
  if (!range) return route.fulfill({ body: data, headers });
  const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
  if (start > end) return route.fulfill({ status: 416, headers: { 'Content-Range': `bytes */${data.length}` } });
  return route.fulfill({ status: 206, body: data.subarray(start, end + 1), headers: {
    ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`,
  } });
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || 'google-chrome', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required'],
    ignoreDefaultArgs: ['--mute-audio'],
  });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        const Audio = window.Audio;
        window.Audio = function (...args) {
          const audio = new Audio(...args);
          window.testFallback = audio;
          return audio;
        };
      });
      const page = await context.newPage();
      const errors = [], missing = [], videos = [], sounds = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() !== 'error') return;
        if (message.text().includes('404') && message.location().url.includes('/video/narrator/')) missing.push(message.text());
        else errors.push(message.text());
      });
      page.on('request', request => {
        if (request.url().endsWith('.mp4')) videos.push(request.url());
        if (request.url().endsWith('.mp3')) sounds.push(request.url());
      });
      await page.route('**/audio/*.mp3', route => serveMedia(route, path.join(audioDirectory, path.basename(new URL(route.request().url()).pathname)), 'audio/mpeg'));
      await page.route('**/video/narrator/intro.mp4', route => serveMedia(route, fixture, 'video/mp4'));
      await page.route('**/video/narrator/*.mp4', route => {
        if (route.request().url().endsWith('/intro.mp4')) return route.fallback();
        return route.fulfill({ status: 404, body: 'Not rendered yet' });
      });
      await page.goto(base);
      await page.locator('.opening-experiences [data-module=narrator]').click();
      assert.equal(videos.length, 0, 'Idle must not request a video');
      assert.equal(sounds.length, 0, 'Idle must not request an MP3');
      assert.ok(await page.locator('#avatar').evaluate(v => v.preload === 'none' && v.playsInline && !v.hasAttribute('src')));
      await page.screenshot({ path: path.join(shots, `${viewport.width}-idle.png`) });

      await page.locator('#gPause').click();
      await page.waitForFunction(() => {
        const v = document.querySelector('#avatar');
        return !v.paused && v.currentTime > 0.25 && v.videoWidth === 480 && v.webkitAudioDecodedByteCount > 0;
      });
      const layout = await page.evaluate(() => {
        function box(selector) {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        }
        return { frame: box('.narrator-frame'), bubble: box('#bubble'), dock: box('#guide'), map: box('#map'), controls: box('.guide-ctrl') };
      });
      const requiredWidth = viewport.width > 600 ? 240 : 120;
      assert.ok(layout.frame.width >= requiredWidth && layout.frame.height >= requiredWidth * 1.25, 'Narrator must be the requested portrait size');
      assert.ok(layout.bubble.x >= layout.frame.right && layout.controls.x >= layout.bubble.right, 'Subtitles and controls must sit beside the portrait');
      assert.ok(layout.frame.y >= layout.dock.y && layout.frame.bottom <= layout.dock.bottom, 'Portrait must fit inside the dock');
      assert.ok(layout.controls.x >= 0 && layout.controls.right <= viewport.width && layout.controls.bottom <= layout.dock.bottom, 'Controls must remain inside the viewport and dock');
      assert.ok(layout.map.bottom <= layout.dock.y && layout.map.height >= (viewport.width > 600 ? 180 : 350), 'Map must remain visible above the dock');
      console.log(`Layout ${viewport.width}: portrait=${layout.frame.width}x${layout.frame.height}; visible map height=${layout.map.height}`);
      const legacyFrame = await page.evaluate(() => {
        const sheet = Array.from(document.styleSheets).find(sheet => sheet.href && sheet.href.endsWith('/css/narrator.css'));
        const index = Array.from(sheet.cssRules).findIndex(rule => rule.conditionText && rule.conditionText.includes('aspect-ratio'));
        const modernRule = sheet.cssRules[index].cssText;
        sheet.deleteRule(index);
        const override = document.createElement('style');
        override.textContent = '.narrator-frame{aspect-ratio:auto!important}';
        document.head.appendChild(override);
        const r = document.querySelector('.narrator-frame').getBoundingClientRect();
        const result = { width: r.width, height: r.height };
        override.remove();
        sheet.insertRule(modernRule, index);
        return result;
      });
      assert.equal(legacyFrame.width, requiredWidth);
      assert.equal(legacyFrame.height, requiredWidth * 1.25, 'Portrait must retain its height without aspect-ratio support');
      console.log(`Legacy ratio fallback ${viewport.width}: portrait=${legacyFrame.width}x${legacyFrame.height}`);
      assert.ok(await page.locator('#avatar').evaluate(v => !v.muted && v.volume > 0 && !window.testFallback.src));
      assert.equal(sounds.length, 0, 'Video narration must not load duplicate MP3 audio');
      await page.screenshot({ path: path.join(shots, `${viewport.width}-video.png`) });
      await page.locator('#gPause').click();
      const paused = await page.locator('#avatar').evaluate(v => v.currentTime);
      await page.waitForTimeout(200);
      assert.ok(await page.locator('#avatar').evaluate((v, t) => v.paused && Math.abs(v.currentTime - t) < 0.05, paused));
      await page.locator('#gPause').click();
      await page.waitForFunction(t => document.querySelector('#avatar').currentTime > t + 0.1, paused);
      await page.locator('#gMin').click();
      assert.ok(await page.locator('#guide').evaluate(dock => {
        const r = dock.getBoundingClientRect();
        return ['#gStop', '#gMin'].every(selector => {
          const b = dock.querySelector(selector).getBoundingClientRect();
          return b.y >= r.y && b.bottom <= r.bottom;
        });
      }), 'Minimized controls must fit inside the compact dock');
      await page.locator('#gMin').click();
      await page.locator('#gStop').click();
      assert.ok(await page.locator('#avatar').evaluate(v => v.paused && !v.hasAttribute('src') && !window.testFallback.hasAttribute('src')));

      await page.locator('.module-launchers [data-module=narrator]').click();
      await page.locator('#gPause').click();
      await page.waitForFunction(() => document.querySelector('#avatar').currentTime > 0.1);
      await page.locator('#avatar').evaluate(v => v.currentTime = v.duration - 0.1);
      await page.waitForFunction(() => document.querySelector('#gPause').textContent === '重新讲解');
      assert.ok(await page.locator('#avatar').evaluate(v => v.hidden));
      await page.locator('#gStop').click();

      await page.evaluate(() => window.__guide.openPoint('field-command'));
      await page.locator('#btnListen').click();
      await page.waitForFunction(() => window.testFallback.src.endsWith('/field-command.mp3') && !window.testFallback.paused);
      await page.locator('#gStop').click();
      assert.ok(await page.evaluate(() => !JSON.parse(localStorage.getItem('mlg_stamps_v1') || '{}')['field-command']), 'Stopping an unfinished point must not stamp it');
      await page.locator('#sheetClose').click();
      await page.locator('.module-launchers [data-module=narrator]').click();
      await page.locator('#gPause').click();
      await page.waitForFunction(() => window.testFallback.src.endsWith('/field-command.mp3') && window.testFallback.readyState >= 2 && !window.testFallback.paused);
      await page.evaluate(() => window.testFallback.currentTime = window.testFallback.duration - 0.1);
      await page.waitForFunction(() => document.querySelector('#gPause').textContent === '重新讲解');
      assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('mlg_stamps_v1'))['field-command']), 'Finishing an interrupted point through narrator replay must save its stamp');
      await page.locator('#gStop').click();

      await page.evaluate(() => window.__guide.openPoint('hall'));
      await page.locator('#btnListen').click();
      await page.waitForFunction(() => window.testFallback.src.endsWith('/hall.mp3') && window.testFallback.readyState >= 2 && !window.testFallback.paused);
      await page.evaluate(() => window.testFallback.currentTime = window.testFallback.duration - 0.1);
      await page.waitForFunction(() => document.querySelector('#gPause').textContent === '重新讲解');
      await page.locator('#gPause').click();
      await page.waitForFunction(() => window.testFallback.src.endsWith('/hall.mp3') && !window.testFallback.paused);
      assert.ok(videos[videos.length - 1].endsWith('/hall.mp4'), 'Replay after point completion must request the same point, not intro');
      await page.locator('#gStop').click();
      await page.locator('#sheetClose').click();

      await page.locator('[data-tab=route]').click();
      await page.locator('#btnTour').click();
      await page.waitForFunction(() => document.querySelector('#avatar').currentTime > 0.1);
      await page.locator('#avatar').evaluate(v => v.currentTime = v.duration - 0.1);
      await page.waitForFunction(() => !window.testFallback.paused && window.testFallback.currentTime > 0.2);
      assert.ok(await page.locator('#avatar').evaluate(v => v.hidden && v.paused && !v.hasAttribute('src')));
      assert.ok(await page.locator('#bubble').textContent());
      await page.screenshot({ path: path.join(shots, `${viewport.width}-fallback.png`) });
      await page.locator('#gPause').click();
      assert.ok(await page.evaluate(() => window.testFallback.paused));
      await page.locator('#gPause').click();
      await page.waitForFunction(() => !window.testFallback.paused);
      const order = await page.evaluate(() => window.GUIDE.route.order);
      for (const id of order) {
        await page.waitForFunction(id => window.testFallback.src.endsWith(`/${id}.mp3`) && window.testFallback.readyState >= 2 && !window.testFallback.paused, id).catch(async error => {
          const state = await page.evaluate(() => ({ src: window.testFallback.src, time: window.testFallback.currentTime, duration: window.testFallback.duration, paused: window.testFallback.paused, status: document.querySelector('#gPause').textContent }));
          throw new Error(`Waiting for ${id}: ${JSON.stringify(state)}; ${error.message}`);
        });
        await page.evaluate(() => window.testFallback.currentTime = window.testFallback.duration - 0.1);
      }
      await page.waitForFunction(() => window.testFallback.src.endsWith('/outro.mp3') && window.testFallback.readyState >= 2);
      await page.evaluate(() => window.testFallback.currentTime = window.testFallback.duration - 0.1);
      await page.waitForFunction(() => document.querySelector('#guide').classList.contains('hidden') && document.querySelector('[data-tab=stamps]').classList.contains('active'));
      assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('mlg_stamps_v1'))).filter(id => !id.startsWith('__')).length), order.length);

      await page.locator('#panelClose').click();
      await page.locator('[data-tab=route]').click();
      await page.evaluate(() => {
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          HTMLMediaElement.prototype.play = play;
          return Promise.reject(new DOMException('User activation required', 'NotAllowedError'));
        };
      });
      await page.locator('#btnTour').click();
      await page.waitForFunction(() => document.querySelector('#gPause').textContent === '重试');
      await page.locator('#gPause').click();
      await page.waitForFunction(() => !document.querySelector('#avatar').paused);
      await page.locator('#gStop').click();

      await page.route('**/video/narrator/intro.mp4', route => route.fulfill({ body: '', contentType: 'video/mp4' }));
      await page.route('**/audio/intro.srt', route => route.fulfill({ body: '' }));
      await page.locator('.module-launchers [data-module=narrator]').click();
      await page.locator('#gPause').click();
      await page.waitForFunction(() => !window.testFallback.paused && window.testFallback.currentTime > 0.1);
      assert.ok((await page.locator('body').textContent()).includes('字幕暂不可用'));
      await page.locator('#gStop').click();
      await page.route('**/audio/intro.mp3', route => route.fulfill({ body: 'bad audio', contentType: 'audio/mpeg' }));
      await page.locator('.module-launchers [data-module=narrator]').click();
      await page.locator('#gPause').click();
      await page.waitForFunction(() => document.querySelector('#gPause').textContent === '重试');
      assert.ok(await page.locator('#avatar').evaluate(v => v.hidden));
      await page.locator('#gStop').click();

      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}x${viewport.height}: idle, audible video, pause/resume/stop, point replay after end, interrupted-point replay stamps, MP3 fallback, complete tour chaining/stamps, autoplay retry, empty media/SRT, audio error`);
      console.log(`Console ${viewport.width}: application errors=0; expected missing-video HTTP 404 diagnostics=${missing.length}`);
      console.log(`Expected diagnostic: ${missing[0]}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
