#!/usr/bin/env python3
"""Asset-only checks and exaggerated static pose evidence; not runtime evidence."""
from pathlib import Path
from PIL import Image, ImageDraw
import json, math, hashlib
ROOT=Path(__file__).resolve().parent
ASSETS=ROOT.parents[1]/'project/travel/assets'
c=json.loads((ROOT/'scene_layer_regions.json').read_text())
plate=Image.open(ASSETS/'travel_map_plate_v5.png').convert('RGBA'); atlas=Image.open(ASSETS/'travel_scene_layers_v1.png').convert('RGBA')
regions=c['layers']; bounds=[]
for name,l in regions.items():
 x,y,w,h=l['region'];assert 0<=x<x+w<=512 and 0<=y<y+h<=512
 for other,r in bounds:
  a,b,ww,hh=r;assert x+w<=a or a+ww<=x or y+h<=b or b+hh<=y,(name,other)
 assert atlas.crop((x,y,x+w,y+h)).getchannel('A').getextrema()[1]>0,name
 bounds.append((name,l['region']))
sx,sy=941/720,1672/1280
poses=[{'bell_body':-4,'bell_clapper':13,'leaf_foreground_left':-12,'leaf_foreground_right':9,'leaf_foreground_middle':-7,'leaf_midground':18}, {}, {'bell_body':4,'bell_clapper':-13,'leaf_foreground_left':11,'leaf_foreground_right':-10,'leaf_foreground_middle':8,'leaf_midground':-16}]
previews=[]
for idx,pose in enumerate(poses):
 im=plate.copy()
 for name,l in sorted(regions.items(),key=lambda e:e[1]['z']):
  if 'position' not in l:continue
  x,y,w,h=l['region'];sprite=atlas.crop((x,y,x+w,y+h))
  size=(round(l['size'][0]*sx),round(l['size'][1]*sy));sprite=sprite.resize(size,Image.Resampling.LANCZOS)
  if name.startswith('cloud_'):sprite.putalpha(sprite.getchannel('A').point(lambda a:round(a*.42)))
  pos=(l['position'][0]*sx,l['position'][1]*sy);pivot=(l['pivot'][0]*sx,l['pivot'][1]*sy)
  if name=='bell_clapper':
   body=c['bell']['anchor'];body=(body[0]*sx,body[1]*sy);dx=pos[0]-body[0];dy=pos[1]-body[1];ang=-math.radians(pose.get('bell_body',0))
   pos=(body[0]+dx*math.cos(ang)-dy*math.sin(ang),body[1]+dx*math.sin(ang)+dy*math.cos(ang))
  lay=Image.new('RGBA',im.size);lay.alpha_composite(sprite,(round(pos[0]-pivot[0]),round(pos[1]-pivot[1])))
  if name in pose:lay=lay.rotate(pose[name],Image.Resampling.BICUBIC,center=pos)
  im.alpha_composite(lay)
 crop=im.crop((20,735,355,1180)).convert('RGB');previews.append(crop)
 out=ROOT/'evidence'/f'authoring_pose_{idx}.png';crop.save(out)
sheet=Image.new('RGB',(335*3,470),(238,233,216));d=ImageDraw.Draw(sheet)
for i,im in enumerate(previews):sheet.paste(im,(335*i,25))
d.text((10,7),'ASSET POSES ONLY: exaggerated offsets | neutral rest | opposite offsets. Runtime verification pending.',fill=(52,50,43))
sheet.save(ROOT/'evidence/authoring_pose_comparison.png')
report={'atlas_bounds_and_nonoverlap':True,'all_13_regions_nonempty':True,'atlas_rgba':atlas.mode=='RGBA','atlas_alpha_range':list(atlas.getchannel('A').getextrema()),'static_pose_evidence':'evidence/authoring_pose_comparison.png','poses_degrees':poses,'runtime_verified':False}
(ROOT/'layer_verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
