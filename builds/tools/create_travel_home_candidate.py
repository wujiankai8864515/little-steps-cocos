#!/usr/bin/env python3
"""Freeze real Home travel prop QA with declared memory storage and visible controls.
No gameplay implementation is replaced; public QA calls are not touch acceptance.
"""
import argparse, hashlib, json, subprocess, sys, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
HELPER='''export function reviewTravelHome(app:any){
 const home=app.homePage.page,bridge=app.travel,service=bridge.service,props=app.travelProps;let at=1000;
 service.wall_clock=()=>at;bridge.configure('qa_travel_home',true);
 const panel=document.createElement('div');panel.style.cssText='position:fixed;left:4px;top:4px;z-index:99999;background:#fff3dc;color:#603b22;font:12px sans-serif;max-width:calc(100vw - 8px);display:flex;flex-wrap:wrap';
 const status=document.createElement('pre');status.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin:4px;width:100%;max-height:110px;overflow:auto';
 const sample=()=>{const t=service.model.trip(),r=props.snapshot();const data={qa:true,storage:'memory',trip:t.status||'none',claimed:!!t.claimed,opened:!!t.rewards_opened,inventory:service.model.data.inventory.length,rewards:r.rewards.poses.map((p:any)=>({uid:p.uid,index:p.index,position:p.position,flightAge:p.flightAge})),rehang:r.rehang,tent:r.tentVisible,departing:bridge.flow.phase};status.textContent=JSON.stringify({...data,rewards:data.rewards.map((p:any)=>p.index)});console.info('[LittleSteps QA] Home travel '+JSON.stringify(data));};
 const button=(text:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=text;b.onclick=()=>{try{fn();sample();}catch(e){status.textContent='QA ERROR '+String(e);console.error(e);}};panel.appendChild(b);};
 button('QA 出发',()=>home.onTravelRequest());button('QA 归来',()=>{at+=100;bridge.resume();home.note.dismiss();props.advance(0);});
 button('QA 开包',()=>{service.open_rewards();props.advance(0);});button('QA 收一件',()=>{const target=Array.from(props.rewards.poses.values()).find((p:any)=>p.flightAge<0) as any;if(target)props.rewards.collect(target.uid);});
 button('QA 切后台恢复',()=>{props.suspend();bridge.suspend();home.pause();home.resume();bridge.resume();});button('QA 状态',sample);
 panel.appendChild(status);document.body.appendChild(panel);app.scope.own(()=>panel.remove());sample();
}'''
def main():
 p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args()
 subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name,'--route','home','--hour','12','--freeze-clock'],check=True)
 stage=ROOT/'builds/work'/a.name;game=stage/'games/xiaoyu-cocos';record=ROOT/'builds/records/candidates'/f'{a.name}.json';r=json.loads(record.read_text())
 application=game/'assets/game/Application.ts';before=sha(application);point="        director.once(Director.EVENT_AFTER_DRAW,()=>{if(scope.active)console.info('[LittleSteps] Home first draw');});";text=application.read_text();assert text.count(point)==1
 application.write_text("import { reviewTravelHome } from './QA_TravelHome';\n"+text.replace(point,'        reviewTravelHome(this);\n'+point))
 helper=game/'assets/game/QA_TravelHome.ts';helper.write_text(HELPER);helper.with_suffix('.ts.meta').write_text(json.dumps({'ver':'4.0.24','importer':'typescript','imported':True,'uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'little-steps/QA_TravelHome.ts')),'files':[],'subMetas':{},'userData':{}},indent=2)+'\n')
 r['overrides'].extend([{'file':'assets/game/Application.ts','sourceSHA256':before,'fixtureSHA256':sha(application),'purpose':'Attach visible QA controls after actual Application.bindHome'},{'file':'assets/game/QA_TravelHome.ts','fixtureSHA256':sha(helper),'purpose':'Isolated memory storage, controlled wall time and declared direct API controls; real prop rendering and persisted transactions unchanged; API buttons do not prove canvas input'}])
 r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()]
 r['snapshotSHA256']=hashlib.sha256(json.dumps(r['files'],sort_keys=True).encode()).hexdigest();r['homeTravelQA']={'runtime':'pending','canvasInput':'pending','comparison':'pending','WeChat':'pending'};record.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'stage':str(stage),'record':str(record)}))
if __name__=='__main__':main()
