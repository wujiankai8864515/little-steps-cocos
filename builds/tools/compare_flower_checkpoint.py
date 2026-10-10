#!/usr/bin/env python3
"""Compare unmodified equal-size engine screenshots, including remaining gaps."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageStat
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--reference',required=True);p.add_argument('--cocos',required=True);p.add_argument('--name',required=True);p.add_argument('--state',required=True);args=p.parse_args()
    if not all(c.isalnum() or c in '-_' for c in args.name):raise ValueError('Invalid name')
    reference=Path(args.reference).resolve();candidate=Path(args.cocos).resolve();a=Image.open(reference).convert('RGB');b=Image.open(candidate).convert('RGB');assert a.size==b.size==(405,720)
    for frame in [a,b]:assert len(frame.getcolors(405*720))>1000,'Blank frame'
    diff=ImageChops.difference(a,b);regions={}
    for name,rect in {'whole':[0,0,405,720],'bouquetAndVase':[20,478,87,628],'vaseAndTableShadow':[17,591,87,635]}.items():
        s=ImageStat.Stat(diff.crop(rect));regions[name]={'rect':rect,'meanAbsoluteRGB':sum(s.mean)/3,'RMSRGB':sum(s.rms)/3,'maximumChannelDifference':max(v[1] for v in s.extrema)}
    board=Image.new('RGB',(1215,748),(246,243,236));d=ImageDraw.Draw(board)
    for i,(title,frame) in enumerate([('Godot / '+args.state,a),('Cocos / '+args.state,b),('Absolute difference / original intensity',diff)]):board.paste(frame,(405*i,28));d.text((405*i+8,8),title,fill=(35,29,23))
    out=ROOT/'builds/reviews'/args.name;board.save(out.with_suffix('.png'))
    record={'schema':1,'state':args.state,'reference':{'path':str(reference.relative_to(ROOT)),'sha256':sha(reference)},'cocos':{'path':str(candidate.relative_to(ROOT)),'sha256':sha(candidate)},'comparison':{'path':str(out.with_suffix('.png').relative_to(ROOT)),'sha256':sha(out.with_suffix('.png')),'method':'Actual unaligned, unscaled, unrecolored equal 405x720 RGB captures; unamplified absolute difference'},'regions':regions,'status':'measurement_only_full_parity_pending','limits':'Explicit earned-time isolated-storage pose fixture; captures are separate wall times. Whole frame retains backpack articulation, HUD details and other unresolved product differences. Godot Line2D versus Cocos Graphics tessellation/AA, all time/size/interaction cases and WeChat device pending.'}
    out.with_suffix('.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'state':args.state,'regions':regions}))
if __name__=='__main__':main()
