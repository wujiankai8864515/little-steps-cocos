import { FigmaExportData, FigmaNodeData } from './types';
import { buildTextSignature } from './textstyle';

export interface GeneratedTextStyleLibrary {
    name: string;
    sourceName: string;
    styleRootName: string;
    styleRootPath: string;
    entries: any[];
    stats: {
        textCount: number;
        topNodeCount: number;
        mode: 'style-root' | 'whole-tree';
    };
}

export function generateTextStyleLibraryFromData(data: FigmaExportData): GeneratedTextStyleLibrary {
    if (!data || !data.root) {
        throw new Error('Invalid Figma JSON: missing root');
    }

    const styleRootHit = findStyleRoot(data.root);
    const styleRoot = styleRootHit ? styleRootHit.node : null;
    const topNodes = styleRoot ? (styleRoot.children || []) : [data.root];
    const rawEntries: any[] = [];
    const topCounter: { [name: string]: number } = {};

    for (const top of topNodes) {
        collectEntries(top, '', topCounter, rawEntries);
    }

    // 对齐 Unity「字体生成」：每种外观签名只保留 1 条模板样例。
    // - style-root 模式：美术已在 Figma 手建 TextStyles Frame（本就去重），figmaPath 保持相对根的层级。
    // - whole-tree 模式：从整棵界面抽取，会有大量重复外观 → 按签名去重，figmaPath 重写为容器内扁平段名。
    const entries = styleRoot
        ? dedupeBySignatureKeepPath(rawEntries)
        : dedupeBySignatureFlatten(rawEntries);

    return {
        name: styleRoot ? sanitizeName(styleRoot.name) || 'TextStyles' : safeLibraryName(data.name || data.root.name || 'TextStyles'),
        sourceName: data.name || data.root.name || '',
        styleRootName: styleRoot ? styleRoot.name || '' : '',
        styleRootPath: styleRootHit ? styleRootHit.path : '',
        entries,
        stats: {
            textCount: entries.length,
            topNodeCount: topNodes.length,
            mode: styleRoot ? 'style-root' : 'whole-tree',
        },
    };
}

/** @zh style-root 模式：按签名去重，保留每签名首条 entry 的相对层级 figmaPath（美术手建的 TextStyles Frame 本就已去重）。 */
function dedupeBySignatureKeepPath(rawEntries: any[]): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const e of rawEntries) {
        const sig = String(e.figmaSignature || '');
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(e);
    }
    return out;
}

/**
 * @zh whole-tree 模式：按签名去重，figmaPath 重写为 TextStyles 容器内的扁平段名（末段 childName，重名加 #序号）。
 *     原始深路径保留到 figmaSourcePath 供追溯。这样生成的模板树是扁平的「每签名一个 Label」，对齐 Unity TextStyles 容器。
 */
function dedupeBySignatureFlatten(rawEntries: any[]): any[] {
    const seen = new Set<string>();
    const nameCount: { [name: string]: number } = {};
    const out: any[] = [];
    for (const e of rawEntries) {
        const sig = String(e.figmaSignature || '');
        if (seen.has(sig)) continue;
        seen.add(sig);
        let baseName = sanitizeName(e.childName || '') || 'Text';
        const occ = nameCount[baseName] || 0;
        nameCount[baseName] = occ + 1;
        const flatSeg = pathSegment(baseName, occ);
        out.push({ ...e, figmaSourcePath: e.figmaPath, figmaPath: flatSeg });
    }
    return out;
}

function collectEntries(
    node: FigmaNodeData,
    parentPath: string,
    siblingNameCount: { [name: string]: number },
    entries: any[]
): void {
    if (!node) return;

    let baseName = sanitizeName(node.name || '');
    if (!baseName) baseName = isTextNode(node) ? 'Text' : 'Node';

    const occ = siblingNameCount[baseName] || 0;
    siblingNameCount[baseName] = occ + 1;
    const figmaPath = parentPath ? `${parentPath}/${pathSegment(baseName, occ)}` : pathSegment(baseName, occ);

    if (isTextStyleNode(node)) {
        entries.push(fillEntry(node, figmaPath, baseName));
    }

    const childCounts: { [name: string]: number } = {};
    for (const child of node.children || []) {
        collectEntries(child, figmaPath, childCounts, entries);
    }
}

function fillEntry(node: FigmaNodeData, figmaPath: string, childName: string): any {
    const stroke = getStroke(node);
    const gradient = getGradient(node);
    const color = getSolidColor(node);
    const effects = getEffects(node);

    return {
        figmaSignature: buildTextSignature(node),
        figmaPath,
        styleName: node.textStyleName || '',
        styleId: node.textStyleId || '',
        childName,

        figmaFontFamily: node.fontFamily || '',
        figmaFontWeight: node.fontWeight || '',
        figmaFontSize: Number(node.fontSize) || 0,
        figmaSampleText: node.characters || '',

        figmaHasStroke: !!stroke,
        figmaStrokeColor: stroke ? stroke.color : rgba255(0, 0, 0, 0),
        figmaStrokeWeight: stroke ? stroke.width : 0,
        figmaStrokeAlign: stroke ? stroke.align : '',
        stroke: stroke ? { color: stroke.color, width: stroke.width, align: stroke.align } : undefined,

        figmaEffects: effects,
        shadow: firstDropShadow(effects),

        figmaHasGradient: !!gradient,
        figmaGradientMode: gradient ? gradient.mode : '',
        figmaGradA: gradient ? gradient.a : rgba255(255, 255, 255, 255),
        figmaGradB: gradient ? gradient.b : rgba255(255, 255, 255, 255),

        figmaColor: color || rgba255(255, 255, 255, 255),
        color: color || undefined,

        figmaFillStyleName: node.fillStyleName || '',
        figmaStrokeStyleName: node.strokeStyleName || '',
        figmaEffectStyleName: node.effectStyleName || '',

        figmaAlignH: node.textAlignHorizontal || '',
        figmaAlignV: node.textAlignVertical || '',
        figmaLineHeight: Number(node.lineHeight) || 0,
        figmaLetterSpacing: Number(node.letterSpacing) || 0,
    };
}

function findStyleRoot(root: FigmaNodeData): { node: FigmaNodeData; path: string } | null {
    const rootKey = styleRootKey(root.name || '');
    if (rootKey === 'textstyles' || rootKey === '文字样式') return { node: root, path: root.name || '' };

    const queue: Array<{ node: FigmaNodeData; path: string; depth: number }> = [];
    for (const child of root.children || []) {
        queue.push({ node: child, path: `${root.name || ''}/${child.name || ''}`, depth: 1 });
    }

    while (queue.length > 0) {
        const item = queue.shift()!;
        const key = styleRootKey(item.node.name || '');
        if (key === 'textstyles') return { node: item.node, path: item.path };
        // Business UI often contains many one-text wrappers named "🟢  文字样式".
        // Treat Chinese "文字样式" as a library root only when it actually groups styles.
        if (key === '文字样式' && (countTextStyleNodes(item.node) >= 2 || (item.node.children || []).length >= 2)) {
            return { node: item.node, path: item.path };
        }
        for (const child of item.node.children || []) {
            queue.push({ node: child, path: `${item.path}/${child.name || ''}`, depth: item.depth + 1 });
        }
    }
    return null;
}

function countTextStyleNodes(node: FigmaNodeData): number {
    let count = isTextStyleNode(node) ? 1 : 0;
    for (const child of node.children || []) count += countTextStyleNodes(child);
    return count;
}

function isTextNode(node: FigmaNodeData): boolean {
    return String(node.type || '').toUpperCase() === 'TEXT';
}

function isTextStyleNode(node: FigmaNodeData): boolean {
    return isTextNode(node) && String(node.fontFamily || '').trim() !== '';
}

function getStroke(node: FigmaNodeData): { color: any; width: number; align: string } | null {
    for (const s of node.strokes || []) {
        if (!s || s.visible === false) continue;
        if (s.type && s.type !== 'SOLID') continue;
        return {
            color: rgbaFromFigma(s, rgba255(0, 0, 0, 255)),
            width: Number(node.strokeWeight) || 0,
            align: node.strokeAlign || '',
        };
    }
    return null;
}

function getEffects(node: FigmaNodeData): any[] {
    const out: any[] = [];
    for (const e of node.effects || []) {
        if (!e || e.visible === false) continue;
        out.push({
            type: e.type || '',
            color: rgbaFromFigma(e, rgba255(0, 0, 0, 255)),
            offsetX: Number(e.offsetX) || 0,
            offsetY: Number(e.offsetY) || 0,
            radius: Number(e.radius) || 0,
            spread: Number(e.spread) || 0,
        });
    }
    return out;
}

function firstDropShadow(effects: any[]): any | undefined {
    const drop = effects.find((e) => String(e.type || '').toUpperCase() === 'DROP_SHADOW');
    if (!drop) return undefined;
    return {
        color: drop.color,
        offsetX: drop.offsetX,
        offsetY: drop.offsetY,
        blur: drop.radius,
    };
}

function getGradient(node: FigmaNodeData): { mode: string; a: any; b: any } | null {
    for (const fill of node.fills || []) {
        if (!fill || fill.visible === false || fill.type !== 'SOLID') continue;
        if (fill.gradientMode && fill.gradientColorA && fill.gradientColorB) {
            return {
                mode: fill.gradientMode || '',
                a: rgbaFromFigma(fill.gradientColorA, rgba255(255, 255, 255, 255)),
                b: rgbaFromFigma(fill.gradientColorB, rgba255(255, 255, 255, 255)),
            };
        }
        return null;
    }
    return null;
}

function getSolidColor(node: FigmaNodeData): any | undefined {
    for (const fill of node.fills || []) {
        if (!fill || fill.visible === false || fill.type !== 'SOLID') continue;
        if (fill.gradientMode && fill.gradientColorA && fill.gradientColorB) return undefined;
        return rgbaFromFigma(fill, rgba255(255, 255, 255, 255));
    }
    return undefined;
}

function rgbaFromFigma(value: any, fallback: any): any {
    if (!value) return fallback;
    const r = finite(value.r, fallback.r / 255);
    const g = finite(value.g, fallback.g / 255);
    const b = finite(value.b, fallback.b / 255);
    const a = finite(value.a, fallback.a / 255);
    const scale = r <= 1 && g <= 1 && b <= 1 && a <= 1 ? 255 : 1;
    return rgba255(r * scale, g * scale, b * scale, a * scale);
}

function rgba255(r: number, g: number, b: number, a: number): any {
    return {
        r: clamp255(r),
        g: clamp255(g),
        b: clamp255(b),
        a: clamp255(a),
    };
}

function finite(value: any, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp255(value: number): number {
    if (!Number.isFinite(value)) return 255;
    return Math.max(0, Math.min(255, Math.round(value)));
}

function sanitizeName(name: string): string {
    return String(name || '').replace(/[\\/]/g, '_').trim();
}

function safeLibraryName(name: string): string {
    return sanitizeName(name) || 'TextStyles';
}

function pathSegment(nodeName: string, occurrence: number): string {
    return occurrence <= 0 ? nodeName : `${nodeName}#${occurrence + 1}`;
}

function styleRootKey(name: string): string {
    return String(name || '')
        .replace(/^[\s🟢🟦🟣🟡🔴⚪⚫✅☑️⭐★☆◆◇■□●○]+/, '')
        .replace(/\s+/g, '')
        .trim()
        .toLowerCase();
}
