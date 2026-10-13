"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const json_workspace_state_1 = require("../../json-workspace-state");
function asElementMap(raw) {
    return raw;
}
let applyReplaceWorkspacePath = null;
module.exports = Editor.Panel.define({
    template: (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/replace/index.html'), 'utf-8'),
    style: (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/replace/index.css'), 'utf-8'),
    listeners: {
        show() {
            void (0, json_workspace_state_1.readCurrentJsonPath)().then((filePath) => {
                if (applyReplaceWorkspacePath)
                    applyReplaceWorkspacePath(filePath);
            });
        },
    },
    $: {
        app: '#app',
        jsonPath: '#jsonPath',
        rootUuid: '#rootUuid',
        kind: '#kind',
        minScore: '#minScore',
        flagImage: '#flagImage',
        flagText: '#flagText',
        flagPosition: '#flagPosition',
        flagAlpha: '#flagAlpha',
        figmaPath: '#figmaPath',
        status: '#status',
        summary: '#summary',
        matches: '#matches',
        previewBtn: '#previewBtn',
        previewMeta: '#previewMeta',
        previewStage: '#previewStage',
        previewOverlay: '#previewOverlay',
        previewImage: '#previewImage',
        sources: '#sources',
        textureBtn: '#textureBtn',
        textureOnlyMissing: '#textureOnlyMissing',
        textureCopyBtn: '#textureCopyBtn',
        textureImportBtn: '#textureImportBtn',
        textureSummary: '#textureSummary',
        textures: '#textures',
        scanBtn: '#scanBtn',
        importBtn: '#importBtn',
        savePrefabBtn: '#savePrefabBtn',
        instantiatePrefabBtn: '#instantiatePrefabBtn',
        dryRunBtn: '#dryRunBtn',
        applyBtn: '#applyBtn',
        applySelectedBtn: '#applySelectedBtn',
        attachBtn: '#attachBtn',
    },
    ready() {
        const $ = asElementMap(this.$);
        let lastScan = null;
        let lastPreview = null;
        let lastTextureScan = null;
        let workspaceJsonPath = (0, json_workspace_state_1.normalizeCurrentJsonPath)($.jsonPath && $.jsonPath.value);
        let selectedSourcePath = '';
        let highlightedPreviewRects = [];
        let selectionCanvasRect = null;
        let selectionHits = [];
        let previewSelecting = false;
        let previewSelectionStart = null;
        let suppressNextPreviewClick = false;
        const rowSnapshots = {};
        const rowStates = {};
        const setStatus = (text, tone = 'info') => {
            if (!$.status)
                return;
            $.status.textContent = text;
            $.status.dataset.tone = tone;
        };
        const getPath = () => String($.jsonPath && $.jsonPath.value || '').trim() || undefined;
        const getKind = () => String($.kind && $.kind.value || 'all');
        const getRootUuid = () => String($.rootUuid && $.rootUuid.value || '').trim() || undefined;
        const getMinScore = () => Math.max(0, Number($.minScore && $.minScore.value) || 300);
        const getFlags = () => {
            const position = !!($.flagPosition && $.flagPosition.checked);
            return {
                image: !!($.flagImage && $.flagImage.checked),
                text: !!($.flagText && $.flagText.checked),
                position,
                anchorPivot: position,
                preserveAlpha: !!($.flagAlpha && $.flagAlpha.checked),
            };
        };
        const getRowState = (targetUuid) => {
            if (!rowStates[targetUuid])
                rowStates[targetUuid] = { content: true, position: true };
            return rowStates[targetUuid];
        };
        const getRowFlags = (targetUuid) => {
            const flags = getFlags();
            const rowState = getRowState(targetUuid);
            if (!rowState.content) {
                flags.image = false;
                flags.text = false;
            }
            if (!rowState.position) {
                flags.position = false;
                flags.anchorPivot = false;
            }
            return flags;
        };
        const fillPathFromResult = (result) => {
            const filePath = result && result.data && result.data.filePath || result && result.filePath || '';
            if (!filePath)
                return;
            if (applyReplaceWorkspacePath) {
                applyReplaceWorkspacePath(filePath);
            }
            else if ($.jsonPath) {
                $.jsonPath.value = filePath;
                $.jsonPath.title = filePath;
            }
            void (0, json_workspace_state_1.writeCurrentJsonPath)(filePath);
        };
        const renderSummary = (data) => {
            if (!$.summary)
                return;
            if (!data) {
                $.summary.innerHTML = '<div class="empty">暂无扫描结果</div>';
                return;
            }
            const source = data.sourceStats || {};
            const target = data.targetStats || {};
            const match = data.matchStats || {};
            $.summary.innerHTML = [
                `<div><b>${escapeHtml(data.name || 'Figma JSON')}</b></div>`,
                `<div>源：${source.nodes || 0} 节点 / ${source.images || 0} 图 / ${source.texts || 0} 文本</div>`,
                `<div>目标：${target.targets || 0} 项 / ${target.images || 0} 图 / ${target.texts || 0} 文本</div>`,
                `<div>匹配：${match.confident || 0} 可信，${match.weak || 0} 弱，${match.missing || 0} 缺失</div>`,
                `<div>风险：${match.ambiguous || 0} 歧义，${match.duplicateSourceAssignments || 0} 重复源分配</div>`,
            ].join('');
        };
        const renderMatches = (data) => {
            if (!$.matches)
                return;
            const matches = data && Array.isArray(data.matches) ? data.matches : [];
            if (matches.length === 0) {
                $.matches.innerHTML = '<div class="empty">没有可显示的匹配行</div>';
                return;
            }
            $.matches.innerHTML = matches.slice(0, 80).map((item, index) => {
                const best = item.best || {};
                const source = best.source || {};
                const target = item.target || {};
                const score = Number(best.score) || 0;
                const tone = score >= 300 ? 'ok' : (score > 0 ? 'weak' : 'miss');
                const rowState = getRowState(target.uuid || '');
                return [
                    `<div class="match-row ${tone} ${rowSnapshots[target.uuid] ? 'snapshotted' : ''}" data-index="${index}" data-target-uuid="${escapeHtml(target.uuid || '')}">`,
                    `<button class="match-select" data-index="${index}">`,
                    `<span class="score">${score || '-'}</span>`,
                    `<span class="target">${escapeHtml(target.relativePath || target.scenePath || target.name || '')}</span>`,
                    `<span class="source">${escapeHtml(source.path || '(no source)')}</span>`,
                    `<span class="reason">${escapeHtml(best.reason || '')}</span>`,
                    '</button>',
                    `<label class="row-check" title="应用图片/文字内容"><input class="row-content" data-index="${index}" type="checkbox" ${rowState.content ? 'checked' : ''} />内容</label>`,
                    `<label class="row-check" title="应用位置/尺寸"><input class="row-position" data-index="${index}" type="checkbox" ${rowState.position ? 'checked' : ''} />位置</label>`,
                    `<button class="row-locate" data-index="${index}" ${target.uuid ? '' : 'disabled'} title="在 Hierarchy 中定位目标节点">定位</button>`,
                    `<button class="row-apply" data-index="${index}" ${target.uuid ? '' : 'disabled'}>应用</button>`,
                    `<button class="row-restore" data-index="${index}" ${rowSnapshots[target.uuid] ? '' : 'disabled'} title="清除本行替换并还原">还原</button>`,
                    '</div>',
                ].join('');
            }).join('');
            $.matches.querySelectorAll('.match-select').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.dataset.index) || 0;
                    const best = matches[index] && matches[index].best;
                    const path = best && best.source && best.source.path || '';
                    if (path && $.figmaPath)
                        $.figmaPath.value = path;
                    if (best && best.source) {
                        highlightRects([{
                                path,
                                x: best.source.canvasX,
                                y: best.source.canvasY,
                                width: best.source.width,
                                height: best.source.height,
                            }]);
                        selectedSourcePath = path;
                        markSelectedSource();
                    }
                });
            });
            $.matches.querySelectorAll('.row-apply').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.dataset.index) || 0;
                    const item = matches[index];
                    const targetUuid = item && item.target && item.target.uuid || '';
                    const bestPath = item && item.best && item.best.source && item.best.source.path || '';
                    applyRow(targetUuid, selectedSourcePath || bestPath);
                });
            });
            $.matches.querySelectorAll('.row-locate').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.dataset.index) || 0;
                    const item = matches[index];
                    const targetUuid = item && item.target && item.target.uuid || '';
                    locateRow(targetUuid);
                });
            });
            const bindRowToggle = (selector, field) => {
                $.matches.querySelectorAll(selector).forEach((input) => {
                    input.addEventListener('change', () => {
                        const index = Number(input.dataset.index) || 0;
                        const item = matches[index];
                        const targetUuid = item && item.target && item.target.uuid || '';
                        if (!targetUuid)
                            return;
                        const rowState = getRowState(targetUuid);
                        rowState[field] = input.checked;
                        if (rowSnapshots[targetUuid] && rowState.assignedPath) {
                            applyRow(targetUuid, rowState.assignedPath);
                        }
                    });
                });
            };
            bindRowToggle('.row-content', 'content');
            bindRowToggle('.row-position', 'position');
            $.matches.querySelectorAll('.match-row').forEach((row) => {
                row.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    row.classList.add('drag-over');
                    if (event.dataTransfer)
                        event.dataTransfer.dropEffect = 'copy';
                });
                row.addEventListener('dragleave', () => {
                    row.classList.remove('drag-over');
                });
                row.addEventListener('drop', (event) => {
                    event.preventDefault();
                    row.classList.remove('drag-over');
                    const index = Number(row.dataset.index) || 0;
                    const item = matches[index];
                    const targetUuid = item && item.target && item.target.uuid || '';
                    const path = event.dataTransfer && event.dataTransfer.getData('text/plain') || selectedSourcePath;
                    if (path && $.figmaPath)
                        $.figmaPath.value = path;
                    selectedSourcePath = path || selectedSourcePath;
                    applyRow(targetUuid, path);
                });
            });
            $.matches.querySelectorAll('.row-restore').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.dataset.index) || 0;
                    const item = matches[index];
                    const targetUuid = item && item.target && item.target.uuid || '';
                    restoreRow(targetUuid);
                });
            });
        };
        const renderSources = (data) => {
            if (!$.sources)
                return;
            if (!data) {
                $.sources.innerHTML = '<div class="empty">暂无源资源</div>';
                return;
            }
            const rawImages = Array.isArray(data.sourceImages) ? data.sourceImages : [];
            const rawTexts = Array.isArray(data.sourceTexts) ? data.sourceTexts : [];
            const selectionActive = !!selectionCanvasRect;
            const selectedPathSet = new Set((selectionHits || []).map((hit) => String(hit.path || '')).filter(Boolean));
            const hitByPath = {};
            for (const hit of (selectionHits || [])) {
                if (hit && hit.path)
                    hitByPath[hit.path] = hit;
            }
            const images = selectionActive
                ? rawImages.map((item) => {
                    const rects = (Array.isArray(item.allRects) ? item.allRects : []).filter((rect) => selectedPathSet.has(String(rect.path || '')));
                    if (rects.length === 0)
                        return null;
                    const first = hitByPath[rects[0].path] || rects[0];
                    return Object.assign(Object.assign({}, item), { path: first.path || item.path, name: first.name || item.name, width: first.width || item.width, height: first.height || item.height, occurrences: rects.length, allRects: rects });
                }).filter(Boolean)
                : rawImages;
            const texts = selectionActive
                ? rawTexts.filter((item) => selectedPathSet.has(String(item.path || '')))
                : rawTexts;
            const imageHtml = images.slice(0, 96).map((item, index) => [
                `<button class="source-card image-source" draggable="true" data-kind="image" data-index="${index}" data-path="${escapeHtml(item.path || '')}">`,
                item.dataUrl ? `<img src="${item.dataUrl}" />` : '<span class="thumb-missing">无图</span>',
                `<span title="${escapeHtml(item.path || '')}">${escapeHtml(item.name || item.imageRef || 'Image')}</span>`,
                `<small>${item.occurrences || 1}x · ${Math.round(item.width || 0)}×${Math.round(item.height || 0)}</small>`,
                '</button>',
            ].join('')).join('');
            const textHtml = texts.slice(0, 96).map((item, index) => [
                `<button class="source-card text-source" draggable="true" data-kind="text" data-index="${index}" data-path="${escapeHtml(item.path || '')}">`,
                `<span title="${escapeHtml(item.path || '')}">${escapeHtml(item.name || 'Text')}</span>`,
                `<small>${escapeHtml(String(item.text || '').replace(/\s+/g, ' ').slice(0, 48))}</small>`,
                '</button>',
            ].join('')).join('');
            $.sources.innerHTML = [
                selectionActive
                    ? `<div class="source-selection">框选命中 ${selectionHits.length} 项 · 图 ${images.length}/${rawImages.length} · 文本 ${texts.length}/${rawTexts.length}</div>`
                    : '',
                `<div class="source-section"><div class="source-title">源图片 ${images.length}${selectionActive ? `/${rawImages.length}` : ''}</div><div class="source-grid">${imageHtml || '<div class="empty">无图片源</div>'}</div></div>`,
                `<div class="source-section"><div class="source-title">源文字 ${texts.length}${selectionActive ? `/${rawTexts.length}` : ''}</div><div class="source-list">${textHtml || '<div class="empty">无文字源</div>'}</div></div>`,
            ].join('');
            $.sources.querySelectorAll('.source-card').forEach((button) => {
                button.addEventListener('click', () => {
                    const kind = button.dataset.kind || '';
                    const index = Number(button.dataset.index) || 0;
                    const source = kind === 'image' ? images[index] : texts[index];
                    if (!source)
                        return;
                    selectedSourcePath = source.path || '';
                    if ($.figmaPath)
                        $.figmaPath.value = selectedSourcePath;
                    const rects = kind === 'image'
                        ? (Array.isArray(source.allRects) ? source.allRects : [])
                        : [source];
                    highlightRects(rects);
                    markSelectedSource();
                });
                button.addEventListener('dragstart', (event) => {
                    const path = button.dataset.path || '';
                    selectedSourcePath = path;
                    if ($.figmaPath)
                        $.figmaPath.value = selectedSourcePath;
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'copy';
                        event.dataTransfer.setData('text/plain', path);
                    }
                    markSelectedSource();
                });
            });
        };
        const textureNeedsAttention = (item) => {
            return item && (item.status === 'missing' || item.status === 'figma-import');
        };
        const textureStatusLabel = (status) => {
            if (status === 'project')
                return '正式/外部';
            if (status === 'figma-import')
                return 'Figma目录';
            return '缺失';
        };
        const renderTextures = (data) => {
            if ($.textureSummary) {
                if (!data || !data.stats) {
                    $.textureSummary.textContent = '未扫描贴图';
                }
                else {
                    const s = data.stats;
                    $.textureSummary.textContent =
                        `唯一 ${s.unique || 0} · 正式/外部 ${s.projectFound || 0} · ` +
                            `Figma目录 ${s.figmaImportFound || 0} · 缺失 ${s.missing || 0}`;
                }
            }
            if (!$.textures)
                return;
            if (!data) {
                $.textures.innerHTML = '<div class="empty">点击「贴图预览」扫描 JSON 用到的唯一贴图</div>';
                return;
            }
            const onlyAttention = !!($.textureOnlyMissing && $.textureOnlyMissing.checked);
            const rawEntries = Array.isArray(data.entries) ? data.entries : [];
            const entries = onlyAttention ? rawEntries.filter(textureNeedsAttention) : rawEntries;
            if (entries.length === 0) {
                $.textures.innerHTML = '<div class="empty">没有需要关注的贴图</div>';
                return;
            }
            $.textures.innerHTML = entries.slice(0, 160).map((item) => {
                const status = String(item.status || 'missing');
                const statusLabel = textureStatusLabel(status);
                const mainPath = item.path || (item.allRects && item.allRects[0] && item.allRects[0].path) || '';
                const asset = item.assetPath || '';
                return [
                    `<button class="texture-row ${status}" data-path="${escapeHtml(mainPath)}" title="${escapeHtml(mainPath)}">`,
                    item.dataUrl ? `<img src="${item.dataUrl}" />` : '<span class="thumb-missing">无图</span>',
                    '<span class="texture-info">',
                    `<b>${escapeHtml(item.name || item.imageName || item.imageRef || 'Image')}</b>`,
                    `<small>${escapeHtml(statusLabel)} · ${item.occurrences || 1}x · ${Math.round(item.width || 0)}×${Math.round(item.height || 0)}</small>`,
                    asset ? `<small>${escapeHtml(asset)}</small>` : `<small>${escapeHtml(mainPath)}</small>`,
                    '</span>',
                    '</button>',
                ].join('');
            }).join('');
            $.textures.querySelectorAll('.texture-row').forEach((button) => {
                button.addEventListener('click', () => {
                    const path = button.dataset.path || '';
                    if (!path || !lastTextureScan)
                        return;
                    selectedSourcePath = path;
                    if ($.figmaPath)
                        $.figmaPath.value = path;
                    const entry = (lastTextureScan.entries || []).find((item) => item.path === path || (Array.isArray(item.allRects) && item.allRects.some((rect) => rect.path === path)));
                    const rects = entry && Array.isArray(entry.allRects)
                        ? entry.allRects.map((rect) => ({
                            path: rect.path,
                            x: rect.canvasX,
                            y: rect.canvasY,
                            width: rect.width,
                            height: rect.height,
                        }))
                        : [];
                    highlightRects(rects);
                    markSelectedSource();
                    setStatus(`已选择贴图源：${path}`, 'ok');
                });
            });
        };
        const markSelectedSource = () => {
            if (!$.sources)
                return;
            $.sources.querySelectorAll('.source-card').forEach((button) => {
                button.classList.toggle('selected', !!selectedSourcePath && button.dataset.path === selectedSourcePath);
            });
        };
        const clearHighlights = () => {
            highlightedPreviewRects = [];
            selectionCanvasRect = null;
            selectionHits = [];
            renderPreviewOverlay();
        };
        const renderPreviewOverlay = () => {
            if (!$.previewOverlay || !$.previewImage || !lastPreview || !lastPreview.canvas)
                return;
            const cw = Number(lastPreview.canvas.width) || 1;
            const ch = Number(lastPreview.canvas.height) || 1;
            const dw = $.previewImage.clientWidth || 1;
            const dh = $.previewImage.clientHeight || 1;
            if ($.previewOverlay) {
                $.previewOverlay.style.width = `${dw}px`;
                $.previewOverlay.style.height = `${dh}px`;
            }
            const mapRect = (rect) => {
                const left = (Number(rect.x) || 0) / cw * dw;
                const top = (Number(rect.y) || 0) / ch * dh;
                const width = Math.max(1, (Number(rect.width) || 0) / cw * dw);
                const height = Math.max(1, (Number(rect.height) || 0) / ch * dh);
                return { left, top, width, height };
            };
            const hitHtml = (highlightedPreviewRects || []).slice(0, 48).map((rect) => {
                const r = mapRect(rect);
                return `<div class="hit-rect" title="${escapeHtml(rect.path || '')}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div>`;
            });
            const selectionHtml = [];
            if (selectionCanvasRect && selectionCanvasRect.width > 0 && selectionCanvasRect.height > 0) {
                const r = mapRect(selectionCanvasRect);
                const label = `x${Math.round(selectionCanvasRect.x)} y${Math.round(selectionCanvasRect.y)} ${Math.round(selectionCanvasRect.width)}×${Math.round(selectionCanvasRect.height)}`;
                selectionHtml.push(`<div class="selection-rect" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px">` +
                    `<span>${escapeHtml(label)}</span></div>`);
            }
            $.previewOverlay.innerHTML = hitHtml.concat(selectionHtml).join('');
        };
        const highlightRects = (rects) => {
            const visibleRects = (rects || []).filter((rect) => rect && rect.width > 0 && rect.height > 0);
            highlightedPreviewRects = visibleRects;
            renderPreviewOverlay();
        };
        const selectPreviewHit = (hit) => {
            if (!hit || !hit.path)
                return;
            selectedSourcePath = hit.path;
            if ($.figmaPath)
                $.figmaPath.value = selectedSourcePath;
            selectionCanvasRect = null;
            selectionHits = [];
            let rects = [hit];
            if (hit.imageRef && lastPreview && Array.isArray(lastPreview.sourceImages)) {
                const grouped = lastPreview.sourceImages.find((item) => item && item.imageRef === hit.imageRef);
                if (grouped && Array.isArray(grouped.allRects) && grouped.allRects.length > 0) {
                    rects = grouped.allRects;
                }
            }
            highlightRects(rects);
            renderSources(lastPreview);
            markSelectedSource();
            setStatus(`已选择预览源：${hit.path}`, 'ok');
        };
        const previewPointFromMouse = (event) => {
            if (!$.previewImage || !lastPreview || !lastPreview.canvas)
                return null;
            const rect = $.previewImage.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0)
                return null;
            const px = event.clientX - rect.left;
            const py = event.clientY - rect.top;
            if (px < 0 || py < 0 || px > rect.width || py > rect.height)
                return null;
            const cw = Number(lastPreview.canvas.width) || 1;
            const ch = Number(lastPreview.canvas.height) || 1;
            return {
                x: Math.max(0, Math.min(cw, px / rect.width * cw)),
                y: Math.max(0, Math.min(ch, py / rect.height * ch)),
            };
        };
        const makeCanvasRect = (a, b) => ({
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(a.x - b.x),
            height: Math.abs(a.y - b.y),
        });
        const rectIntersectionArea = (a, b) => {
            if (!a || !b)
                return 0;
            const left = Math.max(Number(a.x) || 0, Number(b.x) || 0);
            const top = Math.max(Number(a.y) || 0, Number(b.y) || 0);
            const right = Math.min((Number(a.x) || 0) + (Number(a.width) || 0), (Number(b.x) || 0) + (Number(b.width) || 0));
            const bottom = Math.min((Number(a.y) || 0) + (Number(a.height) || 0), (Number(b.y) || 0) + (Number(b.height) || 0));
            return Math.max(0, right - left) * Math.max(0, bottom - top);
        };
        const runSelectionHitTest = (rect) => {
            const hits = lastPreview && Array.isArray(lastPreview.hits) ? lastPreview.hits : [];
            const selected = hits
                .filter((hit) => hit && hit.width > 0 && hit.height > 0 && rectIntersectionArea(rect, hit) > 0.5)
                .sort((a, b) => {
                const aa = Math.max(0, Number(a.width) || 0) * Math.max(0, Number(a.height) || 0);
                const ba = Math.max(0, Number(b.width) || 0) * Math.max(0, Number(b.height) || 0);
                return aa - ba;
            });
            selectionHits = selected;
            highlightedPreviewRects = selected.slice(0, 48);
            renderPreviewOverlay();
            renderSources(lastPreview);
            markSelectedSource();
            setStatus(`框选命中 ${selected.length} 项。`, selected.length ? 'ok' : 'warn');
        };
        const beginPreviewSelection = (event) => {
            if (event.button !== 0)
                return;
            const point = previewPointFromMouse(event);
            if (!point)
                return;
            previewSelecting = true;
            previewSelectionStart = point;
            highlightedPreviewRects = [];
            selectionCanvasRect = { x: point.x, y: point.y, width: 0, height: 0 };
            selectionHits = [];
            renderPreviewOverlay();
            event.preventDefault();
        };
        const updatePreviewSelection = (event) => {
            if (!previewSelecting || !previewSelectionStart)
                return;
            const point = previewPointFromMouse(event);
            if (!point)
                return;
            selectionCanvasRect = makeCanvasRect(previewSelectionStart, point);
            renderPreviewOverlay();
            event.preventDefault();
        };
        const finishPreviewSelection = (event) => {
            if (!previewSelecting || !previewSelectionStart)
                return;
            const point = previewPointFromMouse(event);
            previewSelecting = false;
            if (!point) {
                previewSelectionStart = null;
                return;
            }
            const rect = makeCanvasRect(previewSelectionStart, point);
            previewSelectionStart = null;
            if (rect.width < 3 && rect.height < 3) {
                selectionCanvasRect = null;
                selectionHits = [];
                renderPreviewOverlay();
                renderSources(lastPreview);
                return;
            }
            suppressNextPreviewClick = true;
            selectionCanvasRect = rect;
            runSelectionHitTest(rect);
            event.preventDefault();
        };
        const pickPreviewHitAt = (event) => {
            if (suppressNextPreviewClick) {
                suppressNextPreviewClick = false;
                return;
            }
            if (!$.previewImage || !lastPreview || !lastPreview.canvas || !Array.isArray(lastPreview.hits))
                return;
            const point = previewPointFromMouse(event);
            if (!point)
                return;
            const cx = point.x;
            const cy = point.y;
            const containing = lastPreview.hits
                .map((hit, index) => ({ hit, index }))
                .filter(({ hit }) => hit &&
                cx >= Number(hit.x) && cy >= Number(hit.y) &&
                cx <= Number(hit.x) + Number(hit.width) &&
                cy <= Number(hit.y) + Number(hit.height));
            if (containing.length === 0)
                return;
            containing.sort((a, b) => {
                const aa = Math.max(0, Number(a.hit.width) || 0) * Math.max(0, Number(a.hit.height) || 0);
                const ba = Math.max(0, Number(b.hit.width) || 0) * Math.max(0, Number(b.hit.height) || 0);
                if (Math.abs(aa - ba) > 0.01)
                    return aa - ba;
                return b.index - a.index;
            });
            selectPreviewHit(containing[0].hit);
        };
        const scan = async () => {
            try {
                setStatus('扫描中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'scan-json-replace-candidates-beta', getPath(), getKind(), getRootUuid());
                if (!result || result.success === false) {
                    setStatus(`扫描失败：${result && result.error || 'unknown error'}`, 'error');
                    return result;
                }
                fillPathFromResult(result);
                lastScan = result.data;
                renderSummary(lastScan);
                renderMatches(lastScan);
                setStatus('扫描完成。点击匹配行可填入 Figma path，用于挂载子树。', 'ok');
                return result;
            }
            catch (error) {
                setStatus(`扫描异常：${error && error.message || error}`, 'error');
                return null;
            }
        };
        const loadPreview = async () => {
            try {
                setStatus('加载预览中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'load-json-preview-beta', getPath(), true);
                if (!result || result.success === false || !result.data) {
                    setStatus(`加载预览失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                const data = result.data;
                lastPreview = data;
                if ($.previewImage) {
                    $.previewImage.src = data.previewImageDataUrl || '';
                    $.previewImage.hidden = !data.previewImageDataUrl;
                    $.previewImage.onload = () => {
                        if ($.previewOverlay && $.previewImage) {
                            $.previewOverlay.style.width = `${$.previewImage.clientWidth}px`;
                            $.previewOverlay.style.height = `${$.previewImage.clientHeight}px`;
                        }
                    };
                }
                clearHighlights();
                renderSources(data);
                if ($.previewMeta) {
                    const stats = data.stats || {};
                    const interfaceText = stats.interfaceCount > 1 ? ` · 预览第 1/${stats.interfaceCount} 界面` : '';
                    $.previewMeta.textContent = data.previewImageDataUrl
                        ? `${data.name || 'Preview'} · ${data.canvas.width}×${data.canvas.height} · ${stats.hits || 0} hits${interfaceText}`
                        : 'JSON 中没有整帧预览图。';
                }
                setStatus('预览已加载。', data.previewImageDataUrl ? 'ok' : 'warn');
            }
            catch (error) {
                setStatus(`加载预览异常：${error && error.message || error}`, 'error');
            }
        };
        const scanTextures = async () => {
            try {
                setStatus('贴图预览扫描中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'scan-json-textures-beta', getPath(), true, false);
                if (!result || result.success === false || !result.data) {
                    setStatus(`贴图预览失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                lastTextureScan = result.data;
                renderTextures(lastTextureScan);
                const s = lastTextureScan.stats || {};
                const attention = (s.missing || 0) + (s.figmaImportFound || 0);
                setStatus(attention > 0
                    ? `贴图预览完成：${attention} 张需要关注。`
                    : '贴图预览完成：全部唯一贴图已有正式/外部资源命中。', attention > 0 ? 'warn' : 'ok');
            }
            catch (error) {
                setStatus(`贴图预览异常：${error && error.message || error}`, 'error');
            }
        };
        const copyMissingTextures = async () => {
            if (!lastTextureScan) {
                setStatus('请先扫描贴图预览。', 'warn');
                return;
            }
            const entries = (lastTextureScan.entries || []).filter(textureNeedsAttention);
            const lines = entries.map((item) => {
                const name = item.imageName || item.name || item.imageRef || 'Image';
                const path = item.path || (item.allRects && item.allRects[0] && item.allRects[0].path) || '';
                return `${name}\t${Math.round(item.width || 0)}x${Math.round(item.height || 0)}\t${textureStatusLabel(item.status)}\t${path}`;
            });
            try {
                await navigator.clipboard.writeText(lines.join('\n'));
                setStatus(`已复制 ${lines.length} 条贴图关注清单。`, 'ok');
            }
            catch (_a) {
                setStatus('复制失败：当前面板无法访问剪贴板。', 'error');
            }
        };
        const importMissingTextures = async () => {
            try {
                setStatus('提前导入缺失贴图中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'import-missing-textures-beta', getPath(), false);
                if (!result || result.success === false) {
                    setStatus(`提前导入失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                const data = result.data || {};
                setStatus(`提前导入完成：${data.landed || data.imported || 0}/${data.requested || 0} 张。`, 'ok');
                await scanTextures();
            }
            catch (error) {
                setStatus(`提前导入异常：${error && error.message || error}`, 'error');
            }
        };
        const applyBatch = async (dryRun) => {
            try {
                setStatus(dryRun ? 'dry-run 中...' : '批量应用中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'apply-matched-nodes-to-selected-root-beta', getPath(), {
                    rootUuid: getRootUuid(),
                    kind: getKind(),
                    minScore: getMinScore(),
                    flags: getFlags(),
                    dryRun,
                });
                if (!result || result.success === false) {
                    setStatus(`${dryRun ? 'dry-run' : '批量应用'}失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                setStatus(dryRun
                    ? `dry-run 完成：计划 ${result.planned || 0}，跳过 ${result.skipped || 0}`
                    : `批量应用完成：应用 ${result.applied || 0}，失败 ${result.failed || 0}，跳过 ${result.skipped || 0}`, result.failed ? 'warn' : 'ok');
            }
            catch (error) {
                setStatus(`批量应用异常：${error && error.message || error}`, 'error');
            }
        };
        const importFull = async () => {
            try {
                setStatus('完整导入中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'import-from-json', getPath());
                if (!result || result.success === false) {
                    setStatus(`完整导入失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                const data = result.data || {};
                if (data.rootUuid && $.rootUuid)
                    $.rootUuid.value = data.rootUuid;
                setStatus(`完整导入完成：${data.rootUuid || data.rootName || 'Figma UI'}`, 'ok');
            }
            catch (error) {
                setStatus(`完整导入异常：${error && error.message || error}`, 'error');
            }
        };
        const savePrefab = async () => {
            try {
                setStatus('保存 Prefab 中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'save-node-as-prefab-beta');
                if (!result || result.success === false) {
                    setStatus(`保存 Prefab 失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                setStatus(`已保存 Prefab：${result.dbUrl || result.name || 'Prefab'}`, 'ok');
            }
            catch (error) {
                setStatus(`保存 Prefab 异常：${error && error.message || error}`, 'error');
            }
        };
        const instantiatePrefab = async () => {
            try {
                setStatus('实例化 Prefab 中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'instantiate-prefab-beta');
                if (!result || result.success === false) {
                    setStatus(`实例化 Prefab 失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                const data = result.data || {};
                if (data.rootUuid && $.rootUuid)
                    $.rootUuid.value = data.rootUuid;
                setStatus(`已实例化 Prefab：${data.rootName || result.name || 'Prefab'}`, 'ok');
            }
            catch (error) {
                setStatus(`实例化 Prefab 异常：${error && error.message || error}`, 'error');
            }
        };
        const rerenderMatches = () => {
            if (!lastScan)
                return;
            renderMatches(lastScan);
            markSelectedSource();
        };
        const ensureRowSnapshot = async (targetUuid) => {
            if (rowSnapshots[targetUuid])
                return rowSnapshots[targetUuid];
            setStatus('记录目标原始状态...', 'info');
            const result = await Editor.Message.request('figma-importer', 'snapshot-replace-target-beta', targetUuid);
            if (!result || result.success === false || !result.data || !result.data.snapshot) {
                setStatus(`记录目标原始状态失败：${result && result.error || 'unknown error'}`, 'error');
                return null;
            }
            rowSnapshots[targetUuid] = result.data.snapshot;
            rerenderMatches();
            return rowSnapshots[targetUuid];
        };
        const restoreSnapshot = async (targetUuid, save) => {
            const snapshot = rowSnapshots[targetUuid];
            if (!snapshot)
                return true;
            const result = await Editor.Message.request('figma-importer', 'restore-replace-target-beta', { snapshot, save });
            if (!result || result.success === false) {
                setStatus(`还原失败：${result && result.error || 'unknown error'}`, 'error');
                return false;
            }
            return true;
        };
        const restoreRow = async (targetUuid) => {
            if (!targetUuid) {
                setStatus('还原失败：缺少 targetUuid。', 'error');
                return;
            }
            if (!rowSnapshots[targetUuid]) {
                setStatus('这行还没有可还原的快照。', 'warn');
                return;
            }
            try {
                setStatus('还原本行中...', 'info');
                const ok = await restoreSnapshot(targetUuid, true);
                if (!ok)
                    return;
                delete rowSnapshots[targetUuid];
                delete rowStates[targetUuid];
                rerenderMatches();
                setStatus(`已还原本行：${targetUuid}`, 'ok');
            }
            catch (error) {
                setStatus(`还原异常：${error && error.message || error}`, 'error');
            }
        };
        const locateRow = async (targetUuid) => {
            if (!targetUuid) {
                setStatus('定位失败：缺少 targetUuid。', 'error');
                return;
            }
            try {
                const result = await Editor.Message.request('figma-importer', 'select-replace-target-beta', targetUuid);
                if (!result || result.success === false) {
                    setStatus(`定位失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                const data = result.data || {};
                setStatus(`已定位：${data.scenePath || data.name || targetUuid}`, 'ok');
            }
            catch (error) {
                setStatus(`定位异常：${error && error.message || error}`, 'error');
            }
        };
        const applyRow = async (targetUuid, figmaPath) => {
            if (!targetUuid) {
                setStatus('逐行应用失败：缺少 targetUuid。', 'error');
                return;
            }
            try {
                const snapshot = await ensureRowSnapshot(targetUuid);
                if (!snapshot)
                    return;
                const restored = await restoreSnapshot(targetUuid, false);
                if (!restored)
                    return;
                setStatus('逐行应用中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'apply-json-node-to-target-beta', getPath(), targetUuid, figmaPath, getRowFlags(targetUuid));
                if (!result || result.success === false) {
                    // Unity ResourceReplace treats each apply as a transaction:
                    // even the first failed attempt returns to the row snapshot.
                    await restoreSnapshot(targetUuid, true);
                    setStatus(`逐行应用失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                const match = result.match || {};
                if (match.figmaPath && $.figmaPath)
                    $.figmaPath.value = match.figmaPath;
                getRowState(targetUuid).assignedPath = match.figmaPath || figmaPath || '';
                rerenderMatches();
                setStatus(`逐行应用完成：${match.figmaPath || figmaPath || targetUuid}`, 'ok');
            }
            catch (error) {
                if (rowSnapshots[targetUuid])
                    await restoreSnapshot(targetUuid, true);
                setStatus(`逐行应用异常：${error && error.message || error}`, 'error');
            }
        };
        const attach = async () => {
            try {
                const figmaPath = String($.figmaPath && $.figmaPath.value || '').trim() || undefined;
                setStatus('挂载子树中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'attach-matched-node-as-child-beta', getPath(), figmaPath, { parentUuid: getRootUuid() });
                if (!result || result.success === false) {
                    setStatus(`挂载失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                setStatus(`挂载完成：${result.match && result.match.figmaPath || 'matched node'}`, 'ok');
            }
            catch (error) {
                setStatus(`挂载异常：${error && error.message || error}`, 'error');
            }
        };
        const applyToSelected = async () => {
            try {
                const figmaPath = String($.figmaPath && $.figmaPath.value || '').trim() || selectedSourcePath || undefined;
                setStatus('应用到当前选中节点中...', 'info');
                const result = await Editor.Message.request('figma-importer', 'apply-matched-node-to-selected-beta', getPath(), figmaPath, getFlags());
                if (!result || result.success === false) {
                    setStatus(`应用到选中失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                const match = result.match || {};
                if (match.figmaPath && $.figmaPath)
                    $.figmaPath.value = match.figmaPath;
                setStatus(`应用到选中完成：${match.figmaPath || figmaPath || 'matched node'}`, 'ok');
            }
            catch (error) {
                setStatus(`应用到选中异常：${error && error.message || error}`, 'error');
            }
        };
        applyReplaceWorkspacePath = (value) => {
            const filePath = (0, json_workspace_state_1.normalizeCurrentJsonPath)(value);
            const previousPath = workspaceJsonPath;
            workspaceJsonPath = filePath;
            if ($.jsonPath) {
                $.jsonPath.value = filePath;
                $.jsonPath.title = filePath;
            }
            if (filePath === previousPath)
                return;
            lastScan = null;
            lastPreview = null;
            lastTextureScan = null;
            selectedSourcePath = '';
            highlightedPreviewRects = [];
            selectionCanvasRect = null;
            selectionHits = [];
            previewSelecting = false;
            previewSelectionStart = null;
            suppressNextPreviewClick = false;
            if ($.figmaPath)
                $.figmaPath.value = '';
            if ($.previewImage) {
                $.previewImage.onload = null;
                $.previewImage.src = '';
                $.previewImage.hidden = true;
            }
            if ($.previewMeta)
                $.previewMeta.textContent = '暂无预览';
            if ($.previewOverlay)
                $.previewOverlay.innerHTML = '';
            renderSummary(null);
            renderMatches(null);
            renderSources(null);
            renderTextures(null);
            setStatus(filePath ? '已继承工作台 JSON，请加载预览或扫描。' : '未选择 JSON。', 'info');
        };
        $.previewBtn && $.previewBtn.addEventListener('click', loadPreview);
        $.jsonPath && $.jsonPath.addEventListener('change', () => {
            const filePath = (0, json_workspace_state_1.normalizeCurrentJsonPath)($.jsonPath && $.jsonPath.value);
            if (applyReplaceWorkspacePath)
                applyReplaceWorkspacePath(filePath);
            void (0, json_workspace_state_1.writeCurrentJsonPath)(filePath);
        });
        $.textureBtn && $.textureBtn.addEventListener('click', scanTextures);
        $.textureOnlyMissing && $.textureOnlyMissing.addEventListener('change', () => renderTextures(lastTextureScan));
        $.textureCopyBtn && $.textureCopyBtn.addEventListener('click', copyMissingTextures);
        $.textureImportBtn && $.textureImportBtn.addEventListener('click', importMissingTextures);
        $.scanBtn && $.scanBtn.addEventListener('click', scan);
        $.importBtn && $.importBtn.addEventListener('click', importFull);
        $.savePrefabBtn && $.savePrefabBtn.addEventListener('click', savePrefab);
        $.instantiatePrefabBtn && $.instantiatePrefabBtn.addEventListener('click', instantiatePrefab);
        $.dryRunBtn && $.dryRunBtn.addEventListener('click', () => applyBatch(true));
        $.applyBtn && $.applyBtn.addEventListener('click', () => applyBatch(false));
        $.applySelectedBtn && $.applySelectedBtn.addEventListener('click', applyToSelected);
        $.attachBtn && $.attachBtn.addEventListener('click', attach);
        if ($.previewStage) {
            $.previewStage.addEventListener('mousedown', beginPreviewSelection);
            $.previewStage.addEventListener('mousemove', updatePreviewSelection);
            $.previewStage.addEventListener('mouseup', finishPreviewSelection);
            $.previewStage.addEventListener('mouseleave', finishPreviewSelection);
            $.previewStage.addEventListener('click', pickPreviewHitAt);
        }
        renderSummary(lastScan);
        renderMatches(lastScan);
        renderSources(lastPreview);
        renderTextures(lastTextureScan);
        setStatus('选择 JSON 后扫描；rootUuid 留空时使用当前选中/最近导入根。', 'info');
        void (0, json_workspace_state_1.readCurrentJsonPath)().then((filePath) => {
            if (applyReplaceWorkspacePath)
                applyReplaceWorkspacePath(filePath);
        });
    },
    update(options) {
        if (!options || !Object.prototype.hasOwnProperty.call(options, 'jsonPath'))
            return;
        const filePath = (0, json_workspace_state_1.normalizeCurrentJsonPath)(options && options.jsonPath);
        if (applyReplaceWorkspacePath) {
            applyReplaceWorkspacePath(filePath);
        }
        else {
            const $ = asElementMap(this.$);
            if ($.jsonPath) {
                $.jsonPath.value = filePath;
                $.jsonPath.title = filePath;
            }
        }
        void (0, json_workspace_state_1.writeCurrentJsonPath)(filePath);
    },
    close() {
        applyReplaceWorkspacePath = null;
    },
});
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zb3VyY2UvcGFuZWxzL3JlcGxhY2UvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQSwyQkFBa0M7QUFDbEMsK0JBQTRCO0FBQzVCLHFFQUlvQztBQXNDcEMsU0FBUyxZQUFZLENBQUMsR0FBUTtJQUMxQixPQUFPLEdBQXNCLENBQUM7QUFDbEMsQ0FBQztBQUVELElBQUkseUJBQXlCLEdBQXdDLElBQUksQ0FBQztBQUUxRSxNQUFNLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO0lBQ2pDLFFBQVEsRUFBRSxJQUFBLGlCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLDZDQUE2QyxDQUFDLEVBQUUsT0FBTyxDQUFDO0lBQy9GLEtBQUssRUFBRSxJQUFBLGlCQUFZLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLHlDQUF5QyxDQUFDLEVBQUUsT0FBTyxDQUFDO0lBQ3hGLFNBQVMsRUFBRTtRQUNQLElBQUk7WUFDQSxLQUFLLElBQUEsMENBQW1CLEdBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtnQkFDekMsSUFBSSx5QkFBeUI7b0JBQUUseUJBQXlCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDdkUsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO0tBQ0o7SUFDRCxDQUFDLEVBQUU7UUFDQyxHQUFHLEVBQUUsTUFBTTtRQUNYLFFBQVEsRUFBRSxXQUFXO1FBQ3JCLFFBQVEsRUFBRSxXQUFXO1FBQ3JCLElBQUksRUFBRSxPQUFPO1FBQ2IsUUFBUSxFQUFFLFdBQVc7UUFDckIsU0FBUyxFQUFFLFlBQVk7UUFDdkIsUUFBUSxFQUFFLFdBQVc7UUFDckIsWUFBWSxFQUFFLGVBQWU7UUFDN0IsU0FBUyxFQUFFLFlBQVk7UUFDdkIsU0FBUyxFQUFFLFlBQVk7UUFDdkIsTUFBTSxFQUFFLFNBQVM7UUFDakIsT0FBTyxFQUFFLFVBQVU7UUFDbkIsT0FBTyxFQUFFLFVBQVU7UUFDbkIsVUFBVSxFQUFFLGFBQWE7UUFDekIsV0FBVyxFQUFFLGNBQWM7UUFDM0IsWUFBWSxFQUFFLGVBQWU7UUFDN0IsY0FBYyxFQUFFLGlCQUFpQjtRQUNqQyxZQUFZLEVBQUUsZUFBZTtRQUM3QixPQUFPLEVBQUUsVUFBVTtRQUNuQixVQUFVLEVBQUUsYUFBYTtRQUN6QixrQkFBa0IsRUFBRSxxQkFBcUI7UUFDekMsY0FBYyxFQUFFLGlCQUFpQjtRQUNqQyxnQkFBZ0IsRUFBRSxtQkFBbUI7UUFDckMsY0FBYyxFQUFFLGlCQUFpQjtRQUNqQyxRQUFRLEVBQUUsV0FBVztRQUNyQixPQUFPLEVBQUUsVUFBVTtRQUNuQixTQUFTLEVBQUUsWUFBWTtRQUN2QixhQUFhLEVBQUUsZ0JBQWdCO1FBQy9CLG9CQUFvQixFQUFFLHVCQUF1QjtRQUM3QyxTQUFTLEVBQUUsWUFBWTtRQUN2QixRQUFRLEVBQUUsV0FBVztRQUNyQixnQkFBZ0IsRUFBRSxtQkFBbUI7UUFDckMsU0FBUyxFQUFFLFlBQVk7S0FDMUI7SUFDRCxLQUFLO1FBQ0QsTUFBTSxDQUFDLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvQixJQUFJLFFBQVEsR0FBUSxJQUFJLENBQUM7UUFDekIsSUFBSSxXQUFXLEdBQVEsSUFBSSxDQUFDO1FBQzVCLElBQUksZUFBZSxHQUFRLElBQUksQ0FBQztRQUNoQyxJQUFJLGlCQUFpQixHQUFHLElBQUEsK0NBQXdCLEVBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pGLElBQUksa0JBQWtCLEdBQUcsRUFBRSxDQUFDO1FBQzVCLElBQUksdUJBQXVCLEdBQVUsRUFBRSxDQUFDO1FBQ3hDLElBQUksbUJBQW1CLEdBQVEsSUFBSSxDQUFDO1FBQ3BDLElBQUksYUFBYSxHQUFVLEVBQUUsQ0FBQztRQUM5QixJQUFJLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUM3QixJQUFJLHFCQUFxQixHQUFvQyxJQUFJLENBQUM7UUFDbEUsSUFBSSx3QkFBd0IsR0FBRyxLQUFLLENBQUM7UUFDckMsTUFBTSxZQUFZLEdBQWtDLEVBQUUsQ0FBQztRQUN2RCxNQUFNLFNBQVMsR0FBNkYsRUFBRSxDQUFDO1FBRS9HLE1BQU0sU0FBUyxHQUFHLENBQUMsSUFBWSxFQUFFLElBQUksR0FBRyxNQUFNLEVBQUUsRUFBRTtZQUM5QyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU07Z0JBQUUsT0FBTztZQUN0QixDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7WUFDNUIsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQyxDQUFDLENBQUM7UUFFRixNQUFNLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxTQUFTLENBQUM7UUFDdkYsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLENBQUM7UUFDOUQsTUFBTSxXQUFXLEdBQUcsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksU0FBUyxDQUFDO1FBQzNGLE1BQU0sV0FBVyxHQUFHLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFDckYsTUFBTSxRQUFRLEdBQUcsR0FBRyxFQUFFO1lBQ2xCLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM5RCxPQUFPO2dCQUNILEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDO2dCQUM3QyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztnQkFDMUMsUUFBUTtnQkFDUixXQUFXLEVBQUUsUUFBUTtnQkFDckIsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUM7YUFDeEQsQ0FBQztRQUNOLENBQUMsQ0FBQztRQUNGLE1BQU0sV0FBVyxHQUFHLENBQUMsVUFBa0IsRUFBRSxFQUFFO1lBQ3ZDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDO2dCQUFFLFNBQVMsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQ3RGLE9BQU8sU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2pDLENBQUMsQ0FBQztRQUNGLE1BQU0sV0FBVyxHQUFHLENBQUMsVUFBa0IsRUFBRSxFQUFFO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLFFBQVEsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sUUFBUSxHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUN6QyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNwQixLQUFLLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztnQkFDcEIsS0FBSyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUM7WUFDdkIsQ0FBQztZQUNELElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3JCLEtBQUssQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDO2dCQUN2QixLQUFLLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUM5QixDQUFDO1lBQ0QsT0FBTyxLQUFLLENBQUM7UUFDakIsQ0FBQyxDQUFDO1FBRUYsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLE1BQVcsRUFBRSxFQUFFO1lBQ3ZDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxNQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLE1BQU0sSUFBSSxNQUFNLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQztZQUNsRyxJQUFJLENBQUMsUUFBUTtnQkFBRSxPQUFPO1lBQ3RCLElBQUkseUJBQXlCLEVBQUUsQ0FBQztnQkFDNUIseUJBQXlCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDeEMsQ0FBQztpQkFBTSxJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDcEIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO2dCQUM1QixDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7WUFDaEMsQ0FBQztZQUNELEtBQUssSUFBQSwyQ0FBb0IsRUFBQyxRQUFRLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUM7UUFFRixNQUFNLGFBQWEsR0FBRyxDQUFDLElBQVMsRUFBRSxFQUFFO1lBQ2hDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTztnQkFBRSxPQUFPO1lBQ3ZCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDUixDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsR0FBRyxpQ0FBaUMsQ0FBQztnQkFDeEQsT0FBTztZQUNYLENBQUM7WUFDRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQztZQUN0QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQztZQUN0QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQztZQUNwQyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsR0FBRztnQkFDbEIsV0FBVyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxZQUFZLENBQUMsWUFBWTtnQkFDNUQsVUFBVSxNQUFNLENBQUMsS0FBSyxJQUFJLENBQUMsU0FBUyxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsUUFBUSxNQUFNLENBQUMsS0FBSyxJQUFJLENBQUMsV0FBVztnQkFDMUYsV0FBVyxNQUFNLENBQUMsT0FBTyxJQUFJLENBQUMsUUFBUSxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsUUFBUSxNQUFNLENBQUMsS0FBSyxJQUFJLENBQUMsV0FBVztnQkFDNUYsV0FBVyxLQUFLLENBQUMsU0FBUyxJQUFJLENBQUMsT0FBTyxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsT0FBTyxJQUFJLENBQUMsV0FBVztnQkFDeEYsV0FBVyxLQUFLLENBQUMsU0FBUyxJQUFJLENBQUMsT0FBTyxLQUFLLENBQUMsMEJBQTBCLElBQUksQ0FBQyxjQUFjO2FBQzVGLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2YsQ0FBQyxDQUFDO1FBRUYsTUFBTSxhQUFhLEdBQUcsQ0FBQyxJQUFTLEVBQUUsRUFBRTtZQUNoQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU87Z0JBQUUsT0FBTztZQUN2QixNQUFNLE9BQU8sR0FBRyxJQUFJLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN4RSxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZCLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxHQUFHLG9DQUFvQyxDQUFDO2dCQUMzRCxPQUFPO1lBQ1gsQ0FBQztZQUNELENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQVMsRUFBRSxLQUFhLEVBQUUsRUFBRTtnQkFDeEUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQzdCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDO2dCQUNqQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQztnQkFDakMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3RDLE1BQU0sSUFBSSxHQUFHLEtBQUssSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNqRSxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDaEQsT0FBTztvQkFDSCx5QkFBeUIsSUFBSSxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsRUFBRSxpQkFBaUIsS0FBSyx1QkFBdUIsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLElBQUk7b0JBQzdKLDRDQUE0QyxLQUFLLElBQUk7b0JBQ3JELHVCQUF1QixLQUFLLElBQUksR0FBRyxTQUFTO29CQUM1Qyx3QkFBd0IsVUFBVSxDQUFDLE1BQU0sQ0FBQyxZQUFZLElBQUksTUFBTSxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxTQUFTO29CQUN6Ryx3QkFBd0IsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLElBQUksYUFBYSxDQUFDLFNBQVM7b0JBQ3pFLHdCQUF3QixVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxFQUFFLENBQUMsU0FBUztvQkFDOUQsV0FBVztvQkFDWCxxRkFBcUYsS0FBSyxxQkFBcUIsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLGVBQWU7b0JBQy9KLG9GQUFvRixLQUFLLHFCQUFxQixRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsZUFBZTtvQkFDL0osMENBQTBDLEtBQUssS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsMENBQTBDO29CQUMzSCx5Q0FBeUMsS0FBSyxLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxjQUFjO29CQUM5RiwyQ0FBMkMsS0FBSyxLQUFLLFlBQVksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxnQ0FBZ0M7b0JBQ2hJLFFBQVE7aUJBQ1gsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDZixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFvQixlQUFlLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtnQkFDOUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7b0JBQ2xDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDaEQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQ25ELE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDM0QsSUFBSSxJQUFJLElBQUksQ0FBQyxDQUFDLFNBQVM7d0JBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO29CQUNsRCxJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQ3RCLGNBQWMsQ0FBQyxDQUFDO2dDQUNaLElBQUk7Z0NBQ0osQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztnQ0FDdEIsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztnQ0FDdEIsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSztnQ0FDeEIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTTs2QkFDN0IsQ0FBQyxDQUFDLENBQUM7d0JBQ0osa0JBQWtCLEdBQUcsSUFBSSxDQUFDO3dCQUMxQixrQkFBa0IsRUFBRSxDQUFDO29CQUN6QixDQUFDO2dCQUNMLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7WUFDSCxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFvQixZQUFZLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtnQkFDM0UsTUFBTSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7b0JBQ2xDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDaEQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ2pFLE1BQU0sUUFBUSxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ3RGLFFBQVEsQ0FBQyxVQUFVLEVBQUUsa0JBQWtCLElBQUksUUFBUSxDQUFDLENBQUM7Z0JBQ3pELENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7WUFDSCxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFvQixhQUFhLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtnQkFDNUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7b0JBQ2xDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDaEQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ2pFLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDMUIsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sYUFBYSxHQUFHLENBQUMsUUFBZ0IsRUFBRSxLQUE2QixFQUFFLEVBQUU7Z0JBQ3RFLENBQUMsQ0FBQyxPQUFRLENBQUMsZ0JBQWdCLENBQW1CLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO29CQUN0RSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTt3QkFDbEMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUMvQyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7d0JBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQzt3QkFDakUsSUFBSSxDQUFDLFVBQVU7NEJBQUUsT0FBTzt3QkFDeEIsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO3dCQUN6QyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQzt3QkFDaEMsSUFBSSxZQUFZLENBQUMsVUFBVSxDQUFDLElBQUksUUFBUSxDQUFDLFlBQVksRUFBRSxDQUFDOzRCQUNwRCxRQUFRLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQzt3QkFDaEQsQ0FBQztvQkFDTCxDQUFDLENBQUMsQ0FBQztnQkFDUCxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUMsQ0FBQztZQUNGLGFBQWEsQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDekMsYUFBYSxDQUFDLGVBQWUsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUMzQyxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFjLFlBQVksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUNsRSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7b0JBQ3ZDLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztvQkFDdkIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7b0JBQy9CLElBQUksS0FBSyxDQUFDLFlBQVk7d0JBQUUsS0FBSyxDQUFDLFlBQVksQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDO2dCQUNuRSxDQUFDLENBQUMsQ0FBQztnQkFDSCxHQUFHLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtvQkFDbkMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3RDLENBQUMsQ0FBQyxDQUFDO2dCQUNILEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRTtvQkFDbkMsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUN2QixHQUFHLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztvQkFDbEMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUM3QyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDakUsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLFlBQVksSUFBSSxLQUFLLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsSUFBSSxrQkFBa0IsQ0FBQztvQkFDbEcsSUFBSSxJQUFJLElBQUksQ0FBQyxDQUFDLFNBQVM7d0JBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO29CQUNsRCxrQkFBa0IsR0FBRyxJQUFJLElBQUksa0JBQWtCLENBQUM7b0JBQ2hELFFBQVEsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQy9CLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQyxDQUFDLENBQUM7WUFDSCxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFvQixjQUFjLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtnQkFDN0UsTUFBTSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7b0JBQ2xDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDaEQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUM1QixNQUFNLFVBQVUsR0FBRyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ2pFLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDM0IsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQztRQUVGLE1BQU0sYUFBYSxHQUFHLENBQUMsSUFBUyxFQUFFLEVBQUU7WUFDaEMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPO2dCQUFFLE9BQU87WUFDdkIsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNSLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxHQUFHLGdDQUFnQyxDQUFDO2dCQUN2RCxPQUFPO1lBQ1gsQ0FBQztZQUNELE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDNUUsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN6RSxNQUFNLGVBQWUsR0FBRyxDQUFDLENBQUMsbUJBQW1CLENBQUM7WUFDOUMsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxhQUFhLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2pILE1BQU0sU0FBUyxHQUE0QixFQUFFLENBQUM7WUFDOUMsS0FBSyxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsSUFBSSxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUN0QyxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSTtvQkFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUNuRCxDQUFDO1lBQ0QsTUFBTSxNQUFNLEdBQUcsZUFBZTtnQkFDMUIsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRTtvQkFDMUIsTUFBTSxLQUFLLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBUyxFQUFFLEVBQUUsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdEksSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7d0JBQUUsT0FBTyxJQUFJLENBQUM7b0JBQ3BDLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNuRCx1Q0FDTyxJQUFJLEtBQ1AsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksRUFDN0IsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksRUFDN0IsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssRUFDaEMsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sRUFDbkMsV0FBVyxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQ3pCLFFBQVEsRUFBRSxLQUFLLElBQ2pCO2dCQUNOLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUM7Z0JBQ2xCLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFDaEIsTUFBTSxLQUFLLEdBQUcsZUFBZTtnQkFDekIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDOUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQztZQUNmLE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQVMsRUFBRSxLQUFhLEVBQUUsRUFBRSxDQUFDO2dCQUNwRSwyRkFBMkYsS0FBSyxnQkFBZ0IsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLElBQUk7Z0JBQy9JLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGFBQWEsSUFBSSxDQUFDLE9BQU8sTUFBTSxDQUFDLENBQUMsQ0FBQyx1Q0FBdUM7Z0JBQ3hGLGdCQUFnQixVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsS0FBSyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sQ0FBQyxTQUFTO2dCQUMxRyxVQUFVLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLFVBQVU7Z0JBQzNHLFdBQVc7YUFDZCxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNyQixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsS0FBYSxFQUFFLEVBQUUsQ0FBQztnQkFDbEUseUZBQXlGLEtBQUssZ0JBQWdCLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxJQUFJO2dCQUM3SSxnQkFBZ0IsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLEtBQUssVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLFNBQVM7Z0JBQ3hGLFVBQVUsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxVQUFVO2dCQUN6RixXQUFXO2FBQ2QsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDckIsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxTQUFTLEdBQUc7Z0JBQ2xCLGVBQWU7b0JBQ1gsQ0FBQyxDQUFDLHNDQUFzQyxhQUFhLENBQUMsTUFBTSxVQUFVLE1BQU0sQ0FBQyxNQUFNLElBQUksU0FBUyxDQUFDLE1BQU0sU0FBUyxLQUFLLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxNQUFNLFFBQVE7b0JBQ3ZKLENBQUMsQ0FBQyxFQUFFO2dCQUNSLDZEQUE2RCxNQUFNLENBQUMsTUFBTSxHQUFHLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsa0NBQWtDLFNBQVMsSUFBSSwrQkFBK0IsY0FBYztnQkFDdE4sNkRBQTZELEtBQUssQ0FBQyxNQUFNLEdBQUcsZUFBZSxDQUFDLENBQUMsQ0FBQyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxrQ0FBa0MsUUFBUSxJQUFJLCtCQUErQixjQUFjO2FBQ3ROLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ1gsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBb0IsY0FBYyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7Z0JBQzdFLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO29CQUNsQyxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ3ZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDaEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQy9ELElBQUksQ0FBQyxNQUFNO3dCQUFFLE9BQU87b0JBQ3BCLGtCQUFrQixHQUFHLE1BQU0sQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDO29CQUN2QyxJQUFJLENBQUMsQ0FBQyxTQUFTO3dCQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLGtCQUFrQixDQUFDO29CQUN4RCxNQUFNLEtBQUssR0FBRyxJQUFJLEtBQUssT0FBTzt3QkFDMUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQzt3QkFDekQsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ2YsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUN0QixrQkFBa0IsRUFBRSxDQUFDO2dCQUN6QixDQUFDLENBQUMsQ0FBQztnQkFDSCxNQUFNLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7b0JBQzNDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDdkMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO29CQUMxQixJQUFJLENBQUMsQ0FBQyxTQUFTO3dCQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLGtCQUFrQixDQUFDO29CQUN4RCxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUUsQ0FBQzt3QkFDckIsS0FBSyxDQUFDLFlBQVksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDO3dCQUMxQyxLQUFLLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ25ELENBQUM7b0JBQ0Qsa0JBQWtCLEVBQUUsQ0FBQztnQkFDekIsQ0FBQyxDQUFDLENBQUM7WUFDUCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQztRQUVGLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxJQUFTLEVBQUUsRUFBRTtZQUN4QyxPQUFPLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssY0FBYyxDQUFDLENBQUM7UUFDakYsQ0FBQyxDQUFDO1FBRUYsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLE1BQWMsRUFBRSxFQUFFO1lBQzFDLElBQUksTUFBTSxLQUFLLFNBQVM7Z0JBQUUsT0FBTyxPQUFPLENBQUM7WUFDekMsSUFBSSxNQUFNLEtBQUssY0FBYztnQkFBRSxPQUFPLFNBQVMsQ0FBQztZQUNoRCxPQUFPLElBQUksQ0FBQztRQUNoQixDQUFDLENBQUM7UUFFRixNQUFNLGNBQWMsR0FBRyxDQUFDLElBQVMsRUFBRSxFQUFFO1lBQ2pDLElBQUksQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUNuQixJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUN2QixDQUFDLENBQUMsY0FBYyxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUM7Z0JBQzNDLENBQUM7cUJBQU0sQ0FBQztvQkFDSixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO29CQUNyQixDQUFDLENBQUMsY0FBYyxDQUFDLFdBQVc7d0JBQ3hCLE1BQU0sQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLFlBQVksSUFBSSxDQUFDLEtBQUs7NEJBQ3ZELFdBQVcsQ0FBQyxDQUFDLGdCQUFnQixJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUNwRSxDQUFDO1lBQ0wsQ0FBQztZQUNELElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUTtnQkFBRSxPQUFPO1lBQ3hCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDUixDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxrREFBa0QsQ0FBQztnQkFDMUUsT0FBTztZQUNYLENBQUM7WUFDRCxNQUFNLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQy9FLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDbkUsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztZQUN0RixJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZCLENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLG9DQUFvQyxDQUFDO2dCQUM1RCxPQUFPO1lBQ1gsQ0FBQztZQUNELENBQUMsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFO2dCQUMzRCxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxTQUFTLENBQUMsQ0FBQztnQkFDaEQsTUFBTSxXQUFXLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQy9DLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2pHLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLElBQUksRUFBRSxDQUFDO2dCQUNuQyxPQUFPO29CQUNILDhCQUE4QixNQUFNLGdCQUFnQixVQUFVLENBQUMsUUFBUSxDQUFDLFlBQVksVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJO29CQUM1RyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxhQUFhLElBQUksQ0FBQyxPQUFPLE1BQU0sQ0FBQyxDQUFDLENBQUMsdUNBQXVDO29CQUN4Riw2QkFBNkI7b0JBQzdCLE1BQU0sVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sQ0FBQyxNQUFNO29CQUMvRSxVQUFVLFVBQVUsQ0FBQyxXQUFXLENBQUMsTUFBTSxJQUFJLENBQUMsV0FBVyxJQUFJLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxVQUFVO29CQUN4SSxLQUFLLENBQUMsQ0FBQyxDQUFDLFVBQVUsVUFBVSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFVBQVUsVUFBVSxDQUFDLFFBQVEsQ0FBQyxVQUFVO29CQUN4RixTQUFTO29CQUNULFdBQVc7aUJBQ2QsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDZixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDWixDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFvQixjQUFjLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtnQkFDOUUsTUFBTSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7b0JBQ2xDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztvQkFDdkMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLGVBQWU7d0JBQUUsT0FBTztvQkFDdEMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO29CQUMxQixJQUFJLENBQUMsQ0FBQyxTQUFTO3dCQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztvQkFDMUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxlQUFlLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFLENBQzdELElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FDaEgsQ0FBQztvQkFDRixNQUFNLEtBQUssR0FBRyxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO3dCQUNoRCxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7NEJBQ2pDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSTs0QkFDZixDQUFDLEVBQUUsSUFBSSxDQUFDLE9BQU87NEJBQ2YsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPOzRCQUNmLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSzs0QkFDakIsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO3lCQUN0QixDQUFDLENBQUM7d0JBQ0gsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDVCxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQ3RCLGtCQUFrQixFQUFFLENBQUM7b0JBQ3JCLFNBQVMsQ0FBQyxVQUFVLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUN0QyxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFDO1FBRUYsTUFBTSxrQkFBa0IsR0FBRyxHQUFHLEVBQUU7WUFDNUIsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPO2dCQUFFLE9BQU87WUFDdkIsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBb0IsY0FBYyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7Z0JBQzdFLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsa0JBQWtCLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssa0JBQWtCLENBQUMsQ0FBQztZQUM1RyxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUMsQ0FBQztRQUVGLE1BQU0sZUFBZSxHQUFHLEdBQUcsRUFBRTtZQUN6Qix1QkFBdUIsR0FBRyxFQUFFLENBQUM7WUFDN0IsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1lBQzNCLGFBQWEsR0FBRyxFQUFFLENBQUM7WUFDbkIsb0JBQW9CLEVBQUUsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFFRixNQUFNLG9CQUFvQixHQUFHLEdBQUcsRUFBRTtZQUM5QixJQUFJLENBQUMsQ0FBQyxDQUFDLGNBQWMsSUFBSSxDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTTtnQkFBRSxPQUFPO1lBQ3hGLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqRCxNQUFNLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEQsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDO1lBQzNDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxZQUFZLENBQUMsWUFBWSxJQUFJLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztnQkFDbkIsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsRUFBRSxJQUFJLENBQUM7Z0JBQ3pDLENBQUMsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxHQUFHLEVBQUUsSUFBSSxDQUFDO1lBQzlDLENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBRyxDQUFDLElBQVMsRUFBRSxFQUFFO2dCQUMxQixNQUFNLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQztnQkFDN0MsTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQy9ELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQ2pFLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUN4QyxDQUFDLENBQUM7WUFDRixNQUFNLE9BQU8sR0FBRyxDQUFDLHVCQUF1QixJQUFJLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ3RFLE1BQU0sQ0FBQyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDeEIsT0FBTyxnQ0FBZ0MsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxHQUFHLFlBQVksQ0FBQyxDQUFDLEtBQUssYUFBYSxDQUFDLENBQUMsTUFBTSxZQUFZLENBQUM7WUFDakssQ0FBQyxDQUFDLENBQUM7WUFDSCxNQUFNLGFBQWEsR0FBYSxFQUFFLENBQUM7WUFDbkMsSUFBSSxtQkFBbUIsSUFBSSxtQkFBbUIsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDekYsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUM7Z0JBQ3ZDLE1BQU0sS0FBSyxHQUFHLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO2dCQUMvSyxhQUFhLENBQUMsSUFBSSxDQUNkLDJDQUEyQyxDQUFDLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxHQUFHLFlBQVksQ0FBQyxDQUFDLEtBQUssYUFBYSxDQUFDLENBQUMsTUFBTSxNQUFNO29CQUM5RyxTQUFTLFVBQVUsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUM1QyxDQUFDO1lBQ04sQ0FBQztZQUNELENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLENBQUMsQ0FBQztRQUVGLE1BQU0sY0FBYyxHQUFHLENBQUMsS0FBWSxFQUFFLEVBQUU7WUFDcEMsTUFBTSxZQUFZLEdBQUcsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUMvRix1QkFBdUIsR0FBRyxZQUFZLENBQUM7WUFDdkMsb0JBQW9CLEVBQUUsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFFRixNQUFNLGdCQUFnQixHQUFHLENBQUMsR0FBUSxFQUFFLEVBQUU7WUFDbEMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJO2dCQUFFLE9BQU87WUFDOUIsa0JBQWtCLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztZQUM5QixJQUFJLENBQUMsQ0FBQyxTQUFTO2dCQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLGtCQUFrQixDQUFDO1lBQ3hELG1CQUFtQixHQUFHLElBQUksQ0FBQztZQUMzQixhQUFhLEdBQUcsRUFBRSxDQUFDO1lBQ25CLElBQUksS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbEIsSUFBSSxHQUFHLENBQUMsUUFBUSxJQUFJLFdBQVcsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO2dCQUN6RSxNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNyRyxJQUFJLE9BQU8sSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDNUUsS0FBSyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7Z0JBQzdCLENBQUM7WUFDTCxDQUFDO1lBQ0QsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3RCLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMzQixrQkFBa0IsRUFBRSxDQUFDO1lBQ3JCLFNBQVMsQ0FBQyxVQUFVLEdBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUM7UUFFRixNQUFNLHFCQUFxQixHQUFHLENBQUMsS0FBaUIsRUFBbUMsRUFBRTtZQUNqRixJQUFJLENBQUMsQ0FBQyxDQUFDLFlBQVksSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNO2dCQUFFLE9BQU8sSUFBSSxDQUFDO1lBQ3hFLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxZQUFZLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNwRCxJQUFJLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQztZQUNyRCxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7WUFDckMsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQ3BDLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsTUFBTTtnQkFBRSxPQUFPLElBQUksQ0FBQztZQUN6RSxNQUFNLEVBQUUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakQsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xELE9BQU87Z0JBQ0gsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRCxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLENBQUM7YUFDdEQsQ0FBQztRQUNOLENBQUMsQ0FBQztRQUVGLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBMkIsRUFBRSxDQUEyQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2xGLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyQixDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckIsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUM5QixDQUFDLENBQUM7UUFFSCxNQUFNLG9CQUFvQixHQUFHLENBQUMsQ0FBTSxFQUFFLENBQU0sRUFBVSxFQUFFO1lBQ3BELElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3ZCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMxRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDekQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqSCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BILE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQztRQUNqRSxDQUFDLENBQUM7UUFFRixNQUFNLG1CQUFtQixHQUFHLENBQUMsSUFBUyxFQUFFLEVBQUU7WUFDdEMsTUFBTSxJQUFJLEdBQUcsV0FBVyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDcEYsTUFBTSxRQUFRLEdBQUcsSUFBSTtpQkFDaEIsTUFBTSxDQUFDLENBQUMsR0FBUSxFQUFFLEVBQUUsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksb0JBQW9CLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztpQkFDckcsSUFBSSxDQUFDLENBQUMsQ0FBTSxFQUFFLENBQU0sRUFBRSxFQUFFO2dCQUNyQixNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ2xGLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDbEYsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQ25CLENBQUMsQ0FBQyxDQUFDO1lBQ1AsYUFBYSxHQUFHLFFBQVEsQ0FBQztZQUN6Qix1QkFBdUIsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUNoRCxvQkFBb0IsRUFBRSxDQUFDO1lBQ3ZCLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUMzQixrQkFBa0IsRUFBRSxDQUFDO1lBQ3JCLFNBQVMsQ0FBQyxRQUFRLFFBQVEsQ0FBQyxNQUFNLEtBQUssRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzdFLENBQUMsQ0FBQztRQUVGLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxLQUFpQixFQUFFLEVBQUU7WUFDaEQsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUM7Z0JBQUUsT0FBTztZQUMvQixNQUFNLEtBQUssR0FBRyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMzQyxJQUFJLENBQUMsS0FBSztnQkFBRSxPQUFPO1lBQ25CLGdCQUFnQixHQUFHLElBQUksQ0FBQztZQUN4QixxQkFBcUIsR0FBRyxLQUFLLENBQUM7WUFDOUIsdUJBQXVCLEdBQUcsRUFBRSxDQUFDO1lBQzdCLG1CQUFtQixHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDdEUsYUFBYSxHQUFHLEVBQUUsQ0FBQztZQUNuQixvQkFBb0IsRUFBRSxDQUFDO1lBQ3ZCLEtBQUssQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUMzQixDQUFDLENBQUM7UUFFRixNQUFNLHNCQUFzQixHQUFHLENBQUMsS0FBaUIsRUFBRSxFQUFFO1lBQ2pELElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLHFCQUFxQjtnQkFBRSxPQUFPO1lBQ3hELE1BQU0sS0FBSyxHQUFHLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzNDLElBQUksQ0FBQyxLQUFLO2dCQUFFLE9BQU87WUFDbkIsbUJBQW1CLEdBQUcsY0FBYyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25FLG9CQUFvQixFQUFFLENBQUM7WUFDdkIsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQzNCLENBQUMsQ0FBQztRQUVGLE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxLQUFpQixFQUFFLEVBQUU7WUFDakQsSUFBSSxDQUFDLGdCQUFnQixJQUFJLENBQUMscUJBQXFCO2dCQUFFLE9BQU87WUFDeEQsTUFBTSxLQUFLLEdBQUcscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDM0MsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO1lBQ3pCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDVCxxQkFBcUIsR0FBRyxJQUFJLENBQUM7Z0JBQzdCLE9BQU87WUFDWCxDQUFDO1lBQ0QsTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFELHFCQUFxQixHQUFHLElBQUksQ0FBQztZQUM3QixJQUFJLElBQUksQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BDLG1CQUFtQixHQUFHLElBQUksQ0FBQztnQkFDM0IsYUFBYSxHQUFHLEVBQUUsQ0FBQztnQkFDbkIsb0JBQW9CLEVBQUUsQ0FBQztnQkFDdkIsYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUMzQixPQUFPO1lBQ1gsQ0FBQztZQUNELHdCQUF3QixHQUFHLElBQUksQ0FBQztZQUNoQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7WUFDM0IsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUIsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQzNCLENBQUMsQ0FBQztRQUVGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxLQUFpQixFQUFFLEVBQUU7WUFDM0MsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO2dCQUMzQix3QkFBd0IsR0FBRyxLQUFLLENBQUM7Z0JBQ2pDLE9BQU87WUFDWCxDQUFDO1lBQ0QsSUFBSSxDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDO2dCQUFFLE9BQU87WUFDdkcsTUFBTSxLQUFLLEdBQUcscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDM0MsSUFBSSxDQUFDLEtBQUs7Z0JBQUUsT0FBTztZQUNuQixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ25CLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbkIsTUFBTSxVQUFVLEdBQUcsV0FBVyxDQUFDLElBQUk7aUJBQzlCLEdBQUcsQ0FBQyxDQUFDLEdBQVEsRUFBRSxLQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztpQkFDbEQsTUFBTSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQU8sRUFBRSxFQUFFLENBQUMsR0FBRztnQkFDekIsRUFBRSxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUMxQyxFQUFFLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztnQkFDdkMsRUFBRSxJQUFJLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2xELElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDO2dCQUFFLE9BQU87WUFDcEMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQU0sRUFBRSxDQUFNLEVBQUUsRUFBRTtnQkFDL0IsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQzFGLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO2dCQUMxRixJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLElBQUk7b0JBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDO2dCQUM3QyxPQUFPLENBQUMsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQztZQUM3QixDQUFDLENBQUMsQ0FBQztZQUNILGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxLQUFLLElBQUksRUFBRTtZQUNwQixJQUFJLENBQUM7Z0JBQ0QsU0FBUyxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDNUIsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FDdkMsZ0JBQWdCLEVBQ2hCLG1DQUFtQyxFQUNuQyxPQUFPLEVBQUUsRUFDVCxPQUFPLEVBQUUsRUFDVCxXQUFXLEVBQUUsQ0FDaEIsQ0FBQztnQkFDRixJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxFQUFFLENBQUM7b0JBQ3RDLFNBQVMsQ0FBQyxRQUFRLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLGVBQWUsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUN4RSxPQUFPLE1BQU0sQ0FBQztnQkFDbEIsQ0FBQztnQkFDRCxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDM0IsUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ3ZCLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDeEIsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUN4QixTQUFTLENBQUMsa0NBQWtDLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3BELE9BQU8sTUFBTSxDQUFDO1lBQ2xCLENBQUM7WUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO2dCQUNsQixTQUFTLENBQUMsUUFBUSxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxLQUFLLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDOUQsT0FBTyxJQUFJLENBQUM7WUFDaEIsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLE1BQU0sV0FBVyxHQUFHLEtBQUssSUFBSSxFQUFFO1lBQzNCLElBQUksQ0FBQztnQkFDRCxTQUFTLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUM5QixNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUN2QyxnQkFBZ0IsRUFDaEIsd0JBQXdCLEVBQ3hCLE9BQU8sRUFBRSxFQUNULElBQUksQ0FDUCxDQUFDO2dCQUNGLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3RELFNBQVMsQ0FBQyxVQUFVLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLGVBQWUsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUMxRSxPQUFPO2dCQUNYLENBQUM7Z0JBQ0Qsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7Z0JBQ3pCLFdBQVcsR0FBRyxJQUFJLENBQUM7Z0JBQ25CLElBQUksQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDO29CQUNqQixDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsbUJBQW1CLElBQUksRUFBRSxDQUFDO29CQUNwRCxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztvQkFDbEQsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsR0FBRyxFQUFFO3dCQUN6QixJQUFJLENBQUMsQ0FBQyxjQUFjLElBQUksQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDOzRCQUNyQyxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLFdBQVcsSUFBSSxDQUFDOzRCQUNqRSxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDLENBQUMsWUFBWSxDQUFDLFlBQVksSUFBSSxDQUFDO3dCQUN2RSxDQUFDO29CQUNMLENBQUMsQ0FBQztnQkFDTixDQUFDO2dCQUNELGVBQWUsRUFBRSxDQUFDO2dCQUNsQixhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BCLElBQUksQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUNoQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDL0IsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksS0FBSyxDQUFDLGNBQWMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQzVGLENBQUMsQ0FBQyxXQUFXLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxtQkFBbUI7d0JBQ2hELENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLElBQUksU0FBUyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxNQUFNLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLGFBQWEsRUFBRTt3QkFDcEgsQ0FBQyxDQUFDLGdCQUFnQixDQUFDO2dCQUMzQixDQUFDO2dCQUNELFNBQVMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2xFLENBQUM7WUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO2dCQUNsQixTQUFTLENBQUMsVUFBVSxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxLQUFLLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNwRSxDQUFDO1FBQ0wsQ0FBQyxDQUFDO1FBRUYsTUFBTSxZQUFZLEdBQUcsS0FBSyxJQUFJLEVBQUU7WUFDNUIsSUFBSSxDQUFDO2dCQUNELFNBQVMsQ0FBQyxZQUFZLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ2hDLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQ3ZDLGdCQUFnQixFQUNoQix5QkFBeUIsRUFDekIsT0FBTyxFQUFFLEVBQ1QsSUFBSSxFQUNKLEtBQUssQ0FDUixDQUFDO2dCQUNGLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3RELFNBQVMsQ0FBQyxVQUFVLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLGVBQWUsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUMxRSxPQUFPO2dCQUNYLENBQUM7Z0JBQ0Qsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzNCLGVBQWUsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUM5QixjQUFjLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ2hDLE1BQU0sQ0FBQyxHQUFHLGVBQWUsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUN0QyxNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQy9ELFNBQVMsQ0FDTCxTQUFTLEdBQUcsQ0FBQztvQkFDVCxDQUFDLENBQUMsVUFBVSxTQUFTLFNBQVM7b0JBQzlCLENBQUMsQ0FBQywyQkFBMkIsRUFDakMsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQ2hDLENBQUM7WUFDTixDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDbEIsU0FBUyxDQUFDLFVBQVUsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDcEUsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxJQUFJLEVBQUU7WUFDbkMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUNuQixTQUFTLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUMvQixPQUFPO1lBQ1gsQ0FBQztZQUNELE1BQU0sT0FBTyxHQUFHLENBQUMsZUFBZSxDQUFDLE9BQU8sSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUM5RSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBUyxFQUFFLEVBQUU7Z0JBQ3BDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sQ0FBQztnQkFDckUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDN0YsT0FBTyxHQUFHLElBQUksS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxLQUFLLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUNsSSxDQUFDLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQztnQkFDRCxNQUFNLFNBQVMsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDdEQsU0FBUyxDQUFDLE9BQU8sS0FBSyxDQUFDLE1BQU0sV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3BELENBQUM7WUFBQyxXQUFNLENBQUM7Z0JBQ0wsU0FBUyxDQUFDLG1CQUFtQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVDLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixNQUFNLHFCQUFxQixHQUFHLEtBQUssSUFBSSxFQUFFO1lBQ3JDLElBQUksQ0FBQztnQkFDRCxTQUFTLENBQUMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNsQyxNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUN2QyxnQkFBZ0IsRUFDaEIsOEJBQThCLEVBQzlCLE9BQU8sRUFBRSxFQUNULEtBQUssQ0FDUixDQUFDO2dCQUNGLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztvQkFDdEMsU0FBUyxDQUFDLFVBQVUsTUFBTSxJQUFJLE1BQU0sQ0FBQyxLQUFLLElBQUksZUFBZSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQzFFLE9BQU87Z0JBQ1gsQ0FBQztnQkFDRCxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDM0IsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQy9CLFNBQVMsQ0FBQyxVQUFVLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDekYsTUFBTSxZQUFZLEVBQUUsQ0FBQztZQUN6QixDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDbEIsU0FBUyxDQUFDLFVBQVUsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDcEUsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLE1BQU0sVUFBVSxHQUFHLEtBQUssRUFBRSxNQUFlLEVBQUUsRUFBRTtZQUN6QyxJQUFJLENBQUM7Z0JBQ0QsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3hELE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQ3ZDLGdCQUFnQixFQUNoQiwyQ0FBMkMsRUFDM0MsT0FBTyxFQUFFLEVBQ1Q7b0JBQ0ksUUFBUSxFQUFFLFdBQVcsRUFBRTtvQkFDdkIsSUFBSSxFQUFFLE9BQU8sRUFBRTtvQkFDZixRQUFRLEVBQUUsV0FBVyxFQUFFO29CQUN2QixLQUFLLEVBQUUsUUFBUSxFQUFFO29CQUNqQixNQUFNO2lCQUNULENBQ0osQ0FBQztnQkFDRixJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLEtBQUssS0FBSyxFQUFFLENBQUM7b0JBQ3RDLFNBQVMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLE1BQU0sTUFBTSxJQUFJLE1BQU0sQ0FBQyxLQUFLLElBQUksZUFBZSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ3BHLE9BQU87Z0JBQ1gsQ0FBQztnQkFDRCxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDM0IsU0FBUyxDQUNMLE1BQU07b0JBQ0YsQ0FBQyxDQUFDLGlCQUFpQixNQUFNLENBQUMsT0FBTyxJQUFJLENBQUMsT0FBTyxNQUFNLENBQUMsT0FBTyxJQUFJLENBQUMsRUFBRTtvQkFDbEUsQ0FBQyxDQUFDLGFBQWEsTUFBTSxDQUFDLE9BQU8sSUFBSSxDQUFDLE9BQU8sTUFBTSxDQUFDLE1BQU0sSUFBSSxDQUFDLE9BQU8sTUFBTSxDQUFDLE9BQU8sSUFBSSxDQUFDLEVBQUUsRUFDM0YsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQ2hDLENBQUM7WUFDTixDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDbEIsU0FBUyxDQUFDLFVBQVUsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDcEUsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLE1BQU0sVUFBVSxHQUFHLEtBQUssSUFBSSxFQUFFO1lBQzFCLElBQUksQ0FBQztnQkFDRCxTQUFTLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUM5QixNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUN2QyxnQkFBZ0IsRUFDaEIsa0JBQWtCLEVBQ2xCLE9BQU8sRUFBRSxDQUNaLENBQUM7Z0JBQ0YsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO29CQUN0QyxTQUFTLENBQUMsVUFBVSxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSxlQUFlLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDMUUsT0FBTztnQkFDWCxDQUFDO2dCQUNELGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMzQixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDL0IsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxRQUFRO29CQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7Z0JBQ2xFLFNBQVMsQ0FBQyxVQUFVLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxVQUFVLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM5RSxDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDbEIsU0FBUyxDQUFDLFVBQVUsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDcEUsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLE1BQU0sVUFBVSxHQUFHLEtBQUssSUFBSSxFQUFFO1lBQzFCLElBQUksQ0FBQztnQkFDRCxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3BDLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztnQkFDMUYsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO29CQUN0QyxTQUFTLENBQUMsZ0JBQWdCLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLGVBQWUsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUNoRixPQUFPO2dCQUNYLENBQUM7Z0JBQ0QsU0FBUyxDQUFDLGNBQWMsTUFBTSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsSUFBSSxJQUFJLFFBQVEsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzdFLENBQUM7WUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO2dCQUNsQixTQUFTLENBQUMsZ0JBQWdCLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxJQUFJLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzFFLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixNQUFNLGlCQUFpQixHQUFHLEtBQUssSUFBSSxFQUFFO1lBQ2pDLElBQUksQ0FBQztnQkFDRCxTQUFTLENBQUMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3JDLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUseUJBQXlCLENBQUMsQ0FBQztnQkFDekYsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO29CQUN0QyxTQUFTLENBQUMsaUJBQWlCLE1BQU0sSUFBSSxNQUFNLENBQUMsS0FBSyxJQUFJLGVBQWUsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUNqRixPQUFPO2dCQUNYLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7Z0JBQy9CLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsUUFBUTtvQkFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUNsRSxTQUFTLENBQUMsZUFBZSxJQUFJLENBQUMsUUFBUSxJQUFJLE1BQU0sQ0FBQyxJQUFJLElBQUksUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0UsQ0FBQztZQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7Z0JBQ2xCLFNBQVMsQ0FBQyxpQkFBaUIsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDM0UsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLE1BQU0sZUFBZSxHQUFHLEdBQUcsRUFBRTtZQUN6QixJQUFJLENBQUMsUUFBUTtnQkFBRSxPQUFPO1lBQ3RCLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN4QixrQkFBa0IsRUFBRSxDQUFDO1FBQ3pCLENBQUMsQ0FBQztRQUVGLE1BQU0saUJBQWlCLEdBQUcsS0FBSyxFQUFFLFVBQWtCLEVBQWdCLEVBQUU7WUFDakUsSUFBSSxZQUFZLENBQUMsVUFBVSxDQUFDO2dCQUFFLE9BQU8sWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzlELFNBQVMsQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDakMsTUFBTSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FDdkMsZ0JBQWdCLEVBQ2hCLDhCQUE4QixFQUM5QixVQUFVLENBQ2IsQ0FBQztZQUNGLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDL0UsU0FBUyxDQUFDLGNBQWMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxLQUFLLElBQUksZUFBZSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQzlFLE9BQU8sSUFBSSxDQUFDO1lBQ2hCLENBQUM7WUFDRCxZQUFZLENBQUMsVUFBVSxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7WUFDaEQsZUFBZSxFQUFFLENBQUM7WUFDbEIsT0FBTyxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDO1FBRUYsTUFBTSxlQUFlLEdBQUcsS0FBSyxFQUFFLFVBQWtCLEVBQUUsSUFBYSxFQUFvQixFQUFFO1lBQ2xGLE1BQU0sUUFBUSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMxQyxJQUFJLENBQUMsUUFBUTtnQkFBRSxPQUFPLElBQUksQ0FBQztZQUMzQixNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUN2QyxnQkFBZ0IsRUFDaEIsNkJBQTZCLEVBQzdCLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUNyQixDQUFDO1lBQ0YsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO2dCQUN0QyxTQUFTLENBQUMsUUFBUSxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSxlQUFlLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDeEUsT0FBTyxLQUFLLENBQUM7WUFDakIsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDO1FBQ2hCLENBQUMsQ0FBQztRQUVGLE1BQU0sVUFBVSxHQUFHLEtBQUssRUFBRSxVQUFrQixFQUFFLEVBQUU7WUFDNUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNkLFNBQVMsQ0FBQyxxQkFBcUIsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDMUMsT0FBTztZQUNYLENBQUM7WUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7Z0JBQzVCLFNBQVMsQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ2xDLE9BQU87WUFDWCxDQUFDO1lBQ0QsSUFBSSxDQUFDO2dCQUNELFNBQVMsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzlCLE1BQU0sRUFBRSxHQUFHLE1BQU0sZUFBZSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbkQsSUFBSSxDQUFDLEVBQUU7b0JBQUUsT0FBTztnQkFDaEIsT0FBTyxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ2hDLE9BQU8sU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUM3QixlQUFlLEVBQUUsQ0FBQztnQkFDbEIsU0FBUyxDQUFDLFNBQVMsVUFBVSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDM0MsQ0FBQztZQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7Z0JBQ2xCLFNBQVMsQ0FBQyxRQUFRLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxJQUFJLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xFLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixNQUFNLFNBQVMsR0FBRyxLQUFLLEVBQUUsVUFBa0IsRUFBRSxFQUFFO1lBQzNDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDZCxTQUFTLENBQUMscUJBQXFCLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQzFDLE9BQU87WUFDWCxDQUFDO1lBQ0QsSUFBSSxDQUFDO2dCQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQ3ZDLGdCQUFnQixFQUNoQiw0QkFBNEIsRUFDNUIsVUFBVSxDQUNiLENBQUM7Z0JBQ0YsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO29CQUN0QyxTQUFTLENBQUMsUUFBUSxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSxlQUFlLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDeEUsT0FBTztnQkFDWCxDQUFDO2dCQUNELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUMvQixTQUFTLENBQUMsT0FBTyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksVUFBVSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDeEUsQ0FBQztZQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7Z0JBQ2xCLFNBQVMsQ0FBQyxRQUFRLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxJQUFJLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xFLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixNQUFNLFFBQVEsR0FBRyxLQUFLLEVBQUUsVUFBa0IsRUFBRSxTQUFrQixFQUFFLEVBQUU7WUFDOUQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNkLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDNUMsT0FBTztZQUNYLENBQUM7WUFDRCxJQUFJLENBQUM7Z0JBQ0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDckQsSUFBSSxDQUFDLFFBQVE7b0JBQUUsT0FBTztnQkFDdEIsTUFBTSxRQUFRLEdBQUcsTUFBTSxlQUFlLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUMxRCxJQUFJLENBQUMsUUFBUTtvQkFBRSxPQUFPO2dCQUN0QixTQUFTLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUM5QixNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUN2QyxnQkFBZ0IsRUFDaEIsZ0NBQWdDLEVBQ2hDLE9BQU8sRUFBRSxFQUNULFVBQVUsRUFDVixTQUFTLEVBQ1QsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUMxQixDQUFDO2dCQUNGLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztvQkFDdEMsNERBQTREO29CQUM1RCw2REFBNkQ7b0JBQzdELE1BQU0sZUFBZSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDeEMsU0FBUyxDQUFDLFVBQVUsTUFBTSxJQUFJLE1BQU0sQ0FBQyxLQUFLLElBQUksZUFBZSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQzFFLE9BQU87Z0JBQ1gsQ0FBQztnQkFDRCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxLQUFLLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxTQUFTO29CQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7Z0JBQ3hFLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDLFNBQVMsSUFBSSxTQUFTLElBQUksRUFBRSxDQUFDO2dCQUMxRSxlQUFlLEVBQUUsQ0FBQztnQkFDbEIsU0FBUyxDQUFDLFVBQVUsS0FBSyxDQUFDLFNBQVMsSUFBSSxTQUFTLElBQUksVUFBVSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDNUUsQ0FBQztZQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7Z0JBQ2xCLElBQUksWUFBWSxDQUFDLFVBQVUsQ0FBQztvQkFBRSxNQUFNLGVBQWUsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ3RFLFNBQVMsQ0FBQyxVQUFVLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxJQUFJLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ3BFLENBQUM7UUFDTCxDQUFDLENBQUM7UUFFRixNQUFNLE1BQU0sR0FBRyxLQUFLLElBQUksRUFBRTtZQUN0QixJQUFJLENBQUM7Z0JBQ0QsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxTQUFTLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksU0FBUyxDQUFDO2dCQUNyRixTQUFTLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUM5QixNQUFNLE1BQU0sR0FBRyxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUN2QyxnQkFBZ0IsRUFDaEIsbUNBQW1DLEVBQ25DLE9BQU8sRUFBRSxFQUNULFNBQVMsRUFDVCxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsRUFBRSxDQUNoQyxDQUFDO2dCQUNGLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE9BQU8sS0FBSyxLQUFLLEVBQUUsQ0FBQztvQkFDdEMsU0FBUyxDQUFDLFFBQVEsTUFBTSxJQUFJLE1BQU0sQ0FBQyxLQUFLLElBQUksZUFBZSxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ3hFLE9BQU87Z0JBQ1gsQ0FBQztnQkFDRCxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDM0IsU0FBUyxDQUFDLFFBQVEsTUFBTSxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsSUFBSSxjQUFjLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUN4RixDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDbEIsU0FBUyxDQUFDLFFBQVEsS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEUsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUVGLE1BQU0sZUFBZSxHQUFHLEtBQUssSUFBSSxFQUFFO1lBQy9CLElBQUksQ0FBQztnQkFDRCxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxrQkFBa0IsSUFBSSxTQUFTLENBQUM7Z0JBQzNHLFNBQVMsQ0FBQyxlQUFlLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ25DLE1BQU0sTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQ3ZDLGdCQUFnQixFQUNoQixxQ0FBcUMsRUFDckMsT0FBTyxFQUFFLEVBQ1QsU0FBUyxFQUNULFFBQVEsRUFBRSxDQUNiLENBQUM7Z0JBQ0YsSUFBSSxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRSxDQUFDO29CQUN0QyxTQUFTLENBQUMsV0FBVyxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssSUFBSSxlQUFlLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztvQkFDM0UsT0FBTztnQkFDWCxDQUFDO2dCQUNELGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUMzQixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDakMsSUFBSSxLQUFLLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxTQUFTO29CQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7Z0JBQ3hFLFNBQVMsQ0FBQyxXQUFXLEtBQUssQ0FBQyxTQUFTLElBQUksU0FBUyxJQUFJLGNBQWMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ2pGLENBQUM7WUFBQyxPQUFPLEtBQVUsRUFBRSxDQUFDO2dCQUNsQixTQUFTLENBQUMsV0FBVyxLQUFLLElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxLQUFLLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNyRSxDQUFDO1FBQ0wsQ0FBQyxDQUFDO1FBRUYseUJBQXlCLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtZQUMxQyxNQUFNLFFBQVEsR0FBRyxJQUFBLCtDQUF3QixFQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2pELE1BQU0sWUFBWSxHQUFHLGlCQUFpQixDQUFDO1lBQ3ZDLGlCQUFpQixHQUFHLFFBQVEsQ0FBQztZQUM3QixJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDYixDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7Z0JBQzVCLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQztZQUNoQyxDQUFDO1lBQ0QsSUFBSSxRQUFRLEtBQUssWUFBWTtnQkFBRSxPQUFPO1lBRXRDLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDaEIsV0FBVyxHQUFHLElBQUksQ0FBQztZQUNuQixlQUFlLEdBQUcsSUFBSSxDQUFDO1lBQ3ZCLGtCQUFrQixHQUFHLEVBQUUsQ0FBQztZQUN4Qix1QkFBdUIsR0FBRyxFQUFFLENBQUM7WUFDN0IsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1lBQzNCLGFBQWEsR0FBRyxFQUFFLENBQUM7WUFDbkIsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO1lBQ3pCLHFCQUFxQixHQUFHLElBQUksQ0FBQztZQUM3Qix3QkFBd0IsR0FBRyxLQUFLLENBQUM7WUFDakMsSUFBSSxDQUFDLENBQUMsU0FBUztnQkFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2pCLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztnQkFDN0IsQ0FBQyxDQUFDLFlBQVksQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDO2dCQUN4QixDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7WUFDakMsQ0FBQztZQUNELElBQUksQ0FBQyxDQUFDLFdBQVc7Z0JBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxXQUFXLEdBQUcsTUFBTSxDQUFDO1lBQ3RELElBQUksQ0FBQyxDQUFDLGNBQWM7Z0JBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO1lBQ3RELGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwQixhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEIsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BCLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNyQixTQUFTLENBQ0wsUUFBUSxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUNoRCxNQUFNLENBQ1QsQ0FBQztRQUNOLENBQUMsQ0FBQztRQUVGLENBQUMsQ0FBQyxVQUFVLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDcEUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUU7WUFDckQsTUFBTSxRQUFRLEdBQUcsSUFBQSwrQ0FBd0IsRUFBQyxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUUsSUFBSSx5QkFBeUI7Z0JBQUUseUJBQXlCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbkUsS0FBSyxJQUFBLDJDQUFvQixFQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztRQUNyRSxDQUFDLENBQUMsa0JBQWtCLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUMvRyxDQUFDLENBQUMsY0FBYyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFDcEYsQ0FBQyxDQUFDLGdCQUFnQixJQUFJLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUscUJBQXFCLENBQUMsQ0FBQztRQUMxRixDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3ZELENBQUMsQ0FBQyxTQUFTLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDakUsQ0FBQyxDQUFDLGFBQWEsSUFBSSxDQUFDLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN6RSxDQUFDLENBQUMsb0JBQW9CLElBQUksQ0FBQyxDQUFDLG9CQUFvQixDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQzlGLENBQUMsQ0FBQyxTQUFTLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDN0UsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUM1RSxDQUFDLENBQUMsZ0JBQWdCLElBQUksQ0FBQyxDQUFDLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxlQUFlLENBQUMsQ0FBQztRQUNwRixDQUFDLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2pCLENBQUMsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLHFCQUFxQixDQUFDLENBQUM7WUFDcEUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztZQUNyRSxDQUFDLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO1lBQ25FLENBQUMsQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxFQUFFLHNCQUFzQixDQUFDLENBQUM7WUFDdEUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUMvRCxDQUFDO1FBQ0QsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3hCLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN4QixhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDM0IsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2hDLFNBQVMsQ0FBQyx1Q0FBdUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMzRCxLQUFLLElBQUEsMENBQW1CLEdBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUN6QyxJQUFJLHlCQUF5QjtnQkFBRSx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2RSxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxNQUFNLENBQUMsT0FBK0I7UUFDbEMsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsVUFBVSxDQUFDO1lBQUUsT0FBTztRQUNuRixNQUFNLFFBQVEsR0FBRyxJQUFBLCtDQUF3QixFQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdkUsSUFBSSx5QkFBeUIsRUFBRSxDQUFDO1lBQzVCLHlCQUF5QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3hDLENBQUM7YUFBTSxDQUFDO1lBQ0osTUFBTSxDQUFDLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvQixJQUFJLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDYixDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUM7Z0JBQzVCLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxHQUFHLFFBQVEsQ0FBQztZQUNoQyxDQUFDO1FBQ0wsQ0FBQztRQUNELEtBQUssSUFBQSwyQ0FBb0IsRUFBQyxRQUFRLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBQ0QsS0FBSztRQUNELHlCQUF5QixHQUFHLElBQUksQ0FBQztJQUNyQyxDQUFDO0NBQ0osQ0FBQyxDQUFDO0FBRUgsU0FBUyxVQUFVLENBQUMsS0FBYTtJQUM3QixPQUFPLE1BQU0sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDO1NBQ3JCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDO1NBQ3RCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDO1NBQ3JCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDO1NBQ3JCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDO1NBQ3ZCLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDaEMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdwYXRoJztcbmltcG9ydCB7XG4gICAgbm9ybWFsaXplQ3VycmVudEpzb25QYXRoLFxuICAgIHJlYWRDdXJyZW50SnNvblBhdGgsXG4gICAgd3JpdGVDdXJyZW50SnNvblBhdGgsXG59IGZyb20gJy4uLy4uL2pzb24td29ya3NwYWNlLXN0YXRlJztcblxudHlwZSBQYW5lbEVsZW1lbnRNYXAgPSB7XG4gICAgYXBwPzogSFRNTEVsZW1lbnQ7XG4gICAganNvblBhdGg/OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgIHJvb3RVdWlkPzogSFRNTElucHV0RWxlbWVudDtcbiAgICBraW5kPzogSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgbWluU2NvcmU/OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGZsYWdJbWFnZT86IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgZmxhZ1RleHQ/OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgIGZsYWdQb3NpdGlvbj86IEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgZmxhZ0FscGhhPzogSFRNTElucHV0RWxlbWVudDtcbiAgICBmaWdtYVBhdGg/OiBIVE1MSW5wdXRFbGVtZW50O1xuICAgIHN0YXR1cz86IEhUTUxFbGVtZW50O1xuICAgIHN1bW1hcnk/OiBIVE1MRWxlbWVudDtcbiAgICBtYXRjaGVzPzogSFRNTEVsZW1lbnQ7XG4gICAgcHJldmlld0J0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHByZXZpZXdNZXRhPzogSFRNTEVsZW1lbnQ7XG4gICAgcHJldmlld1N0YWdlPzogSFRNTEVsZW1lbnQ7XG4gICAgcHJldmlld092ZXJsYXk/OiBIVE1MRWxlbWVudDtcbiAgICBwcmV2aWV3SW1hZ2U/OiBIVE1MSW1hZ2VFbGVtZW50O1xuICAgIHNvdXJjZXM/OiBIVE1MRWxlbWVudDtcbiAgICB0ZXh0dXJlQnRuPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgdGV4dHVyZU9ubHlNaXNzaW5nPzogSFRNTElucHV0RWxlbWVudDtcbiAgICB0ZXh0dXJlQ29weUJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHRleHR1cmVJbXBvcnRCdG4/OiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICB0ZXh0dXJlU3VtbWFyeT86IEhUTUxFbGVtZW50O1xuICAgIHRleHR1cmVzPzogSFRNTEVsZW1lbnQ7XG4gICAgc2NhbkJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIGltcG9ydEJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIHNhdmVQcmVmYWJCdG4/OiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBpbnN0YW50aWF0ZVByZWZhYkJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIGRyeVJ1bkJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIGFwcGx5QnRuPzogSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgYXBwbHlTZWxlY3RlZEJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xuICAgIGF0dGFjaEJ0bj86IEhUTUxCdXR0b25FbGVtZW50O1xufTtcblxuZnVuY3Rpb24gYXNFbGVtZW50TWFwKHJhdzogYW55KTogUGFuZWxFbGVtZW50TWFwIHtcbiAgICByZXR1cm4gcmF3IGFzIFBhbmVsRWxlbWVudE1hcDtcbn1cblxubGV0IGFwcGx5UmVwbGFjZVdvcmtzcGFjZVBhdGg6ICgoZmlsZVBhdGg6IHN0cmluZykgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblxubW9kdWxlLmV4cG9ydHMgPSBFZGl0b3IuUGFuZWwuZGVmaW5lKHtcbiAgICB0ZW1wbGF0ZTogcmVhZEZpbGVTeW5jKGpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vc3RhdGljL3RlbXBsYXRlL3JlcGxhY2UvaW5kZXguaHRtbCcpLCAndXRmLTgnKSxcbiAgICBzdHlsZTogcmVhZEZpbGVTeW5jKGpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vc3RhdGljL3N0eWxlL3JlcGxhY2UvaW5kZXguY3NzJyksICd1dGYtOCcpLFxuICAgIGxpc3RlbmVyczoge1xuICAgICAgICBzaG93KCkge1xuICAgICAgICAgICAgdm9pZCByZWFkQ3VycmVudEpzb25QYXRoKCkudGhlbigoZmlsZVBhdGgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoYXBwbHlSZXBsYWNlV29ya3NwYWNlUGF0aCkgYXBwbHlSZXBsYWNlV29ya3NwYWNlUGF0aChmaWxlUGF0aCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcbiAgICB9LFxuICAgICQ6IHtcbiAgICAgICAgYXBwOiAnI2FwcCcsXG4gICAgICAgIGpzb25QYXRoOiAnI2pzb25QYXRoJyxcbiAgICAgICAgcm9vdFV1aWQ6ICcjcm9vdFV1aWQnLFxuICAgICAgICBraW5kOiAnI2tpbmQnLFxuICAgICAgICBtaW5TY29yZTogJyNtaW5TY29yZScsXG4gICAgICAgIGZsYWdJbWFnZTogJyNmbGFnSW1hZ2UnLFxuICAgICAgICBmbGFnVGV4dDogJyNmbGFnVGV4dCcsXG4gICAgICAgIGZsYWdQb3NpdGlvbjogJyNmbGFnUG9zaXRpb24nLFxuICAgICAgICBmbGFnQWxwaGE6ICcjZmxhZ0FscGhhJyxcbiAgICAgICAgZmlnbWFQYXRoOiAnI2ZpZ21hUGF0aCcsXG4gICAgICAgIHN0YXR1czogJyNzdGF0dXMnLFxuICAgICAgICBzdW1tYXJ5OiAnI3N1bW1hcnknLFxuICAgICAgICBtYXRjaGVzOiAnI21hdGNoZXMnLFxuICAgICAgICBwcmV2aWV3QnRuOiAnI3ByZXZpZXdCdG4nLFxuICAgICAgICBwcmV2aWV3TWV0YTogJyNwcmV2aWV3TWV0YScsXG4gICAgICAgIHByZXZpZXdTdGFnZTogJyNwcmV2aWV3U3RhZ2UnLFxuICAgICAgICBwcmV2aWV3T3ZlcmxheTogJyNwcmV2aWV3T3ZlcmxheScsXG4gICAgICAgIHByZXZpZXdJbWFnZTogJyNwcmV2aWV3SW1hZ2UnLFxuICAgICAgICBzb3VyY2VzOiAnI3NvdXJjZXMnLFxuICAgICAgICB0ZXh0dXJlQnRuOiAnI3RleHR1cmVCdG4nLFxuICAgICAgICB0ZXh0dXJlT25seU1pc3Npbmc6ICcjdGV4dHVyZU9ubHlNaXNzaW5nJyxcbiAgICAgICAgdGV4dHVyZUNvcHlCdG46ICcjdGV4dHVyZUNvcHlCdG4nLFxuICAgICAgICB0ZXh0dXJlSW1wb3J0QnRuOiAnI3RleHR1cmVJbXBvcnRCdG4nLFxuICAgICAgICB0ZXh0dXJlU3VtbWFyeTogJyN0ZXh0dXJlU3VtbWFyeScsXG4gICAgICAgIHRleHR1cmVzOiAnI3RleHR1cmVzJyxcbiAgICAgICAgc2NhbkJ0bjogJyNzY2FuQnRuJyxcbiAgICAgICAgaW1wb3J0QnRuOiAnI2ltcG9ydEJ0bicsXG4gICAgICAgIHNhdmVQcmVmYWJCdG46ICcjc2F2ZVByZWZhYkJ0bicsXG4gICAgICAgIGluc3RhbnRpYXRlUHJlZmFiQnRuOiAnI2luc3RhbnRpYXRlUHJlZmFiQnRuJyxcbiAgICAgICAgZHJ5UnVuQnRuOiAnI2RyeVJ1bkJ0bicsXG4gICAgICAgIGFwcGx5QnRuOiAnI2FwcGx5QnRuJyxcbiAgICAgICAgYXBwbHlTZWxlY3RlZEJ0bjogJyNhcHBseVNlbGVjdGVkQnRuJyxcbiAgICAgICAgYXR0YWNoQnRuOiAnI2F0dGFjaEJ0bicsXG4gICAgfSxcbiAgICByZWFkeSgpIHtcbiAgICAgICAgY29uc3QgJCA9IGFzRWxlbWVudE1hcCh0aGlzLiQpO1xuICAgICAgICBsZXQgbGFzdFNjYW46IGFueSA9IG51bGw7XG4gICAgICAgIGxldCBsYXN0UHJldmlldzogYW55ID0gbnVsbDtcbiAgICAgICAgbGV0IGxhc3RUZXh0dXJlU2NhbjogYW55ID0gbnVsbDtcbiAgICAgICAgbGV0IHdvcmtzcGFjZUpzb25QYXRoID0gbm9ybWFsaXplQ3VycmVudEpzb25QYXRoKCQuanNvblBhdGggJiYgJC5qc29uUGF0aC52YWx1ZSk7XG4gICAgICAgIGxldCBzZWxlY3RlZFNvdXJjZVBhdGggPSAnJztcbiAgICAgICAgbGV0IGhpZ2hsaWdodGVkUHJldmlld1JlY3RzOiBhbnlbXSA9IFtdO1xuICAgICAgICBsZXQgc2VsZWN0aW9uQ2FudmFzUmVjdDogYW55ID0gbnVsbDtcbiAgICAgICAgbGV0IHNlbGVjdGlvbkhpdHM6IGFueVtdID0gW107XG4gICAgICAgIGxldCBwcmV2aWV3U2VsZWN0aW5nID0gZmFsc2U7XG4gICAgICAgIGxldCBwcmV2aWV3U2VsZWN0aW9uU3RhcnQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuICAgICAgICBsZXQgc3VwcHJlc3NOZXh0UHJldmlld0NsaWNrID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IHJvd1NuYXBzaG90czogeyBbdGFyZ2V0VXVpZDogc3RyaW5nXTogYW55IH0gPSB7fTtcbiAgICAgICAgY29uc3Qgcm93U3RhdGVzOiB7IFt0YXJnZXRVdWlkOiBzdHJpbmddOiB7IGNvbnRlbnQ6IGJvb2xlYW47IHBvc2l0aW9uOiBib29sZWFuOyBhc3NpZ25lZFBhdGg/OiBzdHJpbmcgfSB9ID0ge307XG5cbiAgICAgICAgY29uc3Qgc2V0U3RhdHVzID0gKHRleHQ6IHN0cmluZywgdG9uZSA9ICdpbmZvJykgPT4ge1xuICAgICAgICAgICAgaWYgKCEkLnN0YXR1cykgcmV0dXJuO1xuICAgICAgICAgICAgJC5zdGF0dXMudGV4dENvbnRlbnQgPSB0ZXh0O1xuICAgICAgICAgICAgJC5zdGF0dXMuZGF0YXNldC50b25lID0gdG9uZTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBnZXRQYXRoID0gKCkgPT4gU3RyaW5nKCQuanNvblBhdGggJiYgJC5qc29uUGF0aC52YWx1ZSB8fCAnJykudHJpbSgpIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgY29uc3QgZ2V0S2luZCA9ICgpID0+IFN0cmluZygkLmtpbmQgJiYgJC5raW5kLnZhbHVlIHx8ICdhbGwnKTtcbiAgICAgICAgY29uc3QgZ2V0Um9vdFV1aWQgPSAoKSA9PiBTdHJpbmcoJC5yb290VXVpZCAmJiAkLnJvb3RVdWlkLnZhbHVlIHx8ICcnKS50cmltKCkgfHwgdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBnZXRNaW5TY29yZSA9ICgpID0+IE1hdGgubWF4KDAsIE51bWJlcigkLm1pblNjb3JlICYmICQubWluU2NvcmUudmFsdWUpIHx8IDMwMCk7XG4gICAgICAgIGNvbnN0IGdldEZsYWdzID0gKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgcG9zaXRpb24gPSAhISgkLmZsYWdQb3NpdGlvbiAmJiAkLmZsYWdQb3NpdGlvbi5jaGVja2VkKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgaW1hZ2U6ICEhKCQuZmxhZ0ltYWdlICYmICQuZmxhZ0ltYWdlLmNoZWNrZWQpLFxuICAgICAgICAgICAgICAgIHRleHQ6ICEhKCQuZmxhZ1RleHQgJiYgJC5mbGFnVGV4dC5jaGVja2VkKSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbixcbiAgICAgICAgICAgICAgICBhbmNob3JQaXZvdDogcG9zaXRpb24sXG4gICAgICAgICAgICAgICAgcHJlc2VydmVBbHBoYTogISEoJC5mbGFnQWxwaGEgJiYgJC5mbGFnQWxwaGEuY2hlY2tlZCksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBnZXRSb3dTdGF0ZSA9ICh0YXJnZXRVdWlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGlmICghcm93U3RhdGVzW3RhcmdldFV1aWRdKSByb3dTdGF0ZXNbdGFyZ2V0VXVpZF0gPSB7IGNvbnRlbnQ6IHRydWUsIHBvc2l0aW9uOiB0cnVlIH07XG4gICAgICAgICAgICByZXR1cm4gcm93U3RhdGVzW3RhcmdldFV1aWRdO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBnZXRSb3dGbGFncyA9ICh0YXJnZXRVdWlkOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZsYWdzID0gZ2V0RmxhZ3MoKTtcbiAgICAgICAgICAgIGNvbnN0IHJvd1N0YXRlID0gZ2V0Um93U3RhdGUodGFyZ2V0VXVpZCk7XG4gICAgICAgICAgICBpZiAoIXJvd1N0YXRlLmNvbnRlbnQpIHtcbiAgICAgICAgICAgICAgICBmbGFncy5pbWFnZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGZsYWdzLnRleHQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcm93U3RhdGUucG9zaXRpb24pIHtcbiAgICAgICAgICAgICAgICBmbGFncy5wb3NpdGlvbiA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGZsYWdzLmFuY2hvclBpdm90ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmxhZ3M7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgZmlsbFBhdGhGcm9tUmVzdWx0ID0gKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHJlc3VsdCAmJiByZXN1bHQuZGF0YSAmJiByZXN1bHQuZGF0YS5maWxlUGF0aCB8fCByZXN1bHQgJiYgcmVzdWx0LmZpbGVQYXRoIHx8ICcnO1xuICAgICAgICAgICAgaWYgKCFmaWxlUGF0aCkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKGFwcGx5UmVwbGFjZVdvcmtzcGFjZVBhdGgpIHtcbiAgICAgICAgICAgICAgICBhcHBseVJlcGxhY2VXb3Jrc3BhY2VQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoJC5qc29uUGF0aCkge1xuICAgICAgICAgICAgICAgICQuanNvblBhdGgudmFsdWUgPSBmaWxlUGF0aDtcbiAgICAgICAgICAgICAgICAkLmpzb25QYXRoLnRpdGxlID0gZmlsZVBhdGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2b2lkIHdyaXRlQ3VycmVudEpzb25QYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCByZW5kZXJTdW1tYXJ5ID0gKGRhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCEkLnN1bW1hcnkpIHJldHVybjtcbiAgICAgICAgICAgIGlmICghZGF0YSkge1xuICAgICAgICAgICAgICAgICQuc3VtbWFyeS5pbm5lckhUTUwgPSAnPGRpdiBjbGFzcz1cImVtcHR5XCI+5pqC5peg5omr5o+P57uT5p6cPC9kaXY+JztcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzb3VyY2UgPSBkYXRhLnNvdXJjZVN0YXRzIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZGF0YS50YXJnZXRTdGF0cyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZGF0YS5tYXRjaFN0YXRzIHx8IHt9O1xuICAgICAgICAgICAgJC5zdW1tYXJ5LmlubmVySFRNTCA9IFtcbiAgICAgICAgICAgICAgICBgPGRpdj48Yj4ke2VzY2FwZUh0bWwoZGF0YS5uYW1lIHx8ICdGaWdtYSBKU09OJyl9PC9iPjwvZGl2PmAsXG4gICAgICAgICAgICAgICAgYDxkaXY+5rqQ77yaJHtzb3VyY2Uubm9kZXMgfHwgMH0g6IqC54K5IC8gJHtzb3VyY2UuaW1hZ2VzIHx8IDB9IOWbviAvICR7c291cmNlLnRleHRzIHx8IDB9IOaWh+acrDwvZGl2PmAsXG4gICAgICAgICAgICAgICAgYDxkaXY+55uu5qCH77yaJHt0YXJnZXQudGFyZ2V0cyB8fCAwfSDpobkgLyAke3RhcmdldC5pbWFnZXMgfHwgMH0g5Zu+IC8gJHt0YXJnZXQudGV4dHMgfHwgMH0g5paH5pysPC9kaXY+YCxcbiAgICAgICAgICAgICAgICBgPGRpdj7ljLnphY3vvJoke21hdGNoLmNvbmZpZGVudCB8fCAwfSDlj6/kv6HvvIwke21hdGNoLndlYWsgfHwgMH0g5byx77yMJHttYXRjaC5taXNzaW5nIHx8IDB9IOe8uuWksTwvZGl2PmAsXG4gICAgICAgICAgICAgICAgYDxkaXY+6aOO6Zmp77yaJHttYXRjaC5hbWJpZ3VvdXMgfHwgMH0g5q2n5LmJ77yMJHttYXRjaC5kdXBsaWNhdGVTb3VyY2VBc3NpZ25tZW50cyB8fCAwfSDph43lpI3mupDliIbphY08L2Rpdj5gLFxuICAgICAgICAgICAgXS5qb2luKCcnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCByZW5kZXJNYXRjaGVzID0gKGRhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCEkLm1hdGNoZXMpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBkYXRhICYmIEFycmF5LmlzQXJyYXkoZGF0YS5tYXRjaGVzKSA/IGRhdGEubWF0Y2hlcyA6IFtdO1xuICAgICAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgJC5tYXRjaGVzLmlubmVySFRNTCA9ICc8ZGl2IGNsYXNzPVwiZW1wdHlcIj7msqHmnInlj6/mmL7npLrnmoTljLnphY3ooYw8L2Rpdj4nO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgICQubWF0Y2hlcy5pbm5lckhUTUwgPSBtYXRjaGVzLnNsaWNlKDAsIDgwKS5tYXAoKGl0ZW06IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJlc3QgPSBpdGVtLmJlc3QgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0gYmVzdC5zb3VyY2UgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gaXRlbS50YXJnZXQgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3Qgc2NvcmUgPSBOdW1iZXIoYmVzdC5zY29yZSkgfHwgMDtcbiAgICAgICAgICAgICAgICBjb25zdCB0b25lID0gc2NvcmUgPj0gMzAwID8gJ29rJyA6IChzY29yZSA+IDAgPyAnd2VhaycgOiAnbWlzcycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvd1N0YXRlID0gZ2V0Um93U3RhdGUodGFyZ2V0LnV1aWQgfHwgJycpO1xuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICAgIGA8ZGl2IGNsYXNzPVwibWF0Y2gtcm93ICR7dG9uZX0gJHtyb3dTbmFwc2hvdHNbdGFyZ2V0LnV1aWRdID8gJ3NuYXBzaG90dGVkJyA6ICcnfVwiIGRhdGEtaW5kZXg9XCIke2luZGV4fVwiIGRhdGEtdGFyZ2V0LXV1aWQ9XCIke2VzY2FwZUh0bWwodGFyZ2V0LnV1aWQgfHwgJycpfVwiPmAsXG4gICAgICAgICAgICAgICAgICAgIGA8YnV0dG9uIGNsYXNzPVwibWF0Y2gtc2VsZWN0XCIgZGF0YS1pbmRleD1cIiR7aW5kZXh9XCI+YCxcbiAgICAgICAgICAgICAgICAgICAgYDxzcGFuIGNsYXNzPVwic2NvcmVcIj4ke3Njb3JlIHx8ICctJ308L3NwYW4+YCxcbiAgICAgICAgICAgICAgICAgICAgYDxzcGFuIGNsYXNzPVwidGFyZ2V0XCI+JHtlc2NhcGVIdG1sKHRhcmdldC5yZWxhdGl2ZVBhdGggfHwgdGFyZ2V0LnNjZW5lUGF0aCB8fCB0YXJnZXQubmFtZSB8fCAnJyl9PC9zcGFuPmAsXG4gICAgICAgICAgICAgICAgICAgIGA8c3BhbiBjbGFzcz1cInNvdXJjZVwiPiR7ZXNjYXBlSHRtbChzb3VyY2UucGF0aCB8fCAnKG5vIHNvdXJjZSknKX08L3NwYW4+YCxcbiAgICAgICAgICAgICAgICAgICAgYDxzcGFuIGNsYXNzPVwicmVhc29uXCI+JHtlc2NhcGVIdG1sKGJlc3QucmVhc29uIHx8ICcnKX08L3NwYW4+YCxcbiAgICAgICAgICAgICAgICAgICAgJzwvYnV0dG9uPicsXG4gICAgICAgICAgICAgICAgICAgIGA8bGFiZWwgY2xhc3M9XCJyb3ctY2hlY2tcIiB0aXRsZT1cIuW6lOeUqOWbvueJhy/mloflrZflhoXlrrlcIj48aW5wdXQgY2xhc3M9XCJyb3ctY29udGVudFwiIGRhdGEtaW5kZXg9XCIke2luZGV4fVwiIHR5cGU9XCJjaGVja2JveFwiICR7cm93U3RhdGUuY29udGVudCA/ICdjaGVja2VkJyA6ICcnfSAvPuWGheWuuTwvbGFiZWw+YCxcbiAgICAgICAgICAgICAgICAgICAgYDxsYWJlbCBjbGFzcz1cInJvdy1jaGVja1wiIHRpdGxlPVwi5bqU55So5L2N572uL+WwuuWvuFwiPjxpbnB1dCBjbGFzcz1cInJvdy1wb3NpdGlvblwiIGRhdGEtaW5kZXg9XCIke2luZGV4fVwiIHR5cGU9XCJjaGVja2JveFwiICR7cm93U3RhdGUucG9zaXRpb24gPyAnY2hlY2tlZCcgOiAnJ30gLz7kvY3nva48L2xhYmVsPmAsXG4gICAgICAgICAgICAgICAgICAgIGA8YnV0dG9uIGNsYXNzPVwicm93LWxvY2F0ZVwiIGRhdGEtaW5kZXg9XCIke2luZGV4fVwiICR7dGFyZ2V0LnV1aWQgPyAnJyA6ICdkaXNhYmxlZCd9IHRpdGxlPVwi5ZyoIEhpZXJhcmNoeSDkuK3lrprkvY3nm67moIfoioLngrlcIj7lrprkvY08L2J1dHRvbj5gLFxuICAgICAgICAgICAgICAgICAgICBgPGJ1dHRvbiBjbGFzcz1cInJvdy1hcHBseVwiIGRhdGEtaW5kZXg9XCIke2luZGV4fVwiICR7dGFyZ2V0LnV1aWQgPyAnJyA6ICdkaXNhYmxlZCd9PuW6lOeUqDwvYnV0dG9uPmAsXG4gICAgICAgICAgICAgICAgICAgIGA8YnV0dG9uIGNsYXNzPVwicm93LXJlc3RvcmVcIiBkYXRhLWluZGV4PVwiJHtpbmRleH1cIiAke3Jvd1NuYXBzaG90c1t0YXJnZXQudXVpZF0gPyAnJyA6ICdkaXNhYmxlZCd9IHRpdGxlPVwi5riF6Zmk5pys6KGM5pu/5o2i5bm26L+Y5Y6fXCI+6L+Y5Y6fPC9idXR0b24+YCxcbiAgICAgICAgICAgICAgICAgICAgJzwvZGl2PicsXG4gICAgICAgICAgICAgICAgXS5qb2luKCcnKTtcbiAgICAgICAgICAgIH0pLmpvaW4oJycpO1xuICAgICAgICAgICAgJC5tYXRjaGVzLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcubWF0Y2gtc2VsZWN0JykuZm9yRWFjaCgoYnV0dG9uKSA9PiB7XG4gICAgICAgICAgICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IE51bWJlcihidXR0b24uZGF0YXNldC5pbmRleCkgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmVzdCA9IG1hdGNoZXNbaW5kZXhdICYmIG1hdGNoZXNbaW5kZXhdLmJlc3Q7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSBiZXN0ICYmIGJlc3Quc291cmNlICYmIGJlc3Quc291cmNlLnBhdGggfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwYXRoICYmICQuZmlnbWFQYXRoKSAkLmZpZ21hUGF0aC52YWx1ZSA9IHBhdGg7XG4gICAgICAgICAgICAgICAgICAgIGlmIChiZXN0ICYmIGJlc3Quc291cmNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBoaWdobGlnaHRSZWN0cyhbe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogYmVzdC5zb3VyY2UuY2FudmFzWCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiBiZXN0LnNvdXJjZS5jYW52YXNZLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBiZXN0LnNvdXJjZS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IGJlc3Quc291cmNlLmhlaWdodCxcbiAgICAgICAgICAgICAgICAgICAgICAgIH1dKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkU291cmNlUGF0aCA9IHBhdGg7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXJrU2VsZWN0ZWRTb3VyY2UoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLm1hdGNoZXMucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJy5yb3ctYXBwbHknKS5mb3JFYWNoKChidXR0b24pID0+IHtcbiAgICAgICAgICAgICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gTnVtYmVyKGJ1dHRvbi5kYXRhc2V0LmluZGV4KSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gbWF0Y2hlc1tpbmRleF07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFV1aWQgPSBpdGVtICYmIGl0ZW0udGFyZ2V0ICYmIGl0ZW0udGFyZ2V0LnV1aWQgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJlc3RQYXRoID0gaXRlbSAmJiBpdGVtLmJlc3QgJiYgaXRlbS5iZXN0LnNvdXJjZSAmJiBpdGVtLmJlc3Quc291cmNlLnBhdGggfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5Um93KHRhcmdldFV1aWQsIHNlbGVjdGVkU291cmNlUGF0aCB8fCBiZXN0UGF0aCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICQubWF0Y2hlcy5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignLnJvdy1sb2NhdGUnKS5mb3JFYWNoKChidXR0b24pID0+IHtcbiAgICAgICAgICAgICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gTnVtYmVyKGJ1dHRvbi5kYXRhc2V0LmluZGV4KSB8fCAwO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gbWF0Y2hlc1tpbmRleF07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFV1aWQgPSBpdGVtICYmIGl0ZW0udGFyZ2V0ICYmIGl0ZW0udGFyZ2V0LnV1aWQgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGxvY2F0ZVJvdyh0YXJnZXRVdWlkKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgYmluZFJvd1RvZ2dsZSA9IChzZWxlY3Rvcjogc3RyaW5nLCBmaWVsZDogJ2NvbnRlbnQnIHwgJ3Bvc2l0aW9uJykgPT4ge1xuICAgICAgICAgICAgICAgICQubWF0Y2hlcyEucXVlcnlTZWxlY3RvckFsbDxIVE1MSW5wdXRFbGVtZW50PihzZWxlY3RvcikuZm9yRWFjaCgoaW5wdXQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSBOdW1iZXIoaW5wdXQuZGF0YXNldC5pbmRleCkgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBtYXRjaGVzW2luZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFV1aWQgPSBpdGVtICYmIGl0ZW0udGFyZ2V0ICYmIGl0ZW0udGFyZ2V0LnV1aWQgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRhcmdldFV1aWQpIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvd1N0YXRlID0gZ2V0Um93U3RhdGUodGFyZ2V0VXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICByb3dTdGF0ZVtmaWVsZF0gPSBpbnB1dC5jaGVja2VkO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJvd1NuYXBzaG90c1t0YXJnZXRVdWlkXSAmJiByb3dTdGF0ZS5hc3NpZ25lZFBhdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcHBseVJvdyh0YXJnZXRVdWlkLCByb3dTdGF0ZS5hc3NpZ25lZFBhdGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBiaW5kUm93VG9nZ2xlKCcucm93LWNvbnRlbnQnLCAnY29udGVudCcpO1xuICAgICAgICAgICAgYmluZFJvd1RvZ2dsZSgnLnJvdy1wb3NpdGlvbicsICdwb3NpdGlvbicpO1xuICAgICAgICAgICAgJC5tYXRjaGVzLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcubWF0Y2gtcm93JykuZm9yRWFjaCgocm93KSA9PiB7XG4gICAgICAgICAgICAgICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdvdmVyJywgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QuYWRkKCdkcmFnLW92ZXInKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LmRhdGFUcmFuc2ZlcikgZXZlbnQuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnY29weSc7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgcm93LmFkZEV2ZW50TGlzdGVuZXIoJ2RyYWdsZWF2ZScsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgcm93LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWctb3ZlcicpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIHJvdy5hZGRFdmVudExpc3RlbmVyKCdkcm9wJywgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgICAgIHJvdy5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnLW92ZXInKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSBOdW1iZXIocm93LmRhdGFzZXQuaW5kZXgpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBtYXRjaGVzW2luZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0VXVpZCA9IGl0ZW0gJiYgaXRlbS50YXJnZXQgJiYgaXRlbS50YXJnZXQudXVpZCB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IGV2ZW50LmRhdGFUcmFuc2ZlciAmJiBldmVudC5kYXRhVHJhbnNmZXIuZ2V0RGF0YSgndGV4dC9wbGFpbicpIHx8IHNlbGVjdGVkU291cmNlUGF0aDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBhdGggJiYgJC5maWdtYVBhdGgpICQuZmlnbWFQYXRoLnZhbHVlID0gcGF0aDtcbiAgICAgICAgICAgICAgICAgICAgc2VsZWN0ZWRTb3VyY2VQYXRoID0gcGF0aCB8fCBzZWxlY3RlZFNvdXJjZVBhdGg7XG4gICAgICAgICAgICAgICAgICAgIGFwcGx5Um93KHRhcmdldFV1aWQsIHBhdGgpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAkLm1hdGNoZXMucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJy5yb3ctcmVzdG9yZScpLmZvckVhY2goKGJ1dHRvbikgPT4ge1xuICAgICAgICAgICAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSBOdW1iZXIoYnV0dG9uLmRhdGFzZXQuaW5kZXgpIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGl0ZW0gPSBtYXRjaGVzW2luZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0VXVpZCA9IGl0ZW0gJiYgaXRlbS50YXJnZXQgJiYgaXRlbS50YXJnZXQudXVpZCB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgcmVzdG9yZVJvdyh0YXJnZXRVdWlkKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHJlbmRlclNvdXJjZXMgPSAoZGF0YTogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAoISQuc291cmNlcykgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKCFkYXRhKSB7XG4gICAgICAgICAgICAgICAgJC5zb3VyY2VzLmlubmVySFRNTCA9ICc8ZGl2IGNsYXNzPVwiZW1wdHlcIj7mmoLml6DmupDotYTmupA8L2Rpdj4nO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJhd0ltYWdlcyA9IEFycmF5LmlzQXJyYXkoZGF0YS5zb3VyY2VJbWFnZXMpID8gZGF0YS5zb3VyY2VJbWFnZXMgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IHJhd1RleHRzID0gQXJyYXkuaXNBcnJheShkYXRhLnNvdXJjZVRleHRzKSA/IGRhdGEuc291cmNlVGV4dHMgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGlvbkFjdGl2ZSA9ICEhc2VsZWN0aW9uQ2FudmFzUmVjdDtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkUGF0aFNldCA9IG5ldyBTZXQoKHNlbGVjdGlvbkhpdHMgfHwgW10pLm1hcCgoaGl0OiBhbnkpID0+IFN0cmluZyhoaXQucGF0aCB8fCAnJykpLmZpbHRlcihCb29sZWFuKSk7XG4gICAgICAgICAgICBjb25zdCBoaXRCeVBhdGg6IHsgW3BhdGg6IHN0cmluZ106IGFueSB9ID0ge307XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGhpdCBvZiAoc2VsZWN0aW9uSGl0cyB8fCBbXSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoaGl0ICYmIGhpdC5wYXRoKSBoaXRCeVBhdGhbaGl0LnBhdGhdID0gaGl0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgaW1hZ2VzID0gc2VsZWN0aW9uQWN0aXZlXG4gICAgICAgICAgICAgICAgPyByYXdJbWFnZXMubWFwKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVjdHMgPSAoQXJyYXkuaXNBcnJheShpdGVtLmFsbFJlY3RzKSA/IGl0ZW0uYWxsUmVjdHMgOiBbXSkuZmlsdGVyKChyZWN0OiBhbnkpID0+IHNlbGVjdGVkUGF0aFNldC5oYXMoU3RyaW5nKHJlY3QucGF0aCB8fCAnJykpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlY3RzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpcnN0ID0gaGl0QnlQYXRoW3JlY3RzWzBdLnBhdGhdIHx8IHJlY3RzWzBdO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgLi4uaXRlbSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IGZpcnN0LnBhdGggfHwgaXRlbS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogZmlyc3QubmFtZSB8fCBpdGVtLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogZmlyc3Qud2lkdGggfHwgaXRlbS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogZmlyc3QuaGVpZ2h0IHx8IGl0ZW0uaGVpZ2h0LFxuICAgICAgICAgICAgICAgICAgICAgICAgb2NjdXJyZW5jZXM6IHJlY3RzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGFsbFJlY3RzOiByZWN0cyxcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9KS5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgICAgICA6IHJhd0ltYWdlcztcbiAgICAgICAgICAgIGNvbnN0IHRleHRzID0gc2VsZWN0aW9uQWN0aXZlXG4gICAgICAgICAgICAgICAgPyByYXdUZXh0cy5maWx0ZXIoKGl0ZW06IGFueSkgPT4gc2VsZWN0ZWRQYXRoU2V0LmhhcyhTdHJpbmcoaXRlbS5wYXRoIHx8ICcnKSkpXG4gICAgICAgICAgICAgICAgOiByYXdUZXh0cztcbiAgICAgICAgICAgIGNvbnN0IGltYWdlSHRtbCA9IGltYWdlcy5zbGljZSgwLCA5NikubWFwKChpdGVtOiBhbnksIGluZGV4OiBudW1iZXIpID0+IFtcbiAgICAgICAgICAgICAgICBgPGJ1dHRvbiBjbGFzcz1cInNvdXJjZS1jYXJkIGltYWdlLXNvdXJjZVwiIGRyYWdnYWJsZT1cInRydWVcIiBkYXRhLWtpbmQ9XCJpbWFnZVwiIGRhdGEtaW5kZXg9XCIke2luZGV4fVwiIGRhdGEtcGF0aD1cIiR7ZXNjYXBlSHRtbChpdGVtLnBhdGggfHwgJycpfVwiPmAsXG4gICAgICAgICAgICAgICAgaXRlbS5kYXRhVXJsID8gYDxpbWcgc3JjPVwiJHtpdGVtLmRhdGFVcmx9XCIgLz5gIDogJzxzcGFuIGNsYXNzPVwidGh1bWItbWlzc2luZ1wiPuaXoOWbvjwvc3Bhbj4nLFxuICAgICAgICAgICAgICAgIGA8c3BhbiB0aXRsZT1cIiR7ZXNjYXBlSHRtbChpdGVtLnBhdGggfHwgJycpfVwiPiR7ZXNjYXBlSHRtbChpdGVtLm5hbWUgfHwgaXRlbS5pbWFnZVJlZiB8fCAnSW1hZ2UnKX08L3NwYW4+YCxcbiAgICAgICAgICAgICAgICBgPHNtYWxsPiR7aXRlbS5vY2N1cnJlbmNlcyB8fCAxfXggwrcgJHtNYXRoLnJvdW5kKGl0ZW0ud2lkdGggfHwgMCl9w5cke01hdGgucm91bmQoaXRlbS5oZWlnaHQgfHwgMCl9PC9zbWFsbD5gLFxuICAgICAgICAgICAgICAgICc8L2J1dHRvbj4nLFxuICAgICAgICAgICAgXS5qb2luKCcnKSkuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCB0ZXh0SHRtbCA9IHRleHRzLnNsaWNlKDAsIDk2KS5tYXAoKGl0ZW06IGFueSwgaW5kZXg6IG51bWJlcikgPT4gW1xuICAgICAgICAgICAgICAgIGA8YnV0dG9uIGNsYXNzPVwic291cmNlLWNhcmQgdGV4dC1zb3VyY2VcIiBkcmFnZ2FibGU9XCJ0cnVlXCIgZGF0YS1raW5kPVwidGV4dFwiIGRhdGEtaW5kZXg9XCIke2luZGV4fVwiIGRhdGEtcGF0aD1cIiR7ZXNjYXBlSHRtbChpdGVtLnBhdGggfHwgJycpfVwiPmAsXG4gICAgICAgICAgICAgICAgYDxzcGFuIHRpdGxlPVwiJHtlc2NhcGVIdG1sKGl0ZW0ucGF0aCB8fCAnJyl9XCI+JHtlc2NhcGVIdG1sKGl0ZW0ubmFtZSB8fCAnVGV4dCcpfTwvc3Bhbj5gLFxuICAgICAgICAgICAgICAgIGA8c21hbGw+JHtlc2NhcGVIdG1sKFN0cmluZyhpdGVtLnRleHQgfHwgJycpLnJlcGxhY2UoL1xccysvZywgJyAnKS5zbGljZSgwLCA0OCkpfTwvc21hbGw+YCxcbiAgICAgICAgICAgICAgICAnPC9idXR0b24+JyxcbiAgICAgICAgICAgIF0uam9pbignJykpLmpvaW4oJycpO1xuICAgICAgICAgICAgJC5zb3VyY2VzLmlubmVySFRNTCA9IFtcbiAgICAgICAgICAgICAgICBzZWxlY3Rpb25BY3RpdmVcbiAgICAgICAgICAgICAgICAgICAgPyBgPGRpdiBjbGFzcz1cInNvdXJjZS1zZWxlY3Rpb25cIj7moYbpgInlkb3kuK0gJHtzZWxlY3Rpb25IaXRzLmxlbmd0aH0g6aG5IMK3IOWbviAke2ltYWdlcy5sZW5ndGh9LyR7cmF3SW1hZ2VzLmxlbmd0aH0gwrcg5paH5pysICR7dGV4dHMubGVuZ3RofS8ke3Jhd1RleHRzLmxlbmd0aH08L2Rpdj5gXG4gICAgICAgICAgICAgICAgICAgIDogJycsXG4gICAgICAgICAgICAgICAgYDxkaXYgY2xhc3M9XCJzb3VyY2Utc2VjdGlvblwiPjxkaXYgY2xhc3M9XCJzb3VyY2UtdGl0bGVcIj7mupDlm77niYcgJHtpbWFnZXMubGVuZ3RofSR7c2VsZWN0aW9uQWN0aXZlID8gYC8ke3Jhd0ltYWdlcy5sZW5ndGh9YCA6ICcnfTwvZGl2PjxkaXYgY2xhc3M9XCJzb3VyY2UtZ3JpZFwiPiR7aW1hZ2VIdG1sIHx8ICc8ZGl2IGNsYXNzPVwiZW1wdHlcIj7ml6Dlm77niYfmupA8L2Rpdj4nfTwvZGl2PjwvZGl2PmAsXG4gICAgICAgICAgICAgICAgYDxkaXYgY2xhc3M9XCJzb3VyY2Utc2VjdGlvblwiPjxkaXYgY2xhc3M9XCJzb3VyY2UtdGl0bGVcIj7mupDmloflrZcgJHt0ZXh0cy5sZW5ndGh9JHtzZWxlY3Rpb25BY3RpdmUgPyBgLyR7cmF3VGV4dHMubGVuZ3RofWAgOiAnJ308L2Rpdj48ZGl2IGNsYXNzPVwic291cmNlLWxpc3RcIj4ke3RleHRIdG1sIHx8ICc8ZGl2IGNsYXNzPVwiZW1wdHlcIj7ml6DmloflrZfmupA8L2Rpdj4nfTwvZGl2PjwvZGl2PmAsXG4gICAgICAgICAgICBdLmpvaW4oJycpO1xuICAgICAgICAgICAgJC5zb3VyY2VzLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuc291cmNlLWNhcmQnKS5mb3JFYWNoKChidXR0b24pID0+IHtcbiAgICAgICAgICAgICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGtpbmQgPSBidXR0b24uZGF0YXNldC5raW5kIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IE51bWJlcihidXR0b24uZGF0YXNldC5pbmRleCkgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc291cmNlID0ga2luZCA9PT0gJ2ltYWdlJyA/IGltYWdlc1tpbmRleF0gOiB0ZXh0c1tpbmRleF07XG4gICAgICAgICAgICAgICAgICAgIGlmICghc291cmNlKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkU291cmNlUGF0aCA9IHNvdXJjZS5wYXRoIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBpZiAoJC5maWdtYVBhdGgpICQuZmlnbWFQYXRoLnZhbHVlID0gc2VsZWN0ZWRTb3VyY2VQYXRoO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZWN0cyA9IGtpbmQgPT09ICdpbWFnZSdcbiAgICAgICAgICAgICAgICAgICAgICAgID8gKEFycmF5LmlzQXJyYXkoc291cmNlLmFsbFJlY3RzKSA/IHNvdXJjZS5hbGxSZWN0cyA6IFtdKVxuICAgICAgICAgICAgICAgICAgICAgICAgOiBbc291cmNlXTtcbiAgICAgICAgICAgICAgICAgICAgaGlnaGxpZ2h0UmVjdHMocmVjdHMpO1xuICAgICAgICAgICAgICAgICAgICBtYXJrU2VsZWN0ZWRTb3VyY2UoKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcignZHJhZ3N0YXJ0JywgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSBidXR0b24uZGF0YXNldC5wYXRoIHx8ICcnO1xuICAgICAgICAgICAgICAgICAgICBzZWxlY3RlZFNvdXJjZVBhdGggPSBwYXRoO1xuICAgICAgICAgICAgICAgICAgICBpZiAoJC5maWdtYVBhdGgpICQuZmlnbWFQYXRoLnZhbHVlID0gc2VsZWN0ZWRTb3VyY2VQYXRoO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudC5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdjb3B5JztcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LmRhdGFUcmFuc2Zlci5zZXREYXRhKCd0ZXh0L3BsYWluJywgcGF0aCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbWFya1NlbGVjdGVkU291cmNlKCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB0ZXh0dXJlTmVlZHNBdHRlbnRpb24gPSAoaXRlbTogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gaXRlbSAmJiAoaXRlbS5zdGF0dXMgPT09ICdtaXNzaW5nJyB8fCBpdGVtLnN0YXR1cyA9PT0gJ2ZpZ21hLWltcG9ydCcpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHRleHR1cmVTdGF0dXNMYWJlbCA9IChzdGF0dXM6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgaWYgKHN0YXR1cyA9PT0gJ3Byb2plY3QnKSByZXR1cm4gJ+ato+W8jy/lpJbpg6gnO1xuICAgICAgICAgICAgaWYgKHN0YXR1cyA9PT0gJ2ZpZ21hLWltcG9ydCcpIHJldHVybiAnRmlnbWHnm67lvZUnO1xuICAgICAgICAgICAgcmV0dXJuICfnvLrlpLEnO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHJlbmRlclRleHR1cmVzID0gKGRhdGE6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCQudGV4dHVyZVN1bW1hcnkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWRhdGEgfHwgIWRhdGEuc3RhdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgJC50ZXh0dXJlU3VtbWFyeS50ZXh0Q29udGVudCA9ICfmnKrmiavmj4/otLTlm74nO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBkYXRhLnN0YXRzO1xuICAgICAgICAgICAgICAgICAgICAkLnRleHR1cmVTdW1tYXJ5LnRleHRDb250ZW50ID1cbiAgICAgICAgICAgICAgICAgICAgICAgIGDllK/kuIAgJHtzLnVuaXF1ZSB8fCAwfSDCtyDmraPlvI8v5aSW6YOoICR7cy5wcm9qZWN0Rm91bmQgfHwgMH0gwrcgYCArXG4gICAgICAgICAgICAgICAgICAgICAgICBgRmlnbWHnm67lvZUgJHtzLmZpZ21hSW1wb3J0Rm91bmQgfHwgMH0gwrcg57y65aSxICR7cy5taXNzaW5nIHx8IDB9YDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoISQudGV4dHVyZXMpIHJldHVybjtcbiAgICAgICAgICAgIGlmICghZGF0YSkge1xuICAgICAgICAgICAgICAgICQudGV4dHVyZXMuaW5uZXJIVE1MID0gJzxkaXYgY2xhc3M9XCJlbXB0eVwiPueCueWHu+OAjOi0tOWbvumihOiniOOAjeaJq+aPjyBKU09OIOeUqOWIsOeahOWUr+S4gOi0tOWbvjwvZGl2Pic7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgb25seUF0dGVudGlvbiA9ICEhKCQudGV4dHVyZU9ubHlNaXNzaW5nICYmICQudGV4dHVyZU9ubHlNaXNzaW5nLmNoZWNrZWQpO1xuICAgICAgICAgICAgY29uc3QgcmF3RW50cmllcyA9IEFycmF5LmlzQXJyYXkoZGF0YS5lbnRyaWVzKSA/IGRhdGEuZW50cmllcyA6IFtdO1xuICAgICAgICAgICAgY29uc3QgZW50cmllcyA9IG9ubHlBdHRlbnRpb24gPyByYXdFbnRyaWVzLmZpbHRlcih0ZXh0dXJlTmVlZHNBdHRlbnRpb24pIDogcmF3RW50cmllcztcbiAgICAgICAgICAgIGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICQudGV4dHVyZXMuaW5uZXJIVE1MID0gJzxkaXYgY2xhc3M9XCJlbXB0eVwiPuayoeaciemcgOimgeWFs+azqOeahOi0tOWbvjwvZGl2Pic7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgJC50ZXh0dXJlcy5pbm5lckhUTUwgPSBlbnRyaWVzLnNsaWNlKDAsIDE2MCkubWFwKChpdGVtOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXMgPSBTdHJpbmcoaXRlbS5zdGF0dXMgfHwgJ21pc3NpbmcnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXNMYWJlbCA9IHRleHR1cmVTdGF0dXNMYWJlbChzdGF0dXMpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1haW5QYXRoID0gaXRlbS5wYXRoIHx8IChpdGVtLmFsbFJlY3RzICYmIGl0ZW0uYWxsUmVjdHNbMF0gJiYgaXRlbS5hbGxSZWN0c1swXS5wYXRoKSB8fCAnJztcbiAgICAgICAgICAgICAgICBjb25zdCBhc3NldCA9IGl0ZW0uYXNzZXRQYXRoIHx8ICcnO1xuICAgICAgICAgICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICAgICAgICAgIGA8YnV0dG9uIGNsYXNzPVwidGV4dHVyZS1yb3cgJHtzdGF0dXN9XCIgZGF0YS1wYXRoPVwiJHtlc2NhcGVIdG1sKG1haW5QYXRoKX1cIiB0aXRsZT1cIiR7ZXNjYXBlSHRtbChtYWluUGF0aCl9XCI+YCxcbiAgICAgICAgICAgICAgICAgICAgaXRlbS5kYXRhVXJsID8gYDxpbWcgc3JjPVwiJHtpdGVtLmRhdGFVcmx9XCIgLz5gIDogJzxzcGFuIGNsYXNzPVwidGh1bWItbWlzc2luZ1wiPuaXoOWbvjwvc3Bhbj4nLFxuICAgICAgICAgICAgICAgICAgICAnPHNwYW4gY2xhc3M9XCJ0ZXh0dXJlLWluZm9cIj4nLFxuICAgICAgICAgICAgICAgICAgICBgPGI+JHtlc2NhcGVIdG1sKGl0ZW0ubmFtZSB8fCBpdGVtLmltYWdlTmFtZSB8fCBpdGVtLmltYWdlUmVmIHx8ICdJbWFnZScpfTwvYj5gLFxuICAgICAgICAgICAgICAgICAgICBgPHNtYWxsPiR7ZXNjYXBlSHRtbChzdGF0dXNMYWJlbCl9IMK3ICR7aXRlbS5vY2N1cnJlbmNlcyB8fCAxfXggwrcgJHtNYXRoLnJvdW5kKGl0ZW0ud2lkdGggfHwgMCl9w5cke01hdGgucm91bmQoaXRlbS5oZWlnaHQgfHwgMCl9PC9zbWFsbD5gLFxuICAgICAgICAgICAgICAgICAgICBhc3NldCA/IGA8c21hbGw+JHtlc2NhcGVIdG1sKGFzc2V0KX08L3NtYWxsPmAgOiBgPHNtYWxsPiR7ZXNjYXBlSHRtbChtYWluUGF0aCl9PC9zbWFsbD5gLFxuICAgICAgICAgICAgICAgICAgICAnPC9zcGFuPicsXG4gICAgICAgICAgICAgICAgICAgICc8L2J1dHRvbj4nLFxuICAgICAgICAgICAgICAgIF0uam9pbignJyk7XG4gICAgICAgICAgICB9KS5qb2luKCcnKTtcbiAgICAgICAgICAgICQudGV4dHVyZXMucXVlcnlTZWxlY3RvckFsbDxIVE1MQnV0dG9uRWxlbWVudD4oJy50ZXh0dXJlLXJvdycpLmZvckVhY2goKGJ1dHRvbikgPT4ge1xuICAgICAgICAgICAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IGJ1dHRvbi5kYXRhc2V0LnBhdGggfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgIGlmICghcGF0aCB8fCAhbGFzdFRleHR1cmVTY2FuKSByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkU291cmNlUGF0aCA9IHBhdGg7XG4gICAgICAgICAgICAgICAgICAgIGlmICgkLmZpZ21hUGF0aCkgJC5maWdtYVBhdGgudmFsdWUgPSBwYXRoO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbnRyeSA9IChsYXN0VGV4dHVyZVNjYW4uZW50cmllcyB8fCBbXSkuZmluZCgoaXRlbTogYW55KSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbS5wYXRoID09PSBwYXRoIHx8IChBcnJheS5pc0FycmF5KGl0ZW0uYWxsUmVjdHMpICYmIGl0ZW0uYWxsUmVjdHMuc29tZSgocmVjdDogYW55KSA9PiByZWN0LnBhdGggPT09IHBhdGgpKVxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByZWN0cyA9IGVudHJ5ICYmIEFycmF5LmlzQXJyYXkoZW50cnkuYWxsUmVjdHMpXG4gICAgICAgICAgICAgICAgICAgICAgICA/IGVudHJ5LmFsbFJlY3RzLm1hcCgocmVjdDogYW55KSA9PiAoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGg6IHJlY3QucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiByZWN0LmNhbnZhc1gsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogcmVjdC5jYW52YXNZLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiByZWN0LndpZHRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogcmVjdC5oZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICAgICAgICAgIDogW107XG4gICAgICAgICAgICAgICAgICAgIGhpZ2hsaWdodFJlY3RzKHJlY3RzKTtcbiAgICAgICAgICAgICAgICAgICAgbWFya1NlbGVjdGVkU291cmNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5bey6YCJ5oup6LS05Zu+5rqQ77yaJHtwYXRofWAsICdvaycpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbWFya1NlbGVjdGVkU291cmNlID0gKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCEkLnNvdXJjZXMpIHJldHVybjtcbiAgICAgICAgICAgICQuc291cmNlcy5xdWVyeVNlbGVjdG9yQWxsPEhUTUxCdXR0b25FbGVtZW50PignLnNvdXJjZS1jYXJkJykuZm9yRWFjaCgoYnV0dG9uKSA9PiB7XG4gICAgICAgICAgICAgICAgYnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgISFzZWxlY3RlZFNvdXJjZVBhdGggJiYgYnV0dG9uLmRhdGFzZXQucGF0aCA9PT0gc2VsZWN0ZWRTb3VyY2VQYXRoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGNsZWFySGlnaGxpZ2h0cyA9ICgpID0+IHtcbiAgICAgICAgICAgIGhpZ2hsaWdodGVkUHJldmlld1JlY3RzID0gW107XG4gICAgICAgICAgICBzZWxlY3Rpb25DYW52YXNSZWN0ID0gbnVsbDtcbiAgICAgICAgICAgIHNlbGVjdGlvbkhpdHMgPSBbXTtcbiAgICAgICAgICAgIHJlbmRlclByZXZpZXdPdmVybGF5KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcmVuZGVyUHJldmlld092ZXJsYXkgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoISQucHJldmlld092ZXJsYXkgfHwgISQucHJldmlld0ltYWdlIHx8ICFsYXN0UHJldmlldyB8fCAhbGFzdFByZXZpZXcuY2FudmFzKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBjdyA9IE51bWJlcihsYXN0UHJldmlldy5jYW52YXMud2lkdGgpIHx8IDE7XG4gICAgICAgICAgICBjb25zdCBjaCA9IE51bWJlcihsYXN0UHJldmlldy5jYW52YXMuaGVpZ2h0KSB8fCAxO1xuICAgICAgICAgICAgY29uc3QgZHcgPSAkLnByZXZpZXdJbWFnZS5jbGllbnRXaWR0aCB8fCAxO1xuICAgICAgICAgICAgY29uc3QgZGggPSAkLnByZXZpZXdJbWFnZS5jbGllbnRIZWlnaHQgfHwgMTtcbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdPdmVybGF5KSB7XG4gICAgICAgICAgICAgICAgJC5wcmV2aWV3T3ZlcmxheS5zdHlsZS53aWR0aCA9IGAke2R3fXB4YDtcbiAgICAgICAgICAgICAgICAkLnByZXZpZXdPdmVybGF5LnN0eWxlLmhlaWdodCA9IGAke2RofXB4YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG1hcFJlY3QgPSAocmVjdDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGVmdCA9IChOdW1iZXIocmVjdC54KSB8fCAwKSAvIGN3ICogZHc7XG4gICAgICAgICAgICAgICAgY29uc3QgdG9wID0gKE51bWJlcihyZWN0LnkpIHx8IDApIC8gY2ggKiBkaDtcbiAgICAgICAgICAgICAgICBjb25zdCB3aWR0aCA9IE1hdGgubWF4KDEsIChOdW1iZXIocmVjdC53aWR0aCkgfHwgMCkgLyBjdyAqIGR3KTtcbiAgICAgICAgICAgICAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgxLCAoTnVtYmVyKHJlY3QuaGVpZ2h0KSB8fCAwKSAvIGNoICogZGgpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCB9O1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IGhpdEh0bWwgPSAoaGlnaGxpZ2h0ZWRQcmV2aWV3UmVjdHMgfHwgW10pLnNsaWNlKDAsIDQ4KS5tYXAoKHJlY3QpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gbWFwUmVjdChyZWN0KTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYDxkaXYgY2xhc3M9XCJoaXQtcmVjdFwiIHRpdGxlPVwiJHtlc2NhcGVIdG1sKHJlY3QucGF0aCB8fCAnJyl9XCIgc3R5bGU9XCJsZWZ0OiR7ci5sZWZ0fXB4O3RvcDoke3IudG9wfXB4O3dpZHRoOiR7ci53aWR0aH1weDtoZWlnaHQ6JHtyLmhlaWdodH1weFwiPjwvZGl2PmA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGlvbkh0bWw6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICBpZiAoc2VsZWN0aW9uQ2FudmFzUmVjdCAmJiBzZWxlY3Rpb25DYW52YXNSZWN0LndpZHRoID4gMCAmJiBzZWxlY3Rpb25DYW52YXNSZWN0LmhlaWdodCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gbWFwUmVjdChzZWxlY3Rpb25DYW52YXNSZWN0KTtcbiAgICAgICAgICAgICAgICBjb25zdCBsYWJlbCA9IGB4JHtNYXRoLnJvdW5kKHNlbGVjdGlvbkNhbnZhc1JlY3QueCl9IHkke01hdGgucm91bmQoc2VsZWN0aW9uQ2FudmFzUmVjdC55KX0gJHtNYXRoLnJvdW5kKHNlbGVjdGlvbkNhbnZhc1JlY3Qud2lkdGgpfcOXJHtNYXRoLnJvdW5kKHNlbGVjdGlvbkNhbnZhc1JlY3QuaGVpZ2h0KX1gO1xuICAgICAgICAgICAgICAgIHNlbGVjdGlvbkh0bWwucHVzaChcbiAgICAgICAgICAgICAgICAgICAgYDxkaXYgY2xhc3M9XCJzZWxlY3Rpb24tcmVjdFwiIHN0eWxlPVwibGVmdDoke3IubGVmdH1weDt0b3A6JHtyLnRvcH1weDt3aWR0aDoke3Iud2lkdGh9cHg7aGVpZ2h0OiR7ci5oZWlnaHR9cHhcIj5gICtcbiAgICAgICAgICAgICAgICAgICAgYDxzcGFuPiR7ZXNjYXBlSHRtbChsYWJlbCl9PC9zcGFuPjwvZGl2PmBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgJC5wcmV2aWV3T3ZlcmxheS5pbm5lckhUTUwgPSBoaXRIdG1sLmNvbmNhdChzZWxlY3Rpb25IdG1sKS5qb2luKCcnKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBoaWdobGlnaHRSZWN0cyA9IChyZWN0czogYW55W10pID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHZpc2libGVSZWN0cyA9IChyZWN0cyB8fCBbXSkuZmlsdGVyKChyZWN0KSA9PiByZWN0ICYmIHJlY3Qud2lkdGggPiAwICYmIHJlY3QuaGVpZ2h0ID4gMCk7XG4gICAgICAgICAgICBoaWdobGlnaHRlZFByZXZpZXdSZWN0cyA9IHZpc2libGVSZWN0cztcbiAgICAgICAgICAgIHJlbmRlclByZXZpZXdPdmVybGF5KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc2VsZWN0UHJldmlld0hpdCA9IChoaXQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFoaXQgfHwgIWhpdC5wYXRoKSByZXR1cm47XG4gICAgICAgICAgICBzZWxlY3RlZFNvdXJjZVBhdGggPSBoaXQucGF0aDtcbiAgICAgICAgICAgIGlmICgkLmZpZ21hUGF0aCkgJC5maWdtYVBhdGgudmFsdWUgPSBzZWxlY3RlZFNvdXJjZVBhdGg7XG4gICAgICAgICAgICBzZWxlY3Rpb25DYW52YXNSZWN0ID0gbnVsbDtcbiAgICAgICAgICAgIHNlbGVjdGlvbkhpdHMgPSBbXTtcbiAgICAgICAgICAgIGxldCByZWN0cyA9IFtoaXRdO1xuICAgICAgICAgICAgaWYgKGhpdC5pbWFnZVJlZiAmJiBsYXN0UHJldmlldyAmJiBBcnJheS5pc0FycmF5KGxhc3RQcmV2aWV3LnNvdXJjZUltYWdlcykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBncm91cGVkID0gbGFzdFByZXZpZXcuc291cmNlSW1hZ2VzLmZpbmQoKGl0ZW06IGFueSkgPT4gaXRlbSAmJiBpdGVtLmltYWdlUmVmID09PSBoaXQuaW1hZ2VSZWYpO1xuICAgICAgICAgICAgICAgIGlmIChncm91cGVkICYmIEFycmF5LmlzQXJyYXkoZ3JvdXBlZC5hbGxSZWN0cykgJiYgZ3JvdXBlZC5hbGxSZWN0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlY3RzID0gZ3JvdXBlZC5hbGxSZWN0cztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBoaWdobGlnaHRSZWN0cyhyZWN0cyk7XG4gICAgICAgICAgICByZW5kZXJTb3VyY2VzKGxhc3RQcmV2aWV3KTtcbiAgICAgICAgICAgIG1hcmtTZWxlY3RlZFNvdXJjZSgpO1xuICAgICAgICAgICAgc2V0U3RhdHVzKGDlt7LpgInmi6npooTop4jmupDvvJoke2hpdC5wYXRofWAsICdvaycpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHByZXZpZXdQb2ludEZyb21Nb3VzZSA9IChldmVudDogTW91c2VFdmVudCk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB8IG51bGwgPT4ge1xuICAgICAgICAgICAgaWYgKCEkLnByZXZpZXdJbWFnZSB8fCAhbGFzdFByZXZpZXcgfHwgIWxhc3RQcmV2aWV3LmNhbnZhcykgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICBjb25zdCByZWN0ID0gJC5wcmV2aWV3SW1hZ2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICBpZiAocmVjdC53aWR0aCA8PSAwIHx8IHJlY3QuaGVpZ2h0IDw9IDApIHJldHVybiBudWxsO1xuICAgICAgICAgICAgY29uc3QgcHggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xuICAgICAgICAgICAgY29uc3QgcHkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XG4gICAgICAgICAgICBpZiAocHggPCAwIHx8IHB5IDwgMCB8fCBweCA+IHJlY3Qud2lkdGggfHwgcHkgPiByZWN0LmhlaWdodCkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICBjb25zdCBjdyA9IE51bWJlcihsYXN0UHJldmlldy5jYW52YXMud2lkdGgpIHx8IDE7XG4gICAgICAgICAgICBjb25zdCBjaCA9IE51bWJlcihsYXN0UHJldmlldy5jYW52YXMuaGVpZ2h0KSB8fCAxO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB4OiBNYXRoLm1heCgwLCBNYXRoLm1pbihjdywgcHggLyByZWN0LndpZHRoICogY3cpKSxcbiAgICAgICAgICAgICAgICB5OiBNYXRoLm1heCgwLCBNYXRoLm1pbihjaCwgcHkgLyByZWN0LmhlaWdodCAqIGNoKSksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IG1ha2VDYW52YXNSZWN0ID0gKGE6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSwgYjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9KSA9PiAoe1xuICAgICAgICAgICAgeDogTWF0aC5taW4oYS54LCBiLngpLFxuICAgICAgICAgICAgeTogTWF0aC5taW4oYS55LCBiLnkpLFxuICAgICAgICAgICAgd2lkdGg6IE1hdGguYWJzKGEueCAtIGIueCksXG4gICAgICAgICAgICBoZWlnaHQ6IE1hdGguYWJzKGEueSAtIGIueSksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHJlY3RJbnRlcnNlY3Rpb25BcmVhID0gKGE6IGFueSwgYjogYW55KTogbnVtYmVyID0+IHtcbiAgICAgICAgICAgIGlmICghYSB8fCAhYikgcmV0dXJuIDA7XG4gICAgICAgICAgICBjb25zdCBsZWZ0ID0gTWF0aC5tYXgoTnVtYmVyKGEueCkgfHwgMCwgTnVtYmVyKGIueCkgfHwgMCk7XG4gICAgICAgICAgICBjb25zdCB0b3AgPSBNYXRoLm1heChOdW1iZXIoYS55KSB8fCAwLCBOdW1iZXIoYi55KSB8fCAwKTtcbiAgICAgICAgICAgIGNvbnN0IHJpZ2h0ID0gTWF0aC5taW4oKE51bWJlcihhLngpIHx8IDApICsgKE51bWJlcihhLndpZHRoKSB8fCAwKSwgKE51bWJlcihiLngpIHx8IDApICsgKE51bWJlcihiLndpZHRoKSB8fCAwKSk7XG4gICAgICAgICAgICBjb25zdCBib3R0b20gPSBNYXRoLm1pbigoTnVtYmVyKGEueSkgfHwgMCkgKyAoTnVtYmVyKGEuaGVpZ2h0KSB8fCAwKSwgKE51bWJlcihiLnkpIHx8IDApICsgKE51bWJlcihiLmhlaWdodCkgfHwgMCkpO1xuICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KDAsIHJpZ2h0IC0gbGVmdCkgKiBNYXRoLm1heCgwLCBib3R0b20gLSB0b3ApO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHJ1blNlbGVjdGlvbkhpdFRlc3QgPSAocmVjdDogYW55KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBoaXRzID0gbGFzdFByZXZpZXcgJiYgQXJyYXkuaXNBcnJheShsYXN0UHJldmlldy5oaXRzKSA/IGxhc3RQcmV2aWV3LmhpdHMgOiBbXTtcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkID0gaGl0c1xuICAgICAgICAgICAgICAgIC5maWx0ZXIoKGhpdDogYW55KSA9PiBoaXQgJiYgaGl0LndpZHRoID4gMCAmJiBoaXQuaGVpZ2h0ID4gMCAmJiByZWN0SW50ZXJzZWN0aW9uQXJlYShyZWN0LCBoaXQpID4gMC41KVxuICAgICAgICAgICAgICAgIC5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBhYSA9IE1hdGgubWF4KDAsIE51bWJlcihhLndpZHRoKSB8fCAwKSAqIE1hdGgubWF4KDAsIE51bWJlcihhLmhlaWdodCkgfHwgMCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhID0gTWF0aC5tYXgoMCwgTnVtYmVyKGIud2lkdGgpIHx8IDApICogTWF0aC5tYXgoMCwgTnVtYmVyKGIuaGVpZ2h0KSB8fCAwKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFhIC0gYmE7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBzZWxlY3Rpb25IaXRzID0gc2VsZWN0ZWQ7XG4gICAgICAgICAgICBoaWdobGlnaHRlZFByZXZpZXdSZWN0cyA9IHNlbGVjdGVkLnNsaWNlKDAsIDQ4KTtcbiAgICAgICAgICAgIHJlbmRlclByZXZpZXdPdmVybGF5KCk7XG4gICAgICAgICAgICByZW5kZXJTb3VyY2VzKGxhc3RQcmV2aWV3KTtcbiAgICAgICAgICAgIG1hcmtTZWxlY3RlZFNvdXJjZSgpO1xuICAgICAgICAgICAgc2V0U3RhdHVzKGDmoYbpgInlkb3kuK0gJHtzZWxlY3RlZC5sZW5ndGh9IOmhueOAgmAsIHNlbGVjdGVkLmxlbmd0aCA/ICdvaycgOiAnd2FybicpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGJlZ2luUHJldmlld1NlbGVjdGlvbiA9IChldmVudDogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYgKGV2ZW50LmJ1dHRvbiAhPT0gMCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgcG9pbnQgPSBwcmV2aWV3UG9pbnRGcm9tTW91c2UoZXZlbnQpO1xuICAgICAgICAgICAgaWYgKCFwb2ludCkgcmV0dXJuO1xuICAgICAgICAgICAgcHJldmlld1NlbGVjdGluZyA9IHRydWU7XG4gICAgICAgICAgICBwcmV2aWV3U2VsZWN0aW9uU3RhcnQgPSBwb2ludDtcbiAgICAgICAgICAgIGhpZ2hsaWdodGVkUHJldmlld1JlY3RzID0gW107XG4gICAgICAgICAgICBzZWxlY3Rpb25DYW52YXNSZWN0ID0geyB4OiBwb2ludC54LCB5OiBwb2ludC55LCB3aWR0aDogMCwgaGVpZ2h0OiAwIH07XG4gICAgICAgICAgICBzZWxlY3Rpb25IaXRzID0gW107XG4gICAgICAgICAgICByZW5kZXJQcmV2aWV3T3ZlcmxheSgpO1xuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB1cGRhdGVQcmV2aWV3U2VsZWN0aW9uID0gKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXByZXZpZXdTZWxlY3RpbmcgfHwgIXByZXZpZXdTZWxlY3Rpb25TdGFydCkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgcG9pbnQgPSBwcmV2aWV3UG9pbnRGcm9tTW91c2UoZXZlbnQpO1xuICAgICAgICAgICAgaWYgKCFwb2ludCkgcmV0dXJuO1xuICAgICAgICAgICAgc2VsZWN0aW9uQ2FudmFzUmVjdCA9IG1ha2VDYW52YXNSZWN0KHByZXZpZXdTZWxlY3Rpb25TdGFydCwgcG9pbnQpO1xuICAgICAgICAgICAgcmVuZGVyUHJldmlld092ZXJsYXkoKTtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgZmluaXNoUHJldmlld1NlbGVjdGlvbiA9IChldmVudDogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYgKCFwcmV2aWV3U2VsZWN0aW5nIHx8ICFwcmV2aWV3U2VsZWN0aW9uU3RhcnQpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IHBvaW50ID0gcHJldmlld1BvaW50RnJvbU1vdXNlKGV2ZW50KTtcbiAgICAgICAgICAgIHByZXZpZXdTZWxlY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIGlmICghcG9pbnQpIHtcbiAgICAgICAgICAgICAgICBwcmV2aWV3U2VsZWN0aW9uU3RhcnQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlY3QgPSBtYWtlQ2FudmFzUmVjdChwcmV2aWV3U2VsZWN0aW9uU3RhcnQsIHBvaW50KTtcbiAgICAgICAgICAgIHByZXZpZXdTZWxlY3Rpb25TdGFydCA9IG51bGw7XG4gICAgICAgICAgICBpZiAocmVjdC53aWR0aCA8IDMgJiYgcmVjdC5oZWlnaHQgPCAzKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uQ2FudmFzUmVjdCA9IG51bGw7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uSGl0cyA9IFtdO1xuICAgICAgICAgICAgICAgIHJlbmRlclByZXZpZXdPdmVybGF5KCk7XG4gICAgICAgICAgICAgICAgcmVuZGVyU291cmNlcyhsYXN0UHJldmlldyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3VwcHJlc3NOZXh0UHJldmlld0NsaWNrID0gdHJ1ZTtcbiAgICAgICAgICAgIHNlbGVjdGlvbkNhbnZhc1JlY3QgPSByZWN0O1xuICAgICAgICAgICAgcnVuU2VsZWN0aW9uSGl0VGVzdChyZWN0KTtcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgcGlja1ByZXZpZXdIaXRBdCA9IChldmVudDogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICAgICAgaWYgKHN1cHByZXNzTmV4dFByZXZpZXdDbGljaykge1xuICAgICAgICAgICAgICAgIHN1cHByZXNzTmV4dFByZXZpZXdDbGljayA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghJC5wcmV2aWV3SW1hZ2UgfHwgIWxhc3RQcmV2aWV3IHx8ICFsYXN0UHJldmlldy5jYW52YXMgfHwgIUFycmF5LmlzQXJyYXkobGFzdFByZXZpZXcuaGl0cykpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IHBvaW50ID0gcHJldmlld1BvaW50RnJvbU1vdXNlKGV2ZW50KTtcbiAgICAgICAgICAgIGlmICghcG9pbnQpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGN4ID0gcG9pbnQueDtcbiAgICAgICAgICAgIGNvbnN0IGN5ID0gcG9pbnQueTtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRhaW5pbmcgPSBsYXN0UHJldmlldy5oaXRzXG4gICAgICAgICAgICAgICAgLm1hcCgoaGl0OiBhbnksIGluZGV4OiBudW1iZXIpID0+ICh7IGhpdCwgaW5kZXggfSkpXG4gICAgICAgICAgICAgICAgLmZpbHRlcigoeyBoaXQgfTogYW55KSA9PiBoaXQgJiZcbiAgICAgICAgICAgICAgICAgICAgY3ggPj0gTnVtYmVyKGhpdC54KSAmJiBjeSA+PSBOdW1iZXIoaGl0LnkpICYmXG4gICAgICAgICAgICAgICAgICAgIGN4IDw9IE51bWJlcihoaXQueCkgKyBOdW1iZXIoaGl0LndpZHRoKSAmJlxuICAgICAgICAgICAgICAgICAgICBjeSA8PSBOdW1iZXIoaGl0LnkpICsgTnVtYmVyKGhpdC5oZWlnaHQpKTtcbiAgICAgICAgICAgIGlmIChjb250YWluaW5nLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgICAgICAgICAgY29udGFpbmluZy5zb3J0KChhOiBhbnksIGI6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFhID0gTWF0aC5tYXgoMCwgTnVtYmVyKGEuaGl0LndpZHRoKSB8fCAwKSAqIE1hdGgubWF4KDAsIE51bWJlcihhLmhpdC5oZWlnaHQpIHx8IDApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGJhID0gTWF0aC5tYXgoMCwgTnVtYmVyKGIuaGl0LndpZHRoKSB8fCAwKSAqIE1hdGgubWF4KDAsIE51bWJlcihiLmhpdC5oZWlnaHQpIHx8IDApO1xuICAgICAgICAgICAgICAgIGlmIChNYXRoLmFicyhhYSAtIGJhKSA+IDAuMDEpIHJldHVybiBhYSAtIGJhO1xuICAgICAgICAgICAgICAgIHJldHVybiBiLmluZGV4IC0gYS5pbmRleDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc2VsZWN0UHJldmlld0hpdChjb250YWluaW5nWzBdLmhpdCk7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc2NhbiA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfmiavmj4/kuK0uLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICdmaWdtYS1pbXBvcnRlcicsXG4gICAgICAgICAgICAgICAgICAgICdzY2FuLWpzb24tcmVwbGFjZS1jYW5kaWRhdGVzLWJldGEnLFxuICAgICAgICAgICAgICAgICAgICBnZXRQYXRoKCksXG4gICAgICAgICAgICAgICAgICAgIGdldEtpbmQoKSxcbiAgICAgICAgICAgICAgICAgICAgZ2V0Um9vdFV1aWQoKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5omr5o+P5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICd1bmtub3duIGVycm9yJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZmlsbFBhdGhGcm9tUmVzdWx0KHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgbGFzdFNjYW4gPSByZXN1bHQuZGF0YTtcbiAgICAgICAgICAgICAgICByZW5kZXJTdW1tYXJ5KGxhc3RTY2FuKTtcbiAgICAgICAgICAgICAgICByZW5kZXJNYXRjaGVzKGxhc3RTY2FuKTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ+aJq+aPj+WujOaIkOOAgueCueWHu+WMuemFjeihjOWPr+Whq+WFpSBGaWdtYSBwYXRo77yM55So5LqO5oyC6L295a2Q5qCR44CCJywgJ29rJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOaJq+aPj+W8guW4uO+8miR7ZXJyb3IgJiYgZXJyb3IubWVzc2FnZSB8fCBlcnJvcn1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBsb2FkUHJldmlldyA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfliqDovb3pooTop4jkuK0uLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICdmaWdtYS1pbXBvcnRlcicsXG4gICAgICAgICAgICAgICAgICAgICdsb2FkLWpzb24tcHJldmlldy1iZXRhJyxcbiAgICAgICAgICAgICAgICAgICAgZ2V0UGF0aCgpLFxuICAgICAgICAgICAgICAgICAgICB0cnVlXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UgfHwgIXJlc3VsdC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5Yqg6L296aKE6KeI5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICd1bmtub3duIGVycm9yJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmaWxsUGF0aEZyb21SZXN1bHQocmVzdWx0KTtcbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gcmVzdWx0LmRhdGE7XG4gICAgICAgICAgICAgICAgbGFzdFByZXZpZXcgPSBkYXRhO1xuICAgICAgICAgICAgICAgIGlmICgkLnByZXZpZXdJbWFnZSkge1xuICAgICAgICAgICAgICAgICAgICAkLnByZXZpZXdJbWFnZS5zcmMgPSBkYXRhLnByZXZpZXdJbWFnZURhdGFVcmwgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICQucHJldmlld0ltYWdlLmhpZGRlbiA9ICFkYXRhLnByZXZpZXdJbWFnZURhdGFVcmw7XG4gICAgICAgICAgICAgICAgICAgICQucHJldmlld0ltYWdlLm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICgkLnByZXZpZXdPdmVybGF5ICYmICQucHJldmlld0ltYWdlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJC5wcmV2aWV3T3ZlcmxheS5zdHlsZS53aWR0aCA9IGAkeyQucHJldmlld0ltYWdlLmNsaWVudFdpZHRofXB4YDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkLnByZXZpZXdPdmVybGF5LnN0eWxlLmhlaWdodCA9IGAkeyQucHJldmlld0ltYWdlLmNsaWVudEhlaWdodH1weGA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNsZWFySGlnaGxpZ2h0cygpO1xuICAgICAgICAgICAgICAgIHJlbmRlclNvdXJjZXMoZGF0YSk7XG4gICAgICAgICAgICAgICAgaWYgKCQucHJldmlld01ldGEpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdHMgPSBkYXRhLnN0YXRzIHx8IHt9O1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnRlcmZhY2VUZXh0ID0gc3RhdHMuaW50ZXJmYWNlQ291bnQgPiAxID8gYCDCtyDpooTop4jnrKwgMS8ke3N0YXRzLmludGVyZmFjZUNvdW50fSDnlYzpnaJgIDogJyc7XG4gICAgICAgICAgICAgICAgICAgICQucHJldmlld01ldGEudGV4dENvbnRlbnQgPSBkYXRhLnByZXZpZXdJbWFnZURhdGFVcmxcbiAgICAgICAgICAgICAgICAgICAgICAgID8gYCR7ZGF0YS5uYW1lIHx8ICdQcmV2aWV3J30gwrcgJHtkYXRhLmNhbnZhcy53aWR0aH3DlyR7ZGF0YS5jYW52YXMuaGVpZ2h0fSDCtyAke3N0YXRzLmhpdHMgfHwgMH0gaGl0cyR7aW50ZXJmYWNlVGV4dH1gXG4gICAgICAgICAgICAgICAgICAgICAgICA6ICdKU09OIOS4reayoeacieaVtOW4p+mihOiniOWbvuOAgic7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNldFN0YXR1cygn6aKE6KeI5bey5Yqg6L2944CCJywgZGF0YS5wcmV2aWV3SW1hZ2VEYXRhVXJsID8gJ29rJyA6ICd3YXJuJyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDliqDovb3pooTop4jlvILluLjvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc2NhblRleHR1cmVzID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ+i0tOWbvumihOiniOaJq+aPj+S4rS4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgJ2ZpZ21hLWltcG9ydGVyJyxcbiAgICAgICAgICAgICAgICAgICAgJ3NjYW4tanNvbi10ZXh0dXJlcy1iZXRhJyxcbiAgICAgICAgICAgICAgICAgICAgZ2V0UGF0aCgpLFxuICAgICAgICAgICAgICAgICAgICB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBmYWxzZVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlIHx8ICFyZXN1bHQuZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOi0tOWbvumihOiniOWksei0pe+8miR7cmVzdWx0ICYmIHJlc3VsdC5lcnJvciB8fCAndW5rbm93biBlcnJvcid9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZmlsbFBhdGhGcm9tUmVzdWx0KHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgbGFzdFRleHR1cmVTY2FuID0gcmVzdWx0LmRhdGE7XG4gICAgICAgICAgICAgICAgcmVuZGVyVGV4dHVyZXMobGFzdFRleHR1cmVTY2FuKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzID0gbGFzdFRleHR1cmVTY2FuLnN0YXRzIHx8IHt9O1xuICAgICAgICAgICAgICAgIGNvbnN0IGF0dGVudGlvbiA9IChzLm1pc3NpbmcgfHwgMCkgKyAocy5maWdtYUltcG9ydEZvdW5kIHx8IDApO1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhcbiAgICAgICAgICAgICAgICAgICAgYXR0ZW50aW9uID4gMFxuICAgICAgICAgICAgICAgICAgICAgICAgPyBg6LS05Zu+6aKE6KeI5a6M5oiQ77yaJHthdHRlbnRpb259IOW8oOmcgOimgeWFs+azqOOAgmBcbiAgICAgICAgICAgICAgICAgICAgICAgIDogJ+i0tOWbvumihOiniOWujOaIkO+8muWFqOmDqOWUr+S4gOi0tOWbvuW3suacieato+W8jy/lpJbpg6jotYTmupDlkb3kuK3jgIInLFxuICAgICAgICAgICAgICAgICAgICBhdHRlbnRpb24gPiAwID8gJ3dhcm4nIDogJ29rJ1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDotLTlm77pooTop4jlvILluLjvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgY29weU1pc3NpbmdUZXh0dXJlcyA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGlmICghbGFzdFRleHR1cmVTY2FuKSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfor7flhYjmiavmj4/otLTlm77pooTop4jjgIInLCAnd2FybicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGVudHJpZXMgPSAobGFzdFRleHR1cmVTY2FuLmVudHJpZXMgfHwgW10pLmZpbHRlcih0ZXh0dXJlTmVlZHNBdHRlbnRpb24pO1xuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBlbnRyaWVzLm1hcCgoaXRlbTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IGl0ZW0uaW1hZ2VOYW1lIHx8IGl0ZW0ubmFtZSB8fCBpdGVtLmltYWdlUmVmIHx8ICdJbWFnZSc7XG4gICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IGl0ZW0ucGF0aCB8fCAoaXRlbS5hbGxSZWN0cyAmJiBpdGVtLmFsbFJlY3RzWzBdICYmIGl0ZW0uYWxsUmVjdHNbMF0ucGF0aCkgfHwgJyc7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGAke25hbWV9XFx0JHtNYXRoLnJvdW5kKGl0ZW0ud2lkdGggfHwgMCl9eCR7TWF0aC5yb3VuZChpdGVtLmhlaWdodCB8fCAwKX1cXHQke3RleHR1cmVTdGF0dXNMYWJlbChpdGVtLnN0YXR1cyl9XFx0JHtwYXRofWA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQobGluZXMuam9pbignXFxuJykpO1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5bey5aSN5Yi2ICR7bGluZXMubGVuZ3RofSDmnaHotLTlm77lhbPms6jmuIXljZXjgIJgLCAnb2snKTtcbiAgICAgICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cygn5aSN5Yi25aSx6LSl77ya5b2T5YmN6Z2i5p2/5peg5rOV6K6/6Zeu5Ymq6LS05p2/44CCJywgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgaW1wb3J0TWlzc2luZ1RleHR1cmVzID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ+aPkOWJjeWvvOWFpee8uuWksei0tOWbvuS4rS4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgJ2ZpZ21hLWltcG9ydGVyJyxcbiAgICAgICAgICAgICAgICAgICAgJ2ltcG9ydC1taXNzaW5nLXRleHR1cmVzLWJldGEnLFxuICAgICAgICAgICAgICAgICAgICBnZXRQYXRoKCksXG4gICAgICAgICAgICAgICAgICAgIGZhbHNlXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDmj5DliY3lr7zlhaXlpLHotKXvvJoke3Jlc3VsdCAmJiByZXN1bHQuZXJyb3IgfHwgJ3Vua25vd24gZXJyb3InfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZpbGxQYXRoRnJvbVJlc3VsdChyZXN1bHQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSByZXN1bHQuZGF0YSB8fCB7fTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOaPkOWJjeWvvOWFpeWujOaIkO+8miR7ZGF0YS5sYW5kZWQgfHwgZGF0YS5pbXBvcnRlZCB8fCAwfS8ke2RhdGEucmVxdWVzdGVkIHx8IDB9IOW8oOOAgmAsICdvaycpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHNjYW5UZXh0dXJlcygpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5o+Q5YmN5a+85YWl5byC5bi477yaJHtlcnJvciAmJiBlcnJvci5tZXNzYWdlIHx8IGVycm9yfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGFwcGx5QmF0Y2ggPSBhc3luYyAoZHJ5UnVuOiBib29sZWFuKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhkcnlSdW4gPyAnZHJ5LXJ1biDkuK0uLi4nIDogJ+aJuemHj+W6lOeUqOS4rS4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgJ2ZpZ21hLWltcG9ydGVyJyxcbiAgICAgICAgICAgICAgICAgICAgJ2FwcGx5LW1hdGNoZWQtbm9kZXMtdG8tc2VsZWN0ZWQtcm9vdC1iZXRhJyxcbiAgICAgICAgICAgICAgICAgICAgZ2V0UGF0aCgpLFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICByb290VXVpZDogZ2V0Um9vdFV1aWQoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGtpbmQ6IGdldEtpbmQoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1pblNjb3JlOiBnZXRNaW5TY29yZSgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgZmxhZ3M6IGdldEZsYWdzKCksXG4gICAgICAgICAgICAgICAgICAgICAgICBkcnlSdW4sXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYCR7ZHJ5UnVuID8gJ2RyeS1ydW4nIDogJ+aJuemHj+W6lOeUqCd95aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICd1bmtub3duIGVycm9yJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmaWxsUGF0aEZyb21SZXN1bHQocmVzdWx0KTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoXG4gICAgICAgICAgICAgICAgICAgIGRyeVJ1blxuICAgICAgICAgICAgICAgICAgICAgICAgPyBgZHJ5LXJ1biDlrozmiJDvvJrorqHliJIgJHtyZXN1bHQucGxhbm5lZCB8fCAwfe+8jOi3s+i/hyAke3Jlc3VsdC5za2lwcGVkIHx8IDB9YFxuICAgICAgICAgICAgICAgICAgICAgICAgOiBg5om56YeP5bqU55So5a6M5oiQ77ya5bqU55SoICR7cmVzdWx0LmFwcGxpZWQgfHwgMH3vvIzlpLHotKUgJHtyZXN1bHQuZmFpbGVkIHx8IDB977yM6Lez6L+HICR7cmVzdWx0LnNraXBwZWQgfHwgMH1gLFxuICAgICAgICAgICAgICAgICAgICByZXN1bHQuZmFpbGVkID8gJ3dhcm4nIDogJ29rJ1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDmibnph4/lupTnlKjlvILluLjvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgaW1wb3J0RnVsbCA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCflrozmlbTlr7zlhaXkuK0uLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoXG4gICAgICAgICAgICAgICAgICAgICdmaWdtYS1pbXBvcnRlcicsXG4gICAgICAgICAgICAgICAgICAgICdpbXBvcnQtZnJvbS1qc29uJyxcbiAgICAgICAgICAgICAgICAgICAgZ2V0UGF0aCgpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDlrozmlbTlr7zlhaXlpLHotKXvvJoke3Jlc3VsdCAmJiByZXN1bHQuZXJyb3IgfHwgJ3Vua25vd24gZXJyb3InfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZpbGxQYXRoRnJvbVJlc3VsdChyZXN1bHQpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSByZXN1bHQuZGF0YSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5yb290VXVpZCAmJiAkLnJvb3RVdWlkKSAkLnJvb3RVdWlkLnZhbHVlID0gZGF0YS5yb290VXVpZDtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOWujOaVtOWvvOWFpeWujOaIkO+8miR7ZGF0YS5yb290VXVpZCB8fCBkYXRhLnJvb3ROYW1lIHx8ICdGaWdtYSBVSSd9YCwgJ29rJyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDlrozmlbTlr7zlhaXlvILluLjvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3Qgc2F2ZVByZWZhYiA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfkv53lrZggUHJlZmFiIOS4rS4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnZmlnbWEtaW1wb3J0ZXInLCAnc2F2ZS1ub2RlLWFzLXByZWZhYi1iZXRhJyk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5L+d5a2YIFByZWZhYiDlpLHotKXvvJoke3Jlc3VsdCAmJiByZXN1bHQuZXJyb3IgfHwgJ3Vua25vd24gZXJyb3InfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5bey5L+d5a2YIFByZWZhYu+8miR7cmVzdWx0LmRiVXJsIHx8IHJlc3VsdC5uYW1lIHx8ICdQcmVmYWInfWAsICdvaycpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5L+d5a2YIFByZWZhYiDlvILluLjvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgaW5zdGFudGlhdGVQcmVmYWIgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cygn5a6e5L6L5YyWIFByZWZhYiDkuK0uLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2ZpZ21hLWltcG9ydGVyJywgJ2luc3RhbnRpYXRlLXByZWZhYi1iZXRhJyk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5a6e5L6L5YyWIFByZWZhYiDlpLHotKXvvJoke3Jlc3VsdCAmJiByZXN1bHQuZXJyb3IgfHwgJ3Vua25vd24gZXJyb3InfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSByZXN1bHQuZGF0YSB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAoZGF0YS5yb290VXVpZCAmJiAkLnJvb3RVdWlkKSAkLnJvb3RVdWlkLnZhbHVlID0gZGF0YS5yb290VXVpZDtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOW3suWunuS+i+WMliBQcmVmYWLvvJoke2RhdGEucm9vdE5hbWUgfHwgcmVzdWx0Lm5hbWUgfHwgJ1ByZWZhYid9YCwgJ29rJyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDlrp7kvovljJYgUHJlZmFiIOW8guW4uO+8miR7ZXJyb3IgJiYgZXJyb3IubWVzc2FnZSB8fCBlcnJvcn1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCByZXJlbmRlck1hdGNoZXMgPSAoKSA9PiB7XG4gICAgICAgICAgICBpZiAoIWxhc3RTY2FuKSByZXR1cm47XG4gICAgICAgICAgICByZW5kZXJNYXRjaGVzKGxhc3RTY2FuKTtcbiAgICAgICAgICAgIG1hcmtTZWxlY3RlZFNvdXJjZSgpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGVuc3VyZVJvd1NuYXBzaG90ID0gYXN5bmMgKHRhcmdldFV1aWQ6IHN0cmluZyk6IFByb21pc2U8YW55PiA9PiB7XG4gICAgICAgICAgICBpZiAocm93U25hcHNob3RzW3RhcmdldFV1aWRdKSByZXR1cm4gcm93U25hcHNob3RzW3RhcmdldFV1aWRdO1xuICAgICAgICAgICAgc2V0U3RhdHVzKCforrDlvZXnm67moIfljp/lp4vnirbmgIEuLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAnZmlnbWEtaW1wb3J0ZXInLFxuICAgICAgICAgICAgICAgICdzbmFwc2hvdC1yZXBsYWNlLXRhcmdldC1iZXRhJyxcbiAgICAgICAgICAgICAgICB0YXJnZXRVdWlkXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlIHx8ICFyZXN1bHQuZGF0YSB8fCAhcmVzdWx0LmRhdGEuc25hcHNob3QpIHtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOiusOW9leebruagh+WOn+Wni+eKtuaAgeWksei0pe+8miR7cmVzdWx0ICYmIHJlc3VsdC5lcnJvciB8fCAndW5rbm93biBlcnJvcid9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByb3dTbmFwc2hvdHNbdGFyZ2V0VXVpZF0gPSByZXN1bHQuZGF0YS5zbmFwc2hvdDtcbiAgICAgICAgICAgIHJlcmVuZGVyTWF0Y2hlcygpO1xuICAgICAgICAgICAgcmV0dXJuIHJvd1NuYXBzaG90c1t0YXJnZXRVdWlkXTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCByZXN0b3JlU25hcHNob3QgPSBhc3luYyAodGFyZ2V0VXVpZDogc3RyaW5nLCBzYXZlOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG4gICAgICAgICAgICBjb25zdCBzbmFwc2hvdCA9IHJvd1NuYXBzaG90c1t0YXJnZXRVdWlkXTtcbiAgICAgICAgICAgIGlmICghc25hcHNob3QpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAnZmlnbWEtaW1wb3J0ZXInLFxuICAgICAgICAgICAgICAgICdyZXN0b3JlLXJlcGxhY2UtdGFyZ2V0LWJldGEnLFxuICAgICAgICAgICAgICAgIHsgc25hcHNob3QsIHNhdmUgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg6L+Y5Y6f5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICd1bmtub3duIGVycm9yJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCByZXN0b3JlUm93ID0gYXN5bmMgKHRhcmdldFV1aWQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgaWYgKCF0YXJnZXRVdWlkKSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfov5jljp/lpLHotKXvvJrnvLrlsJEgdGFyZ2V0VXVpZOOAgicsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcm93U25hcHNob3RzW3RhcmdldFV1aWRdKSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfov5nooYzov5jmsqHmnInlj6/ov5jljp/nmoTlv6vnhafjgIInLCAnd2FybicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCfov5jljp/mnKzooYzkuK0uLi4nLCAnaW5mbycpO1xuICAgICAgICAgICAgICAgIGNvbnN0IG9rID0gYXdhaXQgcmVzdG9yZVNuYXBzaG90KHRhcmdldFV1aWQsIHRydWUpO1xuICAgICAgICAgICAgICAgIGlmICghb2spIHJldHVybjtcbiAgICAgICAgICAgICAgICBkZWxldGUgcm93U25hcHNob3RzW3RhcmdldFV1aWRdO1xuICAgICAgICAgICAgICAgIGRlbGV0ZSByb3dTdGF0ZXNbdGFyZ2V0VXVpZF07XG4gICAgICAgICAgICAgICAgcmVyZW5kZXJNYXRjaGVzKCk7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDlt7Lov5jljp/mnKzooYzvvJoke3RhcmdldFV1aWR9YCwgJ29rJyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDov5jljp/lvILluLjvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgbG9jYXRlUm93ID0gYXN5bmMgKHRhcmdldFV1aWQ6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgaWYgKCF0YXJnZXRVdWlkKSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKCflrprkvY3lpLHotKXvvJrnvLrlsJEgdGFyZ2V0VXVpZOOAgicsICdlcnJvcicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgJ2ZpZ21hLWltcG9ydGVyJyxcbiAgICAgICAgICAgICAgICAgICAgJ3NlbGVjdC1yZXBsYWNlLXRhcmdldC1iZXRhJyxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0VXVpZFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5a6a5L2N5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICd1bmtub3duIGVycm9yJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gcmVzdWx0LmRhdGEgfHwge307XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDlt7LlrprkvY3vvJoke2RhdGEuc2NlbmVQYXRoIHx8IGRhdGEubmFtZSB8fCB0YXJnZXRVdWlkfWAsICdvaycpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5a6a5L2N5byC5bi477yaJHtlcnJvciAmJiBlcnJvci5tZXNzYWdlIHx8IGVycm9yfWAsICdlcnJvcicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IGFwcGx5Um93ID0gYXN5bmMgKHRhcmdldFV1aWQ6IHN0cmluZywgZmlnbWFQYXRoPzogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBpZiAoIXRhcmdldFV1aWQpIHtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ+mAkOihjOW6lOeUqOWksei0pe+8mue8uuWwkSB0YXJnZXRVdWlk44CCJywgJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGVuc3VyZVJvd1NuYXBzaG90KHRhcmdldFV1aWQpO1xuICAgICAgICAgICAgICAgIGlmICghc25hcHNob3QpIHJldHVybjtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN0b3JlZCA9IGF3YWl0IHJlc3RvcmVTbmFwc2hvdCh0YXJnZXRVdWlkLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN0b3JlZCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cygn6YCQ6KGM5bqU55So5LitLi4uJywgJ2luZm8nKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAnZmlnbWEtaW1wb3J0ZXInLFxuICAgICAgICAgICAgICAgICAgICAnYXBwbHktanNvbi1ub2RlLXRvLXRhcmdldC1iZXRhJyxcbiAgICAgICAgICAgICAgICAgICAgZ2V0UGF0aCgpLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRVdWlkLFxuICAgICAgICAgICAgICAgICAgICBmaWdtYVBhdGgsXG4gICAgICAgICAgICAgICAgICAgIGdldFJvd0ZsYWdzKHRhcmdldFV1aWQpXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVW5pdHkgUmVzb3VyY2VSZXBsYWNlIHRyZWF0cyBlYWNoIGFwcGx5IGFzIGEgdHJhbnNhY3Rpb246XG4gICAgICAgICAgICAgICAgICAgIC8vIGV2ZW4gdGhlIGZpcnN0IGZhaWxlZCBhdHRlbXB0IHJldHVybnMgdG8gdGhlIHJvdyBzbmFwc2hvdC5cbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVzdG9yZVNuYXBzaG90KHRhcmdldFV1aWQsIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOmAkOihjOW6lOeUqOWksei0pe+8miR7cmVzdWx0ICYmIHJlc3VsdC5lcnJvciB8fCAndW5rbm93biBlcnJvcid9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSByZXN1bHQubWF0Y2ggfHwge307XG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoLmZpZ21hUGF0aCAmJiAkLmZpZ21hUGF0aCkgJC5maWdtYVBhdGgudmFsdWUgPSBtYXRjaC5maWdtYVBhdGg7XG4gICAgICAgICAgICAgICAgZ2V0Um93U3RhdGUodGFyZ2V0VXVpZCkuYXNzaWduZWRQYXRoID0gbWF0Y2guZmlnbWFQYXRoIHx8IGZpZ21hUGF0aCB8fCAnJztcbiAgICAgICAgICAgICAgICByZXJlbmRlck1hdGNoZXMoKTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOmAkOihjOW6lOeUqOWujOaIkO+8miR7bWF0Y2guZmlnbWFQYXRoIHx8IGZpZ21hUGF0aCB8fCB0YXJnZXRVdWlkfWAsICdvaycpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgICAgIGlmIChyb3dTbmFwc2hvdHNbdGFyZ2V0VXVpZF0pIGF3YWl0IHJlc3RvcmVTbmFwc2hvdCh0YXJnZXRVdWlkLCB0cnVlKTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOmAkOihjOW6lOeUqOW8guW4uO+8miR7ZXJyb3IgJiYgZXJyb3IubWVzc2FnZSB8fCBlcnJvcn1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBhdHRhY2ggPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpZ21hUGF0aCA9IFN0cmluZygkLmZpZ21hUGF0aCAmJiAkLmZpZ21hUGF0aC52YWx1ZSB8fCAnJykudHJpbSgpIHx8IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoJ+aMgui9veWtkOagkeS4rS4uLicsICdpbmZvJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcbiAgICAgICAgICAgICAgICAgICAgJ2ZpZ21hLWltcG9ydGVyJyxcbiAgICAgICAgICAgICAgICAgICAgJ2F0dGFjaC1tYXRjaGVkLW5vZGUtYXMtY2hpbGQtYmV0YScsXG4gICAgICAgICAgICAgICAgICAgIGdldFBhdGgoKSxcbiAgICAgICAgICAgICAgICAgICAgZmlnbWFQYXRoLFxuICAgICAgICAgICAgICAgICAgICB7IHBhcmVudFV1aWQ6IGdldFJvb3RVdWlkKCkgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5oyC6L295aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICd1bmtub3duIGVycm9yJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmaWxsUGF0aEZyb21SZXN1bHQocmVzdWx0KTtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOaMgui9veWujOaIkO+8miR7cmVzdWx0Lm1hdGNoICYmIHJlc3VsdC5tYXRjaC5maWdtYVBhdGggfHwgJ21hdGNoZWQgbm9kZSd9YCwgJ29rJyk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICAgICAgc2V0U3RhdHVzKGDmjILovb3lvILluLjvvJoke2Vycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3J9YCwgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgYXBwbHlUb1NlbGVjdGVkID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWdtYVBhdGggPSBTdHJpbmcoJC5maWdtYVBhdGggJiYgJC5maWdtYVBhdGgudmFsdWUgfHwgJycpLnRyaW0oKSB8fCBzZWxlY3RlZFNvdXJjZVBhdGggfHwgdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHNldFN0YXR1cygn5bqU55So5Yiw5b2T5YmN6YCJ5Lit6IqC54K55LitLi4uJywgJ2luZm8nKTtcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFxuICAgICAgICAgICAgICAgICAgICAnZmlnbWEtaW1wb3J0ZXInLFxuICAgICAgICAgICAgICAgICAgICAnYXBwbHktbWF0Y2hlZC1ub2RlLXRvLXNlbGVjdGVkLWJldGEnLFxuICAgICAgICAgICAgICAgICAgICBnZXRQYXRoKCksXG4gICAgICAgICAgICAgICAgICAgIGZpZ21hUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgZ2V0RmxhZ3MoKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN1Y2Nlc3MgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldFN0YXR1cyhg5bqU55So5Yiw6YCJ5Lit5aSx6LSl77yaJHtyZXN1bHQgJiYgcmVzdWx0LmVycm9yIHx8ICd1bmtub3duIGVycm9yJ31gLCAnZXJyb3InKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmaWxsUGF0aEZyb21SZXN1bHQocmVzdWx0KTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaCA9IHJlc3VsdC5tYXRjaCB8fCB7fTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2guZmlnbWFQYXRoICYmICQuZmlnbWFQYXRoKSAkLmZpZ21hUGF0aC52YWx1ZSA9IG1hdGNoLmZpZ21hUGF0aDtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOW6lOeUqOWIsOmAieS4reWujOaIkO+8miR7bWF0Y2guZmlnbWFQYXRoIHx8IGZpZ21hUGF0aCB8fCAnbWF0Y2hlZCBub2RlJ31gLCAnb2snKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBzZXRTdGF0dXMoYOW6lOeUqOWIsOmAieS4reW8guW4uO+8miR7ZXJyb3IgJiYgZXJyb3IubWVzc2FnZSB8fCBlcnJvcn1gLCAnZXJyb3InKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBhcHBseVJlcGxhY2VXb3Jrc3BhY2VQYXRoID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVQYXRoID0gbm9ybWFsaXplQ3VycmVudEpzb25QYXRoKHZhbHVlKTtcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzUGF0aCA9IHdvcmtzcGFjZUpzb25QYXRoO1xuICAgICAgICAgICAgd29ya3NwYWNlSnNvblBhdGggPSBmaWxlUGF0aDtcbiAgICAgICAgICAgIGlmICgkLmpzb25QYXRoKSB7XG4gICAgICAgICAgICAgICAgJC5qc29uUGF0aC52YWx1ZSA9IGZpbGVQYXRoO1xuICAgICAgICAgICAgICAgICQuanNvblBhdGgudGl0bGUgPSBmaWxlUGF0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaWxlUGF0aCA9PT0gcHJldmlvdXNQYXRoKSByZXR1cm47XG5cbiAgICAgICAgICAgIGxhc3RTY2FuID0gbnVsbDtcbiAgICAgICAgICAgIGxhc3RQcmV2aWV3ID0gbnVsbDtcbiAgICAgICAgICAgIGxhc3RUZXh0dXJlU2NhbiA9IG51bGw7XG4gICAgICAgICAgICBzZWxlY3RlZFNvdXJjZVBhdGggPSAnJztcbiAgICAgICAgICAgIGhpZ2hsaWdodGVkUHJldmlld1JlY3RzID0gW107XG4gICAgICAgICAgICBzZWxlY3Rpb25DYW52YXNSZWN0ID0gbnVsbDtcbiAgICAgICAgICAgIHNlbGVjdGlvbkhpdHMgPSBbXTtcbiAgICAgICAgICAgIHByZXZpZXdTZWxlY3RpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHByZXZpZXdTZWxlY3Rpb25TdGFydCA9IG51bGw7XG4gICAgICAgICAgICBzdXBwcmVzc05leHRQcmV2aWV3Q2xpY2sgPSBmYWxzZTtcbiAgICAgICAgICAgIGlmICgkLmZpZ21hUGF0aCkgJC5maWdtYVBhdGgudmFsdWUgPSAnJztcbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdJbWFnZSkge1xuICAgICAgICAgICAgICAgICQucHJldmlld0ltYWdlLm9ubG9hZCA9IG51bGw7XG4gICAgICAgICAgICAgICAgJC5wcmV2aWV3SW1hZ2Uuc3JjID0gJyc7XG4gICAgICAgICAgICAgICAgJC5wcmV2aWV3SW1hZ2UuaGlkZGVuID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgkLnByZXZpZXdNZXRhKSAkLnByZXZpZXdNZXRhLnRleHRDb250ZW50ID0gJ+aaguaXoOmihOiniCc7XG4gICAgICAgICAgICBpZiAoJC5wcmV2aWV3T3ZlcmxheSkgJC5wcmV2aWV3T3ZlcmxheS5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgICAgIHJlbmRlclN1bW1hcnkobnVsbCk7XG4gICAgICAgICAgICByZW5kZXJNYXRjaGVzKG51bGwpO1xuICAgICAgICAgICAgcmVuZGVyU291cmNlcyhudWxsKTtcbiAgICAgICAgICAgIHJlbmRlclRleHR1cmVzKG51bGwpO1xuICAgICAgICAgICAgc2V0U3RhdHVzKFxuICAgICAgICAgICAgICAgIGZpbGVQYXRoID8gJ+W3sue7p+aJv+W3peS9nOWPsCBKU09O77yM6K+35Yqg6L296aKE6KeI5oiW5omr5o+P44CCJyA6ICfmnKrpgInmi6kgSlNPTuOAgicsXG4gICAgICAgICAgICAgICAgJ2luZm8nLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfTtcblxuICAgICAgICAkLnByZXZpZXdCdG4gJiYgJC5wcmV2aWV3QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgbG9hZFByZXZpZXcpO1xuICAgICAgICAkLmpzb25QYXRoICYmICQuanNvblBhdGguYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSBub3JtYWxpemVDdXJyZW50SnNvblBhdGgoJC5qc29uUGF0aCAmJiAkLmpzb25QYXRoLnZhbHVlKTtcbiAgICAgICAgICAgIGlmIChhcHBseVJlcGxhY2VXb3Jrc3BhY2VQYXRoKSBhcHBseVJlcGxhY2VXb3Jrc3BhY2VQYXRoKGZpbGVQYXRoKTtcbiAgICAgICAgICAgIHZvaWQgd3JpdGVDdXJyZW50SnNvblBhdGgoZmlsZVBhdGgpO1xuICAgICAgICB9KTtcbiAgICAgICAgJC50ZXh0dXJlQnRuICYmICQudGV4dHVyZUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHNjYW5UZXh0dXJlcyk7XG4gICAgICAgICQudGV4dHVyZU9ubHlNaXNzaW5nICYmICQudGV4dHVyZU9ubHlNaXNzaW5nLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHJlbmRlclRleHR1cmVzKGxhc3RUZXh0dXJlU2NhbikpO1xuICAgICAgICAkLnRleHR1cmVDb3B5QnRuICYmICQudGV4dHVyZUNvcHlCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjb3B5TWlzc2luZ1RleHR1cmVzKTtcbiAgICAgICAgJC50ZXh0dXJlSW1wb3J0QnRuICYmICQudGV4dHVyZUltcG9ydEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGltcG9ydE1pc3NpbmdUZXh0dXJlcyk7XG4gICAgICAgICQuc2NhbkJ0biAmJiAkLnNjYW5CdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBzY2FuKTtcbiAgICAgICAgJC5pbXBvcnRCdG4gJiYgJC5pbXBvcnRCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbXBvcnRGdWxsKTtcbiAgICAgICAgJC5zYXZlUHJlZmFiQnRuICYmICQuc2F2ZVByZWZhYkJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHNhdmVQcmVmYWIpO1xuICAgICAgICAkLmluc3RhbnRpYXRlUHJlZmFiQnRuICYmICQuaW5zdGFudGlhdGVQcmVmYWJCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBpbnN0YW50aWF0ZVByZWZhYik7XG4gICAgICAgICQuZHJ5UnVuQnRuICYmICQuZHJ5UnVuQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gYXBwbHlCYXRjaCh0cnVlKSk7XG4gICAgICAgICQuYXBwbHlCdG4gJiYgJC5hcHBseUJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGFwcGx5QmF0Y2goZmFsc2UpKTtcbiAgICAgICAgJC5hcHBseVNlbGVjdGVkQnRuICYmICQuYXBwbHlTZWxlY3RlZEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGFwcGx5VG9TZWxlY3RlZCk7XG4gICAgICAgICQuYXR0YWNoQnRuICYmICQuYXR0YWNoQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgYXR0YWNoKTtcbiAgICAgICAgaWYgKCQucHJldmlld1N0YWdlKSB7XG4gICAgICAgICAgICAkLnByZXZpZXdTdGFnZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBiZWdpblByZXZpZXdTZWxlY3Rpb24pO1xuICAgICAgICAgICAgJC5wcmV2aWV3U3RhZ2UuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdXBkYXRlUHJldmlld1NlbGVjdGlvbik7XG4gICAgICAgICAgICAkLnByZXZpZXdTdGFnZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgZmluaXNoUHJldmlld1NlbGVjdGlvbik7XG4gICAgICAgICAgICAkLnByZXZpZXdTdGFnZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWxlYXZlJywgZmluaXNoUHJldmlld1NlbGVjdGlvbik7XG4gICAgICAgICAgICAkLnByZXZpZXdTdGFnZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHBpY2tQcmV2aWV3SGl0QXQpO1xuICAgICAgICB9XG4gICAgICAgIHJlbmRlclN1bW1hcnkobGFzdFNjYW4pO1xuICAgICAgICByZW5kZXJNYXRjaGVzKGxhc3RTY2FuKTtcbiAgICAgICAgcmVuZGVyU291cmNlcyhsYXN0UHJldmlldyk7XG4gICAgICAgIHJlbmRlclRleHR1cmVzKGxhc3RUZXh0dXJlU2Nhbik7XG4gICAgICAgIHNldFN0YXR1cygn6YCJ5oupIEpTT04g5ZCO5omr5o+P77ybcm9vdFV1aWQg55WZ56m65pe25L2/55So5b2T5YmN6YCJ5LitL+acgOi/keWvvOWFpeagueOAgicsICdpbmZvJyk7XG4gICAgICAgIHZvaWQgcmVhZEN1cnJlbnRKc29uUGF0aCgpLnRoZW4oKGZpbGVQYXRoKSA9PiB7XG4gICAgICAgICAgICBpZiAoYXBwbHlSZXBsYWNlV29ya3NwYWNlUGF0aCkgYXBwbHlSZXBsYWNlV29ya3NwYWNlUGF0aChmaWxlUGF0aCk7XG4gICAgICAgIH0pO1xuICAgIH0sXG4gICAgdXBkYXRlKG9wdGlvbnM/OiB7IGpzb25QYXRoPzogc3RyaW5nIH0pIHtcbiAgICAgICAgaWYgKCFvcHRpb25zIHx8ICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywgJ2pzb25QYXRoJykpIHJldHVybjtcbiAgICAgICAgY29uc3QgZmlsZVBhdGggPSBub3JtYWxpemVDdXJyZW50SnNvblBhdGgob3B0aW9ucyAmJiBvcHRpb25zLmpzb25QYXRoKTtcbiAgICAgICAgaWYgKGFwcGx5UmVwbGFjZVdvcmtzcGFjZVBhdGgpIHtcbiAgICAgICAgICAgIGFwcGx5UmVwbGFjZVdvcmtzcGFjZVBhdGgoZmlsZVBhdGgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgJCA9IGFzRWxlbWVudE1hcCh0aGlzLiQpO1xuICAgICAgICAgICAgaWYgKCQuanNvblBhdGgpIHtcbiAgICAgICAgICAgICAgICAkLmpzb25QYXRoLnZhbHVlID0gZmlsZVBhdGg7XG4gICAgICAgICAgICAgICAgJC5qc29uUGF0aC50aXRsZSA9IGZpbGVQYXRoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHZvaWQgd3JpdGVDdXJyZW50SnNvblBhdGgoZmlsZVBhdGgpO1xuICAgIH0sXG4gICAgY2xvc2UoKSB7XG4gICAgICAgIGFwcGx5UmVwbGFjZVdvcmtzcGFjZVBhdGggPSBudWxsO1xuICAgIH0sXG59KTtcblxuZnVuY3Rpb24gZXNjYXBlSHRtbCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gU3RyaW5nKHZhbHVlIHx8ICcnKVxuICAgICAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuICAgICAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXG4gICAgICAgIC5yZXBsYWNlKC8+L2csICcmZ3Q7JylcbiAgICAgICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuICAgICAgICAucmVwbGFjZSgvJy9nLCAnJiMzOTsnKTtcbn1cbiJdfQ==