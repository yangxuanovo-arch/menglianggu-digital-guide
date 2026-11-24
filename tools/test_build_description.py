import json
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name('build_description.py')
READ_TEXT = Path.read_text


class PrivateContactsTest(unittest.TestCase):
    def build(self, value):
        def read_text(path, *args, **kwargs):
            if path.name == 'team_private.json':
                if value is None:
                    raise FileNotFoundError(path)
                return value
            return READ_TEXT(path, *args, **kwargs)

        with patch.object(Path, 'read_text', read_text), patch('docx.document.Document.save'):
            result = runpy.run_path(str(SCRIPT))
        self.assertIn('迟庆宇｜2024级机器人工程专业本科生', result['doc'].tables[0].cell(3, 1).text)
        self.assertNotIn('负责人签名', '\n'.join(p.text for p in result['doc'].paragraphs))
        self.assertNotIn('日期：', '\n'.join(p.text for p in result['doc'].paragraphs))
        return result['doc'].tables[0].cell(2, 1).text

    def test_private_contacts(self):
        text = self.build(json.dumps({'captain': {'phone': 'example-phone', 'email': 'captain@example.test'}}))
        self.assertIn('\nexample-phone｜captain@example.test', text)

    def test_missing_file_omits_contact_line(self):
        text = self.build(None)
        self.assertNotIn('\n', text)
        self.assertIn('魏冰洋', text)

    def test_empty_file_omits_contact_line(self):
        self.assertNotIn('\n', self.build('{}'))

    def test_malformed_file_is_not_silently_accepted(self):
        with self.assertRaises(json.JSONDecodeError):
            self.build('{')


if __name__ == '__main__':
    unittest.main()
