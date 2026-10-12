import { Node } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { DarkroomPlumes } from './DarkroomPlumes';
import { DepartureMotion } from './DepartureMotion';
import { nodeAt } from './Visual';

export const DEPARTURE_EFFECTS=['darkroom-plume'];
// Ephemeral art only. The bridge owns loading, persistence and the lease.
export class HomeDepartureVisual {
    readonly root:Node;readonly motion:DepartureMotion;
    private clouds:DarkroomPlumes;private released=false;
    constructor(room:Node,assets:GameAssets,scope:Scope,foot:number[]){
        this.motion=new DepartureMotion(foot);this.root=nodeAt(room,'DepartureActor',foot[0],foot[1]);
        scope.own(()=>this.release());
        this.clouds=new DarkroomPlumes(this.root,assets,scope);this.clouds.root.setScale(1.4,1.4,1);this.clouds.release([0,-20]);this.advance(0);
    }
    setLighting(night:number,lamp:number){this.motion.setLighting(night,lamp);this.paint();}
    advance(age:number){if(this.released)return;this.clouds.advance(this.motion.advance(age));this.paint();}
    private paint(){if(!this.released)this.clouds.setTint(this.motion.snapshot().tint);}
    release(){if(this.released)return;this.released=true;if(this.clouds)this.clouds.clear();this.root.active=false;this.root.destroy();}
    snapshot(){return {...this.motion.snapshot(),clouds:this.clouds.snapshot(),released:this.released,z:107,cloudZ:109,emissions:1};}
}
