"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const json_workspace_state_1 = require("../../json-workspace-state");
function asElementMap(raw) {
    return raw;
}
const REQ = (message, ...args) => Editor.Message.request('figma-importer', message, ...args);
const LAST_JSON_KEY = 'figma-importer.settings.last-json-path';
const MAPPING_WIDTH_KEY = 'figma-importer.settings.mapping-width';
const DEFAULT_MAPPING_WIDTH = 380;
const MIN_MAPPING_WIDTH = 320;
const MAX_MAPPING_WIDTH = 560;
const MIN_PREVIEW_WIDTH = 420;
const MAPPING_SPLITTER_WIDTH = 6;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
let refreshSettingsWorkspacePath = null;
let updateSettingsWorkbench = null;
let clearWorkbenchPreview = null;
let disposeMappingResize = null;
module.exports = Editor.Panel.define({
    template: (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/settings/index.html'), 'utf-8'),
    style: (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/settings/index.css'), 'utf-8'),
    listeners: {
        show() {
            if (refreshSettingsWorkspacePath)
                refreshSettingsWorkspacePath();
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
        async acceptPushedJson(options) {
            if (!updateSettingsWorkbench) {
                return { success: false, error: 'FtoC 导入工作台尚未就绪' };
            }
            const loaded = await updateSettingsWorkbench(options);
            return loaded
                ? { success: true, data: { jsonPath: (0, json_workspace_state_1.normalizeCurrentJsonPath)(options && options.jsonPath) } }
                : { success: false, error: 'FtoC 导入工作台未能加载推送 JSON' };
        },
    },
    ready() {
        const $ = asElementMap(this.$);
        let dirs = [];
        let selectedJsonPath = '';
        let previewLoading = false;
        let activeLoadPath = '';
        let activeLoadPromise = null;
        let disposed = false;
        let loadRevision = 0;
        let lastPreview = null;
        let previewImageUrl = '';
        let previewImageUrlToken = 0;
        let mappingData = null;
        let renderedComponents = [];
        let renderedBindingSlots = [];
        let selectedComponentIdentity = null;
        let highlightedRects = [];
        let selectionRect = null;
        let selectionHits = [];
        let zoom = 1;
        let panX = 0;
        let panY = 0;
        let pointerMode = 'none';
        let pointerStartCanvas = null;
        let pointerStartClient = null;
        let pointerStartPan = null;
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
        const ensurePreviewImageUrl = async (imageData) => {
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
            }
            catch (_a) {
                // The main preview can still use the data URL directly.
            }
            if (token !== previewImageUrlToken)
                return '';
            return '';
        };
        if ($.version) {
            try {
                const pkg = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../../package.json'), 'utf-8'));
                $.version.textContent = `v${pkg.version || '?'}`;
            }
            catch (_a) {
                $.version.textContent = '';
            }
        }
        const setStatus = (text, tone = 'info') => {
            if (!$.status)
                return;
            $.status.textContent = text;
            $.status.title = text;
            $.status.dataset.tone = tone;
        };
        const rememberJsonPath = async (filePath) => {
            const normalized = (0, json_workspace_state_1.normalizeCurrentJsonPath)(filePath);
            try {
                if (normalized)
                    window.localStorage.setItem(LAST_JSON_KEY, normalized);
                else
                    window.localStorage.removeItem(LAST_JSON_KEY);
            }
            catch ( /* Project profile remains the source of truth. */_a) { /* Project profile remains the source of truth. */ }
            try {
                await REQ('set-current-json-path', normalized);
            }
            catch ( /* The active panel still keeps its in-memory path. */_b) { /* The active panel still keeps its in-memory path. */ }
            return normalized;
        };
        const readRememberedJsonPath = async () => {
            const sharedPath = await (0, json_workspace_state_1.readCurrentJsonPath)();
            if (sharedPath)
                return sharedPath;
            try {
                const legacyPath = String(window.localStorage.getItem(LAST_JSON_KEY) || '').trim();
                if (legacyPath)
                    await rememberJsonPath(legacyPath);
                return legacyPath;
            }
            catch (_a) {
                return '';
            }
        };
        const setPreviewState = (state, message = '') => {
            if (!$.filePreview)
                return;
            $.filePreview.dataset.state = state;
            const empty = $.filePreview.querySelector('.preview-empty');
            if (empty && message)
                empty.textContent = message;
        };
        const setPreviewToolsEnabled = (enabled) => {
            for (const button of [$.zoomOutBtn, $.zoomInBtn, $.actualSizeBtn, $.fitPreviewBtn, $.reloadPreviewBtn]) {
                if (button)
                    button.disabled = !enabled;
            }
        };
        const applyPreviewTransform = () => {
            if ($.previewStage) {
                $.previewStage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
            }
            if ($.zoomLabel)
                $.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
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
            if ($.previewOverlay)
                $.previewOverlay.innerHTML = '';
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
            if ($.previewMeta)
                $.previewMeta.textContent = '尚未加载';
            if ($.selectionSummary)
                $.selectionSummary.textContent = '未选择画板节点';
            if ($.selectionHits)
                $.selectionHits.innerHTML = '';
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
        const clearMappingSurface = (componentMessage, summary = '等待组件扫描') => {
            mappingData = null;
            renderedComponents = [];
            renderedBindingSlots = [];
            if ($.mappingSummary)
                $.mappingSummary.textContent = summary;
            if ($.componentList)
                $.componentList.innerHTML = `<div class="empty">${escapeHtml(componentMessage)}</div>`;
            if ($.mappingList)
                $.mappingList.innerHTML = '';
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
            if ($.clearBtn)
                $.clearBtn.disabled = true;
            if ($.importBtn)
                $.importBtn.disabled = true;
            if ($.previewFile)
                $.previewFile.textContent = '—';
            if ($.previewName)
                $.previewName.textContent = '—';
            if ($.previewCanvas)
                $.previewCanvas.textContent = '—';
            if ($.previewStats)
                $.previewStats.textContent = '—';
            setPreviewState('empty', '选择 JSON 后显示真实画板');
        };
        const canvasSize = () => ({
            width: Math.max(1, Number(lastPreview && lastPreview.canvas && lastPreview.canvas.width) || 1),
            height: Math.max(1, Number(lastPreview && lastPreview.canvas && lastPreview.canvas.height) || 1),
        });
        const fitPreview = () => {
            if (!lastPreview || !$.previewViewport)
                return;
            const viewportWidth = Math.max(1, $.previewViewport.clientWidth);
            const viewportHeight = Math.max(1, $.previewViewport.clientHeight);
            const canvas = canvasSize();
            zoom = clamp(Math.min((viewportWidth - 32) / canvas.width, (viewportHeight - 32) / canvas.height), MIN_ZOOM, MAX_ZOOM);
            panX = (viewportWidth - canvas.width * zoom) / 2;
            panY = (viewportHeight - canvas.height * zoom) / 2;
            applyPreviewTransform();
        };
        const showActualSize = () => {
            if (!lastPreview || !$.previewViewport)
                return;
            const canvas = canvasSize();
            zoom = 1;
            panX = ($.previewViewport.clientWidth - canvas.width) / 2;
            panY = ($.previewViewport.clientHeight - canvas.height) / 2;
            applyPreviewTransform();
        };
        const zoomAt = (nextZoom, clientX, clientY) => {
            if (!lastPreview || !$.previewViewport)
                return;
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
            if (!$.previewOverlay)
                return;
            const html = [];
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
                }
                else if (selectionHits.length > 0) {
                    $.selectionSummary.textContent = `命中 ${selectionHits.length} 个节点`;
                }
                else {
                    $.selectionSummary.textContent = '未选择画板节点';
                }
            }
            if (!$.selectionHits)
                return;
            $.selectionHits.innerHTML = selectionHits.slice(0, 24).map((hit, index) => `<button class="selection-hit" type="button" data-hit-index="${index}" title="${escapeHtml(hit.path)}">${escapeHtml(hit.name || hit.path)}</button>`).join('');
        };
        const mappingEntries = () => {
            const resolved = mappingData && mappingData.resolved;
            if (resolved && Array.isArray(resolved.entries))
                return resolved.entries;
            const document = mappingData && mappingData.document || { entries: [] };
            return Array.isArray(document.entries) ? document.entries : [];
        };
        const mappingEntryIsResolved = (entry) => !!(entry &&
            entry.resolved !== false &&
            (String(entry.prefabUuid || '').trim() || String(entry.prefabUrl || '').trim()));
        const mappingForComponent = (component) => {
            const entries = mappingEntries().filter((entry) => String(entry.componentKey || '') === component.componentKey);
            const exact = entries.find((entry) => String(entry.variantFilter || '') === component.variantFilter);
            const fallback = entries.find((entry) => !String(entry.variantFilter || '').trim());
            const effective = mappingEntryIsResolved(exact)
                ? exact
                : mappingEntryIsResolved(fallback) ? fallback : undefined;
            return { exact, fallback, effective };
        };
        const mappingEntryForSlot = (componentKey, variantFilter) => mappingEntries().find((entry) => String(entry.componentKey || '') === componentKey &&
            String(entry.variantFilter || '') === variantFilter);
        const previewHitForComponent = (component) => {
            const hits = lastPreview && Array.isArray(lastPreview.hits) ? lastPreview.hits : [];
            return hits.find((hit) => sameComponent(hit, component)) ||
                hits.find((hit) => String(hit.componentKey || '') === component.componentKey);
        };
        const componentThumbStyle = (component) => {
            const hit = previewHitForComponent(component);
            if (!hit || hit.width <= 0 || hit.height <= 0 || !previewImageUrl)
                return '';
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
            const components = mappingData && Array.isArray(mappingData.components)
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
                if (hideMapped && allMapped)
                    return false;
                if (!search)
                    return true;
                return `${group.componentName} ${group.componentKey} ${group.identities.map((item) => item.variantFilter).join(' ')}`
                    .toLowerCase()
                    .includes(search);
            });
            renderedComponents = renderedGroups.map((group) => group.identities.find((component) => !!selectedComponentIdentity && sameComponent(component, selectedComponentIdentity)) || group.identities[0]);
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
                        const explicitVariantFilters = Array.from(new Set(group.identities.map((identity) => String(identity.variantFilter || '')).filter(Boolean)));
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
                $.componentList.querySelectorAll('.component-thumb-image').forEach((image) => {
                    const thumbnail = image.closest('.component-thumb');
                    const settle = () => {
                        const loaded = image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
                        if (thumbnail)
                            thumbnail.classList.toggle('has-preview', loaded);
                        if (!loaded)
                            image.remove();
                    };
                    image.addEventListener('load', settle, { once: true });
                    image.addEventListener('error', settle, { once: true });
                    if (image.complete)
                        settle();
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
                            : `Prefab 断链 · ${entry.requestedPrefabUrl || entry.requestedPrefabUuid || '资源不存在'}`)}</code></div>`).join('');
            }
        };
        const loadMappings = async (revision = loadRevision) => {
            const result = await REQ('get-component-mappings');
            if (revision !== loadRevision)
                return false;
            if (!result || result.success === false) {
                setStatus(`读取映射失败：${result && result.error || '未知错误'}`, 'error');
                return false;
            }
            mappingData = result.data || {};
            renderMappings();
            return true;
        };
        const assignComponent = async (component, variantFilter, prefabUuid) => {
            if (!component || !component.componentKey || !prefabUuid)
                return false;
            setStatus('正在 Assign Prefab...', 'info');
            try {
                const result = await REQ('upsert-component-mapping', {
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
            }
            catch (error) {
                setStatus(`绑定异常：${error && error.message || error}`, 'error');
                renderMappings();
                return false;
            }
        };
        const unassignComponent = async (componentKey, variantFilter) => {
            if (!componentKey)
                return false;
            setStatus('正在解绑 Prefab...', 'info');
            try {
                const result = await REQ('remove-component-mapping', componentKey, variantFilter);
                if (!result || result.success === false) {
                    setStatus(`解绑失败：${result && result.error || '未知错误'}`, 'error');
                    renderMappings();
                    return false;
                }
                await loadMappings();
                setStatus('Prefab 映射已解绑。', 'ok');
                return true;
            }
            catch (error) {
                setStatus(`解绑异常：${error && error.message || error}`, 'error');
                renderMappings();
                return false;
            }
        };
        const focusHighlightedRects = (rects) => {
            if (!$.previewViewport || rects.length === 0)
                return;
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
        const selectComponent = (component, focus = true) => {
            selectedComponentIdentity = component;
            selectionRect = null;
            const hits = lastPreview && Array.isArray(lastPreview.hits) ? lastPreview.hits : [];
            highlightedRects = hits.filter((hit) => sameComponent(hit, component));
            selectionHits = highlightedRects.slice();
            renderOverlay();
            renderSelection();
            renderMappings();
            if (focus)
                focusHighlightedRects(highlightedRects);
        };
        const canvasPointFromMouse = (event) => {
            if (!lastPreview || !$.previewViewport)
                return null;
            const rect = $.previewViewport.getBoundingClientRect();
            return {
                x: (event.clientX - rect.left - panX) / zoom,
                y: (event.clientY - rect.top - panY) / zoom,
            };
        };
        const selectAtPoint = (point) => {
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
        const renderPreview = (preview) => {
            const filePath = (0, json_workspace_state_1.normalizeCurrentJsonPath)(preview.filePath || selectedJsonPath);
            selectedJsonPath = filePath;
            lastPreview = Object.assign(Object.assign({}, preview), { filePath, previewImageDataUrl: undefined, hits: Array.isArray(preview.hits) ? preview.hits : [] });
            if ($.jsonPath) {
                $.jsonPath.value = filePath;
                $.jsonPath.title = filePath;
            }
            if ($.clearBtn)
                $.clearBtn.disabled = !filePath;
            if ($.importBtn)
                $.importBtn.disabled = !filePath;
            if ($.reloadPreviewBtn)
                $.reloadPreviewBtn.disabled = !filePath;
            if ($.previewFile) {
                $.previewFile.textContent = (0, path_1.basename)(filePath) || '—';
                $.previewFile.title = filePath;
            }
            if ($.previewName)
                $.previewName.textContent = String(preview.name || '未命名');
            const width = Math.round(Number(preview.canvas && preview.canvas.width) || 0);
            const height = Math.round(Number(preview.canvas && preview.canvas.height) || 0);
            if ($.previewCanvas)
                $.previewCanvas.textContent = width > 0 && height > 0 ? `${width} × ${height}` : '未知';
            const stats = preview.stats || {};
            const parts = [
                `${Number(stats.hits) || 0} 节点`,
                `${Number(stats.texts) || 0} 文字`,
                `${Number(stats.images) || 0} 图片`,
            ];
            if ((Number(stats.interfaceCount) || 0) > 1)
                parts.push(`${stats.interfaceCount} 画板`);
            if ($.previewStats)
                $.previewStats.textContent = parts.join(' · ');
            if ($.previewMeta)
                $.previewMeta.textContent = `${preview.name || '未命名'} · ${width}×${height} · ${parts.join(' · ')}`;
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
            if (!imageSource)
                requestAnimationFrame(fitPreview);
        };
        const loadJsonInternal = async (presetPath, silent = false) => {
            if (disposed || (previewLoading && !presetPath))
                return false;
            const requestPath = (0, json_workspace_state_1.normalizeCurrentJsonPath)(presetPath);
            if (requestPath)
                selectedJsonPath = requestPath;
            const revision = ++loadRevision;
            previewLoading = true;
            clearPreviewState();
            clearMappingSurface('正在扫描当前 JSON 的组件...', '正在加载组件与映射...');
            if ($.browseBtn)
                $.browseBtn.disabled = true;
            if ($.clearBtn)
                $.clearBtn.disabled = true;
            if ($.mappingRefreshBtn)
                $.mappingRefreshBtn.disabled = true;
            if ($.importBtn)
                $.importBtn.disabled = true;
            if (!silent)
                setStatus(requestPath ? '正在加载画板预览...' : '选择 JSON 文件...', 'info');
            try {
                // An empty request path is intentional: the main process opens the JSON picker.
                const result = await REQ('load-json-preview-beta', requestPath, true, false);
                if (disposed || revision !== loadRevision)
                    return false;
                if (!result || result.success === false || !result.data) {
                    const canceled = result && String(result.error || '').toLowerCase() === 'canceled';
                    clearMappingSurface(canceled ? '未载入新的 JSON' : 'JSON 无法读取，未加载组件候选');
                    if (!canceled) {
                        setPreviewState('error', 'JSON 无法读取或格式无效');
                        setStatus(`JSON 读取失败：${result && result.error || '未知错误'}`, 'error');
                    }
                    else if (!silent) {
                        setStatus('已取消选择。', 'info');
                    }
                    return false;
                }
                const previewData = result.data;
                await ensurePreviewImageUrl(String(previewData.previewImageDataUrl || ''));
                if (disposed || revision !== loadRevision)
                    return false;
                await rememberJsonPath((0, json_workspace_state_1.normalizeCurrentJsonPath)(previewData.filePath || selectedJsonPath));
                if (disposed || revision !== loadRevision)
                    return false;
                renderPreview(previewData);
                const scanned = await REQ('scan-component-identities-from-json', selectedJsonPath);
                if (disposed || revision !== loadRevision)
                    return false;
                if (!scanned || scanned.success === false) {
                    clearMappingSurface('组件扫描失败，未加载上一份 JSON 的候选', '组件扫描失败');
                    setStatus(`预览已加载，组件扫描失败：${scanned && scanned.error || '未知错误'}`, 'warn');
                    return false;
                }
                const mappingsLoaded = await loadMappings(revision);
                if (disposed || revision !== loadRevision)
                    return false;
                if (!mappingsLoaded)
                    return false;
                setStatus(`预览就绪：${(0, path_1.basename)(selectedJsonPath)}，可调整组件映射后完整导入。`, 'ok');
                return true;
            }
            catch (error) {
                if (revision !== loadRevision)
                    return false;
                setPreviewState('error', 'JSON 无法读取或格式无效');
                setStatus(`JSON 读取异常：${error && error.message || error}`, 'error');
                return false;
            }
            finally {
                if (revision === loadRevision) {
                    previewLoading = false;
                    if ($.browseBtn)
                        $.browseBtn.disabled = false;
                    if ($.clearBtn)
                        $.clearBtn.disabled = !selectedJsonPath;
                    if ($.mappingRefreshBtn)
                        $.mappingRefreshBtn.disabled = false;
                    if ($.importBtn)
                        $.importBtn.disabled = !selectedJsonPath || !lastPreview;
                }
            }
        };
        const loadJson = (presetPath, silent = false) => {
            const requestPath = (0, json_workspace_state_1.normalizeCurrentJsonPath)(presetPath);
            if (requestPath && activeLoadPromise && activeLoadPath === requestPath) {
                return activeLoadPromise;
            }
            const promise = loadJsonInternal(presetPath, silent);
            activeLoadPath = requestPath;
            activeLoadPromise = promise;
            void promise.then(() => {
                if (activeLoadPromise === promise) {
                    activeLoadPath = '';
                    activeLoadPromise = null;
                }
            }, () => {
                if (activeLoadPromise === promise) {
                    activeLoadPath = '';
                    activeLoadPromise = null;
                }
            });
            return promise;
        };
        const openSection = (section = '') => {
            const target = section === 'mapping' ? $.mappingSection : $.previewSection;
            if (target && typeof target.scrollIntoView === 'function')
                target.scrollIntoView({ block: 'nearest' });
        };
        refreshSettingsWorkspacePath = () => {
            void (0, json_workspace_state_1.readCurrentJsonPath)().then((filePath) => {
                if (disposed)
                    return;
                const normalized = (0, json_workspace_state_1.normalizeCurrentJsonPath)(filePath);
                if (!normalized || normalized === selectedJsonPath)
                    return;
                void loadJson(normalized, true);
            });
        };
        updateSettingsWorkbench = (options) => {
            const hasJsonPath = !!options && Object.prototype.hasOwnProperty.call(options, 'jsonPath');
            const nextPath = (0, json_workspace_state_1.normalizeCurrentJsonPath)(options && options.jsonPath);
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
            if (!workspace || !splitter)
                return;
            let resizing = false;
            let pointerId = -1;
            const readStoredWidth = () => {
                try {
                    const value = Number(window.localStorage.getItem(MAPPING_WIDTH_KEY));
                    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAPPING_WIDTH;
                }
                catch (_a) {
                    return DEFAULT_MAPPING_WIDTH;
                }
            };
            const maxWidthForWorkspace = () => {
                const available = workspace.clientWidth;
                if (!available)
                    return MAX_MAPPING_WIDTH;
                return Math.max(MIN_MAPPING_WIDTH, Math.min(MAX_MAPPING_WIDTH, available - MIN_PREVIEW_WIDTH - MAPPING_SPLITTER_WIDTH));
            };
            const applyWidth = (requested, persist = false) => {
                const width = clamp(requested, MIN_MAPPING_WIDTH, maxWidthForWorkspace());
                workspace.style.setProperty('--mapping-width', `${Math.round(width)}px`);
                splitter.setAttribute('aria-valuenow', String(Math.round(width)));
                if (persist) {
                    try {
                        window.localStorage.setItem(MAPPING_WIDTH_KEY, String(Math.round(width)));
                    }
                    catch ( /* optional preference */_a) { /* optional preference */ }
                }
            };
            const widthFromPointer = (clientX) => {
                const rect = workspace.getBoundingClientRect();
                return rect.right - clientX;
            };
            const stopResize = () => {
                if (!resizing)
                    return;
                resizing = false;
                splitter.dataset.dragging = 'false';
                if (pointerId >= 0 && splitter.hasPointerCapture(pointerId))
                    splitter.releasePointerCapture(pointerId);
                pointerId = -1;
            };
            const onPointerMove = (event) => {
                if (!resizing || (pointerId >= 0 && event.pointerId !== pointerId))
                    return;
                event.preventDefault();
                applyWidth(widthFromPointer(event.clientX));
            };
            const onPointerUp = (event) => {
                if (!resizing)
                    return;
                if (pointerId >= 0 && event.pointerId !== pointerId)
                    return;
                const current = Number(splitter.getAttribute('aria-valuenow')) || DEFAULT_MAPPING_WIDTH;
                applyWidth(current, true);
                stopResize();
            };
            const onPointerDown = (event) => {
                if (event.button !== 0)
                    return;
                event.preventDefault();
                resizing = true;
                pointerId = event.pointerId;
                splitter.dataset.dragging = 'true';
                splitter.setPointerCapture(event.pointerId);
            };
            const onKeyDown = (event) => {
                const current = Number(splitter.getAttribute('aria-valuenow')) || DEFAULT_MAPPING_WIDTH;
                if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    applyWidth(current + 16, true);
                }
                else if (event.key === 'ArrowRight') {
                    event.preventDefault();
                    applyWidth(current - 16, true);
                }
                else if (event.key === 'Home') {
                    event.preventDefault();
                    applyWidth(MIN_MAPPING_WIDTH, true);
                }
                else if (event.key === 'End') {
                    event.preventDefault();
                    applyWidth(MAX_MAPPING_WIDTH, true);
                }
                else if (event.key === 'Enter' || event.key === ' ') {
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
        if ($.browseBtn)
            $.browseBtn.addEventListener('click', () => loadJson());
        if ($.dropZone) {
            $.dropZone.addEventListener('click', () => loadJson());
            $.dropZone.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void loadJson();
                }
            });
            $.dropZone.addEventListener('dragover', (event) => {
                event.preventDefault();
                if (event.dataTransfer)
                    event.dataTransfer.dropEffect = 'copy';
                if ($.dropZone)
                    $.dropZone.dataset.dragging = 'true';
            });
            $.dropZone.addEventListener('dragleave', () => {
                if ($.dropZone)
                    delete $.dropZone.dataset.dragging;
            });
            $.dropZone.addEventListener('drop', (event) => {
                event.preventDefault();
                if ($.dropZone)
                    delete $.dropZone.dataset.dragging;
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
        if ($.clearBtn)
            $.clearBtn.addEventListener('click', async () => {
                const clearedPath = selectedJsonPath;
                clearJson();
                try {
                    window.localStorage.removeItem(LAST_JSON_KEY);
                }
                catch ( /* Project profile remains the source of truth. */_a) { /* Project profile remains the source of truth. */ }
                setStatus('正在清除当前 JSON...', 'info');
                try {
                    const result = await REQ('clear-current-json-path', clearedPath);
                    if (selectedJsonPath)
                        return;
                    const cleared = !!(result && result.data && result.data.cleared);
                    setStatus(cleared ? '当前 JSON 已清除。' : '已保留刚收到的新推送。', cleared ? 'info' : 'ok');
                }
                catch (error) {
                    if (!selectedJsonPath)
                        setStatus(`JSON 清除失败：${error && error.message || error}`, 'error');
                }
            });
        if ($.reloadPreviewBtn)
            $.reloadPreviewBtn.addEventListener('click', () => {
                if (selectedJsonPath)
                    void loadJson(selectedJsonPath);
            });
        if ($.zoomOutBtn)
            $.zoomOutBtn.addEventListener('click', () => zoomAt(zoom / 1.2));
        if ($.zoomInBtn)
            $.zoomInBtn.addEventListener('click', () => zoomAt(zoom * 1.2));
        if ($.actualSizeBtn)
            $.actualSizeBtn.addEventListener('click', showActualSize);
        if ($.fitPreviewBtn)
            $.fitPreviewBtn.addEventListener('click', fitPreview);
        if ($.previewViewport) {
            $.previewViewport.addEventListener('wheel', (event) => {
                if (!lastPreview)
                    return;
                event.preventDefault();
                zoomAt(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY);
            }, { passive: false });
            $.previewViewport.addEventListener('mousedown', (event) => {
                if (!lastPreview)
                    return;
                if (event.button === 1) {
                    event.preventDefault();
                    pointerMode = 'pan';
                    pointerStartClient = { x: event.clientX, y: event.clientY };
                    pointerStartPan = { x: panX, y: panY };
                    if ($.previewViewport)
                        $.previewViewport.dataset.panning = 'true';
                    return;
                }
                if (event.button !== 0)
                    return;
                const point = canvasPointFromMouse(event);
                if (!point)
                    return;
                pointerMode = 'select';
                pointerStartCanvas = point;
                selectionRect = { x: point.x, y: point.y, width: 0, height: 0 };
                selectionHits = [];
                suppressPreviewClick = false;
                renderOverlay();
            });
            $.previewViewport.addEventListener('mousemove', (event) => {
                if (pointerMode === 'pan' && pointerStartClient && pointerStartPan) {
                    panX = pointerStartPan.x + event.clientX - pointerStartClient.x;
                    panY = pointerStartPan.y + event.clientY - pointerStartClient.y;
                    applyPreviewTransform();
                    return;
                }
                if (pointerMode !== 'select' || !pointerStartCanvas)
                    return;
                const point = canvasPointFromMouse(event);
                if (!point)
                    return;
                selectionRect = rectFromPoints(pointerStartCanvas, point);
                if (selectionRect.width > 3 / zoom || selectionRect.height > 3 / zoom)
                    suppressPreviewClick = true;
                renderOverlay();
            });
            const finishPointer = (event) => {
                if (pointerMode === 'pan') {
                    pointerMode = 'none';
                    pointerStartClient = null;
                    pointerStartPan = null;
                    if ($.previewViewport)
                        delete $.previewViewport.dataset.panning;
                    return;
                }
                if (pointerMode !== 'select' || !pointerStartCanvas)
                    return;
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
            $.previewViewport.addEventListener('click', (event) => {
                if (suppressPreviewClick) {
                    suppressPreviewClick = false;
                    return;
                }
                const point = canvasPointFromMouse(event);
                if (point)
                    selectAtPoint(point);
            });
        }
        if ($.selectionHits)
            $.selectionHits.addEventListener('click', (event) => {
                const target = event.target;
                const button = target.closest('[data-hit-index]');
                if (!button)
                    return;
                const hit = selectionHits[Number(button.dataset.hitIndex)];
                if (!hit)
                    return;
                highlightedRects = [hit];
                const identity = identityFromHit(hit);
                selectedComponentIdentity = identity.componentKey ? identity : null;
                renderOverlay();
                renderSelection();
                renderMappings();
                focusHighlightedRects([hit]);
            });
        if ($.componentList)
            $.componentList.addEventListener('click', (event) => {
                const target = event.target;
                const unassignButton = target.closest('[data-action="unassign-slot"]');
                if (unassignButton) {
                    const slot = renderedBindingSlots[Number(unassignButton.dataset.bindingIndex)];
                    if (slot)
                        void unassignComponent(slot.component.componentKey, slot.variantFilter);
                    event.stopPropagation();
                    return;
                }
                if (target.closest('ui-asset')) {
                    event.stopPropagation();
                    return;
                }
                const card = target.closest('[data-component-index]');
                const index = Number(card && card.dataset.componentIndex);
                const component = renderedComponents[index];
                if (!component)
                    return;
                event.stopPropagation();
                selectComponent(component);
            });
        if ($.componentList)
            $.componentList.addEventListener('change', (event) => {
                const target = event.target;
                const field = target.closest('ui-asset[data-binding-index]');
                if (!field || field.disabled)
                    return;
                const slot = renderedBindingSlots[Number(field.dataset.bindingIndex)];
                if (!slot)
                    return;
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
        if ($.mappingList)
            $.mappingList.addEventListener('click', (event) => {
                const target = event.target;
                const button = target.closest('[data-entry-index]');
                if (!button)
                    return;
                const entry = mappingEntries()[Number(button.dataset.entryIndex)];
                if (entry)
                    void unassignComponent(String(entry.componentKey || ''), String(entry.variantFilter || ''));
            });
        if ($.componentSearch)
            $.componentSearch.addEventListener('input', renderMappings);
        if ($.includeNested)
            $.includeNested.addEventListener('change', renderMappings);
        if ($.hideMapped)
            $.hideMapped.addEventListener('change', renderMappings);
        if ($.mappingRefreshBtn)
            $.mappingRefreshBtn.addEventListener('click', async () => {
                if (!selectedJsonPath) {
                    setStatus('请先选择当前 Figma JSON。', 'warn');
                    return;
                }
                const revision = loadRevision;
                $.mappingRefreshBtn.disabled = true;
                clearMappingSurface('正在重新扫描当前 JSON 的组件...', '正在刷新组件与映射...');
                setStatus('正在重新扫描当前 JSON...', 'info');
                try {
                    const scanned = await REQ('scan-component-identities-from-json', selectedJsonPath);
                    if (revision !== loadRevision)
                        return;
                    if (!scanned || scanned.success === false) {
                        clearMappingSurface('组件扫描失败，未使用旧候选', '组件扫描失败');
                        setStatus(`组件扫描失败：${scanned && scanned.error || '未知错误'}`, 'error');
                        return;
                    }
                    const mappingsLoaded = await loadMappings(revision);
                    if (revision !== loadRevision || !mappingsLoaded)
                        return;
                    setStatus('组件候选与映射已刷新。', 'ok');
                }
                catch (error) {
                    if (revision !== loadRevision)
                        return;
                    clearMappingSurface('组件刷新异常，未使用旧候选', '组件刷新失败');
                    setStatus(`组件刷新异常：${error && error.message || error}`, 'error');
                }
                finally {
                    if (revision === loadRevision)
                        $.mappingRefreshBtn.disabled = false;
                }
            });
        if ($.importBtn)
            $.importBtn.addEventListener('click', async () => {
                if (!selectedJsonPath)
                    return;
                $.importBtn.disabled = true;
                setStatus('正在完整导入到当前场景...', 'info');
                try {
                    const result = await REQ('import-from-json', selectedJsonPath);
                    if (!result || result.success === false) {
                        setStatus(`导入失败：${result && result.error || '未知错误'}`, 'error');
                        return;
                    }
                    const data = result.data || {};
                    await loadMappings();
                    setStatus(`完整导入完成：${data.rootName || data.rootUuid || (0, path_1.basename)(selectedJsonPath)}`, 'ok');
                }
                catch (error) {
                    setStatus(`导入异常：${error && error.message || error}`, 'error');
                }
                finally {
                    $.importBtn.disabled = !selectedJsonPath || !lastPreview;
                }
            });
        if ($.replacePanelBtn)
            $.replacePanelBtn.addEventListener('click', async () => {
                try {
                    await REQ('open-replace-panel-beta', { jsonPath: selectedJsonPath });
                    setStatus('高级局部替换已打开，并继承当前 JSON。', 'ok');
                }
                catch (error) {
                    setStatus(`高级局部替换打开失败：${error && error.message || error}`, 'error');
                }
            });
        const refreshPushState = async () => {
            try {
                const result = await REQ('get-push-server-status');
                const running = !!(result && result.data && result.data.running);
                if ($.pushState) {
                    $.pushState.textContent = running ? '运行中' : '已停止';
                    $.pushState.dataset.tone = running ? 'ok' : 'off';
                    if ($.pushState.parentElement)
                        $.pushState.parentElement.dataset.tone = running ? 'ok' : 'off';
                }
                if ($.pushStartBtn)
                    $.pushStartBtn.disabled = running;
                if ($.pushStopBtn)
                    $.pushStopBtn.disabled = !running;
            }
            catch (_a) {
                if ($.pushState)
                    $.pushState.textContent = '状态不可用';
            }
        };
        const renderDirs = () => {
            if (!$.dirList)
                return;
            $.dirList.innerHTML = dirs.length === 0
                ? '<div class="empty">默认扫描 db://assets</div>'
                : dirs.map((dir, index) => `<div class="dir-row"><span class="dir-url" title="${escapeHtml(dir)}">${escapeHtml(dir)}</span>` +
                    `<button class="dir-remove" type="button" data-index="${index}">删除</button></div>`).join('');
            $.dirList.querySelectorAll('.dir-remove').forEach((button) => {
                button.addEventListener('click', async () => {
                    const index = Number(button.dataset.index);
                    if (index < 0 || index >= dirs.length)
                        return;
                    dirs.splice(index, 1);
                    const result = await REQ('set-common-resource-dirs', dirs);
                    if (result && result.data && Array.isArray(result.data.dirs))
                        dirs = result.data.dirs;
                    renderDirs();
                });
            });
        };
        const loadDirs = async () => {
            try {
                const result = await REQ('get-common-resource-dirs');
                dirs = result && result.data && Array.isArray(result.data.dirs) ? result.data.dirs : [];
                renderDirs();
            }
            catch (error) {
                setStatus(`资源目录读取失败：${error && error.message || error}`, 'error');
            }
        };
        if ($.pushStartBtn)
            $.pushStartBtn.addEventListener('click', async () => {
                setStatus('启动推送服务...', 'info');
                const result = await REQ('start-push-server');
                await refreshPushState();
                setStatus(result && result.success === false ? `启动失败：${result.error || '未知错误'}` : '推送服务已启动。', result && result.success === false ? 'error' : 'ok');
            });
        if ($.pushStopBtn)
            $.pushStopBtn.addEventListener('click', async () => {
                setStatus('停止推送服务...', 'info');
                const result = await REQ('stop-push-server');
                await refreshPushState();
                setStatus(result && result.success === false ? `停止失败：${result.error || '未知错误'}` : '推送服务已停止。', result && result.success === false ? 'error' : 'ok');
            });
        if ($.addBtn)
            $.addBtn.addEventListener('click', async () => {
                const result = await REQ('add-common-resource-dir');
                if (!result || result.success === false) {
                    setStatus(result && result.canceled ? '已取消。' : `添加失败：${result && result.error || '未知错误'}`, result && result.canceled ? 'info' : 'error');
                    return;
                }
                dirs = result.data && Array.isArray(result.data.dirs) ? result.data.dirs : dirs;
                renderDirs();
                setStatus(`已添加：${result.data && result.data.added || ''}`, 'ok');
            });
        if ($.resetBtn)
            $.resetBtn.addEventListener('click', async () => {
                dirs = ['db://assets'];
                await REQ('set-common-resource-dirs', dirs);
                renderDirs();
                setStatus('资源目录已恢复为 db://assets。', 'ok');
            });
        const bindSimpleAction = (button, message, busyText, args = () => []) => {
            if (!button)
                return;
            button.addEventListener('click', async () => {
                setStatus(busyText, 'info');
                try {
                    const result = await REQ(message, ...args());
                    setStatus(result && result.success === false ? `失败：${result.error || '未知错误'}` : '完成。', result && result.success === false ? 'error' : 'ok');
                }
                catch (error) {
                    setStatus(`异常：${error && error.message || error}`, 'error');
                }
            });
        };
        bindSimpleAction($.genStyleBtn, 'generate-text-styles-from-json-beta', '生成 TextStyles 中...', () => selectedJsonPath ? [selectedJsonPath] : []);
        bindSimpleAction($.exportBtn, 'export-tree-to-json-file', '导出 Cocos JSON 中...');
        bindSimpleAction($.pushFigmaBtn, 'push-tree-to-figma', '推送到 Figma 队列中...');
        clearJson();
        void readRememberedJsonPath().then((rememberedPath) => {
            if (disposed)
                return;
            if (rememberedPath && !selectedJsonPath && !previewLoading)
                void loadJson(rememberedPath, true);
        });
        void loadDirs();
        void refreshPushState();
    },
    update(options) {
        if (updateSettingsWorkbench)
            void updateSettingsWorkbench(options);
    },
    close() {
        if (disposeMappingResize)
            disposeMappingResize();
        if (clearWorkbenchPreview)
            clearWorkbenchPreview();
        clearWorkbenchPreview = null;
        refreshSettingsWorkspacePath = null;
        updateSettingsWorkbench = null;
    },
});
function groupComponentIdentities(components) {
    const groups = new Map();
    for (const component of components) {
        const componentKey = String(component && component.componentKey || '').trim();
        if (!componentKey)
            continue;
        let group = groups.get(componentKey);
        if (!group) {
            group = {
                componentKey,
                componentName: String(component.componentName || ''),
                identities: [],
                isNested: component.isNested === true,
            };
            groups.set(componentKey, group);
        }
        else {
            if (group.isNested && component.isNested !== true && component.componentName) {
                group.componentName = component.componentName;
            }
            else if (!group.componentName && component.componentName) {
                group.componentName = component.componentName;
            }
            group.isNested = group.isNested && component.isNested === true;
        }
        const existingIndex = group.identities.findIndex((item) => item.variantFilter === component.variantFilter);
        if (existingIndex < 0)
            group.identities.push(component);
        else if (group.identities[existingIndex].isNested === true && component.isNested !== true) {
            group.identities[existingIndex] = component;
        }
    }
    return Array.from(groups.values())
        .map((group) => (Object.assign(Object.assign({}, group), { identities: group.identities.slice().sort((left, right) => left.variantFilter.localeCompare(right.variantFilter)) })))
        .sort((left, right) => left.componentName.localeCompare(right.componentName) || left.componentKey.localeCompare(right.componentKey));
}
function identityFromHit(hit) {
    return {
        componentKey: String(hit && hit.componentKey || ''),
        componentName: String(hit && (hit.componentName || hit.name) || ''),
        variantFilter: String(hit && hit.variantFilter || ''),
        componentProperties: hit && hit.componentProperties || {},
    };
}
function sameComponent(left, right) {
    return String(left && left.componentKey || '') === String(right && right.componentKey || '') &&
        String(left && left.variantFilter || '') === String(right && right.variantFilter || '');
}
function variantLabel(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '默认（兜底）';
    return raw.split(',').map((part) => {
        const separator = part.indexOf('=');
        if (separator <= 0)
            return part.trim();
        return `${part.slice(0, separator).trim()}：${part.slice(separator + 1).trim()}`;
    }).join(' · ');
}
function rectHtml(rect, className, title) {
    return `<div class="${className}" title="${escapeHtml(title)}" style="left:${rect.x}px;top:${rect.y}px;width:${Math.max(0, rect.width)}px;height:${Math.max(0, rect.height)}px"></div>`;
}
function rectFromPoints(start, end) {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}
function rectArea(rect) {
    return Math.max(0, Number(rect.width) || 0) * Math.max(0, Number(rect.height) || 0);
}
function pointInRect(point, rect) {
    return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
}
function intersectionArea(left, right) {
    const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
    const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
    return width * height;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function getDroppedFilePath(file) {
    const legacyPath = String(file.path || '').trim();
    if (legacyPath)
        return legacyPath;
    try {
        const electron = require('electron');
        if (electron && electron.webUtils && typeof electron.webUtils.getPathForFile === 'function') {
            return String(electron.webUtils.getPathForFile(file) || '').trim();
        }
    }
    catch ( /* Older Electron does not expose webUtils. */_a) { /* Older Electron does not expose webUtils. */ }
    return '';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zb3VyY2UvcGFuZWxzL3NldHRpbmdzL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsMkJBQWtDO0FBQ2xDLCtCQUFzQztBQUN0QyxxRUFBMkY7QUE0RzNGLFNBQVMsWUFBWSxDQUFDLEdBQVE7SUFDMUIsT0FBTyxHQUFzQixDQUFDO0FBQ2xDLENBQUM7QUFFRCxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQWUsRUFBRSxHQUFHLElBQVcsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7QUFDNUcsTUFBTSxhQUFhLEdBQUcsd0NBQXdDLENBQUM7QUFDL0QsTUFBTSxpQkFBaUIsR0FBRyx1Q0FBdUMsQ0FBQztBQUNsRSxNQUFNLHFCQUFxQixHQUFHLEdBQUcsQ0FBQztBQUNsQyxNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQztBQUM5QixNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQztBQUM5QixNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQztBQUM5QixNQUFNLHNCQUFzQixHQUFHLENBQUMsQ0FBQztBQUNqQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUM7QUFDdEIsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBRW5CLElBQUksNEJBQTRCLEdBQXdCLElBQUksQ0FBQztBQUM3RCxJQUFJLHVCQUF1QixHQUFrRSxJQUFJLENBQUM7QUFDbEcsSUFBSSxxQkFBcUIsR0FBd0IsSUFBSSxDQUFDO0FBQ3RELElBQUksb0JBQW9CLEdBQXdCLElBQUksQ0FBQztBQUVyRCxNQUFNLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO0lBQ2pDLFFBQVEsRUFBRSxJQUFBLGlCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFF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QUFFLENBQUM7UUFDdkUsQ0FBQztJQUNMLENBQUM7SUFBQyxRQUFRLDhDQUE4QyxJQUFoRCxDQUFDLENBQUMsOENBQThDLENBQUMsQ0FBQztJQUMxRCxPQUFPLEVBQUUsQ0FBQztBQUNkLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgam9pbiB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgbm9ybWFsaXplQ3VycmVudEpzb25QYXRoLCByZWFkQ3VycmVudEpzb25QYXRoIH0gZnJvbSAnLi4vLi4vanNvbi13b3Jrc3BhY2Utc3RhdGUnO1xuXG50eXBlIFBhbmVsRWxlbWVudE1hcCA9IHtcbiAgICBhcHA/OiBIVE1MRWxlbWVudDtcbiAgICBzdGF0dXM/OiBIVE1MRWxlbWVudDtcbiAgICB2ZXJzaW9uPzogSFRNTEVsZW1lbnQ7XG4gICAganNvblBhdGg/OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGJyb3dzZUJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIGNsZWFyQnRuPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgZHJvcFpvbmU/OiBIVE1MRWxlbWVudDtcbiAgICBmaWxlUHJldmlldz86IEhUTUxFbGVtZW50O1xuICAgIHByZXZpZXdGaWxlPzogSFRNTEVsZW1lbnQ7XG4gICAgcHJldmlld05hbWU/OiBIVE1MRWxlbWVudDtcbiAgICBwcmV2aWV3Q2FudmFzPzogSFRNTEVsZW1lbnQ7XG4gICAgcHJldmlld1N0YXRzPzogSFRNTEVsZW1lbnQ7XG4gICAgcHJldmlld1NlY3Rpb24/OiBIVE1MRWxlbWVudDtcbiAgICBwcmV2aWV3TWV0YT86IEhUTUxFbGVtZW50O1xuICAgIHByZXZpZXdWaWV3cG9ydD86IEhUTUxFbGVtZW50O1xuICAgIHByZXZpZXdTdGFnZT86IEhUTUxFbGVtZW50O1xuICAgIHByZXZpZXdQbGFjZWhvbGRlcj86IEhUTUxFbGVtZW50O1xuICAgIHByZXZpZXdJbWFnZT86IEhUTUxJbWFnZUVsZW1lbnQ7XG4gICAgcHJldmlld092ZXJsYXk/OiBIVE1MRWxlbWVudDtcbiAgICBzZWxlY3Rpb25TdW1tYXJ5PzogSFRNTEVsZW1lbnQ7XG4gICAgc2VsZWN0aW9uSGl0cz86IEhUTUxFbGVtZW50O1xuICAgIHpvb21PdXRCdG4/OiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICB6b29tSW5CdG4/OiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICB6b29tTGFiZWw/OiBIVE1MRWxlbWVudDtcbiAgICBhY3R1YWxTaXplQnRuPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgZml0UHJldmlld0J0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHJlbG9hZFByZXZpZXdCdG4/OiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBpbXBvcnRCdG4/OiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICByZXBsYWNlUGFuZWxCdG4/OiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICB3b3Jrc3BhY2VTcGxpdD86IEhUTUxFbGVtZW50O1xuICAgIG1hcHBpbmdTZWN0aW9uPzogSFRNTEVsZW1lbnQ7XG4gICAgbWFwcGluZ1NwbGl0dGVyPzogSFRNTEVsZW1lbnQ7XG4gICAgbWFwcGluZ1N1bW1hcnk/OiBIVE1MRWxlbWVudDtcbiAgICBtYXBwaW5nUmVmcmVzaEJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIGNvbXBvbmVudFNlYXJjaD86IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgaW5jbHVkZU5lc3RlZD86IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgaGlkZU1hcHBlZD86IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgY29tcG9uZW50TGlzdD86IEhUTUxFbGVtZW50O1xuICAgIG1hcHBpbmdMaXN0PzogSFRNTEVsZW1lbnQ7XG4gICAgZGlyTGlzdD86IEhUTUxFbGVtZW50O1xuICAgIGFkZEJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHJlc2V0QnRuPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHVzaFN0YXRlPzogSFRNTEVsZW1lbnQ7XG4gICAgcHVzaFN0YXJ0QnRuPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgcHVzaFN0b3BCdG4/OiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBnZW5TdHlsZUJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIGV4cG9ydEJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHB1c2hGaWdtYUJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xufTtcblxudHlwZSBQcmV2aWV3SGl0ID0ge1xuICAgIHBhdGg6IHN0cmluZztcbiAgICBuYW1lPzogc3RyaW5nO1xuICAgIGtpbmQ/OiBzdHJpbmc7XG4gICAgdHlwZT86IHN0cmluZztcbiAgICB4OiBudW1iZXI7XG4gICAgeTogbnVtYmVyO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgaW1hZ2VSZWY/OiBzdHJpbmc7XG4gICAgdGV4dD86IHN0cmluZztcbiAgICBjb21wb25lbnRLZXk/OiBzdHJpbmc7XG4gICAgY29tcG9uZW50TmFtZT86IHN0cmluZztcbiAgICB2YXJpYW50RmlsdGVyPzogc3RyaW5nO1xuICAgIGNvbXBvbmVudFByb3BlcnRpZXM/OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xufTtcblxudHlwZSBKc29uUHJldmlldyA9IHtcbiAgICBmaWxlUGF0aDogc3RyaW5nO1xuICAgIG5hbWU/OiBzdHJpbmc7XG4gICAgY2FudmFzPzogeyB3aWR0aD86IG51bWJlcjsgaGVpZ2h0PzogbnVtYmVyIH07XG4gICAgcHJldmlld0ltYWdlRGF0YVVybD86IHN0cmluZztcbiAgICBzdGF0cz86IHtcbiAgICAgICAgaGl0cz86IG51bWJlcjtcbiAgICAgICAgdGV4dHM/OiBudW1iZXI7XG4gICAgICAgIGltYWdlcz86IG51bWJlcjtcbiAgICAgICAgaW50ZXJmYWNlQ291bnQ/OiBudW1iZXI7XG4gICAgICAgIGhhc1ByZXZpZXdJbWFnZT86IGJvb2xlYW47XG4gICAgfTtcbiAgICBoaXRzPzogUHJldmlld0hpdFtdO1xufTtcblxudHlwZSBDb21wb25lbnRJZGVudGl0eSA9IHtcbiAgICBjb21wb25lbnRLZXk6IHN0cmluZztcbiAgICBjb21wb25lbnROYW1lOiBzdHJpbmc7XG4gICAgdmFyaWFudEZpbHRlcjogc3RyaW5nO1xuICAgIGNvbXBvbmVudFByb3BlcnRpZXM/OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xuICAgIGlzTmVzdGVkPzogYm9vbGVhbjtcbn07XG5cbnR5cGUgQ29tcG9uZW50R3JvdXAgPSB7XG4gICAgY29tcG9uZW50S2V5OiBzdHJpbmc7XG4gICAgY29tcG9uZW50TmFtZTogc3RyaW5nO1xuICAgIGlkZW50aXRpZXM6IENvbXBvbmVudElkZW50aXR5W107XG4gICAgaXNOZXN0ZWQ6IGJvb2xlYW47XG59O1xuXG50eXBlIFByZWZhYkJpbmRpbmdTbG90ID0ge1xuICAgIGNvbXBvbmVudDogQ29tcG9uZW50SWRlbnRpdHk7XG4gICAgdmFyaWFudEZpbHRlcjogc3RyaW5nO1xufTtcblxudHlwZSBQcmV2aWV3UmVjdCA9IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH07XG50eXBlIFdvcmtiZW5jaE9wZW5PcHRpb25zID0geyBqc29uUGF0aD86IHN0cmluZzsgc2VjdGlvbj86IHN0cmluZzsgc291cmNlPzogc3RyaW5nIH07XG5cbmZ1bmN0aW9uIGFzRWxlbWVudE1hcChyYXc6IGFueSk6IFBhbmVsRWxlbWVudE1hcCB7XG4gICAgcmV0dXJuIHJhdyBhcyBQYW5lbEVsZW1lbnRNYXA7XG59XG5cbmNvbnN0IFJFUSA9IChtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IGFueVtdKSA9PiBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdmaWdtYS1pbXBvcnRlcicsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuY29uc3QgTEFTVF9KU09OX0tFWSA9ICdmaWdtYS1pbXBvcnRlci5zZXR0aW5ncy5sYXN0LWpzb24tcGF0aCc7XG5jb25zdCBNQVBQSU5HX1dJRFRIX0tFWSA9ICdmaWdtYS1pbXBvcnRlci5zZXR0aW5ncy5tYXBwaW5nLXdpZHRoJztcbmNvbnN0IERFRkFVTFRfTUFQUElOR19XSURUSCA9IDM4MDtcbmNvbnN0IE1JTl9NQVBQSU5HX1dJRFRIID0gMzIwO1xuY29uc3QgTUFYX01BUFBJTkdfV0lEVEggPSA1NjA7XG5jb25zdCBNSU5fUFJFVklFV19XSURUSCA9IDQyMDtcbmNvbnN0IE1BUFBJTkdfU1BMSVRURVJfV0lEVEggPSA2O1xuY29uc3QgTUlOX1pPT00gPSAwLjA1O1xuY29uc3QgTUFYX1pPT00gPSA4O1xuXG5sZXQgcmVmcmVzaFNldHRpbmdzV29ya3NwYWNlUGF0aDogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5sZXQgdXBkYXRlU2V0dGluZ3NXb3JrYmVuY2g6ICgob3B0aW9ucz86IFdvcmtiZW5jaE9wZW5PcHRpb25zKSA9PiBQcm9taXNlPGJvb2xlYW4+KSB8IG51bGwgPSBudWxsO1xubGV0IGNsZWFyV29ya2JlbmNoUHJldmlldzogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5sZXQgZGlzcG9zZU1hcHBpbmdSZXNpemU6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVkaXRvci5QYW5lbC5kZWZpbmUoe1xuICAgIHRlbXBsYXRlOiByZWFkRmlsZVN5bmMoam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9zdGF0aWMvdGVtcGxhdGUvc2V0dGluZ3MvaW5kZXguaHRtbCcpLCAndXRmLTgnKSxcbiAgICBzdHlsZTogcmVhZEZpbGVTeW5jKGpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vc3RhdGljL3N0eWxlL3NldHRpbmdzL2luZGV4LmNzcycpLCAndXRmLTgnKSxcbiAgICBsaXN0ZW5lcnM6IHtcbiAgICAgICAgc2hvdygpIHtcbiAgICAgICAgICAgIGlmIChyZWZyZXNoU2V0dGluZ3NXb3Jrc3BhY2VQYXRoKSByZWZyZXNoU2V0dGluZ3NXb3Jrc3BhY2VQYXRoKCk7XG4gICAgICAgIH0sXG4gICAgfSxcbiAgICAkOiB7XG4gICAgICAgIGFwcDogJyNhcHAnLFxuICAgICAgICBzdGF0dXM6ICcjc3RhdHVzJyxcbiAgICAgICAgdmVyc2lvbjogJyN2ZXJzaW9uJyxcbiAgICAgICAganNvblBhdGg6ICcjanNvblBhdGgnLFxuICAgICAgICBicm93c2VCdG46ICcjYnJvd3NlQnRuJyxcbiAgICAgICAgY2xlYXJCdG46ICcjY2xlYXJCdG4nLFxuICAgICAgICBkcm9wWm9uZTogJyNkcm9wWm9uZScsXG4gICAgICAgIGZpbGVQcmV2aWV3OiAnI2ZpbGVQcmV2aWV3JyxcbiAgICAgICAgcHJldmlld0ZpbGU6ICcjcHJldmlld0ZpbGUnLFxuICAgICAgICBwcmV2aWV3TmFtZTogJyNwcmV2aWV3TmFtZScsXG4gICAgICAgIHByZXZpZXdDYW52YXM6ICcjcHJldmlld0NhbnZhcycsXG4gICAgICAgIHByZXZpZXdTdGF0czogJyNwcmV2aWV3U3RhdHMnLFxuICAgICAgICBwcmV2aWV3U2VjdGlvbjogJyNwcmV2aWV3U2VjdGlvbicsXG4gICAgICAgIHByZXZpZXdNZXRhOiAnI3ByZXZpZXdNZXRhJyxcbiAgICAgICAgcHJldmlld1ZpZXdwb3J0OiAnI3ByZXZpZXdWaWV3cG9ydCcsXG4gICAgICAgIHByZXZpZXdTdGFnZTogJyNwcmV2aWV3U3RhZ2UnLFxuICAgICAgICBwcmV2aWV3UGxhY2Vob2xkZXI6ICcjcHJldmlld1BsYWNlaG9sZGVyJyxcbiAgICAgICAgcHJldmlld0ltYWdlOiAnI3ByZXZpZXdJbWFnZScsXG4gICAgICAgIHByZXZpZXdPdmVybGF5OiAnI3ByZXZpZXdPdmVybGF5JyxcbiAgICAgICAgc2VsZWN0aW9uU3VtbWFyeTogJyNzZWxlY3Rpb25TdW1tYXJ5JyxcbiAgICAgICAgc2VsZWN0aW9uSGl0czogJyNzZWxlY3Rpb25IaXRzJyxcbiAgICAgICAgem9vbU91dEJ0bjogJyN6b29tT3V0QnRuJyxcbiAgICAgICAgem9vbUluQnRuOiAnI3pvb21JbkJ0bicsXG4gICAgICAgIHpvb21MYWJlbDogJyN6b29tTGFiZWwnLFxuICAgICAgICBhY3R1YWxTaXplQnRuOiAnI2FjdHVhbFNpemVCdG4nLFxuICAgICAgICBmaXRQcmV2aWV3QnRuOiAnI2ZpdFByZXZpZXdCdG4nLFxuICAgICAgICByZWxvYWRQcmV2aWV3QnRuOiAnI3JlbG9hZFByZXZpZXdCdG4nLFxuICAgICAgICBpbXBvcnRCdG46ICcjaW1wb3J0QnRuJyxcbiAgICAgICAgcmVwbGFjZVBhbmVsQnRuOiAnI3JlcGxhY2VQYW5lbEJ0bicsXG4gICAgICAgIHdvcmtzcGFjZVNwbGl0OiAnI3dvcmtzcGFjZVNwbGl0JyxcbiAgICAgICAgbWFwcGluZ1NlY3Rpb246ICcjbWFwcGluZ1NlY3Rpb24nLFxuICAgICAgICBtYXBwaW5nU3BsaXR0ZXI6ICcjbWFwcGluZ1NwbGl0dGVyJyxcbiAgICAgICAgbWFwcGluZ1N1bW1hcnk6ICcjbWFwcGluZ1N1bW1hcnknLFxuICAgICAgICBtYXBwaW5nUmVmcmVzaEJ0bjogJyNtYXBwaW5nUmVmcmVzaEJ0bicsXG4gICAgICAgIGNvbXBvbmVudFNlYXJjaDogJyNjb21wb25lbnRTZWFyY2gnLFxuICAgICAgICBpbmNsdWRlTmVzdGVkOiAnI2luY2x1ZGVOZXN0ZWQnLFxuICAgICAgICBoaWRlTWFwcGVkOiAnI2hpZGVNYXBwZWQnLFxuICAgICAgICBjb21wb25lbnRMaXN0OiAnI2NvbXBvbmVudExpc3QnLFxuICAgICAgICBtYXBwaW5nTGlzdDogJyNtYXBwaW5nTGlzdCcsXG4gICAgICAgIGRpckxpc3Q6ICcjZGlyTGlzdCcsXG4gICAgICAgIGFkZEJ0bjogJyNhZGRCdG4nLFxuICAgICAgICByZXNldEJ0bjogJyNyZXNldEJ0bicsXG4gICAgICAgIHB1c2hTdGF0ZTogJyNwdXNoU3RhdGUnLFxuICAgICAgICBwdXNoU3RhcnRCdG46ICcjcHVzaFN0YXJ0QnRuJyxcbiAgICAgICAgcHVzaFN0b3BCdG46ICcjcHVzaFN0b3BCdG4nLFxuICAgICAgICBnZW5TdHlsZUJ0bjogJyNnZW5TdHlsZUJ0bicsXG4gICAgICAgIGV4cG9ydEJ0bjogJyNleHBvcnRCdG4nLFxuICAgICAgICBwdXNoRmlnbWFCdG46ICcjcHVzaEZpZ21hQnRuJyxcbiAgICB9LFxuICAgIG1ldGhvZHM6IHtcbiAgICAgICAgYXN5bmMgYWNjZXB0UHVzaGVkSnNvbihvcHRpb25zPzogV29ya2JlbmNoT3Blbk9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmICghdXBkYXRlU2V0dGluZ3NXb3JrYmVuY2gpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdGdG9DIOWvvOWFpeW3peS9nOWPsOWwmuacquWwsee7qicgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGxvYWRlZCA9IGF3YWl0IHVwZGF0ZVNldHRpbmdzV29ya2JlbmNoKG9wdGlvbnMpO1xuICAgICAgICAgICAgcmV0dXJuIGxvYWRlZFxuICAgICAgICAgICAgICAgID8geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IGpzb25QYXRoOiBub3JtYWxpemVDdXJyZW50SnNvblBhdGgob3B0aW9ucyAmJiBvcHRpb25zLmpzb25QYXRoKSB9IH1cbiAgICAgICAgICAgICAgICA6IHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnRnRvQyDlr7zlhaXlt6XkvZzlj7DmnKrog73liqDovb3mjqjpgIEgSlNPTicgfTtcbiAgICAgICAgfSxcbiAgICB9LFxuICAgIHJlYWR5KCkge1xuICAgICAgICBjb25zdCAkID0gYXNFbGVtZW50TWFwKHRoaXMuJCk7XG4gICAgICAgIGxldCBkaXJzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBsZXQgc2VsZWN0ZWRKc29uUGF0aCA9ICcnO1xuICAgICAgICBsZXQgcHJldmlld0xvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgbGV0IGFjdGl2ZUxvYWRQYXRoID0gJyc7XG4gICAgICAgIGxldCBhY3RpdmVMb2FkUHJvbWlzZTogUHJvbWlzZTxib29sZWFuPiB8IG51bGwgPSBudWxsO1xuICAgICAgICBsZXQgZGlzcG9zZWQgPSBmYWxzZTtcbiAgICAgICAgbGV0IGxvYWRSZXZpc2lvbiA9IDA7XG4gICAgICAgIGxldCBsYXN0UHJldmlldzogSnNvblByZXZpZXcgfCBudWxsID0gbnVsbDtcbiAgICAgICAgbGV0IHByZXZpZXdJbWFnZVVybCA9ICcnO1xuICAgICAgICBsZXQgcHJldmlld0ltYWdlVXJsVG9rZW4gPSAwO1xuICAgICAgICBsZXQgbWFwcGluZ0RhdGE6IGFueSA9IG51bGw7XG4gICAgICAgIGxldCByZW5kZXJlZENvbXBvbmVudHM6IENvbXBvbmVudElkZW50aXR5W10gPSBbXTtcbiAgICAgICAgbGV0IHJlbmRlcmVkQmluZGluZ1Nsb3RzOiBQcmVmYWJCaW5kaW5nU2xvdFtdID0gW107XG4gICAgICAgIGxldCBzZWxlY3RlZENvbXBvbmVudElkZW50aXR5OiBDb21wb25lbnRJZGVudGl0eSB8IG51bGwgPSBudWxsO1xuICAgICAgICBsZXQgaGlnaGxpZ2h0ZWRSZWN0czogUHJldmlld0hpdFtdID0gW107XG4gICAgICAgIGxldCBzZWxlY3Rpb25SZWN0OiBQcmV2aWV3UmVjdCB8IG51bGwgPSBudWxsO1xuICAgICAgICBsZXQgc2VsZWN0aW9uSGl0czogUHJldmlld0hpdFtdID0gW107XG4gICAgICAgIGxldCB6b29tID0gMTtcbiAgICAgICAgbGV0IHBhblggPSAwO1xuICAgICAgICBsZXQgcGFuWSA9IDA7XG4gICAgICAgIGxldCBwb2ludGVyTW9kZTogJ25vbmUnIHwgJ3NlbGVjdCcgfCAncGFuJyA9ICdub25lJztcbiAgICAgICAgbGV0IHBvaW50ZXJTdGFydENhbnZhczogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGxldCBwb2ludGVyU3RhcnRDbGllbnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuICAgICAgICBsZXQgcG9pbnRlclN0YXJ0UGFuOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcbiAgICAgICAgbGV0IHN1cHByZXNzUHJldmlld0NsaWNrID0gZmFsc2U7XG5cbiAgICAgICAgY29uc3QgcmVsZWFzZVByZXZpZXdJbWFnZVVybCA9ICgpID0+IHtcbiAgICAgICAgICAgIHByZXZpZXdJbWFnZVVybFRva2VuKys7XG4gICAgICAgICAgICBpZiAocHJldmlld0ltYWdlVXJsICYmIHByZXZpZXdJbWFnZVVybC5zdGFydHNXaXRoKCdibG9iOicpICYmIHR5cGVvZiBVUkwgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBVUkwucmV2b2tlT2JqZWN0VVJMID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgVVJMLnJldm9rZU9iamVjdFVSTChwcmV2aWV3SW1hZ2VVcmwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcHJldmlld0ltYWdlVXJsID0gJyc7XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gS2VlcCB0aGUgbGFyZ2UgZnJhbWUgb3V0IG9mIENTUyBjdXN0b20gcHJvcGVydGllcy4gQ2hyb21pdW0gZHJvcHMgbXVsdGktbWVnYWJ5dGVcbiAgICAgICAgLy8gZGVjbGFyYXRpb25zOyBvbmUgYmxvYiBVUkwgaXMgc2hhcmVkIGJ5IGFsbCB0aHVtYm5haWwgPGltZz4gZWxlbWVudHMgaW5zdGVhZC5cbiAgICAgICAgLy8gSWYgYmxvYiBjcmVhdGlvbiBmYWlscywgY2FyZHMga2VlcCB0aGVpciBpbml0aWFscyBpbnN0ZWFkIG9mIGR1cGxpY2F0aW5nIHRoZSBkYXRhIFVSTC5cbiAgICAgICAgY29uc3QgZW5zdXJlUHJldmlld0ltYWdlVXJsID0gYXN5bmMgKGltYWdlRGF0YTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IFN0cmluZyhpbWFnZURhdGEgfHwgJycpO1xuICAgICAgICAgICAgaWYgKCFzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICByZWxlYXNlUHJldmlld0ltYWdlVXJsKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuICcnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVsZWFzZVByZXZpZXdJbWFnZVVybCgpO1xuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBwcmV2aWV3SW1hZ2VVcmxUb2tlbjtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBmZXRjaCA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgVVJMICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgVVJMLmNyZWF0ZU9iamVjdFVSTCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHNvdXJjZSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJsb2IgPSBhd2FpdCByZXNwb25zZS5ibG9iKCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9iamVjdFVybCA9IFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYik7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiAhPT0gcHJldmlld0ltYWdlVXJsVG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwob2JqZWN0VXJsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwcmV2aWV3SW1hZ2VVcmwgPSBvYmplY3RVcmw7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvYmplY3RVcmw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIG1haW4gcHJldmlldyBjYW4gc3RpbGwgdXNlIHRoZSBkYXRhIFVSTCBkaXJlY3RseS5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b2tlbiAhPT0gcHJldmlld0ltYWdlVXJsVG9rZW4pIHJldHVybiAnJztcbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoJC52ZXJzaW9uKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHBrZyA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKGpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vcGFja2FnZS5qc29uJyksICd1dGYtOCcpKTtcbiAgICAgICAgICAgICAgICAkLnZlcnNpb24udGV4dENvbnRlbnQgPSBgdiR7cGtnLnZlcnNpb24gfHwgJz8nfWA7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICAkLnZlcnNpb24udGV4dENvbnRlbnQgPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNldFN0YXR1cyA9ICh0ZXh0OiBzdHJpbmcsIHRvbmUgPSAnaW5mbycpID0+IHtcbiAgICAgICAgICAgIGlmICghJC5zdGF0dXMpIHJldHVybjtcbiAgICAgICAgICAgICQuc3RhdHVzLnRleHRDb250ZW50ID0gdGV4dDtcbiAgICAgICAgICAgICQuc3RhdHVzLnRpdGxlID0gdGV4dDtcbiAgICAgICAgICAgICQuc3RhdHVzLmRhdGFzZXQudG9uZSA9IHRvbmU7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcmVtZW1iZXJKc29uUGF0aCA9IGFzeW5jIChmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVDdXJyZW50SnNvblBhdGgoZmlsZVBhdGgpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBpZiAobm9ybWFsaXplZCkgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKExBU1RfSlNPTl9LRVksIG5vcm1hbGl6ZWQpO1xuICAgICAgICAgICAgICAgIGVsc2Ugd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKExBU1RfSlNPTl9LRVkpO1xuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIFByb2plY3QgcHJvZmlsZSByZW1haW5zIHRoZSBzb3VyY2Ugb2YgdHJ1dGguICovIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgUkVRKCdzZXQtY3VycmVudC1qc29uLXBhdGgnLCBub3JtYWxpemVkKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggeyAvKiBUaGUgYWN0aXZlIHBhbmVsIHN0aWxsIGtlZXBzIGl0cyBpbi1tZW1vcnkgcGF0aC4gKi8gfVxuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGl6ZWQ7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcmVhZFJlbWVtYmVyZWRKc29uUGF0aCA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNoYXJlZFBhdGggPSBhd2FpdCByZWFkQ3VycmVudEpzb25QYXRoKCk7XG4gICAgICAgICAgICBpZiAoc2hhcmVkUGF0aCkgcmV0dXJuIHNoYXJlZFBhdGg7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxlZ2FjeVBhdGggPSBTdHJpbmcod2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKExBU1RfSlNPTl9LRVkpIHx8ICcnKS50cmltKCk7XG4gICAgICAgICAgICAgICAgaWYgKGxlZ2FjeVBhdGgpIGF3YWl0IHJlbWVtYmVySnNvblBhdGgobGVnYWN5UGF0aCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxlZ2FjeVBhdGg7XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc2V0UHJldmlld1N0YXRlID0gKHN0YXRlOiAnZW1wdHknIHwgJ3JlYWR5JyB8ICdlcnJvcicsIG1lc3NhZ2UgPSAnJykgPT4ge1xuICAgICAgICAgICAgaWYgKCEkLmZpbGVQcmV2aWV3KSByZXR1cm47XG4gICAgICAgICAgICAkLmZpbGVQcmV2aWV3LmRhdGFzZXQuc3RhdGUgPSBzdGF0ZTtcbiAgICAgICAgICAgIGNvbnN0IGVtcHR5ID0gJC5maWxlUHJldmlldy5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnByZXZpZXctZW1wdHknKTtcbiAgICAgICAgICAgIGlmIChlbXB0eSAmJiBtZXNzYWdlKSBlbXB0eS50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc2V0UHJldmlld1Rvb2xzRW5hYmxlZCA9IChlbmFibGVkOiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGJ1dHRvbiBvZiBbJC56b29tT3V0QnRuLCAkLnpvb21JbkJ0biwgJC5hY3R1YWxTaXplQnRuLCAkLmZpdFByZXZpZXdCdG4sICQucmVsb2FkUHJldmlld0J0bl0pIHtcbiAgICAgICAgICAgICAgICBpZiAoYnV0dG9uKSBidXR0b24uZGlzYWJsZWQgPSAhZW5hYmxlZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBhcHBseVByZXZpZXdUcmFuc2Zvcm0gPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoJC5wcmV2aWV3U3RhZ2UpIHtcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdTdGFnZS5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlKCR7cGFuWH1weCwgJHtwYW5ZfXB4KSBzY2FsZSgke3pvb219KWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoJC56b29tTGFiZWwpICQuem9vbUxhYmVsLnRleHRDb250ZW50ID0gYCR7TWF0aC5yb3VuZCh6b29tICogMTAwKX0lYDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjbGVhclByZXZpZXdTdGF0ZSA9ICgpID0+IHtcbiAgICAgICAgICAgIHJlbGVhc2VQcmV2aWV3SW1hZ2VVcmwoKTtcbiAgICAgICAgICAgIGxhc3RQcmV2aWV3ID0gbnVsbDtcbiAgICAgICAgICAgIGhpZ2hsaWdodGVkUmVjdHMgPSBbXTtcbiAgICAgICAgICAgIHNlbGVjdGlvblJlY3QgPSBudWxsO1xuICAgICAgICAgICAgc2VsZWN0aW9uSGl0cyA9IFtdO1xuICAgICAgICAgICAgc2VsZWN0ZWRDb21wb25lbnRJZGVudGl0eSA9IG51bGw7XG4gICAgICAgICAgICB6b29tID0gMTtcbiAgICAgICAgICAgIHBhblggPSAwO1xuICAgICAgICAgICAgcGFuWSA9IDA7XG4gICAgICAgICAgICBwb2ludGVyTW9kZSA9ICdub25lJztcbiAgICAgICAgICAgIHBvaW50ZXJTdGFydENhbnZhcyA9IG51bGw7XG4gICAgICAgICAgICBwb2ludGVyU3RhcnRDbGllbnQgPSBudWxsO1xuICAgICAgICAgICAgcG9pbnRlclN0YXJ0UGFuID0gbnVsbDtcbiAgICAgICAgICAgIHN1cHByZXNzUHJldmlld0NsaWNrID0gZmFsc2U7XG4gICAgICAgICAgICBpZiAoJC5wcmV2aWV3SW1hZ2UpIHtcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdJbWFnZS5vbmxvYWQgPSBudWxsO1xuICAgICAgICAgICAgICAgICQucHJldmlld0ltYWdlLnNyYyA9ICcnO1xuICAgICAgICAgICAgICAgICQucHJldmlld0ltYWdlLmhpZGRlbiA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoJC5wcmV2aWV3T3ZlcmxheSkgJC5wcmV2aWV3T3ZlcmxheS5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdTdGFnZSkge1xuICAgICAgICAgICAgICAgICQucHJldmlld1N0YWdlLmhpZGRlbiA9IHRydWU7XG4gICAgICAgICAgICAgICAgJC5wcmV2aWV3U3RhZ2Uuc3R5bGUud2lkdGggPSAnJztcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdTdGFnZS5zdHlsZS5oZWlnaHQgPSAnJztcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdTdGFnZS5zdHlsZS50cmFuc2Zvcm0gPSAnJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgICAgICQucHJldmlld1BsYWNlaG9sZGVyLmhpZGRlbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICQucHJldmlld1BsYWNlaG9sZGVyLnRleHRDb250ZW50ID0gJ+etieW+hemAieaLqSBKU09OJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdNZXRhKSAkLnByZXZpZXdNZXRhLnRleHRDb250ZW50ID0gJ+WwmuacquWKoOi9vSc7XG4gICAgICAgICAgICBpZiAoJC5zZWxlY3Rpb25TdW1tYXJ5KSAkLnNlbGVjdGlvblN1bW1hcnkudGV4dENvbnRlbnQgPSAn5pyq6YCJ5oup55S75p2/6IqC54K5JztcbiAgICAgICAgICAgIGlmICgkLnNlbGVjdGlvbkhpdHMpICQuc2VsZWN0aW9uSGl0cy5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgICAgIHNldFByZXZpZXdUb29sc0VuYWJsZWQoZmFsc2UpO1xuICAgICAgICAgICAgYXBwbHlQcmV2aWV3VHJhbnNmb3JtKCk7XG4gICAgICAgIH07XG4gICAgICAgIGNsZWFyV29ya2JlbmNoUHJldmlldyA9ICgpID0+IHtcbiAgICAgICAgICAgIGRpc3Bvc2VkID0gdHJ1ZTtcbiAgICAgICAgICAgIGxvYWRSZXZpc2lvbisrO1xuICAgICAgICAgICAgcHJldmlld0xvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIGFjdGl2ZUxvYWRQYXRoID0gJyc7XG4gICAgICAgICAgICBhY3RpdmVMb2FkUHJvbWlzZSA9IG51bGw7XG4gICAgICAgICAgICBjbGVhclByZXZpZXdTdGF0ZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGNsZWFyTWFwcGluZ1N1cmZhY2UgPSAoY29tcG9uZW50TWVzc2FnZTogc3RyaW5nLCBzdW1tYXJ5ID0gJ+etieW+hee7hOS7tuaJq+aPjycpID0+IHtcbiAgICAgICAgICAgIG1hcHBpbmdEYXRhID0gbnVsbDtcbiAgICAgICAgICAgIHJlbmRlcmVkQ29tcG9uZW50cyA9IFtdO1xuICAgICAgICAgICAgcmVuZGVyZWRCaW5kaW5nU2xvdHMgPSBbXTtcbiAgICAgICAgICAgIGlmICgkLm1hcHBpbmdTdW1tYXJ5KSAkLm1hcHBpbmdTdW1tYXJ5LnRleHRDb250ZW50ID0gc3VtbWFyeTtcbiAgICAgICAgICAgIGlmICgkLmNvbXBvbmVudExpc3QpICQuY29tcG9uZW50TGlzdC5pbm5lckhUTUwgPSBgPGRpdiBjbGFzcz1cImVtcHR5XCI+JHtlc2NhcGVIdG1sKGNvbXBvbmVudE1lc3NhZ2UpfTwvZGl2PmA7XG4gICAgICAgICAgICBpZiAoJC5tYXBwaW5nTGlzdCkgJC5tYXBwaW5nTGlzdC5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjbGVhckpzb24gPSAoKSA9PiB7XG4gICAgICAgICAgICBsb2FkUmV2aXNpb24rKztcbiAgICAgICAgICAgIHNlbGVjdGVkSnNvblBhdGggPSAnJztcbiAgICAgICAgICAgIHByZXZpZXdMb2FkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICBhY3RpdmVMb2FkUGF0aCA9ICcnO1xuICAgICAgICAgICAgYWN0aXZlTG9hZFByb21pc2UgPSBudWxsO1xuICAgICAgICAgICAgY2xlYXJQcmV2aWV3U3RhdGUoKTtcbiAgICAgICAgICAgIGNsZWFyTWFwcGluZ1N1cmZhY2UoJ+mAieaLqSBKU09OIOWQjuaYvuekuue7hOS7ticsICcwIOadoeaYoOWwhCcpO1xuICAgICAgICAgICAgaWYgKCQuanNvblBhdGgpIHtcbiAgICAgICAgICAgICAgICAkLmpzb25QYXRoLnZhbHVlID0gJyc7XG4gICAgICAgICAgICAgICAgJC5qc29uUGF0aC50aXRsZSA9ICflvZPliY0gRmlnbWEgSlNPTiDmlofku7YnO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCQuY2xlYXJCdG4pICQuY2xlYXJCdG4uZGlzYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKCQuaW1wb3J0QnRuKSAkLmltcG9ydEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAoJC5wcmV2aWV3RmlsZSkgJC5wcmV2aWV3RmlsZS50ZXh0Q29udGVudCA9ICfigJQnO1xuICAgICAgICAgICAgaWYgKCQucHJldmlld05hbWUpICQucHJldmlld05hbWUudGV4dENvbnRlbnQgPSAn4oCUJztcbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdDYW52YXMpICQucHJldmlld0NhbnZhcy50ZXh0Q29udGVudCA9ICfigJQnO1xuICAgICAgICAgICAgaWYgKCQucHJldmlld1N0YXRzKSAkLnByZXZpZXdTdGF0cy50ZXh0Q29udGVudCA9ICfigJQnO1xuICAgICAgICAgICAgc2V0UHJldmlld1N0YXRlKCdlbXB0eScsICfpgInmi6kgSlNPTiDlkI7mmL7npLrnnJ/lrp7nlLvmnb8nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjYW52YXNTaXplID0gKCkgPT4gKHtcbiAgICAgICAgICAgIHdpZHRoOiBNYXRoLm1heCgxLCBOdW1iZXIobGFzdFByZXZpZXcgJiYgbGFzdFByZXZpZXcuY2FudmFzICYmIGxhc3RQcmV2aWV3LmNhbnZhcy53aWR0aCkgfHwgMSksXG4gICAgICAgICAgICBoZWlnaHQ6IE1hdGgubWF4KDEsIE51bWJlcihsYXN0UHJldmlldyAmJiBsYXN0UHJldmlldy5jYW52YXMgJiYgbGFzdFByZXZpZXcuY2FudmFzLmhlaWdodCkgfHwgMSksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGZpdFByZXZpZXcgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWxhc3RQcmV2aWV3IHx8ICEkLnByZXZpZXdWaWV3cG9ydCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3Qgdmlld3BvcnRXaWR0aCA9IE1hdGgubWF4KDEsICQucHJldmlld1ZpZXdwb3J0LmNsaWVudFdpZHRoKTtcbiAgICAgICAgICAgIGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gTWF0aC5tYXgoMSwgJC5wcmV2aWV3Vmlld3BvcnQuY2xpZW50SGVpZ2h0KTtcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhcyA9IGNhbnZhc1NpemUoKTtcbiAgICAgICAgICAgIHpvb20gPSBjbGFtcChNYXRoLm1pbigodmlld3BvcnRXaWR0aCAtIDMyKSAvIGNhbnZhcy53aWR0aCwgKHZpZXdwb3J0SGVpZ2h0IC0gMzIpIC8gY2FudmFzLmhlaWdodCksIE1JTl9aT09NLCBNQVhfWk9PTSk7XG4gICAgICAgICAgICBwYW5YID0gKHZpZXdwb3J0V2lkdGggLSBjYW52YXMud2lkdGggKiB6b29tKSAvIDI7XG4gICAgICAgICAgICBwYW5ZID0gKHZpZXdwb3J0SGVpZ2h0IC0gY2FudmFzLmhlaWdodCAqIHpvb20pIC8gMjtcbiAgICAgICAgICAgIGFwcGx5UHJldmlld1RyYW5zZm9ybSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHNob3dBY3R1YWxTaXplID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFsYXN0UHJldmlldyB8fCAhJC5wcmV2aWV3Vmlld3BvcnQpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhcyA9IGNhbnZhc1NpemUoKTtcbiAgICAgICAgICAgIHpvb20gPSAxO1xuICAgICAgICAgICAgcGFuWCA9ICgkLnByZXZpZXdWaWV3cG9ydC5jbGllbnRXaWR0aCAtIGNhbnZhcy53aWR0aCkgLyAyO1xuICAgICAgICAgICAgcGFuWSA9ICgkLnByZXZpZXdWaWV3cG9ydC5jbGllbnRIZWlnaHQgLSBjYW52YXMuaGVpZ2h0KSAvIDI7XG4gICAgICAgICAgICBhcHBseVByZXZpZXdUcmFuc2Zvcm0oKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB6b29tQXQgPSAobmV4dFpvb206IG51bWJlciwgY2xpZW50WD86IG51bWJlciwgY2xpZW50WT86IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgaWYgKCFsYXN0UHJldmlldyB8fCAhJC5wcmV2aWV3Vmlld3BvcnQpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IHZpZXdwb3J0UmVjdCA9ICQucHJldmlld1ZpZXdwb3J0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgY29uc3QgYW5jaG9yWCA9IGNsaWVudFggPT0gbnVsbCA/IHZpZXdwb3J0UmVjdC5sZWZ0ICsgdmlld3BvcnRSZWN0LndpZHRoIC8gMiA6IGNsaWVudFg7XG4gICAgICAgICAgICBjb25zdCBhbmNob3JZID0gY2xpZW50WSA9PSBudWxsID8gdmlld3BvcnRSZWN0LnRvcCArIHZpZXdwb3J0UmVjdC5oZWlnaHQgLyAyIDogY2xpZW50WTtcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhc1ggPSAoYW5jaG9yWCAtIHZpZXdwb3J0UmVjdC5sZWZ0IC0gcGFuWCkgLyB6b29tO1xuICAgICAgICAgICAgY29uc3QgY2FudmFzWSA9IChhbmNob3JZIC0gdmlld3BvcnRSZWN0LnRvcCAtIHBhblkpIC8gem9vbTtcbiAgICAgICAgICAgIHpvb20gPSBjbGFtcChuZXh0Wm9vbSwgTUlOX1pPT00sIE1BWF9aT09NKTtcbiAgICAgICAgICAgIHBhblggPSBhbmNob3JYIC0gdmlld3BvcnRSZWN0LmxlZnQgLSBjYW52YXNYICogem9vbTtcbiAgICAgICAgICAgIHBhblkgPSBhbmNob3JZIC0gdmlld3BvcnRSZWN0LnRvcCAtIGNhbnZhc1kgKiB6b29tO1xuICAgICAgICAgICAgYXBwbHlQcmV2aWV3VHJhbnNmb3JtKCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcmVuZGVyT3ZlcmxheSA9ICgpID0+IHtcbiAgICAgICAgICAgIGlmICghJC5wcmV2aWV3T3ZlcmxheSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgaHRtbDogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkSWRlbnRpdHkgPSBzZWxlY3RlZENvbXBvbmVudElkZW50aXR5O1xuICAgICAgICAgICAgY29uc3QgZm9jdXNlZCA9IHNlbGVjdGVkSWRlbnRpdHlcbiAgICAgICAgICAgICAgICA/IChsYXN0UHJldmlldyAmJiBsYXN0UHJldmlldy5oaXRzIHx8IFtdKS5maWx0ZXIoKGhpdCkgPT4gc2FtZUNvbXBvbmVudChoaXQsIHNlbGVjdGVkSWRlbnRpdHkpKVxuICAgICAgICAgICAgICAgIDogW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGhpdCBvZiBoaWdobGlnaHRlZFJlY3RzLnNsaWNlKDAsIDEyMCkpIHtcbiAgICAgICAgICAgICAgICBodG1sLnB1c2gocmVjdEh0bWwoaGl0LCAnaGl0LXJlY3QnLCBoaXQucGF0aCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBoaXQgb2YgZm9jdXNlZC5zbGljZSgwLCAxMjApKSB7XG4gICAgICAgICAgICAgICAgaHRtbC5wdXNoKHJlY3RIdG1sKGhpdCwgJ2NvbXBvbmVudC1mb2N1cy1yZWN0JywgaGl0LmNvbXBvbmVudE5hbWUgfHwgaGl0LnBhdGgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzZWxlY3Rpb25SZWN0ICYmIHNlbGVjdGlvblJlY3Qud2lkdGggPiAwICYmIHNlbGVjdGlvblJlY3QuaGVpZ2h0ID4gMCkge1xuICAgICAgICAgICAgICAgIGh0bWwucHVzaChyZWN0SHRtbChzZWxlY3Rpb25SZWN0LCAnZHJhZy1zZWxlY3Rpb24tcmVjdCcsICdzZWxlY3Rpb24nKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAkLnByZXZpZXdPdmVybGF5LmlubmVySFRNTCA9IGh0bWwuam9pbignJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcmVuZGVyU2VsZWN0aW9uID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCQuc2VsZWN0aW9uU3VtbWFyeSkge1xuICAgICAgICAgICAgICAgIGlmIChzZWxlY3RlZENvbXBvbmVudElkZW50aXR5KSB7XG4gICAgICAgICAgICAgICAgICAgICQuc2VsZWN0aW9uU3VtbWFyeS50ZXh0Q29udGVudCA9IGAke3NlbGVjdGVkQ29tcG9uZW50SWRlbnRpdHkuY29tcG9uZW50TmFtZSB8fCBzZWxlY3RlZENvbXBvbmVudElkZW50aXR5LmNvbXBvbmVudEtleX0gwrcgJHt2YXJpYW50TGFiZWwoc2VsZWN0ZWRDb21wb25lbnRJZGVudGl0eS52YXJpYW50RmlsdGVyKX1gO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2VsZWN0aW9uSGl0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICQuc2VsZWN0aW9uU3VtbWFyeS50ZXh0Q29udGVudCA9IGDlkb3kuK0gJHtzZWxlY3Rpb25IaXRzLmxlbmd0aH0g5Liq6IqC54K5YDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAkLnNlbGVjdGlvblN1bW1hcnkudGV4dENvbnRlbnQgPSAn5pyq6YCJ5oup55S75p2/6IqC54K5JztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoISQuc2VsZWN0aW9uSGl0cykgcmV0dXJuO1xuICAgICAgICAgICAgJC5zZWxlY3Rpb25IaXRzLmlubmVySFRNTCA9IHNlbGVjdGlvbkhpdHMuc2xpY2UoMCwgMjQpLm1hcCgoaGl0LCBpbmRleCkgPT5cbiAgICAgICAgICAgICAgICBgPGJ1dHRvbiBjbGFzcz1cInNlbGVjdGlvbi1oaXRcIiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1oaXQtaW5kZXg9XCIke2luZGV4fVwiIHRpdGxlPVwiJHtlc2NhcGVIdG1sKGhpdC5wYXRoKX1cIj4ke2VzY2FwZUh0bWwoaGl0Lm5hbWUgfHwgaGl0LnBhdGgpfTwvYnV0dG9uPmBcbiAgICAgICAgICAgICkuam9pbignJyk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbWFwcGluZ0VudHJpZXMgPSAoKTogYW55W10gPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVzb2x2ZWQgPSBtYXBwaW5nRGF0YSAmJiBtYXBwaW5nRGF0YS5yZXNvbHZlZDtcbiAgICAgICAgICAgIGlmIChyZXNvbHZlZCAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkLmVudHJpZXMpKSByZXR1cm4gcmVzb2x2ZWQuZW50cmllcztcbiAgICAgICAgICAgIGNvbnN0IGRvY3VtZW50ID0gbWFwcGluZ0RhdGEgJiYgbWFwcGluZ0RhdGEuZG9jdW1lbnQgfHwgeyBlbnRyaWVzOiBbXSB9O1xuICAgICAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoZG9jdW1lbnQuZW50cmllcykgPyBkb2N1bWVudC5lbnRyaWVzIDogW107XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbWFwcGluZ0VudHJ5SXNSZXNvbHZlZCA9IChlbnRyeTogYW55KTogYm9vbGVhbiA9PiAhIShcbiAgICAgICAgICAgIGVudHJ5ICYmXG4gICAgICAgICAgICBlbnRyeS5yZXNvbHZlZCAhPT0gZmFsc2UgJiZcbiAgICAgICAgICAgIChTdHJpbmcoZW50cnkucHJlZmFiVXVpZCB8fCAnJykudHJpbSgpIHx8IFN0cmluZyhlbnRyeS5wcmVmYWJVcmwgfHwgJycpLnRyaW0oKSlcbiAgICAgICAgKTtcblxuICAgICAgICBjb25zdCBtYXBwaW5nRm9yQ29tcG9uZW50ID0gKGNvbXBvbmVudDogQ29tcG9uZW50SWRlbnRpdHkpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGVudHJpZXMgPSBtYXBwaW5nRW50cmllcygpLmZpbHRlcigoZW50cnkpID0+IFN0cmluZyhlbnRyeS5jb21wb25lbnRLZXkgfHwgJycpID09PSBjb21wb25lbnQuY29tcG9uZW50S2V5KTtcbiAgICAgICAgICAgIGNvbnN0IGV4YWN0ID0gZW50cmllcy5maW5kKChlbnRyeSkgPT4gU3RyaW5nKGVudHJ5LnZhcmlhbnRGaWx0ZXIgfHwgJycpID09PSBjb21wb25lbnQudmFyaWFudEZpbHRlcik7XG4gICAgICAgICAgICBjb25zdCBmYWxsYmFjayA9IGVudHJpZXMuZmluZCgoZW50cnkpID0+ICFTdHJpbmcoZW50cnkudmFyaWFudEZpbHRlciB8fCAnJykudHJpbSgpKTtcbiAgICAgICAgICAgIGNvbnN0IGVmZmVjdGl2ZSA9IG1hcHBpbmdFbnRyeUlzUmVzb2x2ZWQoZXhhY3QpXG4gICAgICAgICAgICAgICAgPyBleGFjdFxuICAgICAgICAgICAgICAgIDogbWFwcGluZ0VudHJ5SXNSZXNvbHZlZChmYWxsYmFjaykgPyBmYWxsYmFjayA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHJldHVybiB7IGV4YWN0LCBmYWxsYmFjaywgZWZmZWN0aXZlIH07XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbWFwcGluZ0VudHJ5Rm9yU2xvdCA9IChjb21wb25lbnRLZXk6IHN0cmluZywgdmFyaWFudEZpbHRlcjogc3RyaW5nKTogYW55IHwgdW5kZWZpbmVkID0+XG4gICAgICAgICAgICBtYXBwaW5nRW50cmllcygpLmZpbmQoKGVudHJ5KSA9PlxuICAgICAgICAgICAgICAgIFN0cmluZyhlbnRyeS5jb21wb25lbnRLZXkgfHwgJycpID09PSBjb21wb25lbnRLZXkgJiZcbiAgICAgICAgICAgICAgICBTdHJpbmcoZW50cnkudmFyaWFudEZpbHRlciB8fCAnJykgPT09IHZhcmlhbnRGaWx0ZXJcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgY29uc3QgcHJldmlld0hpdEZvckNvbXBvbmVudCA9IChjb21wb25lbnQ6IENvbXBvbmVudElkZW50aXR5KTogUHJldmlld0hpdCB8IHVuZGVmaW5lZCA9PiB7XG4gICAgICAgICAgICBjb25zdCBoaXRzID0gbGFzdFByZXZpZXcgJiYgQXJyYXkuaXNBcnJheShsYXN0UHJldmlldy5oaXRzKSA/IGxhc3RQcmV2aWV3LmhpdHMgOiBbXTtcbiAgICAgICAgICAgIHJldHVybiBoaXRzLmZpbmQoKGhpdCkgPT4gc2FtZUNvbXBvbmVudChoaXQsIGNvbXBvbmVudCkpIHx8XG4gICAgICAgICAgICAgICAgaGl0cy5maW5kKChoaXQpID0+IFN0cmluZyhoaXQuY29tcG9uZW50S2V5IHx8ICcnKSA9PT0gY29tcG9uZW50LmNvbXBvbmVudEtleSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgY29tcG9uZW50VGh1bWJTdHlsZSA9IChjb21wb25lbnQ6IENvbXBvbmVudElkZW50aXR5KTogc3RyaW5nID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGhpdCA9IHByZXZpZXdIaXRGb3JDb21wb25lbnQoY29tcG9uZW50KTtcbiAgICAgICAgICAgIGlmICghaGl0IHx8IGhpdC53aWR0aCA8PSAwIHx8IGhpdC5oZWlnaHQgPD0gMCB8fCAhcHJldmlld0ltYWdlVXJsKSByZXR1cm4gJyc7XG4gICAgICAgICAgICBjb25zdCBjYW52YXMgPSBjYW52YXNTaXplKCk7XG4gICAgICAgICAgICBjb25zdCBzY2FsZSA9IE1hdGgubWluKDQwIC8gaGl0LndpZHRoLCA0MCAvIGhpdC5oZWlnaHQpO1xuICAgICAgICAgICAgY29uc3QgaW1hZ2VXaWR0aCA9IGNhbnZhcy53aWR0aCAqIHNjYWxlO1xuICAgICAgICAgICAgY29uc3QgaW1hZ2VIZWlnaHQgPSBjYW52YXMuaGVpZ2h0ICogc2NhbGU7XG4gICAgICAgICAgICBjb25zdCBwb3NpdGlvblggPSAoNDQgLSBoaXQud2lkdGggKiBzY2FsZSkgLyAyIC0gaGl0LnggKiBzY2FsZTtcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uWSA9ICg0NCAtIGhpdC5oZWlnaHQgKiBzY2FsZSkgLyAyIC0gaGl0LnkgKiBzY2FsZTtcbiAgICAgICAgICAgIHJldHVybiBgLS10aHVtYi13aWR0aDoke2ltYWdlV2lkdGh9cHg7LS10aHVtYi1oZWlnaHQ6JHtpbWFnZUhlaWdodH1weDstLXRodW1iLWxlZnQ6JHtwb3NpdGlvblh9cHg7LS10aHVtYi10b3A6JHtwb3NpdGlvbll9cHhgO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHJlbmRlck1hcHBpbmdzID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZW50cmllcyA9IG1hcHBpbmdFbnRyaWVzKCk7XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnRzOiBDb21wb25lbnRJZGVudGl0eVtdID0gbWFwcGluZ0RhdGEgJiYgQXJyYXkuaXNBcnJheShtYXBwaW5nRGF0YS5jb21wb25lbnRzKVxuICAgICAgICAgICAgICAgID8gbWFwcGluZ0RhdGEuY29tcG9uZW50c1xuICAgICAgICAgICAgICAgIDogW107XG4gICAgICAgICAgICBjb25zdCByZXNvbHZlZCA9IG1hcHBpbmdEYXRhICYmIG1hcHBpbmdEYXRhLnJlc29sdmVkIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgaW5jbHVkZU5lc3RlZCA9ICEhKCQuaW5jbHVkZU5lc3RlZCAmJiAkLmluY2x1ZGVOZXN0ZWQuY2hlY2tlZCk7XG4gICAgICAgICAgICBjb25zdCBhbGxHcm91cHMgPSBncm91cENvbXBvbmVudElkZW50aXRpZXMoY29tcG9uZW50cyk7XG4gICAgICAgICAgICBjb25zdCBzY29wZWRDb21wb25lbnRzID0gaW5jbHVkZU5lc3RlZFxuICAgICAgICAgICAgICAgID8gY29tcG9uZW50c1xuICAgICAgICAgICAgICAgIDogY29tcG9uZW50cy5maWx0ZXIoKGNvbXBvbmVudCkgPT4gY29tcG9uZW50LmlzTmVzdGVkICE9PSB0cnVlKTtcbiAgICAgICAgICAgIGNvbnN0IHNjb3BlZEdyb3VwcyA9IGdyb3VwQ29tcG9uZW50SWRlbnRpdGllcyhzY29wZWRDb21wb25lbnRzKTtcblxuICAgICAgICAgICAgaWYgKCQubWFwcGluZ1N1bW1hcnkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzY29wZVRleHQgPSBpbmNsdWRlTmVzdGVkXG4gICAgICAgICAgICAgICAgICAgID8gYCR7YWxsR3JvdXBzLmxlbmd0aH0g5Liq57uE5Lu2YFxuICAgICAgICAgICAgICAgICAgICA6IGAke3Njb3BlZEdyb3Vwcy5sZW5ndGh9IOS4quWkluWxgue7hOS7tiR7YWxsR3JvdXBzLmxlbmd0aCA+IHNjb3BlZEdyb3Vwcy5sZW5ndGggPyBgIC8gJHthbGxHcm91cHMubGVuZ3RofSDkuKrlhajpg6hgIDogJyd9YDtcbiAgICAgICAgICAgICAgICAkLm1hcHBpbmdTdW1tYXJ5LnRleHRDb250ZW50ID0gYCR7ZW50cmllcy5sZW5ndGh9IOadoeaYoOWwhCDCtyAke3Jlc29sdmVkLnZhbGlkIHx8IDB9IOWPr+eUqCDCtyAke3Jlc29sdmVkLmJyb2tlbiB8fCAwfSDmlq3pk74gwrcgJHtzY29wZVRleHR9YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgc2VhcmNoID0gU3RyaW5nKCQuY29tcG9uZW50U2VhcmNoICYmICQuY29tcG9uZW50U2VhcmNoLnZhbHVlIHx8ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGNvbnN0IGhpZGVNYXBwZWQgPSAhISgkLmhpZGVNYXBwZWQgJiYgJC5oaWRlTWFwcGVkLmNoZWNrZWQpO1xuICAgICAgICAgICAgY29uc3QgcmVuZGVyZWRHcm91cHMgPSBzY29wZWRHcm91cHMuZmlsdGVyKChncm91cCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFsbE1hcHBlZCA9IGdyb3VwLmlkZW50aXRpZXMubGVuZ3RoID4gMCAmJiBncm91cC5pZGVudGl0aWVzLmV2ZXJ5KChjb21wb25lbnQpID0+ICEhbWFwcGluZ0ZvckNvbXBvbmVudChjb21wb25lbnQpLmVmZmVjdGl2ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGhpZGVNYXBwZWQgJiYgYWxsTWFwcGVkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKCFzZWFyY2gpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIHJldHVybiBgJHtncm91cC5jb21wb25lbnROYW1lfSAke2dyb3VwLmNvbXBvbmVudEtleX0gJHtncm91cC5pZGVudGl0aWVzLm1hcCgoaXRlbSkgPT4gaXRlbS52YXJpYW50RmlsdGVyKS5qb2luKCcgJyl9YFxuICAgICAgICAgICAgICAgICAgICAudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICAgICAgICAgICAuaW5jbHVkZXMoc2VhcmNoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmVuZGVyZWRDb21wb25lbnRzID0gcmVuZGVyZWRHcm91cHMubWFwKChncm91cCkgPT5cbiAgICAgICAgICAgICAgICBncm91cC5pZGVudGl0aWVzLmZpbmQoKGNvbXBvbmVudCkgPT5cbiAgICAgICAgICAgICAgICAgICAgISFzZWxlY3RlZENvbXBvbmVudElkZW50aXR5ICYmIHNhbWVDb21wb25lbnQoY29tcG9uZW50LCBzZWxlY3RlZENvbXBvbmVudElkZW50aXR5KVxuICAgICAgICAgICAgICAgICkgfHwgZ3JvdXAuaWRlbnRpdGllc1swXVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJlbmRlcmVkQmluZGluZ1Nsb3RzID0gW107XG5cbiAgICAgICAgICAgIGlmICgkLmNvbXBvbmVudExpc3QpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmV2aWV3SW1hZ2UgPSBwcmV2aWV3SW1hZ2VVcmw7XG4gICAgICAgICAgICAgICAgJC5jb21wb25lbnRMaXN0LmlubmVySFRNTCA9IHJlbmRlcmVkR3JvdXBzLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgICAgICAgICA/IGA8ZGl2IGNsYXNzPVwiZW1wdHlcIj4ke3Njb3BlZEdyb3Vwcy5sZW5ndGggPyAn5rKh5pyJ56ym5ZCI562b6YCJ5p2h5Lu255qE57uE5Lu2JyA6IGFsbEdyb3Vwcy5sZW5ndGggPyAn5b2T5YmN6IyD5Zu05rKh5pyJ5aSW5bGC57uE5Lu2JyA6ICflvZPliY0gSlNPTiDmsqHmnInnu4Tku7bouqvku70nfTwvZGl2PmBcbiAgICAgICAgICAgICAgICAgICAgOiByZW5kZXJlZEdyb3Vwcy5tYXAoKGdyb3VwLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gcmVuZGVyZWRDb21wb25lbnRzW2luZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGtleUVudHJpZXMgPSBlbnRyaWVzLmZpbHRlcigoZW50cnkpID0+IFN0cmluZyhlbnRyeS5jb21wb25lbnRLZXkgfHwgJycpID09PSBncm91cC5jb21wb25lbnRLZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWFwcGVkQ291bnQgPSBncm91cC5pZGVudGl0aWVzLmZpbHRlcigoaWRlbnRpdHkpID0+ICEhbWFwcGluZ0ZvckNvbXBvbmVudChpZGVudGl0eSkuZWZmZWN0aXZlKS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhbGxNYXBwZWQgPSBtYXBwZWRDb3VudCA9PT0gZ3JvdXAuaWRlbnRpdGllcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXNUb25lID0gYWxsTWFwcGVkID8gJ29rJyA6IGtleUVudHJpZXMubGVuZ3RoID4gMCA/ICd3YXJuJyA6ICdvZmYnO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdHVzVGV4dCA9IG1hcHBlZENvdW50ID4gMCA/IGAke21hcHBlZENvdW50fS8ke2dyb3VwLmlkZW50aXRpZXMubGVuZ3RofSDlt7LmmKDlsIRgIDogJ+acquaYoOWwhCc7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzZWxlY3RlZCA9ICEhc2VsZWN0ZWRDb21wb25lbnRJZGVudGl0eSAmJiBzZWxlY3RlZENvbXBvbmVudElkZW50aXR5LmNvbXBvbmVudEtleSA9PT0gZ3JvdXAuY29tcG9uZW50S2V5O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5pdGlhbCA9IGVzY2FwZUh0bWwoKGdyb3VwLmNvbXBvbmVudE5hbWUgfHwgZ3JvdXAuY29tcG9uZW50S2V5IHx8ICc/Jykuc2xpY2UoMCwgMSkudG9VcHBlckNhc2UoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0aHVtYkhpdCA9IHByZXZpZXdIaXRGb3JDb21wb25lbnQoY29tcG9uZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc1RodW1ibmFpbCA9ICEhcHJldmlld0ltYWdlICYmICEhdGh1bWJIaXQgJiYgdGh1bWJIaXQud2lkdGggPiAwICYmIHRodW1iSGl0LmhlaWdodCA+IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0aHVtYkNsYXNzID0gJ2NvbXBvbmVudC10aHVtYic7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0aHVtYkltYWdlID0gaGFzVGh1bWJuYWlsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBgPGltZyBjbGFzcz1cImNvbXBvbmVudC10aHVtYi1pbWFnZVwiIHNyYz1cIiR7ZXNjYXBlSHRtbChwcmV2aWV3SW1hZ2UpfVwiIGFsdD1cIlwiIGRyYWdnYWJsZT1cImZhbHNlXCIgLz5gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgOiAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4cGxpY2l0VmFyaWFudEZpbHRlcnMgPSBBcnJheS5mcm9tKG5ldyBTZXQoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZ3JvdXAuaWRlbnRpdGllcy5tYXAoKGlkZW50aXR5KSA9PiBTdHJpbmcoaWRlbnRpdHkudmFyaWFudEZpbHRlciB8fCAnJykpLmZpbHRlcihCb29sZWFuKVxuICAgICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNEZWZhdWx0SWRlbnRpdHkgPSBncm91cC5pZGVudGl0aWVzLnNvbWUoKGlkZW50aXR5KSA9PiAhU3RyaW5nKGlkZW50aXR5LnZhcmlhbnRGaWx0ZXIgfHwgJycpLnRyaW0oKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBoYXNEZWZhdWx0TWFwcGluZyA9IGtleUVudHJpZXMuc29tZSgoZW50cnkpID0+ICFTdHJpbmcoZW50cnkudmFyaWFudEZpbHRlciB8fCAnJykudHJpbSgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhcmlhbnRGaWx0ZXJzID0gQXJyYXkuZnJvbShuZXcgU2V0KFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuLi4oaGFzRGVmYXVsdElkZW50aXR5IHx8IGV4cGxpY2l0VmFyaWFudEZpbHRlcnMubGVuZ3RoID09PSAwIHx8IGhhc0RlZmF1bHRNYXBwaW5nID8gWycnXSA6IFtdKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAuLi5leHBsaWNpdFZhcmlhbnRGaWx0ZXJzLFxuICAgICAgICAgICAgICAgICAgICAgICAgXSkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2xvdHMgPSB2YXJpYW50RmlsdGVycy5tYXAoKHZhcmlhbnRGaWx0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzbG90Q29tcG9uZW50ID0gZ3JvdXAuaWRlbnRpdGllcy5maW5kKChpZGVudGl0eSkgPT4gaWRlbnRpdHkudmFyaWFudEZpbHRlciA9PT0gdmFyaWFudEZpbHRlcikgfHwgY29tcG9uZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5ID0gbWFwcGluZ0VudHJ5Rm9yU2xvdChncm91cC5jb21wb25lbnRLZXksIHZhcmlhbnRGaWx0ZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJpbmRpbmdJbmRleCA9IHJlbmRlcmVkQmluZGluZ1Nsb3RzLnB1c2goeyBjb21wb25lbnQ6IHNsb3RDb21wb25lbnQsIHZhcmlhbnRGaWx0ZXIgfSkgLSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVudHJ5UmVzb2x2ZWQgPSBtYXBwaW5nRW50cnlJc1Jlc29sdmVkKGVudHJ5KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGVudHJ5UmVzb2x2ZWQgPyBTdHJpbmcoZW50cnkucHJlZmFiVXVpZCB8fCBlbnRyeS5wcmVmYWJVcmwgfHwgJycpIDogJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGxhY2Vob2xkZXIgPSBlbnRyeSAmJiAhZW50cnlSZXNvbHZlZCA/ICdQcmVmYWIg5pat6ZO+77yM6K+36YeN5paw6YCJ5oupJyA6ICfpgInmi6nmiJbmi5blhaUgUHJlZmFiJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsYWJlbFRpdGxlID0gdmFyaWFudEZpbHRlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGDlj6rlnKjor6Xlj5jkvZPlrozlhajljLnphY3ml7bkvb/nlKjvvJoke3ZhcmlhbnRGaWx0ZXJ9YFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6ICfml6Dlj5jkvZPnu4Tku7bnmoTpu5jorqTmmKDlsITvvJvljoblj7LlhZzlupXmmKDlsITkuZ/kvJrkv53nlZnlnKjov5nph4wnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHVuYXNzaWduQnV0dG9uID0gZW50cnlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBgPGJ1dHRvbiBjbGFzcz1cInByZWZhYi1zbG90LXVuYXNzaWduIGljb24tYnRuXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtYWN0aW9uPVwidW5hc3NpZ24tc2xvdFwiIGRhdGEtYmluZGluZy1pbmRleD1cIiR7YmluZGluZ0luZGV4fVwiIHRpdGxlPVwi6Kej57uR5q2kIFByZWZhYlwiIGFyaWEtbGFiZWw9XCLop6Pnu5HmraQgUHJlZmFiXCI+w5c8L2J1dHRvbj5gXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGA8ZGl2IGNsYXNzPVwicHJlZmFiLXNsb3RcIiBkYXRhLXN0YXRlPVwiJHtlbnRyeSAmJiAhZW50cnlSZXNvbHZlZCA/ICdicm9rZW4nIDogJ3JlYWR5J31cIiBkYXRhLXZhcmlhbnQtZmlsdGVyPVwiJHtlc2NhcGVIdG1sKHZhcmlhbnRGaWx0ZXIpfVwiPmAgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBgPHNwYW4gY2xhc3M9XCJwcmVmYWItc2xvdC1sYWJlbFwiIHRpdGxlPVwiJHtlc2NhcGVIdG1sKGxhYmVsVGl0bGUpfVwiPiR7ZXNjYXBlSHRtbCh2YXJpYW50TGFiZWwodmFyaWFudEZpbHRlcikpfTwvc3Bhbj5gICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYDx1aS1hc3NldCBjbGFzcz1cInByZWZhYi1hc3NldC1maWVsZFwiIGRhdGEtdGVzdGlkPVwiZnRvYy1wcmVmYWItZmllbGRcIiBkYXRhLWJpbmRpbmctaW5kZXg9XCIke2JpbmRpbmdJbmRleH1cIiBkcm9wcGFibGU9XCJjYy5QcmVmYWJcIiB2YWx1ZT1cIiR7ZXNjYXBlSHRtbCh2YWx1ZSl9XCIgcGxhY2Vob2xkZXI9XCIke3BsYWNlaG9sZGVyfVwiPjwvdWktYXNzZXQ+YCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuYXNzaWduQnV0dG9uICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJzwvZGl2Pic7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KS5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhcmlhbnRDb3VudCA9IGV4cGxpY2l0VmFyaWFudEZpbHRlcnMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGA8YXJ0aWNsZSBjbGFzcz1cImNvbXBvbmVudC1jYXJkXCIgZGF0YS10ZXN0aWQ9XCJmdG9jLWNvbXBvbmVudC1jYXJkXCIgZGF0YS1jb21wb25lbnQtaW5kZXg9XCIke2luZGV4fVwiIGRhdGEtY29tcG9uZW50LWtleT1cIiR7ZXNjYXBlSHRtbChncm91cC5jb21wb25lbnRLZXkpfVwiIGRhdGEtc2VsZWN0ZWQ9XCIke3NlbGVjdGVkfVwiPmAgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGA8aGVhZGVyIGNsYXNzPVwiY29tcG9uZW50LWNhcmQtaGVhZGVyXCIgdGl0bGU9XCLlnKjnlLvmnb/kuK3lrprkvY0gJHtlc2NhcGVIdG1sKGdyb3VwLmNvbXBvbmVudE5hbWUgfHwgZ3JvdXAuY29tcG9uZW50S2V5KX1cIj5gICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgPGRpdiBjbGFzcz1cIiR7dGh1bWJDbGFzc31cIiBzdHlsZT1cIiR7Y29tcG9uZW50VGh1bWJTdHlsZShjb21wb25lbnQpfVwiPiR7dGh1bWJJbWFnZX08c3Bhbj4ke2luaXRpYWx9PC9zcGFuPjwvZGl2PmAgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICc8ZGl2IGNsYXNzPVwiY29tcG9uZW50LWJvZHlcIj4nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgPGRpdiBjbGFzcz1cImNvbXBvbmVudC10aXRsZS1yb3dcIj48c3Ryb25nPiR7ZXNjYXBlSHRtbChncm91cC5jb21wb25lbnROYW1lIHx8IGdyb3VwLmNvbXBvbmVudEtleSl9PC9zdHJvbmc+YCArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJzxzcGFuIGNsYXNzPVwiY29tcG9uZW50LWJhZGdlc1wiPicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChncm91cC5pc05lc3RlZCA/ICc8c3BhbiBjbGFzcz1cIm1hcHBpbmctYmFkZ2VcIiBkYXRhLXRvbmU9XCJuZXN0ZWRcIj7ltYzlpZc8L3NwYW4+JyA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYDxzcGFuIGNsYXNzPVwibWFwcGluZy1iYWRnZVwiIGRhdGEtdG9uZT1cIiR7c3RhdHVzVG9uZX1cIj4ke3N0YXR1c1RleHR9PC9zcGFuPjwvc3Bhbj48L2Rpdj5gICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgPGRpdiBjbGFzcz1cImNvbXBvbmVudC1tZXRhXCI+PHNwYW4+JHt2YXJpYW50Q291bnQgPiAwID8gYCR7dmFyaWFudENvdW50fSDkuKrlj5jkvZNgIDogJ+aXoOWPmOS9kyd9PC9zcGFuPjxjb2RlIHRpdGxlPVwiJHtlc2NhcGVIdG1sKGdyb3VwLmNvbXBvbmVudEtleSl9XCI+JHtlc2NhcGVIdG1sKGdyb3VwLmNvbXBvbmVudEtleSl9PC9jb2RlPjwvZGl2PmAgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICc8L2Rpdj48L2hlYWRlcj4nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgPGRpdiBjbGFzcz1cInByZWZhYi1zbG90LWxpc3RcIj4ke3Nsb3RzfTwvZGl2PjwvYXJ0aWNsZT5gO1xuICAgICAgICAgICAgICAgICAgICB9KS5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICAkLmNvbXBvbmVudExpc3QucXVlcnlTZWxlY3RvckFsbDxIVE1MSW1hZ2VFbGVtZW50PignLmNvbXBvbmVudC10aHVtYi1pbWFnZScpLmZvckVhY2goKGltYWdlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRodW1ibmFpbCA9IGltYWdlLmNsb3Nlc3Q8SFRNTEVsZW1lbnQ+KCcuY29tcG9uZW50LXRodW1iJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNldHRsZSA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvYWRlZCA9IGltYWdlLmNvbXBsZXRlICYmIGltYWdlLm5hdHVyYWxXaWR0aCA+IDAgJiYgaW1hZ2UubmF0dXJhbEhlaWdodCA+IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGh1bWJuYWlsKSB0aHVtYm5haWwuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLXByZXZpZXcnLCBsb2FkZWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFsb2FkZWQpIGltYWdlLnJlbW92ZSgpO1xuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBpbWFnZS5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgc2V0dGxlLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGltYWdlLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgc2V0dGxlLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWFnZS5jb21wbGV0ZSkgc2V0dGxlKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICgkLm1hcHBpbmdMaXN0KSB7XG4gICAgICAgICAgICAgICAgJC5tYXBwaW5nTGlzdC5pbm5lckhUTUwgPSBlbnRyaWVzLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgICAgICAgICA/ICc8ZGl2IGNsYXNzPVwiZW1wdHlcIj7mmoLml6Dlt6XnqIvmmKDlsIQ8L2Rpdj4nXG4gICAgICAgICAgICAgICAgICAgIDogZW50cmllcy5tYXAoKGVudHJ5LCBpbmRleCkgPT4gYDxkaXYgY2xhc3M9XCJtYXBwaW5nLWVudHJ5XCI+YCArXG4gICAgICAgICAgICAgICAgICAgICAgICBgPGRpdiBjbGFzcz1cIm1hcHBpbmctZW50cnktdGl0bGVcIj48c3Ryb25nPiR7ZXNjYXBlSHRtbChlbnRyeS5jb21wb25lbnROYW1lIHx8IGVudHJ5LmNvbXBvbmVudEtleSl9PC9zdHJvbmc+YCArXG4gICAgICAgICAgICAgICAgICAgICAgICBgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgZGF0YS1hY3Rpb249XCJ1bmFzc2lnblwiIGRhdGEtZW50cnktaW5kZXg9XCIke2luZGV4fVwiPuino+e7kTwvYnV0dG9uPjwvZGl2PmAgK1xuICAgICAgICAgICAgICAgICAgICAgICAgYDxzcGFuIGNsYXNzPVwiY29tcG9uZW50LXZhcmlhbnRcIj4ke2VzY2FwZUh0bWwodmFyaWFudExhYmVsKGVudHJ5LnZhcmlhbnRGaWx0ZXIpKX08L3NwYW4+YCArXG4gICAgICAgICAgICAgICAgICAgICAgICBgPGNvZGUgY2xhc3M9XCJtYXBwaW5nLWVudHJ5LXBhdGhcIj4ke2VzY2FwZUh0bWwobWFwcGluZ0VudHJ5SXNSZXNvbHZlZChlbnRyeSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGVudHJ5LnByZWZhYlVybCB8fCBlbnRyeS5wcmVmYWJVdWlkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBgUHJlZmFiIOaWremTviDCtyAke2VudHJ5LnJlcXVlc3RlZFByZWZhYlVybCB8fCBlbnRyeS5yZXF1ZXN0ZWRQcmVmYWJVdWlkIHx8ICfotYTmupDkuI3lrZjlnKgnfWApfTwvY29kZT48L2Rpdj5gXG4gICAgICAgICAgICAgICAgICAgICkuam9pbignJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbG9hZE1hcHBpbmdzID0gYXN5bmMgKHJldmlzaW9uID0gbG9hZFJldmlzaW9uKSA9PiB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IGF3YWl0IFJFUSgnZ2V0LWNvbXBvbmVudC1tYXBwaW5ncycpO1xuICAgICAgICAgICAgaWYgKHJldmlzaW9uICE9PSBsb2FkUmV2aXNpb24pIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg6K+75Y+W5pig5bCE5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICfmnKrnn6XplJnor68nfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hcHBpbmdEYXRhID0gcmVzdWx0LmRhdGEgfHwge307XG4gICAgICAgICAgICByZW5kZXJNYXBwaW5ncygpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgYXNzaWduQ29tcG9uZW50ID0gYXN5bmMgKGNvbXBvbmVudDogQ29tcG9uZW50SWRlbnRpdHksIHZhcmlhbnRGaWx0ZXI6IHN0cmluZywgcHJlZmFiVXVpZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gICAgICAgICAgICBpZiAoIWNvbXBvbmVudCB8fCAhY29tcG9uZW50LmNvbXBvbmVudEtleSB8fCAhcHJlZmFiVXVpZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgc2V0U3RhdHVzKCfmraPlnKggQXNzaWduIFByZWZhYi4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0gYXdhaXQgUkVRKCd1cHNlcnQtY29tcG9uZW50LW1hcHBpbmcnLCB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudEtleTogY29tcG9uZW50LmNvbXBvbmVudEtleSxcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50TmFtZTogY29tcG9uZW50LmNvbXBvbmVudE5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHZhcmlhbnRGaWx0ZXIsXG4gICAgICAgICAgICAgICAgICAgIHByZWZhYlV1aWQsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg57uR5a6a5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICfor7fph43mlrDpgInmi6kgUHJlZmFiJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyTWFwcGluZ3MoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhd2FpdCBsb2FkTWFwcGluZ3MoKTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ1ByZWZhYiDmmKDlsITlt7Lkv53lrZjvvIzmnKzmrKHlrozmlbTlr7zlhaXlsIbkvb/nlKjor6XlhbPns7vjgIInLCAnb2snKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOe7keWumuW8guW4uO+8miR7ZXJyb3IgJiYgZXJyb3IubWVzc2FnZSB8fCBlcnJvcn1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICByZW5kZXJNYXBwaW5ncygpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB1bmFzc2lnbkNvbXBvbmVudCA9IGFzeW5jIChjb21wb25lbnRLZXk6IHN0cmluZywgdmFyaWFudEZpbHRlcjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gICAgICAgICAgICBpZiAoIWNvbXBvbmVudEtleSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgc2V0U3RhdHVzKCfmraPlnKjop6Pnu5EgUHJlZmFiLi4uJywgJ2luZm8nKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBhbnkgPSBhd2FpdCBSRVEoJ3JlbW92ZS1jb21wb25lbnQtbWFwcGluZycsIGNvbXBvbmVudEtleSwgdmFyaWFudEZpbHRlcik7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg6Kej57uR5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICfmnKrnn6XplJnor68nfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJNYXBwaW5ncygpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGF3YWl0IGxvYWRNYXBwaW5ncygpO1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cygnUHJlZmFiIOaYoOWwhOW3suino+e7keOAgicsICdvaycpO1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg6Kej57uR5byC5bi477yaJHtlcnJvciAmJiBlcnJvci5tZXNzYWdlIHx8IGVycm9yfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIHJlbmRlck1hcHBpbmdzKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGZvY3VzSGlnaGxpZ2h0ZWRSZWN0cyA9IChyZWN0czogUHJldmlld0hpdFtdKSA9PiB7XG4gICAgICAgICAgICBpZiAoISQucHJldmlld1ZpZXdwb3J0IHx8IHJlY3RzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgYm91bmRzID0gcmVjdHMucmVkdWNlKChvdXQsIHJlY3QpID0+ICh7XG4gICAgICAgICAgICAgICAgeDogTWF0aC5taW4ob3V0LngsIHJlY3QueCksXG4gICAgICAgICAgICAgICAgeTogTWF0aC5taW4ob3V0LnksIHJlY3QueSksXG4gICAgICAgICAgICAgICAgcmlnaHQ6IE1hdGgubWF4KG91dC5yaWdodCwgcmVjdC54ICsgcmVjdC53aWR0aCksXG4gICAgICAgICAgICAgICAgYm90dG9tOiBNYXRoLm1heChvdXQuYm90dG9tLCByZWN0LnkgKyByZWN0LmhlaWdodCksXG4gICAgICAgICAgICB9KSwgeyB4OiBJbmZpbml0eSwgeTogSW5maW5pdHksIHJpZ2h0OiAtSW5maW5pdHksIGJvdHRvbTogLUluZmluaXR5IH0pO1xuICAgICAgICAgICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgxLCBib3VuZHMucmlnaHQgLSBib3VuZHMueCk7XG4gICAgICAgICAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgxLCBib3VuZHMuYm90dG9tIC0gYm91bmRzLnkpO1xuICAgICAgICAgICAgY29uc3QgbmV4dFpvb20gPSBjbGFtcChNYXRoLm1pbigoJC5wcmV2aWV3Vmlld3BvcnQuY2xpZW50V2lkdGggLSA4MCkgLyB3aWR0aCwgKCQucHJldmlld1ZpZXdwb3J0LmNsaWVudEhlaWdodCAtIDgwKSAvIGhlaWdodCwgMiksIE1JTl9aT09NLCBNQVhfWk9PTSk7XG4gICAgICAgICAgICB6b29tID0gbmV4dFpvb207XG4gICAgICAgICAgICBwYW5YID0gKCQucHJldmlld1ZpZXdwb3J0LmNsaWVudFdpZHRoIC0gd2lkdGggKiB6b29tKSAvIDIgLSBib3VuZHMueCAqIHpvb207XG4gICAgICAgICAgICBwYW5ZID0gKCQucHJldmlld1ZpZXdwb3J0LmNsaWVudEhlaWdodCAtIGhlaWdodCAqIHpvb20pIC8gMiAtIGJvdW5kcy55ICogem9vbTtcbiAgICAgICAgICAgIGFwcGx5UHJldmlld1RyYW5zZm9ybSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHNlbGVjdENvbXBvbmVudCA9IChjb21wb25lbnQ6IENvbXBvbmVudElkZW50aXR5LCBmb2N1cyA9IHRydWUpID0+IHtcbiAgICAgICAgICAgIHNlbGVjdGVkQ29tcG9uZW50SWRlbnRpdHkgPSBjb21wb25lbnQ7XG4gICAgICAgICAgICBzZWxlY3Rpb25SZWN0ID0gbnVsbDtcbiAgICAgICAgICAgIGNvbnN0IGhpdHMgPSBsYXN0UHJldmlldyAmJiBBcnJheS5pc0FycmF5KGxhc3RQcmV2aWV3LmhpdHMpID8gbGFzdFByZXZpZXcuaGl0cyA6IFtdO1xuICAgICAgICAgICAgaGlnaGxpZ2h0ZWRSZWN0cyA9IGhpdHMuZmlsdGVyKChoaXQpID0+IHNhbWVDb21wb25lbnQoaGl0LCBjb21wb25lbnQpKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbkhpdHMgPSBoaWdobGlnaHRlZFJlY3RzLnNsaWNlKCk7XG4gICAgICAgICAgICByZW5kZXJPdmVybGF5KCk7XG4gICAgICAgICAgICByZW5kZXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIHJlbmRlck1hcHBpbmdzKCk7XG4gICAgICAgICAgICBpZiAoZm9jdXMpIGZvY3VzSGlnaGxpZ2h0ZWRSZWN0cyhoaWdobGlnaHRlZFJlY3RzKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBjYW52YXNQb2ludEZyb21Nb3VzZSA9IChldmVudDogTW91c2VFdmVudCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwgPT4ge1xuICAgICAgICAgICAgaWYgKCFsYXN0UHJldmlldyB8fCAhJC5wcmV2aWV3Vmlld3BvcnQpIHJldHVybiBudWxsO1xuICAgICAgICAgICAgY29uc3QgcmVjdCA9ICQucHJldmlld1ZpZXdwb3J0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB4OiAoZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdCAtIHBhblgpIC8gem9vbSxcbiAgICAgICAgICAgICAgICB5OiAoZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wIC0gcGFuWSkgLyB6b29tLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBzZWxlY3RBdFBvaW50ID0gKHBvaW50OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGhpdHMgPSBsYXN0UHJldmlldyAmJiBBcnJheS5pc0FycmF5KGxhc3RQcmV2aWV3LmhpdHMpID8gbGFzdFByZXZpZXcuaGl0cyA6IFtdO1xuICAgICAgICAgICAgY29uc3QgY29udGFpbmluZyA9IGhpdHMuZmlsdGVyKChoaXQpID0+IHBvaW50SW5SZWN0KHBvaW50LCBoaXQpKVxuICAgICAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiByZWN0QXJlYShhKSAtIHJlY3RBcmVhKGIpKTtcbiAgICAgICAgICAgIGNvbnN0IGNvbXBvbmVudEhpdCA9IGNvbnRhaW5pbmcuZmlsdGVyKChoaXQpID0+ICEhU3RyaW5nKGhpdC5jb21wb25lbnRLZXkgfHwgJycpKS5zb3J0KChhLCBiKSA9PiByZWN0QXJlYShhKSAtIHJlY3RBcmVhKGIpKVswXTtcbiAgICAgICAgICAgIHNlbGVjdGlvblJlY3QgPSBudWxsO1xuICAgICAgICAgICAgc2VsZWN0aW9uSGl0cyA9IGNvbnRhaW5pbmcubGVuZ3RoID8gW2NvbnRhaW5pbmdbMF1dIDogW107XG4gICAgICAgICAgICBoaWdobGlnaHRlZFJlY3RzID0gc2VsZWN0aW9uSGl0cy5zbGljZSgpO1xuICAgICAgICAgICAgc2VsZWN0ZWRDb21wb25lbnRJZGVudGl0eSA9IGNvbXBvbmVudEhpdCA/IGlkZW50aXR5RnJvbUhpdChjb21wb25lbnRIaXQpIDogbnVsbDtcbiAgICAgICAgICAgIHJlbmRlck92ZXJsYXkoKTtcbiAgICAgICAgICAgIHJlbmRlclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgcmVuZGVyTWFwcGluZ3MoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCByZW5kZXJQcmV2aWV3ID0gKHByZXZpZXc6IEpzb25QcmV2aWV3KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IG5vcm1hbGl6ZUN1cnJlbnRKc29uUGF0aChwcmV2aWV3LmZpbGVQYXRoIHx8IHNlbGVjdGVkSnNvblBhdGgpO1xuICAgICAgICAgICAgc2VsZWN0ZWRKc29uUGF0aCA9IGZpbGVQYXRoO1xuICAgICAgICAgICAgbGFzdFByZXZpZXcgPSB7XG4gICAgICAgICAgICAgICAgLi4ucHJldmlldyxcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCxcbiAgICAgICAgICAgICAgICBwcmV2aWV3SW1hZ2VEYXRhVXJsOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgaGl0czogQXJyYXkuaXNBcnJheShwcmV2aWV3LmhpdHMpID8gcHJldmlldy5oaXRzIDogW10sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKCQuanNvblBhdGgpIHtcbiAgICAgICAgICAgICAgICAkLmpzb25QYXRoLnZhbHVlID0gZmlsZVBhdGg7XG4gICAgICAgICAgICAgICAgJC5qc29uUGF0aC50aXRsZSA9IGZpbGVQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCQuY2xlYXJCdG4pICQuY2xlYXJCdG4uZGlzYWJsZWQgPSAhZmlsZVBhdGg7XG4gICAgICAgICAgICBpZiAoJC5pbXBvcnRCdG4pICQuaW1wb3J0QnRuLmRpc2FibGVkID0gIWZpbGVQYXRoO1xuICAgICAgICAgICAgaWYgKCQucmVsb2FkUHJldmlld0J0bikgJC5yZWxvYWRQcmV2aWV3QnRuLmRpc2FibGVkID0gIWZpbGVQYXRoO1xuICAgICAgICAgICAgaWYgKCQucHJldmlld0ZpbGUpIHtcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdGaWxlLnRleHRDb250ZW50ID0gYmFzZW5hbWUoZmlsZVBhdGgpIHx8ICfigJQnO1xuICAgICAgICAgICAgICAgICQucHJldmlld0ZpbGUudGl0bGUgPSBmaWxlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdOYW1lKSAkLnByZXZpZXdOYW1lLnRleHRDb250ZW50ID0gU3RyaW5nKHByZXZpZXcubmFtZSB8fCAn5pyq5ZG95ZCNJyk7XG4gICAgICAgICAgICBjb25zdCB3aWR0aCA9IE1hdGgucm91bmQoTnVtYmVyKHByZXZpZXcuY2FudmFzICYmIHByZXZpZXcuY2FudmFzLndpZHRoKSB8fCAwKTtcbiAgICAgICAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGgucm91bmQoTnVtYmVyKHByZXZpZXcuY2FudmFzICYmIHByZXZpZXcuY2FudmFzLmhlaWdodCkgfHwgMCk7XG4gICAgICAgICAgICBpZiAoJC5wcmV2aWV3Q2FudmFzKSAkLnByZXZpZXdDYW52YXMudGV4dENvbnRlbnQgPSB3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCA/IGAke3dpZHRofSDDlyAke2hlaWdodH1gIDogJ+acquefpSc7XG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IHByZXZpZXcuc3RhdHMgfHwge307XG4gICAgICAgICAgICBjb25zdCBwYXJ0cyA9IFtcbiAgICAgICAgICAgICAgICBgJHtOdW1iZXIoc3RhdHMuaGl0cykgfHwgMH0g6IqC54K5YCxcbiAgICAgICAgICAgICAgICBgJHtOdW1iZXIoc3RhdHMudGV4dHMpIHx8IDB9IOaWh+Wtl2AsXG4gICAgICAgICAgICAgICAgYCR7TnVtYmVyKHN0YXRzLmltYWdlcykgfHwgMH0g5Zu+54mHYCxcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBpZiAoKE51bWJlcihzdGF0cy5pbnRlcmZhY2VDb3VudCkgfHwgMCkgPiAxKSBwYXJ0cy5wdXNoKGAke3N0YXRzLmludGVyZmFjZUNvdW50fSDnlLvmnb9gKTtcbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdTdGF0cykgJC5wcmV2aWV3U3RhdHMudGV4dENvbnRlbnQgPSBwYXJ0cy5qb2luKCcgwrcgJyk7XG4gICAgICAgICAgICBpZiAoJC5wcmV2aWV3TWV0YSkgJC5wcmV2aWV3TWV0YS50ZXh0Q29udGVudCA9IGAke3ByZXZpZXcubmFtZSB8fCAn5pyq5ZG95ZCNJ30gwrcgJHt3aWR0aH3DlyR7aGVpZ2h0fSDCtyAke3BhcnRzLmpvaW4oJyDCtyAnKX1gO1xuICAgICAgICAgICAgaWYgKCQucHJldmlld1N0YWdlKSB7XG4gICAgICAgICAgICAgICAgJC5wcmV2aWV3U3RhZ2UuaGlkZGVuID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgJC5wcmV2aWV3U3RhZ2Uuc3R5bGUud2lkdGggPSBgJHtNYXRoLm1heCgxLCB3aWR0aCl9cHhgO1xuICAgICAgICAgICAgICAgICQucHJldmlld1N0YWdlLnN0eWxlLmhlaWdodCA9IGAke01hdGgubWF4KDEsIGhlaWdodCl9cHhgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCQucHJldmlld092ZXJsYXkpIHtcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdPdmVybGF5LnN0eWxlLndpZHRoID0gYCR7TWF0aC5tYXgoMSwgd2lkdGgpfXB4YDtcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdPdmVybGF5LnN0eWxlLmhlaWdodCA9IGAke01hdGgubWF4KDEsIGhlaWdodCl9cHhgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW1hZ2VEYXRhID0gU3RyaW5nKHByZXZpZXcucHJldmlld0ltYWdlRGF0YVVybCB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCBpbWFnZVNvdXJjZSA9IHByZXZpZXdJbWFnZVVybCB8fCBpbWFnZURhdGE7XG4gICAgICAgICAgICBpZiAoJC5wcmV2aWV3SW1hZ2UpIHtcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdJbWFnZS5oaWRkZW4gPSAhaW1hZ2VTb3VyY2U7XG4gICAgICAgICAgICAgICAgJC5wcmV2aWV3SW1hZ2Uub25sb2FkID0gKCkgPT4gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZpdFByZXZpZXcpO1xuICAgICAgICAgICAgICAgICQucHJldmlld0ltYWdlLnNyYyA9IGltYWdlU291cmNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCQucHJldmlld1BsYWNlaG9sZGVyKSB7XG4gICAgICAgICAgICAgICAgJC5wcmV2aWV3UGxhY2Vob2xkZXIuaGlkZGVuID0gISFpbWFnZVNvdXJjZTtcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdQbGFjZWhvbGRlci50ZXh0Q29udGVudCA9IGltYWdlU291cmNlID8gJycgOiAn5b2T5YmNIEpTT04g5LiN5ZCr5pW05bin6aKE6KeI5Zu+JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNldFByZXZpZXdTdGF0ZSgncmVhZHknKTtcbiAgICAgICAgICAgIHNldFByZXZpZXdUb29sc0VuYWJsZWQodHJ1ZSk7XG4gICAgICAgICAgICByZW5kZXJPdmVybGF5KCk7XG4gICAgICAgICAgICByZW5kZXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIGlmICghaW1hZ2VTb3VyY2UpIHJlcXVlc3RBbmltYXRpb25GcmFtZShmaXRQcmV2aWV3KTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBsb2FkSnNvbkludGVybmFsID0gYXN5bmMgKHByZXNldFBhdGg/OiBzdHJpbmcsIHNpbGVudCA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gICAgICAgICAgICBpZiAoZGlzcG9zZWQgfHwgKHByZXZpZXdMb2FkaW5nICYmICFwcmVzZXRQYXRoKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgcmVxdWVzdFBhdGggPSBub3JtYWxpemVDdXJyZW50SnNvblBhdGgocHJlc2V0UGF0aCk7XG4gICAgICAgICAgICBpZiAocmVxdWVzdFBhdGgpIHNlbGVjdGVkSnNvblBhdGggPSByZXF1ZXN0UGF0aDtcbiAgICAgICAgICAgIGNvbnN0IHJldmlzaW9uID0gKytsb2FkUmV2aXNpb247XG4gICAgICAgICAgICBwcmV2aWV3TG9hZGluZyA9IHRydWU7XG4gICAgICAgICAgICBjbGVhclByZXZpZXdTdGF0ZSgpO1xuICAgICAgICAgICAgY2xlYXJNYXBwaW5nU3VyZmFjZSgn5q2j5Zyo5omr5o+P5b2T5YmNIEpTT04g55qE57uE5Lu2Li4uJywgJ+ato+WcqOWKoOi9vee7hOS7tuS4juaYoOWwhC4uLicpO1xuICAgICAgICAgICAgaWYgKCQuYnJvd3NlQnRuKSAkLmJyb3dzZUJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAoJC5jbGVhckJ0bikgJC5jbGVhckJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAoJC5tYXBwaW5nUmVmcmVzaEJ0bikgJC5tYXBwaW5nUmVmcmVzaEJ0bi5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAoJC5pbXBvcnRCdG4pICQuaW1wb3J0QnRuLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmICghc2lsZW50KSBzZXRTdGF0dXMocmVxdWVzdFBhdGggPyAn5q2j5Zyo5Yqg6L2955S75p2/6aKE6KeILi4uJyA6ICfpgInmi6kgSlNPTiDmlofku7YuLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBBbiBlbXB0eSByZXF1ZXN0IHBhdGggaXMgaW50ZW50aW9uYWw6IHRoZSBtYWluIHByb2Nlc3Mgb3BlbnMgdGhlIEpTT04gcGlja2VyLlxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0gYXdhaXQgUkVRKCdsb2FkLWpzb24tcHJldmlldy1iZXRhJywgcmVxdWVzdFBhdGgsIHRydWUsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICBpZiAoZGlzcG9zZWQgfHwgcmV2aXNpb24gIT09IGxvYWRSZXZpc2lvbikgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSB8fCAhcmVzdWx0LmRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2FuY2VsZWQgPSByZXN1bHQgJiYgU3RyaW5nKHJlc3VsdC5lcnJvciB8fCAnJykudG9Mb3dlckNhc2UoKSA9PT0gJ2NhbmNlbGVkJztcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJNYXBwaW5nU3VyZmFjZShjYW5jZWxlZCA/ICfmnKrovb3lhaXmlrDnmoQgSlNPTicgOiAnSlNPTiDml6Dms5Xor7vlj5bvvIzmnKrliqDovb3nu4Tku7blgJnpgIknKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjYW5jZWxlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0UHJldmlld1N0YXRlKCdlcnJvcicsICdKU09OIOaXoOazleivu+WPluaIluagvOW8j+aXoOaViCcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgc2V0U3RhdHVzKGBKU09OIOivu+WPluWksei0pe+8miR7cmVzdWx0ICYmIHJlc3VsdC5lcnJvciB8fCAn5pyq55+l6ZSZ6K+vJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghc2lsZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ+W3suWPlua2iOmAieaLqeOAgicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwcmV2aWV3RGF0YSA9IHJlc3VsdC5kYXRhIGFzIEpzb25QcmV2aWV3O1xuICAgICAgICAgICAgICAgIGF3YWl0IGVuc3VyZVByZXZpZXdJbWFnZVVybChTdHJpbmcocHJldmlld0RhdGEucHJldmlld0ltYWdlRGF0YVVybCB8fCAnJykpO1xuICAgICAgICAgICAgICAgIGlmIChkaXNwb3NlZCB8fCByZXZpc2lvbiAhPT0gbG9hZFJldmlzaW9uKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgYXdhaXQgcmVtZW1iZXJKc29uUGF0aChub3JtYWxpemVDdXJyZW50SnNvblBhdGgocHJldmlld0RhdGEuZmlsZVBhdGggfHwgc2VsZWN0ZWRKc29uUGF0aCkpO1xuICAgICAgICAgICAgICAgIGlmIChkaXNwb3NlZCB8fCByZXZpc2lvbiAhPT0gbG9hZFJldmlzaW9uKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmVuZGVyUHJldmlldyhwcmV2aWV3RGF0YSk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2Nhbm5lZDogYW55ID0gYXdhaXQgUkVRKCdzY2FuLWNvbXBvbmVudC1pZGVudGl0aWVzLWZyb20tanNvbicsIHNlbGVjdGVkSnNvblBhdGgpO1xuICAgICAgICAgICAgICAgIGlmIChkaXNwb3NlZCB8fCByZXZpc2lvbiAhPT0gbG9hZFJldmlzaW9uKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKCFzY2FubmVkIHx8IHNjYW5uZWQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJNYXBwaW5nU3VyZmFjZSgn57uE5Lu25omr5o+P5aSx6LSl77yM5pyq5Yqg6L295LiK5LiA5Lu9IEpTT04g55qE5YCZ6YCJJywgJ+e7hOS7tuaJq+aPj+Wksei0pScpO1xuICAgICAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOmihOiniOW3suWKoOi9ve+8jOe7hOS7tuaJq+aPj+Wksei0pe+8miR7c2Nhbm5lZCAmJiBzY2FubmVkLmVycm9yIHx8ICfmnKrnn6XplJnor68nfWAsICd3YXJuJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgbWFwcGluZ3NMb2FkZWQgPSBhd2FpdCBsb2FkTWFwcGluZ3MocmV2aXNpb24pO1xuICAgICAgICAgICAgICAgIGlmIChkaXNwb3NlZCB8fCByZXZpc2lvbiAhPT0gbG9hZFJldmlzaW9uKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKCFtYXBwaW5nc0xvYWRlZCkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg6aKE6KeI5bCx57uq77yaJHtiYXNlbmFtZShzZWxlY3RlZEpzb25QYXRoKX3vvIzlj6/osIPmlbTnu4Tku7bmmKDlsITlkI7lrozmlbTlr7zlhaXjgIJgLCAnb2snKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBpZiAocmV2aXNpb24gIT09IGxvYWRSZXZpc2lvbikgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIHNldFByZXZpZXdTdGF0ZSgnZXJyb3InLCAnSlNPTiDml6Dms5Xor7vlj5bmiJbmoLzlvI/ml6DmlYgnKTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYEpTT04g6K+75Y+W5byC5bi477yaJHtlcnJvciAmJiBlcnJvci5tZXNzYWdlIHx8IGVycm9yfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgaWYgKHJldmlzaW9uID09PSBsb2FkUmV2aXNpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlld0xvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCQuYnJvd3NlQnRuKSAkLmJyb3dzZUJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAoJC5jbGVhckJ0bikgJC5jbGVhckJ0bi5kaXNhYmxlZCA9ICFzZWxlY3RlZEpzb25QYXRoO1xuICAgICAgICAgICAgICAgICAgICBpZiAoJC5tYXBwaW5nUmVmcmVzaEJ0bikgJC5tYXBwaW5nUmVmcmVzaEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBpZiAoJC5pbXBvcnRCdG4pICQuaW1wb3J0QnRuLmRpc2FibGVkID0gIXNlbGVjdGVkSnNvblBhdGggfHwgIWxhc3RQcmV2aWV3O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBsb2FkSnNvbiA9IChwcmVzZXRQYXRoPzogc3RyaW5nLCBzaWxlbnQgPSBmYWxzZSk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICAgICAgICAgICAgY29uc3QgcmVxdWVzdFBhdGggPSBub3JtYWxpemVDdXJyZW50SnNvblBhdGgocHJlc2V0UGF0aCk7XG4gICAgICAgICAgICBpZiAocmVxdWVzdFBhdGggJiYgYWN0aXZlTG9hZFByb21pc2UgJiYgYWN0aXZlTG9hZFBhdGggPT09IHJlcXVlc3RQYXRoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFjdGl2ZUxvYWRQcm9taXNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcHJvbWlzZSA9IGxvYWRKc29uSW50ZXJuYWwocHJlc2V0UGF0aCwgc2lsZW50KTtcbiAgICAgICAgICAgIGFjdGl2ZUxvYWRQYXRoID0gcmVxdWVzdFBhdGg7XG4gICAgICAgICAgICBhY3RpdmVMb2FkUHJvbWlzZSA9IHByb21pc2U7XG4gICAgICAgICAgICB2b2lkIHByb21pc2UudGhlbihcbiAgICAgICAgICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3RpdmVMb2FkUHJvbWlzZSA9PT0gcHJvbWlzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlTG9hZFBhdGggPSAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZUxvYWRQcm9taXNlID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWN0aXZlTG9hZFByb21pc2UgPT09IHByb21pc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZUxvYWRQYXRoID0gJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3RpdmVMb2FkUHJvbWlzZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG9wZW5TZWN0aW9uID0gKHNlY3Rpb24gPSAnJykgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gc2VjdGlvbiA9PT0gJ21hcHBpbmcnID8gJC5tYXBwaW5nU2VjdGlvbiA6ICQucHJldmlld1NlY3Rpb247XG4gICAgICAgICAgICBpZiAodGFyZ2V0ICYmIHR5cGVvZiB0YXJnZXQuc2Nyb2xsSW50b1ZpZXcgPT09ICdmdW5jdGlvbicpIHRhcmdldC5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmVmcmVzaFNldHRpbmdzV29ya3NwYWNlUGF0aCA9ICgpID0+IHtcbiAgICAgICAgICAgIHZvaWQgcmVhZEN1cnJlbnRKc29uUGF0aCgpLnRoZW4oKGZpbGVQYXRoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGRpc3Bvc2VkKSByZXR1cm47XG4gICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUN1cnJlbnRKc29uUGF0aChmaWxlUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFub3JtYWxpemVkIHx8IG5vcm1hbGl6ZWQgPT09IHNlbGVjdGVkSnNvblBhdGgpIHJldHVybjtcbiAgICAgICAgICAgICAgICB2b2lkIGxvYWRKc29uKG5vcm1hbGl6ZWQsIHRydWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgdXBkYXRlU2V0dGluZ3NXb3JrYmVuY2ggPSAob3B0aW9ucz86IFdvcmtiZW5jaE9wZW5PcHRpb25zKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBoYXNKc29uUGF0aCA9ICEhb3B0aW9ucyAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywgJ2pzb25QYXRoJyk7XG4gICAgICAgICAgICBjb25zdCBuZXh0UGF0aCA9IG5vcm1hbGl6ZUN1cnJlbnRKc29uUGF0aChvcHRpb25zICYmIG9wdGlvbnMuanNvblBhdGgpO1xuICAgICAgICAgICAgY29uc3QgbG9hZCA9IGhhc0pzb25QYXRoICYmIG5leHRQYXRoXG4gICAgICAgICAgICAgICAgPyBsb2FkSnNvbihuZXh0UGF0aCwgISEob3B0aW9ucyAmJiBvcHRpb25zLnNvdXJjZSA9PT0gJ2ZpZ21hLXB1c2gnKSlcbiAgICAgICAgICAgICAgICA6IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcbiAgICAgICAgICAgIHJldHVybiBsb2FkLnRoZW4oKGxvYWRlZCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiBvcGVuU2VjdGlvbihTdHJpbmcob3B0aW9ucyAmJiBvcHRpb25zLnNlY3Rpb24gfHwgJycpKSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGxvYWRlZDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHNldHVwTWFwcGluZ1Jlc2l6ZSA9ICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmtzcGFjZSA9ICQud29ya3NwYWNlU3BsaXQ7XG4gICAgICAgICAgICBjb25zdCBzcGxpdHRlciA9ICQubWFwcGluZ1NwbGl0dGVyO1xuICAgICAgICAgICAgaWYgKCF3b3Jrc3BhY2UgfHwgIXNwbGl0dGVyKSByZXR1cm47XG4gICAgICAgICAgICBsZXQgcmVzaXppbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCBwb2ludGVySWQgPSAtMTtcblxuICAgICAgICAgICAgY29uc3QgcmVhZFN0b3JlZFdpZHRoID0gKCk6IG51bWJlciA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBOdW1iZXIod2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKE1BUFBJTkdfV0lEVEhfS0VZKSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID4gMCA/IHZhbHVlIDogREVGQVVMVF9NQVBQSU5HX1dJRFRIO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gREVGQVVMVF9NQVBQSU5HX1dJRFRIO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IG1heFdpZHRoRm9yV29ya3NwYWNlID0gKCk6IG51bWJlciA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgYXZhaWxhYmxlID0gd29ya3NwYWNlLmNsaWVudFdpZHRoO1xuICAgICAgICAgICAgICAgIGlmICghYXZhaWxhYmxlKSByZXR1cm4gTUFYX01BUFBJTkdfV0lEVEg7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KFxuICAgICAgICAgICAgICAgICAgICBNSU5fTUFQUElOR19XSURUSCxcbiAgICAgICAgICAgICAgICAgICAgTWF0aC5taW4oTUFYX01BUFBJTkdfV0lEVEgsIGF2YWlsYWJsZSAtIE1JTl9QUkVWSUVXX1dJRFRIIC0gTUFQUElOR19TUExJVFRFUl9XSURUSCksXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGFwcGx5V2lkdGggPSAocmVxdWVzdGVkOiBudW1iZXIsIHBlcnNpc3QgPSBmYWxzZSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHdpZHRoID0gY2xhbXAocmVxdWVzdGVkLCBNSU5fTUFQUElOR19XSURUSCwgbWF4V2lkdGhGb3JXb3Jrc3BhY2UoKSk7XG4gICAgICAgICAgICAgICAgd29ya3NwYWNlLnN0eWxlLnNldFByb3BlcnR5KCctLW1hcHBpbmctd2lkdGgnLCBgJHtNYXRoLnJvdW5kKHdpZHRoKX1weGApO1xuICAgICAgICAgICAgICAgIHNwbGl0dGVyLnNldEF0dHJpYnV0ZSgnYXJpYS12YWx1ZW5vdycsIFN0cmluZyhNYXRoLnJvdW5kKHdpZHRoKSkpO1xuICAgICAgICAgICAgICAgIGlmIChwZXJzaXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7IHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShNQVBQSU5HX1dJRFRIX0tFWSwgU3RyaW5nKE1hdGgucm91bmQod2lkdGgpKSk7IH0gY2F0Y2ggeyAvKiBvcHRpb25hbCBwcmVmZXJlbmNlICovIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCB3aWR0aEZyb21Qb2ludGVyID0gKGNsaWVudFg6IG51bWJlcik6IG51bWJlciA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVjdCA9IHdvcmtzcGFjZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjdC5yaWdodCAtIGNsaWVudFg7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zdCBzdG9wUmVzaXplID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghcmVzaXppbmcpIHJldHVybjtcbiAgICAgICAgICAgICAgICByZXNpemluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNwbGl0dGVyLmRhdGFzZXQuZHJhZ2dpbmcgPSAnZmFsc2UnO1xuICAgICAgICAgICAgICAgIGlmIChwb2ludGVySWQgPj0gMCAmJiBzcGxpdHRlci5oYXNQb2ludGVyQ2FwdHVyZShwb2ludGVySWQpKSBzcGxpdHRlci5yZWxlYXNlUG9pbnRlckNhcHR1cmUocG9pbnRlcklkKTtcbiAgICAgICAgICAgICAgICBwb2ludGVySWQgPSAtMTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IG9uUG9pbnRlck1vdmUgPSAoZXZlbnQ6IFBvaW50ZXJFdmVudCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghcmVzaXppbmcgfHwgKHBvaW50ZXJJZCA+PSAwICYmIGV2ZW50LnBvaW50ZXJJZCAhPT0gcG9pbnRlcklkKSkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgYXBwbHlXaWR0aCh3aWR0aEZyb21Qb2ludGVyKGV2ZW50LmNsaWVudFgpKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBvblBvaW50ZXJVcCA9IChldmVudDogUG9pbnRlckV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXNpemluZykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmIChwb2ludGVySWQgPj0gMCAmJiBldmVudC5wb2ludGVySWQgIT09IHBvaW50ZXJJZCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBOdW1iZXIoc3BsaXR0ZXIuZ2V0QXR0cmlidXRlKCdhcmlhLXZhbHVlbm93JykpIHx8IERFRkFVTFRfTUFQUElOR19XSURUSDtcbiAgICAgICAgICAgICAgICBhcHBseVdpZHRoKGN1cnJlbnQsIHRydWUpO1xuICAgICAgICAgICAgICAgIHN0b3BSZXNpemUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBvblBvaW50ZXJEb3duID0gKGV2ZW50OiBQb2ludGVyRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm47XG4gICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICByZXNpemluZyA9IHRydWU7XG4gICAgICAgICAgICAgICAgcG9pbnRlcklkID0gZXZlbnQucG9pbnRlcklkO1xuICAgICAgICAgICAgICAgIHNwbGl0dGVyLmRhdGFzZXQuZHJhZ2dpbmcgPSAndHJ1ZSc7XG4gICAgICAgICAgICAgICAgc3BsaXR0ZXIuc2V0UG9pbnRlckNhcHR1cmUoZXZlbnQucG9pbnRlcklkKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCBvbktleURvd24gPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gTnVtYmVyKHNwbGl0dGVyLmdldEF0dHJpYnV0ZSgnYXJpYS12YWx1ZW5vdycpKSB8fCBERUZBVUxUX01BUFBJTkdfV0lEVEg7XG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlXaWR0aChjdXJyZW50ICsgMTYsIHRydWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnQXJyb3dSaWdodCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlXaWR0aChjdXJyZW50IC0gMTYsIHRydWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnSG9tZScpIHtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlXaWR0aChNSU5fTUFQUElOR19XSURUSCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICdFbmQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5V2lkdGgoTUFYX01BUFBJTkdfV0lEVEgsIHRydWUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInIHx8IGV2ZW50LmtleSA9PT0gJyAnKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5V2lkdGgoREVGQVVMVF9NQVBQSU5HX1dJRFRILCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgY29uc3Qgb25SZXNpemUgPSAoKSA9PiBhcHBseVdpZHRoKE51bWJlcihzcGxpdHRlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtdmFsdWVub3cnKSkgfHwgREVGQVVMVF9NQVBQSU5HX1dJRFRILCBmYWxzZSk7XG5cbiAgICAgICAgICAgIHNwbGl0dGVyLmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJkb3duJywgb25Qb2ludGVyRG93bik7XG4gICAgICAgICAgICBzcGxpdHRlci5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25LZXlEb3duKTtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybW92ZScsIG9uUG9pbnRlck1vdmUsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgb25Qb2ludGVyVXApO1xuICAgICAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJjYW5jZWwnLCBvblBvaW50ZXJVcCk7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgb25SZXNpemUpO1xuICAgICAgICAgICAgYXBwbHlXaWR0aChyZWFkU3RvcmVkV2lkdGgoKSwgZmFsc2UpO1xuXG4gICAgICAgICAgICBkaXNwb3NlTWFwcGluZ1Jlc2l6ZSA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICBzdG9wUmVzaXplKCk7XG4gICAgICAgICAgICAgICAgc3BsaXR0ZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcigncG9pbnRlcmRvd24nLCBvblBvaW50ZXJEb3duKTtcbiAgICAgICAgICAgICAgICBzcGxpdHRlci5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25LZXlEb3duKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncG9pbnRlcm1vdmUnLCBvblBvaW50ZXJNb3ZlKTtcbiAgICAgICAgICAgICAgICB3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgb25Qb2ludGVyVXApO1xuICAgICAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdwb2ludGVyY2FuY2VsJywgb25Qb2ludGVyVXApO1xuICAgICAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdyZXNpemUnLCBvblJlc2l6ZSk7XG4gICAgICAgICAgICAgICAgZGlzcG9zZU1hcHBpbmdSZXNpemUgPSBudWxsO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICAgICAgc2V0dXBNYXBwaW5nUmVzaXplKCk7XG5cbiAgICAgICAgaWYgKCQuYnJvd3NlQnRuKSAkLmJyb3dzZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGxvYWRKc29uKCkpO1xuICAgICAgICBpZiAoJC5kcm9wWm9uZSkge1xuICAgICAgICAgICAgJC5kcm9wWm9uZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGxvYWRKc29uKCkpO1xuICAgICAgICAgICAgJC5kcm9wWm9uZS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VudGVyJyB8fCBldmVudC5rZXkgPT09ICcgJykge1xuICAgICAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgICAgICB2b2lkIGxvYWRKc29uKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLmRyb3Bab25lLmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgKGV2ZW50OiBEcmFnRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIGlmIChldmVudC5kYXRhVHJhbnNmZXIpIGV2ZW50LmRhdGFUcmFuc2Zlci5kcm9wRWZmZWN0ID0gJ2NvcHknO1xuICAgICAgICAgICAgICAgIGlmICgkLmRyb3Bab25lKSAkLmRyb3Bab25lLmRhdGFzZXQuZHJhZ2dpbmcgPSAndHJ1ZSc7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQuZHJvcFpvbmUuYWRkRXZlbnRMaXN0ZW5lcignZHJhZ2xlYXZlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICgkLmRyb3Bab25lKSBkZWxldGUgJC5kcm9wWm9uZS5kYXRhc2V0LmRyYWdnaW5nO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLmRyb3Bab25lLmFkZEV2ZW50TGlzdGVuZXIoJ2Ryb3AnLCAoZXZlbnQ6IERyYWdFdmVudCkgPT4ge1xuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgaWYgKCQuZHJvcFpvbmUpIGRlbGV0ZSAkLmRyb3Bab25lLmRhdGFzZXQuZHJhZ2dpbmc7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBldmVudC5kYXRhVHJhbnNmZXIgJiYgZXZlbnQuZGF0YVRyYW5zZmVyLmZpbGVzO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGUgPSBmaWxlcyAmJiBmaWxlcy5sZW5ndGggPiAwID8gZmlsZXNbMF0gOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gZmlsZSA/IGdldERyb3BwZWRGaWxlUGF0aChmaWxlKSA6ICcnO1xuICAgICAgICAgICAgICAgIGlmICghZmlsZVBhdGggfHwgIWZpbGVQYXRoLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoJy5qc29uJykpIHtcbiAgICAgICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfor7fmi5blhaXkuIDkuKrmnKzlnLAgSlNPTiDmlofku7bjgIInLCAnd2FybicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZvaWQgbG9hZEpzb24oZmlsZVBhdGgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCQuY2xlYXJCdG4pICQuY2xlYXJCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGVhcmVkUGF0aCA9IHNlbGVjdGVkSnNvblBhdGg7XG4gICAgICAgICAgICBjbGVhckpzb24oKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKExBU1RfSlNPTl9LRVkpO1xuICAgICAgICAgICAgfSBjYXRjaCB7IC8qIFByb2plY3QgcHJvZmlsZSByZW1haW5zIHRoZSBzb3VyY2Ugb2YgdHJ1dGguICovIH1cbiAgICAgICAgICAgIHNldFN0YXR1cygn5q2j5Zyo5riF6Zmk5b2T5YmNIEpTT04uLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IGF3YWl0IFJFUSgnY2xlYXItY3VycmVudC1qc29uLXBhdGgnLCBjbGVhcmVkUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKHNlbGVjdGVkSnNvblBhdGgpIHJldHVybjtcbiAgICAgICAgICAgICAgICBjb25zdCBjbGVhcmVkID0gISEocmVzdWx0ICYmIHJlc3VsdC5kYXRhICYmIHJlc3VsdC5kYXRhLmNsZWFyZWQpO1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhjbGVhcmVkID8gJ+W9k+WJjSBKU09OIOW3sua4hemZpOOAgicgOiAn5bey5L+d55WZ5Yia5pS25Yiw55qE5paw5o6o6YCB44CCJywgY2xlYXJlZCA/ICdpbmZvJyA6ICdvaycpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIGlmICghc2VsZWN0ZWRKc29uUGF0aCkgc2V0U3RhdHVzKGBKU09OIOa4hemZpOWksei0pe+8miR7ZXJyb3IgJiYgZXJyb3IubWVzc2FnZSB8fCBlcnJvcn1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmICgkLnJlbG9hZFByZXZpZXdCdG4pICQucmVsb2FkUHJldmlld0J0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGlmIChzZWxlY3RlZEpzb25QYXRoKSB2b2lkIGxvYWRKc29uKHNlbGVjdGVkSnNvblBhdGgpO1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCQuem9vbU91dEJ0bikgJC56b29tT3V0QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gem9vbUF0KHpvb20gLyAxLjIpKTtcbiAgICAgICAgaWYgKCQuem9vbUluQnRuKSAkLnpvb21JbkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHpvb21BdCh6b29tICogMS4yKSk7XG4gICAgICAgIGlmICgkLmFjdHVhbFNpemVCdG4pICQuYWN0dWFsU2l6ZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHNob3dBY3R1YWxTaXplKTtcbiAgICAgICAgaWYgKCQuZml0UHJldmlld0J0bikgJC5maXRQcmV2aWV3QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZml0UHJldmlldyk7XG4gICAgICAgIGlmICgkLnByZXZpZXdWaWV3cG9ydCkge1xuICAgICAgICAgICAgJC5wcmV2aWV3Vmlld3BvcnQuYWRkRXZlbnRMaXN0ZW5lcignd2hlZWwnLCAoZXZlbnQ6IFdoZWVsRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIWxhc3RQcmV2aWV3KSByZXR1cm47XG4gICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICB6b29tQXQoem9vbSAqIChldmVudC5kZWx0YVkgPCAwID8gMS4xMiA6IDEgLyAxLjEyKSwgZXZlbnQuY2xpZW50WCwgZXZlbnQuY2xpZW50WSk7XG4gICAgICAgICAgICB9LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xuICAgICAgICAgICAgJC5wcmV2aWV3Vmlld3BvcnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFsYXN0UHJldmlldykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRlck1vZGUgPSAncGFuJztcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRlclN0YXJ0Q2xpZW50ID0geyB4OiBldmVudC5jbGllbnRYLCB5OiBldmVudC5jbGllbnRZIH07XG4gICAgICAgICAgICAgICAgICAgIHBvaW50ZXJTdGFydFBhbiA9IHsgeDogcGFuWCwgeTogcGFuWSB9O1xuICAgICAgICAgICAgICAgICAgICBpZiAoJC5wcmV2aWV3Vmlld3BvcnQpICQucHJldmlld1ZpZXdwb3J0LmRhdGFzZXQucGFubmluZyA9ICd0cnVlJztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQuYnV0dG9uICE9PSAwKSByZXR1cm47XG4gICAgICAgICAgICAgICAgY29uc3QgcG9pbnQgPSBjYW52YXNQb2ludEZyb21Nb3VzZShldmVudCk7XG4gICAgICAgICAgICAgICAgaWYgKCFwb2ludCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHBvaW50ZXJNb2RlID0gJ3NlbGVjdCc7XG4gICAgICAgICAgICAgICAgcG9pbnRlclN0YXJ0Q2FudmFzID0gcG9pbnQ7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uUmVjdCA9IHsgeDogcG9pbnQueCwgeTogcG9pbnQueSwgd2lkdGg6IDAsIGhlaWdodDogMCB9O1xuICAgICAgICAgICAgICAgIHNlbGVjdGlvbkhpdHMgPSBbXTtcbiAgICAgICAgICAgICAgICBzdXBwcmVzc1ByZXZpZXdDbGljayA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJlbmRlck92ZXJsYXkoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgJC5wcmV2aWV3Vmlld3BvcnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHBvaW50ZXJNb2RlID09PSAncGFuJyAmJiBwb2ludGVyU3RhcnRDbGllbnQgJiYgcG9pbnRlclN0YXJ0UGFuKSB7XG4gICAgICAgICAgICAgICAgICAgIHBhblggPSBwb2ludGVyU3RhcnRQYW4ueCArIGV2ZW50LmNsaWVudFggLSBwb2ludGVyU3RhcnRDbGllbnQueDtcbiAgICAgICAgICAgICAgICAgICAgcGFuWSA9IHBvaW50ZXJTdGFydFBhbi55ICsgZXZlbnQuY2xpZW50WSAtIHBvaW50ZXJTdGFydENsaWVudC55O1xuICAgICAgICAgICAgICAgICAgICBhcHBseVByZXZpZXdUcmFuc2Zvcm0oKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocG9pbnRlck1vZGUgIT09ICdzZWxlY3QnIHx8ICFwb2ludGVyU3RhcnRDYW52YXMpIHJldHVybjtcbiAgICAgICAgICAgICAgICBjb25zdCBwb2ludCA9IGNhbnZhc1BvaW50RnJvbU1vdXNlKGV2ZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoIXBvaW50KSByZXR1cm47XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uUmVjdCA9IHJlY3RGcm9tUG9pbnRzKHBvaW50ZXJTdGFydENhbnZhcywgcG9pbnQpO1xuICAgICAgICAgICAgICAgIGlmIChzZWxlY3Rpb25SZWN0LndpZHRoID4gMyAvIHpvb20gfHwgc2VsZWN0aW9uUmVjdC5oZWlnaHQgPiAzIC8gem9vbSkgc3VwcHJlc3NQcmV2aWV3Q2xpY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlbmRlck92ZXJsYXkoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgZmluaXNoUG9pbnRlciA9IChldmVudDogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChwb2ludGVyTW9kZSA9PT0gJ3BhbicpIHtcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRlck1vZGUgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgICAgIHBvaW50ZXJTdGFydENsaWVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHBvaW50ZXJTdGFydFBhbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGlmICgkLnByZXZpZXdWaWV3cG9ydCkgZGVsZXRlICQucHJldmlld1ZpZXdwb3J0LmRhdGFzZXQucGFubmluZztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocG9pbnRlck1vZGUgIT09ICdzZWxlY3QnIHx8ICFwb2ludGVyU3RhcnRDYW52YXMpIHJldHVybjtcbiAgICAgICAgICAgICAgICBjb25zdCBwb2ludCA9IGNhbnZhc1BvaW50RnJvbU1vdXNlKGV2ZW50KSB8fCBwb2ludGVyU3RhcnRDYW52YXM7XG4gICAgICAgICAgICAgICAgY29uc3QgY29tcGxldGVkID0gcmVjdEZyb21Qb2ludHMocG9pbnRlclN0YXJ0Q2FudmFzLCBwb2ludCk7XG4gICAgICAgICAgICAgICAgcG9pbnRlck1vZGUgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgcG9pbnRlclN0YXJ0Q2FudmFzID0gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoY29tcGxldGVkLndpZHRoIDw9IDMgLyB6b29tICYmIGNvbXBsZXRlZC5oZWlnaHQgPD0gMyAvIHpvb20pIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uUmVjdCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlck92ZXJsYXkoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZWxlY3Rpb25SZWN0ID0gY29tcGxldGVkO1xuICAgICAgICAgICAgICAgIGNvbnN0IGhpdHMgPSBsYXN0UHJldmlldyAmJiBBcnJheS5pc0FycmF5KGxhc3RQcmV2aWV3LmhpdHMpID8gbGFzdFByZXZpZXcuaGl0cyA6IFtdO1xuICAgICAgICAgICAgICAgIHNlbGVjdGlvbkhpdHMgPSBoaXRzLmZpbHRlcigoaGl0KSA9PiBpbnRlcnNlY3Rpb25BcmVhKGhpdCwgY29tcGxldGVkKSA+IDAuNSk7XG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0ZWRSZWN0cyA9IHNlbGVjdGlvbkhpdHMuc2xpY2UoMCwgMTIwKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjb21wb25lbnRIaXQgPSBzZWxlY3Rpb25IaXRzLmZpbmQoKGhpdCkgPT4gISFTdHJpbmcoaGl0LmNvbXBvbmVudEtleSB8fCAnJykpO1xuICAgICAgICAgICAgICAgIHNlbGVjdGVkQ29tcG9uZW50SWRlbnRpdHkgPSBjb21wb25lbnRIaXQgPyBpZGVudGl0eUZyb21IaXQoY29tcG9uZW50SGl0KSA6IG51bGw7XG4gICAgICAgICAgICAgICAgcmVuZGVyT3ZlcmxheSgpO1xuICAgICAgICAgICAgICAgIHJlbmRlclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgIHJlbmRlck1hcHBpbmdzKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgJC5wcmV2aWV3Vmlld3BvcnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGZpbmlzaFBvaW50ZXIpO1xuICAgICAgICAgICAgJC5wcmV2aWV3Vmlld3BvcnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIGZpbmlzaFBvaW50ZXIpO1xuICAgICAgICAgICAgJC5wcmV2aWV3Vmlld3BvcnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoc3VwcHJlc3NQcmV2aWV3Q2xpY2spIHtcbiAgICAgICAgICAgICAgICAgICAgc3VwcHJlc3NQcmV2aWV3Q2xpY2sgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwb2ludCA9IGNhbnZhc1BvaW50RnJvbU1vdXNlKGV2ZW50KTtcbiAgICAgICAgICAgICAgICBpZiAocG9pbnQpIHNlbGVjdEF0UG9pbnQocG9pbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCQuc2VsZWN0aW9uSGl0cykgJC5zZWxlY3Rpb25IaXRzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgICAgICBjb25zdCBidXR0b24gPSB0YXJnZXQuY2xvc2VzdCgnW2RhdGEtaGl0LWluZGV4XScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgICAgIGlmICghYnV0dG9uKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBoaXQgPSBzZWxlY3Rpb25IaXRzW051bWJlcihidXR0b24uZGF0YXNldC5oaXRJbmRleCldO1xuICAgICAgICAgICAgaWYgKCFoaXQpIHJldHVybjtcbiAgICAgICAgICAgIGhpZ2hsaWdodGVkUmVjdHMgPSBbaGl0XTtcbiAgICAgICAgICAgIGNvbnN0IGlkZW50aXR5ID0gaWRlbnRpdHlGcm9tSGl0KGhpdCk7XG4gICAgICAgICAgICBzZWxlY3RlZENvbXBvbmVudElkZW50aXR5ID0gaWRlbnRpdHkuY29tcG9uZW50S2V5ID8gaWRlbnRpdHkgOiBudWxsO1xuICAgICAgICAgICAgcmVuZGVyT3ZlcmxheSgpO1xuICAgICAgICAgICAgcmVuZGVyU2VsZWN0aW9uKCk7XG4gICAgICAgICAgICByZW5kZXJNYXBwaW5ncygpO1xuICAgICAgICAgICAgZm9jdXNIaWdobGlnaHRlZFJlY3RzKFtoaXRdKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICgkLmNvbXBvbmVudExpc3QpICQuY29tcG9uZW50TGlzdC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgdW5hc3NpZ25CdXR0b24gPSB0YXJnZXQuY2xvc2VzdCgnW2RhdGEtYWN0aW9uPVwidW5hc3NpZ24tc2xvdFwiXScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgICAgIGlmICh1bmFzc2lnbkJ1dHRvbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNsb3QgPSByZW5kZXJlZEJpbmRpbmdTbG90c1tOdW1iZXIodW5hc3NpZ25CdXR0b24uZGF0YXNldC5iaW5kaW5nSW5kZXgpXTtcbiAgICAgICAgICAgICAgICBpZiAoc2xvdCkgdm9pZCB1bmFzc2lnbkNvbXBvbmVudChzbG90LmNvbXBvbmVudC5jb21wb25lbnRLZXksIHNsb3QudmFyaWFudEZpbHRlcik7XG4gICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRhcmdldC5jbG9zZXN0KCd1aS1hc3NldCcpKSB7XG4gICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY2FyZCA9IHRhcmdldC5jbG9zZXN0KCdbZGF0YS1jb21wb25lbnQtaW5kZXhdJykgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgICAgICAgICAgY29uc3QgaW5kZXggPSBOdW1iZXIoY2FyZCAmJiBjYXJkLmRhdGFzZXQuY29tcG9uZW50SW5kZXgpO1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50ID0gcmVuZGVyZWRDb21wb25lbnRzW2luZGV4XTtcbiAgICAgICAgICAgIGlmICghY29tcG9uZW50KSByZXR1cm47XG4gICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIHNlbGVjdENvbXBvbmVudChjb21wb25lbnQpO1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCQuY29tcG9uZW50TGlzdCkgJC5jb21wb25lbnRMaXN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIChldmVudDogRXZlbnQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gdGFyZ2V0LmNsb3Nlc3QoJ3VpLWFzc2V0W2RhdGEtYmluZGluZy1pbmRleF0nKSBhcyAoSFRNTEVsZW1lbnQgJiB7IHZhbHVlPzogc3RyaW5nOyBkaXNhYmxlZD86IGJvb2xlYW4gfSkgfCBudWxsO1xuICAgICAgICAgICAgaWYgKCFmaWVsZCB8fCBmaWVsZC5kaXNhYmxlZCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3Qgc2xvdCA9IHJlbmRlcmVkQmluZGluZ1Nsb3RzW051bWJlcihmaWVsZC5kYXRhc2V0LmJpbmRpbmdJbmRleCldO1xuICAgICAgICAgICAgaWYgKCFzbG90KSByZXR1cm47XG4gICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYlV1aWQgPSBTdHJpbmcoZmllbGQudmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGZpZWxkLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGZpZWxkLnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAnJyk7XG4gICAgICAgICAgICBjb25zdCBvcGVyYXRpb24gPSBwcmVmYWJVdWlkXG4gICAgICAgICAgICAgICAgPyBhc3NpZ25Db21wb25lbnQoc2xvdC5jb21wb25lbnQsIHNsb3QudmFyaWFudEZpbHRlciwgcHJlZmFiVXVpZClcbiAgICAgICAgICAgICAgICA6IHVuYXNzaWduQ29tcG9uZW50KHNsb3QuY29tcG9uZW50LmNvbXBvbmVudEtleSwgc2xvdC52YXJpYW50RmlsdGVyKTtcbiAgICAgICAgICAgIHZvaWQgb3BlcmF0aW9uLmZpbmFsbHkoKCkgPT4ge1xuICAgICAgICAgICAgICAgIGZpZWxkLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZmllbGQucmVtb3ZlQXR0cmlidXRlKCdkaXNhYmxlZCcpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIHRydWUpO1xuICAgICAgICBpZiAoJC5tYXBwaW5nTGlzdCkgJC5tYXBwaW5nTGlzdC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uID0gdGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLWVudHJ5LWluZGV4XScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgICAgIGlmICghYnV0dG9uKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IG1hcHBpbmdFbnRyaWVzKClbTnVtYmVyKGJ1dHRvbi5kYXRhc2V0LmVudHJ5SW5kZXgpXTtcbiAgICAgICAgICAgIGlmIChlbnRyeSkgdm9pZCB1bmFzc2lnbkNvbXBvbmVudChTdHJpbmcoZW50cnkuY29tcG9uZW50S2V5IHx8ICcnKSwgU3RyaW5nKGVudHJ5LnZhcmlhbnRGaWx0ZXIgfHwgJycpKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmICgkLmNvbXBvbmVudFNlYXJjaCkgJC5jb21wb25lbnRTZWFyY2guYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCByZW5kZXJNYXBwaW5ncyk7XG4gICAgICAgIGlmICgkLmluY2x1ZGVOZXN0ZWQpICQuaW5jbHVkZU5lc3RlZC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCByZW5kZXJNYXBwaW5ncyk7XG4gICAgICAgIGlmICgkLmhpZGVNYXBwZWQpICQuaGlkZU1hcHBlZC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCByZW5kZXJNYXBwaW5ncyk7XG4gICAgICAgIGlmICgkLm1hcHBpbmdSZWZyZXNoQnRuKSAkLm1hcHBpbmdSZWZyZXNoQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFzZWxlY3RlZEpzb25QYXRoKSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfor7flhYjpgInmi6nlvZPliY0gRmlnbWEgSlNPTuOAgicsICd3YXJuJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgcmV2aXNpb24gPSBsb2FkUmV2aXNpb247XG4gICAgICAgICAgICAkLm1hcHBpbmdSZWZyZXNoQnRuIS5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICBjbGVhck1hcHBpbmdTdXJmYWNlKCfmraPlnKjph43mlrDmiavmj4/lvZPliY0gSlNPTiDnmoTnu4Tku7YuLi4nLCAn5q2j5Zyo5Yi35paw57uE5Lu25LiO5pig5bCELi4uJyk7XG4gICAgICAgICAgICBzZXRTdGF0dXMoJ+ato+WcqOmHjeaWsOaJq+aPj+W9k+WJjSBKU09OLi4uJywgJ2luZm8nKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2Nhbm5lZDogYW55ID0gYXdhaXQgUkVRKCdzY2FuLWNvbXBvbmVudC1pZGVudGl0aWVzLWZyb20tanNvbicsIHNlbGVjdGVkSnNvblBhdGgpO1xuICAgICAgICAgICAgICAgIGlmIChyZXZpc2lvbiAhPT0gbG9hZFJldmlzaW9uKSByZXR1cm47XG4gICAgICAgICAgICAgICAgaWYgKCFzY2FubmVkIHx8IHNjYW5uZWQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJNYXBwaW5nU3VyZmFjZSgn57uE5Lu25omr5o+P5aSx6LSl77yM5pyq5L2/55So5pen5YCZ6YCJJywgJ+e7hOS7tuaJq+aPj+Wksei0pScpO1xuICAgICAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOe7hOS7tuaJq+aPj+Wksei0pe+8miR7c2Nhbm5lZCAmJiBzY2FubmVkLmVycm9yIHx8ICfmnKrnn6XplJnor68nfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IG1hcHBpbmdzTG9hZGVkID0gYXdhaXQgbG9hZE1hcHBpbmdzKHJldmlzaW9uKTtcbiAgICAgICAgICAgICAgICBpZiAocmV2aXNpb24gIT09IGxvYWRSZXZpc2lvbiB8fCAhbWFwcGluZ3NMb2FkZWQpIHJldHVybjtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ+e7hOS7tuWAmemAieS4juaYoOWwhOW3suWIt+aWsOOAgicsICdvaycpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIGlmIChyZXZpc2lvbiAhPT0gbG9hZFJldmlzaW9uKSByZXR1cm47XG4gICAgICAgICAgICAgICAgY2xlYXJNYXBwaW5nU3VyZmFjZSgn57uE5Lu25Yi35paw5byC5bi477yM5pyq5L2/55So5pen5YCZ6YCJJywgJ+e7hOS7tuWIt+aWsOWksei0pScpO1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg57uE5Lu25Yi35paw5byC5bi477yaJHtlcnJvciAmJiBlcnJvci5tZXNzYWdlIHx8IGVycm9yfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICBpZiAocmV2aXNpb24gPT09IGxvYWRSZXZpc2lvbikgJC5tYXBwaW5nUmVmcmVzaEJ0biEuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlmICgkLmltcG9ydEJ0bikgJC5pbXBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXNlbGVjdGVkSnNvblBhdGgpIHJldHVybjtcbiAgICAgICAgICAgICQuaW1wb3J0QnRuIS5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgICAgICBzZXRTdGF0dXMoJ+ato+WcqOWujOaVtOWvvOWFpeWIsOW9k+WJjeWcuuaZry4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0gYXdhaXQgUkVRKCdpbXBvcnQtZnJvbS1qc29uJywgc2VsZWN0ZWRKc29uUGF0aCk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5a+85YWl5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICfmnKrnn6XplJnor68nfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSByZXN1bHQuZGF0YSB8fCB7fTtcbiAgICAgICAgICAgICAgICBhd2FpdCBsb2FkTWFwcGluZ3MoKTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOWujOaVtOWvvOWFpeWujOaIkO+8miR7ZGF0YS5yb290TmFtZSB8fCBkYXRhLnJvb3RVdWlkIHx8IGJhc2VuYW1lKHNlbGVjdGVkSnNvblBhdGgpfWAsICdvaycpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5a+85YWl5byC5bi477yaJHtlcnJvciAmJiBlcnJvci5tZXNzYWdlIHx8IGVycm9yfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAkLmltcG9ydEJ0biEuZGlzYWJsZWQgPSAhc2VsZWN0ZWRKc29uUGF0aCB8fCAhbGFzdFByZXZpZXc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoJC5yZXBsYWNlUGFuZWxCdG4pICQucmVwbGFjZVBhbmVsQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBSRVEoJ29wZW4tcmVwbGFjZS1wYW5lbC1iZXRhJywgeyBqc29uUGF0aDogc2VsZWN0ZWRKc29uUGF0aCB9KTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ+mrmOe6p+WxgOmDqOabv+aNouW3suaJk+W8gO+8jOW5tue7p+aJv+W9k+WJjSBKU09O44CCJywgJ29rJyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDpq5jnuqflsYDpg6jmm7/mjaLmiZPlvIDlpLHotKXvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHJlZnJlc2hQdXNoU3RhdGUgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0gYXdhaXQgUkVRKCdnZXQtcHVzaC1zZXJ2ZXItc3RhdHVzJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcnVubmluZyA9ICEhKHJlc3VsdCAmJiByZXN1bHQuZGF0YSAmJiByZXN1bHQuZGF0YS5ydW5uaW5nKTtcbiAgICAgICAgICAgICAgICBpZiAoJC5wdXNoU3RhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgJC5wdXNoU3RhdGUudGV4dENvbnRlbnQgPSBydW5uaW5nID8gJ+i/kOihjOS4rScgOiAn5bey5YGc5q2iJztcbiAgICAgICAgICAgICAgICAgICAgJC5wdXNoU3RhdGUuZGF0YXNldC50b25lID0gcnVubmluZyA/ICdvaycgOiAnb2ZmJztcbiAgICAgICAgICAgICAgICAgICAgaWYgKCQucHVzaFN0YXRlLnBhcmVudEVsZW1lbnQpICQucHVzaFN0YXRlLnBhcmVudEVsZW1lbnQuZGF0YXNldC50b25lID0gcnVubmluZyA/ICdvaycgOiAnb2ZmJztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCQucHVzaFN0YXJ0QnRuKSAkLnB1c2hTdGFydEJ0bi5kaXNhYmxlZCA9IHJ1bm5pbmc7XG4gICAgICAgICAgICAgICAgaWYgKCQucHVzaFN0b3BCdG4pICQucHVzaFN0b3BCdG4uZGlzYWJsZWQgPSAhcnVubmluZztcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIGlmICgkLnB1c2hTdGF0ZSkgJC5wdXNoU3RhdGUudGV4dENvbnRlbnQgPSAn54q25oCB5LiN5Y+v55SoJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCByZW5kZXJEaXJzID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCEkLmRpckxpc3QpIHJldHVybjtcbiAgICAgICAgICAgICQuZGlyTGlzdC5pbm5lckhUTUwgPSBkaXJzLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICAgICAgID8gJzxkaXYgY2xhc3M9XCJlbXB0eVwiPum7mOiupOaJq+aPjyBkYjovL2Fzc2V0czwvZGl2PidcbiAgICAgICAgICAgICAgICA6IGRpcnMubWFwKChkaXIsIGluZGV4KSA9PiBgPGRpdiBjbGFzcz1cImRpci1yb3dcIj48c3BhbiBjbGFzcz1cImRpci11cmxcIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbChkaXIpfVwiPiR7ZXNjYXBlSHRtbChkaXIpfTwvc3Bhbj5gICtcbiAgICAgICAgICAgICAgICAgICAgYDxidXR0b24gY2xhc3M9XCJkaXItcmVtb3ZlXCIgdHlwZT1cImJ1dHRvblwiIGRhdGEtaW5kZXg9XCIke2luZGV4fVwiPuWIoOmZpDwvYnV0dG9uPjwvZGl2PmApLmpvaW4oJycpO1xuICAgICAgICAgICAgJC5kaXJMaXN0LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuZGlyLXJlbW92ZScpLmZvckVhY2goKGJ1dHRvbikgPT4ge1xuICAgICAgICAgICAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSBOdW1iZXIoYnV0dG9uLmRhdGFzZXQuaW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IGRpcnMubGVuZ3RoKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGRpcnMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBhbnkgPSBhd2FpdCBSRVEoJ3NldC1jb21tb24tcmVzb3VyY2UtZGlycycsIGRpcnMpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5kYXRhICYmIEFycmF5LmlzQXJyYXkocmVzdWx0LmRhdGEuZGlycykpIGRpcnMgPSByZXN1bHQuZGF0YS5kaXJzO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJEaXJzKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBsb2FkRGlycyA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBhbnkgPSBhd2FpdCBSRVEoJ2dldC1jb21tb24tcmVzb3VyY2UtZGlycycpO1xuICAgICAgICAgICAgICAgIGRpcnMgPSByZXN1bHQgJiYgcmVzdWx0LmRhdGEgJiYgQXJyYXkuaXNBcnJheShyZXN1bHQuZGF0YS5kaXJzKSA/IHJlc3VsdC5kYXRhLmRpcnMgOiBbXTtcbiAgICAgICAgICAgICAgICByZW5kZXJEaXJzKCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDotYTmupDnm67lvZXor7vlj5blpLHotKXvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKCQucHVzaFN0YXJ0QnRuKSAkLnB1c2hTdGFydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHNldFN0YXR1cygn5ZCv5Yqo5o6o6YCB5pyN5YqhLi4uJywgJ2luZm8nKTtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0gYXdhaXQgUkVRKCdzdGFydC1wdXNoLXNlcnZlcicpO1xuICAgICAgICAgICAgYXdhaXQgcmVmcmVzaFB1c2hTdGF0ZSgpO1xuICAgICAgICAgICAgc2V0U3RhdHVzKHJlc3VsdCAmJiByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UgPyBg5ZCv5Yqo5aSx6LSl77yaJHtyZXN1bHQuZXJyb3IgfHwgJ+acquefpemUmeivryd9YCA6ICfmjqjpgIHmnI3liqHlt7LlkK/liqjjgIInLCByZXN1bHQgJiYgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlID8gJ2Vycm9yJyA6ICdvaycpO1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCQucHVzaFN0b3BCdG4pICQucHVzaFN0b3BCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBzZXRTdGF0dXMoJ+WBnOatouaOqOmAgeacjeWKoS4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IGF3YWl0IFJFUSgnc3RvcC1wdXNoLXNlcnZlcicpO1xuICAgICAgICAgICAgYXdhaXQgcmVmcmVzaFB1c2hTdGF0ZSgpO1xuICAgICAgICAgICAgc2V0U3RhdHVzKHJlc3VsdCAmJiByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UgPyBg5YGc5q2i5aSx6LSl77yaJHtyZXN1bHQuZXJyb3IgfHwgJ+acquefpemUmeivryd9YCA6ICfmjqjpgIHmnI3liqHlt7LlgZzmraLjgIInLCByZXN1bHQgJiYgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlID8gJ2Vycm9yJyA6ICdvaycpO1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKCQuYWRkQnRuKSAkLmFkZEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0gYXdhaXQgUkVRKCdhZGQtY29tbW9uLXJlc291cmNlLWRpcicpO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKHJlc3VsdCAmJiByZXN1bHQuY2FuY2VsZWQgPyAn5bey5Y+W5raI44CCJyA6IGDmt7vliqDlpLHotKXvvJoke3Jlc3VsdCAmJiByZXN1bHQuZXJyb3IgfHwgJ+acquefpemUmeivryd9YCwgcmVzdWx0ICYmIHJlc3VsdC5jYW5jZWxlZCA/ICdpbmZvJyA6ICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRpcnMgPSByZXN1bHQuZGF0YSAmJiBBcnJheS5pc0FycmF5KHJlc3VsdC5kYXRhLmRpcnMpID8gcmVzdWx0LmRhdGEuZGlycyA6IGRpcnM7XG4gICAgICAgICAgICByZW5kZXJEaXJzKCk7XG4gICAgICAgICAgICBzZXRTdGF0dXMoYOW3sua3u+WKoO+8miR7cmVzdWx0LmRhdGEgJiYgcmVzdWx0LmRhdGEuYWRkZWQgfHwgJyd9YCwgJ29rJyk7XG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoJC5yZXNldEJ0bikgJC5yZXNldEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGRpcnMgPSBbJ2RiOi8vYXNzZXRzJ107XG4gICAgICAgICAgICBhd2FpdCBSRVEoJ3NldC1jb21tb24tcmVzb3VyY2UtZGlycycsIGRpcnMpO1xuICAgICAgICAgICAgcmVuZGVyRGlycygpO1xuICAgICAgICAgICAgc2V0U3RhdHVzKCfotYTmupDnm67lvZXlt7LmgaLlpI3kuLogZGI6Ly9hc3NldHPjgIInLCAnb2snKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgYmluZFNpbXBsZUFjdGlvbiA9IChidXR0b246IEhUTUxCdXR0b25FbGVtZW50IHwgdW5kZWZpbmVkLCBtZXNzYWdlOiBzdHJpbmcsIGJ1c3lUZXh0OiBzdHJpbmcsIGFyZ3M6ICgpID0+IGFueVtdID0gKCkgPT4gW10pID0+IHtcbiAgICAgICAgICAgIGlmICghYnV0dG9uKSByZXR1cm47XG4gICAgICAgICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGJ1c3lUZXh0LCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdDogYW55ID0gYXdhaXQgUkVRKG1lc3NhZ2UsIC4uLmFyZ3MoKSk7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhyZXN1bHQgJiYgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlID8gYOWksei0pe+8miR7cmVzdWx0LmVycm9yIHx8ICfmnKrnn6XplJnor68nfWAgOiAn5a6M5oiQ44CCJywgcmVzdWx0ICYmIHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSA/ICdlcnJvcicgOiAnb2snKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5byC5bi477yaJHtlcnJvciAmJiBlcnJvci5tZXNzYWdlIHx8IGVycm9yfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgICBiaW5kU2ltcGxlQWN0aW9uKCQuZ2VuU3R5bGVCdG4sICdnZW5lcmF0ZS10ZXh0LXN0eWxlcy1mcm9tLWpzb24tYmV0YScsICfnlJ/miJAgVGV4dFN0eWxlcyDkuK0uLi4nLCAoKSA9PiBzZWxlY3RlZEpzb25QYXRoID8gW3NlbGVjdGVkSnNvblBhdGhdIDogW10pO1xuICAgICAgICBiaW5kU2ltcGxlQWN0aW9uKCQuZXhwb3J0QnRuLCAnZXhwb3J0LXRyZWUtdG8tanNvbi1maWxlJywgJ+WvvOWHuiBDb2NvcyBKU09OIOS4rS4uLicpO1xuICAgICAgICBiaW5kU2ltcGxlQWN0aW9uKCQucHVzaEZpZ21hQnRuLCAncHVzaC10cmVlLXRvLWZpZ21hJywgJ+aOqOmAgeWIsCBGaWdtYSDpmJ/liJfkuK0uLi4nKTtcblxuICAgICAgICBjbGVhckpzb24oKTtcbiAgICAgICAgdm9pZCByZWFkUmVtZW1iZXJlZEpzb25QYXRoKCkudGhlbigocmVtZW1iZXJlZFBhdGgpID0+IHtcbiAgICAgICAgICAgIGlmIChkaXNwb3NlZCkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKHJlbWVtYmVyZWRQYXRoICYmICFzZWxlY3RlZEpzb25QYXRoICYmICFwcmV2aWV3TG9hZGluZykgdm9pZCBsb2FkSnNvbihyZW1lbWJlcmVkUGF0aCwgdHJ1ZSk7XG4gICAgICAgIH0pO1xuICAgICAgICB2b2lkIGxvYWREaXJzKCk7XG4gICAgICAgIHZvaWQgcmVmcmVzaFB1c2hTdGF0ZSgpO1xuICAgIH0sXG4gICAgdXBkYXRlKG9wdGlvbnM/OiBXb3JrYmVuY2hPcGVuT3B0aW9ucykge1xuICAgICAgICBpZiAodXBkYXRlU2V0dGluZ3NXb3JrYmVuY2gpIHZvaWQgdXBkYXRlU2V0dGluZ3NXb3JrYmVuY2gob3B0aW9ucyk7XG4gICAgfSxcbiAgICBjbG9zZSgpIHtcbiAgICAgICAgaWYgKGRpc3Bvc2VNYXBwaW5nUmVzaXplKSBkaXNwb3NlTWFwcGluZ1Jlc2l6ZSgpO1xuICAgICAgICBpZiAoY2xlYXJXb3JrYmVuY2hQcmV2aWV3KSBjbGVhcldvcmtiZW5jaFByZXZpZXcoKTtcbiAgICAgICAgY2xlYXJXb3JrYmVuY2hQcmV2aWV3ID0gbnVsbDtcbiAgICAgICAgcmVmcmVzaFNldHRpbmdzV29ya3NwYWNlUGF0aCA9IG51bGw7XG4gICAgICAgIHVwZGF0ZVNldHRpbmdzV29ya2JlbmNoID0gbnVsbDtcbiAgICB9LFxufSk7XG5cbmZ1bmN0aW9uIGdyb3VwQ29tcG9uZW50SWRlbnRpdGllcyhjb21wb25lbnRzOiBDb21wb25lbnRJZGVudGl0eVtdKTogQ29tcG9uZW50R3JvdXBbXSB7XG4gICAgY29uc3QgZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIENvbXBvbmVudEdyb3VwPigpO1xuICAgIGZvciAoY29uc3QgY29tcG9uZW50IG9mIGNvbXBvbmVudHMpIHtcbiAgICAgICAgY29uc3QgY29tcG9uZW50S2V5ID0gU3RyaW5nKGNvbXBvbmVudCAmJiBjb21wb25lbnQuY29tcG9uZW50S2V5IHx8ICcnKS50cmltKCk7XG4gICAgICAgIGlmICghY29tcG9uZW50S2V5KSBjb250aW51ZTtcbiAgICAgICAgbGV0IGdyb3VwID0gZ3JvdXBzLmdldChjb21wb25lbnRLZXkpO1xuICAgICAgICBpZiAoIWdyb3VwKSB7XG4gICAgICAgICAgICBncm91cCA9IHtcbiAgICAgICAgICAgICAgICBjb21wb25lbnRLZXksXG4gICAgICAgICAgICAgICAgY29tcG9uZW50TmFtZTogU3RyaW5nKGNvbXBvbmVudC5jb21wb25lbnROYW1lIHx8ICcnKSxcbiAgICAgICAgICAgICAgICBpZGVudGl0aWVzOiBbXSxcbiAgICAgICAgICAgICAgICBpc05lc3RlZDogY29tcG9uZW50LmlzTmVzdGVkID09PSB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGdyb3Vwcy5zZXQoY29tcG9uZW50S2V5LCBncm91cCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZ3JvdXAuaXNOZXN0ZWQgJiYgY29tcG9uZW50LmlzTmVzdGVkICE9PSB0cnVlICYmIGNvbXBvbmVudC5jb21wb25lbnROYW1lKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXAuY29tcG9uZW50TmFtZSA9IGNvbXBvbmVudC5jb21wb25lbnROYW1lO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghZ3JvdXAuY29tcG9uZW50TmFtZSAmJiBjb21wb25lbnQuY29tcG9uZW50TmFtZSkge1xuICAgICAgICAgICAgICAgIGdyb3VwLmNvbXBvbmVudE5hbWUgPSBjb21wb25lbnQuY29tcG9uZW50TmFtZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdyb3VwLmlzTmVzdGVkID0gZ3JvdXAuaXNOZXN0ZWQgJiYgY29tcG9uZW50LmlzTmVzdGVkID09PSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSBncm91cC5pZGVudGl0aWVzLmZpbmRJbmRleCgoaXRlbSkgPT4gaXRlbS52YXJpYW50RmlsdGVyID09PSBjb21wb25lbnQudmFyaWFudEZpbHRlcik7XG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4IDwgMCkgZ3JvdXAuaWRlbnRpdGllcy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICAgIGVsc2UgaWYgKGdyb3VwLmlkZW50aXRpZXNbZXhpc3RpbmdJbmRleF0uaXNOZXN0ZWQgPT09IHRydWUgJiYgY29tcG9uZW50LmlzTmVzdGVkICE9PSB0cnVlKSB7XG4gICAgICAgICAgICBncm91cC5pZGVudGl0aWVzW2V4aXN0aW5nSW5kZXhdID0gY29tcG9uZW50O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBBcnJheS5mcm9tKGdyb3Vwcy52YWx1ZXMoKSlcbiAgICAgICAgLm1hcCgoZ3JvdXApID0+ICh7XG4gICAgICAgICAgICAuLi5ncm91cCxcbiAgICAgICAgICAgIGlkZW50aXRpZXM6IGdyb3VwLmlkZW50aXRpZXMuc2xpY2UoKS5zb3J0KChsZWZ0LCByaWdodCkgPT4gbGVmdC52YXJpYW50RmlsdGVyLmxvY2FsZUNvbXBhcmUocmlnaHQudmFyaWFudEZpbHRlcikpLFxuICAgICAgICB9KSlcbiAgICAgICAgLnNvcnQoKGxlZnQsIHJpZ2h0KSA9PlxuICAgICAgICAgICAgbGVmdC5jb21wb25lbnROYW1lLmxvY2FsZUNvbXBhcmUocmlnaHQuY29tcG9uZW50TmFtZSkgfHwgbGVmdC5jb21wb25lbnRLZXkubG9jYWxlQ29tcGFyZShyaWdodC5jb21wb25lbnRLZXkpXG4gICAgICAgICk7XG59XG5cbmZ1bmN0aW9uIGlkZW50aXR5RnJvbUhpdChoaXQ6IFByZXZpZXdIaXQpOiBDb21wb25lbnRJZGVudGl0eSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29tcG9uZW50S2V5OiBTdHJpbmcoaGl0ICYmIGhpdC5jb21wb25lbnRLZXkgfHwgJycpLFxuICAgICAgICBjb21wb25lbnROYW1lOiBTdHJpbmcoaGl0ICYmIChoaXQuY29tcG9uZW50TmFtZSB8fCBoaXQubmFtZSkgfHwgJycpLFxuICAgICAgICB2YXJpYW50RmlsdGVyOiBTdHJpbmcoaGl0ICYmIGhpdC52YXJpYW50RmlsdGVyIHx8ICcnKSxcbiAgICAgICAgY29tcG9uZW50UHJvcGVydGllczogaGl0ICYmIGhpdC5jb21wb25lbnRQcm9wZXJ0aWVzIHx8IHt9LFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHNhbWVDb21wb25lbnQobGVmdDogUGFydGlhbDxDb21wb25lbnRJZGVudGl0eT4sIHJpZ2h0OiBQYXJ0aWFsPENvbXBvbmVudElkZW50aXR5Pik6IGJvb2xlYW4ge1xuICAgIHJldHVybiBTdHJpbmcobGVmdCAmJiBsZWZ0LmNvbXBvbmVudEtleSB8fCAnJykgPT09IFN0cmluZyhyaWdodCAmJiByaWdodC5jb21wb25lbnRLZXkgfHwgJycpICYmXG4gICAgICAgIFN0cmluZyhsZWZ0ICYmIGxlZnQudmFyaWFudEZpbHRlciB8fCAnJykgPT09IFN0cmluZyhyaWdodCAmJiByaWdodC52YXJpYW50RmlsdGVyIHx8ICcnKTtcbn1cblxuZnVuY3Rpb24gdmFyaWFudExhYmVsKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcbiAgICBjb25zdCByYXcgPSBTdHJpbmcodmFsdWUgfHwgJycpLnRyaW0oKTtcbiAgICBpZiAoIXJhdykgcmV0dXJuICfpu5jorqTvvIjlhZzlupXvvIknO1xuICAgIHJldHVybiByYXcuc3BsaXQoJywnKS5tYXAoKHBhcnQpID0+IHtcbiAgICAgICAgY29uc3Qgc2VwYXJhdG9yID0gcGFydC5pbmRleE9mKCc9Jyk7XG4gICAgICAgIGlmIChzZXBhcmF0b3IgPD0gMCkgcmV0dXJuIHBhcnQudHJpbSgpO1xuICAgICAgICByZXR1cm4gYCR7cGFydC5zbGljZSgwLCBzZXBhcmF0b3IpLnRyaW0oKX3vvJoke3BhcnQuc2xpY2Uoc2VwYXJhdG9yICsgMSkudHJpbSgpfWA7XG4gICAgfSkuam9pbignIMK3ICcpO1xufVxuXG5mdW5jdGlvbiByZWN0SHRtbChyZWN0OiBQcmV2aWV3UmVjdCwgY2xhc3NOYW1lOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBgPGRpdiBjbGFzcz1cIiR7Y2xhc3NOYW1lfVwiIHRpdGxlPVwiJHtlc2NhcGVIdG1sKHRpdGxlKX1cIiBzdHlsZT1cImxlZnQ6JHtyZWN0Lnh9cHg7dG9wOiR7cmVjdC55fXB4O3dpZHRoOiR7TWF0aC5tYXgoMCwgcmVjdC53aWR0aCl9cHg7aGVpZ2h0OiR7TWF0aC5tYXgoMCwgcmVjdC5oZWlnaHQpfXB4XCI+PC9kaXY+YDtcbn1cblxuZnVuY3Rpb24gcmVjdEZyb21Qb2ludHMoc3RhcnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgZW5kOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0pOiBQcmV2aWV3UmVjdCB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgeDogTWF0aC5taW4oc3RhcnQueCwgZW5kLngpLFxuICAgICAgICB5OiBNYXRoLm1pbihzdGFydC55LCBlbmQueSksXG4gICAgICAgIHdpZHRoOiBNYXRoLmFicyhlbmQueCAtIHN0YXJ0LngpLFxuICAgICAgICBoZWlnaHQ6IE1hdGguYWJzKGVuZC55IC0gc3RhcnQueSksXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gcmVjdEFyZWEocmVjdDogUHJldmlld1JlY3QpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLm1heCgwLCBOdW1iZXIocmVjdC53aWR0aCkgfHwgMCkgKiBNYXRoLm1heCgwLCBOdW1iZXIocmVjdC5oZWlnaHQpIHx8IDApO1xufVxuXG5mdW5jdGlvbiBwb2ludEluUmVjdChwb2ludDogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9LCByZWN0OiBQcmV2aWV3UmVjdCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBwb2ludC54ID49IHJlY3QueCAmJiBwb2ludC55ID49IHJlY3QueSAmJiBwb2ludC54IDw9IHJlY3QueCArIHJlY3Qud2lkdGggJiYgcG9pbnQueSA8PSByZWN0LnkgKyByZWN0LmhlaWdodDtcbn1cblxuZnVuY3Rpb24gaW50ZXJzZWN0aW9uQXJlYShsZWZ0OiBQcmV2aWV3UmVjdCwgcmlnaHQ6IFByZXZpZXdSZWN0KTogbnVtYmVyIHtcbiAgICBjb25zdCB3aWR0aCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGxlZnQueCArIGxlZnQud2lkdGgsIHJpZ2h0LnggKyByaWdodC53aWR0aCkgLSBNYXRoLm1heChsZWZ0LngsIHJpZ2h0LngpKTtcbiAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihsZWZ0LnkgKyBsZWZ0LmhlaWdodCwgcmlnaHQueSArIHJpZ2h0LmhlaWdodCkgLSBNYXRoLm1heChsZWZ0LnksIHJpZ2h0LnkpKTtcbiAgICByZXR1cm4gd2lkdGggKiBoZWlnaHQ7XG59XG5cbmZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVIdG1sKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcbiAgICByZXR1cm4gU3RyaW5nKHZhbHVlID09IG51bGwgPyAnJyA6IHZhbHVlKVxuICAgICAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgICAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAgICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgICAgICAucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcbn1cblxuZnVuY3Rpb24gZ2V0RHJvcHBlZEZpbGVQYXRoKGZpbGU6IEZpbGUpOiBzdHJpbmcge1xuICAgIGNvbnN0IGxlZ2FjeVBhdGggPSBTdHJpbmcoKGZpbGUgYXMgRmlsZSAmIHsgcGF0aD86IHN0cmluZyB9KS5wYXRoIHx8ICcnKS50cmltKCk7XG4gICAgaWYgKGxlZ2FjeVBhdGgpIHJldHVybiBsZWdhY3lQYXRoO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGVsZWN0cm9uID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcbiAgICAgICAgaWYgKGVsZWN0cm9uICYmIGVsZWN0cm9uLndlYlV0aWxzICYmIHR5cGVvZiBlbGVjdHJvbi53ZWJVdGlscy5nZXRQYXRoRm9yRmlsZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIFN0cmluZyhlbGVjdHJvbi53ZWJVdGlscy5nZXRQYXRoRm9yRmlsZShmaWxlKSB8fCAnJykudHJpbSgpO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7IC8qIE9sZGVyIEVsZWN0cm9uIGRvZXMgbm90IGV4cG9zZSB3ZWJVdGlscy4gKi8gfVxuICAgIHJldHVybiAnJztcbn1cbiJdfQ==