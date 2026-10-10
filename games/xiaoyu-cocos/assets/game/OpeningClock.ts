// Product presentation state. No persistence/seen gate: each entry starts blank.
export class OpeningClock {
    state: 'ready' | 'playing' | 'waiting' | 'cancelled' = 'ready';
    elapsed = 0;
    promptElapsed = 0;
    waitingElapsed = 0;
    amounts = [0, 0, 0, 0];
    revealed = 0;
    enterAvailable = false;
    error = '';
    retryAccepted = false;
    onPanel = (index: number) => {};
    onFinished = () => {};
    onRetry = () => {};
    start() { if (this.state !== 'ready') return false; this.state = 'playing'; return true; }
    tick(delta: number, interactable: boolean) {
        if (!interactable || !Number.isFinite(delta) || delta <= 0) return;
        const step = Math.min(delta, 0.1);
        if (this.state === 'waiting') { if (!this.error) this.waitingElapsed += step; return; }
        if (this.state !== 'playing') return;
        if (this.enterAvailable) { this.promptElapsed += step; return; }
        this.elapsed += step;
        for (let i = 0; i < 4; i++) {
            const since = this.elapsed - 0.35 - i * 1.9;
            if (since <= 0) continue;
            if (this.revealed <= i) { this.revealed = i + 1; this.onPanel(i); }
            this.amounts[i] = Math.min(1, since / 0.68);
        }
        this.enterAvailable = this.elapsed >= 0.35 + 3 * 1.9 + 0.68 + 1.35;
    }
    enter(interactable: boolean) {
        if (!interactable || this.state !== 'playing' || !this.enterAvailable) return false;
        this.state = 'waiting'; this.waitingElapsed = 0; this.onFinished(); return true;
    }
    fail(reason: string) { if (this.state === 'waiting') { this.error = reason; this.retryAccepted = false; } }
    retry(interactable: boolean) {
        if (!interactable || this.state !== 'waiting' || !this.error || this.retryAccepted) return false;
        this.retryAccepted = true; this.error = ''; this.waitingElapsed = 0; this.onRetry(); return true;
    }
    cancel() { if (this.state === 'cancelled') return false; this.state = 'cancelled'; return true; }
}
