#!/usr/bin/env python3
"""Same hanging-backpack state, plus public original mesh/UV oracle trace."""
import argparse,hashlib,json,math,subprocess,sys
from pathlib import Path
from freeze_godot_plants import replace_entries
ROOT=Path(__file__).resolve().parents[2];SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(v):return hashlib.sha256(v).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--engine',choices=['cocos','godot'],required=True);p.add_argument('--name',required=True);p.add_argument('--hour',type=float,default=12);p.add_argument('--motion',type=float,default=0);args=p.parse_args()
    if not math.isfinite(args.motion) or not 0<=args.motion<=12 or abs(args.motion*60-round(args.motion*60))>1e-8:p.error('Motion requires exact 1/60 steps within 0..12 seconds')
    argv=[sys.executable,str(ROOT/'builds/tools'/('create_candidate.py' if args.engine=='cocos' else 'freeze_godot_plants.py')),'--name',args.name,'--hour',str(args.hour)]
    argv+=['--route','home','--freeze','--freeze-plants'] if args.engine=='cocos' else ['--from-reference','godot-reference-noon-v1']
    subprocess.run(argv,check=True);stage=ROOT/'builds/work'/args.name;record=ROOT/'builds/records/candidates'/f'{args.name}.json';report=json.loads(record.read_text());overrides=[]
    if args.engine=='cocos':
        path=stage/'games/xiaoyu-cocos/assets/game/HomePage.ts';before=path.read_bytes();text=before.decode();point='this.backpack.advance(delta)';assert text.count(point)==1;text=text.replace(point,'this.backpack.advance(0)');path.write_text(text);overrides.append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Freeze backpack only after declared fixed-step checkpoint; no shipping override'})
        path=stage/'games/xiaoyu-cocos/assets/game/HomeBackpack.ts';before=path.read_bytes();text=before.decode();point='        this.advance(0);this.updateShadows();';assert text.count(point)==1
        text=text.replace(point,'        this.geometry.reset(this.roomPoint(this.proxy,[0,0]));this.geometry.phase=0;\n'+f'        for(let reviewStep=0;reviewStep<{round(args.motion*60)};reviewStep++)this.geometry.advance(1/60,this.roomPoint(this.proxy,[0,0]));\n'+point+"console.info('[LittleSteps QA] backpack checkpoint '+JSON.stringify({...this.snapshot(),meshes:Array.from(this.geometry.parts.values()).map(p=>({key:p.key,source:Array.from(p.mesh.source),vertices:Array.from(p.mesh.vertices),indices:Array.from(p.mesh.indices)}))}));")
        path.write_text(text);overrides.append({'path':str(path.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Fixed-step source motion and one public mesh/UV checkpoint; rendering unchanged'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for directory in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/directory).rglob('*')) if f.is_file()];report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();replacements={}
        for relative in ['home/secondary/articulated_backpack.gd','home/secondary/spring_mesh_part.gd']:
            replacements[relative+'.remap']=f'[remap]\n\npath="res://{relative}"\n'.encode();replacements[relative]=(SOURCE/relative).read_bytes()
        relative='qa/home_world.gd'
        from freeze_godot_plants import read_pack
        entries=read_pack(before)[1];text=next(e['data'] for e in entries if e['path']==relative).decode();point='        review_plants . wind_enabled = false\n';assert text.count(point)==1
        patch=f'''        var review_props : Variant = get_node ( "RoomPropsController" )
        review_props . set_process ( false )
        var review_bag : Variant = review_props . backpack_rig
        review_bag . reset_motion ( )
        review_bag . _phase = 0.0
        for review_step : int in range ( {round(args.motion*60)} ) : review_bag . advance ( 1.0 / 60.0 )
        review_bag . advance ( 0.0 )
        var review_parts : Array = []
        for key : String in review_bag . pieces :
            var part : Variant = review_bag . pieces [ key ]
            var vertices : Array = []
            var source_uv : Array = []
            var indices : Array = []
            for v : Vector2 in part . mesh . polygon : vertices . append ( [ v . x , v . y ] )
            for v : Vector2 in part . mesh . uv : source_uv . append ( [ v . x , v . y ] )
            for tri : PackedInt32Array in part . _indices :
                for v : int in tri : indices . append ( v )
            review_parts . append ( {{ "key" : key , "position" : [ part . position . x , part . position . y ] , "scale" : [ part . scale . x , part . scale . y ] , "rotation" : part . rotation , "angles" : [ part . angles . x , part . angles . y , part . angles . z ] , "velocities" : [ part . velocities . x , part . velocities . y , part . velocities . z ] , "source" : source_uv , "vertices" : vertices , "indices" : indices , "inverted" : part . inverted_triangle_count ( ) }} )
        var review_approved : Array = []
        for key : String in review_bag . approved_parts :
            var part : Polygon2D = review_bag . approved_parts [ key ]
            var points : Array = []
            var source_uv : Array = []
            for v : Vector2 in part . polygon : points . append ( [ v . x , v . y ] )
            for v : Vector2 in part . uv : source_uv . append ( [ v . x , v . y ] )
            review_approved . append ( {{ "key" : key , "vertices" : points , "source" : source_uv , "indices" : Array ( review_bag . _approved_hit_triangles [ part . get_instance_id ( ) ] ) }} )
        print ( "[LittleSteps QA] backpack checkpoint ", JSON . stringify ( {{ "phase" : review_bag . _phase , "parts" : review_parts , "approved" : review_approved }} , "" , true , true ) )
'''
        replacements[relative]=text.replace(point,point+patch).encode();after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA pack size and checksum'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':new_count,'purpose':'Latest original Backpack/Part scripts, frozen original props and declared fixed-step motion; public actual mesh/UV trace; unrelated payloads retained','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]})
        report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['backpackCheckpoint']={'mode':'hanging','hour':args.hour,'motionSeconds':args.motion,'steps':round(args.motion*60),'stepSeconds':1/60,'browser':'pending','limits':'Declared same-state geometry/raster checkpoint; worn meshes emitted as original geometry oracle only, not worn interaction or device acceptance'};record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'engine':args.engine,'record':str(record)}))
if __name__=='__main__':main()
