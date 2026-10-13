/**
 * @en Image pool → db:// asset landing + byte-hash dedup + SpriteFrame sub-asset lookup.
 * @zh 图片池落盘：base64 → 临时文件 → 导入 db:// → 查 SpriteFrame 子资源 uuid，带字节 MD5 去重。
 *
 * 全在主进程跑（可用 fs + asset-db 消息）。铁律：base64 只在这里落盘，绝不进 scene IPC。
 * 端口自 SpriteCache.cs 的精确字节 hash 去重（感知匹配后置）。
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    hashPngPixels,
    perceptualDistance,
    pngPerceptualSignature,
    whitenPngRgbKeepAlpha,
} from './pngcrop';
import { clampSlice9Border } from './slice9';
import { requestAssetDb, rethrowIfAssetDbUnavailable } from './assetdb';

export interface ImageImportResult {
    /** @zh imgId → SpriteFrame 子资源 uuid（可直接给 Sprite.spriteFrame 用） */
    idToSpriteFrame: { [imgId: string]: string };
    /**
     * @zh imgId → db:// 图片 url：已落盘/复用成功、但 SpriteFrame 子资源尚未就绪（asset-db 异步重建中）。
     * 建树时对这些图先挂品红占位，由 main 后台轮询就绪后替换成真图（占位→替换方案，避免竞态永久 miss）。
     */
    unresolved: { [imgId: string]: PendingSpriteFrame };
    /** @zh 硬失败不会再静默掉出资源账本；保留精确资源 URL 和原因供导入汇总诊断。 */
    failures: { [imgId: string]: ImageImportFailure };
}

export interface ImageImportFailure {
    dbUrl: string;
    stage: 'import';
    message: string;
}

export interface SpriteFrameBorder {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export type SpriteFramePendingPhase = 'root' | 'submeta' | 'uuid';

export interface PendingSpriteFrame {
    dbUrl: string;
    kind: 'figma' | 'mask';
    border?: SpriteFrameBorder;
    expectedWidth: number;
    expectedHeight: number;
    phase: SpriteFramePendingPhase;
}

export interface SpriteFrameResolveResult {
    resolved: { [imgId: string]: string };
    unresolved: { [imgId: string]: PendingSpriteFrame };
}

export interface SpriteFrameSettleResult {
    pending: PendingSpriteFrame;
    uuid: string | null;
    metaAdjusted: boolean;
    /** @zh false 表示 AssetDB 已明确拒绝，本批次不要继续重复请求。 */
    retryable?: boolean;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error || 'Unknown AssetDB error');
}

async function importAssetWithRetry(tmpFile: string, dbUrl: string, attempts = 3): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < Math.max(1, attempts); attempt++) {
        try {
            await requestAssetDb('import-asset', dbUrl, [tmpFile, dbUrl, { overwrite: true }]);
            return;
        } catch (error) {
            rethrowIfAssetDbUnavailable(error);
            lastError = error;
            if (attempt + 1 < attempts) await wait(150 * (attempt + 1));
        }
    }
    throw lastError;
}

function readSpriteFrameMetaSize(meta: any): { width: number; height: number } | null {
    if (!meta || typeof meta !== 'object') return null;
    const subMetas = meta.subMetas || {};
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame') continue;
        const userData = sub.userData || {};
        const width = Number(userData.rawWidth ?? userData.width ?? sub.rawWidth ?? sub.width ?? 0);
        const height = Number(userData.rawHeight ?? userData.height ?? sub.rawHeight ?? sub.height ?? 0);
        if (width > 0 && height > 0) return { width, height };
    }
    return null;
}

interface AssetMetaSnapshot {
    info: any;
    metaKey: string;
    meta: any;
}

function spriteFrameMetaSizeMatches(
    meta: any,
    expectedWidth: number,
    expectedHeight: number,
): boolean {
    const size = readSpriteFrameMetaSize(meta);
    if (!size) return false;
    if (expectedWidth > 0 && size.width !== expectedWidth) return false;
    if (expectedHeight > 0 && size.height !== expectedHeight) return false;
    return true;
}

async function queryAssetMetaSnapshot(dbUrl: string): Promise<AssetMetaSnapshot | null> {
    const info: any = await requestAssetDb('query-asset-info', dbUrl, [dbUrl]);
    const metaKey = info && info.uuid ? String(info.uuid) : dbUrl;
    const rawMeta: any = await requestAssetDb('query-asset-meta', metaKey, [metaKey]);
    const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
    if (!meta || typeof meta !== 'object') return null;
    return { info, metaKey, meta };
}

export function ensureSpriteFrameRootUserData(
    meta: any,
    extra: { [key: string]: any } = {}
): boolean {
    if (!meta || typeof meta !== 'object') return false;
    let changed = false;
    if (!meta.userData || typeof meta.userData !== 'object') {
        meta.userData = {};
        changed = true;
    }
    const wanted: { [key: string]: any } = { type: 'sprite-frame', ...extra };
    for (const key of Object.keys(wanted)) {
        if (JSON.stringify(meta.userData[key]) !== JSON.stringify(wanted[key])) {
            meta.userData[key] = wanted[key];
            changed = true;
        }
    }
    return changed;
}

export interface ProjectTextureIndexEntry {
    hash: string;
    dbUrl: string;
    uuid: string;
    spriteFrameUuid: string;
    width: number;
    height: number;
    sig?: Buffer;
    source: 'figma-import' | 'project';
    usage: 'sprite' | 'mask';
    /**
     * 这张图身上已烘好的九宫边距（读自磁盘 meta）。无边距时为 null。
     * 复用九宫图时必须与待导入的边距逐值相同，否则共享 SpriteFrame 会互相覆盖 inset（反馈 #15）。
     */
    border?: SpriteFrameBorder | null;
}

export interface ProjectTextureIndex {
    byHash: { [hash: string]: ProjectTextureIndexEntry[] };
    perceptualEntries: ProjectTextureIndexEntry[];
    total: number;
    hashed: number;
    skipped: number;
}

export interface ImageContentHash {
    hash: string;
    width: number;
    height: number;
    rawHash: string;
    sig?: Buffer;
}

export const FIGMA_IMAGE_DIR = 'db://assets/art/figma';
export const FIGMA_MASK_DIR = 'db://assets/art/figma-masks';
const PERCEPTUAL_MEAN_THRESHOLD = 8.0;
const PERCEPTUAL_MAX_THRESHOLD = 40;
const PERCEPTUAL_SIZE_TOLERANCE = 0.20;

function isGeneratedFigmaDbUrl(dbUrl: string): boolean {
    const normalized = String(dbUrl || '').replace(/\/+$/, '');
    return normalized === FIGMA_IMAGE_DIR || normalized.startsWith(`${FIGMA_IMAGE_DIR}/`) ||
        normalized === FIGMA_MASK_DIR || normalized.startsWith(`${FIGMA_MASK_DIR}/`);
}

function readAssetMetaFromDisk(dbUrl: string): any | null {
    const assetPath = dbUrlToAssetPath(dbUrl);
    if (!assetPath || !existsSync(`${assetPath}.meta`)) return null;
    try {
        return JSON.parse(readFileSync(`${assetPath}.meta`, 'utf8'));
    } catch {
        return null;
    }
}

function readSpriteFrameUuidFromMeta(meta: any): string | null {
    const subMetas = meta && meta.subMetas;
    if (!subMetas || typeof subMetas !== 'object') return null;
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (sub && sub.importer === 'sprite-frame' && sub.uuid) return String(sub.uuid);
    }
    return null;
}

/**
 * 读出磁盘 meta 里已烘好的九宫边距，取 sprite-frame 子 meta 的 userData。
 * 与 readSpriteFrameUuidFromMeta 走同一条定位路径（importer === 'sprite-frame'），
 * 两者读的是同一个 subMeta —— 顺序不能反着写：Cocos 的字段是
 * borderTop/Bottom/Left/Right，而我们内部 SpriteFrameBorder 是 left/right/top/bottom。
 *
 * 用途见反馈 #15：项目贴图索引原先只取 uuid，于是复用判定无从得知
 * 「工程里那张图身上烘的是什么边距」，只能一刀切「带九宫就不复用」。
 * 有了这个值，就能退成「边距逐值相同才复用」——共享 SpriteFrame 被覆盖的风险
 * 恰恰只在边距不同时才存在。
 *
 * 导出是为了让测试能覆盖「读」这一侧：判断链上「写 / 读 / 判」是三个独立落点，
 * 只测判定逻辑时，这里返回 null 也能全绿（实测植入该假 bug 时 8/8 仍通过），
 * 于是复用永远命不中、和改之前一模一样 —— 静默失效。
 */
export function readSpriteFrameBorderFromMeta(meta: any): SpriteFrameBorder | null {
    const subMetas = meta && meta.subMetas;
    if (!subMetas || typeof subMetas !== 'object') return null;
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame') continue;
        const userData = sub.userData;
        if (!userData || typeof userData !== 'object') return null;
        return {
            left: Math.max(0, Math.round(Number(userData.borderLeft) || 0)),
            right: Math.max(0, Math.round(Number(userData.borderRight) || 0)),
            top: Math.max(0, Math.round(Number(userData.borderTop) || 0)),
            bottom: Math.max(0, Math.round(Number(userData.borderBottom) || 0)),
        };
    }
    return null;
}

/**
 * 两个边距是否逐值相同（都按 hasSlice9Border 的口径先取整）。
 * undefined / null / 全 0 视为「无边距」，彼此相等。
 */
export function sameSpriteFrameBorder(a?: SpriteFrameBorder | null, b?: SpriteFrameBorder | null): boolean {
    const norm = (border?: SpriteFrameBorder | null) => [
        Math.max(0, Math.round(Number(border && border.left) || 0)),
        Math.max(0, Math.round(Number(border && border.right) || 0)),
        Math.max(0, Math.round(Number(border && border.top) || 0)),
        Math.max(0, Math.round(Number(border && border.bottom) || 0)),
    ];
    const x = norm(a);
    const y = norm(b);
    return x[0] === y[0] && x[1] === y[1] && x[2] === y[2] && x[3] === y[3];
}

function readSpriteFrameUuidFromInfo(info: any): string | null {
    const subs = info && info.subAssets;
    if (Array.isArray(subs)) {
        const spriteFrame = subs.find((sub: any) =>
            sub && (sub.type === 'spriteFrame' || sub.type === 'cc.SpriteFrame'));
        return spriteFrame && spriteFrame.uuid ? String(spriteFrame.uuid) : null;
    }
    if (subs && typeof subs === 'object') {
        for (const key of Object.keys(subs)) {
            const sub = subs[key];
            if (sub && sub.uuid &&
                (sub.importer === 'sprite-frame' || sub.type === 'cc.SpriteFrame' || key === 'spriteFrame')) {
                return String(sub.uuid);
            }
        }
    }
    return null;
}

/** @zh 对齐 Unity SpriteCache：从配置目录直接枚举图片，避免宽泛 query-assets 卡住 AssetDB。 */
function listProjectTextureUrls(dirs: string[]): string[] {
    const urls = new Set<string>();
    const walk = (diskDir: string, dbDir: string) => {
        if (isGeneratedFigmaDbUrl(dbDir)) return;
        let entries;
        try {
            entries = readdirSync(diskDir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const diskPath = join(diskDir, entry.name);
            const dbUrl = `${dbDir}/${entry.name}`;
            if (entry.isDirectory()) {
                walk(diskPath, dbUrl);
            } else if (entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name)) {
                urls.add(dbUrl);
            }
        }
    };

    for (const dir of dirs) {
        const dbDir = String(dir || '').replace(/\/+$/, '');
        if (!dbDir.startsWith('db://assets') || isGeneratedFigmaDbUrl(dbDir)) continue;
        const diskDir = dbUrlToAssetPath(dbDir);
        if (diskDir && existsSync(diskDir)) walk(diskDir, dbDir);
    }
    return Array.from(urls);
}

/**
 * @en Land every image in the pool and return imgId → SpriteFrame uuid.
 * @zh 落盘图片池，返回 imgId → SpriteFrame uuid 映射。
 * @param images 契约里的 images 池：id → base64(PNG)
 * @param interfaceName 界面名，用作 db://assets/art/figma/<name>/ 子目录
 */
export async function landImages(
    images: { [id: string]: string },
    interfaceName: string,
    spriteFrameBorders: { [imgId: string]: SpriteFrameBorder } = {},
    scanDirs?: string[]
): Promise<ImageImportResult> {
    const idToSpriteFrame: { [id: string]: string } = {};
    const unresolved: { [id: string]: PendingSpriteFrame } = {};
    const failures: { [id: string]: ImageImportFailure } = {};
    // 字节 MD5 + SpriteFrame border → SpriteFrame uuid：同一份 PNG 且同一导入语义才复用。
    // 相同 PNG 若被不同九宫格 border 使用，必须落成不同 SpriteFrame，否则会拉伸错误。
    const hashToSpriteFrame: { [md5: string]: string } = {};
    let imported = 0;
    let reusedUnchanged = 0;
    let reusedInPool = 0;
    let reusedProject = 0;
    let metaAdjusted = 0;

    const safeName = (interfaceName || 'untitled').replace(/[^\w一-龥-]/g, '_');
    const dbFolder = `${FIGMA_IMAGE_DIR}/${safeName}`;
    ensureAssetFolderOnDisk(FIGMA_IMAGE_DIR);
    ensureAssetFolderOnDisk(dbFolder);
    console.log(`[figma-importer] AssetDB 阶段 folder ready: ${dbFolder}`);
    const projectTextureIndex = await scanProjectTextureIndex(scanDirs);

    const tmpBase = join(tmpdir(), 'figma-importer');
    mkdirSync(tmpBase, { recursive: true });

    for (const imgId of Object.keys(images)) {
        const base64 = images[imgId];
        if (!base64) continue;

        const bytes = Buffer.from(base64, 'base64');
        const contentHash = hashImageBytes(bytes);
        const md5 = contentHash.rawHash;
        const dedupKey = spriteFrameDedupKey(contentHash.hash, spriteFrameBorders[imgId]);
        const dbUrl = `${dbFolder}/${imgId}.png`;

        // 去重命中：直接复用
        if (hashToSpriteFrame[dedupKey]) {
            idToSpriteFrame[imgId] = hashToSpriteFrame[dedupKey];
            reusedInPool++;
            continue;
        }

        // A project SpriteFrame is shared by all consumers. 复用九宫图时边距必须逐值相同，
        // 否则 scene.ts 写的 per-node inset 会互相覆盖（反馈 #15 的原始取舍就是为了防这个，
        // 但当时是一刀切「带九宫就不复用」，代价是九宫图永远命不中工程资源、每次都落新图）。
        // 边距判定下沉到 pickProjectTextureMatch，那里同时挡掉了九宫的感知匹配。
        const projectMatch = pickProjectTextureMatch(
            projectTextureIndex, contentHash, false, spriteFrameBorders[imgId]);
        if (projectMatch && projectMatch.spriteFrameUuid) {
            const liveUuid = await validateProjectSpriteFrame(projectMatch);
            if (liveUuid) {
                idToSpriteFrame[imgId] = liveUuid;
                hashToSpriteFrame[dedupKey] = liveUuid;
                reusedProject++;
                continue;
            }
            console.warn(
                `[figma-importer] 项目贴图命中但 live SpriteFrame 未就绪，改为隔离导入：${projectMatch.dbUrl}`
            );
        }

        // 目标文件内容没变时，不再 overwrite/import-asset。
        // 这能避免重复导入同一稿时触发 asset-db 刷新，打断刚建好的场景渲染。
        const existingFile = dbUrlToAssetPath(dbUrl);
        if (existingFile && existsSync(existingFile)) {
            try {
                const existingBytes = readFileSync(existingFile);
                if (md5Bytes(existingBytes) === md5) {
                    const settled = await settleSpriteFrameOnce(createPendingFigmaSpriteFrame(
                        dbUrl,
                        spriteFrameBorders[imgId],
                        contentHash.width,
                        contentHash.height,
                    ));
                    if (settled.metaAdjusted) metaAdjusted++;
                    if (settled.uuid) {
                        idToSpriteFrame[imgId] = settled.uuid;
                        hashToSpriteFrame[dedupKey] = settled.uuid;
                        reusedUnchanged++;
                        continue;
                    }
                    // 文件在、内容对，但 meta/子资源尚未完整收敛：
                    // 记入 unresolved，交由后台就绪后替换，而非在此阻塞轮询。
                    unresolved[imgId] = settled.pending;
                    continue;
                }
            } catch (err) {
                rethrowIfAssetDbUnavailable(err);
                console.warn(`[figma-importer] 读取已有图片失败，将重新导入 ${dbUrl}:`, err);
            }
        }

        // 写临时文件 → 导入 db://
        const tmpFile = join(tmpBase, `${imgId}.png`);
        writeFileSync(tmpFile, bytes);

        try {
            if (imported < 3 || (imported + 1) % 50 === 0) {
                console.log(`[figma-importer] AssetDB 阶段 import image ${imported + 1}: ${dbUrl}`);
            }
            await importAssetWithRetry(tmpFile, dbUrl);
            imported++;
            const settled = await settleSpriteFrameOnce(createPendingFigmaSpriteFrame(
                dbUrl,
                spriteFrameBorders[imgId],
                contentHash.width,
                contentHash.height,
            ));
            if (settled.metaAdjusted) metaAdjusted++;
            if (settled.uuid) {
                idToSpriteFrame[imgId] = settled.uuid;
                hashToSpriteFrame[dedupKey] = settled.uuid;
            } else {
                // 落盘成功但 meta/子资源尚未完整收敛（import + reimport 异步重建中）：
                // 不在此阻塞轮询，记入 unresolved，建树先挂品红占位、后台就绪后替换。
                unresolved[imgId] = settled.pending;
            }
        } catch (err) {
            rethrowIfAssetDbUnavailable(err);
            failures[imgId] = { dbUrl, stage: 'import', message: errorMessage(err) };
            console.error(`[figma-importer] import failed for ${imgId}:`, err);
        }
    }

    console.log(
        `[figma-importer] 图片落盘完成：${imported} 张导入，${reusedUnchanged} 张复用未变文件，` +
        `${reusedProject} 张复用项目正式资源，${reusedInPool} 张池内去重，` +
        `${metaAdjusted} 张按 Figma/Unity 语义修正 meta` +
        `${Object.keys(unresolved).length > 0 ? `，${Object.keys(unresolved).length} 张待后台就绪替换` : ''}` +
        `${Object.keys(failures).length > 0 ? `，${Object.keys(failures).length} 张导入硬失败` : ''}。`
    );
    return { idToSpriteFrame, unresolved, failures };
}

export async function landMaskImages(
    images: { [id: string]: string },
    interfaceName: string,
    scanDirs?: string[]
): Promise<ImageImportResult> {
    const idToSpriteFrame: { [id: string]: string } = {};
    const unresolved: { [id: string]: PendingSpriteFrame } = {};
    const failures: { [id: string]: ImageImportFailure } = {};
    const hashToSpriteFrame: { [hash: string]: string } = {};
    let imported = 0;
    let reusedUnchanged = 0;
    let reusedProject = 0;
    let reusedInPool = 0;
    let metaAdjusted = 0;

    const safeName = (interfaceName || 'untitled').replace(/[^\w一-龥-]/g, '_');
    const dbFolder = `${FIGMA_MASK_DIR}/${safeName}`;
    ensureAssetFolderOnDisk(FIGMA_MASK_DIR);
    ensureAssetFolderOnDisk(dbFolder);
    console.log(`[figma-importer] AssetDB 阶段 mask folder ready: ${dbFolder}`);
    const projectTextureIndex = await scanProjectTextureIndex(scanDirs);

    const tmpBase = join(tmpdir(), 'figma-importer');
    mkdirSync(tmpBase, { recursive: true });

    for (const imgId of Object.keys(images)) {
        const base64 = images[imgId];
        if (!base64) continue;

        const bytes = whitenPngRgbKeepAlpha(Buffer.from(base64, 'base64'));
        const contentHash = hashImageBytes(bytes);
        const dbUrl = `${dbFolder}/${imgId}.png`;

        if (hashToSpriteFrame[contentHash.hash]) {
            idToSpriteFrame[imgId] = hashToSpriteFrame[contentHash.hash];
            reusedInPool++;
            continue;
        }

        const projectMatch = pickProjectTextureMatch(projectTextureIndex, contentHash, true);
        if (projectMatch && projectMatch.spriteFrameUuid) {
            const liveUuid = await validateProjectSpriteFrame(projectMatch);
            if (liveUuid) {
                idToSpriteFrame[imgId] = liveUuid;
                hashToSpriteFrame[contentHash.hash] = liveUuid;
                reusedProject++;
                continue;
            }
            console.warn(
                `[figma-importer] 项目遮罩命中但 live SpriteFrame 未就绪，改为隔离导入：${projectMatch.dbUrl}`
            );
        }

        const existingFile = dbUrlToAssetPath(dbUrl);
        if (existingFile && existsSync(existingFile)) {
            try {
                const existingBytes = readFileSync(existingFile);
                if (hashImageBytes(existingBytes).hash === contentHash.hash) {
                    if (await ensureMaskImageMeta(dbUrl)) metaAdjusted++;
                    const sfUuid = await querySpriteFrameUuid(dbUrl);
                    if (sfUuid) {
                        idToSpriteFrame[imgId] = sfUuid;
                        hashToSpriteFrame[contentHash.hash] = sfUuid;
                        reusedUnchanged++;
                        continue;
                    }
                    unresolved[imgId] = createPendingMaskSpriteFrame(dbUrl);
                    continue;
                }
            } catch (err) {
                rethrowIfAssetDbUnavailable(err);
                console.warn(`[figma-importer] 读取已有遮罩失败，将重新导入 ${dbUrl}:`, err);
            }
        }

        const tmpFile = join(tmpBase, `${imgId}-mask.png`);
        writeFileSync(tmpFile, bytes);
        try {
            if (imported < 3 || (imported + 1) % 50 === 0) {
                console.log(`[figma-importer] AssetDB 阶段 import mask ${imported + 1}: ${dbUrl}`);
            }
            await importAssetWithRetry(tmpFile, dbUrl);
            imported++;
            if (await ensureMaskImageMeta(dbUrl)) metaAdjusted++;
            const sfUuid = await querySpriteFrameUuid(dbUrl);
            if (sfUuid) {
                idToSpriteFrame[imgId] = sfUuid;
                hashToSpriteFrame[contentHash.hash] = sfUuid;
            } else {
                unresolved[imgId] = createPendingMaskSpriteFrame(dbUrl);
            }
        } catch (err) {
            rethrowIfAssetDbUnavailable(err);
            failures[imgId] = { dbUrl, stage: 'import', message: errorMessage(err) };
            console.error(`[figma-importer] mask import failed for ${imgId}:`, err);
        }
    }

    console.log(
        `[figma-importer] 遮罩落盘完成：${imported} 张导入，${reusedUnchanged} 张复用未变文件，` +
        `${reusedProject} 张复用项目 Alpha8 遮罩，${reusedInPool} 张池内去重，${metaAdjusted} 张修正 mask meta` +
        `${Object.keys(unresolved).length > 0 ? `，${Object.keys(unresolved).length} 张待后台就绪替换` : ''}` +
        `${Object.keys(failures).length > 0 ? `，${Object.keys(failures).length} 张导入硬失败` : ''}。`
    );
    return { idToSpriteFrame, unresolved, failures };
}

async function validateProjectSpriteFrame(entry: ProjectTextureIndexEntry): Promise<string | null> {
    try {
        const snapshot = await queryAssetMetaSnapshot(entry.dbUrl);
        if (!snapshot || !snapshot.meta || !snapshot.meta.userData ||
            snapshot.meta.userData.type !== 'sprite-frame') return null;
        // Project indexing intentionally reads disk meta for speed, but a stale subMeta UUID
        // is not assignable even when the root asset is live. Prove the exact SpriteFrame
        // sub-asset through AssetDB before reusing it in the scene payload.
        const candidates = Array.from(new Set([
            readSpriteFrameUuidFromMeta(snapshot.meta),
            readSpriteFrameUuidFromInfo(snapshot.info),
        ].filter((uuid): uuid is string => !!uuid)));
        for (const candidate of candidates) {
            try {
                const liveSubAsset: any = await requestAssetDb('query-asset-info', candidate, [candidate]);
                if (liveSubAsset && String(liveSubAsset.uuid || '') === candidate) return candidate;
            } catch (error) {
                rethrowIfAssetDbUnavailable(error);
                // A stale candidate can be rejected while another live candidate is present.
            }
        }
        return null;
    } catch (error) {
        rethrowIfAssetDbUnavailable(error);
        console.warn(`[figma-importer] 项目贴图 live SpriteFrame 校验失败，改为隔离导入 ${entry.dbUrl}:`, error);
        return null;
    }
}

export function hashImageBase64(base64: string): ImageContentHash | null {
    if (!base64) return null;
    try {
        return hashImageBytes(Buffer.from(base64, 'base64'));
    } catch {
        return null;
    }
}

export function pickProjectTextureMatch(
    index: ProjectTextureIndex,
    contentHash: ImageContentHash,
    wantMask: boolean,
    requiredBorder?: SpriteFrameBorder | null
): ProjectTextureIndexEntry | null {
    const exact = (index.byHash[contentHash.hash] || [])
        .filter((item) => item.source === 'project' && item.usage === (wantMask ? 'mask' : 'sprite'))
        // 反馈 #15：九宫图也可以复用工程资源，但边距必须逐值相同 —— 项目 SpriteFrame 是
        // 共享的，scene.ts 会往上写 per-node inset，边距不同的两个节点会互相覆盖。
        // 边距相同则不存在这个风险，没有理由每次都落一张新图。
        //
        // 遮罩（Alpha8）不参与这道判定：遮罩只用 alpha 通道、不走九宫渲染，
        // 且调用方 landMaskImages 压根不传 border。若在这里一并要求「border 必须相同」，
        // 工程里某张遮罩恰好带非零 border 时就会莫名不复用 —— 那是与 #15 无关的行为改变。
        // （本工程实测 4 张遮罩 border 全 0，所以不加这个 else 也看不出差别，
        //   正因为看不出差别才更要写清楚，别让下一个人以为遮罩也被纳管了。）
        .filter((item) => wantMask || sameSpriteFrameBorder(item.border, requiredBorder));
    if (exact.length > 0) return exact[exact.length - 1];
    if (wantMask) return null;
    // 九宫图不走感知匹配：它对底图尺寸敏感（尺寸变则固定边所占比例变），
    // ±20% 尺寸容差会把边距对不上的图放进来。与 Unity SpriteCache 对九宫的处理一致。
    if (hasSlice9Border(requiredBorder || undefined)) return null;
    return pickPerceptualProjectTextureMatch(index, contentHash);
}

export function pickAnyTextureMatch(matches: ProjectTextureIndexEntry[]): ProjectTextureIndexEntry | null {
    if (!matches || matches.length === 0) return null;
    return matches.find((item) => item.source === 'project') || matches[0];
}

export async function scanProjectTextureIndex(dirs?: string[]): Promise<ProjectTextureIndex> {
    // 扫描目录来自「通用资源目录」配置；空或未传时回退全工程 assets。
    // 与 Unity SpriteCache 一样直接枚举磁盘，再读取现成 meta；不要用宽泛 query-assets，
    // 它在保留大量历史 FtoC 图片的工程里会长期占住 Creator AssetDB 消息队列。
    const scanDirs = Array.isArray(dirs) && dirs.length > 0 ? dirs : ['db://assets'];
    const dbUrls = listProjectTextureUrls(scanDirs);

    const byHash: { [hash: string]: ProjectTextureIndexEntry[] } = {};
    const perceptualEntries: ProjectTextureIndexEntry[] = [];
    let total = 0;
    let hashed = 0;
    let skipped = 0;
    for (const dbUrl of dbUrls) {
        total++;
        const filePath = dbUrlToAssetPath(dbUrl);
        if (!filePath || !existsSync(filePath)) {
            skipped++;
            continue;
        }
        try {
            const bytes = readFileSync(filePath);
            const contentHash = hashImageBytes(bytes);
            const meta = readAssetMetaFromDisk(dbUrl);
            const spriteFrameUuid = readSpriteFrameUuidFromMeta(meta);
            if (!spriteFrameUuid) {
                skipped++;
                continue;
            }
            const entry: ProjectTextureIndexEntry = {
                hash: contentHash.hash,
                dbUrl,
                uuid: String(meta && meta.uuid || ''),
                spriteFrameUuid,
                width: contentHash.width,
                height: contentHash.height,
                sig: contentHash.sig,
                source: textureSourceForUrl(dbUrl),
                usage: hasExplicitAlpha8Format(meta) ? 'mask' : 'sprite',
                border: readSpriteFrameBorderFromMeta(meta),
            };
            if (!byHash[entry.hash]) byHash[entry.hash] = [];
            byHash[entry.hash].push(entry);
            if (entry.sig && entry.width > 0 && entry.height > 0) perceptualEntries.push(entry);
            hashed++;
        } catch {
            skipped++;
        }
    }
    console.log(
        `[figma-importer] 项目贴图索引：${hashed}/${total} 张正式资源可比对` +
        `${skipped > 0 ? `，跳过 ${skipped} 张` : ''}（已排除 FtoC 生成目录）。`
    );
    return { byHash, perceptualEntries, total, hashed, skipped };
}

function pickPerceptualProjectTextureMatch(
    index: ProjectTextureIndex,
    contentHash: ImageContentHash
): ProjectTextureIndexEntry | null {
    if (!contentHash.sig || contentHash.width <= 0 || contentHash.height <= 0) return null;
    const candidates: Array<{ entry: ProjectTextureIndexEntry; mean: number }> = [];
    for (const entry of index.perceptualEntries) {
        if (entry.source !== 'project' || entry.usage !== 'sprite' || !entry.sig) continue;
        if (!dimsWithinTolerance(contentHash.width, contentHash.height, entry.width, entry.height)) continue;
        const dist = perceptualDistance(contentHash.sig, entry.sig);
        if (!dist) continue;
        if (dist.mean <= PERCEPTUAL_MEAN_THRESHOLD && dist.max <= PERCEPTUAL_MAX_THRESHOLD) {
            candidates.push({ entry, mean: dist.mean });
        }
    }
    candidates.sort((a, b) => a.mean - b.mean);
    const best = candidates[0];
    if (best) {
        console.log(
            `[figma-importer] 感知匹配复用项目贴图（平均差 ${best.mean.toFixed(1)} ≤ ${PERCEPTUAL_MEAN_THRESHOLD}）：${best.entry.dbUrl}`
        );
    }
    return best ? best.entry : null;
}

function dimsWithinTolerance(qw: number, qh: number, cw: number, ch: number): boolean {
    if (qw <= 0 || qh <= 0 || cw <= 0 || ch <= 0) return false;
    const lo = 1 - PERCEPTUAL_SIZE_TOLERANCE;
    const hi = 1 + PERCEPTUAL_SIZE_TOLERANCE;
    return cw >= qw * lo && cw <= qw * hi && ch >= qh * lo && ch <= qh * hi;
}

function textureSourceForUrl(dbUrl: string): 'figma-import' | 'project' {
    if (dbUrl.startsWith(`${FIGMA_IMAGE_DIR}/`) || dbUrl.startsWith(`${FIGMA_MASK_DIR}/`)) return 'figma-import';
    return 'project';
}

async function isAlpha8SpriteAsset(dbUrl: string): Promise<boolean> {
    const diskMeta = readAssetMetaFromDisk(dbUrl);
    if (diskMeta) return hasExplicitAlpha8Format(diskMeta);
    try {
        const info: any = await requestAssetDb('query-asset-info', dbUrl, [dbUrl]);
        const metaKey = info && info.uuid ? info.uuid : dbUrl;
        const rawMeta: any = await requestAssetDb('query-asset-meta', String(metaKey), [metaKey]);
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        return hasExplicitAlpha8Format(meta);
    } catch (err) {
        rethrowIfAssetDbUnavailable(err);
        return false;
    }
}

function hasExplicitAlpha8Format(value: any): boolean {
    if (!value || typeof value !== 'object') return false;
    const stack = [value];
    while (stack.length > 0) {
        const item = stack.pop();
        if (!item || typeof item !== 'object') continue;
        for (const key of Object.keys(item)) {
            const child = item[key];
            const normalizedKey = key.toLowerCase();
            if ((normalizedKey === 'format' || normalizedKey.endsWith('format')) &&
                String(child || '').toLowerCase().replace(/[\s_-]+/g, '') === 'alpha8') {
                return true;
            }
            if (child && typeof child === 'object') stack.push(child);
        }
    }
    return false;
}

/**
 * @en Ensure a db:// folder exists without entering AssetDB's message queue.
 * @zh 直接在磁盘创建 db:// 目录，避免 fresh 导入先阻塞在 AssetDB 查询。
 */
export function ensureAssetFolderOnDisk(url: string): string {
    const diskPath = dbUrlToAssetPath(url);
    if (!diskPath) throw new Error(`[figma-importer] 无法把资源目录映射到工程磁盘：${url}`);
    mkdirSync(diskPath, { recursive: true });
    return diskPath;
}

function isFigmaImageMetaReady(
    meta: any,
    border?: SpriteFrameBorder,
    expectedWidth: number = 0,
    expectedHeight: number = 0,
): boolean {
    const rootUserData = meta && meta.userData;
    if (!rootUserData || rootUserData.type !== 'sprite-frame' ||
        rootUserData.fixAlphaTransparencyArtifacts !== true) return false;
    const subMetas = meta.subMetas || {};
    let foundSpriteFrame = false;
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame') continue;
        foundSpriteFrame = true;
        const userData = sub.userData || {};
        if (userData.trimType !== 'none' || userData.packable !== false) return false;
        const rawW = Number(userData.rawWidth ?? sub.rawWidth ?? 0) || 0;
        const rawH = Number(userData.rawHeight ?? sub.rawHeight ?? 0) || 0;
        if (!(rawW > 0 && rawH > 0) ||
            (expectedWidth > 0 && rawW !== expectedWidth) ||
            (expectedHeight > 0 && rawH !== expectedHeight)) return false;
        if (border) {
            const clamped = clampSlice9Border(border, rawW, rawH);
            if (userData.borderTop !== clamped.top || userData.borderBottom !== clamped.bottom ||
                userData.borderLeft !== clamped.left || userData.borderRight !== clamped.right) return false;
        }
    }
    return foundSpriteFrame;
}

const SLICE9_META_KEYS = ['borderTop', 'borderBottom', 'borderLeft', 'borderRight'] as const;

function clearUnstableSlice9Borders(
    meta: any,
    border: SpriteFrameBorder | undefined,
    expectedWidth: number,
    expectedHeight: number,
): boolean {
    if (!hasSlice9Border(border)) return false;
    let changed = false;
    const subMetas = meta && meta.subMetas || {};
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame' ||
            spriteFrameMetaSizeMatches({ subMetas: { [key]: sub } }, expectedWidth, expectedHeight)) continue;
        const userData = sub.userData;
        if (!userData || typeof userData !== 'object') continue;
        for (const borderKey of SLICE9_META_KEYS) {
            if (Object.prototype.hasOwnProperty.call(userData, borderKey)) {
                delete userData[borderKey];
                changed = true;
            }
        }
    }
    return changed;
}

function applyFigmaSpriteFrameSubMeta(
    meta: any,
    border: SpriteFrameBorder | undefined,
    expectedWidth: number,
    expectedHeight: number,
): boolean {
    let changed = false;
    const subMetas = meta && meta.subMetas || {};
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame') continue;
        const size = readSpriteFrameMetaSize({ subMetas: { [key]: sub } });
        if (!size ||
            (expectedWidth > 0 && size.width !== expectedWidth) ||
            (expectedHeight > 0 && size.height !== expectedHeight)) continue;
        if (!sub.userData || typeof sub.userData !== 'object') {
            sub.userData = {};
            changed = true;
        }
        const userData = sub.userData;
        if (userData.trimType !== 'none') {
            userData.trimType = 'none';
            changed = true;
        }
        if (userData.packable !== false) {
            userData.packable = false;
            changed = true;
        }
        if (!border) continue;
        const clamped = clampSlice9Border(border, size.width, size.height);
        const wanted = {
            borderTop: clamped.top,
            borderBottom: clamped.bottom,
            borderLeft: clamped.left,
            borderRight: clamped.right,
        };
        for (const borderKey of Object.keys(wanted) as Array<keyof typeof wanted>) {
            if (userData[borderKey] !== wanted[borderKey]) {
                userData[borderKey] = wanted[borderKey];
                changed = true;
            }
        }
    }
    return changed;
}

function isMaskImageMetaReady(meta: any): boolean {
    const userData = meta && meta.userData;
    if (!userData || userData.type !== 'sprite-frame' ||
        userData.fixAlphaTransparencyArtifacts !== false ||
        userData.isReadable !== true || userData.packable !== false ||
        !userData.compressSettings || userData.compressSettings.useCompressTexture !== false ||
        String(userData.format || '').toLowerCase() !== 'alpha8') return false;
    const subMetas = meta.subMetas || {};
    let foundSpriteFrame = false;
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame') continue;
        foundSpriteFrame = true;
        if (!sub.userData || sub.userData.trimType !== 'none' || sub.userData.packable !== false) return false;
    }
    return foundSpriteFrame;
}

export function createPendingFigmaSpriteFrame(
    dbUrl: string,
    border?: SpriteFrameBorder,
    expectedWidth: number = 0,
    expectedHeight: number = 0,
): PendingSpriteFrame {
    return {
        dbUrl,
        kind: 'figma',
        border: border ? { ...border } : undefined,
        expectedWidth,
        expectedHeight,
        phase: 'root',
    };
}

function createPendingMaskSpriteFrame(dbUrl: string): PendingSpriteFrame {
    return {
        dbUrl,
        kind: 'mask',
        expectedWidth: 0,
        expectedHeight: 0,
        phase: 'uuid',
    };
}

function clonePendingSpriteFrame(pending: PendingSpriteFrame): PendingSpriteFrame {
    return {
        ...pending,
        border: pending.border ? { ...pending.border } : undefined,
    };
}

function spriteFramePendingKey(pending: PendingSpriteFrame): string {
    const border = pending.border;
    return [
        pending.kind,
        pending.dbUrl,
        pending.expectedWidth,
        pending.expectedHeight,
        border ? border.left : '',
        border ? border.right : '',
        border ? border.top : '',
        border ? border.bottom : '',
    ].join('|');
}

/**
 * @zh 单步推进 Figma 图片的 SpriteFrame 就绪状态。每次最多执行一次 meta mutation，
 *     不在函数内部等待；调用方统一控制 100/300ms 的重试节奏。
 */
export async function settleSpriteFrameOnce(
    input: PendingSpriteFrame,
): Promise<SpriteFrameSettleResult> {
    const pending = clonePendingSpriteFrame(input);
    if (pending.kind === 'mask') {
        try {
            return {
                pending,
                uuid: await querySpriteFrameUuidOnce(pending.dbUrl),
                metaAdjusted: false,
            };
        } catch (err) {
            rethrowIfAssetDbUnavailable(err);
            console.warn(`[figma-importer] 遮罩 SpriteFrame 查询失败，本批次停止重试 ${pending.dbUrl}`);
            return { pending, uuid: null, metaAdjusted: false, retryable: false };
        }
    }

    try {
        const snapshot = await queryAssetMetaSnapshot(pending.dbUrl);
        if (!snapshot) return { pending, uuid: null, metaAdjusted: false };
        const { metaKey, meta, info } = snapshot;
        const ready = isFigmaImageMetaReady(
            meta,
            pending.border,
            pending.expectedWidth,
            pending.expectedHeight,
        );

        // Final acceptance comes from one live AssetDB snapshot. A correct-looking disk
        // .meta is not enough because the runtime sub-asset may still be the old 2x2 image.
        if (ready) {
            pending.phase = 'uuid';
            return {
                pending,
                uuid: readSpriteFrameUuidFromMeta(meta) || readSpriteFrameUuidFromInfo(info),
                metaAdjusted: false,
            };
        }
        if (pending.phase === 'uuid') {
            return { pending, uuid: null, metaAdjusted: false };
        }

        const rootReady = meta.userData && meta.userData.type === 'sprite-frame';
        if (pending.phase === 'root' && !rootReady) {
            let changed = ensureSpriteFrameRootUserData(meta, {
                fixAlphaTransparencyArtifacts: true,
            });
            changed = clearUnstableSlice9Borders(
                meta,
                pending.border,
                pending.expectedWidth,
                pending.expectedHeight,
            ) || changed;
            if (changed) {
                await requestAssetDb('save-asset-meta', pending.dbUrl, [metaKey, JSON.stringify(meta, null, 2)]);
                await requestAssetDb('reimport-asset', pending.dbUrl, [pending.dbUrl]);
                pending.phase = 'submeta';
                return { pending, uuid: null, metaAdjusted: true };
            }
        }
        if (pending.phase === 'submeta' && !rootReady) {
            return { pending, uuid: null, metaAdjusted: false };
        }
        if (pending.phase === 'root') pending.phase = 'submeta';

        // A SpriteFrame subMeta can exist while it still describes Creator's temporary 2x2
        // texture. Wait for the real PNG dimensions before persisting trim/border values.
        if (!spriteFrameMetaSizeMatches(meta, pending.expectedWidth, pending.expectedHeight)) {
            return { pending, uuid: null, metaAdjusted: false };
        }

        let changed = ensureSpriteFrameRootUserData(meta, {
            fixAlphaTransparencyArtifacts: true,
        });
        changed = clearUnstableSlice9Borders(
            meta,
            pending.border,
            pending.expectedWidth,
            pending.expectedHeight,
        ) || changed;
        changed = applyFigmaSpriteFrameSubMeta(
            meta,
            pending.border,
            pending.expectedWidth,
            pending.expectedHeight,
        ) || changed;
        if (!isFigmaImageMetaReady(
            meta,
            pending.border,
            pending.expectedWidth,
            pending.expectedHeight,
        )) return { pending, uuid: null, metaAdjusted: false };

        if (changed) {
            await requestAssetDb('save-asset-meta', pending.dbUrl, [metaKey, JSON.stringify(meta, null, 2)]);
            await requestAssetDb('reimport-asset', pending.dbUrl, [pending.dbUrl]);
            pending.phase = 'uuid';
            return { pending, uuid: null, metaAdjusted: true };
        }

        pending.phase = 'uuid';
        return {
            pending,
            uuid: readSpriteFrameUuidFromMeta(meta) || readSpriteFrameUuidFromInfo(info),
            metaAdjusted: false,
        };
    } catch (err) {
        rethrowIfAssetDbUnavailable(err);
        console.warn(`[figma-importer] 图片 meta 查询被拒绝，本批次停止重试 ${pending.dbUrl}`);
        return { pending, uuid: null, metaAdjusted: false, retryable: false };
    }
}

/**
 * @zh 兼容聚焦测试/工具调用的完整 meta 收敛入口。正式导入使用 settleSpriteFrameOnce，
 *     避免图片循环里嵌套长时间 sleep。
 */
export async function ensureFigmaImageMeta(
    dbUrl: string,
    border?: SpriteFrameBorder,
    expectedWidth: number = 0,
    expectedHeight: number = 0,
): Promise<boolean> {
    let pending = createPendingFigmaSpriteFrame(dbUrl, border, expectedWidth, expectedHeight);
    let adjusted = false;
    for (let attempt = 0; attempt < 20; attempt++) {
        const result = await settleSpriteFrameOnce(pending);
        pending = result.pending;
        adjusted = adjusted || result.metaAdjusted;
        if (result.uuid) return adjusted;
        if (result.retryable === false) return adjusted;
        if (attempt < 19) await wait(100);
    }
    return adjusted;
}

async function ensureMaskImageMeta(dbUrl: string): Promise<boolean> {
    if (isMaskImageMetaReady(readAssetMetaFromDisk(dbUrl))) return false;
    try {
        const info: any = await requestAssetDb('query-asset-info', dbUrl, [dbUrl]);
        const metaKey = info && info.uuid ? info.uuid : dbUrl;
        const rawMeta: any = await requestAssetDb('query-asset-meta', String(metaKey), [metaKey]);
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        if (!meta || typeof meta !== 'object') return false;

        let changed = ensureSpriteFrameRootUserData(meta);
        const userData = meta.userData;
        const wantedUserData: { [key: string]: any } = {
            fixAlphaTransparencyArtifacts: false,
            isReadable: true,
            packable: false,
            compressSettings: { useCompressTexture: false },
        };
        for (const key of Object.keys(wantedUserData)) {
            if (JSON.stringify(userData[key]) !== JSON.stringify(wantedUserData[key])) {
                userData[key] = wantedUserData[key];
                changed = true;
            }
        }
        if (!userData.format || String(userData.format).toLowerCase() !== 'alpha8') {
            userData.format = 'alpha8';
            changed = true;
        }

        const subMetas = meta.subMetas || {};
        for (const key of Object.keys(subMetas)) {
            const sub = subMetas[key];
            if (!sub || sub.importer !== 'sprite-frame') continue;
            if (!sub.userData || typeof sub.userData !== 'object') {
                sub.userData = {};
                changed = true;
            }
            if (sub.userData.trimType !== 'none') {
                sub.userData.trimType = 'none';
                changed = true;
            }
            if (sub.userData.packable !== false) {
                sub.userData.packable = false;
                changed = true;
            }
        }
        if (!changed) return false;
        await requestAssetDb('save-asset-meta', dbUrl, [metaKey, JSON.stringify(meta, null, 2)]);
        await requestAssetDb('reimport-asset', dbUrl, [dbUrl]);
        return true;
    } catch (err) {
        rethrowIfAssetDbUnavailable(err);
        console.warn(`[figma-importer] 修正遮罩 meta 失败，沿用默认导入设置 ${dbUrl}:`, err);
        return false;
    }
}

function md5Bytes(bytes: Buffer): string {
    return createHash('md5').update(bytes).digest('hex');
}

function hashImageBytes(bytes: Buffer): ImageContentHash {
    const png = hashPngPixels(bytes);
    const sig = pngPerceptualSignature(bytes);
    const rawHash = md5Bytes(bytes);
    if (png) {
        return {
            hash: png.hash,
            width: png.width,
            height: png.height,
            rawHash,
            sig: sig ? sig.sig : undefined,
        };
    }
    return {
        hash: rawHash,
        width: 0,
        height: 0,
        rawHash,
    };
}

function spriteFrameDedupKey(md5: string, border?: SpriteFrameBorder): string {
    if (!border) return `${md5}|b:0,0,0,0`;
    const left = Math.max(0, Math.round(Number(border.left) || 0));
    const right = Math.max(0, Math.round(Number(border.right) || 0));
    const top = Math.max(0, Math.round(Number(border.top) || 0));
    const bottom = Math.max(0, Math.round(Number(border.bottom) || 0));
    return `${md5}|b:${left},${right},${top},${bottom}`;
}

export function hasSlice9Border(border?: SpriteFrameBorder): boolean {
    if (!border) return false;
    return [border.left, border.right, border.top, border.bottom]
        .some((value) => Math.max(0, Math.round(Number(value) || 0)) > 0);
}

function dbUrlToAssetPath(dbUrl: string): string | null {
    const projectPath = (Editor as any).Project && (Editor as any).Project.path;
    if (!projectPath) return null;
    if (dbUrl === 'db://assets') return join(projectPath, 'assets');
    if (!dbUrl.startsWith('db://assets/')) return null;
    const relative = dbUrl.slice('db://assets/'.length);
    return join(projectPath, 'assets', relative);
}

/**
 * @en Query the SpriteFrame sub-asset uuid (the "父uuid@后缀" one), NOT the parent ImageAsset.
 * @zh 查 SpriteFrame 子资源 uuid（形如 父uuid@f9941），不是父图 uuid —— 引用父图会静默失败。
 *
 * 注意：asset-db query-asset-info 的子资源结构随版本不同，这里做了多形态兼容，
 *       待真机验证后再收敛（见会话验证步骤）。
 */
async function querySpriteFrameUuidOnce(dbUrl: string): Promise<string | null> {
    const diskUuid = readSpriteFrameUuidFromMeta(readAssetMetaFromDisk(dbUrl));
    const info: any = await requestAssetDb('query-asset-info', dbUrl, [dbUrl]);
    if (!info) return null;

    const infoUuid = readSpriteFrameUuidFromInfo(info);
    if (infoUuid) return infoUuid;

    // Creator 3.8 can omit subAssets from query-asset-info while the exact SpriteFrame
    // UUID is already present in the imported meta. Read it instead of guessing @f9941.
    try {
        const metaKey = info.uuid || dbUrl;
        const rawMeta: any = await requestAssetDb('query-asset-meta', String(metaKey), [metaKey]);
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        const metaUuid = readSpriteFrameUuidFromMeta(meta);
        if (metaUuid) return metaUuid;
    } catch (err) {
        rethrowIfAssetDbUnavailable(err);
        // Asset DB may still be rebuilding the meta. The caller decides whether to retry.
    }
    // Disk meta is only a compatibility fallback after AssetDB confirms the root asset.
    // Returning it before the live query recreates the "file exists but cannot be assigned" race.
    return diskUuid;
}

/**
 * @zh 单次查 SpriteFrame 子资源 uuid（不重试）。落盘主路径用它：查不到即记 unresolved，
 * 不在此阻塞轮询——就绪等待交给 main 后台循环（占位→替换方案）。后台循环也复用它。
 */
export async function querySpriteFrameUuid(dbUrl: string): Promise<string | null> {
    return querySpriteFrameUuidOnce(dbUrl);
}

/**
 * @zh 在建树前并发收敛短暂未就绪的 SpriteFrame。只有超过预算仍无精灵子资源的图片
 *     才进入品红占位降级，避免把正常的 asset-db 时序暴露给场景节点。
 */
export async function resolveSpriteFramesBeforeBuild(
    pending: { [imgId: string]: PendingSpriteFrame | string },
    tries = 30,
    delayMs = 100
): Promise<SpriteFrameResolveResult> {
    const resolved: { [imgId: string]: string } = {};
    const unresolved: { [imgId: string]: PendingSpriteFrame } = {};
    const entries = Object.entries(pending || {});
    const phaseRank: { [phase in SpriteFramePendingPhase]: number } = { root: 0, submeta: 1, uuid: 2 };
    const groups = new Map<string, {
        imgIds: string[];
        pending: PendingSpriteFrame;
        uuid: string | null;
        exhausted: boolean;
    }>();

    for (const [imgId, rawPending] of entries) {
        const normalized = typeof rawPending === 'string'
            ? createPendingFigmaSpriteFrame(rawPending)
            : clonePendingSpriteFrame(rawPending);
        const key = spriteFramePendingKey(normalized);
        const group = groups.get(key);
        if (group) {
            group.imgIds.push(imgId);
            if (phaseRank[normalized.phase] > phaseRank[group.pending.phase]) group.pending = normalized;
        } else {
            groups.set(key, { imgIds: [imgId], pending: normalized, uuid: null, exhausted: false });
        }
    }

    // 以轮次为外层：总等待预算与资源数量无关，同一 dbUrl/语义每轮只查询一次。
    const rounds = Math.max(1, tries);
    for (let attempt = 0; attempt < rounds; attempt++) {
        let remaining = 0;
        for (const group of groups.values()) {
            if (group.uuid || group.exhausted) continue;
            const result = await settleSpriteFrameOnce(group.pending);
            group.pending = result.pending;
            group.uuid = result.uuid;
            group.exhausted = result.retryable === false;
            if (!group.uuid && !group.exhausted) remaining++;
        }
        if (remaining === 0) break;
        if (attempt + 1 < rounds) await wait(delayMs);
    }

    for (const group of groups.values()) {
        for (const imgId of group.imgIds) {
            if (group.uuid) resolved[imgId] = group.uuid;
            else unresolved[imgId] = clonePendingSpriteFrame(group.pending);
        }
    }

    return { resolved, unresolved };
}
