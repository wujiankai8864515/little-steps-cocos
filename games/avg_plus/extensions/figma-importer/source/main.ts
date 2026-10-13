/**
 * @en figma-importer extension main-process entry.
 * @zh figma-importer 扩展的主进程入口。
 *
 * 主进程跑在普通 Node 环境里 —— 这里 require('cc') 拿不到引擎类。
 * 凡是要建节点/挂组件的引擎 API，都必须通过 execute-scene-script
 * 转发到 scene.ts 里执行（见 callScene）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { FigmaExportData, FigmaNodeData, BUILD_VERSION } from './types';
import {
    landImages,
    landMaskImages,
    SpriteFrameBorder,
    hashImageBase64,
    pickAnyTextureMatch,
    scanProjectTextureIndex,
    PendingSpriteFrame,
    createPendingFigmaSpriteFrame,
    resolveSpriteFramesBeforeBuild,
} from './assets';
import { startPushServer, stopPushServer, isPushServerRunning, PushOptions, setPendingPullJson } from './server';
import { scanFontLibrary, matchFont, explainFontMiss, FontLibEntry, FontDemandTracker } from './fontlib';
import { extractTextStyleMeta, TextStyleTracker } from './textstyle';
import { cropPngBase64, decodePngPixels, encodePngPixels, PngPixelData } from './pngcrop';
import {
    scanTextStyleLibrary,
    resolveTextStyleTemplate,
    TextStyleLibrary,
    TextStyleTemplateTracker,
    TEXT_STYLE_LIB_DIR,
} from './textstylelib';
import { generateTextStyleLibraryFromData } from './textstylegen';
import { trackImport, trackImportFailed } from './telemetry';
import {
    ComponentIdentity,
    ComponentMappingDocument,
    ComponentMappingEntry,
    buildVariantFilter,
    collectComponentIdentities,
    normalizeMappingDocument,
    normalizeComponentProperties,
    removeMappingEntry,
    upsertMappingEntry,
} from './component-mapping';
import {
    COMPONENT_STATE_RUNTIME_REVISION,
    planComponentStateRuntimeProvision,
    shouldWaitForComponentStateRuntime,
} from './component-state-runtime';
import {
    MappedComponentStateRequest,
    finalizeMappedComponentStates,
    mergeMappedComponentStateReport,
} from './mapped-component-state';
import {
    beginAssetDbSession,
    endAssetDbSession,
    requestAssetDb,
    rethrowIfAssetDbUnavailable,
} from './assetdb';
import {
    CurrentJsonPathCoordinator,
    normalizeCurrentJsonPath,
    readCurrentJsonPath,
    writeCurrentJsonPath,
} from './json-workspace-state';
import { reportMappingDiagnostics } from './mapping-diagnostics';
import { averageFigmaColor } from './mapping-fallbacks';
import { activateCocosEditorApplication } from './editor-activation';

/** @zh 构建版本号统一在 types.ts（BUILD_VERSION），main/scene 共用同一来源，改一处两边同步。 */

/** @zh 推送服务开关的持久化 key（对齐 Unity EditorPrefs 自动续上）。 */
const PUSH_ENABLED_KEY = 'figma-importer.pushServerEnabled';
/** @zh 通用资源目录（参与图片像素比对复用）的持久化 key；值为 db:// 目录列表。 */
const COMMON_DIRS_KEY = 'figma-importer.commonResourceDirs';
const DEFAULT_COMMON_DIRS = ['db://assets'];

/** @zh 读通用资源目录配置；空/失败回退默认全 assets，保证不回归。 */
async function readCommonResourceDirs(): Promise<string[]> {
    try {
        const raw = await Editor.Profile.getConfig('figma-importer', COMMON_DIRS_KEY);
        if (Array.isArray(raw)) {
            const dirs = raw.map((d) => String(d || '').trim()).filter((d) => d.startsWith('db://'));
            if (dirs.length > 0) return dirs;
        }
    } catch (err) {
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
let componentStateRuntimePromise: Promise<boolean> | null = null;
let componentMappingMutationQueue: Promise<void> = Promise.resolve();
const currentJsonPathCoordinator = new CurrentJsonPathCoordinator();

/** @zh beta 回流协议验证面：记录最近一次成功导入的原始 JSON，供 Figma 插件 /pull 拉取。 */
let lastImportedJsonForPull = '';
let lastImportedNameForPull = '';
let lastImportedRootUuid = '';
let lastSavedPrefabDbUrl = '';
let lastSavedPrefabUuid = '';
let lastComponentIdentities: ComponentIdentity[] = [];

/**
 * @en Forward a call into the scene script (the only place cc.* is available).
 * @zh 把一次调用转发进 scene 脚本（唯一能用 cc.* 的地方）。
 */
async function callScene(method: string, ...args: any[]): Promise<any> {
    return await Editor.Message.request('scene', 'execute-scene-script', {
        name: 'figma-importer',
        method,
        args,
    });
}

async function getSelectedSceneComponentIdentity(): Promise<any> {
    const nodeUuid = getSelectedNodeUuid();
    if (!nodeUuid) return { status: 'none', reason: 'no-selection', nodeUuid: '' };
    try {
        const result = await callScene('describeComponentMappingSelection', nodeUuid);
        if (result && result.success !== false && result.data) return result.data;
        return {
            status: 'not-component',
            reason: 'scene-query-failed',
            nodeUuid,
            error: String(result && result.error || 'Unknown scene query error'),
        };
    } catch (error: any) {
        return {
            status: 'not-component',
            reason: 'scene-query-failed',
            nodeUuid,
            error: String(error && error.message || error || 'Unknown scene query error'),
        };
    }
}

async function finalizeComponentStateTargets(result: any): Promise<void> {
    const stats = result && result.data ? result.data : null;
    const requests: MappedComponentStateRequest[] = stats && Array.isArray(stats.pendingComponentStates)
        ? stats.pendingComponentStates
        : stats && Array.isArray(stats.pendingMappedComponentStates)
            ? stats.pendingMappedComponentStates
        : [];
    if (requests.length === 0) return;

    const report = await finalizeMappedComponentStates(requests, {
        createComponent: async (nodeUuid, componentName) => await Editor.Message.request(
            'scene',
            'create-component',
            { uuid: nodeUuid, component: componentName },
        ),
        applyStates: async (items) => await callScene('applyComponentStates', items),
        restoreActivity: async (items) => await callScene('restoreComponentStateActivity', items),
    });
    mergeMappedComponentStateReport(stats, report);

    if (report.createFailures.length > 0 || report.unavailable > 0 || report.overrideMissing > 0) {
        console.warn(
            '[figma-importer] FigmaComponentState 未完整登记：',
            report,
        );
    } else {
        console.log(
            `[figma-importer] FigmaComponentState 已登记 ${report.attached}/${report.total}` +
            `（Prefab override ${report.mounted}/${report.overrideTotal}）。`,
        );
    }
}

/** @deprecated Compatibility name for callers/tests from the mapped-only phase. */
const attachMappedComponentStateOverrides = finalizeComponentStateTargets;

function getSelectedNodeUuid(): string {
    const selected = getSelectedNodeUuids();
    return selected.length > 0 ? selected[0] : '';
}

function getSelectedNodeUuids(): string[] {
    try {
        const selection = (Editor as any).Selection;
        if (!selection || typeof selection.getSelected !== 'function') return [];
        const selected = selection.getSelected('node');
        if (Array.isArray(selected)) return selected.map((item: any) => String(item || '')).filter(Boolean);
        if (typeof selected === 'string' && selected) return [selected];
    } catch {
        return [];
    }
    return [];
}

function getSelectedAssetUuids(): string[] {
    const normalize = (value: any): string[] => {
        if (Array.isArray(value)) return value.map((item: any) => String(item || '')).filter(Boolean);
        if (typeof value === 'string' && value) return [value];
        return [];
    };

    const selection = (Editor as any).Selection;
    if (!selection) return [];

    if (typeof selection.getSelected === 'function') {
        try {
            const selected = normalize(selection.getSelected('asset'));
            if (selected.length > 0) return selected;
        } catch {
            // Creator versions differ here; the typed last-selection API is the fallback below.
        }
    }

    if (typeof selection.getLastSelected === 'function') {
        try {
            return normalize(selection.getLastSelected('asset'));
        } catch {
            // Selection is editor-only sugar; absence should not break menu actions.
        }
    }
    return [];
}

function safeAssetFileName(name: string): string {
    const safe = (name || 'untitled').replace(/[^\w一-龥-]/g, '_').replace(/^_+|_+$/g, '');
    return safe || 'untitled';
}

function stagePushedJsonForWorkbench(json: string, name: string): string {
    const projectPath = String((Editor as any).Project && (Editor as any).Project.path || '').trim();
    if (!projectPath) throw new Error('Creator project path is unavailable');
    const dir = join(projectPath, 'temp', 'figma-import-workbench');
    mkdirSync(dir, { recursive: true });
    const fileName = `${safeAssetFileName(name || 'pushed')}-${hashText(json)}.json`;
    const filePath = join(dir, fileName);
    writeFileSync(filePath, json, 'utf8');
    return filePath;
}

function ensureJsonExtension(filePath: string): string {
    return /\.json$/i.test(filePath) ? filePath : `${filePath}.json`;
}

function dbUrlToProjectPath(dbUrl: string): string {
    const projectPath = (Editor as any).Project && (Editor as any).Project.path;
    if (!projectPath || !dbUrl.startsWith('db://assets/')) return '';
    return join(projectPath, 'assets', dbUrl.slice('db://assets/'.length));
}

async function ensureAssetFolder(url: string): Promise<void> {
    const diskPath = dbUrlToProjectPath(url);
    if (!diskPath) throw new Error(`[figma-importer] 无法把资源目录映射到工程磁盘：${url}`);
    mkdirSync(diskPath, { recursive: true });
}

async function queryAssetInfo(key: string): Promise<any | null> {
    if (!key) return null;
    try {
        const info = await requestAssetDb('query-asset-info', key, [key]);
        return info || null;
    } catch (err) {
        rethrowIfAssetDbUnavailable(err);
        return null;
    }
}

function assetInfoUrl(info: any): string {
    return String(info && (info.url || info.source || info.path || '') || '');
}

function isPrefabAssetInfo(info: any): boolean {
    if (!info) return false;
    const url = assetInfoUrl(info);
    const type = String(info.type || info.importer || '');
    return /\.prefab$/i.test(url) || /prefab/i.test(type);
}

async function getSelectedPrefabAssetInfo(): Promise<any | null> {
    for (const uuid of getSelectedAssetUuids()) {
        const info = await queryAssetInfo(uuid);
        if (isPrefabAssetInfo(info)) return info;
    }
    return null;
}

async function resolveComponentMappingPrefabAssetInfo(
    payload?: Partial<ComponentMappingEntry>
): Promise<{ info: any | null; source: 'explicit' | 'project-selection' }> {
    const hasExplicitLocator = !!payload && (
        Object.prototype.hasOwnProperty.call(payload, 'prefabUuid') ||
        Object.prototype.hasOwnProperty.call(payload, 'prefabUrl')
    );
    const explicitKeys = [
        String(payload && payload.prefabUuid || '').trim(),
        String(payload && payload.prefabUrl || '').trim(),
    ].filter((key, index, keys) => !!key && keys.indexOf(key) === index);

    if (hasExplicitLocator) {
        for (const key of explicitKeys) {
            const info = await queryAssetInfo(key);
            if (isPrefabAssetInfo(info) && info.uuid) return { info, source: 'explicit' };
        }
        return { info: null, source: 'explicit' };
    }

    return {
        info: await getSelectedPrefabAssetInfo(),
        source: 'project-selection',
    };
}

async function writeTextAssetViaImport(dbUrl: string, content: string): Promise<any | null> {
    const projectPath = (Editor as any).Project && (Editor as any).Project.path;
    if (!projectPath) throw new Error('Editor.Project.path is unavailable');
    const tempDir = join(projectPath, 'temp', 'figma-importer');
    mkdirSync(tempDir, { recursive: true });
    const extMatch = dbUrl.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? `.${extMatch[1]}` : '.txt';
    const tmpFile = join(tempDir, `asset-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    writeFileSync(tmpFile, content, 'utf8');
    await requestAssetDb('import-asset', dbUrl, [tmpFile, dbUrl, { overwrite: true }]);
    await delay(300);
    return await queryAssetInfo(dbUrl);
}

function emptyComponentMappingDocument(): ComponentMappingDocument {
    return { version: 1, updatedAt: '', entries: [] };
}

function readComponentMappingDocument(): ComponentMappingDocument {
    const filePath = dbUrlToProjectPath(COMPONENT_MAPPING_DB_URL);
    if (!filePath || !existsSync(filePath)) return emptyComponentMappingDocument();
    try {
        return normalizeMappingDocument(JSON.parse(readFileSync(filePath, 'utf8')));
    } catch (err) {
        console.warn('[figma-importer] 组件映射表读取失败，本次按空表处理：', filePath, err);
        return emptyComponentMappingDocument();
    }
}

async function saveComponentMappingDocument(document: ComponentMappingDocument): Promise<ComponentMappingDocument> {
    const normalized = normalizeMappingDocument(document);
    normalized.updatedAt = new Date().toISOString();
    await ensureAssetFolder(COMPONENT_MAPPING_DIR);
    await writeTextAssetViaImport(COMPONENT_MAPPING_DB_URL, JSON.stringify(normalized, null, 2));
    return normalized;
}

function mutateComponentMappingDocument(
    mutate: (document: ComponentMappingDocument) => ComponentMappingDocument
): Promise<ComponentMappingDocument> {
    const operation = componentMappingMutationQueue.then(async () => {
        const document = mutate(readComponentMappingDocument());
        return await saveComponentMappingDocument(document);
    });
    componentMappingMutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
}

async function queryComponentStateRuntimeReady(): Promise<boolean> {
    try {
        const registered = !!await Editor.Message.request(
            'scene',
            'query-component-has-script',
            COMPONENT_STATE_RUNTIME_CLASS
        );
        if (!registered) return false;
        const result = await callScene('getComponentStateRuntimeRevision');
        return !!(
            result &&
            result.success !== false &&
            result.data &&
            result.data.revision === COMPONENT_STATE_RUNTIME_REVISION
        );
    } catch {
        return false;
    }
}

async function provisionComponentStateRuntime(): Promise<boolean> {
    const templatePath = join(__dirname, '..', 'static', 'FigmaComponentState.ts');
    if (!existsSync(templatePath)) {
        console.warn('[figma-importer] 缺少 FigmaComponentState runtime 模板：', templatePath);
        return false;
    }
    const template = readFileSync(templatePath, 'utf8');
    const targetPath = dbUrlToProjectPath(COMPONENT_STATE_RUNTIME_DB_URL);
    const existing = targetPath && existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';
    const classRegistered = await queryComponentStateRuntimeReady();
    const action = planComponentStateRuntimeProvision(existing, template, classRegistered);

    if (action === 'collision') {
        console.warn(
            `[figma-importer] 已存在同名 ${COMPONENT_STATE_RUNTIME_CLASS}，但缺少插件管理的运行时资产；` +
            '为避免重复 ccclass，本次组件状态记为 unavailable。'
        );
        return false;
    }
    if (action === 'write') {
        await ensureAssetFolder(COMPONENT_MAPPING_DIR);
        await ensureAssetFolder(COMPONENT_STATE_RUNTIME_DIR);
        await writeTextAssetViaImport(COMPONENT_STATE_RUNTIME_DB_URL, template);
        console.log(
            `[figma-importer] 已${existing ? '更新' : '安装'}运行时组件：${COMPONENT_STATE_RUNTIME_DB_URL}`
        );
    } else if (action === 'keep-custom' && existing !== template) {
        console.warn(
            `[figma-importer] ${COMPONENT_STATE_RUNTIME_DB_URL} 不是插件生成文件，保留现有内容；` +
            '为避免误用字段契约未知的同名脚本，本次组件状态记为 unavailable。'
        );
    }

    if (!shouldWaitForComponentStateRuntime(action)) return false;

    for (let attempt = 0; attempt < 40; attempt++) {
        if (await queryComponentStateRuntimeReady()) {
            componentStateRuntimeReady = true;
            return true;
        }
        await delay(250);
    }
    return false;
}

async function ensureComponentStateRuntime(): Promise<boolean> {
    if (componentStateRuntimeReady) return true;
    if (!componentStateRuntimePromise) {
        componentStateRuntimePromise = provisionComponentStateRuntime().finally(() => {
            componentStateRuntimePromise = null;
        });
    }
    return await componentStateRuntimePromise;
}

/** Replacement/attach beta flows share the importer tree and must provision the runtime too. */
async function ensureComponentStateRuntimeBestEffort(): Promise<boolean> {
    try {
        const ready = await ensureComponentStateRuntime();
        if (!ready) {
            console.warn(
                `[figma-importer] ${COMPONENT_STATE_RUNTIME_CLASS} 尚未完成注册；` +
                '本次替换/挂载的组件状态将记为 unavailable。'
            );
        }
        return ready;
    } catch (error) {
        componentStateRuntimeReady = false;
        console.warn(
            `[figma-importer] ${COMPONENT_STATE_RUNTIME_CLASS} 安装或升级失败；` +
            '本次替换/挂载将继续，但组件状态记为 unavailable：',
            (error as any)?.message || error,
        );
        return false;
    }
}

interface ResolvedComponentMappingAssetEntry extends ComponentMappingEntry {
    resolved: boolean;
    requestedPrefabUuid: string;
    requestedPrefabUrl: string;
}

async function resolveComponentMappingAssets(document: ComponentMappingDocument): Promise<{
    entries: ResolvedComponentMappingAssetEntry[];
    valid: number;
    broken: number;
}> {
    let valid = 0;
    let broken = 0;
    const entries: ResolvedComponentMappingAssetEntry[] = [];
    for (const entry of document.entries) {
        const requestedPrefabUuid = String(entry.prefabUuid || '');
        const requestedPrefabUrl = String(entry.prefabUrl || '');
        let info = entry.prefabUuid ? await queryAssetInfo(entry.prefabUuid) : null;
        if (!isPrefabAssetInfo(info) && entry.prefabUrl) info = await queryAssetInfo(entry.prefabUrl);
        if (isPrefabAssetInfo(info) && info && info.uuid) {
            entries.push({
                ...entry,
                prefabUuid: String(info.uuid),
                prefabUrl: assetInfoUrl(info),
                resolved: true,
                requestedPrefabUuid,
                requestedPrefabUrl,
            });
            valid++;
        } else {
            entries.push({
                ...entry,
                prefabUuid: '',
                prefabUrl: '',
                resolved: false,
                requestedPrefabUuid,
                requestedPrefabUrl,
            });
            broken++;
        }
    }
    return { entries, valid, broken };
}

async function resolvePrefabForInstantiate(): Promise<{ uuid: string; dbUrl: string; name: string } | null> {
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

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function elapsedMs(start: number): number {
    return Date.now() - start;
}

interface PreparedImportData {
    name: string;
    canvas: { width: number; height: number };
    root: FigmaNodeData;
    images?: { [id: string]: string };
    interfaceCount: number;
}

interface ImageDimensions {
    width: number;
    height: number;
}

interface SlimStats {
    sharedCroppedImages: number;
    sharedCroppedSliceChildren: number;
    implicitSlice9Images: number;
    implicitSlice9SliceChildren: number;
    imageMasks: number;
    rectMaskFallbacks: number;
    degenerateMasks: number;
}

interface PersistentVariantStats {
    croppedImageFills: number;
    cropFailures: number;
}

interface Slice9ImageVariantStats {
    explicitNodes: number;
    implicitNodes: number;
    semanticImages: number;
    missingImages: number;
}

interface TexturePreviewOccurrence {
    path: string;
    name: string;
    width: number;
    height: number;
    canvasX: number;
    canvasY: number;
}

interface DetectedSlice9Info {
    imageRef: string;
    border: SpriteFrameBorder;
    childrenToSkip: Set<FigmaNodeData>;
    rows: number;
    cols: number;
}

type MaskShapeKind = 'DEGENERATE' | 'SOLID_RECT' | 'SHAPED';

interface MaskRoute {
    shape: MaskShapeKind;
    useImageMask: boolean;
    fallbackReason?: 'degenerate' | 'solid-rect';
}

interface PreparedScenePayload {
    prepared: PreparedImportData;
    payload: any;
    pendingSpriteFrames: { [imgRef: string]: PendingSpriteFrame };
    fontTracker: FontDemandTracker;
    textStyleTracker: TextStyleTracker;
    textStyleTemplateTracker: TextStyleTemplateTracker;
    textStyleLib: TextStyleLibrary;
}

interface ReplaceTargetInfo {
    uuid: string;
    name: string;
    scenePath: string;
    relativePath?: string;
    parentName: string;
    parentUuid?: string;
    siblingIndex?: number;
    width: number;
    height: number;
    hasLabel: boolean;
    hasSprite: boolean;
    hasRichText?: boolean;
    labelText?: string;
    spriteFrameName?: string;
    componentType?: string;
    replaceKind?: ReplaceKind;
}

type ReplaceKind = 'text' | 'image' | 'mixed' | 'other';

interface FigmaNodeCandidate {
    node: FigmaNodeData;
    path: string;
    parentPath: string;
    parentName: string;
    name: string;
    type: string;
    width: number;
    height: number;
    hasImage: boolean;
    imageRef: string;
    characters: string;
    canvasX: number;
    canvasY: number;
    replaceKind: ReplaceKind;
}

interface ReplaceApplyFlags {
    image: boolean;
    text: boolean;
    position: boolean;
    anchorPivot: boolean;
    preserveAlpha: boolean;
}

interface BatchReplaceApplyOptions {
    rootUuid?: string;
    kind?: string;
    minScore?: number;
    flags?: Partial<ReplaceApplyFlags>;
    dryRun?: boolean;
    limit?: number;
}

/**
 * @zh 把 Figma 导出统一成单棵 root。Unity 插件支持 interfaces[] 多界面导出：
 *     取所有界面绝对框的并集作为 wrapper 尺寸，各界面根节点按相对偏移挂在 wrapper 下。
 */
function prepareImportData(data: FigmaExportData): PreparedImportData {
    const interfaces = Array.isArray(data.interfaces)
        ? data.interfaces.filter((item: any) => item && item.root)
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
    const wrapper: FigmaNodeData = {
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
        children: interfaces.map((iface: any) => {
            const root = iface.root as FigmaNodeData;
            root.x = (Number(iface.offsetX) || 0) - minX;
            root.y = (Number(iface.offsetY) || 0) - minY;
            root.constraints = null;
            return root;
        }),
    };

    console.log(
        `[figma-importer] 检测到多界面导出：${interfaces.length} 个界面，` +
        `已合成 ${Math.round(wrapperW)}×${Math.round(wrapperH)} wrapper。`
    );
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
function prepareLoaderPreviewData(data: FigmaExportData): PreparedImportData {
    const interfaces = Array.isArray(data.interfaces)
        ? data.interfaces.filter((item: any) => item && item.root)
        : [];
    if (interfaces.length === 0) return prepareImportData(data);

    const first = interfaces[0];
    const root = first.root as FigmaNodeData;
    const canvas = first.canvas || data.canvas || { width: root.width || 1, height: root.height || 1 };
    return {
        name: first.name || root.name || data.name || 'untitled',
        canvas,
        root,
        images: data.images,
        interfaceCount: interfaces.length,
    };
}

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function nodeReplaceKind(node: FigmaNodeData): ReplaceKind {
    const isText = String(node.type || '').toUpperCase() === 'TEXT';
    const hasImage = !!nodeImageRef(node);
    if (isText && hasImage) return 'mixed';
    if (isText) return 'text';
    if (hasImage) return 'image';
    return 'other';
}

function collectFigmaNodeCandidates(root: FigmaNodeData): FigmaNodeCandidate[] {
    const out: FigmaNodeCandidate[] = [];
    const topCounts: { [name: string]: number } = {};
    const visit = (
        node: FigmaNodeData,
        parentPath: string,
        parentName: string,
        siblingNameCount: { [name: string]: number },
        canvasX: number,
        canvasY: number
    ) => {
        if (!node) return;
        let baseName = sanitizeFigmaPathName(node.name || '');
        if (!baseName) baseName = node.type === 'TEXT' ? 'Text' : 'Node';
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
        const childCounts: { [name: string]: number } = {};
        for (const child of node.children || []) {
            visit(
                child,
                path,
                baseName,
                childCounts,
                canvasX + (Number(child.x) || 0),
                canvasY + (Number(child.y) || 0)
            );
        }
    };
    visit(root, '', '', topCounts, Number(root.x) || 0, Number(root.y) || 0);
    return out;
}

function filterFigmaCandidatesForTarget(candidates: FigmaNodeCandidate[], target: ReplaceTargetInfo): FigmaNodeCandidate[] {
    const kind = target.replaceKind || (target.hasLabel ? 'text' : (target.hasSprite ? 'image' : 'other'));
    if (kind === 'text') return candidates.filter((item) => item.type === 'TEXT');
    if (kind === 'image') return candidates.filter((item) => item.hasImage && item.type !== 'TEXT');
    if (kind === 'mixed') return candidates.filter((item) => item.type === 'TEXT' || item.hasImage);
    return candidates;
}

function scoreFigmaNodeCandidate(
    candidate: FigmaNodeCandidate,
    target: ReplaceTargetInfo
): { candidate: FigmaNodeCandidate; score: number; reason: string } {
    const targetName = normalizeNameForCompare(target.name);
    const targetPath = normalizePathForCompare(target.scenePath);
    const targetParentName = normalizeNameForCompare(target.parentName);
    const candidateName = normalizeNameForCompare(candidate.name);
    const candidatePath = normalizePathForCompare(candidate.path);
    const candidateParentName = normalizeNameForCompare(candidate.parentName);
    let score = 0;
    const reasons: string[] = [];

    if (targetPath && candidatePath && targetPath.endsWith(candidatePath)) {
        score += 1000;
        reasons.push('path-suffix');
    }
    if (targetName && candidateName === targetName) {
        score += 320;
        reasons.push('name');
    } else if (targetName && candidateName && (targetName.includes(candidateName) || candidateName.includes(targetName))) {
        score += 120;
        reasons.push('name-contains');
    }
    if (targetParentName && candidateParentName === targetParentName) {
        score += 100;
        reasons.push('parent');
    }
    const size = sizeSimilarity(target.width, target.height, candidate.width, candidate.height);
    score += Math.round(size * 120);
    if (size > 0.85) reasons.push('size');
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

function selectBestFigmaNodeCandidate(
    candidates: FigmaNodeCandidate[],
    target: ReplaceTargetInfo,
    explicitPath?: string
): { candidate: FigmaNodeCandidate; score: number; reason: string } | null {
    const scopedCandidates = explicitPath ? candidates : filterFigmaCandidatesForTarget(candidates, target);
    if (scopedCandidates.length === 0) return null;
    const normalizedExplicitPath = normalizePathForCompare(explicitPath || '', false);
    if (normalizedExplicitPath) {
        const exact = scopedCandidates.find((item) => normalizePathForCompare(item.path, false) === normalizedExplicitPath);
        if (exact) return { candidate: exact, score: 9999, reason: 'explicit-path' };
        const suffix = scopedCandidates.find((item) => normalizePathForCompare(item.path, false).endsWith(normalizedExplicitPath));
        if (suffix) return { candidate: suffix, score: 9000, reason: 'explicit-path-suffix' };
        return null;
    }

    const targetName = normalizeNameForCompare(target.name);
    let best: { candidate: FigmaNodeCandidate; score: number; reason: string } | null = null;

    for (const candidate of scopedCandidates) {
        const scored = scoreFigmaNodeCandidate(candidate, target);
        if (!best || scored.score > best.score) best = scored;
    }
    if (!best) return null;
    const reliable = best.score >= 300 ||
        normalizeNameForCompare(best.candidate.name) === targetName ||
        normalizePathForCompare(target.scenePath).endsWith(normalizePathForCompare(best.candidate.path));
    return reliable ? best : null;
}

function listBestFigmaNodeCandidates(
    candidates: FigmaNodeCandidate[],
    target: ReplaceTargetInfo,
    limit: number
): Array<{ candidate: FigmaNodeCandidate; score: number; reason: string }> {
    const scored: Array<{ candidate: FigmaNodeCandidate; score: number; reason: string }> = [];
    const scoped = filterFigmaCandidatesForTarget(candidates, target);
    for (const candidate of scoped) {
        scored.push(scoreFigmaNodeCandidate(candidate, target));
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, limit || 5));
}

function resolveReplaceApplyFlags(flags?: Partial<ReplaceApplyFlags>): ReplaceApplyFlags {
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

function pickFigmaCandidateForApply(
    candidates: FigmaNodeCandidate[],
    target: ReplaceTargetInfo,
    figmaPath?: string
): { candidate: FigmaNodeCandidate; score: number; reason: string } | null {
    const selected = selectBestFigmaNodeCandidate(candidates, target, figmaPath);
    if (selected) return selected;
    if (figmaPath) return null;
    const top = listBestFigmaNodeCandidates(candidates, target, 1);
    return top.length > 0 && top[0].score >= 220 ? top[0] : null;
}

function sizeSimilarity(aw: number, ah: number, bw: number, bh: number): number {
    const maxW = Math.max(Math.abs(aw), Math.abs(bw), 1);
    const maxH = Math.max(Math.abs(ah), Math.abs(bh), 1);
    const sw = Math.max(0, 1 - Math.abs(aw - bw) / maxW);
    const sh = Math.max(0, 1 - Math.abs(ah - bh) / maxH);
    return (sw + sh) * 0.5;
}

function sanitizeFigmaPathName(name: string): string {
    return String(name || '').replace(/[\\/]/g, '_').trim();
}

function figmaPathSegment(nodeName: string, occurrence: number): string {
    return occurrence <= 0 ? nodeName : `${nodeName}#${occurrence + 1}`;
}

function normalizePathForCompare(path: string, stripOccurrence = true): string {
    return String(path || '')
        .split('/')
        .filter((part) => part && normalizeNameForCompare(part) !== 'canvas')
        .map((part) => normalizeNameForCompare(part, stripOccurrence))
        .filter(Boolean)
        .join('/');
}

function normalizeNameForCompare(name: string, stripOccurrence = true): string {
    let out = String(name || '');
    if (stripOccurrence) out = out.replace(/#\d+$/g, '');
    return out
        .replace(/\s+/g, '')
        .trim()
        .toLowerCase();
}

function normalizeTextForCompare(text: string): string {
    return String(text || '').replace(/\s+/g, '').trim();
}

function summarizeFigmaCandidate(candidate: FigmaNodeCandidate): any {
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

function collectSlimNodesByFigmaPath(root: any): { [path: string]: any } {
    const out: { [path: string]: any } = {};
    const topCounts: { [name: string]: number } = {};
    const visit = (node: any, parentPath: string, siblingNameCount: { [name: string]: number }) => {
        if (!node) return;
        let baseName = sanitizeFigmaPathName(node.name || '');
        if (!baseName) baseName = node.type === 'TEXT' ? 'Text' : 'Node';
        const occ = siblingNameCount[baseName] || 0;
        siblingNameCount[baseName] = occ + 1;
        const path = parentPath ? `${parentPath}/${figmaPathSegment(baseName, occ)}` : figmaPathSegment(baseName, occ);
        out[path] = node;
        const childCounts: { [name: string]: number } = {};
        for (const child of node.children || []) visit(child, path, childCounts);
    };
    visit(root, '', topCounts);
    return out;
}

function makePatchNodeForCandidate(slimByPath: { [path: string]: any }, selected: { candidate: FigmaNodeCandidate }): any {
    const slim = slimByPath[selected.candidate.path];
    const patchNode = cloneJson(slim || selected.candidate.node);
    patchNode.x = selected.candidate.canvasX;
    patchNode.y = selected.candidate.canvasY;
    return patchNode;
}

function resolveBatchApplyOptions(options?: BatchReplaceApplyOptions): {
    rootUuid: string;
    kind: string;
    minScore: number;
    flags: ReplaceApplyFlags;
    dryRun: boolean;
    limit: number;
} {
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

function resolvePreviewImageBase64(data: FigmaExportData): { ref: string; base64: string } {
    const direct = (data as any).previewImageBase64;
    if (typeof direct === 'string' && direct) return { ref: 'previewImageBase64', base64: direct };
    const ref = String((data as any).previewImageRef || '');
    const fromPool = ref && data.images && data.images[ref];
    if (fromPool) return { ref, base64: fromPool };
    const interfaces = Array.isArray((data as any).interfaces) ? (data as any).interfaces : [];
    for (const iface of interfaces) {
        if (iface && typeof iface.previewImageBase64 === 'string' && iface.previewImageBase64) {
            return { ref: 'interface.previewImageBase64', base64: iface.previewImageBase64 };
        }
        const ifaceRef = String(iface && iface.previewImageRef || '');
        const ifacePool = ifaceRef && data.images && data.images[ifaceRef];
        if (ifacePool) return { ref: ifaceRef, base64: ifacePool };
    }
    return { ref: '', base64: '' };
}

function previewMimeFromBase64(base64: string): string {
    if (!base64) return 'image/png';
    const bytes = Buffer.from(base64.slice(0, 16), 'base64');
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    return 'image/png';
}

function textureStatusFromMatches(matches: Array<{ source: 'figma-import' | 'project' }>): 'project' | 'figma-import' | 'missing' {
    if (!matches || matches.length === 0) return 'missing';
    return matches.some((item) => item.source === 'project') ? 'project' : 'figma-import';
}

async function resolveJsonPathFromDialog(presetPath: string | undefined, title: string): Promise<string> {
    if (presetPath) return presetPath;
    const picked = await Editor.Dialog.select({
        title,
        type: 'file',
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) return '';
    return picked.filePaths[0];
}

async function requestSceneSnapshot(stage: string): Promise<boolean> {
    try {
        await Editor.Message.request('scene', 'snapshot');
        console.log(`[figma-importer] 已创建场景 snapshot（${stage}）。`);
        return true;
    } catch (err) {
        console.warn(`[figma-importer] 创建场景 snapshot 失败（${stage}），继续尝试保存:`, err);
        return false;
    }
}

async function querySceneDirty(stage: string): Promise<boolean | null> {
    try {
        const dirty = await Editor.Message.request('scene', 'query-dirty');
        console.log(`[figma-importer] 场景 dirty 状态（${stage}）:`, dirty);
        return !!dirty;
    } catch (err) {
        console.warn(`[figma-importer] 查询场景 dirty 状态失败（${stage}）:`, err);
        return null;
    }
}

async function saveSceneAfterImport(result: any): Promise<void> {
    const rootUuid = result && result.data ? result.data.rootUuid : '';
    const stats = result && result.data ? result.data : {};

    // 让 Scene/Inspector 收到一次明确节点变化，再稍等一拍，避免刚落地的图片资产刷新和场景保存互相踩时序。
    if (rootUuid) {
        try {
            Editor.Message.broadcast('scene:change-node', rootUuid);
        } catch {
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
        } catch (err) {
            console.warn(`[figma-importer] 自动保存场景失败（第 ${attempt} 次，耗时 ${elapsedMs(started)}ms，可手动 Ctrl+S 刷新）:`, err);
        }
        if (attempt === 1) await delay(700);
    }

    if (rootUuid) {
        try {
            Editor.Message.broadcast('scene:change-node', rootUuid);
        } catch {
            // 同上。
        }
    }
}

/**
 * @en Pull the image pool id a node renders (own imageRef, else first IMAGE fill's imageRef).
 * @zh 取节点渲染的图片池 id：优先节点自身 imageRef，否则第一个 IMAGE 填充的 imageRef。
 */
function firstVisibleImageFill(node: FigmaNodeData): any | undefined {
    const fills = node.fills || [];
    return fills.find((f: any) => f && f.type === 'IMAGE' && f.visible !== false && f.imageRef);
}

function nodeImageRef(node: FigmaNodeData): string | undefined {
    if (node.imageRef) return node.imageRef;
    const imgFill = firstVisibleImageFill(node);
    return imgFill ? imgFill.imageRef : undefined;
}

function imageFillMeta(node: FigmaNodeData): {
    source: 'NODE' | 'FILL';
    scaleMode: string;
    opacity: number;
    tileScalingFactor?: number;
    cropRect?: any;
    imageTransform?: any;
    rawWidth?: number;
    rawHeight?: number;
    skipCoverCrop?: boolean;
} | undefined {
    const imgFill = firstVisibleImageFill(node);
    if (imgFill) {
        const scaleMode = String(imgFill.scaleMode || 'FILL').toUpperCase();
        const opacity = typeof imgFill.a === 'number'
            ? imgFill.a
            : (typeof imgFill.opacity === 'number' ? imgFill.opacity : 1);
        const meta: any = {
            source: 'FILL',
            scaleMode,
            opacity: Math.max(0, Math.min(1, opacity)),
        };
        if (scaleMode === 'TILE' && typeof imgFill.tileScalingFactor === 'number') {
            meta.tileScalingFactor = imgFill.tileScalingFactor;
        }
        if (imgFill.cropRect) meta.cropRect = imgFill.cropRect;
        if (imgFill.imageTransform) meta.imageTransform = imgFill.imageTransform;
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

function buildImageDimensionMap(images?: { [id: string]: string }): { [id: string]: ImageDimensions } {
    const out: { [id: string]: ImageDimensions } = {};
    if (!images) return out;
    for (const id of Object.keys(images)) {
        const dim = readImageDimensions(images[id]);
        if (dim) out[id] = dim;
    }
    return out;
}

function readImageDimensions(base64: string): ImageDimensions | null {
    if (!base64) return null;
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
                if (len < 2) return null;
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
    } catch {
        return null;
    }
    return null;
}

function hashText(text: string): string {
    return createHash('md5').update(text).digest('hex').slice(0, 8);
}

function cloneCropRectForPixels(cropRect: any, raw: ImageDimensions):
    { x: number; y: number; width: number; height: number } | null {
    if (!cropRect) return null;
    const x = Number(cropRect.x);
    const y = Number(cropRect.y);
    const w = Number(cropRect.w ?? cropRect.width);
    const h = Number(cropRect.h ?? cropRect.height);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
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

function imageTransformToPixelCrop(imageTransform: any, raw: ImageDimensions):
    { x: number; y: number; width: number; height: number } | null {
    if (!Array.isArray(imageTransform) || !Array.isArray(imageTransform[0]) || !Array.isArray(imageTransform[1])) {
        return null;
    }
    const m = [
        [Number(imageTransform[0][0]), Number(imageTransform[0][1]), Number(imageTransform[0][2])],
        [Number(imageTransform[1][0]), Number(imageTransform[1][1]), Number(imageTransform[1][2])],
    ];
    if (!m.flat().every(Number.isFinite)) return null;
    const pt = (x: number, y: number) => ({
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

function coverCropForPixels(raw: ImageDimensions, targetW: number, targetH: number):
    { x: number; y: number; width: number; height: number } | null {
    if (!(targetW > 0) || !(targetH > 0)) return null;
    const targetAspect = targetW / targetH;
    const rawAspect = raw.width / raw.height;
    if (!Number.isFinite(targetAspect) || targetAspect <= 0 || Math.abs(rawAspect - targetAspect) < 0.002) return null;
    if (rawAspect > targetAspect) {
        const width = raw.height * targetAspect;
        return clampCropRect({ x: (raw.width - width) * 0.5, y: 0, width, height: raw.height }, raw);
    }
    const height = raw.width / targetAspect;
    return clampCropRect({ x: 0, y: (raw.height - height) * 0.5, width: raw.width, height }, raw);
}

function clampCropRect(rect: { x: number; y: number; width: number; height: number }, raw: ImageDimensions):
    { x: number; y: number; width: number; height: number } | null {
    const x = Math.max(0, Math.min(raw.width, rect.x));
    const y = Math.max(0, Math.min(raw.height, rect.y));
    const right = Math.max(x, Math.min(raw.width, rect.x + rect.width));
    const bottom = Math.max(y, Math.min(raw.height, rect.y + rect.height));
    const width = right - x;
    const height = bottom - y;
    if (width <= 0.5 || height <= 0.5) return null;
    return { x, y, width, height };
}

function cropIsWholeImage(crop: { x: number; y: number; width: number; height: number }, raw: ImageDimensions): boolean {
    return Math.abs(crop.x) < 0.01 &&
        Math.abs(crop.y) < 0.01 &&
        Math.abs(crop.width - raw.width) < 0.01 &&
        Math.abs(crop.height - raw.height) < 0.01;
}

function preparePersistentImageVariants(
    root: FigmaNodeData,
    images: { [id: string]: string } | undefined,
    imageDims: { [id: string]: ImageDimensions }
): PersistentVariantStats {
    const stats: PersistentVariantStats = { croppedImageFills: 0, cropFailures: 0 };
    if (!root || !images) return stats;
    const variantIdByKey: { [key: string]: string } = {};

    const visit = (node: FigmaNodeData) => {
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
                        const cropped = cropPngBase64(images[fill.imageRef], crop);
                        if (cropped) {
                            variantId = `${fill.imageRef}__crop_${hashText(key)}`;
                            images[variantId] = cropped;
                            imageDims[variantId] = readImageDimensions(cropped) || {
                                width: Math.round(crop.width),
                                height: Math.round(crop.height),
                            };
                            variantIdByKey[key] = variantId;
                            stats.croppedImageFills++;
                        } else {
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
        for (const child of node.children || []) visit(child);
    };
    visit(root);
    return stats;
}

function collectSpriteFrameBorders(root: FigmaNodeData): { [imgId: string]: SpriteFrameBorder } {
    const out: { [imgId: string]: SpriteFrameBorder } = {};
    const visit = (node: FigmaNodeData) => {
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
        for (const child of node.children || []) visit(child);
    };
    visit(root);
    return out;
}

function collectMaskImageRefs(root: FigmaNodeData): Set<string> {
    const refs = new Set<string>();
    const visit = (node: FigmaNodeData) => {
        const mask = node && node.mask;
        if (mask && mask.imageRef) {
            refs.add(String(mask.imageRef));
        }
        for (const child of node.children || []) visit(child);
    };
    visit(root);
    return refs;
}

function classifyMaskAlpha(base64: string | undefined): MaskShapeKind {
    if (!base64) return 'DEGENERATE';
    try {
        const png = decodePngPixels(Buffer.from(base64, 'base64'));
        if (!png || png.width <= 2 || png.height <= 2) return 'DEGENERATE';

        const alphaThreshold = 16;
        let opaque = 0;
        for (let i = 3; i < png.rgba.length; i += 4) {
            if (png.rgba[i] > alphaThreshold) opaque++;
        }
        const pixelCount = png.width * png.height;
        const ratio = pixelCount > 0 ? opaque / pixelCount : 0;
        if (ratio < 0.01) return 'DEGENERATE';

        const alphaAt = (x: number, y: number) => png.rgba[(y * png.width + x) * 4 + 3];
        const cornersOpaque =
            alphaAt(1, 1) > alphaThreshold &&
            alphaAt(png.width - 2, 1) > alphaThreshold &&
            alphaAt(1, png.height - 2) > alphaThreshold &&
            alphaAt(png.width - 2, png.height - 2) > alphaThreshold;
        if (cornersOpaque && ratio > 0.98) return 'SOLID_RECT';
        return 'SHAPED';
    } catch (err) {
        console.warn('[figma-importer] 遮罩 alpha 分析失败，按异形图片遮罩处理:', err);
        return 'SHAPED';
    }
}

function routeMask(node: FigmaNodeData, maskImages: { [id: string]: string }): MaskRoute | null {
    const mask = node && node.mask;
    if (!mask || !mask.imageRef) return null;

    const shape = classifyMaskAlpha(maskImages[String(mask.imageRef)]);
    const maskCoversNode =
        Math.abs(Number(mask.x) || 0) <= 1 &&
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

function buildMaskRoutes(root: FigmaNodeData, images?: { [id: string]: string }): Map<FigmaNodeData, MaskRoute> {
    const routes = new Map<FigmaNodeData, MaskRoute>();
    if (!root || !images) return routes;
    const visit = (node: FigmaNodeData) => {
        const route = routeMask(node, images);
        if (route) routes.set(node, route);
        for (const child of node.children || []) visit(child);
    };
    visit(root);
    return routes;
}

function collectImageMaskRefs(root: FigmaNodeData, routes: Map<FigmaNodeData, MaskRoute>): Set<string> {
    const refs = new Set<string>();
    const visit = (node: FigmaNodeData) => {
        const route = routes.get(node);
        const mask = node && node.mask;
        if (route && route.useImageMask && mask && mask.imageRef) {
            refs.add(String(mask.imageRef));
        }
        for (const child of node.children || []) visit(child);
    };
    visit(root);
    return refs;
}

function collectImplicitSpriteFrameBorders(root: FigmaNodeData, imageDims: { [id: string]: ImageDimensions }):
    { borders: { [imgId: string]: SpriteFrameBorder }; count: number } {
    const borders: { [imgId: string]: SpriteFrameBorder } = {};
    let count = 0;
    const visit = (node: FigmaNodeData) => {
        const detected = detectImplicitSlice9(node, imageDims);
        if (detected && !borders[detected.imageRef]) {
            borders[detected.imageRef] = detected.border;
            count++;
        }
        for (const child of node.children || []) visit(child);
    };
    visit(root);
    return { borders, count };
}

function buildImplicitSliceGrid(node: FigmaNodeData, allowExplicitParent = false):
    { grid: (FigmaNodeData | null)[][]; rows: number; cols: number } | null {
    // 下限 2：单侧边距的九宫只需 2 片（固定边 + 拉伸段）。上限 9 = 3×3 的最大片数。
    if (!node || !Array.isArray(node.children) || node.children.length < 2 || node.children.length > 9) return null;
    if (!allowExplicitParent && String(node.componentType || '').toUpperCase() === 'SLICE9') return null;
    if (!allowExplicitParent && nodeImageRef(node)) return null;
    if (node.children.some((child) => !nodeImageRef(child))) return null;
    return buildSemanticSliceGrid(node.children) || buildPositionSliceGrid(node.children);
}

/**
 * @zh 对齐 Unity TrySetupAsSharedCroppedImage：
 *     父节点无图、多个直接子节点共享同一张原始大图、且大图尺寸≈父尺寸时，
 *     把父节点作为普通图片导入，跳过那些切片子节点。
 */
function detectSharedCroppedImageRef(node: FigmaNodeData, imageDims: { [id: string]: ImageDimensions }): string | undefined {
    if (!node || !Array.isArray(node.children) || node.children.length < 2) return undefined;
    if (String(node.componentType || '').toUpperCase() === 'SLICE9') return undefined;
    if (nodeImageRef(node)) return undefined;
    if (!(node.width > 0.5) || !(node.height > 0.5)) return undefined;

    let shared = '';
    let imageChildCount = 0;
    for (const child of node.children) {
        const ref = nodeImageRef(child);
        if (!ref) continue;
        imageChildCount++;
        if (!shared) shared = ref;
        else if (shared !== ref) return undefined;
    }
    if (imageChildCount < 2 || !shared) return undefined;

    const dim = imageDims[shared];
    if (!dim) return undefined;
    if (Math.abs(dim.width - node.width) > 1 || Math.abs(dim.height - node.height) > 1) {
        return undefined;
    }
    return shared;
}

const SEMANTIC_SLICE_POS: { [name: string]: { row: number; col: number } } = {
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

function detectImplicitSlice9(node: FigmaNodeData, imageDims: { [id: string]: ImageDimensions }): DetectedSlice9Info | null {
    const layout = buildImplicitSliceGrid(node);
    if (!layout) return null;
    const imageChildren = node.children;
    const shared = nodeImageRef(imageChildren[0]);
    if (!shared || imageChildren.some((child) => nodeImageRef(child) !== shared)) return null;
    const dim = imageDims[shared];
    const stitchedByImporter = (node as any).__ftocStitchedSlice9 === true;
    if (!dim || (!stitchedByImporter &&
        (Math.abs(dim.width - (node.width || 0)) > 1 || Math.abs(dim.height - (node.height || 0)) > 1))) return null;
    const stitchedBorder = (node as any).__ftocStitchedSlice9Border;
    const border = stitchedBorder
        ? normalizedSlice9Border(stitchedBorder)
        : sliceGridBorder(layout.grid, layout.rows, layout.cols);
    // 全 0 border ⇒ 没有任何固定边，当九宫无意义（也可能是 constraints 不可用且
    // 落在枚举回落之外的组合）。维持不识别，别把普通拼图当成"全 0 边九宫"。
    if (!(border.left > 0 || border.right > 0 || border.top > 0 || border.bottom > 0)) return null;
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
function prepareStitchedImplicitSlice9(
    node: FigmaNodeData,
    images: { [id: string]: string },
    imageDims: { [id: string]: ImageDimensions },
    allowExplicitParent = false,
): DetectedSlice9Info | null {
    const layout = buildImplicitSliceGrid(node, allowExplicitParent);
    if (!layout) return null;

    const cells = layout.grid.flat().filter(Boolean) as FigmaNodeData[];
    const refs = cells.map((cell) => String(nodeImageRef(cell) || ''));
    if (refs.some((ref) => !ref || !Object.prototype.hasOwnProperty.call(images, ref))) {
        console.warn(
            `[figma-importer] 疑似碎片九宫缺少图片池资源，保留原子树：${node.name || node.figmaId || '(unnamed)'}`
        );
        return null;
    }
    if (refs.every((ref) => ref === refs[0])) return null;

    const decoded: (PngPixelData | null)[][] = layout.grid.map((row) => row.map((cell) => {
        if (!cell) return null;
        const ref = String(nodeImageRef(cell) || '');
        return decodePngPixels(Buffer.from(images[ref], 'base64'));
    }));
    if (decoded.some((row) => row.some((png) => !png))) {
        console.warn(
            `[figma-importer] 碎片九宫 PNG 解码失败，保留原子树：${node.name || node.figmaId || '(unnamed)'}`
        );
        return null;
    }

    // Fractional Figma geometry can round adjacent exports by one pixel. Use the
    // largest raster in each row/column instead of rejecting an otherwise valid grid.
    const colWidths = Array.from({ length: layout.cols }, (_, col) =>
        Math.max(...decoded.map((row) => row[col]!.width)));
    const rowHeights = Array.from({ length: layout.rows }, (_, row) =>
        Math.max(...decoded[row].map((png) => png!.height)));

    const width = colWidths.reduce((sum, value) => sum + value, 0);
    const height = rowHeights.reduce((sum, value) => sum + value, 0);
    if (width <= 0 || height <= 0) return null;
    const rgba = Buffer.alloc(width * height * 4);
    let y = 0;
    for (let row = 0; row < layout.rows; row++) {
        let x = 0;
        for (let col = 0; col < layout.cols; col++) {
            const png = decoded[row][col]!;
            for (let sourceRow = 0; sourceRow < png.height; sourceRow++) {
                const sourceStart = sourceRow * png.width * 4;
                const targetStart = ((y + sourceRow) * width + x) * 4;
                png.rgba.copy(rgba, targetStart, sourceStart, sourceStart + png.width * 4);
            }
            x += colWidths[col];
        }
        y += rowHeights[row];
    }

    const stitched = encodePngPixels({ width, height, rgba });
    const stitchedRef = `ftoc_stitched_slice9_${createHash('md5').update(stitched).digest('hex').slice(0, 16)}`;
    images[stitchedRef] = stitched.toString('base64');
    imageDims[stitchedRef] = { width, height };
    const stitchedBorder: SpriteFrameBorder = {
        left: layout.cols === 3 ? colWidths[0] : 0,
        right: layout.cols === 3 ? colWidths[2] : 0,
        top: layout.rows === 3 ? rowHeights[0] : 0,
        bottom: layout.rows === 3 ? rowHeights[2] : 0,
    };
    (node as any).__ftocStitchedSlice9 = true;
    (node as any).__ftocStitchedSlice9Border = stitchedBorder;
    for (let index = 0; index < cells.length; index++) {
        rewriteNodeImageRef(cells[index], refs[index], stitchedRef);
    }

    console.log(
        `[figma-importer] Unity 风格碎片九宫已拼合：${node.name || node.figmaId || '(unnamed)'} ` +
        `${layout.rows}x${layout.cols} -> ${width}x${height}`
    );
    return {
        imageRef: stitchedRef,
        border: stitchedBorder,
        childrenToSkip: new Set(cells),
        rows: layout.rows,
        cols: layout.cols,
    };
}

function normalizedSlice9Border(border: any): SpriteFrameBorder {
    return {
        left: Math.max(0, Math.round(Number(border && border.left) || 0)),
        right: Math.max(0, Math.round(Number(border && border.right) || 0)),
        top: Math.max(0, Math.round(Number(border && border.top) || 0)),
        bottom: Math.max(0, Math.round(Number(border && border.bottom) || 0)),
    };
}

function semanticSlice9ImageRef(imageRef: string, border: SpriteFrameBorder): string {
    const normalized = normalizedSlice9Border(border);
    const signature = `${normalized.left}_${normalized.right}_${normalized.top}_${normalized.bottom}`;
    const baseRef = String(imageRef || '').replace(/__ftoc_slice9_\d+_\d+_\d+_\d+$/, '');
    return `${baseRef}__ftoc_slice9_${signature}`;
}

function rewriteNodeImageRef(node: FigmaNodeData, sourceRef: string, semanticRef: string): boolean {
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

function collapseExplicitSliceChildrenToParent(node: FigmaNodeData): void {
    const parentRef = String(nodeImageRef(node) || '');
    const layout = buildImplicitSliceGrid(node, true);
    if (!parentRef || !layout) return;
    for (const cell of layout.grid.flat()) {
        if (!cell) continue;
        const childRef = String(nodeImageRef(cell) || '');
        if (childRef) rewriteNodeImageRef(cell, childRef, parentRef);
    }
}

function pruneUnusedImagePool(
    root: FigmaNodeData,
    images: { [id: string]: string } | undefined,
    imageDims: { [id: string]: ImageDimensions },
): number {
    if (!root || !images) return 0;
    const used = new Set<string>();
    const visit = (node: FigmaNodeData) => {
        const ref = nodeImageRef(node);
        if (ref) used.add(String(ref));
        const maskRef = node && node.mask && node.mask.imageRef;
        if (maskRef) used.add(String(maskRef));
        for (const child of node.children || []) visit(child);
    };
    visit(root);

    let removed = 0;
    for (const ref of Object.keys(images)) {
        if (used.has(ref)) continue;
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
export function prepareSlice9ImageVariants(
    root: FigmaNodeData,
    images: { [id: string]: string } | undefined,
    imageDims: { [id: string]: ImageDimensions }
): Slice9ImageVariantStats {
    const stats: Slice9ImageVariantStats = {
        explicitNodes: 0,
        implicitNodes: 0,
        semanticImages: 0,
        missingImages: 0,
    };
    if (!root || !images) return stats;

    const semanticRefs = new Set<string>();
    const missingRefs = new Set<string>();
    const applyVariant = (
        nodes: FigmaNodeData[],
        imageRef: string,
        border: SpriteFrameBorder
    ): boolean => {
        const sourceRef = String(imageRef || '');
        if (!sourceRef || !Object.prototype.hasOwnProperty.call(images, sourceRef)) {
            if (sourceRef) missingRefs.add(sourceRef);
            return false;
        }

        const semanticRef = semanticSlice9ImageRef(sourceRef, border);
        const sourceImage = images[sourceRef];
        if (Object.prototype.hasOwnProperty.call(images, semanticRef) && images[semanticRef] !== sourceImage) {
            throw new Error(`[figma-importer] SLICE9 semantic image ref collision: ${semanticRef}`);
        }
        images[semanticRef] = sourceImage;
        if (imageDims[sourceRef]) imageDims[semanticRef] = imageDims[sourceRef];

        let rewritten = false;
        for (const node of nodes) {
            rewritten = rewriteNodeImageRef(node, sourceRef, semanticRef) || rewritten;
        }
        if (rewritten) semanticRefs.add(semanticRef);
        return rewritten;
    };

    const visit = (node: FigmaNodeData) => {
        if (String(node.componentType || '').toUpperCase() === 'SLICE9' && node.slice9Border) {
            const imageRef = nodeImageRef(node);
            let applied = imageRef && applyVariant([node], imageRef, normalizedSlice9Border(node.slice9Border));
            if (!applied) {
                const stitched = prepareStitchedImplicitSlice9(node, images, imageDims, true);
                if (stitched) {
                    node.imageRef = stitched.imageRef;
                    applied = applyVariant([node], stitched.imageRef, normalizedSlice9Border(node.slice9Border));
                    if (imageRef) missingRefs.delete(String(imageRef));
                }
            }
            if (applied) {
                collapseExplicitSliceChildrenToParent(node);
                stats.explicitNodes++;
            }
        } else {
            const detected = prepareStitchedImplicitSlice9(node, images, imageDims) ||
                detectImplicitSlice9(node, imageDims);
            if (detected && applyVariant(
                Array.from(detected.childrenToSkip),
                detected.imageRef,
                normalizedSlice9Border(detected.border)
            )) {
                stats.implicitNodes++;
            }
        }
        for (const child of node.children || []) visit(child);
    };
    visit(root);

    stats.semanticImages = semanticRefs.size;
    stats.missingImages = missingRefs.size;
    return stats;
}

function buildSemanticSliceGrid(children: FigmaNodeData[]):
    { grid: (FigmaNodeData | null)[][]; rows: number; cols: number } | null {
    const placed: (FigmaNodeData | null)[][] = [
        [null, null, null],
        [null, null, null],
        [null, null, null],
    ];
    for (const child of children) {
        const key = String(child.name || '').trim().toLowerCase();
        const pos = SEMANTIC_SLICE_POS[key];
        if (!pos || placed[pos.row][pos.col]) return null;
        placed[pos.row][pos.col] = child;
    }
    return compactSliceGrid(placed);
}

function buildPositionSliceGrid(children: FigmaNodeData[]):
    { grid: (FigmaNodeData | null)[][]; rows: number; cols: number } | null {
    if (!children.every((child) => String(child.name || '').toLowerCase() === 'rectangle')) return null;
    const xs = clusterNumbers(children.map((child) => Number(child.x) || 0), 2);
    const ys = clusterNumbers(children.map((child) => Number(child.y) || 0), 2);
    // 不再枚举 3x1 / 1x3 / 3x3：任意 rows×cols（各 1..3，1×1 除外）都可能是切片布局。
    // 单侧边距只需 1×2 / 2×1，相邻两侧需 2×2，一轴两侧+另一轴单侧需 2×3 / 3×2
    //（原先"只认 3/9"正是钉钉反馈 #34 的根因之一）。哪几侧是固定边交由
    // sliceGridBorder 按 constraints 判定；判不出来会返回全 0，调用方据此判失败。
    if (xs.length < 1 || xs.length > 3 || ys.length < 1 || ys.length > 3) return null;
    if (xs.length === 1 && ys.length === 1) return null;              // 单片不是切片
    if (xs.length * ys.length !== children.length) return null;       // 网格必须完整
    const grid: (FigmaNodeData | null)[][] = Array.from({ length: ys.length }, () => Array.from({ length: xs.length }, () => null));
    for (const child of children) {
        const col = nearestClusterIndex(xs, Number(child.x) || 0);
        const row = nearestClusterIndex(ys, Number(child.y) || 0);
        if (row < 0 || col < 0 || grid[row][col]) return null;
        grid[row][col] = child;
    }
    if (grid.some((row) => row.some((cell) => !cell))) return null;
    // 纯位置聚类只看"N 个矩形紧密平铺"，而导入端为带子节点的 RECTANGLE 造的 bgRect
    // 一律是 STRETCH/STRETCH，几个凑在一起完全满足几何条件 ⇒ 会被误判成九宫、
    // 整块按 SLICE9 处理，平铺/普通图语义随之丢失（钉钉反馈 #40）。
    // 所以位置路径必须复核：至少有一片"贴边固定"。
    // 语义命名路径（buildSemanticSliceGrid，top-l/center/… ）不受此限——
    // 命名本身已表达切片语义，那些素材通常压根不带 constraints。
    // 与导出端 geometryFallbackWithFixedEdgeCheck 同线。
    if (!hasAnyFixedEdgeSlice(grid, ys.length, xs.length)) return null;
    return { grid, rows: ys.length, cols: xs.length };
}

function compactSliceGrid(placed: (FigmaNodeData | null)[][]):
    { grid: (FigmaNodeData | null)[][]; rows: number; cols: number } | null {
    const rowUsed = placed.map((row) => row.some(Boolean));
    const colUsed = [0, 1, 2].map((col) => placed.some((row) => !!row[col]));
    const rows = rowUsed.filter(Boolean).length;
    const cols = colUsed.filter(Boolean).length;
    if (!((rows === 1 && cols === 3) || (rows === 3 && cols === 1) || (rows === 3 && cols === 3))) return null;
    const grid = placed
        .filter((_, row) => rowUsed[row])
        .map((row) => row.filter((_, col) => colUsed[col]));
    if (grid.some((row) => row.some((cell) => !cell))) return null;
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
function classifyAxisFixedEdges(
    grid: (FigmaNodeData | null)[][], rows: number, cols: number, horizontal: boolean,
): { startFixed: boolean; endFixed: boolean } | null {
    const trackCount = horizontal ? cols : rows;
    const kinds: string[] = [];
    for (let t = 0; t < trackCount; t++) {
        let kind: string | null = null;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if ((horizontal ? c : r) !== t) continue;
                const cell = grid[r][c];
                if (!cell) return null;
                const cons: any = cell.constraints;
                const raw = cons ? String(horizontal ? cons.horizontal : cons.vertical || '') : '';
                let k: string;
                if (raw === 'LEFT' || raw === 'TOP') k = 'START';
                else if (raw === 'RIGHT' || raw === 'BOTTOM') k = 'END';
                else if (raw === 'LEFT_RIGHT' || raw === 'TOP_BOTTOM' || raw === 'SCALE') k = 'STRETCH';
                else return null;      // CENTER / 缺失 ⇒ 不构成切片语义
                if (kind === null) kind = k;
                else if (kind !== k) return null;   // 同轨约束不一致
            }
        }
        if (kind === null) return null;
        kinds.push(kind);
    }
    if (trackCount === 1) return kinds[0] === 'STRETCH' ? { startFixed: false, endFixed: false } : null;
    if (trackCount === 2) {
        if (kinds[0] === 'START' && kinds[1] === 'STRETCH') return { startFixed: true, endFixed: false };
        if (kinds[0] === 'STRETCH' && kinds[1] === 'END') return { startFixed: false, endFixed: true };
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
function hasAnyFixedEdgeSlice(
    grid: (FigmaNodeData | null)[][], rows: number, cols: number,
): boolean {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            const cons: any = cell && cell.constraints;
            if (!cons) continue;
            const h = String(cons.horizontal || '');
            const v = String(cons.vertical || '');
            if (h === 'LEFT' || h === 'RIGHT' || v === 'TOP' || v === 'BOTTOM') return true;
        }
    }
    return false;
}

function sliceGridBorder(grid: (FigmaNodeData | null)[][], rows: number, cols: number): SpriteFrameBorder {
    const xEdges = classifyAxisFixedEdges(grid, rows, cols, true);
    const yEdges = classifyAxisFixedEdges(grid, rows, cols, false);
    if (xEdges && yEdges && (xEdges.startFixed || xEdges.endFixed || yEdges.startFixed || yEdges.endFixed)) {
        return {
            left: xEdges.startFixed ? Number(grid[0][0] && grid[0][0]!.width) || 0 : 0,
            right: xEdges.endFixed ? Number(grid[0][cols - 1] && grid[0][cols - 1]!.width) || 0 : 0,
            top: yEdges.startFixed ? Number(grid[0][0] && grid[0][0]!.height) || 0 : 0,
            bottom: yEdges.endFixed ? Number(grid[rows - 1][0] && grid[rows - 1][0]!.height) || 0 : 0,
        };
    }

    // ── 回落：原枚举规则（constraints 不可用的老素材）─────────────
    if (rows === 1 && cols === 3) {
        return {
            left: Number(grid[0][0] && grid[0][0]!.width) || 0,
            right: Number(grid[0][2] && grid[0][2]!.width) || 0,
            top: 0,
            bottom: 0,
        };
    }
    if (rows === 3 && cols === 1) {
        return {
            left: 0,
            right: 0,
            top: Number(grid[0][0] && grid[0][0]!.height) || 0,
            bottom: Number(grid[2][0] && grid[2][0]!.height) || 0,
        };
    }
    if (rows === 3 && cols === 3) {
        return {
            left: Number(grid[0][0] && grid[0][0]!.width) || 0,
            right: Number(grid[0][2] && grid[0][2]!.width) || 0,
            top: Number(grid[0][0] && grid[0][0]!.height) || 0,
            bottom: Number(grid[2][0] && grid[2][0]!.height) || 0,
        };
    }
    // 其余组合在没有 constraints 时无法判断哪侧固定，返回全 0 交由调用方判失败。
    return { left: 0, right: 0, top: 0, bottom: 0 };
}

function clusterNumbers(values: number[], tolerance: number): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const clusters: Array<{ sum: number; count: number; value: number }> = [];
    for (const value of sorted) {
        const last = clusters[clusters.length - 1];
        if (last && Math.abs(value - last.value) <= tolerance) {
            last.sum += value;
            last.count++;
            last.value = last.sum / last.count;
        } else {
            clusters.push({ sum: value, count: 1, value });
        }
    }
    return clusters.map((cluster) => cluster.value);
}

function nearestClusterIndex(clusters: number[], value: number): number {
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

function firstVisibleSolidFill(node: FigmaNodeData): any | undefined {
    const fills = node.fills || [];
    return fills.find((f: any) => f && f.type === 'SOLID' && f.visible !== false);
}

function colorFromFigmaFill(fill: any): { r: number; g: number; b: number; a: number } | undefined {
    if (!fill) return undefined;
    if (fill.gradientMode && fill.gradientColorA && fill.gradientColorB) {
        return averageFigmaColor(fill.gradientColorA, fill.gradientColorB);
    }
    return {
        r: Math.round((fill.r ?? 1) * 255),
        g: Math.round((fill.g ?? 1) * 255),
        b: Math.round((fill.b ?? 1) * 255),
        a: Math.round((fill.a ?? 1) * 255),
    };
}

function rgba255FromFigmaColor(c: any, fallback: { r: number; g: number; b: number; a: number }): { r: number; g: number; b: number; a: number } {
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
function textColor(node: FigmaNodeData): { r: number; g: number; b: number; a: number } | undefined {
    return colorFromFigmaFill(firstVisibleSolidFill(node));
}

function textGradient(node: FigmaNodeData): { mode: string; a: { r: number; g: number; b: number; a: number }; b: { r: number; g: number; b: number; a: number } } | undefined {
    const fills = node.fills || [];
    const fill = fills.find((f: any) =>
        f && f.type === 'SOLID' && f.visible !== false && f.gradientMode && f.gradientColorA && f.gradientColorB
    );
    if (!fill) return undefined;
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
function normalizeNewlines(s: string): string {
    if (!s) return s;
    // CRLF/CR then U+2028 / U+2029 line separators collapse to a single \n
    return s.replace(/\r\n?/g, '\n').replace(/[\u2028\u2029]/g, '\n');
}

function normalizeTextSegments(node: FigmaNodeData): any[] | undefined {
    const segments = Array.isArray(node.textSegments) ? node.textSegments : [];
    if (segments.length <= 1) return undefined;
    const chars = normalizeNewlines(node.characters || '');
    const out = segments.map((seg: any) => {
        const rawRgb = seg.color ? [Number(seg.color.r), Number(seg.color.g), Number(seg.color.b)] : [];
        const rgbIsUnitRange = rawRgb.length === 3 && rawRgb.every((value) =>
            Number.isFinite(value) && value >= 0 && value <= 1);
        const toByte = (value: any, unitRange: boolean, fallback: number): number => {
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
    }).filter((seg: any) => seg.end > seg.start);
    if (out.length <= 1) return undefined;
    const first = out[0];
    const sizeMixed = out.some((seg: any) => Math.abs((seg.fontSize || 0) - (first.fontSize || 0)) > 0.01);
    const colorMixed = out.some((seg: any) => !sameColor(seg.color, first.color));
    return sizeMixed || colorMixed ? out : undefined;
}

function sameColor(a: any, b: any): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/**
 * @en First visible SOLID stroke → LabelOutline params (color 0-255 + width). 对齐 Unity TryGetStroke。
 * @zh 取第一个可见 SOLID 描边 → LabelOutline 参数（颜色 0~255 + 宽度）。无可见描边返回 undefined。
 */
function textStroke(node: FigmaNodeData): { color: { r: number; g: number; b: number; a: number }; width: number } | undefined {
    const strokes = node.strokes || [];
    const s = strokes.find((k: any) => k && k.visible !== false && k.type === 'SOLID');
    if (!s) return undefined;
    return {
        color: {
            r: Math.round((s.r ?? 0) * 255),
            g: Math.round((s.g ?? 0) * 255),
            b: Math.round((s.b ?? 0) * 255),
            a: Math.round((s.a ?? 1) * 255),
        },
        width: node.strokeWeight || 0,
    };
}

/**
 * @en First visible DROP_SHADOW effect → LabelShadow params (color 0-255 + offset + blur).
 * @zh 取第一个可见 DROP_SHADOW → LabelShadow 参数（颜色 0~255 + 偏移 + 模糊）。对齐 Unity ExtractEffects。
 *     注意：Figma Y 向下为正，Cocos Y 向上为正，offsetY 在 scene 侧翻符号（这里只透传原值）。
 */
function textShadow(node: FigmaNodeData): { color: { r: number; g: number; b: number; a: number }; offsetX: number; offsetY: number; blur: number } | undefined {
    const effects = node.effects || [];
    const e = effects.find((k: any) => k && k.visible !== false && k.type === 'DROP_SHADOW');
    if (!e) return undefined;
    return {
        color: {
            r: Math.round((e.r ?? 0) * 255),
            g: Math.round((e.g ?? 0) * 255),
            b: Math.round((e.b ?? 0) * 255),
            a: Math.round((e.a ?? 1) * 255),
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
function slimTree(
    node: FigmaNodeData,
    fontLib: FontLibEntry[],
    textStyleLib: TextStyleLibrary,
    fontTracker: FontDemandTracker,
    textStyleTracker: TextStyleTracker,
    textStyleTemplateTracker: TextStyleTemplateTracker,
    imageDims: { [id: string]: ImageDimensions },
    maskRoutes: Map<FigmaNodeData, MaskRoute>,
    stats: SlimStats
): any {
    const implicitSlice9 = detectImplicitSlice9(node, imageDims);
    const explicitSliceGrid = String(node.componentType || '').toUpperCase() === 'SLICE9'
        ? buildImplicitSliceGrid(node, true)
        : null;
    const explicitSliceChildren = explicitSliceGrid
        ? new Set(explicitSliceGrid.grid.flat().filter(Boolean) as FigmaNodeData[])
        : null;
    const sharedCroppedImageRef = implicitSlice9 ? undefined : detectSharedCroppedImageRef(node, imageDims);
    if (implicitSlice9) {
        stats.implicitSlice9Images++;
    }
    if (sharedCroppedImageRef) {
        stats.sharedCroppedImages++;
    }
    const slim: any = {
        figmaId: node.figmaId,
        name: node.name,
        type: node.type,
        figmaType: node.figmaType,
        componentKey: String(node.componentKey || ''),
        componentProperties: normalizeComponentProperties(node.componentProperties),
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
                if (explicitSliceChildren && explicitSliceChildren.has(c)) return false;
                if (implicitSlice9 && implicitSlice9.childrenToSkip.has(c)) {
                    stats.implicitSlice9SliceChildren++;
                    return false;
                }
                if (!sharedCroppedImageRef || nodeImageRef(c) !== sharedCroppedImageRef) return true;
                stats.sharedCroppedSliceChildren++;
                return false;
            })
            .map((c) => slimTree(c, fontLib, textStyleLib, fontTracker, textStyleTracker, textStyleTemplateTracker, imageDims, maskRoutes, stats)),
    };
    if (sharedCroppedImageRef) slim.sharedCroppedImage = true;
    if (implicitSlice9) {
        slim.componentType = 'SLICE9';
        slim.slice9Border = implicitSlice9.border;
        slim.implicitSlice9 = { rows: implicitSlice9.rows, cols: implicitSlice9.cols };
    }
    if (node.overlayTint) slim.overlayTint = node.overlayTint;
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
    if (node.constraints) slim.constraints = node.constraints;
    if (node.layoutMode) slim.layoutMode = node.layoutMode;
    if (node.layoutWrap) slim.layoutWrap = node.layoutWrap;
    if (node.layoutPositioning) slim.layoutPositioning = node.layoutPositioning;
    // Figma native GRID uses explicit tracks rather than Auto Layout wrap.
    // Keep these scalar fields in the slim import contract; dropping them
    // silently turns a native grid into absolute positioning on the Cocos side.
    if (node.layoutMode === 'GRID') {
        for (const key of ['gridRowCount', 'gridColumnCount', 'gridRowGap', 'gridColumnGap']) {
            if (typeof node[key] === 'number' && Number.isFinite(node[key])) slim[key] = node[key];
        }
    }
    // AutoLayout 排布参数（scene.ts applyLayout 读取，缺则 spacingX/对齐全归 0）
    if (typeof node.itemSpacing === 'number') slim.itemSpacing = node.itemSpacing;
    if (typeof node.counterAxisSpacing === 'number') slim.counterAxisSpacing = node.counterAxisSpacing;
    if (node.primaryAxisAlignItems) slim.primaryAxisAlignItems = node.primaryAxisAlignItems;
    if (node.counterAxisAlignItems) slim.counterAxisAlignItems = node.counterAxisAlignItems;
    if (node.padding) slim.padding = {
        top: node.padding.top || 0,
        right: node.padding.right || 0,
        bottom: node.padding.bottom || 0,
        left: node.padding.left || 0,
    };
    if (node.clipsContent) slim.clipsContent = true;
    if (node.componentType) slim.componentType = node.componentType;
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
    if (typeof node.cornerRadius === 'number') slim.cornerRadius = node.cornerRadius;
    if (Array.isArray(node.cornerRadii)) slim.cornerRadii = node.cornerRadii;
    if (node.slice9Border) slim.slice9Border = {
        left: node.slice9Border.left || 0,
        right: node.slice9Border.right || 0,
        top: node.slice9Border.top || 0,
        bottom: node.slice9Border.bottom || 0,
    };
    if (node.type !== 'TEXT') {
        const solid = firstVisibleSolidFill(node);
        const color = colorFromFigmaFill(solid);
        if (color) slim.solidFill = { color };
    }
    // 图片遮罩：只透传坐标 + 池 id（maskRef 查 idToSpriteFrame，与节点图共池）
    if (node.mask) {
        const maskRoute = maskRoutes.get(node);
        if (maskRoute && maskRoute.useImageMask) stats.imageMasks++;
        if (maskRoute && !maskRoute.useImageMask) stats.rectMaskFallbacks++;
        if (maskRoute && maskRoute.shape === 'DEGENERATE') stats.degenerateMasks++;
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
        if (gradient) slim.textGradient = gradient;
        const segments = normalizeTextSegments(node);
        if (segments) slim.textSegments = segments;
        slim.textStyle = extractTextStyleMeta(node);
        textStyleTracker.record(node);
        // 阶段 5 字体样式库：描边/投影从 Figma 直接派生（Cocos 组件可生成，无需美术预配），
        // 字体族匹配到工程字体资源 uuid（未命中 → 不带 → scene 回退默认字体）。
        const stroke = textStroke(node);
        if (stroke) slim.stroke = stroke;
        const shadow = textShadow(node);
        if (shadow) slim.shadow = shadow;
        let font = matchFont(node.fontFamily, node.fontWeight, fontLib);
        const textStyleMatch = resolveTextStyleTemplate(node, textStyleLib);
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
        fontTracker.recordDemand(
            node.fontFamily,
            node.fontWeight,
            !!font,
            font ? undefined : explainFontMiss(node.fontFamily, node.fontWeight, fontLib)
        );
    }
    return slim;
}

/**
 * @en Prepare the scene-process payload from parsed Figma JSON.
 * @zh 把 Figma JSON 准备成 scene 脚本可消费的 payload。主导入与替换 beta 共用同一条链路。
 */
async function prepareScenePayloadFromData(data: FigmaExportData): Promise<PreparedScenePayload> {
    reportMappingDiagnostics(data);
    const prepared = prepareImportData(data);
    const imageDims = buildImageDimensionMap(prepared.images);
    const variantStats = preparePersistentImageVariants(prepared.root, prepared.images, imageDims);
    if (variantStats.croppedImageFills > 0 || variantStats.cropFailures > 0) {
        console.log(
            `[figma-importer] 持久化 IMAGE fill 裁切：生成 ${variantStats.croppedImageFills} 张裁切 PNG` +
            `${variantStats.cropFailures > 0 ? `，${variantStats.cropFailures} 张裁切失败回退运行时裁切` : ''}。`
        );
    }
    const slice9VariantStats = prepareSlice9ImageVariants(prepared.root, prepared.images, imageDims);
    if (slice9VariantStats.semanticImages > 0 || slice9VariantStats.missingImages > 0) {
        console.log(
            `[figma-importer] SLICE9 图片语义隔离：` +
            `${slice9VariantStats.explicitNodes} 个显式节点，${slice9VariantStats.implicitNodes} 个隐式节点，` +
            `${slice9VariantStats.semanticImages} 个 border 图片引用` +
            `${slice9VariantStats.missingImages > 0 ? `，${slice9VariantStats.missingImages} 个原图引用缺失` : ''}。`
        );
    }
    const explicitSpriteFrameBorders = collectSpriteFrameBorders(prepared.root);
    const implicitSpriteFrameBorders = collectImplicitSpriteFrameBorders(prepared.root, imageDims);
    const spriteFrameBorders = {
        ...implicitSpriteFrameBorders.borders,
        ...explicitSpriteFrameBorders,
    };
    if (implicitSpriteFrameBorders.count > 0) {
        console.log(`[figma-importer] 检测到 ${implicitSpriteFrameBorders.count} 个 Unity 风格隐式三/九切片节点，按 SLICE9 导入。`);
    }
    const maskRoutes = buildMaskRoutes(prepared.root, prepared.images);
    const unusedImages = pruneUnusedImagePool(prepared.root, prepared.images, imageDims);
    if (unusedImages > 0) {
        console.log(`[figma-importer] 图片池清理：跳过 ${unusedImages} 张当前场景未引用的图片。`);
    }
    const slimStats: SlimStats = {
        sharedCroppedImages: 0,
        sharedCroppedSliceChildren: 0,
        implicitSlice9Images: 0,
        implicitSlice9SliceChildren: 0,
        imageMasks: 0,
        rectMaskFallbacks: 0,
        degenerateMasks: 0,
    };
    let idToSpriteFrame: { [id: string]: string } = {};
    let idToMaskSpriteFrame: { [id: string]: string } = {};
    const assetImportFailures: any[] = [];
    // 主进程保留完整 meta 收敛状态；scene IPC 只接收 imgRef -> dbUrl 的轻量投影。
    let pendingSpriteFrames: { [id: string]: PendingSpriteFrame } = {};
    if (prepared.images && Object.keys(prepared.images).length > 0) {
        const maskRefs = collectImageMaskRefs(prepared.root, maskRoutes);
        const maskImages: { [id: string]: string } = {};
        for (const ref of maskRefs) {
            if (prepared.images[ref]) maskImages[ref] = prepared.images[ref];
        }
        console.log(`[figma-importer] landing ${Object.keys(prepared.images).length} images...`);
        const commonDirs = await readCommonResourceDirs();
        console.log(`[figma-importer] AssetDB 阶段 profile ready: ${commonDirs.join(', ')}`);
        const res = await landImages(prepared.images, prepared.name || 'untitled', spriteFrameBorders, commonDirs);
        idToSpriteFrame = res.idToSpriteFrame;
        pendingSpriteFrames = res.unresolved || {};
        for (const [imgRef, failure] of Object.entries(res.failures || {})) {
            assetImportFailures.push({ imgRef, kind: 'sprite', ...failure });
        }
        if (Object.keys(pendingSpriteFrames).length > 0) {
            const readiness = await resolveSpriteFramesBeforeBuild(pendingSpriteFrames);
            Object.assign(idToSpriteFrame, readiness.resolved);
            pendingSpriteFrames = readiness.unresolved;
            console.log(
                `[figma-importer] 建树前 SpriteFrame 就绪检查：` +
                `${Object.keys(readiness.resolved).length} 张已收敛，${Object.keys(pendingSpriteFrames).length} 张仍未就绪。`
            );
        }
        console.log(`[figma-importer] landed ${Object.keys(idToSpriteFrame).length} sprite frames`);
        if (Object.keys(maskImages).length > 0) {
            console.log(`[figma-importer] landing ${Object.keys(maskImages).length} mask images...`);
            const maskRes = await landMaskImages(maskImages, prepared.name || 'untitled', commonDirs);
            idToMaskSpriteFrame = maskRes.idToSpriteFrame;
            for (const [imgRef, failure] of Object.entries(maskRes.failures || {})) {
                assetImportFailures.push({ imgRef, kind: 'mask', ...failure });
            }
            const unresolvedMasks = maskRes.unresolved || {};
            if (Object.keys(unresolvedMasks).length > 0) {
                const readiness = await resolveSpriteFramesBeforeBuild(unresolvedMasks);
                Object.assign(idToMaskSpriteFrame, readiness.resolved);
                if (Object.keys(readiness.unresolved).length > 0) {
                    console.warn(
                        `[figma-importer] ${Object.keys(readiness.unresolved).length} 张遮罩 SpriteFrame ` +
                        `在建树前仍未就绪，将按矩形遮罩降级。`
                    );
                }
            }
            console.log(`[figma-importer] landed ${Object.keys(idToMaskSpriteFrame).length} mask sprite frames`);
        }
    }
    if (assetImportFailures.length > 0) {
        console.error('[figma-importer] 资源导入硬失败清单：', assetImportFailures);
    }
    const fontLib = await scanFontLibrary();
    const textStyleLib = await scanTextStyleLibrary(fontLib);
    const fontTracker = new FontDemandTracker();
    const textStyleTracker = new TextStyleTracker();
    const textStyleTemplateTracker = new TextStyleTemplateTracker();
    const slim = slimTree(prepared.root, fontLib, textStyleLib, fontTracker, textStyleTracker, textStyleTemplateTracker, imageDims, maskRoutes, slimStats);
    lastComponentIdentities = collectComponentIdentities(slim);
    const mappingDocument = readComponentMappingDocument();
    const resolvedMappings = await resolveComponentMappingAssets(mappingDocument);
    if (lastComponentIdentities.length > 0 || mappingDocument.entries.length > 0) {
        console.log(
            `[figma-importer] 组件映射：本次发现 ${lastComponentIdentities.length} 个组件身份，` +
            `${resolvedMappings.valid} 条 Prefab 可用，${resolvedMappings.broken} 条断链。`
        );
    }
    if (slimStats.sharedCroppedImages > 0) {
        console.log(
            `[figma-importer] 检测到 ${slimStats.sharedCroppedImages} 个共享大图切片节点，` +
            `已跳过 ${slimStats.sharedCroppedSliceChildren} 个切片子节点。`
        );
    }
    if (slimStats.implicitSlice9Images > 0) {
        console.log(
            `[figma-importer] 检测到 ${slimStats.implicitSlice9Images} 个隐式三/九切片节点，` +
            `已跳过 ${slimStats.implicitSlice9SliceChildren} 个切片子节点。`
        );
    }
    if (slimStats.imageMasks > 0 || slimStats.rectMaskFallbacks > 0) {
        console.log(
            `[figma-importer] 图片遮罩路由：${slimStats.imageMasks} 个保留 Sprite stencil，` +
            `${slimStats.rectMaskFallbacks} 个退回矩形裁剪` +
            `${slimStats.degenerateMasks > 0 ? `（其中 ${slimStats.degenerateMasks} 个近乎空白）` : ''}。`
        );
    }
    const payload = {
        canvas: prepared.canvas,
        root: slim,
        idToSpriteFrame,
        idToMaskSpriteFrame,
        unresolved: Object.fromEntries(
            Object.entries(pendingSpriteFrames).map(([imgRef, pending]) => [imgRef, pending.dbUrl])
        ),
        componentMappings: resolvedMappings.entries,
        componentStateRuntimeReady,
        importMeta: {
            interfaceCount: prepared.interfaceCount,
            componentIdentities: lastComponentIdentities.length,
            componentMappings: resolvedMappings.valid,
            brokenComponentMappings: resolvedMappings.broken,
            assetImportFailures: assetImportFailures.length,
            assetImportFailureSample: assetImportFailures.slice(0, 10),
            ...slimStats,
        },
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
async function buildFromData(data: FigmaExportData): Promise<any> {
    const importStartMs = Date.now();
    const assetDbSession = beginAssetDbSession(`导入「${data.name || 'untitled'}」`);
    const startStr = new Date(importStartMs).toLocaleString();
    console.log(`%c========== 导入开始于 ${startStr} · 构建版本 = ${BUILD_VERSION} ==========`, 'color:#0a0;font-weight:bold');
    let result: any;
    // 失败埋点用的「当前步骤」标记：抛异常时据此判断卡在哪一步（准备负载 / 建树 / 落盘保存）。
    let step = 'prepare';
    try {
        step = 'componentStateRuntime';
        let componentStateReady = false;
        try {
            componentStateReady = await ensureComponentStateRuntime();
        } catch (runtimeError) {
            rethrowIfAssetDbUnavailable(runtimeError);
            componentStateRuntimeReady = false;
            console.warn(
                `[figma-importer] ${COMPONENT_STATE_RUNTIME_CLASS} 安装或升级失败，` +
                '本次导入将继续并把组件状态记为 unavailable：',
                (runtimeError as any)?.message || runtimeError
            );
        }
        if (!componentStateReady) {
            console.warn(
                `[figma-importer] ${COMPONENT_STATE_RUNTIME_CLASS} 尚未完成注册；` +
                '组件映射可继续，但本次状态字段会明确记为 unavailable。'
            );
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
        let placeholderReport: { total: number; replaced: number; stillMissing: number } | null = null;
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
            trackImport({ durationMs: Date.now() - importStartMs });
        } else {
            console.warn('[figma-importer] buildTree 未成功，跳过自动保存，避免落盘半截场景。', result);
            // 埋点：建树返回失败（未抛异常）→ 上报 cocos_import_failed，否则成功率永远算不出分母。
            trackImportFailed('buildTree', (result && (result.error || result.message)) || 'buildTree returned success=false', {
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
    } catch (err) {
        // 埋点：导入抛异常 → 上报 cocos_import_failed（step 指出卡在哪一步，message 已脱敏+截断）。
        // 不吞异常：仍 rethrow 给上层原有的 console.error/弹窗逻辑，行为与改动前一致。
        // trackImportFailed 内部按 error 对象去重，上层 catch 再报同一个 err 不会重复计数。
        trackImportFailed(step, err, { durationMs: Date.now() - importStartMs });
        throw err;
    } finally {
        endAssetDbSession(assetDbSession);
        const elapsedSec = ((Date.now() - importStartMs) / 1000).toFixed(1);
        const ok = result && result.success !== false;
        console.log(`%c========== 导入结束${ok ? '' : '（未成功）'}。耗时 ${elapsedSec} s ==========`, `color:${ok ? '#0a0' : '#c62828'};font-weight:bold`);
    }
}

async function resolvePreparedPlaceholders(
    result: any,
    pendingSpriteFrames: { [imgRef: string]: PendingSpriteFrame },
): Promise<{ total: number; replaced: number; stillMissing: number } | null> {
    const placeholders: any[] = (result && result.data && result.data.unresolvedPlaceholders) || [];
    if (placeholders.length === 0) return null;
    return resolveAndReplacePlaceholders(placeholders, pendingSpriteFrames);
}

/**
 * @zh 后台轮询「已落盘但 meta/子资源未就绪」的图直到 SpriteFrame 完整收敛，
 *     再一次性替换品红占位为真图。同一资源的多个占位每轮只解析一次。
 * 就绪的批量交 scene.replaceImagePlaceholders 替换；超时仍未就绪的极少数保留品红（不报错）。
 * 返回 { total, replaced, stillMissing } 供完成弹窗汇总。
 */
export async function resolveAndReplacePlaceholders(
    placeholders: any[],
    pendingByImgRef: { [imgRef: string]: PendingSpriteFrame } = {},
): Promise<{ total: number; replaced: number; stillMissing: number }> {
    const total = placeholders.length;
    const MAX_TRIES = 50;      // 50 × 300ms ≈ 15s 总预算
    const INTERVAL_MS = 300;
    console.log(`[figma-importer] ${total} 张图待就绪替换，开始后台轮询…`);

    const pendingByPlaceholder: { [placeholderId: string]: PendingSpriteFrame } = {};
    for (let index = 0; index < placeholders.length; index++) {
        const ph = placeholders[index];
        const imgRef = String(ph && ph.imgRef || '');
        const dbUrl = String(ph && ph.dbUrl || '');
        if (!dbUrl) continue;
        pendingByPlaceholder[String(index)] = pendingByImgRef[imgRef] || createPendingFigmaSpriteFrame(
            dbUrl,
            ph && ph.slice9Border || undefined,
        );
    }
    const readiness = Object.keys(pendingByPlaceholder).length > 0
        ? await resolveSpriteFramesBeforeBuild(
            pendingByPlaceholder,
            MAX_TRIES,
            INTERVAL_MS,
        )
        : { resolved: {}, unresolved: {} };

    const resolvedItems: any[] = [];
    const unresolvedUrls = new Set<string>();
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
        } else {
            const dbUrl = String(ph && ph.dbUrl || '');
            if (dbUrl) unresolvedUrls.add(dbUrl);
        }
    }
    if (unresolvedUrls.size > 0) {
        const sample = Array.from(unresolvedUrls).slice(0, 5).join(', ');
        console.warn(
            `[figma-importer] ${unresolvedUrls.size} 张资源始终未就绪，相关节点保留品红占位` +
            `${sample ? `：${sample}` : ''}`
        );
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
async function showImportDoneDialog(
    result: any,
    placeholderReport: { total: number; replaced: number; stillMissing: number } | null
): Promise<void> {
    try {
        const d = (result && result.data) || {};
        const sprites = Number(d.sprites) || 0;
        const stillMissing = (placeholderReport ? placeholderReport.stillMissing : 0) + (Number(d.missingImages) || 0);
        const lines: string[] = [];
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
    } catch (err) {
        // 弹窗失败不影响导入结果，仅记日志
        console.warn('[figma-importer] 导入完成弹窗失败（忽略）：', err);
    }
}

/**
 * @en Log missing-font demand as console warnings (no file, no dialog).
 * @zh 缺失字体只打 console.warn（对齐 Unity：纯日志，不写文件、不弹窗）。
 *     铁律：绝不写任何文件——写文件会触发 Cocos 工程刷新、打断刚建好的场景渲染（背景图曾因此消失）。
 */
function reportFontDemand(tracker: FontDemandTracker): void {
    const defaultFallbackCount = tracker.getDefaultFallbackCount();
    if (!tracker.hasMissing()) {
        if (defaultFallbackCount > 0) {
            console.log(
                `[figma-importer] 字体资源命中 ${tracker.getMatchedCount()} 处，` +
                `${defaultFallbackCount} 处按规则使用默认字体回退。`
            );
            for (const item of tracker.getDefaultFallback()) {
                console.log(
                    `[figma-importer]   默认回退「${item.family}${item.weight ? ' ' + item.weight : ''}」× ${item.count} 处`
                );
            }
        } else {
            console.log(`[figma-importer] 字体全部命中（${tracker.getMatchedCount()} 处文本）。`);
        }
        return;
    }
    const missing = tracker.getMissing();
    console.warn(
        `[figma-importer] 字体需求：${tracker.getMatchedCount()} 处已命中，` +
        `${missing.length} 种字体缺失（已回退默认字体）` +
        `${defaultFallbackCount > 0 ? `，另有 ${defaultFallbackCount} 处按规则默认回退` : ''}。`
    );
    for (const m of missing) {
        console.warn(
            `[figma-importer]   缺失字体「${m.family}${m.weight ? ' ' + m.weight : ''}」× ${m.count} 处` +
            `（${m.reason ? `${m.reason}；` : ''}放入 assets/art/figma-fonts/ 并以字体名/字重命名即可命中）`
        );
    }
    for (const item of tracker.getDefaultFallback()) {
        console.log(
            `[figma-importer]   默认回退「${item.family}${item.weight ? ' ' + item.weight : ''}」× ${item.count} 处`
        );
    }
}

/**
 * @en Handle a JSON string pushed from the Figma plugin over HTTP.
 *     Normal pushes open the unified workbench; explicit automation may still bypass it.
 * @zh 处理 Figma 插件经 HTTP 推来的 JSON。普通推送先进入统一工作台，只有显式自动化参数才直接建树。
 */
async function handlePushedJson(json: string, name: string, options?: PushOptions): Promise<void> {
    try {
        console.log(`[figma-importer] 收到推送「${name || '(未命名)'}」，${json.length} 字节`);
        const data = JSON.parse(json) as FigmaExportData;

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
        const delivery: any = await Editor.Message.request(
            'figma-importer',
            'accept-pushed-json',
            workbenchOptions,
        );
        if (!delivery || delivery.success === false) {
            throw new Error(delivery && delivery.error || 'FtoC 导入工作台未确认推送');
        }
        await Editor.Panel.focus(workbenchPanel);
        const activated = await activateCocosEditorApplication();
        if (process.platform === 'darwin' && !activated) {
            console.warn('[figma-importer] JSON 已送达工作台，但 macOS 前台激活失败。');
        }
        if (!await Editor.Panel.has(workbenchPanel)) {
            throw new Error('FtoC 导入工作台聚焦后意外关闭');
        }
        console.log(`[figma-importer] 推送已送达并聚焦导入工作台，等待预览确认：${filePath}`);
    } catch (err) {
        console.error('[figma-importer] 处理推送 JSON 失败:', err);
        // 埋点：推送导入失败（解析 JSON 等失败也算）。buildFromData 内部已报过的会被去重。
        trackImportFailed('handlePushedJson', err);
    }
}

/**
 * @en Registration method for the main process of Extension.
 * @zh 为扩展的主进程的注册方法。
 */
export const methods: { [key: string]: (...args: any[]) => any } = {
    async openReplacePanelBeta(preset?: string | { jsonPath?: string }) {
        const exactWorkspacePath = !!preset && typeof preset === 'object';
        const requestedPath = normalizeCurrentJsonPath(
            preset && typeof preset === 'object' ? preset.jsonPath : preset,
        );
        const jsonPath = exactWorkspacePath
            ? requestedPath
            : requestedPath || await readCurrentJsonPath();
        if (exactWorkspacePath || requestedPath) await writeCurrentJsonPath(jsonPath);
        return Editor.Panel.open('figma-importer.replace', { jsonPath });
    },

    openSettingsPanel(options?: { jsonPath?: string; section?: string; source?: string }) {
        return Editor.Panel.open('figma-importer.settings', options || {});
    },

    async clearCurrentJsonPath(expectedPath?: string) {
        const result = await currentJsonPathCoordinator.clearIfCurrent(expectedPath);
        return { success: true, data: result };
    },

    async setCurrentJsonPath(filePath?: string) {
        const currentPath = await currentJsonPathCoordinator.write(filePath);
        return { success: true, data: { currentPath } };
    },

    /** @zh 兼容旧入口：组件映射现在收进统一工作台，不再打开第二套用户流程。 */
    openComponentMappingPanel() {
        return Editor.Panel.open('figma-importer.settings', { section: 'mapping' });
    },

    /** @zh 面板：查询推送服务运行状态,供功能面板显示开关态。 */
    getPushServerStatus() {
        return { success: true, data: { running: isPushServerRunning() } };
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
    async scanComponentIdentitiesFromJson(presetPath?: string) {
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
            const raw = JSON.parse(readFileSync(filePath, 'utf8')) as FigmaExportData;
            if (!raw || !raw.root) return { success: false, error: 'Invalid Figma JSON: missing root' };
            lastComponentIdentities = collectComponentIdentities(raw.root);
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
        } catch (err: any) {
            console.error('[figma-importer] scanComponentIdentitiesFromJson failed:', err);
            return { success: false, error: err && err.message || String(err) };
        }
    },

    /** @zh 面板：绑定显式指定的 Prefab；未指定时兼容 Project 面板当前选中的 Prefab。 */
    async upsertComponentMapping(payload?: Partial<ComponentMappingEntry>) {
        const componentKey = String(payload && payload.componentKey || '').trim();
        if (!componentKey) return { success: false, error: 'Missing componentKey' };
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
        const saved = await mutateComponentMappingDocument((document) =>
            upsertMappingEntry(document, {
                componentKey,
                componentName: String(payload && payload.componentName || '').trim(),
                prefabUuid: selectedPrefab.uuid,
                prefabUrl: selectedPrefab.dbUrl,
                variantFilter: String(payload && payload.variantFilter || '').trim(),
            })
        );
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
    async removeComponentMapping(componentKey?: string, variantFilter?: string) {
        const key = String(componentKey || '').trim();
        if (!key) return { success: false, error: 'Missing componentKey' };
        const saved = await mutateComponentMappingDocument((document) =>
            removeMappingEntry(document, key, String(variantFilter || '').trim())
        );
        console.log('[figma-importer] 组件映射已解绑：', { componentKey: key, variantFilter: String(variantFilter || '').trim() });
        return { success: true, data: { document: saved, dbUrl: COMPONENT_MAPPING_DB_URL } };
    },

    /** @zh 面板：写通用资源目录列表（只保留 db:// 且去重）。 */
    async setCommonResourceDirs(dirs: string[]) {
        const clean: string[] = [];
        for (const d of Array.isArray(dirs) ? dirs : []) {
            const url = String(d || '').trim().replace(/\/+$/, '');
            if (url.startsWith('db://') && clean.indexOf(url) === -1) clean.push(url);
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
                url = await requestAssetDb<string>('query-url', abs, [abs]);
            } catch { url = ''; }
            if (!url) {
                // 兜底：绝对路径相对工程 assets 前缀相减（与 dbUrlToAssetPath 反向）。
                const projectPath = (Editor as any).Project && (Editor as any).Project.path;
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
            if (current.indexOf(url) === -1) current.push(url);
            await Editor.Profile.setConfig('figma-importer', COMMON_DIRS_KEY, current);
            return { success: true, data: { dirs: current, added: url } };
        } catch (err: any) {
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
        } catch (err) {
            console.error('[figma-importer] createTestNode failed:', err);
        }
    },

    /**
     * @en Pick a Figma export JSON, read it, and build the node tree (stage 1: position/size only).
     * @zh 选一个 Figma 导出 JSON，读进来，建节点树（阶段 1：只摆位置和尺寸）。
     */
    async importFromJson(presetPath?: string) {
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
            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
            return await buildFromData(data);
        } catch (err) {
            console.error('[figma-importer] importFromJson failed:', err);
            // 埋点：菜单导入失败（读文件/解析 JSON 等 buildFromData 之前的失败也算导入失败）。
            // buildFromData 内部已上报过的 err 会被去重，不会重复计数。
            trackImportFailed('importFromJson', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：从 Figma JSON 生成 Cocos 侧 TextStyles 样式库。
     *     对齐 Unity 字体导入器：优先使用 TextStyles/文字样式 根；找不到则从整棵界面抽取所有文字节点。
     */
    async generateTextStylesFromJsonBeta(presetPath?: string) {
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
            if (!filePath) return { success: false, error: 'No file path' };

            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
            const generated = generateTextStyleLibraryFromData(data);
            if (generated.entries.length === 0) {
                console.warn('[figma-importer] 生成 TextStyles 样式库失败：JSON 中没有可用文字节点。');
                return { success: false, error: 'No text style entries' };
            }

            await ensureAssetFolder(TEXT_STYLE_LIB_DIR);
            // 对齐纲领：一个工程一套字体样式库，固定名 TextStyles（JSON 与美术手存的 prefab 同名才能配对）。
            const TEXT_STYLE_LIB_NAME = 'TextStyles';
            const dbUrl = `${TEXT_STYLE_LIB_DIR}/${TEXT_STYLE_LIB_NAME}.json`;
            const payload = {
                version: 1,
                generator: 'figma-importer',
                buildVersion: BUILD_VERSION,
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

            const fontLib = await scanFontLibrary();
            const library = await scanTextStyleLibrary(fontLib);
            console.log(
                `[figma-importer] 已生成 TextStyles 样式库索引（beta）：${dbUrl}`,
                {
                    uuid: info.uuid,
                    entries: generated.entries.length,
                    mode: generated.stats.mode,
                    styleRoot: generated.styleRootPath || '(整棵 JSON)',
                    scannedEntries: library.entries.length,
                }
            );

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
                console.log(
                    `%c[figma-importer] 已在场景生成「${rootName}」模板节点树（${leafCount} 个 Label 叶子）。`,
                    'color:#0a0;font-weight:bold'
                );
                console.log(
                    `[figma-importer] 下一步（美术）：在层级里给各 Label 手配字体/描边/投影至与 Figma 一致，` +
                    `然后把「${rootName}」节点拖进「${TEXT_STYLE_LIB_DIR}/」存成 ${rootName}.prefab。` +
                    `导入套用时会克隆这份 prefab 的模板节点。`
                );
            } else {
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
        } catch (err) {
            console.error('[figma-importer] generateTextStylesFromJsonBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：用一份 Figma JSON 重建当前选中的 UI 根节点。
     *     这不是另一套渲染逻辑，而是复用正式导入 payload，在原父节点/原层级位置替换整棵子树。
     */
    async replaceSelectedFromJsonBeta(presetPath?: string) {
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
            if (!filePath) return { success: false, error: 'No file path' };

            console.log(`%c[figma-importer] 开始替换选中 UI 根（beta） · 构建版本 = ${BUILD_VERSION}`, 'color:#0a0;font-weight:bold');
            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
            await ensureComponentStateRuntimeBestEffort();
            const preparedPayload = await prepareScenePayloadFromData(data);
            const result = await callScene('replaceTreeBeta', {
                ...preparedPayload.payload,
                targetUuid,
            });
            console.log('[figma-importer] replaceTreeBeta result:', result);

            if (result && result.success !== false) {
                lastImportedJsonForPull = JSON.stringify(data, null, 4);
                lastImportedNameForPull = data.name || preparedPayload.prepared.name || '';
                lastImportedRootUuid = result && result.data ? (result.data.rootUuid || '') : '';
                await finalizeComponentStateTargets(result);
                await resolvePreparedPlaceholders(result, preparedPayload.pendingSpriteFrames);
                await saveSceneAfterImport(result);
            } else {
                console.warn('[figma-importer] replaceTreeBeta 未成功，跳过自动保存。', result);
            }

            preparedPayload.textStyleTracker.report();
            preparedPayload.textStyleTemplateTracker.report(preparedPayload.textStyleLib);
            reportFontDemand(preparedPayload.fontTracker);

            return result;
        } catch (err) {
            console.error('[figma-importer] replaceSelectedFromJsonBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：从 JSON 中找到与当前选中 Cocos 节点最匹配的 Figma 节点，并只替换这棵子树。
     *     这是 Unity Loader/ResourceReplace 的无窗口核心能力：匹配节点后仍复用正式 buildTree。
     */
    async replaceSelectedMatchedNodeFromJsonBeta(presetPath?: string, figmaPath?: string) {
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
            const target = targetResult.data as ReplaceTargetInfo;

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
            if (!filePath) return { success: false, error: 'No file path' };

            console.log(`%c[figma-importer] 开始局部替换选中节点（beta） · 构建版本 = ${BUILD_VERSION}`, 'color:#0a0;font-weight:bold');
            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
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
            const subData: FigmaExportData = {
                version: data.version,
                name: matchedNode.name || data.name || 'FigmaNode',
                canvas: matchPrepared.canvas,
                root: matchedNode,
                images: cloneJson(data.images || {}),
                previewImageRef: data.previewImageRef,
            };
            await ensureComponentStateRuntimeBestEffort();
            const preparedPayload = await prepareScenePayloadFromData(subData);
            const result = await callScene('replaceTreeBeta', {
                ...preparedPayload.payload,
                targetUuid,
            });
            console.log('[figma-importer] replaceSelectedMatchedNodeFromJsonBeta result:', result);

            if (result && result.success !== false) {
                lastImportedJsonForPull = JSON.stringify(subData, null, 4);
                lastImportedNameForPull = matchedNode.name || data.name || '';
                lastImportedRootUuid = result && result.data ? (result.data.rootUuid || '') : '';
                await finalizeComponentStateTargets(result);
                await resolvePreparedPlaceholders(result, preparedPayload.pendingSpriteFrames);
                await saveSceneAfterImport(result);
            } else {
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

            return {
                ...result,
                match: {
                    target: target.scenePath || target.name,
                    figmaPath: selected.candidate.path,
                    score: selected.score,
                    reason: selected.reason,
                },
            };
        } catch (err) {
            console.error('[figma-importer] replaceSelectedMatchedNodeFromJsonBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：扫描 JSON 源资源与选中实例树的可替换目标，输出自动匹配候选。
     *     这是 Unity ResourceReplaceWindow 的无窗口数据层：左侧源图/字、右侧目标组件、名称/路径/尺寸/内容评分。
     */
    async scanJsonReplaceCandidatesBeta(presetPath?: string, kind = 'all', rootUuidArg?: string) {
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于扫描替换候选的 Figma JSON');
            if (!filePath) return { success: false, error: 'Canceled' };

            const rootUuid = rootUuidArg || getSelectedNodeUuid() || lastImportedRootUuid;
            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
            const prepared = prepareImportData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(prepared.root);
            const sourceTexts = candidates
                .filter((item) => item.type === 'TEXT')
                .map(summarizeFigmaCandidate);
            const sourceImagesByRef: { [ref: string]: any } = {};
            for (const item of candidates.filter((candidate) => candidate.hasImage && candidate.type !== 'TEXT')) {
                const key = item.imageRef || item.path;
                if (!sourceImagesByRef[key]) {
                    sourceImagesByRef[key] = {
                        ...summarizeFigmaCandidate(item),
                        occurrences: 0,
                        allRects: [],
                    };
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

            const targets = (targetResult.data.targets || []) as ReplaceTargetInfo[];
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
            const assignmentsBySource: { [path: string]: any[] } = {};
            for (const item of matches) {
                if (!item.best || item.best.score < 300) continue;
                const path = item.best.source.path;
                if (!assignmentsBySource[path]) assignmentsBySource[path] = [];
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
        } catch (err) {
            console.error('[figma-importer] scanJsonReplaceCandidatesBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：加载 Figma JSON 的整帧预览图与命中框数据（只读，不落盘）。
     *     对齐 Unity LoaderWindow 的预览数据层：优先使用导出自带 previewImageRef/previewImageBase64。
     */
    async loadJsonPreviewBeta(presetPath?: string, includeImage = true, includeSources = true) {
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于预览的 Figma JSON');
            if (!filePath) return { success: false, error: 'Canceled' };

            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
            const prepared = prepareLoaderPreviewData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(prepared.root);
            const preview = resolvePreviewImageBase64(data);
            const sourceImagesByRef: { [ref: string]: any } = {};
            const sourceTexts: any[] = [];
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
                    } else if (candidate.hasImage && candidate.imageRef) {
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
                variantFilter: buildVariantFilter(candidate.node.componentProperties),
                componentProperties: normalizeComponentProperties(candidate.node.componentProperties),
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
        } catch (err) {
            console.error('[figma-importer] loadJsonPreviewBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：贴图预览/缺失扫描。对齐 Unity TexturePreviewWindow：
     *     按唯一 Figma 图片内容扫描项目资源，区分正式资源命中、仅 Figma 导入目录命中、完全缺失。
     */
    async scanJsonTexturesBeta(presetPath?: string, includeImage = true, onlyMissing = false) {
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于贴图预览的 Figma JSON');
            if (!filePath) return { success: false, error: 'Canceled' };

            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
            const prepared = prepareLoaderPreviewData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(prepared.root)
                .filter((candidate) => candidate.hasImage && candidate.imageRef);
            const projectIndex = await scanProjectTextureIndex(await readCommonResourceDirs());
            const byRef: { [ref: string]: any } = {};

            for (const candidate of candidates) {
                const imageRef = candidate.imageRef;
                if (!imageRef) continue;
                const base64 = data.images && data.images[imageRef] || '';
                if (!base64) continue;
                if (!byRef[imageRef]) {
                    const hashed = hashImageBase64(base64);
                    const matches = hashed ? (projectIndex.byHash[hashed.hash] || []) : [];
                    const best = pickAnyTextureMatch(matches);
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
                        allRects: [] as TexturePreviewOccurrence[],
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

            let entries = Object.values(byRef) as any[];
            entries.sort((a, b) => {
                const rank = (item: any) => item.status === 'missing' ? 0 : (item.status === 'figma-import' ? 1 : 2);
                const ar = rank(a);
                const br = rank(b);
                if (ar !== br) return ar - br;
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
            if (onlyMissing) entries = entries.filter((item) => item.status === 'missing' || item.status === 'figma-import');

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
        } catch (err) {
            console.error('[figma-importer] scanJsonTexturesBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：提前导入贴图预览里缺失的 Figma 图片。复用正式 landImages 链路，避免另起资产导入规则。
     */
    async importMissingTexturesBeta(presetPath?: string, includeFigmaImportFound = false) {
        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于提前导入缺失贴图的 Figma JSON');
            if (!filePath) return { success: false, error: 'Canceled' };

            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
            const prepared = prepareLoaderPreviewData(cloneJson(data));
            const scan = await methods.scanJsonTexturesBeta(filePath, false, false);
            if (!scan || scan.success === false || !scan.data) {
                return { success: false, error: scan && scan.error || 'scanJsonTexturesBeta failed' };
            }
            const entries = (scan.data.entries || []).filter((entry: any) =>
                entry && (entry.status === 'missing' || (includeFigmaImportFound && entry.status === 'figma-import'))
            );
            const imagesToLand: { [id: string]: string } = {};
            for (const entry of entries) {
                const ref = String(entry.imageRef || '');
                if (ref && data.images && data.images[ref]) imagesToLand[ref] = data.images[ref];
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
            const spriteFrameBorders = {
                ...collectImplicitSpriteFrameBorders(prepared.root, imageDims).borders,
                ...collectSpriteFrameBorders(prepared.root),
            };
            const landed = await landImages(imagesToLand, prepared.name || data.name || 'untitled', spriteFrameBorders, await readCommonResourceDirs());
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
        } catch (err) {
            console.error('[figma-importer] importMissingTexturesBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：把 JSON 中匹配到的单个 Figma 节点应用到当前选中 Cocos 节点。
     *     对齐 Unity FigmaNodeReplacer.Apply：可分开应用图片、文字、位置；不重命名、不递归替换子节点。
     */
    async applyMatchedNodeToSelectedBeta(
        presetPath?: string,
        figmaPath?: string,
        flags?: Partial<ReplaceApplyFlags>
    ) {
        const targetUuid = getSelectedNodeUuid();
        if (!targetUuid) {
            console.warn('[figma-importer] 应用匹配节点失败：请先在层级里选中要修补的节点。');
            return { success: false, error: 'No selected target node' };
        }

        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于应用到选中节点的 Figma JSON');
            if (!filePath) return { success: false, error: 'Canceled' };

            const targetResult = await callScene('describeNodeForReplaceBeta', { uuid: targetUuid });
            if (!targetResult || targetResult.success === false || !targetResult.data) {
                return { success: false, error: targetResult && targetResult.error || 'describeNodeForReplaceBeta failed' };
            }
            const target = targetResult.data as ReplaceTargetInfo;
            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
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
            const subData: FigmaExportData = {
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
            } else {
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

            return {
                ...result,
                match: {
                    target: target.scenePath || target.name,
                    figmaPath: selected.candidate.path,
                    score: selected.score,
                    reason: selected.reason,
                },
            };
        } catch (err) {
            console.error('[figma-importer] applyMatchedNodeToSelectedBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：捕获指定替换目标的原始状态，供 ResourceReplace 单行还原使用。
     */
    async snapshotReplaceTargetBeta(targetUuid?: string) {
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
        } catch (err) {
            console.error('[figma-importer] snapshotReplaceTargetBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：把单行替换目标恢复到此前捕获的 snapshot，并自动保存刷新场景。
     */
    async restoreReplaceTargetBeta(snapshotOrPayload?: any) {
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
            } else if (!result || result.success === false) {
                console.warn('[figma-importer] restoreReplaceTargetBeta 未成功，跳过自动保存。', result);
            }
            return result;
        } catch (err) {
            console.error('[figma-importer] restoreReplaceTargetBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：在 Hierarchy 中定位并选中指定替换目标。
     */
    async selectReplaceTargetBeta(targetUuid?: string) {
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
        } catch (err) {
            console.error('[figma-importer] selectReplaceTargetBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：面板逐行应用。按 targetUuid 指定 Cocos 目标，按 figmaPath/自动匹配指定源节点。
     *     与 applyMatchedNodeToSelectedBeta 同一条 scene applyNodePatchBeta 链路，但不依赖当前选中。
     */
    async applyJsonNodeToTargetBeta(
        presetPath?: string,
        targetUuid?: string,
        figmaPath?: string,
        flags?: Partial<ReplaceApplyFlags>
    ) {
        if (!targetUuid) {
            console.warn('[figma-importer] 逐行应用失败：缺少 targetUuid。');
            return { success: false, error: 'Missing targetUuid' };
        }

        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于应用到目标节点的 Figma JSON');
            if (!filePath) return { success: false, error: 'Canceled' };

            const targetResult = await callScene('describeNodeForReplaceBeta', { uuid: targetUuid });
            if (!targetResult || targetResult.success === false || !targetResult.data) {
                return { success: false, error: targetResult && targetResult.error || 'describeNodeForReplaceBeta failed' };
            }
            const target = targetResult.data as ReplaceTargetInfo;
            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
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
            const subData: FigmaExportData = {
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
            } else {
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

            return {
                ...result,
                match: {
                    target: target.scenePath || target.name,
                    targetUuid,
                    figmaPath: selected.candidate.path,
                    score: selected.score,
                    reason: selected.reason,
                },
            };
        } catch (err) {
            console.error('[figma-importer] applyJsonNodeToTargetBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：把 JSON 中自动匹配到的多个 Figma 节点批量应用到选中/最近导入根下的目标组件。
     *     对齐 Unity ResourceReplaceWindow 的“按行勾选后批量应用”核心能力；默认只应用可信匹配。
     */
    async applyMatchedNodesToSelectedRootBeta(
        presetPath?: string,
        options?: BatchReplaceApplyOptions
    ) {
        try {
            const resolved = resolveBatchApplyOptions(options);
            const rootUuid = resolved.rootUuid || getSelectedNodeUuid() || lastImportedRootUuid;
            if (!rootUuid) {
                console.warn('[figma-importer] 批量应用失败：请先选中要作为目标的 UI 根节点。');
                return { success: false, error: 'No selected target root' };
            }

            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于批量应用的 Figma JSON');
            if (!filePath) return { success: false, error: 'Canceled' };

            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
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

            const targets = ((targetResult.data.targets || []) as ReplaceTargetInfo[])
                .slice(0, resolved.limit > 0 ? resolved.limit : undefined);
            const planned: any[] = [];
            const skipped: any[] = [];
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
            const applied: any[] = [];
            const failed: any[] = [];
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
                } else {
                    failed.push({
                        ...detail,
                        error: result && result.error || 'applyNodePatchBeta failed',
                    });
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
        } catch (err) {
            console.error('[figma-importer] applyMatchedNodesToSelectedRootBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @zh beta：从 JSON 中找到匹配的 Figma 节点，并把完整子树挂到当前选中节点下。
     *     对齐 Unity FigmaNodeReplacer.AttachAsChild：递归创建子树，不覆盖父节点。
     */
    async attachMatchedNodeAsChildBeta(
        presetPath?: string,
        figmaPath?: string,
        options?: { parentUuid?: string; siblingIndex?: number }
    ) {
        const parentUuid = options && options.parentUuid || getSelectedNodeUuid();
        if (!parentUuid) {
            console.warn('[figma-importer] 挂载匹配节点失败：请先在层级里选中父节点。');
            return { success: false, error: 'No selected parent node' };
        }

        try {
            const filePath = await resolveJsonPathFromDialog(presetPath, '选择用于挂载子节点的 Figma JSON');
            if (!filePath) return { success: false, error: 'Canceled' };

            const parentResult = await callScene('describeNodeForReplaceBeta', { uuid: parentUuid });
            if (!parentResult || parentResult.success === false || !parentResult.data) {
                return { success: false, error: parentResult && parentResult.error || 'describeNodeForReplaceBeta failed' };
            }
            const parentTarget = parentResult.data as ReplaceTargetInfo;
            const raw = readFileSync(filePath, 'utf-8');
            const data = JSON.parse(raw) as FigmaExportData;
            const preparedForMatch = prepareImportData(cloneJson(data));
            const candidates = collectFigmaNodeCandidates(preparedForMatch.root);
            let selected = selectBestFigmaNodeCandidate(candidates, parentTarget, figmaPath);
            if (!selected && !figmaPath) {
                const top = listBestFigmaNodeCandidates(candidates, parentTarget, 1)[0];
                if (top && top.score >= 220) selected = top;
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
            const subData: FigmaExportData = {
                version: data.version,
                name: matchedNode.name || data.name || 'FigmaNode',
                canvas: preparedForMatch.canvas,
                root: matchedNode,
                images: cloneJson(data.images || {}),
                previewImageRef: data.previewImageRef,
            };
            await ensureComponentStateRuntimeBestEffort();
            const preparedPayload = await prepareScenePayloadFromData(subData);
            const result = await callScene('buildTree', {
                ...preparedPayload.payload,
                parentUuid,
                siblingIndex: options && typeof options.siblingIndex === 'number' ? options.siblingIndex : -1,
                rootCanvasAbsolute: {
                    x: selected.candidate.canvasX,
                    y: selected.candidate.canvasY,
                },
            });
            console.log('[figma-importer] attachMatchedNodeAsChildBeta result:', result);

            if (result && result.success !== false) {
                lastImportedJsonForPull = JSON.stringify(subData, null, 4);
                lastImportedNameForPull = matchedNode.name || data.name || '';
                lastImportedRootUuid = result && result.data ? (result.data.rootUuid || '') : '';
                await finalizeComponentStateTargets(result);
                await resolvePreparedPlaceholders(result, preparedPayload.pendingSpriteFrames);
                await saveSceneAfterImport(result);
            } else {
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

            return {
                ...result,
                match: {
                    parent: parentTarget.scenePath || parentTarget.name,
                    figmaPath: selected.candidate.path,
                    score: selected.score,
                    reason: selected.reason,
                },
            };
        } catch (err) {
            console.error('[figma-importer] attachMatchedNodeAsChildBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },

    /**
     * @en Menu: start the local push server (127.0.0.1:8787) and persist the on-state.
     * @zh 菜单：启动本地推送服务（127.0.0.1:8787）并记住开启状态（重载后自动续上）。
     */
    async startPushServer() {
        const res = await startPushServer(handlePushedJson);
        if (res.ok) {
            await Editor.Profile.setConfig('figma-importer', PUSH_ENABLED_KEY, true);
            console.log('[figma-importer] 推送服务已开启，可在 Figma 插件点「推送」。');
        } else {
            console.error(`[figma-importer] 推送服务启动失败：${res.error}`);
        }
    },

    /**
     * @en Menu: stop the local push server and clear the on-state.
     * @zh 菜单：停止本地推送服务并清除开启状态。
     */
    async stopPushServer() {
        await stopPushServer();
        await Editor.Profile.setConfig('figma-importer', PUSH_ENABLED_KEY, false);
        console.log('[figma-importer] 推送服务已停止。');
    },

    async stageLastImportForFigmaPull() {
        if (!lastImportedJsonForPull) {
            console.warn('[figma-importer] 暂无可暂存的最近导入 JSON。请先导入或接收一次 Figma 推送。');
            return { success: false, error: 'No imported JSON in memory' };
        }
        const ok = setPendingPullJson(lastImportedJsonForPull);
        if (ok) {
            console.log(
                `[figma-importer] 已暂存最近导入「${lastImportedNameForPull || '(未命名)'}」供 Figma 插件 /pull 拉取（beta）。`
            );
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

            const ok = setPendingPullJson(result.data.json);
            if (!ok) return { success: false, error: 'Failed to stage pending pull JSON' };

            const stats = result.data.stats || {};
            console.log(
                `[figma-importer] 已从 ${source} 反导「${result.data.name || '(未命名)'}」并暂存供 Figma /pull 拉取（beta）。`,
                {
                    canvas: result.data.canvas,
                    rootUuid: result.data.rootUuid,
                    nodes: stats.nodes,
                    texts: stats.texts,
                    sprites: stats.sprites,
                    images: stats.images,
                    missingImages: stats.missingImages,
                    warnings: Array.isArray(result.data.warnings) ? result.data.warnings.length : 0,
                }
            );
            return {
                success: true,
                name: result.data.name,
                rootUuid: result.data.rootUuid,
                stats,
            };
        } catch (err) {
            console.error('[figma-importer] exportTreeForFigmaPull failed:', err);
            return { success: false, error: String(err) };
        }
    },

    async pushTreeToFigma() {
        const result = await methods.exportTreeForFigmaPull();
        if (result && result.success !== false) {
            console.log('[figma-importer] 已推送到 Figma 拉取队列：请在 Figma 插件点击「从 Unity 拉取」。');
        }
        return result;
    },

    async exportTreeToJsonFile(presetPath?: string) {
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
                const projectPath = (Editor as any).Project && (Editor as any).Project.path || process.cwd();
                const defaultDir = join(projectPath, 'FigmaExport');
                mkdirSync(defaultDir, { recursive: true });
                const picked = await Editor.Dialog.save({
                    title: '保存导出 JSON',
                    path: join(defaultDir, `${exportName}.json`),
                    filters: [{ name: 'JSON', extensions: ['json'] }],
                    button: '保存',
                });
                if (picked.canceled || !picked.filePath) {
                    return { success: false, error: 'Canceled' };
                }
                filePath = ensureJsonExtension(picked.filePath);
            }

            mkdirSync(dirname(filePath), { recursive: true });
            writeFileSync(filePath, result.data.json, 'utf8');
            const stats = result.data.stats || {};
            console.log(
                `[figma-importer] 已将 ${source}「${result.data.name || exportName}」导出为 Figma JSON：${filePath}`,
                {
                    rootUuid: result.data.rootUuid,
                    nodes: stats.nodes,
                    texts: stats.texts,
                    sprites: stats.sprites,
                    images: stats.images,
                    missingImages: stats.missingImages,
                    warnings: Array.isArray(result.data.warnings) ? result.data.warnings.length : 0,
                }
            );
            return {
                success: true,
                filePath,
                name: result.data.name,
                rootUuid: result.data.rootUuid,
                stats,
            };
        } catch (err) {
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
            console.log(
                `[figma-importer] 已将 ${source}「${prefabName}」保存为 Prefab（beta）：${dbUrl}`,
                {
                    uuid: lastSavedPrefabUuid,
                    nodes: result.data.stats && result.data.stats.nodes,
                    sprites: result.data.stats && result.data.stats.sprites,
                    labels: result.data.stats && result.data.stats.labels,
                }
            );
            return {
                success: true,
                dbUrl,
                uuid: lastSavedPrefabUuid,
                name: prefabName,
                stats: result.data.stats,
            };
        } catch (err) {
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

            console.log(
                `[figma-importer] 已实例化 Prefab（beta）「${prefab.name}」。`,
                result.data
            );
            return result;
        } catch (err) {
            console.error('[figma-importer] instantiatePrefabBeta failed:', err);
            return { success: false, error: String(err) };
        }
    },
};

/**
 * @en Method Triggered on Extension Startup.
 * @zh 扩展启动时触发的方法。
 */
export async function load() {
    console.log(`%c[figma-importer] 扩展已加载 · 构建版本 = ${BUILD_VERSION}`, 'color:#0a0;font-weight:bold');
    // 自动续上：上次开启过推送服务就自动恢复（对齐 Unity EditorPrefs 自动续上）。
    try {
        const enabled = await Editor.Profile.getConfig('figma-importer', PUSH_ENABLED_KEY);
        if (enabled) {
            const res = await startPushServer(handlePushedJson);
            if (res.ok) console.log('[figma-importer] 推送服务已自动续上。');
        }
    } catch (err) {
        console.error('[figma-importer] 自动续上推送服务失败:', err);
    }
}

/**
 * @en Method triggered when uninstalling the extension.
 * @zh 卸载扩展时触发的方法。
 */
export async function unload() {
    if (isPushServerRunning()) await stopPushServer();
    console.log('[figma-importer] extension unloaded');
}
