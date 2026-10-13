import type { CardDef, SolitaireGameState } from './HighLowSolitaireCore';
import {
    PaidGameAction,
    type GameSessionViewState,
    type ProgressCellState,
} from './GameSessionStore';

/** prefab / 运行时节点的稳定 ID；业务代码不再散落魔法字符串。 */
export enum GameUiNodeId {
    Board = 'content',
    CurrentCard = 'current',
    StockPile = 'backup',
    RewardProgress = 'progress',
    ProgressItems = 'progress_items',
    CoinWallet = 'coin',
    Pause = 'pause',
    Rollback = 'rollback',
    Wild = 'wild',
    AddBackup = 'addBackup',
    Retry = 'retry',
    End = 'end',
    Status = 'gameStatus',
    Toast = 'toast',
    InputBlocker = 'inputBlocker',
}

/** UI 只能向控制器发送这些意图，组件之间禁止直接通讯。 */
export enum GameUiActionType {
    PlayBoardCard = 'playBoardCard',
    DrawStock = 'drawStock',
    Retry = 'retry',
    Exit = 'exit',
    Rollback = 'rollback',
    ToggleWild = 'toggleWild',
    AddBackup = 'addBackup',
    TogglePause = 'togglePause',
}

export type GameUiAction =
    | { readonly type: GameUiActionType.PlayBoardCard; readonly slotId: string }
    | { readonly type: Exclude<GameUiActionType, GameUiActionType.PlayBoardCard> };

export enum GameUiComponentId {
    Board = 'board',
    CurrentCard = 'currentCard',
    StockPile = 'stockPile',
    RewardProgress = 'rewardProgress',
    CoinWallet = 'coinWallet',
    PauseControl = 'pauseControl',
    RollbackControl = 'rollbackControl',
    WildControl = 'wildControl',
    AddBackupControl = 'addBackupControl',
    RetryControl = 'retryControl',
    EndControl = 'endControl',
    StatusMessage = 'statusMessage',
    Toast = 'toast',
    InputBlocker = 'inputBlocker',
}

export interface GameUiComponentSpec {
    readonly id: GameUiComponentId;
    readonly node: GameUiNodeId;
    readonly viewFields: readonly string[];
    readonly emits?: readonly GameUiActionType[];
    readonly runtimeOwned?: boolean;
}

/** 14 个有状态 UI 组件；进度数量和花色由视图状态提供。 */
export const GAME_UI_COMPONENT_SPECS: readonly GameUiComponentSpec[] = [
    { id: GameUiComponentId.Board, node: GameUiNodeId.Board, viewFields: ['boardCards'], emits: [GameUiActionType.PlayBoardCard] },
    { id: GameUiComponentId.CurrentCard, node: GameUiNodeId.CurrentCard, viewFields: ['currentCardName'] },
    { id: GameUiComponentId.StockPile, node: GameUiNodeId.StockPile, viewFields: ['stockRemainingCount', 'controls.stockEnabled'], emits: [GameUiActionType.DrawStock] },
    { id: GameUiComponentId.RewardProgress, node: GameUiNodeId.RewardProgress, viewFields: ['progressCells'] },
    { id: GameUiComponentId.CoinWallet, node: GameUiNodeId.CoinWallet, viewFields: ['coins'] },
    { id: GameUiComponentId.PauseControl, node: GameUiNodeId.Pause, viewFields: ['controls.pauseEnabled'], emits: [GameUiActionType.TogglePause] },
    { id: GameUiComponentId.RollbackControl, node: GameUiNodeId.Rollback, viewFields: ['controls.rollbackVisible', 'controls.rollbackEnabled', 'actionCosts.rollback'], emits: [GameUiActionType.Rollback] },
    { id: GameUiComponentId.WildControl, node: GameUiNodeId.Wild, viewFields: ['controls.wildVisible', 'controls.wildEnabled', 'actionCosts.wild'], emits: [GameUiActionType.ToggleWild] },
    { id: GameUiComponentId.AddBackupControl, node: GameUiNodeId.AddBackup, viewFields: ['controls.addBackupVisible', 'controls.addBackupEnabled', 'actionCosts.addBackup'], emits: [GameUiActionType.AddBackup] },
    { id: GameUiComponentId.RetryControl, node: GameUiNodeId.Retry, viewFields: ['controls.retryVisible'], emits: [GameUiActionType.Retry] },
    { id: GameUiComponentId.EndControl, node: GameUiNodeId.End, viewFields: ['controls.endVisible'], emits: [GameUiActionType.Exit] },
    { id: GameUiComponentId.StatusMessage, node: GameUiNodeId.Status, viewFields: ['statusMessage'], runtimeOwned: true },
    { id: GameUiComponentId.Toast, node: GameUiNodeId.Toast, viewFields: ['oneShotEffect'], runtimeOwned: true },
    { id: GameUiComponentId.InputBlocker, node: GameUiNodeId.InputBlocker, viewFields: ['inputLocked'], runtimeOwned: true },
];

export interface BoardCardViewState {
    readonly slotId: string;
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
    readonly zIndex: number;
    readonly cardName: string;
    readonly faceUp: boolean;
    readonly interactable: boolean;
}

export interface GameControlViewState {
    readonly retryVisible: boolean;
    readonly endVisible: boolean;
    readonly rollbackVisible: boolean;
    readonly wildVisible: boolean;
    readonly addBackupVisible: boolean;
    readonly stockEnabled: boolean;
    readonly rollbackEnabled: boolean;
    readonly wildEnabled: boolean;
    readonly addBackupEnabled: boolean;
    readonly pauseEnabled: boolean;
}

export interface GamePageViewState {
    readonly boardCards: readonly BoardCardViewState[];
    readonly currentCardName: string;
    readonly stockRemainingCount: number;
    readonly coins: number;
    readonly progressCells: readonly ProgressCellState[];
    readonly progressSuits: readonly (CardDef['suit'] | null)[];
    readonly actionCosts: Readonly<Record<PaidGameAction, number>>;
    readonly controls: GameControlViewState;
    readonly statusMessage: string;
    readonly inputLocked: boolean;
    readonly isComplete: boolean;
}

export interface GamePageViewSource {
    readonly core: Readonly<SolitaireGameState>;
    readonly session: Readonly<GameSessionViewState>;
    readonly paused: boolean;
    readonly inputLocked: boolean;
    readonly canRollback: boolean;
}

/** 牌堆耗尽时，付费入口后方预先完整展示领取后可操作的备用牌。 */
export const ADD_BACKUP_CARD_COUNT = 5;

export function visibleBackupCardCount(
    view: Pick<GamePageViewState, 'stockRemainingCount' | 'controls'>,
): number {
    const count = view.controls.addBackupVisible
        ? Math.max(view.stockRemainingCount, ADD_BACKUP_CARD_COUNT)
        : view.stockRemainingCount;
    return Math.max(0, count);
}

/** 唯一 Core/Session -> UI 投影函数。返回值之外的数据一律不允许被组件读取。 */
export function buildGamePageViewState(source: Readonly<GamePageViewSource>): GamePageViewState {
    const { core, session, paused, inputLocked, canRollback } = source;
    const gameplayEnabled = !paused && !inputLocked && !core.isComplete;
    let statusMessage = '';
    if (core.isComplete) {
        statusMessage = '关卡完成';
    } else if (paused) {
        statusMessage = '已暂停\n点击右上角继续';
    } else if (session.wildReady) {
        statusMessage = '请选择任意一张已翻开的牌';
    } else if (core.stockRemainingCount === 0 && !core.hasLegalMoves) {
        statusMessage = '无牌可走\n可补充备用牌';
    }

    return {
        boardCards: core.slots
            .filter((slot) => Boolean(slot.card))
            .map((slot) => ({
                slotId: slot.slotId,
                x: slot.x,
                y: slot.y,
                rotation: slot.rotation,
                zIndex: slot.zIndex,
                cardName: slot.faceUp ? slot.card!.cardName : 'poker_back_01',
                faceUp: slot.faceUp,
                interactable: gameplayEnabled && slot.faceUp && slot.isFullyExposed,
            }))
            .sort((a, b) => a.zIndex - b.zIndex),
        currentCardName: session.wildReady ? 'poker_wild' : core.currentCard.cardName,
        stockRemainingCount: core.stockRemainingCount,
        coins: session.coins,
        progressCells: [...session.progressCells],
        progressSuits: [...(session.progressSuits ?? [])],
        actionCosts: { ...session.actionCosts },
        controls: {
            retryVisible: session.freeStockUsedUp,
            endVisible: session.freeStockUsedUp,
            rollbackVisible: canRollback,
            wildVisible: !core.isComplete,
            addBackupVisible: !session.wildReady && !core.isComplete && core.stockRemainingCount === 0,
            stockEnabled: gameplayEnabled && !session.wildReady && core.stockRemainingCount > 0,
            rollbackEnabled: gameplayEnabled && canRollback,
            wildEnabled: gameplayEnabled,
            addBackupEnabled: gameplayEnabled && !session.wildReady && core.stockRemainingCount === 0,
            pauseEnabled: !inputLocked && !core.isComplete,
        },
        statusMessage,
        inputLocked,
        isComplete: core.isComplete,
    };
}
