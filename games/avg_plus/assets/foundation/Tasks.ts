/** Cooperative cancellation: timeout abandons a result; it cannot stop synchronous JS. */
export class Cancelled extends Error { constructor(message = '会话已取消') { super(message); this.name = 'Cancelled'; } }
export class TaskScope {
    private dead = false;
    private readonly cleanups = new Set<() => void>();
    public get cancelled(): boolean { return this.dead; }
    public check(): void { if (this.dead) throw new Cancelled(); }
    public own(cleanup: () => void): () => void {
        if (this.dead) { cleanup(); return () => {}; }
        this.cleanups.add(cleanup);
        return () => this.cleanups.delete(cleanup);
    }
    public child(): TaskScope {
        const child = new TaskScope();
        const release = this.own(() => child.dispose());
        child.own(release);
        return child;
    }
    public run<T>(task: (scope: TaskScope) => Promise<T> | T, timeoutMs = 8000, discard?: (value: T) => void): Promise<T> {
        this.check();
        if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('任务超时参数无效');
        const scope = this.child();
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout>;
            const release = scope.own(() => finish(new Cancelled()));
            const finish = (error?: unknown, value?: T) => {
                if (settled) return;
                settled = true; clearTimeout(timer); release(); scope.dispose();
                error ? reject(error) : resolve(value as T);
            };
            timer = setTimeout(() => finish(new Error(`任务超过 ${timeoutMs}ms`)), timeoutMs);
            Promise.resolve().then(() => { scope.check(); return task(scope); }).then(value => {
                if (settled) { if (discard) { try { discard(value); } catch (_) { /* cleanup must not reject */ } } return; }
                finish(undefined, value);
            }, error => finish(error instanceof Error ? error : new Error(String(error))));
        });
    }
    public dispose(): void {
        if (this.dead) return;
        this.dead = true;
        const errors: unknown[] = [];
        for (const cleanup of Array.from(this.cleanups).reverse()) { try { cleanup(); } catch (error) { errors.push(error); } }
        this.cleanups.clear();
        if (errors.length) console.warn('[TaskScope] 清理失败', errors);
    }
}
