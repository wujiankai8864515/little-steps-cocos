#!/usr/bin/env python3
"""Transfer every original CTEX mip image without regeneration or lossy encoding."""
import hashlib,io,json,struct,sys,uuid
from pathlib import Path
from PIL import Image
from freeze_godot_plants import read_pack
ROOT=Path(__file__).resolve().parents[2]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def main():
    pack=ROOT/'migration/work/godot-reference-noon-v1/web/packs/house.pck';raw=pack.read_bytes();entries=read_pack(raw)[1];native=next(e for e in entries if e['path'].startswith('.godot/imported/home_worn_bag_pixels.png-'));data=native['data']
    assert data[:4]==b'GST2' and struct.unpack_from('<I',data,36)[0]==2
    count=struct.unpack_from('<I',data,44)[0]+1;assert count==11
    project=ROOT/'games/xiaoyu-cocos';base=project/'assets/bundles/home/travel/assets/home_worn_bag_pixels.png';original=Image.open(base).convert('RGBA');catalog=project/'assets/resources/source-catalog.json';manifest=json.loads(catalog.read_text());key='res://travel/assets/home_worn_bag_pixels.png';spec=manifest['assets'][key];previous=json.loads(json.dumps(spec))
    levels=[];pos=52;resources=[]
    for i in range(count):
        size=struct.unpack_from('<I',data,pos)[0];pos+=4;payload=data[pos:pos+size];pos+=size;assert len(payload)==size and payload.startswith(b'RIFF');image=Image.open(io.BytesIO(payload)).convert('RGBA');assert image.size==(max(1,1254>>i),)*2
        if i==0:
            rect=previous['content']
            if rect==[0,0,1254,1254]:assert image.tobytes()==original.tobytes()
            else:assert image.crop((rect[0],rect[1],rect[0]+rect[2],rect[1]+rect[3])).tobytes()==original.tobytes(),'Original base crop pixels changed'
            path=base
        else:
            path=base.with_name(f'home_worn_bag_pixels_mip{i}.png');resource=f'native-mip:{key}:{i}';resources.append(resource)
            manifest['assets'][resource]={'kind':'image','bundle':'home','path':f'travel/assets/home_worn_bag_pixels_mip{i}','size':list(image.size),'decodedBytes':image.width*image.height*8,'provenance':'Exact original CTEX mip pixels; image decode plus texture upload reserved'}
            identity=str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps-cocos/native-mip/'+str(i)))
            meta={'ver':'1.0.27','importer':'image','imported':True,'uuid':identity,'files':['.json','.png'],'subMetas':{},'userData':{'type':'raw','hasAlpha':True,'fixAlphaTransparencyArtifacts':False}}
            path.with_suffix('.png.meta').write_text(json.dumps(meta,indent=2)+'\n')
        image.save(path,optimize=True);levels.append({'level':i,'size':list(image.size),'nativeEncodedSHA256':sha(payload),'pixelRGBA256':sha(image.tobytes()),'output':str(path.relative_to(ROOT)),'outputSHA256':sha(path.read_bytes()),'encodedBytes':path.stat().st_size})
    assert pos==len(data),'Unexpected native mip trailing data'
    spec['content']=[0,0,1254,1254];spec['decodedBytes']=1254*1254*4;spec['mipResources']=resources
    # Base GPU mip allocation is accounted by the image decode/upload reservations above.
    catalog.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
    meta=base.with_suffix('.png.meta');m=json.loads(meta.read_text());m['subMetas']['6c48a']['userData']['mipfilter']='linear';meta.write_text(json.dumps(m,ensure_ascii=False,separators=(',',':'))+'\n')
    record={'schema':1,'sourcePack':{'path':str(pack.relative_to(ROOT)),'sha256':sha(raw)},'native':{'path':native['path'],'sha256':sha(data),'levels':count,'encoding':'Original lossless WebP mip payloads decoded independently'},'originalBaseSpec':previous,'newBaseSpec':spec,'levels':levels,'additionalReservedBytes':sum(manifest['assets'][r]['decodedBytes'] for r in resources)+spec['decodedBytes']-previous['decodedBytes'],'limits':'Exact original mip pixels uploaded through ImageAsset/Texture2D; actual renderer/device/filter and all-size parity still require verification'}
    (ROOT/'migration/records/M04-backpack-mipmap-source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'levels':count,'additionalReservedBytes':record['additionalReservedBytes'],'pngBytes':sum(x['encodedBytes'] for x in levels)}))
if __name__=='__main__':main()
