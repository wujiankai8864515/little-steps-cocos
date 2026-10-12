#!/usr/bin/env python3
"""Unaligned native/Cocos isolated doll screenshots, retain every difference."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageStat
ROOT=Path(__file__).resolve().parents[2]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--native',required=True);p.add_argument('--cocos',required=True);p.add_argument('--name',required=True);p.add_argument('--cocos-target',required=True,choices=['main','offscreen']);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    files=[Path(a.native).resolve(),Path(a.cocos).resolve()];frames=[Image.open(f).convert('RGB') for f in files]
    assert all(f.size==(405,720) for f in frames);diff=ImageChops.difference(*frames)
    regions={}
    for name,rect in {'whole':[0,0,405,720],'doll':[126,260,287,460],'head':[148,268,275,356],'bow':[155,350,243,410],'feet':[130,393,272,454]}.items():
        stat=ImageStat.Stat(diff.crop(rect));regions[name]={'rect':rect,'meanAbsoluteRGB':sum(stat.mean)/3,'RMSRGB':sum(stat.rms)/3,'maximumChannelDifference':max(v[1] for v in stat.extrema)}
    board=Image.new('RGB',(1215,748),(246,243,236));draw=ImageDraw.Draw(board)
    for i,(name,frame) in enumerate(zip(['Godot / isolated frame159','Cocos / isolated frame159','Absolute difference / original intensity'],frames+[diff])):
        board.paste(frame,(i*405,28));draw.text((i*405+8,8),name,fill=(35,29,23))
    out=ROOT/'migration/reviews'/a.name;assert not out.with_suffix('.png').exists();board.save(out.with_suffix('.png'))
    target='Both720x1280 offscreen targets on405x720 viewport' if a.cocos_target=='offscreen' else 'Native720x1280 offscreen target; Cocos draws directly into405x720 main buffer; sampling mismatch remains unverified'
    report={'kind':'Declared isolated continuous doll skin/render; not full Darkroom acceptance','native':{'path':str(files[0].relative_to(ROOT)),'sha256':sha(files[0])},'cocos':{'path':str(files[1].relative_to(ROOT)),'sha256':sha(files[1]),'target':a.cocos_target},'board':{'path':str(out.with_suffix('.png').relative_to(ROOT)),'sha256':sha(out.with_suffix('.png'))},'method':'405x720 original screenshots, no alignment/scaling/recoloring, unamplified absolute RGB difference','regions':regions,'status':'measured; strict whole-game parity pending','limits':['Declared fixed160-frame APIs and fixed tint/background; not physical doll input',target,'Screenshot encoding, GPU texture sampling and residual skin/raster differences retained','Other expressions, lamp/daylight, dissolve/spawn, all pages and WeChat device pending']}
    out.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'board':report['board'],'regions':regions}))
if __name__=='__main__':main()
