#!/usr/bin/env python3
"""Transfer the original incense rod and tabletop clipping; no gameplay."""
import hashlib,json,re
from pathlib import Path
from import_godot_lighting import ROOT,ASSETS,read,include,effect,write,UNIFORMS,PROPERTIES,VERTEX,sources

def main():
    shader=read('shaders/incense_stick.gdshader');gate=include('shaders/window_field.gdshaderinc');outdoor=include('shaders/outdoor_window.gdshaderinc');outdoor=re.sub(r'^uniform .*;\n','',outdoor,flags=re.M)
    fragment=shader.split('void fragment(){',1)[1].split('\nvoid light(){',1)[0].rsplit('}',1)[0].replace('texture(TEXTURE,UV)','CCSampleWithAlphaSeparated(cc_spriteTexture,uv0)').replace('COLOR','result').replace('    NORMAL=normalize(vec3(normal.xy,normal.z));','')
    receiver=(ASSETS/'resources/effects/home-receiver.effect').read_text();lamp='    vec2 lamp_delta='+receiver.split('    vec2 lamp_delta=',1)[1].split('    return result*color;',1)[0]
    uniforms=UNIFORMS+'\n  uniform IncenseState {vec4 incenseState;};\n  #define rod_length incenseState.x\n  #define ember_strength incenseState.y\n'
    body=gate+'\n'+outdoor+'\nvec4 frag(){\nvec2 world_pos=vec2((canvasPosition.x-roomOrigin.x)/roomOrigin.z,(roomOrigin.y-canvasPosition.y)/roomOrigin.w);vec2 UV=uv0;vec4 source_albedo,result;vec3 surf_normal;float exterior_mask;\n'+fragment+lamp+'return result*color;}\n'
    outputs=[write('home-incense',effect('home-incense',body,['shared_outdoor_paint'],uniforms=uniforms,properties={**PROPERTIES,'incenseState':[224,1,0,0]}))]
    vertex=VERTEX.replace('out vec4 color;','out vec4 color;\n  out vec3 sourcePayload;').replace('color=a_color;','color=a_color; sourcePayload=a_color.xyz;')
    outputs.append(write('home-smoke',effect('home-smoke','vec4 frag(){return vec4(0.79,0.8,0.77,sourcePayload.x*color.a);}',uniforms='in vec3 sourcePayload;',properties={},vertex=vertex)))
    table=read('home/flowers/tabletop_support.gd');literal=re.search(r'var clip : = ("[^\n]*")',table)[1];clip=json.loads(literal);clip=re.sub(r'\nuniform vec2 [^\n]+','',clip)
    base=ASSETS/'resources/effects/home-shadow.effect';text=base.read_text();assert text.count('a*strength*g')==1
    text=text.replace('        roomOrigin:','        tableOrigin: { value: [0, 0, 0, 0] }\n        tableAxes: { value: [1, 0, 0, 1] }\n        roomOrigin:',1)
    marker='  uniform ShadowState';text=text.replace(marker,'  uniform TabletopState {vec4 tableOrigin;vec4 tableAxes;};\n  #define tabletop_origin tableOrigin.xy\n  #define tabletop_axis_x tableAxes.xy\n  #define tabletop_axis_y tableAxes.zw\n'+marker,1)
    text=text.replace('vec4 frag(){',clip+'\nvec4 frag(){',1).replace('a*strength*g','a*strength*g*tabletop_mask(world_pos)');outputs.append(write('home-table-shadow',text))
    record={'schema':1,'sources':sources,'existingReceiverSHA256':hashlib.sha256(receiver.encode()).hexdigest(),'existingShadowSHA256':hashlib.sha256(base.read_bytes()).hexdigest(),'outputs':outputs,'limits':'Original formulas adapted to Cocos; shader compilation, same-state rod/smoke/tabletop pixels and WeChat GPU still require runtime verification'}
    (ROOT/'migration/records/M04-incense-shader-source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'effects':len(outputs),'sources':len(sources)}))
if __name__=='__main__':main()
