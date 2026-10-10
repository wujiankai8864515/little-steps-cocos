import { FlowerRecord, flowerClamp as clamp, flowerMod as mod, flowerSmooth as smooth } from './FlowerLife';
const rotate=(p:number[],a:number)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];
export function flowerVirtualSun(progress:number){const a=Math.PI*(1-clamp(progress,0,1));return [Math.cos(a)*480,-46-Math.sin(a)*480];}
export function projectFlowerHead(point:number[],yaw:number,pitch:number,fold:number){
    const local=[point[0]-138,point[1]-216],petal=1-smooth(182,218,point[1]),r=[(point[0]-136)/102,(point[1]-126)/96],dome=Math.max(0,1-r[0]*r[0]-r[1]*r[1])*24*petal;
    const p=pitch*petal,y=yaw*petal,pitchedY=local[1]*Math.cos(p)-dome*Math.sin(p),pitchedZ=local[1]*Math.sin(p)+dome*Math.cos(p);
    return [(local[0]*Math.cos(y)+pitchedZ*Math.sin(y))*(1-clamp(fold,0,1)*petal*.14),pitchedY];
}
export function flowerNormal(yaw:number,pitch:number,rotation:number){const xy=rotate([Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch)],rotation),z=Math.cos(yaw)*Math.cos(pitch),length=Math.hypot(xy[0],xy[1],z);return [xy[0]/length,xy[1]/length,z/length];}
export class FlowerHeadMesh {
    readonly source=new Float32Array(13*13*2);readonly vertices=new Float32Array(13*13*2);readonly indices=new Uint16Array(12*12*6);frame=-1;
    constructor(private content:number[]){let at=0;for(let r=0;r<12;r++)for(let c=0;c<12;c++){const a=r*13+c;for(const n of [a,a+1,a+14,a,a+14,a+13])this.indices[at++]=n;}}
    publish(frame:number,yaw:number,pitch:number,fold:number){frame=clamp(Math.floor(frame),0,7);const fx=frame%4*256,fy=Math.floor(frame/4)*256;
        if(this.frame!==frame){const x=Math.max(fx,this.content[0]),y=Math.max(fy,this.content[1]),w=Math.max(0,Math.min(fx+256,this.content[0]+this.content[2])-x),h=Math.max(0,Math.min(fy+256,this.content[1]+this.content[3])-y);
            for(let r=0;r<13;r++)for(let c=0;c<13;c++){const i=(r*13+c)*2;this.source[i]=x+w*c/12;this.source[i+1]=y+h*r/12;}this.frame=frame;}
        for(let i=0;i<this.source.length;i+=2){const p=projectFlowerHead([this.source[i]-fx,this.source[i+1]-fy],yaw,pitch,fold);this.vertices[i]=p[0];this.vertices[i+1]=p[1];}
    }
}
// Same five hierarchical Bone2D transforms, spring and blossom plane as Godot.
// Nodes/rendering are a thin adapter; all coordinates here use original y-down.
export class FlowerPose {
    bend=0;velocity=0;facing=0;yaw=0;pitch=0;sleep=0;sunDirection=[0,-1];points:number[][]=[];angles:number[]=[];leafTwist=[0,0];
    leaves:Array<{at:number[];angle:number;scale:number;mirror:boolean;visible:boolean}>=[];
    head={at:[0,0],angle:0,scale:0,frame:4,nextFrame:4,blend:0,yaw:0,pitch:0};
    private initialized=false;private lastDay=true;private transitionAge=0;private transitionStart=0;private transitionTarget=0;private solarBend=0;
    constructor(readonly record:FlowerRecord){}
    pose(phase:any,time:number,delta:number,day:boolean,sun:number[],snap=false){const step=clamp(delta,0,.1),last=this.points.length?this.points[this.points.length-1]:[this.record.root_x,-this.record.height*phase.growth],ray=[sun[0]-last[0],sun[1]-last[1]],length=Math.hypot(...ray);
        if(day&&ray.every(Number.isFinite)&&length>1)this.sunDirection=ray.map(v=>v/length);const aim=Math.atan2(this.sunDirection[0],-this.sunDirection[1]),reset=!this.initialized||snap;
        if(reset){this.sleep=day?0:1;this.transitionStart=this.transitionTarget=this.sleep;this.transitionAge=8.5;this.lastDay=day;if(day){this.solarBend=clamp(aim*.31,-.5,.5);this.facing=aim;}this.bend=clamp(this.record.bend+this.solarBend,-1.4,1.4);this.velocity=0;this.initialized=true;}
        else if(day!==this.lastDay){this.transitionStart=this.sleep;this.transitionTarget=day?0:1;this.transitionAge=0;this.lastDay=day;}
        this.transitionAge+=step;const opening=smooth(0,7,Math.max(0,this.transitionAge-mod(this.record.id*.61803398875,1)*1.5));this.sleep=this.transitionStart+(this.transitionTarget-this.transitionStart)*opening;
        if(day){this.solarBend=clamp(aim*.31,-.5,.5);this.facing+= (mod(aim-this.facing+Math.PI,Math.PI*2)-Math.PI)*(1-Math.exp(-step*1.6));}
        const breeze=Math.sin(time*1.03+this.record.phase)*.01+Math.sin(time*1.77+this.record.phase*.6)*.004,target=clamp(this.record.bend+this.solarBend+breeze,-1.4,1.4),steps=clamp(Math.ceil(step*120),1,12),dt=step/steps;
        for(let i=0;i<steps;i++){this.velocity=clamp(this.velocity+((target-this.bend)*25-this.velocity*9.5)*dt,-.48,.48);this.bend=clamp(this.bend+this.velocity*dt,-1.4,1.4);}
        const counter=Math.sin(this.record.phase)*.085,segment=this.record.height*phase.growth/5;this.angles=[this.bend*.18+counter];for(let i=1;i<5;i++)this.angles.push(this.bend*(.17+.025*i)-(i<3?counter*.5:0));
        this.points=[[this.record.root_x,0]];let angle=0;const cumulative:number[]=[];for(let i=0;i<5;i++){angle+=this.angles[i];cumulative.push(angle);const offset=rotate([0,-segment],angle),p=this.points[i];this.points.push([p[0]+offset[0],p[1]+offset[1]]);}
        this.leaves=[];for(let i=0;i<2;i++){const targetTwist=Math.sin(time*(1.35+i*.13)+this.record.phase+i*2.3)*.075;this.leafTwist[i]+=(targetTwist-this.leafTwist[i])*(1-Math.exp(-step*4.5));const amount=smooth(.10+i*.035,.75+i*.05,phase.progress);this.leaves.push({at:this.points[i+1],angle:(i===0?-.5:.48)+this.leafTwist[i]+cumulative[i+1],scale:.025+.165*amount,mirror:i===1,visible:amount>.01});}
        const framePosition=4*(1-this.sleep)*phase.bloom,frame=Math.min(Math.floor(framePosition),4),nextFrame=Math.min(frame+1,4),headAngle=angle*.64+this.facing*.36;
        if(day){const local=rotate(this.sunDirection,-headAngle),targetYaw=Math.atan2(local[0]*Math.sin(.5),Math.cos(.5)),targetPitch=Math.asin(-local[1]*Math.sin(.5)),response=reset?1:1-Math.exp(-step*1.6);this.yaw+=(targetYaw-this.yaw)*response;this.pitch+=(targetPitch-this.pitch)*response;}
        this.head={at:this.points[5],angle:headAngle,scale:this.record.head_size/205*1.28*phase.head_growth,frame,nextFrame,blend:frame!==nextFrame?mod(framePosition,1):0,yaw:this.yaw*(1-this.sleep*.65),pitch:this.pitch*(1-this.sleep*.55)};
    }
    snapshot(){return {id:this.record.id,bend:this.bend,velocity:this.velocity,sleep:this.sleep,facing:this.facing,points:this.points,angles:this.angles,leaves:this.leaves,head:this.head};}
}
