import type { TaskScope } from './Tasks';
export const API_VERSION = 1;
export enum Stage { Setup = 'setup', Load = 'load', BeforeAction = 'beforeAction', Execute = 'execute', BeforeCommit = 'beforeCommit', AfterCommit = 'afterCommit', Render = 'render', AfterRender = 'afterRender', Dispose = 'dispose' }
export interface Action { readonly type: string; readonly payload?: any; }
export type StateBag = Record<string, any>;
export interface Manifest { readonly id: string; readonly version: string; readonly apiVersion: number; readonly order: number; readonly requires?: readonly string[]; readonly conflicts?: readonly string[]; }
export interface DraftContext {
    readonly action: Action;
    readonly before: Readonly<StateBag>;
    readonly draft: StateBag;
    result: any;
    readonly scope: TaskScope;
    recordUndo(): void;
    undo(): Readonly<StateBag>;
    clearHistory(): void;
    reject(reason: string): never;
}
export interface CommittedContext {
    readonly action: Action;
    readonly state: Readonly<StateBag>;
    readonly result: any;
    readonly revision: number;
    readonly scope: TaskScope;
    readonly presentation: 'complete' | 'failed' | 'cancelled';
    /** Queues a follow-up. Never await another action from the current hook. */
    enqueue(action: Action): void;
}
export interface PresentationTask {
    readonly id: string;
    readonly timeoutMs?: number;
    readonly parallel?: readonly PresentationTask[];
    readonly run?: (scope: TaskScope) => Promise<void> | void;
}
export interface Mod {
    readonly manifest: Manifest;
    readonly initialState: any;
    readonly actions?: readonly string[];
    setup?(): void;
    load?(scope: TaskScope): Promise<void> | void;
    validate(state: Readonly<StateBag>): void;
    beforeAction?(ctx: DraftContext): Promise<void> | void;
    execute?(ctx: DraftContext): void;
    beforeCommit?(ctx: DraftContext): void;
    afterCommit?(ctx: CommittedContext): void;
    render?(ctx: CommittedContext): readonly PresentationTask[] | void;
    afterRender?(ctx: CommittedContext): void;
    /** Mod-owned rollback policy; framework restores all other namespaces automatically. */
    restoreUndo?(previous: any, current: any, after: any): any;
    dispose?(): Promise<void> | void;
}
export interface Diagnostic { readonly mod: string; readonly stage: Stage; readonly action?: string; readonly message: string; }
export interface DispatchResult { readonly status: 'committed' | 'rejected' | 'failed' | 'busy' | 'cancelled'; readonly reason?: string; readonly presentation?: CommittedContext['presentation']; }
export interface Snapshot { readonly schemaVersion: 1; readonly fingerprint: string; readonly state: StateBag; readonly history: readonly HistoryEntry[]; }

export interface HistoryEntry { readonly before: StateBag; readonly after: StateBag; }
