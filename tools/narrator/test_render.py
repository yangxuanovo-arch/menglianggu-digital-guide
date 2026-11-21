import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import render


class RenderTests(unittest.TestCase):
    def test_clip_validation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            audio = root / 'web/audio'
            audio.mkdir(parents=True)
            (audio / 'intro.mp3').write_bytes(b'audio')
            (audio / 'empty.mp3').touch()
            with patch.object(render, 'REPO', root):
                self.assertEqual(render.clip_audio('intro'), audio / 'intro.mp3')
                for invalid in ('../intro', '', 'INTRO', 'missing', 'empty'):
                    with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                        render.clip_audio(invalid)

    def test_web_encoding(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, audio, output = root / 'source.mp4', root / 'audio.wav', root / 'web/intro.mp4'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i',
                            'color=c=red:s=768x960:r=25:d=0.4', '-pix_fmt', 'yuv420p', str(source)], check=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i',
                            'sine=frequency=440:duration=0.4', str(audio)], check=True)
            render.encode_web(source, audio, output)
            probe = json.loads(subprocess.check_output([
                'ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(output),
            ], text=True))
            video, sound = probe['streams']
            self.assertEqual((video['codec_name'], video['width'], video['height'], video['pix_fmt']),
                             ('h264', 480, 600, 'yuv420p'))
            self.assertEqual(sound['codec_name'], 'aac')
            self.assertAlmostEqual(render.duration(output), 0.4, delta=0.1)
            self.assertTrue(output.with_suffix('.jpg').stat().st_size)
            contents = output.read_bytes()
            self.assertLess(contents.index(b'moov'), contents.index(b'mdat'))
            self.assertFalse(list(output.parent.glob('*.part.*')))

    def test_failed_encode_does_not_publish(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / 'web/failure.mp4'
            with patch.object(render.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'ffmpeg')):
                with self.assertRaises(subprocess.CalledProcessError):
                    render.encode_web(root / 'missing', root / 'audio', output)
            self.assertFalse(output.exists())
            self.assertFalse(output.with_suffix('.jpg').exists())


if __name__ == '__main__':
    unittest.main()
