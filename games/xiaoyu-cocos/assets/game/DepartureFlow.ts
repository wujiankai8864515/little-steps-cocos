import { lifetime, Scope } from './Engine';
import { TravelService } from './TravelService';

export type DeparturePhase = 'idle' | 'loading' | 'failed' | 'departing';
export interface DeparturePort {
    canInteract(): boolean;
    merit(): number;
    fatigue(): number;
    prepare(scope: Scope): Promise<void>;
    showLoading(): void;
    hideLoading(): void;
    loadingFailed(error: unknown): void;
    restoreOffer(): void;
    openExisting(mode: 'comic' | 'rewards'): void;
    begin(scope: Scope, text: string): void | boolean;
    finish(): void;
    syncWorld(): void;
    visualFailed(error: unknown): void;
}

// Departure is a product transaction, not a page transition. The resource
// scope outlives loading only after a durable trip exists. A cancelled load
// never owns a later request's UI or its animation.
export class DepartureFlow {
    phase: DeparturePhase = 'idle';
    pending: Promise<void> = Promise.resolve();
    private generation = 0;
    private current: Scope = null;
    private alive = true;
    constructor(readonly service: TravelService, private port: DeparturePort, private owner: Scope) {
        owner.own(() => this.dispose());
    }
    private away() { return this.service.model.trip().status === 'traveling'; }
    request() {
        if (!this.alive || !this.owner.active) return false;
        if (this.phase === 'loading' || this.phase === 'departing') return true;
        if (!this.port.canInteract()) return false;
        if (!this.service.model.can_depart()) {
            const trip = this.service.model.trip();
            this.port.openExisting(trip.status === 'returned' && !trip.claimed ? 'rewards' : 'comic');
            return false;
        }
        const generation = ++this.generation, scope = lifetime(this.owner);
        this.current = scope;
        this.phase = 'loading';
        this.pending = this.prepare(generation, scope);
        return true;
    }
    private owns(generation: number, scope: Scope) {
        return this.alive && this.owner.active && scope.active &&
            this.generation === generation && this.current === scope;
    }
    private async prepare(generation: number, scope: Scope) {
        let committed = false;
        try {
            this.port.showLoading();
            await this.port.prepare(scope);
            if (!this.owns(generation, scope)) return;
            this.port.hideLoading();
            // changed listeners can now distinguish a newly departing actor
            // from an already-away actor restored from a save.
            this.phase = 'departing';
            committed = this.service.depart(this.port.merit(), this.port.fatigue());
            if (!committed) {
                this.phase = 'idle';
                this.current = null;
                scope.dispose();
                if (!this.away()) this.port.restoreOffer();
                this.port.syncWorld();
                return;
            }
            if (this.port.begin(scope, this.service.model.trip().departure_text) === false) throw new Error('Departure visual declined a committed trip');
            this.port.syncWorld();
        } catch (error) {
            if (!this.owns(generation, scope)) return;
            this.current = null;
            // Never roll back or replay a committed trip just because a view
            // failed. Restored world state remains tied to the durable model.
            this.phase = committed ? 'idle' : 'failed';
            scope.dispose();
            if (committed) {
                this.port.finish();
                this.port.syncWorld();
                this.port.visualFailed(error);
            } else this.port.loadingFailed(error);
        } finally {
            // Both rejection and successful late delivery release only this
            // request. ResourceGate keeps pending capacity until it settles.
            if (this.current !== scope) scope.dispose();
        }
    }
    cancelLoading() {
        if (this.phase === 'departing' || (this.phase === 'idle' && !this.current)) return false;
        ++this.generation;
        const scope = this.current;
        this.current = null;
        this.phase = 'idle';
        this.port.hideLoading();
        if (scope) scope.dispose();
        if (!this.away()) this.port.restoreOffer();
        return true;
    }
    finish() {
        if (this.phase !== 'departing') return false;
        const scope = this.current;
        this.current = null;
        this.phase = 'idle';
        // Clear ownership first: Home.finishDeparture may call back here.
        try { this.port.finish(); }
        finally { try { if (scope) scope.dispose(); } finally { this.port.syncWorld(); } }
        return true;
    }
    suspend() {
        if (this.phase === 'departing') this.finish();
        else this.cancelLoading();
        this.service.suspend();
    }
    resume() { if (this.alive) { this.service.reconcile(); this.port.syncWorld(); } }
    dispose() {
        if (!this.alive) return;
        this.alive = false;
        this.suspend();
    }
    snapshot() { return {phase: this.phase, generation: this.generation, active: this.alive, resourceScopeActive: !!this.current?.active}; }
}
