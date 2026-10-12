#!/usr/bin/env python3
"""Declared public Home departure-view QA; no trip save or production entry claim."""
from legacy_source import legacy_reference
import argparse,hashlib,json,subprocess,sys,uuid
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2]
SOURCE=legacy_reference() / 'games/travel_woodfish/project'
def sha(raw):return hashlib.sha256(raw).hexdigest()

GD='''
var _review_departure_callbacks: Array = []
var _review_departure_home: Control
func _review_departure_row(label: String, visual: Node2D) -> void:
    print("[LittleSteps QA] departure row ",JSON.stringify({"label":label,"age":visual.age,"origin":[visual.origin.x,visual.origin.y],"actorPosition":[visual.actor.position.x,visual.actor.position.y],"actorScale":[visual.actor.scale.x,visual.actor.scale.y],"nativeVisible":visual.native_visible(),"nativeAlpha":visual.native_alpha(),"actorVisible":visual.actor.visible,"actorAlpha":visual.actor_alpha,"cloudAge":visual.cloud_age,"cloudElapsed":visual.clouds.elapsed,"tint":[visual.modulate.r,visual.modulate.g,visual.modulate.b],"finished":visual.age>=4.8},"",true,true))
func _review_departure_oracle() -> void:
    _review_departure_home = get_parent().get_parent()
    while not _review_departure_home.input_enabled or not _review_departure_home.is_visible_in_tree():
        await get_tree().process_frame
    await get_tree().process_frame
    await get_tree().process_frame
    var ready: bool = await _review_departure_home.departure_resource_loader.call()
    if not ready:
        push_error("QA departure resource preparation failed")
        return
    var texture: Texture2D = load("res://travel/assets/travel_map_actor_v5.png")
    for light: Array in [[0.0,0.0],[1.0,0.0],[1.0,0.78],[0.37,0.39]]:
        var visual: Node2D = load("res://qa/home_departure_visual.gd").new()
        add_child(visual)
        visual.configure(texture,Vector2(350,951))
        visual.set_lighting(light[0],light[1])
        for age: float in [0.0,0.34,0.55,0.76,0.9,1.2,1.5,1.9,3.3,4.0,4.55,4.8,2.0,4.8]:
            visual.advance(age)
            _review_departure_row(str(light[0])+":"+str(light[1])+":"+str(age),visual)
        visual.release()
    _review_departure_home.travel.set_process(false)
    _review_departure_home.set_process(false)
    _review_departure_home.begin_departure_actor()
    _review_departure_home.advance_departure_actor(0.0)
    _review_departure_controls()
    print("[LittleSteps QA] departure view ",JSON.stringify({"age":0.0,"directAPI":true,"savedTrip":false},"",true,true))
func _review_departure_controls() -> void:
    var document = JavaScriptBridge.get_interface("document")
    var bar = document.createElement("div")
    bar.style.cssText = "position:fixed;left:4px;top:4px;z-index:99999;background:#fff3dc;color:#603b22;font:12px sans-serif;max-width:390px"
    for age: float in [0.55,0.76,1.2,1.9,4.0,4.8]:
        var button = document.createElement("button")
        button.textContent = "QA " + str(age) + "s"
        var callback = JavaScriptBridge.create_callback(_review_departure_seek.bind(age))
        _review_departure_callbacks.append(callback)
        button.onclick = callback
        bar.appendChild(button)
    document.body.appendChild(bar)
func _review_departure_seek(_args: Array,age: float) -> void:
    _review_departure_home.advance_departure_actor(age)
    if age>=4.8: _review_departure_home.finish_departure_actor()
    update_lighting()
    print("[LittleSteps QA] departure view ",JSON.stringify({"age":age,"directAPI":true,"savedTrip":false},"",true,true))
'''

TS='''import { GameAssets } from './Assets';
import { HomePage } from './HomePage';
import { DepartureMotion } from './DepartureMotion';
import { DEPARTURE_EFFECTS } from './HomeDepartureVisual';
import { lifetime, Scope } from './Engine';
export async function reviewDeparture(assets:GameAssets,home:HomePage,owner:Scope){
 for(const light of [[0,0],[1,0],[1,.78],[.37,.39]]){
  const pose=new DepartureMotion([350,951]);pose.setLighting(...light as [number,number]);
  for(const age of [0,.34,.55,.76,.9,1.2,1.5,1.9,3.3,4,4.55,4.8,2,4.8]){pose.advance(age);console.info('[LittleSteps QA] departure row '+JSON.stringify({label:light.join(':')+':'+age,...pose.snapshot()}));}
 }
 const scope=lifetime(owner);await assets.acquireGroups(['departure_visual'],scope);await assets.acquireEffects(DEPARTURE_EFFECTS,scope);
 const normalAdvance=home.advance.bind(home);home.advance=()=>normalAdvance(0);
 home.beginDeparture(scope);normalAdvance(0);
 const row=()=>console.info('[LittleSteps QA] departure view '+JSON.stringify({directAPI:true,savedTrip:false,...home.departureSnapshot(),resources:assets.snapshot()}));row();
 const bar=document.createElement('div');bar.style.cssText='position:fixed;left:4px;top:4px;z-index:99999;background:#fff3dc;color:#603b22;font:12px sans-serif;max-width:390px';
 for(const age of [.55,.76,1.2,1.9,4,4.8]){const button=document.createElement('button');button.textContent='QA '+age+'s';button.onclick=()=>{home.advanceDeparture(age);normalAdvance(0);if(age>=4.8)home.finishDeparture();row();};bar.appendChild(button);}document.body.appendChild(bar);
}'''

def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);p.add_argument('--engine',choices=['godot','cocos'],required=True);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    if a.engine=='godot':
        subprocess.run([sys.executable,str(ROOT/'migration/tools/freeze_godot_plants.py'),'--name',a.name,'--from-reference','godot-reference-noon-v1','--hour','12'],check=True)
        stage=ROOT/'migration/work'/a.name;web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();entries={r['path']:r['data'] for r in read_pack(before)[1]};home=entries['qa/home_world.gd'].decode();point='        review_plants . wind_enabled = false\n';assert home.count(point)==1;home=home.replace(point,point+'        call_deferred("_review_departure_oracle")\n')+GD
        replacements={'qa/home_world.gd':home.encode(),'qa/home_departure_visual.gd':(SOURCE/'home/home_departure_visual.gd').read_bytes()}
        after,count,newcount=replace_entries(before,replacements);pack.write_bytes(after);overrides=[]
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA PCK size and preserve integrity'})
        record=ROOT/'migration/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text());r['overrides'].extend(overrides);r['overrides'].append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':newcount,'purpose':'Current untouched departure visual source plus direct API oracle and visible seek buttons after real resource loader; no saved trip or real bag confirmation','replacements':[{'path':k,'sha256':sha(v)} for k,v in replacements.items()]});r['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    else:
        subprocess.run([sys.executable,str(ROOT/'migration/tools/create_candidate.py'),'--name',a.name,'--route','home','--hour','12','--freeze','--freeze-plants'],check=True)
        stage=ROOT/'migration/work'/a.name;game=stage/'games/xiaoyu-cocos';path=game/'assets/game/Application.ts';before=path.read_bytes();point="        director.once(Director.EVENT_AFTER_DRAW,()=>{if(scope.active)console.info('[LittleSteps] Home first draw');});";text=before.decode();assert text.count(point)==1;path.write_text("import { reviewDeparture } from './QA_Departure';\n"+text.replace(point,'        reviewDeparture(this.assets,page,scope);\n'+point))
        helper=game/'assets/game/QA_Departure.ts';helper.write_text(TS);helper.with_suffix('.ts.meta').write_text(json.dumps({'ver':'4.0.24','importer':'typescript','imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps/QA_Departure.ts')),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
        record=ROOT/'migration/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text());r['overrides'].extend([{'file':'assets/game/Application.ts','sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declared direct production Home departure API test after prepared Home; no Service or product entry claim'},{'file':'assets/game/QA_Departure.ts','fixtureSHA256':sha(helper.read_bytes()),'purpose':'Declared fixed-age API oracle and visible seek controls; freeze Home update at delta zero; no product view/motion changes'}]);r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=sha(json.dumps(r['files'],sort_keys=True).encode())
    r['departureViewQA']={'rows':56,'actualRuntime':'pending','screenshots':'pending','productEntryLoadingAndPersistence':'not covered','WeChat':'pending'};record.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'stage':str(stage),'record':str(record)}))
if __name__=='__main__':main()
