"""Generate AI narration (edge-tts) and subtitle cues for the monument scene."""
import asyncio, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / 'scene/src/content.json'
AUDIO = ROOT / 'web/scene/audio'
VOICE = 'zh-CN-YunyangNeural'


def parse_srt(text):
    cues = []
    for block in re.split(r'\n\s*\n', text.strip()):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        a, b = [p.strip() for p in lines[1].split('-->')]
        to_s = lambda t: sum(float(x) * m for x, m in zip(t.replace(',', '.').split(':'), (3600, 60, 1)))
        cues.append([round(to_s(a), 2), round(to_s(b), 2), ''.join(lines[2:]).strip()])
    return cues


async def main():
    AUDIO.mkdir(parents=True, exist_ok=True)
    content = json.loads(CONTENT.read_text())
    cues = {}
    for stop in content['stops']:
        mp3, srt = AUDIO / f"{stop['id']}.mp3", AUDIO / f"{stop['id']}.srt"
        proc = await asyncio.create_subprocess_exec(
            'edge-tts', '--voice', VOICE, '--rate=-8%', '--text', stop['text'],
            '--write-media', str(mp3), '--write-subtitles', str(srt))
        if await proc.wait():
            raise RuntimeError(stop['id'])
        cues[stop['id']] = parse_srt(srt.read_text())
        srt.unlink()
        print('generated', stop['id'], cues[stop['id']][-1][1], 's')
    (ROOT / 'scene/src/cues.json').write_text(json.dumps(cues, ensure_ascii=False, indent=1))

asyncio.run(main())
