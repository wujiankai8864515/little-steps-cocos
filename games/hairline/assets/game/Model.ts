export const BASIC = ['怼', '摆', '摸', '拖'];
export const PAIRS: Record<string, string> = { '病假': '病假', '工伤': '工伤', '外出': '外出', '中奖': '中奖' };
export const FRAGMENTS = ['病', '假', '工', '伤', '外', '出', '中', '奖'];
export const COEFFICIENT = [1, 1.5, 2.1, 2.73, 3.28];
export const DESCRIPTIONS: Record<string, string> = { 怼: '近战单体 · 尖嘴连怼\n攻击 3 / 范围 1 格', 摆: '中距穿刺 · 摆手减速\n攻击 2 / 范围 2 格', 摸: '远程单点 · 泡泡糊脸\n攻击 2 / 范围 3 格', 拖: '近战群伤 · 长钩回拽\n攻击 2 / 范围 1.5 格', 病假: '病 + 假\n每攻击 16 次，传染眩晕 2 秒', 工伤: '工 + 伤\n每攻击 20 次，直线索赔击退', 外出: '外 + 出\n沿路径来回冲刺，贯穿群伤', 中奖: '中 + 奖\n每攻击 30 次，天降横财打全场', 铲: '拖到邻近的灰格\n永久扩张 1 格鱼塘' };
export const CARDS = [{ id: 'payday', name: '带薪摸鱼', cost: 40, desc: '每 12 秒获得 3 窝囊费', kind: '被动' }, { id: 'garden', name: '工位自由', cost: 50, desc: '每 45 秒产出一把铲子', kind: '被动' }, { id: 'insurance', name: '拒绝内耗', cost: 35, desc: '每局一次，护住发际线 8 秒', kind: '主动' }, { id: 'lucky', name: '好运加持', cost: 65, desc: '合成单位攻击与技能频率 +15%', kind: '装备' }];
export type Unit = {
    id: number;
    kind: string;
    level: number;
    cell: number;
    cooldown: number;
    attacks: number;
    phase: number;
    patrol: number;
    direction: number;
    struck: number[];
};
export type Enemy = {
    id: number;
    kind: string;
    boss: number;
    hp: number;
    maxHp: number;
    progress: number;
    speed: number;
    slow: number;
    stun: number;
    hit: number;
};
export type Side = {
    hair: number;
    money: number;
    open: number[];
    units: Unit[];
    camp: (Unit | null)[];
    enemies: Enemy[];
    summons: number;
    shield: number;
    kills: number;
    aiClock: number;
    cards: string[];
};
export type Effect = {
    id: number;
    kind: string;
    from: number;
    to: number;
    side: number;
    ttl: number;
    text?: string;
};
export const ROUTE = [7, 15, 23, 31, 39, 38, 37, 36, 35, 34, 33, 32, 40, 48, 56, 64, 65, 66, 67, 68, 69, 70, 71];
export const INITIAL = [42, 43, 44, 50, 51, 52];
const FIXTURES = [0, 1, 2, 3, 4, 5, 6, 8, 16, 24, 47, 55, 63];
export function position(progress: number) { const i = Math.min(ROUTE.length - 2, Math.max(0, Math.floor(progress))), f = Math.max(0, Math.min(1, progress - i)), a = ROUTE[i], b = ROUTE[i + 1]; return { x: a % 8 + (b % 8 - a % 8) * f, y: Math.floor(a / 8) + (Math.floor(b / 8) - Math.floor(a / 8)) * f }; }
export function point(cell: number) { return { x: cell % 8, y: Math.floor(cell / 8) }; }
export function distance(a: {
    x: number;
    y: number;
}, b: {
    x: number;
    y: number;
}) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function dayKey(now = Date.now()) { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
export type Profile = {
    version: 1;
    coins: number;
    wins: number;
    games: number;
    best: number;
    difficulty: number;
    music: boolean;
    vibration: boolean;
    day: string;
    cards: string[];
    signed: string;
    achievements: string[];
    bossAvatar: string;
};
export function freshProfile(): Profile { return { version: 1, coins: 0, wins: 0, games: 0, best: 0, difficulty: 1, music: true, vibration: true, day: dayKey(), cards: [], signed: '', achievements: [], bossAvatar: '' }; }
export function loadProfile(raw: string | null): Profile { try {
    const x = JSON.parse(raw || 'null');
    if (!x || x.version !== 1)
        return freshProfile();
    const p = { ...freshProfile(), ...x };
    for (const k of ['coins', 'wins', 'games', 'best'])
        if (!Number.isSafeInteger(p[k]) || p[k] < 0)
            return freshProfile();
    p.difficulty = [0, 1, 2].includes(p.difficulty) ? p.difficulty : 1;
    p.cards = Array.isArray(p.cards) ? p.cards.filter(c => CARDS.some(v => v.id === c)) : [];
    p.achievements = Array.isArray(p.achievements) ? p.achievements : [];
    if (p.day !== dayKey()) {
        p.day = dayKey();
        p.cards = [];
    }
    return p;
}
catch {
    return freshProfile();
} }
export class Battle {
    version = 1;
    seed: number;
    aiSeed: number;
    nextId = 1;
    sides: Side[];
    time = 0;
    wave = 1;
    waveTime = 0;
    spawn = 0;
    spawnClock = 0;
    started = false;
    paused = false;
    ended = false;
    winner = -1;
    revived = false;
    meeting = 0;
    locked: number[] = [];
    aiLocked: number[] = [];
    effects: Effect[] = [];
    revision = 0;
    nextWave = 0;
    cardClock = 0;
    shovelClock = 0;
    insuranceUsed = false;
    receipts: string[] = [];
    notices: string[] = [];
    constructor(public difficulty = 1, seed = Date.now(), cards: string[] = []) { this.seed = seed >>> 0; this.aiSeed = (this.seed ^ 0x9e3779b9) >>> 0; this.sides = [this.side(cards), this.side([])]; }
    private side(cards: string[]): Side { return { hair: 3, money: 60, open: INITIAL.slice(), units: [], camp: [null, null, null, null, null], enemies: [], summons: 0, shield: 0, kills: 0, aiClock: 0, cards: cards.slice() }; }
    random(side = 0) { if (side === 1) {
        this.aiSeed = (Math.imul(this.aiSeed, 1664525) + 1013904223) >>> 0;
        return this.aiSeed / 4294967296;
    } this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
    unit(kind: string, cell = -1): Unit { return { id: this.nextId++, kind, level: 1, cell, cooldown: 0, attacks: 0, phase: 0, patrol:0, direction:1, struck:[] }; }
    cost(side = 0) { return 10 + this.sides[side].summons * 2; }
    notice(s: string) { this.notices.push(s); if (this.notices.length > 5)
        this.notices.shift(); }
    summon(side = 0) {
        const a = this.sides[side];
        if (this.ended || this.meeting > 0)
            return '开会中，稍等片刻';
        if (a.camp.some(Boolean))
            return '先安排好营地里的同事';
        const cost = this.cost(side);
        if (a.money < cost)
            return '窝囊费不足，击退狗腿子可以获得';
        a.money -= cost;
        for (let i = 0; i < 5; i++) {
            let kind: string;
            if (a.summons === 0)
                kind = [...BASIC, '铲'][i];
            else {
                const r = this.random(side);
                kind = r < .1 ? '铲' : r < .35 ? FRAGMENTS[Math.floor(this.random(side) * FRAGMENTS.length)] : BASIC[Math.floor(this.random(side) * 4)];
            }
            a.camp[i] = this.unit(kind);
        }
        a.summons++;
        this.revision++;
        return '';
    }
    buildable(cell: number, side = 0) { return Number.isInteger(cell) && cell >= 0 && cell < 72 && !ROUTE.includes(cell) && !FIXTURES.includes(cell) && !this.sides[side].open.includes(cell) && this.sides[side].open.some(c => Math.abs(c % 8 - cell % 8) + Math.abs(Math.floor(c / 8) - Math.floor(cell / 8)) === 1); }
    move(source: 'camp' | 'board', index: number, target: number, side = 0) {
        const a = this.sides[side];
        if (this.ended || this.meeting > 0)
            return '全员大会中';
        const u = source === 'camp' ? a.camp[index] : a.units.find(v => v.id === index);
        if (!u)
            return '没有选中单位';
        if (u.kind === '铲') {
            if (!this.buildable(target, side))
                return '铲子只能开拓相邻灰格';
            this.remove(source, index, side);
            a.open.push(target);
            this.revision++;
            return '';
        }
        if (!a.open.includes(target) || (side === 0 ? this.locked : this.aiLocked).includes(target))
            return '请放到已开放的鱼塘';
        if (u.cell === target && source === 'board')
            return '';
        const v = a.units.find(v => v.cell === target);
        if (v) {
            const pair = PAIRS[u.kind + v.kind] || PAIRS[v.kind + u.kind];
            if (pair || u.kind === v.kind && !FRAGMENTS.includes(u.kind) && u.level === v.level && u.level < 5) {
                this.remove(source, index, side);
                v.kind = pair || v.kind;
                v.level = pair ? 1 : v.level + 1;
                v.cooldown = 0;
                v.attacks = 0;
                this.effect('merge', target, target, side, 1, pair || '升阶！');
                if (pair)
                    this.notice(pair + '已激活');
            }
            else if (source === 'board') {
                v.cell = u.cell;
                u.cell = target;
            }
            else
                return '同名同级可合成，单字可凑成组合';
        }
        else {
            this.remove(source, index, side);
            u.cell = target;
            a.units.push(u);
        }
        this.revision++;
        return '';
    }
    returnToCamp(id: number) { const a = this.sides[0], u = a.units.find(v => v.id === id), slot = a.camp.indexOf(null); if (!u || slot < 0 || this.meeting > 0 || this.ended)
        return false; a.units = a.units.filter(v => v !== u); u.cell = -1; a.camp[slot] = u; this.revision++; return true; }
    recycle(source: 'camp' | 'board', index: number) { if (this.meeting > 0 || this.ended)
        return false; this.remove(source, index, 0); this.revision++; return true; }
    private remove(source: string, index: number, side: number) { const a = this.sides[side]; if (source === 'camp')
        a.camp[index] = null;
    else
        a.units = a.units.filter(u => u.id !== index); }
    effect(kind: string, from: number, to: number, side: number, ttl = .6, text?: string) { if (this.effects.length < 100)
        this.effects.push({ id: this.nextId++, kind, from, to, side, ttl, text }); }
    private spawnEnemy(side: number, boss = 0) { const hp = boss ? 110 * Math.pow(1.25, this.wave / 6) : 7 * Math.pow(1.2, this.wave - 1) * (this.spawn % 4 === 3 ? 1.6 : 1); const e: Enemy = { id: this.nextId++, kind: boss ? '老板' : this.spawn % 4 === 3 ? '关系户' : '狗腿子', boss, hp, maxHp: hp, progress: 0, speed: boss ? .24 : .42 + Math.min(.18, this.wave * .008), slow: 0, stun: 0, hit: 0 }; this.sides[side].enemies.push(e); return e; }
    private bossSkill(boss: number) { if (boss === 1) {
        for (let side = 0; side < 2; side++) {
            const locked = side === 0 ? this.locked : this.aiLocked, p = this.sides[side].open.filter(c => !locked.includes(c));
            for (let i = 0; i < Math.min(2, p.length); i++) {
                const j = Math.floor(this.random(side) * p.length);
                locked.push(p.splice(j, 1)[0]);
            }
        }
        this.revision++;
        this.notice('降本增效：鱼塘暂时封锁');
    } if (boss === 2) {
        this.meeting = 3;
        this.notice('全员大会：暂停操作 3 秒');
    } if (boss === 3)
        this.notice('末位淘汰：守住最后一根毛'); }
    private hit(side: number, e: Enemy, power: number, kind: string, from: number) {
        if (e.hp <= 0)
            return;
        e.hp -= power;
        e.hit = .22;
        this.effect(kind, from, e.progress, side, .38);
        if (kind === '摆' || kind === '病假')
            e.slow = Math.max(e.slow, 2);
        if (kind === '拖' || kind === '工伤')
            e.progress = Math.max(0, e.progress - .28);
        if (e.hp <= 0) {
            const a = this.sides[side];
            a.kills++;
            a.money += e.boss ? 30 : 2;
            this.effect('break', e.progress, e.progress, side, .65, '+' + (e.boss ? 30 : 2));
            if (e.boss) {
                this.effect('boss', e.progress, e.progress, side, 1.6, '需求已驳回');
                for (const other of a.enemies)
                    if (other !== e) {
                        other.hp = 0;
                        a.money += 2;
                        a.kills++;
                    }
                if (side === 0)
                    this.notice('需求已驳回！');
            }
        }
    }
    private attack(side: number, dt: number) {
        const a = this.sides[side];
        for (const u of a.units) {
            if (FRAGMENTS.includes(u.kind) || (side === 0 ? this.locked : this.aiLocked).includes(u.cell))
                continue;
            u.cooldown -= dt;
            u.phase += dt;
            if(u.kind==='外出'){
                u.patrol+=u.direction*dt*6;
                if(u.patrol>=ROUTE.length-1||u.patrol<=0){u.patrol=Math.max(0,Math.min(ROUTE.length-1,u.patrol));u.direction*=-1;u.struck=[];}
            }
            if (u.cooldown > 0)
                continue;
            const ranges: Record<string, number> = { 怼: 1.5, 摆: 2.5, 摸: 3.5, 拖: 2, 病假: 3, 工伤: 3, 外出: 1.2, 中奖: 20 };
            const origin=u.kind==='外出'?position(u.patrol):point(u.cell);
            const nearby = a.enemies.filter(e => e.hp > 0 && distance(origin, position(e.progress)) < ranges[u.kind] && (u.kind!=='外出'||!u.struck.includes(e.id))).sort((x, y) => y.progress - x.progress);
            if (!nearby.length)
                continue;
            const scale = COEFFICIENT[u.level - 1] * (a.cards.includes('lucky') && PAIRS[u.kind] ? 1.15 : 1);
            u.cooldown = 1 / (.85 * scale);
            u.attacks++;
            u.phase = 0;
            const power = (u.kind === '怼' ? 3 : u.kind === '工伤' ? 7 : PAIRS[u.kind] ? 4 : 2) * scale;
            if (u.kind === '摆' || u.kind === '拖' || u.kind === '病假')
                for (const e of nearby.slice(0, 5))
                    this.hit(side, e, power, u.kind, u.cell);
            else if (u.kind === '外出') {
                for (const e of nearby){this.hit(side,e,power*1.8,u.kind,u.patrol);u.struck.push(e.id);}
                u.cooldown=.12;
            }
            else
                this.hit(side, nearby[0], power, u.kind, u.cell);
            if (u.kind === '摸' && u.attacks % 18 === 0 && a.hair < 3) {
                a.hair++;
                this.effect('heal', u.cell, u.cell, side, 1, '+1 根毛');
            }
            const count = u.kind === '病假' ? 16 : u.kind === '工伤' ? 20 : u.kind === '中奖' ? 30 : 0;
            if (count && u.attacks % count === 0) {
                const targets = u.kind === '中奖' ? a.enemies : nearby;
                for (const e of targets) {
                    if (u.kind === '病假')
                        e.stun = 2;
                    this.hit(side, e, power * (u.kind === '工伤' ? 5 : 2), u.kind, u.cell);
                    if (u.kind === '工伤')
                        e.progress = Math.max(0, e.progress - 1.5);
                }
                this.effect('skill', u.cell, u.cell, side, 1.2, u.kind === '病假' ? '传染！' : u.kind === '工伤' ? '索赔成功' : '天降横财');
            }
        }
    }
    private ai(dt: number) {
        const a = this.sides[1];
        a.aiClock -= dt;
        if (a.aiClock > 0 || a.hair <= 0 || this.meeting > 0)
            return;
        a.aiClock = [2.8, 1.4, .65][this.difficulty];
        if (!a.camp.some(Boolean) && a.money >= this.cost(1))
            this.summon(1);
        for (let i = 0; i < 5; i++) {
            const u = a.camp[i];
            if (!u)
                continue;
            if (this.difficulty === 0 && this.random(1) < .22)
                continue;
            let target: number | undefined;
            if (u.kind === '铲')
                target = Array.from({ length: 72 }, (_, c) => c).find(c => this.buildable(c, 1));
            else
                target = a.units.find(v => v.kind === u.kind && v.level === u.level && v.level < 5 || !!(PAIRS[v.kind + u.kind] || PAIRS[u.kind + v.kind]))?.cell ?? a.open.find(c => !a.units.some(v => v.cell === c));
            if (target !== undefined)
                this.move('camp', i, target, 1);
            else if (FRAGMENTS.includes(u.kind) && this.random(1) < .2)
                a.camp[i] = null;
        }
        for (const u of a.units) {
            const v = a.units.find(v => v !== u && v.kind === u.kind && v.level === u.level && v.level < 5);
            if (v) {
                this.move('board', u.id, v.cell, 1);
                break;
            }
        }
    }
    tick(dt: number) {
        if (this.paused || this.ended || !this.started)
            return;
        dt = Math.max(0, Math.min(dt, .1));
        this.time += dt;
        this.waveTime += dt;
        this.meeting = Math.max(0, this.meeting - dt);
        this.ai(dt);
        this.cardClock += dt;
        this.shovelClock += dt;
        if (this.cardClock >= 12) {
            this.cardClock -= 12;
            if (this.sides[0].cards.includes('payday'))
                this.sides[0].money += 3;
        }
        if (this.shovelClock >= 45) {
            this.shovelClock -= 45;
            const a = this.sides[0], slot = a.camp.indexOf(null);
            if (a.cards.includes('garden') && slot >= 0) {
                a.camp[slot] = this.unit('铲');
                this.revision++;
            }
        }
        const count = Math.min(26, 3 + this.wave * 2);
        this.spawnClock -= dt;
        if (this.spawn < count && this.spawnClock <= 0) {
            this.spawnClock = 1.7;
            this.spawn++;
            const boss = this.wave % 6 === 0 && this.spawn === count ? ((this.wave / 6 - 1) % 3) + 1 : 0;
            for (let side = 0; side < 2; side++)
                this.spawnEnemy(side, boss);
            if (boss)
                this.bossSkill(boss);
        }
        for (let side = 0; side < 2; side++) {
            const a = this.sides[side];
            a.shield = Math.max(0, a.shield - dt);
            this.attack(side, dt);
            for (const e of a.enemies) {
                if (e.hp <= 0)
                    continue;
                e.hit = Math.max(0, e.hit - dt);
                e.stun = Math.max(0, e.stun - dt);
                e.slow = Math.max(0, e.slow - dt);
                if (e.stun <= 0)
                    e.progress += dt * e.speed * (e.slow > 0 ? .45 : 1) * (e.boss === 3 && a.hair === 1 ? 1.9 : 1);
                if (e.progress >= ROUTE.length - 1) {
                    e.hp = 0;
                    if (a.shield <= 0) {
                        a.hair = Math.max(0, a.hair - 1);
                        this.effect('hair', 71, 71, side, 1, '又掉了一根');
                        if (side === 0)
                            this.notice('又掉了一根');
                    }
                }
            }
            a.enemies = a.enemies.filter(e => e.hp > 0);
        }
        this.effects = this.effects.filter(e => (e.ttl -= dt) > 0);
        if (this.sides[0].hair <= 0 || this.sides[1].hair <= 0) {
            this.ended = true;
            this.winner = this.sides[0].hair <= 0 ? 1 : 0;
            return;
        }
        if (this.spawn >= count && this.sides.every(a => a.enemies.length === 0)) {
            this.nextWave += dt;
            if (this.nextWave > 2) {
                this.wave++;
                this.waveTime = 0;
                this.spawn = 0;
                this.spawnClock = 2;
                this.nextWave = 0;
                this.locked = [];
                this.aiLocked = [];
                this.revision++;
                for (const a of this.sides)
                    a.money += 8;
                this.notice('第 ' + this.wave + ' 波 · 继续摸鱼');
            }
        }
    }
    activateInsurance() { if (this.insuranceUsed || !this.sides[0].cards.includes('insurance') || this.ended)
        return false; this.insuranceUsed = true; this.sides[0].shield = 8; return true; }
    reward(kind: 'shovel' | 'shield' | 'money' | 'revive', receipt: string) { if (!receipt || this.receipts.includes(receipt) || kind !== 'revive' && this.ended)
        return false; const a = this.sides[0]; if (kind === 'revive' && (!this.ended || this.winner !== 1 || this.revived))
        return false; if (kind === 'shovel' && a.camp.indexOf(null) < 0)
        return false; this.receipts.push(receipt); if (kind === 'shovel')
        a.camp[a.camp.indexOf(null)] = this.unit('铲'); if (kind === 'shield')
        a.shield = 8; if (kind === 'money')
        a.money += 30; if (kind === 'revive') {
        this.revived = true;
        this.ended = false;
        this.winner = -1;
        a.hair = 1;
        a.shield = 8;
    } this.revision++; return true; }
    serialize() { return JSON.stringify(this); }
    static restore(raw: string): Battle | null {
        try {
            if (raw.length > 300000)
                return null;
            const x = JSON.parse(raw);
            if (x?.version !== 1 || !Array.isArray(x.sides) || x.sides.length !== 2 || ![0, 1, 2].includes(x.difficulty) || !Number.isInteger(x.wave) || x.wave < 1 || x.wave > 999 || !Number.isFinite(x.time) || x.time < 0)
                return null;
            const ids = new Set<number>();
            for (const a of x.sides) {
                if (!Number.isInteger(a.hair) || a.hair < 0 || a.hair > 3 || !Number.isFinite(a.money) || a.money < 0 || !Array.isArray(a.open) || new Set(a.open).size !== a.open.length || !a.open.every(c => Number.isInteger(c) && c >= 0 && c < 72 && !ROUTE.includes(c)) || a.units?.length > 72 || a.camp?.length !== 5 || a.enemies?.length > 100)
                    return null;
                const cells = new Set<number>();
                for (const u of [...a.units, ...a.camp.filter(Boolean)]) {
                    u.patrol??=0;u.direction??=1;u.struck??=[];
                    if (ids.has(u.id) || !Number.isSafeInteger(u.id) || ![...BASIC, ...FRAGMENTS, ...Object.keys(PAIRS), '铲'].includes(u.kind) || !Number.isInteger(u.level) || u.level < 1 || u.level > 5 || ![u.cooldown, u.attacks, u.phase].every(Number.isFinite))
                        return null;
                    if(!Number.isFinite(u.patrol)||u.patrol<0||u.patrol>ROUTE.length-1||![1,-1].includes(u.direction)||!Array.isArray(u.struck)||u.struck.length>100||!u.struck.every(Number.isSafeInteger))return null;
                    ids.add(u.id);
                }
                for (const u of a.units) {
                    if (!a.open.includes(u.cell) || cells.has(u.cell) || u.kind === '铲')
                        return null;
                    cells.add(u.cell);
                }
                for (const e of a.enemies)
                    if (![e.hp, e.maxHp, e.progress, e.speed, e.slow, e.stun, e.hit].every(Number.isFinite) || e.progress < 0 || e.progress > ROUTE.length || e.speed <= 0)
                        return null;
            }
            if (!Number.isSafeInteger(x.nextId) || x.nextId <= Math.max(0, ...ids))
                return null;
            const b = new Battle(x.difficulty);
            Object.assign(b, x);
            if(!Number.isFinite(b.aiSeed))b.aiSeed=(b.seed^0x9e3779b9)>>>0;
            b.paused = false;
            b.effects = [];
            return b;
        }
        catch {
            return null;
        }
    }
}
