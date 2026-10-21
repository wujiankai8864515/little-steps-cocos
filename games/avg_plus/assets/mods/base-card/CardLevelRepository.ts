import { JsonAsset, resources } from 'cc';
import { CardLevelCurrentCardDefinition, CardLevelDefinition, CardLevelFigmaCardAudit, CardLevelSlotDefinition } from './CardLevelTypes';

const CARD_LEVEL_ROOT = 'config/card-levels';
const LEVEL_REF_PATTERN = /^level_difficulty\d+_\d{2}$/;
const SLOT_ID_PATTERN = /^slot_\d{3}$/;
const BACK_CARD_PATTERN = /^poker_back_(\d{2})$/;
const FRONT_CARD_PATTERN = /^poker_(diamond|heart|spade|club)_(red|black)_(\d{2})$/;
const WILD_CARD_PATTERN = /^poker_wild$/;
const RANK_LABELS: Readonly<Record<string, string>> = Object.freeze({
    '01': 'A',
    '02': '2',
    '03': '3',
    '04': '4',
    '05': '5',
    '06': '6',
    '07': '7',
    '08': '8',
    '09': '9',
    '10': '10',
    '11': 'J',
    '12': 'Q',
    '13': 'K',
});
const SUIT_COLORS: Readonly<Record<string, string>> = Object.freeze({
    diamond: 'red',
    heart: 'red',
    spade: 'black',
    club: 'black',
});

export class CardLevelRepository {
    private readonly _cache = new Map<string, CardLevelDefinition>();

    public async loadLevel(levelRef: string): Promise<CardLevelDefinition> {
        this.validateLevelRef(levelRef);

        const cachedLevel = this._cache.get(levelRef);

        if (cachedLevel) {
            return cachedLevel;
        }

        const level = await this.loadJson<CardLevelDefinition>(`${CARD_LEVEL_ROOT}/${levelRef}`);
        this.validateLevel(levelRef, level);
        this._cache.set(levelRef, level);
        return level;
    }

    private loadJson<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            resources.load(path, JsonAsset, (error, asset) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (!asset) {
                    reject(new Error(`[CardLevelRepository] JSON 加载结果为空：${path}`));
                    return;
                }

                resolve(asset.json as T);
            });
        });
    }

    private validateLevelRef(levelRef: string): void {
        if (!LEVEL_REF_PATTERN.test(levelRef)) {
            throw new Error(`[CardLevelRepository] levelRef 必须匹配 level_difficultyX_YY：${levelRef}`);
        }
    }

    private validateLevel(expectedLevelId: string, level: CardLevelDefinition): void {
        if (level.schemaVersion !== 1) {
            throw new Error(`[CardLevelRepository] ${expectedLevelId} schemaVersion 必须为 1。`);
        }

        if (level.levelId !== expectedLevelId) {
            throw new Error(`[CardLevelRepository] ${expectedLevelId} 的 levelId 不一致：${level.levelId}`);
        }

        if (!Number.isFinite(level.difficulty) || level.difficulty < 1) {
            throw new Error(`[CardLevelRepository] ${expectedLevelId} difficulty 非法。`);
        }

        this.validateSize(expectedLevelId, 'designSize', level.designSize);
        this.validateSize(expectedLevelId, 'cardSize', level.cardSize);

        if (!Array.isArray(level.slots) || level.slots.length === 0) {
            throw new Error(`[CardLevelRepository] ${expectedLevelId} 至少需要一个 slot。`);
        }
        if (level.slots.length > 51) {
            throw new Error(`[CardLevelRepository] ${expectedLevelId} 牌型区最多 51 张，必须为当前牌保留牌面。`);
        }

        const slotIds = new Set<string>();
        const decks = level.deckCount ?? 1;
        if (!Number.isInteger(decks) || decks < 1 || decks > 4) throw new Error(`[CardLevelRepository] ${expectedLevelId} 牌副数量非法。`);
        if (level.initialStockCount !== undefined && (!Number.isSafeInteger(level.initialStockCount) || level.initialStockCount < 0)) {
            throw new Error(`[CardLevelRepository] ${expectedLevelId} 初始备用牌数量必须是非负安全整数。`);
        }
        if (level.portraitLayout !== undefined && (!this.isRecord(level.portraitLayout) || !Number.isFinite(level.portraitLayout.currentCardX) || Math.abs(level.portraitLayout.currentCardX) > 500)) {
            throw new Error(`[CardLevelRepository] ${expectedLevelId} 竖屏操作行位置非法。`);
        }
        if (level.portraitLayout?.stockAnchor !== undefined && !['left','right'].includes(level.portraitLayout.stockAnchor)) throw new Error(`[CardLevelRepository] ${expectedLevelId} 备用牌锚点非法。`);

        for (const slot of level.slots) {
            this.validateSlot(expectedLevelId, slot);

            if (slotIds.has(slot.id)) {
                throw new Error(`[CardLevelRepository] ${expectedLevelId} 存在重复 slot：${slot.id}`);
            }

            slotIds.add(slot.id);
        }

        this.validateCurrentCard(expectedLevelId, level);
        const fixed = new Set<string>();
        for (const card of [...level.slots.map(s => s.figmaCard), ...(level.currentCard ? [level.currentCard.figmaCard] : [])]) {
            if (card.side !== 'front') continue;
            if (fixed.has(card.assetName)) throw new Error(`[CardLevelRepository] ${expectedLevelId} 指定了重复固定牌：${card.assetName}`);
            fixed.add(card.assetName);
        }

        for (const slot of level.slots) {
            for (const coveredBy of slot.coveredBy) {
                if (!slotIds.has(coveredBy)) {
                    throw new Error(`[CardLevelRepository] ${expectedLevelId} / ${slot.id} 引用了不存在的遮挡牌位：${coveredBy}`);
                }

                if (coveredBy === slot.id) {
                    throw new Error(`[CardLevelRepository] ${expectedLevelId} / ${slot.id} 不能遮挡自己。`);
                }

                const blocker = level.slots.find((candidate) => candidate.id === coveredBy);

                if (blocker && !blocker.covers.includes(slot.id)) {
                    throw new Error(`[CardLevelRepository] ${expectedLevelId} / ${slot.id} coveredBy 与 ${coveredBy}.covers 不一致。`);
                }
            }

            for (const covers of slot.covers) {
                if (!slotIds.has(covers)) {
                    throw new Error(`[CardLevelRepository] ${expectedLevelId} / ${slot.id} 引用了不存在的被遮挡牌位：${covers}`);
                }

                if (covers === slot.id) {
                    throw new Error(`[CardLevelRepository] ${expectedLevelId} / ${slot.id} 不能覆盖自己。`);
                }

                const covered = level.slots.find((candidate) => candidate.id === covers);

                if (covered && !covered.coveredBy.includes(slot.id)) {
                    throw new Error(`[CardLevelRepository] ${expectedLevelId} / ${slot.id} covers 与 ${covers}.coveredBy 不一致。`);
                }
            }
        }
    }

    private validateSize(levelId: string, label: string, size: unknown): void {
        if (!this.isRecord(size) || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
            throw new Error(`[CardLevelRepository] ${levelId} ${label} 非法。`);
        }
    }

    private validateSlot(levelId: string, slot: CardLevelSlotDefinition): void {
        if (!slot || typeof slot !== 'object') {
            throw new Error(`[CardLevelRepository] ${levelId} 存在非法 slot。`);
        }

        if (!SLOT_ID_PATTERN.test(slot.id)) {
            throw new Error(`[CardLevelRepository] ${levelId} slot id 必须匹配 slot_001：${slot.id}`);
        }

        if (!Number.isFinite(slot.x) || !Number.isFinite(slot.y)) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} 坐标非法。`);
        }

        if (!Number.isFinite(slot.width) || !Number.isFinite(slot.height) || slot.width <= 0 || slot.height <= 0) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} 尺寸非法。`);
        }

        if (!Number.isFinite(slot.rotation) || !Number.isFinite(slot.zIndex)) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} rotation 或 zIndex 非法。`);
        }

        if (typeof slot.initialFaceUp !== 'boolean') {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} initialFaceUp 必须为 boolean。`);
        }

        this.validateFigmaCard(levelId, slot);

        if (!Array.isArray(slot.coveredBy)) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} coveredBy 必须为数组。`);
        }

        if (!Array.isArray(slot.covers)) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} covers 必须为数组。`);
        }
    }

    private validateCurrentCard(levelId: string, level: CardLevelDefinition): void {
        const currentCard = level.currentCard;

        if (currentCard === undefined) {
            return;
        }

        if (!this.isObjectRecord(currentCard)) {
            throw new Error(`[CardLevelRepository] ${levelId} currentCard 必须为对象。`);
        }

        const audit = currentCard.figmaCard;

        if (!this.isObjectRecord(audit)) {
            throw new Error(`[CardLevelRepository] ${levelId} currentCard.figmaCard 必须为对象。`);
        }

        if (audit.side !== 'front') {
            throw new Error(`[CardLevelRepository] ${levelId} currentCard 必须是正面牌（side=front）。`);
        }

        if (typeof currentCard.sourceName !== 'string' || currentCard.sourceName.length === 0) {
            throw new Error(`[CardLevelRepository] ${levelId} currentCard.sourceName 非法。`);
        }

        if (currentCard.sourceName !== audit.assetName) {
            throw new Error(`[CardLevelRepository] ${levelId} currentCard.sourceName 与 figmaCard.assetName 不一致。`);
        }

        this.validateFrontAudit(levelId, 'currentCard', audit);

        if (audit.suit && audit.rankCode) {
            const duplicateSlot = level.slots.find((slot) =>
                slot.figmaCard.side === 'front' && slot.figmaCard.suit === audit.suit && slot.figmaCard.rankCode === audit.rankCode);

            if (duplicateSlot) {
                throw new Error(`[CardLevelRepository] ${levelId} currentCard 与 ${duplicateSlot.id} 指定了同一张牌：${audit.assetName}`);
            }
        }
    }

    private validateFigmaCard(levelId: string, slot: CardLevelSlotDefinition): void {
        const audit = slot.figmaCard;

        if (!this.isObjectRecord(audit)) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} figmaCard 必须为对象。`);
        }

        if (typeof audit.assetName !== 'string' || audit.assetName.length === 0) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} figmaCard.assetName 非法。`);
        }

        if (slot.sourceName && audit.assetName !== slot.sourceName) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} sourceName 与 figmaCard.assetName 不一致。`);
        }

        if (audit.side === 'back') {
            this.validateBackAudit(levelId, slot.id, audit);
            return;
        }

        if (audit.side === 'front') {
            this.validateFrontAudit(levelId, slot.id, audit);
            return;
        }

        if (audit.side === 'wild' && WILD_CARD_PATTERN.test(audit.assetName)) {
            return;
        }

        throw new Error(`[CardLevelRepository] ${levelId} / ${slot.id} figmaCard.side 非法。`);
    }

    private validateBackAudit(levelId: string, slotId: string, audit: CardLevelFigmaCardAudit): void {
        const match = audit.assetName.match(BACK_CARD_PATTERN);

        if (!match || audit.variant !== match[1]) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slotId} 背面牌审计信息非法。`);
        }
    }

    private validateFrontAudit(levelId: string, slotId: string, audit: CardLevelFigmaCardAudit): void {
        const match = audit.assetName.match(FRONT_CARD_PATTERN);

        if (!match) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slotId} 正面牌名称非法：${audit.assetName}`);
        }

        const [, suit, color, rankCode] = match;
        const rankValue = Number(rankCode);
        const label = RANK_LABELS[rankCode];

        if (!label || SUIT_COLORS[suit] !== color) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slotId} 正面牌命名不在允许矩阵内。`);
        }

        if (audit.suit !== suit || audit.color !== color || audit.rankCode !== rankCode || audit.rankValue !== rankValue || audit.label !== label || audit.rankLabel !== label) {
            throw new Error(`[CardLevelRepository] ${levelId} / ${slotId} 正面牌花色点数审计信息非法。`);
        }
    }

    private isRecord(value: unknown): value is Record<string, number> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private isObjectRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}
