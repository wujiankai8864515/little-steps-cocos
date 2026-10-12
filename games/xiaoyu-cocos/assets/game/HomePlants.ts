import { Material, Node, Sprite, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { meshSprite, Scope } from './Engine';
import { HomeClock } from './HomeClock';
import { HomeLighting } from './HomeLighting';
import { homeLighting } from './LightingSnapshot';
import { PlantForest, SpringPlantPart } from './PlantGeometry';
import { nodeAt } from './Visual';

type RenderPart={part:SpringPlantPart;root:Node;sprite:any;joints:Node[];shadows:Array<{root:Node;sprite:any;material:Material}>;revision:number};
export class HomePlants {
    readonly roots:Array<{node:Node;z:number;order:number}>;readonly forest:PlantForest;
    private rendered:RenderPart[]=[];
    private windReported=false;
    constructor(private home:Node,assets:GameAssets,scope:Scope,lighting:HomeLighting,private clock:HomeClock,private lampEnergy?:()=>number){
        const contract=assets.json('res://assets/round2/home_plants_contract.json'),resource=contract.texture,spec=assets.art(resource);
        this.forest=new PlantForest(contract);
        const shadows=nodeAt(home,'IndependentPlantShadows'),plants=nodeAt(home,'IndependentRoomPlants');
        this.roots=[{node:shadows,z:-17,order:1800},{node:plants,z:-16,order:1801}];
        this.forest.parts.forEach(part=>{
            const makeSprite=(node:Node)=>{const sprite=node.addComponent(meshSprite());sprite.configure(part.mesh,spec.size,spec.content);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=assets.frame(resource,scope);return sprite;};
            const root=nodeAt(plants,part.recipe[0]),sprite=makeSprite(nodeAt(root,'SkinnedAtlasPart'));
            const rect=part.definition.rect;lighting.receiver(sprite,spec,1,[rect[0]/spec.size[0],rect[1]/spec.size[1],rect[2]/spec.size[0],rect[3]/spec.size[1]]);
            const joints:Node[]=[];let parent=root;
            for(let i=0;i<3;i++){const joint=nodeAt(parent,'Joint'+i,0,i?part.span/3:0);joints.push(joint);parent=joint;}
            const shadowPasses=['Celestial','Lamp'].map(name=>{
                const node=nodeAt(shadows,part.recipe[0]+name),sprite=makeSprite(node),material=new Material();material.initialize({effectAsset:assets.effect('home-part-shadow'),defines:{USE_TEXTURE:true}});sprite.customMaterial=material;scope.own(()=>material.destroy());return {root:node,sprite,material};
            });
            this.rendered.push({part,root,sprite,joints,shadows:shadowPasses,revision:-1});
        });this.advance(0);this.updateShadows();
        console.info('[LittleSteps] original Home plants '+JSON.stringify(this.forest.snapshot()));
    }
    advance(delta:number){
        this.forest.advance(delta);
        this.rendered.forEach(item=>{
            const p=item.part;item.root.setPosition(p.position[0],-p.position[1]);item.root.setScale(p.recipe[3],p.recipe[3],1);item.root.angle=-p.rotation*180/Math.PI;
            item.joints.forEach((joint,i)=>joint.angle=-p.angles[i]*180/Math.PI);
            if(item.revision!==p.revision){item.sprite.geometryChanged();item.shadows.forEach(s=>s.sprite.geometryChanged());item.revision=p.revision;}
        });
        if(!this.windReported&&this.forest.phase>=3&&this.forest.eventSerial>=2){
            this.windReported=true;
            console.info('[LittleSteps] original Home plant wind '+JSON.stringify({forest:this.forest.snapshot(),parts:this.forest.parts.map(p=>({name:p.recipe[0],root:p.position,angles:p.angles,tip:p.roomPoint(p.attachment(p.tip)),revision:p.revision}))}));
        }
    }
    updateShadows(){
        const state=homeLighting(this.clock.hour(),this.clock.lampWeight(),this.lampEnergy?.()),moon=state.moonEnergy>state.sunEnergy,direction=moon?state.moonCast:state.cast,extent=moon?1.6:state.cot;
        const origin=this.home.worldPosition,scale=this.home.worldScale;
        for(const item of this.rendered){
            const p=item.part,dx=p.position[0]-465,dy=p.position[1]-468,length=Math.hypot(dx,dy),lamp=length?[dx/length,dy/length]:[0,0];
            const shifts=[direction.map(v=>v*Math.min(extent,2.4)*9),lamp.map(v=>v*9*1.1)],strengths=[Math.max(state.sunEnergy,state.moonEnergy)*.28,state.lampEnergy/.78*.24];
            item.shadows.forEach((pass,index)=>{
                pass.root.active=strengths[index]>.001&&item.root.activeInHierarchy;pass.root.setPosition(p.position[0]+shifts[index][0],-p.position[1]-shifts[index][1]);pass.root.setScale(p.recipe[3],p.recipe[3],1);pass.root.angle=-p.rotation*180/Math.PI;
                pass.material.setProperty('roomOrigin',new Vec4(origin.x,origin.y,scale.x,scale.y));pass.material.setProperty('castState',new Vec4(direction[0],direction[1],0,0));pass.material.setProperty('sunVectorState',new Vec4(0,0,0,extent));pass.material.setProperty('partShadowState',new Vec4(strengths[index],0,index,0));
            });
        }
    }
    snapshot(){return this.forest.snapshot();}
}
