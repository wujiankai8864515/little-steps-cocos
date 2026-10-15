/** Numeric rules from the pinned native build, read as inert source only. */
export interface GroundPikeSpike {x:number;y:number;angle:number;}
export interface GroundPikeState {target:number;weaponId:12|17;spikes:GroundPikeSpike[];}
export interface FlyingPikeTiming {born:number;appear:number;launch:number;}
export function groundPikeRule(id:number,hero:string){
    return id===12?{targets:1,damage:2,spikes:1}:id===17?{targets:hero==='马超'?5:3,damage:3,spikes:5}:null;
}
export function groundPikeSpikes(count:number,random:()=>number){
    const spikes:GroundPikeSpike[]=[];
    for(let i=0;i<count;i++){const y=60+20*random(),x=20+40*random(),angle=-5+10*random();spikes.push({x,y,angle});}
    return spikes;
}
export function validGroundPike(value:GroundPikeState){
    return value&&Number.isSafeInteger(value.target)&&value.target>0&&[12,17].includes(value.weaponId)&&Array.isArray(value.spikes)&&value.spikes.length===(value.weaponId===12?1:5)&&
        value.spikes.every(p=>p&&[p.x,p.y,p.angle].every(Number.isFinite)&&p.x>=20&&p.x<=60&&p.y>=60&&p.y<=80&&Math.abs(p.angle)<=5);
}
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Gs: 150 ms cubic lift, 500 ms hold, then fall/squash/recover. */
export function groundPikePose(elapsed:number){
    const growth=1-Math.pow(1-clamp(elapsed/.15),3),fall=clamp((elapsed-.5)/.25);
    let scaleX=1,scaleY=1;
    if(elapsed>=.75&&elapsed<.85){const t=clamp((elapsed-.75)/.1);scaleX=1+.5*t;scaleY=1-.8*t;}
    else if(elapsed>=.85&&elapsed<.95){const t=clamp((elapsed-.85)/.1);scaleX=1.5-.5*t;scaleY=.2+.8*t;}
    const lift=elapsed<.5?growth:1-Math.pow(fall,3);
    return {growth,rise:40*growth,alpha:1-clamp((elapsed-.5)/.5),lift:60*lift,angle:20*lift,scaleX,scaleY};
}
export function flyingPikeChance(hero:string){return hero==='赵云'?.05:.1;}
export function flyingPikeTiming(born:number,enumerationIndex:number):FlyingPikeTiming{
    // The 1000 ms aiming tweener runs in parallel and owns the launch callback.
    // Laya's parallel() copies duration, but does not copy the fade's delay.
    return {born,appear:born+.1*enumerationIndex,launch:born+1};
}
export function validFlyingPike(value:FlyingPikeTiming){
    return value&&[value.born,value.appear,value.launch].every(Number.isFinite)&&value.born>=0&&value.appear>=value.born&&value.launch>=value.born;
}
export function flyingPikePose(now:number,timing:FlyingPikeTiming){
    const alpha=clamp((now-timing.appear)/.2),ringAlpha=now<timing.launch?clamp((now-timing.born)/.2):1-clamp((now-timing.launch)/.2);
    return {alpha,scaleY:alpha,ringAlpha,ringFrame:1+Math.floor(Math.max(0,Math.min(now,timing.launch)-timing.born)/.1+1e-8)%3};
}
