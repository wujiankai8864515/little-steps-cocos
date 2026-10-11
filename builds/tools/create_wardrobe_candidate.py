from pathlib import Path
import argparse,hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
BOOT='''import { _decorator, Component, director, Director, Camera, UITransform, UIOpacity, profiler, ResolutionPolicy, view } from 'cc';
import { Application } from './game/Application';
const {ccclass}=_decorator;
@ccclass('Boot')
export class Boot extends Component {
 private app:Application;private frozen=false;
 async start(){try{
  view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);profiler.hideStats();this.app=new Application(this.node);this.app.clock.seekHour(12);this.app.clock.advance=()=>this.app.clock.hour();await this.app.start('home');const app:any=this.app;
  let x=4;const button=(caption:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=caption;b.style.cssText='position:fixed;left:'+x+'px;bottom:4px;z-index:99999;font:11px sans-serif;background:#fff3dc;color:#603b22;border:1px solid #603b22';x+=92;b.onclick=fn;document.body.appendChild(b);};
  button('衣柜入口',()=>app.openJournal('wardrobe'));button('照片入口',()=>app.openJournal('photo'));button('切换昼夜',()=>this.app.clock.seekHour(this.app.clock.hour()<20?23:12));
  button('打印状态',()=>{const nodes=(n:any,depth=0):any=>({name:n.name,active:n.activeInHierarchy,layer:n.layer,position:[n.worldPosition.x,n.worldPosition.y,n.worldPosition.z],scale:[n.worldScale.x,n.worldScale.y],opacity:n.getComponent(UIOpacity)?.opacity,size:n.getComponent(UITransform)?.contentSize,children:depth<2?n.children.map((c:any)=>nodes(c,depth+1)):n.children.length});console.info('[LittleSteps QA] RENDER_STATE '+JSON.stringify({scene:director.getScene().children.map((n:any)=>nodes(n)),cameras:director.getScene().getComponentsInChildren(Camera).map((c:any)=>({name:c.node.name,active:c.enabledInHierarchy,visibility:c.visibility,target:c.targetTexture?.name,orthoHeight:c.orthoHeight,near:c.near,far:c.far,priority:c.priority,position:c.node.worldPosition})),surface:app.homePage.page.surface.snapshot()}));const s=app.page.snapshot?.();if(s?.rig)s.rig={contacts:s.rig.contacts,landing:s.rig.landing,position:s.rig.rendering?.position,parts:s.rig.rendering?.parts.map((p:any)=>p.name)};console.info('[LittleSteps QA] WARDROBE_STATE '+JSON.stringify({route:app.page.constructor.name,page:s,skin:app.skins.snapshot(),saveError:app.skins.error,resources:app.assets.snapshot()}));});
  button('暂停画面',()=>this.frozen=!this.frozen);
  const write=app.skins.storage.setItem.bind(app.skins.storage);let fail=false;button('模拟保存失败',()=>{fail=!fail;app.skins.storage.setItem=fail?()=>{throw Error('QA write failure');}:write;console.info('[LittleSteps QA] WARDROBE_WRITE_FAILURE '+fail);});
  const a=document.createElement('a');a.textContent='下载 PNG';a.download='__CANDIDATE__.png';a.style.cssText='position:fixed;right:4px;bottom:30px;z-index:99999;display:none;background:white';document.body.appendChild(a);let url='';
  button('截取 PNG',()=>{this.frozen=true;director.once(Director.EVENT_AFTER_DRAW,()=>{const c=document.getElementById('GameCanvas') as HTMLCanvasElement;c.toBlob(blob=>{if(!blob)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);a.href=url;a.style.display='block';console.info('[LittleSteps QA] WARDROBE_CAPTURE '+JSON.stringify({route:app.page.constructor.name,skin:app.skins.snapshot(),size:[c.width,c.height],resources:app.assets.snapshot()}));},'image/png');});});
  console.info('[LittleSteps QA] WARDROBE_HOME_READY');
 }catch(e){console.error('[LittleSteps QA] WARDROBE_FAILED',e);}}
 update(delta:number){if(this.app)this.app.advance(this.frozen?0:delta);}
 onDestroy(){this.app?.dispose();}
}
'''
p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args();subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name],check=True)
stage=ROOT/'builds/work'/a.name;boot=stage/'games/xiaoyu-cocos/assets/Boot.ts';before=sha(boot);boot.write_text(BOOT.replace('__CANDIDATE__',a.name))
m=ROOT/'builds/records/candidates'/(a.name+'.json');record=json.loads(m.read_text());record['route']='home';record['overrides'].append({'file':'assets/Boot.ts','sourceSHA256':before,'fixtureSHA256':sha(boot),'purpose':'Visible route, save-failure and capture controls; clock fixed at selected hour, real actor/input/save flow. Isolated QA origin, shipping Boot unchanged.'});record['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()];record['snapshotSHA256']=hashlib.sha256(json.dumps(record['files'],sort_keys=True).encode()).hexdigest();m.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');print(str(stage))
