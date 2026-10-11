import { EventKeyboard, input, Input, KeyCode, Node, screen, UITransform, Vec3 } from 'cc';
import { GameAssets } from './Assets';
import { audioTransport, renderSurfaces, Scope, sharedUI } from './Engine';
import { AudioPort, HomeMusic } from './AudioBehavior';
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

let roomSerial=0;

export class HomePage {
    readonly root: Node;
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
    private surface:any;
    readonly fish:FishInteraction;
    readonly incense:HomeIncense;
    readonly flowers:HomeFlowers;
    readonly backpack:HomeBackpack;
    readonly bag:BackpackInteraction;readonly note:HomeNote;
    onTravelRequest:()=>boolean=null;
    private pointerBinding:any;private feedback:InteractionFeedback;
    private dragCarrier:Node=null;private restIndex=0;private presentedActor='';
    private roomLayers:Array<{z:number;order:number;node:Node}>=[];private backpackLayerRevision=-1;
    static async create(parent:Node,assets:GameAssets,scope:Scope,height:number,gestureSeen=()=>false,clock=new HomeClock(),music:()=>HomeMusic=()=>null) {
        const renderer=renderSurfaces(),plan=homeRenderPlan(height,screen.windowSize.width);
        const target=await assets.acquireTransient('HomeRoom-'+(++roomSerial),renderer.estimateTarget(...plan.pixels),()=>renderer.createTarget(...plan.pixels,'HomeRoom'),texture=>texture.destroy(),scope);
        const gradient=await assets.acquireTransient('IncenseRodGradient',65536,makeIncenseGradient,texture=>texture.destroy(),scope);
        const page=new HomePage(parent,assets,scope,height,gestureSeen,clock,target,plan,music,gradient);
        await scope.guard(page.surface.ready);
        console.info('[LittleSteps] Home room prepared '+JSON.stringify(page.surface.snapshot()));
        return page;
    }
    private constructor(parent: Node, assets: GameAssets, scope: Scope, height: number, gestureSeen:()=>boolean,private clock:HomeClock,target:any,plan:ReturnType<typeof homeRenderPlan>,music:()=>HomeMusic,gradient:any) {
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
            if (section.properties.visible === false) return;
            const resource = resources.get(section.properties.texture.value) as string;
            const item = picture(this.roomRoot, assets, scope, resource, section.name, section.properties);
            const p=section.properties;
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
        this.rig.softMeshes().forEach(part=>this.shadows.bindSoft(part.node,part.mesh,()=>this.rig.softActive,()=>this.rig.liftHeight,()=>this.fish?.ground[1]||951,()=>this.dragCarrier||this.roomRoot));
        this.plants=new HomePlants(this.roomRoot,assets,scope,this.lighting,this.clock);
        this.plants.roots.forEach(layer=>layers.push(layer));
        this.knock=audioTransport().player(this.root,scope,'WoodKnock',(event:string,state:any)=>console.info('[LittleSteps] knock audio '+event+' '+JSON.stringify(state)));
        this.knock.gain(Math.pow(10,-8/20));
        this.meritArt=new MeritArtView(this.roomRoot,assets,scope);
        this.hud=new HomeHUD(this.root,assets,scope,height,music);
        this.feedback=new InteractionFeedback(this.roomRoot,scope);
        this.incense=new HomeIncense(this.roomRoot,props.find(p=>p.node.name==='Altar').node,assets,scope,this.lighting,this.shadows,gradient,()=>this.rig.noteAnchor(this.roomRoot),()=>[0,-plan.offset,720,height]);
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
            hit:at=>{const point=world(at);if(this.backpack.hit(point)||props.some(prop=>prop.p.z_index>12&&(()=>{const local=prop.node.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(...point as [number,number]));return assets.contains(prop.resource,local.x,-local.y);})()))return false;return !!this.rig.hitAt(point);},
            position:()=>[this.rig.root.position.x,-this.rig.root.position.y],bounds:()=>this.rig.visualBounds(frame()),visibleRect:visible,
            validDrop:at=>{if(Math.hypot(at[0]-350,at[1]-951)<.00001)return true;if(at[0]<270||at[0]>=432||at[1]<904||at[1]>=1000)return false;return !props.some(prop=>{if(!prop.p['metadata/floor'])return false;const dx=(at[0]-prop.anchor[0])/(145+prop.footprint[0]+8),dy=(at[1]-prop.anchor[1])/(30+prop.footprint[1]+8);return dx*dx+dy*dy<1;});},
            suspend:()=>{this.rig.suspend();this.knock.stop();},resume:()=>this.rig.resume(),tap:()=>this.rig.tap(),beginLift:at=>this.rig.beginLift(world(at)),lift:(amount,delta,lag)=>this.rig.lift(amount,delta,lag),grip:()=>canonical(this.rig.gripWorld()),
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
        this.note.onDecision=(kind,accepted)=>{if(kind==='travel'&&accepted&&this.onTravelRequest&&this.onTravelRequest())this.bag.commitOffer();else{this.bag.resolveOffer();if(accepted)this.note.info('旅行还在准备中');}console.info('[LittleSteps] bag decision '+JSON.stringify({kind,accepted,bag:this.bag.snapshot(),backpack:this.backpack.snapshot(),note:this.note.snapshot()}));};
        const point=(at:number[])=>[at[0],at[1]-plan.offset],report=(event:string)=>console.info('[LittleSteps] fish input '+JSON.stringify({event,...this.fish.snapshot(),rig:this.rig.snapshot(),shadow:this.shadows.snapshot()}));
        const bagReport=(event:string)=>console.info('[LittleSteps] bag input '+JSON.stringify({event,...this.bag.snapshot(),backpack:this.backpack.snapshot(),note:this.note.snapshot()}));
        let owner='';this.hud.worldOwnsInput=()=>this.note.ownsInput||owner!=='';this.pointerBinding=sharedUI().pointer(this.hud.root,{down:(at:number[],id:number)=>{const p=point(at);if(this.note.down(id,p)){owner='note';return true;}if(this.fish.state==='SETTLING'||this.bag.state==='SETTLING')return false;if(this.incense.down(id,p)){owner='incense';console.info('[LittleSteps] incense input down');return true;}if(this.bag.down(id,p)){owner='bag';bagReport('down');return true;}const accepted=this.fish.down(id,p);if(accepted){owner='fish';report('down');}return accepted;},move:(at:number[],id:number)=>{const p=point(at);if(owner==='incense')this.incense.move(id,p);else if(owner==='bag')this.bag.move(id,p);else if(owner==='note')this.note.move(id,p);else if(owner==='fish')this.fish.move(id,p);},up:(at:number[],id:number)=>{const p=point(at);if(owner==='incense'){this.incense.up(id,p);console.info('[LittleSteps] incense input up '+JSON.stringify(this.incense.snapshot()));}else if(owner==='bag'){this.bag.up(id,p);bagReport('up');}else if(owner==='note')this.note.up(id,p);else if(owner==='fish'){this.fish.up(id,p);report('up');}owner='';},cancel:()=>{if(owner==='incense')this.incense.cancel();else if(owner==='bag')this.bag.cancel(false);else if(owner==='note')this.note.cancelPointer();else if(owner==='fish')this.fish.cancel(false);owner='';}},()=>this.active&&!this.hud.blocked);
        const escape=(e:EventKeyboard)=>{if(e.keyCode===KeyCode.ESCAPE){if(this.note.ownsInput||this.bag.state!=='IDLE')return;this.pointerBinding.cancel();this.bag.cancel(true);this.fish.cancel(true);this.backpack.restore(true);this.incense.cancel();this.incense.dismiss();report('escape');}};input.on(Input.EventType.KEY_DOWN,escape);
        scope.own(()=>{this.active=false;this.pointerBinding.dispose();this.bag.cancel(true);this.fish.cancel(true);input.off(Input.EventType.KEY_DOWN,escape);});
        this.hud.onOpen=()=>{this.pointerBinding.cancel();this.bag.cancel(true);this.note.dismiss();this.fish.cancel(true);this.backpack.restore(true);this.incense.cancel();this.incense.dismiss();this.rig.behavior.director.resumeAfterPlayer();this.knock.stop();};
        this.rig.onContact=()=>{if(!this.active)return;if(this.merit.award(this.rig.behavior.contacts,this.incense.state.merit())){this.hud.merit.setValue(this.merit.count);console.info('[LittleSteps] merit contact '+JSON.stringify(this.merit.snapshot()));}if(gestureSeen()){this.knock.assign(assets.audio('res://assets/wood_knock.wav'));this.knock.play();}};
        layers.push({z:100,order:1003,node:this.meritArt.root});
        layers.push({z:90,order:1004,node:this.feedback.root});
        layers.push({z:22,order:1005,node:this.incense.root},{z:24,order:1006,node:this.incense.visual},{z:24,order:1007,node:this.incense.hint});
        layers.push({z: 12, order: 1000, node: this.rig.root});
        layers.push({z:-40,order:1001,node:this.lighting.shafts()},{z:-39,order:1002,node:this.lighting.dustNode()});
        this.shadows.layers.forEach(layer=>layers.push(layer));
        this.sortRoomLayers();
        this.lighting.update();
        this.shadows.update();
        console.info('[LittleSteps] Home lighting candidate '+JSON.stringify(this.lighting.snapshot()));
        console.info('[LittleSteps] Home shadow candidate '+JSON.stringify(this.shadows.snapshot()));
        console.info('[LittleSteps] Home render surface '+JSON.stringify(this.surface.snapshot()));
    }
    resume() {this.active=true;this.incense.setActive(true);this.surface.setActive(true);this.flowers.setActive(true);this.hud.setActive(true);}
    private sortRoomLayers(){this.roomLayers.filter(layer=>layer.node.parent===this.roomRoot).sort((a,b)=>a.z-b.z||a.order-b.order).forEach((layer,index)=>layer.node.setSiblingIndex(index));this.backpackLayerRevision=this.backpack.layerRevision;}
    pause() {this.active=false;this.pointerBinding.cancel();this.bag.cancel(true);this.note.dismiss();this.fish.cancel(true);this.backpack.restore(true);this.incense.setActive(false);this.flowers.setActive(false);this.hud.setActive(false);this.surface.setActive(false);this.rig.focusLost();this.knock.stop();}
    advance(delta: number) { const before=this.fish.state,bagBefore=this.bag.state;this.feedback.advance(delta);this.fish.advance(delta);this.bag.advance(delta);const dragBounds=this.bag.state==='DRAGGING'?this.backpack.visualBounds():null;this.rig.setActiveDragFocus(dragBounds?'bag':'',dragBounds?[dragBounds[0]+dragBounds[2]/2,dragBounds[1]+dragBounds[3]/2]:[0,0],this.dragCarrier||this.roomRoot);this.rig.advance(delta,this.clock.nightProgress()>=0);this.rig.advanceDragGaze(delta);this.incense.advance(delta);this.flowers.syncActiveElapsed(this.clock.totalActive);this.merit.advance(delta);this.meritArt.update(this.merit.snapshot(),[this.fish.ground[0]-350,this.fish.ground[1]-951]);this.hud.advance(delta);this.plants.advance(delta);this.backpack.advance(delta);this.note.advance(delta);if(this.backpack.layerRevision!==this.backpackLayerRevision)this.sortRoomLayers();this.lighting.update();if(this.presentedActor==='fish')this.rig.setLightingOrigin(this.dragCarrier);this.backpack.syncLightingOrigin();this.shadows.update();this.plants.updateShadows();this.backpack.updateShadows();if(before!==this.fish.state)console.info('[LittleSteps] fish transition '+JSON.stringify({...this.fish.snapshot(),rig:this.rig.snapshot(),shadow:this.shadows.snapshot()}));if(bagBefore!==this.bag.state)console.info('[LittleSteps] bag transition '+JSON.stringify({...this.bag.snapshot(),backpack:this.backpack.snapshot(),note:this.note.snapshot()})); }
}
