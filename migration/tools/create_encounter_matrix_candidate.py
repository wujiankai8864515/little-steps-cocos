#!/usr/bin/env python3
"""Create an explicit QA-only fixture for all original encounter branches.

Real Application/pages/service are used. Only candidate Boot owns deterministic
trips, in-memory storage and visible write-failure controls; no product patch.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess, sys
ROOT = Path(__file__).resolve().parents[2]
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
BOOT = '''import { _decorator, Component, profiler, ResolutionPolicy, view } from 'cc';
import { Application } from './game/Application';
import { TravelModel } from './game/TravelModel';
import { TravelStore } from './game/TravelStore';
const {ccclass}=_decorator;
@ccclass('Boot')
export class Boot extends Component {
    private app:Application;private at=1000;private failWrites=false;private status:HTMLElement;private elapsed=0;private currentUid='';
    async start(){
        try{
            view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);profiler.hideStats();
            this.app=new Application(this.node);this.app.clock.seekHour(12);await this.app.start('home');
            const app:any=this.app,service=app.travel.service,content=service.model.content,seeds=new Map<string,number>();
            for(let seed=1;seed<=256&&seeds.size<content.events.length;seed++){const model=new TravelModel();model.content=content;model.begin(1000,seed,700,.3);for(const e of model.trip().events)if(!seeds.has(e.id))seeds.set(e.id,seed);}
            if(seeds.size!==content.events.length)throw Error('Missing generated encounter');
            const bar=document.createElement('div');bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#fff3dc;color:#603b22;font:12px sans-serif;padding:4px';document.body.appendChild(bar);
            const select=document.createElement('select');select.setAttribute('aria-label','奇遇类型');for(const event of content.events){const opt=document.createElement('option');opt.value=event.id;opt.textContent=event.id+' · '+event.title;select.appendChild(opt);}bar.appendChild(select);
            const button=(text:string,action:()=>any)=>{const b=document.createElement('button');b.textContent=text;b.onclick=()=>Promise.resolve(action()).catch(e=>console.error('[LittleSteps QA] MATRIX_ACTION_FAILED',e));bar.appendChild(b);return b;};
            const load=button('载入所选奇遇',async()=>{
                load.disabled=true;try{
                    if(app.page!==app.homePage.page)await app.returnHome();this.failWrites=false;failure.textContent='模拟保存失败：关';this.at=1000;
                    service.store=new TravelStore();service.wall_clock=()=>this.at;service.configure('qa_encounter_matrix',true);
                    if(!service.depart(700,.3,seeds.get(select.value)))throw Error('Fixture departure failed');
                    const event=service.model.trip().events.find((e:any)=>e.id===select.value);this.currentUid=event.uid;this.at=1000+event.reached_seconds;service.reconcile();
                    const commit=service.store.commit.bind(service.store);service.store.commit=(data:any,revision:number)=>{if(this.failWrites){service.store.error='qa_injected_write_failure';return false;}return commit(data,revision);};
                    await app.openJournal('map');if(!app.page.session.enter(this.currentUid))throw Error('Fixture event entry failed');app.page.refresh();
                    console.info('[LittleSteps QA] MATRIX_LOADED '+JSON.stringify({id:event.id,seed:seeds.get(event.id),uid:event.uid,at:this.at,isolatedMemory:true}));this.report(true);
                }finally{load.disabled=false;}
            });
            const failure=button('模拟保存失败：关',()=>{this.failWrites=!this.failWrites;failure.textContent='模拟保存失败：'+(this.failWrites?'开':'关');this.report(true);});
            button('打开当前奇遇',()=>{if(app.page.session&&this.currentUid){app.page.session.enter(this.currentUid);app.page.refresh();this.report(true);}});
            button('打印状态',()=>this.report(true));
            this.status=document.createElement('div');this.status.setAttribute('aria-label','奇遇验证状态');bar.appendChild(this.status);this.report(true);
            console.info('[LittleSteps QA] MATRIX_READY '+JSON.stringify({seeds:Array.from(seeds),source:'actual Application; QA candidate Boot only; fixed wall clock, generated trip, isolated memory store'}));
        }catch(e){console.error('[LittleSteps QA] MATRIX_FAILED',e);}
    }
    private report(log=false){if(!this.app||!this.status)return;const app:any=this.app,s=app.travel.service,e=s.model.event_by_uid(this.currentUid),state={page:app.page.constructor.name,event:e.id||'',choice:e.choice||'',manualCount:s.model.data.manual_count,merit:s.model.data.merit,clock:s.route_snapshot().clock_mode,error:s.last_error,feedback:app.page.session?.feedback||'',panel:app.page.session?.eventUid||'',bubble:app.page.snapshot?.().bubble||null,failWrites:this.failWrites};this.status.textContent=JSON.stringify({event:state.event,choice:state.choice,count:state.manualCount,merit:state.merit,clock:state.clock,error:state.error});if(log)console.info('[LittleSteps QA] MATRIX_STATE '+JSON.stringify(state));}
    update(delta:number){if(this.app)this.app.advance(delta);this.elapsed+=delta;if(this.elapsed>.3){this.elapsed=0;this.report();}}
    onDestroy(){this.app?.dispose();}
}
'''
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--name',required=True);args=parser.parse_args()
    subprocess.run([sys.executable,str(ROOT/'migration/tools/create_candidate.py'),'--name',args.name],check=True)
    stage=ROOT/'migration/work'/args.name;boot=stage/'games/xiaoyu-cocos/assets/Boot.ts';before=sha(boot);boot.write_text(BOOT)
    path=ROOT/'migration/records/candidates'/(args.name+'.json');record=json.loads(path.read_text())
    record['overrides'].append({'file':'assets/Boot.ts','sourceSHA256':before,'fixtureSHA256':sha(boot),'purpose':'All-five original encounter QA: generated seeds, isolated in-memory travel store reset per selected event, fixed wall clock at encounter reach, direct real map/event entry, visible write-failure toggle and status. Product pages and service unchanged. Not full entry/device acceptance.'})
    # Preserve every dependency captured by the base freezer, including platform templates.
    entry=next(item for item in record['files'] if item['path']=='games/xiaoyu-cocos/assets/Boot.ts')
    entry['sha256']=sha(boot)
    record['snapshotSHA256']=hashlib.sha256(json.dumps(record['files'],sort_keys=True).encode()).hexdigest();path.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    print(stage)
if __name__=='__main__':main()
