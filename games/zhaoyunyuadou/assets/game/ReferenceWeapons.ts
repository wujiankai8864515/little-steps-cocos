/** Original weapon geometry and tween landmarks, decoded as inert facts. */
export type WeaponType=0|1|2|3;
export interface WeaponGeometry {type:WeaponType;x:number;y:number;rootWidth:number;rootHeight:number;anchorX:number;anchorY:number;width:number;height:number;childX:number;childY:number;centered:boolean;idleAngle:number;reach:number;tipY?:number;}
export const KNIFE_TRAILS:Record<number,[number,number,number,number]>={
    '-1':[25,80,1,.8],20:[23,82,1,.8],21:[27,76,1,1],22:[25,79,1,.95],23:[21,84,1,1],24:[20,62,1,.9],25:[20,65,1,.8],26:[26,69,1,1.1],27:[29,64,1,1],28:[27,72,1,1.1],29:[30,50,1,1],30:[21,52,1.2,1.2],
};
export interface WeaponPose {angle:number;childY:number;scaleX:number;scaleY:number;rootScale:number;visible:boolean;trail:boolean;}
export function weaponGeometry(type:WeaponType,hero:string,id=-1):WeaponGeometry {
    if(type===0)return {type,x:40,y:40,rootWidth:80,rootHeight:80,anchorX:.5,anchorY:.5,width:124,height:56,childX:40,childY:10,centered:true,idleAngle:-30,reach:0};
    if(type===1)return {type,x:hero==='马超'?140:['赵云','张飞'].includes(hero)?50:0,y:40,rootWidth:42,rootHeight:132,anchorX:.5,anchorY:.5,width:42,height:132,childX:21,childY:66+([-1,10].includes(id)?-25:0),centered:true,idleAngle:hero==='张飞'?130:0,reach:0,tipY:id===10?50:25};
    if(type===2)return {type,x:55,y:38,rootWidth:42,rootHeight:118,anchorX:.5,anchorY:.8,width:42,height:118,childX:0,childY:id===30?20:0,centered:false,idleAngle:[23,25].includes(id)?-90:id===29?0:15,reach:{20:30,21:40,22:30,23:30,25:50}[id]??60};
    return {type,x:0,y:40,rootWidth:33.6,rootHeight:105.6,anchorX:.5,anchorY:.8,width:33.6,height:105.6,childX:0,childY:0,centered:false,idleAngle:15,reach:0};
}
export function aimAngle(dx:number,dy:number){return Math.atan2(dx,-dy)*180/Math.PI;}
export function angleDelta(from:number,to:number){return (((to-from+180)%360)+360)%360-180;}
export function weaponPlaybackRate(type:WeaponType,hero:string,id:number,rate:number,bonus:number){
    if(type===0)return id===3?Math.max(.01,1+bonus):1;
    return type===1&&hero==='张飞'?1:Math.max(.01,rate);
}
/** The native general stays unavailable until these weapon tweens finish. */
export function weaponBusyDuration(type:WeaponType,hero:string){
    if(type===0)return 0;
    if(type===1)return hero==='马超'?1.4:hero==='张飞'?.7:hero==='赵云'?.67:.35;
    return type===2?.61:.2;
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const lerp=(a:number,b:number,t:number,ease:'linear'|'quadOut'|'cubicIn'='linear')=>{let u=clamp(t);if(ease==='quadOut')u=1-(1-u)*(1-u);if(ease==='cubicIn')u=u*u*u;return a+(b-a)*u;};
export function attackPose(spec:WeaponGeometry,hero:string,time:number,from:number,aim:number,distance:number,range:number,alternating:number):WeaponPose {
    const t=Math.max(0,time),p:WeaponPose={angle:aim,childY:spec.childY,scaleX:1,scaleY:1,rootScale:1,visible:true,trail:false};
    if(spec.type===0){
        p.angle=from+angleDelta(from,aim)*clamp(t/.2);
        const keys=[[0,1,1],[.45,.87,1.29],[.57,1.1,.82],[.63,1,1],[.69,1.06,.91],[.75,1,1]];
        for(let i=0;i<keys.length-1;i++)if(t<keys[i+1][0]){const a=keys[i],b=keys[i+1],u=(t-a[0])/(b[0]-a[0]);p.scaleX=lerp(a[1],b[1],u);p.scaleY=lerp(a[2],b[2],u);break;}return p;
    }
    if(spec.type===1){
        if(hero==='马超'){p.angle=from+angleDelta(from,aim)*clamp(t/.2);p.childY=lerp(spec.childY,40,t/.2);p.visible=t<.2||t>=1.2;p.rootScale=t<1.2?1:clamp((t-1.2)/.2);if(t>=1.2)p.childY=0;return p;}
        if(hero==='张飞'){
            // Native sweep uses a fixed .5 rate: 100/300/300 ms landmarks.
            p.angle=t<.1?lerp(from,130,t/.1,'cubicIn'):t<.4?lerp(130,-230,(t-.1)/.3):t<.7?-230:130;
            const extended=range/spec.height;p.childY=t<.05?lerp(spec.childY,extended,t/.05,'quadOut'):t<.4?extended:lerp(extended,spec.childY,(t-.4)/.2);p.trail=t>=.1&&t<.4;return p;
        }
        p.angle=from+angleDelta(from,aim)*clamp(t/.05);
        const forward=Math.min(80,range-(spec.height*.7-spec.tipY!*1.2)),end=spec.childY-forward,count=hero==='赵云'?5:1;
        if(t<.05)return p;
        if(t<.15){p.childY=lerp(spec.childY,spec.childY+20,(t-.05)/.1);p.scaleY=lerp(1,.8,(t-.05)/.1);return p;}
        if(t<.25){p.childY=lerp(spec.childY+20,end,(t-.15)/.1);p.scaleY=lerp(1,1.2,(t-.15)/.1);p.trail=true;return p;}
        const repeats=(count-1)*.4/count;
        if(t<.25+repeats){const phase=(t-.25)%(.4/count),half=.2/count;p.childY=phase<half?lerp(end,spec.childY-forward*.1,phase/half):lerp(spec.childY-forward*.1,end,(phase-half)/half);p.scaleY=1.2;p.trail=phase>=half;return p;}
        p.childY=lerp(end,spec.childY,(t-.25-repeats)/.1);p.scaleY=lerp(1.2,1,(t-.25-repeats)/.1);return p;
    }
    if(spec.type===2){
        if(t<.1)p.angle=from+angleDelta(from,aim)*clamp(t/.1);
        else if(t<.15)p.angle=lerp(aim,aim+45,(t-.1)/.05,'cubicIn');
        else if(t<.28)p.angle=aim+45;
        else if(t<.46)p.angle=lerp(aim+45,aim-45,(t-.28)/.18,'quadOut');
        else p.angle=lerp(aim-45,aim,(t-.46)/.15);
        const extended=spec.reach-distance;p.childY=t<.1?spec.childY:t<.28?lerp(spec.childY,extended,(t-.1)/.18,'quadOut'):t<.46?extended:lerp(extended,spec.childY,(t-.46)/.15);p.trail=t>=.28&&t<.46;return p;
    }
    const swing=alternating%2===1?-60:60;p.angle=lerp(aim+swing,aim-swing,t/.2,'quadOut');p.childY=t<.1?lerp(0,-distance,t/.1):lerp(-distance,0,(t-.1)/.05);p.trail=t<.2;return p;
}
export class WeaponMotion {
    attacks:number;time=0;idleTime=0;active=false;aim=0;distance=0;range=200;from=0;angle=0;alternating=0;
    constructor(public spec:WeaponGeometry,public hero:string,attacks=0){this.attacks=attacks;}
    resume(attacks:number,seconds:number,rate:number,target:{dx:number;dy:number;distance:number;range:number;angle?:number}){
        this.attacks=attacks;this.active=true;this.time=Math.max(0,seconds)*Math.max(.01,rate);this.from=0;this.aim=target.angle??aimAngle(target.dx,target.dy);this.distance=target.distance;this.range=target.range;this.alternating=attacks;
    }
    reset(attacks:number){this.attacks=attacks;this.time=0;this.idleTime=0;this.active=false;this.from=0;this.angle=0;this.alternating=0;}
    advance(dt:number,attacks:number,engaged:boolean,rate:number,target:{dx:number;dy:number;distance:number;range:number;angle?:number},elapsedSeconds?:number,idleSeconds?:number){
        if(attacks!==this.attacks){this.attacks=attacks;this.active=true;this.time=0;this.from=this.angle;this.aim=target.angle??aimAngle(target.dx,target.dy);this.distance=target.distance;this.range=target.range;this.alternating++;}
        if(this.active&&!engaged){this.active=false;this.idleTime=0;this.from=this.angle;}
        const step=Math.max(0,dt);
        if(this.active){this.time=elapsedSeconds===undefined?this.time+step*Math.max(.01,rate):Math.max(0,elapsedSeconds)*Math.max(.01,rate);const pose=attackPose(this.spec,this.hero,this.time,this.from,this.aim,this.distance,this.range,this.alternating);this.angle=pose.angle;return pose;}
        this.idleTime=idleSeconds===undefined?this.idleTime+step:Math.max(0,idleSeconds);const t=this.idleTime;
        let angle=t<1?this.from:t<1.3?lerp(this.from,this.spec.idleAngle,(t-1)/.3):this.spec.idleAngle;
        if(t>=1.3&&this.spec.type!==1&&this.spec.idleAngle!==0){const club=this.spec.idleAngle===-90,cycle=club?1.25:1.3,phase=(t-1.3)%cycle,first=club?-60:this.spec.type===0?-33:18,last=club?-90:this.spec.type===0?-27:12,start=t<1.3+cycle?this.spec.idleAngle:last;angle=phase<.6?lerp(start,first,phase/.6):phase<1.2?lerp(first,last,(phase-.6)/.6):last;}
        this.angle=angle;const bobPhase=Math.max(0,t-1.3)%.6,bob=bobPhase<.3?lerp(0,-4,bobPhase/.3):lerp(-4,0,(bobPhase-.3)/.3,'quadOut');
        return {angle,childY:this.spec.type===0?(t<1?10:lerp(10,50,(t-1)/.15)):this.spec.childY+(this.spec.type===1?bob/2:bob),scaleX:1,scaleY:this.spec.type===0?(t<1?1:lerp(1,-1,(t-1)/.15)):1,rootScale:1,visible:true,trail:false};
    }
}
