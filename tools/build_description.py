"""Build the submission DOCX; PDF conversion uses an external office renderer."""
import json
from io import BytesIO
from pathlib import Path

from PIL import Image
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from update_visitor_copy import AI

ROOT = Path(__file__).resolve().parent.parent
OUT = Path.home() / 'contest' / 'deliverables'
OUT.mkdir(parents=True, exist_ok=True)
TITLE = '崮上丰碑——孟良崮战役纪念地数字导览'
FILENAME = f'红色齐鲁-数字创意挑战赛-{TITLE}-山东大学.docx'
URL = 'https://menglianggu-guide.pages.dev/'
RED, GOLD = '8B1A1A', 'B8860B'


def data(path, prefix):
    return json.loads((ROOT / path).read_text().removeprefix(prefix).removesuffix(';\n'))


guide = data('web/content/data.js', 'window.GUIDE = ')
modules = data('web/content/module-credits.js', 'window.GUIDE_MODULE_CREDITS = ')
research = json.loads((ROOT / 'research/research.json').read_text())
try:
    private = json.loads((ROOT / 'tools/team_private.json').read_text())
except FileNotFoundError:
    private = {}
captain = private.get('captain', {})
contact = '｜'.join(captain[key] for key in ['phone', 'email'] if captain.get(key))
doc = Document()
s = doc.sections[0]
s.page_width, s.page_height = Cm(21), Cm(29.7)
s.top_margin = s.bottom_margin = s.left_margin = s.right_margin = Cm(2.2)
s.footer_distance = Cm(1.1)
for name in ['Normal', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'Caption']:
    style = doc.styles[name]
    font = '黑体' if name in ['Title', 'Heading 1', 'Heading 2'] else '宋体'
    style.font.name = font
    style.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), font)
    style.font.size = Pt({'Title': 22, 'Heading 1': 14, 'Heading 2': 11, 'Caption': 9}.get(name, 10.5))
    style.font.color.rgb = RGBColor.from_string(RED if name in ['Title', 'Heading 1', 'Heading 2'] else '282522')
    f = style.paragraph_format
    f.line_spacing = 1.3
    f.space_before, f.space_after = Pt(0), Pt(5)
    f.first_line_indent = Pt(21 if name == 'Normal' else 0)
    f.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY if name == 'Normal' else WD_ALIGN_PARAGRAPH.LEFT
for name in ['Heading 1', 'Heading 2']:
    doc.styles[name].paragraph_format.space_before = Pt(8)
    doc.styles[name].paragraph_format.space_after = Pt(6)
doc.styles['Subtitle'].font.color.rgb = RGBColor.from_string(GOLD)
doc.styles['Subtitle'].font.size = Pt(9)
doc.styles['Subtitle'].font.italic = False
doc.styles['Caption'].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER


def element(parent, tag, **attrs):
    node = OxmlElement('w:' + tag)
    for key, value in attrs.items():
        node.set(qn('w:' + key), str(value))
    parent.append(node)
    return node


def rule(p, color, size=5):
    borders = element(p._p.get_or_add_pPr(), 'pBdr')
    element(borders, 'bottom', val='single', sz=size, space=5, color=color)


def para(text='', style=None):
    return doc.add_paragraph(text, style)


def heading(text):
    p = doc.add_heading(text, 1)
    rule(p, GOLD)


def compact(p, size=10.5, space=3, lines=1.15):
    p.paragraph_format.first_line_indent = Pt(0)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(space)
    p.paragraph_format.line_spacing = lines
    for r in p.runs:
        r.font.size = Pt(size)


def table(headers, rows, widths, size=10.5, labels=False):
    t = doc.add_table(rows=0, cols=len(widths))
    t.autofit = False
    for c, width in zip(t.columns, widths):
        c.width = Cm(width)
    props = t._tbl.tblPr
    borders = element(props, 'tblBorders')
    for edge in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        element(borders, edge, val='single', sz=4, color='D8CBB8')
    for index, values in enumerate(([headers] if headers else []) + rows):
        row = t.add_row()
        element(row._tr.get_or_add_trPr(), 'cantSplit')
        if headers and index == 0:
            element(row._tr.get_or_add_trPr(), 'tblHeader')
        for j, (cell, text, width) in enumerate(zip(row.cells, values, widths)):
            cell.width = Cm(width)
            p = cell.paragraphs[0]
            p.add_run(text)
            compact(p, size)
            if (headers and index == 0) or (labels and j == 0):
                element(cell._tc.get_or_add_tcPr(), 'shd', fill='F3EEE4')
                for r in p.runs:
                    r.bold = True
    return t


def figure_pair(items, height=4.5):
    t = doc.add_table(rows=1, cols=2)
    t.autofit = False
    for c in t.columns:
        c.width = Cm(8.3)
    row = t.rows[0]
    element(row._tr.get_or_add_trPr(), 'cantSplit')
    for cell, (name, caption, crop) in zip(row.cells, items):
        image = Image.open(ROOT / 'docs/images' / name)
        if crop:
            image = image.crop(crop)
        canvas = Image.new('RGB', (1200, round(1200 * height / 7.8)), 'white')
        scale = min(canvas.width / image.width, canvas.height / image.height)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        canvas.paste(image, ((canvas.width-image.width)//2, (canvas.height-image.height)//2))
        stream = BytesIO()
        canvas.save(stream, format='PNG')
        stream.seek(0)
        p = cell.paragraphs[0]
        compact(p, space=0, lines=1)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(stream, width=Cm(7.8), height=Cm(height))
        p = cell.add_paragraph(caption, 'Caption')
        p.paragraph_format.keep_with_next = False
        p.paragraph_format.space_after = Pt(4)
    para('').paragraph_format.space_after = Pt(0)


def hyperlink(p, label, url):
    rel = p.part.relate_to(url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    h = OxmlElement('w:hyperlink')
    h.set(qn('r:id'), rel)
    r = element(h, 'r')
    props = element(r, 'rPr')
    element(props, 'rFonts', ascii='宋体', eastAsia='宋体', hAnsi='宋体')
    element(props, 'sz', val=16)
    element(props, 'color', val='684D21')
    element(r, 't').text = label
    p._p.append(h)


footer = s.footer.paragraphs[0]
compact(footer, 9)
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
footer.add_run('崮上丰碑·作品说明书　第 ')
element(footer._p, 'fldSimple', instr='PAGE')
footer.add_run(' 页 共 ')
element(footer._p, 'fldSimple', instr='NUMPAGES')
footer.add_run(' 页')

p = para('崮上丰碑', 'Title')
rule(p, RED, 18)
p = para('孟良崮战役纪念地数字导览', 'Heading 2')
p.paragraph_format.space_before = Pt(4)
para('红色齐鲁·数字创意挑战赛｜学生组｜任务一 红色数字地图导览', 'Subtitle')
table(None, [
    ['作品名称', TITLE],
    ['参赛单位', '山东大学 低空科学与工程学院'],
    ['队长', '魏冰洋｜2024级计算机科学与技术专业研究生' + ('\n' + contact if contact else '')],
    ['团队成员', '隋源｜2025级电子科学与技术专业本科生\n迟庆宇｜2024级机器人工程专业本科生'],
    ['指导教师', '于瑞璇｜助理研究员'],
    ['在线访问', URL],
], [2.4, 14.2], labels=True)
heading('一、选题价值与作品概述')
para('以山东临沂蒙阴县孟良崮战役纪念馆及山上纪念地为载体，面向青少年研学，将真实地图、原创讲解、三维地形、场景漫游与学习反馈串联为“看地图—听讲解—游场景—走路线—集印章—答问题”的闭环。红金视觉庄重克制，服务课前预习、现场参观与课后复习，实现线上可游、线下可感、虚实结合。')
para('孟良崮战役发生于1947年5月13日至16日，华东野战军在陈毅、粟裕指挥下歼灭国民党军整编第74师等部，是粉碎敌军重点进攻山东的重要战役。作品优先采用政府、党史与档案资料；景区“华野战地指挥所”为标识点，不将其认定为战役总部。')
figure_pair([('map.png', '图1　地图总览与三大模块门户', None), ('phone-map.png', '图2　手机端响应式导览', None)], 5.8)

doc.add_page_break()
heading('二、功能设计与评分对应')
table(['功能模块', '实现内容', '对应评分项'], [
    ['地图与图文', '8个点位；实景照片、游客文案、史实要点及来源；馆区与山上点群入口分离。', '内容准确性\n地图交互'],
    ['语音与字幕', '8段约52—59秒点位讲解及开场、结语；SVG小崮口型、播放控制与同步字幕。', '数字人讲解\n视听体验'],
    ['路线与打卡', '接驳与步行分段；授权定位300米内打卡，远程听完讲解获章；进度本机保存。', '线上线下融合\n互动设计'],
    ['问答与证书', '12题每轮抽5题，60%获问答章；集齐8点章并通过问答生成PNG证书。', '研学教育\n参与反馈'],
    ['三维与视频', '3D地形沙盘、AI视频讲述、360°场景漫游；门户返回与焦点恢复。', '创新表达\n沉浸体验'],
    ['适配与韧性', '桌面／手机适配，键盘与缩放支持；离线缓存、媒体回退及存储异常处理。', '技术实现\n易用性'],
], [2.6, 10.5, 3.5])
heading('三、游览流程与安全边界')
para('访问公网链接，点击编号或“山下纪念馆”查看照片和讲解。路线灰色细点线为乘车／景区交通，红色虚线为山上步行；山上约1.89公里、63—90分钟为估算，非实测步道路网或逐向导航，接驳不虚构用时。以现场开放公告、标识与安全管制为准。')
figure_pair([('point.png', '图3　点位实景照片与讲解入口', (840, 92, 1240, 552)), ('route.png', '图4　乘车接驳与步行分段', (40, 92, 480, 650))], 6.4)
para('非现场可完整听完点位讲解集章。浏览器保存本机进度，不上传账号数据；清除数据会丢失记录。研学证书仅为学习体验凭证，不是官方认证。')

doc.add_page_break()
heading('四、沉浸模块与创新表达')
doc.add_heading('从地理到历史：地形沙盘 × 场景漫游', 2)
para('地形沙盘以SRTM衍生现代高程呈现山地，支持旋转缩放、战役阶段切换与原比例查看；默认纵向增强3.6倍。部队、箭线及动画为教学示意，不代表精确阵位、行军轨迹或兵力比例，也不是1947年地表复原。全景场景用程序化模型参考实景照片，结合公开材质呈现纪念碑周边，支持360°转动视角和7个热点；并非360°实拍或测绘级复原。')
figure_pair([('terrain.png', '图5　3D地形沙盘与阶段态势', None), ('panorama.png', '图6　场景漫游“胜利之本”宽景', None)], 5)
doc.add_heading('从聆听到参与：数字讲述 × 学习反馈', 2)
para('AI视频讲述以虚构成年讲解员提供10段视频，支持字幕、章节切换、暂停继续及音频回退；保留原创SVG小崮音频导览。点位讲述完成可集章，再以问答巩固理解、证书记录体验。空间观察与人物叙事互补，现场与远程学习并行；实景、现代数据和艺术示意边界清楚，关于页集中保留出处及AI说明。')
figure_pair([('narrator.png', '图7　AI视频讲述与同步字幕', None), ('certificate.png', '图8　研学证书示例（非官方认证）', None)], 5)
para('截图来自公开在线作品；证书使用隔离浏览器中的演示进度生成，不代表实地到访。门户支持返回与Escape，退出后恢复原入口焦点。')

doc.add_page_break()
heading('五、技术实现与体验保障')
para('作品为HTML/CSS/原生JavaScript静态H5，Cloudflare Pages托管。Leaflet负责地图，Three.js负责三维；OSM坐标以WGS84记录，显示高德瓦片前转为GCJ-02。Audio／Video与字幕时间轴同步，WebAudio音量驱动SVG口型，localStorage保存进度，Canvas导出证书。')
para('Service Worker缓存图文、音频、字幕和约11.95MB视频，总预缓存约19.8MB；高德瓦片不缓存，外链仍需联网。界面使用系统字体，证书按需加载约19.6KB字体子集。保留缩放、语义按钮、对话框焦点循环、Escape、字幕提示及减少动画；播放失败可重试／回退。尚未验证所有真机与读屏组合。')
heading('六、AI使用声明')
box = table(None, [['本作品使用AI辅助资料整理、代码编写及功能调试。' + AI]], [16.6])
cell = box.cell(0, 0)
element(cell._tc.get_or_add_tcPr(), 'shd', fill='F8F3E9')
for key in ['narrator', 'terrain', 'panorama']:
    text = ' '.join(modules[key]['notes']).replace('本网站��分发模型权重', '本网站不分发模型权重')
    if key == 'terrain':
        text = ' '.join(modules[key]['notes'][:3])
    p = cell.add_paragraph()
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.line_spacing = 1.3
    p.add_run(modules[key]['title'] + '：').bold = True
    p.add_run(text)

doc.add_page_break()
heading('七、来源、素材与许可附录')
para('完整清单见在线作品“关于”页。以下短标签可点击原始链接；照片不用于反推史实，来源资料不替代馆方审定。')
credits = table(['类别', '来源、作者与许可（短标签链接）'], [[c, ''] for c in ['史料', '点位照片', '模块素材', 'AI模型与工具', '地图与数据']], [2.3, 14.3], size=8, labels=True)
groups = {name: credits.rows[i+1].cells[1] for i, name in enumerate(['史料', '点位照片', '模块素材', 'AI模型与工具', '地图与数据'])}


def credit(category, label, url=None):
    cell = groups[category]
    p = cell.paragraphs[0]
    if p.text or p._p.findall(qn('w:hyperlink')):
        p.add_run('；').font.size = Pt(8)
    compact(p, 8, 2, 1.15)
    if url:
        hyperlink(p, label, url)
    else:
        p.add_run(label).font.size = Pt(8)


for key in ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S10']:
    src = research['sources'][key]
    credit('史料', src['publisher'] + '｜' + src['title'], src['url'])
credit('点位照片', '8张均为Sprt98，CC BY-SA 4.0；等比缩小、JPEG压缩、容器裁切；改作遵循相同许可。')
for point in guide['points']:
    credit('点位照片', str(point['no']) + ' ' + point['name'], point['imageCredit']['source'])
credit('点位照片', 'CC BY-SA 4.0许可', 'https://creativecommons.org/licenses/by-sa/4.0/')
for c in modules['panorama']['media']:
    credit('模块素材', c['title'] + '｜' + c['author'] + '｜' + c['license'] + '；' + c['changes'], c['url'])
for url in sorted({c['licenseUrl'] for c in modules['panorama']['media']}):
    credit('模块素材', '素材许可全文', url)
for src in modules['narrator']['sources']:
    credit('AI模型与工具', src['title'], src['url'])
credit('AI模型与工具', '肖像由RealVisXL生成；SadTalker口型、GFPGAN修复，480×600 H.264/AAC；虚构人物，非历史影像。预训练组件遵守各自上游条款，许可摘要不等于完整授权审计。')
for src in modules['terrain']['sources']:
    credit('地图与数据', src['title'], src['url'])
credit('地图与数据', 'SRTM data courtesy of USGS；Terrain Tiles by Mapzen/Tilezen。WGS84/EGM96，裁切重采样257×257；非历史地表。', modules['terrain']['media'][0]['url'])
credit('地图与数据', 'OSM contributors（ODbL）', 'https://www.openstreetmap.org/copyright')
credit('地图与数据', '高德地图：保留底图署名与使用条款；Leaflet BSD-2-Clause；Three.js MIT；Noto Sans CJK子集 SIL OFL。')
para('讲解为原创表述，界面、SVG与代码含AI辅助；不主张第三方史料、地图、素材或模型著作权。团队应在提交展示前复核授权及服务条款。')
doc.save(OUT / FILENAME)
print(OUT / FILENAME)
