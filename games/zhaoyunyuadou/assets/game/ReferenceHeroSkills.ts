/** Timings and per-general rules transcribed as data from the public native build.
 * No original program is executed or shipped. All time values below are seconds. */
export type HeroSkillKind='shout'|'jump'|'phantom'|'arrowRain'|'fireRain'|'holyBlade';
export interface HeroSkillSpec {name:string;kind?:HeroSkillKind;every:number;before:boolean;interrupt:boolean;replace:boolean;count?:number;stun?:number;}
export const HERO_SKILLS:Record<string,HeroSkillSpec>={
    '赵云':{name:'七进七出',kind:'phantom',every:30,before:false,interrupt:false,replace:false,count:7},
    '张飞':{name:'大喝',kind:'shout',every:15,before:true,interrupt:true,replace:false,stun:2},
    '马超':{name:'晕眩',every:0,before:false,interrupt:false,replace:false},
    '关羽':{name:'跳斩',kind:'jump',every:20,before:true,interrupt:true,replace:true,count:5},
    '黄忠':{name:'火箭烈',kind:'fireRain',every:30,before:true,interrupt:true,replace:false},
    '关平':{name:'大喝',kind:'shout',every:15,before:true,interrupt:true,replace:false,stun:1},
    '关兴':{name:'晕眩',every:0,before:false,interrupt:false,replace:false},
    '张苞':{name:'晕眩',every:0,before:false,interrupt:false,replace:false},
    '张翼':{name:'跳斩',kind:'jump',every:20,before:true,interrupt:true,replace:true,count:1},
    '黄盖':{name:'无技能',every:0,before:false,interrupt:false,replace:false},
    '刘备':{name:'圣剑',kind:'holyBlade',every:20,before:false,interrupt:false,replace:false},
    '黄祖':{name:'箭雨',kind:'arrowRain',every:30,before:true,interrupt:true,replace:false,count:5},
};
export const skillRate=(level:number)=>1+.2*level;
export const huangZhongGrowth=(level:number)=>[0,1,1,2,2][Math.max(0,Math.min(4,level-1))];
export const huangZhongArrows=(level:number)=>[1,1,2,2,3][Math.max(0,Math.min(4,level-1))];
export function hitPassive(hero:string,boss:boolean){
    if(hero==='马超')return {chance:boss?.1:.3,stun:boss?.2:.5,maxHealth:boss?.02:.1};
    if(hero==='关兴'||hero==='张苞')return {chance:boss?0:.1,stun:boss?0:.3,maxHealth:0};
    return null;
}
export interface SkillPoint {x:number;y:number;}
export interface SkillProjectile {
    kind:'line'|'wave'|'point';born:number;startX:number;startY:number;dx:number;dy:number;
    speed:number;expires:number;toX?:number;toY?:number;arc?:number;duration?:number;
}
export function validSkillProjectile(value:SkillProjectile){
    return value&&['line','wave','point'].includes(value.kind)&&[value.born,value.startX,value.startY,value.dx,value.dy,value.speed,value.expires].every(Number.isFinite)&&value.speed>0&&
        (value.kind!=='point'||[value.toX,value.toY,value.arc,value.duration].every(Number.isFinite)&&(value.duration||0)>0);
}
/** Entirely serializable, so pausing, moving a word, and restoring can cancel or
 * reconstruct the same skill without wall-clock callbacks. */
export interface HeroSkillState {
    id:number;unit:number;side:0|1;cell:number;hero:string;kind:HeroSkillKind;level:number;
    born:number;next:number;phase:number;count:number;damage:number;range:number;rate:number;
    x:number;y:number;fromX:number;fromY:number;toX:number;toY:number;
    target:number;visited:number[];points:SkillPoint[];index:number;direction:number;ends:number;
    weaponId?:number;heroId?:number;done?:boolean;
}
export function validHeroSkill(value:HeroSkillState){
    return value&&Number.isInteger(value.id)&&Number.isInteger(value.unit)&&[0,1].includes(value.side)&&Number.isInteger(value.cell)&&value.cell>=0&&value.cell<80&&HERO_SKILLS[value.hero]?.kind===value.kind&&
        Number.isInteger(value.level)&&value.level>=1&&value.level<=5&&[value.born,value.next,value.phase,value.count,value.damage,value.range,value.rate,value.x,value.y,value.fromX,value.fromY,value.toX,value.toY,value.target,value.index,value.direction,value.ends].every(Number.isFinite)&&
        value.rate>0&&value.damage>0&&(value.heroId===undefined||Number.isInteger(value.heroId)&&value.heroId>0)&&Number.isInteger(value.phase)&&value.phase>=0&&value.phase<=3&&Number.isInteger(value.count)&&value.count>=0&&value.count<=7&&Array.isArray(value.visited)&&value.visited.length<=200&&value.visited.every(Number.isInteger)&&Array.isArray(value.points)&&value.points.length<=400&&value.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
}
export function quadraticPose(start:SkillPoint,end:SkillPoint,progress:number,arc:number){
    const t=Math.max(0,Math.min(1,progress)),u=1-t;return {x:start.x+(end.x-start.x)*t,y:u*u*start.y+2*u*t*((start.y+end.y)/2-arc)+t*t*end.y};
}
export function shoutRing(elapsed:number,rate:number,range:number,index:number){
    const t=(elapsed-.5)*rate-index*.1,r=range/80;
    if(t<0||t>=.4)return {scale:0,alpha:0};
    return {scale:r*(t<.3?.75*t/.3:.75+.25*(t-.3)/.1),alpha:t<.3?.7:.7*(1-(t-.3)/.1)};
}
