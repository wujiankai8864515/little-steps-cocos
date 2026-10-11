#!/usr/bin/env python3
"""Freeze the actual Travel scene renderer for explicit standalone visual QA.
The shipping Boot, page routes and save data are never modified by this tool.
"""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
BOOT='''import { _decorator, Component, Director, director, Graphics, Node, profiler, ResolutionPolicy, UITransform, view } from 'cc';
import { GameAssets } from './game/Assets';
import { lifetime, Scope } from './game/Engine';
import { HomeClock } from './game/HomeClock';
import { TravelSceneState } from './game/TravelSceneState';
import { TravelSceneView, TRAVEL_SCENE_RESOURCES } from './game/TravelSceneView';
import { TRAVEL_SCENE_EFFECTS } from './game/TravelSceneLighting';
import { nodeAt, panel } from './game/Visual';
const { ccclass }=_decorator;
@ccclass('Boot')
export class Boot extends Component {
    private scope:Scope;private viewer:TravelSceneView;private frozen=true;private clock:HomeClock;private root:Node;private canvas:Node;private paper:Node;private dimensions='';
    async start(){
        try{
            view.setDesignResolutionSize(720,1280,ResolutionPolicy.FIXED_WIDTH);profiler.hideStats();
            const params=new URLSearchParams(location.search),read=(key:string,fallback:number,min:number,max:number)=>{const n=params.has(key)?Number(params.get(key)):fallback;return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
            const hour=read('hour',12,0,24),age=read('age',12,0,120),progress=read('progress',.35,0,1),fromProgress=read('fromProgress',progress,0,1);this.frozen=params.get('animate')!=='1';
            const scope=lifetime();this.scope=scope;const assets=new GameAssets();this.clock=new HomeClock();this.clock.seekHour(hour);
            const size=this.node.getComponent(UITransform).contentSize,root=nodeAt(this.node,'TravelSceneQA',-size.width/2,-size.height/2,size.width,size.height);this.root=root;scope.own(()=>root.destroy());this.paper=panel(root,'OriginalPaperBackdrop',[0,0,size.width,size.height],[236/255,217/255,179/255]);
            const canvas=nodeAt(root,'OriginalCanvas',0,Math.max(0,(size.height-1280)/2),720,1280);this.canvas=canvas;this.layout();
            await assets.initialize(scope);await assets.acquireResources([...TRAVEL_SCENE_RESOURCES,'res://assets/home_neutral.png'],scope);await assets.acquireEffects(TRAVEL_SCENE_EFFECTS,scope);
            const state=new TravelSceneState();state.seedRoute(fromProgress);state.updateRoute(progress,false);while(state.age<age-1e-8)state.advance(Math.min(1/60,age-state.age));
            this.viewer=await TravelSceneView.create(canvas,assets,scope,this.clock,state);
            const status=document.createElement('button');status.textContent='QA 场景 / 静态帧';status.style.cssText='position:fixed;left:4px;bottom:4px;z-index:99999;font:11px sans-serif;background:#fff3dc;color:#603b22;border:1px solid #603b22';status.onclick=()=>{this.frozen=!this.frozen;status.textContent=this.frozen?'QA 场景 / 静态帧':'QA 场景 / 动画';};document.body.appendChild(status);scope.own(()=>status.remove());
            const capture=document.createElement('button'),download=document.createElement('a');capture.textContent='截取 PNG';download.textContent='下载 PNG';download.download='travel-scene-'+hour+'-'+age+'-'+progress+'.png';
            capture.style.cssText=status.style.cssText+';left:118px';download.style.cssText=status.style.cssText+';left:196px;display:none';let objectURL='';
            capture.onclick=()=>{this.frozen=true;status.textContent='QA 场景 / 静态帧';director.once(Director.EVENT_AFTER_DRAW,()=>{if(!scope.active)return;const surface=document.getElementById('GameCanvas') as HTMLCanvasElement;surface.toBlob(blob=>{if(!scope.active||!blob)return;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(blob);download.href=objectURL;download.style.display='block';console.info('[LittleSteps QA] TRAVEL_SCENE_PNG '+JSON.stringify({hour:this.clock.hour(),age:state.age,progress:state.routeProgress,fromProgress,footprints:Array.from({length:11},(_,i)=>state.footprintPose(i)),size:[surface.width,surface.height],bytes:blob.size,resources:assets.snapshot()}));},'image/png');});};
            document.body.append(capture,download);scope.own(()=>{capture.remove();download.remove();if(objectURL)URL.revokeObjectURL(objectURL);});
            director.once(Director.EVENT_AFTER_DRAW,()=>director.once(Director.EVENT_AFTER_DRAW,()=>{if(scope.active)console.info('[LittleSteps QA] TRAVEL_SCENE_READY '+JSON.stringify({scope:'standalone scene, not full map/page/input acceptance',hour,age,progress,fromProgress,logicalSize:[size.width,size.height],resources:assets.snapshot(),view:this.viewer.snapshot()}));}));
        }catch(error){console.error('[LittleSteps QA] TRAVEL_SCENE_FAILED',error);this.scope?.dispose();}
    }
    private layout(){
        if(!this.root)return;const size=this.node.getComponent(UITransform).contentSize,key=size.width+':'+size.height;if(key===this.dimensions)return;this.dimensions=key;
        this.root.setPosition(-size.width/2,size.height/2);this.root.getComponent(UITransform).setContentSize(size.width,size.height);this.canvas.setPosition(0,-Math.max(0,(size.height-1280)/2));
        const g=this.paper.getComponent(Graphics);g.clear();g.roundRect(0,-size.height,size.width,size.height,0);g.fill();this.paper.getComponent(UITransform).setContentSize(size.width,size.height);
    }
    update(delta:number){this.layout();if(this.viewer){if(this.frozen)this.viewer.render();else{this.clock.advance(delta);this.viewer.advance(delta);}}}
    onDestroy(){this.scope?.dispose();}
}
'''
def main():
 p=argparse.ArgumentParser();p.add_argument('--name',required=True);a=p.parse_args()
 subprocess.run([sys.executable,str(ROOT/'builds/tools/create_candidate.py'),'--name',a.name],check=True)
 stage=ROOT/'builds/work'/a.name;boot=stage/'games/xiaoyu-cocos/assets/Boot.ts';before=sha(boot);boot.write_text(BOOT)
 manifest=ROOT/'builds/records/candidates'/(a.name+'.json');r=json.loads(manifest.read_text());r['overrides'].append({'file':'assets/Boot.ts','sourceSHA256':before,'fixtureSHA256':sha(boot),'purpose':'Standalone production TravelSceneView with source assets/math/lighting; explicit URL hour/age/progress and frozen/animated QA control. Does not cover page navigation, choices, save, audio or live user input.'})
 r['files']=[{'path':str(f.relative_to(stage)),'sha256':sha(f),'symlink':str(f.readlink()) if f.is_symlink() else None} for d in ['engines/travel-core','games/xiaoyu-cocos'] for f in sorted((stage/d).rglob('*')) if f.is_file()]
 r['snapshotSHA256']=hashlib.sha256(json.dumps(r['files'],sort_keys=True).encode()).hexdigest();r['travelSceneQA']={'runtime':'pending','visual':'pending','pageInput':'not_covered','WeChat':'not_covered'};manifest.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'stage':str(stage),'manifest':str(manifest)}))
if __name__=='__main__':main()
