from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from playwright.sync_api import Error, sync_playwright

from build_video import SCENES, finalize_video, subtitles, validate_audio, wait_for_media


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


class FinalizeVideoTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.concat = self.root/'concat.txt'
        self.concat.write_text('fixture')
        self.output = self.root/'submission.mp4'
        self.output.write_bytes(b'last good submission')
        self.result = {'format': {'duration': '264'}, 'streams': [
            {'codec_type': 'video', 'width': 1920, 'height': 1080, 'codec_name': 'h264'},
            {'codec_type': 'audio', 'codec_name': 'aac'}]}

    def render(self, args):
        candidate = Path(args[-1])
        self.assertEqual(candidate.parent, self.output.parent)
        self.assertNotEqual(candidate, self.output)
        candidate.write_bytes(b'new submission')

    def test_success_replaces_only_validated_submission(self):
        def checked_probe(candidate):
            self.assertEqual(self.output.read_bytes(), b'last good submission')
            self.assertEqual(candidate.read_bytes(), b'new submission')
            return self.result
        with patch('build_video.run', side_effect=self.render), patch('build_video.probe', side_effect=checked_probe):
            self.assertEqual(finalize_video(self.concat, self.output), self.result)
        self.assertEqual(self.output.read_bytes(), b'new submission')
        self.assertEqual(list(self.root.glob('.submission.*.mp4')), [])

    def test_failures_preserve_submission_and_clean_temporary_file(self):
        for failure in ['ffmpeg', 'ffprobe', 'duration', 'missing_audio', 'replace']:
            with self.subTest(failure=failure):
                def render(args):
                    self.render(args)
                    if failure == 'ffmpeg':
                        raise RuntimeError('ffmpeg failed')
                result = self.result.copy()
                if failure == 'duration':
                    result['format'] = {'duration': '1'}
                if failure == 'missing_audio':
                    result['streams'] = result['streams'][:1]
                with patch('build_video.run', side_effect=render), patch(
                        'build_video.probe', side_effect=RuntimeError('ffprobe failed') if failure == 'ffprobe' else None, return_value=result), patch(
                        'build_video.os.replace', side_effect=OSError('replace failed')):
                    with self.assertRaises((RuntimeError, AssertionError, StopIteration, OSError)):
                        finalize_video(self.concat, self.output)
                self.assertEqual(self.output.read_bytes(), b'last good submission')
                self.assertEqual(list(self.root.glob('.submission.*.mp4')), [])


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
