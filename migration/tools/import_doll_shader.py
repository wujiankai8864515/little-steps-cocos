#!/usr/bin/env python3
"""Transfer original continuous doll shader/mask; retain exact source hashes."""
import hashlib,json
from pathlib import Path
from import_godot_lighting import ROOT,SOURCE,effect,include,read,sources,write,VERTEX
def main():
    prefix=include('darkroom/shaders/doll_source_mask.gdshaderinc')
    prefix='\n'.join(line for line in prefix.splitlines() if not line.startswith('uniform '))
    # Creator validates sampler identifiers before GLSL macro expansion.
    prefix=prefix.replace('source_display_mask','sourceDisplayMask')
    # Ownership is an unsigned normalized byte. floor(v+.5) is identical to
    # round(v) here and compiles for Creator's GLES100 fallback as well.
    prefix=prefix.replace('round(data.g*255.0)','floor(data.g*255.0+0.5)')
    shader=read('darkroom/shaders/doll_release.gdshader')
    fragment=shader.split('void fragment() {',1)[1].rsplit('}',1)[0]
    fragment=fragment.replace('texture(TEXTURE,sample_uv)','sourceSample(sample_uv)').replace('COLOR','result').replace('page_tint','color')
    body='''
  #define doll_part_id int(dollState.x)
  #define mother_uv_rect vec4(0.0,0.0,1.0,1.0)
  #define spawn_alpha dollState.z
  #define face_reaction dollState.y
  #define dissolve dollState.w
  #define light_tint lightTint.rgb
  #define release_top releaseBounds.x
  #define release_bottom releaseBounds.y
  vec4 sourceSample(vec2 sourceUVPoint) {
    vec2 q=(sourceUVPoint-sourceUV.xy)/sourceUV.zw;
    return CCSampleWithAlphaSeparated(cc_spriteTexture,q);
  }
'''+prefix+'''
  vec4 frag() {
    vec2 UV=sourceUV.xy+uv0*sourceUV.zw;
    vec2 world_position=vec2((canvasPosition.x-roomOrigin.x)/roomOrigin.z,(roomOrigin.y-canvasPosition.y)/roomOrigin.w);
    vec4 result;
'''+fragment+'''
    return result;
  }
'''
    uniforms='''  uniform DollState {
    vec4 roomOrigin;
    vec4 sourceUV;
    vec4 dollState;
    vec4 lightTint;
    vec4 releaseBounds;
  };
'''
    properties={'roomOrigin':[0,0,1,1],'sourceUV':[0,0,1,1],'dollState':[0,0,1,0],'lightTint':[1,1,1,1],'releaseBounds':[474,809,0,0]}
    output=write('darkroom-doll',effect('darkroom-doll',body,samplers=['sourceDisplayMask'],uniforms=uniforms,properties=properties,vertex=VERTEX))
    report={'sources':sources,'output':output,'coordinateAdaptation':'Godot world y-down and cropped mother UV reconstructed from Cocos canvas position; original mask, face warp and dissolve formulas retained','pending':['Actual Cocos shader compilation','Seven ownership passes screenshot comparison','WeChat device acceptance']}
    (ROOT/'migration/records/M06-doll-shader-source.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'output':output,'sources':len(sources)}))
if __name__=='__main__':main()
