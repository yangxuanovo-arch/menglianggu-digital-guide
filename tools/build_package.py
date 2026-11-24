"""Package the committed source tree, final submission and supplied contest rules."""
from io import BytesIO
from pathlib import Path
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
WORK = Path.home() / 'contest'
TOP = '崮上丰碑-完整项目包'
NAME = '红色齐鲁-数字创意挑战赛-崮上丰碑——孟良崮战役纪念地数字导览-山东大学'
sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
archive = subprocess.check_output(['git', 'archive', '--format=tar', 'HEAD'], cwd=ROOT)
readme = f'''崮上丰碑——孟良崮战役纪念地数字导览（完整项目包）

在线访问：https://yangxuanovo-arch.github.io/menglianggu-digital-guide/
源码仓库：https://github.com/yangxuanovo-arch/menglianggu-digital-guide

目录：
  源码/       git archive HEAD导出的完整源码（版本 {sha}）
    web/      静态网站、音频、视频、三维沙盘、全景场景与公开署名
    tools/    说明书、离线缓存、截图与检查脚本
    research/ 史实、坐标与照片来源证据
    docs/     最终说明书与无障碍说明
  提交材料/   山东大学版作品说明书DOCX与PDF（5页A4）
  赛事规则/   官方学生组规则PDF与摘要

团队信息已填写：山东大学 低空科学与工程学院（学生组）；
队长魏冰洋，成员隋源、迟庆宇，指导教师于瑞璇（助理研究员）。
未设置团队名称。公开网站不展示电话或邮箱；提交说明书含队长联系方式。

本地运行：在“源码/web”目录执行 python3 -m http.server 8000
浏览器访问 http://localhost:8000/；高德底图与外部资料需联网。
不要直接双击index.html，离线缓存和视频模块需要HTTP环境。

说明书生成：python3 tools/build_description.py（需python-docx、Pillow）。
DOCX显式指定宋体／黑体；PDF已用宋体风格Noto Serif CJK与黑体风格
Noto Sans CJK回退字体渲染并嵌入。Word未安装相应字体时应检查分页。
视频与答辩PPT按所有者要求继续暂停，本包未新增或重建该两项交付。
'''
destination = WORK / (TOP + '.zip')
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
    with tarfile.open(fileobj=BytesIO(archive)) as source:
        for member in source:
            name = f'{TOP}/源码/{member.name}'
            if member.isdir():
                out.writestr(name.rstrip('/') + '/', b'')
            elif member.isfile():
                out.writestr(name, source.extractfile(member).read())
            else:
                raise ValueError('Unsupported archive entry: ' + member.name)
    for ext in ['docx', 'pdf']:
        out.write(ROOT / 'docs' / (NAME + '.' + ext), f'{TOP}/提交材料/{NAME}.{ext}')
    for name in ['rules_student.pdf', '红色齐鲁赛项规则摘要.md']:
        out.write(WORK / name, f'{TOP}/赛事规则/{name}')
    out.writestr(f'{TOP}/使用说明.txt', readme)
with zipfile.ZipFile(destination) as result:
    assert result.testzip() is None
    assert all(name.startswith(TOP + '/') for name in result.namelist())
    assert not any('【学校名称】' in name for name in result.namelist())
print(f'PASS package: git archive {sha}; source/submission/rules/README; CRC verified')
print(f'{destination}: {destination.stat().st_size} bytes')
