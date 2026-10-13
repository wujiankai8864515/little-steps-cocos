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
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { requestAssetDb, rethrowIfAssetDbUnavailable } from './assetdb';

/** @zh 字体库约定目录：把 TTF/OTF/BMFont 放这里，文件名（不含扩展名）= 字体族名。 */
export const FONT_LIB_DIR = 'db://assets/art/figma-fonts';

/** @zh 字体族最低相似度门槛：低于此值视为「不是同一字体」，回退默认字体（对齐 Unity FuzzyMinFamily）。 */
const MIN_FAMILY_SIM = 0.5;

/** @zh 这些 Figma 字体明确接受使用 Cocos 默认字体回退，不再作为缺失需求提示。 */
const ACCEPTED_DEFAULT_FALLBACK_FAMILIES = new Set([
    'zihunbingmeishi_t',
]);

export interface FontLibEntry {
    /** @zh 字体资源 uuid（cc.Font：TTFFont/BitmapFont 等，可直接给 Label.font 用） */
    uuid: string;
    /** @zh 原始文件名（不含扩展名），仅日志用 */
    fileName: string;
    /** @zh 归一化后的字体族名（匹配键） */
    norm: string;
    /** @zh Unity 同款格式化名：用于 family+weight 精确/包含匹配 */
    formatted: string;
    /** @zh 字体文件内部 OS/2 usWeightClass。用于避免 Regular 错配到 Heavy/Black 变体。 */
    weightClass: number | null;
    /** @zh 字体文件内部 style/subfamily，仅日志和调试用。 */
    internalStyle: string;
}

interface SkippedFontLikeAsset {
    fileName: string;
    formatted: string;
    type: string;
}

/**
 * @en Scan the font library dir for font assets. Returns [] if the dir is absent.
 * @zh 扫描字体库目录里的字体资源。目录不存在返回 []（导入照常走默认字体）。
 */
export async function scanFontLibrary(): Promise<FontLibEntry[]> {
    let assets: any[] = [];
    try {
        // pattern 形式随版本略有差异，用 db:// 通配抓该目录全部资源，再按 font 类型过滤。
        const pattern = `${FONT_LIB_DIR}/**/*`;
        assets = await requestAssetDb('query-assets', pattern, [{ pattern }]);
    } catch (err) {
        rethrowIfAssetDbUnavailable(err);
        console.warn('[figma-importer] 扫描字体库失败（可能目录不存在），回退默认字体:', err);
        return [];
    }
    if (!Array.isArray(assets)) return [];

    const lib: FontLibEntry[] = [];
    const skippedFontLike: SkippedFontLikeAsset[] = [];
    for (const a of assets) {
        if (!a || !a.uuid) continue;
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
export function matchFont(
    family: string | undefined,
    weight: string | undefined,
    lib: FontLibEntry[]
): { uuid: string; fileName: string; sim: number; weightMatched: boolean } | null {
    if (!lib || lib.length === 0) return null;
    const nf = normFamily(family || '');
    if (nf.length === 0) return null;

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

    let best: FontLibEntry | null = null;
    let bestSim = -1;
    for (const e of compatible) {
        const sim = familySimilarity(nf, e.norm);
        if (sim > bestSim) {
            bestSim = sim;
            best = e;
        }
    }
    if (!best || bestSim < MIN_FAMILY_SIM) return null;
    return {
        uuid: best.uuid,
        fileName: best.fileName,
        sim: bestSim,
        weightMatched: isRealWeightMatch(best, normalizedWeight),
    };
}

export function explainFontMiss(
    family: string | undefined,
    weight: string | undefined,
    lib: FontLibEntry[]
): string {
    if (!lib || lib.length === 0) return '';
    const nf = normFamily(family || '');
    if (nf.length === 0) return '';
    const normalizedWeight = normalizeFontWeight(weight || '');
    const sameFamily = lib
        .map((font) => ({ font, sim: familySimilarity(nf, font.norm) }))
        .filter((item) => item.sim >= MIN_FAMILY_SIM)
        .sort((a, b) => b.sim - a.sim);
    if (sameFamily.length === 0) return '';

    const incompatible = sameFamily.filter((item) => !isWeightCompatible(item.font, normalizedWeight));
    if (incompatible.length === 0) return '';

    const target = fontWeightValue(normalizedWeight);
    const details = incompatible.slice(0, 3).map(({ font }) => {
        const actual = actualFontWeight(font);
        return `${font.fileName}${actual ? `(${actual})` : ''}`;
    }).join(', ');
    return `同族字体存在但字重不兼容：需要 ${normalizedWeight}(${target})，现有 ${details}`;
}

// ───────────────────────────────── 字体族归一化 / 相似度（照搬 Unity FigmaTextStyleTable.cs）

/** @zh 归一化：小写 + 只留字母数字/中日韩字（去空格/连字符/下划线/点），使 "FZCuYuan-M03S"≈"FZCuYuanM03S"。 */
function normFamily(s: string): string {
    if (!s) return '';
    let out = '';
    for (const ch of s.trim().toLowerCase()) {
        if (/[a-z0-9一-鿿]/.test(ch)) out += ch;
    }
    return out;
}

/** @zh 标准化字体文件名：移除 SDF/分隔符，统一常见字重同义词。 */
function formatFontName(name: string): string {
    if (!name) return '';
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
function normalizeFontWeight(weight: string): string {
    if (!weight) return 'Regular';
    const w = weight.replace(/italic/ig, '').trim();
    if (/^[1-9]00$/.test(w)) {
        const n = Number(w);
        if (n >= 900) return 'Black';
        if (n >= 800) return 'ExtraBold';
        if (n >= 700) return 'Bold';
        if (n >= 600) return 'SemiBold';
        if (n >= 500) return 'Medium';
        if (n <= 200) return 'ExtraLight';
        if (n <= 300) return 'Light';
    }
    return w || 'Regular';
}

function isWeightCompatible(font: FontLibEntry, normalizedWeight: string): boolean {
    const target = fontWeightValue(normalizedWeight);
    const actual = actualFontWeight(font);
    if (actual == null) return true;
    // Figma 的 Regular/Medium 不应命中 Heavy/Black 变体；Bold 系列也不应命中 Regular 文件后再强行变粗。
    return target >= 600 ? actual >= 600 : actual < 600;
}

function isRealWeightMatch(font: FontLibEntry, normalizedWeight: string): boolean {
    const target = fontWeightValue(normalizedWeight);
    const actual = actualFontWeight(font);
    if (actual == null) {
        const w = formatFontName(normalizedWeight);
        return !!w && font.formatted.includes(w);
    }
    return target >= 600 ? actual >= 600 : actual < 600;
}

function actualFontWeight(font: FontLibEntry): number | null {
    if (typeof font.weightClass === 'number' && font.weightClass > 0) return font.weightClass;
    return inferWeightClass(`${font.formatted} ${font.internalStyle}`);
}

function fontWeightValue(normalizedWeight: string): number {
    const w = formatFontName(normalizedWeight);
    if (w.includes('black')) return 900;
    if (w.includes('extrabold')) return 800;
    if (w.includes('bold')) return 700;
    if (w.includes('semibold')) return 600;
    if (w.includes('medium')) return 500;
    if (w.includes('light') && !w.includes('extra')) return 300;
    if (w.includes('extralight') || w.includes('thin')) return 200;
    return 400;
}

function inferWeightClass(text: string): number | null {
    const formatted = formatFontName(text);
    const wght = /wght([1-9][0-9]{2})/.exec(formatted);
    if (wght) return Number(wght[1]);
    if (formatted.includes('black')) return 900;
    if (formatted.includes('extrabold')) return 800;
    if (formatted.includes('bold')) return 700;
    if (formatted.includes('semibold')) return 600;
    if (formatted.includes('medium')) return 500;
    if (formatted.includes('regular')) return 400;
    if (formatted.includes('light') && !formatted.includes('extra')) return 300;
    if (formatted.includes('extralight') || formatted.includes('thin')) return 200;
    return null;
}

/** @zh 两个已归一化字体族名的相似度 0~1：相等=1；互相包含=0.85；否则按编辑距离折算。 */
function familySimilarity(a: string, b: string): number {
    if (a.length === 0 || b.length === 0) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.85;
    const dist = levenshtein(a, b);
    const max = Math.max(a.length, b.length);
    return max === 0 ? 0 : clamp01(1 - dist / max);
}

function levenshtein(a: string, b: string): number {
    const n = a.length,
        m = b.length;
    if (n === 0) return m;
    if (m === 0) return n;
    let prev = new Array(m + 1);
    let cur = new Array(m + 1);
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

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hasImportedFontAlternative(skipped: SkippedFontLikeAsset, lib: FontLibEntry[]): boolean {
    if (!skipped.formatted) return false;
    return lib.some((font) =>
        font.formatted.includes(skipped.formatted) ||
        skipped.formatted.includes(font.formatted)
    );
}

/** @zh 取文件名主干（去目录 + 去扩展名）。 */
function baseName(pathOrName: string): string {
    if (!pathOrName) return '';
    const slash = Math.max(pathOrName.lastIndexOf('/'), pathOrName.lastIndexOf('\\'));
    let s = slash >= 0 ? pathOrName.slice(slash + 1) : pathOrName;
    const dot = s.lastIndexOf('.');
    if (dot > 0) s = s.slice(0, dot);
    return s;
}

interface FontMeta {
    weightClass: number | null;
    internalStyle: string;
}

function resolveFontAssetPath(asset: any, assetName: string, fileName: string): string | null {
    const candidates: string[] = [];
    for (const value of [asset.url, asset.source, asset.file, asset.path, assetName]) {
        if (typeof value !== 'string' || !value) continue;
        if (value.startsWith('db://assets/')) {
            const p = dbUrlToAssetPath(value);
            if (p) candidates.push(p);
        } else if (value.startsWith('/')) {
            candidates.push(value);
        }
    }
    const projectPath = (Editor as any).Project && (Editor as any).Project.path;
    if (projectPath && fileName) {
        for (const ext of ['.ttf', '.otf', '.ttc']) {
            candidates.push(join(projectPath, 'assets', 'figma-fonts', fileName + ext));
        }
    }
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    return null;
}

function dbUrlToAssetPath(dbUrl: string): string | null {
    if (!dbUrl.startsWith('db://assets/')) return null;
    const projectPath = (Editor as any).Project && (Editor as any).Project.path;
    if (!projectPath) return null;
    return join(projectPath, 'assets', dbUrl.slice('db://assets/'.length));
}

function readFontMeta(path: string | null): FontMeta {
    if (!path) return { weightClass: null, internalStyle: '' };
    try {
        const bytes = readFileSync(path);
        const tables = readSfntTables(bytes);
        const names = tables.name != null ? readNameRecords(bytes, tables.name) : [];
        const os2Weight = tables['OS/2'] != null && tables['OS/2'] + 6 <= bytes.length
            ? bytes.readUInt16BE(tables['OS/2'] + 4)
            : null;
        const style = uniqueStrings(names
            .filter((n) => n.id === 2 || n.id === 17)
            .map((n) => n.value)
        ).join(' ');
        return {
            weightClass: os2Weight || inferWeightClass(style) || inferWeightClass(names.map((n) => n.value).join(' ')),
            internalStyle: style,
        };
    } catch {
        return { weightClass: null, internalStyle: '' };
    }
}

function readSfntTables(bytes: Buffer): { [tag: string]: number } {
    const tables: { [tag: string]: number } = {};
    if (bytes.length < 12) return tables;
    const count = bytes.readUInt16BE(4);
    for (let i = 0; i < count; i++) {
        const off = 12 + i * 16;
        if (off + 16 > bytes.length) break;
        const tag = bytes.toString('ascii', off, off + 4);
        tables[tag] = bytes.readUInt32BE(off + 8);
    }
    return tables;
}

function readNameRecords(bytes: Buffer, tableOffset: number): Array<{ id: number; value: string }> {
    const out: Array<{ id: number; value: string }> = [];
    if (tableOffset + 6 > bytes.length) return out;
    const count = bytes.readUInt16BE(tableOffset + 2);
    const stringOffset = tableOffset + bytes.readUInt16BE(tableOffset + 4);
    for (let i = 0; i < count; i++) {
        const off = tableOffset + 6 + i * 12;
        if (off + 12 > bytes.length) break;
        const platform = bytes.readUInt16BE(off);
        const id = bytes.readUInt16BE(off + 6);
        const len = bytes.readUInt16BE(off + 8);
        const pos = stringOffset + bytes.readUInt16BE(off + 10);
        if (pos < 0 || pos + len > bytes.length) continue;
        const raw = bytes.subarray(pos, pos + len);
        const value = decodeNameString(raw, platform).trim();
        if (value) out.push({ id, value });
    }
    return out;
}

function decodeNameString(bytes: Buffer, platform: number): string {
    if (platform === 0 || platform === 3) {
        let out = '';
        for (let i = 0; i + 1 < bytes.length; i += 2) {
            out += String.fromCharCode(bytes.readUInt16BE(i));
        }
        return out;
    }
    return bytes.toString('latin1');
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.filter(Boolean)));
}

// ───────────────────────────────── 字体需求报告（对齐 Unity 理念：只匹配、不获取，缺失只列清单）

/** @zh 单个缺失字体族的需求记录。 */
export interface MissingFontDemand {
    family: string;   // 原始 Figma 字体族名
    weight: string;   // 字重（备注）
    count: number;    // 用到的文本节点数
    reason?: string;  // 未命中原因（如同族但字重不兼容）
}

/**
 * @en Accumulate font demand across a tree. Call recordDemand per TEXT node, then buildReport.
 * @zh 跨整棵树累计字体需求：每个 TEXT 节点调 recordDemand，最后 buildReport 汇总成清单。
 *     命中库里的不计入缺失；未命中的按「字体族+字重」聚合计数。插件不下载、不获取——只告诉你缺什么。
 */
export class FontDemandTracker {
    private missing = new Map<string, MissingFontDemand>();
    private defaultFallback = new Map<string, MissingFontDemand>();
    private matchedCount = 0;

    /** @zh 记一个文本节点的字体需求；matched=是否已在库里命中。 */
    recordDemand(family: string | undefined, weight: string | undefined, matched: boolean, reason?: string): void {
        if (matched) {
            this.matchedCount++;
            return;
        }
        const fam = (family || '').trim();
        if (!fam) return; // 无字体名不算缺失（走默认字体）
        if (ACCEPTED_DEFAULT_FALLBACK_FAMILIES.has(fam.toLowerCase())) {
            this.recordDefaultFallback(fam, weight);
            return;
        }
        const key = fam.toLowerCase() + '|' + (weight || '').toLowerCase();
        const existing = this.missing.get(key);
        if (existing) {
            existing.count++;
            if (!existing.reason && reason) existing.reason = reason;
            return;
        }
        this.missing.set(key, { family: fam, weight: weight || '', count: 1, reason });
    }

    private recordDefaultFallback(family: string, weight: string | undefined): void {
        const key = family.toLowerCase() + '|' + (weight || '').toLowerCase();
        const existing = this.defaultFallback.get(key);
        if (existing) {
            existing.count++;
            return;
        }
        this.defaultFallback.set(key, { family, weight: weight || '', count: 1 });
    }

    /** @zh 是否有缺失字体。 */
    hasMissing(): boolean {
        return this.missing.size > 0;
    }

    /** @zh 命中的文本节点数（用于摘要）。 */
    getMatchedCount(): number {
        return this.matchedCount;
    }

    getDefaultFallbackCount(): number {
        let count = 0;
        for (const item of this.defaultFallback.values()) count += item.count;
        return count;
    }

    getDefaultFallback(): MissingFontDemand[] {
        return Array.from(this.defaultFallback.values()).sort((a, b) => b.count - a.count);
    }

    /** @zh 缺失需求列表（按用量降序）。 */
    getMissing(): MissingFontDemand[] {
        return Array.from(this.missing.values()).sort((a, b) => b.count - a.count);
    }
}
