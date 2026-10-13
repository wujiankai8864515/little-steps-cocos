"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextStyleTemplateTracker = exports.TEXT_STYLE_LIB_DIR = void 0;
exports.scanTextStyleLibrary = scanTextStyleLibrary;
exports.resolveTextStyleTemplate = resolveTextStyleTemplate;
const fs_1 = require("fs");
const path_1 = require("path");
const textstyle_1 = require("./textstyle");
const fontlib_1 = require("./fontlib");
const assetdb_1 = require("./assetdb");
exports.TEXT_STYLE_LIB_DIR = 'db://assets/art/figma-text-styles';
const FUZZY_MIN_SCORE = 0.55;
const FUZZY_MIN_FAMILY = 0.5;
class TextStyleTemplateTracker {
    constructor() {
        this.exact = 0;
        this.fuzzy = 0;
        this.total = 0;
        this.missing = 0;
    }
    record(result, hadLibrary) {
        this.total++;
        if (!hadLibrary)
            return;
        if (!result) {
            this.missing++;
            return;
        }
        if (result.tier === 'Exact')
            this.exact++;
        else
            this.fuzzy++;
    }
    report(library) {
        if (library.entries.length === 0 || this.total === 0)
            return;
        console.log(`[figma-importer] TextStyles 样式表：${library.entries.length} 条 / ${library.sources.length} 个文件；` +
            `命中 Exact ${this.exact}、Fuzzy ${this.fuzzy}，未命中 ${this.missing}。`);
    }
}
exports.TextStyleTemplateTracker = TextStyleTemplateTracker;
async function scanTextStyleLibrary(fontLib) {
    let assets = [];
    try {
        const pattern = `${exports.TEXT_STYLE_LIB_DIR}/**/*`;
        assets = await (0, assetdb_1.requestAssetDb)('query-assets', pattern, [{ pattern }]);
    }
    catch (err) {
        (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
        return { sources: [], entries: [] };
    }
    if (!Array.isArray(assets) || assets.length === 0)
        return { sources: [], entries: [] };
    // 先建 prefab 名 → uuid 映射：美术手动存的模板 prefab 与 companion JSON 同名（X.json ↔ X.prefab）。
    // 套用时 scene 侧靠 prefabUuid 加载模板、getChildByPath(figmaPath) 定位模板 Label。
    const prefabUuidByBase = {};
    for (const asset of assets) {
        const url = String(asset && (asset.url || asset.source || asset.name) || '');
        if (!/\.prefab$/i.test(url))
            continue;
        const uuid = String(asset && asset.uuid || '');
        if (!uuid)
            continue;
        const base = url.replace(exports.TEXT_STYLE_LIB_DIR + '/', '').replace(/\.prefab$/i, '');
        prefabUuidByBase[base] = uuid;
    }
    const sources = [];
    const entries = [];
    for (const asset of assets) {
        const url = String(asset && (asset.url || asset.source || asset.name) || '');
        if (!/\.json$/i.test(url))
            continue;
        const path = dbUrlToAssetPath(url);
        if (!path || !(0, fs_1.existsSync)(path))
            continue;
        try {
            const parsed = JSON.parse((0, fs_1.readFileSync)(path, 'utf8'));
            const rawEntries = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.entries) ? parsed.entries : []);
            const sourceName = url.replace(exports.TEXT_STYLE_LIB_DIR + '/', '');
            const baseName = sourceName.replace(/\.json$/i, '');
            const prefabUuid = prefabUuidByBase[baseName] || '';
            for (const raw of rawEntries) {
                const entry = normalizeEntry(raw, sourceName, fontLib);
                if (entry && entry.figmaSignature) {
                    if (!entry.prefabUuid && prefabUuid)
                        entry.prefabUuid = prefabUuid;
                    entries.push(entry);
                }
            }
            if (rawEntries.length > 0)
                sources.push(sourceName);
        }
        catch (err) {
            console.warn(`[figma-importer] 读取 TextStyles 样式表失败：${url}`, err);
        }
    }
    if (entries.length > 0) {
        const withPrefab = entries.filter((e) => e.prefabUuid).length;
        console.log(`[figma-importer] TextStyles 样式库扫描到 ${entries.length} 条样式（${withPrefab} 条已绑定模板 prefab）。`);
    }
    return { sources, entries };
}
function resolveTextStyleTemplate(node, library) {
    if (!library || library.entries.length === 0)
        return null;
    const nodeSignature = (0, textstyle_1.buildTextSignature)(node);
    const exact = resolveExact(nodeSignature, library.entries);
    if (exact)
        return { tier: 'Exact', score: 1, entry: exact };
    const fuzzy = resolveFuzzy(node, nodeSignature, library.entries);
    if (fuzzy && fuzzy.score >= FUZZY_MIN_SCORE)
        return { tier: 'Fuzzy', score: fuzzy.score, entry: fuzzy.entry };
    return null;
}
function normalizeEntry(raw, source, fontLib) {
    if (!raw || typeof raw !== 'object')
        return null;
    const signature = String(raw.figmaSignature || raw.signature || '').trim();
    const fromSig = extractFamilyWeightFromSig(signature);
    const family = String(raw.figmaFontFamily || raw.fontFamily || raw.family || fromSig.family || '').trim();
    const weight = String(raw.figmaFontWeight || raw.fontWeight || raw.weight || fromSig.weight || '').trim();
    const font = (0, fontlib_1.matchFont)(family, weight, fontLib);
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
function resolveExact(signature, entries) {
    for (const entry of entries) {
        if (entry.figmaSignature === signature)
            return entry;
    }
    const stripped = stripWeight(signature);
    for (const entry of entries) {
        if (stripWeight(entry.figmaSignature) === stripped)
            return entry;
    }
    return null;
}
function resolveFuzzy(node, signature, entries) {
    const nodeFont = extractFamilyWeightFromSig(signature);
    const nf = normFamily(node.fontFamily || nodeFont.family);
    if (!nf)
        return null;
    const nw = normalizeWeight(node.fontWeight || nodeFont.weight);
    const nStroke = extractNodeStroke(node);
    const nEffects = extractNodeEffects(node);
    const nGradient = extractNodeGradient(node);
    let best = null;
    for (const entry of entries) {
        const ef = normFamily(entry.figmaFontFamily || extractFamilyWeightFromSig(entry.figmaSignature).family);
        const fam = familySimilarity(nf, ef);
        if (fam < FUZZY_MIN_FAMILY)
            continue;
        const weight = nw === normalizeWeight(entry.figmaFontWeight) ? 1 : 0.4;
        const appearance = (strokeSimilarity(nStroke, entry) +
            effectsSimilarity(nEffects, entry.figmaEffects) +
            gradientSimilarity(nGradient, entry)) / 3;
        const score = 0.5 * fam + 0.12 * weight + 0.38 * appearance;
        if (!best || score > best.score)
            best = { entry, score };
    }
    return best;
}
function normalizeStroke(raw) {
    var _a, _b, _c, _d;
    if (raw.stroke && raw.stroke.color) {
        return {
            color: normalizeColor(raw.stroke.color) || { r: 0, g: 0, b: 0, a: 255 },
            width: Number((_b = (_a = raw.stroke.width) !== null && _a !== void 0 ? _a : raw.stroke.weight) !== null && _b !== void 0 ? _b : 1) || 1,
            align: String(raw.stroke.align || ''),
        };
    }
    if (raw.figmaHasStroke === true || raw.hasStroke === true) {
        return {
            color: normalizeColor(raw.figmaStrokeColor || raw.strokeColor) || { r: 0, g: 0, b: 0, a: 255 },
            width: Number((_d = (_c = raw.figmaStrokeWeight) !== null && _c !== void 0 ? _c : raw.strokeWeight) !== null && _d !== void 0 ? _d : 1) || 1,
            align: String(raw.figmaStrokeAlign || raw.strokeAlign || ''),
        };
    }
    return undefined;
}
function normalizeShadow(raw, effects) {
    var _a;
    if (raw.shadow && raw.shadow.color) {
        return {
            color: normalizeColor(raw.shadow.color) || { r: 0, g: 0, b: 0, a: 255 },
            offsetX: Number(raw.shadow.offsetX) || 0,
            offsetY: Number(raw.shadow.offsetY) || 0,
            blur: Number((_a = raw.shadow.blur) !== null && _a !== void 0 ? _a : raw.shadow.radius) || 0,
        };
    }
    const drop = effects.find((e) => e.type.toUpperCase() === 'DROP_SHADOW');
    if (!drop)
        return undefined;
    return {
        color: drop.color,
        offsetX: drop.offsetX,
        offsetY: drop.offsetY,
        blur: drop.radius,
    };
}
function normalizeGradient(raw) {
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
function normalizeEffects(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
        const color = normalizeColor(item && (item.color || item));
        if (!item || !color)
            return null;
        return {
            type: String(item.type || ''),
            color,
            offsetX: Number(item.offsetX) || 0,
            offsetY: Number(item.offsetY) || 0,
            radius: Number(item.radius) || 0,
            spread: Number(item.spread) || 0,
        };
    })
        .filter((item) => !!item);
}
function normalizeColor(value) {
    var _a;
    if (!value)
        return undefined;
    const r = Number(value.r);
    const g = Number(value.g);
    const b = Number(value.b);
    const a = Number((_a = value.a) !== null && _a !== void 0 ? _a : 1);
    if (![r, g, b, a].every(Number.isFinite))
        return undefined;
    const scale = r <= 1 && g <= 1 && b <= 1 && a <= 1 ? 255 : 1;
    return {
        r: clamp255(r * scale),
        g: clamp255(g * scale),
        b: clamp255(b * scale),
        a: clamp255(a * scale),
    };
}
function extractNodeStroke(node) {
    for (const s of node.strokes || []) {
        if (!s || s.visible === false)
            continue;
        if (s.type && s.type !== 'SOLID')
            continue;
        return {
            color: normalizeColor(s) || { r: 0, g: 0, b: 0, a: 255 },
            width: Number(node.strokeWeight) || 0,
            align: String(node.strokeAlign || ''),
        };
    }
    return null;
}
function extractNodeEffects(node) {
    return normalizeEffects(node.effects || []);
}
function extractNodeGradient(node) {
    for (const fill of node.fills || []) {
        if (!fill || fill.visible === false || fill.type !== 'SOLID')
            continue;
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
function strokeSimilarity(nodeStroke, entry) {
    if (!nodeStroke && !entry.stroke)
        return 1;
    if (!nodeStroke || !entry.stroke)
        return 0;
    const color = colorSimilarity(nodeStroke.color, entry.stroke.color);
    const width = numberSimilarity(nodeStroke.width, entry.stroke.width, 4);
    const align = norm(nodeStroke.align) === norm(entry.stroke.align) ? 1 : 0.7;
    return 0.6 * color + 0.3 * width + 0.1 * align;
}
function effectsSimilarity(a, b) {
    const ca = a ? a.length : 0;
    const cb = b ? b.length : 0;
    if (ca === 0 && cb === 0)
        return 1;
    if (ca !== cb)
        return 0.15;
    let sum = 0;
    for (let i = 0; i < ca; i++) {
        const x = a[i];
        const y = b[i];
        const type = norm(x.type) === norm(y.type) ? 1 : 0;
        const color = colorSimilarity(x.color, y.color);
        const offset = (numberSimilarity(x.offsetX, y.offsetX, 8) +
            numberSimilarity(x.offsetY, y.offsetY, 8)) / 2;
        const radius = numberSimilarity(x.radius, y.radius, 16);
        sum += 0.3 * type + 0.3 * color + 0.25 * offset + 0.15 * radius;
    }
    return sum / ca;
}
function gradientSimilarity(nodeGradient, entry) {
    if (!nodeGradient && !entry.gradient)
        return 1;
    if (!nodeGradient || !entry.gradient)
        return 0;
    const mode = norm(nodeGradient.mode) === norm(entry.gradient.mode) ? 1 : 0.6;
    return 0.4 * mode + 0.3 * colorSimilarity(nodeGradient.a, entry.gradient.a) + 0.3 * colorSimilarity(nodeGradient.b, entry.gradient.b);
}
function colorSimilarity(a, b) {
    const dr = (a.r - b.r) / 255;
    const dg = (a.g - b.g) / 255;
    const db = (a.b - b.b) / 255;
    const da = (a.a - b.a) / 255;
    const dist = Math.sqrt((dr * dr + dg * dg + db * db + da * da) / 4);
    return Math.max(0, Math.min(1, 1 - dist));
}
function numberSimilarity(a, b, scale) {
    return Math.max(0, Math.min(1, 1 - Math.abs((Number(a) || 0) - (Number(b) || 0)) / Math.max(scale, 0.0001)));
}
function splitSignature(signature) {
    const out = {};
    for (const token of String(signature || '').split(' ')) {
        const idx = token.indexOf(':');
        if (idx <= 0)
            continue;
        out[token.slice(0, idx)] = token;
    }
    return out;
}
function extractFamilyWeightFromSig(signature) {
    const f = splitSignature(signature).F || '';
    const colon = f.indexOf(':');
    const bar = f.indexOf('|');
    if (colon < 0)
        return { family: '', weight: '' };
    return {
        family: bar >= 0 ? f.slice(colon + 1, bar) : f.slice(colon + 1),
        weight: bar >= 0 ? f.slice(bar + 1) : '',
    };
}
function stripWeight(signature) {
    const bar = signature.indexOf('|');
    const k = bar >= 0 ? signature.indexOf(' K:', bar) : -1;
    if (bar < 0 || k < 0)
        return signature;
    return signature.slice(0, bar + 1) + signature.slice(k);
}
function normalizeWeight(value) {
    return value == null || String(value).trim() === '' ? '' : String(value).trim().replace(/ /g, '').toLowerCase();
}
function norm(value) {
    return value.trim().toLowerCase();
}
function normFamily(value) {
    if (!value)
        return '';
    let out = '';
    for (const ch of value.trim().toLowerCase()) {
        if (/[a-z0-9一-鿿]/.test(ch))
            out += ch;
    }
    return out;
}
function familySimilarity(a, b) {
    if (!a || !b)
        return 0;
    if (a === b)
        return 1;
    if (a.includes(b) || b.includes(a))
        return 0.85;
    const max = Math.max(a.length, b.length);
    return max === 0 ? 0 : Math.max(0, Math.min(1, 1 - levenshtein(a, b) / max));
}
function levenshtein(a, b) {
    const n = a.length;
    const m = b.length;
    if (n === 0)
        return m;
    if (m === 0)
        return n;
    let prev = new Array(m + 1);
    let cur = new Array(m + 1);
    for (let j = 0; j <= m; j++)
        prev[j] = j;
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
function clamp255(value) {
    if (!Number.isFinite(value))
        return 255;
    return Math.max(0, Math.min(255, Math.round(value)));
}
function dbUrlToAssetPath(dbUrl) {
    if (!dbUrl.startsWith('db://assets/'))
        return null;
    const projectPath = Editor.Project && Editor.Project.path;
    if (!projectPath)
        return null;
    return (0, path_1.join)(projectPath, 'assets', dbUrl.slice('db://assets/'.length));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dHN0eWxlbGliLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc291cmNlL3RleHRzdHlsZWxpYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUE4RkEsb0RBcURDO0FBRUQsNERBU0M7QUE5SkQsMkJBQThDO0FBQzlDLCtCQUE0QjtBQUU1QiwyQ0FBaUQ7QUFDakQsdUNBQW9EO0FBQ3BELHVDQUF3RTtBQUUzRCxRQUFBLGtCQUFrQixHQUFHLCtCQUErQixDQUFDO0FBRWxFLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQztBQUM3QixNQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQztBQTBEN0IsTUFBYSx3QkFBd0I7SUFBckM7UUFDWSxVQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ1YsVUFBSyxHQUFHLENBQUMsQ0FBQztRQUNWLFVBQUssR0FBRyxDQUFDLENBQUM7UUFDVixZQUFPLEdBQUcsQ0FBQyxDQUFDO0lBb0J4QixDQUFDO0lBbEJHLE1BQU0sQ0FBQyxNQUFnQyxFQUFFLFVBQW1CO1FBQ3hELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVO1lBQUUsT0FBTztRQUN4QixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDVixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDZixPQUFPO1FBQ1gsQ0FBQztRQUNELElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxPQUFPO1lBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDOztZQUNyQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdEIsQ0FBQztJQUVELE1BQU0sQ0FBQyxPQUF5QjtRQUM1QixJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLENBQUM7WUFBRSxPQUFPO1FBQzdELE9BQU8sQ0FBQyxHQUFHLENBQ1AsbUNBQW1DLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxRQUFRLE9B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QUFjLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUNuRCxNQUFNLFdBQVcsR0FBSSxNQUFjLENBQUMsT0FBTyxJQUFLLE1BQWMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO0lBQzVFLElBQUksQ0FBQyxXQUFXO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDOUIsT0FBTyxJQUFBLFdBQUksRUFBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDM0UsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4aXN0c1N5bmMsIHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbmltcG9ydCB7IEZpZ21hTm9kZURhdGEgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7IGJ1aWxkVGV4dFNpZ25hdHVyZSB9IGZyb20gJy4vdGV4dHN0eWxlJztcbmltcG9ydCB7IEZvbnRMaWJFbnRyeSwgbWF0Y2hGb250IH0gZnJvbSAnLi9mb250bGliJztcbmltcG9ydCB7IHJlcXVlc3RBc3NldERiLCByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUgfSBmcm9tICcuL2Fzc2V0ZGInO1xuXG5leHBvcnQgY29uc3QgVEVYVF9TVFlMRV9MSUJfRElSID0gJ2RiOi8vYXNzZXRzL2ZpZ21hLXRleHQtc3R5bGVzJztcblxuY29uc3QgRlVaWllfTUlOX1NDT1JFID0gMC41NTtcbmNvbnN0IEZVWlpZX01JTl9GQU1JTFkgPSAwLjU7XG5cbmV4cG9ydCB0eXBlIFRleHRTdHlsZU1hdGNoVGllciA9ICdFeGFjdCcgfCAnRnV6enknO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJnYmEyNTUge1xuICAgIHI6IG51bWJlcjtcbiAgICBnOiBudW1iZXI7XG4gICAgYjogbnVtYmVyO1xuICAgIGE6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXh0U3R5bGVFZmZlY3Qge1xuICAgIHR5cGU6IHN0cmluZztcbiAgICBjb2xvcjogUmdiYTI1NTtcbiAgICBvZmZzZXRYOiBudW1iZXI7XG4gICAgb2Zmc2V0WTogbnVtYmVyO1xuICAgIHJhZGl1czogbnVtYmVyO1xuICAgIHNwcmVhZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRleHRTdHlsZUVudHJ5IHtcbiAgICBzb3VyY2U6IHN0cmluZztcbiAgICBmaWdtYVNpZ25hdHVyZTogc3RyaW5nO1xuICAgIGZpZ21hUGF0aDogc3RyaW5nO1xuICAgIHN0eWxlTmFtZTogc3RyaW5nO1xuICAgIHN0eWxlSWQ6IHN0cmluZztcbiAgICBjaGlsZE5hbWU6IHN0cmluZztcbiAgICBmaWdtYUZvbnRGYW1pbHk6IHN0cmluZztcbiAgICBmaWdtYUZvbnRXZWlnaHQ6IHN0cmluZztcbiAgICBmaWdtYUVmZmVjdHM6IFRleHRTdHlsZUVmZmVjdFtdO1xuICAgIGNvbG9yPzogUmdiYTI1NTtcbiAgICBzdHJva2U/OiB7IGNvbG9yOiBSZ2JhMjU1OyB3aWR0aDogbnVtYmVyOyBhbGlnbjogc3RyaW5nIH07XG4gICAgc2hhZG93PzogeyBjb2xvcjogUmdiYTI1NTsgb2Zmc2V0WDogbnVtYmVyOyBvZmZzZXRZOiBudW1iZXI7IGJsdXI6IG51bWJlciB9O1xuICAgIGdyYWRpZW50PzogeyBtb2RlOiBzdHJpbmc7IGE6IFJnYmEyNTU7IGI6IFJnYmEyNTUgfTtcbiAgICBmaWdtYUZpbGxTdHlsZU5hbWU/OiBzdHJpbmc7XG4gICAgZmlnbWFTdHJva2VTdHlsZU5hbWU/OiBzdHJpbmc7XG4gICAgZmlnbWFFZmZlY3RTdHlsZU5hbWU/OiBzdHJpbmc7XG4gICAgZmlnbWFGb250U2l6ZT86IG51bWJlcjtcbiAgICBmaWdtYVNhbXBsZVRleHQ/OiBzdHJpbmc7XG4gICAgZmlnbWFBbGlnbkg/OiBzdHJpbmc7XG4gICAgZmlnbWFBbGlnblY/OiBzdHJpbmc7XG4gICAgZmlnbWFMaW5lSGVpZ2h0PzogbnVtYmVyO1xuICAgIGZpZ21hTGV0dGVyU3BhY2luZz86IG51bWJlcjtcbiAgICBmb250PzogeyB1dWlkOiBzdHJpbmc7IGZpbGVOYW1lOiBzdHJpbmc7IHdlaWdodE1hdGNoZWQ6IGJvb2xlYW4gfTtcbiAgICBwcmVmYWJVdWlkPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRleHRTdHlsZUxpYnJhcnkge1xuICAgIHNvdXJjZXM6IHN0cmluZ1tdO1xuICAgIGVudHJpZXM6IFRleHRTdHlsZUVudHJ5W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVzb2x2ZWRUZXh0U3R5bGUge1xuICAgIHRpZXI6IFRleHRTdHlsZU1hdGNoVGllcjtcbiAgICBzY29yZTogbnVtYmVyO1xuICAgIGVudHJ5OiBUZXh0U3R5bGVFbnRyeTtcbn1cblxuZXhwb3J0IGNsYXNzIFRleHRTdHlsZVRlbXBsYXRlVHJhY2tlciB7XG4gICAgcHJpdmF0ZSBleGFjdCA9IDA7XG4gICAgcHJpdmF0ZSBmdXp6eSA9IDA7XG4gICAgcHJpdmF0ZSB0b3RhbCA9IDA7XG4gICAgcHJpdmF0ZSBtaXNzaW5nID0gMDtcblxuICAgIHJlY29yZChyZXN1bHQ6IFJlc29sdmVkVGV4dFN0eWxlIHwgbnVsbCwgaGFkTGlicmFyeTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnRvdGFsKys7XG4gICAgICAgIGlmICghaGFkTGlicmFyeSkgcmV0dXJuO1xuICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgdGhpcy5taXNzaW5nKys7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC50aWVyID09PSAnRXhhY3QnKSB0aGlzLmV4YWN0Kys7XG4gICAgICAgIGVsc2UgdGhpcy5mdXp6eSsrO1xuICAgIH1cblxuICAgIHJlcG9ydChsaWJyYXJ5OiBUZXh0U3R5bGVMaWJyYXJ5KTogdm9pZCB7XG4gICAgICAgIGlmIChsaWJyYXJ5LmVudHJpZXMubGVuZ3RoID09PSAwIHx8IHRoaXMudG90YWwgPT09IDApIHJldHVybjtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSBUZXh0U3R5bGVzIOagt+W8j+ihqO+8miR7bGlicmFyeS5lbnRyaWVzLmxlbmd0aH0g5p2hIC8gJHtsaWJyYXJ5LnNvdXJjZXMubGVuZ3RofSDkuKrmlofku7bvvJtgICtcbiAgICAgICAgICAgIGDlkb3kuK0gRXhhY3QgJHt0aGlzLmV4YWN0feOAgUZ1enp5ICR7dGhpcy5mdXp6eX3vvIzmnKrlkb3kuK0gJHt0aGlzLm1pc3Npbmd944CCYFxuICAgICAgICApO1xuICAgIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNjYW5UZXh0U3R5bGVMaWJyYXJ5KGZvbnRMaWI6IEZvbnRMaWJFbnRyeVtdKTogUHJvbWlzZTxUZXh0U3R5bGVMaWJyYXJ5PiB7XG4gICAgbGV0IGFzc2V0czogYW55W10gPSBbXTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwYXR0ZXJuID0gYCR7VEVYVF9TVFlMRV9MSUJfRElSfS8qKi8qYDtcbiAgICAgICAgYXNzZXRzID0gYXdhaXQgcmVxdWVzdEFzc2V0RGIoJ3F1ZXJ5LWFzc2V0cycsIHBhdHRlcm4sIFt7IHBhdHRlcm4gfV0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUoZXJyKTtcbiAgICAgICAgcmV0dXJuIHsgc291cmNlczogW10sIGVudHJpZXM6IFtdIH07XG4gICAgfVxuICAgIGlmICghQXJyYXkuaXNBcnJheShhc3NldHMpIHx8IGFzc2V0cy5sZW5ndGggPT09IDApIHJldHVybiB7IHNvdXJjZXM6IFtdLCBlbnRyaWVzOiBbXSB9O1xuXG4gICAgLy8g5YWI5bu6IHByZWZhYiDlkI0g4oaSIHV1aWQg5pig5bCE77ya576O5pyv5omL5Yqo5a2Y55qE5qih5p2/IHByZWZhYiDkuI4gY29tcGFuaW9uIEpTT04g5ZCM5ZCN77yIWC5qc29uIOKGlCBYLnByZWZhYu+8ieOAglxuICAgIC8vIOWll+eUqOaXtiBzY2VuZSDkvqfpnaAgcHJlZmFiVXVpZCDliqDovb3mqKHmnb/jgIFnZXRDaGlsZEJ5UGF0aChmaWdtYVBhdGgpIOWumuS9jeaooeadvyBMYWJlbOOAglxuICAgIGNvbnN0IHByZWZhYlV1aWRCeUJhc2U6IHsgW2Jhc2U6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgZm9yIChjb25zdCBhc3NldCBvZiBhc3NldHMpIHtcbiAgICAgICAgY29uc3QgdXJsID0gU3RyaW5nKGFzc2V0ICYmIChhc3NldC51cmwgfHwgYXNzZXQuc291cmNlIHx8IGFzc2V0Lm5hbWUpIHx8ICcnKTtcbiAgICAgICAgaWYgKCEvXFwucHJlZmFiJC9pLnRlc3QodXJsKSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHV1aWQgPSBTdHJpbmcoYXNzZXQgJiYgYXNzZXQudXVpZCB8fCAnJyk7XG4gICAgICAgIGlmICghdXVpZCkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGJhc2UgPSB1cmwucmVwbGFjZShURVhUX1NUWUxFX0xJQl9ESVIgKyAnLycsICcnKS5yZXBsYWNlKC9cXC5wcmVmYWIkL2ksICcnKTtcbiAgICAgICAgcHJlZmFiVXVpZEJ5QmFzZVtiYXNlXSA9IHV1aWQ7XG4gICAgfVxuXG4gICAgY29uc3Qgc291cmNlczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBlbnRyaWVzOiBUZXh0U3R5bGVFbnRyeVtdID0gW107XG4gICAgZm9yIChjb25zdCBhc3NldCBvZiBhc3NldHMpIHtcbiAgICAgICAgY29uc3QgdXJsID0gU3RyaW5nKGFzc2V0ICYmIChhc3NldC51cmwgfHwgYXNzZXQuc291cmNlIHx8IGFzc2V0Lm5hbWUpIHx8ICcnKTtcbiAgICAgICAgaWYgKCEvXFwuanNvbiQvaS50ZXN0KHVybCkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBwYXRoID0gZGJVcmxUb0Fzc2V0UGF0aCh1cmwpO1xuICAgICAgICBpZiAoIXBhdGggfHwgIWV4aXN0c1N5bmMocGF0aCkpIGNvbnRpbnVlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMocGF0aCwgJ3V0ZjgnKSk7XG4gICAgICAgICAgICBjb25zdCByYXdFbnRyaWVzID0gQXJyYXkuaXNBcnJheShwYXJzZWQpID8gcGFyc2VkIDogKEFycmF5LmlzQXJyYXkocGFyc2VkLmVudHJpZXMpID8gcGFyc2VkLmVudHJpZXMgOiBbXSk7XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VOYW1lID0gdXJsLnJlcGxhY2UoVEVYVF9TVFlMRV9MSUJfRElSICsgJy8nLCAnJyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlTmFtZSA9IHNvdXJjZU5hbWUucmVwbGFjZSgvXFwuanNvbiQvaSwgJycpO1xuICAgICAgICAgICAgY29uc3QgcHJlZmFiVXVpZCA9IHByZWZhYlV1aWRCeUJhc2VbYmFzZU5hbWVdIHx8ICcnO1xuICAgICAgICAgICAgZm9yIChjb25zdCByYXcgb2YgcmF3RW50cmllcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gbm9ybWFsaXplRW50cnkocmF3LCBzb3VyY2VOYW1lLCBmb250TGliKTtcbiAgICAgICAgICAgICAgICBpZiAoZW50cnkgJiYgZW50cnkuZmlnbWFTaWduYXR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFlbnRyeS5wcmVmYWJVdWlkICYmIHByZWZhYlV1aWQpIGVudHJ5LnByZWZhYlV1aWQgPSBwcmVmYWJVdWlkO1xuICAgICAgICAgICAgICAgICAgICBlbnRyaWVzLnB1c2goZW50cnkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyYXdFbnRyaWVzLmxlbmd0aCA+IDApIHNvdXJjZXMucHVzaChzb3VyY2VOYW1lKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtmaWdtYS1pbXBvcnRlcl0g6K+75Y+WIFRleHRTdHlsZXMg5qC35byP6KGo5aSx6LSl77yaJHt1cmx9YCwgZXJyKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW50cmllcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHdpdGhQcmVmYWIgPSBlbnRyaWVzLmZpbHRlcigoZSkgPT4gZS5wcmVmYWJVdWlkKS5sZW5ndGg7XG4gICAgICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXJdIFRleHRTdHlsZXMg5qC35byP5bqT5omr5o+P5YiwICR7ZW50cmllcy5sZW5ndGh9IOadoeagt+W8j++8iCR7d2l0aFByZWZhYn0g5p2h5bey57uR5a6a5qih5p2/IHByZWZhYu+8ieOAgmApO1xuICAgIH1cbiAgICByZXR1cm4geyBzb3VyY2VzLCBlbnRyaWVzIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlVGV4dFN0eWxlVGVtcGxhdGUobm9kZTogRmlnbWFOb2RlRGF0YSwgbGlicmFyeTogVGV4dFN0eWxlTGlicmFyeSk6IFJlc29sdmVkVGV4dFN0eWxlIHwgbnVsbCB7XG4gICAgaWYgKCFsaWJyYXJ5IHx8IGxpYnJhcnkuZW50cmllcy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IG5vZGVTaWduYXR1cmUgPSBidWlsZFRleHRTaWduYXR1cmUobm9kZSk7XG4gICAgY29uc3QgZXhhY3QgPSByZXNvbHZlRXhhY3Qobm9kZVNpZ25hdHVyZSwgbGlicmFyeS5lbnRyaWVzKTtcbiAgICBpZiAoZXhhY3QpIHJldHVybiB7IHRpZXI6ICdFeGFjdCcsIHNjb3JlOiAxLCBlbnRyeTogZXhhY3QgfTtcblxuICAgIGNvbnN0IGZ1enp5ID0gcmVzb2x2ZUZ1enp5KG5vZGUsIG5vZGVTaWduYXR1cmUsIGxpYnJhcnkuZW50cmllcyk7XG4gICAgaWYgKGZ1enp5ICYmIGZ1enp5LnNjb3JlID49IEZVWlpZX01JTl9TQ09SRSkgcmV0dXJuIHsgdGllcjogJ0Z1enp5Jywgc2NvcmU6IGZ1enp5LnNjb3JlLCBlbnRyeTogZnV6enkuZW50cnkgfTtcbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplRW50cnkocmF3OiBhbnksIHNvdXJjZTogc3RyaW5nLCBmb250TGliOiBGb250TGliRW50cnlbXSk6IFRleHRTdHlsZUVudHJ5IHwgbnVsbCB7XG4gICAgaWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHNpZ25hdHVyZSA9IFN0cmluZyhyYXcuZmlnbWFTaWduYXR1cmUgfHwgcmF3LnNpZ25hdHVyZSB8fCAnJykudHJpbSgpO1xuICAgIGNvbnN0IGZyb21TaWcgPSBleHRyYWN0RmFtaWx5V2VpZ2h0RnJvbVNpZyhzaWduYXR1cmUpO1xuICAgIGNvbnN0IGZhbWlseSA9IFN0cmluZyhyYXcuZmlnbWFGb250RmFtaWx5IHx8IHJhdy5mb250RmFtaWx5IHx8IHJhdy5mYW1pbHkgfHwgZnJvbVNpZy5mYW1pbHkgfHwgJycpLnRyaW0oKTtcbiAgICBjb25zdCB3ZWlnaHQgPSBTdHJpbmcocmF3LmZpZ21hRm9udFdlaWdodCB8fCByYXcuZm9udFdlaWdodCB8fCByYXcud2VpZ2h0IHx8IGZyb21TaWcud2VpZ2h0IHx8ICcnKS50cmltKCk7XG4gICAgY29uc3QgZm9udCA9IG1hdGNoRm9udChmYW1pbHksIHdlaWdodCwgZm9udExpYik7XG4gICAgY29uc3QgZWZmZWN0cyA9IG5vcm1hbGl6ZUVmZmVjdHMocmF3LmZpZ21hRWZmZWN0cyB8fCByYXcuZWZmZWN0cyB8fCBbXSk7XG4gICAgY29uc3Qgc3Ryb2tlID0gbm9ybWFsaXplU3Ryb2tlKHJhdyk7XG4gICAgY29uc3Qgc2hhZG93ID0gbm9ybWFsaXplU2hhZG93KHJhdywgZWZmZWN0cyk7XG4gICAgY29uc3QgZ3JhZGllbnQgPSBub3JtYWxpemVHcmFkaWVudChyYXcpO1xuICAgIGNvbnN0IGNvbG9yID0gbm9ybWFsaXplQ29sb3IocmF3LmZpZ21hQ29sb3IgfHwgcmF3LmNvbG9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBzb3VyY2UsXG4gICAgICAgIGZpZ21hU2lnbmF0dXJlOiBzaWduYXR1cmUsXG4gICAgICAgIGZpZ21hUGF0aDogU3RyaW5nKHJhdy5maWdtYVBhdGggfHwgcmF3LnBhdGggfHwgJycpLFxuICAgICAgICBzdHlsZU5hbWU6IFN0cmluZyhyYXcuc3R5bGVOYW1lIHx8IHJhdy50ZXh0U3R5bGVOYW1lIHx8ICcnKSxcbiAgICAgICAgc3R5bGVJZDogU3RyaW5nKHJhdy5zdHlsZUlkIHx8IHJhdy50ZXh0U3R5bGVJZCB8fCAnJyksXG4gICAgICAgIGNoaWxkTmFtZTogU3RyaW5nKHJhdy5jaGlsZE5hbWUgfHwgcmF3Lm5hbWUgfHwgJycpLFxuICAgICAgICBmaWdtYUZvbnRGYW1pbHk6IGZhbWlseSxcbiAgICAgICAgZmlnbWFGb250V2VpZ2h0OiB3ZWlnaHQsXG4gICAgICAgIGZpZ21hRWZmZWN0czogZWZmZWN0cyxcbiAgICAgICAgY29sb3IsXG4gICAgICAgIHN0cm9rZSxcbiAgICAgICAgc2hhZG93LFxuICAgICAgICBncmFkaWVudCxcbiAgICAgICAgZmlnbWFGaWxsU3R5bGVOYW1lOiBTdHJpbmcocmF3LmZpZ21hRmlsbFN0eWxlTmFtZSB8fCByYXcuZmlsbFN0eWxlTmFtZSB8fCAnJyksXG4gICAgICAgIGZpZ21hU3Ryb2tlU3R5bGVOYW1lOiBTdHJpbmcocmF3LmZpZ21hU3Ryb2tlU3R5bGVOYW1lIHx8IHJhdy5zdHJva2VTdHlsZU5hbWUgfHwgJycpLFxuICAgICAgICBmaWdtYUVmZmVjdFN0eWxlTmFtZTogU3RyaW5nKHJhdy5maWdtYUVmZmVjdFN0eWxlTmFtZSB8fCByYXcuZWZmZWN0U3R5bGVOYW1lIHx8ICcnKSxcbiAgICAgICAgZmlnbWFGb250U2l6ZTogTnVtYmVyKHJhdy5maWdtYUZvbnRTaXplIHx8IHJhdy5mb250U2l6ZSkgfHwgMCxcbiAgICAgICAgZmlnbWFTYW1wbGVUZXh0OiBTdHJpbmcocmF3LmZpZ21hU2FtcGxlVGV4dCB8fCByYXcuc2FtcGxlVGV4dCB8fCByYXcuY2hhcmFjdGVycyB8fCAnJyksXG4gICAgICAgIGZpZ21hQWxpZ25IOiBTdHJpbmcocmF3LmZpZ21hQWxpZ25IIHx8IHJhdy50ZXh0QWxpZ25Ib3Jpem9udGFsIHx8ICcnKSxcbiAgICAgICAgZmlnbWFBbGlnblY6IFN0cmluZyhyYXcuZmlnbWFBbGlnblYgfHwgcmF3LnRleHRBbGlnblZlcnRpY2FsIHx8ICcnKSxcbiAgICAgICAgZmlnbWFMaW5lSGVpZ2h0OiBOdW1iZXIocmF3LmZpZ21hTGluZUhlaWdodCB8fCByYXcubGluZUhlaWdodCkgfHwgMCxcbiAgICAgICAgZmlnbWFMZXR0ZXJTcGFjaW5nOiBOdW1iZXIocmF3LmZpZ21hTGV0dGVyU3BhY2luZyB8fCByYXcubGV0dGVyU3BhY2luZykgfHwgMCxcbiAgICAgICAgZm9udDogZm9udCA/IHsgdXVpZDogZm9udC51dWlkLCBmaWxlTmFtZTogZm9udC5maWxlTmFtZSwgd2VpZ2h0TWF0Y2hlZDogZm9udC53ZWlnaHRNYXRjaGVkIH0gOiB1bmRlZmluZWQsXG4gICAgICAgIHByZWZhYlV1aWQ6IFN0cmluZyhyYXcucHJlZmFiVXVpZCB8fCAnJyksXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUV4YWN0KHNpZ25hdHVyZTogc3RyaW5nLCBlbnRyaWVzOiBUZXh0U3R5bGVFbnRyeVtdKTogVGV4dFN0eWxlRW50cnkgfCBudWxsIHtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgICAgaWYgKGVudHJ5LmZpZ21hU2lnbmF0dXJlID09PSBzaWduYXR1cmUpIHJldHVybiBlbnRyeTtcbiAgICB9XG4gICAgY29uc3Qgc3RyaXBwZWQgPSBzdHJpcFdlaWdodChzaWduYXR1cmUpO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoc3RyaXBXZWlnaHQoZW50cnkuZmlnbWFTaWduYXR1cmUpID09PSBzdHJpcHBlZCkgcmV0dXJuIGVudHJ5O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUZ1enp5KG5vZGU6IEZpZ21hTm9kZURhdGEsIHNpZ25hdHVyZTogc3RyaW5nLCBlbnRyaWVzOiBUZXh0U3R5bGVFbnRyeVtdKTpcbiAgICB7IGVudHJ5OiBUZXh0U3R5bGVFbnRyeTsgc2NvcmU6IG51bWJlciB9IHwgbnVsbCB7XG4gICAgY29uc3Qgbm9kZUZvbnQgPSBleHRyYWN0RmFtaWx5V2VpZ2h0RnJvbVNpZyhzaWduYXR1cmUpO1xuICAgIGNvbnN0IG5mID0gbm9ybUZhbWlseShub2RlLmZvbnRGYW1pbHkgfHwgbm9kZUZvbnQuZmFtaWx5KTtcbiAgICBpZiAoIW5mKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBudyA9IG5vcm1hbGl6ZVdlaWdodChub2RlLmZvbnRXZWlnaHQgfHwgbm9kZUZvbnQud2VpZ2h0KTtcbiAgICBjb25zdCBuU3Ryb2tlID0gZXh0cmFjdE5vZGVTdHJva2Uobm9kZSk7XG4gICAgY29uc3QgbkVmZmVjdHMgPSBleHRyYWN0Tm9kZUVmZmVjdHMobm9kZSk7XG4gICAgY29uc3QgbkdyYWRpZW50ID0gZXh0cmFjdE5vZGVHcmFkaWVudChub2RlKTtcbiAgICBsZXQgYmVzdDogeyBlbnRyeTogVGV4dFN0eWxlRW50cnk7IHNjb3JlOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBjb25zdCBlZiA9IG5vcm1GYW1pbHkoZW50cnkuZmlnbWFGb250RmFtaWx5IHx8IGV4dHJhY3RGYW1pbHlXZWlnaHRGcm9tU2lnKGVudHJ5LmZpZ21hU2lnbmF0dXJlKS5mYW1pbHkpO1xuICAgICAgICBjb25zdCBmYW0gPSBmYW1pbHlTaW1pbGFyaXR5KG5mLCBlZik7XG4gICAgICAgIGlmIChmYW0gPCBGVVpaWV9NSU5fRkFNSUxZKSBjb250aW51ZTtcbiAgICAgICAgY29uc3Qgd2VpZ2h0ID0gbncgPT09IG5vcm1hbGl6ZVdlaWdodChlbnRyeS5maWdtYUZvbnRXZWlnaHQpID8gMSA6IDAuNDtcbiAgICAgICAgY29uc3QgYXBwZWFyYW5jZSA9IChcbiAgICAgICAgICAgIHN0cm9rZVNpbWlsYXJpdHkoblN0cm9rZSwgZW50cnkpICtcbiAgICAgICAgICAgIGVmZmVjdHNTaW1pbGFyaXR5KG5FZmZlY3RzLCBlbnRyeS5maWdtYUVmZmVjdHMpICtcbiAgICAgICAgICAgIGdyYWRpZW50U2ltaWxhcml0eShuR3JhZGllbnQsIGVudHJ5KVxuICAgICAgICApIC8gMztcbiAgICAgICAgY29uc3Qgc2NvcmUgPSAwLjUgKiBmYW0gKyAwLjEyICogd2VpZ2h0ICsgMC4zOCAqIGFwcGVhcmFuY2U7XG4gICAgICAgIGlmICghYmVzdCB8fCBzY29yZSA+IGJlc3Quc2NvcmUpIGJlc3QgPSB7IGVudHJ5LCBzY29yZSB9O1xuICAgIH1cbiAgICByZXR1cm4gYmVzdDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplU3Ryb2tlKHJhdzogYW55KTogeyBjb2xvcjogUmdiYTI1NTsgd2lkdGg6IG51bWJlcjsgYWxpZ246IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcbiAgICBpZiAocmF3LnN0cm9rZSAmJiByYXcuc3Ryb2tlLmNvbG9yKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2xvcjogbm9ybWFsaXplQ29sb3IocmF3LnN0cm9rZS5jb2xvcikgfHwgeyByOiAwLCBnOiAwLCBiOiAwLCBhOiAyNTUgfSxcbiAgICAgICAgICAgIHdpZHRoOiBOdW1iZXIocmF3LnN0cm9rZS53aWR0aCA/PyByYXcuc3Ryb2tlLndlaWdodCA/PyAxKSB8fCAxLFxuICAgICAgICAgICAgYWxpZ246IFN0cmluZyhyYXcuc3Ryb2tlLmFsaWduIHx8ICcnKSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgaWYgKHJhdy5maWdtYUhhc1N0cm9rZSA9PT0gdHJ1ZSB8fCByYXcuaGFzU3Ryb2tlID09PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2xvcjogbm9ybWFsaXplQ29sb3IocmF3LmZpZ21hU3Ryb2tlQ29sb3IgfHwgcmF3LnN0cm9rZUNvbG9yKSB8fCB7IHI6IDAsIGc6IDAsIGI6IDAsIGE6IDI1NSB9LFxuICAgICAgICAgICAgd2lkdGg6IE51bWJlcihyYXcuZmlnbWFTdHJva2VXZWlnaHQgPz8gcmF3LnN0cm9rZVdlaWdodCA/PyAxKSB8fCAxLFxuICAgICAgICAgICAgYWxpZ246IFN0cmluZyhyYXcuZmlnbWFTdHJva2VBbGlnbiB8fCByYXcuc3Ryb2tlQWxpZ24gfHwgJycpLFxuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVTaGFkb3cocmF3OiBhbnksIGVmZmVjdHM6IFRleHRTdHlsZUVmZmVjdFtdKTpcbiAgICB7IGNvbG9yOiBSZ2JhMjU1OyBvZmZzZXRYOiBudW1iZXI7IG9mZnNldFk6IG51bWJlcjsgYmx1cjogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuICAgIGlmIChyYXcuc2hhZG93ICYmIHJhdy5zaGFkb3cuY29sb3IpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvbG9yOiBub3JtYWxpemVDb2xvcihyYXcuc2hhZG93LmNvbG9yKSB8fCB7IHI6IDAsIGc6IDAsIGI6IDAsIGE6IDI1NSB9LFxuICAgICAgICAgICAgb2Zmc2V0WDogTnVtYmVyKHJhdy5zaGFkb3cub2Zmc2V0WCkgfHwgMCxcbiAgICAgICAgICAgIG9mZnNldFk6IE51bWJlcihyYXcuc2hhZG93Lm9mZnNldFkpIHx8IDAsXG4gICAgICAgICAgICBibHVyOiBOdW1iZXIocmF3LnNoYWRvdy5ibHVyID8/IHJhdy5zaGFkb3cucmFkaXVzKSB8fCAwLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBjb25zdCBkcm9wID0gZWZmZWN0cy5maW5kKChlKSA9PiBlLnR5cGUudG9VcHBlckNhc2UoKSA9PT0gJ0RST1BfU0hBRE9XJyk7XG4gICAgaWYgKCFkcm9wKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbG9yOiBkcm9wLmNvbG9yLFxuICAgICAgICBvZmZzZXRYOiBkcm9wLm9mZnNldFgsXG4gICAgICAgIG9mZnNldFk6IGRyb3Aub2Zmc2V0WSxcbiAgICAgICAgYmx1cjogZHJvcC5yYWRpdXMsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplR3JhZGllbnQocmF3OiBhbnkpOiB7IG1vZGU6IHN0cmluZzsgYTogUmdiYTI1NTsgYjogUmdiYTI1NSB9IHwgdW5kZWZpbmVkIHtcbiAgICBpZiAocmF3LmdyYWRpZW50ICYmIHJhdy5ncmFkaWVudC5hICYmIHJhdy5ncmFkaWVudC5iKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtb2RlOiBTdHJpbmcocmF3LmdyYWRpZW50Lm1vZGUgfHwgJycpLFxuICAgICAgICAgICAgYTogbm9ybWFsaXplQ29sb3IocmF3LmdyYWRpZW50LmEpIHx8IHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH0sXG4gICAgICAgICAgICBiOiBub3JtYWxpemVDb2xvcihyYXcuZ3JhZGllbnQuYikgfHwgeyByOiAyNTUsIGc6IDI1NSwgYjogMjU1LCBhOiAyNTUgfSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgaWYgKHJhdy5maWdtYUhhc0dyYWRpZW50ID09PSB0cnVlIHx8IHJhdy5oYXNHcmFkaWVudCA9PT0gdHJ1ZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbW9kZTogU3RyaW5nKHJhdy5maWdtYUdyYWRpZW50TW9kZSB8fCByYXcuZ3JhZGllbnRNb2RlIHx8ICcnKSxcbiAgICAgICAgICAgIGE6IG5vcm1hbGl6ZUNvbG9yKHJhdy5maWdtYUdyYWRBIHx8IHJhdy5ncmFkaWVudEEpIHx8IHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH0sXG4gICAgICAgICAgICBiOiBub3JtYWxpemVDb2xvcihyYXcuZmlnbWFHcmFkQiB8fCByYXcuZ3JhZGllbnRCKSB8fCB7IHI6IDI1NSwgZzogMjU1LCBiOiAyNTUsIGE6IDI1NSB9LFxuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVFZmZlY3RzKHZhbHVlOiBhbnkpOiBUZXh0U3R5bGVFZmZlY3RbXSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSkgcmV0dXJuIFtdO1xuICAgIHJldHVybiB2YWx1ZVxuICAgICAgICAubWFwKChpdGVtKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IG5vcm1hbGl6ZUNvbG9yKGl0ZW0gJiYgKGl0ZW0uY29sb3IgfHwgaXRlbSkpO1xuICAgICAgICAgICAgaWYgKCFpdGVtIHx8ICFjb2xvcikgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHR5cGU6IFN0cmluZyhpdGVtLnR5cGUgfHwgJycpLFxuICAgICAgICAgICAgICAgIGNvbG9yLFxuICAgICAgICAgICAgICAgIG9mZnNldFg6IE51bWJlcihpdGVtLm9mZnNldFgpIHx8IDAsXG4gICAgICAgICAgICAgICAgb2Zmc2V0WTogTnVtYmVyKGl0ZW0ub2Zmc2V0WSkgfHwgMCxcbiAgICAgICAgICAgICAgICByYWRpdXM6IE51bWJlcihpdGVtLnJhZGl1cykgfHwgMCxcbiAgICAgICAgICAgICAgICBzcHJlYWQ6IE51bWJlcihpdGVtLnNwcmVhZCkgfHwgMCxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pXG4gICAgICAgIC5maWx0ZXIoKGl0ZW0pOiBpdGVtIGlzIFRleHRTdHlsZUVmZmVjdCA9PiAhIWl0ZW0pO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVDb2xvcih2YWx1ZTogYW55KTogUmdiYTI1NSB8IHVuZGVmaW5lZCB7XG4gICAgaWYgKCF2YWx1ZSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBjb25zdCByID0gTnVtYmVyKHZhbHVlLnIpO1xuICAgIGNvbnN0IGcgPSBOdW1iZXIodmFsdWUuZyk7XG4gICAgY29uc3QgYiA9IE51bWJlcih2YWx1ZS5iKTtcbiAgICBjb25zdCBhID0gTnVtYmVyKHZhbHVlLmEgPz8gMSk7XG4gICAgaWYgKCFbciwgZywgYiwgYV0uZXZlcnkoTnVtYmVyLmlzRmluaXRlKSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBjb25zdCBzY2FsZSA9IHIgPD0gMSAmJiBnIDw9IDEgJiYgYiA8PSAxICYmIGEgPD0gMSA/IDI1NSA6IDE7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcjogY2xhbXAyNTUociAqIHNjYWxlKSxcbiAgICAgICAgZzogY2xhbXAyNTUoZyAqIHNjYWxlKSxcbiAgICAgICAgYjogY2xhbXAyNTUoYiAqIHNjYWxlKSxcbiAgICAgICAgYTogY2xhbXAyNTUoYSAqIHNjYWxlKSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Tm9kZVN0cm9rZShub2RlOiBGaWdtYU5vZGVEYXRhKTogeyBjb2xvcjogUmdiYTI1NTsgd2lkdGg6IG51bWJlcjsgYWxpZ246IHN0cmluZyB9IHwgbnVsbCB7XG4gICAgZm9yIChjb25zdCBzIG9mIG5vZGUuc3Ryb2tlcyB8fCBbXSkge1xuICAgICAgICBpZiAoIXMgfHwgcy52aXNpYmxlID09PSBmYWxzZSkgY29udGludWU7XG4gICAgICAgIGlmIChzLnR5cGUgJiYgcy50eXBlICE9PSAnU09MSUQnKSBjb250aW51ZTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvbG9yOiBub3JtYWxpemVDb2xvcihzKSB8fCB7IHI6IDAsIGc6IDAsIGI6IDAsIGE6IDI1NSB9LFxuICAgICAgICAgICAgd2lkdGg6IE51bWJlcihub2RlLnN0cm9rZVdlaWdodCkgfHwgMCxcbiAgICAgICAgICAgIGFsaWduOiBTdHJpbmcobm9kZS5zdHJva2VBbGlnbiB8fCAnJyksXG4gICAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Tm9kZUVmZmVjdHMobm9kZTogRmlnbWFOb2RlRGF0YSk6IFRleHRTdHlsZUVmZmVjdFtdIHtcbiAgICByZXR1cm4gbm9ybWFsaXplRWZmZWN0cyhub2RlLmVmZmVjdHMgfHwgW10pO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0Tm9kZUdyYWRpZW50KG5vZGU6IEZpZ21hTm9kZURhdGEpOiB7IG1vZGU6IHN0cmluZzsgYTogUmdiYTI1NTsgYjogUmdiYTI1NSB9IHwgbnVsbCB7XG4gICAgZm9yIChjb25zdCBmaWxsIG9mIG5vZGUuZmlsbHMgfHwgW10pIHtcbiAgICAgICAgaWYgKCFmaWxsIHx8IGZpbGwudmlzaWJsZSA9PT0gZmFsc2UgfHwgZmlsbC50eXBlICE9PSAnU09MSUQnKSBjb250aW51ZTtcbiAgICAgICAgaWYgKGZpbGwuZ3JhZGllbnRNb2RlICYmIGZpbGwuZ3JhZGllbnRDb2xvckEgJiYgZmlsbC5ncmFkaWVudENvbG9yQikge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBtb2RlOiBTdHJpbmcoZmlsbC5ncmFkaWVudE1vZGUgfHwgJycpLFxuICAgICAgICAgICAgICAgIGE6IG5vcm1hbGl6ZUNvbG9yKGZpbGwuZ3JhZGllbnRDb2xvckEpIHx8IHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH0sXG4gICAgICAgICAgICAgICAgYjogbm9ybWFsaXplQ29sb3IoZmlsbC5ncmFkaWVudENvbG9yQikgfHwgeyByOiAyNTUsIGc6IDI1NSwgYjogMjU1LCBhOiAyNTUgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzdHJva2VTaW1pbGFyaXR5KFxuICAgIG5vZGVTdHJva2U6IHsgY29sb3I6IFJnYmEyNTU7IHdpZHRoOiBudW1iZXI7IGFsaWduOiBzdHJpbmcgfSB8IG51bGwsXG4gICAgZW50cnk6IFRleHRTdHlsZUVudHJ5XG4pOiBudW1iZXIge1xuICAgIGlmICghbm9kZVN0cm9rZSAmJiAhZW50cnkuc3Ryb2tlKSByZXR1cm4gMTtcbiAgICBpZiAoIW5vZGVTdHJva2UgfHwgIWVudHJ5LnN0cm9rZSkgcmV0dXJuIDA7XG4gICAgY29uc3QgY29sb3IgPSBjb2xvclNpbWlsYXJpdHkobm9kZVN0cm9rZS5jb2xvciwgZW50cnkuc3Ryb2tlLmNvbG9yKTtcbiAgICBjb25zdCB3aWR0aCA9IG51bWJlclNpbWlsYXJpdHkobm9kZVN0cm9rZS53aWR0aCwgZW50cnkuc3Ryb2tlLndpZHRoLCA0KTtcbiAgICBjb25zdCBhbGlnbiA9IG5vcm0obm9kZVN0cm9rZS5hbGlnbikgPT09IG5vcm0oZW50cnkuc3Ryb2tlLmFsaWduKSA/IDEgOiAwLjc7XG4gICAgcmV0dXJuIDAuNiAqIGNvbG9yICsgMC4zICogd2lkdGggKyAwLjEgKiBhbGlnbjtcbn1cblxuZnVuY3Rpb24gZWZmZWN0c1NpbWlsYXJpdHkoYTogVGV4dFN0eWxlRWZmZWN0W10sIGI6IFRleHRTdHlsZUVmZmVjdFtdKTogbnVtYmVyIHtcbiAgICBjb25zdCBjYSA9IGEgPyBhLmxlbmd0aCA6IDA7XG4gICAgY29uc3QgY2IgPSBiID8gYi5sZW5ndGggOiAwO1xuICAgIGlmIChjYSA9PT0gMCAmJiBjYiA9PT0gMCkgcmV0dXJuIDE7XG4gICAgaWYgKGNhICE9PSBjYikgcmV0dXJuIDAuMTU7XG4gICAgbGV0IHN1bSA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjYTsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHggPSBhW2ldO1xuICAgICAgICBjb25zdCB5ID0gYltpXTtcbiAgICAgICAgY29uc3QgdHlwZSA9IG5vcm0oeC50eXBlKSA9PT0gbm9ybSh5LnR5cGUpID8gMSA6IDA7XG4gICAgICAgIGNvbnN0IGNvbG9yID0gY29sb3JTaW1pbGFyaXR5KHguY29sb3IsIHkuY29sb3IpO1xuICAgICAgICBjb25zdCBvZmZzZXQgPSAoXG4gICAgICAgICAgICBudW1iZXJTaW1pbGFyaXR5KHgub2Zmc2V0WCwgeS5vZmZzZXRYLCA4KSArXG4gICAgICAgICAgICBudW1iZXJTaW1pbGFyaXR5KHgub2Zmc2V0WSwgeS5vZmZzZXRZLCA4KVxuICAgICAgICApIC8gMjtcbiAgICAgICAgY29uc3QgcmFkaXVzID0gbnVtYmVyU2ltaWxhcml0eSh4LnJhZGl1cywgeS5yYWRpdXMsIDE2KTtcbiAgICAgICAgc3VtICs9IDAuMyAqIHR5cGUgKyAwLjMgKiBjb2xvciArIDAuMjUgKiBvZmZzZXQgKyAwLjE1ICogcmFkaXVzO1xuICAgIH1cbiAgICByZXR1cm4gc3VtIC8gY2E7XG59XG5cbmZ1bmN0aW9uIGdyYWRpZW50U2ltaWxhcml0eShcbiAgICBub2RlR3JhZGllbnQ6IHsgbW9kZTogc3RyaW5nOyBhOiBSZ2JhMjU1OyBiOiBSZ2JhMjU1IH0gfCBudWxsLFxuICAgIGVudHJ5OiBUZXh0U3R5bGVFbnRyeVxuKTogbnVtYmVyIHtcbiAgICBpZiAoIW5vZGVHcmFkaWVudCAmJiAhZW50cnkuZ3JhZGllbnQpIHJldHVybiAxO1xuICAgIGlmICghbm9kZUdyYWRpZW50IHx8ICFlbnRyeS5ncmFkaWVudCkgcmV0dXJuIDA7XG4gICAgY29uc3QgbW9kZSA9IG5vcm0obm9kZUdyYWRpZW50Lm1vZGUpID09PSBub3JtKGVudHJ5LmdyYWRpZW50Lm1vZGUpID8gMSA6IDAuNjtcbiAgICByZXR1cm4gMC40ICogbW9kZSArIDAuMyAqIGNvbG9yU2ltaWxhcml0eShub2RlR3JhZGllbnQuYSwgZW50cnkuZ3JhZGllbnQuYSkgKyAwLjMgKiBjb2xvclNpbWlsYXJpdHkobm9kZUdyYWRpZW50LmIsIGVudHJ5LmdyYWRpZW50LmIpO1xufVxuXG5mdW5jdGlvbiBjb2xvclNpbWlsYXJpdHkoYTogUmdiYTI1NSwgYjogUmdiYTI1NSk6IG51bWJlciB7XG4gICAgY29uc3QgZHIgPSAoYS5yIC0gYi5yKSAvIDI1NTtcbiAgICBjb25zdCBkZyA9IChhLmcgLSBiLmcpIC8gMjU1O1xuICAgIGNvbnN0IGRiID0gKGEuYiAtIGIuYikgLyAyNTU7XG4gICAgY29uc3QgZGEgPSAoYS5hIC0gYi5hKSAvIDI1NTtcbiAgICBjb25zdCBkaXN0ID0gTWF0aC5zcXJ0KChkciAqIGRyICsgZGcgKiBkZyArIGRiICogZGIgKyBkYSAqIGRhKSAvIDQpO1xuICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCAxIC0gZGlzdCkpO1xufVxuXG5mdW5jdGlvbiBudW1iZXJTaW1pbGFyaXR5KGE6IG51bWJlciwgYjogbnVtYmVyLCBzY2FsZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgMSAtIE1hdGguYWJzKChOdW1iZXIoYSkgfHwgMCkgLSAoTnVtYmVyKGIpIHx8IDApKSAvIE1hdGgubWF4KHNjYWxlLCAwLjAwMDEpKSk7XG59XG5cbmZ1bmN0aW9uIHNwbGl0U2lnbmF0dXJlKHNpZ25hdHVyZTogc3RyaW5nKTogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSB7XG4gICAgY29uc3Qgb3V0OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgZm9yIChjb25zdCB0b2tlbiBvZiBTdHJpbmcoc2lnbmF0dXJlIHx8ICcnKS5zcGxpdCgnICcpKSB7XG4gICAgICAgIGNvbnN0IGlkeCA9IHRva2VuLmluZGV4T2YoJzonKTtcbiAgICAgICAgaWYgKGlkeCA8PSAwKSBjb250aW51ZTtcbiAgICAgICAgb3V0W3Rva2VuLnNsaWNlKDAsIGlkeCldID0gdG9rZW47XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RGYW1pbHlXZWlnaHRGcm9tU2lnKHNpZ25hdHVyZTogc3RyaW5nKTogeyBmYW1pbHk6IHN0cmluZzsgd2VpZ2h0OiBzdHJpbmcgfSB7XG4gICAgY29uc3QgZiA9IHNwbGl0U2lnbmF0dXJlKHNpZ25hdHVyZSkuRiB8fCAnJztcbiAgICBjb25zdCBjb2xvbiA9IGYuaW5kZXhPZignOicpO1xuICAgIGNvbnN0IGJhciA9IGYuaW5kZXhPZignfCcpO1xuICAgIGlmIChjb2xvbiA8IDApIHJldHVybiB7IGZhbWlseTogJycsIHdlaWdodDogJycgfTtcbiAgICByZXR1cm4ge1xuICAgICAgICBmYW1pbHk6IGJhciA+PSAwID8gZi5zbGljZShjb2xvbiArIDEsIGJhcikgOiBmLnNsaWNlKGNvbG9uICsgMSksXG4gICAgICAgIHdlaWdodDogYmFyID49IDAgPyBmLnNsaWNlKGJhciArIDEpIDogJycsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gc3RyaXBXZWlnaHQoc2lnbmF0dXJlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGJhciA9IHNpZ25hdHVyZS5pbmRleE9mKCd8Jyk7XG4gICAgY29uc3QgayA9IGJhciA+PSAwID8gc2lnbmF0dXJlLmluZGV4T2YoJyBLOicsIGJhcikgOiAtMTtcbiAgICBpZiAoYmFyIDwgMCB8fCBrIDwgMCkgcmV0dXJuIHNpZ25hdHVyZTtcbiAgICByZXR1cm4gc2lnbmF0dXJlLnNsaWNlKDAsIGJhciArIDEpICsgc2lnbmF0dXJlLnNsaWNlKGspO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVXZWlnaHQodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHZhbHVlID09IG51bGwgfHwgU3RyaW5nKHZhbHVlKS50cmltKCkgPT09ICcnID8gJycgOiBTdHJpbmcodmFsdWUpLnRyaW0oKS5yZXBsYWNlKC8gL2csICcnKS50b0xvd2VyQ2FzZSgpO1xufVxuXG5mdW5jdGlvbiBub3JtKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiB2YWx1ZS50cmltKCkudG9Mb3dlckNhc2UoKTtcbn1cblxuZnVuY3Rpb24gbm9ybUZhbWlseSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcbiAgICBpZiAoIXZhbHVlKSByZXR1cm4gJyc7XG4gICAgbGV0IG91dCA9ICcnO1xuICAgIGZvciAoY29uc3QgY2ggb2YgdmFsdWUudHJpbSgpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgaWYgKC9bYS16MC055LiALem/v10vLnRlc3QoY2gpKSBvdXQgKz0gY2g7XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZhbWlseVNpbWlsYXJpdHkoYTogc3RyaW5nLCBiOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIGlmICghYSB8fCAhYikgcmV0dXJuIDA7XG4gICAgaWYgKGEgPT09IGIpIHJldHVybiAxO1xuICAgIGlmIChhLmluY2x1ZGVzKGIpIHx8IGIuaW5jbHVkZXMoYSkpIHJldHVybiAwLjg1O1xuICAgIGNvbnN0IG1heCA9IE1hdGgubWF4KGEubGVuZ3RoLCBiLmxlbmd0aCk7XG4gICAgcmV0dXJuIG1heCA9PT0gMCA/IDAgOiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCAxIC0gbGV2ZW5zaHRlaW4oYSwgYikgLyBtYXgpKTtcbn1cblxuZnVuY3Rpb24gbGV2ZW5zaHRlaW4oYTogc3RyaW5nLCBiOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIGNvbnN0IG4gPSBhLmxlbmd0aDtcbiAgICBjb25zdCBtID0gYi5sZW5ndGg7XG4gICAgaWYgKG4gPT09IDApIHJldHVybiBtO1xuICAgIGlmIChtID09PSAwKSByZXR1cm4gbjtcbiAgICBsZXQgcHJldiA9IG5ldyBBcnJheTxudW1iZXI+KG0gKyAxKTtcbiAgICBsZXQgY3VyID0gbmV3IEFycmF5PG51bWJlcj4obSArIDEpO1xuICAgIGZvciAobGV0IGogPSAwOyBqIDw9IG07IGorKykgcHJldltqXSA9IGo7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gbjsgaSsrKSB7XG4gICAgICAgIGN1clswXSA9IGk7XG4gICAgICAgIGZvciAobGV0IGogPSAxOyBqIDw9IG07IGorKykge1xuICAgICAgICAgICAgY29uc3QgY29zdCA9IGFbaSAtIDFdID09PSBiW2ogLSAxXSA/IDAgOiAxO1xuICAgICAgICAgICAgY3VyW2pdID0gTWF0aC5taW4ocHJldltqXSArIDEsIGN1cltqIC0gMV0gKyAxLCBwcmV2W2ogLSAxXSArIGNvc3QpO1xuICAgICAgICB9XG4gICAgICAgIFtwcmV2LCBjdXJdID0gW2N1ciwgcHJldl07XG4gICAgfVxuICAgIHJldHVybiBwcmV2W21dO1xufVxuXG5mdW5jdGlvbiBjbGFtcDI1NSh2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHJldHVybiAyNTU7XG4gICAgcmV0dXJuIE1hdGgubWF4KDAsIE1hdGgubWluKDI1NSwgTWF0aC5yb3VuZCh2YWx1ZSkpKTtcbn1cblxuZnVuY3Rpb24gZGJVcmxUb0Fzc2V0UGF0aChkYlVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFkYlVybC5zdGFydHNXaXRoKCdkYjovL2Fzc2V0cy8nKSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcHJvamVjdFBhdGggPSAoRWRpdG9yIGFzIGFueSkuUHJvamVjdCAmJiAoRWRpdG9yIGFzIGFueSkuUHJvamVjdC5wYXRoO1xuICAgIGlmICghcHJvamVjdFBhdGgpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBqb2luKHByb2plY3RQYXRoLCAnYXNzZXRzJywgZGJVcmwuc2xpY2UoJ2RiOi8vYXNzZXRzLycubGVuZ3RoKSk7XG59XG4iXX0=