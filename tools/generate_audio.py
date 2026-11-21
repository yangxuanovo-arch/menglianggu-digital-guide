import asyncio
import json
from pathlib import Path
import subprocess

WEB = Path('/home/ubuntu/contest/app/web')
guide = json.loads((WEB / 'content/data.js').read_text().removeprefix('window.GUIDE = ').removesuffix(';\n'))

async def main():
    semaphore = asyncio.Semaphore(3)
    scripts = [(p['id'], p['text']) for p in guide['points']]
    scripts += list(guide['narration'].items())
    async def generate(identifier, script):
        async with semaphore:
            process = await asyncio.create_subprocess_exec(
                'edge-tts', '--voice', 'zh-CN-XiaoxiaoNeural', '--rate=-5%',
                '--text', script, '--write-media', str(WEB / 'audio' / (identifier + '.mp3')),
                '--write-subtitles', str(WEB / 'audio' / (identifier + '.srt')))
            code = await process.wait()
            if code:
                raise RuntimeError(f'{identifier}: edge-tts exit {code}')
            print('GENERATED', identifier, flush=True)
    await asyncio.gather(*(generate(identifier, script) for identifier, script in scripts))

asyncio.run(main())
