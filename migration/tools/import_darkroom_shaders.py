#!/usr/bin/env python3
"""Mechanical GLSL transfer of the native Darkroom; no gameplay in build tools."""
import json,re
from import_godot_lighting import ROOT,effect,include,read,sources,write,VERTEX,UNIFORMS,PROPERTIES

EXTRA='''
  uniform DarkExtras {
    vec4 textureSize;
    vec4 darkState;
    vec4 textureBounds;
    vec4 toolInverseX;
    vec4 toolInverseY;
    vec4 toolInverseOrigin;
    vec4 toolUVRect;
    vec4 toolRect;
  };
  #define lamp_weight darkState.x
  #define release_glow darkState.y
  #define selected darkState.x
  #define radius_px darkState.y
  #define age darkState.x
  #define alpha darkState.y
  #define flutter darkState.z
  #define strength darkState.x
  #define doll_part_id int(darkState.y)
  #define mother_uv_rect vec4(0.0,0.0,1.0,1.0)
  #define texture_bounds textureBounds
  #define tool_inverse_x toolInverseX.xy
  #define tool_inverse_y toolInverseY.xy
  #define tool_inverse_origin toolInverseOrigin.xy
  #define tool_uv_rect toolUVRect
  #define tool_rect toolRect
'''
SAMPLING='''
  vec4 sourceSample(vec2 p) {
    vec2 q=(p-sourceUV.xy)/sourceUV.zw;
    float gate=step(0.0,q.x)*step(q.x,1.0)*step(0.0,q.y)*step(q.y,1.0);
    return CCSampleWithAlphaSeparated(cc_spriteTexture,clamp(q,vec2(0.0),vec2(1.0)))*gate;
  }
'''
PROPS={**PROPERTIES,'textureSize':[1,1,0,0],'darkState':[0,-1,.018,0],
    'textureBounds':[0,0,1,1],'toolInverseX':[1,0,0,0],'toolInverseY':[0,1,0,0],
    'toolInverseOrigin':[0,0,0,0],'toolUVRect':[0,0,1,1],'toolRect':[0,0,1,1]}

def main():
    outputs=[]
    for name,source,generated,additive in [
        ('room','room_light',False,False),('sky','sky',True,False),
        ('beams','window_beams',True,True),('selection','tool_selection_glow',False,False),
        ('shadow','alpha_shadow',False,False),('tool-receiver','tool_receiver_shadow',False,False),
        ('plume','smoke_flow',False,False)]:
        shader=read('darkroom/shaders/'+source+'.gdshader')
        prefix=shader[:shader.index('void fragment()')]
        prefix=re.sub(r'void vertex\(\)\{[^}]*\}','',prefix)
        prefix=re.sub(r'#include "res://([^"]+)"',lambda m:include(m[1]),prefix)
        prefix=re.sub(r'^(?:shader_type|render_mode|uniform|varying).*;\s*$', '',prefix,flags=re.M)
        prefix=prefix.replace('source_display_mask','sourceDisplayMask').replace('round(data.g*255.0)','floor(data.g*255.0+0.5)')
        fragment=shader.split('void fragment()',1)[1].strip()[1:].rsplit('}',1)[0]
        fragment=fragment.replace('COLOR','result').replace('page_tint','color')
        body=SAMPLING+prefix+'\n vec4 frag() {\n'
        body+='    vec2 UV='+('uv0' if generated else 'sourceUV.xy+uv0*sourceUV.zw')+';\n'
        body+='    vec2 TEXTURE_PIXEL_SIZE=1.0/textureSize.xy;\n'
        body+='    vec2 world_pos=vec2((canvasPosition.x-roomOrigin.x)/roomOrigin.z,(roomOrigin.y-canvasPosition.y)/roomOrigin.w);\n'
        body+='    vec2 world_position=world_pos;\n    vec4 result;\n'+fragment+'\n    return result;\n }\n'
        body=body.replace('texture(TEXTURE,','sourceSample(')
        samplers=[]
        if 'sourceDisplayMask' in body:samplers.append('sourceDisplayMask')
        if name=='sky':samplers.append('shared_outdoor_paint')
        if name=='tool-receiver':samplers.append('tool_texture')
        uniforms=UNIFORMS+EXTRA;props=PROPS.copy()
        if name=='plume':
            # Preserve HomeDepartureVisual's float CanvasItem ancestor tint;
            # Creator Sprite.color stores only eight-bit channels.
            uniforms+='\n  uniform PlumeTint { vec4 plumeTint; };\n'
            props['plumeTint']=[1,1,1,1]
            body=body.replace('result *= color;','result *= color * plumeTint;')
        outputs.append(write('darkroom-'+name,effect(name,body,samplers,additive,uniforms=uniforms,properties=props,vertex=VERTEX)))
    report={'sources':sources,'outputs':outputs,'adaptations':['Cocos UBO vec4 packing','original normalized texture coordinates reconstructed for cropped PNG','native y-down world position reconstructed from canvas position','unsigned ownership byte floor(v+.5) for GLES100'],
        'pending':['Creator compile','native full-page screenshot matrix','WeChat physical device']}
    (ROOT/'migration/records/M06-darkroom-shaders.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'outputs':len(outputs),'sources':len(sources)}))
if __name__=='__main__':main()
