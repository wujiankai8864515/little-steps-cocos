import { _decorator, Node, Button } from 'cc';
import { TaskScope } from '../../foundation/Tasks';
import { Runtime } from '../../foundation/Runtime';
import type { CommittedContext } from '../../foundation/Contracts';
import { GamePresentation } from './GamePresentation';
import { CardLevelRepository } from './CardLevelRepository';
import { HighLowSolitaireCore } from './HighLowSolitaireCore';
import { GameSessionStore } from './GameSessionStore';
import { CardCompletionUI } from './CardCompletionUI';
import { GameUiAction, GameUiActionType, GameUiNodeId, buildGamePageViewState, type GamePageViewState } from './GameUIContract';
import { CardState, createCardMod } from './CardMod';
import { loadProfile, extensionsFor } from '../Registry';
import type { EconomyConfig } from '../base-shell/CatalogConfig';
const { ccclass } = _decorator;
const PACKAGED_CONTENT_LOAD_TIMEOUT_MS = 30000;
@ccclass('GamePageUI')
export class GamePageUI extends GamePresentation {
    private readonly lifetime = new TaskScope();
    private runtime: Runtime | null = null;
    private onExit: (() => void) | null = null;
    private onComplete: (() => void) | null = null;
    private bound = false;
    private exiting = false;
    private economy: EconomyConfig | undefined;
    private onCheckpoint: ((state: Readonly<CardState>, action: string) => Promise<void>) | null = null;
    protected onLoad(): void { this.prepareOpeningVisualState(); }
    public async open(levelId: string, onExit?: () => void, onComplete?: () => void, options?: {
        initialCoins: number; economy: EconomyConfig;
        checkpoint: (state: Readonly<CardState>, action: string) => Promise<void>;
    }): Promise<void> {
        this.prepareOpeningVisualState();
        this.onExit = onExit ?? null;
        this.onComplete = onComplete ?? null;
        this.economy = options?.economy; this.onCheckpoint = options?.checkpoint ?? null;
        this.bind(); this.setStatus('正在加载关卡…');
        // 打包环境首次读取资源 Bundle 会明显慢于编辑器；关卡和 profile 并行加载，
        // 并使用与外层页面进入流程一致的 30 秒边界，避免先被默认 8 秒取消。
        const [level, profile] = await this.lifetime.run(
            () => Promise.all([
                new CardLevelRepository().loadLevel(levelId),
                loadProfile(),
            ]),
            PACKAGED_CONTENT_LOAD_TIMEOUT_MS,
        );
        if (!this.node.isValid) return;
        this._level = level;
        if (!this.validateUiContract()) throw new Error('卡牌 prefab 节点合约不完整');
        const entry = profile.modules.find(item => item.id === 'base-card' && item.enabled);
        if (!entry) throw new Error('当前组合未启用 base-card');
        const configuredTestMode = entry.config.singleBackupCardTest;
        if (configuredTestMode !== undefined && typeof configuredTestMode !== 'boolean') {
            throw new Error('base-card.singleBackupCardTest 必须为 boolean');
        }
        // 测试开关默认关闭；仅在配置中显式开启时使用单张备用牌与强制不命中牌面。
        const singleBackupCardTest = configuredTestMode ?? false;
        const base = createCardMod(level, entry.config.seed ?? 20260917, {
            render: ctx => [{ id: 'base-card.render', timeoutMs: 10000, run: async scope => {
                const restore = this.preserveVisualTransforms();
                let cleaned = false;
                const cleanup = () => { if (cleaned) return; cleaned = true; this.cancelVisuals(); restore(); this.cleanupTransientVisuals(); };
                const release = scope.own(cleanup);
                try { await this.present(ctx, scope); } finally { cleanup(); release(); }
            } }],
            afterRender: () => { if (this.node.isValid) { this.cleanupTransientVisuals(); this.refresh(false); } },
        }, {
            initialStockCount: singleBackupCardTest ? 1 : 10,
            // 测试模式要能稳定观察免费牌耗尽后的付费入场效果。
            forceUnmatchedOpeningCards: singleBackupCardTest,
            initialCoins: options?.initialCoins,
            economy: options?.economy,
            retryCost: options?.economy.entryCost,
        });
        const extras = extensionsFor(profile, 'card', { root: this.node, find: name => this.findNode(name), context: () => levelId, afterInsert: () => this.bringInputBlockerToFront() });
        this.runtime = new Runtime([base, ...extras], { profile, level }, {
            diagnostic: entry => console.warn(`[Mods] ${entry.stage}: ${entry.message}`),
        });
        await this.runtime.open();
        await this.send('card.open');
    }
    private bind(): void {
        if (this.bound) return; this.bound = true;
        const pairs: [GameUiNodeId, GameUiActionType][] = [
            [GameUiNodeId.StockPile, GameUiActionType.DrawStock], [GameUiNodeId.Retry, GameUiActionType.Retry],
            [GameUiNodeId.End, GameUiActionType.Exit], [GameUiNodeId.Rollback, GameUiActionType.Rollback],
            [GameUiNodeId.Wild, GameUiActionType.ToggleWild], [GameUiNodeId.AddBackup, GameUiActionType.AddBackup], [GameUiNodeId.Pause, GameUiActionType.TogglePause],
        ];
        pairs.forEach(([name, type]) => this.bindAction(name, type));
        this.ensureRewardProgressBackdrop(); this.ensureStatusLabel(); this.ensureInputBlocker();
    }
    private bindAction(name: GameUiNodeId, type: GameUiActionType): void {
        const node = this.findNode(name); if (!node) return;
        // Click handlers are installed by this module; the view supplies only stable anchors.
        const button = node.getComponent(Button) ?? node.addComponent(Button);
        if (button) {
            // backup 是整叠备用牌的父节点；缩放它会让所有牌背同时弹一下。
            // 抽牌只播放顶牌飞行动画，不给整叠牌添加按压缩放。
            if (name === GameUiNodeId.StockPile) button.transition = Button.Transition.NONE;
            else this.configureButtonFeedback(button, 1.06);
        }
        node.on('click', () => void this.dispatch({ type } as GameUiAction), this);
    }
    protected async dispatch(action: GameUiAction): Promise<void> {
        const mapping: Record<GameUiActionType, string> = {
            playBoardCard: 'card.play', drawStock: 'card.draw', retry: 'card.restart', exit: 'card.exit',
            rollback: 'card.rollback', toggleWild: 'card.wild', addBackup: 'card.addBackup', togglePause: 'card.pause',
        };
        await this.send(mapping[action.type], action.type === GameUiActionType.PlayBoardCard ? { slotId: action.slotId } : undefined);
    }
    private async send(type: string, payload?: unknown): Promise<void> {
        const runtime = this.runtime;
        if (!runtime || runtime.isBusy || this.exiting) return;
        this.lock(true);
        try {
            const result = await runtime.dispatch({ type, ...(payload === undefined ? {} : { payload }) });
            if (!this.node.isValid) return;
            if (result.status === 'rejected' || result.status === 'failed') this.showToast(result.reason ?? '操作未完成');
            if (result.status === 'committed' && this.onCheckpoint) {
                try { await this.onCheckpoint(runtime.read<CardState>('base-card'), type); }
                catch (error) { if (this.node.isValid) { console.error('[Card save]', error); this.showToast('进度保存未完成，请稍后重试'); } }
                if (!this.node.isValid) return;
            }
            if (type === 'card.exit' && result.status === 'committed') {
                this.exiting = true; const callback = this.onExit; this.onExit = null;
                this.scheduleOnce(() => callback?.(), 0);
            } else if (type === 'card.play' && result.status === 'committed' &&
                this.model().core.isComplete && this.onComplete) {
                this.exiting = true;
                for (const child of this.node.children) {
                    // Completion keeps only the background; remaining stock/HUD must not show through.
                    if (child.name !== 'bg') child.active = false;
                }
                const completion = new Node('CardCompletion');
                completion.layer = this.node.layer; this.node.addChild(completion);
                completion.addComponent(CardCompletionUI).open(this.findNode(GameUiNodeId.CoinWallet), () => {
                    const callback = this.onComplete; this.onComplete = null; this.onExit = null;
                    // Keep the completed board stable until Continue; hand off after the button event.
                    this.scheduleOnce(() => callback?.(), 0);
                });
            }
        } finally { if (this.node.isValid && !this.exiting) { this.refresh(false); this.lock(false); } }
    }
    private model() {
        const state = this.runtime!.read<CardState>('base-card');
        const core = new HighLowSolitaireCore(this._level!); core.restoreSnapshot(state.core);
        const session = new GameSessionStore(this.economy); session.restoreCheckpoint(state.session);
        return { state, core, session };
    }
    private refresh(locked: boolean, concealed = false): GamePageViewState | null {
        if (!this.runtime || !this.node.isValid) return null;
        const { state, core, session } = this.model();
        const view = buildGamePageViewState({ core: core.getState(), session: session.getViewState(), paused: state.paused, inputLocked: locked, canRollback: this.runtime.canUndo });
        const version = ++this._renderVersion;
        this.renderBoard(view, version, concealed); this.renderCurrent(view, version, concealed); this.renderBackup(view, concealed);
        this.renderProgress(view); this.renderEconomy(view); this.renderStatus(view); this.renderActionState(view);
        return view;
    }
    private async present(ctx: CommittedContext, scope: TaskScope): Promise<void> {
        if (!this.node.isValid || !this.runtime) return;
        const result = ctx.result;
        const { core, session } = this.model();
        if (result.kind === 'open') {
            this.cleanupTransientVisuals();
            const reducedMotion = this.prefersReducedMotion();
            if (!reducedMotion) this.prepareOpeningVisualState();
            const view = this.refresh(true, !reducedMotion);
            if (view && !reducedMotion) {
                try {
                    await this.animateOpeningDeal(view);
                } catch (error) {
                    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
                    throw new Error(`入场动画失败：${detail}`);
                }
                scope.check();
            }
            return;
        }
        if (result.kind === 'play') {
            const source = this.findNode(GameUiNodeId.Board)?.getChildByName(result.slotId) ?? null;
            const progress = this.findNode(GameUiNodeId.RewardProgress)?.getChildByName(GameUiNodeId.ProgressItems);
            if (progress) this.renderProgressItems(progress, result.progressCells);
            await this.animateBoardSuccess(source, result.move, core.getState());
            scope.check();
            if (result.rewardCoins) { this.showToast(`连击奖励 +${result.rewardCoins}`); await this.animateCoinReward(); scope.check(); await this.animateProgressReset(session.getViewState().progressCells); }
        } else if (result.kind === 'draw') {
            await this.animateBackupToCurrent(this.getTopBackupNode(core.stockRemainingCount + 1), result.cardName);
        } else if (result.kind === 'missedMove') {
            await this.animateMissedMoveHint(result.slotIds);
        } else if (result.kind === 'wild.prepare') await this.animateWildToCurrent();
        else if (result.kind === 'wild.cancel') await this.animateCurrentCardFlip(core.currentCard!.cardName);
        // 付费备用牌已在按钮后方完整展示；领取时只让 afterRender 刷新并隐藏按钮，
        // 不再播放“从按钮新增卡牌”的飞牌动画。
        else if (result.kind === 'addBackup') { /* afterRender 负责隐藏按钮并开放牌堆。 */ }
        else if (result.kind === 'rollback' && result.visual) {
            await Promise.all([this.animateRollback(result.visual, core.getState(), session.wildReady ? 'poker_wild' : core.currentCard!.cardName), this.animateProgressRestore(result.previousProgress, session.getViewState().progressCells)]);
        }
    }
    private lock(value: boolean): void { this.ensureInputBlocker().active = value; if (value) this.bringInputBlockerToFront(); }
    protected onDestroy(): void { this.lifetime.dispose(); void this.runtime?.dispose(); this.onExit = null; this.onComplete = null; this.onCheckpoint = null; super.onDestroy(); }
}
