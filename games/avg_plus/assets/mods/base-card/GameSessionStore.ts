import type { CardDef } from './HighLowSolitaireCore';
import type { EconomyConfig } from '../base-shell/CatalogConfig';

export const HITS_PER_REWARD = 4;
export const INITIAL_COINS = 999;
export const INITIAL_FREE_STOCK_COUNT = 10;
export const BASE_REWARD_COINS = 100;

export type CardColor = CardDef['color'];

/** 所有会消耗金币的动作。枚举值与 prefab 的动作节点名保持一致。 */
export enum PaidGameAction {
    Rollback = 'rollback',
    Wild = 'wild',
    AddBackup = 'addBackup',
}

/** 进度条单体只接受展示态，不读取牌局或其他 UI 节点。 */
export enum ProgressCellState {
    Empty = 'empty',
    Red = 'red',
    Black = 'black',
}

interface ActionCostRule {
    readonly base: number;
    readonly increment: number;
}

const ACTION_COST_RULES: Readonly<Record<PaidGameAction, ActionCostRule>> = {
    [PaidGameAction.Rollback]: { base: 100, increment: 100 },
    [PaidGameAction.Wild]: { base: 100, increment: 100 },
    [PaidGameAction.AddBackup]: { base: 100, increment: 0 },
};

interface MutableSessionState {
    coins: number;
    completionRewarded: boolean;
    streakColors: CardColor[];
    streakSuits: (CardDef['suit'] | null)[];
    freeStockDraws: number;
    wildReady: boolean;
    /** 反滥用计数属于消费历史；普通牌局回撤绝不能降低它。 */
    actionUses: Record<PaidGameAction.Rollback | PaidGameAction.Wild, number>;
}

export interface GameSessionSnapshot {
    readonly coins: number;
    readonly completionRewarded?: boolean;
    readonly streakColors: readonly CardColor[];
    readonly streakSuits?: readonly (CardDef['suit'] | null)[];
    readonly freeStockDraws: number;
    readonly wildReady: boolean;
    readonly actionUses: Readonly<Record<PaidGameAction.Rollback | PaidGameAction.Wild, number>>;
}

export interface GameSessionViewState {
    readonly coins: number;
    readonly progressCells: readonly ProgressCellState[];
    readonly progressSuits: readonly (CardDef['suit'] | null)[];
    readonly freeStockDraws: number;
    readonly freeStockUsedUp: boolean;
    readonly wildReady: boolean;
    readonly actionCosts: Readonly<Record<PaidGameAction, number>>;
}

export interface HitResolution {
    readonly progressIndex: number;
    readonly cellState: ProgressCellState.Red | ProgressCellState.Black;
    readonly rewardEarned: boolean;
    readonly rewardMultiplier: 1 | 2;
    readonly rewardCoins: number;
}

export interface RollbackResolution {
    readonly cost: number;
    readonly coinsAfter: number;
}

function createInitialState(coins = INITIAL_COINS): MutableSessionState {
    return {
        coins,
        completionRewarded: false,
        streakColors: [],
        streakSuits: [],
        freeStockDraws: 0,
        wildReady: false,
        actionUses: {
            [PaidGameAction.Rollback]: 0,
            [PaidGameAction.Wild]: 0,
        },
    };
}

/**
 * 局内附加状态的唯一写入口。
 *
 * UI 只能派发动作并读取 getViewState()；任何 UI 节点都不能直接持有或修改这里的数据。
 * capture/restoreCheckpoint 用于异常时的原子恢复，restoreForRollback 则保留递增费用计数。
 */
export class GameSessionStore {
    private _state: MutableSessionState;
    public constructor(private readonly economy?: EconomyConfig, coins = INITIAL_COINS, private readonly freeStockCount = INITIAL_FREE_STOCK_COUNT) {
        if (!Number.isInteger(freeStockCount) || freeStockCount < 0 || freeStockCount > 52) throw new Error('[GameSessionStore] 免费备用牌数量非法。');
        if (economy && (!['completionReward','streakRewardCoins'].every(key => {
            const value = economy[key as 'completionReward' | 'streakRewardCoins']; return value === undefined || Number.isSafeInteger(value) && value >= 0;
        }) || (economy.streakTarget !== undefined && (!Number.isInteger(economy.streakTarget) || economy.streakTarget < 1 || economy.streakTarget > 12)) ||
            (economy.streakResetOnDraw !== undefined && typeof economy.streakResetOnDraw !== 'boolean'))) throw new Error('[GameSessionStore] 奖励或连击配置非法。');
        this._state = createInitialState(coins);
        this.assertIntegrity();
    }

    public reset(coins = INITIAL_COINS): void {
        this._state = createInitialState(coins);
    }

    public get coins(): number {
        return this._state.coins;
    }

    private get streakTarget(): number { return this.economy?.streakTarget ?? HITS_PER_REWARD; }

    public get streakColors(): readonly CardColor[] {
        return [...this._state.streakColors];
    }

    public get wildReady(): boolean {
        return this._state.wildReady;
    }

    public get freeStockDraws(): number {
        return this._state.freeStockDraws;
    }

    public getActionCost(action: PaidGameAction): number {
        const rule = this.economy?.[action] ?? ACTION_COST_RULES[action];
        const uses = action === PaidGameAction.AddBackup ? 0 : this._state.actionUses[action];
        return Math.min(Number.MAX_SAFE_INTEGER, rule.base + rule.increment * uses);
    }

    public canAfford(action: PaidGameAction): boolean {
        return this._state.coins >= this.getActionCost(action);
    }

    /** 成功执行付费动作后调用；校验失败时不产生任何部分扣款。 */
    public spend(action: PaidGameAction.Wild | PaidGameAction.AddBackup): number {
        const cost = this.getActionCost(action);
        if (this._state.coins < cost) {
            throw new Error(`[GameSessionStore] 金币不足：${action} 需要 ${cost}。`);
        }

        this._state.coins -= cost;
        if (action === PaidGameAction.Wild) {
            this._state.actionUses[PaidGameAction.Wild] += 1;
        }
        this.assertIntegrity();
        return cost;
    }

    public setWildReady(ready: boolean): void {
        if (typeof ready !== 'boolean') {
            throw new Error('[GameSessionStore] wildReady 必须是布尔值。');
        }
        this._state.wildReady = ready;
        this.assertIntegrity();
    }

    /** 补牌推进免费牌计数；关卡配置决定是否清空连击。旧关卡默认保留。 */
    public recordStockDraw(): void {
        if (this.economy?.streakResetOnDraw) { this._state.streakColors = []; this._state.streakSuits = []; }
        this._state.freeStockDraws = Math.min(
            this.freeStockCount,
            this._state.freeStockDraws + 1,
        );
        this.assertIntegrity();
    }

    /** 命中达到配置的连击数时原子结算奖励；旧关卡默认四次，视频关卡为五次。 */
    public recordHit(color: CardColor, suit: CardDef['suit'] | null = null): HitResolution {
        if (color !== 'red' && color !== 'black') {
            throw new Error(`[GameSessionStore] 不支持的牌色：${String(color)}。`);
        }
        if (this._state.streakColors.length >= this.streakTarget) {
            // 表现层即使上次动画中断，也不会污染下一轮连击。
            this._state.streakColors = [];
            this._state.streakSuits = [];
        }

        this._state.streakColors.push(color);
        this._state.streakSuits.push(suit);
        const progressIndex = this._state.streakColors.length - 1;
        const rewardEarned = this._state.streakColors.length === this.streakTarget;
        const monochrome = rewardEarned
            && this._state.streakColors.every((item) => item === this._state.streakColors[0]);
        const rewardMultiplier: 1 | 2 = monochrome ? 2 : 1;
        const rewardCoins = rewardEarned ? (this.economy?.streakRewardCoins ?? BASE_REWARD_COINS) * rewardMultiplier : 0;
        this._state.coins = Math.min(Number.MAX_SAFE_INTEGER, this._state.coins + rewardCoins);
        this.assertIntegrity();

        return {
            progressIndex,
            cellState: color === 'red' ? ProgressCellState.Red : ProgressCellState.Black,
            rewardEarned,
            rewardMultiplier,
            rewardCoins,
        };
    }

    public finishRewardCycle(): void {
        // The reference keeps all four marks until the next hit and does not award coins.
        if (this.economy?.streakRewardCoins === 0) return;
        if (this._state.streakColors.length >= this.streakTarget) {
            this._state.streakColors = [];
            this._state.streakSuits = [];
        }
        this.assertIntegrity();
    }

    /** Called only by the move that changes the core from playing to complete. */
    public awardCompletion(): number {
        if (this._state.completionRewarded) return 0;
        const before = this._state.coins;
        this._state.completionRewarded = true;
        this._state.coins = Math.min(Number.MAX_SAFE_INTEGER, before + (this.economy?.completionReward ?? 0));
        this.assertIntegrity();
        return this._state.coins - before;
    }

    public captureSnapshot(): GameSessionSnapshot {
        return {
            coins: this._state.coins,
            completionRewarded: this._state.completionRewarded,
            streakColors: [...this._state.streakColors],
            streakSuits: [...this._state.streakSuits],
            freeStockDraws: this._state.freeStockDraws,
            wildReady: this._state.wildReady,
            actionUses: { ...this._state.actionUses },
        };
    }

    /** 仅供事务失败恢复，包含反滥用计数。 */
    public restoreCheckpoint(snapshot: Readonly<GameSessionSnapshot>): void {
        this.assertSnapshot(snapshot);
        this._state = {
            coins: snapshot.coins,
            completionRewarded: snapshot.completionRewarded ?? false,
            streakColors: [...snapshot.streakColors],
            streakSuits: [...(snapshot.streakSuits ?? snapshot.streakColors.map(() => null))],
            freeStockDraws: snapshot.freeStockDraws,
            wildReady: snapshot.wildReady,
            actionUses: { ...snapshot.actionUses },
        };
        this.assertIntegrity();
    }

    /**
     * 玩家回撤：恢复可回撤状态，反转被撤动作的金币净变化，再扣本次回撤费。
     * rollback/wild 使用次数不会随牌局快照倒退，防止连续回撤绕过递增成本。
     */
    public restoreForRollback(
        snapshot: Readonly<GameSessionSnapshot>,
        actionCoinDelta: number,
    ): RollbackResolution {
        this.assertSnapshot(snapshot);
        if (!Number.isSafeInteger(actionCoinDelta)) {
            throw new Error('[GameSessionStore] 回撤金币差值非法。');
        }

        const cost = this.getActionCost(PaidGameAction.Rollback);
        if (this._state.coins < cost) {
            throw new Error(`[GameSessionStore] 金币不足：回撤需要 ${cost}。`);
        }

        const currentUses = { ...this._state.actionUses };
        const restoredCoins = this._state.coins - actionCoinDelta - cost;
        this._state = {
            coins: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, restoredCoins)),
            completionRewarded: snapshot.completionRewarded ?? false,
            streakColors: [...snapshot.streakColors],
            streakSuits: [...(snapshot.streakSuits ?? snapshot.streakColors.map(() => null))],
            freeStockDraws: snapshot.freeStockDraws,
            wildReady: snapshot.wildReady,
            actionUses: {
                ...currentUses,
                [PaidGameAction.Rollback]: currentUses[PaidGameAction.Rollback] + 1,
            },
        };
        this.assertIntegrity();
        return { cost, coinsAfter: this._state.coins };
    }

    public getViewState(): GameSessionViewState {
        const cells: ProgressCellState[] = Array.from(
            { length: this.streakTarget },
            (_, index) => {
                const color = this._state.streakColors[index];
                if (color === 'red') return ProgressCellState.Red;
                if (color === 'black') return ProgressCellState.Black;
                return ProgressCellState.Empty;
            },
        );

        return {
            coins: this._state.coins,
            progressCells: cells,
            progressSuits: [...this._state.streakSuits],
            freeStockDraws: this._state.freeStockDraws,
            freeStockUsedUp: this._state.freeStockDraws >= this.freeStockCount,
            wildReady: this._state.wildReady,
            actionCosts: {
                [PaidGameAction.Rollback]: this.getActionCost(PaidGameAction.Rollback),
                [PaidGameAction.Wild]: this.getActionCost(PaidGameAction.Wild),
                [PaidGameAction.AddBackup]: this.getActionCost(PaidGameAction.AddBackup),
            },
        };
    }

    public assertIntegrity(): void {
        if (this._state.streakSuits.length !== this._state.streakColors.length || this._state.streakSuits.some(suit => suit !== null && !['diamond','heart','spade','club'].includes(suit))) throw new Error('[GameSessionStore] 连击花色非法。');
        if (typeof this._state.completionRewarded !== 'boolean') throw new Error('[GameSessionStore] 通关奖励标记非法。');
        const { coins, streakColors, freeStockDraws, actionUses } = this._state;
        if (typeof this._state.wildReady !== 'boolean') {
            throw new Error('[GameSessionStore] wildReady 状态非法。');
        }
        if (!Number.isSafeInteger(coins) || coins < 0) {
            throw new Error('[GameSessionStore] coins 必须是非负安全整数。');
        }
        if (!Number.isInteger(freeStockDraws)
            || freeStockDraws < 0
            || freeStockDraws > this.freeStockCount) {
            throw new Error('[GameSessionStore] freeStockDraws 超出合法范围。');
        }
        if (streakColors.length > this.streakTarget
            || streakColors.some((color) => color !== 'red' && color !== 'black')) {
            throw new Error('[GameSessionStore] 连击进度非法。');
        }
        if (!Number.isSafeInteger(actionUses[PaidGameAction.Rollback])
            || actionUses[PaidGameAction.Rollback] < 0
            || !Number.isSafeInteger(actionUses[PaidGameAction.Wild])
            || actionUses[PaidGameAction.Wild] < 0) {
            throw new Error('[GameSessionStore] 付费动作计数非法。');
        }
    }

    private assertSnapshot(snapshot: Readonly<GameSessionSnapshot>): void {
        if (!snapshot || !Array.isArray(snapshot.streakColors) || !snapshot.actionUses) {
            throw new Error('[GameSessionStore] 快照结构非法。');
        }
        const checkpoint = this._state;
        this._state = {
            coins: snapshot.coins,
            completionRewarded: snapshot.completionRewarded ?? false,
            streakColors: [...snapshot.streakColors],
            streakSuits: [...(snapshot.streakSuits ?? snapshot.streakColors.map(() => null))],
            freeStockDraws: snapshot.freeStockDraws,
            wildReady: snapshot.wildReady,
            actionUses: { ...snapshot.actionUses },
        };
        try {
            this.assertIntegrity();
        } finally {
            this._state = checkpoint;
        }
    }
}
