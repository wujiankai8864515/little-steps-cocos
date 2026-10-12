"""Verify repeated workspace replacement does not lose personal files or stale generated state."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import build_wechat
import audit_wechat_candidate
from build_templates import install
from create_wechat_candidate import sha


class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        cache = self.root / 'builds/.cache'
        self.patches = [patch.object(build_wechat, key, value) for key, value in {
            'ROOT': self.root, 'CACHE': cache, 'STATE': cache / 'wechat-workspace.json',
            'DESTINATION': self.root / 'builds/wechatgame',
            'DIRECTORY': self.root / 'builds/cdn/wechatgame',
        }.items()]
        for item in self.patches:
            item.start()
        self.destination = build_wechat.DESTINATION
        self.cdn = build_wechat.DIRECTORY

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.directory.cleanup()

    def candidate(self, name, extra=None, failed=None):
        source = self.root / 'builds/work' / name / 'output/wechatgame'
        source.mkdir(parents=True)
        files = {'game.js': b'new-' + name.encode(), 'game.json': b'{}',
                 'project.config.json': b'{"compileType":"game","miniprogramRoot":"./"}',
                 'remote/home/config.json': b'new-assets-' + name.encode()}
        files.update(extra or {})
        inventory = []
        for relative, content in files.items():
            path = source / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            inventory.append({'path': relative, 'sha256': sha(path), 'bytes': len(content),
                              'bucket': 'remote/home' if relative.startswith('remote/') else 'main'})
        return {'checks': {'wechatEntryFiles': failed != 'entry',
                           'homeDeferredClosureWithin19MB': False},
                'files': inventory, 'sourceCommit': 'a' * 40}

    def test_refresh_removes_stale_generated_files_and_keeps_private_and_user_files(self):
        first = self.candidate('first', {'src/old.hash.js': b'old'})
        build_wechat.refresh('first', first)
        directory_inode = self.destination.stat().st_ino
        (self.destination / 'project.private.config.json').write_text('{"personal":true}')
        (self.destination / 'extra.js').write_text('custom')
        second = self.candidate('second', {'src/new.hash.js': b'new'})
        state = build_wechat.refresh('second', second)
        self.assertEqual((self.destination / 'game.js').read_bytes(), b'new-second')
        self.assertEqual(self.destination.stat().st_ino, directory_inode)
        self.assertFalse((self.destination / 'src/old.hash.js').exists())
        self.assertTrue((self.destination / 'src/new.hash.js').exists())
        self.assertEqual((self.destination / 'extra.js').read_text(), 'custom')
        self.assertEqual(json.loads((self.destination / 'project.private.config.json').read_text()), {'personal': True})
        self.assertFalse((self.destination / 'remote').exists())
        self.assertEqual((self.cdn / 'remote/home/config.json').read_bytes(), b'new-assets-second')
        self.assertFalse(state['homePayloadPassed'])
        self.assertTrue((self.root / 'builds/work/second/previous-wechatgame/src/old.hash.js').exists())

    def test_failed_structural_audit_never_replaces_previous_project(self):
        build_wechat.refresh('first', self.candidate('first'))
        with self.assertRaisesRegex(ValueError, 'wechatEntryFiles'):
            build_wechat.refresh('failed', self.candidate('failed', failed='entry'))
        self.assertEqual((self.destination / 'game.js').read_bytes(), b'new-first')

    def test_new_generated_file_cannot_silently_overwrite_user_added_file(self):
        build_wechat.refresh('first', self.candidate('first'))
        (self.destination / 'custom.js').write_text('my-script')
        with self.assertRaisesRegex(ValueError, 'conflicts'):
            build_wechat.refresh('second', self.candidate('second', {'custom.js': b'conflict'}))
        self.assertEqual((self.destination / 'custom.js').read_text(), 'my-script')
        self.assertEqual((self.destination / 'game.js').read_bytes(), b'new-first')

    def test_swap_failure_restores_package_and_cdn(self):
        build_wechat.refresh('first', self.candidate('first'))
        report = self.candidate('second')
        rename = Path.rename

        def failing_rename(path, target):
            if path == self.root / 'builds/work/second/workspace/cdn':
                raise OSError('simulated interruption')
            return rename(path, target)

        with patch.object(Path, 'rename', failing_rename):
            with self.assertRaisesRegex(OSError, 'simulated interruption'):
                build_wechat.refresh('second', report)
        self.assertEqual((self.destination / 'game.js').read_bytes(), b'new-first')
        self.assertEqual((self.cdn / 'remote/home/config.json').read_bytes(), b'new-assets-first')
        self.assertEqual(json.loads(build_wechat.STATE.read_text())['candidate'], 'first')

    def test_refuse_unmanaged_output_directory(self):
        self.destination.mkdir(parents=True)
        (self.destination / 'user.js').write_text('custom')
        with self.assertRaisesRegex(ValueError, 'ownership'):
            build_wechat.refresh('first', self.candidate('first'))
        self.assertEqual((self.destination / 'user.js').read_text(), 'custom')

    def test_incomplete_backup_never_changes_original_project(self):
        build_wechat.refresh('first', self.candidate('first', {'src/old.js': b'old'}))
        report = self.candidate('second')

        def fail_backup(source, target, *args, **kwargs):
            Path(target).mkdir()
            (Path(target) / 'game.js').write_text('incomplete-backup')
            raise OSError('simulated backup failure')

        with patch.object(shutil, 'copytree', fail_backup):
            with self.assertRaisesRegex(OSError, 'backup failure'):
                build_wechat.refresh('second', report)
        self.assertEqual((self.destination / 'game.js').read_bytes(), b'new-first')
        self.assertEqual((self.destination / 'src/old.js').read_bytes(), b'old')
        self.assertEqual((self.cdn / 'remote/home/config.json').read_bytes(), b'new-assets-first')

    def test_relative_template_link_survives_snapshot_and_is_idempotent(self):
        templates = self.root / 'builds/templates/wechatgame'
        templates.mkdir(parents=True)
        (templates / 'extra.js').write_text('custom')
        (self.root / 'games/xiaoyu-cocos').mkdir(parents=True)
        link = install(self.root)
        self.assertEqual(str(link.readlink()), '../../builds/templates')
        self.assertEqual(install(self.root), link)
        snapshot = self.root / 'snapshot'
        for folder in ['builds/templates', 'games/xiaoyu-cocos']:
            shutil.copytree(self.root / folder, snapshot / folder, symlinks=True)
        copied = install(snapshot)
        self.assertTrue(copied.resolve().is_relative_to(snapshot.resolve()))
        self.assertEqual((copied / 'wechatgame/extra.js').read_text(), 'custom')

    def test_refuse_to_replace_real_template_directory(self):
        (self.root / 'builds/templates/wechatgame').mkdir(parents=True)
        (self.root / 'games/xiaoyu-cocos/build-templates').mkdir(parents=True)
        with self.assertRaisesRegex(ValueError, 'real directory'):
            install(self.root)

    def test_startup_resources_are_checked_in_actual_packaged_bundle(self):
        # Regression guard for the DevTools startup failure: a source catalog
        # on disk is insufficient when resources.load's bundle is omitted.
        source_resources = self.root / 'games/xiaoyu-cocos/assets/resources'
        source_resources.mkdir(parents=True)
        (source_resources / 'source-catalog.json').write_text('{}')
        output = self.root / 'output'
        self.assertFalse(audit_wechat_candidate.startup_resources_present(output))
        bundle = output / 'assets/resources'
        bundle.mkdir(parents=True)
        config = bundle / 'config.hash.json'
        config.write_text(json.dumps({'paths': {'0': ['source-catalog', 0], '1': ['source-scenes', 0]}}))
        self.assertFalse(audit_wechat_candidate.startup_resources_present(output))
        config.write_text(json.dumps({'paths': {'0': ['source-catalog', 0], '1': ['source-scenes', 0],
                                                '2': ['effects/login-peek', 1]}}))
        self.assertTrue(audit_wechat_candidate.startup_resources_present(output))


if __name__ == '__main__':
    unittest.main(verbosity=2)
