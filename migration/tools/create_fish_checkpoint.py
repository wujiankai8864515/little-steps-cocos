#!/usr/bin/env python3
"""Declared, deterministic fish-input QA checkpoints for both real engines.

These drive the original controller interfaces in saved fixture source. They
prove a fixed rendered pose, never physical touch/device or complete parity.
"""
from legacy_source import legacy_reference
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
from freeze_godot_plants import read_pack, replace_entries

ROOT=Path(__file__).resolve().parents[2]
POINTS={'body':[350,800],'tail':[130,855],'fin':[477,870]}
def sha(value):return hashlib.sha256(value).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--engine',choices=['cocos','godot'],required=True);p.add_argument('--name',required=True);p.add_argument('--part',choices=list(POINTS),default='body');p.add_argument('--hour',type=float,default=12);p.add_argument('--phase',type=float,default=.7);p.add_argument('--from-reference',default='godot-reference-noon-v1');args=p.parse_args()
    if not math.isfinite(args.phase) or not 0<=args.phase<=5 or abs(args.phase*60-round(args.phase*60))>1e-8:p.error('Phase must be 0..5 seconds in 1/60 steps')
    at=POINTS[args.part];to=[at[0]+30,at[1]-240];steps=round(args.phase*60)
    tool='create_candidate.py' if args.engine=='cocos' else 'freeze_godot_plants.py'
    argv=[sys.executable,str(ROOT/'migration/tools'/tool),'--name',args.name,'--hour',str(args.hour)]
    if args.engine=='cocos':argv+=['--route','home','--freeze','--freeze-plants']
    else:argv+=['--from-reference',args.from_reference]
    subprocess.run(argv,check=True)
    stage=ROOT/'migration/work'/args.name;record=ROOT/'migration/records/candidates'/f'{args.name}.json';report=json.loads(record.read_text());overrides=[]
    if args.engine=='cocos':
        path=stage/'games/xiaoyu-cocos/assets/game/HomePage.ts';before=path.read_bytes();text=before.decode()
        for old,new in [('this.fish.advance(delta)','this.fish.advance(0)'),('this.rig.poseAt(0)','void 0'),('this.feedback.advance(delta)','this.feedback.advance(0)')]:
            assert text.count(old)==1,old;text=text.replace(old,new)
        point='        this.lighting.update();\n        this.shadows.update();';assert text.count(point)==1
        code=f'''        this.rig.resetSecondary();
        if(!this.fish.down(246,{json.dumps(at)}))throw new Error('QA checkpoint alpha hit refused');
        for(let reviewStep=0;reviewStep<21;reviewStep++){{this.feedback.advance(1/60);this.fish.advance(1/60);}}
        this.fish.move(246,{json.dumps(to)});
        for(let reviewStep=0;reviewStep<{steps};reviewStep++){{this.feedback.advance(1/60);this.fish.advance(1/60);}}
        console.info('[LittleSteps QA] fish checkpoint '+JSON.stringify({{part:'{args.part}',phase:{args.phase},input:this.fish.snapshot(),rig:this.rig.snapshot()}}));
'''
        text=text.replace(point,code+point);path.write_text(text)
        overrides.append({'path':'games/xiaoyu-cocos/assets/game/HomePage.ts','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Drive declared controller inputs at fixed 1/60 steps, then freeze controller, actor and ripple; real engine rendering continues'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for directory in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/directory).rglob('*')) if f.is_file()]
        report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();entries={e['path']:e['data'] for e in read_pack(before)[1]};world=entries['qa/home_world.gd'].decode()
        world+=f'''
func _review_fish_checkpoint ( ) -> void :
    var page : Node = get_parent ( )
    while page != null and not page . has_method ( "begin_drag_presentation" ) : page = page . get_parent ( )
    if page == null :
        push_error ( "QA HomePage missing" )
        return
    var controller : RefCounted = page . interaction
    reset_secondary_pose ( )
    if not controller . pointer_down ( 246 , Vector2 ( {at[0]} , {at[1]} ) ) :
        push_error ( "QA checkpoint alpha hit refused" )
        return
    for review_step : int in range ( 21 ) : controller . update ( 1.0 / 60.0 )
    controller . pointer_move ( 246 , Vector2 ( {to[0]} , {to[1]} ) )
    for review_step : int in range ( {steps} ) : controller . update ( 1.0 / 60.0 )
    _update_character_meshes ( )
    _update_pupil_nodes ( )
    update_lighting ( )
    print ( "[LittleSteps QA] fish checkpoint ", JSON . stringify ( {{ "part" : "{args.part}" , "phase" : {args.phase} , "input" : controller . debug_snapshot ( ) , "rig_position" : rig . position , "grab_pixel" : _grab_attachment_pixel , "grab_part" : _grab_attachment . name , "lift_amount" : _lift_amount , "lift_elapsed" : _lift_elapsed , "drag_lag" : _drag_lag , "secondary" : secondary_motion . offset , "mouth" : face_motion . mouth_open_px , "pupil_left" : left_pupil_offset , "pupil_right" : right_pupil_offset }} ) )
'''
        source=legacy_reference() / 'games/travel_woodfish/project/home/home_page.gd';page=source.read_text();old='interaction . update ( delta )';assert page.count(old)==1;page=page.replace(old,'interaction . update ( 0.0 )')
        point='func _process ( delta : float ) -> void :\n';assert page.count(point)==1
        page=page.replace(point,'var _review_fish_started : bool = false\n\n'+point+'    if input_enabled and not _review_fish_started :\n        _review_fish_started = true\n        world . call_deferred ( "_review_fish_checkpoint" )\n')
        replacements={'qa/home_world.gd':world.encode(),'home/home_page.gd.remap':b'[remap]\n\npath="res://qa/home_page.gd"\n','qa/home_page.gd':page.encode()}
        after,original_count,fixture_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare exact fixed-pose QA pack size and SHA'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'purpose':'Drive original Home controller in fixed steps and freeze its update; only QA source/remaps change','beforeEntries':original_count,'fixtureEntries':fixture_count,'untouchedPriorEntries':original_count-2,'sourceHomePageSHA256':sha(source.read_bytes()),'sourceHomePageCommit':subprocess.check_output(['git','-C',str(legacy_reference()),'rev-parse','HEAD'],text=True).strip(),'replacements':[{'path':path,'sha256':sha(value)} for path,value in replacements.items()]})
        report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['kind']='Deterministic controller-driven fish QA checkpoint; not physical touch or a formal release'
    report['fishCheckpoint']={'part':args.part,'pointer':246,'down':at,'longPressSteps':21,'move':to,'liftSteps':steps,'stepSeconds':1/60,'phase':args.phase,'release':False,'browser':'pending','scope':'Fixed lift pose, mesh, face, render space and projection only; action marks, physical drag and complete product parity pending'}
    record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'name':args.name,'engine':args.engine,'record':str(record)}))
if __name__=='__main__':main()
