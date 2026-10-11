#!/usr/bin/env python3
"""Invoke the production TravelModel through actual Creator in a declared QA build."""
import argparse,hashlib,json,subprocess,sys,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def sha(raw):return hashlib.sha256(raw).hexdigest()
ORACLE='''import { TravelModel } from './TravelModel';
import { GameAssets } from './Assets';
export function reviewTravelModel(assets:GameAssets){
 const row=(label:string,m:TravelModel,result:any=null)=>console.info('[LittleSteps QA] travel model row '+JSON.stringify({label,data:m.data,result,valid:TravelModel.valid(m.data)}));
 const fresh=(seed=7)=>{const m=new TravelModel();m.content=assets.json('res://travel/travel_content.json');m.begin(1000,seed,700,.3);return m;};
 for(const seed of [0,1,2,7,31,42,65536,2147483646]){const m=fresh(seed);row('initial:'+seed,m);m.reconcile(1099.999);row('preterminal:'+seed,m);m.reconcile(1100);row('terminal:'+seed,m);}
 let m=fresh();for(let seed=1;seed<100;seed++){m=fresh(seed);if(m.trip().events[0].reached_seconds<=40)break;}
 const selected=m.trip().seed;let uid=m.trip().events[0].uid;row('manual:enter',m,m.enter_event(uid,1040));let token=m.trip().choice_token;m.reconcile(1070);row('manual:paused',m);row('manual:choose',m,m.choose(uid,0,1070,token));row('manual:duplicate',m,m.choose(uid,0,1070,token));m.reconcile(1129.999);row('manual:preterminal',m);m.reconcile(1130);row('manual:terminal',m);
 row('reward:open',m,m.open_rewards());const reward=m.trip().rewards[0].uid;row('reward:start',m,m.start_reward_flight(reward,1131));row('reward:complete',m,m.complete_reward_flight(reward,1132));row('reward:duplicate',m,m.complete_reward_flight(reward,1133));
 for(const item of m.trip().rewards){if(item.state==='FLOATING')m.start_reward_flight(item.uid,1134);if(item.state==='FLYING')m.complete_reward_flight(item.uid,1135);}row('reward:all',m);const journal=m.data.journals[0],entry=journal.entries[0],preferred=entry.options[1].id;row('review:first',m,m.review(journal.trip_id,entry.uid,preferred));row('review:duplicate',m,m.review(journal.trip_id,entry.uid,preferred));
 const legacy=JSON.parse(JSON.stringify(m.data));legacy.schema=1;for(const key of ['route_elapsed_seconds','clock_mode','active_event_uid','choice_token','choice_sequence','rewards_opened','terminal_committed','terminal_uid'])delete legacy.active[key];for(const event of legacy.active.events){event.deadline=event.appears_at+10;delete event.reached_seconds;}for(const item of legacy.active.rewards)for(const key of ['state','flight_started_at','collected_at'])delete item[key];m.data=TravelModel.migrate(legacy);row('migration:claimed',m,legacy);
 m=fresh(selected);uid=m.trip().events[0].uid;m.enter_event(uid,1040);token=m.trip().choice_token;row('cancel:release',m,m.cancel_event(uid,1070,token));row('cancel:reopen',m,m.enter_event(uid,1070));row('cancel:stale',m,m.choose(uid,0,1070,token));m.cancel_event(uid,1070);m.reconcile(1130);row('cancel:terminal',m);
 m=fresh(selected);uid=m.trip().events[0].uid;m.enter_event(uid,1040);m.reconcile(1069);m.recover_session(1100);row('recovery:abandoned',m);m=fresh(7);m.reconcile(1055);m.reconcile(1030);row('clock:rollback',m);m.reconcile(2000);row('clock:overshoot',m);
 console.info('[LittleSteps QA] travel oracle complete '+JSON.stringify({seed_count:8,selected_seed:selected,engine:'Creator3.8.8',scope:'Production model invoked directly in declared QA; no Travel UI/device acceptance'}));
}
'''
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args()
    subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name,'--route','home','--hour','12','--freeze-clock'],check=True)
    stage=ROOT/'builds/work'/a.name;game=stage/'games/xiaoyu-cocos';path=game/'assets/game/Application.ts';before=path.read_bytes();text=before.decode();point='        director.once(Director.EVENT_AFTER_DRAW,()=>{if(scope.active)console.info(\'[LittleSteps] Home first draw\');});';assert text.count(point)==1;text="import { reviewTravelModel } from './QA_TravelOracle';\n"+text.replace(point,'        reviewTravelModel(this.assets);\n'+point);path.write_text(text)
    helper=game/'assets/game/QA_TravelOracle.ts';helper.write_text(ORACLE);helper.with_suffix('.ts.meta').write_text(json.dumps({'ver':'4.0.24','importer':'typescript','imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps/QA_TravelOracle.ts')),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
    record=ROOT/'builds/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text());r['overrides'].append({'file':'assets/game/Application.ts','sourceSHA256':sha(before),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declared direct production model oracle after actual prepared Home; no Travel page/input claim'});r['overrides'].append({'file':'assets/game/QA_TravelOracle.ts','fixtureSHA256':sha(helper.read_bytes()),'purpose':'Direct model calls with fixed eight seeds and choice/reward/review/migration/recovery inputs; production model/plugin/content bytes unchanged'})
    r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f.read_bytes()),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=sha(json.dumps(r['files'],sort_keys=True).encode());r['travelStateOracle']={'rows':45,'modelSHA256':sha((game/'assets/game/TravelModel.ts').read_bytes()),'actualRuntime':'pending','TravelUIandWeChat':'pending'};record.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'stage':str(stage),'snapshotSHA256':r['snapshotSHA256']}))
if __name__=='__main__':main()
