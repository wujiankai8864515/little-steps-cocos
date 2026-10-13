import { readFileSync } from 'fs';
import { join } from 'path';
import {
    normalizeCurrentJsonPath,
    readCurrentJsonPath,
    writeCurrentJsonPath,
} from '../../json-workspace-state';

type PanelElementMap = {
    app?: HTMLElement;
    jsonPath?: HTMLInputElement;
    rootUuid?: HTMLInputElement;
    kind?: HTMLSelectElement;
    minScore?: HTMLInputElement;
    flagImage?: HTMLInputElement;
    flagText?: HTMLInputElement;
    flagPosition?: HTMLInputElement;
    flagAlpha?: HTMLInputElement;
    figmaPath?: HTMLInputElement;
    status?: HTMLElement;
    summary?: HTMLElement;
    matches?: HTMLElement;
    previewBtn?: HTMLButtonElement;
    previewMeta?: HTMLElement;
    previewStage?: HTMLElement;
    previewOverlay?: HTMLElement;
    previewImage?: HTMLImageElement;
    sources?: HTMLElement;
    textureBtn?: HTMLButtonElement;
    textureOnlyMissing?: HTMLInputElement;
    textureCopyBtn?: HTMLButtonElement;
    textureImportBtn?: HTMLButtonElement;
    textureSummary?: HTMLElement;
    textures?: HTMLElement;
    scanBtn?: HTMLButtonElement;
    importBtn?: HTMLButtonElement;
    savePrefabBtn?: HTMLButtonElement;
    instantiatePrefabBtn?: HTMLButtonElement;
    dryRunBtn?: HTMLButtonElement;
    applyBtn?: HTMLButtonElement;
    applySelectedBtn?: HTMLButtonElement;
    attachBtn?: HTMLButtonElement;
};

function asElementMap(raw: any): PanelElementMap {
    return raw as PanelElementMap;
}

let applyReplaceWorkspacePath: ((filePath: string) => void) | null = null;

module.exports = Editor.Panel.define({
    template: readFileSync(join(__dirname, '../../../static/template/replace/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/replace/index.css'), 'utf-8'),
    listeners: {
        show() {
            void readCurrentJsonPath().then((filePath) => {
                if (applyReplaceWorkspacePath) applyReplaceWorkspacePath(filePath);
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
        let lastScan: any = null;
        let lastPreview: any = null;
        let lastTextureScan: any = null;
        let workspaceJsonPath = normalizeCurrentJsonPath($.jsonPath && $.jsonPath.value);
        let selectedSourcePath = '';
        let highlightedPreviewRects: any[] = [];
        let selectionCanvasRect: any = null;
        let selectionHits: any[] = [];
        let previewSelecting = false;
        let previewSelectionStart: { x: number; y: number } | null = null;
        let suppressNextPreviewClick = false;
        const rowSnapshots: { [targetUuid: string]: any } = {};
        const rowStates: { [targetUuid: string]: { content: boolean; position: boolean; assignedPath?: string } } = {};

        const setStatus = (text: string, tone = 'info') => {
            if (!$.status) return;
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
        const getRowState = (targetUuid: string) => {
            if (!rowStates[targetUuid]) rowStates[targetUuid] = { content: true, position: true };
            return rowStates[targetUuid];
        };
        const getRowFlags = (targetUuid: string) => {
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

        const fillPathFromResult = (result: any) => {
            const filePath = result && result.data && result.data.filePath || result && result.filePath || '';
            if (!filePath) return;
            if (applyReplaceWorkspacePath) {
                applyReplaceWorkspacePath(filePath);
            } else if ($.jsonPath) {
                $.jsonPath.value = filePath;
                $.jsonPath.title = filePath;
            }
            void writeCurrentJsonPath(filePath);
        };

        const renderSummary = (data: any) => {
            if (!$.summary) return;
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

        const renderMatches = (data: any) => {
            if (!$.matches) return;
            const matches = data && Array.isArray(data.matches) ? data.matches : [];
            if (matches.length === 0) {
                $.matches.innerHTML = '<div class="empty">没有可显示的匹配行</div>';
                return;
            }
            $.matches.innerHTML = matches.slice(0, 80).map((item: any, index: number) => {
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
            $.matches.querySelectorAll<HTMLButtonElement>('.match-select').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.dataset.index) || 0;
                    const best = matches[index] && matches[index].best;
                    const path = best && best.source && best.source.path || '';
                    if (path && $.figmaPath) $.figmaPath.value = path;
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
            $.matches.querySelectorAll<HTMLButtonElement>('.row-apply').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.dataset.index) || 0;
                    const item = matches[index];
                    const targetUuid = item && item.target && item.target.uuid || '';
                    const bestPath = item && item.best && item.best.source && item.best.source.path || '';
                    applyRow(targetUuid, selectedSourcePath || bestPath);
                });
            });
            $.matches.querySelectorAll<HTMLButtonElement>('.row-locate').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.dataset.index) || 0;
                    const item = matches[index];
                    const targetUuid = item && item.target && item.target.uuid || '';
                    locateRow(targetUuid);
                });
            });
            const bindRowToggle = (selector: string, field: 'content' | 'position') => {
                $.matches!.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
                    input.addEventListener('change', () => {
                        const index = Number(input.dataset.index) || 0;
                        const item = matches[index];
                        const targetUuid = item && item.target && item.target.uuid || '';
                        if (!targetUuid) return;
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
            $.matches.querySelectorAll<HTMLElement>('.match-row').forEach((row) => {
                row.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    row.classList.add('drag-over');
                    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
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
                    if (path && $.figmaPath) $.figmaPath.value = path;
                    selectedSourcePath = path || selectedSourcePath;
                    applyRow(targetUuid, path);
                });
            });
            $.matches.querySelectorAll<HTMLButtonElement>('.row-restore').forEach((button) => {
                button.addEventListener('click', () => {
                    const index = Number(button.dataset.index) || 0;
                    const item = matches[index];
                    const targetUuid = item && item.target && item.target.uuid || '';
                    restoreRow(targetUuid);
                });
            });
        };

        const renderSources = (data: any) => {
            if (!$.sources) return;
            if (!data) {
                $.sources.innerHTML = '<div class="empty">暂无源资源</div>';
                return;
            }
            const rawImages = Array.isArray(data.sourceImages) ? data.sourceImages : [];
            const rawTexts = Array.isArray(data.sourceTexts) ? data.sourceTexts : [];
            const selectionActive = !!selectionCanvasRect;
            const selectedPathSet = new Set((selectionHits || []).map((hit: any) => String(hit.path || '')).filter(Boolean));
            const hitByPath: { [path: string]: any } = {};
            for (const hit of (selectionHits || [])) {
                if (hit && hit.path) hitByPath[hit.path] = hit;
            }
            const images = selectionActive
                ? rawImages.map((item: any) => {
                    const rects = (Array.isArray(item.allRects) ? item.allRects : []).filter((rect: any) => selectedPathSet.has(String(rect.path || '')));
                    if (rects.length === 0) return null;
                    const first = hitByPath[rects[0].path] || rects[0];
                    return {
                        ...item,
                        path: first.path || item.path,
                        name: first.name || item.name,
                        width: first.width || item.width,
                        height: first.height || item.height,
                        occurrences: rects.length,
                        allRects: rects,
                    };
                }).filter(Boolean)
                : rawImages;
            const texts = selectionActive
                ? rawTexts.filter((item: any) => selectedPathSet.has(String(item.path || '')))
                : rawTexts;
            const imageHtml = images.slice(0, 96).map((item: any, index: number) => [
                `<button class="source-card image-source" draggable="true" data-kind="image" data-index="${index}" data-path="${escapeHtml(item.path || '')}">`,
                item.dataUrl ? `<img src="${item.dataUrl}" />` : '<span class="thumb-missing">无图</span>',
                `<span title="${escapeHtml(item.path || '')}">${escapeHtml(item.name || item.imageRef || 'Image')}</span>`,
                `<small>${item.occurrences || 1}x · ${Math.round(item.width || 0)}×${Math.round(item.height || 0)}</small>`,
                '</button>',
            ].join('')).join('');
            const textHtml = texts.slice(0, 96).map((item: any, index: number) => [
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
            $.sources.querySelectorAll<HTMLButtonElement>('.source-card').forEach((button) => {
                button.addEventListener('click', () => {
                    const kind = button.dataset.kind || '';
                    const index = Number(button.dataset.index) || 0;
                    const source = kind === 'image' ? images[index] : texts[index];
                    if (!source) return;
                    selectedSourcePath = source.path || '';
                    if ($.figmaPath) $.figmaPath.value = selectedSourcePath;
                    const rects = kind === 'image'
                        ? (Array.isArray(source.allRects) ? source.allRects : [])
                        : [source];
                    highlightRects(rects);
                    markSelectedSource();
                });
                button.addEventListener('dragstart', (event) => {
                    const path = button.dataset.path || '';
                    selectedSourcePath = path;
                    if ($.figmaPath) $.figmaPath.value = selectedSourcePath;
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = 'copy';
                        event.dataTransfer.setData('text/plain', path);
                    }
                    markSelectedSource();
                });
            });
        };

        const textureNeedsAttention = (item: any) => {
            return item && (item.status === 'missing' || item.status === 'figma-import');
        };

        const textureStatusLabel = (status: string) => {
            if (status === 'project') return '正式/外部';
            if (status === 'figma-import') return 'Figma目录';
            return '缺失';
        };

        const renderTextures = (data: any) => {
            if ($.textureSummary) {
                if (!data || !data.stats) {
                    $.textureSummary.textContent = '未扫描贴图';
                } else {
                    const s = data.stats;
                    $.textureSummary.textContent =
                        `唯一 ${s.unique || 0} · 正式/外部 ${s.projectFound || 0} · ` +
                        `Figma目录 ${s.figmaImportFound || 0} · 缺失 ${s.missing || 0}`;
                }
            }
            if (!$.textures) return;
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
            $.textures.innerHTML = entries.slice(0, 160).map((item: any) => {
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
            $.textures.querySelectorAll<HTMLButtonElement>('.texture-row').forEach((button) => {
                button.addEventListener('click', () => {
                    const path = button.dataset.path || '';
                    if (!path || !lastTextureScan) return;
                    selectedSourcePath = path;
                    if ($.figmaPath) $.figmaPath.value = path;
                    const entry = (lastTextureScan.entries || []).find((item: any) =>
                        item.path === path || (Array.isArray(item.allRects) && item.allRects.some((rect: any) => rect.path === path))
                    );
                    const rects = entry && Array.isArray(entry.allRects)
                        ? entry.allRects.map((rect: any) => ({
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
            if (!$.sources) return;
            $.sources.querySelectorAll<HTMLButtonElement>('.source-card').forEach((button) => {
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
            if (!$.previewOverlay || !$.previewImage || !lastPreview || !lastPreview.canvas) return;
            const cw = Number(lastPreview.canvas.width) || 1;
            const ch = Number(lastPreview.canvas.height) || 1;
            const dw = $.previewImage.clientWidth || 1;
            const dh = $.previewImage.clientHeight || 1;
            if ($.previewOverlay) {
                $.previewOverlay.style.width = `${dw}px`;
                $.previewOverlay.style.height = `${dh}px`;
            }
            const mapRect = (rect: any) => {
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
            const selectionHtml: string[] = [];
            if (selectionCanvasRect && selectionCanvasRect.width > 0 && selectionCanvasRect.height > 0) {
                const r = mapRect(selectionCanvasRect);
                const label = `x${Math.round(selectionCanvasRect.x)} y${Math.round(selectionCanvasRect.y)} ${Math.round(selectionCanvasRect.width)}×${Math.round(selectionCanvasRect.height)}`;
                selectionHtml.push(
                    `<div class="selection-rect" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px">` +
                    `<span>${escapeHtml(label)}</span></div>`
                );
            }
            $.previewOverlay.innerHTML = hitHtml.concat(selectionHtml).join('');
        };

        const highlightRects = (rects: any[]) => {
            const visibleRects = (rects || []).filter((rect) => rect && rect.width > 0 && rect.height > 0);
            highlightedPreviewRects = visibleRects;
            renderPreviewOverlay();
        };

        const selectPreviewHit = (hit: any) => {
            if (!hit || !hit.path) return;
            selectedSourcePath = hit.path;
            if ($.figmaPath) $.figmaPath.value = selectedSourcePath;
            selectionCanvasRect = null;
            selectionHits = [];
            let rects = [hit];
            if (hit.imageRef && lastPreview && Array.isArray(lastPreview.sourceImages)) {
                const grouped = lastPreview.sourceImages.find((item: any) => item && item.imageRef === hit.imageRef);
                if (grouped && Array.isArray(grouped.allRects) && grouped.allRects.length > 0) {
                    rects = grouped.allRects;
                }
            }
            highlightRects(rects);
            renderSources(lastPreview);
            markSelectedSource();
            setStatus(`已选择预览源：${hit.path}`, 'ok');
        };

        const previewPointFromMouse = (event: MouseEvent): { x: number; y: number } | null => {
            if (!$.previewImage || !lastPreview || !lastPreview.canvas) return null;
            const rect = $.previewImage.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;
            const px = event.clientX - rect.left;
            const py = event.clientY - rect.top;
            if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
            const cw = Number(lastPreview.canvas.width) || 1;
            const ch = Number(lastPreview.canvas.height) || 1;
            return {
                x: Math.max(0, Math.min(cw, px / rect.width * cw)),
                y: Math.max(0, Math.min(ch, py / rect.height * ch)),
            };
        };

        const makeCanvasRect = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(a.x - b.x),
            height: Math.abs(a.y - b.y),
        });

        const rectIntersectionArea = (a: any, b: any): number => {
            if (!a || !b) return 0;
            const left = Math.max(Number(a.x) || 0, Number(b.x) || 0);
            const top = Math.max(Number(a.y) || 0, Number(b.y) || 0);
            const right = Math.min((Number(a.x) || 0) + (Number(a.width) || 0), (Number(b.x) || 0) + (Number(b.width) || 0));
            const bottom = Math.min((Number(a.y) || 0) + (Number(a.height) || 0), (Number(b.y) || 0) + (Number(b.height) || 0));
            return Math.max(0, right - left) * Math.max(0, bottom - top);
        };

        const runSelectionHitTest = (rect: any) => {
            const hits = lastPreview && Array.isArray(lastPreview.hits) ? lastPreview.hits : [];
            const selected = hits
                .filter((hit: any) => hit && hit.width > 0 && hit.height > 0 && rectIntersectionArea(rect, hit) > 0.5)
                .sort((a: any, b: any) => {
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

        const beginPreviewSelection = (event: MouseEvent) => {
            if (event.button !== 0) return;
            const point = previewPointFromMouse(event);
            if (!point) return;
            previewSelecting = true;
            previewSelectionStart = point;
            highlightedPreviewRects = [];
            selectionCanvasRect = { x: point.x, y: point.y, width: 0, height: 0 };
            selectionHits = [];
            renderPreviewOverlay();
            event.preventDefault();
        };

        const updatePreviewSelection = (event: MouseEvent) => {
            if (!previewSelecting || !previewSelectionStart) return;
            const point = previewPointFromMouse(event);
            if (!point) return;
            selectionCanvasRect = makeCanvasRect(previewSelectionStart, point);
            renderPreviewOverlay();
            event.preventDefault();
        };

        const finishPreviewSelection = (event: MouseEvent) => {
            if (!previewSelecting || !previewSelectionStart) return;
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

        const pickPreviewHitAt = (event: MouseEvent) => {
            if (suppressNextPreviewClick) {
                suppressNextPreviewClick = false;
                return;
            }
            if (!$.previewImage || !lastPreview || !lastPreview.canvas || !Array.isArray(lastPreview.hits)) return;
            const point = previewPointFromMouse(event);
            if (!point) return;
            const cx = point.x;
            const cy = point.y;
            const containing = lastPreview.hits
                .map((hit: any, index: number) => ({ hit, index }))
                .filter(({ hit }: any) => hit &&
                    cx >= Number(hit.x) && cy >= Number(hit.y) &&
                    cx <= Number(hit.x) + Number(hit.width) &&
                    cy <= Number(hit.y) + Number(hit.height));
            if (containing.length === 0) return;
            containing.sort((a: any, b: any) => {
                const aa = Math.max(0, Number(a.hit.width) || 0) * Math.max(0, Number(a.hit.height) || 0);
                const ba = Math.max(0, Number(b.hit.width) || 0) * Math.max(0, Number(b.hit.height) || 0);
                if (Math.abs(aa - ba) > 0.01) return aa - ba;
                return b.index - a.index;
            });
            selectPreviewHit(containing[0].hit);
        };

        const scan = async () => {
            try {
                setStatus('扫描中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'scan-json-replace-candidates-beta',
                    getPath(),
                    getKind(),
                    getRootUuid()
                );
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
            } catch (error: any) {
                setStatus(`扫描异常：${error && error.message || error}`, 'error');
                return null;
            }
        };

        const loadPreview = async () => {
            try {
                setStatus('加载预览中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'load-json-preview-beta',
                    getPath(),
                    true
                );
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
            } catch (error: any) {
                setStatus(`加载预览异常：${error && error.message || error}`, 'error');
            }
        };

        const scanTextures = async () => {
            try {
                setStatus('贴图预览扫描中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'scan-json-textures-beta',
                    getPath(),
                    true,
                    false
                );
                if (!result || result.success === false || !result.data) {
                    setStatus(`贴图预览失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                lastTextureScan = result.data;
                renderTextures(lastTextureScan);
                const s = lastTextureScan.stats || {};
                const attention = (s.missing || 0) + (s.figmaImportFound || 0);
                setStatus(
                    attention > 0
                        ? `贴图预览完成：${attention} 张需要关注。`
                        : '贴图预览完成：全部唯一贴图已有正式/外部资源命中。',
                    attention > 0 ? 'warn' : 'ok'
                );
            } catch (error: any) {
                setStatus(`贴图预览异常：${error && error.message || error}`, 'error');
            }
        };

        const copyMissingTextures = async () => {
            if (!lastTextureScan) {
                setStatus('请先扫描贴图预览。', 'warn');
                return;
            }
            const entries = (lastTextureScan.entries || []).filter(textureNeedsAttention);
            const lines = entries.map((item: any) => {
                const name = item.imageName || item.name || item.imageRef || 'Image';
                const path = item.path || (item.allRects && item.allRects[0] && item.allRects[0].path) || '';
                return `${name}\t${Math.round(item.width || 0)}x${Math.round(item.height || 0)}\t${textureStatusLabel(item.status)}\t${path}`;
            });
            try {
                await navigator.clipboard.writeText(lines.join('\n'));
                setStatus(`已复制 ${lines.length} 条贴图关注清单。`, 'ok');
            } catch {
                setStatus('复制失败：当前面板无法访问剪贴板。', 'error');
            }
        };

        const importMissingTextures = async () => {
            try {
                setStatus('提前导入缺失贴图中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'import-missing-textures-beta',
                    getPath(),
                    false
                );
                if (!result || result.success === false) {
                    setStatus(`提前导入失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                const data = result.data || {};
                setStatus(`提前导入完成：${data.landed || data.imported || 0}/${data.requested || 0} 张。`, 'ok');
                await scanTextures();
            } catch (error: any) {
                setStatus(`提前导入异常：${error && error.message || error}`, 'error');
            }
        };

        const applyBatch = async (dryRun: boolean) => {
            try {
                setStatus(dryRun ? 'dry-run 中...' : '批量应用中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'apply-matched-nodes-to-selected-root-beta',
                    getPath(),
                    {
                        rootUuid: getRootUuid(),
                        kind: getKind(),
                        minScore: getMinScore(),
                        flags: getFlags(),
                        dryRun,
                    }
                );
                if (!result || result.success === false) {
                    setStatus(`${dryRun ? 'dry-run' : '批量应用'}失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                setStatus(
                    dryRun
                        ? `dry-run 完成：计划 ${result.planned || 0}，跳过 ${result.skipped || 0}`
                        : `批量应用完成：应用 ${result.applied || 0}，失败 ${result.failed || 0}，跳过 ${result.skipped || 0}`,
                    result.failed ? 'warn' : 'ok'
                );
            } catch (error: any) {
                setStatus(`批量应用异常：${error && error.message || error}`, 'error');
            }
        };

        const importFull = async () => {
            try {
                setStatus('完整导入中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'import-from-json',
                    getPath()
                );
                if (!result || result.success === false) {
                    setStatus(`完整导入失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                const data = result.data || {};
                if (data.rootUuid && $.rootUuid) $.rootUuid.value = data.rootUuid;
                setStatus(`完整导入完成：${data.rootUuid || data.rootName || 'Figma UI'}`, 'ok');
            } catch (error: any) {
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
            } catch (error: any) {
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
                if (data.rootUuid && $.rootUuid) $.rootUuid.value = data.rootUuid;
                setStatus(`已实例化 Prefab：${data.rootName || result.name || 'Prefab'}`, 'ok');
            } catch (error: any) {
                setStatus(`实例化 Prefab 异常：${error && error.message || error}`, 'error');
            }
        };

        const rerenderMatches = () => {
            if (!lastScan) return;
            renderMatches(lastScan);
            markSelectedSource();
        };

        const ensureRowSnapshot = async (targetUuid: string): Promise<any> => {
            if (rowSnapshots[targetUuid]) return rowSnapshots[targetUuid];
            setStatus('记录目标原始状态...', 'info');
            const result = await Editor.Message.request(
                'figma-importer',
                'snapshot-replace-target-beta',
                targetUuid
            );
            if (!result || result.success === false || !result.data || !result.data.snapshot) {
                setStatus(`记录目标原始状态失败：${result && result.error || 'unknown error'}`, 'error');
                return null;
            }
            rowSnapshots[targetUuid] = result.data.snapshot;
            rerenderMatches();
            return rowSnapshots[targetUuid];
        };

        const restoreSnapshot = async (targetUuid: string, save: boolean): Promise<boolean> => {
            const snapshot = rowSnapshots[targetUuid];
            if (!snapshot) return true;
            const result = await Editor.Message.request(
                'figma-importer',
                'restore-replace-target-beta',
                { snapshot, save }
            );
            if (!result || result.success === false) {
                setStatus(`还原失败：${result && result.error || 'unknown error'}`, 'error');
                return false;
            }
            return true;
        };

        const restoreRow = async (targetUuid: string) => {
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
                if (!ok) return;
                delete rowSnapshots[targetUuid];
                delete rowStates[targetUuid];
                rerenderMatches();
                setStatus(`已还原本行：${targetUuid}`, 'ok');
            } catch (error: any) {
                setStatus(`还原异常：${error && error.message || error}`, 'error');
            }
        };

        const locateRow = async (targetUuid: string) => {
            if (!targetUuid) {
                setStatus('定位失败：缺少 targetUuid。', 'error');
                return;
            }
            try {
                const result = await Editor.Message.request(
                    'figma-importer',
                    'select-replace-target-beta',
                    targetUuid
                );
                if (!result || result.success === false) {
                    setStatus(`定位失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                const data = result.data || {};
                setStatus(`已定位：${data.scenePath || data.name || targetUuid}`, 'ok');
            } catch (error: any) {
                setStatus(`定位异常：${error && error.message || error}`, 'error');
            }
        };

        const applyRow = async (targetUuid: string, figmaPath?: string) => {
            if (!targetUuid) {
                setStatus('逐行应用失败：缺少 targetUuid。', 'error');
                return;
            }
            try {
                const snapshot = await ensureRowSnapshot(targetUuid);
                if (!snapshot) return;
                const restored = await restoreSnapshot(targetUuid, false);
                if (!restored) return;
                setStatus('逐行应用中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'apply-json-node-to-target-beta',
                    getPath(),
                    targetUuid,
                    figmaPath,
                    getRowFlags(targetUuid)
                );
                if (!result || result.success === false) {
                    // Unity ResourceReplace treats each apply as a transaction:
                    // even the first failed attempt returns to the row snapshot.
                    await restoreSnapshot(targetUuid, true);
                    setStatus(`逐行应用失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                const match = result.match || {};
                if (match.figmaPath && $.figmaPath) $.figmaPath.value = match.figmaPath;
                getRowState(targetUuid).assignedPath = match.figmaPath || figmaPath || '';
                rerenderMatches();
                setStatus(`逐行应用完成：${match.figmaPath || figmaPath || targetUuid}`, 'ok');
            } catch (error: any) {
                if (rowSnapshots[targetUuid]) await restoreSnapshot(targetUuid, true);
                setStatus(`逐行应用异常：${error && error.message || error}`, 'error');
            }
        };

        const attach = async () => {
            try {
                const figmaPath = String($.figmaPath && $.figmaPath.value || '').trim() || undefined;
                setStatus('挂载子树中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'attach-matched-node-as-child-beta',
                    getPath(),
                    figmaPath,
                    { parentUuid: getRootUuid() }
                );
                if (!result || result.success === false) {
                    setStatus(`挂载失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                setStatus(`挂载完成：${result.match && result.match.figmaPath || 'matched node'}`, 'ok');
            } catch (error: any) {
                setStatus(`挂载异常：${error && error.message || error}`, 'error');
            }
        };

        const applyToSelected = async () => {
            try {
                const figmaPath = String($.figmaPath && $.figmaPath.value || '').trim() || selectedSourcePath || undefined;
                setStatus('应用到当前选中节点中...', 'info');
                const result = await Editor.Message.request(
                    'figma-importer',
                    'apply-matched-node-to-selected-beta',
                    getPath(),
                    figmaPath,
                    getFlags()
                );
                if (!result || result.success === false) {
                    setStatus(`应用到选中失败：${result && result.error || 'unknown error'}`, 'error');
                    return;
                }
                fillPathFromResult(result);
                const match = result.match || {};
                if (match.figmaPath && $.figmaPath) $.figmaPath.value = match.figmaPath;
                setStatus(`应用到选中完成：${match.figmaPath || figmaPath || 'matched node'}`, 'ok');
            } catch (error: any) {
                setStatus(`应用到选中异常：${error && error.message || error}`, 'error');
            }
        };

        applyReplaceWorkspacePath = (value: string) => {
            const filePath = normalizeCurrentJsonPath(value);
            const previousPath = workspaceJsonPath;
            workspaceJsonPath = filePath;
            if ($.jsonPath) {
                $.jsonPath.value = filePath;
                $.jsonPath.title = filePath;
            }
            if (filePath === previousPath) return;

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
            if ($.figmaPath) $.figmaPath.value = '';
            if ($.previewImage) {
                $.previewImage.onload = null;
                $.previewImage.src = '';
                $.previewImage.hidden = true;
            }
            if ($.previewMeta) $.previewMeta.textContent = '暂无预览';
            if ($.previewOverlay) $.previewOverlay.innerHTML = '';
            renderSummary(null);
            renderMatches(null);
            renderSources(null);
            renderTextures(null);
            setStatus(
                filePath ? '已继承工作台 JSON，请加载预览或扫描。' : '未选择 JSON。',
                'info',
            );
        };

        $.previewBtn && $.previewBtn.addEventListener('click', loadPreview);
        $.jsonPath && $.jsonPath.addEventListener('change', () => {
            const filePath = normalizeCurrentJsonPath($.jsonPath && $.jsonPath.value);
            if (applyReplaceWorkspacePath) applyReplaceWorkspacePath(filePath);
            void writeCurrentJsonPath(filePath);
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
        void readCurrentJsonPath().then((filePath) => {
            if (applyReplaceWorkspacePath) applyReplaceWorkspacePath(filePath);
        });
    },
    update(options?: { jsonPath?: string }) {
        if (!options || !Object.prototype.hasOwnProperty.call(options, 'jsonPath')) return;
        const filePath = normalizeCurrentJsonPath(options && options.jsonPath);
        if (applyReplaceWorkspacePath) {
            applyReplaceWorkspacePath(filePath);
        } else {
            const $ = asElementMap(this.$);
            if ($.jsonPath) {
                $.jsonPath.value = filePath;
                $.jsonPath.title = filePath;
            }
        }
        void writeCurrentJsonPath(filePath);
    },
    close() {
        applyReplaceWorkspacePath = null;
    },
});

function escapeHtml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
