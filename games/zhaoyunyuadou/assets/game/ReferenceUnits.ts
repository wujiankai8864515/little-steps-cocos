/** Declarative frame/attack facts from the public native data, not its runtime. */
export type BasicKind='刀'|'弓'|'枪'|'骑';
export const BASIC_GROWTH=[1,1.5,2.1,2.73,3.4125] as const;
export const HERO_DAMAGE_GROWTH=[1,1.5,2.1,2.73,3.276] as const;
export const HERO_SPEED_GROWTH=[1,1.3,1.56,1.794,1.9734] as const;
export const FARM_INTERVALS=[20,10,5,3,2] as const;
export const BASIC_UNITS={
    '刀':{folder:'soldier_0',offset:[-33,-30],idleFrames:7,idleDuration:.667,attackFrames:19,attackDuration:.6,initialRate:1,release:.5,target:'nearest',damageType:'单体'},
    '弓':{folder:'soldier_1',offset:[5,13],idleFrames:7,idleDuration:.667,attackFrames:30,attackDuration:1,initialRate:1.25,release:.52,target:'closest_end',damageType:'单体'},
    '枪':{folder:'soldier_2_zh',offset:[30,5],idleFrames:8,idleDuration:.667,attackFrames:21,attackDuration:.667,initialRate:1,release:.36,target:'nearest',damageType:'贯穿'},
    '骑':{folder:'soldier_3_zh',offset:[-95,-108],idleFrames:6,idleDuration:.6,attackFrames:19,attackDuration:.6,initialRate:1,release:.15,target:'nearest',damageType:'范围'},
} as const;
export function isBasicKind(kind:string):kind is BasicKind{return Object.prototype.hasOwnProperty.call(BASIC_UNITS,kind);}
export class UnitFramePlayer{
    clip:'zhan'|'attack'='zhan';elapsed=0;seenAttacks:number;
    constructor(public kind:BasicKind,attacks=0){this.seenAttacks=attacks;}
    reset(attacks:number){this.clip='zhan';this.elapsed=0;this.seenAttacks=attacks;}
    advance(dt:number,attacks:number,interval:number,engaged=false){
        const spec=BASIC_UNITS[this.kind];
        if(attacks!==this.seenAttacks){this.seenAttacks=attacks;this.clip='attack';this.elapsed=0;}
        const rate=spec.initialRate*(this.clip==='attack'?.8/Math.max(.001,interval):1);
        this.elapsed+=Math.max(0,dt)*rate;
        if(this.clip==='attack'&&this.elapsed>=spec.attackDuration){
            if(engaged)this.elapsed=spec.attackDuration;
            else{this.elapsed=0;this.clip='zhan';}
        }
        const length=this.clip==='zhan'?spec.idleDuration:spec.attackDuration,count=this.clip==='zhan'?spec.idleFrames:spec.attackFrames;
        if(this.clip==='zhan')this.elapsed%=length;
        // Bow plays 0–650 ms, then 650–1000 ms. Native segments include
        // both boundary frames (0..19 and 19..29), so sample each separately.
        const index=this.clip==='attack'&&this.kind==='弓'
            ?this.elapsed<.65?Math.min(19,Math.floor(this.elapsed/.65*20)):Math.min(29,19+Math.floor((this.elapsed-.65)/.35*11))
            :Math.min(count-1,Math.floor(this.elapsed/length*count));
        return 'resources/img/gameObject/soldier/anim/'+spec.folder+'/skeleton-'+this.clip+'_'+(this.clip==='attack'?String(index).padStart(2,'0'):index)+'.png';
    }
}
