import { readFileSync } from 'fs';
import { basename, join } from 'path';
import { normalizeCurrentJsonPath, readCurrentJsonPath } from '../../json-workspace-state';

type PanelElementMap = {
    app?: HTMLElement;
    status?: HTMLElement;
    version?: HTMLElement;
    jsonPath?: HTMLInputElement;
    browseBtn?: HTMLButtonElement;
    clearBtn?: HTMLButtonElement;
    dropZone?: HTMLElement;
    filePreview?: HTMLElement;
    previewFile?: HTMLElement;
    previewName?: HTMLElement;
    previewCanvas?: HTMLElement;
    previewStats?: HTMLElement;
    previewSection?: HTMLElement;
    previewMeta?: HTMLElement;
    previewViewport?: HTMLElement;
    previewStage?: HTMLElement;
    previewPlaceholder?: HTMLElement;
    previewImage?: HTMLImageElement;
    previewOverlay?: HTMLElement;
    selectionSummary?: HTMLElement;
    selectionHits?: HTMLElement;
    zoomOutBtn?: HTMLButtonElement;
    zoomInBtn?: HTMLButtonElement;
    zoomLabel?: HTMLElement;
    actualSizeBtn?: HTMLButtonElement;
    fitPreviewBtn?: HTMLButtonElement;
    reloadPreviewBtn?: HTMLButtonElement;
    importBtn?: HTMLButtonElement;
    replacePanelBtn?: HTMLButtonElement;
    workspaceSplit?: HTMLElement;
    mappingSection?: HTMLElement;
    mappingSplitter?: HTMLElement;
    mappingSummary?: HTMLElement;
    mappingRefreshBtn?: HTMLButtonElement;
    componentSearch?: HTMLInputElement;
    includeNested?: HTMLInputElement;
    hideMapped?: HTMLInputElement;
    componentList?: HTMLElement;
    mappingList?: HTMLElement;
    dirList?: HTMLElement;
    addBtn?: HTMLButtonElement;
    resetBtn?: HTMLButtonElement;
    pushState?: HTMLElement;
    pushStartBtn?: HTMLButtonElement;
    pushStopBtn?: HTMLButtonElement;
    genStyleBtn?: HTMLButtonElement;
    exportBtn?: HTMLButtonElement;
    pushFigmaBtn?: HTMLButtonElement;
};

type PreviewHit = {
    path: string;
    name?: string;
    kind?: string;
    type?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    imageRef?: string;
    text?: string;
    componentKey?: string;
    componentName?: string;
    variantFilter?: string;
    componentProperties?: { [key: string]: string };
};

type JsonPreview = {
    filePath: string;
    name?: string;
    canvas?: { width?: number; height?: number };
    previewImageDataUrl?: string;
    stats?: {
        hits?: number;
        texts?: number;
        images?: number;
        interfaceCount?: number;
        hasPreviewImage?: boolean;
    };
    hits?: PreviewHit[];
};

type ComponentIdentity = {
    componentKey: string;
    componentName: string;
    variantFilter: string;
    componentProperties?: { [key: string]: string };
    isNested?: boolean;
};

type ComponentGroup = {
    componentKey: string;
    componentName: string;
    identities: ComponentIdentity[];
    isNested: boolean;
};

type PrefabBindingSlot = {
    component: ComponentIdentity;
    variantFilter: string;
};

type PreviewRect = { x: number; y: number; width: number; height: number };
type WorkbenchOpenOptions = { jsonPath?: string; section?: string; source?: string };

function asElementMap(raw: any): PanelElementMap {
    return raw as PanelElementMap;
}

const REQ = (message: string, ...args: any[]) => Editor.Message.request('figma-importer', message, ...args);
const LAST_JSON_KEY = 'figma-importer.settings.last-json-path';
const MAPPING_WIDTH_KEY = 'figma-importer.settings.mapping-width';
const DEFAULT_MAPPING_WIDTH = 380;
const MIN_MAPPING_WIDTH = 320;
const MAX_MAPPING_WIDTH = 560;
const MIN_PREVIEW_WIDTH = 420;
const MAPPING_SPLITTER_WIDTH = 6;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;

let refreshSettingsWorkspacePath: (() => void) | null = null;
let updateSettingsWorkbench: ((options?: WorkbenchOpenOptions) => Promise<boolean>) | null = null;
let clearWorkbenchPreview: (() => void) | null = null;
let disposeMappingResize: (() => void) | null = null;

module.exports = Editor.Panel.define({
    template: readFileSync(join(__dirname, '../../../static/template/settings/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/settings/index.css'), 'utf-8'),
    listeners: {
        show() {
            if (refreshSettingsWorkspacePath) refreshSettingsWorkspacePath();
        },
    },
    $: {
        app: '#app',
        status: '#status',
        version: '#version',
        jsonPath: '#jsonPath',
        browseBtn: '#browseBtn',
        clearBtn: '#clearBtn',
        dropZone: '#dropZone',
        filePreview: '#filePreview',
        previewFile: '#previewFile',
        previewName: '#previewName',
        previewCanvas: '#previewCanvas',
        previewStats: '#previewStats',
        previewSection: '#previewSection',
        previewMeta: '#previewMeta',
        previewViewport: '#previewViewport',
        previewStage: '#previewStage',
        previewPlaceholder: '#previewPlaceholder',
        previewImage: '#previewImage',
        previewOverlay: '#previewOverlay',
        selectionSummary: '#selectionSummary',
        selectionHits: '#selectionHits',
        zoomOutBtn: '#zoomOutBtn',
        zoomInBtn: '#zoomInBtn',
        zoomLabel: '#zoomLabel',
        actualSizeBtn: '#actualSizeBtn',
        fitPreviewBtn: '#fitPreviewBtn',
        reloadPreviewBtn: '#reloadPreviewBtn',
        importBtn: '#importBtn',
        replacePanelBtn: '#replacePanelBtn',
        workspaceSplit: '#workspaceSplit',
        mappingSection: '#mappingSection',
        mappingSplitter: '#mappingSplitter',
        mappingSummary: '#mappingSummary',
        mappingRefreshBtn: '#mappingRefreshBtn',
        componentSearch: '#componentSearch',
        includeNested: '#includeNested',
        hideMapped: '#hideMapped',
        componentList: '#componentList',
        mappingList: '#mappingList',
        dirList: '#dirList',
        addBtn: '#addBtn',
        resetBtn: '#resetBtn',
        pushState: '#pushState',
        pushStartBtn: '#pushStartBtn',
        pushStopBtn: '#pushStopBtn',
        genStyleBtn: '#genStyleBtn',
        exportBtn: '#exportBtn',
        pushFigmaBtn: '#pushFigmaBtn',
    },
    methods: {
        async acceptPushedJson(options?: WorkbenchOpenOptions) {
            if (!updateSettingsWorkbench) {
                return { success: false, error: 'FtoC 导入工作台尚未就绪' };
            }
            const loaded = await updateSettingsWorkbench(options);
            return loaded
                ? { success: true, data: { jsonPath: normalizeCurrentJsonPath(options && options.jsonPath) } }
                : { success: false, error: 'FtoC 导入工作台未能加载推送 JSON' };
        },
    },
    ready() {
        const $ = asElementMap(this.$);
        let dirs: string[] = [];
        let selectedJsonPath = '';
        let previewLoading = false;
        let activeLoadPath = '';
        let activeLoadPromise: Promise<boolean> | null = null;
        let disposed = false;
        let loadRevision = 0;
        let lastPreview: JsonPreview | null = null;
        let previewImageUrl = '';
        let previewImageUrlToken = 0;
        let mappingData: any = null;
        let renderedComponents: ComponentIdentity[] = [];
        let renderedBindingSlots: PrefabBindingSlot[] = [];
        let selectedComponentIdentity: ComponentIdentity | null = null;
        let highlightedRects: PreviewHit[] = [];
        let selectionRect: PreviewRect | null = null;
        let selectionHits: PreviewHit[] = [];
        let zoom = 1;
        let panX = 0;
        let panY = 0;
        let pointerMode: 'none' | 'select' | 'pan' = 'none';
        let pointerStartCanvas: { x: number; y: number } | null = null;
        let pointerStartClient: { x: number; y: number } | null = null;
        let pointerStartPan: { x: number; y: number } | null = null;
        let suppressPreviewClick = false;

        const releasePreviewImageUrl = () => {
            previewImageUrlToken++;
            if (previewImageUrl && previewImageUrl.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
                URL.revokeObjectURL(previewImageUrl);
            }
            previewImageUrl = '';
        };

        // Keep the large frame out of CSS custom properties. Chromium drops multi-megabyte
        // declarations; one blob URL is shared by all thumbnail <img> elements instead.
        // If blob creation fails, cards keep their initials instead of duplicating the data URL.
        const ensurePreviewImageUrl = async (imageData: string): Promise<string> => {
            const source = String(imageData || '');
            if (!source) {
                releasePreviewImageUrl();
                return '';
            }
            releasePreviewImageUrl();
            const token = previewImageUrlToken;
            try {
                if (typeof fetch === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                    const response = await fetch(source);
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    if (token !== previewImageUrlToken) {
                        URL.revokeObjectURL(objectUrl);
                        return '';
                    }
                    previewImageUrl = objectUrl;
                    return objectUrl;
                }
            } catch {
                // The main preview can still use the data URL directly.
            }
            if (token !== previewImageUrlToken) return '';
            return '';
        };

        if ($.version) {
            try {
                const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf-8'));
                $.version.textContent = `v${pkg.version || '?'}`;
            } catch {
                $.version.textContent = '';
            }
        }

        const setStatus = (text: string, tone = 'info') => {
            if (!$.status) return;
            $.status.textContent = text;
            $.status.title = text;
            $.status.dataset.tone = tone;
        };

        const rememberJsonPath = async (filePath: string): Promise<string> => {
            const normalized = normalizeCurrentJsonPath(filePath);
            try {
                if (normalized) window.localStorage.setItem(LAST_JSON_KEY, normalized);
                else window.localStorage.removeItem(LAST_JSON_KEY);
            } catch { /* Project profile remains the source of truth. */ }
            try {
                await REQ('set-current-json-path', normalized);
            } catch { /* The active panel still keeps its in-memory path. */ }
            return normalized;
        };

        const readRememberedJsonPath = async () => {
            const sharedPath = await readCurrentJsonPath();
            if (sharedPath) return sharedPath;
            try {
                const legacyPath = String(window.localStorage.getItem(LAST_JSON_KEY) || '').trim();
                if (legacyPath) await rememberJsonPath(legacyPath);
                return legacyPath;
            } catch {
                return '';
            }
        };

        const setPreviewState = (state: 'empty' | 'ready' | 'error', message = '') => {
            if (!$.filePreview) return;
            $.filePreview.dataset.state = state;
            const empty = $.filePreview.querySelector<HTMLElement>('.preview-empty');
            if (empty && message) empty.textContent = message;
        };

        const setPreviewToolsEnabled = (enabled: boolean) => {
            for (const button of [$.zoomOutBtn, $.zoomInBtn, $.actualSizeBtn, $.fitPreviewBtn, $.reloadPreviewBtn]) {
                if (button) button.disabled = !enabled;
            }
        };

        const applyPreviewTransform = () => {
            if ($.previewStage) {
                $.previewStage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
            }
            if ($.zoomLabel) $.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
        };

        const clearPreviewState = () => {
            releasePreviewImageUrl();
            lastPreview = null;
            highlightedRects = [];
            selectionRect = null;
            selectionHits = [];
            selectedComponentIdentity = null;
            zoom = 1;
            panX = 0;
            panY = 0;
            pointerMode = 'none';
            pointerStartCanvas = null;
            pointerStartClient = null;
            pointerStartPan = null;
            suppressPreviewClick = false;
            if ($.previewImage) {
                $.previewImage.onload = null;
                $.previewImage.src = '';
                $.previewImage.hidden = true;
            }
            if ($.previewOverlay) $.previewOverlay.innerHTML = '';
            if ($.previewStage) {
                $.previewStage.hidden = true;
                $.previewStage.style.width = '';
                $.previewStage.style.height = '';
                $.previewStage.style.transform = '';
            }
            if ($.previewPlaceholder) {
                $.previewPlaceholder.hidden = false;
                $.previewPlaceholder.textContent = '等待选择 JSON';
            }
            if ($.previewMeta) $.previewMeta.textContent = '尚未加载';
            if ($.selectionSummary) $.selectionSummary.textContent = '未选择画板节点';
            if ($.selectionHits) $.selectionHits.innerHTML = '';
            setPreviewToolsEnabled(false);
            applyPreviewTransform();
        };
        clearWorkbenchPreview = () => {
            disposed = true;
            loadRevision++;
            previewLoading = false;
            activeLoadPath = '';
            activeLoadPromise = null;
            clearPreviewState();
        };

        const clearMappingSurface = (componentMessage: string, summary = '等待组件扫描') => {
            mappingData = null;
            renderedComponents = [];
            renderedBindingSlots = [];
            if ($.mappingSummary) $.mappingSummary.textContent = summary;
            if ($.componentList) $.componentList.innerHTML = `<div class="empty">${escapeHtml(componentMessage)}</div>`;
            if ($.mappingList) $.mappingList.innerHTML = '';
        };

        const clearJson = () => {
            loadRevision++;
            selectedJsonPath = '';
            previewLoading = false;
            activeLoadPath = '';
            activeLoadPromise = null;
            clearPreviewState();
            clearMappingSurface('选择 JSON 后显示组件', '0 条映射');
            if ($.jsonPath) {
                $.jsonPath.value = '';
                $.jsonPath.title = '当前 Figma JSON 文件';
            }
            if ($.clearBtn) $.clearBtn.disabled = true;
            if ($.importBtn) $.importBtn.disabled = true;
            if ($.previewFile) $.previewFile.textContent = '—';
            if ($.previewName) $.previewName.textContent = '—';
            if ($.previewCanvas) $.previewCanvas.textContent = '—';
            if ($.previewStats) $.previewStats.textContent = '—';
            setPreviewState('empty', '选择 JSON 后显示真实画板');
        };

        const canvasSize = () => ({
            width: Math.max(1, Number(lastPreview && lastPreview.canvas && lastPreview.canvas.width) || 1),
            height: Math.max(1, Number(lastPreview && lastPreview.canvas && lastPreview.canvas.height) || 1),
        });

        const fitPreview = () => {
            if (!lastPreview || !$.previewViewport) return;
            const viewportWidth = Math.max(1, $.previewViewport.clientWidth);
            const viewportHeight = Math.max(1, $.previewViewport.clientHeight);
            const canvas = canvasSize();
            zoom = clamp(Math.min((viewportWidth - 32) / canvas.width, (viewportHeight - 32) / canvas.height), MIN_ZOOM, MAX_ZOOM);
            panX = (viewportWidth - canvas.width * zoom) / 2;
            panY = (viewportHeight - canvas.height * zoom) / 2;
            applyPreviewTransform();
        };

        const showActualSize = () => {
            if (!lastPreview || !$.previewViewport) return;
            const canvas = canvasSize();
            zoom = 1;
            panX = ($.previewViewport.clientWidth - canvas.width) / 2;
            panY = ($.previewViewport.clientHeight - canvas.height) / 2;
            applyPreviewTransform();
        };

        const zoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
            if (!lastPreview || !$.previewViewport) return;
            const viewportRect = $.previewViewport.getBoundingClientRect();
            const anchorX = clientX == null ? viewportRect.left + viewportRect.width / 2 : clientX;
            const anchorY = clientY == null ? viewportRect.top + viewportRect.height / 2 : clientY;
            const canvasX = (anchorX - viewportRect.left - panX) / zoom;
            const canvasY = (anchorY - viewportRect.top - panY) / zoom;
            zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
            panX = anchorX - viewportRect.left - canvasX * zoom;
            panY = anchorY - viewportRect.top - canvasY * zoom;
            applyPreviewTransform();
        };

        const renderOverlay = () => {
            if (!$.previewOverlay) return;
            const html: string[] = [];
            const selectedIdentity = selectedComponentIdentity;
            const focused = selectedIdentity
                ? (lastPreview && lastPreview.hits || []).filter((hit) => sameComponent(hit, selectedIdentity))
                : [];
            for (const hit of highlightedRects.slice(0, 120)) {
                html.push(rectHtml(hit, 'hit-rect', hit.path));
            }
            for (const hit of focused.slice(0, 120)) {
                html.push(rectHtml(hit, 'component-focus-rect', hit.componentName || hit.path));
            }
            if (selectionRect && selectionRect.width > 0 && selectionRect.height > 0) {
                html.push(rectHtml(selectionRect, 'drag-selection-rect', 'selection'));
            }
            $.previewOverlay.innerHTML = html.join('');
        };

        const renderSelection = () => {
            if ($.selectionSummary) {
                if (selectedComponentIdentity) {
                    $.selectionSummary.textContent = `${selectedComponentIdentity.componentName || selectedComponentIdentity.componentKey} · ${variantLabel(selectedComponentIdentity.variantFilter)}`;
                } else if (selectionHits.length > 0) {
                    $.selectionSummary.textContent = `命中 ${selectionHits.length} 个节点`;
                } else {
                    $.selectionSummary.textContent = '未选择画板节点';
                }
            }
            if (!$.selectionHits) return;
            $.selectionHits.innerHTML = selectionHits.slice(0, 24).map((hit, index) =>
                `<button class="selection-hit" type="button" data-hit-index="${index}" title="${escapeHtml(hit.path)}">${escapeHtml(hit.name || hit.path)}</button>`
            ).join('');
        };

        const mappingEntries = (): any[] => {
            const resolved = mappingData && mappingData.resolved;
            if (resolved && Array.isArray(resolved.entries)) return resolved.entries;
            const document = mappingData && mappingData.document || { entries: [] };
            return Array.isArray(document.entries) ? document.entries : [];
        };

        const mappingEntryIsResolved = (entry: any): boolean => !!(
            entry &&
            entry.resolved !== false &&
            (String(entry.prefabUuid || '').trim() || String(entry.prefabUrl || '').trim())
        );

        const mappingForComponent = (component: ComponentIdentity) => {
            const entries = mappingEntries().filter((entry) => String(entry.componentKey || '') === component.componentKey);
            const exact = entries.find((entry) => String(entry.variantFilter || '') === component.variantFilter);
            const fallback = entries.find((entry) => !String(entry.variantFilter || '').trim());
            const effective = mappingEntryIsResolved(exact)
                ? exact
                : mappingEntryIsResolved(fallback) ? fallback : undefined;
            return { exact, fallback, effective };
        };

        const mappingEntryForSlot = (componentKey: string, variantFilter: string): any | undefined =>
            mappingEntries().find((entry) =>
                String(entry.componentKey || '') === componentKey &&
                String(entry.variantFilter || '') === variantFilter
            );

        const previewHitForComponent = (component: ComponentIdentity): PreviewHit | undefined => {
            const hits = lastPreview && Array.isArray(lastPreview.hits) ? lastPreview.hits : [];
            return hits.find((hit) => sameComponent(hit, component)) ||
                hits.find((hit) => String(hit.componentKey || '') === component.componentKey);
        };

        const componentThumbStyle = (component: ComponentIdentity): string => {
            const hit = previewHitForComponent(component);
            if (!hit || hit.width <= 0 || hit.height <= 0 || !previewImageUrl) return '';
            const canvas = canvasSize();
            const scale = Math.min(40 / hit.width, 40 / hit.height);
            const imageWidth = canvas.width * scale;
            const imageHeight = canvas.height * scale;
            const positionX = (44 - hit.width * scale) / 2 - hit.x * scale;
            const positionY = (44 - hit.height * scale) / 2 - hit.y * scale;
            return `--thumb-width:${imageWidth}px;--thumb-height:${imageHeight}px;--thumb-left:${positionX}px;--thumb-top:${positionY}px`;
        };

        const renderMappings = () => {
            const entries = mappingEntries();
            const components: ComponentIdentity[] = mappingData && Array.isArray(mappingData.components)
                ? mappingData.components
                : [];
            const resolved = mappingData && mappingData.resolved || {};
            const includeNested = !!($.includeNested && $.includeNested.checked);
            const allGroups = groupComponentIdentities(components);
            const scopedComponents = includeNested
                ? components
                : components.filter((component) => component.isNested !== true);
            const scopedGroups = groupComponentIdentities(scopedComponents);

            if ($.mappingSummary) {
                const scopeText = includeNested
                    ? `${allGroups.length} 个组件`
                    : `${scopedGroups.length} 个外层组件${allGroups.length > scopedGroups.length ? ` / ${allGroups.length} 个全部` : ''}`;
                $.mappingSummary.textContent = `${entries.length} 条映射 · ${resolved.valid || 0} 可用 · ${resolved.broken || 0} 断链 · ${scopeText}`;
            }

            const search = String($.componentSearch && $.componentSearch.value || '').trim().toLowerCase();
            const hideMapped = !!($.hideMapped && $.hideMapped.checked);
            const renderedGroups = scopedGroups.filter((group) => {
                const allMapped = group.identities.length > 0 && group.identities.every((component) => !!mappingForComponent(component).effective);
                if (hideMapped && allMapped) return false;
                if (!search) return true;
                return `${group.componentName} ${group.componentKey} ${group.identities.map((item) => item.variantFilter).join(' ')}`
                    .toLowerCase()
                    .includes(search);
            });
            renderedComponents = renderedGroups.map((group) =>
                group.identities.find((component) =>
                    !!selectedComponentIdentity && sameComponent(component, selectedComponentIdentity)
                ) || group.identities[0]
            );
            renderedBindingSlots = [];

            if ($.componentList) {
                const previewImage = previewImageUrl;
                $.componentList.innerHTML = renderedGroups.length === 0
                    ? `<div class="empty">${scopedGroups.length ? '没有符合筛选条件的组件' : allGroups.length ? '当前范围没有外层组件' : '当前 JSON 没有组件身份'}</div>`
                    : renderedGroups.map((group, index) => {
                        const component = renderedComponents[index];
                        const keyEntries = entries.filter((entry) => String(entry.componentKey || '') === group.componentKey);
                        const mappedCount = group.identities.filter((identity) => !!mappingForComponent(identity).effective).length;
                        const allMapped = mappedCount === group.identities.length;
                        const statusTone = allMapped ? 'ok' : keyEntries.length > 0 ? 'warn' : 'off';
                        const statusText = mappedCount > 0 ? `${mappedCount}/${group.identities.length} 已映射` : '未映射';
                        const selected = !!selectedComponentIdentity && selectedComponentIdentity.componentKey === group.componentKey;
                        const initial = escapeHtml((group.componentName || group.componentKey || '?').slice(0, 1).toUpperCase());
                        const thumbHit = previewHitForComponent(component);
                        const hasThumbnail = !!previewImage && !!thumbHit && thumbHit.width > 0 && thumbHit.height > 0;
                        const thumbClass = 'component-thumb';
                        const thumbImage = hasThumbnail
                            ? `<img class="component-thumb-image" src="${escapeHtml(previewImage)}" alt="" draggable="false" />`
                            : '';
                        const explicitVariantFilters = Array.from(new Set(
                            group.identities.map((identity) => String(identity.variantFilter || '')).filter(Boolean)
                        ));
                        const hasDefaultIdentity = group.identities.some((identity) => !String(identity.variantFilter || '').trim());
                        const hasDefaultMapping = keyEntries.some((entry) => !String(entry.variantFilter || '').trim());
                        const variantFilters = Array.from(new Set([
                            ...(hasDefaultIdentity || explicitVariantFilters.length === 0 || hasDefaultMapping ? [''] : []),
                            ...explicitVariantFilters,
                        ]));
                        const slots = variantFilters.map((variantFilter) => {
                            const slotComponent = group.identities.find((identity) => identity.variantFilter === variantFilter) || component;
                            const entry = mappingEntryForSlot(group.componentKey, variantFilter);
                            const bindingIndex = renderedBindingSlots.push({ component: slotComponent, variantFilter }) - 1;
                            const entryResolved = mappingEntryIsResolved(entry);
                            const value = entryResolved ? String(entry.prefabUuid || entry.prefabUrl || '') : '';
                            const placeholder = entry && !entryResolved ? 'Prefab 断链，请重新选择' : '选择或拖入 Prefab';
                            const labelTitle = variantFilter
                                ? `只在该变体完全匹配时使用：${variantFilter}`
                                : '无变体组件的默认映射；历史兜底映射也会保留在这里';
                            const unassignButton = entry
                                ? `<button class="prefab-slot-unassign icon-btn" type="button" data-action="unassign-slot" data-binding-index="${bindingIndex}" title="解绑此 Prefab" aria-label="解绑此 Prefab">×</button>`
                                : '';
                            return `<div class="prefab-slot" data-state="${entry && !entryResolved ? 'broken' : 'ready'}" data-variant-filter="${escapeHtml(variantFilter)}">` +
                                `<span class="prefab-slot-label" title="${escapeHtml(labelTitle)}">${escapeHtml(variantLabel(variantFilter))}</span>` +
                                `<ui-asset class="prefab-asset-field" data-testid="ftoc-prefab-field" data-binding-index="${bindingIndex}" droppable="cc.Prefab" value="${escapeHtml(value)}" placeholder="${placeholder}"></ui-asset>` +
                                unassignButton +
                                '</div>';
                        }).join('');
                        const variantCount = explicitVariantFilters.length;
                        return `<article class="component-card" data-testid="ftoc-component-card" data-component-index="${index}" data-component-key="${escapeHtml(group.componentKey)}" data-selected="${selected}">` +
                            `<header class="component-card-header" title="在画板中定位 ${escapeHtml(group.componentName || group.componentKey)}">` +
                            `<div class="${thumbClass}" style="${componentThumbStyle(component)}">${thumbImage}<span>${initial}</span></div>` +
                            '<div class="component-body">' +
                            `<div class="component-title-row"><strong>${escapeHtml(group.componentName || group.componentKey)}</strong>` +
                            '<span class="component-badges">' +
                            (group.isNested ? '<span class="mapping-badge" data-tone="nested">嵌套</span>' : '') +
                            `<span class="mapping-badge" data-tone="${statusTone}">${statusText}</span></span></div>` +
                            `<div class="component-meta"><span>${variantCount > 0 ? `${variantCount} 个变体` : '无变体'}</span><code title="${escapeHtml(group.componentKey)}">${escapeHtml(group.componentKey)}</code></div>` +
                            '</div></header>' +
                            `<div class="prefab-slot-list">${slots}</div></article>`;
                    }).join('');
                $.componentList.querySelectorAll<HTMLImageElement>('.component-thumb-image').forEach((image) => {
                    const thumbnail = image.closest<HTMLElement>('.component-thumb');
                    const settle = () => {
                        const loaded = image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
                        if (thumbnail) thumbnail.classList.toggle('has-preview', loaded);
                        if (!loaded) image.remove();
                    };
                    image.addEventListener('load', settle, { once: true });
                    image.addEventListener('error', settle, { once: true });
                    if (image.complete) settle();
                });
            }

            if ($.mappingList) {
                $.mappingList.innerHTML = entries.length === 0
                    ? '<div class="empty">暂无工程映射</div>'
                    : entries.map((entry, index) => `<div class="mapping-entry">` +
                        `<div class="mapping-entry-title"><strong>${escapeHtml(entry.componentName || entry.componentKey)}</strong>` +
                        `<button type="button" data-action="unassign" data-entry-index="${index}">解绑</button></div>` +
                        `<span class="component-variant">${escapeHtml(variantLabel(entry.variantFilter))}</span>` +
                        `<code class="mapping-entry-path">${escapeHtml(mappingEntryIsResolved(entry)
                            ? entry.prefabUrl || entry.prefabUuid
                            : `Prefab 断链 · ${entry.requestedPrefabUrl || entry.requestedPrefabUuid || '资源不存在'}`)}</code></div>`
                    ).join('');
            }
        };

        const loadMappings = async (revision = loadRevision) => {
            const result: any = await REQ('get-component-mappings');
            if (revision !== loadRevision) return false;
            if (!result || result.success === false) {
                setStatus(`读取映射失败：${result && result.error || '未知错误'}`, 'error');
                return false;
            }
            mappingData = result.data || {};
            renderMappings();
            return true;
        };

        const assignComponent = async (component: ComponentIdentity, variantFilter: string, prefabUuid: string): Promise<boolean> => {
            if (!component || !component.componentKey || !prefabUuid) return false;
            setStatus('正在 Assign Prefab...', 'info');
            try {
                const result: any = await REQ('upsert-component-mapping', {
                    componentKey: component.componentKey,
                    componentName: component.componentName,
                    variantFilter,
                    prefabUuid,
                });
                if (!result || result.success === false) {
                    setStatus(`绑定失败：${result && result.error || '请重新选择 Prefab'}`, 'error');
                    renderMappings();
                    return false;
                }
                await loadMappings();
                setStatus('Prefab 映射已保存，本次完整导入将使用该关系。', 'ok');
                return true;
            } catch (error: any) {
                setStatus(`绑定异常：${error && error.message || error}`, 'error');
                renderMappings();
                return false;
            }
        };

        const unassignComponent = async (componentKey: string, variantFilter: string): Promise<boolean> => {
            if (!componentKey) return false;
            setStatus('正在解绑 Prefab...', 'info');
            try {
                const result: any = await REQ('remove-component-mapping', componentKey, variantFilter);
                if (!result || result.success === false) {
                    setStatus(`解绑失败：${result && result.error || '未知错误'}`, 'error');
                    renderMappings();
                    return false;
                }
                await loadMappings();
                setStatus('Prefab 映射已解绑。', 'ok');
                return true;
            } catch (error: any) {
                setStatus(`解绑异常：${error && error.message || error}`, 'error');
                renderMappings();
                return false;
            }
        };

        const focusHighlightedRects = (rects: PreviewHit[]) => {
            if (!$.previewViewport || rects.length === 0) return;
            const bounds = rects.reduce((out, rect) => ({
                x: Math.min(out.x, rect.x),
                y: Math.min(out.y, rect.y),
                right: Math.max(out.right, rect.x + rect.width),
                bottom: Math.max(out.bottom, rect.y + rect.height),
            }), { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
            const width = Math.max(1, bounds.right - bounds.x);
            const height = Math.max(1, bounds.bottom - bounds.y);
            const nextZoom = clamp(Math.min(($.previewViewport.clientWidth - 80) / width, ($.previewViewport.clientHeight - 80) / height, 2), MIN_ZOOM, MAX_ZOOM);
            zoom = nextZoom;
            panX = ($.previewViewport.clientWidth - width * zoom) / 2 - bounds.x * zoom;
            panY = ($.previewViewport.clientHeight - height * zoom) / 2 - bounds.y * zoom;
            applyPreviewTransform();
        };

        const selectComponent = (component: ComponentIdentity, focus = true) => {
            selectedComponentIdentity = component;
            selectionRect = null;
            const hits = lastPreview && Array.isArray(lastPreview.hits) ? lastPreview.hits : [];
            highlightedRects = hits.filter((hit) => sameComponent(hit, component));
            selectionHits = highlightedRects.slice();
            renderOverlay();
            renderSelection();
            renderMappings();
            if (focus) focusHighlightedRects(highlightedRects);
        };

        const canvasPointFromMouse = (event: MouseEvent): { x: number; y: number } | null => {
            if (!lastPreview || !$.previewViewport) return null;
            const rect = $.previewViewport.getBoundingClientRect();
            return {
                x: (event.clientX - rect.left - panX) / zoom,
                y: (event.clientY - rect.top - panY) / zoom,
            };
        };

        const selectAtPoint = (point: { x: number; y: number }) => {
            const hits = lastPreview && Array.isArray(lastPreview.hits) ? lastPreview.hits : [];
            const containing = hits.filter((hit) => pointInRect(point, hit))
                .sort((a, b) => rectArea(a) - rectArea(b));
            const componentHit = containing.filter((hit) => !!String(hit.componentKey || '')).sort((a, b) => rectArea(a) - rectArea(b))[0];
            selectionRect = null;
            selectionHits = containing.length ? [containing[0]] : [];
            highlightedRects = selectionHits.slice();
            selectedComponentIdentity = componentHit ? identityFromHit(componentHit) : null;
            renderOverlay();
            renderSelection();
            renderMappings();
        };

        const renderPreview = (preview: JsonPreview) => {
            const filePath = normalizeCurrentJsonPath(preview.filePath || selectedJsonPath);
            selectedJsonPath = filePath;
            lastPreview = {
                ...preview,
                filePath,
                previewImageDataUrl: undefined,
                hits: Array.isArray(preview.hits) ? preview.hits : [],
            };
            if ($.jsonPath) {
                $.jsonPath.value = filePath;
                $.jsonPath.title = filePath;
            }
            if ($.clearBtn) $.clearBtn.disabled = !filePath;
            if ($.importBtn) $.importBtn.disabled = !filePath;
            if ($.reloadPreviewBtn) $.reloadPreviewBtn.disabled = !filePath;
            if ($.previewFile) {
                $.previewFile.textContent = basename(filePath) || '—';
                $.previewFile.title = filePath;
            }
            if ($.previewName) $.previewName.textContent = String(preview.name || '未命名');
            const width = Math.round(Number(preview.canvas && preview.canvas.width) || 0);
            const height = Math.round(Number(preview.canvas && preview.canvas.height) || 0);
            if ($.previewCanvas) $.previewCanvas.textContent = width > 0 && height > 0 ? `${width} × ${height}` : '未知';
            const stats = preview.stats || {};
            const parts = [
                `${Number(stats.hits) || 0} 节点`,
                `${Number(stats.texts) || 0} 文字`,
                `${Number(stats.images) || 0} 图片`,
            ];
            if ((Number(stats.interfaceCount) || 0) > 1) parts.push(`${stats.interfaceCount} 画板`);
            if ($.previewStats) $.previewStats.textContent = parts.join(' · ');
            if ($.previewMeta) $.previewMeta.textContent = `${preview.name || '未命名'} · ${width}×${height} · ${parts.join(' · ')}`;
            if ($.previewStage) {
                $.previewStage.hidden = false;
                $.previewStage.style.width = `${Math.max(1, width)}px`;
                $.previewStage.style.height = `${Math.max(1, height)}px`;
            }
            if ($.previewOverlay) {
                $.previewOverlay.style.width = `${Math.max(1, width)}px`;
                $.previewOverlay.style.height = `${Math.max(1, height)}px`;
            }
            const imageData = String(preview.previewImageDataUrl || '');
            const imageSource = previewImageUrl || imageData;
            if ($.previewImage) {
                $.previewImage.hidden = !imageSource;
                $.previewImage.onload = () => requestAnimationFrame(fitPreview);
                $.previewImage.src = imageSource;
            }
            if ($.previewPlaceholder) {
                $.previewPlaceholder.hidden = !!imageSource;
                $.previewPlaceholder.textContent = imageSource ? '' : '当前 JSON 不含整帧预览图';
            }
            setPreviewState('ready');
            setPreviewToolsEnabled(true);
            renderOverlay();
            renderSelection();
            if (!imageSource) requestAnimationFrame(fitPreview);
        };

        const loadJsonInternal = async (presetPath?: string, silent = false): Promise<boolean> => {
            if (disposed || (previewLoading && !presetPath)) return false;
            const requestPath = normalizeCurrentJsonPath(presetPath);
            if (requestPath) selectedJsonPath = requestPath;
            const revision = ++loadRevision;
            previewLoading = true;
            clearPreviewState();
            clearMappingSurface('正在扫描当前 JSON 的组件...', '正在加载组件与映射...');
            if ($.browseBtn) $.browseBtn.disabled = true;
            if ($.clearBtn) $.clearBtn.disabled = true;
            if ($.mappingRefreshBtn) $.mappingRefreshBtn.disabled = true;
            if ($.importBtn) $.importBtn.disabled = true;
            if (!silent) setStatus(requestPath ? '正在加载画板预览...' : '选择 JSON 文件...', 'info');
            try {
                // An empty request path is intentional: the main process opens the JSON picker.
                const result: any = await REQ('load-json-preview-beta', requestPath, true, false);
                if (disposed || revision !== loadRevision) return false;
                if (!result || result.success === false || !result.data) {
                    const canceled = result && String(result.error || '').toLowerCase() === 'canceled';
                    clearMappingSurface(canceled ? '未载入新的 JSON' : 'JSON 无法读取，未加载组件候选');
                    if (!canceled) {
                        setPreviewState('error', 'JSON 无法读取或格式无效');
                        setStatus(`JSON 读取失败：${result && result.error || '未知错误'}`, 'error');
                    } else if (!silent) {
                        setStatus('已取消选择。', 'info');
                    }
                    return false;
                }
                const previewData = result.data as JsonPreview;
                await ensurePreviewImageUrl(String(previewData.previewImageDataUrl || ''));
                if (disposed || revision !== loadRevision) return false;
                await rememberJsonPath(normalizeCurrentJsonPath(previewData.filePath || selectedJsonPath));
                if (disposed || revision !== loadRevision) return false;
                renderPreview(previewData);
                const scanned: any = await REQ('scan-component-identities-from-json', selectedJsonPath);
                if (disposed || revision !== loadRevision) return false;
                if (!scanned || scanned.success === false) {
                    clearMappingSurface('组件扫描失败，未加载上一份 JSON 的候选', '组件扫描失败');
                    setStatus(`预览已加载，组件扫描失败：${scanned && scanned.error || '未知错误'}`, 'warn');
                    return false;
                }
                const mappingsLoaded = await loadMappings(revision);
                if (disposed || revision !== loadRevision) return false;
                if (!mappingsLoaded) return false;
                setStatus(`预览就绪：${basename(selectedJsonPath)}，可调整组件映射后完整导入。`, 'ok');
                return true;
            } catch (error: any) {
                if (revision !== loadRevision) return false;
                setPreviewState('error', 'JSON 无法读取或格式无效');
                setStatus(`JSON 读取异常：${error && error.message || error}`, 'error');
                return false;
            } finally {
                if (revision === loadRevision) {
                    previewLoading = false;
                    if ($.browseBtn) $.browseBtn.disabled = false;
                    if ($.clearBtn) $.clearBtn.disabled = !selectedJsonPath;
                    if ($.mappingRefreshBtn) $.mappingRefreshBtn.disabled = false;
                    if ($.importBtn) $.importBtn.disabled = !selectedJsonPath || !lastPreview;
                }
            }
        };

        const loadJson = (presetPath?: string, silent = false): Promise<boolean> => {
            const requestPath = normalizeCurrentJsonPath(presetPath);
            if (requestPath && activeLoadPromise && activeLoadPath === requestPath) {
                return activeLoadPromise;
            }
            const promise = loadJsonInternal(presetPath, silent);
            activeLoadPath = requestPath;
            activeLoadPromise = promise;
            void promise.then(
                () => {
                    if (activeLoadPromise === promise) {
                        activeLoadPath = '';
                        activeLoadPromise = null;
                    }
                },
                () => {
                    if (activeLoadPromise === promise) {
                        activeLoadPath = '';
                        activeLoadPromise = null;
                    }
                },
            );
            return promise;
        };

        const openSection = (section = '') => {
            const target = section === 'mapping' ? $.mappingSection : $.previewSection;
            if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });
        };

        refreshSettingsWorkspacePath = () => {
            void readCurrentJsonPath().then((filePath) => {
                if (disposed) return;
                const normalized = normalizeCurrentJsonPath(filePath);
                if (!normalized || normalized === selectedJsonPath) return;
                void loadJson(normalized, true);
            });
        };

        updateSettingsWorkbench = (options?: WorkbenchOpenOptions) => {
            const hasJsonPath = !!options && Object.prototype.hasOwnProperty.call(options, 'jsonPath');
            const nextPath = normalizeCurrentJsonPath(options && options.jsonPath);
            const load = hasJsonPath && nextPath
                ? loadJson(nextPath, !!(options && options.source === 'figma-push'))
                : Promise.resolve(true);
            return load.then((loaded) => {
                requestAnimationFrame(() => openSection(String(options && options.section || '')));
                return loaded;
            });
        };

        const setupMappingResize = () => {
            const workspace = $.workspaceSplit;
            const splitter = $.mappingSplitter;
            if (!workspace || !splitter) return;
            let resizing = false;
            let pointerId = -1;

            const readStoredWidth = (): number => {
                try {
                    const value = Number(window.localStorage.getItem(MAPPING_WIDTH_KEY));
                    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAPPING_WIDTH;
                } catch {
                    return DEFAULT_MAPPING_WIDTH;
                }
            };

            const maxWidthForWorkspace = (): number => {
                const available = workspace.clientWidth;
                if (!available) return MAX_MAPPING_WIDTH;
                return Math.max(
                    MIN_MAPPING_WIDTH,
                    Math.min(MAX_MAPPING_WIDTH, available - MIN_PREVIEW_WIDTH - MAPPING_SPLITTER_WIDTH),
                );
            };

            const applyWidth = (requested: number, persist = false) => {
                const width = clamp(requested, MIN_MAPPING_WIDTH, maxWidthForWorkspace());
                workspace.style.setProperty('--mapping-width', `${Math.round(width)}px`);
                splitter.setAttribute('aria-valuenow', String(Math.round(width)));
                if (persist) {
                    try { window.localStorage.setItem(MAPPING_WIDTH_KEY, String(Math.round(width))); } catch { /* optional preference */ }
                }
            };

            const widthFromPointer = (clientX: number): number => {
                const rect = workspace.getBoundingClientRect();
                return rect.right - clientX;
            };

            const stopResize = () => {
                if (!resizing) return;
                resizing = false;
                splitter.dataset.dragging = 'false';
                if (pointerId >= 0 && splitter.hasPointerCapture(pointerId)) splitter.releasePointerCapture(pointerId);
                pointerId = -1;
            };

            const onPointerMove = (event: PointerEvent) => {
                if (!resizing || (pointerId >= 0 && event.pointerId !== pointerId)) return;
                event.preventDefault();
                applyWidth(widthFromPointer(event.clientX));
            };
            const onPointerUp = (event: PointerEvent) => {
                if (!resizing) return;
                if (pointerId >= 0 && event.pointerId !== pointerId) return;
                const current = Number(splitter.getAttribute('aria-valuenow')) || DEFAULT_MAPPING_WIDTH;
                applyWidth(current, true);
                stopResize();
            };
            const onPointerDown = (event: PointerEvent) => {
                if (event.button !== 0) return;
                event.preventDefault();
                resizing = true;
                pointerId = event.pointerId;
                splitter.dataset.dragging = 'true';
                splitter.setPointerCapture(event.pointerId);
            };
            const onKeyDown = (event: KeyboardEvent) => {
                const current = Number(splitter.getAttribute('aria-valuenow')) || DEFAULT_MAPPING_WIDTH;
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    applyWidth(current + 16, true);
                } else if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    applyWidth(current - 16, true);
                } else if (event.key === 'Home') {
                    event.preventDefault();
                    applyWidth(MIN_MAPPING_WIDTH, true);
                } else if (event.key === 'End') {
                    event.preventDefault();
                    applyWidth(MAX_MAPPING_WIDTH, true);
                } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    applyWidth(DEFAULT_MAPPING_WIDTH, true);
                }
            };
            const onResize = () => applyWidth(Number(splitter.getAttribute('aria-valuenow')) || DEFAULT_MAPPING_WIDTH, false);

            splitter.addEventListener('pointerdown', onPointerDown);
            splitter.addEventListener('keydown', onKeyDown);
            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerUp);
            window.addEventListener('resize', onResize);
            applyWidth(readStoredWidth(), false);

            disposeMappingResize = () => {
                stopResize();
                splitter.removeEventListener('pointerdown', onPointerDown);
                splitter.removeEventListener('keydown', onKeyDown);
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointercancel', onPointerUp);
                window.removeEventListener('resize', onResize);
                disposeMappingResize = null;
            };
        };
        setupMappingResize();

        if ($.browseBtn) $.browseBtn.addEventListener('click', () => loadJson());
        if ($.dropZone) {
            $.dropZone.addEventListener('click', () => loadJson());
            $.dropZone.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void loadJson();
                }
            });
            $.dropZone.addEventListener('dragover', (event: DragEvent) => {
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
                if ($.dropZone) $.dropZone.dataset.dragging = 'true';
            });
            $.dropZone.addEventListener('dragleave', () => {
                if ($.dropZone) delete $.dropZone.dataset.dragging;
            });
            $.dropZone.addEventListener('drop', (event: DragEvent) => {
                event.preventDefault();
                if ($.dropZone) delete $.dropZone.dataset.dragging;
                const files = event.dataTransfer && event.dataTransfer.files;
                const file = files && files.length > 0 ? files[0] : null;
                const filePath = file ? getDroppedFilePath(file) : '';
                if (!filePath || !filePath.toLowerCase().endsWith('.json')) {
                    setStatus('请拖入一个本地 JSON 文件。', 'warn');
                    return;
                }
                void loadJson(filePath);
            });
        }
        if ($.clearBtn) $.clearBtn.addEventListener('click', async () => {
            const clearedPath = selectedJsonPath;
            clearJson();
            try {
                window.localStorage.removeItem(LAST_JSON_KEY);
            } catch { /* Project profile remains the source of truth. */ }
            setStatus('正在清除当前 JSON...', 'info');
            try {
                const result: any = await REQ('clear-current-json-path', clearedPath);
                if (selectedJsonPath) return;
                const cleared = !!(result && result.data && result.data.cleared);
                setStatus(cleared ? '当前 JSON 已清除。' : '已保留刚收到的新推送。', cleared ? 'info' : 'ok');
            } catch (error: any) {
                if (!selectedJsonPath) setStatus(`JSON 清除失败：${error && error.message || error}`, 'error');
            }
        });
        if ($.reloadPreviewBtn) $.reloadPreviewBtn.addEventListener('click', () => {
            if (selectedJsonPath) void loadJson(selectedJsonPath);
        });
        if ($.zoomOutBtn) $.zoomOutBtn.addEventListener('click', () => zoomAt(zoom / 1.2));
        if ($.zoomInBtn) $.zoomInBtn.addEventListener('click', () => zoomAt(zoom * 1.2));
        if ($.actualSizeBtn) $.actualSizeBtn.addEventListener('click', showActualSize);
        if ($.fitPreviewBtn) $.fitPreviewBtn.addEventListener('click', fitPreview);
        if ($.previewViewport) {
            $.previewViewport.addEventListener('wheel', (event: WheelEvent) => {
                if (!lastPreview) return;
                event.preventDefault();
                zoomAt(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY);
            }, { passive: false });
            $.previewViewport.addEventListener('mousedown', (event: MouseEvent) => {
                if (!lastPreview) return;
                if (event.button === 1) {
                    event.preventDefault();
                    pointerMode = 'pan';
                    pointerStartClient = { x: event.clientX, y: event.clientY };
                    pointerStartPan = { x: panX, y: panY };
                    if ($.previewViewport) $.previewViewport.dataset.panning = 'true';
                    return;
                }
                if (event.button !== 0) return;
                const point = canvasPointFromMouse(event);
                if (!point) return;
                pointerMode = 'select';
                pointerStartCanvas = point;
                selectionRect = { x: point.x, y: point.y, width: 0, height: 0 };
                selectionHits = [];
                suppressPreviewClick = false;
                renderOverlay();
            });
            $.previewViewport.addEventListener('mousemove', (event: MouseEvent) => {
                if (pointerMode === 'pan' && pointerStartClient && pointerStartPan) {
                    panX = pointerStartPan.x + event.clientX - pointerStartClient.x;
                    panY = pointerStartPan.y + event.clientY - pointerStartClient.y;
                    applyPreviewTransform();
                    return;
                }
                if (pointerMode !== 'select' || !pointerStartCanvas) return;
                const point = canvasPointFromMouse(event);
                if (!point) return;
                selectionRect = rectFromPoints(pointerStartCanvas, point);
                if (selectionRect.width > 3 / zoom || selectionRect.height > 3 / zoom) suppressPreviewClick = true;
                renderOverlay();
            });
            const finishPointer = (event: MouseEvent) => {
                if (pointerMode === 'pan') {
                    pointerMode = 'none';
                    pointerStartClient = null;
                    pointerStartPan = null;
                    if ($.previewViewport) delete $.previewViewport.dataset.panning;
                    return;
                }
                if (pointerMode !== 'select' || !pointerStartCanvas) return;
                const point = canvasPointFromMouse(event) || pointerStartCanvas;
                const completed = rectFromPoints(pointerStartCanvas, point);
                pointerMode = 'none';
                pointerStartCanvas = null;
                if (completed.width <= 3 / zoom && completed.height <= 3 / zoom) {
                    selectionRect = null;
                    renderOverlay();
                    return;
                }
                selectionRect = completed;
                const hits = lastPreview && Array.isArray(lastPreview.hits) ? lastPreview.hits : [];
                selectionHits = hits.filter((hit) => intersectionArea(hit, completed) > 0.5);
                highlightedRects = selectionHits.slice(0, 120);
                const componentHit = selectionHits.find((hit) => !!String(hit.componentKey || ''));
                selectedComponentIdentity = componentHit ? identityFromHit(componentHit) : null;
                renderOverlay();
                renderSelection();
                renderMappings();
            };
            $.previewViewport.addEventListener('mouseup', finishPointer);
            $.previewViewport.addEventListener('mouseleave', finishPointer);
            $.previewViewport.addEventListener('click', (event: MouseEvent) => {
                if (suppressPreviewClick) {
                    suppressPreviewClick = false;
                    return;
                }
                const point = canvasPointFromMouse(event);
                if (point) selectAtPoint(point);
            });
        }
        if ($.selectionHits) $.selectionHits.addEventListener('click', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const button = target.closest('[data-hit-index]') as HTMLElement | null;
            if (!button) return;
            const hit = selectionHits[Number(button.dataset.hitIndex)];
            if (!hit) return;
            highlightedRects = [hit];
            const identity = identityFromHit(hit);
            selectedComponentIdentity = identity.componentKey ? identity : null;
            renderOverlay();
            renderSelection();
            renderMappings();
            focusHighlightedRects([hit]);
        });
        if ($.componentList) $.componentList.addEventListener('click', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const unassignButton = target.closest('[data-action="unassign-slot"]') as HTMLElement | null;
            if (unassignButton) {
                const slot = renderedBindingSlots[Number(unassignButton.dataset.bindingIndex)];
                if (slot) void unassignComponent(slot.component.componentKey, slot.variantFilter);
                event.stopPropagation();
                return;
            }
            if (target.closest('ui-asset')) {
                event.stopPropagation();
                return;
            }
            const card = target.closest('[data-component-index]') as HTMLElement | null;
            const index = Number(card && card.dataset.componentIndex);
            const component = renderedComponents[index];
            if (!component) return;
            event.stopPropagation();
            selectComponent(component);
        });
        if ($.componentList) $.componentList.addEventListener('change', (event: Event) => {
            const target = event.target as HTMLElement;
            const field = target.closest('ui-asset[data-binding-index]') as (HTMLElement & { value?: string; disabled?: boolean }) | null;
            if (!field || field.disabled) return;
            const slot = renderedBindingSlots[Number(field.dataset.bindingIndex)];
            if (!slot) return;
            event.stopPropagation();
            const prefabUuid = String(field.value || '').trim();
            field.disabled = true;
            field.setAttribute('disabled', '');
            const operation = prefabUuid
                ? assignComponent(slot.component, slot.variantFilter, prefabUuid)
                : unassignComponent(slot.component.componentKey, slot.variantFilter);
            void operation.finally(() => {
                field.disabled = false;
                field.removeAttribute('disabled');
            });
        }, true);
        if ($.mappingList) $.mappingList.addEventListener('click', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const button = target.closest('[data-entry-index]') as HTMLElement | null;
            if (!button) return;
            const entry = mappingEntries()[Number(button.dataset.entryIndex)];
            if (entry) void unassignComponent(String(entry.componentKey || ''), String(entry.variantFilter || ''));
        });
        if ($.componentSearch) $.componentSearch.addEventListener('input', renderMappings);
        if ($.includeNested) $.includeNested.addEventListener('change', renderMappings);
        if ($.hideMapped) $.hideMapped.addEventListener('change', renderMappings);
        if ($.mappingRefreshBtn) $.mappingRefreshBtn.addEventListener('click', async () => {
            if (!selectedJsonPath) {
                setStatus('请先选择当前 Figma JSON。', 'warn');
                return;
            }
            const revision = loadRevision;
            $.mappingRefreshBtn!.disabled = true;
            clearMappingSurface('正在重新扫描当前 JSON 的组件...', '正在刷新组件与映射...');
            setStatus('正在重新扫描当前 JSON...', 'info');
            try {
                const scanned: any = await REQ('scan-component-identities-from-json', selectedJsonPath);
                if (revision !== loadRevision) return;
                if (!scanned || scanned.success === false) {
                    clearMappingSurface('组件扫描失败，未使用旧候选', '组件扫描失败');
                    setStatus(`组件扫描失败：${scanned && scanned.error || '未知错误'}`, 'error');
                    return;
                }
                const mappingsLoaded = await loadMappings(revision);
                if (revision !== loadRevision || !mappingsLoaded) return;
                setStatus('组件候选与映射已刷新。', 'ok');
            } catch (error: any) {
                if (revision !== loadRevision) return;
                clearMappingSurface('组件刷新异常，未使用旧候选', '组件刷新失败');
                setStatus(`组件刷新异常：${error && error.message || error}`, 'error');
            } finally {
                if (revision === loadRevision) $.mappingRefreshBtn!.disabled = false;
            }
        });
        if ($.importBtn) $.importBtn.addEventListener('click', async () => {
            if (!selectedJsonPath) return;
            $.importBtn!.disabled = true;
            setStatus('正在完整导入到当前场景...', 'info');
            try {
                const result: any = await REQ('import-from-json', selectedJsonPath);
                if (!result || result.success === false) {
                    setStatus(`导入失败：${result && result.error || '未知错误'}`, 'error');
                    return;
                }
                const data = result.data || {};
                await loadMappings();
                setStatus(`完整导入完成：${data.rootName || data.rootUuid || basename(selectedJsonPath)}`, 'ok');
            } catch (error: any) {
                setStatus(`导入异常：${error && error.message || error}`, 'error');
            } finally {
                $.importBtn!.disabled = !selectedJsonPath || !lastPreview;
            }
        });
        if ($.replacePanelBtn) $.replacePanelBtn.addEventListener('click', async () => {
            try {
                await REQ('open-replace-panel-beta', { jsonPath: selectedJsonPath });
                setStatus('高级局部替换已打开，并继承当前 JSON。', 'ok');
            } catch (error: any) {
                setStatus(`高级局部替换打开失败：${error && error.message || error}`, 'error');
            }
        });

        const refreshPushState = async () => {
            try {
                const result: any = await REQ('get-push-server-status');
                const running = !!(result && result.data && result.data.running);
                if ($.pushState) {
                    $.pushState.textContent = running ? '运行中' : '已停止';
                    $.pushState.dataset.tone = running ? 'ok' : 'off';
                    if ($.pushState.parentElement) $.pushState.parentElement.dataset.tone = running ? 'ok' : 'off';
                }
                if ($.pushStartBtn) $.pushStartBtn.disabled = running;
                if ($.pushStopBtn) $.pushStopBtn.disabled = !running;
            } catch {
                if ($.pushState) $.pushState.textContent = '状态不可用';
            }
        };

        const renderDirs = () => {
            if (!$.dirList) return;
            $.dirList.innerHTML = dirs.length === 0
                ? '<div class="empty">默认扫描 db://assets</div>'
                : dirs.map((dir, index) => `<div class="dir-row"><span class="dir-url" title="${escapeHtml(dir)}">${escapeHtml(dir)}</span>` +
                    `<button class="dir-remove" type="button" data-index="${index}">删除</button></div>`).join('');
            $.dirList.querySelectorAll<HTMLButtonElement>('.dir-remove').forEach((button) => {
                button.addEventListener('click', async () => {
                    const index = Number(button.dataset.index);
                    if (index < 0 || index >= dirs.length) return;
                    dirs.splice(index, 1);
                    const result: any = await REQ('set-common-resource-dirs', dirs);
                    if (result && result.data && Array.isArray(result.data.dirs)) dirs = result.data.dirs;
                    renderDirs();
                });
            });
        };

        const loadDirs = async () => {
            try {
                const result: any = await REQ('get-common-resource-dirs');
                dirs = result && result.data && Array.isArray(result.data.dirs) ? result.data.dirs : [];
                renderDirs();
            } catch (error: any) {
                setStatus(`资源目录读取失败：${error && error.message || error}`, 'error');
            }
        };

        if ($.pushStartBtn) $.pushStartBtn.addEventListener('click', async () => {
            setStatus('启动推送服务...', 'info');
            const result: any = await REQ('start-push-server');
            await refreshPushState();
            setStatus(result && result.success === false ? `启动失败：${result.error || '未知错误'}` : '推送服务已启动。', result && result.success === false ? 'error' : 'ok');
        });
        if ($.pushStopBtn) $.pushStopBtn.addEventListener('click', async () => {
            setStatus('停止推送服务...', 'info');
            const result: any = await REQ('stop-push-server');
            await refreshPushState();
            setStatus(result && result.success === false ? `停止失败：${result.error || '未知错误'}` : '推送服务已停止。', result && result.success === false ? 'error' : 'ok');
        });
        if ($.addBtn) $.addBtn.addEventListener('click', async () => {
            const result: any = await REQ('add-common-resource-dir');
            if (!result || result.success === false) {
                setStatus(result && result.canceled ? '已取消。' : `添加失败：${result && result.error || '未知错误'}`, result && result.canceled ? 'info' : 'error');
                return;
            }
            dirs = result.data && Array.isArray(result.data.dirs) ? result.data.dirs : dirs;
            renderDirs();
            setStatus(`已添加：${result.data && result.data.added || ''}`, 'ok');
        });
        if ($.resetBtn) $.resetBtn.addEventListener('click', async () => {
            dirs = ['db://assets'];
            await REQ('set-common-resource-dirs', dirs);
            renderDirs();
            setStatus('资源目录已恢复为 db://assets。', 'ok');
        });

        const bindSimpleAction = (button: HTMLButtonElement | undefined, message: string, busyText: string, args: () => any[] = () => []) => {
            if (!button) return;
            button.addEventListener('click', async () => {
                setStatus(busyText, 'info');
                try {
                    const result: any = await REQ(message, ...args());
                    setStatus(result && result.success === false ? `失败：${result.error || '未知错误'}` : '完成。', result && result.success === false ? 'error' : 'ok');
                } catch (error: any) {
                    setStatus(`异常：${error && error.message || error}`, 'error');
                }
            });
        };
        bindSimpleAction($.genStyleBtn, 'generate-text-styles-from-json-beta', '生成 TextStyles 中...', () => selectedJsonPath ? [selectedJsonPath] : []);
        bindSimpleAction($.exportBtn, 'export-tree-to-json-file', '导出 Cocos JSON 中...');
        bindSimpleAction($.pushFigmaBtn, 'push-tree-to-figma', '推送到 Figma 队列中...');

        clearJson();
        void readRememberedJsonPath().then((rememberedPath) => {
            if (disposed) return;
            if (rememberedPath && !selectedJsonPath && !previewLoading) void loadJson(rememberedPath, true);
        });
        void loadDirs();
        void refreshPushState();
    },
    update(options?: WorkbenchOpenOptions) {
        if (updateSettingsWorkbench) void updateSettingsWorkbench(options);
    },
    close() {
        if (disposeMappingResize) disposeMappingResize();
        if (clearWorkbenchPreview) clearWorkbenchPreview();
        clearWorkbenchPreview = null;
        refreshSettingsWorkspacePath = null;
        updateSettingsWorkbench = null;
    },
});

function groupComponentIdentities(components: ComponentIdentity[]): ComponentGroup[] {
    const groups = new Map<string, ComponentGroup>();
    for (const component of components) {
        const componentKey = String(component && component.componentKey || '').trim();
        if (!componentKey) continue;
        let group = groups.get(componentKey);
        if (!group) {
            group = {
                componentKey,
                componentName: String(component.componentName || ''),
                identities: [],
                isNested: component.isNested === true,
            };
            groups.set(componentKey, group);
        } else {
            if (group.isNested && component.isNested !== true && component.componentName) {
                group.componentName = component.componentName;
            } else if (!group.componentName && component.componentName) {
                group.componentName = component.componentName;
            }
            group.isNested = group.isNested && component.isNested === true;
        }
        const existingIndex = group.identities.findIndex((item) => item.variantFilter === component.variantFilter);
        if (existingIndex < 0) group.identities.push(component);
        else if (group.identities[existingIndex].isNested === true && component.isNested !== true) {
            group.identities[existingIndex] = component;
        }
    }
    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            identities: group.identities.slice().sort((left, right) => left.variantFilter.localeCompare(right.variantFilter)),
        }))
        .sort((left, right) =>
            left.componentName.localeCompare(right.componentName) || left.componentKey.localeCompare(right.componentKey)
        );
}

function identityFromHit(hit: PreviewHit): ComponentIdentity {
    return {
        componentKey: String(hit && hit.componentKey || ''),
        componentName: String(hit && (hit.componentName || hit.name) || ''),
        variantFilter: String(hit && hit.variantFilter || ''),
        componentProperties: hit && hit.componentProperties || {},
    };
}

function sameComponent(left: Partial<ComponentIdentity>, right: Partial<ComponentIdentity>): boolean {
    return String(left && left.componentKey || '') === String(right && right.componentKey || '') &&
        String(left && left.variantFilter || '') === String(right && right.variantFilter || '');
}

function variantLabel(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '默认（兜底）';
    return raw.split(',').map((part) => {
        const separator = part.indexOf('=');
        if (separator <= 0) return part.trim();
        return `${part.slice(0, separator).trim()}：${part.slice(separator + 1).trim()}`;
    }).join(' · ');
}

function rectHtml(rect: PreviewRect, className: string, title: string): string {
    return `<div class="${className}" title="${escapeHtml(title)}" style="left:${rect.x}px;top:${rect.y}px;width:${Math.max(0, rect.width)}px;height:${Math.max(0, rect.height)}px"></div>`;
}

function rectFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): PreviewRect {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

function rectArea(rect: PreviewRect): number {
    return Math.max(0, Number(rect.width) || 0) * Math.max(0, Number(rect.height) || 0);
}

function pointInRect(point: { x: number; y: number }, rect: PreviewRect): boolean {
    return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
}

function intersectionArea(left: PreviewRect, right: PreviewRect): number {
    const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
    const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
    return width * height;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function escapeHtml(value: unknown): string {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDroppedFilePath(file: File): string {
    const legacyPath = String((file as File & { path?: string }).path || '').trim();
    if (legacyPath) return legacyPath;
    try {
        const electron = require('electron');
        if (electron && electron.webUtils && typeof electron.webUtils.getPathForFile === 'function') {
            return String(electron.webUtils.getPathForFile(file) || '').trim();
        }
    } catch { /* Older Electron does not expose webUtils. */ }
    return '';
}
