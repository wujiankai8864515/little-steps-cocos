import { Scope } from './Engine';
import { DepartureFlow } from './DepartureFlow';
import { TravelService } from './TravelService';

// Product state survives the Home/Darkroom page switch. The actual view and
// resource loader are supplied by Application; no engine state enters saves.
export interface TravelHomePort {
    canInteract(): boolean;
    noticeAvailable(): boolean;
    merit(): number;
    fatigue(): number;
    setMerit(value: number): void;
    syncTravel(away: boolean, full: boolean, departing: boolean): void;
    prepare(scope: Scope): Promise<void>;
    showLoading(): void;
    hideLoading(): void;
    loadingFailed(error: unknown): void;
    restoreOffer(): void;
    begin(scope: Scope, text: string): boolean;
    finish(): void;
    info(text: string): void;
    openExisting(mode: 'comic' | 'rewards'): void;
    visualFailed(error: unknown): void;
}
export class HomeTravelBridge {
    readonly flow: DepartureFlow;
    private ready = false;
    private alive = true;
    private wasAway = false;
    private tick = 0;
    private warningPending = false;
    private returnPending = false;
    constructor(readonly service: TravelService, private home: TravelHomePort, owner: Scope) {
        this.flow = new DepartureFlow(service, {
            canInteract: () => home.canInteract(), merit: () => home.merit(), fatigue: () => home.fatigue(),
            prepare: scope => home.prepare(scope), showLoading: () => home.showLoading(),
            hideLoading: () => home.hideLoading(), loadingFailed: error => home.loadingFailed(error),
            restoreOffer: () => home.restoreOffer(), openExisting: mode => home.openExisting(mode),
            begin: (scope, text) => home.begin(scope, text), finish: () => home.finish(),
            syncWorld: () => this.sync(), visualFailed: error => home.visualFailed(error),
        }, owner);
        owner.own(service.subscribe(() => this.sync(), () => { this.warningPending = true; }));
        owner.own(() => { this.alive = false; this.ready = false; });
    }
    configure(slot = 'main', memoryOnly = false) {
        this.service.configure(slot, memoryOnly);
        this.ready = true;
        const trip = this.service.model.trip();
        this.returnPending = trip.status === 'returned' && !trip.claimed;
        this.sync();
    }
    private sync() {
        if (!this.ready || !this.alive) return;
        const trip = this.service.model.trip(), away = trip.status === 'traveling';
        // Before the first trip merit is only the current Home session, as in
        // Godot. A loaded trip owns the persisted merit value, including zero.
        if (trip.id) this.home.setMerit(this.service.model.data.merit);
        if (this.wasAway && !away) this.returnPending = true;
        this.wasAway = away;
        this.home.syncTravel(away, trip.status === 'returned' && !trip.claimed, this.flow.phase === 'departing');
    }
    observeMerit(amount: number) { if (this.alive) this.service.capture_merit(amount); }
    advance(delta: number) {
        if (!this.ready || !this.alive || !Number.isFinite(delta) || delta < 0) return;
        this.tick += delta;
        if (this.tick >= .2) { this.tick = 0; this.service.reconcile(); }
        if (this.flow.phase !== 'idle' || !this.home.noticeAvailable()) return;
        if (this.returnPending) {
            this.returnPending = false;
            this.home.info('回来啦，给你带了点小东西。');
        } else if (this.warningPending) {
            this.warningPending = false;
            this.home.info('保存暂时不可用，这一步还没有完成。');
        }
    }
    suspend() { this.flow.suspend(); }
    resume() { this.tick = 0; this.flow.resume(); }
    snapshot() { return { ...this.flow.snapshot(), ready: this.ready, away: this.wasAway, warningPending: this.warningPending, returnPending: this.returnPending }; }
}
