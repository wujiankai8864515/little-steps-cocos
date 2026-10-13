"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIGMA_MASK_DIR = exports.FIGMA_IMAGE_DIR = void 0;
exports.ensureSpriteFrameRootUserData = ensureSpriteFrameRootUserData;
exports.readSpriteFrameBorderFromMeta = readSpriteFrameBorderFromMeta;
exports.sameSpriteFrameBorder = sameSpriteFrameBorder;
exports.landImages = landImages;
exports.landMaskImages = landMaskImages;
exports.hashImageBase64 = hashImageBase64;
exports.pickProjectTextureMatch = pickProjectTextureMatch;
exports.pickAnyTextureMatch = pickAnyTextureMatch;
exports.scanProjectTextureIndex = scanProjectTextureIndex;
exports.ensureAssetFolderOnDisk = ensureAssetFolderOnDisk;
exports.createPendingFigmaSpriteFrame = createPendingFigmaSpriteFrame;
exports.settleSpriteFrameOnce = settleSpriteFrameOnce;
exports.ensureFigmaImageMeta = ensureFigmaImageMeta;
exports.hasSlice9Border = hasSlice9Border;
exports.querySpriteFrameUuid = querySpriteFrameUuid;
exports.resolveSpriteFramesBeforeBuild = resolveSpriteFramesBeforeBuild;
/**
 * @en Image pool → db:// asset landing + byte-hash dedup + SpriteFrame sub-asset lookup.
 * @zh 图片池落盘：base64 → 临时文件 → 导入 db:// → 查 SpriteFrame 子资源 uuid，带字节 MD5 去重。
 *
 * 全在主进程跑（可用 fs + asset-db 消息）。铁律：base64 只在这里落盘，绝不进 scene IPC。
 * 端口自 SpriteCache.cs 的精确字节 hash 去重（感知匹配后置）。
 */
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const pngcrop_1 = require("./pngcrop");
const slice9_1 = require("./slice9");
const assetdb_1 = require("./assetdb");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error || 'Unknown AssetDB error');
}
async function importAssetWithRetry(tmpFile, dbUrl, attempts = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < Math.max(1, attempts); attempt++) {
        try {
            await (0, assetdb_1.requestAssetDb)('import-asset', dbUrl, [tmpFile, dbUrl, { overwrite: true }]);
            return;
        }
        catch (error) {
            (0, assetdb_1.rethrowIfAssetDbUnavailable)(error);
            lastError = error;
            if (attempt + 1 < attempts)
                await wait(150 * (attempt + 1));
        }
    }
    throw lastError;
}
function readSpriteFrameMetaSize(meta) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!meta || typeof meta !== 'object')
        return null;
    const subMetas = meta.subMetas || {};
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame')
            continue;
        const userData = sub.userData || {};
        const width = Number((_d = (_c = (_b = (_a = userData.rawWidth) !== null && _a !== void 0 ? _a : userData.width) !== null && _b !== void 0 ? _b : sub.rawWidth) !== null && _c !== void 0 ? _c : sub.width) !== null && _d !== void 0 ? _d : 0);
        const height = Number((_h = (_g = (_f = (_e = userData.rawHeight) !== null && _e !== void 0 ? _e : userData.height) !== null && _f !== void 0 ? _f : sub.rawHeight) !== null && _g !== void 0 ? _g : sub.height) !== null && _h !== void 0 ? _h : 0);
        if (width > 0 && height > 0)
            return { width, height };
    }
    return null;
}
function spriteFrameMetaSizeMatches(meta, expectedWidth, expectedHeight) {
    const size = readSpriteFrameMetaSize(meta);
    if (!size)
        return false;
    if (expectedWidth > 0 && size.width !== expectedWidth)
        return false;
    if (expectedHeight > 0 && size.height !== expectedHeight)
        return false;
    return true;
}
async function queryAssetMetaSnapshot(dbUrl) {
    const info = await (0, assetdb_1.requestAssetDb)('query-asset-info', dbUrl, [dbUrl]);
    const metaKey = info && info.uuid ? String(info.uuid) : dbUrl;
    const rawMeta = await (0, assetdb_1.requestAssetDb)('query-asset-meta', metaKey, [metaKey]);
    const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
    if (!meta || typeof meta !== 'object')
        return null;
    return { info, metaKey, meta };
}
function ensureSpriteFrameRootUserData(meta, extra = {}) {
    if (!meta || typeof meta !== 'object')
        return false;
    let changed = false;
    if (!meta.userData || typeof meta.userData !== 'object') {
        meta.userData = {};
        changed = true;
    }
    const wanted = Object.assign({ type: 'sprite-frame' }, extra);
    for (const key of Object.keys(wanted)) {
        if (JSON.stringify(meta.userData[key]) !== JSON.stringify(wanted[key])) {
            meta.userData[key] = wanted[key];
            changed = true;
        }
    }
    return changed;
}
exports.FIGMA_IMAGE_DIR = 'db://assets/art/figma';
exports.FIGMA_MASK_DIR = 'db://assets/art/figma-masks';
const PERCEPTUAL_MEAN_THRESHOLD = 8.0;
const PERCEPTUAL_MAX_THRESHOLD = 40;
const PERCEPTUAL_SIZE_TOLERANCE = 0.20;
function isGeneratedFigmaDbUrl(dbUrl) {
    const normalized = String(dbUrl || '').replace(/\/+$/, '');
    return normalized === exports.FIGMA_IMAGE_DIR || normalized.startsWith(`${exports.FIGMA_IMAGE_DIR}/`) ||
        normalized === exports.FIGMA_MASK_DIR || normalized.startsWith(`${exports.FIGMA_MASK_DIR}/`);
}
function readAssetMetaFromDisk(dbUrl) {
    const assetPath = dbUrlToAssetPath(dbUrl);
    if (!assetPath || !(0, fs_1.existsSync)(`${assetPath}.meta`))
        return null;
    try {
        return JSON.parse((0, fs_1.readFileSync)(`${assetPath}.meta`, 'utf8'));
    }
    catch (_a) {
        return null;
    }
}
function readSpriteFrameUuidFromMeta(meta) {
    const subMetas = meta && meta.subMetas;
    if (!subMetas || typeof subMetas !== 'object')
        return null;
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (sub && sub.importer === 'sprite-frame' && sub.uuid)
            return String(sub.uuid);
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
function readSpriteFrameBorderFromMeta(meta) {
    const subMetas = meta && meta.subMetas;
    if (!subMetas || typeof subMetas !== 'object')
        return null;
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame')
            continue;
        const userData = sub.userData;
        if (!userData || typeof userData !== 'object')
            return null;
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
function sameSpriteFrameBorder(a, b) {
    const norm = (border) => [
        Math.max(0, Math.round(Number(border && border.left) || 0)),
        Math.max(0, Math.round(Number(border && border.right) || 0)),
        Math.max(0, Math.round(Number(border && border.top) || 0)),
        Math.max(0, Math.round(Number(border && border.bottom) || 0)),
    ];
    const x = norm(a);
    const y = norm(b);
    return x[0] === y[0] && x[1] === y[1] && x[2] === y[2] && x[3] === y[3];
}
function readSpriteFrameUuidFromInfo(info) {
    const subs = info && info.subAssets;
    if (Array.isArray(subs)) {
        const spriteFrame = subs.find((sub) => sub && (sub.type === 'spriteFrame' || sub.type === 'cc.SpriteFrame'));
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
function listProjectTextureUrls(dirs) {
    const urls = new Set();
    const walk = (diskDir, dbDir) => {
        if (isGeneratedFigmaDbUrl(dbDir))
            return;
        let entries;
        try {
            entries = (0, fs_1.readdirSync)(diskDir, { withFileTypes: true });
        }
        catch (_a) {
            return;
        }
        for (const entry of entries) {
            const diskPath = (0, path_1.join)(diskDir, entry.name);
            const dbUrl = `${dbDir}/${entry.name}`;
            if (entry.isDirectory()) {
                walk(diskPath, dbUrl);
            }
            else if (entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name)) {
                urls.add(dbUrl);
            }
        }
    };
    for (const dir of dirs) {
        const dbDir = String(dir || '').replace(/\/+$/, '');
        if (!dbDir.startsWith('db://assets') || isGeneratedFigmaDbUrl(dbDir))
            continue;
        const diskDir = dbUrlToAssetPath(dbDir);
        if (diskDir && (0, fs_1.existsSync)(diskDir))
            walk(diskDir, dbDir);
    }
    return Array.from(urls);
}
/**
 * @en Land every image in the pool and return imgId → SpriteFrame uuid.
 * @zh 落盘图片池，返回 imgId → SpriteFrame uuid 映射。
 * @param images 契约里的 images 池：id → base64(PNG)
 * @param interfaceName 界面名，用作 db://assets/art/figma/<name>/ 子目录
 */
async function landImages(images, interfaceName, spriteFrameBorders = {}, scanDirs) {
    const idToSpriteFrame = {};
    const unresolved = {};
    const failures = {};
    // 字节 MD5 + SpriteFrame border → SpriteFrame uuid：同一份 PNG 且同一导入语义才复用。
    // 相同 PNG 若被不同九宫格 border 使用，必须落成不同 SpriteFrame，否则会拉伸错误。
    const hashToSpriteFrame = {};
    let imported = 0;
    let reusedUnchanged = 0;
    let reusedInPool = 0;
    let reusedProject = 0;
    let metaAdjusted = 0;
    const safeName = (interfaceName || 'untitled').replace(/[^\w一-龥-]/g, '_');
    const dbFolder = `${exports.FIGMA_IMAGE_DIR}/${safeName}`;
    ensureAssetFolderOnDisk(exports.FIGMA_IMAGE_DIR);
    ensureAssetFolderOnDisk(dbFolder);
    console.log(`[figma-importer] AssetDB 阶段 folder ready: ${dbFolder}`);
    const projectTextureIndex = await scanProjectTextureIndex(scanDirs);
    const tmpBase = (0, path_1.join)((0, os_1.tmpdir)(), 'figma-importer');
    (0, fs_1.mkdirSync)(tmpBase, { recursive: true });
    for (const imgId of Object.keys(images)) {
        const base64 = images[imgId];
        if (!base64)
            continue;
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
        const projectMatch = pickProjectTextureMatch(projectTextureIndex, contentHash, false, spriteFrameBorders[imgId]);
        if (projectMatch && projectMatch.spriteFrameUuid) {
            const liveUuid = await validateProjectSpriteFrame(projectMatch);
            if (liveUuid) {
                idToSpriteFrame[imgId] = liveUuid;
                hashToSpriteFrame[dedupKey] = liveUuid;
                reusedProject++;
                continue;
            }
            console.warn(`[figma-importer] 项目贴图命中但 live SpriteFrame 未就绪，改为隔离导入：${projectMatch.dbUrl}`);
        }
        // 目标文件内容没变时，不再 overwrite/import-asset。
        // 这能避免重复导入同一稿时触发 asset-db 刷新，打断刚建好的场景渲染。
        const existingFile = dbUrlToAssetPath(dbUrl);
        if (existingFile && (0, fs_1.existsSync)(existingFile)) {
            try {
                const existingBytes = (0, fs_1.readFileSync)(existingFile);
                if (md5Bytes(existingBytes) === md5) {
                    const settled = await settleSpriteFrameOnce(createPendingFigmaSpriteFrame(dbUrl, spriteFrameBorders[imgId], contentHash.width, contentHash.height));
                    if (settled.metaAdjusted)
                        metaAdjusted++;
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
            }
            catch (err) {
                (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
                console.warn(`[figma-importer] 读取已有图片失败，将重新导入 ${dbUrl}:`, err);
            }
        }
        // 写临时文件 → 导入 db://
        const tmpFile = (0, path_1.join)(tmpBase, `${imgId}.png`);
        (0, fs_1.writeFileSync)(tmpFile, bytes);
        try {
            if (imported < 3 || (imported + 1) % 50 === 0) {
                console.log(`[figma-importer] AssetDB 阶段 import image ${imported + 1}: ${dbUrl}`);
            }
            await importAssetWithRetry(tmpFile, dbUrl);
            imported++;
            const settled = await settleSpriteFrameOnce(createPendingFigmaSpriteFrame(dbUrl, spriteFrameBorders[imgId], contentHash.width, contentHash.height));
            if (settled.metaAdjusted)
                metaAdjusted++;
            if (settled.uuid) {
                idToSpriteFrame[imgId] = settled.uuid;
                hashToSpriteFrame[dedupKey] = settled.uuid;
            }
            else {
                // 落盘成功但 meta/子资源尚未完整收敛（import + reimport 异步重建中）：
                // 不在此阻塞轮询，记入 unresolved，建树先挂品红占位、后台就绪后替换。
                unresolved[imgId] = settled.pending;
            }
        }
        catch (err) {
            (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
            failures[imgId] = { dbUrl, stage: 'import', message: errorMessage(err) };
            console.error(`[figma-importer] import failed for ${imgId}:`, err);
        }
    }
    console.log(`[figma-importer] 图片落盘完成：${imported} 张导入，${reusedUnchanged} 张复用未变文件，` +
        `${reusedProject} 张复用项目正式资源，${reusedInPool} 张池内去重，` +
        `${metaAdjusted} 张按 Figma/Unity 语义修正 meta` +
        `${Object.keys(unresolved).length > 0 ? `，${Object.keys(unresolved).length} 张待后台就绪替换` : ''}` +
        `${Object.keys(failures).length > 0 ? `，${Object.keys(failures).length} 张导入硬失败` : ''}。`);
    return { idToSpriteFrame, unresolved, failures };
}
async function landMaskImages(images, interfaceName, scanDirs) {
    const idToSpriteFrame = {};
    const unresolved = {};
    const failures = {};
    const hashToSpriteFrame = {};
    let imported = 0;
    let reusedUnchanged = 0;
    let reusedProject = 0;
    let reusedInPool = 0;
    let metaAdjusted = 0;
    const safeName = (interfaceName || 'untitled').replace(/[^\w一-龥-]/g, '_');
    const dbFolder = `${exports.FIGMA_MASK_DIR}/${safeName}`;
    ensureAssetFolderOnDisk(exports.FIGMA_MASK_DIR);
    ensureAssetFolderOnDisk(dbFolder);
    console.log(`[figma-importer] AssetDB 阶段 mask folder ready: ${dbFolder}`);
    const projectTextureIndex = await scanProjectTextureIndex(scanDirs);
    const tmpBase = (0, path_1.join)((0, os_1.tmpdir)(), 'figma-importer');
    (0, fs_1.mkdirSync)(tmpBase, { recursive: true });
    for (const imgId of Object.keys(images)) {
        const base64 = images[imgId];
        if (!base64)
            continue;
        const bytes = (0, pngcrop_1.whitenPngRgbKeepAlpha)(Buffer.from(base64, 'base64'));
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
            console.warn(`[figma-importer] 项目遮罩命中但 live SpriteFrame 未就绪，改为隔离导入：${projectMatch.dbUrl}`);
        }
        const existingFile = dbUrlToAssetPath(dbUrl);
        if (existingFile && (0, fs_1.existsSync)(existingFile)) {
            try {
                const existingBytes = (0, fs_1.readFileSync)(existingFile);
                if (hashImageBytes(existingBytes).hash === contentHash.hash) {
                    if (await ensureMaskImageMeta(dbUrl))
                        metaAdjusted++;
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
            }
            catch (err) {
                (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
                console.warn(`[figma-importer] 读取已有遮罩失败，将重新导入 ${dbUrl}:`, err);
            }
        }
        const tmpFile = (0, path_1.join)(tmpBase, `${imgId}-mask.png`);
        (0, fs_1.writeFileSync)(tmpFile, bytes);
        try {
            if (imported < 3 || (imported + 1) % 50 === 0) {
                console.log(`[figma-importer] AssetDB 阶段 import mask ${imported + 1}: ${dbUrl}`);
            }
            await importAssetWithRetry(tmpFile, dbUrl);
            imported++;
            if (await ensureMaskImageMeta(dbUrl))
                metaAdjusted++;
            const sfUuid = await querySpriteFrameUuid(dbUrl);
            if (sfUuid) {
                idToSpriteFrame[imgId] = sfUuid;
                hashToSpriteFrame[contentHash.hash] = sfUuid;
            }
            else {
                unresolved[imgId] = createPendingMaskSpriteFrame(dbUrl);
            }
        }
        catch (err) {
            (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
            failures[imgId] = { dbUrl, stage: 'import', message: errorMessage(err) };
            console.error(`[figma-importer] mask import failed for ${imgId}:`, err);
        }
    }
    console.log(`[figma-importer] 遮罩落盘完成：${imported} 张导入，${reusedUnchanged} 张复用未变文件，` +
        `${reusedProject} 张复用项目 Alpha8 遮罩，${reusedInPool} 张池内去重，${metaAdjusted} 张修正 mask meta` +
        `${Object.keys(unresolved).length > 0 ? `，${Object.keys(unresolved).length} 张待后台就绪替换` : ''}` +
        `${Object.keys(failures).length > 0 ? `，${Object.keys(failures).length} 张导入硬失败` : ''}。`);
    return { idToSpriteFrame, unresolved, failures };
}
async function validateProjectSpriteFrame(entry) {
    try {
        const snapshot = await queryAssetMetaSnapshot(entry.dbUrl);
        if (!snapshot || !snapshot.meta || !snapshot.meta.userData ||
            snapshot.meta.userData.type !== 'sprite-frame')
            return null;
        // Project indexing intentionally reads disk meta for speed, but a stale subMeta UUID
        // is not assignable even when the root asset is live. Prove the exact SpriteFrame
        // sub-asset through AssetDB before reusing it in the scene payload.
        const candidates = Array.from(new Set([
            readSpriteFrameUuidFromMeta(snapshot.meta),
            readSpriteFrameUuidFromInfo(snapshot.info),
        ].filter((uuid) => !!uuid)));
        for (const candidate of candidates) {
            try {
                const liveSubAsset = await (0, assetdb_1.requestAssetDb)('query-asset-info', candidate, [candidate]);
                if (liveSubAsset && String(liveSubAsset.uuid || '') === candidate)
                    return candidate;
            }
            catch (error) {
                (0, assetdb_1.rethrowIfAssetDbUnavailable)(error);
                // A stale candidate can be rejected while another live candidate is present.
            }
        }
        return null;
    }
    catch (error) {
        (0, assetdb_1.rethrowIfAssetDbUnavailable)(error);
        console.warn(`[figma-importer] 项目贴图 live SpriteFrame 校验失败，改为隔离导入 ${entry.dbUrl}:`, error);
        return null;
    }
}
function hashImageBase64(base64) {
    if (!base64)
        return null;
    try {
        return hashImageBytes(Buffer.from(base64, 'base64'));
    }
    catch (_a) {
        return null;
    }
}
function pickProjectTextureMatch(index, contentHash, wantMask, requiredBorder) {
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
    if (exact.length > 0)
        return exact[exact.length - 1];
    if (wantMask)
        return null;
    // 九宫图不走感知匹配：它对底图尺寸敏感（尺寸变则固定边所占比例变），
    // ±20% 尺寸容差会把边距对不上的图放进来。与 Unity SpriteCache 对九宫的处理一致。
    if (hasSlice9Border(requiredBorder || undefined))
        return null;
    return pickPerceptualProjectTextureMatch(index, contentHash);
}
function pickAnyTextureMatch(matches) {
    if (!matches || matches.length === 0)
        return null;
    return matches.find((item) => item.source === 'project') || matches[0];
}
async function scanProjectTextureIndex(dirs) {
    // 扫描目录来自「通用资源目录」配置；空或未传时回退全工程 assets。
    // 与 Unity SpriteCache 一样直接枚举磁盘，再读取现成 meta；不要用宽泛 query-assets，
    // 它在保留大量历史 FtoC 图片的工程里会长期占住 Creator AssetDB 消息队列。
    const scanDirs = Array.isArray(dirs) && dirs.length > 0 ? dirs : ['db://assets'];
    const dbUrls = listProjectTextureUrls(scanDirs);
    const byHash = {};
    const perceptualEntries = [];
    let total = 0;
    let hashed = 0;
    let skipped = 0;
    for (const dbUrl of dbUrls) {
        total++;
        const filePath = dbUrlToAssetPath(dbUrl);
        if (!filePath || !(0, fs_1.existsSync)(filePath)) {
            skipped++;
            continue;
        }
        try {
            const bytes = (0, fs_1.readFileSync)(filePath);
            const contentHash = hashImageBytes(bytes);
            const meta = readAssetMetaFromDisk(dbUrl);
            const spriteFrameUuid = readSpriteFrameUuidFromMeta(meta);
            if (!spriteFrameUuid) {
                skipped++;
                continue;
            }
            const entry = {
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
            if (!byHash[entry.hash])
                byHash[entry.hash] = [];
            byHash[entry.hash].push(entry);
            if (entry.sig && entry.width > 0 && entry.height > 0)
                perceptualEntries.push(entry);
            hashed++;
        }
        catch (_a) {
            skipped++;
        }
    }
    console.log(`[figma-importer] 项目贴图索引：${hashed}/${total} 张正式资源可比对` +
        `${skipped > 0 ? `，跳过 ${skipped} 张` : ''}（已排除 FtoC 生成目录）。`);
    return { byHash, perceptualEntries, total, hashed, skipped };
}
function pickPerceptualProjectTextureMatch(index, contentHash) {
    if (!contentHash.sig || contentHash.width <= 0 || contentHash.height <= 0)
        return null;
    const candidates = [];
    for (const entry of index.perceptualEntries) {
        if (entry.source !== 'project' || entry.usage !== 'sprite' || !entry.sig)
            continue;
        if (!dimsWithinTolerance(contentHash.width, contentHash.height, entry.width, entry.height))
            continue;
        const dist = (0, pngcrop_1.perceptualDistance)(contentHash.sig, entry.sig);
        if (!dist)
            continue;
        if (dist.mean <= PERCEPTUAL_MEAN_THRESHOLD && dist.max <= PERCEPTUAL_MAX_THRESHOLD) {
            candidates.push({ entry, mean: dist.mean });
        }
    }
    candidates.sort((a, b) => a.mean - b.mean);
    const best = candidates[0];
    if (best) {
        console.log(`[figma-importer] 感知匹配复用项目贴图（平均差 ${best.mean.toFixed(1)} ≤ ${PERCEPTUAL_MEAN_THRESHOLD}）：${best.entry.dbUrl}`);
    }
    return best ? best.entry : null;
}
function dimsWithinTolerance(qw, qh, cw, ch) {
    if (qw <= 0 || qh <= 0 || cw <= 0 || ch <= 0)
        return false;
    const lo = 1 - PERCEPTUAL_SIZE_TOLERANCE;
    const hi = 1 + PERCEPTUAL_SIZE_TOLERANCE;
    return cw >= qw * lo && cw <= qw * hi && ch >= qh * lo && ch <= qh * hi;
}
function textureSourceForUrl(dbUrl) {
    if (dbUrl.startsWith(`${exports.FIGMA_IMAGE_DIR}/`) || dbUrl.startsWith(`${exports.FIGMA_MASK_DIR}/`))
        return 'figma-import';
    return 'project';
}
async function isAlpha8SpriteAsset(dbUrl) {
    const diskMeta = readAssetMetaFromDisk(dbUrl);
    if (diskMeta)
        return hasExplicitAlpha8Format(diskMeta);
    try {
        const info = await (0, assetdb_1.requestAssetDb)('query-asset-info', dbUrl, [dbUrl]);
        const metaKey = info && info.uuid ? info.uuid : dbUrl;
        const rawMeta = await (0, assetdb_1.requestAssetDb)('query-asset-meta', String(metaKey), [metaKey]);
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        return hasExplicitAlpha8Format(meta);
    }
    catch (err) {
        (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
        return false;
    }
}
function hasExplicitAlpha8Format(value) {
    if (!value || typeof value !== 'object')
        return false;
    const stack = [value];
    while (stack.length > 0) {
        const item = stack.pop();
        if (!item || typeof item !== 'object')
            continue;
        for (const key of Object.keys(item)) {
            const child = item[key];
            const normalizedKey = key.toLowerCase();
            if ((normalizedKey === 'format' || normalizedKey.endsWith('format')) &&
                String(child || '').toLowerCase().replace(/[\s_-]+/g, '') === 'alpha8') {
                return true;
            }
            if (child && typeof child === 'object')
                stack.push(child);
        }
    }
    return false;
}
/**
 * @en Ensure a db:// folder exists without entering AssetDB's message queue.
 * @zh 直接在磁盘创建 db:// 目录，避免 fresh 导入先阻塞在 AssetDB 查询。
 */
function ensureAssetFolderOnDisk(url) {
    const diskPath = dbUrlToAssetPath(url);
    if (!diskPath)
        throw new Error(`[figma-importer] 无法把资源目录映射到工程磁盘：${url}`);
    (0, fs_1.mkdirSync)(diskPath, { recursive: true });
    return diskPath;
}
function isFigmaImageMetaReady(meta, border, expectedWidth = 0, expectedHeight = 0) {
    var _a, _b, _c, _d;
    const rootUserData = meta && meta.userData;
    if (!rootUserData || rootUserData.type !== 'sprite-frame' ||
        rootUserData.fixAlphaTransparencyArtifacts !== true)
        return false;
    const subMetas = meta.subMetas || {};
    let foundSpriteFrame = false;
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame')
            continue;
        foundSpriteFrame = true;
        const userData = sub.userData || {};
        if (userData.trimType !== 'none' || userData.packable !== false)
            return false;
        const rawW = Number((_b = (_a = userData.rawWidth) !== null && _a !== void 0 ? _a : sub.rawWidth) !== null && _b !== void 0 ? _b : 0) || 0;
        const rawH = Number((_d = (_c = userData.rawHeight) !== null && _c !== void 0 ? _c : sub.rawHeight) !== null && _d !== void 0 ? _d : 0) || 0;
        if (!(rawW > 0 && rawH > 0) ||
            (expectedWidth > 0 && rawW !== expectedWidth) ||
            (expectedHeight > 0 && rawH !== expectedHeight))
            return false;
        if (border) {
            const clamped = (0, slice9_1.clampSlice9Border)(border, rawW, rawH);
            if (userData.borderTop !== clamped.top || userData.borderBottom !== clamped.bottom ||
                userData.borderLeft !== clamped.left || userData.borderRight !== clamped.right)
                return false;
        }
    }
    return foundSpriteFrame;
}
const SLICE9_META_KEYS = ['borderTop', 'borderBottom', 'borderLeft', 'borderRight'];
function clearUnstableSlice9Borders(meta, border, expectedWidth, expectedHeight) {
    if (!hasSlice9Border(border))
        return false;
    let changed = false;
    const subMetas = meta && meta.subMetas || {};
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame' ||
            spriteFrameMetaSizeMatches({ subMetas: { [key]: sub } }, expectedWidth, expectedHeight))
            continue;
        const userData = sub.userData;
        if (!userData || typeof userData !== 'object')
            continue;
        for (const borderKey of SLICE9_META_KEYS) {
            if (Object.prototype.hasOwnProperty.call(userData, borderKey)) {
                delete userData[borderKey];
                changed = true;
            }
        }
    }
    return changed;
}
function applyFigmaSpriteFrameSubMeta(meta, border, expectedWidth, expectedHeight) {
    let changed = false;
    const subMetas = meta && meta.subMetas || {};
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame')
            continue;
        const size = readSpriteFrameMetaSize({ subMetas: { [key]: sub } });
        if (!size ||
            (expectedWidth > 0 && size.width !== expectedWidth) ||
            (expectedHeight > 0 && size.height !== expectedHeight))
            continue;
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
        if (!border)
            continue;
        const clamped = (0, slice9_1.clampSlice9Border)(border, size.width, size.height);
        const wanted = {
            borderTop: clamped.top,
            borderBottom: clamped.bottom,
            borderLeft: clamped.left,
            borderRight: clamped.right,
        };
        for (const borderKey of Object.keys(wanted)) {
            if (userData[borderKey] !== wanted[borderKey]) {
                userData[borderKey] = wanted[borderKey];
                changed = true;
            }
        }
    }
    return changed;
}
function isMaskImageMetaReady(meta) {
    const userData = meta && meta.userData;
    if (!userData || userData.type !== 'sprite-frame' ||
        userData.fixAlphaTransparencyArtifacts !== false ||
        userData.isReadable !== true || userData.packable !== false ||
        !userData.compressSettings || userData.compressSettings.useCompressTexture !== false ||
        String(userData.format || '').toLowerCase() !== 'alpha8')
        return false;
    const subMetas = meta.subMetas || {};
    let foundSpriteFrame = false;
    for (const key of Object.keys(subMetas)) {
        const sub = subMetas[key];
        if (!sub || sub.importer !== 'sprite-frame')
            continue;
        foundSpriteFrame = true;
        if (!sub.userData || sub.userData.trimType !== 'none' || sub.userData.packable !== false)
            return false;
    }
    return foundSpriteFrame;
}
function createPendingFigmaSpriteFrame(dbUrl, border, expectedWidth = 0, expectedHeight = 0) {
    return {
        dbUrl,
        kind: 'figma',
        border: border ? Object.assign({}, border) : undefined,
        expectedWidth,
        expectedHeight,
        phase: 'root',
    };
}
function createPendingMaskSpriteFrame(dbUrl) {
    return {
        dbUrl,
        kind: 'mask',
        expectedWidth: 0,
        expectedHeight: 0,
        phase: 'uuid',
    };
}
function clonePendingSpriteFrame(pending) {
    return Object.assign(Object.assign({}, pending), { border: pending.border ? Object.assign({}, pending.border) : undefined });
}
function spriteFramePendingKey(pending) {
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
async function settleSpriteFrameOnce(input) {
    const pending = clonePendingSpriteFrame(input);
    if (pending.kind === 'mask') {
        try {
            return {
                pending,
                uuid: await querySpriteFrameUuidOnce(pending.dbUrl),
                metaAdjusted: false,
            };
        }
        catch (err) {
            (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
            console.warn(`[figma-importer] 遮罩 SpriteFrame 查询失败，本批次停止重试 ${pending.dbUrl}`);
            return { pending, uuid: null, metaAdjusted: false, retryable: false };
        }
    }
    try {
        const snapshot = await queryAssetMetaSnapshot(pending.dbUrl);
        if (!snapshot)
            return { pending, uuid: null, metaAdjusted: false };
        const { metaKey, meta, info } = snapshot;
        const ready = isFigmaImageMetaReady(meta, pending.border, pending.expectedWidth, pending.expectedHeight);
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
            changed = clearUnstableSlice9Borders(meta, pending.border, pending.expectedWidth, pending.expectedHeight) || changed;
            if (changed) {
                await (0, assetdb_1.requestAssetDb)('save-asset-meta', pending.dbUrl, [metaKey, JSON.stringify(meta, null, 2)]);
                await (0, assetdb_1.requestAssetDb)('reimport-asset', pending.dbUrl, [pending.dbUrl]);
                pending.phase = 'submeta';
                return { pending, uuid: null, metaAdjusted: true };
            }
        }
        if (pending.phase === 'submeta' && !rootReady) {
            return { pending, uuid: null, metaAdjusted: false };
        }
        if (pending.phase === 'root')
            pending.phase = 'submeta';
        // A SpriteFrame subMeta can exist while it still describes Creator's temporary 2x2
        // texture. Wait for the real PNG dimensions before persisting trim/border values.
        if (!spriteFrameMetaSizeMatches(meta, pending.expectedWidth, pending.expectedHeight)) {
            return { pending, uuid: null, metaAdjusted: false };
        }
        let changed = ensureSpriteFrameRootUserData(meta, {
            fixAlphaTransparencyArtifacts: true,
        });
        changed = clearUnstableSlice9Borders(meta, pending.border, pending.expectedWidth, pending.expectedHeight) || changed;
        changed = applyFigmaSpriteFrameSubMeta(meta, pending.border, pending.expectedWidth, pending.expectedHeight) || changed;
        if (!isFigmaImageMetaReady(meta, pending.border, pending.expectedWidth, pending.expectedHeight))
            return { pending, uuid: null, metaAdjusted: false };
        if (changed) {
            await (0, assetdb_1.requestAssetDb)('save-asset-meta', pending.dbUrl, [metaKey, JSON.stringify(meta, null, 2)]);
            await (0, assetdb_1.requestAssetDb)('reimport-asset', pending.dbUrl, [pending.dbUrl]);
            pending.phase = 'uuid';
            return { pending, uuid: null, metaAdjusted: true };
        }
        pending.phase = 'uuid';
        return {
            pending,
            uuid: readSpriteFrameUuidFromMeta(meta) || readSpriteFrameUuidFromInfo(info),
            metaAdjusted: false,
        };
    }
    catch (err) {
        (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
        console.warn(`[figma-importer] 图片 meta 查询被拒绝，本批次停止重试 ${pending.dbUrl}`);
        return { pending, uuid: null, metaAdjusted: false, retryable: false };
    }
}
/**
 * @zh 兼容聚焦测试/工具调用的完整 meta 收敛入口。正式导入使用 settleSpriteFrameOnce，
 *     避免图片循环里嵌套长时间 sleep。
 */
async function ensureFigmaImageMeta(dbUrl, border, expectedWidth = 0, expectedHeight = 0) {
    let pending = createPendingFigmaSpriteFrame(dbUrl, border, expectedWidth, expectedHeight);
    let adjusted = false;
    for (let attempt = 0; attempt < 20; attempt++) {
        const result = await settleSpriteFrameOnce(pending);
        pending = result.pending;
        adjusted = adjusted || result.metaAdjusted;
        if (result.uuid)
            return adjusted;
        if (result.retryable === false)
            return adjusted;
        if (attempt < 19)
            await wait(100);
    }
    return adjusted;
}
async function ensureMaskImageMeta(dbUrl) {
    if (isMaskImageMetaReady(readAssetMetaFromDisk(dbUrl)))
        return false;
    try {
        const info = await (0, assetdb_1.requestAssetDb)('query-asset-info', dbUrl, [dbUrl]);
        const metaKey = info && info.uuid ? info.uuid : dbUrl;
        const rawMeta = await (0, assetdb_1.requestAssetDb)('query-asset-meta', String(metaKey), [metaKey]);
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        if (!meta || typeof meta !== 'object')
            return false;
        let changed = ensureSpriteFrameRootUserData(meta);
        const userData = meta.userData;
        const wantedUserData = {
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
            if (!sub || sub.importer !== 'sprite-frame')
                continue;
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
        if (!changed)
            return false;
        await (0, assetdb_1.requestAssetDb)('save-asset-meta', dbUrl, [metaKey, JSON.stringify(meta, null, 2)]);
        await (0, assetdb_1.requestAssetDb)('reimport-asset', dbUrl, [dbUrl]);
        return true;
    }
    catch (err) {
        (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
        console.warn(`[figma-importer] 修正遮罩 meta 失败，沿用默认导入设置 ${dbUrl}:`, err);
        return false;
    }
}
function md5Bytes(bytes) {
    return (0, crypto_1.createHash)('md5').update(bytes).digest('hex');
}
function hashImageBytes(bytes) {
    const png = (0, pngcrop_1.hashPngPixels)(bytes);
    const sig = (0, pngcrop_1.pngPerceptualSignature)(bytes);
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
function spriteFrameDedupKey(md5, border) {
    if (!border)
        return `${md5}|b:0,0,0,0`;
    const left = Math.max(0, Math.round(Number(border.left) || 0));
    const right = Math.max(0, Math.round(Number(border.right) || 0));
    const top = Math.max(0, Math.round(Number(border.top) || 0));
    const bottom = Math.max(0, Math.round(Number(border.bottom) || 0));
    return `${md5}|b:${left},${right},${top},${bottom}`;
}
function hasSlice9Border(border) {
    if (!border)
        return false;
    return [border.left, border.right, border.top, border.bottom]
        .some((value) => Math.max(0, Math.round(Number(value) || 0)) > 0);
}
function dbUrlToAssetPath(dbUrl) {
    const projectPath = Editor.Project && Editor.Project.path;
    if (!projectPath)
        return null;
    if (dbUrl === 'db://assets')
        return (0, path_1.join)(projectPath, 'assets');
    if (!dbUrl.startsWith('db://assets/'))
        return null;
    const relative = dbUrl.slice('db://assets/'.length);
    return (0, path_1.join)(projectPath, 'assets', relative);
}
/**
 * @en Query the SpriteFrame sub-asset uuid (the "父uuid@后缀" one), NOT the parent ImageAsset.
 * @zh 查 SpriteFrame 子资源 uuid（形如 父uuid@f9941），不是父图 uuid —— 引用父图会静默失败。
 *
 * 注意：asset-db query-asset-info 的子资源结构随版本不同，这里做了多形态兼容，
 *       待真机验证后再收敛（见会话验证步骤）。
 */
async function querySpriteFrameUuidOnce(dbUrl) {
    const diskUuid = readSpriteFrameUuidFromMeta(readAssetMetaFromDisk(dbUrl));
    const info = await (0, assetdb_1.requestAssetDb)('query-asset-info', dbUrl, [dbUrl]);
    if (!info)
        return null;
    const infoUuid = readSpriteFrameUuidFromInfo(info);
    if (infoUuid)
        return infoUuid;
    // Creator 3.8 can omit subAssets from query-asset-info while the exact SpriteFrame
    // UUID is already present in the imported meta. Read it instead of guessing @f9941.
    try {
        const metaKey = info.uuid || dbUrl;
        const rawMeta = await (0, assetdb_1.requestAssetDb)('query-asset-meta', String(metaKey), [metaKey]);
        const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta;
        const metaUuid = readSpriteFrameUuidFromMeta(meta);
        if (metaUuid)
            return metaUuid;
    }
    catch (err) {
        (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
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
async function querySpriteFrameUuid(dbUrl) {
    return querySpriteFrameUuidOnce(dbUrl);
}
/**
 * @zh 在建树前并发收敛短暂未就绪的 SpriteFrame。只有超过预算仍无精灵子资源的图片
 *     才进入品红占位降级，避免把正常的 asset-db 时序暴露给场景节点。
 */
async function resolveSpriteFramesBeforeBuild(pending, tries = 30, delayMs = 100) {
    const resolved = {};
    const unresolved = {};
    const entries = Object.entries(pending || {});
    const phaseRank = { root: 0, submeta: 1, uuid: 2 };
    const groups = new Map();
    for (const [imgId, rawPending] of entries) {
        const normalized = typeof rawPending === 'string'
            ? createPendingFigmaSpriteFrame(rawPending)
            : clonePendingSpriteFrame(rawPending);
        const key = spriteFramePendingKey(normalized);
        const group = groups.get(key);
        if (group) {
            group.imgIds.push(imgId);
            if (phaseRank[normalized.phase] > phaseRank[group.pending.phase])
                group.pending = normalized;
        }
        else {
            groups.set(key, { imgIds: [imgId], pending: normalized, uuid: null, exhausted: false });
        }
    }
    // 以轮次为外层：总等待预算与资源数量无关，同一 dbUrl/语义每轮只查询一次。
    const rounds = Math.max(1, tries);
    for (let attempt = 0; attempt < rounds; attempt++) {
        let remaining = 0;
        for (const group of groups.values()) {
            if (group.uuid || group.exhausted)
                continue;
            const result = await settleSpriteFrameOnce(group.pending);
            group.pending = result.pending;
            group.uuid = result.uuid;
            group.exhausted = result.retryable === false;
            if (!group.uuid && !group.exhausted)
                remaining++;
        }
        if (remaining === 0)
            break;
        if (attempt + 1 < rounds)
            await wait(delayMs);
    }
    for (const group of groups.values()) {
        for (const imgId of group.imgIds) {
            if (group.uuid)
                resolved[imgId] = group.uuid;
            else
                unresolved[imgId] = clonePendingSpriteFrame(group.pending);
        }
    }
    return { resolved, unresolved };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzZXRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc291cmNlL2Fzc2V0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFvSUEsc0VBa0JDO0FBa0ZELHNFQWdCQztBQU1ELHNEQVVDO0FBMERELGdDQXVJQztBQUVELHdDQXlHQztBQStCRCwwQ0FPQztBQUVELDBEQXdCQztBQUVELGtEQUdDO0FBRUQsMERBcURDO0FBNkVELDBEQUtDO0FBNEhELHNFQWNDO0FBcUNELHNEQWdIQztBQU1ELG9EQWlCQztBQTRGRCwwQ0FJQztBQStDRCxvREFFQztBQU1ELHdFQXNEQztBQXJ3Q0Q7Ozs7OztHQU1HO0FBQ0gsbUNBQW9DO0FBQ3BDLDJCQUFxRjtBQUNyRiwyQkFBNEI7QUFDNUIsK0JBQTRCO0FBQzVCLHVDQUttQjtBQUNuQixxQ0FBNkM7QUFDN0MsdUNBQXdFO0FBbUR4RSxNQUFNLElBQUksR0FBRyxDQUFDLEVBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUVyRixTQUFTLFlBQVksQ0FBQyxLQUFjO0lBQ2hDLElBQUksS0FBSyxZQUFZLEtBQUs7UUFBRSxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUM7SUFDakQsT0FBTyxNQUFNLENBQUMsS0FBSyxJQUFJLHVCQUF1QixDQUFDLENBQUM7QUFDcEQsQ0FBQztBQUVELEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxPQUFlLEVBQUUsS0FBYSxFQUFFLFFBQVEsR0FBRyxDQUFDO0lBQzVFLElBQUksU0FBUyxHQUFZLElBQUksQ0FBQztJQUM5QixLQUFLLElBQUksT0FBTyxHQUFHLENBQUMsRUFBRSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQztRQUMvRCxJQUFJLENBQUM7WUFD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LEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDakUsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM3RCxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQ3RFLENBQUM7SUFDTixDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDaEIsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQWdCLHFCQUFxQixDQUFDLENBQTRCLEVBQUUsQ0FBNEI7SUFDNUYsTUFBTSxJQUFJLEdBQUcsQ0FBQyxNQUFpQyxFQUFFLEVBQUUsQ0FBQztRQUNoRCxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzNELElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDNUQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1B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QUMsU0FBUyxLQUFLLEtBQUssQ0FBQztZQUM3QyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTO2dCQUFFLFNBQVMsRUFBRSxDQUFDO1FBQ3JELENBQUM7UUFDRCxJQUFJLFNBQVMsS0FBSyxDQUFDO1lBQUUsTUFBTTtRQUMzQixJQUFJLE9BQU8sR0FBRyxDQUFDLEdBQUcsTUFBTTtZQUFFLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1FBQ2xDLEtBQUssTUFBTSxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQy9CLElBQUksS0FBSyxDQUFDLElBQUk7Z0JBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7O2dCQUN4QyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsdUJBQXVCLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BFLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQztBQUNwQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAZW4gSW1hZ2UgcG9vbCDihpIgZGI6Ly8gYXNzZXQgbGFuZGluZyArIGJ5dGUtaGFzaCBkZWR1cCArIFNwcml0ZUZyYW1lIHN1Yi1hc3NldCBsb29rdXAuXG4gKiBAemgg5Zu+54mH5rGg6JC955uY77yaYmFzZTY0IOKGkiDkuLTml7bmlofku7Yg4oaSIOWvvOWFpSBkYjovLyDihpIg5p+lIFNwcml0ZUZyYW1lIOWtkOi1hOa6kCB1dWlk77yM5bim5a2X6IqCIE1ENSDljrvph43jgIJcbiAqXG4gKiDlhajlnKjkuLvov5vnqIvot5HvvIjlj6/nlKggZnMgKyBhc3NldC1kYiDmtojmga/vvInjgILpk4HlvovvvJpiYXNlNjQg5Y+q5Zyo6L+Z6YeM6JC955uY77yM57ud5LiN6L+bIHNjZW5lIElQQ+OAglxuICog56uv5Y+j6IeqIFNwcml0ZUNhY2hlLmNzIOeahOeyvuehruWtl+iKgiBoYXNoIOWOu+mHje+8iOaEn+efpeWMuemFjeWQjue9ru+8ieOAglxuICovXG5pbXBvcnQgeyBjcmVhdGVIYXNoIH0gZnJvbSAnY3J5cHRvJztcbmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYywgbWtkaXJTeW5jLCByZWFkZGlyU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbmltcG9ydCB7XG4gICAgaGFzaFBuZ1BpeGVscyxcbiAgICBwZXJjZXB0dWFsRGlzdGFuY2UsXG4gICAgcG5nUGVyY2VwdHVhbFNpZ25hdHVyZSxcbiAgICB3aGl0ZW5QbmdSZ2JLZWVwQWxwaGEsXG59IGZyb20gJy4vcG5nY3JvcCc7XG5pbXBvcnQgeyBjbGFtcFNsaWNlOUJvcmRlciB9IGZyb20gJy4vc2xpY2U5JztcbmltcG9ydCB7IHJlcXVlc3RBc3NldERiLCByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUgfSBmcm9tICcuL2Fzc2V0ZGInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEltYWdlSW1wb3J0UmVzdWx0IHtcbiAgICAvKiogQHpoIGltZ0lkIOKGkiBTcHJpdGVGcmFtZSDlrZDotYTmupAgdXVpZO+8iOWPr+ebtOaOpee7mSBTcHJpdGUuc3ByaXRlRnJhbWUg55So77yJICovXG4gICAgaWRUb1Nwcml0ZUZyYW1lOiB7IFtpbWdJZDogc3RyaW5nXTogc3RyaW5nIH07XG4gICAgLyoqXG4gICAgICogQHpoIGltZ0lkIOKGkiBkYjovLyDlm77niYcgdXJs77ya5bey6JC955uYL+WkjeeUqOaIkOWKn+OAgeS9hiBTcHJpdGVGcmFtZSDlrZDotYTmupDlsJrmnKrlsLHnu6rvvIhhc3NldC1kYiDlvILmraXph43lu7rkuK3vvInjgIJcbiAgICAgKiDlu7rmoJHml7blr7nov5nkupvlm77lhYjmjILlk4HnuqLljaDkvY3vvIznlLEgbWFpbiDlkI7lj7Dova7or6LlsLHnu6rlkI7mm7/mjaLmiJDnnJ/lm77vvIjljaDkvY3ihpLmm7/mjaLmlrnmoYjvvIzpgb/lhY3nq57mgIHmsLjkuYUgbWlzc++8ieOAglxuICAgICAqL1xuICAgIHVucmVzb2x2ZWQ6IHsgW2ltZ0lkOiBzdHJpbmddOiBQZW5kaW5nU3ByaXRlRnJhbWUgfTtcbiAgICAvKiogQHpoIOehrOWksei0peS4jeS8muWGjemdmem7mOaOieWHuui1hOa6kOi0puacrO+8m+S/neeVmeeyvuehrui1hOa6kCBVUkwg5ZKM5Y6f5Zug5L6b5a+85YWl5rGH5oC76K+K5pat44CCICovXG4gICAgZmFpbHVyZXM6IHsgW2ltZ0lkOiBzdHJpbmddOiBJbWFnZUltcG9ydEZhaWx1cmUgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbWFnZUltcG9ydEZhaWx1cmUge1xuICAgIGRiVXJsOiBzdHJpbmc7XG4gICAgc3RhZ2U6ICdpbXBvcnQnO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTcHJpdGVGcmFtZUJvcmRlciB7XG4gICAgbGVmdDogbnVtYmVyO1xuICAgIHJpZ2h0OiBudW1iZXI7XG4gICAgdG9wOiBudW1iZXI7XG4gICAgYm90dG9tOiBudW1iZXI7XG59XG5cbmV4cG9ydCB0eXBlIFNwcml0ZUZyYW1lUGVuZGluZ1BoYXNlID0gJ3Jvb3QnIHwgJ3N1Ym1ldGEnIHwgJ3V1aWQnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFBlbmRpbmdTcHJpdGVGcmFtZSB7XG4gICAgZGJVcmw6IHN0cmluZztcbiAgICBraW5kOiAnZmlnbWEnIHwgJ21hc2snO1xuICAgIGJvcmRlcj86IFNwcml0ZUZyYW1lQm9yZGVyO1xuICAgIGV4cGVjdGVkV2lkdGg6IG51bWJlcjtcbiAgICBleHBlY3RlZEhlaWdodDogbnVtYmVyO1xuICAgIHBoYXNlOiBTcHJpdGVGcmFtZVBlbmRpbmdQaGFzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTcHJpdGVGcmFtZVJlc29sdmVSZXN1bHQge1xuICAgIHJlc29sdmVkOiB7IFtpbWdJZDogc3RyaW5nXTogc3RyaW5nIH07XG4gICAgdW5yZXNvbHZlZDogeyBbaW1nSWQ6IHN0cmluZ106IFBlbmRpbmdTcHJpdGVGcmFtZSB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNwcml0ZUZyYW1lU2V0dGxlUmVzdWx0IHtcbiAgICBwZW5kaW5nOiBQZW5kaW5nU3ByaXRlRnJhbWU7XG4gICAgdXVpZDogc3RyaW5nIHwgbnVsbDtcbiAgICBtZXRhQWRqdXN0ZWQ6IGJvb2xlYW47XG4gICAgLyoqIEB6aCBmYWxzZSDooajnpLogQXNzZXREQiDlt7LmmI7noa7mi5Lnu53vvIzmnKzmibnmrKHkuI3opoHnu6fnu63ph43lpI3or7fmsYLjgIIgKi9cbiAgICByZXRyeWFibGU/OiBib29sZWFuO1xufVxuXG5jb25zdCB3YWl0ID0gKG1zOiBudW1iZXIpID0+IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIG1zKSk7XG5cbmZ1bmN0aW9uIGVycm9yTWVzc2FnZShlcnJvcjogdW5rbm93bik6IHN0cmluZyB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiBlcnJvci5tZXNzYWdlO1xuICAgIHJldHVybiBTdHJpbmcoZXJyb3IgfHwgJ1Vua25vd24gQXNzZXREQiBlcnJvcicpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpbXBvcnRBc3NldFdpdGhSZXRyeSh0bXBGaWxlOiBzdHJpbmcsIGRiVXJsOiBzdHJpbmcsIGF0dGVtcHRzID0gMyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBsYXN0RXJyb3I6IHVua25vd24gPSBudWxsO1xuICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgTWF0aC5tYXgoMSwgYXR0ZW1wdHMpOyBhdHRlbXB0KyspIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHJlcXVlc3RBc3NldERiKCdpbXBvcnQtYXNzZXQnLCBkYlVybCwgW3RtcEZpbGUsIGRiVXJsLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9XSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUoZXJyb3IpO1xuICAgICAgICAgICAgbGFzdEVycm9yID0gZXJyb3I7XG4gICAgICAgICAgICBpZiAoYXR0ZW1wdCArIDEgPCBhdHRlbXB0cykgYXdhaXQgd2FpdCgxNTAgKiAoYXR0ZW1wdCArIDEpKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBsYXN0RXJyb3I7XG59XG5cbmZ1bmN0aW9uIHJlYWRTcHJpdGVGcmFtZU1ldGFTaXplKG1ldGE6IGFueSk6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwge1xuICAgIGlmICghbWV0YSB8fCB0eXBlb2YgbWV0YSAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHN1Yk1ldGFzID0gbWV0YS5zdWJNZXRhcyB8fCB7fTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzdWJNZXRhcykpIHtcbiAgICAgICAgY29uc3Qgc3ViID0gc3ViTWV0YXNba2V5XTtcbiAgICAgICAgaWYgKCFzdWIgfHwgc3ViLmltcG9ydGVyICE9PSAnc3ByaXRlLWZyYW1lJykgY29udGludWU7XG4gICAgICAgIGNvbnN0IHVzZXJEYXRhID0gc3ViLnVzZXJEYXRhIHx8IHt9O1xuICAgICAgICBjb25zdCB3aWR0aCA9IE51bWJlcih1c2VyRGF0YS5yYXdXaWR0aCA/PyB1c2VyRGF0YS53aWR0aCA/PyBzdWIucmF3V2lkdGggPz8gc3ViLndpZHRoID8/IDApO1xuICAgICAgICBjb25zdCBoZWlnaHQgPSBOdW1iZXIodXNlckRhdGEucmF3SGVpZ2h0ID8/IHVzZXJEYXRhLmhlaWdodCA/PyBzdWIucmF3SGVpZ2h0ID8/IHN1Yi5oZWlnaHQgPz8gMCk7XG4gICAgICAgIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkgcmV0dXJuIHsgd2lkdGgsIGhlaWdodCB9O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuaW50ZXJmYWNlIEFzc2V0TWV0YVNuYXBzaG90IHtcbiAgICBpbmZvOiBhbnk7XG4gICAgbWV0YUtleTogc3RyaW5nO1xuICAgIG1ldGE6IGFueTtcbn1cblxuZnVuY3Rpb24gc3ByaXRlRnJhbWVNZXRhU2l6ZU1hdGNoZXMoXG4gICAgbWV0YTogYW55LFxuICAgIGV4cGVjdGVkV2lkdGg6IG51bWJlcixcbiAgICBleHBlY3RlZEhlaWdodDogbnVtYmVyLFxuKTogYm9vbGVhbiB7XG4gICAgY29uc3Qgc2l6ZSA9IHJlYWRTcHJpdGVGcmFtZU1ldGFTaXplKG1ldGEpO1xuICAgIGlmICghc2l6ZSkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChleHBlY3RlZFdpZHRoID4gMCAmJiBzaXplLndpZHRoICE9PSBleHBlY3RlZFdpZHRoKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKGV4cGVjdGVkSGVpZ2h0ID4gMCAmJiBzaXplLmhlaWdodCAhPT0gZXhwZWN0ZWRIZWlnaHQpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcXVlcnlBc3NldE1ldGFTbmFwc2hvdChkYlVybDogc3RyaW5nKTogUHJvbWlzZTxBc3NldE1ldGFTbmFwc2hvdCB8IG51bGw+IHtcbiAgICBjb25zdCBpbmZvOiBhbnkgPSBhd2FpdCByZXF1ZXN0QXNzZXREYigncXVlcnktYXNzZXQtaW5mbycsIGRiVXJsLCBbZGJVcmxdKTtcbiAgICBjb25zdCBtZXRhS2V5ID0gaW5mbyAmJiBpbmZvLnV1aWQgPyBTdHJpbmcoaW5mby51dWlkKSA6IGRiVXJsO1xuICAgIGNvbnN0IHJhd01ldGE6IGFueSA9IGF3YWl0IHJlcXVlc3RBc3NldERiKCdxdWVyeS1hc3NldC1tZXRhJywgbWV0YUtleSwgW21ldGFLZXldKTtcbiAgICBjb25zdCBtZXRhID0gdHlwZW9mIHJhd01ldGEgPT09ICdzdHJpbmcnID8gSlNPTi5wYXJzZShyYXdNZXRhKSA6IHJhd01ldGE7XG4gICAgaWYgKCFtZXRhIHx8IHR5cGVvZiBtZXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHsgaW5mbywgbWV0YUtleSwgbWV0YSB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5zdXJlU3ByaXRlRnJhbWVSb290VXNlckRhdGEoXG4gICAgbWV0YTogYW55LFxuICAgIGV4dHJhOiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge31cbik6IGJvb2xlYW4ge1xuICAgIGlmICghbWV0YSB8fCB0eXBlb2YgbWV0YSAhPT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuICAgIGlmICghbWV0YS51c2VyRGF0YSB8fCB0eXBlb2YgbWV0YS51c2VyRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgbWV0YS51c2VyRGF0YSA9IHt9O1xuICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3Qgd2FudGVkOiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0geyB0eXBlOiAnc3ByaXRlLWZyYW1lJywgLi4uZXh0cmEgfTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh3YW50ZWQpKSB7XG4gICAgICAgIGlmIChKU09OLnN0cmluZ2lmeShtZXRhLnVzZXJEYXRhW2tleV0pICE9PSBKU09OLnN0cmluZ2lmeSh3YW50ZWRba2V5XSkpIHtcbiAgICAgICAgICAgIG1ldGEudXNlckRhdGFba2V5XSA9IHdhbnRlZFtrZXldO1xuICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNoYW5nZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvamVjdFRleHR1cmVJbmRleEVudHJ5IHtcbiAgICBoYXNoOiBzdHJpbmc7XG4gICAgZGJVcmw6IHN0cmluZztcbiAgICB1dWlkOiBzdHJpbmc7XG4gICAgc3ByaXRlRnJhbWVVdWlkOiBzdHJpbmc7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICBzaWc/OiBCdWZmZXI7XG4gICAgc291cmNlOiAnZmlnbWEtaW1wb3J0JyB8ICdwcm9qZWN0JztcbiAgICB1c2FnZTogJ3Nwcml0ZScgfCAnbWFzayc7XG4gICAgLyoqXG4gICAgICog6L+Z5byg5Zu+6Lqr5LiK5bey54OY5aW955qE5Lmd5a6r6L656Led77yI6K+76Ieq56OB55uYIG1ldGHvvInjgILml6Dovrnot53ml7bkuLogbnVsbOOAglxuICAgICAqIOWkjeeUqOS5neWuq+WbvuaXtuW/hemhu+S4juW+heWvvOWFpeeahOi+uei3nemAkOWAvOebuOWQjO+8jOWQpuWImeWFseS6qyBTcHJpdGVGcmFtZSDkvJrkupLnm7jopobnm5YgaW5zZXTvvIjlj43ppoggIzE177yJ44CCXG4gICAgICovXG4gICAgYm9yZGVyPzogU3ByaXRlRnJhbWVCb3JkZXIgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2plY3RUZXh0dXJlSW5kZXgge1xuICAgIGJ5SGFzaDogeyBbaGFzaDogc3RyaW5nXTogUHJvamVjdFRleHR1cmVJbmRleEVudHJ5W10gfTtcbiAgICBwZXJjZXB0dWFsRW50cmllczogUHJvamVjdFRleHR1cmVJbmRleEVudHJ5W107XG4gICAgdG90YWw6IG51bWJlcjtcbiAgICBoYXNoZWQ6IG51bWJlcjtcbiAgICBza2lwcGVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW1hZ2VDb250ZW50SGFzaCB7XG4gICAgaGFzaDogc3RyaW5nO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgcmF3SGFzaDogc3RyaW5nO1xuICAgIHNpZz86IEJ1ZmZlcjtcbn1cblxuZXhwb3J0IGNvbnN0IEZJR01BX0lNQUdFX0RJUiA9ICdkYjovL2Fzc2V0cy9maWdtYSc7XG5leHBvcnQgY29uc3QgRklHTUFfTUFTS19ESVIgPSAnZGI6Ly9hc3NldHMvZmlnbWEtbWFza3MnO1xuY29uc3QgUEVSQ0VQVFVBTF9NRUFOX1RIUkVTSE9MRCA9IDguMDtcbmNvbnN0IFBFUkNFUFRVQUxfTUFYX1RIUkVTSE9MRCA9IDQwO1xuY29uc3QgUEVSQ0VQVFVBTF9TSVpFX1RPTEVSQU5DRSA9IDAuMjA7XG5cbmZ1bmN0aW9uIGlzR2VuZXJhdGVkRmlnbWFEYlVybChkYlVybDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZyhkYlVybCB8fCAnJykucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZWQgPT09IEZJR01BX0lNQUdFX0RJUiB8fCBub3JtYWxpemVkLnN0YXJ0c1dpdGgoYCR7RklHTUFfSU1BR0VfRElSfS9gKSB8fFxuICAgICAgICBub3JtYWxpemVkID09PSBGSUdNQV9NQVNLX0RJUiB8fCBub3JtYWxpemVkLnN0YXJ0c1dpdGgoYCR7RklHTUFfTUFTS19ESVJ9L2ApO1xufVxuXG5mdW5jdGlvbiByZWFkQXNzZXRNZXRhRnJvbURpc2soZGJVcmw6IHN0cmluZyk6IGFueSB8IG51bGwge1xuICAgIGNvbnN0IGFzc2V0UGF0aCA9IGRiVXJsVG9Bc3NldFBhdGgoZGJVcmwpO1xuICAgIGlmICghYXNzZXRQYXRoIHx8ICFleGlzdHNTeW5jKGAke2Fzc2V0UGF0aH0ubWV0YWApKSByZXR1cm4gbnVsbDtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShyZWFkRmlsZVN5bmMoYCR7YXNzZXRQYXRofS5tZXRhYCwgJ3V0ZjgnKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVhZFNwcml0ZUZyYW1lVXVpZEZyb21NZXRhKG1ldGE6IGFueSk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IHN1Yk1ldGFzID0gbWV0YSAmJiBtZXRhLnN1Yk1ldGFzO1xuICAgIGlmICghc3ViTWV0YXMgfHwgdHlwZW9mIHN1Yk1ldGFzICE9PSAnb2JqZWN0JykgcmV0dXJuIG51bGw7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoc3ViTWV0YXMpKSB7XG4gICAgICAgIGNvbnN0IHN1YiA9IHN1Yk1ldGFzW2tleV07XG4gICAgICAgIGlmIChzdWIgJiYgc3ViLmltcG9ydGVyID09PSAnc3ByaXRlLWZyYW1lJyAmJiBzdWIudXVpZCkgcmV0dXJuIFN0cmluZyhzdWIudXVpZCk7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIOivu+WHuuejgeebmCBtZXRhIOmHjOW3sueDmOWlveeahOS5neWuq+i+uei3ne+8jOWPliBzcHJpdGUtZnJhbWUg5a2QIG1ldGEg55qEIHVzZXJEYXRh44CCXG4gKiDkuI4gcmVhZFNwcml0ZUZyYW1lVXVpZEZyb21NZXRhIOi1sOWQjOS4gOadoeWumuS9jei3r+W+hO+8iGltcG9ydGVyID09PSAnc3ByaXRlLWZyYW1lJ++8ie+8jFxuICog5Lik6ICF6K+755qE5piv5ZCM5LiA5LiqIHN1Yk1ldGEg4oCU4oCUIOmhuuW6j+S4jeiDveWPjeedgOWGme+8mkNvY29zIOeahOWtl+auteaYr1xuICogYm9yZGVyVG9wL0JvdHRvbS9MZWZ0L1JpZ2h077yM6ICM5oiR5Lus5YaF6YOoIFNwcml0ZUZyYW1lQm9yZGVyIOaYryBsZWZ0L3JpZ2h0L3RvcC9ib3R0b23jgIJcbiAqXG4gKiDnlKjpgJTop4Hlj43ppoggIzE177ya6aG555uu6LS05Zu+57Si5byV5Y6f5YWI5Y+q5Y+WIHV1aWTvvIzkuo7mmK/lpI3nlKjliKTlrprml6Dku47lvpfnn6VcbiAqIOOAjOW3peeoi+mHjOmCo+W8oOWbvui6q+S4iueDmOeahOaYr+S7gOS5iOi+uei3neOAje+8jOWPquiDveS4gOWIgOWIh+OAjOW4puS5neWuq+WwseS4jeWkjeeUqOOAjeOAglxuICog5pyJ5LqG6L+Z5Liq5YC877yM5bCx6IO96YCA5oiQ44CM6L656Led6YCQ5YC855u45ZCM5omN5aSN55So44CN4oCU4oCU5YWx5LqrIFNwcml0ZUZyYW1lIOiiq+imhueblueahOmjjumZqVxuICog5oGw5oGw5Y+q5Zyo6L656Led5LiN5ZCM5pe25omN5a2Y5Zyo44CCXG4gKlxuICog5a+85Ye65piv5Li65LqG6K6p5rWL6K+V6IO96KaG55uW44CM6K+744CN6L+Z5LiA5L6n77ya5Yik5pat6ZO+5LiK44CM5YaZIC8g6K+7IC8g5Yik44CN5piv5LiJ5Liq54us56uL6JC954K577yMXG4gKiDlj6rmtYvliKTlrprpgLvovpHml7bvvIzov5nph4zov5Tlm54gbnVsbCDkuZ/og73lhajnu7/vvIjlrp7mtYvmpI3lhaXor6XlgYcgYnVnIOaXtiA4Lzgg5LuN6YCa6L+H77yJ77yMXG4gKiDkuo7mmK/lpI3nlKjmsLjov5zlkb3kuI3kuK3jgIHlkozmlLnkuYvliY3kuIDmqKHkuIDmoLcg4oCU4oCUIOmdmem7mOWkseaViOOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNwcml0ZUZyYW1lQm9yZGVyRnJvbU1ldGEobWV0YTogYW55KTogU3ByaXRlRnJhbWVCb3JkZXIgfCBudWxsIHtcbiAgICBjb25zdCBzdWJNZXRhcyA9IG1ldGEgJiYgbWV0YS5zdWJNZXRhcztcbiAgICBpZiAoIXN1Yk1ldGFzIHx8IHR5cGVvZiBzdWJNZXRhcyAhPT0gJ29iamVjdCcpIHJldHVybiBudWxsO1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHN1Yk1ldGFzKSkge1xuICAgICAgICBjb25zdCBzdWIgPSBzdWJNZXRhc1trZXldO1xuICAgICAgICBpZiAoIXN1YiB8fCBzdWIuaW1wb3J0ZXIgIT09ICdzcHJpdGUtZnJhbWUnKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgdXNlckRhdGEgPSBzdWIudXNlckRhdGE7XG4gICAgICAgIGlmICghdXNlckRhdGEgfHwgdHlwZW9mIHVzZXJEYXRhICE9PSAnb2JqZWN0JykgcmV0dXJuIG51bGw7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBsZWZ0OiBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKE51bWJlcih1c2VyRGF0YS5ib3JkZXJMZWZ0KSB8fCAwKSksXG4gICAgICAgICAgICByaWdodDogTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChOdW1iZXIodXNlckRhdGEuYm9yZGVyUmlnaHQpIHx8IDApKSxcbiAgICAgICAgICAgIHRvcDogTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChOdW1iZXIodXNlckRhdGEuYm9yZGVyVG9wKSB8fCAwKSksXG4gICAgICAgICAgICBib3R0b206IE1hdGgubWF4KDAsIE1hdGgucm91bmQoTnVtYmVyKHVzZXJEYXRhLmJvcmRlckJvdHRvbSkgfHwgMCkpLFxuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiDkuKTkuKrovrnot53mmK/lkKbpgJDlgLznm7jlkIzvvIjpg73mjIkgaGFzU2xpY2U5Qm9yZGVyIOeahOWPo+W+hOWFiOWPluaVtO+8ieOAglxuICogdW5kZWZpbmVkIC8gbnVsbCAvIOWFqCAwIOinhuS4uuOAjOaXoOi+uei3neOAje+8jOW9vOatpOebuOetieOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gc2FtZVNwcml0ZUZyYW1lQm9yZGVyKGE/OiBTcHJpdGVGcmFtZUJvcmRlciB8IG51bGwsIGI/OiBTcHJpdGVGcmFtZUJvcmRlciB8IG51bGwpOiBib29sZWFuIHtcbiAgICBjb25zdCBub3JtID0gKGJvcmRlcj86IFNwcml0ZUZyYW1lQm9yZGVyIHwgbnVsbCkgPT4gW1xuICAgICAgICBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKE51bWJlcihib3JkZXIgJiYgYm9yZGVyLmxlZnQpIHx8IDApKSxcbiAgICAgICAgTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChOdW1iZXIoYm9yZGVyICYmIGJvcmRlci5yaWdodCkgfHwgMCkpLFxuICAgICAgICBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKE51bWJlcihib3JkZXIgJiYgYm9yZGVyLnRvcCkgfHwgMCkpLFxuICAgICAgICBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKE51bWJlcihib3JkZXIgJiYgYm9yZGVyLmJvdHRvbSkgfHwgMCkpLFxuICAgIF07XG4gICAgY29uc3QgeCA9IG5vcm0oYSk7XG4gICAgY29uc3QgeSA9IG5vcm0oYik7XG4gICAgcmV0dXJuIHhbMF0gPT09IHlbMF0gJiYgeFsxXSA9PT0geVsxXSAmJiB4WzJdID09PSB5WzJdICYmIHhbM10gPT09IHlbM107XG59XG5cbmZ1bmN0aW9uIHJlYWRTcHJpdGVGcmFtZVV1aWRGcm9tSW5mbyhpbmZvOiBhbnkpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCBzdWJzID0gaW5mbyAmJiBpbmZvLnN1YkFzc2V0cztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShzdWJzKSkge1xuICAgICAgICBjb25zdCBzcHJpdGVGcmFtZSA9IHN1YnMuZmluZCgoc3ViOiBhbnkpID0+XG4gICAgICAgICAgICBzdWIgJiYgKHN1Yi50eXBlID09PSAnc3ByaXRlRnJhbWUnIHx8IHN1Yi50eXBlID09PSAnY2MuU3ByaXRlRnJhbWUnKSk7XG4gICAgICAgIHJldHVybiBzcHJpdGVGcmFtZSAmJiBzcHJpdGVGcmFtZS51dWlkID8gU3RyaW5nKHNwcml0ZUZyYW1lLnV1aWQpIDogbnVsbDtcbiAgICB9XG4gICAgaWYgKHN1YnMgJiYgdHlwZW9mIHN1YnMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHN1YnMpKSB7XG4gICAgICAgICAgICBjb25zdCBzdWIgPSBzdWJzW2tleV07XG4gICAgICAgICAgICBpZiAoc3ViICYmIHN1Yi51dWlkICYmXG4gICAgICAgICAgICAgICAgKHN1Yi5pbXBvcnRlciA9PT0gJ3Nwcml0ZS1mcmFtZScgfHwgc3ViLnR5cGUgPT09ICdjYy5TcHJpdGVGcmFtZScgfHwga2V5ID09PSAnc3ByaXRlRnJhbWUnKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBTdHJpbmcoc3ViLnV1aWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG4vKiogQHpoIOWvuem9kCBVbml0eSBTcHJpdGVDYWNoZe+8muS7jumFjee9ruebruW9leebtOaOpeaemuS4vuWbvueJh++8jOmBv+WFjeWuveazmyBxdWVyeS1hc3NldHMg5Y2h5L2PIEFzc2V0RELjgIIgKi9cbmZ1bmN0aW9uIGxpc3RQcm9qZWN0VGV4dHVyZVVybHMoZGlyczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgdXJscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHdhbGsgPSAoZGlza0Rpcjogc3RyaW5nLCBkYkRpcjogc3RyaW5nKSA9PiB7XG4gICAgICAgIGlmIChpc0dlbmVyYXRlZEZpZ21hRGJVcmwoZGJEaXIpKSByZXR1cm47XG4gICAgICAgIGxldCBlbnRyaWVzO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgZW50cmllcyA9IHJlYWRkaXJTeW5jKGRpc2tEaXIsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgICAgICBjb25zdCBkaXNrUGF0aCA9IGpvaW4oZGlza0RpciwgZW50cnkubmFtZSk7XG4gICAgICAgICAgICBjb25zdCBkYlVybCA9IGAke2RiRGlyfS8ke2VudHJ5Lm5hbWV9YDtcbiAgICAgICAgICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgICAgICAgd2FsayhkaXNrUGF0aCwgZGJVcmwpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlbnRyeS5pc0ZpbGUoKSAmJiAvXFwuKHBuZ3xqcGU/ZykkL2kudGVzdChlbnRyeS5uYW1lKSkge1xuICAgICAgICAgICAgICAgIHVybHMuYWRkKGRiVXJsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGRpciBvZiBkaXJzKSB7XG4gICAgICAgIGNvbnN0IGRiRGlyID0gU3RyaW5nKGRpciB8fCAnJykucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG4gICAgICAgIGlmICghZGJEaXIuc3RhcnRzV2l0aCgnZGI6Ly9hc3NldHMnKSB8fCBpc0dlbmVyYXRlZEZpZ21hRGJVcmwoZGJEaXIpKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgZGlza0RpciA9IGRiVXJsVG9Bc3NldFBhdGgoZGJEaXIpO1xuICAgICAgICBpZiAoZGlza0RpciAmJiBleGlzdHNTeW5jKGRpc2tEaXIpKSB3YWxrKGRpc2tEaXIsIGRiRGlyKTtcbiAgICB9XG4gICAgcmV0dXJuIEFycmF5LmZyb20odXJscyk7XG59XG5cbi8qKlxuICogQGVuIExhbmQgZXZlcnkgaW1hZ2UgaW4gdGhlIHBvb2wgYW5kIHJldHVybiBpbWdJZCDihpIgU3ByaXRlRnJhbWUgdXVpZC5cbiAqIEB6aCDokL3nm5jlm77niYfmsaDvvIzov5Tlm54gaW1nSWQg4oaSIFNwcml0ZUZyYW1lIHV1aWQg5pig5bCE44CCXG4gKiBAcGFyYW0gaW1hZ2VzIOWlkee6pumHjOeahCBpbWFnZXMg5rGg77yaaWQg4oaSIGJhc2U2NChQTkcpXG4gKiBAcGFyYW0gaW50ZXJmYWNlTmFtZSDnlYzpnaLlkI3vvIznlKjkvZwgZGI6Ly9hc3NldHMvZmlnbWEvPG5hbWU+LyDlrZDnm67lvZVcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxhbmRJbWFnZXMoXG4gICAgaW1hZ2VzOiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIH0sXG4gICAgaW50ZXJmYWNlTmFtZTogc3RyaW5nLFxuICAgIHNwcml0ZUZyYW1lQm9yZGVyczogeyBbaW1nSWQ6IHN0cmluZ106IFNwcml0ZUZyYW1lQm9yZGVyIH0gPSB7fSxcbiAgICBzY2FuRGlycz86IHN0cmluZ1tdXG4pOiBQcm9taXNlPEltYWdlSW1wb3J0UmVzdWx0PiB7XG4gICAgY29uc3QgaWRUb1Nwcml0ZUZyYW1lOiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcbiAgICBjb25zdCB1bnJlc29sdmVkOiB7IFtpZDogc3RyaW5nXTogUGVuZGluZ1Nwcml0ZUZyYW1lIH0gPSB7fTtcbiAgICBjb25zdCBmYWlsdXJlczogeyBbaWQ6IHN0cmluZ106IEltYWdlSW1wb3J0RmFpbHVyZSB9ID0ge307XG4gICAgLy8g5a2X6IqCIE1ENSArIFNwcml0ZUZyYW1lIGJvcmRlciDihpIgU3ByaXRlRnJhbWUgdXVpZO+8muWQjOS4gOS7vSBQTkcg5LiU5ZCM5LiA5a+85YWl6K+t5LmJ5omN5aSN55So44CCXG4gICAgLy8g55u45ZCMIFBORyDoi6XooqvkuI3lkIzkuZ3lrqvmoLwgYm9yZGVyIOS9v+eUqO+8jOW/hemhu+iQveaIkOS4jeWQjCBTcHJpdGVGcmFtZe+8jOWQpuWImeS8muaLieS8uOmUmeivr+OAglxuICAgIGNvbnN0IGhhc2hUb1Nwcml0ZUZyYW1lOiB7IFttZDU6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgbGV0IGltcG9ydGVkID0gMDtcbiAgICBsZXQgcmV1c2VkVW5jaGFuZ2VkID0gMDtcbiAgICBsZXQgcmV1c2VkSW5Qb29sID0gMDtcbiAgICBsZXQgcmV1c2VkUHJvamVjdCA9IDA7XG4gICAgbGV0IG1ldGFBZGp1c3RlZCA9IDA7XG5cbiAgICBjb25zdCBzYWZlTmFtZSA9IChpbnRlcmZhY2VOYW1lIHx8ICd1bnRpdGxlZCcpLnJlcGxhY2UoL1teXFx35LiALem+pS1dL2csICdfJyk7XG4gICAgY29uc3QgZGJGb2xkZXIgPSBgJHtGSUdNQV9JTUFHRV9ESVJ9LyR7c2FmZU5hbWV9YDtcbiAgICBlbnN1cmVBc3NldEZvbGRlck9uRGlzayhGSUdNQV9JTUFHRV9ESVIpO1xuICAgIGVuc3VyZUFzc2V0Rm9sZGVyT25EaXNrKGRiRm9sZGVyKTtcbiAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSBBc3NldERCIOmYtuautSBmb2xkZXIgcmVhZHk6ICR7ZGJGb2xkZXJ9YCk7XG4gICAgY29uc3QgcHJvamVjdFRleHR1cmVJbmRleCA9IGF3YWl0IHNjYW5Qcm9qZWN0VGV4dHVyZUluZGV4KHNjYW5EaXJzKTtcblxuICAgIGNvbnN0IHRtcEJhc2UgPSBqb2luKHRtcGRpcigpLCAnZmlnbWEtaW1wb3J0ZXInKTtcbiAgICBta2RpclN5bmModG1wQmFzZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cbiAgICBmb3IgKGNvbnN0IGltZ0lkIG9mIE9iamVjdC5rZXlzKGltYWdlcykpIHtcbiAgICAgICAgY29uc3QgYmFzZTY0ID0gaW1hZ2VzW2ltZ0lkXTtcbiAgICAgICAgaWYgKCFiYXNlNjQpIGNvbnRpbnVlO1xuXG4gICAgICAgIGNvbnN0IGJ5dGVzID0gQnVmZmVyLmZyb20oYmFzZTY0LCAnYmFzZTY0Jyk7XG4gICAgICAgIGNvbnN0IGNvbnRlbnRIYXNoID0gaGFzaEltYWdlQnl0ZXMoYnl0ZXMpO1xuICAgICAgICBjb25zdCBtZDUgPSBjb250ZW50SGFzaC5yYXdIYXNoO1xuICAgICAgICBjb25zdCBkZWR1cEtleSA9IHNwcml0ZUZyYW1lRGVkdXBLZXkoY29udGVudEhhc2guaGFzaCwgc3ByaXRlRnJhbWVCb3JkZXJzW2ltZ0lkXSk7XG4gICAgICAgIGNvbnN0IGRiVXJsID0gYCR7ZGJGb2xkZXJ9LyR7aW1nSWR9LnBuZ2A7XG5cbiAgICAgICAgLy8g5Y676YeN5ZG95Lit77ya55u05o6l5aSN55SoXG4gICAgICAgIGlmIChoYXNoVG9TcHJpdGVGcmFtZVtkZWR1cEtleV0pIHtcbiAgICAgICAgICAgIGlkVG9TcHJpdGVGcmFtZVtpbWdJZF0gPSBoYXNoVG9TcHJpdGVGcmFtZVtkZWR1cEtleV07XG4gICAgICAgICAgICByZXVzZWRJblBvb2wrKztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQSBwcm9qZWN0IFNwcml0ZUZyYW1lIGlzIHNoYXJlZCBieSBhbGwgY29uc3VtZXJzLiDlpI3nlKjkuZ3lrqvlm77ml7bovrnot53lv4XpobvpgJDlgLznm7jlkIzvvIxcbiAgICAgICAgLy8g5ZCm5YiZIHNjZW5lLnRzIOWGmeeahCBwZXItbm9kZSBpbnNldCDkvJrkupLnm7jopobnm5bvvIjlj43ppoggIzE1IOeahOWOn+Wni+WPluiIjeWwseaYr+S4uuS6humYsui/meS4qu+8jFxuICAgICAgICAvLyDkvYblvZPml7bmmK/kuIDliIDliIfjgIzluKbkuZ3lrqvlsLHkuI3lpI3nlKjjgI3vvIzku6Pku7fmmK/kuZ3lrqvlm77msLjov5zlkb3kuI3kuK3lt6XnqIvotYTmupDjgIHmr4/mrKHpg73okL3mlrDlm77vvInjgIJcbiAgICAgICAgLy8g6L656Led5Yik5a6a5LiL5rKJ5YiwIHBpY2tQcm9qZWN0VGV4dHVyZU1hdGNo77yM6YKj6YeM5ZCM5pe25oyh5o6J5LqG5Lmd5a6r55qE5oSf55+l5Yy56YWN44CCXG4gICAgICAgIGNvbnN0IHByb2plY3RNYXRjaCA9IHBpY2tQcm9qZWN0VGV4dHVyZU1hdGNoKFxuICAgICAgICAgICAgcHJvamVjdFRleHR1cmVJbmRleCwgY29udGVudEhhc2gsIGZhbHNlLCBzcHJpdGVGcmFtZUJvcmRlcnNbaW1nSWRdKTtcbiAgICAgICAgaWYgKHByb2plY3RNYXRjaCAmJiBwcm9qZWN0TWF0Y2guc3ByaXRlRnJhbWVVdWlkKSB7XG4gICAgICAgICAgICBjb25zdCBsaXZlVXVpZCA9IGF3YWl0IHZhbGlkYXRlUHJvamVjdFNwcml0ZUZyYW1lKHByb2plY3RNYXRjaCk7XG4gICAgICAgICAgICBpZiAobGl2ZVV1aWQpIHtcbiAgICAgICAgICAgICAgICBpZFRvU3ByaXRlRnJhbWVbaW1nSWRdID0gbGl2ZVV1aWQ7XG4gICAgICAgICAgICAgICAgaGFzaFRvU3ByaXRlRnJhbWVbZGVkdXBLZXldID0gbGl2ZVV1aWQ7XG4gICAgICAgICAgICAgICAgcmV1c2VkUHJvamVjdCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOmhueebrui0tOWbvuWRveS4reS9hiBsaXZlIFNwcml0ZUZyYW1lIOacquWwsee7qu+8jOaUueS4uumalOemu+WvvOWFpe+8miR7cHJvamVjdE1hdGNoLmRiVXJsfWBcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyDnm67moIfmlofku7blhoXlrrnmsqHlj5jml7bvvIzkuI3lho0gb3ZlcndyaXRlL2ltcG9ydC1hc3NldOOAglxuICAgICAgICAvLyDov5nog73pgb/lhY3ph43lpI3lr7zlhaXlkIzkuIDnqL/ml7bop6blj5EgYXNzZXQtZGIg5Yi35paw77yM5omT5pat5Yia5bu65aW955qE5Zy65pmv5riy5p+T44CCXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRmlsZSA9IGRiVXJsVG9Bc3NldFBhdGgoZGJVcmwpO1xuICAgICAgICBpZiAoZXhpc3RpbmdGaWxlICYmIGV4aXN0c1N5bmMoZXhpc3RpbmdGaWxlKSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ0J5dGVzID0gcmVhZEZpbGVTeW5jKGV4aXN0aW5nRmlsZSk7XG4gICAgICAgICAgICAgICAgaWYgKG1kNUJ5dGVzKGV4aXN0aW5nQnl0ZXMpID09PSBtZDUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2V0dGxlZCA9IGF3YWl0IHNldHRsZVNwcml0ZUZyYW1lT25jZShjcmVhdGVQZW5kaW5nRmlnbWFTcHJpdGVGcmFtZShcbiAgICAgICAgICAgICAgICAgICAgICAgIGRiVXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3ByaXRlRnJhbWVCb3JkZXJzW2ltZ0lkXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnRIYXNoLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGVudEhhc2guaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICApKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNldHRsZWQubWV0YUFkanVzdGVkKSBtZXRhQWRqdXN0ZWQrKztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNldHRsZWQudXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWRUb1Nwcml0ZUZyYW1lW2ltZ0lkXSA9IHNldHRsZWQudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhc2hUb1Nwcml0ZUZyYW1lW2RlZHVwS2V5XSA9IHNldHRsZWQudXVpZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldXNlZFVuY2hhbmdlZCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8g5paH5Lu25Zyo44CB5YaF5a655a+577yM5L2GIG1ldGEv5a2Q6LWE5rqQ5bCa5pyq5a6M5pW05pS25pWb77yaXG4gICAgICAgICAgICAgICAgICAgIC8vIOiusOWFpSB1bnJlc29sdmVk77yM5Lqk55Sx5ZCO5Y+w5bCx57uq5ZCO5pu/5o2i77yM6ICM6Z2e5Zyo5q2k6Zi75aGe6L2u6K+i44CCXG4gICAgICAgICAgICAgICAgICAgIHVucmVzb2x2ZWRbaW1nSWRdID0gc2V0dGxlZC5wZW5kaW5nO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUoZXJyKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtmaWdtYS1pbXBvcnRlcl0g6K+75Y+W5bey5pyJ5Zu+54mH5aSx6LSl77yM5bCG6YeN5paw5a+85YWlICR7ZGJVcmx9OmAsIGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyDlhpnkuLTml7bmlofku7Yg4oaSIOWvvOWFpSBkYjovL1xuICAgICAgICBjb25zdCB0bXBGaWxlID0gam9pbih0bXBCYXNlLCBgJHtpbWdJZH0ucG5nYCk7XG4gICAgICAgIHdyaXRlRmlsZVN5bmModG1wRmlsZSwgYnl0ZXMpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoaW1wb3J0ZWQgPCAzIHx8IChpbXBvcnRlZCArIDEpICUgNTAgPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSBBc3NldERCIOmYtuautSBpbXBvcnQgaW1hZ2UgJHtpbXBvcnRlZCArIDF9OiAke2RiVXJsfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYXdhaXQgaW1wb3J0QXNzZXRXaXRoUmV0cnkodG1wRmlsZSwgZGJVcmwpO1xuICAgICAgICAgICAgaW1wb3J0ZWQrKztcbiAgICAgICAgICAgIGNvbnN0IHNldHRsZWQgPSBhd2FpdCBzZXR0bGVTcHJpdGVGcmFtZU9uY2UoY3JlYXRlUGVuZGluZ0ZpZ21hU3ByaXRlRnJhbWUoXG4gICAgICAgICAgICAgICAgZGJVcmwsXG4gICAgICAgICAgICAgICAgc3ByaXRlRnJhbWVCb3JkZXJzW2ltZ0lkXSxcbiAgICAgICAgICAgICAgICBjb250ZW50SGFzaC53aWR0aCxcbiAgICAgICAgICAgICAgICBjb250ZW50SGFzaC5oZWlnaHQsXG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIGlmIChzZXR0bGVkLm1ldGFBZGp1c3RlZCkgbWV0YUFkanVzdGVkKys7XG4gICAgICAgICAgICBpZiAoc2V0dGxlZC51dWlkKSB7XG4gICAgICAgICAgICAgICAgaWRUb1Nwcml0ZUZyYW1lW2ltZ0lkXSA9IHNldHRsZWQudXVpZDtcbiAgICAgICAgICAgICAgICBoYXNoVG9TcHJpdGVGcmFtZVtkZWR1cEtleV0gPSBzZXR0bGVkLnV1aWQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIOiQveebmOaIkOWKn+S9hiBtZXRhL+WtkOi1hOa6kOWwmuacquWujOaVtOaUtuaVm++8iGltcG9ydCArIHJlaW1wb3J0IOW8guatpemHjeW7uuS4re+8ie+8mlxuICAgICAgICAgICAgICAgIC8vIOS4jeWcqOatpOmYu+Whnui9ruivou+8jOiusOWFpSB1bnJlc29sdmVk77yM5bu65qCR5YWI5oyC5ZOB57qi5Y2g5L2N44CB5ZCO5Y+w5bCx57uq5ZCO5pu/5o2i44CCXG4gICAgICAgICAgICAgICAgdW5yZXNvbHZlZFtpbWdJZF0gPSBzZXR0bGVkLnBlbmRpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmV0aHJvd0lmQXNzZXREYlVuYXZhaWxhYmxlKGVycik7XG4gICAgICAgICAgICBmYWlsdXJlc1tpbWdJZF0gPSB7IGRiVXJsLCBzdGFnZTogJ2ltcG9ydCcsIG1lc3NhZ2U6IGVycm9yTWVzc2FnZShlcnIpIH07XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBbZmlnbWEtaW1wb3J0ZXJdIGltcG9ydCBmYWlsZWQgZm9yICR7aW1nSWR9OmAsIGVycik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0g5Zu+54mH6JC955uY5a6M5oiQ77yaJHtpbXBvcnRlZH0g5byg5a+85YWl77yMJHtyZXVzZWRVbmNoYW5nZWR9IOW8oOWkjeeUqOacquWPmOaWh+S7tu+8jGAgK1xuICAgICAgICBgJHtyZXVzZWRQcm9qZWN0fSDlvKDlpI3nlKjpobnnm67mraPlvI/otYTmupDvvIwke3JldXNlZEluUG9vbH0g5byg5rGg5YaF5Y676YeN77yMYCArXG4gICAgICAgIGAke21ldGFBZGp1c3RlZH0g5byg5oyJIEZpZ21hL1VuaXR5IOivreS5ieS/ruatoyBtZXRhYCArXG4gICAgICAgIGAke09iamVjdC5rZXlzKHVucmVzb2x2ZWQpLmxlbmd0aCA+IDAgPyBg77yMJHtPYmplY3Qua2V5cyh1bnJlc29sdmVkKS5sZW5ndGh9IOW8oOW+heWQjuWPsOWwsee7quabv+aNomAgOiAnJ31gICtcbiAgICAgICAgYCR7T2JqZWN0LmtleXMoZmFpbHVyZXMpLmxlbmd0aCA+IDAgPyBg77yMJHtPYmplY3Qua2V5cyhmYWlsdXJlcykubGVuZ3RofSDlvKDlr7zlhaXnoazlpLHotKVgIDogJyd944CCYFxuICAgICk7XG4gICAgcmV0dXJuIHsgaWRUb1Nwcml0ZUZyYW1lLCB1bnJlc29sdmVkLCBmYWlsdXJlcyB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbGFuZE1hc2tJbWFnZXMoXG4gICAgaW1hZ2VzOiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIH0sXG4gICAgaW50ZXJmYWNlTmFtZTogc3RyaW5nLFxuICAgIHNjYW5EaXJzPzogc3RyaW5nW11cbik6IFByb21pc2U8SW1hZ2VJbXBvcnRSZXN1bHQ+IHtcbiAgICBjb25zdCBpZFRvU3ByaXRlRnJhbWU6IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfSA9IHt9O1xuICAgIGNvbnN0IHVucmVzb2x2ZWQ6IHsgW2lkOiBzdHJpbmddOiBQZW5kaW5nU3ByaXRlRnJhbWUgfSA9IHt9O1xuICAgIGNvbnN0IGZhaWx1cmVzOiB7IFtpZDogc3RyaW5nXTogSW1hZ2VJbXBvcnRGYWlsdXJlIH0gPSB7fTtcbiAgICBjb25zdCBoYXNoVG9TcHJpdGVGcmFtZTogeyBbaGFzaDogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcbiAgICBsZXQgaW1wb3J0ZWQgPSAwO1xuICAgIGxldCByZXVzZWRVbmNoYW5nZWQgPSAwO1xuICAgIGxldCByZXVzZWRQcm9qZWN0ID0gMDtcbiAgICBsZXQgcmV1c2VkSW5Qb29sID0gMDtcbiAgICBsZXQgbWV0YUFkanVzdGVkID0gMDtcblxuICAgIGNvbnN0IHNhZmVOYW1lID0gKGludGVyZmFjZU5hbWUgfHwgJ3VudGl0bGVkJykucmVwbGFjZSgvW15cXHfkuIAt6b6lLV0vZywgJ18nKTtcbiAgICBjb25zdCBkYkZvbGRlciA9IGAke0ZJR01BX01BU0tfRElSfS8ke3NhZmVOYW1lfWA7XG4gICAgZW5zdXJlQXNzZXRGb2xkZXJPbkRpc2soRklHTUFfTUFTS19ESVIpO1xuICAgIGVuc3VyZUFzc2V0Rm9sZGVyT25EaXNrKGRiRm9sZGVyKTtcbiAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSBBc3NldERCIOmYtuautSBtYXNrIGZvbGRlciByZWFkeTogJHtkYkZvbGRlcn1gKTtcbiAgICBjb25zdCBwcm9qZWN0VGV4dHVyZUluZGV4ID0gYXdhaXQgc2NhblByb2plY3RUZXh0dXJlSW5kZXgoc2NhbkRpcnMpO1xuXG4gICAgY29uc3QgdG1wQmFzZSA9IGpvaW4odG1wZGlyKCksICdmaWdtYS1pbXBvcnRlcicpO1xuICAgIG1rZGlyU3luYyh0bXBCYXNlLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuICAgIGZvciAoY29uc3QgaW1nSWQgb2YgT2JqZWN0LmtleXMoaW1hZ2VzKSkge1xuICAgICAgICBjb25zdCBiYXNlNjQgPSBpbWFnZXNbaW1nSWRdO1xuICAgICAgICBpZiAoIWJhc2U2NCkgY29udGludWU7XG5cbiAgICAgICAgY29uc3QgYnl0ZXMgPSB3aGl0ZW5QbmdSZ2JLZWVwQWxwaGEoQnVmZmVyLmZyb20oYmFzZTY0LCAnYmFzZTY0JykpO1xuICAgICAgICBjb25zdCBjb250ZW50SGFzaCA9IGhhc2hJbWFnZUJ5dGVzKGJ5dGVzKTtcbiAgICAgICAgY29uc3QgZGJVcmwgPSBgJHtkYkZvbGRlcn0vJHtpbWdJZH0ucG5nYDtcblxuICAgICAgICBpZiAoaGFzaFRvU3ByaXRlRnJhbWVbY29udGVudEhhc2guaGFzaF0pIHtcbiAgICAgICAgICAgIGlkVG9TcHJpdGVGcmFtZVtpbWdJZF0gPSBoYXNoVG9TcHJpdGVGcmFtZVtjb250ZW50SGFzaC5oYXNoXTtcbiAgICAgICAgICAgIHJldXNlZEluUG9vbCsrO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwcm9qZWN0TWF0Y2ggPSBwaWNrUHJvamVjdFRleHR1cmVNYXRjaChwcm9qZWN0VGV4dHVyZUluZGV4LCBjb250ZW50SGFzaCwgdHJ1ZSk7XG4gICAgICAgIGlmIChwcm9qZWN0TWF0Y2ggJiYgcHJvamVjdE1hdGNoLnNwcml0ZUZyYW1lVXVpZCkge1xuICAgICAgICAgICAgY29uc3QgbGl2ZVV1aWQgPSBhd2FpdCB2YWxpZGF0ZVByb2plY3RTcHJpdGVGcmFtZShwcm9qZWN0TWF0Y2gpO1xuICAgICAgICAgICAgaWYgKGxpdmVVdWlkKSB7XG4gICAgICAgICAgICAgICAgaWRUb1Nwcml0ZUZyYW1lW2ltZ0lkXSA9IGxpdmVVdWlkO1xuICAgICAgICAgICAgICAgIGhhc2hUb1Nwcml0ZUZyYW1lW2NvbnRlbnRIYXNoLmhhc2hdID0gbGl2ZVV1aWQ7XG4gICAgICAgICAgICAgICAgcmV1c2VkUHJvamVjdCsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOmhueebrumBrue9qeWRveS4reS9hiBsaXZlIFNwcml0ZUZyYW1lIOacquWwsee7qu+8jOaUueS4uumalOemu+WvvOWFpe+8miR7cHJvamVjdE1hdGNoLmRiVXJsfWBcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSBkYlVybFRvQXNzZXRQYXRoKGRiVXJsKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nRmlsZSAmJiBleGlzdHNTeW5jKGV4aXN0aW5nRmlsZSkpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdCeXRlcyA9IHJlYWRGaWxlU3luYyhleGlzdGluZ0ZpbGUpO1xuICAgICAgICAgICAgICAgIGlmIChoYXNoSW1hZ2VCeXRlcyhleGlzdGluZ0J5dGVzKS5oYXNoID09PSBjb250ZW50SGFzaC5oYXNoKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhd2FpdCBlbnN1cmVNYXNrSW1hZ2VNZXRhKGRiVXJsKSkgbWV0YUFkanVzdGVkKys7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNmVXVpZCA9IGF3YWl0IHF1ZXJ5U3ByaXRlRnJhbWVVdWlkKGRiVXJsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNmVXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWRUb1Nwcml0ZUZyYW1lW2ltZ0lkXSA9IHNmVXVpZDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhc2hUb1Nwcml0ZUZyYW1lW2NvbnRlbnRIYXNoLmhhc2hdID0gc2ZVdWlkO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV1c2VkVW5jaGFuZ2VkKys7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB1bnJlc29sdmVkW2ltZ0lkXSA9IGNyZWF0ZVBlbmRpbmdNYXNrU3ByaXRlRnJhbWUoZGJVcmwpO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUoZXJyKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFtmaWdtYS1pbXBvcnRlcl0g6K+75Y+W5bey5pyJ6YGu572p5aSx6LSl77yM5bCG6YeN5paw5a+85YWlICR7ZGJVcmx9OmAsIGVycik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0bXBGaWxlID0gam9pbih0bXBCYXNlLCBgJHtpbWdJZH0tbWFzay5wbmdgKTtcbiAgICAgICAgd3JpdGVGaWxlU3luYyh0bXBGaWxlLCBieXRlcyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoaW1wb3J0ZWQgPCAzIHx8IChpbXBvcnRlZCArIDEpICUgNTAgPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSBBc3NldERCIOmYtuautSBpbXBvcnQgbWFzayAke2ltcG9ydGVkICsgMX06ICR7ZGJVcmx9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCBpbXBvcnRBc3NldFdpdGhSZXRyeSh0bXBGaWxlLCBkYlVybCk7XG4gICAgICAgICAgICBpbXBvcnRlZCsrO1xuICAgICAgICAgICAgaWYgKGF3YWl0IGVuc3VyZU1hc2tJbWFnZU1ldGEoZGJVcmwpKSBtZXRhQWRqdXN0ZWQrKztcbiAgICAgICAgICAgIGNvbnN0IHNmVXVpZCA9IGF3YWl0IHF1ZXJ5U3ByaXRlRnJhbWVVdWlkKGRiVXJsKTtcbiAgICAgICAgICAgIGlmIChzZlV1aWQpIHtcbiAgICAgICAgICAgICAgICBpZFRvU3ByaXRlRnJhbWVbaW1nSWRdID0gc2ZVdWlkO1xuICAgICAgICAgICAgICAgIGhhc2hUb1Nwcml0ZUZyYW1lW2NvbnRlbnRIYXNoLmhhc2hdID0gc2ZVdWlkO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB1bnJlc29sdmVkW2ltZ0lkXSA9IGNyZWF0ZVBlbmRpbmdNYXNrU3ByaXRlRnJhbWUoZGJVcmwpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJldGhyb3dJZkFzc2V0RGJVbmF2YWlsYWJsZShlcnIpO1xuICAgICAgICAgICAgZmFpbHVyZXNbaW1nSWRdID0geyBkYlVybCwgc3RhZ2U6ICdpbXBvcnQnLCBtZXNzYWdlOiBlcnJvck1lc3NhZ2UoZXJyKSB9O1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgW2ZpZ21hLWltcG9ydGVyXSBtYXNrIGltcG9ydCBmYWlsZWQgZm9yICR7aW1nSWR9OmAsIGVycik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0g6YGu572p6JC955uY5a6M5oiQ77yaJHtpbXBvcnRlZH0g5byg5a+85YWl77yMJHtyZXVzZWRVbmNoYW5nZWR9IOW8oOWkjeeUqOacquWPmOaWh+S7tu+8jGAgK1xuICAgICAgICBgJHtyZXVzZWRQcm9qZWN0fSDlvKDlpI3nlKjpobnnm64gQWxwaGE4IOmBrue9qe+8jCR7cmV1c2VkSW5Qb29sfSDlvKDmsaDlhoXljrvph43vvIwke21ldGFBZGp1c3RlZH0g5byg5L+u5q2jIG1hc2sgbWV0YWAgK1xuICAgICAgICBgJHtPYmplY3Qua2V5cyh1bnJlc29sdmVkKS5sZW5ndGggPiAwID8gYO+8jCR7T2JqZWN0LmtleXModW5yZXNvbHZlZCkubGVuZ3RofSDlvKDlvoXlkI7lj7DlsLHnu6rmm7/mjaJgIDogJyd9YCArXG4gICAgICAgIGAke09iamVjdC5rZXlzKGZhaWx1cmVzKS5sZW5ndGggPiAwID8gYO+8jCR7T2JqZWN0LmtleXMoZmFpbHVyZXMpLmxlbmd0aH0g5byg5a+85YWl56Gs5aSx6LSlYCA6ICcnfeOAgmBcbiAgICApO1xuICAgIHJldHVybiB7IGlkVG9TcHJpdGVGcmFtZSwgdW5yZXNvbHZlZCwgZmFpbHVyZXMgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdmFsaWRhdGVQcm9qZWN0U3ByaXRlRnJhbWUoZW50cnk6IFByb2plY3RUZXh0dXJlSW5kZXhFbnRyeSk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgcXVlcnlBc3NldE1ldGFTbmFwc2hvdChlbnRyeS5kYlVybCk7XG4gICAgICAgIGlmICghc25hcHNob3QgfHwgIXNuYXBzaG90Lm1ldGEgfHwgIXNuYXBzaG90Lm1ldGEudXNlckRhdGEgfHxcbiAgICAgICAgICAgIHNuYXBzaG90Lm1ldGEudXNlckRhdGEudHlwZSAhPT0gJ3Nwcml0ZS1mcmFtZScpIHJldHVybiBudWxsO1xuICAgICAgICAvLyBQcm9qZWN0IGluZGV4aW5nIGludGVudGlvbmFsbHkgcmVhZHMgZGlzayBtZXRhIGZvciBzcGVlZCwgYnV0IGEgc3RhbGUgc3ViTWV0YSBVVUlEXG4gICAgICAgIC8vIGlzIG5vdCBhc3NpZ25hYmxlIGV2ZW4gd2hlbiB0aGUgcm9vdCBhc3NldCBpcyBsaXZlLiBQcm92ZSB0aGUgZXhhY3QgU3ByaXRlRnJhbWVcbiAgICAgICAgLy8gc3ViLWFzc2V0IHRocm91Z2ggQXNzZXREQiBiZWZvcmUgcmV1c2luZyBpdCBpbiB0aGUgc2NlbmUgcGF5bG9hZC5cbiAgICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IEFycmF5LmZyb20obmV3IFNldChbXG4gICAgICAgICAgICByZWFkU3ByaXRlRnJhbWVVdWlkRnJvbU1ldGEoc25hcHNob3QubWV0YSksXG4gICAgICAgICAgICByZWFkU3ByaXRlRnJhbWVVdWlkRnJvbUluZm8oc25hcHNob3QuaW5mbyksXG4gICAgICAgIF0uZmlsdGVyKCh1dWlkKTogdXVpZCBpcyBzdHJpbmcgPT4gISF1dWlkKSkpO1xuICAgICAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpdmVTdWJBc3NldDogYW55ID0gYXdhaXQgcmVxdWVzdEFzc2V0RGIoJ3F1ZXJ5LWFzc2V0LWluZm8nLCBjYW5kaWRhdGUsIFtjYW5kaWRhdGVdKTtcbiAgICAgICAgICAgICAgICBpZiAobGl2ZVN1YkFzc2V0ICYmIFN0cmluZyhsaXZlU3ViQXNzZXQudXVpZCB8fCAnJykgPT09IGNhbmRpZGF0ZSkgcmV0dXJuIGNhbmRpZGF0ZTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgcmV0aHJvd0lmQXNzZXREYlVuYXZhaWxhYmxlKGVycm9yKTtcbiAgICAgICAgICAgICAgICAvLyBBIHN0YWxlIGNhbmRpZGF0ZSBjYW4gYmUgcmVqZWN0ZWQgd2hpbGUgYW5vdGhlciBsaXZlIGNhbmRpZGF0ZSBpcyBwcmVzZW50LlxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHJldGhyb3dJZkFzc2V0RGJVbmF2YWlsYWJsZShlcnJvcik7XG4gICAgICAgIGNvbnNvbGUud2FybihgW2ZpZ21hLWltcG9ydGVyXSDpobnnm67otLTlm74gbGl2ZSBTcHJpdGVGcmFtZSDmoKHpqozlpLHotKXvvIzmlLnkuLrpmpTnprvlr7zlhaUgJHtlbnRyeS5kYlVybH06YCwgZXJyb3IpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoSW1hZ2VCYXNlNjQoYmFzZTY0OiBzdHJpbmcpOiBJbWFnZUNvbnRlbnRIYXNoIHwgbnVsbCB7XG4gICAgaWYgKCFiYXNlNjQpIHJldHVybiBudWxsO1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBoYXNoSW1hZ2VCeXRlcyhCdWZmZXIuZnJvbShiYXNlNjQsICdiYXNlNjQnKSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBpY2tQcm9qZWN0VGV4dHVyZU1hdGNoKFxuICAgIGluZGV4OiBQcm9qZWN0VGV4dHVyZUluZGV4LFxuICAgIGNvbnRlbnRIYXNoOiBJbWFnZUNvbnRlbnRIYXNoLFxuICAgIHdhbnRNYXNrOiBib29sZWFuLFxuICAgIHJlcXVpcmVkQm9yZGVyPzogU3ByaXRlRnJhbWVCb3JkZXIgfCBudWxsXG4pOiBQcm9qZWN0VGV4dHVyZUluZGV4RW50cnkgfCBudWxsIHtcbiAgICBjb25zdCBleGFjdCA9IChpbmRleC5ieUhhc2hbY29udGVudEhhc2guaGFzaF0gfHwgW10pXG4gICAgICAgIC5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uc291cmNlID09PSAncHJvamVjdCcgJiYgaXRlbS51c2FnZSA9PT0gKHdhbnRNYXNrID8gJ21hc2snIDogJ3Nwcml0ZScpKVxuICAgICAgICAvLyDlj43ppoggIzE177ya5Lmd5a6r5Zu+5Lmf5Y+v5Lul5aSN55So5bel56iL6LWE5rqQ77yM5L2G6L656Led5b+F6aG76YCQ5YC855u45ZCMIOKAlOKAlCDpobnnm64gU3ByaXRlRnJhbWUg5pivXG4gICAgICAgIC8vIOWFseS6q+eahO+8jHNjZW5lLnRzIOS8muW+gOS4iuWGmSBwZXItbm9kZSBpbnNldO+8jOi+uei3neS4jeWQjOeahOS4pOS4quiKgueCueS8muS6kuebuOimhuebluOAglxuICAgICAgICAvLyDovrnot53nm7jlkIzliJnkuI3lrZjlnKjov5nkuKrpo47pmanvvIzmsqHmnInnkIbnlLHmr4/mrKHpg73okL3kuIDlvKDmlrDlm77jgIJcbiAgICAgICAgLy9cbiAgICAgICAgLy8g6YGu572p77yIQWxwaGE477yJ5LiN5Y+C5LiO6L+Z6YGT5Yik5a6a77ya6YGu572p5Y+q55SoIGFscGhhIOmAmumBk+OAgeS4jei1sOS5neWuq+a4suafk++8jFxuICAgICAgICAvLyDkuJTosIPnlKjmlrkgbGFuZE1hc2tJbWFnZXMg5Y6L5qC55LiN5LygIGJvcmRlcuOAguiLpeWcqOi/memHjOS4gOW5tuimgeaxguOAjGJvcmRlciDlv4Xpobvnm7jlkIzjgI3vvIxcbiAgICAgICAgLy8g5bel56iL6YeM5p+Q5byg6YGu572p5oGw5aW95bim6Z2e6Zu2IGJvcmRlciDml7blsLHkvJrojqvlkI3kuI3lpI3nlKgg4oCU4oCUIOmCo+aYr+S4jiAjMTUg5peg5YWz55qE6KGM5Li65pS55Y+Y44CCXG4gICAgICAgIC8vIO+8iOacrOW3peeoi+Wunua1iyA0IOW8oOmBrue9qSBib3JkZXIg5YWoIDDvvIzmiYDku6XkuI3liqDov5nkuKogZWxzZSDkuZ/nnIvkuI3lh7rlt67liKvvvIxcbiAgICAgICAgLy8gICDmraPlm6DkuLrnnIvkuI3lh7rlt67liKvmiY3mm7TopoHlhpnmuIXmpZrvvIzliKvorqnkuIvkuIDkuKrkurrku6XkuLrpga7nvankuZ/ooqvnurPnrqHkuobjgILvvIlcbiAgICAgICAgLmZpbHRlcigoaXRlbSkgPT4gd2FudE1hc2sgfHwgc2FtZVNwcml0ZUZyYW1lQm9yZGVyKGl0ZW0uYm9yZGVyLCByZXF1aXJlZEJvcmRlcikpO1xuICAgIGlmIChleGFjdC5sZW5ndGggPiAwKSByZXR1cm4gZXhhY3RbZXhhY3QubGVuZ3RoIC0gMV07XG4gICAgaWYgKHdhbnRNYXNrKSByZXR1cm4gbnVsbDtcbiAgICAvLyDkuZ3lrqvlm77kuI3otbDmhJ/nn6XljLnphY3vvJrlroPlr7nlupXlm77lsLrlr7jmlY/mhJ/vvIjlsLrlr7jlj5jliJnlm7rlrprovrnmiYDljaDmr5Tkvovlj5jvvInvvIxcbiAgICAvLyDCsTIwJSDlsLrlr7jlrrnlt67kvJrmiorovrnot53lr7nkuI3kuIrnmoTlm77mlL7ov5vmnaXjgILkuI4gVW5pdHkgU3ByaXRlQ2FjaGUg5a+55Lmd5a6r55qE5aSE55CG5LiA6Ie044CCXG4gICAgaWYgKGhhc1NsaWNlOUJvcmRlcihyZXF1aXJlZEJvcmRlciB8fCB1bmRlZmluZWQpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gcGlja1BlcmNlcHR1YWxQcm9qZWN0VGV4dHVyZU1hdGNoKGluZGV4LCBjb250ZW50SGFzaCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwaWNrQW55VGV4dHVyZU1hdGNoKG1hdGNoZXM6IFByb2plY3RUZXh0dXJlSW5kZXhFbnRyeVtdKTogUHJvamVjdFRleHR1cmVJbmRleEVudHJ5IHwgbnVsbCB7XG4gICAgaWYgKCFtYXRjaGVzIHx8IG1hdGNoZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gbWF0Y2hlcy5maW5kKChpdGVtKSA9PiBpdGVtLnNvdXJjZSA9PT0gJ3Byb2plY3QnKSB8fCBtYXRjaGVzWzBdO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2NhblByb2plY3RUZXh0dXJlSW5kZXgoZGlycz86IHN0cmluZ1tdKTogUHJvbWlzZTxQcm9qZWN0VGV4dHVyZUluZGV4PiB7XG4gICAgLy8g5omr5o+P55uu5b2V5p2l6Ieq44CM6YCa55So6LWE5rqQ55uu5b2V44CN6YWN572u77yb56m65oiW5pyq5Lyg5pe25Zue6YCA5YWo5bel56iLIGFzc2V0c+OAglxuICAgIC8vIOS4jiBVbml0eSBTcHJpdGVDYWNoZSDkuIDmoLfnm7TmjqXmnprkuL7no4Hnm5jvvIzlho3or7vlj5bnjrDmiJAgbWV0Ye+8m+S4jeimgeeUqOWuveazmyBxdWVyeS1hc3NldHPvvIxcbiAgICAvLyDlroPlnKjkv53nlZnlpKfph4/ljoblj7IgRnRvQyDlm77niYfnmoTlt6XnqIvph4zkvJrplb/mnJ/ljaDkvY8gQ3JlYXRvciBBc3NldERCIOa2iOaBr+mYn+WIl+OAglxuICAgIGNvbnN0IHNjYW5EaXJzID0gQXJyYXkuaXNBcnJheShkaXJzKSAmJiBkaXJzLmxlbmd0aCA+IDAgPyBkaXJzIDogWydkYjovL2Fzc2V0cyddO1xuICAgIGNvbnN0IGRiVXJscyA9IGxpc3RQcm9qZWN0VGV4dHVyZVVybHMoc2NhbkRpcnMpO1xuXG4gICAgY29uc3QgYnlIYXNoOiB7IFtoYXNoOiBzdHJpbmddOiBQcm9qZWN0VGV4dHVyZUluZGV4RW50cnlbXSB9ID0ge307XG4gICAgY29uc3QgcGVyY2VwdHVhbEVudHJpZXM6IFByb2plY3RUZXh0dXJlSW5kZXhFbnRyeVtdID0gW107XG4gICAgbGV0IHRvdGFsID0gMDtcbiAgICBsZXQgaGFzaGVkID0gMDtcbiAgICBsZXQgc2tpcHBlZCA9IDA7XG4gICAgZm9yIChjb25zdCBkYlVybCBvZiBkYlVybHMpIHtcbiAgICAgICAgdG90YWwrKztcbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBkYlVybFRvQXNzZXRQYXRoKGRiVXJsKTtcbiAgICAgICAgaWYgKCFmaWxlUGF0aCB8fCAhZXhpc3RzU3luYyhmaWxlUGF0aCkpIHtcbiAgICAgICAgICAgIHNraXBwZWQrKztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBieXRlcyA9IHJlYWRGaWxlU3luYyhmaWxlUGF0aCk7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50SGFzaCA9IGhhc2hJbWFnZUJ5dGVzKGJ5dGVzKTtcbiAgICAgICAgICAgIGNvbnN0IG1ldGEgPSByZWFkQXNzZXRNZXRhRnJvbURpc2soZGJVcmwpO1xuICAgICAgICAgICAgY29uc3Qgc3ByaXRlRnJhbWVVdWlkID0gcmVhZFNwcml0ZUZyYW1lVXVpZEZyb21NZXRhKG1ldGEpO1xuICAgICAgICAgICAgaWYgKCFzcHJpdGVGcmFtZVV1aWQpIHtcbiAgICAgICAgICAgICAgICBza2lwcGVkKys7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBlbnRyeTogUHJvamVjdFRleHR1cmVJbmRleEVudHJ5ID0ge1xuICAgICAgICAgICAgICAgIGhhc2g6IGNvbnRlbnRIYXNoLmhhc2gsXG4gICAgICAgICAgICAgICAgZGJVcmwsXG4gICAgICAgICAgICAgICAgdXVpZDogU3RyaW5nKG1ldGEgJiYgbWV0YS51dWlkIHx8ICcnKSxcbiAgICAgICAgICAgICAgICBzcHJpdGVGcmFtZVV1aWQsXG4gICAgICAgICAgICAgICAgd2lkdGg6IGNvbnRlbnRIYXNoLndpZHRoLFxuICAgICAgICAgICAgICAgIGhlaWdodDogY29udGVudEhhc2guaGVpZ2h0LFxuICAgICAgICAgICAgICAgIHNpZzogY29udGVudEhhc2guc2lnLFxuICAgICAgICAgICAgICAgIHNvdXJjZTogdGV4dHVyZVNvdXJjZUZvclVybChkYlVybCksXG4gICAgICAgICAgICAgICAgdXNhZ2U6IGhhc0V4cGxpY2l0QWxwaGE4Rm9ybWF0KG1ldGEpID8gJ21hc2snIDogJ3Nwcml0ZScsXG4gICAgICAgICAgICAgICAgYm9yZGVyOiByZWFkU3ByaXRlRnJhbWVCb3JkZXJGcm9tTWV0YShtZXRhKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAoIWJ5SGFzaFtlbnRyeS5oYXNoXSkgYnlIYXNoW2VudHJ5Lmhhc2hdID0gW107XG4gICAgICAgICAgICBieUhhc2hbZW50cnkuaGFzaF0ucHVzaChlbnRyeSk7XG4gICAgICAgICAgICBpZiAoZW50cnkuc2lnICYmIGVudHJ5LndpZHRoID4gMCAmJiBlbnRyeS5oZWlnaHQgPiAwKSBwZXJjZXB0dWFsRW50cmllcy5wdXNoKGVudHJ5KTtcbiAgICAgICAgICAgIGhhc2hlZCsrO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHNraXBwZWQrKztcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0g6aG555uu6LS05Zu+57Si5byV77yaJHtoYXNoZWR9LyR7dG90YWx9IOW8oOato+W8j+i1hOa6kOWPr+avlOWvuWAgK1xuICAgICAgICBgJHtza2lwcGVkID4gMCA/IGDvvIzot7Pov4cgJHtza2lwcGVkfSDlvKBgIDogJyd977yI5bey5o6S6ZmkIEZ0b0Mg55Sf5oiQ55uu5b2V77yJ44CCYFxuICAgICk7XG4gICAgcmV0dXJuIHsgYnlIYXNoLCBwZXJjZXB0dWFsRW50cmllcywgdG90YWwsIGhhc2hlZCwgc2tpcHBlZCB9O1xufVxuXG5mdW5jdGlvbiBwaWNrUGVyY2VwdHVhbFByb2plY3RUZXh0dXJlTWF0Y2goXG4gICAgaW5kZXg6IFByb2plY3RUZXh0dXJlSW5kZXgsXG4gICAgY29udGVudEhhc2g6IEltYWdlQ29udGVudEhhc2hcbik6IFByb2plY3RUZXh0dXJlSW5kZXhFbnRyeSB8IG51bGwge1xuICAgIGlmICghY29udGVudEhhc2guc2lnIHx8IGNvbnRlbnRIYXNoLndpZHRoIDw9IDAgfHwgY29udGVudEhhc2guaGVpZ2h0IDw9IDApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXM6IEFycmF5PHsgZW50cnk6IFByb2plY3RUZXh0dXJlSW5kZXhFbnRyeTsgbWVhbjogbnVtYmVyIH0+ID0gW107XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBpbmRleC5wZXJjZXB0dWFsRW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuc291cmNlICE9PSAncHJvamVjdCcgfHwgZW50cnkudXNhZ2UgIT09ICdzcHJpdGUnIHx8ICFlbnRyeS5zaWcpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoIWRpbXNXaXRoaW5Ub2xlcmFuY2UoY29udGVudEhhc2gud2lkdGgsIGNvbnRlbnRIYXNoLmhlaWdodCwgZW50cnkud2lkdGgsIGVudHJ5LmhlaWdodCkpIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCBkaXN0ID0gcGVyY2VwdHVhbERpc3RhbmNlKGNvbnRlbnRIYXNoLnNpZywgZW50cnkuc2lnKTtcbiAgICAgICAgaWYgKCFkaXN0KSBjb250aW51ZTtcbiAgICAgICAgaWYgKGRpc3QubWVhbiA8PSBQRVJDRVBUVUFMX01FQU5fVEhSRVNIT0xEICYmIGRpc3QubWF4IDw9IFBFUkNFUFRVQUxfTUFYX1RIUkVTSE9MRCkge1xuICAgICAgICAgICAgY2FuZGlkYXRlcy5wdXNoKHsgZW50cnksIG1lYW46IGRpc3QubWVhbiB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjYW5kaWRhdGVzLnNvcnQoKGEsIGIpID0+IGEubWVhbiAtIGIubWVhbik7XG4gICAgY29uc3QgYmVzdCA9IGNhbmRpZGF0ZXNbMF07XG4gICAgaWYgKGJlc3QpIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSDmhJ/nn6XljLnphY3lpI3nlKjpobnnm67otLTlm77vvIjlubPlnYflt64gJHtiZXN0Lm1lYW4udG9GaXhlZCgxKX0g4omkICR7UEVSQ0VQVFVBTF9NRUFOX1RIUkVTSE9MRH3vvInvvJoke2Jlc3QuZW50cnkuZGJVcmx9YFxuICAgICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gYmVzdCA/IGJlc3QuZW50cnkgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBkaW1zV2l0aGluVG9sZXJhbmNlKHF3OiBudW1iZXIsIHFoOiBudW1iZXIsIGN3OiBudW1iZXIsIGNoOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBpZiAocXcgPD0gMCB8fCBxaCA8PSAwIHx8IGN3IDw9IDAgfHwgY2ggPD0gMCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGxvID0gMSAtIFBFUkNFUFRVQUxfU0laRV9UT0xFUkFOQ0U7XG4gICAgY29uc3QgaGkgPSAxICsgUEVSQ0VQVFVBTF9TSVpFX1RPTEVSQU5DRTtcbiAgICByZXR1cm4gY3cgPj0gcXcgKiBsbyAmJiBjdyA8PSBxdyAqIGhpICYmIGNoID49IHFoICogbG8gJiYgY2ggPD0gcWggKiBoaTtcbn1cblxuZnVuY3Rpb24gdGV4dHVyZVNvdXJjZUZvclVybChkYlVybDogc3RyaW5nKTogJ2ZpZ21hLWltcG9ydCcgfCAncHJvamVjdCcge1xuICAgIGlmIChkYlVybC5zdGFydHNXaXRoKGAke0ZJR01BX0lNQUdFX0RJUn0vYCkgfHwgZGJVcmwuc3RhcnRzV2l0aChgJHtGSUdNQV9NQVNLX0RJUn0vYCkpIHJldHVybiAnZmlnbWEtaW1wb3J0JztcbiAgICByZXR1cm4gJ3Byb2plY3QnO1xufVxuXG5hc3luYyBmdW5jdGlvbiBpc0FscGhhOFNwcml0ZUFzc2V0KGRiVXJsOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBkaXNrTWV0YSA9IHJlYWRBc3NldE1ldGFGcm9tRGlzayhkYlVybCk7XG4gICAgaWYgKGRpc2tNZXRhKSByZXR1cm4gaGFzRXhwbGljaXRBbHBoYThGb3JtYXQoZGlza01ldGEpO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGluZm86IGFueSA9IGF3YWl0IHJlcXVlc3RBc3NldERiKCdxdWVyeS1hc3NldC1pbmZvJywgZGJVcmwsIFtkYlVybF0pO1xuICAgICAgICBjb25zdCBtZXRhS2V5ID0gaW5mbyAmJiBpbmZvLnV1aWQgPyBpbmZvLnV1aWQgOiBkYlVybDtcbiAgICAgICAgY29uc3QgcmF3TWV0YTogYW55ID0gYXdhaXQgcmVxdWVzdEFzc2V0RGIoJ3F1ZXJ5LWFzc2V0LW1ldGEnLCBTdHJpbmcobWV0YUtleSksIFttZXRhS2V5XSk7XG4gICAgICAgIGNvbnN0IG1ldGEgPSB0eXBlb2YgcmF3TWV0YSA9PT0gJ3N0cmluZycgPyBKU09OLnBhcnNlKHJhd01ldGEpIDogcmF3TWV0YTtcbiAgICAgICAgcmV0dXJuIGhhc0V4cGxpY2l0QWxwaGE4Rm9ybWF0KG1ldGEpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUoZXJyKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaGFzRXhwbGljaXRBbHBoYThGb3JtYXQodmFsdWU6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHN0YWNrID0gW3ZhbHVlXTtcbiAgICB3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBpdGVtID0gc3RhY2sucG9wKCk7XG4gICAgICAgIGlmICghaXRlbSB8fCB0eXBlb2YgaXRlbSAhPT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhpdGVtKSkge1xuICAgICAgICAgICAgY29uc3QgY2hpbGQgPSBpdGVtW2tleV07XG4gICAgICAgICAgICBjb25zdCBub3JtYWxpemVkS2V5ID0ga2V5LnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICBpZiAoKG5vcm1hbGl6ZWRLZXkgPT09ICdmb3JtYXQnIHx8IG5vcm1hbGl6ZWRLZXkuZW5kc1dpdGgoJ2Zvcm1hdCcpKSAmJlxuICAgICAgICAgICAgICAgIFN0cmluZyhjaGlsZCB8fCAnJykudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9bXFxzXy1dKy9nLCAnJykgPT09ICdhbHBoYTgnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY2hpbGQgJiYgdHlwZW9mIGNoaWxkID09PSAnb2JqZWN0Jykgc3RhY2sucHVzaChjaGlsZCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEBlbiBFbnN1cmUgYSBkYjovLyBmb2xkZXIgZXhpc3RzIHdpdGhvdXQgZW50ZXJpbmcgQXNzZXREQidzIG1lc3NhZ2UgcXVldWUuXG4gKiBAemgg55u05o6l5Zyo56OB55uY5Yib5bu6IGRiOi8vIOebruW9le+8jOmBv+WFjSBmcmVzaCDlr7zlhaXlhYjpmLvloZ7lnKggQXNzZXREQiDmn6Xor6LjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVuc3VyZUFzc2V0Rm9sZGVyT25EaXNrKHVybDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBkaXNrUGF0aCA9IGRiVXJsVG9Bc3NldFBhdGgodXJsKTtcbiAgICBpZiAoIWRpc2tQYXRoKSB0aHJvdyBuZXcgRXJyb3IoYFtmaWdtYS1pbXBvcnRlcl0g5peg5rOV5oqK6LWE5rqQ55uu5b2V5pig5bCE5Yiw5bel56iL56OB55uY77yaJHt1cmx9YCk7XG4gICAgbWtkaXJTeW5jKGRpc2tQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICByZXR1cm4gZGlza1BhdGg7XG59XG5cbmZ1bmN0aW9uIGlzRmlnbWFJbWFnZU1ldGFSZWFkeShcbiAgICBtZXRhOiBhbnksXG4gICAgYm9yZGVyPzogU3ByaXRlRnJhbWVCb3JkZXIsXG4gICAgZXhwZWN0ZWRXaWR0aDogbnVtYmVyID0gMCxcbiAgICBleHBlY3RlZEhlaWdodDogbnVtYmVyID0gMCxcbik6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHJvb3RVc2VyRGF0YSA9IG1ldGEgJiYgbWV0YS51c2VyRGF0YTtcbiAgICBpZiAoIXJvb3RVc2VyRGF0YSB8fCByb290VXNlckRhdGEudHlwZSAhPT0gJ3Nwcml0ZS1mcmFtZScgfHxcbiAgICAgICAgcm9vdFVzZXJEYXRhLmZpeEFscGhhVHJhbnNwYXJlbmN5QXJ0aWZhY3RzICE9PSB0cnVlKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3Qgc3ViTWV0YXMgPSBtZXRhLnN1Yk1ldGFzIHx8IHt9O1xuICAgIGxldCBmb3VuZFNwcml0ZUZyYW1lID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoc3ViTWV0YXMpKSB7XG4gICAgICAgIGNvbnN0IHN1YiA9IHN1Yk1ldGFzW2tleV07XG4gICAgICAgIGlmICghc3ViIHx8IHN1Yi5pbXBvcnRlciAhPT0gJ3Nwcml0ZS1mcmFtZScpIGNvbnRpbnVlO1xuICAgICAgICBmb3VuZFNwcml0ZUZyYW1lID0gdHJ1ZTtcbiAgICAgICAgY29uc3QgdXNlckRhdGEgPSBzdWIudXNlckRhdGEgfHwge307XG4gICAgICAgIGlmICh1c2VyRGF0YS50cmltVHlwZSAhPT0gJ25vbmUnIHx8IHVzZXJEYXRhLnBhY2thYmxlICE9PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjb25zdCByYXdXID0gTnVtYmVyKHVzZXJEYXRhLnJhd1dpZHRoID8/IHN1Yi5yYXdXaWR0aCA/PyAwKSB8fCAwO1xuICAgICAgICBjb25zdCByYXdIID0gTnVtYmVyKHVzZXJEYXRhLnJhd0hlaWdodCA/PyBzdWIucmF3SGVpZ2h0ID8/IDApIHx8IDA7XG4gICAgICAgIGlmICghKHJhd1cgPiAwICYmIHJhd0ggPiAwKSB8fFxuICAgICAgICAgICAgKGV4cGVjdGVkV2lkdGggPiAwICYmIHJhd1cgIT09IGV4cGVjdGVkV2lkdGgpIHx8XG4gICAgICAgICAgICAoZXhwZWN0ZWRIZWlnaHQgPiAwICYmIHJhd0ggIT09IGV4cGVjdGVkSGVpZ2h0KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoYm9yZGVyKSB7XG4gICAgICAgICAgICBjb25zdCBjbGFtcGVkID0gY2xhbXBTbGljZTlCb3JkZXIoYm9yZGVyLCByYXdXLCByYXdIKTtcbiAgICAgICAgICAgIGlmICh1c2VyRGF0YS5ib3JkZXJUb3AgIT09IGNsYW1wZWQudG9wIHx8IHVzZXJEYXRhLmJvcmRlckJvdHRvbSAhPT0gY2xhbXBlZC5ib3R0b20gfHxcbiAgICAgICAgICAgICAgICB1c2VyRGF0YS5ib3JkZXJMZWZ0ICE9PSBjbGFtcGVkLmxlZnQgfHwgdXNlckRhdGEuYm9yZGVyUmlnaHQgIT09IGNsYW1wZWQucmlnaHQpIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZm91bmRTcHJpdGVGcmFtZTtcbn1cblxuY29uc3QgU0xJQ0U5X01FVEFfS0VZUyA9IFsnYm9yZGVyVG9wJywgJ2JvcmRlckJvdHRvbScsICdib3JkZXJMZWZ0JywgJ2JvcmRlclJpZ2h0J10gYXMgY29uc3Q7XG5cbmZ1bmN0aW9uIGNsZWFyVW5zdGFibGVTbGljZTlCb3JkZXJzKFxuICAgIG1ldGE6IGFueSxcbiAgICBib3JkZXI6IFNwcml0ZUZyYW1lQm9yZGVyIHwgdW5kZWZpbmVkLFxuICAgIGV4cGVjdGVkV2lkdGg6IG51bWJlcixcbiAgICBleHBlY3RlZEhlaWdodDogbnVtYmVyLFxuKTogYm9vbGVhbiB7XG4gICAgaWYgKCFoYXNTbGljZTlCb3JkZXIoYm9yZGVyKSkgcmV0dXJuIGZhbHNlO1xuICAgIGxldCBjaGFuZ2VkID0gZmFsc2U7XG4gICAgY29uc3Qgc3ViTWV0YXMgPSBtZXRhICYmIG1ldGEuc3ViTWV0YXMgfHwge307XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoc3ViTWV0YXMpKSB7XG4gICAgICAgIGNvbnN0IHN1YiA9IHN1Yk1ldGFzW2tleV07XG4gICAgICAgIGlmICghc3ViIHx8IHN1Yi5pbXBvcnRlciAhPT0gJ3Nwcml0ZS1mcmFtZScgfHxcbiAgICAgICAgICAgIHNwcml0ZUZyYW1lTWV0YVNpemVNYXRjaGVzKHsgc3ViTWV0YXM6IHsgW2tleV06IHN1YiB9IH0sIGV4cGVjdGVkV2lkdGgsIGV4cGVjdGVkSGVpZ2h0KSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IHVzZXJEYXRhID0gc3ViLnVzZXJEYXRhO1xuICAgICAgICBpZiAoIXVzZXJEYXRhIHx8IHR5cGVvZiB1c2VyRGF0YSAhPT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuICAgICAgICBmb3IgKGNvbnN0IGJvcmRlcktleSBvZiBTTElDRTlfTUVUQV9LRVlTKSB7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHVzZXJEYXRhLCBib3JkZXJLZXkpKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHVzZXJEYXRhW2JvcmRlcktleV07XG4gICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNoYW5nZWQ7XG59XG5cbmZ1bmN0aW9uIGFwcGx5RmlnbWFTcHJpdGVGcmFtZVN1Yk1ldGEoXG4gICAgbWV0YTogYW55LFxuICAgIGJvcmRlcjogU3ByaXRlRnJhbWVCb3JkZXIgfCB1bmRlZmluZWQsXG4gICAgZXhwZWN0ZWRXaWR0aDogbnVtYmVyLFxuICAgIGV4cGVjdGVkSGVpZ2h0OiBudW1iZXIsXG4pOiBib29sZWFuIHtcbiAgICBsZXQgY2hhbmdlZCA9IGZhbHNlO1xuICAgIGNvbnN0IHN1Yk1ldGFzID0gbWV0YSAmJiBtZXRhLnN1Yk1ldGFzIHx8IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHN1Yk1ldGFzKSkge1xuICAgICAgICBjb25zdCBzdWIgPSBzdWJNZXRhc1trZXldO1xuICAgICAgICBpZiAoIXN1YiB8fCBzdWIuaW1wb3J0ZXIgIT09ICdzcHJpdGUtZnJhbWUnKSBjb250aW51ZTtcbiAgICAgICAgY29uc3Qgc2l6ZSA9IHJlYWRTcHJpdGVGcmFtZU1ldGFTaXplKHsgc3ViTWV0YXM6IHsgW2tleV06IHN1YiB9IH0pO1xuICAgICAgICBpZiAoIXNpemUgfHxcbiAgICAgICAgICAgIChleHBlY3RlZFdpZHRoID4gMCAmJiBzaXplLndpZHRoICE9PSBleHBlY3RlZFdpZHRoKSB8fFxuICAgICAgICAgICAgKGV4cGVjdGVkSGVpZ2h0ID4gMCAmJiBzaXplLmhlaWdodCAhPT0gZXhwZWN0ZWRIZWlnaHQpKSBjb250aW51ZTtcbiAgICAgICAgaWYgKCFzdWIudXNlckRhdGEgfHwgdHlwZW9mIHN1Yi51c2VyRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHN1Yi51c2VyRGF0YSA9IHt9O1xuICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgdXNlckRhdGEgPSBzdWIudXNlckRhdGE7XG4gICAgICAgIGlmICh1c2VyRGF0YS50cmltVHlwZSAhPT0gJ25vbmUnKSB7XG4gICAgICAgICAgICB1c2VyRGF0YS50cmltVHlwZSA9ICdub25lJztcbiAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGlmICh1c2VyRGF0YS5wYWNrYWJsZSAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLnBhY2thYmxlID0gZmFsc2U7XG4gICAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWJvcmRlcikgY29udGludWU7XG4gICAgICAgIGNvbnN0IGNsYW1wZWQgPSBjbGFtcFNsaWNlOUJvcmRlcihib3JkZXIsIHNpemUud2lkdGgsIHNpemUuaGVpZ2h0KTtcbiAgICAgICAgY29uc3Qgd2FudGVkID0ge1xuICAgICAgICAgICAgYm9yZGVyVG9wOiBjbGFtcGVkLnRvcCxcbiAgICAgICAgICAgIGJvcmRlckJvdHRvbTogY2xhbXBlZC5ib3R0b20sXG4gICAgICAgICAgICBib3JkZXJMZWZ0OiBjbGFtcGVkLmxlZnQsXG4gICAgICAgICAgICBib3JkZXJSaWdodDogY2xhbXBlZC5yaWdodCxcbiAgICAgICAgfTtcbiAgICAgICAgZm9yIChjb25zdCBib3JkZXJLZXkgb2YgT2JqZWN0LmtleXMod2FudGVkKSBhcyBBcnJheTxrZXlvZiB0eXBlb2Ygd2FudGVkPikge1xuICAgICAgICAgICAgaWYgKHVzZXJEYXRhW2JvcmRlcktleV0gIT09IHdhbnRlZFtib3JkZXJLZXldKSB7XG4gICAgICAgICAgICAgICAgdXNlckRhdGFbYm9yZGVyS2V5XSA9IHdhbnRlZFtib3JkZXJLZXldO1xuICAgICAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjaGFuZ2VkO1xufVxuXG5mdW5jdGlvbiBpc01hc2tJbWFnZU1ldGFSZWFkeShtZXRhOiBhbnkpOiBib29sZWFuIHtcbiAgICBjb25zdCB1c2VyRGF0YSA9IG1ldGEgJiYgbWV0YS51c2VyRGF0YTtcbiAgICBpZiAoIXVzZXJEYXRhIHx8IHVzZXJEYXRhLnR5cGUgIT09ICdzcHJpdGUtZnJhbWUnIHx8XG4gICAgICAgIHVzZXJEYXRhLmZpeEFscGhhVHJhbnNwYXJlbmN5QXJ0aWZhY3RzICE9PSBmYWxzZSB8fFxuICAgICAgICB1c2VyRGF0YS5pc1JlYWRhYmxlICE9PSB0cnVlIHx8IHVzZXJEYXRhLnBhY2thYmxlICE9PSBmYWxzZSB8fFxuICAgICAgICAhdXNlckRhdGEuY29tcHJlc3NTZXR0aW5ncyB8fCB1c2VyRGF0YS5jb21wcmVzc1NldHRpbmdzLnVzZUNvbXByZXNzVGV4dHVyZSAhPT0gZmFsc2UgfHxcbiAgICAgICAgU3RyaW5nKHVzZXJEYXRhLmZvcm1hdCB8fCAnJykudG9Mb3dlckNhc2UoKSAhPT0gJ2FscGhhOCcpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBzdWJNZXRhcyA9IG1ldGEuc3ViTWV0YXMgfHwge307XG4gICAgbGV0IGZvdW5kU3ByaXRlRnJhbWUgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzdWJNZXRhcykpIHtcbiAgICAgICAgY29uc3Qgc3ViID0gc3ViTWV0YXNba2V5XTtcbiAgICAgICAgaWYgKCFzdWIgfHwgc3ViLmltcG9ydGVyICE9PSAnc3ByaXRlLWZyYW1lJykgY29udGludWU7XG4gICAgICAgIGZvdW5kU3ByaXRlRnJhbWUgPSB0cnVlO1xuICAgICAgICBpZiAoIXN1Yi51c2VyRGF0YSB8fCBzdWIudXNlckRhdGEudHJpbVR5cGUgIT09ICdub25lJyB8fCBzdWIudXNlckRhdGEucGFja2FibGUgIT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBmb3VuZFNwcml0ZUZyYW1lO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUGVuZGluZ0ZpZ21hU3ByaXRlRnJhbWUoXG4gICAgZGJVcmw6IHN0cmluZyxcbiAgICBib3JkZXI/OiBTcHJpdGVGcmFtZUJvcmRlcixcbiAgICBleHBlY3RlZFdpZHRoOiBudW1iZXIgPSAwLFxuICAgIGV4cGVjdGVkSGVpZ2h0OiBudW1iZXIgPSAwLFxuKTogUGVuZGluZ1Nwcml0ZUZyYW1lIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBkYlVybCxcbiAgICAgICAga2luZDogJ2ZpZ21hJyxcbiAgICAgICAgYm9yZGVyOiBib3JkZXIgPyB7IC4uLmJvcmRlciB9IDogdW5kZWZpbmVkLFxuICAgICAgICBleHBlY3RlZFdpZHRoLFxuICAgICAgICBleHBlY3RlZEhlaWdodCxcbiAgICAgICAgcGhhc2U6ICdyb290JyxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQZW5kaW5nTWFza1Nwcml0ZUZyYW1lKGRiVXJsOiBzdHJpbmcpOiBQZW5kaW5nU3ByaXRlRnJhbWUge1xuICAgIHJldHVybiB7XG4gICAgICAgIGRiVXJsLFxuICAgICAgICBraW5kOiAnbWFzaycsXG4gICAgICAgIGV4cGVjdGVkV2lkdGg6IDAsXG4gICAgICAgIGV4cGVjdGVkSGVpZ2h0OiAwLFxuICAgICAgICBwaGFzZTogJ3V1aWQnLFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGNsb25lUGVuZGluZ1Nwcml0ZUZyYW1lKHBlbmRpbmc6IFBlbmRpbmdTcHJpdGVGcmFtZSk6IFBlbmRpbmdTcHJpdGVGcmFtZSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgLi4ucGVuZGluZyxcbiAgICAgICAgYm9yZGVyOiBwZW5kaW5nLmJvcmRlciA/IHsgLi4ucGVuZGluZy5ib3JkZXIgfSA6IHVuZGVmaW5lZCxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBzcHJpdGVGcmFtZVBlbmRpbmdLZXkocGVuZGluZzogUGVuZGluZ1Nwcml0ZUZyYW1lKTogc3RyaW5nIHtcbiAgICBjb25zdCBib3JkZXIgPSBwZW5kaW5nLmJvcmRlcjtcbiAgICByZXR1cm4gW1xuICAgICAgICBwZW5kaW5nLmtpbmQsXG4gICAgICAgIHBlbmRpbmcuZGJVcmwsXG4gICAgICAgIHBlbmRpbmcuZXhwZWN0ZWRXaWR0aCxcbiAgICAgICAgcGVuZGluZy5leHBlY3RlZEhlaWdodCxcbiAgICAgICAgYm9yZGVyID8gYm9yZGVyLmxlZnQgOiAnJyxcbiAgICAgICAgYm9yZGVyID8gYm9yZGVyLnJpZ2h0IDogJycsXG4gICAgICAgIGJvcmRlciA/IGJvcmRlci50b3AgOiAnJyxcbiAgICAgICAgYm9yZGVyID8gYm9yZGVyLmJvdHRvbSA6ICcnLFxuICAgIF0uam9pbignfCcpO1xufVxuXG4vKipcbiAqIEB6aCDljZXmraXmjqjov5sgRmlnbWEg5Zu+54mH55qEIFNwcml0ZUZyYW1lIOWwsee7queKtuaAgeOAguavj+asoeacgOWkmuaJp+ihjOS4gOasoSBtZXRhIG11dGF0aW9u77yMXG4gKiAgICAg5LiN5Zyo5Ye95pWw5YaF6YOo562J5b6F77yb6LCD55So5pa557uf5LiA5o6n5Yi2IDEwMC8zMDBtcyDnmoTph43or5XoioLlpY/jgIJcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldHRsZVNwcml0ZUZyYW1lT25jZShcbiAgICBpbnB1dDogUGVuZGluZ1Nwcml0ZUZyYW1lLFxuKTogUHJvbWlzZTxTcHJpdGVGcmFtZVNldHRsZVJlc3VsdD4ge1xuICAgIGNvbnN0IHBlbmRpbmcgPSBjbG9uZVBlbmRpbmdTcHJpdGVGcmFtZShpbnB1dCk7XG4gICAgaWYgKHBlbmRpbmcua2luZCA9PT0gJ21hc2snKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHBlbmRpbmcsXG4gICAgICAgICAgICAgICAgdXVpZDogYXdhaXQgcXVlcnlTcHJpdGVGcmFtZVV1aWRPbmNlKHBlbmRpbmcuZGJVcmwpLFxuICAgICAgICAgICAgICAgIG1ldGFBZGp1c3RlZDogZmFsc2UsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHJldGhyb3dJZkFzc2V0RGJVbmF2YWlsYWJsZShlcnIpO1xuICAgICAgICAgICAgY29uc29sZS53YXJuKGBbZmlnbWEtaW1wb3J0ZXJdIOmBrue9qSBTcHJpdGVGcmFtZSDmn6Xor6LlpLHotKXvvIzmnKzmibnmrKHlgZzmraLph43or5UgJHtwZW5kaW5nLmRiVXJsfWApO1xuICAgICAgICAgICAgcmV0dXJuIHsgcGVuZGluZywgdXVpZDogbnVsbCwgbWV0YUFkanVzdGVkOiBmYWxzZSwgcmV0cnlhYmxlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc25hcHNob3QgPSBhd2FpdCBxdWVyeUFzc2V0TWV0YVNuYXBzaG90KHBlbmRpbmcuZGJVcmwpO1xuICAgICAgICBpZiAoIXNuYXBzaG90KSByZXR1cm4geyBwZW5kaW5nLCB1dWlkOiBudWxsLCBtZXRhQWRqdXN0ZWQ6IGZhbHNlIH07XG4gICAgICAgIGNvbnN0IHsgbWV0YUtleSwgbWV0YSwgaW5mbyB9ID0gc25hcHNob3Q7XG4gICAgICAgIGNvbnN0IHJlYWR5ID0gaXNGaWdtYUltYWdlTWV0YVJlYWR5KFxuICAgICAgICAgICAgbWV0YSxcbiAgICAgICAgICAgIHBlbmRpbmcuYm9yZGVyLFxuICAgICAgICAgICAgcGVuZGluZy5leHBlY3RlZFdpZHRoLFxuICAgICAgICAgICAgcGVuZGluZy5leHBlY3RlZEhlaWdodCxcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBGaW5hbCBhY2NlcHRhbmNlIGNvbWVzIGZyb20gb25lIGxpdmUgQXNzZXREQiBzbmFwc2hvdC4gQSBjb3JyZWN0LWxvb2tpbmcgZGlza1xuICAgICAgICAvLyAubWV0YSBpcyBub3QgZW5vdWdoIGJlY2F1c2UgdGhlIHJ1bnRpbWUgc3ViLWFzc2V0IG1heSBzdGlsbCBiZSB0aGUgb2xkIDJ4MiBpbWFnZS5cbiAgICAgICAgaWYgKHJlYWR5KSB7XG4gICAgICAgICAgICBwZW5kaW5nLnBoYXNlID0gJ3V1aWQnO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBwZW5kaW5nLFxuICAgICAgICAgICAgICAgIHV1aWQ6IHJlYWRTcHJpdGVGcmFtZVV1aWRGcm9tTWV0YShtZXRhKSB8fCByZWFkU3ByaXRlRnJhbWVVdWlkRnJvbUluZm8oaW5mbyksXG4gICAgICAgICAgICAgICAgbWV0YUFkanVzdGVkOiBmYWxzZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBlbmRpbmcucGhhc2UgPT09ICd1dWlkJykge1xuICAgICAgICAgICAgcmV0dXJuIHsgcGVuZGluZywgdXVpZDogbnVsbCwgbWV0YUFkanVzdGVkOiBmYWxzZSB9O1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgcm9vdFJlYWR5ID0gbWV0YS51c2VyRGF0YSAmJiBtZXRhLnVzZXJEYXRhLnR5cGUgPT09ICdzcHJpdGUtZnJhbWUnO1xuICAgICAgICBpZiAocGVuZGluZy5waGFzZSA9PT0gJ3Jvb3QnICYmICFyb290UmVhZHkpIHtcbiAgICAgICAgICAgIGxldCBjaGFuZ2VkID0gZW5zdXJlU3ByaXRlRnJhbWVSb290VXNlckRhdGEobWV0YSwge1xuICAgICAgICAgICAgICAgIGZpeEFscGhhVHJhbnNwYXJlbmN5QXJ0aWZhY3RzOiB0cnVlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjaGFuZ2VkID0gY2xlYXJVbnN0YWJsZVNsaWNlOUJvcmRlcnMoXG4gICAgICAgICAgICAgICAgbWV0YSxcbiAgICAgICAgICAgICAgICBwZW5kaW5nLmJvcmRlcixcbiAgICAgICAgICAgICAgICBwZW5kaW5nLmV4cGVjdGVkV2lkdGgsXG4gICAgICAgICAgICAgICAgcGVuZGluZy5leHBlY3RlZEhlaWdodCxcbiAgICAgICAgICAgICkgfHwgY2hhbmdlZDtcbiAgICAgICAgICAgIGlmIChjaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgcmVxdWVzdEFzc2V0RGIoJ3NhdmUtYXNzZXQtbWV0YScsIHBlbmRpbmcuZGJVcmwsIFttZXRhS2V5LCBKU09OLnN0cmluZ2lmeShtZXRhLCBudWxsLCAyKV0pO1xuICAgICAgICAgICAgICAgIGF3YWl0IHJlcXVlc3RBc3NldERiKCdyZWltcG9ydC1hc3NldCcsIHBlbmRpbmcuZGJVcmwsIFtwZW5kaW5nLmRiVXJsXSk7XG4gICAgICAgICAgICAgICAgcGVuZGluZy5waGFzZSA9ICdzdWJtZXRhJztcbiAgICAgICAgICAgICAgICByZXR1cm4geyBwZW5kaW5nLCB1dWlkOiBudWxsLCBtZXRhQWRqdXN0ZWQ6IHRydWUgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocGVuZGluZy5waGFzZSA9PT0gJ3N1Ym1ldGEnICYmICFyb290UmVhZHkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHBlbmRpbmcsIHV1aWQ6IG51bGwsIG1ldGFBZGp1c3RlZDogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocGVuZGluZy5waGFzZSA9PT0gJ3Jvb3QnKSBwZW5kaW5nLnBoYXNlID0gJ3N1Ym1ldGEnO1xuXG4gICAgICAgIC8vIEEgU3ByaXRlRnJhbWUgc3ViTWV0YSBjYW4gZXhpc3Qgd2hpbGUgaXQgc3RpbGwgZGVzY3JpYmVzIENyZWF0b3IncyB0ZW1wb3JhcnkgMngyXG4gICAgICAgIC8vIHRleHR1cmUuIFdhaXQgZm9yIHRoZSByZWFsIFBORyBkaW1lbnNpb25zIGJlZm9yZSBwZXJzaXN0aW5nIHRyaW0vYm9yZGVyIHZhbHVlcy5cbiAgICAgICAgaWYgKCFzcHJpdGVGcmFtZU1ldGFTaXplTWF0Y2hlcyhtZXRhLCBwZW5kaW5nLmV4cGVjdGVkV2lkdGgsIHBlbmRpbmcuZXhwZWN0ZWRIZWlnaHQpKSB7XG4gICAgICAgICAgICByZXR1cm4geyBwZW5kaW5nLCB1dWlkOiBudWxsLCBtZXRhQWRqdXN0ZWQ6IGZhbHNlIH07XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgY2hhbmdlZCA9IGVuc3VyZVNwcml0ZUZyYW1lUm9vdFVzZXJEYXRhKG1ldGEsIHtcbiAgICAgICAgICAgIGZpeEFscGhhVHJhbnNwYXJlbmN5QXJ0aWZhY3RzOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgICAgY2hhbmdlZCA9IGNsZWFyVW5zdGFibGVTbGljZTlCb3JkZXJzKFxuICAgICAgICAgICAgbWV0YSxcbiAgICAgICAgICAgIHBlbmRpbmcuYm9yZGVyLFxuICAgICAgICAgICAgcGVuZGluZy5leHBlY3RlZFdpZHRoLFxuICAgICAgICAgICAgcGVuZGluZy5leHBlY3RlZEhlaWdodCxcbiAgICAgICAgKSB8fCBjaGFuZ2VkO1xuICAgICAgICBjaGFuZ2VkID0gYXBwbHlGaWdtYVNwcml0ZUZyYW1lU3ViTWV0YShcbiAgICAgICAgICAgIG1ldGEsXG4gICAgICAgICAgICBwZW5kaW5nLmJvcmRlcixcbiAgICAgICAgICAgIHBlbmRpbmcuZXhwZWN0ZWRXaWR0aCxcbiAgICAgICAgICAgIHBlbmRpbmcuZXhwZWN0ZWRIZWlnaHQsXG4gICAgICAgICkgfHwgY2hhbmdlZDtcbiAgICAgICAgaWYgKCFpc0ZpZ21hSW1hZ2VNZXRhUmVhZHkoXG4gICAgICAgICAgICBtZXRhLFxuICAgICAgICAgICAgcGVuZGluZy5ib3JkZXIsXG4gICAgICAgICAgICBwZW5kaW5nLmV4cGVjdGVkV2lkdGgsXG4gICAgICAgICAgICBwZW5kaW5nLmV4cGVjdGVkSGVpZ2h0LFxuICAgICAgICApKSByZXR1cm4geyBwZW5kaW5nLCB1dWlkOiBudWxsLCBtZXRhQWRqdXN0ZWQ6IGZhbHNlIH07XG5cbiAgICAgICAgaWYgKGNoYW5nZWQpIHtcbiAgICAgICAgICAgIGF3YWl0IHJlcXVlc3RBc3NldERiKCdzYXZlLWFzc2V0LW1ldGEnLCBwZW5kaW5nLmRiVXJsLCBbbWV0YUtleSwgSlNPTi5zdHJpbmdpZnkobWV0YSwgbnVsbCwgMildKTtcbiAgICAgICAgICAgIGF3YWl0IHJlcXVlc3RBc3NldERiKCdyZWltcG9ydC1hc3NldCcsIHBlbmRpbmcuZGJVcmwsIFtwZW5kaW5nLmRiVXJsXSk7XG4gICAgICAgICAgICBwZW5kaW5nLnBoYXNlID0gJ3V1aWQnO1xuICAgICAgICAgICAgcmV0dXJuIHsgcGVuZGluZywgdXVpZDogbnVsbCwgbWV0YUFkanVzdGVkOiB0cnVlIH07XG4gICAgICAgIH1cblxuICAgICAgICBwZW5kaW5nLnBoYXNlID0gJ3V1aWQnO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcGVuZGluZyxcbiAgICAgICAgICAgIHV1aWQ6IHJlYWRTcHJpdGVGcmFtZVV1aWRGcm9tTWV0YShtZXRhKSB8fCByZWFkU3ByaXRlRnJhbWVVdWlkRnJvbUluZm8oaW5mbyksXG4gICAgICAgICAgICBtZXRhQWRqdXN0ZWQ6IGZhbHNlLFxuICAgICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUoZXJyKTtcbiAgICAgICAgY29uc29sZS53YXJuKGBbZmlnbWEtaW1wb3J0ZXJdIOWbvueJhyBtZXRhIOafpeivouiiq+aLkue7ne+8jOacrOaJueasoeWBnOatoumHjeivlSAke3BlbmRpbmcuZGJVcmx9YCk7XG4gICAgICAgIHJldHVybiB7IHBlbmRpbmcsIHV1aWQ6IG51bGwsIG1ldGFBZGp1c3RlZDogZmFsc2UsIHJldHJ5YWJsZTogZmFsc2UgfTtcbiAgICB9XG59XG5cbi8qKlxuICogQHpoIOWFvOWuueiBmueEpua1i+ivlS/lt6XlhbfosIPnlKjnmoTlrozmlbQgbWV0YSDmlLbmlZvlhaXlj6PjgILmraPlvI/lr7zlhaXkvb/nlKggc2V0dGxlU3ByaXRlRnJhbWVPbmNl77yMXG4gKiAgICAg6YG/5YWN5Zu+54mH5b6q546v6YeM5bWM5aWX6ZW/5pe26Ze0IHNsZWVw44CCXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBlbnN1cmVGaWdtYUltYWdlTWV0YShcbiAgICBkYlVybDogc3RyaW5nLFxuICAgIGJvcmRlcj86IFNwcml0ZUZyYW1lQm9yZGVyLFxuICAgIGV4cGVjdGVkV2lkdGg6IG51bWJlciA9IDAsXG4gICAgZXhwZWN0ZWRIZWlnaHQ6IG51bWJlciA9IDAsXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgcGVuZGluZyA9IGNyZWF0ZVBlbmRpbmdGaWdtYVNwcml0ZUZyYW1lKGRiVXJsLCBib3JkZXIsIGV4cGVjdGVkV2lkdGgsIGV4cGVjdGVkSGVpZ2h0KTtcbiAgICBsZXQgYWRqdXN0ZWQgPSBmYWxzZTtcbiAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDIwOyBhdHRlbXB0KyspIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc2V0dGxlU3ByaXRlRnJhbWVPbmNlKHBlbmRpbmcpO1xuICAgICAgICBwZW5kaW5nID0gcmVzdWx0LnBlbmRpbmc7XG4gICAgICAgIGFkanVzdGVkID0gYWRqdXN0ZWQgfHwgcmVzdWx0Lm1ldGFBZGp1c3RlZDtcbiAgICAgICAgaWYgKHJlc3VsdC51dWlkKSByZXR1cm4gYWRqdXN0ZWQ7XG4gICAgICAgIGlmIChyZXN1bHQucmV0cnlhYmxlID09PSBmYWxzZSkgcmV0dXJuIGFkanVzdGVkO1xuICAgICAgICBpZiAoYXR0ZW1wdCA8IDE5KSBhd2FpdCB3YWl0KDEwMCk7XG4gICAgfVxuICAgIHJldHVybiBhZGp1c3RlZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZW5zdXJlTWFza0ltYWdlTWV0YShkYlVybDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKGlzTWFza0ltYWdlTWV0YVJlYWR5KHJlYWRBc3NldE1ldGFGcm9tRGlzayhkYlVybCkpKSByZXR1cm4gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW5mbzogYW55ID0gYXdhaXQgcmVxdWVzdEFzc2V0RGIoJ3F1ZXJ5LWFzc2V0LWluZm8nLCBkYlVybCwgW2RiVXJsXSk7XG4gICAgICAgIGNvbnN0IG1ldGFLZXkgPSBpbmZvICYmIGluZm8udXVpZCA/IGluZm8udXVpZCA6IGRiVXJsO1xuICAgICAgICBjb25zdCByYXdNZXRhOiBhbnkgPSBhd2FpdCByZXF1ZXN0QXNzZXREYigncXVlcnktYXNzZXQtbWV0YScsIFN0cmluZyhtZXRhS2V5KSwgW21ldGFLZXldKTtcbiAgICAgICAgY29uc3QgbWV0YSA9IHR5cGVvZiByYXdNZXRhID09PSAnc3RyaW5nJyA/IEpTT04ucGFyc2UocmF3TWV0YSkgOiByYXdNZXRhO1xuICAgICAgICBpZiAoIW1ldGEgfHwgdHlwZW9mIG1ldGEgIT09ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgbGV0IGNoYW5nZWQgPSBlbnN1cmVTcHJpdGVGcmFtZVJvb3RVc2VyRGF0YShtZXRhKTtcbiAgICAgICAgY29uc3QgdXNlckRhdGEgPSBtZXRhLnVzZXJEYXRhO1xuICAgICAgICBjb25zdCB3YW50ZWRVc2VyRGF0YTogeyBba2V5OiBzdHJpbmddOiBhbnkgfSA9IHtcbiAgICAgICAgICAgIGZpeEFscGhhVHJhbnNwYXJlbmN5QXJ0aWZhY3RzOiBmYWxzZSxcbiAgICAgICAgICAgIGlzUmVhZGFibGU6IHRydWUsXG4gICAgICAgICAgICBwYWNrYWJsZTogZmFsc2UsXG4gICAgICAgICAgICBjb21wcmVzc1NldHRpbmdzOiB7IHVzZUNvbXByZXNzVGV4dHVyZTogZmFsc2UgfSxcbiAgICAgICAgfTtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMod2FudGVkVXNlckRhdGEpKSB7XG4gICAgICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkodXNlckRhdGFba2V5XSkgIT09IEpTT04uc3RyaW5naWZ5KHdhbnRlZFVzZXJEYXRhW2tleV0pKSB7XG4gICAgICAgICAgICAgICAgdXNlckRhdGFba2V5XSA9IHdhbnRlZFVzZXJEYXRhW2tleV07XG4gICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF1c2VyRGF0YS5mb3JtYXQgfHwgU3RyaW5nKHVzZXJEYXRhLmZvcm1hdCkudG9Mb3dlckNhc2UoKSAhPT0gJ2FscGhhOCcpIHtcbiAgICAgICAgICAgIHVzZXJEYXRhLmZvcm1hdCA9ICdhbHBoYTgnO1xuICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBzdWJNZXRhcyA9IG1ldGEuc3ViTWV0YXMgfHwge307XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHN1Yk1ldGFzKSkge1xuICAgICAgICAgICAgY29uc3Qgc3ViID0gc3ViTWV0YXNba2V5XTtcbiAgICAgICAgICAgIGlmICghc3ViIHx8IHN1Yi5pbXBvcnRlciAhPT0gJ3Nwcml0ZS1mcmFtZScpIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKCFzdWIudXNlckRhdGEgfHwgdHlwZW9mIHN1Yi51c2VyRGF0YSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBzdWIudXNlckRhdGEgPSB7fTtcbiAgICAgICAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzdWIudXNlckRhdGEudHJpbVR5cGUgIT09ICdub25lJykge1xuICAgICAgICAgICAgICAgIHN1Yi51c2VyRGF0YS50cmltVHlwZSA9ICdub25lJztcbiAgICAgICAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzdWIudXNlckRhdGEucGFja2FibGUgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgc3ViLnVzZXJEYXRhLnBhY2thYmxlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY2hhbmdlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFjaGFuZ2VkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGF3YWl0IHJlcXVlc3RBc3NldERiKCdzYXZlLWFzc2V0LW1ldGEnLCBkYlVybCwgW21ldGFLZXksIEpTT04uc3RyaW5naWZ5KG1ldGEsIG51bGwsIDIpXSk7XG4gICAgICAgIGF3YWl0IHJlcXVlc3RBc3NldERiKCdyZWltcG9ydC1hc3NldCcsIGRiVXJsLCBbZGJVcmxdKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldGhyb3dJZkFzc2V0RGJVbmF2YWlsYWJsZShlcnIpO1xuICAgICAgICBjb25zb2xlLndhcm4oYFtmaWdtYS1pbXBvcnRlcl0g5L+u5q2j6YGu572pIG1ldGEg5aSx6LSl77yM5rK/55So6buY6K6k5a+85YWl6K6+572uICR7ZGJVcmx9OmAsIGVycik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1kNUJ5dGVzKGJ5dGVzOiBCdWZmZXIpOiBzdHJpbmcge1xuICAgIHJldHVybiBjcmVhdGVIYXNoKCdtZDUnKS51cGRhdGUoYnl0ZXMpLmRpZ2VzdCgnaGV4Jyk7XG59XG5cbmZ1bmN0aW9uIGhhc2hJbWFnZUJ5dGVzKGJ5dGVzOiBCdWZmZXIpOiBJbWFnZUNvbnRlbnRIYXNoIHtcbiAgICBjb25zdCBwbmcgPSBoYXNoUG5nUGl4ZWxzKGJ5dGVzKTtcbiAgICBjb25zdCBzaWcgPSBwbmdQZXJjZXB0dWFsU2lnbmF0dXJlKGJ5dGVzKTtcbiAgICBjb25zdCByYXdIYXNoID0gbWQ1Qnl0ZXMoYnl0ZXMpO1xuICAgIGlmIChwbmcpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGhhc2g6IHBuZy5oYXNoLFxuICAgICAgICAgICAgd2lkdGg6IHBuZy53aWR0aCxcbiAgICAgICAgICAgIGhlaWdodDogcG5nLmhlaWdodCxcbiAgICAgICAgICAgIHJhd0hhc2gsXG4gICAgICAgICAgICBzaWc6IHNpZyA/IHNpZy5zaWcgOiB1bmRlZmluZWQsXG4gICAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIGhhc2g6IHJhd0hhc2gsXG4gICAgICAgIHdpZHRoOiAwLFxuICAgICAgICBoZWlnaHQ6IDAsXG4gICAgICAgIHJhd0hhc2gsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gc3ByaXRlRnJhbWVEZWR1cEtleShtZDU6IHN0cmluZywgYm9yZGVyPzogU3ByaXRlRnJhbWVCb3JkZXIpOiBzdHJpbmcge1xuICAgIGlmICghYm9yZGVyKSByZXR1cm4gYCR7bWQ1fXxiOjAsMCwwLDBgO1xuICAgIGNvbnN0IGxlZnQgPSBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKE51bWJlcihib3JkZXIubGVmdCkgfHwgMCkpO1xuICAgIGNvbnN0IHJpZ2h0ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChOdW1iZXIoYm9yZGVyLnJpZ2h0KSB8fCAwKSk7XG4gICAgY29uc3QgdG9wID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChOdW1iZXIoYm9yZGVyLnRvcCkgfHwgMCkpO1xuICAgIGNvbnN0IGJvdHRvbSA9IE1hdGgubWF4KDAsIE1hdGgucm91bmQoTnVtYmVyKGJvcmRlci5ib3R0b20pIHx8IDApKTtcbiAgICByZXR1cm4gYCR7bWQ1fXxiOiR7bGVmdH0sJHtyaWdodH0sJHt0b3B9LCR7Ym90dG9tfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNTbGljZTlCb3JkZXIoYm9yZGVyPzogU3ByaXRlRnJhbWVCb3JkZXIpOiBib29sZWFuIHtcbiAgICBpZiAoIWJvcmRlcikgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBbYm9yZGVyLmxlZnQsIGJvcmRlci5yaWdodCwgYm9yZGVyLnRvcCwgYm9yZGVyLmJvdHRvbV1cbiAgICAgICAgLnNvbWUoKHZhbHVlKSA9PiBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKE51bWJlcih2YWx1ZSkgfHwgMCkpID4gMCk7XG59XG5cbmZ1bmN0aW9uIGRiVXJsVG9Bc3NldFBhdGgoZGJVcmw6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IHByb2plY3RQYXRoID0gKEVkaXRvciBhcyBhbnkpLlByb2plY3QgJiYgKEVkaXRvciBhcyBhbnkpLlByb2plY3QucGF0aDtcbiAgICBpZiAoIXByb2plY3RQYXRoKSByZXR1cm4gbnVsbDtcbiAgICBpZiAoZGJVcmwgPT09ICdkYjovL2Fzc2V0cycpIHJldHVybiBqb2luKHByb2plY3RQYXRoLCAnYXNzZXRzJyk7XG4gICAgaWYgKCFkYlVybC5zdGFydHNXaXRoKCdkYjovL2Fzc2V0cy8nKSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcmVsYXRpdmUgPSBkYlVybC5zbGljZSgnZGI6Ly9hc3NldHMvJy5sZW5ndGgpO1xuICAgIHJldHVybiBqb2luKHByb2plY3RQYXRoLCAnYXNzZXRzJywgcmVsYXRpdmUpO1xufVxuXG4vKipcbiAqIEBlbiBRdWVyeSB0aGUgU3ByaXRlRnJhbWUgc3ViLWFzc2V0IHV1aWQgKHRoZSBcIueItnV1aWRA5ZCO57yAXCIgb25lKSwgTk9UIHRoZSBwYXJlbnQgSW1hZ2VBc3NldC5cbiAqIEB6aCDmn6UgU3ByaXRlRnJhbWUg5a2Q6LWE5rqQIHV1aWTvvIjlvaLlpoIg54i2dXVpZEBmOTk0Me+8ie+8jOS4jeaYr+eItuWbviB1dWlkIOKAlOKAlCDlvJXnlKjniLblm77kvJrpnZnpu5jlpLHotKXjgIJcbiAqXG4gKiDms6jmhI/vvJphc3NldC1kYiBxdWVyeS1hc3NldC1pbmZvIOeahOWtkOi1hOa6kOe7k+aehOmaj+eJiOacrOS4jeWQjO+8jOi/memHjOWBmuS6huWkmuW9ouaAgeWFvOWuue+8jFxuICogICAgICAg5b6F55yf5py66aqM6K+B5ZCO5YaN5pS25pWb77yI6KeB5Lya6K+d6aqM6K+B5q2l6aqk77yJ44CCXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHF1ZXJ5U3ByaXRlRnJhbWVVdWlkT25jZShkYlVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgY29uc3QgZGlza1V1aWQgPSByZWFkU3ByaXRlRnJhbWVVdWlkRnJvbU1ldGEocmVhZEFzc2V0TWV0YUZyb21EaXNrKGRiVXJsKSk7XG4gICAgY29uc3QgaW5mbzogYW55ID0gYXdhaXQgcmVxdWVzdEFzc2V0RGIoJ3F1ZXJ5LWFzc2V0LWluZm8nLCBkYlVybCwgW2RiVXJsXSk7XG4gICAgaWYgKCFpbmZvKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGluZm9VdWlkID0gcmVhZFNwcml0ZUZyYW1lVXVpZEZyb21JbmZvKGluZm8pO1xuICAgIGlmIChpbmZvVXVpZCkgcmV0dXJuIGluZm9VdWlkO1xuXG4gICAgLy8gQ3JlYXRvciAzLjggY2FuIG9taXQgc3ViQXNzZXRzIGZyb20gcXVlcnktYXNzZXQtaW5mbyB3aGlsZSB0aGUgZXhhY3QgU3ByaXRlRnJhbWVcbiAgICAvLyBVVUlEIGlzIGFscmVhZHkgcHJlc2VudCBpbiB0aGUgaW1wb3J0ZWQgbWV0YS4gUmVhZCBpdCBpbnN0ZWFkIG9mIGd1ZXNzaW5nIEBmOTk0MS5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBtZXRhS2V5ID0gaW5mby51dWlkIHx8IGRiVXJsO1xuICAgICAgICBjb25zdCByYXdNZXRhOiBhbnkgPSBhd2FpdCByZXF1ZXN0QXNzZXREYigncXVlcnktYXNzZXQtbWV0YScsIFN0cmluZyhtZXRhS2V5KSwgW21ldGFLZXldKTtcbiAgICAgICAgY29uc3QgbWV0YSA9IHR5cGVvZiByYXdNZXRhID09PSAnc3RyaW5nJyA/IEpTT04ucGFyc2UocmF3TWV0YSkgOiByYXdNZXRhO1xuICAgICAgICBjb25zdCBtZXRhVXVpZCA9IHJlYWRTcHJpdGVGcmFtZVV1aWRGcm9tTWV0YShtZXRhKTtcbiAgICAgICAgaWYgKG1ldGFVdWlkKSByZXR1cm4gbWV0YVV1aWQ7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldGhyb3dJZkFzc2V0RGJVbmF2YWlsYWJsZShlcnIpO1xuICAgICAgICAvLyBBc3NldCBEQiBtYXkgc3RpbGwgYmUgcmVidWlsZGluZyB0aGUgbWV0YS4gVGhlIGNhbGxlciBkZWNpZGVzIHdoZXRoZXIgdG8gcmV0cnkuXG4gICAgfVxuICAgIC8vIERpc2sgbWV0YSBpcyBvbmx5IGEgY29tcGF0aWJpbGl0eSBmYWxsYmFjayBhZnRlciBBc3NldERCIGNvbmZpcm1zIHRoZSByb290IGFzc2V0LlxuICAgIC8vIFJldHVybmluZyBpdCBiZWZvcmUgdGhlIGxpdmUgcXVlcnkgcmVjcmVhdGVzIHRoZSBcImZpbGUgZXhpc3RzIGJ1dCBjYW5ub3QgYmUgYXNzaWduZWRcIiByYWNlLlxuICAgIHJldHVybiBkaXNrVXVpZDtcbn1cblxuLyoqXG4gKiBAemgg5Y2V5qyh5p+lIFNwcml0ZUZyYW1lIOWtkOi1hOa6kCB1dWlk77yI5LiN6YeN6K+V77yJ44CC6JC955uY5Li76Lev5b6E55So5a6D77ya5p+l5LiN5Yiw5Y2z6K6wIHVucmVzb2x2ZWTvvIxcbiAqIOS4jeWcqOatpOmYu+Whnui9ruivouKAlOKAlOWwsee7quetieW+heS6pOe7mSBtYWluIOWQjuWPsOW+queOr++8iOWNoOS9jeKGkuabv+aNouaWueahiO+8ieOAguWQjuWPsOW+queOr+S5n+WkjeeUqOWug+OAglxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcXVlcnlTcHJpdGVGcmFtZVV1aWQoZGJVcmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIHJldHVybiBxdWVyeVNwcml0ZUZyYW1lVXVpZE9uY2UoZGJVcmwpO1xufVxuXG4vKipcbiAqIEB6aCDlnKjlu7rmoJHliY3lubblj5HmlLbmlZvnn63mmoLmnKrlsLHnu6rnmoQgU3ByaXRlRnJhbWXjgILlj6rmnInotoXov4fpooTnrpfku43ml6Dnsr7ngbXlrZDotYTmupDnmoTlm77niYdcbiAqICAgICDmiY3ov5vlhaXlk4HnuqLljaDkvY3pmY3nuqfvvIzpgb/lhY3miormraPluLjnmoQgYXNzZXQtZGIg5pe25bqP5pq06Zyy57uZ5Zy65pmv6IqC54K544CCXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlU3ByaXRlRnJhbWVzQmVmb3JlQnVpbGQoXG4gICAgcGVuZGluZzogeyBbaW1nSWQ6IHN0cmluZ106IFBlbmRpbmdTcHJpdGVGcmFtZSB8IHN0cmluZyB9LFxuICAgIHRyaWVzID0gMzAsXG4gICAgZGVsYXlNcyA9IDEwMFxuKTogUHJvbWlzZTxTcHJpdGVGcmFtZVJlc29sdmVSZXN1bHQ+IHtcbiAgICBjb25zdCByZXNvbHZlZDogeyBbaW1nSWQ6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgY29uc3QgdW5yZXNvbHZlZDogeyBbaW1nSWQ6IHN0cmluZ106IFBlbmRpbmdTcHJpdGVGcmFtZSB9ID0ge307XG4gICAgY29uc3QgZW50cmllcyA9IE9iamVjdC5lbnRyaWVzKHBlbmRpbmcgfHwge30pO1xuICAgIGNvbnN0IHBoYXNlUmFuazogeyBbcGhhc2UgaW4gU3ByaXRlRnJhbWVQZW5kaW5nUGhhc2VdOiBudW1iZXIgfSA9IHsgcm9vdDogMCwgc3VibWV0YTogMSwgdXVpZDogMiB9O1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCB7XG4gICAgICAgIGltZ0lkczogc3RyaW5nW107XG4gICAgICAgIHBlbmRpbmc6IFBlbmRpbmdTcHJpdGVGcmFtZTtcbiAgICAgICAgdXVpZDogc3RyaW5nIHwgbnVsbDtcbiAgICAgICAgZXhoYXVzdGVkOiBib29sZWFuO1xuICAgIH0+KCk7XG5cbiAgICBmb3IgKGNvbnN0IFtpbWdJZCwgcmF3UGVuZGluZ10gb2YgZW50cmllcykge1xuICAgICAgICBjb25zdCBub3JtYWxpemVkID0gdHlwZW9mIHJhd1BlbmRpbmcgPT09ICdzdHJpbmcnXG4gICAgICAgICAgICA/IGNyZWF0ZVBlbmRpbmdGaWdtYVNwcml0ZUZyYW1lKHJhd1BlbmRpbmcpXG4gICAgICAgICAgICA6IGNsb25lUGVuZGluZ1Nwcml0ZUZyYW1lKHJhd1BlbmRpbmcpO1xuICAgICAgICBjb25zdCBrZXkgPSBzcHJpdGVGcmFtZVBlbmRpbmdLZXkobm9ybWFsaXplZCk7XG4gICAgICAgIGNvbnN0IGdyb3VwID0gZ3JvdXBzLmdldChrZXkpO1xuICAgICAgICBpZiAoZ3JvdXApIHtcbiAgICAgICAgICAgIGdyb3VwLmltZ0lkcy5wdXNoKGltZ0lkKTtcbiAgICAgICAgICAgIGlmIChwaGFzZVJhbmtbbm9ybWFsaXplZC5waGFzZV0gPiBwaGFzZVJhbmtbZ3JvdXAucGVuZGluZy5waGFzZV0pIGdyb3VwLnBlbmRpbmcgPSBub3JtYWxpemVkO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZ3JvdXBzLnNldChrZXksIHsgaW1nSWRzOiBbaW1nSWRdLCBwZW5kaW5nOiBub3JtYWxpemVkLCB1dWlkOiBudWxsLCBleGhhdXN0ZWQ6IGZhbHNlIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8g5Lul6L2u5qyh5Li65aSW5bGC77ya5oC7562J5b6F6aKE566X5LiO6LWE5rqQ5pWw6YeP5peg5YWz77yM5ZCM5LiAIGRiVXJsL+ivreS5ieavj+i9ruWPquafpeivouS4gOasoeOAglxuICAgIGNvbnN0IHJvdW5kcyA9IE1hdGgubWF4KDEsIHRyaWVzKTtcbiAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IHJvdW5kczsgYXR0ZW1wdCsrKSB7XG4gICAgICAgIGxldCByZW1haW5pbmcgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcy52YWx1ZXMoKSkge1xuICAgICAgICAgICAgaWYgKGdyb3VwLnV1aWQgfHwgZ3JvdXAuZXhoYXVzdGVkKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNldHRsZVNwcml0ZUZyYW1lT25jZShncm91cC5wZW5kaW5nKTtcbiAgICAgICAgICAgIGdyb3VwLnBlbmRpbmcgPSByZXN1bHQucGVuZGluZztcbiAgICAgICAgICAgIGdyb3VwLnV1aWQgPSByZXN1bHQudXVpZDtcbiAgICAgICAgICAgIGdyb3VwLmV4aGF1c3RlZCA9IHJlc3VsdC5yZXRyeWFibGUgPT09IGZhbHNlO1xuICAgICAgICAgICAgaWYgKCFncm91cC51dWlkICYmICFncm91cC5leGhhdXN0ZWQpIHJlbWFpbmluZysrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZW1haW5pbmcgPT09IDApIGJyZWFrO1xuICAgICAgICBpZiAoYXR0ZW1wdCArIDEgPCByb3VuZHMpIGF3YWl0IHdhaXQoZGVsYXlNcyk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMudmFsdWVzKCkpIHtcbiAgICAgICAgZm9yIChjb25zdCBpbWdJZCBvZiBncm91cC5pbWdJZHMpIHtcbiAgICAgICAgICAgIGlmIChncm91cC51dWlkKSByZXNvbHZlZFtpbWdJZF0gPSBncm91cC51dWlkO1xuICAgICAgICAgICAgZWxzZSB1bnJlc29sdmVkW2ltZ0lkXSA9IGNsb25lUGVuZGluZ1Nwcml0ZUZyYW1lKGdyb3VwLnBlbmRpbmcpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcmVzb2x2ZWQsIHVucmVzb2x2ZWQgfTtcbn1cbiJdfQ==