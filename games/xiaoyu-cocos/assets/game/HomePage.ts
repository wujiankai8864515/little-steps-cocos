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
    private pointerBinding:any;private feedback:InteractionFeedback;
    private dragCarrier:Node=null;private restIndex=0;
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
        const layers: Array<{z: number; order: number; node: Node}> = [];
        const props:Array<{node:Node;resource:string;p:any;spec:any;anchor:number[];footprint:number[]}>=[];
        scene.sections.filter(s => s.kind === 'node' && s.type === 'Sprite2D').forEach((section, order) => {
            if (section.properties.visible === false) return;
            const resource = resources.get(section.properties.texture.value) as string;
            const item = picture(this.roomRoot, assets, scope, resource, section.name, section.properties);
            const p=section.properties;
            if(p['metadata/surface']!==undefined)this.lighting.receiver(item.sprite,item.spec,p['metadata/surface'],p['metadata/visible_uv']||[0,0,1,1],section.name==='BedForeground'?'bed':section.name.indexOf('Bleed')>=0?'bleed':'receiver');
            if(p['metadata/ground']!==undefined)this.shadows.add(item.root,resource,p,p.centered===undefined?true:p.centered);
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
        // Room RT and the user's main Canvas have different physical origins.
        // Actor coordinates remain canonical in either parent; map input and
        // projection through the actor's current presentation frame.
        const frame=()=>this.dragCarrier||this.roomRoot;
        const world=(at:number[])=>{const p=frame().getComponent(UITransform).convertToWorldSpaceAR(new Vec3(at[0],-at[1]));return [p.x,p.y];},canonical=(at:number[])=>{const p=frame().getComponent(UITransform).convertToNodeSpaceAR(new Vec3(at[0],at[1]));return [p.x,-p.y];};
        const visible=()=>[this.hud.safe[0],this.hud.safe[1]-plan.offset,this.hud.safe[2],this.hud.safe[3]];
        this.fish=new FishInteraction({
            hit:at=>{const point=world(at);if(props.some(prop=>prop.p.z_index>12&&(()=>{const local=prop.node.getComponent(UITransform).convertToNodeSpaceAR(new Vec3(...point as [number,number]));return assets.contains(prop.resource,local.x,-local.y);})()))return false;return !!this.rig.hitAt(point);},
            position:()=>[this.rig.root.position.x,-this.rig.root.position.y],bounds:()=>this.rig.visualBounds(frame()),visibleRect:visible,
            validDrop:at=>{if(Math.hypot(at[0]-350,at[1]-951)<.00001)return true;if(at[0]<270||at[0]>=432||at[1]<904||at[1]>=1000)return false;return !props.some(prop=>{if(!prop.p['metadata/floor'])return false;const dx=(at[0]-prop.anchor[0])/(145+prop.footprint[0]+8),dy=(at[1]-prop.anchor[1])/(30+prop.footprint[1]+8);return dx*dx+dy*dy<1;});},
            suspend:()=>{this.rig.suspend();this.knock.stop();},resume:()=>this.rig.resume(),tap:()=>this.rig.tap(),beginLift:at=>this.rig.beginLift(world(at)),lift:(amount,delta,lag)=>this.rig.lift(amount,delta,lag),grip:()=>canonical(this.rig.gripWorld()),
            setAnchor:(ground,lift)=>{this.rig.liftHeight=lift;this.rig.root.setPosition(ground[0]-335,-ground[1]+336+lift);},
            present:active=>{if(active&&!this.dragCarrier){this.restIndex=this.rig.root.getSiblingIndex();this.dragCarrier=nodeAt(this.root,'FishDragPresentation');this.rig.root.setParent(this.dragCarrier);this.rig.setLightingOrigin(this.dragCarrier);}else if(!active&&this.dragCarrier){this.rig.root.setParent(this.roomRoot);this.rig.root.setSiblingIndex(this.restIndex);this.dragCarrier.destroy();this.dragCarrier=null;this.rig.setLightingOrigin(this.roomRoot);}},land:impact=>this.rig.land(impact),
            pulse:(at,accepted)=>this.feedback.pulse(at,accepted),hold:(at,fraction)=>this.feedback.hold(at,fraction),clear:()=>{this.feedback.clear();this.rig.resetSecondary();},
        });
        const point=(at:number[])=>[at[0],at[1]-plan.offset],report=(event:string)=>console.info('[LittleSteps] fish input '+JSON.stringify({event,...this.fish.snapshot(),rig:this.rig.snapshot(),shadow:this.shadows.snapshot()}));
        let owner='';this.pointerBinding=sharedUI().pointer(this.hud.root,{down:(at:number[],id:number)=>{if(this.incense.down(id,point(at))){owner='incense';console.info('[LittleSteps] incense input down');return true;}const accepted=this.fish.down(id,point(at));if(accepted){owner='fish';report('down');}return accepted;},move:(at:number[],id:number)=>{if(owner==='incense')this.incense.move(id,point(at));else this.fish.move(id,point(at));},up:(at:number[],id:number)=>{if(owner==='incense'){this.incense.up(id,point(at));console.info('[LittleSteps] incense input up '+JSON.stringify(this.incense.snapshot()));}else{this.fish.up(id,point(at));report('up');}owner='';},cancel:()=>{this.incense.cancel();this.fish.cancel(false);owner='';report('cancel');}},()=>this.active&&!this.hud.blocked);
        const escape=(e:EventKeyboard)=>{if(e.keyCode===KeyCode.ESCAPE){this.pointerBinding.cancel();this.fish.cancel(true);this.incense.cancel();this.incense.dismiss();report('escape');}};input.on(Input.EventType.KEY_DOWN,escape);
        scope.own(()=>{this.active=false;this.pointerBinding.dispose();this.fish.cancel(true);input.off(Input.EventType.KEY_DOWN,escape);});
        this.hud.onOpen=()=>{this.pointerBinding.cancel();this.fish.cancel(true);this.incense.cancel();this.incense.dismiss();this.rig.behavior.director.resumeAfterPlayer();this.knock.stop();};
        this.rig.onContact=()=>{if(!this.active)return;if(this.merit.award(this.rig.behavior.contacts,this.incense.state.merit())){this.hud.merit.setValue(this.merit.count);console.info('[LittleSteps] merit contact '+JSON.stringify(this.merit.snapshot()));}if(gestureSeen()){this.knock.assign(assets.audio('res://assets/wood_knock.wav'));this.knock.play();}};
        layers.push({z:100,order:1003,node:this.meritArt.root});
        layers.push({z:90,order:1004,node:this.feedback.root});
        layers.push({z:22,order:1005,node:this.incense.root},{z:24,order:1006,node:this.incense.visual},{z:24,order:1007,node:this.incense.hint});
        layers.push({z: 12, order: 1000, node: this.rig.root});
        layers.push({z:-40,order:1001,node:this.lighting.shafts()},{z:-39,order:1002,node:this.lighting.dustNode()});
        this.shadows.layers.forEach(layer=>layers.push(layer));
        layers.sort((a, b) => a.z - b.z || a.order - b.order).forEach((layer, index) => layer.node.setSiblingIndex(index));
        this.lighting.update();
        this.shadows.update();
        console.info('[LittleSteps] Home lighting candidate '+JSON.stringify(this.lighting.snapshot()));
        console.info('[LittleSteps] Home shadow candidate '+JSON.stringify(this.shadows.snapshot()));
        console.info('[LittleSteps] Home render surface '+JSON.stringify(this.surface.snapshot()));
    }
    resume() {this.active=true;this.incense.setActive(true);this.surface.setActive(true);this.flowers.setActive(true);this.hud.setActive(true);}
    pause() {this.active=false;this.pointerBinding.cancel();this.fish.cancel(true);this.incense.setActive(false);this.flowers.setActive(false);this.hud.setActive(false);this.surface.setActive(false);this.rig.focusLost();this.knock.stop();}
    advance(delta: number) { const before=this.fish.state;this.feedback.advance(delta);this.fish.advance(delta);this.rig.advance(delta,this.clock.nightProgress()>=0);this.incense.advance(delta);this.flowers.syncActiveElapsed(this.clock.totalActive);this.merit.advance(delta);this.meritArt.update(this.merit.snapshot(),[this.fish.ground[0]-350,this.fish.ground[1]-951]);this.hud.advance(delta);this.plants.advance(delta);this.lighting.update();if(this.dragCarrier)this.rig.setLightingOrigin(this.dragCarrier);this.shadows.update();this.plants.updateShadows();if(before!==this.fish.state)console.info('[LittleSteps] fish transition '+JSON.stringify({...this.fish.snapshot(),rig:this.rig.snapshot(),shadow:this.shadows.snapshot()})); }
}
