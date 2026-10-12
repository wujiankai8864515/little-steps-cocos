#!/usr/bin/env python3
"""Run current unmodified Godot TravelModel in a declared Web QA overlay."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from freeze_godot_plants import replace_entries
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT.parent/'little-steps/games/travel_woodfish/project'
def sha(raw):return hashlib.sha256(raw).hexdigest()
ORACLE='''
var _review_travel_done = false
func _review_travel_row(label: String, model: RefCounted, result: Variant = null) -> void:
    print("[LittleSteps QA] travel model row ",JSON.stringify({"label":label,"data":model.data,"result":result,"valid":model.valid(model.data)},"",true,true))
func _review_travel_model(seed_value: int = 7) -> RefCounted:
    var model = load("res://qa/travel_model.gd").new()
    model.content = JSON.parse_string(FileAccess.get_file_as_string("res://qa/travel_content.json"))
    model.begin(1000.0,seed_value,700,0.3)
    return model
func _review_travel_oracle() -> void:
    if _review_travel_done: return
    _review_travel_done = true
    for seed_value: int in [0,1,2,7,31,42,65536,2147483646]:
        var model = _review_travel_model(seed_value)
        _review_travel_row("initial:"+str(seed_value),model)
        model.reconcile(1099.999)
        _review_travel_row("preterminal:"+str(seed_value),model)
        model.reconcile(1100.0)
        _review_travel_row("terminal:"+str(seed_value),model)
    var model = _review_travel_model()
    for seed_value: int in range(1,100):
        model = _review_travel_model(seed_value)
        if model.trip().events[0].reached_seconds <= 40.0: break
    var selected_seed: int = model.trip().seed
    var uid: String = model.trip().events[0].uid
    _review_travel_row("manual:enter",model,model.enter_event(uid,1040.0))
    var token: String = model.trip().choice_token
    model.reconcile(1070.0)
    _review_travel_row("manual:paused",model)
    _review_travel_row("manual:choose",model,model.choose(uid,0,1070.0,token))
    _review_travel_row("manual:duplicate",model,model.choose(uid,0,1070.0,token))
    model.reconcile(1129.999)
    _review_travel_row("manual:preterminal",model)
    model.reconcile(1130.0)
    _review_travel_row("manual:terminal",model)
    _review_travel_row("reward:open",model,model.open_rewards())
    var reward_uid: String = model.trip().rewards[0].uid
    _review_travel_row("reward:start",model,model.start_reward_flight(reward_uid,1131.0))
    _review_travel_row("reward:complete",model,model.complete_reward_flight(reward_uid,1132.0))
    _review_travel_row("reward:duplicate",model,model.complete_reward_flight(reward_uid,1133.0))
    for reward: Dictionary in model.trip().rewards:
        if reward.state == "FLOATING": model.start_reward_flight(reward.uid,1134.0)
        if reward.state == "FLYING": model.complete_reward_flight(reward.uid,1135.0)
    _review_travel_row("reward:all",model)
    var journal: Dictionary = model.data.journals[0]
    var entry: Dictionary = journal.entries[0]
    var preferred: String = entry.options[1].id
    _review_travel_row("review:first",model,model.review(journal.trip_id,entry.uid,preferred))
    _review_travel_row("review:duplicate",model,model.review(journal.trip_id,entry.uid,preferred))
    var legacy: Dictionary = model.data.duplicate(true)
    legacy.schema = 1
    for key: String in ["route_elapsed_seconds","clock_mode","active_event_uid","choice_token","choice_sequence","rewards_opened","terminal_committed","terminal_uid"]: legacy.active.erase(key)
    for event: Dictionary in legacy.active.events:
        event.deadline = event.appears_at + 10.0
        event.erase("reached_seconds")
    for reward: Dictionary in legacy.active.rewards:
        for key: String in ["state","flight_started_at","collected_at"]: reward.erase(key)
    model.data = model.migrate(legacy)
    _review_travel_row("migration:claimed",model,legacy)
    model = _review_travel_model(selected_seed)
    uid = model.trip().events[0].uid
    model.enter_event(uid,1040.0)
    token = model.trip().choice_token
    _review_travel_row("cancel:release",model,model.cancel_event(uid,1070.0,token))
    _review_travel_row("cancel:reopen",model,model.enter_event(uid,1070.0))
    _review_travel_row("cancel:stale",model,model.choose(uid,0,1070.0,token))
    model.cancel_event(uid,1070.0)
    model.reconcile(1130.0)
    _review_travel_row("cancel:terminal",model)
    model = _review_travel_model(selected_seed)
    uid = model.trip().events[0].uid
    model.enter_event(uid,1040.0)
    model.reconcile(1069.0)
    model.recover_session(1100.0)
    _review_travel_row("recovery:abandoned",model)
    model = _review_travel_model(7)
    model.reconcile(1055.0)
    model.reconcile(1030.0)
    _review_travel_row("clock:rollback",model)
    model.reconcile(2000.0)
    _review_travel_row("clock:overshoot",model)
    print("[LittleSteps QA] travel oracle complete ",JSON.stringify({"seed_count":8,"selected_seed":selected_seed,"engine":Engine.get_version_info().string,"scope":"Current unmodified TravelModel invoked directly; no page/input/device acceptance"}))
'''
def main():
    p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args();assert a.name and all(c.isalnum() or c in '-_' for c in a.name)
    subprocess.run([sys.executable,str(ROOT/'migration/tools/freeze_godot_plants.py'),'--name',a.name,'--from-reference','godot-reference-noon-v1','--hour','12'],check=True)
    web=ROOT/'migration/work'/a.name/'web';pack=web/'index.pck';before=pack.read_bytes()
    # The review-hour hook executes only after Home is prepared in this fixture.
    from freeze_godot_plants import read_pack
    entries={entry['path']:entry['data'] for entry in read_pack(before)[1]}
    home=entries['qa/home_world.gd'].decode();point='        review_plants . wind_enabled = false\n';assert home.count(point)==1;home=home.replace(point,point+'        call_deferred("_review_travel_oracle")\n')+ORACLE
    replacements={'qa/home_world.gd':home.encode(),'qa/travel_model.gd':(SOURCE/'travel/travel_model.gd').read_bytes(),'qa/travel_content.json':(SOURCE/'travel/travel_content.json').read_bytes()}
    after,count,newcount=replace_entries(before,replacements);pack.write_bytes(after);overrides=[]
    for filename in ['resource_packs.host.json','index.html']:
        path=web/filename;raw=path.read_bytes()
        if filename.endswith('.json'):
            data=json.loads(raw);assert data['packs']['core']['sha256']==sha(before);data['packs']['core'].update(bytes=len(after),sha256=sha(after));path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
        else:
            point='"index.pck":'+str(len(before));text=raw.decode();assert text.count(point)==1;path.write_text(text.replace(point,'"index.pck":'+str(len(after))))
        overrides.append({'path':filename,'beforeFixtureSHA256':sha(raw),'fixtureSHA256':sha(path.read_bytes()),'purpose':'Declare actual QA PCK bytes and integrity'})
    record=ROOT/'migration/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text());r['overrides'].extend(overrides);r['overrides'].append({'path':'index.pck','beforeFixtureSHA256':sha(before),'fixtureSHA256':sha(after),'beforeEntries':count,'fixtureEntries':newcount,'purpose':'Direct model oracle after prepared Home, no actual Travel page/input claim; current Godot TravelModel and content bytes unchanged','replacements':[{'path':key,'sha256':sha(value)} for key,value in replacements.items()]});r['travelModelOracle']={'sourceModelSHA256':sha(replacements['qa/travel_model.gd']),'contentSHA256':sha(replacements['qa/travel_content.json']),'scope':'Eight deterministic route plans and choice/reward/review/migration/recovery traces; backend3D Web native Godot; no UI acceptance','actualRuntime':'pending'};r['fixtureFiles']=[{'path':str(f.relative_to(web)),'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())} for f in sorted(web.rglob('*')) if f.is_file()];record.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'web':str(web),'packSHA256':sha(after)}))
if __name__=='__main__':main()
