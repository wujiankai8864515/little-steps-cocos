/** ZYA-02: deterministic game rules, independent of Cocos and wall-clock timers. */
import { REFERENCE_MAPS } from './ReferenceMaps';
import { BOSSES, BOSS_CHANCES, BOSS_ROUNDS, EARLY_HEALTH, WAVE_COUNTS, WAVE_HEALTH } from './ReferenceCombat';
import { BASIC_UNITS, BASIC_GROWTH, BasicKind, FARM_INTERVALS, HERO_DAMAGE_GROWTH, HERO_SPEED_GROWTH, isBasicKind } from './ReferenceUnits';
import { weaponBusyDuration, weaponPlaybackRate, WeaponType } from './ReferenceWeapons';
export type Side = 0 | 1; // 0 player, 1 computer opponent
export type UnitKind = '刀' | '弓' | '枪' | '骑' | '农' | '字' | '铲';
export interface Unit { id: number; kind: UnitKind; char: string; level: number; cooldown: number; attacks: number; weaponUntil?:number; weaponAt?:number; target?:number; attackX?:number;attackY?:number;streak?:number; seen?:number[]; speedBuff?:number; speedUntil?:number; debuff?:string; debuffLevel?:number; debuffUntil?:number; }
export interface Hero { name: string; chars: string; weaponType: number; range: number; power: number; speed: number; rarity: number; skill: string; }
export const GLYPHS = '赵云张飞马超关羽平兴黄忠苞翼盖祖甄宓刘备';
export const HEROES: Hero[] = [
    { name:'赵云',chars:'赵云',weaponType:1,range:200,power:2,speed:.8,rarity:2,skill:'七进七出' },
    { name:'张飞',chars:'张飞',weaponType:1,range:200,power:10,speed:1,rarity:4,skill:'当阳怒吼' },
    { name:'马超',chars:'马超',weaponType:1,range:200,power:10,speed:1,rarity:4,skill:'飞枪破阵' },
    { name:'关羽',chars:'关羽',weaponType:2,range:200,power:20,speed:1,rarity:4,skill:'青龙斩' },
    { name:'黄忠',chars:'黄忠',weaponType:0,range:360,power:6,speed:.8,rarity:4,skill:'百步穿杨' },
    { name:'关平',chars:'关平',weaponType:2,range:200,power:3,speed:1,rarity:3,skill:'刀气纵横' },
    { name:'关兴',chars:'关兴',weaponType:2,range:200,power:7,speed:1,rarity:3,skill:'横扫千军' },
    { name:'张苞',chars:'张苞',weaponType:1,range:200,power:7,speed:1,rarity:3,skill:'长坂余威' },
    { name:'张翼',chars:'张翼',weaponType:3,range:200,power:7,speed:1,rarity:3,skill:'剑阵' },
    { name:'黄盖',chars:'黄盖',weaponType:3,range:200,power:8,speed:1,rarity:3,skill:'火攻' },
    { name:'刘备',chars:'刘备',weaponType:3,range:200,power:10,speed:.8,rarity:4,skill:'仁德' },
    { name:'黄祖',chars:'黄祖',weaponType:0,range:280,power:6,speed:.8,rarity:2,skill:'连珠箭' },
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
export interface Enemy { id: number; side: Side; progress: number; hp: number; maxHp: number; speed: number; boss: boolean; slowed: number; x: number; y: number; held?:number; bossType?:number; castIn?:number; }
export interface Shot { id: number; side: Side; from: number; target: number; x: number; y: number; damage: number; speed: number; kind: string; splash: number; weaponId?:number; hero?:string; visited?:number[]; }
export interface Effect { id: number; kind: string; x: number; y: number; text?: string; ttl: number; duration: number; side: Side; }
export interface Location { area: 'board' | 'reserve'; index: number; }
export interface PendingAttack {unit:number;side:Side;cell:number;kind:BasicKind;target:number;ttl:number;damage:number;range:number;x:number;y:number;targetX:number;targetY:number;}
export interface BattleResult { id: string; win: boolean; reward: number; wave: number; weaponId: number | null; weaponFragments?:number;weaponRequired?:number; }
export class Battle {
    readonly map: MapSpec;
    readonly random: Random;
    armies: [Army, Army]; enemies: Enemy[] = []; shots: Shot[] = []; effects: Effect[] = [];
    pendingAttacks:PendingAttack[]=[];
    time = 0; wave = 1; waveTime = 0; paused = false; completed = false; result: BattleResult | null = null;
    tutorialStep = 0; revision = 0; nextId = 1; spawnTime = 4; spawned = 0; aiTime = 1.5;
    boosts: Record<number, number> = {}; ranges: Record<number, number> = {}; cooldowns: Record<string, number> = {}; aiSilence = 0;
    hazards: {cell:number;kind:string;ttl:number}[]=[]; shovelTime=60; meteorTime=0;
    companions:Record<number,{level:number;cooldown:number;side:Side;cell:number}>= {};
    bossRound=false; haze=0;
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
    unit(kind: UnitKind, char: string = kind, level = 1): Unit { return { id: this.nextId++, kind, char, level, cooldown: kind === '农' ? FARM_INTERVALS[level-1] : 0, attacks: 0 }; }
    private changeLevel(unit:Unit,level:number){
        const previous=unit.level;unit.level=Math.max(1,Math.min(5,level));
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
        if (target && target.kind === unit.kind && target.char === unit.char && target.level === unit.level && unit.level < 5 && unit.kind !== '铲') {
            this.changeLevel(target,target.level+1); this.set(from, null, side); this.merges++; this.effect('merge', to.index, side, '等级提升');
        } else {
            this.set(from, target || null, side); this.set(to, unit, side);
        }
        if (side === 0 && to.area === 'board') {
            this.deployed++; if (this.tutorialStep === 2) { this.tutorialStep = 3; this.profile.tutorial = true; }
        }
        this.revision++; return '';
    }
    heroes(side: Side): { hero: Hero; left: number; right: number; level: number }[] {
        const units = this.armies[side].units, results: { hero: Hero; left: number; right: number; level: number }[] = [];
        for (const key of Object.keys(units)) {
            const cell = Number(key), unit = units[cell], right = units[cell + 1];
            if (cell % 8 === 7 || unit.kind !== '字' || !right || right.kind !== '字') continue;
            const hero = HEROES.find(h => h.chars === unit.char + right.char);
            if (hero) results.push({ hero, left: cell, right: cell + 1, level: Math.min(unit.level, right.level) });
        }
        return results;
    }
    stats(unit: Unit, hero?: Hero, level = unit.level, side:Side=0) {
        const weapon = hero && side===0 ? this.weapons.find(w => w.id === this.profile.equipped[hero.name]) : undefined;
        let power = hero ? hero.power : unit.kind === '刀' ? 3 : 2;
        let range = hero ? hero.range : unit.kind === '弓' ? 280 : unit.kind === '枪' ? 200 : unit.kind === '骑' ? 160 : 120;
        if (weapon) { power += weapon.addAttPower; if ([1,11,21,32].includes(weapon.id)) range += 40;if(weapon.id===13)range+=80; if (weapon.id === 8) range *= 2;if(weapon.id===33)power+=3; }
        power *= (hero?HERO_DAMAGE_GROWTH:BASIC_GROWTH)[level-1];
        // The original xp field is an interval in seconds, not attacks/second.
        let speed=1/(hero?hero.speed:.8)*(hero?HERO_SPEED_GROWTH:BASIC_GROWTH)[level-1],bonus=this.boosts[unit.id]||0;
        if (this.has('together')) bonus+=side===0?.5:.3;
        if (this.has('allSpeed'))bonus+=.1;
        if((unit.speedUntil||0)>this.time)bonus+=unit.speedBuff||0;
        if(weapon&&[3,6,22].includes(weapon.id))bonus+=(unit.streak||0)*(weapon.id===6?.15:.05);
        speed*=Math.max(.01,1+bonus);range*=this.ranges[unit.id]||1;
        if(unit.debuff==='rain')speed*=.6;
        const weaponRate=hero?weaponPlaybackRate(hero.weaponType as WeaponType,hero.name,weapon?.id??-1,hero.speed*speed,bonus):1;
        return {power,range,interval:1/speed,weapon,weaponRate};
    }
    active(id: string, cell = -1,location:Location={area:'board',index:cell}): string {
        const item = ITEMS.find(i => i.id === id);
        if (!item?.active || !this.has(id) || this.completed || this.paused) return '道具不可用';
        if ((this.cooldowns[id] || 0) > 0) return '道具冷却中';
        if (['god','speed','training','brush','trash'].includes(id)) {
            if(location.area==='board'&&!this.owns(0,cell))return '拖到我方单位上使用';
            const unit = this.get(location); if (!unit||unit.kind==='铲') return '拖到我方单位上使用';
            if (id === 'speed') this.boosts[unit.id] = (this.boosts[unit.id]||0)+.4;
            else if(id==='brush'){if(unit.kind!=='字')return '毛笔只能改字牌';const choices=GLYPHS.split('').filter(char=>char!==unit.char);unit.char=this.random.pick(choices);}
            else if(id==='trash'){if(unit.kind!=='字')return '垃圾桶只回收字牌';this.set(location,null,0);this.armies[0].food++;}
            else {
                if (id === 'god' && unit.level === 5) return '已满5级';
                const delta = id === 'training' && this.random.next() < 0.45 ? -1 : 1;
                this.changeLevel(unit,unit.level+delta);
                const link = location.area==='board'?this.heroes(0).find(h => h.left === cell || h.right === cell):undefined;
                if (link) this.armies[0].units[link.left === cell ? link.right : link.left].level = unit.level;
                this.effect('merge', cell, 0, delta > 0 ? '等级提升' : '等级降低');
            }
        } else if (id === 'ink') {
            this.aiSilence = 5; this.effect('ink', 20, 1);
        } else if(id==='range') {
            for(const army of this.armies)for(const unit of [...Object.values(army.units),...army.reserve])if(unit&&(unit.kind==='弓'||unit.kind==='字'))this.ranges[unit.id]=2;
            this.effect('skill',60,0,'御敌千里');
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
        if(enemy.side===0&&this.has('exorcism')&&this.random.next()<.5){enemy.hp-=enemy.maxHp*.15;this.battleEffect('exorcism',enemy,enemy.side,'反噬');return;}
        this.battleEffect('bossSkill',enemy,enemy.side,boss.skill);
        const debuff=(cell:number,name:string,seconds=0)=>{const unit=army.units[cell];if(unit){unit.debuff=name;unit.debuffLevel=unit.level;unit.debuffUntil=seconds?this.time+seconds:0;}};
        if(type===0){for(const cell of cells.slice(0,4))debuff(cell,'chaos',5);}
        if(type===1||type===6){for(let i=0;i<(type===6?3:2);i++){const child=this.spawn(enemy.side,false);if(child){child.progress=Math.max(0,enemy.progress-80);child.speed=type===6?75:50;this.enemyPosition(child);}}}
        if(type===2){for(const mob of this.enemies)if(mob.side===enemy.side&&Math.hypot(mob.x-enemy.x,mob.y-enemy.y)<240){mob.hp*=1.25;mob.maxHp*=1.25;mob.speed*=1.1;}}
        if(type===3){const empty=army.unlocked.filter(cell=>!army.units[cell]),chosen=this.random.pick(empty);if(chosen!==undefined){army.unlocked=army.unlocked.filter(cell=>cell!==chosen);this.effect('unlock',chosen,enemy.side);}}
        if(type===4){for(const side of [0,1] as Side[])for(const unit of Object.values(this.armies[side].units)){unit.debuff='rain';unit.debuffLevel=unit.level;unit.debuffUntil=0;}}
        if(type===5){const cell=cells.sort((a,b)=>army.units[a].level-army.units[b].level)[0],other=this.armies[enemy.side===0?1:0],free=other.unlocked.find(cell=>!other.units[cell]);if(cell!==undefined&&free!==undefined){other.units[free]=army.units[cell];delete army.units[cell];}}
        if(type===7){for(const cell of cells.slice(0,3)){army.units[cell].level=Math.max(1,army.units[cell].level-1);debuff(cell,'lock',8);}}
        if(type===8){const chosen=cells.find(cell=>{const p=this.position(cell);return Math.hypot(p.x-enemy.x,p.y-enemy.y)<200;});if(chosen!==undefined){delete army.units[chosen];enemy.maxHp*=1.3;enemy.hp+=enemy.maxHp*.3;}}
        if(type===9){for(const cell of cells.slice(0,2))debuff(cell,'stun');}
        if(type===10&&enemy.side===0)this.haze=5;
        if(type===11){const cell=cells.sort((a,b)=>army.units[b].level-army.units[a].level)[0];if(cell!==undefined)debuff(cell,'sealed');}
        this.revision++;
    }
    private fire(unit:Unit,side:Side,target:Enemy,pos:{x:number;y:number},power:number,kind:string,splash=0,weaponId?:number,hero?:string){
        if(this.shots.length>=160)return;
        this.shots.push({id:this.nextId++,side,from:unit.id,target:target.id,x:pos.x,y:pos.y,damage:power,speed:kind==='eagle'?180:550,kind,splash,weaponId,hero,visited:[]});
    }
    private burst(unit:Unit,side:Side,pos:{x:number;y:number},damage:number,kind:string,count:number){
        const pool=this.enemies.filter(e=>e.side===side&&e.hp>0).sort((a,b)=>Math.hypot(a.x-pos.x,a.y-pos.y)-Math.hypot(b.x-pos.x,b.y-pos.y));
        for(const target of pool.slice(0,count))this.fire(unit,side,target,pos,damage,kind,kind==='fire'?45:0);
    }
    private battleEffect(kind:string,pos:{x:number;y:number},side:Side,text?:string){this.effects.push({id:this.nextId++,kind,x:pos.x,y:pos.y,text,ttl:.8,duration:.8,side});}
    private releaseBasicAttack(attack:PendingAttack){
        const unit=this.armies[attack.side].units[attack.cell];if(!unit||unit.id!==attack.unit||!isBasicKind(unit.kind)||['chaos','stun','sealed'].includes(unit.debuff||''))return;
        const pool=this.enemies.filter(e=>e.side===attack.side&&e.hp>0&&Math.hypot(e.x-attack.x,e.y-attack.y)<=attack.range);
        const target=pool.find(e=>e.id===attack.target)||pool.sort((a,b)=>attack.kind==='弓'?b.progress-a.progress:Math.hypot(a.x-attack.x,a.y-attack.y)-Math.hypot(b.x-attack.x,b.y-attack.y))[0];
        if(!target)return;
        if(attack.kind==='弓'){this.fire(unit,attack.side,target,{x:attack.x,y:attack.y},attack.damage,'弓');return;}
        let hit:Enemy[]=[target];
        if(attack.kind==='骑')hit=pool;
        if(attack.kind==='枪'){
            const dx=attack.targetX-attack.x,dy=attack.targetY-attack.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
            hit=pool.filter(e=>{const x=e.x-attack.x,y=e.y-attack.y,along=x*ux+y*uy;return along>=-20&&along<=attack.range&&Math.abs(x*uy-y*ux)<=25;});
        }
        for(const enemy of hit){enemy.hp-=attack.damage;this.effects.push({id:this.nextId++,kind:'damage',x:enemy.x,y:enemy.y-20,text:String(Math.ceil(attack.damage)),ttl:.6,duration:.6,side:attack.side});}
    }
    private weaponAttack(unit:Unit,side:Side,target:Enemy,pos:{x:number;y:number},stats:ReturnType<Battle['stats']>,hero?:Hero){
        const id=stats.weapon?.id,first=!unit.seen?.includes(target.id);
        unit.streak=unit.target===target.id?(unit.streak||0)+1:0;unit.target=target.id;
        if(first){unit.seen=(unit.seen||[]).concat(target.id).slice(-128);}
        let power=stats.power;
        if(id===8)power*=1+Math.hypot(target.x-pos.x,target.y-pos.y)/Math.max(1,stats.range);
        if(id===26&&first){this.profile.gold++;this.battleEffect('food',pos,side,'+1');}
        if([12,17].includes(id!)&&first&&this.random.next()<.2){const count=id===12?1:hero?.name==='马超'?5:3;this.burst(unit,side,target,power*count,'pike',count);this.battleEffect('pike',target,side);}
        if(id===14&&first&&this.random.next()<.2)target.held=2;
        if([23,27].includes(id!)&&this.random.next()<.1){for(const other of Object.values(this.armies[side].units)){const cell=Number(Object.keys(this.armies[side].units).find(key=>this.armies[side].units[Number(key)].id===other.id)),p=this.position(cell);if(Math.hypot(p.x-pos.x,p.y-pos.y)<200){other.speedBuff=id===23?.2:.3;other.speedUntil=this.time+10;}}this.battleEffect(id===27?'tiger':'roar',pos,side);}
        if(id===25&&this.random.next()<.1)target.held=1;
        if(id===30&&this.random.next()<.1){power*=5;for(const e of this.enemies)if(e.side===side&&Math.hypot(e.x-target.x,e.y-target.y)<100)e.held=1.5;this.battleEffect('slam',target,side);}
        this.fire(unit,side,target,pos,power,unit.kind,id===5?70:unit.kind==='刀'?48:unit.kind==='枪'?30:0,id,hero?.name);
        if(id===4&&this.random.next()<.1)this.burst(unit,side,pos,power,'eagle',8);
        if(id===5&&this.random.next()<.1){this.burst(unit,side,pos,power,'fire',12);this.battleEffect('fire',target,side);}
        if(id===9&&unit.attacks%10===0)for(let i=0;i<10;i++)this.fire(unit,side,target,pos,power,'fire',45);
        if(id===19&&this.random.next()<.1){this.burst(unit,side,pos,power*1.5,'flyingPike',20);this.battleEffect('pike',pos,side);}
        if(id===24&&unit.attacks%10===0)this.burst(unit,side,pos,power,'blade',12);
        if(id===28&&this.random.next()<.1)this.burst(unit,side,pos,power,'meteor',12);
        if(id!==undefined&&id>=34&&unit.attacks%10===0){const positive=(id%2===0)||id===43;this.battleEffect(positive?'sword':'coldSword',pos,side);
            if(positive)this.burst(unit,side,pos,power*(1+stats.weapon!.rarity*.3),'sword',8);else for(const enemy of this.enemies)if(enemy.side===side&&Math.hypot(enemy.x-pos.x,enemy.y-pos.y)<320){enemy.slowed=3;enemy.hp-=power;}}
    }
    private weaponHit(shot:Shot,target:Enemy){
        const id=shot.weaponId,unit=Object.values(this.armies[shot.side].units).find(unit=>unit.id===shot.from);
        if(id===2&&this.random.next()<.1)target.progress=Math.max(0,target.progress-80);
        if(id===7&&this.random.next()<.5){const visited=(shot.visited||[]).concat(target.id),next=this.enemies.find(e=>e.side===shot.side&&e.hp>0&&!visited.includes(e.id)&&Math.hypot(e.x-target.x,e.y-target.y)<240);if(next&&visited.length<12){shot.visited=visited;shot.target=next.id;shot.x=target.x;shot.y=target.y;return true;}}
        if(unit&&target.hp<=0){
            if(id===15){unit.speedBuff=.5;unit.speedUntil=this.time+2;}
            if(id===16)this.burst(unit,shot.side,target,shot.damage,'flower',8);
            if(id===29)this.burst(unit,shot.side,target,shot.damage,'blade',12);
        }
        return false;
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
            const match = keys.find(n => army.units[n].kind === unit.kind && army.units[n].char === unit.char && army.units[n].level === unit.level && unit.level < 5);
            const empty = army.unlocked.filter(n => !army.units[n]);
            let cell = match;
            if (cell === undefined && unit.kind === '字') {
                cell = empty.find(n => HEROES.some(h => h.chars[0] === unit.char && n % 8 < 7 && army.units[n + 1]?.char === h.chars[1] || h.chars[1] === unit.char && n % 8 > 0 && army.units[n - 1]?.char === h.chars[0]));
            }
            if (cell === undefined && empty.length) cell = this.random.pick(empty);
            if (cell !== undefined) this.move({area:'reserve',index:i}, {area:'board',index:cell}, 1);
        }
        // Combine deployed matches as a human could, without granting free ranks/resources.
        const keys = Object.keys(army.units).map(Number);
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
            const a = army.units[keys[i]], b = army.units[keys[j]];
            if (a && b && a.char === b.char && a.kind === b.kind && a.level === b.level && a.level < 5) {
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
                if (second.has(cell) || unit.cooldown > 0 || (unit.weaponUntil||0)>this.time || (side === 1 && this.aiSilence > 0)) continue;
                const link = links.find(h => h.left === cell); if (unit.kind === '字' && !link) continue;
                const stats = this.stats(unit, link?.hero, link?.level,side), pos = this.position(cell);
                if (link) pos.x += 40;
                const closestEnd=link?['赵云','关兴','张苞','张翼','黄祖'].includes(link.hero.name):unit.kind==='弓';
                const targets = this.enemies.filter(e => e.side === side && e.hp > 0 && Math.hypot(e.x - pos.x, e.y - pos.y) <= stats.range).sort((a,b) => closestEnd?b.progress-a.progress:Math.hypot(a.x-pos.x,a.y-pos.y)-Math.hypot(b.x-pos.x,b.y-pos.y));
                if (!targets.length) continue;
                unit.cooldown = stats.interval; unit.attacks++;
                if(link){unit.weaponAt=this.time;unit.weaponUntil=this.time+weaponBusyDuration(link.hero.weaponType as WeaponType,link.hero.name)/stats.weaponRate;}
                const target = targets[0];
                unit.attackX=target.x;unit.attackY=target.y;
                if(!link&&isBasicKind(unit.kind)){
                    unit.target=target.id;const delay=BASIC_UNITS[unit.kind].release*(unit.kind==='骑'?1:stats.interval/.8);
                    if(this.pendingAttacks.length<160)this.pendingAttacks.push({unit:unit.id,side,cell,kind:unit.kind,target:target.id,ttl:delay,damage:stats.power,range:stats.range,x:pos.x,y:pos.y,targetX:target.x,targetY:target.y});
                }else this.weaponAttack(unit,side,target,pos,stats,link?.hero);
                if (link && unit.attacks % 8 === 0) {
                    this.effect('skill', cell, side, link.hero.skill);
                    const max = link.hero.name === '黄忠' ? 12 : 5,exclusive=link.hero.name==='黄忠'&&stats.weapon?.id===5?2:1;
                    for (const e of this.enemies.filter(e => e.side === side).slice(0, max)) { e.hp -= stats.power * 2.5*exclusive; e.slowed = 1.5; }
                    if (link.hero.name === '刘备') { army.food += 5; this.revision++; }
                    if (link.hero.name === '张飞') for (const e of this.enemies.filter(e => e.side === side)) e.progress = Math.max(0, e.progress - 80);
                    if(link.hero.name==='张飞'&&stats.weapon?.id===18){unit.speedBuff=1;unit.speedUntil=this.time+6;}
                    if(link.hero.name==='关羽'&&stats.weapon?.id===29)this.burst(unit,side,pos,stats.power,'blade',12);
                }
            }
        }
        for (const shot of this.shots) {
            const target = this.enemies.find(e => e.id === shot.target && e.hp > 0);
            if (!target) { shot.damage = 0; continue; }
            const dx = target.x - shot.x, dy = target.y - shot.y, distance = Math.hypot(dx, dy);
            if (distance <= shot.speed * dt) {
                target.hp -= shot.damage; this.effects.push({id:this.nextId++,kind:'damage',x:target.x,y:target.y - 20,text:Math.ceil(shot.damage).toString(),ttl:0.6,duration:0.6,side:shot.side});
                if (shot.splash > 0) for (const other of this.enemies) if (other.id !== target.id && other.side === target.side && Math.hypot(other.x - target.x, other.y - target.y) <= shot.splash) other.hp -= shot.damage * 0.45;
                if(!this.weaponHit(shot,target))shot.damage = 0;
            } else { shot.x += dx / distance * shot.speed * dt; shot.y += dy / distance * shot.speed * dt; }
        }
        this.shots = this.shots.filter(s => s.damage > 0).slice(-160);
        for (const enemy of this.enemies) {
            if (enemy.hp <= 0) {
                this.armies[enemy.side].food += enemy.boss ? 20 : 1; if (enemy.side === 0) this.kills++;
                this.effects.push({id:this.nextId++,kind:'food',x:enemy.x,y:enemy.y,text:'+' + (enemy.boss ? 20 : 1),ttl:0.65,duration:0.65,side:enemy.side});
                this.revision++; continue;
            }
            enemy.slowed = Math.max(0, enemy.slowed - dt);
            if(enemy.bossType!==undefined){enemy.castIn=(enemy.castIn||0)-dt;if(enemy.castIn<=0){enemy.castIn=BOSSES[enemy.bossType].cooldown;this.bossSkill(enemy);}}
            enemy.held=Math.max(0,(enemy.held||0)-dt);
            let speed = enemy.speed * (enemy.slowed > 0 ? 0.3 : 1);
            if(enemy.held>0)speed=0;
            if(enemy.side===0&&this.has('silt'))speed*=.9;
            for(const hazard of this.hazards){const p=this.position(hazard.cell);if(enemy.side===0&&hazard.ttl>0&&Math.hypot(p.x-enemy.x,p.y-enemy.y)<40){hazard.ttl=0;if(hazard.kind==='mine')enemy.hp=0;else enemy.slowed=5;this.effect(hazard.kind,hazard.cell,0);}}
            if(enemy.side===0&&this.has('meteor')&&this.meteorTime<=0&&enemy.progress>(this.map.paths[0].length-3)*80){enemy.hp=0;this.meteorTime=3;this.effect('meteor',this.map.paths[0].slice(-2)[0],0);}
            enemy.progress += speed * dt; this.enemyPosition(enemy);
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
        return JSON.stringify({ version:1, map:this.map.id, seed:this.random.state, armies:this.armies, enemies:this.enemies, time:this.time,
            wave:this.wave, waveTime:this.waveTime, spawned:this.spawned, spawnTime:this.spawnTime, nextId:this.nextId, boosts:this.boosts,
            cooldowns:this.cooldowns, tutorialStep:this.tutorialStep, saveId:this.saveId, completed:this.completed, result:this.result,
            shots:this.shots,pendingAttacks:this.pendingAttacks,effects:this.effects,aiTime:this.aiTime,aiSilence:this.aiSilence,kills:this.kills,merges:this.merges,deployed:this.deployed,accumulator:this.accumulator,
            ranges:this.ranges,hazards:this.hazards,shovelTime:this.shovelTime,meteorTime:this.meteorTime,companions:this.companions,bossRound:this.bossRound,haze:this.haze });
    }
    static restore(text: string, profile: Profile, weapons: Weapon[]): Battle | null {
        try {
            const raw = JSON.parse(text); if (raw.version !== 1 || !MAPS[raw.map] || !Array.isArray(raw.armies) || raw.armies.length !== 2 || !Number.isFinite(raw.time)) return null;
            const b = new Battle(profile, weapons, raw.map, raw.seed);
            for (const army of raw.armies) {
                if (!Array.isArray(army.reserve) || army.reserve.length !== 5 || !Array.isArray(army.unlocked) || !army.units || !Number.isFinite(army.food) || !Number.isFinite(army.lives)) return null;
                for (const unit of [...army.reserve, ...Object.values(army.units)] as (Unit|null)[]) if (unit && (!Number.isInteger(unit.id) || !Number.isInteger(unit.level) || unit.level < 1 || unit.level > 5 || !['刀','弓','枪','骑','农','字','铲'].includes(unit.kind))) return null;
            }
            Object.assign(b, {armies:raw.armies,enemies:Array.isArray(raw.enemies) ? raw.enemies.slice(0,200) : [],time:raw.time,
                wave:Math.max(1,Math.min(20,raw.wave)),waveTime:raw.waveTime,spawned:raw.spawned,spawnTime:raw.spawnTime,nextId:raw.nextId,
                boosts:raw.boosts||{},cooldowns:raw.cooldowns||{},tutorialStep:raw.tutorialStep,saveId:raw.saveId,
                completed:!!raw.completed,result:raw.result||null,shots:raw.shots||[],pendingAttacks:Array.isArray(raw.pendingAttacks)?raw.pendingAttacks.filter((a:PendingAttack)=>a&&isBasicKind(a.kind)&&Number.isFinite(a.ttl)&&Number.isFinite(a.damage)&&Number.isFinite(a.range)&&[0,1].includes(a.side)&&Number.isInteger(a.cell)&&a.cell>=0&&a.cell<80).slice(0,160):[],effects:raw.effects||[],aiTime:raw.aiTime||1.5,
                aiSilence:raw.aiSilence||0,kills:raw.kills||0,merges:raw.merges||0,deployed:raw.deployed||0,accumulator:raw.accumulator||0,
                ranges:raw.ranges||{},hazards:raw.hazards||[],shovelTime:raw.shovelTime??60,meteorTime:raw.meteorTime||0,companions:raw.companions||{},bossRound:!!raw.bossRound,haze:raw.haze||0}); return b;
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
