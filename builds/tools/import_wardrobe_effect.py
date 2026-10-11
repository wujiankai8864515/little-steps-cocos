#!/usr/bin/env python3
"""Preserve original wardrobe light/volume programs in page-local coordinates."""
import json,re
from import_godot_lighting import ROOT,read,effect,write,sources
text=read('wardrobe/wardrobe_material.gd')
fragment=text.split('void fragment(){',1)[1].split('"""',1)[0].rsplit('}',1)[0]
fragment=fragment.replace('COLOR','result').replace('atan(relative.y,relative.x)','atan(relative.y,relative.x)')
uniforms='''uniform WardrobeLight {vec4 pageOrigin;vec4 wardrobeState;};
#define night wardrobeState.x
#define solar_phase wardrobeState.y
#define glass_pass (wardrobeState.z>0.5 && wardrobeState.z<1.5)
#define shaft_pass (wardrobeState.z>1.5 && wardrobeState.z<2.5)
#define shadow_pass (wardrobeState.z>2.5)
#define volume_gain wardrobeState.w
'''
body='vec4 frag(){vec2 point=vec2((canvasPosition.x-pageOrigin.x)/pageOrigin.z,(pageOrigin.y-canvasPosition.y)/pageOrigin.w);vec4 result=CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)*color;'+fragment+'return result;}'
output=write('wardrobe-room',effect('wardrobe-room',body,uniforms=uniforms,properties={'pageOrigin':[0,0,1,1],'wardrobeState':[0,.5,0,1]}))
(ROOT/'builds/records/M08-wardrobe-shader.json').write_text(json.dumps({'schema':1,'sources':sources,'output':output,'vertexMotion':'Original source vertex motion calculated into bounded CPU grids; face outfits use trimmed source coordinate sampling.'},indent=2)+'\n')
print(json.dumps(output))
