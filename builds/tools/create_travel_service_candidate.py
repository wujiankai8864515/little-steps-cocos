#!/usr/bin/env python3
"""Declared direct-API service traces; neither product Travel UI nor device QA."""
import argparse,hashlib,json,subprocess,sys,uuid
from pathlib import Path
from freeze_godot_plants import read_pack,replace_entries
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(raw):return hashlib.sha256(raw).hexdigest()

GD='''
class ReviewTravelFailingStore:
    extends "res://qa/travel_store.gd"
    var fail_next := false
    func commit(state: Dictionary, expected: int) -> bool:
        if fail_next:
            fail_next = false
            error = "injected_write_failure"
            return false
        return super.commit(state,expected)
var _review_service_clock := 1000.0
func _review_service_new(store: RefCounted = null) -> RefCounted:
    var service = load("res://qa/travel_service.gd").new()
    service.model.content = JSON.parse_string(FileAccess.get_file_as_string("res://qa/travel_content.json"))
    service.store = ReviewTravelFailingStore.new() if store == null else store
    service.wall_clock = func(): return _review_service_clock
    service.configure("qa_m0702",true)
    return service
func _review_service_row(label: String, service: RefCounted, result: Variant = null) -> void:
    print("[LittleSteps QA] travel service row ",JSON.stringify({"label":label,"data":service.model.data,"stored":service.store._memory,"projection":service.route_snapshot(),"result":result,"valid":service.model.valid(service.model.data),"service_error":service.last_error,"store_error":service.store.error,"needs_migration":service.store.needs_migration,"blocked":service.blocked,"loaded":service.loaded},"",true,true))
func _review_service_envelope(label: String, data: Dictionary) -> void:
    print("[LittleSteps QA] native travel envelope ",JSON.stringify({"label":label,"data":data,"envelope":load("res://qa/travel_store.gd").envelope(data)},"",true,true))
func _review_service_seed() -> RefCounted:
    _review_service_clock = 1000.0
    var service = _review_service_new()
    service.depart(700,0.3,1)
    return service
func _review_service_oracle() -> void:
    var s = _review_service_seed()
    _review_service_row("transaction:depart",s)
    _review_service_envelope("departed",s.model.data)
    var uid: String = s.model.trip().events[0].uid
    _review_service_clock = 1040.0
    s.store.fail_next = true
    _review_service_row("transaction:entry-failure",s,s.enter(uid))
    _review_service_row("transaction:entry-retry",s,s.enter(uid))
    var token: String = s.model.trip().choice_token
    _review_service_clock = 1070.0
    s.store.fail_next = true
    _review_service_row("transaction:choice-failure",s,s.choose(uid,0,token))
    _review_service_row("transaction:choice-retry",s,s.choose(uid,0,token))
    _review_service_row("transaction:choice-duplicate",s,s.choose(uid,0,token))
    _review_service_clock = 1130.0
    s.store.fail_next = true
    _review_service_row("transaction:terminal-failure",s,s.reconcile())
    _review_service_clock = 1131.0
    _review_service_row("transaction:terminal-retry",s,s.reconcile())
    _review_service_row("reward:open",s,s.claim())
    uid = s.model.trip().rewards[0].uid
    s.store.fail_next = true
    _review_service_row("reward:start-failure",s,s.start_reward_flight(uid))
    _review_service_row("reward:start-retry",s,s.start_reward_flight(uid))
    _review_service_row("reward:start-duplicate",s,s.start_reward_flight(uid))
    var restored = _review_service_new(s.store)
    _review_service_row("reward:restore-flight",restored)
    restored.store.fail_next = true
    _review_service_row("reward:complete-failure",restored,restored.complete_reward_flight(uid))
    _review_service_row("reward:complete-retry",restored,restored.complete_reward_flight(uid))
    _review_service_row("reward:complete-duplicate",restored,restored.complete_reward_flight(uid))
    for item: Dictionary in restored.model.trip().rewards:
        if item.state == "FLOATING": restored.start_reward_flight(item.uid)
        if item.state == "FLYING": restored.complete_reward_flight(item.uid)
    _review_service_row("reward:complete-all",restored)
    _review_service_envelope("claimed",restored.model.data)
    var journal: Dictionary = restored.model.data.journals[0]
    var event: Dictionary = journal.entries[0]
    var preference: String = event.options[1].id
    restored.store.fail_next = true
    _review_service_row("review:failure",restored,restored.review(journal.trip_id,event.uid,preference))
    _review_service_row("review:retry",restored,restored.review(journal.trip_id,event.uid,preference))
    _review_service_row("review:duplicate",restored,restored.review(journal.trip_id,event.uid,preference))
    var legacy: Dictionary = restored.model.data.duplicate(true)
    legacy.schema = 1
    for key: String in ["route_elapsed_seconds","clock_mode","active_event_uid","choice_token","choice_sequence","rewards_opened","terminal_committed","terminal_uid"]: legacy.active.erase(key)
    for item: Dictionary in legacy.active.events:
        item.deadline = item.appears_at + 10.0
        item.erase("reached_seconds")
    for item: Dictionary in legacy.active.rewards:
        for key: String in ["state","flight_started_at","collected_at"]: item.erase(key)
    var migration_store = ReviewTravelFailingStore.new()
    migration_store._memory = legacy
    _review_service_envelope("schema1-claimed",legacy)
    _review_service_clock = 1200.0
    _review_service_row("migration:durable",_review_service_new(migration_store))
    s = _review_service_seed()
    uid = s.model.trip().events[0].uid
    _review_service_clock = 1040.0
    s.enter(uid)
    _review_service_clock = 1070.0
    s.store.fail_next = true
    _review_service_row("cancel:failure",s,s.cancel_event())
    _review_service_clock = 1080.0
    _review_service_row("cancel:projected",s)
    _review_service_row("cancel:retry",s,s.reconcile())
    s = _review_service_seed()
    uid = s.model.trip().events[0].uid
    _review_service_clock = 1040.0
    s.enter(uid)
    _review_service_clock = 1069.0
    s.reconcile()
    _review_service_clock = 1100.0
    restored = _review_service_new(s.store)
    _review_service_row("recovery:abandoned",restored)
    var stale = _review_service_new(s.store)
    restored.capture_merit(999)
    stale.capture_merit(888)
    _review_service_row("revision:stale-writer",stale)
    _review_service_clock = 1101.0
    _review_service_row("revision:adopted-retry",stale,stale.reconcile())
    s = _review_service_seed()
    uid = s.model.trip().events[0].uid
    _review_service_clock = 1040.0
    s.enter(uid)
    s.store.fail_next = true
    var delayed = _review_service_new(s.store)
    _review_service_row("recovery:configure-failure",delayed)
    _review_service_clock = 1070.0
    s.cancel_event()
    s.enter(uid)
    _review_service_row("recovery:new-owner",s)
    _review_service_row("recovery:stale-release",delayed,delayed.reconcile())
    _review_service_row("recovery:preserve-new-token",delayed,delayed.reconcile())
    print("[LittleSteps QA] travel service oracle complete ",JSON.stringify({"rows":31,"scope":"Current service/store direct memory transactions; no Travel page/input/device acceptance"}))
'''
TS='''import { TravelService } from './TravelService';
import { TravelStore, travelRuntimeStorage } from './TravelStore';
import { TravelModel } from './TravelModel';
import { GameAssets } from './Assets';
class ReviewFailingStore extends TravelStore {
 fail_next=false;
 commit(state:any,expected:number){if(this.fail_next){this.fail_next=false;this.error='injected_write_failure';return false;}return super.commit(state,expected);}
 saved(){return this._memory;}
 seed(state:any){this._memory=state;}
}
export function reviewTravelService(assets:GameAssets){
 let clock=1000;
 const fresh=(store?:ReviewFailingStore)=>{const s=new TravelService();s.model.content=assets.json('res://travel/travel_content.json');s.store=store||new ReviewFailingStore();s.wall_clock=()=>clock;s.configure('qa_m0702',true);return s;};
 const seeded=()=>{clock=1000;const s=fresh();s.depart(700,.3,1);return s;};
 const row=(label:string,s:TravelService,result:any=null)=>console.info('[LittleSteps QA] travel service row '+JSON.stringify({label,data:s.model.data,stored:(s.store as ReviewFailingStore).saved(),projection:s.route_snapshot(),result,valid:TravelModel.valid(s.model.data),service_error:s.last_error,store_error:s.store.error,needs_migration:s.store.needs_migration,blocked:s.blocked,loaded:s.loaded}));
 const fail=(s:TravelService)=>(s.store as ReviewFailingStore).fail_next=true;
 let s=seeded();row('transaction:depart',s);let uid=s.model.trip().events[0].uid;clock=1040;fail(s);row('transaction:entry-failure',s,s.enter(uid));row('transaction:entry-retry',s,s.enter(uid));const token=s.model.trip().choice_token;
 clock=1070;fail(s);row('transaction:choice-failure',s,s.choose(uid,0,token));row('transaction:choice-retry',s,s.choose(uid,0,token));row('transaction:choice-duplicate',s,s.choose(uid,0,token));clock=1130;fail(s);row('transaction:terminal-failure',s,s.reconcile());clock=1131;row('transaction:terminal-retry',s,s.reconcile());row('reward:open',s,s.claim());uid=s.model.trip().rewards[0].uid;fail(s);row('reward:start-failure',s,s.start_reward_flight(uid));row('reward:start-retry',s,s.start_reward_flight(uid));row('reward:start-duplicate',s,s.start_reward_flight(uid));
 let restored=fresh(s.store as ReviewFailingStore);row('reward:restore-flight',restored);fail(restored);row('reward:complete-failure',restored,restored.complete_reward_flight(uid));row('reward:complete-retry',restored,restored.complete_reward_flight(uid));row('reward:complete-duplicate',restored,restored.complete_reward_flight(uid));for(const item of restored.model.trip().rewards){if(item.state==='FLOATING')restored.start_reward_flight(item.uid);if(item.state==='FLYING')restored.complete_reward_flight(item.uid);}row('reward:complete-all',restored);
 const journal=restored.model.data.journals[0],event=journal.entries[0],preference=event.options[1].id;fail(restored);row('review:failure',restored,restored.review(journal.trip_id,event.uid,preference));row('review:retry',restored,restored.review(journal.trip_id,event.uid,preference));row('review:duplicate',restored,restored.review(journal.trip_id,event.uid,preference));
 const legacy=JSON.parse(JSON.stringify(restored.model.data));legacy.schema=1;for(const key of ['route_elapsed_seconds','clock_mode','active_event_uid','choice_token','choice_sequence','rewards_opened','terminal_committed','terminal_uid'])delete legacy.active[key];for(const item of legacy.active.events){item.deadline=item.appears_at+10;delete item.reached_seconds;}for(const item of legacy.active.rewards)for(const key of ['state','flight_started_at','collected_at'])delete item[key];const migration=new ReviewFailingStore();migration.seed(legacy);clock=1200;row('migration:durable',fresh(migration));
 s=seeded();uid=s.model.trip().events[0].uid;clock=1040;s.enter(uid);clock=1070;fail(s);row('cancel:failure',s,s.cancel_event());clock=1080;row('cancel:projected',s);row('cancel:retry',s,s.reconcile());
 s=seeded();uid=s.model.trip().events[0].uid;clock=1040;s.enter(uid);clock=1069;s.reconcile();clock=1100;restored=fresh(s.store as ReviewFailingStore);row('recovery:abandoned',restored);const stale=fresh(s.store as ReviewFailingStore);restored.capture_merit(999);stale.capture_merit(888);row('revision:stale-writer',stale);clock=1101;row('revision:adopted-retry',stale,stale.reconcile());
 s=seeded();uid=s.model.trip().events[0].uid;clock=1040;s.enter(uid);fail(s);const delayed=fresh(s.store as ReviewFailingStore);row('recovery:configure-failure',delayed);clock=1070;s.cancel_event();s.enter(uid);row('recovery:new-owner',s);row('recovery:stale-release',delayed,delayed.reconcile());row('recovery:preserve-new-token',delayed,delayed.reconcile());
 console.info('[LittleSteps QA] travel service oracle complete '+JSON.stringify({rows:31,scope:'Production service/store direct memory transactions; no Travel page/input/device acceptance'}));
 reviewBrowserTravelReload(assets);
}
function reviewBrowserTravelReload(assets:GameAssets){
 const storage=travelRuntimeStorage(),marker='little-steps:qa:M07.02:reload',phase=storage.getItem(marker),s=new TravelService();s.model.content=assets.json('res://travel/travel_content.json');let clock=phase?1100:1000;s.wall_clock=()=>clock;s.configure('qa_m0702_browser',false);
 if(!phase){const started=s.depart(700,.3,1),uid=s.model.trip().events[0].uid;clock=1040;const entered=s.enter(uid);clock=1069;s.reconcile();storage.setItem(marker,'restore');console.info('[LittleSteps QA] browser travel persistence '+JSON.stringify({phase:'before-reload',started,entered,data:s.model.data,projection:s.route_snapshot(),error:s.last_error,store_error:s.store.error,valid:TravelModel.valid(s.model.data)}));}
 else console.info('[LittleSteps QA] browser travel persistence '+JSON.stringify({phase:'after-reload',data:s.model.data,projection:s.route_snapshot(),error:s.last_error,store_error:s.store.error,valid:TravelModel.valid(s.model.data)}));
 const button=document.createElement('button');button.textContent='QA：重载并恢复旅行存档';button.style.cssText='position:fixed;left:8px;top:8px;z-index:99999;padding:8px;background:#fff5dc;color:#593c23';button.onclick=()=>location.reload();document.body.appendChild(button);
}
'''

def main():
    p=argparse.ArgumentParser();p.add_argument('--engine',choices=['godot','cocos'],required=True);p.add_argument('--name',required=True);a=p.parse_args()
    assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    if a.engine=='godot':
        subprocess.run([sys.executable,str(ROOT/'builds/tools/freeze_godot_plants.py'),'--name',a.name,'--from-reference','godot-reference-noon-v1','--hour','12'],check=True)
        stage=ROOT/'builds/work'/a.name;web=stage/'web';pack=web/'index.pck';before=pack.read_bytes();entries={r['path']:r['data'] for r in read_pack(before)[1]};home=entries['qa/home_world.gd'].decode();point='        review_plants . wind_enabled = false\n';assert home.count(point)==1;home=home.replace(point,point+'        call_deferred("_review_service_oracle")\n')+GD
        replacements={'qa/home_world.gd':home.encode(),'qa/travel_content.json':(SOURCE/'travel/travel_content.json').read_bytes()};production=[]
        for name in ['travel_model.gd','travel_store.gd','travel_service.gd']:
            raw=(SOURCE/'travel'/name).read_bytes();remap=raw.decode().replace('res://travel/travel_model.gd','res://qa/travel_model.gd').replace('res://travel/travel_store.gd','res://qa/travel_store.gd');replacements['qa/'+name]=remap.encode();production.append({'path':'travel/'+name,'sourceSHA256':sha(raw),'fixtureSHA256':sha(remap.encode()),'override':'Only declared preload paths remapped to current QA scripts; product operations unchanged'})
        after,count,newcount=replace_entries(before,replacements);pack.write_bytes(after);overrides=[]
        for filename in ['resource_packs.host.json','index.html']:
            path=web/filename;raw=path.read_bytes()
            if filename.endswith('.json'):
                data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
            else:
                point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
            overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA PCK bytes and integrity'})
        record=ROOT/'builds/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text());r['overrides'].extend(overrides);r['overrides'].append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':newcount,'purpose':'Declared direct service API oracle after prepared Home, memory store; no Travel page/input claim','production':production,'replacements':[{'path':key,'sha256':sha(value)} for key,value in replacements.items()]});r['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()]
    else:
        subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name,'--route','home','--hour','12','--freeze-clock'],check=True)
        stage=ROOT/'builds/work'/a.name;game=stage/'games/xiaoyu-cocos';path=game/'assets/game/Application.ts';before=path.read_bytes();point="        director.once(Director.EVENT_AFTER_DRAW,()=>{if(scope.active)console.info('[LittleSteps] Home first draw');});";text=before.decode();assert text.count(point)==1;path.write_text("import { reviewTravelService } from './QA_TravelService';\n"+text.replace(point,'        reviewTravelService(this.assets);\n'+point))
        helper=game/'assets/game/QA_TravelService.ts';helper.write_text(TS);helper.with_suffix('.ts.meta').write_text(json.dumps({'ver':'4.0.24','importer':'typescript','imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps/QA_TravelService.ts')),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
        record=ROOT/'builds/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text());r['overrides'].extend([{'file':'assets/game/Application.ts','sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declared direct production service oracle after actual prepared Home; no Travel page/input claim'},{'file':'assets/game/QA_TravelService.ts','fixtureSHA256':sha(helper.read_bytes()),'purpose':'Declared fixed-clock API/failure traces and visible QA reload button; no production service/model/store/plugin changes'}]);r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=sha(json.dumps(r['files'],sort_keys=True).encode())
    r['travelServiceOracle']={'rows':31,'API':'direct service transactions, memory only','actualRuntime':'pending','browserReload':'pending' if a.engine=='cocos' else 'not covered','TravelUIandWeChat':'pending'};record.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'stage':str(stage),'record':str(record)}))
if __name__=='__main__':main()
