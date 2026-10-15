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

export type BirdArrowKind='eagle'|'phoenix';
export interface BirdArrowState {kind:BirdArrowKind;born:number;startX:number;startY:number;dx:number;dy:number;rate:number;hitAt?:number;}
export interface ArrowBurn {born:number;next:number;end:number;frame:number;stacks:{until:number;damage:number}[];}
export interface CrossbowVolley {heroId:number;born:number;aim:number;count:number;next:number;fromAngle:number;drawAt?:number;drawAngle?:number;}
export interface CrossbowFireArrow {born:number;dx:number;dy:number;}
export function crossbowVolleyAngle(aim:number,index:number){return aim+(index<5?(index-2.5)*20:-(index-7.5)*20);}
export function crossbowFireFrame(now:number,born:number){return 1+Math.floor(Math.max(0,now-born)/.2+1e-8)%3;}
export function crossbowFireHitBox(point:{x:number;y:number},arrow:CrossbowFireArrow){
    const angle=Math.atan2(arrow.dx,-arrow.dy);return {x:point.x-7.2*Math.sin(angle),y:point.y+7.2*Math.cos(angle),angle:angle*180/Math.PI,length:50,bold:11};
}
export function validCrossbowVolley(value:CrossbowVolley){
    return value&&Number.isSafeInteger(value.heroId)&&value.heroId>0&&[value.born,value.aim,value.next,value.fromAngle].every(Number.isFinite)&&value.born>=0&&value.next>=value.born&&Number.isInteger(value.count)&&value.count>=0&&value.count<=10&&(value.count===0||Number.isFinite(value.drawAt)&&value.drawAt!>=value.born&&Number.isFinite(value.drawAngle));
}
export function validCrossbowFire(value:CrossbowFireArrow){return value&&[value.born,value.dx,value.dy].every(Number.isFinite)&&value.born>=0&&Math.abs(Math.hypot(value.dx,value.dy)-1)<1e-6;}
export function birdArrowSpec(kind:BirdArrowKind){return kind==='eagle'?{width:187,height:124,anchorX:.3,anchorY:.5,rate:.35,interval:.1}:{width:44,height:72,anchorX:.5,anchorY:.5,rate:1,interval:.2};}
export function birdArrowOrigin(pivot:{x:number;y:number},angle:number,kind:BirdArrowKind){
    // _R releases Cy(bullet,true), after the bow's 40 px draw and .87/1.29 squash.
    const a=angle*Math.PI/180,x=kind==='eagle'?187*(.5-.3)*.87:0,y=-30+40*1.29;
    return {x:pivot.x+x*Math.cos(a)-y*Math.sin(a),y:pivot.y+x*Math.sin(a)+y*Math.cos(a)};
}
export function birdArrowPose(now:number,state:BirdArrowState,point:{x:number;y:number}){
    const distance=Math.hypot(point.x-state.startX,point.y-state.startY);
    return {scale:state.kind==='phoenix'?1+distance/500:1,frame:birdArrowFrame(state.kind,now-state.born),flash:state.hitAt!==undefined&&now-state.hitAt<.2};
}
export function birdArrowFrame(kind:BirdArrowKind,elapsed:number){return 1+Math.floor(Math.max(0,elapsed)/birdArrowSpec(kind).interval+1e-8)%4;}
export function birdArrowDamage(kind:BirdArrowKind,power:number,distance:number){return kind==='eagle'?power*3:Math.min(power+Math.floor(distance/250),2*power);}
export function birdArrowHitBox(state:BirdArrowState,point:{x:number;y:number}){
    const angle=Math.atan2(state.dx,-state.dy),scale=state.kind==='phoenix'?1+Math.hypot(point.x-state.startX,point.y-state.startY)/500:1;
    const x=state.kind==='eagle'?22-187*.3:0,y=state.kind==='eagle'?36-124*.5:0;
    const cx=point.x+x*Math.cos(angle)-y*Math.sin(angle),cy=point.y+x*Math.sin(angle)+y*Math.cos(angle),w=44*scale,h=72*scale;
    return {x:cx-h/2*Math.sin(angle),y:cy+h/2*Math.cos(angle),angle:angle*180/Math.PI,length:h-w,bold:w/2};
}
export function validBirdArrow(value:BirdArrowState){
    return value&&['eagle','phoenix'].includes(value.kind)&&[value.born,value.startX,value.startY,value.dx,value.dy,value.rate].every(Number.isFinite)&&value.born>=0&&Math.abs(Math.hypot(value.dx,value.dy)-1)<1e-6&&value.rate>=.1&&value.rate<=birdArrowSpec(value.kind).rate&&(value.hitAt===undefined||Number.isFinite(value.hitAt)&&value.hitAt>=value.born);
}
export function validArrowBurn(value:ArrowBurn){
    return value&&[value.born,value.next,value.end,value.frame].every(Number.isFinite)&&value.born>=0&&value.next>=value.born&&value.end>=value.born&&Number.isInteger(value.frame)&&value.frame>=0&&value.frame<4&&Array.isArray(value.stacks)&&value.stacks.length<=25600&&value.stacks.every(s=>s&&Number.isFinite(s.until)&&s.until>=value.born&&[1,10].includes(s.damage));
}
export function arrowBurnPose(now:number,value:ArrowBurn){return {frame:1+(value.frame+Math.floor(Math.max(0,now-value.born)/.07+1e-8))%4,scale:now<value.end?clamp((now-value.born)/.5):1-clamp((now-value.end)/.5)};}

export interface FireDragonPart {index:number;born:number;x:number;y:number;angle:number;alive:boolean;visited:number[];lastFireX?:number;lastFireY?:number;}
export interface FireDragon {born:number;startX:number;startY:number;dx:number;dy:number;phase:number;next:number;parts:FireDragonPart[];}
export interface DragonGroundFire {id:number;side:0|1;from:number;hero:string;heroId:number;damage:number;x:number;y:number;born:number;next:number;frame:number;}
export interface FireSparks {target:number;points:{x:number;y:number;frames:number[]}[];}
export function createFireDragon(born:number,point:{x:number;y:number},angle:number,phase:number):FireDragon{
    const a=angle*Math.PI/180;return {born,startX:point.x,startY:point.y,dx:Math.sin(a),dy:-Math.cos(a),phase,next:1,parts:[{index:0,born,x:point.x,y:point.y,angle,alive:true,visited:[]}]};
}
export function fireDragonPartSpec(index:number,elapsed=0){
    return index===0?{width:61,height:100,scale:1+.5*clamp(elapsed/.5),imageY:22}:index===14?{width:45,height:50,scale:.8,imageY:0}:{width:37,height:50,scale:1+(15-index)/15,imageY:0};
}
export function fireDragonPartPosition(dragon:FireDragon,part:FireDragonPart,now:number){
    const elapsed=Math.max(0,now-part.born),amplitude=part.index===0?7.5:part.index===14?0:15*Math.sin(Math.PI*part.index/14),wave=Math.sin(elapsed*10+dragon.phase)*amplitude;
    return {x:dragon.startX+dragon.dx*elapsed*500+wave*dragon.dy,y:dragon.startY+dragon.dy*elapsed*500-wave*dragon.dx};
}
export function fireDragonPartHits(index:number){return index===0||index===14||index===4||index===10;}
export function fireDragonHitBox(part:FireDragonPart,now:number){
    const spec=fireDragonPartSpec(part.index,now-part.born),a=part.angle*Math.PI/180,h=spec.height*spec.scale,w=spec.width*spec.scale;
    return {x:part.x-h/2*Math.sin(a),y:part.y+h/2*Math.cos(a),angle:part.angle,length:h-w,bold:w/2};
}
export function fireDragonRoad(grid:readonly (readonly string[])[],side:0|1,point:{x:number;y:number}){
    const x=Math.floor((point.x+22.5)/80),y=Math.floor((point.y+25)/80);return grid[x]?.[y]==='0_'+side;
}
export function dragonGroundFirePose(now:number,fire:Pick<DragonGroundFire,'born'|'frame'>){
    const elapsed=Math.max(0,now-fire.born);return {frame:1+(fire.frame+Math.floor(elapsed/.07+1e-8))%4,scale:1-clamp((elapsed-5)/.5)};
}
export function groundFlamePose(elapsed:number,frame:number){return {frame:1+(frame+Math.floor(Math.max(0,elapsed)/.07+1e-8))%4,scale:elapsed<.5?clamp(elapsed/.5):1-clamp((elapsed-1)/.5)};}
export function fireSparkPose(elapsed:number,frames:number[]){return {frame:elapsed<.05?0:frames[Math.min(3,Math.floor((elapsed+1e-8)/.05))],alpha:1-clamp((elapsed-.2)/.1)};}
export function validFireSparks(value:FireSparks){return value&&Number.isSafeInteger(value.target)&&value.target>0&&Array.isArray(value.points)&&value.points.length===3&&value.points.every(p=>p&&[p.x,p.y].every(Number.isFinite)&&p.x>=20&&p.x<60&&p.y>=20&&p.y<60&&Array.isArray(p.frames)&&p.frames.length===4&&new Set(p.frames).size===4&&p.frames.every(f=>Number.isInteger(f)&&f>=0&&f<4));}
export function validFireDragon(value:FireDragon){
    return value&&[value.born,value.startX,value.startY,value.dx,value.dy,value.phase].every(Number.isFinite)&&value.born>=0&&value.phase>=0&&value.phase<100&&Math.abs(Math.hypot(value.dx,value.dy)-1)<1e-6&&Number.isInteger(value.next)&&value.next>=1&&value.next<=15&&Array.isArray(value.parts)&&value.parts.length===value.next&&value.parts.every((p,i)=>p&&p.index===i&&[p.born,p.x,p.y,p.angle].every(Number.isFinite)&&p.born>=value.born&&typeof p.alive==='boolean'&&Array.isArray(p.visited)&&p.visited.length<=200&&p.visited.every(id=>Number.isSafeInteger(id)&&id>0)&&(p.index!==14||[p.lastFireX,p.lastFireY].every(Number.isFinite)));
}
export function validDragonGroundFire(value:DragonGroundFire){return value&&[value.id,value.from,value.heroId].every(id=>Number.isSafeInteger(id)&&id>0)&&[0,1].includes(value.side)&&typeof value.hero==='string'&&[value.damage,value.x,value.y,value.born,value.next].every(Number.isFinite)&&value.damage>0&&value.born>=0&&value.next>=value.born&&Number.isInteger(value.frame)&&value.frame>=0&&value.frame<4;}
