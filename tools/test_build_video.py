from pathlib import Path
import tempfile
import unittest

from build_video import SCENES, subtitles, validate_audio


class VideoTest(unittest.TestCase):
    def test_order_and_length(self):
        self.assertEqual([s[0] for s in SCENES], ['title', 'map', 'route', 'point', 'tour', 'stamps', 'quiz', 'certificate', 'terrain', 'narrator', 'panorama', 'phone', 'about', 'ending'])
        self.assertTrue(210 <= sum(s[2] for s in SCENES) <= 270)

    def test_audio_normal_and_no_site_audio(self):
        validate_audio(dict(voice_duration=4, duration=10, site_audio=[]))
        validate_audio(dict(voice_duration=4, duration=10, site_audio=[dict(at=6, duration=3, offset=0)]))

    def test_audio_overlap_and_overrun_rejected(self):
        for at, duration in [(3, 2), (8, 4), (6, 0)]:
            with self.subTest(at=at, duration=duration), self.assertRaises(AssertionError):
                validate_audio(dict(voice_duration=4, duration=10, site_audio=[dict(at=at, duration=duration, offset=0)]))

    def test_chinese_subtitles_and_ai_disclosure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'scene.ass'
            subtitles(dict(heading='真实页面', text='地图连接历史。', duration=10, voice_duration=4), path)
            text = path.read_text()
            self.assertIn('地图连接历史。', text)
            self.assertIn('配音为AI合成', text)
            self.assertIn('Noto Sans CJK SC', text)


if __name__ == '__main__':
    unittest.main()
