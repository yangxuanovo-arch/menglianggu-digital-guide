"""Record real-time UI footage, then mux the app's actual narration event timeline."""
import argparse
import json
from pathlib import Path
import subprocess
import time

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
TITLE = '崮上丰碑——孟良崮战役纪念地数字导览'
URL = 'https://yangxuanovo-arch.github.io/menglianggu-digital-guide/'
NAME = f'红色齐鲁-数字创意挑战赛-{TITLE}-【学校名称】'
FONT = ROOT / 'web/vendor/fonts/NotoSansCJKsc-Regular.otf'
LOG_AUDIO = """window.__events=[];const NativeAudio=window.Audio;
window.Audio=function(...args){const a=new NativeAudio(...args);window.__audio=a;
['playing','pause','ended','seeking'].forEach(type=>a.addEventListener(type,()=>
__events.push({type,wall:Date.now()/1000,offset:a.currentTime,src:a.src.split('/').pop()})));
return a};window.Audio.prototype=NativeAudio.prototype;"""


def probe(path):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]))


def run(args):
    subprocess.run([str(x) for x in args], check=True)


def mux(manifest, output):
    data = json.loads(manifest.read_text())
    work = manifest.parent
    desktop, mobile = [Path(data[k]['video']) for k in ['desktop', 'mobile']]
    dd, md = [float(probe(p)['format']['duration']) for p in [desktop, mobile]]
    total = dd + md + 5
    lines = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1280', 'PlayResY: 720', '[V4+ Styles]',
             'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
             'Style: Default,Noto Sans CJK SC,23,&H00FFFFFF,&H00FFFFFF,&H90000000,&H90000000,0,0,0,0,100,100,0,0,3,8,0,8,20,20,55,1',
             '[Events]', 'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text']
    def clock(t):
        return f'{int(t//3600)}:{int(t//60)%60:02}:{t%60:05.2f}'
    marks = data['marks'] + [[dd, '手机适配：390×844真实页面，等比居中显示'], [dd + md, 'AI使用声明：资料与代码有AI辅助；讲解为TTS；提交前须人工核对']]
    for i, (start, text) in enumerate(marks):
        end = marks[i+1][0] if i+1 < len(marks) else total
        lines.append(f'Dialogue: 0,{clock(start)},{clock(end)},Default,,0,0,0,,{text}')
    captions = work / 'sections.ass'
    captions.write_text('\n'.join(lines))
    silent = work / 'silent.mp4'
    filters = (f'[0:v]setpts=PTS-STARTPTS,fps=25,setsar=1[d];'
               f'[1:v]setpts=PTS-STARTPTS,scale=-2:720,pad=1280:720:(ow-iw)/2:0:color=0x211b18,fps=25,setsar=1[m];'
               f'[2:v]fps=25,setsar=1[e];[d][m][e]concat=n=3:v=1:a=0,'
               f'subtitles={captions}:fontsdir={FONT.parent}[v]')
    run(['ffmpeg', '-y', '-loglevel', 'warning', '-i', desktop, '-i', mobile, '-loop', '1', '-t', '5', '-i', work/'closing.png',
         '-filter_complex', filters, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-threads', '4', silent])
    segments = []
    for key, base in [('desktop', 0), ('mobile', dd)]:
        active = None
        info = data[key]
        for ev in info['events']:
            t = max(0, ev['wall'] - info['epoch']) + base
            if ev['type'] == 'playing':
                active = (t, ev['offset'], ev['src'])
            elif active:
                start, offset, src = active
                if t-start > .1:
                    segments.append({'at': start, 'offset': offset, 'duration': t-start, 'src': src})
                active = None
    assert segments, 'No actual narration events captured'
    command = ['ffmpeg', '-y', '-loglevel', 'warning', '-i', silent, '-f', 'lavfi', '-t', str(total), '-i', 'anullsrc=r=48000:cl=stereo']
    af = []
    for i, seg in enumerate(segments, 2):
        command += ['-i', ROOT/'web/audio'/seg['src']]
        af.append(f'[{i}:a]atrim=start={seg["offset"]}:duration={seg["duration"]},asetpts=PTS-STARTPTS,adelay={round(seg["at"]*1000)}:all=1[a{i}]')
    af.append('[1:a]' + ''.join(f'[a{i}]' for i in range(2, 2+len(segments))) + f'amix=inputs={1+len(segments)}:duration=first:normalize=0[a]')
    command += ['-filter_complex', ';'.join(af), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', str(total), '-movflags', '+faststart', output]
    run(command)
    data['audio_segments'] = segments
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    result = probe(output)
    assert 180 <= float(result['format']['duration']) <= 300
    assert output.stat().st_size <= 1024*1024*1024
    assert any(s['codec_type']=='audio' for s in result['streams'])
    assert any(s['codec_type']=='video' and s['width']>=1280 and s['height']>=720 for s in result['streams'])
    (work/'ffprobe.json').write_text(json.dumps(result, indent=2))
    frames = output.parent/'video-frames'
    frames.mkdir(exist_ok=True)
    for i, t in enumerate([2, 30, 70, 130, dd-17, dd+10], 1):
        run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(t), '-i', output, '-frames:v', '1', frames/f'frame-{i}.png'])
    print(json.dumps({'file': str(output), 'duration': result['format']['duration'], 'size': result['format']['size'], 'streams': [{k:s.get(k) for k in ['codec_type','codec_name','width','height','sample_rate']} for s in result['streams']], 'audio_segments': len(segments)}, ensure_ascii=False, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out-dir', type=Path, default=Path.home()/'contest/deliverables')
    parser.add_argument('--base-url', default='http://localhost:8080')
    parser.add_argument('--mux-only', action='store_true')
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    work = args.out_dir/'demo-work'
    work.mkdir(exist_ok=True)
    manifest = work/'timeline.json'
    if args.mux_only:
        mux(manifest, args.out_dir/(NAME+'.mp4'))
        return
    image = Image.new('RGB', (1280,720), '#f9f3e8')
    draw = ImageDraw.Draw(image)
    for y, text, size in [(210,'赓续沂蒙精神 · 传承红色基因',42),(310,'感谢观看｜学生组｜【学校名称】',30),(400,URL,23),(505,'当前为界面改版前的演示草稿 DRAFT',26)]:
        draw.text((640,y),text,font=ImageFont.truetype(str(FONT),size),fill='#a32622',anchor='mm')
    image.save(work/'closing.png')
    data = {'status':'DRAFT / provisional UI', 'url':URL, 'marks':[]}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        def start(key, size):
            context = browser.new_context(viewport=size, record_video_dir=work/key, record_video_size=size)
            context.add_init_script(LOG_AUDIO)
            epoch = time.time()
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            data[key] = {'epoch':epoch,'errors':errors}
            return context,page
        context,page = start('desktop', {'width':1280,'height':720})
        def mark(text):
            t=time.time()-data['desktop']['epoch'];data['marks'].append([t,text]);print(f'{t:.2f}s {text}',flush=True)
        def hold(seconds):
            page.wait_for_timeout(seconds*1000)
        def tab(name):
            page.locator(f'[data-tab="{name}"]').click()
        def stop():
            if page.locator('#guide:not(.hidden)').count(): page.locator('#gStop').click()
        mark('界面改版前演示草稿 DRAFT｜真实页面、原速操作')
        page.goto(args.base_url,wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.evaluate('''([title,url])=>{let d=document.createElement('div');d.id='demoTitle';d.style='position:fixed;inset:0;z-index:99999;background:#faf5eb;color:#a32622;display:flex;align-items:center;justify-content:center;text-align:center;font:30px GuideCJK,sans-serif';d.innerHTML='<div><h2>'+title+'</h2><p>红色齐鲁 · 学生组 · 【学校名称】</p><p style="font-size:23px">'+url+'</p><p>演示草稿 DRAFT · 实际界面录制</p></div>';document.body.appendChild(d)}''',[TITLE,URL])
        hold(5);page.locator('#demoTitle').evaluate('(e)=>e.remove()')
        mark('欢迎页：庄重叙事与使用说明');hold(5);page.locator('#introStart').click()
        mark('功能一：真实底图缩放、平移与卫星图切换')
        page.locator('.leaflet-control-zoom-in').click();hold(2)
        page.mouse.move(500,350);page.mouse.down();page.mouse.move(600,400,steps=25);page.mouse.up();hold(2)
        page.locator('.leaflet-control-layers').hover();page.get_by_text('卫星影像',exact=True).click();hold(3)
        page.locator('.leaflet-control-layers').hover();page.get_by_text('标准地图',exact=True).click()
        page.get_by_role('button',name='全区概览',exact=True).click();hold(3)
        mark('功能二：纪念馆详情与非现场打卡入口（听完讲解获章）')
        page.locator('.leaflet-marker-icon[title="孟良崮战役纪念馆"]').click();page.locator('#btnRemote').click();hold(20)
        page.locator('#sheet').evaluate('(e)=>e.scrollTo({top:420,behavior:"smooth"})');hold(4);stop();page.locator('#sheetClose').click()
        for identifier, title in [('trench','华野战壕'),('shell-rock','炮轰石')]:
            mark('点位讲解：'+title+'｜数字人口型与同步字幕')
            page.evaluate('(id)=>__guide.openPoint(id)',identifier);page.locator('#btnListen').click();hold(16);stop();page.locator('#sheetClose').click()
        mark('功能三：推荐路线、交通接驳与估算时长');tab('route');hold(7)
        mark('自动导览：完整欢迎讲解 → 纪念馆 → 山上点位（原速）')
        page.locator('#btnTour').click()
        page.wait_for_function("__audio.src.endsWith('/field-command.mp3') && !__audio.paused",timeout=115000)
        hold(6);stop();page.locator('#sheetClose').click()
        assert page.evaluate("!!JSON.parse(localStorage.getItem('mlg_stamps_v1')).hall")
        mark('区位交通：县城在纪念地西北｜馆区与山上分区')
        page.locator('#btnLocate').click();hold(4);page.locator('#panelClose').click();hold(1)
        page.locator('.city').filter(has_text='蒙阴县城').click();hold(4)
        mark('学习反馈：纪念馆已听完获章；演示补齐其余进度以展示证书')
        tab('stamps');hold(3)
        page.evaluate("localStorage.setItem('mlg_stamps_v1',JSON.stringify(Object.fromEntries(GUIDE.points.map(p=>[p.id,Date.now()]))))")
        data['desktop']['events']=page.evaluate('__events')
        page.reload(wait_until='networkidle');page.locator('#introStart').click();tab('quiz')
        for question in page.locator('.q').all():
            text=question.locator('b').inner_text().split('. ',1)[1]
            answer=page.evaluate('(text)=>GUIDE.quiz.find(q=>q.q===text).a',text)
            question.locator('.opt').nth(answer).click();hold(.6)
        assert '5 / 5' in page.locator('#quizRes').inner_text();hold(2)
        page.locator('#qStamp').click();page.locator('#certName').fill('研学体验者');page.locator('#btnCert').click();page.locator('canvas.cert').wait_for();page.locator('canvas.cert').scroll_into_view_if_needed();hold(4)
        mark('资料来源与AI声明：来源可追溯，提交前须团队人工核对')
        tab('about');hold(3);page.locator('#panel').evaluate('(e)=>e.scrollTo({top:e.scrollHeight,behavior:"smooth"})');hold(7)
        data['desktop']['events'] += page.evaluate('__events')
        video=page.video;context.close();data['desktop']['video']=str(Path(video.path()).resolve())
        context,page = start('mobile', {'width':390,'height':844})
        page.goto(args.base_url,wait_until='networkidle');page.evaluate('document.fonts.ready');hold(3);page.locator('#introStart').click();hold(3)
        page.evaluate("__guide.openPoint('hall')");page.locator('#btnListen').click();hold(9);stop();page.locator('#sheetClose').click();tab('route');hold(5)
        data['mobile']['events']=page.evaluate('__events');video=page.video;context.close();data['mobile']['video']=str(Path(video.path()).resolve())
        browser.close()
    assert not data['desktop']['errors'] and not data['mobile']['errors'],data
    manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2))
    mux(manifest,args.out_dir/(NAME+'.mp4'))


if __name__ == '__main__':
    main()
