// Original RoomPropsController's 0.24s transform ownership and bone restoration.
import { wearBlend } from './ApprovedBackpackGeometry';
export type BagPose={position:number[];scale:number[];rotation:number};
export type WearBones={grip:number;shoulder:number[];tailScale:number[]};
const clonePose=(p:BagPose)=>({position:p.position.slice(),scale:p.scale.slice(),rotation:p.rotation});
const cloneBones=(p:WearBones)=>({grip:p.grip,shoulder:p.shoulder.slice(),tailScale:p.tailScale.slice()});
const mix=(a:number[],b:number[],t:number)=>a.map((v,i)=>v+(b[i]-v)*t);
const angle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export class BackpackWear {
    mode='hanging';elapsed=0;pose:BagPose;depth=-10;bones:WearBones=null;private start:BagPose;private originalBones:WearBones;
    constructor(readonly wall:BagPose,readonly wallDepth=-10){this.pose=clonePose(wall);this.depth=wallDepth;}
    show(ground:number[],bones:WearBones,current=this.pose){if(this.mode==='worn')return false;if(this.mode==='returning'){this.finish();current=this.pose;}this.mode='worn';this.elapsed=0;this.start=clonePose(current);this.originalBones=cloneBones(bones);this.bones=cloneBones(bones);this.advance(0,ground);return true;}
    restore(immediate=false){if(this.mode==='returning'){if(immediate){this.finish();return true;}return false;}if(this.mode!=='worn')return false;this.bones=cloneBones(this.originalBones);this.mode='returning';this.start=clonePose(this.pose);this.elapsed=0;if(immediate)this.finish();return true;}
    interrupt(){if(this.mode!=='returning')return false;this.mode='dragging';return true;}
    finish(){this.mode='hanging';this.pose=clonePose(this.wall);this.depth=this.wallDepth;this.elapsed=0;}
    advance(delta:number,ground:number[]){if(!Number.isFinite(delta))return;const dt=Math.max(0,Math.min(delta,4/120));if(this.mode!=='worn'&&this.mode!=='returning')return;this.elapsed=Math.min(.24,this.elapsed+dt);const t=wearBlend(this.elapsed/.24),target=this.mode==='worn'?{position:[ground[0]-256,ground[1]-232],scale:[.3,.36],rotation:-.06}:this.wall;
        this.pose={position:mix(this.start.position,target.position,t),scale:mix(this.start.scale,target.scale,t),rotation:angle(this.start.rotation,target.rotation,t)};this.depth=this.mode==='worn'?10:180;
        if(this.mode==='worn'){const b=this.originalBones;this.bones={grip:angle(b.grip,.5,t),shoulder:[b.shoulder[0]-20*t,b.shoulder[1]+73*t],tailScale:[b.tailScale[0],b.tailScale[1]*(1+.5*t)]};}
        else if(this.elapsed>=.24)this.finish();
    }
    snapshot(){return {mode:this.mode,elapsed:this.elapsed,pose:this.pose,depth:this.depth,bones:this.bones};}
}
