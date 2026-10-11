import { Color, Graphics, Material, Node, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { DarkroomPlumes } from './DarkroomPlumes';
import { DepartureMotion } from './DepartureMotion';
import { nodeAt, picture } from './Visual';

export const DEPARTURE_EFFECTS=['departure-actor','darkroom-plume'];
// Ephemeral art only. The bridge owns loading, persistence and the lease.
export class HomeDepartureVisual {
    readonly root:Node;readonly motion:DepartureMotion;
    private actor:ReturnType<typeof picture>;private material:Material;
    private clouds:DarkroomPlumes;private contact:Graphics;private contactMaterial:Material;private released=false;
    constructor(room:Node,assets:GameAssets,scope:Scope,foot:number[]){
        this.motion=new DepartureMotion(foot);this.root=nodeAt(room,'DepartureActor',foot[0],foot[1]);
        scope.own(()=>this.release());
        this.contact=nodeAt(this.root,'TravelerContact',0,1).addComponent(Graphics);this.contact.node.setScale(1,.12,1);
        this.actor=picture(this.root,assets,scope,'res://travel/assets/travel_map_actor_v5.png','ApprovedTraveler',{centered:false,position:[-332.5,-288.75],scale:[.35,.35]});
        this.material=new Material();this.material.initialize({effectAsset:assets.effect('departure-actor'),defines:{USE_TEXTURE:true}});scope.own(()=>this.material.destroy());this.actor.sprite.customMaterial=this.material;
        const contactMaterial=new Material();contactMaterial.initialize({effectAsset:assets.effect('departure-actor'),defines:{USE_TEXTURE:false,USE_LOCAL:true}});scope.own(()=>contactMaterial.destroy());this.contact.customMaterial=contactMaterial;this.contactMaterial=this.contact.getMaterialInstance(0);
        this.clouds=new DarkroomPlumes(this.root,assets,scope);this.clouds.root.setScale(1.4,1.4,1);this.clouds.release([0,-20]);this.advance(0);
    }
    setLighting(night:number,lamp:number){this.motion.setLighting(night,lamp);this.paint();}
    advance(age:number){if(this.released)return;this.clouds.advance(this.motion.advance(age));this.paint();}
    private paint(){if(this.released)return;const s=this.motion.snapshot(),t=s.tint;this.actor.root.active=s.actorVisible;this.material.setProperty('departureTint',new Vec4(t[0],t[1],t[2],s.actorAlpha));this.clouds.setTint(t);const g=this.contact;g.clear();if(s.actorAlpha<=0)return;this.contactMaterial.setProperty('departureTint',new Vec4(.20*t[0],.12*t[1],.045*t[2],.013*s.actorAlpha));g.fillColor=Color.WHITE;for(let i=7;i>0;i--){g.circle(0,0,110+i*6);g.fill();}}
    release(){if(this.released)return;this.released=true;if(this.actor)this.actor.sprite.spriteFrame=null;if(this.clouds)this.clouds.clear();this.root.active=false;this.root.destroy();}
    snapshot(){return {...this.motion.snapshot(),clouds:this.clouds.snapshot(),released:this.released,z:107,cloudZ:109,emissions:1};}
}
