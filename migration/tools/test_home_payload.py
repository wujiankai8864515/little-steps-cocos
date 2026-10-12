import json
import tempfile
import unittest
from pathlib import Path
from audit_home_payload import HOME_LIMIT, audit_home_payload


class HomePayloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project, self.output = self.root / 'project', self.root / 'output'
        self.groups = {'home': {'depends_on': ['core_code', 'shared_boot_ui', 'shared_room_visual']},
                       'core_code': {}, 'shared_boot_ui': {}, 'shared_room_visual': {}}
        self.remote = ['home', 'shared_room_visual']
        for name in self.groups:
            self.bundle(name)
        self.save()

    def save(self):
        path = self.project / 'assets/resources/source-catalog.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({'groups': self.groups}))

    def bundle(self, name, deps=()):
        root = self.output / ('remote' if name in self.remote else 'assets') / name
        root.mkdir(parents=True, exist_ok=True)
        (root / 'config.hash.json').write_text(json.dumps({'name': name, 'deps': list(deps)}))
        return root

    def audit(self):
        return audit_home_payload(self.project, self.output, self.remote)

    def test_exact_boundary_counts_metadata_shared_once_and_excludes_boot(self):
        initial = self.audit()['rawDeferredBytes']
        for name in ['core_code', 'shared_boot_ui']:
            with (self.bundle(name) / 'large.bin').open('wb') as stream:
                stream.truncate(HOME_LIMIT)
        self.groups['home']['depends_on'].append('shared_room_visual')
        self.save()
        with (self.bundle('home') / 'art.png').open('wb') as stream:
            stream.truncate(HOME_LIMIT - initial)
        self.assertTrue(self.audit()['passed'])
        self.assertEqual(self.audit()['rawDeferredBytes'], HOME_LIMIT)
        with (self.bundle('home') / 'art.png').open('ab') as stream:
            stream.write(b'X')
        result = self.audit()
        self.assertFalse(result['passed'])
        self.assertEqual(result['excessBytes'], 1)

    def test_local_home_still_counts_and_creator_dependencies_cannot_hide(self):
        source = self.output / 'remote/home'
        source.rename(self.output / 'assets/home')
        self.remote.remove('home')
        self.groups['photo_visual'] = {}
        self.bundle('photo_visual')
        self.bundle('home', ['photo_visual'])
        self.save()
        result = self.audit()
        self.assertFalse(result['passed'])
        self.assertEqual(result['forbiddenDependencies'], ['photo_visual'])
        self.assertIn('home', [row['name'] for row in result['bundles']])

    def test_missing_unknown_and_cycles_fail_closed(self):
        self.groups['home']['depends_on'].append('missing')
        self.save()
        self.assertIn('Unknown', self.audit()['errors'][0])
        self.groups['missing'] = {'depends_on': ['home']}
        self.save()
        self.assertIn('Cyclic', self.audit()['errors'][0])
        self.groups['missing'] = {}
        self.save()
        self.assertFalse(self.audit()['passed'])
        self.assertIn('Expected one output', self.audit()['errors'][0])


if __name__ == '__main__':
    unittest.main()
