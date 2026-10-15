/** ZYA-02: deterministic game rules, independent of Cocos and wall-clock timers. */
import { REFERENCE_MAPS } from './ReferenceMaps';
import { BOSSES, BOSS_CHANCES, BOSS_ROUNDS, EARLY_HEALTH, WAVE_COUNTS, WAVE_HEALTH } from './ReferenceCombat';
import { BASIC_UNITS, BASIC_GROWTH, BasicKind, FARM_INTERVALS, HERO_DAMAGE_GROWTH, HERO_SPEED_GROWTH, isBasicKind } from './ReferenceUnits';
import { weaponBusyDuration, weaponPlaybackRate, WeaponType } from './ReferenceWeapons';
import { advanceFlight, createFlight, enemyInRange, Flight, strikeOverlaps, StrikePlan, strikeShape, weaponStrikePlans } from './ReferenceWeaponCombat';
import { HERO_SKILLS, HeroSkillState, hitPassive, huangZhongArrows, huangZhongGrowth, quadraticPose, shoutRing, skillRate, SkillProjectile, validHeroSkill, validSkillProjectile } from './ReferenceHeroSkills';
import { characterLevelCap, DamageOwner, experienceAwards, experienceLevel, feedExperience, HeroProgress, heroExperienceTable, heroLevelCap, partExperience, trainingDelta, validExperience, validHeroProgress } from './ReferenceProgression';
import { CrossbowFireArrow, CrossbowVolley, crossbowFireHitBox, crossbowVolleyAngle, validCrossbowFire, validCrossbowVolley, ArrowBurn, BirdArrowKind, BirdArrowState, birdArrowDamage, birdArrowHitBox, birdArrowOrigin, birdArrowSpec, FlyingPikeTiming, flyingPikeChance, flyingPikeTiming, GroundPikeState, groundPikeRule, groundPikeSpikes, validArrowBurn, validBirdArrow, validFlyingPike, validGroundPike } from './ReferenceSpecialWeapons';
export type Side = 0 | 1; // 0 player, 1 computer opponent
export type UnitKind = '刀' | '弓' | '枪' | '骑' | '农' | '字' | '铲';
export interface Unit { id: number; kind: UnitKind; char: string; level: number; cooldown: number; attacks: number; experience?:number;idleAt?:number; weaponUntil?:number; weaponAt?:number; weaponRate?:number; weaponAim?:number; crossbowCount?:number; crossbowVolley?:CrossbowVolley; skillCount?:number;skillResume?:boolean;chain?:number; target?:number; attackX?:number;attackY?:number;streak?:number; seen?:number[]; speedBuff?:number; speedUntil?:number; debuff?:string; debuffLevel?:number; debuffUntil?:number; }
export interface Hero { name: string; chars: string; weaponType: number; range: number; power: number; speed: number; rarity: number; skill: string; }
export interface HeroLink {hero:Hero;left:number;right:number;level:number;id:number;experience:number;maxLevel:number;}
export const GLYPHS = '赵云张飞马超关羽平兴黄忠苞翼盖祖甄宓刘备';
export const HEROES: Hero[] = [
    { name:'赵云',chars:'赵云',weaponType:1,range:200,power:2,speed:.8,rarity:2,skill:'七进七出' },
    { name:'张飞',chars:'张飞',weaponType:1,range:200,power:10,speed:1,rarity:4,skill:'大喝' },
    { name:'马超',chars:'马超',weaponType:1,range:200,power:10,speed:1,rarity:4,skill:'晕眩' },
    { name:'关羽',chars:'关羽',weaponType:2,range:200,power:20,speed:1,rarity:4,skill:'跳斩' },
    { name:'黄忠',chars:'黄忠',weaponType:0,range:360,power:6,speed:.8,rarity:4,skill:'火箭烈' },
    { name:'关平',chars:'关平',weaponType:2,range:200,power:3,speed:1,rarity:3,skill:'大喝' },
    { name:'关兴',chars:'关兴',weaponType:2,range:200,power:7,speed:1,rarity:3,skill:'晕眩' },
    { name:'张苞',chars:'张苞',weaponType:1,range:200,power:7,speed:1,rarity:3,skill:'晕眩' },
    { name:'张翼',chars:'张翼',weaponType:3,range:200,power:7,speed:1,rarity:3,skill:'跳斩' },
    { name:'黄盖',chars:'黄盖',weaponType:3,range:200,power:8,speed:1,rarity:3,skill:'无技能' },
    { name:'刘备',chars:'刘备',weaponType:3,range:200,power:10,speed:.8,rarity:4,skill:'圣剑' },
    { name:'黄祖',chars:'黄祖',weaponType:0,range:280,power:6,speed:.8,rarity:2,skill:'箭雨' },
];
export interface Weapon { id: number; type: number; txt: string; rarity: number; addAttPower: number; intro: string; fragmentNum: number; exclusive?: string; }
export interface Item { id: string; name: string; active: boolean; rarity: number; price: number; image: string; description: string; cooldown?: number; }
/** Names, icons and timings use the public reference data. Recruit price/rarity
 * follow the older WeChat screenshot pinned in docs, which differs from Android. */
export const ITEMS: Item[] = [
    {id:'brush',name:'毛笔',active:true,rarity:2,price:50,image:'writingBrush_1_zh',description:'主动:可以逆天改字',cooldown:30},
    {id:'training',name:'练兵符',active:true,rarity:2,price:60,image:'trainingSpell_1_zh',description:'主动:拖到单位上有概率升一级或降一级',cooldown:65},
    {id:'god',name:'神兵符',active:true,rarity:3,price:90,image:'upLvlSpell_1_zh',description:'主动:拖到单位上升一级',cooldown:55},
    {id:'bun',name:'包子',active:true,rarity:1,price:50,image:'lifePill_1',description:'主动:55%概率给阿斗续一条命，45%概率减少一条命',cooldown:90},
    {id:'range',name:'御敌千里',active:true,rarity:0,price:30,image:'longRange_1',description:'主动:使远程单位攻击范围翻倍，全局生效',cooldown:60},
    {id:'ink',name:'砚台',active:true,rarity:0,price:30,image:'inkstone_1',description:'主动:泼出墨汁，使敌方部队攻速缓慢，持续5秒',cooldown:90},
    {id:'trap',name:'陷阱',active:true,rarity:0,price:35,image:'trap_1',description:'主动:敌人掉下去一时会爬不出来',cooldown:50},
    {id:'mine',name:'地雷',active:true,rarity:1,price:50,image:'landmine_1',description:'主动:可炸死敌人',cooldown:55},
    {id:'speed',name:'攻速符',active:true,rarity:2,price:80,image:'attSpeedSpell_1_zh',description:'主动:单位攻速+40%，全局生效',cooldown:90},
    {id:'exorcism',name:'降妖符',active:false,rarity:2,price:80,image:'exorcismSpell_1_zh',description:'被动:boss施法有50%失败率，并反噬自身血量'},
    {id:'farmer',name:'农民',active:false,rarity:2,price:90,image:'farmer_1_zh',description:'被动:可以刷出农民，每20秒+1金币，升级生产速度翻倍'},
    {id:'recruit',name:'招贤榜',active:false,rarity:1,price:60,image:'recruit_1_zh',description:'被动:武将刷出概率x2'},
    {id:'allSpeed',name:'攻速符(全体)',active:false,rarity:1,price:60,image:'allAttSpeedSpell_1_zh',description:'被动:双方所有单位攻速+10%，全局生效'},
    {id:'together',name:'齐头并进',active:false,rarity:2,price:90,image:'goingHandInHand_1_zh',description:'被动:我方攻速+50%，对方攻速+30%，全局生效'},
    {id:'pill',name:'续命丹',active:false,rarity:0,price:50,image:'xuMingPill_1_zh',description:'被动:我方阿斗+5条命，对方阿斗+3条命'},
    {id:'life',name:'大补丸',active:false,rarity:0,price:40,image:'daBuPill_1',description:'被动:我方阿斗+3条命'},
    {id:'silt',name:'淤泥',active:false,rarity:0,price:40,image:'silt_1',description:'被动:我方敌人移速-10%，全局生效'},
    {id:'shovel',name:'洛阳铲',active:false,rarity:3,price:120,image:'superShovel_1',description:'被动:每60秒生成一个铲子'},
    {id:'meteor',name:'陨石',active:false,rarity:3,price:150,image:'meteor_1',description:'被动:敌人接近阿斗时，落下陨石消灭敌人'},
    {id:'trash',name:'垃圾桶',active:true,rarity:3,price:150,image:'trashCan_1',description:'主动:1馒头回收无用文字',cooldown:0},
    {id:'promotion',name:'升职令',active:false,rarity:1,price:100,image:'promotionOrder_1_zh',description:'被动:刷出的兵有5%概率升到2级'},
    {id:'march',name:'行军丹',active:false,rarity:0,price:40,image:'marchPill_1',description:'体力+10'},
    {id:'seeker',name:'摸金校尉',active:false,rarity:3,price:150,image:'goldSeeker_1',description:'被动:所有铲子变成金铲子，铲出宝箱'},
];
export interface MapSpec { id: number; name: string; grass: number[]; initial: number[]; owners: Side[]; paths: [number[], number[]]; divideY: number;divideWidth:number;divideHeight:number; entries: number[]; }
const idx = (x: number, y: number) => y * 8 + x;
function line(x0: number, y0: number, x1: number, y1: number) {
    const out: number[] = []; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) out.push(idx(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n));
    return out;
}
function path(points: number[][]) {
    const out: number[] = [];
    for (let i = 1; i < points.length; i++) out.push(...line(...points[i - 1] as [number, number], ...points[i] as [number, number]).slice(i === 1 ? 0 : 1));
    return out;
}
function referenceMap(raw: typeof REFERENCE_MAPS[number]): MapSpec {
    const grass:number[]=[],initial:number[]=[],owners:Side[]=[],entries:number[]=[];
    for(let y=0;y<10;y++)for(let x=0;x<8;x++) {
        const [kind,side]=raw.grid[x][y].split('_').map(Number),cell=idx(x,y);owners[cell]=side as Side;
        if(kind>0)grass.push(cell);if(kind===1)initial.push(cell);
    }
    const paths:number[][]=[];
    for(const side of [0,1]) {
        const a=raw.spawn[side],z=raw.end[side],start=idx(a.x,a.y),end=idx(z.x,z.y);
        const queue=[start],previous=new Map<number,number>();previous.set(start,-1);
        for(let cursor=0;cursor<queue.length&&!previous.has(end);cursor++) {
            const cell=queue[cursor],x=cell%8,y=Math.floor(cell/8);
            for(const [nx,ny]of [[x,y-1],[x+1,y],[x,y+1],[x-1,y]]) {
                if(nx<0||nx>7||ny<0||ny>9)continue;const next=idx(nx,ny);
                if(raw.grid[nx][ny]!=='0_'+side||previous.has(next))continue;previous.set(next,cell);queue.push(next);
            }
        }
        const walk:number[]=[];let cell=end;
        if(!previous.has(end))throw new Error('Reference road is disconnected');
        while(cell!==-1){walk.unshift(cell);cell=previous.get(cell)!;}
        const entry=raw.entry[side];entries.push(idx(entry.x,entry.y));if(entries[side]!==walk[0])walk.unshift(entries[side]);paths.push(walk);
    }
    const divider=[[304,640,184],[365,659,44],[384,640,23],[368,644,50]][raw.id];
    return {id:raw.id,name:['巨鹿','云梦泽','虎牢关','赤壁'][raw.id],grass,initial,owners,entries,paths:paths as [number[],number[]],divideY:divider[0],divideWidth:divider[1],divideHeight:divider[2]};
}
export const MAPS: MapSpec[] = REFERENCE_MAPS.map(referenceMap);
export interface Profile {
    version: 1; gold: number; stamina: number; staminaAt: number; day: number; stars: number;
    wins: number; losses: number; bestWave: number; tutorial: boolean; avatar: number;
    items: string[]; weapons: Record<string, number>; fragments: Record<string, number>;
    equipped: Record<string, number>; settings: { music: number; sound: number; damage: boolean; vibration: boolean; };
    rewards: string[];
    uid:number; itemLevels:Record<string,number>;
    marketSold:string; daily:{gift:boolean;stamina:boolean;lottery:boolean};
}
export function dayKey(now: number) { return Math.floor((now + 8 * 3600_000) / 86400_000); }
export function newProfile(now = Date.now()): Profile {
    return { version: 1, gold: 0, stamina: 30, staminaAt: now, day: dayKey(now), stars: 1,
        wins: 0, losses: 0, bestWave: 0, tutorial: false, avatar: 1, items: [], weapons: {}, fragments: {}, equipped: {},
        settings: { music: 0.5, sound: 0.7, damage: true, vibration: true }, rewards: [],uid:Math.floor(now)%100000000,itemLevels:{},marketSold:'',daily:{gift:false,stamina:false,lottery:false} };
}
export function restoreProfile(text: string | null, now = Date.now()): Profile {
    const base = newProfile(now); if (!text) return base;
    try {
        const raw = JSON.parse(text);
        if (raw.version !== 1 || !Number.isFinite(raw.gold) || !Number.isFinite(raw.stamina)) return base;
        Object.assign(base, raw); base.settings = Object.assign({}, newProfile(now).settings, raw.settings);
        for (const key of ['gold','wins','losses','stars','bestWave'] as const) base[key] = Math.max(0, Math.floor(Number(base[key]) || 0));
        base.stamina = Math.min(30, Math.max(0, Math.floor(base.stamina)));
        base.items = Array.from(new Set<string>((Array.isArray(base.items) ? base.items : []).filter(id => ITEMS.some(item => item.id === id))));
        if(!Number.isInteger(base.uid)||base.uid<0)base.uid=newProfile(now).uid;
        if(!base.itemLevels||typeof base.itemLevels!=='object')base.itemLevels={};
        base.daily=Object.assign({},newProfile(now).daily,raw.daily||{});if(typeof base.marketSold!=='string')base.marketSold='';
        base.rewards = Array.isArray(base.rewards) ? base.rewards.filter(id => typeof id === 'string').slice(-64) : [];
        for (const key of ['weapons','fragments','equipped'] as const) if (!base[key] || typeof base[key] !== 'object' || Array.isArray(base[key])) base[key] = {};
        if (!Number.isFinite(base.staminaAt) || base.staminaAt > now) base.staminaAt = now;
        refreshProfile(base, now); return base;
    } catch (_) { return base; }
}
export function refreshProfile(p: Profile, now = Date.now()) {
    const elapsed = Math.floor(Math.max(0, now - p.staminaAt) / 300_000);
    if (elapsed > 0) { p.stamina = Math.min(30, p.stamina + elapsed); p.staminaAt += elapsed * 300_000; }
    if (p.stamina === 30) p.staminaAt = now;
    const day = dayKey(now); if (day > p.day) { p.day = day; p.items = [];p.itemLevels={};p.daily={gift:false,stamina:false,lottery:false};p.marketSold=''; }
}
export function rankName(stars: number) {
    const names = ['军士','校尉','少将','中将','上将','大将','元帅','诸侯','霸主','君主','皇帝'];
    const digits = ['一','二','三','四','五'];
    return names[Math.min(10, Math.floor(Math.max(0, stars - 1) / 25))] + '.' + digits[Math.floor(Math.max(0, stars - 1) / 5) % 5];
}
export class Random {
    constructor(public state: number) { this.state = this.state >>> 0 || 1; }
    next() { let x = this.state; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state = x >>> 0; return this.state / 4294967296; }
    pick<T>(items: T[]) { return items[Math.floor(this.next() * items.length)]; }
}
export interface Army { units: Record<number, Unit>; unlocked: number[]; reserve: (Unit | null)[]; food: number; recruitCount: number; lives: number; maxLives: number; }
export interface Enemy { id: number; side: Side; progress: number; hp: number; maxHp: number; speed: number; boss: boolean; slowed: number; x: number; y: number; held?:number; moveDebuffUntil?:number;moveDebuff?:number;knocked?:number;contributors?:number[];experienceSettled?:boolean;lootSettled?:boolean; bossType?:number; castIn?:number; burn?:ArrowBurn;push?:{x:number;y:number};rejoin?:number; }
export interface Shot { id: number; side: Side; from: number; target: number; x: number; y: number; damage: number; speed: number; kind: string; splash: number; weaponId?:number; hero?:string;heroId?:number; visited?:number[]; flight?:Flight; flyingPike?:FlyingPikeTiming; bird?:BirdArrowState; crossbowFire?:CrossbowFireArrow; motion?:SkillProjectile; skill?:boolean;rotation?:number;width?:number;height?:number;anchorX?:number;anchorY?:number; }
export interface Effect { id: number; kind: string; x: number; y: number; text?: string; ttl: number; duration: number; side: Side; piercing?:GroundPikeState; }
export interface Location { area: 'board' | 'reserve'; index: number; }
export interface PendingAttack {unit:number;side:Side;cell:number;kind:BasicKind;target:number;ttl:number;damage:number;range:number;x:number;y:number;targetX:number;targetY:number;}
export interface WeaponStrike extends StrikePlan {id:number;unit:number;side:Side;cell:number;hero:string;heroId?:number;weaponId?:number;target:number;damage:number;born:number;visited:number[];done?:boolean;procStarted?:boolean;birdKind?:BirdArrowKind;birdAnimationAt?:number;fireArrowBorn?:number;}
export interface BattleResult { id: string; win: boolean; reward: number; wave: number; weaponId: number | null; weaponFragments?:number;weaponRequired?:number; }
export class Battle {
    readonly map: MapSpec;
    readonly random: Random;
    armies: [Army, Army]; enemies: Enemy[] = []; shots: Shot[] = []; effects: Effect[] = [];
    pendingAttacks:PendingAttack[]=[];
    weaponStrikes:WeaponStrike[]=[];
    heroSkills:HeroSkillState[]=[];
    heroProgress:HeroProgress[]=[];
    time = 0; wave = 1; waveTime = 0; paused = false; completed = false; result: BattleResult | null = null;
    tutorialStep = 0; revision = 0; nextId = 1; spawnTime = 4; spawned = 0; aiTime = 1.5;
    boosts: Record<number, number> = {}; ranges: Record<number, number> = {}; cooldowns: Record<string, number> = {}; aiSilence = 0;
    hazards: {cell:number;kind:string;ttl:number}[]=[]; shovelTime=60; meteorTime=0;
    companions:Record<number,{level:number;cooldown:number;side:Side;cell:number}>= {};
    bossRound=false; haze=0;
    projectileHeight=1386;
    kills = 0; merges = 0; deployed = 0; private accumulator = 0; private saveId: string;
    constructor(public profile: Profile, public weapons: Weapon[], mapId: number, seed: number, tutorial = false) {
        this.map = MAPS[mapId] || MAPS[0]; this.random = new Random(seed);
        this.saveId = Date.now().toString(36) + '-' + seed.toString(36);
        this.armies = [this.makeArmy(0), this.makeArmy(1)]; this.tutorialStep = tutorial ? 1 : 0;
        // The public first-round tutorial already has 骑、枪、刀 in the rival's
        // first three plots while the player learns to recruit and deploy.
        if(tutorial){const kinds:UnitKind[]=['骑','枪','刀'];this.armies[1].unlocked.slice(0,3).forEach((cell,i)=>this.armies[1].units[cell]=this.unit(kinds[i]));}
    }
    owns(side: Side, cell: number) {
        return this.map.owners[cell] === side;
    }
    private makeArmy(side: Side): Army {
        const lives = Math.min(9,3+(this.has('pill')?(side===0?5:3):0)+(side===0&&this.has('life')?3:0));
        return { units: {}, unlocked: this.map.initial.filter(n => this.owns(side, n)), reserve: [null,null,null,null,null],
            food: 20, recruitCount: 0, lives, maxLives: lives };
    }
    has(id: string) { return this.profile.items.includes(id); }
    cost(side: Side = 0) { return 10 + this.armies[side].recruitCount * 2; }
    unit(kind: UnitKind, char: string = kind, level = 1): Unit { return { id: this.nextId++, kind, char, level, cooldown: kind === '农' ? FARM_INTERVALS[level-1] : 0, attacks: 0,idleAt:this.time,...(kind==='字'?{experience:partExperience(level)}:{}) }; }
    private changeLevel(unit:Unit,level:number){
        const previous=unit.level;unit.level=Math.max(1,Math.min(5,level));
        if(unit.kind==='字')unit.experience=partExperience(unit.level);
        // Native farming keeps accumulated work while its level changes the
        // production threshold, rather than restarting a full harvest cycle.
        if(unit.kind==='农')unit.cooldown=Math.max(0,unit.cooldown+FARM_INTERVALS[unit.level-1]-FARM_INTERVALS[previous-1]);
    }
    draw(side: Side): Unit {
        const v = this.random.next();
        const heroRate = side === 0 && this.has('recruit') ? 0.38 : 0.19;
        if (v < 0.1) return this.unit('铲');
        if (v < 0.1 + heroRate) return this.unit('字', this.random.pick(GLYPHS.split('')));
        if (side === 0 && this.has('farmer') && v > 0.9) return this.unit('农');
        const level = side === 0 && this.has('promotion') && this.random.next() < 0.05*(this.profile.itemLevels.promotion||1) ? 2 : 1;
        const kind = this.random.pick<UnitKind>(['刀','枪','弓','骑']); return this.unit(kind, kind, level);
    }
    recruit(side: Side = 0): string {
        if (this.completed || this.paused) return '暂停中';
        const army = this.armies[side], free = army.reserve.indexOf(null);
        if (free < 0) return '营地已满，请先部署或合成';
        const cost = this.cost(side); if (army.food < cost) return '馒头不足';
        army.food -= cost; army.recruitCount++;
        // The first observed tutorial roll is fixed; subsequent rolls use the seeded pool.
        army.reserve[free] = this.tutorialStep === 1 && side === 0 ? this.unit('弓') : this.draw(side);
        if (side === 0 && this.tutorialStep === 1) this.tutorialStep = 2;
        this.revision++; return '';
    }
    get(location: Location, side: Side = 0) { return location.area === 'reserve' ? this.armies[side].reserve[location.index] : this.armies[side].units[location.index]; }
    private set(location: Location, unit: Unit | null, side: Side) {
        if (location.area === 'reserve') this.armies[side].reserve[location.index] = unit;
        else if (unit) this.armies[side].units[location.index] = unit;
        else delete this.armies[side].units[location.index];
    }
    private partSpeed(unit:Unit){const value=this.boosts[unit.id];return Number.isFinite(value)&&value>0?value:0;}
    private partRange(unit:Unit){const value=this.ranges[unit.id];return Number.isFinite(value)&&value>1?value-1:0;}
    private inheritPermanent(source:Unit,target:Unit){
        const speed=this.partSpeed(source),range=this.partRange(source);
        if(speed)this.boosts[target.id]=this.partSpeed(target)+speed;
        // Native oD stores all character records, but an ordinary soldier's
        // existing range grant suppresses a second immediate range application.
        if(range&&(target.kind==='字'||!this.partRange(target)))this.ranges[target.id]=1+this.partRange(target)+range;
        delete this.boosts[source.id];delete this.ranges[source.id];
    }
    move(from: Location, to: Location, side: Side = 0): string {
        if (this.completed || this.paused) return '暂停中';
        if (from.area === to.area && from.index === to.index) return '';
        if (!Number.isInteger(to.index) || (to.area === 'reserve' && (to.index < 0 || to.index >= 5))) return '不能放在这里';
        const unit = this.get(from, side); if (!unit) return '';
        const army = this.armies[side];
        if (to.area === 'board') {
            if (!this.owns(side, to.index) || !this.map.grass.includes(to.index)) return '只能部署在己方格子上';
            if (!army.unlocked.includes(to.index)) {
                if (unit.kind !== '铲') return '拖入铲子开垦这个格子';
                army.unlocked.push(to.index); this.set(from, null, side);
                if (side === 0 && this.has('seeker')) { this.profile.gold += 3; army.food += 8; this.effect('treasure', to.index, side, '+3'); }
                this.effect('unlock', to.index, side); this.revision++; return '';
            }
            if (unit.kind === '铲') return '请把铲子拖到未开垦的格子';
        }
        const target = this.get(to, side);
        if(target?.debuff==='lock'||unit.debuff==='lock')return '暂时不能合成，请使用神兵符解除';
        const links=this.heroes(side),destination=to.area==='board'?links.find(link=>link.left===to.index||link.right===to.index):undefined;
        // A loose matching character feeds either half of a general. The
        // general keeps its identity, queued attacks and current skill.
        if(unit.kind==='字'&&destination&&destination.level<destination.maxLevel&&destination.hero.chars.includes(unit.char)&&unit.id!==army.units[destination.left].id&&unit.id!==army.units[destination.right].id){
            const source=from.area==='board'?links.find(link=>link.left===from.index||link.right===from.index):undefined;
            if(source)this.cancelHero(this.heroProgress.find(p=>p.id===source.id)!);
            this.set(from,null,side);this.addHeroExperience(this.heroProgress.find(p=>p.id===destination.id)!,feedExperience(destination.level));this.inheritPermanent(unit,target!);this.merges++;this.heroes(side);this.revision++;return '';
        }
        const affected=links.filter(link=>[link.left,link.right].some(cell=>from.area==='board'&&from.index===cell||to.area==='board'&&to.index===cell));
        for(const link of affected)this.cancelHero(this.heroProgress.find(p=>p.id===link.id)!);
        if (target && target.kind === unit.kind && target.char === unit.char && target.level === unit.level && unit.level < 5 && unit.kind !== '铲'&&unit.kind!=='字') {
            const interval=this.stats(target,undefined,target.level,side).interval;
            this.inheritPermanent(unit,target);this.changeLevel(target,target.level+1);
            if(target.kind!=='农'&&target.cooldown>0)target.cooldown=Math.max(0,target.cooldown+this.stats(target,undefined,target.level,side).interval-interval);
            this.set(from, null, side); this.merges++; this.effect('merge', to.index, side, '等级提升');
        } else {
            this.set(from, target || null, side); this.set(to, unit, side);
        }
        for(const link of this.heroes(side))if([link.left,link.right].some(cell=>from.area==='board'&&from.index===cell||to.area==='board'&&to.index===cell))army.units[link.left].idleAt=this.time;
        if (side === 0 && to.area === 'board') {
            this.deployed++; if (this.tutorialStep === 2) { this.tutorialStep = 3; this.profile.tutorial = true; }
        }
        this.revision++; return '';
    }
    private heroPairs(side:Side){
        const units = this.armies[side].units, results:{hero:Hero;left:number;right:number}[]=[];
        for (const key of Object.keys(units)) {
            const cell = Number(key), unit = units[cell], right = units[cell + 1];
            if (cell % 8 === 7 || unit.kind !== '字' || !right || right.kind !== '字') continue;
            const hero = HEROES.find(h => h.chars === unit.char + right.char);
            if (hero) results.push({ hero, left: cell, right: cell + 1 });
        }
        return results;
    }
    private cancelHero(progress:HeroProgress){
        const unit=this.armies[progress.side].units[progress.left];
        this.weaponStrikes=this.weaponStrikes.filter(s=>s.heroId!==progress.id);
        this.heroSkills=this.heroSkills.filter(s=>s.heroId!==progress.id);
        if(unit?.id===progress.leftUnit){for(const key of ['skillCount','skillResume','chain','streak','seen','target','weaponAt','weaponUntil','weaponAim','weaponRate','speedBuff','speedUntil','crossbowCount','crossbowVolley'] as const)delete unit[key];unit.cooldown=0;unit.idleAt=this.time;}
        this.heroProgress=this.heroProgress.filter(p=>p.id!==progress.id);
    }
    private newHero(side:Side,pair:{hero:Hero;left:number;right:number},legacy=false){
        const units=this.armies[side].units,left=units[pair.left],right=units[pair.right],level=Math.min(left.level,right.level),table=heroExperienceTable(pair.hero.name);
        const weapon=side===0?this.weapons.find(w=>w.id===this.profile.equipped[pair.hero.name]):undefined;
        const progress:HeroProgress={id:this.nextId++,side,left:pair.left,leftUnit:left.id,rightUnit:right.id,name:pair.hero.name,level:legacy?level:1,experience:legacy?table[Math.min(table.length-1,level-1)]:0,
            speedBonus:this.partSpeed(left)+(legacy?0:this.partSpeed(right)),rangeBonus:legacy?this.partRange(left)*this.attackRange(left,pair.hero,weapon)/pair.hero.range:this.partRange(left)+this.partRange(right)};
        this.heroProgress.push(progress);
        if(!legacy){left.attacks=0;left.cooldown=0;left.idleAt=this.time;this.addHeroExperience(progress,Math.max(validExperience(left.experience)?left.experience:partExperience(left.level),validExperience(right.experience)?right.experience:partExperience(right.level)),false);}
        return progress;
    }
    heroes(side:Side):HeroLink[]{
        const units=this.armies[side].units,pairs=this.heroPairs(side),matches=(p:HeroProgress,pair:typeof pairs[number])=>p.left===pair.left&&p.name===pair.hero.name&&p.leftUnit===units[pair.left].id&&p.rightUnit===units[pair.right].id;
        for(const progress of this.heroProgress.slice())if(progress.side===side&&!pairs.some(pair=>matches(progress,pair)))this.cancelHero(progress);
        const names=new Set(this.heroProgress.filter(p=>p.side===side).map(p=>p.name)),out:HeroLink[]=[];
        for(const pair of pairs){let progress=this.heroProgress.find(p=>p.side===side&&matches(p,pair));if(!progress){if(names.has(pair.hero.name))continue;progress=this.newHero(side,pair);names.add(pair.hero.name);}
            out.push({...pair,level:progress.level,id:progress.id,experience:progress.experience,maxLevel:heroLevelCap(pair.hero.name)});}
        return out;
    }
    private addHeroExperience(progress:HeroProgress,amount:number,visual=true){
        if(!Number.isFinite(amount)||heroLevelCap(progress.name)===3&&progress.level===3)return;
        const units=this.armies[progress.side].units,left=units[progress.left],right=units[progress.left+1];if(left?.id!==progress.leftUnit||right?.id!==progress.rightUnit)return;
        const hero=HEROES.find(h=>h.name===progress.name)!;if(left.char+right.char!==hero.chars)return;
        const previous=progress.level,oldInterval=this.stats(left,hero,previous,progress.side).interval;
        progress.experience=Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,progress.experience+amount));left.experience=right.experience=progress.experience;
        const level=experienceLevel(progress.name,progress.experience);
        if(level!==previous){progress.level=level;this.changeLevel(left,level);this.changeLevel(right,level);if(left.cooldown>0)left.cooldown=Math.max(0,left.cooldown+this.stats(left,hero,level,progress.side).interval-oldInterval);this.revision++;
            if(visual)this.effect('heroLevel',progress.left,progress.side,level>previous?'等级提升':'等级降低');}
    }
    private damageOwner(unit:number,side:Side,hero?:string,heroId?:number):DamageOwner{
        return {side,hero:!!hero,heroId:heroId??(hero?this.heroes(side).find(link=>link.hero.name===hero&&this.armies[side].units[link.left].id===unit)?.id:undefined)};
    }
    private damageEnemy(enemy:Enemy,damage:number,owner?:DamageOwner){
        if(enemy.hp<=0||!Number.isFinite(damage)||damage<=0)return false;
        if(owner?.hero&&owner.heroId){if(!enemy.contributors)enemy.contributors=[];if(!enemy.contributors.includes(owner.heroId))enemy.contributors.push(owner.heroId);}
        enemy.hp-=damage;
        if(enemy.hp<=0&&!enemy.experienceSettled){enemy.experienceSettled=true;for(const award of experienceAwards(owner,enemy.contributors||[])){const progress=this.heroProgress.find(p=>p.id===award.id&&p.side===enemy.side);if(progress)this.addHeroExperience(progress,award.experience);}}
        return true;
    }
    private collectEnemyLoot(enemy:Enemy){
        if(enemy.hp>0||enemy.lootSettled)return;enemy.lootSettled=true;
        const food=enemy.boss?20:1;this.armies[enemy.side].food+=food;if(enemy.side===0)this.kills++;
        this.effects.push({id:this.nextId++,kind:'food',x:enemy.x,y:enemy.y,text:'+'+food,ttl:.65,duration:.65,side:enemy.side});this.revision++;
    }
    private attackRange(unit:Unit,hero?:Hero,weapon?:Weapon){
        let range=hero?hero.range:unit.kind==='弓'?280:unit.kind==='枪'?200:unit.kind==='骑'?160:120;
        if(weapon){if([1,11,21,32].includes(weapon.id))range+=40;if(weapon.id===13)range+=80;if(weapon.id===8)range*=2;}
        return range;
    }
    stats(unit: Unit, hero?: Hero, level?:number, side:Side=0) {
        const progress=hero?this.heroProgress.find(p=>p.side===side&&p.name===hero.name&&(p.leftUnit===unit.id||p.rightUnit===unit.id)):undefined;
        if(progress)unit=this.armies[side].units[progress.left];
        level=level??progress?.level??unit.level;
        const weapon = hero && side===0 ? this.weapons.find(w => w.id === this.profile.equipped[hero.name]) : undefined;
        let power = hero ? hero.power : unit.kind === '刀' ? 3 : 2;
        let range=this.attackRange(unit,hero,weapon);
        if (weapon) { power += weapon.addAttPower;if(weapon.id===33)power+=3; }
        const growth=hero?.name==='黄忠'?huangZhongGrowth(level):level-1;
        power *= (hero?HERO_DAMAGE_GROWTH:BASIC_GROWTH)[growth];
        // The original xp field is an interval in seconds, not attacks/second.
        let speed=1/(hero?hero.speed:.8)*(hero?HERO_SPEED_GROWTH:BASIC_GROWTH)[growth],bonus=progress?.speedBonus??this.partSpeed(unit);
        if (this.has('together')) bonus+=side===0?.5:.3;
        if (this.has('allSpeed'))bonus+=.1;
        if((unit.speedUntil||0)>this.time)bonus+=unit.speedBuff||0;
        if(hero?.name==='关羽')bonus+=Math.min(5,unit.chain||0);
        if(weapon&&[3,6,22].includes(weapon.id))bonus+=(unit.streak||0)*(weapon.id===6?.15:.05);
        speed*=Math.max(.01,1+bonus);range+=(hero?hero.range:this.attackRange(unit))*(progress?.rangeBonus??this.partRange(unit));
        if(unit.debuff==='rain')speed*=.6;
        const weaponRate=hero?weaponPlaybackRate(hero.weaponType as WeaponType,hero.name,weapon?.id??-1,hero.speed*speed,bonus):1;
        return {power,range,interval:1/speed,weapon,weaponRate};
    }
    active(id: string, cell = -1,location:Location={area:'board',index:cell}): string {
        const item = ITEMS.find(i => i.id === id);
        if (!item?.active || !this.has(id) || this.completed || this.paused) return '道具不可用';
        if ((this.cooldowns[id] || 0) > 0) return '道具冷却中';
        if (['god','speed','training','brush','trash','range'].includes(id)) {
            if(location.area==='board'&&!this.owns(0,cell))return '拖到我方单位上使用';
            const unit = this.get(location); if (!unit||unit.kind==='铲') return '拖到我方单位上使用';
            const link=location.area==='board'?this.heroes(0).find(h=>h.left===cell||h.right===cell):undefined;
            if(id==='speed'||id==='range'){
                if(unit.kind==='农'||unit.kind==='字'&&!link)return '拖到士兵或武将上使用';
                const progress=link?this.heroProgress.find(p=>p.id===link.id)!:undefined,parts=link?[this.armies[0].units[link.left],this.armies[0].units[link.right]]:[unit];
                if(id==='range'){
                    if(unit.kind!=='弓'&&link?.hero.weaponType!==0)return '只能对远程单位使用';
                    if(link&&this.heroSkills.some(skill=>skill.heroId===link.id))return '武将技能施放中，不能使用';
                    const weapon=link?this.stats(unit,link.hero,link.level).weapon:undefined;
                    if((progress?.rangeBonus??this.partRange(unit))>0||weapon&&[1,8].includes(weapon.id))return '该单位已经有射程增益';
                    for(const part of parts)this.ranges[part.id]=2+this.partRange(part);
                    if(progress)progress.rangeBonus=(progress.rangeBonus||0)+1;
                    this.effect('skill',link?.left??cell,0,'御敌千里');
                }else{
                    const actor=parts[0],before=this.stats(actor,link?.hero,link?.level).interval;
                    for(const part of parts)this.boosts[part.id]=this.partSpeed(part)+.4;
                    if(progress)progress.speedBonus=(progress.speedBonus||0)+.4;
                    if(actor.cooldown>0)actor.cooldown=Math.max(0,actor.cooldown+this.stats(actor,link?.hero,link?.level).interval-before);
                }
            }
            else if(id==='brush'){if(unit.kind!=='字')return '毛笔只能改字牌';const choices=GLYPHS.split('').filter(char=>char!==unit.char);unit.char=this.random.pick(choices);}
            else if(id==='trash'){if(unit.kind!=='字')return '垃圾桶只回收字牌';this.set(location,null,0);this.armies[0].food++;}
            else {
                const link = location.area==='board'?this.heroes(0).find(h => h.left === cell || h.right === cell):undefined;
                const cap=link?.maxLevel||(unit.kind==='字'?characterLevelCap(unit.char):5),level=link?.level||unit.level;
                if (level >= cap) return '已满'+cap+'级';
                const delta = id === 'training'?trainingDelta(level,level<3?0:this.random.next()):1;
                if(link){const next=heroExperienceTable(link.hero.name)[Math.max(0,level+delta-1)];if(next!==undefined)this.addHeroExperience(this.heroProgress.find(p=>p.id===link.id)!,next-link.experience);}
                else{this.changeLevel(unit,Math.min(cap,unit.level+delta));this.effect('merge',cell,0,delta>0?'等级提升':'等级降低');}
            }
            this.heroes(0);
        } else if (id === 'ink') {
            this.aiSilence = 5; this.effect('ink', 20, 1);
        } else if(id==='bun') {
            const army=this.armies[0];army.lives=Math.max(1,Math.min(9,army.lives+(this.random.next()<.55?1:-1)));army.maxLives=Math.max(army.maxLives,army.lives);this.effect('hit',this.map.paths[0].slice(-1)[0],0,'续命');
        } else if(id==='trap'||id==='mine') {
            if(location.area!=='board'||!this.map.paths[0].includes(cell))return '拖到我方道路上';
            this.hazards.push({cell,kind:id,ttl:60});this.effect(id,cell,0);
        }
        this.cooldowns[id] = item.cooldown ?? 20; this.revision++; return '';
    }
    position(cell: number) { return { x: cell % 8 * 80 + 40, y: Math.floor(cell / 8) * 80 + 40 }; }
    private effect(kind: string, cell: number, side: Side, text?: string) {
        const pos = this.position(cell); this.effects.push({ id: this.nextId++, kind, x: pos.x, y: pos.y, text, ttl: 0.8, duration: 0.8, side });
        if (this.effects.length > 100) this.effects.shift();
    }
    private enemyPosition(enemy: Enemy) {
        const p = this.map.paths[enemy.side], step = Math.floor(enemy.progress / 80), t = (enemy.progress % 80) / 80;
        const a = this.position(p[Math.min(step, p.length - 1)]), b = this.position(p[Math.min(step + 1, p.length - 1)]);
        enemy.x = a.x + (b.x - a.x) * t; enemy.y = a.y + (b.y - a.y) * t;
    }
    private spawn(side: Side, boss: boolean) {
        if (this.enemies.filter(e => e.side === side).length >= 100) return;
        const played=this.profile.wins+this.profile.losses,base=WAVE_HEALTH[this.wave-1]*(played<10&&this.wave<=10?EARLY_HEALTH[played]:1);
        const bossType=boss?this.map.id*3+(Math.floor(this.wave/3)-1)%3:undefined;
        const hp=Math.ceil(base*(bossType===undefined?1:BOSSES[bossType].health));
        const enemy: Enemy = {id:this.nextId++,side,progress:0,hp,maxHp:hp,speed:boss?10:50,boss,slowed:0,x:0,y:0,bossType,castIn:bossType===undefined?undefined:BOSSES[bossType].cooldown};
        this.enemyPosition(enemy); this.enemies.push(enemy);
        return enemy;
    }
    private bossSkill(enemy:Enemy){const type=enemy.bossType;if(type===undefined)return;const boss=BOSSES[type],army=this.armies[enemy.side],cells=Object.keys(army.units).map(Number);
        if(enemy.side===0&&this.has('exorcism')&&this.random.next()<.5){this.damageEnemy(enemy,enemy.maxHp*.15);this.battleEffect('exorcism',enemy,enemy.side,'反噬');return;}
        this.battleEffect('bossSkill',enemy,enemy.side,boss.skill);
        const debuff=(cell:number,name:string,seconds=0)=>{const unit=army.units[cell];if(unit){unit.debuff=name;unit.debuffLevel=unit.level;unit.debuffUntil=seconds?this.time+seconds:0;}};
        if(type===0){for(const cell of cells.slice(0,4))debuff(cell,'chaos',5);}
        if(type===1||type===6){for(let i=0;i<(type===6?3:2);i++){const child=this.spawn(enemy.side,false);if(child){child.progress=Math.max(0,enemy.progress-80);child.speed=type===6?75:50;this.enemyPosition(child);}}}
        if(type===2){for(const mob of this.enemies)if(mob.side===enemy.side&&Math.hypot(mob.x-enemy.x,mob.y-enemy.y)<240){mob.hp*=1.25;mob.maxHp*=1.25;mob.speed*=1.1;}}
        if(type===3){const empty=army.unlocked.filter(cell=>!army.units[cell]),chosen=this.random.pick(empty);if(chosen!==undefined){army.unlocked=army.unlocked.filter(cell=>cell!==chosen);this.effect('unlock',chosen,enemy.side);}}
        if(type===4){for(const side of [0,1] as Side[])for(const unit of Object.values(this.armies[side].units)){unit.debuff='rain';unit.debuffLevel=unit.level;unit.debuffUntil=0;}}
        if(type===5){const cell=cells.sort((a,b)=>army.units[a].level-army.units[b].level)[0],other=this.armies[enemy.side===0?1:0],free=other.unlocked.find(cell=>!other.units[cell]);if(cell!==undefined&&free!==undefined){other.units[free]=army.units[cell];delete army.units[cell];}}
        if(type===7){const changed=new Set<number>();for(const cell of cells.slice(0,3)){const link=this.heroes(enemy.side).find(h=>h.left===cell||h.right===cell);if(link){if(!changed.has(link.id)){changed.add(link.id);const table=heroExperienceTable(link.hero.name);this.addHeroExperience(this.heroProgress.find(p=>p.id===link.id)!,table[Math.max(0,link.level-2)]-link.experience);}}else this.changeLevel(army.units[cell],army.units[cell].level-1);debuff(cell,'lock',8);}}
        if(type===8){const chosen=cells.find(cell=>{const p=this.position(cell);return Math.hypot(p.x-enemy.x,p.y-enemy.y)<200;});if(chosen!==undefined){delete army.units[chosen];enemy.maxHp*=1.3;enemy.hp+=enemy.maxHp*.3;}}
        if(type===9){for(const cell of cells.slice(0,2))debuff(cell,'stun');}
        if(type===10&&enemy.side===0)this.haze=5;
        if(type===11){const cell=cells.sort((a,b)=>army.units[b].level-army.units[a].level)[0];if(cell!==undefined)debuff(cell,'sealed');}
        this.heroes(0);this.heroes(1);this.revision++;
    }
    private fire(unit:Unit,side:Side,target:Enemy,pos:{x:number;y:number},power:number,kind:string,splash=0,weaponId?:number,hero?:string,flight?:{arc:number;multiplier:number;width:number;height:number;anchorX:number;anchorY:number},heroId?:number){
        if(this.shots.length>=160)return;
        if(kind==='弓'&&!hero)flight={arc:120,multiplier:1.75,width:22,height:72,anchorX:.5,anchorY:.9};
        const shot:Shot={id:this.nextId++,side,from:unit.id,target:target.id,x:pos.x,y:pos.y,damage:power,speed:kind==='eagle'?180:550,kind,splash,weaponId,hero,heroId:hero?heroId??this.damageOwner(unit.id,side,hero).heroId:undefined,visited:[],...(flight?{flight:createFlight(pos,target,flight.arc,flight.multiplier,flight.height/1.5,this.time),width:flight.width,height:flight.height,anchorX:flight.anchorX,anchorY:flight.anchorY}:{})};this.shots.push(shot);return shot;
    }
    private burst(unit:Unit,side:Side,pos:{x:number;y:number},damage:number,kind:string,count:number,hero?:string,heroId?:number){
        const link=hero?undefined:this.heroes(side).find(h=>this.armies[side].units[h.left].id===unit.id);hero=hero||link?.hero.name;heroId=heroId??link?.id;
        const pool=this.enemies.filter(e=>e.side===side&&e.hp>0).sort((a,b)=>Math.hypot(a.x-pos.x,a.y-pos.y)-Math.hypot(b.x-pos.x,b.y-pos.y));
        for(const target of pool.slice(0,count))this.fire(unit,side,target,pos,damage,kind,kind==='fire'?45:0,undefined,hero,undefined,heroId);
    }
    private battleEffect(kind:string,pos:{x:number;y:number},side:Side,text?:string){this.effects.push({id:this.nextId++,kind,x:pos.x,y:pos.y,text,ttl:.8,duration:.8,side});}
    private releaseBasicAttack(attack:PendingAttack){
        const unit=this.armies[attack.side].units[attack.cell];if(!unit||unit.id!==attack.unit||!isBasicKind(unit.kind)||['chaos','stun','sealed'].includes(unit.debuff||''))return;
        const pool=this.enemies.filter(e=>e.side===attack.side&&e.hp>0&&enemyInRange({x:attack.x,y:attack.y},attack.range,e));
        const target=pool.find(e=>e.id===attack.target)||pool.sort((a,b)=>attack.kind==='弓'?b.progress-a.progress:Math.hypot(a.x-attack.x,a.y-attack.y)-Math.hypot(b.x-attack.x,b.y-attack.y))[0];
        if(!target)return;
        if(attack.kind==='弓'){this.fire(unit,attack.side,target,{x:attack.x,y:attack.y},attack.damage,'弓');return;}
        let hit:Enemy[]=[target];
        if(attack.kind==='骑')hit=pool;
        if(attack.kind==='枪'){
            const dx=attack.targetX-attack.x,dy=attack.targetY-attack.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
            hit=pool.filter(e=>{const x=e.x-attack.x,y=e.y-attack.y,along=x*ux+y*uy;return along>=-20&&along<=attack.range&&Math.abs(x*uy-y*ux)<=25;});
        }
        for(const enemy of hit){this.damageEnemy(enemy,attack.damage,{side:attack.side,hero:false});this.effects.push({id:this.nextId++,kind:'damage',x:enemy.x,y:enemy.y-20,text:String(Math.ceil(attack.damage)),ttl:.6,duration:.6,side:attack.side});}
    }
    private weaponAttack(unit:Unit,side:Side,target:Enemy,pos:{x:number;y:number},stats:ReturnType<Battle['stats']>,hero:Hero,cell:number){
        const id=stats.weapon?.id,link=this.heroes(side).find(h=>h.left===cell&&h.hero.name===hero.name);if(!link)return;
        if(hero.name==='关羽')unit.chain=unit.target===target.id?Math.min(5,(unit.chain||0)+.05):0;
        unit.streak=unit.target===target.id?(unit.streak||0)+1:0;unit.target=target.id;
        let power=stats.power;
        if([23,27].includes(id!)&&this.random.next()<.1){for(const other of Object.values(this.armies[side].units)){const cell=Number(Object.keys(this.armies[side].units).find(key=>this.armies[side].units[Number(key)].id===other.id)),p=this.position(cell);if(Math.hypot(p.x-pos.x,p.y-pos.y)<200){other.speedBuff=id===23?.2:.3;other.speedUntil=this.time+10;}}this.battleEffect(id===27?'tiger':'roar',pos,side);}
        if(id===30&&this.random.next()<.1){power*=5;for(const e of this.enemies)if(e.side===side&&Math.hypot(e.x-target.x,e.y-target.y)<100)e.held=1.5;this.battleEffect('slam',target,side);}
        const previousAim=unit.weaponAim??0,attack=weaponStrikePlans(hero.weaponType as WeaponType,hero.name,id??-1,{x:cell%8*80,y:Math.floor(cell/8)*80},target,stats.range,stats.weaponRate,unit.attacks);unit.weaponAim=attack.aim;
        if(id===9){
            if((unit.crossbowCount||0)>=10){unit.crossbowCount=0;unit.crossbowVolley={heroId:link.id,born:this.time,aim:attack.aim,count:0,next:this.time,fromAngle:previousAim};unit.weaponUntil=this.time+2+1/30;return;}
            unit.crossbowCount=(unit.crossbowCount||0)+1;
        }else if(unit.crossbowCount!==undefined||unit.crossbowVolley)this.cancelCrossbow(unit);
        if(hero.name==='黄忠'){
            const first=attack.plans[0],count=huangZhongArrows(this.heroes(side).find(link=>link.left===cell)?.level||unit.level);attack.plans.length=0;
            for(let i=0;i<count;i++){const delta=(i-Math.floor(count/2))*10;attack.plans.push({...first,angle:first.angle+delta,endAngle:first.angle+delta});}
        }
        const birdKind:BirdArrowKind|undefined=id===8?'phoenix':id===4&&Math.floor(this.random.next()*100)<10?'eagle':undefined;
        if(birdKind){const origin=birdArrowOrigin({x:cell%8*80+40,y:Math.floor(cell/8)*80+40},attack.aim,birdKind);for(const plan of attack.plans){plan.x=origin.x;plan.y=origin.y;}}
        const delay=hero.name==='张飞'?.1/(hero.speed/stats.interval):0;
        if(this.weaponStrikes.length+attack.plans.length<=768)for(const plan of attack.plans)this.weaponStrikes.push({...plan,id:this.nextId++,unit:unit.id,side,cell,hero:hero.name,heroId:link.id,weaponId:id,target:target.id,damage:power,born:this.time+delay+plan.delay,visited:[],...(birdKind?{birdKind,birdAnimationAt:this.time}:{})});
        if(id===5&&this.random.next()<.1){this.burst(unit,side,pos,power,'fire',12);this.battleEffect('fire',target,side);}
        if(id===24&&unit.attacks%10===0)this.burst(unit,side,pos,power,'blade',12);
        if(id===28&&this.random.next()<.1)this.burst(unit,side,pos,power,'meteor',12);
        if(id!==undefined&&id>=34&&unit.attacks%10===0){const positive=(id%2===0)||id===43;this.battleEffect(positive?'sword':'coldSword',pos,side);
            if(positive)this.burst(unit,side,pos,power*(1+stats.weapon!.rarity*.3),'sword',8);else for(const enemy of this.enemies)if(enemy.side===side&&Math.hypot(enemy.x-pos.x,enemy.y-pos.y)<320){enemy.slowed=3;this.damageEnemy(enemy,power,{side,hero:true,heroId:link.id});}}
    }
    private weaponHit(shot:Shot,target:Enemy){
        const id=shot.weaponId,unit=Object.values(this.armies[shot.side].units).find(unit=>unit.id===shot.from);
        const seen=Array.isArray(unit?.seen)?unit!.seen!:[],first=unit&&!seen.includes(target.id);
        if(first){const living=new Set(this.enemies.filter(enemy=>enemy.hp>0).map(enemy=>enemy.id));unit!.seen=seen.filter(id=>living.has(id)).concat(target.id);}
        if(first&&id===26){this.profile.gold++;this.battleEffect('food',target,shot.side,'+1');}
        if(first&&[12,17].includes(id!)&&this.random.next()<=.2){
            const rule=groundPikeRule(id!,shot.hero||'')!,pool=id===12?(target.hp>0?[target]:[]):this.enemies.filter(enemy=>enemy.side===shot.side&&enemy.hp>0);
            const source=this.heroes(shot.side).find(link=>link.id===shot.heroId);
            for(let i=0;i<rule.targets&&pool.length;i++){
                const index=id===12?0:Math.floor(this.random.next()*pool.length),enemy=pool.splice(index,1)[0];
                const power=source&&shot.side===0&&this.profile.equipped[source.hero.name]===id?this.stats(this.armies[shot.side].units[source.left],source.hero,undefined,shot.side).power:shot.damage;
                const piercing:GroundPikeState={target:enemy.id,weaponId:id as 12|17,spikes:groundPikeSpikes(rule.spikes,()=>this.random.next())};
                enemy.held=Math.max(enemy.held||0,.5);this.damageEnemy(enemy,power*rule.damage,this.damageOwner(shot.from,shot.side,shot.hero,shot.heroId));
                this.effects.push({id:this.nextId++,kind:'damage',x:enemy.x,y:enemy.y-20,text:String(Math.ceil(power*rule.damage)),ttl:.6,duration:.6,side:shot.side});
                this.effects.push({id:this.nextId++,kind:'groundPike',x:enemy.x,y:enemy.y,ttl:1,duration:1,side:shot.side,piercing});
            }
        }
        if(first&&id===14&&this.random.next()<.2)target.held=2;
        if(id===25&&this.random.next()<.1)target.held=.5;
        if(id===2&&this.random.next()<.1)target.progress=Math.max(0,target.progress-80);
        if(id===7&&this.random.next()<.5){const visited=(shot.visited||[]).concat(target.id),next=this.enemies.find(e=>e.side===shot.side&&e.hp>0&&!visited.includes(e.id)&&Math.hypot(e.x-target.x,e.y-target.y)<240);if(next&&visited.length<12){shot.visited=visited;shot.target=next.id;shot.x=target.x;shot.y=target.y;if(shot.flight)shot.flight=createFlight(target,next,50,3,(shot.height||72)/1.5,this.time);return true;}}
        if(unit&&target.hp<=0){
            if(id===15){unit.speedBuff=.5;unit.speedUntil=this.time+2;}
            if(id===16)this.burst(unit,shot.side,target,shot.damage,'flower',8,shot.hero,shot.heroId);
            if(id===29)this.burst(unit,shot.side,target,shot.damage,'blade',12,shot.hero,shot.heroId);
        }
        return false;
    }
    private flyingPikes(unit:Unit,side:Side,cell:number,hero:string,heroId:number,power:number){
        const origin={x:cell%8*80+80,y:Math.floor(cell/8)*80+10};
        // Native enumeration advances even for an enemy in the other camp.
        this.enemies.forEach((target,index)=>{if(target.side!==side||target.hp<=0)return;
            const shot=this.fire(unit,side,target,origin,power*5,'flyingPike',0,19,hero,undefined,heroId);
            // pa.Ck moves 10*gS pixels per frame, gS=2; normalize the pinned
            // build's 60 FPS baseline to this model's fixed-step clock.
            if(shot)Object.assign(shot,{speed:1200,width:20,height:66,anchorX:0,anchorY:0,skill:true,flyingPike:flyingPikeTiming(this.time,index+1)});
        });
    }
    private hitShot(shot:Shot,target:Enemy){
        if(target.hp<=0)return false;
        const damage=shot.weaponId===9&&['arrow','crossbowFire'].includes(shot.kind)?this.currentShotPower(shot):shot.damage,owner=this.damageOwner(shot.from,shot.side,shot.hero,shot.heroId);this.damageEnemy(target,damage,owner);this.effects.push({id:this.nextId++,kind:'damage',x:target.x,y:target.y-20,text:String(Math.ceil(damage)),ttl:.6,duration:.6,side:shot.side});
        const passive=hitPassive(shot.hero||'',target.boss);
        if(passive&&passive.chance>0&&this.random.next()<passive.chance){target.held=Math.max(target.held||0,passive.stun);if(passive.maxHealth){const damage=target.maxHp*passive.maxHealth;this.damageEnemy(target,damage,owner);this.battleEffect('lightning',target,shot.side);this.effects.push({id:this.nextId++,kind:'damage',x:target.x,y:target.y-40,text:String(Math.ceil(damage)),ttl:.6,duration:.6,side:shot.side});}}
        if(shot.hero==='张飞'){target.moveDebuff=-.1;target.moveDebuffUntil=this.time+2;}
        if(shot.kind==='holyBlade'&&!target.boss)target.knocked=2;
        if(shot.splash>0)for(const other of this.enemies)if(other.id!==target.id&&other.hp>0&&other.side===target.side&&Math.hypot(other.x-target.x,other.y-target.y)<=shot.splash)this.damageEnemy(other,shot.damage*.45,owner);
        return shot.skill?false:this.weaponHit(shot,target);
    }
    private cancelCrossbow(unit:Unit,reset=true){
        this.weaponStrikes=this.weaponStrikes.filter(strike=>strike.unit!==unit.id||strike.fireArrowBorn===undefined);
        delete unit.crossbowVolley;if(reset)delete unit.crossbowCount;unit.weaponUntil=Math.min(unit.weaponUntil??this.time,this.time);
    }
    private advanceCrossbows(){
        for(const side of [0,1] as Side[]){const links=this.heroes(side);
            for(const unit of Object.values(this.armies[side].units)){
                if(unit.crossbowCount===undefined&&!unit.crossbowVolley)continue;
                const link=links.find(link=>this.armies[side].units[link.left].id===unit.id);
                if(!link||side!==0||this.profile.equipped[link.hero.name]!==9){this.cancelCrossbow(unit);continue;}
                const volley=unit.crossbowVolley;if(!volley)continue;
                if(volley.heroId!==link.id){this.cancelCrossbow(unit);continue;}
                if(['chaos','stun','sealed'].includes(unit.debuff||'')){this.cancelCrossbow(unit,false);continue;}
                if(this.time>volley.born+2+1e-8){delete unit.crossbowVolley;unit.weaponUntil=Math.min(unit.weaponUntil??this.time,this.time);continue;}
                if(volley.count>=10||this.time+1e-8<volley.next)continue;
                const aim=crossbowVolleyAngle(volley.aim,volley.count),angle=aim*Math.PI/180,pivot={x:link.left%8*80+40,y:Math.floor(link.left/8)*80+40};
                const target={x:pivot.x+Math.sin(angle)*1000,y:pivot.y-Math.cos(angle)*1000+(link.hero.name==='黄忠'?0:100)};
                const stats=this.stats(unit,link.hero,link.level,side),attack=weaponStrikePlans(0,link.hero.name,9,{x:pivot.x-40,y:pivot.y-40},target,stats.range,10,unit.attacks),base=attack.plans[0],count=link.hero.name==='黄忠'?huangZhongArrows(link.level):1;
                for(let i=0;i<count&&this.weaponStrikes.length<768;i++){const delta=(i-Math.floor(count/2))*10;this.weaponStrikes.push({...base,angle:aim+delta,endAngle:aim+delta,id:this.nextId++,unit:unit.id,side,cell:link.left,hero:link.hero.name,heroId:link.id,weaponId:9,target:unit.target!,damage:stats.power,born:this.time+base.delay,visited:[],fireArrowBorn:this.time});}
                volley.fromAngle=volley.drawAngle??volley.fromAngle;volley.drawAngle=aim;volley.drawAt=this.time;volley.count++;volley.next=volley.born+volley.count*.2;unit.weaponAim=aim;
            }
        }
    }
    private advanceWeaponStrikes(dt:number){
        for(const strike of this.weaponStrikes){
            if(strike.done||this.time<strike.born)continue;
            const unit=this.armies[strike.side].units[strike.cell],link=this.heroes(strike.side).find(link=>link.left===strike.cell&&link.hero.name===strike.hero);
            if(!unit||unit.id!==strike.unit||!link||link.id!==strike.heroId||['chaos','stun','sealed'].includes(unit.debuff||'')){strike.done=true;continue;}
            if(!strike.procStarted){strike.procStarted=true;if(strike.weaponId===19&&this.random.next()<=flyingPikeChance(strike.hero))this.flyingPikes(unit,strike.side,strike.cell,strike.hero,link.id,this.stats(unit,link.hero,link.level,strike.side).power);}
            const target=this.enemies.find(enemy=>enemy.id===strike.target&&enemy.hp>0);
            if(strike.kind==='arrow'||strike.kind==='throw'){
                if(strike.fireArrowBorn!==undefined){
                    const angle=strike.angle*Math.PI/180,shot=this.fire(unit,strike.side,target||{id:strike.target} as Enemy,strike,strike.damage,'crossbowFire',0,9,strike.hero,undefined,strike.heroId);
                    if(shot)Object.assign(shot,{speed:3000,width:22,height:72,anchorX:.5,anchorY:.9,rotation:strike.angle,skill:true,crossbowFire:{born:strike.fireArrowBorn,dx:Math.sin(angle),dy:-Math.cos(angle)}});
                }else if(strike.birdKind){
                    const spec=birdArrowSpec(strike.birdKind),angle=strike.angle*Math.PI/180,shot=this.fire(unit,strike.side,target||{id:strike.target} as Enemy,strike,strike.damage,strike.birdKind,0,strike.weaponId,strike.hero,undefined,strike.heroId);
                    if(shot)Object.assign(shot,{width:spec.width,height:spec.height,anchorX:spec.anchorX,anchorY:spec.anchorY,rotation:strike.angle,skill:true,bird:{kind:strike.birdKind,born:strike.birdAnimationAt!,startX:strike.x,startY:strike.y,dx:Math.sin(angle),dy:-Math.cos(angle),rate:spec.rate}});
                }else if(target){const shot=this.fire(unit,strike.side,target,strike,strike.damage,strike.kind==='throw'?'throw':'arrow',strike.weaponId===5?70:0,strike.weaponId,strike.hero,{arc:strike.arc!,multiplier:strike.projectileSpeed!,width:strike.kind==='throw'?42:22,height:strike.kind==='throw'?132:72,anchorX:strike.kind==='throw'?0:.5,anchorY:strike.kind==='throw'?.5:.9});
                    if(shot&&strike.hero==='黄忠'){const angle=strike.angle*Math.PI/180;delete shot.flight;shot.rotation=strike.angle;shot.motion={kind:'line',born:this.time,startX:shot.x,startY:shot.y,dx:Math.sin(angle),dy:-Math.cos(angle),speed:3000,expires:this.time+2};}}
                strike.done=true;continue;
            }
            const asShot=(enemy:Enemy):Shot=>({id:strike.id,side:strike.side,from:strike.unit,target:enemy.id,x:strike.x,y:strike.y,damage:strike.damage,speed:0,kind:'melee',splash:0,weaponId:strike.weaponId,hero:strike.hero,heroId:strike.heroId});
            if(strike.kind==='target'){if(target)this.hitShot(asShot(target),target);strike.done=true;continue;}
            const end=strike.born+strike.duration,start=Math.max(strike.born,this.time-dt),finish=Math.min(end,this.time);
            if(start<=finish){
                const a=strikeShape(strike,start-strike.born),b=strikeShape(strike,finish-strike.born),samples=Math.max(1,Math.ceil(Math.abs(b.angle-a.angle)/5)),visited=new Set(strike.visited);
                for(let i=0;i<=samples;i++){
                    const shape=strikeShape(strike,start-strike.born+(finish-start)*i/samples);
                    for(const enemy of this.enemies)if(enemy.side===strike.side&&enemy.hp>0&&!visited.has(enemy.id)&&strikeOverlaps(shape,enemy)){visited.add(enemy.id);strike.visited.push(enemy.id);this.hitShot(asShot(enemy),enemy);if(strike.hero==='黄盖'){strike.done=true;break;}}
                    if(strike.done)break;
                }
            }
            if(this.time>=end)strike.done=true;
        }
        this.weaponStrikes=this.weaponStrikes.filter(strike=>!strike.done);
    }
    private skillTargets(side:Side,cell:number,range:number,global=false){
        const pos=this.position(cell);pos.x+=40;
        return this.enemies.filter(e=>e.side===side&&e.hp>0&&(global||enemyInRange(pos,range,e)));
    }
    private startHeroSkill(unit:Unit,side:Side,cell:number,hero:Hero,level:number,stats:ReturnType<Battle['stats']>){
        const spec=HERO_SKILLS[hero.name];if(!spec.kind||this.heroSkills.length>=64)return false;
        const link=this.heroes(side).find(h=>h.left===cell&&h.hero.name===hero.name);if(!link)return false;
        const pool=this.skillTargets(side,cell,stats.range,true),target=pool.sort((a,b)=>b.progress-a.progress)[0];if(!target)return false;
        const pos=this.position(cell),rate=skillRate(level);unit.skillCount=0;unit.skillResume=false;
        this.effect('skill',cell,side,spec.name);
        if(spec.kind==='holyBlade'){
            const origin={x:cell%8*80,y:Math.floor(cell/8)*80},nearest=pool.sort((a,b)=>Math.hypot(a.x-pos.x-40,a.y-pos.y)-Math.hypot(b.x-pos.x-40,b.y-pos.y))[0],dx=nearest.x-40-origin.x,dy=nearest.y-40-origin.y,length=Math.hypot(dx,dy)||1;
            if(this.shots.length<160)this.shots.push({id:this.nextId++,side,from:unit.id,target:nearest.id,x:origin.x,y:origin.y,damage:5*stats.power,speed:300,kind:'holyBlade',splash:0,hero:hero.name,heroId:link.id,skill:true,visited:[],width:40,height:110,anchorX:.5,anchorY:.5,motion:{kind:'wave',born:this.time,startX:origin.x,startY:origin.y,dx:dx/length,dy:dy/length,speed:300,expires:this.time+10}});
            return true;
        }
        const skill:HeroSkillState={id:this.nextId++,unit:unit.id,side,cell,hero:hero.name,heroId:link.id,kind:spec.kind,level,born:this.time,next:this.time,phase:0,count:0,damage:stats.power,range:stats.range,rate,x:pos.x,y:pos.y,fromX:pos.x,fromY:pos.y,toX:pos.x,toY:pos.y,target:target.id,visited:[],points:[],index:0,direction:-1,ends:this.time,weaponId:stats.weapon?.id};
        if(spec.interrupt){this.weaponStrikes=this.weaponStrikes.filter(s=>s.unit!==unit.id);unit.cooldown=0;unit.weaponUntil=this.time;}
        if(skill.kind==='shout')skill.next=this.time+.5;
        if(skill.kind==='arrowRain')skill.next=this.time+.228/rate;
        if(skill.kind==='fireRain'){
            const multiple=Math.floor(Math.max(1,(level-1)/2));
            for(const cell of this.map.paths[side].slice(1)){const p=this.position(cell),n=(1+Math.floor(this.random.next()*3))*multiple;for(let i=0;i<n;i++)skill.points.push({x:p.x+Math.floor(this.random.next()*49)-24,y:p.y+Math.floor(this.random.next()*49)-24});}
            for(let i=skill.points.length-1;i>0;i--){const j=Math.floor(this.random.next()*(i+1)),p=skill.points[i];skill.points[i]=skill.points[j];skill.points[j]=p;}
            skill.next=this.time+2.85/((10+skill.points.length)*rate);
        }
        if(skill.kind==='jump')this.beginJump(skill,target);
        if(skill.kind==='phantom'){
            skill.fromX=pos.x+40;skill.x=skill.fromX;skill.points=this.map.paths[side].slice(1).map(cell=>this.position(cell));
            skill.index=this.nearestSkillPoint(skill,target);const p=skill.points[skill.index];if(!p)return false;
            skill.toX=p.x;skill.toY=p.y;skill.next=this.time+.8;
        }
        this.heroSkills.push(skill);return true;
    }
    private nearestSkillPoint(skill:HeroSkillState,pos:{x:number;y:number}){
        let index=0,distance=Infinity;skill.points.forEach((p,i)=>{const d=Math.abs(p.x-pos.x)+Math.abs(p.y-pos.y);if(d<distance){distance=d;index=i;}});return index;
    }
    private beginJump(skill:HeroSkillState,target:Enemy){
        skill.target=target.id;skill.phase=0;skill.ends=this.time;skill.fromX=skill.x;skill.fromY=skill.y;
        skill.toX=target.x+(skill.x<target.x?-80:80);skill.toY=target.y+40;skill.next=this.time+.25;skill.count++;
    }
    private finishHeroSkill(skill:HeroSkillState,unit:Unit){
        skill.done=true;const spec=HERO_SKILLS[skill.hero];
        if(spec.interrupt){unit.skillResume=!spec.replace;unit.cooldown=0;unit.idleAt=this.time;}
    }
    private skillDamage(skill:HeroSkillState,enemy:Enemy,damage:number){
        if(damage>0)this.hitShot({id:skill.id,from:skill.unit,side:skill.side,target:enemy.id,x:skill.x,y:skill.y,damage,speed:0,kind:'skillHit',splash:0,hero:skill.hero,heroId:skill.heroId,skill:true},enemy);
    }
    private advanceHeroSkills(dt:number){
        for(const skill of this.heroSkills){
            const unit=this.armies[skill.side].units[skill.cell],link=this.heroes(skill.side).find(h=>h.left===skill.cell&&h.hero.name===skill.hero);
            if(!unit||unit.id!==skill.unit||!link||link.id!==skill.heroId){skill.done=true;continue;}
            if(['chaos','stun','sealed'].includes(unit.debuff||'')){this.finishHeroSkill(skill,unit);continue;}
            if(skill.kind==='shout'){
                const ring=shoutRing(this.time-skill.born,skill.rate,skill.range,0),radius=153*ring.scale/2;
                if(radius>0)for(const enemy of this.enemies)if(enemy.side===skill.side&&enemy.hp>0&&!skill.visited.includes(enemy.id)&&enemyInRange(skill,radius,enemy)){enemy.held=Math.max(enemy.held||0,HERO_SKILLS[skill.hero].stun!);skill.visited.push(enemy.id);}
                if(this.time>=skill.born+.5+.6/skill.rate)this.finishHeroSkill(skill,unit);
            }else if(skill.kind==='arrowRain'||skill.kind==='fireRain'){
                while(!skill.done&&this.time+1e-9>=skill.next){
                    const release=skill.next,origin={x:skill.cell%8*80+40,y:Math.floor(skill.cell/8)*80+55};
                    if(skill.kind==='arrowRain'){
                        let pool=this.skillTargets(skill.side,skill.cell,skill.range);if(!pool.length)pool=this.skillTargets(skill.side,skill.cell,skill.range,true).sort((a,b)=>b.progress-a.progress).slice(0,1);
                        for(let i=0;i<10&&pool.length;i++){const target=pool.length<10?pool[i%pool.length]:this.random.pick(pool);const shot=this.fire(unit,skill.side,target,origin,skill.damage,'rainArrow',0,undefined,skill.hero,{arc:1000+this.random.next()*200,multiplier:.5,width:22,height:72,anchorX:.5,anchorY:.9});if(shot){shot.skill=true;shot.flight!.lastAt=release;}}
                        skill.count++;skill.next+=.228/skill.rate;if(skill.count===5)this.finishHeroSkill(skill,unit);
                    }else{
                        const point=skill.points[skill.index++];if(point&&this.shots.length<160)this.shots.push({id:this.nextId++,side:skill.side,from:unit.id,target:-1,x:origin.x,y:origin.y,damage:skill.damage*2,speed:1,kind:'fireRain',splash:150,hero:skill.hero,heroId:skill.heroId,skill:true,visited:[],width:22,height:72,anchorX:.5,anchorY:.9,motion:{kind:'point',born:release,startX:origin.x,startY:origin.y,dx:0,dy:0,speed:1,expires:release+1,toX:point.x,toY:point.y,arc:500+this.random.next()*250,duration:1}});
                        skill.next+=2.85/((10+skill.points.length)*skill.rate);if(skill.index>=skill.points.length)this.finishHeroSkill(skill,unit);
                    }
                }
            }else if(skill.kind==='jump'){
                if(skill.phase===1){const elapsed=this.time-skill.ends-.25,progress=elapsed<=.25/skill.rate?elapsed*skill.rate/.5:.5+(elapsed-.25/skill.rate)*2*skill.rate/.5,p=quadraticPose({x:skill.fromX,y:skill.fromY},{x:skill.toX,y:skill.toY},progress,500);skill.x=p.x;skill.y=p.y;}
                if(skill.phase===3){const elapsed=Math.max(0,this.time-skill.ends-.25),p=quadraticPose({x:skill.fromX,y:skill.fromY},{x:skill.toX,y:skill.toY},elapsed*.8*skill.rate/.5,500);skill.x=p.x;skill.y=p.y;}
                if(this.time+1e-9>=skill.next){
                    if(skill.phase===0){skill.phase=1;skill.next=skill.ends+.25+.375/skill.rate;}
                    else if(skill.phase===1){
                        skill.x=skill.toX;skill.y=skill.toY;const target=this.enemies.find(e=>e.id===skill.target&&e.hp>0);
                        // VirtualBullet.Uw is empty: the explicit landing hit is
                        // the direct hit; Oi adds distance-faded splash once.
                        for(const enemy of this.enemies)if(enemy.side===skill.side&&enemy.hp>0){const factor=Math.max(0,1-Math.hypot(enemy.x-skill.x,enemy.y-skill.y)/200);if(factor)this.skillDamage(skill,enemy,skill.damage*.5*factor);}
                        if(target&&target.hp>0)this.skillDamage(skill,target,skill.damage);
                        this.battleEffect('stomp',skill,skill.side);skill.phase=2;skill.next+=.5/skill.rate;
                    }else if(skill.phase===2){
                        const target=this.skillTargets(skill.side,skill.cell,skill.range,true).sort((a,b)=>b.progress-a.progress)[0];
                        if(skill.count<HERO_SKILLS[skill.hero].count!&&target)this.beginJump(skill,target);
                        else{skill.phase=3;skill.ends=this.time;skill.fromX=skill.x;skill.fromY=skill.y;const p=this.position(skill.cell);skill.toX=p.x;skill.toY=p.y;skill.next=this.time+.25+.625/skill.rate;}
                    }else this.finishHeroSkill(skill,unit);
                }
            }else if(skill.kind==='phantom'){
                if(skill.phase===0){const p=quadraticPose({x:skill.fromX,y:skill.fromY},{x:skill.toX,y:skill.toY},Math.max(0,this.time-skill.born-.25)/.5,500);skill.x=p.x;skill.y=p.y;
                    if(this.time>=skill.next){skill.phase=1;skill.x=skill.toX;skill.y=skill.toY;skill.ends=this.time;skill.next=this.time+.1;}}
                else{
                    let remaining=300*dt;
                    for(let step=0;remaining>0&&!skill.done&&step<16;step++){
                        const p=skill.points[skill.index];if(!p){skill.done=true;break;}const dx=p.x-skill.x,dy=p.y-skill.y,distance=Math.hypot(dx,dy);
                        if(distance<=Math.max(5,remaining)){
                            skill.x=p.x;skill.y=p.y;remaining=Math.max(0,remaining-distance);
                            if(skill.direction<0&&skill.index===0){skill.direction=1;const target=this.skillTargets(skill.side,skill.cell,skill.range,true).sort((a,b)=>b.progress-a.progress)[0];skill.target=target?this.nearestSkillPoint(skill,target):skill.index;skill.target=Math.max(1,skill.target);}
                            else if(skill.direction>0&&skill.index===skill.target){skill.count++;if(skill.count>=7){skill.done=true;break;}skill.direction=-1;}
                            skill.index+=skill.direction;
                        }else{skill.x+=dx/distance*remaining;skill.y+=dy/distance*remaining;remaining=0;}
                    }
                    if(this.time>=skill.next){skill.visited=[];skill.next+=.1;}
                    for(const enemy of this.enemies)if(enemy.side===skill.side&&enemy.hp>0&&!skill.visited.includes(enemy.id)&&Math.abs(enemy.x-skill.x)<80&&Math.abs(enemy.y-skill.y-40)<80){skill.visited.push(enemy.id);this.skillDamage(skill,enemy,skill.damage);}
                }
            }
        }
        this.heroSkills=this.heroSkills.filter(skill=>!skill.done);
    }
    private advanceSkillProjectile(shot:Shot,dt:number){
        const motion=shot.motion!,elapsed=Math.max(0,this.time-motion.born),old={x:shot.x,y:shot.y};
        if(motion.kind==='point'){
            const progress=elapsed/motion.duration!,p=quadraticPose({x:motion.startX,y:motion.startY},{x:motion.toX!,y:motion.toY!},progress,motion.arc!);shot.x=p.x;shot.y=p.y;
            if(progress>=1){for(const enemy of this.enemies)if(enemy.side===shot.side&&enemy.hp>0){const factor=Math.max(0,1-Math.hypot(enemy.x-shot.x,enemy.y-shot.y)/shot.splash);if(factor)this.hitShot({...shot,damage:shot.damage*factor,splash:0},enemy);}this.battleEffect('fire',shot,shot.side);shot.damage=0;}
        }else{
            const offset=motion.kind==='wave'?Math.sin(elapsed*10)*50:0;shot.x=motion.startX+motion.dx*motion.speed*elapsed+offset*motion.dy;shot.y=motion.startY+motion.dy*motion.speed*elapsed-offset*motion.dx;
            const dx=shot.x-old.x,dy=shot.y-old.y,length=Math.hypot(dx,dy),angle=Math.atan2(dx,-dy)*180/Math.PI;
            for(const enemy of this.enemies)if(enemy.side===shot.side&&enemy.hp>0&&!shot.visited!.includes(enemy.id)&&strikeOverlaps({x:old.x,y:old.y,angle,length:length+(shot.height||72)*.5,bold:(shot.width||22)*.5},enemy)){shot.visited!.push(enemy.id);this.hitShot(shot,enemy);}
            if(this.time>=motion.expires||shot.x<-300||shot.x>940||shot.y<-500||shot.y>1300)shot.damage=0;
        }
        if(shot.x!==old.x||shot.y!==old.y)shot.rotation=Math.atan2(shot.x-old.x,old.y-shot.y)*180/Math.PI;
    }
    private advanceShots(dt:number){
        for (const shot of this.shots) {
            if(shot.crossbowFire){this.advanceCrossbowFire(shot,dt);continue;}
            if(shot.bird){this.advanceBirdArrow(shot,dt);continue;}
            if(shot.motion){this.advanceSkillProjectile(shot,dt);continue;}
            const target = this.enemies.find(e => e.id === shot.target && e.hp > 0);
            if(shot.flight){
                const pose=advanceFlight(shot.flight,shot,target,this.time);
                if(pose.arrived){if(!target||!this.hitShot(shot,target))shot.damage=0;}
                else{shot.x=pose.x;shot.y=pose.y;shot.rotation=pose.angle;}
                continue;
            }
            if (!target) { shot.damage = 0; continue; }
            if(shot.flyingPike){
                const dx=target.x-shot.x,dy=target.y-shot.y,distance=Math.hypot(dx,dy),step=shot.speed*Math.max(0,Math.min(dt,this.time-shot.flyingPike.launch));
                shot.rotation=Math.atan2(dx,-dy)*180/Math.PI;
                if(this.time<shot.flyingPike.launch)continue;
                if(distance<=100+step){this.hitShot(shot,target);shot.damage=0;}
                else{shot.x+=dx/distance*step;shot.y+=dy/distance*step;}
                continue;
            }
            const dx = target.x - shot.x, dy = target.y - shot.y, distance = Math.hypot(dx, dy);
            if (distance <= shot.speed * dt) {
                if(!this.hitShot(shot,target))shot.damage=0;
            } else { shot.x += dx / distance * shot.speed * dt; shot.y += dy / distance * shot.speed * dt; }
        }
        this.shots = this.shots.filter(s => s.damage > 0).slice(-160);
    }
    private currentShotPower(shot:Shot){
        const owner=this.heroes(shot.side).find(link=>link.id===shot.heroId);
        return owner&&shot.side===0&&this.profile.equipped[owner.hero.name]===shot.weaponId?this.stats(this.armies[shot.side].units[owner.left],owner.hero,undefined,shot.side).power:shot.damage;
    }
    private advanceCrossbowFire(shot:Shot,dt:number){
        const arrow=shot.crossbowFire!;shot.x+=arrow.dx*shot.speed*dt;shot.y+=arrow.dy*shot.speed*dt;
        if(shot.x<-100||shot.x>740||shot.y<-100||shot.y>this.projectileHeight+100){shot.damage=0;return;}
        const target=this.enemies.find(enemy=>enemy.side===shot.side&&enemy.hp>0&&strikeOverlaps(crossbowFireHitBox(shot,arrow),enemy));
        if(target){this.hitShot(shot,target);if(target.hp>0)this.addArrowBurn(target,1,5);shot.damage=0;}
    }
    private advanceBirdArrow(shot:Shot,dt:number){
        const bird=shot.bird!;shot.x+=bird.dx*bird.rate*1000*dt;shot.y+=bird.dy*bird.rate*1000*dt;
        bird.rate=Math.min(birdArrowSpec(bird.kind).rate,bird.rate+dt);
        if(shot.x<-100||shot.x>740||shot.y<-100||shot.y>this.projectileHeight+100){shot.damage=0;return;}
        const shape=birdArrowHitBox(bird,shot),distance=Math.hypot(shot.x-bird.startX,shot.y-bird.startY);
        for(const enemy of this.enemies)if(enemy.side===shot.side&&enemy.hp>0&&!shot.visited!.includes(enemy.id)&&strikeOverlaps(shape,enemy)){
            const source=bird.kind==='phoenix'?this.heroes(shot.side).find(link=>link.id===shot.heroId):undefined;
            const power=source&&shot.side===0&&this.profile.equipped[source.hero.name]===8?this.stats(this.armies[shot.side].units[source.left],source.hero,undefined,shot.side).power:shot.damage;
            shot.visited!.push(enemy.id);this.hitShot({...shot,damage:birdArrowDamage(bird.kind,power,distance)},enemy);bird.rate=Math.max(.1,bird.rate*.2);bird.hitAt=this.time;
            if(enemy.hp>0&&bird.kind==='phoenix')this.addArrowBurn(enemy);
            if(enemy.hp>0&&bird.kind==='eagle'){const push=enemy.push||(enemy.push={x:0,y:0});push.x+=bird.dx*24;push.y+=bird.dy*24;}
        }
    }
    private addArrowBurn(enemy:Enemy,damage=10,duration=2){
        if(!enemy.burn||!enemy.burn.stacks.length)enemy.burn={born:this.time,next:this.time+1/30,end:this.time+duration,frame:Math.floor(this.random.next()*4),stacks:[]};
        enemy.burn.stacks.push({until:this.time+duration,damage});enemy.burn.end=Math.max(enemy.burn.end,this.time+duration);
    }
    private advanceArrowBurn(enemy:Enemy){
        const burn=enemy.burn;if(!burn)return;burn.stacks=burn.stacks.filter(stack=>stack.until>this.time+1e-8);
        if(burn.stacks.length&&this.time+1e-8>=burn.next){const damage=burn.stacks.reduce((total,stack)=>total+stack.damage,0);this.damageEnemy(enemy,damage);burn.next=this.time+1;this.effects.push({id:this.nextId++,kind:'damage',x:enemy.x,y:enemy.y-20,text:String(damage),ttl:.6,duration:.6,side:enemy.side});}
        if(this.time>=burn.end+.5)delete enemy.burn;
    }
    private moveEnemy(enemy:Enemy,speed:number,dt:number){
        const path=this.map.paths[enemy.side];
        if(enemy.push){
            const decay=Math.pow(.9,dt*60),step=(1-decay)/6;enemy.x+=enemy.push.x*step;enemy.y+=enemy.push.y*step;enemy.push.x*=decay;enemy.push.y*=decay;
            let closest=0,distance=Infinity;path.forEach((cell,index)=>{const p=this.position(cell),d=Math.hypot(enemy.x-p.x,enemy.y-p.y);if(d<distance){distance=d;closest=index;}});
            const p=this.position(path[closest]),dx=enemy.x-p.x,dy=enemy.y-p.y,excess=Math.max(0,Math.abs(dx)-40,Math.abs(dy)-40);
            if(excess){if(Math.abs(dx)>=Math.abs(dy))enemy.x-=Math.sign(dx)*excess;else enemy.y-=Math.sign(dy)*excess;}
            if(Math.abs(enemy.push.x)<.1&&Math.abs(enemy.push.y)<.1){delete enemy.push;enemy.rejoin=Math.min(closest+1,path.length-1);}
        }else if(enemy.rejoin!==undefined){
            const p=this.position(path[enemy.rejoin]),dx=p.x-enemy.x,dy=p.y-enemy.y,distance=Math.hypot(dx,dy),step=Math.min(distance,speed*dt);
            if(distance>0){enemy.x+=dx/distance*step;enemy.y+=dy/distance*step;}enemy.progress=Math.max(0,enemy.rejoin*80-(distance-step));
            if(distance-step<1){enemy.progress=enemy.rejoin*80;delete enemy.rejoin;}
        }else{enemy.progress+=speed*dt;this.enemyPosition(enemy);}
    }
    private ai() {
        const army = this.armies[1];
        this.recruit(1);
        for (let i = 0; i < 5; i++) {
            const unit = army.reserve[i]; if (!unit) continue;
            if (unit.kind === '铲') {
                const cells = this.map.grass.filter(n => this.owns(1, n) && !army.unlocked.includes(n));
                if (cells.length) this.move({area:'reserve',index:i}, {area:'board',index:this.random.pick(cells)}, 1);
                else army.reserve[i] = null;
                continue;
            }
            const keys = Object.keys(army.units).map(Number);
            const links=this.heroes(1),feed=unit.kind==='字'?links.find(link=>link.level<link.maxLevel&&link.hero.chars.includes(unit.char)):undefined;
            const match = feed?.left??(unit.kind!=='字'?keys.find(n => army.units[n].kind === unit.kind && army.units[n].char === unit.char && army.units[n].level === unit.level && unit.level < 5):undefined);
            const empty = army.unlocked.filter(n => !army.units[n]);
            let cell = match;
            if (cell === undefined && unit.kind === '字') {
                cell = empty.find(n => HEROES.some(h => !links.some(link=>link.hero.name===h.name)&&(h.chars[0] === unit.char && n % 8 < 7 && army.units[n + 1]?.char === h.chars[1] || h.chars[1] === unit.char && n % 8 > 0 && army.units[n - 1]?.char === h.chars[0])));
            }
            if (cell === undefined && empty.length) cell = this.random.pick(empty);
            if (cell !== undefined) this.move({area:'reserve',index:i}, {area:'board',index:cell}, 1);
        }
        // Combine deployed matches as a human could, without granting free ranks/resources.
        const keys = Object.keys(army.units).map(Number);
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
            const a = army.units[keys[i]], b = army.units[keys[j]];
            if (a && b && a.kind!=='字'&&a.char === b.char && a.kind === b.kind && a.level === b.level && a.level < 5) {
                this.move({area:'board',index:keys[i]}, {area:'board',index:keys[j]}, 1); return;
            }
        }
    }
    advance(dt: number) {
        if (this.paused || this.completed || this.tutorialStep === 1 || this.tutorialStep === 2 || !Number.isFinite(dt) || dt <= 0) return;
        this.accumulator += Math.min(dt, 0.25);
        while (this.accumulator >= 1 / 30 && !this.completed) { this.tick(1 / 30); this.accumulator -= 1 / 30; }
    }
    private tick(dt: number) {
        this.time += dt; this.waveTime += dt; this.spawnTime -= dt; this.aiTime -= dt; this.aiSilence = Math.max(0, this.aiSilence - dt);
        this.meteorTime=Math.max(0,this.meteorTime-dt);this.shovelTime-=dt;this.haze=Math.max(0,this.haze-dt);
        if(this.has('shovel')&&this.shovelTime<=0){const slot=this.armies[0].reserve.indexOf(null);if(slot>=0){this.armies[0].reserve[slot]=this.unit('铲');this.shovelTime=60;this.revision++;}}
        for(const hazard of this.hazards)hazard.ttl-=dt;this.hazards=this.hazards.filter(h=>h.ttl>0);
        if (this.tutorialStep === 3 && this.time > 4) this.tutorialStep = 0;
        for (const id of Object.keys(this.cooldowns)) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
        if (this.spawnTime <= 0 && this.spawned < WAVE_COUNTS[this.wave-1]) {
            const boss = this.bossRound && this.spawned === 0;
            this.spawn(0, boss); this.spawn(1, boss); this.spawned++; this.spawnTime = .7;
        }
        if (this.waveTime >= Math.max(30,WAVE_COUNTS[this.wave-1]*.7+5) && this.wave < 20) {
            this.wave++; this.waveTime = 0; this.spawned = 0; this.spawnTime = 2;
            const bossIndex=BOSS_ROUNDS.indexOf(this.wave);this.bossRound=bossIndex>=0&&this.random.next()<BOSS_CHANCES[bossIndex];
            for (const side of [0,1] as Side[]) this.armies[side].food += 10 + this.wave * 2;
            this.revision++;
        }
        if (this.aiTime <= 0) { if (this.aiSilence <= 0) this.ai(); this.aiTime = 2.8 + this.random.next() * 1.7; }
        for(const attack of this.pendingAttacks){attack.ttl-=dt;if(attack.ttl<=0)this.releaseBasicAttack(attack);}
        this.pendingAttacks=this.pendingAttacks.filter(attack=>attack.ttl>0);
        this.advanceCrossbows();
        this.advanceWeaponStrikes(dt);
        this.advanceHeroSkills(dt);
        for (const side of [0,1] as Side[]) {
            const army = this.armies[side], links = this.heroes(side), second = new Set(links.map(h => h.right));
            const snakeLinks=links.filter(link=>side===0&&this.profile.equipped[link.hero.name]===18),snakeIds=new Set(snakeLinks.map(link=>army.units[link.left].id));
            for(const key of Object.keys(this.companions))if(this.companions[Number(key)].side===side&&!snakeIds.has(Number(key)))delete this.companions[Number(key)];
            for(const link of snakeLinks){const unit=army.units[link.left],snake=this.companions[unit.id]||(this.companions[unit.id]={level:link.level,cooldown:0,side,cell:link.left});snake.level=link.level;snake.cooldown-=dt;
                if(snake.cooldown<=0){const pos=this.position(link.left),stats=this.stats(unit,link.hero,link.level,side);this.burst(unit,side,pos,stats.power*.35,'snake',snake.level);snake.cooldown=1/(unit.speedUntil&&unit.speedUntil>this.time?2:1);}}
            for (const key of Object.keys(army.units)) {
                const cell = Number(key), unit = army.units[cell]; unit.cooldown -= dt;
                if(unit.debuff&&(unit.level>(unit.debuffLevel||0)||(unit.debuffUntil&&unit.debuffUntil<=this.time))){delete unit.debuff;delete unit.debuffUntil;this.revision++;}
                if(['chaos','stun','sealed'].includes(unit.debuff||''))continue;
                if (unit.kind === '农') {
                    if (unit.cooldown <= 0) { unit.cooldown = FARM_INTERVALS[unit.level-1]; army.food++; if (side === 0) this.profile.gold++; this.effect('food', cell, side, '+1'); this.revision++; }
                    continue;
                }
                if (second.has(cell) || unit.cooldown > 0 || (unit.weaponUntil||0)>this.time || this.heroSkills.some(skill=>skill.unit===unit.id&&HERO_SKILLS[skill.hero].interrupt) || (side === 1 && this.aiSilence > 0)) continue;
                const link = links.find(h => h.left === cell); if (unit.kind === '字' && !link) continue;
                const stats = this.stats(unit, link?.hero, link?.level,side), pos = this.position(cell);
                if (link) pos.x += 40;
                const closestEnd=link?['赵云','关兴','张苞','张翼','黄祖'].includes(link.hero.name):unit.kind==='弓';
                const targets = this.enemies.filter(e => e.side === side && e.hp > 0 && enemyInRange(pos,stats.range,e)).sort((a,b) => closestEnd?b.progress-a.progress:Math.hypot(a.x-pos.x,a.y-pos.y)-Math.hypot(b.x-pos.x,b.y-pos.y));
                if (!targets.length) {if(unit.idleAt===undefined)unit.idleAt=this.time;continue;}
                const skill=link&&HERO_SKILLS[link.hero.name];
                if(link&&skill?.before&&!unit.skillResume&&(unit.skillCount||0)>=skill.every&&this.startHeroSkill(unit,side,cell,link.hero,link.level,stats)&&skill.interrupt)continue;
                unit.cooldown = stats.interval; unit.attacks++;
                if(link){delete unit.idleAt;unit.weaponAt=this.time;unit.weaponRate=stats.weaponRate;unit.weaponUntil=this.time+weaponBusyDuration(link.hero.weaponType as WeaponType,link.hero.name)/stats.weaponRate+(link.hero.name==='张飞'?.1/(link.hero.speed/stats.interval):0);}
                const target = targets[0];
                unit.attackX=target.x;unit.attackY=target.y;
                if(!link&&isBasicKind(unit.kind)){
                    unit.target=target.id;const delay=BASIC_UNITS[unit.kind].release*(unit.kind==='骑'?1:stats.interval/.8);
                    if(this.pendingAttacks.length<160)this.pendingAttacks.push({unit:unit.id,side,cell,kind:unit.kind,target:target.id,ttl:delay,damage:stats.power,range:stats.range,x:pos.x,y:pos.y,targetX:target.x,targetY:target.y});
                }else if(link)this.weaponAttack(unit,side,target,pos,stats,link.hero,cell);
                if(link&&skill&&skill.every>0){
                    if(unit.skillResume)unit.skillResume=false;
                    else{unit.skillCount=(unit.skillCount||0)+1;if(!skill.before&&unit.skillCount>=skill.every)this.startHeroSkill(unit,side,cell,link.hero,link.level,stats);}
                }
            }
        }
        this.advanceShots(dt);
        for (const enemy of this.enemies) {
            if(enemy.hp>0)this.advanceArrowBurn(enemy);
            if (enemy.hp <= 0) {
                this.collectEnemyLoot(enemy);continue;
            }
            enemy.slowed = Math.max(0, enemy.slowed - dt);
            if(enemy.bossType!==undefined){enemy.castIn=(enemy.castIn||0)-dt;if(enemy.castIn<=0){enemy.castIn=BOSSES[enemy.bossType].cooldown;this.bossSkill(enemy);}}
            if(enemy.hp<=0){this.collectEnemyLoot(enemy);continue;}
            enemy.held=Math.max(0,(enemy.held||0)-dt);
            enemy.knocked=Math.max(0,(enemy.knocked||0)-dt);
            let speed = enemy.speed * (enemy.slowed > 0 ? 0.3 : 1);
            if((enemy.moveDebuffUntil||0)>this.time)speed*=Math.max(0,1+(enemy.moveDebuff||0));
            if(enemy.held>0||enemy.knocked>0)speed=0;
            if(enemy.side===0&&this.has('silt'))speed*=.9;
            for(const hazard of this.hazards){const p=this.position(hazard.cell);if(enemy.hp>0&&enemy.side===0&&hazard.ttl>0&&Math.hypot(p.x-enemy.x,p.y-enemy.y)<40){hazard.ttl=0;if(hazard.kind==='mine')this.damageEnemy(enemy,enemy.hp,{side:0,hero:false});else enemy.slowed=5;this.effect(hazard.kind,hazard.cell,0);}}
            if(enemy.hp>0&&enemy.side===0&&this.has('meteor')&&this.meteorTime<=0&&enemy.progress>(this.map.paths[0].length-3)*80){this.damageEnemy(enemy,enemy.hp,{side:0,hero:false});this.meteorTime=3;this.effect('meteor',this.map.paths[0].slice(-2)[0],0);}
            if(enemy.hp<=0){this.collectEnemyLoot(enemy);continue;}
            this.moveEnemy(enemy,speed,dt);
            if (enemy.progress >= (this.map.paths[enemy.side].length - 1) * 80) {
                enemy.hp = -999; this.armies[enemy.side].lives = Math.max(0, this.armies[enemy.side].lives - 1);
                this.effect('hit', this.map.paths[enemy.side].slice(-1)[0], enemy.side, '危'); this.revision++;
            }
        }
        this.enemies = this.enemies.filter(e => e.hp > 0);
        for (const e of this.effects) e.ttl -= dt;
        this.effects = this.effects.filter(e => e.ttl > 0).slice(-100);
        if (this.armies[0].lives <= 0 || this.armies[1].lives <= 0 || this.time >= 900 || this.wave===20&&this.spawned===WAVE_COUNTS[19]&&!this.enemies.length) {
            this.finish(this.armies[0].lives > 0 && (this.armies[1].lives <= 0 || this.armies[0].lives >= this.armies[1].lives));
        }
    }
    finish(win: boolean) {
        if (this.completed) return;
        this.completed = true; this.paused = false;
        const pool = this.weapons.filter(w => w.rarity <= Math.min(4, Math.floor(this.wave / 5)));
        const weapon=win&&pool.length?this.random.pick(pool):null;
        this.result = {id:this.saveId,win,reward:win ? 20 : 5,wave:this.wave,weaponId:weapon?.id??null,weaponFragments:weapon?1:0,weaponRequired:weapon?.fragmentNum};
        this.profile.bestWave = Math.max(this.profile.bestWave, this.wave); this.revision++;
    }
    snapshot() {
        this.heroes(0);this.heroes(1);
        return JSON.stringify({ version:1, map:this.map.id, seed:this.random.state, armies:this.armies, enemies:this.enemies, time:this.time,
            wave:this.wave, waveTime:this.waveTime, spawned:this.spawned, spawnTime:this.spawnTime, nextId:this.nextId, boosts:this.boosts,
            cooldowns:this.cooldowns, tutorialStep:this.tutorialStep, saveId:this.saveId, completed:this.completed, result:this.result,
            shots:this.shots,pendingAttacks:this.pendingAttacks,weaponStrikes:this.weaponStrikes,heroSkills:this.heroSkills,heroProgress:this.heroProgress,effects:this.effects,aiTime:this.aiTime,aiSilence:this.aiSilence,kills:this.kills,merges:this.merges,deployed:this.deployed,accumulator:this.accumulator,
            ranges:this.ranges,hazards:this.hazards,shovelTime:this.shovelTime,meteorTime:this.meteorTime,companions:this.companions,bossRound:this.bossRound,haze:this.haze,projectileHeight:this.projectileHeight });
    }
    static restore(text: string, profile: Profile, weapons: Weapon[]): Battle | null {
        try {
            const raw = JSON.parse(text); if (raw.version !== 1 || !MAPS[raw.map] || !Array.isArray(raw.armies) || raw.armies.length !== 2 || !Number.isFinite(raw.time)) return null;
            const b = new Battle(profile, weapons, raw.map, raw.seed);
            for (const army of raw.armies) {
                if (!Array.isArray(army.reserve) || army.reserve.length !== 5 || !Array.isArray(army.unlocked) || !army.units || !Number.isFinite(army.food) || !Number.isFinite(army.lives)) return null;
                for (const unit of [...army.reserve, ...Object.values(army.units)] as (Unit|null)[]) if (unit && (!Number.isInteger(unit.id) || !Number.isInteger(unit.level) || unit.level < 1 || unit.level > 5 || !['刀','弓','枪','骑','农','字','铲'].includes(unit.kind))) return null;
                for(const unit of [...army.reserve,...Object.values(army.units)] as (Unit|null)[])if(unit?.kind==='字'&&!validExperience(unit.experience))unit.experience=partExperience(unit.level);
                for(const unit of [...army.reserve,...Object.values(army.units)] as (Unit|null)[])if(unit){
                    if(unit.crossbowCount!==undefined&&(!Number.isInteger(unit.crossbowCount)||unit.crossbowCount<0||unit.crossbowCount>10))delete unit.crossbowCount;
                    if(unit.crossbowVolley&&!validCrossbowVolley(unit.crossbowVolley)){delete unit.crossbowVolley;unit.weaponUntil=Math.min(unit.weaponUntil??raw.time,raw.time);}
                }
            }
            Object.assign(b, {armies:raw.armies,enemies:Array.isArray(raw.enemies) ? raw.enemies.slice(0,200) : [],time:raw.time,
                wave:Math.max(1,Math.min(20,raw.wave)),waveTime:raw.waveTime,spawned:raw.spawned,spawnTime:raw.spawnTime,nextId:raw.nextId,
                boosts:raw.boosts||{},cooldowns:raw.cooldowns||{},tutorialStep:raw.tutorialStep,saveId:raw.saveId,
                completed:!!raw.completed,result:raw.result||null,shots:Array.isArray(raw.shots)?raw.shots.filter((s:Shot)=>s&&Number.isInteger(s.id)&&Number.isInteger(s.from)&&Number.isInteger(s.target)&&[0,1].includes(s.side)&&[s.x,s.y,s.damage,s.speed].every(Number.isFinite)&&(!s.crossbowFire||s.kind==='crossbowFire'&&s.weaponId===9&&validCrossbowFire(s.crossbowFire))&&(!s.bird||s.kind===s.bird.kind&&validBirdArrow(s.bird)&&Array.isArray(s.visited)&&s.visited.length<=200&&s.visited.every(Number.isInteger))&&(!s.flyingPike||s.kind==='flyingPike'&&s.speed>0&&validFlyingPike(s.flyingPike))&&(!s.flight||[s.flight.startX,s.flight.startY,s.flight.controlX,s.flight.controlY,s.flight.progress,s.flight.multiplier,s.flight.arrival,s.flight.lastAt].every(Number.isFinite)&&s.flight.multiplier>0&&s.flight.arrival>=0&&(s.flight.targetX===undefined&&s.flight.targetY===undefined||Number.isFinite(s.flight.targetX)&&Number.isFinite(s.flight.targetY)))&&(!s.motion||validSkillProjectile(s.motion)&&Array.isArray(s.visited)&&s.visited.length<=200&&s.visited.every(Number.isInteger))).slice(0,160):[],pendingAttacks:Array.isArray(raw.pendingAttacks)?raw.pendingAttacks.filter((a:PendingAttack)=>a&&isBasicKind(a.kind)&&Number.isFinite(a.ttl)&&Number.isFinite(a.damage)&&Number.isFinite(a.range)&&[0,1].includes(a.side)&&Number.isInteger(a.cell)&&a.cell>=0&&a.cell<80).slice(0,160):[],weaponStrikes:Array.isArray(raw.weaponStrikes)?raw.weaponStrikes.filter((s:WeaponStrike)=>s&&['target','area','arrow','throw'].includes(s.kind)&&(s.procStarted===undefined||typeof s.procStarted==='boolean')&&(s.fireArrowBorn===undefined||s.kind==='arrow'&&s.weaponId===9&&Number.isFinite(s.fireArrowBorn)&&s.fireArrowBorn>=0)&&(s.birdKind===undefined||s.kind==='arrow'&&['eagle','phoenix'].includes(s.birdKind)&&Number.isFinite(s.birdAnimationAt)&&s.birdAnimationAt!>=0)&&Number.isInteger(s.id)&&Number.isInteger(s.unit)&&Number.isInteger(s.target)&&Number.isInteger(s.cell)&&s.cell>=0&&s.cell<80&&[0,1].includes(s.side)&&HEROES.some(h=>h.name===s.hero)&&[s.born,s.duration,s.damage,s.x,s.y,s.angle,s.endAngle,s.length,s.endLength,s.bold,s.tween].every(Number.isFinite)&&s.duration>=0&&s.damage>0&&Array.isArray(s.visited)&&s.visited.length<=200&&s.visited.every(Number.isInteger)&&(!['arrow','throw'].includes(s.kind)||Number.isFinite(s.arc)&&Number.isFinite(s.projectileSpeed)&&s.projectileSpeed>0)).slice(0,768):[],heroSkills:Array.isArray(raw.heroSkills)?raw.heroSkills.filter(validHeroSkill).slice(0,64):[],effects:Array.isArray(raw.effects)?raw.effects.filter((e:Effect)=>e&&(e.kind!=='groundPike'||validGroundPike(e.piercing!)&&Number.isSafeInteger(e.id)&&[0,1].includes(e.side)&&[e.x,e.y,e.ttl,e.duration].every(Number.isFinite)&&e.duration===1&&e.ttl>=0&&e.ttl<=1)).slice(-100):[],aiTime:raw.aiTime||1.5,
                aiSilence:raw.aiSilence||0,kills:raw.kills||0,merges:raw.merges||0,deployed:raw.deployed||0,accumulator:raw.accumulator||0,
                ranges:raw.ranges||{},hazards:raw.hazards||[],shovelTime:raw.shovelTime??60,meteorTime:raw.meteorTime||0,companions:raw.companions||{},bossRound:!!raw.bossRound,haze:raw.haze||0,projectileHeight:Number.isFinite(raw.projectileHeight)&&raw.projectileHeight>=640&&raw.projectileHeight<=4096?raw.projectileHeight:1386});
            for(const enemy of b.enemies){
                if(enemy.burn&&!validArrowBurn(enemy.burn))delete enemy.burn;
                if(enemy.push&&(![enemy.push.x,enemy.push.y].every(Number.isFinite)||Math.max(Math.abs(enemy.push.x),Math.abs(enemy.push.y))>1e6))delete enemy.push;
                if(enemy.rejoin!==undefined&&(!Number.isInteger(enemy.rejoin)||enemy.rejoin<0||enemy.rejoin>=b.map.paths[enemy.side]?.length))delete enemy.rejoin;
            }
            if(!Number.isSafeInteger(b.nextId)||b.nextId<1)return null;
            const ids=new Set<number>(),names=new Set<string>();
            for(const progress of (Array.isArray(raw.heroProgress)?raw.heroProgress:[]).slice(0,80) as HeroProgress[]){
                if(!validHeroProgress(progress,HEROES.map(h=>h.name))||ids.has(progress.id)||names.has(progress.side+':'+progress.name))continue;
                const units=b.armies[progress.side].units,left=units[progress.left],right=units[progress.left+1];
                if(left?.id!==progress.leftUnit||right?.id!==progress.rightUnit||left.kind!=='字'||right.kind!=='字'||left.char+right.char!==progress.name)continue;
                const hero=HEROES.find(h=>h.name===progress.name)!,weapon=progress.side===0?weapons.find(w=>w.id===profile.equipped[progress.name]):undefined;
                if(!validExperience(progress.speedBonus))progress.speedBonus=b.partSpeed(left);
                if(!validExperience(progress.rangeBonus))progress.rangeBonus=b.partRange(left)*b.attackRange(left,hero,weapon)/hero.range;
                ids.add(progress.id);names.add(progress.side+':'+progress.name);b.heroProgress.push(progress);b.nextId=Math.max(b.nextId,progress.id+1);
            }
            // v1 saves predate separate general experience. Keep their current
            // levels, attack counts and casts; future formations use native XP.
            for(const side of [0,1] as Side[])for(const pair of b.heroPairs(side))if(!names.has(side+':'+pair.hero.name)){b.newHero(side,pair,true);names.add(side+':'+pair.hero.name);}
            for(const enemy of b.enemies)if(enemy.contributors!==undefined)enemy.contributors=Array.isArray(enemy.contributors)?Array.from(new Set(enemy.contributors.filter(id=>Number.isSafeInteger(id)&&id>0))).slice(0,128):[];
            const legacy=!Array.isArray(raw.heroProgress),owner=(unit:number,side:Side,hero:string)=>b.heroes(side).find(h=>h.hero.name===hero&&b.armies[side].units[h.left].id===unit)?.id;
            for(const shot of b.shots)if(shot.hero&&(!Number.isSafeInteger(shot.heroId)||shot.heroId!<1))shot.heroId=(legacy?owner(shot.from,shot.side,shot.hero):undefined)??b.nextId++;
            for(const strike of b.weaponStrikes)if(!Number.isSafeInteger(strike.heroId)||strike.heroId!<1)strike.heroId=(legacy?owner(strike.unit,strike.side,strike.hero):undefined)??b.nextId++;
            for(const skill of b.heroSkills)if(!Number.isSafeInteger(skill.heroId)||skill.heroId!<1)skill.heroId=(legacy?owner(skill.unit,skill.side,skill.hero):undefined)??b.nextId++;
            return b;
        } catch (_) { return null; }
    }
}
export function claimResult(profile: Profile, result: BattleResult, double = false) {
    if (profile.rewards.includes(result.id)) return false;
    profile.rewards.push(result.id); profile.rewards = profile.rewards.slice(-64);
    profile.gold += result.reward * (double ? 2 : 1);
    if (result.win) { profile.wins++; profile.stars++; if (result.weaponId !== null){
        if(result.weaponFragments!==undefined&&result.weaponRequired)awardWeaponFragments(profile,result.weaponId,result.weaponFragments,result.weaponRequired);
        else profile.weapons[result.weaponId] = (profile.weapons[result.weaponId] || 0) + 1; // Already-saved v1 settlements keep their original promised reward.
    } }
    else { profile.losses++; profile.stars = Math.max(1, profile.stars - 1); }
    return true;
}
export function awardWeaponFragments(profile:Profile,weaponId:number,count:number,required:number){
    if(!Number.isInteger(weaponId)||weaponId<0||!Number.isFinite(count)||!Number.isInteger(required)||required<1)return 0;
    const total=(profile.fragments[weaponId]||0)+Math.max(0,Math.floor(count)),complete=Math.floor(total/required);
    profile.fragments[weaponId]=total%required;profile.weapons[weaponId]=(profile.weapons[weaponId]||0)+complete;return complete;
}
export function purchase(profile: Profile, id: string): string {
    const item = ITEMS.find(i => i.id === id); if (!item) return '道具不存在';
    if(id==='march'){if(profile.gold<item.price)return '金币不足';if(profile.stamina>=30)return '体力充沛';profile.gold-=item.price;profile.stamina=Math.min(30,profile.stamina+10);return '';}
    if (profile.items.includes(id)){if(id!=='promotion'||(profile.itemLevels[id]||1)>=3)return '已经拥有此道具';const cost=(profile.itemLevels[id]||1)===1?100:150;if(profile.gold<cost)return '金币不足';profile.gold-=cost;profile.itemLevels[id]=(profile.itemLevels[id]||1)+1;return '';}
    const count = profile.items.filter(key => ITEMS.find(i => i.id === key)?.active === item.active).length;
    if (count >= (item.active ? 2 : 6)) return '道具栏已满，请先移除一个道具';
    if (profile.gold < item.price) return '金币不足';
    profile.gold -= item.price; profile.items.push(id); profile.itemLevels[id]=1;return '';
}
export function equipWeapon(profile: Profile, weapons: Weapon[], heroName: string, weaponId: number): string {
    const hero = HEROES.find(h => h.name === heroName), weapon = weapons.find(w => w.id === weaponId);
    if (!hero || !weapon || weapon.type !== hero.weaponType) return '武器类型与武将不匹配';
    const used = Object.values(profile.equipped).filter(id => id === weaponId).length;
    if ((profile.weapons[weaponId] || 0) <= used && profile.equipped[heroName] !== weaponId) return '这把武器已装备，请先卸下';
    profile.equipped[heroName] = weaponId; return '';
}
export function recycleWeapons(profile: Profile, weapons: Weapon[],qualities=[0,1,2]) {
    let gold = 0;
    for (const w of weapons) {
        if (!qualities.includes(w.rarity)) continue;
        const used = Object.values(profile.equipped).filter(id => id === w.id).length;
        const count = Math.max(0, (profile.weapons[w.id] || 0) - used);
        if (count) { profile.weapons[w.id] -= count; gold += count * (w.rarity + 1) * 5; }
    }
    profile.gold += gold; return gold;
}
