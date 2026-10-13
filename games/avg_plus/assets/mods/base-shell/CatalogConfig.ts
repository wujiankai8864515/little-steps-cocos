export interface EconomyConfig {
    readonly initialCoins: number;
    readonly initialGems: number;
    readonly entryCost: number;
    readonly rollback: { readonly base: number; readonly increment: number };
    readonly wild: { readonly base: number; readonly increment: number };
    readonly addBackup: { readonly base: number; readonly increment: number };
}
export interface CollectionConfig {
    readonly id: string;
    readonly title: string;
    readonly asset: string;
    /** The original AVG page number that makes this item available. */
    readonly unlockPage: number;
}
export interface StoryConfig {
    readonly id: string;
    readonly chapterId: string;
    readonly title: string;
    readonly subtitle: string;
    readonly synopsis: string;
    readonly bundle: string;
    readonly background: string;
    readonly roles: readonly string[];
    readonly collections: readonly CollectionConfig[];
}
export type QuestMetric = 'login' | 'choices' | 'gemChoices' | 'wins' | 'ads';
export interface QuestConfig {
    readonly id: QuestMetric;
    readonly label: string;
    readonly target: number;
    readonly reward: number;
}
export interface CatalogConfig {
    readonly schemaVersion: 1;
    readonly economy: EconomyConfig;
    readonly stories: readonly StoryConfig[];
    readonly quests: readonly QuestConfig[];
    readonly cardBackground?: CardBackgroundConfig;
}
export interface CardBackgroundConfig { readonly spritePath: string; readonly focalX: number; readonly focalY: number; }
const ID = /^[A-Za-z0-9_-]+$/;
const ASSET = /^(backgrounds|roles)\/[A-Za-z0-9_-]+$/;
const METRICS: readonly QuestMetric[] = ['login', 'choices', 'gemChoices', 'wins', 'ads'];
const record = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const amount = (v: any): boolean => Number.isSafeInteger(v) && v >= 0 && v <= 1000000000;

/** Catalog art and economy are content, separate from card geometry and story pages. */
export function parseCatalogConfig(value: any): CatalogConfig {
    if (!record(value) || value.schemaVersion !== 1 || !record(value.economy) ||
        !Array.isArray(value.stories) || !value.stories.length || !Array.isArray(value.quests)) {
        throw new Error('目录配置结构无效');
    }
    const e = value.economy;
    const b = value.cardBackground;
    if (b !== undefined && (!record(b) || typeof b.spritePath !== 'string' || !/^assets\/[A-Za-z0-9_/-]+$/.test(b.spritePath) ||
        b.spritePath.includes('..') || ![b.focalX,b.focalY].every(n => Number.isFinite(n) && n >= 0 && n <= 1))) throw new Error('卡牌背景配置无效');
    if (![e.initialCoins, e.initialGems, e.entryCost].every(amount) ||
        !['rollback', 'wild', 'addBackup'].every(key => record(e[key]) && amount(e[key].base) && amount(e[key].increment))) {
        throw new Error('目录金币或动作费用配置无效');
    }
    const ids = new Set<string>();
    for (const s of value.stories) {
        if (!record(s) || !ID.test(s.id) || ids.has(s.id) || !ID.test(s.chapterId) || !ID.test(s.bundle) ||
            !['title', 'subtitle', 'synopsis'].every(k => typeof s[k] === 'string' && s[k].length > 0) ||
            !ASSET.test(s.background) || !Array.isArray(s.roles) || s.roles.some((x: any) => typeof x !== 'string' || !/^roles\/[A-Za-z0-9_-]+$/.test(x)) ||
            !Array.isArray(s.collections)) throw new Error('目录剧情或素材引用无效');
        ids.add(s.id);
        const collectionIds = new Set<string>();
        for (const c of s.collections) {
            if (!record(c) || !ID.test(c.id) || collectionIds.has(c.id) || typeof c.title !== 'string' || !c.title ||
                !ASSET.test(c.asset) || !Number.isInteger(c.unlockPage) || c.unlockPage < 1 || c.unlockPage > 10000) {
                throw new Error('收藏配置无效');
            }
            collectionIds.add(c.id);
        }
    }
    const questIds = new Set<string>();
    for (const q of value.quests) {
        if (!record(q) || !METRICS.includes(q.id) || questIds.has(q.id) || typeof q.label !== 'string' || !q.label ||
            !amount(q.target) || q.target < 1 || !amount(q.reward)) throw new Error('每日任务配置无效');
        questIds.add(q.id);
    }
    return JSON.parse(JSON.stringify(value));
}
