import { Material, Node, Sprite, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { meshSprite, Scope } from './Engine';
import { DarkroomLighting } from './DarkroomLighting';
import { DARK_PLANT_PARTS } from './DarkroomVisualRules';
import { PlantForest, SpringPlantPart } from './PlantGeometry';
import { nodeAt } from './Visual';

export class DarkroomPlants {
    readonly roots:Array<{node:Node;z:number}>;readonly forest:PlantForest;
    private items:Array<{part:SpringPlantPart;root:Node;sprite:any;revision:number;shadows:Array<{root:Node;sprite:any;material:Material}>}>=[];
    constructor(private room:Node,assets:GameAssets,scope:Scope,private lighting:DarkroomLighting,forest?:PlantForest){
        const c=assets.json('res://darkroom/assets/round2/darkroom_plants_contract.json'),spec=assets.art(c.texture);
        this.forest=forest||new PlantForest(c,DARK_PLANT_PARTS,true);const shadows=nodeAt(room,'IndependentPlantShadows'),plants=nodeAt(room,'IndependentRoomPlants');this.roots=[{node:shadows,z:2},{node:plants,z:3}];
        for(const part of this.forest.parts){
            const make=(node:Node)=>{const s=node.addComponent(meshSprite());s.configure(part.mesh,spec.size,spec.content);s.sizeMode=Sprite.SizeMode.CUSTOM;s.spriteFrame=assets.frame(c.texture,scope);return s;};
            const root=nodeAt(plants,part.recipe[0]),sprite=make(nodeAt(root,'SkinnedAtlasPart'));lighting.bind(sprite,spec);
            const passes=[0,1].map(i=>{const root=nodeAt(shadows,part.recipe[0]+(i?'Lamp':'Celestial')),sprite=make(root),material=new Material();material.initialize({effectAsset:assets.effect('home-part-shadow'),defines:{USE_TEXTURE:true}});sprite.customMaterial=material;scope.own(()=>material.destroy());return {root,sprite,material};});
            this.items.push({part,root,sprite,revision:-1,shadows:passes});
        }this.advance(0);
    }
    advance(delta:number){
        this.forest.advance(delta);const s=this.lighting.state,moon=s.moonEnergy>s.sunEnergy,direction=moon?s.moonCast:s.cast,extent=moon?1.6:s.cot,o=this.room.worldPosition,z=this.room.worldScale;
        for(const item of this.items){const p=item.part;item.root.setPosition(p.position[0],-p.position[1]);item.root.setScale(p.recipe[3],p.recipe[3],1);item.root.angle=-p.rotation*180/Math.PI;
            if(item.revision!==p.revision){item.sprite.geometryChanged();item.shadows.forEach(v=>v.sprite.geometryChanged());item.revision=p.revision;}
            const dx=p.position[0]-83,dy=p.position[1]-550,n=Math.hypot(dx,dy),lamp=n?[dx/n,dy/n]:[0,0];
            const shifts=[direction.map(v=>v*Math.min(extent,2.4)*9),lamp.map(v=>v*9*1.1)],strengths=[Math.max(s.sunEnergy,s.moonEnergy)*.28,this.lighting.lamp.value*.24];
            item.shadows.forEach((v,i)=>{v.root.active=strengths[i]>.001;v.root.setPosition(p.position[0]+shifts[i][0],-p.position[1]-shifts[i][1]);v.root.setScale(p.recipe[3],p.recipe[3],1);v.root.angle=-p.rotation*180/Math.PI;
                v.material.setProperty('roomOrigin',new Vec4(o.x,o.y,z.x,z.y));v.material.setProperty('castState',new Vec4(direction[0],direction[1],0,0));v.material.setProperty('sunVectorState',new Vec4(0,0,0,extent));v.material.setProperty('partShadowState',new Vec4(strengths[i],1,i,0));});
        }
    }
    snapshot(){return this.forest.snapshot();}
}
