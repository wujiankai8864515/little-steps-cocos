/**
 * 高低接龙规则内核。
 * 不依赖 Cocos 节点、Figma 或 UI，只管理牌局逻辑状态。
 *
 * 使用方式：
 *   1. new HighLowSolitaireCore(levelDefinition)
 *   2. core.startGame()
 *   3. 通过 core 的公开属性读取当前状态，调用 tryMoveCard / drawStockPile 等命令
 *   4. 监听 onStateChanged 回调刷新 UI
 */

import type { CardLevelDefinition, CardLevelFigmaCardAudit } from './CardLevelTypes';

// ---------------------------------------------------------------------------
// 牌组
// ---------------------------------------------------------------------------

const SUITS = ['diamond', 'heart', 'spade', 'club'] as const;
type Suit = typeof SUITS[number];

const RANKS = [
    { code: '01', value: 1, label: 'A' },
    { code: '02', value: 2, label: '2' },
    { code: '03', value: 3, label: '3' },
    { code: '04', value: 4, label: '4' },
    { code: '05', value: 5, label: '5' },
    { code: '06', value: 6, label: '6' },
    { code: '07', value: 7, label: '7' },
    { code: '08', value: 8, label: '8' },
    { code: '09', value: 9, label: '9' },
    { code: '10', value: 10, label: '10' },
    { code: '11', value: 11, label: 'J' },
    { code: '12', value: 12, label: 'Q' },
    { code: '13', value: 13, label: 'K' },
] as const;

const SUIT_COLOR: Record<Suit, 'red' | 'black'> = {
    diamond: 'red',
    heart: 'red',
    spade: 'black',
    club: 'black',
};

export interface CardDef {
    readonly suit: Suit;
    readonly rankCode: string;
    readonly rankValue: number;
    readonly rankLabel: string;
    readonly color: 'red' | 'black';
    readonly cardName: string;
}

export interface SlotState {
    readonly slotId: string;
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
    readonly zIndex: number;
    card: CardDef | null;
    faceUp: boolean;
    coveredBy: readonly string[];
    /** 运行时动态计算：是否完全露出 */
    isFullyExposed: boolean;
}

export interface SolitaireGameState {
    readonly slots: readonly SlotState[];
    readonly currentCard: CardDef;
    /** 被替换的当前牌历史；牌面已释放，可以再次抽到。 */
    readonly usedPile: readonly CardDef[];
    readonly stockRemainingCount: number;
    readonly isComplete: boolean;
    readonly hasLegalMoves: boolean;
}

export type GameEventType = 'moveSuccess' | 'stockDrawn' | 'cardRevealed' | 'noLegalMoves' | 'complete';

export interface GameEvent {
    readonly type: GameEventType;
    readonly slotId?: string;
    /** 完全翻开的 slotId */
    readonly revealedSlotIds?: readonly string[];
    /** 仍被其他牌遮挡的 slotId */
    readonly stillCoveredSlotIds?: readonly string[];
}

export type MoveFailureReason = 'complete' | 'missing' | 'covered' | 'faceDown' | 'rank';

export interface MoveResult {
    readonly success: boolean;
    readonly slotId: string;
    readonly removedCard: CardDef | null;
    readonly revealedSlotIds: readonly string[];
    readonly stillCoveredSlotIds: readonly string[];
    readonly failureReason?: MoveFailureReason;
}

export interface SolitaireCoreSnapshot {
    readonly schemaVersion: 2;
    readonly slots: SlotState[];
    readonly currentCard: CardDef;
    /** 备用牌翻出前不绑定牌面，也不占用 52 种牌面。 */
    readonly stockRemainingCount: number;
    readonly usedPile: CardDef[];
    /** 仅单备用牌测试模式使用，第一次翻牌后清空，参与快照和回撤。 */
    readonly unmatchedOpeningDrawRanks: number[] | null;
    readonly isComplete: boolean;
}

export type GameStateCallback = (state: Readonly<SolitaireGameState>, event: GameEvent) => void;

// ---------------------------------------------------------------------------
// 内核
// ---------------------------------------------------------------------------

export const DEFAULT_INITIAL_STOCK_COUNT = 10;

export class HighLowSolitaireCore {
    private readonly _level: CardLevelDefinition;
    private _slots: SlotState[] = [];
    private _currentCard: CardDef | null = null;
    private _stockRemainingCount = 0;
    private _usedPile: CardDef[] = [];
    private _unmatchedOpeningDrawRanks: number[] | null = null;
    private _onStateChanged: GameStateCallback | null = null;
    private _isComplete = false;

    public constructor(level: CardLevelDefinition, private readonly random: () => number = Math.random) {
        this._level = level;
    }

    // -----------------------------------------------------------------------
    // 公开属性
    // -----------------------------------------------------------------------

    public get slots(): readonly SlotState[] {
        return this.copySlots(this._slots);
    }

    public get currentCard(): CardDef | null {
        return this._currentCard ? this.copyCard(this._currentCard) : null;
    }

    public get usedPile(): readonly CardDef[] {
        return this.copyCards(this._usedPile);
    }

    public get isComplete(): boolean {
        return this._isComplete;
    }

    public get hasLegalMoves(): boolean {
        return this.legalMoveSlotIds.length > 0;
    }

    /** 当前基准牌可消除的、已完全露出的牌位。 */
    public get legalMoveSlotIds(): readonly string[] {
        return this._slots.filter(
            (slot) => slot.isFullyExposed
                && slot.faceUp
                && slot.card
                && this.isAdjacent(slot.card.rankValue, this._currentCard?.rankValue ?? 0),
        ).map((slot) => slot.slotId);
    }

    public get stockRemainingCount(): number {
        return this._stockRemainingCount;
    }

    public set onStateChanged(callback: GameStateCallback | null) {
        this._onStateChanged = callback;
    }

    // -----------------------------------------------------------------------
    // 初始化
    // -----------------------------------------------------------------------

    /** 固定牌优先保留，其余牌位（包括背面）和当前牌从剩余牌面发放；备用牌只记数量。 */
    public startGame(
        initialStockCount = DEFAULT_INITIAL_STOCK_COUNT,
        forceUnmatchedOpeningCards = false,
    ): void {
        if (!Number.isSafeInteger(initialStockCount) || initialStockCount < 0) {
            throw new Error('[HighLowSolitaireCore] 初始备用牌数量必须是非负安全整数。');
        }
        const slots: SlotState[] = this._level.slots.map((slotDef) => ({
            slotId: slotDef.id,
            x: slotDef.x,
            y: slotDef.y,
            rotation: slotDef.rotation,
            zIndex: slotDef.zIndex,
            card: null,
            // 没有任何上层遮挡的牌必须在开局时可见、可点。
            // Figma 中的卡背只是牌位占位，不应让已经完全暴露的牌保持永久背面。
            faceUp: slotDef.initialFaceUp || slotDef.coveredBy.length === 0,
            coveredBy: [...slotDef.coveredBy],
            isFullyExposed: slotDef.coveredBy.length === 0,
        }));
        // 在消耗随机数和替换已有牌局前，拒绝过大牌阵、重复固定牌和损坏的遮挡关系。
        this.assertSlots(slots);
        const deck = this.createDeck();
        const takeFixedCard = (audit: CardLevelFigmaCardAudit, source: string): CardDef => {
            const index = deck.findIndex((card) => card.suit === audit.suit && card.rankCode === audit.rankCode);
            if (audit.side !== 'front' || index < 0 || audit.assetName !== deck[index].cardName) {
                throw new Error(`[HighLowSolitaireCore] ${source} 固定牌无效或重复：${audit.assetName}。`);
            }
            return deck.splice(index, 1)[0];
        };
        let currentCard = this._level.currentCard
            ? takeFixedCard(this._level.currentCard.figmaCard, 'currentCard') : null;
        slots.forEach((slot, index) => {
            const audit = this._level.slots[index].figmaCard;
            if (audit.side === 'front') slot.card = takeFixedCard(audit, slot.slotId);
        });
        this.shuffle(deck);
        for (const slot of slots) {
            if (!slot.card) slot.card = deck.pop()!;
        }

        // 测试模式仍覆盖固定当前牌，并在第一次动态翻牌时使用相同的不命中约束。
        if (forceUnmatchedOpeningCards && currentCard) {
            deck.push(currentCard);
            currentCard = null;
        }
        const exposedRanks = Array.from(new Set(slots
            .filter((slot) => slot.isFullyExposed && slot.faceUp && slot.card)
            .map((slot) => slot.card!.rankValue)));
        if (!currentCard) {
            currentCard = forceUnmatchedOpeningCards
                ? deck.find((candidate) => exposedRanks.every((rank) => !this.isAdjacent(candidate.rankValue, rank))) ?? null
                : deck.pop() ?? null;
        }
        if (!currentCard) throw new Error('[HighLowSolitaireCore] 找不到与开局明牌均不相邻的测试基准牌。');
        const unmatchedOpeningDrawRanks = forceUnmatchedOpeningCards && initialStockCount > 0 ? exposedRanks : null;
        this.assertStateData(slots, currentCard, initialStockCount, [], unmatchedOpeningDrawRanks, false);
        this._slots = slots;
        this._currentCard = currentCard;
        this._stockRemainingCount = initialStockCount;
        this._unmatchedOpeningDrawRanks = unmatchedOpeningDrawRanks;
        this._usedPile = [];
        this._isComplete = false;

        this.emitState('stockDrawn');
    }

    // -----------------------------------------------------------------------
    // 玩家命令
    // -----------------------------------------------------------------------

    /**
     * 尝试移除场上牌。
     * @returns true 表示移牌成功，false 表示非法操作。
     */
    public moveCard(slotId: string, ignoreRank = false): MoveResult {
        if (this._isComplete) {
            return this.failedMove(slotId, 'complete');
        }

        const slot = this._slots.find((s) => s.slotId === slotId);

        if (!slot || !slot.card) {
            return this.failedMove(slotId, 'missing');
        }

        if (!slot.isFullyExposed) {
            return this.failedMove(slotId, 'covered');
        }

        if (!slot.faceUp) {
            return this.failedMove(slotId, 'faceDown');
        }

        if (!ignoreRank && !this.isAdjacent(slot.card.rankValue, this._currentCard?.rankValue ?? 0)) {
            return this.failedMove(slotId, 'rank');
        }

        // 执行移牌
        const removedCard = slot.card;
        if (this._currentCard) {
            // usedPile 保存被替换的旧基准牌；新基准牌仍在 currentCard 中，不能重复归档。
            this._usedPile.push(this._currentCard);
        }
        slot.card = null;
        slot.faceUp = false;
        this._currentCard = removedCard;

        // 更新遮挡关系
        const { revealed, stillCovered } = this.updateCoveredBy(slotId);

        // 检查完成
        const allEmpty = this._slots.every((s) => s.card === null);
        if (allEmpty) {
            this._isComplete = true;
            this.emitState('complete', slotId, revealed, stillCovered);
            return this.successfulMove(slotId, removedCard, revealed, stillCovered);
        }

        // 重新计算合法操作
        const hasLegal = this.hasLegalMoves;
        const eventType: GameEventType = hasLegal ? 'moveSuccess' : 'noLegalMoves';
        this.emitState(eventType, slotId, revealed, stillCovered);
        return this.successfulMove(slotId, removedCard, revealed, stillCovered);
    }

    /** 兼容简单调用方。需要动画信息时使用 moveCard。 */
    public tryMoveCard(slotId: string): boolean {
        return this.moveCard(slotId).success;
    }

    /** 翻一张备用牌作为新基准牌 */
    public drawStockPile(): boolean {
        if (this._isComplete) {
            console.warn('[HighLowSolitaireCore] 牌局已完成，不能翻备用牌。');
            return false;
        }

        if (this._stockRemainingCount === 0) {
            console.warn('[HighLowSolitaireCore] 备用牌已空。');
            return false;
        }

        // 旧当前牌即将被替换，可重新成为候选；只保护所有仍在牌型区的牌（含背面）。
        const inPlay = new Set(this._slots.flatMap((slot) => slot.card ? [slot.card.cardName] : []));
        const candidates = this.createDeck().filter((card) => !inPlay.has(card.cardName)
            && (this._unmatchedOpeningDrawRanks === null || this._unmatchedOpeningDrawRanks.every(
                (rank) => !this.isAdjacent(card.rankValue, rank),
            )));
        if (candidates.length === 0) throw new Error('[HighLowSolitaireCore] 没有满足场上去重约束的备用牌面。');
        const card = candidates[Math.floor(this.random() * candidates.length)];
        if (this._currentCard) {
            this._usedPile.push(this._currentCard);
        }
        this._currentCard = card;
        this._stockRemainingCount--;
        this._unmatchedOpeningDrawRanks = null;
        this.emitState('stockDrawn');
        return true;
    }

    /**
     * 追加若干张备用牌（续局补牌，由扩展层调用）。
     * 只追加数量，不预定牌面、不消耗随机数；不能足额加入时不改变状态。
     * @returns 实际加入的数量。
     */
    public addStockCards(count: number): number {
        if (this._isComplete || !Number.isSafeInteger(count) || count <= 0
            || !Number.isSafeInteger(this._stockRemainingCount + count)) return 0;
        this._stockRemainingCount += count;
        this.emitState('stockDrawn');
        return count;
    }

    /** 获取当前完整状态快照 */
    public getState(): Readonly<SolitaireGameState> {
        this.assertIntegrity();
        return {
            slots: this.copySlots(this._slots),
            currentCard: this.copyCard(this.requireCurrentCard()),
            usedPile: this.copyCards(this._usedPile),
            stockRemainingCount: this._stockRemainingCount,
            isComplete: this._isComplete,
            hasLegalMoves: this.hasLegalMoves,
        };
    }

    /** 由规则层生成完整快照，UI 不接触内核私有字段。 */
    public captureSnapshot(): SolitaireCoreSnapshot {
        this.assertIntegrity();
        return this.copyValue({
            schemaVersion: 2,
            slots: this._slots,
            currentCard: this.requireCurrentCard(),
            stockRemainingCount: this._stockRemainingCount,
            usedPile: this._usedPile,
            unmatchedOpeningDrawRanks: this._unmatchedOpeningDrawRanks,
            isComplete: this._isComplete,
        });
    }

    /** 数据先恢复，调用方可在动画完成后再刷新表现。 */
    public restoreSnapshot(snapshot: Readonly<SolitaireCoreSnapshot>): void {
        if (snapshot?.schemaVersion !== 2) throw new Error('[HighLowSolitaireCore] 快照版本不兼容：需要动态备用牌 schemaVersion=2。');
        const restored = this.copyValue(snapshot);
        this.assertStateData(
            restored.slots,
            restored.currentCard,
            restored.stockRemainingCount,
            restored.usedPile,
            restored.unmatchedOpeningDrawRanks,
            restored.isComplete,
        );
        this._slots = restored.slots;
        this._currentCard = restored.currentCard;
        this._stockRemainingCount = restored.stockRemainingCount;
        this._usedPile = restored.usedPile;
        this._unmatchedOpeningDrawRanks = restored.unmatchedOpeningDrawRanks;
        this._isComplete = restored.isComplete;
    }

    /** 每次事务提交后执行，尽早阻止重复牌、坏遮挡关系或无当前牌扩散到 UI。 */
    public assertIntegrity(): void {
        this.assertStateData(
            this._slots,
            this._currentCard,
            this._stockRemainingCount,
            this._usedPile,
            this._unmatchedOpeningDrawRanks,
            this._isComplete,
        );
    }

    // -----------------------------------------------------------------------
    // 内部
    // -----------------------------------------------------------------------

    private isAdjacent(rankA: number, rankB: number): boolean {
        if (rankA <= 0 || rankB <= 0) return false;
        // 大一或小一，含 K(13)-A(1)-2(2) 循环
        const diff = rankA - rankB;
        if (diff === 1 || diff === -1) return true;
        // K(13) 和 A(1)：13-1=12 ≠ ±1，需单独判断
        if (rankA === 1 && rankB === 13) return true;
        if (rankA === 13 && rankB === 1) return true;
        return false;
    }

    private failedMove(slotId: string, failureReason: MoveFailureReason): MoveResult {
        return {
            success: false,
            slotId,
            removedCard: null,
            revealedSlotIds: [],
            stillCoveredSlotIds: [],
            failureReason,
        };
    }

    private successfulMove(
        slotId: string,
        removedCard: CardDef,
        revealedSlotIds: readonly string[],
        stillCoveredSlotIds: readonly string[],
    ): MoveResult {
        return {
            success: true,
            slotId,
            removedCard,
            revealedSlotIds,
            stillCoveredSlotIds,
        };
    }

    private copyValue<T>(value: T): T {
        return JSON.parse(JSON.stringify(value)) as T;
    }

    private copySlots(slots: readonly SlotState[]): SlotState[] {
        return slots.map((slot) => ({
            ...slot,
            card: slot.card ? this.copyCard(slot.card) : null,
            coveredBy: [...slot.coveredBy],
        }));
    }

    private copyCards(cards: readonly CardDef[]): CardDef[] {
        return cards.map((card) => this.copyCard(card));
    }

    private copyCard(card: Readonly<CardDef>): CardDef {
        return { ...card };
    }

    private requireCurrentCard(): CardDef {
        if (!this._currentCard) {
            throw new Error('[HighLowSolitaireCore] 牌局尚未初始化：缺少当前牌。');
        }
        return this._currentCard;
    }

    private assertStateData(
        slots: readonly SlotState[],
        currentCard: CardDef | null,
        stockRemainingCount: number,
        usedPile: readonly CardDef[],
        unmatchedOpeningDrawRanks: readonly number[] | null,
        isComplete: boolean,
    ): void {
        if (!Array.isArray(usedPile)
            || !Number.isSafeInteger(stockRemainingCount) || stockRemainingCount < 0
            || typeof isComplete !== 'boolean') {
            throw new Error('[HighLowSolitaireCore] 状态非法：备用牌数量、历史或完成态类型错误。');
        }
        if (unmatchedOpeningDrawRanks !== null
            && (!Array.isArray(unmatchedOpeningDrawRanks)
                || new Set(unmatchedOpeningDrawRanks).size !== unmatchedOpeningDrawRanks.length
                || unmatchedOpeningDrawRanks.some((rank) => !Number.isInteger(rank) || rank < 1 || rank > 13)
                || stockRemainingCount === 0)) {
            throw new Error('[HighLowSolitaireCore] 状态非法：开局测试牌约束损坏。');
        }
        this.assertSlots(slots);
        if (!currentCard) throw new Error('[HighLowSolitaireCore] 状态非法：缺少当前牌。');

        // 只有存活的场上牌与当前牌互斥；历史是记录，可以重复并可重新抽到。
        const liveCards = [currentCard, ...slots.flatMap((slot) => slot.card ? [slot.card] : [])];
        const names = new Set<string>();
        for (const card of liveCards) {
            this.assertCard(card);
            if (names.has(card.cardName)) {
                throw new Error(`[HighLowSolitaireCore] 状态非法：场上存在重复牌 ${card.cardName}。`);
            }
            names.add(card.cardName);
        }
        usedPile.forEach((card) => this.assertCard(card));
        if (isComplete !== slots.every((slot) => slot.card === null)) {
            throw new Error('[HighLowSolitaireCore] 状态非法：清空牌面与完成态不一致。');
        }
    }

    private assertSlots(slots: readonly SlotState[]): void {
        if (!Array.isArray(slots) || slots.length < 1 || slots.length > 51) {
            throw new Error('[HighLowSolitaireCore] 牌型区必须有 1–51 个牌位，为当前牌保留至少一种牌面。');
        }
        const slotIds = new Set<string>();
        for (const slot of slots) {
            if (!slot || typeof slot.slotId !== 'string' || !slot.slotId || slotIds.has(slot.slotId)) {
                throw new Error('[HighLowSolitaireCore] 状态非法：重复或空牌位 ID。');
            }
            slotIds.add(slot.slotId);
        }

        for (const slot of slots) {
            if (!Array.isArray(slot.coveredBy) || typeof slot.faceUp !== 'boolean' || typeof slot.isFullyExposed !== 'boolean'
                || (slot.card !== null && (typeof slot.card !== 'object' || !slot.card))) {
                throw new Error(`[HighLowSolitaireCore] 状态非法：${slot.slotId} 的遮挡或翻面状态损坏。`);
            }
            const covers = new Set<string>();
            for (const coveringId of slot.coveredBy) {
                if (coveringId === slot.slotId || !slotIds.has(coveringId) || covers.has(coveringId)) {
                    throw new Error(`[HighLowSolitaireCore] 状态非法：${slot.slotId} 的遮挡关系损坏。`);
                }
                covers.add(coveringId);
            }
            if (slot.card && slot.isFullyExposed !== (slot.coveredBy.length === 0)) {
                throw new Error(`[HighLowSolitaireCore] 状态非法：${slot.slotId} 的暴露状态不一致。`);
            }
        }
    }

    private assertCard(card: Readonly<CardDef>): void {
        const expectedColor = SUIT_COLOR[card?.suit];
        const rank = RANKS.find((candidate) => candidate.value === card?.rankValue);
        if (!card
            || !expectedColor
            || card.color !== expectedColor
            || !rank
            || card.rankCode !== rank.code
            || card.rankLabel !== rank.label
            || card.cardName !== `poker_${card.suit}_${expectedColor}_${rank.code}`) {
            throw new Error(`[HighLowSolitaireCore] 状态非法：卡牌数据损坏 ${card?.cardName ?? '(unknown)'}。`);
        }
    }

    /** 移除 slotId 牌后，更新受遮挡的牌位，返回 { 完全翻开, 仍被遮挡 } */
    private updateCoveredBy(removedSlotId: string): { revealed: string[]; stillCovered: string[] } {
        const revealed: string[] = [];
        const stillCovered: string[] = [];

        for (const slot of this._slots) {
            if (slot.coveredBy.indexOf(removedSlotId) >= 0) {
                slot.coveredBy = slot.coveredBy.filter((id) => id !== removedSlotId);

                if (slot.coveredBy.length === 0 && slot.card) {
                    slot.isFullyExposed = true;
                    if (!slot.faceUp) {
                        slot.faceUp = true;
                        revealed.push(slot.slotId);
                    }
                } else if (slot.coveredBy.length > 0 && slot.card) {
                    slot.isFullyExposed = false;
                    stillCovered.push(slot.slotId);
                }
            }
        }

        return { revealed, stillCovered };
    }

    private emitState(
        type: GameEventType,
        slotId?: string,
        revealedSlotIds?: string[],
        stillCoveredSlotIds?: string[],
    ): void {
        if (!this._onStateChanged) return;

        this._onStateChanged(this.getState(), {
            type,
            slotId,
            revealedSlotIds,
            stillCoveredSlotIds,
        });
    }

    // -----------------------------------------------------------------------
    // 牌池工具
    // -----------------------------------------------------------------------

    private createDeck(): CardDef[] {
        const deck: CardDef[] = [];

        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({
                    suit,
                    rankCode: rank.code,
                    rankValue: rank.value,
                    rankLabel: rank.label,
                    color: SUIT_COLOR[suit],
                    cardName: `poker_${suit}_${SUIT_COLOR[suit]}_${rank.code}`,
                });
            }
        }

        return deck;
    }

    private shuffle<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
