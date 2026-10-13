import type { Mod } from './Contracts';
export function clone<T>(value: T): T {
    validateJson(value);
    return JSON.parse(JSON.stringify(value));
}
export function validateJson(value: unknown, seen = new Set<object>(), depth = 0): void {
    if (depth > 100) throw new Error('状态嵌套过深');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || !value) throw new Error('状态必须是有限数值、字符串、布尔值、数组或普通对象');
    if (seen.has(value)) throw new Error('状态不能循环引用');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('状态不能包含引擎对象或类实例');
    seen.add(value);
    for (const key of Object.keys(value)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error('非法状态键');
        validateJson((value as any)[key], seen, depth + 1);
    }
    seen.delete(value);
}
export function freeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value); Object.values(value).forEach(freeze);
    }
    return value;
}
export function canonical(value: any): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
}
export function sortedMods(mods: readonly Mod[]): Mod[] {
    if (mods.length > 32) throw new Error('最多启用 32 个 Mod');
    const byId = new Map<string, Mod>();
    for (const mod of mods) {
        const m = mod.manifest;
        if (!/^[a-z][a-z0-9-]{0,63}$/.test(m.id) || byId.has(m.id)) throw new Error(`Mod ID 非法或重复：${m.id}`);
        if (m.apiVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(m.version) || !Number.isSafeInteger(m.order)) throw new Error(`Mod 接口/版本/order 不兼容：${m.id}`);
        byId.set(m.id, mod);
    }
    for (const mod of mods) {
        for (const dep of mod.manifest.requires ?? []) if (!byId.has(dep)) throw new Error(`${mod.manifest.id} 缺少依赖 ${dep}`);
        for (const conflict of mod.manifest.conflicts ?? []) if (byId.has(conflict)) throw new Error(`${mod.manifest.id} 与 ${conflict} 冲突`);
    }
    const result: Mod[] = []; const remaining = new Set(mods);
    while (remaining.size) {
        const ready = Array.from(remaining).filter(mod => (mod.manifest.requires ?? []).every(dep => result.some(done => done.manifest.id === dep)))
            .sort((a, b) => a.manifest.order - b.manifest.order || a.manifest.id.localeCompare(b.manifest.id));
        if (!ready.length) throw new Error('Mod 循环依赖');
        const next = ready[0]; result.push(next); remaining.delete(next);
    }
    return result;
}
export function assertSync(result: unknown, name: string): void {
    if (result && typeof (result as any).then === 'function') {
        Promise.resolve(result).catch(() => {});
        throw new Error(`${name} 必须同步返回`);
    }
}
