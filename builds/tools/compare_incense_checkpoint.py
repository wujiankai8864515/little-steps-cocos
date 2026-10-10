#!/usr/bin/env python3
"""Unmodified 405x720 engine captures, including unresolved whole-frame gaps."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageStat
ROOT=Path(__file__).resolve().parents[2]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--reference',required=True);p.add_argument('--cocos',required=True);p.add_argument('--name',required=True);args=p.parse_args()
    if not all(c.isalnum() or c in '-_' for c in args.name):raise ValueError('Invalid name')
    reference=Path(args.reference).resolve();candidate=Path(args.cocos).resolve()
    a=Image.open(reference).convert('RGB');b=Image.open(candidate).convert('RGB')
    assert a.size==b.size==(405,720),'Screenshots must remain at their actual equal viewport size'
    for frame in [a,b]:assert len(frame.getcolors(405*720))>1000,'Blank frame'
    difference=ImageChops.difference(a,b);regions={}
    for key,rect in {'whole':[0,0,405,720],'incenseSmokeAndRod':[85,468,122,600],'ceramicAndTableShadow':[76,590,141,635]}.items():
        stats=ImageStat.Stat(difference.crop(rect));regions[key]={'rect':rect,'meanAbsoluteRGB':sum(stats.mean)/3,'RMSRGB':sum(stats.rms)/3,'maximumChannelDifference':max(v[1] for v in stats.extrema)}
    board=Image.new('RGB',(1215,748),(246,243,236));draw=ImageDraw.Draw(board)
    for i,(title,frame) in enumerate([('Godot / incense / 2.0 seconds',a),('Cocos / incense / 2.0 seconds',b),('Absolute difference / original intensity',difference)]):board.paste(frame,(405*i,28));draw.text((405*i+8,8),title,fill=(35,29,23))
    output=ROOT/'builds/reviews'/args.name;board.save(output.with_suffix('.png'))
    record={'schema':1,'reference':{'path':str(reference.relative_to(ROOT)),'sha256':sha(reference)},'cocos':{'path':str(candidate.relative_to(ROOT)),'sha256':sha(candidate)},'comparison':{'path':str(output.with_suffix('.png').relative_to(ROOT)),'sha256':sha(output.with_suffix('.png')),'method':'Actual unaligned, unscaled, unrecolored RGB screenshots; unamplified difference'},'regions':regions,'status':'measurement_only_full_parity_pending','limits':'Explicit fixed-clock, isolated-storage ignition; original 1/30 steps and plants/actor at authored rest. Whole frame retains unported vase, articulated backpack and other outstanding product differences. Caption embolden, all lighting/size cases and WeChat GPU/device acceptance pending.'}
    output.with_suffix('.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
