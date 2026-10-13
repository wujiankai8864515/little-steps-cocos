import { FigmaNodeData } from './types';

/** @zh 颜色通道 0..1，来自 Figma JSON。 */
export interface FigmaColorLike {
    r?: number;
    g?: number;
    b?: number;
    a?: number;
}

/**
 * @zh 文字样式元数据。当前先随 slimTree 透传，后续用于 Cocos 侧 TextStyles 模板匹配。
 *     字段名对齐 Unity FigmaTextStyleTable.Entry / FigmaNodeData。
 */
export interface TextStyleMeta {
    textStyleName: string;
    textStyleId: string;
    fillStyleName: string;
    fillStyleId: string;
    strokeStyleName: string;
    strokeStyleId: string;
    effectStyleName: string;
    effectStyleId: string;
    figmaSignature: string;
    fontKey: string;
}

/** @zh 统计当前导入 JSON 里的 Figma 文字样式信息，便于确认样式元数据没有丢。 */
export class TextStyleTracker {
    private total = 0;
    private withTextStyleName = 0;
    private signatures = new Set<string>();
    private styleNames = new Map<string, number>();

    record(node: FigmaNodeData): void {
        this.total++;
        const name = String(node.textStyleName || '').trim();
        if (name) {
            this.withTextStyleName++;
            this.styleNames.set(name, (this.styleNames.get(name) || 0) + 1);
        }
        const sig = buildTextSignature(node);
        if (sig) this.signatures.add(sig);
    }

    report(): void {
        if (this.total === 0) return;
        console.log(
            `[figma-importer] 文字样式元数据：${this.withTextStyleName}/${this.total} 个文本带 textStyleName，` +
            `${this.signatures.size} 种 Unity 同款外观签名。`
        );
        if (this.styleNames.size === 0) return;
        const top = [...this.styleNames.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 8)
            .map(([name, count]) => `「${name}」×${count}`)
            .join('，');
        console.log(`[figma-importer]   常见文字样式：${top}`);
    }
}

export function extractTextStyleMeta(node: FigmaNodeData): TextStyleMeta {
    return {
        textStyleName: node.textStyleName || '',
        textStyleId: node.textStyleId || '',
        fillStyleName: node.fillStyleName || '',
        fillStyleId: node.fillStyleId || '',
        strokeStyleName: node.strokeStyleName || '',
        strokeStyleId: node.strokeStyleId || '',
        effectStyleName: node.effectStyleName || '',
        effectStyleId: node.effectStyleId || '',
        figmaSignature: buildTextSignature(node),
        fontKey: buildFontKey(node),
    };
}

/**
 * @zh Unity FigmaTextStyleTable.BuildSignature 的 TS 端口：
 *     字体(族+字重) + 描边 + 效果 + 渐变；不含字号与纯色颜色。
 */
export function buildTextSignature(node: FigmaNodeData): string {
    const parts: string[] = [];
    parts.push(`F:${norm(node.fontFamily)}|${normalizeWeight(node.fontWeight)}`);

    const stroke = firstVisibleStroke(node);
    if (stroke) {
        parts.push(`K:1|${col(stroke.color)}|${num(stroke.weight, 2)}|${norm(stroke.align)}`);
    } else {
        parts.push('K:0');
    }

    const effects = extractVisibleEffects(node);
    const effectSig = effects.map((e) =>
        `${norm(e.type)}|${col(e.color)}|${num(e.offsetX, 2)},${num(e.offsetY, 2)}|${num(e.radius, 2)}|${num(e.spread, 2)}`
    ).join(';');
    parts.push(`E:[${effectSig}]`);

    const gradient = firstGradientFill(node);
    if (gradient) {
        parts.push(`G:1|${norm(gradient.mode)}|${col(gradient.a)}|${col(gradient.b)}`);
    } else {
        parts.push('G:0');
    }

    return parts.join(' ');
}

export function buildFontKey(node: FigmaNodeData): string {
    return `F:${norm(node.fontFamily)}|${normalizeWeight(node.fontWeight)}`;
}

function firstVisibleStroke(node: FigmaNodeData): {
    color: FigmaColorLike;
    weight: number;
    align: string;
} | null {
    const strokes = node.strokes || [];
    const s = strokes.find((item: any) => item && item.visible !== false && item.type === 'SOLID');
    if (!s) return null;
    return {
        color: s,
        weight: node.strokeWeight || 0,
        align: node.strokeAlign || '',
    };
}

function extractVisibleEffects(node: FigmaNodeData): Array<{
    type: string;
    color: FigmaColorLike;
    offsetX: number;
    offsetY: number;
    radius: number;
    spread: number;
}> {
    const effects = node.effects || [];
    return effects
        .filter((e: any) => e && e.visible !== false)
        .map((e: any) => ({
            type: e.type || '',
            color: e,
            offsetX: e.offsetX || 0,
            offsetY: e.offsetY || 0,
            radius: e.radius || 0,
            spread: e.spread || 0,
        }));
}

function firstGradientFill(node: FigmaNodeData): { mode: string; a: FigmaColorLike; b: FigmaColorLike } | null {
    const fills = node.fills || [];
    for (const fill of fills) {
        if (!fill || fill.type !== 'SOLID' || fill.visible === false) continue;
        if (fill.gradientMode && fill.gradientColorA && fill.gradientColorB) {
            return { mode: fill.gradientMode, a: fill.gradientColorA, b: fill.gradientColorB };
        }
        return null;
    }
    return null;
}

function norm(value: string | undefined): string {
    return value == null || String(value).trim() === '' ? '' : String(value).trim().toLowerCase();
}

function normalizeWeight(value: string | undefined): string {
    return value == null || String(value).trim() === '' ? '' : String(value).trim().replace(/ /g, '').toLowerCase();
}

function num(value: number | undefined, digits: number): string {
    return Number(value || 0).toFixed(digits);
}

function col(color: FigmaColorLike): string {
    return `${num(color.r, 3)},${num(color.g, 3)},${num(color.b, 3)},${num(color.a ?? 1, 3)}`;
}
