#!/usr/bin/env python3
"""Check original packed masks and both raw RG data channels independently."""
import json
from pathlib import Path
from PIL import Image
from godot_binary import read_resource
from import_godot_assets import ASSETS,ROOT,SOURCE,PROJECT,sha

def main():
    report=json.loads((ROOT/'builds/records/M02-bitmap-transfer.json').read_text());catalog=json.loads((ASSETS/'resources/source-catalog.json').read_text())['assets']
    for row in report['bitmaps']:
        resource=row['resource'];base=resource.split('::')[0];index=int(resource.split('::')[1]) if '::' in resource else -1
        original=read_resource((PROJECT/base.removeprefix('res://')).read_bytes())['resources'][index]['properties']['data']
        spec=catalog[resource];transferred=json.loads((ASSETS/'bundles'/spec['bundle']/(spec['path']+'.json')).read_text());assert transferred['size']==original['size']
        assert sha(original['data'])==row['sourcePackedBits256']
        restored=bytearray(len(original['data']));w,h=transferred['size']
        for y,ranges in enumerate(transferred['rows']):
            assert len(ranges)%2==0
            end=0
            for i in range(0,len(ranges),2):
                a,b=ranges[i:i+2];assert end<=a<b<=w;end=b
                for x in range(a,b):offset=y*w+x;restored[offset//8]|=1<<(offset%8)
        assert restored==original['data'],resource
    for row in report['binaryImages']:
        source=read_resource((PROJECT/row['resource'].removeprefix('res://')).read_bytes())['resources'][0]['properties']['data'];spec=catalog[row['resource']]
        path=ASSETS/'bundles'/spec['bundle']/(spec['path'].removesuffix('/texture')+'.png');pixel=Image.open(path).convert('RGBA').tobytes()
        assert Image.open(path).size==(source['width'],source['height'])
        assert pixel[0::4]==source['data'][0::2] and pixel[1::4]==source['data'][1::2]
        assert pixel[2::4]==b'\0'*(source['width']*source['height']) and pixel[3::4]==b'\xff'*(source['width']*source['height'])
        meta=json.loads(Path(str(path)+'.meta').read_text())['subMetas']['6c48a']['userData'];assert meta['minfilter']==meta['magfilter']=='nearest'
    print(json.dumps({'bitMaps':len(report['bitmaps']),'rawRGTextures':len(report['binaryImages']),'everySourceBitAndChannelExact':True}))

if __name__=='__main__':main()
