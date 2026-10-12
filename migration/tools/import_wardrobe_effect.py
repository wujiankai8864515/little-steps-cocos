#!/usr/bin/env python3
"""Preserve original wardrobe light/volume programs in page-local coordinates."""
import json,re
from import_godot_lighting import ROOT,read,effect,write,sources
text=read('wardrobe/wardrobe_material.gd')
fragment=text.split('void fragment(){',1)[1].split('"""',1)[0].rsplit('}',1)[0]
fragment=fragment.replace('COLOR','result').replace('atan(relative.y,relative.x)','atan(relative.y,relative.x)')
fragment=fragment.replace('if(glass_pass){','''if(glass_pass){
  // The atlas already separates cool exterior paint from warm wooden mullions.
  // Sample at the actual pane position; reflection must not wash over the frame.
  float glass_gate=smoothstep(0.0,0.025,result.g-result.r)*smoothstep(-0.12,0.02,result.b-result.r);''')
fragment=fragment.replace('0.045+sheen*0.14);','(0.045+sheen*0.14)*glass_gate);')
fragment=fragment.replace('vec2 origin=vec2(-90.0,mix(110.0,330.0,solar_phase));','''// The window moves with the illustration. Only volume reach follows the view.
 vec2 origin=vec2(-90.0,mix(110.0,330.0,solar_phase));''')
fragment=fragment.replace('length(relative)/1900.0','length(relative)/(1900.0*max(1.0,pageState.z/1280.0))')
fragment=fragment.replace('smoothstep(860.0,1280.0,point.y)','smoothstep(pageState.y-420.0,pageState.y,point.y)')
uniforms='''uniform WardrobeLight {vec4 pageOrigin;vec4 pageState;vec4 wardrobeState;};
#define night wardrobeState.x
#define solar_phase wardrobeState.y
#define glass_pass (wardrobeState.z>0.5 && wardrobeState.z<1.5)
#define shaft_pass (wardrobeState.z>1.5 && wardrobeState.z<2.5)
#define shadow_pass (wardrobeState.z>2.5)
#define volume_gain wardrobeState.w
'''
body='vec4 frag(){vec2 point=vec2((canvasPosition.x-pageOrigin.x)/pageOrigin.z,(pageOrigin.y-canvasPosition.y)/pageOrigin.w);vec4 result=CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)*color;'+fragment+'return result;}'
output=write('wardrobe-room',effect('wardrobe-room',body,uniforms=uniforms,properties={'pageOrigin':[0,0,1,1],'pageState':[0,1280,1280,1],'wardrobeState':[0,.5,0,1]}))
(ROOT/'migration/records/M08-wardrobe-shader.json').write_text(json.dumps({'schema':1,'sources':sources,'output':output,'vertexMotion':'Original source vertex motion calculated into bounded CPU grids; face outfits use trimmed source coordinate sampling.'},indent=2)+'\n')
print(json.dumps(output))
