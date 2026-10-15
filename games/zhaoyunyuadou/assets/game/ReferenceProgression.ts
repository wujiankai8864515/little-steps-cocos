/** Native progression facts, read as inert data from the public reference.
 * These thresholds are experience totals; attack interval `xp` is unrelated. */
export const MAJOR_EXPERIENCE=[0,10,35,75,130] as const;
export const MINOR_EXPERIENCE=[0,8,23] as const;
const major=new Set(['赵云','张飞','马超','关羽','黄忠','刘备']);
export function heroLevelCap(name:string){return major.has(name)?5:3;}
export function heroExperienceTable(name:string):readonly number[]{return major.has(name)?MAJOR_EXPERIENCE:MINOR_EXPERIENCE;}
export function validExperience(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER;}
export function partExperience(level:number){return MAJOR_EXPERIENCE[Math.max(0,Math.min(4,Math.floor(level)-1))];}
export function experienceLevel(name:string,experience:number){
    const table=heroExperienceTable(name);let level=1;for(let i=1;i<table.length;i++)if(experience>=table[i])level=i+1;return level;
}
/** Feeding uses the major-table interval even for a minor general. */
export function feedExperience(level:number){return level>=1&&level<5?MAJOR_EXPERIENCE[level]-MAJOR_EXPERIENCE[level-1]:0;}
export function characterLevelCap(char:string){return Array.from(major).some(name=>name.includes(char))?5:3;}
export function trainingDelta(level:number,roll:number){return level<3||roll<=(level===3?.7:.6)?1:-1;}
export interface HeroProgress {
    id:number;side:0|1;left:number;leftUnit:number;rightUnit:number;name:string;
    level:number;experience:number;
    /** Applied to this formation; part records may change independently when fed. */
    speedBonus?:number;rangeBonus?:number;
}
export function validHeroProgress(value:HeroProgress,names:readonly string[]){
    return value&&Number.isSafeInteger(value.id)&&value.id>0&&value.id<Number.MAX_SAFE_INTEGER&&[0,1].includes(value.side)&&Number.isInteger(value.left)&&value.left>=0&&value.left<79&&value.left%8<7&&
        Number.isSafeInteger(value.leftUnit)&&value.leftUnit>0&&Number.isSafeInteger(value.rightUnit)&&value.rightUnit>0&&value.leftUnit!==value.rightUnit&&names.includes(value.name)&&
        Number.isInteger(value.level)&&value.level>=1&&value.level<=5&&validExperience(value.experience);
}
export interface DamageOwner {side:0|1;hero:boolean;heroId?:number;}
/** Only generals enter the native contributor list. A general kill removes the
 * killer before dividing .5 among the other contributors. A non-general kill
 * divides .2 among the contributors. Destroyed generals remain in the divisor. */
export function experienceAwards(owner:DamageOwner|undefined,contributors:readonly number[]){
    if(!owner)return [] as {id:number;experience:number}[];
    const ids=Array.from(new Set(contributors.filter(id=>Number.isInteger(id)&&id>0))),awards:{id:number;experience:number}[]=[];
    if(owner.hero&&owner.heroId){awards.push({id:owner.heroId,experience:1});const i=ids.indexOf(owner.heroId);if(i>=0)ids.splice(i,1);}
    const share=(owner.hero?.5:.2)/ids.length;
    for(const id of ids)awards.push({id,experience:share});return awards;
}
