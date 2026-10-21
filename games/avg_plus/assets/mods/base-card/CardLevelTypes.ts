export interface CardLevelSource {
    readonly type: string;
    readonly pageName?: string;
    readonly frameName?: string;
}

export interface CardLevelSize {
    readonly width: number;
    readonly height: number;
}

export type CardLevelFigmaCardSide = 'front' | 'back' | 'wild';

export interface CardLevelFigmaCardAudit {
    readonly side: CardLevelFigmaCardSide;
    readonly assetName: string;
    readonly suit?: 'diamond' | 'heart' | 'spade' | 'club';
    readonly color?: 'red' | 'black';
    readonly rankCode?: string;
    readonly rankValue?: number;
    readonly label?: string;
    readonly rankLabel?: string;
    readonly variant?: string;
}

export interface CardLevelSlotDefinition {
    readonly id: string;
    readonly sourceName?: string;
    readonly figmaCard: CardLevelFigmaCardAudit;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly zIndex: number;
    readonly initialFaceUp: boolean;
    readonly coveredBy: readonly string[];
    readonly covers: readonly string[];
}

export interface CardLevelCurrentCardDefinition {
    readonly sourceName: string;
    readonly figmaCard: CardLevelFigmaCardAudit;
}

export interface CardLevelDefinition {
    readonly schemaVersion: 1;
    readonly levelId: string;
    readonly difficulty: number;
    readonly source?: CardLevelSource;
    readonly designSize: CardLevelSize;
    readonly cardSize: CardLevelSize;
    readonly slots: readonly CardLevelSlotDefinition[];
    readonly currentCard?: CardLevelCurrentCardDefinition;
    readonly initialStockCount?: number;
    /** 旧版 Figma 导入的审计字段；不再增加可用牌面或放宽场上去重约束。 */
    readonly deckCount?: number;
    readonly portraitLayout?: { readonly currentCardX: number; readonly stockAnchor?: 'left' | 'right' };
}
