"""Record the live guide and render a narrated 1080p submission video.

Requires Playwright Chromium, Pillow, edge-tts, ffmpeg/libass and system Chinese
fonts. Run: python3 tools/build_video.py --base-url https://menglianggu-guide.pages.dev/
Intermediate recordings and the resumable manifest stay outside the repository.
"""
import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urljoin, urlparse

import edge_tts
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright


TITLE = '崮上丰碑——孟良崮战役纪念地数字导览'
NAME = f'红色齐鲁-数字创意挑战赛-{TITLE}-山东大学'
VOICE = 'zh-CN-XiaoxiaoNeural'
SCENES = [
    ('title', '崮上丰碑 · 作品演示', 12, '崮上丰碑，孟良崮战役纪念地数字导览。山东大学低空科学与工程学院，学生组，任务一。'),
    ('map', '01 / 看地图 · 认识纪念地', 20, '作品以山东蒙阴孟良崮战役纪念地为核心。真实地图连接山下纪念馆与山上遗址，支持缩放、平移和全区概览，让研学从清晰的空间认知开始。'),
    ('route', '02 / 走路线 · 区分步行与接驳', 18, '推荐路线串联八个研学点，区分步行与乘车接驳。山下馆区和山上遗址并不相邻，距离与用时仅作估算，实际参观请以景区当日公告和现场指示为准。'),
    ('point', '03 / 听讲解 · 实景照片与小崮', 31, '打开纪念馆点位，实景照片、原创讲解和资料来源一同呈现。点击听讲解，小崮随声音变化口型，同步字幕帮助理解。下面请听一段网站原声。'),
    ('tour', '04 / 自动导览 · 按路线串联点位', 17, '一键启动自动导览，小崮按路线顺序串联点位。这里节选开场，完整导览可以随时暂停、继续或停止。'),
    ('stamps', '05 / 集章 · 记录学习进度', 16, '集章面板展示八处点位和知识问答进度。现场定位或听完点位讲解可以获得印章；进度保存在当前浏览器，不代表已经实地到访。'),
    ('quiz', '06 / 问答 · 主动回顾与思考', 18, '知识问答从题库抽取五题，作答后立即显示解析。通过问答可以获得学习印章，让参观不止于观看，也成为主动回顾与思考。'),
    ('certificate', '研学证书 · 隔离浏览器演示进度，非实地到访', 15, '集齐点位印章并通过问答后，可以填写姓名生成研学证书。此处使用隔离浏览器中的演示进度，仅展示功能，不代表实地到访。'),
    ('terrain', '07 / 3D沙盘 · 现代高程与教学示意', 22, '三维沙盘以现代数字高程呈现山地起伏，沿时间轴查看战役阶段。部队位置与箭线是教学示意，并非精确阵位或行军轨迹；现代高程也不等于历史地表复原。'),
    ('narrator', '08 / AI数字讲述 · 虚构形象与合成声音', 25, '数字讲述提供分章视频、同步字幕与讲解全文。形象和声音均为人工智能合成，不是真人或历史影像。下面播放一段数字讲解员的原声。'),
    ('panorama', '09 / 全景 · 三维示意场景，非现场全景摄影', 22, '三维全景场景支持环视、热点切换与文字讲解。这里是依据资料制作的示意场景，不是现场全景摄影；宽景将纪念碑、山地与人民支前主题联系起来。'),
    ('phone', '10 / 手机适配 · 375×667真实竖屏页面', 15, '手机端保留地图、点位与底部导航，竖屏也能查看照片和路线。线上预习与线下参观相结合，让红色研学更易触达。'),
    ('about', '11 / 关于 · 史料、许可与AI声明', 19, '关于页集中列出史料、照片许可、地图数据及模型来源。配音使用人工智能语音合成，小崮为原创矢量形象；数字人、地形和场景的人工智能使用均有披露。'),
    ('ending', '以地图连接历史，以学习传承精神', 14, '以地图连接历史，以学习传承精神。欢迎访问崮上丰碑，在庄重的数字导览中，走近孟良崮，感悟军民同心的力量。'),
]


def run(args):
    subprocess.run([str(x) for x in args], check=True)


def probe(path):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))


def font_path():
    return subprocess.check_output(['fc-match', '-f', '%{file}', 'Noto Sans CJK SC'], text=True).strip()


def card(path, base, ending=False):
    image = Image.new('RGB', (1920, 1080), '#211512')
    draw = ImageDraw.Draw(image)
    draw.rectangle((100, 115, 1820, 122), fill='#b8860b')
    draw.rectangle((100, 950, 1820, 953), fill='#b8860b')
    lines = [(280, '崮上丰碑', 100), (420, '孟良崮战役纪念地数字导览', 56),
             (565, '山东大学 低空科学与工程学院', 42), (650, '学生组 · 任务一 红色数字地图导览', 36)]
    if ending:
        lines = [(230, '以地图连接历史，以学习传承精神', 62), (385, base, 46),
                 (535, '山东大学 低空科学与工程学院 · 学生组', 40),
                 (645, '队长 魏冰洋　成员 隋源、迟庆宇', 40), (725, '指导教师 于瑞璇', 36)]
    for y, text, size in lines:
        draw.text((960, y), text, font=ImageFont.truetype(font_path(), size), fill='#e9cf8a', anchor='mm')
    image.save(path)


def subtitles(scene, path):
    def clock(t):
        return f'{int(t//3600)}:{int(t//60)%60:02}:{t%60:05.2f}'
    lines = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', '[V4+ Styles]',
             'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
             'Style: Default,Noto Sans CJK SC,34,&H00FFFFFF,&H00FFFFFF,&H00201512,&H00201512,0,0,0,0,100,100,0,0,3,5,0,2,55,55,22,1',
             'Style: Heading,Noto Sans CJK SC,28,&H00E8C585,&H00FFFFFF,&H00201512,&H00201512,0,0,0,0,100,100,0,0,3,5,0,7,26,26,15,1',
             'Style: AI,Noto Sans CJK SC,22,&H00E8C585,&H00FFFFFF,&H00201512,&H00201512,0,0,0,0,100,100,0,0,3,4,0,9,26,26,15,1',
             '[Events]', 'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text']
    def add(start, end, text, style='Default'):
        lines.append(f'Dialogue: 0,{clock(start)},{clock(end)},{style},,0,0,0,,{text}')
    add(0, scene['duration'], scene['heading'], 'Heading')
    add(0, scene['duration'], '配音为AI合成 · 网站实录 · 片头片尾为制作画面', 'AI')
    chunks = re.findall(r'[^，。；！？]+[，。；！？]?', scene['text'])
    start = 0.5
    for chunk in chunks:
        end = start + scene['voice_duration'] * len(chunk) / len(scene['text'])
        add(start, end, chunk)
        start = end
    for audio in scene.get('site_audio', []):
        add(audio['at'], audio['at'] + audio['duration'], '网站原声 · ' + audio['caption'])
    path.write_text('\n'.join(lines))


def validate_audio(scene):
    assert 0 < scene['voice_duration'] + .5 < scene['duration']
    previous_end = scene['voice_duration'] + .5
    for audio in scene.get('site_audio', []):
        assert audio['duration'] > 0 and audio['offset'] >= 0
        assert audio['at'] >= previous_end, 'Voiceover/site audio overlap'
        previous_end = audio['at'] + audio['duration']
        assert previous_end <= scene['duration'], 'Audio exceeds scene'


def wait_for_media(media, timeout_ms=8000):
    media.evaluate('''(m, timeout)=>new Promise((resolve,reject)=>{
        function cleanup(){clearTimeout(timer);m.removeEventListener('timeupdate',check)}
        function check(){if(m.currentTime>.15&&!m.paused){cleanup();resolve()}}
        const timer=setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for sampled media playback'))},timeout);
        m.addEventListener('timeupdate',check);check()
    })''', timeout_ms)


def record(browser, scene, work, base):
    sid = scene['id']
    size = {'width': 375, 'height': 667} if sid == 'phone' else {'width': 1920, 'height': 1080}
    context = browser.new_context(viewport=size, record_video_dir=work/'raw', record_video_size=size)
    context.add_init_script('''window.__demoAudio=[];const NativeAudio=window.Audio;
        window.Audio=function(...args){const a=new NativeAudio(...args);__demoAudio.push(a);return a};
        window.Audio.prototype=NativeAudio.prototype;''')
    page = context.new_page()
    page.set_default_timeout(90000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base, wait_until='networkidle')
    page.locator('#introStart').click()
    scene['site_audio'] = []
    frame = None
    if sid in ('route', 'stamps', 'quiz', 'about'):
        page.locator(f'[data-tab={sid}]').click()
    elif sid in ('point', 'phone'):
        if sid == 'point':
            page.locator('#hallShortcut').click()
            page.locator('.cover img').evaluate('im=>im.decode()')
    elif sid == 'tour':
        page.locator('[data-tab=route]').click()
    elif sid == 'certificate':
        page.evaluate('localStorage.setItem("mlg_stamps_v1",JSON.stringify(Object.fromEntries(GUIDE.points.map(p=>[p.id,Date.now()]).concat([["__quiz",Date.now()]]))))')
        page.reload(wait_until='networkidle')
        page.locator('#introStart').click()
        page.locator('[data-tab=stamps]').click()
        page.locator('#certName').fill('研学体验者')
        page.locator('#btnCert').click()
        page.locator('canvas.cert').wait_for()
        page.locator('canvas.cert').scroll_into_view_if_needed()
    elif sid in ('terrain', 'narrator', 'panorama'):
        page.locator(f'.module-launchers [data-module={sid}]').click()
        frame = page.frame_locator('dialog[open] iframe')
        if sid == 'terrain':
            frame.locator('#data-status').filter(has_text='真实数字高程').wait_for()
            frame.locator('#loading').wait_for(state='hidden')
        elif sid == 'panorama':
            frame.locator('#start.ready').wait_for()
            frame.locator('#free').click(no_wait_after=True)
            frame.locator('#start.hide').wait_for()
        else:
            frame.locator('#clip').wait_for()
    page.wait_for_timeout(700)
    sample_path = {'point': 'audio/hall.mp3', 'tour': 'audio/intro.mp3', 'narrator': 'video/narrator/intro.mp4'}.get(sid)
    sample_file = None
    if sample_path:
        sample_file = work/(sid+'-site'+Path(sample_path).suffix)
        encoded = page.evaluate('''async path=>{
            const r=await fetch(path);if(!r.ok)throw new Error('Media HTTP '+r.status);
            const a=new Uint8Array(await r.arrayBuffer());let s='';
            for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));
            return btoa(s)
        }''', urljoin(base, sample_path))
        sample_file.write_bytes(base64.b64decode(encoded))
    start = time.monotonic()
    def hold(until):
        page.wait_for_timeout(max(0, until - (time.monotonic()-start))*1000)
    def site_sample(locator, media, caption, seconds):
        hold(scene['voice_duration'] + 1.2)
        locator.click()
        if media is None:
            media = page.evaluate_handle('window.__demoAudio[window.__demoAudio.length-1]')
        wait_for_media(media)
        at = time.monotonic()-start
        offset = media.evaluate('m=>m.currentTime')
        assert at > scene['voice_duration'] + .5
        hold(at+seconds)
        media.evaluate('m=>m.pause()')
        scene['site_audio'].append({'at': at, 'duration': seconds, 'offset': offset, 'file': str(sample_file), 'caption': caption})
    if sid == 'map':
        hold(3)
        page.locator('.leaflet-control-zoom-in').click()
        hold(7)
        page.mouse.move(900, 480)
        page.mouse.down()
        page.mouse.move(1090, 560, steps=35)
        page.mouse.up()
        hold(12)
        page.get_by_role('button', name='全区概览', exact=True).click()
    elif sid in ('route', 'stamps', 'about'):
        hold(7)
        if sid == 'about':
            page.locator('#panelBody details').evaluate_all('els=>els.forEach(e=>e.open=true)')
        page.locator('#panel').evaluate('(e)=>e.scrollTo({top:e.scrollHeight/2,behavior:"smooth"})')
        if sid == 'about':
            hold(13)
            page.locator('#panel').evaluate('(e)=>e.scrollTo({top:e.scrollHeight,behavior:"smooth"})')
    elif sid == 'point':
        site_sample(page.locator('#btnListen'), None, '纪念馆讲解（字幕见小崮）', 11)
    elif sid == 'tour':
        site_sample(page.locator('#btnTour'), None, '你好，我是数字讲解员小崮。', 2.9)
    elif sid == 'quiz':
        for question in page.locator('.q').all():
            hold(time.monotonic()-start+1.6)
            text = question.locator('b').inner_text().split('. ', 1)[1]
            answer = page.evaluate('(t)=>GUIDE.quiz.find(q=>q.q===t).a', text)
            question.locator('.opt').nth(answer).click()
        assert '5 / 5' in page.locator('#quizRes').inner_text()
    elif sid == 'terrain':
        hold(5)
        frame.locator('[data-phase="2"]').click()
        hold(12)
        frame.locator('[data-phase="4"]').click()
    elif sid == 'narrator':
        site_sample(frame.locator('#play'), frame.locator('#video'), '你好，我是数字讲解员小崮。', 3.05)
    elif sid == 'panorama':
        hold(5)
        page.mouse.move(1000, 480)
        page.mouse.down()
        page.mouse.move(1250, 500, steps=30)
        page.mouse.up()
        hold(11)
        for _ in range(6):
            frame.locator('#next').click(no_wait_after=True)
        hold(17)
        assert frame.locator('#card-title').inner_text() == '胜利之本'
    elif sid == 'phone':
        hold(4)
        page.locator('#hallShortcut').click()
        page.locator('.cover img').evaluate('im=>im.decode()')
        hold(10)
        page.keyboard.press('Escape')
        page.locator('[data-tab=route]').click()
    hold(scene['duration'])
    elapsed = time.monotonic()-start
    video = page.video
    context.close()
    raw = Path(video.path())
    scene['raw'] = str(raw)
    scene['trim_start'] = max(0, float(probe(raw)['format']['duration'])-elapsed)
    scene['errors'] = errors
    assert not errors, errors
    print(f'PASS record {sid}: fresh live context; {elapsed:.2f}s; page errors: {errors}', flush=True)


def encode(scene, work):
    validate_audio(scene)
    sid = scene['id']
    speed = 1
    if sid not in ('title', 'ending'):
        recorded = float(probe(scene['raw'])['format']['duration'])-scene['trim_start']
        if recorded > scene['duration']+1:
            assert not scene.get('site_audio'), 'Rerecord overlong audio scenes to retain sync'
            speed = scene['duration']/recorded
            if '操作快放' not in scene['heading']:
                scene['heading'] += '（操作快放）'
    ass = work/(sid+'.ass')
    subtitles(scene, ass)
    output = work/(sid+'.mp4')
    command = ['ffmpeg', '-y', '-loglevel', 'error']
    if sid in ('title', 'ending'):
        command += ['-loop', '1', '-i', scene['raw']]
    else:
        command += ['-ss', scene['trim_start'], '-i', scene['raw']]
    command += ['-i', scene['voice']]
    filters = [f'[0:v]setpts={speed}*(PTS-STARTPTS),scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x211512,fps=25,setsar=1,' + f'subtitles={ass}[v]',
               '[1:a]adelay=500:all=1,apad,volume=0.85[a1]']
    for i, audio in enumerate(scene.get('site_audio', []), 2):
        command += ['-i', audio['file']]
        filters.append(f'[{i}:a]atrim=start={audio["offset"]}:duration={audio["duration"]},asetpts=PTS-STARTPTS,afade=t=out:st={audio["duration"]-.12}:d=0.12,adelay={round(audio["at"]*1000)}:all=1,volume=0.85[a{i}]')
    labels = ''.join(f'[a{i}]' for i in range(1, 2+len(scene.get('site_audio', []))))
    filters.append(labels+f'amix=inputs={1+len(scene.get("site_audio", []))}:duration=first:normalize=0[a]')
    command += ['-filter_complex', ';'.join(filters), '-map', '[v]', '-map', '[a]', '-t', scene['duration'], '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-threads', '4', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', output]
    run(command)
    scene['encoded'] = str(output)


def finalize_video(concat, output):
    with tempfile.NamedTemporaryFile(dir=output.parent, prefix=f'.{output.stem}.', suffix='.mp4', delete=False) as temporary:
        pending = Path(temporary.name)
    try:
        run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', '-movflags', '+faststart', pending])
        result = probe(pending)
        video = next(s for s in result['streams'] if s['codec_type']=='video')
        audio = next(s for s in result['streams'] if s['codec_type']=='audio')
        assert 210 <= float(result['format']['duration']) <= 270
        assert (video['width'], video['height'], video['codec_name'], audio['codec_name']) == (1920, 1080, 'h264', 'aac')
        assert pending.stat().st_size <= 1024*1024*1024
        os.replace(pending, output)
        return result
    finally:
        pending.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='https://menglianggu-guide.pages.dev/')
    parser.add_argument('--out-dir', type=Path, default=Path.home()/'contest/deliverables')
    parser.add_argument('--render-only', action='store_true', help='Reuse this URL’s completed recording manifest')
    parser.add_argument('--resume', action='store_true', help='Resume this URL’s partially completed recording')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')+'/'
    if urlparse(base).scheme not in ('http', 'https'):
        parser.error('base-url must be an HTTP(S) URL')
    args.out_dir.mkdir(parents=True, exist_ok=True)
    work = args.out_dir/'cloudflare-video-work'
    work.mkdir(exist_ok=True)
    manifest = work/'manifest.json'
    if args.render_only or args.resume:
        data = json.loads(manifest.read_text())
        assert data['base_url'] == base
    else:
        data = {'base_url': base, 'voice': VOICE, 'scenes': []}
        old = args.out_dir/'video-work/manifest.json'
        cached = json.loads(old.read_text()) if old.exists() else {}
        for sid, heading, duration, text in SCENES:
            voice = work/(sid+'-voice.mp3')
            previous = next((s for s in cached.get('scenes', []) if s['id']==sid and s['text']==text), None)
            if previous and cached.get('voice') == VOICE and Path(previous['voice']).exists():
                voice.write_bytes(Path(previous['voice']).read_bytes())
            else:
                asyncio.run(edge_tts.Communicate(text, VOICE).save(str(voice)))
            vd = float(probe(voice)['format']['duration'])
            assert vd+.5 < duration
            data['scenes'].append(dict(id=sid, heading=heading, duration=duration, text=text, voice=str(voice), voice_duration=vd))
    if not args.render_only:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'])
            for scene in data['scenes']:
                if args.resume and scene.get('raw') and Path(scene['raw']).exists():
                    continue
                if scene['id'] in ('title', 'ending'):
                    path = work/(scene['id']+'.png')
                    card(path, base, scene['id']=='ending')
                    scene['raw'] = str(path)
                else:
                    record(browser, scene, work, base)
                manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2))
            browser.close()
    assert [s['id'] for s in data['scenes']] == [s[0] for s in SCENES], 'Incomplete recording manifest'
    for scene in data['scenes']:
        encode(scene, work)
        manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    concat = work/'concat.txt'
    concat.write_text(''.join(f"file '{s['encoded']}'\n" for s in data['scenes']))
    output = args.out_dir/(NAME+'.mp4')
    result = finalize_video(concat, output)
    video = next(s for s in result['streams'] if s['codec_type']=='video')
    audio = next(s for s in result['streams'] if s['codec_type']=='audio')
    frames = args.out_dir/'video-frames'
    frames.mkdir(exist_ok=True)
    for i, at in enumerate([5, 22, 70, 139, 160, 185, 212, 256, 223, 246], 1):
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', at, '-i', output, '-frames:v', '1', frames/f'frame-{i}.png'])
    (work/'ffprobe.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({'file': str(output), 'duration': result['format']['duration'], 'resolution': [video['width'], video['height']], 'codecs': [video['codec_name'], audio['codec_name']], 'bytes': output.stat().st_size}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
