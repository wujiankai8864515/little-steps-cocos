import { EventKeyboard, input, Input, KeyCode, Node, screen, Sprite, sys, UITransform } from 'cc';
import { box, pinTop, safeViewport } from './Viewport';
import { GameAssets } from './Assets';
import { meshSprite, renderSurfaces, Scope, sharedUI } from './Engine';
import { HomeClock } from './HomeClock';
import { homeRenderPlan } from './HomeRenderPlan';
import { DollSkin } from './DollSkin';
import { DarkroomDoll } from './DarkroomDoll';
import { DarkroomRound, DARKROOM_READY, DARKROOM_RESULT } from './DarkroomRound';
import { DarkroomLighting } from './DarkroomLighting';
import { DarkroomTools } from './DarkroomTools';
import { DarkroomShadows } from './DarkroomShadows';
import { DarkroomPlants } from './DarkroomPlants';
import { DarkroomPlumes, DarkroomPlumeState } from './DarkroomPlumes';
import { PlantForest } from './PlantGeometry';
import { DarkroomHUD } from './DarkroomHUD';
import { DarkroomBubble } from './DarkroomBubble';
import { inside, LAMP_RECT, NEEDLE_RECT, SLIPPER_RECT, ResponsiveLamp } from './DarkroomVisualRules';
import { nodeAt, picture } from './Visual';

// Retained gameplay has no Cocos nodes, materials, frames or textures.
export type DarkroomRetainedState={round:DarkroomRound;lamp:ResponsiveLamp;forest:PlantForest;plumes:DarkroomPlumeState;plaqueMotion:any;shadowClock:number;replay:boolean};
// Keep this closure outside the page constructor: the skin's hit-test callback
// must not retain the constructor's event handlers and disposed visual tree.
function createRound(assets:GameAssets){
    const data='res://darkroom/assets/round3/';
    return new DarkroomRound(new DollSkin(assets.json(data+'doll_source_contract.json'),assets.json(data+'doll_source_geometry.json'),(part,x,y)=>assets.bitmapContains(data+'doll_'+part+'_hit.res',x,y)));
}
let serial=0;
export class DarkroomPage {
    readonly root:Node;readonly room:Node;readonly round:DarkroomRound;readonly lighting:DarkroomLighting;readonly doll:DarkroomDoll;readonly tools:DarkroomTools;readonly shadows:DarkroomShadows;readonly plants:DarkroomPlants;readonly plumes:DarkroomPlumes;
    readonly bubble:DarkroomBubble;readonly hud:DarkroomHUD;private surface:any;private targetLease:any;private plan:ReturnType<typeof homeRenderPlan>;private pointerHost:Node;private bleedUpdate:(height:number)=>void;private pointer:any;private lampAction:any;private plaque:any;private lantern:ReturnType<typeof picture>;private active=false;private replay=false;
    onBack=()=>{};onFinished=(result:any)=>{};
    static async create(parent:Node,assets:GameAssets,scope:Scope,height:number,clock:HomeClock,retained?:DarkroomRetainedState){
        const renderer=renderSurfaces(),plan=homeRenderPlan(height,screen.windowSize.width),targetLease=await assets.acquireResizableTarget('Darkroom-'+(++serial),plan.pixels[0],plan.pixels[1],renderer,scope),target=targetLease.texture;
        const page=new DarkroomPage(parent,assets,scope,height,clock,target,plan,retained);page.targetLease=targetLease;page.resize(height,screen.windowSize.width);await scope.guard(page.surface.ready);page.pause();console.info('[LittleSteps] Darkroom prepared '+JSON.stringify(page.snapshot()));return page;
    }
    private constructor(parent:Node,assets:GameAssets,private scope:Scope,height:number,clock:HomeClock,target:any,plan:ReturnType<typeof homeRenderPlan>,retained?:DarkroomRetainedState){
        this.plan=plan;this.replay=retained?.replay||false;this.root=nodeAt(parent,'DarkroomPage',0,plan.offset,720,1280);this.root.active=false;scope.own(()=>{this.root.active=false;this.root.destroy();});
        this.surface=renderSurfaces().create({host:parent.scene,displayParent:this.root,logicalSize:plan.logical,displayRect:[0,-plan.offset,720,height],target,name:'DarkroomRenderSurface'},scope);
        this.room=nodeAt(this.surface.content,'DarkroomWorld',0,plan.offset,720,1280);this.lighting=new DarkroomLighting(this.room,assets,scope,clock,retained?.lamp);
        const layers:Array<{node:Node;z:number}>=[];const background='res://darkroom/assets/round2/room_no_plants.png',spec=assets.art(background);
        const rectMesh=(name:string,rect:number[],source:number[])=>{const node=nodeAt(this.room,name),sprite=node.addComponent(meshSprite()),mesh={vertices:new Float32Array([rect[0],rect[1],rect[0]+rect[2],rect[1],rect[0],rect[1]+rect[3],rect[0]+rect[2],rect[1]+rect[3]]),source:new Float32Array([source[0],source[1],source[0]+source[2],source[1],source[0],source[1]+source[3],source[0]+source[2],source[1]+source[3]]),indices:new Uint16Array([0,1,2,1,3,2])};sprite.configure(mesh,spec.size,spec.content);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=assets.frame(background,scope);return {node,sprite};};
        const shaderRect=(name:string,kind:string,z:number)=>{const node=nodeAt(this.room,name,0,0,720,1280),sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=assets.frame('res://assets/home_neutral.png',scope);this.lighting.bind(sprite,assets.art('res://assets/home_neutral.png'),kind);layers.push({node,z});};
        shaderRect('SharedExterior','sky',-1);const room=rectMesh('OriginalRoom',[0,0,720,1280],[0,0,941,1672]);this.lighting.bind(room.sprite,spec);layers.push({node:room.node,z:0});
        const bleeds=['UpperBleed','LowerBleed'].map(name=>{const item=rectMesh(name,[0,0,720,1],[0,1811,941,1]);this.lighting.bind(item.sprite,spec);layers.push({node:item.node,z:-2});return item;});
        this.bleedUpdate=(height:number)=>{const extra=Math.max(0,(height-1280)/2),sh=139*Math.min(1,extra/256);bleeds.forEach((b,i)=>{b.node.active=extra>0;if(!extra)return;const y=i?1280:-extra,sy=i?1811:1811-sh;b.sprite.configure({vertices:new Float32Array([0,y,720,y,0,y+extra,720,y+extra]),source:new Float32Array([0,sy,941,sy,0,sy+sh,941,sy+sh]),indices:new Uint16Array([0,1,2,1,3,2])},spec.size,spec.content);});};this.bleedUpdate(height);
        this.round=retained?.round||createRound(assets);const skin=this.round.rig;this.doll=new DarkroomDoll(this.room,assets,scope,skin);layers.push({node:this.doll.root,z:5});
        this.lantern=picture(this.room,assets,scope,'res://darkroom/assets/round2/lantern_cranes.png','Lantern',{position:[83,673],scale:[.53,.53],centered:false});this.lantern.child.setPosition(this.lantern.spec.content[0]-256,-this.lantern.spec.content[1]+455);layers.push({node:this.lantern.root,z:5});
        this.tools=new DarkroomTools(this.room,assets,scope,this.round,this.lighting);this.tools.trays.forEach(v=>layers.push({node:v.root,z:5}));layers.push({node:this.tools.receiver,z:6},{node:this.tools.active.root,z:9});
        this.shadows=new DarkroomShadows(this.room,assets,scope,this.lighting,this.round,this.tools,this.lantern.root,retained?.shadowClock);layers.push(...this.shadows.layers);
        this.plants=new DarkroomPlants(this.room,assets,scope,this.lighting,retained?.forest);layers.push(...this.plants.roots);shaderRect('SharedWindowLightBeams','beams',4);
        this.plumes=new DarkroomPlumes(this.room,assets,scope);if(retained)this.plumes.restore(retained.plumes);layers.push({node:this.plumes.root,z:7});layers.sort((a,b)=>a.z-b.z).forEach((v,i)=>v.node.setSiblingIndex(i));
        const s=sys.getSafeAreaRect(false),safe=[Math.max(0,s.x),Math.max(0,height-s.y-s.height)-plan.offset,Math.min(720,s.width),Math.min(height,s.height)],top=Math.max(28,safe[1]+28),bubbleSafe=[safe[0]+24,top,safe[2]-48,Math.max(180,safe[1]+safe[3]-top-190)];
        this.round.dragBounds=[safe[0]+12,safe[1]+12,safe[2]-24,safe[3]-24];this.hud=new DarkroomHUD(this.root,assets,scope,this.round,Math.max(178,safe[1]+170));this.bubble=new DarkroomBubble(this.root,assets,scope,bubbleSafe,()=>skin.worldPoint([278,35]));
        this.plaque=sharedUI().hangingReturn(this.root,assets.font('res://assets/bootstrap_ui.ttf'),[safe[0]+23,safe[1]+10,78,128],()=>this.back(),()=>this.active&&this.round.inputEnabled,retained?.plaqueMotion);this.plaque.advance(0);
        const host=nodeAt(this.root,'WorldPointerInput',0,-plan.offset,720,height),point=(p:number[])=>[p[0],p[1]-plan.offset];this.pointer=sharedUI().pointer(host,{down:(p:number[],id:number)=>{const at=point(p);if(inside(at,NEEDLE_RECT)){const ok=this.round.select('needle');this.tools.sync();this.report('needle');return ok;}if(inside(at,SLIPPER_RECT)){const ok=this.round.select('slipper');this.tools.sync();this.report('slipper');return ok;}return this.round.beginPointer(id,at);},move:(p:number[],id:number)=>this.round.movePointer(id,point(p)),up:(p:number[],id:number)=>{this.round.endPointer(id,point(p));this.report('up');},cancel:()=>{this.round.cancel();this.report('cancel');}},()=>this.active&&this.round.inputEnabled);
        // Input catcher precedes the plaque in the main Canvas draw/event order.
        this.pointerHost=host;host.setSiblingIndex(1);this.plaque.root.setSiblingIndex(this.root.children.length-1);
        const lampHit=nodeAt(this.root,'DarkroomLampHitArea',...LAMP_RECT as [number,number,number,number]);this.lampAction=sharedUI().action(lampHit,()=>{const on=this.lighting.lamp.toggle();if(this.round.dollVisible&&this.round.phase!=='spawn_in')this.bubble.show(on?'灯已开':'灯已关',1.6);this.sync(0);this.report('lamp');},()=>this.active&&this.round.inputEnabled&&scope.active);scope.own(()=>this.lampAction.dispose());
        const escape=(e:EventKeyboard)=>{if(e.keyCode===KeyCode.ESCAPE)this.back();};input.on(Input.EventType.KEY_DOWN,escape);scope.own(()=>{this.active=false;this.round.cancel();this.pointer.dispose();this.plaque.dispose();input.off(Input.EventType.KEY_DOWN,escape);});this.sync(0);
    }
    resize(height:number,physicalWidth:number){
        const next=homeRenderPlan(height,physicalWidth);try{if(this.targetLease.texture)this.targetLease.resize(next.pixels[0],next.pixels[1]);}catch(error){this.surface.layout(this.plan.logical,[0,-this.plan.offset,720,this.plan.logical[1]],this.targetLease.texture);throw error;}this.pointer.cancel();this.lampAction?.cancel();this.round.cancel();Object.assign(this.plan,next);
        box(this.root,0,next.offset,720,1280);this.room.setPosition(0,-next.offset);this.surface.layout(next.logical,[0,-next.offset,720,height],this.targetLease.texture);this.bleedUpdate(height);box(this.pointerHost,0,-next.offset,720,height);
        const safe=safeViewport(height);safe[1]-=next.offset;const top=Math.max(28,safe[1]+28);
        this.round.dragBounds=[safe[0]+12,safe[1]+12,safe[2]-24,safe[3]-24];this.hud.resize(Math.max(178,safe[1]+170));this.bubble.setSafe([safe[0]+24,top,safe[2]-48,Math.max(180,safe[1]+safe[3]-top-190)]);this.plaque.cancel();pinTop(this.plaque.root,this.root.parent,safe[0]+23,safe[1]+next.offset+10);const beam=this.room.getChildByName('SharedWindowLightBeams');if(beam)box(beam,0,-next.offset,720,height);this.lighting.resize(height);
    }
    setRenderActive(active:boolean){this.surface.setActive(active);}
    async prepareRender(){
        // Reuse every actor, curve, light and round value. Only recreate the
        // discarded offscreen texture, and never expose its unpainted pixels.
        this.targetLease.resize(this.plan.pixels[0],this.plan.pixels[1]);
        this.surface.layout(this.plan.logical,[0,-this.plan.offset,720,this.plan.logical[1]],this.targetLease.texture);
        this.sync(0);this.shadows.sync();this.surface.setActive(true);
        while(this.scope.active&&this.targetLease.texture){
            const ready=this.surface.ready;
            try{await this.scope.guard(ready);return;}
            catch(error){if(!this.scope.active||!this.targetLease.texture||ready===this.surface.ready)throw error;}
        }
        throw new Error('Darkroom presentation cancelled');
    }
    private parkRender(){
        this.surface.setActive(false);
        this.surface.layout(this.plan.logical,[0,-this.plan.offset,720,this.plan.logical[1]],null);
        this.targetLease.park();
    }
    private back(){if(!this.active||!this.round.inputEnabled)return;this.replay=!this.round.acceptsInput();this.round.cancel();this.bubble.dismiss();this.onBack();}
    private sync(delta:number){this.lighting.update(delta,this.round.clearTime);const scale=this.lighting.lamp.scale();this.lantern.root.setScale(.53*scale[0],.53*scale[1],1);this.lantern.sprite.color=this.lighting.color(this.lighting.lanternTint());this.doll.sync(this.lighting.tint,this.round.spawnAlpha,this.round.dissolve,this.round.dollVisible);this.tools.sync();this.plants.advance(delta);this.hud.advance();}
    advance(delta:number){if(!this.active)return;this.round.advance(delta);this.sync(delta);
        for(const event of this.round.drainEvents()){if(event.kind==='contact')this.plumes.dark(event.at);else if(event.kind==='release')this.plumes.release(event.at);else if(event.kind==='spawn')this.plumes.spawn(event.at,event.seconds);else if(event.kind==='finished'){this.plumes.clear();this.onFinished(event);}else if(event.kind==='result')this.bubble.show(event.text,2);else if(event.kind==='ready'){this.plumes.clear();this.bubble.show(event.text,3);}else if(event.kind==='phase'&&(event.phase==='gap_1s'||event.phase==='spawn_in'))this.bubble.dismiss();if(['contact','phase','finished','ready'].indexOf(event.kind)>=0)this.report(event.kind);}
        this.plumes.advance(['clear_out','spawn_in'].indexOf(this.round.phase)>=0?Math.min(delta,1/15):delta);this.shadows.advance(delta);this.bubble.advance(delta);this.plaque.advance(delta);
    }
    resume(allowInput=true){this.active=true;this.round.active=true;this.round.inputEnabled=allowInput;this.surface.setActive(true);if(this.replay){this.round.restart();this.plumes.clear();this.replay=false;}this.sync(0);this.shadows.sync();if(this.round.phase==='ready_full')this.bubble.show(DARKROOM_READY,3);else if(this.round.phase==='clear_out'&&this.round.resultVisible)this.bubble.show(DARKROOM_RESULT,2);}
    pause(){this.lampAction?.cancel();this.active=false;this.round.active=false;this.round.inputEnabled=false;this.round.cancel();this.pointer.cancel();this.bubble.dismiss();this.parkRender();}
    // Application focus changes freeze the current bubble and round. Route
    // changes use pause/resume and retain the original replay-on-return rule.
    suspend(){this.lampAction?.cancel();this.active=false;this.round.active=false;this.round.inputEnabled=false;this.round.cancel();this.pointer.cancel();this.surface.setActive(false);}
    restore(allowInput=true){this.active=true;this.round.active=true;this.round.inputEnabled=allowInput;this.surface.setActive(true);this.sync(0);this.shadows.sync();}
    retain():DarkroomRetainedState{
        if(this.active||this.round.active)throw new Error('Cannot hibernate an active Darkroom');
        return {round:this.round,lamp:this.lighting.lamp,forest:this.plants.forest,plumes:this.plumes.retain(),plaqueMotion:this.plaque.motion,shadowClock:this.shadows.retainClock(),replay:this.replay};
    }
    private report(event:string){console.info('[LittleSteps] Darkroom '+event+' '+JSON.stringify(this.snapshot()));}
    snapshot(){return {active:this.active,input_enabled:this.round.inputEnabled,surface:this.surface.snapshot(),world:{...this.round.snapshot(),...this.lighting.snapshot(),shadows:this.shadows.snapshot(),tools:this.tools.snapshot(),plants:this.plants.snapshot(),plumes:this.plumes.snapshot()},hud:this.hud.snapshot(),bubble:this.bubble.snapshot()};}
}
