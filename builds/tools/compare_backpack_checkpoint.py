#!/usr/bin/env python3
"""Measure actual equal-size backpack captures, preserving whole-frame gaps."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageStat
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--reference',required=True);p.add_argument('--cocos',required=True);p.add_argument('--name',required=True);p.add_argument('--label',required=True);p.add_argument('--region',choices=['hanging','worn','returning','offer'],default='hanging');p.add_argument('--input-kind',choices=['fixed-step','real-pointer'],default='fixed-step');a=p.parse_args()
    if not all(c.isalnum() or c in '-_' for c in a.name):raise ValueError('Invalid name')
    files=[Path(a.reference).resolve(),Path(a.cocos).resolve()];frames=[Image.open(f).convert('RGB') for f in files]
    assert all(f.size==(405,720) and len(f.getcolors(405*720))>1000 for f in frames),'Actual nonblank 405x720 captures required'
    diff=ImageChops.difference(*frames);regions={}
    rois={'whole':[0,0,405,720]};rois.update({'hangingBackpackAndShadows':[298,225,405,342]} if a.region=='hanging' else {'wornBackpack':[15,405,141,535],'wornBackpackAndActor':[12,370,333,555],'floorProjection':[0,505,405,630]})
    if a.region=='returning':rois['returningBackpackUnion']=[15,295,292,550]
    if a.region=='offer':rois['confirmationPaperTextChoices']=[100,278,295,380]
    for key,rect in rois.items():
        s=ImageStat.Stat(diff.crop(rect));regions[key]={'rect':rect,'meanAbsoluteRGB':sum(s.mean)/3,'RMSRGB':sum(s.rms)/3,'maximumChannelDifference':max(v[1] for v in s.extrema)}
    board=Image.new('RGB',(1215,748),(246,243,236));draw=ImageDraw.Draw(board)
    for i,(label,frame) in enumerate(zip(['Godot / '+a.label,'Cocos / '+a.label,'Absolute difference / original intensity'],frames+[diff])):
        board.paste(frame,(i*405,28));draw.text((i*405+8,8),label,fill=(35,29,23))
    out=ROOT/'builds/reviews'/a.name;board.save(out.with_suffix('.png'))
    record={'schema':1,'inputKind':a.input_kind,'reference':{'path':str(files[0].relative_to(ROOT)),'sha256':sha(files[0])},'cocos':{'path':str(files[1].relative_to(ROOT)),'sha256':sha(files[1])},'comparison':{'path':str(out.with_suffix('.png').relative_to(ROOT)),'sha256':sha(out.with_suffix('.png')),'method':'Actual unaligned, unscaled, unrecolored RGB screenshots; unamplified absolute difference'},'regions':regions,'status':'measurement_only_full_parity_pending','limits':('Declared clock/ambient/plant rest with actual browser pointer input; flowers/particles not synchronized. ' if a.input_kind=='real-pointer' else 'Declared fixed clock and actor/plant rest, original fixed-step '+a.region+' backpack state. ')+'JPEG/raster and unresolved UI differences remain visible. All sizes/pages, full travel and WeChat device acceptance pending.'}
    out.with_suffix('.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
