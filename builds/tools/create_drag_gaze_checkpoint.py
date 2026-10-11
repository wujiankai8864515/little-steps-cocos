#!/usr/bin/env python3
"""Explicit fixed-step eye checkpoint and native source oracle; no physical-input claim."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(v):return hashlib.sha256(v).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--engine',choices=['godot','cocos'],required=True);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    argv=[sys.executable,str(ROOT/'builds/tools'/('create_candidate.py' if a.engine=='cocos' else 'freeze_godot_plants.py')),'--name',a.name,'--hour','12']
    argv+=['--route','home','--freeze','--freeze-plants'] if a.engine=='cocos' else ['--from-reference','godot-reference-noon-v1']
    subprocess.run(argv,check=True);stage=ROOT/'builds/work'/a.name;record=ROOT/'builds/records/candidates'/f'{a.name}.json';report=json.loads(record.read_text());overrides=[]
    if a.engine=='cocos':
        path=stage/'games/xiaoyu-cocos/assets/game/HomePage.ts';before=path.read_bytes();s=before.decode();point="this.rig.setActiveDragFocus(dragBounds?'bag':'',dragBounds?[dragBounds[0]+dragBounds[2]/2,dragBounds[1]+dragBounds[3]/2]:[0,0],this.dragCarrier||this.roomRoot);";assert s.count(point)==1;s=s.replace(point,'void 0;');point='this.rig.advanceDragGaze(delta);';assert s.count(point)==1;s=s.replace(point,'void 0;');point='this.rig.poseAt(0)';assert s.count(point)==1;s=s.replace(point,'void 0')
        point='        this.lighting.update();\n        this.shadows.update();';assert s.count(point)==1;s=s.replace(point,"""        this.rig.resetSecondary();this.rig.setActiveDragFocus('bag',[619,528],this.roomRoot);
        for(let reviewStep=0;reviewStep<120;reviewStep++)this.rig.advanceDragGaze(1/60);
        console.info('[LittleSteps QA] drag gaze checkpoint '+JSON.stringify({gaze:this.rig.dragGaze.snapshot(),pupils:this.rig.pupilOffsets(),steps:120,target:[619,528]}));
"""+point);path.write_text(s)
        overrides.append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declared [619,528] focus and120 original1/60 springs; freeze only after same-state eye checkpoint, no browser-input assertion'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();entries={e['path']:e['data'] for e in read_pack(before)[1]};s=entries['qa/home_world.gd'].decode();point='func _advance_drag_gaze ( delta : float ) -> void :\n';assert s.count(point)==1;s=s.replace(point,'var _review_gaze_done: bool = false\n'+point+'    if _review_gaze_done: return\n')
        s+='''
func _review_drag_gaze_checkpoint() -> void:
    reset_secondary_pose()
    set_active_drag_focus(&"bag",Vector2(619,528))
    for review_step: int in range(120): _advance_drag_gaze(1.0/60.0)
    _review_gaze_done = true
    _update_character_meshes()
    _update_pupil_nodes()
    var body_frame: Transform2D = get_body_sprite().global_transform
    print("[LittleSteps QA] drag gaze checkpoint ",JSON.stringify({"gaze":_review_gaze_json(drag_gaze),"pupils":[[left_pupil_offset.x,left_pupil_offset.y],[right_pupil_offset.x,right_pupil_offset.y]],"body_frame":[body_frame.x.x,body_frame.x.y,body_frame.y.x,body_frame.y.y,body_frame.origin.x,body_frame.origin.y],"steps":120,"target":[619,528]},"",true,true))
    var oracle_body: Sprite2D = Sprite2D.new()
    add_child(oracle_body)
    oracle_body.position = Vector2(17,23)
    oracle_body.scale = Vector2(0.83,1.19)
    oracle_body.rotation = 0.17
    var oracle: RefCounted = DragGaze.new()
    var rows: Array = []
    for i: int in range(160):
        var dt: float = 1.0/60.0
        var jelly: Vector2 = Vector2.ZERO if i < 36 else Vector2(2.75,-3.5)
        var id: StringName = &"bag" if i < 36 else (&"doll" if i < 72 else &"bowl")
        var at: Vector2 = Vector2(619,528) if i < 36 else (Vector2(184,619) if i < 72 else Vector2(520,850))
        if i >= 72 and i < 100: dt = [0.1,1.0/240.0,1.0/60.0,0.0,-0.01][i % 5]
        if i == 90:
            oracle.set_target(&"invalid",Vector2(NAN,0))
            id = &""
        elif i >= 100:
            id = &""
            oracle.set_target(id,Vector2.ZERO)
        else: oracle.set_target(id,at)
        oracle.advance(dt,oracle_body,CharacterGeometry.LEFT_EYE_CENTER,CharacterGeometry.RIGHT_EYE_CENTER,jelly)
        var local: Vector2 = oracle_body.to_local(oracle.target_world)
        var baseline: Vector2 = Vector2(0.7,-0.45)
        rows.append({"frame":i,"delta":dt,"set_id":id,"set_target":[at.x,at.y],"local_target":[local.x,local.y],"jelly":[jelly.x,jelly.y],"gaze":_review_gaze_json(oracle),"blend":[[baseline.lerp(oracle.left,oracle.weight).x,baseline.lerp(oracle.left,oracle.weight).y],[baseline.lerp(oracle.right,oracle.weight).x,baseline.lerp(oracle.right,oracle.weight).y]]})
    oracle_body.queue_free()
    print("[LittleSteps QA] drag gaze native oracle ",JSON.stringify({"rows":rows},"",true,true))

func _review_gaze_json(value: RefCounted) -> Dictionary:
    return {"active_id":str(value.active_id),"target_world":[value.target_world.x,value.target_world.y],"left":[value.left.x,value.left.y],"right":[value.right.x,value.right.y],"left_velocity":[value.left_velocity.x,value.left_velocity.y],"right_velocity":[value.right_velocity.x,value.right_velocity.y],"weight":value.weight}
'''
        page=(SOURCE/'home/home_page.gd').read_bytes();t=page.decode();point='func _process ( delta : float ) -> void :\n';assert t.count(point)==1;t=t.replace(point,'var _review_gaze_started: bool = false\n'+point+'    if input_enabled and not _review_gaze_started:\n        _review_gaze_started = true\n        world.call_deferred("_review_drag_gaze_checkpoint")\n')
        replacements={'qa/home_world.gd':s.encode(),'home/home_page.gd.remap':b'[remap]\n\npath="res://qa/gaze_home_page.gd"\n','qa/gaze_home_page.gd':t.encode()}
        for relative in ['home/behavior/drag_gaze.gd','home/behavior/character_geometry.gd','home/behavior/eye_geometry.gd']:
            replacements[relative]=(SOURCE/relative).read_bytes();replacements[relative+'.remap']=f'[remap]\n\npath="res://{relative}"\n'.encode()
        after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA pack SHA/bytes'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':new_count,'purpose':'Native source160-frame eye oracle and same120-step visual focus; current exact eye/geometry/gaze scripts, explicit QA only','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]});report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['dragGaze']={'kind':'Explicit fixed-step focus checkpoint, not physical drag input','target':[619,528],'steps':120,'step':1/60,'nativeOracleFrames':160 if a.engine=='godot' else None,'browser':'pending','limits':'Full product/lighting/raster/WeChat parity pending'};record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'engine':a.engine,'record':str(record)}))
if __name__=='__main__':main()
