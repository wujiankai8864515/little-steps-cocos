from pathlib import Path
import json,hashlib,subprocess,sys,argparse
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
BOOT='''import { _decorator, Component, director, Director, profiler, ResolutionPolicy, view } from 'cc';
import { Application } from './game/Application';
const {ccclass}=_decorator;
@ccclass('Boot')
export class Boot extends Component {
 private app:Application;private at=1000;private frozen=false;
 async start(){try{
  view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);profiler.hideStats();this.app=new Application(this.node);this.app.clock.seekHour(12);await this.app.start('home');const app:any=this.app,s=app.travel.service;s.store._memory={};s.wall_clock=()=>this.at;s.configure('qa_collection_isolated',true);
  let x=4;const button=(caption:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=caption;b.style.cssText='position:fixed;left:'+x+'px;bottom:4px;z-index:99999;font:11px sans-serif;background:#fff3dc;color:#603b22;border:1px solid #603b22';x+=92;b.onclick=fn;document.body.appendChild(b);};
  button('收藏入口',()=>app.openTravelPage('collection'));
  button('完成五次旅行',async()=>{try{if(app.page!==app.homePage.page)await app.returnHome();this.at=1000;s.store._memory={};s.configure('qa_collection_rewards',true);for(let seed=1;seed<=5;seed++){if(!s.depart(700,.3,seed))throw Error('depart failed');this.at+=101;s.reconcile();s.open_rewards();for(const item of s.model.trip().rewards.slice()){if(!s.start_reward_flight(item.uid)||!s.complete_reward_flight(item.uid))throw Error('reward failed');}for(const journal of s.model.pending_journals().slice())for(const e of journal.entries.slice())if(!s.review(journal.trip_id,e.uid,e.choice))throw Error('review failed');this.at+=1;}console.info('[LittleSteps QA] COLLECTION_FIXTURE '+JSON.stringify({inventory:s.model.data.inventory.length,archives:s.model.data.journals.length,revision:s.model.data.revision}));await app.openJournal('collection');}catch(e){console.error('[LittleSteps QA] FIXTURE_FAILED',e);}});
  button('打印状态',()=>console.info('[LittleSteps QA] COLLECTION_STATE '+JSON.stringify({route:app.page.constructor.name,page:app.page.snapshot?.(),resources:app.assets.snapshot(),revision:s.model.data.revision,reviewCount:s.model.data.review_count})));
  button('暂停画面',()=>this.frozen=!this.frozen);
  const a=document.createElement('a');a.textContent='下载 PNG';a.download='__CANDIDATE__.png';a.style.cssText='position:fixed;right:4px;bottom:4px;z-index:99999;display:none;background:white';document.body.appendChild(a);let url='';
  button('截取 PNG',()=>{this.frozen=true;director.once(Director.EVENT_AFTER_DRAW,()=>{const c=document.getElementById('GameCanvas') as HTMLCanvasElement;c.toBlob(blob=>{if(!blob)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);a.href=url;a.style.display='block';console.info('[LittleSteps QA] COLLECTION_CAPTURE '+JSON.stringify({route:app.page.constructor.name,page:app.page.snapshot?.(),size:[c.width,c.height],resources:app.assets.snapshot()}));},'image/png');});});
  console.info('[LittleSteps QA] COLLECTION_HOME_READY');
 }catch(e){console.error('[LittleSteps QA] COLLECTION_FAILED',e);}}
 update(delta:number){if(this.app)this.app.advance(this.frozen?0:delta);}
 onDestroy(){this.app?.dispose();}
}
'''
def main():
 p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args();subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name],check=True)
 stage=ROOT/'builds/work'/a.name;boot=stage/'games/xiaoyu-cocos/assets/Boot.ts';before=sha(boot);boot.write_text(BOOT.replace('__CANDIDATE__',a.name))
 m=ROOT/'builds/records/candidates'/(a.name+'.json');r=json.loads(m.read_text());r['overrides'].append({'file':'assets/Boot.ts','sourceSHA256':before,'fixtureSHA256':sha(boot),'purpose':'Real Home collection route, isolated memory empty save and visible five-trip reward/review fixture, no shipping modification'})
 r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=hashlib.sha256(json.dumps(r['files'],sort_keys=True).encode()).hexdigest();m.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(str(stage))
if __name__=='__main__':main()
