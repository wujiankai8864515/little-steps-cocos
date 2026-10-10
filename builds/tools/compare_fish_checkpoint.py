#!/usr/bin/env python3
"""Compare equal-size, actual engine screenshots without registration or edits."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageStat
ROOT=Path(__file__).resolve().parents[2]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--reference',required=True);parser.add_argument('--cocos',required=True);parser.add_argument('--name',required=True);args=parser.parse_args()
    if not all(c.isalnum() or c in '-_' for c in args.name):raise ValueError('Invalid comparison name')
    a_path=Path(args.reference).resolve();b_path=Path(args.cocos).resolve();a=Image.open(a_path).convert('RGB');b=Image.open(b_path).convert('RGB');assert a.size==b.size
    assert a.width==405 and a.height==720,'Use the fixed browser viewport; never resize an evidence screenshot'
    diff=ImageChops.difference(a,b);metrics={}
    # Keep the projection region clear of the original's unported incense
    # caption/lid at x84..126 near y578..607. Whole-frame metrics retain them.
    for name,box in {'whole':[0,0,405,720],'liftedActor':[42,241,355,423],'matProjection':[130,512,310,578]}.items():
        roi=diff.crop(box);s=ImageStat.Stat(roi);r=ImageStat.Stat(roi.convert('L'));metrics[name]={'rect':box,'meanAbsoluteRGB':sum(s.mean)/3,'RMSRGB':sum(s.rms)/3,'maximumChannelDifference':max(x[1] for x in s.extrema),'meanAbsoluteLuma':r.mean[0]}
    for im in [a,b]:assert len(im.getcolors(im.width*im.height))>1000,'Blank frame is not a comparison'
    board=Image.new('RGB',(1215,748),(246,243,236));draw=ImageDraw.Draw(board)
    for i,(caption,im) in enumerate([('Godot: declared fixed input / 0.7s',a),('Cocos: declared fixed input / 0.7s',b),('Absolute difference: original intensity',diff)]):board.paste(im,(i*405,28));draw.text((i*405+10,8),caption,fill=(35,29,23))
    output=ROOT/'builds/reviews'/args.name;image=output.with_suffix('.png');image.parent.mkdir(parents=True,exist_ok=True);board.save(image)
    report={'schema':1,'scope':'Body grabbed at [350,800], moved to [380,560], 21 hold + 42 lift steps at 1/60; hour 12; plants rest','reference':{'path':str(a_path.relative_to(ROOT)),'sha256':digest(a_path)},'cocos':{'path':str(b_path.relative_to(ROOT)),'sha256':digest(b_path)},'comparison':{'path':str(image.relative_to(ROOT)),'sha256':digest(image),'method':'Actual 405x720 images, unaligned, unscaled, unrecolored; unamplified absolute RGB difference'},'regions':metrics,'status':'measurement_only_full_visual_acceptance_pending','excludedAcceptance':'Whole image includes unported articulated backpack, vase/incense, action marks and header differences. Tail/fin grabs, landing, physical drag, night and device acceptance remain pending.'}
    output.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
