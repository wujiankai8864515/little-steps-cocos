import { CARDS, SKINS, clamp, dayKey, random } from './Config';
export interface StoragePort { get(key: string): string | null; set(key: string, value: string): void; }
export interface Expedition { id: string; start: number; end: number; coins: number; card: string; fragments: number; quote: number; }
export interface Save {
    version: number; coins: number; earned: number; unlocked: number; cleared: number[];
    gender: 'male' | 'female'; skin: string; skins: string[];
    cards: Record<string, number>; fragments: Record<string, number>; equipped: string;
    spa: boolean; music: boolean; vibration: boolean; tutorial: boolean;
    expedition: Expedition | null; daily: string; runs: number; victories: number;
    records: {level: number; energy: number; mode: string; at: number}[]; settled: string[];
}
const PRIMARY = 'boss.save.v2';
const BACKUP = 'boss.save.v2.backup';
function defaults(): Save {
    return {version: 2, coins: 0, earned: 0, unlocked: 1, cleared: [], gender: 'male', skin: 'default', skins: ['default'],
        cards: {}, fragments: {}, equipped: '', spa: false, music: true, vibration: true, tutorial: false,
        expedition: null, daily: '', runs: 0, victories: 0, records: [], settled: []};
}
const integer = (v: any, max = 100000000) => typeof v === 'number' && Number.isFinite(v) ? Math.floor(clamp(v, 0, max)) : 0;
function restore(raw: any): Save | null {
    if (!raw || raw.version !== 2) return null;
    const s = defaults();
    for (const key of ['coins', 'earned', 'runs', 'victories']) (s as any)[key] = integer(raw[key]);
    s.unlocked = Math.max(1, integer(raw.unlocked, 25));
    s.cleared = Array.isArray(raw.cleared) ? [...new Set<number>(raw.cleared.filter((v: any) => Number.isInteger(v) && v >= 1 && v <= 25))] : [];
    s.gender = raw.gender === 'female' ? 'female' : 'male';
    s.skins = SKINS.filter(v => v.id === 'default' || Array.isArray(raw.skins) && raw.skins.includes(v.id)).map(v => v.id);
    s.skin = s.skins.includes(raw.skin) ? raw.skin : 'default';
    for (const card of CARDS) { s.cards[card.id] = integer(raw.cards?.[card.id], 999); s.fragments[card.id] = integer(raw.fragments?.[card.id], 999); }
    s.equipped = CARDS.some(c => c.id === raw.equipped && s.cards[c.id] > 0) ? raw.equipped : '';
    for (const key of ['music', 'vibration', 'tutorial', 'spa']) if (typeof raw[key] === 'boolean') (s as any)[key] = raw[key];
    s.daily = typeof raw.daily === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily) ? raw.daily : '';
    s.records = Array.isArray(raw.records) ? raw.records.filter((v: any) => Number.isInteger(v.level) && v.level >= 1 && v.level <= 25 &&
        Number.isFinite(v.energy) && v.energy >= 0 && Number.isFinite(v.at)).slice(0, 20) : [];
    s.settled = Array.isArray(raw.settled) ? raw.settled.filter((v: any) => typeof v === 'string').slice(-50) : [];
    const e = raw.expedition;
    if (e && typeof e.id === 'string' && Number.isFinite(e.start) && e.end === e.start + 600000 && CARDS.some(c => c.id === e.card))
        s.expedition = {...e, coins: Math.max(2, integer(e.coins, 50)), fragments: Math.max(1, integer(e.fragments, 3)), quote: integer(e.quote, 3)};
    return s;
}
export class GameStore {
    state: Save; persistenceError = ''; recovered = false;
    constructor(private storage: StoragePort) {
        let save: Save | null = null;
        for (const key of [PRIMARY, BACKUP]) {
            try { const raw = storage.get(key); if (raw) save = restore(JSON.parse(raw)); } catch (_) {}
            if (save) { this.recovered = key === BACKUP; break; }
        }
        this.state = save || defaults();
    }
    persist() {
        const json = JSON.stringify(this.state);
        try { this.storage.set(PRIMARY, json); this.storage.set(BACKUP, json); this.persistenceError = ''; }
        catch (_) { this.persistenceError = '本机存储暂不可用，请释放空间后重试'; }
    }
    addCoins(n: number) { this.state.coins += n; this.state.earned += n; }
    daily(now = Date.now()) {
        const key = dayKey(now);
        if (this.state.daily === key) return false;
        this.state.daily = key; this.addCoins(35); this.persist(); return true;
    }
    buySkin(id: string) {
        const skin = SKINS.find(v => v.id === id); if (!skin) return false;
        if (!this.state.skins.includes(id)) {
            if (this.state.coins < skin.cost) return false;
            this.state.coins -= skin.cost; this.state.skins.push(id);
        }
        this.state.skin = id; this.persist(); return true;
    }
    buyCard(id: string) {
        const card = CARDS.find(v => v.id === id); if (!card || this.state.coins < card.price || (this.state.cards[id] || 0) >= 999) return false;
        this.state.coins -= card.price; this.state.cards[id] = (this.state.cards[id] || 0) + 1; this.persist(); return true;
    }
    buyFragment(id: string) {
        if (!CARDS.some(c => c.id === id) || this.state.coins < 12 || (this.state.fragments[id] || 0) >= 999) return false;
        this.state.coins -= 12; this.state.fragments[id] = (this.state.fragments[id] || 0) + 1; this.persist(); return true;
    }
    craft(id: string) {
        if (!CARDS.some(c => c.id === id) || (this.state.fragments[id] || 0) < 9 || (this.state.cards[id] || 0) >= 999) return false;
        this.state.fragments[id] -= 9; this.state.cards[id] = (this.state.cards[id] || 0) + 1; this.persist(); return true;
    }
    equip(id: string) {
        if (id && !(this.state.cards[id] > 0)) return false;
        this.state.equipped = this.state.equipped === id ? '' : id; this.persist(); return true;
    }
    buySpa() {
        if (this.state.spa || this.state.coins < 25) return false;
        this.state.coins -= 25; this.state.spa = true; this.persist(); return true;
    }
    startEnergy() {
        return Math.max(this.state.spa ? 150 : 100, CARDS.find(v => v.id === this.state.equipped)?.energy || 100);
    }
    consumeStart() {
        const energy = this.startEnergy();
        if (this.state.equipped && this.state.cards[this.state.equipped] > 0) this.state.cards[this.state.equipped]--;
        this.state.equipped = ''; this.state.spa = false; this.state.runs++; this.persist(); return energy;
    }
    win(id: string, level: number, energy: number, mode: string, reward: number, now = Date.now()) {
        if (this.state.settled.includes(id)) return 0;
        this.state.settled.push(id); this.state.settled = this.state.settled.slice(-50);
        const first = mode === 'campaign' && !this.state.cleared.includes(level);
        const coins = reward + (first ? 30 : 0); this.addCoins(coins); this.state.victories++;
        if (mode === 'campaign') {
            if (first) this.state.cleared.push(level);
            this.state.unlocked = Math.max(this.state.unlocked, Math.min(25, level + 1));
        }
        this.state.records.push({level, energy: Math.floor(energy), mode, at: now});
        this.state.records.sort((a, b) => b.energy - a.energy || b.level - a.level);
        this.state.records = this.state.records.slice(0, 20); this.persist(); return coins;
    }
    dispatch(now = Date.now(), seed = now) {
        if (this.state.expedition) return false;
        const r = random(seed); this.state.expedition = {id: 'trip-' + now, start: now, end: now + 600000,
            coins: 2 + Math.floor(r() * 49), card: CARDS[Math.floor(r() * CARDS.length)].id,
            fragments: 1 + Math.floor(r() * 3), quote: Math.floor(r() * 4)};
        this.persist(); return true;
    }
    claimExpedition(now = Date.now()): Expedition | null {
        const e = this.state.expedition;
        if (!e || now < e.end) return null;
        this.state.expedition = null; this.addCoins(e.coins);
        this.state.fragments[e.card] = Math.min(999, (this.state.fragments[e.card] || 0) + e.fragments);
        this.persist(); return e;
    }
}
