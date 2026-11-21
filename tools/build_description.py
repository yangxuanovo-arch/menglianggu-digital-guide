import json
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs'
TITLE = '崮上丰碑——孟良崮战役纪念地数字导览'
FILENAME = f'红色齐鲁-数字创意挑战赛-{TITLE}-【学校名称】.docx'
research = json.loads((ROOT / 'research/research.json').read_text())
doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Cm(21), Cm(29.7)
section.top_margin = section.bottom_margin = Cm(1.8)
section.left_margin = section.right_margin = Cm(1.9)
for style_name in ['Normal', 'Heading 1', 'Heading 2', 'Title', 'Caption']:
    style = doc.styles[style_name]
    font = '黑体' if style_name in ['Heading 1', 'Heading 2', 'Title'] else '宋体'
    style.font.name = font
    style.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), font)
    style.font.size = Pt(10.5 if style_name == 'Normal' else 13)
    style.font.color.rgb = RGBColor.from_string('2B211D')
    style.paragraph_format.space_after = Pt(5)
    style.paragraph_format.line_spacing = 1.12
doc.styles['Title'].font.size = Pt(19)
doc.styles['Heading 1'].font.color.rgb = RGBColor.from_string('A11E1E')
footer = section.footer.paragraphs[0]
footer.alignment = 1
footer.add_run('崮上丰碑 · 作品说明书   |   ')
field = OxmlElement('w:fldSimple')
field.set(qn('w:instr'), 'PAGE')
footer._p.append(field)


def para(text, style=None):
    return doc.add_paragraph(text, style)


def heading(text):
    doc.add_heading(text, 1)


def picture(name, caption, width=16.5):
    p = doc.add_paragraph()
    p.alignment = 1
    p.add_run().add_picture(str(OUT / 'images' / name), width=Cm(width))
    p = para(caption, 'Caption')
    p.alignment = 1


doc.add_heading(TITLE, 0)
para('红色齐鲁·数字创意挑战赛｜任务一·红色数字地图导览｜学生组')
para('参赛单位：【学校名称】   团队名称：【团队名称】\n团队成员：【成员1】【成员2】【成员3】   指导老师：【指导老师】\n联系人：【姓名】   联系方式：【电话／邮箱】')
para('在线链接：https://yangxuanovo-arch.github.io/menglianggu-digital-guide/')
heading('一、作品概述与选题意义')
para('作品面向青少年研学，以临沂市蒙阴县孟良崮战役纪念馆及山上纪念地为载体，将真实地图、原创讲解、数字人和学习反馈串联为“看地图—听讲解—走路线—集印章—答问题”的学习闭环。以庄重克制的视觉表达缅怀英烈，引导理解军民团结、沂蒙精神与革命传统，实现线上可游、线下可感、虚实结合。')
heading('二、红色场馆与史实依据')
para('孟良崮战役发生于1947年5月13日至16日，华东野战军在陈毅、粟裕指挥下作战，歼灭国民党军整编第74师等部，粉碎敌军重点进攻山东的重要部署。[5][6] 纪念馆位于蒙阴县垛庄镇一带，是开展革命传统教育的重要场所。[1][2]')
para('历史事实优先采用政府、党史与档案资料；地图点位参考OSM。园区中心不是馆门，山上“华野战地指挥所”仅确认标识存在，不认定为战役总部；纪念碑高度、建成年份等冲突说法不采用。开放、票务和山路情况以现场最新公告为准。')
picture('map.png', '图1  山上点群默认视图：编号标记清晰，可切换“全区概览”。')

doc.add_page_break()
heading('三、功能设计')
for text in [
    '地图底图与缩放：Leaflet交互地图支持拖动、缩放、点位点击及区位概览。默认聚焦山上点群，名称以悬停提示呈现；路线时长标签仅在放大后显示，减少遮挡。',
    '8个点位：纪念馆园区、华野战地指挥所标识点、华野战壕、铁索桥、炮轰石、弹击石、击毙张灵甫之地、山顶战役纪念碑。每点提供介绍、事实要点、坐标说明及来源入口；遗址名称与现代研学设施不混同。',
    '讲解音频与数字人：8点均有约48—55秒中文合成语音及同步字幕；另有约48秒开场、22秒结语。原创SVG数字人“小崮”以音频音量驱动口型，支持播放、暂停、停止与自动顺序导览。',
    '推荐路线：纪念馆至山上明确为“乘车／景区交通”，不虚构步行时间。山上7点连线约1.89公里、63—90分钟，按坐标端点距离×1.6估算，非实测步道路网，也不是逐向导航；实际以景区指示和安全管制为准。',
    '研学打卡：现场可在点位300米范围内定位打卡；非现场可选择“非现场打卡”，完整听完本点讲解后获章。定位须用户授权；默认保存在本机浏览器，禁用存储时仅在当前页面内保留，不上传账号数据。',
    '知识问答与证书：题库12道有据可查的四选一题，每轮随机抽取5题，达标后获得问答章；集齐8点印章并通过问答，可填写姓名生成并下载PNG研学证书。证书为学习体验凭证，非官方认证。',
]:
    para('• ' + text)
picture('talking.png', '图2  点位详情、资料来源与数字人语音讲解。')

doc.add_page_break()
heading('四、技术实现')
para('前端为HTML、CSS、原生JavaScript构建的纯静态H5，无需登录。Leaflet负责点位、连线与视图；高德瓦片使用GCJ-02坐标，研究数据采用WGS84，显示前执行WGS84→GCJ-02转换。瓦片与资料链接依赖网络，音频、字幕、字体及Leaflet资源随站点提供，不宣称完全离线。')
para('讲解采用Microsoft Edge神经网络TTS（edge-tts，zh-CN-XiaoxiaoNeural）生成MP3及SRT；Audio元素与字幕时间轴同步，WebAudio AnalyserNode提取音量驱动SVG口型。localStorage保存本机学习进度，异常时降级为内存状态；Canvas绘制证书并导出PNG，显式加载站点中文字体以避免缺字。')
para('代码与内容分离：web/content/data.js承载点位、路线、题库和来源；research/保存研究证据；tools/提供音频生成、界面及完整学习流程检查工具。桌面和手机布局适配；公开站点使用GitHub Pages静态托管。')
heading('五、创新点')
para('①空间叙事与学习闭环结合：在地图中建立馆区与山上点群关系，以讲解、集章、问答推动主动学习。②轻量数字人：原创SVG结合实时音频口型，无需视频流或登录。③史料边界透明：来源可追溯，坐标置信度和路线估算显式提示，不把不确定说法包装成定论。④兼顾现场与远程：定位打卡和听讲解获章并行，便于课前预习与课后复习。')
picture('certificate.png', '图3  完成集章与问答后的研学证书示例（非官方认证）。', 14)

doc.add_page_break()
heading('六、资料来源')
para('以下为主要史实与地图来源（完整逐点链接、取证说明及不确定项见仓库research/research.json、research.md；核对日期：2026年11月21日）。')
for index, source_id in enumerate(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S10', 'M0'], 1):
    src = research['sources'][source_id]
    p = para(f'[{index}] {src["publisher"]}：《{src["title"]}》。\n{src["url"]}')
    p.paragraph_format.line_spacing = 1
    for run in p.runs:
        run.font.size = Pt(9)
para('OSM原始节点／面数据用于坐标取证；Wikimedia Commons实地照片文件说明仅用于交叉确认标识点存在，未将其照片用于作品配图，也不据此断定遗迹年代。研究资料不替代馆方审定或现场测绘。')
heading('七、AI使用声明')
para('本作品使用AI辅助资料检索与整理、文案结构梳理、代码编写及调试；讲解配音由Microsoft Edge神经网络TTS生成，并非真人录音。数字人采用SVG绘制及程序动画，并非历史人物复原或虚构见证者。当前材料为AI辅助形成的参赛草稿；提交前须由参赛团队人工逐条核对史料、坐标、版权、配音与功能，并承担最终内容责任，不能将自动化检查等同于人工史实审核。')
heading('版权与原创声明')
para('作品讲解采用原创表述，不复制整篇史料；界面、SVG数字人及交互代码为本项目创作并含AI辅助。截图取自本作品。高德底图保留其署名及使用条款，OSM数据遵循ODbL并标注贡献者；Leaflet遵循BSD-2-Clause，Noto Sans CJK字体遵循SIL OFL（随站点附许可证）。不主张第三方地图、史料、字体或开源库的著作权；提交及公开展示前团队须复核相关授权、地图服务使用条件和学校／成员信息。')
para('团队确认：【团队负责人签名】   日期：【年／月／日】')
doc.save(OUT / FILENAME)
print(OUT / FILENAME)
