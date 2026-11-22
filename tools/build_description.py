"""Build a five-page description using live screenshots and shared credit data."""
import json
from io import BytesIO
from pathlib import Path

from PIL import Image
from docx import Document
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from update_visitor_copy import AI

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs'
TITLE = '崮上丰碑——孟良崮战役纪念地数字导览'
FILENAME = f'红色齐鲁-数字创意挑战赛-{TITLE}-【学校名称】.docx'
URL = 'https://yangxuanovo-arch.github.io/menglianggu-digital-guide/'


def data(path, prefix):
    return json.loads((ROOT / path).read_text().removeprefix(prefix).removesuffix(';\n'))


guide = data('web/content/data.js', 'window.GUIDE = ')
modules = data('web/content/module-credits.js', 'window.GUIDE_MODULE_CREDITS = ')
research = json.loads((ROOT / 'research/research.json').read_text())
doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Cm(21), Cm(29.7)
section.top_margin = section.bottom_margin = Cm(1.4)
section.left_margin = section.right_margin = Cm(1.6)
for name in ['Normal', 'Heading 1', 'Heading 2', 'Title', 'Caption']:
    s = doc.styles[name]
    font = '黑体' if name in ['Heading 1', 'Heading 2', 'Title'] else '宋体'
    s.font.name = font
    s.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), font)
    s.font.size = Pt({'Title': 18, 'Heading 1': 12, 'Heading 2': 10, 'Caption': 9}.get(name, 10))
    s.font.color.rgb = RGBColor.from_string('962821' if name in ['Title', 'Heading 1'] else '2B211D')
    s.paragraph_format.space_after = Pt(4)
    s.paragraph_format.space_before = Pt(0)
    s.paragraph_format.line_spacing = 1.05
footer = section.footer.paragraphs[0]
footer.alignment = 1
footer.add_run('崮上丰碑 · 作品说明书  |  ')
field = OxmlElement('w:fldSimple')
field.set(qn('w:instr'), 'PAGE')
footer._p.append(field)


def para(text, style=None):
    return doc.add_paragraph(text, style)


def heading(text):
    doc.add_heading(text, 1)


def picture(name, caption, width=17):
    p = para('')
    p.alignment = 1
    p.add_run().add_picture(str(OUT / 'images' / name), width=Cm(width))
    p = para(caption, 'Caption')
    p.alignment = 1


def pair(left, right, caption, width=8.4, details=False):
    table = doc.add_table(rows=1, cols=2)
    for cell, name in zip(table.rows[0].cells, [left, right]):
        p = cell.paragraphs[0]
        p.alignment = 1
        source = str(OUT / 'images' / name)
        if details:
            bounds = {'point.png': (840, 92, 1240, 552),
                      'route.png': (40, 92, 480, 650),
                      'stamps.png': (40, 92, 480, 570),
                      'quiz.png': (40, 92, 480, 570)}
            source = BytesIO()
            with Image.open(OUT / 'images' / name) as image:
                image.crop(bounds[name]).save(source, format='PNG')
            source.seek(0)
        p.add_run().add_picture(source, width=Cm(width))
    para(caption, 'Caption')


def link(p, label, url):
    rel = p.part.relate_to(url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    h = OxmlElement('w:hyperlink')
    h.set(qn('r:id'), rel)
    r = OxmlElement('w:r')
    props = OxmlElement('w:rPr')
    size = OxmlElement('w:sz')
    size.set(qn('w:val'), '15')
    props.append(size)
    r.append(props)
    t = OxmlElement('w:t')
    t.text = label
    r.append(t)
    h.append(r)
    p._p.append(h)


doc.add_heading(TITLE, 0)
para('红色齐鲁·数字创意挑战赛｜任务一·红色数字地图导览｜学生组')
para('参赛单位：【学校名称】　团队：【团队名称】\n团队成员：【成员】　指导教师：【指导教师】\n联系人：【姓名】　联系方式：【电话／邮箱】')
para('在线作品：' + URL)
heading('一、作品概述与选题依据')
para('作品面向青少年研学，以山东临沂蒙阴县孟良崮战役纪念馆及山上纪念地为载体，串联“看地图—听讲解—游场景—走路线—集印章—答问题”。红金界面庄重克制，将真实地理、史料叙事与交互学习结合，服务课前预习、现场参观与课后复习，实现线上可游、线下可感、虚实结合。')
para('孟良崮战役发生于1947年5月13日至16日，华东野战军在陈毅、粟裕指挥下歼灭国民党军整编第74师等部，是粉碎敌军重点进攻山东的重要战役。内容优先采用政府、党史与档案资料，来源见附录。景区“华野战地指挥所”为标识点，不认定为战役总部；开放、票务与山路情况以现场公告为准。')
picture('map.png', '图1　公网地图：山上编号点群、山下纪念馆入口及三大模块门户。', 16.8)
heading('二、使用入口')
para('浏览器访问上述Pages链接即可使用，无需登录。点击编号或纪念馆入口查看照片与讲解；底栏进入路线、集章、问答和关于；三个门户进入地形沙盘、AI数字讲述与全景场景，使用“返回”或Escape回到导览。建议首次联网完整载入后再离线体验。')

doc.add_page_break()
heading('三、核心功能与参观流程')
para('①八点图文：纪念馆、华野战地指挥所标识点、华野战壕、铁索桥、炮轰石、弹击石、张灵甫战死处标识点、山顶纪念碑。每点有原创游客文案、事实要点、实景照片和来源。②音频导览：8段约52—59秒点位讲解，另有开场、结语；同步字幕及暂停、停止、顺序导览与逐点视频入口。')
pair('point.png', 'route.png', '图2—3　桌面截图局部：点位照片与讲解入口；乘车接驳和步行分段。', 7.3, details=True)
para('③推荐路线：灰色细点线为山下至山上“乘车／景区交通”，不虚构用时；红色虚线为山上步行。山上约1.89公里、63—90分钟为端点距离×1.6等估算，非实测步道路网或逐向导航；以现场安全指引为准。④集章：授权定位后，点位300米内可打卡；非现场听完本点讲解获章。⑤问答：12题随机抽5题，达到60%获问答章；集齐8点章并通过问答，可生成PNG研学证书，非官方认证。')
pair('stamps.png', 'quiz.png', '图4—5　桌面截图局部：研学集章与问答，进度仅保存在本机。', 7.3, details=True)
para('支持问答中途恢复；清除浏览器数据会丢失进度，存储异常不阻止使用并给予提示。音视频需用户点击后播放；失败时提供重试、静态肖像／音频回退及讲解全文。')

doc.add_page_break()
heading('四、三大沉浸模块与创新')
para('3D地形沙盘：用SRTM衍生现代高程构建可旋转缩放地形，分阶段展示战役态势，辅助理解山地作战与协同。默认纵向增强3.6倍，可切换原比例；非1947年地表复原，部队、箭线和中间动画仅为教学示意，不是精确阵位、轨迹或兵力比例。')
picture('terrain.png', '图6　从地图门户打开3D地形沙盘，结合阶段切换理解地形与部署。', 12.8)
para('AI视频讲述：虚构成年讲解员提供10段视频与同步字幕，支持逐章、暂停／继续及音频回退。原SVG“小崮”音频导览保留；完成点位讲述可集章，含独立页面回退。360°全景场景：程序化三维模型参考实景照片，结合公开材质重现纪念碑周边，可自由转动视角及切换热点；并非360°实拍或测绘级复原。')
pair('narrator.png', 'panorama.png', '图7—8　AI数字讲述；全景场景热点6“胜利之本”宽景。')
para('创新：以地理位置、地形态势、场景观察和人物讲述互补组织内容，而非单一展示；以“讲解—集章—问答—证书”形成学习闭环；兼顾现场定位与远程学习；明确区分实景照片、现代高程和艺术示意，关于页集中提供可追溯来源及AI说明。')

doc.add_page_break()
heading('五、技术、适配与体验保障')
para('HTML/CSS/原生JavaScript静态H5，GitHub Pages托管；Leaflet负责地图，Three.js负责三维。坐标参考OSM的WGS84数据，高德瓦片显示前转换为GCJ-02。相对路径适配Pages子目录，Service Worker缓存应用、图文、字幕、音频及约11.95MB视频，总预缓存约19.8MB；高德瓦片不缓存，外链仍需联网，不宣称地图完全离线。')
para('Audio／Video同步字幕，WebAudio音量驱动SVG口型；localStorage保存进度；Canvas导出证书。界面采用系统中文字体，证书按需加载约19.6KB子集字体并提供回退。保留页面缩放、语义按钮、焦点循环／返回、Escape及字幕提示，支持减少动画。手机为响应式布局，尚未验证所有真机浏览器与读屏组合。')
pair('phone-map.png', 'phone-point.png', '图9—10　375×667手机公网截图：地图与点位详情。', 3.2)
heading('六、完整AI使用声明')
para('本作品使用AI辅助资料整理、代码编写及功能调试。' + AI)
for key in ['narrator', 'terrain', 'panorama']:
    text = ' '.join(modules[key]['notes'])
    text = text.replace('本网站��分发模型权重', '本网站不分发模型权重')
    para(modules[key]['title'] + '：' + text)

appendix = doc.add_section(WD_SECTION.NEW_PAGE)
columns = appendix._sectPr.find(qn('w:cols'))
columns.set(qn('w:num'), '2')
columns.set(qn('w:space'), '320')
start = len(doc.paragraphs)
heading('附录：来源、署名与许可')
para('短标签为可点击原始链接；完整清单见作品“关于”页（在线作品同首页）。照片不用于反推史实；资料不替代馆方审定。')
for i, key in enumerate(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S10', 'M0'], 1):
    s = research['sources'][key]
    link(para(''), f'[{i}] {s["publisher"]}：{s["title"]}', s['url'])
doc.add_heading('点位实景照片', 2)
para('8张作者均为Sprt98，CC BY-SA 4.0；本站等比缩小、JPEG压缩，容器可裁切；改作遵循相同许可。')
for point in guide['points']:
    c = point['imageCredit']
    link(para(''), f'{point["no"]}. {point["name"]}｜{c["author"]}｜{c["license"]}', c['source'])
link(para(''), 'CC BY-SA 4.0 许可全文', 'https://creativecommons.org/licenses/by-sa/4.0/')
for module in modules.values():
    doc.add_heading(module['title'] + '：来源与素材', 2)
    for s in module['sources']:
        link(para(''), s['title'], s['url'])
    for c in module['media']:
        p = para('')
        link(p, f'{c["title"]}｜{c["author"]}｜{c["license"]}', c['url'])
        p.add_run('；' + c['changes'])
    for url in sorted({c['licenseUrl'] for c in module['media']}):
        link(para(''), '本模块素材许可／署名条款', url)
para('地形：SRTM data courtesy of the U.S. Geological Survey；Terrain Tiles by Mapzen/Tilezen。WGS84/EGM96，重采样257×257，非历史地表。')
heading('版权、证书与团队确认')
para('讲解为原创表述，界面、SVG与交互含AI辅助；截图取自公网作品。高德保留署名与条款，OSM为ODbL，Leaflet为BSD-2-Clause，Three.js为MIT，Noto Sans CJK子集为SIL OFL。不主张第三方素材、史料、模型著作权；模型许可摘要不等于完整预训练资产授权审计。展示前须复核服务条款、授权和成员信息。')
picture('certificate.png', '图11　研学证书示例；演示进度生成，非官方认证。', 6.5)
para('团队负责人：【签名】　日期：【年／月／日】')
for p in doc.paragraphs[start:]:
    p.paragraph_format.line_spacing = 1
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = False
    for run in p.runs:
        run.font.size = Pt(7.5)
doc.save(OUT / FILENAME)
print(OUT / FILENAME)
