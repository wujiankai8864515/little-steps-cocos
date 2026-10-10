#!/usr/bin/env python3
"""Same earned-time bouquets in the two engines, with explicit QA overrides."""
import argparse,hashlib,json,math,re,subprocess,sys
from pathlib import Path
from freeze_godot_plants import replace_entries
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(v):return hashlib.sha256(v).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--engine',choices=['cocos','godot'],required=True);p.add_argument('--name',required=True);p.add_argument('--hour',type=float,default=12);p.add_argument('--earned',type=float,default=0);args=p.parse_args()
    if not math.isfinite(args.earned) or not 0<=args.earned<=3600:p.error('Earned fixture must be within one valid source advance: 0..3600 seconds')
    tool='create_candidate.py' if args.engine=='cocos' else 'freeze_godot_plants.py'
    argv=[sys.executable,str(ROOT/'builds/tools'/tool),'--name',args.name,'--hour',str(args.hour)]
    argv+=['--route','home','--freeze','--freeze-plants'] if args.engine=='cocos' else ['--from-reference','godot-reference-noon-v1']
    subprocess.run(argv,check=True);stage=ROOT/'builds/work'/args.name;record=ROOT/'builds/records/candidates'/f'{args.name}.json';report=json.loads(record.read_text());overrides=[]
    if args.engine=='cocos':
        script=stage/'games/xiaoyu-cocos/assets/game/HomeFlowers.ts';before=script.read_bytes();text=before.decode()
        old='getItem:(k:string)=>sys.localStorage.getItem(k),setItem:(k:string,v:string)=>sys.localStorage.setItem(k,v)';new='getItem:(k:string)=>reviewValues.get(k)||null,setItem:(k:string,v:string)=>{reviewValues.set(k,v);}'
        assert text.count(old)==1;text=text.replace(old,new)
        point='        this.bouquet=new FlowerBouquet';assert text.count(point)==1;text=text.replace(point,'        const reviewValues=new Map<string,string>();\n'+point)
        point='        this.syncTransform();this.draw(0,true);';assert text.count(point)==1;text=text.replace(point,f'        this.bouquet.model.advance({args.earned});\n'+point)
        point='this.bouquet.onVisual=(step,snap)=>this.draw(step,snap);';assert text.count(point)==1;text=text.replace(point,"this.bouquet.onVisual=(step,snap)=>{this.draw(step,snap);if(snap)console.info('[LittleSteps QA] bouquet checkpoint '+JSON.stringify(this.snapshot()));};")
        script.write_text(text);overrides.append({'path':str(script.relative_to(stage)),'sourceSHA256':sha(before),'fixtureSHA256':sha(script.read_bytes()),'purpose':'Isolated Map storage; deterministic earned-time initialization and public snap-pose trace; no physical/storage acceptance'})
        report['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for directory in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/directory).rglob('*')) if f.is_file()]
        report['snapshotSHA256']=sha(json.dumps(report['files'],sort_keys=True).encode())
    else:
        web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();replacements={};original_sources={}
        for relative in ['home/flowers/flower_life.gd','home/flowers/flower_head.gd','home/flowers/flower_stem.gd','home/flowers/flower_store.gd','home/flowers/persistent_vase.gd','home/flowers/tabletop_support.gd']:
            source=(SOURCE/relative).read_bytes();original_sources[relative]=sha(source);text=source.decode()
            if relative.endswith('persistent_vase.gd'):
                point='    var restored : bool = persistence_enabled';assert text.count(point)==1;text=text.replace(point,'    persistence_enabled = false\n'+point)
                point='    _make_vase ( )';assert text.count(point)==1;text=text.replace(point,f'    model . advance ( {args.earned} )\n'+point)
                point='        _visual_dirty = false\n\n# Compatibility';assert text.count(point)==1
                trace='''        var review_poses : Array = []
        for visual : Node2D in stems . values ( ) :
            var review_points : Array = []
            for point : Vector2 in visual . last_points : review_points . append ( [ point . x , point . y ] )
            review_poses . append ( { "id" : visual . identity , "points" : review_points , "bend" : visual . bend , "velocity" : visual . bend_velocity , "sleep" : visual . sleep_amount , "facing" : visual . facing , "head" : { "frame" : visual . head . source_frame , "nextFrame" : visual . head_next . source_frame , "blend" : visual . head_next . modulate . a , "angle" : visual . head . rotation , "scale" : visual . head . scale . x , "yaw" : visual . head . yaw , "pitch" : visual . head . pitch } } )
        print ( "[LittleSteps QA] bouquet checkpoint ", JSON . stringify ( { "model" : model . snapshot ( ) , "state" : debug_snapshot ( ) , "poses" : review_poses } , "" , true , true ) )
'''
                text=text.replace(point,'        _visual_dirty = false\n'+trace+'\n# Compatibility')
                point='func _sync_lighting_from_clock() -> void:\n';assert text.count(point)==1;text=text.replace(point,point+f'    _world . cycle_clock . seek_hour ( {args.hour} )\n')
                text=re.sub(r'func sync_active_elapsed \( total : float \) -> void :.*?(?=\nfunc advance_active)', 'func sync_active_elapsed ( _total : float ) -> void :\n    return\n',text,flags=re.S)
            target=relative;replacements[relative+'.remap']=f'[remap]\n\npath="res://{target}"\n'.encode();replacements[target]=text.encode()
        after,count,new_count=replace_entries(before,replacements);pack.write_bytes(after)
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare exact QA core pack byte count and checksum'})
        overrides.append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'originalSources':original_sources,'purpose':'Latest original flower scripts with isolated nonpersistent initialization, public pose trace, fixed flower clock hour and disabled earned-time sync; unrelated payloads retained','beforeEntries':count,'fixtureEntries':new_count,'unchangedPriorEntries':count-6,'replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]})
        report['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    report['overrides'].extend(overrides);report['flowerCheckpoint']={'earnedSeconds':args.earned,'visualSeconds':0,'pose':'initialization followed by active snap at selected hour','storage':'isolated/nonpersistent QA only','hour':args.hour,'browser':'pending','limits':'Same-state code/raster evidence; active growth, focus, persistence, all hours/sizes and WeChat device acceptance separate'}
    report['kind']='Explicit same-state flower QA checkpoint; not unchanged published behavior or formal release';record.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'engine':args.engine,'name':args.name,'record':str(record)}))
if __name__=='__main__':main()
