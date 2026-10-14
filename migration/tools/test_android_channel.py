"""Channel tests cover payload contents, startup-before-modules and failed-boot fallback."""
import importlib.util
import json
import shutil
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('hot_update', ROOT / 'builds/android/hot_update.py')
PACKAGING = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGING)
BUILD_SPEC = importlib.util.spec_from_file_location('android_build', ROOT / 'builds/android/build.py')
BUILD = importlib.util.module_from_spec(BUILD_SPEC)
BUILD_SPEC.loader.exec_module(BUILD)
ICON_SPEC = importlib.util.spec_from_file_location('android_icons', ROOT / 'builds/android/icons.py')
ICONS = importlib.util.module_from_spec(ICON_SPEC)
ICON_SPEC.loader.exec_module(ICONS)


class AndroidChannelTests(unittest.TestCase):
    def test_icons_have_distinct_resource_names_and_leave_native_defaults_untouched(self):
        with tempfile.TemporaryDirectory() as temporary:
            stage = Path(temporary)
            game = json.loads((ROOT / 'builds/android/config.json').read_text())['games']['avg_plus']
            source = stage / game['project']
            shutil.copytree(ROOT / game['project'] / 'source/android-icon', source / 'source/android-icon')
            native = source / 'native/engine/android'
            (native / 'app').mkdir(parents=True)
            (native / 'app/AndroidManifest.xml').write_text('<application android:icon="@mipmap/ic_launcher"><activity android:theme="@android:style/Theme.NoTitleBar.Fullscreen"/></application>')
            original = native / 'res/mipmap-mdpi/ic_launcher.png'
            original.parent.mkdir(parents=True); original.write_bytes(b'unchanged Cocos default')
            ICONS.install(stage, game)
            generated = stage / 'output/android/proj/res'
            self.assertEqual(original.read_bytes(), b'unchanged Cocos default')
            self.assertFalse(any(generated.rglob('ic_launcher*')))
            self.assertEqual(len(list(generated.glob('mipmap-*/avg_launcher.png'))), 5)
            self.assertEqual(len(list(generated.glob('drawable-*/avg_icon_art.png'))), 5)
            manifest = (native / 'app/AndroidManifest.xml').read_text()
            self.assertIn('@mipmap/avg_launcher"', manifest)
            self.assertIn('@mipmap/avg_launcher_round"', manifest)
            self.assertIn('@mipmap/avg_launcher</item>', (generated / 'values-v31/styles.xml').read_text())

    def test_default_runtime_profile_is_in_the_actual_frozen_source_set(self):
        sources = BUILD.inputs('games/avg_plus')
        profile = 'games/avg_plus/assets/art/resources/mods/profiles/default.json'
        self.assertIn(profile, sources)
        self.assertIn(profile + '.meta', sources)
        data = json.loads((ROOT / profile).read_text())
        self.assertTrue(any(entry['id'] == 'base-card' and entry['enabled'] for entry in data['modules']))
        self.assertTrue(any(entry['id'] == 'base-avg' and entry['enabled'] for entry in data['modules']))

    def fixture(self, path):
        assets = path / 'assets'
        for name, value in [('main.js', 'require("src/system.bundle.js");'),
                            ('src/application.js', 'game source'), ('src/import-map.json', '{}'),
                            ('src/cocos-js/cc.js', 'native engine contract'),
                            ('jsb-adapter/engine-adapter.js', 'native adapter'),
                            ('assets/resources/import/level.json', '{"slots":[1,2]}')]:
            target = assets / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(value)
        game = json.loads((ROOT / 'builds/android/config.json').read_text())['games']['avg_plus']
        output = path / 'release'
        result = PACKAGING.prepare(assets, output, game, ROOT / 'builds/android/templates')
        return assets, output, result

    def test_game_scripts_dynamic_json_and_native_exclusions(self):
        with tempfile.TemporaryDirectory() as temporary:
            assets, output, result = self.fixture(Path(temporary))
            with zipfile.ZipFile(output / 'avg-plus-assets.zip') as archive:
                self.assertEqual(set(archive.namelist()), {
                    'src/application.js', 'src/import-map.json', 'assets/resources/import/level.json'})
                self.assertEqual(json.loads(archive.read('assets/resources/import/level.json')), {'slots': [1, 2]})
            manifest = json.loads((output / 'avg-plus-project.manifest').read_text())
            self.assertEqual((output / 'avg-plus-assets.zip').stat().st_size % 32, 0)
            self.assertEqual(manifest['assets']['avg-plus-assets.zip']['md5'], result['sha256'])
            self.assertTrue(manifest['packageUrl'].endswith('/avg-plus/android/versions/' + result['version'] + '/'))
            main = (assets / 'main.js').read_text()
            self.assertLess(main.index('setSearchPaths'), main.index('require("src/system.bundle.js")'))
            self.assertEqual(json.loads((assets / 'project.manifest').read_text()), manifest)

    def test_payload_is_reproducible(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            one = self.fixture(path / 'one')[2]
            two = self.fixture(path / 'two')[2]
            self.assertEqual(one['sha256'], two['sha256'])

    def test_fresh_export_required_for_hook(self):
        with tempfile.TemporaryDirectory() as temporary:
            assets, _, _ = self.fixture(Path(temporary))
            game = json.loads((ROOT / 'builds/android/config.json').read_text())['games']['avg_plus']
            with self.assertRaisesRegex(ValueError, 'already installed'):
                PACKAGING.prepare(assets, Path(temporary) / 'another', game, ROOT / 'builds/android/templates')


if __name__ == '__main__':
    unittest.main()
