import { EYE_CENTERS, EYE_TRAVEL } from './EyeGeometry';

// Original drag_gaze.gd: independent eye springs in body source pixels.
// Godot Vector2 operations use real_t float32; scalar weight/time stay double.
const f=Math.fround;
const vector=(v:number[])=>v.map(f);
const add=(a:number[],b:number[])=>a.map((v,i)=>f(v+b[i]));
const sub=(a:number[],b:number[])=>a.map((v,i)=>f(v-b[i]));
const mul=(a:number[],n:number)=>a.map(v=>f(v*f(n)));
const div=(a:number[],b:number[])=>a.map((v,i)=>f(v/b[i]));
const limited=(v:number[],maximum:number)=>{const length=f(Math.sqrt(f(f(v[0]*v[0])+f(v[1]*v[1]))));return length>maximum?mul(div(v,[length,length]),maximum):v.slice();};
const ellipse=(v:number[],travel:number[])=>limited(div(v,travel),1).map((x,i)=>f(x*travel[i]));
const eyeTarget=(direction:number[],travel:number[])=>limited(div(direction,[125,125]),1).map((x,i)=>f(x*travel[i]));
const finite=(v:number[])=>v&&v.length===2&&v.every(Number.isFinite);

export class DragGaze {
    activeId='';targetWorld=[0,0];left=[0,0];right=[0,0];leftVelocity=[0,0];rightVelocity=[0,0];weight=0;
    setTarget(id:string,at:number[]){if(!id||!finite(at)){this.activeId='';return;}this.activeId=id;this.targetWorld=vector(at);}
    advance(delta:number,toLocal:(at:number[])=>number[],jelly:number[]){
        if(!Number.isFinite(delta)||delta<=0||!toLocal)return;
        const dt=Math.max(0,Math.min(.05,delta));this.weight=Math.max(0,Math.min(1,this.weight+(this.activeId?1:-1)*dt*7));
        let targets=[[0,0],[0,0]];
        if(this.activeId){const local=sub(vector(toLocal(this.targetWorld)),vector(jelly));targets=EYE_CENTERS.map((eye,i)=>eyeTarget(sub(local,vector(eye)),EYE_TRAVEL[i]));}
        const count=Math.max(1,Math.ceil(dt*120)),step=dt/count;
        for(let n=0;n<count;n++){
            this.leftVelocity=limited(add(this.leftVelocity,mul(sub(mul(sub(targets[0],this.left),150),mul(this.leftVelocity,23.5)),step)),85);
            this.rightVelocity=limited(add(this.rightVelocity,mul(sub(mul(sub(targets[1],this.right),150),mul(this.rightVelocity,23.5)),step)),85);
            this.left=ellipse(add(this.left,mul(this.leftVelocity,step)),EYE_TRAVEL[0]);
            this.right=ellipse(add(this.right,mul(this.rightVelocity,step)),EYE_TRAVEL[1]);
        }
    }
    // Face blend precedes the existing eroded-pupil-domain clamp in XiaoyuRig.
    offsets(baseline:number[],closed:boolean){return [this.left,this.right].map(at=>closed?[0,0]:add(vector(baseline),mul(sub(at,vector(baseline)),this.weight)));}
    snapshot(){return {active_id:this.activeId,target_world:this.targetWorld.slice(),left:this.left.slice(),right:this.right.slice(),left_velocity:this.leftVelocity.slice(),right_velocity:this.rightVelocity.slice(),weight:this.weight};}
}
