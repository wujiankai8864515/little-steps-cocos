#!/usr/bin/env python3
"""Adapt original photo shaders to Cocos UI coordinates and trimmed textures."""
import hashlib,json,re
from import_godot_lighting import ROOT,ASSETS,read,effect,write,VERTEX,sources

def constant(text,name):
    return re.search(r'const '+name+r'\s*:=\s*"""([\s\S]*?)"""',text)[1]
def main():
    text=read('photo/photo_material.gd');atmosphere=constant(read('shared_room_lighting/soft_atmosphere.gd'),'FIELD')
    light=atmosphere+'float wall_field'+text.split('float wall_field',1)[1].split('"""',1)[0]
    uniforms='''
  uniform PhotoLight {vec4 pageOrigin;vec4 lightState;vec4 lightAmbient;vec4 lightTint;};
  #define light_origin lightState.xy
  #define light_energy lightState.z
  #define night lightState.w
  #define ambient_color lightAmbient.rgb
  #define sun_color lightTint.rgb
'''
    props={'pageOrigin':[0,0,1,1],'lightState':[-210,-160,.52,0],'lightAmbient':[.65,.61,.54,0],'lightTint':[1,.95,.82,0]}
    start='vec4 frag(){vec2 page_pos=vec2((canvasPosition.x-pageOrigin.x)/pageOrigin.z,(pageOrigin.y-canvasPosition.y)/pageOrigin.w);'
    receiver=light+start+'vec4 src=CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)*color;return vec4(src.rgb*paper_light(page_pos,vec3(0.0,0.0,1.0)),src.a);}'
    outputs=[write('photo-receiver',effect('photo-receiver',receiver,uniforms=uniforms,properties=props))]
    vertex=VERTEX.replace('in vec2 a_texCoord;','in float a_dist;\n out float lineDistance;').replace('uv0=a_texCoord;','uv0=vec2(0.5);lineDistance=a_dist;')
    line=receiver.replace('CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)*color','color').replace('return vec4','float aa=fwidth(lineDistance);src.a*=1.0-smoothstep(-max(aa,.00001),0.0,abs(lineDistance)-1.0);return vec4')
    outputs.append(write('photo-line',effect('photo-line',line,uniforms=uniforms+'\n in float lineDistance;\n #pragma extension([GL_OES_standard_derivatives, __VERSION__ < 300])',properties=props,vertex=vertex)))
    volume=text.split('const VOLUME',1)[1].split('void fragment(){',1)[1].split('"""',1)[0].rsplit('}',1)[0].replace('COLOR=','return ')
    outputs.append(write('photo-volume',effect('photo-volume',light+start+volume+'}',uniforms=uniforms,properties=props)))
    body=text.split('float line_segment',1)[1].split('const RECEIVER',1)[0].split('"""',1)[0]
    body='float line_segment'+body
    body=body.replace('void fragment(){',start).replace('UV','uv0').replace('COLOR=','return ')
    body=body.replace('texture(frame_tex,frame_uv.xy+q*frame_uv.zw)','texture(frame_tex,(frame_uv.xy+q*frame_uv.zw-frameCrop.xy)/frameCrop.zw)')
    body=body.replace('texture(photo_tex,mix(mix(photo_tl,photo_tr,p.x),mix(photo_bl,photo_br,p.x),p.y))','texture(photo_tex,(mix(mix(photo_tl,photo_tr,p.x),mix(photo_bl,photo_br,p.x),p.y)-photoCrop.xy)/photoCrop.zw)')
    body=body.replace('(stamp_mask&1)>0','mod(stamp_mask,2.0)>0.5').replace('(stamp_mask&2)>0','stamp_mask>1.5')
    paper_uniforms=uniforms+'''
  uniform PhotoPaper {vec4 frameUV;vec4 frameCrop;vec4 photoCrop;vec4 photoTop;vec4 photoBottom;vec4 paperState;};
  #define frame_uv frameUV
  #define photo_tl photoTop.xy
  #define photo_tr photoTop.zw
  #define photo_br photoBottom.xy
  #define photo_bl photoBottom.zw
  #define phase paperState.x
  #define stamp_mask paperState.y
  #define paper_size paperState.zw
'''
    paper_props={**props,'frameUV':[566/1280,2/1280,416/1280,512/1280],'frameCrop':[0,0,1,1],'photoCrop':[0,0,1,1],'photoTop':[0,0,1,0],'photoBottom':[1,1,0,1],'paperState':[0,0,192,222]}
    outputs.append(write('photo-paper',effect('photo-paper',light+body,['frame_tex','photo_tex'],uniforms=paper_uniforms,properties=paper_props)))
    shadow=constant(read('photo/photo_actor.gd'),'SHADOW').split('void fragment(){',1)[1].rsplit('}',1)[0].replace('TEXTURE_PIXEL_SIZE','shadowState.zw').replace('softness','shadowState.x').replace('opacity','shadowState.y').replace('texture(TEXTURE,','texture(cc_spriteTexture,').replace('UV','uv0').replace('COLOR=','return ')
    outputs.append(write('photo-shadow',effect('photo-shadow','vec4 frag(){'+shadow+'}',uniforms='uniform PhotoShadow {vec4 shadowState;};',properties={'shadowState':[2,.17,1/1280,1/1280]})))
    face=(ASSETS/'resources/effects/home-face.effect').read_text()
    for old,new in [('float gate=window_field(world_pos,cast_dir,cot_e);','float gate=0.7;'),('float moon_gate=window_field(world_pos,moon_cast_dir,1.6);','float moon_gate=0.7;'),('#define outdoor_enabled true','#define outdoor_enabled false')]:
        if old not in face:raise ValueError('Missing face transfer anchor '+old)
        face=face.replace(old,new)
    # Closed-eye patches use body-space normals and the same illumination,
    # but never restore open eye whites over the authored closed lids.
    old='source_albedo.rgb = restored_eye_white(source_albedo.rgb,source_pixel,left_white,right_white);'
    assert old in face
    face=face.replace(old,'if(bodyState.w<0.5){'+old+'}')
    outputs.append(write('photo-face',face))
    (ROOT/'migration/records/M08-photo-shaders.json').write_text(json.dumps({'schema':1,'sources':sources,'homeFaceSHA256':hashlib.sha256((ASSETS/'resources/effects/home-face.effect').read_bytes()).hexdigest(),'outputs':outputs,'limits':'Five original programs plus Cocos Graphics receiver attribute variant; original soft atmosphere/paper/eye restoration retained. Runtime GPU and WeChat pending.'},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'effects':len(outputs),'sources':len(sources)}))
if __name__=='__main__':main()
