#!/usr/bin/env python3
"""Adapt the original backpack part receiver; retain source hashes/tint order."""
import hashlib,json,re
from import_godot_lighting import ROOT,ASSETS,read,include,effect,write,UNIFORMS,PROPERTIES,sources

def main():
    shader=read('home/secondary/part_receiver.gdshader')
    gate=include('shaders/window_field.gdshaderinc')
    outdoor=re.sub(r'^uniform .*;\n','',include('shaders/outdoor_window.gdshaderinc'),flags=re.M)
    fragment=shader.split('void fragment(){',1)[1].split('\nvoid light(){',1)[0].rsplit('}',1)[0]
    fragment=fragment.replace('texture(TEXTURE,UV)','sample_original(uv0)').replace('    NORMAL=normalize(vec3(normal.xy,normal.z));','').replace('COLOR','result')
    receiver=(ASSETS/'resources/effects/home-receiver.effect').read_text()
    lamp='    vec2 lamp_delta='+receiver.split('    vec2 lamp_delta=',1)[1].split('    return result*color;',1)[0]
    lamp=lamp.replace('lamp_alpha*source_albedo.a','lamp_alpha*source_albedo.a*part_tint.a')
    start='vec4 sample_original(vec2 at){if(any(lessThan(at,vec2(0.0)))||any(greaterThan(at,vec2(1.0))))return vec4(0.0);return CCSampleWithAlphaSeparated(cc_spriteTexture,at);}\nvec4 frag(){\nvec2 world_pos=vec2((canvasPosition.x-roomOrigin.x)/roomOrigin.z,(roomOrigin.y-canvasPosition.y)/roomOrigin.w);vec2 UV=sourceUV.xy+uv0*sourceUV.zw;vec4 source_albedo,result,part_tint=vec4(color.rgb,color.a*partOpacityState.x);vec3 surf_normal;float exterior_mask;\n'
    output=write('home-part',effect('home-part',gate+'\n'+outdoor+'\n'+start+fragment+lamp+'return result;}\n',['shared_outdoor_paint'],uniforms=UNIFORMS+'\n  uniform PartOpacity {vec4 partOpacityState;};\n',properties={**PROPERTIES,'partOpacityState':[1,0,0,0]}))
    record={'schema':1,'sources':sources,'existingReceiverSHA256':hashlib.sha256(receiver.encode()).hexdigest(),'outputs':[output],'limits':'Original fragment formulas/tint and analytic native lamp adapter; actual GPU filtering, partial alpha and WeChat parity pending'}
    (ROOT/'migration/records/M04-backpack-shader-source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'effects':1,'sources':len(sources)}))
if __name__=='__main__':main()
