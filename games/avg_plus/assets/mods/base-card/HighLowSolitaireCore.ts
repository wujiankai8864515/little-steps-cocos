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

import type { CardLevelDefinition } from './CardLevelTypes';

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
    /** Physical copy within the configured decks; absent is the original first deck. */
    readonly copyIndex?: number;
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
    readonly stockPile: readonly CardDef[];
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
    readonly slots: SlotState[];
    readonly currentCard: CardDef;
    readonly stockPile: CardDef[];
    readonly usedPile: CardDef[];
    readonly deck: CardDef[];
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
    private _stockPile: CardDef[] = [];
    private _usedPile: CardDef[] = [];
    private _deck: CardDef[] = [];
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

    public get stockPile(): readonly CardDef[] {
        return this.copyCards(this._stockPile);
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
        return this._stockPile.length;
    }

    public set onStateChanged(callback: GameStateCallback | null) {
        this._onStateChanged = callback;
    }

    // -----------------------------------------------------------------------
    // 初始化
    // -----------------------------------------------------------------------

    /**
     * 生成 52 张牌池、初始化牌位、发场上牌和初始基准牌。
     *
     * 发牌逻辑：
     * 1. 配置中已有具体花色的正面牌 → 从牌池中取出该牌放到对应牌位（不随机）
     * 2. 配置中只有卡背的背面牌 → 从剩余牌池随机分配
     * 3. 剩余牌用于备用牌和初始基准牌
     */
    public startGame(
        initialStockCount = DEFAULT_INITIAL_STOCK_COUNT,
        forceUnmatchedOpeningCards = false,
    ): void {
        if (!Number.isInteger(initialStockCount) || initialStockCount < 0 || initialStockCount > 52) {
            throw new Error('[HighLowSolitaireCore] 初始备用牌数量必须是 0–52 的整数。');
        }
        if (!Number.isInteger(this._level.deckCount ?? 1) || (this._level.deckCount ?? 1) < 1 || (this._level.deckCount ?? 1) > 4
            || this._level.slots.length + initialStockCount + 1 > (this._level.deckCount ?? 1) * 52) {
            throw new Error('[HighLowSolitaireCore] 关卡牌副数量不足或无效。');
        }
        this._deck = this.createDeck();
        this.shuffle(this._deck);

        this._slots = this._level.slots.map((slotDef) => ({
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

        // 第 0 步：关卡配置指定了固定当前牌时，先从牌池取出（防止与发牌重复）
        let fixedCurrentCard: CardDef | null = null;
        const currentCardDef = this._level.currentCard;
        const currentCardFigma = currentCardDef?.figmaCard;

        if (currentCardFigma?.side === 'front' && currentCardFigma.suit && currentCardFigma.rankCode) {
            const index = this._deck.findIndex(
                (c) => c.suit === currentCardFigma.suit && c.rankCode === currentCardFigma.rankCode,
            );

            if (index >= 0) {
                fixedCurrentCard = this._deck[index];
                this._deck.splice(index, 1);
            } else {
                throw new Error(`[HighLowSolitaireCore] 当前牌 ${currentCardDef?.sourceName} 不在配置牌池。`);
            }
        }

        // 第 1 步：处理配置中已确定花色的正面牌（从牌池中取出）
        for (const slot of this._slots) {
            const slotDef = this._level.slots.find((s) => s.id === slot.slotId);
            const figmaCard = slotDef?.figmaCard;

            if (figmaCard?.side === 'front' && figmaCard.suit && figmaCard.rankCode) {
                // 从牌池中找到匹配的牌
                const index = this._deck.findIndex(
                    (c) => c.suit === figmaCard.suit && c.rankCode === figmaCard.rankCode,
                );

                if (index >= 0) {
                    // 取出该牌
                    slot.card = this._deck[index];
                    this._deck.splice(index, 1);
                } else {
                    throw new Error(`[HighLowSolitaireCore] 固定牌 ${figmaCard.assetName} 超出配置牌副数量。`);
                }
            }
        }

        // 第 2 步：给其余牌位随机分配（从剩余牌池）
        for (const slot of this._slots) {
            if (slot.card) continue; // 已有确定牌面

            const card = this._deck.pop();
            if (!card) {
                throw new Error('[HighLowSolitaireCore] 牌池不足，无法完成发牌。');
            }
            slot.card = card;
        }

        // 测试模式需要稳定进入“免费牌耗尽”状态：当前牌和唯一备用牌
        // 均选择不与开局可点牌相邻的点数。固定当前牌要放回牌池，保持 52 张完整性。
        if (forceUnmatchedOpeningCards && fixedCurrentCard) {
            this._deck.push(fixedCurrentCard);
            fixedCurrentCard = null;
        }
        const exposedRanks = this._slots
            .filter((slot) => slot.isFullyExposed && slot.faceUp && slot.card)
            .map((slot) => slot.card!.rankValue);
        const takeOpeningCard = (): CardDef | null => {
            if (!forceUnmatchedOpeningCards) return this._deck.pop() ?? null;
            const index = this._deck.findIndex((candidate) => exposedRanks.every(
                (rank) => !this.isAdjacent(candidate.rankValue, rank),
            ));
            if (index < 0) return null;
            return this._deck.splice(index, 1)[0];
        };

        // 初始备用牌数量由装配配置决定；初始当前牌始终单独发放，不计入此数量。
        this._stockPile = [];
        for (let i = 0; i < initialStockCount; i++) {
            const card = takeOpeningCard();
            if (!card) break;
            this._stockPile.push(card);
        }

        // 初始基准牌：配置指定则用指定牌，否则从牌池发第 1 张
        if (fixedCurrentCard) {
            this._currentCard = fixedCurrentCard;
        } else {
            const firstCard = takeOpeningCard();
            if (!firstCard) {
                throw new Error(forceUnmatchedOpeningCards
                    ? '[HighLowSolitaireCore] 找不到与开局明牌均不相邻的测试基准牌。'
                    : '[HighLowSolitaireCore] 牌池不足，无法发初始基准牌。');
            }
            this._currentCard = firstCard;
        }
        this._usedPile = [];
        this._isComplete = false;
        this.assertIntegrity();

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

        if (this._stockPile.length === 0) {
            console.warn('[HighLowSolitaireCore] 备用牌已空。');
            return false;
        }

        const card = this._stockPile.shift()!;
        if (this._currentCard) {
            this._usedPile.push(this._currentCard);
        }
        this._currentCard = card;
        this.emitState('stockDrawn');
        return true;
    }

    /**
     * 追加若干张备用牌（续局补牌，由扩展层调用）。
     * 从剩余牌池按序取出；牌池用尽时用一副尚未入局的新牌重建。
     * @returns 实际加入的牌。
     */
    public addStockCards(count: number): CardDef[] {
        if (this._isComplete || !Number.isFinite(count) || count <= 0) return [];

        const safeCount = Math.min(52, Math.floor(count));
        const added: CardDef[] = [];
        while (added.length < safeCount) {
            if (this._deck.length === 0) this.reshuffleRemainingDeck();
            const card = this._deck.pop();
            if (!card) break;
            this._stockPile.push(card);
            added.push(card);
        }

        if (added.length > 0) {
            this.emitState('stockDrawn');
        }
        return added;
    }

    /** 获取当前完整状态快照 */
    public getState(): Readonly<SolitaireGameState> {
        this.assertIntegrity();
        return {
            slots: this.copySlots(this._slots),
            currentCard: this.copyCard(this.requireCurrentCard()),
            stockPile: this.copyCards(this._stockPile),
            usedPile: this.copyCards(this._usedPile),
            stockRemainingCount: this._stockPile.length,
            isComplete: this._isComplete,
            hasLegalMoves: this.hasLegalMoves,
        };
    }

    /** 由规则层生成完整快照，UI 不接触内核私有字段。 */
    public captureSnapshot(): SolitaireCoreSnapshot {
        this.assertIntegrity();
        return this.copyValue({
            slots: this._slots,
            currentCard: this.requireCurrentCard(),
            stockPile: this._stockPile,
            usedPile: this._usedPile,
            deck: this._deck,
            isComplete: this._isComplete,
        });
    }

    /** 数据先恢复，调用方可在动画完成后再刷新表现。 */
    public restoreSnapshot(snapshot: Readonly<SolitaireCoreSnapshot>): void {
        const restored = this.copyValue(snapshot);
        this.assertStateData(
            restored.slots,
            restored.currentCard,
            restored.stockPile,
            restored.usedPile,
            restored.deck,
            restored.isComplete,
        );
        this._slots = restored.slots;
        this._currentCard = restored.currentCard;
        this._stockPile = restored.stockPile;
        this._usedPile = restored.usedPile;
        this._deck = restored.deck;
        this._isComplete = restored.isComplete;
    }

    /** 每次事务提交后执行，尽早阻止重复牌、坏遮挡关系或无当前牌扩散到 UI。 */
    public assertIntegrity(): void {
        this.assertStateData(
            this._slots,
            this._currentCard,
            this._stockPile,
            this._usedPile,
            this._deck,
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
        stockPile: readonly CardDef[],
        usedPile: readonly CardDef[],
        deck: readonly CardDef[],
        isComplete: boolean,
    ): void {
        if (!Array.isArray(slots)
            || !Array.isArray(stockPile)
            || !Array.isArray(usedPile)
            || !Array.isArray(deck)
            || typeof isComplete !== 'boolean') {
            throw new Error('[HighLowSolitaireCore] 状态非法：集合或完成态类型错误。');
        }
        if (!currentCard) {
            throw new Error('[HighLowSolitaireCore] 状态非法：缺少当前牌。');
        }

        const slotIds = new Set<string>();
        for (const slot of slots) {
            if (!slot.slotId || slotIds.has(slot.slotId)) {
                throw new Error(`[HighLowSolitaireCore] 状态非法：重复或空牌位 ID ${slot.slotId}。`);
            }
            slotIds.add(slot.slotId);
        }

        for (const slot of slots) {
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

        const allCards: CardDef[] = [currentCard, ...stockPile, ...usedPile, ...deck];
        slots.forEach((slot) => {
            if (slot.card) allCards.push(slot.card);
        });
        const names = new Set<string>();
        for (const card of allCards) {
            this.assertCard(card);
            const identity = this.cardIdentity(card);
            if (names.has(identity)) {
                throw new Error(`[HighLowSolitaireCore] 状态非法：牌组中存在重复牌 ${card.cardName}。`);
            }
            names.add(identity);
        }
        const expected = SUITS.length * RANKS.length * (this._level.deckCount ?? 1);
        if (names.size !== expected) {
            throw new Error(`[HighLowSolitaireCore] 状态非法：完整牌组应为 ${expected} 张，当前为 ${names.size} 张。`);
        }

        if (isComplete && slots.some((slot) => slot.card !== null)) {
            throw new Error('[HighLowSolitaireCore] 状态非法：未清空牌面却标记为完成。');
        }
    }

    private assertCard(card: Readonly<CardDef>): void {
        const expectedColor = SUIT_COLOR[card?.suit];
        if (!card
            || !card.cardName
            || !expectedColor
            || card.color !== expectedColor
            || !Number.isInteger(card.rankValue)
            || card.rankValue < 1
            || card.rankValue > 13
            || typeof card.rankCode !== 'string'
            || typeof card.rankLabel !== 'string') {
            throw new Error(`[HighLowSolitaireCore] 状态非法：卡牌数据损坏 ${card?.cardName ?? '(unknown)'}。`);
        }
        const copy = card.copyIndex ?? 0;
        if (!Number.isInteger(copy) || copy < 0 || copy >= (this._level.deckCount ?? 1)
            || card.cardName !== `poker_${card.suit}_${card.color}_${card.rankCode}`
            || RANKS.find(rank => rank.code === card.rankCode)?.value !== card.rankValue) {
            throw new Error('[HighLowSolitaireCore] 状态非法：卡牌身份或副本编号损坏。');
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
        for (let copyIndex = 0; copyIndex < (this._level.deckCount ?? 1); copyIndex++) {
            for (const suit of SUITS) {
                for (const rank of RANKS) {
                    deck.push({
                        suit,
                        rankCode: rank.code,
                        rankValue: rank.value,
                        rankLabel: rank.label,
                        color: SUIT_COLOR[suit],
                        cardName: `poker_${suit}_${SUIT_COLOR[suit]}_${rank.code}`,
                        ...(copyIndex ? { copyIndex } : {}),
                    });
                }
            }
        }

        return deck;
    }
    private cardIdentity(card: CardDef): string { return `${card.cardName}@${card.copyIndex ?? 0}`; }

    /** 当前牌池用尽时重建一副牌，只排除仍在桌面、当前牌和备用牌中的牌。 */
    private reshuffleRemainingDeck(): void {
        const inPlay = new Set<string>();
        for (const slot of this._slots) {
            if (slot.card) inPlay.add(this.cardIdentity(slot.card));
        }
        for (const card of this._stockPile) inPlay.add(this.cardIdentity(card));
        if (this._currentCard) inPlay.add(this.cardIdentity(this._currentCard));

        const fresh = this.createDeck().filter((card) => !inPlay.has(this.cardIdentity(card)));
        this.shuffle(fresh);
        this._deck = fresh;
        // 废牌已经回收到新牌池；同步清空，保持 52 张牌唯一且避免历史无限增长。
        this._usedPile = [];
    }

    private shuffle<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
