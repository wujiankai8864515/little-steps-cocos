#!/usr/bin/env python3
"""Transfer original flower receiver; Cocos Graphics supplies line coverage."""
import hashlib,json,re
from import_godot_lighting import ROOT,ASSETS,read,include,effect,write,UNIFORMS,PROPERTIES,VERTEX,sources

def main():
    shader=read('home/flowers/flower_receiver.gdshader')
    gate=include('shaders/window_field.gdshaderinc')
    outdoor=re.sub(r'^uniform .*;\n','',include('shaders/outdoor_window.gdshaderinc'),flags=re.M)
    fragment=shader.split('void fragment(){',1)[1].split('\nvoid light(){',1)[0].rsplit('}',1)[0]
    fragment=fragment.replace('texture(TEXTURE,UV)','CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)').replace('    NORMAL=normalize(vec3(normal.xy,normal.z));','').replace('COLOR','result')
    receiver=(ASSETS/'resources/effects/home-receiver.effect').read_text()
    lamp='    vec2 lamp_delta='+receiver.split('    vec2 lamp_delta=',1)[1].split('    return result*color;',1)[0]
    uniforms=UNIFORMS+'''
  uniform FlowerState {vec4 flowerState;vec4 plantNormal;};
  #define alpha_cleanup flowerState.x
  #define front_clip_y flowerState.y
  #define small_plant (flowerState.z > 0.5)
  #define plant_normal plantNormal.xyz
'''
    properties={**PROPERTIES,'flowerState':[.025,-1,0,389],'plantNormal':[.05,-.25,.96,0]}
    start='vec4 frag(){\nvec2 world_pos=vec2((canvasPosition.x-roomOrigin.x)/roomOrigin.z,(roomOrigin.y-canvasPosition.y)/roomOrigin.w);vec2 UV=sourceUV.xy+uv0*sourceUV.zw;vec2 local_position=vec2(0.0,UV.y*flowerState.w);vec4 source_albedo,result;vec3 surf_normal;float exterior_mask;vec4 draw_tint=color;\n'
    body=gate+'\n'+outdoor+'\n'+start+fragment+lamp+'return result;}\n'
    outputs=[write('home-flower',effect('home-flower',body,['shared_outdoor_paint'],uniforms=uniforms,properties=properties))]
    # Graphics has position/color/distance, no texture UV, and submits local
    # model geometry. Keep straight-alpha blend matching the receiver pass.
    vertex=VERTEX.replace('  in vec2 a_texCoord;','  in float a_dist;\n  out float lineDistance;').replace('uv0=a_texCoord;', 'uv0=vec2(0.5); lineDistance=a_dist;')
    line=body.replace('CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)','vec4(1.0)').replace('return result;}','float aa=fwidth(lineDistance);result.a*=1.0-smoothstep(-max(aa,0.00001),0.0,abs(lineDistance)-1.0);return result;}')
    outputs.append(write('home-flower-line',effect('home-flower-line',line,['shared_outdoor_paint'],uniforms=uniforms+'\n  in float lineDistance;\n  #pragma extension([GL_OES_standard_derivatives, __VERSION__ < 300])\n',properties=properties,vertex=vertex)))
    record={'schema':1,'sources':sources,'existingReceiverSHA256':hashlib.sha256(receiver.encode()).hexdigest(),'outputs':outputs,'limits':'Transferred source illumination and head normal; round line tessellation/AA uses Cocos Graphics and requires same-state raster verification; WeChat GPU pending'}
    (ROOT/'migration/records/M04-flower-shader-source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'effects':len(outputs),'sources':len(sources)}))
if __name__=='__main__':main()
