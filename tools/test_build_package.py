from io import BytesIO
from pathlib import Path
import runpy
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile


SCRIPT = Path(__file__).with_name('build_package.py')
TOP = '崮上丰碑-完整项目包'
NAME = '红色齐鲁-数字创意挑战赛-崮上丰碑——孟良崮战役纪念地数字导览-山东大学'


class PackageTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.home = Path(temporary.name)
        self.work = self.home / 'contest'
        (self.work / 'deliverables').mkdir(parents=True)
        for name in ['rules_student.pdf', '红色齐鲁赛项规则摘要.md',
                     f'deliverables/{NAME}.docx', f'deliverables/{NAME}.pdf']:
            (self.work / name).write_bytes(b'fixture')
        self.destination = self.work / (TOP + '.zip')
        self.previous = b'last good package'
        self.destination.write_bytes(self.previous)
        stream = BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as archive:
            for name, mode in [('README.md', 0o644), ('tools/narrator/render.sh', 0o755),
                               ('tools/narrator/batch.sh', 0o755)]:
                member = tarfile.TarInfo(name)
                member.mode = mode
                member.size = 7
                archive.addfile(member, BytesIO(b'fixture'))
        self.archive = stream.getvalue()

    def build(self):
        with patch.object(Path, 'home', return_value=self.home), patch(
                'subprocess.check_output', side_effect=['test-sha\n', self.archive]):
            runpy.run_path(str(SCRIPT))

    def assert_previous_preserved(self):
        self.assertEqual(self.destination.read_bytes(), self.previous)
        self.assertEqual(list(self.work.glob(f'.{TOP}.*.tmp')), [])

    def test_success_replaces_previous_package(self):
        self.build()
        with zipfile.ZipFile(self.destination) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.read(f'{TOP}/源码/README.md'), b'fixture')
            self.assertEqual(archive.read(f'{TOP}/提交材料/{NAME}.pdf'), b'fixture')
        self.assertEqual(list(self.work.glob(f'.{TOP}.*.tmp')), [])

    def test_missing_input_preserves_previous_package(self):
        (self.work / 'rules_student.pdf').unlink()
        with self.assertRaises(FileNotFoundError):
            self.build()
        self.assert_previous_preserved()

    def test_invalid_archive_preserves_previous_package(self):
        self.archive = b''
        with self.assertRaises(tarfile.ReadError):
            self.build()
        self.assert_previous_preserved()

    def test_failed_validation_preserves_previous_package(self):
        with patch.object(zipfile.ZipFile, 'testzip', return_value='bad-entry'):
            with self.assertRaises(AssertionError):
                self.build()
        self.assert_previous_preserved()

    def test_failed_replace_preserves_previous_package(self):
        with patch.object(Path, 'replace', side_effect=OSError('replace failed')):
            with self.assertRaises(OSError):
                self.build()
        self.assert_previous_preserved()


if __name__ == '__main__':
    unittest.main()
