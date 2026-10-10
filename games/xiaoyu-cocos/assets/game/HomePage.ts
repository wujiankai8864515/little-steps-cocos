import { Node, screen } from 'cc';
import { GameAssets } from './Assets';
import { audioTransport, renderSurfaces, Scope } from './Engine';
import { AudioPort } from './AudioBehavior';
import { nodeAt, picture } from './Visual';
import { XiaoyuRig } from './XiaoyuRig';
import { HomeClock } from './HomeClock';
import { HomeLighting } from './HomeLighting';
import { HomeShadows } from './HomeShadows';
import { HomePlants } from './HomePlants';
import { homeRenderPlan } from './HomeRenderPlan';

let roomSerial=0;

export class HomePage {
    readonly root: Node;
    readonly rig: XiaoyuRig;
    readonly lighting:HomeLighting;
    readonly shadows:HomeShadows;
    readonly plants:HomePlants;
    private active=false;
    private knock:AudioPort;
    readonly roomRoot:Node;
    private surface:any;
    static async create(parent:Node,assets:GameAssets,scope:Scope,height:number,gestureSeen=()=>false,clock=new HomeClock()) {
        const renderer=renderSurfaces(),plan=homeRenderPlan(height,screen.windowSize.width);
        const target=await assets.acquireTransient('HomeRoom-'+(++roomSerial),renderer.estimateTarget(...plan.pixels),()=>renderer.createTarget(...plan.pixels,'HomeRoom'),texture=>texture.destroy(),scope);
        const page=new HomePage(parent,assets,scope,height,gestureSeen,clock,target,plan);
        await scope.guard(page.surface.ready);
        console.info('[LittleSteps] Home room prepared '+JSON.stringify(page.surface.snapshot()));
        return page;
    }
    private constructor(parent: Node, assets: GameAssets, scope: Scope, height: number, gestureSeen:()=>boolean,private clock:HomeClock,target:any,plan:ReturnType<typeof homeRenderPlan>) {
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
        scene.sections.filter(s => s.kind === 'node' && s.type === 'Sprite2D').forEach((section, order) => {
            if (section.properties.visible === false) return;
            const resource = resources.get(section.properties.texture.value) as string;
            const item = picture(this.roomRoot, assets, scope, resource, section.name, section.properties);
            const p=section.properties;
            if(p['metadata/surface']!==undefined)this.lighting.receiver(item.sprite,item.spec,p['metadata/surface'],p['metadata/visible_uv']||[0,0,1,1],section.name==='BedForeground'?'bed':section.name.indexOf('Bleed')>=0?'bleed':'receiver');
            if(p['metadata/ground']!==undefined)this.shadows.add(item.root,resource,p,p.centered===undefined?true:p.centered);
            layers.push({z: section.properties.z_index || 0, order, node: item.root});
        });
        this.rig = new XiaoyuRig(this.roomRoot, assets, scope);
        this.rig.receivers.forEach(item=>this.lighting.receiver(item.sprite,item.spec,1,[.2,.15,.68,.72],item.node.name==='OriginalBody'||item.eye?'face':'receiver',item.eye||0,item.eye?this.rig.pupilOffsets()[item.eye-1]:[0,0]));
        this.rig.receivers.filter(item=>item.node.name.indexOf('Eye')<0).forEach(item=>this.shadows.add(item.node,item.resource,{'metadata/ground':951,'metadata/height_factor':.72,'metadata/floor':true,'metadata/shadow_z':1,'metadata/thickness':0}));
        this.plants=new HomePlants(this.roomRoot,assets,scope,this.lighting,this.clock);
        this.plants.roots.forEach(layer=>layers.push(layer));
        this.knock=audioTransport().player(this.root,scope,'WoodKnock',(event:string,state:any)=>console.info('[LittleSteps] knock audio '+event+' '+JSON.stringify(state)));
        this.knock.gain(Math.pow(10,-8/20));
        this.rig.onContact=()=>{if(!this.active||!gestureSeen())return;this.knock.assign(assets.audio('res://assets/wood_knock.wav'));this.knock.play();};
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
    resume() {this.active=true;this.surface.setActive(true);}
    pause() {this.active=false;this.surface.setActive(false);this.rig.focusLost();this.knock.stop();}
    advance(delta: number) { this.rig.advance(delta,this.clock.nightProgress()>=0);this.plants.advance(delta);this.lighting.update();this.shadows.update();this.plants.updateShadows(); }
}
