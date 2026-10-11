import { Color, director, Director, EventKeyboard, EventMouse, input, Input, KeyCode, Label, Node, UITransform, Vec3 } from 'cc';
import { GameAssets } from './Assets';
import { audioTransport, lifetime, Scope, sharedUI } from './Engine';
import { HomeClock } from './HomeClock';
import { Stroke2D } from './Stroke2D';
import { TravelAtlasSprite } from './TravelAtlasSprite';
import { TravelEncounterSession } from './TravelEncounterSession';
import { TravelSignLabel, TRAVEL_SIGN_RESOURCES } from './TravelSignLabel';
import { TRAVEL_FONT_DATA } from './TravelFontData';
import { TravelGlints } from './TravelGlints';
import { TRAVEL_FONT, TRAVEL_GLINT } from './TravelHomeRules';
import { TravelSceneView, TRAVEL_SCENE_RESOURCES } from './TravelSceneView';
import { TRAVEL_SCENE } from './TravelSceneData';
import { TravelSceneState, narrativeMapping, routePosition, travelLight } from './TravelSceneState';
import { TravelService } from './TravelService';
import { box, repaintPanel } from './Viewport';
import { label, nodeAt, panel } from './Visual';
const ART='res://travel/assets/',BRUSH=ART+'travel_brush.ttf',ATLAS=ART+'travel_scene_layers_v1.png';
export const MAP_AUDIO=['derived://travel/travel_bell.wav','derived://travel/travel_encounter.wav'];
export const MAP_RESOURCES=[...TRAVEL_SCENE_RESOURCES,...['travel_brush.ttf','travel_offer_person_v5.png','travel_people_v5.png','travel_map_actor_v5.png'].map(n=>ART+n),TRAVEL_FONT,TRAVEL_GLINT,...MAP_AUDIO,...TRAVEL_SIGN_RESOURCES];
export const MAP_EFFECTS=['travel-atmosphere','travel-glint','original-stroke'];
export const MAP_PLAYBACK_BYTES=284244,MAP_UI_BUFFER_BYTES=512*1024;
const INK=[96/255,56/255,20/255],NPC:Record<string,number[]>={vampire:[70,0,552,663],rain:[668,0,485,680],postcard:[25,660,604,651],osmanthus:[637,668,548,646]};
let serial=0;
export class TravelMapPage {
    readonly root:Node;readonly session:TravelEncounterSession;readonly state:TravelSceneState;scene:TravelSceneView;onBack=()=>{};
    private canvas:Node;private ui:Node;private owner:Scope;private active=false;private height:number;private bindings:any[]=[];private bubble:any;private markers:Array<{uid:string;cell:number;pending:boolean;image:TravelAtlasSprite;at:number[]}> = [];
    private traveler:{pivot:Node;sprite:TravelAtlasSprite};private progress:TravelSignLabel;private arrival:TravelSignLabel;private physicalWidth=720;private glints:TravelGlints;private flowTarget:number[];private signature='';private tripId='';private announced=new Set<string>();private controls:Record<string,Node>={};
    static async create(parent:Node,assets:GameAssets,scope:Scope,height:number,service:TravelService,clock:HomeClock,soundEnabled:()=>boolean,gestureSeen:()=>boolean){
        await assets.acquireTransient('TravelMapPlayback-'+(++serial),MAP_PLAYBACK_BYTES+MAP_UI_BUFFER_BYTES,()=>true,()=>{},scope);
        const page=new TravelMapPage(parent,assets,scope,height,service,clock,soundEnabled,gestureSeen);
        page.scene=await TravelSceneView.create(page.canvas,assets,scope,clock,page.state);page.scene.root.setSiblingIndex(0);page.refresh();page.render(0);return page;
    }
    private constructor(parent:Node,private assets:GameAssets,private scope:Scope,height:number,private service:TravelService,private clock:HomeClock,soundEnabled:()=>boolean,gestureSeen:()=>boolean){
        this.height=height;this.session=new TravelEncounterSession(service);this.root=nodeAt(parent,'TravelMapPage',0,0,720,height);this.root.active=false;
        panel(this.root,'PaperBackdrop',[0,0,720,height],[236/255,217/255,179/255]);this.canvas=nodeAt(this.root,'OriginalMapCanvas',0,this.offset,720,1280);
        const audio=audioTransport(),bell=audio.player(this.root,scope,'TravelBell'),cue=audio.player(this.root,scope,'TravelEncounterCue'),ports={bell,cue};bell.assign(assets.audio(MAP_AUDIO[0]));cue.assign(assets.audio(MAP_AUDIO[1]));
        this.state=new TravelSceneState(TRAVEL_SCENE,{enabled:soundEnabled,gestureSeen,playing:kind=>ports[kind].snapshot().wanted==='playing'||ports[kind].playing,play:(kind,db)=>{ports[kind].gain(10**(db/20));ports[kind].play();},stop:kind=>ports[kind].stop()});this.state.setActive(false);
        const key=(e:EventKeyboard)=>{if(this.active&&e.keyCode===KeyCode.ESCAPE)this.back();};input.on(Input.EventType.KEY_DOWN,key);
        scope.own(()=>{this.pause();this.bindings.forEach(b=>b.dispose());this.bindings=[];input.off(Input.EventType.KEY_DOWN,key);this.root.active=false;this.root.destroy();});
    }
    private get offset(){return Math.max(0,(this.height-1280)/2);}
    resize(height:number,physicalWidth=720){this.physicalWidth=physicalWidth;this.progress?.resize(physicalWidth);this.arrival?.resize(physicalWidth);this.bindings.forEach(b=>b.cancel());this.bubble?.cancelPointer();this.height=height;box(this.root,0,0,720,height);repaintPanel(this.root.getChildByName('PaperBackdrop'),720,height);this.canvas.setPosition(0,-this.offset);if(this.ui){this.ui.setPosition(0,this.offset);box(this.ui,0,-this.offset,720,height);}if(this.scene)this.render(0);}
    private texture(parent:Node,path:string,rect:number[],scope:Scope,contain=true,region?:number[]){const r=region||[0,0,...this.assets.art(path).size],sprite=new TravelAtlasSprite(parent,this.assets,scope,path,r,'OriginalPixels'),s=contain?Math.min(rect[2]/r[2],rect[3]/r[3]):0;const w=contain?r[2]*s:rect[2],h=contain?r[3]*s:rect[3];sprite.place([rect[0]+(rect[2]-w)/2,rect[1]+(rect[3]-h)/2,w,h]);return sprite;}
    private plate(parent:Node,name:string,value:string,rect:number[],size:number,color=INK){const l=label(parent,this.assets,name,value,rect.slice(0,2),rect.slice(2),size,color,TRAVEL_FONT);l.lineHeight=size*this.assets.catalog.assets[TRAVEL_FONT].fontMetrics.height;this.alignInk(l,rect);return l;}
    private alignInk(l:Label,rect:number[]){const table=TRAVEL_FONT_DATA.ui[String(l.fontSize)];if(!table)return;const bounds=Array.from(l.string).map(c=>table.glyphs[c]).filter(Boolean);if(!bounds.length)return;const top=Math.min(...bounds.map(p=>p[0])),bottom=Math.max(...bounds.map(p=>p[1]));const baseline=(rect[3]-table.height)/2+table.ascent,shift=rect[3]/2-(top+bottom)/2-baseline,m=this.assets.catalog.assets[TRAVEL_FONT].fontMetrics;l.node.setPosition(rect[0],-(rect[1]+shift+(m.ascent-m.descent-.74)*l.fontSize/2));}
    private key(){const t=this.service.model.trip();return JSON.stringify([t.id,t.status,(t.events||[]).map((e:any)=>[e.uid,e.state,e.choice]),this.session.eventUid,this.session.choiceToken,this.session.feedback,this.service.last_error]);}
    private action(parent:Node,name:string,r:number[],fn:()=>void){const n=nodeAt(parent,name,...r as [number,number,number,number]);this.controls[name]=n;this.bindings.push(sharedUI().action(n,fn,()=>this.active&&this.scope.active&&!this.session.eventUid));return n;}
    private refresh(){
        this.bindings.forEach(b=>b.dispose());this.bindings=[];this.owner?.dispose();this.owner=lifetime(this.scope);const owner=this.owner;this.bubble=null;this.ui=null;this.markers=[];this.controls={};this.flowTarget=null;
        this.session.sync();const t=this.service.model.trip();if(this.tripId!==(t.id||'')){this.tripId=t.id||'';this.announced.clear();this.state.seedRoute(this.service.route_snapshot().route_progress);}
        const overlay=nodeAt(this.canvas,'MapLabelsAndControls');owner.own(()=>{overlay.active=false;overlay.destroy();});
        this.action(overlay,'back',[27,44,93,174],()=>this.back());
        for(const landmark of TRAVEL_SCENE.route.landmarks){const l=this.plate(overlay,'Landmark-'+landmark.name,landmark.name,landmark.rect,19,landmark.baked?[1,240/255,199/255]:[97/255,67/255,41/255]);if(landmark.baked){l.enableOutline=true;l.outlineColor=new Color(97,67,41,255);l.outlineWidth=1;}}
        this.progress=new TravelSignLabel(overlay,this.assets,owner,'RouteProgress',[239,1190,239,42],24,this.physicalWidth);this.texture(overlay,ATLAS,[220,150,290,55],owner,true,[12,430,488,80]);this.arrival=new TravelSignLabel(overlay,this.assets,owner,'CurrentStation',[240,158,250,36],21,this.physicalWidth);
        const foot=TRAVEL_SCENE.route.actor_foot,size=TRAVEL_SCENE.route.actor_size,pivot=nodeAt(overlay,'TravelerPivot');this.traveler={pivot,sprite:this.texture(pivot,ART+'travel_map_actor_v5.png',[-foot[0],-foot[1],...size],owner)};
        const flow=nodeAt(overlay,'FullViewportGlints',0,-this.offset,720,this.height);this.glints=new TravelGlints(flow,this.assets,owner);
        if(!this.session.eventUid){const e=(t.events||[]).find((e:any)=>['hidden','decided'].indexOf(e.state)<0);if(e)this.flowTarget=routePosition((e.cell+1)/10);}
        for(const e of t.events||[]){if(e.state==='hidden')continue;const at=routePosition((e.cell+1)/10);this.action(overlay,'event_'+e.uid,[at[0]-23,at[1]-23,46,46],()=>{this.session.enter(e.uid);this.refresh();});const image=this.texture(overlay,TRAVEL_GLINT,[at[0]-35.88,at[1]-35.88,71.76,71.76],owner,false);this.markers.push({uid:e.uid,cell:e.cell,pending:e.state!=='decided',image,at});}
        if(this.session.feedback&&!this.session.eventUid)this.result(overlay,owner);
        if(this.session.eventUid)this.event(overlay,owner);
        if(this.service.last_error){const l=label(overlay,this.assets,'SaveFailure','保存暂时不可用，这一步还没有完成。',[74,1135],[572,58],23,[1,244/255,218/255],TRAVEL_FONT);l.enableOutline=true;l.outlineColor=new Color(112,63,34,255);l.outlineWidth=4;}
        this.signature=this.key();
    }
    private event(parent:Node,owner:Scope){
        const e=this.session.event;if(!e)return;this.texture(parent,ART+(e.id==='offer'?'travel_offer_person_v5.png':'travel_people_v5.png'),[57,390,256,333],owner,true,e.id==='offer'?[205,43,853,1233]:NPC[e.id]||NPC.vampire);
        const manual=e.state==='manual',uid=this.session.eventUid,token=this.session.choiceToken,captions=manual?e.options.map((o:any)=>o.text+(o.cost>0?'\n'+o.cost+' 功德':'')):[],chosen=this.service.model.chosen_option(e),text=e.text+(!manual&&chosen?.result?'\n\n'+chosen.result:'');
        const glyphs=TRAVEL_FONT_DATA.brushCharacters,bubble=sharedUI().choiceBubble(parent,this.assets.font(BRUSH),text,captions,[323,732],[16,390,688,365],{createDrawing:(root:Node,name:string)=>new Stroke2D(root,this.assets,owner,name,ATLAS),fontSize:28,minimumFontSize:20,fontMetrics:this.assets.catalog.assets[BRUSH].fontMetrics,bodyRect:[273,464,390,245],padding:[41,30],showClose:true,interactionRect:[57,390,612,343],choiceFontSize:21,choiceHeight:58,hasGlyph:(c:string)=>glyphs.includes(c),unsupportedText:'这段文字暂时无法显示',paper:[1,243/255,217/255,1],edge:[188/255,140/255,81/255,1],ink:[84/255,40/255,15/255,1],hint:manual?(e.id==='offer'?'不足时分出现有功德':'选完继续走，先合上也可以'):'',onChoice:(i:number)=>director.once(Director.EVENT_AFTER_UPDATE,()=>{if(!this.active||!owner.active)return;this.session.choose(i,uid,token);this.refresh();}),onCancel:()=>director.once(Director.EVENT_AFTER_UPDATE,()=>{if(this.active&&owner.active)this.back();})});
        this.bubble=bubble;this.ui=nodeAt(parent,'ModalInput',0,-this.offset,720,this.height);const hit=this.ui;
        this.bindings.push(sharedUI().pointer(hit,{down:(p:number[],id:number)=>bubble.down(id,[p[0],p[1]-this.offset]),move:(p:number[],id:number)=>bubble.move(id,[p[0],p[1]-this.offset]),up:(p:number[],id:number)=>bubble.up(id,[p[0],p[1]-this.offset]),cancel:()=>bubble.cancelPointer()},()=>this.active&&owner.active));
        const wheel=(event:EventMouse)=>{if(!this.active||!owner.active)return;const p=event.getUILocation(),local=parent.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(p.x,p.y,0)),r=bubble.snapshot().textRect;if(local.x>=r[0]&&local.x<r[0]+r[2]&&-local.y>=r[1]&&-local.y<r[1]+r[3])bubble.scrollBy(-event.getScrollY());event.propagationStopped=true;};hit.on(Node.EventType.MOUSE_WHEEL,wheel);owner.own(()=>hit.off(Node.EventType.MOUSE_WHEEL,wheel));
    }
    private result(parent:Node,owner:Scope){
        const l=label(parent,this.assets,'EncounterResult',this.session.feedback,[144,0],[492,48],23,INK,TRAVEL_FONT),ui=l.node.getComponent(UITransform),m=this.assets.catalog.assets[TRAVEL_FONT].fontMetrics;l.lineHeight=23*m.height;l.overflow=Label.Overflow.RESIZE_HEIGHT;l.updateRenderData(true);const height=Math.max(88,Math.ceil(ui.height-.26*l.lineHeight)+40),y=686-height/2;ui.setContentSize(492,height-40);l.overflow=Label.Overflow.CLAMP;l.node.setPosition(114,-(y+20+(m.ascent-m.descent-.74)*23/2));
        const root=nodeAt(parent,'ResultTicket',80,y,560,height),sx=[12,52,460,500],sy=[430,448,492,510],dx=[0,40,520,560],dy=[0,18,height-18,height];for(let j=0;j<3;j++)for(let i=0;i<3;i++)this.texture(root,ATLAS,[dx[i],dy[j],dx[i+1]-dx[i],dy[j+1]-dy[j]],owner,false,[sx[i],sy[j],sx[i+1]-sx[i],sy[j+1]-sy[j]]);l.node.setSiblingIndex(parent.children.length-1);
    }
    private render(delta:number){
        const snap=this.service.route_snapshot(),progress=snap.route_progress,paused=snap.clock_mode==='CHOICE_PAUSED',t=this.service.model.trip();this.state.updateRoute(progress,paused);this.scene.advance(delta);
        const stage=Math.min(10,Math.floor(snap.route_elapsed_seconds/10));const progressText=(paused?'选择暂停':t.status==='returned'?'已经到家':'旅途中')+' · '+stage+' / 10';if(this.progress.string!==progressText){this.progress.string=progressText;}const stationText='当前站：'+narrativeMapping(t,Math.min(10,Math.floor(progress*10))).node_name;if(this.arrival.string!==stationText){this.arrival.string=stationText;}
        const at=routePosition(progress),tint=travelLight(this.clock.hour()).tint;this.traveler.pivot.setPosition(at[0],-at[1]);this.traveler.pivot.angle=(!paused&&progress<1?Math.sin(this.session.elapsed*8)*.025:0)*-180/Math.PI;this.traveler.sprite.sprite.color=new Color(tint[0]*255,tint[1]*255,tint[2]*255,255);
        this.glints.root.parent.setPosition(0,this.offset);this.glints.render(this.session.elapsed,this.flowTarget?[this.flowTarget[0],this.flowTarget[1]+this.offset]:null,this.height);
        for(const marker of this.markers){const time=this.session.elapsed+marker.cell*.83,b=.5+.5*Math.sin(time*Math.PI*2/3.8),scale=marker.pending?.90+.14*b:.68,size=71.76*scale,dy=marker.pending?-2*Math.sin(time*Math.PI*2/4.6):0;marker.image.place([marker.at[0]-size/2,marker.at[1]+dy-size/2,size,size]);marker.image.sprite.color=new Color(255,255,255,(marker.pending?.55+.45*b:.32)*255);}
        if(!this.session.eventUid){const pending=(t.events||[]).find((e:any)=>['hidden','decided'].indexOf(e.state)<0&&!this.announced.has(e.uid));if(pending&&this.state.announceEncounter())this.announced.add(pending.uid);}
        this.bubble?.advance(delta);
    }
    private back(){const result=this.session.back();if(result==='close')this.onBack();else this.refresh();}
    advance(delta:number){if(!this.active)return;this.session.advance(delta);if(this.signature!==this.key())this.refresh();this.render(Number.isFinite(delta)?Math.max(0,delta):0);}
    resume(allowInput=true){this.active=allowInput;this.root.active=true;this.state.setActive(allowInput);if(this.signature!==this.key())this.refresh();this.render(0);}
    pause(){this.active=false;this.bindings.forEach(b=>b.cancel());this.bubble?.cancelPointer();this.session.suspend();this.state.setActive(false);}
    snapshot(){return {active:this.active,...this.session.snapshot(),controls:Object.keys(this.controls),bubble:this.bubble?.snapshot()||null,route:this.service.route_snapshot(),scene:this.state.snapshot(this.clock.hour()),height:this.height,signs:[this.arrival.snapshot(),this.progress.snapshot()]};}
}
