// Full runtime snapshots are opt-in; default play never serializes them for console output.
import { EventKeyboard, input, Input, KeyCode, Node, screen, UIOpacity, UITransform, Vec3 } from 'cc';
import { GameAssets } from './Assets';
import { audioTransport, renderSurfaces, Scope, sharedUI } from './Engine';
import { AudioPort, HomeMusic } from './AudioBehavior';
import { box } from './Viewport';
import { nodeAt, picture } from './Visual';
import { XiaoyuRig } from './XiaoyuRig';
import { HomeClock } from './HomeClock';
import { HomeLighting } from './HomeLighting';
import { HomeShadows } from './HomeShadows';
import { HomePlants } from './HomePlants';
import { homeRenderPlan } from './HomeRenderPlan';
import { HomeHUD } from './HomeHUD';
import { SessionMerit } from './MeritFeedback';
import { MeritArtView } from './MeritArtView';
import { FishInteraction } from './FishInteraction';
import { InteractionFeedback } from './InteractionFeedback';
import { HomeIncense, makeIncenseGradient } from './HomeIncense';
import { HomeFlowers } from './HomeFlowers';
import { HomeBackpack } from './HomeBackpack';
import { BackpackInteraction } from './BackpackInteraction';
import { HomeNote } from './HomeNote';
import { HomeProps } from './HomeProps';
import { HomePropInteraction } from './HomePropInteraction';
import { HomeDepartureVisual } from './HomeDepartureVisual';
import { DEPARTURE_FINISH_AT } from './DepartureMotion';
import { homeLighting } from './LightingSnapshot';

let roomSerial=0;

export class HomePage {
    readonly root: Node;
    get viewportOffset(){return this.plan.offset;}
    travelInteractions:{busy:boolean;down(id:number,at:number[]):boolean;move(id:number,at:number[]):boolean;up(id:number,at:number[]):void;cancelPointer():void}=null;
    wardrobeInteractions:{busy:boolean;down(id:number,at:number[]):boolean;move(id:number,at:number[]):boolean;up(id:number,at:number[]):void;cancelPointer():void}=null;
    photoInteractions:{busy:boolean;down(id:number,at:number[]):boolean;move(id:number,at:number[]):boolean;up(id:number,at:number[]):void;cancelPointer():void}=null;
    readonly rig: XiaoyuRig;
    readonly lighting:HomeLighting;
    readonly shadows:HomeShadows;
    readonly plants:HomePlants;
    readonly hud:HomeHUD;
    readonly merit=new SessionMerit();
    private meritArt:MeritArtView;
    private active=false;
    private knock:AudioPort;
    readonly roomRoot:Node;
    private collectionObject:{node:Node;resource:string;centered:boolean;size:number[]};private collectionRest:{position:Vec3;scale:Vec3};
    private surface:any;private targetLease:any;private plan:ReturnType<typeof homeRenderPlan>;
    readonly fish:FishInteraction;
    readonly incense:HomeIncense;
    readonly flowers:HomeFlowers;
    readonly backpack:HomeBackpack;
    readonly bag:BackpackInteraction;readonly note:HomeNote;
    readonly propVisuals:HomeProps;readonly props:HomePropInteraction;
    onDarkroomRequest:()=>boolean=null;
    onPrepareDarkroom=()=>{};
    onCancelDarkroom=()=>{};
    onTravelRequest:()=>boolean=null;
    onMeritChanged=(amount:number)=>{};
    private travelLoading=false;private travelFull=false;
    private pointerBinding:any;private feedback:InteractionFeedback;
    private dragCarrier:Node=null;private restIndex=0;private presentedActor='';
    private roomLayers:Array<{z:number;order:number;node:Node}>=[];private backpackLayerRevision=-1;private propLayerRevision=-1;
    private departure:HomeDepartureVisual=null;private departureScope:Scope=null;private departureAge=0;private departureSaved:any=null;private lastDeparture:any=null;private actorProjectionAlpha=1;private travelAway=false;
    onDepartureFinished=()=>{};
    static async create(parent:Node,assets:GameAssets,scope:Scope,height:number,gestureSeen=()=>false,clock=new HomeClock(),music:()=>HomeMusic=()=>null) {
        const renderer=renderSurfaces(),plan=homeRenderPlan(height,screen.windowSize.width);
        const targetLease=await assets.acquireResizableTarget('HomeRoom-'+(++roomSerial),plan.pixels[0],plan.pixels[1],renderer,scope),target=targetLease.texture;
        const gradient=await assets.acquireTransient('IncenseRodGradient',65536,makeIncenseGradient,texture=>texture.destroy(),scope);
        const page=new HomePage(parent,assets,scope,height,gestureSeen,clock,target,plan,music,gradient);
        page.targetLease=targetLease;page.resize(height,screen.windowSize.width);await scope.guard(page.surface.ready);
        (globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] Home room prepared '+JSON.stringify(page.surface.snapshot()));
        return page;
    }
    private constructor(parent: Node, private assets: GameAssets, scope: Scope, height: number, gestureSeen:()=>boolean,private clock:HomeClock,target:any,plan:ReturnType<typeof homeRenderPlan>,music:()=>HomeMusic,gradient:any) {
        this.plan=plan;
        this.root = nodeAt(parent, 'HomePage', 0, (height - 1280) / 2, 720, 1280);
        this.root.active=false;
        scope.own(() => { this.root.active = false; this.root.destroy(); });
        this.surface=renderSurfaces().create({host:parent.scene,displayParent:this.root,logicalSize:plan.logical,displayRect:[0,-plan.offset,720,height],target,name:'HomeRoom'},scope);
        this.roomRoot=nodeAt(this.surface.content,'HomeWorld',0,plan.offset,720,1280);
        this.lighting=new HomeLighting(this.roomRoot,assets,scope,clock);
        this.shadows=new HomeShadows(this.roomRoot,assets,scope,clock);
        const scene = assets.scene('res://home/home_world.tscn');
        const resources = new Map(scene.sections.filter(s => s.kind === 'ext_resource').map(s => [s.id, s.path]));
        const layers=this.roomLayers;
        const props:Array<{node:Node;resource:string;p:any;spec:any;anchor:number[];footprint:number[]}>=[];
        scene.sections.filter(s => s.kind === 'node' && s.type === 'Sprite2D').forEach((section, order) => {
            if (section.properties.visible === false && ['UpperBleedEdge','LowerBleedEdge'].indexOf(section.name)<0) return;
            const resource = resources.get(section.properties.texture.value) as string;
            const item = picture(this.roomRoot, assets, scope, resource, section.name, section.properties);
            const p=section.properties;
            if(section.name==='Treasure')this.collectionObject={node:item.root,resource,centered:p.centered!==false,size:item.spec.size};
            if(section.name==='Bag')item.sprite.enabled=false;
            else {
                if(p['metadata/surface']!==undefined)this.lighting.receiver(item.sprite,item.spec,p['metadata/surface'],p['metadata/visible_uv']||[0,0,1,1],section.name==='BedForeground'?'bed':section.name.indexOf('Bleed')>=0?'bleed':'receiver');
                if(p['metadata/ground']!==undefined)this.shadows.add(item.root,resource,p,p.centered===undefined?true:p.centered);
            }
            const footprint={Bag:[50,24],Doll:[34,16],Bowl:[46,18],Altar:[125,30]}[section.name];
            if(footprint){const uv=p['metadata/visible_uv']||[0,0,1,1];props.push({node:item.root,resource,p,spec:item.spec,anchor:[p.position[0]+(uv[0]+uv[2]/2)*item.spec.size[0]*p.scale[0],p['metadata/ground']],footprint});}
            layers.push({z: section.properties.z_index || 0, order, node: item.root});
        });
        this.rig = new XiaoyuRig(this.roomRoot, assets, scope);
        this.rig.receivers.forEach(item=>this.lighting.receiver(item.sprite,item.spec,1,[.2,.15,.68,.72],item.node.name==='OriginalBody'||item.eye?'face':'receiver',item.eye||0,item.eye?this.rig.pupilOffsets()[item.eye-1]:[0,0]));
        this.rig.receivers.filter(item=>item.node.name.indexOf('Eye')<0).forEach(item=>this.shadows.add(item.node,item.resource,{'metadata/ground':951,'metadata/height_factor':.72,'metadata/floor':true,'metadata/shadow_z':1,'metadata/thickness':0}));
        this.rig.receivers.filter(item=>item.node.name.indexOf('Eye')<0).forEach(item=>this.shadows.bindOpacity(item.node,()=>this.actorProjectionAlpha));
        this.rig.softMeshes().forEach(part=>this.shadows.bindSoft(part.node,part.mesh,()=>this.rig.softActive,()=>this.rig.liftHeight,()=>this.fish?.ground[1]||951,()=>this.presentedActor==='fish'&&this.dragCarrier?this.dragCarrier:this.roomRoot));
        this.plants=new HomePlants(this.roomRoot,assets,scope,this.lighting,this.clock);
        this.plants.roots.forEach(layer=>layers.push(layer));
        this.knock=audioTransport().player(this.root,scope,'WoodKnock',(event:string,state:any)=>(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] knock audio '+event+' '+JSON.stringify(state)));
        this.knock.gain(Math.pow(10,-8/20));
        this.meritArt=new MeritArtView(this.roomRoot,assets,scope);
        this.hud=new HomeHUD(this.root,assets,scope,height,music);
        this.feedback=new InteractionFeedback(this.roomRoot,scope);
        this.incense=new HomeIncense(this.roomRoot,props.find(p=>p.node.name==='Altar').node,assets,scope,this.lighting,this.shadows,gradient,()=>this.rig.noteAnchor(this.roomRoot),()=>[0,-plan.offset,720,plan.logical[1]]);
        this.flowers=new HomeFlowers(this.roomRoot,props.find(p=>p.node.name==='Altar').node,assets,scope,this.lighting,this.shadows,clock);
        this.flowers.layers.forEach(layer=>layers.push(layer));
        this.backpack=new HomeBackpack(this.roomRoot,props.find(p=>p.node.name==='Bag').node,assets,scope,this.lighting,clock,this.rig,()=>this.fish?.ground[1]||951);
        this.backpack.layers.forEach(layer=>layers.push(layer));
        // Room RT and the user's main Canvas have different physical origins.
        // Actor coordinates remain canonical in either parent; map input and
        // projection through the actor's current presentation frame.
        const frame=()=>this.dragCarrier||this.roomRoot;
        const world=(at:number[])=>{const p=frame().getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1]));return [p.x,p.y];},canonical=(at:number[])=>{const p=frame().getComponent(UITransform).convertToNodeSpaceAR(new Vec3(at[0],at[1]));return [p.x,-p.y];};
        const visible=()=>[this.hud.safe[0],this.hud.safe[1]-plan.offset,this.hud.safe[2],this.hud.safe[3]];
        this.fish=new FishInteraction({
            hit:at=>{const point=world(at);if(this.backpack.hit(point)||this.propVisuals.occludesFish(point))return false;return !!this.rig.hitAt(point);},
            position:()=>[this.rig.root.position.x,-this.rig.root.position.y],bounds:()=>this.rig.visualBounds(frame()),visibleRect:visible,
            validDrop:at=>{if(Math.hypot(at[0]-350,at[1]-951)<.00001)return true;if(at[0]<270||at[0]>=432||at[1]<904||at[1]>=1000)return false;return !props.some(prop=>{if(!prop.p['metadata/floor'])return false;const dx=(at[0]-prop.anchor[0])/(145+prop.footprint[0]+8),dy=(at[1]-prop.anchor[1])/(30+prop.footprint[1]+8);return dx*dx+dy*dy<1;});},
            suspend:()=>{this.props.cancelDrink('player_press',true);this.rig.suspend();this.knock.stop();},resume:()=>this.rig.resume(),tap:()=>this.rig.tap(),beginLift:at=>this.rig.beginLift(world(at)),lift:(amount,delta,lag)=>this.rig.lift(amount,delta,lag),grip:()=>canonical(this.rig.gripWorld()),liftMark:at=>this.propVisuals.marks.emit('lift',[at[0]-65,at[1]+26]),
            setAnchor:(ground,lift)=>{this.rig.liftHeight=lift;this.rig.root.setPosition(ground[0]-335,-ground[1]+336+lift);},
            present:active=>{if(active&&!this.dragCarrier){this.restIndex=this.rig.root.getSiblingIndex();this.dragCarrier=nodeAt(this.root,'FishDragPresentation');this.presentedActor='fish';this.rig.root.setParent(this.dragCarrier);this.rig.setLightingOrigin(this.dragCarrier);}else if(!active&&this.presentedActor==='fish'){this.rig.root.setParent(this.roomRoot);this.rig.root.setSiblingIndex(this.restIndex);this.dragCarrier.destroy();this.dragCarrier=null;this.presentedActor='';this.rig.setLightingOrigin(this.roomRoot);}},land:impact=>this.rig.land(impact),
            pulse:(at,accepted)=>this.feedback.pulse(at,accepted),hold:(at,fraction)=>this.feedback.hold(at,fraction),clear:()=>{this.feedback.clear();this.rig.resetSecondary();},
        });
        const bagProp=props.find(p=>p.node.name==='Bag'),home=bagProp.anchor.slice(),offset=[home[0]-bagProp.node.position.x,home[1]+bagProp.node.position.y];
        this.note=new HomeNote(this.roomRoot,assets,scope,()=>this.rig.noteAnchor(this.roomRoot));
        this.bag=new BackpackInteraction({
            hit:at=>this.backpack.hit(world(at)),visibleRect:visible,anchor:()=>[bagProp.node.position.x+offset[0],-bagProp.node.position.y+offset[1]],home:()=>home,fishGround:()=>this.fish.ground,
            bounds:()=>this.backpack.visualBounds(),setAnchor:(at,lift,depth)=>this.backpack.setInteractionAnchor(at,lift,depth,offset),
            validDrop:at=>{if(Math.hypot(at[0]-home[0],at[1]-home[1])<.00001)return true;if(at[1]<750)return at[0]>=500&&at[0]<666&&at[1]>=485&&at[1]<690;if(at[1]<815||at[1]>1140)return false;const occupied=[{anchor:this.fish.ground,footprint:[145,30]},...props.filter(p=>p!==bagProp&&p.p['metadata/floor'])];return !occupied.some(p=>{const dx=(at[0]-p.anchor[0])/(50+p.footprint[0]+8),dy=(at[1]-p.anchor[1])/(24+p.footprint[1]+8);return dx*dx+dy*dy<1;});},
            present:active=>{if(active&&!this.dragCarrier){this.dragCarrier=nodeAt(this.root,'BackpackDragPresentation');this.presentedActor='bag';this.backpack.setPresentation(this.dragCarrier);}else if(!active&&this.presentedActor==='bag'){this.backpack.setPresentation();this.dragCarrier.destroy();this.dragCarrier=null;this.presentedActor='';this.sortRoomLayers();}},
            interruptReturn:()=>this.backpack.interruptReturn(),restoreWall:()=>this.backpack.restoreWall(),captureSettle:()=>this.backpack.captureSettle(),settleTransform:e=>this.backpack.settleTransform(e),
            suspend:()=>{this.rig.suspend();this.rig.resetSecondary();this.knock.stop();},resume:()=>this.rig.resume(),wear:()=>this.backpack.showWorn(),restoreWorn:immediate=>this.backpack.restore(immediate),
            offer:()=>{this.incense.dismiss();this.note.ask('travel');},dismissOffer:immediate=>this.note.dismiss(immediate),pulse:(at,accepted)=>this.feedback.pulse(at,accepted),hold:(at,fraction)=>this.feedback.hold(at,fraction),clear:()=>this.feedback.clear(),
        });
        this.propVisuals=new HomeProps(this.roomRoot,assets,scope,props,layers,this.shadows,this.rig,this.incense,this.flowers,()=>this.fish.ground,(id,active)=>{if(active&&!this.dragCarrier){this.dragCarrier=nodeAt(this.root,'PropDragPresentation');this.presentedActor=id;}else if(!active&&this.presentedActor===id){this.dragCarrier.destroy();this.dragCarrier=null;this.presentedActor='';this.sortRoomLayers();}return this.dragCarrier||this.roomRoot;},()=>this.presentedActor==='fish'?this.dragCarrier:this.roomRoot);
        this.rig.onActionMark=(kind,pixel,offset)=>{if(this.active&&!this.travelAway){const at=this.rig.actionMarkPoint(pixel,this.roomRoot);this.propVisuals.marks.emit(kind,at.map((v,i)=>v+offset[i]));}};this.rig.onClearActionMarks=()=>this.propVisuals.marks.clear();
        this.props=new HomePropInteraction({
            hit:at=>this.propVisuals.hit(at),visibleRect:visible,home:id=>this.propVisuals.home(id),bounds:id=>this.propVisuals.visualBounds(id),fishGround:()=>this.fish.ground,actorAvailable:()=>!this.travelAway,
            setAnchor:(id,at,lift,depth)=>this.propVisuals.setAnchor(id,at,lift,depth),validDrop:(id,at)=>this.propVisuals.validDrop(id,at),present:(id,active)=>this.propVisuals.present(id,active),
            captureSettle:id=>this.propVisuals.captureSettle(id),settleTransform:(id,e)=>this.propVisuals.settleTransform(id,e),restore:id=>this.propVisuals.restore(id),
            suspend:()=>{this.rig.suspend();this.rig.resetSecondary();this.knock.stop();},resume:()=>this.rig.resume(),resetFish:()=>this.propVisuals.resetFish(),
            drinkStart:()=>this.propVisuals.drinkStart(),drinkAdvance:(age,delta)=>this.propVisuals.drinkAdvance(age,delta),drinkStop:preserve=>this.propVisuals.drinkStop(preserve),
            offer:()=>{this.incense.dismiss();this.onPrepareDarkroom();this.note.ask('darkroom');},dismissOffer:immediate=>this.note.dismiss(immediate),prepareDoll:()=>this.onPrepareDarkroom(),
            pulse:(at,accepted)=>this.feedback.pulse(at,accepted),hold:(at,fraction)=>this.feedback.hold(at,fraction),clear:()=>{this.feedback.clear();this.propVisuals.clear();},
        });
        this.note.onDecision=(kind,accepted)=>{if(kind==='travel'){if(!accepted||!this.onTravelRequest?.()){this.bag.resolveOffer();if(accepted)this.note.info('旅行还在准备中');}}else if(kind==='darkroom_wait'){if(!accepted)this.onCancelDarkroom();}else if(kind==='darkroom_retry'){if(accepted)this.onDarkroomRequest?.();}else{this.props.resolveOffer();if(accepted&&(!this.onDarkroomRequest||!this.onDarkroomRequest()))this.note.info('暗室还在准备中');}(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] route decision '+JSON.stringify({kind,accepted,bag:this.bag.snapshot(),props:this.props.snapshot(),backpack:this.backpack.snapshot(),note:this.note.snapshot()}));};
        const point=(at:number[])=>[at[0],at[1]-plan.offset],report=(event:string)=>(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] fish input '+JSON.stringify({event,...this.fish.snapshot(),rig:this.rig.snapshot(),shadow:this.shadows.snapshot()}));
        const bagReport=(event:string)=>(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] bag input '+JSON.stringify({event,...this.bag.snapshot(),backpack:this.backpack.snapshot(),note:this.note.snapshot()}));
        const propReport=(event:string)=>(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] prop input '+JSON.stringify({event,...this.props.snapshot(),visual:this.propVisuals.snapshot(),note:this.note.snapshot()}));
        let owner='';this.hud.worldOwnsInput=()=>this.travelLoading||!!this.departure||!!this.travelInteractions?.busy||!!this.photoInteractions?.busy||this.note.ownsInput||owner!=='';this.pointerBinding=sharedUI().pointer(this.hud.root,{down:(at:number[],id:number)=>{if(this.departure||this.travelLoading)return false;if(this.photoInteractions?.busy)return true;const p=point(at);if(this.note.down(id,p)){owner='note';return true;}if(this.travelInteractions?.down(id,p)){owner='travel';return true;}if(this.fish.state==='SETTLING'||this.bag.state==='SETTLING'||this.props.state==='SETTLING')return false;if(this.incense.down(id,p)){owner='incense';(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] incense input down');return true;}if(!this.travelAway&&!this.travelFull&&this.bag.down(id,p)){owner='bag';bagReport('down');return true;}if(this.props.down(id,p)){owner='prop';propReport('down');return true;}if(this.wardrobeInteractions?.down(id,p)){owner='wardrobe';return true;}if(this.photoInteractions?.down(id,p)){owner='photo';return true;}const accepted=!this.travelAway&&this.fish.down(id,p);if(accepted){owner='fish';report('down');}return accepted;},move:(at:number[],id:number)=>{const p=point(at);if(owner==='wardrobe')this.wardrobeInteractions?.move(id,p);else if(owner==='photo')this.photoInteractions?.move(id,p);else if(owner==='travel')this.travelInteractions?.move(id,p);else if(owner==='incense')this.incense.move(id,p);else if(owner==='bag')this.bag.move(id,p);else if(owner==='prop')this.props.move(id,p);else if(owner==='note')this.note.move(id,p);else if(owner==='fish')this.fish.move(id,p);},up:(at:number[],id:number)=>{const p=point(at);if(owner==='wardrobe')this.wardrobeInteractions?.up(id,p);else if(owner==='photo')this.photoInteractions?.up(id,p);else if(owner==='travel')this.travelInteractions?.up(id,p);else if(owner==='incense'){this.incense.up(id,p);(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] incense input up '+JSON.stringify(this.incense.snapshot()));}else if(owner==='bag'){this.bag.up(id,p);bagReport('up');}else if(owner==='prop'){this.props.up(id,p);propReport('up');}else if(owner==='note')this.note.up(id,p);else if(owner==='fish'){this.fish.up(id,p);report('up');}owner='';},cancel:()=>{if(owner==='wardrobe')this.wardrobeInteractions?.cancelPointer();else if(owner==='photo')this.photoInteractions?.cancelPointer();else if(owner==='travel')this.travelInteractions?.cancelPointer();else if(owner==='incense')this.incense.cancel();else if(owner==='bag')this.bag.cancel(false);else if(owner==='prop')this.props.cancel('pointer_cancelled',false);else if(owner==='note')this.note.cancelPointer();else if(owner==='fish')this.fish.cancel(false);owner='';}},()=>this.active&&!this.hud.blocked);
        const escape=(e:EventKeyboard)=>{if(e.keyCode===KeyCode.ESCAPE){if(this.photoInteractions?.busy){this.photoInteractions.cancelPointer();return;}if(this.departure||this.travelLoading||this.travelInteractions?.busy||this.note.ownsInput||this.bag.state!=='IDLE'||this.props.state!=='IDLE'||this.props.drinking)return;this.pointerBinding.cancel();this.bag.cancel(true);this.props.cancel();this.fish.cancel(true);this.backpack.restore(true);this.incense.cancel();this.incense.dismiss();report('escape');}};input.on(Input.EventType.KEY_DOWN,escape);
        scope.own(()=>{this.active=false;this.pointerBinding.dispose();this.bag.cancel(true);this.props.cancel();this.fish.cancel(true);input.off(Input.EventType.KEY_DOWN,escape);});
        this.hud.onOpen=()=>{this.pointerBinding.cancel();this.bag.cancel(true);this.props.cancel();this.note.dismiss();this.fish.cancel(true);this.backpack.restore(true);this.incense.cancel();this.incense.dismiss();this.rig.behavior.director.resumeAfterPlayer();this.knock.stop();};
        this.rig.onContact=()=>{if(!this.active||this.travelAway)return;if(this.merit.award(this.rig.behavior.contacts,this.incense.state.merit())){this.hud.merit.setValue(this.merit.count);this.onMeritChanged(this.merit.count);(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] merit contact '+JSON.stringify(this.merit.snapshot()));}if(gestureSeen()){this.knock.assign(assets.audio('res://assets/wood_knock.wav'));this.knock.play();}};
        layers.push({z:100,order:1003,node:this.meritArt.root});
        layers.push({z:90,order:1004,node:this.feedback.root},{z:84,order:1008,node:this.propVisuals.marks.root});
        layers.push({z:22,order:1005,node:this.incense.root},{z:24,order:1006,node:this.incense.visual},{z:24,order:1007,node:this.incense.hint});
        layers.push({z: 12, order: 1000, node: this.rig.root});
        layers.push({z:-40,order:1001,node:this.lighting.shafts()},{z:-39,order:1002,node:this.lighting.dustNode()});
        this.shadows.layers.forEach(layer=>layers.push(layer));
        this.sortRoomLayers();
        this.lighting.update();
        this.shadows.update();
        (globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] Home lighting candidate '+JSON.stringify(this.lighting.snapshot()));
        (globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] Home shadow candidate '+JSON.stringify(this.shadows.snapshot()));
        (globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] Home render surface '+JSON.stringify(this.surface.snapshot()));
    }
    resize(height:number,physicalWidth:number){
        const next=homeRenderPlan(height,physicalWidth);
        try{this.targetLease.resize(next.pixels[0],next.pixels[1]);}catch(error){this.surface.layout(this.plan.logical,[0,-this.plan.offset,720,this.plan.logical[1]],this.targetLease.texture);throw error;}
        this.pointerBinding.cancel();this.travelInteractions?.cancelPointer();this.photoInteractions?.cancelPointer();this.wardrobeInteractions?.cancelPointer();
        Object.assign(this.plan,next);
        box(this.root,0,next.offset,720,1280);this.roomRoot.setPosition(0,-next.offset);
        this.surface.layout(next.logical,[0,-next.offset,720,height],this.targetLease.texture);
        this.hud.resize(height);const beams=this.roomRoot.getChildByName('WindowLightShafts2D');if(beams)box(beams,0,-next.offset,720,height);this.lighting?.resize(height);
        const extra=Math.max(0,(height-1600)/2);
        for(const name of ['UpperBleedEdge','LowerBleedEdge']){const n=this.roomRoot.getChildByName(name);if(n){n.active=extra>0;if(extra>0){if(name==='UpperBleedEdge')n.setPosition(0,160+extra);n.setScale(n.scale.x,extra/64,1);}}}
    }
    resume(allowInput=true) {this.active=allowInput;this.incense.setActive(true);this.surface.setActive(true);this.flowers.setActive(true);this.hud.setActive(allowInput);}
    // Call only after departure assets are ready and the trip commit succeeds.
    beginDeparture(scope:Scope,text=''){
        if(this.departure||this.travelAway||!scope.active)return false;
        const foot=[this.rig.root.position.x+335,-this.rig.root.position.y+336],visual=new HomeDepartureVisual(this.roomRoot,this.assets,scope,foot),opacity=this.rig.root.getComponent(UIOpacity)||this.rig.root.addComponent(UIOpacity);
        this.departureSaved={position:this.rig.root.position.clone(),rotation:this.rig.root.rotation.clone(),scale:this.rig.root.scale.clone(),opacity:opacity.opacity};this.departure=visual;this.departureScope=scope;this.departureAge=0;this.travelAway=true;
        this.pointerBinding.cancel();this.feedback.clear();this.bag.commitOffer();this.props.cancel('travel_departed',true);this.fish.cancel(true);this.knock.stop();this.rig.suspend();
        this.backpack.showWorn();this.backpack.proxy.active=true;
        this.roomLayers.push({z:107,order:1009,node:visual.root});this.sortRoomLayers();
        scope.own(()=>{if(this.departure===visual)this.finishDeparture();});this.advanceDeparture(0);
        if(text)this.note.info(text,'res://travel/assets/travel_ui.ttf');
        return true;
    }
    advanceDeparture(age:number){
        if(!this.departure)return;this.departure.advance(age);this.departureAge=this.departure.motion.age;
        const s=this.departure.motion.snapshot(),lighting=homeLighting(this.clock.hour(),this.clock.lampWeight());this.departure.setLighting(lighting.night,lighting.lampEnergy);
        this.rig.root.active=s.nativeVisible;this.rig.root.getComponent(UIOpacity).opacity=s.nativeAlpha*255;this.backpack.setDepartureAlpha(s.nativeAlpha);this.actorProjectionAlpha=s.nativeAlpha;this.backpack.projectionAlpha=s.nativeAlpha;
        if(!s.nativeVisible&&this.backpack.proxy.active){this.backpack.proxy.active=false;this.backpack.restore(true);this.backpack.setDepartureAlpha(1);}
        this.lastDeparture=this.departure.snapshot();
    }
    finishDeparture(){
        if(!this.departure)return false;const visual=this.departure,scope=this.departureScope,saved=this.departureSaved;this.lastDeparture=visual.snapshot();this.departure=null;this.departureScope=null;this.departureSaved=null;
        visual.release();this.roomLayers=this.roomLayers.filter(layer=>layer.node!==visual.root);this.rig.root.active=false;this.rig.root.setPosition(saved.position);this.rig.root.setRotation(saved.rotation);this.rig.root.setScale(saved.scale);this.rig.root.getComponent(UIOpacity).opacity=saved.opacity;
        this.backpack.proxy.active=false;this.backpack.restore(true);this.backpack.setDepartureAlpha(1);this.actorProjectionAlpha=0;this.backpack.projectionAlpha=0;this.rig.suspend();this.note.dismiss();scope.dispose();this.onDepartureFinished();return true;
    }
    restoreReturnedActor(){this.travelAway=false;this.finishDeparture();this.fish.ground=[350,951];this.rig.root.setPosition(15,-615);this.rig.root.active=true;const opacity=this.rig.root.getComponent(UIOpacity);if(opacity)opacity.opacity=255;this.actorProjectionAlpha=1;this.backpack.projectionAlpha=1;this.backpack.setDepartureAlpha(1);this.backpack.proxy.active=true;this.rig.resume();}
    get acceptsTravelInput(){return this.active&&!this.hud.blocked;}
    hitsCollection(at:number[]){const item=this.collectionObject;if(!item?.node.activeInHierarchy)return false;const w=this.roomRoot.getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1],0));if(this.backpack.hit([w.x,w.y])||this.propVisuals.hit(at)||(!this.travelAway&&this.rig.hitAt([w.x,w.y])))return false;const p=item.node.getComponent(UITransform).convertToNodeSpaceAR(w),x=p.x+(item.centered?item.size[0]/2:0),y=-p.y+(item.centered?item.size[1]/2:0),mask='res://travel/assets/treasure_hit.res',size=this.assets.catalog.assets[mask].size;return x>=0&&y>=0&&x<item.size[0]&&y<item.size[1]&&this.assets.bitmapContains(mask,Math.floor(x/item.size[0]*size[0]),Math.floor(y/item.size[1]*size[1]));}
    collectionFeedback(age:number){const n=this.collectionObject?.node;if(!n)return;if(!this.collectionRest)this.collectionRest={position:n.position.clone(),scale:n.scale.clone()};const rest=this.collectionRest,u=Math.max(0,Math.min(1,age/.28)),factor=1-.075*Math.sin(u*Math.PI*2)*(1-u);n.setScale(rest.scale.x*factor,rest.scale.y*factor,rest.scale.z);n.setPosition(580+(rest.position.x-580)*factor,-718+(rest.position.y+718)*factor,rest.position.z);}
    cancelCollectionFeedback(){const n=this.collectionObject?.node,r=this.collectionRest;this.collectionRest=null;if(n&&r){n.setPosition(r.position);n.setScale(r.scale);}}

    get acceptsTravelNotice(){return this.acceptsTravelInput&&!this.travelLoading&&!this.departure&&!this.travelInteractions?.busy&&!this.photoInteractions?.busy&&!this.note.visible&&this.fish.state==='IDLE'&&this.bag.state==='IDLE'&&this.props.state==='IDLE'&&!this.props.drinking;}
    setTravelLoading(loading:boolean){
        this.travelLoading=loading;
        if(loading){this.pointerBinding.cancel();this.props.cancel('departure_loading',true);this.fish.cancel(true);this.incense.cancel();this.incense.dismiss();this.note.dismiss();this.knock.stop();this.rig.suspend();}
    }
    restoreTravelOffer(){this.bag.resolveOffer();if(!this.travelAway)this.rig.resume();}
    setTravelMerit(amount:number){this.merit.count=Math.max(0,Math.trunc(amount));this.hud.merit.setValue(this.merit.count);}
    syncTravelState(away:boolean,full:boolean,departing:boolean){
        this.travelFull=full;
        // Service emits changed inside depart(), before beginDeparture owns the
        // outgoing rig. Do not hide it or set the away latch in that interval.
        if(departing&&!this.departure)return;
        if(!away&&this.travelAway)this.restoreReturnedActor();
        else if(away&&!this.travelAway){this.pointerBinding.cancel();this.props.cancel('travel_restored',true);this.fish.cancel(true);this.bag.cancel(true);this.feedback.clear();this.knock.stop();this.propVisuals.marks.clear();}
        this.travelAway=away;
        if(!this.departure){
            this.rig.root.active=!away;this.actorProjectionAlpha=away?0:1;
            if(!this.backpack.travelRehanging)this.backpack.proxy.active=!away&&!full;this.backpack.projectionAlpha=away||full?0:1;
            if(away){this.rig.suspend();this.knock.stop();}
        }
    }
    departureSnapshot(){return {away:this.travelAway,active:!!this.departure,visual:this.departure?this.departure.snapshot():this.lastDeparture,rigVisible:this.rig.root.active,rigOpacity:(this.rig.root.getComponent(UIOpacity)?.opacity??255)/255,actorProjectionAlpha:this.actorProjectionAlpha,bagProjectionAlpha:this.backpack.projectionAlpha,bagVisible:this.backpack.proxy.active};}
    showRouteWaiting(){this.pointerBinding.cancel();this.props.cancel('route_wait',true);this.incense.dismiss();this.note.routeWaiting();}
    showRouteError(){this.note.routeError();}
    clearRouteWaiting(){this.note.dismiss();this.incense.dismiss();}
    setInput(enabled:boolean){this.active=enabled;this.hud.setActive(enabled);if(!enabled){this.pointerBinding.cancel();this.knock.stop();}}
    addWorldLayer(node:Node,z:number){this.roomLayers.push({node,z,order:3000+this.roomLayers.length});this.sortRoomLayers();}
    syncWorldLayers(){if(this.backpack.layerRevision!==this.backpackLayerRevision||this.propVisuals.layerRevision!==this.propLayerRevision)this.sortRoomLayers();}
    private sortRoomLayers(){this.roomLayers.filter(layer=>layer.node.parent===this.roomRoot).sort((a,b)=>a.z-b.z||a.order-b.order).forEach((layer,index)=>layer.node.setSiblingIndex(index));this.backpackLayerRevision=this.backpack.layerRevision;this.propLayerRevision=this.propVisuals.layerRevision;}
    pause() {this.photoInteractions?.cancelPointer();this.wardrobeInteractions?.cancelPointer();this.finishDeparture();this.active=false;this.pointerBinding.cancel();this.bag.cancel(true);this.props.cancel();this.note.dismiss();this.fish.cancel(true);this.backpack.restore(true);this.incense.setActive(false);this.flowers.setActive(false);this.hud.setActive(false);this.surface.setActive(false);this.rig.focusLost();this.knock.stop();}
    advance(delta: number) {
        const before=this.fish.state,bagBefore=this.bag.state,propBefore=this.props.state,drinkBefore=this.props.drinking;
        this.propVisuals.marks.advance(delta);this.feedback.advance(delta);this.fish.advance(delta);this.bag.advance(delta);this.props.advance(delta);
        const dragId=this.bag.state==='DRAGGING'?'bag':this.props.state==='DRAGGING'?this.props.selected:'',dragBounds=dragId==='bag'?this.backpack.visualBounds():dragId?this.propVisuals.visualBounds(this.props.selected):null;
        this.rig.setActiveDragFocus(dragBounds?dragId:'',dragBounds?(dragId==='bag'?[dragBounds[0]+dragBounds[2]/2,dragBounds[1]+dragBounds[3]/2]:this.propVisuals.focusCenter(this.props.selected)):[0,0],this.dragCarrier||this.roomRoot);
        if(this.travelAway)this.rig.suspend();this.rig.advance(delta,this.clock.nightProgress()>=0);this.rig.advanceDragGaze(delta);this.propVisuals.marks.render();
        if(this.departure){this.advanceDeparture(this.departureAge+Math.max(0,delta));if(this.departureAge>=DEPARTURE_FINISH_AT)this.finishDeparture();}
        this.incense.advance(delta);this.flowers.syncActiveElapsed(this.clock.totalActive);this.merit.advance(delta);this.meritArt.update(this.merit.snapshot(),[this.fish.ground[0]-350,this.fish.ground[1]-951]);this.hud.advance(delta);this.plants.advance(delta);this.backpack.advance(delta);this.note.advance(delta);
        this.lighting.update();if(this.presentedActor==='fish')this.rig.setLightingOrigin(this.dragCarrier);else if(this.props.state==='DRAGGING'||this.props.state==='SETTLING')this.lighting.syncPresentation(this.dragCarrier);this.backpack.syncLightingOrigin();this.shadows.update();this.plants.updateShadows();this.backpack.updateShadows();
        this.syncWorldLayers();
        if(before!==this.fish.state)(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] fish transition '+JSON.stringify({...this.fish.snapshot(),rig:this.rig.snapshot(),shadow:this.shadows.snapshot()}));
        if(bagBefore!==this.bag.state)(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] bag transition '+JSON.stringify({...this.bag.snapshot(),backpack:this.backpack.snapshot(),note:this.note.snapshot()}));
        if(propBefore!==this.props.state||drinkBefore!==this.props.drinking)(globalThis as any).__LITTLE_STEPS_TRACE__ === true && console.info('[LittleSteps] prop transition '+JSON.stringify({...this.props.snapshot(),visual:this.propVisuals.snapshot(),rig:this.rig.snapshot(),shadow:this.shadows.snapshot(),note:this.note.snapshot()}));
    }
}
