#!/usr/bin/env python3
"""Deterministic alpha extraction, protected-pixel composite, atlas and evidence.
Generator images are immutable authoring sources. No generator call is required.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np
import json, hashlib, shutil
ROOT=Path(__file__).resolve().parent
PROJ=ROOT.parents[1]/'project'
ASSETS=PROJ/'travel/assets'
SOURCE=ROOT/'source'
EVIDENCE=ROOT/'evidence'
EVIDENCE.mkdir(exist_ok=True)
original_path=SOURCE/'map_original.png'
if not original_path.exists(): shutil.copyfile(ASSETS/'travel_map_plate_v5.png',original_path)
original=Image.open(original_path).convert('RGBA')
neutral=Image.open(SOURCE/'neutral_generated.png').convert('RGBA')
cleanup=Image.open(SOURCE/'leaf_cleanup_generated.png').convert('RGBA')
leaf_mask=Image.open(SOURCE/'leaf_removal_mask.png').convert('L').filter(ImageFilter.GaussianBlur(1.3))
plate=Image.composite(cleanup,neutral,leaf_mask)
W,H=plate.size
S=(720/W,1280/H)
# Restore approved lettering, UI papers, and baked lower actor byte for byte.
protected={
 'title':[(248,65),(710,65),(722,69),(726,79),(732,86),(732,153),(728,164),(719,174),(710,179),(244,179),(234,174),(226,164),(226,146),(227,87),(234,82),(233,73),(241,67)],
 'back':[(67,0),(113,0),(109,62),(139,64),(146,82),(146,213),(137,230),(103,238),(44,223),(27,206),(27,83),(43,61),(81,57)],
 'bubble':[(469,960),(646,961),(725,972),(779,995),(805,1030),(814,1070),(801,1111),(769,1148),(718,1170),(646,1181),(587,1181),(581,1200),(561,1217),(529,1230),(544,1205),(548,1183),(453,1181),(393,1163),(348,1136),(329,1101),(329,1049),(341,1014),(372,989),(418,972)],
 'approved_lower_actor':[(166,1354),(174,1308),(206,1271),(244,1250),(298,1244),(337,1233),(368,1233),(402,1225),(442,1233),(480,1243),(513,1261),(536,1283),(553,1301),(566,1301),(579,1311),(581,1338),(571,1351),(551,1391),(527,1412),(496,1429),(437,1444),(360,1447),(296,1436),(246,1428),(191,1417),(166,1396)],
 'bottom_plaque':[(306,1538),(629,1538),(641,1559),(660,1559),(675,1584),(661,1610),(638,1620),(309,1620),(293,1604),(274,1602),(267,1572),(287,1552)],
 'map_wood_sign':[(584,408),(695,408),(702,415),(702,453),(693,462),(583,460),(577,451),(577,419)],
}
protect=Image.new('L',plate.size)
for name,poly in protected.items():
 m=Image.new('L',plate.size);ImageDraw.Draw(m).polygon(poly,fill=255)
 protect=Image.fromarray(np.maximum(np.array(protect),np.array(m)))
# A two-pixel feather is outside the fully preserved core, never inside it.
outer=protect.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(0.6))
outer=Image.fromarray(np.maximum(np.array(outer),np.array(protect)))
plate=Image.composite(original,plate,outer)
plate.convert('RGB').save(ASSETS/'travel_map_plate_v5.png',optimize=True)
protect.save(SOURCE/'protected_pixels_mask.png')

atlas=Image.new('RGBA',(512,512))
entries={}
sprites={}
def put(name,sprite,rect,source_note,world_position=None,world_size=None,pivot=None,z=0):
 x,y,w,h=rect
 sprite=sprite.resize((w,h),Image.Resampling.LANCZOS)
 atlas.alpha_composite(sprite,(x,y))
 sprites[name]=sprite
 item={'region':rect,'source':source_note,'texture_size':[w,h],'z':z}
 if world_position is not None: item['position']=world_position
 if world_size is not None: item['size']=world_size
 if pivot is not None:item['pivot']=pivot
 entries[name]=item
 return item

def masked_source(im,poly,pad=3):
 m=Image.new('L',im.size);ImageDraw.Draw(m).polygon([tuple(p) for p in poly],fill=255)
 # subpixel matte softening only; RGB is original painting.
 m=m.filter(ImageFilter.GaussianBlur(.35))
 b=m.getbbox();b=(max(0,b[0]-pad),max(0,b[1]-pad),min(W,b[2]+pad),min(H,b[3]+pad))
 out=im.copy();out.putalpha(m)
 return out.crop(b),b

def world_point(p):return [round(p[0]*S[0],4),round(p[1]*S[1],4)]
def world_size(s):return [round(s[0]*S[0],4),round(s[1]*S[1],4)]

bell=Image.open(SOURCE/'bell_generated.png').convert('RGBA')
bell_body=bell.crop((50,35,830,1200));bell_body=bell_body.crop(bell_body.getbbox())
bell_clapper=bell.crop((930,360,1140,1180));bell_clapper=bell_clapper.crop(bell_clapper.getbbox())
put('bell_body',bell_body,[4,4,142,242],'Generated completion of same reference bell, hidden left body reconstructed; neutral material shading.',world_point((118,938)),world_size((113,193)),world_size((58,10)),20)
put('bell_clapper',bell_clapper,[154,4,24,112],'Separated reference-style clapper; visible portion only.',world_point((120,1099)),world_size((14,53)),world_size((7,0)),21)
# Original support chain, immobile. Its alpha follows the actual chain contour.
chainpoly=[(127,878),(131,879),(130,890),(128,900),(126,908),(124,916),(121,923),(121,928),(124,931),(122,937),(119,941),(112,939),(112,935),(116,930),(116,924),(119,917),(121,909),(123,900),(124,889)]
chain,cb=masked_source(original,chainpoly)
put('bell_chain',chain,[188,4,24,70],'Exact source painting support chain cutout.',world_point(cb[:2]),world_size((cb[2]-cb[0],cb[3]-cb[1])),[0,0],19)
# The immobile front post and stone rail hide the bell exactly like the source.
occ_poly=[(40,898),(101,898),(99,1088),(94,1094),(99,1100),(99,1138),(190,1163),(190,1170),(40,1170)]
occ,ob=masked_source(plate,occ_poly,0)
put('bell_occluder',occ,[218,4,142,264],'Neutral plate front wooden post and stone rail alpha matte.',world_point(ob[:2]),world_size((ob[2]-ob[0],ob[3]-ob[1])),[0,0],22)

polys=json.loads((ROOT/'leaf_polygons.json').read_text())
leafdefs=[('leaf_foreground_left','leaf_foreground_high',[372,4,85,64],(164,767)),('leaf_foreground_right','leaf_foreground_low',[372,80,81,60],(219,871)),('leaf_foreground_middle','leaf_foreground_middle',[372,152,74,59],(228,815))]
for name,key,rect,anchor in leafdefs:
 sprite,b=masked_source(neutral,polys[key])
 # Remove tiny roof/background intrusions along the traced matte; preserve painted leaf RGB.
 arr=np.array(sprite); rgb=arr[:,:,:3].astype(float)
 golden=(rgb[:,:,0]>100)&(rgb[:,:,1]>rgb[:,:,0]*.61)&(rgb[:,:,1]>rgb[:,:,2]*1.33)&(rgb[:,:,0]>rgb[:,:,2]*1.8)
 alpha=np.array(sprite.getchannel('A'));alpha[~golden]=0
 sprite.putalpha(Image.fromarray(alpha))
 put(name,sprite,rect,'Exact neutral painting leaf RGB with hand-traced alpha; matching stationary leaf removed from plate.',world_point(anchor),world_size((b[2]-b[0],b[3]-b[1])),world_size((anchor[0]-b[0],anchor[1]-b[1])),30)
 entries[name]['source_box']=list(b)
 entries[name]['source_polygon']=polys[key]
# The original floating middle-distance leaf was removed in neutral generation.
midpoly=[(854,820),(860,816),(863,808),(870,805),(878,802),(882,798),(881,807),(880,814),(878,819),(870,823),(866,825),(860,823)]
midleaf,mb=masked_source(original,midpoly)
put('leaf_midground',midleaf,[464,152,40,39],'Exact original middle-distance floating leaf; old static counterpart removed by neutral edit.',world_point((869,813)),world_size((mb[2]-mb[0],mb[3]-mb[1])),world_size((869-mb[0],813-mb[1])),16)
# Small falling sprites reuse the actual painted leaves, with independent regions.
for name,parent,rect in [('leaf_a','leaf_foreground_left',[372,223,36,29]),('leaf_b','leaf_foreground_right',[420,223,36,29]),('leaf_c','leaf_midground',[468,223,36,29])]:
 put(name,sprites[parent],rect,'Reduced reuse of '+parent+' actual painting.',z=31)
clouds=Image.open(SOURCE/'cloud_generated.png').convert('RGBA')
# Generator delivered the two clouds as separate vertical bands; alpha is preserved.
far=clouds.crop((0,0,clouds.width,435));far=far.crop(far.getbbox())
mid=clouds.crop((0,438,clouds.width,clouds.height));mid=mid.crop(mid.getbbox())
put('cloud_far',far,[4,282,300,65],'Generated transparent watercolor cloud extracted/completed from same valley cloud reference.',world_point((477,268)),world_size((252,56)),world_size((126,28)),3)
put('cloud_mid',mid,[4,359,280,66],'Second independent generated cloud bank from same valley cloud reference.',world_point((782,699)),world_size((214,53)),world_size((107,26)),4)
atlas.save(ASSETS/'travel_scene_layers_v1.png',optimize=True)

config={'schema':1,'status':'asset_coordinate_contract_runtime_integration_pending','canvas':[720,1280],'source_canvas':[W,H],'plate':'res://travel/assets/travel_map_plate_v5.png','atlas':'res://travel/assets/travel_scene_layers_v1.png','atlas_dimensions':[512,512],'layers':entries,'bell':{'anchor':world_point((118,938)),'body_region':'bell_body','body_size':world_size((113,193)),'body_pivot':world_size((58,10)),'clapper_region':'bell_clapper','clapper_anchor':world_size((2,161)),'clapper_size':world_size((14,53)),'clapper_pivot':world_size((7,0)),'chain_region':'bell_chain','occluder_region':'bell_occluder','draw_order':['bell_chain','bell_body','bell_clapper','bell_occluder']},'notes':['Positions are 720x1280 content-local; add the page vertical offset once.','Leaf pivots are at their painted attachment; do not shake the entire plate.','Clouds are thin mobile wisps; recommended opacity 0.28–0.50; distant painted cloud masses retain scenery depth.','UI/title/bottom actor protected pixels are byte-identical to approved original.','Bell hidden left side and clapper were reconstructed by imagegen from original painted bell crop; they are not claimed to be original hidden pixels.','Use background alpha plate crop as front occluder rather than a hard rectangular clip.','Atlas intended linear sampling. Base-level lossless RGBA8=1048576 bytes; mipmapped RGBA8=1398100 bytes before +65536 reservation.']}
(ROOT/'scene_layer_regions.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
# Layered resting-position assembly, authoring verification only.
rest=plate.copy()
for name,item in sorted(entries.items(),key=lambda x:x[1]['z']):
 if 'position' not in item:continue
 ws=item['size']; pos=item['position'];pvt=item['pivot']
 size=(round(ws[0]/S[0]),round(ws[1]/S[1]))
 dest=(round((pos[0]-pvt[0])/S[0]),round((pos[1]-pvt[1])/S[1]))
 draw_sprite=sprites[name].resize(size,Image.Resampling.LANCZOS)
 if name.startswith('cloud_'):
  draw_sprite.putalpha(draw_sprite.getchannel('A').point(lambda a:round(a*.42)))
 rest.alpha_composite(draw_sprite,dest)
rest.convert('RGB').save(EVIDENCE/'layered_rest.png')
checker=Image.new('RGB',atlas.size)
d=ImageDraw.Draw(checker)
for y in range(0,512,16):
 for x in range(0,512,16):d.rectangle((x,y,x+15,y+15),fill=(174,184,192) if (x//16+y//16)%2 else (224,227,229))
checker.paste(atlas,mask=atlas.getchannel('A'));checker.save(EVIDENCE/'atlas_checkerboard.png')
# Full side-by-side plus detail makes removal/material/structure verifiable.
before=original.convert('RGB');after=rest.convert('RGB')
pair=Image.new('RGB',(W*2,H));pair.paste(before);pair.paste(after,(W,0));pair.resize((1129,1003),Image.Resampling.LANCZOS).save(EVIDENCE/'before_after.png')
for label,box in [('bell',(40,878,201,1170)),('leaves',(100,740,290,1020)),('title',(175,55,787,188)),('actor',(160,1220,585,1452))]:
 b=before.crop(box);a=after.crop(box)
 out=Image.new('RGB',(b.width*2,b.height));out.paste(b);out.paste(a,(b.width,0))
 scale=min(3,1200/out.width)
 out.resize((round(out.width*scale),round(out.height*scale)),Image.Resampling.NEAREST).save(EVIDENCE/(label+'_before_after.png'))
# Evidence: exact protected pixels, not a vague similarity assertion.
a=np.array(original);b=np.array(plate)
checks={}
for name,poly in protected.items():
 m=Image.new('L',plate.size);ImageDraw.Draw(m).polygon(poly,fill=255);mask=np.array(m)>0
 checks[name]={'protected_pixels':int(mask.sum()),'changed_pixels':int(np.any(a[mask]!=b[mask],axis=1).sum()),'max_channel_delta':int(np.abs(a[mask].astype('i2')-b[mask].astype('i2')).max())}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assets={}
for p in [ASSETS/'travel_map_plate_v5.png',ASSETS/'travel_scene_layers_v1.png']:
 im=Image.open(p)
 assets[p.name]={'dimensions':list(im.size),'png_bytes':p.stat().st_size,'sha256':sha(p),'rgba8_bytes':im.width*im.height*4,'rgba8_plus_64k':im.width*im.height*4+65536}
report={'source_commit':'2a123d9c050ce0c5d9889ffada7ab3ae24b7957f','source_original_sha256':sha(original_path),'protected_pixel_tests':checks,'approved_actor_asset_unchanged_sha256':sha(ASSETS/'travel_map_actor_v5.png'),'runtime_assets':assets,'atlas_entries':len(entries),'runtime_texture_entries_added':1,'atlas_mipmapped_rgba8_bytes':1398100,'mipmaps_declared':False,'official_import_pixel_check':('PASS isolated pinned Godot 4.5.2 exact RGBA8 both assets; final integrated build pending' if (EVIDENCE/'official_import_audit.json').exists() else 'pending_in_parent_integrated_build'),'actual_scene_animation_check':'pending_in_runtime_worker','memory_measurement':'decoded declaration only; browser GPU not measured','viewed':['approved original full map','approved separate traveler sprite','approved mother sheet','neutral generator result','bell generation','cloud generation','leaf cleanup detail','Final atlas, resting composite, before/after detail, and exaggerated opposite asset poses actually viewed']}
(ROOT/'asset_audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'assets':assets,'regions':{k:v['region'] for k,v in entries.items()},'protected_pixels':checks},ensure_ascii=False,indent=2))
