#!/usr/bin/env python3
"""Select the actual original wear/return API; retain every declared QA override."""
from legacy_source import legacy_reference
import argparse,hashlib,json,math,subprocess,sys
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2];SOURCE=legacy_reference() / 'games/travel_woodfish/project'
def sha(value):return hashlib.sha256(value).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--engine',choices=['cocos','godot'],required=True);p.add_argument('--name',required=True);p.add_argument('--hour',type=float,default=12);p.add_argument('--wear-seconds',type=float,default=.25);p.add_argument('--return-seconds',type=float,default=-1);a=p.parse_args()
    for v in [a.wear_seconds,a.return_seconds]:
        if v==-1:continue
        if not math.isfinite(v) or not 0<=v<=1 or abs(v*60-round(v*60))>1e-8:p.error('Exact 1/60 checkpoints within 0..1 seconds required')
    assert a.wear_seconds>=0
    steps=round(a.wear_seconds*60);returning=a.return_seconds>=0;return_steps=round(a.return_seconds*60) if returning else 0
    subprocess.run([sys.executable,str(ROOT/'migration/tools/create_backpack_checkpoint.py'),'--engine',a.engine,'--name',a.name,'--hour',str(a.hour)],check=True)
    stage=ROOT/'migration/work'/a.name;record=ROOT/'migration/records/candidates'/f'{a.name}.json';report=json.loads(record.read_text());overrides=[]
    if a.engine=='cocos':
        path=stage/'games/xiaoyu-cocos/assets/game/HomePage.ts';before=path.read_bytes();text=before.decode();point='this.rig.poseAt(0)';assert text.count(point)==1;text=text.replace(point,'this.rig.advance(0,this.clock.nightProgress()>=0)');point='        this.sortRoomLayers();';assert text.count(point)==1
        patch=f'''        this.rig.suspend();this.backpack.reset();this.backpack.geometry.phase=0;this.backpack.showWorn();
        for(let reviewStep=0;reviewStep<{steps};reviewStep++)this.backpack.advance(1/60);
'''
        if returning:patch+=f'        this.backpack.restore();for(let reviewStep=0;reviewStep<{return_steps};reviewStep++)this.backpack.advance(1/60);\n'
        patch+='''        this.backpack.updateShadows();
        const reviewBones=this.rig.backpackNodes();console.info('[LittleSteps QA] worn backpack checkpoint '+JSON.stringify({...this.backpack.snapshot(),actualBones:{grip:-reviewBones.grip.angle*Math.PI/180,shoulder:[reviewBones.shoulder.position.x,-reviewBones.shoulder.position.y],tailScale:[reviewBones.tailBone.scale.x,reviewBones.tailBone.scale.y]},approvedMeshes:this.backpack.approved.parts.map(p=>({key:p.key,source:Array.from(p.mesh.source),fitted:Array.from(p.fitted),vertices:Array.from(p.mesh.vertices),indices:Array.from(p.mesh.indices),passes:p.passes.map(m=>({vertices:Array.from(m.vertices),vertexData:Array.from(m.vertexData)}))}))}));
'''
        path.write_text(text.replace(point,patch+point));overrides.append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Freeze ambient/backpack after real wear/return API at fixed steps; public actual bones/mesh trace; rendering unchanged'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();relative='qa/home_world.gd';text=next(e['data'] for e in read_pack(before)[1] if e['path']==relative).decode();point='        print ( "[LittleSteps QA] backpack checkpoint "'
        pos=text.index(point);end=text.index('\n',pos)+1
        patch=f'''        suspend_ambient ( true )
        review_props . show_worn_backpack ( get_node ( "Bag" ) , rig . position + Vector2 ( 335 , 336 ) )
        for review_step : int in range ( {steps} ) : review_props . advance_motion ( 1.0 / 60.0 )
'''
        if returning:patch+=f'        review_props . restore_backpack ( )\n        for review_step : int in range ( {return_steps} ) : review_props . advance_motion ( 1.0 / 60.0 )\n'
        patch+='''        review_bag . advance ( 0.0 )
        var review_worn : Array = []
        for key : String in review_bag . approved_parts :
            var part : Polygon2D = review_bag . approved_parts [ key ]
            var frame : Transform2D = global_transform . affine_inverse ( ) * part . global_transform
            var fitted : Array = []
            var source_uv : Array = []
            var vertices : Array = []
            for v : Vector2 in part . polygon :
                fitted . append ( [ v . x , v . y ] )
                var world_local : Vector2 = to_local ( part . to_global ( v ) )
                vertices . append ( [ world_local . x , world_local . y ] )
            for v : Vector2 in part . uv : source_uv . append ( [ v . x , v . y ] )
            var passes : Array = []
            for node : MeshInstance2D in review_bag . _worn_projections [ key ] . passes :
                var material : ShaderMaterial = node . material
                var payload : = { "visible" : node . is_visible_in_tree ( ) }
                if node . is_visible_in_tree ( ) :
                    var direction : Vector2 = material . get_shader_parameter ( "projection_direction" )
                    payload [ "direction" ] = [ direction . x , direction . y ]
                    for name : String in [ "cot_e" , "ground_y" , "strength" , "penumbra_scale" , "source_opacity" ] : payload [ name ] = material . get_shader_parameter ( name )
                passes . append ( payload )
            review_worn . append ( { "key" : key , "source" : source_uv , "fitted" : fitted , "vertices" : vertices , "indices" : Array ( review_bag . _approved_hit_triangles [ part . get_instance_id ( ) ] ) , "frame" : [ frame . x . x , frame . x . y , frame . y . x , frame . y . y , frame . origin . x , frame . origin . y ] , "visible" : part . is_visible_in_tree ( ) , "alpha" : part . modulate . a , "z" : part . z_index , "passes" : passes } )
        var review_proxy : Sprite2D = get_node ( "Bag" )
        var review_bounds : Rect2 = review_bag . visual_bounds ( )
        print ( "[LittleSteps QA] worn backpack checkpoint ", JSON . stringify ( { "mode" : review_bag . mode , "wearAmount" : review_bag . _wear_amount , "blend" : smoothstep ( 0.0 , 1.0 , review_bag . _wear_amount ) , "proxy" : { "position" : [ review_proxy . position . x , review_proxy . position . y ] , "scale" : [ review_proxy . scale . x , review_proxy . scale . y ] , "rotation" : review_proxy . rotation , "z" : review_proxy . z_index } , "actualBones" : { "grip" : grip_bone . rotation , "shoulder" : [ shoulder_bone . position . x , shoulder_bone . position . y ] , "tailScale" : [ tail_bone . scale . x , tail_bone . scale . y ] } , "tailVisible" : get_node ( "XiaoyuRig/Skeleton2D/Ground/Body/Tail/OriginalTail" ) . visible , "bounds" : [ review_bounds . position . x , review_bounds . position . y , review_bounds . size . x , review_bounds . size . y ] , "projection" : review_bag . worn_projection_snapshot ( ) , "approvedMeshes" : review_worn } , "" , true , true ) )
'''
        method='\nfunc _review_worn_checkpoint ( ) -> void :\n    reset_secondary_pose ( )\n    var review_props : Variant = get_node ( "RoomPropsController" )\n    review_props . set_process ( false )\n    var review_bag : Variant = review_props . backpack_rig\n    review_bag . reset_motion ( )\n    review_bag . _phase = 0.0\n'
        method+='\n'.join(line[4:] for line in patch.splitlines())+'\n'
        page_source=SOURCE/'home/home_page.gd';page=page_source.read_text();point='func _process ( delta : float ) -> void :\n';assert page.count(point)==1
        page=page.replace(point,'var _review_worn_started : bool = false\n\n'+point+'    if input_enabled and not _review_worn_started :\n        _review_worn_started = true\n        world . call_deferred ( "_review_worn_checkpoint" )\n')
        props='home/room_props_controller.gd';replacements={relative:(text+method).encode(),props:(SOURCE/props).read_bytes(),props+'.remap':f'[remap]\n\npath="res://{props}"\n'.encode(),'home/home_page.gd.remap':b'[remap]\n\npath="res://qa/home_page.gd"\n','qa/home_page.gd':page.encode()}
        after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA pack size/checksum'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':new_count,'purpose':'Latest original props source and declared real wear/return API at fixed steps; public actual bones/mesh trace; unrelated payloads retained','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]})
        report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['wornCheckpoint']={'hour':a.hour,'wearSteps':steps,'returnSteps':return_steps if returning else None,'stepSeconds':1/60,'browser':'pending','limits':'Declared wear/return state and actual rendered screenshot; real prop pointer/cross-canvas/departure/all sizes/WeChat pending.'};record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'engine':a.engine,'record':str(record)}))
if __name__=='__main__':main()
