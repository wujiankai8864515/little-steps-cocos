from pathlib import Path
import json,hashlib,subprocess,sys,argparse
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
BOOT='''import { _decorator, Component, director, Director, profiler, ResolutionPolicy, view } from 'cc';
import { Application } from './game/Application';
const {ccclass}=_decorator;
@ccclass('Boot')
export class Boot extends Component {
    private app:Application;private frozen=false;private at=1000;
    async start(){
        try{
            view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);profiler.hideStats();
            this.app=new Application(this.node);this.app.clock.seekHour(12);await this.app.start('home');
            const app:any=this.app,service=app.travel.service;service.wall_clock=()=>this.at;service.configure('qa_map_isolated',true);service.depart(700,.3,1);this.at=1040;service.reconcile();
            let x=4;const button=(caption:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=caption;b.style.cssText='position:fixed;left:'+x+'px;bottom:4px;z-index:99999;font:11px sans-serif;background:#fff3dc;color:#603b22;border:1px solid #603b22';x+=85;b.onclick=fn;document.body.appendChild(b);return b;};
            button('地图入口',()=>app.openTravelPage('comic'));button('暂停画面',()=>{this.frozen=!this.frozen;});button('打印状态',()=>console.info('[LittleSteps QA] MAP_STATE '+JSON.stringify({route:app.page.constructor.name,page:app.page.snapshot?.(),resources:app.assets.snapshot()})));
            button('原版对照',async()=>{try{this.frozen=false;if(app.page!==app.homePage.page)await app.returnHome();this.at=1000;service.configure('qa_map_reference',true);service.depart(700,.3,1);this.at=1040;service.reconcile();await app.openJournal('map');this.frozen=true;this.app.clock.seekHour(12);const page=app.page,state=page.state;if(state.age>1e-8)throw Error('Reference must begin at scene age zero');while(state.age<12-1e-8)state.advance(Math.min(1/60,12-state.age));page.session.elapsed=12;page.session.enter(service.model.trip().events[0].uid);page.refresh();page.render(0);page.bubble.advance(.25);page.bubble.advance(.2);console.info('[LittleSteps QA] MAP_REFERENCE_READY '+JSON.stringify(page.snapshot()));}catch(e){console.error('[LittleSteps QA] REFERENCE_FAILED',e);}});
            const download=document.createElement('a');download.textContent='下载 PNG';download.download='__CANDIDATE__.png';download.style.cssText='position:fixed;right:4px;bottom:4px;z-index:99999;display:none;background:white';document.body.appendChild(download);let url='';
            button('截取 PNG',()=>{this.frozen=true;director.once(Director.EVENT_AFTER_DRAW,()=>{const c=document.getElementById('GameCanvas') as HTMLCanvasElement;c.toBlob(blob=>{if(!blob)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);download.href=url;download.style.display='block';console.info('[LittleSteps QA] MAP_CAPTURE '+JSON.stringify({route:app.page.constructor.name,page:app.page.snapshot?.(),resources:app.assets.snapshot(),size:[c.width,c.height]}));},'image/png');});});
            console.info('[LittleSteps QA] MAP_HOME_READY '+JSON.stringify({source:'actual Application/Home route, isolated in-memory travel slot, fixed wall clock 1040 and seed1',resources:app.assets.snapshot()}));
        }catch(e){console.error('[LittleSteps QA] MAP_FAILED',e);}
    }
    update(delta:number){if(this.app&&!this.frozen)this.app.advance(delta);}
    onDestroy(){this.app?.dispose();}
}
'''
def main():
 p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args();subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name],check=True)
 stage=ROOT/'builds/work'/a.name;boot=stage/'games/xiaoyu-cocos/assets/Boot.ts';before=sha(boot);boot.write_text(BOOT.replace('__CANDIDATE__',a.name))
 m=ROOT/'builds/records/candidates'/(a.name+'.json');r=json.loads(m.read_text());r['overrides'].append({'file':'assets/Boot.ts','sourceSHA256':before,'fixtureSHA256':sha(boot),'purpose':'Real Application and Home map entry, isolated memory travel seed1 at40sec; visible QA status/capture/freeze and same-state reference (noon, page/scene age12, manual offer) buttons, no shipping modification'})
 r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=hashlib.sha256(json.dumps(r['files'],sort_keys=True).encode()).hexdigest();m.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(str(stage))
if __name__=='__main__':main()
