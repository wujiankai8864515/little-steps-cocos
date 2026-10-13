import type { CommittedContext, DraftContext, Mod, PresentationTask } from '../../foundation/Contracts';
import { clone } from '../../foundation/Data';
import type { CardLevelDefinition } from './CardLevelTypes';
import {
    DEFAULT_INITIAL_STOCK_COUNT,
    HighLowSolitaireCore,
    SolitaireCoreSnapshot,
} from './HighLowSolitaireCore';
import { GameSessionStore, GameSessionSnapshot, PaidGameAction } from './GameSessionStore';
import { manifest } from './ModManifest';
import type { EconomyConfig } from '../base-shell/CatalogConfig';
export interface CardState { core: SolitaireCoreSnapshot; session: GameSessionSnapshot; paused: boolean; rng: number; lastMove: { kind: 'board' | 'stock' | 'addBackup'; slotId?: string; cardName?: string } | null; }
export interface CardPorts { render(ctx: CommittedContext): readonly PresentationTask[]; afterRender(ctx: CommittedContext): void; }
export interface CardSetupOptions {
    readonly initialStockCount?: number;
    readonly forceUnmatchedOpeningCards?: boolean;
    readonly initialCoins?: number;
    readonly economy?: EconomyConfig;
    readonly retryCost?: number;
}
function random(state: { rng: number }): () => number {
    return () => { let x = state.rng | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; state.rng = x >>> 0; return state.rng / 4294967296; };
}
export function createCardMod(
    level: CardLevelDefinition,
    seed: number,
    ports?: CardPorts,
    setup: Readonly<CardSetupOptions> = {},
): Mod {
    if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('卡牌 seed 必须为 1–4294967295 的整数');
    const initialStockCount = setup.initialStockCount ?? level.initialStockCount ?? DEFAULT_INITIAL_STOCK_COUNT;
    const initialRng = { rng: seed }; const first = new HighLowSolitaireCore(level, random(initialRng));
    first.startGame(initialStockCount, setup.forceUnmatchedOpeningCards ?? false);
    const initialState: CardState = { core: first.captureSnapshot(), session: new GameSessionStore(setup.economy, setup.initialCoins, initialStockCount).captureSnapshot(), paused: false, rng: initialRng.rng, lastMove: null };
    const hydrate = (state: CardState) => {
        const core = new HighLowSolitaireCore(level, random(state)); core.restoreSnapshot(state.core);
        const session = new GameSessionStore(setup.economy,undefined,initialStockCount); session.restoreCheckpoint(state.session); return { core, session };
    };
    return {
        manifest, initialState,
        actions: ['card.open','card.play','card.draw','card.wild','card.addBackup','card.rollback','card.pause','card.restart','card.exit'],
        validate(states) {
            const state = states[manifest.id] as CardState;
            if (!state || !Number.isInteger(state.rng) || state.rng < 1 || state.rng > 0xffffffff || typeof state.paused !== 'boolean') throw new Error('卡牌状态无效');
            if (state.lastMove && !['board','stock','addBackup'].includes(state.lastMove.kind)) throw new Error('回撤表现记录无效');
            const { core, session } = hydrate(clone(state)); core.assertIntegrity(); session.assertIntegrity();
        },
        restoreUndo(previous: CardState, current: CardState, after: CardState): CardState {
            const { session } = hydrate(clone(current));
            session.restoreForRollback(previous.session, after.session.coins - previous.session.coins);
            return { ...previous, session: session.captureSnapshot(), paused: current.paused };
        },
        execute(ctx: DraftContext) {
            let state = ctx.draft[manifest.id] as CardState;
            if (ctx.action.type === 'card.restart') {
                const retryCost = setup.retryCost;
                if (retryCost !== undefined && (!Number.isSafeInteger(retryCost) || retryCost < 0)) ctx.reject('重试费用配置无效');
                if (retryCost !== undefined && state.session.coins < retryCost) ctx.reject(`金币不足（需要 ${retryCost}）`);
                const next = clone(initialState);
                if (retryCost !== undefined) next.session = { ...next.session, coins: state.session.coins - retryCost };
                ctx.clearHistory(); ctx.draft[manifest.id] = next; ctx.result = { kind: 'open' }; return;
            }
            if (ctx.action.type === 'card.open' || ctx.action.type === 'card.exit') { ctx.result = { kind: ctx.action.type.slice(5) }; return; }
            if (ctx.action.type === 'card.pause') { state.paused = !state.paused; ctx.result = { kind: 'pause' }; return; }
            if (state.paused) ctx.reject('请先继续游戏');
            const { core, session } = hydrate(state);
            if (ctx.action.type !== 'card.rollback' && core.isComplete) ctx.reject('关卡已完成');
            const afford = (action: PaidGameAction) => { if (!session.canAfford(action)) ctx.reject(`金币不足（需要 ${session.getActionCost(action)}）`); };
            switch (ctx.action.type) {
                case 'card.play': {
                    const slotId = ctx.action.payload?.slotId;
                    if (typeof slotId !== 'string') ctx.reject('牌位无效');
                    if (session.wildReady) afford(PaidGameAction.Wild);
                    const move = core.moveCard(slotId, session.wildReady);
                    if (!move.success || !move.removedCard) ctx.reject(`不能出这张牌：${move.failureReason}`);
                    if (session.wildReady) { session.setWildReady(false); session.spend(PaidGameAction.Wild); }
                    const hit = session.recordHit(move.removedCard.color);
                    const progressCells = session.getViewState().progressCells;
                    session.finishRewardCycle();
                    state.lastMove = { kind: 'board', slotId, cardName: move.removedCard.cardName };
                    ctx.recordUndo();
                    ctx.result = { kind: 'play', slotId, move, hit, progressCells, rewardCoins: hit.rewardCoins, complete: core.isComplete };
                    break;
                }
                case 'card.draw': {
                    if (session.wildReady || !core.stockRemainingCount) ctx.reject('当前不能补牌');
                    const legalSlotIds = core.legalMoveSlotIds;
                    if (legalSlotIds.length > 0) {
                        ctx.result = { kind: 'missedMove', slotIds: legalSlotIds };
                        break;
                    }
                    if (!core.drawStockPile()) ctx.reject('没有备用牌');
                    session.recordStockDraw(); state.lastMove = { kind: 'stock', cardName: core.currentCard!.cardName };
                    ctx.recordUndo(); ctx.result = { kind: 'draw', cardName: core.currentCard!.cardName }; break;
                }
                case 'card.wild': {
                    if (!session.wildReady) afford(PaidGameAction.Wild);
                    session.setWildReady(!session.wildReady); ctx.result = { kind: session.wildReady ? 'wild.prepare' : 'wild.cancel' }; break;
                }
                case 'card.addBackup': {
                    if (session.wildReady || core.stockRemainingCount) ctx.reject('只有牌堆耗尽后可以加牌');
                    afford(PaidGameAction.AddBackup); const added = core.addStockCards(5).length;
                    if (!added) ctx.reject('无牌可补'); session.spend(PaidGameAction.AddBackup);
                    state.lastMove = { kind: 'addBackup' }; ctx.recordUndo(); ctx.result = { kind: 'addBackup', added }; break;
                }
                case 'card.rollback': {
                    afford(PaidGameAction.Rollback);
                    const visual = clone(state.lastMove); const previousProgress = session.getViewState().progressCells;
                    ctx.undo(); ctx.result = { kind: 'rollback', visual, previousProgress }; return;
                }
                default: ctx.reject('未知卡牌动作');
            }
            state.core = core.captureSnapshot(); state.session = session.captureSnapshot();
        },
        render: ctx => ports?.render(ctx),
        afterRender: ctx => ports?.afterRender(ctx),
    };
}
