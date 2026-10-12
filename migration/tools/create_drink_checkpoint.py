#!/usr/bin/env python3
"""Declared controller drink checkpoint, with native frame evidence; no physical-input claim."""
from legacy_source import legacy_reference
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2];SOURCE=legacy_reference() / 'games/travel_woodfish/project'
def sha(v):return hashlib.sha256(v).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--engine',choices=['cocos','godot'],required=True);p.add_argument('--steps',type=int,default=60);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name);assert 1<=a.steps<=167
    argv=[sys.executable,str(ROOT/'migration/tools'/('create_candidate.py' if a.engine=='cocos' else 'freeze_godot_plants.py')),'--name',a.name,'--hour','12']
    argv+=['--route','home','--freeze','--freeze-plants'] if a.engine=='cocos' else ['--from-reference','godot-reference-noon-v1']
    subprocess.run(argv,check=True);stage=ROOT/'migration/work'/a.name;record=ROOT/'migration/records/candidates'/f'{a.name}.json';report=json.loads(record.read_text());overrides=[]
    if a.engine=='cocos':
        path=stage/'games/xiaoyu-cocos/assets/game/HomePage.ts';before=path.read_bytes();s=before.decode()
        for old,new in [('this.props.advance(delta)','void 0'),('this.rig.poseAt(0)','void 0'),('this.propVisuals.marks.advance(delta)','this.propVisuals.marks.advance(0)'),('this.rig.advanceDragGaze(delta)','void 0')]:
            assert s.count(old)==1,old;s=s.replace(old,new)
        point='        this.lighting.update();\n        this.shadows.update();';assert s.count(point)==1
        code=f'''        this.rig.resetSecondary();if(!this.props.requestDrink())throw new Error('QA bowl attention refused');
        const reviewDrinkRows=[];for(let reviewStep=0;reviewStep<{a.steps};reviewStep++){{this.props.advance(1/60);this.propVisuals.marks.advance(1/60);reviewDrinkRows.push(this.propVisuals.snapshot().drink);}}
        this.sortRoomLayers();console.info('[LittleSteps QA] drink checkpoint '+JSON.stringify({{steps:{a.steps},input:this.props.snapshot(),visual:this.propVisuals.snapshot(),rig:this.rig.snapshot(),rows:reviewDrinkRows}}));
'''
        path.write_text(s.replace(point,code+point));overrides.append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Original attention API, declared1/60 ticks then frozen final bones/bowl/mark; public contact trace, no real pointer claim'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();entries={e['path']:e['data'] for e in read_pack(before)[1]};s=entries['qa/home_world.gd'].decode()
        s=s.replace('action_marks . advance ( delta )','action_marks . advance ( 0.0 if _review_drink_done else delta )');s=s.replace('    _advance_drag_gaze ( delta )','    if not _review_drink_done: _advance_drag_gaze ( delta )')
        s+=f'''
var _review_drink_done: bool = false
func _review_drink_checkpoint() -> void:
    var page: Node = get_parent()
    while page != null and not page.has_method("begin_drag_presentation"): page = page.get_parent()
    var controller: RefCounted = page.interaction
    reset_secondary_pose()
    if not controller.request_attention(&"bowl"):
        push_error("QA bowl attention refused")
        return
    var rows: Array = []
    for i: int in range({a.steps}):
        controller.update(1.0/60.0)
        action_marks.advance(1.0/60.0)
        var ctx: Dictionary = controller.active_context
        var bowl: Sprite2D = get_node("Bowl")
        var mouth: Vector2 = ctx.mouth_contact_world
        var rim: Vector2 = ctx.rim_contact_world
        var offsets: Vector4 = secondary_motion.offset
        rows.append({{"age":ctx.elapsed,"phase":str(ctx.phase),"mouth":[mouth.x,mouth.y],"rim":[rim.x,rim.y],"rimGap":ctx.rim_gap_px,"bowlPosition":[bowl.position.x,bowl.position.y],"rotation":bowl.rotation,"secondary":[offsets.x,offsets.y,offsets.z,offsets.w],"mouthOpen":face_motion.mouth_open_px,"gaze":[_gaze_offset.x,_gaze_offset.y]}})
    _review_drink_done = true
    _update_character_meshes()
    _update_pupil_nodes()
    update_lighting()
    print("[LittleSteps QA] drink checkpoint ",JSON.stringify({{"steps":{a.steps},"input":controller.debug_snapshot(),"rows":rows}},"",true,true))
'''
        page=(SOURCE/'home/home_page.gd').read_text();point='func _process ( delta : float ) -> void :\n';assert page.count(point)==1
        page=page.replace(point,'var _review_drink_started: bool = false\n'+point+'    if input_enabled and not _review_drink_started:\n        _review_drink_started = true\n        world.call_deferred("_review_drink_checkpoint")\n');point='    if is_instance_valid ( interaction ) : interaction . update ( delta )';assert page.count(point)==1;page=page.replace(point,'    if is_instance_valid ( interaction ) : pass')
        replacements={'qa/home_world.gd':s.encode(),'home/home_page.gd.remap':b'[remap]\n\npath="res://qa/drink_home_page.gd"\n','qa/drink_home_page.gd':page.encode()}
        for relative in ['home/interaction/home_interaction_controller.gd','home/behavior/character_geometry.gd','home/action_marks.gd']:
            replacements[relative]=(SOURCE/relative).read_bytes();replacements[relative+'.remap']=f'[remap]\n\npath="res://{relative}"\n'.encode()
        after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA pack SHA and bytes'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':new_count,'purpose':'Original controller and source drink marks; declared attention and ticks, then freeze; unrelated payloads preserved','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]});report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['drinkCheckpoint']={'kind':'Declared fixed-step original drink API, not actual pointer input','steps':a.steps,'step':1/60,'hour':12,'browser':'pending','allPagesAndWechat':'pending'};record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'engine':a.engine,'record':str(record)}))
if __name__=='__main__':main()
