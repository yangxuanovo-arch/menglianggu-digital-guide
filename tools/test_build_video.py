from pathlib import Path
import tempfile
import unittest

from playwright.sync_api import Error, sync_playwright

from build_video import SCENES, subtitles, validate_audio, wait_for_media


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


class MediaWaitTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.page = self.browser.new_page()
        self.addCleanup(self.page.close)

    def test_playing_media_returns_immediately(self):
        media = self.page.evaluate_handle('Object.assign(new EventTarget(),{currentTime:1,paused:false})')
        wait_for_media(media, timeout_ms=100)

    def test_media_starting_later(self):
        media = self.page.evaluate_handle('''()=>{
            const m=Object.assign(new EventTarget(),{currentTime:0,paused:true});
            setTimeout(()=>{m.currentTime=1;m.paused=false;m.dispatchEvent(new Event('timeupdate'))},30);
            return m
        }''')
        wait_for_media(media, timeout_ms=1000)

    def test_idle_video_times_out_even_when_fallback_audio_is_playing(self):
        media = self.page.evaluate_handle('''()=>{
            window.fallbackAudio={currentTime:1,paused:false};
            return Object.assign(new EventTarget(),{currentTime:0,paused:true})
        }''')
        with self.assertRaisesRegex(Error, 'Timed out waiting for sampled media playback'):
            wait_for_media(media, timeout_ms=30)


if __name__ == '__main__':
    unittest.main()
