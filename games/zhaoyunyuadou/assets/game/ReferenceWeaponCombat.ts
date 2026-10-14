/** Native attack/collision facts; original executable code is never loaded. */
import { aimAngle, weaponGeometry, WeaponType } from './ReferenceWeapons';

export interface Point {x:number;y:number;}
export interface StrikePlan {
    kind:'target'|'area'|'arrow'|'throw'; delay:number; duration:number;
    x:number;y:number;angle:number;endAngle:number;length:number;endLength:number;bold:number;
    tween:number;arc?:number;projectileSpeed?:number;
}
export interface Flight {
    startX:number;startY:number;controlX:number;controlY:number;progress:number;
    multiplier:number;arrival:number;lastAt:number;
}
export function rotatePoint(x:number,y:number,degrees:number):Point {
    const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return {x:x*c-y*s,y:x*s+y*c};
}
export function nativeWeaponAim(type:WeaponType,hero:string,pivot:Point,target:Point){
    const dx=target.x-pivot.x,dy=target.y-pivot.y;
    if(type===0)return aimAngle(dx,dy-100); // Wi.create(50), initial tangent.
    if(type===1&&hero==='马超'&&Math.abs(dx)>60)return 0;
    return aimAngle(dx,dy);
}
export function weaponStrikePlans(type:WeaponType,hero:string,id:number,origin:Point,target:Point,range:number,rate:number,attack:number){
    const spec=weaponGeometry(type,hero,id),pivot={x:origin.x+spec.x,y:origin.y+spec.y},aim=nativeWeaponAim(type,hero,pivot,target),plans:StrikePlan[]=[];
    const add=(kind:StrikePlan['kind'],delay:number,duration:number,x:number,y:number,angle:number,endAngle:number,length:number,endLength:number,bold:number,tween=0,arc?:number,projectileSpeed?:number)=>plans.push({kind,delay:delay/rate,duration:duration/rate,x,y,angle,endAngle,length,endLength,bold,tween:tween/rate,arc,projectileSpeed});
    if(type===0){
        // Cy(arrow, true) uses its centre: bow draw 40, arrow pivot .9*72.
        const local=rotatePoint(0,-30+(40+36-72*.9)*1.29,aim);
        add('arrow',.45,0,pivot.x+local.x,pivot.y+local.y,aim,aim,0,0,0,0,50,3);
    }else if(type===1&&hero==='马超'){
        const local=rotatePoint(-21,-26,aim),aligned=Math.abs(target.x-pivot.x)<=60;
        add('throw',.2,0,pivot.x+local.x,pivot.y+local.y,aim,aim,0,0,0,0,aligned?0:350+Math.abs(target.y-pivot.y),aligned?5:1);
    }else if(type===1&&hero==='张飞'){
        // .5 native sweep rate already converted to real seconds.
        add('area',.1,.3,pivot.x,pivot.y,130,-230,range,range,5,.3);
    }else if(type===1){
        const local=rotatePoint(0,spec.childY+20+spec.tipY!-132,aim),count=hero==='赵云'?5:1;
        add('area',.15,.1,pivot.x+local.x,pivot.y+local.y,aim,aim,count===1?10:range,range,5,count===1?.15:0);
        for(let i=1;i<count;i++)add('area',.25+(2*i-1)*.2/count,.2/count,pivot.x+local.x,pivot.y+local.y,aim,aim,range,range,5);
    }else if(type===2){
        // Strategy 100: selected target is hit when the cut requests removal.
        add('target',.46,0,pivot.x,pivot.y,aim,aim,0,0,0);
    }else{
        const swing=attack%2===1?-60:60;
        add('area',0,.2,pivot.x,pivot.y,aim+swing,aim-swing,range,range,10,.15);
    }
    return {aim,plans};
}

export function strikeShape(plan:StrikePlan,elapsed:number){
    const t=plan.tween>0?Math.max(0,Math.min(1,elapsed/plan.tween)):1;
    return {x:plan.x,y:plan.y,angle:plan.angle+(plan.endAngle-plan.angle)*t,length:plan.length+(plan.endLength-plan.length)*t,bold:plan.bold};
}
/** Original SAT uses rounded-degree axes, 80x80 enemy boxes and strict overlap. */
export function strikeOverlaps(shape:{x:number;y:number;angle:number;length:number;bold:number},enemy:Point){
    const a=Math.round(shape.angle)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),hw=shape.bold,hh=(shape.length+2*shape.bold)/2;
    const centre={x:shape.x+hh*s,y:shape.y-hh*c};if(!enemyInRange(centre,Math.hypot(hw,hh),enemy))return false;
    const dx=enemy.x-centre.x,dy=enemy.y-centre.y,ac=Math.abs(c),as=Math.abs(s);
    if(Math.abs(dx)>=hw*ac+hh*as+40||Math.abs(dy)>=hw*as+hh*ac+40)return false;
    return Math.abs(dx*c+dy*s)<hw+40*(ac+as)&&Math.abs(-dx*s+dy*c)<hh+40*(ac+as);
}
export function enemyInRange(origin:Point,radius:number,enemy:Point){
    const dx=origin.x-Math.max(enemy.x-40,Math.min(origin.x,enemy.x+40)),dy=origin.y-Math.max(enemy.y-40,Math.min(origin.y,enemy.y+40));
    return dx*dx+dy*dy<=(radius-1)*(radius-1);
}
export function createFlight(start:Point,target:Point,arc:number,multiplier:number,arrival:number,now:number):Flight {
    return {startX:start.x,startY:start.y,controlX:(start.x+target.x)/2,controlY:(start.y+target.y)/2-arc,progress:0,multiplier,arrival,lastAt:now};
}
export function advanceFlight(flight:Flight,position:Point,target:Point,now:number){
    const dt=Math.max(0,now-flight.lastAt);flight.lastAt=now;
    const total=Math.hypot(target.x-flight.startX,target.y-flight.startY),remaining=Math.hypot(target.x-position.x,target.y-position.y);
    flight.progress+=dt*flight.multiplier/.5*(total>0?Math.sqrt(Math.max(.1,remaining/total)):1);
    if(remaining<flight.arrival||flight.progress>=1)return {x:position.x,y:position.y,angle:0,arrived:true};
    const t=flight.progress,u=1-t,x=u*u*flight.startX+2*u*t*flight.controlX+t*t*target.x,y=u*u*flight.startY+2*u*t*flight.controlY+t*t*target.y;
    const dx=x-position.x,dy=y-position.y;
    return {x,y,angle:dx||dy?aimAngle(dx,dy):aimAngle(flight.controlX-flight.startX,flight.controlY-flight.startY),arrived:false};
}
