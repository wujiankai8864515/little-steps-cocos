import * as cc from 'cc';

function installed(): any {
    const value = (globalThis as any).LittleStepsCore;
    if (!value) throw new Error('只读框架插件未加载：请运行 engines/travel-core/tools/install-plugin.cjs');
    return value;
}
// Editor deserializes Boot without running runtime plugins. Resolve at runtime,
// so class registration is independent of the current preview/plugin scope.
export const core: any = {
    get Math2D() { return installed().Math2D; },
    get ResourceGate() { return installed().ResourceGate; },
    createGrid: (...args: any[]) => installed().createGrid(...args),
    sourcePixelAt: (...args: any[]) => installed().sourcePixelAt(...args),
    sampleTrack: (...args: any[]) => installed().sampleTrack(...args),
    clipPolygonBelow: (...args: any[]) => installed().clipPolygonBelow(...args),
    bitMapContains: (...args:any[]) => installed().bitMapContains(...args),
};
export const sharedUI = () => installed().registerUI(cc);
export const pageRouter = (owner: Scope) => installed().createPageRouter(cc, owner);
export const audioTransport = () => installed().registerAudio(cc);
export const renderSurfaces = () => installed().registerRenderSurface(cc);
export const meshSprite = () => installed().registerCocos(cc) as new () => cc.Sprite & {
    configure(mesh: any, size: number[], content?: number[]): void;
    geometryChanged(): void;
};
export type Scope = { active: boolean; own(disposer: () => void): void; dispose(): void; guard<T>(p: Promise<T>, lateDispose?: (value: T) => void): Promise<T> };
export const lifetime = (parent?: Scope): Scope => new (installed().Lifetime)(parent);
