"""Verify the actual Pages assembler against release payloads and unsafe archives."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('avg_pages', ROOT / 'builds/android/pages.py')
PAGES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PAGES)
REPO = 'wujiankai8864515/little-steps-cocos'
BASE = 'https://wujiankai8864515.github.io/little-steps-cocos/avg-plus/android/'


def payload(version, path='assets/resources/level.json', content=b'{"slots":[1,2]}'):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(path, content)
    data = stream.getvalue()
    manifest = {
        'version': version, 'engineVersion': '3.8.8', 'nativeCompatibility': 'avg_plus-cocos-3.8.8-native-1',
        'packageUrl': BASE + 'versions/' + version + '/',
        'remoteManifestUrl': BASE + 'latest/avg-plus-project.manifest',
        'remoteVersionUrl': BASE + 'latest/avg-plus-version.manifest', 'searchPaths': [''],
        'assets': {'avg-plus-assets.zip': {'compressed': True, 'size': len(data),
                   'md5': hashlib.sha256(data).hexdigest()}}}
    return manifest, data


class PagesTests(unittest.TestCase):
    def assemble(self, versions):
        files, releases = {}, []
        for index, (manifest, data) in enumerate(versions):
            base = f'https://github.com/{REPO}/releases/download/test-{index}/'
            entries = {
                'avg-plus-project.manifest': json.dumps(manifest).encode(),
                'avg-plus-version.manifest': json.dumps({k: manifest[k] for k in
                    ['version', 'engineVersion', 'nativeCompatibility', 'remoteManifestUrl', 'remoteVersionUrl']}).encode(),
                'avg-plus-assets.zip': data}
            files.update({base + name: value for name, value in entries.items()})
            releases.append({'tag_name': f'test-{index}', 'html_url': base,
                'assets': [{'name': name, 'browser_download_url': base + name} for name in entries]})
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        destination = Path(temporary.name) / 'site'
        with contextlib.redirect_stdout(io.StringIO()):
            PAGES.assemble(REPO, destination, lambda url, maximum=None: files[url], releases)
        return destination

    def test_numeric_latest_preserves_previous_versions_and_only_payloads(self):
        destination = self.assemble([payload('0.1.0.2'), payload('0.1.0.10')])
        latest = json.loads((destination / 'avg-plus/android/latest/avg-plus-project.manifest').read_text())
        self.assertEqual(latest['version'], '0.1.0.10')
        for version in ['0.1.0.2', '0.1.0.10']:
            archive = destination / 'avg-plus/android/versions' / version / 'avg-plus-assets.zip'
            self.assertTrue(archive.is_file())
            with zipfile.ZipFile(archive) as opened:
                self.assertEqual(opened.namelist(), ['assets/resources/level.json'])
        self.assertFalse((destination / 'games').exists())
        self.assertFalse((destination / '.git').exists())

    def test_no_release_does_not_claim_an_available_update(self):
        destination = self.assemble([])
        self.assertIn('正在准备', (destination / 'index.html').read_text())
        self.assertFalse((destination / 'avg-plus/android/latest').exists())

    def test_immutable_version_cannot_change_content_or_compatibility(self):
        first = payload('0.1.0.0')
        with self.assertRaisesRegex(ValueError, 'previously published'):
            self.assemble([first, payload('0.1.0.0', content=b'changed')])
        changed = dict(first[0], nativeCompatibility='different-native-build')
        with self.assertRaisesRegex(ValueError, 'previously published'):
            self.assemble([first, (changed, first[1])])

    def test_hash_traversal_native_engine_and_symlink_rejected(self):
        manifest, data = payload('0.1.0.0')
        with self.assertRaisesRegex(ValueError, 'SHA-256'):
            PAGES.validate_payload(manifest, bytes([data[0] ^ 1]) + data[1:], BASE)
        for path in ['../main.js', 'assets/../../main.js', 'src/cocos-js/cc.js', '/assets/test', 'assets\\test']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                invalid, archive = payload('0.1.0.0', path)
                PAGES.validate_payload(invalid, archive, BASE)
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, 'w') as archive:
            entry = zipfile.ZipInfo('assets/link')
            entry.external_attr = 0o120777 << 16
            archive.writestr(entry, '/etc/passwd')
        linked = stream.getvalue()
        manifest['assets']['avg-plus-assets.zip'].update(size=len(linked), md5=hashlib.sha256(linked).hexdigest())
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            PAGES.validate_payload(manifest, linked, BASE)


if __name__ == '__main__':
    unittest.main()
