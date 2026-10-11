// Direct action_marks.gd rules and drawing data in source (downward) coordinates.
export type ActionMarkKind='tap'|'drink'|'doze'|'lift';
export const ACTION_MARK_SPECS={
    tap:{life:.19,cooldown:0,alpha:.94,color:[1,.75,.32],drift:[0,0],bounds:[-8,-43,64,77]},
    drink:{life:.42,cooldown:.5,alpha:.75,color:[.49,.78,.85],drift:[-2,9],bounds:[-15,-21,32,45]},
    doze:{life:.82,cooldown:2,alpha:.6,color:[.79,.71,.48],drift:[3,-9],bounds:[-12,-28,35,33]},
    lift:{life:.36,cooldown:.75,alpha:.69,color:[.94,.7,.32],drift:[0,-3],bounds:[-13,-18,27,34]},
};
export const ACTION_MARK_GLYPHS={drink:[[[-6,-9],[-10,-2],[-9,1],[-6,3],[-3,1],[-2,-2]],[[7,-15],[4,-10],[5,-7],[7,-6],[9,-7],[10,-10]]],doze:[[[-8,-8],[0,-8],[-8,0],[0,0]],[[7,-15],[15,-15],[7,-7],[15,-7]]],lift:[[[-4,-10],[-7,-4],[-3,2],[-6,8]],[[7,-9],[4,-3],[8,3],[5,9]]]};
export interface ActionMark {kind:ActionMarkKind;position:number[];age:number;}
const finite=(a:number[],n:number)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
const rectAbs=(r:number[])=>[r[0]+Math.min(0,r[2]),r[1]+Math.min(0,r[3]),Math.abs(r[2]),Math.abs(r[3])];
const intersects=(a:number[],b:number[])=>a[0]<=b[0]+b[2]&&a[0]+a[2]>=b[0]&&a[1]<=b[1]+b[3]&&a[1]+a[3]>=b[1];
const shifted=(p:number[],r:number[])=>[p[0]+r[0],p[1]+r[1],r[2],r[3]];
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export function tapMarkMotion(age:number){
    if(age<.035){const t=Math.max(0,Math.min(1,age/.035));return [mix(.58,1.14,1-Math.pow(1-t,1/.55)),mix(0,6,age/.035)];}
    if(age<.09){const t=smooth(.035,.09,age);return [mix(1.14,.87,t),mix(6,3.2,t)];}
    const t=smooth(.09,.19,age);return [mix(.87,.98,t),mix(3.2,7.5,t)];
}
export function actionMarkAlpha(mark:ActionMark){const s=ACTION_MARK_SPECS[mark.kind];return s.alpha*(1-smooth(mark.kind==='tap'?.22:.12,1,Math.max(0,Math.min(1,mark.age/s.life))));}
export function tapMarkContours(mark:ActionMark){const motion=tapMarkMotion(mark.age),fade=actionMarkAlpha(mark),thickness=1-smooth(.09,.19,mark.age)*.76,result:Array<{points:number[][];color:number[]}>=[];
    [-1.19,-.28,.6].forEach((angle,index)=>{const dir=[Math.cos(angle),Math.sin(angle)],cross=[dir[1],-dir[0]],start=mark.position.map((v,i)=>v+dir[i]*(6+motion[1])),length=[25,31,23][index]*motion[0],bend=(index%2===0?1.4:-1.7)*motion[0];
        for(const edge of [true,false]){const width=thickness*(edge?1.6:1),widths=[.32,1.35,1.9,1.45,.6,.04],centers=widths.map((_,i)=>{const t=i/5;return start.map((v,k)=>v+dir[k]*length*t+cross[k]*(Math.sin(t*Math.PI)*bend+Math.sin(t*Math.PI*2)*.35));});
            const points=centers.map((c,i)=>c.map((v,k)=>v+cross[k]*widths[i]*width));for(let i=5;i>=0;i--)points.push(centers[i].map((v,k)=>v-cross[k]*widths[i]*width*.72));result.push({points,color:edge?[.54,.29,.12,fade*.7]:[1,.75,.32,fade]});}
    });return result;
}
export class ActionMarkState {
    marks:ActionMark[]=[];readonly cooldowns=new Map<ActionMarkKind,number>();readonly eventIds=new Map<ActionMarkKind,number>();private face=[0,0,0,0];serial=0;
    setFace(rect:number[]){if(!finite(rect,4))return false;this.face=rectAbs(rect);return true;}
    private exclusion(){return [this.face[0]-8,this.face[1]-8,this.face[2]+16,this.face[3]+16];}
    emit(kind:ActionMarkKind,at:number[],face=[0,0,0,0],eventId=-1){
        if(!Object.prototype.hasOwnProperty.call(ACTION_MARK_SPECS,kind)||!finite(at,2)||!finite(face,4)||this.marks.length>=3||(this.cooldowns.get(kind)||0)>0||eventId>=0&&this.eventIds.get(kind)===eventId||this.marks.some(m=>m.kind===kind))return false;
        const f=rectAbs(face);if(f[2]>0&&f[3]>0)this.face=f;let position=at.slice();const spec=ACTION_MARK_SPECS[kind];
        if(this.face[2]>0&&this.face[3]>0){const r=this.exclusion(),b=spec.bounds;if(intersects(shifted(at,b),r)){const choices=[[r[0]-b[0]-b[2]-1,at[1]],[r[0]+r[2]-b[0]+1,at[1]],[at[0],r[1]-b[1]-b[3]-1],[at[0],r[1]+r[3]-b[1]+1]];position=choices.reduce((a,b)=>Math.hypot(a[0]-at[0],a[1]-at[1])<=Math.hypot(b[0]-at[0],b[1]-at[1])?a:b);if(Math.hypot(position[0]-at[0],position[1]-at[1])>72)return false;}}
        this.marks.push({kind,position,age:0});this.cooldowns.set(kind,spec.cooldown);if(eventId>=0)this.eventIds.set(kind,eventId);this.serial++;return true;
    }
    faceSafe(mark:ActionMark){return !(this.face[2]>0&&this.face[3]>0)||!intersects(shifted(mark.position,ACTION_MARK_SPECS[mark.kind].bounds),this.exclusion());}
    advance(delta:number){if(!Number.isFinite(delta)||delta<=0)return;for(const [kind,time] of this.cooldowns){const remaining=Math.max(0,time-delta);if(remaining===0)this.cooldowns.delete(kind);else this.cooldowns.set(kind,remaining);}this.marks=this.marks.filter(m=>{m.age+=delta;return m.age<ACTION_MARK_SPECS[m.kind].life;});}
    clear(){this.marks=[];this.cooldowns.clear();this.eventIds.clear();this.face=[0,0,0,0];}
    snapshot(){return {serial:this.serial,activeCount:this.marks.length,capacity:3,cooldownCount:this.cooldowns.size,eventIdCount:this.eventIds.size,maxLifetime:.82,marks:this.marks.map(m=>({kind:m.kind,age:m.age,lifetime:ACTION_MARK_SPECS[m.kind].life,alpha:actionMarkAlpha(m),position:m.position.slice(),bounds:shifted(m.position,ACTION_MARK_SPECS[m.kind].bounds),faceSafe:this.faceSafe(m),impulseScale:m.kind==='tap'?tapMarkMotion(m.age)[0]:1,outwardPixels:m.kind==='tap'?tapMarkMotion(m.age)[1]:0}))};}
}
