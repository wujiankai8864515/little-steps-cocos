import type { Action, Mod, Snapshot } from '../../foundation/Contracts';
import { clone, validateJson } from '../../foundation/Data';
import type { CatalogConfig, QuestMetric } from './CatalogConfig';
import { manifest } from './ModManifest';

export type CatalogPage = 'catalog' | 'details' | 'quests' | 'collections' | 'settings' | 'favourites' | 'intro' | 'rating' | 'restart';
export interface StoryProgress {
    snapshot: Snapshot | null;
    pageIndex: number;
    pageCount: number;
    highestPage: number;
    finished: boolean;
    liked: boolean;
    favourite: boolean;
    rating: number;
}
export interface CatalogState {
    schemaVersion: 1;
    page: CatalogPage;
    returnPage: CatalogPage;
    selectedStory: string;
    selectedLevel: string;
    coins: number;
    gems: number;
    stories: Record<string, StoryProgress>;
    completedLevels: string[];
    settings: { music: boolean; sound: boolean; haptics: boolean };
    daily: { day: number; counts: Record<QuestMetric, number>; claimed: string[] };
    nextRound: number;
    round: { id: number; levelId: string; complete: boolean; entryRefundable: boolean } | null;
}
export interface CatalogPorts { render(state: Readonly<CatalogState>, action: Action): void; save(state: Readonly<CatalogState>): void; }
export const utcDay = (now = Date.now()): number => Math.floor(now / 86400000);
const freshProgress = (): StoryProgress => ({ snapshot: null, pageIndex: 0, pageCount: 0, highestPage: 0, finished: false, liked: false, favourite: false, rating: 0 });
const freshDaily = (day: number): CatalogState['daily'] => ({ day, counts: { login: 1, choices: 0, gemChoices: 0, wins: 0, ads: 0 }, claimed: [] });
const PAGES: readonly CatalogPage[] = ['catalog','details','quests','collections','settings','favourites','intro','rating','restart'];
const count = (v: any): boolean => Number.isSafeInteger(v) && v >= 0;
const record = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: any): boolean => Array.isArray(v) && v.every(x => typeof x === 'string') && new Set(v).size === v.length;
export function initialCatalogState(config: CatalogConfig, day = utcDay()): CatalogState {
    return {
        schemaVersion: 1, page: 'catalog', returnPage: 'catalog', selectedStory: config.stories[0].id, selectedLevel: '',
        coins: config.economy.initialCoins, gems: config.economy.initialGems,
        stories: Object.fromEntries(config.stories.map(s => [s.id, freshProgress()])), completedLevels: [],
        settings: { music: true, sound: true, haptics: true }, daily: freshDaily(day), nextRound: 1, round: null,
    };
}
export function validateCatalogState(s: any): asserts s is CatalogState {
    validateJson(s);
    if (!record(s) || s.schemaVersion !== 1 || !PAGES.includes(s.page) || !PAGES.includes(s.returnPage) ||
        typeof s.selectedStory !== 'string' || typeof s.selectedLevel !== 'string' || !count(s.coins) || !count(s.gems) ||
        !record(s.stories) || !strings(s.completedLevels) || !record(s.settings) ||
        !['music','sound','haptics'].every(k => typeof s.settings[k] === 'boolean') || !count(s.nextRound) || s.nextRound < 1 ||
        !record(s.daily) || !count(s.daily.day) || !record(s.daily.counts) || !strings(s.daily.claimed) ||
        !['login','choices','gemChoices','wins','ads'].every(k => count(s.daily.counts[k]))) throw new Error('目录存档结构无效');
    for (const p of Object.values(s.stories) as any[]) {
        if (!record(p) || ![p.pageIndex,p.pageCount,p.highestPage,p.rating].every(count) || p.rating > 5 ||
            (p.pageCount > 0 && p.pageIndex >= p.pageCount) || p.highestPage > p.pageCount ||
            !['finished','liked','favourite'].every(k => typeof p[k] === 'boolean') ||
            !(p.snapshot === null || (record(p.snapshot) && p.snapshot.schemaVersion === 1 && typeof p.snapshot.fingerprint === 'string' && record(p.snapshot.state) && Array.isArray(p.snapshot.history)))) {
            throw new Error('剧情进度存档无效');
        }
    }
    if (s.round !== null && (!record(s.round) || !count(s.round.id) || s.round.id < 1 || s.round.id >= s.nextRound ||
        typeof s.round.levelId !== 'string' || typeof s.round.complete !== 'boolean' || typeof s.round.entryRefundable !== 'boolean')) throw new Error('卡牌会话存档无效');
}

/** Persistent product state uses the same synchronous transaction contract as the game. */
export function createCatalogMod(config: CatalogConfig, levels: readonly string[], saved?: CatalogState | null, ports?: CatalogPorts, clock: () => number = utcDay): Mod {
    if (!levels.length || new Set(levels).size !== levels.length) throw new Error('卡牌目录为空或重复');
    const initial = saved ? clone(saved) : initialCatalogState(config, clock());
    validateCatalogState(initial);
    for (const s of config.stories) initial.stories[s.id] ??= freshProgress();
    // A native abort can prevent the normal entry-failure callback. Recover the unplayed
    // entry transaction once; an already played or completed round cannot be refunded.
    if (initial.round?.entryRefundable && !initial.round.complete) initial.coins = Math.min(Number.MAX_SAFE_INTEGER, initial.coins + config.economy.entryCost);
    // Returning from an interrupted game preserves its last committed balance and progress.
    initial.page = 'catalog'; initial.returnPage = 'catalog'; initial.round = null;
    if (!config.stories.some(s => s.id === initial.selectedStory)) initial.selectedStory = config.stories[0].id;
    return {
        manifest, initialState: initial,
        actions: ['shell.open','shell.page','shell.story','shell.like','shell.favourite','shell.rate','shell.setting','shell.claim','shell.start','shell.abort','shell.card','shell.avg','shell.reset'],
        validate(states) { validateCatalogState(states[manifest.id]); },
        execute(ctx) {
            const s = ctx.draft[manifest.id] as CatalogState;
            const day = clock();
            if (day > s.daily.day) s.daily = freshDaily(day);
            const payload = ctx.action.payload ?? {};
            const story = config.stories.find(story => story.id === s.selectedStory)!;
            const progress = s.stories[s.selectedStory];
            const amount = (value: number) => { if (!count(value)) ctx.reject('金币数值无效'); return value; };
            switch (ctx.action.type) {
                case 'shell.open': s.page = 'catalog'; break;
                case 'shell.page':
                    if (!PAGES.includes(payload.page)) ctx.reject('页面不存在');
                    if (payload.page !== s.page && ['quests','settings','collections','rating','restart'].includes(payload.page)) s.returnPage = s.page;
                    s.page = payload.page;
                    if (s.page === 'intro') {
                        if (payload.levelId !== undefined && !levels.includes(payload.levelId)) ctx.reject('关卡不存在');
                        s.selectedLevel = payload.levelId ?? levels.find(id => !s.completedLevels.includes(id)) ?? levels[levels.length - 1];
                    }
                    break;
                case 'shell.story':
                    if (!config.stories.some(story => story.id === payload.id)) ctx.reject('剧情不存在');
                    s.selectedStory = payload.id; s.page = 'details'; break;
                case 'shell.like': progress.liked = !progress.liked; break;
                case 'shell.favourite': progress.favourite = !progress.favourite; break;
                case 'shell.rate':
                    if (!Number.isInteger(payload.rating) || payload.rating < 1 || payload.rating > 5) ctx.reject('评分无效');
                    progress.rating = payload.rating; s.page = 'details'; break;
                case 'shell.setting':
                    if (!['music','sound','haptics'].includes(payload.key)) ctx.reject('设置不存在');
                    const key = payload.key as keyof CatalogState['settings']; s.settings[key] = !s.settings[key]; break;
                case 'shell.claim': {
                    const q = config.quests.find(q => q.id === payload.id);
                    if (!q || s.daily.claimed.includes(q.id) || s.daily.counts[q.id] < q.target) return ctx.reject('奖励未达成或已领取');
                    s.coins = amount(s.coins + q.reward); s.daily.claimed.push(q.id); break;
                }
                case 'shell.start':
                    if (s.round && !s.round.complete) ctx.reject('牌局已开始');
                    if (s.page !== 'intro' || !levels.includes(s.selectedLevel)) ctx.reject('请先选择关卡');
                    if (s.coins < config.economy.entryCost) ctx.reject(`金币不足（需要 ${config.economy.entryCost}）`);
                    s.coins -= config.economy.entryCost;
                    s.round = { id: s.nextRound++, levelId: s.selectedLevel, complete: false, entryRefundable: true }; break;
                case 'shell.abort':
                    if (!s.round || s.round.id !== payload.roundId || !s.round.entryRefundable) ctx.reject('牌局已结算，不能退还入场费');
                    s.coins = amount(s.coins + config.economy.entryCost); s.round = null; s.page = 'intro'; break;
                case 'shell.card':
                    if (!s.round || s.round.id !== payload.roundId) return ctx.reject('过期牌局结果');
                    if (typeof payload.complete !== 'boolean') ctx.reject('牌局结果无效');
                    s.coins = amount(payload.coins);
                    if (payload.played) s.round.entryRefundable = false;
                    if (payload.complete && !s.round.complete) {
                        s.round.complete = true; s.round.entryRefundable = false;
                        if (!s.completedLevels.includes(s.round.levelId)) s.completedLevels.push(s.round.levelId);
                        s.daily.counts.wins++; // A repeated callback in the same round cannot count again.
                    }
                    break;
                case 'shell.avg': {
                    if (payload.storyId !== story.id || !count(payload.pageIndex) || !count(payload.pageCount) || payload.pageCount < 1 || payload.pageIndex >= payload.pageCount || typeof payload.finished !== 'boolean') ctx.reject('剧情进度无效');
                    progress.snapshot = clone(payload.snapshot);
                    progress.pageIndex = payload.pageIndex; progress.pageCount = payload.pageCount;
                    progress.highestPage = Math.max(progress.highestPage, payload.pageIndex + 1); progress.finished = payload.finished;
                    if (payload.choice === true) s.daily.counts.choices++;
                    break;
                }
                case 'shell.reset':
                    progress.snapshot = null; progress.pageIndex = 0; progress.finished = false; s.page = 'details'; break;
                default: ctx.reject('目录动作不存在');
            }
            ctx.result = { page: s.page };
        },
        afterCommit: ctx => ports?.save(ctx.state[manifest.id] as CatalogState),
        render: ctx => [{ id: 'shell.catalog', timeoutMs: 5000, run: () => ports?.render(ctx.state[manifest.id] as CatalogState, ctx.action) }],
    };
}

export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const SAVE_KEY = 'avg-plus.catalog.v1';
/** A previous valid generation survives an interrupted or corrupt storage write. */
export function loadCatalogSave(storage: SaveStorage): CatalogState | null {
    for (const key of [SAVE_KEY, SAVE_KEY + '.previous']) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        try { const value = JSON.parse(raw); validateCatalogState(value); return value; }
        catch { /* Keep rejected bytes intact; try the previous committed generation. */ }
    }
    if (storage.getItem(SAVE_KEY) || storage.getItem(SAVE_KEY + '.previous')) throw new Error('目录存档损坏，已保留原存档');
    return null;
}
export function saveCatalogState(storage: SaveStorage, value: Readonly<CatalogState>): void {
    validateCatalogState(value);
    const raw = JSON.stringify(value);
    const previous = storage.getItem(SAVE_KEY);
    if (previous) {
        try { validateCatalogState(JSON.parse(previous)); storage.setItem(SAVE_KEY + '.previous', previous); }
        catch (error) { if (!(error instanceof SyntaxError) && !String(error).includes('存档')) throw error; }
    }
    storage.setItem(SAVE_KEY, raw);
    if (storage.getItem(SAVE_KEY) !== raw) throw new Error('目录存档写入未确认');
}
