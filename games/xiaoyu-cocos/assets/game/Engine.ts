import * as cc from 'cc';

export const core: any = (globalThis as any).LittleStepsCore;
if (!core) throw new Error('只读框架插件未加载：请运行 engines/travel-core/tools/install-plugin.cjs');
export const MeshSprite = core.registerCocos(cc) as new () => cc.Sprite & {
    configure(mesh: any, size: number[], content?: number[]): void;
    geometryChanged(): void;
};
export type Scope = { active: boolean; own(disposer: () => void): void; dispose(): void; guard<T>(p: Promise<T>, lateDispose?: (value: T) => void): Promise<T> };
export const lifetime = (parent?: Scope): Scope => new core.Lifetime(parent);
