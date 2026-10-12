"""Add feedback labels from the same pinned licensed font; retain all old glyphs."""
import copy
import hashlib
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'migration/.cache/python'))
from fontTools import subset
from fontTools.ttLib import TTFont

source = ROOT / 'games/xiaoyu-cocos/source/fonts/sources/LXGWWenKai-Regular-v1.522.ttf'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009'
target = ROOT / 'games/xiaoyu-cocos/assets/bundles/shared_boot_ui/assets/bootstrap_ui.ttf'
before = hashlib.sha256(target.read_bytes()).hexdigest()
baseline = TTFont(target, recalcTimestamp=False)
required = set(baseline.getBestCmap()) | set(map(ord, '震动：开关此设备不支持'))
font = TTFont(source, recalcTimestamp=False)
assert required <= set(font.getBestCmap())
assert font['head'].unitsPerEm == baseline['head'].unitsPerEm
options = subset.Options(); options.recalc_timestamp = False
subsetter = subset.Subsetter(options=options); subsetter.populate(unicodes=required); subsetter.subset(font)
font['name'] = copy.deepcopy(baseline['name'])
font['head'].created = baseline['head'].created; font['head'].modified = baseline['head'].modified
font.save(target)
assert required <= set(TTFont(target).getBestCmap())
catalog_path = ROOT / 'games/xiaoyu-cocos/assets/resources/source-catalog.json'
catalog = json.loads(catalog_path.read_text()); catalog['assets']['res://assets/bootstrap_ui.ttf']['decodedBytes'] = target.stat().st_size
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
record = {'item': 'M19.01', 'purpose': 'Haptic labels; old Unicode coverage retained',
          'source': str(source), 'sourceSHA256': hashlib.sha256(source.read_bytes()).hexdigest(),
          'beforeSHA256': before, 'afterSHA256': hashlib.sha256(target.read_bytes()).hexdigest(),
          'bytes': target.stat().st_size, 'codepoints': len(required),
          'license': 'games/xiaoyu-cocos/licenses/fonts/LXGWWenKai-OFL.txt'}
(ROOT / 'migration/reviews/M19-haptic-font.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'bytes':record['bytes'],'coverage':record['codepoints']}))
