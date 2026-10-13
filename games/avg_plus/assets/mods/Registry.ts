import { JsonAsset, Node, resources } from 'cc';
import type { Mod } from '../foundation/Contracts';
import { createRewardVariant } from './packages/reward-variant';
import { createStoryBranch } from './packages/story-branch';
import { createCinematicStyle } from './packages/cinematic-style';
import type { AvgPage } from './base-avg/AvgTypes';
export interface ProfileEntry { id: string; enabled: boolean; config: Record<string, any>; }
export interface Profile { schemaVersion: 1; modules: ProfileEntry[]; }
const KNOWN = ['base-card','base-avg','reward-variant','story-branch','cinematic-style'];
export function parseProfile(value: any): Profile {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.modules)) throw new Error('Mod 组合配置无效');
    const ids = new Set<string>();
    for (const entry of value.modules) {
        if (!entry || !KNOWN.includes(entry.id) || ids.has(entry.id) || typeof entry.enabled !== 'boolean' || !entry.config || typeof entry.config !== 'object' || Array.isArray(entry.config)) throw new Error('Mod 配置 ID/开关/参数无效');
        ids.add(entry.id);
    }
    return value;
}
function json(path: string): Promise<any> {
    return new Promise((resolve, reject) => resources.load(path, JsonAsset, (error, asset) => error || !asset ? reject(error ?? new Error(`配置缺失：${path}`)) : resolve(asset.json)));
}
export async function loadProfile(): Promise<Profile> { return parseProfile(await json('mods/profiles/default')); }
export async function loadChapter(id: string): Promise<{ id: string; title: string; bundle: string; path: string }> {
    const value = await json('config/avg-chapters');
    if (value?.schemaVersion !== 1 || !Array.isArray(value.chapters)) throw new Error('章节目录无效');
    const chapter = value.chapters.find((item: any) => item.id === id);
    if (!chapter || !['id','title','bundle','path'].every(key => typeof chapter[key] === 'string' && chapter[key].length)) throw new Error(`章节不存在或无效：${id}`);
    return chapter;
}
export interface ExtensionHost { root: Node; find(name: string): Node | null; context(): string; afterInsert(): void; pages?: readonly AvgPage[]; }
export function extensionsFor(profile: Profile, domain: 'card' | 'avg', host: ExtensionHost): Mod[] {
    const mods: Mod[] = [];
    for (const item of profile.modules.filter(entry => entry.enabled)) {
        if (item.id === 'reward-variant' && domain === 'card') mods.push(createRewardVariant(item.config as { multiplier: number }));
        if (item.id === 'story-branch' && domain === 'avg') mods.push(createStoryBranch(item.config as { routes: Record<string,string> }, host.pages!));
        if (item.id === 'cinematic-style') mods.push(createCinematicStyle(domain, host));
    }
    return mods;
}
