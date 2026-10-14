"""Exercise real changed-file archives, complete Pages chains, and protected output cleanup."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'builds/android'))
import delta
import pages
import publish

REPOSITORY = 'wujiankai8864515/little-steps-cocos'
BASE = 'https://wujiankai8864515.github.io/little-steps-cocos/avg-plus/android/'
COMPATIBILITY = 'avg_plus-cocos-3.8.8-native-1'


def full(folder, version, contents):
    folder.mkdir()
    archive = folder / delta.ARCHIVE
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as opened:
        for name, data in contents.items():
            opened.writestr(name, data)
    data = archive.read_bytes()
    snapshot = {'schemaVersion': 2, 'version': version, 'displayVersion': '2026-10-14-18-30-01',
                'nativeCompatibility': COMPATIBILITY,
                'files': [{'path': name, 'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()}
                          for name, value in sorted(contents.items())]}
    (folder / 'payload-record.json').write_text(json.dumps({**snapshot, 'zipBytes': len(data)}))
    manifest = {'version': version, 'displayVersion': snapshot['displayVersion'], 'engineVersion': '3.8.8',
                'nativeCompatibility': COMPATIBILITY, 'searchPaths': [''],
                'packageUrl': BASE + 'versions/' + version + '/',
                'remoteManifestUrl': BASE + 'latest/avg-plus-project.manifest',
                'remoteVersionUrl': BASE + 'latest/avg-plus-version.manifest',
                'assets': {delta.ARCHIVE: {'compressed': True, 'size': len(data), 'md5': hashlib.sha256(data).hexdigest()}}}
    (folder / 'avg-plus-project.manifest').write_text(json.dumps(manifest))
    (folder / 'avg-plus-version.manifest').write_text(json.dumps({k: manifest[k] for k in
        ['version', 'engineVersion', 'nativeCompatibility', 'remoteManifestUrl', 'remoteVersionUrl']}))
    return snapshot


class DeltaTests(unittest.TestCase):
    def test_archive_contains_only_actual_changes_and_deletions_reproduce_full_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = full(root / '6', '0.1.0.6', {'src/game.js': b'6', 'assets/same.png': b'a' * 100000,
                                              'assets/obsolete.json': b'old'})
            current = full(root / '7', '0.1.0.7', {'src/game.js': b'7', 'assets/same.png': b'a' * 100000,
                                                 'assets/new.json': b'new'})
            result = delta.prepare(root / '7', base)
            self.assertEqual(result['changedFiles'], 2)
            self.assertEqual(result['removedFiles'], 1)
            output = root / '7/delta'
            metadata = json.loads((output / 'avg-plus-delta.json').read_text())
            payload = (output / delta.ARCHIVE).read_bytes()
            delta.validate_delta(metadata, payload, base)
            self.assertEqual(len(payload) % 32, 0)
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                self.assertEqual(set(archive.namelist()), {'src/game.js', 'assets/new.json'})
                reconstructed = {'src/game.js': b'6', 'assets/same.png': b'a' * 100000, 'assets/obsolete.json': b'old'}
                for name in metadata['removed']:
                    del reconstructed[name]
                reconstructed.update({name: archive.read(name) for name in archive.namelist()})
                self.assertEqual([{'path': n, 'bytes': len(v), 'sha256': hashlib.sha256(v).hexdigest()}
                                  for n, v in sorted(reconstructed.items())], current['files'])
            with self.assertRaises(ValueError):
                delta.validate_delta(metadata, bytes([payload[0] ^ 1]) + payload[1:], base)
            wrong = {**metadata, 'removed': []}
            with self.assertRaisesRegex(ValueError, 'complete snapshot'):
                delta.validate_delta(wrong, payload, base)

    def test_removal_only_update_and_unmodified_assets_do_not_require_a_full_zip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = full(root / '6', '0.1.0.6', {'src/game.js': b'unchanged', 'assets/obsolete.json': b'old'})
            full(root / '7', '0.1.0.7', {'src/game.js': b'unchanged'})
            result = delta.prepare(root / '7', base)
            self.assertEqual(result['changedFiles'], 0)
            self.assertEqual(result['removedFiles'], 1)
            payload = Path(result['archive']).read_bytes()
            metadata = json.loads(Path(result['metadata']).read_text())
            delta.validate_delta(metadata, payload, base)
            self.assertLess(len(payload), 128)

    def test_pages_retains_legacy_bridge_and_serves_ordered_small_updates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snapshots, folders = [], []
            for number in [6, 7, 8]:
                folder = root / str(number)
                snapshot = full(folder, '0.1.0.' + str(number), {'src/game.js': str(number).encode(), 'assets/same.png': b'original'})
                delta.prepare(folder, snapshots[-1] if snapshots else None)
                snapshots.append(snapshot); folders.append(folder)
            values, releases = {}, []
            for number, folder in zip([6, 7, 8], folders):
                location = f'https://github.com/{REPOSITORY}/releases/download/test-{number}/'
                paths = [folder / name for name in ['avg-plus-project.manifest', 'avg-plus-version.manifest', delta.ARCHIVE]] if number == 6 else [folder / 'delta' / name for name in ['avg-plus-delta.json', delta.ARCHIVE]]
                paths.append(folder / 'delta' / delta.META)
                values.update({location + path.name: path.read_bytes() for path in paths})
                releases.append({'tag_name': f'test-{number}', 'html_url': location,
                                 'assets': [{'name': path.name, 'browser_download_url': location + path.name} for path in paths]})
            with contextlib.redirect_stdout(io.StringIO()):
                pages.assemble(REPOSITORY, root / 'site', lambda url, maximum=None: values[url], releases)
            channel = root / 'site/avg-plus/android'
            legacy = json.loads((channel / 'latest/avg-plus-project.manifest').read_text())
            index = json.loads((channel / 'delta/latest/index.json').read_text())
            self.assertEqual(legacy['version'], '0.1.0.6')
            self.assertEqual(index['bridgeVersion'], '0.1.0.6')
            self.assertEqual(index['version'], '0.1.0.8')
            self.assertEqual([p['version'] for p in index['updates']], ['0.1.0.7', '0.1.0.8'])
            self.assertIn('2026-10-14-18-30-01', (channel / 'index.html').read_text())
            with self.assertRaisesRegex(ValueError, 'parent mismatch'):
                with contextlib.redirect_stdout(io.StringIO()):
                    pages.assemble(REPOSITORY, root / 'missing', lambda url, maximum=None: values[url], [releases[0], releases[2]])

    def test_cleanup_never_accepts_source_templates_or_unknown_output_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve(); channel = root / 'builds/android'; channel.mkdir(parents=True)
            stage = root / 'migration/work/avg-plus-android-20261014T183001000001Z'; stage.mkdir(parents=True)
            (stage / 'build-config.json').write_text('{}')
            template = channel / 'templates/keep.xml'; template.parent.mkdir(); template.write_text('keep')
            output = channel / 'avg_plus/hot-update'; output.mkdir(parents=True)
            (output / 'payload-record.json').write_text(json.dumps({'version': '0.1.0.6', 'sha256': 'same'}))
            (output / 'unexpected.keystore').write_text('keep')
            record = {'stage': str(stage), 'candidate': stage.name, 'hotUpdate': {'sha256': 'same'}}
            with patch.object(publish, 'ROOT', root), patch.object(publish, 'CHANNEL', channel), patch.object(publish.subprocess, 'check_output', return_value=b''):
                with self.assertRaisesRegex(ValueError, 'Unknown file'):
                    publish.clean_build(record, {'hotUpdateVersion': '0.1.0.6'})
                self.assertTrue(stage.exists()); self.assertEqual(template.read_text(), 'keep')
                (output / 'unexpected.keystore').unlink()
                publish.clean_build(record, {'hotUpdateVersion': '0.1.0.6'})
                self.assertFalse(stage.exists()); self.assertFalse(output.exists()); self.assertEqual(template.read_text(), 'keep')
                bad = {**record, 'stage': str(template.parent)}
                with self.assertRaises(ValueError):
                    publish.clean_build(bad, {'hotUpdateVersion': '0.1.0.6'})


if __name__ == '__main__':
    unittest.main()
