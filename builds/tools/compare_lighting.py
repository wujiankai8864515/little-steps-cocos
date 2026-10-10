#!/usr/bin/env python3
"""Compare actual same-size screenshots without image alignment or correction."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT=Path(__file__).resolve().parents[2]
REGIONS={'full':[0,0,405,720],'sky_glass':[73,4,124,61],'receiver_wall':[190,294,249,367],'floor':[219,618,300,687],'actor_face':[88,404,280,498]}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--reference',required=True,type=Path);parser.add_argument('--cocos',required=True,type=Path);parser.add_argument('--hour',required=True,type=float);parser.add_argument('--name',required=True);args=parser.parse_args()
    if not all(c.isalnum() or c in '-_' for c in args.name):raise ValueError('Invalid comparison name')
    paths=[args.reference,args.cocos];a,b=[Image.open(p).convert('RGB') for p in paths]
    if a.size!=b.size or a.size!=(405,720):raise ValueError('This fixture requires two actual 405x720 screenshots; never resize inputs')
    rows=[]
    for name,box in REGIONS.items():
        d=ImageChops.difference(a.crop(box),b.crop(box));rows.append({'region':name,'rect':box,'meanAbsoluteRGB':sum(ImageStat.Stat(d).mean)/3,'maxRGB':max(v[1] for v in d.getextrema())})
    canvas=Image.new('RGB',(1215,748),(246,240,225));canvas.paste(a,(0,28));canvas.paste(b,(405,28));canvas.paste(ImageChops.difference(a,b),(810,28));draw=ImageDraw.Draw(canvas)
    for x,label in [(8,f'Godot published / hour {args.hour:g}'),(413,f'Cocos candidate / hour {args.hour:g}'),(818,'Absolute RGB difference / no scaling')]:draw.text((x,8),label,fill=(38,31,22))
    image=ROOT/'builds/qa'/f'{args.name}.png';canvas.save(image)
    report={'schema':1,'state':{'hour':args.hour,'viewport':[405,720],'actorPose':'zero pose in both declared fixtures; face shader still differs','clock':'frozen'},
        'sourceFiles':[{'path':str(p.relative_to(ROOT)) if p.is_absolute() else str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths],
        'method':'Actual browser screenshots; no resize, alignment, blur or color adjustment. JPEG screenshot encoding included. Difference displayed at 1x without amplification.',
        'regions':rows,'acceptance':'pending; missing source plants, shadow projections, UI, face and articulated bag prevent full parity','image':str(image.relative_to(ROOT))}
    image.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows))

if __name__=='__main__':main()
