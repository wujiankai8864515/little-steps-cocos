#!/usr/bin/env python3
"""Measure untouched 720x1280 engine-output PNGs; no visual acceptance implied."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--native',required=True);p.add_argument('--cocos',required=True);p.add_argument('--name',required=True);a=p.parse_args();assert all(c.isalnum() or c in '-_' for c in a.name)
 paths=[ROOT/a.native,ROOT/a.cocos];frames=[Image.open(f).convert('RGB') for f in paths];assert all(f.size==(720,1280) for f in frames)
 difference=np.abs(np.asarray(frames[0],dtype=float)-np.asarray(frames[1],dtype=float))
 regions={}
 for name,rect in {'whole':[0,0,720,1280],'header':[160,30,565,145],'landscape':[0,140,720,740],'actorShadow':[310,388,385,426],'bell':[64,740,134,880],'characterArt':[200,950,445,1110]}.items():
  x0,y0,x1,y1=rect;d=difference[y0:y1,x0:x1];regions[name]={'rect':rect,'meanAbsoluteRGB':float(d.mean()),'rootMeanSquareRGB':float(np.sqrt((d*d).mean())),'p95ChannelDifference':float(np.percentile(d,95)),'maxChannelDifference':int(d.max()),'pixelsAnyChannelOver16':int((d.max(2)>16).sum()),'pixels':d.shape[0]*d.shape[1]}
 out=ROOT/'builds/qa'/a.name;assert not out.with_suffix('.png').exists();board=Image.new('RGB',(2160,1312),'#eee9df');draw=ImageDraw.Draw(board)
 for i,(name,frame) in enumerate(zip(['Godot 4.5.2 native','Cocos Creator 3.8.8 / Chrome','Absolute RGB difference (6x, display only)'],frames+[Image.fromarray(np.minimum(difference*6,255).astype('uint8'))])):board.paste(frame,(i*720,32));draw.text((i*720+12,9),name,fill='black')
 board.save(out.with_suffix('.png'))
 record={'schema':1,'native':{'path':a.native,'sha256':sha(paths[0])},'cocos':{'path':a.cocos,'sha256':sha(paths[1])},'board':{'path':str(out.with_suffix('.png').relative_to(ROOT)),'sha256':sha(out.with_suffix('.png'))},'method':'RGB difference of unmodified 720x1280 PNGs; no alignment, scaling, recoloring or excluded pixels. Heatmap is amplified 6x for display only.','regions':regions,'status':'measured_scene_checkpoint_not_complete_visual_acceptance','pending':['remaining time/progress/size/animation matrix','full map UI/input/audio/save flows','WeChat device and user acceptance']}
 out.with_suffix('.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'name':a.name,'whole':regions['whole'],'actorShadow':regions['actorShadow']}))
if __name__=='__main__':main()
