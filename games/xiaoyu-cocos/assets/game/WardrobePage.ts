import { Color, EventKeyboard, input, Input, KeyCode, Label, Material, Node, Sprite, UITransform, Vec3, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { audioTransport, core, lifetime, meshSprite, Scope, sharedUI } from './Engine';
import { HomeClock } from './HomeClock';
import { HomeLighting } from './HomeLighting';
import { HomeShadows } from './HomeShadows';
import { lightingSnapshot } from './LightingSnapshot';
import { applyOutfit } from './OutfitBinding';
import { PromptSparkles } from './PromptSparkles';
import { TravelAtlasSprite } from './TravelAtlasSprite';
import { TRAVEL_FONT, TRAVEL_GLINT } from './TravelHomeRules';
import { label, nodeAt } from './Visual';
import { PageBackground } from './PageBackground';
import { pageLayout, pinTop, safeViewport } from './Viewport';
import { WardrobeViewport } from './WardrobeViewport';
import { deformWardrobe, wardrobeMesh, WardrobeMotion, wardrobeParticle, WARDROBE_ATLAS, WARDROBE_REGIONS, WARDROBE_VINES } from './WardrobeGeometry';
import { WardrobeSession } from './WardrobeSession';
import { OUTFIT_TEXTURE, SkinId, WardrobeStore } from './WardrobeStore';
import { XiaoyuRig } from './XiaoyuRig';
import { ActionMarks } from './ActionMarks';
export const WARDROBE_RESOURCES=[WARDROBE_ATLAS,OUTFIT_TEXTURE,TRAVEL_FONT,TRAVEL_GLINT];
export const WARDROBE_EFFECTS=['wardrobe-room'];
export interface WardrobeRetained {motion:WardrobeMotion;}
export class WardrobePage {
    readonly root:Node;readonly canvas:Node;readonly rig:XiaoyuRig;readonly session:WardrobeSession;onBack=()=>{};onEquip:(id:SkinId,current:()=>boolean)=>Promise<boolean>=async()=>false;
    readonly marks:ActionMarks;private active=false;private decor:Node;private lighting:HomeLighting;private shadows:HomeShadows;private materials:Array<{material:Material;pass:number}>=[];private motion:WardrobeMotion;
    private cloths:any[]=[];private vines:any[]=[];private labels:Label[]=[];private sparkles:PromptSparkles[]=[];private particles:TravelAtlasSprite[]=[];private particleAge=-1;private bubble:any;private infoPointer=new core.BubblePointer();private bubbleChoices=false;
    private background:PageBackground;private volume:any;private header:Node;private height=1280;private returnControl:any;private pointer:any;private captured:number|null=null;private press:{at:number[];age:number};private previous:number[];private held=false;private landing=false;private knock:any;
    static async create(parent:Node,assets:GameAssets,scope:Scope,height:number,store:WardrobeStore,clock:HomeClock,gestureSeen:()=>boolean,retained?:WardrobeRetained,policy='temporary_local',reward?:(id:SkinId)=>Promise<boolean>){
        const owner=lifetime(scope);
        try{
            const viewport=await WardrobeViewport.create(parent,assets,owner,height);
            const page=new WardrobePage(assets,owner,viewport,store,clock,gestureSeen,retained,policy,reward);
            // The full content must have drawn before the route can replace Home.
            await owner.guard(viewport.ready);viewport.setActive(false);return page;
        }catch(error){owner.dispose();throw error;}
    }
    private constructor(private assets:GameAssets,private scope:Scope,private viewport:WardrobeViewport,readonly store:WardrobeStore,private clock:HomeClock,gestureSeen:()=>boolean,retained?:WardrobeRetained,policy='temporary_local',reward?:(id:SkinId)=>Promise<boolean>){
        this.motion=retained?.motion||new WardrobeMotion();this.root=viewport.root;this.canvas=viewport.canvas;
        this.background=new PageBackground(this.canvas,assets,scope,WARDROBE_ATLAS,'WardrobeBackdrop',WARDROBE_REGIONS.backdrop);this.bind(this.background.sprite,0);
        // Mesh grids use TL, TR, BL, BR, unlike Godot's clockwise Polygon2D.
        const glass=this.mesh('WindowGlass',wardrobeMesh([0,0,141,667]),1);glass.mesh.vertices.set([0,0,141,72,0,603,141,667]);glass.mesh.source.set(glass.mesh.vertices);glass.sprite.geometryChanged();
        for(let i=0;i<2;i++){const key=i?'peach':'original',region=WARDROBE_REGIONS[key],create=(shadow:boolean)=>{const v=this.mesh((shadow?'ClothShadow_':'PinnedCloth_')+key,wardrobeMesh(region,6,14),shadow?3:0);v.root.setPosition(242+180*i,-273);v.root.setScale(151/region[2],289/region[3],1);return v;};this.cloths.push({region,shadow:create(true),view:create(false)});this.labels.push(this.paperLabel(key,[239+180*i,554,158,56],true));}
        WARDROBE_VINES.forEach((at,i)=>{const create=(shadow:boolean)=>{const v=this.mesh((shadow?'VineShadow_':'Vine_')+i,wardrobeMesh(WARDROBE_REGIONS.vine),shadow?3:0);v.root.setPosition(at[0],-at[1]);v.root.setScale(.25+i%3*.035,.40+i%2*.04,1);return v;};this.vines.push({shadow:create(true),view:create(false)});});
        this.rig=new XiaoyuRig(this.canvas,assets,scope);this.lighting=new HomeLighting(this.canvas,assets,scope,clock);this.shadows=new HomeShadows(this.canvas,assets,scope,clock,false);
        this.rig.receivers.forEach(v=>this.lighting.receiver(v.sprite,v.spec,1,[.2,.15,.68,.72],v.node.name==='OriginalBody'||v.eye?'face':'receiver',v.eye||0,v.eye?this.rig.pupilOffsets()[v.eye-1]:[0,0]));
        this.rig.receivers.filter(v=>v.node.name.indexOf('Eye')<0).forEach(v=>this.shadows.add(v.node,v.resource,{'metadata/ground':951,'metadata/height_factor':.72,'metadata/floor':true,'metadata/shadow_z':1,'metadata/thickness':0}));
        this.rig.softMeshes().forEach(v=>this.shadows.bindSoft(v.node,v.mesh,()=>this.rig.softActive,()=>Math.max(0,615+this.rig.root.position.y),()=>951));
        this.shadows.layers.forEach(v=>v.node.setSiblingIndex(this.rig.root.getSiblingIndex()));
        this.knock=audioTransport().player(this.root,scope,'WardrobeOriginalKnock');this.knock.gain(Math.pow(10,-8/20));this.rig.onContact=()=>{if(this.active&&gestureSeen()){this.knock.assign(assets.audio('res://assets/wood_knock.wav'));this.knock.play();}};
        this.volume=this.mesh('WardrobeSoftLightVolume',wardrobeMesh([0,0,720,1280]),2);this.shadows.layers.forEach(v=>v.node.setSiblingIndex(this.canvas.children.length-1));this.rig.root.setSiblingIndex(this.canvas.children.length-1);
        this.marks=new ActionMarks(this.canvas,assets,scope,()=>this.rig.faceBounds(this.canvas));this.rig.onActionMark=(kind,pixel,offset)=>{if(this.active){const at=this.rig.actionMarkPoint(pixel,this.canvas);this.marks.emit(kind,at.map((v,i)=>v+offset[i]));}};this.rig.onClearActionMarks=()=>this.marks.clear();
        this.decor=nodeAt(this.canvas,'WardrobeOverlay');this.header=nodeAt(viewport.surface.content,'WardrobeHeader',0,0,720,180);this.returnControl=sharedUI().hangingReturn(this.header,assets.font(TRAVEL_FONT),[24,35,77,139],()=>this.onBack(),()=>this.active&&scope.active,undefined,viewport.input);this.paperLabel('小余的衣柜',[248,72,310,70],false,this.header);
        this.session=new WardrobeSession(store,{preview:id=>applyOutfit(this.rig,assets,id),equip:(id,current)=>this.onEquip(id,current),reward},policy);
        if(!applyOutfit(this.rig,assets,store.worn))throw new Error('Wardrobe outfit is not ready');
        this.pointer=sharedUI().pointer(viewport.input,{down:(at:number[],id:number)=>this.down(at,id),move:(at:number[],id:number)=>this.move(at,id),up:(at:number[],id:number)=>this.up(at,id),cancel:()=>this.cancelPointer()},()=>this.active&&scope.active);
        const key=(e:EventKeyboard)=>{if(!this.active||e.keyCode!==KeyCode.ESCAPE)return;if(this.bubble){this.session.cancelPreview();this.clearBubble();this.syncLabels();}else this.onBack();};input.on(Input.EventType.KEY_DOWN,key);
        scope.own(store.subscribe(()=>this.syncLabels()));scope.own(()=>{this.pause();this.session.close();this.pointer.dispose();this.returnControl.dispose();input.off(Input.EventType.KEY_DOWN,key);});this.syncLabels();this.resize(this.viewport.snapshot().logicalSize[1]);this.render(0);
    }
    private bind(sprite:Sprite,pass:number){const material=new Material();material.initialize({effectAsset:this.assets.effect('wardrobe-room'),defines:{USE_TEXTURE:true}});sprite.customMaterial=material;this.materials.push({material,pass});this.scope.own(()=>material.destroy());}
    private mesh(name:string,mesh:any,pass:number){const root=nodeAt(this.canvas,name),sprite:any=root.addComponent(meshSprite()),spec=this.assets.art(WARDROBE_ATLAS);sprite.configure(mesh,spec.size,spec.content);sprite.spriteFrame=this.assets.frame(WARDROBE_ATLAS,this.scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;this.bind(sprite,pass);return {root,sprite,mesh};}
    private painted(key:string,rect:number[],pass:number,parent=this.canvas){const view=new TravelAtlasSprite(parent,this.assets,this.scope,WARDROBE_ATLAS,WARDROBE_REGIONS[key],'Wardrobe_'+key);view.place(rect);if(pass>=0)this.bind(view.sprite,pass);return view;}
    private paperLabel(text:string,r:number[],glint:boolean,parent=this.canvas){this.painted('label',r,-1,parent);const textLabel=label(parent,this.assets,'WardrobePlaque',text,[r[0]+12,r[1]+7],[r[2]-24,r[3]-14],23,[84/255,53/255,30/255],TRAVEL_FONT);textLabel.enableWrapText=false;if(glint)this.sparkles.push(new PromptSparkles(textLabel.node,this.assets,this.scope,this.canvas,()=>[0,0,720,1280]));return textLabel;}
    private syncLabels(){if(this.labels.length<2)return;const texts=[this.store.worn==='original'?'原皮 · 已穿上':'原皮',this.store.worn==='peach'?'桃花 · 已穿上':this.store.unlocked.indexOf('peach')>=0?'桃花':'桃花 · 试穿'];let fitted=23;
        for(let i=0;i<2;i++){const text=this.labels[i],ui=text.node.getComponent(UITransform);text.string=texts[i];text.overflow=Label.Overflow.NONE;while(true){text.fontSize=fitted;text.lineHeight=fitted*this.assets.catalog.assets[TRAVEL_FONT].fontMetrics.height;text.updateRenderData(true);if(ui.width<=134||fitted<=14)break;fitted--;}}
        this.labels.forEach(text=>{text.fontSize=fitted;text.lineHeight=fitted*this.assets.catalog.assets[TRAVEL_FONT].fontMetrics.height;text.overflow=Label.Overflow.CLAMP;text.node.getComponent(UITransform).setContentSize(134,42);text.updateRenderData(true);});
    }
    private clearBubble(){this.bubble?.root.destroy();this.bubble=null;this.infoPointer.cancel();}
    private showBubble(){this.clearBubble();const s=this.session;if(!s.message)return;this.bubbleChoices=!!s.choices.length;const options={fontSize:24,fontMetrics:this.assets.catalog.assets[TRAVEL_FONT].fontMetrics};
        if(this.bubbleChoices)this.bubble=sharedUI().confirmationBubble(this.decor,this.assets.font(TRAVEL_FONT),s.message,[360,656],[0,0,720,1280],{...options,acceptText:s.choices[0],cancelText:s.choices[1],onDecision:async(accepted:boolean)=>{const previous=this.store.worn;try{await s.choose(accepted?0:1);}catch(_){s.notice('这次没有保存好，先保留原来的衣服。请稍后重试。');}if(!this.scope.active||!s.active)return;if(accepted&&!s.busy&&(s.choices.length||this.store.worn!==previous))this.spawnChange();this.syncLabels();this.showBubble();}});
        else this.bubble=sharedUI().infoBubble(this.decor,this.assets.font(TRAVEL_FONT),s.message,[360,656],[0,0,720,1280],options);
    }
    private down(at:number[],id:number){if(this.bubble){if(this.bubbleChoices)this.bubble.down(id,at);else{const s=this.bubble.snapshot();this.infoPointer.down(id,at,s.card,{info:s.card},s.phase);}return true;}if(this.session.busy||this.captured!==null)return false;
        for(let i=0;i<2;i++)if(at[0]>=240+180*i&&at[0]<395+180*i&&at[1]>=270&&at[1]<615){if(this.session.select(i?'peach':'original')){this.motion.select(i);this.spawnChange();this.showBubble();}return true;}
        const p=this.canvas.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1]));if(!this.rig.hitAt([p.x,p.y]))return false;this.captured=id;this.press={at:at.slice(),age:0};this.previous=at.slice();return true;
    }
    private move(at:number[],id:number){if(this.bubble){if(this.bubbleChoices)this.bubble.move(id,at);else this.infoPointer.move(id,at,this.bubble.snapshot().card);return;}if(id!==this.captured||!this.held)return;const p=this.rig.root.position;this.rig.root.setPosition(Math.max(-110,Math.min(150,p.x+at[0]-this.previous[0])),-Math.max(300,Math.min(700,-p.y+at[1]-this.previous[1])));this.previous=at.slice();}
    private up(at:number[],id:number){if(this.bubble){if(this.bubbleChoices)this.bubble.up(id,at);else{const s=this.bubble.snapshot();if(this.infoPointer.up(id,at,s.card,{info:s.card},s.phase)==='info')this.bubble.close();}return;}if(id!==this.captured||!this.press)return;if(this.held){this.held=false;this.landing=true;this.rig.land(1);}else if(Math.hypot(at[0]-this.press.at[0],at[1]-this.press.at[1])<15)this.rig.tap();this.press=null;this.captured=null;}
    private cancelPointer(){this.infoPointer.cancel();this.bubble?.cancelPointer?.();this.press=null;this.captured=null;if(this.held||this.landing){this.held=false;this.landing=false;this.rig.root.setPosition(15,-615);this.rig.liftHeight=0;this.rig.root.setSiblingIndex(this.marks.root.getSiblingIndex());this.rig.resume();this.rig.resetSecondary();}}
    private spawnChange(){if(!this.particles.length)for(let i=0;i<22;i++){const view=this.painted(i%3===0?'spark':'flower',[0,0,1,1],-1,this.decor);this.particles.push(view);}this.particleAge=0;this.updateParticles(0);if(this.bubble)this.bubble.root.setSiblingIndex(this.decor.children.length-1);this.returnControl.root.setSiblingIndex(this.header.children.length-1);}
    private updateParticles(delta:number){if(this.particleAge<0)return;this.particleAge+=delta;this.particles.forEach((v,i)=>{const p=wardrobeParticle(i,this.particleAge);v.root.active=p.visible;v.root.setPosition(p.position[0],-p.position[1]);v.root.setScale(p.scale,p.scale,1);v.root.angle=-p.rotation*180/Math.PI;v.sprite.color=new Color(255,255,255,p.alpha*255);});if(this.particleAge>21*.047+2.2){this.particleAge=-1;this.particles.forEach(v=>v.root.active=false);}}
    private render(delta:number){const light=lightingSnapshot(this.clock.hour()),time=this.motion.elapsed,cast=light.cast.map(v=>v*14),p=this.canvas.worldPosition,s=this.canvas.worldScale;
        this.materials.forEach(v=>{v.material.setProperty('pageOrigin',new Vec4(p.x,p.y,s.x,s.y));const layout=pageLayout(this.height);v.material.setProperty('pageState',new Vec4(layout.top,layout.bottom,layout.bottom-layout.top,1));v.material.setProperty('wardrobeState',new Vec4(light.night,light.solarPhase,v.pass,1));});
        this.cloths.forEach((v,i)=>{for(const shadow of [false,true]){const part=shadow?v.shadow:v.view;deformWardrobe(part.mesh,v.region,time*(1.02+i*.13)+i*2.4,true,this.motion.cloth[i],shadow?cast:undefined);part.sprite.geometryChanged();}});
        this.vines.forEach((v,i)=>{for(const shadow of [false,true]){const part=shadow?v.shadow:v.view;part.root.angle=-this.motion.vine[i]*180/Math.PI;deformWardrobe(part.mesh,WARDROBE_REGIONS.vine,time*(1.1+i*.071)+i*1.87,false,0,shadow?cast:undefined);part.sprite.geometryChanged();}});
        this.lighting.update({ambient:[.78,.73,.65].map((v,i)=>v+([.38,.43,.59][i]-v)*light.night),sun:.25*(1-light.night)});this.shadows.update();this.returnControl.advance(delta);this.sparkles.forEach(v=>v.advance(delta));this.updateParticles(delta);
    }
    retain():WardrobeRetained{this.motion.cancel();return {motion:this.motion};}
    resize(height:number,_physicalWidth?:number){this.pointer?.cancel();this.cancelPointer();this.returnControl.cancel();this.viewport.resize(height);this.height=height;const layout=pageLayout(height),safe=safeViewport(height);this.background.resize(height,layout);pinTop(this.header,this.viewport.surface.content,0,safe[1]);const hit=this.viewport.input.getChildByName('FixedReturnHitArea');hit.setScale(1/layout.scale,1/layout.scale,1);pinTop(hit,this.root,safe[0]+24+77*.09,safe[1]+35+139*.23);if(this.volume){this.volume.mesh.vertices.set([-layout.x/layout.scale,layout.top,(720-layout.x)/layout.scale,layout.top,-layout.x/layout.scale,layout.bottom,(720-layout.x)/layout.scale,layout.bottom]);this.volume.sprite.geometryChanged();}}
    resume(allowInput=true){this.active=allowInput;this.root.active=true;this.viewport.setActive(true);if(!this.session.active){this.session.open();this.syncLabels();if(this.store.error){this.session.notice('这次没有保存好，先保留原来的衣服。请稍后重试。');this.showBubble();}}this.render(0);}
    pause(){this.active=false;this.viewport.setActive(false);this.pointer?.cancel();this.cancelPointer();this.knock.stop();this.rig.focusLost();this.returnControl.cancel();}
    advance(delta:number){if(!this.active)return;const dt=Number.isFinite(delta)?Math.max(0,delta):0;this.marks.advance(dt);this.motion.advance(dt);if(this.press){this.press.age+=Math.min(dt,.1);if(!this.held&&this.press.age>.32){this.held=true;this.rig.suspend();const body=this.rig.backpackNodes().body,p=body.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(330,-175));this.rig.beginLift([p.x,p.y]);this.rig.root.setSiblingIndex(this.canvas.children.length-2);}}
        this.rig.liftHeight=Math.max(0,615+this.rig.root.position.y);if(this.held)this.rig.lift(1,dt,[0,0]);else if(this.landing){const p=this.rig.root.position,gain=1-Math.exp(-dt*12);this.rig.root.setPosition(p.x+(15-p.x)*gain,p.y+(-615-p.y)*gain);if(!this.rig.advanceLanding(dt)){this.landing=false;this.rig.root.setPosition(15,-615);this.rig.root.setSiblingIndex(this.marks.root.getSiblingIndex());this.rig.resume();}}else this.rig.advance(dt,this.clock.nightMix()>.5);
        this.marks.render();this.render(dt);if(this.bubble){this.bubble.advance(dt);if(this.bubble.snapshot().phase==='hidden')this.clearBubble();}}
    snapshot(){return {...this.session.snapshot(),surface:this.viewport.snapshot(),elapsed:this.motion.elapsed,hour:this.clock.hour(),marks:this.marks.snapshot(),held:this.held,landing:this.landing,particlePool:this.particles.length,particles:this.particleAge>=0?22:0,cloth:this.motion.cloth.slice(),labels:this.labels.map(v=>v.string),bubble:this.bubble?.snapshot(),rig:this.rig.snapshot()};}
}
