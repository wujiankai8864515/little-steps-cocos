from pathlib import Path
import argparse,hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
BOOT="""import { _decorator, Component, director, Director, profiler, ResolutionPolicy, view } from 'cc';
import { Application } from './game/Application';
const {ccclass}=_decorator;
@ccclass('Boot')
export class Boot extends Component {
 private app:Application;private frozen=false;private wanted='';private shot=0;private captureLink:HTMLAnchorElement;private url='';
 async start(){try{
  view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);profiler.hideStats();this.app=new Application(this.node);this.app.clock.seekHour(12);this.app.clock.advance=()=>this.app.clock.hour();await this.app.start('home');const app:any=this.app;
  const panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:4px;left:4px;right:4px;z-index:99999;display:flex;gap:3px;flex-wrap:wrap';document.body.appendChild(panel);
  const button=(caption:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=caption;b.style.cssText='font:11px sans-serif;background:#fff3dc;color:#603b22;border:1px solid #603b22';b.onclick=fn;panel.appendChild(b);};
  for(const k of ['tap','doze','lift','drink'])button('捕获 '+k,()=>{this.wanted=k;this.frozen=false;console.info('[LittleSteps QA] MARK_ARM '+k);});
  button('昼夜',()=>{this.frozen=false;this.app.clock.seekHour(this.app.clock.hour()<20?23:12);});button('继续',()=>{this.frozen=false;this.wanted='';});button('状态',()=>this.state());
  button('衣柜',()=>{this.frozen=false;app.openJournal('wardrobe');});button('照片',()=>{this.frozen=false;app.openJournal('photo');});
  this.captureLink=document.createElement('a');this.captureLink.textContent='下载 PNG';this.captureLink.style.cssText='display:none;background:white';panel.appendChild(this.captureLink);
  console.info('[LittleSteps QA] MARKS_HOME_READY');
 }catch(e){console.error('[LittleSteps QA] MARKS_FAILED',e);}}
 private marks(){const p:any=(this.app as any)?.page;return p?.marks||p?.propVisuals?.marks;}
 private state(){const p:any=(this.app as any).page;console.info('[LittleSteps QA] MARK_STATE '+JSON.stringify({route:p.constructor.name,hour:this.app.clock.hour(),marks:this.marks()?.snapshot(),contacts:p.rig?.behavior?.contacts,behavior:p.rig?.behavior?.snapshot(),fish:p.fish?.snapshot(),props:p.propVisuals?.snapshot(),resources:this.app.assets.snapshot()}));}
 private capture(kind:string){this.frozen=true;this.wanted='';this.state();director.once(Director.EVENT_AFTER_DRAW,()=>{const c=document.getElementById('GameCanvas') as HTMLCanvasElement;c.toBlob(blob=>{if(!blob)return;if(this.url)URL.revokeObjectURL(this.url);this.url=URL.createObjectURL(blob);this.captureLink.href=this.url;this.captureLink.download='__CANDIDATE__-'+kind+'-'+(++this.shot)+'.png';this.captureLink.style.display='inline';console.info('[LittleSteps QA] MARK_CAPTURE '+kind);},'image/png');});}
 update(delta:number){if(!this.app)return;this.app.advance(this.frozen?0:delta);if(this.wanted){const s=this.marks()?.snapshot();if(s?.marks.some((m:any)=>m.kind===this.wanted&&m.age>=.034&&m.faceSafe))this.capture(this.wanted);}}
 onDestroy(){this.app?.dispose();}
}
"""
p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args();subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name],check=True)
stage=ROOT/'builds/work'/a.name;boot=stage/'games/xiaoyu-cocos/assets/Boot.ts';before=sha(boot);boot.write_text(BOOT.replace('__CANDIDATE__',a.name))
m=ROOT/'builds/records/candidates'/(a.name+'.json');r=json.loads(m.read_text());r['route']='home';r['overrides'].append({'file':'assets/Boot.ts','sourceSHA256':before,'fixtureSHA256':sha(boot),'purpose':'Visible capture-next-event/route/clock controls, source behavior emits events; selected clock fixed; freeze after mark age .034, real rendering/input. No fabricated glyph events. Shipping Boot unchanged.'});r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];r['snapshotSHA256']=hashlib.sha256(json.dumps(r['files'],sort_keys=True).encode()).hexdigest();m.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(str(stage))
