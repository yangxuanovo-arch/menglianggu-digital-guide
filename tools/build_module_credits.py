"""Collect module attribution for the guide and description appendix."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
scene = json.loads((ROOT / 'scene/src/content.json').read_text())
terrain = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {sources} from './web/terrain/src/battle.js'; console.log(JSON.stringify(sources))"
], cwd=ROOT))
elevation = json.loads((ROOT / 'web/terrain/assets/elevation.json').read_text())
materials = {
    'lenong_2': '天空全景（地平线以下改为雾色）',
    'concrete_wall_008': '碑体石材',
    'granite_tile': '广场与台阶铺石',
    'aerial_grass_rock': '山地地表',
    'rock_boulder_dry': '岩石',
    'leafy_grass': '绿篱',
    'pine_tree_01': '松树模型（离线渲染为公告板贴图）',
    'pine_sapling_small': '幼松模型（离线渲染为贴图）',
    'grass_medium_01': '草丛模型（离线渲染为贴图）',
}
photos = []
for key, m in scene['images'].items():
    changes = '缩小'
    if key == 'monument-2024':
        changes += '；碑名题字另裁切为贴图'
    elif key == 'zhang-site-2014':
        changes += '；石刻题字另裁切为贴图'
    photos.append(dict(title=m['caption'], author=m['author'], license=m['license'],
                       url=m['page'], licenseUrl='https://creativecommons.org/licenses/by-sa/4.0/',
                       changes=changes))
credits = {
    'panorama': {
        'title': '3D 场景漫游',
        'sources': list(scene['sources'].values()),
        'media': photos + [dict(title=title, author='Poly Haven', license='CC0',
                               url='https://polyhaven.com/a/' + slug,
                               licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/',
                               changes='植物模型离线渲染为贴图' if slug in ['pine_tree_01', 'pine_sapling_small', 'grass_medium_01'] else '512px材质；天空按模块用途处理')
                           for slug, title in materials.items()],
        'notes': [
            '三维模型由程序化代码依据实景照片概略重现，不是测绘级模型，尺寸、比例与方位为示意。',
            '本模块使用AI辅助文案整理与代码编写；讲解由Microsoft Edge神经网络语音zh-CN-YunyangNeural合成，字幕同步生成。未使用AI生成图片：材质与天空来自实拍扫描，松树、幼松与草丛贴图来自公开三维模型的离线渲染。',
            '三维引擎采用Three.js 0.170（MIT）。',
        ],
    },
    'terrain': {
        'title': '3D 地形沙盘',
        'sources': terrain,
        'media': [dict(title=elevation['source'], author=elevation['credit'],
                       license='数据来源与署名见Tilezen许可说明',
                       url=elevation['sourceUrl'], licenseUrl=elevation['attributionUrl'],
                       changes='裁切后双线性重采样至257×257，取整为米；手机简化网格')],
        'notes': [
            '真实现代高程，非1947年地表复原；部队位置、箭线、范围及动画中间帧为方向性教学示意，不代表精确阵位、行军轨迹或兵力比例。',
            '默认纵向增强3.6倍，可切换原比例；颜色、镜头为艺术表达，不是卫星影像。',
            '本模块使用AI辅助编程、界面设计和史料摘要。高程来自公开DEM，未用AI生成地形，未使用AI生成的历史照片、声音或人物影像。',
            f"地形数据：WGS84 / EGM96；获取日期{elevation['retrieved']}；资产SHA-256：{elevation['assetSha256']}。三维引擎Three.js 0.170（MIT）。",
        ],
    },
}
out = ROOT / 'web/content/module-credits.js'
out.write_text('window.GUIDE_MODULE_CREDITS = ' + json.dumps(credits, ensure_ascii=False, indent=2) + ';\n')
print('Module credits: panorama 5 sources / 4 Commons photos / 9 CC0 assets; terrain 5 sources / DEM provenance and AI disclosure')
