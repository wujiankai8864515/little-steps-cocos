// Every page/request owns a scope. Late continuations cannot revive disposed pages.
class Lifetime {
    constructor(parent) {
        this.active = true;
        this.disposers = [];
        this.parent = parent || null;
        this.parentDisposer = parent ? () => this.dispose() : null;
        if (parent) parent.own(this.parentDisposer);
    }
    own(dispose) {
        if (!this.active) dispose();
        else this.disposers.push(dispose);
        return dispose;
    }
    // Remove ownership without running cleanup. A completed request must not
    // remain reachable through the long-lived application or cached page.
    disown(dispose) {
        const index = this.disposers.lastIndexOf(dispose);
        if (index < 0) return false;
        this.disposers.splice(index, 1);
        return true;
    }
    async guard(promise, lateDispose) {
        const value = await promise;
        if (!this.active) {
            if (lateDispose) lateDispose(value);
            throw new CancelledError();
        }
        return value;
    }
    dispose() {
        if (!this.active) return;
        this.active = false;
        if (this.parent) this.parent.disown(this.parentDisposer);
        this.parent = null;
        this.parentDisposer = null;
        const errors = [];
        for (const dispose of this.disposers.splice(0).reverse()) {
            try { dispose(); } catch (e) { errors.push(e); }
        }
        if (errors.length) throw new Error(`Lifetime cleanup failed: ${errors.map(e => e.message).join('; ')}`);
    }
}
class CancelledError extends Error { constructor() { super('Request cancelled'); this.name = 'CancelledError'; } }
Object.assign(api, {Lifetime, CancelledError});
