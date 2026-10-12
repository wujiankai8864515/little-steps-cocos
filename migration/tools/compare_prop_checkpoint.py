#!/usr/bin/env python3
"""Actual prop/drink screenshots, preserving the complete unaligned difference."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageStat
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--reference',required=True);p.add_argument('--cocos',required=True);p.add_argument('--name',required=True);p.add_argument('--label',required=True);p.add_argument('--kind',choices=['drink','table','doll-offer'],required=True);p.add_argument('--input-kind',choices=['fixed-step','real-pointer'],required=True);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    files=[Path(a.reference).resolve(),Path(a.cocos).resolve()];frames=[Image.open(f).convert('RGB') for f in files]
    assert all(f.size==(405,720) and len(f.getcolors(405*720))>1000 for f in frames)
    diff=ImageChops.difference(*frames);rois={'whole':[0,0,405,720]}
    rois.update({'actorAndBowl':[65,382,330,535],'mouthAndRim':[190,442,252,475],'eyes':[153,430,268,468]} if a.kind=='drink' else {'tableAttachmentsAndFloor':[0,270,405,700]} if a.kind=='table' else {'confirmation':[100,278,295,380],'doll':[340,413,405,487]})
    regions={}
    for key,rect in rois.items():
        stat=ImageStat.Stat(diff.crop(rect));regions[key]={'rect':rect,'meanAbsoluteRGB':sum(stat.mean)/3,'RMSRGB':sum(stat.rms)/3,'maximumChannelDifference':max(v[1] for v in stat.extrema)}
    board=Image.new('RGB',(1215,748),(246,243,236));draw=ImageDraw.Draw(board)
    for i,(label,frame) in enumerate(zip(['Godot / '+a.label,'Cocos / '+a.label,'Absolute difference / original intensity'],frames+[diff])):
        board.paste(frame,(405*i,28));draw.text((405*i+8,8),label,fill=(35,29,23))
    out=ROOT/'migration/reviews'/a.name;assert not out.with_suffix('.png').exists();board.save(out.with_suffix('.png'))
    record={'schema':1,'kind':a.kind,'inputKind':a.input_kind,'reference':{'path':str(files[0].relative_to(ROOT)),'sha256':sha(files[0])},'cocos':{'path':str(files[1].relative_to(ROOT)),'sha256':sha(files[1])},'comparison':{'path':str(out.with_suffix('.png').relative_to(ROOT)),'sha256':sha(out.with_suffix('.png')),'method':'Unaligned, unscaled, unrecolored405x720RGB screenshots; unamplified absolute difference'},'regions':regions,'status':'measured_full_parity_pending','limits':'Declared noon/ambient/plant rest. Fixed controller steps are distinct from physical pointer input; pointer frame timing and flower/particle phases differ. Remaining UI/raster differences and all pages/sizes/WeChat device acceptance remain pending.'}
    out.with_suffix('.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record,ensure_ascii=False))
if __name__=='__main__':main()
