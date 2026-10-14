/** Appearance and word motion read from the public native controller as data. */
export const HERO_RIGS:Record<string,string>={'赵云':'zhaoYun','张飞':'zhangFei','马超':'maChao'};
const fiveLevel=new Set(['赵云','张飞','马超','关羽','黄忠','刘备']);
export function heroAppearance(name:string,level:number){
    const upgraded=fiveLevel.has(name);
    return {background:upgraded?1:3,border:upgraded?2:4,
        color:upgraded?(level>=4?'#ffffff':'#cd8831'):'#be74de',
        digits:upgraded?'number8':'number7',skin:level===5?'3':level===4?'2':'1'};
}
export interface WordPose {rotation:number;scaleX:number;scaleY:number;}
const rest:WordPose={rotation:0,scaleX:1,scaleY:1};
const attackFrames=[
    {time:0,...rest},
    {time:.15,rotation:-3,scaleX:1.04,scaleY:.95},
    {time:.27,rotation:-2,scaleX:.97,scaleY:1.05},
    {time:.39,rotation:0,scaleX:1.04,scaleY:.89},
    {time:.6,...rest},
];
export function wordPose(attacking:boolean,time:number):WordPose{
    if(!attacking){const t=Math.max(0,time)%.6,u=t<.3?t/.3:(.6-t)/.3;return {rotation:0,scaleX:1+.04*u,scaleY:1-.08*u};}
    const t=Math.max(0,time);if(t>=.6)return {...rest};
    const i=attackFrames.findIndex((f,index)=>index+1<attackFrames.length&&t<attackFrames[index+1].time),a=attackFrames[Math.max(0,i)],b=attackFrames[Math.max(0,i)+1],u=(t-a.time)/(b.time-a.time);
    return {rotation:a.rotation+(b.rotation-a.rotation)*u,scaleX:a.scaleX+(b.scaleX-a.scaleX)*u,scaleY:a.scaleY+(b.scaleY-a.scaleY)*u};
}
export class HeroMotion {
    seenAttacks:number;attacking=false;elapsed=0;
    constructor(attacks=0){this.seenAttacks=attacks;}
    reset(attacks:number){this.seenAttacks=attacks;this.attacking=false;this.elapsed=0;}
    advance(dt:number,attacks:number,cooldown:number,rate:number,elapsedSeconds?:number,idleSeconds?:number){
        const started=attacks!==this.seenAttacks;
        if(started){this.seenAttacks=attacks;this.attacking=true;this.elapsed=0;}
        if(this.attacking&&cooldown<=0){this.attacking=false;this.elapsed=0;}
        if(this.attacking&&elapsedSeconds!==undefined)this.elapsed=Math.max(0,elapsedSeconds)*Math.max(.01,rate);
        else if(!this.attacking&&idleSeconds!==undefined)this.elapsed=Math.max(0,idleSeconds);
        else this.elapsed+=Math.max(0,dt)*(this.attacking?Math.max(.01,rate):1);
        return {started,attacking:this.attacking,pose:wordPose(this.attacking,this.elapsed)};
    }
}
