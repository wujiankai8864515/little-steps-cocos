#!/usr/bin/env python3
"""Preserve native padded polygons/triangles and source float32 fit order."""
import hashlib,json,struct,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project/home/secondary/articulated_backpack.gd'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def f32(v):return struct.unpack('<f',struct.pack('<f',v))[0]
def main():
    fixture=ROOT/'migration/oracles/approved-backpack-native.json';oracle=json.loads(fixture.read_text());source_record=json.loads((ROOT/'migration/records/M04-backpack-flow.json').read_text());expected=next(x['sha256'] for x in source_record['originalSources'] if x['path']==oracle['provenance']['source']);assert sha(SOURCE)==expected,'Original fitted contour source changed; capture a fresh native oracle'
    data=[]
    for p in oracle['parts']:
        fitted=[]
        for x,y in p['source']:
            shift=22.0
            if p['key']=='near_band':shift=22*max(0,min(1,(840-y)/540)) if y<840 else 16*max(0,min(1,(y-840)/323))
            elif p['key']=='lower_return':shift=22*(1-max(0,min(1,(x-700)/420)))
            fitted.append([f32(x+f32(shift/.18)),y])
        assert len(p['indices'])==(len(fitted)-2)*3 and all(0<=i<len(fitted) for i in p['indices'])
        payload=b''.join(struct.pack('<f',v) for at in p['source']+fitted for v in at)+b''.join(struct.pack('<H',v) for v in p['indices']);fingerprint=2166136261
        for byte in payload:fingerprint=((fingerprint^byte)*16777619)&0xffffffff
        assert fingerprint==oracle['nativeFNV1a32'][p['key']],f"Native mesh bytes differ: {p['key']}"
        data.append({'key':p['key'],'source':[v for at in p['source'] for v in at],'fitted':[v for at in fitted for v in at],'indices':p['indices']})
    path=ROOT/'games/xiaoyu-cocos/assets/game/ApprovedBackpackData.ts';path.write_text('// Generated from actual native Godot padded polygons / fitted triangles.\n// Reproduce with migration/tools/import_approved_backpack.py. No new artwork.\nexport const APPROVED_BACKPACK_DATA='+json.dumps(data,separators=(',',':'))+';\n')
    meta=path.with_suffix('.ts.meta');meta.write_text(json.dumps({'ver':'4.0.24','importer':'typescript','imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps-cocos/game/ApprovedBackpackData.ts')),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
    record={'schema':1,'source':{'path':oracle['provenance']['source'],'sha256':sha(SOURCE)},'oracle':{'path':str(fixture.relative_to(ROOT)),'sha256':sha(fixture),'provenance':oracle['provenance']},'output':{'path':str(path.relative_to(ROOT)),'sha256':sha(path)},'method':'Native Geometry2D padded contours and fitted triangulation; exact original float32 Vector2 fit order','nativeFNV1a32Verified':oracle['nativeFNV1a32'],'parts':len(data),'vertices':sum(len(x['fitted'])//2 for x in data),'indices':sum(len(x['indices']) for x in data),'limits':'Native mesh transfer, not complete worn raster/input/device acceptance'}
    (ROOT/'migration/records/M04-approved-backpack-source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record))
if __name__=='__main__':main()
