import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { FigmaNodeData } from './types';
import { buildTextSignature } from './textstyle';
import { FontLibEntry, matchFont } from './fontlib';
import { requestAssetDb, rethrowIfAssetDbUnavailable } from './assetdb';

export const TEXT_STYLE_LIB_DIR = 'db://assets/art/figma-text-styles';

const FUZZY_MIN_SCORE = 0.55;
const FUZZY_MIN_FAMILY = 0.5;

export type TextStyleMatchTier = 'Exact' | 'Fuzzy';

export interface Rgba255 {
    r: number;
    g: number;
    b: number;
    a: number;
}

export interface TextStyleEffect {
    type: string;
    color: Rgba255;
    offsetX: number;
    offsetY: number;
    radius: number;
    spread: number;
}

export interface TextStyleEntry {
    source: string;
    figmaSignature: string;
    figmaPath: string;
    styleName: string;
    styleId: string;
    childName: string;
    figmaFontFamily: string;
    figmaFontWeight: string;
    figmaEffects: TextStyleEffect[];
    color?: Rgba255;
    stroke?: { color: Rgba255; width: number; align: string };
    shadow?: { color: Rgba255; offsetX: number; offsetY: number; blur: number };
    gradient?: { mode: string; a: Rgba255; b: Rgba255 };
    figmaFillStyleName?: string;
    figmaStrokeStyleName?: string;
    figmaEffectStyleName?: string;
    figmaFontSize?: number;
    figmaSampleText?: string;
    figmaAlignH?: string;
    figmaAlignV?: string;
    figmaLineHeight?: number;
    figmaLetterSpacing?: number;
    font?: { uuid: string; fileName: string; weightMatched: boolean };
    prefabUuid?: string;
}

export interface TextStyleLibrary {
    sources: string[];
    entries: TextStyleEntry[];
}

export interface ResolvedTextStyle {
    tier: TextStyleMatchTier;
    score: number;
    entry: TextStyleEntry;
}

export class TextStyleTemplateTracker {
    private exact = 0;
    private fuzzy = 0;
    private total = 0;
    private missing = 0;

    record(result: ResolvedTextStyle | null, hadLibrary: boolean): void {
        this.total++;
        if (!hadLibrary) return;
        if (!result) {
            this.missing++;
            return;
        }
        if (result.tier === 'Exact') this.exact++;
        else this.fuzzy++;
    }

    report(library: TextStyleLibrary): void {
        if (library.entries.length === 0 || this.total === 0) return;
        console.log(
            `[figma-importer] TextStyles 样式表：${library.entries.length} 条 / ${library.sources.length} 个文件；` +
            `命中 Exact ${this.exact}、Fuzzy ${this.fuzzy}，未命中 ${this.missing}。`
        );
    }
}

export async function scanTextStyleLibrary(fontLib: FontLibEntry[]): Promise<TextStyleLibrary> {
    let assets: any[] = [];
    try {
        const pattern = `${TEXT_STYLE_LIB_DIR}/**/*`;
        assets = await requestAssetDb('query-assets', pattern, [{ pattern }]);
    } catch (err) {
        rethrowIfAssetDbUnavailable(err);
        return { sources: [], entries: [] };
    }
    if (!Array.isArray(assets) || assets.length === 0) return { sources: [], entries: [] };

    // 先建 prefab 名 → uuid 映射：美术手动存的模板 prefab 与 companion JSON 同名（X.json ↔ X.prefab）。
    // 套用时 scene 侧靠 prefabUuid 加载模板、getChildByPath(figmaPath) 定位模板 Label。
    const prefabUuidByBase: { [base: string]: string } = {};
    for (const asset of assets) {
        const url = String(asset && (asset.url || asset.source || asset.name) || '');
        if (!/\.prefab$/i.test(url)) continue;
        const uuid = String(asset && asset.uuid || '');
        if (!uuid) continue;
        const base = url.replace(TEXT_STYLE_LIB_DIR + '/', '').replace(/\.prefab$/i, '');
        prefabUuidByBase[base] = uuid;
    }

    const sources: string[] = [];
    const entries: TextStyleEntry[] = [];
    for (const asset of assets) {
        const url = String(asset && (asset.url || asset.source || asset.name) || '');
        if (!/\.json$/i.test(url)) continue;
        const path = dbUrlToAssetPath(url);
        if (!path || !existsSync(path)) continue;
        try {
            const parsed = JSON.parse(readFileSync(path, 'utf8'));
            const rawEntries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.entries) ? parsed.entries : []);
            const sourceName = url.replace(TEXT_STYLE_LIB_DIR + '/', '');
            const baseName = sourceName.replace(/\.json$/i, '');
            const prefabUuid = prefabUuidByBase[baseName] || '';
            for (const raw of rawEntries) {
                const entry = normalizeEntry(raw, sourceName, fontLib);
                if (entry && entry.figmaSignature) {
                    if (!entry.prefabUuid && prefabUuid) entry.prefabUuid = prefabUuid;
                    entries.push(entry);
                }
            }
            if (rawEntries.length > 0) sources.push(sourceName);
        } catch (err) {
            console.warn(`[figma-importer] 读取 TextStyles 样式表失败：${url}`, err);
        }
    }
    if (entries.length > 0) {
        const withPrefab = entries.filter((e) => e.prefabUuid).length;
        console.log(`[figma-importer] TextStyles 样式库扫描到 ${entries.length} 条样式（${withPrefab} 条已绑定模板 prefab）。`);
    }
    return { sources, entries };
}

export function resolveTextStyleTemplate(node: FigmaNodeData, library: TextStyleLibrary): ResolvedTextStyle | null {
    if (!library || library.entries.length === 0) return null;
    const nodeSignature = buildTextSignature(node);
    const exact = resolveExact(nodeSignature, library.entries);
    if (exact) return { tier: 'Exact', score: 1, entry: exact };

    const fuzzy = resolveFuzzy(node, nodeSignature, library.entries);
    if (fuzzy && fuzzy.score >= FUZZY_MIN_SCORE) return { tier: 'Fuzzy', score: fuzzy.score, entry: fuzzy.entry };
    return null;
}

function normalizeEntry(raw: any, source: string, fontLib: FontLibEntry[]): TextStyleEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const signature = String(raw.figmaSignature || raw.signature || '').trim();
    const fromSig = extractFamilyWeightFromSig(signature);
    const family = String(raw.figmaFontFamily || raw.fontFamily || raw.family || fromSig.family || '').trim();
    const weight = String(raw.figmaFontWeight || raw.fontWeight || raw.weight || fromSig.weight || '').trim();
    const font = matchFont(family, weight, fontLib);
    const effects = normalizeEffects(raw.figmaEffects || raw.effects || []);
    const stroke = normalizeStroke(raw);
    const shadow = normalizeShadow(raw, effects);
    const gradient = normalizeGradient(raw);
    const color = normalizeColor(raw.figmaColor || raw.color);
    return {
        source,
        figmaSignature: signature,
        figmaPath: String(raw.figmaPath || raw.path || ''),
        styleName: String(raw.styleName || raw.textStyleName || ''),
        styleId: String(raw.styleId || raw.textStyleId || ''),
        childName: String(raw.childName || raw.name || ''),
        figmaFontFamily: family,
        figmaFontWeight: weight,
        figmaEffects: effects,
        color,
        stroke,
        shadow,
        gradient,
        figmaFillStyleName: String(raw.figmaFillStyleName || raw.fillStyleName || ''),
        figmaStrokeStyleName: String(raw.figmaStrokeStyleName || raw.strokeStyleName || ''),
        figmaEffectStyleName: String(raw.figmaEffectStyleName || raw.effectStyleName || ''),
        figmaFontSize: Number(raw.figmaFontSize || raw.fontSize) || 0,
        figmaSampleText: String(raw.figmaSampleText || raw.sampleText || raw.characters || ''),
        figmaAlignH: String(raw.figmaAlignH || raw.textAlignHorizontal || ''),
        figmaAlignV: String(raw.figmaAlignV || raw.textAlignVertical || ''),
        figmaLineHeight: Number(raw.figmaLineHeight || raw.lineHeight) || 0,
        figmaLetterSpacing: Number(raw.figmaLetterSpacing || raw.letterSpacing) || 0,
        font: font ? { uuid: font.uuid, fileName: font.fileName, weightMatched: font.weightMatched } : undefined,
        prefabUuid: String(raw.prefabUuid || ''),
    };
}

function resolveExact(signature: string, entries: TextStyleEntry[]): TextStyleEntry | null {
    for (const entry of entries) {
        if (entry.figmaSignature === signature) return entry;
    }
    const stripped = stripWeight(signature);
    for (const entry of entries) {
        if (stripWeight(entry.figmaSignature) === stripped) return entry;
    }
    return null;
}

function resolveFuzzy(node: FigmaNodeData, signature: string, entries: TextStyleEntry[]):
    { entry: TextStyleEntry; score: number } | null {
    const nodeFont = extractFamilyWeightFromSig(signature);
    const nf = normFamily(node.fontFamily || nodeFont.family);
    if (!nf) return null;
    const nw = normalizeWeight(node.fontWeight || nodeFont.weight);
    const nStroke = extractNodeStroke(node);
    const nEffects = extractNodeEffects(node);
    const nGradient = extractNodeGradient(node);
    let best: { entry: TextStyleEntry; score: number } | null = null;
    for (const entry of entries) {
        const ef = normFamily(entry.figmaFontFamily || extractFamilyWeightFromSig(entry.figmaSignature).family);
        const fam = familySimilarity(nf, ef);
        if (fam < FUZZY_MIN_FAMILY) continue;
        const weight = nw === normalizeWeight(entry.figmaFontWeight) ? 1 : 0.4;
        const appearance = (
            strokeSimilarity(nStroke, entry) +
            effectsSimilarity(nEffects, entry.figmaEffects) +
            gradientSimilarity(nGradient, entry)
        ) / 3;
        const score = 0.5 * fam + 0.12 * weight + 0.38 * appearance;
        if (!best || score > best.score) best = { entry, score };
    }
    return best;
}

function normalizeStroke(raw: any): { color: Rgba255; width: number; align: string } | undefined {
    if (raw.stroke && raw.stroke.color) {
        return {
            color: normalizeColor(raw.stroke.color) || { r: 0, g: 0, b: 0, a: 255 },
            width: Number(raw.stroke.width ?? raw.stroke.weight ?? 1) || 1,
            align: String(raw.stroke.align || ''),
        };
    }
    if (raw.figmaHasStroke === true || raw.hasStroke === true) {
        return {
            color: normalizeColor(raw.figmaStrokeColor || raw.strokeColor) || { r: 0, g: 0, b: 0, a: 255 },
            width: Number(raw.figmaStrokeWeight ?? raw.strokeWeight ?? 1) || 1,
            align: String(raw.figmaStrokeAlign || raw.strokeAlign || ''),
        };
    }
    return undefined;
}

function normalizeShadow(raw: any, effects: TextStyleEffect[]):
    { color: Rgba255; offsetX: number; offsetY: number; blur: number } | undefined {
    if (raw.shadow && raw.shadow.color) {
        return {
            color: normalizeColor(raw.shadow.color) || { r: 0, g: 0, b: 0, a: 255 },
            offsetX: Number(raw.shadow.offsetX) || 0,
            offsetY: Number(raw.shadow.offsetY) || 0,
            blur: Number(raw.shadow.blur ?? raw.shadow.radius) || 0,
        };
    }
    const drop = effects.find((e) => e.type.toUpperCase() === 'DROP_SHADOW');
    if (!drop) return undefined;
    return {
        color: drop.color,
        offsetX: drop.offsetX,
        offsetY: drop.offsetY,
        blur: drop.radius,
    };
}

function normalizeGradient(raw: any): { mode: string; a: Rgba255; b: Rgba255 } | undefined {
    if (raw.gradient && raw.gradient.a && raw.gradient.b) {
        return {
            mode: String(raw.gradient.mode || ''),
            a: normalizeColor(raw.gradient.a) || { r: 255, g: 255, b: 255, a: 255 },
            b: normalizeColor(raw.gradient.b) || { r: 255, g: 255, b: 255, a: 255 },
        };
    }
    if (raw.figmaHasGradient === true || raw.hasGradient === true) {
        return {
            mode: String(raw.figmaGradientMode || raw.gradientMode || ''),
            a: normalizeColor(raw.figmaGradA || raw.gradientA) || { r: 255, g: 255, b: 255, a: 255 },
            b: normalizeColor(raw.figmaGradB || raw.gradientB) || { r: 255, g: 255, b: 255, a: 255 },
        };
    }
    return undefined;
}

function normalizeEffects(value: any): TextStyleEffect[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            const color = normalizeColor(item && (item.color || item));
            if (!item || !color) return null;
            return {
                type: String(item.type || ''),
                color,
                offsetX: Number(item.offsetX) || 0,
                offsetY: Number(item.offsetY) || 0,
                radius: Number(item.radius) || 0,
                spread: Number(item.spread) || 0,
            };
        })
        .filter((item): item is TextStyleEffect => !!item);
}

function normalizeColor(value: any): Rgba255 | undefined {
    if (!value) return undefined;
    const r = Number(value.r);
    const g = Number(value.g);
    const b = Number(value.b);
    const a = Number(value.a ?? 1);
    if (![r, g, b, a].every(Number.isFinite)) return undefined;
    const scale = r <= 1 && g <= 1 && b <= 1 && a <= 1 ? 255 : 1;
    return {
        r: clamp255(r * scale),
        g: clamp255(g * scale),
        b: clamp255(b * scale),
        a: clamp255(a * scale),
    };
}

function extractNodeStroke(node: FigmaNodeData): { color: Rgba255; width: number; align: string } | null {
    for (const s of node.strokes || []) {
        if (!s || s.visible === false) continue;
        if (s.type && s.type !== 'SOLID') continue;
        return {
            color: normalizeColor(s) || { r: 0, g: 0, b: 0, a: 255 },
            width: Number(node.strokeWeight) || 0,
            align: String(node.strokeAlign || ''),
        };
    }
    return null;
}

function extractNodeEffects(node: FigmaNodeData): TextStyleEffect[] {
    return normalizeEffects(node.effects || []);
}

function extractNodeGradient(node: FigmaNodeData): { mode: string; a: Rgba255; b: Rgba255 } | null {
    for (const fill of node.fills || []) {
        if (!fill || fill.visible === false || fill.type !== 'SOLID') continue;
        if (fill.gradientMode && fill.gradientColorA && fill.gradientColorB) {
            return {
                mode: String(fill.gradientMode || ''),
                a: normalizeColor(fill.gradientColorA) || { r: 255, g: 255, b: 255, a: 255 },
                b: normalizeColor(fill.gradientColorB) || { r: 255, g: 255, b: 255, a: 255 },
            };
        }
        return null;
    }
    return null;
}

function strokeSimilarity(
    nodeStroke: { color: Rgba255; width: number; align: string } | null,
    entry: TextStyleEntry
): number {
    if (!nodeStroke && !entry.stroke) return 1;
    if (!nodeStroke || !entry.stroke) return 0;
    const color = colorSimilarity(nodeStroke.color, entry.stroke.color);
    const width = numberSimilarity(nodeStroke.width, entry.stroke.width, 4);
    const align = norm(nodeStroke.align) === norm(entry.stroke.align) ? 1 : 0.7;
    return 0.6 * color + 0.3 * width + 0.1 * align;
}

function effectsSimilarity(a: TextStyleEffect[], b: TextStyleEffect[]): number {
    const ca = a ? a.length : 0;
    const cb = b ? b.length : 0;
    if (ca === 0 && cb === 0) return 1;
    if (ca !== cb) return 0.15;
    let sum = 0;
    for (let i = 0; i < ca; i++) {
        const x = a[i];
        const y = b[i];
        const type = norm(x.type) === norm(y.type) ? 1 : 0;
        const color = colorSimilarity(x.color, y.color);
        const offset = (
            numberSimilarity(x.offsetX, y.offsetX, 8) +
            numberSimilarity(x.offsetY, y.offsetY, 8)
        ) / 2;
        const radius = numberSimilarity(x.radius, y.radius, 16);
        sum += 0.3 * type + 0.3 * color + 0.25 * offset + 0.15 * radius;
    }
    return sum / ca;
}

function gradientSimilarity(
    nodeGradient: { mode: string; a: Rgba255; b: Rgba255 } | null,
    entry: TextStyleEntry
): number {
    if (!nodeGradient && !entry.gradient) return 1;
    if (!nodeGradient || !entry.gradient) return 0;
    const mode = norm(nodeGradient.mode) === norm(entry.gradient.mode) ? 1 : 0.6;
    return 0.4 * mode + 0.3 * colorSimilarity(nodeGradient.a, entry.gradient.a) + 0.3 * colorSimilarity(nodeGradient.b, entry.gradient.b);
}

function colorSimilarity(a: Rgba255, b: Rgba255): number {
    const dr = (a.r - b.r) / 255;
    const dg = (a.g - b.g) / 255;
    const db = (a.b - b.b) / 255;
    const da = (a.a - b.a) / 255;
    const dist = Math.sqrt((dr * dr + dg * dg + db * db + da * da) / 4);
    return Math.max(0, Math.min(1, 1 - dist));
}

function numberSimilarity(a: number, b: number, scale: number): number {
    return Math.max(0, Math.min(1, 1 - Math.abs((Number(a) || 0) - (Number(b) || 0)) / Math.max(scale, 0.0001)));
}

function splitSignature(signature: string): { [key: string]: string } {
    const out: { [key: string]: string } = {};
    for (const token of String(signature || '').split(' ')) {
        const idx = token.indexOf(':');
        if (idx <= 0) continue;
        out[token.slice(0, idx)] = token;
    }
    return out;
}

function extractFamilyWeightFromSig(signature: string): { family: string; weight: string } {
    const f = splitSignature(signature).F || '';
    const colon = f.indexOf(':');
    const bar = f.indexOf('|');
    if (colon < 0) return { family: '', weight: '' };
    return {
        family: bar >= 0 ? f.slice(colon + 1, bar) : f.slice(colon + 1),
        weight: bar >= 0 ? f.slice(bar + 1) : '',
    };
}

function stripWeight(signature: string): string {
    const bar = signature.indexOf('|');
    const k = bar >= 0 ? signature.indexOf(' K:', bar) : -1;
    if (bar < 0 || k < 0) return signature;
    return signature.slice(0, bar + 1) + signature.slice(k);
}

function normalizeWeight(value: string | undefined): string {
    return value == null || String(value).trim() === '' ? '' : String(value).trim().replace(/ /g, '').toLowerCase();
}

function norm(value: string): string {
    return value.trim().toLowerCase();
}

function normFamily(value: string | undefined): string {
    if (!value) return '';
    let out = '';
    for (const ch of value.trim().toLowerCase()) {
        if (/[a-z0-9一-鿿]/.test(ch)) out += ch;
    }
    return out;
}

function familySimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.85;
    const max = Math.max(a.length, b.length);
    return max === 0 ? 0 : Math.max(0, Math.min(1, 1 - levenshtein(a, b) / max));
}

function levenshtein(a: string, b: string): number {
    const n = a.length;
    const m = b.length;
    if (n === 0) return m;
    if (m === 0) return n;
    let prev = new Array<number>(m + 1);
    let cur = new Array<number>(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
        cur[0] = i;
        for (let j = 1; j <= m; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, cur] = [cur, prev];
    }
    return prev[m];
}

function clamp255(value: number): number {
    if (!Number.isFinite(value)) return 255;
    return Math.max(0, Math.min(255, Math.round(value)));
}

function dbUrlToAssetPath(dbUrl: string): string | null {
    if (!dbUrl.startsWith('db://assets/')) return null;
    const projectPath = (Editor as any).Project && (Editor as any).Project.path;
    if (!projectPath) return null;
    return join(projectPath, 'assets', dbUrl.slice('db://assets/'.length));
}
