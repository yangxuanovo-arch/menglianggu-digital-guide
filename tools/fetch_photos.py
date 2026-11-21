"""Fetch verified Commons point photos, retaining attribution and license metadata."""
import html
import io
import json
from pathlib import Path
import re

from PIL import Image, ImageOps
import requests

ROOT = Path(__file__).resolve().parent.parent
FILES = {
    'hall': '孟良崮战役纪念馆.jpg',
    'field-command': '孟良崮战役遗址——华野战地指挥部.jpg',
    'trench': '孟良崮战役遗址——华野战壕.jpg',
    'bridge': '孟良崮战役遗址——铁索桥.jpg',
    'shell-rock': '孟良崮战役遗址——炮轰石.jpg',
    'bullet-rock': '孟良崮战役遗址——弹击石.jpg',
    'zhang-site': '孟良崮战役遗址——击毙张灵甫之地.jpg',
    'monument': '孟良崮战役遗址——孟良崮战役纪念碑.jpg',
}


def bounded_jpeg(image, target):
    for bound in [1200, 1000, 800, 640]:
        resized = image.copy()
        resized.thumbnail((bound, bound))
        for quality in [85, 75, 65, 55]:
            resized.save(target, 'JPEG', quality=quality, optimize=True)
            if target.stat().st_size <= 160_000:
                return resized.size
    raise ValueError(f'Cannot bound image size: {target}')


def main():
    session = requests.Session()
    session.headers['User-Agent'] = 'Menglianggu educational guide (attribution research)'
    response = session.get('https://commons.wikimedia.org/w/api.php', params={
        'action': 'query', 'format': 'json', 'titles': '|'.join('File:'+n for n in FILES.values()),
        'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 1200,
    }, timeout=60)
    response.raise_for_status()
    source = response.json()
    pages = {p['title']: p for p in source['query']['pages'].values()}
    path = ROOT / 'web/content/data.js'
    guide = json.loads(path.read_text().removeprefix('window.GUIDE = ').removesuffix(';\n'))
    directory = ROOT / 'web/img'
    directory.mkdir(exist_ok=True)
    for point in guide['points']:
        info = pages['File:'+FILES[point['id']]]['imageinfo'][0]
        meta = info['extmetadata']
        license_name = meta['LicenseShortName']['value']
        assert license_name == 'CC BY-SA 4.0', license_name
        author = html.unescape(re.sub('<[^>]+>', '', meta['Artist']['value'])).strip()
        image_response = session.get(info.get('thumburl', info['url']), timeout=90)
        if image_response.status_code != 200:
            image_response = session.get(info['url'], timeout=90)
        image_response.raise_for_status()
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_response.content))).convert('RGB')
        target = directory / (point['id']+'.jpg')
        size = bounded_jpeg(image, target)
        point['img'] = 'img/'+target.name
        point['imgAlt'] = point['name']+'实景'
        point['imageCredit'] = {'author': author, 'license': license_name,
                                'licenseUrl': meta['LicenseUrl']['value'],
                                'source': info['descriptionurl'], 'title': FILES[point['id']],
                                'changes': '等比缩放、JPEG压缩；界面封面裁切显示'}
        print(point['id'], author, license_name, size, target.stat().st_size, info['descriptionurl'], flush=True)
    (ROOT/'research/photo-sources.json').write_text(json.dumps(source, ensure_ascii=False, indent=2))
    path.write_text('window.GUIDE = '+json.dumps(guide, ensure_ascii=False, indent=2)+';\n')


if __name__ == '__main__':
    main()
