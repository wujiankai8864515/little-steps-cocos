#!/usr/bin/env python3
"""Keep the native handwritten-ink shader distinct from raw atlas receivers."""
import hashlib, json, re
from import_godot_lighting import ROOT, read, include, effect, write, UNIFORMS, PROPERTIES, sources

def main():
    source = read('travel/travel_open_diary_art.gd')
    shader = source.split('const INK_SHADER := """', 1)[1].split('"""', 1)[0]
    fragment = shader.split('void fragment() {', 1)[1].split('\nvoid light()', 1)[0].rsplit('}', 1)[0]
    fragment = fragment.replace('    ink = COLOR;', '').replace('    COLOR = vec4(lit,ink.a);', '    vec4 result = vec4(lit,ink.a);')
    gate = include('shaders/window_field.gdshaderinc')
    body = gate + '''
vec4 frag() {
    vec2 world_pos = vec2((canvasPosition.x-roomOrigin.x)/roomOrigin.z,(roomOrigin.y-canvasPosition.y)/roomOrigin.w);
    vec4 ink;
    if (inkMode.x > 0.5) ink = vec4(inkColor.rgb, inkColor.a * color.r * color.a);
    else ink = CCSampleWithAlphaSeparated(cc_spriteTexture,uv0) * color;
''' + fragment + '''
    // Same radial lamp and light-height mapping as the other Home receivers.
    // Godot's additive canvas light blend multiplies LIGHT.rgb by LIGHT.a.
    vec2 lamp_delta = vec2(465.0,468.0)-world_pos;
    float lamp_radius = length(lamp_delta)/672.0;
    float lamp_alpha = lamp_radius<0.35?mix(1.0,0.45,lamp_radius/0.35):mix(0.45,0.0,clamp((lamp_radius-0.35)/0.65,0.0,1.0));
    vec3 lamp_direction = normalize(vec3(lamp_delta,150.0));
    float diffuse = 0.55+0.45*max(lamp_direction.z,0.0);
    result.rgb += ink.rgb*vec3(1.0,0.65,0.29)*weightsState.z*diffuse*lamp_alpha*ink.a;
    return result;
}
'''
    output = write('home-diary-ink', effect('home-diary-ink', body, uniforms=UNIFORMS+'\n uniform DiaryState {vec4 inkColor;vec4 inkMode;};\n', properties={**PROPERTIES,'inkColor':[1,1,1,1],'inkMode':[0,0,0,0]}))
    record = {'schema':1,'id':'M07.05','sources':sources,'outputs':[output], 'nativeDrawing':{'source':'https://github.com/godotengine/godot/blob/4.5.2-stable/scene/main/canvas_item.cpp','license':'MIT; existing engines/travel-core/NOTICE.godot.txt','details':'Aligned non-AA dashes, 20-point AA arc, 64-point filled non-AA dot; feather polylines use existing Godot-derived framework'},'limits':['Actual shader compile/render and same-state native comparison pending','TTF rasterization and native mipmapped atlas filtering remain subject to pixel comparison','Does not implement the journal page itself']}
    (ROOT/'builds/records/M07-diary-shader-source.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'effects':1,'sources':len(sources)}))
if __name__=='__main__':main()
