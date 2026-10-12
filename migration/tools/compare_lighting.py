#!/usr/bin/env python3
"""Compare actual same-size screenshots without image alignment or correction."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageStat

ROOT=Path(__file__).resolve().parents[2]
REGIONS={'full':[0,0,405,720],'sky_glass':[73,4,124,61],'receiver_wall':[190,294,249,367],'floor':[219,618,300,687],'actor_face':[88,404,280,498],
    'left_plants':[0,75,34,308],'window_plants':[126,0,186,384],'shelf_plants':[260,52,398,143]}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--reference',required=True,type=Path);parser.add_argument('--cocos',required=True,type=Path);parser.add_argument('--hour',required=True,type=float);parser.add_argument('--name',required=True);parser.add_argument('--plants',choices=['unpaired','rest','checkpoint'],default='unpaired');parser.add_argument('--plant-time',type=float);parser.add_argument('--reference-log',type=Path,help='Actual Godot console evidence of plant phase and current shadow lighting');args=parser.parse_args()
    if (args.plants=='checkpoint')!=(args.plant_time is not None):parser.error('--plants checkpoint requires --plant-time, only checkpoint accepts it')
    if not all(c.isalnum() or c in '-_' for c in args.name):raise ValueError('Invalid comparison name')
    paths=[args.reference,args.cocos];a,b=[Image.open(p).convert('RGB') for p in paths]
    reference_console=None
    if args.reference_log:
        entries=json.loads(args.reference_log.read_text());entry=next((r for r in entries if 'Home plants frozen with current room lighting ' in r['message']),None)
        if entry is None or any(r['level'] in ['error','warn'] for r in entries):raise ValueError('Reference console missing corrected plant lighting checkpoint or contains errors')
        text=entry['message'];hour=float(re.search(r'"game_hour": ([0-9.eE+-]+)',text)[1]);phase=float(re.search(r'"phase": ([0-9.eE+-]+)',text)[1])
        expected_phase=0 if args.plants=='rest' else args.plant_time
        if hour!=args.hour or expected_phase is None or abs(phase-expected_phase)>1e-6:raise ValueError('Reference console hour/plant phase does not match comparison')
        reference_console={'path':str(args.reference_log.relative_to(ROOT)) if args.reference_log.is_absolute() else str(args.reference_log),'sha256':hashlib.sha256(args.reference_log.read_bytes()).hexdigest(),'gameHour':hour,'plantPhase':phase,'plantShadows':'refreshed after seeking hour; actual room context logged'}
    if a.size!=b.size or a.size!=(405,720):raise ValueError('This fixture requires two actual 405x720 screenshots; never resize inputs')
    rows=[]
    for name,box in REGIONS.items():
        d=ImageChops.difference(a.crop(box),b.crop(box));rows.append({'region':name,'rect':box,'meanAbsoluteRGB':sum(ImageStat.Stat(d).mean)/3,'maxRGB':max(v[1] for v in d.getextrema())})
    canvas=Image.new('RGB',(1215,748),(246,240,225));canvas.paste(a,(0,28));canvas.paste(b,(405,28));canvas.paste(ImageChops.difference(a,b),(810,28));draw=ImageDraw.Draw(canvas)
    reference_label='Godot QA / plants at rest' if args.plants=='rest' else f'Godot QA / plant phase {args.plant_time:g}s' if args.plants=='checkpoint' else 'Godot published / unpaired plant phase'
    for x,label in [(8,f'{reference_label} / hour {args.hour:g}'),(413,f'Cocos candidate / hour {args.hour:g}'),(818,'Absolute RGB difference / no scaling')]:draw.text((x,8),label,fill=(38,31,22))
    image=ROOT/'migration/qa'/f'{args.name}.png';canvas.save(image)
    report={'schema':1,'state':{'hour':args.hour,'viewport':[405,720],'actorPose':'zero pose in both declared fixtures; remaining face differences reported by pixel metrics','clock':'frozen','plantPhase':'zero phase, neutral joints, wind disabled in declared QA fixtures' if args.plants=='rest' else {'seconds':args.plant_time,'stepSeconds':1/60,'status':'both fixtures deterministically advanced then frozen'} if args.plants=='checkpoint' else 'not paired; original review-hour alone does not freeze plants'},
        'referenceConsole':reference_console,'plantShadowState':'verified against actual corrected reference console' if reference_console else 'not verified by this comparison; a clock/pose freeze alone does not refresh disabled plant shadows',
        'sourceFiles':[{'path':str(p.relative_to(ROOT)) if p.is_absolute() else str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths],
        'method':'Actual browser screenshots; no resize, alignment, blur or color adjustment. JPEG screenshot encoding included. Difference displayed at 1x without amplification.',
        'regions':rows,'acceptance':'pending; this fixed-pose comparison does not cover remaining imagery, all input flows, animated face/soft shadows, or WeChat devices','image':str(image.relative_to(ROOT))}
    image.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(rows))

if __name__=='__main__':main()
