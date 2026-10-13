/** Stable presentation API. Art configs can select effects, never execute code. */
export const EFFECT_EVENTS = {
    avg: ['avg.page.enter', 'avg.page.turn', 'avg.choice', 'avg.chapter.end'],
    card: ['card.open', 'card.play', 'card.invalid', 'card.draw', 'card.reward', 'card.wild.prepare', 'card.wild.cancel', 'card.addBackup', 'card.rollback', 'card.complete'],
} as const;
export type EffectDomain = keyof typeof EFFECT_EVENTS;
export const EFFECT_TARGETS = {
    avg: ['root', 'background', 'roleLeft', 'roleRight', 'dialoguePanel', 'choices', 'endOverlay'],
    card: ['root', 'content', 'current', 'backup', 'progress', 'coin', 'wild', 'addBackup', 'rollback', 'source'],
} as const;
export type EffectKind = 'pulse' | 'shake' | 'fadeIn' | 'moveIn' | 'prefab' | 'sprite';
export interface EffectDefinition {
    readonly id: string;
    readonly kind: EffectKind;
    readonly target: string;
    readonly enabled?: boolean;
    readonly duration?: number;
    readonly delay?: number;
    readonly amount?: number;
    readonly x?: number;
    readonly y?: number;
    readonly scale?: number;
    readonly asset?: string;
    readonly bundle?: string;
    readonly clip?: string;
    /** Optional exact page (chapter/page) or card level selector. */
    readonly when?: string;
}
export interface EffectConfig {
    readonly schemaVersion: 1;
    readonly events: Readonly<Record<string, readonly EffectDefinition[]>>;
}
export const EMPTY_EFFECT_CONFIG: EffectConfig = { schemaVersion: 1, events: {} };
const KINDS = ['pulse', 'shake', 'fadeIn', 'moveIn', 'prefab', 'sprite'];
function record(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function isAssetPath(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0 && v.length <= 300
        && !v.startsWith('/') && !/[\\:\x00-\x1f]/.test(v)
        && v.split('/').every(part => part !== '.' && part !== '..' && part.length > 0);
}
export function parseEffectConfig(value: unknown, domain: EffectDomain): EffectConfig {
    if (!record(value) || value.schemaVersion !== 1 || !record(value.events)) throw new Error('特效配置必须包含 schemaVersion: 1 和 events');
    const events: Record<string, EffectDefinition[]> = {};
    const ids = new Set<string>();
    for (const event of Object.keys(value.events)) {
        if (!(EFFECT_EVENTS[domain] as readonly string[]).includes(event)) throw new Error(`未知特效事件：${event}`);
        const list = value.events[event];
        if (!Array.isArray(list) || list.length > 16) throw new Error(`${event} 的特效列表最多 16 项`);
        events[event] = list.map(raw => {
            if (!record(raw) || typeof raw.id !== 'string' || !/^[a-zA-Z][\w-]{0,63}$/.test(raw.id) || ids.has(raw.id)) throw new Error(`${event} 的特效 id 无效或重复`);
            ids.add(raw.id);
            if (!KINDS.includes(raw.kind as string)) throw new Error(`${raw.id} 的效果类型无效`);
            if (!(EFFECT_TARGETS[domain] as readonly string[]).includes(raw.target as string)) throw new Error(`${raw.id} 的挂点无效`);
            const allowed = ['id', 'kind', 'target', 'enabled', 'duration', 'delay', 'amount', 'x', 'y', 'scale', 'asset', 'bundle', 'clip', 'when'];
            if (Object.keys(raw).some(key => !allowed.includes(key))) throw new Error(`${raw.id} 包含不支持的字段`);
            if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') throw new Error(`${raw.id}.enabled 必须为布尔值`);
            const ranges: Record<string, readonly [number, number]> = { duration: [0.01, 10], delay: [0, 3], amount: [0, 1000], x: [-10000, 10000], y: [-10000, 10000], scale: [0.01, 10] };
            for (const key of Object.keys(ranges)) {
                const n = raw[key];
                if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < ranges[key][0] || n > ranges[key][1])) throw new Error(`${raw.id}.${key} 超出允许范围`);
            }
            if (raw.when !== undefined && (typeof raw.when !== 'string' || raw.when.length > 200)) throw new Error(`${raw.id}.when 无效`);
            if (raw.bundle !== undefined && (typeof raw.bundle !== 'string' || !/^[\w-]+$/.test(raw.bundle))) throw new Error(`${raw.id}.bundle 无效`);
            if (raw.clip !== undefined && (typeof raw.clip !== 'string' || raw.clip.length > 100)) throw new Error(`${raw.id}.clip 无效`);
            if (raw.kind === 'prefab' || raw.kind === 'sprite') {
                if (!isAssetPath(raw.asset)) throw new Error(`${raw.id} 缺少安全的资源路径`);
                // Only the art effect folder can be instantiated from the general resources bundle.
                if ((!raw.bundle || raw.bundle === 'resources') && !(raw.asset as string).startsWith('effects/')) throw new Error(`${raw.id} 的资源必须位于 resources/effects 内`);
            } else if (raw.asset !== undefined || raw.bundle !== undefined || raw.clip !== undefined) {
                throw new Error(`${raw.id} 的参数效果不能指定资源`);
            }
            return { ...raw } as unknown as EffectDefinition;
        });
        const seconds = events[event].reduce((sum, fx) => sum + (fx.enabled === false ? 0 : (fx.duration ?? 0.3) + (fx.delay ?? 0)), 0);
        if (seconds > 15) throw new Error(`${event} 的特效总时长不能超过 15 秒`);
    }
    return { schemaVersion: 1, events };
}
export function effectsFor(config: EffectConfig, event: string, context = ''): readonly EffectDefinition[] {
    return (config.events[event] ?? []).filter(fx => fx.enabled !== false && (fx.when === undefined || fx.when === context));
}
