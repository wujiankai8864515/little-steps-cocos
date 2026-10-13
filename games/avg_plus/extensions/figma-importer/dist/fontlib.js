"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FontDemandTracker = exports.FONT_LIB_DIR = void 0;
exports.scanFontLibrary = scanFontLibrary;
exports.matchFont = matchFont;
exports.explainFontMiss = explainFontMiss;
/**
 * @en Font style library (stage 5): scan db://assets/art/figma-fonts/ and match a Figma
 *     font family+weight to a bundled font asset by family similarity.
 * @zh 字体样式库（阶段 5）：扫描 db://assets/art/figma-fonts/ 下的字体资源，按「字体族相似度」
 *     把 Figma 的 fontFamily+fontWeight 匹配到工程里备好的字体资源，命中返回其 uuid。
 *
 * 只在主进程跑（要查 asset-db）。匹配算法照搬 Unity FigmaTextStyleTable.cs 的
 * NormFamily / FamilySimilarity / Levenshtein / NormalizeWeight —— 跨引擎同构，便于双端维护。
 *
 * 与 Unity 的差异（有意为之）：Unity 靠美术预配 TMP 模板 + 克隆材质（因 TMP 描边/发光是材质，
 * 无法从 JSON 生成）；Cocos 的描边/投影是组件、可直接从 Figma strokes/effects 生成，
 * 所以样式库这里只解决「字体族 → 字体文件」这一层，描边/投影在 scene.ts 里自动派生。
 */
const fs_1 = require("fs");
const path_1 = require("path");
const assetdb_1 = require("./assetdb");
/** @zh 字体库约定目录：把 TTF/OTF/BMFont 放这里，文件名（不含扩展名）= 字体族名。 */
exports.FONT_LIB_DIR = 'db://assets/art/figma-fonts';
/** @zh 字体族最低相似度门槛：低于此值视为「不是同一字体」，回退默认字体（对齐 Unity FuzzyMinFamily）。 */
const MIN_FAMILY_SIM = 0.5;
/** @zh 这些 Figma 字体明确接受使用 Cocos 默认字体回退，不再作为缺失需求提示。 */
const ACCEPTED_DEFAULT_FALLBACK_FAMILIES = new Set([
    'zihunbingmeishi_t',
]);
/**
 * @en Scan the font library dir for font assets. Returns [] if the dir is absent.
 * @zh 扫描字体库目录里的字体资源。目录不存在返回 []（导入照常走默认字体）。
 */
async function scanFontLibrary() {
    let assets = [];
    try {
        // pattern 形式随版本略有差异，用 db:// 通配抓该目录全部资源，再按 font 类型过滤。
        const pattern = `${exports.FONT_LIB_DIR}/**/*`;
        assets = await (0, assetdb_1.requestAssetDb)('query-assets', pattern, [{ pattern }]);
    }
    catch (err) {
        (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
        console.warn('[figma-importer] 扫描字体库失败（可能目录不存在），回退默认字体:', err);
        return [];
    }
    if (!Array.isArray(assets))
        return [];
    const lib = [];
    const skippedFontLike = [];
    for (const a of assets) {
        if (!a || !a.uuid)
            continue;
        // 只要 Cocos 已识别为字体的资源。不要仅凭 .ttf/.otf 扩展名纳入：
        // 未被 ttf-font importer 接管的文件会以 cc.Asset 载入，赋给 Label.font 后表现不稳定。
        const type = `${a.type || ''} ${a.importer || ''}`.trim();
        const isFont = /font/i.test(type);
        if (!isFont) {
            const assetName = a.url || a.source || a.name || '';
            if (/\.(ttf|otf|ttc|woff2?)$/i.test(assetName)) {
                const fileName = baseName(assetName);
                skippedFontLike.push({
                    fileName,
                    formatted: formatFontName(fileName),
                    type: type || 'unknown importer',
                });
            }
            continue;
        }
        const assetName = a.url || a.source || a.name || '';
        const fileName = baseName(a.name || a.url || a.source || '');
        const meta = readFontMeta(resolveFontAssetPath(a, assetName, fileName));
        lib.push({
            uuid: a.uuid,
            fileName,
            norm: normFamily(fileName),
            formatted: formatFontName(fileName),
            weightClass: meta.weightClass,
            internalStyle: meta.internalStyle,
        });
    }
    console.log(`[figma-importer] 字体库扫描到 ${lib.length} 个字体资源。`);
    if (skippedFontLike.length > 0) {
        const skippedWithoutAlternative = skippedFontLike.filter((s) => !hasImportedFontAlternative(s, lib));
        const skippedWithAlternative = skippedFontLike.length - skippedWithoutAlternative.length;
        if (skippedWithAlternative > 0) {
            console.log(`[figma-importer] 已忽略 ${skippedWithAlternative} 个未被 Cocos 识别为字体、但已有可用同族字体的文件。`);
        }
        if (skippedWithoutAlternative.length > 0) {
            const names = skippedWithoutAlternative.map((s) => `${s.fileName} (${s.type})`).join(', ');
            console.warn(`[figma-importer] 已跳过 ${skippedWithoutAlternative.length} 个未被 Cocos 识别为字体的文件：${names}`);
        }
    }
    return lib.sort((a, b) => a.fileName.localeCompare(b.fileName));
}
/**
 * @en Match a Figma family+weight to a library font uuid. Returns null if nothing is close enough.
 * @zh 把 Figma 的 fontFamily(+fontWeight 仅细分同分) 匹配到库里字体 uuid。不够像返回 null（回退默认）。
 *
 * 评分对齐 Unity：字体族相似度为主（低于门槛直接排除），字重仅在同分时细分。
 */
function matchFont(family, weight, lib) {
    if (!lib || lib.length === 0)
        return null;
    const nf = normFamily(family || '');
    if (nf.length === 0)
        return null;
    const familyFormatted = formatFontName(family || '');
    const normalizedWeight = normalizeFontWeight(weight || '');
    const weightFormatted = formatFontName(normalizedWeight);
    const familyWeightFormatted = formatFontName(`${family || ''}-${normalizedWeight}`);
    const compatible = lib.filter((e) => isWeightCompatible(e, normalizedWeight));
    // 1) family + weight 精确匹配：NotoSans-Bold.ttf 对 NotoSans / Bold。
    const exactFamilyWeight = compatible.find((e) => e.formatted === familyWeightFormatted);
    if (exactFamilyWeight) {
        return {
            uuid: exactFamilyWeight.uuid,
            fileName: exactFamilyWeight.fileName,
            sim: 1,
            weightMatched: isRealWeightMatch(exactFamilyWeight, normalizedWeight),
        };
    }
    // 2) 字体文件名同时包含 family 和 weight：兼容 "NotoSans SC Bold" 等命名。
    const familyAndWeight = compatible
        .filter((e) => e.formatted.includes(familyFormatted) && e.formatted.includes(weightFormatted))
        .sort((a, b) => familySimilarity(nf, b.norm) - familySimilarity(nf, a.norm))[0];
    if (familyAndWeight) {
        return {
            uuid: familyAndWeight.uuid,
            fileName: familyAndWeight.fileName,
            sim: familySimilarity(nf, familyAndWeight.norm),
            weightMatched: isRealWeightMatch(familyAndWeight, normalizedWeight),
        };
    }
    // 3) family 精确匹配：有些库只提供 NotoSans.ttf，字重靠 Label.isBold 合成。
    const exactFamily = compatible.find((e) => e.formatted === familyFormatted);
    if (exactFamily) {
        return {
            uuid: exactFamily.uuid,
            fileName: exactFamily.fileName,
            sim: 1,
            weightMatched: isRealWeightMatch(exactFamily, normalizedWeight),
        };
    }
    // 4) family 精确但字重 metadata 不兼容：仍比系统字体更符合 Figma。
    // 典型例子：Commissioner.ttf 内部 OS/2 weight 偏高，但 Figma 字体族就是 Commissioner Regular。
    const exactFamilyAnyWeight = lib.find((e) => e.formatted === familyFormatted);
    if (exactFamilyAnyWeight) {
        return {
            uuid: exactFamilyAnyWeight.uuid,
            fileName: exactFamilyAnyWeight.fileName,
            sim: 1,
            weightMatched: isRealWeightMatch(exactFamilyAnyWeight, normalizedWeight),
        };
    }
    let best = null;
    let bestSim = -1;
    for (const e of compatible) {
        const sim = familySimilarity(nf, e.norm);
        if (sim > bestSim) {
            bestSim = sim;
            best = e;
        }
    }
    if (!best || bestSim < MIN_FAMILY_SIM)
        return null;
    return {
        uuid: best.uuid,
        fileName: best.fileName,
        sim: bestSim,
        weightMatched: isRealWeightMatch(best, normalizedWeight),
    };
}
function explainFontMiss(family, weight, lib) {
    if (!lib || lib.length === 0)
        return '';
    const nf = normFamily(family || '');
    if (nf.length === 0)
        return '';
    const normalizedWeight = normalizeFontWeight(weight || '');
    const sameFamily = lib
        .map((font) => ({ font, sim: familySimilarity(nf, font.norm) }))
        .filter((item) => item.sim >= MIN_FAMILY_SIM)
        .sort((a, b) => b.sim - a.sim);
    if (sameFamily.length === 0)
        return '';
    const incompatible = sameFamily.filter((item) => !isWeightCompatible(item.font, normalizedWeight));
    if (incompatible.length === 0)
        return '';
    const target = fontWeightValue(normalizedWeight);
    const details = incompatible.slice(0, 3).map(({ font }) => {
        const actual = actualFontWeight(font);
        return `${font.fileName}${actual ? `(${actual})` : ''}`;
    }).join(', ');
    return `同族字体存在但字重不兼容：需要 ${normalizedWeight}(${target})，现有 ${details}`;
}
// ───────────────────────────────── 字体族归一化 / 相似度（照搬 Unity FigmaTextStyleTable.cs）
/** @zh 归一化：小写 + 只留字母数字/中日韩字（去空格/连字符/下划线/点），使 "FZCuYuan-M03S"≈"FZCuYuanM03S"。 */
function normFamily(s) {
    if (!s)
        return '';
    let out = '';
    for (const ch of s.trim().toLowerCase()) {
        if (/[a-z0-9一-鿿]/.test(ch))
            out += ch;
    }
    return out;
}
/** @zh 标准化字体文件名：移除 SDF/分隔符，统一常见字重同义词。 */
function formatFontName(name) {
    if (!name)
        return '';
    let result = name
        .replace(/sdf/ig, '')
        .replace(/[\s._-]+/g, '')
        .toLowerCase();
    result = result
        .replace(/hairline/g, 'thin')
        .replace(/ultralight/g, 'extralight')
        .replace(/normal/g, 'regular')
        .replace(/plain/g, 'regular')
        .replace(/roman/g, 'regular')
        .replace(/ultrabold/g, 'extrabold')
        .replace(/heavy/g, 'black')
        .replace(/ultra/g, 'extra')
        .replace(/demi/g, 'semi');
    return result;
}
/** @zh 标准化 Figma fontWeight/style，如 "Bold Italic" → "Bold"。 */
function normalizeFontWeight(weight) {
    if (!weight)
        return 'Regular';
    const w = weight.replace(/italic/ig, '').trim();
    if (/^[1-9]00$/.test(w)) {
        const n = Number(w);
        if (n >= 900)
            return 'Black';
        if (n >= 800)
            return 'ExtraBold';
        if (n >= 700)
            return 'Bold';
        if (n >= 600)
            return 'SemiBold';
        if (n >= 500)
            return 'Medium';
        if (n <= 200)
            return 'ExtraLight';
        if (n <= 300)
            return 'Light';
    }
    return w || 'Regular';
}
function isWeightCompatible(font, normalizedWeight) {
    const target = fontWeightValue(normalizedWeight);
    const actual = actualFontWeight(font);
    if (actual == null)
        return true;
    // Figma 的 Regular/Medium 不应命中 Heavy/Black 变体；Bold 系列也不应命中 Regular 文件后再强行变粗。
    return target >= 600 ? actual >= 600 : actual < 600;
}
function isRealWeightMatch(font, normalizedWeight) {
    const target = fontWeightValue(normalizedWeight);
    const actual = actualFontWeight(font);
    if (actual == null) {
        const w = formatFontName(normalizedWeight);
        return !!w && font.formatted.includes(w);
    }
    return target >= 600 ? actual >= 600 : actual < 600;
}
function actualFontWeight(font) {
    if (typeof font.weightClass === 'number' && font.weightClass > 0)
        return font.weightClass;
    return inferWeightClass(`${font.formatted} ${font.internalStyle}`);
}
function fontWeightValue(normalizedWeight) {
    const w = formatFontName(normalizedWeight);
    if (w.includes('black'))
        return 900;
    if (w.includes('extrabold'))
        return 800;
    if (w.includes('bold'))
        return 700;
    if (w.includes('semibold'))
        return 600;
    if (w.includes('medium'))
        return 500;
    if (w.includes('light') && !w.includes('extra'))
        return 300;
    if (w.includes('extralight') || w.includes('thin'))
        return 200;
    return 400;
}
function inferWeightClass(text) {
    const formatted = formatFontName(text);
    const wght = /wght([1-9][0-9]{2})/.exec(formatted);
    if (wght)
        return Number(wght[1]);
    if (formatted.includes('black'))
        return 900;
    if (formatted.includes('extrabold'))
        return 800;
    if (formatted.includes('bold'))
        return 700;
    if (formatted.includes('semibold'))
        return 600;
    if (formatted.includes('medium'))
        return 500;
    if (formatted.includes('regular'))
        return 400;
    if (formatted.includes('light') && !formatted.includes('extra'))
        return 300;
    if (formatted.includes('extralight') || formatted.includes('thin'))
        return 200;
    return null;
}
/** @zh 两个已归一化字体族名的相似度 0~1：相等=1；互相包含=0.85；否则按编辑距离折算。 */
function familySimilarity(a, b) {
    if (a.length === 0 || b.length === 0)
        return 0;
    if (a === b)
        return 1;
    if (a.includes(b) || b.includes(a))
        return 0.85;
    const dist = levenshtein(a, b);
    const max = Math.max(a.length, b.length);
    return max === 0 ? 0 : clamp01(1 - dist / max);
}
function levenshtein(a, b) {
    const n = a.length, m = b.length;
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
function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
function hasImportedFontAlternative(skipped, lib) {
    if (!skipped.formatted)
        return false;
    return lib.some((font) => font.formatted.includes(skipped.formatted) ||
        skipped.formatted.includes(font.formatted));
}
/** @zh 取文件名主干（去目录 + 去扩展名）。 */
function baseName(pathOrName) {
    if (!pathOrName)
        return '';
    const slash = Math.max(pathOrName.lastIndexOf('/'), pathOrName.lastIndexOf('\\'));
    let s = slash >= 0 ? pathOrName.slice(slash + 1) : pathOrName;
    const dot = s.lastIndexOf('.');
    if (dot > 0)
        s = s.slice(0, dot);
    return s;
}
function resolveFontAssetPath(asset, assetName, fileName) {
    const candidates = [];
    for (const value of [asset.url, asset.source, asset.file, asset.path, assetName]) {
        if (typeof value !== 'string' || !value)
            continue;
        if (value.startsWith('db://assets/')) {
            const p = dbUrlToAssetPath(value);
            if (p)
                candidates.push(p);
        }
        else if (value.startsWith('/')) {
            candidates.push(value);
        }
    }
    const projectPath = Editor.Project && Editor.Project.path;
    if (projectPath && fileName) {
        for (const ext of ['.ttf', '.otf', '.ttc']) {
            candidates.push((0, path_1.join)(projectPath, 'assets', 'figma-fonts', fileName + ext));
        }
    }
    for (const p of candidates) {
        if ((0, fs_1.existsSync)(p))
            return p;
    }
    return null;
}
function dbUrlToAssetPath(dbUrl) {
    if (!dbUrl.startsWith('db://assets/'))
        return null;
    const projectPath = Editor.Project && Editor.Project.path;
    if (!projectPath)
        return null;
    return (0, path_1.join)(projectPath, 'assets', dbUrl.slice('db://assets/'.length));
}
function readFontMeta(path) {
    if (!path)
        return { weightClass: null, internalStyle: '' };
    try {
        const bytes = (0, fs_1.readFileSync)(path);
        const tables = readSfntTables(bytes);
        const names = tables.name != null ? readNameRecords(bytes, tables.name) : [];
        const os2Weight = tables['OS/2'] != null && tables['OS/2'] + 6 <= bytes.length
            ? bytes.readUInt16BE(tables['OS/2'] + 4)
            : null;
        const style = uniqueStrings(names
            .filter((n) => n.id === 2 || n.id === 17)
            .map((n) => n.value)).join(' ');
        return {
            weightClass: os2Weight || inferWeightClass(style) || inferWeightClass(names.map((n) => n.value).join(' ')),
            internalStyle: style,
        };
    }
    catch (_a) {
        return { weightClass: null, internalStyle: '' };
    }
}
function readSfntTables(bytes) {
    const tables = {};
    if (bytes.length < 12)
        return tables;
    const count = bytes.readUInt16BE(4);
    for (let i = 0; i < count; i++) {
        const off = 12 + i * 16;
        if (off + 16 > bytes.length)
            break;
        const tag = bytes.toString('ascii', off, off + 4);
        tables[tag] = bytes.readUInt32BE(off + 8);
    }
    return tables;
}
function readNameRecords(bytes, tableOffset) {
    const out = [];
    if (tableOffset + 6 > bytes.length)
        return out;
    const count = bytes.readUInt16BE(tableOffset + 2);
    const stringOffset = tableOffset + bytes.readUInt16BE(tableOffset + 4);
    for (let i = 0; i < count; i++) {
        const off = tableOffset + 6 + i * 12;
        if (off + 12 > bytes.length)
            break;
        const platform = bytes.readUInt16BE(off);
        const id = bytes.readUInt16BE(off + 6);
        const len = bytes.readUInt16BE(off + 8);
        const pos = stringOffset + bytes.readUInt16BE(off + 10);
        if (pos < 0 || pos + len > bytes.length)
            continue;
        const raw = bytes.subarray(pos, pos + len);
        const value = decodeNameString(raw, platform).trim();
        if (value)
            out.push({ id, value });
    }
    return out;
}
function decodeNameString(bytes, platform) {
    if (platform === 0 || platform === 3) {
        let out = '';
        for (let i = 0; i + 1 < bytes.length; i += 2) {
            out += String.fromCharCode(bytes.readUInt16BE(i));
        }
        return out;
    }
    return bytes.toString('latin1');
}
function uniqueStrings(values) {
    return Array.from(new Set(values.filter(Boolean)));
}
/**
 * @en Accumulate font demand across a tree. Call recordDemand per TEXT node, then buildReport.
 * @zh 跨整棵树累计字体需求：每个 TEXT 节点调 recordDemand，最后 buildReport 汇总成清单。
 *     命中库里的不计入缺失；未命中的按「字体族+字重」聚合计数。插件不下载、不获取——只告诉你缺什么。
 */
class FontDemandTracker {
    constructor() {
        this.missing = new Map();
        this.defaultFallback = new Map();
        this.matchedCount = 0;
    }
    /** @zh 记一个文本节点的字体需求；matched=是否已在库里命中。 */
    recordDemand(family, weight, matched, reason) {
        if (matched) {
            this.matchedCount++;
            return;
        }
        const fam = (family || '').trim();
        if (!fam)
            return; // 无字体名不算缺失（走默认字体）
        if (ACCEPTED_DEFAULT_FALLBACK_FAMILIES.has(fam.toLowerCase())) {
            this.recordDefaultFallback(fam, weight);
            return;
        }
        const key = fam.toLowerCase() + '|' + (weight || '').toLowerCase();
        const existing = this.missing.get(key);
        if (existing) {
            existing.count++;
            if (!existing.reason && reason)
                existing.reason = reason;
            return;
        }
        this.missing.set(key, { family: fam, weight: weight || '', count: 1, reason });
    }
    recordDefaultFallback(family, weight) {
        const key = family.toLowerCase() + '|' + (weight || '').toLowerCase();
        const existing = this.defaultFallback.get(key);
        if (existing) {
            existing.count++;
            return;
        }
        this.defaultFallback.set(key, { family, weight: weight || '', count: 1 });
    }
    /** @zh 是否有缺失字体。 */
    hasMissing() {
        return this.missing.size > 0;
    }
    /** @zh 命中的文本节点数（用于摘要）。 */
    getMatchedCount() {
        return this.matchedCount;
    }
    getDefaultFallbackCount() {
        let count = 0;
        for (const item of this.defaultFallback.values())
            count += item.count;
        return count;
    }
    getDefaultFallback() {
        return Array.from(this.defaultFallback.values()).sort((a, b) => b.count - a.count);
    }
    /** @zh 缺失需求列表（按用量降序）。 */
    getMissing() {
        return Array.from(this.missing.values()).sort((a, b) => b.count - a.count);
    }
}
exports.FontDemandTracker = FontDemandTracker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9udGxpYi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9mb250bGliLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQXFEQSwwQ0EyREM7QUFRRCw4QkE4RUM7QUFFRCwwQ0F3QkM7QUFoT0Q7Ozs7Ozs7Ozs7OztHQVlHO0FBQ0gsMkJBQThDO0FBQzlDLCtCQUE0QjtBQUM1Qix1Q0FBd0U7QUFFeEUseURBQXlEO0FBQzVDLFFBQUEsWUFBWSxHQUFHLHlCQUF5QixDQUFDO0FBRXRELHFFQUFxRTtBQUNyRSxNQUFNLGNBQWMsR0FBRyxHQUFHLENBQUM7QUFFM0IscURBQXFEO0FBQ3JELE1BQU0sa0NBQWtDLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDL0MsbUJBQW1CO0NBQ3RCLENBQUMsQ0FBQztBQXVCSDs7O0dBR0c7QUFDSSxLQUFLLFVBQVUsZUFBZTtJQUNqQyxJQUFJLE1BQU0sR0FBVSxFQUFFLENBQUM7SUFDdkIsSUFBSSxDQUFDO1FBQ0QscURBQXFEO1FBQ3JELE1BQU0sT0FBTyxHQUFHLEdBQUcsb0JBQVksT0FBTyxDQUFDO1FBQ3ZDLE1BQU0sR0FBRyxNQUFNLElBQUEsd0JBQWMsRUFBQyxjQUFjLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDMUUsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDWCxJQUFBLHFDQUEyQixFQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pDLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDL0QsT0FBTyxFQUFFLENBQUM7SUFDZCxDQUFDO0lBQ0QsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDO1FBQUUsT0FBTyxFQUFFLENBQUM7SUFFdEMsTUFBTSxHQUFHLEdBQW1CLEVBQUUsQ0FBQztJQUMvQixNQUFNLGVBQWUsR0FBMkIsRUFBRSxDQUFDO0lBQ25ELEtBQUss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biAqIEBlbiBGb250IHN0eWxlIGxpYnJhcnkgKHN0YWdlIDUpOiBzY2FuIGRiOi8vYXNzZXRzL2ZpZ21hLWZvbnRzLyBhbmQgbWF0Y2ggYSBGaWdtYVxuICogICAgIGZvbnQgZmFtaWx5K3dlaWdodCB0byBhIGJ1bmRsZWQgZm9udCBhc3NldCBieSBmYW1pbHkgc2ltaWxhcml0eS5cbiAqIEB6aCDlrZfkvZPmoLflvI/lupPvvIjpmLbmrrUgNe+8ie+8muaJq+aPjyBkYjovL2Fzc2V0cy9maWdtYS1mb250cy8g5LiL55qE5a2X5L2T6LWE5rqQ77yM5oyJ44CM5a2X5L2T5peP55u45Ly85bqm44CNXG4gKiAgICAg5oqKIEZpZ21hIOeahCBmb250RmFtaWx5K2ZvbnRXZWlnaHQg5Yy56YWN5Yiw5bel56iL6YeM5aSH5aW955qE5a2X5L2T6LWE5rqQ77yM5ZG95Lit6L+U5Zue5YW2IHV1aWTjgIJcbiAqXG4gKiDlj6rlnKjkuLvov5vnqIvot5HvvIjopoHmn6UgYXNzZXQtZGLvvInjgILljLnphY3nrpfms5XnhafmkKwgVW5pdHkgRmlnbWFUZXh0U3R5bGVUYWJsZS5jcyDnmoRcbiAqIE5vcm1GYW1pbHkgLyBGYW1pbHlTaW1pbGFyaXR5IC8gTGV2ZW5zaHRlaW4gLyBOb3JtYWxpemVXZWlnaHQg4oCU4oCUIOi3qOW8leaTjuWQjOaehO+8jOS+v+S6juWPjOerr+e7tOaKpOOAglxuICpcbiAqIOS4jiBVbml0eSDnmoTlt67lvILvvIjmnInmhI/kuLrkuYvvvInvvJpVbml0eSDpnaDnvo7mnK/pooTphY0gVE1QIOaooeadvyArIOWFi+mahuadkOi0qO+8iOWboCBUTVAg5o+P6L65L+WPkeWFieaYr+adkOi0qO+8jFxuICog5peg5rOV5LuOIEpTT04g55Sf5oiQ77yJ77ybQ29jb3Mg55qE5o+P6L65L+aKleW9seaYr+e7hOS7tuOAgeWPr+ebtOaOpeS7jiBGaWdtYSBzdHJva2VzL2VmZmVjdHMg55Sf5oiQ77yMXG4gKiDmiYDku6XmoLflvI/lupPov5nph4zlj6rop6PlhrPjgIzlrZfkvZPml48g4oaSIOWtl+S9k+aWh+S7tuOAjei/meS4gOWxgu+8jOaPj+i+uS/mipXlvbHlnKggc2NlbmUudHMg6YeM6Ieq5Yqo5rS+55Sf44CCXG4gKi9cbmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbmltcG9ydCB7IHJlcXVlc3RBc3NldERiLCByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUgfSBmcm9tICcuL2Fzc2V0ZGInO1xuXG4vKiogQHpoIOWtl+S9k+W6k+e6puWumuebruW9le+8muaKiiBUVEYvT1RGL0JNRm9udCDmlL7ov5nph4zvvIzmlofku7blkI3vvIjkuI3lkKvmianlsZXlkI3vvIk9IOWtl+S9k+aXj+WQjeOAgiAqL1xuZXhwb3J0IGNvbnN0IEZPTlRfTElCX0RJUiA9ICdkYjovL2Fzc2V0cy9maWdtYS1mb250cyc7XG5cbi8qKiBAemgg5a2X5L2T5peP5pyA5L2O55u45Ly85bqm6Zeo5qeb77ya5L2O5LqO5q2k5YC86KeG5Li644CM5LiN5piv5ZCM5LiA5a2X5L2T44CN77yM5Zue6YCA6buY6K6k5a2X5L2T77yI5a+56b2QIFVuaXR5IEZ1enp5TWluRmFtaWx577yJ44CCICovXG5jb25zdCBNSU5fRkFNSUxZX1NJTSA9IDAuNTtcblxuLyoqIEB6aCDov5nkupsgRmlnbWEg5a2X5L2T5piO56Gu5o6l5Y+X5L2/55SoIENvY29zIOm7mOiupOWtl+S9k+WbnumAgO+8jOS4jeWGjeS9nOS4uue8uuWksemcgOaxguaPkOekuuOAgiAqL1xuY29uc3QgQUNDRVBURURfREVGQVVMVF9GQUxMQkFDS19GQU1JTElFUyA9IG5ldyBTZXQoW1xuICAgICd6aWh1bmJpbmdtZWlzaGlfdCcsXG5dKTtcblxuZXhwb3J0IGludGVyZmFjZSBGb250TGliRW50cnkge1xuICAgIC8qKiBAemgg5a2X5L2T6LWE5rqQIHV1aWTvvIhjYy5Gb25077yaVFRGRm9udC9CaXRtYXBGb250IOetie+8jOWPr+ebtOaOpee7mSBMYWJlbC5mb250IOeUqO+8iSAqL1xuICAgIHV1aWQ6IHN0cmluZztcbiAgICAvKiogQHpoIOWOn+Wni+aWh+S7tuWQje+8iOS4jeWQq+aJqeWxleWQje+8ie+8jOS7heaXpeW/l+eUqCAqL1xuICAgIGZpbGVOYW1lOiBzdHJpbmc7XG4gICAgLyoqIEB6aCDlvZLkuIDljJblkI7nmoTlrZfkvZPml4/lkI3vvIjljLnphY3plK7vvIkgKi9cbiAgICBub3JtOiBzdHJpbmc7XG4gICAgLyoqIEB6aCBVbml0eSDlkIzmrL7moLzlvI/ljJblkI3vvJrnlKjkuo4gZmFtaWx5K3dlaWdodCDnsr7noa4v5YyF5ZCr5Yy56YWNICovXG4gICAgZm9ybWF0dGVkOiBzdHJpbmc7XG4gICAgLyoqIEB6aCDlrZfkvZPmlofku7blhoXpg6ggT1MvMiB1c1dlaWdodENsYXNz44CC55So5LqO6YG/5YWNIFJlZ3VsYXIg6ZSZ6YWN5YiwIEhlYXZ5L0JsYWNrIOWPmOS9k+OAgiAqL1xuICAgIHdlaWdodENsYXNzOiBudW1iZXIgfCBudWxsO1xuICAgIC8qKiBAemgg5a2X5L2T5paH5Lu25YaF6YOoIHN0eWxlL3N1YmZhbWlsee+8jOS7heaXpeW/l+WSjOiwg+ivleeUqOOAgiAqL1xuICAgIGludGVybmFsU3R5bGU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFNraXBwZWRGb250TGlrZUFzc2V0IHtcbiAgICBmaWxlTmFtZTogc3RyaW5nO1xuICAgIGZvcm1hdHRlZDogc3RyaW5nO1xuICAgIHR5cGU6IHN0cmluZztcbn1cblxuLyoqXG4gKiBAZW4gU2NhbiB0aGUgZm9udCBsaWJyYXJ5IGRpciBmb3IgZm9udCBhc3NldHMuIFJldHVybnMgW10gaWYgdGhlIGRpciBpcyBhYnNlbnQuXG4gKiBAemgg5omr5o+P5a2X5L2T5bqT55uu5b2V6YeM55qE5a2X5L2T6LWE5rqQ44CC55uu5b2V5LiN5a2Y5Zyo6L+U5ZueIFtd77yI5a+85YWl54Wn5bi46LWw6buY6K6k5a2X5L2T77yJ44CCXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzY2FuRm9udExpYnJhcnkoKTogUHJvbWlzZTxGb250TGliRW50cnlbXT4ge1xuICAgIGxldCBhc3NldHM6IGFueVtdID0gW107XG4gICAgdHJ5IHtcbiAgICAgICAgLy8gcGF0dGVybiDlvaLlvI/pmo/niYjmnKznlaXmnInlt67lvILvvIznlKggZGI6Ly8g6YCa6YWN5oqT6K+l55uu5b2V5YWo6YOo6LWE5rqQ77yM5YaN5oyJIGZvbnQg57G75Z6L6L+H5ruk44CCXG4gICAgICAgIGNvbnN0IHBhdHRlcm4gPSBgJHtGT05UX0xJQl9ESVJ9LyoqLypgO1xuICAgICAgICBhc3NldHMgPSBhd2FpdCByZXF1ZXN0QXNzZXREYigncXVlcnktYXNzZXRzJywgcGF0dGVybiwgW3sgcGF0dGVybiB9XSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldGhyb3dJZkFzc2V0RGJVbmF2YWlsYWJsZShlcnIpO1xuICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g5omr5o+P5a2X5L2T5bqT5aSx6LSl77yI5Y+v6IO955uu5b2V5LiN5a2Y5Zyo77yJ77yM5Zue6YCA6buY6K6k5a2X5L2TOicsIGVycik7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGFzc2V0cykpIHJldHVybiBbXTtcblxuICAgIGNvbnN0IGxpYjogRm9udExpYkVudHJ5W10gPSBbXTtcbiAgICBjb25zdCBza2lwcGVkRm9udExpa2U6IFNraXBwZWRGb250TGlrZUFzc2V0W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGEgb2YgYXNzZXRzKSB7XG4gICAgICAgIGlmICghYSB8fCAhYS51dWlkKSBjb250aW51ZTtcbiAgICAgICAgLy8g5Y+q6KaBIENvY29zIOW3suivhuWIq+S4uuWtl+S9k+eahOi1hOa6kOOAguS4jeimgeS7heWHrSAudHRmLy5vdGYg5omp5bGV5ZCN57qz5YWl77yaXG4gICAgICAgIC8vIOacquiiqyB0dGYtZm9udCBpbXBvcnRlciDmjqXnrqHnmoTmlofku7bkvJrku6UgY2MuQXNzZXQg6L295YWl77yM6LWL57uZIExhYmVsLmZvbnQg5ZCO6KGo546w5LiN56iz5a6a44CCXG4gICAgICAgIGNvbnN0IHR5cGUgPSBgJHthLnR5cGUgfHwgJyd9ICR7YS5pbXBvcnRlciB8fCAnJ31gLnRyaW0oKTtcbiAgICAgICAgY29uc3QgaXNGb250ID0gL2ZvbnQvaS50ZXN0KHR5cGUpO1xuICAgICAgICBpZiAoIWlzRm9udCkge1xuICAgICAgICAgICAgY29uc3QgYXNzZXROYW1lID0gYS51cmwgfHwgYS5zb3VyY2UgfHwgYS5uYW1lIHx8ICcnO1xuICAgICAgICAgICAgaWYgKC9cXC4odHRmfG90Znx0dGN8d29mZjI/KSQvaS50ZXN0KGFzc2V0TmFtZSkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlTmFtZSA9IGJhc2VOYW1lKGFzc2V0TmFtZSk7XG4gICAgICAgICAgICAgICAgc2tpcHBlZEZvbnRMaWtlLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBmaWxlTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGVkOiBmb3JtYXRGb250TmFtZShmaWxlTmFtZSksXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IHR5cGUgfHwgJ3Vua25vd24gaW1wb3J0ZXInLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhc3NldE5hbWUgPSBhLnVybCB8fCBhLnNvdXJjZSB8fCBhLm5hbWUgfHwgJyc7XG4gICAgICAgIGNvbnN0IGZpbGVOYW1lID0gYmFzZU5hbWUoYS5uYW1lIHx8IGEudXJsIHx8IGEuc291cmNlIHx8ICcnKTtcbiAgICAgICAgY29uc3QgbWV0YSA9IHJlYWRGb250TWV0YShyZXNvbHZlRm9udEFzc2V0UGF0aChhLCBhc3NldE5hbWUsIGZpbGVOYW1lKSk7XG4gICAgICAgIGxpYi5wdXNoKHtcbiAgICAgICAgICAgIHV1aWQ6IGEudXVpZCxcbiAgICAgICAgICAgIGZpbGVOYW1lLFxuICAgICAgICAgICAgbm9ybTogbm9ybUZhbWlseShmaWxlTmFtZSksXG4gICAgICAgICAgICBmb3JtYXR0ZWQ6IGZvcm1hdEZvbnROYW1lKGZpbGVOYW1lKSxcbiAgICAgICAgICAgIHdlaWdodENsYXNzOiBtZXRhLndlaWdodENsYXNzLFxuICAgICAgICAgICAgaW50ZXJuYWxTdHlsZTogbWV0YS5pbnRlcm5hbFN0eWxlLFxuICAgICAgICB9KTtcbiAgICB9XG4gICAgY29uc29sZS5sb2coYFtmaWdtYS1pbXBvcnRlcl0g5a2X5L2T5bqT5omr5o+P5YiwICR7bGliLmxlbmd0aH0g5Liq5a2X5L2T6LWE5rqQ44CCYCk7XG4gICAgaWYgKHNraXBwZWRGb250TGlrZS5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHNraXBwZWRXaXRob3V0QWx0ZXJuYXRpdmUgPSBza2lwcGVkRm9udExpa2UuZmlsdGVyKChzKSA9PiAhaGFzSW1wb3J0ZWRGb250QWx0ZXJuYXRpdmUocywgbGliKSk7XG4gICAgICAgIGNvbnN0IHNraXBwZWRXaXRoQWx0ZXJuYXRpdmUgPSBza2lwcGVkRm9udExpa2UubGVuZ3RoIC0gc2tpcHBlZFdpdGhvdXRBbHRlcm5hdGl2ZS5sZW5ndGg7XG4gICAgICAgIGlmIChza2lwcGVkV2l0aEFsdGVybmF0aXZlID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFtmaWdtYS1pbXBvcnRlcl0g5bey5b+955WlICR7c2tpcHBlZFdpdGhBbHRlcm5hdGl2ZX0g5Liq5pyq6KKrIENvY29zIOivhuWIq+S4uuWtl+S9k+OAgeS9huW3suacieWPr+eUqOWQjOaXj+Wtl+S9k+eahOaWh+S7tuOAgmApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChza2lwcGVkV2l0aG91dEFsdGVybmF0aXZlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IG5hbWVzID0gc2tpcHBlZFdpdGhvdXRBbHRlcm5hdGl2ZS5tYXAoKHMpID0+IGAke3MuZmlsZU5hbWV9ICgke3MudHlwZX0pYCkuam9pbignLCAnKTtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW2ZpZ21hLWltcG9ydGVyXSDlt7Lot7Pov4cgJHtza2lwcGVkV2l0aG91dEFsdGVybmF0aXZlLmxlbmd0aH0g5Liq5pyq6KKrIENvY29zIOivhuWIq+S4uuWtl+S9k+eahOaWh+S7tu+8miR7bmFtZXN9YCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGxpYi5zb3J0KChhLCBiKSA9PiBhLmZpbGVOYW1lLmxvY2FsZUNvbXBhcmUoYi5maWxlTmFtZSkpO1xufVxuXG4vKipcbiAqIEBlbiBNYXRjaCBhIEZpZ21hIGZhbWlseSt3ZWlnaHQgdG8gYSBsaWJyYXJ5IGZvbnQgdXVpZC4gUmV0dXJucyBudWxsIGlmIG5vdGhpbmcgaXMgY2xvc2UgZW5vdWdoLlxuICogQHpoIOaKiiBGaWdtYSDnmoQgZm9udEZhbWlseSgrZm9udFdlaWdodCDku4Xnu4bliIblkIzliIYpIOWMuemFjeWIsOW6k+mHjOWtl+S9kyB1dWlk44CC5LiN5aSf5YOP6L+U5ZueIG51bGzvvIjlm57pgIDpu5jorqTvvInjgIJcbiAqXG4gKiDor4TliIblr7npvZAgVW5pdHnvvJrlrZfkvZPml4/nm7jkvLzluqbkuLrkuLvvvIjkvY7kuo7pl6jmp5vnm7TmjqXmjpLpmaTvvInvvIzlrZfph43ku4XlnKjlkIzliIbml7bnu4bliIbjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoRm9udChcbiAgICBmYW1pbHk6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICB3ZWlnaHQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBsaWI6IEZvbnRMaWJFbnRyeVtdXG4pOiB7IHV1aWQ6IHN0cmluZzsgZmlsZU5hbWU6IHN0cmluZzsgc2ltOiBudW1iZXI7IHdlaWdodE1hdGNoZWQ6IGJvb2xlYW4gfSB8IG51bGwge1xuICAgIGlmICghbGliIHx8IGxpYi5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IG5mID0gbm9ybUZhbWlseShmYW1pbHkgfHwgJycpO1xuICAgIGlmIChuZi5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgY29uc3QgZmFtaWx5Rm9ybWF0dGVkID0gZm9ybWF0Rm9udE5hbWUoZmFtaWx5IHx8ICcnKTtcbiAgICBjb25zdCBub3JtYWxpemVkV2VpZ2h0ID0gbm9ybWFsaXplRm9udFdlaWdodCh3ZWlnaHQgfHwgJycpO1xuICAgIGNvbnN0IHdlaWdodEZvcm1hdHRlZCA9IGZvcm1hdEZvbnROYW1lKG5vcm1hbGl6ZWRXZWlnaHQpO1xuICAgIGNvbnN0IGZhbWlseVdlaWdodEZvcm1hdHRlZCA9IGZvcm1hdEZvbnROYW1lKGAke2ZhbWlseSB8fCAnJ30tJHtub3JtYWxpemVkV2VpZ2h0fWApO1xuICAgIGNvbnN0IGNvbXBhdGlibGUgPSBsaWIuZmlsdGVyKChlKSA9PiBpc1dlaWdodENvbXBhdGlibGUoZSwgbm9ybWFsaXplZFdlaWdodCkpO1xuXG4gICAgLy8gMSkgZmFtaWx5ICsgd2VpZ2h0IOeyvuehruWMuemFje+8mk5vdG9TYW5zLUJvbGQudHRmIOWvuSBOb3RvU2FucyAvIEJvbGTjgIJcbiAgICBjb25zdCBleGFjdEZhbWlseVdlaWdodCA9IGNvbXBhdGlibGUuZmluZCgoZSkgPT4gZS5mb3JtYXR0ZWQgPT09IGZhbWlseVdlaWdodEZvcm1hdHRlZCk7XG4gICAgaWYgKGV4YWN0RmFtaWx5V2VpZ2h0KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB1dWlkOiBleGFjdEZhbWlseVdlaWdodC51dWlkLFxuICAgICAgICAgICAgZmlsZU5hbWU6IGV4YWN0RmFtaWx5V2VpZ2h0LmZpbGVOYW1lLFxuICAgICAgICAgICAgc2ltOiAxLFxuICAgICAgICAgICAgd2VpZ2h0TWF0Y2hlZDogaXNSZWFsV2VpZ2h0TWF0Y2goZXhhY3RGYW1pbHlXZWlnaHQsIG5vcm1hbGl6ZWRXZWlnaHQpLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIDIpIOWtl+S9k+aWh+S7tuWQjeWQjOaXtuWMheWQqyBmYW1pbHkg5ZKMIHdlaWdodO+8muWFvOWuuSBcIk5vdG9TYW5zIFNDIEJvbGRcIiDnrYnlkb3lkI3jgIJcbiAgICBjb25zdCBmYW1pbHlBbmRXZWlnaHQgPSBjb21wYXRpYmxlXG4gICAgICAgIC5maWx0ZXIoKGUpID0+IGUuZm9ybWF0dGVkLmluY2x1ZGVzKGZhbWlseUZvcm1hdHRlZCkgJiYgZS5mb3JtYXR0ZWQuaW5jbHVkZXMod2VpZ2h0Rm9ybWF0dGVkKSlcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGZhbWlseVNpbWlsYXJpdHkobmYsIGIubm9ybSkgLSBmYW1pbHlTaW1pbGFyaXR5KG5mLCBhLm5vcm0pKVswXTtcbiAgICBpZiAoZmFtaWx5QW5kV2VpZ2h0KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB1dWlkOiBmYW1pbHlBbmRXZWlnaHQudXVpZCxcbiAgICAgICAgICAgIGZpbGVOYW1lOiBmYW1pbHlBbmRXZWlnaHQuZmlsZU5hbWUsXG4gICAgICAgICAgICBzaW06IGZhbWlseVNpbWlsYXJpdHkobmYsIGZhbWlseUFuZFdlaWdodC5ub3JtKSxcbiAgICAgICAgICAgIHdlaWdodE1hdGNoZWQ6IGlzUmVhbFdlaWdodE1hdGNoKGZhbWlseUFuZFdlaWdodCwgbm9ybWFsaXplZFdlaWdodCksXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gMykgZmFtaWx5IOeyvuehruWMuemFje+8muacieS6m+W6k+WPquaPkOS+myBOb3RvU2Fucy50dGbvvIzlrZfph43pnaAgTGFiZWwuaXNCb2xkIOWQiOaIkOOAglxuICAgIGNvbnN0IGV4YWN0RmFtaWx5ID0gY29tcGF0aWJsZS5maW5kKChlKSA9PiBlLmZvcm1hdHRlZCA9PT0gZmFtaWx5Rm9ybWF0dGVkKTtcbiAgICBpZiAoZXhhY3RGYW1pbHkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHV1aWQ6IGV4YWN0RmFtaWx5LnV1aWQsXG4gICAgICAgICAgICBmaWxlTmFtZTogZXhhY3RGYW1pbHkuZmlsZU5hbWUsXG4gICAgICAgICAgICBzaW06IDEsXG4gICAgICAgICAgICB3ZWlnaHRNYXRjaGVkOiBpc1JlYWxXZWlnaHRNYXRjaChleGFjdEZhbWlseSwgbm9ybWFsaXplZFdlaWdodCksXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gNCkgZmFtaWx5IOeyvuehruS9huWtl+mHjSBtZXRhZGF0YSDkuI3lhbzlrrnvvJrku43mr5Tns7vnu5/lrZfkvZPmm7TnrKblkIggRmlnbWHjgIJcbiAgICAvLyDlhbjlnovkvovlrZDvvJpDb21taXNzaW9uZXIudHRmIOWGhemDqCBPUy8yIHdlaWdodCDlgY/pq5jvvIzkvYYgRmlnbWEg5a2X5L2T5peP5bCx5pivIENvbW1pc3Npb25lciBSZWd1bGFy44CCXG4gICAgY29uc3QgZXhhY3RGYW1pbHlBbnlXZWlnaHQgPSBsaWIuZmluZCgoZSkgPT4gZS5mb3JtYXR0ZWQgPT09IGZhbWlseUZvcm1hdHRlZCk7XG4gICAgaWYgKGV4YWN0RmFtaWx5QW55V2VpZ2h0KSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB1dWlkOiBleGFjdEZhbWlseUFueVdlaWdodC51dWlkLFxuICAgICAgICAgICAgZmlsZU5hbWU6IGV4YWN0RmFtaWx5QW55V2VpZ2h0LmZpbGVOYW1lLFxuICAgICAgICAgICAgc2ltOiAxLFxuICAgICAgICAgICAgd2VpZ2h0TWF0Y2hlZDogaXNSZWFsV2VpZ2h0TWF0Y2goZXhhY3RGYW1pbHlBbnlXZWlnaHQsIG5vcm1hbGl6ZWRXZWlnaHQpLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGxldCBiZXN0OiBGb250TGliRW50cnkgfCBudWxsID0gbnVsbDtcbiAgICBsZXQgYmVzdFNpbSA9IC0xO1xuICAgIGZvciAoY29uc3QgZSBvZiBjb21wYXRpYmxlKSB7XG4gICAgICAgIGNvbnN0IHNpbSA9IGZhbWlseVNpbWlsYXJpdHkobmYsIGUubm9ybSk7XG4gICAgICAgIGlmIChzaW0gPiBiZXN0U2ltKSB7XG4gICAgICAgICAgICBiZXN0U2ltID0gc2ltO1xuICAgICAgICAgICAgYmVzdCA9IGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFiZXN0IHx8IGJlc3RTaW0gPCBNSU5fRkFNSUxZX1NJTSkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdXVpZDogYmVzdC51dWlkLFxuICAgICAgICBmaWxlTmFtZTogYmVzdC5maWxlTmFtZSxcbiAgICAgICAgc2ltOiBiZXN0U2ltLFxuICAgICAgICB3ZWlnaHRNYXRjaGVkOiBpc1JlYWxXZWlnaHRNYXRjaChiZXN0LCBub3JtYWxpemVkV2VpZ2h0KSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwbGFpbkZvbnRNaXNzKFxuICAgIGZhbWlseTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgIHdlaWdodDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuICAgIGxpYjogRm9udExpYkVudHJ5W11cbik6IHN0cmluZyB7XG4gICAgaWYgKCFsaWIgfHwgbGliLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnO1xuICAgIGNvbnN0IG5mID0gbm9ybUZhbWlseShmYW1pbHkgfHwgJycpO1xuICAgIGlmIChuZi5sZW5ndGggPT09IDApIHJldHVybiAnJztcbiAgICBjb25zdCBub3JtYWxpemVkV2VpZ2h0ID0gbm9ybWFsaXplRm9udFdlaWdodCh3ZWlnaHQgfHwgJycpO1xuICAgIGNvbnN0IHNhbWVGYW1pbHkgPSBsaWJcbiAgICAgICAgLm1hcCgoZm9udCkgPT4gKHsgZm9udCwgc2ltOiBmYW1pbHlTaW1pbGFyaXR5KG5mLCBmb250Lm5vcm0pIH0pKVxuICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnNpbSA+PSBNSU5fRkFNSUxZX1NJTSlcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc2ltIC0gYS5zaW0pO1xuICAgIGlmIChzYW1lRmFtaWx5Lmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnO1xuXG4gICAgY29uc3QgaW5jb21wYXRpYmxlID0gc2FtZUZhbWlseS5maWx0ZXIoKGl0ZW0pID0+ICFpc1dlaWdodENvbXBhdGlibGUoaXRlbS5mb250LCBub3JtYWxpemVkV2VpZ2h0KSk7XG4gICAgaWYgKGluY29tcGF0aWJsZS5sZW5ndGggPT09IDApIHJldHVybiAnJztcblxuICAgIGNvbnN0IHRhcmdldCA9IGZvbnRXZWlnaHRWYWx1ZShub3JtYWxpemVkV2VpZ2h0KTtcbiAgICBjb25zdCBkZXRhaWxzID0gaW5jb21wYXRpYmxlLnNsaWNlKDAsIDMpLm1hcCgoeyBmb250IH0pID0+IHtcbiAgICAgICAgY29uc3QgYWN0dWFsID0gYWN0dWFsRm9udFdlaWdodChmb250KTtcbiAgICAgICAgcmV0dXJuIGAke2ZvbnQuZmlsZU5hbWV9JHthY3R1YWwgPyBgKCR7YWN0dWFsfSlgIDogJyd9YDtcbiAgICB9KS5qb2luKCcsICcpO1xuICAgIHJldHVybiBg5ZCM5peP5a2X5L2T5a2Y5Zyo5L2G5a2X6YeN5LiN5YW85a6577ya6ZyA6KaBICR7bm9ybWFsaXplZFdlaWdodH0oJHt0YXJnZXR9Ke+8jOeOsOaciSAke2RldGFpbHN9YDtcbn1cblxuLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAIOWtl+S9k+aXj+W9kuS4gOWMliAvIOebuOS8vOW6pu+8iOeFp+aQrCBVbml0eSBGaWdtYVRleHRTdHlsZVRhYmxlLmNz77yJXG5cbi8qKiBAemgg5b2S5LiA5YyW77ya5bCP5YaZICsg5Y+q55WZ5a2X5q+N5pWw5a2XL+S4reaXpemfqeWtl++8iOWOu+epuuagvC/ov57lrZfnrKYv5LiL5YiS57q/L+eCue+8ie+8jOS9vyBcIkZaQ3VZdWFuLU0wM1NcIuKJiFwiRlpDdVl1YW5NMDNTXCLjgIIgKi9cbmZ1bmN0aW9uIG5vcm1GYW1pbHkoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBpZiAoIXMpIHJldHVybiAnJztcbiAgICBsZXQgb3V0ID0gJyc7XG4gICAgZm9yIChjb25zdCBjaCBvZiBzLnRyaW0oKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgIGlmICgvW2EtejAtOeS4gC3pv79dLy50ZXN0KGNoKSkgb3V0ICs9IGNoO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufVxuXG4vKiogQHpoIOagh+WHhuWMluWtl+S9k+aWh+S7tuWQje+8muenu+mZpCBTREYv5YiG6ZqU56ym77yM57uf5LiA5bi46KeB5a2X6YeN5ZCM5LmJ6K+N44CCICovXG5mdW5jdGlvbiBmb3JtYXRGb250TmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICAgIGxldCByZXN1bHQgPSBuYW1lXG4gICAgICAgIC5yZXBsYWNlKC9zZGYvaWcsICcnKVxuICAgICAgICAucmVwbGFjZSgvW1xccy5fLV0rL2csICcnKVxuICAgICAgICAudG9Mb3dlckNhc2UoKTtcbiAgICByZXN1bHQgPSByZXN1bHRcbiAgICAgICAgLnJlcGxhY2UoL2hhaXJsaW5lL2csICd0aGluJylcbiAgICAgICAgLnJlcGxhY2UoL3VsdHJhbGlnaHQvZywgJ2V4dHJhbGlnaHQnKVxuICAgICAgICAucmVwbGFjZSgvbm9ybWFsL2csICdyZWd1bGFyJylcbiAgICAgICAgLnJlcGxhY2UoL3BsYWluL2csICdyZWd1bGFyJylcbiAgICAgICAgLnJlcGxhY2UoL3JvbWFuL2csICdyZWd1bGFyJylcbiAgICAgICAgLnJlcGxhY2UoL3VsdHJhYm9sZC9nLCAnZXh0cmFib2xkJylcbiAgICAgICAgLnJlcGxhY2UoL2hlYXZ5L2csICdibGFjaycpXG4gICAgICAgIC5yZXBsYWNlKC91bHRyYS9nLCAnZXh0cmEnKVxuICAgICAgICAucmVwbGFjZSgvZGVtaS9nLCAnc2VtaScpO1xuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKiBAemgg5qCH5YeG5YyWIEZpZ21hIGZvbnRXZWlnaHQvc3R5bGXvvIzlpoIgXCJCb2xkIEl0YWxpY1wiIOKGkiBcIkJvbGRcIuOAgiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplRm9udFdlaWdodCh3ZWlnaHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKCF3ZWlnaHQpIHJldHVybiAnUmVndWxhcic7XG4gICAgY29uc3QgdyA9IHdlaWdodC5yZXBsYWNlKC9pdGFsaWMvaWcsICcnKS50cmltKCk7XG4gICAgaWYgKC9eWzEtOV0wMCQvLnRlc3QodykpIHtcbiAgICAgICAgY29uc3QgbiA9IE51bWJlcih3KTtcbiAgICAgICAgaWYgKG4gPj0gOTAwKSByZXR1cm4gJ0JsYWNrJztcbiAgICAgICAgaWYgKG4gPj0gODAwKSByZXR1cm4gJ0V4dHJhQm9sZCc7XG4gICAgICAgIGlmIChuID49IDcwMCkgcmV0dXJuICdCb2xkJztcbiAgICAgICAgaWYgKG4gPj0gNjAwKSByZXR1cm4gJ1NlbWlCb2xkJztcbiAgICAgICAgaWYgKG4gPj0gNTAwKSByZXR1cm4gJ01lZGl1bSc7XG4gICAgICAgIGlmIChuIDw9IDIwMCkgcmV0dXJuICdFeHRyYUxpZ2h0JztcbiAgICAgICAgaWYgKG4gPD0gMzAwKSByZXR1cm4gJ0xpZ2h0JztcbiAgICB9XG4gICAgcmV0dXJuIHcgfHwgJ1JlZ3VsYXInO1xufVxuXG5mdW5jdGlvbiBpc1dlaWdodENvbXBhdGlibGUoZm9udDogRm9udExpYkVudHJ5LCBub3JtYWxpemVkV2VpZ2h0OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCB0YXJnZXQgPSBmb250V2VpZ2h0VmFsdWUobm9ybWFsaXplZFdlaWdodCk7XG4gICAgY29uc3QgYWN0dWFsID0gYWN0dWFsRm9udFdlaWdodChmb250KTtcbiAgICBpZiAoYWN0dWFsID09IG51bGwpIHJldHVybiB0cnVlO1xuICAgIC8vIEZpZ21hIOeahCBSZWd1bGFyL01lZGl1bSDkuI3lupTlkb3kuK0gSGVhdnkvQmxhY2sg5Y+Y5L2T77ybQm9sZCDns7vliJfkuZ/kuI3lupTlkb3kuK0gUmVndWxhciDmlofku7blkI7lho3lvLrooYzlj5jnspfjgIJcbiAgICByZXR1cm4gdGFyZ2V0ID49IDYwMCA/IGFjdHVhbCA+PSA2MDAgOiBhY3R1YWwgPCA2MDA7XG59XG5cbmZ1bmN0aW9uIGlzUmVhbFdlaWdodE1hdGNoKGZvbnQ6IEZvbnRMaWJFbnRyeSwgbm9ybWFsaXplZFdlaWdodDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3QgdGFyZ2V0ID0gZm9udFdlaWdodFZhbHVlKG5vcm1hbGl6ZWRXZWlnaHQpO1xuICAgIGNvbnN0IGFjdHVhbCA9IGFjdHVhbEZvbnRXZWlnaHQoZm9udCk7XG4gICAgaWYgKGFjdHVhbCA9PSBudWxsKSB7XG4gICAgICAgIGNvbnN0IHcgPSBmb3JtYXRGb250TmFtZShub3JtYWxpemVkV2VpZ2h0KTtcbiAgICAgICAgcmV0dXJuICEhdyAmJiBmb250LmZvcm1hdHRlZC5pbmNsdWRlcyh3KTtcbiAgICB9XG4gICAgcmV0dXJuIHRhcmdldCA+PSA2MDAgPyBhY3R1YWwgPj0gNjAwIDogYWN0dWFsIDwgNjAwO1xufVxuXG5mdW5jdGlvbiBhY3R1YWxGb250V2VpZ2h0KGZvbnQ6IEZvbnRMaWJFbnRyeSk6IG51bWJlciB8IG51bGwge1xuICAgIGlmICh0eXBlb2YgZm9udC53ZWlnaHRDbGFzcyA9PT0gJ251bWJlcicgJiYgZm9udC53ZWlnaHRDbGFzcyA+IDApIHJldHVybiBmb250LndlaWdodENsYXNzO1xuICAgIHJldHVybiBpbmZlcldlaWdodENsYXNzKGAke2ZvbnQuZm9ybWF0dGVkfSAke2ZvbnQuaW50ZXJuYWxTdHlsZX1gKTtcbn1cblxuZnVuY3Rpb24gZm9udFdlaWdodFZhbHVlKG5vcm1hbGl6ZWRXZWlnaHQ6IHN0cmluZyk6IG51bWJlciB7XG4gICAgY29uc3QgdyA9IGZvcm1hdEZvbnROYW1lKG5vcm1hbGl6ZWRXZWlnaHQpO1xuICAgIGlmICh3LmluY2x1ZGVzKCdibGFjaycpKSByZXR1cm4gOTAwO1xuICAgIGlmICh3LmluY2x1ZGVzKCdleHRyYWJvbGQnKSkgcmV0dXJuIDgwMDtcbiAgICBpZiAody5pbmNsdWRlcygnYm9sZCcpKSByZXR1cm4gNzAwO1xuICAgIGlmICh3LmluY2x1ZGVzKCdzZW1pYm9sZCcpKSByZXR1cm4gNjAwO1xuICAgIGlmICh3LmluY2x1ZGVzKCdtZWRpdW0nKSkgcmV0dXJuIDUwMDtcbiAgICBpZiAody5pbmNsdWRlcygnbGlnaHQnKSAmJiAhdy5pbmNsdWRlcygnZXh0cmEnKSkgcmV0dXJuIDMwMDtcbiAgICBpZiAody5pbmNsdWRlcygnZXh0cmFsaWdodCcpIHx8IHcuaW5jbHVkZXMoJ3RoaW4nKSkgcmV0dXJuIDIwMDtcbiAgICByZXR1cm4gNDAwO1xufVxuXG5mdW5jdGlvbiBpbmZlcldlaWdodENsYXNzKHRleHQ6IHN0cmluZyk6IG51bWJlciB8IG51bGwge1xuICAgIGNvbnN0IGZvcm1hdHRlZCA9IGZvcm1hdEZvbnROYW1lKHRleHQpO1xuICAgIGNvbnN0IHdnaHQgPSAvd2dodChbMS05XVswLTldezJ9KS8uZXhlYyhmb3JtYXR0ZWQpO1xuICAgIGlmICh3Z2h0KSByZXR1cm4gTnVtYmVyKHdnaHRbMV0pO1xuICAgIGlmIChmb3JtYXR0ZWQuaW5jbHVkZXMoJ2JsYWNrJykpIHJldHVybiA5MDA7XG4gICAgaWYgKGZvcm1hdHRlZC5pbmNsdWRlcygnZXh0cmFib2xkJykpIHJldHVybiA4MDA7XG4gICAgaWYgKGZvcm1hdHRlZC5pbmNsdWRlcygnYm9sZCcpKSByZXR1cm4gNzAwO1xuICAgIGlmIChmb3JtYXR0ZWQuaW5jbHVkZXMoJ3NlbWlib2xkJykpIHJldHVybiA2MDA7XG4gICAgaWYgKGZvcm1hdHRlZC5pbmNsdWRlcygnbWVkaXVtJykpIHJldHVybiA1MDA7XG4gICAgaWYgKGZvcm1hdHRlZC5pbmNsdWRlcygncmVndWxhcicpKSByZXR1cm4gNDAwO1xuICAgIGlmIChmb3JtYXR0ZWQuaW5jbHVkZXMoJ2xpZ2h0JykgJiYgIWZvcm1hdHRlZC5pbmNsdWRlcygnZXh0cmEnKSkgcmV0dXJuIDMwMDtcbiAgICBpZiAoZm9ybWF0dGVkLmluY2x1ZGVzKCdleHRyYWxpZ2h0JykgfHwgZm9ybWF0dGVkLmluY2x1ZGVzKCd0aGluJykpIHJldHVybiAyMDA7XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8qKiBAemgg5Lik5Liq5bey5b2S5LiA5YyW5a2X5L2T5peP5ZCN55qE55u45Ly85bqmIDB+Me+8muebuOetiT0x77yb5LqS55u45YyF5ZCrPTAuODXvvJvlkKbliJnmjInnvJbovpHot53nprvmipjnrpfjgIIgKi9cbmZ1bmN0aW9uIGZhbWlseVNpbWlsYXJpdHkoYTogc3RyaW5nLCBiOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIGlmIChhLmxlbmd0aCA9PT0gMCB8fCBiLmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG4gICAgaWYgKGEgPT09IGIpIHJldHVybiAxO1xuICAgIGlmIChhLmluY2x1ZGVzKGIpIHx8IGIuaW5jbHVkZXMoYSkpIHJldHVybiAwLjg1O1xuICAgIGNvbnN0IGRpc3QgPSBsZXZlbnNodGVpbihhLCBiKTtcbiAgICBjb25zdCBtYXggPSBNYXRoLm1heChhLmxlbmd0aCwgYi5sZW5ndGgpO1xuICAgIHJldHVybiBtYXggPT09IDAgPyAwIDogY2xhbXAwMSgxIC0gZGlzdCAvIG1heCk7XG59XG5cbmZ1bmN0aW9uIGxldmVuc2h0ZWluKGE6IHN0cmluZywgYjogc3RyaW5nKTogbnVtYmVyIHtcbiAgICBjb25zdCBuID0gYS5sZW5ndGgsXG4gICAgICAgIG0gPSBiLmxlbmd0aDtcbiAgICBpZiAobiA9PT0gMCkgcmV0dXJuIG07XG4gICAgaWYgKG0gPT09IDApIHJldHVybiBuO1xuICAgIGxldCBwcmV2ID0gbmV3IEFycmF5KG0gKyAxKTtcbiAgICBsZXQgY3VyID0gbmV3IEFycmF5KG0gKyAxKTtcbiAgICBmb3IgKGxldCBqID0gMDsgaiA8PSBtOyBqKyspIHByZXZbal0gPSBqO1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IG47IGkrKykge1xuICAgICAgICBjdXJbMF0gPSBpO1xuICAgICAgICBmb3IgKGxldCBqID0gMTsgaiA8PSBtOyBqKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGNvc3QgPSBhW2kgLSAxXSA9PT0gYltqIC0gMV0gPyAwIDogMTtcbiAgICAgICAgICAgIGN1cltqXSA9IE1hdGgubWluKHByZXZbal0gKyAxLCBjdXJbaiAtIDFdICsgMSwgcHJldltqIC0gMV0gKyBjb3N0KTtcbiAgICAgICAgfVxuICAgICAgICBbcHJldiwgY3VyXSA9IFtjdXIsIHByZXZdO1xuICAgIH1cbiAgICByZXR1cm4gcHJldlttXTtcbn1cblxuZnVuY3Rpb24gY2xhbXAwMSh2OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB2IDwgMCA/IDAgOiB2ID4gMSA/IDEgOiB2O1xufVxuXG5mdW5jdGlvbiBoYXNJbXBvcnRlZEZvbnRBbHRlcm5hdGl2ZShza2lwcGVkOiBTa2lwcGVkRm9udExpa2VBc3NldCwgbGliOiBGb250TGliRW50cnlbXSk6IGJvb2xlYW4ge1xuICAgIGlmICghc2tpcHBlZC5mb3JtYXR0ZWQpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gbGliLnNvbWUoKGZvbnQpID0+XG4gICAgICAgIGZvbnQuZm9ybWF0dGVkLmluY2x1ZGVzKHNraXBwZWQuZm9ybWF0dGVkKSB8fFxuICAgICAgICBza2lwcGVkLmZvcm1hdHRlZC5pbmNsdWRlcyhmb250LmZvcm1hdHRlZClcbiAgICApO1xufVxuXG4vKiogQHpoIOWPluaWh+S7tuWQjeS4u+W5su+8iOWOu+ebruW9lSArIOWOu+aJqeWxleWQje+8ieOAgiAqL1xuZnVuY3Rpb24gYmFzZU5hbWUocGF0aE9yTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBpZiAoIXBhdGhPck5hbWUpIHJldHVybiAnJztcbiAgICBjb25zdCBzbGFzaCA9IE1hdGgubWF4KHBhdGhPck5hbWUubGFzdEluZGV4T2YoJy8nKSwgcGF0aE9yTmFtZS5sYXN0SW5kZXhPZignXFxcXCcpKTtcbiAgICBsZXQgcyA9IHNsYXNoID49IDAgPyBwYXRoT3JOYW1lLnNsaWNlKHNsYXNoICsgMSkgOiBwYXRoT3JOYW1lO1xuICAgIGNvbnN0IGRvdCA9IHMubGFzdEluZGV4T2YoJy4nKTtcbiAgICBpZiAoZG90ID4gMCkgcyA9IHMuc2xpY2UoMCwgZG90KTtcbiAgICByZXR1cm4gcztcbn1cblxuaW50ZXJmYWNlIEZvbnRNZXRhIHtcbiAgICB3ZWlnaHRDbGFzczogbnVtYmVyIHwgbnVsbDtcbiAgICBpbnRlcm5hbFN0eWxlOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVGb250QXNzZXRQYXRoKGFzc2V0OiBhbnksIGFzc2V0TmFtZTogc3RyaW5nLCBmaWxlTmFtZTogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgY2FuZGlkYXRlczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIFthc3NldC51cmwsIGFzc2V0LnNvdXJjZSwgYXNzZXQuZmlsZSwgYXNzZXQucGF0aCwgYXNzZXROYW1lXSkge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUpIGNvbnRpbnVlO1xuICAgICAgICBpZiAodmFsdWUuc3RhcnRzV2l0aCgnZGI6Ly9hc3NldHMvJykpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBkYlVybFRvQXNzZXRQYXRoKHZhbHVlKTtcbiAgICAgICAgICAgIGlmIChwKSBjYW5kaWRhdGVzLnB1c2gocCk7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWUuc3RhcnRzV2l0aCgnLycpKSB7XG4gICAgICAgICAgICBjYW5kaWRhdGVzLnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHByb2plY3RQYXRoID0gKEVkaXRvciBhcyBhbnkpLlByb2plY3QgJiYgKEVkaXRvciBhcyBhbnkpLlByb2plY3QucGF0aDtcbiAgICBpZiAocHJvamVjdFBhdGggJiYgZmlsZU5hbWUpIHtcbiAgICAgICAgZm9yIChjb25zdCBleHQgb2YgWycudHRmJywgJy5vdGYnLCAnLnR0YyddKSB7XG4gICAgICAgICAgICBjYW5kaWRhdGVzLnB1c2goam9pbihwcm9qZWN0UGF0aCwgJ2Fzc2V0cycsICdmaWdtYS1mb250cycsIGZpbGVOYW1lICsgZXh0KSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBwIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgaWYgKGV4aXN0c1N5bmMocCkpIHJldHVybiBwO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZGJVcmxUb0Fzc2V0UGF0aChkYlVybDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCFkYlVybC5zdGFydHNXaXRoKCdkYjovL2Fzc2V0cy8nKSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcHJvamVjdFBhdGggPSAoRWRpdG9yIGFzIGFueSkuUHJvamVjdCAmJiAoRWRpdG9yIGFzIGFueSkuUHJvamVjdC5wYXRoO1xuICAgIGlmICghcHJvamVjdFBhdGgpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBqb2luKHByb2plY3RQYXRoLCAnYXNzZXRzJywgZGJVcmwuc2xpY2UoJ2RiOi8vYXNzZXRzLycubGVuZ3RoKSk7XG59XG5cbmZ1bmN0aW9uIHJlYWRGb250TWV0YShwYXRoOiBzdHJpbmcgfCBudWxsKTogRm9udE1ldGEge1xuICAgIGlmICghcGF0aCkgcmV0dXJuIHsgd2VpZ2h0Q2xhc3M6IG51bGwsIGludGVybmFsU3R5bGU6ICcnIH07XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYnl0ZXMgPSByZWFkRmlsZVN5bmMocGF0aCk7XG4gICAgICAgIGNvbnN0IHRhYmxlcyA9IHJlYWRTZm50VGFibGVzKGJ5dGVzKTtcbiAgICAgICAgY29uc3QgbmFtZXMgPSB0YWJsZXMubmFtZSAhPSBudWxsID8gcmVhZE5hbWVSZWNvcmRzKGJ5dGVzLCB0YWJsZXMubmFtZSkgOiBbXTtcbiAgICAgICAgY29uc3Qgb3MyV2VpZ2h0ID0gdGFibGVzWydPUy8yJ10gIT0gbnVsbCAmJiB0YWJsZXNbJ09TLzInXSArIDYgPD0gYnl0ZXMubGVuZ3RoXG4gICAgICAgICAgICA/IGJ5dGVzLnJlYWRVSW50MTZCRSh0YWJsZXNbJ09TLzInXSArIDQpXG4gICAgICAgICAgICA6IG51bGw7XG4gICAgICAgIGNvbnN0IHN0eWxlID0gdW5pcXVlU3RyaW5ncyhuYW1lc1xuICAgICAgICAgICAgLmZpbHRlcigobikgPT4gbi5pZCA9PT0gMiB8fCBuLmlkID09PSAxNylcbiAgICAgICAgICAgIC5tYXAoKG4pID0+IG4udmFsdWUpXG4gICAgICAgICkuam9pbignICcpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgd2VpZ2h0Q2xhc3M6IG9zMldlaWdodCB8fCBpbmZlcldlaWdodENsYXNzKHN0eWxlKSB8fCBpbmZlcldlaWdodENsYXNzKG5hbWVzLm1hcCgobikgPT4gbi52YWx1ZSkuam9pbignICcpKSxcbiAgICAgICAgICAgIGludGVybmFsU3R5bGU6IHN0eWxlLFxuICAgICAgICB9O1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4geyB3ZWlnaHRDbGFzczogbnVsbCwgaW50ZXJuYWxTdHlsZTogJycgfTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlYWRTZm50VGFibGVzKGJ5dGVzOiBCdWZmZXIpOiB7IFt0YWc6IHN0cmluZ106IG51bWJlciB9IHtcbiAgICBjb25zdCB0YWJsZXM6IHsgW3RhZzogc3RyaW5nXTogbnVtYmVyIH0gPSB7fTtcbiAgICBpZiAoYnl0ZXMubGVuZ3RoIDwgMTIpIHJldHVybiB0YWJsZXM7XG4gICAgY29uc3QgY291bnQgPSBieXRlcy5yZWFkVUludDE2QkUoNCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IG9mZiA9IDEyICsgaSAqIDE2O1xuICAgICAgICBpZiAob2ZmICsgMTYgPiBieXRlcy5sZW5ndGgpIGJyZWFrO1xuICAgICAgICBjb25zdCB0YWcgPSBieXRlcy50b1N0cmluZygnYXNjaWknLCBvZmYsIG9mZiArIDQpO1xuICAgICAgICB0YWJsZXNbdGFnXSA9IGJ5dGVzLnJlYWRVSW50MzJCRShvZmYgKyA4KTtcbiAgICB9XG4gICAgcmV0dXJuIHRhYmxlcztcbn1cblxuZnVuY3Rpb24gcmVhZE5hbWVSZWNvcmRzKGJ5dGVzOiBCdWZmZXIsIHRhYmxlT2Zmc2V0OiBudW1iZXIpOiBBcnJheTx7IGlkOiBudW1iZXI7IHZhbHVlOiBzdHJpbmcgfT4ge1xuICAgIGNvbnN0IG91dDogQXJyYXk8eyBpZDogbnVtYmVyOyB2YWx1ZTogc3RyaW5nIH0+ID0gW107XG4gICAgaWYgKHRhYmxlT2Zmc2V0ICsgNiA+IGJ5dGVzLmxlbmd0aCkgcmV0dXJuIG91dDtcbiAgICBjb25zdCBjb3VudCA9IGJ5dGVzLnJlYWRVSW50MTZCRSh0YWJsZU9mZnNldCArIDIpO1xuICAgIGNvbnN0IHN0cmluZ09mZnNldCA9IHRhYmxlT2Zmc2V0ICsgYnl0ZXMucmVhZFVJbnQxNkJFKHRhYmxlT2Zmc2V0ICsgNCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IG9mZiA9IHRhYmxlT2Zmc2V0ICsgNiArIGkgKiAxMjtcbiAgICAgICAgaWYgKG9mZiArIDEyID4gYnl0ZXMubGVuZ3RoKSBicmVhaztcbiAgICAgICAgY29uc3QgcGxhdGZvcm0gPSBieXRlcy5yZWFkVUludDE2QkUob2ZmKTtcbiAgICAgICAgY29uc3QgaWQgPSBieXRlcy5yZWFkVUludDE2QkUob2ZmICsgNik7XG4gICAgICAgIGNvbnN0IGxlbiA9IGJ5dGVzLnJlYWRVSW50MTZCRShvZmYgKyA4KTtcbiAgICAgICAgY29uc3QgcG9zID0gc3RyaW5nT2Zmc2V0ICsgYnl0ZXMucmVhZFVJbnQxNkJFKG9mZiArIDEwKTtcbiAgICAgICAgaWYgKHBvcyA8IDAgfHwgcG9zICsgbGVuID4gYnl0ZXMubGVuZ3RoKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgcmF3ID0gYnl0ZXMuc3ViYXJyYXkocG9zLCBwb3MgKyBsZW4pO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGRlY29kZU5hbWVTdHJpbmcocmF3LCBwbGF0Zm9ybSkudHJpbSgpO1xuICAgICAgICBpZiAodmFsdWUpIG91dC5wdXNoKHsgaWQsIHZhbHVlIH0pO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBkZWNvZGVOYW1lU3RyaW5nKGJ5dGVzOiBCdWZmZXIsIHBsYXRmb3JtOiBudW1iZXIpOiBzdHJpbmcge1xuICAgIGlmIChwbGF0Zm9ybSA9PT0gMCB8fCBwbGF0Zm9ybSA9PT0gMykge1xuICAgICAgICBsZXQgb3V0ID0gJyc7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpICsgMSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgICAgICAgICBvdXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlcy5yZWFkVUludDE2QkUoaSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuICAgIHJldHVybiBieXRlcy50b1N0cmluZygnbGF0aW4xJyk7XG59XG5cbmZ1bmN0aW9uIHVuaXF1ZVN0cmluZ3ModmFsdWVzOiBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KHZhbHVlcy5maWx0ZXIoQm9vbGVhbikpKTtcbn1cblxuLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAIOWtl+S9k+mcgOaxguaKpeWRiu+8iOWvuem9kCBVbml0eSDnkIblv7XvvJrlj6rljLnphY3jgIHkuI3ojrflj5bvvIznvLrlpLHlj6rliJfmuIXljZXvvIlcblxuLyoqIEB6aCDljZXkuKrnvLrlpLHlrZfkvZPml4/nmoTpnIDmsYLorrDlvZXjgIIgKi9cbmV4cG9ydCBpbnRlcmZhY2UgTWlzc2luZ0ZvbnREZW1hbmQge1xuICAgIGZhbWlseTogc3RyaW5nOyAgIC8vIOWOn+WniyBGaWdtYSDlrZfkvZPml4/lkI1cbiAgICB3ZWlnaHQ6IHN0cmluZzsgICAvLyDlrZfph43vvIjlpIfms6jvvIlcbiAgICBjb3VudDogbnVtYmVyOyAgICAvLyDnlKjliLDnmoTmlofmnKzoioLngrnmlbBcbiAgICByZWFzb24/OiBzdHJpbmc7ICAvLyDmnKrlkb3kuK3ljp/lm6DvvIjlpoLlkIzml4/kvYblrZfph43kuI3lhbzlrrnvvIlcbn1cblxuLyoqXG4gKiBAZW4gQWNjdW11bGF0ZSBmb250IGRlbWFuZCBhY3Jvc3MgYSB0cmVlLiBDYWxsIHJlY29yZERlbWFuZCBwZXIgVEVYVCBub2RlLCB0aGVuIGJ1aWxkUmVwb3J0LlxuICogQHpoIOi3qOaVtOajteagkee0r+iuoeWtl+S9k+mcgOaxgu+8muavj+S4qiBURVhUIOiKgueCueiwgyByZWNvcmREZW1hbmTvvIzmnIDlkI4gYnVpbGRSZXBvcnQg5rGH5oC75oiQ5riF5Y2V44CCXG4gKiAgICAg5ZG95Lit5bqT6YeM55qE5LiN6K6h5YWl57y65aSx77yb5pyq5ZG95Lit55qE5oyJ44CM5a2X5L2T5pePK+Wtl+mHjeOAjeiBmuWQiOiuoeaVsOOAguaPkuS7tuS4jeS4i+i9veOAgeS4jeiOt+WPluKAlOKAlOWPquWRiuivieS9oOe8uuS7gOS5iOOAglxuICovXG5leHBvcnQgY2xhc3MgRm9udERlbWFuZFRyYWNrZXIge1xuICAgIHByaXZhdGUgbWlzc2luZyA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nRm9udERlbWFuZD4oKTtcbiAgICBwcml2YXRlIGRlZmF1bHRGYWxsYmFjayA9IG5ldyBNYXA8c3RyaW5nLCBNaXNzaW5nRm9udERlbWFuZD4oKTtcbiAgICBwcml2YXRlIG1hdGNoZWRDb3VudCA9IDA7XG5cbiAgICAvKiogQHpoIOiusOS4gOS4quaWh+acrOiKgueCueeahOWtl+S9k+mcgOaxgu+8m21hdGNoZWQ95piv5ZCm5bey5Zyo5bqT6YeM5ZG95Lit44CCICovXG4gICAgcmVjb3JkRGVtYW5kKGZhbWlseTogc3RyaW5nIHwgdW5kZWZpbmVkLCB3ZWlnaHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWF0Y2hlZDogYm9vbGVhbiwgcmVhc29uPzogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmIChtYXRjaGVkKSB7XG4gICAgICAgICAgICB0aGlzLm1hdGNoZWRDb3VudCsrO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZhbSA9IChmYW1pbHkgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgaWYgKCFmYW0pIHJldHVybjsgLy8g5peg5a2X5L2T5ZCN5LiN566X57y65aSx77yI6LWw6buY6K6k5a2X5L2T77yJXG4gICAgICAgIGlmIChBQ0NFUFRFRF9ERUZBVUxUX0ZBTExCQUNLX0ZBTUlMSUVTLmhhcyhmYW0udG9Mb3dlckNhc2UoKSkpIHtcbiAgICAgICAgICAgIHRoaXMucmVjb3JkRGVmYXVsdEZhbGxiYWNrKGZhbSwgd2VpZ2h0KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBrZXkgPSBmYW0udG9Mb3dlckNhc2UoKSArICd8JyArICh3ZWlnaHQgfHwgJycpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5taXNzaW5nLmdldChrZXkpO1xuICAgICAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgICAgICAgIGV4aXN0aW5nLmNvdW50Kys7XG4gICAgICAgICAgICBpZiAoIWV4aXN0aW5nLnJlYXNvbiAmJiByZWFzb24pIGV4aXN0aW5nLnJlYXNvbiA9IHJlYXNvbjtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm1pc3Npbmcuc2V0KGtleSwgeyBmYW1pbHk6IGZhbSwgd2VpZ2h0OiB3ZWlnaHQgfHwgJycsIGNvdW50OiAxLCByZWFzb24gfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZWNvcmREZWZhdWx0RmFsbGJhY2soZmFtaWx5OiBzdHJpbmcsIHdlaWdodDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGtleSA9IGZhbWlseS50b0xvd2VyQ2FzZSgpICsgJ3wnICsgKHdlaWdodCB8fCAnJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLmRlZmF1bHRGYWxsYmFjay5nZXQoa2V5KTtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICBleGlzdGluZy5jb3VudCsrO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZGVmYXVsdEZhbGxiYWNrLnNldChrZXksIHsgZmFtaWx5LCB3ZWlnaHQ6IHdlaWdodCB8fCAnJywgY291bnQ6IDEgfSk7XG4gICAgfVxuXG4gICAgLyoqIEB6aCDmmK/lkKbmnInnvLrlpLHlrZfkvZPjgIIgKi9cbiAgICBoYXNNaXNzaW5nKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5taXNzaW5nLnNpemUgPiAwO1xuICAgIH1cblxuICAgIC8qKiBAemgg5ZG95Lit55qE5paH5pys6IqC54K55pWw77yI55So5LqO5pGY6KaB77yJ44CCICovXG4gICAgZ2V0TWF0Y2hlZENvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLm1hdGNoZWRDb3VudDtcbiAgICB9XG5cbiAgICBnZXREZWZhdWx0RmFsbGJhY2tDb3VudCgpOiBudW1iZXIge1xuICAgICAgICBsZXQgY291bnQgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5kZWZhdWx0RmFsbGJhY2sudmFsdWVzKCkpIGNvdW50ICs9IGl0ZW0uY291bnQ7XG4gICAgICAgIHJldHVybiBjb3VudDtcbiAgICB9XG5cbiAgICBnZXREZWZhdWx0RmFsbGJhY2soKTogTWlzc2luZ0ZvbnREZW1hbmRbXSB7XG4gICAgICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMuZGVmYXVsdEZhbGxiYWNrLnZhbHVlcygpKS5zb3J0KChhLCBiKSA9PiBiLmNvdW50IC0gYS5jb3VudCk7XG4gICAgfVxuXG4gICAgLyoqIEB6aCDnvLrlpLHpnIDmsYLliJfooajvvIjmjInnlKjph4/pmY3luo/vvInjgIIgKi9cbiAgICBnZXRNaXNzaW5nKCk6IE1pc3NpbmdGb250RGVtYW5kW10ge1xuICAgICAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLm1pc3NpbmcudmFsdWVzKCkpLnNvcnQoKGEsIGIpID0+IGIuY291bnQgLSBhLmNvdW50KTtcbiAgICB9XG59XG4iXX0=