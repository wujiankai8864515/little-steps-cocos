import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'builds/wechatgame'))
from isolation import finalize
from startup import install_extras

class LoadingIsolationTests(unittest.TestCase):
    def fixture(self,root):
        output=root/'output/wechatgame';(output/'src/assets/plugins').mkdir(parents=True)
        (output/'subpackages/framework_code').mkdir(parents=True)
        templates=root/'builds/wechatgame/templates';templates.mkdir(parents=True)
        (templates/'platform.js').write_text('module.exports = function() {};')
        (output/'src/assets/plugins/travel-core.abcde.js').write_text('globalThis.LittleStepsCore = {};')
        (output/'src/settings.abcde.json').write_text(json.dumps({'assets':{'projectBundles':['runtime_data']},'plugins':{'jsList':['assets/plugins/travel-core.abcde.js']}}))
        (output/'application.abcde.js').write_text("const path='src/settings.abcde.json';")
        (output/'game.js').write_text("System.import('./application.abcde.js');")
        return output
    def test_framework_moves_byte_identically_out_of_startup_and_generated_references_remain_valid(self):
        with tempfile.TemporaryDirectory() as folder:
            output=self.fixture(Path(folder));install_extras(output);result=finalize(output)
            settings=next((output/'src').glob('settings*.json'));self.assertEqual(json.loads(settings.read_text())['plugins']['jsList'],[])
            application=next(output.glob('application.*.js'));self.assertIn(settings.name,application.read_text());self.assertIn(application.name,(output/'game.js').read_text())
            module=(output/'runtime-framework.js').read_text()
            self.assertTrue(module.startswith('module.exports = '));self.assertFalse((output/'runtime-framework.json').exists())
            manifest=json.loads(module.removeprefix('module.exports = ').strip().removesuffix(';'))
            self.assertEqual((output/manifest['scripts'][0]).read_text(),'globalThis.LittleStepsCore = {};')
            self.assertTrue((output/manifest['platform']).is_file());self.assertFalse((output/'platform.js').exists());self.assertTrue(result['loadingFirstDrawBeforeRuntime'])
    def test_missing_channel_adapter_fails_before_mutating_creator_output(self):
        with tempfile.TemporaryDirectory() as folder:
            output=self.fixture(Path(folder))
            before={str(p.relative_to(output)):p.read_bytes() for p in output.rglob('*') if p.is_file()}
            with self.assertRaisesRegex(ValueError,'Missing channel platform'):finalize(output)
            self.assertEqual(before,{str(p.relative_to(output)):p.read_bytes() for p in output.rglob('*') if p.is_file()})

if __name__=='__main__':unittest.main()
