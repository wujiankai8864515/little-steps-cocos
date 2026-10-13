import { Action, CommittedContext, Diagnostic, DispatchResult, DraftContext, HistoryEntry, Mod, PresentationTask, Snapshot, Stage, StateBag } from './Contracts';
import { assertSync, canonical, clone, freeze, sortedMods } from './Data';
import { Cancelled, TaskScope } from './Tasks';
class Rejected extends Error {}
export interface RuntimeOptions { readonly prepareTimeoutMs?: number; readonly presentationTimeoutMs?: number; readonly disposeTimeoutMs?: number; readonly diagnostic?: (entry: Diagnostic) => void; }
/** No game-specific imports. Built-in and external modules use exactly the same pipeline. */
export class Runtime {
    public readonly scope = new TaskScope();
    public readonly mods: readonly Mod[];
    public readonly diagnostics: Diagnostic[] = [];
    private state: StateBag = {};
    private history: HistoryEntry[] = [];
    private revision = 0;
    private ready = false;
    private busy = false;
    private readonly handlers = new Map<string, Mod>();
    private readonly fingerprint: string;
    private disposal: Promise<void> | null = null;
    public constructor(mods: readonly Mod[], configIdentity: unknown = {}, private readonly options: RuntimeOptions = {}) {
        this.mods = sortedMods(mods);
        for (const mod of this.mods) {
            this.state[mod.manifest.id] = clone(mod.initialState);
            for (const action of mod.actions ?? []) {
                if (!/^[\w-]+\.[\w.-]+$/.test(action) || this.handlers.has(action) || !mod.execute) throw new Error(`动作处理器冲突或无效：${action}`);
                this.handlers.set(action, mod);
            }
        }
        this.fingerprint = canonical({ apiVersion: 1, mods: this.mods.map(mod => mod.manifest), config: clone(configIdentity) });
    }
    public get isBusy(): boolean { return this.busy; }
    public get canUndo(): boolean { return this.history.length > 0; }
    public read<T>(id: string): Readonly<T> { return freeze(clone(this.state[id])); }
    public async open(): Promise<void> {
        if (this.ready || this.busy) throw new Error('会话不能重复打开');
        this.busy = true;
        try {
            for (const mod of this.mods) { this.scope.check(); this.callSync(mod, Stage.Setup, () => mod.setup?.()); }
            // Deterministic serial loading is the v1 default; a mod may group independent loads internally.
            for (const mod of this.mods) {
                this.scope.check();
                try { if (mod.load) await this.scope.run(scope => mod.load!(scope), this.options.prepareTimeoutMs ?? 8000); }
                catch (error) { this.report(mod, Stage.Load, error); throw error; }
            }
            this.validate(this.state);
            this.state = freeze(clone(this.state)); this.ready = true;
        } catch (error) { await this.dispose(); throw error; }
        finally { this.busy = false; }
    }
    public async dispatch(action: Action): Promise<DispatchResult> {
        if (this.scope.cancelled) return { status: 'cancelled' };
        if (!this.ready) return { status: 'failed', reason: '会话未加载' };
        if (this.busy) return { status: 'busy' };
        let input: Action;
        try { input = clone(action); if (!input || typeof input !== 'object' || typeof input.type !== 'string' || !/^[\w-]+\.[\w.-]+$/.test(input.type)) throw new Error('动作格式无效'); } catch (error) { return { status: 'failed', reason: String(error) }; }
        this.busy = true;
        const queue: Action[] = [input];
        let first: DispatchResult | null = null;
        try {
            let count = 0;
            while (queue.length && !this.scope.cancelled) {
                if (++count > 16) { this.report(null, Stage.Execute, new Error('自动动作链超过 16 次，已终止')); break; }
                const result = await this.perform(queue.shift()!, next => {
                    if (queue.length >= 16) throw new Error('后续动作队列已满');
                    queue.push(clone(next));
                });
                first ??= result;
                if (result.status !== 'committed') break;
            }
            return first ?? { status: 'cancelled' };
        } finally { this.busy = false; }
    }
    private async perform(action: Action, enqueue: (action: Action) => void): Promise<DispatchResult> {
        const owner = this.handlers.get(action.type);
        if (!owner) return { status: 'rejected', reason: `没有注册动作：${action.type}` };
        const actionScope = this.scope.child();
        const before = freeze(clone(this.state));
        const draft = clone(this.state);
        let historyMode: 'none' | 'record' | 'undo' | 'clear' = 'none';
        const ctx: DraftContext = {
            action: freeze(clone(action)), before, draft, result: null, scope: actionScope,
            recordUndo: () => { if (historyMode !== 'none') throw new Error('重复历史操作'); historyMode = 'record'; },
            clearHistory: () => { if (historyMode !== 'none') throw new Error('重复历史操作'); historyMode = 'clear'; },
            undo: () => {
                if (historyMode !== 'none') throw new Error('重复历史操作');
                const entry = this.history[this.history.length - 1];
                if (!entry) throw new Rejected('没有可回撤的动作');
                for (const mod of this.mods) {
                    const id = mod.manifest.id;
                    const restored = mod.restoreUndo ? mod.restoreUndo(clone(entry.before[id]), clone(before[id]), clone(entry.after[id])) : clone(entry.before[id]);
                    assertSync(restored, `${id}.restoreUndo`); draft[id] = restored;
                }
                historyMode = 'undo'; return freeze(clone(entry.before));
            },
            reject: reason => { throw new Rejected(reason); },
        };
        try {
            for (const mod of this.mods) {
                if (!mod.beforeAction) continue;
                try { await actionScope.run(async scope => { const scoped = { ...ctx, scope };
                    Object.defineProperty(scoped, 'result', { get: () => ctx.result, set: value => { ctx.result = value; } });
                    await mod.beforeAction!(scoped); }, this.options.prepareTimeoutMs ?? 8000); }
                catch (error) { if (!(error instanceof Rejected)) this.report(mod, Stage.BeforeAction, error, action); throw error; }
            }
            actionScope.check();
            this.callSync(owner, Stage.Execute, () => owner.execute!(ctx), action);
            for (const mod of this.mods) this.callSync(mod, Stage.BeforeCommit, () => mod.beforeCommit?.(ctx), action);
            this.validate(draft);
            // Copy again: hooks retaining draft references can never mutate the published state later.
            const committed = freeze(clone(draft));
            const result = freeze(clone(ctx.result));
            actionScope.check();
            this.state = committed; this.revision++;
            if ((historyMode as string) === 'record') { this.history.push({ before: clone(before), after: clone(committed) }); if (this.history.length > 64) this.history.shift(); }
            if ((historyMode as string) === 'undo') this.history.pop();
            if ((historyMode as string) === 'clear') this.history = [];
            let presentation: CommittedContext['presentation'] = 'complete';
            const committedCtx: CommittedContext = { action: ctx.action, state: committed, result, revision: this.revision, scope: actionScope, presentation, enqueue: next => { actionScope.check(); enqueue(next); } };
            const tasks: { mod: Mod; task: PresentationTask }[] = [];
            for (const mod of this.mods) {
                try {
                    this.callSync(mod, Stage.AfterCommit, () => mod.afterCommit?.(committedCtx), action);
                    const plans = mod.render?.(committedCtx); assertSync(plans, `${mod.manifest.id}.render`);
                    if (plans) plans.forEach(task => tasks.push({ mod, task }));
                } catch (error) { presentation = 'failed'; this.report(mod, Stage.Render, error, action); }
            }
            try {
                await actionScope.run(async sequence => {
                    for (const { mod, task } of tasks) {
                        sequence.check();
                        try { await this.playTask(task, sequence); }
                        catch (error) { if (sequence.cancelled) throw error; presentation = 'failed'; this.report(mod, Stage.Render, error, action); }
                    }
                }, this.options.presentationTimeoutMs ?? 20000);
            } catch (error) { presentation = this.scope.cancelled ? 'cancelled' : 'failed'; this.report(null, Stage.Render, error, action); }
            for (const mod of this.mods) {
                try { this.callSync(mod, Stage.AfterRender, () => mod.afterRender?.({ ...committedCtx, presentation }), action); }
                catch (error) { this.report(mod, Stage.AfterRender, error, action); }
            }
            return { status: 'committed', presentation };
        } catch (error) {
            if (this.scope.cancelled || error instanceof Cancelled) return { status: 'cancelled' };
            if (error instanceof Rejected) return { status: 'rejected', reason: error.message };
            this.report(owner, Stage.Execute, error, action);
            return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
        } finally { actionScope.dispose(); }
    }
    private async playTask(task: PresentationTask, scope: TaskScope, depth = 0): Promise<void> {
        if (depth > 4 || !task.id || (Boolean(task.run) === Boolean(task.parallel))) throw new Error('表现任务结构非法');
        const timeout = task.timeoutMs ?? 5000;
        if (!Number.isFinite(timeout) || timeout < 1 || timeout > 15000) throw new Error('单个表现任务限时必须为 1–15000ms');
        await scope.run(async child => {
            if (task.parallel) {
                if (task.parallel.length > 16) throw new Error('并行组最多 16 项');
                await Promise.all(task.parallel.map(item => this.playTask(item, child, depth + 1)));
            } else await task.run!(child);
        }, timeout);
    }
    private validate(state: StateBag): void {
        clone(state);
        if (Object.keys(state).sort().join('|') !== this.mods.map(mod => mod.manifest.id).sort().join('|')) throw new Error('Mod 状态命名空间不匹配');
        const candidate = freeze(clone(state));
        for (const mod of this.mods) this.callSync(mod, Stage.BeforeCommit, () => mod.validate(candidate));
    }
    public exportSnapshot(): Snapshot {
        if (!this.ready || this.busy || this.scope.cancelled) throw new Error('只能在就绪且空闲的会话导出快照');
        return clone({ schemaVersion: 1, fingerprint: this.fingerprint, state: this.state, history: this.history });
    }
    public restoreSnapshot(snapshot: Snapshot): void {
        if (!this.ready || this.busy || this.scope.cancelled) throw new Error('只能在就绪且空闲的会话恢复快照');
        const value = clone(snapshot);
        if (value.schemaVersion !== 1 || value.fingerprint !== this.fingerprint || !Array.isArray(value.history) || value.history.length > 64) throw new Error('快照与当前 Mod/配置不兼容');
        this.validate(value.state);
        value.history.forEach(entry => { this.validate(entry.before); this.validate(entry.after); });
        this.state = freeze(clone(value.state)); this.history = value.history; this.revision++;
    }
    public dispose(): Promise<void> {
        if (this.disposal) return this.disposal;
        this.ready = false; this.scope.dispose();
        this.disposal = (async () => {
            for (const mod of [...this.mods].reverse()) {
                const cleanup = new TaskScope();
                try { if (mod.dispose) await cleanup.run(() => mod.dispose!(), this.options.disposeTimeoutMs ?? 1000); }
                catch (error) { this.report(mod, Stage.Dispose, error); }
                finally { cleanup.dispose(); }
            }
        })();
        return this.disposal;
    }
    private callSync(mod: Mod, stage: Stage, fn: () => unknown, action?: Action): void {
        try { assertSync(fn(), `${mod.manifest.id}.${stage}`); }
        catch (error) { if (!(error instanceof Rejected)) this.report(mod, stage, error, action); throw error; }
    }
    private report(mod: Mod | null, stage: Stage, error: unknown, action?: Action): void {
        const entry: Diagnostic = { mod: mod?.manifest.id ?? 'framework', stage, ...(action ? { action: action.type } : {}), message: error instanceof Error ? error.message : String(error) };
        this.diagnostics.push(entry); if (this.diagnostics.length > 100) this.diagnostics.shift();
        try { this.options.diagnostic?.(entry); } catch (_) { /* diagnostics cannot break actions */ }
    }
}
