#!/usr/bin/env python3
"""Transfer approved GLSL functions, keeping source hashes and explicit limits.

Shader adaptation belongs to game assets. This tool performs no gameplay.
"""
import hashlib
import json
import re
import subprocess
import uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
ASSETS=ROOT/'games/xiaoyu-cocos/assets'
sources={}

def read(path):
    value=(SOURCE/path).read_text()
    sources[path]=hashlib.sha256((SOURCE/path).read_bytes()).hexdigest()
    return value

def include(path):
    value=read(path)
    return re.sub(r'#include "res://([^"]+)"',lambda m:include(m[1]),value)

UNIFORMS='''
  uniform RoomState {
    vec4 roomOrigin;
    vec4 sourceUV;
    vec4 visibleUV;
    vec4 ambientState;
    vec4 sunState;
    vec4 sunVectorState;
    vec4 castState;
    vec4 timeState;
    vec4 weightsState;
    vec4 celestialState;
    vec4 maskRect;
  };
  #define ambient_color ambientState.rgb
  #define sun_energy ambientState.a
  #define sun_color sunState.rgb
  #define moon_energy sunState.a
  #define sun_vector sunVectorState.xyz
  #define cot_e sunVectorState.w
  #define cast_dir castState.xy
  #define moon_cast_dir castState.zw
  #define game_hour timeState.x
  #define daylight timeState.y
  #define noon_weight timeState.z
  #define afterglow_energy timeState.w
  #define morning_weight weightsState.x
  #define sunset_weight weightsState.y
  #define lamp_glow (weightsState.z / 0.78)
  #define surface_type weightsState.w
  #define sun_screen_position celestialState.xy
  #define moon_screen_position celestialState.zw
  #define visible_uv visibleUV
  #define show_mask false
  #define outdoor_enabled true
  #define use_shared_outdoor_paint true
  #define shared_outdoor_uv_rect vec4(0.0,0.0,1.0,1.0)
'''
PROPERTIES={
    'roomOrigin':[0,0,1,1],'sourceUV':[0,0,1,1],'visibleUV':[0,0,1,1],
    'ambientState':[.55,.59,.63,.43],'sunState':[1,.91,.76,0],
    'sunVectorState':[0,0,1,1],'castState':[.6,.6,-.32,.95],
    'timeState':[7,1,0,0],'weightsState':[1,0,0,1],
    'celestialState':[147.5,63.55,228,95],'maskRect':[0,0,1,1],
}
VERTEX='''
CCProgram room-vs %{
  precision highp float;
  #include <builtin/uniforms/cc-global>
  #if USE_LOCAL
    #include <builtin/uniforms/cc-local>
  #endif
  in vec3 a_position;
  in vec2 a_texCoord;
  in vec4 a_color;
  out vec2 uv0;
  out vec4 color;
  out vec2 canvasPosition;
  vec4 vert() {
    vec4 pos=vec4(a_position,1.0);
    #if USE_LOCAL
      pos=cc_matWorld*pos;
    #endif
    uv0=a_texCoord; color=a_color; canvasPosition=pos.xy;
    return cc_matViewProj*pos;
  }
}%
'''

def effect(name,body,samplers=(),additive=False):
    props=''.join(f'        {key}: {{ value: {json.dumps(value)} }}\n' for key,value in PROPERTIES.items())
    props+=''.join(f'        {sampler}: {{ value: white }}\n' for sampler in samplers)
    declarations=''.join(f'  uniform sampler2D {sampler};\n' for sampler in samplers)
    dst='one' if additive else 'one_minus_src_alpha'
    return f'''// Source formulas transferred by builds/tools/import_godot_lighting.py.
CCEffect %{{
  techniques:
  - passes:
    - vert: room-vs:vert
      frag: room-fs:frag
      depthStencilState:
        depthTest: false
        depthWrite: false
      blendState:
        targets:
        - blend: true
          blendSrc: src_alpha
          blendDst: {dst}
          blendSrcAlpha: one
          blendDstAlpha: one_minus_src_alpha
      rasterizerState:
        cullMode: none
      properties:
{props}}}%
{VERTEX}
CCProgram room-fs %{{
  precision highp float;
  #include <builtin/internal/embedded-alpha>
  in vec2 uv0;
  in vec4 color;
  in vec2 canvasPosition;
{UNIFORMS}
  #pragma builtin(local)
  layout(set = 2, binding = 12) uniform sampler2D cc_spriteTexture;
{declarations}
{body}
}}%
'''

def write(name,value):
    path=ASSETS/'resources/effects'/f'{name}.effect';path.write_text(value)
    meta={'ver':'1.7.1','importer':'effect','imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps-cocos/effects/'+name)), 'files':['.json'],'subMetas':{},'userData':{}}
    path.with_suffix('.effect.meta').write_text(json.dumps(meta,indent=2)+'\n')
    return {'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def main():
    gate=include('shaders/window_field.gdshaderinc')
    outputs=[]
    for kind,source in [('receiver','receiver'),('bleed','bleed_receiver'),('bed','bed_receiver')]:
        outdoor=include('shaders/outdoor_window_extended.gdshaderinc' if kind=='bleed' else 'shaders/outdoor_window.gdshaderinc')
        outdoor=re.sub(r'^uniform .*;\n','',outdoor,flags=re.M)
        shader=read(f'shaders/{source}.gdshader')
        fragment=shader.split('void fragment(){',1)[1].split('\nvoid light(){',1)[0].rsplit('}',1)[0]
        fragment=fragment.replace('texture(TEXTURE,UV)','CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)')
        fragment=fragment.replace('texture(original_bleed,UV)','CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)')
        fragment=fragment.replace('texture(occlusion_alpha,UV).a','bed_alpha(UV)')
        fragment=fragment.replace('COLOR','result').replace('    NORMAL=normalize(vec3(normal.xy,normal.z));','')
        # Godot 4.5 GLES3 light_blend_compute adds custom LIGHT.rgb * LIGHT.a.
        # The analytic ramp follows the source radial GradientTexture2D stops.
        # Pixel quantization / filtering must still be compared with Godot GPU output.
        lamp='''
    vec2 lamp_delta=vec2(465.0,468.0)-world_pos;
    float lamp_radius=length(lamp_delta)/672.0;
    float lamp_alpha=lamp_radius<0.35?mix(1.0,0.45,lamp_radius/0.35):mix(0.45,0.0,clamp((lamp_radius-0.35)/0.65,0.0,1.0));
    vec3 lamp_direction=normalize(vec3(lamp_delta,150.0));
    float lamp_diffuse=0.55+0.45*max(dot(surf_normal,lamp_direction),0.0);
    result.rgb+=source_albedo.rgb*vec3(1.0,0.65,0.29)*weightsState.z*lamp_diffuse*(1.0-exterior_mask)*lamp_alpha*source_albedo.a;
'''
        extra=''
        samplers=['shared_outdoor_paint']
        if kind=='bleed':samplers.append('neutral_center')
        if kind=='bed':
            samplers.append('occlusion_alpha')
            extra='''float bed_alpha(vec2 uv){
  vec2 p=(uv-maskRect.xy)/maskRect.zw;
  if(any(lessThan(p,vec2(0.0)))||any(greaterThan(p,vec2(1.0))))return 0.0;
  return texture(occlusion_alpha,p).a;
}
'''
        body=gate+'\n'+outdoor+'\n'+extra+'''
  vec4 frag(){
    vec2 world_pos=vec2((canvasPosition.x-roomOrigin.x)/roomOrigin.z,(roomOrigin.y-canvasPosition.y)/roomOrigin.w);
    vec2 UV=sourceUV.xy+uv0*sourceUV.zw;
    vec4 source_albedo,result;
    vec3 surf_normal;
    float exterior_mask;
'''+fragment+lamp+'    return result*color;\n  }\n'
        outputs.append(write('home-'+kind,effect('home-'+kind,body,samplers)))
    beam=include('shared_room_lighting/window_beam_profile.gdshaderinc')
    shafts=read('shaders/light_shafts.gdshader')
    frag=shafts.split('void fragment(){',1)[1].rsplit('}',1)[0]
    frag=frag.replace('if(!enabled){COLOR.a=0.0;}','').replace('COLOR=','vec4 result=')
    outputs.append(write('home-shafts',effect('home-shafts',gate+'\n'+beam+'\nvec4 frag(){vec2 UV=uv0;'+frag+'return result*color;}\n',additive=True)))
    read('shared_room_lighting/lighting_snapshot.gd');read('home/room_props_controller.gd');read('scripts/approved_lighting_v3.gd')
    report={'schema':1,'sourceCommit':subprocess.check_output(['git','-C',str(ROOT.parent/'little-steps'),'rev-parse','HEAD'],text=True).strip(),
        'status':'formula transfer; GPU comparison pending','sources':sources,'outputs':outputs,
        'godotCanvasReference':{'url':'https://github.com/godotengine/godot/blob/6ce3de25aa58466e14ef354703ba8d9791a417da/drivers/gles3/shaders/canvas.glsl','gitBlob':'37d851a3c00336b254b17d3c41b9e84539ce5ef4','exactPublished4_5_2CommitVerified':True},
        'limits':['native lamp analytic ramp not yet verified pixel-by-pixel against original GradientTexture2D','face and prop deformation shader variants pending','all alpha-grounded projections and independent plants pending','same-state Godot/Cocos screenshots and WeChat true-device acceptance pending']}
    (ROOT/'builds/records/M05-lighting-transfer.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'effects':len(outputs),'sourceFiles':len(sources)}))

if __name__=='__main__':main()
