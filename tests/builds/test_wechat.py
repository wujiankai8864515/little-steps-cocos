"""Verify repeated workspace replacement does not lose personal files or stale generated state."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'builds'))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'builds/wechatgame'))
import build as build_wechat
import audit as audit_wechat_candidate
from common import relocate_path, capture_inputs, require_current_inputs
from common import install_templates as install
from common import sha, audit_home_payload
from types import SimpleNamespace


class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        cache = self.root / 'migration/.cache/wechatgame'
        self.patches = [patch.object(build_wechat, key, value) for key, value in {
            'ROOT': self.root, 'CACHE': cache, 'STATE': cache / 'wechat-workspace.json',
            'DESTINATION': self.root / 'builds/wechatgame/project',
            'DIRECTORY': self.root / 'builds/wechatgame',
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
        source = self.root / 'migration/work' / name / 'output/wechatgame'
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
        self.assertTrue((self.root / 'migration/work/second/previous-wechatgame/src/old.hash.js').exists())

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
            if path == self.root / 'migration/work/second/workspace/cdn/remote':
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

    def test_real_template_mirror_survives_snapshot_and_tracks_latest_changes(self):
        templates = self.root / 'builds/wechatgame/templates'
        templates.mkdir(parents=True)
        (templates / 'extra.js').write_text('custom')
        (self.root / 'games/xiaoyu-cocos').mkdir(parents=True)
        mirror = install(self.root)
        self.assertFalse(mirror.is_symlink())
        self.assertEqual(install(self.root), mirror)
        (templates / 'extra.js').write_text('latest custom script')
        (mirror / 'obsolete.js').write_text('stale generated mirror')
        install(self.root)
        self.assertEqual((mirror / 'extra.js').read_text(), 'latest custom script')
        self.assertFalse((mirror / 'obsolete.js').exists())
        snapshot = self.root / 'snapshot'
        for folder in ['builds/wechatgame/templates', 'games/xiaoyu-cocos']:
            shutil.copytree(self.root / folder, snapshot / folder, symlinks=True)
        copied = install(snapshot)
        self.assertTrue(copied.resolve().is_relative_to(snapshot.resolve()))
        self.assertFalse(copied.is_symlink())
        self.assertEqual((copied / 'extra.js').read_text(), 'latest custom script')

    def test_refuse_to_replace_real_template_directory(self):
        (self.root / 'builds/wechatgame/templates').mkdir(parents=True)
        (self.root / 'games/xiaoyu-cocos/build-templates/wechatgame').mkdir(parents=True)
        with self.assertRaisesRegex(ValueError, 'real platform template directory'):
            install(self.root)

    def test_channel_tools_templates_and_personal_settings_stay_outside_generated_project(self):
        channel = self.destination.parent
        channel.mkdir(parents=True)
        (channel / 'build.py').write_text('platform processor')
        (channel / 'config.json').write_text('{"appid":"configured"}')
        (channel / 'project.private.config.json').write_text('{"personal":true}')
        (channel / 'templates').mkdir()
        (channel / 'templates/sdk.js').write_text('platform sdk')
        build_wechat.refresh('first', self.candidate('first'))
        self.assertEqual((channel / 'build.py').read_text(), 'platform processor')
        self.assertEqual((channel / 'templates/sdk.js').read_text(), 'platform sdk')
        self.assertEqual(json.loads((channel / 'project.config.json').read_text())['miniprogramRoot'], 'project/')
        self.assertEqual(json.loads((self.destination / 'project.config.json').read_text())['miniprogramRoot'], './')
        self.assertEqual((channel / 'project.private.config.json').read_text(), '{"personal":true}')
        self.assertFalse((self.destination / 'build.py').exists())
        self.assertFalse((self.destination / 'templates').exists())

    def test_historical_output_paths_resolve_without_editing_old_manifest(self):
        output = self.root / 'migration/work/old/output/wechatgame'
        output.mkdir(parents=True)
        recorded = self.root / 'builds/work/old/output/wechatgame'
        self.assertEqual(relocate_path(recorded, self.root), output)
        self.assertEqual(relocate_path(self.destination, self.root), self.destination)

    def test_latest_saved_changes_new_files_and_deleted_assets_invalidate_in_progress_build(self):
        assets = self.root / 'games/xiaoyu-cocos/assets'
        assets.mkdir(parents=True)
        game = assets / 'latest.ts'
        game.write_text('first saved version')
        manifest = {'sourceMode': 'local-working-copy', 'workingInputs': capture_inputs(self.root)}
        require_current_inputs(manifest, self.root)
        game.write_text('new uncommitted saved version')
        with self.assertRaisesRegex(ValueError, '已改变'):
            require_current_inputs(manifest, self.root)
        manifest['workingInputs'] = capture_inputs(self.root)
        require_current_inputs(manifest, self.root)
        (assets / 'new.png').write_bytes(b'new image')
        with self.assertRaisesRegex(ValueError, '已改变'):
            require_current_inputs(manifest, self.root)
        manifest['workingInputs'] = capture_inputs(self.root)
        game.unlink()
        with self.assertRaisesRegex(ValueError, '已改变'):
            require_current_inputs(manifest, self.root)

    def test_editor_caches_outputs_and_test_updates_do_not_mark_game_snapshot_stale(self):
        manifest = {'sourceMode': 'local-working-copy', 'workingInputs': capture_inputs(self.root)}
        for relative in ['games/xiaoyu-cocos/library/cache.json', 'games/xiaoyu-cocos/test/check.cjs',
                         'builds/wechatgame/project/game.js', 'builds/wechatgame/remote/home/config.json']:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('generated or test-only')
        require_current_inputs(manifest, self.root)
        require_current_inputs({'sourceMode': 'remote-readback'}, self.root)

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

    def test_native_refresh_clears_old_remote_resources_and_installs_subpackages(self):
        build_wechat.refresh('first', self.candidate('first'))
        report = self.candidate('native', {'subpackages/home/config.json': b'native-home',
                                          'subpackages/home/game.js': b'native-entry'})
        report['files'] = [f for f in report['files'] if not f['bucket'].startswith('remote/')]
        state = build_wechat.refresh('native', report)
        self.assertEqual((self.destination / 'subpackages/home/config.json').read_bytes(), b'native-home')
        self.assertFalse((self.cdn / 'remote/home/config.json').exists())
        self.assertEqual((self.root / 'migration/work/native/previous-remote/home/config.json').read_bytes(), b'new-assets-first')
        self.assertIn('subpackages/home/game.js', state['generatedFiles'])

    def test_home_budget_follows_native_subpackages_instead_of_remote_paths(self):
        project = self.root / 'games/xiaoyu-cocos'
        catalog = project / 'assets/resources/source-catalog.json'
        catalog.parent.mkdir(parents=True)
        catalog.write_text(json.dumps({'groups': {'home': {'depends_on': ['shared_room_visual']},
                                                'shared_room_visual': {'depends_on': []}}}))
        output = self.root / 'output'
        for name in ['home', 'shared_room_visual']:
            bundle = output / 'subpackages' / name
            bundle.mkdir(parents=True)
            (bundle / 'config.hash.json').write_text(json.dumps({'name': name, 'deps': []}))
            (bundle / 'original.png').write_bytes(b'original-pixels')
        report = audit_home_payload(project, output, [])
        self.assertTrue(report['passed'], report['errors'])
        self.assertEqual({b['directory'] for b in report['bundles']}, {'subpackages/home', 'subpackages/shared_room_visual'})

    def test_native_build_only_never_starts_a_server_or_updates_fixed_project(self):
        build_wechat.refresh('first', self.candidate('first'))
        report = self.candidate('second')
        report['rawLocalPackageBytes'] = 100
        record = self.root / 'migration/records/candidates/second.json'
        record.parent.mkdir(parents=True)
        record.write_text(json.dumps({'sourceMode': 'remote-readback', 'resourceMode': 'subpackage', 'resourceServer': ''}))
        (self.root / 'builds/wechatgame/config.json').write_text('{"server":"http://127.0.0.1:8794/"}')
        args = SimpleNamespace(serve_only=False, stage_existing=True, name='second', readback=None,
                               resource_mode=None, server=None, open=False, build_only=True)
        with patch.object(build_wechat, 'install'), patch.object(build_wechat, 'audit', return_value=report), \
             patch.object(build_wechat, 'ensure_server') as server, patch.object(build_wechat, 'refresh') as refresh:
            result = build_wechat.run(args)
        self.assertEqual(result['resourceMode'], 'subpackage')
        server.assert_not_called()
        refresh.assert_not_called()
        self.assertEqual((self.destination / 'game.js').read_bytes(), b'new-first')


if __name__ == '__main__':
    unittest.main(verbosity=2)
