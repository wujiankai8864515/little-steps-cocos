#!/usr/bin/env python3
"""Unaltered120-step eye frames; isolate spring, matrix and pupil-domain evidence."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops,ImageDraw,ImageStat
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def trace(path):return json.loads(next(e['message'].split('drag gaze checkpoint ',1)[1] for e in json.loads(path.read_text()) if 'drag gaze checkpoint ' in e['message']))
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--reference',required=True);p.add_argument('--cocos',required=True);p.add_argument('--native-trace',required=True);p.add_argument('--cocos-trace',required=True);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    ap=Path(a.reference).resolve();bp=Path(a.cocos).resolve();nt=Path(a.native_trace).resolve();ct=Path(a.cocos_trace).resolve();native=trace(nt);cocos=trace(ct);assert native['steps']==cocos['steps']==120 and native['target']==cocos['target']==[619,528]
    im1=Image.open(ap).convert('RGB');im2=Image.open(bp).convert('RGB');assert im1.size==im2.size==(405,720)
    for im in [im1,im2]:assert len(im.getcolors(405*720))>1000
    diff=ImageChops.difference(im1,im2);regions={}
    for name,rect in {'whole':[0,0,405,720],'leftPupil':[165,442,197,467],'rightPupil':[234,423,263,448],'face':[140,405,281,483]}.items():
        s=ImageStat.Stat(diff.crop(rect));regions[name]={'rect':rect,'meanAbsoluteRGB':sum(s.mean)/3,'RMSRGB':sum(s.rms)/3,'maximumChannelDifference':max(x[1] for x in s.extrema)}
    bodyGaze={key:max(abs(x-y) for x,y in zip(native['gaze'][key],cocos['gaze'][key])) for key in ['left','right','left_velocity','right_velocity','target_world']}
    centers=[[300.553125,190.35],[421.7,155.33125]];sources=[[322.5,176],[435.5,143.8]]
    pupilOffsets=[[cocos['pupils'][i][j]-(centers[i][j]-sources[i][j]) for j in range(2)] for i in range(2)];pupilError=max(abs(pupilOffsets[i][j]-native['pupils'][i][j]) for i in range(2) for j in range(2))
    board=Image.new('RGB',(1215,748),(246,243,236));draw=ImageDraw.Draw(board)
    for i,(caption,im) in enumerate([('Godot: [619,528] / 120 eye steps',im1),('Cocos: same target / 120 eye steps',im2),('Absolute RGB difference: original intensity',diff)]):board.paste(im,(i*405,28));draw.text((i*405+8,8),caption,fill=(35,29,23))
    output=ROOT/'migration/reviews'/a.name;image=output.with_suffix('.png');board.save(image)
    report={'schema':1,'id':'M04.14','scope':'Declared same body rest pose and fixed focus [619,528],120x1/60; native source oracle measured separately; not real physical input','reference':{'path':str(ap.relative_to(ROOT)),'sha256':sha(ap),'trace':str(nt.relative_to(ROOT)),'traceSHA256':sha(nt)},'cocos':{'path':str(bp.relative_to(ROOT)),'sha256':sha(bp),'trace':str(ct.relative_to(ROOT)),'traceSHA256':sha(ct)},'comparison':{'path':str(image.relative_to(ROOT)),'sha256':sha(image),'method':'Unaligned, unscaled, unrecolored actual405x720 screenshots; unamplified RGB difference'},'nativeBodyFrame':native['body_frame'],'bodyPixelGazeErrors':bodyGaze,'nativePupilOffsets':native['pupils'],'cocosPupilOffsets':pupilOffsets,'maximumPupilDomainError':pupilError,'regions':regions,'status':'same_state_gaze_measured_full_pixel_parity_pending','limits':'Whole frame lighting, texture filtering, glyphs, particles and header differ; native eye-domain float32 vs current Cocos double clamp remains measurable. Browser screenshot compression retained. Physical drag uses unsynchronized wall-clock ticks in independent observer fixture. Other props, travel, formalWeChat/device and19MB Home gate pending.'}
    output.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'bodyPixelGazeErrors':bodyGaze,'pupilDomainError':pupilError,'regions':regions}))
if __name__=='__main__':main()
