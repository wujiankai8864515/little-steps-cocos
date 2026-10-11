#!/usr/bin/env python3
"""Native Godot doll oracle, declared source-only QA injection; no pointer claim."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(value):return hashlib.sha256(value).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--isolate',action='store_true');a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    subprocess.run([sys.executable,str(ROOT/'builds/tools/freeze_godot_plants.py'),'--name',a.name,'--from-reference','godot-reference-noon-v1','--hour','12'],check=True)
    stage=ROOT/'builds/work'/a.name;web=stage/'web';pack=web/'index.pck';before=pack.read_bytes()
    page=(SOURCE/'darkroom/darkroom_page.gd').read_text()
    page+='''
var _review_oracle_started := false
func _process(_delta: float) -> void:
    if input_enabled and not _review_oracle_started:
        _review_oracle_started = true
        call_deferred("_review_start_oracle")
func _review_start_oracle() -> void:
    world.restart_session()
    world.set_process(false)
    print("[LittleSteps QA] doll native oracle ",JSON.stringify(_review_doll_oracle(),"",true,true))
func _review_doll_oracle() -> Dictionary:
    var rig: Node2D = world.doll_rig
    var order: Array = ["torso","left_arm","right_arm","head","left_leg","right_leg","bow"]
    rig.reset_pose()
    var rows: Array = []
    for i: int in range(160):
        var duration: float = 0.05 if i % 37 == 0 else 1.0/60.0
        var rotation: float = 0.035*sin(float(i)*0.13)
        var acceleration := Vector2(sin(float(i)*0.21)*1800.0,cos(float(i)*0.17)*1400.0)
        world.doll_root.rotation = rotation
        if i == 0: rig.apply_contact(&"needle",rig.source_point_to_global(Vector2(240.5,350.5)))
        if i == 30: rig.apply_contact(&"slipper",rig.source_point_to_global(Vector2(300.5,190.5)))
        if i == 55: rig.set_dragging(true)
        if i == 112: rig.set_dragging(false)
        if i == 100: rig.apply_contact(&"slipper",rig.source_point_to_global(Vector2(130.5,307.5)))
        rig.advance(duration,acceleration)
        var state: Dictionary = rig.snapshot()
        var omega: Array = []
        for id: StringName in order: omega.append(rig.velocities[id])
        var samples: Array = []
        for index: int in [0,114,223,401,544,711,825,976,1088]:
            samples.append([index,rig.skin_points[index].x,rig.skin_points[index].y])
        var probes: Array = []
        for pixel: Vector2 in [Vector2(240.5,350.5),Vector2(300.5,190.5),Vector2(130.5,307.5),Vector2(278,35)]:
            var at: Vector2 = rig.source_point_to_global(pixel)
            probes.append({"pixel":[pixel.x,pixel.y],"world":[at.x,at.y],"part":str(rig.part_at(at))})
        var full: Array = []
        if i in [10,30,90,159]:
            for point: Vector2 in rig.skin_points: full.append([point.x,point.y])
        rows.append({"frame":i,"delta":duration,"rootRotation":rotation,"acceleration":[acceleration.x,acceleration.y],"rig":state,"velocities":omega,"samples":samples,"probes":probes,"fullVertices":full})
    return {"rows":rows,"contractSHA256":rig.contract.source_sha256,"steps":160,"input":"Declared native bone/contact APIs, not actual pointer input"}
'''
    if a.isolate:
        point='    world.set_process(false)\n'
        assert page.count(point)==1
        page=page.replace(point,point+'''    world.doll_material.set_shader_parameter("light_tint",Vector3(1.0,0.97,0.91))
    room_viewport.transparent_bg = true
    world.doll_rig.sync_visual_material()
    for child: Node in world.get_children():
        if child != world.doll_root and child is CanvasItem: child.hide()
        if child.name == "IndependentRoomPlants": child.set_process(false)
    bleed.hide()
    hud.hide()
    return_plaque.hide()
    bubble.dismiss()
    var background := ColorRect.new()
    background.color = Color(32.0/255.0,26.0/255.0,25.0/255.0)
    background.size = Vector2(720,1280)
    background.z_index = -100
    composition.add_child(background)
''')
    replacements={}
    for relative,source in [('darkroom/darkroom_page.gd',page)]:
        replacements[relative+'.remap']=f'[remap]\n\npath="res://qa/{Path(relative).name}"\n'.encode()
        replacements['qa/'+Path(relative).name]=source.encode()
    after,count,newcount=replace_entries(before,replacements);pack.write_bytes(after)
    overrides=[]
    for filename in ['resource_packs.host.json','index.html']:
        path=web/filename;raw=path.read_bytes()
        if filename.endswith('.json'):
            data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
        else:
            point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
        overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA core payload size and SHA'})
    overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':newcount,'purpose':'Page-only QA calls unchanged compiled native doll and World with declared160-frame trace; actual Home→Darkroom entry; freeze after trace'+('; isolated doll with declared fixed tint and solid background, no full-page acceptance' if a.isolate else ''),'replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]})
    record=ROOT/'builds/records/candidates'/f'{a.name}.json';report=json.loads(record.read_text());report['overrides'].extend(overrides)
    report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['dollCheckpoint']={'steps':160,'isolated':a.isolate,'browser':'pending','allPagesAndWechat':'pending','currentSourceSHA256':{'rig':sha((SOURCE/'darkroom/helpers/articulated_doll.gd').read_bytes()),'world':sha((SOURCE/'darkroom/darkroom_world.gd').read_bytes())}}
    record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'record':str(record),'web':str(web)}))
if __name__=='__main__':main()
