import type { CardDef } from './HighLowSolitaireCore';

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
    streakColors: CardColor[];
    freeStockDraws: number;
    wildReady: boolean;
    /** 反滥用计数属于消费历史；普通牌局回撤绝不能降低它。 */
    actionUses: Record<PaidGameAction.Rollback | PaidGameAction.Wild, number>;
}

export interface GameSessionSnapshot {
    readonly coins: number;
    readonly streakColors: readonly CardColor[];
    readonly freeStockDraws: number;
    readonly wildReady: boolean;
    readonly actionUses: Readonly<Record<PaidGameAction.Rollback | PaidGameAction.Wild, number>>;
}

export interface GameSessionViewState {
    readonly coins: number;
    readonly progressCells: readonly ProgressCellState[];
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

function createInitialState(): MutableSessionState {
    return {
        coins: INITIAL_COINS,
        streakColors: [],
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
    private _state: MutableSessionState = createInitialState();

    public reset(): void {
        this._state = createInitialState();
    }

    public get coins(): number {
        return this._state.coins;
    }

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
        const rule = ACTION_COST_RULES[action];
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

    /** 补牌只推进免费牌计数，绝不改变连续命中进度。 */
    public recordStockDraw(): void {
        this._state.freeStockDraws = Math.min(
            INITIAL_FREE_STOCK_COUNT,
            this._state.freeStockDraws + 1,
        );
        this.assertIntegrity();
    }

    /** 记录一次命中并在第 4 次时原子结算奖励；进度稍后由 finishRewardCycle 清空。 */
    public recordHit(color: CardColor): HitResolution {
        if (color !== 'red' && color !== 'black') {
            throw new Error(`[GameSessionStore] 不支持的牌色：${String(color)}。`);
        }
        if (this._state.streakColors.length >= HITS_PER_REWARD) {
            // 表现层即使上次动画中断，也不会污染下一轮连击。
            this._state.streakColors = [];
        }

        this._state.streakColors.push(color);
        const progressIndex = this._state.streakColors.length - 1;
        const rewardEarned = this._state.streakColors.length === HITS_PER_REWARD;
        const monochrome = rewardEarned
            && this._state.streakColors.every((item) => item === this._state.streakColors[0]);
        const rewardMultiplier: 1 | 2 = monochrome ? 2 : 1;
        const rewardCoins = rewardEarned ? BASE_REWARD_COINS * rewardMultiplier : 0;
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
        if (this._state.streakColors.length >= HITS_PER_REWARD) {
            this._state.streakColors = [];
        }
        this.assertIntegrity();
    }

    public captureSnapshot(): GameSessionSnapshot {
        return {
            coins: this._state.coins,
            streakColors: [...this._state.streakColors],
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
            streakColors: [...snapshot.streakColors],
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
            streakColors: [...snapshot.streakColors],
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
            { length: HITS_PER_REWARD },
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
            freeStockDraws: this._state.freeStockDraws,
            freeStockUsedUp: this._state.freeStockDraws >= INITIAL_FREE_STOCK_COUNT,
            wildReady: this._state.wildReady,
            actionCosts: {
                [PaidGameAction.Rollback]: this.getActionCost(PaidGameAction.Rollback),
                [PaidGameAction.Wild]: this.getActionCost(PaidGameAction.Wild),
                [PaidGameAction.AddBackup]: this.getActionCost(PaidGameAction.AddBackup),
            },
        };
    }

    public assertIntegrity(): void {
        const { coins, streakColors, freeStockDraws, actionUses } = this._state;
        if (typeof this._state.wildReady !== 'boolean') {
            throw new Error('[GameSessionStore] wildReady 状态非法。');
        }
        if (!Number.isSafeInteger(coins) || coins < 0) {
            throw new Error('[GameSessionStore] coins 必须是非负安全整数。');
        }
        if (!Number.isInteger(freeStockDraws)
            || freeStockDraws < 0
            || freeStockDraws > INITIAL_FREE_STOCK_COUNT) {
            throw new Error('[GameSessionStore] freeStockDraws 超出合法范围。');
        }
        if (streakColors.length > HITS_PER_REWARD
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
            streakColors: [...snapshot.streakColors],
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
