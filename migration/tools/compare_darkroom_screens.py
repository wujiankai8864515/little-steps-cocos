#!/usr/bin/env python3
"""Strict original 405x720 full-page comparison, without alignment or correction."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageStat
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--native',required=True);p.add_argument('--cocos',required=True);p.add_argument('--name',required=True);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    files=[Path(a.native).resolve(),Path(a.cocos).resolve()];frames=[Image.open(f).convert('RGB') for f in files];assert all(f.size==(405,720) for f in frames);diff=ImageChops.difference(*frames)
    regions={}
    for name,rect in {'whole':[0,0,405,720],'exterior':[194,20,352,215],'room':[0,130,405,263],'lantern':[13,260,85,385],'doll':[126,263,286,457],'meter':[75,65,340,122],'needle':[0,520,200,635],'slipper':[206,520,405,635],'plants':[80,0,167,201]}.items():
        stat=ImageStat.Stat(diff.crop(rect));regions[name]={'rect':rect,'meanAbsoluteRGB':sum(stat.mean)/3,'RMSRGB':sum(stat.rms)/3,'maximumChannelDifference':max(v[1] for v in stat.extrema)}
    out=ROOT/'migration/reviews'/a.name;assert not out.with_suffix('.png').exists();board=Image.new('RGB',(1215,748),(246,243,236));draw=ImageDraw.Draw(board)
    for i,(name,frame)in enumerate(zip(['Godot / full Darkroom','Cocos / full Darkroom','Absolute difference / original intensity'],frames+[diff])):board.paste(frame,(i*405,28));draw.text((i*405+8,8),name,fill=(35,29,23))
    board.save(out.with_suffix('.png'));report={'native':{'path':str(files[0].relative_to(ROOT)),'sha256':sha(files[0])},'cocos':{'path':str(files[1].relative_to(ROOT)),'sha256':sha(files[1])},'board':{'path':str(out.with_suffix('.png').relative_to(ROOT)),'sha256':sha(out.with_suffix('.png'))},'regions':regions,'method':'405x720 untouched screenshots, no image alignment/scaling/recoloring; unamplified absolute RGB differences','status':'measured; strict acceptance pending','requiredState':'same clock, lamp, neutral doll, plant phase and720x1280 target; verify public logs separately','limits':['JPEG screenshot encoding and GPU/TTF rasterization differences retained','All buttons, motion/light/size matrix and WeChat device require separate evidence']};out.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['regions']))
if __name__=='__main__':main()
