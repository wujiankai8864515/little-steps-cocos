"""Meaningful package gates for the new mapped boss channel."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('boss_channel', ROOT / 'builds/wechatgame/build_game.py')
channel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(channel)


class BossChannel(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.output = Path(self.temp.name)
        self.config = json.loads((ROOT / 'builds/wechatgame/games/boss.json').read_text())
        self.write('project.config.json', {'appid': self.config['appid']})
        self.write('game.json', {'deviceOrientation': 'portrait', 'subpackages': [{'name': 'company_' + str(i), 'root': 'subpackages/company_' + str(i)} for i in range(1, 6)]})
        self.write('src/settings.json', {'assets': {'remoteBundles': []}})
        (self.output / 'game.js').write_text('require("./application.js");')
        (self.output / 'open-data').mkdir(); (self.output / 'open-data/index.js').write_text('// real friend context')
        for i in range(1, 6):
            folder = self.output / 'subpackages' / ('company_' + str(i)); folder.mkdir(parents=True); (folder / 'index.js').write_text('0')

    def tearDown(self): self.temp.cleanup()

    def write(self, path, data):
        target = self.output / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(json.dumps(data))

    def test_native_package_is_small_and_its_validation_never_claims_device_success(self):
        report = channel.audit(self.output, self.config)
        self.assertTrue(all(report['checks'].values()))
        self.assertEqual(report['device'], 'pending-actual-device')
        self.assertEqual(report['totalBytes'], sum(report['sizes'].values()))

    def test_foreign_game_appid_is_rejected(self):
        self.write('project.config.json', {'appid': 'wx0000000000000000'})
        self.assertFalse(channel.audit(self.output, self.config)['checks']['correctAppid'])

    def test_native_delivery_rejects_remote_resource_dependencies(self):
        self.write('src/settings.json', {'assets': {'remoteBundles': ['company_1']}})
        self.assertFalse(channel.audit(self.output, self.config)['checks']['noRemoteBundle'])

    def test_main_and_each_subpackage_have_independent_byte_budgets(self):
        self.config['limits']['mainBytes'] = 1
        self.config['limits']['subpackageBytes'] = 0
        checks = channel.audit(self.output, self.config)['checks']
        self.assertFalse(checks['mainWithin4MB']); self.assertFalse(checks['eachSubpackageWithin4MB'])

    def test_wrong_orientation_and_missing_friend_context_are_rejected(self):
        self.write('game.json', {'deviceOrientation': 'landscape', 'subpackages': []})
        (self.output / 'open-data/index.js').unlink()
        checks = channel.audit(self.output, self.config)['checks']
        self.assertFalse(checks['portrait']); self.assertFalse(checks['nativeSubpackages']); self.assertFalse(checks['friendContextPresent'])

    def test_input_fingerprint_changes_when_saved_asset_changes(self):
        project = self.output / 'games/boss'; (project / 'assets').mkdir(parents=True); (project / 'settings').mkdir()
        (project / 'assets/Boot.ts').write_text('first')
        config = self.output / 'config.json'; config.write_text('{}')
        templates = self.output / 'templates'; templates.mkdir()
        old = channel.ROOT; channel.ROOT = self.output
        try:
            before = channel.inputs(project, config, templates)
            (project / 'assets/Boot.ts').write_text('second')
            self.assertNotEqual(before, channel.inputs(project, config, templates))
        finally: channel.ROOT = old

    def test_unconfigured_game_fails_before_creator_and_never_falls_back(self):
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'builds/build.py'), 'wechatgame', '--game', 'unconfigured-boss-test'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0); self.assertIn('No WeChat packaging configuration', result.stderr)

    def test_original_art_pixels_remain_traced_and_templates_are_separate_from_xiaoyu(self):
        manifest = json.loads((ROOT / 'games/boss/source/provenance.json').read_text())
        for asset in manifest['assets']:
            self.assertEqual(asset['sha256'], channel.digest(ROOT / 'games/boss' / asset['path']))
        self.assertTrue(self.config['templates'].startswith('builds/wechatgame/game-templates/'))
        self.assertFalse((ROOT / 'builds/wechatgame/templates/boss').exists())


if __name__ == '__main__': unittest.main()
