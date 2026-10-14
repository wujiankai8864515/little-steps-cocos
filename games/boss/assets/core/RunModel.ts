import {Level, ItemId, ITEMS, MAX_ENERGY, clamp, random} from './Config';
export interface Gate { add: number; mul: number; name: string; }
export interface Row { at: number; kind: 'gate' | 'item' | 'encounter' | 'skill'; gates?: Gate[]; items?: (ItemId | null)[]; enemy?: number; }
export type Phase = 'ready' | 'running' | 'intro' | 'duel' | 'result';
export interface RunEvent { text: string; good: boolean; kind: string; }
const perks = ['带薪休假', '准时下班', '奖金到账', '拒绝内耗', '弹性办公', '成果被认可'];
const traps = ['无偿加班', '临时需求', '深夜开会', '绩效画饼', '替人背锅'];
export function gateValue(energy: number, gate: Gate) { return Math.floor(clamp(energy * gate.mul + gate.add, 0, MAX_ENERGY)); }
export function gateLabel(gate: Gate) {
    const m = gate.mul !== 1 ? (gate.mul < 1 ? '÷' + +(1 / gate.mul).toFixed(2) : '×' + gate.mul) : '';
    const a = gate.add ? (gate.add > 0 ? '+' : '−') + Math.abs(gate.add) : '';
    return m + a || '+0';
}
export function flipGate(g: Gate): Gate {
    return {...g, mul: g.mul === 1 ? 1 : 1 / g.mul, add: -g.add, name: '陷阱对调'};
}
export function buildTrack(level: Level, seed: number, mode = 'campaign'): Row[] {
    const r = random(seed); const rows: Row[] = [];
    const scale = 1 + (level.companyId - 1) * .45;
    const pick = (a: any[]) => a[Math.floor(r() * a.length)];
    for (let i = 0; i < level.gateCount; i++) {
        const good: Gate = {add: Math.round((25 + r() * 35) * scale), mul: 1, name: pick(perks)};
        if (i % 5 === 3) { good.mul = level.companyId >= 3 ? 1.5 : 1.25; good.add = level.companyId >= 4 ? 20 : 0; }
        const bad: Gate = {add: -Math.round((20 + r() * 30) * scale), mul: 1, name: pick(traps)};
        if (i % 6 === 4) { bad.mul = .5; bad.add = level.companyId >= 4 ? -20 : 0; }
        const neutral: Gate = {add: Math.round((8 + r() * 28) * scale), mul: 1, name: '小小的幸福'};
        const gates = [good, bad, neutral];
        for (let j = 2; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [gates[k], gates[j]] = [gates[j], gates[k]]; }
        rows.push({at: (i + 1) / (level.gateCount + 1), kind: 'gate', gates});
    }
    const goods: ItemId[] = ['food', 'fish', 'raise', 'ally'];
    const bads: ItemId[] = ['overtime', 'thief', 'block', 'layoff'];
    if (level.companyId >= 4) bads.push('fired');
    for (let i = 0; i < level.itemCount; i++) {
        const items: (ItemId | null)[] = [null, null, null];
        const lane = Math.floor(r() * 3);
        items[lane] = r() < .025 ? 'lottery' : pick(goods);
        items[(lane + 1 + Math.floor(r() * 2)) % 3] = pick(bads);
        rows.push({at: (i + .65) / (level.itemCount + 1), kind: 'item', items});
    }
    for (let i = 0; i < level.encounterCount; i++) rows.push({at: .3 + i * .37, kind: 'encounter', enemy: 100 + level.id * 20});
    if (level.bossSkillText || mode === 'brawl') rows.push({at: .48, kind: 'skill'});
    rows.sort((a, b) => a.at - b.at);
    // Separate choices by at least 1.9 s; include a clear approach to the office.
    rows.forEach((row, i) => row.at = 6 + i * 138 / Math.max(1, rows.length - 1));
    return rows;
}
export class RunModel {
    readonly id: string; readonly rows: Row[]; readonly length = 150;
    phase: Phase = 'ready'; phaseTime = 3; remaining = 180; distance = 0; cursor = 0;
    energy: number; lane = 1; x = 0; paused = false; won = false; reason = ''; reviveUsed = false;
    fish = 0; ally = 0; thief = false; trap = 0; stop = 0; slow = 0; rush = 0;
    noPickup = 0; badItems = 0; fakeEnergy = 0; fakeTime = 0; fakePenalty = 0;
    lotteryUsed = false; beforeFailure = 100; skillCompany: number;
    events: RunEvent[] = [];
    constructor(readonly level: Level, readonly mode: string, startEnergy: number, seed: number, id = 'run-' + Date.now() + '-' + seed) {
        this.energy = startEnergy; this.beforeFailure = startEnergy; this.id = id;
        this.rows = buildTrack(level, seed, mode); this.skillCompany = mode === 'brawl' ? 1 + Math.floor(random(seed ^ 758)() * 5) : level.companyId;
    }
    move(x: number) { this.x = clamp(x, -1, 1); this.lane = this.x < -.333 ? 0 : this.x > .333 ? 2 : 1; }
    speed() {
        if (this.stop > 0) return 0;
        if (this.rush > 0) return this.skillCompany === 4 && this.level.id % 5 === 0 ? (Math.floor(this.rush) % 2 ? 5 : 1) : 3;
        if (this.slow > 0) return this.level.id % 5 === 0 ? 1 / 3 : .5;
        return 1;
    }
    step(dt: number) {
        if (this.paused || this.phase === 'result' || !Number.isFinite(dt) || dt <= 0) return;
        // Fixed substeps make collisions and status expiry independent of frame rate.
        while (dt > .00001 && (this.phase as Phase) !== 'result') { const t = Math.min(dt, .05); this.tick(t); dt -= t; }
    }
    private tick(dt: number) {
        this.remaining = Math.max(0, this.remaining - dt);
        if (this.phase === 'ready' || this.phase === 'intro' || this.phase === 'duel') {
            this.phaseTime -= dt;
            if (this.phaseTime <= 0) {
                if (this.phase === 'ready') { this.phase = 'running'; this.emit('出发！准时下班，不再内耗', true, 'start'); }
                else if (this.phase === 'intro') { this.phase = 'duel'; this.phaseTime = 8; }
                else { this.won = this.energy >= this.level.bossEnergy; this.phase = 'result'; this.reason = this.won ? '老板认怂了！' : '精力不足'; }
            }
            return;
        }
        if (this.remaining <= 0) { this.fail('超时：三分钟内未到办公室'); return; }
        const speed = this.speed();
        for (const key of ['fish', 'stop', 'slow', 'rush', 'noPickup']) (this as any)[key] = Math.max(0, (this as any)[key] - dt);
        if (this.fakeTime > 0) {
            this.fakeTime -= dt;
            if (this.fakeTime <= 0) { this.fakeEnergy = 0; this.changeEnergy(Math.floor(this.energy * (1 - this.fakePenalty))); this.emit('画饼到期 · 真实精力被扣除', false, 'hit'); }
        }
        if (this.phase !== 'running') return;
        this.distance = Math.min(this.length, this.distance + dt * speed);
        while (this.cursor < this.rows.length && this.rows[this.cursor].at <= this.distance && this.phase === 'running') {
            const row = this.rows[this.cursor++]; this.resolve(row);
            // A dismissal changes distance/cursor; break so the next loop uses the new route.
            if (this.distance < row.at) break;
        }
        if (this.distance >= this.length && this.phase === 'running') { this.fakeEnergy = 0; this.phase = 'intro'; this.phaseTime = 3; this.emit('向老板开炮！', true, 'boss'); }
    }
    effectiveGate(g: Gate) { return this.trap > 0 ? flipGate(g) : g; }
    private changeEnergy(value: number) {
        this.beforeFailure = Math.max(1, this.energy); this.energy = Math.floor(clamp(value, 0, MAX_ENERGY));
        if (this.energy === 0) this.fail('精力耗尽：打工人需要休息');
    }
    private shield() {
        if (this.fish > 0) { this.emit('摸鱼无敌 · 已无视这次障碍', true, 'shield'); return true; }
        if (this.ally > 0) { this.ally--; this.emit('同事替你背锅了', true, 'shield'); return true; }
        return false;
    }
    resolve(row: Row) {
        if (row.kind === 'gate') {
            const gate = this.effectiveGate(row.gates![this.lane]);
            const value = gateValue(this.energy, gate); const good = value >= this.energy;
            if (this.trap > 0) this.trap--;
            if (!good && this.shield()) return;
            if (good && this.thief) { this.thief = false; this.emit('内卷同事抢走了这次增益', false, 'hit'); return; }
            const diff = value - this.energy; this.changeEnergy(value);
            this.emit(gate.name + ' · ' + (diff >= 0 ? '+' : '−') + Math.abs(diff) + ' 精力', good, good ? 'pickup' : 'hit');
        } else if (row.kind === 'item') {
            let item = row.items![this.lane];
            if (this.badItems > 0) { this.badItems--; if (item && ITEMS[item].good) item = 'overtime'; }
            if (item) this.applyItem(item);
        } else if (row.kind === 'encounter') {
            if (this.energy > row.enemy!) { this.changeEnergy(this.energy + Math.floor(row.enemy! * .1)); this.emit('击退狗腿子 · 精力 +' + Math.floor(row.enemy! * .1), true, 'encounter'); }
            else if (!this.shield()) { this.changeEnergy(Math.floor(this.energy * .8)); this.emit('遭遇严苛主管 · 精力 −20%', false, 'encounter'); }
        } else this.applySkill();
    }
    applyItem(id: ItemId) {
        if (ITEMS[id].good && this.noPickup > 0) { this.emit('奋斗契约生效 · 暂时无法拾取福利', false, 'hit'); return; }
        if (!ITEMS[id].good && this.shield()) return;
        switch (id) {
            case 'food': this.changeEnergy(this.energy + 30); break;
            case 'raise': this.changeEnergy(this.energy + 100); break;
            case 'fish': this.fish = 10; break;
            case 'ally': this.ally = Math.min(3, this.ally + 1); break;
            case 'lottery': if (this.lotteryUsed) { this.emit('彩票每局只能中奖一次', true, 'pickup'); return; } this.lotteryUsed = true; this.changeEnergy(this.energy + 5000); break;
            case 'overtime': this.changeEnergy(this.energy - 20); break;
            case 'thief': this.thief = true; break;
            case 'block': this.stop = 5; break;
            case 'layoff': this.changeEnergy(this.energy - 50); this.trap = 2; break;
            case 'fired': this.distance = 0; this.cursor = 0; this.emit('裁员：回到起点，精力保留', false, 'hit'); break;
        }
        this.emit(ITEMS[id].tip, ITEMS[id].good, ITEMS[id].good ? 'pickup' : 'hit');
    }
    applySkill() {
        const ultimate = this.level.id % 5 === 0;
        switch (this.skillCompany) {
            case 1: this.changeEnergy(Math.floor(this.energy * (ultimate ? .4 : .5))); if (ultimate) this.noPickup = 5; break;
            case 2: this.trap = ultimate ? 5 : 3; if (ultimate) this.changeEnergy(Math.floor(this.energy * .7)); break;
            case 3: this.slow = 10; if (ultimate) this.badItems = 3; break;
            case 4: this.rush = ultimate ? 10 : 8; break;
            case 5: this.fakeEnergy = ultimate ? 100 : 50; this.fakeTime = ultimate ? 10 : 8; this.fakePenalty = ultimate ? .5 : .2; break;
        }
        this.emit(['奋斗契约：精力被扣除', '天外飞锅：接下来的门会对调', '无限加班：前进速度放慢', '夺命 OKR：赛道突然加速', '灵魂画饼：虚假精力将在到期后消失'][this.skillCompany - 1], false, 'skill');
    }
    fail(reason: string) { this.phase = 'result'; this.won = false; this.reason = reason; }
    revive() {
        if (this.phase !== 'result' || this.won || this.reviveUsed) return false;
        this.reviveUsed = true; this.energy = Math.max(1, Math.floor((this.energy || this.beforeFailure) * .8));
        this.distance = Math.min(this.distance, this.length * .65); this.cursor = this.rows.findIndex(r => r.at > this.distance);
        if (this.cursor < 0) this.cursor = this.rows.length;
        this.remaining = 75; this.fish = 4; this.fakeEnergy = this.fakeTime = this.stop = this.slow = this.rush = this.trap = this.noPickup = this.badItems = 0;
        this.thief = false; this.paused = false; this.phase = 'ready'; this.phaseTime = 3;
        this.emit('恢复 80% 剩余精力 · 返回赛道', true, 'revive'); return true;
    }
    emit(text: string, good: boolean, kind: string) { this.events.push({text, good, kind}); if (this.events.length > 20) this.events.shift(); }
}
