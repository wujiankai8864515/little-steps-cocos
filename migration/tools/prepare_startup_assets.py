"""Prepare the isolated loading manifest and tiny font from approved sources."""
import copy
import hashlib
import json
import sys
import uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'migration/.cache/python'))
from fontTools import subset
from fontTools.ttLib import TTFont
assets=ROOT/'games/xiaoyu-cocos/assets'
source=assets/'bundles/shared_boot_ui/assets/bootstrap_ui.ttf'
upstream=ROOT/'games/xiaoyu-cocos/source/fonts/sources/LXGWWenKai-Regular-v1.522.ttf'
assert hashlib.sha256(upstream.read_bytes()).hexdigest()=='39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009'
font=TTFont(upstream,recalcTimestamp=False)
text='正在准备资源…游戏登录页面失败，请重试。'
required=set(map(ord,text));assert required<=set(font.getBestCmap())
names=copy.deepcopy(TTFont(source)['name']);options=subset.Options();options.recalc_timestamp=False
subsetter=subset.Subsetter(options=options);subsetter.populate(unicodes=required);subsetter.subset(font);font['name']=names
target=assets/'bundles/loading/entry/assets/loading_ui.ttf';font.save(target)
meta=json.loads(source.with_suffix('.ttf.meta').read_text());meta['uuid']=str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps:isolated-loading-font'));meta['files']=['.json','loading_ui.ttf'];target.with_suffix('.ttf.meta').write_text(json.dumps(meta,indent=2)+'\n')
catalog_path=assets/'resources/source-catalog.json';catalog=json.loads(catalog_path.read_text())
keys=['res://entry/assets/loading/ground_shadows.png','res://entry/assets/loading/native/actor_body.png','res://entry/assets/loading/native/actor_fin_mallet.png','res://entry/assets/loading/native/doll_rig.png']
images=[{k:v for k,v in catalog['assets'][key].items() if k in ['path','size','content','decodedBytes']} for key in keys]
for image,name in zip(images,['GroundShadows','Body','FinMallet','Doll']):image['name']=name
paper=catalog['assets']['res://entry/assets/backgrounds/loading_clean_bleed_720x1600.png']['procedural']
manifest={'images':images,'paper':paper,'reservedBytes':sum(i['decodedBytes'] for i in images)+128*288*8+target.stat().st_size}
p=assets/'bundles/loading/startup-manifest.json';p.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
base=json.loads((assets/'resources/source-catalog.json.meta').read_text());base['uuid']=str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps:isolated-loading-manifest'));p.with_suffix('.json.meta').write_text(json.dumps(base,indent=2)+'\n')
catalog['assets']['derived://startup/loading_ui.ttf']={'kind':'font','bundle':'loading','path':'entry/assets/loading_ui','decodedBytes':target.stat().st_size}
catalog['groups']['loading']['depends_on']=[]
catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
record={'item':'M20.01','loadingAssets':keys,'fontSourceSHA256':hashlib.sha256(upstream.read_bytes()).hexdigest(),'fontNameReferenceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'fontBytes':target.stat().st_size,'fontCodepoints':len(required),'reservedBytes':manifest['reservedBytes'],'sharedDependencies':[],'runtimeAcceptance':'pending'}
(ROOT/'migration/reviews/M20-isolated-loading-assets.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False))
