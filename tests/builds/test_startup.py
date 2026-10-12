import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'builds/wechatgame'))
from startup import finalize


class EarlyLoadingTest(unittest.TestCase):
    def test_md5_entry_preserves_generated_paths_and_initializes_before_systemjs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = "require('./adapter.123ab.js');\nconst firstScreen = require('./first-screen.123ab.js');\nrequire('src/system.abc.js');\nfirstScreen.start('default', 'false', 'true').then(()=>{});"
            (root / 'game.js').write_text(source)
            finalize(root)
            result = (root / 'game.js').read_text()
            self.assertIn("require('./first-screen.123ab.js')", result)
            self.assertLess(result.index("firstScreen.start("), result.index("require('src/system"))
            self.assertEqual(result.count("firstScreen.start('default', 'false', 'true')"), 2)

    def test_unknown_entry_is_rejected_without_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'game.js'
            path.write_text('unknown new entry')
            with self.assertRaises(ValueError):finalize(root)
            self.assertEqual(path.read_text(), 'unknown new entry')
