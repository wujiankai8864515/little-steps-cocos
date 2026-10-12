#!/usr/bin/env python3
"""Adapt the original Travel atmospheric field; no shader art approximation."""
import json,re,hashlib
from import_godot_lighting import read,write,effect,sources,ROOT

def main():
 source=read('travel/travel_atmosphere.gd');field=read('shared_room_lighting/soft_atmosphere.gd').split('const FIELD := """',1)[1].split('"""',1)[0]
 functions=source.split('float scene_field',1)[1].split('void fragment()',1)[0];functions='float scene_field'+functions
 fragment=source.split('void fragment(){',1)[1].split('\n}\n"""',1)[0]
 properties={'sceneOrigin':[0,0,1,1],'castState':[0,1,1,1],'lightState':[1,.91,.72,1],'renderMode':[0,10,1,0],'sceneTint':[1,1,1,1]}
 access=[]
 for name,count in [('portal',4),('width',4),('exclusion',16)]:
  for i in range(count):properties[name+str(i)]=[0,0,0,0]
  access.append('vec4 '+name+'At(int i){'+''.join(f'if(i=={i})return {name}{i};' for i in range(count-1))+f'return {name}{count-1};'+'}')
 uniforms='uniform TravelField {\n'+''.join('vec4 '+key+';\n' for key in properties)+'};\n'+'''#define volume_pass (renderMode.x>1.5)
#define beams_enabled (renderMode.z>0.5)
#define exclusion_count int(renderMode.y)
#define cast_axis castState.xy
#define daylight castState.z
#define energy castState.w
#define surface_energy lightState.w
#define light_color lightState.rgb
'''
 for name,member in [('portals','portal'),('widths','width'),('exclusions','exclusion')]:functions=functions.replace(name+'[i]',member+'At(i)')
 fragment=fragment.replace('COLOR','result')
 body='\n'.join(access)+field+functions+'''vec4 frag(){
    vec2 scene_point=vec2((canvasPosition.x-sceneOrigin.x)/sceneOrigin.z,(sceneOrigin.y-canvasPosition.y)/sceneOrigin.w);
    vec4 result=renderMode.x>0.5?vec4(uv0,color.r,color.g*color.a):CCSampleWithAlphaSeparated(cc_spriteTexture,uv0);
    if(renderMode.x<0.5){
        vec3 tint=mix(vec3(1.0),sceneTint.rgb,color.g);
        tint=mix(tint,vec3(1.0),color.b);
        result.rgb*=tint;
        result.a*=color.r*color.a;
    }
'''+fragment+'''\n    if(volume_pass)result.a*=color.a;
    return result;
}'''
 output=write('travel-atmosphere',effect('travel-atmosphere',body,uniforms=uniforms,properties=properties).replace('Source formulas transferred by migration/tools/import_godot_lighting.py.','Original Travel formulas transferred by migration/tools/import_travel_atmosphere.py.'))
 record={'schema':1,'sources':[{'path':k,'sha256':v} for k,v in sources.items()],'output':output,'adaptations':['Original soft atmosphere functions, scene field and exclusion masks retained verbatim except uniform access','Four portals and sixteen exclusion slots use named vec4 properties for Creator uniform compatibility','Scene coordinates reconstruct Godot down-positive coordinates from Cocos world positions','One effect supports textured receiver, unquantized colored geometry and atmospheric volume; parent UI opacity is retained'],'validation':'shader source transferred; Creator compile and pixels require separate evidence'}
 (ROOT/'migration/records/M07-travel-atmosphere-source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps(output))
if __name__=='__main__':main()
