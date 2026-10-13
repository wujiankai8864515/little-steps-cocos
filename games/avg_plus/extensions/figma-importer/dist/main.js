"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.prepareSlice9ImageVariants = prepareSlice9ImageVariants;
exports.resolveAndReplacePlaceholders = resolveAndReplacePlaceholders;
exports.load = load;
exports.unload = unload;
/**
 * @en figma-importer extension main-process entry.
 * @zh figma-importer 扩展的主进程入口。
 *
 * 主进程跑在普通 Node 环境里 —— 这里 require('cc') 拿不到引擎类。
 * 凡是要建节点/挂组件的引擎 API，都必须通过 execute-scene-script
 * 转发到 scene.ts 里执行（见 callScene）。
 */
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const path_1 = require("path");
const types_1 = require("./types");
const assets_1 = require("./assets");
const server_1 = require("./server");
const fontlib_1 = require("./fontlib");
const textstyle_1 = require("./textstyle");
const pngcrop_1 = require("./pngcrop");
const textstylelib_1 = require("./textstylelib");
const textstylegen_1 = require("./textstylegen");
const telemetry_1 = require("./telemetry");
const component_mapping_1 = require("./component-mapping");
const component_state_runtime_1 = require("./component-state-runtime");
const mapped_component_state_1 = require("./mapped-component-state");
const assetdb_1 = require("./assetdb");
const json_workspace_state_1 = require("./json-workspace-state");
const mapping_diagnostics_1 = require("./mapping-diagnostics");
const mapping_fallbacks_1 = require("./mapping-fallbacks");
const editor_activation_1 = require("./editor-activation");
/** @zh 构建版本号统一在 types.ts（BUILD_VERSION），main/scene 共用同一来源，改一处两边同步。 */
/** @zh 推送服务开关的持久化 key（对齐 Unity EditorPrefs 自动续上）。 */
const PUSH_ENABLED_KEY = 'figma-importer.pushServerEnabled';
/** @zh 通用资源目录（参与图片像素比对复用）的持久化 key；值为 db:// 目录列表。 */
const COMMON_DIRS_KEY = 'figma-importer.commonResourceDirs';
const DEFAULT_COMMON_DIRS = ['db://assets'];
/** @zh 读通用资源目录配置；空/失败回退默认全 assets，保证不回归。 */
async function readCommonResourceDirs() {
    try {
        const raw = await Editor.Profile.getConfig('figma-importer', COMMON_DIRS_KEY);
        if (Array.isArray(raw)) {
            const dirs = raw.map((d) => String(d || '').trim()).filter((d) => d.startsWith('db://'));
            if (dirs.length > 0)
                return dirs;
        }
    }
    catch (err) {
        console.warn('[figma-importer] 读取通用资源目录配置失败，回退默认：', err);
    }
    return DEFAULT_COMMON_DIRS.slice();
}
const FIGMA_PREFAB_DIR = 'db://assets/art/figma-prefabs';
const COMPONENT_MAPPING_DIR = 'db://assets/art/FigmaImporterData';
const COMPONENT_MAPPING_DB_URL = `${COMPONENT_MAPPING_DIR}/component-mappings.json`;
const COMPONENT_STATE_RUNTIME_DIR = 'db://assets/mods/shared/figma-runtime';
const COMPONENT_STATE_RUNTIME_DB_URL = `${COMPONENT_STATE_RUNTIME_DIR}/FigmaComponentState.ts`;
const COMPONENT_STATE_RUNTIME_CLASS = 'FigmaComponentState';
let componentStateRuntimeReady = false;
let componentStateRuntimePromise = null;
let componentMappingMutationQueue = Promise.resolve();
const currentJsonPathCoordinator = new json_workspace_state_1.CurrentJsonPathCoordinator();
/** @zh beta 回流协议验证面：记录最近一次成功导入的原始 JSON，供 Figma 插件 /pull 拉取。 */
let lastImportedJsonForPull = '';
let lastImportedNameForPull = '';
let lastImportedRootUuid = '';
let lastSavedPrefabDbUrl = '';
let lastSavedPrefabUuid = '';
let lastComponentIdentities = [];
/**
 * @en Forward a call into the scene script (the only place cc.* is available).
 * @zh 把一次调用转发进 scene 脚本（唯一能用 cc.* 的地方）。
 */
async function callScene(method, ...args) {
    return await Editor.Message.request('scene', 'execute-scene-script', {
        name: 'figma-importer',
        method,
        args,
    });
}
async function getSelectedSceneComponentIdentity() {
    const nodeUuid = getSelectedNodeUuid();
    if (!nodeUuid)
        return { status: 'none', reason: 'no-selection', nodeUuid: '' };
    try {
        const result = await callScene('describeComponentMappingSelection', nodeUuid);
        if (result && result.success !== false && result.data)
            return result.data;
        return {
            status: 'not-component',
            reason: 'scene-query-failed',
            nodeUuid,
            error: String(result && result.error || 'Unknown scene query error'),
        };
    }
    catch (error) {
        return {
            status: 'not-component',
            reason: 'scene-query-failed',
            nodeUuid,
            error: String(error && error.message || error || 'Unknown scene query error'),
        };
    }
}
async function finalizeComponentStateTargets(result) {
    const stats = result && result.data ? result.data : null;
    const requests = stats && Array.isArray(stats.pendingComponentStates)
        ? stats.pendingComponentStates
        : stats && Array.isArray(stats.pendingMappedComponentStates)
            ? stats.pendingMappedComponentStates
            : [];
    if (requests.length === 0)
        return;
    const report = await (0, mapped_component_state_1.finalizeMappedComponentStates)(requests, {
        createComponent: async (nodeUuid, componentName) => await Editor.Message.request('scene', 'create-component', { uuid: nodeUuid, component: componentName }),
        applyStates: async (items) => await callScene('applyComponentStates', items),
        restoreActivity: async (items) => await callScene('restoreComponentStateActivity', items),
    });
    (0, mapped_component_state_1.mergeMappedComponentStateReport)(stats, report);
    if (report.createFailures.length > 0 || report.unavailable > 0 || report.overrideMissing > 0) {
        console.warn('[figma-importer] FigmaComponentState 未完整登记：', report);
    }
    else {
        console.log(`[figma-importer] FigmaComponentState 已登记 ${report.attached}/${report.total}` +
            `（Prefab override ${report.mounted}/${report.overrideTotal}）。`);
    }
}
/** @deprecated Compatibility name for callers/tests from the mapped-only phase. */
const attachMappedComponentStateOverrides = finalizeComponentStateTargets;
function getSelectedNodeUuid() {
    const selected = getSelectedNodeUuids();
    return selected.length > 0 ? selected[0] : '';
}
function getSelectedNodeUuids() {
    try {
        const selection = Editor.Selection;
        if (!selection || typeof selection.getSelected !== 'function')
            return [];
        const selected = selection.getSelected('node');
        if (Array.isArray(selected))
            return selected.map((item) => String(item || '')).filter(Boolean);
        if (typeof selected === 'string' && selected)
            return [selected];
    }
    catch (_a) {
        return [];
    }
    return [];
}
function getSelectedAssetUuids() {
    const normalize = (value) => {
        if (Array.isArray(value))
            return value.map((item) => String(item || '')).filter(Boolean);
        if (typeof value === 'string' && value)
            return [value];
        return [];
    };
    const selection = Editor.Selection;
    if (!selection)
        return [];
    if (typeof selection.getSelected === 'function') {
        try {
            const selected = normalize(selection.getSelected('asset'));
            if (selected.length > 0)
                return selected;
        }
        catch (_a) {
            // Creator versions differ here; the typed last-selection API is the fallback below.
        }
    }
    if (typeof selection.getLastSelected === 'function') {
        try {
            return normalize(selection.getLastSelected('asset'));
        }
        catch (_b) {
            // Selection is editor-only sugar; absence should not break menu actions.
        }
    }
    return [];
}
function safeAssetFileName(name) {
    const safe = (name || 'untitled').replace(/[^\w一-龥-]/g, '_').replace(/^_+|_+$/g, '');
    return safe || 'untitled';
}
function stagePushedJsonForWorkbench(json, name) {
    const projectPath = String(Editor.Project && Editor.Project.path || '').trim();
    if (!projectPath)
        throw new Error('Creator project path is unavailable');
    const dir = (0, path_1.join)(projectPath, 'temp', 'figma-import-workbench');
    (0, fs_1.mkdirSync)(dir, { recursive: true });
    const fileName = `${safeAssetFileName(name || 'pushed')}-${hashText(json)}.json`;
    const filePath = (0, path_1.join)(dir, fileName);
    (0, fs_1.writeFileSync)(filePath, json, 'utf8');
    return filePath;
}
function ensureJsonExtension(filePath) {
    return /\.json$/i.test(filePath) ? filePath : `${filePath}.json`;
}
function dbUrlToProjectPath(dbUrl) {
    const projectPath = Editor.Project && Editor.Project.path;
    if (!projectPath || !dbUrl.startsWith('db://assets/'))
        return '';
    return (0, path_1.join)(projectPath, 'assets', dbUrl.slice('db://assets/'.length));
}
async function ensureAssetFolder(url) {
    const diskPath = dbUrlToProjectPath(url);
    if (!diskPath)
        throw new Error(`[figma-importer] 无法把资源目录映射到工程磁盘：${url}`);
    (0, fs_1.mkdirSync)(diskPath, { recursive: true });
}
async function queryAssetInfo(key) {
    if (!key)
        return null;
    try {
        const info = await (0, assetdb_1.requestAssetDb)('query-asset-info', key, [key]);
        return info || null;
    }
    catch (err) {
        (0, assetdb_1.rethrowIfAssetDbUnavailable)(err);
        return null;
    }
}
function assetInfoUrl(info) {
    return String(info && (info.url || info.source || info.path || '') || '');
}
function isPrefabAssetInfo(info) {
    if (!info)
        return false;
    const url = assetInfoUrl(info);
    const type = String(info.type || info.importer || '');
    return /\.prefab$/i.test(url) || /prefab/i.test(type);
}
async function getSelectedPrefabAssetInfo() {
    for (const uuid of getSelectedAssetUuids()) {
        const info = await queryAssetInfo(uuid);
        if (isPrefabAssetInfo(info))
            return info;
    }
    return null;
}
async function resolveComponentMappingPrefabAssetInfo(payload) {
    const hasExplicitLocator = !!payload && (Object.prototype.hasOwnProperty.call(payload, 'prefabUuid') ||
        Object.prototype.hasOwnProperty.call(payload, 'prefabUrl'));
    const explicitKeys = [
        String(payload && payload.prefabUuid || '').trim(),
        String(payload && payload.prefabUrl || '').trim(),
    ].filter((key, index, keys) => !!key && keys.indexOf(key) === index);
    if (hasExplicitLocator) {
        for (const key of explicitKeys) {
            const info = await queryAssetInfo(key);
            if (isPrefabAssetInfo(info) && info.uuid)
                return { info, source: 'explicit' };
        }
        return { info: null, source: 'explicit' };
    }
    return {
        info: await getSelectedPrefabAssetInfo(),
        source: 'project-selection',
    };
}
async function writeTextAssetViaImport(dbUrl, content) {
    const projectPath = Editor.Project && Editor.Project.path;
    if (!projectPath)
        throw new Error('Editor.Project.path is unavailable');
    const tempDir = (0, path_1.join)(projectPath, 'temp', 'figma-importer');
    (0, fs_1.mkdirSync)(tempDir, { recursive: true });
    const extMatch = dbUrl.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? `.${extMatch[1]}` : '.txt';
    const tmpFile = (0, path_1.join)(tempDir, `asset-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    (0, fs_1.writeFileSync)(tmpFile, content, 'utf8');
    await (0, assetdb_1.requestAssetDb)('import-asset', dbUrl, [tmpFile, dbUrl, { overwrite: true }]);
    await delay(300);
    return await queryAssetInfo(dbUrl);
}
function emptyComponentMappingDocument() {
    return { version: 1, updatedAt: '', entries: [] };
}
function readComponentMappingDocument() {
    const filePath = dbUrlToProjectPath(COMPONENT_MAPPING_DB_URL);
    if (!filePath || !(0, fs_1.existsSync)(filePath))
        return emptyComponentMappingDocument();
    try {
        return (0, component_mapping_1.normalizeMappingDocument)(JSON.parse((0, fs_1.readFileSync)(filePath, 'utf8')));
    }
    catch (err) {
        console.warn('[figma-importer] 组件映射表读取失败，本次按空表处理：', filePath, err);
        return emptyComponentMappingDocument();
    }
}
async function saveComponentMappingDocument(document) {
    const normalized = (0, component_mapping_1.normalizeMappingDocument)(document);
    normalized.updatedAt = new Date().toISOString();
    await ensureAssetFolder(COMPONENT_MAPPING_DIR);
    await writeTextAssetViaImport(COMPONENT_MAPPING_DB_URL, JSON.stringify(normalized, null, 2));
    return normalized;
}
function mutateComponentMappingDocument(mutate) {
    const operation = componentMappingMutationQueue.then(async () => {
        const document = mutate(readComponentMappingDocument());
        return await saveComponentMappingDocument(document);
    });
    componentMappingMutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
}
async function queryComponentStateRuntimeReady() {
    try {
        const registered = !!await Editor.Message.request('scene', 'query-component-has-script', COMPONENT_STATE_RUNTIME_CLASS);
        if (!registered)
            return false;
        const result = await callScene('getComponentStateRuntimeRevision');
        return !!(result &&
            result.success !== false &&
            result.data &&
            result.data.revision === component_state_runtime_1.COMPONENT_STATE_RUNTIME_REVISION);
    }
    catch (_a) {
        return false;
    }
}
async function provisionComponentStateRuntime() {
    const templatePath = (0, path_1.join)(__dirname, '..', 'static', 'FigmaComponentState.ts');
    if (!(0, fs_1.existsSync)(templatePath)) {
        console.warn('[figma-importer] 缺少 FigmaComponentState runtime 模板：', templatePath);
        return false;
    }
    const template = (0, fs_1.readFileSync)(templatePath, 'utf8');
    const targetPath = dbUrlToProjectPath(COMPONENT_STATE_RUNTIME_DB_URL);
    const existing = targetPath && (0, fs_1.existsSync)(targetPath) ? (0, fs_1.readFileSync)(targetPath, 'utf8') : '';
    const classRegistered = await queryComponentStateRuntimeReady();
    const action = (0, component_state_runtime_1.planComponentStateRuntimeProvision)(existing, template, classRegistered);
    if (action === 'collision') {
        console.warn(`[figma-importer] 已存在同名 ${COMPONENT_STATE_RUNTIME_CLASS}，但缺少插件管理的运行时资产；` +
            '为避免重复 ccclass，本次组件状态记为 unavailable。');
        return false;
    }
    if (action === 'write') {
        await ensureAssetFolder(COMPONENT_MAPPING_DIR);
        await ensureAssetFolder(COMPONENT_STATE_RUNTIME_DIR);
        await writeTextAssetViaImport(COMPONENT_STATE_RUNTIME_DB_URL, template);
        console.log(`[figma-importer] 已${existing ? '更新' : '安装'}运行时组件：${COMPONENT_STATE_RUNTIME_DB_URL}`);
    }
    else if (action === 'keep-custom' && existing !== template) {
        console.warn(`[figma-importer] ${COMPONENT_STATE_RUNTIME_DB_URL} 不是插件生成文件，保留现有内容；` +
            '为避免误用字段契约未知的同名脚本，本次组件状态记为 unavailable。');
    }
    if (!(0, component_state_runtime_1.shouldWaitForComponentStateRuntime)(action))
        return false;
    for (let attempt = 0; attempt < 40; attempt++) {
        if (await queryComponentStateRuntimeReady()) {
            componentStateRuntimeReady = true;
            return true;
        }
        await delay(250);
    }
    return false;
}
async function ensureComponentStateRuntime() {
    if (componentStateRuntimeReady)
        return true;
    if (!componentStateRuntimePromise) {
        componentStateRuntimePromise = provisionComponentStateRuntime().finally(() => {
            componentStateRuntimePromise = null;
        });
    }
    return await componentStateRuntimePromise;
}
/** Replacement/attach beta flows share the importer tree and must provision the runtime too. */
async function ensureComponentStateRuntimeBestEffort() {
    try {
        const ready = await ensureComponentStateRuntime();
        if (!ready) {
            console.warn(`[figma-importer] ${COMPONENT_STATE_RUNTIME_CLASS} 尚未完成注册；` +
                '本次替换/挂载的组件状态将记为 unavailable。');
        }
        return ready;
    }
    catch (error) {
        componentStateRuntimeReady = false;
        console.warn(`[figma-importer] ${COMPONENT_STATE_RUNTIME_CLASS} 安装或升级失败；` +
            '本次替换/挂载将继续，但组件状态记为 unavailable：', (error === null || error === void 0 ? void 0 : error.message) || error);
        return false;
    }
}
async function resolveComponentMappingAssets(document) {
    let valid = 0;
    let broken = 0;
    const entries = [];
    for (const entry of document.entries) {
        const requestedPrefabUuid = String(entry.prefabUuid || '');
        const requestedPrefabUrl = String(entry.prefabUrl || '');
        let info = entry.prefabUuid ? await queryAssetInfo(entry.prefabUuid) : null;
        if (!isPrefabAssetInfo(info) && entry.prefabUrl)
            info = await queryAssetInfo(entry.prefabUrl);
        if (isPrefabAssetInfo(info) && info && info.uuid) {
            entries.push(Object.assign(Object.assign({}, entry), { prefabUuid: String(info.uuid), prefabUrl: assetInfoUrl(info), resolved: true, requestedPrefabUuid,
                requestedPrefabUrl }));
            valid++;
        }
        else {
            entries.push(Object.assign(Object.assign({}, entry), { prefabUuid: '', prefabUrl: '', resolved: false, requestedPrefabUuid,
                requestedPrefabUrl }));
            broken++;
        }
    }
    return { entries, valid, broken };
}
async function resolvePrefabForInstantiate() {
    const selected = await getSelectedPrefabAssetInfo();
    if (selected && selected.uuid) {
        return {
            uuid: String(selected.uuid),
            dbUrl: assetInfoUrl(selected),
            name: String(selected.name || selected.displayName || selected.uuid),
        };
    }
    if (lastSavedPrefabUuid || lastSavedPrefabDbUrl) {
        const info = await queryAssetInfo(lastSavedPrefabUuid || lastSavedPrefabDbUrl);
        if (isPrefabAssetInfo(info) && info.uuid) {
            return {
                uuid: String(info.uuid),
                dbUrl: assetInfoUrl(info) || lastSavedPrefabDbUrl,
                name: String(info.name || info.displayName || lastSavedPrefabDbUrl),
            };
        }
    }
    if (lastImportedNameForPull) {
        const guessedDbUrl = `${FIGMA_PREFAB_DIR}/${safeAssetFileName(lastImportedNameForPull)}.prefab`;
        const info = await queryAssetInfo(guessedDbUrl);
        if (isPrefabAssetInfo(info) && info.uuid) {
            return {
                uuid: String(info.uuid),
                dbUrl: assetInfoUrl(info) || guessedDbUrl,
                name: String(info.name || info.displayName || lastImportedNameForPull),
            };
        }
    }
    return null;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function elapsedMs(start) {
    return Date.now() - start;
}
/**
 * @zh 把 Figma 导出统一成单棵 root。Unity 插件支持 interfaces[] 多界面导出：
 *     取所有界面绝对框的并集作为 wrapper 尺寸，各界面根节点按相对偏移挂在 wrapper 下。
 */
function prepareImportData(data) {
    const interfaces = Array.isArray(data.interfaces)
        ? data.interfaces.filter((item) => item && item.root)
        : [];
    if (interfaces.length === 0) {
        if (!data.root) {
            throw new Error('Invalid data: missing root');
        }
        const canvas = data.canvas || { width: data.root.width || 1, height: data.root.height || 1 };
        return {
            name: data.name || data.root.name || 'untitled',
            canvas,
            root: data.root,
            images: data.images,
            interfaceCount: 1,
        };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const iface of interfaces) {
        const root = iface.root;
        const width = (iface.canvas && iface.canvas.width) || root.width || 1;
        const height = (iface.canvas && iface.canvas.height) || root.height || 1;
        const offsetX = Number(iface.offsetX) || 0;
        const offsetY = Number(iface.offsetY) || 0;
        minX = Math.min(minX, offsetX);
        minY = Math.min(minY, offsetY);
        maxX = Math.max(maxX, offsetX + width);
        maxY = Math.max(maxY, offsetY + height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        minX = minY = 0;
        maxX = maxY = 1;
    }
    const wrapperW = Math.max(1, maxX - minX);
    const wrapperH = Math.max(1, maxY - minY);
    const wrapperName = data.name || 'MultiImport';
    const wrapper = {
        figmaId: `multi:${wrapperName}`,
        name: wrapperName,
        type: 'FRAME',
        x: 0,
        y: 0,
        width: wrapperW,
        height: wrapperH,
        rotation: 0,
        visible: true,
        opacity: 1,
        children: interfaces.map((iface) => {
            const root = iface.root;
            root.x = (Number(iface.offsetX) || 0) - minX;
            root.y = (Number(iface.offsetY) || 0) - minY;
            root.constraints = null;
            return root;
        }),
    };
    console.log(`[figma-importer] 检测到多界面导出：${interfaces.length} 个界面，` +
        `已合成 ${Math.round(wrapperW)}×${Math.round(wrapperH)} wrapper。`);
    return {
        name: wrapperName,
        canvas: { width: wrapperW, height: wrapperH },
        root: wrapper,
        images: data.images,
        interfaceCount: interfaces.length,
    };
}
/**
 * @zh Loader/预览口径：多界面 JSON 只预览第一个 interface。
 *     Unity LoaderWindow 也是这样：预览和框选基于首界面，完整导入才读取整份 JSON。
 */
function prepareLoaderPreviewData(data) {
    const interfaces = Array.isArray(data.interfaces)
        ? data.interfaces.filter((item) => item && item.root)
        : [];
    if (interfaces.length === 0)
        return prepareImportData(data);
    const first = interfaces[0];
    const root = first.root;
    const canvas = first.canvas || data.canvas || { width: root.width || 1, height: root.height || 1 };
    return {
        name: first.name || root.name || data.name || 'untitled',
        canvas,
        root,
        images: data.images,
        interfaceCount: interfaces.length,
    };
}
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function nodeReplaceKind(node) {
    const isText = String(node.type || '').toUpperCase() === 'TEXT';
    const hasImage = !!nodeImageRef(node);
    if (isText && hasImage)
        return 'mixed';
    if (isText)
        return 'text';
    if (hasImage)
        return 'image';
    return 'other';
}
function collectFigmaNodeCandidates(root) {
    const out = [];
    const topCounts = {};
    const visit = (node, parentPath, parentName, siblingNameCount, canvasX, canvasY) => {
        if (!node)
            return;
        let baseName = sanitizeFigmaPathName(node.name || '');
        if (!baseName)
            baseName = node.type === 'TEXT' ? 'Text' : 'Node';
        const occ = siblingNameCount[baseName] || 0;
        siblingNameCount[baseName] = occ + 1;
        const path = parentPath ? `${parentPath}/${figmaPathSegment(baseName, occ)}` : figmaPathSegment(baseName, occ);
        const imageRef = nodeImageRef(node) || '';
        out.push({
            node,
            path,
            parentPath,
            parentName,
            name: baseName,
            type: String(node.type || ''),
            width: Number(node.width) || 0,
            height: Number(node.height) || 0,
            hasImage: !!imageRef,
            imageRef,
            characters: typeof node.characters === 'string' ? node.characters : '',
            canvasX,
            canvasY,
            replaceKind: nodeReplaceKind(node),
        });
        const childCounts = {};
        for (const child of node.children || []) {
            visit(child, path, baseName, childCounts, canvasX + (Number(child.x) || 0), canvasY + (Number(child.y) || 0));
        }
    };
    visit(root, '', '', topCounts, Number(root.x) || 0, Number(root.y) || 0);
    return out;
}
function filterFigmaCandidatesForTarget(candidates, target) {
    const kind = target.replaceKind || (target.hasLabel ? 'text' : (target.hasSprite ? 'image' : 'other'));
    if (kind === 'text')
        return candidates.filter((item) => item.type === 'TEXT');
    if (kind === 'image')
        return candidates.filter((item) => item.hasImage && item.type !== 'TEXT');
    if (kind === 'mixed')
        return candidates.filter((item) => item.type === 'TEXT' || item.hasImage);
    return candidates;
}
function scoreFigmaNodeCandidate(candidate, target) {
    const targetName = normalizeNameForCompare(target.name);
    const targetPath = normalizePathForCompare(target.scenePath);
    const targetParentName = normalizeNameForCompare(target.parentName);
    const candidateName = normalizeNameForCompare(candidate.name);
    const candidatePath = normalizePathForCompare(candidate.path);
    const candidateParentName = normalizeNameForCompare(candidate.parentName);
    let score = 0;
    const reasons = [];
    if (targetPath && candidatePath && targetPath.endsWith(candidatePath)) {
        score += 1000;
        reasons.push('path-suffix');
    }
    if (targetName && candidateName === targetName) {
        score += 320;
        reasons.push('name');
    }
    else if (targetName && candidateName && (targetName.includes(candidateName) || candidateName.includes(targetName))) {
        score += 120;
        reasons.push('name-contains');
    }
    if (targetParentName && candidateParentName === targetParentName) {
        score += 100;
        reasons.push('parent');
    }
    const size = sizeSimilarity(target.width, target.height, candidate.width, candidate.height);
    score += Math.round(size * 120);
    if (size > 0.85)
        reasons.push('size');
    if (target.hasLabel && candidate.type === 'TEXT') {
        score += 120;
        reasons.push('text');
    }
    if (target.hasSprite && candidate.hasImage) {
        score += 100;
        reasons.push('image');
    }
    if (target.replaceKind && candidate.replaceKind === target.replaceKind) {
        score += 80;
        reasons.push('kind');
    }
    if (target.labelText && candidate.characters &&
        normalizeTextForCompare(target.labelText) === normalizeTextForCompare(candidate.characters)) {
        score += 260;
        reasons.push('text-content');
    }
    return { candidate, score, reason: reasons.join('+') || 'best-effort' };
}
function selectBestFigmaNodeCandidate(candidates, target, explicitPath) {
    const scopedCandidates = explicitPath ? candidates : filterFigmaCandidatesForTarget(candidates, target);
    if (scopedCandidates.length === 0)
        return null;
    const normalizedExplicitPath = normalizePathForCompare(explicitPath || '', false);
    if (normalizedExplicitPath) {
        const exact = scopedCandidates.find((item) => normalizePathForCompare(item.path, false) === normalizedExplicitPath);
        if (exact)
            return { candidate: exact, score: 9999, reason: 'explicit-path' };
        const suffix = scopedCandidates.find((item) => normalizePathForCompare(item.path, false).endsWith(normalizedExplicitPath));
        if (suffix)
            return { candidate: suffix, score: 9000, reason: 'explicit-path-suffix' };
        return null;
    }
    const targetName = normalizeNameForCompare(target.name);
    let best = null;
    for (const candidate of scopedCandidates) {
        const scored = scoreFigmaNodeCandidate(candidate, target);
        if (!best || scored.score > best.score)
            best = scored;
    }
    if (!best)
        return null;
    const reliable = best.score >= 300 ||
        normalizeNameForCompare(best.candidate.name) === targetName ||
        normalizePathForCompare(target.scenePath).endsWith(normalizePathForCompare(best.candidate.path));
    return reliable ? best : null;
}
function listBestFigmaNodeCandidates(candidates, target, limit) {
    const scored = [];
    const scoped = filterFigmaCandidatesForTarget(candidates, target);
    for (const candidate of scoped) {
        scored.push(scoreFigmaNodeCandidate(candidate, target));
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, limit || 5));
}
function resolveReplaceApplyFlags(flags) {
    const position = flags && typeof flags.position === 'boolean' ? flags.position : true;
    const anchorPivot = flags && typeof flags.anchorPivot === 'boolean' ? flags.anchorPivot : true;
    return {
        image: flags && typeof flags.image === 'boolean' ? flags.image : true,
        text: flags && typeof flags.text === 'boolean' ? flags.text : true,
        position,
        anchorPivot: position && anchorPivot,
        preserveAlpha: flags && typeof flags.preserveAlpha === 'boolean' ? flags.preserveAlpha : true,
    };
}
function pickFigmaCandidateForApply(candidates, target, figmaPath) {
    const selected = selectBestFigmaNodeCandidate(candidates, target, figmaPath);
    if (selected)
        return selected;
    if (figmaPath)
        return null;
    const top = listBestFigmaNodeCandidates(candidates, target, 1);
    return top.length > 0 && top[0].score >= 220 ? top[0] : null;
}
function sizeSimilarity(aw, ah, bw, bh) {
    const maxW = Math.max(Math.abs(aw), Math.abs(bw), 1);
    const maxH = Math.max(Math.abs(ah), Math.abs(bh), 1);
    const sw = Math.max(0, 1 - Math.abs(aw - bw) / maxW);
    const sh = Math.max(0, 1 - Math.abs(ah - bh) / maxH);
    return (sw + sh) * 0.5;
}
function sanitizeFigmaPathName(name) {
    return String(name || '').replace(/[\\/]/g, '_').trim();
}
function figmaPathSegment(nodeName, occurrence) {
    return occurrence <= 0 ? nodeName : `${nodeName}#${occurrence + 1}`;
}
function normalizePathForCompare(path, stripOccurrence = true) {
    return String(path || '')
        .split('/')
        .filter((part) => part && normalizeNameForCompare(part) !== 'canvas')
        .map((part) => normalizeNameForCompare(part, stripOccurrence))
        .filter(Boolean)
        .join('/');
}
function normalizeNameForCompare(name, stripOccurrence = true) {
    let out = String(name || '');
    if (stripOccurrence)
        out = out.replace(/#\d+$/g, '');
    return out
        .replace(/\s+/g, '')
        .trim()
        .toLowerCase();
}
function normalizeTextForCompare(text) {
    return String(text || '').replace(/\s+/g, '').trim();
}
function summarizeFigmaCandidate(candidate) {
    return {
        path: candidate.path,
        name: candidate.name,
        type: candidate.type,
        kind: candidate.replaceKind,
        width: candidate.width,
        height: candidate.height,
        canvasX: candidate.canvasX,
        canvasY: candidate.canvasY,
        imageRef: candidate.imageRef,
        text: candidate.characters ? candidate.characters.slice(0, 80) : '',
    };
}
function collectSlimNodesByFigmaPath(root) {
    const out = {};
    const topCounts = {};
    const visit = (node, parentPath, siblingNameCount) => {
        if (!node)
            return;
        let baseName = sanitizeFigmaPathName(node.name || '');
        if (!baseName)
            baseName = node.type === 'TEXT' ? 'Text' : 'Node';
        const occ = siblingNameCount[baseName] || 0;
        siblingNameCount[baseName] = occ + 1;
        const path = parentPath ? `${parentPath}/${figmaPathSegment(baseName, occ)}` : figmaPathSegment(baseName, occ);
        out[path] = node;
        const childCounts = {};
        for (const child of node.children || [])
            visit(child, path, childCounts);
    };
    visit(root, '', topCounts);
    return out;
}
function makePatchNodeForCandidate(slimByPath, selected) {
    const slim = slimByPath[selected.candidate.path];
    const patchNode = cloneJson(slim || selected.candidate.node);
    patchNode.x = selected.candidate.canvasX;
    patchNode.y = selected.candidate.canvasY;
    return patchNode;
}
function resolveBatchApplyOptions(options) {
    const opts = options || {};
    return {
        rootUuid: String(opts.rootUuid || ''),
        kind: String(opts.kind || 'all').toLowerCase(),
        minScore: typeof opts.minScore === 'number' ? opts.minScore : 300,
        flags: resolveReplaceApplyFlags(opts.flags),
        dryRun: !!opts.dryRun,
        limit: typeof opts.limit === 'number' && opts.limit > 0 ? Math.floor(opts.limit) : 0,
    };
}
function resolvePreviewImageBase64(data) {
    const direct = data.previewImageBase64;
    if (typeof direct === 'string' && direct)
        return { ref: 'previewImageBase64', base64: direct };
    const ref = String(data.previewImageRef || '');
    const fromPool = ref && data.images && data.images[ref];
    if (fromPool)
        return { ref, base64: fromPool };
    const interfaces = Array.isArray(data.interfaces) ? data.interfaces : [];
    for (const iface of interfaces) {
        if (iface && typeof iface.previewImageBase64 === 'string' && iface.previewImageBase64) {
            return { ref: 'interface.previewImageBase64', base64: iface.previewImageBase64 };
        }
        const ifaceRef = String(iface && iface.previewImageRef || '');
        const ifacePool = ifaceRef && data.images && data.images[ifaceRef];
        if (ifacePool)
            return { ref: ifaceRef, base64: ifacePool };
    }
    return { ref: '', base64: '' };
}
function previewMimeFromBase64(base64) {
    if (!base64)
        return 'image/png';
    const bytes = Buffer.from(base64.slice(0, 16), 'base64');
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'image/jpeg';
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        return 'image/png';
    return 'image/png';
}
function textureStatusFromMatches(matches) {
    if (!matches || matches.length === 0)
        return 'missing';
    return matches.some((item) => item.source === 'project') ? 'project' : 'figma-import';
}
async function resolveJsonPathFromDialog(presetPath, title) {
    if (presetPath)
        return presetPath;
    const picked = await Editor.Dialog.select({
        title,
        type: 'file',
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0)
        return '';
    return picked.filePaths[0];
}
async function requestSceneSnapshot(stage) {
    try {
        await Editor.Message.request('scene', 'snapshot');
        console.log(`[figma-importer] 已创建场景 snapshot（${stage}）。`);
        return true;
    }
    catch (err) {
        console.warn(`[figma-importer] 创建场景 snapshot 失败（${stage}），继续尝试保存:`, err);
        return false;
    }
}
async function querySceneDirty(stage) {
    try {
        const dirty = await Editor.Message.request('scene', 'query-dirty');
        console.log(`[figma-importer] 场景 dirty 状态（${stage}）:`, dirty);
        return !!dirty;
    }
    catch (err) {
        console.warn(`[figma-importer] 查询场景 dirty 状态失败（${stage}）:`, err);
        return null;
    }
}
async function saveSceneAfterImport(result) {
    const rootUuid = result && result.data ? result.data.rootUuid : '';
    const stats = result && result.data ? result.data : {};
    // 让 Scene/Inspector 收到一次明确节点变化，再稍等一拍，避免刚落地的图片资产刷新和场景保存互相踩时序。
    if (rootUuid) {
        try {
            Editor.Message.broadcast('scene:change-node', rootUuid);
        }
        catch (_a) {
            // broadcast 只用于刷新编辑器面板，失败不影响导入结果。
        }
    }
    await delay(300);
    // execute-scene-script 动态建节点不一定让编辑器立即进入 dirty 状态。
    // 先显式创建 scene snapshot，再 save-scene，等价于编辑器内一次可保存修改。
    await querySceneDirty('snapshot 前');
    await requestSceneSnapshot('导入完成');
    await delay(250);
    await querySceneDirty('snapshot 后');
    for (let attempt = 1; attempt <= 2; attempt++) {
        const started = Date.now();
        console.log(`[figma-importer] 开始自动保存场景以刷新视图（第 ${attempt} 次）。`);
        try {
            await Editor.Message.request('scene', 'save-scene');
            console.log(`[figma-importer] 已自动保存场景以刷新视图（第 ${attempt} 次，耗时 ${elapsedMs(started)}ms）。`, stats);
        }
        catch (err) {
            console.warn(`[figma-importer] 自动保存场景失败（第 ${attempt} 次，耗时 ${elapsedMs(started)}ms，可手动 Ctrl+S 刷新）:`, err);
        }
        if (attempt === 1)
            await delay(700);
    }
    if (rootUuid) {
        try {
            Editor.Message.broadcast('scene:change-node', rootUuid);
        }
        catch (_b) {
            // 同上。
        }
    }
}
/**
 * @en Pull the image pool id a node renders (own imageRef, else first IMAGE fill's imageRef).
 * @zh 取节点渲染的图片池 id：优先节点自身 imageRef，否则第一个 IMAGE 填充的 imageRef。
 */
function firstVisibleImageFill(node) {
    const fills = node.fills || [];
    return fills.find((f) => f && f.type === 'IMAGE' && f.visible !== false && f.imageRef);
}
function nodeImageRef(node) {
    if (node.imageRef)
        return node.imageRef;
    const imgFill = firstVisibleImageFill(node);
    return imgFill ? imgFill.imageRef : undefined;
}
function imageFillMeta(node) {
    const imgFill = firstVisibleImageFill(node);
    if (imgFill) {
        const scaleMode = String(imgFill.scaleMode || 'FILL').toUpperCase();
        const opacity = typeof imgFill.a === 'number'
            ? imgFill.a
            : (typeof imgFill.opacity === 'number' ? imgFill.opacity : 1);
        const meta = {
            source: 'FILL',
            scaleMode,
            opacity: Math.max(0, Math.min(1, opacity)),
        };
        if (scaleMode === 'TILE' && typeof imgFill.tileScalingFactor === 'number') {
            meta.tileScalingFactor = imgFill.tileScalingFactor;
        }
        if (imgFill.cropRect)
            meta.cropRect = imgFill.cropRect;
        if (imgFill.imageTransform)
            meta.imageTransform = imgFill.imageTransform;
        return meta;
    }
    if (node.imageRef) {
        return {
            source: 'NODE',
            scaleMode: 'FILL',
            opacity: 1,
        };
    }
    return undefined;
}
function buildImageDimensionMap(images) {
    const out = {};
    if (!images)
        return out;
    for (const id of Object.keys(images)) {
        const dim = readImageDimensions(images[id]);
        if (dim)
            out[id] = dim;
    }
    return out;
}
function readImageDimensions(base64) {
    if (!base64)
        return null;
    try {
        const bytes = Buffer.from(base64, 'base64');
        // PNG: 8 byte signature + IHDR chunk, width/height big endian at 16/20.
        if (bytes.length >= 24 &&
            bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
            return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
        }
        // JPEG: walk SOF markers.
        if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
            let off = 2;
            while (off + 9 < bytes.length) {
                if (bytes[off] !== 0xff) {
                    off++;
                    continue;
                }
                const marker = bytes[off + 1];
                const len = bytes.readUInt16BE(off + 2);
                if (len < 2)
                    return null;
                if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
                    (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
                    return {
                        height: bytes.readUInt16BE(off + 5),
                        width: bytes.readUInt16BE(off + 7),
                    };
                }
                off += 2 + len;
            }
        }
    }
    catch (_a) {
        return null;
    }
    return null;
}
function hashText(text) {
    return (0, crypto_1.createHash)('md5').update(text).digest('hex').slice(0, 8);
}
function cloneCropRectForPixels(cropRect, raw) {
    var _a, _b;
    if (!cropRect)
        return null;
    const x = Number(cropRect.x);
    const y = Number(cropRect.y);
    const w = Number((_a = cropRect.w) !== null && _a !== void 0 ? _a : cropRect.width);
    const h = Number((_b = cropRect.h) !== null && _b !== void 0 ? _b : cropRect.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0)
        return null;
    const normalized = cropRect.normalized === true ||
        String(cropRect.unit || '').toUpperCase() === 'NORMALIZED' ||
        (x >= -0.001 && y >= -0.001 && x <= 1.001 && y <= 1.001 && w <= 1.001 && h <= 1.001);
    return clampCropRect({
        x: normalized ? x * raw.width : x,
        y: normalized ? y * raw.height : y,
        width: normalized ? w * raw.width : w,
        height: normalized ? h * raw.height : h,
    }, raw);
}
function imageTransformToPixelCrop(imageTransform, raw) {
    if (!Array.isArray(imageTransform) || !Array.isArray(imageTransform[0]) || !Array.isArray(imageTransform[1])) {
        return null;
    }
    const m = [
        [Number(imageTransform[0][0]), Number(imageTransform[0][1]), Number(imageTransform[0][2])],
        [Number(imageTransform[1][0]), Number(imageTransform[1][1]), Number(imageTransform[1][2])],
    ];
    if (!m.flat().every(Number.isFinite))
        return null;
    const pt = (x, y) => ({
        x: m[0][0] * x + m[0][1] * y + m[0][2],
        y: m[1][0] * x + m[1][1] * y + m[1][2],
    });
    const pts = [pt(0, 0), pt(1, 0), pt(0, 1), pt(1, 1)];
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    return cloneCropRectForPixels({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, unit: 'NORMALIZED' }, raw);
}
function coverCropForPixels(raw, targetW, targetH) {
    if (!(targetW > 0) || !(targetH > 0))
        return null;
    const targetAspect = targetW / targetH;
    const rawAspect = raw.width / raw.height;
    if (!Number.isFinite(targetAspect) || targetAspect <= 0 || Math.abs(rawAspect - targetAspect) < 0.002)
        return null;
    if (rawAspect > targetAspect) {
        const width = raw.height * targetAspect;
        return clampCropRect({ x: (raw.width - width) * 0.5, y: 0, width, height: raw.height }, raw);
    }
    const height = raw.width / targetAspect;
    return clampCropRect({ x: 0, y: (raw.height - height) * 0.5, width: raw.width, height }, raw);
}
function clampCropRect(rect, raw) {
    const x = Math.max(0, Math.min(raw.width, rect.x));
    const y = Math.max(0, Math.min(raw.height, rect.y));
    const right = Math.max(x, Math.min(raw.width, rect.x + rect.width));
    const bottom = Math.max(y, Math.min(raw.height, rect.y + rect.height));
    const width = right - x;
    const height = bottom - y;
    if (width <= 0.5 || height <= 0.5)
        return null;
    return { x, y, width, height };
}
function cropIsWholeImage(crop, raw) {
    return Math.abs(crop.x) < 0.01 &&
        Math.abs(crop.y) < 0.01 &&
        Math.abs(crop.width - raw.width) < 0.01 &&
        Math.abs(crop.height - raw.height) < 0.01;
}
function preparePersistentImageVariants(root, images, imageDims) {
    const stats = { croppedImageFills: 0, cropFailures: 0 };
    if (!root || !images)
        return stats;
    const variantIdByKey = {};
    const visit = (node) => {
        const fill = firstVisibleImageFill(node);
        if (fill && fill.imageRef && images[fill.imageRef]) {
            const mode = String(fill.scaleMode || 'FILL').toUpperCase();
            const raw = imageDims[fill.imageRef];
            if (raw && mode !== 'TILE') {
                const crop = cloneCropRectForPixels(fill.cropRect, raw) ||
                    imageTransformToPixelCrop(fill.imageTransform, raw) ||
                    (mode === 'FILL' || mode === 'CROP' ? coverCropForPixels(raw, node.width || 0, node.height || 0) : null);
                if (crop && !cropIsWholeImage(crop, raw)) {
                    const key = `${fill.imageRef}:${Math.round(crop.x)},${Math.round(crop.y)},${Math.round(crop.width)},${Math.round(crop.height)}`;
                    let variantId = variantIdByKey[key];
                    if (!variantId) {
                        const cropped = (0, pngcrop_1.cropPngBase64)(images[fill.imageRef], crop);
                        if (cropped) {
                            variantId = `${fill.imageRef}__crop_${hashText(key)}`;
                            images[variantId] = cropped;
                            imageDims[variantId] = readImageDimensions(cropped) || {
                                width: Math.round(crop.width),
                                height: Math.round(crop.height),
                            };
                            variantIdByKey[key] = variantId;
                            stats.croppedImageFills++;
                        }
                        else {
                            stats.cropFailures++;
                        }
                    }
                    if (variantId) {
                        fill.imageRef = variantId;
                        // Internal Cocos import hint: the PNG is already cropped
                        // to the node's visible Figma sample rect, so stretch it
                        // into the UITransform instead of applying cover crop again.
                        fill.scaleMode = 'STRETCH';
                        delete fill.cropRect;
                        delete fill.imageTransform;
                    }
                }
            }
        }
        for (const child of node.children || [])
            visit(child);
    };
    visit(root);
    return stats;
}
function collectSpriteFrameBorders(root) {
    const out = {};
    const visit = (node) => {
        if (String(node.componentType || '').toUpperCase() === 'SLICE9' && node.slice9Border) {
            const ref = nodeImageRef(node);
            if (ref && !out[ref]) {
                out[ref] = {
                    left: Math.max(0, Number(node.slice9Border.left) || 0),
                    right: Math.max(0, Number(node.slice9Border.right) || 0),
                    top: Math.max(0, Number(node.slice9Border.top) || 0),
                    bottom: Math.max(0, Number(node.slice9Border.bottom) || 0),
                };
            }
        }
        for (const child of node.children || [])
            visit(child);
    };
    visit(root);
    return out;
}
function collectMaskImageRefs(root) {
    const refs = new Set();
    const visit = (node) => {
        const mask = node && node.mask;
        if (mask && mask.imageRef) {
            refs.add(String(mask.imageRef));
        }
        for (const child of node.children || [])
            visit(child);
    };
    visit(root);
    return refs;
}
function classifyMaskAlpha(base64) {
    if (!base64)
        return 'DEGENERATE';
    try {
        const png = (0, pngcrop_1.decodePngPixels)(Buffer.from(base64, 'base64'));
        if (!png || png.width <= 2 || png.height <= 2)
            return 'DEGENERATE';
        const alphaThreshold = 16;
        let opaque = 0;
        for (let i = 3; i < png.rgba.length; i += 4) {
            if (png.rgba[i] > alphaThreshold)
                opaque++;
        }
        const pixelCount = png.width * png.height;
        const ratio = pixelCount > 0 ? opaque / pixelCount : 0;
        if (ratio < 0.01)
            return 'DEGENERATE';
        const alphaAt = (x, y) => png.rgba[(y * png.width + x) * 4 + 3];
        const cornersOpaque = alphaAt(1, 1) > alphaThreshold &&
            alphaAt(png.width - 2, 1) > alphaThreshold &&
            alphaAt(1, png.height - 2) > alphaThreshold &&
            alphaAt(png.width - 2, png.height - 2) > alphaThreshold;
        if (cornersOpaque && ratio > 0.98)
            return 'SOLID_RECT';
        return 'SHAPED';
    }
    catch (err) {
        console.warn('[figma-importer] 遮罩 alpha 分析失败，按异形图片遮罩处理:', err);
        return 'SHAPED';
    }
}
function routeMask(node, maskImages) {
    const mask = node && node.mask;
    if (!mask || !mask.imageRef)
        return null;
    const shape = classifyMaskAlpha(maskImages[String(mask.imageRef)]);
    const maskCoversNode = Math.abs(Number(mask.x) || 0) <= 1 &&
        Math.abs(Number(mask.y) || 0) <= 1 &&
        Math.abs((Number(mask.width) || 0) - (Number(node.width) || 0)) <= 1 &&
        Math.abs((Number(mask.height) || 0) - (Number(node.height) || 0)) <= 1;
    const rotated = Math.abs(Number(mask.rotation) || 0) > 0.01;
    const luminance = String(mask.maskType || '').toUpperCase() === 'LUMINANCE';
    if (shape === 'DEGENERATE') {
        return { shape, useImageMask: false, fallbackReason: 'degenerate' };
    }
    if (shape === 'SOLID_RECT' && maskCoversNode && !rotated && !luminance) {
        return { shape, useImageMask: false, fallbackReason: 'solid-rect' };
    }
    return { shape, useImageMask: true };
}
function buildMaskRoutes(root, images) {
    const routes = new Map();
    if (!root || !images)
        return routes;
    const visit = (node) => {
        const route = routeMask(node, images);
        if (route)
            routes.set(node, route);
        for (const child of node.children || [])
            visit(child);
    };
    visit(root);
    return routes;
}
function collectImageMaskRefs(root, routes) {
    const refs = new Set();
    const visit = (node) => {
        const route = routes.get(node);
        const mask = node && node.mask;
        if (route && route.useImageMask && mask && mask.imageRef) {
            refs.add(String(mask.imageRef));
        }
        for (const child of node.children || [])
            visit(child);
    };
    visit(root);
    return refs;
}
function collectImplicitSpriteFrameBorders(root, imageDims) {
    const borders = {};
    let count = 0;
    const visit = (node) => {
        const detected = detectImplicitSlice9(node, imageDims);
        if (detected && !borders[detected.imageRef]) {
            borders[detected.imageRef] = detected.border;
            count++;
        }
        for (const child of node.children || [])
            visit(child);
    };
    visit(root);
    return { borders, count };
}
function buildImplicitSliceGrid(node, allowExplicitParent = false) {
    // 下限 2：单侧边距的九宫只需 2 片（固定边 + 拉伸段）。上限 9 = 3×3 的最大片数。
    if (!node || !Array.isArray(node.children) || node.children.length < 2 || node.children.length > 9)
        return null;
    if (!allowExplicitParent && String(node.componentType || '').toUpperCase() === 'SLICE9')
        return null;
    if (!allowExplicitParent && nodeImageRef(node))
        return null;
    if (node.children.some((child) => !nodeImageRef(child)))
        return null;
    return buildSemanticSliceGrid(node.children) || buildPositionSliceGrid(node.children);
}
/**
 * @zh 对齐 Unity TrySetupAsSharedCroppedImage：
 *     父节点无图、多个直接子节点共享同一张原始大图、且大图尺寸≈父尺寸时，
 *     把父节点作为普通图片导入，跳过那些切片子节点。
 */
function detectSharedCroppedImageRef(node, imageDims) {
    if (!node || !Array.isArray(node.children) || node.children.length < 2)
        return undefined;
    if (String(node.componentType || '').toUpperCase() === 'SLICE9')
        return undefined;
    if (nodeImageRef(node))
        return undefined;
    if (!(node.width > 0.5) || !(node.height > 0.5))
        return undefined;
    let shared = '';
    let imageChildCount = 0;
    for (const child of node.children) {
        const ref = nodeImageRef(child);
        if (!ref)
            continue;
        imageChildCount++;
        if (!shared)
            shared = ref;
        else if (shared !== ref)
            return undefined;
    }
    if (imageChildCount < 2 || !shared)
        return undefined;
    const dim = imageDims[shared];
    if (!dim)
        return undefined;
    if (Math.abs(dim.width - node.width) > 1 || Math.abs(dim.height - node.height) > 1) {
        return undefined;
    }
    return shared;
}
const SEMANTIC_SLICE_POS = {
    'top-l': { row: 0, col: 0 },
    'top-c': { row: 0, col: 1 },
    'top-r': { row: 0, col: 2 },
    'mid-l': { row: 1, col: 0 },
    'center': { row: 1, col: 1 },
    'mid-r': { row: 1, col: 2 },
    'bot-l': { row: 2, col: 0 },
    'bot-c': { row: 2, col: 1 },
    'bot-r': { row: 2, col: 2 },
};
function detectImplicitSlice9(node, imageDims) {
    const layout = buildImplicitSliceGrid(node);
    if (!layout)
        return null;
    const imageChildren = node.children;
    const shared = nodeImageRef(imageChildren[0]);
    if (!shared || imageChildren.some((child) => nodeImageRef(child) !== shared))
        return null;
    const dim = imageDims[shared];
    const stitchedByImporter = node.__ftocStitchedSlice9 === true;
    if (!dim || (!stitchedByImporter &&
        (Math.abs(dim.width - (node.width || 0)) > 1 || Math.abs(dim.height - (node.height || 0)) > 1)))
        return null;
    const stitchedBorder = node.__ftocStitchedSlice9Border;
    const border = stitchedBorder
        ? normalizedSlice9Border(stitchedBorder)
        : sliceGridBorder(layout.grid, layout.rows, layout.cols);
    // 全 0 border ⇒ 没有任何固定边，当九宫无意义（也可能是 constraints 不可用且
    // 落在枚举回落之外的组合）。维持不识别，别把普通拼图当成"全 0 边九宫"。
    if (!(border.left > 0 || border.right > 0 || border.top > 0 || border.bottom > 0))
        return null;
    return {
        imageRef: shared,
        border,
        childrenToSkip: new Set(imageChildren),
        rows: layout.rows,
        cols: layout.cols,
    };
}
/**
 * Legacy/Unity-compatible slice exports can contain three or nine independent PNGs.
 * Cocos needs one SpriteFrame for SLICED rendering, so rebuild the source raster before
 * semantic border isolation. Shared-source crop grids keep using the cheaper existing path.
 */
function prepareStitchedImplicitSlice9(node, images, imageDims, allowExplicitParent = false) {
    const layout = buildImplicitSliceGrid(node, allowExplicitParent);
    if (!layout)
        return null;
    const cells = layout.grid.flat().filter(Boolean);
    const refs = cells.map((cell) => String(nodeImageRef(cell) || ''));
    if (refs.some((ref) => !ref || !Object.prototype.hasOwnProperty.call(images, ref))) {
        console.warn(`[figma-importer] 疑似碎片九宫缺少图片池资源，保留原子树：${node.name || node.figmaId || '(unnamed)'}`);
        return null;
    }
    if (refs.every((ref) => ref === refs[0]))
        return null;
    const decoded = layout.grid.map((row) => row.map((cell) => {
        if (!cell)
            return null;
        const ref = String(nodeImageRef(cell) || '');
        return (0, pngcrop_1.decodePngPixels)(Buffer.from(images[ref], 'base64'));
    }));
    if (decoded.some((row) => row.some((png) => !png))) {
        console.warn(`[figma-importer] 碎片九宫 PNG 解码失败，保留原子树：${node.name || node.figmaId || '(unnamed)'}`);
        return null;
    }
    // Fractional Figma geometry can round adjacent exports by one pixel. Use the
    // largest raster in each row/column instead of rejecting an otherwise valid grid.
    const colWidths = Array.from({ length: layout.cols }, (_, col) => Math.max(...decoded.map((row) => row[col].width)));
    const rowHeights = Array.from({ length: layout.rows }, (_, row) => Math.max(...decoded[row].map((png) => png.height)));
    const width = colWidths.reduce((sum, value) => sum + value, 0);
    const height = rowHeights.reduce((sum, value) => sum + value, 0);
    if (width <= 0 || height <= 0)
        return null;
    const rgba = Buffer.alloc(width * height * 4);
    let y = 0;
    for (let row = 0; row < layout.rows; row++) {
        let x = 0;
        for (let col = 0; col < layout.cols; col++) {
            const png = decoded[row][col];
            for (let sourceRow = 0; sourceRow < png.height; sourceRow++) {
                const sourceStart = sourceRow * png.width * 4;
                const targetStart = ((y + sourceRow) * width + x) * 4;
                png.rgba.copy(rgba, targetStart, sourceStart, sourceStart + png.width * 4);
            }
            x += colWidths[col];
        }
        y += rowHeights[row];
    }
    const stitched = (0, pngcrop_1.encodePngPixels)({ width, height, rgba });
    const stitchedRef = `ftoc_stitched_slice9_${(0, crypto_1.createHash)('md5').update(stitched).digest('hex').slice(0, 16)}`;
    images[stitchedRef] = stitched.toString('base64');
    imageDims[stitchedRef] = { width, height };
    const stitchedBorder = {
        left: layout.cols === 3 ? colWidths[0] : 0,
        right: layout.cols === 3 ? colWidths[2] : 0,
        top: layout.rows === 3 ? rowHeights[0] : 0,
        bottom: layout.rows === 3 ? rowHeights[2] : 0,
    };
    node.__ftocStitchedSlice9 = true;
    node.__ftocStitchedSlice9Border = stitchedBorder;
    for (let index = 0; index < cells.length; index++) {
        rewriteNodeImageRef(cells[index], refs[index], stitchedRef);
    }
    console.log(`[figma-importer] Unity 风格碎片九宫已拼合：${node.name || node.figmaId || '(unnamed)'} ` +
        `${layout.rows}x${layout.cols} -> ${width}x${height}`);
    return {
        imageRef: stitchedRef,
        border: stitchedBorder,
        childrenToSkip: new Set(cells),
        rows: layout.rows,
        cols: layout.cols,
    };
}
function normalizedSlice9Border(border) {
    return {
        left: Math.max(0, Math.round(Number(border && border.left) || 0)),
        right: Math.max(0, Math.round(Number(border && border.right) || 0)),
        top: Math.max(0, Math.round(Number(border && border.top) || 0)),
        bottom: Math.max(0, Math.round(Number(border && border.bottom) || 0)),
    };
}
function semanticSlice9ImageRef(imageRef, border) {
    const normalized = normalizedSlice9Border(border);
    const signature = `${normalized.left}_${normalized.right}_${normalized.top}_${normalized.bottom}`;
    const baseRef = String(imageRef || '').replace(/__ftoc_slice9_\d+_\d+_\d+_\d+$/, '');
    return `${baseRef}__ftoc_slice9_${signature}`;
}
function rewriteNodeImageRef(node, sourceRef, semanticRef) {
    if (String(node.imageRef || '') === sourceRef) {
        node.imageRef = semanticRef;
        return true;
    }
    const fill = firstVisibleImageFill(node);
    if (fill && String(fill.imageRef || '') === sourceRef) {
        fill.imageRef = semanticRef;
        return true;
    }
    return false;
}
function collapseExplicitSliceChildrenToParent(node) {
    const parentRef = String(nodeImageRef(node) || '');
    const layout = buildImplicitSliceGrid(node, true);
    if (!parentRef || !layout)
        return;
    for (const cell of layout.grid.flat()) {
        if (!cell)
            continue;
        const childRef = String(nodeImageRef(cell) || '');
        if (childRef)
            rewriteNodeImageRef(cell, childRef, parentRef);
    }
}
function pruneUnusedImagePool(root, images, imageDims) {
    if (!root || !images)
        return 0;
    const used = new Set();
    const visit = (node) => {
        const ref = nodeImageRef(node);
        if (ref)
            used.add(String(ref));
        const maskRef = node && node.mask && node.mask.imageRef;
        if (maskRef)
            used.add(String(maskRef));
        for (const child of node.children || [])
            visit(child);
    };
    visit(root);
    let removed = 0;
    for (const ref of Object.keys(images)) {
        if (used.has(ref))
            continue;
        delete images[ref];
        delete imageDims[ref];
        removed++;
    }
    return removed;
}
/**
 * @zh 同一 PNG 的 SpriteFrame border 是资源级状态，不能由不同 SLICE9 节点共享后互相覆盖。
 *     在落盘和 slimTree 查图前，把「原 imageRef + 归一化 border」变成稳定语义 ref：
 *     同图同 border 复用一个 ref；同图不同 border 进入不同 SpriteFrame；普通图片 ref 不变。
 */
function prepareSlice9ImageVariants(root, images, imageDims) {
    const stats = {
        explicitNodes: 0,
        implicitNodes: 0,
        semanticImages: 0,
        missingImages: 0,
    };
    if (!root || !images)
        return stats;
    const semanticRefs = new Set();
    const missingRefs = new Set();
    const applyVariant = (nodes, imageRef, border) => {
        const sourceRef = String(imageRef || '');
        if (!sourceRef || !Object.prototype.hasOwnProperty.call(images, sourceRef)) {
            if (sourceRef)
                missingRefs.add(sourceRef);
            return false;
        }
        const semanticRef = semanticSlice9ImageRef(sourceRef, border);
        const sourceImage = images[sourceRef];
        if (Object.prototype.hasOwnProperty.call(images, semanticRef) && images[semanticRef] !== sourceImage) {
            throw new Error(`[figma-importer] SLICE9 semantic image ref collision: ${semanticRef}`);
        }
        images[semanticRef] = sourceImage;
        if (imageDims[sourceRef])
            imageDims[semanticRef] = imageDims[sourceRef];
        let rewritten = false;
        for (const node of nodes) {
            rewritten = rewriteNodeImageRef(node, sourceRef, semanticRef) || rewritten;
        }
        if (rewritten)
            semanticRefs.add(semanticRef);
        return rewritten;
    };
    const visit = (node) => {
        if (String(node.componentType || '').toUpperCase() === 'SLICE9' && node.slice9Border) {
            const imageRef = nodeImageRef(node);
            let applied = imageRef && applyVariant([node], imageRef, normalizedSlice9Border(node.slice9Border));
            if (!applied) {
                const stitched = prepareStitchedImplicitSlice9(node, images, imageDims, true);
                if (stitched) {
                    node.imageRef = stitched.imageRef;
                    applied = applyVariant([node], stitched.imageRef, normalizedSlice9Border(node.slice9Border));
                    if (imageRef)
                        missingRefs.delete(String(imageRef));
                }
            }
            if (applied) {
                collapseExplicitSliceChildrenToParent(node);
                stats.explicitNodes++;
            }
        }
        else {
            const detected = prepareStitchedImplicitSlice9(node, images, imageDims) ||
                detectImplicitSlice9(node, imageDims);
            if (detected && applyVariant(Array.from(detected.childrenToSkip), detected.imageRef, normalizedSlice9Border(detected.border))) {
                stats.implicitNodes++;
            }
        }
        for (const child of node.children || [])
            visit(child);
    };
    visit(root);
    stats.semanticImages = semanticRefs.size;
    stats.missingImages = missingRefs.size;
    return stats;
}
function buildSemanticSliceGrid(children) {
    const placed = [
        [null, null, null],
        [null, null, null],
        [null, null, null],
    ];
    for (const child of children) {
        const key = String(child.name || '').trim().toLowerCase();
        const pos = SEMANTIC_SLICE_POS[key];
        if (!pos || placed[pos.row][pos.col])
            return null;
        placed[pos.row][pos.col] = child;
    }
    return compactSliceGrid(placed);
}
function buildPositionSliceGrid(children) {
    if (!children.every((child) => String(child.name || '').toLowerCase() === 'rectangle'))
        return null;
    const xs = clusterNumbers(children.map((child) => Number(child.x) || 0), 2);
    const ys = clusterNumbers(children.map((child) => Number(child.y) || 0), 2);
    // 不再枚举 3x1 / 1x3 / 3x3：任意 rows×cols（各 1..3，1×1 除外）都可能是切片布局。
    // 单侧边距只需 1×2 / 2×1，相邻两侧需 2×2，一轴两侧+另一轴单侧需 2×3 / 3×2
    //（原先"只认 3/9"正是钉钉反馈 #34 的根因之一）。哪几侧是固定边交由
    // sliceGridBorder 按 constraints 判定；判不出来会返回全 0，调用方据此判失败。
    if (xs.length < 1 || xs.length > 3 || ys.length < 1 || ys.length > 3)
        return null;
    if (xs.length === 1 && ys.length === 1)
        return null; // 单片不是切片
    if (xs.length * ys.length !== children.length)
        return null; // 网格必须完整
    const grid = Array.from({ length: ys.length }, () => Array.from({ length: xs.length }, () => null));
    for (const child of children) {
        const col = nearestClusterIndex(xs, Number(child.x) || 0);
        const row = nearestClusterIndex(ys, Number(child.y) || 0);
        if (row < 0 || col < 0 || grid[row][col])
            return null;
        grid[row][col] = child;
    }
    if (grid.some((row) => row.some((cell) => !cell)))
        return null;
    // 纯位置聚类只看"N 个矩形紧密平铺"，而导入端为带子节点的 RECTANGLE 造的 bgRect
    // 一律是 STRETCH/STRETCH，几个凑在一起完全满足几何条件 ⇒ 会被误判成九宫、
    // 整块按 SLICE9 处理，平铺/普通图语义随之丢失（钉钉反馈 #40）。
    // 所以位置路径必须复核：至少有一片"贴边固定"。
    // 语义命名路径（buildSemanticSliceGrid，top-l/center/… ）不受此限——
    // 命名本身已表达切片语义，那些素材通常压根不带 constraints。
    // 与导出端 geometryFallbackWithFixedEdgeCheck 同线。
    if (!hasAnyFixedEdgeSlice(grid, ys.length, xs.length))
        return null;
    return { grid, rows: ys.length, cols: xs.length };
}
function compactSliceGrid(placed) {
    const rowUsed = placed.map((row) => row.some(Boolean));
    const colUsed = [0, 1, 2].map((col) => placed.some((row) => !!row[col]));
    const rows = rowUsed.filter(Boolean).length;
    const cols = colUsed.filter(Boolean).length;
    if (!((rows === 1 && cols === 3) || (rows === 3 && cols === 1) || (rows === 3 && cols === 3)))
        return null;
    const grid = placed
        .filter((_, row) => rowUsed[row])
        .map((row) => row.filter((_, col) => colUsed[col]));
    if (grid.some((row) => row.some((cell) => !cell)))
        return null;
    return { grid, rows, cols };
}
/**
 * @zh 某一轴上判断「首/末轨道是不是固定边」，依据 constraints。
 *     与导出端 classifyAxisFixedEdges、Unity 端 TryClassifyAxisFixedEdges 同一套规则，三端必须同线。
 *     轨道数 1 = 该轴未切分（须为 Stretch，两侧无 border）；
 *     2 = 一端固定 + 一端拉伸（两端都固定只是普通拼图，不是九宫）；
 *     3 = 首固定 + 中拉伸 + 末固定。
 *     同一轨道上所有切片在该轴的约束必须一致，否则语义不明 → 返回 null。
 */
function classifyAxisFixedEdges(grid, rows, cols, horizontal) {
    const trackCount = horizontal ? cols : rows;
    const kinds = [];
    for (let t = 0; t < trackCount; t++) {
        let kind = null;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if ((horizontal ? c : r) !== t)
                    continue;
                const cell = grid[r][c];
                if (!cell)
                    return null;
                const cons = cell.constraints;
                const raw = cons ? String(horizontal ? cons.horizontal : cons.vertical || '') : '';
                let k;
                if (raw === 'LEFT' || raw === 'TOP')
                    k = 'START';
                else if (raw === 'RIGHT' || raw === 'BOTTOM')
                    k = 'END';
                else if (raw === 'LEFT_RIGHT' || raw === 'TOP_BOTTOM' || raw === 'SCALE')
                    k = 'STRETCH';
                else
                    return null; // CENTER / 缺失 ⇒ 不构成切片语义
                if (kind === null)
                    kind = k;
                else if (kind !== k)
                    return null; // 同轨约束不一致
            }
        }
        if (kind === null)
            return null;
        kinds.push(kind);
    }
    if (trackCount === 1)
        return kinds[0] === 'STRETCH' ? { startFixed: false, endFixed: false } : null;
    if (trackCount === 2) {
        if (kinds[0] === 'START' && kinds[1] === 'STRETCH')
            return { startFixed: true, endFixed: false };
        if (kinds[0] === 'STRETCH' && kinds[1] === 'END')
            return { startFixed: false, endFixed: true };
        return null;
    }
    if (trackCount === 3) {
        if (kinds[0] === 'START' && kinds[1] === 'STRETCH' && kinds[2] === 'END') {
            return { startFixed: true, endFixed: true };
        }
        return null;
    }
    return null;
}
/**
 * @zh 由网格结构推出九宫 border。
 *     优先按 constraints 判定哪几侧固定，从而支持任意 rows×cols（≤3×3）：
 *     单侧边距 1×2/2×1、相邻两侧 2×2、一轴两侧+另一轴单侧 2×3/3×2，以及经典 1×3/3×1/3×3。
 *     constraints 不可用（老素材没带或值不规范）时回落到原先按 rows/cols 枚举的规则，
 *     保证既有 1×3/3×1/3×3 素材行为一字不变。
 */
/**
 * @zh 切片集里是否至少有一片"贴边固定"（LEFT/RIGHT/TOP/BOTTOM）。
 *     只看是否存在固定边、不校验其分布——分布交给上面的 classifyAxisFixedEdges 管，
 *     这里的职责仅是拦掉"全 STRETCH / 混 CENTER"这类根本没有固定边的集合，
 *     它们不构成九宫语义（典型来源：导入端为带子节点的 RECTANGLE 造的 bgRect，
 *     一律 STRETCH/STRETCH）。与导出端 geometryFallbackWithFixedEdgeCheck 同线。
 *     刻意宽松：只要一片固定即放行，从而保留"constraints 不规范但几何成立的老素材"
 *     仍能被枚举回落接受的能力。
 */
function hasAnyFixedEdgeSlice(grid, rows, cols) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            const cons = cell && cell.constraints;
            if (!cons)
                continue;
            const h = String(cons.horizontal || '');
            const v = String(cons.vertical || '');
            if (h === 'LEFT' || h === 'RIGHT' || v === 'TOP' || v === 'BOTTOM')
                return true;
        }
    }
    return false;
}
function sliceGridBorder(grid, rows, cols) {
    const xEdges = classifyAxisFixedEdges(grid, rows, cols, true);
    const yEdges = classifyAxisFixedEdges(grid, rows, cols, false);
    if (xEdges && yEdges && (xEdges.startFixed || xEdges.endFixed || yEdges.startFixed || yEdges.endFixed)) {
        return {
            left: xEdges.startFixed ? Number(grid[0][0] && grid[0][0].width) || 0 : 0,
            right: xEdges.endFixed ? Number(grid[0][cols - 1] && grid[0][cols - 1].width) || 0 : 0,
            top: yEdges.startFixed ? Number(grid[0][0] && grid[0][0].height) || 0 : 0,
            bottom: yEdges.endFixed ? Number(grid[rows - 1][0] && grid[rows - 1][0].height) || 0 : 0,
        };
    }
    // ── 回落：原枚举规则（constraints 不可用的老素材）─────────────
    if (rows === 1 && cols === 3) {
        return {
            left: Number(grid[0][0] && grid[0][0].width) || 0,
            right: Number(grid[0][2] && grid[0][2].width) || 0,
            top: 0,
            bottom: 0,
        };
    }
    if (rows === 3 && cols === 1) {
        return {
            left: 0,
            right: 0,
            top: Number(grid[0][0] && grid[0][0].height) || 0,
            bottom: Number(grid[2][0] && grid[2][0].height) || 0,
        };
    }
    if (rows === 3 && cols === 3) {
        return {
            left: Number(grid[0][0] && grid[0][0].width) || 0,
            right: Number(grid[0][2] && grid[0][2].width) || 0,
            top: Number(grid[0][0] && grid[0][0].height) || 0,
            bottom: Number(grid[2][0] && grid[2][0].height) || 0,
        };
    }
    // 其余组合在没有 constraints 时无法判断哪侧固定，返回全 0 交由调用方判失败。
    return { left: 0, right: 0, top: 0, bottom: 0 };
}
function clusterNumbers(values, tolerance) {
    const sorted = [...values].sort((a, b) => a - b);
    const clusters = [];
    for (const value of sorted) {
        const last = clusters[clusters.length - 1];
        if (last && Math.abs(value - last.value) <= tolerance) {
            last.sum += value;
            last.count++;
            last.value = last.sum / last.count;
        }
        else {
            clusters.push({ sum: value, count: 1, value });
        }
    }
    return clusters.map((cluster) => cluster.value);
}
function nearestClusterIndex(clusters, value) {
    let best = -1;
    let bestDist = Infinity;
    clusters.forEach((cluster, index) => {
        const dist = Math.abs(cluster - value);
        if (dist < bestDist) {
            best = index;
            bestDist = dist;
        }
    });
    return bestDist <= 2 ? best : -1;
}
function firstVisibleSolidFill(node) {
    const fills = node.fills || [];
    return fills.find((f) => f && f.type === 'SOLID' && f.visible !== false);
}
function colorFromFigmaFill(fill) {
    var _a, _b, _c, _d;
    if (!fill)
        return undefined;
    if (fill.gradientMode && fill.gradientColorA && fill.gradientColorB) {
        return (0, mapping_fallbacks_1.averageFigmaColor)(fill.gradientColorA, fill.gradientColorB);
    }
    return {
        r: Math.round(((_a = fill.r) !== null && _a !== void 0 ? _a : 1) * 255),
        g: Math.round(((_b = fill.g) !== null && _b !== void 0 ? _b : 1) * 255),
        b: Math.round(((_c = fill.b) !== null && _c !== void 0 ? _c : 1) * 255),
        a: Math.round(((_d = fill.a) !== null && _d !== void 0 ? _d : 1) * 255),
    };
}
function rgba255FromFigmaColor(c, fallback) {
    return {
        r: Math.round(Math.max(0, Math.min(1, c && typeof c.r === 'number' ? c.r : fallback.r / 255)) * 255),
        g: Math.round(Math.max(0, Math.min(1, c && typeof c.g === 'number' ? c.g : fallback.g / 255)) * 255),
        b: Math.round(Math.max(0, Math.min(1, c && typeof c.b === 'number' ? c.b : fallback.b / 255)) * 255),
        a: Math.round(Math.max(0, Math.min(1, c && typeof c.a === 'number' ? c.a : fallback.a / 255)) * 255),
    };
}
/**
 * @en For a TEXT node, pull its visible solid/linear-gradient fallback color as 0-255 RGBA.
 * @zh 取 TEXT 节点的可见纯色/线性渐变降级色（Figma 是 0~1 浮点，转成 0~255）。
 *     Cocos Label 还没有 TMP 那种顶点渐变；遇到 Figma 线性渐变时取两端均值作单色 fallback。
 */
function textColor(node) {
    return colorFromFigmaFill(firstVisibleSolidFill(node));
}
function textGradient(node) {
    const fills = node.fills || [];
    const fill = fills.find((f) => f && f.type === 'SOLID' && f.visible !== false && f.gradientMode && f.gradientColorA && f.gradientColorB);
    if (!fill)
        return undefined;
    return {
        mode: String(fill.gradientMode || ''),
        a: rgba255FromFigmaColor(fill.gradientColorA, { r: 255, g: 255, b: 255, a: 255 }),
        b: rgba255FromFigmaColor(fill.gradientColorB, { r: 255, g: 255, b: 255, a: 255 }),
    };
}
/**
 * @en Normalize newlines: CRLF/CR/U+2028/U+2029 → single \n (avoids extra blank lines / clipped boxes).
 * @zh 换行归一化：CRLF/CR/行分隔符 → 单个 \n（否则多空行会压框）。
 */
function normalizeNewlines(s) {
    if (!s)
        return s;
    // CRLF/CR then U+2028 / U+2029 line separators collapse to a single \n
    return s.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
}
function normalizeTextSegments(node) {
    const segments = Array.isArray(node.textSegments) ? node.textSegments : [];
    if (segments.length <= 1)
        return undefined;
    const chars = normalizeNewlines(node.characters || '');
    const out = segments.map((seg) => {
        const rawRgb = seg.color ? [Number(seg.color.r), Number(seg.color.g), Number(seg.color.b)] : [];
        const rgbIsUnitRange = rawRgb.length === 3 && rawRgb.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
        const toByte = (value, unitRange, fallback) => {
            const numeric = Number(value);
            const resolved = Number.isFinite(numeric) ? numeric : fallback;
            return Math.max(0, Math.min(255, Math.round(resolved * (unitRange ? 255 : 1))));
        };
        const alpha = seg.color ? Number(seg.color.a) : NaN;
        const alphaIsUnitRange = Number.isFinite(alpha) && alpha >= 0 && alpha <= 1;
        const color = seg.color ? {
            r: toByte(seg.color.r, rgbIsUnitRange, rgbIsUnitRange ? 1 : 255),
            g: toByte(seg.color.g, rgbIsUnitRange, rgbIsUnitRange ? 1 : 255),
            b: toByte(seg.color.b, rgbIsUnitRange, rgbIsUnitRange ? 1 : 255),
            a: toByte(seg.color.a, alphaIsUnitRange, alphaIsUnitRange ? 1 : 255),
        } : undefined;
        return {
            start: Math.max(0, Math.min(chars.length, Math.round(Number(seg.start) || 0))),
            end: Math.max(0, Math.min(chars.length, Math.round(Number(seg.end) || 0))),
            fontSize: Number(seg.fontSize) || 0,
            color,
        };
    }).filter((seg) => seg.end > seg.start);
    if (out.length <= 1)
        return undefined;
    const first = out[0];
    const sizeMixed = out.some((seg) => Math.abs((seg.fontSize || 0) - (first.fontSize || 0)) > 0.01);
    const colorMixed = out.some((seg) => !sameColor(seg.color, first.color));
    return sizeMixed || colorMixed ? out : undefined;
}
function sameColor(a, b) {
    if (!a && !b)
        return true;
    if (!a || !b)
        return false;
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
/**
 * @en First visible SOLID stroke → LabelOutline params (color 0-255 + width). 对齐 Unity TryGetStroke。
 * @zh 取第一个可见 SOLID 描边 → LabelOutline 参数（颜色 0~255 + 宽度）。无可见描边返回 undefined。
 */
function textStroke(node) {
    var _a, _b, _c, _d;
    const strokes = node.strokes || [];
    const s = strokes.find((k) => k && k.visible !== false && k.type === 'SOLID');
    if (!s)
        return undefined;
    return {
        color: {
            r: Math.round(((_a = s.r) !== null && _a !== void 0 ? _a : 0) * 255),
            g: Math.round(((_b = s.g) !== null && _b !== void 0 ? _b : 0) * 255),
            b: Math.round(((_c = s.b) !== null && _c !== void 0 ? _c : 0) * 255),
            a: Math.round(((_d = s.a) !== null && _d !== void 0 ? _d : 1) * 255),
        },
        width: node.strokeWeight || 0,
    };
}
/**
 * @en First visible DROP_SHADOW effect → LabelShadow params (color 0-255 + offset + blur).
 * @zh 取第一个可见 DROP_SHADOW → LabelShadow 参数（颜色 0~255 + 偏移 + 模糊）。对齐 Unity ExtractEffects。
 *     注意：Figma Y 向下为正，Cocos Y 向上为正，offsetY 在 scene 侧翻符号（这里只透传原值）。
 */
function textShadow(node) {
    var _a, _b, _c, _d;
    const effects = node.effects || [];
    const e = effects.find((k) => k && k.visible !== false && k.type === 'DROP_SHADOW');
    if (!e)
        return undefined;
    return {
        color: {
            r: Math.round(((_a = e.r) !== null && _a !== void 0 ? _a : 0) * 255),
            g: Math.round(((_b = e.g) !== null && _b !== void 0 ? _b : 0) * 255),
            b: Math.round(((_c = e.b) !== null && _c !== void 0 ? _c : 0) * 255),
            a: Math.round(((_d = e.a) !== null && _d !== void 0 ? _d : 1) * 255),
        },
        offsetX: e.offsetX || 0,
        offsetY: e.offsetY || 0,
        blur: e.radius || 0,
    };
}
/**
 * @en Strip a Figma node tree down to the fields stage-1/2 need.
 *     Carries only an imageRef (pool id), never base64 — dedup + landing happen in main.
 * @zh 把节点树瘦身成阶段 1/2 需要的字段。只带 imageRef（池 id），绝不带 base64。
 */
function slimTree(node, fontLib, textStyleLib, fontTracker, textStyleTracker, textStyleTemplateTracker, imageDims, maskRoutes, stats) {
    const implicitSlice9 = detectImplicitSlice9(node, imageDims);
    const explicitSliceGrid = String(node.componentType || '').toUpperCase() === 'SLICE9'
        ? buildImplicitSliceGrid(node, true)
        : null;
    const explicitSliceChildren = explicitSliceGrid
        ? new Set(explicitSliceGrid.grid.flat().filter(Boolean))
        : null;
    const sharedCroppedImageRef = implicitSlice9 ? undefined : detectSharedCroppedImageRef(node, imageDims);
    if (implicitSlice9) {
        stats.implicitSlice9Images++;
    }
    if (sharedCroppedImageRef) {
        stats.sharedCroppedImages++;
    }
    const slim = {
        figmaId: node.figmaId,
        name: node.name,
        type: node.type,
        figmaType: node.figmaType,
        componentKey: String(node.componentKey || ''),
        componentProperties: (0, component_mapping_1.normalizeComponentProperties)(node.componentProperties),
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rotation: node.rotation,
        scaleX: typeof node.scaleX === 'number' ? node.scaleX : 1,
        scaleY: typeof node.scaleY === 'number' ? node.scaleY : 1,
        relativeTransform: Array.isArray(node.relativeTransform) ? node.relativeTransform : undefined,
        visible: node.visible !== false,
        opacity: typeof node.opacity === 'number' ? node.opacity : 1,
        imageRef: implicitSlice9 ? implicitSlice9.imageRef : (sharedCroppedImageRef || nodeImageRef(node)),
        children: (node.children || [])
            .filter((c) => {
            if (explicitSliceChildren && explicitSliceChildren.has(c))
                return false;
            if (implicitSlice9 && implicitSlice9.childrenToSkip.has(c)) {
                stats.implicitSlice9SliceChildren++;
                return false;
            }
            if (!sharedCroppedImageRef || nodeImageRef(c) !== sharedCroppedImageRef)
                return true;
            stats.sharedCroppedSliceChildren++;
            return false;
        })
            .map((c) => slimTree(c, fontLib, textStyleLib, fontTracker, textStyleTracker, textStyleTemplateTracker, imageDims, maskRoutes, stats)),
    };
    if (sharedCroppedImageRef)
        slim.sharedCroppedImage = true;
    if (implicitSlice9) {
        slim.componentType = 'SLICE9';
        slim.slice9Border = implicitSlice9.border;
        slim.implicitSlice9 = { rows: implicitSlice9.rows, cols: implicitSlice9.cols };
    }
    if (node.overlayTint)
        slim.overlayTint = node.overlayTint;
    const imgMeta = imageFillMeta(node);
    if (imgMeta) {
        const ref = nodeImageRef(node);
        const dim = ref ? imageDims[ref] : undefined;
        if (dim) {
            imgMeta.rawWidth = dim.width;
            imgMeta.rawHeight = dim.height;
            const nodeAspect = (node.width || 0) > 0 && (node.height || 0) > 0 ? (node.width || 0) / (node.height || 1) : 0;
            const rawAspect = dim.width / dim.height;
            if (!imgMeta.cropRect && !imgMeta.imageTransform &&
                nodeAspect > 0 && Math.abs(nodeAspect - rawAspect) < 0.002) {
                imgMeta.skipCoverCrop = true;
            }
        }
        slim.imageFill = imgMeta;
    }
    // 阶段 3：约束 + 布局判定 + 裁剪字段（纯标量/池 id，绝不带 base64）
    if (node.constraints)
        slim.constraints = node.constraints;
    if (node.layoutMode)
        slim.layoutMode = node.layoutMode;
    if (node.layoutWrap)
        slim.layoutWrap = node.layoutWrap;
    if (node.layoutPositioning)
        slim.layoutPositioning = node.layoutPositioning;
    // Figma native GRID uses explicit tracks rather than Auto Layout wrap.
    // Keep these scalar fields in the slim import contract; dropping them
    // silently turns a native grid into absolute positioning on the Cocos side.
    if (node.layoutMode === 'GRID') {
        for (const key of ['gridRowCount', 'gridColumnCount', 'gridRowGap', 'gridColumnGap']) {
            if (typeof node[key] === 'number' && Number.isFinite(node[key]))
                slim[key] = node[key];
        }
    }
    // AutoLayout 排布参数（scene.ts applyLayout 读取，缺则 spacingX/对齐全归 0）
    if (typeof node.itemSpacing === 'number')
        slim.itemSpacing = node.itemSpacing;
    if (typeof node.counterAxisSpacing === 'number')
        slim.counterAxisSpacing = node.counterAxisSpacing;
    if (node.primaryAxisAlignItems)
        slim.primaryAxisAlignItems = node.primaryAxisAlignItems;
    if (node.counterAxisAlignItems)
        slim.counterAxisAlignItems = node.counterAxisAlignItems;
    if (node.padding)
        slim.padding = {
            top: node.padding.top || 0,
            right: node.padding.right || 0,
            bottom: node.padding.bottom || 0,
            left: node.padding.left || 0,
        };
    if (node.clipsContent)
        slim.clipsContent = true;
    if (node.componentType)
        slim.componentType = node.componentType;
    if (String(node.componentType || '').toUpperCase() === 'INPUT' && node.inputSpec) {
        const spec = node.inputSpec;
        const textNodeId = String(spec.textNodeId || '');
        if (textNodeId) {
            slim.inputSpec = {
                multiline: spec.multiline === true,
                maxLength: Number.isFinite(Number(spec.maxLength)) ? Math.trunc(Number(spec.maxLength)) : -1,
                placeholder: String(spec.placeholder || ''),
                string: String(spec.string || ''),
                textRole: spec.textRole === 'string' ? 'string' : 'placeholder',
                textNodeId,
                counterNodeId: spec.counterNodeId ? String(spec.counterNodeId) : undefined,
                backgroundNodeId: spec.backgroundNodeId ? String(spec.backgroundNodeId) : undefined,
            };
        }
    }
    if (typeof node.cornerRadius === 'number')
        slim.cornerRadius = node.cornerRadius;
    if (Array.isArray(node.cornerRadii))
        slim.cornerRadii = node.cornerRadii;
    if (node.slice9Border)
        slim.slice9Border = {
            left: node.slice9Border.left || 0,
            right: node.slice9Border.right || 0,
            top: node.slice9Border.top || 0,
            bottom: node.slice9Border.bottom || 0,
        };
    if (node.type !== 'TEXT') {
        const solid = firstVisibleSolidFill(node);
        const color = colorFromFigmaFill(solid);
        if (color)
            slim.solidFill = { color };
    }
    // 图片遮罩：只透传坐标 + 池 id（maskRef 查 idToSpriteFrame，与节点图共池）
    if (node.mask) {
        const maskRoute = maskRoutes.get(node);
        if (maskRoute && maskRoute.useImageMask)
            stats.imageMasks++;
        if (maskRoute && !maskRoute.useImageMask)
            stats.rectMaskFallbacks++;
        if (maskRoute && maskRoute.shape === 'DEGENERATE')
            stats.degenerateMasks++;
        slim.mask = {
            x: node.mask.x,
            y: node.mask.y,
            width: node.mask.width,
            height: node.mask.height,
            rotation: node.mask.rotation || 0,
            maskType: node.mask.maskType || '',
            kind: node.mask.kind || 'IMAGE',
            maskRef: node.mask.imageRef,
            shape: maskRoute ? maskRoute.shape : 'SHAPED',
            useImageMask: maskRoute ? maskRoute.useImageMask : true,
            fallbackReason: maskRoute ? maskRoute.fallbackReason : undefined,
        };
    }
    // 文本节点：带上渲染 Label 所需字段
    if (node.type === 'TEXT') {
        slim.characters = normalizeNewlines(node.characters || '');
        slim.fontSize = node.fontSize || 0;
        slim.fontFamily = node.fontFamily || '';
        slim.fontWeight = node.fontWeight || '';
        slim.textAlignHorizontal = node.textAlignHorizontal || '';
        slim.textAlignVertical = node.textAlignVertical || '';
        slim.textAutoResize = node.textAutoResize || '';
        slim.textTruncation = node.textTruncation || '';
        slim.lineHeight = node.lineHeight || 0;
        slim.letterSpacing = node.letterSpacing || 0;
        slim.textDecoration = node.textDecoration || '';
        slim.textCase = node.textCase || '';
        slim.color = textColor(node);
        const gradient = textGradient(node);
        if (gradient)
            slim.textGradient = gradient;
        const segments = normalizeTextSegments(node);
        if (segments)
            slim.textSegments = segments;
        slim.textStyle = (0, textstyle_1.extractTextStyleMeta)(node);
        textStyleTracker.record(node);
        // 阶段 5 字体样式库：描边/投影从 Figma 直接派生（Cocos 组件可生成，无需美术预配），
        // 字体族匹配到工程字体资源 uuid（未命中 → 不带 → scene 回退默认字体）。
        const stroke = textStroke(node);
        if (stroke)
            slim.stroke = stroke;
        const shadow = textShadow(node);
        if (shadow)
            slim.shadow = shadow;
        let font = (0, fontlib_1.matchFont)(node.fontFamily, node.fontWeight, fontLib);
        const textStyleMatch = (0, textstylelib_1.resolveTextStyleTemplate)(node, textStyleLib);
        textStyleTemplateTracker.record(textStyleMatch, textStyleLib.entries.length > 0);
        if (textStyleMatch) {
            const entry = textStyleMatch.entry;
            slim.textStyleTemplate = {
                tier: textStyleMatch.tier,
                score: Math.round(textStyleMatch.score * 1000) / 1000,
                source: entry.source,
                styleName: entry.styleName,
                figmaPath: entry.figmaPath,
                childName: entry.childName,
                fontUuid: (entry.font && entry.font.uuid) || (font && font.uuid) || '',
                fontFileName: (entry.font && entry.font.fileName) || (font && font.fileName) || '',
                prefabUuid: entry.prefabUuid || '',
            };
            // 命中样式（任意 tier）且节点自身没带描边/投影时，用模板 entry 的数值兜底。
            // 注：有 prefab 模板时，scene 侧会优先克隆模板节点外观；这里的数值是「无 prefab 库」时的降级路径。
            if (!stroke && entry.stroke) {
                slim.stroke = {
                    color: entry.stroke.color,
                    width: entry.stroke.width,
                    align: entry.stroke.align,
                };
            }
            if (!shadow && entry.shadow) {
                slim.shadow = {
                    color: entry.shadow.color,
                    offsetX: entry.shadow.offsetX,
                    offsetY: entry.shadow.offsetY,
                    blur: entry.shadow.blur,
                };
            }
            if (entry.font) {
                font = {
                    uuid: entry.font.uuid,
                    fileName: entry.font.fileName,
                    sim: textStyleMatch.score,
                    weightMatched: entry.font.weightMatched,
                };
            }
        }
        if (font) {
            slim.fontUuid = font.uuid;
            slim.fontFileName = font.fileName;
            slim.fontWeightMatched = font.weightMatched;
        }
        // 记录字体需求（命中/缺失）用于生成需求报告
        fontTracker.recordDemand(node.fontFamily, node.fontWeight, !!font, font ? undefined : (0, fontlib_1.explainFontMiss)(node.fontFamily, node.fontWeight, fontLib));
    }
    return slim;
}
/**
 * @en Prepare the scene-process payload from parsed Figma JSON.
 * @zh 把 Figma JSON 准备成 scene 脚本可消费的 payload。主导入与替换 beta 共用同一条链路。
 */
async function prepareScenePayloadFromData(data) {
    (0, mapping_diagnostics_1.reportMappingDiagnostics)(data);
    const prepared = prepareImportData(data);
    const imageDims = buildImageDimensionMap(prepared.images);
    const variantStats = preparePersistentImageVariants(prepared.root, prepared.images, imageDims);
    if (variantStats.croppedImageFills > 0 || variantStats.cropFailures > 0) {
        console.log(`[figma-importer] 持久化 IMAGE fill 裁切：生成 ${variantStats.croppedImageFills} 张裁切 PNG` +
            `${variantStats.cropFailures > 0 ? `，${variantStats.cropFailures} 张裁切失败回退运行时裁切` : ''}。`);
    }
    const slice9VariantStats = prepareSlice9ImageVariants(prepared.root, prepared.images, imageDims);
    if (slice9VariantStats.semanticImages > 0 || slice9VariantStats.missingImages > 0) {
        console.log(`[figma-importer] SLICE9 图片语义隔离：` +
            `${slice9VariantStats.explicitNodes} 个显式节点，${slice9VariantStats.implicitNodes} 个隐式节点，` +
            `${slice9VariantStats.semanticImages} 个 border 图片引用` +
            `${slice9VariantStats.missingImages > 0 ? `，${slice9VariantStats.missingImages} 个原图引用缺失` : ''}。`);
    }
    const explicitSpriteFrameBorders = collectSpriteFrameBorders(prepared.root);
    const implicitSpriteFrameBorders = collectImplicitSpriteFrameBorders(prepared.root, imageDims);
    const spriteFrameBorders = Object.assign(Object.assign({}, implicitSpriteFrameBorders.borders), explicitSpriteFrameBorders);
    if (implicitSpriteFrameBorders.count > 0) {
        console.log(`[figma-importer] 检测到 ${implicitSpriteFrameBorders.count} 个 Unity 风格隐式三/九切片节点，按 SLICE9 导入。`);
    }
    const maskRoutes = buildMaskRoutes(prepared.root, prepared.images);
    const unusedImages = pruneUnusedImagePool(prepared.root, prepared.images, imageDims);
    if (unusedImages > 0) {
        console.log(`[figma-importer] 图片池清理：跳过 ${unusedImages} 张当前场景未引用的图片。`);
    }
    const slimStats = {
        sharedCroppedImages: 0,
        sharedCroppedSliceChildren: 0,
        implicitSlice9Images: 0,
        implicitSlice9SliceChildren: 0,
        imageMasks: 0,
        rectMaskFallbacks: 0,
        degenerateMasks: 0,
    };
    let idToSpriteFrame = {};
    let idToMaskSpriteFrame = {};
    const assetImportFailures = [];
    // 主进程保留完整 meta 收敛状态；scene IPC 只接收 imgRef -> dbUrl 的轻量投影。
    let pendingSpriteFrames = {};
    if (prepared.images && Object.keys(prepared.images).length > 0) {
        const maskRefs = collectImageMaskRefs(prepared.root, maskRoutes);
        const maskImages = {};
        for (const ref of maskRefs) {
            if (prepared.images[ref])
                maskImages[ref] = prepared.images[ref];
        }
        console.log(`[figma-importer] landing ${Object.keys(prepared.images).length} images...`);
        const commonDirs = await readCommonResourceDirs();
        console.log(`[figma-importer] AssetDB 阶段 profile ready: ${commonDirs.join(', ')}`);
        const res = await (0, assets_1.landImages)(prepared.images, prepared.name || 'untitled', spriteFrameBorders, commonDirs);
        idToSpriteFrame = res.idToSpriteFrame;
        pendingSpriteFrames = res.unresolved || {};
        for (const [imgRef, failure] of Object.entries(res.failures || {})) {
            assetImportFailures.push(Object.assign({ imgRef, kind: 'sprite' }, failure));
        }
        if (Object.keys(pendingSpriteFrames).length > 0) {
            const readiness = await (0, assets_1.resolveSpriteFramesBeforeBuild)(pendingSpriteFrames);
            Object.assign(idToSpriteFrame, readiness.resolved);
            pendingSpriteFrames = readiness.unresolved;
            console.log(`[figma-importer] 建树前 SpriteFrame 就绪检查：` +
                `${Object.keys(readiness.resolved).length} 张已收敛，${Object.keys(pendingSpriteFrames).length} 张仍未就绪。`);
        }
        console.log(`[figma-importer] landed ${Object.keys(idToSpriteFrame).length} sprite frames`);
        if (Object.keys(maskImages).length > 0) {
            console.log(`[figma-importer] landing ${Object.keys(maskImages).length} mask images...`);
            const maskRes = await (0, assets_1.landMaskImages)(maskImages, prepared.name || 'untitled', commonDirs);
            idToMaskSpriteFrame = maskRes.idToSpriteFrame;
            for (const [imgRef, failure] of Object.entries(maskRes.failures || {})) {
                assetImportFailures.push(Object.assign({ imgRef, kind: 'mask' }, failure));
            }
            const unresolvedMasks = maskRes.unresolved || {};
            if (Object.keys(unresolvedMasks).length > 0) {
                const readiness = await (0, assets_1.resolveSpriteFramesBeforeBuild)(unresolvedMasks);
                Object.assign(idToMaskSpriteFrame, readiness.resolved);
                if (Object.keys(readiness.unresolved).length > 0) {
                    console.warn(`[figma-importer] ${Object.keys(readiness.unresolved).length} 张遮罩 SpriteFrame ` +
                        `在建树前仍未就绪，将按矩形遮罩降级。`);
                }
            }
            console.log(`[figma-importer] landed ${Object.keys(idToMaskSpriteFrame).length} mask sprite frames`);
        }
    }
    if (assetImportFailures.length > 0) {
        console.error('[figma-importer] 资源导入硬失败清单：', assetImportFailures);
    }
    const fontLib = await (0, fontlib_1.scanFontLibrary)();
    const textStyleLib = await (0, textstylelib_1.scanTextStyleLibrary)(fontLib);
    const fontTracker = new fontlib_1.FontDemandTracker();
    const textStyleTracker = new textstyle_1.TextStyleTracker();
    const textStyleTemplateTracker = new textstylelib_1.TextStyleTemplateTracker();
    const slim = slimTree(prepared.root, fontLib, textStyleLib, fontTracker, textStyleTracker, textStyleTemplateTracker, imageDims, maskRoutes, slimStats);
    lastComponentIdentities = (0, component_mapping_1.collectComponentIdentities)(slim);
    const mappingDocument = readComponentMappingDocument();
    const resolvedMappings = await resolveComponentMappingAssets(mappingDocument);
    if (lastComponentIdentities.length > 0 || mappingDocument.entries.length > 0) {
        console.log(`[figma-importer] 组件映射：本次发现 ${lastComponentIdentities.length} 个组件身份，` +
            `${resolvedMappings.valid} 条 Prefab 可用，${resolvedMappings.broken} 条断链。`);
    }
    if (slimStats.sharedCroppedImages > 0) {
        console.log(`[figma-importer] 检测到 ${slimStats.sharedCroppedImages} 个共享大图切片节点，` +
            `已跳过 ${slimStats.sharedCroppedSliceChildren} 个切片子节点。`);
    }
    if (slimStats.implicitSlice9Images > 0) {
        console.log(`[figma-importer] 检测到 ${slimStats.implicitSlice9Images} 个隐式三/九切片节点，` +
            `已跳过 ${slimStats.implicitSlice9SliceChildren} 个切片子节点。`);
    }
    if (slimStats.imageMasks > 0 || slimStats.rectMaskFallbacks > 0) {
        console.log(`[figma-importer] 图片遮罩路由：${slimStats.imageMasks} 个保留 Sprite stencil，` +
            `${slimStats.rectMaskFallbacks} 个退回矩形裁剪` +
            `${slimStats.degenerateMasks > 0 ? `（其中 ${slimStats.degenerateMasks} 个近乎空白）` : ''}。`);
    }
    const payload = {
        canvas: prepared.canvas,
        root: slim,
        idToSpriteFrame,
        idToMaskSpriteFrame,
        unresolved: Object.fromEntries(Object.entries(pendingSpriteFrames).map(([imgRef, pending]) => [imgRef, pending.dbUrl])),
        componentMappings: resolvedMappings.entries,
        componentStateRuntimeReady,
        importMeta: Object.assign({ interfaceCount: prepared.interfaceCount, componentIdentities: lastComponentIdentities.length, componentMappings: resolvedMappings.valid, brokenComponentMappings: resolvedMappings.broken, assetImportFailures: assetImportFailures.length, assetImportFailureSample: assetImportFailures.slice(0, 10) }, slimStats),
    };
    return {
        prepared,
        payload,
        pendingSpriteFrames,
        fontTracker,
        textStyleTracker,
        textStyleTemplateTracker,
        textStyleLib,
    };
}
/**
 * @en Core build pipeline from parsed export data: land images → slim tree → build scene.
 *     Shared by menu import (file) and push receive (HTTP). 铁律：base64 只在 landImages 落盘。
 * @zh 从已解析的导出数据建场景：落盘图片 → 瘦身树 → 建节点。菜单导入与推送接收共用。
 */
async function buildFromData(data) {
    const importStartMs = Date.now();
    const assetDbSession = (0, assetdb_1.beginAssetDbSession)(`导入「${data.name || 'untitled'}」`);
    const startStr = new Date(importStartMs).toLocaleString();
    console.log(`%c========== 导入开始于 ${startStr} · 构建版本 = ${types_1.BUILD_VERSION} ==========`, 'color:#0a0;font-weight:bold');
    let result;
    // 失败埋点用的「当前步骤」标记：抛异常时据此判断卡在哪一步（准备负载 / 建树 / 落盘保存）。
    let step = 'prepare';
    try {
        step = 'componentStateRuntime';
        let componentStateReady = false;
        try {
            componentStateReady = await ensureComponentStateRuntime();
        }
        catch (runtimeError) {
            (0, assetdb_1.rethrowIfAssetDbUnavailable)(runtimeError);
            componentStateRuntimeReady = false;
            console.warn(`[figma-importer] ${COMPONENT_STATE_RUNTIME_CLASS} 安装或升级失败，` +
                '本次导入将继续并把组件状态记为 unavailable：', (runtimeError === null || runtimeError === void 0 ? void 0 : runtimeError.message) || runtimeError);
        }
        if (!componentStateReady) {
            console.warn(`[figma-importer] ${COMPONENT_STATE_RUNTIME_CLASS} 尚未完成注册；` +
                '组件映射可继续，但本次状态字段会明确记为 unavailable。');
        }
        step = 'prepare';
        const preparedPayload = await prepareScenePayloadFromData(data);
        const { prepared, payload, fontTracker, textStyleTracker, textStyleTemplateTracker, textStyleLib } = preparedPayload;
        step = 'buildTree';
        result = await callScene('buildTree', payload);
        console.log('[figma-importer] buildTree result:', result);
        // 导入后主动刷新编辑器 Scene 视图：execute-scene-script 动态建的节点，视图不会自动重绘
        //（表现为背景“出现后消失”，手动保存+reload 才回来）。用户已验证“保存后 reload 就有”，
        // 故这里自动 snapshot + save-scene（把运行时节点落进 .scene）→ 编辑器随之重新加载渲染，等价手动那步。
        let placeholderReport = null;
        if (result && result.success !== false) {
            lastImportedJsonForPull = JSON.stringify(data, null, 4);
            lastImportedNameForPull = data.name || prepared.name || '';
            lastImportedRootUuid = result && result.data ? (result.data.rootUuid || '') : '';
            step = 'componentStateTargets';
            await finalizeComponentStateTargets(result);
            // 占位→替换：建树对「已落盘但子资源未就绪」的图先挂了品红占位；这里后台轮询子资源就绪、
            // 就绪后替换成真图，全部处理完（或超时）才保存——保存的是完整真图，而非品红。
            // 关键：建树已返回、品红已显示，此处等待不冻结建树主流程，故预算可远大于旧的固定 2.7s。
            step = 'resolvePlaceholders';
            placeholderReport = await resolvePreparedPlaceholders(result, preparedPayload.pendingSpriteFrames);
            step = 'saveScene';
            await saveSceneAfterImport(result);
            // 埋点：导入成功且已落盘 → 上报 cocos_import（fire-and-forget，不 await、失败静默）。
            (0, telemetry_1.trackImport)({ durationMs: Date.now() - importStartMs });
        }
        else {
            console.warn('[figma-importer] buildTree 未成功，跳过自动保存，避免落盘半截场景。', result);
            // 埋点：建树返回失败（未抛异常）→ 上报 cocos_import_failed，否则成功率永远算不出分母。
            (0, telemetry_1.trackImportFailed)('buildTree', (result && (result.error || result.message)) || 'buildTree returned success=false', {
                durationMs: Date.now() - importStartMs,
            });
        }
        // 缺失字体只打 console.warn（不写任何文件——写文件会触发工程刷新、打断刚建好的场景渲染）。
        textStyleTracker.report();
        textStyleTemplateTracker.report(textStyleLib);
        reportFontDemand(fontTracker);
        // 导入完成弹窗（用户诉求）：汇总图片加载情况，仍缺图的提示手动补。
        if (result && result.success !== false) {
            await showImportDoneDialog(result, placeholderReport);
        }
        return result;
    }
    catch (err) {
        // 埋点：导入抛异常 → 上报 cocos_import_failed（step 指出卡在哪一步，message 已脱敏+截断）。
        // 不吞异常：仍 rethrow 给上层原有的 console.error/弹窗逻辑，行为与改动前一致。
        // trackImportFailed 内部按 error 对象去重，上层 catch 再报同一个 err 不会重复计数。
        (0, telemetry_1.trackImportFailed)(step, err, { durationMs: Date.now() - importStartMs });
        throw err;
    }
    finally {
        (0, assetdb_1.endAssetDbSession)(assetDbSession);
        const elapsedSec = ((Date.now() - importStartMs) / 1000).toFixed(1);
        const ok = result && result.success !== false;
        console.log(`%c========== 导入结束${ok ? '' : '（未成功）'}。耗时 ${elapsedSec} s ==========`, `color:${ok ? '#0a0' : '#c62828'};font-weight:bold`);
    }
}
async function resolvePreparedPlaceholders(result, pendingSpriteFrames) {
    const placeholders = (result && result.data && result.data.unresolvedPlaceholders) || [];
    if (placeholders.length === 0)
        return null;
    return resolveAndReplacePlaceholders(placeholders, pendingSpriteFrames);
}
/**
 * @zh 后台轮询「已落盘但 meta/子资源未就绪」的图直到 SpriteFrame 完整收敛，
 *     再一次性替换品红占位为真图。同一资源的多个占位每轮只解析一次。
 * 就绪的批量交 scene.replaceImagePlaceholders 替换；超时仍未就绪的极少数保留品红（不报错）。
 * 返回 { total, replaced, stillMissing } 供完成弹窗汇总。
 */
async function resolveAndReplacePlaceholders(placeholders, pendingByImgRef = {}) {
    const total = placeholders.length;
    const MAX_TRIES = 50; // 50 × 300ms ≈ 15s 总预算
    const INTERVAL_MS = 300;
    console.log(`[figma-importer] ${total} 张图待就绪替换，开始后台轮询…`);
    const pendingByPlaceholder = {};
    for (let index = 0; index < placeholders.length; index++) {
        const ph = placeholders[index];
        const imgRef = String(ph && ph.imgRef || '');
        const dbUrl = String(ph && ph.dbUrl || '');
        if (!dbUrl)
            continue;
        pendingByPlaceholder[String(index)] = pendingByImgRef[imgRef] || (0, assets_1.createPendingFigmaSpriteFrame)(dbUrl, ph && ph.slice9Border || undefined);
    }
    const readiness = Object.keys(pendingByPlaceholder).length > 0
        ? await (0, assets_1.resolveSpriteFramesBeforeBuild)(pendingByPlaceholder, MAX_TRIES, INTERVAL_MS)
        : { resolved: {}, unresolved: {} };
    const resolvedItems = [];
    const unresolvedUrls = new Set();
    for (let index = 0; index < placeholders.length; index++) {
        const ph = placeholders[index];
        const uuid = String(ph && ph.spriteFrameUuid || readiness.resolved[String(index)] || '');
        if (uuid) {
            resolvedItems.push({
                nodeUuid: ph.nodeUuid,
                spriteFrameUuid: uuid,
                slice9Border: ph.slice9Border,
                imageFill: ph.imageFill,
                overlayTint: ph.overlayTint,
                width: ph.width,
                height: ph.height,
            });
        }
        else {
            const dbUrl = String(ph && ph.dbUrl || '');
            if (dbUrl)
                unresolvedUrls.add(dbUrl);
        }
    }
    if (unresolvedUrls.size > 0) {
        const sample = Array.from(unresolvedUrls).slice(0, 5).join(', ');
        console.warn(`[figma-importer] ${unresolvedUrls.size} 张资源始终未就绪，相关节点保留品红占位` +
            `${sample ? `：${sample}` : ''}`);
    }
    let replaced = 0;
    if (resolvedItems.length > 0) {
        const rep = await callScene('replaceImagePlaceholders', { items: resolvedItems });
        replaced = (rep && rep.data && rep.data.replaced) || 0;
    }
    const stillMissing = total - replaced;
    console.log(`[figma-importer] 占位替换完成：${replaced}/${total} 替换成功，${stillMissing} 仍缺图（保留品红）。`);
    return { total, replaced, stillMissing };
}
/**
 * @zh 导入完成弹窗：汇总节点数、图片加载与仍缺图数量，缺图提示手动补。
 */
async function showImportDoneDialog(result, placeholderReport) {
    try {
        const d = (result && result.data) || {};
        const sprites = Number(d.sprites) || 0;
        const stillMissing = (placeholderReport ? placeholderReport.stillMissing : 0) + (Number(d.missingImages) || 0);
        const lines = [];
        lines.push(`已加载图片：${sprites} 张`);
        if (placeholderReport && placeholderReport.replaced > 0) {
            lines.push(`延迟就绪后补齐：${placeholderReport.replaced} 张`);
        }
        if (stillMissing > 0) {
            lines.push(`仍缺图：${stillMissing} 张（已挂品红占位，请在编辑器中手动补图）`);
        }
        await Editor.Dialog.info('Figma 导入完成', {
            detail: lines.join('\n'),
            buttons: ['好的'],
            default: 0,
        });
    }
    catch (err) {
        // 弹窗失败不影响导入结果，仅记日志
        console.warn('[figma-importer] 导入完成弹窗失败（忽略）：', err);
    }
}
/**
 * @en Log missing-font demand as console warnings (no file, no dialog).
 * @zh 缺失字体只打 console.warn（对齐 Unity：纯日志，不写文件、不弹窗）。
 *     铁律：绝不写任何文件——写文件会触发 Cocos 工程刷新、打断刚建好的场景渲染（背景图曾因此消失）。
 */
function reportFontDemand(tracker) {
    const defaultFallbackCount = tracker.getDefaultFallbackCount();
    if (!tracker.hasMissing()) {
        if (defaultFallbackCount > 0) {
            console.log(`[figma-importer] 字体资源命中 ${tracker.getMatchedCount()} 处，` +
                `${defaultFallbackCount} 处按规则使用默认字体回退。`);
            for (const item of tracker.getDefaultFallback()) {
                console.log(`[figma-importer]   默认回退「${item.family}${item.weight ? ' ' + item.weight : ''}」× ${item.count} 处`);
            }
        }
        else {
            console.log(`[figma-importer] 字体全部命中（${tracker.getMatchedCount()} 处文本）。`);
        }
        return;
    }
    const missing = tracker.getMissing();
    console.warn(`[figma-importer] 字体需求：${tracker.getMatchedCount()} 处已命中，` +
        `${missing.length} 种字体缺失（已回退默认字体）` +
        `${defaultFallbackCount > 0 ? `，另有 ${defaultFallbackCount} 处按规则默认回退` : ''}。`);
    for (const m of missing) {
        console.warn(`[figma-importer]   缺失字体「${m.family}${m.weight ? ' ' + m.weight : ''}」× ${m.count} 处` +
            `（${m.reason ? `${m.reason}；` : ''}放入 assets/art/figma-fonts/ 并以字体名/字重命名即可命中）`);
    }
    for (const item of tracker.getDefaultFallback()) {
        console.log(`[figma-importer]   默认回退「${item.family}${item.weight ? ' ' + item.weight : ''}」× ${item.count} 处`);
    }
}
/**
 * @en Handle a JSON string pushed from the Figma plugin over HTTP.
 *     Normal pushes open the unified workbench; explicit automation may still bypass it.
 * @zh 处理 Figma 插件经 HTTP 推来的 JSON。普通推送先进入统一工作台，只有显式自动化参数才直接建树。
 */
async function handlePushedJson(json, name, options) {
    try {
        console.log(`[figma-importer] 收到推送「${name || '(未命名)'}」，${json.length} 字节`);
        const data = JSON.parse(json);
        if (options && options.skipConfirm) {
            console.log('[figma-importer] 本地自动化推送：跳过确认闸门。');
            await buildFromData(data);
            return;
        }
        const filePath = stagePushedJsonForWorkbench(json, name || data.name || 'pushed');
        await currentJsonPathCoordinator.write(filePath);
        const workbenchPanel = 'figma-importer.settings';
        const workbenchOptions = {
            jsonPath: filePath,
            section: 'preview',
            source: 'figma-push',
        };
        // Panel.open does not re-deliver arguments when this dockable panel is already open.
        // Open first, then use the panel message as the explicit, awaitable delivery contract.
        await Editor.Panel.open(workbenchPanel);
        if (!await Editor.Panel.has(workbenchPanel)) {
            throw new Error('FtoC 导入工作台未能打开');
        }
        const delivery = await Editor.Message.request('figma-importer', 'accept-pushed-json', workbenchOptions);
        if (!delivery || delivery.success === false) {
            throw new Error(delivery && delivery.error || 'FtoC 导入工作台未确认推送');
        }
        await Editor.Panel.focus(workbenchPanel);
        const activated = await (0, editor_activation_1.activateCocosEditorApplication)();
        if (process.platform === 'darwin' && !activated) {
            console.warn('[figma-importer] JSON 已送达工作台，但 macOS 前台激活失败。');
        }
        if (!await Editor.Panel.has(workbenchPanel)) {
            throw new Error('FtoC 导入工作台聚焦后意外关闭');
        }
        console.log(`[figma-importer] 推送已送达并聚焦导入工作台，等待预览确认：${filePath}`);
    }
    catch (err) {
        console.error('[figma-importer] 处理推送 JSON 失败:', err);
        // 埋点：推送导入失败（解析 JSON 等失败也算）。buildFromData 内部已报过的会被去重。
        (0, telemetry_1.trackImportFailed)('handlePushedJson', err);
    }
}
/**
 * @en Registration method for the main process of Extension.
 * @zh 为扩展的主进程的注册方法。
 */
exports.methods = {
    async openReplacePanelBeta(preset) {
        const exactWorkspacePath = !!preset && typeof preset === 'object';
        const requestedPath = (0, json_workspace_state_1.normalizeCurrentJsonPath)(preset && typeof preset === 'object' ? preset.jsonPath : preset);
        const jsonPath = exactWorkspacePath
            ? requestedPath
            : requestedPath || await (0, json_workspace_state_1.readCurrentJsonPath)();
        if (exactWorkspacePath || requestedPath)
            await (0, json_workspace_state_1.writeCurrentJsonPath)(jsonPath);
        return Editor.Panel.open('figma-importer.replace', { jsonPath });
    },
    openSettingsPanel(options) {
        return Editor.Panel.open('figma-importer.settings', options || {});
    },
    async clearCurrentJsonPath(expectedPath) {
        const result = await currentJsonPathCoordinator.clearIfCurrent(expectedPath);
        return { success: true, data: result };
    },
    async setCurrentJsonPath(filePath) {
        const currentPath = await currentJsonPathCoordinator.write(filePath);
        return { success: true, data: { currentPath } };
    },
    /** @zh 兼容旧入口：组件映射现在收进统一工作台，不再打开第二套用户流程。 */
    openComponentMappingPanel() {
        return Editor.Panel.open('figma-importer.settings', { section: 'mapping' });
    },
    /** @zh 面板：查询推送服务运行状态,供功能面板显示开关态。 */
    getPushServerStatus() {
        return { success: true, data: { running: (0, server_1.isPushServerRunning)() } };
    },
    /** @zh 面板：读通用资源目录列表（带默认回退）。 */
    async getCommonResourceDirs() {
        return { success: true, data: { dirs: await readCommonResourceDirs() } };
    },
    /** @zh 面板：读取场景组件身份、工程映射、最近导入身份和当前 Project Prefab。 */
    async getComponentMappings() {
        const document = readComponentMappingDocument();
        const resolved = await resolveComponentMappingAssets(document);
        const selected = await getSelectedPrefabAssetInfo();
        const sceneSelection = await getSelectedSceneComponentIdentity();
        return {
            success: true,
            data: {
                dbUrl: COMPONENT_MAPPING_DB_URL,
                document,
                resolved: {
                    valid: resolved.valid,
                    broken: resolved.broken,
                    entries: resolved.entries,
                },
                sceneSelection,
                components: lastComponentIdentities,
                selectedPrefab: selected && selected.uuid ? {
                    uuid: String(selected.uuid),
                    dbUrl: assetInfoUrl(selected),
                    name: String(selected.name || selected.displayName || selected.uuid),
                } : null,
            },
        };
    },
    /** @zh 面板：只读扫描 Figma JSON 的 componentKey/变体，不落图片、不建树、不保存场景。 */
    async scanComponentIdentitiesFromJson(presetPath) {
        try {
            let filePath = String(presetPath || '').trim();
            if (!filePath) {
                const picked = await Editor.Dialog.select({
                    title: '选择 Figma JSON 扫描组件映射',
                    type: 'file',
                    filters: [{ name: 'JSON', extensions: ['json'] }],
                });
                if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) {
                    return { success: false, canceled: true };
                }
                filePath = picked.filePaths[0];
            }
            const raw = JSON.parse((0, fs_1.readFileSync)(filePath, 'utf8'));
            if (!raw || !raw.root)
                return { success: false, error: 'Invalid Figma JSON: missing root' };
            lastComponentIdentities = (0, component_mapping_1.collectComponentIdentities)(raw.root);
            console.log(`[figma-importer] 组件映射扫描完成：${lastComponentIdentities.length} 个组件身份（未导入场景）。`);
            return {
                success: true,
                data: {
                    filePath,
                    name: String(raw.name || raw.root.name || ''),
                    count: lastComponentIdentities.length,
                    components: lastComponentIdentities,
                },
            };
        }
        catch (err) {
            console.error('[figma-importer] scanComponentIdentitiesFromJson failed:', err);
            return { success: false, error: err && err.message || String(err) };
        }
    },
    /** @zh 面板：绑定显式指定的 Prefab；未指定时兼容 Project 面板当前选中的 Prefab。 */
    async upsertComponentMapping(payload) {
        const componentKey = String(payload && payload.componentKey || '').trim();
        if (!componentKey)
            return { success: false, error: 'Missing componentKey' };
        const resolvedPrefab = await resolveComponentMappingPrefabAssetInfo(payload);
        const selected = resolvedPrefab.info;
        if (!selected || !selected.uuid) {
            if (resolvedPrefab.source === 'explicit') {
                return { success: false, error: '指定的资源不是有效的 Prefab，请重新选择' };
            }
            return { success: false, error: '请先在 Project 面板选中一个 Prefab 资源' };
        }
        const selectedPrefab = {
            uuid: String(selected.uuid),
            dbUrl: assetInfoUrl(selected),
            name: String(selected.name || selected.displayName || selected.uuid),
        };
        const saved = await mutateComponentMappingDocument((document) => (0, component_mapping_1.upsertMappingEntry)(document, {
            componentKey,
            componentName: String(payload && payload.componentName || '').trim(),
            prefabUuid: selectedPrefab.uuid,
            prefabUrl: selectedPrefab.dbUrl,
            variantFilter: String(payload && payload.variantFilter || '').trim(),
        }));
        console.log('[figma-importer] 组件映射已绑定：', {
            componentKey,
            variantFilter: String(payload && payload.variantFilter || '').trim(),
            prefab: selectedPrefab.dbUrl,
        });
        return {
            success: true,
            data: {
                document: saved,
                dbUrl: COMPONENT_MAPPING_DB_URL,
                selectedPrefab,
            },
        };
    },
    /** @zh 面板：仅移除指定 (componentKey, variantFilter) 条目。 */
    async removeComponentMapping(componentKey, variantFilter) {
        const key = String(componentKey || '').trim();
        if (!key)
            return { success: false, error: 'Missing componentKey' };
        const saved = await mutateComponentMappingDocument((document) => (0, component_mapping_1.removeMappingEntry)(document, key, String(variantFilter || '').trim()));
        console.log('[figma-importer] 组件映射已解绑：', { componentKey: key, variantFilter: String(variantFilter || '').trim() });
        return { success: true, data: { document: saved, dbUrl: COMPONENT_MAPPING_DB_URL } };
    },
    /** @zh 面板：写通用资源目录列表（只保留 db:// 且去重）。 */
    async setCommonResourceDirs(dirs) {
        const clean = [];
        for (const d of Array.isArray(dirs) ? dirs : []) {
            const url = String(d || '').trim().replace(/\/+$/, '');
            if (url.startsWith('db://') && clean.indexOf(url) === -1)
                clean.push(url);
        }
        await Editor.Profile.setConfig('figma-importer', COMMON_DIRS_KEY, clean);
        return { success: true, data: { dirs: clean } };
    },
    /** @zh 面板：弹目录选择框，把工程内目录转 db:// 追加进配置，返回新列表。 */
    async addCommonResourceDir() {
        try {
            const picked = await Editor.Dialog.select({
                title: '选择通用资源目录（工程内）',
                type: 'directory',
            });
            if (picked.canceled || !picked.filePaths || picked.filePaths.length === 0) {
                return { success: false, canceled: true };
            }
            const abs = picked.filePaths[0];
            let url = '';
            try {
                url = await (0, assetdb_1.requestAssetDb)('query-url', abs, [abs]);
            }
            catch (_a) {
                url = '';
            }
            if (!url) {
                // 兜底：绝对路径相对工程 assets 前缀相减（与 dbUrlToAssetPath 反向）。
                const projectPath = Editor.Project && Editor.Project.path;
                const norm = String(abs).replace(/\\/g, '/');
                const assetsRoot = projectPath ? `${String(projectPath).replace(/\\/g, '/')}/assets` : '';
                if (assetsRoot && norm.startsWith(assetsRoot)) {
                    url = 'db://assets' + norm.slice(assetsRoot.length);
                }
            }
            url = String(url || '').trim().replace(/\/+$/, '');
            if (!url.startsWith('db://assets')) {
                return { success: false, error: '所选目录不在工程 assets 内，无法作为资源目录。' };
            }
            const current = await readCommonResourceDirs();
            if (current.indexOf(url) === -1)
                current.push(url);
            await Editor.Profile.setConfig('figma-importer', COMMON_DIRS_KEY, current);
            return { success: true, data: { dirs: current, added: url } };
        }
        catch (err) {
            return { success: false, error: err && err.message || String(err) };
        }
    },
    /**
     * @en Menu handler: ask the scene script to create one empty node.
     * @zh 菜单处理器：请场景脚本建一个空节点。
     */
    async createTestNode() {
        try {
            const result = await callScene('createEmptyNode', 'FigmaTestNode');
            console.log('[figma-importer] createEmptyNode result:', result);
        }
        catch (err) {
            console.error('[figma-importer] createTestNode failed:', err);
        }
    },
    /**
     * @en Pick a Figma export JSON, read it, and build the node tree (stage 1: position/size only).
     * @zh 选一个 Figma 导出 JSON，读进来，建节点树（阶段 1：只摆位置和尺寸）。
     */
    async importFromJson(presetPath) {
        try {
            let filePath = presetPath;
            if (!filePath) {
                const picked = await Editor.Dialog.select({
                    title: '选择 Figma 导出的 JSON',
                    type: 'file',
                    filters: [{ name: 'JSON', extensions: ['json'] }],
                });
                if (picked.canceled || picked.filePaths.length === 0) {
                    return;
                }
                filePath = picked.filePaths[0];
            }
            if (!filePath) {
                return { success: false, error: 'No file path' };
            }
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            return await buildFromData(data);
        }
        catch (err) {
            console.error('[figma-importer] importFromJson failed:', err);
            // 埋点：菜单导入失败（读文件/解析 JSON 等 buildFromData 之前的失败也算导入失败）。
            // buildFromData 内部已上报过的 err 会被去重，不会重复计数。
            (0, telemetry_1.trackImportFailed)('importFromJson', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：从 Figma JSON 生成 Cocos 侧 TextStyles 样式库。
     *     对齐 Unity 字体导入器：优先使用 TextStyles/文字样式 根；找不到则从整棵界面抽取所有文字节点。
     */
    async generateTextStylesFromJsonBeta(presetPath) {
        try {
            let filePath = presetPath;
            if (!filePath) {
                const picked = await Editor.Dialog.select({
                    title: '选择用于生成 TextStyles 样式库的 Figma JSON',
                    type: 'file',
                    filters: [{ name: 'JSON', extensions: ['json'] }],
                });
                if (picked.canceled || picked.filePaths.length === 0) {
                    return { success: false, error: 'Canceled' };
                }
                filePath = picked.filePaths[0];
            }
            if (!filePath)
                return { success: false, error: 'No file path' };
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const generated = (0, textstylegen_1.generateTextStyleLibraryFromData)(data);
            if (generated.entries.length === 0) {
                console.warn('[figma-importer] 生成 TextStyles 样式库失败：JSON 中没有可用文字节点。');
                return { success: false, error: 'No text style entries' };
            }
            await ensureAssetFolder(textstylelib_1.TEXT_STYLE_LIB_DIR);
            // 对齐纲领：一个工程一套字体样式库，固定名 TextStyles（JSON 与美术手存的 prefab 同名才能配对）。
            const TEXT_STYLE_LIB_NAME = 'TextStyles';
            const dbUrl = `${textstylelib_1.TEXT_STYLE_LIB_DIR}/${TEXT_STYLE_LIB_NAME}.json`;
            const payload = {
                version: 1,
                generator: 'figma-importer',
                buildVersion: types_1.BUILD_VERSION,
                sourceName: generated.sourceName,
                styleRootName: generated.styleRootName,
                styleRootPath: generated.styleRootPath,
                stats: generated.stats,
                entries: generated.entries,
            };
            const info = await writeTextAssetViaImport(dbUrl, JSON.stringify(payload, null, 4));
            if (!info || !info.uuid) {
                console.warn('[figma-importer] TextStyles JSON 已写入，但 asset-db 未返回资源信息。', { dbUrl });
                return { success: false, error: 'TextStyles asset import did not return asset info', dbUrl };
            }
            const fontLib = await (0, fontlib_1.scanFontLibrary)();
            const library = await (0, textstylelib_1.scanTextStyleLibrary)(fontLib);
            console.log(`[figma-importer] 已生成 TextStyles 样式库索引（beta）：${dbUrl}`, {
                uuid: info.uuid,
                entries: generated.entries.length,
                mode: generated.stats.mode,
                styleRoot: generated.styleRootPath || '(整棵 JSON)',
                scannedEntries: library.entries.length,
            });
            // 环2：把真实 Label 模板树生成到场景，交给美术手动存 prefab。
            // Phase 1 已证明程序化创建 prefab 会丢组件属性，所以这里只建场景节点。
            const sceneResult = await callScene('buildTextStyleRoot', {
                entries: generated.entries,
                rootName: TEXT_STYLE_LIB_NAME,
            });
            if (sceneResult && sceneResult.success !== false) {
                await saveSceneAfterImport(sceneResult);
                const leafCount = sceneResult.data ? sceneResult.data.leafCount : 0;
                const rootName = sceneResult.data ? sceneResult.data.rootName : TEXT_STYLE_LIB_NAME;
                console.log(`%c[figma-importer] 已在场景生成「${rootName}」模板节点树（${leafCount} 个 Label 叶子）。`, 'color:#0a0;font-weight:bold');
                console.log(`[figma-importer] 下一步（美术）：在层级里给各 Label 手配字体/描边/投影至与 Figma 一致，` +
                    `然后把「${rootName}」节点拖进「${textstylelib_1.TEXT_STYLE_LIB_DIR}/」存成 ${rootName}.prefab。` +
                    `导入套用时会克隆这份 prefab 的模板节点。`);
            }
            else {
                console.warn('[figma-importer] 场景模板树生成失败（索引 JSON 已写入，可稍后重试生成场景节点）：', sceneResult);
            }
            return {
                success: true,
                dbUrl,
                uuid: String(info.uuid),
                entries: generated.entries.length,
                stats: generated.stats,
                sceneRoot: sceneResult && sceneResult.data ? sceneResult.data : undefined,
            };
        }
        catch (err) {
            console.error('[figma-importer] generateTextStylesFromJsonBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：用一份 Figma JSON 重建当前选中的 UI 根节点。
     *     这不是另一套渲染逻辑，而是复用正式导入 payload，在原父节点/原层级位置替换整棵子树。
     */
    async replaceSelectedFromJsonBeta(presetPath) {
        const targetUuid = getSelectedNodeUuid();
        if (!targetUuid) {
            console.warn('[figma-importer] 替换失败：请先在层级里选中要替换的 UI 根节点。');
            return { success: false, error: 'No selected target node' };
        }
        try {
            let filePath = presetPath;
            if (!filePath) {
                const picked = await Editor.Dialog.select({
                    title: '选择用于替换选中 UI 根的 Figma JSON',
                    type: 'file',
                    filters: [{ name: 'JSON', extensions: ['json'] }],
                });
                if (picked.canceled || picked.filePaths.length === 0) {
                    return { success: false, error: 'Canceled' };
                }
                filePath = picked.filePaths[0];
            }
            if (!filePath)
                return { success: false, error: 'No file path' };
            console.log(`%c[figma-importer] 开始替换选中 UI 根（beta） · 构建版本 = ${types_1.BUILD_VERSION}`, 'color:#0a0;font-weight:bold');
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            await ensureComponentStateRuntimeBestEffort();
            const preparedPayload = await prepareScenePayloadFromData(data);
            const result = await callScene('replaceTreeBeta', Object.assign(Object.assign({}, preparedPayload.payload), { targetUuid }));
            console.log('[figma-importer] replaceTreeBeta result:', result);
            if (result && result.success !== false) {
                lastImportedJsonForPull = JSON.stringify(data, null, 4);
                lastImportedNameForPull = data.name || preparedPayload.prepared.name || '';
                lastImportedRootUuid = result && result.data ? (result.data.rootUuid || '') : '';
                await finalizeComponentStateTargets(result);
                await resolvePreparedPlaceholders(result, preparedPayload.pendingSpriteFrames);
                await saveSceneAfterImport(result);
            }
            else {
                console.warn('[figma-importer] replaceTreeBeta 未成功，跳过自动保存。', result);
            }
            preparedPayload.textStyleTracker.report();
            preparedPayload.textStyleTemplateTracker.report(preparedPayload.textStyleLib);
            reportFontDemand(preparedPayload.fontTracker);
            return result;
        }
        catch (err) {
            console.error('[figma-importer] replaceSelectedFromJsonBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：从 JSON 中找到与当前选中 Cocos 节点最匹配的 Figma 节点，并只替换这棵子树。
     *     这是 Unity Loader/ResourceReplace 的无窗口核心能力：匹配节点后仍复用正式 buildTree。
     */
    async replaceSelectedMatchedNodeFromJsonBeta(presetPath, figmaPath) {
        const targetUuid = getSelectedNodeUuid();
        if (!targetUuid) {
            console.warn('[figma-importer] 局部替换失败：请先在层级里选中要替换的节点。');
            return { success: false, error: 'No selected target node' };
        }
        try {
            const targetResult = await callScene('describeNodeForReplaceBeta', { uuid: targetUuid });
            if (!targetResult || targetResult.success === false || !targetResult.data) {
                console.warn('[figma-importer] 局部替换失败：无法读取选中节点信息。', targetResult);
                return { success: false, error: targetResult && targetResult.error || 'describeNodeForReplaceBeta failed' };
            }
            const target = targetResult.data;
            let filePath = presetPath;
            if (!filePath) {
                const picked = await Editor.Dialog.select({
                    title: '选择用于局部替换的 Figma JSON',
                    type: 'file',
                    filters: [{ name: 'JSON', extensions: ['json'] }],
                });
                if (picked.canceled || picked.filePaths.length === 0) {
                    return { success: false, error: 'Canceled' };
                }
                filePath = picked.filePaths[0];
            }
            if (!filePath)
                return { success: false, error: 'No file path' };
            console.log(`%c[figma-importer] 开始局部替换选中节点（beta） · 构建版本 = ${types_1.BUILD_VERSION}`, 'color:#0a0;font-weight:bold');
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const matchPrepared = prepareImportData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(matchPrepared.root);
            const selected = selectBestFigmaNodeCandidate(candidates, target, figmaPath);
            if (!selected) {
                console.warn('[figma-importer] 局部替换失败：JSON 中找不到足够可信的匹配节点。', {
                    target,
                    figmaPath,
                    candidates: candidates.length,
                });
                return { success: false, error: 'No matching Figma node found' };
            }
            const matchedNode = cloneJson(selected.candidate.node);
            const subData = {
                version: data.version,
                name: matchedNode.name || data.name || 'FigmaNode',
                canvas: matchPrepared.canvas,
                root: matchedNode,
                images: cloneJson(data.images || {}),
                previewImageRef: data.previewImageRef,
            };
            await ensureComponentStateRuntimeBestEffort();
            const preparedPayload = await prepareScenePayloadFromData(subData);
            const result = await callScene('replaceTreeBeta', Object.assign(Object.assign({}, preparedPayload.payload), { targetUuid }));
            console.log('[figma-importer] replaceSelectedMatchedNodeFromJsonBeta result:', result);
            if (result && result.success !== false) {
                lastImportedJsonForPull = JSON.stringify(subData, null, 4);
                lastImportedNameForPull = matchedNode.name || data.name || '';
                lastImportedRootUuid = result && result.data ? (result.data.rootUuid || '') : '';
                await finalizeComponentStateTargets(result);
                await resolvePreparedPlaceholders(result, preparedPayload.pendingSpriteFrames);
                await saveSceneAfterImport(result);
            }
            else {
                console.warn('[figma-importer] 局部 replaceTreeBeta 未成功，跳过自动保存。', result);
            }
            preparedPayload.textStyleTracker.report();
            preparedPayload.textStyleTemplateTracker.report(preparedPayload.textStyleLib);
            reportFontDemand(preparedPayload.fontTracker);
            console.log('[figma-importer] 局部替换匹配详情：', {
                target: target.scenePath || target.name,
                figmaPath: selected.candidate.path,
                score: selected.score,
                reason: selected.reason,
                nodes: result && result.data && result.data.count,
            });
            return Object.assign(Object.assign({}, result), { match: {
                    target: target.scenePath || target.name,
                    figmaPath: selected.candidate.path,
                    score: selected.score,
                    reason: selected.reason,
                } });
        }
        catch (err) {
            console.error('[figma-importer] replaceSelectedMatchedNodeFromJsonBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：扫描 JSON 源资源与选中实例树的可替换目标，输出自动匹配候选。
     *     这是 Unity ResourceReplaceWindow 的无窗口数据层：左侧源图/字、右侧目标组件、名称/路径/尺寸/内容评分。
     */
    async scanJsonReplaceCandidatesBeta(presetPath, kind = 'all', rootUuidArg) {
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于扫描替换候选的 Figma JSON');
            if (!filePath)
                return { success: false, error: 'Canceled' };
            const rootUuid = rootUuidArg || getSelectedNodeUuid() || lastImportedRootUuid;
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const prepared = prepareImportData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(prepared.root);
            const sourceTexts = candidates
                .filter((item) => item.type === 'TEXT')
                .map(summarizeFigmaCandidate);
            const sourceImagesByRef = {};
            for (const item of candidates.filter((candidate) => candidate.hasImage && candidate.type !== 'TEXT')) {
                const key = item.imageRef || item.path;
                if (!sourceImagesByRef[key]) {
                    sourceImagesByRef[key] = Object.assign(Object.assign({}, summarizeFigmaCandidate(item)), { occurrences: 0, allRects: [] });
                }
                sourceImagesByRef[key].occurrences++;
                sourceImagesByRef[key].allRects.push({
                    path: item.path,
                    x: item.canvasX,
                    y: item.canvasY,
                    width: item.width,
                    height: item.height,
                });
            }
            const targetResult = await callScene('listReplaceTargetsBeta', {
                rootUuid,
                kind,
            });
            if (!targetResult || targetResult.success === false || !targetResult.data) {
                console.warn('[figma-importer] 扫描替换候选失败：无法读取目标实例树。', targetResult);
                return { success: false, error: targetResult && targetResult.error || 'listReplaceTargetsBeta failed' };
            }
            const targets = (targetResult.data.targets || []);
            const matches = targets.map((target) => {
                const top = listBestFigmaNodeCandidates(candidates, target, 5);
                const best = top[0] || null;
                return {
                    target,
                    best: best ? {
                        score: best.score,
                        reason: best.reason,
                        source: summarizeFigmaCandidate(best.candidate),
                    } : null,
                    candidates: top.map((item) => ({
                        score: item.score,
                        reason: item.reason,
                        source: summarizeFigmaCandidate(item.candidate),
                    })),
                };
            });
            const ambiguousMatches = matches
                .filter((item) => item.best && item.candidates.length > 1 &&
                Math.abs(item.best.score - item.candidates[1].score) < 80)
                .map((item) => ({
                target: item.target.relativePath || item.target.scenePath || item.target.name,
                kind: item.target.replaceKind,
                best: item.best,
                runnerUp: item.candidates[1],
                delta: item.best ? item.best.score - item.candidates[1].score : 0,
            }));
            const assignmentsBySource = {};
            for (const item of matches) {
                if (!item.best || item.best.score < 300)
                    continue;
                const path = item.best.source.path;
                if (!assignmentsBySource[path])
                    assignmentsBySource[path] = [];
                assignmentsBySource[path].push({
                    target: item.target.relativePath || item.target.scenePath || item.target.name,
                    kind: item.target.replaceKind,
                    score: item.best.score,
                });
            }
            const duplicateSourceAssignments = Object.keys(assignmentsBySource)
                .filter((path) => assignmentsBySource[path].length > 1)
                .map((path) => ({
                source: path,
                count: assignmentsBySource[path].length,
                targets: assignmentsBySource[path],
            }));
            const confident = matches.filter((item) => item.best && item.best.score >= 300).length;
            const weak = matches.filter((item) => item.best && item.best.score > 0 && item.best.score < 300).length;
            const missing = matches.filter((item) => !item.best).length;
            const result = {
                success: true,
                data: {
                    filePath,
                    name: prepared.name,
                    canvas: prepared.canvas,
                    root: targetResult.data.rootName,
                    rootUuid: targetResult.data.rootUuid,
                    kind,
                    sourceStats: {
                        nodes: candidates.length,
                        texts: sourceTexts.length,
                        images: Object.keys(sourceImagesByRef).length,
                    },
                    targetStats: targetResult.data.stats,
                    matchStats: {
                        targets: matches.length,
                        confident,
                        weak,
                        missing,
                        ambiguous: ambiguousMatches.length,
                        duplicateSourceAssignments: duplicateSourceAssignments.length,
                    },
                    sourceTexts,
                    sourceImages: Object.values(sourceImagesByRef),
                    ambiguousMatches,
                    duplicateSourceAssignments,
                    matches,
                },
            };
            console.log('[figma-importer] 替换候选扫描完成（beta）：', {
                source: result.data.sourceStats,
                target: result.data.targetStats,
                match: result.data.matchStats,
                top: matches.slice(0, 8).map((item) => ({
                    target: item.target.relativePath || item.target.scenePath,
                    kind: item.target.replaceKind,
                    score: item.best && item.best.score,
                    source: item.best && item.best.source.path,
                    reason: item.best && item.best.reason,
                })),
            });
            return result;
        }
        catch (err) {
            console.error('[figma-importer] scanJsonReplaceCandidatesBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：加载 Figma JSON 的整帧预览图与命中框数据（只读，不落盘）。
     *     对齐 Unity LoaderWindow 的预览数据层：优先使用导出自带 previewImageRef/previewImageBase64。
     */
    async loadJsonPreviewBeta(presetPath, includeImage = true, includeSources = true) {
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于预览的 Figma JSON');
            if (!filePath)
                return { success: false, error: 'Canceled' };
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const prepared = prepareLoaderPreviewData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(prepared.root);
            const preview = resolvePreviewImageBase64(data);
            const sourceImagesByRef = {};
            const sourceTexts = [];
            if (includeSources) {
                for (const candidate of candidates) {
                    if (candidate.type === 'TEXT') {
                        sourceTexts.push({
                            path: candidate.path,
                            name: candidate.name,
                            kind: candidate.replaceKind,
                            x: candidate.canvasX,
                            y: candidate.canvasY,
                            width: candidate.width,
                            height: candidate.height,
                            text: candidate.characters || '',
                        });
                    }
                    else if (candidate.hasImage && candidate.imageRef) {
                        const ref = candidate.imageRef;
                        if (!sourceImagesByRef[ref]) {
                            const base64 = data.images && data.images[ref] || '';
                            sourceImagesByRef[ref] = {
                                path: candidate.path,
                                name: candidate.name,
                                kind: candidate.replaceKind,
                                imageRef: ref,
                                width: candidate.width,
                                height: candidate.height,
                                occurrences: 0,
                                dataUrl: base64 ? `data:${previewMimeFromBase64(base64)};base64,${base64}` : '',
                                allRects: [],
                            };
                        }
                        sourceImagesByRef[ref].occurrences++;
                        sourceImagesByRef[ref].allRects.push({
                            path: candidate.path,
                            x: candidate.canvasX,
                            y: candidate.canvasY,
                            width: candidate.width,
                            height: candidate.height,
                        });
                    }
                }
            }
            const hits = candidates.map((candidate) => ({
                path: candidate.path,
                name: candidate.name,
                kind: candidate.replaceKind,
                type: candidate.type,
                x: candidate.canvasX,
                y: candidate.canvasY,
                width: candidate.width,
                height: candidate.height,
                imageRef: candidate.imageRef,
                text: candidate.characters ? candidate.characters.slice(0, 120) : '',
                componentKey: String(candidate.node.componentKey || ''),
                componentName: String(candidate.node.name || ''),
                variantFilter: (0, component_mapping_1.buildVariantFilter)(candidate.node.componentProperties),
                componentProperties: (0, component_mapping_1.normalizeComponentProperties)(candidate.node.componentProperties),
            }));
            const result = {
                success: true,
                data: {
                    filePath,
                    name: prepared.name,
                    canvas: prepared.canvas,
                    previewImageRef: preview.ref,
                    previewImageDataUrl: includeImage && preview.base64
                        ? `data:${previewMimeFromBase64(preview.base64)};base64,${preview.base64}`
                        : '',
                    stats: {
                        hits: hits.length,
                        texts: hits.filter((item) => item.kind === 'text').length,
                        images: hits.filter((item) => item.kind === 'image').length,
                        hasPreviewImage: !!preview.base64,
                        sourceTexts: sourceTexts.length,
                        sourceImages: Object.keys(sourceImagesByRef).length,
                        interfaceCount: prepared.interfaceCount,
                    },
                    sourceImages: Object.values(sourceImagesByRef),
                    sourceTexts,
                    hits,
                },
            };
            console.log('[figma-importer] 已加载 JSON 预览数据（beta）：', {
                filePath,
                name: result.data.name,
                canvas: result.data.canvas,
                previewImageRef: result.data.previewImageRef,
                stats: result.data.stats,
                includeImage,
                includeSources,
            });
            return result;
        }
        catch (err) {
            console.error('[figma-importer] loadJsonPreviewBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：贴图预览/缺失扫描。对齐 Unity TexturePreviewWindow：
     *     按唯一 Figma 图片内容扫描项目资源，区分正式资源命中、仅 Figma 导入目录命中、完全缺失。
     */
    async scanJsonTexturesBeta(presetPath, includeImage = true, onlyMissing = false) {
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于贴图预览的 Figma JSON');
            if (!filePath)
                return { success: false, error: 'Canceled' };
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const prepared = prepareLoaderPreviewData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(prepared.root)
                .filter((candidate) => candidate.hasImage && candidate.imageRef);
            const projectIndex = await (0, assets_1.scanProjectTextureIndex)(await readCommonResourceDirs());
            const byRef = {};
            for (const candidate of candidates) {
                const imageRef = candidate.imageRef;
                if (!imageRef)
                    continue;
                const base64 = data.images && data.images[imageRef] || '';
                if (!base64)
                    continue;
                if (!byRef[imageRef]) {
                    const hashed = (0, assets_1.hashImageBase64)(base64);
                    const matches = hashed ? (projectIndex.byHash[hashed.hash] || []) : [];
                    const best = (0, assets_1.pickAnyTextureMatch)(matches);
                    const status = textureStatusFromMatches(matches);
                    byRef[imageRef] = {
                        imageRef,
                        name: candidate.name,
                        imageName: candidate.node && candidate.node.imageName || '',
                        path: candidate.path,
                        width: hashed && hashed.width || candidate.width,
                        height: hashed && hashed.height || candidate.height,
                        nodeWidth: candidate.width,
                        nodeHeight: candidate.height,
                        hash: hashed && hashed.hash || '',
                        rawHash: hashed && hashed.rawHash || '',
                        status,
                        found: status !== 'missing',
                        projectFound: status === 'project',
                        figmaImportFound: status === 'figma-import',
                        assetPath: best ? best.dbUrl : '',
                        assetUuid: best ? best.uuid : '',
                        matchCount: matches.length,
                        projectMatchCount: matches.filter((item) => item.source === 'project').length,
                        figmaImportMatchCount: matches.filter((item) => item.source === 'figma-import').length,
                        dataUrl: includeImage ? `data:${previewMimeFromBase64(base64)};base64,${base64}` : '',
                        occurrences: 0,
                        allRects: [],
                    };
                }
                byRef[imageRef].occurrences++;
                byRef[imageRef].allRects.push({
                    path: candidate.path,
                    name: candidate.name,
                    width: candidate.width,
                    height: candidate.height,
                    canvasX: candidate.canvasX,
                    canvasY: candidate.canvasY,
                });
            }
            let entries = Object.values(byRef);
            entries.sort((a, b) => {
                const rank = (item) => item.status === 'missing' ? 0 : (item.status === 'figma-import' ? 1 : 2);
                const ar = rank(a);
                const br = rank(b);
                if (ar !== br)
                    return ar - br;
                return String(a.name || a.imageRef).localeCompare(String(b.name || b.imageRef));
            });
            const stats = {
                unique: entries.length,
                projectFound: entries.filter((item) => item.status === 'project').length,
                figmaImportFound: entries.filter((item) => item.status === 'figma-import').length,
                missing: entries.filter((item) => item.status === 'missing').length,
                projectAssetsScanned: projectIndex.total,
                projectAssetsHashed: projectIndex.hashed,
                projectAssetsSkipped: projectIndex.skipped,
                interfaceCount: prepared.interfaceCount,
            };
            if (onlyMissing)
                entries = entries.filter((item) => item.status === 'missing' || item.status === 'figma-import');
            console.log('[figma-importer] 贴图预览扫描完成（beta）：', {
                filePath,
                name: prepared.name,
                stats,
                shown: entries.length,
            });
            return {
                success: true,
                data: {
                    filePath,
                    name: prepared.name,
                    canvas: prepared.canvas,
                    stats,
                    entries,
                },
            };
        }
        catch (err) {
            console.error('[figma-importer] scanJsonTexturesBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：提前导入贴图预览里缺失的 Figma 图片。复用正式 landImages 链路，避免另起资产导入规则。
     */
    async importMissingTexturesBeta(presetPath, includeFigmaImportFound = false) {
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于提前导入缺失贴图的 Figma JSON');
            if (!filePath)
                return { success: false, error: 'Canceled' };
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const prepared = prepareLoaderPreviewData(cloneJson(data));
            const scan = await exports.methods.scanJsonTexturesBeta(filePath, false, false);
            if (!scan || scan.success === false || !scan.data) {
                return { success: false, error: scan && scan.error || 'scanJsonTexturesBeta failed' };
            }
            const entries = (scan.data.entries || []).filter((entry) => entry && (entry.status === 'missing' || (includeFigmaImportFound && entry.status === 'figma-import')));
            const imagesToLand = {};
            for (const entry of entries) {
                const ref = String(entry.imageRef || '');
                if (ref && data.images && data.images[ref])
                    imagesToLand[ref] = data.images[ref];
            }
            if (Object.keys(imagesToLand).length === 0) {
                return {
                    success: true,
                    data: {
                        filePath,
                        imported: 0,
                        message: 'No missing textures',
                    },
                };
            }
            const imageDims = buildImageDimensionMap(data.images);
            const spriteFrameBorders = Object.assign(Object.assign({}, collectImplicitSpriteFrameBorders(prepared.root, imageDims).borders), collectSpriteFrameBorders(prepared.root));
            const landed = await (0, assets_1.landImages)(imagesToLand, prepared.name || data.name || 'untitled', spriteFrameBorders, await readCommonResourceDirs());
            console.log('[figma-importer] 已提前导入缺失贴图（beta）：', {
                filePath,
                requested: Object.keys(imagesToLand).length,
                landed: Object.keys(landed.idToSpriteFrame).length,
                includeFigmaImportFound,
            });
            return {
                success: true,
                data: {
                    filePath,
                    name: prepared.name,
                    requested: Object.keys(imagesToLand).length,
                    landed: Object.keys(landed.idToSpriteFrame).length,
                    idToSpriteFrame: landed.idToSpriteFrame,
                },
            };
        }
        catch (err) {
            console.error('[figma-importer] importMissingTexturesBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：把 JSON 中匹配到的单个 Figma 节点应用到当前选中 Cocos 节点。
     *     对齐 Unity FigmaNodeReplacer.Apply：可分开应用图片、文字、位置；不重命名、不递归替换子节点。
     */
    async applyMatchedNodeToSelectedBeta(presetPath, figmaPath, flags) {
        const targetUuid = getSelectedNodeUuid();
        if (!targetUuid) {
            console.warn('[figma-importer] 应用匹配节点失败：请先在层级里选中要修补的节点。');
            return { success: false, error: 'No selected target node' };
        }
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于应用到选中节点的 Figma JSON');
            if (!filePath)
                return { success: false, error: 'Canceled' };
            const targetResult = await callScene('describeNodeForReplaceBeta', { uuid: targetUuid });
            if (!targetResult || targetResult.success === false || !targetResult.data) {
                return { success: false, error: targetResult && targetResult.error || 'describeNodeForReplaceBeta failed' };
            }
            const target = targetResult.data;
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const preparedForMatch = prepareImportData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(preparedForMatch.root);
            const selected = pickFigmaCandidateForApply(candidates, target, figmaPath);
            if (!selected) {
                console.warn('[figma-importer] 应用匹配节点失败：找不到可信 Figma 候选。', {
                    target: target.scenePath || target.name,
                    figmaPath,
                    candidates: candidates.length,
                });
                return { success: false, error: 'No matching Figma node found' };
            }
            const matchedNode = cloneJson(selected.candidate.node);
            matchedNode.x = selected.candidate.canvasX;
            matchedNode.y = selected.candidate.canvasY;
            const subData = {
                version: data.version,
                name: matchedNode.name || data.name || 'FigmaNode',
                canvas: preparedForMatch.canvas,
                root: matchedNode,
                images: cloneJson(data.images || {}),
                previewImageRef: data.previewImageRef,
            };
            const preparedPayload = await prepareScenePayloadFromData(subData);
            const result = await callScene('applyNodePatchBeta', {
                targetUuid,
                node: preparedPayload.payload.root,
                canvas: preparedPayload.payload.canvas,
                idToSpriteFrame: preparedPayload.payload.idToSpriteFrame,
                flags: resolveReplaceApplyFlags(flags),
            });
            if (result && result.success !== false) {
                await saveSceneAfterImport(result);
            }
            else {
                console.warn('[figma-importer] applyNodePatchBeta 未成功，跳过自动保存。', result);
            }
            preparedPayload.textStyleTracker.report();
            preparedPayload.textStyleTemplateTracker.report(preparedPayload.textStyleLib);
            reportFontDemand(preparedPayload.fontTracker);
            console.log('[figma-importer] 已应用匹配节点到选中节点（beta）：', {
                target: target.scenePath || target.name,
                figmaPath: selected.candidate.path,
                score: selected.score,
                reason: selected.reason,
                flags: resolveReplaceApplyFlags(flags),
            });
            return Object.assign(Object.assign({}, result), { match: {
                    target: target.scenePath || target.name,
                    figmaPath: selected.candidate.path,
                    score: selected.score,
                    reason: selected.reason,
                } });
        }
        catch (err) {
            console.error('[figma-importer] applyMatchedNodeToSelectedBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：捕获指定替换目标的原始状态，供 ResourceReplace 单行还原使用。
     */
    async snapshotReplaceTargetBeta(targetUuid) {
        if (!targetUuid) {
            console.warn('[figma-importer] 目标快照失败：缺少 targetUuid。');
            return { success: false, error: 'Missing targetUuid' };
        }
        try {
            const result = await callScene('snapshotReplaceTargetBeta', { uuid: targetUuid });
            if (!result || result.success === false) {
                return { success: false, error: result && result.error || 'snapshotReplaceTargetBeta failed' };
            }
            return result;
        }
        catch (err) {
            console.error('[figma-importer] snapshotReplaceTargetBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：把单行替换目标恢复到此前捕获的 snapshot，并自动保存刷新场景。
     */
    async restoreReplaceTargetBeta(snapshotOrPayload) {
        const snapshot = snapshotOrPayload && (snapshotOrPayload.snapshot || snapshotOrPayload);
        const shouldSave = !snapshotOrPayload || snapshotOrPayload.save !== false;
        if (!snapshot || !snapshot.uuid) {
            console.warn('[figma-importer] 目标还原失败：缺少 snapshot。');
            return { success: false, error: 'Missing snapshot' };
        }
        try {
            const result = await callScene('restoreReplaceTargetBeta', { snapshot });
            if (result && result.success !== false && shouldSave) {
                await saveSceneAfterImport(result);
            }
            else if (!result || result.success === false) {
                console.warn('[figma-importer] restoreReplaceTargetBeta 未成功，跳过自动保存。', result);
            }
            return result;
        }
        catch (err) {
            console.error('[figma-importer] restoreReplaceTargetBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：在 Hierarchy 中定位并选中指定替换目标。
     */
    async selectReplaceTargetBeta(targetUuid) {
        if (!targetUuid) {
            console.warn('[figma-importer] 定位替换目标失败：缺少 targetUuid。');
            return { success: false, error: 'Missing targetUuid' };
        }
        try {
            const result = await callScene('selectReplaceTargetBeta', { uuid: targetUuid });
            if (!result || result.success === false) {
                return { success: false, error: result && result.error || 'selectReplaceTargetBeta failed' };
            }
            return result;
        }
        catch (err) {
            console.error('[figma-importer] selectReplaceTargetBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：面板逐行应用。按 targetUuid 指定 Cocos 目标，按 figmaPath/自动匹配指定源节点。
     *     与 applyMatchedNodeToSelectedBeta 同一条 scene applyNodePatchBeta 链路，但不依赖当前选中。
     */
    async applyJsonNodeToTargetBeta(presetPath, targetUuid, figmaPath, flags) {
        if (!targetUuid) {
            console.warn('[figma-importer] 逐行应用失败：缺少 targetUuid。');
            return { success: false, error: 'Missing targetUuid' };
        }
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于应用到目标节点的 Figma JSON');
            if (!filePath)
                return { success: false, error: 'Canceled' };
            const targetResult = await callScene('describeNodeForReplaceBeta', { uuid: targetUuid });
            if (!targetResult || targetResult.success === false || !targetResult.data) {
                return { success: false, error: targetResult && targetResult.error || 'describeNodeForReplaceBeta failed' };
            }
            const target = targetResult.data;
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const preparedForMatch = prepareImportData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(preparedForMatch.root);
            const selected = pickFigmaCandidateForApply(candidates, target, figmaPath);
            if (!selected) {
                console.warn('[figma-importer] 逐行应用失败：找不到可信 Figma 候选。', {
                    target: target.scenePath || target.name,
                    targetUuid,
                    figmaPath,
                    candidates: candidates.length,
                });
                return { success: false, error: 'No matching Figma node found' };
            }
            const matchedNode = cloneJson(selected.candidate.node);
            matchedNode.x = selected.candidate.canvasX;
            matchedNode.y = selected.candidate.canvasY;
            const subData = {
                version: data.version,
                name: matchedNode.name || data.name || 'FigmaNode',
                canvas: preparedForMatch.canvas,
                root: matchedNode,
                images: cloneJson(data.images || {}),
                previewImageRef: data.previewImageRef,
            };
            const preparedPayload = await prepareScenePayloadFromData(subData);
            const result = await callScene('applyNodePatchBeta', {
                targetUuid,
                node: preparedPayload.payload.root,
                canvas: preparedPayload.payload.canvas,
                idToSpriteFrame: preparedPayload.payload.idToSpriteFrame,
                flags: resolveReplaceApplyFlags(flags),
            });
            if (result && result.success !== false) {
                await saveSceneAfterImport(result);
            }
            else {
                console.warn('[figma-importer] 逐行 applyNodePatchBeta 未成功，跳过自动保存。', result);
            }
            preparedPayload.textStyleTracker.report();
            preparedPayload.textStyleTemplateTracker.report(preparedPayload.textStyleLib);
            reportFontDemand(preparedPayload.fontTracker);
            console.log('[figma-importer] 已逐行应用 JSON 节点到目标（beta）：', {
                target: target.scenePath || target.name,
                targetUuid,
                figmaPath: selected.candidate.path,
                score: selected.score,
                reason: selected.reason,
                flags: resolveReplaceApplyFlags(flags),
            });
            return Object.assign(Object.assign({}, result), { match: {
                    target: target.scenePath || target.name,
                    targetUuid,
                    figmaPath: selected.candidate.path,
                    score: selected.score,
                    reason: selected.reason,
                } });
        }
        catch (err) {
            console.error('[figma-importer] applyJsonNodeToTargetBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：把 JSON 中自动匹配到的多个 Figma 节点批量应用到选中/最近导入根下的目标组件。
     *     对齐 Unity ResourceReplaceWindow 的“按行勾选后批量应用”核心能力；默认只应用可信匹配。
     */
    async applyMatchedNodesToSelectedRootBeta(presetPath, options) {
        try {
            const resolved = resolveBatchApplyOptions(options);
            const rootUuid = resolved.rootUuid || getSelectedNodeUuid() || lastImportedRootUuid;
            if (!rootUuid) {
                console.warn('[figma-importer] 批量应用失败：请先选中要作为目标的 UI 根节点。');
                return { success: false, error: 'No selected target root' };
            }
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于批量应用的 Figma JSON');
            if (!filePath)
                return { success: false, error: 'Canceled' };
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const preparedForMatch = prepareImportData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(preparedForMatch.root);
            const targetResult = await callScene('listReplaceTargetsBeta', {
                rootUuid,
                kind: resolved.kind,
            });
            if (!targetResult || targetResult.success === false || !targetResult.data) {
                console.warn('[figma-importer] 批量应用失败：无法读取目标实例树。', targetResult);
                return { success: false, error: targetResult && targetResult.error || 'listReplaceTargetsBeta failed' };
            }
            const targets = (targetResult.data.targets || [])
                .slice(0, resolved.limit > 0 ? resolved.limit : undefined);
            const planned = [];
            const skipped = [];
            for (const target of targets) {
                const selected = pickFigmaCandidateForApply(candidates, target);
                if (!selected) {
                    skipped.push({
                        target: target.relativePath || target.scenePath || target.name,
                        kind: target.replaceKind,
                        reason: 'no-match',
                    });
                    continue;
                }
                if (selected.score < resolved.minScore) {
                    skipped.push({
                        target: target.relativePath || target.scenePath || target.name,
                        kind: target.replaceKind,
                        score: selected.score,
                        source: selected.candidate.path,
                        reason: 'weak-match',
                    });
                    continue;
                }
                planned.push({ target, selected });
            }
            if (resolved.dryRun) {
                const summary = {
                    success: true,
                    dryRun: true,
                    filePath,
                    rootUuid: targetResult.data.rootUuid,
                    rootName: targetResult.data.rootName,
                    kind: resolved.kind,
                    minScore: resolved.minScore,
                    flags: resolved.flags,
                    targets: targets.length,
                    planned: planned.length,
                    skipped: skipped.length,
                    plan: planned.map((item) => ({
                        target: item.target.relativePath || item.target.scenePath || item.target.name,
                        kind: item.target.replaceKind,
                        score: item.selected.score,
                        reason: item.selected.reason,
                        source: summarizeFigmaCandidate(item.selected.candidate),
                    })),
                    skippedDetails: skipped,
                };
                console.log('[figma-importer] 批量应用 dryRun（beta）：', summary);
                return summary;
            }
            if (planned.length === 0) {
                console.warn('[figma-importer] 批量应用没有找到可应用的可信匹配。', {
                    targets: targets.length,
                    skipped: skipped.length,
                    minScore: resolved.minScore,
                });
                return {
                    success: false,
                    error: 'No confident matches',
                    rootUuid,
                    targets: targets.length,
                    skipped,
                };
            }
            const preparedPayload = await prepareScenePayloadFromData(cloneJson(data));
            const slimByPath = collectSlimNodesByFigmaPath(preparedPayload.payload.root);
            const applied = [];
            const failed = [];
            for (const item of planned) {
                const patchNode = makePatchNodeForCandidate(slimByPath, item.selected);
                const result = await callScene('applyNodePatchBeta', {
                    targetUuid: item.target.uuid,
                    node: patchNode,
                    canvas: preparedPayload.payload.canvas,
                    idToSpriteFrame: preparedPayload.payload.idToSpriteFrame,
                    flags: resolved.flags,
                });
                const detail = {
                    target: item.target.relativePath || item.target.scenePath || item.target.name,
                    targetUuid: item.target.uuid,
                    kind: item.target.replaceKind,
                    score: item.selected.score,
                    reason: item.selected.reason,
                    source: item.selected.candidate.path,
                    result: result && result.data ? result.data : result,
                };
                if (result && result.success !== false) {
                    applied.push(detail);
                }
                else {
                    failed.push(Object.assign(Object.assign({}, detail), { error: result && result.error || 'applyNodePatchBeta failed' }));
                }
            }
            if (applied.length > 0) {
                await saveSceneAfterImport({
                    data: {
                        rootUuid: targetResult.data.rootUuid || rootUuid,
                        rootName: targetResult.data.rootName,
                        batchApplied: applied.length,
                        batchFailed: failed.length,
                        batchSkipped: skipped.length,
                    },
                });
            }
            preparedPayload.textStyleTracker.report();
            preparedPayload.textStyleTemplateTracker.report(preparedPayload.textStyleLib);
            reportFontDemand(preparedPayload.fontTracker);
            const summary = {
                success: applied.length > 0 && failed.length === 0,
                filePath,
                rootUuid: targetResult.data.rootUuid || rootUuid,
                rootName: targetResult.data.rootName,
                kind: resolved.kind,
                minScore: resolved.minScore,
                flags: resolved.flags,
                targetStats: targetResult.data.stats,
                targets: targets.length,
                planned: planned.length,
                applied: applied.length,
                failed: failed.length,
                skipped: skipped.length,
                appliedDetails: applied,
                failedDetails: failed,
                skippedDetails: skipped,
            };
            console.log('[figma-importer] 批量应用 JSON 自动匹配完成（beta）：', {
                root: summary.rootName,
                targetStats: summary.targetStats,
                targets: summary.targets,
                planned: summary.planned,
                applied: summary.applied,
                failed: summary.failed,
                skipped: summary.skipped,
                top: applied.slice(0, 8).map((item) => ({
                    target: item.target,
                    kind: item.kind,
                    score: item.score,
                    source: item.source,
                })),
            });
            return summary;
        }
        catch (err) {
            console.error('[figma-importer] applyMatchedNodesToSelectedRootBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @zh beta：从 JSON 中找到匹配的 Figma 节点，并把完整子树挂到当前选中节点下。
     *     对齐 Unity FigmaNodeReplacer.AttachAsChild：递归创建子树，不覆盖父节点。
     */
    async attachMatchedNodeAsChildBeta(presetPath, figmaPath, options) {
        const parentUuid = options && options.parentUuid || getSelectedNodeUuid();
        if (!parentUuid) {
            console.warn('[figma-importer] 挂载匹配节点失败：请先在层级里选中父节点。');
            return { success: false, error: 'No selected parent node' };
        }
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于挂载子节点的 Figma JSON');
            if (!filePath)
                return { success: false, error: 'Canceled' };
            const parentResult = await callScene('describeNodeForReplaceBeta', { uuid: parentUuid });
            if (!parentResult || parentResult.success === false || !parentResult.data) {
                return { success: false, error: parentResult && parentResult.error || 'describeNodeForReplaceBeta failed' };
            }
            const parentTarget = parentResult.data;
            const raw = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const data = JSON.parse(raw);
            const preparedForMatch = prepareImportData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(preparedForMatch.root);
            let selected = selectBestFigmaNodeCandidate(candidates, parentTarget, figmaPath);
            if (!selected && !figmaPath) {
                const top = listBestFigmaNodeCandidates(candidates, parentTarget, 1)[0];
                if (top && top.score >= 220)
                    selected = top;
            }
            if (!selected) {
                console.warn('[figma-importer] 挂载匹配节点失败：找不到 Figma 候选。', {
                    parent: parentTarget.scenePath || parentTarget.name,
                    figmaPath,
                    candidates: candidates.length,
                });
                return { success: false, error: 'No matching Figma node found' };
            }
            const matchedNode = cloneJson(selected.candidate.node);
            const subData = {
                version: data.version,
                name: matchedNode.name || data.name || 'FigmaNode',
                canvas: preparedForMatch.canvas,
                root: matchedNode,
                images: cloneJson(data.images || {}),
                previewImageRef: data.previewImageRef,
            };
            await ensureComponentStateRuntimeBestEffort();
            const preparedPayload = await prepareScenePayloadFromData(subData);
            const result = await callScene('buildTree', Object.assign(Object.assign({}, preparedPayload.payload), { parentUuid, siblingIndex: options && typeof options.siblingIndex === 'number' ? options.siblingIndex : -1, rootCanvasAbsolute: {
                    x: selected.candidate.canvasX,
                    y: selected.candidate.canvasY,
                } }));
            console.log('[figma-importer] attachMatchedNodeAsChildBeta result:', result);
            if (result && result.success !== false) {
                lastImportedJsonForPull = JSON.stringify(subData, null, 4);
                lastImportedNameForPull = matchedNode.name || data.name || '';
                lastImportedRootUuid = result && result.data ? (result.data.rootUuid || '') : '';
                await finalizeComponentStateTargets(result);
                await resolvePreparedPlaceholders(result, preparedPayload.pendingSpriteFrames);
                await saveSceneAfterImport(result);
            }
            else {
                console.warn('[figma-importer] 挂载 buildTree 未成功，跳过自动保存。', result);
            }
            preparedPayload.textStyleTracker.report();
            preparedPayload.textStyleTemplateTracker.report(preparedPayload.textStyleLib);
            reportFontDemand(preparedPayload.fontTracker);
            console.log('[figma-importer] 已挂载匹配 Figma 子树到选中父节点（beta）：', {
                parent: parentTarget.scenePath || parentTarget.name,
                figmaPath: selected.candidate.path,
                score: selected.score,
                reason: selected.reason,
                rootUuid: result && result.data && result.data.rootUuid,
            });
            return Object.assign(Object.assign({}, result), { match: {
                    parent: parentTarget.scenePath || parentTarget.name,
                    figmaPath: selected.candidate.path,
                    score: selected.score,
                    reason: selected.reason,
                } });
        }
        catch (err) {
            console.error('[figma-importer] attachMatchedNodeAsChildBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    /**
     * @en Menu: start the local push server (127.0.0.1:8787) and persist the on-state.
     * @zh 菜单：启动本地推送服务（127.0.0.1:8787）并记住开启状态（重载后自动续上）。
     */
    async startPushServer() {
        const res = await (0, server_1.startPushServer)(handlePushedJson);
        if (res.ok) {
            await Editor.Profile.setConfig('figma-importer', PUSH_ENABLED_KEY, true);
            console.log('[figma-importer] 推送服务已开启，可在 Figma 插件点「推送」。');
        }
        else {
            console.error(`[figma-importer] 推送服务启动失败：${res.error}`);
        }
    },
    /**
     * @en Menu: stop the local push server and clear the on-state.
     * @zh 菜单：停止本地推送服务并清除开启状态。
     */
    async stopPushServer() {
        await (0, server_1.stopPushServer)();
        await Editor.Profile.setConfig('figma-importer', PUSH_ENABLED_KEY, false);
        console.log('[figma-importer] 推送服务已停止。');
    },
    async stageLastImportForFigmaPull() {
        if (!lastImportedJsonForPull) {
            console.warn('[figma-importer] 暂无可暂存的最近导入 JSON。请先导入或接收一次 Figma 推送。');
            return { success: false, error: 'No imported JSON in memory' };
        }
        const ok = (0, server_1.setPendingPullJson)(lastImportedJsonForPull);
        if (ok) {
            console.log(`[figma-importer] 已暂存最近导入「${lastImportedNameForPull || '(未命名)'}」供 Figma 插件 /pull 拉取（beta）。`);
            return { success: true, name: lastImportedNameForPull };
        }
        return { success: false, error: 'Failed to stage pending pull JSON' };
    },
    async exportTreeForFigmaPull() {
        const selectedRootUuids = getSelectedNodeUuids();
        const selectedRootUuid = selectedRootUuids.length === 1 ? selectedRootUuids[0] : '';
        const rootUuid = selectedRootUuid || lastImportedRootUuid;
        const source = selectedRootUuids.length > 1
            ? `当前选中 ${selectedRootUuids.length} 个节点`
            : (selectedRootUuid ? '当前选中节点' : (lastImportedRootUuid ? '最近导入根节点' : '场景自动候选根节点'));
        try {
            const result = await callScene('exportTreeForFigma', {
                rootUuids: selectedRootUuids.length > 1 ? selectedRootUuids : undefined,
                rootUuid: selectedRootUuids.length > 1 ? '' : rootUuid,
                rootName: selectedRootUuids.length > 1 || rootUuid ? '' : lastImportedNameForPull,
            });
            if (!result || result.success === false || !result.data || !result.data.json) {
                console.warn('[figma-importer] 反导当前场景失败，未暂存 /pull JSON。', result);
                return { success: false, error: result && result.error || 'exportTreeForFigma failed' };
            }
            const ok = (0, server_1.setPendingPullJson)(result.data.json);
            if (!ok)
                return { success: false, error: 'Failed to stage pending pull JSON' };
            const stats = result.data.stats || {};
            console.log(`[figma-importer] 已从 ${source} 反导「${result.data.name || '(未命名)'}」并暂存供 Figma /pull 拉取（beta）。`, {
                canvas: result.data.canvas,
                rootUuid: result.data.rootUuid,
                nodes: stats.nodes,
                texts: stats.texts,
                sprites: stats.sprites,
                images: stats.images,
                missingImages: stats.missingImages,
                warnings: Array.isArray(result.data.warnings) ? result.data.warnings.length : 0,
            });
            return {
                success: true,
                name: result.data.name,
                rootUuid: result.data.rootUuid,
                stats,
            };
        }
        catch (err) {
            console.error('[figma-importer] exportTreeForFigmaPull failed:', err);
            return { success: false, error: String(err) };
        }
    },
    async pushTreeToFigma() {
        const result = await exports.methods.exportTreeForFigmaPull();
        if (result && result.success !== false) {
            console.log('[figma-importer] 已推送到 Figma 拉取队列：请在 Figma 插件点击「从 Unity 拉取」。');
        }
        return result;
    },
    async exportTreeToJsonFile(presetPath) {
        const selectedRootUuids = getSelectedNodeUuids();
        const selectedRootUuid = selectedRootUuids.length === 1 ? selectedRootUuids[0] : '';
        const rootUuid = selectedRootUuid || lastImportedRootUuid;
        const source = selectedRootUuids.length > 1
            ? `当前选中 ${selectedRootUuids.length} 个节点`
            : (selectedRootUuid ? '当前选中节点' : (lastImportedRootUuid ? '最近导入根节点' : '场景自动候选根节点'));
        try {
            const result = await callScene('exportTreeForFigma', {
                rootUuids: selectedRootUuids.length > 1 ? selectedRootUuids : undefined,
                rootUuid: selectedRootUuids.length > 1 ? '' : rootUuid,
                rootName: selectedRootUuids.length > 1 || rootUuid ? '' : lastImportedNameForPull,
            });
            if (!result || result.success === false || !result.data || !result.data.json) {
                console.warn('[figma-importer] 导出 JSON 文件失败：场景反导未返回有效 JSON。', result);
                return { success: false, error: result && result.error || 'exportTreeForFigma failed' };
            }
            const exportName = safeAssetFileName(result.data.name || lastImportedNameForPull || 'CocosExport');
            let filePath = presetPath ? ensureJsonExtension(presetPath) : '';
            if (!filePath) {
                const projectPath = Editor.Project && Editor.Project.path || process.cwd();
                const defaultDir = (0, path_1.join)(projectPath, 'FigmaExport');
                (0, fs_1.mkdirSync)(defaultDir, { recursive: true });
                const picked = await Editor.Dialog.save({
                    title: '保存导出 JSON',
                    path: (0, path_1.join)(defaultDir, `${exportName}.json`),
                    filters: [{ name: 'JSON', extensions: ['json'] }],
                    button: '保存',
                });
                if (picked.canceled || !picked.filePath) {
                    return { success: false, error: 'Canceled' };
                }
                filePath = ensureJsonExtension(picked.filePath);
            }
            (0, fs_1.mkdirSync)((0, path_1.dirname)(filePath), { recursive: true });
            (0, fs_1.writeFileSync)(filePath, result.data.json, 'utf8');
            const stats = result.data.stats || {};
            console.log(`[figma-importer] 已将 ${source}「${result.data.name || exportName}」导出为 Figma JSON：${filePath}`, {
                rootUuid: result.data.rootUuid,
                nodes: stats.nodes,
                texts: stats.texts,
                sprites: stats.sprites,
                images: stats.images,
                missingImages: stats.missingImages,
                warnings: Array.isArray(result.data.warnings) ? result.data.warnings.length : 0,
            });
            return {
                success: true,
                filePath,
                name: result.data.name,
                rootUuid: result.data.rootUuid,
                stats,
            };
        }
        catch (err) {
            console.error('[figma-importer] exportTreeToJsonFile failed:', err);
            return { success: false, error: String(err) };
        }
    },
    async saveNodeAsPrefabBeta() {
        const selectedRootUuid = getSelectedNodeUuid();
        const rootUuid = selectedRootUuid || lastImportedRootUuid;
        const source = selectedRootUuid ? '当前选中节点' : (lastImportedRootUuid ? '最近导入根节点' : '场景自动候选根节点');
        try {
            const result = await callScene('serializeNodeAsPrefabBeta', {
                rootUuid,
                rootName: !rootUuid ? lastImportedNameForPull : '',
                prefabName: lastImportedNameForPull || '',
            });
            if (!result || result.success === false || !result.data || !result.data.json) {
                console.warn('[figma-importer] 保存 Prefab（beta）失败：scene 未返回有效 prefab JSON。', result);
                return { success: false, error: result && result.error || 'serializeNodeAsPrefabBeta failed' };
            }
            await ensureAssetFolder(FIGMA_PREFAB_DIR);
            const prefabName = result.data.name || lastImportedNameForPull || 'FigmaPrefab';
            const dbUrl = `${FIGMA_PREFAB_DIR}/${safeAssetFileName(prefabName)}.prefab`;
            const info = await writeTextAssetViaImport(dbUrl, result.data.json);
            if (!info || !info.uuid) {
                console.warn('[figma-importer] Prefab JSON 已写入，但 asset-db 未返回资源信息。', { dbUrl });
                return { success: false, error: 'Prefab asset import did not return asset info', dbUrl };
            }
            lastSavedPrefabDbUrl = dbUrl;
            lastSavedPrefabUuid = String(info.uuid);
            console.log(`[figma-importer] 已将 ${source}「${prefabName}」保存为 Prefab（beta）：${dbUrl}`, {
                uuid: lastSavedPrefabUuid,
                nodes: result.data.stats && result.data.stats.nodes,
                sprites: result.data.stats && result.data.stats.sprites,
                labels: result.data.stats && result.data.stats.labels,
            });
            return {
                success: true,
                dbUrl,
                uuid: lastSavedPrefabUuid,
                name: prefabName,
                stats: result.data.stats,
            };
        }
        catch (err) {
            console.error('[figma-importer] saveNodeAsPrefabBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
    async instantiatePrefabBeta() {
        try {
            const prefab = await resolvePrefabForInstantiate();
            if (!prefab) {
                console.warn('[figma-importer] 暂无可实例化的 Prefab（beta）。请先选中一个 Prefab 资源，或保存一次最近导入为 Prefab。');
                return { success: false, error: 'No prefab asset selected or saved' };
            }
            const result = await callScene('instantiatePrefabBeta', {
                uuid: prefab.uuid,
                dbUrl: prefab.dbUrl,
                name: prefab.name,
            });
            if (!result || result.success === false) {
                console.warn('[figma-importer] 实例化 Prefab（beta）失败。', result);
                return { success: false, error: result && result.error || 'instantiatePrefabBeta failed' };
            }
            lastSavedPrefabUuid = prefab.uuid;
            lastSavedPrefabDbUrl = prefab.dbUrl;
            await saveSceneAfterImport(result);
            console.log(`[figma-importer] 已实例化 Prefab（beta）「${prefab.name}」。`, result.data);
            return result;
        }
        catch (err) {
            console.error('[figma-importer] instantiatePrefabBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
};
/**
 * @en Method Triggered on Extension Startup.
 * @zh 扩展启动时触发的方法。
 */
async function load() {
    console.log(`%c[figma-importer] 扩展已加载 · 构建版本 = ${types_1.BUILD_VERSION}`, 'color:#0a0;font-weight:bold');
    // 自动续上：上次开启过推送服务就自动恢复（对齐 Unity EditorPrefs 自动续上）。
    try {
        const enabled = await Editor.Profile.getConfig('figma-importer', PUSH_ENABLED_KEY);
        if (enabled) {
            const res = await (0, server_1.startPushServer)(handlePushedJson);
            if (res.ok)
                console.log('[figma-importer] 推送服务已自动续上。');
        }
    }
    catch (err) {
        console.error('[figma-importer] 自动续上推送服务失败:', err);
    }
}
/**
 * @en Method triggered when uninstalling the extension.
 * @zh 卸载扩展时触发的方法。
 */
async function unload() {
    if ((0, server_1.isPushServerRunning)())
        await (0, server_1.stopPushServer)();
    console.log('[figma-importer] extension unloaded');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQXV1REEsZ0VBNEVDO0FBNDJCRCxzRUFnRUM7QUFtekRELG9CQVlDO0FBTUQsd0JBR0M7QUF2aUpEOzs7Ozs7O0dBT0c7QUFDSCwyQkFBd0U7QUFDeEUsbUNBQW9DO0FBQ3BDLCtCQUFxQztBQUNyQyxtQ0FBd0U7QUFDeEUscUNBVWtCO0FBQ2xCLHFDQUFpSDtBQUNqSCx1Q0FBeUc7QUFDekcsMkNBQXFFO0FBQ3JFLHVDQUEwRjtBQUMxRixpREFNd0I7QUFDeEIsaURBQWtFO0FBQ2xFLDJDQUE2RDtBQUM3RCwyREFVNkI7QUFDN0IsdUVBSW1DO0FBQ25DLHFFQUlrQztBQUNsQyx1Q0FLbUI7QUFDbkIsaUVBS2dDO0FBQ2hDLCtEQUFpRTtBQUNqRSwyREFBd0Q7QUFDeEQsMkRBQXFFO0FBRXJFLHNFQUFzRTtBQUV0RSxxREFBcUQ7QUFDckQsTUFBTSxnQkFBZ0IsR0FBRyxrQ0FBa0MsQ0FBQztBQUM1RCxvREFBb0Q7QUFDcEQsTUFBTSxlQUFlLEdBQUcsbUNBQW1DLENBQUM7QUFDNUQsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRTVDLDRDQUE0QztBQUM1QyxLQUFLLFVBQVUsc0JBQXNCO0lBQ2pDLElBQUksQ0FBQztRQUNELE1BQU0sR0FBRyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDOUUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDckIsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxD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QUM7SUFDOUIsSUFBSSxTQUFTO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDM0IsTUFBTSxHQUFHLEdBQUcsMkJBQTJCLENBQUMsVUFBVSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMvRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUNqRSxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsRUFBVSxFQUFFLEVBQVUsRUFBRSxFQUFVLEVBQUUsRUFBVTtJQUNsRSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNyRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNyRCxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDckQsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQ3JELE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQzNCLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLElBQVk7SUFD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Q0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQzdGLENBQUM7SUFDRixJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDbEQsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFTLEVBQUUsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2xDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0QyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDekMsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDckQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FB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RSxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQzdELElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hELE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQzlELElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXpELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUcsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9ELE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUcsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pFLElBQUksS0FBSyxJQUFJLENBQUMsSUFBSSxNQUFNLElBQUksQ0FBQztRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQzNDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUM5QyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDVixLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxHQUFH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QyxDQUFDLENBQUM7SUFDdkQsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekUsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDNUMsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDNUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLElBQUksS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFBRSxPQUFPLElBQUksQ0FBQztJQUMzRyxNQUFNLElBQUksR0FBRyxNQUFNO1NBQ2QsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ2hDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEQsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDL0Qs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QUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQzVGLENBQUM7SUFDTixDQUFDO0lBRUQsZ0RBQWdEO0lBQ2hELElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDM0IsT0FBTztZQUNILElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1lBQ2xELEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1lBQ25ELEdBQUcsRUFBRSxDQUFDO1lBQ04sTUFBTSxFQUFFLENBQUM7U0FDWixDQUFDO0lBQ04sQ0FBQztJQUNELElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDM0IsT0FBTztZQUNILElBQUksRUFBRSxDQUFDO1lBQ1AsS0FBSyxFQUFFLENBQUM7WUFDUixHQUFHLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUNsRCxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztTQUN4RCxDQUFDO0lBQ04sQ0FBQztJQUNELElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDM0IsT0FBTztZQUNILElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1lBQ2xELEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1lBQ25ELEdBQUcsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ2xELE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1NBQ3hELENBQUM7SUFDTixDQUFDO0lBQ0QsZ0RBQWdEO0lBQ2hELE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFDcEQsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLE1BQWdCLEVBQUUsU0FBaUI7SUFDdkQsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNqRCxNQUFNLFFBQVEsR0FBeUQsRUFBRSxDQUFDO0lBQzFFLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7UUFDekIsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDM0MsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ3BELElBQUksQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDO1lBQ2xCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3ZDLENBQUM7YUFBTSxDQUFDO1lBQ0osUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ25ELENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDcEQsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsUUFBa0IsRUFBRSxLQUFhO0lBQzFELElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ2QsSUFBSSxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQ3hCLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEVBQUU7UUFDaEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEdBQUcsS0FBSyxDQUFDLENBQUM7UUFDdkMsSUFBSSxJQUFJLEdBQUcsUUFBUSxFQUFFLENBQUM7WUFDbEIsSUFBSSxHQUFHLEtBQUssQ0FBQztZQUNiLFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDcEIsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0gsT0FBTyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3JDLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLElBQW1CO0lBQzlDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO0lBQy9CLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQyxPQUFPLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDbEYsQ0FBQztBQUVELFNBQVMsa0JBQWtCLENBQUMsSUFBUzs7SUFDakMsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUM1QixJQUFJLElBQUksQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLGNBQWMsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDbEUsT0FBTyxJQUFBLHFDQUFpQixFQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7SUFDRCxPQUFPO1FBQ0gsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFBLElBQUksQ0FBQyxDQUFDLG1DQUFJLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUNsQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQUEsSUFBSSxDQUFDLENBQUMsbUNBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO1FBQ2xDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBQSxJQUFJLENBQUMsQ0FBQyxtQ0FBSSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7UUFDbEMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFBLElBQUksQ0FBQyxDQUFDLG1DQUFJLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztLQUNyQyxDQUFDO0FBQ04sQ0FBQztBQUVELFNBQVMscUJBQXFCLENBQUMsQ0FBTSxFQUFFLFFBQXdEO0lBQzNGLE9BQU87UUFDSCxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUNwRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUNwRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztRQUNwRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztLQUN2RyxDQUFDO0FBQ04sQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxTQUFTLFNBQVMsQ0FBQyxJQUFtQjtJQUNsQyxPQUFPLGtCQUFrQixDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDM0QsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLElBQW1CO0lBQ3JDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO0lBQy9CLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUMvQixDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLElBQUksQ0FBQyxDQUFDLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDLFlBQVksSUFBSSxDQUFDLENBQUMsY0FBYyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQzNHLENBQUM7SUFDRixJQUFJLENBQUMsSUFBSTtRQUFFLE9BQU8sU0FBUyxDQUFDO0lBQzVCLE9BQU87UUFDSCxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDO1FBQ3JDLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBQ2pGLENBQUMsRUFBRSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO0tBQ3BGLENBQUM7QUFDTixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsU0FBUyxpQkFBaUIsQ0FBQyxDQUFTO0lBQ2hDLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxDQUFDLENBQUM7SUFDakIsdUVBQXVFO0lBQ3ZFLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLElBQW1CO0lBQzlDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDM0UsSUFBSSxRQUFRLENBQUMsTUFBTSxJQUFJLENBQUM7UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUMzQyxNQUFNLEtBQUssR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFRLEVBQUUsRUFBRTtRQUNsQyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNoRyxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FDakUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4RCxNQUFNLE1BQU0sR0FBRyxDQUFDLEtBQVUsRUFBRSxTQUFrQixFQUFFLFFBQWdCLEVBQVUsRUFBRTtZQUN4RSxNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDOUIsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7WUFDL0QsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRixDQUFDLENBQUM7UUFDRixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3BELE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7UUFDNUUsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdEIsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUNoRSxDQUFDLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLGNBQWMsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ2hFLENBQUMsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFDaEUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7U0FDdkUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ2QsT0FBTztZQUNILEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUUsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxRSxRQUFRLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1lBQ25DLEtBQUs7U0FDUixDQUFDO0lBQ04sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUM3QyxJQUFJLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQztRQUFFLE9BQU8sU0FBUyxDQUFDO0lBQ3RDLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyQixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztJQUN2RyxNQUFNLFVBQVUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzlFLE9BQU8sU0FBUyxJQUFJLFVBQVUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDckQsQ0FBQztBQUVELFNBQVMsU0FBUyxDQUFDLENBQU0sRUFBRSxDQUFNO0lBQzdCLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDMUIsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFBRSxPQUFPLEtBQUssQ0FBQztJQUMzQixPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNwRSxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsU0FBUyxVQUFVLENBQUMsSUFBbUI7O0lBQ25DLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDO0lBQ25DLE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDO0lBQ25GLElBQUksQ0FBQyxDQUFDO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFDekIsT0FBTztRQUNILEtBQUssRUFBRTtZQUNILENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBQSxDQUFDLENBQUMsQ0FBQyxtQ0FBSSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7WUFDL0IsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFBLENBQUMsQ0FBQyxDQUFDLG1DQUFJLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUMvQixDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQUEsQ0FBQyxDQUFDLENBQUMsbUNBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO1lBQy9CLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBQSxDQUFDLENBQUMsQ0FBQyxtQ0FBSSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7U0FDbEM7UUFDRCxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDO0tBQ2hDLENBQUM7QUFDTixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILFNBQVMsVUFBVSxDQUFDLElBQW1COztJQUNuQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQztJQUNuQyxNQUFNLENBQUMsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxhQUFhLENBQUMsQ0FBQztJQUN6RixJQUFJLENBQUMsQ0FBQztRQUFFLE9BQU8sU0FBUyxDQUFDO0lBQ3pCLE9BQU87UUFDSCxLQUFLLEVBQUU7WUFDSCxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQUEsQ0FBQyxDQUFDLENBQUMsbUNBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO1lBQy9CLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBQSxDQUFDLENBQUMsQ0FBQyxtQ0FBSSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7WUFDL0IsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFBLENBQUMsQ0FBQyxDQUFDLG1DQUFJLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUMvQixDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQUEsQ0FBQyxDQUFDLENBQUMsbUNBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO1NBQ2xDO1FBQ0QsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQztRQUN2QixPQUFPLEVBQUUsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDO1FBQ3ZCLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUM7S0FDdEIsQ0FBQztBQUNOLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsU0FBUyxRQUFRLENBQ2IsSUFBbUIsRUFDbkIsT0FBdUIsRUFDdkIsWUFBOEIsRUFDOUIsV0FBOEIsRUFDOUIsZ0JBQWtDLEVBQ2xDLHdCQUFrRCxFQUNsRCxTQUE0QyxFQUM1QyxVQUF5QyxFQUN6QyxLQUFnQjtJQUVoQixNQUFNLGNBQWMsR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDN0QsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLGFBQWEsSUFBSSxFQUFFLENBQUMsQ0FBQyxXQUFXLEVBQUUsS0FBSyxRQUFRO1FBQ2pGLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDWCxNQUFNLHFCQUFxQixHQUFHLGlCQUFpQjtRQUMzQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQW9CLENBQUM7UUFDM0UsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUNYLE1BQU0scUJBQXFCLEdBQUcsY0FBYyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLDJCQUEyQixDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN4RyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ2pCLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0lBQ2pDLENBQUM7SUFDRCxJQUFJLHFCQUFxQixFQUFFLENBQUM7UUFDeEIsS0FBSyxDQUFDLG1CQUFtQixFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUNELE1BQU0sSUFBSSxHQUFRO1FBQ2QsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1FBQ3JCLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtRQUNmLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtRQUNmLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztRQUN6QixZQUFZLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDO1FBQzdDLG1CQUFtQixFQUFFLElBQUEsZ0RBQTRCLEVBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDO1FBQzNFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNULENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNULEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztRQUNqQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07UUFDbkIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1FBQ3ZCLE1BQU0sRUFBRSxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sRUFBRSxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pELGlCQUFpQixFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsU0FBUztRQUM3RixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sS0FBSyxLQUFLO1FBQy9CLE9BQU8sRUFBRSxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVELFFBQVEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMscUJBQXFCLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xHLFFBQVEsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDO2FBQzFCLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ1YsSUFBSSxxQkFBcUIsSUFBSSxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUFFLE9BQU8sS0FBSyxDQUFDO1lBQ3hFLElBQUksY0FBYyxJQUFJLGNBQWMsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pELEtBQUssQ0FBQywyQkFBMkIsRUFBRSxDQUFDO2dCQUNwQyxPQUFPLEtBQUssQ0FBQztZQUNqQixDQUFDO1lBQ0QsSUFBSSxDQUFDLHFCQUFxQixJQUFJLFlBQVksQ0FBQyxDQUFDLENBQUMsS0FBSyxxQkFBcUI7Z0JBQUUsT0FBTyxJQUFJLENBQUM7WUFDckYsS0FBSyxDQUFDLDBCQUEwQixFQUFFLENBQUM7WUFDbkMsT0FBTyxLQUFLLENBQUM7UUFDakIsQ0FBQyxDQUFDO2FBQ0QsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLHdCQUF3QixFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDN0ksQ0FBQztJQUNGLElBQUkscUJBQXFCO1FBQUUsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztJQUMxRCxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxhQUFhLEdBQUcsUUFBUSxDQUFDO1FBQzlCLElBQUksQ0FBQyxZQUFZLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQztRQUMxQyxJQUFJLENBQUMsY0FBYyxHQUFHLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNuRixDQUFDO0lBQ0QsSUFBSSxJQUFJLENBQUMsV0FBVztRQUFFLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUMxRCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUNWLE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQzdDLElBQUksR0FBRyxFQUFFLENBQUM7WUFDTixPQUFPLENBQUMsUUFBUSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUM7WUFDN0IsT0FBTyxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO1lBQy9CLE1BQU0sVUFBVSxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hILE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQztZQUN6QyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjO2dCQUM1QyxVQUFVLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDO2dCQUM3RCxPQUFPLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztZQUNqQyxDQUFDO1FBQ0wsQ0FBQztRQUNELElBQUksQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDO0lBQzdCLENBQUM7SUFDRCw2Q0FBNkM7SUFDN0MsSUFBSSxJQUFJLENBQUMsV0FBVztRQUFFLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUMxRCxJQUFJLElBQUksQ0FBQyxVQUFVO1FBQUUsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3ZELElBQUksSUFBSSxDQUFDLFVBQVU7UUFBRSxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDdkQsSUFBSSxJQUFJLENBQUMsaUJBQWlCO1FBQUUsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztJQUM1RSx1RUFBdUU7SUFDdkUsc0VBQXNFO0lBQ3RFLDRFQUE0RTtJQUM1RSxJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDN0IsS0FBSyxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsZUFBZSxDQUFDLEVBQUUsQ0FBQztZQUNuRixJQUFJLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLFFBQVEsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzNGLENBQUM7SUFDTCxDQUFDO0lBQ0QsOERBQThEO0lBQzlELElBQUksT0FBTyxJQUFJLENBQUMsV0FBVyxLQUFLLFFBQVE7UUFBRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDOUUsSUFBSSxPQUFPLElBQUksQ0FBQyxrQkFBa0IsS0FBSyxRQUFRO1FBQUUsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztJQUNuRyxJQUFJLElBQUksQ0FBQyxxQkFBcUI7UUFBRSxJQUFJLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDO0lBQ3hGLElBQUksSUFBSSxDQUFDLHFCQUFxQjtRQUFFLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUM7SUFDeEYsSUFBSSxJQUFJLENBQUMsT0FBTztRQUFFLElBQUksQ0FBQyxPQUFPLEdBQUc7WUFDN0IsR0FBRyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDMUIsS0FBSyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLENBQUM7WUFDOUIsTUFBTSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUM7WUFDaEMsSUFBSSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLENBQUM7U0FDL0IsQ0FBQztJQUNGLElBQUksSUFBSSxDQUFDLFlBQVk7UUFBRSxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztJQUNoRCxJQUFJLElBQUksQ0FBQyxhQUFhO1FBQUUsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQ2hFLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLElBQUksRUFBRSxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssT0FBTyxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUMvRSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDO1FBQzVCLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2pELElBQUksVUFBVSxFQUFFLENBQUM7WUFDYixJQUFJLENBQUMsU0FBUyxHQUFHO2dCQUNiLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUyxLQUFLLElBQUk7Z0JBQ2xDLFNBQVMsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDNUYsV0FBVyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQztnQkFDM0MsTUFBTSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQztnQkFDakMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLGFBQWE7Z0JBQy9ELFVBQVU7Z0JBQ1YsYUFBYSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7Z0JBQzFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTO2FBQ3RGLENBQUM7UUFDTixDQUFDO0lBQ0wsQ0FBQztJQUNELElBQUksT0FBTyxJQUFJLENBQUMsWUFBWSxLQUFLLFFBQVE7UUFBRSxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDakYsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUM7UUFBRSxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7SUFDekUsSUFBSSxJQUFJLENBQUMsWUFBWTtRQUFFLElBQUksQ0FBQyxZQUFZLEdBQUc7WUFDdkMsSUFBSSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxJQUFJLENBQUM7WUFDakMsS0FBSyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxJQUFJLENBQUM7WUFDbkMsR0FBRyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDL0IsTUFBTSxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxJQUFJLENBQUM7U0FDeEMsQ0FBQztJQUNGLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztRQUN2QixNQUFNLEtBQUssR0FBRyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxNQUFNLEtBQUssR0FBRyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxJQUFJLEtBQUs7WUFBRSxJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUM7SUFDMUMsQ0FBQztJQUNELHNEQUFzRDtJQUN0RCxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNaLE1BQU0sU0FBUyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkMsSUFBSSxTQUFTLElBQUksU0FBUyxDQUFDLFlBQVk7WUFBRSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDNUQsSUFBSSxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWTtZQUFFLEtBQUssQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3BFLElBQUksU0FBUyxJQUFJLFNBQVMsQ0FBQyxLQUFLLEtBQUssWUFBWTtZQUFFLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUMzRSxJQUFJLENBQUMsSUFBSSxHQUFHO1lBQ1IsQ0FBQyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNkLENBQUMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDZCxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLO1lBQ3RCLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU07WUFDeEIsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUM7WUFDakMsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLEVBQUU7WUFDbEMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU87WUFDL0IsT0FBTyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUTtZQUMzQixLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxRQUFRO1lBQzdDLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUk7WUFDdkQsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUNuRSxDQUFDO0lBQ04sQ0FBQztJQUNELHVCQUF1QjtJQUN2QixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7UUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzNELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztRQUN4QyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsbUJBQW1CLElBQUksRUFBRSxDQUFDO1FBQzFELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsaUJBQWlCLElBQUksRUFBRSxDQUFDO1FBQ3RELElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsSUFBSSxFQUFFLENBQUM7UUFDaEQsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQztRQUNoRCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsSUFBSSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsY0FBYyxJQUFJLEVBQUUsQ0FBQztRQUNoRCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDO1FBQ3BDLElBQUksQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdCLE1BQU0sUUFBUSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxJQUFJLFFBQVE7WUFBRSxJQUFJLENBQUMsWUFBWSxHQUFHLFFBQVEsQ0FBQztRQUMzQyxNQUFNLFFBQVEsR0FBRyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QyxJQUFJLFFBQVE7WUFBRSxJQUFJLENBQUMsWUFBWSxHQUFHLFFBQVEsQ0FBQztRQUMzQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUEsZ0NBQW9CLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlCLG9EQUFvRDtRQUNwRCw4Q0FBOEM7UUFDOUMsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hDLElBQUksTUFBTTtZQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ2pDLE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQyxJQUFJLE1BQU07WUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNqQyxJQUFJLElBQUksR0FBRyxJQUFBLG1CQUFTLEVBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sY0FBYyxHQUFHLElBQUEsdUNBQXdCLEVBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3BFLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsWUFBWSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDakYsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNqQixNQUFNLEtBQUssR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDO1lBQ25DLElBQUksQ0FBQyxpQkFBaUIsR0FBRztnQkFDckIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxJQUFJO2dCQUN6QixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLElBQUk7Z0JBQ3JELE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTTtnQkFDcEIsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO2dCQUMxQixTQUFTLEVBQUUsS0FBSyxDQUFDLFNBQVM7Z0JBQzFCLFNBQVMsRUFBRSxLQUFLLENBQUMsU0FBUztnQkFDMUIsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUN0RSxZQUFZLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUU7Z0JBQ2xGLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVSxJQUFJLEVBQUU7YUFDckMsQ0FBQztZQUNGLDhDQUE4QztZQUM5Qyw4REFBOEQ7WUFDOUQsSUFBSSxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxNQUFNLEdBQUc7b0JBQ1YsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSztvQkFDekIsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSztvQkFDekIsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSztpQkFDNUIsQ0FBQztZQUNOLENBQUM7WUFDRCxJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLE1BQU0sR0FBRztvQkFDVixLQUFLLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLO29CQUN6QixPQUFPLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPO29CQUM3QixPQUFPLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPO29CQUM3QixJQUFJLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJO2lCQUMxQixDQUFDO1lBQ04sQ0FBQztZQUNELElBQUksS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNiLElBQUksR0FBRztvQkFDSCxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJO29CQUNyQixRQUFRLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRO29CQUM3QixHQUFHLEVBQUUsY0FBYyxDQUFDLEtBQUs7b0JBQ3pCLGFBQWEsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWE7aUJBQzFDLENBQUM7WUFDTixDQUFDO1FBQ0wsQ0FBQztRQUNELElBQUksSUFBSSxFQUFFLENBQUM7WUFDUCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDMUIsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO1FBQ2hELENBQUM7UUFDRCx3QkFBd0I7UUFDeEIsV0FBVyxDQUFDLFlBQVksQ0FDcEIsSUFBSSxDQUFDLFVBQVUsRUFDZixJQUFJLENBQUMsVUFBVSxFQUNmLENBQUMsQ0FBQyxJQUFJLEVBQ04sSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUEseUJBQWUsRUFBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQ2hGLENBQUM7SUFDTixDQUFDO0lBQ0QsT0FBTyxJQUFJLENBQUM7QUFDaEIsQ0FBQztBQUVEOzs7R0FHRztBQUNILEtBQUssVUFBVSwyQkFBMkIsQ0FBQyxJQUFxQjtJQUM1RCxJQUFBLDhDQUF3QixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQy9CLE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pDLE1BQU0sU0FBUyxHQUFHLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMxRCxNQUFNLFlBQVksR0FBRyw4QkFBOEIsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDL0YsSUFBSSxZQUFZLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxJQUFJLFlBQVksQ0FBQyxZQUFZLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDdEUsT0FBTyxDQUFDLEdBQUcsQ0FDUCx5Q0FBeUMsWUFBWSxDQUFDLGlCQUFpQixVQUFVO1lBQ2pGLEdBQUcsWUFBWSxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksWUFBWSxDQUFDLFlBQVksZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FDMUYsQ0FBQztJQUNOLENBQUM7SUFDRCxNQUFNLGtCQUFrQixHQUFHLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNqRyxJQUFJLGtCQUFrQixDQUFDLGNBQWMsR0FBRyxDQUFDLElBQUksa0JBQWtCLENBQUMsYUFBYSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2hGLE9BQU8sQ0FBQyxHQUFHLENBQ1AsaUNBQWlDO1lBQ2pDLEdBQUcsa0JBQWtCLENBQUMsYUFBYSxVQUFVLGtCQUFrQixDQUFDLGFBQWEsU0FBUztZQUN0RixHQUFHLGtCQUFrQixDQUFDLGNBQWMsZ0JBQWdCO1lBQ3BELEdBQUcsa0JBQWtCLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxhQUFhLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQ25HLENBQUM7SUFDTixDQUFDO0lBQ0QsTUFBTSwwQkFBMEIsR0FBRyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUUsTUFBTSwwQkFBMEIsR0FBRyxpQ0FBaUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQy9GLE1BQU0sa0JBQWtCLG1DQUNqQiwwQkFBMEIsQ0FBQyxPQUFPLEdBQ2xDLDBCQUEwQixDQUNoQyxDQUFDO0lBQ0YsSUFBSSwwQkFBMEIsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDdkMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsMEJBQTBCLENBQUMsS0FBSyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQzdHLENBQUM7SUFDRCxNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDbkUsTUFBTSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3JGLElBQUksWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ25CLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLFlBQVksZUFBZSxDQUFDLENBQUM7SUFDMUUsQ0FBQztJQUNELE1BQU0sU0FBUyxHQUFjO1FBQ3pCLG1CQUFtQixFQUFFLENBQUM7UUFDdEIsMEJBQTBCLEVBQUUsQ0FBQztRQUM3QixvQkFBb0IsRUFBRSxDQUFDO1FBQ3ZCLDJCQUEyQixFQUFFLENBQUM7UUFDOUIsVUFBVSxFQUFFLENBQUM7UUFDYixpQkFBaUIsRUFBRSxDQUFDO1FBQ3BCLGVBQWUsRUFBRSxDQUFDO0tBQ3JCLENBQUM7SUFDRixJQUFJLGVBQWUsR0FBNkIsRUFBRSxDQUFDO0lBQ25ELElBQUksbUJBQW1CLEdBQTZCLEVBQUUsQ0FBQztJQUN2RCxNQUFNLG1CQUFtQixHQUFVLEVBQUUsQ0FBQztJQUN0Qyx5REFBeUQ7SUFDekQsSUFBSSxtQkFBbUIsR0FBeUMsRUFBRSxDQUFDO0lBQ25FLElBQUksUUFBUSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDN0QsTUFBTSxRQUFRLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztRQUNqRSxNQUFNLFVBQVUsR0FBNkIsRUFBRSxDQUFDO1FBQ2hELEtBQUssTUFBTSxHQUFHLElBQUksUUFBUSxFQUFFLENBQUM7WUFDekIsSUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQztnQkFBRSxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNyRSxDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxZQUFZLENBQUMsQ0FBQztRQUN6RixNQUFNLFVBQVUsR0FBRyxNQUFNLHNCQUFzQixFQUFFLENBQUM7UUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4Q0FBOEMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkYsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFBLG1CQUFVLEVBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsSUFBSSxJQUFJLFVBQVUsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUMzRyxlQUFlLEdBQUcsR0FBRyxDQUFDLGVBQWUsQ0FBQztRQUN0QyxtQkFBbUIsR0FBRyxHQUFHLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztRQUMzQyxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDakUsbUJBQW1CLENBQUMsSUFBSSxpQkFBRyxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsSUFBSyxPQUFPLEVBQUcsQ0FBQztRQUNyRSxDQUFDO1FBQ0QsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzlDLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBQSx1Q0FBOEIsRUFBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQzVFLE1BQU0sQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNuRCxtQkFBbUIsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDO1lBQzNDLE9BQU8sQ0FBQyxHQUFHLENBQ1Asd0NBQXdDO2dCQUN4QyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE1BQU0sU0FBUyxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsTUFBTSxTQUFTLENBQ3JHLENBQUM7UUFDTixDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxNQUFNLGdCQUFnQixDQUFDLENBQUM7UUFDNUYsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNyQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLE1BQU0saUJBQWlCLENBQUMsQ0FBQztZQUN6RixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEsdUJBQWMsRUFBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLElBQUksSUFBSSxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDMUYsbUJBQW1CLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQztZQUM5QyxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ3JFLG1CQUFtQixDQUFDLElBQUksaUJBQUcsTUFBTSxFQUFFLElBQUksRUFBRSxNQUFNLElBQUssT0FBTyxFQUFHLENBQUM7WUFDbkUsQ0FBQztZQUNELE1BQU0sZUFBZSxHQUFHLE9BQU8sQ0FBQyxVQUFVLElBQUksRUFBRSxDQUFDO1lBQ2pELElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzFDLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBQSx1Q0FBOEIsRUFBQyxlQUFlLENBQUMsQ0FBQztnQkFDeEUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3ZELElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO29CQUMvQyxPQUFPLENBQUMsSUFBSSxDQUNSLG9CQUFvQixNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxNQUFNLG1CQUFtQjt3QkFDL0Usb0JBQW9CLENBQ3ZCLENBQUM7Z0JBQ04sQ0FBQztZQUNMLENBQUM7WUFDRCxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsTUFBTSxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3pHLENBQUM7SUFDTCxDQUFDO0lBQ0QsSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDakMsT0FBTyxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBQ3RFLENBQUM7SUFDRCxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEseUJBQWUsR0FBRSxDQUFDO0lBQ3hDLE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBQSxtQ0FBb0IsRUFBQyxPQUFPLENBQUMsQ0FBQztJQUN6RCxNQUFNLFdBQVcsR0FBRyxJQUFJLDJCQUFpQixFQUFFLENBQUM7SUFDNUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLDRCQUFnQixFQUFFLENBQUM7SUFDaEQsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLHVDQUF3QixFQUFFLENBQUM7SUFDaEUsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsd0JBQXdCLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUN2Six1QkFBdUIsR0FBRyxJQUFBLDhDQUEwQixFQUFDLElBQUksQ0FBQyxDQUFDO0lBQzNELE1BQU0sZUFBZSxHQUFHLDRCQUE0QixFQUFFLENBQUM7SUFDdkQsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLDZCQUE2QixDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQzlFLElBQUksdUJBQXVCLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxlQUFlLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUMzRSxPQUFPLENBQUMsR0FBRyxDQUNQLDhCQUE4Qix1QkFBdUIsQ0FBQyxNQUFNLFNBQVM7WUFDckUsR0FBRyxnQkFBZ0IsQ0FBQyxLQUFLLGdCQUFnQixnQkFBZ0IsQ0FBQyxNQUFNLE9BQU8sQ0FDMUUsQ0FBQztJQUNOLENBQUM7SUFDRCxJQUFJLFNBQVMsQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNwQyxPQUFPLENBQUMsR0FBRyxDQUNQLHdCQUF3QixTQUFTLENBQUMsbUJBQW1CLGFBQWE7WUFDbEUsT0FBTyxTQUFTLENBQUMsMEJBQTBCLFVBQVUsQ0FDeEQsQ0FBQztJQUNOLENBQUM7SUFDRCxJQUFJLFNBQVMsQ0FBQyxvQkFBb0IsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNyQyxPQUFPLENBQUMsR0FBRyxDQUNQLHdCQUF3QixTQUFTLENBQUMsb0JBQW9CLGNBQWM7WUFDcEUsT0FBTyxTQUFTLENBQUMsMkJBQTJCLFVBQVUsQ0FDekQsQ0FBQztJQUNOLENBQUM7SUFDRCxJQUFJLFNBQVMsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUM5RCxPQUFPLENBQUMsR0FBRyxDQUNQLDJCQUEyQixTQUFTLENBQUMsVUFBVSxzQkFBc0I7WUFDckUsR0FBRyxTQUFTLENBQUMsaUJBQWlCLFVBQVU7WUFDeEMsR0FBRyxTQUFTLENBQUMsZUFBZSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxTQUFTLENBQUMsZUFBZSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUN2RixDQUFDO0lBQ04sQ0FBQztJQUNELE1BQU0sT0FBTyxHQUFHO1FBQ1osTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNO1FBQ3ZCLElBQUksRUFBRSxJQUFJO1FBQ1YsZUFBZTtRQUNmLG1CQUFtQjtRQUNuQixVQUFVLEVBQUUsTUFBTSxDQUFDLFdBQVcsQ0FDMUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FDMUY7UUFDRCxpQkFBaUIsRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPO1FBQzNDLDBCQUEwQjtRQUMxQixVQUFVLGtCQUNOLGNBQWMsRUFBRSxRQUFRLENBQUMsY0FBYyxFQUN2QyxtQkFBbUIsRUFBRSx1QkFBdUIsQ0FBQyxNQUFNLEVBQ25ELGlCQUFpQixFQUFFLGdCQUFnQixDQUFDLEtBQUssRUFDekMsdUJBQXVCLEVBQUUsZ0JBQWdCLENBQUMsTUFBTSxFQUNoRCxtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxNQUFNLEVBQy9DLHdCQUF3QixFQUFFLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQ3ZELFNBQVMsQ0FDZjtLQUNKLENBQUM7SUFDRixPQUFPO1FBQ0gsUUFBUTtRQUNSLE9BQU87UUFDUCxtQkFBbUI7UUFDbkIsV0FBVztRQUNYLGdCQUFnQjtRQUNoQix3QkFBd0I7UUFDeEIsWUFBWTtLQUNmLENBQUM7QUFDTixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILEtBQUssVUFBVSxhQUFhLENBQUMsSUFBcUI7SUFDOUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ2pDLE1BQU0sY0FBYyxHQUFHLElBQUEsNkJBQW1CLEVBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7SUFDN0UsTUFBTSxRQUFRLEdBQUcsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7SUFDMUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsUUFBUSxhQUFhLHFCQUFhLGFBQWEsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO0lBQ2xILElBQUksTUFBVyxDQUFDO0lBQ2hCLGtEQUFrRDtJQUNsRCxJQUFJLElBQUksR0FBRyxTQUFTLENBQUM7SUFDckIsSUFBSSxDQUFDO1FBQ0QsSUFBSSxHQUFHLHVCQUF1QixDQUFDO1FBQy9CLElBQUksbUJBQW1CLEdBQUcsS0FBSyxDQUFDO1FBQ2hDLElBQUksQ0FBQztZQUNELG1CQUFtQixHQUFHLE1BQU0sMkJBQTJCLEVBQUUsQ0FBQztRQUM5RCxDQUFDO1FBQUMsT0FBTyxZQUFZLEVBQUUsQ0FBQztZQUNwQixJQUFBLHFDQUEyQixFQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzFDLDBCQUEwQixHQUFHLEtBQUssQ0FBQztZQUNuQyxPQUFPLENBQUMsSUFBSSxDQUNSLG9CQUFvQiw2QkFBNkIsV0FBVztnQkFDNUQsOEJBQThCLEVBQzlCLENBQUMsWUFBb0IsYUFBcEIsWUFBWSx1QkFBWixZQUFZLENBQVUsT0FBTyxLQUFJLFlBQVksQ0FDakQsQ0FBQztRQUNOLENBQUM7UUFDRCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUN2QixPQUFPLENBQUMsSUFBSSxDQUNSLG9CQUFvQiw2QkFBNkIsVUFBVTtnQkFDM0QsbUNBQW1DLENBQ3RDLENBQUM7UUFDTixDQUFDO1FBQ0QsSUFBSSxHQUFHLFNBQVMsQ0FBQztRQUNqQixNQUFNLGVBQWUsR0FBRyxNQUFNLDJCQUEyQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hFLE1BQU0sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSx3QkFBd0IsRUFBRSxZQUFZLEVBQUUsR0FBRyxlQUFlLENBQUM7UUFDckgsSUFBSSxHQUFHLFdBQVcsQ0FBQztRQUNuQixNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQy9DLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFMUQsMkRBQTJEO1FBQzNELHNEQUFzRDtRQUN0RCxvRUFBb0U7UUFDcEUsSUFBSSxpQkFBaUIsR0FBcUUsSUFBSSxDQUFDO1FBQy9GLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxFQUFFLENBQUM7WUFDckMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3hELHVCQUF1QixHQUFHLElBQUksQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7WUFDM0Qsb0JBQW9CLEdBQUcsTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUVqRixJQUFJLEdBQUcsdUJBQXVCLENBQUM7WUFDL0IsTUFBTSw2QkFBNkIsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1Qyw4Q0FBOEM7WUFDOUMseUNBQXlDO1lBQ3pDLGdEQUFnRDtZQUNoRCxJQUFJLEdBQUcscUJBQXFCLENBQUM7WUFDN0IsaUJBQWlCLEdBQUcsTUFBTSwyQkFBMkIsQ0FBQyxNQUFNLEVBQUUsZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFFbkcsSUFBSSxHQUFHLFdBQVcsQ0FBQztZQUNuQixNQUFNLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRW5DLCtEQUErRDtZQUMvRCxJQUFBLHVCQUFXLEVBQUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDNUQsQ0FBQzthQUFNLENBQUM7WUFDSixPQUFPLENBQUMsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3hFLHdEQUF3RDtZQUN4RCxJQUFBLDZCQUFpQixFQUFDLFdBQVcsRUFBRSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksa0NBQWtDLEVBQUU7Z0JBQy9HLFVBQVUsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsYUFBYTthQUN6QyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBRUQsc0RBQXNEO1FBQ3RELGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQzFCLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM5QyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUU5QixtQ0FBbUM7UUFDbkMsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUNyQyxNQUFNLG9CQUFvQixDQUFDLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFFRCxPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNYLGtFQUFrRTtRQUNsRSxxREFBcUQ7UUFDckQsOERBQThEO1FBQzlELElBQUEsNkJBQWlCLEVBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUN6RSxNQUFNLEdBQUcsQ0FBQztJQUNkLENBQUM7WUFBUyxDQUFDO1FBQ1AsSUFBQSwyQkFBaUIsRUFBQyxjQUFjLENBQUMsQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLGFBQWEsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLENBQUM7UUFDOUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sT0FBTyxVQUFVLGVBQWUsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLG1CQUFtQixDQUFDLENBQUM7SUFDNUksQ0FBQztBQUNMLENBQUM7QUFFRCxLQUFLLFVBQVUsMkJBQTJCLENBQ3RDLE1BQVcsRUFDWCxtQkFBNkQ7SUFFN0QsTUFBTSxZQUFZLEdBQVUsQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hHLElBQUksWUFBWSxDQUFDLE1BQU0sS0FBSyxDQUFDO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDM0MsT0FBTyw2QkFBNkIsQ0FBQyxZQUFZLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztBQUM1RSxDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSSxLQUFLLFVBQVUsNkJBQTZCLENBQy9DLFlBQW1CLEVBQ25CLGtCQUE0RCxFQUFFO0lBRTlELE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxNQUFNLENBQUM7SUFDbEMsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDLENBQU0sdUJBQXVCO0lBQ2xELE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQztJQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixLQUFLLGtCQUFrQixDQUFDLENBQUM7SUFFekQsTUFBTSxvQkFBb0IsR0FBb0QsRUFBRSxDQUFDO0lBQ2pGLEtBQUssSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDdkQsTUFBTSxFQUFFLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9CLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM3QyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLEtBQUs7WUFBRSxTQUFTO1FBQ3JCLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFBLHNDQUE2QixFQUMxRixLQUFLLEVBQ0wsRUFBRSxJQUFJLEVBQUUsQ0FBQyxZQUFZLElBQUksU0FBUyxDQUNyQyxDQUFDO0lBQ04sQ0FBQztJQUNELE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQztRQUMxRCxDQUFDLENBQUMsTUFBTSxJQUFBLHVDQUE4QixFQUNsQyxvQkFBb0IsRUFDcEIsU0FBUyxFQUNULFdBQVcsQ0FDZDtRQUNELENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxDQUFDO0lBRXZDLE1BQU0sYUFBYSxHQUFVLEVBQUUsQ0FBQztJQUNoQyxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQ3pDLEtBQUssSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDdkQsTUFBTSxFQUFFLEdBQUcsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9CLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLGVBQWUsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3pGLElBQUksSUFBSSxFQUFFLENBQUM7WUFDUCxhQUFhLENBQUMsSUFBSSxDQUFDO2dCQUNmLFFBQVEsRUFBRSxFQUFFLENBQUMsUUFBUTtnQkFDckIsZUFBZSxFQUFFLElBQUk7Z0JBQ3JCLFlBQVksRUFBRSxFQUFFLENBQUMsWUFBWTtnQkFDN0IsU0FBUyxFQUFFLEVBQUUsQ0FBQyxTQUFTO2dCQUN2QixXQUFXLEVBQUUsRUFBRSxDQUFDLFdBQVc7Z0JBQzNCLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSztnQkFDZixNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU07YUFDcEIsQ0FBQyxDQUFDO1FBQ1AsQ0FBQzthQUFNLENBQUM7WUFDSixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLENBQUM7WUFDM0MsSUFBSSxLQUFLO2dCQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekMsQ0FBQztJQUNMLENBQUM7SUFDRCxJQUFJLGNBQWMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDMUIsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRSxPQUFPLENBQUMsSUFBSSxDQUNSLG9CQUFvQixjQUFjLENBQUMsSUFBSSxzQkFBc0I7WUFDN0QsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUNsQyxDQUFDO0lBQ04sQ0FBQztJQUVELElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztJQUNqQixJQUFJLGFBQWEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDM0IsTUFBTSxHQUFHLEdBQUcsTUFBTSxTQUFTLENBQUMsMEJBQTBCLEVBQUUsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUNsRixRQUFRLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBQ0QsTUFBTSxZQUFZLEdBQUcsS0FBSyxHQUFHLFFBQVEsQ0FBQztJQUN0QyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixRQUFRLElBQUksS0FBSyxTQUFTLFlBQVksYUFBYSxDQUFDLENBQUM7SUFDNUYsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLENBQUM7QUFDN0MsQ0FBQztBQUVEOztHQUVHO0FBQ0gsS0FBSyxVQUFVLG9CQUFvQixDQUMvQixNQUFXLEVBQ1gsaUJBQW1GO0lBRW5GLElBQUksQ0FBQztRQUNELE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDeEMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkMsTUFBTSxZQUFZLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDL0csTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO1FBQzNCLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxPQUFPLElBQUksQ0FBQyxDQUFDO1FBQ2pDLElBQUksaUJBQWlCLElBQUksaUJBQWlCLENBQUMsUUFBUSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3RELEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxpQkFBaUIsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFDRCxJQUFJLFlBQVksR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNuQixLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sWUFBWSx1QkFBdUIsQ0FBQyxDQUFDO1FBQzNELENBQUM7UUFDRCxNQUFNLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRTtZQUNuQyxNQUFNLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDeEIsT0FBTyxFQUFFLENBQUMsSUFBSSxDQUFDO1lBQ2YsT0FBTyxFQUFFLENBQUM7U0FDYixDQUFDLENBQUM7SUFDUCxDQUFDO0lBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNYLG1CQUFtQjtRQUNuQixPQUFPLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3hELENBQUM7QUFDTCxDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILFNBQVMsZ0JBQWdCLENBQUMsT0FBMEI7SUFDaEQsTUFBTSxvQkFBb0IsR0FBRyxPQUFPLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztJQUMvRCxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUM7UUFDeEIsSUFBSSxvQkFBb0IsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMzQixPQUFPLENBQUMsR0FBRyxDQUNQLDJCQUEyQixPQUFPLENBQUMsZUFBZSxFQUFFLEtBQUs7Z0JBQ3pELEdBQUcsb0JBQW9CLGdCQUFnQixDQUMxQyxDQUFDO1lBQ0YsS0FBSyxNQUFNLElBQUksSUFBSSxPQUFPLENBQUMsa0JBQWtCLEVBQUUsRUFBRSxDQUFDO2dCQUM5QyxPQUFPLENBQUMsR0FBRyxDQUNQLDJCQUEyQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sSUFBSSxDQUFDLEtBQUssSUFBSSxDQUNwRyxDQUFDO1lBQ04sQ0FBQztRQUNMLENBQUM7YUFBTSxDQUFDO1lBQ0osT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsT0FBTyxDQUFDLGVBQWUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsT0FBTztJQUNYLENBQUM7SUFDRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDckMsT0FBTyxDQUFDLElBQUksQ0FDUix5QkFBeUIsT0FBTyxDQUFDLGVBQWUsRUFBRSxRQUFRO1FBQzFELEdBQUcsT0FBTyxDQUFDLE1BQU0saUJBQWlCO1FBQ2xDLEdBQUcsb0JBQW9CLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLG9CQUFvQixXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUMvRSxDQUFDO0lBQ0YsS0FBSyxNQUFNLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUN0QixPQUFPLENBQUMsSUFBSSxDQUNSLDJCQUEyQixDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEtBQUssSUFBSTtZQUNyRixJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLHdDQUF3QyxDQUM3RSxDQUFDO0lBQ04sQ0FBQztJQUNELEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQztRQUM5QyxPQUFPLENBQUMsR0FBRyxDQUNQLDJCQUEyQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sSUFBSSxDQUFDLEtBQUssSUFBSSxDQUNwRyxDQUFDO0lBQ04sQ0FBQztBQUNMLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsS0FBSyxVQUFVLGdCQUFnQixDQUFDLElBQVksRUFBRSxJQUFZLEVBQUUsT0FBcUI7SUFDN0UsSUFBSSxDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsSUFBSSxJQUFJLE9BQU8sS0FBSyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztRQUMzRSxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBb0IsQ0FBQztRQUVqRCxJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1lBQ2hELE1BQU0sYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFCLE9BQU87UUFDWCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsMkJBQTJCLENBQUMsSUFBSSxFQUFFLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sMEJBQTBCLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sY0FBYyxHQUFHLHlCQUF5QixDQUFDO1FBQ2pELE1BQU0sZ0JBQWdCLEdBQUc7WUFDckIsUUFBUSxFQUFFLFFBQVE7WUFDbEIsT0FBTyxFQUFFLFNBQVM7WUFDbEIsTUFBTSxFQUFFLFlBQVk7U0FDdkIsQ0FBQztRQUNGLHFGQUFxRjtRQUNyRix1RkFBdUY7UUFDdkYsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsTUFBTSxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQzFDLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsTUFBTSxRQUFRLEdBQVEsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FDOUMsZ0JBQWdCLEVBQ2hCLG9CQUFvQixFQUNwQixnQkFBZ0IsQ0FDbkIsQ0FBQztRQUNGLElBQUksQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUMxQyxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsS0FBSyxJQUFJLGlCQUFpQixDQUFDLENBQUM7UUFDckUsQ0FBQztRQUNELE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDekMsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFBLGtEQUE4QixHQUFFLENBQUM7UUFDekQsSUFBSSxPQUFPLENBQUMsUUFBUSxLQUFLLFFBQVEsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQzlDLE9BQU8sQ0FBQyxJQUFJLENBQUMsOENBQThDLENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBQ0QsSUFBSSxDQUFDLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUMxQyxNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDekMsQ0FBQztRQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMseUNBQXlDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3JELHFEQUFxRDtRQUNyRCxJQUFBLDZCQUFpQixFQUFDLGtCQUFrQixFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQy9DLENBQUM7QUFDTCxDQUFDO0FBRUQ7OztHQUdHO0FBQ1UsUUFBQSxPQUFPLEdBQStDO0lBQy9ELEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxNQUF1QztRQUM5RCxNQUFNLGtCQUFrQixHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxDQUFDO1FBQ2xFLE1BQU0sYUFBYSxHQUFHLElBQUEsK0NBQXdCLEVBQzFDLE1BQU0sSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FDbEUsQ0FBQztRQUNGLE1BQU0sUUFBUSxHQUFHLGtCQUFrQjtZQUMvQixDQUFDLENBQUMsYUFBYTtZQUNmLENBQUMsQ0FBQyxhQUFhLElBQUksTUFBTSxJQUFBLDBDQUFtQixHQUFFLENBQUM7UUFDbkQsSUFBSSxrQkFBa0IsSUFBSSxhQUFhO1lBQUUsTUFBTSxJQUFBLDJDQUFvQixFQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlFLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQ3JFLENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxPQUFrRTtRQUNoRixPQUFPLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQsS0FBSyxDQUFDLG9CQUFvQixDQUFDLFlBQXFCO1FBQzVDLE1BQU0sTUFBTSxHQUFHLE1BQU0sMEJBQTBCLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0lBRUQsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFFBQWlCO1FBQ3RDLE1BQU0sV0FBVyxHQUFHLE1BQU0sMEJBQTBCLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3JFLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLFdBQVcsRUFBRSxFQUFFLENBQUM7SUFDcEQsQ0FBQztJQUVELDJDQUEyQztJQUMzQyx5QkFBeUI7UUFDckIsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFRCxvQ0FBb0M7SUFDcEMsbUJBQW1CO1FBQ2YsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUEsNEJBQW1CLEdBQUUsRUFBRSxFQUFFLENBQUM7SUFDdkUsQ0FBQztJQUVELCtCQUErQjtJQUMvQixLQUFLLENBQUMscUJBQXFCO1FBQ3ZCLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLHNCQUFzQixFQUFFLEVBQUUsRUFBRSxDQUFDO0lBQzdFLENBQUM7SUFFRCxxREFBcUQ7SUFDckQsS0FBSyxDQUFDLG9CQUFvQjtRQUN0QixNQUFNLFFBQVEsR0FBRyw0QkFBNEIsRUFBRSxDQUFDO1FBQ2hELE1BQU0sUUFBUSxHQUFHLE1BQU0sNkJBQTZCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDL0QsTUFBTSxRQUFRLEdBQUcsTUFBTSwwQkFBMEIsRUFBRSxDQUFDO1FBQ3BELE1BQU0sY0FBYyxHQUFHLE1BQU0saUNBQWlDLEVBQUUsQ0FBQztRQUNqRSxPQUFPO1lBQ0gsT0FBTyxFQUFFLElBQUk7WUFDYixJQUFJLEVBQUU7Z0JBQ0YsS0FBSyxFQUFFLHdCQUF3QjtnQkFDL0IsUUFBUTtnQkFDUixRQUFRLEVBQUU7b0JBQ04sS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLO29CQUNyQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07b0JBQ3ZCLE9BQU8sRUFBRSxRQUFRLENBQUMsT0FBTztpQkFDNUI7Z0JBQ0QsY0FBYztnQkFDZCxVQUFVLEVBQUUsdUJBQXVCO2dCQUNuQyxjQUFjLEVBQUUsUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN4QyxJQUFJLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7b0JBQzNCLEtBQUssRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDO29CQUM3QixJQUFJLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLFdBQVcsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDO2lCQUN2RSxDQUFDLENBQUMsQ0FBQyxJQUFJO2FBQ1g7U0FDSixDQUFDO0lBQ04sQ0FBQztJQUVELCtEQUErRDtJQUMvRCxLQUFLLENBQUMsK0JBQStCLENBQUMsVUFBbUI7UUFDckQsSUFBSSxDQUFDO1lBQ0QsSUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUMvQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ1osTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztvQkFDdEMsS0FBSyxFQUFFLHNCQUFzQjtvQkFDN0IsSUFBSSxFQUFFLE1BQU07b0JBQ1osT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7aUJBQ3BELENBQUMsQ0FBQztnQkFDSCxJQUFJLE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7Z0JBQzlDLENBQUM7Z0JBQ0QsUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsQ0FBQztZQUNELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBQSxpQkFBWSxFQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBb0IsQ0FBQztZQUMxRSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUk7Z0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGtDQUFrQyxFQUFFLENBQUM7WUFDNUYsdUJBQXVCLEdBQUcsSUFBQSw4Q0FBMEIsRUFBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDL0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsdUJBQXVCLENBQUMsTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ3pGLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNGLFFBQVE7b0JBQ1IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDN0MsS0FBSyxFQUFFLHVCQUF1QixDQUFDLE1BQU07b0JBQ3JDLFVBQVUsRUFBRSx1QkFBdUI7aUJBQ3RDO2FBQ0osQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsMERBQTBELEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDL0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsSUFBSSxHQUFHLENBQUMsT0FBTyxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3hFLENBQUM7SUFDTCxDQUFDO0lBRUQsMkRBQTJEO0lBQzNELEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxPQUF3QztRQUNqRSxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDMUUsSUFBSSxDQUFDLFlBQVk7WUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQztRQUM1RSxNQUFNLGNBQWMsR0FBRyxNQUFNLHNDQUFzQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzdFLE1BQU0sUUFBUSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUM7UUFDckMsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM5QixJQUFJLGNBQWMsQ0FBQyxNQUFNLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQ3ZDLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDO1lBQ2hFLENBQUM7WUFDRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsOEJBQThCLEVBQUUsQ0FBQztRQUNyRSxDQUFDO1FBQ0QsTUFBTSxjQUFjLEdBQUc7WUFDbkIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO1lBQzNCLEtBQUssRUFBRSxZQUFZLENBQUMsUUFBUSxDQUFDO1lBQzdCLElBQUksRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxRQUFRLENBQUMsV0FBVyxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUM7U0FDdkUsQ0FBQztRQUNGLE1BQU0sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUM1RCxJQUFBLHNDQUFrQixFQUFDLFFBQVEsRUFBRTtZQUN6QixZQUFZO1lBQ1osYUFBYSxFQUFFLE1BQU0sQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLGFBQWEsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUU7WUFDcEUsVUFBVSxFQUFFLGNBQWMsQ0FBQyxJQUFJO1lBQy9CLFNBQVMsRUFBRSxjQUFjLENBQUMsS0FBSztZQUMvQixhQUFhLEVBQUUsTUFBTSxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsYUFBYSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRTtTQUN2RSxDQUFDLENBQ0wsQ0FBQztRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUU7WUFDckMsWUFBWTtZQUNaLGFBQWEsRUFBRSxNQUFNLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxhQUFhLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFO1lBQ3BFLE1BQU0sRUFBRSxjQUFjLENBQUMsS0FBSztTQUMvQixDQUFDLENBQUM7UUFDSCxPQUFPO1lBQ0gsT0FBTyxFQUFFLElBQUk7WUFDYixJQUFJLEVBQUU7Z0JBQ0YsUUFBUSxFQUFFLEtBQUs7Z0JBQ2YsS0FBSyxFQUFFLHdCQUF3QjtnQkFDL0IsY0FBYzthQUNqQjtTQUNKLENBQUM7SUFDTixDQUFDO0lBRUQscURBQXFEO0lBQ3JELEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxZQUFxQixFQUFFLGFBQXNCO1FBQ3RFLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDOUMsSUFBSSxDQUFDLEdBQUc7WUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQztRQUNuRSxNQUFNLEtBQUssR0FBRyxNQUFNLDhCQUE4QixDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FDNUQsSUFBQSxzQ0FBa0IsRUFBQyxRQUFRLEVBQUUsR0FBRyxFQUFFLE1BQU0sQ0FBQyxhQUFhLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FDeEUsQ0FBQztRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuSCxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxFQUFFLENBQUM7SUFDekYsQ0FBQztJQUVELHVDQUF1QztJQUN2QyxLQUFLLENBQUMscUJBQXFCLENBQUMsSUFBYztRQUN0QyxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7UUFDM0IsS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzlDLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN2RCxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM5RSxDQUFDO1FBQ0QsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7SUFDcEQsQ0FBQztJQUVELCtDQUErQztJQUMvQyxLQUFLLENBQUMsb0JBQW9CO1FBQ3RCLElBQUksQ0FBQztZQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ3RDLEtBQUssRUFBRSxlQUFlO2dCQUN0QixJQUFJLEVBQUUsV0FBVzthQUNwQixDQUFDLENBQUM7WUFDSCxJQUFJLE1BQU0sQ0FBQyxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDOUMsQ0FBQztZQUNELE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDaEMsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO1lBQ2IsSUFBSSxDQUFDO2dCQUNELEdBQUcsR0FBRyxNQUFNLElBQUEsd0JBQWMsRUFBUyxXQUFXLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNoRSxDQUFDO1lBQUMsV0FBTSxDQUFDO2dCQUFDLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFBQyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDUCxrREFBa0Q7Z0JBQ2xELE1BQU0sV0FBVyxHQUFJLE1BQWMsQ0FBQyxPQUFPLElBQUssTUFBYyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7Z0JBQzVFLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUM3QyxNQUFNLFVBQVUsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUMxRixJQUFJLFVBQVUsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7b0JBQzVDLEdBQUcsR0FBRyxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3hELENBQUM7WUFDTCxDQUFDO1lBQ0QsR0FBRyxHQUFHLE1BQU0sQ0FBQyxHQUFHLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNuRCxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUNqQyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsNkJBQTZCLEVBQUUsQ0FBQztZQUNwRSxDQUFDO1lBQ0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxzQkFBc0IsRUFBRSxDQUFDO1lBQy9DLElBQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuRCxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUMzRSxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQ2xFLENBQUM7UUFBQyxPQUFPLEdBQVEsRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUN4RSxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxjQUFjO1FBQ2hCLElBQUksQ0FBQztZQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLGlCQUFpQixFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLHlDQUF5QyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLGNBQWMsQ0FBQyxVQUFtQjtRQUNwQyxJQUFJLENBQUM7WUFDRCxJQUFJLFFBQVEsR0FBRyxVQUFVLENBQUM7WUFDMUIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNaLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7b0JBQ3RDLEtBQUssRUFBRSxtQkFBbUI7b0JBQzFCLElBQUksRUFBRSxNQUFNO29CQUNaLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2lCQUNwRCxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxNQUFNLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUNuRCxPQUFPO2dCQUNYLENBQUM7Z0JBQ0QsUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsQ0FBQztZQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDWixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUM7WUFDckQsQ0FBQztZQUNELE1BQU0sR0FBRyxHQUFHLElBQUEsaUJBQVksRUFBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDNUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQW9CLENBQUM7WUFDaEQsT0FBTyxNQUFNLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMseUNBQXlDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUQsc0RBQXNEO1lBQ3RELHlDQUF5QztZQUN6QyxJQUFBLDZCQUFpQixFQUFDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3pDLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxVQUFtQjtRQUNwRCxJQUFJLENBQUM7WUFDRCxJQUFJLFFBQVEsR0FBRyxVQUFVLENBQUM7WUFDMUIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNaLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7b0JBQ3RDLEtBQUssRUFBRSxtQ0FBbUM7b0JBQzFDLElBQUksRUFBRSxNQUFNO29CQUNaLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2lCQUNwRCxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxNQUFNLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUNuRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUM7Z0JBQ2pELENBQUM7Z0JBQ0QsUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsQ0FBQztZQUNELElBQUksQ0FBQyxRQUFRO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztZQUVoRSxNQUFNLEdBQUcsR0FBRyxJQUFBLGlCQUFZLEVBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFvQixDQUFDO1lBQ2hELE1BQU0sU0FBUyxHQUFHLElBQUEsK0NBQWdDLEVBQUMsSUFBSSxDQUFDLENBQUM7WUFDekQsSUFBSSxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDakMsT0FBTyxDQUFDLElBQUksQ0FBQyxzREFBc0QsQ0FBQyxDQUFDO2dCQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztZQUM5RCxDQUFDO1lBRUQsTUFBTSxpQkFBaUIsQ0FBQyxpQ0FBa0IsQ0FBQyxDQUFDO1lBQzVDLDhEQUE4RDtZQUM5RCxNQUFNLG1CQUFtQixHQUFHLFlBQVksQ0FBQztZQUN6QyxNQUFNLEtBQUssR0FBRyxHQUFHLGlDQUFrQixJQUFJLG1CQUFtQixPQUFPLENBQUM7WUFDbEUsTUFBTSxPQUFPLEdBQUc7Z0JBQ1osT0FBTyxFQUFFLENBQUM7Z0JBQ1YsU0FBUyxFQUFFLGdCQUFnQjtnQkFDM0IsWUFBWSxFQUFFLHFCQUFhO2dCQUMzQixVQUFVLEVBQUUsU0FBUyxDQUFDLFVBQVU7Z0JBQ2hDLGFBQWEsRUFBRSxTQUFTLENBQUMsYUFBYTtnQkFDdEMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxhQUFhO2dCQUN0QyxLQUFLLEVBQUUsU0FBUyxDQUFDLEtBQUs7Z0JBQ3RCLE9BQU8sRUFBRSxTQUFTLENBQUMsT0FBTzthQUM3QixDQUFDO1lBQ0YsTUFBTSxJQUFJLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEYsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDdEIsT0FBTyxDQUFDLElBQUksQ0FBQywwREFBMEQsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQ3BGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxtREFBbUQsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUNqRyxDQUFDO1lBRUQsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFBLHlCQUFlLEdBQUUsQ0FBQztZQUN4QyxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEsbUNBQW9CLEVBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FDUCwrQ0FBK0MsS0FBSyxFQUFFLEVBQ3REO2dCQUNJLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTtnQkFDZixPQUFPLEVBQUUsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNO2dCQUNqQyxJQUFJLEVBQUUsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJO2dCQUMxQixTQUFTLEVBQUUsU0FBUyxDQUFDLGFBQWEsSUFBSSxXQUFXO2dCQUNqRCxjQUFjLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNO2FBQ3pDLENBQ0osQ0FBQztZQUVGLHdDQUF3QztZQUN4Qyw2Q0FBNkM7WUFDN0MsTUFBTSxXQUFXLEdBQUcsTUFBTSxTQUFTLENBQUMsb0JBQW9CLEVBQUU7Z0JBQ3RELE9BQU8sRUFBRSxTQUFTLENBQUMsT0FBTztnQkFDMUIsUUFBUSxFQUFFLG1CQUFtQjthQUNoQyxDQUFDLENBQUM7WUFDSCxJQUFJLFdBQVcsSUFBSSxXQUFXLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUMvQyxNQUFNLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUN4QyxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNwRSxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUM7Z0JBQ3BGLE9BQU8sQ0FBQyxHQUFHLENBQ1AsNkJBQTZCLFFBQVEsVUFBVSxTQUFTLGVBQWUsRUFDdkUsNkJBQTZCLENBQ2hDLENBQUM7Z0JBQ0YsT0FBTyxDQUFDLEdBQUcsQ0FDUCw4REFBOEQ7b0JBQzlELE9BQU8sUUFBUSxTQUFTLGlDQUFrQixRQUFRLFFBQVEsVUFBVTtvQkFDcEUsMEJBQTBCLENBQzdCLENBQUM7WUFDTixDQUFDO2lCQUFNLENBQUM7Z0JBQ0osT0FBTyxDQUFDLElBQUksQ0FBQyxzREFBc0QsRUFBRSxXQUFXLENBQUMsQ0FBQztZQUN0RixDQUFDO1lBRUQsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixLQUFLO2dCQUNMLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztnQkFDdkIsT0FBTyxFQUFFLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTTtnQkFDakMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLO2dCQUN0QixTQUFTLEVBQUUsV0FBVyxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFNBQVM7YUFDNUUsQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyx5REFBeUQsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEQsQ0FBQztJQUNMLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsMkJBQTJCLENBQUMsVUFBbUI7UUFDakQsTUFBTSxVQUFVLEdBQUcsbUJBQW1CLEVBQUUsQ0FBQztRQUN6QyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDZCxPQUFPLENBQUMsSUFBSSxDQUFDLDRDQUE0QyxDQUFDLENBQUM7WUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLHlCQUF5QixFQUFFLENBQUM7UUFDaEUsQ0FBQztRQUVELElBQUksQ0FBQztZQUNELElBQUksUUFBUSxHQUFHLFVBQVUsQ0FBQztZQUMxQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ1osTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztvQkFDdEMsS0FBSyxFQUFFLDJCQUEyQjtvQkFDbEMsSUFBSSxFQUFFLE1BQU07b0JBQ1osT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7aUJBQ3BELENBQUMsQ0FBQztnQkFDSCxJQUFJLE1BQU0sQ0FBQyxRQUFRLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ25ELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQztnQkFDakQsQ0FBQztnQkFDRCxRQUFRLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuQyxDQUFDO1lBQ0QsSUFBSSxDQUFDLFFBQVE7Z0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDO1lBRWhFLE9BQU8sQ0FBQyxHQUFHLENBQUMsaURBQWlELHFCQUFhLEVBQUUsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO1lBQzdHLE1BQU0sR0FBRyxHQUFHLElBQUEsaUJBQVksRUFBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDNUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQW9CLENBQUM7WUFDaEQsTUFBTSxxQ0FBcUMsRUFBRSxDQUFDO1lBQzlDLE1BQU0sZUFBZSxHQUFHLE1BQU0sMkJBQTJCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEUsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsaUJBQWlCLGtDQUN6QyxlQUFlLENBQUMsT0FBTyxLQUMxQixVQUFVLElBQ1osQ0FBQztZQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFFaEUsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDckMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN4RCx1QkFBdUIsR0FBRyxJQUFJLENBQUMsSUFBSSxJQUFJLGVBQWUsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDM0Usb0JBQW9CLEdBQUcsTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDakYsTUFBTSw2QkFBNkIsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSwyQkFBMkIsQ0FBQyxNQUFNLEVBQUUsZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUM7Z0JBQy9FLE1BQU0sb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkMsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLE9BQU8sQ0FBQyxJQUFJLENBQUMsOENBQThDLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDekUsQ0FBQztZQUVELGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMxQyxlQUFlLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM5RSxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFFOUMsT0FBTyxNQUFNLENBQUM7UUFDbEIsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLHNEQUFzRCxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzNFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxVQUFtQixFQUFFLFNBQWtCO1FBQ2hGLE1BQU0sVUFBVSxHQUFHLG1CQUFtQixFQUFFLENBQUM7UUFDekMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2QsT0FBTyxDQUFDLElBQUksQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1lBQ3hELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDO1FBQ2hFLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDRCxNQUFNLFlBQVksR0FBRyxNQUFNLFNBQVMsQ0FBQyw0QkFBNEIsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQ3pGLElBQUksQ0FBQyxZQUFZLElBQUksWUFBWSxDQUFDLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3hFLE9BQU8sQ0FBQyxJQUFJLENBQUMscUNBQXFDLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxZQUFZLElBQUksWUFBWSxDQUFDLEtBQUssSUFBSSxtQ0FBbUMsRUFBRSxDQUFDO1lBQ2hILENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsSUFBeUIsQ0FBQztZQUV0RCxJQUFJLFFBQVEsR0FBRyxVQUFVLENBQUM7WUFDMUIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNaLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7b0JBQ3RDLEtBQUssRUFBRSxzQkFBc0I7b0JBQzdCLElBQUksRUFBRSxNQUFNO29CQUNaLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2lCQUNwRCxDQUFDLENBQUM7Z0JBQ0gsSUFBSSxNQUFNLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUNuRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUM7Z0JBQ2pELENBQUM7Z0JBQ0QsUUFBUSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbkMsQ0FBQztZQUNELElBQUksQ0FBQyxRQUFRO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztZQUVoRSxPQUFPLENBQUMsR0FBRyxDQUFDLGdEQUFnRCxxQkFBYSxFQUFFLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztZQUM1RyxNQUFNLEdBQUcsR0FBRyxJQUFBLGlCQUFZLEVBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFvQixDQUFDO1lBQ2hELE1BQU0sYUFBYSxHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3pELE1BQU0sVUFBVSxHQUFHLDBCQUEwQixDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsRSxNQUFNLFFBQVEsR0FBRyw0QkFBNEIsQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzdFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDWixPQUFPLENBQUMsSUFBSSxDQUFDLDZDQUE2QyxFQUFFO29CQUN4RCxNQUFNO29CQUNOLFNBQVM7b0JBQ1QsVUFBVSxFQUFFLFVBQVUsQ0FBQyxNQUFNO2lCQUNoQyxDQUFDLENBQUM7Z0JBQ0gsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLDhCQUE4QixFQUFFLENBQUM7WUFDckUsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZELE1BQU0sT0FBTyxHQUFvQjtnQkFDN0IsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUNyQixJQUFJLEVBQUUsV0FBVyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLFdBQVc7Z0JBQ2xELE1BQU0sRUFBRSxhQUFhLENBQUMsTUFBTTtnQkFDNUIsSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLE1BQU0sRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZTthQUN4QyxDQUFDO1lBQ0YsTUFBTSxxQ0FBcUMsRUFBRSxDQUFDO1lBQzlDLE1BQU0sZUFBZSxHQUFHLE1BQU0sMkJBQTJCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbkUsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsaUJBQWlCLGtDQUN6QyxlQUFlLENBQUMsT0FBTyxLQUMxQixVQUFVLElBQ1osQ0FBQztZQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMsaUVBQWlFLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFFdkYsSUFBSSxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDckMsdUJBQXVCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMzRCx1QkFBdUIsR0FBRyxXQUFXLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUM5RCxvQkFBb0IsR0FBRyxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNqRixNQUFNLDZCQUE2QixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLDJCQUEyQixDQUFDLE1BQU0sRUFBRSxlQUFlLENBQUMsbUJBQW1CLENBQUMsQ0FBQztnQkFDL0UsTUFBTSxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ0osT0FBTyxDQUFDLElBQUksQ0FBQyxpREFBaUQsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1RSxDQUFDO1lBRUQsZUFBZSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFDLGVBQWUsQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzlFLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM5QyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFO2dCQUN0QyxNQUFNLEVBQUUsTUFBTSxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSTtnQkFDdkMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSTtnQkFDbEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLO2dCQUNyQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07Z0JBQ3ZCLEtBQUssRUFBRSxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUs7YUFDcEQsQ0FBQyxDQUFDO1lBRUgsdUNBQ08sTUFBTSxLQUNULEtBQUssRUFBRTtvQkFDSCxNQUFNLEVBQUUsTUFBTSxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSTtvQkFDdkMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSTtvQkFDbEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLO29CQUNyQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07aUJBQzFCLElBQ0g7UUFDTixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsaUVBQWlFLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDdEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLDZCQUE2QixDQUFDLFVBQW1CLEVBQUUsSUFBSSxHQUFHLEtBQUssRUFBRSxXQUFvQjtRQUN2RixJQUFJLENBQUM7WUFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLHlCQUF5QixDQUFDLFVBQVUsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1lBQ3ZGLElBQUksQ0FBQyxRQUFRO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUU1RCxNQUFNLFFBQVEsR0FBRyxXQUFXLElBQUksbUJBQW1CLEVBQUUsSUFBSSxvQkFBb0IsQ0FBQztZQUM5RSxNQUFNLEdBQUcsR0FBRyxJQUFBLGlCQUFZLEVBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFvQixDQUFDO1lBQ2hELE1BQU0sUUFBUSxHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sVUFBVSxHQUFHLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3RCxNQUFNLFdBQVcsR0FBRyxVQUFVO2lCQUN6QixNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDO2lCQUN0QyxHQUFHLENBQUMsdUJBQXVCLENBQUMsQ0FBQztZQUNsQyxNQUFNLGlCQUFpQixHQUEyQixFQUFFLENBQUM7WUFDckQsS0FBSyxNQUFNLElBQUksSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsUUFBUSxJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDbkcsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDO2dCQUN2QyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDMUIsaUJBQWlCLENBQUMsR0FBRyxDQUFDLG1DQUNmLHVCQUF1QixDQUFDLElBQUksQ0FBQyxLQUNoQyxXQUFXLEVBQUUsQ0FBQyxFQUNkLFFBQVEsRUFBRSxFQUFFLEdBQ2YsQ0FBQztnQkFDTixDQUFDO2dCQUNELGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNyQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDO29CQUNqQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7b0JBQ2YsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPO29CQUNmLENBQUMsRUFBRSxJQUFJLENBQUMsT0FBTztvQkFDZixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7b0JBQ2pCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtpQkFDdEIsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUVELE1BQU0sWUFBWSxHQUFHLE1BQU0sU0FBUyxDQUFDLHdCQUF3QixFQUFFO2dCQUMzRCxRQUFRO2dCQUNSLElBQUk7YUFDUCxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxPQUFPLEtBQUssS0FBSyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN4RSxPQUFPLENBQUMsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsWUFBWSxJQUFJLFlBQVksQ0FBQyxLQUFLLElBQUksK0JBQStCLEVBQUUsQ0FBQztZQUM1RyxDQUFDO1lBRUQsTUFBTSxPQUFPLEdBQUcsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQXdCLENBQUM7WUFDekUsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO2dCQUNuQyxNQUFNLEdBQUcsR0FBRywyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMvRCxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDO2dCQUM1QixPQUFPO29CQUNILE1BQU07b0JBQ04sSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7d0JBQ1QsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO3dCQUNqQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07d0JBQ25CLE1BQU0sRUFBRSx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO3FCQUNsRCxDQUFDLENBQUMsQ0FBQyxJQUFJO29CQUNSLFVBQVUsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUMzQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7d0JBQ2pCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTt3QkFDbkIsTUFBTSxFQUFFLHVCQUF1QixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7cUJBQ2xELENBQUMsQ0FBQztpQkFDTixDQUFDO1lBQ04sQ0FBQyxDQUFDLENBQUM7WUFDSCxNQUFNLGdCQUFnQixHQUFHLE9BQU87aUJBQzNCLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDO2dCQUNyRCxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO2lCQUM3RCxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ1osTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSTtnQkFDN0UsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVztnQkFDN0IsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO2dCQUNmLFFBQVEsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztnQkFDNUIsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ3BFLENBQUMsQ0FBQyxDQUFDO1lBQ1IsTUFBTSxtQkFBbUIsR0FBOEIsRUFBRSxDQUFDO1lBQzFELEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUc7b0JBQUUsU0FBUztnQkFDbEQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUNuQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDO29CQUFFLG1CQUFtQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDL0QsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDO29CQUMzQixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJO29CQUM3RSxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXO29CQUM3QixLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLO2lCQUN6QixDQUFDLENBQUM7WUFDUCxDQUFDO1lBQ0QsTUFBTSwwQkFBMEIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDO2lCQUM5RCxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7aUJBQ3RELEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDWixNQUFNLEVBQUUsSUFBSTtnQkFDWixLQUFLLEVBQUUsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTTtnQkFDdkMsT0FBTyxFQUFFLG1CQUFtQixDQUFDLElBQUksQ0FBQzthQUNyQyxDQUFDLENBQUMsQ0FBQztZQUNSLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO1lBQ3ZGLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUN4RyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUM7WUFDNUQsTUFBTSxNQUFNLEdBQUc7Z0JBQ1gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNGLFFBQVE7b0JBQ1IsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO29CQUNuQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07b0JBQ3ZCLElBQUksRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVE7b0JBQ2hDLFFBQVEsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVE7b0JBQ3BDLElBQUk7b0JBQ0osV0FBVyxFQUFFO3dCQUNULEtBQUssRUFBRSxVQUFVLENBQUMsTUFBTTt3QkFDeEIsS0FBSyxFQUFFLFdBQVcsQ0FBQyxNQUFNO3dCQUN6QixNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU07cUJBQ2hEO29CQUNELFdBQVcsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUs7b0JBQ3BDLFVBQVUsRUFBRTt3QkFDUixPQUFPLEVBQUUsT0FBTyxDQUFDLE1BQU07d0JBQ3ZCLFNBQVM7d0JBQ1QsSUFBSTt3QkFDSixPQUFPO3dCQUNQLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxNQUFNO3dCQUNsQywwQkFBMEIsRUFBRSwwQkFBMEIsQ0FBQyxNQUFNO3FCQUNoRTtvQkFDRCxXQUFXO29CQUNYLFlBQVksRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDO29CQUM5QyxnQkFBZ0I7b0JBQ2hCLDBCQUEwQjtvQkFDMUIsT0FBTztpQkFDVjthQUNKLENBQUM7WUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxFQUFFO2dCQUM1QyxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUMvQixNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUMvQixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVO2dCQUM3QixHQUFHLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUNwQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTO29CQUN6RCxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXO29CQUM3QixLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUs7b0JBQ25DLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUk7b0JBQzFDLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTTtpQkFDeEMsQ0FBQyxDQUFDO2FBQ04sQ0FBQyxDQUFDO1lBQ0gsT0FBTyxNQUFNLENBQUM7UUFDbEIsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxVQUFtQixFQUFFLFlBQVksR0FBRyxJQUFJLEVBQUUsY0FBYyxHQUFHLElBQUk7UUFDckYsSUFBSSxDQUFDO1lBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxVQUFVLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztZQUNuRixJQUFJLENBQUMsUUFBUTtnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFFNUQsTUFBTSxHQUFHLEdBQUcsSUFBQSxpQkFBWSxFQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM1QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBb0IsQ0FBQztZQUNoRCxNQUFNLFFBQVEsR0FBRyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMzRCxNQUFNLFVBQVUsR0FBRywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDN0QsTUFBTSxPQUFPLEdBQUcseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEQsTUFBTSxpQkFBaUIsR0FBMkIsRUFBRSxDQUFDO1lBQ3JELE1BQU0sV0FBVyxHQUFVLEVBQUUsQ0FBQztZQUM5QixJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNqQixLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRSxDQUFDO29CQUNqQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7d0JBQzVCLFdBQVcsQ0FBQyxJQUFJLENBQUM7NEJBQ2IsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJOzRCQUNwQixJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUk7NEJBQ3BCLElBQUksRUFBRSxTQUFTLENBQUMsV0FBVzs0QkFDM0IsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxPQUFPOzRCQUNwQixDQUFDLEVBQUUsU0FBUyxDQUFDLE9BQU87NEJBQ3BCLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSzs0QkFDdEIsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNOzRCQUN4QixJQUFJLEVBQUUsU0FBUyxDQUFDLFVBQVUsSUFBSSxFQUFFO3lCQUNuQyxDQUFDLENBQUM7b0JBQ1AsQ0FBQzt5QkFBTSxJQUFJLFNBQVMsQ0FBQyxRQUFRLElBQUksU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUNsRCxNQUFNLEdBQUcsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDO3dCQUMvQixJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQzs0QkFDMUIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQzs0QkFDckQsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEdBQUc7Z0NBQ3JCLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSTtnQ0FDcEIsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJO2dDQUNwQixJQUFJLEVBQUUsU0FBUyxDQUFDLFdBQVc7Z0NBQzNCLFFBQVEsRUFBRSxHQUFHO2dDQUNiLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSztnQ0FDdEIsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNO2dDQUN4QixXQUFXLEVBQUUsQ0FBQztnQ0FDZCxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxXQUFXLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFO2dDQUMvRSxRQUFRLEVBQUUsRUFBRTs2QkFDZixDQUFDO3dCQUNOLENBQUM7d0JBQ0QsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBQ3JDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7NEJBQ2pDLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSTs0QkFDcEIsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxPQUFPOzRCQUNwQixDQUFDLEVBQUUsU0FBUyxDQUFDLE9BQU87NEJBQ3BCLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSzs0QkFDdEIsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNO3lCQUMzQixDQUFDLENBQUM7b0JBQ1AsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3hDLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSTtnQkFDcEIsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJO2dCQUNwQixJQUFJLEVBQUUsU0FBUyxDQUFDLFdBQVc7Z0JBQzNCLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSTtnQkFDcEIsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxPQUFPO2dCQUNwQixDQUFDLEVBQUUsU0FBUyxDQUFDLE9BQU87Z0JBQ3BCLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSztnQkFDdEIsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNO2dCQUN4QixRQUFRLEVBQUUsU0FBUyxDQUFDLFFBQVE7Z0JBQzVCLElBQUksRUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3BFLFlBQVksRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDO2dCQUN2RCxhQUFhLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDaEQsYUFBYSxFQUFFLElBQUEsc0NBQWtCLEVBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztnQkFDckUsbUJBQW1CLEVBQUUsSUFBQSxnREFBNEIsRUFBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDO2FBQ3hGLENBQUMsQ0FBQyxDQUFDO1lBQ0osTUFBTSxNQUFNLEdBQUc7Z0JBQ1gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNGLFFBQVE7b0JBQ1IsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO29CQUNuQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07b0JBQ3ZCLGVBQWUsRUFBRSxPQUFPLENBQUMsR0FBRztvQkFDNUIsbUJBQW1CLEVBQUUsWUFBWSxJQUFJLE9BQU8sQ0FBQyxNQUFNO3dCQUMvQyxDQUFDLENBQUMsUUFBUSxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFdBQVcsT0FBTyxDQUFDLE1BQU0sRUFBRTt3QkFDMUUsQ0FBQyxDQUFDLEVBQUU7b0JBQ1IsS0FBSyxFQUFFO3dCQUNILElBQUksRUFBRSxJQUFJLENBQUMsTUFBTTt3QkFDakIsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUMsTUFBTTt3QkFDekQsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUMsTUFBTTt3QkFDM0QsZUFBZSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTTt3QkFDakMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxNQUFNO3dCQUMvQixZQUFZLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLE1BQU07d0JBQ25ELGNBQWMsRUFBRSxRQUFRLENBQUMsY0FBYztxQkFDMUM7b0JBQ0QsWUFBWSxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUM7b0JBQzlDLFdBQVc7b0JBQ1gsSUFBSTtpQkFDUDthQUNKLENBQUM7WUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxFQUFFO2dCQUNqRCxRQUFRO2dCQUNSLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUk7Z0JBQ3RCLE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU07Z0JBQzFCLGVBQWUsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLGVBQWU7Z0JBQzVDLEtBQUssRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUs7Z0JBQ3hCLFlBQVk7Z0JBQ1osY0FBYzthQUNqQixDQUFDLENBQUM7WUFDSCxPQUFPLE1BQU0sQ0FBQztRQUNsQixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsOENBQThDLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLG9CQUFvQixDQUFDLFVBQW1CLEVBQUUsWUFBWSxHQUFHLElBQUksRUFBRSxXQUFXLEdBQUcsS0FBSztRQUNwRixJQUFJLENBQUM7WUFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLHlCQUF5QixDQUFDLFVBQVUsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1lBQ3JGLElBQUksQ0FBQyxRQUFRO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUU1RCxNQUFNLEdBQUcsR0FBRyxJQUFBLGlCQUFZLEVBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFvQixDQUFDO1lBQ2hELE1BQU0sUUFBUSxHQUFHLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzNELE1BQU0sVUFBVSxHQUFHLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7aUJBQ3ZELE1BQU0sQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLFFBQVEsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDckUsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFBLGdDQUF1QixFQUFDLE1BQU0sc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO1lBQ25GLE1BQU0sS0FBSyxHQUEyQixFQUFFLENBQUM7WUFFekMsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDakMsTUFBTSxRQUFRLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLFFBQVE7b0JBQUUsU0FBUztnQkFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDMUQsSUFBSSxDQUFDLE1BQU07b0JBQUUsU0FBUztnQkFDdEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO29CQUNuQixNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFlLEVBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ3ZDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUN2RSxNQUFNLElBQUksR0FBRyxJQUFBLDRCQUFtQixFQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUMxQyxNQUFNLE1BQU0sR0FBRyx3QkFBd0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDakQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHO3dCQUNkLFFBQVE7d0JBQ1IsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJO3dCQUNwQixTQUFTLEVBQUUsU0FBUyxDQUFDLElBQUksSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxFQUFFO3dCQUMzRCxJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUk7d0JBQ3BCLEtBQUssRUFBRSxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSxTQUFTLENBQUMsS0FBSzt3QkFDaEQsTUFBTSxFQUFFLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxJQUFJLFNBQVMsQ0FBQyxNQUFNO3dCQUNuRCxTQUFTLEVBQUUsU0FBUyxDQUFDLEtBQUs7d0JBQzFCLFVBQVUsRUFBRSxTQUFTLENBQUMsTUFBTTt3QkFDNUIsSUFBSSxFQUFFLE1BQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUU7d0JBQ2pDLE9BQU8sRUFBRSxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sSUFBSSxFQUFFO3dCQUN2QyxNQUFNO3dCQUNOLEtBQUssRUFBRSxNQUFNLEtBQUssU0FBUzt3QkFDM0IsWUFBWSxFQUFFLE1BQU0sS0FBSyxTQUFTO3dCQUNsQyxnQkFBZ0IsRUFBRSxNQUFNLEtBQUssY0FBYzt3QkFDM0MsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRTt3QkFDakMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRTt3QkFDaEMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxNQUFNO3dCQUMxQixpQkFBaUIsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDLE1BQU07d0JBQzdFLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssY0FBYyxDQUFDLENBQUMsTUFBTTt3QkFDdEYsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsUUFBUSxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsV0FBVyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRTt3QkFDckYsV0FBVyxFQUFFLENBQUM7d0JBQ2QsUUFBUSxFQUFFLEVBQWdDO3FCQUM3QyxDQUFDO2dCQUNOLENBQUM7Z0JBQ0QsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUM5QixLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztvQkFDMUIsSUFBSSxFQUFFLFNBQVMsQ0FBQyxJQUFJO29CQUNwQixJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUk7b0JBQ3BCLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSztvQkFDdEIsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNO29CQUN4QixPQUFPLEVBQUUsU0FBUyxDQUFDLE9BQU87b0JBQzFCLE9BQU8sRUFBRSxTQUFTLENBQUMsT0FBTztpQkFDN0IsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztZQUVELElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFVLENBQUM7WUFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtnQkFDbEIsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JHLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixJQUFJLEVBQUUsS0FBSyxFQUFFO29CQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQztnQkFDOUIsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQ3BGLENBQUMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxLQUFLLEdBQUc7Z0JBQ1YsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO2dCQUN0QixZQUFZLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxTQUFTLENBQUMsQ0FBQyxNQUFNO2dCQUN4RSxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLGNBQWMsQ0FBQyxDQUFDLE1BQU07Z0JBQ2pGLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLFNBQVMsQ0FBQyxDQUFDLE1BQU07Z0JBQ25FLG9CQUFvQixFQUFFLFlBQVksQ0FBQyxLQUFLO2dCQUN4QyxtQkFBbUIsRUFBRSxZQUFZLENBQUMsTUFBTTtnQkFDeEMsb0JBQW9CLEVBQUUsWUFBWSxDQUFDLE9BQU87Z0JBQzFDLGNBQWMsRUFBRSxRQUFRLENBQUMsY0FBYzthQUMxQyxDQUFDO1lBQ0YsSUFBSSxXQUFXO2dCQUFFLE9BQU8sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLGNBQWMsQ0FBQyxDQUFDO1lBRWpILE9BQU8sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLEVBQUU7Z0JBQzVDLFFBQVE7Z0JBQ1IsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO2dCQUNuQixLQUFLO2dCQUNMLEtBQUssRUFBRSxPQUFPLENBQUMsTUFBTTthQUN4QixDQUFDLENBQUM7WUFDSCxPQUFPO2dCQUNILE9BQU8sRUFBRSxJQUFJO2dCQUNiLElBQUksRUFBRTtvQkFDRixRQUFRO29CQUNSLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtvQkFDbkIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNO29CQUN2QixLQUFLO29CQUNMLE9BQU87aUJBQ1Y7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLCtDQUErQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLHlCQUF5QixDQUFDLFVBQW1CLEVBQUUsdUJBQXVCLEdBQUcsS0FBSztRQUNoRixJQUFJLENBQUM7WUFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLHlCQUF5QixDQUFDLFVBQVUsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO1lBQ3pGLElBQUksQ0FBQyxRQUFRO2dCQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUU1RCxNQUFNLEdBQUcsR0FBRyxJQUFBLGlCQUFZLEVBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFvQixDQUFDO1lBQ2hELE1BQU0sUUFBUSxHQUFHLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzNELE1BQU0sSUFBSSxHQUFHLE1BQU0sZUFBTyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDeEUsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLEtBQUssSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDaEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxJQUFJLDZCQUE2QixFQUFFLENBQUM7WUFDMUYsQ0FBQztZQUNELE1BQU0sT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUUsQ0FDNUQsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxTQUFTLElBQUksQ0FBQyx1QkFBdUIsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLGNBQWMsQ0FBQyxDQUFDLENBQ3hHLENBQUM7WUFDRixNQUFNLFlBQVksR0FBNkIsRUFBRSxDQUFDO1lBQ2xELEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQzFCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUN6QyxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO29CQUFFLFlBQVksQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3JGLENBQUM7WUFDRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN6QyxPQUFPO29CQUNILE9BQU8sRUFBRSxJQUFJO29CQUNiLElBQUksRUFBRTt3QkFDRixRQUFRO3dCQUNSLFFBQVEsRUFBRSxDQUFDO3dCQUNYLE9BQU8sRUFBRSxxQkFBcUI7cUJBQ2pDO2lCQUNKLENBQUM7WUFDTixDQUFDO1lBRUQsTUFBTSxTQUFTLEdBQUcsc0JBQXNCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RELE1BQU0sa0JBQWtCLG1DQUNqQixpQ0FBaUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDLE9BQU8sR0FDbkUseUJBQXlCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUM5QyxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFBLG1CQUFVLEVBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzQkFBc0IsRUFBRSxDQUFDLENBQUM7WUFDNUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsRUFBRTtnQkFDN0MsUUFBUTtnQkFDUixTQUFTLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNO2dCQUMzQyxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsTUFBTTtnQkFDbEQsdUJBQXVCO2FBQzFCLENBQUMsQ0FBQztZQUNILE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFO29CQUNGLFFBQVE7b0JBQ1IsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO29CQUNuQixTQUFTLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNO29CQUMzQyxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsTUFBTTtvQkFDbEQsZUFBZSxFQUFFLE1BQU0sQ0FBQyxlQUFlO2lCQUMxQzthQUNKLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0RBQW9ELEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLDhCQUE4QixDQUNoQyxVQUFtQixFQUNuQixTQUFrQixFQUNsQixLQUFrQztRQUVsQyxNQUFNLFVBQVUsR0FBRyxtQkFBbUIsRUFBRSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLENBQUMsQ0FBQztZQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUseUJBQXlCLEVBQUUsQ0FBQztRQUNoRSxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxVQUFVLEVBQUUseUJBQXlCLENBQUMsQ0FBQztZQUN4RixJQUFJLENBQUMsUUFBUTtnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFFNUQsTUFBTSxZQUFZLEdBQUcsTUFBTSxTQUFTLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxPQUFPLEtBQUssS0FBSyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsWUFBWSxJQUFJLFlBQVksQ0FBQyxLQUFLLElBQUksbUNBQW1DLEVBQUUsQ0FBQztZQUNoSCxDQUFDO1lBQ0QsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLElBQXlCLENBQUM7WUFDdEQsTUFBTSxHQUFHLEdBQUcsSUFBQSxpQkFBWSxFQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM1QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBb0IsQ0FBQztZQUNoRCxNQUFNLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sVUFBVSxHQUFHLDBCQUEwQixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JFLE1BQU0sUUFBUSxHQUFHLDBCQUEwQixDQUFDLFVBQVUsRUFBRSxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDM0UsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNaLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLEVBQUU7b0JBQ3RELE1BQU0sRUFBRSxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxJQUFJO29CQUN2QyxTQUFTO29CQUNULFVBQVUsRUFBRSxVQUFVLENBQUMsTUFBTTtpQkFDaEMsQ0FBQyxDQUFDO2dCQUNILE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw4QkFBOEIsRUFBRSxDQUFDO1lBQ3JFLENBQUM7WUFFRCxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2RCxXQUFXLENBQUMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDO1lBQzNDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7WUFDM0MsTUFBTSxPQUFPLEdBQW9CO2dCQUM3QixPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQ3JCLElBQUksRUFBRSxXQUFXLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksV0FBVztnQkFDbEQsTUFBTSxFQUFFLGdCQUFnQixDQUFDLE1BQU07Z0JBQy9CLElBQUksRUFBRSxXQUFXO2dCQUNqQixNQUFNLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDO2dCQUNwQyxlQUFlLEVBQUUsSUFBSSxDQUFDLGVBQWU7YUFDeEMsQ0FBQztZQUNGLE1BQU0sZUFBZSxHQUFHLE1BQU0sMkJBQTJCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbkUsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsb0JBQW9CLEVBQUU7Z0JBQ2pELFVBQVU7Z0JBQ1YsSUFBSSxFQUFFLGVBQWUsQ0FBQyxPQUFPLENBQUMsSUFBSTtnQkFDbEMsTUFBTSxFQUFFLGVBQWUsQ0FBQyxPQUFPLENBQUMsTUFBTTtnQkFDdEMsZUFBZSxFQUFFLGVBQWUsQ0FBQyxPQUFPLENBQUMsZUFBZTtnQkFDeEQsS0FBSyxFQUFFLHdCQUF3QixDQUFDLEtBQUssQ0FBQzthQUN6QyxDQUFDLENBQUM7WUFFSCxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUNyQyxNQUFNLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7aUJBQU0sQ0FBQztnQkFDSixPQUFPLENBQUMsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzVFLENBQUM7WUFFRCxlQUFlLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDMUMsZUFBZSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDOUUsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzlDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0NBQXNDLEVBQUU7Z0JBQ2hELE1BQU0sRUFBRSxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxJQUFJO2dCQUN2QyxTQUFTLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJO2dCQUNsQyxLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7Z0JBQ3JCLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTTtnQkFDdkIsS0FBSyxFQUFFLHdCQUF3QixDQUFDLEtBQUssQ0FBQzthQUN6QyxDQUFDLENBQUM7WUFFSCx1Q0FDTyxNQUFNLEtBQ1QsS0FBSyxFQUFFO29CQUNILE1BQU0sRUFBRSxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxJQUFJO29CQUN2QyxTQUFTLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJO29CQUNsQyxLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7b0JBQ3JCLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTTtpQkFDMUIsSUFDSDtRQUNOLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyx5REFBeUQsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEQsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxVQUFtQjtRQUMvQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDZCxPQUFPLENBQUMsSUFBSSxDQUFDLHdDQUF3QyxDQUFDLENBQUM7WUFDdkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUM7UUFDM0QsQ0FBQztRQUNELElBQUksQ0FBQztZQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLDJCQUEyQixFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDbEYsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUN0QyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxJQUFJLE1BQU0sQ0FBQyxLQUFLLElBQUksa0NBQWtDLEVBQUUsQ0FBQztZQUNuRyxDQUFDO1lBQ0QsT0FBTyxNQUFNLENBQUM7UUFDbEIsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLHdCQUF3QixDQUFDLGlCQUF1QjtRQUNsRCxNQUFNLFFBQVEsR0FBRyxpQkFBaUIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsSUFBSSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sVUFBVSxHQUFHLENBQUMsaUJBQWlCLElBQUksaUJBQWlCLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQztRQUMxRSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzlCLE9BQU8sQ0FBQyxJQUFJLENBQUMsc0NBQXNDLENBQUMsQ0FBQztZQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsa0JBQWtCLEVBQUUsQ0FBQztRQUN6RCxDQUFDO1FBQ0QsSUFBSSxDQUFDO1lBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsMEJBQTBCLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ3pFLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNuRCxNQUFNLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3ZDLENBQUM7aUJBQU0sSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUM3QyxPQUFPLENBQUMsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2xGLENBQUM7WUFDRCxPQUFPLE1BQU0sQ0FBQztRQUNsQixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsbURBQW1ELEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsdUJBQXVCLENBQUMsVUFBbUI7UUFDN0MsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2QsT0FBTyxDQUFDLElBQUksQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1lBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO1FBQzNELENBQUM7UUFDRCxJQUFJLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQ2hGLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztnQkFDdEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLGdDQUFnQyxFQUFFLENBQUM7WUFDakcsQ0FBQztZQUNELE9BQU8sTUFBTSxDQUFDO1FBQ2xCLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyxrREFBa0QsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEQsQ0FBQztJQUNMLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMseUJBQXlCLENBQzNCLFVBQW1CLEVBQ25CLFVBQW1CLEVBQ25CLFNBQWtCLEVBQ2xCLEtBQWtDO1FBRWxDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQztRQUMzRCxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxVQUFVLEVBQUUseUJBQXlCLENBQUMsQ0FBQztZQUN4RixJQUFJLENBQUMsUUFBUTtnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFFNUQsTUFBTSxZQUFZLEdBQUcsTUFBTSxTQUFTLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxPQUFPLEtBQUssS0FBSyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsWUFBWSxJQUFJLFlBQVksQ0FBQyxLQUFLLElBQUksbUNBQW1DLEVBQUUsQ0FBQztZQUNoSCxDQUFDO1lBQ0QsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLElBQXlCLENBQUM7WUFDdEQsTUFBTSxHQUFHLEdBQUcsSUFBQSxpQkFBWSxFQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM1QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBb0IsQ0FBQztZQUNoRCxNQUFNLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sVUFBVSxHQUFHLDBCQUEwQixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JFLE1BQU0sUUFBUSxHQUFHLDBCQUEwQixDQUFDLFVBQVUsRUFBRSxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDM0UsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNaLE9BQU8sQ0FBQyxJQUFJLENBQUMseUNBQXlDLEVBQUU7b0JBQ3BELE1BQU0sRUFBRSxNQUFNLENBQUMsU0FBUyxJQUFJLE1BQU0sQ0FBQyxJQUFJO29CQUN2QyxVQUFVO29CQUNWLFNBQVM7b0JBQ1QsVUFBVSxFQUFFLFVBQVUsQ0FBQyxNQUFNO2lCQUNoQyxDQUFDLENBQUM7Z0JBQ0gsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLDhCQUE4QixFQUFFLENBQUM7WUFDckUsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZELFdBQVcsQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7WUFDM0MsV0FBVyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztZQUMzQyxNQUFNLE9BQU8sR0FBb0I7Z0JBQzdCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDckIsSUFBSSxFQUFFLFdBQVcsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxXQUFXO2dCQUNsRCxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsTUFBTTtnQkFDL0IsSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLE1BQU0sRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZTthQUN4QyxDQUFDO1lBQ0YsTUFBTSxlQUFlLEdBQUcsTUFBTSwyQkFBMkIsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNuRSxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyxvQkFBb0IsRUFBRTtnQkFDakQsVUFBVTtnQkFDVixJQUFJLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJO2dCQUNsQyxNQUFNLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxNQUFNO2dCQUN0QyxlQUFlLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxlQUFlO2dCQUN4RCxLQUFLLEVBQUUsd0JBQXdCLENBQUMsS0FBSyxDQUFDO2FBQ3pDLENBQUMsQ0FBQztZQUVILElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQ3JDLE1BQU0sb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkMsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLE9BQU8sQ0FBQyxJQUFJLENBQUMsb0RBQW9ELEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDL0UsQ0FBQztZQUVELGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMxQyxlQUFlLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM5RSxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDOUMsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsRUFBRTtnQkFDcEQsTUFBTSxFQUFFLE1BQU0sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLElBQUk7Z0JBQ3ZDLFVBQVU7Z0JBQ1YsU0FBUyxFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSTtnQkFDbEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLO2dCQUNyQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07Z0JBQ3ZCLEtBQUssRUFBRSx3QkFBd0IsQ0FBQyxLQUFLLENBQUM7YUFDekMsQ0FBQyxDQUFDO1lBRUgsdUNBQ08sTUFBTSxLQUNULEtBQUssRUFBRTtvQkFDSCxNQUFNLEVBQUUsTUFBTSxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSTtvQkFDdkMsVUFBVTtvQkFDVixTQUFTLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJO29CQUNsQyxLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7b0JBQ3JCLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTTtpQkFDMUIsSUFDSDtRQUNOLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyxvREFBb0QsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUN6RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEQsQ0FBQztJQUNMLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsbUNBQW1DLENBQ3JDLFVBQW1CLEVBQ25CLE9BQWtDO1FBRWxDLElBQUksQ0FBQztZQUNELE1BQU0sUUFBUSxHQUFHLHdCQUF3QixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ25ELE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxRQUFRLElBQUksbUJBQW1CLEVBQUUsSUFBSSxvQkFBb0IsQ0FBQztZQUNwRixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ1osT0FBTyxDQUFDLElBQUksQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO2dCQUMzRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUseUJBQXlCLEVBQUUsQ0FBQztZQUNoRSxDQUFDO1lBRUQsTUFBTSxRQUFRLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxVQUFVLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztZQUNyRixJQUFJLENBQUMsUUFBUTtnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFFNUQsTUFBTSxHQUFHLEdBQUcsSUFBQSxpQkFBWSxFQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM1QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBb0IsQ0FBQztZQUNoRCxNQUFNLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sVUFBVSxHQUFHLDBCQUEwQixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JFLE1BQU0sWUFBWSxHQUFHLE1BQU0sU0FBUyxDQUFDLHdCQUF3QixFQUFFO2dCQUMzRCxRQUFRO2dCQUNSLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTthQUN0QixDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxPQUFPLEtBQUssS0FBSyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN4RSxPQUFPLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLFlBQVksQ0FBQyxDQUFDO2dCQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsWUFBWSxJQUFJLFlBQVksQ0FBQyxLQUFLLElBQUksK0JBQStCLEVBQUUsQ0FBQztZQUM1RyxDQUFDO1lBRUQsTUFBTSxPQUFPLEdBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQXlCO2lCQUNyRSxLQUFLLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMvRCxNQUFNLE9BQU8sR0FBVSxFQUFFLENBQUM7WUFDMUIsTUFBTSxPQUFPLEdBQVUsRUFBRSxDQUFDO1lBQzFCLEtBQUssTUFBTSxNQUFNLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQzNCLE1BQU0sUUFBUSxHQUFHLDBCQUEwQixDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDaEUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNaLE9BQU8sQ0FBQyxJQUFJLENBQUM7d0JBQ1QsTUFBTSxFQUFFLE1BQU0sQ0FBQyxZQUFZLElBQUksTUFBTSxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSTt3QkFDOUQsSUFBSSxFQUFFLE1BQU0sQ0FBQyxXQUFXO3dCQUN4QixNQUFNLEVBQUUsVUFBVTtxQkFDckIsQ0FBQyxDQUFDO29CQUNILFNBQVM7Z0JBQ2IsQ0FBQztnQkFDRCxJQUFJLFFBQVEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNyQyxPQUFPLENBQUMsSUFBSSxDQUFDO3dCQUNULE1BQU0sRUFBRSxNQUFNLENBQUMsWUFBWSxJQUFJLE1BQU0sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLElBQUk7d0JBQzlELElBQUksRUFBRSxNQUFNLENBQUMsV0FBVzt3QkFDeEIsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLO3dCQUNyQixNQUFNLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJO3dCQUMvQixNQUFNLEVBQUUsWUFBWTtxQkFDdkIsQ0FBQyxDQUFDO29CQUNILFNBQVM7Z0JBQ2IsQ0FBQztnQkFDRCxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDdkMsQ0FBQztZQUVELElBQUksUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNsQixNQUFNLE9BQU8sR0FBRztvQkFDWixPQUFPLEVBQUUsSUFBSTtvQkFDYixNQUFNLEVBQUUsSUFBSTtvQkFDWixRQUFRO29CQUNSLFFBQVEsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVE7b0JBQ3BDLFFBQVEsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVE7b0JBQ3BDLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtvQkFDbkIsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRO29CQUMzQixLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7b0JBQ3JCLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTTtvQkFDdkIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxNQUFNO29CQUN2QixPQUFPLEVBQUUsT0FBTyxDQUFDLE1BQU07b0JBQ3ZCLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUN6QixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJO3dCQUM3RSxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXO3dCQUM3QixLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLO3dCQUMxQixNQUFNLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNO3dCQUM1QixNQUFNLEVBQUUsdUJBQXVCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7cUJBQzNELENBQUMsQ0FBQztvQkFDSCxjQUFjLEVBQUUsT0FBTztpQkFDMUIsQ0FBQztnQkFDRixPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUM1RCxPQUFPLE9BQU8sQ0FBQztZQUNuQixDQUFDO1lBRUQsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN2QixPQUFPLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxFQUFFO29CQUMvQyxPQUFPLEVBQUUsT0FBTyxDQUFDLE1BQU07b0JBQ3ZCLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTTtvQkFDdkIsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRO2lCQUM5QixDQUFDLENBQUM7Z0JBQ0gsT0FBTztvQkFDSCxPQUFPLEVBQUUsS0FBSztvQkFDZCxLQUFLLEVBQUUsc0JBQXNCO29CQUM3QixRQUFRO29CQUNSLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTTtvQkFDdkIsT0FBTztpQkFDVixDQUFDO1lBQ04sQ0FBQztZQUVELE1BQU0sZUFBZSxHQUFHLE1BQU0sMkJBQTJCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDM0UsTUFBTSxVQUFVLEdBQUcsMkJBQTJCLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM3RSxNQUFNLE9BQU8sR0FBVSxFQUFFLENBQUM7WUFDMUIsTUFBTSxNQUFNLEdBQVUsRUFBRSxDQUFDO1lBQ3pCLEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxFQUFFLENBQUM7Z0JBQ3pCLE1BQU0sU0FBUyxHQUFHLHlCQUF5QixDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3ZFLE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLG9CQUFvQixFQUFFO29CQUNqRCxVQUFVLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJO29CQUM1QixJQUFJLEVBQUUsU0FBUztvQkFDZixNQUFNLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxNQUFNO29CQUN0QyxlQUFlLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxlQUFlO29CQUN4RCxLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7aUJBQ3hCLENBQUMsQ0FBQztnQkFDSCxNQUFNLE1BQU0sR0FBRztvQkFDWCxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJO29CQUM3RSxVQUFVLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJO29CQUM1QixJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXO29CQUM3QixLQUFLLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLO29CQUMxQixNQUFNLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNO29CQUM1QixNQUFNLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSTtvQkFDcEMsTUFBTSxFQUFFLE1BQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNO2lCQUN2RCxDQUFDO2dCQUNGLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxFQUFFLENBQUM7b0JBQ3JDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ3pCLENBQUM7cUJBQU0sQ0FBQztvQkFDSixNQUFNLENBQUMsSUFBSSxpQ0FDSixNQUFNLEtBQ1QsS0FBSyxFQUFFLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLDJCQUEyQixJQUM5RCxDQUFDO2dCQUNQLENBQUM7WUFDTCxDQUFDO1lBRUQsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNyQixNQUFNLG9CQUFvQixDQUFDO29CQUN2QixJQUFJLEVBQUU7d0JBQ0YsUUFBUSxFQUFFLFlBQVksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVE7d0JBQ2hELFFBQVEsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVE7d0JBQ3BDLFlBQVksRUFBRSxPQUFPLENBQUMsTUFBTTt3QkFDNUIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxNQUFNO3dCQUMxQixZQUFZLEVBQUUsT0FBTyxDQUFDLE1BQU07cUJBQy9CO2lCQUNKLENBQUMsQ0FBQztZQUNQLENBQUM7WUFFRCxlQUFlLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDMUMsZUFBZSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDOUUsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzlDLE1BQU0sT0FBTyxHQUFHO2dCQUNaLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUM7Z0JBQ2xELFFBQVE7Z0JBQ1IsUUFBUSxFQUFFLFlBQVksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVE7Z0JBQ2hELFFBQVEsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLFFBQVE7Z0JBQ3BDLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtnQkFDbkIsUUFBUSxFQUFFLFFBQVEsQ0FBQyxRQUFRO2dCQUMzQixLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7Z0JBQ3JCLFdBQVcsRUFBRSxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUs7Z0JBQ3BDLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTTtnQkFDdkIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxNQUFNO2dCQUN2QixPQUFPLEVBQUUsT0FBTyxDQUFDLE1BQU07Z0JBQ3ZCLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTTtnQkFDckIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxNQUFNO2dCQUN2QixjQUFjLEVBQUUsT0FBTztnQkFDdkIsYUFBYSxFQUFFLE1BQU07Z0JBQ3JCLGNBQWMsRUFBRSxPQUFPO2FBQzFCLENBQUM7WUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxFQUFFO2dCQUNwRCxJQUFJLEVBQUUsT0FBTyxDQUFDLFFBQVE7Z0JBQ3RCLFdBQVcsRUFBRSxPQUFPLENBQUMsV0FBVztnQkFDaEMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPO2dCQUN4QixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU87Z0JBQ3hCLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTztnQkFDeEIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO2dCQUN0QixPQUFPLEVBQUUsT0FBTyxDQUFDLE9BQU87Z0JBQ3hCLEdBQUcsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQ3BDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtvQkFDbkIsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO29CQUNmLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztvQkFDakIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO2lCQUN0QixDQUFDLENBQUM7YUFDTixDQUFDLENBQUM7WUFDSCxPQUFPLE9BQU8sQ0FBQztRQUNuQixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsOERBQThELEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLDRCQUE0QixDQUM5QixVQUFtQixFQUNuQixTQUFrQixFQUNsQixPQUF3RDtRQUV4RCxNQUFNLFVBQVUsR0FBRyxPQUFPLElBQUksT0FBTyxDQUFDLFVBQVUsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO1FBQzFFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsd0NBQXdDLENBQUMsQ0FBQztZQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUseUJBQXlCLEVBQUUsQ0FBQztRQUNoRSxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxVQUFVLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztZQUN0RixJQUFJLENBQUMsUUFBUTtnQkFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFFNUQsTUFBTSxZQUFZLEdBQUcsTUFBTSxTQUFTLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsWUFBWSxJQUFJLFlBQVksQ0FBQyxPQUFPLEtBQUssS0FBSyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsWUFBWSxJQUFJLFlBQVksQ0FBQyxLQUFLLElBQUksbUNBQW1DLEVBQUUsQ0FBQztZQUNoSCxDQUFDO1lBQ0QsTUFBTSxZQUFZLEdBQUcsWUFBWSxDQUFDLElBQXlCLENBQUM7WUFDNUQsTUFBTSxHQUFHLEdBQUcsSUFBQSxpQkFBWSxFQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM1QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBb0IsQ0FBQztZQUNoRCxNQUFNLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzVELE1BQU0sVUFBVSxHQUFHLDBCQUEwQixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JFLElBQUksUUFBUSxHQUFHLDRCQUE0QixDQUFDLFVBQVUsRUFBRSxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDakYsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUMxQixNQUFNLEdBQUcsR0FBRywyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN4RSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxJQUFJLEdBQUc7b0JBQUUsUUFBUSxHQUFHLEdBQUcsQ0FBQztZQUNoRCxDQUFDO1lBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNaLE9BQU8sQ0FBQyxJQUFJLENBQUMseUNBQXlDLEVBQUU7b0JBQ3BELE1BQU0sRUFBRSxZQUFZLENBQUMsU0FBUyxJQUFJLFlBQVksQ0FBQyxJQUFJO29CQUNuRCxTQUFTO29CQUNULFVBQVUsRUFBRSxVQUFVLENBQUMsTUFBTTtpQkFDaEMsQ0FBQyxDQUFDO2dCQUNILE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSw4QkFBOEIsRUFBRSxDQUFDO1lBQ3JFLENBQUM7WUFFRCxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2RCxNQUFNLE9BQU8sR0FBb0I7Z0JBQzdCLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDckIsSUFBSSxFQUFFLFdBQVcsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxXQUFXO2dCQUNsRCxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsTUFBTTtnQkFDL0IsSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLE1BQU0sRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLGVBQWUsRUFBRSxJQUFJLENBQUMsZUFBZTthQUN4QyxDQUFDO1lBQ0YsTUFBTSxxQ0FBcUMsRUFBRSxDQUFDO1lBQzlDLE1BQU0sZUFBZSxHQUFHLE1BQU0sMkJBQTJCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbkUsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsV0FBVyxrQ0FDbkMsZUFBZSxDQUFDLE9BQU8sS0FDMUIsVUFBVSxFQUNWLFlBQVksRUFBRSxPQUFPLElBQUksT0FBTyxPQUFPLENBQUMsWUFBWSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQzdGLGtCQUFrQixFQUFFO29CQUNoQixDQUFDLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPO29CQUM3QixDQUFDLEVBQUUsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPO2lCQUNoQyxJQUNILENBQUM7WUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLHVEQUF1RCxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBRTdFLElBQUksTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQ3JDLHVCQUF1QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDM0QsdUJBQXVCLEdBQUcsV0FBVyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDOUQsb0JBQW9CLEdBQUcsTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDakYsTUFBTSw2QkFBNkIsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDNUMsTUFBTSwyQkFBMkIsQ0FBQyxNQUFNLEVBQUUsZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUM7Z0JBQy9FLE1BQU0sb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkMsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDdEUsQ0FBQztZQUVELGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUMxQyxlQUFlLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM5RSxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDOUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4Q0FBOEMsRUFBRTtnQkFDeEQsTUFBTSxFQUFFLFlBQVksQ0FBQyxTQUFTLElBQUksWUFBWSxDQUFDLElBQUk7Z0JBQ25ELFNBQVMsRUFBRSxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUk7Z0JBQ2xDLEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSztnQkFDckIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNO2dCQUN2QixRQUFRLEVBQUUsTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRO2FBQzFELENBQUMsQ0FBQztZQUVILHVDQUNPLE1BQU0sS0FDVCxLQUFLLEVBQUU7b0JBQ0gsTUFBTSxFQUFFLFlBQVksQ0FBQyxTQUFTLElBQUksWUFBWSxDQUFDLElBQUk7b0JBQ25ELFNBQVMsRUFBRSxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUk7b0JBQ2xDLEtBQUssRUFBRSxRQUFRLENBQUMsS0FBSztvQkFDckIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNO2lCQUMxQixJQUNIO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLHVEQUF1RCxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxlQUFlO1FBQ2pCLE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBQSx3QkFBZSxFQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDcEQsSUFBSSxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDVCxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3pFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNENBQTRDLENBQUMsQ0FBQztRQUM5RCxDQUFDO2FBQU0sQ0FBQztZQUNKLE9BQU8sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzVELENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLGNBQWM7UUFDaEIsTUFBTSxJQUFBLHVCQUFjLEdBQUUsQ0FBQztRQUN2QixNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztJQUM3QyxDQUFDO0lBRUQsS0FBSyxDQUFDLDJCQUEyQjtRQUM3QixJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUMzQixPQUFPLENBQUMsSUFBSSxDQUFDLHNEQUFzRCxDQUFDLENBQUM7WUFDckUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLDRCQUE0QixFQUFFLENBQUM7UUFDbkUsQ0FBQztRQUNELE1BQU0sRUFBRSxHQUFHLElBQUEsMkJBQWtCLEVBQUMsdUJBQXVCLENBQUMsQ0FBQztRQUN2RCxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ0wsT0FBTyxDQUFDLEdBQUcsQ0FDUCw0QkFBNEIsdUJBQXVCLElBQUksT0FBTyw2QkFBNkIsQ0FDOUYsQ0FBQztZQUNGLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSx1QkFBdUIsRUFBRSxDQUFDO1FBQzVELENBQUM7UUFDRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsbUNBQW1DLEVBQUUsQ0FBQztJQUMxRSxDQUFDO0lBRUQsS0FBSyxDQUFDLHNCQUFzQjtRQUN4QixNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixFQUFFLENBQUM7UUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3BGLE1BQU0sUUFBUSxHQUFHLGdCQUFnQixJQUFJLG9CQUFvQixDQUFDO1FBQzFELE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDO1lBQ3ZDLENBQUMsQ0FBQyxRQUFRLGlCQUFpQixDQUFDLE1BQU0sTUFBTTtZQUN4QyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDdkYsSUFBSSxDQUFDO1lBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsb0JBQW9CLEVBQUU7Z0JBQ2pELFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDdkUsUUFBUSxFQUFFLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUTtnQkFDdEQsUUFBUSxFQUFFLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLHVCQUF1QjthQUNwRixDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzNFLE9BQU8sQ0FBQyxJQUFJLENBQUMsMkNBQTJDLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ2xFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSwyQkFBMkIsRUFBRSxDQUFDO1lBQzVGLENBQUM7WUFFRCxNQUFNLEVBQUUsR0FBRyxJQUFBLDJCQUFrQixFQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEQsSUFBSSxDQUFDLEVBQUU7Z0JBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLG1DQUFtQyxFQUFFLENBQUM7WUFFL0UsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQ1AsdUJBQXVCLE1BQU0sT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxPQUFPLDZCQUE2QixFQUM1RjtnQkFDSSxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNO2dCQUMxQixRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRO2dCQUM5QixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7Z0JBQ2xCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztnQkFDbEIsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO2dCQUN0QixNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU07Z0JBQ3BCLGFBQWEsRUFBRSxLQUFLLENBQUMsYUFBYTtnQkFDbEMsUUFBUSxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ2xGLENBQ0osQ0FBQztZQUNGLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSTtnQkFDdEIsUUFBUSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUTtnQkFDOUIsS0FBSzthQUNSLENBQUM7UUFDTixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsaURBQWlELEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLGVBQWU7UUFDakIsTUFBTSxNQUFNLEdBQUcsTUFBTSxlQUFPLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUN0RCxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkRBQTZELENBQUMsQ0FBQztRQUMvRSxDQUFDO1FBQ0QsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztJQUVELEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxVQUFtQjtRQUMxQyxNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixFQUFFLENBQUM7UUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3BGLE1BQU0sUUFBUSxHQUFHLGdCQUFnQixJQUFJLG9CQUFvQixDQUFDO1FBQzFELE1BQU0sTUFBTSxHQUFHLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDO1lBQ3ZDLENBQUMsQ0FBQyxRQUFRLGlCQUFpQixDQUFDLE1BQU0sTUFBTTtZQUN4QyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDdkYsSUFBSSxDQUFDO1lBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsb0JBQW9CLEVBQUU7Z0JBQ2pELFNBQVMsRUFBRSxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsU0FBUztnQkFDdkUsUUFBUSxFQUFFLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUTtnQkFDdEQsUUFBUSxFQUFFLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLHVCQUF1QjthQUNwRixDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQzNFLE9BQU8sQ0FBQyxJQUFJLENBQUMsK0NBQStDLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSwyQkFBMkIsRUFBRSxDQUFDO1lBQzVGLENBQUM7WUFFRCxNQUFNLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSx1QkFBdUIsSUFBSSxhQUFhLENBQUMsQ0FBQztZQUNuRyxJQUFJLFFBQVEsR0FBRyxVQUFVLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDakUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNaLE1BQU0sV0FBVyxHQUFJLE1BQWMsQ0FBQyxPQUFPLElBQUssTUFBYyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUM3RixNQUFNLFVBQVUsR0FBRyxJQUFBLFdBQUksRUFBQyxXQUFXLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBQ3BELElBQUEsY0FBUyxFQUFDLFVBQVUsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUMzQyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO29CQUNwQyxLQUFLLEVBQUUsV0FBVztvQkFDbEIsSUFBSSxFQUFFLElBQUEsV0FBSSxFQUFDLFVBQVUsRUFBRSxHQUFHLFVBQVUsT0FBTyxDQUFDO29CQUM1QyxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztvQkFDakQsTUFBTSxFQUFFLElBQUk7aUJBQ2YsQ0FBQyxDQUFDO2dCQUNILElBQUksTUFBTSxDQUFDLFFBQVEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDdEMsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDO2dCQUNqRCxDQUFDO2dCQUNELFFBQVEsR0FBRyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDcEQsQ0FBQztZQUVELElBQUEsY0FBUyxFQUFDLElBQUEsY0FBTyxFQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDbEQsSUFBQSxrQkFBYSxFQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNsRCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FDUCx1QkFBdUIsTUFBTSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLFVBQVUsbUJBQW1CLFFBQVEsRUFBRSxFQUM1RjtnQkFDSSxRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRO2dCQUM5QixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUs7Z0JBQ2xCLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSztnQkFDbEIsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO2dCQUN0QixNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU07Z0JBQ3BCLGFBQWEsRUFBRSxLQUFLLENBQUMsYUFBYTtnQkFDbEMsUUFBUSxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ2xGLENBQ0osQ0FBQztZQUNGLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsUUFBUTtnQkFDUixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJO2dCQUN0QixRQUFRLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRO2dCQUM5QixLQUFLO2FBQ1IsQ0FBQztRQUNOLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEQsQ0FBQztJQUNMLENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CO1FBQ3RCLE1BQU0sZ0JBQWdCLEdBQUcsbUJBQW1CLEVBQUUsQ0FBQztRQUMvQyxNQUFNLFFBQVEsR0FBRyxnQkFBZ0IsSUFBSSxvQkFBb0IsQ0FBQztRQUMxRCxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBRTlGLElBQUksQ0FBQztZQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLDJCQUEyQixFQUFFO2dCQUN4RCxRQUFRO2dCQUNSLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ2xELFVBQVUsRUFBRSx1QkFBdUIsSUFBSSxFQUFFO2FBQzVDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDM0UsT0FBTyxDQUFDLElBQUksQ0FBQyw2REFBNkQsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDcEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLGtDQUFrQyxFQUFFLENBQUM7WUFDbkcsQ0FBQztZQUVELE1BQU0saUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUMxQyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSx1QkFBdUIsSUFBSSxhQUFhLENBQUM7WUFDaEYsTUFBTSxLQUFLLEdBQUcsR0FBRyxnQkFBZ0IsSUFBSSxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO1lBQzVFLE1BQU0sSUFBSSxHQUFHLE1BQU0sdUJBQXVCLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEUsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDdEIsT0FBTyxDQUFDLElBQUksQ0FBQyxzREFBc0QsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7Z0JBQ2hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSwrQ0FBK0MsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUM3RixDQUFDO1lBRUQsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1lBQzdCLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FDUCx1QkFBdUIsTUFBTSxJQUFJLFVBQVUscUJBQXFCLEtBQUssRUFBRSxFQUN2RTtnQkFDSSxJQUFJLEVBQUUsbUJBQW1CO2dCQUN6QixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSztnQkFDbkQsT0FBTyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU87Z0JBQ3ZELE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNO2FBQ3hELENBQ0osQ0FBQztZQUNGLE9BQU87Z0JBQ0gsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsS0FBSztnQkFDTCxJQUFJLEVBQUUsbUJBQW1CO2dCQUN6QixJQUFJLEVBQUUsVUFBVTtnQkFDaEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSzthQUMzQixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLCtDQUErQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNsRCxDQUFDO0lBQ0wsQ0FBQztJQUVELEtBQUssQ0FBQyxxQkFBcUI7UUFDdkIsSUFBSSxDQUFDO1lBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSwyQkFBMkIsRUFBRSxDQUFDO1lBQ25ELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDVixPQUFPLENBQUMsSUFBSSxDQUFDLDJFQUEyRSxDQUFDLENBQUM7Z0JBQzFGLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxtQ0FBbUMsRUFBRSxDQUFDO1lBQzFFLENBQUM7WUFFRCxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRTtnQkFDcEQsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO2dCQUNqQixLQUFLLEVBQUUsTUFBTSxDQUFDLEtBQUs7Z0JBQ25CLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTthQUNwQixDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQ3RDLE9BQU8sQ0FBQyxJQUFJLENBQUMsc0NBQXNDLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSw4QkFBOEIsRUFBRSxDQUFDO1lBQy9GLENBQUM7WUFFRCxtQkFBbUIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ2xDLG9CQUFvQixHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUM7WUFDcEMsTUFBTSxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUVuQyxPQUFPLENBQUMsR0FBRyxDQUNQLHNDQUFzQyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQ3JELE1BQU0sQ0FBQyxJQUFJLENBQ2QsQ0FBQztZQUNGLE9BQU8sTUFBTSxDQUFDO1FBQ2xCLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEQsQ0FBQztJQUNMLENBQUM7Q0FDSixDQUFDO0FBRUY7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLElBQUk7SUFDdEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMscUJBQWEsRUFBRSxFQUFFLDZCQUE2QixDQUFDLENBQUM7SUFDakcsa0RBQWtEO0lBQ2xELElBQUksQ0FBQztRQUNELE1BQU0sT0FBTyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUNuRixJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1YsTUFBTSxHQUFHLEdBQUcsTUFBTSxJQUFBLHdCQUFlLEVBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUNwRCxJQUFJLEdBQUcsQ0FBQyxFQUFFO2dCQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0wsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7QUFDTCxDQUFDO0FBRUQ7OztHQUdHO0FBQ0ksS0FBSyxVQUFVLE1BQU07SUFDeEIsSUFBSSxJQUFBLDRCQUFtQixHQUFFO1FBQUUsTUFBTSxJQUFBLHVCQUFjLEdBQUUsQ0FBQztJQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7QUFDdkQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGVuIGZpZ21hLWltcG9ydGVyIGV4dGVuc2lvbiBtYWluLXByb2Nlc3MgZW50cnkuXG4gKiBAemggZmlnbWEtaW1wb3J0ZXIg5omp5bGV55qE5Li76L+b56iL5YWl5Y+j44CCXG4gKlxuICog5Li76L+b56iL6LeR5Zyo5pmu6YCaIE5vZGUg546v5aKD6YeMIOKAlOKAlCDov5nph4wgcmVxdWlyZSgnY2MnKSDmi7/kuI3liLDlvJXmk47nsbvjgIJcbiAqIOWHoeaYr+imgeW7uuiKgueCuS/mjILnu4Tku7bnmoTlvJXmk44gQVBJ77yM6YO95b+F6aG76YCa6L+HIGV4ZWN1dGUtc2NlbmUtc2NyaXB0XG4gKiDovazlj5HliLAgc2NlbmUudHMg6YeM5omn6KGM77yI6KeBIGNhbGxTY2VuZe+8ieOAglxuICovXG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgRmlnbWFFeHBvcnREYXRhLCBGaWdtYU5vZGVEYXRhLCBCVUlMRF9WRVJTSU9OIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQge1xuICAgIGxhbmRJbWFnZXMsXG4gICAgbGFuZE1hc2tJbWFnZXMsXG4gICAgU3ByaXRlRnJhbWVCb3JkZXIsXG4gICAgaGFzaEltYWdlQmFzZTY0LFxuICAgIHBpY2tBbnlUZXh0dXJlTWF0Y2gsXG4gICAgc2NhblByb2plY3RUZXh0dXJlSW5kZXgsXG4gICAgUGVuZGluZ1Nwcml0ZUZyYW1lLFxuICAgIGNyZWF0ZVBlbmRpbmdGaWdtYVNwcml0ZUZyYW1lLFxuICAgIHJlc29sdmVTcHJpdGVGcmFtZXNCZWZvcmVCdWlsZCxcbn0gZnJvbSAnLi9hc3NldHMnO1xuaW1wb3J0IHsgc3RhcnRQdXNoU2VydmVyLCBzdG9wUHVzaFNlcnZlciwgaXNQdXNoU2VydmVyUnVubmluZywgUHVzaE9wdGlvbnMsIHNldFBlbmRpbmdQdWxsSnNvbiB9IGZyb20gJy4vc2VydmVyJztcbmltcG9ydCB7IHNjYW5Gb250TGlicmFyeSwgbWF0Y2hGb250LCBleHBsYWluRm9udE1pc3MsIEZvbnRMaWJFbnRyeSwgRm9udERlbWFuZFRyYWNrZXIgfSBmcm9tICcuL2ZvbnRsaWInO1xuaW1wb3J0IHsgZXh0cmFjdFRleHRTdHlsZU1ldGEsIFRleHRTdHlsZVRyYWNrZXIgfSBmcm9tICcuL3RleHRzdHlsZSc7XG5pbXBvcnQgeyBjcm9wUG5nQmFzZTY0LCBkZWNvZGVQbmdQaXhlbHMsIGVuY29kZVBuZ1BpeGVscywgUG5nUGl4ZWxEYXRhIH0gZnJvbSAnLi9wbmdjcm9wJztcbmltcG9ydCB7XG4gICAgc2NhblRleHRTdHlsZUxpYnJhcnksXG4gICAgcmVzb2x2ZVRleHRTdHlsZVRlbXBsYXRlLFxuICAgIFRleHRTdHlsZUxpYnJhcnksXG4gICAgVGV4dFN0eWxlVGVtcGxhdGVUcmFja2VyLFxuICAgIFRFWFRfU1RZTEVfTElCX0RJUixcbn0gZnJvbSAnLi90ZXh0c3R5bGVsaWInO1xuaW1wb3J0IHsgZ2VuZXJhdGVUZXh0U3R5bGVMaWJyYXJ5RnJvbURhdGEgfSBmcm9tICcuL3RleHRzdHlsZWdlbic7XG5pbXBvcnQgeyB0cmFja0ltcG9ydCwgdHJhY2tJbXBvcnRGYWlsZWQgfSBmcm9tICcuL3RlbGVtZXRyeSc7XG5pbXBvcnQge1xuICAgIENvbXBvbmVudElkZW50aXR5LFxuICAgIENvbXBvbmVudE1hcHBpbmdEb2N1bWVudCxcbiAgICBDb21wb25lbnRNYXBwaW5nRW50cnksXG4gICAgYnVpbGRWYXJpYW50RmlsdGVyLFxuICAgIGNvbGxlY3RDb21wb25lbnRJZGVudGl0aWVzLFxuICAgIG5vcm1hbGl6ZU1hcHBpbmdEb2N1bWVudCxcbiAgICBub3JtYWxpemVDb21wb25lbnRQcm9wZXJ0aWVzLFxuICAgIHJlbW92ZU1hcHBpbmdFbnRyeSxcbiAgICB1cHNlcnRNYXBwaW5nRW50cnksXG59IGZyb20gJy4vY29tcG9uZW50LW1hcHBpbmcnO1xuaW1wb3J0IHtcbiAgICBDT01QT05FTlRfU1RBVEVfUlVOVElNRV9SRVZJU0lPTixcbiAgICBwbGFuQ29tcG9uZW50U3RhdGVSdW50aW1lUHJvdmlzaW9uLFxuICAgIHNob3VsZFdhaXRGb3JDb21wb25lbnRTdGF0ZVJ1bnRpbWUsXG59IGZyb20gJy4vY29tcG9uZW50LXN0YXRlLXJ1bnRpbWUnO1xuaW1wb3J0IHtcbiAgICBNYXBwZWRDb21wb25lbnRTdGF0ZVJlcXVlc3QsXG4gICAgZmluYWxpemVNYXBwZWRDb21wb25lbnRTdGF0ZXMsXG4gICAgbWVyZ2VNYXBwZWRDb21wb25lbnRTdGF0ZVJlcG9ydCxcbn0gZnJvbSAnLi9tYXBwZWQtY29tcG9uZW50LXN0YXRlJztcbmltcG9ydCB7XG4gICAgYmVnaW5Bc3NldERiU2Vzc2lvbixcbiAgICBlbmRBc3NldERiU2Vzc2lvbixcbiAgICByZXF1ZXN0QXNzZXREYixcbiAgICByZXRocm93SWZBc3NldERiVW5hdmFpbGFibGUsXG59IGZyb20gJy4vYXNzZXRkYic7XG5pbXBvcnQge1xuICAgIEN1cnJlbnRKc29uUGF0aENvb3JkaW5hdG9yLFxuICAgIG5vcm1hbGl6ZUN1cnJlbnRKc29uUGF0aCxcbiAgICByZWFkQ3VycmVudEpzb25QYXRoLFxuICAgIHdyaXRlQ3VycmVudEpzb25QYXRoLFxufSBmcm9tICcuL2pzb24td29ya3NwYWNlLXN0YXRlJztcbmltcG9ydCB7IHJlcG9ydE1hcHBpbmdEaWFnbm9zdGljcyB9IGZyb20gJy4vbWFwcGluZy1kaWFnbm9zdGljcyc7XG5pbXBvcnQgeyBhdmVyYWdlRmlnbWFDb2xvciB9IGZyb20gJy4vbWFwcGluZy1mYWxsYmFja3MnO1xuaW1wb3J0IHsgYWN0aXZhdGVDb2Nvc0VkaXRvckFwcGxpY2F0aW9uIH0gZnJvbSAnLi9lZGl0b3ItYWN0aXZhdGlvbic7XG5cbi8qKiBAemgg5p6E5bu654mI5pys5Y+357uf5LiA5ZyoIHR5cGVzLnRz77yIQlVJTERfVkVSU0lPTu+8ie+8jG1haW4vc2NlbmUg5YWx55So5ZCM5LiA5p2l5rqQ77yM5pS55LiA5aSE5Lik6L655ZCM5q2l44CCICovXG5cbi8qKiBAemgg5o6o6YCB5pyN5Yqh5byA5YWz55qE5oyB5LmF5YyWIGtlee+8iOWvuem9kCBVbml0eSBFZGl0b3JQcmVmcyDoh6rliqjnu63kuIrvvInjgIIgKi9cbmNvbnN0IFBVU0hfRU5BQkxFRF9LRVkgPSAnZmlnbWEtaW1wb3J0ZXIucHVzaFNlcnZlckVuYWJsZWQnO1xuLyoqIEB6aCDpgJrnlKjotYTmupDnm67lvZXvvIjlj4LkuI7lm77niYflg4/ntKDmr5Tlr7nlpI3nlKjvvInnmoTmjIHkuYXljJYga2V577yb5YC85Li6IGRiOi8vIOebruW9leWIl+ihqOOAgiAqL1xuY29uc3QgQ09NTU9OX0RJUlNfS0VZID0gJ2ZpZ21hLWltcG9ydGVyLmNvbW1vblJlc291cmNlRGlycyc7XG5jb25zdCBERUZBVUxUX0NPTU1PTl9ESVJTID0gWydkYjovL2Fzc2V0cyddO1xuXG4vKiogQHpoIOivu+mAmueUqOi1hOa6kOebruW9lemFjee9ru+8m+epui/lpLHotKXlm57pgIDpu5jorqTlhaggYXNzZXRz77yM5L+d6K+B5LiN5Zue5b2S44CCICovXG5hc3luYyBmdW5jdGlvbiByZWFkQ29tbW9uUmVzb3VyY2VEaXJzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByYXcgPSBhd2FpdCBFZGl0b3IuUHJvZmlsZS5nZXRDb25maWcoJ2ZpZ21hLWltcG9ydGVyJywgQ09NTU9OX0RJUlNfS0VZKTtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmF3KSkge1xuICAgICAgICAgICAgY29uc3QgZGlycyA9IHJhdy5tYXAoKGQpID0+IFN0cmluZyhkIHx8ICcnKS50cmltKCkpLmZpbHRlcigoZCkgPT4gZC5zdGFydHNXaXRoKCdkYjovLycpKTtcbiAgICAgICAgICAgIGlmIChkaXJzLmxlbmd0aCA+IDApIHJldHVybiBkaXJzO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDor7vlj5bpgJrnlKjotYTmupDnm67lvZXphY3nva7lpLHotKXvvIzlm57pgIDpu5jorqTvvJonLCBlcnIpO1xuICAgIH1cbiAgICByZXR1cm4gREVGQVVMVF9DT01NT05fRElSUy5zbGljZSgpO1xufVxuXG5jb25zdCBGSUdNQV9QUkVGQUJfRElSID0gJ2RiOi8vYXNzZXRzL2ZpZ21hLXByZWZhYnMnO1xuY29uc3QgQ09NUE9ORU5UX01BUFBJTkdfRElSID0gJ2RiOi8vYXNzZXRzL0ZpZ21hSW1wb3J0ZXJEYXRhJztcbmNvbnN0IENPTVBPTkVOVF9NQVBQSU5HX0RCX1VSTCA9IGAke0NPTVBPTkVOVF9NQVBQSU5HX0RJUn0vY29tcG9uZW50LW1hcHBpbmdzLmpzb25gO1xuY29uc3QgQ09NUE9ORU5UX1NUQVRFX1JVTlRJTUVfRElSID0gYCR7Q09NUE9ORU5UX01BUFBJTkdfRElSfS9ydW50aW1lYDtcbmNvbnN0IENPTVBPTkVOVF9TVEFURV9SVU5USU1FX0RCX1VSTCA9IGAke0NPTVBPTkVOVF9TVEFURV9SVU5USU1FX0RJUn0vRmlnbWFDb21wb25lbnRTdGF0ZS50c2A7XG5jb25zdCBDT01QT05FTlRfU1RBVEVfUlVOVElNRV9DTEFTUyA9ICdGaWdtYUNvbXBvbmVudFN0YXRlJztcbmxldCBjb21wb25lbnRTdGF0ZVJ1bnRpbWVSZWFkeSA9IGZhbHNlO1xubGV0IGNvbXBvbmVudFN0YXRlUnVudGltZVByb21pc2U6IFByb21pc2U8Ym9vbGVhbj4gfCBudWxsID0gbnVsbDtcbmxldCBjb21wb25lbnRNYXBwaW5nTXV0YXRpb25RdWV1ZTogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuY29uc3QgY3VycmVudEpzb25QYXRoQ29vcmRpbmF0b3IgPSBuZXcgQ3VycmVudEpzb25QYXRoQ29vcmRpbmF0b3IoKTtcblxuLyoqIEB6aCBiZXRhIOWbnua1geWNj+iurumqjOivgemdou+8muiusOW9leacgOi/keS4gOasoeaIkOWKn+WvvOWFpeeahOWOn+WniyBKU09O77yM5L6bIEZpZ21hIOaPkuS7tiAvcHVsbCDmi4nlj5bjgIIgKi9cbmxldCBsYXN0SW1wb3J0ZWRKc29uRm9yUHVsbCA9ICcnO1xubGV0IGxhc3RJbXBvcnRlZE5hbWVGb3JQdWxsID0gJyc7XG5sZXQgbGFzdEltcG9ydGVkUm9vdFV1aWQgPSAnJztcbmxldCBsYXN0U2F2ZWRQcmVmYWJEYlVybCA9ICcnO1xubGV0IGxhc3RTYXZlZFByZWZhYlV1aWQgPSAnJztcbmxldCBsYXN0Q29tcG9uZW50SWRlbnRpdGllczogQ29tcG9uZW50SWRlbnRpdHlbXSA9IFtdO1xuXG4vKipcbiAqIEBlbiBGb3J3YXJkIGEgY2FsbCBpbnRvIHRoZSBzY2VuZSBzY3JpcHQgKHRoZSBvbmx5IHBsYWNlIGNjLiogaXMgYXZhaWxhYmxlKS5cbiAqIEB6aCDmiorkuIDmrKHosIPnlKjovazlj5Hov5sgc2NlbmUg6ISa5pys77yI5ZSv5LiA6IO955SoIGNjLiog55qE5Zyw5pa577yJ44CCXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNhbGxTY2VuZShtZXRob2Q6IHN0cmluZywgLi4uYXJnczogYW55W10pOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdleGVjdXRlLXNjZW5lLXNjcmlwdCcsIHtcbiAgICAgICAgbmFtZTogJ2ZpZ21hLWltcG9ydGVyJyxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBhcmdzLFxuICAgIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRTZWxlY3RlZFNjZW5lQ29tcG9uZW50SWRlbnRpdHkoKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBub2RlVXVpZCA9IGdldFNlbGVjdGVkTm9kZVV1aWQoKTtcbiAgICBpZiAoIW5vZGVVdWlkKSByZXR1cm4geyBzdGF0dXM6ICdub25lJywgcmVhc29uOiAnbm8tc2VsZWN0aW9uJywgbm9kZVV1aWQ6ICcnIH07XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdkZXNjcmliZUNvbXBvbmVudE1hcHBpbmdTZWxlY3Rpb24nLCBub2RlVXVpZCk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN1Y2Nlc3MgIT09IGZhbHNlICYmIHJlc3VsdC5kYXRhKSByZXR1cm4gcmVzdWx0LmRhdGE7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdGF0dXM6ICdub3QtY29tcG9uZW50JyxcbiAgICAgICAgICAgIHJlYXNvbjogJ3NjZW5lLXF1ZXJ5LWZhaWxlZCcsXG4gICAgICAgICAgICBub2RlVXVpZCxcbiAgICAgICAgICAgIGVycm9yOiBTdHJpbmcocmVzdWx0ICYmIHJlc3VsdC5lcnJvciB8fCAnVW5rbm93biBzY2VuZSBxdWVyeSBlcnJvcicpLFxuICAgICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXR1czogJ25vdC1jb21wb25lbnQnLFxuICAgICAgICAgICAgcmVhc29uOiAnc2NlbmUtcXVlcnktZmFpbGVkJyxcbiAgICAgICAgICAgIG5vZGVVdWlkLFxuICAgICAgICAgICAgZXJyb3I6IFN0cmluZyhlcnJvciAmJiBlcnJvci5tZXNzYWdlIHx8IGVycm9yIHx8ICdVbmtub3duIHNjZW5lIHF1ZXJ5IGVycm9yJyksXG4gICAgICAgIH07XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBmaW5hbGl6ZUNvbXBvbmVudFN0YXRlVGFyZ2V0cyhyZXN1bHQ6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHN0YXRzID0gcmVzdWx0ICYmIHJlc3VsdC5kYXRhID8gcmVzdWx0LmRhdGEgOiBudWxsO1xuICAgIGNvbnN0IHJlcXVlc3RzOiBNYXBwZWRDb21wb25lbnRTdGF0ZVJlcXVlc3RbXSA9IHN0YXRzICYmIEFycmF5LmlzQXJyYXkoc3RhdHMucGVuZGluZ0NvbXBvbmVudFN0YXRlcylcbiAgICAgICAgPyBzdGF0cy5wZW5kaW5nQ29tcG9uZW50U3RhdGVzXG4gICAgICAgIDogc3RhdHMgJiYgQXJyYXkuaXNBcnJheShzdGF0cy5wZW5kaW5nTWFwcGVkQ29tcG9uZW50U3RhdGVzKVxuICAgICAgICAgICAgPyBzdGF0cy5wZW5kaW5nTWFwcGVkQ29tcG9uZW50U3RhdGVzXG4gICAgICAgIDogW107XG4gICAgaWYgKHJlcXVlc3RzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuXG4gICAgY29uc3QgcmVwb3J0ID0gYXdhaXQgZmluYWxpemVNYXBwZWRDb21wb25lbnRTdGF0ZXMocmVxdWVzdHMsIHtcbiAgICAgICAgY3JlYXRlQ29tcG9uZW50OiBhc3luYyAobm9kZVV1aWQsIGNvbXBvbmVudE5hbWUpID0+IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAnc2NlbmUnLFxuICAgICAgICAgICAgJ2NyZWF0ZS1jb21wb25lbnQnLFxuICAgICAgICAgICAgeyB1dWlkOiBub2RlVXVpZCwgY29tcG9uZW50OiBjb21wb25lbnROYW1lIH0sXG4gICAgICAgICksXG4gICAgICAgIGFwcGx5U3RhdGVzOiBhc3luYyAoaXRlbXMpID0+IGF3YWl0IGNhbGxTY2VuZSgnYXBwbHlDb21wb25lbnRTdGF0ZXMnLCBpdGVtcyksXG4gICAgICAgIHJlc3RvcmVBY3Rpdml0eTogYXN5bmMgKGl0ZW1zKSA9PiBhd2FpdCBjYWxsU2NlbmUoJ3Jlc3RvcmVDb21wb25lbnRTdGF0ZUFjdGl2aXR5JywgaXRlbXMpLFxuICAgIH0pO1xuICAgIG1lcmdlTWFwcGVkQ29tcG9uZW50U3RhdGVSZXBvcnQoc3RhdHMsIHJlcG9ydCk7XG5cbiAgICBpZiAocmVwb3J0LmNyZWF0ZUZhaWx1cmVzLmxlbmd0aCA+IDAgfHwgcmVwb3J0LnVuYXZhaWxhYmxlID4gMCB8fCByZXBvcnQub3ZlcnJpZGVNaXNzaW5nID4gMCkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAnW2ZpZ21hLWltcG9ydGVyXSBGaWdtYUNvbXBvbmVudFN0YXRlIOacquWujOaVtOeZu+iusO+8micsXG4gICAgICAgICAgICByZXBvcnQsXG4gICAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSBGaWdtYUNvbXBvbmVudFN0YXRlIOW3sueZu+iusCAke3JlcG9ydC5hdHRhY2hlZH0vJHtyZXBvcnQudG90YWx9YCArXG4gICAgICAgICAgICBg77yIUHJlZmFiIG92ZXJyaWRlICR7cmVwb3J0Lm1vdW50ZWR9LyR7cmVwb3J0Lm92ZXJyaWRlVG90YWx977yJ44CCYCxcbiAgICAgICAgKTtcbiAgICB9XG59XG5cbi8qKiBAZGVwcmVjYXRlZCBDb21wYXRpYmlsaXR5IG5hbWUgZm9yIGNhbGxlcnMvdGVzdHMgZnJvbSB0aGUgbWFwcGVkLW9ubHkgcGhhc2UuICovXG5jb25zdCBhdHRhY2hNYXBwZWRDb21wb25lbnRTdGF0ZU92ZXJyaWRlcyA9IGZpbmFsaXplQ29tcG9uZW50U3RhdGVUYXJnZXRzO1xuXG5mdW5jdGlvbiBnZXRTZWxlY3RlZE5vZGVVdWlkKCk6IHN0cmluZyB7XG4gICAgY29uc3Qgc2VsZWN0ZWQgPSBnZXRTZWxlY3RlZE5vZGVVdWlkcygpO1xuICAgIHJldHVybiBzZWxlY3RlZC5sZW5ndGggPiAwID8gc2VsZWN0ZWRbMF0gOiAnJztcbn1cblxuZnVuY3Rpb24gZ2V0U2VsZWN0ZWROb2RlVXVpZHMoKTogc3RyaW5nW10ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNlbGVjdGlvbiA9IChFZGl0b3IgYXMgYW55KS5TZWxlY3Rpb247XG4gICAgICAgIGlmICghc2VsZWN0aW9uIHx8IHR5cGVvZiBzZWxlY3Rpb24uZ2V0U2VsZWN0ZWQgIT09ICdmdW5jdGlvbicpIHJldHVybiBbXTtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3Rpb24uZ2V0U2VsZWN0ZWQoJ25vZGUnKTtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoc2VsZWN0ZWQpKSByZXR1cm4gc2VsZWN0ZWQubWFwKChpdGVtOiBhbnkpID0+IFN0cmluZyhpdGVtIHx8ICcnKSkuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICBpZiAodHlwZW9mIHNlbGVjdGVkID09PSAnc3RyaW5nJyAmJiBzZWxlY3RlZCkgcmV0dXJuIFtzZWxlY3RlZF07XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gICAgcmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBnZXRTZWxlY3RlZEFzc2V0VXVpZHMoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IG5vcm1hbGl6ZSA9ICh2YWx1ZTogYW55KTogc3RyaW5nW10gPT4ge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHJldHVybiB2YWx1ZS5tYXAoKGl0ZW06IGFueSkgPT4gU3RyaW5nKGl0ZW0gfHwgJycpKS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHZhbHVlKSByZXR1cm4gW3ZhbHVlXTtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH07XG5cbiAgICBjb25zdCBzZWxlY3Rpb24gPSAoRWRpdG9yIGFzIGFueSkuU2VsZWN0aW9uO1xuICAgIGlmICghc2VsZWN0aW9uKSByZXR1cm4gW107XG5cbiAgICBpZiAodHlwZW9mIHNlbGVjdGlvbi5nZXRTZWxlY3RlZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWQgPSBub3JtYWxpemUoc2VsZWN0aW9uLmdldFNlbGVjdGVkKCdhc3NldCcpKTtcbiAgICAgICAgICAgIGlmIChzZWxlY3RlZC5sZW5ndGggPiAwKSByZXR1cm4gc2VsZWN0ZWQ7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gQ3JlYXRvciB2ZXJzaW9ucyBkaWZmZXIgaGVyZTsgdGhlIHR5cGVkIGxhc3Qtc2VsZWN0aW9uIEFQSSBpcyB0aGUgZmFsbGJhY2sgYmVsb3cuXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHNlbGVjdGlvbi5nZXRMYXN0U2VsZWN0ZWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxpemUoc2VsZWN0aW9uLmdldExhc3RTZWxlY3RlZCgnYXNzZXQnKSk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8gU2VsZWN0aW9uIGlzIGVkaXRvci1vbmx5IHN1Z2FyOyBhYnNlbmNlIHNob3VsZCBub3QgYnJlYWsgbWVudSBhY3Rpb25zLlxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBbXTtcbn1cblxuZnVuY3Rpb24gc2FmZUFzc2V0RmlsZU5hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBzYWZlID0gKG5hbWUgfHwgJ3VudGl0bGVkJykucmVwbGFjZSgvW15cXHfkuIAt6b6lLV0vZywgJ18nKS5yZXBsYWNlKC9eXyt8XyskL2csICcnKTtcbiAgICByZXR1cm4gc2FmZSB8fCAndW50aXRsZWQnO1xufVxuXG5mdW5jdGlvbiBzdGFnZVB1c2hlZEpzb25Gb3JXb3JrYmVuY2goanNvbjogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHByb2plY3RQYXRoID0gU3RyaW5nKChFZGl0b3IgYXMgYW55KS5Qcm9qZWN0ICYmIChFZGl0b3IgYXMgYW55KS5Qcm9qZWN0LnBhdGggfHwgJycpLnRyaW0oKTtcbiAgICBpZiAoIXByb2plY3RQYXRoKSB0aHJvdyBuZXcgRXJyb3IoJ0NyZWF0b3IgcHJvamVjdCBwYXRoIGlzIHVuYXZhaWxhYmxlJyk7XG4gICAgY29uc3QgZGlyID0gam9pbihwcm9qZWN0UGF0aCwgJ3RlbXAnLCAnZmlnbWEtaW1wb3J0LXdvcmtiZW5jaCcpO1xuICAgIG1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIGNvbnN0IGZpbGVOYW1lID0gYCR7c2FmZUFzc2V0RmlsZU5hbWUobmFtZSB8fCAncHVzaGVkJyl9LSR7aGFzaFRleHQoanNvbil9Lmpzb25gO1xuICAgIGNvbnN0IGZpbGVQYXRoID0gam9pbihkaXIsIGZpbGVOYW1lKTtcbiAgICB3cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBqc29uLCAndXRmOCcpO1xuICAgIHJldHVybiBmaWxlUGF0aDtcbn1cblxuZnVuY3Rpb24gZW5zdXJlSnNvbkV4dGVuc2lvbihmaWxlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gL1xcLmpzb24kL2kudGVzdChmaWxlUGF0aCkgPyBmaWxlUGF0aCA6IGAke2ZpbGVQYXRofS5qc29uYDtcbn1cblxuZnVuY3Rpb24gZGJVcmxUb1Byb2plY3RQYXRoKGRiVXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHByb2plY3RQYXRoID0gKEVkaXRvciBhcyBhbnkpLlByb2plY3QgJiYgKEVkaXRvciBhcyBhbnkpLlByb2plY3QucGF0aDtcbiAgICBpZiAoIXByb2plY3RQYXRoIHx8ICFkYlVybC5zdGFydHNXaXRoKCdkYjovL2Fzc2V0cy8nKSkgcmV0dXJuICcnO1xuICAgIHJldHVybiBqb2luKHByb2plY3RQYXRoLCAnYXNzZXRzJywgZGJVcmwuc2xpY2UoJ2RiOi8vYXNzZXRzLycubGVuZ3RoKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZUFzc2V0Rm9sZGVyKHVybDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZGlza1BhdGggPSBkYlVybFRvUHJvamVjdFBhdGgodXJsKTtcbiAgICBpZiAoIWRpc2tQYXRoKSB0aHJvdyBuZXcgRXJyb3IoYFtmaWdtYS1pbXBvcnRlcl0g5peg5rOV5oqK6LWE5rqQ55uu5b2V5pig5bCE5Yiw5bel56iL56OB55uY77yaJHt1cmx9YCk7XG4gICAgbWtkaXJTeW5jKGRpc2tQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcXVlcnlBc3NldEluZm8oa2V5OiBzdHJpbmcpOiBQcm9taXNlPGFueSB8IG51bGw+IHtcbiAgICBpZiAoIWtleSkgcmV0dXJuIG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW5mbyA9IGF3YWl0IHJlcXVlc3RBc3NldERiKCdxdWVyeS1hc3NldC1pbmZvJywga2V5LCBba2V5XSk7XG4gICAgICAgIHJldHVybiBpbmZvIHx8IG51bGw7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJldGhyb3dJZkFzc2V0RGJVbmF2YWlsYWJsZShlcnIpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFzc2V0SW5mb1VybChpbmZvOiBhbnkpOiBzdHJpbmcge1xuICAgIHJldHVybiBTdHJpbmcoaW5mbyAmJiAoaW5mby51cmwgfHwgaW5mby5zb3VyY2UgfHwgaW5mby5wYXRoIHx8ICcnKSB8fCAnJyk7XG59XG5cbmZ1bmN0aW9uIGlzUHJlZmFiQXNzZXRJbmZvKGluZm86IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghaW5mbykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHVybCA9IGFzc2V0SW5mb1VybChpbmZvKTtcbiAgICBjb25zdCB0eXBlID0gU3RyaW5nKGluZm8udHlwZSB8fCBpbmZvLmltcG9ydGVyIHx8ICcnKTtcbiAgICByZXR1cm4gL1xcLnByZWZhYiQvaS50ZXN0KHVybCkgfHwgL3ByZWZhYi9pLnRlc3QodHlwZSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFNlbGVjdGVkUHJlZmFiQXNzZXRJbmZvKCk6IFByb21pc2U8YW55IHwgbnVsbD4ge1xuICAgIGZvciAoY29uc3QgdXVpZCBvZiBnZXRTZWxlY3RlZEFzc2V0VXVpZHMoKSkge1xuICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgcXVlcnlBc3NldEluZm8odXVpZCk7XG4gICAgICAgIGlmIChpc1ByZWZhYkFzc2V0SW5mbyhpbmZvKSkgcmV0dXJuIGluZm87XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlQ29tcG9uZW50TWFwcGluZ1ByZWZhYkFzc2V0SW5mbyhcbiAgICBwYXlsb2FkPzogUGFydGlhbDxDb21wb25lbnRNYXBwaW5nRW50cnk+XG4pOiBQcm9taXNlPHsgaW5mbzogYW55IHwgbnVsbDsgc291cmNlOiAnZXhwbGljaXQnIHwgJ3Byb2plY3Qtc2VsZWN0aW9uJyB9PiB7XG4gICAgY29uc3QgaGFzRXhwbGljaXRMb2NhdG9yID0gISFwYXlsb2FkICYmIChcbiAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBheWxvYWQsICdwcmVmYWJVdWlkJykgfHxcbiAgICAgICAgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBheWxvYWQsICdwcmVmYWJVcmwnKVxuICAgICk7XG4gICAgY29uc3QgZXhwbGljaXRLZXlzID0gW1xuICAgICAgICBTdHJpbmcocGF5bG9hZCAmJiBwYXlsb2FkLnByZWZhYlV1aWQgfHwgJycpLnRyaW0oKSxcbiAgICAgICAgU3RyaW5nKHBheWxvYWQgJiYgcGF5bG9hZC5wcmVmYWJVcmwgfHwgJycpLnRyaW0oKSxcbiAgICBdLmZpbHRlcigoa2V5LCBpbmRleCwga2V5cykgPT4gISFrZXkgJiYga2V5cy5pbmRleE9mKGtleSkgPT09IGluZGV4KTtcblxuICAgIGlmIChoYXNFeHBsaWNpdExvY2F0b3IpIHtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgZXhwbGljaXRLZXlzKSB7XG4gICAgICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgcXVlcnlBc3NldEluZm8oa2V5KTtcbiAgICAgICAgICAgIGlmIChpc1ByZWZhYkFzc2V0SW5mbyhpbmZvKSAmJiBpbmZvLnV1aWQpIHJldHVybiB7IGluZm8sIHNvdXJjZTogJ2V4cGxpY2l0JyB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IGluZm86IG51bGwsIHNvdXJjZTogJ2V4cGxpY2l0JyB9O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGluZm86IGF3YWl0IGdldFNlbGVjdGVkUHJlZmFiQXNzZXRJbmZvKCksXG4gICAgICAgIHNvdXJjZTogJ3Byb2plY3Qtc2VsZWN0aW9uJyxcbiAgICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB3cml0ZVRleHRBc3NldFZpYUltcG9ydChkYlVybDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPGFueSB8IG51bGw+IHtcbiAgICBjb25zdCBwcm9qZWN0UGF0aCA9IChFZGl0b3IgYXMgYW55KS5Qcm9qZWN0ICYmIChFZGl0b3IgYXMgYW55KS5Qcm9qZWN0LnBhdGg7XG4gICAgaWYgKCFwcm9qZWN0UGF0aCkgdGhyb3cgbmV3IEVycm9yKCdFZGl0b3IuUHJvamVjdC5wYXRoIGlzIHVuYXZhaWxhYmxlJyk7XG4gICAgY29uc3QgdGVtcERpciA9IGpvaW4ocHJvamVjdFBhdGgsICd0ZW1wJywgJ2ZpZ21hLWltcG9ydGVyJyk7XG4gICAgbWtkaXJTeW5jKHRlbXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIGNvbnN0IGV4dE1hdGNoID0gZGJVcmwubWF0Y2goL1xcLihbYS16MC05XSspJC9pKTtcbiAgICBjb25zdCBleHQgPSBleHRNYXRjaCA/IGAuJHtleHRNYXRjaFsxXX1gIDogJy50eHQnO1xuICAgIGNvbnN0IHRtcEZpbGUgPSBqb2luKHRlbXBEaXIsIGBhc3NldC0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygxNikuc2xpY2UoMil9JHtleHR9YCk7XG4gICAgd3JpdGVGaWxlU3luYyh0bXBGaWxlLCBjb250ZW50LCAndXRmOCcpO1xuICAgIGF3YWl0IHJlcXVlc3RBc3NldERiKCdpbXBvcnQtYXNzZXQnLCBkYlVybCwgW3RtcEZpbGUsIGRiVXJsLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9XSk7XG4gICAgYXdhaXQgZGVsYXkoMzAwKTtcbiAgICByZXR1cm4gYXdhaXQgcXVlcnlBc3NldEluZm8oZGJVcmwpO1xufVxuXG5mdW5jdGlvbiBlbXB0eUNvbXBvbmVudE1hcHBpbmdEb2N1bWVudCgpOiBDb21wb25lbnRNYXBwaW5nRG9jdW1lbnQge1xuICAgIHJldHVybiB7IHZlcnNpb246IDEsIHVwZGF0ZWRBdDogJycsIGVudHJpZXM6IFtdIH07XG59XG5cbmZ1bmN0aW9uIHJlYWRDb21wb25lbnRNYXBwaW5nRG9jdW1lbnQoKTogQ29tcG9uZW50TWFwcGluZ0RvY3VtZW50IHtcbiAgICBjb25zdCBmaWxlUGF0aCA9IGRiVXJsVG9Qcm9qZWN0UGF0aChDT01QT05FTlRfTUFQUElOR19EQl9VUkwpO1xuICAgIGlmICghZmlsZVBhdGggfHwgIWV4aXN0c1N5bmMoZmlsZVBhdGgpKSByZXR1cm4gZW1wdHlDb21wb25lbnRNYXBwaW5nRG9jdW1lbnQoKTtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gbm9ybWFsaXplTWFwcGluZ0RvY3VtZW50KEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmOCcpKSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDnu4Tku7bmmKDlsITooajor7vlj5blpLHotKXvvIzmnKzmrKHmjInnqbrooajlpITnkIbvvJonLCBmaWxlUGF0aCwgZXJyKTtcbiAgICAgICAgcmV0dXJuIGVtcHR5Q29tcG9uZW50TWFwcGluZ0RvY3VtZW50KCk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzYXZlQ29tcG9uZW50TWFwcGluZ0RvY3VtZW50KGRvY3VtZW50OiBDb21wb25lbnRNYXBwaW5nRG9jdW1lbnQpOiBQcm9taXNlPENvbXBvbmVudE1hcHBpbmdEb2N1bWVudD4ge1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVNYXBwaW5nRG9jdW1lbnQoZG9jdW1lbnQpO1xuICAgIG5vcm1hbGl6ZWQudXBkYXRlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgIGF3YWl0IGVuc3VyZUFzc2V0Rm9sZGVyKENPTVBPTkVOVF9NQVBQSU5HX0RJUik7XG4gICAgYXdhaXQgd3JpdGVUZXh0QXNzZXRWaWFJbXBvcnQoQ09NUE9ORU5UX01BUFBJTkdfREJfVVJMLCBKU09OLnN0cmluZ2lmeShub3JtYWxpemVkLCBudWxsLCAyKSk7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZWQ7XG59XG5cbmZ1bmN0aW9uIG11dGF0ZUNvbXBvbmVudE1hcHBpbmdEb2N1bWVudChcbiAgICBtdXRhdGU6IChkb2N1bWVudDogQ29tcG9uZW50TWFwcGluZ0RvY3VtZW50KSA9PiBDb21wb25lbnRNYXBwaW5nRG9jdW1lbnRcbik6IFByb21pc2U8Q29tcG9uZW50TWFwcGluZ0RvY3VtZW50PiB7XG4gICAgY29uc3Qgb3BlcmF0aW9uID0gY29tcG9uZW50TWFwcGluZ011dGF0aW9uUXVldWUudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGRvY3VtZW50ID0gbXV0YXRlKHJlYWRDb21wb25lbnRNYXBwaW5nRG9jdW1lbnQoKSk7XG4gICAgICAgIHJldHVybiBhd2FpdCBzYXZlQ29tcG9uZW50TWFwcGluZ0RvY3VtZW50KGRvY3VtZW50KTtcbiAgICB9KTtcbiAgICBjb21wb25lbnRNYXBwaW5nTXV0YXRpb25RdWV1ZSA9IG9wZXJhdGlvbi50aGVuKCgpID0+IHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkKTtcbiAgICByZXR1cm4gb3BlcmF0aW9uO1xufVxuXG5hc3luYyBmdW5jdGlvbiBxdWVyeUNvbXBvbmVudFN0YXRlUnVudGltZVJlYWR5KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlZ2lzdGVyZWQgPSAhIWF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAnc2NlbmUnLFxuICAgICAgICAgICAgJ3F1ZXJ5LWNvbXBvbmVudC1oYXMtc2NyaXB0JyxcbiAgICAgICAgICAgIENPTVBPTkVOVF9TVEFURV9SVU5USU1FX0NMQVNTXG4gICAgICAgICk7XG4gICAgICAgIGlmICghcmVnaXN0ZXJlZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjYWxsU2NlbmUoJ2dldENvbXBvbmVudFN0YXRlUnVudGltZVJldmlzaW9uJyk7XG4gICAgICAgIHJldHVybiAhIShcbiAgICAgICAgICAgIHJlc3VsdCAmJlxuICAgICAgICAgICAgcmVzdWx0LnN1Y2Nlc3MgIT09IGZhbHNlICYmXG4gICAgICAgICAgICByZXN1bHQuZGF0YSAmJlxuICAgICAgICAgICAgcmVzdWx0LmRhdGEucmV2aXNpb24gPT09IENPTVBPTkVOVF9TVEFURV9SVU5USU1FX1JFVklTSU9OXG4gICAgICAgICk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByb3Zpc2lvbkNvbXBvbmVudFN0YXRlUnVudGltZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCB0ZW1wbGF0ZVBhdGggPSBqb2luKF9fZGlybmFtZSwgJy4uJywgJ3N0YXRpYycsICdGaWdtYUNvbXBvbmVudFN0YXRlLnRzJyk7XG4gICAgaWYgKCFleGlzdHNTeW5jKHRlbXBsYXRlUGF0aCkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOe8uuWwkSBGaWdtYUNvbXBvbmVudFN0YXRlIHJ1bnRpbWUg5qih5p2/77yaJywgdGVtcGxhdGVQYXRoKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCB0ZW1wbGF0ZSA9IHJlYWRGaWxlU3luYyh0ZW1wbGF0ZVBhdGgsICd1dGY4Jyk7XG4gICAgY29uc3QgdGFyZ2V0UGF0aCA9IGRiVXJsVG9Qcm9qZWN0UGF0aChDT01QT05FTlRfU1RBVEVfUlVOVElNRV9EQl9VUkwpO1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGFyZ2V0UGF0aCAmJiBleGlzdHNTeW5jKHRhcmdldFBhdGgpID8gcmVhZEZpbGVTeW5jKHRhcmdldFBhdGgsICd1dGY4JykgOiAnJztcbiAgICBjb25zdCBjbGFzc1JlZ2lzdGVyZWQgPSBhd2FpdCBxdWVyeUNvbXBvbmVudFN0YXRlUnVudGltZVJlYWR5KCk7XG4gICAgY29uc3QgYWN0aW9uID0gcGxhbkNvbXBvbmVudFN0YXRlUnVudGltZVByb3Zpc2lvbihleGlzdGluZywgdGVtcGxhdGUsIGNsYXNzUmVnaXN0ZXJlZCk7XG5cbiAgICBpZiAoYWN0aW9uID09PSAnY29sbGlzaW9uJykge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSDlt7LlrZjlnKjlkIzlkI0gJHtDT01QT05FTlRfU1RBVEVfUlVOVElNRV9DTEFTU33vvIzkvYbnvLrlsJHmj5Lku7bnrqHnkIbnmoTov5DooYzml7botYTkuqfvvJtgICtcbiAgICAgICAgICAgICfkuLrpgb/lhY3ph43lpI0gY2NjbGFzc++8jOacrOasoee7hOS7tueKtuaAgeiusOS4uiB1bmF2YWlsYWJsZeOAgidcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoYWN0aW9uID09PSAnd3JpdGUnKSB7XG4gICAgICAgIGF3YWl0IGVuc3VyZUFzc2V0Rm9sZGVyKENPTVBPTkVOVF9NQVBQSU5HX0RJUik7XG4gICAgICAgIGF3YWl0IGVuc3VyZUFzc2V0Rm9sZGVyKENPTVBPTkVOVF9TVEFURV9SVU5USU1FX0RJUik7XG4gICAgICAgIGF3YWl0IHdyaXRlVGV4dEFzc2V0VmlhSW1wb3J0KENPTVBPTkVOVF9TVEFURV9SVU5USU1FX0RCX1VSTCwgdGVtcGxhdGUpO1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOW3siR7ZXhpc3RpbmcgPyAn5pu05pawJyA6ICflronoo4Unfei/kOihjOaXtue7hOS7tu+8miR7Q09NUE9ORU5UX1NUQVRFX1JVTlRJTUVfREJfVVJMfWBcbiAgICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKGFjdGlvbiA9PT0gJ2tlZXAtY3VzdG9tJyAmJiBleGlzdGluZyAhPT0gdGVtcGxhdGUpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0gJHtDT01QT05FTlRfU1RBVEVfUlVOVElNRV9EQl9VUkx9IOS4jeaYr+aPkuS7tueUn+aIkOaWh+S7tu+8jOS/neeVmeeOsOacieWGheWuue+8m2AgK1xuICAgICAgICAgICAgJ+S4uumBv+WFjeivr+eUqOWtl+auteWlkee6puacquefpeeahOWQjOWQjeiEmuacrO+8jOacrOasoee7hOS7tueKtuaAgeiusOS4uiB1bmF2YWlsYWJsZeOAgidcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoIXNob3VsZFdhaXRGb3JDb21wb25lbnRTdGF0ZVJ1bnRpbWUoYWN0aW9uKSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCA0MDsgYXR0ZW1wdCsrKSB7XG4gICAgICAgIGlmIChhd2FpdCBxdWVyeUNvbXBvbmVudFN0YXRlUnVudGltZVJlYWR5KCkpIHtcbiAgICAgICAgICAgIGNvbXBvbmVudFN0YXRlUnVudGltZVJlYWR5ID0gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGRlbGF5KDI1MCk7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZW5zdXJlQ29tcG9uZW50U3RhdGVSdW50aW1lKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGlmIChjb21wb25lbnRTdGF0ZVJ1bnRpbWVSZWFkeSkgcmV0dXJuIHRydWU7XG4gICAgaWYgKCFjb21wb25lbnRTdGF0ZVJ1bnRpbWVQcm9taXNlKSB7XG4gICAgICAgIGNvbXBvbmVudFN0YXRlUnVudGltZVByb21pc2UgPSBwcm92aXNpb25Db21wb25lbnRTdGF0ZVJ1bnRpbWUoKS5maW5hbGx5KCgpID0+IHtcbiAgICAgICAgICAgIGNvbXBvbmVudFN0YXRlUnVudGltZVByb21pc2UgPSBudWxsO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGF3YWl0IGNvbXBvbmVudFN0YXRlUnVudGltZVByb21pc2U7XG59XG5cbi8qKiBSZXBsYWNlbWVudC9hdHRhY2ggYmV0YSBmbG93cyBzaGFyZSB0aGUgaW1wb3J0ZXIgdHJlZSBhbmQgbXVzdCBwcm92aXNpb24gdGhlIHJ1bnRpbWUgdG9vLiAqL1xuYXN5bmMgZnVuY3Rpb24gZW5zdXJlQ29tcG9uZW50U3RhdGVSdW50aW1lQmVzdEVmZm9ydCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCByZWFkeSA9IGF3YWl0IGVuc3VyZUNvbXBvbmVudFN0YXRlUnVudGltZSgpO1xuICAgICAgICBpZiAoIXJlYWR5KSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0gJHtDT01QT05FTlRfU1RBVEVfUlVOVElNRV9DTEFTU30g5bCa5pyq5a6M5oiQ5rOo5YaM77ybYCArXG4gICAgICAgICAgICAgICAgJ+acrOasoeabv+aNoi/mjILovb3nmoTnu4Tku7bnirbmgIHlsIborrDkuLogdW5hdmFpbGFibGXjgIInXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZWFkeTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb21wb25lbnRTdGF0ZVJ1bnRpbWVSZWFkeSA9IGZhbHNlO1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSAke0NPTVBPTkVOVF9TVEFURV9SVU5USU1FX0NMQVNTfSDlronoo4XmiJbljYfnuqflpLHotKXvvJtgICtcbiAgICAgICAgICAgICfmnKzmrKHmm7/mjaIv5oyC6L295bCG57un57ut77yM5L2G57uE5Lu254q25oCB6K6w5Li6IHVuYXZhaWxhYmxl77yaJyxcbiAgICAgICAgICAgIChlcnJvciBhcyBhbnkpPy5tZXNzYWdlIHx8IGVycm9yLFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG5pbnRlcmZhY2UgUmVzb2x2ZWRDb21wb25lbnRNYXBwaW5nQXNzZXRFbnRyeSBleHRlbmRzIENvbXBvbmVudE1hcHBpbmdFbnRyeSB7XG4gICAgcmVzb2x2ZWQ6IGJvb2xlYW47XG4gICAgcmVxdWVzdGVkUHJlZmFiVXVpZDogc3RyaW5nO1xuICAgIHJlcXVlc3RlZFByZWZhYlVybDogc3RyaW5nO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlQ29tcG9uZW50TWFwcGluZ0Fzc2V0cyhkb2N1bWVudDogQ29tcG9uZW50TWFwcGluZ0RvY3VtZW50KTogUHJvbWlzZTx7XG4gICAgZW50cmllczogUmVzb2x2ZWRDb21wb25lbnRNYXBwaW5nQXNzZXRFbnRyeVtdO1xuICAgIHZhbGlkOiBudW1iZXI7XG4gICAgYnJva2VuOiBudW1iZXI7XG59PiB7XG4gICAgbGV0IHZhbGlkID0gMDtcbiAgICBsZXQgYnJva2VuID0gMDtcbiAgICBjb25zdCBlbnRyaWVzOiBSZXNvbHZlZENvbXBvbmVudE1hcHBpbmdBc3NldEVudHJ5W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGRvY3VtZW50LmVudHJpZXMpIHtcbiAgICAgICAgY29uc3QgcmVxdWVzdGVkUHJlZmFiVXVpZCA9IFN0cmluZyhlbnRyeS5wcmVmYWJVdWlkIHx8ICcnKTtcbiAgICAgICAgY29uc3QgcmVxdWVzdGVkUHJlZmFiVXJsID0gU3RyaW5nKGVudHJ5LnByZWZhYlVybCB8fCAnJyk7XG4gICAgICAgIGxldCBpbmZvID0gZW50cnkucHJlZmFiVXVpZCA/IGF3YWl0IHF1ZXJ5QXNzZXRJbmZvKGVudHJ5LnByZWZhYlV1aWQpIDogbnVsbDtcbiAgICAgICAgaWYgKCFpc1ByZWZhYkFzc2V0SW5mbyhpbmZvKSAmJiBlbnRyeS5wcmVmYWJVcmwpIGluZm8gPSBhd2FpdCBxdWVyeUFzc2V0SW5mbyhlbnRyeS5wcmVmYWJVcmwpO1xuICAgICAgICBpZiAoaXNQcmVmYWJBc3NldEluZm8oaW5mbykgJiYgaW5mbyAmJiBpbmZvLnV1aWQpIHtcbiAgICAgICAgICAgIGVudHJpZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgLi4uZW50cnksXG4gICAgICAgICAgICAgICAgcHJlZmFiVXVpZDogU3RyaW5nKGluZm8udXVpZCksXG4gICAgICAgICAgICAgICAgcHJlZmFiVXJsOiBhc3NldEluZm9VcmwoaW5mbyksXG4gICAgICAgICAgICAgICAgcmVzb2x2ZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgcmVxdWVzdGVkUHJlZmFiVXVpZCxcbiAgICAgICAgICAgICAgICByZXF1ZXN0ZWRQcmVmYWJVcmwsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHZhbGlkKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlbnRyaWVzLnB1c2goe1xuICAgICAgICAgICAgICAgIC4uLmVudHJ5LFxuICAgICAgICAgICAgICAgIHByZWZhYlV1aWQ6ICcnLFxuICAgICAgICAgICAgICAgIHByZWZhYlVybDogJycsXG4gICAgICAgICAgICAgICAgcmVzb2x2ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHJlcXVlc3RlZFByZWZhYlV1aWQsXG4gICAgICAgICAgICAgICAgcmVxdWVzdGVkUHJlZmFiVXJsLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBicm9rZW4rKztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4geyBlbnRyaWVzLCB2YWxpZCwgYnJva2VuIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVQcmVmYWJGb3JJbnN0YW50aWF0ZSgpOiBQcm9taXNlPHsgdXVpZDogc3RyaW5nOyBkYlVybDogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfSB8IG51bGw+IHtcbiAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IGdldFNlbGVjdGVkUHJlZmFiQXNzZXRJbmZvKCk7XG4gICAgaWYgKHNlbGVjdGVkICYmIHNlbGVjdGVkLnV1aWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHV1aWQ6IFN0cmluZyhzZWxlY3RlZC51dWlkKSxcbiAgICAgICAgICAgIGRiVXJsOiBhc3NldEluZm9Vcmwoc2VsZWN0ZWQpLFxuICAgICAgICAgICAgbmFtZTogU3RyaW5nKHNlbGVjdGVkLm5hbWUgfHwgc2VsZWN0ZWQuZGlzcGxheU5hbWUgfHwgc2VsZWN0ZWQudXVpZCksXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKGxhc3RTYXZlZFByZWZhYlV1aWQgfHwgbGFzdFNhdmVkUHJlZmFiRGJVcmwpIHtcbiAgICAgICAgY29uc3QgaW5mbyA9IGF3YWl0IHF1ZXJ5QXNzZXRJbmZvKGxhc3RTYXZlZFByZWZhYlV1aWQgfHwgbGFzdFNhdmVkUHJlZmFiRGJVcmwpO1xuICAgICAgICBpZiAoaXNQcmVmYWJBc3NldEluZm8oaW5mbykgJiYgaW5mby51dWlkKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHV1aWQ6IFN0cmluZyhpbmZvLnV1aWQpLFxuICAgICAgICAgICAgICAgIGRiVXJsOiBhc3NldEluZm9VcmwoaW5mbykgfHwgbGFzdFNhdmVkUHJlZmFiRGJVcmwsXG4gICAgICAgICAgICAgICAgbmFtZTogU3RyaW5nKGluZm8ubmFtZSB8fCBpbmZvLmRpc3BsYXlOYW1lIHx8IGxhc3RTYXZlZFByZWZhYkRiVXJsKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGFzdEltcG9ydGVkTmFtZUZvclB1bGwpIHtcbiAgICAgICAgY29uc3QgZ3Vlc3NlZERiVXJsID0gYCR7RklHTUFfUFJFRkFCX0RJUn0vJHtzYWZlQXNzZXRGaWxlTmFtZShsYXN0SW1wb3J0ZWROYW1lRm9yUHVsbCl9LnByZWZhYmA7XG4gICAgICAgIGNvbnN0IGluZm8gPSBhd2FpdCBxdWVyeUFzc2V0SW5mbyhndWVzc2VkRGJVcmwpO1xuICAgICAgICBpZiAoaXNQcmVmYWJBc3NldEluZm8oaW5mbykgJiYgaW5mby51dWlkKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHV1aWQ6IFN0cmluZyhpbmZvLnV1aWQpLFxuICAgICAgICAgICAgICAgIGRiVXJsOiBhc3NldEluZm9VcmwoaW5mbykgfHwgZ3Vlc3NlZERiVXJsLFxuICAgICAgICAgICAgICAgIG5hbWU6IFN0cmluZyhpbmZvLm5hbWUgfHwgaW5mby5kaXNwbGF5TmFtZSB8fCBsYXN0SW1wb3J0ZWROYW1lRm9yUHVsbCksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGRlbGF5KG1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgbXMpKTtcbn1cblxuZnVuY3Rpb24gZWxhcHNlZE1zKHN0YXJ0OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiBEYXRlLm5vdygpIC0gc3RhcnQ7XG59XG5cbmludGVyZmFjZSBQcmVwYXJlZEltcG9ydERhdGEge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBjYW52YXM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfTtcbiAgICByb290OiBGaWdtYU5vZGVEYXRhO1xuICAgIGltYWdlcz86IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgICBpbnRlcmZhY2VDb3VudDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSW1hZ2VEaW1lbnNpb25zIHtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2xpbVN0YXRzIHtcbiAgICBzaGFyZWRDcm9wcGVkSW1hZ2VzOiBudW1iZXI7XG4gICAgc2hhcmVkQ3JvcHBlZFNsaWNlQ2hpbGRyZW46IG51bWJlcjtcbiAgICBpbXBsaWNpdFNsaWNlOUltYWdlczogbnVtYmVyO1xuICAgIGltcGxpY2l0U2xpY2U5U2xpY2VDaGlsZHJlbjogbnVtYmVyO1xuICAgIGltYWdlTWFza3M6IG51bWJlcjtcbiAgICByZWN0TWFza0ZhbGxiYWNrczogbnVtYmVyO1xuICAgIGRlZ2VuZXJhdGVNYXNrczogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUGVyc2lzdGVudFZhcmlhbnRTdGF0cyB7XG4gICAgY3JvcHBlZEltYWdlRmlsbHM6IG51bWJlcjtcbiAgICBjcm9wRmFpbHVyZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNsaWNlOUltYWdlVmFyaWFudFN0YXRzIHtcbiAgICBleHBsaWNpdE5vZGVzOiBudW1iZXI7XG4gICAgaW1wbGljaXROb2RlczogbnVtYmVyO1xuICAgIHNlbWFudGljSW1hZ2VzOiBudW1iZXI7XG4gICAgbWlzc2luZ0ltYWdlczogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgVGV4dHVyZVByZXZpZXdPY2N1cnJlbmNlIHtcbiAgICBwYXRoOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgY2FudmFzWDogbnVtYmVyO1xuICAgIGNhbnZhc1k6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIERldGVjdGVkU2xpY2U5SW5mbyB7XG4gICAgaW1hZ2VSZWY6IHN0cmluZztcbiAgICBib3JkZXI6IFNwcml0ZUZyYW1lQm9yZGVyO1xuICAgIGNoaWxkcmVuVG9Ta2lwOiBTZXQ8RmlnbWFOb2RlRGF0YT47XG4gICAgcm93czogbnVtYmVyO1xuICAgIGNvbHM6IG51bWJlcjtcbn1cblxudHlwZSBNYXNrU2hhcGVLaW5kID0gJ0RFR0VORVJBVEUnIHwgJ1NPTElEX1JFQ1QnIHwgJ1NIQVBFRCc7XG5cbmludGVyZmFjZSBNYXNrUm91dGUge1xuICAgIHNoYXBlOiBNYXNrU2hhcGVLaW5kO1xuICAgIHVzZUltYWdlTWFzazogYm9vbGVhbjtcbiAgICBmYWxsYmFja1JlYXNvbj86ICdkZWdlbmVyYXRlJyB8ICdzb2xpZC1yZWN0Jztcbn1cblxuaW50ZXJmYWNlIFByZXBhcmVkU2NlbmVQYXlsb2FkIHtcbiAgICBwcmVwYXJlZDogUHJlcGFyZWRJbXBvcnREYXRhO1xuICAgIHBheWxvYWQ6IGFueTtcbiAgICBwZW5kaW5nU3ByaXRlRnJhbWVzOiB7IFtpbWdSZWY6IHN0cmluZ106IFBlbmRpbmdTcHJpdGVGcmFtZSB9O1xuICAgIGZvbnRUcmFja2VyOiBGb250RGVtYW5kVHJhY2tlcjtcbiAgICB0ZXh0U3R5bGVUcmFja2VyOiBUZXh0U3R5bGVUcmFja2VyO1xuICAgIHRleHRTdHlsZVRlbXBsYXRlVHJhY2tlcjogVGV4dFN0eWxlVGVtcGxhdGVUcmFja2VyO1xuICAgIHRleHRTdHlsZUxpYjogVGV4dFN0eWxlTGlicmFyeTtcbn1cblxuaW50ZXJmYWNlIFJlcGxhY2VUYXJnZXRJbmZvIHtcbiAgICB1dWlkOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHNjZW5lUGF0aDogc3RyaW5nO1xuICAgIHJlbGF0aXZlUGF0aD86IHN0cmluZztcbiAgICBwYXJlbnROYW1lOiBzdHJpbmc7XG4gICAgcGFyZW50VXVpZD86IHN0cmluZztcbiAgICBzaWJsaW5nSW5kZXg/OiBudW1iZXI7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICBoYXNMYWJlbDogYm9vbGVhbjtcbiAgICBoYXNTcHJpdGU6IGJvb2xlYW47XG4gICAgaGFzUmljaFRleHQ/OiBib29sZWFuO1xuICAgIGxhYmVsVGV4dD86IHN0cmluZztcbiAgICBzcHJpdGVGcmFtZU5hbWU/OiBzdHJpbmc7XG4gICAgY29tcG9uZW50VHlwZT86IHN0cmluZztcbiAgICByZXBsYWNlS2luZD86IFJlcGxhY2VLaW5kO1xufVxuXG50eXBlIFJlcGxhY2VLaW5kID0gJ3RleHQnIHwgJ2ltYWdlJyB8ICdtaXhlZCcgfCAnb3RoZXInO1xuXG5pbnRlcmZhY2UgRmlnbWFOb2RlQ2FuZGlkYXRlIHtcbiAgICBub2RlOiBGaWdtYU5vZGVEYXRhO1xuICAgIHBhdGg6IHN0cmluZztcbiAgICBwYXJlbnRQYXRoOiBzdHJpbmc7XG4gICAgcGFyZW50TmFtZTogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICBoYXNJbWFnZTogYm9vbGVhbjtcbiAgICBpbWFnZVJlZjogc3RyaW5nO1xuICAgIGNoYXJhY3RlcnM6IHN0cmluZztcbiAgICBjYW52YXNYOiBudW1iZXI7XG4gICAgY2FudmFzWTogbnVtYmVyO1xuICAgIHJlcGxhY2VLaW5kOiBSZXBsYWNlS2luZDtcbn1cblxuaW50ZXJmYWNlIFJlcGxhY2VBcHBseUZsYWdzIHtcbiAgICBpbWFnZTogYm9vbGVhbjtcbiAgICB0ZXh0OiBib29sZWFuO1xuICAgIHBvc2l0aW9uOiBib29sZWFuO1xuICAgIGFuY2hvclBpdm90OiBib29sZWFuO1xuICAgIHByZXNlcnZlQWxwaGE6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBCYXRjaFJlcGxhY2VBcHBseU9wdGlvbnMge1xuICAgIHJvb3RVdWlkPzogc3RyaW5nO1xuICAgIGtpbmQ/OiBzdHJpbmc7XG4gICAgbWluU2NvcmU/OiBudW1iZXI7XG4gICAgZmxhZ3M/OiBQYXJ0aWFsPFJlcGxhY2VBcHBseUZsYWdzPjtcbiAgICBkcnlSdW4/OiBib29sZWFuO1xuICAgIGxpbWl0PzogbnVtYmVyO1xufVxuXG4vKipcbiAqIEB6aCDmioogRmlnbWEg5a+85Ye657uf5LiA5oiQ5Y2V5qO1IHJvb3TjgIJVbml0eSDmj5Lku7bmlK/mjIEgaW50ZXJmYWNlc1tdIOWkmueVjOmdouWvvOWHuu+8mlxuICogICAgIOWPluaJgOacieeVjOmdoue7neWvueahhueahOW5tumbhuS9nOS4uiB3cmFwcGVyIOWwuuWvuO+8jOWQhOeVjOmdouagueiKgueCueaMieebuOWvueWBj+enu+aMguWcqCB3cmFwcGVyIOS4i+OAglxuICovXG5mdW5jdGlvbiBwcmVwYXJlSW1wb3J0RGF0YShkYXRhOiBGaWdtYUV4cG9ydERhdGEpOiBQcmVwYXJlZEltcG9ydERhdGEge1xuICAgIGNvbnN0IGludGVyZmFjZXMgPSBBcnJheS5pc0FycmF5KGRhdGEuaW50ZXJmYWNlcylcbiAgICAgICAgPyBkYXRhLmludGVyZmFjZXMuZmlsdGVyKChpdGVtOiBhbnkpID0+IGl0ZW0gJiYgaXRlbS5yb290KVxuICAgICAgICA6IFtdO1xuICAgIGlmIChpbnRlcmZhY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBpZiAoIWRhdGEucm9vdCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGRhdGE6IG1pc3Npbmcgcm9vdCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IGRhdGEuY2FudmFzIHx8IHsgd2lkdGg6IGRhdGEucm9vdC53aWR0aCB8fCAxLCBoZWlnaHQ6IGRhdGEucm9vdC5oZWlnaHQgfHwgMSB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbmFtZTogZGF0YS5uYW1lIHx8IGRhdGEucm9vdC5uYW1lIHx8ICd1bnRpdGxlZCcsXG4gICAgICAgICAgICBjYW52YXMsXG4gICAgICAgICAgICByb290OiBkYXRhLnJvb3QsXG4gICAgICAgICAgICBpbWFnZXM6IGRhdGEuaW1hZ2VzLFxuICAgICAgICAgICAgaW50ZXJmYWNlQ291bnQ6IDEsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5LCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xuICAgIGZvciAoY29uc3QgaWZhY2Ugb2YgaW50ZXJmYWNlcykge1xuICAgICAgICBjb25zdCByb290ID0gaWZhY2Uucm9vdDtcbiAgICAgICAgY29uc3Qgd2lkdGggPSAoaWZhY2UuY2FudmFzICYmIGlmYWNlLmNhbnZhcy53aWR0aCkgfHwgcm9vdC53aWR0aCB8fCAxO1xuICAgICAgICBjb25zdCBoZWlnaHQgPSAoaWZhY2UuY2FudmFzICYmIGlmYWNlLmNhbnZhcy5oZWlnaHQpIHx8IHJvb3QuaGVpZ2h0IHx8IDE7XG4gICAgICAgIGNvbnN0IG9mZnNldFggPSBOdW1iZXIoaWZhY2Uub2Zmc2V0WCkgfHwgMDtcbiAgICAgICAgY29uc3Qgb2Zmc2V0WSA9IE51bWJlcihpZmFjZS5vZmZzZXRZKSB8fCAwO1xuICAgICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgb2Zmc2V0WCk7XG4gICAgICAgIG1pblkgPSBNYXRoLm1pbihtaW5ZLCBvZmZzZXRZKTtcbiAgICAgICAgbWF4WCA9IE1hdGgubWF4KG1heFgsIG9mZnNldFggKyB3aWR0aCk7XG4gICAgICAgIG1heFkgPSBNYXRoLm1heChtYXhZLCBvZmZzZXRZICsgaGVpZ2h0KTtcbiAgICB9XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobWluWCkgfHwgIU51bWJlci5pc0Zpbml0ZShtaW5ZKSB8fCAhTnVtYmVyLmlzRmluaXRlKG1heFgpIHx8ICFOdW1iZXIuaXNGaW5pdGUobWF4WSkpIHtcbiAgICAgICAgbWluWCA9IG1pblkgPSAwO1xuICAgICAgICBtYXhYID0gbWF4WSA9IDE7XG4gICAgfVxuXG4gICAgY29uc3Qgd3JhcHBlclcgPSBNYXRoLm1heCgxLCBtYXhYIC0gbWluWCk7XG4gICAgY29uc3Qgd3JhcHBlckggPSBNYXRoLm1heCgxLCBtYXhZIC0gbWluWSk7XG4gICAgY29uc3Qgd3JhcHBlck5hbWUgPSBkYXRhLm5hbWUgfHwgJ011bHRpSW1wb3J0JztcbiAgICBjb25zdCB3cmFwcGVyOiBGaWdtYU5vZGVEYXRhID0ge1xuICAgICAgICBmaWdtYUlkOiBgbXVsdGk6JHt3cmFwcGVyTmFtZX1gLFxuICAgICAgICBuYW1lOiB3cmFwcGVyTmFtZSxcbiAgICAgICAgdHlwZTogJ0ZSQU1FJyxcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogMCxcbiAgICAgICAgd2lkdGg6IHdyYXBwZXJXLFxuICAgICAgICBoZWlnaHQ6IHdyYXBwZXJILFxuICAgICAgICByb3RhdGlvbjogMCxcbiAgICAgICAgdmlzaWJsZTogdHJ1ZSxcbiAgICAgICAgb3BhY2l0eTogMSxcbiAgICAgICAgY2hpbGRyZW46IGludGVyZmFjZXMubWFwKChpZmFjZTogYW55KSA9PiB7XG4gICAgICAgICAgICBjb25zdCByb290ID0gaWZhY2Uucm9vdCBhcyBGaWdtYU5vZGVEYXRhO1xuICAgICAgICAgICAgcm9vdC54ID0gKE51bWJlcihpZmFjZS5vZmZzZXRYKSB8fCAwKSAtIG1pblg7XG4gICAgICAgICAgICByb290LnkgPSAoTnVtYmVyKGlmYWNlLm9mZnNldFkpIHx8IDApIC0gbWluWTtcbiAgICAgICAgICAgIHJvb3QuY29uc3RyYWludHMgPSBudWxsO1xuICAgICAgICAgICAgcmV0dXJuIHJvb3Q7XG4gICAgICAgIH0pLFxuICAgIH07XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0g5qOA5rWL5Yiw5aSa55WM6Z2i5a+85Ye677yaJHtpbnRlcmZhY2VzLmxlbmd0aH0g5Liq55WM6Z2i77yMYCArXG4gICAgICAgIGDlt7LlkIjmiJAgJHtNYXRoLnJvdW5kKHdyYXBwZXJXKX3DlyR7TWF0aC5yb3VuZCh3cmFwcGVySCl9IHdyYXBwZXLjgIJgXG4gICAgKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiB3cmFwcGVyTmFtZSxcbiAgICAgICAgY2FudmFzOiB7IHdpZHRoOiB3cmFwcGVyVywgaGVpZ2h0OiB3cmFwcGVySCB9LFxuICAgICAgICByb290OiB3cmFwcGVyLFxuICAgICAgICBpbWFnZXM6IGRhdGEuaW1hZ2VzLFxuICAgICAgICBpbnRlcmZhY2VDb3VudDogaW50ZXJmYWNlcy5sZW5ndGgsXG4gICAgfTtcbn1cblxuLyoqXG4gKiBAemggTG9hZGVyL+mihOiniOWPo+W+hO+8muWkmueVjOmdoiBKU09OIOWPqumihOiniOesrOS4gOS4qiBpbnRlcmZhY2XjgIJcbiAqICAgICBVbml0eSBMb2FkZXJXaW5kb3cg5Lmf5piv6L+Z5qC377ya6aKE6KeI5ZKM5qGG6YCJ5Z+65LqO6aaW55WM6Z2i77yM5a6M5pW05a+85YWl5omN6K+75Y+W5pW05Lu9IEpTT07jgIJcbiAqL1xuZnVuY3Rpb24gcHJlcGFyZUxvYWRlclByZXZpZXdEYXRhKGRhdGE6IEZpZ21hRXhwb3J0RGF0YSk6IFByZXBhcmVkSW1wb3J0RGF0YSB7XG4gICAgY29uc3QgaW50ZXJmYWNlcyA9IEFycmF5LmlzQXJyYXkoZGF0YS5pbnRlcmZhY2VzKVxuICAgICAgICA/IGRhdGEuaW50ZXJmYWNlcy5maWx0ZXIoKGl0ZW06IGFueSkgPT4gaXRlbSAmJiBpdGVtLnJvb3QpXG4gICAgICAgIDogW107XG4gICAgaWYgKGludGVyZmFjZXMubGVuZ3RoID09PSAwKSByZXR1cm4gcHJlcGFyZUltcG9ydERhdGEoZGF0YSk7XG5cbiAgICBjb25zdCBmaXJzdCA9IGludGVyZmFjZXNbMF07XG4gICAgY29uc3Qgcm9vdCA9IGZpcnN0LnJvb3QgYXMgRmlnbWFOb2RlRGF0YTtcbiAgICBjb25zdCBjYW52YXMgPSBmaXJzdC5jYW52YXMgfHwgZGF0YS5jYW52YXMgfHwgeyB3aWR0aDogcm9vdC53aWR0aCB8fCAxLCBoZWlnaHQ6IHJvb3QuaGVpZ2h0IHx8IDEgfTtcbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiBmaXJzdC5uYW1lIHx8IHJvb3QubmFtZSB8fCBkYXRhLm5hbWUgfHwgJ3VudGl0bGVkJyxcbiAgICAgICAgY2FudmFzLFxuICAgICAgICByb290LFxuICAgICAgICBpbWFnZXM6IGRhdGEuaW1hZ2VzLFxuICAgICAgICBpbnRlcmZhY2VDb3VudDogaW50ZXJmYWNlcy5sZW5ndGgsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gY2xvbmVKc29uPFQ+KHZhbHVlOiBUKTogVCB7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodmFsdWUpKTtcbn1cblxuZnVuY3Rpb24gbm9kZVJlcGxhY2VLaW5kKG5vZGU6IEZpZ21hTm9kZURhdGEpOiBSZXBsYWNlS2luZCB7XG4gICAgY29uc3QgaXNUZXh0ID0gU3RyaW5nKG5vZGUudHlwZSB8fCAnJykudG9VcHBlckNhc2UoKSA9PT0gJ1RFWFQnO1xuICAgIGNvbnN0IGhhc0ltYWdlID0gISFub2RlSW1hZ2VSZWYobm9kZSk7XG4gICAgaWYgKGlzVGV4dCAmJiBoYXNJbWFnZSkgcmV0dXJuICdtaXhlZCc7XG4gICAgaWYgKGlzVGV4dCkgcmV0dXJuICd0ZXh0JztcbiAgICBpZiAoaGFzSW1hZ2UpIHJldHVybiAnaW1hZ2UnO1xuICAgIHJldHVybiAnb3RoZXInO1xufVxuXG5mdW5jdGlvbiBjb2xsZWN0RmlnbWFOb2RlQ2FuZGlkYXRlcyhyb290OiBGaWdtYU5vZGVEYXRhKTogRmlnbWFOb2RlQ2FuZGlkYXRlW10ge1xuICAgIGNvbnN0IG91dDogRmlnbWFOb2RlQ2FuZGlkYXRlW10gPSBbXTtcbiAgICBjb25zdCB0b3BDb3VudHM6IHsgW25hbWU6IHN0cmluZ106IG51bWJlciB9ID0ge307XG4gICAgY29uc3QgdmlzaXQgPSAoXG4gICAgICAgIG5vZGU6IEZpZ21hTm9kZURhdGEsXG4gICAgICAgIHBhcmVudFBhdGg6IHN0cmluZyxcbiAgICAgICAgcGFyZW50TmFtZTogc3RyaW5nLFxuICAgICAgICBzaWJsaW5nTmFtZUNvdW50OiB7IFtuYW1lOiBzdHJpbmddOiBudW1iZXIgfSxcbiAgICAgICAgY2FudmFzWDogbnVtYmVyLFxuICAgICAgICBjYW52YXNZOiBudW1iZXJcbiAgICApID0+IHtcbiAgICAgICAgaWYgKCFub2RlKSByZXR1cm47XG4gICAgICAgIGxldCBiYXNlTmFtZSA9IHNhbml0aXplRmlnbWFQYXRoTmFtZShub2RlLm5hbWUgfHwgJycpO1xuICAgICAgICBpZiAoIWJhc2VOYW1lKSBiYXNlTmFtZSA9IG5vZGUudHlwZSA9PT0gJ1RFWFQnID8gJ1RleHQnIDogJ05vZGUnO1xuICAgICAgICBjb25zdCBvY2MgPSBzaWJsaW5nTmFtZUNvdW50W2Jhc2VOYW1lXSB8fCAwO1xuICAgICAgICBzaWJsaW5nTmFtZUNvdW50W2Jhc2VOYW1lXSA9IG9jYyArIDE7XG4gICAgICAgIGNvbnN0IHBhdGggPSBwYXJlbnRQYXRoID8gYCR7cGFyZW50UGF0aH0vJHtmaWdtYVBhdGhTZWdtZW50KGJhc2VOYW1lLCBvY2MpfWAgOiBmaWdtYVBhdGhTZWdtZW50KGJhc2VOYW1lLCBvY2MpO1xuICAgICAgICBjb25zdCBpbWFnZVJlZiA9IG5vZGVJbWFnZVJlZihub2RlKSB8fCAnJztcbiAgICAgICAgb3V0LnB1c2goe1xuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICBwYXJlbnRQYXRoLFxuICAgICAgICAgICAgcGFyZW50TmFtZSxcbiAgICAgICAgICAgIG5hbWU6IGJhc2VOYW1lLFxuICAgICAgICAgICAgdHlwZTogU3RyaW5nKG5vZGUudHlwZSB8fCAnJyksXG4gICAgICAgICAgICB3aWR0aDogTnVtYmVyKG5vZGUud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICBoZWlnaHQ6IE51bWJlcihub2RlLmhlaWdodCkgfHwgMCxcbiAgICAgICAgICAgIGhhc0ltYWdlOiAhIWltYWdlUmVmLFxuICAgICAgICAgICAgaW1hZ2VSZWYsXG4gICAgICAgICAgICBjaGFyYWN0ZXJzOiB0eXBlb2Ygbm9kZS5jaGFyYWN0ZXJzID09PSAnc3RyaW5nJyA/IG5vZGUuY2hhcmFjdGVycyA6ICcnLFxuICAgICAgICAgICAgY2FudmFzWCxcbiAgICAgICAgICAgIGNhbnZhc1ksXG4gICAgICAgICAgICByZXBsYWNlS2luZDogbm9kZVJlcGxhY2VLaW5kKG5vZGUpLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgY2hpbGRDb3VudHM6IHsgW25hbWU6IHN0cmluZ106IG51bWJlciB9ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbiB8fCBbXSkge1xuICAgICAgICAgICAgdmlzaXQoXG4gICAgICAgICAgICAgICAgY2hpbGQsXG4gICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICAgICBiYXNlTmFtZSxcbiAgICAgICAgICAgICAgICBjaGlsZENvdW50cyxcbiAgICAgICAgICAgICAgICBjYW52YXNYICsgKE51bWJlcihjaGlsZC54KSB8fCAwKSxcbiAgICAgICAgICAgICAgICBjYW52YXNZICsgKE51bWJlcihjaGlsZC55KSB8fCAwKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgdmlzaXQocm9vdCwgJycsICcnLCB0b3BDb3VudHMsIE51bWJlcihyb290LngpIHx8IDAsIE51bWJlcihyb290LnkpIHx8IDApO1xuICAgIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGZpbHRlckZpZ21hQ2FuZGlkYXRlc0ZvclRhcmdldChjYW5kaWRhdGVzOiBGaWdtYU5vZGVDYW5kaWRhdGVbXSwgdGFyZ2V0OiBSZXBsYWNlVGFyZ2V0SW5mbyk6IEZpZ21hTm9kZUNhbmRpZGF0ZVtdIHtcbiAgICBjb25zdCBraW5kID0gdGFyZ2V0LnJlcGxhY2VLaW5kIHx8ICh0YXJnZXQuaGFzTGFiZWwgPyAndGV4dCcgOiAodGFyZ2V0Lmhhc1Nwcml0ZSA/ICdpbWFnZScgOiAnb3RoZXInKSk7XG4gICAgaWYgKGtpbmQgPT09ICd0ZXh0JykgcmV0dXJuIGNhbmRpZGF0ZXMuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnR5cGUgPT09ICdURVhUJyk7XG4gICAgaWYgKGtpbmQgPT09ICdpbWFnZScpIHJldHVybiBjYW5kaWRhdGVzLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5oYXNJbWFnZSAmJiBpdGVtLnR5cGUgIT09ICdURVhUJyk7XG4gICAgaWYgKGtpbmQgPT09ICdtaXhlZCcpIHJldHVybiBjYW5kaWRhdGVzLmZpbHRlcigoaXRlbSkgPT4gaXRlbS50eXBlID09PSAnVEVYVCcgfHwgaXRlbS5oYXNJbWFnZSk7XG4gICAgcmV0dXJuIGNhbmRpZGF0ZXM7XG59XG5cbmZ1bmN0aW9uIHNjb3JlRmlnbWFOb2RlQ2FuZGlkYXRlKFxuICAgIGNhbmRpZGF0ZTogRmlnbWFOb2RlQ2FuZGlkYXRlLFxuICAgIHRhcmdldDogUmVwbGFjZVRhcmdldEluZm9cbik6IHsgY2FuZGlkYXRlOiBGaWdtYU5vZGVDYW5kaWRhdGU7IHNjb3JlOiBudW1iZXI7IHJlYXNvbjogc3RyaW5nIH0ge1xuICAgIGNvbnN0IHRhcmdldE5hbWUgPSBub3JtYWxpemVOYW1lRm9yQ29tcGFyZSh0YXJnZXQubmFtZSk7XG4gICAgY29uc3QgdGFyZ2V0UGF0aCA9IG5vcm1hbGl6ZVBhdGhGb3JDb21wYXJlKHRhcmdldC5zY2VuZVBhdGgpO1xuICAgIGNvbnN0IHRhcmdldFBhcmVudE5hbWUgPSBub3JtYWxpemVOYW1lRm9yQ29tcGFyZSh0YXJnZXQucGFyZW50TmFtZSk7XG4gICAgY29uc3QgY2FuZGlkYXRlTmFtZSA9IG5vcm1hbGl6ZU5hbWVGb3JDb21wYXJlKGNhbmRpZGF0ZS5uYW1lKTtcbiAgICBjb25zdCBjYW5kaWRhdGVQYXRoID0gbm9ybWFsaXplUGF0aEZvckNvbXBhcmUoY2FuZGlkYXRlLnBhdGgpO1xuICAgIGNvbnN0IGNhbmRpZGF0ZVBhcmVudE5hbWUgPSBub3JtYWxpemVOYW1lRm9yQ29tcGFyZShjYW5kaWRhdGUucGFyZW50TmFtZSk7XG4gICAgbGV0IHNjb3JlID0gMDtcbiAgICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKHRhcmdldFBhdGggJiYgY2FuZGlkYXRlUGF0aCAmJiB0YXJnZXRQYXRoLmVuZHNXaXRoKGNhbmRpZGF0ZVBhdGgpKSB7XG4gICAgICAgIHNjb3JlICs9IDEwMDA7XG4gICAgICAgIHJlYXNvbnMucHVzaCgncGF0aC1zdWZmaXgnKTtcbiAgICB9XG4gICAgaWYgKHRhcmdldE5hbWUgJiYgY2FuZGlkYXRlTmFtZSA9PT0gdGFyZ2V0TmFtZSkge1xuICAgICAgICBzY29yZSArPSAzMjA7XG4gICAgICAgIHJlYXNvbnMucHVzaCgnbmFtZScpO1xuICAgIH0gZWxzZSBpZiAodGFyZ2V0TmFtZSAmJiBjYW5kaWRhdGVOYW1lICYmICh0YXJnZXROYW1lLmluY2x1ZGVzKGNhbmRpZGF0ZU5hbWUpIHx8IGNhbmRpZGF0ZU5hbWUuaW5jbHVkZXModGFyZ2V0TmFtZSkpKSB7XG4gICAgICAgIHNjb3JlICs9IDEyMDtcbiAgICAgICAgcmVhc29ucy5wdXNoKCduYW1lLWNvbnRhaW5zJyk7XG4gICAgfVxuICAgIGlmICh0YXJnZXRQYXJlbnROYW1lICYmIGNhbmRpZGF0ZVBhcmVudE5hbWUgPT09IHRhcmdldFBhcmVudE5hbWUpIHtcbiAgICAgICAgc2NvcmUgKz0gMTAwO1xuICAgICAgICByZWFzb25zLnB1c2goJ3BhcmVudCcpO1xuICAgIH1cbiAgICBjb25zdCBzaXplID0gc2l6ZVNpbWlsYXJpdHkodGFyZ2V0LndpZHRoLCB0YXJnZXQuaGVpZ2h0LCBjYW5kaWRhdGUud2lkdGgsIGNhbmRpZGF0ZS5oZWlnaHQpO1xuICAgIHNjb3JlICs9IE1hdGgucm91bmQoc2l6ZSAqIDEyMCk7XG4gICAgaWYgKHNpemUgPiAwLjg1KSByZWFzb25zLnB1c2goJ3NpemUnKTtcbiAgICBpZiAodGFyZ2V0Lmhhc0xhYmVsICYmIGNhbmRpZGF0ZS50eXBlID09PSAnVEVYVCcpIHtcbiAgICAgICAgc2NvcmUgKz0gMTIwO1xuICAgICAgICByZWFzb25zLnB1c2goJ3RleHQnKTtcbiAgICB9XG4gICAgaWYgKHRhcmdldC5oYXNTcHJpdGUgJiYgY2FuZGlkYXRlLmhhc0ltYWdlKSB7XG4gICAgICAgIHNjb3JlICs9IDEwMDtcbiAgICAgICAgcmVhc29ucy5wdXNoKCdpbWFnZScpO1xuICAgIH1cbiAgICBpZiAodGFyZ2V0LnJlcGxhY2VLaW5kICYmIGNhbmRpZGF0ZS5yZXBsYWNlS2luZCA9PT0gdGFyZ2V0LnJlcGxhY2VLaW5kKSB7XG4gICAgICAgIHNjb3JlICs9IDgwO1xuICAgICAgICByZWFzb25zLnB1c2goJ2tpbmQnKTtcbiAgICB9XG4gICAgaWYgKHRhcmdldC5sYWJlbFRleHQgJiYgY2FuZGlkYXRlLmNoYXJhY3RlcnMgJiZcbiAgICAgICAgbm9ybWFsaXplVGV4dEZvckNvbXBhcmUodGFyZ2V0LmxhYmVsVGV4dCkgPT09IG5vcm1hbGl6ZVRleHRGb3JDb21wYXJlKGNhbmRpZGF0ZS5jaGFyYWN0ZXJzKSkge1xuICAgICAgICBzY29yZSArPSAyNjA7XG4gICAgICAgIHJlYXNvbnMucHVzaCgndGV4dC1jb250ZW50Jyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgY2FuZGlkYXRlLCBzY29yZSwgcmVhc29uOiByZWFzb25zLmpvaW4oJysnKSB8fCAnYmVzdC1lZmZvcnQnIH07XG59XG5cbmZ1bmN0aW9uIHNlbGVjdEJlc3RGaWdtYU5vZGVDYW5kaWRhdGUoXG4gICAgY2FuZGlkYXRlczogRmlnbWFOb2RlQ2FuZGlkYXRlW10sXG4gICAgdGFyZ2V0OiBSZXBsYWNlVGFyZ2V0SW5mbyxcbiAgICBleHBsaWNpdFBhdGg/OiBzdHJpbmdcbik6IHsgY2FuZGlkYXRlOiBGaWdtYU5vZGVDYW5kaWRhdGU7IHNjb3JlOiBudW1iZXI7IHJlYXNvbjogc3RyaW5nIH0gfCBudWxsIHtcbiAgICBjb25zdCBzY29wZWRDYW5kaWRhdGVzID0gZXhwbGljaXRQYXRoID8gY2FuZGlkYXRlcyA6IGZpbHRlckZpZ21hQ2FuZGlkYXRlc0ZvclRhcmdldChjYW5kaWRhdGVzLCB0YXJnZXQpO1xuICAgIGlmIChzY29wZWRDYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3Qgbm9ybWFsaXplZEV4cGxpY2l0UGF0aCA9IG5vcm1hbGl6ZVBhdGhGb3JDb21wYXJlKGV4cGxpY2l0UGF0aCB8fCAnJywgZmFsc2UpO1xuICAgIGlmIChub3JtYWxpemVkRXhwbGljaXRQYXRoKSB7XG4gICAgICAgIGNvbnN0IGV4YWN0ID0gc2NvcGVkQ2FuZGlkYXRlcy5maW5kKChpdGVtKSA9PiBub3JtYWxpemVQYXRoRm9yQ29tcGFyZShpdGVtLnBhdGgsIGZhbHNlKSA9PT0gbm9ybWFsaXplZEV4cGxpY2l0UGF0aCk7XG4gICAgICAgIGlmIChleGFjdCkgcmV0dXJuIHsgY2FuZGlkYXRlOiBleGFjdCwgc2NvcmU6IDk5OTksIHJlYXNvbjogJ2V4cGxpY2l0LXBhdGgnIH07XG4gICAgICAgIGNvbnN0IHN1ZmZpeCA9IHNjb3BlZENhbmRpZGF0ZXMuZmluZCgoaXRlbSkgPT4gbm9ybWFsaXplUGF0aEZvckNvbXBhcmUoaXRlbS5wYXRoLCBmYWxzZSkuZW5kc1dpdGgobm9ybWFsaXplZEV4cGxpY2l0UGF0aCkpO1xuICAgICAgICBpZiAoc3VmZml4KSByZXR1cm4geyBjYW5kaWRhdGU6IHN1ZmZpeCwgc2NvcmU6IDkwMDAsIHJlYXNvbjogJ2V4cGxpY2l0LXBhdGgtc3VmZml4JyB9O1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB0YXJnZXROYW1lID0gbm9ybWFsaXplTmFtZUZvckNvbXBhcmUodGFyZ2V0Lm5hbWUpO1xuICAgIGxldCBiZXN0OiB7IGNhbmRpZGF0ZTogRmlnbWFOb2RlQ2FuZGlkYXRlOyBzY29yZTogbnVtYmVyOyByZWFzb246IHN0cmluZyB9IHwgbnVsbCA9IG51bGw7XG5cbiAgICBmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBzY29wZWRDYW5kaWRhdGVzKSB7XG4gICAgICAgIGNvbnN0IHNjb3JlZCA9IHNjb3JlRmlnbWFOb2RlQ2FuZGlkYXRlKGNhbmRpZGF0ZSwgdGFyZ2V0KTtcbiAgICAgICAgaWYgKCFiZXN0IHx8IHNjb3JlZC5zY29yZSA+IGJlc3Quc2NvcmUpIGJlc3QgPSBzY29yZWQ7XG4gICAgfVxuICAgIGlmICghYmVzdCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcmVsaWFibGUgPSBiZXN0LnNjb3JlID49IDMwMCB8fFxuICAgICAgICBub3JtYWxpemVOYW1lRm9yQ29tcGFyZShiZXN0LmNhbmRpZGF0ZS5uYW1lKSA9PT0gdGFyZ2V0TmFtZSB8fFxuICAgICAgICBub3JtYWxpemVQYXRoRm9yQ29tcGFyZSh0YXJnZXQuc2NlbmVQYXRoKS5lbmRzV2l0aChub3JtYWxpemVQYXRoRm9yQ29tcGFyZShiZXN0LmNhbmRpZGF0ZS5wYXRoKSk7XG4gICAgcmV0dXJuIHJlbGlhYmxlID8gYmVzdCA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGxpc3RCZXN0RmlnbWFOb2RlQ2FuZGlkYXRlcyhcbiAgICBjYW5kaWRhdGVzOiBGaWdtYU5vZGVDYW5kaWRhdGVbXSxcbiAgICB0YXJnZXQ6IFJlcGxhY2VUYXJnZXRJbmZvLFxuICAgIGxpbWl0OiBudW1iZXJcbik6IEFycmF5PHsgY2FuZGlkYXRlOiBGaWdtYU5vZGVDYW5kaWRhdGU7IHNjb3JlOiBudW1iZXI7IHJlYXNvbjogc3RyaW5nIH0+IHtcbiAgICBjb25zdCBzY29yZWQ6IEFycmF5PHsgY2FuZGlkYXRlOiBGaWdtYU5vZGVDYW5kaWRhdGU7IHNjb3JlOiBudW1iZXI7IHJlYXNvbjogc3RyaW5nIH0+ID0gW107XG4gICAgY29uc3Qgc2NvcGVkID0gZmlsdGVyRmlnbWFDYW5kaWRhdGVzRm9yVGFyZ2V0KGNhbmRpZGF0ZXMsIHRhcmdldCk7XG4gICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2Ygc2NvcGVkKSB7XG4gICAgICAgIHNjb3JlZC5wdXNoKHNjb3JlRmlnbWFOb2RlQ2FuZGlkYXRlKGNhbmRpZGF0ZSwgdGFyZ2V0KSk7XG4gICAgfVxuICAgIHNjb3JlZC5zb3J0KChhLCBiKSA9PiBiLnNjb3JlIC0gYS5zY29yZSk7XG4gICAgcmV0dXJuIHNjb3JlZC5zbGljZSgwLCBNYXRoLm1heCgxLCBsaW1pdCB8fCA1KSk7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVSZXBsYWNlQXBwbHlGbGFncyhmbGFncz86IFBhcnRpYWw8UmVwbGFjZUFwcGx5RmxhZ3M+KTogUmVwbGFjZUFwcGx5RmxhZ3Mge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gZmxhZ3MgJiYgdHlwZW9mIGZsYWdzLnBvc2l0aW9uID09PSAnYm9vbGVhbicgPyBmbGFncy5wb3NpdGlvbiA6IHRydWU7XG4gICAgY29uc3QgYW5jaG9yUGl2b3QgPSBmbGFncyAmJiB0eXBlb2YgZmxhZ3MuYW5jaG9yUGl2b3QgPT09ICdib29sZWFuJyA/IGZsYWdzLmFuY2hvclBpdm90IDogdHJ1ZTtcbiAgICByZXR1cm4ge1xuICAgICAgICBpbWFnZTogZmxhZ3MgJiYgdHlwZW9mIGZsYWdzLmltYWdlID09PSAnYm9vbGVhbicgPyBmbGFncy5pbWFnZSA6IHRydWUsXG4gICAgICAgIHRleHQ6IGZsYWdzICYmIHR5cGVvZiBmbGFncy50ZXh0ID09PSAnYm9vbGVhbicgPyBmbGFncy50ZXh0IDogdHJ1ZSxcbiAgICAgICAgcG9zaXRpb24sXG4gICAgICAgIGFuY2hvclBpdm90OiBwb3NpdGlvbiAmJiBhbmNob3JQaXZvdCxcbiAgICAgICAgcHJlc2VydmVBbHBoYTogZmxhZ3MgJiYgdHlwZW9mIGZsYWdzLnByZXNlcnZlQWxwaGEgPT09ICdib29sZWFuJyA/IGZsYWdzLnByZXNlcnZlQWxwaGEgOiB0cnVlLFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHBpY2tGaWdtYUNhbmRpZGF0ZUZvckFwcGx5KFxuICAgIGNhbmRpZGF0ZXM6IEZpZ21hTm9kZUNhbmRpZGF0ZVtdLFxuICAgIHRhcmdldDogUmVwbGFjZVRhcmdldEluZm8sXG4gICAgZmlnbWFQYXRoPzogc3RyaW5nXG4pOiB7IGNhbmRpZGF0ZTogRmlnbWFOb2RlQ2FuZGlkYXRlOyBzY29yZTogbnVtYmVyOyByZWFzb246IHN0cmluZyB9IHwgbnVsbCB7XG4gICAgY29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3RCZXN0RmlnbWFOb2RlQ2FuZGlkYXRlKGNhbmRpZGF0ZXMsIHRhcmdldCwgZmlnbWFQYXRoKTtcbiAgICBpZiAoc2VsZWN0ZWQpIHJldHVybiBzZWxlY3RlZDtcbiAgICBpZiAoZmlnbWFQYXRoKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCB0b3AgPSBsaXN0QmVzdEZpZ21hTm9kZUNhbmRpZGF0ZXMoY2FuZGlkYXRlcywgdGFyZ2V0LCAxKTtcbiAgICByZXR1cm4gdG9wLmxlbmd0aCA+IDAgJiYgdG9wWzBdLnNjb3JlID49IDIyMCA/IHRvcFswXSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIHNpemVTaW1pbGFyaXR5KGF3OiBudW1iZXIsIGFoOiBudW1iZXIsIGJ3OiBudW1iZXIsIGJoOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG1heFcgPSBNYXRoLm1heChNYXRoLmFicyhhdyksIE1hdGguYWJzKGJ3KSwgMSk7XG4gICAgY29uc3QgbWF4SCA9IE1hdGgubWF4KE1hdGguYWJzKGFoKSwgTWF0aC5hYnMoYmgpLCAxKTtcbiAgICBjb25zdCBzdyA9IE1hdGgubWF4KDAsIDEgLSBNYXRoLmFicyhhdyAtIGJ3KSAvIG1heFcpO1xuICAgIGNvbnN0IHNoID0gTWF0aC5tYXgoMCwgMSAtIE1hdGguYWJzKGFoIC0gYmgpIC8gbWF4SCk7XG4gICAgcmV0dXJuIChzdyArIHNoKSAqIDAuNTtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVGaWdtYVBhdGhOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIFN0cmluZyhuYW1lIHx8ICcnKS5yZXBsYWNlKC9bXFxcXC9dL2csICdfJykudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBmaWdtYVBhdGhTZWdtZW50KG5vZGVOYW1lOiBzdHJpbmcsIG9jY3VycmVuY2U6IG51bWJlcik6IHN0cmluZyB7XG4gICAgcmV0dXJuIG9jY3VycmVuY2UgPD0gMCA/IG5vZGVOYW1lIDogYCR7bm9kZU5hbWV9IyR7b2NjdXJyZW5jZSArIDF9YDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplUGF0aEZvckNvbXBhcmUocGF0aDogc3RyaW5nLCBzdHJpcE9jY3VycmVuY2UgPSB0cnVlKTogc3RyaW5nIHtcbiAgICByZXR1cm4gU3RyaW5nKHBhdGggfHwgJycpXG4gICAgICAgIC5zcGxpdCgnLycpXG4gICAgICAgIC5maWx0ZXIoKHBhcnQpID0+IHBhcnQgJiYgbm9ybWFsaXplTmFtZUZvckNvbXBhcmUocGFydCkgIT09ICdjYW52YXMnKVxuICAgICAgICAubWFwKChwYXJ0KSA9PiBub3JtYWxpemVOYW1lRm9yQ29tcGFyZShwYXJ0LCBzdHJpcE9jY3VycmVuY2UpKVxuICAgICAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgICAgIC5qb2luKCcvJyk7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU5hbWVGb3JDb21wYXJlKG5hbWU6IHN0cmluZywgc3RyaXBPY2N1cnJlbmNlID0gdHJ1ZSk6IHN0cmluZyB7XG4gICAgbGV0IG91dCA9IFN0cmluZyhuYW1lIHx8ICcnKTtcbiAgICBpZiAoc3RyaXBPY2N1cnJlbmNlKSBvdXQgPSBvdXQucmVwbGFjZSgvI1xcZCskL2csICcnKTtcbiAgICByZXR1cm4gb3V0XG4gICAgICAgIC5yZXBsYWNlKC9cXHMrL2csICcnKVxuICAgICAgICAudHJpbSgpXG4gICAgICAgIC50b0xvd2VyQ2FzZSgpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVUZXh0Rm9yQ29tcGFyZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBTdHJpbmcodGV4dCB8fCAnJykucmVwbGFjZSgvXFxzKy9nLCAnJykudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBzdW1tYXJpemVGaWdtYUNhbmRpZGF0ZShjYW5kaWRhdGU6IEZpZ21hTm9kZUNhbmRpZGF0ZSk6IGFueSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcGF0aDogY2FuZGlkYXRlLnBhdGgsXG4gICAgICAgIG5hbWU6IGNhbmRpZGF0ZS5uYW1lLFxuICAgICAgICB0eXBlOiBjYW5kaWRhdGUudHlwZSxcbiAgICAgICAga2luZDogY2FuZGlkYXRlLnJlcGxhY2VLaW5kLFxuICAgICAgICB3aWR0aDogY2FuZGlkYXRlLndpZHRoLFxuICAgICAgICBoZWlnaHQ6IGNhbmRpZGF0ZS5oZWlnaHQsXG4gICAgICAgIGNhbnZhc1g6IGNhbmRpZGF0ZS5jYW52YXNYLFxuICAgICAgICBjYW52YXNZOiBjYW5kaWRhdGUuY2FudmFzWSxcbiAgICAgICAgaW1hZ2VSZWY6IGNhbmRpZGF0ZS5pbWFnZVJlZixcbiAgICAgICAgdGV4dDogY2FuZGlkYXRlLmNoYXJhY3RlcnMgPyBjYW5kaWRhdGUuY2hhcmFjdGVycy5zbGljZSgwLCA4MCkgOiAnJyxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBjb2xsZWN0U2xpbU5vZGVzQnlGaWdtYVBhdGgocm9vdDogYW55KTogeyBbcGF0aDogc3RyaW5nXTogYW55IH0ge1xuICAgIGNvbnN0IG91dDogeyBbcGF0aDogc3RyaW5nXTogYW55IH0gPSB7fTtcbiAgICBjb25zdCB0b3BDb3VudHM6IHsgW25hbWU6IHN0cmluZ106IG51bWJlciB9ID0ge307XG4gICAgY29uc3QgdmlzaXQgPSAobm9kZTogYW55LCBwYXJlbnRQYXRoOiBzdHJpbmcsIHNpYmxpbmdOYW1lQ291bnQ6IHsgW25hbWU6IHN0cmluZ106IG51bWJlciB9KSA9PiB7XG4gICAgICAgIGlmICghbm9kZSkgcmV0dXJuO1xuICAgICAgICBsZXQgYmFzZU5hbWUgPSBzYW5pdGl6ZUZpZ21hUGF0aE5hbWUobm9kZS5uYW1lIHx8ICcnKTtcbiAgICAgICAgaWYgKCFiYXNlTmFtZSkgYmFzZU5hbWUgPSBub2RlLnR5cGUgPT09ICdURVhUJyA/ICdUZXh0JyA6ICdOb2RlJztcbiAgICAgICAgY29uc3Qgb2NjID0gc2libGluZ05hbWVDb3VudFtiYXNlTmFtZV0gfHwgMDtcbiAgICAgICAgc2libGluZ05hbWVDb3VudFtiYXNlTmFtZV0gPSBvY2MgKyAxO1xuICAgICAgICBjb25zdCBwYXRoID0gcGFyZW50UGF0aCA/IGAke3BhcmVudFBhdGh9LyR7ZmlnbWFQYXRoU2VnbWVudChiYXNlTmFtZSwgb2NjKX1gIDogZmlnbWFQYXRoU2VnbWVudChiYXNlTmFtZSwgb2NjKTtcbiAgICAgICAgb3V0W3BhdGhdID0gbm9kZTtcbiAgICAgICAgY29uc3QgY2hpbGRDb3VudHM6IHsgW25hbWU6IHN0cmluZ106IG51bWJlciB9ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbiB8fCBbXSkgdmlzaXQoY2hpbGQsIHBhdGgsIGNoaWxkQ291bnRzKTtcbiAgICB9O1xuICAgIHZpc2l0KHJvb3QsICcnLCB0b3BDb3VudHMpO1xuICAgIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIG1ha2VQYXRjaE5vZGVGb3JDYW5kaWRhdGUoc2xpbUJ5UGF0aDogeyBbcGF0aDogc3RyaW5nXTogYW55IH0sIHNlbGVjdGVkOiB7IGNhbmRpZGF0ZTogRmlnbWFOb2RlQ2FuZGlkYXRlIH0pOiBhbnkge1xuICAgIGNvbnN0IHNsaW0gPSBzbGltQnlQYXRoW3NlbGVjdGVkLmNhbmRpZGF0ZS5wYXRoXTtcbiAgICBjb25zdCBwYXRjaE5vZGUgPSBjbG9uZUpzb24oc2xpbSB8fCBzZWxlY3RlZC5jYW5kaWRhdGUubm9kZSk7XG4gICAgcGF0Y2hOb2RlLnggPSBzZWxlY3RlZC5jYW5kaWRhdGUuY2FudmFzWDtcbiAgICBwYXRjaE5vZGUueSA9IHNlbGVjdGVkLmNhbmRpZGF0ZS5jYW52YXNZO1xuICAgIHJldHVybiBwYXRjaE5vZGU7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVCYXRjaEFwcGx5T3B0aW9ucyhvcHRpb25zPzogQmF0Y2hSZXBsYWNlQXBwbHlPcHRpb25zKToge1xuICAgIHJvb3RVdWlkOiBzdHJpbmc7XG4gICAga2luZDogc3RyaW5nO1xuICAgIG1pblNjb3JlOiBudW1iZXI7XG4gICAgZmxhZ3M6IFJlcGxhY2VBcHBseUZsYWdzO1xuICAgIGRyeVJ1bjogYm9vbGVhbjtcbiAgICBsaW1pdDogbnVtYmVyO1xufSB7XG4gICAgY29uc3Qgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcm9vdFV1aWQ6IFN0cmluZyhvcHRzLnJvb3RVdWlkIHx8ICcnKSxcbiAgICAgICAga2luZDogU3RyaW5nKG9wdHMua2luZCB8fCAnYWxsJykudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgbWluU2NvcmU6IHR5cGVvZiBvcHRzLm1pblNjb3JlID09PSAnbnVtYmVyJyA/IG9wdHMubWluU2NvcmUgOiAzMDAsXG4gICAgICAgIGZsYWdzOiByZXNvbHZlUmVwbGFjZUFwcGx5RmxhZ3Mob3B0cy5mbGFncyksXG4gICAgICAgIGRyeVJ1bjogISFvcHRzLmRyeVJ1bixcbiAgICAgICAgbGltaXQ6IHR5cGVvZiBvcHRzLmxpbWl0ID09PSAnbnVtYmVyJyAmJiBvcHRzLmxpbWl0ID4gMCA/IE1hdGguZmxvb3Iob3B0cy5saW1pdCkgOiAwLFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVQcmV2aWV3SW1hZ2VCYXNlNjQoZGF0YTogRmlnbWFFeHBvcnREYXRhKTogeyByZWY6IHN0cmluZzsgYmFzZTY0OiBzdHJpbmcgfSB7XG4gICAgY29uc3QgZGlyZWN0ID0gKGRhdGEgYXMgYW55KS5wcmV2aWV3SW1hZ2VCYXNlNjQ7XG4gICAgaWYgKHR5cGVvZiBkaXJlY3QgPT09ICdzdHJpbmcnICYmIGRpcmVjdCkgcmV0dXJuIHsgcmVmOiAncHJldmlld0ltYWdlQmFzZTY0JywgYmFzZTY0OiBkaXJlY3QgfTtcbiAgICBjb25zdCByZWYgPSBTdHJpbmcoKGRhdGEgYXMgYW55KS5wcmV2aWV3SW1hZ2VSZWYgfHwgJycpO1xuICAgIGNvbnN0IGZyb21Qb29sID0gcmVmICYmIGRhdGEuaW1hZ2VzICYmIGRhdGEuaW1hZ2VzW3JlZl07XG4gICAgaWYgKGZyb21Qb29sKSByZXR1cm4geyByZWYsIGJhc2U2NDogZnJvbVBvb2wgfTtcbiAgICBjb25zdCBpbnRlcmZhY2VzID0gQXJyYXkuaXNBcnJheSgoZGF0YSBhcyBhbnkpLmludGVyZmFjZXMpID8gKGRhdGEgYXMgYW55KS5pbnRlcmZhY2VzIDogW107XG4gICAgZm9yIChjb25zdCBpZmFjZSBvZiBpbnRlcmZhY2VzKSB7XG4gICAgICAgIGlmIChpZmFjZSAmJiB0eXBlb2YgaWZhY2UucHJldmlld0ltYWdlQmFzZTY0ID09PSAnc3RyaW5nJyAmJiBpZmFjZS5wcmV2aWV3SW1hZ2VCYXNlNjQpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHJlZjogJ2ludGVyZmFjZS5wcmV2aWV3SW1hZ2VCYXNlNjQnLCBiYXNlNjQ6IGlmYWNlLnByZXZpZXdJbWFnZUJhc2U2NCB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGlmYWNlUmVmID0gU3RyaW5nKGlmYWNlICYmIGlmYWNlLnByZXZpZXdJbWFnZVJlZiB8fCAnJyk7XG4gICAgICAgIGNvbnN0IGlmYWNlUG9vbCA9IGlmYWNlUmVmICYmIGRhdGEuaW1hZ2VzICYmIGRhdGEuaW1hZ2VzW2lmYWNlUmVmXTtcbiAgICAgICAgaWYgKGlmYWNlUG9vbCkgcmV0dXJuIHsgcmVmOiBpZmFjZVJlZiwgYmFzZTY0OiBpZmFjZVBvb2wgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgcmVmOiAnJywgYmFzZTY0OiAnJyB9O1xufVxuXG5mdW5jdGlvbiBwcmV2aWV3TWltZUZyb21CYXNlNjQoYmFzZTY0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGlmICghYmFzZTY0KSByZXR1cm4gJ2ltYWdlL3BuZyc7XG4gICAgY29uc3QgYnl0ZXMgPSBCdWZmZXIuZnJvbShiYXNlNjQuc2xpY2UoMCwgMTYpLCAnYmFzZTY0Jyk7XG4gICAgaWYgKGJ5dGVzLmxlbmd0aCA+PSAzICYmIGJ5dGVzWzBdID09PSAweGZmICYmIGJ5dGVzWzFdID09PSAweGQ4ICYmIGJ5dGVzWzJdID09PSAweGZmKSByZXR1cm4gJ2ltYWdlL2pwZWcnO1xuICAgIGlmIChieXRlcy5sZW5ndGggPj0gNCAmJiBieXRlc1swXSA9PT0gMHg4OSAmJiBieXRlc1sxXSA9PT0gMHg1MCAmJiBieXRlc1syXSA9PT0gMHg0ZSAmJiBieXRlc1szXSA9PT0gMHg0NykgcmV0dXJuICdpbWFnZS9wbmcnO1xuICAgIHJldHVybiAnaW1hZ2UvcG5nJztcbn1cblxuZnVuY3Rpb24gdGV4dHVyZVN0YXR1c0Zyb21NYXRjaGVzKG1hdGNoZXM6IEFycmF5PHsgc291cmNlOiAnZmlnbWEtaW1wb3J0JyB8ICdwcm9qZWN0JyB9Pik6ICdwcm9qZWN0JyB8ICdmaWdtYS1pbXBvcnQnIHwgJ21pc3NpbmcnIHtcbiAgICBpZiAoIW1hdGNoZXMgfHwgbWF0Y2hlcy5sZW5ndGggPT09IDApIHJldHVybiAnbWlzc2luZyc7XG4gICAgcmV0dXJuIG1hdGNoZXMuc29tZSgoaXRlbSkgPT4gaXRlbS5zb3VyY2UgPT09ICdwcm9qZWN0JykgPyAncHJvamVjdCcgOiAnZmlnbWEtaW1wb3J0Jztcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUpzb25QYXRoRnJvbURpYWxvZyhwcmVzZXRQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmIChwcmVzZXRQYXRoKSByZXR1cm4gcHJlc2V0UGF0aDtcbiAgICBjb25zdCBwaWNrZWQgPSBhd2FpdCBFZGl0b3IuRGlhbG9nLnNlbGVjdCh7XG4gICAgICAgIHRpdGxlLFxuICAgICAgICB0eXBlOiAnZmlsZScsXG4gICAgICAgIGZpbHRlcnM6IFt7IG5hbWU6ICdKU09OJywgZXh0ZW5zaW9uczogWydqc29uJ10gfV0sXG4gICAgfSk7XG4gICAgaWYgKHBpY2tlZC5jYW5jZWxlZCB8fCBwaWNrZWQuZmlsZVBhdGhzLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnO1xuICAgIHJldHVybiBwaWNrZWQuZmlsZVBhdGhzWzBdO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXF1ZXN0U2NlbmVTbmFwc2hvdChzdGFnZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc25hcHNob3QnKTtcbiAgICAgICAgY29uc29sZS5sb2coYFtmaWdtYS1pbXBvcnRlcl0g5bey5Yib5bu65Zy65pmvIHNuYXBzaG9077yIJHtzdGFnZX3vvInjgIJgKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgW2ZpZ21hLWltcG9ydGVyXSDliJvlu7rlnLrmma8gc25hcHNob3Qg5aSx6LSl77yIJHtzdGFnZX3vvInvvIznu6fnu63lsJ3or5Xkv53lrZg6YCwgZXJyKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcXVlcnlTY2VuZURpcnR5KHN0YWdlOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4gfCBudWxsPiB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZGlydHkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdxdWVyeS1kaXJ0eScpO1xuICAgICAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSDlnLrmma8gZGlydHkg54q25oCB77yIJHtzdGFnZX3vvIk6YCwgZGlydHkpO1xuICAgICAgICByZXR1cm4gISFkaXJ0eTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBbZmlnbWEtaW1wb3J0ZXJdIOafpeivouWcuuaZryBkaXJ0eSDnirbmgIHlpLHotKXvvIgke3N0YWdlfe+8iTpgLCBlcnIpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNhdmVTY2VuZUFmdGVySW1wb3J0KHJlc3VsdDogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgcm9vdFV1aWQgPSByZXN1bHQgJiYgcmVzdWx0LmRhdGEgPyByZXN1bHQuZGF0YS5yb290VXVpZCA6ICcnO1xuICAgIGNvbnN0IHN0YXRzID0gcmVzdWx0ICYmIHJlc3VsdC5kYXRhID8gcmVzdWx0LmRhdGEgOiB7fTtcblxuICAgIC8vIOiuqSBTY2VuZS9JbnNwZWN0b3Ig5pS25Yiw5LiA5qyh5piO56Gu6IqC54K55Y+Y5YyW77yM5YaN56iN562J5LiA5ouN77yM6YG/5YWN5Yia6JC95Zyw55qE5Zu+54mH6LWE5Lqn5Yi35paw5ZKM5Zy65pmv5L+d5a2Y5LqS55u46Lip5pe25bqP44CCXG4gICAgaWYgKHJvb3RVdWlkKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBFZGl0b3IuTWVzc2FnZS5icm9hZGNhc3QoJ3NjZW5lOmNoYW5nZS1ub2RlJywgcm9vdFV1aWQpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIC8vIGJyb2FkY2FzdCDlj6rnlKjkuo7liLfmlrDnvJbovpHlmajpnaLmnb/vvIzlpLHotKXkuI3lvbHlk43lr7zlhaXnu5PmnpzjgIJcbiAgICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBkZWxheSgzMDApO1xuXG4gICAgLy8gZXhlY3V0ZS1zY2VuZS1zY3JpcHQg5Yqo5oCB5bu66IqC54K55LiN5LiA5a6a6K6p57yW6L6R5Zmo56uL5Y2z6L+b5YWlIGRpcnR5IOeKtuaAgeOAglxuICAgIC8vIOWFiOaYvuW8j+WIm+W7uiBzY2VuZSBzbmFwc2hvdO+8jOWGjSBzYXZlLXNjZW5l77yM562J5Lu35LqO57yW6L6R5Zmo5YaF5LiA5qyh5Y+v5L+d5a2Y5L+u5pS544CCXG4gICAgYXdhaXQgcXVlcnlTY2VuZURpcnR5KCdzbmFwc2hvdCDliY0nKTtcbiAgICBhd2FpdCByZXF1ZXN0U2NlbmVTbmFwc2hvdCgn5a+85YWl5a6M5oiQJyk7XG4gICAgYXdhaXQgZGVsYXkoMjUwKTtcbiAgICBhd2FpdCBxdWVyeVNjZW5lRGlydHkoJ3NuYXBzaG90IOWQjicpO1xuXG4gICAgZm9yIChsZXQgYXR0ZW1wdCA9IDE7IGF0dGVtcHQgPD0gMjsgYXR0ZW1wdCsrKSB7XG4gICAgICAgIGNvbnN0IHN0YXJ0ZWQgPSBEYXRlLm5vdygpO1xuICAgICAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSDlvIDlp4voh6rliqjkv53lrZjlnLrmma/ku6XliLfmlrDop4blm77vvIjnrKwgJHthdHRlbXB0fSDmrKHvvInjgIJgKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NhdmUtc2NlbmUnKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXJdIOW3suiHquWKqOS/neWtmOWcuuaZr+S7peWIt+aWsOinhuWbvu+8iOesrCAke2F0dGVtcHR9IOasoe+8jOiAl+aXtiAke2VsYXBzZWRNcyhzdGFydGVkKX1tc++8ieOAgmAsIHN0YXRzKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFtmaWdtYS1pbXBvcnRlcl0g6Ieq5Yqo5L+d5a2Y5Zy65pmv5aSx6LSl77yI56ysICR7YXR0ZW1wdH0g5qyh77yM6ICX5pe2ICR7ZWxhcHNlZE1zKHN0YXJ0ZWQpfW1z77yM5Y+v5omL5YqoIEN0cmwrUyDliLfmlrDvvIk6YCwgZXJyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXR0ZW1wdCA9PT0gMSkgYXdhaXQgZGVsYXkoNzAwKTtcbiAgICB9XG5cbiAgICBpZiAocm9vdFV1aWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIEVkaXRvci5NZXNzYWdlLmJyb2FkY2FzdCgnc2NlbmU6Y2hhbmdlLW5vZGUnLCByb290VXVpZCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgLy8g5ZCM5LiK44CCXG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogQGVuIFB1bGwgdGhlIGltYWdlIHBvb2wgaWQgYSBub2RlIHJlbmRlcnMgKG93biBpbWFnZVJlZiwgZWxzZSBmaXJzdCBJTUFHRSBmaWxsJ3MgaW1hZ2VSZWYpLlxuICogQHpoIOWPluiKgueCuea4suafk+eahOWbvueJh+axoCBpZO+8muS8mOWFiOiKgueCueiHqui6qyBpbWFnZVJlZu+8jOWQpuWImeesrOS4gOS4qiBJTUFHRSDloavlhYXnmoQgaW1hZ2VSZWbjgIJcbiAqL1xuZnVuY3Rpb24gZmlyc3RWaXNpYmxlSW1hZ2VGaWxsKG5vZGU6IEZpZ21hTm9kZURhdGEpOiBhbnkgfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IGZpbGxzID0gbm9kZS5maWxscyB8fCBbXTtcbiAgICByZXR1cm4gZmlsbHMuZmluZCgoZjogYW55KSA9PiBmICYmIGYudHlwZSA9PT0gJ0lNQUdFJyAmJiBmLnZpc2libGUgIT09IGZhbHNlICYmIGYuaW1hZ2VSZWYpO1xufVxuXG5mdW5jdGlvbiBub2RlSW1hZ2VSZWYobm9kZTogRmlnbWFOb2RlRGF0YSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gICAgaWYgKG5vZGUuaW1hZ2VSZWYpIHJldHVybiBub2RlLmltYWdlUmVmO1xuICAgIGNvbnN0IGltZ0ZpbGwgPSBmaXJzdFZpc2libGVJbWFnZUZpbGwobm9kZSk7XG4gICAgcmV0dXJuIGltZ0ZpbGwgPyBpbWdGaWxsLmltYWdlUmVmIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpbWFnZUZpbGxNZXRhKG5vZGU6IEZpZ21hTm9kZURhdGEpOiB7XG4gICAgc291cmNlOiAnTk9ERScgfCAnRklMTCc7XG4gICAgc2NhbGVNb2RlOiBzdHJpbmc7XG4gICAgb3BhY2l0eTogbnVtYmVyO1xuICAgIHRpbGVTY2FsaW5nRmFjdG9yPzogbnVtYmVyO1xuICAgIGNyb3BSZWN0PzogYW55O1xuICAgIGltYWdlVHJhbnNmb3JtPzogYW55O1xuICAgIHJhd1dpZHRoPzogbnVtYmVyO1xuICAgIHJhd0hlaWdodD86IG51bWJlcjtcbiAgICBza2lwQ292ZXJDcm9wPzogYm9vbGVhbjtcbn0gfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IGltZ0ZpbGwgPSBmaXJzdFZpc2libGVJbWFnZUZpbGwobm9kZSk7XG4gICAgaWYgKGltZ0ZpbGwpIHtcbiAgICAgICAgY29uc3Qgc2NhbGVNb2RlID0gU3RyaW5nKGltZ0ZpbGwuc2NhbGVNb2RlIHx8ICdGSUxMJykudG9VcHBlckNhc2UoKTtcbiAgICAgICAgY29uc3Qgb3BhY2l0eSA9IHR5cGVvZiBpbWdGaWxsLmEgPT09ICdudW1iZXInXG4gICAgICAgICAgICA/IGltZ0ZpbGwuYVxuICAgICAgICAgICAgOiAodHlwZW9mIGltZ0ZpbGwub3BhY2l0eSA9PT0gJ251bWJlcicgPyBpbWdGaWxsLm9wYWNpdHkgOiAxKTtcbiAgICAgICAgY29uc3QgbWV0YTogYW55ID0ge1xuICAgICAgICAgICAgc291cmNlOiAnRklMTCcsXG4gICAgICAgICAgICBzY2FsZU1vZGUsXG4gICAgICAgICAgICBvcGFjaXR5OiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBvcGFjaXR5KSksXG4gICAgICAgIH07XG4gICAgICAgIGlmIChzY2FsZU1vZGUgPT09ICdUSUxFJyAmJiB0eXBlb2YgaW1nRmlsbC50aWxlU2NhbGluZ0ZhY3RvciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIG1ldGEudGlsZVNjYWxpbmdGYWN0b3IgPSBpbWdGaWxsLnRpbGVTY2FsaW5nRmFjdG9yO1xuICAgICAgICB9XG4gICAgICAgIGlmIChpbWdGaWxsLmNyb3BSZWN0KSBtZXRhLmNyb3BSZWN0ID0gaW1nRmlsbC5jcm9wUmVjdDtcbiAgICAgICAgaWYgKGltZ0ZpbGwuaW1hZ2VUcmFuc2Zvcm0pIG1ldGEuaW1hZ2VUcmFuc2Zvcm0gPSBpbWdGaWxsLmltYWdlVHJhbnNmb3JtO1xuICAgICAgICByZXR1cm4gbWV0YTtcbiAgICB9XG4gICAgaWYgKG5vZGUuaW1hZ2VSZWYpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHNvdXJjZTogJ05PREUnLFxuICAgICAgICAgICAgc2NhbGVNb2RlOiAnRklMTCcsXG4gICAgICAgICAgICBvcGFjaXR5OiAxLFxuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBidWlsZEltYWdlRGltZW5zaW9uTWFwKGltYWdlcz86IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfSk6IHsgW2lkOiBzdHJpbmddOiBJbWFnZURpbWVuc2lvbnMgfSB7XG4gICAgY29uc3Qgb3V0OiB7IFtpZDogc3RyaW5nXTogSW1hZ2VEaW1lbnNpb25zIH0gPSB7fTtcbiAgICBpZiAoIWltYWdlcykgcmV0dXJuIG91dDtcbiAgICBmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKGltYWdlcykpIHtcbiAgICAgICAgY29uc3QgZGltID0gcmVhZEltYWdlRGltZW5zaW9ucyhpbWFnZXNbaWRdKTtcbiAgICAgICAgaWYgKGRpbSkgb3V0W2lkXSA9IGRpbTtcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gcmVhZEltYWdlRGltZW5zaW9ucyhiYXNlNjQ6IHN0cmluZyk6IEltYWdlRGltZW5zaW9ucyB8IG51bGwge1xuICAgIGlmICghYmFzZTY0KSByZXR1cm4gbnVsbDtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBieXRlcyA9IEJ1ZmZlci5mcm9tKGJhc2U2NCwgJ2Jhc2U2NCcpO1xuICAgICAgICAvLyBQTkc6IDggYnl0ZSBzaWduYXR1cmUgKyBJSERSIGNodW5rLCB3aWR0aC9oZWlnaHQgYmlnIGVuZGlhbiBhdCAxNi8yMC5cbiAgICAgICAgaWYgKGJ5dGVzLmxlbmd0aCA+PSAyNCAmJlxuICAgICAgICAgICAgYnl0ZXNbMF0gPT09IDB4ODkgJiYgYnl0ZXNbMV0gPT09IDB4NTAgJiYgYnl0ZXNbMl0gPT09IDB4NGUgJiYgYnl0ZXNbM10gPT09IDB4NDcpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHdpZHRoOiBieXRlcy5yZWFkVUludDMyQkUoMTYpLCBoZWlnaHQ6IGJ5dGVzLnJlYWRVSW50MzJCRSgyMCkgfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBKUEVHOiB3YWxrIFNPRiBtYXJrZXJzLlxuICAgICAgICBpZiAoYnl0ZXMubGVuZ3RoID49IDQgJiYgYnl0ZXNbMF0gPT09IDB4ZmYgJiYgYnl0ZXNbMV0gPT09IDB4ZDgpIHtcbiAgICAgICAgICAgIGxldCBvZmYgPSAyO1xuICAgICAgICAgICAgd2hpbGUgKG9mZiArIDkgPCBieXRlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBpZiAoYnl0ZXNbb2ZmXSAhPT0gMHhmZikge1xuICAgICAgICAgICAgICAgICAgICBvZmYrKztcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IG1hcmtlciA9IGJ5dGVzW29mZiArIDFdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxlbiA9IGJ5dGVzLnJlYWRVSW50MTZCRShvZmYgKyAyKTtcbiAgICAgICAgICAgICAgICBpZiAobGVuIDwgMikgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKChtYXJrZXIgPj0gMHhjMCAmJiBtYXJrZXIgPD0gMHhjMykgfHwgKG1hcmtlciA+PSAweGM1ICYmIG1hcmtlciA8PSAweGM3KSB8fFxuICAgICAgICAgICAgICAgICAgICAobWFya2VyID49IDB4YzkgJiYgbWFya2VyIDw9IDB4Y2IpIHx8IChtYXJrZXIgPj0gMHhjZCAmJiBtYXJrZXIgPD0gMHhjZikpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogYnl0ZXMucmVhZFVJbnQxNkJFKG9mZiArIDUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IGJ5dGVzLnJlYWRVSW50MTZCRShvZmYgKyA3KSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb2ZmICs9IDIgKyBsZW47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBoYXNoVGV4dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBjcmVhdGVIYXNoKCdtZDUnKS51cGRhdGUodGV4dCkuZGlnZXN0KCdoZXgnKS5zbGljZSgwLCA4KTtcbn1cblxuZnVuY3Rpb24gY2xvbmVDcm9wUmVjdEZvclBpeGVscyhjcm9wUmVjdDogYW55LCByYXc6IEltYWdlRGltZW5zaW9ucyk6XG4gICAgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwge1xuICAgIGlmICghY3JvcFJlY3QpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHggPSBOdW1iZXIoY3JvcFJlY3QueCk7XG4gICAgY29uc3QgeSA9IE51bWJlcihjcm9wUmVjdC55KTtcbiAgICBjb25zdCB3ID0gTnVtYmVyKGNyb3BSZWN0LncgPz8gY3JvcFJlY3Qud2lkdGgpO1xuICAgIGNvbnN0IGggPSBOdW1iZXIoY3JvcFJlY3QuaCA/PyBjcm9wUmVjdC5oZWlnaHQpO1xuICAgIGlmICghW3gsIHksIHcsIGhdLmV2ZXJ5KE51bWJlci5pc0Zpbml0ZSkgfHwgdyA8PSAwIHx8IGggPD0gMCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IGNyb3BSZWN0Lm5vcm1hbGl6ZWQgPT09IHRydWUgfHxcbiAgICAgICAgU3RyaW5nKGNyb3BSZWN0LnVuaXQgfHwgJycpLnRvVXBwZXJDYXNlKCkgPT09ICdOT1JNQUxJWkVEJyB8fFxuICAgICAgICAoeCA+PSAtMC4wMDEgJiYgeSA+PSAtMC4wMDEgJiYgeCA8PSAxLjAwMSAmJiB5IDw9IDEuMDAxICYmIHcgPD0gMS4wMDEgJiYgaCA8PSAxLjAwMSk7XG4gICAgcmV0dXJuIGNsYW1wQ3JvcFJlY3Qoe1xuICAgICAgICB4OiBub3JtYWxpemVkID8geCAqIHJhdy53aWR0aCA6IHgsXG4gICAgICAgIHk6IG5vcm1hbGl6ZWQgPyB5ICogcmF3LmhlaWdodCA6IHksXG4gICAgICAgIHdpZHRoOiBub3JtYWxpemVkID8gdyAqIHJhdy53aWR0aCA6IHcsXG4gICAgICAgIGhlaWdodDogbm9ybWFsaXplZCA/IGggKiByYXcuaGVpZ2h0IDogaCxcbiAgICB9LCByYXcpO1xufVxuXG5mdW5jdGlvbiBpbWFnZVRyYW5zZm9ybVRvUGl4ZWxDcm9wKGltYWdlVHJhbnNmb3JtOiBhbnksIHJhdzogSW1hZ2VEaW1lbnNpb25zKTpcbiAgICB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGltYWdlVHJhbnNmb3JtKSB8fCAhQXJyYXkuaXNBcnJheShpbWFnZVRyYW5zZm9ybVswXSkgfHwgIUFycmF5LmlzQXJyYXkoaW1hZ2VUcmFuc2Zvcm1bMV0pKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCBtID0gW1xuICAgICAgICBbTnVtYmVyKGltYWdlVHJhbnNmb3JtWzBdWzBdKSwgTnVtYmVyKGltYWdlVHJhbnNmb3JtWzBdWzFdKSwgTnVtYmVyKGltYWdlVHJhbnNmb3JtWzBdWzJdKV0sXG4gICAgICAgIFtOdW1iZXIoaW1hZ2VUcmFuc2Zvcm1bMV1bMF0pLCBOdW1iZXIoaW1hZ2VUcmFuc2Zvcm1bMV1bMV0pLCBOdW1iZXIoaW1hZ2VUcmFuc2Zvcm1bMV1bMl0pXSxcbiAgICBdO1xuICAgIGlmICghbS5mbGF0KCkuZXZlcnkoTnVtYmVyLmlzRmluaXRlKSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcHQgPSAoeDogbnVtYmVyLCB5OiBudW1iZXIpID0+ICh7XG4gICAgICAgIHg6IG1bMF1bMF0gKiB4ICsgbVswXVsxXSAqIHkgKyBtWzBdWzJdLFxuICAgICAgICB5OiBtWzFdWzBdICogeCArIG1bMV1bMV0gKiB5ICsgbVsxXVsyXSxcbiAgICB9KTtcbiAgICBjb25zdCBwdHMgPSBbcHQoMCwgMCksIHB0KDEsIDApLCBwdCgwLCAxKSwgcHQoMSwgMSldO1xuICAgIGNvbnN0IG1pblggPSBNYXRoLm1pbiguLi5wdHMubWFwKChwKSA9PiBwLngpKTtcbiAgICBjb25zdCBtYXhYID0gTWF0aC5tYXgoLi4ucHRzLm1hcCgocCkgPT4gcC54KSk7XG4gICAgY29uc3QgbWluWSA9IE1hdGgubWluKC4uLnB0cy5tYXAoKHApID0+IHAueSkpO1xuICAgIGNvbnN0IG1heFkgPSBNYXRoLm1heCguLi5wdHMubWFwKChwKSA9PiBwLnkpKTtcbiAgICByZXR1cm4gY2xvbmVDcm9wUmVjdEZvclBpeGVscyh7IHg6IG1pblgsIHk6IG1pblksIHc6IG1heFggLSBtaW5YLCBoOiBtYXhZIC0gbWluWSwgdW5pdDogJ05PUk1BTElaRUQnIH0sIHJhdyk7XG59XG5cbmZ1bmN0aW9uIGNvdmVyQ3JvcEZvclBpeGVscyhyYXc6IEltYWdlRGltZW5zaW9ucywgdGFyZ2V0VzogbnVtYmVyLCB0YXJnZXRIOiBudW1iZXIpOlxuICAgIHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBpZiAoISh0YXJnZXRXID4gMCkgfHwgISh0YXJnZXRIID4gMCkpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHRhcmdldEFzcGVjdCA9IHRhcmdldFcgLyB0YXJnZXRIO1xuICAgIGNvbnN0IHJhd0FzcGVjdCA9IHJhdy53aWR0aCAvIHJhdy5oZWlnaHQ7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodGFyZ2V0QXNwZWN0KSB8fCB0YXJnZXRBc3BlY3QgPD0gMCB8fCBNYXRoLmFicyhyYXdBc3BlY3QgLSB0YXJnZXRBc3BlY3QpIDwgMC4wMDIpIHJldHVybiBudWxsO1xuICAgIGlmIChyYXdBc3BlY3QgPiB0YXJnZXRBc3BlY3QpIHtcbiAgICAgICAgY29uc3Qgd2lkdGggPSByYXcuaGVpZ2h0ICogdGFyZ2V0QXNwZWN0O1xuICAgICAgICByZXR1cm4gY2xhbXBDcm9wUmVjdCh7IHg6IChyYXcud2lkdGggLSB3aWR0aCkgKiAwLjUsIHk6IDAsIHdpZHRoLCBoZWlnaHQ6IHJhdy5oZWlnaHQgfSwgcmF3KTtcbiAgICB9XG4gICAgY29uc3QgaGVpZ2h0ID0gcmF3LndpZHRoIC8gdGFyZ2V0QXNwZWN0O1xuICAgIHJldHVybiBjbGFtcENyb3BSZWN0KHsgeDogMCwgeTogKHJhdy5oZWlnaHQgLSBoZWlnaHQpICogMC41LCB3aWR0aDogcmF3LndpZHRoLCBoZWlnaHQgfSwgcmF3KTtcbn1cblxuZnVuY3Rpb24gY2xhbXBDcm9wUmVjdChyZWN0OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9LCByYXc6IEltYWdlRGltZW5zaW9ucyk6XG4gICAgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwge1xuICAgIGNvbnN0IHggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyYXcud2lkdGgsIHJlY3QueCkpO1xuICAgIGNvbnN0IHkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihyYXcuaGVpZ2h0LCByZWN0LnkpKTtcbiAgICBjb25zdCByaWdodCA9IE1hdGgubWF4KHgsIE1hdGgubWluKHJhdy53aWR0aCwgcmVjdC54ICsgcmVjdC53aWR0aCkpO1xuICAgIGNvbnN0IGJvdHRvbSA9IE1hdGgubWF4KHksIE1hdGgubWluKHJhdy5oZWlnaHQsIHJlY3QueSArIHJlY3QuaGVpZ2h0KSk7XG4gICAgY29uc3Qgd2lkdGggPSByaWdodCAtIHg7XG4gICAgY29uc3QgaGVpZ2h0ID0gYm90dG9tIC0geTtcbiAgICBpZiAod2lkdGggPD0gMC41IHx8IGhlaWdodCA8PSAwLjUpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7IHgsIHksIHdpZHRoLCBoZWlnaHQgfTtcbn1cblxuZnVuY3Rpb24gY3JvcElzV2hvbGVJbWFnZShjcm9wOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9LCByYXc6IEltYWdlRGltZW5zaW9ucyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBNYXRoLmFicyhjcm9wLngpIDwgMC4wMSAmJlxuICAgICAgICBNYXRoLmFicyhjcm9wLnkpIDwgMC4wMSAmJlxuICAgICAgICBNYXRoLmFicyhjcm9wLndpZHRoIC0gcmF3LndpZHRoKSA8IDAuMDEgJiZcbiAgICAgICAgTWF0aC5hYnMoY3JvcC5oZWlnaHQgLSByYXcuaGVpZ2h0KSA8IDAuMDE7XG59XG5cbmZ1bmN0aW9uIHByZXBhcmVQZXJzaXN0ZW50SW1hZ2VWYXJpYW50cyhcbiAgICByb290OiBGaWdtYU5vZGVEYXRhLFxuICAgIGltYWdlczogeyBbaWQ6IHN0cmluZ106IHN0cmluZyB9IHwgdW5kZWZpbmVkLFxuICAgIGltYWdlRGltczogeyBbaWQ6IHN0cmluZ106IEltYWdlRGltZW5zaW9ucyB9XG4pOiBQZXJzaXN0ZW50VmFyaWFudFN0YXRzIHtcbiAgICBjb25zdCBzdGF0czogUGVyc2lzdGVudFZhcmlhbnRTdGF0cyA9IHsgY3JvcHBlZEltYWdlRmlsbHM6IDAsIGNyb3BGYWlsdXJlczogMCB9O1xuICAgIGlmICghcm9vdCB8fCAhaW1hZ2VzKSByZXR1cm4gc3RhdHM7XG4gICAgY29uc3QgdmFyaWFudElkQnlLZXk6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcblxuICAgIGNvbnN0IHZpc2l0ID0gKG5vZGU6IEZpZ21hTm9kZURhdGEpID0+IHtcbiAgICAgICAgY29uc3QgZmlsbCA9IGZpcnN0VmlzaWJsZUltYWdlRmlsbChub2RlKTtcbiAgICAgICAgaWYgKGZpbGwgJiYgZmlsbC5pbWFnZVJlZiAmJiBpbWFnZXNbZmlsbC5pbWFnZVJlZl0pIHtcbiAgICAgICAgICAgIGNvbnN0IG1vZGUgPSBTdHJpbmcoZmlsbC5zY2FsZU1vZGUgfHwgJ0ZJTEwnKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgY29uc3QgcmF3ID0gaW1hZ2VEaW1zW2ZpbGwuaW1hZ2VSZWZdO1xuICAgICAgICAgICAgaWYgKHJhdyAmJiBtb2RlICE9PSAnVElMRScpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjcm9wID0gY2xvbmVDcm9wUmVjdEZvclBpeGVscyhmaWxsLmNyb3BSZWN0LCByYXcpIHx8XG4gICAgICAgICAgICAgICAgICAgIGltYWdlVHJhbnNmb3JtVG9QaXhlbENyb3AoZmlsbC5pbWFnZVRyYW5zZm9ybSwgcmF3KSB8fFxuICAgICAgICAgICAgICAgICAgICAobW9kZSA9PT0gJ0ZJTEwnIHx8IG1vZGUgPT09ICdDUk9QJyA/IGNvdmVyQ3JvcEZvclBpeGVscyhyYXcsIG5vZGUud2lkdGggfHwgMCwgbm9kZS5oZWlnaHQgfHwgMCkgOiBudWxsKTtcbiAgICAgICAgICAgICAgICBpZiAoY3JvcCAmJiAhY3JvcElzV2hvbGVJbWFnZShjcm9wLCByYXcpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke2ZpbGwuaW1hZ2VSZWZ9OiR7TWF0aC5yb3VuZChjcm9wLngpfSwke01hdGgucm91bmQoY3JvcC55KX0sJHtNYXRoLnJvdW5kKGNyb3Aud2lkdGgpfSwke01hdGgucm91bmQoY3JvcC5oZWlnaHQpfWA7XG4gICAgICAgICAgICAgICAgICAgIGxldCB2YXJpYW50SWQgPSB2YXJpYW50SWRCeUtleVtrZXldO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXZhcmlhbnRJZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3JvcHBlZCA9IGNyb3BQbmdCYXNlNjQoaW1hZ2VzW2ZpbGwuaW1hZ2VSZWZdLCBjcm9wKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjcm9wcGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyaWFudElkID0gYCR7ZmlsbC5pbWFnZVJlZn1fX2Nyb3BfJHtoYXNoVGV4dChrZXkpfWA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW1hZ2VzW3ZhcmlhbnRJZF0gPSBjcm9wcGVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlRGltc1t2YXJpYW50SWRdID0gcmVhZEltYWdlRGltZW5zaW9ucyhjcm9wcGVkKSB8fCB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBNYXRoLnJvdW5kKGNyb3Aud2lkdGgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IE1hdGgucm91bmQoY3JvcC5oZWlnaHQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyaWFudElkQnlLZXlba2V5XSA9IHZhcmlhbnRJZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0cy5jcm9wcGVkSW1hZ2VGaWxscysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0cy5jcm9wRmFpbHVyZXMrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAodmFyaWFudElkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmaWxsLmltYWdlUmVmID0gdmFyaWFudElkO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW50ZXJuYWwgQ29jb3MgaW1wb3J0IGhpbnQ6IHRoZSBQTkcgaXMgYWxyZWFkeSBjcm9wcGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0byB0aGUgbm9kZSdzIHZpc2libGUgRmlnbWEgc2FtcGxlIHJlY3QsIHNvIHN0cmV0Y2ggaXRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGludG8gdGhlIFVJVHJhbnNmb3JtIGluc3RlYWQgb2YgYXBwbHlpbmcgY292ZXIgY3JvcCBhZ2Fpbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGZpbGwuc2NhbGVNb2RlID0gJ1NUUkVUQ0gnO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGZpbGwuY3JvcFJlY3Q7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgZmlsbC5pbWFnZVRyYW5zZm9ybTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4gfHwgW10pIHZpc2l0KGNoaWxkKTtcbiAgICB9O1xuICAgIHZpc2l0KHJvb3QpO1xuICAgIHJldHVybiBzdGF0cztcbn1cblxuZnVuY3Rpb24gY29sbGVjdFNwcml0ZUZyYW1lQm9yZGVycyhyb290OiBGaWdtYU5vZGVEYXRhKTogeyBbaW1nSWQ6IHN0cmluZ106IFNwcml0ZUZyYW1lQm9yZGVyIH0ge1xuICAgIGNvbnN0IG91dDogeyBbaW1nSWQ6IHN0cmluZ106IFNwcml0ZUZyYW1lQm9yZGVyIH0gPSB7fTtcbiAgICBjb25zdCB2aXNpdCA9IChub2RlOiBGaWdtYU5vZGVEYXRhKSA9PiB7XG4gICAgICAgIGlmIChTdHJpbmcobm9kZS5jb21wb25lbnRUeXBlIHx8ICcnKS50b1VwcGVyQ2FzZSgpID09PSAnU0xJQ0U5JyAmJiBub2RlLnNsaWNlOUJvcmRlcikge1xuICAgICAgICAgICAgY29uc3QgcmVmID0gbm9kZUltYWdlUmVmKG5vZGUpO1xuICAgICAgICAgICAgaWYgKHJlZiAmJiAhb3V0W3JlZl0pIHtcbiAgICAgICAgICAgICAgICBvdXRbcmVmXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgbGVmdDogTWF0aC5tYXgoMCwgTnVtYmVyKG5vZGUuc2xpY2U5Qm9yZGVyLmxlZnQpIHx8IDApLFxuICAgICAgICAgICAgICAgICAgICByaWdodDogTWF0aC5tYXgoMCwgTnVtYmVyKG5vZGUuc2xpY2U5Qm9yZGVyLnJpZ2h0KSB8fCAwKSxcbiAgICAgICAgICAgICAgICAgICAgdG9wOiBNYXRoLm1heCgwLCBOdW1iZXIobm9kZS5zbGljZTlCb3JkZXIudG9wKSB8fCAwKSxcbiAgICAgICAgICAgICAgICAgICAgYm90dG9tOiBNYXRoLm1heCgwLCBOdW1iZXIobm9kZS5zbGljZTlCb3JkZXIuYm90dG9tKSB8fCAwKSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbiB8fCBbXSkgdmlzaXQoY2hpbGQpO1xuICAgIH07XG4gICAgdmlzaXQocm9vdCk7XG4gICAgcmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gY29sbGVjdE1hc2tJbWFnZVJlZnMocm9vdDogRmlnbWFOb2RlRGF0YSk6IFNldDxzdHJpbmc+IHtcbiAgICBjb25zdCByZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgdmlzaXQgPSAobm9kZTogRmlnbWFOb2RlRGF0YSkgPT4ge1xuICAgICAgICBjb25zdCBtYXNrID0gbm9kZSAmJiBub2RlLm1hc2s7XG4gICAgICAgIGlmIChtYXNrICYmIG1hc2suaW1hZ2VSZWYpIHtcbiAgICAgICAgICAgIHJlZnMuYWRkKFN0cmluZyhtYXNrLmltYWdlUmVmKSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuIHx8IFtdKSB2aXNpdChjaGlsZCk7XG4gICAgfTtcbiAgICB2aXNpdChyb290KTtcbiAgICByZXR1cm4gcmVmcztcbn1cblxuZnVuY3Rpb24gY2xhc3NpZnlNYXNrQWxwaGEoYmFzZTY0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBNYXNrU2hhcGVLaW5kIHtcbiAgICBpZiAoIWJhc2U2NCkgcmV0dXJuICdERUdFTkVSQVRFJztcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwbmcgPSBkZWNvZGVQbmdQaXhlbHMoQnVmZmVyLmZyb20oYmFzZTY0LCAnYmFzZTY0JykpO1xuICAgICAgICBpZiAoIXBuZyB8fCBwbmcud2lkdGggPD0gMiB8fCBwbmcuaGVpZ2h0IDw9IDIpIHJldHVybiAnREVHRU5FUkFURSc7XG5cbiAgICAgICAgY29uc3QgYWxwaGFUaHJlc2hvbGQgPSAxNjtcbiAgICAgICAgbGV0IG9wYXF1ZSA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAzOyBpIDwgcG5nLnJnYmEubGVuZ3RoOyBpICs9IDQpIHtcbiAgICAgICAgICAgIGlmIChwbmcucmdiYVtpXSA+IGFscGhhVGhyZXNob2xkKSBvcGFxdWUrKztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwaXhlbENvdW50ID0gcG5nLndpZHRoICogcG5nLmhlaWdodDtcbiAgICAgICAgY29uc3QgcmF0aW8gPSBwaXhlbENvdW50ID4gMCA/IG9wYXF1ZSAvIHBpeGVsQ291bnQgOiAwO1xuICAgICAgICBpZiAocmF0aW8gPCAwLjAxKSByZXR1cm4gJ0RFR0VORVJBVEUnO1xuXG4gICAgICAgIGNvbnN0IGFscGhhQXQgPSAoeDogbnVtYmVyLCB5OiBudW1iZXIpID0+IHBuZy5yZ2JhWyh5ICogcG5nLndpZHRoICsgeCkgKiA0ICsgM107XG4gICAgICAgIGNvbnN0IGNvcm5lcnNPcGFxdWUgPVxuICAgICAgICAgICAgYWxwaGFBdCgxLCAxKSA+IGFscGhhVGhyZXNob2xkICYmXG4gICAgICAgICAgICBhbHBoYUF0KHBuZy53aWR0aCAtIDIsIDEpID4gYWxwaGFUaHJlc2hvbGQgJiZcbiAgICAgICAgICAgIGFscGhhQXQoMSwgcG5nLmhlaWdodCAtIDIpID4gYWxwaGFUaHJlc2hvbGQgJiZcbiAgICAgICAgICAgIGFscGhhQXQocG5nLndpZHRoIC0gMiwgcG5nLmhlaWdodCAtIDIpID4gYWxwaGFUaHJlc2hvbGQ7XG4gICAgICAgIGlmIChjb3JuZXJzT3BhcXVlICYmIHJhdGlvID4gMC45OCkgcmV0dXJuICdTT0xJRF9SRUNUJztcbiAgICAgICAgcmV0dXJuICdTSEFQRUQnO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g6YGu572pIGFscGhhIOWIhuaekOWksei0pe+8jOaMieW8guW9ouWbvueJh+mBrue9qeWkhOeQhjonLCBlcnIpO1xuICAgICAgICByZXR1cm4gJ1NIQVBFRCc7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByb3V0ZU1hc2sobm9kZTogRmlnbWFOb2RlRGF0YSwgbWFza0ltYWdlczogeyBbaWQ6IHN0cmluZ106IHN0cmluZyB9KTogTWFza1JvdXRlIHwgbnVsbCB7XG4gICAgY29uc3QgbWFzayA9IG5vZGUgJiYgbm9kZS5tYXNrO1xuICAgIGlmICghbWFzayB8fCAhbWFzay5pbWFnZVJlZikgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBzaGFwZSA9IGNsYXNzaWZ5TWFza0FscGhhKG1hc2tJbWFnZXNbU3RyaW5nKG1hc2suaW1hZ2VSZWYpXSk7XG4gICAgY29uc3QgbWFza0NvdmVyc05vZGUgPVxuICAgICAgICBNYXRoLmFicyhOdW1iZXIobWFzay54KSB8fCAwKSA8PSAxICYmXG4gICAgICAgIE1hdGguYWJzKE51bWJlcihtYXNrLnkpIHx8IDApIDw9IDEgJiZcbiAgICAgICAgTWF0aC5hYnMoKE51bWJlcihtYXNrLndpZHRoKSB8fCAwKSAtIChOdW1iZXIobm9kZS53aWR0aCkgfHwgMCkpIDw9IDEgJiZcbiAgICAgICAgTWF0aC5hYnMoKE51bWJlcihtYXNrLmhlaWdodCkgfHwgMCkgLSAoTnVtYmVyKG5vZGUuaGVpZ2h0KSB8fCAwKSkgPD0gMTtcbiAgICBjb25zdCByb3RhdGVkID0gTWF0aC5hYnMoTnVtYmVyKG1hc2sucm90YXRpb24pIHx8IDApID4gMC4wMTtcbiAgICBjb25zdCBsdW1pbmFuY2UgPSBTdHJpbmcobWFzay5tYXNrVHlwZSB8fCAnJykudG9VcHBlckNhc2UoKSA9PT0gJ0xVTUlOQU5DRSc7XG5cbiAgICBpZiAoc2hhcGUgPT09ICdERUdFTkVSQVRFJykge1xuICAgICAgICByZXR1cm4geyBzaGFwZSwgdXNlSW1hZ2VNYXNrOiBmYWxzZSwgZmFsbGJhY2tSZWFzb246ICdkZWdlbmVyYXRlJyB9O1xuICAgIH1cbiAgICBpZiAoc2hhcGUgPT09ICdTT0xJRF9SRUNUJyAmJiBtYXNrQ292ZXJzTm9kZSAmJiAhcm90YXRlZCAmJiAhbHVtaW5hbmNlKSB7XG4gICAgICAgIHJldHVybiB7IHNoYXBlLCB1c2VJbWFnZU1hc2s6IGZhbHNlLCBmYWxsYmFja1JlYXNvbjogJ3NvbGlkLXJlY3QnIH07XG4gICAgfVxuICAgIHJldHVybiB7IHNoYXBlLCB1c2VJbWFnZU1hc2s6IHRydWUgfTtcbn1cblxuZnVuY3Rpb24gYnVpbGRNYXNrUm91dGVzKHJvb3Q6IEZpZ21hTm9kZURhdGEsIGltYWdlcz86IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfSk6IE1hcDxGaWdtYU5vZGVEYXRhLCBNYXNrUm91dGU+IHtcbiAgICBjb25zdCByb3V0ZXMgPSBuZXcgTWFwPEZpZ21hTm9kZURhdGEsIE1hc2tSb3V0ZT4oKTtcbiAgICBpZiAoIXJvb3QgfHwgIWltYWdlcykgcmV0dXJuIHJvdXRlcztcbiAgICBjb25zdCB2aXNpdCA9IChub2RlOiBGaWdtYU5vZGVEYXRhKSA9PiB7XG4gICAgICAgIGNvbnN0IHJvdXRlID0gcm91dGVNYXNrKG5vZGUsIGltYWdlcyk7XG4gICAgICAgIGlmIChyb3V0ZSkgcm91dGVzLnNldChub2RlLCByb3V0ZSk7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbiB8fCBbXSkgdmlzaXQoY2hpbGQpO1xuICAgIH07XG4gICAgdmlzaXQocm9vdCk7XG4gICAgcmV0dXJuIHJvdXRlcztcbn1cblxuZnVuY3Rpb24gY29sbGVjdEltYWdlTWFza1JlZnMocm9vdDogRmlnbWFOb2RlRGF0YSwgcm91dGVzOiBNYXA8RmlnbWFOb2RlRGF0YSwgTWFza1JvdXRlPik6IFNldDxzdHJpbmc+IHtcbiAgICBjb25zdCByZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgdmlzaXQgPSAobm9kZTogRmlnbWFOb2RlRGF0YSkgPT4ge1xuICAgICAgICBjb25zdCByb3V0ZSA9IHJvdXRlcy5nZXQobm9kZSk7XG4gICAgICAgIGNvbnN0IG1hc2sgPSBub2RlICYmIG5vZGUubWFzaztcbiAgICAgICAgaWYgKHJvdXRlICYmIHJvdXRlLnVzZUltYWdlTWFzayAmJiBtYXNrICYmIG1hc2suaW1hZ2VSZWYpIHtcbiAgICAgICAgICAgIHJlZnMuYWRkKFN0cmluZyhtYXNrLmltYWdlUmVmKSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuIHx8IFtdKSB2aXNpdChjaGlsZCk7XG4gICAgfTtcbiAgICB2aXNpdChyb290KTtcbiAgICByZXR1cm4gcmVmcztcbn1cblxuZnVuY3Rpb24gY29sbGVjdEltcGxpY2l0U3ByaXRlRnJhbWVCb3JkZXJzKHJvb3Q6IEZpZ21hTm9kZURhdGEsIGltYWdlRGltczogeyBbaWQ6IHN0cmluZ106IEltYWdlRGltZW5zaW9ucyB9KTpcbiAgICB7IGJvcmRlcnM6IHsgW2ltZ0lkOiBzdHJpbmddOiBTcHJpdGVGcmFtZUJvcmRlciB9OyBjb3VudDogbnVtYmVyIH0ge1xuICAgIGNvbnN0IGJvcmRlcnM6IHsgW2ltZ0lkOiBzdHJpbmddOiBTcHJpdGVGcmFtZUJvcmRlciB9ID0ge307XG4gICAgbGV0IGNvdW50ID0gMDtcbiAgICBjb25zdCB2aXNpdCA9IChub2RlOiBGaWdtYU5vZGVEYXRhKSA9PiB7XG4gICAgICAgIGNvbnN0IGRldGVjdGVkID0gZGV0ZWN0SW1wbGljaXRTbGljZTkobm9kZSwgaW1hZ2VEaW1zKTtcbiAgICAgICAgaWYgKGRldGVjdGVkICYmICFib3JkZXJzW2RldGVjdGVkLmltYWdlUmVmXSkge1xuICAgICAgICAgICAgYm9yZGVyc1tkZXRlY3RlZC5pbWFnZVJlZl0gPSBkZXRlY3RlZC5ib3JkZXI7XG4gICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbiB8fCBbXSkgdmlzaXQoY2hpbGQpO1xuICAgIH07XG4gICAgdmlzaXQocm9vdCk7XG4gICAgcmV0dXJuIHsgYm9yZGVycywgY291bnQgfTtcbn1cblxuZnVuY3Rpb24gYnVpbGRJbXBsaWNpdFNsaWNlR3JpZChub2RlOiBGaWdtYU5vZGVEYXRhLCBhbGxvd0V4cGxpY2l0UGFyZW50ID0gZmFsc2UpOlxuICAgIHsgZ3JpZDogKEZpZ21hTm9kZURhdGEgfCBudWxsKVtdW107IHJvd3M6IG51bWJlcjsgY29sczogbnVtYmVyIH0gfCBudWxsIHtcbiAgICAvLyDkuIvpmZAgMu+8muWNleS+p+i+uei3neeahOS5neWuq+WPqumcgCAyIOeJh++8iOWbuuWumui+uSArIOaLieS8uOaute+8ieOAguS4iumZkCA5ID0gM8OXMyDnmoTmnIDlpKfniYfmlbDjgIJcbiAgICBpZiAoIW5vZGUgfHwgIUFycmF5LmlzQXJyYXkobm9kZS5jaGlsZHJlbikgfHwgbm9kZS5jaGlsZHJlbi5sZW5ndGggPCAyIHx8IG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gOSkgcmV0dXJuIG51bGw7XG4gICAgaWYgKCFhbGxvd0V4cGxpY2l0UGFyZW50ICYmIFN0cmluZyhub2RlLmNvbXBvbmVudFR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCkgPT09ICdTTElDRTknKSByZXR1cm4gbnVsbDtcbiAgICBpZiAoIWFsbG93RXhwbGljaXRQYXJlbnQgJiYgbm9kZUltYWdlUmVmKG5vZGUpKSByZXR1cm4gbnVsbDtcbiAgICBpZiAobm9kZS5jaGlsZHJlbi5zb21lKChjaGlsZCkgPT4gIW5vZGVJbWFnZVJlZihjaGlsZCkpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gYnVpbGRTZW1hbnRpY1NsaWNlR3JpZChub2RlLmNoaWxkcmVuKSB8fCBidWlsZFBvc2l0aW9uU2xpY2VHcmlkKG5vZGUuY2hpbGRyZW4pO1xufVxuXG4vKipcbiAqIEB6aCDlr7npvZAgVW5pdHkgVHJ5U2V0dXBBc1NoYXJlZENyb3BwZWRJbWFnZe+8mlxuICogICAgIOeItuiKgueCueaXoOWbvuOAgeWkmuS4quebtOaOpeWtkOiKgueCueWFseS6q+WQjOS4gOW8oOWOn+Wni+Wkp+WbvuOAgeS4lOWkp+WbvuWwuuWvuOKJiOeItuWwuuWvuOaXtu+8jFxuICogICAgIOaKiueItuiKgueCueS9nOS4uuaZrumAmuWbvueJh+WvvOWFpe+8jOi3s+i/h+mCo+S6m+WIh+eJh+WtkOiKgueCueOAglxuICovXG5mdW5jdGlvbiBkZXRlY3RTaGFyZWRDcm9wcGVkSW1hZ2VSZWYobm9kZTogRmlnbWFOb2RlRGF0YSwgaW1hZ2VEaW1zOiB7IFtpZDogc3RyaW5nXTogSW1hZ2VEaW1lbnNpb25zIH0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICAgIGlmICghbm9kZSB8fCAhQXJyYXkuaXNBcnJheShub2RlLmNoaWxkcmVuKSB8fCBub2RlLmNoaWxkcmVuLmxlbmd0aCA8IDIpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKFN0cmluZyhub2RlLmNvbXBvbmVudFR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCkgPT09ICdTTElDRTknKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIGlmIChub2RlSW1hZ2VSZWYobm9kZSkpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKCEobm9kZS53aWR0aCA+IDAuNSkgfHwgIShub2RlLmhlaWdodCA+IDAuNSkpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgICBsZXQgc2hhcmVkID0gJyc7XG4gICAgbGV0IGltYWdlQ2hpbGRDb3VudCA9IDA7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgICAgIGNvbnN0IHJlZiA9IG5vZGVJbWFnZVJlZihjaGlsZCk7XG4gICAgICAgIGlmICghcmVmKSBjb250aW51ZTtcbiAgICAgICAgaW1hZ2VDaGlsZENvdW50Kys7XG4gICAgICAgIGlmICghc2hhcmVkKSBzaGFyZWQgPSByZWY7XG4gICAgICAgIGVsc2UgaWYgKHNoYXJlZCAhPT0gcmVmKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBpZiAoaW1hZ2VDaGlsZENvdW50IDwgMiB8fCAhc2hhcmVkKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZGltID0gaW1hZ2VEaW1zW3NoYXJlZF07XG4gICAgaWYgKCFkaW0pIHJldHVybiB1bmRlZmluZWQ7XG4gICAgaWYgKE1hdGguYWJzKGRpbS53aWR0aCAtIG5vZGUud2lkdGgpID4gMSB8fCBNYXRoLmFicyhkaW0uaGVpZ2h0IC0gbm9kZS5oZWlnaHQpID4gMSkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICByZXR1cm4gc2hhcmVkO1xufVxuXG5jb25zdCBTRU1BTlRJQ19TTElDRV9QT1M6IHsgW25hbWU6IHN0cmluZ106IHsgcm93OiBudW1iZXI7IGNvbDogbnVtYmVyIH0gfSA9IHtcbiAgICAndG9wLWwnOiB7IHJvdzogMCwgY29sOiAwIH0sXG4gICAgJ3RvcC1jJzogeyByb3c6IDAsIGNvbDogMSB9LFxuICAgICd0b3Atcic6IHsgcm93OiAwLCBjb2w6IDIgfSxcbiAgICAnbWlkLWwnOiB7IHJvdzogMSwgY29sOiAwIH0sXG4gICAgJ2NlbnRlcic6IHsgcm93OiAxLCBjb2w6IDEgfSxcbiAgICAnbWlkLXInOiB7IHJvdzogMSwgY29sOiAyIH0sXG4gICAgJ2JvdC1sJzogeyByb3c6IDIsIGNvbDogMCB9LFxuICAgICdib3QtYyc6IHsgcm93OiAyLCBjb2w6IDEgfSxcbiAgICAnYm90LXInOiB7IHJvdzogMiwgY29sOiAyIH0sXG59O1xuXG5mdW5jdGlvbiBkZXRlY3RJbXBsaWNpdFNsaWNlOShub2RlOiBGaWdtYU5vZGVEYXRhLCBpbWFnZURpbXM6IHsgW2lkOiBzdHJpbmddOiBJbWFnZURpbWVuc2lvbnMgfSk6IERldGVjdGVkU2xpY2U5SW5mbyB8IG51bGwge1xuICAgIGNvbnN0IGxheW91dCA9IGJ1aWxkSW1wbGljaXRTbGljZUdyaWQobm9kZSk7XG4gICAgaWYgKCFsYXlvdXQpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGltYWdlQ2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuO1xuICAgIGNvbnN0IHNoYXJlZCA9IG5vZGVJbWFnZVJlZihpbWFnZUNoaWxkcmVuWzBdKTtcbiAgICBpZiAoIXNoYXJlZCB8fCBpbWFnZUNoaWxkcmVuLnNvbWUoKGNoaWxkKSA9PiBub2RlSW1hZ2VSZWYoY2hpbGQpICE9PSBzaGFyZWQpKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBkaW0gPSBpbWFnZURpbXNbc2hhcmVkXTtcbiAgICBjb25zdCBzdGl0Y2hlZEJ5SW1wb3J0ZXIgPSAobm9kZSBhcyBhbnkpLl9fZnRvY1N0aXRjaGVkU2xpY2U5ID09PSB0cnVlO1xuICAgIGlmICghZGltIHx8ICghc3RpdGNoZWRCeUltcG9ydGVyICYmXG4gICAgICAgIChNYXRoLmFicyhkaW0ud2lkdGggLSAobm9kZS53aWR0aCB8fCAwKSkgPiAxIHx8IE1hdGguYWJzKGRpbS5oZWlnaHQgLSAobm9kZS5oZWlnaHQgfHwgMCkpID4gMSkpKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBzdGl0Y2hlZEJvcmRlciA9IChub2RlIGFzIGFueSkuX19mdG9jU3RpdGNoZWRTbGljZTlCb3JkZXI7XG4gICAgY29uc3QgYm9yZGVyID0gc3RpdGNoZWRCb3JkZXJcbiAgICAgICAgPyBub3JtYWxpemVkU2xpY2U5Qm9yZGVyKHN0aXRjaGVkQm9yZGVyKVxuICAgICAgICA6IHNsaWNlR3JpZEJvcmRlcihsYXlvdXQuZ3JpZCwgbGF5b3V0LnJvd3MsIGxheW91dC5jb2xzKTtcbiAgICAvLyDlhaggMCBib3JkZXIg4oeSIOayoeacieS7u+S9leWbuuWumui+ue+8jOW9k+S5neWuq+aXoOaEj+S5ie+8iOS5n+WPr+iDveaYryBjb25zdHJhaW50cyDkuI3lj6/nlKjkuJRcbiAgICAvLyDokL3lnKjmnprkuL7lm57okL3kuYvlpJbnmoTnu4TlkIjvvInjgILnu7TmjIHkuI3or4bliKvvvIzliKvmiormma7pgJrmi7zlm77lvZPmiJBcIuWFqCAwIOi+ueS5neWuq1wi44CCXG4gICAgaWYgKCEoYm9yZGVyLmxlZnQgPiAwIHx8IGJvcmRlci5yaWdodCA+IDAgfHwgYm9yZGVyLnRvcCA+IDAgfHwgYm9yZGVyLmJvdHRvbSA+IDApKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgICBpbWFnZVJlZjogc2hhcmVkLFxuICAgICAgICBib3JkZXIsXG4gICAgICAgIGNoaWxkcmVuVG9Ta2lwOiBuZXcgU2V0KGltYWdlQ2hpbGRyZW4pLFxuICAgICAgICByb3dzOiBsYXlvdXQucm93cyxcbiAgICAgICAgY29sczogbGF5b3V0LmNvbHMsXG4gICAgfTtcbn1cblxuLyoqXG4gKiBMZWdhY3kvVW5pdHktY29tcGF0aWJsZSBzbGljZSBleHBvcnRzIGNhbiBjb250YWluIHRocmVlIG9yIG5pbmUgaW5kZXBlbmRlbnQgUE5Hcy5cbiAqIENvY29zIG5lZWRzIG9uZSBTcHJpdGVGcmFtZSBmb3IgU0xJQ0VEIHJlbmRlcmluZywgc28gcmVidWlsZCB0aGUgc291cmNlIHJhc3RlciBiZWZvcmVcbiAqIHNlbWFudGljIGJvcmRlciBpc29sYXRpb24uIFNoYXJlZC1zb3VyY2UgY3JvcCBncmlkcyBrZWVwIHVzaW5nIHRoZSBjaGVhcGVyIGV4aXN0aW5nIHBhdGguXG4gKi9cbmZ1bmN0aW9uIHByZXBhcmVTdGl0Y2hlZEltcGxpY2l0U2xpY2U5KFxuICAgIG5vZGU6IEZpZ21hTm9kZURhdGEsXG4gICAgaW1hZ2VzOiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIH0sXG4gICAgaW1hZ2VEaW1zOiB7IFtpZDogc3RyaW5nXTogSW1hZ2VEaW1lbnNpb25zIH0sXG4gICAgYWxsb3dFeHBsaWNpdFBhcmVudCA9IGZhbHNlLFxuKTogRGV0ZWN0ZWRTbGljZTlJbmZvIHwgbnVsbCB7XG4gICAgY29uc3QgbGF5b3V0ID0gYnVpbGRJbXBsaWNpdFNsaWNlR3JpZChub2RlLCBhbGxvd0V4cGxpY2l0UGFyZW50KTtcbiAgICBpZiAoIWxheW91dCkgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBjZWxscyA9IGxheW91dC5ncmlkLmZsYXQoKS5maWx0ZXIoQm9vbGVhbikgYXMgRmlnbWFOb2RlRGF0YVtdO1xuICAgIGNvbnN0IHJlZnMgPSBjZWxscy5tYXAoKGNlbGwpID0+IFN0cmluZyhub2RlSW1hZ2VSZWYoY2VsbCkgfHwgJycpKTtcbiAgICBpZiAocmVmcy5zb21lKChyZWYpID0+ICFyZWYgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChpbWFnZXMsIHJlZikpKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOeWkeS8vOeijueJh+S5neWuq+e8uuWwkeWbvueJh+axoOi1hOa6kO+8jOS/neeVmeWOn+WtkOagke+8miR7bm9kZS5uYW1lIHx8IG5vZGUuZmlnbWFJZCB8fCAnKHVubmFtZWQpJ31gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAocmVmcy5ldmVyeSgocmVmKSA9PiByZWYgPT09IHJlZnNbMF0pKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGRlY29kZWQ6IChQbmdQaXhlbERhdGEgfCBudWxsKVtdW10gPSBsYXlvdXQuZ3JpZC5tYXAoKHJvdykgPT4gcm93Lm1hcCgoY2VsbCkgPT4ge1xuICAgICAgICBpZiAoIWNlbGwpIHJldHVybiBudWxsO1xuICAgICAgICBjb25zdCByZWYgPSBTdHJpbmcobm9kZUltYWdlUmVmKGNlbGwpIHx8ICcnKTtcbiAgICAgICAgcmV0dXJuIGRlY29kZVBuZ1BpeGVscyhCdWZmZXIuZnJvbShpbWFnZXNbcmVmXSwgJ2Jhc2U2NCcpKTtcbiAgICB9KSk7XG4gICAgaWYgKGRlY29kZWQuc29tZSgocm93KSA9PiByb3cuc29tZSgocG5nKSA9PiAhcG5nKSkpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0g56KO54mH5Lmd5a6rIFBORyDop6PnoIHlpLHotKXvvIzkv53nlZnljp/lrZDmoJHvvJoke25vZGUubmFtZSB8fCBub2RlLmZpZ21hSWQgfHwgJyh1bm5hbWVkKSd9YFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBGcmFjdGlvbmFsIEZpZ21hIGdlb21ldHJ5IGNhbiByb3VuZCBhZGphY2VudCBleHBvcnRzIGJ5IG9uZSBwaXhlbC4gVXNlIHRoZVxuICAgIC8vIGxhcmdlc3QgcmFzdGVyIGluIGVhY2ggcm93L2NvbHVtbiBpbnN0ZWFkIG9mIHJlamVjdGluZyBhbiBvdGhlcndpc2UgdmFsaWQgZ3JpZC5cbiAgICBjb25zdCBjb2xXaWR0aHMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBsYXlvdXQuY29scyB9LCAoXywgY29sKSA9PlxuICAgICAgICBNYXRoLm1heCguLi5kZWNvZGVkLm1hcCgocm93KSA9PiByb3dbY29sXSEud2lkdGgpKSk7XG4gICAgY29uc3Qgcm93SGVpZ2h0cyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IGxheW91dC5yb3dzIH0sIChfLCByb3cpID0+XG4gICAgICAgIE1hdGgubWF4KC4uLmRlY29kZWRbcm93XS5tYXAoKHBuZykgPT4gcG5nIS5oZWlnaHQpKSk7XG5cbiAgICBjb25zdCB3aWR0aCA9IGNvbFdpZHRocy5yZWR1Y2UoKHN1bSwgdmFsdWUpID0+IHN1bSArIHZhbHVlLCAwKTtcbiAgICBjb25zdCBoZWlnaHQgPSByb3dIZWlnaHRzLnJlZHVjZSgoc3VtLCB2YWx1ZSkgPT4gc3VtICsgdmFsdWUsIDApO1xuICAgIGlmICh3aWR0aCA8PSAwIHx8IGhlaWdodCA8PSAwKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCByZ2JhID0gQnVmZmVyLmFsbG9jKHdpZHRoICogaGVpZ2h0ICogNCk7XG4gICAgbGV0IHkgPSAwO1xuICAgIGZvciAobGV0IHJvdyA9IDA7IHJvdyA8IGxheW91dC5yb3dzOyByb3crKykge1xuICAgICAgICBsZXQgeCA9IDA7XG4gICAgICAgIGZvciAobGV0IGNvbCA9IDA7IGNvbCA8IGxheW91dC5jb2xzOyBjb2wrKykge1xuICAgICAgICAgICAgY29uc3QgcG5nID0gZGVjb2RlZFtyb3ddW2NvbF0hO1xuICAgICAgICAgICAgZm9yIChsZXQgc291cmNlUm93ID0gMDsgc291cmNlUm93IDwgcG5nLmhlaWdodDsgc291cmNlUm93KyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2VTdGFydCA9IHNvdXJjZVJvdyAqIHBuZy53aWR0aCAqIDQ7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0U3RhcnQgPSAoKHkgKyBzb3VyY2VSb3cpICogd2lkdGggKyB4KSAqIDQ7XG4gICAgICAgICAgICAgICAgcG5nLnJnYmEuY29weShyZ2JhLCB0YXJnZXRTdGFydCwgc291cmNlU3RhcnQsIHNvdXJjZVN0YXJ0ICsgcG5nLndpZHRoICogNCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB4ICs9IGNvbFdpZHRoc1tjb2xdO1xuICAgICAgICB9XG4gICAgICAgIHkgKz0gcm93SGVpZ2h0c1tyb3ddO1xuICAgIH1cblxuICAgIGNvbnN0IHN0aXRjaGVkID0gZW5jb2RlUG5nUGl4ZWxzKHsgd2lkdGgsIGhlaWdodCwgcmdiYSB9KTtcbiAgICBjb25zdCBzdGl0Y2hlZFJlZiA9IGBmdG9jX3N0aXRjaGVkX3NsaWNlOV8ke2NyZWF0ZUhhc2goJ21kNScpLnVwZGF0ZShzdGl0Y2hlZCkuZGlnZXN0KCdoZXgnKS5zbGljZSgwLCAxNil9YDtcbiAgICBpbWFnZXNbc3RpdGNoZWRSZWZdID0gc3RpdGNoZWQudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIGltYWdlRGltc1tzdGl0Y2hlZFJlZl0gPSB7IHdpZHRoLCBoZWlnaHQgfTtcbiAgICBjb25zdCBzdGl0Y2hlZEJvcmRlcjogU3ByaXRlRnJhbWVCb3JkZXIgPSB7XG4gICAgICAgIGxlZnQ6IGxheW91dC5jb2xzID09PSAzID8gY29sV2lkdGhzWzBdIDogMCxcbiAgICAgICAgcmlnaHQ6IGxheW91dC5jb2xzID09PSAzID8gY29sV2lkdGhzWzJdIDogMCxcbiAgICAgICAgdG9wOiBsYXlvdXQucm93cyA9PT0gMyA/IHJvd0hlaWdodHNbMF0gOiAwLFxuICAgICAgICBib3R0b206IGxheW91dC5yb3dzID09PSAzID8gcm93SGVpZ2h0c1syXSA6IDAsXG4gICAgfTtcbiAgICAobm9kZSBhcyBhbnkpLl9fZnRvY1N0aXRjaGVkU2xpY2U5ID0gdHJ1ZTtcbiAgICAobm9kZSBhcyBhbnkpLl9fZnRvY1N0aXRjaGVkU2xpY2U5Qm9yZGVyID0gc3RpdGNoZWRCb3JkZXI7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGNlbGxzLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICByZXdyaXRlTm9kZUltYWdlUmVmKGNlbGxzW2luZGV4XSwgcmVmc1tpbmRleF0sIHN0aXRjaGVkUmVmKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0gVW5pdHkg6aOO5qC856KO54mH5Lmd5a6r5bey5ou85ZCI77yaJHtub2RlLm5hbWUgfHwgbm9kZS5maWdtYUlkIHx8ICcodW5uYW1lZCknfSBgICtcbiAgICAgICAgYCR7bGF5b3V0LnJvd3N9eCR7bGF5b3V0LmNvbHN9IC0+ICR7d2lkdGh9eCR7aGVpZ2h0fWBcbiAgICApO1xuICAgIHJldHVybiB7XG4gICAgICAgIGltYWdlUmVmOiBzdGl0Y2hlZFJlZixcbiAgICAgICAgYm9yZGVyOiBzdGl0Y2hlZEJvcmRlcixcbiAgICAgICAgY2hpbGRyZW5Ub1NraXA6IG5ldyBTZXQoY2VsbHMpLFxuICAgICAgICByb3dzOiBsYXlvdXQucm93cyxcbiAgICAgICAgY29sczogbGF5b3V0LmNvbHMsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplZFNsaWNlOUJvcmRlcihib3JkZXI6IGFueSk6IFNwcml0ZUZyYW1lQm9yZGVyIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBsZWZ0OiBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKE51bWJlcihib3JkZXIgJiYgYm9yZGVyLmxlZnQpIHx8IDApKSxcbiAgICAgICAgcmlnaHQ6IE1hdGgubWF4KDAsIE1hdGgucm91bmQoTnVtYmVyKGJvcmRlciAmJiBib3JkZXIucmlnaHQpIHx8IDApKSxcbiAgICAgICAgdG9wOiBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKE51bWJlcihib3JkZXIgJiYgYm9yZGVyLnRvcCkgfHwgMCkpLFxuICAgICAgICBib3R0b206IE1hdGgubWF4KDAsIE1hdGgucm91bmQoTnVtYmVyKGJvcmRlciAmJiBib3JkZXIuYm90dG9tKSB8fCAwKSksXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gc2VtYW50aWNTbGljZTlJbWFnZVJlZihpbWFnZVJlZjogc3RyaW5nLCBib3JkZXI6IFNwcml0ZUZyYW1lQm9yZGVyKTogc3RyaW5nIHtcbiAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplZFNsaWNlOUJvcmRlcihib3JkZXIpO1xuICAgIGNvbnN0IHNpZ25hdHVyZSA9IGAke25vcm1hbGl6ZWQubGVmdH1fJHtub3JtYWxpemVkLnJpZ2h0fV8ke25vcm1hbGl6ZWQudG9wfV8ke25vcm1hbGl6ZWQuYm90dG9tfWA7XG4gICAgY29uc3QgYmFzZVJlZiA9IFN0cmluZyhpbWFnZVJlZiB8fCAnJykucmVwbGFjZSgvX19mdG9jX3NsaWNlOV9cXGQrX1xcZCtfXFxkK19cXGQrJC8sICcnKTtcbiAgICByZXR1cm4gYCR7YmFzZVJlZn1fX2Z0b2Nfc2xpY2U5XyR7c2lnbmF0dXJlfWA7XG59XG5cbmZ1bmN0aW9uIHJld3JpdGVOb2RlSW1hZ2VSZWYobm9kZTogRmlnbWFOb2RlRGF0YSwgc291cmNlUmVmOiBzdHJpbmcsIHNlbWFudGljUmVmOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBpZiAoU3RyaW5nKG5vZGUuaW1hZ2VSZWYgfHwgJycpID09PSBzb3VyY2VSZWYpIHtcbiAgICAgICAgbm9kZS5pbWFnZVJlZiA9IHNlbWFudGljUmVmO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgZmlsbCA9IGZpcnN0VmlzaWJsZUltYWdlRmlsbChub2RlKTtcbiAgICBpZiAoZmlsbCAmJiBTdHJpbmcoZmlsbC5pbWFnZVJlZiB8fCAnJykgPT09IHNvdXJjZVJlZikge1xuICAgICAgICBmaWxsLmltYWdlUmVmID0gc2VtYW50aWNSZWY7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGNvbGxhcHNlRXhwbGljaXRTbGljZUNoaWxkcmVuVG9QYXJlbnQobm9kZTogRmlnbWFOb2RlRGF0YSk6IHZvaWQge1xuICAgIGNvbnN0IHBhcmVudFJlZiA9IFN0cmluZyhub2RlSW1hZ2VSZWYobm9kZSkgfHwgJycpO1xuICAgIGNvbnN0IGxheW91dCA9IGJ1aWxkSW1wbGljaXRTbGljZUdyaWQobm9kZSwgdHJ1ZSk7XG4gICAgaWYgKCFwYXJlbnRSZWYgfHwgIWxheW91dCkgcmV0dXJuO1xuICAgIGZvciAoY29uc3QgY2VsbCBvZiBsYXlvdXQuZ3JpZC5mbGF0KCkpIHtcbiAgICAgICAgaWYgKCFjZWxsKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgY2hpbGRSZWYgPSBTdHJpbmcobm9kZUltYWdlUmVmKGNlbGwpIHx8ICcnKTtcbiAgICAgICAgaWYgKGNoaWxkUmVmKSByZXdyaXRlTm9kZUltYWdlUmVmKGNlbGwsIGNoaWxkUmVmLCBwYXJlbnRSZWYpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcHJ1bmVVbnVzZWRJbWFnZVBvb2woXG4gICAgcm9vdDogRmlnbWFOb2RlRGF0YSxcbiAgICBpbWFnZXM6IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCxcbiAgICBpbWFnZURpbXM6IHsgW2lkOiBzdHJpbmddOiBJbWFnZURpbWVuc2lvbnMgfSxcbik6IG51bWJlciB7XG4gICAgaWYgKCFyb290IHx8ICFpbWFnZXMpIHJldHVybiAwO1xuICAgIGNvbnN0IHVzZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBjb25zdCB2aXNpdCA9IChub2RlOiBGaWdtYU5vZGVEYXRhKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlZiA9IG5vZGVJbWFnZVJlZihub2RlKTtcbiAgICAgICAgaWYgKHJlZikgdXNlZC5hZGQoU3RyaW5nKHJlZikpO1xuICAgICAgICBjb25zdCBtYXNrUmVmID0gbm9kZSAmJiBub2RlLm1hc2sgJiYgbm9kZS5tYXNrLmltYWdlUmVmO1xuICAgICAgICBpZiAobWFza1JlZikgdXNlZC5hZGQoU3RyaW5nKG1hc2tSZWYpKTtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuIHx8IFtdKSB2aXNpdChjaGlsZCk7XG4gICAgfTtcbiAgICB2aXNpdChyb290KTtcblxuICAgIGxldCByZW1vdmVkID0gMDtcbiAgICBmb3IgKGNvbnN0IHJlZiBvZiBPYmplY3Qua2V5cyhpbWFnZXMpKSB7XG4gICAgICAgIGlmICh1c2VkLmhhcyhyZWYpKSBjb250aW51ZTtcbiAgICAgICAgZGVsZXRlIGltYWdlc1tyZWZdO1xuICAgICAgICBkZWxldGUgaW1hZ2VEaW1zW3JlZl07XG4gICAgICAgIHJlbW92ZWQrKztcbiAgICB9XG4gICAgcmV0dXJuIHJlbW92ZWQ7XG59XG5cbi8qKlxuICogQHpoIOWQjOS4gCBQTkcg55qEIFNwcml0ZUZyYW1lIGJvcmRlciDmmK/otYTmupDnuqfnirbmgIHvvIzkuI3og73nlLHkuI3lkIwgU0xJQ0U5IOiKgueCueWFseS6q+WQjuS6kuebuOimhuebluOAglxuICogICAgIOWcqOiQveebmOWSjCBzbGltVHJlZSDmn6Xlm77liY3vvIzmiorjgIzljp8gaW1hZ2VSZWYgKyDlvZLkuIDljJYgYm9yZGVy44CN5Y+Y5oiQ56iz5a6a6K+t5LmJIHJlZu+8mlxuICogICAgIOWQjOWbvuWQjCBib3JkZXIg5aSN55So5LiA5LiqIHJlZu+8m+WQjOWbvuS4jeWQjCBib3JkZXIg6L+b5YWl5LiN5ZCMIFNwcml0ZUZyYW1l77yb5pmu6YCa5Zu+54mHIHJlZiDkuI3lj5jjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVTbGljZTlJbWFnZVZhcmlhbnRzKFxuICAgIHJvb3Q6IEZpZ21hTm9kZURhdGEsXG4gICAgaW1hZ2VzOiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIH0gfCB1bmRlZmluZWQsXG4gICAgaW1hZ2VEaW1zOiB7IFtpZDogc3RyaW5nXTogSW1hZ2VEaW1lbnNpb25zIH1cbik6IFNsaWNlOUltYWdlVmFyaWFudFN0YXRzIHtcbiAgICBjb25zdCBzdGF0czogU2xpY2U5SW1hZ2VWYXJpYW50U3RhdHMgPSB7XG4gICAgICAgIGV4cGxpY2l0Tm9kZXM6IDAsXG4gICAgICAgIGltcGxpY2l0Tm9kZXM6IDAsXG4gICAgICAgIHNlbWFudGljSW1hZ2VzOiAwLFxuICAgICAgICBtaXNzaW5nSW1hZ2VzOiAwLFxuICAgIH07XG4gICAgaWYgKCFyb290IHx8ICFpbWFnZXMpIHJldHVybiBzdGF0cztcblxuICAgIGNvbnN0IHNlbWFudGljUmVmcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IG1pc3NpbmdSZWZzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgY29uc3QgYXBwbHlWYXJpYW50ID0gKFxuICAgICAgICBub2RlczogRmlnbWFOb2RlRGF0YVtdLFxuICAgICAgICBpbWFnZVJlZjogc3RyaW5nLFxuICAgICAgICBib3JkZXI6IFNwcml0ZUZyYW1lQm9yZGVyXG4gICAgKTogYm9vbGVhbiA9PiB7XG4gICAgICAgIGNvbnN0IHNvdXJjZVJlZiA9IFN0cmluZyhpbWFnZVJlZiB8fCAnJyk7XG4gICAgICAgIGlmICghc291cmNlUmVmIHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW1hZ2VzLCBzb3VyY2VSZWYpKSB7XG4gICAgICAgICAgICBpZiAoc291cmNlUmVmKSBtaXNzaW5nUmVmcy5hZGQoc291cmNlUmVmKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNlbWFudGljUmVmID0gc2VtYW50aWNTbGljZTlJbWFnZVJlZihzb3VyY2VSZWYsIGJvcmRlcik7XG4gICAgICAgIGNvbnN0IHNvdXJjZUltYWdlID0gaW1hZ2VzW3NvdXJjZVJlZl07XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW1hZ2VzLCBzZW1hbnRpY1JlZikgJiYgaW1hZ2VzW3NlbWFudGljUmVmXSAhPT0gc291cmNlSW1hZ2UpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgW2ZpZ21hLWltcG9ydGVyXSBTTElDRTkgc2VtYW50aWMgaW1hZ2UgcmVmIGNvbGxpc2lvbjogJHtzZW1hbnRpY1JlZn1gKTtcbiAgICAgICAgfVxuICAgICAgICBpbWFnZXNbc2VtYW50aWNSZWZdID0gc291cmNlSW1hZ2U7XG4gICAgICAgIGlmIChpbWFnZURpbXNbc291cmNlUmVmXSkgaW1hZ2VEaW1zW3NlbWFudGljUmVmXSA9IGltYWdlRGltc1tzb3VyY2VSZWZdO1xuXG4gICAgICAgIGxldCByZXdyaXR0ZW4gPSBmYWxzZTtcbiAgICAgICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICAgICAgICByZXdyaXR0ZW4gPSByZXdyaXRlTm9kZUltYWdlUmVmKG5vZGUsIHNvdXJjZVJlZiwgc2VtYW50aWNSZWYpIHx8IHJld3JpdHRlbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmV3cml0dGVuKSBzZW1hbnRpY1JlZnMuYWRkKHNlbWFudGljUmVmKTtcbiAgICAgICAgcmV0dXJuIHJld3JpdHRlbjtcbiAgICB9O1xuXG4gICAgY29uc3QgdmlzaXQgPSAobm9kZTogRmlnbWFOb2RlRGF0YSkgPT4ge1xuICAgICAgICBpZiAoU3RyaW5nKG5vZGUuY29tcG9uZW50VHlwZSB8fCAnJykudG9VcHBlckNhc2UoKSA9PT0gJ1NMSUNFOScgJiYgbm9kZS5zbGljZTlCb3JkZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IGltYWdlUmVmID0gbm9kZUltYWdlUmVmKG5vZGUpO1xuICAgICAgICAgICAgbGV0IGFwcGxpZWQgPSBpbWFnZVJlZiAmJiBhcHBseVZhcmlhbnQoW25vZGVdLCBpbWFnZVJlZiwgbm9ybWFsaXplZFNsaWNlOUJvcmRlcihub2RlLnNsaWNlOUJvcmRlcikpO1xuICAgICAgICAgICAgaWYgKCFhcHBsaWVkKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RpdGNoZWQgPSBwcmVwYXJlU3RpdGNoZWRJbXBsaWNpdFNsaWNlOShub2RlLCBpbWFnZXMsIGltYWdlRGltcywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHN0aXRjaGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGUuaW1hZ2VSZWYgPSBzdGl0Y2hlZC5pbWFnZVJlZjtcbiAgICAgICAgICAgICAgICAgICAgYXBwbGllZCA9IGFwcGx5VmFyaWFudChbbm9kZV0sIHN0aXRjaGVkLmltYWdlUmVmLCBub3JtYWxpemVkU2xpY2U5Qm9yZGVyKG5vZGUuc2xpY2U5Qm9yZGVyKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZVJlZikgbWlzc2luZ1JlZnMuZGVsZXRlKFN0cmluZyhpbWFnZVJlZikpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChhcHBsaWVkKSB7XG4gICAgICAgICAgICAgICAgY29sbGFwc2VFeHBsaWNpdFNsaWNlQ2hpbGRyZW5Ub1BhcmVudChub2RlKTtcbiAgICAgICAgICAgICAgICBzdGF0cy5leHBsaWNpdE5vZGVzKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBkZXRlY3RlZCA9IHByZXBhcmVTdGl0Y2hlZEltcGxpY2l0U2xpY2U5KG5vZGUsIGltYWdlcywgaW1hZ2VEaW1zKSB8fFxuICAgICAgICAgICAgICAgIGRldGVjdEltcGxpY2l0U2xpY2U5KG5vZGUsIGltYWdlRGltcyk7XG4gICAgICAgICAgICBpZiAoZGV0ZWN0ZWQgJiYgYXBwbHlWYXJpYW50KFxuICAgICAgICAgICAgICAgIEFycmF5LmZyb20oZGV0ZWN0ZWQuY2hpbGRyZW5Ub1NraXApLFxuICAgICAgICAgICAgICAgIGRldGVjdGVkLmltYWdlUmVmLFxuICAgICAgICAgICAgICAgIG5vcm1hbGl6ZWRTbGljZTlCb3JkZXIoZGV0ZWN0ZWQuYm9yZGVyKVxuICAgICAgICAgICAgKSkge1xuICAgICAgICAgICAgICAgIHN0YXRzLmltcGxpY2l0Tm9kZXMrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4gfHwgW10pIHZpc2l0KGNoaWxkKTtcbiAgICB9O1xuICAgIHZpc2l0KHJvb3QpO1xuXG4gICAgc3RhdHMuc2VtYW50aWNJbWFnZXMgPSBzZW1hbnRpY1JlZnMuc2l6ZTtcbiAgICBzdGF0cy5taXNzaW5nSW1hZ2VzID0gbWlzc2luZ1JlZnMuc2l6ZTtcbiAgICByZXR1cm4gc3RhdHM7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkU2VtYW50aWNTbGljZUdyaWQoY2hpbGRyZW46IEZpZ21hTm9kZURhdGFbXSk6XG4gICAgeyBncmlkOiAoRmlnbWFOb2RlRGF0YSB8IG51bGwpW11bXTsgcm93czogbnVtYmVyOyBjb2xzOiBudW1iZXIgfSB8IG51bGwge1xuICAgIGNvbnN0IHBsYWNlZDogKEZpZ21hTm9kZURhdGEgfCBudWxsKVtdW10gPSBbXG4gICAgICAgIFtudWxsLCBudWxsLCBudWxsXSxcbiAgICAgICAgW251bGwsIG51bGwsIG51bGxdLFxuICAgICAgICBbbnVsbCwgbnVsbCwgbnVsbF0sXG4gICAgXTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgIGNvbnN0IGtleSA9IFN0cmluZyhjaGlsZC5uYW1lIHx8ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgY29uc3QgcG9zID0gU0VNQU5USUNfU0xJQ0VfUE9TW2tleV07XG4gICAgICAgIGlmICghcG9zIHx8IHBsYWNlZFtwb3Mucm93XVtwb3MuY29sXSkgcmV0dXJuIG51bGw7XG4gICAgICAgIHBsYWNlZFtwb3Mucm93XVtwb3MuY29sXSA9IGNoaWxkO1xuICAgIH1cbiAgICByZXR1cm4gY29tcGFjdFNsaWNlR3JpZChwbGFjZWQpO1xufVxuXG5mdW5jdGlvbiBidWlsZFBvc2l0aW9uU2xpY2VHcmlkKGNoaWxkcmVuOiBGaWdtYU5vZGVEYXRhW10pOlxuICAgIHsgZ3JpZDogKEZpZ21hTm9kZURhdGEgfCBudWxsKVtdW107IHJvd3M6IG51bWJlcjsgY29sczogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBpZiAoIWNoaWxkcmVuLmV2ZXJ5KChjaGlsZCkgPT4gU3RyaW5nKGNoaWxkLm5hbWUgfHwgJycpLnRvTG93ZXJDYXNlKCkgPT09ICdyZWN0YW5nbGUnKSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgeHMgPSBjbHVzdGVyTnVtYmVycyhjaGlsZHJlbi5tYXAoKGNoaWxkKSA9PiBOdW1iZXIoY2hpbGQueCkgfHwgMCksIDIpO1xuICAgIGNvbnN0IHlzID0gY2x1c3Rlck51bWJlcnMoY2hpbGRyZW4ubWFwKChjaGlsZCkgPT4gTnVtYmVyKGNoaWxkLnkpIHx8IDApLCAyKTtcbiAgICAvLyDkuI3lho3mnprkuL4gM3gxIC8gMXgzIC8gM3gz77ya5Lu75oSPIHJvd3PDl2NvbHPvvIjlkIQgMS4uM++8jDHDlzEg6Zmk5aSW77yJ6YO95Y+v6IO95piv5YiH54mH5biD5bGA44CCXG4gICAgLy8g5Y2V5L6n6L656Led5Y+q6ZyAIDHDlzIgLyAyw5cx77yM55u46YK75Lik5L6n6ZyAIDLDlzLvvIzkuIDovbTkuKTkvqcr5Y+m5LiA6L205Y2V5L6n6ZyAIDLDlzMgLyAzw5cyXG4gICAgLy/vvIjljp/lhYhcIuWPquiupCAzLzlcIuato+aYr+mSiemSieWPjemmiCAjMzQg55qE5qC55Zug5LmL5LiA77yJ44CC5ZOq5Yeg5L6n5piv5Zu65a6a6L655Lqk55SxXG4gICAgLy8gc2xpY2VHcmlkQm9yZGVyIOaMiSBjb25zdHJhaW50cyDliKTlrprvvJvliKTkuI3lh7rmnaXkvJrov5Tlm57lhaggMO+8jOiwg+eUqOaWueaNruatpOWIpOWksei0peOAglxuICAgIGlmICh4cy5sZW5ndGggPCAxIHx8IHhzLmxlbmd0aCA+IDMgfHwgeXMubGVuZ3RoIDwgMSB8fCB5cy5sZW5ndGggPiAzKSByZXR1cm4gbnVsbDtcbiAgICBpZiAoeHMubGVuZ3RoID09PSAxICYmIHlzLmxlbmd0aCA9PT0gMSkgcmV0dXJuIG51bGw7ICAgICAgICAgICAgICAvLyDljZXniYfkuI3mmK/liIfniYdcbiAgICBpZiAoeHMubGVuZ3RoICogeXMubGVuZ3RoICE9PSBjaGlsZHJlbi5sZW5ndGgpIHJldHVybiBudWxsOyAgICAgICAvLyDnvZHmoLzlv4XpobvlrozmlbRcbiAgICBjb25zdCBncmlkOiAoRmlnbWFOb2RlRGF0YSB8IG51bGwpW11bXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IHlzLmxlbmd0aCB9LCAoKSA9PiBBcnJheS5mcm9tKHsgbGVuZ3RoOiB4cy5sZW5ndGggfSwgKCkgPT4gbnVsbCkpO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgY29uc3QgY29sID0gbmVhcmVzdENsdXN0ZXJJbmRleCh4cywgTnVtYmVyKGNoaWxkLngpIHx8IDApO1xuICAgICAgICBjb25zdCByb3cgPSBuZWFyZXN0Q2x1c3RlckluZGV4KHlzLCBOdW1iZXIoY2hpbGQueSkgfHwgMCk7XG4gICAgICAgIGlmIChyb3cgPCAwIHx8IGNvbCA8IDAgfHwgZ3JpZFtyb3ddW2NvbF0pIHJldHVybiBudWxsO1xuICAgICAgICBncmlkW3Jvd11bY29sXSA9IGNoaWxkO1xuICAgIH1cbiAgICBpZiAoZ3JpZC5zb21lKChyb3cpID0+IHJvdy5zb21lKChjZWxsKSA9PiAhY2VsbCkpKSByZXR1cm4gbnVsbDtcbiAgICAvLyDnuq/kvY3nva7ogZrnsbvlj6rnnItcIk4g5Liq55+p5b2i57Sn5a+G5bmz6ZO6XCLvvIzogIzlr7zlhaXnq6/kuLrluKblrZDoioLngrnnmoQgUkVDVEFOR0xFIOmAoOeahCBiZ1JlY3RcbiAgICAvLyDkuIDlvovmmK8gU1RSRVRDSC9TVFJFVENI77yM5Yeg5Liq5YeR5Zyo5LiA6LW35a6M5YWo5ruh6Laz5Yeg5L2V5p2h5Lu2IOKHkiDkvJrooqvor6/liKTmiJDkuZ3lrqvjgIFcbiAgICAvLyDmlbTlnZfmjIkgU0xJQ0U5IOWkhOeQhu+8jOW5s+mTui/mma7pgJrlm77or63kuYnpmo/kuYvkuKLlpLHvvIjpkonpkonlj43ppoggIzQw77yJ44CCXG4gICAgLy8g5omA5Lul5L2N572u6Lev5b6E5b+F6aG75aSN5qC477ya6Iez5bCR5pyJ5LiA54mHXCLotLTovrnlm7rlrppcIuOAglxuICAgIC8vIOivreS5ieWRveWQjei3r+W+hO+8iGJ1aWxkU2VtYW50aWNTbGljZUdyaWTvvIx0b3AtbC9jZW50ZXIv4oCmIO+8ieS4jeWPl+atpOmZkOKAlOKAlFxuICAgIC8vIOWRveWQjeacrOi6q+W3suihqOi+vuWIh+eJh+ivreS5ie+8jOmCo+S6m+e0oOadkOmAmuW4uOWOi+agueS4jeW4piBjb25zdHJhaW50c+OAglxuICAgIC8vIOS4juWvvOWHuuerryBnZW9tZXRyeUZhbGxiYWNrV2l0aEZpeGVkRWRnZUNoZWNrIOWQjOe6v+OAglxuICAgIGlmICghaGFzQW55Rml4ZWRFZGdlU2xpY2UoZ3JpZCwgeXMubGVuZ3RoLCB4cy5sZW5ndGgpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4geyBncmlkLCByb3dzOiB5cy5sZW5ndGgsIGNvbHM6IHhzLmxlbmd0aCB9O1xufVxuXG5mdW5jdGlvbiBjb21wYWN0U2xpY2VHcmlkKHBsYWNlZDogKEZpZ21hTm9kZURhdGEgfCBudWxsKVtdW10pOlxuICAgIHsgZ3JpZDogKEZpZ21hTm9kZURhdGEgfCBudWxsKVtdW107IHJvd3M6IG51bWJlcjsgY29sczogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBjb25zdCByb3dVc2VkID0gcGxhY2VkLm1hcCgocm93KSA9PiByb3cuc29tZShCb29sZWFuKSk7XG4gICAgY29uc3QgY29sVXNlZCA9IFswLCAxLCAyXS5tYXAoKGNvbCkgPT4gcGxhY2VkLnNvbWUoKHJvdykgPT4gISFyb3dbY29sXSkpO1xuICAgIGNvbnN0IHJvd3MgPSByb3dVc2VkLmZpbHRlcihCb29sZWFuKS5sZW5ndGg7XG4gICAgY29uc3QgY29scyA9IGNvbFVzZWQuZmlsdGVyKEJvb2xlYW4pLmxlbmd0aDtcbiAgICBpZiAoISgocm93cyA9PT0gMSAmJiBjb2xzID09PSAzKSB8fCAocm93cyA9PT0gMyAmJiBjb2xzID09PSAxKSB8fCAocm93cyA9PT0gMyAmJiBjb2xzID09PSAzKSkpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGdyaWQgPSBwbGFjZWRcbiAgICAgICAgLmZpbHRlcigoXywgcm93KSA9PiByb3dVc2VkW3Jvd10pXG4gICAgICAgIC5tYXAoKHJvdykgPT4gcm93LmZpbHRlcigoXywgY29sKSA9PiBjb2xVc2VkW2NvbF0pKTtcbiAgICBpZiAoZ3JpZC5zb21lKChyb3cpID0+IHJvdy5zb21lKChjZWxsKSA9PiAhY2VsbCkpKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4geyBncmlkLCByb3dzLCBjb2xzIH07XG59XG5cbi8qKlxuICogQHpoIOafkOS4gOi9tOS4iuWIpOaWreOAjOmmli/mnKvovajpgZPmmK/kuI3mmK/lm7rlrprovrnjgI3vvIzkvp3mja4gY29uc3RyYWludHPjgIJcbiAqICAgICDkuI7lr7zlh7rnq68gY2xhc3NpZnlBeGlzRml4ZWRFZGdlc+OAgVVuaXR5IOerryBUcnlDbGFzc2lmeUF4aXNGaXhlZEVkZ2VzIOWQjOS4gOWll+inhOWIme+8jOS4ieerr+W/hemhu+WQjOe6v+OAglxuICogICAgIOi9qOmBk+aVsCAxID0g6K+l6L205pyq5YiH5YiG77yI6aG75Li6IFN0cmV0Y2jvvIzkuKTkvqfml6AgYm9yZGVy77yJ77ybXG4gKiAgICAgMiA9IOS4gOerr+WbuuWumiArIOS4gOerr+aLieS8uO+8iOS4pOerr+mDveWbuuWumuWPquaYr+aZrumAmuaLvOWbvu+8jOS4jeaYr+S5neWuq++8ie+8m1xuICogICAgIDMgPSDpppblm7rlrpogKyDkuK3mi4nkvLggKyDmnKvlm7rlrprjgIJcbiAqICAgICDlkIzkuIDovajpgZPkuIrmiYDmnInliIfniYflnKjor6XovbTnmoTnuqbmnZ/lv4XpobvkuIDoh7TvvIzlkKbliJnor63kuYnkuI3mmI4g4oaSIOi/lOWbniBudWxs44CCXG4gKi9cbmZ1bmN0aW9uIGNsYXNzaWZ5QXhpc0ZpeGVkRWRnZXMoXG4gICAgZ3JpZDogKEZpZ21hTm9kZURhdGEgfCBudWxsKVtdW10sIHJvd3M6IG51bWJlciwgY29sczogbnVtYmVyLCBob3Jpem9udGFsOiBib29sZWFuLFxuKTogeyBzdGFydEZpeGVkOiBib29sZWFuOyBlbmRGaXhlZDogYm9vbGVhbiB9IHwgbnVsbCB7XG4gICAgY29uc3QgdHJhY2tDb3VudCA9IGhvcml6b250YWwgPyBjb2xzIDogcm93cztcbiAgICBjb25zdCBraW5kczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGxldCB0ID0gMDsgdCA8IHRyYWNrQ291bnQ7IHQrKykge1xuICAgICAgICBsZXQga2luZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgcm93czsgcisrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IGNvbHM7IGMrKykge1xuICAgICAgICAgICAgICAgIGlmICgoaG9yaXpvbnRhbCA/IGMgOiByKSAhPT0gdCkgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3QgY2VsbCA9IGdyaWRbcl1bY107XG4gICAgICAgICAgICAgICAgaWYgKCFjZWxsKSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBjb25zOiBhbnkgPSBjZWxsLmNvbnN0cmFpbnRzO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJhdyA9IGNvbnMgPyBTdHJpbmcoaG9yaXpvbnRhbCA/IGNvbnMuaG9yaXpvbnRhbCA6IGNvbnMudmVydGljYWwgfHwgJycpIDogJyc7XG4gICAgICAgICAgICAgICAgbGV0IGs6IHN0cmluZztcbiAgICAgICAgICAgICAgICBpZiAocmF3ID09PSAnTEVGVCcgfHwgcmF3ID09PSAnVE9QJykgayA9ICdTVEFSVCc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocmF3ID09PSAnUklHSFQnIHx8IHJhdyA9PT0gJ0JPVFRPTScpIGsgPSAnRU5EJztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChyYXcgPT09ICdMRUZUX1JJR0hUJyB8fCByYXcgPT09ICdUT1BfQk9UVE9NJyB8fCByYXcgPT09ICdTQ0FMRScpIGsgPSAnU1RSRVRDSCc7XG4gICAgICAgICAgICAgICAgZWxzZSByZXR1cm4gbnVsbDsgICAgICAvLyBDRU5URVIgLyDnvLrlpLEg4oeSIOS4jeaehOaIkOWIh+eJh+ivreS5iVxuICAgICAgICAgICAgICAgIGlmIChraW5kID09PSBudWxsKSBraW5kID0gaztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChraW5kICE9PSBrKSByZXR1cm4gbnVsbDsgICAvLyDlkIzovajnuqbmnZ/kuI3kuIDoh7RcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoa2luZCA9PT0gbnVsbCkgcmV0dXJuIG51bGw7XG4gICAgICAgIGtpbmRzLnB1c2goa2luZCk7XG4gICAgfVxuICAgIGlmICh0cmFja0NvdW50ID09PSAxKSByZXR1cm4ga2luZHNbMF0gPT09ICdTVFJFVENIJyA/IHsgc3RhcnRGaXhlZDogZmFsc2UsIGVuZEZpeGVkOiBmYWxzZSB9IDogbnVsbDtcbiAgICBpZiAodHJhY2tDb3VudCA9PT0gMikge1xuICAgICAgICBpZiAoa2luZHNbMF0gPT09ICdTVEFSVCcgJiYga2luZHNbMV0gPT09ICdTVFJFVENIJykgcmV0dXJuIHsgc3RhcnRGaXhlZDogdHJ1ZSwgZW5kRml4ZWQ6IGZhbHNlIH07XG4gICAgICAgIGlmIChraW5kc1swXSA9PT0gJ1NUUkVUQ0gnICYmIGtpbmRzWzFdID09PSAnRU5EJykgcmV0dXJuIHsgc3RhcnRGaXhlZDogZmFsc2UsIGVuZEZpeGVkOiB0cnVlIH07XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAodHJhY2tDb3VudCA9PT0gMykge1xuICAgICAgICBpZiAoa2luZHNbMF0gPT09ICdTVEFSVCcgJiYga2luZHNbMV0gPT09ICdTVFJFVENIJyAmJiBraW5kc1syXSA9PT0gJ0VORCcpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXJ0Rml4ZWQ6IHRydWUsIGVuZEZpeGVkOiB0cnVlIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIEB6aCDnlLHnvZHmoLznu5PmnoTmjqjlh7rkuZ3lrqsgYm9yZGVy44CCXG4gKiAgICAg5LyY5YWI5oyJIGNvbnN0cmFpbnRzIOWIpOWumuWTquWHoOS+p+WbuuWumu+8jOS7juiAjOaUr+aMgeS7u+aEjyByb3dzw5djb2xz77yI4omkM8OXM++8ie+8mlxuICogICAgIOWNleS+p+i+uei3nSAxw5cyLzLDlzHjgIHnm7jpgrvkuKTkvqcgMsOXMuOAgeS4gOi9tOS4pOS+pyvlj6bkuIDovbTljZXkvqcgMsOXMy8zw5cy77yM5Lul5Y+K57uP5YW4IDHDlzMvM8OXMS8zw5cz44CCXG4gKiAgICAgY29uc3RyYWludHMg5LiN5Y+v55So77yI6ICB57Sg5p2Q5rKh5bim5oiW5YC85LiN6KeE6IyD77yJ5pe25Zue6JC95Yiw5Y6f5YWI5oyJIHJvd3MvY29scyDmnprkuL7nmoTop4TliJnvvIxcbiAqICAgICDkv53or4Hml6LmnIkgMcOXMy8zw5cxLzPDlzMg57Sg5p2Q6KGM5Li65LiA5a2X5LiN5Y+Y44CCXG4gKi9cbi8qKlxuICogQHpoIOWIh+eJh+mbhumHjOaYr+WQpuiHs+WwkeacieS4gOeJh1wi6LS06L655Zu65a6aXCLvvIhMRUZUL1JJR0hUL1RPUC9CT1RUT03vvInjgIJcbiAqICAgICDlj6rnnIvmmK/lkKblrZjlnKjlm7rlrprovrnjgIHkuI3moKHpqozlhbbliIbluIPigJTigJTliIbluIPkuqTnu5nkuIrpnaLnmoQgY2xhc3NpZnlBeGlzRml4ZWRFZGdlcyDnrqHvvIxcbiAqICAgICDov5nph4znmoTogYzotKPku4XmmK/mi6bmjolcIuWFqCBTVFJFVENIIC8g5re3IENFTlRFUlwi6L+Z57G75qC55pys5rKh5pyJ5Zu65a6a6L6555qE6ZuG5ZCI77yMXG4gKiAgICAg5a6D5Lus5LiN5p6E5oiQ5Lmd5a6r6K+t5LmJ77yI5YW45Z6L5p2l5rqQ77ya5a+85YWl56uv5Li65bim5a2Q6IqC54K555qEIFJFQ1RBTkdMRSDpgKDnmoQgYmdSZWN077yMXG4gKiAgICAg5LiA5b6LIFNUUkVUQ0gvU1RSRVRDSO+8ieOAguS4juWvvOWHuuerryBnZW9tZXRyeUZhbGxiYWNrV2l0aEZpeGVkRWRnZUNoZWNrIOWQjOe6v+OAglxuICogICAgIOWIu+aEj+Wuveadvu+8muWPquimgeS4gOeJh+WbuuWumuWNs+aUvuihjO+8jOS7juiAjOS/neeVmVwiY29uc3RyYWludHMg5LiN6KeE6IyD5L2G5Yeg5L2V5oiQ56uL55qE6ICB57Sg5p2QXCJcbiAqICAgICDku43og73ooqvmnprkuL7lm57okL3mjqXlj5fnmoTog73lipvjgIJcbiAqL1xuZnVuY3Rpb24gaGFzQW55Rml4ZWRFZGdlU2xpY2UoXG4gICAgZ3JpZDogKEZpZ21hTm9kZURhdGEgfCBudWxsKVtdW10sIHJvd3M6IG51bWJlciwgY29sczogbnVtYmVyLFxuKTogYm9vbGVhbiB7XG4gICAgZm9yIChsZXQgciA9IDA7IHIgPCByb3dzOyByKyspIHtcbiAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBjb2xzOyBjKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBncmlkW3JdW2NdO1xuICAgICAgICAgICAgY29uc3QgY29uczogYW55ID0gY2VsbCAmJiBjZWxsLmNvbnN0cmFpbnRzO1xuICAgICAgICAgICAgaWYgKCFjb25zKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IGggPSBTdHJpbmcoY29ucy5ob3Jpem9udGFsIHx8ICcnKTtcbiAgICAgICAgICAgIGNvbnN0IHYgPSBTdHJpbmcoY29ucy52ZXJ0aWNhbCB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoaCA9PT0gJ0xFRlQnIHx8IGggPT09ICdSSUdIVCcgfHwgdiA9PT0gJ1RPUCcgfHwgdiA9PT0gJ0JPVFRPTScpIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gc2xpY2VHcmlkQm9yZGVyKGdyaWQ6IChGaWdtYU5vZGVEYXRhIHwgbnVsbClbXVtdLCByb3dzOiBudW1iZXIsIGNvbHM6IG51bWJlcik6IFNwcml0ZUZyYW1lQm9yZGVyIHtcbiAgICBjb25zdCB4RWRnZXMgPSBjbGFzc2lmeUF4aXNGaXhlZEVkZ2VzKGdyaWQsIHJvd3MsIGNvbHMsIHRydWUpO1xuICAgIGNvbnN0IHlFZGdlcyA9IGNsYXNzaWZ5QXhpc0ZpeGVkRWRnZXMoZ3JpZCwgcm93cywgY29scywgZmFsc2UpO1xuICAgIGlmICh4RWRnZXMgJiYgeUVkZ2VzICYmICh4RWRnZXMuc3RhcnRGaXhlZCB8fCB4RWRnZXMuZW5kRml4ZWQgfHwgeUVkZ2VzLnN0YXJ0Rml4ZWQgfHwgeUVkZ2VzLmVuZEZpeGVkKSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbGVmdDogeEVkZ2VzLnN0YXJ0Rml4ZWQgPyBOdW1iZXIoZ3JpZFswXVswXSAmJiBncmlkWzBdWzBdIS53aWR0aCkgfHwgMCA6IDAsXG4gICAgICAgICAgICByaWdodDogeEVkZ2VzLmVuZEZpeGVkID8gTnVtYmVyKGdyaWRbMF1bY29scyAtIDFdICYmIGdyaWRbMF1bY29scyAtIDFdIS53aWR0aCkgfHwgMCA6IDAsXG4gICAgICAgICAgICB0b3A6IHlFZGdlcy5zdGFydEZpeGVkID8gTnVtYmVyKGdyaWRbMF1bMF0gJiYgZ3JpZFswXVswXSEuaGVpZ2h0KSB8fCAwIDogMCxcbiAgICAgICAgICAgIGJvdHRvbTogeUVkZ2VzLmVuZEZpeGVkID8gTnVtYmVyKGdyaWRbcm93cyAtIDFdWzBdICYmIGdyaWRbcm93cyAtIDFdWzBdIS5oZWlnaHQpIHx8IDAgOiAwLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIOKUgOKUgCDlm57okL3vvJrljp/mnprkuL7op4TliJnvvIhjb25zdHJhaW50cyDkuI3lj6/nlKjnmoTogIHntKDmnZDvvInilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgICBpZiAocm93cyA9PT0gMSAmJiBjb2xzID09PSAzKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBsZWZ0OiBOdW1iZXIoZ3JpZFswXVswXSAmJiBncmlkWzBdWzBdIS53aWR0aCkgfHwgMCxcbiAgICAgICAgICAgIHJpZ2h0OiBOdW1iZXIoZ3JpZFswXVsyXSAmJiBncmlkWzBdWzJdIS53aWR0aCkgfHwgMCxcbiAgICAgICAgICAgIHRvcDogMCxcbiAgICAgICAgICAgIGJvdHRvbTogMCxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgaWYgKHJvd3MgPT09IDMgJiYgY29scyA9PT0gMSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbGVmdDogMCxcbiAgICAgICAgICAgIHJpZ2h0OiAwLFxuICAgICAgICAgICAgdG9wOiBOdW1iZXIoZ3JpZFswXVswXSAmJiBncmlkWzBdWzBdIS5oZWlnaHQpIHx8IDAsXG4gICAgICAgICAgICBib3R0b206IE51bWJlcihncmlkWzJdWzBdICYmIGdyaWRbMl1bMF0hLmhlaWdodCkgfHwgMCxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgaWYgKHJvd3MgPT09IDMgJiYgY29scyA9PT0gMykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbGVmdDogTnVtYmVyKGdyaWRbMF1bMF0gJiYgZ3JpZFswXVswXSEud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICByaWdodDogTnVtYmVyKGdyaWRbMF1bMl0gJiYgZ3JpZFswXVsyXSEud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICB0b3A6IE51bWJlcihncmlkWzBdWzBdICYmIGdyaWRbMF1bMF0hLmhlaWdodCkgfHwgMCxcbiAgICAgICAgICAgIGJvdHRvbTogTnVtYmVyKGdyaWRbMl1bMF0gJiYgZ3JpZFsyXVswXSEuaGVpZ2h0KSB8fCAwLFxuICAgICAgICB9O1xuICAgIH1cbiAgICAvLyDlhbbkvZnnu4TlkIjlnKjmsqHmnIkgY29uc3RyYWludHMg5pe25peg5rOV5Yik5pat5ZOq5L6n5Zu65a6a77yM6L+U5Zue5YWoIDAg5Lqk55Sx6LCD55So5pa55Yik5aSx6LSl44CCXG4gICAgcmV0dXJuIHsgbGVmdDogMCwgcmlnaHQ6IDAsIHRvcDogMCwgYm90dG9tOiAwIH07XG59XG5cbmZ1bmN0aW9uIGNsdXN0ZXJOdW1iZXJzKHZhbHVlczogbnVtYmVyW10sIHRvbGVyYW5jZTogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgIGNvbnN0IHNvcnRlZCA9IFsuLi52YWx1ZXNdLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgICBjb25zdCBjbHVzdGVyczogQXJyYXk8eyBzdW06IG51bWJlcjsgY291bnQ6IG51bWJlcjsgdmFsdWU6IG51bWJlciB9PiA9IFtdO1xuICAgIGZvciAoY29uc3QgdmFsdWUgb2Ygc29ydGVkKSB7XG4gICAgICAgIGNvbnN0IGxhc3QgPSBjbHVzdGVyc1tjbHVzdGVycy5sZW5ndGggLSAxXTtcbiAgICAgICAgaWYgKGxhc3QgJiYgTWF0aC5hYnModmFsdWUgLSBsYXN0LnZhbHVlKSA8PSB0b2xlcmFuY2UpIHtcbiAgICAgICAgICAgIGxhc3Quc3VtICs9IHZhbHVlO1xuICAgICAgICAgICAgbGFzdC5jb3VudCsrO1xuICAgICAgICAgICAgbGFzdC52YWx1ZSA9IGxhc3Quc3VtIC8gbGFzdC5jb3VudDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNsdXN0ZXJzLnB1c2goeyBzdW06IHZhbHVlLCBjb3VudDogMSwgdmFsdWUgfSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNsdXN0ZXJzLm1hcCgoY2x1c3RlcikgPT4gY2x1c3Rlci52YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIG5lYXJlc3RDbHVzdGVySW5kZXgoY2x1c3RlcnM6IG51bWJlcltdLCB2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBsZXQgYmVzdCA9IC0xO1xuICAgIGxldCBiZXN0RGlzdCA9IEluZmluaXR5O1xuICAgIGNsdXN0ZXJzLmZvckVhY2goKGNsdXN0ZXIsIGluZGV4KSA9PiB7XG4gICAgICAgIGNvbnN0IGRpc3QgPSBNYXRoLmFicyhjbHVzdGVyIC0gdmFsdWUpO1xuICAgICAgICBpZiAoZGlzdCA8IGJlc3REaXN0KSB7XG4gICAgICAgICAgICBiZXN0ID0gaW5kZXg7XG4gICAgICAgICAgICBiZXN0RGlzdCA9IGRpc3Q7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gYmVzdERpc3QgPD0gMiA/IGJlc3QgOiAtMTtcbn1cblxuZnVuY3Rpb24gZmlyc3RWaXNpYmxlU29saWRGaWxsKG5vZGU6IEZpZ21hTm9kZURhdGEpOiBhbnkgfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IGZpbGxzID0gbm9kZS5maWxscyB8fCBbXTtcbiAgICByZXR1cm4gZmlsbHMuZmluZCgoZjogYW55KSA9PiBmICYmIGYudHlwZSA9PT0gJ1NPTElEJyAmJiBmLnZpc2libGUgIT09IGZhbHNlKTtcbn1cblxuZnVuY3Rpb24gY29sb3JGcm9tRmlnbWFGaWxsKGZpbGw6IGFueSk6IHsgcjogbnVtYmVyOyBnOiBudW1iZXI7IGI6IG51bWJlcjsgYTogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuICAgIGlmICghZmlsbCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBpZiAoZmlsbC5ncmFkaWVudE1vZGUgJiYgZmlsbC5ncmFkaWVudENvbG9yQSAmJiBmaWxsLmdyYWRpZW50Q29sb3JCKSB7XG4gICAgICAgIHJldHVybiBhdmVyYWdlRmlnbWFDb2xvcihmaWxsLmdyYWRpZW50Q29sb3JBLCBmaWxsLmdyYWRpZW50Q29sb3JCKTtcbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcjogTWF0aC5yb3VuZCgoZmlsbC5yID8/IDEpICogMjU1KSxcbiAgICAgICAgZzogTWF0aC5yb3VuZCgoZmlsbC5nID8/IDEpICogMjU1KSxcbiAgICAgICAgYjogTWF0aC5yb3VuZCgoZmlsbC5iID8/IDEpICogMjU1KSxcbiAgICAgICAgYTogTWF0aC5yb3VuZCgoZmlsbC5hID8/IDEpICogMjU1KSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiByZ2JhMjU1RnJvbUZpZ21hQ29sb3IoYzogYW55LCBmYWxsYmFjazogeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXIgfSk6IHsgcjogbnVtYmVyOyBnOiBudW1iZXI7IGI6IG51bWJlcjsgYTogbnVtYmVyIH0ge1xuICAgIHJldHVybiB7XG4gICAgICAgIHI6IE1hdGgucm91bmQoTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgYyAmJiB0eXBlb2YgYy5yID09PSAnbnVtYmVyJyA/IGMuciA6IGZhbGxiYWNrLnIgLyAyNTUpKSAqIDI1NSksXG4gICAgICAgIGc6IE1hdGgucm91bmQoTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgYyAmJiB0eXBlb2YgYy5nID09PSAnbnVtYmVyJyA/IGMuZyA6IGZhbGxiYWNrLmcgLyAyNTUpKSAqIDI1NSksXG4gICAgICAgIGI6IE1hdGgucm91bmQoTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgYyAmJiB0eXBlb2YgYy5iID09PSAnbnVtYmVyJyA/IGMuYiA6IGZhbGxiYWNrLmIgLyAyNTUpKSAqIDI1NSksXG4gICAgICAgIGE6IE1hdGgucm91bmQoTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgYyAmJiB0eXBlb2YgYy5hID09PSAnbnVtYmVyJyA/IGMuYSA6IGZhbGxiYWNrLmEgLyAyNTUpKSAqIDI1NSksXG4gICAgfTtcbn1cblxuLyoqXG4gKiBAZW4gRm9yIGEgVEVYVCBub2RlLCBwdWxsIGl0cyB2aXNpYmxlIHNvbGlkL2xpbmVhci1ncmFkaWVudCBmYWxsYmFjayBjb2xvciBhcyAwLTI1NSBSR0JBLlxuICogQHpoIOWPliBURVhUIOiKgueCueeahOWPr+ingee6r+iJsi/nur/mgKfmuJDlj5jpmY3nuqfoibLvvIhGaWdtYSDmmK8gMH4xIOa1rueCue+8jOi9rOaIkCAwfjI1Ne+8ieOAglxuICogICAgIENvY29zIExhYmVsIOi/mOayoeaciSBUTVAg6YKj56eN6aG254K55riQ5Y+Y77yb6YGH5YiwIEZpZ21hIOe6v+aAp+a4kOWPmOaXtuWPluS4pOerr+Wdh+WAvOS9nOWNleiJsiBmYWxsYmFja+OAglxuICovXG5mdW5jdGlvbiB0ZXh0Q29sb3Iobm9kZTogRmlnbWFOb2RlRGF0YSk6IHsgcjogbnVtYmVyOyBnOiBudW1iZXI7IGI6IG51bWJlcjsgYTogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuICAgIHJldHVybiBjb2xvckZyb21GaWdtYUZpbGwoZmlyc3RWaXNpYmxlU29saWRGaWxsKG5vZGUpKTtcbn1cblxuZnVuY3Rpb24gdGV4dEdyYWRpZW50KG5vZGU6IEZpZ21hTm9kZURhdGEpOiB7IG1vZGU6IHN0cmluZzsgYTogeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXIgfTsgYjogeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXIgfSB9IHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCBmaWxscyA9IG5vZGUuZmlsbHMgfHwgW107XG4gICAgY29uc3QgZmlsbCA9IGZpbGxzLmZpbmQoKGY6IGFueSkgPT5cbiAgICAgICAgZiAmJiBmLnR5cGUgPT09ICdTT0xJRCcgJiYgZi52aXNpYmxlICE9PSBmYWxzZSAmJiBmLmdyYWRpZW50TW9kZSAmJiBmLmdyYWRpZW50Q29sb3JBICYmIGYuZ3JhZGllbnRDb2xvckJcbiAgICApO1xuICAgIGlmICghZmlsbCkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICByZXR1cm4ge1xuICAgICAgICBtb2RlOiBTdHJpbmcoZmlsbC5ncmFkaWVudE1vZGUgfHwgJycpLFxuICAgICAgICBhOiByZ2JhMjU1RnJvbUZpZ21hQ29sb3IoZmlsbC5ncmFkaWVudENvbG9yQSwgeyByOiAyNTUsIGc6IDI1NSwgYjogMjU1LCBhOiAyNTUgfSksXG4gICAgICAgIGI6IHJnYmEyNTVGcm9tRmlnbWFDb2xvcihmaWxsLmdyYWRpZW50Q29sb3JCLCB7IHI6IDI1NSwgZzogMjU1LCBiOiAyNTUsIGE6IDI1NSB9KSxcbiAgICB9O1xufVxuXG4vKipcbiAqIEBlbiBOb3JtYWxpemUgbmV3bGluZXM6IENSTEYvQ1IvVSsyMDI4L1UrMjAyOSDihpIgc2luZ2xlIFxcbiAoYXZvaWRzIGV4dHJhIGJsYW5rIGxpbmVzIC8gY2xpcHBlZCBib3hlcykuXG4gKiBAemgg5o2i6KGM5b2S5LiA5YyW77yaQ1JMRi9DUi/ooYzliIbpmpTnrKYg4oaSIOWNleS4qiBcXG7vvIjlkKbliJnlpJrnqbrooYzkvJrljovmoYbvvInjgIJcbiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplTmV3bGluZXMoczogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBpZiAoIXMpIHJldHVybiBzO1xuICAgIC8vIENSTEYvQ1IgdGhlbiBVKzIwMjggLyBVKzIwMjkgbGluZSBzZXBhcmF0b3JzIGNvbGxhcHNlIHRvIGEgc2luZ2xlIFxcblxuICAgIHJldHVybiBzLnJlcGxhY2UoL1xcclxcbj8vZywgJ1xcbicpLnJlcGxhY2UoL1tcXHUyMDI4XFx1MjAyOV0vZywgJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVUZXh0U2VnbWVudHMobm9kZTogRmlnbWFOb2RlRGF0YSk6IGFueVtdIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCBzZWdtZW50cyA9IEFycmF5LmlzQXJyYXkobm9kZS50ZXh0U2VnbWVudHMpID8gbm9kZS50ZXh0U2VnbWVudHMgOiBbXTtcbiAgICBpZiAoc2VnbWVudHMubGVuZ3RoIDw9IDEpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgY29uc3QgY2hhcnMgPSBub3JtYWxpemVOZXdsaW5lcyhub2RlLmNoYXJhY3RlcnMgfHwgJycpO1xuICAgIGNvbnN0IG91dCA9IHNlZ21lbnRzLm1hcCgoc2VnOiBhbnkpID0+IHtcbiAgICAgICAgY29uc3QgcmF3UmdiID0gc2VnLmNvbG9yID8gW051bWJlcihzZWcuY29sb3IuciksIE51bWJlcihzZWcuY29sb3IuZyksIE51bWJlcihzZWcuY29sb3IuYildIDogW107XG4gICAgICAgIGNvbnN0IHJnYklzVW5pdFJhbmdlID0gcmF3UmdiLmxlbmd0aCA9PT0gMyAmJiByYXdSZ2IuZXZlcnkoKHZhbHVlKSA9PlxuICAgICAgICAgICAgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+PSAwICYmIHZhbHVlIDw9IDEpO1xuICAgICAgICBjb25zdCB0b0J5dGUgPSAodmFsdWU6IGFueSwgdW5pdFJhbmdlOiBib29sZWFuLCBmYWxsYmFjazogbnVtYmVyKTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG51bWVyaWMgPSBOdW1iZXIodmFsdWUpO1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBOdW1iZXIuaXNGaW5pdGUobnVtZXJpYykgPyBudW1lcmljIDogZmFsbGJhY2s7XG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4oMjU1LCBNYXRoLnJvdW5kKHJlc29sdmVkICogKHVuaXRSYW5nZSA/IDI1NSA6IDEpKSkpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBhbHBoYSA9IHNlZy5jb2xvciA/IE51bWJlcihzZWcuY29sb3IuYSkgOiBOYU47XG4gICAgICAgIGNvbnN0IGFscGhhSXNVbml0UmFuZ2UgPSBOdW1iZXIuaXNGaW5pdGUoYWxwaGEpICYmIGFscGhhID49IDAgJiYgYWxwaGEgPD0gMTtcbiAgICAgICAgY29uc3QgY29sb3IgPSBzZWcuY29sb3IgPyB7XG4gICAgICAgICAgICByOiB0b0J5dGUoc2VnLmNvbG9yLnIsIHJnYklzVW5pdFJhbmdlLCByZ2JJc1VuaXRSYW5nZSA/IDEgOiAyNTUpLFxuICAgICAgICAgICAgZzogdG9CeXRlKHNlZy5jb2xvci5nLCByZ2JJc1VuaXRSYW5nZSwgcmdiSXNVbml0UmFuZ2UgPyAxIDogMjU1KSxcbiAgICAgICAgICAgIGI6IHRvQnl0ZShzZWcuY29sb3IuYiwgcmdiSXNVbml0UmFuZ2UsIHJnYklzVW5pdFJhbmdlID8gMSA6IDI1NSksXG4gICAgICAgICAgICBhOiB0b0J5dGUoc2VnLmNvbG9yLmEsIGFscGhhSXNVbml0UmFuZ2UsIGFscGhhSXNVbml0UmFuZ2UgPyAxIDogMjU1KSxcbiAgICAgICAgfSA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXJ0OiBNYXRoLm1heCgwLCBNYXRoLm1pbihjaGFycy5sZW5ndGgsIE1hdGgucm91bmQoTnVtYmVyKHNlZy5zdGFydCkgfHwgMCkpKSxcbiAgICAgICAgICAgIGVuZDogTWF0aC5tYXgoMCwgTWF0aC5taW4oY2hhcnMubGVuZ3RoLCBNYXRoLnJvdW5kKE51bWJlcihzZWcuZW5kKSB8fCAwKSkpLFxuICAgICAgICAgICAgZm9udFNpemU6IE51bWJlcihzZWcuZm9udFNpemUpIHx8IDAsXG4gICAgICAgICAgICBjb2xvcixcbiAgICAgICAgfTtcbiAgICB9KS5maWx0ZXIoKHNlZzogYW55KSA9PiBzZWcuZW5kID4gc2VnLnN0YXJ0KTtcbiAgICBpZiAob3V0Lmxlbmd0aCA8PSAxKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGZpcnN0ID0gb3V0WzBdO1xuICAgIGNvbnN0IHNpemVNaXhlZCA9IG91dC5zb21lKChzZWc6IGFueSkgPT4gTWF0aC5hYnMoKHNlZy5mb250U2l6ZSB8fCAwKSAtIChmaXJzdC5mb250U2l6ZSB8fCAwKSkgPiAwLjAxKTtcbiAgICBjb25zdCBjb2xvck1peGVkID0gb3V0LnNvbWUoKHNlZzogYW55KSA9PiAhc2FtZUNvbG9yKHNlZy5jb2xvciwgZmlyc3QuY29sb3IpKTtcbiAgICByZXR1cm4gc2l6ZU1peGVkIHx8IGNvbG9yTWl4ZWQgPyBvdXQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNhbWVDb2xvcihhOiBhbnksIGI6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghYSAmJiAhYikgcmV0dXJuIHRydWU7XG4gICAgaWYgKCFhIHx8ICFiKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGEuciA9PT0gYi5yICYmIGEuZyA9PT0gYi5nICYmIGEuYiA9PT0gYi5iICYmIGEuYSA9PT0gYi5hO1xufVxuXG4vKipcbiAqIEBlbiBGaXJzdCB2aXNpYmxlIFNPTElEIHN0cm9rZSDihpIgTGFiZWxPdXRsaW5lIHBhcmFtcyAoY29sb3IgMC0yNTUgKyB3aWR0aCkuIOWvuem9kCBVbml0eSBUcnlHZXRTdHJva2XjgIJcbiAqIEB6aCDlj5bnrKzkuIDkuKrlj6/op4EgU09MSUQg5o+P6L65IOKGkiBMYWJlbE91dGxpbmUg5Y+C5pWw77yI6aKc6ImyIDB+MjU1ICsg5a695bqm77yJ44CC5peg5Y+v6KeB5o+P6L656L+U5ZueIHVuZGVmaW5lZOOAglxuICovXG5mdW5jdGlvbiB0ZXh0U3Ryb2tlKG5vZGU6IEZpZ21hTm9kZURhdGEpOiB7IGNvbG9yOiB7IHI6IG51bWJlcjsgZzogbnVtYmVyOyBiOiBudW1iZXI7IGE6IG51bWJlciB9OyB3aWR0aDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IHN0cm9rZXMgPSBub2RlLnN0cm9rZXMgfHwgW107XG4gICAgY29uc3QgcyA9IHN0cm9rZXMuZmluZCgoazogYW55KSA9PiBrICYmIGsudmlzaWJsZSAhPT0gZmFsc2UgJiYgay50eXBlID09PSAnU09MSUQnKTtcbiAgICBpZiAoIXMpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29sb3I6IHtcbiAgICAgICAgICAgIHI6IE1hdGgucm91bmQoKHMuciA/PyAwKSAqIDI1NSksXG4gICAgICAgICAgICBnOiBNYXRoLnJvdW5kKChzLmcgPz8gMCkgKiAyNTUpLFxuICAgICAgICAgICAgYjogTWF0aC5yb3VuZCgocy5iID8/IDApICogMjU1KSxcbiAgICAgICAgICAgIGE6IE1hdGgucm91bmQoKHMuYSA/PyAxKSAqIDI1NSksXG4gICAgICAgIH0sXG4gICAgICAgIHdpZHRoOiBub2RlLnN0cm9rZVdlaWdodCB8fCAwLFxuICAgIH07XG59XG5cbi8qKlxuICogQGVuIEZpcnN0IHZpc2libGUgRFJPUF9TSEFET1cgZWZmZWN0IOKGkiBMYWJlbFNoYWRvdyBwYXJhbXMgKGNvbG9yIDAtMjU1ICsgb2Zmc2V0ICsgYmx1cikuXG4gKiBAemgg5Y+W56ys5LiA5Liq5Y+v6KeBIERST1BfU0hBRE9XIOKGkiBMYWJlbFNoYWRvdyDlj4LmlbDvvIjpopzoibIgMH4yNTUgKyDlgY/np7sgKyDmqKHns4rvvInjgILlr7npvZAgVW5pdHkgRXh0cmFjdEVmZmVjdHPjgIJcbiAqICAgICDms6jmhI/vvJpGaWdtYSBZIOWQkeS4i+S4uuato++8jENvY29zIFkg5ZCR5LiK5Li65q2j77yMb2Zmc2V0WSDlnKggc2NlbmUg5L6n57+756ym5Y+377yI6L+Z6YeM5Y+q6YCP5Lyg5Y6f5YC877yJ44CCXG4gKi9cbmZ1bmN0aW9uIHRleHRTaGFkb3cobm9kZTogRmlnbWFOb2RlRGF0YSk6IHsgY29sb3I6IHsgcjogbnVtYmVyOyBnOiBudW1iZXI7IGI6IG51bWJlcjsgYTogbnVtYmVyIH07IG9mZnNldFg6IG51bWJlcjsgb2Zmc2V0WTogbnVtYmVyOyBibHVyOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG4gICAgY29uc3QgZWZmZWN0cyA9IG5vZGUuZWZmZWN0cyB8fCBbXTtcbiAgICBjb25zdCBlID0gZWZmZWN0cy5maW5kKChrOiBhbnkpID0+IGsgJiYgay52aXNpYmxlICE9PSBmYWxzZSAmJiBrLnR5cGUgPT09ICdEUk9QX1NIQURPVycpO1xuICAgIGlmICghZSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb2xvcjoge1xuICAgICAgICAgICAgcjogTWF0aC5yb3VuZCgoZS5yID8/IDApICogMjU1KSxcbiAgICAgICAgICAgIGc6IE1hdGgucm91bmQoKGUuZyA/PyAwKSAqIDI1NSksXG4gICAgICAgICAgICBiOiBNYXRoLnJvdW5kKChlLmIgPz8gMCkgKiAyNTUpLFxuICAgICAgICAgICAgYTogTWF0aC5yb3VuZCgoZS5hID8/IDEpICogMjU1KSxcbiAgICAgICAgfSxcbiAgICAgICAgb2Zmc2V0WDogZS5vZmZzZXRYIHx8IDAsXG4gICAgICAgIG9mZnNldFk6IGUub2Zmc2V0WSB8fCAwLFxuICAgICAgICBibHVyOiBlLnJhZGl1cyB8fCAwLFxuICAgIH07XG59XG5cbi8qKlxuICogQGVuIFN0cmlwIGEgRmlnbWEgbm9kZSB0cmVlIGRvd24gdG8gdGhlIGZpZWxkcyBzdGFnZS0xLzIgbmVlZC5cbiAqICAgICBDYXJyaWVzIG9ubHkgYW4gaW1hZ2VSZWYgKHBvb2wgaWQpLCBuZXZlciBiYXNlNjQg4oCUIGRlZHVwICsgbGFuZGluZyBoYXBwZW4gaW4gbWFpbi5cbiAqIEB6aCDmioroioLngrnmoJHnmKbouqvmiJDpmLbmrrUgMS8yIOmcgOimgeeahOWtl+auteOAguWPquW4piBpbWFnZVJlZu+8iOaxoCBpZO+8ie+8jOe7neS4jeW4piBiYXNlNjTjgIJcbiAqL1xuZnVuY3Rpb24gc2xpbVRyZWUoXG4gICAgbm9kZTogRmlnbWFOb2RlRGF0YSxcbiAgICBmb250TGliOiBGb250TGliRW50cnlbXSxcbiAgICB0ZXh0U3R5bGVMaWI6IFRleHRTdHlsZUxpYnJhcnksXG4gICAgZm9udFRyYWNrZXI6IEZvbnREZW1hbmRUcmFja2VyLFxuICAgIHRleHRTdHlsZVRyYWNrZXI6IFRleHRTdHlsZVRyYWNrZXIsXG4gICAgdGV4dFN0eWxlVGVtcGxhdGVUcmFja2VyOiBUZXh0U3R5bGVUZW1wbGF0ZVRyYWNrZXIsXG4gICAgaW1hZ2VEaW1zOiB7IFtpZDogc3RyaW5nXTogSW1hZ2VEaW1lbnNpb25zIH0sXG4gICAgbWFza1JvdXRlczogTWFwPEZpZ21hTm9kZURhdGEsIE1hc2tSb3V0ZT4sXG4gICAgc3RhdHM6IFNsaW1TdGF0c1xuKTogYW55IHtcbiAgICBjb25zdCBpbXBsaWNpdFNsaWNlOSA9IGRldGVjdEltcGxpY2l0U2xpY2U5KG5vZGUsIGltYWdlRGltcyk7XG4gICAgY29uc3QgZXhwbGljaXRTbGljZUdyaWQgPSBTdHJpbmcobm9kZS5jb21wb25lbnRUeXBlIHx8ICcnKS50b1VwcGVyQ2FzZSgpID09PSAnU0xJQ0U5J1xuICAgICAgICA/IGJ1aWxkSW1wbGljaXRTbGljZUdyaWQobm9kZSwgdHJ1ZSlcbiAgICAgICAgOiBudWxsO1xuICAgIGNvbnN0IGV4cGxpY2l0U2xpY2VDaGlsZHJlbiA9IGV4cGxpY2l0U2xpY2VHcmlkXG4gICAgICAgID8gbmV3IFNldChleHBsaWNpdFNsaWNlR3JpZC5ncmlkLmZsYXQoKS5maWx0ZXIoQm9vbGVhbikgYXMgRmlnbWFOb2RlRGF0YVtdKVxuICAgICAgICA6IG51bGw7XG4gICAgY29uc3Qgc2hhcmVkQ3JvcHBlZEltYWdlUmVmID0gaW1wbGljaXRTbGljZTkgPyB1bmRlZmluZWQgOiBkZXRlY3RTaGFyZWRDcm9wcGVkSW1hZ2VSZWYobm9kZSwgaW1hZ2VEaW1zKTtcbiAgICBpZiAoaW1wbGljaXRTbGljZTkpIHtcbiAgICAgICAgc3RhdHMuaW1wbGljaXRTbGljZTlJbWFnZXMrKztcbiAgICB9XG4gICAgaWYgKHNoYXJlZENyb3BwZWRJbWFnZVJlZikge1xuICAgICAgICBzdGF0cy5zaGFyZWRDcm9wcGVkSW1hZ2VzKys7XG4gICAgfVxuICAgIGNvbnN0IHNsaW06IGFueSA9IHtcbiAgICAgICAgZmlnbWFJZDogbm9kZS5maWdtYUlkLFxuICAgICAgICBuYW1lOiBub2RlLm5hbWUsXG4gICAgICAgIHR5cGU6IG5vZGUudHlwZSxcbiAgICAgICAgZmlnbWFUeXBlOiBub2RlLmZpZ21hVHlwZSxcbiAgICAgICAgY29tcG9uZW50S2V5OiBTdHJpbmcobm9kZS5jb21wb25lbnRLZXkgfHwgJycpLFxuICAgICAgICBjb21wb25lbnRQcm9wZXJ0aWVzOiBub3JtYWxpemVDb21wb25lbnRQcm9wZXJ0aWVzKG5vZGUuY29tcG9uZW50UHJvcGVydGllcyksXG4gICAgICAgIHg6IG5vZGUueCxcbiAgICAgICAgeTogbm9kZS55LFxuICAgICAgICB3aWR0aDogbm9kZS53aWR0aCxcbiAgICAgICAgaGVpZ2h0OiBub2RlLmhlaWdodCxcbiAgICAgICAgcm90YXRpb246IG5vZGUucm90YXRpb24sXG4gICAgICAgIHNjYWxlWDogdHlwZW9mIG5vZGUuc2NhbGVYID09PSAnbnVtYmVyJyA/IG5vZGUuc2NhbGVYIDogMSxcbiAgICAgICAgc2NhbGVZOiB0eXBlb2Ygbm9kZS5zY2FsZVkgPT09ICdudW1iZXInID8gbm9kZS5zY2FsZVkgOiAxLFxuICAgICAgICByZWxhdGl2ZVRyYW5zZm9ybTogQXJyYXkuaXNBcnJheShub2RlLnJlbGF0aXZlVHJhbnNmb3JtKSA/IG5vZGUucmVsYXRpdmVUcmFuc2Zvcm0gOiB1bmRlZmluZWQsXG4gICAgICAgIHZpc2libGU6IG5vZGUudmlzaWJsZSAhPT0gZmFsc2UsXG4gICAgICAgIG9wYWNpdHk6IHR5cGVvZiBub2RlLm9wYWNpdHkgPT09ICdudW1iZXInID8gbm9kZS5vcGFjaXR5IDogMSxcbiAgICAgICAgaW1hZ2VSZWY6IGltcGxpY2l0U2xpY2U5ID8gaW1wbGljaXRTbGljZTkuaW1hZ2VSZWYgOiAoc2hhcmVkQ3JvcHBlZEltYWdlUmVmIHx8IG5vZGVJbWFnZVJlZihub2RlKSksXG4gICAgICAgIGNoaWxkcmVuOiAobm9kZS5jaGlsZHJlbiB8fCBbXSlcbiAgICAgICAgICAgIC5maWx0ZXIoKGMpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXhwbGljaXRTbGljZUNoaWxkcmVuICYmIGV4cGxpY2l0U2xpY2VDaGlsZHJlbi5oYXMoYykpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAoaW1wbGljaXRTbGljZTkgJiYgaW1wbGljaXRTbGljZTkuY2hpbGRyZW5Ub1NraXAuaGFzKGMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRzLmltcGxpY2l0U2xpY2U5U2xpY2VDaGlsZHJlbisrO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghc2hhcmVkQ3JvcHBlZEltYWdlUmVmIHx8IG5vZGVJbWFnZVJlZihjKSAhPT0gc2hhcmVkQ3JvcHBlZEltYWdlUmVmKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICBzdGF0cy5zaGFyZWRDcm9wcGVkU2xpY2VDaGlsZHJlbisrO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAubWFwKChjKSA9PiBzbGltVHJlZShjLCBmb250TGliLCB0ZXh0U3R5bGVMaWIsIGZvbnRUcmFja2VyLCB0ZXh0U3R5bGVUcmFja2VyLCB0ZXh0U3R5bGVUZW1wbGF0ZVRyYWNrZXIsIGltYWdlRGltcywgbWFza1JvdXRlcywgc3RhdHMpKSxcbiAgICB9O1xuICAgIGlmIChzaGFyZWRDcm9wcGVkSW1hZ2VSZWYpIHNsaW0uc2hhcmVkQ3JvcHBlZEltYWdlID0gdHJ1ZTtcbiAgICBpZiAoaW1wbGljaXRTbGljZTkpIHtcbiAgICAgICAgc2xpbS5jb21wb25lbnRUeXBlID0gJ1NMSUNFOSc7XG4gICAgICAgIHNsaW0uc2xpY2U5Qm9yZGVyID0gaW1wbGljaXRTbGljZTkuYm9yZGVyO1xuICAgICAgICBzbGltLmltcGxpY2l0U2xpY2U5ID0geyByb3dzOiBpbXBsaWNpdFNsaWNlOS5yb3dzLCBjb2xzOiBpbXBsaWNpdFNsaWNlOS5jb2xzIH07XG4gICAgfVxuICAgIGlmIChub2RlLm92ZXJsYXlUaW50KSBzbGltLm92ZXJsYXlUaW50ID0gbm9kZS5vdmVybGF5VGludDtcbiAgICBjb25zdCBpbWdNZXRhID0gaW1hZ2VGaWxsTWV0YShub2RlKTtcbiAgICBpZiAoaW1nTWV0YSkge1xuICAgICAgICBjb25zdCByZWYgPSBub2RlSW1hZ2VSZWYobm9kZSk7XG4gICAgICAgIGNvbnN0IGRpbSA9IHJlZiA/IGltYWdlRGltc1tyZWZdIDogdW5kZWZpbmVkO1xuICAgICAgICBpZiAoZGltKSB7XG4gICAgICAgICAgICBpbWdNZXRhLnJhd1dpZHRoID0gZGltLndpZHRoO1xuICAgICAgICAgICAgaW1nTWV0YS5yYXdIZWlnaHQgPSBkaW0uaGVpZ2h0O1xuICAgICAgICAgICAgY29uc3Qgbm9kZUFzcGVjdCA9IChub2RlLndpZHRoIHx8IDApID4gMCAmJiAobm9kZS5oZWlnaHQgfHwgMCkgPiAwID8gKG5vZGUud2lkdGggfHwgMCkgLyAobm9kZS5oZWlnaHQgfHwgMSkgOiAwO1xuICAgICAgICAgICAgY29uc3QgcmF3QXNwZWN0ID0gZGltLndpZHRoIC8gZGltLmhlaWdodDtcbiAgICAgICAgICAgIGlmICghaW1nTWV0YS5jcm9wUmVjdCAmJiAhaW1nTWV0YS5pbWFnZVRyYW5zZm9ybSAmJlxuICAgICAgICAgICAgICAgIG5vZGVBc3BlY3QgPiAwICYmIE1hdGguYWJzKG5vZGVBc3BlY3QgLSByYXdBc3BlY3QpIDwgMC4wMDIpIHtcbiAgICAgICAgICAgICAgICBpbWdNZXRhLnNraXBDb3ZlckNyb3AgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHNsaW0uaW1hZ2VGaWxsID0gaW1nTWV0YTtcbiAgICB9XG4gICAgLy8g6Zi25q61IDPvvJrnuqbmnZ8gKyDluIPlsYDliKTlrpogKyDoo4HliarlrZfmrrXvvIjnuq/moIfph48v5rGgIGlk77yM57ud5LiN5bimIGJhc2U2NO+8iVxuICAgIGlmIChub2RlLmNvbnN0cmFpbnRzKSBzbGltLmNvbnN0cmFpbnRzID0gbm9kZS5jb25zdHJhaW50cztcbiAgICBpZiAobm9kZS5sYXlvdXRNb2RlKSBzbGltLmxheW91dE1vZGUgPSBub2RlLmxheW91dE1vZGU7XG4gICAgaWYgKG5vZGUubGF5b3V0V3JhcCkgc2xpbS5sYXlvdXRXcmFwID0gbm9kZS5sYXlvdXRXcmFwO1xuICAgIGlmIChub2RlLmxheW91dFBvc2l0aW9uaW5nKSBzbGltLmxheW91dFBvc2l0aW9uaW5nID0gbm9kZS5sYXlvdXRQb3NpdGlvbmluZztcbiAgICAvLyBGaWdtYSBuYXRpdmUgR1JJRCB1c2VzIGV4cGxpY2l0IHRyYWNrcyByYXRoZXIgdGhhbiBBdXRvIExheW91dCB3cmFwLlxuICAgIC8vIEtlZXAgdGhlc2Ugc2NhbGFyIGZpZWxkcyBpbiB0aGUgc2xpbSBpbXBvcnQgY29udHJhY3Q7IGRyb3BwaW5nIHRoZW1cbiAgICAvLyBzaWxlbnRseSB0dXJucyBhIG5hdGl2ZSBncmlkIGludG8gYWJzb2x1dGUgcG9zaXRpb25pbmcgb24gdGhlIENvY29zIHNpZGUuXG4gICAgaWYgKG5vZGUubGF5b3V0TW9kZSA9PT0gJ0dSSUQnKSB7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIFsnZ3JpZFJvd0NvdW50JywgJ2dyaWRDb2x1bW5Db3VudCcsICdncmlkUm93R2FwJywgJ2dyaWRDb2x1bW5HYXAnXSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBub2RlW2tleV0gPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShub2RlW2tleV0pKSBzbGltW2tleV0gPSBub2RlW2tleV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gQXV0b0xheW91dCDmjpLluIPlj4LmlbDvvIhzY2VuZS50cyBhcHBseUxheW91dCDor7vlj5bvvIznvLrliJkgc3BhY2luZ1gv5a+56b2Q5YWo5b2SIDDvvIlcbiAgICBpZiAodHlwZW9mIG5vZGUuaXRlbVNwYWNpbmcgPT09ICdudW1iZXInKSBzbGltLml0ZW1TcGFjaW5nID0gbm9kZS5pdGVtU3BhY2luZztcbiAgICBpZiAodHlwZW9mIG5vZGUuY291bnRlckF4aXNTcGFjaW5nID09PSAnbnVtYmVyJykgc2xpbS5jb3VudGVyQXhpc1NwYWNpbmcgPSBub2RlLmNvdW50ZXJBeGlzU3BhY2luZztcbiAgICBpZiAobm9kZS5wcmltYXJ5QXhpc0FsaWduSXRlbXMpIHNsaW0ucHJpbWFyeUF4aXNBbGlnbkl0ZW1zID0gbm9kZS5wcmltYXJ5QXhpc0FsaWduSXRlbXM7XG4gICAgaWYgKG5vZGUuY291bnRlckF4aXNBbGlnbkl0ZW1zKSBzbGltLmNvdW50ZXJBeGlzQWxpZ25JdGVtcyA9IG5vZGUuY291bnRlckF4aXNBbGlnbkl0ZW1zO1xuICAgIGlmIChub2RlLnBhZGRpbmcpIHNsaW0ucGFkZGluZyA9IHtcbiAgICAgICAgdG9wOiBub2RlLnBhZGRpbmcudG9wIHx8IDAsXG4gICAgICAgIHJpZ2h0OiBub2RlLnBhZGRpbmcucmlnaHQgfHwgMCxcbiAgICAgICAgYm90dG9tOiBub2RlLnBhZGRpbmcuYm90dG9tIHx8IDAsXG4gICAgICAgIGxlZnQ6IG5vZGUucGFkZGluZy5sZWZ0IHx8IDAsXG4gICAgfTtcbiAgICBpZiAobm9kZS5jbGlwc0NvbnRlbnQpIHNsaW0uY2xpcHNDb250ZW50ID0gdHJ1ZTtcbiAgICBpZiAobm9kZS5jb21wb25lbnRUeXBlKSBzbGltLmNvbXBvbmVudFR5cGUgPSBub2RlLmNvbXBvbmVudFR5cGU7XG4gICAgaWYgKFN0cmluZyhub2RlLmNvbXBvbmVudFR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCkgPT09ICdJTlBVVCcgJiYgbm9kZS5pbnB1dFNwZWMpIHtcbiAgICAgICAgY29uc3Qgc3BlYyA9IG5vZGUuaW5wdXRTcGVjO1xuICAgICAgICBjb25zdCB0ZXh0Tm9kZUlkID0gU3RyaW5nKHNwZWMudGV4dE5vZGVJZCB8fCAnJyk7XG4gICAgICAgIGlmICh0ZXh0Tm9kZUlkKSB7XG4gICAgICAgICAgICBzbGltLmlucHV0U3BlYyA9IHtcbiAgICAgICAgICAgICAgICBtdWx0aWxpbmU6IHNwZWMubXVsdGlsaW5lID09PSB0cnVlLFxuICAgICAgICAgICAgICAgIG1heExlbmd0aDogTnVtYmVyLmlzRmluaXRlKE51bWJlcihzcGVjLm1heExlbmd0aCkpID8gTWF0aC50cnVuYyhOdW1iZXIoc3BlYy5tYXhMZW5ndGgpKSA6IC0xLFxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyOiBTdHJpbmcoc3BlYy5wbGFjZWhvbGRlciB8fCAnJyksXG4gICAgICAgICAgICAgICAgc3RyaW5nOiBTdHJpbmcoc3BlYy5zdHJpbmcgfHwgJycpLFxuICAgICAgICAgICAgICAgIHRleHRSb2xlOiBzcGVjLnRleHRSb2xlID09PSAnc3RyaW5nJyA/ICdzdHJpbmcnIDogJ3BsYWNlaG9sZGVyJyxcbiAgICAgICAgICAgICAgICB0ZXh0Tm9kZUlkLFxuICAgICAgICAgICAgICAgIGNvdW50ZXJOb2RlSWQ6IHNwZWMuY291bnRlck5vZGVJZCA/IFN0cmluZyhzcGVjLmNvdW50ZXJOb2RlSWQpIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIGJhY2tncm91bmROb2RlSWQ6IHNwZWMuYmFja2dyb3VuZE5vZGVJZCA/IFN0cmluZyhzcGVjLmJhY2tncm91bmROb2RlSWQpIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAodHlwZW9mIG5vZGUuY29ybmVyUmFkaXVzID09PSAnbnVtYmVyJykgc2xpbS5jb3JuZXJSYWRpdXMgPSBub2RlLmNvcm5lclJhZGl1cztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShub2RlLmNvcm5lclJhZGlpKSkgc2xpbS5jb3JuZXJSYWRpaSA9IG5vZGUuY29ybmVyUmFkaWk7XG4gICAgaWYgKG5vZGUuc2xpY2U5Qm9yZGVyKSBzbGltLnNsaWNlOUJvcmRlciA9IHtcbiAgICAgICAgbGVmdDogbm9kZS5zbGljZTlCb3JkZXIubGVmdCB8fCAwLFxuICAgICAgICByaWdodDogbm9kZS5zbGljZTlCb3JkZXIucmlnaHQgfHwgMCxcbiAgICAgICAgdG9wOiBub2RlLnNsaWNlOUJvcmRlci50b3AgfHwgMCxcbiAgICAgICAgYm90dG9tOiBub2RlLnNsaWNlOUJvcmRlci5ib3R0b20gfHwgMCxcbiAgICB9O1xuICAgIGlmIChub2RlLnR5cGUgIT09ICdURVhUJykge1xuICAgICAgICBjb25zdCBzb2xpZCA9IGZpcnN0VmlzaWJsZVNvbGlkRmlsbChub2RlKTtcbiAgICAgICAgY29uc3QgY29sb3IgPSBjb2xvckZyb21GaWdtYUZpbGwoc29saWQpO1xuICAgICAgICBpZiAoY29sb3IpIHNsaW0uc29saWRGaWxsID0geyBjb2xvciB9O1xuICAgIH1cbiAgICAvLyDlm77niYfpga7nvanvvJrlj6rpgI/kvKDlnZDmoIcgKyDmsaAgaWTvvIhtYXNrUmVmIOafpSBpZFRvU3ByaXRlRnJhbWXvvIzkuI7oioLngrnlm77lhbHmsaDvvIlcbiAgICBpZiAobm9kZS5tYXNrKSB7XG4gICAgICAgIGNvbnN0IG1hc2tSb3V0ZSA9IG1hc2tSb3V0ZXMuZ2V0KG5vZGUpO1xuICAgICAgICBpZiAobWFza1JvdXRlICYmIG1hc2tSb3V0ZS51c2VJbWFnZU1hc2spIHN0YXRzLmltYWdlTWFza3MrKztcbiAgICAgICAgaWYgKG1hc2tSb3V0ZSAmJiAhbWFza1JvdXRlLnVzZUltYWdlTWFzaykgc3RhdHMucmVjdE1hc2tGYWxsYmFja3MrKztcbiAgICAgICAgaWYgKG1hc2tSb3V0ZSAmJiBtYXNrUm91dGUuc2hhcGUgPT09ICdERUdFTkVSQVRFJykgc3RhdHMuZGVnZW5lcmF0ZU1hc2tzKys7XG4gICAgICAgIHNsaW0ubWFzayA9IHtcbiAgICAgICAgICAgIHg6IG5vZGUubWFzay54LFxuICAgICAgICAgICAgeTogbm9kZS5tYXNrLnksXG4gICAgICAgICAgICB3aWR0aDogbm9kZS5tYXNrLndpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiBub2RlLm1hc2suaGVpZ2h0LFxuICAgICAgICAgICAgcm90YXRpb246IG5vZGUubWFzay5yb3RhdGlvbiB8fCAwLFxuICAgICAgICAgICAgbWFza1R5cGU6IG5vZGUubWFzay5tYXNrVHlwZSB8fCAnJyxcbiAgICAgICAgICAgIGtpbmQ6IG5vZGUubWFzay5raW5kIHx8ICdJTUFHRScsXG4gICAgICAgICAgICBtYXNrUmVmOiBub2RlLm1hc2suaW1hZ2VSZWYsXG4gICAgICAgICAgICBzaGFwZTogbWFza1JvdXRlID8gbWFza1JvdXRlLnNoYXBlIDogJ1NIQVBFRCcsXG4gICAgICAgICAgICB1c2VJbWFnZU1hc2s6IG1hc2tSb3V0ZSA/IG1hc2tSb3V0ZS51c2VJbWFnZU1hc2sgOiB0cnVlLFxuICAgICAgICAgICAgZmFsbGJhY2tSZWFzb246IG1hc2tSb3V0ZSA/IG1hc2tSb3V0ZS5mYWxsYmFja1JlYXNvbiA6IHVuZGVmaW5lZCxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgLy8g5paH5pys6IqC54K577ya5bim5LiK5riy5p+TIExhYmVsIOaJgOmcgOWtl+autVxuICAgIGlmIChub2RlLnR5cGUgPT09ICdURVhUJykge1xuICAgICAgICBzbGltLmNoYXJhY3RlcnMgPSBub3JtYWxpemVOZXdsaW5lcyhub2RlLmNoYXJhY3RlcnMgfHwgJycpO1xuICAgICAgICBzbGltLmZvbnRTaXplID0gbm9kZS5mb250U2l6ZSB8fCAwO1xuICAgICAgICBzbGltLmZvbnRGYW1pbHkgPSBub2RlLmZvbnRGYW1pbHkgfHwgJyc7XG4gICAgICAgIHNsaW0uZm9udFdlaWdodCA9IG5vZGUuZm9udFdlaWdodCB8fCAnJztcbiAgICAgICAgc2xpbS50ZXh0QWxpZ25Ib3Jpem9udGFsID0gbm9kZS50ZXh0QWxpZ25Ib3Jpem9udGFsIHx8ICcnO1xuICAgICAgICBzbGltLnRleHRBbGlnblZlcnRpY2FsID0gbm9kZS50ZXh0QWxpZ25WZXJ0aWNhbCB8fCAnJztcbiAgICAgICAgc2xpbS50ZXh0QXV0b1Jlc2l6ZSA9IG5vZGUudGV4dEF1dG9SZXNpemUgfHwgJyc7XG4gICAgICAgIHNsaW0udGV4dFRydW5jYXRpb24gPSBub2RlLnRleHRUcnVuY2F0aW9uIHx8ICcnO1xuICAgICAgICBzbGltLmxpbmVIZWlnaHQgPSBub2RlLmxpbmVIZWlnaHQgfHwgMDtcbiAgICAgICAgc2xpbS5sZXR0ZXJTcGFjaW5nID0gbm9kZS5sZXR0ZXJTcGFjaW5nIHx8IDA7XG4gICAgICAgIHNsaW0udGV4dERlY29yYXRpb24gPSBub2RlLnRleHREZWNvcmF0aW9uIHx8ICcnO1xuICAgICAgICBzbGltLnRleHRDYXNlID0gbm9kZS50ZXh0Q2FzZSB8fCAnJztcbiAgICAgICAgc2xpbS5jb2xvciA9IHRleHRDb2xvcihub2RlKTtcbiAgICAgICAgY29uc3QgZ3JhZGllbnQgPSB0ZXh0R3JhZGllbnQobm9kZSk7XG4gICAgICAgIGlmIChncmFkaWVudCkgc2xpbS50ZXh0R3JhZGllbnQgPSBncmFkaWVudDtcbiAgICAgICAgY29uc3Qgc2VnbWVudHMgPSBub3JtYWxpemVUZXh0U2VnbWVudHMobm9kZSk7XG4gICAgICAgIGlmIChzZWdtZW50cykgc2xpbS50ZXh0U2VnbWVudHMgPSBzZWdtZW50cztcbiAgICAgICAgc2xpbS50ZXh0U3R5bGUgPSBleHRyYWN0VGV4dFN0eWxlTWV0YShub2RlKTtcbiAgICAgICAgdGV4dFN0eWxlVHJhY2tlci5yZWNvcmQobm9kZSk7XG4gICAgICAgIC8vIOmYtuautSA1IOWtl+S9k+agt+W8j+W6k++8muaPj+i+uS/mipXlvbHku44gRmlnbWEg55u05o6l5rS+55Sf77yIQ29jb3Mg57uE5Lu25Y+v55Sf5oiQ77yM5peg6ZyA576O5pyv6aKE6YWN77yJ77yMXG4gICAgICAgIC8vIOWtl+S9k+aXj+WMuemFjeWIsOW3peeoi+Wtl+S9k+i1hOa6kCB1dWlk77yI5pyq5ZG95LitIOKGkiDkuI3luKYg4oaSIHNjZW5lIOWbnumAgOm7mOiupOWtl+S9k++8ieOAglxuICAgICAgICBjb25zdCBzdHJva2UgPSB0ZXh0U3Ryb2tlKG5vZGUpO1xuICAgICAgICBpZiAoc3Ryb2tlKSBzbGltLnN0cm9rZSA9IHN0cm9rZTtcbiAgICAgICAgY29uc3Qgc2hhZG93ID0gdGV4dFNoYWRvdyhub2RlKTtcbiAgICAgICAgaWYgKHNoYWRvdykgc2xpbS5zaGFkb3cgPSBzaGFkb3c7XG4gICAgICAgIGxldCBmb250ID0gbWF0Y2hGb250KG5vZGUuZm9udEZhbWlseSwgbm9kZS5mb250V2VpZ2h0LCBmb250TGliKTtcbiAgICAgICAgY29uc3QgdGV4dFN0eWxlTWF0Y2ggPSByZXNvbHZlVGV4dFN0eWxlVGVtcGxhdGUobm9kZSwgdGV4dFN0eWxlTGliKTtcbiAgICAgICAgdGV4dFN0eWxlVGVtcGxhdGVUcmFja2VyLnJlY29yZCh0ZXh0U3R5bGVNYXRjaCwgdGV4dFN0eWxlTGliLmVudHJpZXMubGVuZ3RoID4gMCk7XG4gICAgICAgIGlmICh0ZXh0U3R5bGVNYXRjaCkge1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSB0ZXh0U3R5bGVNYXRjaC5lbnRyeTtcbiAgICAgICAgICAgIHNsaW0udGV4dFN0eWxlVGVtcGxhdGUgPSB7XG4gICAgICAgICAgICAgICAgdGllcjogdGV4dFN0eWxlTWF0Y2gudGllcixcbiAgICAgICAgICAgICAgICBzY29yZTogTWF0aC5yb3VuZCh0ZXh0U3R5bGVNYXRjaC5zY29yZSAqIDEwMDApIC8gMTAwMCxcbiAgICAgICAgICAgICAgICBzb3VyY2U6IGVudHJ5LnNvdXJjZSxcbiAgICAgICAgICAgICAgICBzdHlsZU5hbWU6IGVudHJ5LnN0eWxlTmFtZSxcbiAgICAgICAgICAgICAgICBmaWdtYVBhdGg6IGVudHJ5LmZpZ21hUGF0aCxcbiAgICAgICAgICAgICAgICBjaGlsZE5hbWU6IGVudHJ5LmNoaWxkTmFtZSxcbiAgICAgICAgICAgICAgICBmb250VXVpZDogKGVudHJ5LmZvbnQgJiYgZW50cnkuZm9udC51dWlkKSB8fCAoZm9udCAmJiBmb250LnV1aWQpIHx8ICcnLFxuICAgICAgICAgICAgICAgIGZvbnRGaWxlTmFtZTogKGVudHJ5LmZvbnQgJiYgZW50cnkuZm9udC5maWxlTmFtZSkgfHwgKGZvbnQgJiYgZm9udC5maWxlTmFtZSkgfHwgJycsXG4gICAgICAgICAgICAgICAgcHJlZmFiVXVpZDogZW50cnkucHJlZmFiVXVpZCB8fCAnJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyDlkb3kuK3moLflvI/vvIjku7vmhI8gdGllcu+8ieS4lOiKgueCueiHqui6q+ayoeW4puaPj+i+uS/mipXlvbHml7bvvIznlKjmqKHmnb8gZW50cnkg55qE5pWw5YC85YWc5bqV44CCXG4gICAgICAgICAgICAvLyDms6jvvJrmnIkgcHJlZmFiIOaooeadv+aXtu+8jHNjZW5lIOS+p+S8muS8mOWFiOWFi+mahuaooeadv+iKgueCueWkluingu+8m+i/memHjOeahOaVsOWAvOaYr+OAjOaXoCBwcmVmYWIg5bqT44CN5pe255qE6ZmN57qn6Lev5b6E44CCXG4gICAgICAgICAgICBpZiAoIXN0cm9rZSAmJiBlbnRyeS5zdHJva2UpIHtcbiAgICAgICAgICAgICAgICBzbGltLnN0cm9rZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IGVudHJ5LnN0cm9rZS5jb2xvcixcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IGVudHJ5LnN0cm9rZS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgYWxpZ246IGVudHJ5LnN0cm9rZS5hbGlnbixcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzaGFkb3cgJiYgZW50cnkuc2hhZG93KSB7XG4gICAgICAgICAgICAgICAgc2xpbS5zaGFkb3cgPSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbG9yOiBlbnRyeS5zaGFkb3cuY29sb3IsXG4gICAgICAgICAgICAgICAgICAgIG9mZnNldFg6IGVudHJ5LnNoYWRvdy5vZmZzZXRYLFxuICAgICAgICAgICAgICAgICAgICBvZmZzZXRZOiBlbnRyeS5zaGFkb3cub2Zmc2V0WSxcbiAgICAgICAgICAgICAgICAgICAgYmx1cjogZW50cnkuc2hhZG93LmJsdXIsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChlbnRyeS5mb250KSB7XG4gICAgICAgICAgICAgICAgZm9udCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogZW50cnkuZm9udC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBmaWxlTmFtZTogZW50cnkuZm9udC5maWxlTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgc2ltOiB0ZXh0U3R5bGVNYXRjaC5zY29yZSxcbiAgICAgICAgICAgICAgICAgICAgd2VpZ2h0TWF0Y2hlZDogZW50cnkuZm9udC53ZWlnaHRNYXRjaGVkLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvbnQpIHtcbiAgICAgICAgICAgIHNsaW0uZm9udFV1aWQgPSBmb250LnV1aWQ7XG4gICAgICAgICAgICBzbGltLmZvbnRGaWxlTmFtZSA9IGZvbnQuZmlsZU5hbWU7XG4gICAgICAgICAgICBzbGltLmZvbnRXZWlnaHRNYXRjaGVkID0gZm9udC53ZWlnaHRNYXRjaGVkO1xuICAgICAgICB9XG4gICAgICAgIC8vIOiusOW9leWtl+S9k+mcgOaxgu+8iOWRveS4rS/nvLrlpLHvvInnlKjkuo7nlJ/miJDpnIDmsYLmiqXlkYpcbiAgICAgICAgZm9udFRyYWNrZXIucmVjb3JkRGVtYW5kKFxuICAgICAgICAgICAgbm9kZS5mb250RmFtaWx5LFxuICAgICAgICAgICAgbm9kZS5mb250V2VpZ2h0LFxuICAgICAgICAgICAgISFmb250LFxuICAgICAgICAgICAgZm9udCA/IHVuZGVmaW5lZCA6IGV4cGxhaW5Gb250TWlzcyhub2RlLmZvbnRGYW1pbHksIG5vZGUuZm9udFdlaWdodCwgZm9udExpYilcbiAgICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHNsaW07XG59XG5cbi8qKlxuICogQGVuIFByZXBhcmUgdGhlIHNjZW5lLXByb2Nlc3MgcGF5bG9hZCBmcm9tIHBhcnNlZCBGaWdtYSBKU09OLlxuICogQHpoIOaKiiBGaWdtYSBKU09OIOWHhuWkh+aIkCBzY2VuZSDohJrmnKzlj6/mtojotLnnmoQgcGF5bG9hZOOAguS4u+WvvOWFpeS4juabv+aNoiBiZXRhIOWFseeUqOWQjOS4gOadoemTvui3r+OAglxuICovXG5hc3luYyBmdW5jdGlvbiBwcmVwYXJlU2NlbmVQYXlsb2FkRnJvbURhdGEoZGF0YTogRmlnbWFFeHBvcnREYXRhKTogUHJvbWlzZTxQcmVwYXJlZFNjZW5lUGF5bG9hZD4ge1xuICAgIHJlcG9ydE1hcHBpbmdEaWFnbm9zdGljcyhkYXRhKTtcbiAgICBjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVJbXBvcnREYXRhKGRhdGEpO1xuICAgIGNvbnN0IGltYWdlRGltcyA9IGJ1aWxkSW1hZ2VEaW1lbnNpb25NYXAocHJlcGFyZWQuaW1hZ2VzKTtcbiAgICBjb25zdCB2YXJpYW50U3RhdHMgPSBwcmVwYXJlUGVyc2lzdGVudEltYWdlVmFyaWFudHMocHJlcGFyZWQucm9vdCwgcHJlcGFyZWQuaW1hZ2VzLCBpbWFnZURpbXMpO1xuICAgIGlmICh2YXJpYW50U3RhdHMuY3JvcHBlZEltYWdlRmlsbHMgPiAwIHx8IHZhcmlhbnRTdGF0cy5jcm9wRmFpbHVyZXMgPiAwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0g5oyB5LmF5YyWIElNQUdFIGZpbGwg6KOB5YiH77ya55Sf5oiQICR7dmFyaWFudFN0YXRzLmNyb3BwZWRJbWFnZUZpbGxzfSDlvKDoo4HliIcgUE5HYCArXG4gICAgICAgICAgICBgJHt2YXJpYW50U3RhdHMuY3JvcEZhaWx1cmVzID4gMCA/IGDvvIwke3ZhcmlhbnRTdGF0cy5jcm9wRmFpbHVyZXN9IOW8oOijgeWIh+Wksei0peWbnumAgOi/kOihjOaXtuijgeWIh2AgOiAnJ33jgIJgXG4gICAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHNsaWNlOVZhcmlhbnRTdGF0cyA9IHByZXBhcmVTbGljZTlJbWFnZVZhcmlhbnRzKHByZXBhcmVkLnJvb3QsIHByZXBhcmVkLmltYWdlcywgaW1hZ2VEaW1zKTtcbiAgICBpZiAoc2xpY2U5VmFyaWFudFN0YXRzLnNlbWFudGljSW1hZ2VzID4gMCB8fCBzbGljZTlWYXJpYW50U3RhdHMubWlzc2luZ0ltYWdlcyA+IDApIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSBTTElDRTkg5Zu+54mH6K+t5LmJ6ZqU56a777yaYCArXG4gICAgICAgICAgICBgJHtzbGljZTlWYXJpYW50U3RhdHMuZXhwbGljaXROb2Rlc30g5Liq5pi+5byP6IqC54K577yMJHtzbGljZTlWYXJpYW50U3RhdHMuaW1wbGljaXROb2Rlc30g5Liq6ZqQ5byP6IqC54K577yMYCArXG4gICAgICAgICAgICBgJHtzbGljZTlWYXJpYW50U3RhdHMuc2VtYW50aWNJbWFnZXN9IOS4qiBib3JkZXIg5Zu+54mH5byV55SoYCArXG4gICAgICAgICAgICBgJHtzbGljZTlWYXJpYW50U3RhdHMubWlzc2luZ0ltYWdlcyA+IDAgPyBg77yMJHtzbGljZTlWYXJpYW50U3RhdHMubWlzc2luZ0ltYWdlc30g5Liq5Y6f5Zu+5byV55So57y65aSxYCA6ICcnfeOAgmBcbiAgICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgZXhwbGljaXRTcHJpdGVGcmFtZUJvcmRlcnMgPSBjb2xsZWN0U3ByaXRlRnJhbWVCb3JkZXJzKHByZXBhcmVkLnJvb3QpO1xuICAgIGNvbnN0IGltcGxpY2l0U3ByaXRlRnJhbWVCb3JkZXJzID0gY29sbGVjdEltcGxpY2l0U3ByaXRlRnJhbWVCb3JkZXJzKHByZXBhcmVkLnJvb3QsIGltYWdlRGltcyk7XG4gICAgY29uc3Qgc3ByaXRlRnJhbWVCb3JkZXJzID0ge1xuICAgICAgICAuLi5pbXBsaWNpdFNwcml0ZUZyYW1lQm9yZGVycy5ib3JkZXJzLFxuICAgICAgICAuLi5leHBsaWNpdFNwcml0ZUZyYW1lQm9yZGVycyxcbiAgICB9O1xuICAgIGlmIChpbXBsaWNpdFNwcml0ZUZyYW1lQm9yZGVycy5jb3VudCA+IDApIHtcbiAgICAgICAgY29uc29sZS5sb2coYFtmaWdtYS1pbXBvcnRlcl0g5qOA5rWL5YiwICR7aW1wbGljaXRTcHJpdGVGcmFtZUJvcmRlcnMuY291bnR9IOS4qiBVbml0eSDpo47moLzpmpDlvI/kuIkv5Lmd5YiH54mH6IqC54K577yM5oyJIFNMSUNFOSDlr7zlhaXjgIJgKTtcbiAgICB9XG4gICAgY29uc3QgbWFza1JvdXRlcyA9IGJ1aWxkTWFza1JvdXRlcyhwcmVwYXJlZC5yb290LCBwcmVwYXJlZC5pbWFnZXMpO1xuICAgIGNvbnN0IHVudXNlZEltYWdlcyA9IHBydW5lVW51c2VkSW1hZ2VQb29sKHByZXBhcmVkLnJvb3QsIHByZXBhcmVkLmltYWdlcywgaW1hZ2VEaW1zKTtcbiAgICBpZiAodW51c2VkSW1hZ2VzID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSDlm77niYfmsaDmuIXnkIbvvJrot7Pov4cgJHt1bnVzZWRJbWFnZXN9IOW8oOW9k+WJjeWcuuaZr+acquW8leeUqOeahOWbvueJh+OAgmApO1xuICAgIH1cbiAgICBjb25zdCBzbGltU3RhdHM6IFNsaW1TdGF0cyA9IHtcbiAgICAgICAgc2hhcmVkQ3JvcHBlZEltYWdlczogMCxcbiAgICAgICAgc2hhcmVkQ3JvcHBlZFNsaWNlQ2hpbGRyZW46IDAsXG4gICAgICAgIGltcGxpY2l0U2xpY2U5SW1hZ2VzOiAwLFxuICAgICAgICBpbXBsaWNpdFNsaWNlOVNsaWNlQ2hpbGRyZW46IDAsXG4gICAgICAgIGltYWdlTWFza3M6IDAsXG4gICAgICAgIHJlY3RNYXNrRmFsbGJhY2tzOiAwLFxuICAgICAgICBkZWdlbmVyYXRlTWFza3M6IDAsXG4gICAgfTtcbiAgICBsZXQgaWRUb1Nwcml0ZUZyYW1lOiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcbiAgICBsZXQgaWRUb01hc2tTcHJpdGVGcmFtZTogeyBbaWQ6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgY29uc3QgYXNzZXRJbXBvcnRGYWlsdXJlczogYW55W10gPSBbXTtcbiAgICAvLyDkuLvov5vnqIvkv53nlZnlrozmlbQgbWV0YSDmlLbmlZvnirbmgIHvvJtzY2VuZSBJUEMg5Y+q5o6l5pS2IGltZ1JlZiAtPiBkYlVybCDnmoTovbvph4/mipXlvbHjgIJcbiAgICBsZXQgcGVuZGluZ1Nwcml0ZUZyYW1lczogeyBbaWQ6IHN0cmluZ106IFBlbmRpbmdTcHJpdGVGcmFtZSB9ID0ge307XG4gICAgaWYgKHByZXBhcmVkLmltYWdlcyAmJiBPYmplY3Qua2V5cyhwcmVwYXJlZC5pbWFnZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgbWFza1JlZnMgPSBjb2xsZWN0SW1hZ2VNYXNrUmVmcyhwcmVwYXJlZC5yb290LCBtYXNrUm91dGVzKTtcbiAgICAgICAgY29uc3QgbWFza0ltYWdlczogeyBbaWQ6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgICAgIGZvciAoY29uc3QgcmVmIG9mIG1hc2tSZWZzKSB7XG4gICAgICAgICAgICBpZiAocHJlcGFyZWQuaW1hZ2VzW3JlZl0pIG1hc2tJbWFnZXNbcmVmXSA9IHByZXBhcmVkLmltYWdlc1tyZWZdO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXJdIGxhbmRpbmcgJHtPYmplY3Qua2V5cyhwcmVwYXJlZC5pbWFnZXMpLmxlbmd0aH0gaW1hZ2VzLi4uYCk7XG4gICAgICAgIGNvbnN0IGNvbW1vbkRpcnMgPSBhd2FpdCByZWFkQ29tbW9uUmVzb3VyY2VEaXJzKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXJdIEFzc2V0REIg6Zi25q61IHByb2ZpbGUgcmVhZHk6ICR7Y29tbW9uRGlycy5qb2luKCcsICcpfWApO1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBsYW5kSW1hZ2VzKHByZXBhcmVkLmltYWdlcywgcHJlcGFyZWQubmFtZSB8fCAndW50aXRsZWQnLCBzcHJpdGVGcmFtZUJvcmRlcnMsIGNvbW1vbkRpcnMpO1xuICAgICAgICBpZFRvU3ByaXRlRnJhbWUgPSByZXMuaWRUb1Nwcml0ZUZyYW1lO1xuICAgICAgICBwZW5kaW5nU3ByaXRlRnJhbWVzID0gcmVzLnVucmVzb2x2ZWQgfHwge307XG4gICAgICAgIGZvciAoY29uc3QgW2ltZ1JlZiwgZmFpbHVyZV0gb2YgT2JqZWN0LmVudHJpZXMocmVzLmZhaWx1cmVzIHx8IHt9KSkge1xuICAgICAgICAgICAgYXNzZXRJbXBvcnRGYWlsdXJlcy5wdXNoKHsgaW1nUmVmLCBraW5kOiAnc3ByaXRlJywgLi4uZmFpbHVyZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoT2JqZWN0LmtleXMocGVuZGluZ1Nwcml0ZUZyYW1lcykubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgcmVhZGluZXNzID0gYXdhaXQgcmVzb2x2ZVNwcml0ZUZyYW1lc0JlZm9yZUJ1aWxkKHBlbmRpbmdTcHJpdGVGcmFtZXMpO1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpZFRvU3ByaXRlRnJhbWUsIHJlYWRpbmVzcy5yZXNvbHZlZCk7XG4gICAgICAgICAgICBwZW5kaW5nU3ByaXRlRnJhbWVzID0gcmVhZGluZXNzLnVucmVzb2x2ZWQ7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSDlu7rmoJHliY0gU3ByaXRlRnJhbWUg5bCx57uq5qOA5p+l77yaYCArXG4gICAgICAgICAgICAgICAgYCR7T2JqZWN0LmtleXMocmVhZGluZXNzLnJlc29sdmVkKS5sZW5ndGh9IOW8oOW3suaUtuaVm++8jCR7T2JqZWN0LmtleXMocGVuZGluZ1Nwcml0ZUZyYW1lcykubGVuZ3RofSDlvKDku43mnKrlsLHnu6rjgIJgXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXJdIGxhbmRlZCAke09iamVjdC5rZXlzKGlkVG9TcHJpdGVGcmFtZSkubGVuZ3RofSBzcHJpdGUgZnJhbWVzYCk7XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhtYXNrSW1hZ2VzKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSBsYW5kaW5nICR7T2JqZWN0LmtleXMobWFza0ltYWdlcykubGVuZ3RofSBtYXNrIGltYWdlcy4uLmApO1xuICAgICAgICAgICAgY29uc3QgbWFza1JlcyA9IGF3YWl0IGxhbmRNYXNrSW1hZ2VzKG1hc2tJbWFnZXMsIHByZXBhcmVkLm5hbWUgfHwgJ3VudGl0bGVkJywgY29tbW9uRGlycyk7XG4gICAgICAgICAgICBpZFRvTWFza1Nwcml0ZUZyYW1lID0gbWFza1Jlcy5pZFRvU3ByaXRlRnJhbWU7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtpbWdSZWYsIGZhaWx1cmVdIG9mIE9iamVjdC5lbnRyaWVzKG1hc2tSZXMuZmFpbHVyZXMgfHwge30pKSB7XG4gICAgICAgICAgICAgICAgYXNzZXRJbXBvcnRGYWlsdXJlcy5wdXNoKHsgaW1nUmVmLCBraW5kOiAnbWFzaycsIC4uLmZhaWx1cmUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB1bnJlc29sdmVkTWFza3MgPSBtYXNrUmVzLnVucmVzb2x2ZWQgfHwge307XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXModW5yZXNvbHZlZE1hc2tzKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVhZGluZXNzID0gYXdhaXQgcmVzb2x2ZVNwcml0ZUZyYW1lc0JlZm9yZUJ1aWxkKHVucmVzb2x2ZWRNYXNrcyk7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpZFRvTWFza1Nwcml0ZUZyYW1lLCByZWFkaW5lc3MucmVzb2x2ZWQpO1xuICAgICAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhyZWFkaW5lc3MudW5yZXNvbHZlZCkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSAke09iamVjdC5rZXlzKHJlYWRpbmVzcy51bnJlc29sdmVkKS5sZW5ndGh9IOW8oOmBrue9qSBTcHJpdGVGcmFtZSBgICtcbiAgICAgICAgICAgICAgICAgICAgICAgIGDlnKjlu7rmoJHliY3ku43mnKrlsLHnu6rvvIzlsIbmjInnn6nlvaLpga7nvanpmY3nuqfjgIJgXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc29sZS5sb2coYFtmaWdtYS1pbXBvcnRlcl0gbGFuZGVkICR7T2JqZWN0LmtleXMoaWRUb01hc2tTcHJpdGVGcmFtZSkubGVuZ3RofSBtYXNrIHNwcml0ZSBmcmFtZXNgKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoYXNzZXRJbXBvcnRGYWlsdXJlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWdtYS1pbXBvcnRlcl0g6LWE5rqQ5a+85YWl56Gs5aSx6LSl5riF5Y2V77yaJywgYXNzZXRJbXBvcnRGYWlsdXJlcyk7XG4gICAgfVxuICAgIGNvbnN0IGZvbnRMaWIgPSBhd2FpdCBzY2FuRm9udExpYnJhcnkoKTtcbiAgICBjb25zdCB0ZXh0U3R5bGVMaWIgPSBhd2FpdCBzY2FuVGV4dFN0eWxlTGlicmFyeShmb250TGliKTtcbiAgICBjb25zdCBmb250VHJhY2tlciA9IG5ldyBGb250RGVtYW5kVHJhY2tlcigpO1xuICAgIGNvbnN0IHRleHRTdHlsZVRyYWNrZXIgPSBuZXcgVGV4dFN0eWxlVHJhY2tlcigpO1xuICAgIGNvbnN0IHRleHRTdHlsZVRlbXBsYXRlVHJhY2tlciA9IG5ldyBUZXh0U3R5bGVUZW1wbGF0ZVRyYWNrZXIoKTtcbiAgICBjb25zdCBzbGltID0gc2xpbVRyZWUocHJlcGFyZWQucm9vdCwgZm9udExpYiwgdGV4dFN0eWxlTGliLCBmb250VHJhY2tlciwgdGV4dFN0eWxlVHJhY2tlciwgdGV4dFN0eWxlVGVtcGxhdGVUcmFja2VyLCBpbWFnZURpbXMsIG1hc2tSb3V0ZXMsIHNsaW1TdGF0cyk7XG4gICAgbGFzdENvbXBvbmVudElkZW50aXRpZXMgPSBjb2xsZWN0Q29tcG9uZW50SWRlbnRpdGllcyhzbGltKTtcbiAgICBjb25zdCBtYXBwaW5nRG9jdW1lbnQgPSByZWFkQ29tcG9uZW50TWFwcGluZ0RvY3VtZW50KCk7XG4gICAgY29uc3QgcmVzb2x2ZWRNYXBwaW5ncyA9IGF3YWl0IHJlc29sdmVDb21wb25lbnRNYXBwaW5nQXNzZXRzKG1hcHBpbmdEb2N1bWVudCk7XG4gICAgaWYgKGxhc3RDb21wb25lbnRJZGVudGl0aWVzLmxlbmd0aCA+IDAgfHwgbWFwcGluZ0RvY3VtZW50LmVudHJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOe7hOS7tuaYoOWwhO+8muacrOasoeWPkeeOsCAke2xhc3RDb21wb25lbnRJZGVudGl0aWVzLmxlbmd0aH0g5Liq57uE5Lu26Lqr5Lu977yMYCArXG4gICAgICAgICAgICBgJHtyZXNvbHZlZE1hcHBpbmdzLnZhbGlkfSDmnaEgUHJlZmFiIOWPr+eUqO+8jCR7cmVzb2x2ZWRNYXBwaW5ncy5icm9rZW59IOadoeaWremTvuOAgmBcbiAgICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHNsaW1TdGF0cy5zaGFyZWRDcm9wcGVkSW1hZ2VzID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOajgOa1i+WIsCAke3NsaW1TdGF0cy5zaGFyZWRDcm9wcGVkSW1hZ2VzfSDkuKrlhbHkuqvlpKflm77liIfniYfoioLngrnvvIxgICtcbiAgICAgICAgICAgIGDlt7Lot7Pov4cgJHtzbGltU3RhdHMuc2hhcmVkQ3JvcHBlZFNsaWNlQ2hpbGRyZW59IOS4quWIh+eJh+WtkOiKgueCueOAgmBcbiAgICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHNsaW1TdGF0cy5pbXBsaWNpdFNsaWNlOUltYWdlcyA+IDApIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSDmo4DmtYvliLAgJHtzbGltU3RhdHMuaW1wbGljaXRTbGljZTlJbWFnZXN9IOS4qumakOW8j+S4iS/kuZ3liIfniYfoioLngrnvvIxgICtcbiAgICAgICAgICAgIGDlt7Lot7Pov4cgJHtzbGltU3RhdHMuaW1wbGljaXRTbGljZTlTbGljZUNoaWxkcmVufSDkuKrliIfniYflrZDoioLngrnjgIJgXG4gICAgICAgICk7XG4gICAgfVxuICAgIGlmIChzbGltU3RhdHMuaW1hZ2VNYXNrcyA+IDAgfHwgc2xpbVN0YXRzLnJlY3RNYXNrRmFsbGJhY2tzID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOWbvueJh+mBrue9qei3r+eUse+8miR7c2xpbVN0YXRzLmltYWdlTWFza3N9IOS4quS/neeVmSBTcHJpdGUgc3RlbmNpbO+8jGAgK1xuICAgICAgICAgICAgYCR7c2xpbVN0YXRzLnJlY3RNYXNrRmFsbGJhY2tzfSDkuKrpgIDlm57nn6nlvaLoo4HliapgICtcbiAgICAgICAgICAgIGAke3NsaW1TdGF0cy5kZWdlbmVyYXRlTWFza3MgPiAwID8gYO+8iOWFtuS4rSAke3NsaW1TdGF0cy5kZWdlbmVyYXRlTWFza3N9IOS4qui/keS5juepuueZve+8iWAgOiAnJ33jgIJgXG4gICAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICAgIGNhbnZhczogcHJlcGFyZWQuY2FudmFzLFxuICAgICAgICByb290OiBzbGltLFxuICAgICAgICBpZFRvU3ByaXRlRnJhbWUsXG4gICAgICAgIGlkVG9NYXNrU3ByaXRlRnJhbWUsXG4gICAgICAgIHVucmVzb2x2ZWQ6IE9iamVjdC5mcm9tRW50cmllcyhcbiAgICAgICAgICAgIE9iamVjdC5lbnRyaWVzKHBlbmRpbmdTcHJpdGVGcmFtZXMpLm1hcCgoW2ltZ1JlZiwgcGVuZGluZ10pID0+IFtpbWdSZWYsIHBlbmRpbmcuZGJVcmxdKVxuICAgICAgICApLFxuICAgICAgICBjb21wb25lbnRNYXBwaW5nczogcmVzb2x2ZWRNYXBwaW5ncy5lbnRyaWVzLFxuICAgICAgICBjb21wb25lbnRTdGF0ZVJ1bnRpbWVSZWFkeSxcbiAgICAgICAgaW1wb3J0TWV0YToge1xuICAgICAgICAgICAgaW50ZXJmYWNlQ291bnQ6IHByZXBhcmVkLmludGVyZmFjZUNvdW50LFxuICAgICAgICAgICAgY29tcG9uZW50SWRlbnRpdGllczogbGFzdENvbXBvbmVudElkZW50aXRpZXMubGVuZ3RoLFxuICAgICAgICAgICAgY29tcG9uZW50TWFwcGluZ3M6IHJlc29sdmVkTWFwcGluZ3MudmFsaWQsXG4gICAgICAgICAgICBicm9rZW5Db21wb25lbnRNYXBwaW5nczogcmVzb2x2ZWRNYXBwaW5ncy5icm9rZW4sXG4gICAgICAgICAgICBhc3NldEltcG9ydEZhaWx1cmVzOiBhc3NldEltcG9ydEZhaWx1cmVzLmxlbmd0aCxcbiAgICAgICAgICAgIGFzc2V0SW1wb3J0RmFpbHVyZVNhbXBsZTogYXNzZXRJbXBvcnRGYWlsdXJlcy5zbGljZSgwLCAxMCksXG4gICAgICAgICAgICAuLi5zbGltU3RhdHMsXG4gICAgICAgIH0sXG4gICAgfTtcbiAgICByZXR1cm4ge1xuICAgICAgICBwcmVwYXJlZCxcbiAgICAgICAgcGF5bG9hZCxcbiAgICAgICAgcGVuZGluZ1Nwcml0ZUZyYW1lcyxcbiAgICAgICAgZm9udFRyYWNrZXIsXG4gICAgICAgIHRleHRTdHlsZVRyYWNrZXIsXG4gICAgICAgIHRleHRTdHlsZVRlbXBsYXRlVHJhY2tlcixcbiAgICAgICAgdGV4dFN0eWxlTGliLFxuICAgIH07XG59XG5cbi8qKlxuICogQGVuIENvcmUgYnVpbGQgcGlwZWxpbmUgZnJvbSBwYXJzZWQgZXhwb3J0IGRhdGE6IGxhbmQgaW1hZ2VzIOKGkiBzbGltIHRyZWUg4oaSIGJ1aWxkIHNjZW5lLlxuICogICAgIFNoYXJlZCBieSBtZW51IGltcG9ydCAoZmlsZSkgYW5kIHB1c2ggcmVjZWl2ZSAoSFRUUCkuIOmTgeW+i++8mmJhc2U2NCDlj6rlnKggbGFuZEltYWdlcyDokL3nm5jjgIJcbiAqIEB6aCDku47lt7Lop6PmnpDnmoTlr7zlh7rmlbDmja7lu7rlnLrmma/vvJrokL3nm5jlm77niYcg4oaSIOeYpui6q+agkSDihpIg5bu66IqC54K544CC6I+c5Y2V5a+85YWl5LiO5o6o6YCB5o6l5pS25YWx55So44CCXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGJ1aWxkRnJvbURhdGEoZGF0YTogRmlnbWFFeHBvcnREYXRhKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBpbXBvcnRTdGFydE1zID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCBhc3NldERiU2Vzc2lvbiA9IGJlZ2luQXNzZXREYlNlc3Npb24oYOWvvOWFpeOAjCR7ZGF0YS5uYW1lIHx8ICd1bnRpdGxlZCd944CNYCk7XG4gICAgY29uc3Qgc3RhcnRTdHIgPSBuZXcgRGF0ZShpbXBvcnRTdGFydE1zKS50b0xvY2FsZVN0cmluZygpO1xuICAgIGNvbnNvbGUubG9nKGAlYz09PT09PT09PT0g5a+85YWl5byA5aeL5LqOICR7c3RhcnRTdHJ9IMK3IOaehOW7uueJiOacrCA9ICR7QlVJTERfVkVSU0lPTn0gPT09PT09PT09PWAsICdjb2xvcjojMGEwO2ZvbnQtd2VpZ2h0OmJvbGQnKTtcbiAgICBsZXQgcmVzdWx0OiBhbnk7XG4gICAgLy8g5aSx6LSl5Z+L54K555So55qE44CM5b2T5YmN5q2l6aqk44CN5qCH6K6w77ya5oqb5byC5bi45pe25o2u5q2k5Yik5pat5Y2h5Zyo5ZOq5LiA5q2l77yI5YeG5aSH6LSf6L29IC8g5bu65qCRIC8g6JC955uY5L+d5a2Y77yJ44CCXG4gICAgbGV0IHN0ZXAgPSAncHJlcGFyZSc7XG4gICAgdHJ5IHtcbiAgICAgICAgc3RlcCA9ICdjb21wb25lbnRTdGF0ZVJ1bnRpbWUnO1xuICAgICAgICBsZXQgY29tcG9uZW50U3RhdGVSZWFkeSA9IGZhbHNlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29tcG9uZW50U3RhdGVSZWFkeSA9IGF3YWl0IGVuc3VyZUNvbXBvbmVudFN0YXRlUnVudGltZSgpO1xuICAgICAgICB9IGNhdGNoIChydW50aW1lRXJyb3IpIHtcbiAgICAgICAgICAgIHJldGhyb3dJZkFzc2V0RGJVbmF2YWlsYWJsZShydW50aW1lRXJyb3IpO1xuICAgICAgICAgICAgY29tcG9uZW50U3RhdGVSdW50aW1lUmVhZHkgPSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSAke0NPTVBPTkVOVF9TVEFURV9SVU5USU1FX0NMQVNTfSDlronoo4XmiJbljYfnuqflpLHotKXvvIxgICtcbiAgICAgICAgICAgICAgICAn5pys5qyh5a+85YWl5bCG57un57ut5bm25oqK57uE5Lu254q25oCB6K6w5Li6IHVuYXZhaWxhYmxl77yaJyxcbiAgICAgICAgICAgICAgICAocnVudGltZUVycm9yIGFzIGFueSk/Lm1lc3NhZ2UgfHwgcnVudGltZUVycm9yXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGlmICghY29tcG9uZW50U3RhdGVSZWFkeSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdICR7Q09NUE9ORU5UX1NUQVRFX1JVTlRJTUVfQ0xBU1N9IOWwmuacquWujOaIkOazqOWGjO+8m2AgK1xuICAgICAgICAgICAgICAgICfnu4Tku7bmmKDlsITlj6/nu6fnu63vvIzkvYbmnKzmrKHnirbmgIHlrZfmrrXkvJrmmI7noa7orrDkuLogdW5hdmFpbGFibGXjgIInXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHN0ZXAgPSAncHJlcGFyZSc7XG4gICAgICAgIGNvbnN0IHByZXBhcmVkUGF5bG9hZCA9IGF3YWl0IHByZXBhcmVTY2VuZVBheWxvYWRGcm9tRGF0YShkYXRhKTtcbiAgICAgICAgY29uc3QgeyBwcmVwYXJlZCwgcGF5bG9hZCwgZm9udFRyYWNrZXIsIHRleHRTdHlsZVRyYWNrZXIsIHRleHRTdHlsZVRlbXBsYXRlVHJhY2tlciwgdGV4dFN0eWxlTGliIH0gPSBwcmVwYXJlZFBheWxvYWQ7XG4gICAgICAgIHN0ZXAgPSAnYnVpbGRUcmVlJztcbiAgICAgICAgcmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdidWlsZFRyZWUnLCBwYXlsb2FkKTtcbiAgICAgICAgY29uc29sZS5sb2coJ1tmaWdtYS1pbXBvcnRlcl0gYnVpbGRUcmVlIHJlc3VsdDonLCByZXN1bHQpO1xuXG4gICAgICAgIC8vIOWvvOWFpeWQjuS4u+WKqOWIt+aWsOe8lui+keWZqCBTY2VuZSDop4blm77vvJpleGVjdXRlLXNjZW5lLXNjcmlwdCDliqjmgIHlu7rnmoToioLngrnvvIzop4blm77kuI3kvJroh6rliqjph43nu5hcbiAgICAgICAgLy/vvIjooajnjrDkuLrog4zmma/igJzlh7rnjrDlkI7mtojlpLHigJ3vvIzmiYvliqjkv53lrZgrcmVsb2FkIOaJjeWbnuadpe+8ieOAgueUqOaIt+W3sumqjOivgeKAnOS/neWtmOWQjiByZWxvYWQg5bCx5pyJ4oCd77yMXG4gICAgICAgIC8vIOaVhei/memHjOiHquWKqCBzbmFwc2hvdCArIHNhdmUtc2NlbmXvvIjmiorov5DooYzml7boioLngrnokL3ov5sgLnNjZW5l77yJ4oaSIOe8lui+keWZqOmaj+S5i+mHjeaWsOWKoOi9vea4suafk++8jOetieS7t+aJi+WKqOmCo+atpeOAglxuICAgICAgICBsZXQgcGxhY2Vob2xkZXJSZXBvcnQ6IHsgdG90YWw6IG51bWJlcjsgcmVwbGFjZWQ6IG51bWJlcjsgc3RpbGxNaXNzaW5nOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdWNjZXNzICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgbGFzdEltcG9ydGVkSnNvbkZvclB1bGwgPSBKU09OLnN0cmluZ2lmeShkYXRhLCBudWxsLCA0KTtcbiAgICAgICAgICAgIGxhc3RJbXBvcnRlZE5hbWVGb3JQdWxsID0gZGF0YS5uYW1lIHx8IHByZXBhcmVkLm5hbWUgfHwgJyc7XG4gICAgICAgICAgICBsYXN0SW1wb3J0ZWRSb290VXVpZCA9IHJlc3VsdCAmJiByZXN1bHQuZGF0YSA/IChyZXN1bHQuZGF0YS5yb290VXVpZCB8fCAnJykgOiAnJztcblxuICAgICAgICAgICAgc3RlcCA9ICdjb21wb25lbnRTdGF0ZVRhcmdldHMnO1xuICAgICAgICAgICAgYXdhaXQgZmluYWxpemVDb21wb25lbnRTdGF0ZVRhcmdldHMocmVzdWx0KTtcblxuICAgICAgICAgICAgLy8g5Y2g5L2N4oaS5pu/5o2i77ya5bu65qCR5a+544CM5bey6JC955uY5L2G5a2Q6LWE5rqQ5pyq5bCx57uq44CN55qE5Zu+5YWI5oyC5LqG5ZOB57qi5Y2g5L2N77yb6L+Z6YeM5ZCO5Y+w6L2u6K+i5a2Q6LWE5rqQ5bCx57uq44CBXG4gICAgICAgICAgICAvLyDlsLHnu6rlkI7mm7/mjaLmiJDnnJ/lm77vvIzlhajpg6jlpITnkIblrozvvIjmiJbotoXml7bvvInmiY3kv53lrZjigJTigJTkv53lrZjnmoTmmK/lrozmlbTnnJ/lm77vvIzogIzpnZ7lk4HnuqLjgIJcbiAgICAgICAgICAgIC8vIOWFs+mUru+8muW7uuagkeW3sui/lOWbnuOAgeWTgee6ouW3suaYvuekuu+8jOatpOWkhOetieW+heS4jeWGu+e7k+W7uuagkeS4u+a1geeoi++8jOaVhemihOeul+WPr+i/nOWkp+S6juaXp+eahOWbuuWumiAyLjdz44CCXG4gICAgICAgICAgICBzdGVwID0gJ3Jlc29sdmVQbGFjZWhvbGRlcnMnO1xuICAgICAgICAgICAgcGxhY2Vob2xkZXJSZXBvcnQgPSBhd2FpdCByZXNvbHZlUHJlcGFyZWRQbGFjZWhvbGRlcnMocmVzdWx0LCBwcmVwYXJlZFBheWxvYWQucGVuZGluZ1Nwcml0ZUZyYW1lcyk7XG5cbiAgICAgICAgICAgIHN0ZXAgPSAnc2F2ZVNjZW5lJztcbiAgICAgICAgICAgIGF3YWl0IHNhdmVTY2VuZUFmdGVySW1wb3J0KHJlc3VsdCk7XG5cbiAgICAgICAgICAgIC8vIOWfi+eCue+8muWvvOWFpeaIkOWKn+S4lOW3suiQveebmCDihpIg5LiK5oqlIGNvY29zX2ltcG9ydO+8iGZpcmUtYW5kLWZvcmdldO+8jOS4jSBhd2FpdOOAgeWksei0pemdmem7mO+8ieOAglxuICAgICAgICAgICAgdHJhY2tJbXBvcnQoeyBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gaW1wb3J0U3RhcnRNcyB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSBidWlsZFRyZWUg5pyq5oiQ5Yqf77yM6Lez6L+H6Ieq5Yqo5L+d5a2Y77yM6YG/5YWN6JC955uY5Y2K5oiq5Zy65pmv44CCJywgcmVzdWx0KTtcbiAgICAgICAgICAgIC8vIOWfi+eCue+8muW7uuagkei/lOWbnuWksei0pe+8iOacquaKm+W8guW4uO+8ieKGkiDkuIrmiqUgY29jb3NfaW1wb3J0X2ZhaWxlZO+8jOWQpuWImeaIkOWKn+eOh+awuOi/nOeul+S4jeWHuuWIhuavjeOAglxuICAgICAgICAgICAgdHJhY2tJbXBvcnRGYWlsZWQoJ2J1aWxkVHJlZScsIChyZXN1bHQgJiYgKHJlc3VsdC5lcnJvciB8fCByZXN1bHQubWVzc2FnZSkpIHx8ICdidWlsZFRyZWUgcmV0dXJuZWQgc3VjY2Vzcz1mYWxzZScsIHtcbiAgICAgICAgICAgICAgICBkdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gaW1wb3J0U3RhcnRNcyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8g57y65aSx5a2X5L2T5Y+q5omTIGNvbnNvbGUud2Fybu+8iOS4jeWGmeS7u+S9leaWh+S7tuKAlOKAlOWGmeaWh+S7tuS8muinpuWPkeW3peeoi+WIt+aWsOOAgeaJk+aWreWImuW7uuWlveeahOWcuuaZr+a4suafk++8ieOAglxuICAgICAgICB0ZXh0U3R5bGVUcmFja2VyLnJlcG9ydCgpO1xuICAgICAgICB0ZXh0U3R5bGVUZW1wbGF0ZVRyYWNrZXIucmVwb3J0KHRleHRTdHlsZUxpYik7XG4gICAgICAgIHJlcG9ydEZvbnREZW1hbmQoZm9udFRyYWNrZXIpO1xuXG4gICAgICAgIC8vIOWvvOWFpeWujOaIkOW8ueeql++8iOeUqOaIt+ivieaxgu+8ie+8muaxh+aAu+WbvueJh+WKoOi9veaDheWGte+8jOS7jee8uuWbvueahOaPkOekuuaJi+WKqOihpeOAglxuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdWNjZXNzICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgYXdhaXQgc2hvd0ltcG9ydERvbmVEaWFsb2cocmVzdWx0LCBwbGFjZWhvbGRlclJlcG9ydCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAvLyDln4vngrnvvJrlr7zlhaXmipvlvILluLgg4oaSIOS4iuaKpSBjb2Nvc19pbXBvcnRfZmFpbGVk77yIc3RlcCDmjIflh7rljaHlnKjlk6rkuIDmraXvvIxtZXNzYWdlIOW3suiEseaVjyvmiKrmlq3vvInjgIJcbiAgICAgICAgLy8g5LiN5ZCe5byC5bi477ya5LuNIHJldGhyb3cg57uZ5LiK5bGC5Y6f5pyJ55qEIGNvbnNvbGUuZXJyb3Iv5by556qX6YC76L6R77yM6KGM5Li65LiO5pS55Yqo5YmN5LiA6Ie044CCXG4gICAgICAgIC8vIHRyYWNrSW1wb3J0RmFpbGVkIOWGhemDqOaMiSBlcnJvciDlr7nosaHljrvph43vvIzkuIrlsYIgY2F0Y2gg5YaN5oql5ZCM5LiA5LiqIGVyciDkuI3kvJrph43lpI3orqHmlbDjgIJcbiAgICAgICAgdHJhY2tJbXBvcnRGYWlsZWQoc3RlcCwgZXJyLCB7IGR1cmF0aW9uTXM6IERhdGUubm93KCkgLSBpbXBvcnRTdGFydE1zIH0pO1xuICAgICAgICB0aHJvdyBlcnI7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgZW5kQXNzZXREYlNlc3Npb24oYXNzZXREYlNlc3Npb24pO1xuICAgICAgICBjb25zdCBlbGFwc2VkU2VjID0gKChEYXRlLm5vdygpIC0gaW1wb3J0U3RhcnRNcykgLyAxMDAwKS50b0ZpeGVkKDEpO1xuICAgICAgICBjb25zdCBvayA9IHJlc3VsdCAmJiByZXN1bHQuc3VjY2VzcyAhPT0gZmFsc2U7XG4gICAgICAgIGNvbnNvbGUubG9nKGAlYz09PT09PT09PT0g5a+85YWl57uT5p2fJHtvayA/ICcnIDogJ++8iOacquaIkOWKn++8iSd944CC6ICX5pe2ICR7ZWxhcHNlZFNlY30gcyA9PT09PT09PT09YCwgYGNvbG9yOiR7b2sgPyAnIzBhMCcgOiAnI2M2MjgyOCd9O2ZvbnQtd2VpZ2h0OmJvbGRgKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVQcmVwYXJlZFBsYWNlaG9sZGVycyhcbiAgICByZXN1bHQ6IGFueSxcbiAgICBwZW5kaW5nU3ByaXRlRnJhbWVzOiB7IFtpbWdSZWY6IHN0cmluZ106IFBlbmRpbmdTcHJpdGVGcmFtZSB9LFxuKTogUHJvbWlzZTx7IHRvdGFsOiBudW1iZXI7IHJlcGxhY2VkOiBudW1iZXI7IHN0aWxsTWlzc2luZzogbnVtYmVyIH0gfCBudWxsPiB7XG4gICAgY29uc3QgcGxhY2Vob2xkZXJzOiBhbnlbXSA9IChyZXN1bHQgJiYgcmVzdWx0LmRhdGEgJiYgcmVzdWx0LmRhdGEudW5yZXNvbHZlZFBsYWNlaG9sZGVycykgfHwgW107XG4gICAgaWYgKHBsYWNlaG9sZGVycy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuICAgIHJldHVybiByZXNvbHZlQW5kUmVwbGFjZVBsYWNlaG9sZGVycyhwbGFjZWhvbGRlcnMsIHBlbmRpbmdTcHJpdGVGcmFtZXMpO1xufVxuXG4vKipcbiAqIEB6aCDlkI7lj7Dova7or6LjgIzlt7LokL3nm5jkvYYgbWV0YS/lrZDotYTmupDmnKrlsLHnu6rjgI3nmoTlm77nm7TliLAgU3ByaXRlRnJhbWUg5a6M5pW05pS25pWb77yMXG4gKiAgICAg5YaN5LiA5qyh5oCn5pu/5o2i5ZOB57qi5Y2g5L2N5Li655yf5Zu+44CC5ZCM5LiA6LWE5rqQ55qE5aSa5Liq5Y2g5L2N5q+P6L2u5Y+q6Kej5p6Q5LiA5qyh44CCXG4gKiDlsLHnu6rnmoTmibnph4/kuqQgc2NlbmUucmVwbGFjZUltYWdlUGxhY2Vob2xkZXJzIOabv+aNou+8m+i2heaXtuS7jeacquWwsee7queahOaegeWwkeaVsOS/neeVmeWTgee6ou+8iOS4jeaKpemUme+8ieOAglxuICog6L+U5ZueIHsgdG90YWwsIHJlcGxhY2VkLCBzdGlsbE1pc3NpbmcgfSDkvpvlrozmiJDlvLnnqpfmsYfmgLvjgIJcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc29sdmVBbmRSZXBsYWNlUGxhY2Vob2xkZXJzKFxuICAgIHBsYWNlaG9sZGVyczogYW55W10sXG4gICAgcGVuZGluZ0J5SW1nUmVmOiB7IFtpbWdSZWY6IHN0cmluZ106IFBlbmRpbmdTcHJpdGVGcmFtZSB9ID0ge30sXG4pOiBQcm9taXNlPHsgdG90YWw6IG51bWJlcjsgcmVwbGFjZWQ6IG51bWJlcjsgc3RpbGxNaXNzaW5nOiBudW1iZXIgfT4ge1xuICAgIGNvbnN0IHRvdGFsID0gcGxhY2Vob2xkZXJzLmxlbmd0aDtcbiAgICBjb25zdCBNQVhfVFJJRVMgPSA1MDsgICAgICAvLyA1MCDDlyAzMDBtcyDiiYggMTVzIOaAu+mihOeul1xuICAgIGNvbnN0IElOVEVSVkFMX01TID0gMzAwO1xuICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXJdICR7dG90YWx9IOW8oOWbvuW+heWwsee7quabv+aNou+8jOW8gOWni+WQjuWPsOi9ruivouKApmApO1xuXG4gICAgY29uc3QgcGVuZGluZ0J5UGxhY2Vob2xkZXI6IHsgW3BsYWNlaG9sZGVySWQ6IHN0cmluZ106IFBlbmRpbmdTcHJpdGVGcmFtZSB9ID0ge307XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBsYWNlaG9sZGVycy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgY29uc3QgcGggPSBwbGFjZWhvbGRlcnNbaW5kZXhdO1xuICAgICAgICBjb25zdCBpbWdSZWYgPSBTdHJpbmcocGggJiYgcGguaW1nUmVmIHx8ICcnKTtcbiAgICAgICAgY29uc3QgZGJVcmwgPSBTdHJpbmcocGggJiYgcGguZGJVcmwgfHwgJycpO1xuICAgICAgICBpZiAoIWRiVXJsKSBjb250aW51ZTtcbiAgICAgICAgcGVuZGluZ0J5UGxhY2Vob2xkZXJbU3RyaW5nKGluZGV4KV0gPSBwZW5kaW5nQnlJbWdSZWZbaW1nUmVmXSB8fCBjcmVhdGVQZW5kaW5nRmlnbWFTcHJpdGVGcmFtZShcbiAgICAgICAgICAgIGRiVXJsLFxuICAgICAgICAgICAgcGggJiYgcGguc2xpY2U5Qm9yZGVyIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgcmVhZGluZXNzID0gT2JqZWN0LmtleXMocGVuZGluZ0J5UGxhY2Vob2xkZXIpLmxlbmd0aCA+IDBcbiAgICAgICAgPyBhd2FpdCByZXNvbHZlU3ByaXRlRnJhbWVzQmVmb3JlQnVpbGQoXG4gICAgICAgICAgICBwZW5kaW5nQnlQbGFjZWhvbGRlcixcbiAgICAgICAgICAgIE1BWF9UUklFUyxcbiAgICAgICAgICAgIElOVEVSVkFMX01TLFxuICAgICAgICApXG4gICAgICAgIDogeyByZXNvbHZlZDoge30sIHVucmVzb2x2ZWQ6IHt9IH07XG5cbiAgICBjb25zdCByZXNvbHZlZEl0ZW1zOiBhbnlbXSA9IFtdO1xuICAgIGNvbnN0IHVucmVzb2x2ZWRVcmxzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHBsYWNlaG9sZGVycy5sZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgY29uc3QgcGggPSBwbGFjZWhvbGRlcnNbaW5kZXhdO1xuICAgICAgICBjb25zdCB1dWlkID0gU3RyaW5nKHBoICYmIHBoLnNwcml0ZUZyYW1lVXVpZCB8fCByZWFkaW5lc3MucmVzb2x2ZWRbU3RyaW5nKGluZGV4KV0gfHwgJycpO1xuICAgICAgICBpZiAodXVpZCkge1xuICAgICAgICAgICAgcmVzb2x2ZWRJdGVtcy5wdXNoKHtcbiAgICAgICAgICAgICAgICBub2RlVXVpZDogcGgubm9kZVV1aWQsXG4gICAgICAgICAgICAgICAgc3ByaXRlRnJhbWVVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgIHNsaWNlOUJvcmRlcjogcGguc2xpY2U5Qm9yZGVyLFxuICAgICAgICAgICAgICAgIGltYWdlRmlsbDogcGguaW1hZ2VGaWxsLFxuICAgICAgICAgICAgICAgIG92ZXJsYXlUaW50OiBwaC5vdmVybGF5VGludCxcbiAgICAgICAgICAgICAgICB3aWR0aDogcGgud2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBwaC5oZWlnaHQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGRiVXJsID0gU3RyaW5nKHBoICYmIHBoLmRiVXJsIHx8ICcnKTtcbiAgICAgICAgICAgIGlmIChkYlVybCkgdW5yZXNvbHZlZFVybHMuYWRkKGRiVXJsKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAodW5yZXNvbHZlZFVybHMuc2l6ZSA+IDApIHtcbiAgICAgICAgY29uc3Qgc2FtcGxlID0gQXJyYXkuZnJvbSh1bnJlc29sdmVkVXJscykuc2xpY2UoMCwgNSkuam9pbignLCAnKTtcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0gJHt1bnJlc29sdmVkVXJscy5zaXplfSDlvKDotYTmupDlp4vnu4jmnKrlsLHnu6rvvIznm7jlhbPoioLngrnkv53nlZnlk4HnuqLljaDkvY1gICtcbiAgICAgICAgICAgIGAke3NhbXBsZSA/IGDvvJoke3NhbXBsZX1gIDogJyd9YFxuICAgICAgICApO1xuICAgIH1cblxuICAgIGxldCByZXBsYWNlZCA9IDA7XG4gICAgaWYgKHJlc29sdmVkSXRlbXMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCByZXAgPSBhd2FpdCBjYWxsU2NlbmUoJ3JlcGxhY2VJbWFnZVBsYWNlaG9sZGVycycsIHsgaXRlbXM6IHJlc29sdmVkSXRlbXMgfSk7XG4gICAgICAgIHJlcGxhY2VkID0gKHJlcCAmJiByZXAuZGF0YSAmJiByZXAuZGF0YS5yZXBsYWNlZCkgfHwgMDtcbiAgICB9XG4gICAgY29uc3Qgc3RpbGxNaXNzaW5nID0gdG90YWwgLSByZXBsYWNlZDtcbiAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSDljaDkvY3mm7/mjaLlrozmiJDvvJoke3JlcGxhY2VkfS8ke3RvdGFsfSDmm7/mjaLmiJDlip/vvIwke3N0aWxsTWlzc2luZ30g5LuN57y65Zu+77yI5L+d55WZ5ZOB57qi77yJ44CCYCk7XG4gICAgcmV0dXJuIHsgdG90YWwsIHJlcGxhY2VkLCBzdGlsbE1pc3NpbmcgfTtcbn1cblxuLyoqXG4gKiBAemgg5a+85YWl5a6M5oiQ5by556qX77ya5rGH5oC76IqC54K55pWw44CB5Zu+54mH5Yqg6L295LiO5LuN57y65Zu+5pWw6YeP77yM57y65Zu+5o+Q56S65omL5Yqo6KGl44CCXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHNob3dJbXBvcnREb25lRGlhbG9nKFxuICAgIHJlc3VsdDogYW55LFxuICAgIHBsYWNlaG9sZGVyUmVwb3J0OiB7IHRvdGFsOiBudW1iZXI7IHJlcGxhY2VkOiBudW1iZXI7IHN0aWxsTWlzc2luZzogbnVtYmVyIH0gfCBudWxsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBkID0gKHJlc3VsdCAmJiByZXN1bHQuZGF0YSkgfHwge307XG4gICAgICAgIGNvbnN0IHNwcml0ZXMgPSBOdW1iZXIoZC5zcHJpdGVzKSB8fCAwO1xuICAgICAgICBjb25zdCBzdGlsbE1pc3NpbmcgPSAocGxhY2Vob2xkZXJSZXBvcnQgPyBwbGFjZWhvbGRlclJlcG9ydC5zdGlsbE1pc3NpbmcgOiAwKSArIChOdW1iZXIoZC5taXNzaW5nSW1hZ2VzKSB8fCAwKTtcbiAgICAgICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGxpbmVzLnB1c2goYOW3suWKoOi9veWbvueJh++8miR7c3ByaXRlc30g5bygYCk7XG4gICAgICAgIGlmIChwbGFjZWhvbGRlclJlcG9ydCAmJiBwbGFjZWhvbGRlclJlcG9ydC5yZXBsYWNlZCA+IDApIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goYOW7tui/n+Wwsee7quWQjuihpem9kO+8miR7cGxhY2Vob2xkZXJSZXBvcnQucmVwbGFjZWR9IOW8oGApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGlsbE1pc3NpbmcgPiAwKSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKGDku43nvLrlm77vvJoke3N0aWxsTWlzc2luZ30g5byg77yI5bey5oyC5ZOB57qi5Y2g5L2N77yM6K+35Zyo57yW6L6R5Zmo5Lit5omL5Yqo6KGl5Zu+77yJYCk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgRWRpdG9yLkRpYWxvZy5pbmZvKCdGaWdtYSDlr7zlhaXlrozmiJAnLCB7XG4gICAgICAgICAgICBkZXRhaWw6IGxpbmVzLmpvaW4oJ1xcbicpLFxuICAgICAgICAgICAgYnV0dG9uczogWyflpb3nmoQnXSxcbiAgICAgICAgICAgIGRlZmF1bHQ6IDAsXG4gICAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAvLyDlvLnnqpflpLHotKXkuI3lvbHlk43lr7zlhaXnu5PmnpzvvIzku4XorrDml6Xlv5dcbiAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOWvvOWFpeWujOaIkOW8ueeql+Wksei0pe+8iOW/veeVpe+8ie+8micsIGVycik7XG4gICAgfVxufVxuXG4vKipcbiAqIEBlbiBMb2cgbWlzc2luZy1mb250IGRlbWFuZCBhcyBjb25zb2xlIHdhcm5pbmdzIChubyBmaWxlLCBubyBkaWFsb2cpLlxuICogQHpoIOe8uuWkseWtl+S9k+WPquaJkyBjb25zb2xlLndhcm7vvIjlr7npvZAgVW5pdHnvvJrnuq/ml6Xlv5fvvIzkuI3lhpnmlofku7bjgIHkuI3lvLnnqpfvvInjgIJcbiAqICAgICDpk4HlvovvvJrnu53kuI3lhpnku7vkvZXmlofku7bigJTigJTlhpnmlofku7bkvJrop6blj5EgQ29jb3Mg5bel56iL5Yi35paw44CB5omT5pat5Yia5bu65aW955qE5Zy65pmv5riy5p+T77yI6IOM5pmv5Zu+5pu+5Zug5q2k5raI5aSx77yJ44CCXG4gKi9cbmZ1bmN0aW9uIHJlcG9ydEZvbnREZW1hbmQodHJhY2tlcjogRm9udERlbWFuZFRyYWNrZXIpOiB2b2lkIHtcbiAgICBjb25zdCBkZWZhdWx0RmFsbGJhY2tDb3VudCA9IHRyYWNrZXIuZ2V0RGVmYXVsdEZhbGxiYWNrQ291bnQoKTtcbiAgICBpZiAoIXRyYWNrZXIuaGFzTWlzc2luZygpKSB7XG4gICAgICAgIGlmIChkZWZhdWx0RmFsbGJhY2tDb3VudCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOWtl+S9k+i1hOa6kOWRveS4rSAke3RyYWNrZXIuZ2V0TWF0Y2hlZENvdW50KCl9IOWkhO+8jGAgK1xuICAgICAgICAgICAgICAgIGAke2RlZmF1bHRGYWxsYmFja0NvdW50fSDlpITmjInop4TliJnkvb/nlKjpu5jorqTlrZfkvZPlm57pgIDjgIJgXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIHRyYWNrZXIuZ2V0RGVmYXVsdEZhbGxiYWNrKCkpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0gICDpu5jorqTlm57pgIDjgIwke2l0ZW0uZmFtaWx5fSR7aXRlbS53ZWlnaHQgPyAnICcgKyBpdGVtLndlaWdodCA6ICcnfeOAjcOXICR7aXRlbS5jb3VudH0g5aSEYFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSDlrZfkvZPlhajpg6jlkb3kuK3vvIgke3RyYWNrZXIuZ2V0TWF0Y2hlZENvdW50KCl9IOWkhOaWh+acrO+8ieOAgmApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbWlzc2luZyA9IHRyYWNrZXIuZ2V0TWlzc2luZygpO1xuICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0g5a2X5L2T6ZyA5rGC77yaJHt0cmFja2VyLmdldE1hdGNoZWRDb3VudCgpfSDlpITlt7Llkb3kuK3vvIxgICtcbiAgICAgICAgYCR7bWlzc2luZy5sZW5ndGh9IOenjeWtl+S9k+e8uuWkse+8iOW3suWbnumAgOm7mOiupOWtl+S9k++8iWAgK1xuICAgICAgICBgJHtkZWZhdWx0RmFsbGJhY2tDb3VudCA+IDAgPyBg77yM5Y+m5pyJICR7ZGVmYXVsdEZhbGxiYWNrQ291bnR9IOWkhOaMieinhOWImem7mOiupOWbnumAgGAgOiAnJ33jgIJgXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IG0gb2YgbWlzc2luZykge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSAgIOe8uuWkseWtl+S9k+OAjCR7bS5mYW1pbHl9JHttLndlaWdodCA/ICcgJyArIG0ud2VpZ2h0IDogJyd944CNw5cgJHttLmNvdW50fSDlpIRgICtcbiAgICAgICAgICAgIGDvvIgke20ucmVhc29uID8gYCR7bS5yZWFzb25977ybYCA6ICcnfeaUvuWFpSBhc3NldHMvZmlnbWEtZm9udHMvIOW5tuS7peWtl+S9k+WQjS/lrZfph43lkb3lkI3ljbPlj6/lkb3kuK3vvIlgXG4gICAgICAgICk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgaXRlbSBvZiB0cmFja2VyLmdldERlZmF1bHRGYWxsYmFjaygpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0gICDpu5jorqTlm57pgIDjgIwke2l0ZW0uZmFtaWx5fSR7aXRlbS53ZWlnaHQgPyAnICcgKyBpdGVtLndlaWdodCA6ICcnfeOAjcOXICR7aXRlbS5jb3VudH0g5aSEYFxuICAgICAgICApO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAZW4gSGFuZGxlIGEgSlNPTiBzdHJpbmcgcHVzaGVkIGZyb20gdGhlIEZpZ21hIHBsdWdpbiBvdmVyIEhUVFAuXG4gKiAgICAgTm9ybWFsIHB1c2hlcyBvcGVuIHRoZSB1bmlmaWVkIHdvcmtiZW5jaDsgZXhwbGljaXQgYXV0b21hdGlvbiBtYXkgc3RpbGwgYnlwYXNzIGl0LlxuICogQHpoIOWkhOeQhiBGaWdtYSDmj5Lku7bnu48gSFRUUCDmjqjmnaXnmoQgSlNPTuOAguaZrumAmuaOqOmAgeWFiOi/m+WFpee7n+S4gOW3peS9nOWPsO+8jOWPquacieaYvuW8j+iHquWKqOWMluWPguaVsOaJjeebtOaOpeW7uuagkeOAglxuICovXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVQdXNoZWRKc29uKGpzb246IHN0cmluZywgbmFtZTogc3RyaW5nLCBvcHRpb25zPzogUHVzaE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhgW2ZpZ21hLWltcG9ydGVyXSDmlLbliLDmjqjpgIHjgIwke25hbWUgfHwgJyjmnKrlkb3lkI0pJ33jgI3vvIwke2pzb24ubGVuZ3RofSDlrZfoioJgKTtcbiAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UoanNvbikgYXMgRmlnbWFFeHBvcnREYXRhO1xuXG4gICAgICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMuc2tpcENvbmZpcm0pIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOacrOWcsOiHquWKqOWMluaOqOmAge+8mui3s+i/h+ehruiupOmXuOmXqOOAgicpO1xuICAgICAgICAgICAgYXdhaXQgYnVpbGRGcm9tRGF0YShkYXRhKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID0gc3RhZ2VQdXNoZWRKc29uRm9yV29ya2JlbmNoKGpzb24sIG5hbWUgfHwgZGF0YS5uYW1lIHx8ICdwdXNoZWQnKTtcbiAgICAgICAgYXdhaXQgY3VycmVudEpzb25QYXRoQ29vcmRpbmF0b3Iud3JpdGUoZmlsZVBhdGgpO1xuICAgICAgICBjb25zdCB3b3JrYmVuY2hQYW5lbCA9ICdmaWdtYS1pbXBvcnRlci5zZXR0aW5ncyc7XG4gICAgICAgIGNvbnN0IHdvcmtiZW5jaE9wdGlvbnMgPSB7XG4gICAgICAgICAgICBqc29uUGF0aDogZmlsZVBhdGgsXG4gICAgICAgICAgICBzZWN0aW9uOiAncHJldmlldycsXG4gICAgICAgICAgICBzb3VyY2U6ICdmaWdtYS1wdXNoJyxcbiAgICAgICAgfTtcbiAgICAgICAgLy8gUGFuZWwub3BlbiBkb2VzIG5vdCByZS1kZWxpdmVyIGFyZ3VtZW50cyB3aGVuIHRoaXMgZG9ja2FibGUgcGFuZWwgaXMgYWxyZWFkeSBvcGVuLlxuICAgICAgICAvLyBPcGVuIGZpcnN0LCB0aGVuIHVzZSB0aGUgcGFuZWwgbWVzc2FnZSBhcyB0aGUgZXhwbGljaXQsIGF3YWl0YWJsZSBkZWxpdmVyeSBjb250cmFjdC5cbiAgICAgICAgYXdhaXQgRWRpdG9yLlBhbmVsLm9wZW4od29ya2JlbmNoUGFuZWwpO1xuICAgICAgICBpZiAoIWF3YWl0IEVkaXRvci5QYW5lbC5oYXMod29ya2JlbmNoUGFuZWwpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Z0b0Mg5a+85YWl5bel5L2c5Y+w5pyq6IO95omT5byAJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGVsaXZlcnk6IGFueSA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAnZmlnbWEtaW1wb3J0ZXInLFxuICAgICAgICAgICAgJ2FjY2VwdC1wdXNoZWQtanNvbicsXG4gICAgICAgICAgICB3b3JrYmVuY2hPcHRpb25zLFxuICAgICAgICApO1xuICAgICAgICBpZiAoIWRlbGl2ZXJ5IHx8IGRlbGl2ZXJ5LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoZGVsaXZlcnkgJiYgZGVsaXZlcnkuZXJyb3IgfHwgJ0Z0b0Mg5a+85YWl5bel5L2c5Y+w5pyq56Gu6K6k5o6o6YCBJyk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgRWRpdG9yLlBhbmVsLmZvY3VzKHdvcmtiZW5jaFBhbmVsKTtcbiAgICAgICAgY29uc3QgYWN0aXZhdGVkID0gYXdhaXQgYWN0aXZhdGVDb2Nvc0VkaXRvckFwcGxpY2F0aW9uKCk7XG4gICAgICAgIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnZGFyd2luJyAmJiAhYWN0aXZhdGVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0gSlNPTiDlt7LpgIHovr7lt6XkvZzlj7DvvIzkvYYgbWFjT1Mg5YmN5Y+w5r+A5rS75aSx6LSl44CCJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFhd2FpdCBFZGl0b3IuUGFuZWwuaGFzKHdvcmtiZW5jaFBhbmVsKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGdG9DIOWvvOWFpeW3peS9nOWPsOiBmueEpuWQjuaEj+WkluWFs+mXrScpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXJdIOaOqOmAgeW3sumAgei+vuW5tuiBmueEpuWvvOWFpeW3peS9nOWPsO+8jOetieW+hemihOiniOehruiupO+8miR7ZmlsZVBhdGh9YCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWdtYS1pbXBvcnRlcl0g5aSE55CG5o6o6YCBIEpTT04g5aSx6LSlOicsIGVycik7XG4gICAgICAgIC8vIOWfi+eCue+8muaOqOmAgeWvvOWFpeWksei0pe+8iOino+aekCBKU09OIOetieWksei0peS5n+eul++8ieOAgmJ1aWxkRnJvbURhdGEg5YaF6YOo5bey5oql6L+H55qE5Lya6KKr5Y676YeN44CCXG4gICAgICAgIHRyYWNrSW1wb3J0RmFpbGVkKCdoYW5kbGVQdXNoZWRKc29uJywgZXJyKTtcbiAgICB9XG59XG5cbi8qKlxuICogQGVuIFJlZ2lzdHJhdGlvbiBtZXRob2QgZm9yIHRoZSBtYWluIHByb2Nlc3Mgb2YgRXh0ZW5zaW9uLlxuICogQHpoIOS4uuaJqeWxleeahOS4u+i/m+eoi+eahOazqOWGjOaWueazleOAglxuICovXG5leHBvcnQgY29uc3QgbWV0aG9kczogeyBba2V5OiBzdHJpbmddOiAoLi4uYXJnczogYW55W10pID0+IGFueSB9ID0ge1xuICAgIGFzeW5jIG9wZW5SZXBsYWNlUGFuZWxCZXRhKHByZXNldD86IHN0cmluZyB8IHsganNvblBhdGg/OiBzdHJpbmcgfSkge1xuICAgICAgICBjb25zdCBleGFjdFdvcmtzcGFjZVBhdGggPSAhIXByZXNldCAmJiB0eXBlb2YgcHJlc2V0ID09PSAnb2JqZWN0JztcbiAgICAgICAgY29uc3QgcmVxdWVzdGVkUGF0aCA9IG5vcm1hbGl6ZUN1cnJlbnRKc29uUGF0aChcbiAgICAgICAgICAgIHByZXNldCAmJiB0eXBlb2YgcHJlc2V0ID09PSAnb2JqZWN0JyA/IHByZXNldC5qc29uUGF0aCA6IHByZXNldCxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QganNvblBhdGggPSBleGFjdFdvcmtzcGFjZVBhdGhcbiAgICAgICAgICAgID8gcmVxdWVzdGVkUGF0aFxuICAgICAgICAgICAgOiByZXF1ZXN0ZWRQYXRoIHx8IGF3YWl0IHJlYWRDdXJyZW50SnNvblBhdGgoKTtcbiAgICAgICAgaWYgKGV4YWN0V29ya3NwYWNlUGF0aCB8fCByZXF1ZXN0ZWRQYXRoKSBhd2FpdCB3cml0ZUN1cnJlbnRKc29uUGF0aChqc29uUGF0aCk7XG4gICAgICAgIHJldHVybiBFZGl0b3IuUGFuZWwub3BlbignZmlnbWEtaW1wb3J0ZXIucmVwbGFjZScsIHsganNvblBhdGggfSk7XG4gICAgfSxcblxuICAgIG9wZW5TZXR0aW5nc1BhbmVsKG9wdGlvbnM/OiB7IGpzb25QYXRoPzogc3RyaW5nOyBzZWN0aW9uPzogc3RyaW5nOyBzb3VyY2U/OiBzdHJpbmcgfSkge1xuICAgICAgICByZXR1cm4gRWRpdG9yLlBhbmVsLm9wZW4oJ2ZpZ21hLWltcG9ydGVyLnNldHRpbmdzJywgb3B0aW9ucyB8fCB7fSk7XG4gICAgfSxcblxuICAgIGFzeW5jIGNsZWFyQ3VycmVudEpzb25QYXRoKGV4cGVjdGVkUGF0aD86IHN0cmluZykge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjdXJyZW50SnNvblBhdGhDb29yZGluYXRvci5jbGVhcklmQ3VycmVudChleHBlY3RlZFBhdGgpO1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiByZXN1bHQgfTtcbiAgICB9LFxuXG4gICAgYXN5bmMgc2V0Q3VycmVudEpzb25QYXRoKGZpbGVQYXRoPzogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRQYXRoID0gYXdhaXQgY3VycmVudEpzb25QYXRoQ29vcmRpbmF0b3Iud3JpdGUoZmlsZVBhdGgpO1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGN1cnJlbnRQYXRoIH0gfTtcbiAgICB9LFxuXG4gICAgLyoqIEB6aCDlhbzlrrnml6flhaXlj6PvvJrnu4Tku7bmmKDlsITnjrDlnKjmlLbov5vnu5/kuIDlt6XkvZzlj7DvvIzkuI3lho3miZPlvIDnrKzkuozlpZfnlKjmiLfmtYHnqIvjgIIgKi9cbiAgICBvcGVuQ29tcG9uZW50TWFwcGluZ1BhbmVsKCkge1xuICAgICAgICByZXR1cm4gRWRpdG9yLlBhbmVsLm9wZW4oJ2ZpZ21hLWltcG9ydGVyLnNldHRpbmdzJywgeyBzZWN0aW9uOiAnbWFwcGluZycgfSk7XG4gICAgfSxcblxuICAgIC8qKiBAemgg6Z2i5p2/77ya5p+l6K+i5o6o6YCB5pyN5Yqh6L+Q6KGM54q25oCBLOS+m+WKn+iDvemdouadv+aYvuekuuW8gOWFs+aAgeOAgiAqL1xuICAgIGdldFB1c2hTZXJ2ZXJTdGF0dXMoKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgcnVubmluZzogaXNQdXNoU2VydmVyUnVubmluZygpIH0gfTtcbiAgICB9LFxuXG4gICAgLyoqIEB6aCDpnaLmnb/vvJror7vpgJrnlKjotYTmupDnm67lvZXliJfooajvvIjluKbpu5jorqTlm57pgIDvvInjgIIgKi9cbiAgICBhc3luYyBnZXRDb21tb25SZXNvdXJjZURpcnMoKSB7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZGlyczogYXdhaXQgcmVhZENvbW1vblJlc291cmNlRGlycygpIH0gfTtcbiAgICB9LFxuXG4gICAgLyoqIEB6aCDpnaLmnb/vvJror7vlj5blnLrmma/nu4Tku7bouqvku73jgIHlt6XnqIvmmKDlsITjgIHmnIDov5Hlr7zlhaXouqvku73lkozlvZPliY0gUHJvamVjdCBQcmVmYWLjgIIgKi9cbiAgICBhc3luYyBnZXRDb21wb25lbnRNYXBwaW5ncygpIHtcbiAgICAgICAgY29uc3QgZG9jdW1lbnQgPSByZWFkQ29tcG9uZW50TWFwcGluZ0RvY3VtZW50KCk7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZUNvbXBvbmVudE1hcHBpbmdBc3NldHMoZG9jdW1lbnQpO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IGF3YWl0IGdldFNlbGVjdGVkUHJlZmFiQXNzZXRJbmZvKCk7XG4gICAgICAgIGNvbnN0IHNjZW5lU2VsZWN0aW9uID0gYXdhaXQgZ2V0U2VsZWN0ZWRTY2VuZUNvbXBvbmVudElkZW50aXR5KCk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgIGRiVXJsOiBDT01QT05FTlRfTUFQUElOR19EQl9VUkwsXG4gICAgICAgICAgICAgICAgZG9jdW1lbnQsXG4gICAgICAgICAgICAgICAgcmVzb2x2ZWQ6IHtcbiAgICAgICAgICAgICAgICAgICAgdmFsaWQ6IHJlc29sdmVkLnZhbGlkLFxuICAgICAgICAgICAgICAgICAgICBicm9rZW46IHJlc29sdmVkLmJyb2tlbixcbiAgICAgICAgICAgICAgICAgICAgZW50cmllczogcmVzb2x2ZWQuZW50cmllcyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHNjZW5lU2VsZWN0aW9uLFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudHM6IGxhc3RDb21wb25lbnRJZGVudGl0aWVzLFxuICAgICAgICAgICAgICAgIHNlbGVjdGVkUHJlZmFiOiBzZWxlY3RlZCAmJiBzZWxlY3RlZC51dWlkID8ge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBTdHJpbmcoc2VsZWN0ZWQudXVpZCksXG4gICAgICAgICAgICAgICAgICAgIGRiVXJsOiBhc3NldEluZm9Vcmwoc2VsZWN0ZWQpLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBTdHJpbmcoc2VsZWN0ZWQubmFtZSB8fCBzZWxlY3RlZC5kaXNwbGF5TmFtZSB8fCBzZWxlY3RlZC51dWlkKSxcbiAgICAgICAgICAgICAgICB9IDogbnVsbCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIC8qKiBAemgg6Z2i5p2/77ya5Y+q6K+75omr5o+PIEZpZ21hIEpTT04g55qEIGNvbXBvbmVudEtleS/lj5jkvZPvvIzkuI3okL3lm77niYfjgIHkuI3lu7rmoJHjgIHkuI3kv53lrZjlnLrmma/jgIIgKi9cbiAgICBhc3luYyBzY2FuQ29tcG9uZW50SWRlbnRpdGllc0Zyb21Kc29uKHByZXNldFBhdGg/OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBmaWxlUGF0aCA9IFN0cmluZyhwcmVzZXRQYXRoIHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGlja2VkID0gYXdhaXQgRWRpdG9yLkRpYWxvZy5zZWxlY3Qoe1xuICAgICAgICAgICAgICAgICAgICB0aXRsZTogJ+mAieaLqSBGaWdtYSBKU09OIOaJq+aPj+e7hOS7tuaYoOWwhCcsXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6ICdmaWxlJyxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyczogW3sgbmFtZTogJ0pTT04nLCBleHRlbnNpb25zOiBbJ2pzb24nXSB9XSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpZiAocGlja2VkLmNhbmNlbGVkIHx8ICFwaWNrZWQuZmlsZVBhdGhzIHx8IHBpY2tlZC5maWxlUGF0aHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBjYW5jZWxlZDogdHJ1ZSB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IHBpY2tlZC5maWxlUGF0aHNbMF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByYXcgPSBKU09OLnBhcnNlKHJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0ZjgnKSkgYXMgRmlnbWFFeHBvcnREYXRhO1xuICAgICAgICAgICAgaWYgKCFyYXcgfHwgIXJhdy5yb290KSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdJbnZhbGlkIEZpZ21hIEpTT046IG1pc3Npbmcgcm9vdCcgfTtcbiAgICAgICAgICAgIGxhc3RDb21wb25lbnRJZGVudGl0aWVzID0gY29sbGVjdENvbXBvbmVudElkZW50aXRpZXMocmF3LnJvb3QpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYFtmaWdtYS1pbXBvcnRlcl0g57uE5Lu25pig5bCE5omr5o+P5a6M5oiQ77yaJHtsYXN0Q29tcG9uZW50SWRlbnRpdGllcy5sZW5ndGh9IOS4que7hOS7tui6q+S7ve+8iOacquWvvOWFpeWcuuaZr++8ieOAgmApO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IFN0cmluZyhyYXcubmFtZSB8fCByYXcucm9vdC5uYW1lIHx8ICcnKSxcbiAgICAgICAgICAgICAgICAgICAgY291bnQ6IGxhc3RDb21wb25lbnRJZGVudGl0aWVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50czogbGFzdENvbXBvbmVudElkZW50aXRpZXMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbZmlnbWEtaW1wb3J0ZXJdIHNjYW5Db21wb25lbnRJZGVudGl0aWVzRnJvbUpzb24gZmFpbGVkOicsIGVycik7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyciAmJiBlcnIubWVzc2FnZSB8fCBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKiBAemgg6Z2i5p2/77ya57uR5a6a5pi+5byP5oyH5a6a55qEIFByZWZhYu+8m+acquaMh+WumuaXtuWFvOWuuSBQcm9qZWN0IOmdouadv+W9k+WJjemAieS4reeahCBQcmVmYWLjgIIgKi9cbiAgICBhc3luYyB1cHNlcnRDb21wb25lbnRNYXBwaW5nKHBheWxvYWQ/OiBQYXJ0aWFsPENvbXBvbmVudE1hcHBpbmdFbnRyeT4pIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50S2V5ID0gU3RyaW5nKHBheWxvYWQgJiYgcGF5bG9hZC5jb21wb25lbnRLZXkgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgaWYgKCFjb21wb25lbnRLZXkpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ01pc3NpbmcgY29tcG9uZW50S2V5JyB9O1xuICAgICAgICBjb25zdCByZXNvbHZlZFByZWZhYiA9IGF3YWl0IHJlc29sdmVDb21wb25lbnRNYXBwaW5nUHJlZmFiQXNzZXRJbmZvKHBheWxvYWQpO1xuICAgICAgICBjb25zdCBzZWxlY3RlZCA9IHJlc29sdmVkUHJlZmFiLmluZm87XG4gICAgICAgIGlmICghc2VsZWN0ZWQgfHwgIXNlbGVjdGVkLnV1aWQpIHtcbiAgICAgICAgICAgIGlmIChyZXNvbHZlZFByZWZhYi5zb3VyY2UgPT09ICdleHBsaWNpdCcpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICfmjIflrprnmoTotYTmupDkuI3mmK/mnInmlYjnmoQgUHJlZmFi77yM6K+36YeN5paw6YCJ5oupJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAn6K+35YWI5ZyoIFByb2plY3Qg6Z2i5p2/6YCJ5Lit5LiA5LiqIFByZWZhYiDotYTmupAnIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRQcmVmYWIgPSB7XG4gICAgICAgICAgICB1dWlkOiBTdHJpbmcoc2VsZWN0ZWQudXVpZCksXG4gICAgICAgICAgICBkYlVybDogYXNzZXRJbmZvVXJsKHNlbGVjdGVkKSxcbiAgICAgICAgICAgIG5hbWU6IFN0cmluZyhzZWxlY3RlZC5uYW1lIHx8IHNlbGVjdGVkLmRpc3BsYXlOYW1lIHx8IHNlbGVjdGVkLnV1aWQpLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCBzYXZlZCA9IGF3YWl0IG11dGF0ZUNvbXBvbmVudE1hcHBpbmdEb2N1bWVudCgoZG9jdW1lbnQpID0+XG4gICAgICAgICAgICB1cHNlcnRNYXBwaW5nRW50cnkoZG9jdW1lbnQsIHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnRLZXksXG4gICAgICAgICAgICAgICAgY29tcG9uZW50TmFtZTogU3RyaW5nKHBheWxvYWQgJiYgcGF5bG9hZC5jb21wb25lbnROYW1lIHx8ICcnKS50cmltKCksXG4gICAgICAgICAgICAgICAgcHJlZmFiVXVpZDogc2VsZWN0ZWRQcmVmYWIudXVpZCxcbiAgICAgICAgICAgICAgICBwcmVmYWJVcmw6IHNlbGVjdGVkUHJlZmFiLmRiVXJsLFxuICAgICAgICAgICAgICAgIHZhcmlhbnRGaWx0ZXI6IFN0cmluZyhwYXlsb2FkICYmIHBheWxvYWQudmFyaWFudEZpbHRlciB8fCAnJykudHJpbSgpLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgICAgY29uc29sZS5sb2coJ1tmaWdtYS1pbXBvcnRlcl0g57uE5Lu25pig5bCE5bey57uR5a6a77yaJywge1xuICAgICAgICAgICAgY29tcG9uZW50S2V5LFxuICAgICAgICAgICAgdmFyaWFudEZpbHRlcjogU3RyaW5nKHBheWxvYWQgJiYgcGF5bG9hZC52YXJpYW50RmlsdGVyIHx8ICcnKS50cmltKCksXG4gICAgICAgICAgICBwcmVmYWI6IHNlbGVjdGVkUHJlZmFiLmRiVXJsLFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQ6IHNhdmVkLFxuICAgICAgICAgICAgICAgIGRiVXJsOiBDT01QT05FTlRfTUFQUElOR19EQl9VUkwsXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWRQcmVmYWIsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH0sXG5cbiAgICAvKiogQHpoIOmdouadv++8muS7heenu+mZpOaMh+WumiAoY29tcG9uZW50S2V5LCB2YXJpYW50RmlsdGVyKSDmnaHnm67jgIIgKi9cbiAgICBhc3luYyByZW1vdmVDb21wb25lbnRNYXBwaW5nKGNvbXBvbmVudEtleT86IHN0cmluZywgdmFyaWFudEZpbHRlcj86IHN0cmluZykge1xuICAgICAgICBjb25zdCBrZXkgPSBTdHJpbmcoY29tcG9uZW50S2V5IHx8ICcnKS50cmltKCk7XG4gICAgICAgIGlmICgha2V5KSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdNaXNzaW5nIGNvbXBvbmVudEtleScgfTtcbiAgICAgICAgY29uc3Qgc2F2ZWQgPSBhd2FpdCBtdXRhdGVDb21wb25lbnRNYXBwaW5nRG9jdW1lbnQoKGRvY3VtZW50KSA9PlxuICAgICAgICAgICAgcmVtb3ZlTWFwcGluZ0VudHJ5KGRvY3VtZW50LCBrZXksIFN0cmluZyh2YXJpYW50RmlsdGVyIHx8ICcnKS50cmltKCkpXG4gICAgICAgICk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOe7hOS7tuaYoOWwhOW3suino+e7ke+8micsIHsgY29tcG9uZW50S2V5OiBrZXksIHZhcmlhbnRGaWx0ZXI6IFN0cmluZyh2YXJpYW50RmlsdGVyIHx8ICcnKS50cmltKCkgfSk7XG4gICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZG9jdW1lbnQ6IHNhdmVkLCBkYlVybDogQ09NUE9ORU5UX01BUFBJTkdfREJfVVJMIH0gfTtcbiAgICB9LFxuXG4gICAgLyoqIEB6aCDpnaLmnb/vvJrlhpnpgJrnlKjotYTmupDnm67lvZXliJfooajvvIjlj6rkv53nlZkgZGI6Ly8g5LiU5Y676YeN77yJ44CCICovXG4gICAgYXN5bmMgc2V0Q29tbW9uUmVzb3VyY2VEaXJzKGRpcnM6IHN0cmluZ1tdKSB7XG4gICAgICAgIGNvbnN0IGNsZWFuOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBmb3IgKGNvbnN0IGQgb2YgQXJyYXkuaXNBcnJheShkaXJzKSA/IGRpcnMgOiBbXSkge1xuICAgICAgICAgICAgY29uc3QgdXJsID0gU3RyaW5nKGQgfHwgJycpLnRyaW0oKS5yZXBsYWNlKC9cXC8rJC8sICcnKTtcbiAgICAgICAgICAgIGlmICh1cmwuc3RhcnRzV2l0aCgnZGI6Ly8nKSAmJiBjbGVhbi5pbmRleE9mKHVybCkgPT09IC0xKSBjbGVhbi5wdXNoKHVybCk7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgRWRpdG9yLlByb2ZpbGUuc2V0Q29uZmlnKCdmaWdtYS1pbXBvcnRlcicsIENPTU1PTl9ESVJTX0tFWSwgY2xlYW4pO1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGRpcnM6IGNsZWFuIH0gfTtcbiAgICB9LFxuXG4gICAgLyoqIEB6aCDpnaLmnb/vvJrlvLnnm67lvZXpgInmi6nmoYbvvIzmiorlt6XnqIvlhoXnm67lvZXovawgZGI6Ly8g6L+95Yqg6L+b6YWN572u77yM6L+U5Zue5paw5YiX6KGo44CCICovXG4gICAgYXN5bmMgYWRkQ29tbW9uUmVzb3VyY2VEaXIoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwaWNrZWQgPSBhd2FpdCBFZGl0b3IuRGlhbG9nLnNlbGVjdCh7XG4gICAgICAgICAgICAgICAgdGl0bGU6ICfpgInmi6npgJrnlKjotYTmupDnm67lvZXvvIjlt6XnqIvlhoXvvIknLFxuICAgICAgICAgICAgICAgIHR5cGU6ICdkaXJlY3RvcnknLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAocGlja2VkLmNhbmNlbGVkIHx8ICFwaWNrZWQuZmlsZVBhdGhzIHx8IHBpY2tlZC5maWxlUGF0aHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGNhbmNlbGVkOiB0cnVlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhYnMgPSBwaWNrZWQuZmlsZVBhdGhzWzBdO1xuICAgICAgICAgICAgbGV0IHVybCA9ICcnO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB1cmwgPSBhd2FpdCByZXF1ZXN0QXNzZXREYjxzdHJpbmc+KCdxdWVyeS11cmwnLCBhYnMsIFthYnNdKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyB1cmwgPSAnJzsgfVxuICAgICAgICAgICAgaWYgKCF1cmwpIHtcbiAgICAgICAgICAgICAgICAvLyDlhZzlupXvvJrnu53lr7not6/lvoTnm7jlr7nlt6XnqIsgYXNzZXRzIOWJjee8gOebuOWHj++8iOS4jiBkYlVybFRvQXNzZXRQYXRoIOWPjeWQke+8ieOAglxuICAgICAgICAgICAgICAgIGNvbnN0IHByb2plY3RQYXRoID0gKEVkaXRvciBhcyBhbnkpLlByb2plY3QgJiYgKEVkaXRvciBhcyBhbnkpLlByb2plY3QucGF0aDtcbiAgICAgICAgICAgICAgICBjb25zdCBub3JtID0gU3RyaW5nKGFicykucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0c1Jvb3QgPSBwcm9qZWN0UGF0aCA/IGAke1N0cmluZyhwcm9qZWN0UGF0aCkucmVwbGFjZSgvXFxcXC9nLCAnLycpfS9hc3NldHNgIDogJyc7XG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0c1Jvb3QgJiYgbm9ybS5zdGFydHNXaXRoKGFzc2V0c1Jvb3QpKSB7XG4gICAgICAgICAgICAgICAgICAgIHVybCA9ICdkYjovL2Fzc2V0cycgKyBub3JtLnNsaWNlKGFzc2V0c1Jvb3QubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1cmwgPSBTdHJpbmcodXJsIHx8ICcnKS50cmltKCkucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG4gICAgICAgICAgICBpZiAoIXVybC5zdGFydHNXaXRoKCdkYjovL2Fzc2V0cycpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAn5omA6YCJ55uu5b2V5LiN5Zyo5bel56iLIGFzc2V0cyDlhoXvvIzml6Dms5XkvZzkuLrotYTmupDnm67lvZXjgIInIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXdhaXQgcmVhZENvbW1vblJlc291cmNlRGlycygpO1xuICAgICAgICAgICAgaWYgKGN1cnJlbnQuaW5kZXhPZih1cmwpID09PSAtMSkgY3VycmVudC5wdXNoKHVybCk7XG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuUHJvZmlsZS5zZXRDb25maWcoJ2ZpZ21hLWltcG9ydGVyJywgQ09NTU9OX0RJUlNfS0VZLCBjdXJyZW50KTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgZGlyczogY3VycmVudCwgYWRkZWQ6IHVybCB9IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVyciAmJiBlcnIubWVzc2FnZSB8fCBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBNZW51IGhhbmRsZXI6IGFzayB0aGUgc2NlbmUgc2NyaXB0IHRvIGNyZWF0ZSBvbmUgZW1wdHkgbm9kZS5cbiAgICAgKiBAemgg6I+c5Y2V5aSE55CG5Zmo77ya6K+35Zy65pmv6ISa5pys5bu65LiA5Liq56m66IqC54K544CCXG4gICAgICovXG4gICAgYXN5bmMgY3JlYXRlVGVzdE5vZGUoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjYWxsU2NlbmUoJ2NyZWF0ZUVtcHR5Tm9kZScsICdGaWdtYVRlc3ROb2RlJyk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW2ZpZ21hLWltcG9ydGVyXSBjcmVhdGVFbXB0eU5vZGUgcmVzdWx0OicsIHJlc3VsdCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW2ZpZ21hLWltcG9ydGVyXSBjcmVhdGVUZXN0Tm9kZSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAZW4gUGljayBhIEZpZ21hIGV4cG9ydCBKU09OLCByZWFkIGl0LCBhbmQgYnVpbGQgdGhlIG5vZGUgdHJlZSAoc3RhZ2UgMTogcG9zaXRpb24vc2l6ZSBvbmx5KS5cbiAgICAgKiBAemgg6YCJ5LiA5LiqIEZpZ21hIOWvvOWHuiBKU09O77yM6K+76L+b5p2l77yM5bu66IqC54K55qCR77yI6Zi25q61IDHvvJrlj6rmkYbkvY3nva7lkozlsLrlr7jvvInjgIJcbiAgICAgKi9cbiAgICBhc3luYyBpbXBvcnRGcm9tSnNvbihwcmVzZXRQYXRoPzogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgZmlsZVBhdGggPSBwcmVzZXRQYXRoO1xuICAgICAgICAgICAgaWYgKCFmaWxlUGF0aCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBpY2tlZCA9IGF3YWl0IEVkaXRvci5EaWFsb2cuc2VsZWN0KHtcbiAgICAgICAgICAgICAgICAgICAgdGl0bGU6ICfpgInmi6kgRmlnbWEg5a+85Ye655qEIEpTT04nLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZmlsZScsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcnM6IFt7IG5hbWU6ICdKU09OJywgZXh0ZW5zaW9uczogWydqc29uJ10gfV0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHBpY2tlZC5jYW5jZWxlZCB8fCBwaWNrZWQuZmlsZVBhdGhzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gcGlja2VkLmZpbGVQYXRoc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBmaWxlIHBhdGgnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCByYXcgPSByZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UocmF3KSBhcyBGaWdtYUV4cG9ydERhdGE7XG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgYnVpbGRGcm9tRGF0YShkYXRhKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbZmlnbWEtaW1wb3J0ZXJdIGltcG9ydEZyb21Kc29uIGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgLy8g5Z+L54K577ya6I+c5Y2V5a+85YWl5aSx6LSl77yI6K+75paH5Lu2L+ino+aekCBKU09OIOetiSBidWlsZEZyb21EYXRhIOS5i+WJjeeahOWksei0peS5n+eul+WvvOWFpeWksei0pe+8ieOAglxuICAgICAgICAgICAgLy8gYnVpbGRGcm9tRGF0YSDlhoXpg6jlt7LkuIrmiqXov4fnmoQgZXJyIOS8muiiq+WOu+mHje+8jOS4jeS8mumHjeWkjeiuoeaVsOOAglxuICAgICAgICAgICAgdHJhY2tJbXBvcnRGYWlsZWQoJ2ltcG9ydEZyb21Kc29uJywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAemggYmV0Ye+8muS7jiBGaWdtYSBKU09OIOeUn+aIkCBDb2NvcyDkvqcgVGV4dFN0eWxlcyDmoLflvI/lupPjgIJcbiAgICAgKiAgICAg5a+56b2QIFVuaXR5IOWtl+S9k+WvvOWFpeWZqO+8muS8mOWFiOS9v+eUqCBUZXh0U3R5bGVzL+aWh+Wtl+agt+W8jyDmoLnvvJvmib7kuI3liLDliJnku47mlbTmo7XnlYzpnaLmir3lj5bmiYDmnInmloflrZfoioLngrnjgIJcbiAgICAgKi9cbiAgICBhc3luYyBnZW5lcmF0ZVRleHRTdHlsZXNGcm9tSnNvbkJldGEocHJlc2V0UGF0aD86IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gcHJlc2V0UGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaWNrZWQgPSBhd2FpdCBFZGl0b3IuRGlhbG9nLnNlbGVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpdGxlOiAn6YCJ5oup55So5LqO55Sf5oiQIFRleHRTdHlsZXMg5qC35byP5bqT55qEIEZpZ21hIEpTT04nLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZmlsZScsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcnM6IFt7IG5hbWU6ICdKU09OJywgZXh0ZW5zaW9uczogWydqc29uJ10gfV0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHBpY2tlZC5jYW5jZWxlZCB8fCBwaWNrZWQuZmlsZVBhdGhzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdDYW5jZWxlZCcgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBwaWNrZWQuZmlsZVBhdGhzWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmaWxlUGF0aCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gZmlsZSBwYXRoJyB9O1xuXG4gICAgICAgICAgICBjb25zdCByYXcgPSByZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UocmF3KSBhcyBGaWdtYUV4cG9ydERhdGE7XG4gICAgICAgICAgICBjb25zdCBnZW5lcmF0ZWQgPSBnZW5lcmF0ZVRleHRTdHlsZUxpYnJhcnlGcm9tRGF0YShkYXRhKTtcbiAgICAgICAgICAgIGlmIChnZW5lcmF0ZWQuZW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g55Sf5oiQIFRleHRTdHlsZXMg5qC35byP5bqT5aSx6LSl77yaSlNPTiDkuK3msqHmnInlj6/nlKjmloflrZfoioLngrnjgIInKTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyB0ZXh0IHN0eWxlIGVudHJpZXMnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZUFzc2V0Rm9sZGVyKFRFWFRfU1RZTEVfTElCX0RJUik7XG4gICAgICAgICAgICAvLyDlr7npvZDnurLpoobvvJrkuIDkuKrlt6XnqIvkuIDlpZflrZfkvZPmoLflvI/lupPvvIzlm7rlrprlkI0gVGV4dFN0eWxlc++8iEpTT04g5LiO576O5pyv5omL5a2Y55qEIHByZWZhYiDlkIzlkI3miY3og73phY3lr7nvvInjgIJcbiAgICAgICAgICAgIGNvbnN0IFRFWFRfU1RZTEVfTElCX05BTUUgPSAnVGV4dFN0eWxlcyc7XG4gICAgICAgICAgICBjb25zdCBkYlVybCA9IGAke1RFWFRfU1RZTEVfTElCX0RJUn0vJHtURVhUX1NUWUxFX0xJQl9OQU1FfS5qc29uYDtcbiAgICAgICAgICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICAgICAgICAgICAgdmVyc2lvbjogMSxcbiAgICAgICAgICAgICAgICBnZW5lcmF0b3I6ICdmaWdtYS1pbXBvcnRlcicsXG4gICAgICAgICAgICAgICAgYnVpbGRWZXJzaW9uOiBCVUlMRF9WRVJTSU9OLFxuICAgICAgICAgICAgICAgIHNvdXJjZU5hbWU6IGdlbmVyYXRlZC5zb3VyY2VOYW1lLFxuICAgICAgICAgICAgICAgIHN0eWxlUm9vdE5hbWU6IGdlbmVyYXRlZC5zdHlsZVJvb3ROYW1lLFxuICAgICAgICAgICAgICAgIHN0eWxlUm9vdFBhdGg6IGdlbmVyYXRlZC5zdHlsZVJvb3RQYXRoLFxuICAgICAgICAgICAgICAgIHN0YXRzOiBnZW5lcmF0ZWQuc3RhdHMsXG4gICAgICAgICAgICAgICAgZW50cmllczogZ2VuZXJhdGVkLmVudHJpZXMsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgaW5mbyA9IGF3YWl0IHdyaXRlVGV4dEFzc2V0VmlhSW1wb3J0KGRiVXJsLCBKU09OLnN0cmluZ2lmeShwYXlsb2FkLCBudWxsLCA0KSk7XG4gICAgICAgICAgICBpZiAoIWluZm8gfHwgIWluZm8udXVpZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSBUZXh0U3R5bGVzIEpTT04g5bey5YaZ5YWl77yM5L2GIGFzc2V0LWRiIOacqui/lOWbnui1hOa6kOS/oeaBr+OAgicsIHsgZGJVcmwgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnVGV4dFN0eWxlcyBhc3NldCBpbXBvcnQgZGlkIG5vdCByZXR1cm4gYXNzZXQgaW5mbycsIGRiVXJsIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZvbnRMaWIgPSBhd2FpdCBzY2FuRm9udExpYnJhcnkoKTtcbiAgICAgICAgICAgIGNvbnN0IGxpYnJhcnkgPSBhd2FpdCBzY2FuVGV4dFN0eWxlTGlicmFyeShmb250TGliKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOW3sueUn+aIkCBUZXh0U3R5bGVzIOagt+W8j+W6k+e0ouW8le+8iGJldGHvvInvvJoke2RiVXJsfWAsXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBpbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGVudHJpZXM6IGdlbmVyYXRlZC5lbnRyaWVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgbW9kZTogZ2VuZXJhdGVkLnN0YXRzLm1vZGUsXG4gICAgICAgICAgICAgICAgICAgIHN0eWxlUm9vdDogZ2VuZXJhdGVkLnN0eWxlUm9vdFBhdGggfHwgJyjmlbTmo7UgSlNPTiknLFxuICAgICAgICAgICAgICAgICAgICBzY2FubmVkRW50cmllczogbGlicmFyeS5lbnRyaWVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAvLyDnjq8y77ya5oqK55yf5a6eIExhYmVsIOaooeadv+agkeeUn+aIkOWIsOWcuuaZr++8jOS6pOe7mee+juacr+aJi+WKqOWtmCBwcmVmYWLjgIJcbiAgICAgICAgICAgIC8vIFBoYXNlIDEg5bey6K+B5piO56iL5bqP5YyW5Yib5bu6IHByZWZhYiDkvJrkuKLnu4Tku7blsZ7mgKfvvIzmiYDku6Xov5nph4zlj6rlu7rlnLrmma/oioLngrnjgIJcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lUmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdidWlsZFRleHRTdHlsZVJvb3QnLCB7XG4gICAgICAgICAgICAgICAgZW50cmllczogZ2VuZXJhdGVkLmVudHJpZXMsXG4gICAgICAgICAgICAgICAgcm9vdE5hbWU6IFRFWFRfU1RZTEVfTElCX05BTUUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChzY2VuZVJlc3VsdCAmJiBzY2VuZVJlc3VsdC5zdWNjZXNzICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHNhdmVTY2VuZUFmdGVySW1wb3J0KHNjZW5lUmVzdWx0KTtcbiAgICAgICAgICAgICAgICBjb25zdCBsZWFmQ291bnQgPSBzY2VuZVJlc3VsdC5kYXRhID8gc2NlbmVSZXN1bHQuZGF0YS5sZWFmQ291bnQgOiAwO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3ROYW1lID0gc2NlbmVSZXN1bHQuZGF0YSA/IHNjZW5lUmVzdWx0LmRhdGEucm9vdE5hbWUgOiBURVhUX1NUWUxFX0xJQl9OQU1FO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICAgICAgICBgJWNbZmlnbWEtaW1wb3J0ZXJdIOW3suWcqOWcuuaZr+eUn+aIkOOAjCR7cm9vdE5hbWV944CN5qih5p2/6IqC54K55qCR77yIJHtsZWFmQ291bnR9IOS4qiBMYWJlbCDlj7blrZDvvInjgIJgLFxuICAgICAgICAgICAgICAgICAgICAnY29sb3I6IzBhMDtmb250LXdlaWdodDpib2xkJ1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOS4i+S4gOatpe+8iOe+juacr++8ie+8muWcqOWxgue6p+mHjOe7meWQhCBMYWJlbCDmiYvphY3lrZfkvZMv5o+P6L65L+aKleW9seiHs+S4jiBGaWdtYSDkuIDoh7TvvIxgICtcbiAgICAgICAgICAgICAgICAgICAgYOeEtuWQjuaKiuOAjCR7cm9vdE5hbWV944CN6IqC54K55ouW6L+b44CMJHtURVhUX1NUWUxFX0xJQl9ESVJ9L+OAjeWtmOaIkCAke3Jvb3ROYW1lfS5wcmVmYWLjgIJgICtcbiAgICAgICAgICAgICAgICAgICAgYOWvvOWFpeWll+eUqOaXtuS8muWFi+mahui/meS7vSBwcmVmYWIg55qE5qih5p2/6IqC54K544CCYFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDlnLrmma/mqKHmnb/moJHnlJ/miJDlpLHotKXvvIjntKLlvJUgSlNPTiDlt7LlhpnlhaXvvIzlj6/nqI3lkI7ph43or5XnlJ/miJDlnLrmma/oioLngrnvvInvvJonLCBzY2VuZVJlc3VsdCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYlVybCxcbiAgICAgICAgICAgICAgICB1dWlkOiBTdHJpbmcoaW5mby51dWlkKSxcbiAgICAgICAgICAgICAgICBlbnRyaWVzOiBnZW5lcmF0ZWQuZW50cmllcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgc3RhdHM6IGdlbmVyYXRlZC5zdGF0cyxcbiAgICAgICAgICAgICAgICBzY2VuZVJvb3Q6IHNjZW5lUmVzdWx0ICYmIHNjZW5lUmVzdWx0LmRhdGEgPyBzY2VuZVJlc3VsdC5kYXRhIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbZmlnbWEtaW1wb3J0ZXJdIGdlbmVyYXRlVGV4dFN0eWxlc0Zyb21Kc29uQmV0YSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAemggYmV0Ye+8mueUqOS4gOS7vSBGaWdtYSBKU09OIOmHjeW7uuW9k+WJjemAieS4reeahCBVSSDmoLnoioLngrnjgIJcbiAgICAgKiAgICAg6L+Z5LiN5piv5Y+m5LiA5aWX5riy5p+T6YC76L6R77yM6ICM5piv5aSN55So5q2j5byP5a+85YWlIHBheWxvYWTvvIzlnKjljp/niLboioLngrkv5Y6f5bGC57qn5L2N572u5pu/5o2i5pW05qO15a2Q5qCR44CCXG4gICAgICovXG4gICAgYXN5bmMgcmVwbGFjZVNlbGVjdGVkRnJvbUpzb25CZXRhKHByZXNldFBhdGg/OiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0VXVpZCA9IGdldFNlbGVjdGVkTm9kZVV1aWQoKTtcbiAgICAgICAgaWYgKCF0YXJnZXRVdWlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g5pu/5o2i5aSx6LSl77ya6K+35YWI5Zyo5bGC57qn6YeM6YCJ5Lit6KaB5pu/5o2i55qEIFVJIOagueiKgueCueOAgicpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gc2VsZWN0ZWQgdGFyZ2V0IG5vZGUnIH07XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gcHJlc2V0UGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaWNrZWQgPSBhd2FpdCBFZGl0b3IuRGlhbG9nLnNlbGVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpdGxlOiAn6YCJ5oup55So5LqO5pu/5o2i6YCJ5LitIFVJIOagueeahCBGaWdtYSBKU09OJyxcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2ZpbGUnLFxuICAgICAgICAgICAgICAgICAgICBmaWx0ZXJzOiBbeyBuYW1lOiAnSlNPTicsIGV4dGVuc2lvbnM6IFsnanNvbiddIH1dLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChwaWNrZWQuY2FuY2VsZWQgfHwgcGlja2VkLmZpbGVQYXRocy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnQ2FuY2VsZWQnIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZpbGVQYXRoID0gcGlja2VkLmZpbGVQYXRoc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGZpbGUgcGF0aCcgfTtcblxuICAgICAgICAgICAgY29uc29sZS5sb2coYCVjW2ZpZ21hLWltcG9ydGVyXSDlvIDlp4vmm7/mjaLpgInkuK0gVUkg5qC577yIYmV0Ye+8iSDCtyDmnoTlu7rniYjmnKwgPSAke0JVSUxEX1ZFUlNJT059YCwgJ2NvbG9yOiMwYTA7Zm9udC13ZWlnaHQ6Ym9sZCcpO1xuICAgICAgICAgICAgY29uc3QgcmF3ID0gcmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmLTgnKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKHJhdykgYXMgRmlnbWFFeHBvcnREYXRhO1xuICAgICAgICAgICAgYXdhaXQgZW5zdXJlQ29tcG9uZW50U3RhdGVSdW50aW1lQmVzdEVmZm9ydCgpO1xuICAgICAgICAgICAgY29uc3QgcHJlcGFyZWRQYXlsb2FkID0gYXdhaXQgcHJlcGFyZVNjZW5lUGF5bG9hZEZyb21EYXRhKGRhdGEpO1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdyZXBsYWNlVHJlZUJldGEnLCB7XG4gICAgICAgICAgICAgICAgLi4ucHJlcGFyZWRQYXlsb2FkLnBheWxvYWQsXG4gICAgICAgICAgICAgICAgdGFyZ2V0VXVpZCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tmaWdtYS1pbXBvcnRlcl0gcmVwbGFjZVRyZWVCZXRhIHJlc3VsdDonLCByZXN1bHQpO1xuXG4gICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdWNjZXNzICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIGxhc3RJbXBvcnRlZEpzb25Gb3JQdWxsID0gSlNPTi5zdHJpbmdpZnkoZGF0YSwgbnVsbCwgNCk7XG4gICAgICAgICAgICAgICAgbGFzdEltcG9ydGVkTmFtZUZvclB1bGwgPSBkYXRhLm5hbWUgfHwgcHJlcGFyZWRQYXlsb2FkLnByZXBhcmVkLm5hbWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgbGFzdEltcG9ydGVkUm9vdFV1aWQgPSByZXN1bHQgJiYgcmVzdWx0LmRhdGEgPyAocmVzdWx0LmRhdGEucm9vdFV1aWQgfHwgJycpIDogJyc7XG4gICAgICAgICAgICAgICAgYXdhaXQgZmluYWxpemVDb21wb25lbnRTdGF0ZVRhcmdldHMocmVzdWx0KTtcbiAgICAgICAgICAgICAgICBhd2FpdCByZXNvbHZlUHJlcGFyZWRQbGFjZWhvbGRlcnMocmVzdWx0LCBwcmVwYXJlZFBheWxvYWQucGVuZGluZ1Nwcml0ZUZyYW1lcyk7XG4gICAgICAgICAgICAgICAgYXdhaXQgc2F2ZVNjZW5lQWZ0ZXJJbXBvcnQocmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIHJlcGxhY2VUcmVlQmV0YSDmnKrmiJDlip/vvIzot7Pov4foh6rliqjkv53lrZjjgIInLCByZXN1bHQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwcmVwYXJlZFBheWxvYWQudGV4dFN0eWxlVHJhY2tlci5yZXBvcnQoKTtcbiAgICAgICAgICAgIHByZXBhcmVkUGF5bG9hZC50ZXh0U3R5bGVUZW1wbGF0ZVRyYWNrZXIucmVwb3J0KHByZXBhcmVkUGF5bG9hZC50ZXh0U3R5bGVMaWIpO1xuICAgICAgICAgICAgcmVwb3J0Rm9udERlbWFuZChwcmVwYXJlZFBheWxvYWQuZm9udFRyYWNrZXIpO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWdtYS1pbXBvcnRlcl0gcmVwbGFjZVNlbGVjdGVkRnJvbUpzb25CZXRhIGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEB6aCBiZXRh77ya5LuOIEpTT04g5Lit5om+5Yiw5LiO5b2T5YmN6YCJ5LitIENvY29zIOiKgueCueacgOWMuemFjeeahCBGaWdtYSDoioLngrnvvIzlubblj6rmm7/mjaLov5nmo7XlrZDmoJHjgIJcbiAgICAgKiAgICAg6L+Z5pivIFVuaXR5IExvYWRlci9SZXNvdXJjZVJlcGxhY2Ug55qE5peg56qX5Y+j5qC45b+D6IO95Yqb77ya5Yy56YWN6IqC54K55ZCO5LuN5aSN55So5q2j5byPIGJ1aWxkVHJlZeOAglxuICAgICAqL1xuICAgIGFzeW5jIHJlcGxhY2VTZWxlY3RlZE1hdGNoZWROb2RlRnJvbUpzb25CZXRhKHByZXNldFBhdGg/OiBzdHJpbmcsIGZpZ21hUGF0aD86IHN0cmluZykge1xuICAgICAgICBjb25zdCB0YXJnZXRVdWlkID0gZ2V0U2VsZWN0ZWROb2RlVXVpZCgpO1xuICAgICAgICBpZiAoIXRhcmdldFV1aWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDlsYDpg6jmm7/mjaLlpLHotKXvvJror7flhYjlnKjlsYLnuqfph4zpgInkuK3opoHmm7/mjaLnmoToioLngrnjgIInKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIHNlbGVjdGVkIHRhcmdldCBub2RlJyB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFJlc3VsdCA9IGF3YWl0IGNhbGxTY2VuZSgnZGVzY3JpYmVOb2RlRm9yUmVwbGFjZUJldGEnLCB7IHV1aWQ6IHRhcmdldFV1aWQgfSk7XG4gICAgICAgICAgICBpZiAoIXRhcmdldFJlc3VsdCB8fCB0YXJnZXRSZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UgfHwgIXRhcmdldFJlc3VsdC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOWxgOmDqOabv+aNouWksei0pe+8muaXoOazleivu+WPlumAieS4reiKgueCueS/oeaBr+OAgicsIHRhcmdldFJlc3VsdCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiB0YXJnZXRSZXN1bHQgJiYgdGFyZ2V0UmVzdWx0LmVycm9yIHx8ICdkZXNjcmliZU5vZGVGb3JSZXBsYWNlQmV0YSBmYWlsZWQnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSB0YXJnZXRSZXN1bHQuZGF0YSBhcyBSZXBsYWNlVGFyZ2V0SW5mbztcblxuICAgICAgICAgICAgbGV0IGZpbGVQYXRoID0gcHJlc2V0UGF0aDtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaWNrZWQgPSBhd2FpdCBFZGl0b3IuRGlhbG9nLnNlbGVjdCh7XG4gICAgICAgICAgICAgICAgICAgIHRpdGxlOiAn6YCJ5oup55So5LqO5bGA6YOo5pu/5o2i55qEIEZpZ21hIEpTT04nLFxuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnZmlsZScsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcnM6IFt7IG5hbWU6ICdKU09OJywgZXh0ZW5zaW9uczogWydqc29uJ10gfV0sXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHBpY2tlZC5jYW5jZWxlZCB8fCBwaWNrZWQuZmlsZVBhdGhzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdDYW5jZWxlZCcgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBwaWNrZWQuZmlsZVBhdGhzWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmaWxlUGF0aCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gZmlsZSBwYXRoJyB9O1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgJWNbZmlnbWEtaW1wb3J0ZXJdIOW8gOWni+WxgOmDqOabv+aNoumAieS4reiKgueCue+8iGJldGHvvIkgwrcg5p6E5bu654mI5pysID0gJHtCVUlMRF9WRVJTSU9OfWAsICdjb2xvcjojMGEwO2ZvbnQtd2VpZ2h0OmJvbGQnKTtcbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IHJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShyYXcpIGFzIEZpZ21hRXhwb3J0RGF0YTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoUHJlcGFyZWQgPSBwcmVwYXJlSW1wb3J0RGF0YShjbG9uZUpzb24oZGF0YSkpO1xuICAgICAgICAgICAgY29uc3QgY2FuZGlkYXRlcyA9IGNvbGxlY3RGaWdtYU5vZGVDYW5kaWRhdGVzKG1hdGNoUHJlcGFyZWQucm9vdCk7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9IHNlbGVjdEJlc3RGaWdtYU5vZGVDYW5kaWRhdGUoY2FuZGlkYXRlcywgdGFyZ2V0LCBmaWdtYVBhdGgpO1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDlsYDpg6jmm7/mjaLlpLHotKXvvJpKU09OIOS4reaJvuS4jeWIsOi2s+Wkn+WPr+S/oeeahOWMuemFjeiKgueCueOAgicsIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBmaWdtYVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGNhbmRpZGF0ZXM6IGNhbmRpZGF0ZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIG1hdGNoaW5nIEZpZ21hIG5vZGUgZm91bmQnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZWROb2RlID0gY2xvbmVKc29uKHNlbGVjdGVkLmNhbmRpZGF0ZS5ub2RlKTtcbiAgICAgICAgICAgIGNvbnN0IHN1YkRhdGE6IEZpZ21hRXhwb3J0RGF0YSA9IHtcbiAgICAgICAgICAgICAgICB2ZXJzaW9uOiBkYXRhLnZlcnNpb24sXG4gICAgICAgICAgICAgICAgbmFtZTogbWF0Y2hlZE5vZGUubmFtZSB8fCBkYXRhLm5hbWUgfHwgJ0ZpZ21hTm9kZScsXG4gICAgICAgICAgICAgICAgY2FudmFzOiBtYXRjaFByZXBhcmVkLmNhbnZhcyxcbiAgICAgICAgICAgICAgICByb290OiBtYXRjaGVkTm9kZSxcbiAgICAgICAgICAgICAgICBpbWFnZXM6IGNsb25lSnNvbihkYXRhLmltYWdlcyB8fCB7fSksXG4gICAgICAgICAgICAgICAgcHJldmlld0ltYWdlUmVmOiBkYXRhLnByZXZpZXdJbWFnZVJlZixcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVDb21wb25lbnRTdGF0ZVJ1bnRpbWVCZXN0RWZmb3J0KCk7XG4gICAgICAgICAgICBjb25zdCBwcmVwYXJlZFBheWxvYWQgPSBhd2FpdCBwcmVwYXJlU2NlbmVQYXlsb2FkRnJvbURhdGEoc3ViRGF0YSk7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjYWxsU2NlbmUoJ3JlcGxhY2VUcmVlQmV0YScsIHtcbiAgICAgICAgICAgICAgICAuLi5wcmVwYXJlZFBheWxvYWQucGF5bG9hZCxcbiAgICAgICAgICAgICAgICB0YXJnZXRVdWlkLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW2ZpZ21hLWltcG9ydGVyXSByZXBsYWNlU2VsZWN0ZWRNYXRjaGVkTm9kZUZyb21Kc29uQmV0YSByZXN1bHQ6JywgcmVzdWx0KTtcblxuICAgICAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQuc3VjY2VzcyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICBsYXN0SW1wb3J0ZWRKc29uRm9yUHVsbCA9IEpTT04uc3RyaW5naWZ5KHN1YkRhdGEsIG51bGwsIDQpO1xuICAgICAgICAgICAgICAgIGxhc3RJbXBvcnRlZE5hbWVGb3JQdWxsID0gbWF0Y2hlZE5vZGUubmFtZSB8fCBkYXRhLm5hbWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgbGFzdEltcG9ydGVkUm9vdFV1aWQgPSByZXN1bHQgJiYgcmVzdWx0LmRhdGEgPyAocmVzdWx0LmRhdGEucm9vdFV1aWQgfHwgJycpIDogJyc7XG4gICAgICAgICAgICAgICAgYXdhaXQgZmluYWxpemVDb21wb25lbnRTdGF0ZVRhcmdldHMocmVzdWx0KTtcbiAgICAgICAgICAgICAgICBhd2FpdCByZXNvbHZlUHJlcGFyZWRQbGFjZWhvbGRlcnMocmVzdWx0LCBwcmVwYXJlZFBheWxvYWQucGVuZGluZ1Nwcml0ZUZyYW1lcyk7XG4gICAgICAgICAgICAgICAgYXdhaXQgc2F2ZVNjZW5lQWZ0ZXJJbXBvcnQocmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOWxgOmDqCByZXBsYWNlVHJlZUJldGEg5pyq5oiQ5Yqf77yM6Lez6L+H6Ieq5Yqo5L+d5a2Y44CCJywgcmVzdWx0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHJlcGFyZWRQYXlsb2FkLnRleHRTdHlsZVRyYWNrZXIucmVwb3J0KCk7XG4gICAgICAgICAgICBwcmVwYXJlZFBheWxvYWQudGV4dFN0eWxlVGVtcGxhdGVUcmFja2VyLnJlcG9ydChwcmVwYXJlZFBheWxvYWQudGV4dFN0eWxlTGliKTtcbiAgICAgICAgICAgIHJlcG9ydEZvbnREZW1hbmQocHJlcGFyZWRQYXlsb2FkLmZvbnRUcmFja2VyKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOWxgOmDqOabv+aNouWMuemFjeivpuaDhe+8micsIHtcbiAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldC5zY2VuZVBhdGggfHwgdGFyZ2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgZmlnbWFQYXRoOiBzZWxlY3RlZC5jYW5kaWRhdGUucGF0aCxcbiAgICAgICAgICAgICAgICBzY29yZTogc2VsZWN0ZWQuc2NvcmUsXG4gICAgICAgICAgICAgICAgcmVhc29uOiBzZWxlY3RlZC5yZWFzb24sXG4gICAgICAgICAgICAgICAgbm9kZXM6IHJlc3VsdCAmJiByZXN1bHQuZGF0YSAmJiByZXN1bHQuZGF0YS5jb3VudCxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLnJlc3VsdCxcbiAgICAgICAgICAgICAgICBtYXRjaDoge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldC5zY2VuZVBhdGggfHwgdGFyZ2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGZpZ21hUGF0aDogc2VsZWN0ZWQuY2FuZGlkYXRlLnBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHNjb3JlOiBzZWxlY3RlZC5zY29yZSxcbiAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBzZWxlY3RlZC5yZWFzb24sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW2ZpZ21hLWltcG9ydGVyXSByZXBsYWNlU2VsZWN0ZWRNYXRjaGVkTm9kZUZyb21Kc29uQmV0YSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAemggYmV0Ye+8muaJq+aPjyBKU09OIOa6kOi1hOa6kOS4jumAieS4reWunuS+i+agkeeahOWPr+abv+aNouebruagh++8jOi+k+WHuuiHquWKqOWMuemFjeWAmemAieOAglxuICAgICAqICAgICDov5nmmK8gVW5pdHkgUmVzb3VyY2VSZXBsYWNlV2luZG93IOeahOaXoOeql+WPo+aVsOaNruWxgu+8muW3puS+p+a6kOWbvi/lrZfjgIHlj7Pkvqfnm67moIfnu4Tku7bjgIHlkI3np7Av6Lev5b6EL+WwuuWvuC/lhoXlrrnor4TliIbjgIJcbiAgICAgKi9cbiAgICBhc3luYyBzY2FuSnNvblJlcGxhY2VDYW5kaWRhdGVzQmV0YShwcmVzZXRQYXRoPzogc3RyaW5nLCBraW5kID0gJ2FsbCcsIHJvb3RVdWlkQXJnPzogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGF3YWl0IHJlc29sdmVKc29uUGF0aEZyb21EaWFsb2cocHJlc2V0UGF0aCwgJ+mAieaLqeeUqOS6juaJq+aPj+abv+aNouWAmemAieeahCBGaWdtYSBKU09OJyk7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdDYW5jZWxlZCcgfTtcblxuICAgICAgICAgICAgY29uc3Qgcm9vdFV1aWQgPSByb290VXVpZEFyZyB8fCBnZXRTZWxlY3RlZE5vZGVVdWlkKCkgfHwgbGFzdEltcG9ydGVkUm9vdFV1aWQ7XG4gICAgICAgICAgICBjb25zdCByYXcgPSByZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UocmF3KSBhcyBGaWdtYUV4cG9ydERhdGE7XG4gICAgICAgICAgICBjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVJbXBvcnREYXRhKGNsb25lSnNvbihkYXRhKSk7XG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gY29sbGVjdEZpZ21hTm9kZUNhbmRpZGF0ZXMocHJlcGFyZWQucm9vdCk7XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VUZXh0cyA9IGNhbmRpZGF0ZXNcbiAgICAgICAgICAgICAgICAuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnR5cGUgPT09ICdURVhUJylcbiAgICAgICAgICAgICAgICAubWFwKHN1bW1hcml6ZUZpZ21hQ2FuZGlkYXRlKTtcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZUltYWdlc0J5UmVmOiB7IFtyZWY6IHN0cmluZ106IGFueSB9ID0ge307XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgY2FuZGlkYXRlcy5maWx0ZXIoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmhhc0ltYWdlICYmIGNhbmRpZGF0ZS50eXBlICE9PSAnVEVYVCcpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qga2V5ID0gaXRlbS5pbWFnZVJlZiB8fCBpdGVtLnBhdGg7XG4gICAgICAgICAgICAgICAgaWYgKCFzb3VyY2VJbWFnZXNCeVJlZltrZXldKSB7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZUltYWdlc0J5UmVmW2tleV0gPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi5zdW1tYXJpemVGaWdtYUNhbmRpZGF0ZShpdGVtKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9jY3VycmVuY2VzOiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWxsUmVjdHM6IFtdLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzb3VyY2VJbWFnZXNCeVJlZltrZXldLm9jY3VycmVuY2VzKys7XG4gICAgICAgICAgICAgICAgc291cmNlSW1hZ2VzQnlSZWZba2V5XS5hbGxSZWN0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogaXRlbS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICB4OiBpdGVtLmNhbnZhc1gsXG4gICAgICAgICAgICAgICAgICAgIHk6IGl0ZW0uY2FudmFzWSxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IGl0ZW0ud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogaXRlbS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFJlc3VsdCA9IGF3YWl0IGNhbGxTY2VuZSgnbGlzdFJlcGxhY2VUYXJnZXRzQmV0YScsIHtcbiAgICAgICAgICAgICAgICByb290VXVpZCxcbiAgICAgICAgICAgICAgICBraW5kLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoIXRhcmdldFJlc3VsdCB8fCB0YXJnZXRSZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UgfHwgIXRhcmdldFJlc3VsdC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOaJq+aPj+abv+aNouWAmemAieWksei0pe+8muaXoOazleivu+WPluebruagh+WunuS+i+agkeOAgicsIHRhcmdldFJlc3VsdCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiB0YXJnZXRSZXN1bHQgJiYgdGFyZ2V0UmVzdWx0LmVycm9yIHx8ICdsaXN0UmVwbGFjZVRhcmdldHNCZXRhIGZhaWxlZCcgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0cyA9ICh0YXJnZXRSZXN1bHQuZGF0YS50YXJnZXRzIHx8IFtdKSBhcyBSZXBsYWNlVGFyZ2V0SW5mb1tdO1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IHRhcmdldHMubWFwKCh0YXJnZXQpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0b3AgPSBsaXN0QmVzdEZpZ21hTm9kZUNhbmRpZGF0ZXMoY2FuZGlkYXRlcywgdGFyZ2V0LCA1KTtcbiAgICAgICAgICAgICAgICBjb25zdCBiZXN0ID0gdG9wWzBdIHx8IG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBiZXN0OiBiZXN0ID8ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcmU6IGJlc3Quc2NvcmUsXG4gICAgICAgICAgICAgICAgICAgICAgICByZWFzb246IGJlc3QucmVhc29uLFxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBzdW1tYXJpemVGaWdtYUNhbmRpZGF0ZShiZXN0LmNhbmRpZGF0ZSksXG4gICAgICAgICAgICAgICAgICAgIH0gOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBjYW5kaWRhdGVzOiB0b3AubWFwKChpdGVtKSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcmU6IGl0ZW0uc2NvcmUsXG4gICAgICAgICAgICAgICAgICAgICAgICByZWFzb246IGl0ZW0ucmVhc29uLFxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBzdW1tYXJpemVGaWdtYUNhbmRpZGF0ZShpdGVtLmNhbmRpZGF0ZSksXG4gICAgICAgICAgICAgICAgICAgIH0pKSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zdCBhbWJpZ3VvdXNNYXRjaGVzID0gbWF0Y2hlc1xuICAgICAgICAgICAgICAgIC5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uYmVzdCAmJiBpdGVtLmNhbmRpZGF0ZXMubGVuZ3RoID4gMSAmJlxuICAgICAgICAgICAgICAgICAgICBNYXRoLmFicyhpdGVtLmJlc3Quc2NvcmUgLSBpdGVtLmNhbmRpZGF0ZXNbMV0uc2NvcmUpIDwgODApXG4gICAgICAgICAgICAgICAgLm1hcCgoaXRlbSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiBpdGVtLnRhcmdldC5yZWxhdGl2ZVBhdGggfHwgaXRlbS50YXJnZXQuc2NlbmVQYXRoIHx8IGl0ZW0udGFyZ2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6IGl0ZW0udGFyZ2V0LnJlcGxhY2VLaW5kLFxuICAgICAgICAgICAgICAgICAgICBiZXN0OiBpdGVtLmJlc3QsXG4gICAgICAgICAgICAgICAgICAgIHJ1bm5lclVwOiBpdGVtLmNhbmRpZGF0ZXNbMV0sXG4gICAgICAgICAgICAgICAgICAgIGRlbHRhOiBpdGVtLmJlc3QgPyBpdGVtLmJlc3Quc2NvcmUgLSBpdGVtLmNhbmRpZGF0ZXNbMV0uc2NvcmUgOiAwLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIGNvbnN0IGFzc2lnbm1lbnRzQnlTb3VyY2U6IHsgW3BhdGg6IHN0cmluZ106IGFueVtdIH0gPSB7fTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFpdGVtLmJlc3QgfHwgaXRlbS5iZXN0LnNjb3JlIDwgMzAwKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gaXRlbS5iZXN0LnNvdXJjZS5wYXRoO1xuICAgICAgICAgICAgICAgIGlmICghYXNzaWdubWVudHNCeVNvdXJjZVtwYXRoXSkgYXNzaWdubWVudHNCeVNvdXJjZVtwYXRoXSA9IFtdO1xuICAgICAgICAgICAgICAgIGFzc2lnbm1lbnRzQnlTb3VyY2VbcGF0aF0ucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogaXRlbS50YXJnZXQucmVsYXRpdmVQYXRoIHx8IGl0ZW0udGFyZ2V0LnNjZW5lUGF0aCB8fCBpdGVtLnRhcmdldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBraW5kOiBpdGVtLnRhcmdldC5yZXBsYWNlS2luZCxcbiAgICAgICAgICAgICAgICAgICAgc2NvcmU6IGl0ZW0uYmVzdC5zY29yZSxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGR1cGxpY2F0ZVNvdXJjZUFzc2lnbm1lbnRzID0gT2JqZWN0LmtleXMoYXNzaWdubWVudHNCeVNvdXJjZSlcbiAgICAgICAgICAgICAgICAuZmlsdGVyKChwYXRoKSA9PiBhc3NpZ25tZW50c0J5U291cmNlW3BhdGhdLmxlbmd0aCA+IDEpXG4gICAgICAgICAgICAgICAgLm1hcCgocGF0aCkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiBwYXRoLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogYXNzaWdubWVudHNCeVNvdXJjZVtwYXRoXS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHM6IGFzc2lnbm1lbnRzQnlTb3VyY2VbcGF0aF0sXG4gICAgICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgY29uc3QgY29uZmlkZW50ID0gbWF0Y2hlcy5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uYmVzdCAmJiBpdGVtLmJlc3Quc2NvcmUgPj0gMzAwKS5sZW5ndGg7XG4gICAgICAgICAgICBjb25zdCB3ZWFrID0gbWF0Y2hlcy5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0uYmVzdCAmJiBpdGVtLmJlc3Quc2NvcmUgPiAwICYmIGl0ZW0uYmVzdC5zY29yZSA8IDMwMCkubGVuZ3RoO1xuICAgICAgICAgICAgY29uc3QgbWlzc2luZyA9IG1hdGNoZXMuZmlsdGVyKChpdGVtKSA9PiAhaXRlbS5iZXN0KS5sZW5ndGg7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBwcmVwYXJlZC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkLmNhbnZhcyxcbiAgICAgICAgICAgICAgICAgICAgcm9vdDogdGFyZ2V0UmVzdWx0LmRhdGEucm9vdE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiB0YXJnZXRSZXN1bHQuZGF0YS5yb290VXVpZCxcbiAgICAgICAgICAgICAgICAgICAga2luZCxcbiAgICAgICAgICAgICAgICAgICAgc291cmNlU3RhdHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVzOiBjYW5kaWRhdGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRleHRzOiBzb3VyY2VUZXh0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbWFnZXM6IE9iamVjdC5rZXlzKHNvdXJjZUltYWdlc0J5UmVmKS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFN0YXRzOiB0YXJnZXRSZXN1bHQuZGF0YS5zdGF0cyxcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hTdGF0czoge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0czogbWF0Y2hlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25maWRlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICB3ZWFrLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWlzc2luZyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFtYmlndW91czogYW1iaWd1b3VzTWF0Y2hlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBkdXBsaWNhdGVTb3VyY2VBc3NpZ25tZW50czogZHVwbGljYXRlU291cmNlQXNzaWdubWVudHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBzb3VyY2VUZXh0cyxcbiAgICAgICAgICAgICAgICAgICAgc291cmNlSW1hZ2VzOiBPYmplY3QudmFsdWVzKHNvdXJjZUltYWdlc0J5UmVmKSxcbiAgICAgICAgICAgICAgICAgICAgYW1iaWd1b3VzTWF0Y2hlcyxcbiAgICAgICAgICAgICAgICAgICAgZHVwbGljYXRlU291cmNlQXNzaWdubWVudHMsXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW2ZpZ21hLWltcG9ydGVyXSDmm7/mjaLlgJnpgInmiavmj4/lrozmiJDvvIhiZXRh77yJ77yaJywge1xuICAgICAgICAgICAgICAgIHNvdXJjZTogcmVzdWx0LmRhdGEuc291cmNlU3RhdHMsXG4gICAgICAgICAgICAgICAgdGFyZ2V0OiByZXN1bHQuZGF0YS50YXJnZXRTdGF0cyxcbiAgICAgICAgICAgICAgICBtYXRjaDogcmVzdWx0LmRhdGEubWF0Y2hTdGF0cyxcbiAgICAgICAgICAgICAgICB0b3A6IG1hdGNoZXMuc2xpY2UoMCwgOCkubWFwKChpdGVtKSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IGl0ZW0udGFyZ2V0LnJlbGF0aXZlUGF0aCB8fCBpdGVtLnRhcmdldC5zY2VuZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGtpbmQ6IGl0ZW0udGFyZ2V0LnJlcGxhY2VLaW5kLFxuICAgICAgICAgICAgICAgICAgICBzY29yZTogaXRlbS5iZXN0ICYmIGl0ZW0uYmVzdC5zY29yZSxcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiBpdGVtLmJlc3QgJiYgaXRlbS5iZXN0LnNvdXJjZS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IGl0ZW0uYmVzdCAmJiBpdGVtLmJlc3QucmVhc29uLFxuICAgICAgICAgICAgICAgIH0pKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbZmlnbWEtaW1wb3J0ZXJdIHNjYW5Kc29uUmVwbGFjZUNhbmRpZGF0ZXNCZXRhIGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEB6aCBiZXRh77ya5Yqg6L29IEZpZ21hIEpTT04g55qE5pW05bin6aKE6KeI5Zu+5LiO5ZG95Lit5qGG5pWw5o2u77yI5Y+q6K+777yM5LiN6JC955uY77yJ44CCXG4gICAgICogICAgIOWvuem9kCBVbml0eSBMb2FkZXJXaW5kb3cg55qE6aKE6KeI5pWw5o2u5bGC77ya5LyY5YWI5L2/55So5a+85Ye66Ieq5bimIHByZXZpZXdJbWFnZVJlZi9wcmV2aWV3SW1hZ2VCYXNlNjTjgIJcbiAgICAgKi9cbiAgICBhc3luYyBsb2FkSnNvblByZXZpZXdCZXRhKHByZXNldFBhdGg/OiBzdHJpbmcsIGluY2x1ZGVJbWFnZSA9IHRydWUsIGluY2x1ZGVTb3VyY2VzID0gdHJ1ZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBhd2FpdCByZXNvbHZlSnNvblBhdGhGcm9tRGlhbG9nKHByZXNldFBhdGgsICfpgInmi6nnlKjkuo7pooTop4jnmoQgRmlnbWEgSlNPTicpO1xuICAgICAgICAgICAgaWYgKCFmaWxlUGF0aCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnQ2FuY2VsZWQnIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHJhdyA9IHJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShyYXcpIGFzIEZpZ21hRXhwb3J0RGF0YTtcbiAgICAgICAgICAgIGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZUxvYWRlclByZXZpZXdEYXRhKGNsb25lSnNvbihkYXRhKSk7XG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gY29sbGVjdEZpZ21hTm9kZUNhbmRpZGF0ZXMocHJlcGFyZWQucm9vdCk7XG4gICAgICAgICAgICBjb25zdCBwcmV2aWV3ID0gcmVzb2x2ZVByZXZpZXdJbWFnZUJhc2U2NChkYXRhKTtcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZUltYWdlc0J5UmVmOiB7IFtyZWY6IHN0cmluZ106IGFueSB9ID0ge307XG4gICAgICAgICAgICBjb25zdCBzb3VyY2VUZXh0czogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlU291cmNlcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhbmRpZGF0ZS50eXBlID09PSAnVEVYVCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZVRleHRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGNhbmRpZGF0ZS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IGNhbmRpZGF0ZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGtpbmQ6IGNhbmRpZGF0ZS5yZXBsYWNlS2luZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBjYW5kaWRhdGUuY2FudmFzWCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBjYW5kaWRhdGUuY2FudmFzWSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogY2FuZGlkYXRlLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogY2FuZGlkYXRlLmhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0OiBjYW5kaWRhdGUuY2hhcmFjdGVycyB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNhbmRpZGF0ZS5oYXNJbWFnZSAmJiBjYW5kaWRhdGUuaW1hZ2VSZWYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlZiA9IGNhbmRpZGF0ZS5pbWFnZVJlZjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc291cmNlSW1hZ2VzQnlSZWZbcmVmXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2U2NCA9IGRhdGEuaW1hZ2VzICYmIGRhdGEuaW1hZ2VzW3JlZl0gfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlSW1hZ2VzQnlSZWZbcmVmXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aDogY2FuZGlkYXRlLnBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IGNhbmRpZGF0ZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBraW5kOiBjYW5kaWRhdGUucmVwbGFjZUtpbmQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlUmVmOiByZWYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBjYW5kaWRhdGUud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogY2FuZGlkYXRlLmhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2NjdXJyZW5jZXM6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRhdGFVcmw6IGJhc2U2NCA/IGBkYXRhOiR7cHJldmlld01pbWVGcm9tQmFzZTY0KGJhc2U2NCl9O2Jhc2U2NCwke2Jhc2U2NH1gIDogJycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFsbFJlY3RzOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlSW1hZ2VzQnlSZWZbcmVmXS5vY2N1cnJlbmNlcysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlSW1hZ2VzQnlSZWZbcmVmXS5hbGxSZWN0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoOiBjYW5kaWRhdGUucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBjYW5kaWRhdGUuY2FudmFzWCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBjYW5kaWRhdGUuY2FudmFzWSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogY2FuZGlkYXRlLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogY2FuZGlkYXRlLmhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaGl0cyA9IGNhbmRpZGF0ZXMubWFwKChjYW5kaWRhdGUpID0+ICh7XG4gICAgICAgICAgICAgICAgcGF0aDogY2FuZGlkYXRlLnBhdGgsXG4gICAgICAgICAgICAgICAgbmFtZTogY2FuZGlkYXRlLm5hbWUsXG4gICAgICAgICAgICAgICAga2luZDogY2FuZGlkYXRlLnJlcGxhY2VLaW5kLFxuICAgICAgICAgICAgICAgIHR5cGU6IGNhbmRpZGF0ZS50eXBlLFxuICAgICAgICAgICAgICAgIHg6IGNhbmRpZGF0ZS5jYW52YXNYLFxuICAgICAgICAgICAgICAgIHk6IGNhbmRpZGF0ZS5jYW52YXNZLFxuICAgICAgICAgICAgICAgIHdpZHRoOiBjYW5kaWRhdGUud2lkdGgsXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBjYW5kaWRhdGUuaGVpZ2h0LFxuICAgICAgICAgICAgICAgIGltYWdlUmVmOiBjYW5kaWRhdGUuaW1hZ2VSZWYsXG4gICAgICAgICAgICAgICAgdGV4dDogY2FuZGlkYXRlLmNoYXJhY3RlcnMgPyBjYW5kaWRhdGUuY2hhcmFjdGVycy5zbGljZSgwLCAxMjApIDogJycsXG4gICAgICAgICAgICAgICAgY29tcG9uZW50S2V5OiBTdHJpbmcoY2FuZGlkYXRlLm5vZGUuY29tcG9uZW50S2V5IHx8ICcnKSxcbiAgICAgICAgICAgICAgICBjb21wb25lbnROYW1lOiBTdHJpbmcoY2FuZGlkYXRlLm5vZGUubmFtZSB8fCAnJyksXG4gICAgICAgICAgICAgICAgdmFyaWFudEZpbHRlcjogYnVpbGRWYXJpYW50RmlsdGVyKGNhbmRpZGF0ZS5ub2RlLmNvbXBvbmVudFByb3BlcnRpZXMpLFxuICAgICAgICAgICAgICAgIGNvbXBvbmVudFByb3BlcnRpZXM6IG5vcm1hbGl6ZUNvbXBvbmVudFByb3BlcnRpZXMoY2FuZGlkYXRlLm5vZGUuY29tcG9uZW50UHJvcGVydGllcyksXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBwcmVwYXJlZC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkLmNhbnZhcyxcbiAgICAgICAgICAgICAgICAgICAgcHJldmlld0ltYWdlUmVmOiBwcmV2aWV3LnJlZixcbiAgICAgICAgICAgICAgICAgICAgcHJldmlld0ltYWdlRGF0YVVybDogaW5jbHVkZUltYWdlICYmIHByZXZpZXcuYmFzZTY0XG4gICAgICAgICAgICAgICAgICAgICAgICA/IGBkYXRhOiR7cHJldmlld01pbWVGcm9tQmFzZTY0KHByZXZpZXcuYmFzZTY0KX07YmFzZTY0LCR7cHJldmlldy5iYXNlNjR9YFxuICAgICAgICAgICAgICAgICAgICAgICAgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgc3RhdHM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGhpdHM6IGhpdHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGV4dHM6IGhpdHMuZmlsdGVyKChpdGVtKSA9PiBpdGVtLmtpbmQgPT09ICd0ZXh0JykubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW1hZ2VzOiBoaXRzLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5raW5kID09PSAnaW1hZ2UnKS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBoYXNQcmV2aWV3SW1hZ2U6ICEhcHJldmlldy5iYXNlNjQsXG4gICAgICAgICAgICAgICAgICAgICAgICBzb3VyY2VUZXh0czogc291cmNlVGV4dHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlSW1hZ2VzOiBPYmplY3Qua2V5cyhzb3VyY2VJbWFnZXNCeVJlZikubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJmYWNlQ291bnQ6IHByZXBhcmVkLmludGVyZmFjZUNvdW50LFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBzb3VyY2VJbWFnZXM6IE9iamVjdC52YWx1ZXMoc291cmNlSW1hZ2VzQnlSZWYpLFxuICAgICAgICAgICAgICAgICAgICBzb3VyY2VUZXh0cyxcbiAgICAgICAgICAgICAgICAgICAgaGl0cyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOW3suWKoOi9vSBKU09OIOmihOiniOaVsOaNru+8iGJldGHvvInvvJonLCB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgbmFtZTogcmVzdWx0LmRhdGEubmFtZSxcbiAgICAgICAgICAgICAgICBjYW52YXM6IHJlc3VsdC5kYXRhLmNhbnZhcyxcbiAgICAgICAgICAgICAgICBwcmV2aWV3SW1hZ2VSZWY6IHJlc3VsdC5kYXRhLnByZXZpZXdJbWFnZVJlZixcbiAgICAgICAgICAgICAgICBzdGF0czogcmVzdWx0LmRhdGEuc3RhdHMsXG4gICAgICAgICAgICAgICAgaW5jbHVkZUltYWdlLFxuICAgICAgICAgICAgICAgIGluY2x1ZGVTb3VyY2VzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWdtYS1pbXBvcnRlcl0gbG9hZEpzb25QcmV2aWV3QmV0YSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAemggYmV0Ye+8mui0tOWbvumihOiniC/nvLrlpLHmiavmj4/jgILlr7npvZAgVW5pdHkgVGV4dHVyZVByZXZpZXdXaW5kb3fvvJpcbiAgICAgKiAgICAg5oyJ5ZSv5LiAIEZpZ21hIOWbvueJh+WGheWuueaJq+aPj+mhueebrui1hOa6kO+8jOWMuuWIhuato+W8j+i1hOa6kOWRveS4reOAgeS7hSBGaWdtYSDlr7zlhaXnm67lvZXlkb3kuK3jgIHlrozlhajnvLrlpLHjgIJcbiAgICAgKi9cbiAgICBhc3luYyBzY2FuSnNvblRleHR1cmVzQmV0YShwcmVzZXRQYXRoPzogc3RyaW5nLCBpbmNsdWRlSW1hZ2UgPSB0cnVlLCBvbmx5TWlzc2luZyA9IGZhbHNlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGF3YWl0IHJlc29sdmVKc29uUGF0aEZyb21EaWFsb2cocHJlc2V0UGF0aCwgJ+mAieaLqeeUqOS6jui0tOWbvumihOiniOeahCBGaWdtYSBKU09OJyk7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdDYW5jZWxlZCcgfTtcblxuICAgICAgICAgICAgY29uc3QgcmF3ID0gcmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmLTgnKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKHJhdykgYXMgRmlnbWFFeHBvcnREYXRhO1xuICAgICAgICAgICAgY29uc3QgcHJlcGFyZWQgPSBwcmVwYXJlTG9hZGVyUHJldmlld0RhdGEoY2xvbmVKc29uKGRhdGEpKTtcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2xsZWN0RmlnbWFOb2RlQ2FuZGlkYXRlcyhwcmVwYXJlZC5yb290KVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmhhc0ltYWdlICYmIGNhbmRpZGF0ZS5pbWFnZVJlZik7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0SW5kZXggPSBhd2FpdCBzY2FuUHJvamVjdFRleHR1cmVJbmRleChhd2FpdCByZWFkQ29tbW9uUmVzb3VyY2VEaXJzKCkpO1xuICAgICAgICAgICAgY29uc3QgYnlSZWY6IHsgW3JlZjogc3RyaW5nXTogYW55IH0gPSB7fTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlUmVmID0gY2FuZGlkYXRlLmltYWdlUmVmO1xuICAgICAgICAgICAgICAgIGlmICghaW1hZ2VSZWYpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IGJhc2U2NCA9IGRhdGEuaW1hZ2VzICYmIGRhdGEuaW1hZ2VzW2ltYWdlUmVmXSB8fCAnJztcbiAgICAgICAgICAgICAgICBpZiAoIWJhc2U2NCkgY29udGludWU7XG4gICAgICAgICAgICAgICAgaWYgKCFieVJlZltpbWFnZVJlZl0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzaGVkID0gaGFzaEltYWdlQmFzZTY0KGJhc2U2NCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBoYXNoZWQgPyAocHJvamVjdEluZGV4LmJ5SGFzaFtoYXNoZWQuaGFzaF0gfHwgW10pIDogW107XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJlc3QgPSBwaWNrQW55VGV4dHVyZU1hdGNoKG1hdGNoZXMpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXMgPSB0ZXh0dXJlU3RhdHVzRnJvbU1hdGNoZXMobWF0Y2hlcyk7XG4gICAgICAgICAgICAgICAgICAgIGJ5UmVmW2ltYWdlUmVmXSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlUmVmLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogY2FuZGlkYXRlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbWFnZU5hbWU6IGNhbmRpZGF0ZS5ub2RlICYmIGNhbmRpZGF0ZS5ub2RlLmltYWdlTmFtZSB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGNhbmRpZGF0ZS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IGhhc2hlZCAmJiBoYXNoZWQud2lkdGggfHwgY2FuZGlkYXRlLndpZHRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoYXNoZWQgJiYgaGFzaGVkLmhlaWdodCB8fCBjYW5kaWRhdGUuaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZVdpZHRoOiBjYW5kaWRhdGUud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlSGVpZ2h0OiBjYW5kaWRhdGUuaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFzaDogaGFzaGVkICYmIGhhc2hlZC5oYXNoIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmF3SGFzaDogaGFzaGVkICYmIGhhc2hlZC5yYXdIYXNoIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgc3RhdHVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQ6IHN0YXR1cyAhPT0gJ21pc3NpbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvamVjdEZvdW5kOiBzdGF0dXMgPT09ICdwcm9qZWN0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpZ21hSW1wb3J0Rm91bmQ6IHN0YXR1cyA9PT0gJ2ZpZ21hLWltcG9ydCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFBhdGg6IGJlc3QgPyBiZXN0LmRiVXJsIDogJycsXG4gICAgICAgICAgICAgICAgICAgICAgICBhc3NldFV1aWQ6IGJlc3QgPyBiZXN0LnV1aWQgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoQ291bnQ6IG1hdGNoZXMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJvamVjdE1hdGNoQ291bnQ6IG1hdGNoZXMuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnNvdXJjZSA9PT0gJ3Byb2plY3QnKS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWdtYUltcG9ydE1hdGNoQ291bnQ6IG1hdGNoZXMuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnNvdXJjZSA9PT0gJ2ZpZ21hLWltcG9ydCcpLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGFVcmw6IGluY2x1ZGVJbWFnZSA/IGBkYXRhOiR7cHJldmlld01pbWVGcm9tQmFzZTY0KGJhc2U2NCl9O2Jhc2U2NCwke2Jhc2U2NH1gIDogJycsXG4gICAgICAgICAgICAgICAgICAgICAgICBvY2N1cnJlbmNlczogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFsbFJlY3RzOiBbXSBhcyBUZXh0dXJlUHJldmlld09jY3VycmVuY2VbXSxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnlSZWZbaW1hZ2VSZWZdLm9jY3VycmVuY2VzKys7XG4gICAgICAgICAgICAgICAgYnlSZWZbaW1hZ2VSZWZdLmFsbFJlY3RzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBwYXRoOiBjYW5kaWRhdGUucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogY2FuZGlkYXRlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHdpZHRoOiBjYW5kaWRhdGUud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogY2FuZGlkYXRlLmhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgY2FudmFzWDogY2FuZGlkYXRlLmNhbnZhc1gsXG4gICAgICAgICAgICAgICAgICAgIGNhbnZhc1k6IGNhbmRpZGF0ZS5jYW52YXNZLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgZW50cmllcyA9IE9iamVjdC52YWx1ZXMoYnlSZWYpIGFzIGFueVtdO1xuICAgICAgICAgICAgZW50cmllcy5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmFuayA9IChpdGVtOiBhbnkpID0+IGl0ZW0uc3RhdHVzID09PSAnbWlzc2luZycgPyAwIDogKGl0ZW0uc3RhdHVzID09PSAnZmlnbWEtaW1wb3J0JyA/IDEgOiAyKTtcbiAgICAgICAgICAgICAgICBjb25zdCBhciA9IHJhbmsoYSk7XG4gICAgICAgICAgICAgICAgY29uc3QgYnIgPSByYW5rKGIpO1xuICAgICAgICAgICAgICAgIGlmIChhciAhPT0gYnIpIHJldHVybiBhciAtIGJyO1xuICAgICAgICAgICAgICAgIHJldHVybiBTdHJpbmcoYS5uYW1lIHx8IGEuaW1hZ2VSZWYpLmxvY2FsZUNvbXBhcmUoU3RyaW5nKGIubmFtZSB8fCBiLmltYWdlUmVmKSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXRzID0ge1xuICAgICAgICAgICAgICAgIHVuaXF1ZTogZW50cmllcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgcHJvamVjdEZvdW5kOiBlbnRyaWVzLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5zdGF0dXMgPT09ICdwcm9qZWN0JykubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGZpZ21hSW1wb3J0Rm91bmQ6IGVudHJpZXMuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnN0YXR1cyA9PT0gJ2ZpZ21hLWltcG9ydCcpLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBtaXNzaW5nOiBlbnRyaWVzLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5zdGF0dXMgPT09ICdtaXNzaW5nJykubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHByb2plY3RBc3NldHNTY2FubmVkOiBwcm9qZWN0SW5kZXgudG90YWwsXG4gICAgICAgICAgICAgICAgcHJvamVjdEFzc2V0c0hhc2hlZDogcHJvamVjdEluZGV4Lmhhc2hlZCxcbiAgICAgICAgICAgICAgICBwcm9qZWN0QXNzZXRzU2tpcHBlZDogcHJvamVjdEluZGV4LnNraXBwZWQsXG4gICAgICAgICAgICAgICAgaW50ZXJmYWNlQ291bnQ6IHByZXBhcmVkLmludGVyZmFjZUNvdW50LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChvbmx5TWlzc2luZykgZW50cmllcyA9IGVudHJpZXMuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnN0YXR1cyA9PT0gJ21pc3NpbmcnIHx8IGl0ZW0uc3RhdHVzID09PSAnZmlnbWEtaW1wb3J0Jyk7XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOi0tOWbvumihOiniOaJq+aPj+WujOaIkO+8iGJldGHvvInvvJonLCB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgbmFtZTogcHJlcGFyZWQubmFtZSxcbiAgICAgICAgICAgICAgICBzdGF0cyxcbiAgICAgICAgICAgICAgICBzaG93bjogZW50cmllcy5sZW5ndGgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBwcmVwYXJlZC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkLmNhbnZhcyxcbiAgICAgICAgICAgICAgICAgICAgc3RhdHMsXG4gICAgICAgICAgICAgICAgICAgIGVudHJpZXMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW2ZpZ21hLWltcG9ydGVyXSBzY2FuSnNvblRleHR1cmVzQmV0YSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAemggYmV0Ye+8muaPkOWJjeWvvOWFpei0tOWbvumihOiniOmHjOe8uuWkseeahCBGaWdtYSDlm77niYfjgILlpI3nlKjmraPlvI8gbGFuZEltYWdlcyDpk77ot6/vvIzpgb/lhY3lj6botbfotYTkuqflr7zlhaXop4TliJnjgIJcbiAgICAgKi9cbiAgICBhc3luYyBpbXBvcnRNaXNzaW5nVGV4dHVyZXNCZXRhKHByZXNldFBhdGg/OiBzdHJpbmcsIGluY2x1ZGVGaWdtYUltcG9ydEZvdW5kID0gZmFsc2UpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gYXdhaXQgcmVzb2x2ZUpzb25QYXRoRnJvbURpYWxvZyhwcmVzZXRQYXRoLCAn6YCJ5oup55So5LqO5o+Q5YmN5a+85YWl57y65aSx6LS05Zu+55qEIEZpZ21hIEpTT04nKTtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0NhbmNlbGVkJyB9O1xuXG4gICAgICAgICAgICBjb25zdCByYXcgPSByZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UocmF3KSBhcyBGaWdtYUV4cG9ydERhdGE7XG4gICAgICAgICAgICBjb25zdCBwcmVwYXJlZCA9IHByZXBhcmVMb2FkZXJQcmV2aWV3RGF0YShjbG9uZUpzb24oZGF0YSkpO1xuICAgICAgICAgICAgY29uc3Qgc2NhbiA9IGF3YWl0IG1ldGhvZHMuc2Nhbkpzb25UZXh0dXJlc0JldGEoZmlsZVBhdGgsIGZhbHNlLCBmYWxzZSk7XG4gICAgICAgICAgICBpZiAoIXNjYW4gfHwgc2Nhbi5zdWNjZXNzID09PSBmYWxzZSB8fCAhc2Nhbi5kYXRhKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBzY2FuICYmIHNjYW4uZXJyb3IgfHwgJ3NjYW5Kc29uVGV4dHVyZXNCZXRhIGZhaWxlZCcgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGVudHJpZXMgPSAoc2Nhbi5kYXRhLmVudHJpZXMgfHwgW10pLmZpbHRlcigoZW50cnk6IGFueSkgPT5cbiAgICAgICAgICAgICAgICBlbnRyeSAmJiAoZW50cnkuc3RhdHVzID09PSAnbWlzc2luZycgfHwgKGluY2x1ZGVGaWdtYUltcG9ydEZvdW5kICYmIGVudHJ5LnN0YXR1cyA9PT0gJ2ZpZ21hLWltcG9ydCcpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGltYWdlc1RvTGFuZDogeyBbaWQ6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZWYgPSBTdHJpbmcoZW50cnkuaW1hZ2VSZWYgfHwgJycpO1xuICAgICAgICAgICAgICAgIGlmIChyZWYgJiYgZGF0YS5pbWFnZXMgJiYgZGF0YS5pbWFnZXNbcmVmXSkgaW1hZ2VzVG9MYW5kW3JlZl0gPSBkYXRhLmltYWdlc1tyZWZdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGltYWdlc1RvTGFuZCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbXBvcnRlZDogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdObyBtaXNzaW5nIHRleHR1cmVzJyxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBpbWFnZURpbXMgPSBidWlsZEltYWdlRGltZW5zaW9uTWFwKGRhdGEuaW1hZ2VzKTtcbiAgICAgICAgICAgIGNvbnN0IHNwcml0ZUZyYW1lQm9yZGVycyA9IHtcbiAgICAgICAgICAgICAgICAuLi5jb2xsZWN0SW1wbGljaXRTcHJpdGVGcmFtZUJvcmRlcnMocHJlcGFyZWQucm9vdCwgaW1hZ2VEaW1zKS5ib3JkZXJzLFxuICAgICAgICAgICAgICAgIC4uLmNvbGxlY3RTcHJpdGVGcmFtZUJvcmRlcnMocHJlcGFyZWQucm9vdCksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3QgbGFuZGVkID0gYXdhaXQgbGFuZEltYWdlcyhpbWFnZXNUb0xhbmQsIHByZXBhcmVkLm5hbWUgfHwgZGF0YS5uYW1lIHx8ICd1bnRpdGxlZCcsIHNwcml0ZUZyYW1lQm9yZGVycywgYXdhaXQgcmVhZENvbW1vblJlc291cmNlRGlycygpKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOW3suaPkOWJjeWvvOWFpee8uuWksei0tOWbvu+8iGJldGHvvInvvJonLCB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgcmVxdWVzdGVkOiBPYmplY3Qua2V5cyhpbWFnZXNUb0xhbmQpLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBsYW5kZWQ6IE9iamVjdC5rZXlzKGxhbmRlZC5pZFRvU3ByaXRlRnJhbWUpLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBpbmNsdWRlRmlnbWFJbXBvcnRGb3VuZCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgZmlsZVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHByZXBhcmVkLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3RlZDogT2JqZWN0LmtleXMoaW1hZ2VzVG9MYW5kKS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGxhbmRlZDogT2JqZWN0LmtleXMobGFuZGVkLmlkVG9TcHJpdGVGcmFtZSkubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBpZFRvU3ByaXRlRnJhbWU6IGxhbmRlZC5pZFRvU3ByaXRlRnJhbWUsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW2ZpZ21hLWltcG9ydGVyXSBpbXBvcnRNaXNzaW5nVGV4dHVyZXNCZXRhIGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEB6aCBiZXRh77ya5oqKIEpTT04g5Lit5Yy56YWN5Yiw55qE5Y2V5LiqIEZpZ21hIOiKgueCueW6lOeUqOWIsOW9k+WJjemAieS4rSBDb2NvcyDoioLngrnjgIJcbiAgICAgKiAgICAg5a+56b2QIFVuaXR5IEZpZ21hTm9kZVJlcGxhY2VyLkFwcGx577ya5Y+v5YiG5byA5bqU55So5Zu+54mH44CB5paH5a2X44CB5L2N572u77yb5LiN6YeN5ZG95ZCN44CB5LiN6YCS5b2S5pu/5o2i5a2Q6IqC54K544CCXG4gICAgICovXG4gICAgYXN5bmMgYXBwbHlNYXRjaGVkTm9kZVRvU2VsZWN0ZWRCZXRhKFxuICAgICAgICBwcmVzZXRQYXRoPzogc3RyaW5nLFxuICAgICAgICBmaWdtYVBhdGg/OiBzdHJpbmcsXG4gICAgICAgIGZsYWdzPzogUGFydGlhbDxSZXBsYWNlQXBwbHlGbGFncz5cbiAgICApIHtcbiAgICAgICAgY29uc3QgdGFyZ2V0VXVpZCA9IGdldFNlbGVjdGVkTm9kZVV1aWQoKTtcbiAgICAgICAgaWYgKCF0YXJnZXRVdWlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g5bqU55So5Yy56YWN6IqC54K55aSx6LSl77ya6K+35YWI5Zyo5bGC57qn6YeM6YCJ5Lit6KaB5L+u6KGl55qE6IqC54K544CCJyk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBzZWxlY3RlZCB0YXJnZXQgbm9kZScgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGF3YWl0IHJlc29sdmVKc29uUGF0aEZyb21EaWFsb2cocHJlc2V0UGF0aCwgJ+mAieaLqeeUqOS6juW6lOeUqOWIsOmAieS4reiKgueCueeahCBGaWdtYSBKU09OJyk7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdDYW5jZWxlZCcgfTtcblxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdkZXNjcmliZU5vZGVGb3JSZXBsYWNlQmV0YScsIHsgdXVpZDogdGFyZ2V0VXVpZCB9KTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0UmVzdWx0IHx8IHRhcmdldFJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSB8fCAhdGFyZ2V0UmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHRhcmdldFJlc3VsdCAmJiB0YXJnZXRSZXN1bHQuZXJyb3IgfHwgJ2Rlc2NyaWJlTm9kZUZvclJlcGxhY2VCZXRhIGZhaWxlZCcgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRhcmdldFJlc3VsdC5kYXRhIGFzIFJlcGxhY2VUYXJnZXRJbmZvO1xuICAgICAgICAgICAgY29uc3QgcmF3ID0gcmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmLTgnKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKHJhdykgYXMgRmlnbWFFeHBvcnREYXRhO1xuICAgICAgICAgICAgY29uc3QgcHJlcGFyZWRGb3JNYXRjaCA9IHByZXBhcmVJbXBvcnREYXRhKGNsb25lSnNvbihkYXRhKSk7XG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gY29sbGVjdEZpZ21hTm9kZUNhbmRpZGF0ZXMocHJlcGFyZWRGb3JNYXRjaC5yb290KTtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gcGlja0ZpZ21hQ2FuZGlkYXRlRm9yQXBwbHkoY2FuZGlkYXRlcywgdGFyZ2V0LCBmaWdtYVBhdGgpO1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDlupTnlKjljLnphY3oioLngrnlpLHotKXvvJrmib7kuI3liLDlj6/kv6EgRmlnbWEg5YCZ6YCJ44CCJywge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldC5zY2VuZVBhdGggfHwgdGFyZ2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGZpZ21hUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgY2FuZGlkYXRlczogY2FuZGlkYXRlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gbWF0Y2hpbmcgRmlnbWEgbm9kZSBmb3VuZCcgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbWF0Y2hlZE5vZGUgPSBjbG9uZUpzb24oc2VsZWN0ZWQuY2FuZGlkYXRlLm5vZGUpO1xuICAgICAgICAgICAgbWF0Y2hlZE5vZGUueCA9IHNlbGVjdGVkLmNhbmRpZGF0ZS5jYW52YXNYO1xuICAgICAgICAgICAgbWF0Y2hlZE5vZGUueSA9IHNlbGVjdGVkLmNhbmRpZGF0ZS5jYW52YXNZO1xuICAgICAgICAgICAgY29uc3Qgc3ViRGF0YTogRmlnbWFFeHBvcnREYXRhID0ge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IGRhdGEudmVyc2lvbixcbiAgICAgICAgICAgICAgICBuYW1lOiBtYXRjaGVkTm9kZS5uYW1lIHx8IGRhdGEubmFtZSB8fCAnRmlnbWFOb2RlJyxcbiAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkRm9yTWF0Y2guY2FudmFzLFxuICAgICAgICAgICAgICAgIHJvb3Q6IG1hdGNoZWROb2RlLFxuICAgICAgICAgICAgICAgIGltYWdlczogY2xvbmVKc29uKGRhdGEuaW1hZ2VzIHx8IHt9KSxcbiAgICAgICAgICAgICAgICBwcmV2aWV3SW1hZ2VSZWY6IGRhdGEucHJldmlld0ltYWdlUmVmLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByZXBhcmVkUGF5bG9hZCA9IGF3YWl0IHByZXBhcmVTY2VuZVBheWxvYWRGcm9tRGF0YShzdWJEYXRhKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNhbGxTY2VuZSgnYXBwbHlOb2RlUGF0Y2hCZXRhJywge1xuICAgICAgICAgICAgICAgIHRhcmdldFV1aWQsXG4gICAgICAgICAgICAgICAgbm9kZTogcHJlcGFyZWRQYXlsb2FkLnBheWxvYWQucm9vdCxcbiAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkUGF5bG9hZC5wYXlsb2FkLmNhbnZhcyxcbiAgICAgICAgICAgICAgICBpZFRvU3ByaXRlRnJhbWU6IHByZXBhcmVkUGF5bG9hZC5wYXlsb2FkLmlkVG9TcHJpdGVGcmFtZSxcbiAgICAgICAgICAgICAgICBmbGFnczogcmVzb2x2ZVJlcGxhY2VBcHBseUZsYWdzKGZsYWdzKSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdWNjZXNzICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHNhdmVTY2VuZUFmdGVySW1wb3J0KHJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSBhcHBseU5vZGVQYXRjaEJldGEg5pyq5oiQ5Yqf77yM6Lez6L+H6Ieq5Yqo5L+d5a2Y44CCJywgcmVzdWx0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHJlcGFyZWRQYXlsb2FkLnRleHRTdHlsZVRyYWNrZXIucmVwb3J0KCk7XG4gICAgICAgICAgICBwcmVwYXJlZFBheWxvYWQudGV4dFN0eWxlVGVtcGxhdGVUcmFja2VyLnJlcG9ydChwcmVwYXJlZFBheWxvYWQudGV4dFN0eWxlTGliKTtcbiAgICAgICAgICAgIHJlcG9ydEZvbnREZW1hbmQocHJlcGFyZWRQYXlsb2FkLmZvbnRUcmFja2VyKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOW3suW6lOeUqOWMuemFjeiKgueCueWIsOmAieS4reiKgueCue+8iGJldGHvvInvvJonLCB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0OiB0YXJnZXQuc2NlbmVQYXRoIHx8IHRhcmdldC5uYW1lLFxuICAgICAgICAgICAgICAgIGZpZ21hUGF0aDogc2VsZWN0ZWQuY2FuZGlkYXRlLnBhdGgsXG4gICAgICAgICAgICAgICAgc2NvcmU6IHNlbGVjdGVkLnNjb3JlLFxuICAgICAgICAgICAgICAgIHJlYXNvbjogc2VsZWN0ZWQucmVhc29uLFxuICAgICAgICAgICAgICAgIGZsYWdzOiByZXNvbHZlUmVwbGFjZUFwcGx5RmxhZ3MoZmxhZ3MpLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIG1hdGNoOiB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0LnNjZW5lUGF0aCB8fCB0YXJnZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZmlnbWFQYXRoOiBzZWxlY3RlZC5jYW5kaWRhdGUucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2NvcmU6IHNlbGVjdGVkLnNjb3JlLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IHNlbGVjdGVkLnJlYXNvbixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbZmlnbWEtaW1wb3J0ZXJdIGFwcGx5TWF0Y2hlZE5vZGVUb1NlbGVjdGVkQmV0YSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAemggYmV0Ye+8muaNleiOt+aMh+Wumuabv+aNouebruagh+eahOWOn+Wni+eKtuaAge+8jOS+myBSZXNvdXJjZVJlcGxhY2Ug5Y2V6KGM6L+Y5Y6f5L2/55So44CCXG4gICAgICovXG4gICAgYXN5bmMgc25hcHNob3RSZXBsYWNlVGFyZ2V0QmV0YSh0YXJnZXRVdWlkPzogc3RyaW5nKSB7XG4gICAgICAgIGlmICghdGFyZ2V0VXVpZCkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOebruagh+W/q+eFp+Wksei0pe+8mue8uuWwkSB0YXJnZXRVdWlk44CCJyk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdNaXNzaW5nIHRhcmdldFV1aWQnIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNhbGxTY2VuZSgnc25hcHNob3RSZXBsYWNlVGFyZ2V0QmV0YScsIHsgdXVpZDogdGFyZ2V0VXVpZCB9KTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0ICYmIHJlc3VsdC5lcnJvciB8fCAnc25hcHNob3RSZXBsYWNlVGFyZ2V0QmV0YSBmYWlsZWQnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWdtYS1pbXBvcnRlcl0gc25hcHNob3RSZXBsYWNlVGFyZ2V0QmV0YSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAemggYmV0Ye+8muaKiuWNleihjOabv+aNouebruagh+aBouWkjeWIsOatpOWJjeaNleiOt+eahCBzbmFwc2hvdO+8jOW5tuiHquWKqOS/neWtmOWIt+aWsOWcuuaZr+OAglxuICAgICAqL1xuICAgIGFzeW5jIHJlc3RvcmVSZXBsYWNlVGFyZ2V0QmV0YShzbmFwc2hvdE9yUGF5bG9hZD86IGFueSkge1xuICAgICAgICBjb25zdCBzbmFwc2hvdCA9IHNuYXBzaG90T3JQYXlsb2FkICYmIChzbmFwc2hvdE9yUGF5bG9hZC5zbmFwc2hvdCB8fCBzbmFwc2hvdE9yUGF5bG9hZCk7XG4gICAgICAgIGNvbnN0IHNob3VsZFNhdmUgPSAhc25hcHNob3RPclBheWxvYWQgfHwgc25hcHNob3RPclBheWxvYWQuc2F2ZSAhPT0gZmFsc2U7XG4gICAgICAgIGlmICghc25hcHNob3QgfHwgIXNuYXBzaG90LnV1aWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDnm67moIfov5jljp/lpLHotKXvvJrnvLrlsJEgc25hcHNob3TjgIInKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ01pc3Npbmcgc25hcHNob3QnIH07XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNhbGxTY2VuZSgncmVzdG9yZVJlcGxhY2VUYXJnZXRCZXRhJywgeyBzbmFwc2hvdCB9KTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN1Y2Nlc3MgIT09IGZhbHNlICYmIHNob3VsZFNhdmUpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCBzYXZlU2NlbmVBZnRlckltcG9ydChyZXN1bHQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghcmVzdWx0IHx8IHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSByZXN0b3JlUmVwbGFjZVRhcmdldEJldGEg5pyq5oiQ5Yqf77yM6Lez6L+H6Ieq5Yqo5L+d5a2Y44CCJywgcmVzdWx0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW2ZpZ21hLWltcG9ydGVyXSByZXN0b3JlUmVwbGFjZVRhcmdldEJldGEgZmFpbGVkOicsIGVycik7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHpoIGJldGHvvJrlnKggSGllcmFyY2h5IOS4reWumuS9jeW5tumAieS4reaMh+Wumuabv+aNouebruagh+OAglxuICAgICAqL1xuICAgIGFzeW5jIHNlbGVjdFJlcGxhY2VUYXJnZXRCZXRhKHRhcmdldFV1aWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgaWYgKCF0YXJnZXRVdWlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g5a6a5L2N5pu/5o2i55uu5qCH5aSx6LSl77ya57y65bCRIHRhcmdldFV1aWTjgIInKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ01pc3NpbmcgdGFyZ2V0VXVpZCcgfTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdzZWxlY3RSZXBsYWNlVGFyZ2V0QmV0YScsIHsgdXVpZDogdGFyZ2V0VXVpZCB9KTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0ICYmIHJlc3VsdC5lcnJvciB8fCAnc2VsZWN0UmVwbGFjZVRhcmdldEJldGEgZmFpbGVkJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbZmlnbWEtaW1wb3J0ZXJdIHNlbGVjdFJlcGxhY2VUYXJnZXRCZXRhIGZhaWxlZDonLCBlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyKSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEB6aCBiZXRh77ya6Z2i5p2/6YCQ6KGM5bqU55So44CC5oyJIHRhcmdldFV1aWQg5oyH5a6aIENvY29zIOebruagh++8jOaMiSBmaWdtYVBhdGgv6Ieq5Yqo5Yy56YWN5oyH5a6a5rqQ6IqC54K544CCXG4gICAgICogICAgIOS4jiBhcHBseU1hdGNoZWROb2RlVG9TZWxlY3RlZEJldGEg5ZCM5LiA5p2hIHNjZW5lIGFwcGx5Tm9kZVBhdGNoQmV0YSDpk77ot6/vvIzkvYbkuI3kvp3otZblvZPliY3pgInkuK3jgIJcbiAgICAgKi9cbiAgICBhc3luYyBhcHBseUpzb25Ob2RlVG9UYXJnZXRCZXRhKFxuICAgICAgICBwcmVzZXRQYXRoPzogc3RyaW5nLFxuICAgICAgICB0YXJnZXRVdWlkPzogc3RyaW5nLFxuICAgICAgICBmaWdtYVBhdGg/OiBzdHJpbmcsXG4gICAgICAgIGZsYWdzPzogUGFydGlhbDxSZXBsYWNlQXBwbHlGbGFncz5cbiAgICApIHtcbiAgICAgICAgaWYgKCF0YXJnZXRVdWlkKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g6YCQ6KGM5bqU55So5aSx6LSl77ya57y65bCRIHRhcmdldFV1aWTjgIInKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ01pc3NpbmcgdGFyZ2V0VXVpZCcgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGF3YWl0IHJlc29sdmVKc29uUGF0aEZyb21EaWFsb2cocHJlc2V0UGF0aCwgJ+mAieaLqeeUqOS6juW6lOeUqOWIsOebruagh+iKgueCueeahCBGaWdtYSBKU09OJyk7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdDYW5jZWxlZCcgfTtcblxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdkZXNjcmliZU5vZGVGb3JSZXBsYWNlQmV0YScsIHsgdXVpZDogdGFyZ2V0VXVpZCB9KTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0UmVzdWx0IHx8IHRhcmdldFJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSB8fCAhdGFyZ2V0UmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHRhcmdldFJlc3VsdCAmJiB0YXJnZXRSZXN1bHQuZXJyb3IgfHwgJ2Rlc2NyaWJlTm9kZUZvclJlcGxhY2VCZXRhIGZhaWxlZCcgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IHRhcmdldFJlc3VsdC5kYXRhIGFzIFJlcGxhY2VUYXJnZXRJbmZvO1xuICAgICAgICAgICAgY29uc3QgcmF3ID0gcmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmLTgnKTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKHJhdykgYXMgRmlnbWFFeHBvcnREYXRhO1xuICAgICAgICAgICAgY29uc3QgcHJlcGFyZWRGb3JNYXRjaCA9IHByZXBhcmVJbXBvcnREYXRhKGNsb25lSnNvbihkYXRhKSk7XG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gY29sbGVjdEZpZ21hTm9kZUNhbmRpZGF0ZXMocHJlcGFyZWRGb3JNYXRjaC5yb290KTtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gcGlja0ZpZ21hQ2FuZGlkYXRlRm9yQXBwbHkoY2FuZGlkYXRlcywgdGFyZ2V0LCBmaWdtYVBhdGgpO1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDpgJDooYzlupTnlKjlpLHotKXvvJrmib7kuI3liLDlj6/kv6EgRmlnbWEg5YCZ6YCJ44CCJywge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IHRhcmdldC5zY2VuZVBhdGggfHwgdGFyZ2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFV1aWQsXG4gICAgICAgICAgICAgICAgICAgIGZpZ21hUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgY2FuZGlkYXRlczogY2FuZGlkYXRlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gbWF0Y2hpbmcgRmlnbWEgbm9kZSBmb3VuZCcgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbWF0Y2hlZE5vZGUgPSBjbG9uZUpzb24oc2VsZWN0ZWQuY2FuZGlkYXRlLm5vZGUpO1xuICAgICAgICAgICAgbWF0Y2hlZE5vZGUueCA9IHNlbGVjdGVkLmNhbmRpZGF0ZS5jYW52YXNYO1xuICAgICAgICAgICAgbWF0Y2hlZE5vZGUueSA9IHNlbGVjdGVkLmNhbmRpZGF0ZS5jYW52YXNZO1xuICAgICAgICAgICAgY29uc3Qgc3ViRGF0YTogRmlnbWFFeHBvcnREYXRhID0ge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IGRhdGEudmVyc2lvbixcbiAgICAgICAgICAgICAgICBuYW1lOiBtYXRjaGVkTm9kZS5uYW1lIHx8IGRhdGEubmFtZSB8fCAnRmlnbWFOb2RlJyxcbiAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkRm9yTWF0Y2guY2FudmFzLFxuICAgICAgICAgICAgICAgIHJvb3Q6IG1hdGNoZWROb2RlLFxuICAgICAgICAgICAgICAgIGltYWdlczogY2xvbmVKc29uKGRhdGEuaW1hZ2VzIHx8IHt9KSxcbiAgICAgICAgICAgICAgICBwcmV2aWV3SW1hZ2VSZWY6IGRhdGEucHJldmlld0ltYWdlUmVmLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHByZXBhcmVkUGF5bG9hZCA9IGF3YWl0IHByZXBhcmVTY2VuZVBheWxvYWRGcm9tRGF0YShzdWJEYXRhKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNhbGxTY2VuZSgnYXBwbHlOb2RlUGF0Y2hCZXRhJywge1xuICAgICAgICAgICAgICAgIHRhcmdldFV1aWQsXG4gICAgICAgICAgICAgICAgbm9kZTogcHJlcGFyZWRQYXlsb2FkLnBheWxvYWQucm9vdCxcbiAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkUGF5bG9hZC5wYXlsb2FkLmNhbnZhcyxcbiAgICAgICAgICAgICAgICBpZFRvU3ByaXRlRnJhbWU6IHByZXBhcmVkUGF5bG9hZC5wYXlsb2FkLmlkVG9TcHJpdGVGcmFtZSxcbiAgICAgICAgICAgICAgICBmbGFnczogcmVzb2x2ZVJlcGxhY2VBcHBseUZsYWdzKGZsYWdzKSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdWNjZXNzICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHNhdmVTY2VuZUFmdGVySW1wb3J0KHJlc3VsdCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDpgJDooYwgYXBwbHlOb2RlUGF0Y2hCZXRhIOacquaIkOWKn++8jOi3s+i/h+iHquWKqOS/neWtmOOAgicsIHJlc3VsdCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHByZXBhcmVkUGF5bG9hZC50ZXh0U3R5bGVUcmFja2VyLnJlcG9ydCgpO1xuICAgICAgICAgICAgcHJlcGFyZWRQYXlsb2FkLnRleHRTdHlsZVRlbXBsYXRlVHJhY2tlci5yZXBvcnQocHJlcGFyZWRQYXlsb2FkLnRleHRTdHlsZUxpYik7XG4gICAgICAgICAgICByZXBvcnRGb250RGVtYW5kKHByZXBhcmVkUGF5bG9hZC5mb250VHJhY2tlcik7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW2ZpZ21hLWltcG9ydGVyXSDlt7LpgJDooYzlupTnlKggSlNPTiDoioLngrnliLDnm67moIfvvIhiZXRh77yJ77yaJywge1xuICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0LnNjZW5lUGF0aCB8fCB0YXJnZXQubmFtZSxcbiAgICAgICAgICAgICAgICB0YXJnZXRVdWlkLFxuICAgICAgICAgICAgICAgIGZpZ21hUGF0aDogc2VsZWN0ZWQuY2FuZGlkYXRlLnBhdGgsXG4gICAgICAgICAgICAgICAgc2NvcmU6IHNlbGVjdGVkLnNjb3JlLFxuICAgICAgICAgICAgICAgIHJlYXNvbjogc2VsZWN0ZWQucmVhc29uLFxuICAgICAgICAgICAgICAgIGZsYWdzOiByZXNvbHZlUmVwbGFjZUFwcGx5RmxhZ3MoZmxhZ3MpLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIG1hdGNoOiB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0LnNjZW5lUGF0aCB8fCB0YXJnZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgZmlnbWFQYXRoOiBzZWxlY3RlZC5jYW5kaWRhdGUucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2NvcmU6IHNlbGVjdGVkLnNjb3JlLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IHNlbGVjdGVkLnJlYXNvbixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbZmlnbWEtaW1wb3J0ZXJdIGFwcGx5SnNvbk5vZGVUb1RhcmdldEJldGEgZmFpbGVkOicsIGVycik7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHpoIGJldGHvvJrmioogSlNPTiDkuK3oh6rliqjljLnphY3liLDnmoTlpJrkuKogRmlnbWEg6IqC54K55om56YeP5bqU55So5Yiw6YCJ5LitL+acgOi/keWvvOWFpeagueS4i+eahOebruagh+e7hOS7tuOAglxuICAgICAqICAgICDlr7npvZAgVW5pdHkgUmVzb3VyY2VSZXBsYWNlV2luZG93IOeahOKAnOaMieihjOWLvumAieWQjuaJuemHj+W6lOeUqOKAneaguOW/g+iDveWKm++8m+m7mOiupOWPquW6lOeUqOWPr+S/oeWMuemFjeOAglxuICAgICAqL1xuICAgIGFzeW5jIGFwcGx5TWF0Y2hlZE5vZGVzVG9TZWxlY3RlZFJvb3RCZXRhKFxuICAgICAgICBwcmVzZXRQYXRoPzogc3RyaW5nLFxuICAgICAgICBvcHRpb25zPzogQmF0Y2hSZXBsYWNlQXBwbHlPcHRpb25zXG4gICAgKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IHJlc29sdmVCYXRjaEFwcGx5T3B0aW9ucyhvcHRpb25zKTtcbiAgICAgICAgICAgIGNvbnN0IHJvb3RVdWlkID0gcmVzb2x2ZWQucm9vdFV1aWQgfHwgZ2V0U2VsZWN0ZWROb2RlVXVpZCgpIHx8IGxhc3RJbXBvcnRlZFJvb3RVdWlkO1xuICAgICAgICAgICAgaWYgKCFyb290VXVpZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDmibnph4/lupTnlKjlpLHotKXvvJror7flhYjpgInkuK3opoHkvZzkuLrnm67moIfnmoQgVUkg5qC56IqC54K544CCJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gc2VsZWN0ZWQgdGFyZ2V0IHJvb3QnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gYXdhaXQgcmVzb2x2ZUpzb25QYXRoRnJvbURpYWxvZyhwcmVzZXRQYXRoLCAn6YCJ5oup55So5LqO5om56YeP5bqU55So55qEIEZpZ21hIEpTT04nKTtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0NhbmNlbGVkJyB9O1xuXG4gICAgICAgICAgICBjb25zdCByYXcgPSByZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UocmF3KSBhcyBGaWdtYUV4cG9ydERhdGE7XG4gICAgICAgICAgICBjb25zdCBwcmVwYXJlZEZvck1hdGNoID0gcHJlcGFyZUltcG9ydERhdGEoY2xvbmVKc29uKGRhdGEpKTtcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2xsZWN0RmlnbWFOb2RlQ2FuZGlkYXRlcyhwcmVwYXJlZEZvck1hdGNoLnJvb3QpO1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdsaXN0UmVwbGFjZVRhcmdldHNCZXRhJywge1xuICAgICAgICAgICAgICAgIHJvb3RVdWlkLFxuICAgICAgICAgICAgICAgIGtpbmQ6IHJlc29sdmVkLmtpbmQsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0UmVzdWx0IHx8IHRhcmdldFJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSB8fCAhdGFyZ2V0UmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g5om56YeP5bqU55So5aSx6LSl77ya5peg5rOV6K+75Y+W55uu5qCH5a6e5L6L5qCR44CCJywgdGFyZ2V0UmVzdWx0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHRhcmdldFJlc3VsdCAmJiB0YXJnZXRSZXN1bHQuZXJyb3IgfHwgJ2xpc3RSZXBsYWNlVGFyZ2V0c0JldGEgZmFpbGVkJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRzID0gKCh0YXJnZXRSZXN1bHQuZGF0YS50YXJnZXRzIHx8IFtdKSBhcyBSZXBsYWNlVGFyZ2V0SW5mb1tdKVxuICAgICAgICAgICAgICAgIC5zbGljZSgwLCByZXNvbHZlZC5saW1pdCA+IDAgPyByZXNvbHZlZC5saW1pdCA6IHVuZGVmaW5lZCk7XG4gICAgICAgICAgICBjb25zdCBwbGFubmVkOiBhbnlbXSA9IFtdO1xuICAgICAgICAgICAgY29uc3Qgc2tpcHBlZDogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdGFyZ2V0IG9mIHRhcmdldHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9IHBpY2tGaWdtYUNhbmRpZGF0ZUZvckFwcGx5KGNhbmRpZGF0ZXMsIHRhcmdldCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgICAgICBza2lwcGVkLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiB0YXJnZXQucmVsYXRpdmVQYXRoIHx8IHRhcmdldC5zY2VuZVBhdGggfHwgdGFyZ2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBraW5kOiB0YXJnZXQucmVwbGFjZUtpbmQsXG4gICAgICAgICAgICAgICAgICAgICAgICByZWFzb246ICduby1tYXRjaCcsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNlbGVjdGVkLnNjb3JlIDwgcmVzb2x2ZWQubWluU2NvcmUpIHtcbiAgICAgICAgICAgICAgICAgICAgc2tpcHBlZC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldDogdGFyZ2V0LnJlbGF0aXZlUGF0aCB8fCB0YXJnZXQuc2NlbmVQYXRoIHx8IHRhcmdldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAga2luZDogdGFyZ2V0LnJlcGxhY2VLaW5kLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcmU6IHNlbGVjdGVkLnNjb3JlLFxuICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBzZWxlY3RlZC5jYW5kaWRhdGUucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlYXNvbjogJ3dlYWstbWF0Y2gnLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBsYW5uZWQucHVzaCh7IHRhcmdldCwgc2VsZWN0ZWQgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZXNvbHZlZC5kcnlSdW4pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdW1tYXJ5ID0ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBkcnlSdW46IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxuICAgICAgICAgICAgICAgICAgICByb290VXVpZDogdGFyZ2V0UmVzdWx0LmRhdGEucm9vdFV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHJvb3ROYW1lOiB0YXJnZXRSZXN1bHQuZGF0YS5yb290TmFtZSxcbiAgICAgICAgICAgICAgICAgICAga2luZDogcmVzb2x2ZWQua2luZCxcbiAgICAgICAgICAgICAgICAgICAgbWluU2NvcmU6IHJlc29sdmVkLm1pblNjb3JlLFxuICAgICAgICAgICAgICAgICAgICBmbGFnczogcmVzb2x2ZWQuZmxhZ3MsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHM6IHRhcmdldHMubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBwbGFubmVkOiBwbGFubmVkLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgc2tpcHBlZDogc2tpcHBlZC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHBsYW46IHBsYW5uZWQubWFwKChpdGVtKSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiBpdGVtLnRhcmdldC5yZWxhdGl2ZVBhdGggfHwgaXRlbS50YXJnZXQuc2NlbmVQYXRoIHx8IGl0ZW0udGFyZ2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBraW5kOiBpdGVtLnRhcmdldC5yZXBsYWNlS2luZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3JlOiBpdGVtLnNlbGVjdGVkLnNjb3JlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVhc29uOiBpdGVtLnNlbGVjdGVkLnJlYXNvbixcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogc3VtbWFyaXplRmlnbWFDYW5kaWRhdGUoaXRlbS5zZWxlY3RlZC5jYW5kaWRhdGUpLFxuICAgICAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAgICAgIHNraXBwZWREZXRhaWxzOiBza2lwcGVkLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ1tmaWdtYS1pbXBvcnRlcl0g5om56YeP5bqU55SoIGRyeVJ1bu+8iGJldGHvvInvvJonLCBzdW1tYXJ5KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc3VtbWFyeTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHBsYW5uZWQubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOaJuemHj+W6lOeUqOayoeacieaJvuWIsOWPr+W6lOeUqOeahOWPr+S/oeWMuemFjeOAgicsIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0czogdGFyZ2V0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHNraXBwZWQ6IHNraXBwZWQubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBtaW5TY29yZTogcmVzb2x2ZWQubWluU2NvcmUsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yOiAnTm8gY29uZmlkZW50IG1hdGNoZXMnLFxuICAgICAgICAgICAgICAgICAgICByb290VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0czogdGFyZ2V0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHNraXBwZWQsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgcHJlcGFyZWRQYXlsb2FkID0gYXdhaXQgcHJlcGFyZVNjZW5lUGF5bG9hZEZyb21EYXRhKGNsb25lSnNvbihkYXRhKSk7XG4gICAgICAgICAgICBjb25zdCBzbGltQnlQYXRoID0gY29sbGVjdFNsaW1Ob2Rlc0J5RmlnbWFQYXRoKHByZXBhcmVkUGF5bG9hZC5wYXlsb2FkLnJvb3QpO1xuICAgICAgICAgICAgY29uc3QgYXBwbGllZDogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IGZhaWxlZDogYW55W10gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBwbGFubmVkKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcGF0Y2hOb2RlID0gbWFrZVBhdGNoTm9kZUZvckNhbmRpZGF0ZShzbGltQnlQYXRoLCBpdGVtLnNlbGVjdGVkKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjYWxsU2NlbmUoJ2FwcGx5Tm9kZVBhdGNoQmV0YScsIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0VXVpZDogaXRlbS50YXJnZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbm9kZTogcGF0Y2hOb2RlLFxuICAgICAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkUGF5bG9hZC5wYXlsb2FkLmNhbnZhcyxcbiAgICAgICAgICAgICAgICAgICAgaWRUb1Nwcml0ZUZyYW1lOiBwcmVwYXJlZFBheWxvYWQucGF5bG9hZC5pZFRvU3ByaXRlRnJhbWUsXG4gICAgICAgICAgICAgICAgICAgIGZsYWdzOiByZXNvbHZlZC5mbGFncyxcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBkZXRhaWwgPSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldDogaXRlbS50YXJnZXQucmVsYXRpdmVQYXRoIHx8IGl0ZW0udGFyZ2V0LnNjZW5lUGF0aCB8fCBpdGVtLnRhcmdldC5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRVdWlkOiBpdGVtLnRhcmdldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICBraW5kOiBpdGVtLnRhcmdldC5yZXBsYWNlS2luZCxcbiAgICAgICAgICAgICAgICAgICAgc2NvcmU6IGl0ZW0uc2VsZWN0ZWQuc2NvcmUsXG4gICAgICAgICAgICAgICAgICAgIHJlYXNvbjogaXRlbS5zZWxlY3RlZC5yZWFzb24sXG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZTogaXRlbS5zZWxlY3RlZC5jYW5kaWRhdGUucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0OiByZXN1bHQgJiYgcmVzdWx0LmRhdGEgPyByZXN1bHQuZGF0YSA6IHJlc3VsdCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN1Y2Nlc3MgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGFwcGxpZWQucHVzaChkZXRhaWwpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGZhaWxlZC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC4uLmRldGFpbCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiByZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICdhcHBseU5vZGVQYXRjaEJldGEgZmFpbGVkJyxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYXBwbGllZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgc2F2ZVNjZW5lQWZ0ZXJJbXBvcnQoe1xuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICByb290VXVpZDogdGFyZ2V0UmVzdWx0LmRhdGEucm9vdFV1aWQgfHwgcm9vdFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICByb290TmFtZTogdGFyZ2V0UmVzdWx0LmRhdGEucm9vdE5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBiYXRjaEFwcGxpZWQ6IGFwcGxpZWQubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICAgICAgYmF0Y2hGYWlsZWQ6IGZhaWxlZC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBiYXRjaFNraXBwZWQ6IHNraXBwZWQubGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwcmVwYXJlZFBheWxvYWQudGV4dFN0eWxlVHJhY2tlci5yZXBvcnQoKTtcbiAgICAgICAgICAgIHByZXBhcmVkUGF5bG9hZC50ZXh0U3R5bGVUZW1wbGF0ZVRyYWNrZXIucmVwb3J0KHByZXBhcmVkUGF5bG9hZC50ZXh0U3R5bGVMaWIpO1xuICAgICAgICAgICAgcmVwb3J0Rm9udERlbWFuZChwcmVwYXJlZFBheWxvYWQuZm9udFRyYWNrZXIpO1xuICAgICAgICAgICAgY29uc3Qgc3VtbWFyeSA9IHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiBhcHBsaWVkLmxlbmd0aCA+IDAgJiYgZmFpbGVkLmxlbmd0aCA9PT0gMCxcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgICAgICAgICByb290VXVpZDogdGFyZ2V0UmVzdWx0LmRhdGEucm9vdFV1aWQgfHwgcm9vdFV1aWQsXG4gICAgICAgICAgICAgICAgcm9vdE5hbWU6IHRhcmdldFJlc3VsdC5kYXRhLnJvb3ROYW1lLFxuICAgICAgICAgICAgICAgIGtpbmQ6IHJlc29sdmVkLmtpbmQsXG4gICAgICAgICAgICAgICAgbWluU2NvcmU6IHJlc29sdmVkLm1pblNjb3JlLFxuICAgICAgICAgICAgICAgIGZsYWdzOiByZXNvbHZlZC5mbGFncyxcbiAgICAgICAgICAgICAgICB0YXJnZXRTdGF0czogdGFyZ2V0UmVzdWx0LmRhdGEuc3RhdHMsXG4gICAgICAgICAgICAgICAgdGFyZ2V0czogdGFyZ2V0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgcGxhbm5lZDogcGxhbm5lZC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgYXBwbGllZDogYXBwbGllZC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgZmFpbGVkOiBmYWlsZWQubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHNraXBwZWQ6IHNraXBwZWQubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGFwcGxpZWREZXRhaWxzOiBhcHBsaWVkLFxuICAgICAgICAgICAgICAgIGZhaWxlZERldGFpbHM6IGZhaWxlZCxcbiAgICAgICAgICAgICAgICBza2lwcGVkRGV0YWlsczogc2tpcHBlZCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW2ZpZ21hLWltcG9ydGVyXSDmibnph4/lupTnlKggSlNPTiDoh6rliqjljLnphY3lrozmiJDvvIhiZXRh77yJ77yaJywge1xuICAgICAgICAgICAgICAgIHJvb3Q6IHN1bW1hcnkucm9vdE5hbWUsXG4gICAgICAgICAgICAgICAgdGFyZ2V0U3RhdHM6IHN1bW1hcnkudGFyZ2V0U3RhdHMsXG4gICAgICAgICAgICAgICAgdGFyZ2V0czogc3VtbWFyeS50YXJnZXRzLFxuICAgICAgICAgICAgICAgIHBsYW5uZWQ6IHN1bW1hcnkucGxhbm5lZCxcbiAgICAgICAgICAgICAgICBhcHBsaWVkOiBzdW1tYXJ5LmFwcGxpZWQsXG4gICAgICAgICAgICAgICAgZmFpbGVkOiBzdW1tYXJ5LmZhaWxlZCxcbiAgICAgICAgICAgICAgICBza2lwcGVkOiBzdW1tYXJ5LnNraXBwZWQsXG4gICAgICAgICAgICAgICAgdG9wOiBhcHBsaWVkLnNsaWNlKDAsIDgpLm1hcCgoaXRlbSkgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiBpdGVtLnRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAga2luZDogaXRlbS5raW5kLFxuICAgICAgICAgICAgICAgICAgICBzY29yZTogaXRlbS5zY29yZSxcbiAgICAgICAgICAgICAgICAgICAgc291cmNlOiBpdGVtLnNvdXJjZSxcbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBzdW1tYXJ5O1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWdtYS1pbXBvcnRlcl0gYXBwbHlNYXRjaGVkTm9kZXNUb1NlbGVjdGVkUm9vdEJldGEgZmFpbGVkOicsIGVycik7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHpoIGJldGHvvJrku44gSlNPTiDkuK3mib7liLDljLnphY3nmoQgRmlnbWEg6IqC54K577yM5bm25oqK5a6M5pW05a2Q5qCR5oyC5Yiw5b2T5YmN6YCJ5Lit6IqC54K55LiL44CCXG4gICAgICogICAgIOWvuem9kCBVbml0eSBGaWdtYU5vZGVSZXBsYWNlci5BdHRhY2hBc0NoaWxk77ya6YCS5b2S5Yib5bu65a2Q5qCR77yM5LiN6KaG55uW54i26IqC54K544CCXG4gICAgICovXG4gICAgYXN5bmMgYXR0YWNoTWF0Y2hlZE5vZGVBc0NoaWxkQmV0YShcbiAgICAgICAgcHJlc2V0UGF0aD86IHN0cmluZyxcbiAgICAgICAgZmlnbWFQYXRoPzogc3RyaW5nLFxuICAgICAgICBvcHRpb25zPzogeyBwYXJlbnRVdWlkPzogc3RyaW5nOyBzaWJsaW5nSW5kZXg/OiBudW1iZXIgfVxuICAgICkge1xuICAgICAgICBjb25zdCBwYXJlbnRVdWlkID0gb3B0aW9ucyAmJiBvcHRpb25zLnBhcmVudFV1aWQgfHwgZ2V0U2VsZWN0ZWROb2RlVXVpZCgpO1xuICAgICAgICBpZiAoIXBhcmVudFV1aWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDmjILovb3ljLnphY3oioLngrnlpLHotKXvvJror7flhYjlnKjlsYLnuqfph4zpgInkuK3niLboioLngrnjgIInKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIHNlbGVjdGVkIHBhcmVudCBub2RlJyB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gYXdhaXQgcmVzb2x2ZUpzb25QYXRoRnJvbURpYWxvZyhwcmVzZXRQYXRoLCAn6YCJ5oup55So5LqO5oyC6L295a2Q6IqC54K555qEIEZpZ21hIEpTT04nKTtcbiAgICAgICAgICAgIGlmICghZmlsZVBhdGgpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0NhbmNlbGVkJyB9O1xuXG4gICAgICAgICAgICBjb25zdCBwYXJlbnRSZXN1bHQgPSBhd2FpdCBjYWxsU2NlbmUoJ2Rlc2NyaWJlTm9kZUZvclJlcGxhY2VCZXRhJywgeyB1dWlkOiBwYXJlbnRVdWlkIH0pO1xuICAgICAgICAgICAgaWYgKCFwYXJlbnRSZXN1bHQgfHwgcGFyZW50UmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlIHx8ICFwYXJlbnRSZXN1bHQuZGF0YSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcGFyZW50UmVzdWx0ICYmIHBhcmVudFJlc3VsdC5lcnJvciB8fCAnZGVzY3JpYmVOb2RlRm9yUmVwbGFjZUJldGEgZmFpbGVkJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcGFyZW50VGFyZ2V0ID0gcGFyZW50UmVzdWx0LmRhdGEgYXMgUmVwbGFjZVRhcmdldEluZm87XG4gICAgICAgICAgICBjb25zdCByYXcgPSByZWFkRmlsZVN5bmMoZmlsZVBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UocmF3KSBhcyBGaWdtYUV4cG9ydERhdGE7XG4gICAgICAgICAgICBjb25zdCBwcmVwYXJlZEZvck1hdGNoID0gcHJlcGFyZUltcG9ydERhdGEoY2xvbmVKc29uKGRhdGEpKTtcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2xsZWN0RmlnbWFOb2RlQ2FuZGlkYXRlcyhwcmVwYXJlZEZvck1hdGNoLnJvb3QpO1xuICAgICAgICAgICAgbGV0IHNlbGVjdGVkID0gc2VsZWN0QmVzdEZpZ21hTm9kZUNhbmRpZGF0ZShjYW5kaWRhdGVzLCBwYXJlbnRUYXJnZXQsIGZpZ21hUGF0aCk7XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkICYmICFmaWdtYVBhdGgpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0b3AgPSBsaXN0QmVzdEZpZ21hTm9kZUNhbmRpZGF0ZXMoY2FuZGlkYXRlcywgcGFyZW50VGFyZ2V0LCAxKVswXTtcbiAgICAgICAgICAgICAgICBpZiAodG9wICYmIHRvcC5zY29yZSA+PSAyMjApIHNlbGVjdGVkID0gdG9wO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDmjILovb3ljLnphY3oioLngrnlpLHotKXvvJrmib7kuI3liLAgRmlnbWEg5YCZ6YCJ44CCJywge1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IHBhcmVudFRhcmdldC5zY2VuZVBhdGggfHwgcGFyZW50VGFyZ2V0Lm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGZpZ21hUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgY2FuZGlkYXRlczogY2FuZGlkYXRlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gbWF0Y2hpbmcgRmlnbWEgbm9kZSBmb3VuZCcgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbWF0Y2hlZE5vZGUgPSBjbG9uZUpzb24oc2VsZWN0ZWQuY2FuZGlkYXRlLm5vZGUpO1xuICAgICAgICAgICAgY29uc3Qgc3ViRGF0YTogRmlnbWFFeHBvcnREYXRhID0ge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IGRhdGEudmVyc2lvbixcbiAgICAgICAgICAgICAgICBuYW1lOiBtYXRjaGVkTm9kZS5uYW1lIHx8IGRhdGEubmFtZSB8fCAnRmlnbWFOb2RlJyxcbiAgICAgICAgICAgICAgICBjYW52YXM6IHByZXBhcmVkRm9yTWF0Y2guY2FudmFzLFxuICAgICAgICAgICAgICAgIHJvb3Q6IG1hdGNoZWROb2RlLFxuICAgICAgICAgICAgICAgIGltYWdlczogY2xvbmVKc29uKGRhdGEuaW1hZ2VzIHx8IHt9KSxcbiAgICAgICAgICAgICAgICBwcmV2aWV3SW1hZ2VSZWY6IGRhdGEucHJldmlld0ltYWdlUmVmLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGF3YWl0IGVuc3VyZUNvbXBvbmVudFN0YXRlUnVudGltZUJlc3RFZmZvcnQoKTtcbiAgICAgICAgICAgIGNvbnN0IHByZXBhcmVkUGF5bG9hZCA9IGF3YWl0IHByZXBhcmVTY2VuZVBheWxvYWRGcm9tRGF0YShzdWJEYXRhKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNhbGxTY2VuZSgnYnVpbGRUcmVlJywge1xuICAgICAgICAgICAgICAgIC4uLnByZXBhcmVkUGF5bG9hZC5wYXlsb2FkLFxuICAgICAgICAgICAgICAgIHBhcmVudFV1aWQsXG4gICAgICAgICAgICAgICAgc2libGluZ0luZGV4OiBvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLnNpYmxpbmdJbmRleCA9PT0gJ251bWJlcicgPyBvcHRpb25zLnNpYmxpbmdJbmRleCA6IC0xLFxuICAgICAgICAgICAgICAgIHJvb3RDYW52YXNBYnNvbHV0ZToge1xuICAgICAgICAgICAgICAgICAgICB4OiBzZWxlY3RlZC5jYW5kaWRhdGUuY2FudmFzWCxcbiAgICAgICAgICAgICAgICAgICAgeTogc2VsZWN0ZWQuY2FuZGlkYXRlLmNhbnZhc1ksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tmaWdtYS1pbXBvcnRlcl0gYXR0YWNoTWF0Y2hlZE5vZGVBc0NoaWxkQmV0YSByZXN1bHQ6JywgcmVzdWx0KTtcblxuICAgICAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQuc3VjY2VzcyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICBsYXN0SW1wb3J0ZWRKc29uRm9yUHVsbCA9IEpTT04uc3RyaW5naWZ5KHN1YkRhdGEsIG51bGwsIDQpO1xuICAgICAgICAgICAgICAgIGxhc3RJbXBvcnRlZE5hbWVGb3JQdWxsID0gbWF0Y2hlZE5vZGUubmFtZSB8fCBkYXRhLm5hbWUgfHwgJyc7XG4gICAgICAgICAgICAgICAgbGFzdEltcG9ydGVkUm9vdFV1aWQgPSByZXN1bHQgJiYgcmVzdWx0LmRhdGEgPyAocmVzdWx0LmRhdGEucm9vdFV1aWQgfHwgJycpIDogJyc7XG4gICAgICAgICAgICAgICAgYXdhaXQgZmluYWxpemVDb21wb25lbnRTdGF0ZVRhcmdldHMocmVzdWx0KTtcbiAgICAgICAgICAgICAgICBhd2FpdCByZXNvbHZlUHJlcGFyZWRQbGFjZWhvbGRlcnMocmVzdWx0LCBwcmVwYXJlZFBheWxvYWQucGVuZGluZ1Nwcml0ZUZyYW1lcyk7XG4gICAgICAgICAgICAgICAgYXdhaXQgc2F2ZVNjZW5lQWZ0ZXJJbXBvcnQocmVzdWx0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOaMgui9vSBidWlsZFRyZWUg5pyq5oiQ5Yqf77yM6Lez6L+H6Ieq5Yqo5L+d5a2Y44CCJywgcmVzdWx0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHJlcGFyZWRQYXlsb2FkLnRleHRTdHlsZVRyYWNrZXIucmVwb3J0KCk7XG4gICAgICAgICAgICBwcmVwYXJlZFBheWxvYWQudGV4dFN0eWxlVGVtcGxhdGVUcmFja2VyLnJlcG9ydChwcmVwYXJlZFBheWxvYWQudGV4dFN0eWxlTGliKTtcbiAgICAgICAgICAgIHJlcG9ydEZvbnREZW1hbmQocHJlcGFyZWRQYXlsb2FkLmZvbnRUcmFja2VyKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOW3suaMgui9veWMuemFjSBGaWdtYSDlrZDmoJHliLDpgInkuK3niLboioLngrnvvIhiZXRh77yJ77yaJywge1xuICAgICAgICAgICAgICAgIHBhcmVudDogcGFyZW50VGFyZ2V0LnNjZW5lUGF0aCB8fCBwYXJlbnRUYXJnZXQubmFtZSxcbiAgICAgICAgICAgICAgICBmaWdtYVBhdGg6IHNlbGVjdGVkLmNhbmRpZGF0ZS5wYXRoLFxuICAgICAgICAgICAgICAgIHNjb3JlOiBzZWxlY3RlZC5zY29yZSxcbiAgICAgICAgICAgICAgICByZWFzb246IHNlbGVjdGVkLnJlYXNvbixcbiAgICAgICAgICAgICAgICByb290VXVpZDogcmVzdWx0ICYmIHJlc3VsdC5kYXRhICYmIHJlc3VsdC5kYXRhLnJvb3RVdWlkLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4ucmVzdWx0LFxuICAgICAgICAgICAgICAgIG1hdGNoOiB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogcGFyZW50VGFyZ2V0LnNjZW5lUGF0aCB8fCBwYXJlbnRUYXJnZXQubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgZmlnbWFQYXRoOiBzZWxlY3RlZC5jYW5kaWRhdGUucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgc2NvcmU6IHNlbGVjdGVkLnNjb3JlLFxuICAgICAgICAgICAgICAgICAgICByZWFzb246IHNlbGVjdGVkLnJlYXNvbixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdbZmlnbWEtaW1wb3J0ZXJdIGF0dGFjaE1hdGNoZWROb2RlQXNDaGlsZEJldGEgZmFpbGVkOicsIGVycik7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIE1lbnU6IHN0YXJ0IHRoZSBsb2NhbCBwdXNoIHNlcnZlciAoMTI3LjAuMC4xOjg3ODcpIGFuZCBwZXJzaXN0IHRoZSBvbi1zdGF0ZS5cbiAgICAgKiBAemgg6I+c5Y2V77ya5ZCv5Yqo5pys5Zyw5o6o6YCB5pyN5Yqh77yIMTI3LjAuMC4xOjg3ODfvvInlubborrDkvY/lvIDlkK/nirbmgIHvvIjph43ovb3lkI7oh6rliqjnu63kuIrvvInjgIJcbiAgICAgKi9cbiAgICBhc3luYyBzdGFydFB1c2hTZXJ2ZXIoKSB7XG4gICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHN0YXJ0UHVzaFNlcnZlcihoYW5kbGVQdXNoZWRKc29uKTtcbiAgICAgICAgaWYgKHJlcy5vaykge1xuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLlByb2ZpbGUuc2V0Q29uZmlnKCdmaWdtYS1pbXBvcnRlcicsIFBVU0hfRU5BQkxFRF9LRVksIHRydWUpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tmaWdtYS1pbXBvcnRlcl0g5o6o6YCB5pyN5Yqh5bey5byA5ZCv77yM5Y+v5ZyoIEZpZ21hIOaPkuS7tueCueOAjOaOqOmAgeOAjeOAgicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgW2ZpZ21hLWltcG9ydGVyXSDmjqjpgIHmnI3liqHlkK/liqjlpLHotKXvvJoke3Jlcy5lcnJvcn1gKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAZW4gTWVudTogc3RvcCB0aGUgbG9jYWwgcHVzaCBzZXJ2ZXIgYW5kIGNsZWFyIHRoZSBvbi1zdGF0ZS5cbiAgICAgKiBAemgg6I+c5Y2V77ya5YGc5q2i5pys5Zyw5o6o6YCB5pyN5Yqh5bm25riF6Zmk5byA5ZCv54q25oCB44CCXG4gICAgICovXG4gICAgYXN5bmMgc3RvcFB1c2hTZXJ2ZXIoKSB7XG4gICAgICAgIGF3YWl0IHN0b3BQdXNoU2VydmVyKCk7XG4gICAgICAgIGF3YWl0IEVkaXRvci5Qcm9maWxlLnNldENvbmZpZygnZmlnbWEtaW1wb3J0ZXInLCBQVVNIX0VOQUJMRURfS0VZLCBmYWxzZSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOaOqOmAgeacjeWKoeW3suWBnOatouOAgicpO1xuICAgIH0sXG5cbiAgICBhc3luYyBzdGFnZUxhc3RJbXBvcnRGb3JGaWdtYVB1bGwoKSB7XG4gICAgICAgIGlmICghbGFzdEltcG9ydGVkSnNvbkZvclB1bGwpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDmmoLml6Dlj6/mmoLlrZjnmoTmnIDov5Hlr7zlhaUgSlNPTuOAguivt+WFiOWvvOWFpeaIluaOpeaUtuS4gOasoSBGaWdtYSDmjqjpgIHjgIInKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGltcG9ydGVkIEpTT04gaW4gbWVtb3J5JyB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9rID0gc2V0UGVuZGluZ1B1bGxKc29uKGxhc3RJbXBvcnRlZEpzb25Gb3JQdWxsKTtcbiAgICAgICAgaWYgKG9rKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSDlt7LmmoLlrZjmnIDov5Hlr7zlhaXjgIwke2xhc3RJbXBvcnRlZE5hbWVGb3JQdWxsIHx8ICco5pyq5ZG95ZCNKSd944CN5L6bIEZpZ21hIOaPkuS7tiAvcHVsbCDmi4nlj5bvvIhiZXRh77yJ44CCYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG5hbWU6IGxhc3RJbXBvcnRlZE5hbWVGb3JQdWxsIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnRmFpbGVkIHRvIHN0YWdlIHBlbmRpbmcgcHVsbCBKU09OJyB9O1xuICAgIH0sXG5cbiAgICBhc3luYyBleHBvcnRUcmVlRm9yRmlnbWFQdWxsKCkge1xuICAgICAgICBjb25zdCBzZWxlY3RlZFJvb3RVdWlkcyA9IGdldFNlbGVjdGVkTm9kZVV1aWRzKCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkUm9vdFV1aWQgPSBzZWxlY3RlZFJvb3RVdWlkcy5sZW5ndGggPT09IDEgPyBzZWxlY3RlZFJvb3RVdWlkc1swXSA6ICcnO1xuICAgICAgICBjb25zdCByb290VXVpZCA9IHNlbGVjdGVkUm9vdFV1aWQgfHwgbGFzdEltcG9ydGVkUm9vdFV1aWQ7XG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IHNlbGVjdGVkUm9vdFV1aWRzLmxlbmd0aCA+IDFcbiAgICAgICAgICAgID8gYOW9k+WJjemAieS4rSAke3NlbGVjdGVkUm9vdFV1aWRzLmxlbmd0aH0g5Liq6IqC54K5YFxuICAgICAgICAgICAgOiAoc2VsZWN0ZWRSb290VXVpZCA/ICflvZPliY3pgInkuK3oioLngrknIDogKGxhc3RJbXBvcnRlZFJvb3RVdWlkID8gJ+acgOi/keWvvOWFpeagueiKgueCuScgOiAn5Zy65pmv6Ieq5Yqo5YCZ6YCJ5qC56IqC54K5JykpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdleHBvcnRUcmVlRm9yRmlnbWEnLCB7XG4gICAgICAgICAgICAgICAgcm9vdFV1aWRzOiBzZWxlY3RlZFJvb3RVdWlkcy5sZW5ndGggPiAxID8gc2VsZWN0ZWRSb290VXVpZHMgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgcm9vdFV1aWQ6IHNlbGVjdGVkUm9vdFV1aWRzLmxlbmd0aCA+IDEgPyAnJyA6IHJvb3RVdWlkLFxuICAgICAgICAgICAgICAgIHJvb3ROYW1lOiBzZWxlY3RlZFJvb3RVdWlkcy5sZW5ndGggPiAxIHx8IHJvb3RVdWlkID8gJycgOiBsYXN0SW1wb3J0ZWROYW1lRm9yUHVsbCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlIHx8ICFyZXN1bHQuZGF0YSB8fCAhcmVzdWx0LmRhdGEuanNvbikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDlj43lr7zlvZPliY3lnLrmma/lpLHotKXvvIzmnKrmmoLlrZggL3B1bGwgSlNPTuOAgicsIHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICdleHBvcnRUcmVlRm9yRmlnbWEgZmFpbGVkJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBvayA9IHNldFBlbmRpbmdQdWxsSnNvbihyZXN1bHQuZGF0YS5qc29uKTtcbiAgICAgICAgICAgIGlmICghb2spIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0ZhaWxlZCB0byBzdGFnZSBwZW5kaW5nIHB1bGwgSlNPTicgfTtcblxuICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSByZXN1bHQuZGF0YS5zdGF0cyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOW3suS7jiAke3NvdXJjZX0g5Y+N5a+844CMJHtyZXN1bHQuZGF0YS5uYW1lIHx8ICco5pyq5ZG95ZCNKSd944CN5bm25pqC5a2Y5L6bIEZpZ21hIC9wdWxsIOaLieWPlu+8iGJldGHvvInjgIJgLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgY2FudmFzOiByZXN1bHQuZGF0YS5jYW52YXMsXG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiByZXN1bHQuZGF0YS5yb290VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgbm9kZXM6IHN0YXRzLm5vZGVzLFxuICAgICAgICAgICAgICAgICAgICB0ZXh0czogc3RhdHMudGV4dHMsXG4gICAgICAgICAgICAgICAgICAgIHNwcml0ZXM6IHN0YXRzLnNwcml0ZXMsXG4gICAgICAgICAgICAgICAgICAgIGltYWdlczogc3RhdHMuaW1hZ2VzLFxuICAgICAgICAgICAgICAgICAgICBtaXNzaW5nSW1hZ2VzOiBzdGF0cy5taXNzaW5nSW1hZ2VzLFxuICAgICAgICAgICAgICAgICAgICB3YXJuaW5nczogQXJyYXkuaXNBcnJheShyZXN1bHQuZGF0YS53YXJuaW5ncykgPyByZXN1bHQuZGF0YS53YXJuaW5ncy5sZW5ndGggOiAwLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgbmFtZTogcmVzdWx0LmRhdGEubmFtZSxcbiAgICAgICAgICAgICAgICByb290VXVpZDogcmVzdWx0LmRhdGEucm9vdFV1aWQsXG4gICAgICAgICAgICAgICAgc3RhdHMsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWdtYS1pbXBvcnRlcl0gZXhwb3J0VHJlZUZvckZpZ21hUHVsbCBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBwdXNoVHJlZVRvRmlnbWEoKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1ldGhvZHMuZXhwb3J0VHJlZUZvckZpZ21hUHVsbCgpO1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdWNjZXNzICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1tmaWdtYS1pbXBvcnRlcl0g5bey5o6o6YCB5YiwIEZpZ21hIOaLieWPlumYn+WIl++8muivt+WcqCBGaWdtYSDmj5Lku7bngrnlh7vjgIzku44gVW5pdHkg5ouJ5Y+W44CN44CCJyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9LFxuXG4gICAgYXN5bmMgZXhwb3J0VHJlZVRvSnNvbkZpbGUocHJlc2V0UGF0aD86IHN0cmluZykge1xuICAgICAgICBjb25zdCBzZWxlY3RlZFJvb3RVdWlkcyA9IGdldFNlbGVjdGVkTm9kZVV1aWRzKCk7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkUm9vdFV1aWQgPSBzZWxlY3RlZFJvb3RVdWlkcy5sZW5ndGggPT09IDEgPyBzZWxlY3RlZFJvb3RVdWlkc1swXSA6ICcnO1xuICAgICAgICBjb25zdCByb290VXVpZCA9IHNlbGVjdGVkUm9vdFV1aWQgfHwgbGFzdEltcG9ydGVkUm9vdFV1aWQ7XG4gICAgICAgIGNvbnN0IHNvdXJjZSA9IHNlbGVjdGVkUm9vdFV1aWRzLmxlbmd0aCA+IDFcbiAgICAgICAgICAgID8gYOW9k+WJjemAieS4rSAke3NlbGVjdGVkUm9vdFV1aWRzLmxlbmd0aH0g5Liq6IqC54K5YFxuICAgICAgICAgICAgOiAoc2VsZWN0ZWRSb290VXVpZCA/ICflvZPliY3pgInkuK3oioLngrknIDogKGxhc3RJbXBvcnRlZFJvb3RVdWlkID8gJ+acgOi/keWvvOWFpeagueiKgueCuScgOiAn5Zy65pmv6Ieq5Yqo5YCZ6YCJ5qC56IqC54K5JykpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdleHBvcnRUcmVlRm9yRmlnbWEnLCB7XG4gICAgICAgICAgICAgICAgcm9vdFV1aWRzOiBzZWxlY3RlZFJvb3RVdWlkcy5sZW5ndGggPiAxID8gc2VsZWN0ZWRSb290VXVpZHMgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgcm9vdFV1aWQ6IHNlbGVjdGVkUm9vdFV1aWRzLmxlbmd0aCA+IDEgPyAnJyA6IHJvb3RVdWlkLFxuICAgICAgICAgICAgICAgIHJvb3ROYW1lOiBzZWxlY3RlZFJvb3RVdWlkcy5sZW5ndGggPiAxIHx8IHJvb3RVdWlkID8gJycgOiBsYXN0SW1wb3J0ZWROYW1lRm9yUHVsbCxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlIHx8ICFyZXN1bHQuZGF0YSB8fCAhcmVzdWx0LmRhdGEuanNvbikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyXSDlr7zlh7ogSlNPTiDmlofku7blpLHotKXvvJrlnLrmma/lj43lr7zmnKrov5Tlm57mnInmlYggSlNPTuOAgicsIHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiByZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICdleHBvcnRUcmVlRm9yRmlnbWEgZmFpbGVkJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBleHBvcnROYW1lID0gc2FmZUFzc2V0RmlsZU5hbWUocmVzdWx0LmRhdGEubmFtZSB8fCBsYXN0SW1wb3J0ZWROYW1lRm9yUHVsbCB8fCAnQ29jb3NFeHBvcnQnKTtcbiAgICAgICAgICAgIGxldCBmaWxlUGF0aCA9IHByZXNldFBhdGggPyBlbnN1cmVKc29uRXh0ZW5zaW9uKHByZXNldFBhdGgpIDogJyc7XG4gICAgICAgICAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJvamVjdFBhdGggPSAoRWRpdG9yIGFzIGFueSkuUHJvamVjdCAmJiAoRWRpdG9yIGFzIGFueSkuUHJvamVjdC5wYXRoIHx8IHByb2Nlc3MuY3dkKCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZGVmYXVsdERpciA9IGpvaW4ocHJvamVjdFBhdGgsICdGaWdtYUV4cG9ydCcpO1xuICAgICAgICAgICAgICAgIG1rZGlyU3luYyhkZWZhdWx0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICBjb25zdCBwaWNrZWQgPSBhd2FpdCBFZGl0b3IuRGlhbG9nLnNhdmUoe1xuICAgICAgICAgICAgICAgICAgICB0aXRsZTogJ+S/neWtmOWvvOWHuiBKU09OJyxcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogam9pbihkZWZhdWx0RGlyLCBgJHtleHBvcnROYW1lfS5qc29uYCksXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcnM6IFt7IG5hbWU6ICdKU09OJywgZXh0ZW5zaW9uczogWydqc29uJ10gfV0sXG4gICAgICAgICAgICAgICAgICAgIGJ1dHRvbjogJ+S/neWtmCcsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKHBpY2tlZC5jYW5jZWxlZCB8fCAhcGlja2VkLmZpbGVQYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0NhbmNlbGVkJyB9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmaWxlUGF0aCA9IGVuc3VyZUpzb25FeHRlbnNpb24ocGlja2VkLmZpbGVQYXRoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbWtkaXJTeW5jKGRpcm5hbWUoZmlsZVBhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgICAgIHdyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIHJlc3VsdC5kYXRhLmpzb24sICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IHJlc3VsdC5kYXRhLnN0YXRzIHx8IHt9O1xuICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcl0g5bey5bCGICR7c291cmNlfeOAjCR7cmVzdWx0LmRhdGEubmFtZSB8fCBleHBvcnROYW1lfeOAjeWvvOWHuuS4uiBGaWdtYSBKU09O77yaJHtmaWxlUGF0aH1gLFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgcm9vdFV1aWQ6IHJlc3VsdC5kYXRhLnJvb3RVdWlkLFxuICAgICAgICAgICAgICAgICAgICBub2Rlczogc3RhdHMubm9kZXMsXG4gICAgICAgICAgICAgICAgICAgIHRleHRzOiBzdGF0cy50ZXh0cyxcbiAgICAgICAgICAgICAgICAgICAgc3ByaXRlczogc3RhdHMuc3ByaXRlcyxcbiAgICAgICAgICAgICAgICAgICAgaW1hZ2VzOiBzdGF0cy5pbWFnZXMsXG4gICAgICAgICAgICAgICAgICAgIG1pc3NpbmdJbWFnZXM6IHN0YXRzLm1pc3NpbmdJbWFnZXMsXG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzOiBBcnJheS5pc0FycmF5KHJlc3VsdC5kYXRhLndhcm5pbmdzKSA/IHJlc3VsdC5kYXRhLndhcm5pbmdzLmxlbmd0aCA6IDAsXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgICAgICAgICBuYW1lOiByZXN1bHQuZGF0YS5uYW1lLFxuICAgICAgICAgICAgICAgIHJvb3RVdWlkOiByZXN1bHQuZGF0YS5yb290VXVpZCxcbiAgICAgICAgICAgICAgICBzdGF0cyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW2ZpZ21hLWltcG9ydGVyXSBleHBvcnRUcmVlVG9Kc29uRmlsZSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBzYXZlTm9kZUFzUHJlZmFiQmV0YSgpIHtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRSb290VXVpZCA9IGdldFNlbGVjdGVkTm9kZVV1aWQoKTtcbiAgICAgICAgY29uc3Qgcm9vdFV1aWQgPSBzZWxlY3RlZFJvb3RVdWlkIHx8IGxhc3RJbXBvcnRlZFJvb3RVdWlkO1xuICAgICAgICBjb25zdCBzb3VyY2UgPSBzZWxlY3RlZFJvb3RVdWlkID8gJ+W9k+WJjemAieS4reiKgueCuScgOiAobGFzdEltcG9ydGVkUm9vdFV1aWQgPyAn5pyA6L+R5a+85YWl5qC56IqC54K5JyA6ICflnLrmma/oh6rliqjlgJnpgInmoLnoioLngrknKTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY2FsbFNjZW5lKCdzZXJpYWxpemVOb2RlQXNQcmVmYWJCZXRhJywge1xuICAgICAgICAgICAgICAgIHJvb3RVdWlkLFxuICAgICAgICAgICAgICAgIHJvb3ROYW1lOiAhcm9vdFV1aWQgPyBsYXN0SW1wb3J0ZWROYW1lRm9yUHVsbCA6ICcnLFxuICAgICAgICAgICAgICAgIHByZWZhYk5hbWU6IGxhc3RJbXBvcnRlZE5hbWVGb3JQdWxsIHx8ICcnLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UgfHwgIXJlc3VsdC5kYXRhIHx8ICFyZXN1bHQuZGF0YS5qc29uKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOS/neWtmCBQcmVmYWLvvIhiZXRh77yJ5aSx6LSl77yac2NlbmUg5pyq6L+U5Zue5pyJ5pWIIHByZWZhYiBKU09O44CCJywgcmVzdWx0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IHJlc3VsdCAmJiByZXN1bHQuZXJyb3IgfHwgJ3NlcmlhbGl6ZU5vZGVBc1ByZWZhYkJldGEgZmFpbGVkJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBhd2FpdCBlbnN1cmVBc3NldEZvbGRlcihGSUdNQV9QUkVGQUJfRElSKTtcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYk5hbWUgPSByZXN1bHQuZGF0YS5uYW1lIHx8IGxhc3RJbXBvcnRlZE5hbWVGb3JQdWxsIHx8ICdGaWdtYVByZWZhYic7XG4gICAgICAgICAgICBjb25zdCBkYlVybCA9IGAke0ZJR01BX1BSRUZBQl9ESVJ9LyR7c2FmZUFzc2V0RmlsZU5hbWUocHJlZmFiTmFtZSl9LnByZWZhYmA7XG4gICAgICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgd3JpdGVUZXh0QXNzZXRWaWFJbXBvcnQoZGJVcmwsIHJlc3VsdC5kYXRhLmpzb24pO1xuICAgICAgICAgICAgaWYgKCFpbmZvIHx8ICFpbmZvLnV1aWQpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0gUHJlZmFiIEpTT04g5bey5YaZ5YWl77yM5L2GIGFzc2V0LWRiIOacqui/lOWbnui1hOa6kOS/oeaBr+OAgicsIHsgZGJVcmwgfSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnUHJlZmFiIGFzc2V0IGltcG9ydCBkaWQgbm90IHJldHVybiBhc3NldCBpbmZvJywgZGJVcmwgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGFzdFNhdmVkUHJlZmFiRGJVcmwgPSBkYlVybDtcbiAgICAgICAgICAgIGxhc3RTYXZlZFByZWZhYlV1aWQgPSBTdHJpbmcoaW5mby51dWlkKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIOW3suWwhiAke3NvdXJjZX3jgIwke3ByZWZhYk5hbWV944CN5L+d5a2Y5Li6IFByZWZhYu+8iGJldGHvvInvvJoke2RiVXJsfWAsXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBsYXN0U2F2ZWRQcmVmYWJVdWlkLFxuICAgICAgICAgICAgICAgICAgICBub2RlczogcmVzdWx0LmRhdGEuc3RhdHMgJiYgcmVzdWx0LmRhdGEuc3RhdHMubm9kZXMsXG4gICAgICAgICAgICAgICAgICAgIHNwcml0ZXM6IHJlc3VsdC5kYXRhLnN0YXRzICYmIHJlc3VsdC5kYXRhLnN0YXRzLnNwcml0ZXMsXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsczogcmVzdWx0LmRhdGEuc3RhdHMgJiYgcmVzdWx0LmRhdGEuc3RhdHMubGFiZWxzLFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGJVcmwsXG4gICAgICAgICAgICAgICAgdXVpZDogbGFzdFNhdmVkUHJlZmFiVXVpZCxcbiAgICAgICAgICAgICAgICBuYW1lOiBwcmVmYWJOYW1lLFxuICAgICAgICAgICAgICAgIHN0YXRzOiByZXN1bHQuZGF0YS5zdGF0cyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW2ZpZ21hLWltcG9ydGVyXSBzYXZlTm9kZUFzUHJlZmFiQmV0YSBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycikgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhc3luYyBpbnN0YW50aWF0ZVByZWZhYkJldGEoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwcmVmYWIgPSBhd2FpdCByZXNvbHZlUHJlZmFiRm9ySW5zdGFudGlhdGUoKTtcbiAgICAgICAgICAgIGlmICghcHJlZmFiKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXJdIOaaguaXoOWPr+WunuS+i+WMlueahCBQcmVmYWLvvIhiZXRh77yJ44CC6K+35YWI6YCJ5Lit5LiA5LiqIFByZWZhYiDotYTmupDvvIzmiJbkv53lrZjkuIDmrKHmnIDov5Hlr7zlhaXkuLogUHJlZmFi44CCJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gcHJlZmFiIGFzc2V0IHNlbGVjdGVkIG9yIHNhdmVkJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBjYWxsU2NlbmUoJ2luc3RhbnRpYXRlUHJlZmFiQmV0YScsIHtcbiAgICAgICAgICAgICAgICB1dWlkOiBwcmVmYWIudXVpZCxcbiAgICAgICAgICAgICAgICBkYlVybDogcHJlZmFiLmRiVXJsLFxuICAgICAgICAgICAgICAgIG5hbWU6IHByZWZhYi5uYW1lLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcl0g5a6e5L6L5YyWIFByZWZhYu+8iGJldGHvvInlpLHotKXjgIInLCByZXN1bHQpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogcmVzdWx0ICYmIHJlc3VsdC5lcnJvciB8fCAnaW5zdGFudGlhdGVQcmVmYWJCZXRhIGZhaWxlZCcgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGFzdFNhdmVkUHJlZmFiVXVpZCA9IHByZWZhYi51dWlkO1xuICAgICAgICAgICAgbGFzdFNhdmVkUHJlZmFiRGJVcmwgPSBwcmVmYWIuZGJVcmw7XG4gICAgICAgICAgICBhd2FpdCBzYXZlU2NlbmVBZnRlckltcG9ydChyZXN1bHQpO1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyXSDlt7Llrp7kvovljJYgUHJlZmFi77yIYmV0Ye+8ieOAjCR7cHJlZmFiLm5hbWV944CN44CCYCxcbiAgICAgICAgICAgICAgICByZXN1bHQuZGF0YVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW2ZpZ21hLWltcG9ydGVyXSBpbnN0YW50aWF0ZVByZWZhYkJldGEgZmFpbGVkOicsIGVycik7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IFN0cmluZyhlcnIpIH07XG4gICAgICAgIH1cbiAgICB9LFxufTtcblxuLyoqXG4gKiBAZW4gTWV0aG9kIFRyaWdnZXJlZCBvbiBFeHRlbnNpb24gU3RhcnR1cC5cbiAqIEB6aCDmianlsZXlkK/liqjml7bop6blj5HnmoTmlrnms5XjgIJcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWQoKSB7XG4gICAgY29uc29sZS5sb2coYCVjW2ZpZ21hLWltcG9ydGVyXSDmianlsZXlt7LliqDovb0gwrcg5p6E5bu654mI5pysID0gJHtCVUlMRF9WRVJTSU9OfWAsICdjb2xvcjojMGEwO2ZvbnQtd2VpZ2h0OmJvbGQnKTtcbiAgICAvLyDoh6rliqjnu63kuIrvvJrkuIrmrKHlvIDlkK/ov4fmjqjpgIHmnI3liqHlsLHoh6rliqjmgaLlpI3vvIjlr7npvZAgVW5pdHkgRWRpdG9yUHJlZnMg6Ieq5Yqo57ut5LiK77yJ44CCXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZW5hYmxlZCA9IGF3YWl0IEVkaXRvci5Qcm9maWxlLmdldENvbmZpZygnZmlnbWEtaW1wb3J0ZXInLCBQVVNIX0VOQUJMRURfS0VZKTtcbiAgICAgICAgaWYgKGVuYWJsZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHN0YXJ0UHVzaFNlcnZlcihoYW5kbGVQdXNoZWRKc29uKTtcbiAgICAgICAgICAgIGlmIChyZXMub2spIGNvbnNvbGUubG9nKCdbZmlnbWEtaW1wb3J0ZXJdIOaOqOmAgeacjeWKoeW3suiHquWKqOe7reS4iuOAgicpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1tmaWdtYS1pbXBvcnRlcl0g6Ieq5Yqo57ut5LiK5o6o6YCB5pyN5Yqh5aSx6LSlOicsIGVycik7XG4gICAgfVxufVxuXG4vKipcbiAqIEBlbiBNZXRob2QgdHJpZ2dlcmVkIHdoZW4gdW5pbnN0YWxsaW5nIHRoZSBleHRlbnNpb24uXG4gKiBAemgg5Y246L295omp5bGV5pe26Kem5Y+R55qE5pa55rOV44CCXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1bmxvYWQoKSB7XG4gICAgaWYgKGlzUHVzaFNlcnZlclJ1bm5pbmcoKSkgYXdhaXQgc3RvcFB1c2hTZXJ2ZXIoKTtcbiAgICBjb25zb2xlLmxvZygnW2ZpZ21hLWltcG9ydGVyXSBleHRlbnNpb24gdW5sb2FkZWQnKTtcbn1cbiJdfQ==