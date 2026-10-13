"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.FTOC_INPUT_EDITBOX_HOST_NAME = exports.FTOC_INPUT_PLACEHOLDER_LABEL_NAME = exports.FTOC_INPUT_TEXT_LABEL_NAME = exports.FTOC_RICH_TEXT_SHADOW_NAME = exports.FTOC_RICH_TEXT_RENDERER_NAME = void 0;
exports.sanitizeCocosNodeName = sanitizeCocosNodeName;
exports.attachFigmaComponentState = attachFigmaComponentState;
exports.buildComponentStateRequest = buildComponentStateRequest;
exports.buildMappedComponentStateRequest = buildMappedComponentStateRequest;
exports.describeFigmaComponentSelection = describeFigmaComponentSelection;
exports.isMountedPrefabComponent = isMountedPrefabComponent;
exports.applyComponentState = applyComponentState;
exports.applyMappedComponentState = applyMappedComponentState;
exports.discardFailedMappedNode = discardFailedMappedNode;
exports.textAnchorXForAlign = textAnchorXForAlign;
exports.planRichTextRendererLayout = planRichTextRendererLayout;
exports.resolveLogicalTextTarget = resolveLogicalTextTarget;
exports.mountFtocRichTextRenderer = mountFtocRichTextRenderer;
exports.syncFtocRichTextRendererLayout = syncFtocRichTextRendererLayout;
exports.mountFtocRichTextShadow = mountFtocRichTextShadow;
exports.positionForAnchor = positionForAnchor;
exports.positionForTransformedAnchor = positionForTransformedAnchor;
exports.positionBeforeMountedLayout = positionBeforeMountedLayout;
exports.applyTextSizing = applyTextSizing;
exports.trackFailedSpriteLoad = trackFailedSpriteLoad;
exports.normalizeFigmaInputSpec = normalizeFigmaInputSpec;
exports.copyInputLabelStyle = copyInputLabelStyle;
exports.syncInputNativeLabelStyle = syncInputNativeLabelStyle;
exports.mountFtocInputEditBox = mountFtocInputEditBox;
exports.normalizeRichTextSegmentRuns = normalizeRichTextSegmentRuns;
exports.buildRichTextString = buildRichTextString;
exports.buildRichTextShadowString = buildRichTextShadowString;
exports.applyAuthoredLetterSpacing = applyAuthoredLetterSpacing;
exports.prepareTextPatchTarget = prepareTextPatchTarget;
exports.captureReplaceSnapshot = captureReplaceSnapshot;
exports.restoreReplaceSnapshot = restoreReplaceSnapshot;
exports.exportNodeTransform = exportNodeTransform;
exports.buildFigmaDropShadowEffect = buildFigmaDropShadowEffect;
exports.queryAssetUrlByUuid = queryAssetUrlByUuid;
exports.dbUrlToAssetPathForExport = dbUrlToAssetPathForExport;
exports.buildExportImageSearchDirs = buildExportImageSearchDirs;
exports.resolveTextStyleTemplatePath = resolveTextStyleTemplatePath;
exports.shouldCloneExactTextStyleTemplate = shouldCloneExactTextStyleTemplate;
exports.collectExactTextStyleTemplateUuids = collectExactTextStyleTemplateUuids;
exports.cloneExactTextStyleTemplateNode = cloneExactTextStyleTemplateNode;
exports.finalizeExactTextStyleTemplateNode = finalizeExactTextStyleTemplateNode;
exports.shouldFinalizeExactTextStyleTemplateNode = shouldFinalizeExactTextStyleTemplateNode;
exports.resolveRichTextFontReference = resolveRichTextFontReference;
exports.applyRichTextFont = applyRichTextFont;
exports.isFillParent = isFillParent;
/**
 * @en figma-importer scene script — the ONLY place cc.* engine APIs run.
 * @zh figma-importer 场景脚本 —— 唯一能跑 cc.* 引擎 API 的地方。
 *
 * main.ts 通过 execute-scene-script 调进这里的 methods.*。
 * 注意：引擎类必须用 require('cc') 运行时取，不能顶部 import。
 */
const fs_1 = require("fs");
const path_1 = require("path");
const types_1 = require("./types");
const component_mapping_1 = require("./component-mapping");
const layout_plan_1 = require("./layout-plan");
const slice9_1 = require("./slice9");
// 让运行时能找到编辑器内置的 cc 模块
module.paths.push((0, path_1.join)(Editor.App.path, 'node_modules'));
const SCENE_BUILD_VERSION = types_1.BUILD_VERSION;
const FIGMA_COMPONENT_STATE_CLASS = 'FigmaComponentState';
/** Keep Figma labels readable while removing separators that Cocos rejects in Node.name. */
function sanitizeCocosNodeName(value, fallback = 'Node') {
    const clean = String(value !== null && value !== void 0 ? value : '').replace(/[\\/]/g, '_').trim();
    if (clean)
        return clean;
    return String(fallback || 'Node').replace(/[\\/]/g, '_').trim() || 'Node';
}
/**
 * Legacy in-memory helper retained for old callers/tests. Import paths must
 * use buildComponentStateRequest + the editor facade queue below; adding a
 * component here is not a persistence path for Prefab instances.
 */
function attachFigmaComponentState(node, figmaNode, cc) {
    const stateData = (0, component_mapping_1.buildComponentStateData)(figmaNode && figmaNode.componentKey, figmaNode && figmaNode.name, figmaNode && figmaNode.componentProperties);
    if (!stateData.componentKey)
        return 'unavailable';
    const stateClass = cc && cc.js && typeof cc.js.getClassByName === 'function'
        ? cc.js.getClassByName(FIGMA_COMPONENT_STATE_CLASS)
        : null;
    if (!stateClass || !node || !node.getComponent || !node.addComponent)
        return 'unavailable';
    try {
        const state = node.getComponent(stateClass) || node.addComponent(stateClass);
        state.componentKey = stateData.componentKey;
        state.componentName = stateData.componentName;
        state.variantFilter = stateData.variantFilter;
        state.propertyKeys = stateData.propertyKeys.slice();
        state.propertyValues = stateData.propertyValues.slice();
        return 'attached';
    }
    catch (_a) {
        return 'unavailable';
    }
}
function buildComponentStateRequest(node, figmaNode, requiresPrefabOverride = false) {
    if (!node || !node.uuid)
        return null;
    const stateData = (0, component_mapping_1.buildComponentStateData)(figmaNode && figmaNode.componentKey, figmaNode && figmaNode.name, figmaNode && figmaNode.componentProperties);
    if (!stateData.componentKey)
        return null;
    return {
        nodeUuid: String(node.uuid),
        active: !figmaNode || figmaNode.visible !== false,
        componentKey: stateData.componentKey,
        componentName: stateData.componentName,
        variantFilter: stateData.variantFilter,
        propertyKeys: stateData.propertyKeys.slice(),
        propertyValues: stateData.propertyValues.slice(),
        requiresPrefabOverride,
    };
}
/** @deprecated Keep the old name for callers/tests while all componentKey paths use the same queue. */
function buildMappedComponentStateRequest(node, figmaNode) {
    return buildComponentStateRequest(node, figmaNode, true);
}
/** Read mapping identity only from the selected node's persisted FigmaComponentState. */
function describeFigmaComponentSelection(node, cc) {
    const base = {
        nodeUuid: String(node && node.uuid || ''),
        nodeName: String(node && node.name || ''),
        scenePath: node ? buildSceneNodePath(node) : '',
    };
    if (!node)
        return Object.assign({ status: 'not-component', reason: 'node-missing' }, base);
    const stateClass = cc && cc.js && typeof cc.js.getClassByName === 'function'
        ? cc.js.getClassByName(FIGMA_COMPONENT_STATE_CLASS)
        : null;
    if (!stateClass)
        return Object.assign({ status: 'not-component', reason: 'runtime-unavailable' }, base);
    const state = node.getComponent && node.getComponent(stateClass);
    if (!state)
        return Object.assign({ status: 'not-component', reason: 'component-state-missing' }, base);
    const identity = (0, component_mapping_1.componentIdentityFromState)(state);
    if (!identity)
        return Object.assign({ status: 'not-component', reason: 'component-key-missing' }, base);
    return Object.assign(Object.assign({ status: 'selected', reason: 'figma-component-state' }, base), identity);
}
function isMountedPrefabComponent(node, component) {
    const prefabInfo = node && node._prefab;
    const instance = prefabInfo && prefabInfo.instance;
    const fileId = String(prefabInfo && prefabInfo.fileId || '');
    if (!instance || !fileId || !Array.isArray(instance.mountedComponents))
        return false;
    return instance.mountedComponents.some((info) => {
        const localID = info && info.targetInfo && info.targetInfo.localID;
        return Array.isArray(localID)
            && localID.length === 1
            && String(localID[0]) === fileId
            && Array.isArray(info.components)
            && info.components.includes(component);
    });
}
function applyComponentState(node, request, cc) {
    try {
        const stateClass = cc && cc.js && typeof cc.js.getClassByName === 'function'
            ? cc.js.getClassByName(FIGMA_COMPONENT_STATE_CLASS)
            : null;
        const state = stateClass && node && node.getComponent ? node.getComponent(stateClass) : null;
        if (!state)
            return 'unavailable';
        state.componentKey = request.componentKey;
        state.componentName = request.componentName;
        state.variantFilter = request.variantFilter;
        state.propertyKeys = request.propertyKeys.slice();
        state.propertyValues = request.propertyValues.slice();
        return request.requiresPrefabOverride
            ? (isMountedPrefabComponent(node, state) ? 'attached' : 'override-missing')
            : 'attached';
    }
    catch (_a) {
        return 'unavailable';
    }
    finally {
        if (node)
            node.active = request.active !== false;
    }
}
/** @deprecated Compatibility alias for the original mapped-Prefab-only method. */
function applyMappedComponentState(node, request, cc) {
    return applyComponentState(node, request, cc);
}
/** Remove an incomplete mapped instance before expanding the Figma fallback tree. */
function discardFailedMappedNode(node) {
    if (!node)
        return;
    try {
        if (typeof node.removeFromParent === 'function')
            node.removeFromParent();
    }
    catch (_a) {
        // Continue to destroy even if the parent was already detached.
    }
    try {
        if (typeof node.destroy === 'function')
            node.destroy();
    }
    catch (_b) {
        // The fallback tree can still be built when best-effort disposal fails.
    }
}
/** @zh Figma 水平对齐 → Cocos Label.HorizontalAlign */
function mapHAlign(Label, align) {
    switch (String(align || '').trim().toUpperCase()) {
        case 'CENTER': return Label.HorizontalAlign.CENTER;
        case 'RIGHT': return Label.HorizontalAlign.RIGHT;
        case 'LEFT':
        default: return Label.HorizontalAlign.LEFT;
    }
}
/** @zh Figma 文字排版方向对应的 Cocos UITransform 横向锚点。 */
function textAnchorXForAlign(align) {
    switch (String(align || '').trim().toUpperCase()) {
        case 'CENTER': return 0.5;
        case 'RIGHT': return 1;
        case 'LEFT':
        default: return 0;
    }
}
exports.FTOC_RICH_TEXT_RENDERER_NAME = '__FTOC_TEXT_RENDERER__';
exports.FTOC_RICH_TEXT_SHADOW_NAME = '__FTOC_TEXT_SHADOW__';
exports.FTOC_INPUT_TEXT_LABEL_NAME = 'TEXT_LABEL';
exports.FTOC_INPUT_PLACEHOLDER_LABEL_NAME = 'PLACEHOLDER_LABEL';
exports.FTOC_INPUT_EDITBOX_HOST_NAME = '__FTOC_INPUT_EDITBOX__';
const LEGACY_FTOC_INPUT_TEXT_LABEL_NAME = '__FTOC_INPUT_TEXT__';
const LEGACY_FTOC_INPUT_PLACEHOLDER_LABEL_NAME = '__FTOC_INPUT_PLACEHOLDER__';
function textAnchorYForAlign(align) {
    switch (String(align || '').trim().toUpperCase()) {
        case 'TOP': return 1;
        case 'BOTTOM': return 0;
        case 'CENTER': return 0.5;
        // Figma's default vertical text alignment is TOP. Keep the RichText
        // wrapper in the same place as the Label path when older JSON omits it.
        default: return 1;
    }
}
/**
 * @zh RichText 自身会被 Creator 改成自然尺寸；把它放进 authored TEXT 子节点后，
 *     让渲染器的左/中/右与上/中/下参考点继续落在作者框的同一参考点上。
 */
function planRichTextRendererLayout(figmaNode, authoredWidth, authoredHeight, parentAnchorX, parentAnchorY = 0.5) {
    const width = Math.max(0, Number(authoredWidth) || 0);
    const height = Math.max(0, Number(authoredHeight) || 0);
    const anchorX = textAnchorXForAlign(figmaNode && figmaNode.textAlignHorizontal);
    const anchorY = textAnchorYForAlign(figmaNode && figmaNode.textAlignVertical);
    const parentX = Number.isFinite(parentAnchorX) ? Number(parentAnchorX) : anchorX;
    const parentY = Number.isFinite(parentAnchorY) ? Number(parentAnchorY) : 0.5;
    return {
        anchorX,
        anchorY,
        localX: (anchorX - parentX) * width,
        localY: (anchorY - parentY) * height,
        maxWidth: String(figmaNode && figmaNode.textAutoResize || '') === 'WIDTH_AND_HEIGHT' ? 0 : width,
    };
}
function isFtocRichTextRendererNode(node) {
    return !!node && node.name === exports.FTOC_RICH_TEXT_RENDERER_NAME;
}
function isFtocRichTextShadowNode(node) {
    return !!node && node.name === exports.FTOC_RICH_TEXT_SHADOW_NAME;
}
function isFtocTextHelperNode(node) {
    if (isFtocRichTextRendererNode(node) || isFtocRichTextShadowNode(node))
        return true;
    if (!node)
        return false;
    if (node.name === exports.FTOC_INPUT_EDITBOX_HOST_NAME)
        return true;
    if (!node.parent || node.parent.name !== exports.FTOC_INPUT_EDITBOX_HOST_NAME)
        return false;
    return node.name === exports.FTOC_INPUT_TEXT_LABEL_NAME ||
        node.name === exports.FTOC_INPUT_PLACEHOLDER_LABEL_NAME ||
        node.name === LEGACY_FTOC_INPUT_TEXT_LABEL_NAME ||
        node.name === LEGACY_FTOC_INPUT_PLACEHOLDER_LABEL_NAME;
}
function isCreatorRichTextRuntimeNode(node) {
    const name = String(node && node.name || '');
    return name === 'RICHTEXT_CHILD' || name === 'RICHTEXT_Image_CHILD';
}
function findFtocRichTextRendererNode(node, RichText) {
    if (!node || !RichText)
        return null;
    for (const child of (node.children || [])) {
        if (isFtocRichTextRendererNode(child) && child.getComponent && child.getComponent(RichText)) {
            return child;
        }
    }
    return null;
}
function findFtocRichTextShadowNode(node, RichText) {
    if (!node || !RichText)
        return null;
    for (const child of (node.children || [])) {
        if (isFtocRichTextShadowNode(child) && child.getComponent && child.getComponent(RichText)) {
            return child;
        }
    }
    return null;
}
/**
 * @zh 解析一个 authored 文本节点的逻辑组件。
 *     普通 Label 优先；当 Label 被 FtoC 受控转换为 disabled 且有 renderer 子节点时，
 *     renderer RichText 才是可替换/反导的唯一逻辑目标。
 */
function resolveLogicalTextTarget(node, Label, RichText) {
    if (!node || !node.getComponent)
        return null;
    const label = Label ? node.getComponent(Label) : null;
    const directRichText = RichText ? node.getComponent(RichText) : null;
    const rendererNode = findFtocRichTextRendererNode(node, RichText);
    const rendererRichText = rendererNode && rendererNode.getComponent
        ? rendererNode.getComponent(RichText)
        : null;
    if (rendererRichText && (!label || label.enabled === false || label._enabled === false)) {
        return { kind: 'richText', component: rendererRichText, authoredNode: node, rendererNode };
    }
    if (directRichText && (!label || label.enabled === false || label._enabled === false)) {
        return { kind: 'richText', component: directRichText, authoredNode: node, rendererNode: null };
    }
    if (label)
        return { kind: 'label', component: label, authoredNode: node, rendererNode: null };
    if (rendererRichText)
        return { kind: 'richText', component: rendererRichText, authoredNode: node, rendererNode };
    if (directRichText)
        return { kind: 'richText', component: directRichText, authoredNode: node, rendererNode: null };
    return null;
}
function getLogicalRichText(node, RichText) {
    const logical = resolveLogicalTextTarget(node, null, RichText);
    return logical && logical.kind === 'richText' ? logical.component : null;
}
function mountFtocRichTextRenderer(parent, figmaNode, authoredWidth, authoredHeight, cc) {
    const { Node, UITransform, RichText, Vec3 } = cc;
    const parentUi = parent && parent.getComponent ? parent.getComponent(UITransform) : null;
    const parentAnchor = readUiAnchor(parentUi);
    const plan = planRichTextRendererLayout(figmaNode, authoredWidth, authoredHeight, parentAnchor.x, parentAnchor.y);
    let renderer = findFtocRichTextRendererNode(parent, RichText);
    const created = !renderer;
    if (!renderer) {
        renderer = new Node(exports.FTOC_RICH_TEXT_RENDERER_NAME);
        renderer.active = false;
        parent.addChild(renderer);
    }
    if (typeof parent.layer === 'number')
        renderer.layer = parent.layer;
    // A prior build may have left the reusable renderer inactive while its
    // authored parent was being patched. Restore visibility on reuse; newly
    // created nodes stay inactive until the caller has finished configuring text.
    if (!created)
        renderer.active = true;
    const ui = renderer.getComponent(UITransform) || renderer.addComponent(UITransform);
    if (created) {
        ui.setContentSize(Math.max(0, Number(authoredWidth) || 0), Math.max(0, Number(authoredHeight) || 0));
    }
    ui.setAnchorPoint(plan.anchorX, plan.anchorY);
    renderer.setPosition(new Vec3(plan.localX, plan.localY, 0));
    renderer.angle = 0;
    renderer.setScale(new Vec3(1, 1, 1));
    const richText = renderer.getComponent(RichText) || renderer.addComponent(RichText);
    richText.maxWidth = plan.maxWidth;
    return { node: renderer, ui, richText, plan, created };
}
/** @zh 局部替换后只重排 renderer；父节点当前尺寸始终是 authored 几何真值。 */
function syncFtocRichTextRendererLayout(parent, figmaNode, cc) {
    const { UITransform, RichText, Vec3 } = cc;
    const renderer = findFtocRichTextRendererNode(parent, RichText);
    if (!renderer)
        return null;
    const parentUi = parent && parent.getComponent ? parent.getComponent(UITransform) : null;
    const rendererUi = renderer.getComponent ? renderer.getComponent(UITransform) : null;
    const richText = renderer.getComponent ? renderer.getComponent(RichText) : null;
    if (!parentUi || !rendererUi || !richText)
        return null;
    const size = readUiSize(parentUi);
    const anchor = readUiAnchor(parentUi);
    const plan = planRichTextRendererLayout(figmaNode, size.width, size.height, anchor.x, anchor.y);
    rendererUi.setAnchorPoint(plan.anchorX, plan.anchorY);
    renderer.setPosition(new Vec3(plan.localX, plan.localY, 0));
    richText.maxWidth = plan.maxWidth;
    return plan;
}
function removeFtocRichTextShadow(node, RichText) {
    const shadow = findFtocRichTextShadowNode(node, RichText);
    if (!shadow)
        return;
    shadow.active = false;
    if (typeof shadow.removeFromParent === 'function')
        shadow.removeFromParent();
    if (typeof shadow.destroy === 'function')
        shadow.destroy();
}
/**
 * @zh RichText 没有可序列化的阴影属性；引擎内部 RICHTEXT_CHILD 又被标记为 DontSave。
 *     因此用一个受控、可保存的 RichText sibling 承载硬阴影，并始终排在主 renderer 后面。
 *     当前业务样本 blur/radius 均为 0；非零 blur 明确记为 fallback，不冒充精确还原。
 */
function mountFtocRichTextShadow(authoredNode, figmaNode, mainRichText, cc) {
    const { Node, UITransform, RichText, Vec3, Color } = cc || {};
    const shadow = figmaNode && figmaNode.shadow;
    if (!shadow || !shadow.color) {
        removeFtocRichTextShadow(authoredNode, RichText);
        return { applied: false, blurFallback: false, node: null, richText: null, warning: '' };
    }
    const mainNode = mainRichText && mainRichText.node;
    const renderer = findFtocRichTextRendererNode(authoredNode, RichText);
    if (!Node || !UITransform || !RichText || !Vec3 || !Color || !renderer || renderer !== mainNode) {
        return {
            applied: false,
            blurFallback: Number(shadow.blur) > 0,
            node: null,
            richText: null,
            warning: `目标节点「${authoredNode && (authoredNode.name || authoredNode.uuid) || ''}」不是 FtoC authored RichText 结构，阴影未应用。`,
        };
    }
    let shadowNode = findFtocRichTextShadowNode(authoredNode, RichText);
    if (!shadowNode) {
        shadowNode = new Node(exports.FTOC_RICH_TEXT_SHADOW_NAME);
        shadowNode.active = false;
        authoredNode.addChild(shadowNode);
    }
    else {
        shadowNode.active = false;
    }
    shadowNode.layer = typeof renderer.layer === 'number' ? renderer.layer : authoredNode.layer;
    const mainUi = renderer.getComponent(UITransform);
    const mainSize = readUiSize(mainUi);
    const mainAnchor = readUiAnchor(mainUi);
    const shadowUi = shadowNode.getComponent(UITransform) || shadowNode.addComponent(UITransform);
    shadowUi.setContentSize(mainSize.width, mainSize.height);
    shadowUi.setAnchorPoint(mainAnchor.x, mainAnchor.y);
    const mainPosition = readNodePosition(renderer);
    shadowNode.setPosition(new Vec3(mainPosition.x + (Number(shadow.offsetX) || 0), mainPosition.y - (Number(shadow.offsetY) || 0), 0));
    shadowNode.angle = Number(renderer.angle) || 0;
    const mainScale = readNodeScale(renderer);
    shadowNode.setScale(new Vec3(mainScale.x, mainScale.y, 1));
    const shadowRichText = shadowNode.getComponent(RichText) || shadowNode.addComponent(RichText);
    shadowRichText.enabled = false;
    shadowRichText.string = buildRichTextShadowString(String(figmaNode.characters || ''), figmaNode);
    shadowRichText.fontSize = Number(mainRichText.fontSize) || Number(figmaNode.fontSize) || 0;
    shadowRichText.lineHeight = Number(mainRichText.lineHeight) || Number(figmaNode.lineHeight) || shadowRichText.fontSize;
    shadowRichText.horizontalAlign = mainRichText.horizontalAlign;
    shadowRichText.verticalAlign = mainRichText.verticalAlign;
    shadowRichText.maxWidth = Number(mainRichText.maxWidth) || 0;
    shadowRichText.font = mainRichText.font || null;
    shadowRichText.useSystemFont = !!mainRichText.useSystemFont;
    if (mainRichText.fontFamily)
        shadowRichText.fontFamily = mainRichText.fontFamily;
    if (typeof mainRichText.cacheMode !== 'undefined')
        shadowRichText.cacheMode = mainRichText.cacheMode;
    shadowRichText.handleTouchEvent = false;
    const color = shadow.color;
    shadowRichText.fontColor = new Color(color.r, color.g, color.b, color.a == null ? 255 : color.a);
    shadowRichText.enabled = mainRichText.enabled !== false && mainRichText._enabled !== false;
    const mainIndex = typeof renderer.getSiblingIndex === 'function'
        ? renderer.getSiblingIndex()
        : (authoredNode.children || []).indexOf(renderer);
    const shadowIndex = typeof shadowNode.getSiblingIndex === 'function'
        ? shadowNode.getSiblingIndex()
        : (authoredNode.children || []).indexOf(shadowNode);
    if (typeof shadowNode.setSiblingIndex === 'function' && mainIndex >= 0 && shadowIndex >= 0) {
        shadowNode.setSiblingIndex(shadowIndex > mainIndex ? mainIndex : Math.max(0, mainIndex - 1));
    }
    shadowNode.active = renderer.active !== false;
    return {
        applied: true,
        blurFallback: Number(shadow.blur) > 0,
        node: shadowNode,
        richText: shadowRichText,
        warning: Number(shadow.blur) > 0
            ? `目标节点「${authoredNode.name || authoredNode.uuid}」的 RichText 阴影 blur=${Number(shadow.blur)} 暂按 0 渲染。`
            : '',
    };
}
/**
 * @zh 按 UITransform 锚点计算节点位置。
 *     x/y 是 Figma 左上原点坐标，返回值是 Cocos 父节点中心原点坐标。
 */
function positionForAnchor(x, y, width, height, parentWidth, parentHeight, anchorX = 0.5, anchorY = 0.5) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    const px = Number.isFinite(anchorX) ? Math.max(0, Math.min(1, anchorX)) : 0.5;
    const py = Number.isFinite(anchorY) ? Math.max(0, Math.min(1, anchorY)) : 0.5;
    return {
        x: (Number(x) || 0) + px * w - (Number(parentWidth) || 0) / 2,
        y: (Number(parentHeight) || 0) / 2 - ((Number(y) || 0) + (1 - py) * h),
    };
}
function visualCenterOffsetFromAnchor(width, height, anchorX, anchorY, scaleX, scaleY, nodeAngle) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    const px = Number.isFinite(anchorX) ? Math.max(0, Math.min(1, anchorX)) : 0.5;
    const py = Number.isFinite(anchorY) ? Math.max(0, Math.min(1, anchorY)) : 0.5;
    const sx = Number.isFinite(scaleX) ? scaleX : 1;
    const sy = Number.isFinite(scaleY) ? scaleY : 1;
    const angleRad = (Number.isFinite(nodeAngle) ? nodeAngle : 0) * Math.PI / 180;
    const localX = (0.5 - px) * w * sx;
    const localY = (0.5 - py) * h * sy;
    return {
        x: localX * Math.cos(angleRad) - localY * Math.sin(angleRad),
        y: localX * Math.sin(angleRad) + localY * Math.cos(angleRad),
    };
}
/**
 * @zh 带缩放/旋转时，按视觉中心反推 Cocos 锚点位置。
 *     Figma x/y 表示围绕视觉中心归一化后的左上坐标；Cocos position 表示锚点位置。
 */
function positionForTransformedAnchor(x, y, width, height, parentWidth, parentHeight, anchorX = 0.5, anchorY = 0.5, scaleX = 1, scaleY = 1, figmaRotation = 0) {
    const center = positionForAnchor(x, y, width, height, parentWidth, parentHeight, 0.5, 0.5);
    const offset = visualCenterOffsetFromAnchor(width, height, anchorX, anchorY, scaleX, scaleY, -figmaRotation);
    return { x: center.x - offset.x, y: center.y - offset.y };
}
/**
 * cc.Layout owns the main axis, but HORIZONTAL/VERTICAL layouts preserve the
 * existing cross-axis coordinate. Seed only that coordinate from Figma before
 * Layout runs so MIN/CENTER/MAX alignment remains visually exact.
 */
function positionBeforeMountedLayout(position, layoutMode) {
    switch (String(layoutMode || '').toUpperCase()) {
        case 'HORIZONTAL': return { x: 0, y: position.y };
        case 'VERTICAL': return { x: position.x, y: 0 };
        case 'GRID': return { x: 0, y: 0 };
        default: return { x: position.x, y: position.y };
    }
}
/** @zh Figma 垂直对齐 → Cocos Label.VerticalAlign */
function mapVAlign(Label, align) {
    switch (String(align || '').trim().toUpperCase()) {
        case 'CENTER': return Label.VerticalAlign.CENTER;
        case 'BOTTOM': return Label.VerticalAlign.BOTTOM;
        case 'TOP':
        default: return Label.VerticalAlign.TOP;
    }
}
/**
 * @en Figma textAutoResize → Cocos Label overflow/wrap.
 * @zh Figma textAutoResize → Cocos Label 溢出/换行。对齐 Unity TMP：Auto-Width 不换行，超出 Figma 框时收进框内。
 *   WIDTH_AND_HEIGHT（Auto-Width）                    → 不换行 + SHRINK（保留 Figma 框，避免真实字体变宽后压邻居）
 *   TRUNCATE                                      → 换行 + CLAMP（截断）
 *   HEIGHT（Auto-Height：宽固定、高随文字）          → 换行 + RESIZE_HEIGHT（锁 Figma 框宽按宽换行、高自适应）
 *   NONE / 空                                     → 换行 + CLAMP（锁定 Figma 宽高，超出框时裁切）
 *
 * 语义陷阱（勿再踩）：cc.Label.Overflow.NONE ≠ Unity TextOverflowModes.Overflow。
 * cc 的 NONE 会无视 UITransform 宽度、按自然排版尺寸改写节点；它不是 Figma 的固定文本框。
 * 固定框必须使用 CLAMP 才能在最终文字布局后保留设计稿宽高。Auto-Height 则使用 RESIZE_HEIGHT。
 */
function applyTextSizing(Label, label, node) {
    switch (node.textAutoResize) {
        case 'WIDTH_AND_HEIGHT':
            label.enableWrapText = false;
            label.overflow = Label.Overflow.SHRINK;
            break;
        case 'TRUNCATE':
            label.enableWrapText = true;
            label.overflow = Label.Overflow.CLAMP;
            break;
        case 'HEIGHT':
            label.enableWrapText = true;
            label.overflow = Label.Overflow.RESIZE_HEIGHT;
            break;
        case 'NONE':
        default:
            label.enableWrapText = true;
            label.overflow = Label.Overflow.CLAMP;
            break;
    }
}
/** @zh Figma fontWeight/style → Cocos Label 的粗体/斜体开关。 */
function applyFontStyle(label, node) {
    const weight = String(node.fontWeight || '');
    const realWeightFont = !!node.fontUuid && node.fontWeightMatched === true;
    label.isBold = !realWeightFont && wantsBold(weight);
    label.isItalic = /italic|oblique/i.test(weight);
}
/** @zh Figma textDecoration → Cocos Label 支持的下划线；删除线 Cocos Label 无内置，暂跳过。 */
function applyTextDecoration(label, node) {
    const decoration = String(node.textDecoration || '').toUpperCase();
    label.isUnderline = decoration === 'UNDERLINE';
}
function applyRichTextDecoration(text, node, strokeColorOverride) {
    const stroke = node && node.stroke;
    if (stroke && stroke.color) {
        // Cocos RichText parses this tag into outlined child Labels, so mixed
        // colors keep the same Figma stroke without a second render path.
        const width = Math.max(1, Math.round(Number(stroke.width) || 1));
        text = `<outline color=#${colorToHex(strokeColorOverride || stroke.color)} width=${width}>${text}</outline>`;
    }
    const decoration = String(node.textDecoration || '').toUpperCase();
    if (decoration === 'UNDERLINE')
        return `<u>${text}</u>`;
    return text;
}
/** @zh Figma 字重是否需要 Cocos 合成粗体。真实 Bold 字体命中时不要再合成，避免双重加粗。 */
function wantsBold(weight) {
    return /bold|black|heavy|extrabold|extra\s*bold|semibold|semi\s*bold|demibold|demi\s*bold|[6-9]00/i.test(weight);
}
/** @zh Figma SLICE9 → Cocos SpriteFrame inset。 */
function readSlice9Border(node) {
    if (String(node.componentType || '').toUpperCase() !== 'SLICE9')
        return null;
    const b = node.slice9Border;
    if (!b)
        return null;
    const border = {
        left: Math.max(0, Number(b.left) || 0),
        right: Math.max(0, Number(b.right) || 0),
        top: Math.max(0, Number(b.top) || 0),
        bottom: Math.max(0, Number(b.bottom) || 0),
    };
    return border.left || border.right || border.top || border.bottom ? border : null;
}
function applySlice9Border(spriteFrame, border, Rect, Size, Vec2) {
    // Border is persisted in the imported image meta by main.ts. Keep the
    // asset-backed SpriteFrame reference here; runtime clones are not serialized
    // by Cocos and turn into null after save/reload.
    const frame = spriteFrame;
    if (!frame)
        return frame;
    const raw = readSpriteFrameRect(frame);
    const width = raw && raw.width > 0 ? raw.width : 0;
    const height = raw && raw.height > 0 ? raw.height : 0;
    const clamped = (0, slice9_1.clampSlice9Border)(border, width, height);
    frame.insetLeft = clamped.left;
    frame.insetRight = clamped.right;
    frame.insetTop = clamped.top;
    frame.insetBottom = clamped.bottom;
    return frame;
}
/**
 * @zh Figma IMAGE fill 语义：
 *   Figma 的 FILL 是 preserve-aspect cover，不是强行拉伸；Cocos Sprite 没有 ImagePaint 采样矩阵，
 *   因此对普通 IMAGE fill 先在 SpriteFrame 上做中心 cover 裁切，再由 UITransform 拉到目标框。
 *   节点级整图（source=NODE）通常是 Figma 已烘焙结果，不再二次裁切；SLICE9 也不走这里。
 *   cropRect / imageTransform 若由新版 Figma 插件提供，则优先按 Figma 的精确采样范围裁切。
 */
function adaptImageFillSpriteFrame(spriteFrame, meta, targetW, targetH, Rect, Size, Vec2) {
    if (!meta || String(meta.source || '').toUpperCase() !== 'FILL')
        return { frame: spriteFrame, cropped: false };
    const mode = String(meta.scaleMode || 'FILL').toUpperCase();
    if (mode === 'TILE' || !Rect || !Size || !Vec2 || targetW <= 0 || targetH <= 0)
        return { frame: spriteFrame, cropped: false };
    const raw = readSpriteFrameRect(spriteFrame);
    if (!raw || raw.width <= 0 || raw.height <= 0)
        return { frame: spriteFrame, cropped: false };
    const hasExplicitCrop = !!(meta.cropRect || meta.imageTransform);
    const crop = readCropRect(meta.cropRect, raw) || readImageTransformCropRect(meta.imageTransform, raw);
    let rect = crop;
    if (!rect && (mode === 'FILL' || mode === 'CROP')) {
        if (meta.skipCoverCrop)
            return { frame: spriteFrame, cropped: false };
        const metaAspect = Number(meta.rawWidth) > 0 && Number(meta.rawHeight) > 0
            ? Number(meta.rawWidth) / Number(meta.rawHeight)
            : 0;
        const targetAspect = targetW / targetH;
        if (!hasExplicitCrop && metaAspect > 0 && Math.abs(metaAspect - targetAspect) < 0.002) {
            return { frame: spriteFrame, cropped: false };
        }
        rect = calcCoverCropRect(raw, targetAspect);
    }
    if (!rect)
        return { frame: spriteFrame, cropped: false };
    if (Math.abs(rect.x - raw.x) < 0.01 && Math.abs(rect.y - raw.y) < 0.01 &&
        Math.abs(rect.width - raw.width) < 0.01 && Math.abs(rect.height - raw.height) < 0.01) {
        return { frame: spriteFrame, cropped: false };
    }
    const frame = spriteFrame && typeof spriteFrame.clone === 'function' ? spriteFrame.clone() : spriteFrame;
    if (frame && typeof frame.reset === 'function' && frame.texture) {
        frame.reset({
            texture: frame.texture,
            rect: new Rect(rect.x, rect.y, rect.width, rect.height),
            originalSize: new Size(rect.width, rect.height),
            offset: new Vec2(0, 0),
            isRotate: false,
        }, true);
        return { frame, cropped: true };
    }
    return { frame: spriteFrame, cropped: false };
}
function readSpriteFrameRect(spriteFrame) {
    if (!spriteFrame)
        return null;
    const rect = spriteFrame.rect || spriteFrame._rect;
    const width = rect && Number(rect.width) || spriteFrame.originalSize && Number(spriteFrame.originalSize.width) ||
        spriteFrame.texture && Number(spriteFrame.texture.width) || 0;
    const height = rect && Number(rect.height) || spriteFrame.originalSize && Number(spriteFrame.originalSize.height) ||
        spriteFrame.texture && Number(spriteFrame.texture.height) || 0;
    return {
        x: rect && Number(rect.x) || 0,
        y: rect && Number(rect.y) || 0,
        width,
        height,
    };
}
function readCropRect(cropRect, raw) {
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
    const px = normalized ? raw.x + x * raw.width : raw.x + x;
    const py = normalized ? raw.y + y * raw.height : raw.y + y;
    const pw = normalized ? w * raw.width : w;
    const ph = normalized ? h * raw.height : h;
    return clampRectToRaw({ x: px, y: py, width: pw, height: ph }, raw);
}
function readImageTransformCropRect(imageTransform, raw) {
    const m = readTransform2x3(imageTransform);
    if (!m)
        return null;
    const pts = [
        transformPoint2x3(m, 0, 0),
        transformPoint2x3(m, 1, 0),
        transformPoint2x3(m, 0, 1),
        transformPoint2x3(m, 1, 1),
    ];
    let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
        minX = Math.min(minX, pts[i].x);
        maxX = Math.max(maxX, pts[i].x);
        minY = Math.min(minY, pts[i].y);
        maxY = Math.max(maxY, pts[i].y);
    }
    return readCropRect({
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        unit: 'NORMALIZED',
    }, raw);
}
function readTransform2x3(value) {
    if (!Array.isArray(value) || !Array.isArray(value[0]) || !Array.isArray(value[1]))
        return null;
    const m = [
        [Number(value[0][0]), Number(value[0][1]), Number(value[0][2])],
        [Number(value[1][0]), Number(value[1][1]), Number(value[1][2])],
    ];
    for (const row of m) {
        for (const n of row) {
            if (!Number.isFinite(n))
                return null;
        }
    }
    return m;
}
function transformPoint2x3(m, x, y) {
    return {
        x: m[0][0] * x + m[0][1] * y + m[0][2],
        y: m[1][0] * x + m[1][1] * y + m[1][2],
    };
}
function calcCoverCropRect(raw, targetAspect) {
    if (!Number.isFinite(targetAspect) || targetAspect <= 0)
        return null;
    const rawAspect = raw.width / raw.height;
    if (Math.abs(rawAspect - targetAspect) < 0.002)
        return null;
    if (rawAspect > targetAspect) {
        const width = raw.height * targetAspect;
        return clampRectToRaw({
            x: raw.x + (raw.width - width) * 0.5,
            y: raw.y,
            width,
            height: raw.height,
        }, raw);
    }
    const height = raw.width / targetAspect;
    return clampRectToRaw({
        x: raw.x,
        y: raw.y + (raw.height - height) * 0.5,
        width: raw.width,
        height,
    }, raw);
}
function clampRectToRaw(rect, raw) {
    const minX = raw.x;
    const minY = raw.y;
    const maxX = raw.x + raw.width;
    const maxY = raw.y + raw.height;
    const x = Math.max(minX, Math.min(maxX, rect.x));
    const y = Math.max(minY, Math.min(maxY, rect.y));
    const right = Math.max(x, Math.min(maxX, rect.x + rect.width));
    const bottom = Math.max(y, Math.min(maxY, rect.y + rect.height));
    const width = right - x;
    const height = bottom - y;
    if (width <= 0.5 || height <= 0.5)
        return null;
    return { x, y, width, height };
}
function applyImageColor(sprite, meta, overlayTint, Color) {
    if (!Color)
        return false;
    const opacity = meta && typeof meta.opacity === 'number'
        ? Math.max(0, Math.min(1, meta.opacity))
        : 1;
    const tint = parseOverlayTint(overlayTint);
    if (!tint && opacity >= 0.999)
        return false;
    const alpha = tint && tint.hasAlpha ? tint.a : Math.round(opacity * 255);
    sprite.color = new Color(tint ? tint.r : 255, tint ? tint.g : 255, tint ? tint.b : 255, alpha);
    return !!tint;
}
function parseOverlayTint(value) {
    if (!value)
        return null;
    let hex = String(value).trim();
    if (hex.startsWith('#'))
        hex = hex.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        hex = hex.split('').map((ch) => ch + ch).join('');
    }
    else if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        hex = hex.split('').map((ch) => ch + ch).join('');
    }
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex))
        return null;
    const hasAlpha = hex.length >= 8;
    const n = parseInt(hex, 16);
    if (hasAlpha) {
        return {
            r: (n >>> 24) & 255,
            g: (n >>> 16) & 255,
            b: (n >>> 8) & 255,
            a: n & 255,
            hasAlpha,
        };
    }
    return {
        r: (n >>> 16) & 255,
        g: (n >>> 8) & 255,
        b: n & 255,
        a: 255,
        hasAlpha,
    };
}
function configureSpriteType(sprite, figmaNode, slice9Border, Sprite) {
    const mode = String(figmaNode.imageFill && figmaNode.imageFill.scaleMode || '').toUpperCase();
    if (slice9Border) {
        sprite.type = Sprite.Type.SLICED;
    }
    else if (mode === 'TILE' && Sprite.Type.TILED != null) {
        sprite.type = Sprite.Type.TILED;
    }
    else {
        sprite.type = Sprite.Type.SIMPLE;
    }
}
function applyTileScaling(sprite, meta) {
    if (!meta || String(meta.scaleMode || '').toUpperCase() !== 'TILE')
        return;
    const factor = Number(meta.tileScalingFactor);
    if (Number.isFinite(factor) && Math.abs(factor) > 0.001 && Math.abs(factor - 1) > 0.001) {
        sprite.pixelsPerUnit = sprite.pixelsPerUnit || 100;
        sprite.pixelsPerUnit = sprite.pixelsPerUnit / factor;
    }
}
function color255(Color, c) {
    return new Color(clamp255(c.r), clamp255(c.g), clamp255(c.b), clamp255(c.a));
}
function clamp255(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 255;
    return Math.max(0, Math.min(255, Math.round(n)));
}
function readUniformCornerRadius(node, w, h) {
    const maxR = Math.max(0, Math.min(w, h) * 0.5);
    const radii = Array.isArray(node.cornerRadii)
        ? node.cornerRadii.map((v) => Math.max(0, Number(v) || 0))
        : [];
    let r = Math.max(0, Number(node.cornerRadius) || 0);
    if (radii.length >= 4) {
        const [tl, tr, br, bl] = radii;
        const same = Math.abs(tl - tr) < 0.01 && Math.abs(tl - br) < 0.01 && Math.abs(tl - bl) < 0.01;
        if (same)
            r = tl;
        else {
            // Cocos Graphics has no one-call per-corner roundRect; use the smallest
            // radius rather than overstating any corner.
            r = Math.min(tl, tr, br, bl);
        }
    }
    return Math.min(r, maxR);
}
// clipsContent 节点若自身还有可视图形（图片/实心色/透明矩形），Cocos 无法像 Unity（RectMask2D
// 不占图形槽、可与 Image 同节点共存）那样把「图形」和「矩形裁剪」放同一节点：cc.Mask.GRAPHICS_RECT
// 内部要 cc.Graphics，与 cc.Sprite/cc.Graphics 抢同一渲染槽必冲突。对齐 Unity 的「视觉结果」而非
// 「节点结构」——让 frame 本身只当 Mask，把它的可视图形下沉成一个填满 frame 的背景子节点（排最前，
// 尺寸==frame 故被裁是无操作，视觉与「背景不裁」一致）。业务子节点仍在 frame 下，被同一 Mask 裁剪。
// 返回应承载可视图形（Sprite/Graphics）的宿主节点：需要下沉时是新建的背景子节点，否则就是 node 本身。
function resolveVisualHost(node, figmaNode, w, h, cc) {
    const { Node, UITransform } = cc;
    const hasVisual = !!(figmaNode.imageRef || figmaNode.solidFill ||
        (figmaNode.type === 'RECTANGLE' && !figmaNode.imageRef && !figmaNode.solidFill));
    if (!figmaNode.clipsContent || figmaNode.mask || !hasVisual)
        return node;
    const bg = new Node(`${sanitizeCocosNodeName(figmaNode.name)}_BG`);
    bg.layer = node.layer;
    const bgUi = bg.addComponent(UITransform);
    bgUi.setContentSize(w, h);
    bgUi.setAnchorPoint(0.5, 0.5);
    node.addChild(bg);
    bg.setPosition(0, 0, 0);
    // 背景子节点填满 frame，跟随裁剪矩形；排在最前（zIndex 最底），业务子节点覆盖其上。
    const widget = bg.addComponent(cc.Widget);
    widget.alignMode = cc.Widget.AlignMode.ON_WINDOW_RESIZE;
    widget.isAlignLeft = widget.isAlignRight = true;
    widget.isAlignTop = widget.isAlignBottom = true;
    widget.left = widget.right = widget.top = widget.bottom = 0;
    if (widget.updateAlignment)
        widget.updateAlignment();
    return bg;
}
function applySolidFill(node, figmaNode, w, h, Graphics, Color) {
    if (!figmaNode.solidFill || !figmaNode.solidFill.color || !Graphics || !Color || w <= 0 || h <= 0)
        return false;
    const g = node.addComponent(Graphics);
    g.clear();
    // cc.Graphics 的填充不受 cc.UIOpacity 影响（引擎只把 UIOpacity 作用到 Sprite/Label 等的顶点色），
    // 所以节点级 opacity（如 Figma 半透明黑罩 opacity=0.6）必须在这里揉进 fillColor 的 alpha，
    // 否则半透明矩形会渲染成不透明实色（曾致「已领取灰罩」变纯黑一坨）。
    const base = figmaNode.solidFill.color;
    const nodeOpacity = typeof figmaNode.opacity === 'number' ? Math.max(0, Math.min(1, figmaNode.opacity)) : 1;
    g.fillColor = color255(Color, nodeOpacity < 1
        ? { r: base.r, g: base.g, b: base.b, a: (Number(base.a) || 255) * nodeOpacity }
        : base);
    const x = -w / 2;
    const y = -h / 2;
    if (drawRoundedRect(g, figmaNode, x, y, w, h)) {
        g.fill();
    }
    else if (typeof g.fillRect === 'function') {
        g.fillRect(x, y, w, h);
    }
    else {
        g.rect(x, y, w, h);
        g.fill();
    }
    return true;
}
function applyTransparentRectangleFallback(node, figmaNode, w, h, Graphics, Color) {
    if (figmaNode.type !== 'RECTANGLE' || figmaNode.solidFill || figmaNode.imageRef || !Graphics || !Color)
        return false;
    const g = node.addComponent(Graphics);
    g.clear();
    g.fillColor = new Color(255, 255, 255, 0);
    const x = -w / 2;
    const y = -h / 2;
    if (!drawRoundedRect(g, figmaNode, x, y, w, h))
        g.rect(x, y, w, h);
    g.fill();
    return true;
}
// 节点声明了图片（imageRef）但没匹配到 SpriteFrame（未落盘/未复用成功）时的兜底：
// 给节点挂一个「空 Sprite」——sizeMode=CUSTOM、尺寸对齐设计稿，spriteFrame 留空，
// 美术在编辑器里可直接把正确的 SpriteFrame 拖进去补齐（对齐同事「挂代图」诉求）。
// 空 Sprite 本身不渲染，为了在画布上一眼看到缺图区域，再加一个 `_MissingImg` 子节点
// 用 Graphics 画半透明品红框（Graphics 与 Sprite 同节点会冲突，故必须分节点承载）。
function mountMissingImagePlaceholder(host, w, h, cc) {
    const { Node, UITransform, Sprite, Graphics, Color } = cc;
    const sprite = host.getComponent && host.getComponent(Sprite) || host.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    if (!Graphics || !Color || w <= 0 || h <= 0)
        return sprite;
    const existing = host.children && host.children.find((child) => child && child.name === '_MissingImg');
    if (existing)
        return sprite;
    const ph = new Node('_MissingImg');
    ph.layer = host.layer;
    const pui = ph.addComponent(UITransform);
    pui.setContentSize(w, h);
    pui.setAnchorPoint(0.5, 0.5);
    host.addChild(ph);
    const g = ph.addComponent(Graphics);
    g.clear();
    g.fillColor = new Color(255, 0, 255, 60);
    g.strokeColor = new Color(255, 0, 255, 200);
    g.lineWidth = 2;
    const x = -w / 2;
    const y = -h / 2;
    g.rect(x, y, w, h);
    g.fill();
    g.stroke();
    return sprite;
}
/** Convert a failed scene-side SpriteFrame load into the same retryable placeholder used by unresolved AssetDB imports. */
function trackFailedSpriteLoad(pending, placeholders, cc) {
    mountMissingImagePlaceholder(pending.host, pending.width, pending.height, cc);
    const record = {
        nodeUuid: String(pending.host && pending.host.uuid || ''),
        imgRef: pending.imgRef,
        dbUrl: '',
        spriteFrameUuid: pending.uuid,
        kind: 'sprite',
        slice9Border: pending.slice9Border,
        imageFill: pending.imageFill,
        overlayTint: pending.overlayTint,
        width: pending.width,
        height: pending.height,
    };
    placeholders.push(record);
    return record;
}
function drawRoundedRect(g, figmaNode, x, y, w, h) {
    if (w <= 0 || h <= 0)
        return false;
    const maxR = Math.max(0, Math.min(w, h) * 0.5);
    const radii = Array.isArray(figmaNode.cornerRadii)
        ? figmaNode.cornerRadii.map((v) => Math.min(maxR, Math.max(0, Number(v) || 0)))
        : [];
    if (radii.length >= 4) {
        const [tl, tr, br, bl] = radii;
        const uniform = Math.abs(tl - tr) < 0.01 && Math.abs(tl - br) < 0.01 && Math.abs(tl - bl) < 0.01;
        if (!uniform && typeof g.moveTo === 'function' && typeof g.lineTo === 'function' &&
            typeof g.quadraticCurveTo === 'function') {
            g.moveTo(x + tl, y + h);
            g.lineTo(x + w - tr, y + h);
            if (tr > 0)
                g.quadraticCurveTo(x + w, y + h, x + w, y + h - tr);
            else
                g.lineTo(x + w, y + h);
            g.lineTo(x + w, y + br);
            if (br > 0)
                g.quadraticCurveTo(x + w, y, x + w - br, y);
            else
                g.lineTo(x + w, y);
            g.lineTo(x + bl, y);
            if (bl > 0)
                g.quadraticCurveTo(x, y, x, y + bl);
            else
                g.lineTo(x, y);
            g.lineTo(x, y + h - tl);
            if (tl > 0)
                g.quadraticCurveTo(x, y + h, x + tl, y + h);
            else
                g.lineTo(x, y + h);
            if (typeof g.close === 'function')
                g.close();
            return true;
        }
    }
    const r = readUniformCornerRadius(figmaNode, w, h);
    if (r > 0.01 && typeof g.roundRect === 'function') {
        g.roundRect(x, y, w, h, r);
        return true;
    }
    return false;
}
/** @zh 节点自身是否有可见图形（图片/纯色/裸矩形）。与 resolveVisualHost 的判据一致。 */
function figmaNodeHasOwnGraphic(figmaNode) {
    if (!figmaNode)
        return false;
    return !!(figmaNode.imageRef || figmaNode.imageFill || figmaNode.solidFill ||
        (figmaNode.type === 'RECTANGLE' && !figmaNode.imageRef && !figmaNode.solidFill));
}
/** @zh 子树（含自身）里是否存在可见图形。用于识别「底图挂在子节点上」的容器按钮。
 *  注意：不按 visible 过滤——按钮常是隐藏的变体态（多色 swatch 容器默认隐藏），
 *  其美术子节点结构仍在；若因根/子隐藏而判空,隐藏按钮就永远挂不上 Button。 */
function subtreeHasVisibleGraphic(figmaNode) {
    if (!figmaNode)
        return false;
    if (figmaNode.type !== 'TEXT' && figmaNodeHasOwnGraphic(figmaNode))
        return true;
    const kids = Array.isArray(figmaNode.children) ? figmaNode.children : [];
    for (const c of kids) {
        if (subtreeHasVisibleGraphic(c))
            return true;
    }
    return false;
}
function setupButton(node, figmaNode, Button, hasVisibleGraphic) {
    if (String(figmaNode.componentType || '').toUpperCase() !== 'BUTTON')
        return false;
    if (!Button)
        return false;
    // 对齐 Unity「空 Frame/Group 起名带 btn 不绑 Button」的本意，但修正其盲区：
    // 真按钮常把底图放在子节点（如「通用按钮 > Common_btn_blue_big」），自身无图。
    // 故判据放宽为「自身有图 或 子孙有可见图形」——容器按钮能挂上，纯空壳仍拦住。
    if (!hasVisibleGraphic && !subtreeHasVisibleGraphic(figmaNode))
        return false;
    const button = node.addComponent(Button);
    button.target = node;
    button.interactable = true;
    if (Button.Transition && Button.Transition.NONE != null) {
        button.transition = Button.Transition.NONE;
    }
    return true;
}
function normalizeFigmaInputSpec(figmaNode) {
    if (String(figmaNode && figmaNode.componentType || '').toUpperCase() !== 'INPUT')
        return null;
    const raw = figmaNode && figmaNode.inputSpec;
    const textNodeId = String(raw && raw.textNodeId || '');
    if (!raw || !textNodeId)
        return null;
    const maxLengthValue = Number(raw.maxLength);
    return {
        multiline: raw.multiline === true,
        // Cocos 3.8 treats maxLength=0 as "accept no characters". The FtoX
        // contract uses -1 for an omitted counter, while older payloads used 0;
        // normalize both forms to the engine's unlimited sentinel.
        maxLength: Number.isFinite(maxLengthValue) && maxLengthValue > 0 ? Math.trunc(maxLengthValue) : -1,
        placeholder: String(raw.placeholder || ''),
        string: String(raw.string || ''),
        textRole: raw.textRole === 'string' ? 'string' : 'placeholder',
        textNodeId,
        counterNodeId: raw.counterNodeId ? String(raw.counterNodeId) : undefined,
        backgroundNodeId: raw.backgroundNodeId ? String(raw.backgroundNodeId) : undefined,
    };
}
function copyInputLabelStyle(source, target) {
    const scalarKeys = [
        'font', 'useSystemFont', 'fontFamily', 'fontSize', 'lineHeight',
        'horizontalAlign', 'verticalAlign', 'overflow', 'enableWrapText',
        'isBold', 'isItalic', 'spacingX', 'enableOutline', 'outlineWidth',
        'enableShadow', 'shadowBlur', 'cacheMode', 'customMaterial',
    ];
    for (const key of scalarKeys) {
        if (typeof source[key] !== 'undefined')
            target[key] = source[key];
    }
    for (const key of ['color', 'outlineColor', 'shadowColor', 'shadowOffset']) {
        const value = source[key];
        if (typeof value !== 'undefined')
            target[key] = value && typeof value.clone === 'function' ? value.clone() : value;
    }
}
/** Sync a native EditBox Label and keep the authored style source non-rendering. */
function syncInputNativeLabelStyle(source, target) {
    copyInputLabelStyle(source, target);
    if (source && typeof source.enabled !== 'undefined')
        source.enabled = false;
}
/**
 * Mount the persistent Cocos input component after authored children exist.
 * The authored primary TEXT remains in the imported hierarchy as the style
 * source. EditBox owns native placeholder/text Label children because Creator's
 * runtime positions and activates those labels relative to the EditBox node.
 * Background and counter children are never reparented or rewritten. EditBox
 * lives on an interaction child because Cocos 3.8 always adds a Sprite on first
 * enable, while an authored input host may already occupy its sole UIRenderer
 * slot with Graphics.
 */
function mountFtocInputEditBox(host, figmaNode, authoredTextNode, cc) {
    const spec = normalizeFigmaInputSpec(figmaNode);
    const { Node, UITransform, Sprite, Label, EditBox, Widget, Vec3 } = cc || {};
    const unavailable = (reason) => ({
        applied: false,
        reason,
        createdEditBox: false,
        createdTextLabel: false,
        editBox: null,
        authoredLabel: null,
        placeholderLabel: null,
        textLabel: null,
        textNode: null,
    });
    if (!spec)
        return unavailable('input-spec-missing');
    if (spec.textRole !== 'placeholder')
        return unavailable('unsupported-text-role');
    if (!host || !authoredTextNode || !Node || !UITransform || !Sprite || !Label || !EditBox || !Vec3) {
        return unavailable('runtime-or-authored-text-missing');
    }
    const hostUi = host.getComponent && host.getComponent(UITransform);
    if (!hostUi)
        return unavailable('host-ui-transform-missing');
    const authoredLabel = authoredTextNode.getComponent && authoredTextNode.getComponent(Label);
    if (!authoredLabel)
        return unavailable('placeholder-label-missing');
    const authoredUi = authoredTextNode.getComponent && authoredTextNode.getComponent(UITransform);
    if (!authoredUi)
        return unavailable('placeholder-ui-transform-missing');
    const authoredSize = readUiSize(authoredUi);
    const authoredAnchor = readUiAnchor(authoredUi);
    const authoredPosition = readNodePosition(authoredTextNode);
    const authoredScale = readNodeScale(authoredTextNode);
    const removeInputWidget = (target) => {
        const widget = Widget && target && target.getComponent && target.getComponent(Widget);
        if (!widget)
            return;
        widget.enabled = false;
        widget.isAlignLeft = widget.isAlignRight = false;
        widget.isAlignTop = widget.isAlignBottom = false;
        if (typeof widget.destroy === 'function')
            widget.destroy();
    };
    const editBoxHosts = (host.children || []).filter((child) => child && child.name === exports.FTOC_INPUT_EDITBOX_HOST_NAME);
    let editBoxNode = editBoxHosts.find((child) => child.getComponent && child.getComponent(EditBox)) || editBoxHosts[0] || null;
    if (!editBoxNode) {
        editBoxNode = new Node(exports.FTOC_INPUT_EDITBOX_HOST_NAME);
        editBoxNode.active = false;
        host.addChild(editBoxNode);
    }
    for (const extra of editBoxHosts) {
        if (extra === editBoxNode)
            continue;
        if (typeof extra.removeFromParent === 'function')
            extra.removeFromParent();
        if (typeof extra.destroy === 'function')
            extra.destroy();
    }
    if (typeof host.layer === 'number')
        editBoxNode.layer = host.layer;
    const editBoxUi = editBoxNode.getComponent(UITransform) || editBoxNode.addComponent(UITransform);
    // Creator owns native Label geometry and always expands it to the EditBox rect.
    // Make that rect the authored text box so engine lifecycle and FtoC have one owner.
    editBoxUi.setContentSize(authoredSize.width, authoredSize.height);
    editBoxUi.setAnchorPoint(authoredAnchor.x, authoredAnchor.y);
    editBoxNode.setPosition(new Vec3(authoredPosition.x, authoredPosition.y, 0));
    editBoxNode.angle = Number(authoredTextNode.angle) || 0;
    editBoxNode.setScale(new Vec3(authoredScale.x, authoredScale.y, 1));
    removeInputWidget(editBoxNode);
    const collectLabelHelpers = (name, legacyName) => [
        ...(editBoxNode.children || []).filter((child) => child && (child.name === name || child.name === legacyName)),
        ...(host.children || []).filter((child) => child && child.name === legacyName),
    ];
    const ensureNativeLabelNode = (name, legacyName) => {
        const helpers = collectLabelHelpers(name, legacyName);
        let labelNode = helpers.find((child) => child.parent === editBoxNode && child.name === name &&
            child.getComponent && child.getComponent(Label)) || helpers.find((child) => child.getComponent && child.getComponent(Label)) || helpers[0] || null;
        const created = !labelNode;
        if (!labelNode) {
            labelNode = new Node(name);
            labelNode.active = false;
        }
        if (labelNode.parent !== editBoxNode)
            editBoxNode.addChild(labelNode);
        labelNode.name = name;
        for (const extra of helpers) {
            if (extra === labelNode)
                continue;
            if (typeof extra.removeFromParent === 'function')
                extra.removeFromParent();
            if (typeof extra.destroy === 'function')
                extra.destroy();
        }
        if (typeof host.layer === 'number')
            labelNode.layer = host.layer;
        const labelUi = labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform);
        // Mirror Creator 3.8's native layout for an already-active EditBox. Fresh
        // components will apply the same values from EditBox.__preload().
        labelUi.setContentSize(Math.max(0, authoredSize.width - 2), authoredSize.height);
        labelUi.setAnchorPoint(0, 1);
        labelNode.setPosition(new Vec3(-authoredAnchor.x * authoredSize.width + 2, (1 - authoredAnchor.y) * authoredSize.height, 0));
        labelNode.angle = 0;
        labelNode.setScale(new Vec3(1, 1, 1));
        removeInputWidget(labelNode);
        return { node: labelNode, created };
    };
    const textHelper = ensureNativeLabelNode(exports.FTOC_INPUT_TEXT_LABEL_NAME, LEGACY_FTOC_INPUT_TEXT_LABEL_NAME);
    const textNode = textHelper.node;
    const placeholderNode = ensureNativeLabelNode(exports.FTOC_INPUT_PLACEHOLDER_LABEL_NAME, LEGACY_FTOC_INPUT_PLACEHOLDER_LABEL_NAME).node;
    const existingEditBox = editBoxNode.getComponent && editBoxNode.getComponent(EditBox);
    let editBox = existingEditBox;
    let textLabel = null;
    let placeholderLabel = null;
    if (!existingEditBox && editBoxNode.active === true)
        editBoxNode.active = false;
    try {
        textLabel = textNode.getComponent(Label) || textNode.addComponent(Label);
        placeholderLabel = placeholderNode.getComponent(Label) || placeholderNode.addComponent(Label);
        copyInputLabelStyle(authoredLabel, placeholderLabel);
        copyInputLabelStyle(authoredLabel, textLabel);
        placeholderLabel.string = spec.placeholder;
        textLabel.string = spec.string;
        // Add the engine-required renderer before EditBox's first onEnable so
        // _ensureBackgroundSprite only resolves it and never touches host Graphics.
        editBoxNode.getComponent(Sprite) || editBoxNode.addComponent(Sprite);
        editBox = editBox || editBoxNode.addComponent(EditBox);
        editBox.placeholderLabel = placeholderLabel;
        editBox.textLabel = textLabel;
        editBox.placeholder = spec.placeholder;
        editBox.maxLength = spec.maxLength;
        if (EditBox.InputMode) {
            editBox.inputMode = spec.multiline ? EditBox.InputMode.ANY : EditBox.InputMode.SINGLE_LINE;
        }
        if (EditBox.InputFlag && EditBox.InputFlag.DEFAULT != null)
            editBox.inputFlag = EditBox.InputFlag.DEFAULT;
        if (EditBox.KeyboardReturnType && EditBox.KeyboardReturnType.DEFAULT != null) {
            editBox.returnType = EditBox.KeyboardReturnType.DEFAULT;
        }
        // The string setter truncates against the current maxLength (20 by
        // default), so configure the limit before assigning initial content.
        editBox.string = spec.string;
    }
    finally {
        editBoxNode.active = true;
    }
    // Keep the authored Label as an inspectable style source, but only disable
    // it after the native EditBox and both labels mounted successfully.
    if (typeof authoredLabel.enabled !== 'undefined')
        authoredLabel.enabled = false;
    return {
        applied: true,
        reason: 'mounted',
        createdEditBox: !existingEditBox,
        createdTextLabel: textHelper.created,
        editBox,
        authoredLabel,
        placeholderLabel,
        textLabel,
        textNode,
    };
}
/** @zh Figma textCase → Cocos Label.string。 */
function applyTextCase(text, textCase) {
    switch (String(textCase || '').toUpperCase()) {
        case 'UPPER':
            return text.toLocaleUpperCase();
        case 'LOWER':
            return text.toLocaleLowerCase();
        case 'TITLE':
            return text.replace(/\S+/g, (word) => {
                if (word.length <= 1)
                    return word.toLocaleUpperCase();
                return word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();
            });
        case 'ORIGINAL':
        default:
            return text;
    }
}
function richTextEscape(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function colorToHex(c) {
    const raw = [c && c.r, c && c.g, c && c.b, c && c.a];
    const rgbIsUnitRange = raw.slice(0, 3).every((value) => {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 && n <= 1;
    });
    const alpha = Number(raw[3]);
    const alphaIsUnitRange = Number.isFinite(alpha) && alpha >= 0 && alpha <= 1;
    const rgbScale = rgbIsUnitRange ? 255 : 1;
    const alphaScale = alphaIsUnitRange ? 255 : 1;
    const r = clamp255(Number(raw[0]) * rgbScale);
    const g = clamp255(Number(raw[1]) * rgbScale);
    const b = clamp255(Number(raw[2]) * rgbScale);
    const a = clamp255((Number.isFinite(alpha) ? alpha : 255) * alphaScale);
    return [r, g, b, a].map((v) => v.toString(16).padStart(2, '0')).join('');
}
/**
 * Normalize exporter segments before producing markup. Figma normally sends a
 * complete ordered partition, but older JSON and post-processors may leave
 * gaps, overlaps, or reverse the order. Base-style runs keep every authored
 * character visible while explicit runs retain their segment appearance.
 */
function normalizeRichTextSegmentRuns(characters, node) {
    const length = String(characters || '').length;
    const raw = Array.isArray(node && node.textSegments) ? node.textSegments : [];
    const explicit = raw
        .map((segment, index) => ({
        index,
        start: Math.max(0, Math.min(length, Math.round(Number(segment && segment.start) || 0))),
        end: Math.max(0, Math.min(length, Math.round(Number(segment && segment.end) || 0))),
        fontSize: Number(segment && segment.fontSize) || 0,
        color: segment && segment.color,
    }))
        .filter((segment) => segment.end > segment.start)
        .sort((left, right) => left.start - right.start || left.index - right.index);
    const runs = [];
    let cursor = 0;
    const baseFontSize = Number(node && node.fontSize) || 0;
    for (const segment of explicit) {
        if (segment.start > cursor) {
            runs.push({ start: cursor, end: segment.start, fontSize: baseFontSize });
        }
        const start = Math.max(cursor, segment.start);
        if (segment.end > start) {
            runs.push({
                start,
                end: segment.end,
                fontSize: segment.fontSize,
                color: segment.color,
            });
            cursor = segment.end;
        }
    }
    if (cursor < length)
        runs.push({ start: cursor, end: length, fontSize: baseFontSize });
    return runs;
}
function buildRichTextMarkup(characters, node, colorOverride) {
    const segments = Array.isArray(node.textSegments) ? node.textSegments : [];
    if (segments.length <= 1) {
        let text = richTextEscape(applyTextCase(characters, node.textCase));
        if (colorOverride)
            text = `<color=#${colorToHex(colorOverride)}>${text}</color>`;
        return applyRichTextDecoration(text, node, colorOverride);
    }
    const cased = applyTextCase(characters, node.textCase);
    const parts = [];
    for (const seg of normalizeRichTextSegmentRuns(cased, node)) {
        let text = richTextEscape(cased.slice(seg.start, seg.end));
        const size = Number(seg.fontSize) || 0;
        if (size > 0 && Math.abs(size - (node.fontSize || 0)) > 0.01) {
            text = `<size=${size}>${text}</size>`;
        }
        const color = colorOverride || seg.color;
        if (color) {
            text = `<color=#${colorToHex(color)}>${text}</color>`;
        }
        parts.push(text);
    }
    return applyRichTextDecoration(parts.join(''), node, colorOverride);
}
function buildRichTextString(characters, node) {
    return buildRichTextMarkup(characters, node);
}
function buildRichTextShadowString(characters, node) {
    const shadow = node && node.shadow;
    return buildRichTextMarkup(characters, node, shadow && shadow.color);
}
function hasMixedTextSegments(node) {
    return Array.isArray(node.textSegments) && node.textSegments.length > 1;
}
function roundExportNumber(value, digits = 3) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    const p = Math.pow(10, digits);
    return Math.round(n * p) / p;
}
function componentEnabled(c) {
    return !!c && c.enabled !== false && c._enabled !== false;
}
function loadAssetAny(assetManager, uuid, tries = 1, delayMs = 100, ready) {
    return new Promise((resolve) => {
        if (!uuid) {
            resolve(null);
            return;
        }
        const attempt = (left) => {
            assetManager.loadAny({ uuid }, (err, asset) => {
                if (!err && asset && (!ready || ready(asset))) {
                    resolve(asset);
                    return;
                }
                if (left <= 0) {
                    resolve(null);
                    return;
                }
                setTimeout(() => attempt(left - 1), delayMs);
            });
        };
        attempt(Math.max(0, tries - 1));
    });
}
/**
 * @zh Cocos 可能先返回 SpriteFrame 对象，再异步把真实纹理换进来。
 *     九宫格会立即调用 checkRect；若此时仍是 2x2 临时纹理，编辑器会报
 *     "Rect width exceeds maximum margin"。必须等纹理覆盖当前 rect 后再应用 inset。
 */
function isSpriteFrameTextureReady(spriteFrame) {
    if (!spriteFrame)
        return false;
    const texture = spriteFrame.texture || spriteFrame._texture;
    const rect = spriteFrame.rect || spriteFrame._rect;
    if (!texture || !rect)
        return false;
    const textureWidth = Number(texture.width) || 0;
    const textureHeight = Number(texture.height) || 0;
    const rectX = Number(rect.x) || 0;
    const rectY = Number(rect.y) || 0;
    const rectWidth = Number(rect.width) || 0;
    const rectHeight = Number(rect.height) || 0;
    if (textureWidth <= 0 || textureHeight <= 0 || rectWidth <= 0 || rectHeight <= 0)
        return false;
    const rotated = !!(spriteFrame.rotated || spriteFrame._rotated || spriteFrame.isRotate);
    const requiredWidth = rectX + (rotated ? rectHeight : rectWidth);
    const requiredHeight = rectY + (rotated ? rectWidth : rectHeight);
    return textureWidth >= requiredWidth && textureHeight >= requiredHeight;
}
function readUiSize(ui) {
    var _a, _b;
    const content = ui && (ui.contentSize || ui._contentSize);
    return {
        width: Math.max(0, Number(ui && ((_a = ui.width) !== null && _a !== void 0 ? _a : (content && content.width))) || 0),
        height: Math.max(0, Number(ui && ((_b = ui.height) !== null && _b !== void 0 ? _b : (content && content.height))) || 0),
    };
}
function readNodePosition(node) {
    const p = node && (node.position || (node.getPosition && node.getPosition()));
    return { x: Number(p && p.x) || 0, y: Number(p && p.y) || 0 };
}
function readNodeScale(node) {
    const s = node && (node.scale || node._lscale);
    return {
        x: Number(s && s.x) || 1,
        y: Number(s && s.y) || 1,
    };
}
// 选局部替换坐标换算的基准节点。figmaNode 的 x/y 是相对「设计稿画布」左上的绝对坐标，
// 基准节点必须是 UITransform 尺寸 == 设计稿尺寸的那个祖先（导入的界面根），
// 否则用 Cocos Canvas 节点会踩坑：Canvas 常被设成适配尺寸（如 1280×720），
// 与设计稿（如 720×1280）宽高不符，导致按 Canvas 尺寸算中心点整体偏移。
function findCoordBaseForPatch(node, designW, designH, UITransform, find) {
    let cur = node;
    let lastUi = null;
    let canvasNode = null;
    let best = null;
    let bestDiff = Infinity;
    const wantSize = designW > 0 && designH > 0;
    while (cur) {
        if (cur.getComponent && cur.getComponent(UITransform)) {
            if (!lastUi)
                lastUi = cur;
            if (String(cur.name || '') === 'Canvas')
                canvasNode = cur;
            if (wantSize) {
                const s = readUiSize(cur.getComponent(UITransform));
                const diff = Math.abs(s.width - designW) + Math.abs(s.height - designH);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    best = cur;
                }
            }
        }
        cur = cur.parent;
    }
    // 找到尺寸与设计稿一致（误差≤2px）的祖先 = 界面根，作基准最准。
    if (best && bestDiff <= 2)
        return best;
    // 否则退回 Canvas（老行为），再退回最近祖先 / 全局 Canvas。
    return canvasNode || (typeof find === 'function' && find('Canvas')) || lastUi;
}
function placeAtCanvasAbsolute(node, figmaNode, canvas, Vec3, UITransform, find, anchorX = 0.5, anchorY = 0.5, scaleX = 1, scaleY = 1, figmaRotation = 0) {
    if (!node || !figmaNode || !canvas || !Vec3 || !UITransform)
        return false;
    const parent = node.parent;
    const parentUi = parent && parent.getComponent ? parent.getComponent(UITransform) : null;
    // 设计稿画布尺寸（权威值来自 payload 的 canvas 参数），用于把 figmaNode 的
    // 画布绝对坐标换算成「基准节点」局部空间的中心点。
    const designW = Number(canvas && canvas.width) || 0;
    const designH = Number(canvas && canvas.height) || 0;
    const baseNode = findCoordBaseForPatch(node, designW, designH, UITransform, find);
    const baseUi = baseNode && baseNode.getComponent ? baseNode.getComponent(UITransform) : null;
    if (!parentUi || !baseUi ||
        typeof baseUi.convertToWorldSpaceAR !== 'function' ||
        typeof parentUi.convertToNodeSpaceAR !== 'function') {
        return false;
    }
    const w = Math.max(0, Number(figmaNode.width) || 0);
    const h = Math.max(0, Number(figmaNode.height) || 0);
    // 基准尺寸优先用设计稿画布尺寸；退回基准节点自身尺寸。
    const baseSize = readUiSize(baseUi);
    const baseW = designW > 0 ? designW : (baseSize.width > 0 ? baseSize.width : w);
    const baseH = designH > 0 ? designH : (baseSize.height > 0 ? baseSize.height : h);
    // 先把 Figma 的视觉中心转换到目标父节点局部空间，再按节点自身的锚点/缩放/旋转反推 position。
    const centerInBase = positionForAnchor(Number(figmaNode.x) || 0, Number(figmaNode.y) || 0, w, h, baseW, baseH, 0.5, 0.5);
    const world = baseUi.convertToWorldSpaceAR(new Vec3(centerInBase.x, centerInBase.y, 0));
    const centerLocal = parentUi.convertToNodeSpaceAR(world);
    const offset = visualCenterOffsetFromAnchor(w, h, anchorX, anchorY, scaleX, scaleY, -figmaRotation);
    node.setPosition(new Vec3(centerLocal.x - offset.x, centerLocal.y - offset.y, 0));
    return true;
}
function applyPatchTransform(node, ui, figmaNode, canvas, Vec3, resetAnchorPivot, UITransform, find) {
    if (!node || !ui || !figmaNode || !canvas || !Vec3)
        return;
    const w = Math.max(0, Number(figmaNode.width) || 0);
    const h = Math.max(0, Number(figmaNode.height) || 0);
    const currentAnchor = readUiAnchor(ui);
    const isText = String(figmaNode.type || '').toUpperCase() === 'TEXT';
    const anchorX = resetAnchorPivot
        ? (isText ? textAnchorXForAlign(figmaNode.textAlignHorizontal) : 0.5)
        : currentAnchor.x;
    const anchorY = resetAnchorPivot ? 0.5 : currentAnchor.y;
    const scaleX = typeof figmaNode.scaleX === 'number' ? figmaNode.scaleX : 1;
    const scaleY = typeof figmaNode.scaleY === 'number' ? figmaNode.scaleY : 1;
    const figmaRotation = Number(figmaNode.rotation) || 0;
    ui.setContentSize(w, h);
    if (resetAnchorPivot && ui.setAnchorPoint)
        ui.setAnchorPoint(anchorX, anchorY);
    if (!placeAtCanvasAbsolute(node, figmaNode, canvas, Vec3, UITransform, find, anchorX, anchorY, scaleX, scaleY, figmaRotation)) {
        const canvasW = Number(canvas.width) || w;
        const canvasH = Number(canvas.height) || h;
        const pos = positionForTransformedAnchor(Number(figmaNode.x) || 0, Number(figmaNode.y) || 0, w, h, canvasW, canvasH, anchorX, anchorY, scaleX, scaleY, figmaRotation);
        node.setPosition(new Vec3(pos.x, pos.y, 0));
    }
    node.angle = -figmaRotation;
    node.setScale(new Vec3(scaleX, scaleY, 1));
}
function applyAuthoredLetterSpacing(label, figmaNode) {
    if (label && figmaNode && typeof figmaNode.letterSpacing === 'number') {
        label.spacingX = figmaNode.letterSpacing;
    }
}
function applyPatchTextCommon(label, figmaNode, Label, isRich, Color, Vec2) {
    if (!label || !figmaNode)
        return false;
    const characters = typeof figmaNode.characters === 'string' ? figmaNode.characters : '';
    label.string = isRich
        ? buildRichTextString(characters, figmaNode)
        : applyTextCase(characters, figmaNode.textCase);
    if (figmaNode.fontSize)
        label.fontSize = figmaNode.fontSize;
    label.lineHeight = figmaNode.lineHeight > 0 ? figmaNode.lineHeight : (figmaNode.fontSize || label.fontSize);
    label.horizontalAlign = mapHAlign(Label, figmaNode.textAlignHorizontal);
    label.verticalAlign = mapVAlign(Label, figmaNode.textAlignVertical);
    if (isRich) {
        label.maxWidth = String(figmaNode.textAutoResize || '') === 'WIDTH_AND_HEIGHT' ? 0 : (figmaNode.width || 0);
    }
    else {
        applyTextSizing(Label, label, figmaNode);
        applyFontStyle(label, figmaNode);
        applyTextDecoration(label, figmaNode);
        applyAuthoredLetterSpacing(label, figmaNode);
    }
    if (figmaNode.color) {
        const c = figmaNode.color;
        if (isRich)
            label.fontColor = new Color(c.r, c.g, c.b, c.a);
        else
            label.color = new Color(c.r, c.g, c.b, c.a);
    }
    if (!isRich) {
        label.enableOutline = !!figmaNode.stroke;
        if (figmaNode.stroke) {
            const st = figmaNode.stroke;
            label.outlineColor = new Color(st.color.r, st.color.g, st.color.b, st.color.a);
            label.outlineWidth = st.width || 1;
        }
        label.enableShadow = !!figmaNode.shadow;
        if (figmaNode.shadow) {
            const sh = figmaNode.shadow;
            label.shadowColor = new Color(sh.color.r, sh.color.g, sh.color.b, sh.color.a);
            label.shadowOffset = new Vec2(sh.offsetX || 0, -(sh.offsetY || 0));
            label.shadowBlur = sh.blur || 0;
        }
    }
    return true;
}
async function applyPatchFont(label, figmaNode, assetManager, Font, rich) {
    if (!label || !figmaNode || !figmaNode.fontUuid)
        return false;
    const font = await loadAssetAny(assetManager, figmaNode.fontUuid);
    if (font && (!Font || font instanceof Font)) {
        label.font = font;
        label.useSystemFont = false;
        return true;
    }
    if (!rich)
        label.isBold = wantsBold(String(figmaNode.fontWeight || ''));
    label.useSystemFont = true;
    return false;
}
function copyLabelFontBaselineToRichText(label, richText) {
    if (!label || !richText)
        return;
    if (label.font) {
        richText.font = label.font;
        richText.useSystemFont = false;
    }
    else {
        richText.useSystemFont = !!label.useSystemFont;
        if (label.fontFamily)
            richText.fontFamily = label.fontFamily;
    }
    if (label.color) {
        richText.fontColor = typeof label.color.clone === 'function' ? label.color.clone() : label.color;
    }
    if (typeof label.cacheMode !== 'undefined')
        richText.cacheMode = label.cacheMode;
}
/**
 * @zh 为 ResourceReplace 解析本次文字承载组件。混合样式命中普通 Label 时，
 *     只准备 authored 子 renderer；成功应用后才由调用者关闭 Label 并激活 renderer。
 */
function prepareTextPatchTarget(target, figmaNode, cc) {
    const { Label, RichText, UITransform } = cc || {};
    const logical = resolveLogicalTextTarget(target, Label, RichText);
    if (!logical) {
        return {
            component: null,
            isRich: false,
            rendererNode: null,
            label: null,
            createdRenderer: false,
            convertedLabel: false,
            warning: `目标节点「${target && (target.name || target.uuid) || ''}」没有 Label/RichText 组件，跳过文字。`,
        };
    }
    const wantsRichText = hasMixedTextSegments(figmaNode);
    if (!wantsRichText || logical.kind === 'richText') {
        if (logical.kind === 'richText') {
            logical.component.enabled = false;
            if (logical.rendererNode)
                logical.rendererNode.active = false;
        }
        return {
            component: logical.component,
            isRich: logical.kind === 'richText',
            rendererNode: logical.rendererNode,
            label: logical.kind === 'label' ? logical.component : null,
            createdRenderer: false,
            convertedLabel: false,
            warning: '',
        };
    }
    if (!cc || !RichText || !UITransform || !cc.Node) {
        return {
            component: null,
            isRich: false,
            rendererNode: null,
            label: logical.component,
            createdRenderer: false,
            convertedLabel: false,
            warning: `目标节点「${target.name || target.uuid}」当前运行时不支持 RichText，混合样式文字未应用。`,
        };
    }
    const ui = target.getComponent ? target.getComponent(UITransform) : null;
    if (!ui) {
        return {
            component: null,
            isRich: false,
            rendererNode: null,
            label: logical.component,
            createdRenderer: false,
            convertedLabel: false,
            warning: `目标节点「${target.name || target.uuid}」没有 UITransform，无法承载混合样式文字。`,
        };
    }
    try {
        const size = readUiSize(ui);
        const mounted = mountFtocRichTextRenderer(target, figmaNode, size.width, size.height, cc);
        mounted.node.active = false;
        mounted.richText.enabled = false;
        copyLabelFontBaselineToRichText(logical.component, mounted.richText);
        return {
            component: mounted.richText,
            isRich: true,
            rendererNode: mounted.node,
            label: logical.component,
            createdRenderer: mounted.created,
            convertedLabel: true,
            warning: '',
        };
    }
    catch (error) {
        return {
            component: null,
            isRich: false,
            rendererNode: null,
            label: logical.component,
            createdRenderer: false,
            convertedLabel: false,
            warning: `目标节点「${target.name || target.uuid}」创建 RichText renderer 失败：${error && error.message || error}`,
        };
    }
}
async function applyPatchRichTextFont(target, figmaNode, cc) {
    const { Label, Font, instantiate } = cc;
    const template = figmaNode && figmaNode.textStyleTemplate;
    const templatePath = resolveTextStyleTemplatePath(template);
    const fontRef = resolveRichTextFontReference(figmaNode, template);
    let templateRoot = null;
    let templateLabel = null;
    try {
        if (template && template.prefabUuid && templatePath && typeof instantiate === 'function') {
            try {
                const prefab = await loadAssetAny(cc.assetManager, String(template.prefabUuid));
                if (prefab) {
                    templateRoot = instantiate(prefab);
                    const templateNode = getNodeByPath(templateRoot, templatePath);
                    templateLabel = templateNode && templateNode.getComponent && Label
                        ? templateNode.getComponent(Label)
                        : null;
                }
            }
            catch (error) {
                console.warn('[figma-importer:scene] ResourceReplace 文字模板加载失败，改用 resolver 字体:', error && error.message || error);
            }
        }
        const source = await applyRichTextFont(target, templateLabel, fontRef.uuid, (uuid) => loadAssetAny(cc.assetManager, uuid), Font);
        return source !== 'missing';
    }
    finally {
        if (templateRoot && typeof templateRoot.destroy === 'function')
            templateRoot.destroy();
    }
}
async function applyPatchSprite(sprite, figmaNode, data, cc, preserveAlpha) {
    if (!sprite || !figmaNode || !data)
        return false;
    const { assetManager, Sprite, Rect, Size, Vec2, Color } = cc;
    const imgRef = figmaNode.imageRef;
    const uuid = imgRef && data.idToSpriteFrame && data.idToSpriteFrame[imgRef];
    if (!uuid)
        return false;
    const oldAlpha = sprite.color && typeof sprite.color.a === 'number' ? sprite.color.a : 255;
    const slice9Border = readSlice9Border(figmaNode);
    const spriteFrame = await loadAssetAny(assetManager, uuid, slice9Border ? 30 : 1, 100, slice9Border ? isSpriteFrameTextureReady : undefined);
    if (!spriteFrame)
        return false;
    configureSpriteType(sprite, figmaNode, slice9Border, Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    if (slice9Border) {
        sprite.spriteFrame = applySlice9Border(spriteFrame, slice9Border, Rect, Size, Vec2);
    }
    else {
        const adapted = adaptImageFillSpriteFrame(spriteFrame, figmaNode.imageFill, Number(figmaNode.width) || 0, Number(figmaNode.height) || 0, Rect, Size, Vec2);
        sprite.spriteFrame = adapted.frame;
    }
    applyImageColor(sprite, figmaNode.imageFill, figmaNode.overlayTint, Color);
    if (preserveAlpha && sprite.color) {
        sprite.color = new Color(sprite.color.r, sprite.color.g, sprite.color.b, oldAlpha);
    }
    applyTileScaling(sprite, figmaNode.imageFill);
    return true;
}
function snapshotColor(c) {
    if (!c)
        return null;
    return {
        r: clamp255(c.r),
        g: clamp255(c.g),
        b: clamp255(c.b),
        a: clamp255(c.a),
    };
}
function restoreColor(Color, c) {
    if (!Color || !c)
        return null;
    return new Color(clamp255(c.r), clamp255(c.g), clamp255(c.b), clamp255(c.a));
}
function snapshotVec2(v) {
    if (!v)
        return null;
    return {
        x: roundExportNumber(Number(v.x) || 0),
        y: roundExportNumber(Number(v.y) || 0),
    };
}
function snapshotVec3(v) {
    if (!v)
        return null;
    return {
        x: roundExportNumber(Number(v.x) || 0),
        y: roundExportNumber(Number(v.y) || 0),
        z: roundExportNumber(Number(v.z) || 0),
    };
}
function makeVec2(Vec2, v) {
    if (!Vec2 || !v)
        return null;
    return new Vec2(Number(v.x) || 0, Number(v.y) || 0);
}
function makeVec3(Vec3, v, fallbackZ = 0) {
    var _a;
    if (!Vec3 || !v)
        return null;
    return new Vec3(Number(v.x) || 0, Number(v.y) || 0, Number((_a = v.z) !== null && _a !== void 0 ? _a : fallbackZ) || 0);
}
function readUiAnchor(ui) {
    var _a, _b, _c, _d;
    if (!ui)
        return { x: 0.5, y: 0.5 };
    const anchor = ui.anchorPoint || ui._anchorPoint;
    return {
        x: Number((_b = (_a = (anchor && anchor.x)) !== null && _a !== void 0 ? _a : ui.anchorX) !== null && _b !== void 0 ? _b : ui._anchorX) || 0,
        y: Number((_d = (_c = (anchor && anchor.y)) !== null && _c !== void 0 ? _c : ui.anchorY) !== null && _d !== void 0 ? _d : ui._anchorY) || 0,
    };
}
function assetUuid(asset) {
    return String(asset && (asset.uuid || asset._uuid || asset._id) || '');
}
function snapshotSpriteFrame(frame) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!frame)
        return null;
    const rect = readSpriteFrameRect(frame);
    const originalSize = frame.originalSize || frame._originalSize;
    const offset = frame.offset || frame._offset;
    return {
        uuid: spriteFrameUuid(frame),
        name: String(frame.name || frame._name || ''),
        rect: rect ? {
            x: roundExportNumber(rect.x),
            y: roundExportNumber(rect.y),
            width: roundExportNumber(rect.width),
            height: roundExportNumber(rect.height),
        } : null,
        originalSize: originalSize ? {
            width: roundExportNumber(Number(originalSize.width) || 0),
            height: roundExportNumber(Number(originalSize.height) || 0),
        } : null,
        offset: snapshotVec2(offset),
        isRotate: !!(frame.rotated || frame.isRotated || frame._rotated),
        insetLeft: Number((_b = (_a = frame.insetLeft) !== null && _a !== void 0 ? _a : frame.borderLeft) !== null && _b !== void 0 ? _b : frame._insetLeft) || 0,
        insetRight: Number((_d = (_c = frame.insetRight) !== null && _c !== void 0 ? _c : frame.borderRight) !== null && _d !== void 0 ? _d : frame._insetRight) || 0,
        insetTop: Number((_f = (_e = frame.insetTop) !== null && _e !== void 0 ? _e : frame.borderTop) !== null && _f !== void 0 ? _f : frame._insetTop) || 0,
        insetBottom: Number((_h = (_g = frame.insetBottom) !== null && _g !== void 0 ? _g : frame.borderBottom) !== null && _h !== void 0 ? _h : frame._insetBottom) || 0,
    };
}
function rectDiffers(a, b) {
    if (!a || !b)
        return false;
    return Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) > 0.01 ||
        Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) > 0.01 ||
        Math.abs((Number(a.width) || 0) - (Number(b.width) || 0)) > 0.01 ||
        Math.abs((Number(a.height) || 0) - (Number(b.height) || 0)) > 0.01;
}
async function restoreSpriteFrameSnapshot(snapshot, cc) {
    if (!snapshot || !snapshot.uuid)
        return null;
    const { assetManager, Rect, Size, Vec2 } = cc;
    const loaded = await loadAssetAny(assetManager, snapshot.uuid);
    if (!loaded)
        return null;
    let frame = loaded;
    const targetRect = snapshot.rect;
    const loadedRect = readSpriteFrameRect(loaded);
    const needsRectRestore = targetRect && loadedRect && rectDiffers(targetRect, loadedRect);
    if (needsRectRestore && typeof loaded.clone === 'function') {
        frame = loaded.clone();
    }
    if (needsRectRestore && frame && typeof frame.reset === 'function' && frame.texture && Rect && Size && Vec2) {
        const originalSize = snapshot.originalSize || targetRect;
        frame.reset({
            texture: frame.texture,
            rect: new Rect(Number(targetRect.x) || 0, Number(targetRect.y) || 0, Number(targetRect.width) || 0, Number(targetRect.height) || 0),
            originalSize: new Size(Number(originalSize.width) || Number(targetRect.width) || 0, Number(originalSize.height) || Number(targetRect.height) || 0),
            offset: makeVec2(Vec2, snapshot.offset) || new Vec2(0, 0),
            isRotate: !!snapshot.isRotate,
        }, true);
    }
    if (frame) {
        frame.insetLeft = Number(snapshot.insetLeft) || 0;
        frame.insetRight = Number(snapshot.insetRight) || 0;
        frame.insetTop = Number(snapshot.insetTop) || 0;
        frame.insetBottom = Number(snapshot.insetBottom) || 0;
    }
    return frame;
}
function snapshotRichTextComponent(richText) {
    if (!richText)
        return null;
    return {
        enabled: richText.enabled !== false && richText._enabled !== false,
        string: String(richText.string || ''),
        fontSize: Number(richText.fontSize) || 0,
        lineHeight: Number(richText.lineHeight) || 0,
        horizontalAlign: richText.horizontalAlign,
        verticalAlign: richText.verticalAlign,
        maxWidth: Number(richText.maxWidth) || 0,
        fontUuid: assetUuid(richText.font),
        useSystemFont: !!richText.useSystemFont,
        fontFamily: String(richText.fontFamily || ''),
        cacheMode: richText.cacheMode,
        handleTouchEvent: richText.handleTouchEvent,
        color: snapshotColor(richText.fontColor || richText.color),
    };
}
function snapshotRichTextRenderer(renderer, cc) {
    if (!renderer)
        return null;
    const { UITransform, RichText } = cc;
    const ui = UITransform && renderer.getComponent ? renderer.getComponent(UITransform) : null;
    const richText = RichText && renderer.getComponent ? renderer.getComponent(RichText) : null;
    const size = readUiSize(ui);
    const position = readNodePosition(renderer);
    const scale = readNodeScale(renderer);
    return {
        active: renderer.active !== false,
        layer: typeof renderer.layer === 'number' ? renderer.layer : undefined,
        siblingIndex: typeof renderer.getSiblingIndex === 'function'
            ? renderer.getSiblingIndex()
            : renderer.parent && renderer.parent.children ? renderer.parent.children.indexOf(renderer) : -1,
        transform: {
            position: { x: roundExportNumber(position.x), y: roundExportNumber(position.y), z: 0 },
            scale: { x: roundExportNumber(scale.x), y: roundExportNumber(scale.y), z: 1 },
            angle: roundExportNumber(Number(renderer.angle) || 0),
        },
        ui: ui ? {
            width: roundExportNumber(size.width),
            height: roundExportNumber(size.height),
            anchor: readUiAnchor(ui),
        } : null,
        richText: snapshotRichTextComponent(richText),
    };
}
function captureReplaceSnapshot(node, cc) {
    const { UITransform, Label, RichText, Sprite } = cc;
    const ui = UITransform && node.getComponent ? node.getComponent(UITransform) : null;
    const label = Label && node.getComponent ? node.getComponent(Label) : null;
    const directRichText = RichText && node.getComponent ? node.getComponent(RichText) : null;
    const richTextRenderer = findFtocRichTextRendererNode(node, RichText);
    const richTextShadowRenderer = findFtocRichTextShadowNode(node, RichText);
    const sprite = Sprite && node.getComponent ? node.getComponent(Sprite) : null;
    const size = readUiSize(ui);
    const position = readNodePosition(node);
    const scale = readNodeScale(node);
    const anchor = readUiAnchor(ui);
    const frame = sprite && (sprite.spriteFrame || sprite._spriteFrame);
    return {
        version: 3,
        uuid: node.uuid,
        name: node.name || '',
        scenePath: buildSceneNodePath(node),
        active: node.active !== false,
        layer: typeof node.layer === 'number' ? node.layer : undefined,
        siblingIndex: typeof node.getSiblingIndex === 'function'
            ? node.getSiblingIndex()
            : node.parent && node.parent.children ? node.parent.children.indexOf(node) : -1,
        transform: {
            position: { x: roundExportNumber(position.x), y: roundExportNumber(position.y), z: 0 },
            scale: { x: roundExportNumber(scale.x), y: roundExportNumber(scale.y), z: 1 },
            angle: roundExportNumber(Number(node.angle) || 0),
        },
        ui: ui ? {
            width: roundExportNumber(size.width),
            height: roundExportNumber(size.height),
            anchor,
        } : null,
        sprite: sprite ? {
            enabled: sprite.enabled !== false && sprite._enabled !== false,
            type: sprite.type,
            sizeMode: sprite.sizeMode,
            trim: sprite.trim,
            color: snapshotColor(sprite.color),
            pixelsPerUnit: Number(sprite.pixelsPerUnit) || 0,
            fillType: sprite.fillType,
            fillStart: sprite.fillStart,
            fillRange: sprite.fillRange,
            spriteFrame: snapshotSpriteFrame(frame),
        } : null,
        label: label ? {
            enabled: label.enabled !== false && label._enabled !== false,
            string: String(label.string || ''),
            fontSize: Number(label.fontSize) || 0,
            lineHeight: Number(label.lineHeight) || 0,
            horizontalAlign: label.horizontalAlign,
            verticalAlign: label.verticalAlign,
            overflow: label.overflow,
            enableWrapText: label.enableWrapText,
            fontUuid: assetUuid(label.font),
            useSystemFont: !!label.useSystemFont,
            isBold: !!label.isBold,
            isItalic: !!label.isItalic,
            isUnderline: !!label.isUnderline,
            spacingX: Number(label.spacingX) || 0,
            cacheMode: label.cacheMode,
            color: snapshotColor(label.color),
            enableOutline: !!label.enableOutline,
            outlineColor: snapshotColor(label.outlineColor),
            outlineWidth: Number(label.outlineWidth) || 0,
            enableShadow: !!label.enableShadow,
            shadowColor: snapshotColor(label.shadowColor),
            shadowOffset: snapshotVec2(label.shadowOffset),
            shadowBlur: Number(label.shadowBlur) || 0,
        } : null,
        // Direct RichText and the FtoC renderer are deliberately distinct:
        // restore must be able to delete a renderer that did not exist before pairing.
        richText: snapshotRichTextComponent(directRichText),
        richTextRenderer: snapshotRichTextRenderer(richTextRenderer, cc),
        richTextShadowRenderer: snapshotRichTextRenderer(richTextShadowRenderer, cc),
    };
}
async function restoreRichTextComponent(richText, state, cc, warningPrefix) {
    const warnings = [];
    const { Font, Color } = cc;
    if (!richText || !state)
        return warnings;
    // Batch while disabled so Creator performs one layout with the final values.
    richText.enabled = false;
    richText.string = String(state.string || '');
    if (state.fontSize > 0)
        richText.fontSize = state.fontSize;
    if (state.lineHeight > 0)
        richText.lineHeight = state.lineHeight;
    if (typeof state.horizontalAlign !== 'undefined')
        richText.horizontalAlign = state.horizontalAlign;
    if (typeof state.verticalAlign !== 'undefined')
        richText.verticalAlign = state.verticalAlign;
    if (typeof state.maxWidth !== 'undefined')
        richText.maxWidth = Number(state.maxWidth) || 0;
    richText.useSystemFont = !!state.useSystemFont;
    if (typeof state.fontFamily === 'string')
        richText.fontFamily = state.fontFamily;
    if (typeof state.cacheMode !== 'undefined')
        richText.cacheMode = state.cacheMode;
    if (typeof state.handleTouchEvent !== 'undefined')
        richText.handleTouchEvent = state.handleTouchEvent;
    if (state.fontUuid) {
        const font = await loadAssetAny(cc.assetManager, state.fontUuid);
        if (font && (!Font || font instanceof Font)) {
            richText.font = font;
            richText.useSystemFont = false;
        }
        else {
            warnings.push(`${warningPrefix}字体还原失败：${state.fontUuid}`);
        }
    }
    const color = restoreColor(Color, state.color);
    if (color && typeof richText.fontColor !== 'undefined')
        richText.fontColor = color;
    richText.enabled = state.enabled !== false;
    return warnings;
}
function removeFtocRichTextRenderer(node, RichText) {
    removeFtocRichTextShadow(node, RichText);
    const renderer = findFtocRichTextRendererNode(node, RichText);
    if (!renderer)
        return;
    renderer.active = false;
    if (typeof renderer.removeFromParent === 'function')
        renderer.removeFromParent();
    if (typeof renderer.destroy === 'function')
        renderer.destroy();
}
async function restoreRichTextRenderer(node, state, cc, rendererName = exports.FTOC_RICH_TEXT_RENDERER_NAME) {
    const warnings = [];
    const { Node, UITransform, RichText, Vec3 } = cc;
    if (!state)
        return warnings;
    if (!Node || !UITransform || !RichText) {
        warnings.push(`目标节点「${node.name || node.uuid}」缺少 RichText 运行时能力，无法还原 ${rendererName}。`);
        return warnings;
    }
    let renderer = rendererName === exports.FTOC_RICH_TEXT_SHADOW_NAME
        ? findFtocRichTextShadowNode(node, RichText)
        : findFtocRichTextRendererNode(node, RichText);
    if (!renderer) {
        renderer = new Node(rendererName);
        renderer.active = false;
        node.addChild(renderer);
    }
    else {
        renderer.active = false;
    }
    if (typeof state.layer === 'number')
        renderer.layer = state.layer;
    const ui = renderer.getComponent(UITransform) || renderer.addComponent(UITransform);
    if (state.ui) {
        if (typeof ui.setContentSize === 'function') {
            ui.setContentSize(Number(state.ui.width) || 0, Number(state.ui.height) || 0);
        }
        if (typeof ui.setAnchorPoint === 'function' && state.ui.anchor) {
            ui.setAnchorPoint(Number(state.ui.anchor.x) || 0, Number(state.ui.anchor.y) || 0);
        }
    }
    if (state.transform) {
        const pos = makeVec3(Vec3, state.transform.position);
        if (pos && typeof renderer.setPosition === 'function')
            renderer.setPosition(pos);
        const scale = makeVec3(Vec3, state.transform.scale, 1);
        if (scale && typeof renderer.setScale === 'function')
            renderer.setScale(scale);
        renderer.angle = Number(state.transform.angle) || 0;
    }
    if (typeof renderer.setSiblingIndex === 'function' && Number(state.siblingIndex) >= 0) {
        renderer.setSiblingIndex(Number(state.siblingIndex));
    }
    const richText = renderer.getComponent(RichText) || renderer.addComponent(RichText);
    warnings.push(...await restoreRichTextComponent(richText, state.richText, cc, '富文本 renderer '));
    renderer.active = state.active !== false;
    return warnings;
}
async function restoreReplaceSnapshot(node, snapshot, cc) {
    const warnings = [];
    const { UITransform, Label, RichText, Sprite, Font, Vec3, Color } = cc;
    if (!node || !snapshot)
        return ['缺少目标节点或 snapshot。'];
    const hasRendererSnapshot = Number(snapshot.version) >= 2 &&
        Object.prototype.hasOwnProperty.call(snapshot, 'richTextRenderer');
    const hasShadowRendererSnapshot = Number(snapshot.version) >= 3 &&
        Object.prototype.hasOwnProperty.call(snapshot, 'richTextShadowRenderer');
    if (hasRendererSnapshot) {
        const currentRenderer = findFtocRichTextRendererNode(node, RichText);
        if (snapshot.richTextRenderer) {
            if (currentRenderer)
                currentRenderer.active = false;
        }
        else {
            // The renderer was introduced by this pairing, so clearing the row
            // must return the authored node to its original Label-only topology.
            removeFtocRichTextRenderer(node, RichText);
        }
    }
    if (hasShadowRendererSnapshot) {
        const currentShadow = findFtocRichTextShadowNode(node, RichText);
        if (snapshot.richTextShadowRenderer) {
            if (currentShadow)
                currentShadow.active = false;
        }
        else {
            removeFtocRichTextShadow(node, RichText);
        }
    }
    else if (hasRendererSnapshot) {
        // v2 snapshots predate persistent RichText shadow; any current companion
        // was introduced after that baseline and must not survive a restore.
        removeFtocRichTextShadow(node, RichText);
    }
    if (typeof snapshot.active === 'boolean')
        node.active = snapshot.active;
    if (typeof snapshot.layer === 'number')
        node.layer = snapshot.layer;
    const ui = UITransform && node.getComponent ? node.getComponent(UITransform) : null;
    if (ui && snapshot.ui) {
        if (typeof ui.setContentSize === 'function') {
            ui.setContentSize(Number(snapshot.ui.width) || 0, Number(snapshot.ui.height) || 0);
        }
        if (typeof ui.setAnchorPoint === 'function' && snapshot.ui.anchor) {
            ui.setAnchorPoint(Number(snapshot.ui.anchor.x) || 0, Number(snapshot.ui.anchor.y) || 0);
        }
    }
    if (snapshot.transform) {
        const pos = makeVec3(Vec3, snapshot.transform.position);
        if (pos && typeof node.setPosition === 'function')
            node.setPosition(pos);
        const scale = makeVec3(Vec3, snapshot.transform.scale, 1);
        if (scale && typeof node.setScale === 'function')
            node.setScale(scale);
        node.angle = Number(snapshot.transform.angle) || 0;
    }
    if (node.parent && typeof node.setSiblingIndex === 'function' && Number(snapshot.siblingIndex) >= 0) {
        node.setSiblingIndex(Number(snapshot.siblingIndex));
    }
    if (snapshot.sprite) {
        const sprite = Sprite && node.getComponent ? node.getComponent(Sprite) : null;
        if (!sprite) {
            warnings.push(`目标节点「${node.name || node.uuid}」缺少 Sprite，无法还原图片状态。`);
        }
        else {
            sprite.enabled = snapshot.sprite.enabled !== false;
            if (typeof snapshot.sprite.type !== 'undefined')
                sprite.type = snapshot.sprite.type;
            if (typeof snapshot.sprite.sizeMode !== 'undefined')
                sprite.sizeMode = snapshot.sprite.sizeMode;
            if (typeof snapshot.sprite.trim !== 'undefined')
                sprite.trim = snapshot.sprite.trim;
            if (typeof snapshot.sprite.pixelsPerUnit === 'number' && snapshot.sprite.pixelsPerUnit > 0) {
                sprite.pixelsPerUnit = snapshot.sprite.pixelsPerUnit;
            }
            if (typeof snapshot.sprite.fillType !== 'undefined')
                sprite.fillType = snapshot.sprite.fillType;
            if (typeof snapshot.sprite.fillStart !== 'undefined')
                sprite.fillStart = snapshot.sprite.fillStart;
            if (typeof snapshot.sprite.fillRange !== 'undefined')
                sprite.fillRange = snapshot.sprite.fillRange;
            const color = restoreColor(Color, snapshot.sprite.color);
            if (color)
                sprite.color = color;
            const frame = await restoreSpriteFrameSnapshot(snapshot.sprite.spriteFrame, cc);
            if (frame)
                sprite.spriteFrame = frame;
        }
    }
    if (snapshot.label) {
        const label = Label && node.getComponent ? node.getComponent(Label) : null;
        if (!label) {
            warnings.push(`目标节点「${node.name || node.uuid}」缺少 Label，无法还原文字状态。`);
        }
        else {
            label.enabled = snapshot.label.enabled !== false;
            label.string = String(snapshot.label.string || '');
            if (snapshot.label.fontSize > 0)
                label.fontSize = snapshot.label.fontSize;
            if (snapshot.label.lineHeight > 0)
                label.lineHeight = snapshot.label.lineHeight;
            if (typeof snapshot.label.horizontalAlign !== 'undefined')
                label.horizontalAlign = snapshot.label.horizontalAlign;
            if (typeof snapshot.label.verticalAlign !== 'undefined')
                label.verticalAlign = snapshot.label.verticalAlign;
            if (typeof snapshot.label.overflow !== 'undefined')
                label.overflow = snapshot.label.overflow;
            if (typeof snapshot.label.enableWrapText !== 'undefined')
                label.enableWrapText = snapshot.label.enableWrapText;
            label.useSystemFont = !!snapshot.label.useSystemFont;
            if (snapshot.label.fontUuid) {
                const font = await loadAssetAny(cc.assetManager, snapshot.label.fontUuid);
                if (font && (!Font || font instanceof Font)) {
                    label.font = font;
                    label.useSystemFont = false;
                }
                else {
                    warnings.push(`字体还原失败：${snapshot.label.fontUuid}`);
                }
            }
            label.isBold = !!snapshot.label.isBold;
            label.isItalic = !!snapshot.label.isItalic;
            label.isUnderline = !!snapshot.label.isUnderline;
            if (typeof snapshot.label.spacingX !== 'undefined')
                label.spacingX = Number(snapshot.label.spacingX) || 0;
            if (typeof snapshot.label.cacheMode !== 'undefined')
                label.cacheMode = snapshot.label.cacheMode;
            const color = restoreColor(Color, snapshot.label.color);
            if (color)
                label.color = color;
            label.enableOutline = !!snapshot.label.enableOutline;
            const outlineColor = restoreColor(Color, snapshot.label.outlineColor);
            if (outlineColor)
                label.outlineColor = outlineColor;
            label.outlineWidth = Number(snapshot.label.outlineWidth) || 0;
            label.enableShadow = !!snapshot.label.enableShadow;
            const shadowColor = restoreColor(Color, snapshot.label.shadowColor);
            if (shadowColor)
                label.shadowColor = shadowColor;
            const shadowOffset = makeVec2(cc.Vec2, snapshot.label.shadowOffset);
            if (shadowOffset)
                label.shadowOffset = shadowOffset;
            label.shadowBlur = Number(snapshot.label.shadowBlur) || 0;
        }
    }
    if (snapshot.richText) {
        const richText = hasRendererSnapshot
            ? (RichText && node.getComponent ? node.getComponent(RichText) : null)
            : getLogicalRichText(node, RichText);
        if (!richText) {
            warnings.push(`目标节点「${node.name || node.uuid}」缺少 RichText，无法还原富文本状态。`);
        }
        else {
            warnings.push(...await restoreRichTextComponent(richText, snapshot.richText, cc, '富文本 '));
        }
    }
    if (hasRendererSnapshot && snapshot.richTextRenderer) {
        warnings.push(...await restoreRichTextRenderer(node, snapshot.richTextRenderer, cc));
    }
    if (hasShadowRendererSnapshot && snapshot.richTextShadowRenderer) {
        warnings.push(...await restoreRichTextRenderer(node, snapshot.richTextShadowRenderer, cc, exports.FTOC_RICH_TEXT_SHADOW_NAME));
    }
    return warnings;
}
function exportNodeTransform(node, w, h, parentW, parentH, isRoot, ui) {
    const p = readNodePosition(node);
    const s = readNodeScale(node);
    const rotation = -((typeof node.angle === 'number' ? node.angle : 0) || 0);
    const anchor = readUiAnchor(ui || (node && (node.uiTransform || node._uiTransform)));
    // Cocos position is the anchor location. Recover the transformed visual center
    // before converting back to Figma's normalized top-left coordinate contract.
    const centerOffset = visualCenterOffsetFromAnchor(w, h, anchor.x, anchor.y, s.x, s.y, Number(node && node.angle) || 0);
    const centerX = p.x + centerOffset.x;
    const centerY = p.y + centerOffset.y;
    const x = isRoot ? 0 : centerX - w / 2 + parentW / 2;
    const y = isRoot ? 0 : parentH / 2 - centerY - h / 2;
    const r = rotation * Math.PI / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return {
        x: roundExportNumber(x),
        y: roundExportNumber(y),
        width: roundExportNumber(w),
        height: roundExportNumber(h),
        rotation: roundExportNumber(rotation),
        scaleX: roundExportNumber(s.x),
        scaleY: roundExportNumber(s.y),
        relativeTransform: [
            [roundExportNumber(s.x * cos), roundExportNumber(-s.y * sin), roundExportNumber(x)],
            [roundExportNumber(s.x * sin), roundExportNumber(s.y * cos), roundExportNumber(y)],
        ],
    };
}
function colorToFigmaPaint(c, fallback) {
    const src = c || fallback || { r: 255, g: 255, b: 255, a: 255 };
    return {
        type: 'SOLID',
        r: roundExportNumber(clamp255(src.r) / 255, 4),
        g: roundExportNumber(clamp255(src.g) / 255, 4),
        b: roundExportNumber(clamp255(src.b) / 255, 4),
        a: roundExportNumber(clamp255(src.a) / 255, 4),
        visible: true,
        blendMode: 'NORMAL',
    };
}
function buildFigmaDropShadowEffect(color, cocosOffset, blur) {
    return Object.assign(Object.assign({}, colorToFigmaPaint(color, { r: 0, g: 0, b: 0, a: 255 })), { type: 'DROP_SHADOW', visible: true, offsetX: roundExportNumber(Number(cocosOffset && cocosOffset.x) || 0), offsetY: roundExportNumber(-(Number(cocosOffset && cocosOffset.y) || 0)), radius: roundExportNumber(Number(blur) || 0), spread: 0, blendMode: 'NORMAL' });
}
function colorToOverlayTint(c) {
    if (!c)
        return '';
    const r = clamp255(c.r);
    const g = clamp255(c.g);
    const b = clamp255(c.b);
    if (r >= 254 && g >= 254 && b >= 254)
        return '';
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
}
function defaultFigmaNode(node, type, transform) {
    return Object.assign(Object.assign({ figmaId: `cocos:${node.uuid || node.name}`, name: node.name || type, type }, transform), { fills: [], strokes: [], strokeWeight: 1, strokeAlign: 'INSIDE', effects: [], blendMode: 'PASS_THROUGH', cornerRadius: 0, cornerRadii: [], opacity: 1, visible: node.active !== false, clipsContent: false, layoutMode: '', layoutWrap: 'NO_WRAP', itemSpacing: 0, counterAxisSpacing: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, primaryAxisAlignItems: '', counterAxisAlignItems: '', characters: '', fontSize: 0, fontFamily: '', fontWeight: '', textStyleName: '', textStyleId: '', fillStyleName: '', fillStyleId: '', strokeStyleName: '', strokeStyleId: '', effectStyleName: '', effectStyleId: '', textAlignHorizontal: '', textAlignVertical: '', lineHeight: 0, letterSpacing: 0, textAutoResize: '', textTruncation: '', textDecoration: '', textCase: '', imageBase64: '', imageRef: '', componentType: '', componentProperties: {}, slice9Border: null, layoutPositioning: 'AUTO', constraints: { horizontal: 'LEFT', vertical: 'TOP' }, children: [] });
}
function internExportImage(ctx, base64) {
    if (!base64)
        return '';
    const existing = ctx.imageIdByContent[base64];
    if (existing)
        return existing;
    const id = `img${ctx.imageCounter++}`;
    ctx.images[id] = base64;
    ctx.imageIdByContent[base64] = id;
    ctx.stats.images++;
    return id;
}
function safeFigmaAssetFolderName(name) {
    return (name || 'untitled').replace(/[^\w一-龥-]/g, '_');
}
async function queryAssetUrlByUuid(uuid) {
    if (!uuid)
        return '';
    const candidates = [uuid, uuid.split('@')[0]].filter((value, index, all) => value && all.indexOf(value) === index);
    for (const candidate of candidates) {
        try {
            const url = await Editor.Message.request('asset-db', 'query-asset-url', candidate);
            if (typeof url === 'string' && url)
                return url;
        }
        catch (_a) {
            // Creator may reject a SpriteFrame sub-asset UUID while accepting its image UUID.
        }
    }
    return '';
}
function dbUrlToAssetPathForExport(dbUrl, projectPath) {
    if (!dbUrl || !dbUrl.startsWith('db://assets/'))
        return '';
    const root = projectPath || (Editor.Project && Editor.Project.path);
    if (!root)
        return '';
    const clean = dbUrl.split('@')[0];
    return (0, path_1.join)(root, 'assets', clean.slice('db://assets/'.length));
}
function buildExportImageSearchDirs(projectPath, rootName, interfaceRootName) {
    const figmaRoot = (0, path_1.join)(projectPath, 'assets', 'figma');
    const names = [interfaceRootName, rootName]
        .map((name) => safeFigmaAssetFolderName(name || ''))
        .filter((name, index, all) => name && name !== 'untitled' && all.indexOf(name) === index);
    return [...names.map((name) => (0, path_1.join)(figmaRoot, name)), figmaRoot];
}
function fileUrlToPath(url) {
    if (!url || !url.startsWith('file://'))
        return '';
    try {
        return decodeURIComponent(url.replace(/^file:\/\//, ''));
    }
    catch (_a) {
        return '';
    }
}
function spriteFrameUuid(spriteFrame) {
    return String(spriteFrame && (spriteFrame.uuid ||
        spriteFrame._uuid ||
        spriteFrame._id ||
        spriteFrame._nativeAsset && spriteFrame._nativeAsset.uuid) || '');
}
function spriteFrameNativeCandidates(spriteFrame) {
    const texture = spriteFrame && (spriteFrame.texture || spriteFrame._texture);
    const image = texture && (texture.image || texture._image);
    return [
        spriteFrame && spriteFrame.nativeUrl,
        spriteFrame && spriteFrame._nativeUrl,
        texture && texture.nativeUrl,
        texture && texture._nativeUrl,
        image && image.nativeUrl,
        image && image._nativeUrl,
    ].filter((v) => typeof v === 'string' && v.length > 0);
}
function spriteFrameName(spriteFrame) {
    return String(spriteFrame && (spriteFrame.name || spriteFrame._name) || '').replace(/\.(png|jpg|jpeg)$/i, '');
}
function findFigmaImageBySpriteName(spriteFrame, ctx) {
    const name = spriteFrameName(spriteFrame);
    if (!name)
        return '';
    const candidates = [`${name}.png`, `${name}.jpg`, `${name}.jpeg`];
    for (const dir of ctx.imageSearchDirs || []) {
        for (const file of candidates) {
            const p = (0, path_1.join)(dir, file);
            if ((0, fs_1.existsSync)(p))
                return p;
        }
    }
    return '';
}
function resolveNativeUrlToAssetPath(url) {
    if (!url)
        return '';
    if (url.startsWith('db://assets/'))
        return dbUrlToAssetPathForExport(url);
    if (url.startsWith('file://'))
        return fileUrlToPath(url);
    if (url.startsWith('/'))
        return url.split('@')[0];
    const projectPath = Editor.Project && Editor.Project.path;
    if (projectPath && url.startsWith('assets/'))
        return (0, path_1.join)(projectPath, url);
    return '';
}
function spriteFrameCropRect(spriteFrame) {
    const rect = readSpriteFrameRect(spriteFrame);
    const texture = spriteFrame && (spriteFrame.texture || spriteFrame._texture);
    const rawW = texture && Number(texture.width) || rect && rect.width || 0;
    const rawH = texture && Number(texture.height) || rect && rect.height || 0;
    if (!rect || rawW <= 0 || rawH <= 0)
        return null;
    if (Math.abs(rect.x) < 0.01 && Math.abs(rect.y) < 0.01 &&
        Math.abs(rect.width - rawW) < 0.01 && Math.abs(rect.height - rawH) < 0.01) {
        return null;
    }
    return {
        x: roundExportNumber(rect.x / rawW, 6),
        y: roundExportNumber(rect.y / rawH, 6),
        w: roundExportNumber(rect.width / rawW, 6),
        h: roundExportNumber(rect.height / rawH, 6),
        unit: 'NORMALIZED',
    };
}
async function readSpriteFrameImage(spriteFrame, ctx) {
    if (!spriteFrame)
        return { imageRef: '', imageName: '' };
    let assetUrl = await queryAssetUrlByUuid(spriteFrameUuid(spriteFrame));
    let filePath = dbUrlToAssetPathForExport(assetUrl);
    if (!filePath) {
        for (const nativeUrl of spriteFrameNativeCandidates(spriteFrame)) {
            const p = resolveNativeUrlToAssetPath(nativeUrl);
            if (p) {
                filePath = p;
                assetUrl = nativeUrl;
                break;
            }
        }
    }
    if (!filePath) {
        filePath = findFigmaImageBySpriteName(spriteFrame, ctx);
        if (filePath)
            assetUrl = filePath;
    }
    if (!filePath || !(0, fs_1.existsSync)(filePath)) {
        ctx.stats.missingImages++;
        const name = spriteFrame.name || spriteFrame._name || spriteFrameUuid(spriteFrame) || '(unknown spriteFrame)';
        ctx.warnings.push(`读不到 SpriteFrame 源图：${name}`);
        return { imageRef: '', imageName: '' };
    }
    try {
        const base64 = (0, fs_1.readFileSync)(filePath).toString('base64');
        const imageRef = internExportImage(ctx, base64);
        const imageName = (0, path_1.basename)(filePath);
        const cropRect = spriteFrameCropRect(spriteFrame);
        return cropRect ? { imageRef, imageName, cropRect } : { imageRef, imageName };
    }
    catch (err) {
        ctx.stats.missingImages++;
        ctx.warnings.push(`读取图片失败：${assetUrl || filePath} (${err && err.message || err})`);
        return { imageRef: '', imageName: '' };
    }
}
function exportSpriteBorder(spriteFrame) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!spriteFrame)
        return null;
    const border = {
        left: Number((_b = (_a = spriteFrame.insetLeft) !== null && _a !== void 0 ? _a : spriteFrame.borderLeft) !== null && _b !== void 0 ? _b : spriteFrame._insetLeft) || 0,
        right: Number((_d = (_c = spriteFrame.insetRight) !== null && _c !== void 0 ? _c : spriteFrame.borderRight) !== null && _d !== void 0 ? _d : spriteFrame._insetRight) || 0,
        top: Number((_f = (_e = spriteFrame.insetTop) !== null && _e !== void 0 ? _e : spriteFrame.borderTop) !== null && _f !== void 0 ? _f : spriteFrame._insetTop) || 0,
        bottom: Number((_h = (_g = spriteFrame.insetBottom) !== null && _g !== void 0 ? _g : spriteFrame.borderBottom) !== null && _h !== void 0 ? _h : spriteFrame._insetBottom) || 0,
    };
    return border.left || border.right || border.top || border.bottom ? border : null;
}
function spriteTypeName(sprite, Sprite) {
    const t = sprite && sprite.type;
    if (Sprite && Sprite.Type) {
        if (t === Sprite.Type.SLICED)
            return 'SLICED';
        if (t === Sprite.Type.TILED)
            return 'TILED';
    }
    return '';
}
async function exportSprite(nodeData, sprite, ctx) {
    const Sprite = ctx.cc.Sprite;
    const spriteFrame = sprite.spriteFrame;
    const type = spriteTypeName(sprite, Sprite);
    const border = exportSpriteBorder(spriteFrame);
    if (type === 'SLICED' || border) {
        nodeData.componentType = 'SLICE9';
        nodeData.slice9Border = border || { left: 0, right: 0, top: 0, bottom: 0 };
        ctx.stats.slicedSprites++;
    }
    ctx.stats.sprites++;
    const image = await readSpriteFrameImage(spriteFrame, ctx);
    if (!image.imageRef)
        return;
    const fill = {
        type: 'IMAGE',
        r: 0,
        g: 0,
        b: 0,
        a: roundExportNumber(clamp255(sprite.color && sprite.color.a) / 255, 4),
        visible: true,
        blendMode: 'NORMAL',
        imageBase64: '',
        imageRef: image.imageRef,
        gradientStops: [],
        scaleMode: type === 'TILED' ? 'TILE' : 'FILL',
    };
    if (image.cropRect)
        fill.cropRect = image.cropRect;
    nodeData.fills = [fill];
    nodeData.imageName = image.imageName;
    const tint = colorToOverlayTint(sprite.color);
    if (tint)
        nodeData.overlayTint = tint;
}
function exportGraphics(nodeData, graphics, ctx) {
    const color = graphics && graphics.fillColor;
    if (!color)
        return;
    nodeData.type = 'RECTANGLE';
    nodeData.fills = [colorToFigmaPaint(color)];
    ctx.stats.solidFills++;
}
function mapHAlignToFigma(Label, value) {
    if (Label && Label.HorizontalAlign) {
        if (value === Label.HorizontalAlign.CENTER)
            return 'CENTER';
        if (value === Label.HorizontalAlign.RIGHT)
            return 'RIGHT';
    }
    return 'LEFT';
}
function mapVAlignToFigma(Label, value) {
    if (Label && Label.VerticalAlign) {
        if (value === Label.VerticalAlign.CENTER)
            return 'CENTER';
        if (value === Label.VerticalAlign.BOTTOM)
            return 'BOTTOM';
    }
    return 'TOP';
}
function decodeBasicHtmlEntities(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
function richTextToPlain(text) {
    return decodeBasicHtmlEntities(String(text || '')
        .replace(/<br\s*\/?>/ig, '\n')
        .replace(/<\/?[^>]+>/g, ''));
}
function parseFontForFigma(label) {
    const font = label && label.font;
    let raw = String(font && (font.name || font._name) || '');
    raw = raw.replace(/\.(ttf|otf|ttc)$/i, '').replace(/_LABEL$/i, '').trim();
    if (!raw || raw === 'default') {
        return { family: 'Arial', weight: label && label.isBold ? 'Bold' : 'Regular' };
    }
    const weights = ['ExtraBold', 'SemiBold', 'DemiBold', 'Medium', 'Regular', 'Light', 'Black', 'Heavy', 'Bold'];
    for (const weight of weights) {
        const re = new RegExp(`[-_\\s]?${weight}$`, 'i');
        if (re.test(raw)) {
            return {
                family: raw.replace(re, '').trim() || raw,
                weight,
            };
        }
    }
    return { family: raw, weight: label && label.isBold ? 'Bold' : 'Regular' };
}
function readRichTextCompanionShadow(richText, RichText) {
    const mainNode = richText && richText.node;
    const authoredNode = mainNode && mainNode.parent;
    if (!isFtocRichTextRendererNode(mainNode) || !authoredNode)
        return null;
    const shadowNode = findFtocRichTextShadowNode(authoredNode, RichText);
    const shadowRichText = shadowNode && shadowNode.getComponent ? shadowNode.getComponent(RichText) : null;
    if (!componentEnabled(shadowRichText) || shadowNode.active === false)
        return null;
    const mainPosition = readNodePosition(mainNode);
    const shadowPosition = readNodePosition(shadowNode);
    return {
        color: snapshotColor(shadowRichText.fontColor || shadowRichText.color),
        offsetX: shadowPosition.x - mainPosition.x,
        offsetY: -(shadowPosition.y - mainPosition.y),
        blur: 0,
    };
}
function exportLabel(nodeData, label, rich, ctx) {
    const Label = ctx.cc.Label;
    const text = String(label.string || '');
    nodeData.characters = rich ? richTextToPlain(text) : text;
    nodeData.fontSize = roundExportNumber(Number(label.fontSize) || 0);
    const lineHeight = Number(label.lineHeight) || 0;
    nodeData.lineHeight = Math.abs(lineHeight - nodeData.fontSize) < 0.01 ? 0 : roundExportNumber(lineHeight);
    const parsedFont = parseFontForFigma(label);
    nodeData.fontFamily = parsedFont.family;
    nodeData.fontWeight = parsedFont.weight;
    nodeData.textAlignHorizontal = mapHAlignToFigma(Label, label.horizontalAlign);
    nodeData.textAlignVertical = mapVAlignToFigma(Label, label.verticalAlign);
    nodeData.letterSpacing = roundExportNumber(Number(label.spacingX) || 0);
    nodeData.textDecoration = label.isUnderline ? 'UNDERLINE' : 'NONE';
    nodeData.textCase = 'ORIGINAL';
    if (!rich && label.enableWrapText === false) {
        nodeData.textAutoResize = 'WIDTH_AND_HEIGHT';
    }
    else if (!rich && Label && Label.Overflow && label.overflow === Label.Overflow.CLAMP) {
        nodeData.textAutoResize = 'TRUNCATE';
        nodeData.textTruncation = 'DISABLED';
    }
    else {
        nodeData.textAutoResize = 'NONE';
    }
    const color = rich ? label.fontColor : label.color;
    nodeData.fills = [colorToFigmaPaint(color)];
    if (!rich && label.enableOutline) {
        nodeData.strokes = [colorToFigmaPaint(label.outlineColor, { r: 0, g: 0, b: 0, a: 255 })];
        nodeData.strokeWeight = roundExportNumber(Number(label.outlineWidth) || 1);
        nodeData.strokeAlign = 'OUTSIDE';
    }
    const richShadow = rich ? readRichTextCompanionShadow(label, ctx.cc.RichText) : null;
    if ((!rich && label.enableShadow) || richShadow) {
        const off = richShadow
            ? { x: richShadow.offsetX, y: -richShadow.offsetY }
            : (label.shadowOffset || { x: 0, y: 0 });
        const shadowColor = richShadow ? richShadow.color : label.shadowColor;
        const shadowBlur = richShadow ? richShadow.blur : label.shadowBlur;
        nodeData.effects = [buildFigmaDropShadowEffect(shadowColor, off, shadowBlur)];
    }
    ctx.stats.texts++;
}
function exportConstraints(widget) {
    if (!componentEnabled(widget))
        return null;
    let horizontal = 'LEFT';
    let vertical = 'TOP';
    if (widget.isAlignLeft && widget.isAlignRight)
        horizontal = 'LEFT_RIGHT';
    else if (widget.isAlignRight)
        horizontal = 'RIGHT';
    else if (widget.isAlignHorizontalCenter)
        horizontal = 'CENTER';
    if (widget.isAlignTop && widget.isAlignBottom)
        vertical = 'TOP_BOTTOM';
    else if (widget.isAlignBottom)
        vertical = 'BOTTOM';
    else if (widget.isAlignVerticalCenter)
        vertical = 'CENTER';
    return { horizontal, vertical };
}
async function exportMaskInfo(maskNode, parentW, parentH, ctx) {
    const { UITransform, Mask, Sprite } = ctx.cc;
    const ui = maskNode.getComponent(UITransform);
    const size = readUiSize(ui);
    const transform = exportNodeTransform(maskNode, size.width, size.height, parentW, parentH, false, ui);
    const mask = maskNode.getComponent(Mask);
    const sprite = maskNode.getComponent(Sprite);
    const image = await readSpriteFrameImage((sprite && sprite.spriteFrame) || (mask && mask.spriteFrame), ctx);
    return {
        kind: 'IMAGE',
        maskType: 'ALPHA',
        name: maskNode.name,
        x: transform.x,
        y: transform.y,
        width: transform.width,
        height: transform.height,
        rotation: transform.rotation,
        imageRef: image.imageRef,
        imageName: image.imageName,
    };
}
async function exportNodeToFigma(node, parentW, parentH, isRoot, ctx, selectedFilter, ancestorFilter) {
    const { UITransform, UIOpacity, Sprite, Label, RichText, Mask, Button, Widget, Graphics } = ctx.cc;
    const ui = node.getComponent(UITransform);
    const size = readUiSize(ui);
    const logicalText = resolveLogicalTextTarget(node, Label, RichText);
    const label = logicalText && logicalText.kind === 'label' ? logicalText.component : null;
    const richText = logicalText && logicalText.kind === 'richText' ? logicalText.component : null;
    const sprite = node.getComponent(Sprite);
    const graphics = Graphics ? node.getComponent(Graphics) : null;
    const type = componentEnabled(label) || componentEnabled(richText)
        ? 'TEXT'
        : (componentEnabled(sprite) || componentEnabled(graphics) ? 'RECTANGLE' : 'FRAME');
    const transform = exportNodeTransform(node, size.width, size.height, parentW, parentH, isRoot, ui);
    const nodeData = defaultFigmaNode(node, type, transform);
    ctx.stats.nodes++;
    const opacity = node.getComponent(UIOpacity);
    if (componentEnabled(opacity)) {
        nodeData.opacity = roundExportNumber((Number(opacity.opacity) || 255) / 255, 4);
    }
    const widget = node.getComponent(Widget);
    const constraints = exportConstraints(widget);
    if (constraints)
        nodeData.constraints = constraints;
    const mask = node.getComponent(Mask);
    if (componentEnabled(mask) && mask.type === Mask.Type.GRAPHICS_RECT) {
        nodeData.clipsContent = true;
    }
    const button = node.getComponent(Button);
    if (componentEnabled(button) && type !== 'TEXT') {
        nodeData.componentType = 'BUTTON';
        ctx.stats.buttons++;
    }
    if (componentEnabled(label)) {
        exportLabel(nodeData, label, false, ctx);
    }
    else if (componentEnabled(richText)) {
        exportLabel(nodeData, richText, true, ctx);
    }
    else if (componentEnabled(sprite)) {
        await exportSprite(nodeData, sprite, ctx);
    }
    else if (componentEnabled(graphics)) {
        exportGraphics(nodeData, graphics, ctx);
    }
    const children = node.children || [];
    for (const child of children) {
        if (isFtocTextHelperNode(child) || isCreatorRichTextRuntimeNode(child))
            continue;
        let childSelected = false;
        let childIsAncestor = false;
        if (selectedFilter) {
            childSelected = selectedFilter.has(child.uuid);
            childIsAncestor = !!ancestorFilter && ancestorFilter.has(child.uuid);
            if (!childSelected && !childIsAncestor)
                continue;
        }
        const childMask = child.getComponent && child.getComponent(Mask);
        const isImageMask = componentEnabled(childMask) &&
            childMask.type !== Mask.Type.GRAPHICS_RECT &&
            !nodeData.mask;
        if (isImageMask) {
            const maskNodeData = await exportNodeToFigma(child, size.width, size.height, false, ctx, childSelected ? null : selectedFilter, childSelected ? null : ancestorFilter);
            const maskInfo = await exportMaskInfo(child, size.width, size.height, ctx);
            nodeData.mask = maskInfo;
            ctx.stats.masks++;
            for (const grandData of (maskNodeData.children || [])) {
                grandData.x = roundExportNumber((grandData.x || 0) + (maskInfo.x || 0));
                grandData.y = roundExportNumber((grandData.y || 0) + (maskInfo.y || 0));
                nodeData.children.push(grandData);
            }
            continue;
        }
        nodeData.children.push(await exportNodeToFigma(child, size.width, size.height, false, ctx, childSelected ? null : selectedFilter, childSelected ? null : ancestorFilter));
    }
    return nodeData;
}
function findNodeByUuid(node, uuid) {
    if (!node || !uuid)
        return null;
    if (node.uuid === uuid)
        return node;
    for (const child of (node.children || [])) {
        const found = findNodeByUuid(child, uuid);
        if (found)
            return found;
    }
    return null;
}
function findFirstNodeByName(node, name) {
    if (!node || !name)
        return null;
    if (node.name === name)
        return node;
    for (const child of (node.children || [])) {
        const found = findFirstNodeByName(child, name);
        if (found)
            return found;
    }
    return null;
}
function buildSceneNodePath(node) {
    const parts = [];
    let cur = node;
    while (cur && cur.name) {
        parts.unshift(cur.name);
        cur = cur.parent;
    }
    return parts.join('/');
}
function buildRelativeNodePath(node, root) {
    const parts = [];
    let cur = node;
    while (cur && cur !== root) {
        if (cur.name)
            parts.unshift(cur.name);
        cur = cur.parent;
    }
    if (root && root.name)
        parts.unshift(root.name);
    return parts.join('/');
}
function readComponentName(component) {
    return String(component && (component.constructor && component.constructor.name ||
        component.__classname__ ||
        component.name ||
        '') || '');
}
function getUiAncestorPath(node, UITransform, includeSelf) {
    const path = [];
    let cur = includeSelf ? node : node && node.parent;
    while (cur) {
        if (cur.getComponent && cur.getComponent(UITransform))
            path.push(cur);
        cur = cur.parent;
    }
    return path.reverse();
}
function findCommonUiAncestor(nodes, UITransform) {
    if (!nodes || nodes.length === 0)
        return null;
    let common = getUiAncestorPath(nodes[0], UITransform, true);
    for (let i = 1; i < nodes.length; i++) {
        const path = getUiAncestorPath(nodes[i], UITransform, true);
        let len = 0;
        const max = Math.min(common.length, path.length);
        while (len < max && common[len] === path[len])
            len++;
        common = common.slice(0, len);
    }
    return common.length > 0 ? common[common.length - 1] : null;
}
function findInterfaceRoot(node, canvas, UITransform) {
    if (!node)
        return null;
    if (!canvas) {
        const path = getUiAncestorPath(node, UITransform, true);
        return path.length > 0 ? path[0] : node;
    }
    let cur = node;
    let last = node;
    while (cur && cur !== canvas) {
        last = cur;
        cur = cur.parent;
    }
    return cur === canvas ? last : null;
}
function collectAncestorUuidSet(selectedNodes, root) {
    const ancestors = new Set();
    for (const selected of selectedNodes) {
        let cur = selected && selected.parent;
        while (cur) {
            ancestors.add(cur.uuid);
            if (cur === root)
                break;
            cur = cur.parent;
        }
    }
    return ancestors;
}
function findDefaultExportRoot(scene, find, UITransform) {
    const canvas = find('Canvas') || scene.getChildByName('Canvas');
    const candidates = canvas ? (canvas.children || []) : (scene.children || []);
    for (let i = candidates.length - 1; i >= 0; i--) {
        const child = candidates[i];
        if (!child || child.name === 'Camera')
            continue;
        if (child.getComponent && child.getComponent(UITransform))
            return child;
    }
    return canvas || scene;
}
function collectSceneNodeStats(root, cc) {
    const { Sprite, Label, RichText, Mask, Button, UITransform } = cc;
    const stats = {
        nodes: 0,
        uiTransforms: 0,
        sprites: 0,
        nullSpriteFrames: 0,
        labels: 0,
        richTexts: 0,
        masks: 0,
        buttons: 0,
    };
    const visit = (node) => {
        if (!node)
            return;
        stats.nodes++;
        if (UITransform && node.getComponent && node.getComponent(UITransform))
            stats.uiTransforms++;
        if (Sprite && node.getComponent) {
            const sprite = node.getComponent(Sprite);
            if (sprite) {
                stats.sprites++;
                if (!sprite.spriteFrame && !sprite._spriteFrame)
                    stats.nullSpriteFrames++;
            }
        }
        if (Label && node.getComponent && node.getComponent(Label))
            stats.labels++;
        if (RichText && node.getComponent && node.getComponent(RichText))
            stats.richTexts++;
        if (Mask && node.getComponent && node.getComponent(Mask))
            stats.masks++;
        if (Button && node.getComponent && node.getComponent(Button))
            stats.buttons++;
        for (const child of (node.children || []))
            visit(child);
    };
    visit(root);
    return stats;
}
function selectEditorNode(node) {
    try {
        const selection = Editor.Selection;
        if (selection && typeof selection.select === 'function' && node && node.uuid) {
            selection.select('node', node.uuid);
        }
    }
    catch (_a) {
        // Selection feedback is nice-to-have only.
    }
}
function findPrefabSourceNode(scene, find, UITransform, options) {
    let root = options && options.rootUuid ? findNodeByUuid(scene, String(options.rootUuid)) : null;
    if (!root && options && options.rootName)
        root = findFirstNodeByName(scene, String(options.rootName));
    if (!root)
        root = findDefaultExportRoot(scene, find, UITransform);
    return root;
}
function createPrefabAssetFromNode(cc, source, prefabName) {
    const { Prefab, instantiate } = cc;
    const cleanName = sanitizeCocosNodeName(prefabName, source.name || 'FigmaPrefab');
    const prefabUtils = Editor.require ? Editor.require('scene://utils/prefab') : null;
    const clone = instantiate(source);
    clone.parent = null;
    clone.name = cleanName;
    if (prefabUtils && typeof prefabUtils.checkAndStripNode === 'function') {
        try {
            prefabUtils.checkAndStripNode(clone, true);
        }
        catch (_a) {
            // Some Creator builds throw for unsupported editor-only state; the clone still serializes.
        }
    }
    if (prefabUtils
        && typeof prefabUtils.createPrefabFrom === 'function'
        && typeof prefabUtils.createAppliedPrefab === 'function') {
        prefabUtils.createPrefabFrom(clone);
        if (typeof prefabUtils.setPrefabSync === 'function')
            prefabUtils.setPrefabSync(clone, true);
        const applied = prefabUtils.createAppliedPrefab(clone);
        if (applied) {
            applied.name = cleanName;
            if (applied.data)
                applied.data.name = cleanName;
            return applied;
        }
    }
    const prefabAsset = new Prefab();
    prefabAsset.name = cleanName;
    prefabAsset.data = clone;
    if (prefabUtils && typeof prefabUtils.addPrefabInfo === 'function') {
        prefabUtils.addPrefabInfo(clone, clone, prefabAsset);
    }
    return prefabAsset;
}
function loadPrefabAsset(assetManager, uuid) {
    return loadAssetAny(assetManager, uuid, 10, 100).then((asset) => {
        if (!asset)
            throw new Error(`Prefab asset not ready: ${uuid}`);
        return asset;
    });
}
/**
 * @zh 按 figmaPath 在模板树里定位节点。figmaPath 是相对模板根的段路径（去重扁平模式下通常是单段叶子名）。
 *     兼容两种美术存法：
 *       (a) 存整个 TextStyles 根 → root 名为容器名，叶子是其子节点，逐段 getChildByName 命中；
 *       (b) 只把单个样式 Label 拖出来存 → root 自身就是叶子，此时若逐段找不到、但末段名==root 名，回退 root。
 *     根节点名本身不算路径的一段。找不到返回 null。
 */
function getNodeByPath(root, figmaPath) {
    if (!root)
        return null;
    const segs = String(figmaPath || '').split('/').map((s) => s.trim()).filter((s) => s.length > 0);
    if (segs.length === 0)
        return null;
    let cursor = root;
    let matched = true;
    for (const seg of segs) {
        if (!cursor || typeof cursor.getChildByName !== 'function') {
            matched = false;
            break;
        }
        const next = cursor.getChildByName(seg);
        if (!next) {
            matched = false;
            break;
        }
        cursor = next;
    }
    if (matched)
        return cursor;
    // 回退：美术只存了单个样式 Label（root 即叶子），路径末段名与 root 名一致时用 root。
    if (String(root._name || root.name || '') === segs[segs.length - 1])
        return root;
    // Legacy indexes may only retain childName. Resolve it recursively only
    // when unique; duplicate names are ambiguous and must not inherit scripts.
    if (segs.length === 1) {
        const hits = [];
        const visit = (node) => {
            for (const child of (node && node.children || [])) {
                if (String(child && (child._name || child.name) || '') === segs[0])
                    hits.push(child);
                if (hits.length <= 1)
                    visit(child);
            }
        };
        visit(root);
        if (hits.length === 1)
            return hits[0];
    }
    return null;
}
/** Legacy/manual indexes may carry only childName; keep that configured leaf reachable. */
function resolveTextStyleTemplatePath(template) {
    const figmaPath = String(template && template.figmaPath || '').trim();
    if (figmaPath)
        return figmaPath;
    return String(template && template.childName || '').trim();
}
/** @zh 只有精确命中的普通 Label 才继承模板组件；Fuzzy 继续走数值降级，避免误挂行为脚本。 */
function shouldCloneExactTextStyleTemplate(figmaNode) {
    const template = figmaNode && figmaNode.textStyleTemplate;
    return String(figmaNode && figmaNode.type || '').toUpperCase() === 'TEXT'
        && !hasMixedTextSegments(figmaNode)
        && String(template && template.tier || '').trim().toUpperCase() === 'EXACT'
        && !!String(template && template.prefabUuid || '')
        && !!resolveTextStyleTemplatePath(template);
}
/** @zh 收集需要在建树前加载的 Exact 文字模板 Prefab，保证 buildNode 内可同步克隆完整组件。 */
function collectExactTextStyleTemplateUuids(root) {
    const uuids = new Set();
    const visit = (node) => {
        if (!node)
            return;
        if (shouldCloneExactTextStyleTemplate(node)) {
            uuids.add(String(node.textStyleTemplate.prefabUuid));
        }
        for (const child of (node.children || []))
            visit(child);
    };
    visit(root);
    return Array.from(uuids);
}
function stripPrefabState(node) {
    if (!node)
        return;
    let stripped = false;
    try {
        const prefabUtils = Editor.require ? Editor.require('scene://utils/prefab') : null;
        if (prefabUtils && typeof prefabUtils.checkAndStripNode === 'function') {
            prefabUtils.checkAndStripNode(node, true);
            stripped = true;
        }
    }
    catch (_a) {
        // Creator versions expose different editor helpers; the runtime fallback below keeps the clone scene-owned.
    }
    if (!stripped && Object.prototype.hasOwnProperty.call(node, '_prefab'))
        node._prefab = null;
    const components = Array.isArray(node.components)
        ? node.components
        : (Array.isArray(node._components) ? node._components : []);
    for (const component of components) {
        if (component && Object.prototype.hasOwnProperty.call(component, '__prefab'))
            component.__prefab = null;
    }
}
/**
 * @zh 对齐 Unity CopyComponent + CopyExtraStyleComponents：克隆模板文字叶节点，保留 Label、材质和同节点附加脚本。
 *     模板子节点不属于文字样式组件契约，克隆后移除；Cocos instantiate 会重映射同一克隆图内的组件引用。
 */
function cloneExactTextStyleTemplateNode(figmaNode, templateRoot, cc) {
    if (!shouldCloneExactTextStyleTemplate(figmaNode) || !templateRoot || !cc)
        return null;
    const { Label, instantiate } = cc;
    if (!Label || typeof instantiate !== 'function')
        return null;
    const template = figmaNode.textStyleTemplate;
    const sourceNode = getNodeByPath(templateRoot, resolveTextStyleTemplatePath(template));
    if (!sourceNode || !sourceNode.getComponent || !sourceNode.getComponent(Label))
        return null;
    let clone = null;
    try {
        clone = instantiate(sourceNode);
    }
    catch (error) {
        console.warn('[figma-importer:scene] Exact 文字模板节点克隆失败:', error && error.message || error);
        return null;
    }
    if (!clone || !clone.getComponent || !clone.getComponent(Label)) {
        if (clone && typeof clone.destroy === 'function')
            clone.destroy();
        return null;
    }
    stripPrefabState(clone);
    for (const child of [...(clone.children || [])]) {
        if (typeof child.removeFromParent === 'function')
            child.removeFromParent();
        if (typeof child.destroy === 'function')
            child.destroy();
    }
    // Keep edit-mode scripts dormant until authored Figma text/layout properties are applied.
    clone.active = false;
    return clone;
}
function finalizeExactTextStyleTemplateNode(node, visible) {
    if (node)
        node.active = visible !== false;
}
/** A queued component-state target stays dormant until the editor facade finishes. */
function shouldFinalizeExactTextStyleTemplateNode(exactTextTemplateClone, stateQueued) {
    return !!exactTextTemplateClone && !stateQueued;
}
/**
 * @zh 把模板 Label 的「外观」拷到目标 Label（环4 整组件克隆的 Cocos 版）。
 *     只拷外观维度：字体/加粗/斜体/描边/投影/自定义材质；不动目标的 string/字号/颜色/对齐/尺寸。
 *     字号/颜色随导入节点，外观随模板——对齐 Unity「text/字号/颜色随节点覆盖，其余克隆」。
 */
function copyLabelAppearance(src, dst, Font) {
    if (!src || !dst)
        return false;
    try {
        // 字体
        if (src.font && (!Font || src.font instanceof Font)) {
            dst.font = src.font;
            dst.useSystemFont = false;
        }
        else {
            dst.useSystemFont = src.useSystemFont;
            if (src.fontFamily)
                dst.fontFamily = src.fontFamily;
        }
        dst.isBold = src.isBold;
        dst.isItalic = src.isItalic;
        // 描边
        dst.enableOutline = src.enableOutline;
        if (src.enableOutline) {
            dst.outlineColor = src.outlineColor.clone ? src.outlineColor.clone() : src.outlineColor;
            dst.outlineWidth = src.outlineWidth;
        }
        // 投影
        dst.enableShadow = src.enableShadow;
        if (src.enableShadow) {
            dst.shadowColor = src.shadowColor.clone ? src.shadowColor.clone() : src.shadowColor;
            dst.shadowOffset = src.shadowOffset.clone ? src.shadowOffset.clone() : src.shadowOffset;
            dst.shadowBlur = src.shadowBlur;
        }
        // 自定义材质（美术若给模板配了特殊 shader 材质，一并带过来）
        if (src.customMaterial)
            dst.customMaterial = src.customMaterial;
        return true;
    }
    catch (e) {
        console.warn('[figma-importer:scene] 拷贝模板 Label 外观失败:', e && e.message || e);
        return false;
    }
}
function resolveRichTextFontReference(figmaNode, template) {
    return {
        uuid: String((figmaNode && figmaNode.fontUuid) || (template && template.fontUuid) || ''),
        fileName: String((figmaNode && figmaNode.fontFileName) || (template && template.fontFileName) || ''),
    };
}
/** @zh RichText 只继承模板字体；模板仍是系统字体时改用 main 已解析的工程字体。 */
async function applyRichTextFont(target, templateLabel, resolverFontUuid, loadFont, Font) {
    if (!target)
        return 'missing';
    const templateFont = templateLabel && templateLabel.font;
    if (templateFont && (!Font || templateFont instanceof Font)) {
        target.font = templateFont;
        target.useSystemFont = false;
        return 'template';
    }
    if (resolverFontUuid) {
        const resolvedFont = await loadFont(resolverFontUuid);
        if (resolvedFont && (!Font || resolvedFont instanceof Font)) {
            target.font = resolvedFont;
            target.useSystemFont = false;
            return 'resolver';
        }
    }
    target.useSystemFont = true;
    return 'missing';
}
function serializeEditorObject(target, options) {
    const g = globalThis;
    const candidates = [
        Editor.serialize,
        g.EditorExtends && g.EditorExtends.serialize,
        g.editorExtends && g.editorExtends.serialize,
    ].filter((fn) => typeof fn === 'function');
    if (candidates.length === 0) {
        throw new Error('No Cocos editor serializer found (Editor.serialize / EditorExtends.serialize)');
    }
    return candidates[0](target, options);
}
// ─────────────────────────────────────────────────────────────────────────
// 阶段 3 布局判定（纯 JS，对齐 Unity FigmaImporter.cs 477-560，不依赖引擎）
// ─────────────────────────────────────────────────────────────────────────
const LAYOUT_TOL = 4; // Figma 设计常见 1-3px 尺寸偏差，容差 4px（对齐 Unity）
const FILL_ORIGIN_TOL = 0.5; // 位置偏移通常是设计意图；只把几乎贴原点的节点当作背景填充。
/** @zh 取 Figma 节点在父坐标里的视觉包围盒；镜像/旋转优先用 relativeTransform。 */
function figmaBounds(node) {
    const w = node.width || 0;
    const h = node.height || 0;
    const t = node.relativeTransform;
    if (Array.isArray(t) && Array.isArray(t[0]) && Array.isArray(t[1]) &&
        t[0].length >= 3 && t[1].length >= 3) {
        const a = Number(t[0][0]) || 0;
        const b = Number(t[0][1]) || 0;
        const tx = Number(t[0][2]) || 0;
        const c = Number(t[1][0]) || 0;
        const d = Number(t[1][1]) || 0;
        const ty = Number(t[1][2]) || 0;
        const xs = [tx, a * w + tx, b * h + tx, a * w + b * h + tx];
        const ys = [ty, c * w + ty, d * h + ty, c * w + d * h + ty];
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }
    const x = node.x || 0;
    const y = node.y || 0;
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
}
/**
 * @zh 子节点是否真的铺满父节点。Unity 版只看尺寸，但 Cocos Widget 会把这种节点转成四边 Stretch；
 *     若节点本身有 x/y 偏移（典型：底栏 Hero 头像 x=2），只看尺寸会吞掉 Figma 的设计偏移。
 */
function isFillParent(node, parent) {
    if (!parent)
        return false;
    // Figma often wraps TEXT in a same-sized "文字样式" auto-layout frame. That
    // is style organization, not a request for the Label to stretch like a background.
    if (node && node.type === 'TEXT')
        return false;
    // Stretch works in the node's local axes. A rotated non-square node can have a
    // parent-sized visual AABB while its authored width/height are intentionally swapped.
    const parentWidth = Number(parent.width) || 0;
    const parentHeight = Number(parent.height) || 0;
    if (Math.abs((Number(node && node.width) || 0) - parentWidth) >= LAYOUT_TOL ||
        Math.abs((Number(node && node.height) || 0) - parentHeight) >= LAYOUT_TOL) {
        return false;
    }
    const b = figmaBounds(node);
    return Math.abs(b.left) < FILL_ORIGIN_TOL &&
        Math.abs(b.top) < FILL_ORIGIN_TOL &&
        Math.abs(b.right - parentWidth) < LAYOUT_TOL &&
        Math.abs(b.bottom - parentHeight) < LAYOUT_TOL;
}
/** @zh 节点声明了 Auto Layout。端口 HasLayout(207)。 */
function hasLayout(node) {
    return node.layoutMode === 'VERTICAL' || node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'GRID';
}
/** @zh Wrap 换行布局。端口 IsWrapLayout(208)。 */
function isWrapLayout(node) {
    return hasLayout(node) && node.layoutWrap === 'WRAP';
}
/** @zh 绝对定位子节点。端口 IsAbsolutePositioned(209)。 */
function isAbsolutePositioned(node) {
    return node.layoutPositioning === 'ABSOLUTE';
}
/** @zh 真正参与布局的子节点数：排除绝对定位/填满父级。端口 LayoutParticipatingChildCount(480)。 */
function layoutParticipatingChildCount(node) {
    const children = node.children || [];
    let n = 0;
    for (const c of children) {
        if (!isAbsolutePositioned(c) && !isFillParent(c, node))
            n++;
    }
    return n;
}
/** @zh Wrap 布局里参与布局的子节点尺寸是否基本一致（容差 4px）。端口 WrapChildrenAreUniform(511)。 */
function wrapChildrenAreUniform(node) {
    const children = node.children || [];
    let any = false;
    let minW = Infinity, maxW = -Infinity, minH = Infinity, maxH = -Infinity;
    for (const c of children) {
        if (isAbsolutePositioned(c) || isFillParent(c, node))
            continue;
        any = true;
        const w = c.width || 0, h = c.height || 0;
        if (w < minW)
            minW = w;
        if (w > maxW)
            maxW = w;
        if (h < minH)
            minH = h;
        if (h > maxH)
            maxH = h;
    }
    if (!any)
        return true;
    return (maxW - minW) <= LAYOUT_TOL && (maxH - minH) <= LAYOUT_TOL;
}
/**
 * @zh 是否真的需要给该容器挂 LayoutGroup：声明 Auto Layout 且参与布局子节点 ≥ 2，
 *     且非「异构 Wrap」。端口 EffectiveHasLayout(498)。
 *     注：此判定决定子节点走哪条定位分支；是否真的挂 cc.Layout 组件另见 shouldMountLayout。
 */
function effectiveHasLayout(node) {
    if (!hasLayout(node))
        return false;
    if (layoutParticipatingChildCount(node) < 2)
        return false;
    if (isWrapLayout(node) && !wrapChildrenAreUniform(node))
        return false;
    return true;
}
/**
 * @zh 容器是否「纯净」：所有子节点都参与布局（无 ABSOLUTE 定位、无填满父级背景）。
 *     cc.Layout 会卷入所有 active 子节点排布，无 Unity LayoutElement.ignoreLayout 等价开关，
 *     故混入非布局子节点的容器不能挂 cc.Layout（否则背景/绝对定位节点被排乱），回退绝对坐标。
 */
function layoutContainerIsClean(node) {
    const kids = node.children || [];
    for (const c of kids) {
        if (isAbsolutePositioned(c))
            return false;
        if (isFillParent(c, node))
            return false;
    }
    return true;
}
/**
 * @zh 最终是否给本节点挂 cc.Layout 组件：EffectiveHasLayout + 可安全映射的 GRID + 纯净。
 */
function shouldMountLayout(node) {
    if (!effectiveHasLayout(node) || !layoutContainerIsClean(node))
        return false;
    if (node.layoutMode === 'GRID')
        return !!(0, layout_plan_1.inferNativeGridLayout)(node);
    if (!isWrapLayout(node))
        return true;
    return !!(0, layout_plan_1.inferWrapGridLayout)(node);
}
/** @zh AutoLayout 父容器下子节点是否应忽略布局（绝对定位/填满父级）。端口 ShouldIgnoreLayout(536)。 */
function shouldIgnoreLayout(node, parentHasLayout, parent) {
    if (!parentHasLayout)
        return false;
    if (isAbsolutePositioned(node))
        return true;
    if (isFillParent(node, parent))
        return true;
    return false;
}
/** @zh 节点是否有非默认约束（需 constraint-driven 锚点，即挂 Widget）。端口 HasStretchConstraint(802)。 */
function hasStretchConstraint(node) {
    const c = node.constraints;
    if (!c)
        return false;
    const h = c.horizontal, v = c.vertical;
    const hNonDefault = !!h && h !== 'LEFT';
    const vNonDefault = !!v && v !== 'TOP';
    return hNonDefault || vNonDefault;
}
/**
 * @zh 子节点尺寸略超父节点时裁到父边界（原地改 w/h）。端口 ClampOverflowToParent(570)。
 *     Auto-Width 文本无条件收进父内容区（防换字体后变宽压邻节点）。
 */
function clampOverflowToParent(node, parent, fillsParent, parentHasLayout, ignore) {
    if (!parent)
        return;
    const pad = parent.padding || { left: 0, right: 0, top: 0, bottom: 0 };
    if (fillsParent) {
        node.width = parent.width;
        node.height = parent.height;
        return;
    }
    if (parentHasLayout && !ignore) {
        const innerW = (parent.width || 0) - (pad.left || 0) - (pad.right || 0);
        const innerH = (parent.height || 0) - (pad.top || 0) - (pad.bottom || 0);
        const isAutoWidthText = node.type === 'TEXT' && node.textAutoResize === 'WIDTH_AND_HEIGHT';
        if (isAutoWidthText && innerW > 0.5 && node.width > innerW) {
            node.width = innerW;
        }
        else if (node.width > innerW && (node.width - innerW) <= LAYOUT_TOL) {
            node.width = innerW;
        }
        if (node.height > innerH && (node.height - innerH) <= LAYOUT_TOL) {
            node.height = innerH;
        }
    }
    else {
        const rightOverflow = (node.x + node.width) - (parent.width || 0);
        const bottomOverflow = (node.y + node.height) - (parent.height || 0);
        const nearLeftOrigin = Math.abs(node.x || 0) < FILL_ORIGIN_TOL;
        const nearTopOrigin = Math.abs(node.y || 0) < FILL_ORIGIN_TOL;
        if (nearLeftOrigin && rightOverflow > 0 && rightOverflow <= LAYOUT_TOL)
            node.width -= rightOverflow;
        if (nearTopOrigin && bottomOverflow > 0 && bottomOverflow <= LAYOUT_TOL)
            node.height -= bottomOverflow;
    }
}
exports.methods = {
    getSceneBuildVersion() {
        return {
            success: true,
            data: {
                version: SCENE_BUILD_VERSION,
            },
        };
    },
    getComponentStateRuntimeRevision() {
        const cc = require('cc');
        const stateClass = cc && cc.js && typeof cc.js.getClassByName === 'function'
            ? cc.js.getClassByName(FIGMA_COMPONENT_STATE_CLASS)
            : null;
        return {
            success: true,
            data: {
                registered: !!stateClass,
                revision: stateClass && Number(stateClass.ftocRuntimeRevision) || 0,
            },
        };
    },
    /** @zh 读取指定场景节点的 Figma 组件身份，供 Assign Prefab 面板使用。 */
    describeComponentMappingSelection(nodeUuid) {
        try {
            const cc = require('cc');
            const scene = cc.director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const uuid = String(nodeUuid || '').trim();
            if (!uuid) {
                return { success: true, data: { status: 'none', reason: 'no-selection', nodeUuid: '' } };
            }
            const node = findNodeByUuid(scene, uuid);
            if (!node) {
                return { success: true, data: { status: 'none', reason: 'selection-stale', nodeUuid: uuid } };
            }
            return { success: true, data: describeFigmaComponentSelection(node, cc) };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    applyComponentStates(items) {
        try {
            const cc = require('cc');
            const scene = cc.director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const requests = Array.isArray(items)
                ? items.filter((item) => !!(item && item.nodeUuid))
                : [];
            let attached = 0;
            let mounted = 0;
            let overrideTotal = 0;
            let unavailable = 0;
            let overrideMissing = 0;
            let activated = 0;
            const failures = [];
            for (const request of requests) {
                if (request && request.requiresPrefabOverride)
                    overrideTotal++;
                const node = findNodeByUuid(scene, String(request && request.nodeUuid || ''));
                if (!node) {
                    unavailable++;
                    failures.push({ nodeUuid: String(request && request.nodeUuid || ''), status: 'node-missing' });
                    continue;
                }
                const status = applyComponentState(node, request, cc);
                if (node.active === (request.active !== false))
                    activated++;
                if (status === 'attached') {
                    attached++;
                    if (request.requiresPrefabOverride)
                        mounted++;
                }
                else {
                    unavailable++;
                    if (status === 'override-missing')
                        overrideMissing++;
                    failures.push({ nodeUuid: request.nodeUuid, status });
                }
            }
            return {
                success: true,
                data: {
                    total: requests.length,
                    attached,
                    mounted,
                    overrideTotal,
                    unavailable,
                    overrideMissing,
                    activated,
                    failures,
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * Restore only authored active flags after a failed component-apply pass.
     * This is intentionally separate from state writes so a recovery cannot
     * claim that a missing component was persisted.
     */
    restoreComponentStateActivity(items) {
        try {
            const cc = require('cc');
            const scene = cc.director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const requests = Array.isArray(items)
                ? items.filter((item) => !!(item && item.nodeUuid))
                : [];
            let activated = 0;
            const failures = [];
            for (const request of requests) {
                const node = findNodeByUuid(scene, String(request.nodeUuid));
                if (!node) {
                    failures.push({ nodeUuid: request.nodeUuid, status: 'node-missing' });
                    continue;
                }
                node.active = request.active !== false;
                if (node.active === (request.active !== false))
                    activated++;
                else
                    failures.push({ nodeUuid: request.nodeUuid, status: 'active-write-failed' });
            }
            return {
                success: true,
                data: {
                    total: requests.length,
                    activated,
                    failures,
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /** @deprecated Compatibility alias for clients using the old mapped-only name. */
    applyMappedComponentStates(items) {
        return exports.methods.applyComponentStates(items);
    },
    /**
     * @en Return the node that imported UI will be parented under.
     * @zh 返回导入 UI 将挂载到的父节点，用于 main 侧开启 scene recording / 保存刷新。
     */
    getImportContext() {
        try {
            const { director, find } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const canvas = find('Canvas') || scene.getChildByName('Canvas');
            const parentNode = canvas || scene;
            return {
                success: true,
                data: {
                    parentUuid: parentNode.uuid,
                    parentName: parentNode.name,
                    sceneUuid: scene.uuid,
                    sceneName: scene.name,
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * @en Build a real Label node tree keyed by figmaPath, as the art-editable template root.
     *     Port of Unity FigmaImporterWindow.BuildStyleRootFromJson / BuildNode / InitTextChild:
     *     each entry becomes a Label leaf placed at its figmaPath so import-side getChildByPath resolves.
     *     Presets string/fontSize/color/align/stroke/shadow as the artist's starting point only.
     * @zh 按 figmaPath 还原真实 Label 节点树，作为美术可调的模板根（对齐 Unity BuildStyleRootFromJson）。
     *     叶子节点名/层级严格等于 figmaPath 段，保证导入侧 getChildByPath 命中；数值仅作美术起点。
     */
    async buildTextStyleRoot(data) {
        try {
            const cc = require('cc');
            const { director, Node, UITransform, Label, Color, Vec2, find } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const entries = Array.isArray(data && data.entries) ? data.entries : [];
            if (entries.length === 0)
                return { success: false, error: 'No entries' };
            const rootName = sanitizeCocosNodeName(data && data.rootName, 'TextStyles');
            const canvas = find('Canvas') || scene.getChildByName('Canvas');
            const parentNode = canvas || scene;
            // 若已存在同名旧模板根，先移除，避免叠加重复。
            const existing = parentNode.getChildByName(rootName);
            if (existing)
                existing.destroy();
            const root = new Node(rootName);
            root.addComponent(UITransform);
            parentNode.addChild(root);
            const ensureChild = (parent, segName) => {
                const safeSegmentName = sanitizeCocosNodeName(segName);
                const found = parent.getChildByName(safeSegmentName);
                if (found)
                    return found;
                const child = new Node(safeSegmentName);
                child.addComponent(UITransform);
                parent.addChild(child);
                return child;
            };
            let leafCount = 0;
            for (const entry of entries) {
                const figmaPath = String(entry.figmaPath || '').trim();
                if (!figmaPath)
                    continue;
                const segs = figmaPath.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
                if (segs.length === 0)
                    continue;
                // 沿 figmaPath 建/找中间节点，最后一段是 Label 叶子。
                let cursor = root;
                for (let i = 0; i < segs.length; i++) {
                    cursor = ensureChild(cursor, segs[i]);
                }
                const label = cursor.getComponent(Label) || cursor.addComponent(Label);
                label.string = String(entry.figmaSampleText || entry.styleName || segs[segs.length - 1] || '样例文字');
                if (entry.figmaFontSize) {
                    label.fontSize = entry.figmaFontSize;
                    label.lineHeight = entry.figmaLineHeight > 0 ? entry.figmaLineHeight : entry.figmaFontSize;
                }
                label.horizontalAlign = mapHAlign(Label, entry.figmaAlignH);
                label.verticalAlign = mapVAlign(Label, entry.figmaAlignV);
                const col = entry.figmaColor || entry.color;
                if (col)
                    label.color = new Color(col.r, col.g, col.b, col.a == null ? 255 : col.a);
                // 描边 / 投影：预设数值作为美术起点（美术会在此基础上手配材质/微调）。
                if (entry.stroke && entry.stroke.color) {
                    const st = entry.stroke;
                    label.enableOutline = true;
                    label.outlineColor = new Color(st.color.r, st.color.g, st.color.b, st.color.a == null ? 255 : st.color.a);
                    label.outlineWidth = st.width || 1;
                }
                if (entry.shadow && entry.shadow.color) {
                    const sh = entry.shadow;
                    label.enableShadow = true;
                    label.shadowColor = new Color(sh.color.r, sh.color.g, sh.color.b, sh.color.a == null ? 255 : sh.color.a);
                    label.shadowOffset = new Vec2(sh.offsetX || 0, -(sh.offsetY || 0));
                    label.shadowBlur = sh.blur || 0;
                }
                leafCount++;
            }
            return { success: true, data: { rootUuid: root.uuid, rootName, leafCount } };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * @en Create one empty node under the current scene root.
     * @zh 在当前场景根下建一个空节点。
     */
    createEmptyNode(name) {
        try {
            const { director, Node } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const node = new Node(sanitizeCocosNodeName(name));
            scene.addChild(node);
            return { success: true, data: { uuid: node.uuid, name: node.name } };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    /**
     * @en Build the whole node tree (stage 2: position/size + image sprites).
     * @zh 建整棵节点树（阶段 2：坐标尺寸 + 图片精灵）。
     */
    async buildTree(data) {
        try {
            console.log(`%c[figma-importer:scene] buildTree 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director, Node, UITransform, UIOpacity, Vec3, Vec2, Rect, Size, find, Sprite, Label, Color, assetManager, Widget, Mask, Font, Graphics, RichText, Button, EditBox, Layout, instantiate } = cc;
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            if (!data || !data.root) {
                return { success: false, error: 'Invalid data: missing root' };
            }
            // 带 UITransform 的 2D 节点必须挂在 Canvas 下才渲染。替换 beta 可指定原父节点重建。
            const canvas = find('Canvas') || scene.getChildByName('Canvas');
            let parentNode = canvas || scene;
            if (data.parentUuid) {
                const customParent = findNodeByUuid(scene, String(data.parentUuid));
                if (customParent)
                    parentNode = customParent;
            }
            const requestedSiblingIndex = typeof data.siblingIndex === 'number' ? data.siblingIndex : -1;
            const parentUi = parentNode.getComponent && parentNode.getComponent(UITransform);
            const parentSize = data.parentUuid && parentUi ? readUiSize(parentUi) : { width: 0, height: 0 };
            const canvasW = (parentSize.width > 0 ? parentSize.width : 0) || (data.canvas && data.canvas.width) || data.root.width;
            const canvasH = (parentSize.height > 0 ? parentSize.height : 0) || (data.canvas && data.canvas.height) || data.root.height;
            const idToSpriteFrame = data.idToSpriteFrame || {};
            const idToMaskSpriteFrame = data.idToMaskSpriteFrame || {};
            // 已落盘/复用成功但 SpriteFrame 子资源尚未就绪的图：建树先挂品红占位，由 main 后台就绪后替换。
            // 仅普通 Sprite 走此机制（缺图品红是它的症状）；遮罩为 0 样本未验证路径，缺 uuid 时已优雅回退矩形遮罩，不在此范围。
            const unresolved = data.unresolved || {};
            const componentMappings = Array.isArray(data.componentMappings)
                ? data.componentMappings
                : [];
            const componentStateRuntimeAvailable = data.componentStateRuntimeReady !== false;
            const fallbackUiLayer = (cc.Layers && cc.Layers.Enum && cc.Layers.Enum.UI_2D) || (1 << 25);
            const importedLayer = typeof parentNode.layer === 'number' ? parentNode.layer : fallbackUiLayer;
            let count = 0;
            // 待加载的图片：{ sprite 组件, SpriteFrame uuid }
            const pendingSprites = [];
            // 待加载的遮罩图：{ mask 组件, SpriteFrame uuid }
            const pendingMasks = [];
            // 待就绪替换的品红占位：图已落盘但子资源未就绪，先挂品红占位，记录节点 uuid + 加载参数，
            // 由 main 后台轮询就绪后调 replaceImagePlaceholders 按 nodeUuid 定位替换成真图。
            const unresolvedPlaceholders = [];
            // 待加载的字体：{ label 组件, Font uuid }（阶段 5 字体样式库）
            const pendingFonts = [];
            // 字体/模板完成后再建立持久化 companion，确保主/影两层使用同一工程字体。
            const pendingRichTextShadows = [];
            // Input 的原生 placeholder/text Label 要等 authored 文本完成异步字体/模板加载后再同步一次。
            const pendingInputLabelStyles = [];
            // 待套用的字体样式模板：从美术手配的 prefab 克隆外观到导入 Label（环4 整组件克隆的 Cocos 版）。
            const pendingTemplates = [];
            const textStyleSignatures = new Set();
            let labelsWithTextStyleName = 0;
            let solidFills = 0;
            let richTexts = 0;
            let buttons = 0;
            let editBoxes = 0;
            let textStyleTemplateLabels = 0;
            let gradientTextFallbacks = 0;
            let richTextShadows = 0;
            let richTextShadowBlurFallbacks = 0;
            let templatesApplied = 0;
            let overlayTints = 0;
            let transparentRectangles = 0;
            let missingImages = 0;
            let croppedImageFills = 0;
            let mappedPrefabs = 0;
            let unmappedComponents = 0;
            let brokenComponentMappings = 0;
            let failedPrefabInstances = 0;
            let componentStatesAttached = 0;
            let componentStateUnavailable = 0;
            let componentStateUnavailableWarned = false;
            // All componentKey nodes use one editor-facade pass. Mapped Prefab
            // roots carry requiresPrefabOverride=true; ordinary fallback nodes
            // use the same persisted component path without that extra check.
            const pendingComponentStates = [];
            // 导入根节点（供导入后主动刷新编辑器用）
            let importedRoot = null;
            // Input 协议通过 Figma id 指向 authored 直接子节点；映射仅在本轮建树期间使用。
            const figmaIdToNode = new Map();
            const prefabCache = {};
            const mappedPrefabUuids = Array.from(new Set(componentMappings.map((entry) => String(entry && entry.prefabUuid || '')).filter(Boolean)));
            await Promise.all(mappedPrefabUuids.map(async (uuid) => {
                try {
                    prefabCache[uuid] = await loadPrefabAsset(assetManager, uuid) || null;
                }
                catch (err) {
                    prefabCache[uuid] = null;
                    console.warn('[figma-importer:scene] 组件映射 Prefab 加载失败，将回退展开：', uuid, (err === null || err === void 0 ? void 0 : err.message) || err);
                }
            }));
            const recordStateResult = (result) => {
                if (result === 'attached') {
                    componentStatesAttached++;
                    return;
                }
                componentStateUnavailable++;
                if (!componentStateUnavailableWarned) {
                    componentStateUnavailableWarned = true;
                    console.warn(`[figma-importer:scene] ${FIGMA_COMPONENT_STATE_CLASS} 尚未就绪；` +
                        '组件节点仍会完成，但本次实例不含 Figma 状态。');
                }
            };
            // Unity 的文字样式会整体复制 TMP 与额外样式组件。Cocos 在递归建树前加载 Exact 模板，
            // 随后直接克隆文字叶节点，才能让材质、自定义脚本及组件引用一起保留下来。
            const exactTextTemplateRoots = {};
            await Promise.all(collectExactTextStyleTemplateUuids(data.root).map(async (uuid) => {
                try {
                    const prefab = await loadPrefabAsset(assetManager, uuid);
                    exactTextTemplateRoots[uuid] = prefab ? instantiate(prefab) : null;
                }
                catch (err) {
                    exactTextTemplateRoots[uuid] = null;
                    console.warn('[figma-importer:scene] Exact 文字模板 Prefab 加载失败，改走数值降级:', uuid, (err === null || err === void 0 ? void 0 : err.message) || err);
                }
            }));
            /** @zh 绝对定位：按节点锚点应用 Figma→Cocos 坐标公式。 */
            const placeAbsolute = (node, figmaNode, w, h, parentW, parentH, mountedLayoutMode, anchorX = 0.5, anchorY = 0.5) => {
                const pos = positionForTransformedAnchor(figmaNode.x, figmaNode.y, w, h, parentW, parentH, anchorX, anchorY, typeof figmaNode.scaleX === 'number' ? figmaNode.scaleX : 1, typeof figmaNode.scaleY === 'number' ? figmaNode.scaleY : 1, Number(figmaNode.rotation) || 0);
                const initialPosition = positionBeforeMountedLayout(pos, mountedLayoutMode);
                node.setPosition(new Vec3(initialPosition.x, initialPosition.y, 0));
                node.angle = -(figmaNode.rotation || 0);
                node.setScale(new Vec3(typeof figmaNode.scaleX === 'number' ? figmaNode.scaleX : 1, typeof figmaNode.scaleY === 'number' ? figmaNode.scaleY : 1, 1));
            };
            /**
             * @zh 自动布局 → cc.Layout（端口 Unity SetupLayout 2111 + MapLayoutAlignment 2190）。
             *     resizeMode=NONE：只按 spacing/padding/方向排列子节点位置，不改子节点尺寸
             *     （对齐 Unity childControl / childForceExpand / childScale 全 false）。
             *     Figma native GRID and regular Wrap both map to cc.Layout.GRID;
             *     irregular/sparse layouts are filtered by shouldMountLayout.
             */
            const applyLayout = (node, figmaNode) => {
                const layout = node.addComponent(Layout);
                layout.resizeMode = Layout.ResizeMode.NONE;
                layout.affectedByScale = false;
                const pad = figmaNode.padding || {};
                layout.paddingLeft = Math.round(pad.left || 0);
                layout.paddingRight = Math.round(pad.right || 0);
                layout.paddingTop = Math.round(pad.top || 0);
                layout.paddingBottom = Math.round(pad.bottom || 0);
                // Cocos has a native GRID layout. Prefer Figma native GRID
                // tracks, then regular Wrap geometry; unsafe layouts are filtered
                // out by shouldMountLayout and retain absolute positioning.
                const grid = (0, layout_plan_1.inferNativeGridLayout)(figmaNode) || (0, layout_plan_1.inferWrapGridLayout)(figmaNode);
                if (grid) {
                    layout.type = Layout.Type.GRID;
                    layout.startAxis = grid.startAxis === 'HORIZONTAL'
                        ? Layout.AxisDirection.HORIZONTAL
                        : Layout.AxisDirection.VERTICAL;
                    layout.constraint = grid.constraint === 'FIXED_COL'
                        ? Layout.Constraint.FIXED_COL
                        : Layout.Constraint.FIXED_ROW;
                    layout.constraintNum = grid.constraintNum;
                    layout.cellSize = new Size(grid.cellWidth, grid.cellHeight);
                    layout.spacingX = grid.spacingX;
                    layout.spacingY = grid.spacingY;
                    layout.horizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
                    layout.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
                    if (layout.updateLayout)
                        layout.updateLayout();
                    return;
                }
                const isVertical = figmaNode.layoutMode === 'VERTICAL';
                // 主轴对齐一律走正向（横 LEFT_TO_RIGHT / 竖 TOP_TO_BOTTOM），靠端不反序：
                // cc.Layout 的 RIGHT_TO_LEFT/BOTTOM_TO_TOP 会把 children[0] 摆到末端 → 视觉顺序反转
                // （见引擎 _doLayoutHorizontally sign=-1）。Figma MAX 语义是「整块靠端、顺序不变」，
                // 对齐 Unity childAlignment，故用前导 padding 把内容块推到末端来模拟。
                layout.horizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
                layout.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
                layout.type = isVertical ? Layout.Type.VERTICAL : Layout.Type.HORIZONTAL;
                // 只统计参与布局的可见子节点（隐藏节点 active=false，被引擎 _usefulLayoutObj 排除）
                const kids = (figmaNode.children || []).filter((c) => c && c.visible !== false);
                const n = kids.length;
                const containerMain = isVertical ? (figmaNode.height || 0) : (figmaNode.width || 0);
                let sumChild = 0;
                for (const c of kids)
                    sumChild += (isVertical ? (c.height || 0) : (c.width || 0));
                const figLead = Math.round((isVertical ? pad.top : pad.left) || 0);
                const figTrail = Math.round((isVertical ? pad.bottom : pad.right) || 0);
                let spacing = figmaNode.itemSpacing || 0;
                let leadPad = figLead;
                const align = figmaNode.primaryAxisAlignItems;
                if (align === 'SPACE_BETWEEN' && n > 1) {
                    spacing = (containerMain - figLead - figTrail - sumChild) / (n - 1);
                }
                else {
                    const contentMain = sumChild + Math.max(0, n - 1) * spacing;
                    if (align === 'CENTER')
                        leadPad = Math.round((containerMain - contentMain) / 2);
                    else if (align === 'MAX')
                        leadPad = Math.round(containerMain - contentMain - figTrail);
                    // MIN（默认）：leadPad 保持 Figma padding
                }
                if (isVertical) {
                    layout.spacingY = spacing;
                    layout.paddingTop = leadPad;
                }
                else {
                    layout.spacingX = spacing;
                    layout.paddingLeft = leadPad;
                }
                if (layout.updateLayout)
                    layout.updateLayout();
            };
            /**
             * @zh 约束 → Widget（端口 SetupStretchRect 827）。margin 用像素、alignMode=ON_WINDOW_RESIZE。
             *     SCALE 近似为两侧拉伸（有损，与 Unity 同款近似）。先摆绝对位置作初值，再挂 Widget。
             */
            const applyConstraintWidget = (node, figmaNode, w, h, parentW, parentH) => {
                placeAbsolute(node, figmaNode, w, h, parentW, parentH);
                const c = figmaNode.constraints || {};
                const x = figmaNode.x, y = figmaNode.y;
                const widget = node.addComponent(Widget);
                widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
                // 水平（Figma x 左原点）
                const hc = c.horizontal;
                if (hc === 'LEFT_RIGHT' || hc === 'SCALE') {
                    widget.isAlignLeft = widget.isAlignRight = true;
                    widget.left = x;
                    widget.right = parentW - (x + w);
                }
                else if (hc === 'RIGHT') {
                    widget.isAlignRight = true;
                    widget.right = parentW - (x + w);
                }
                else if (hc === 'CENTER') {
                    widget.isAlignHorizontalCenter = true;
                    widget.horizontalCenter = (x + w / 2) - parentW / 2;
                }
                else {
                    widget.isAlignLeft = true;
                    widget.left = x;
                }
                // 垂直（Cocos Y 上，top/bottom 是到父上/下边距离）
                const vc = c.vertical;
                if (vc === 'TOP_BOTTOM' || vc === 'SCALE') {
                    widget.isAlignTop = widget.isAlignBottom = true;
                    widget.top = y;
                    widget.bottom = parentH - (y + h);
                }
                else if (vc === 'BOTTOM') {
                    widget.isAlignBottom = true;
                    widget.bottom = parentH - (y + h);
                }
                else if (vc === 'CENTER') {
                    widget.isAlignVerticalCenter = true;
                    widget.verticalCenter = parentH / 2 - (y + h / 2);
                }
                else {
                    widget.isAlignTop = true;
                    widget.top = y;
                }
                if (widget.updateAlignment)
                    widget.updateAlignment();
            };
            const buildNode = (figmaNode, ccParent, parentNode, parentW, parentH, parentEffLayout, isRoot, parentMountedLayout) => {
                // 定位前先跑溢出裁剪（原地修 w/h，对齐 Unity 334）
                const fillsParent = isFillParent(figmaNode, parentNode);
                const ignore = shouldIgnoreLayout(figmaNode, parentEffLayout, parentNode);
                if (!isRoot && parentNode) {
                    clampOverflowToParent(figmaNode, parentNode, fillsParent, parentEffLayout, ignore);
                }
                const w = figmaNode.width || 0;
                const h = figmaNode.height || 0;
                const parentMountedLayoutMode = parentMountedLayout && parentNode
                    ? ((parentNode.layoutMode === 'GRID' || parentNode.layoutWrap === 'WRAP')
                        ? 'GRID'
                        : String(parentNode.layoutMode || ''))
                    : '';
                const componentKey = String(figmaNode.componentKey || '');
                if (componentKey) {
                    const resolution = (0, component_mapping_1.resolveComponentMapping)(componentKey, figmaNode.componentProperties, componentMappings, (entry) => !!(entry.prefabUuid && prefabCache[entry.prefabUuid]));
                    if (resolution.status === 'mapped' && resolution.entry) {
                        let mappedNode = null;
                        try {
                            const node = instantiate(prefabCache[resolution.entry.prefabUuid]);
                            mappedNode = node;
                            if (!node)
                                throw new Error('instantiate returned no node');
                            // Keep the Prefab inactive until main adds FigmaComponentState through
                            // Creator's editor facade. Direct node.addComponent is not a persisted
                            // Prefab override and disappears after save + reload.
                            node.active = false;
                            node.name = sanitizeCocosNodeName(figmaNode.name, node.name);
                            node.layer = typeof ccParent.layer === 'number' ? ccParent.layer : importedLayer;
                            ccParent.addChild(node);
                            let ui = node.getComponent && node.getComponent(UITransform);
                            if (!ui) {
                                ui = node.addComponent(UITransform);
                                ui.setContentSize(w, h);
                            }
                            // 对齐 Unity PlacePrefabInstanceKeepingSize：Prefab 根尺寸属于项目资产，
                            // 导入器只把它的中心对齐 Figma 外框中心，不能用设计框强改内部布局。
                            ui.setAnchorPoint(0.5, 0.5);
                            placeAbsolute(node, figmaNode, w, h, parentW, parentH, parentMountedLayoutMode);
                            if (typeof figmaNode.opacity === 'number' && figmaNode.opacity < 1) {
                                const opacity = Math.max(0, Math.min(255, Math.round(figmaNode.opacity * 255)));
                                const opacityComponent = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
                                opacityComponent.opacity = opacity;
                            }
                            if (componentStateRuntimeAvailable) {
                                const request = buildMappedComponentStateRequest(node, figmaNode);
                                if (request)
                                    pendingComponentStates.push(request);
                                else
                                    recordStateResult('unavailable');
                            }
                            else {
                                node.active = figmaNode.visible !== false;
                                recordStateResult('unavailable');
                            }
                            count++;
                            if (figmaNode.figmaId)
                                figmaIdToNode.set(String(figmaNode.figmaId), node);
                            mappedPrefabs++;
                            if (isRoot)
                                importedRoot = node;
                            return;
                        }
                        catch (err) {
                            discardFailedMappedNode(mappedNode);
                            failedPrefabInstances++;
                            console.warn(`[figma-importer:scene] 组件「${figmaNode.name || componentKey}」` +
                                `(key=${componentKey}) Prefab 映射实例处理失败，回退展开散节点：`, (err === null || err === void 0 ? void 0 : err.message) || err);
                        }
                    }
                    else if (resolution.status === 'broken') {
                        brokenComponentMappings++;
                        console.warn(`[figma-importer:scene] 组件「${figmaNode.name || componentKey}」` +
                            `(key=${componentKey}) 已配置映射但 Prefab 断链，回退展开散节点。`);
                    }
                    else {
                        unmappedComponents++;
                    }
                }
                const isTextNode = String(figmaNode.type || '').toUpperCase() === 'TEXT';
                const templateUuid = String(figmaNode.textStyleTemplate && figmaNode.textStyleTemplate.prefabUuid || '');
                const exactTextTemplateClone = isTextNode
                    ? cloneExactTextStyleTemplateNode(figmaNode, exactTextTemplateRoots[templateUuid], cc)
                    : null;
                const safeNodeName = sanitizeCocosNodeName(figmaNode.name, figmaNode.type || 'Node');
                const node = exactTextTemplateClone || new Node(safeNodeName);
                if (componentKey)
                    node.active = false;
                node.name = safeNodeName;
                node.layer = typeof ccParent.layer === 'number' ? ccParent.layer : importedLayer;
                const ui = node.getComponent(UITransform) || node.addComponent(UITransform);
                ui.setContentSize(w, h);
                const textAnchorX = isTextNode ? textAnchorXForAlign(figmaNode.textAlignHorizontal) : 0.5;
                ui.setAnchorPoint(textAnchorX, 0.5);
                ccParent.addChild(node);
                // State components are created by main through Creator's
                // scene/create-component facade after the node is in-scene.
                // Direct addComponent here would be runtime-only for prefab
                // instances and would also make ordinary paths diverge.
                let stateQueued = false;
                if (componentKey) {
                    node.active = false;
                    if (componentStateRuntimeAvailable) {
                        const request = buildComponentStateRequest(node, figmaNode, false);
                        if (request) {
                            pendingComponentStates.push(request);
                            stateQueued = true;
                        }
                        else {
                            recordStateResult('unavailable');
                        }
                    }
                    else {
                        recordStateResult('unavailable');
                    }
                }
                if (!stateQueued)
                    node.active = exactTextTemplateClone ? false : figmaNode.visible !== false;
                const templateOpacity = node.getComponent && node.getComponent(UIOpacity);
                if (typeof figmaNode.opacity === 'number' && figmaNode.opacity < 1) {
                    const opacity = Math.max(0, Math.min(255, Math.round(figmaNode.opacity * 255)));
                    (templateOpacity || node.addComponent(UIOpacity)).opacity = opacity;
                }
                else if (templateOpacity) {
                    templateOpacity.opacity = 255;
                }
                count++;
                if (figmaNode.figmaId)
                    figmaIdToNode.set(String(figmaNode.figmaId), node);
                if (exactTextTemplateClone)
                    templatesApplied++;
                if (isRoot)
                    importedRoot = node;
                // ── 定位 ──
                // 先按 Figma 坐标初始化；普通横/竖 Layout 随后覆盖主轴并保留跨轴，
                // Grid 则覆盖两轴。这样不牺牲 Figma 的 counter-axis 对齐。
                placeAbsolute(node, figmaNode, w, h, parentW, parentH, parentMountedLayoutMode, textAnchorX, 0.5);
                // 有图片引用 → 挂 Sprite，记下待加载。
                // clipsContent + 有可视图形时，图形要下沉到背景子节点（见 resolveVisualHost），
                // 否则 Mask.GRAPHICS_RECT 的 Graphics 会与 Sprite/Graphics 在 node 上冲突。
                const visualHost = resolveVisualHost(node, figmaNode, w, h, cc);
                const imgRef = figmaNode.imageRef;
                let hasVisibleGraphic = false;
                if (imgRef && idToSpriteFrame[imgRef]) {
                    const sprite = visualHost.addComponent(Sprite);
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    const slice9Border = readSlice9Border(figmaNode);
                    configureSpriteType(sprite, figmaNode, slice9Border, Sprite);
                    sprite.trim = false;
                    if (applyImageColor(sprite, figmaNode.imageFill, figmaNode.overlayTint, Color))
                        overlayTints++;
                    applyTileScaling(sprite, figmaNode.imageFill);
                    hasVisibleGraphic = true;
                    pendingSprites.push({
                        host: visualHost,
                        sprite,
                        imgRef,
                        uuid: idToSpriteFrame[imgRef],
                        slice9Border,
                        imageFill: figmaNode.imageFill,
                        overlayTint: figmaNode.overlayTint,
                        width: w,
                        height: h,
                    });
                }
                else if (imgRef && unresolved[imgRef]) {
                    // 图已落盘/复用成功但 SpriteFrame 子资源尚未就绪：先挂品红占位（同缺图外观），
                    // 记录 visualHost 的 uuid + 加载参数，交 main 后台就绪后按 uuid 定位替换成真图。
                    const placeholderSprite = mountMissingImagePlaceholder(visualHost, w, h, cc);
                    if (applyImageColor(placeholderSprite, figmaNode.imageFill, figmaNode.overlayTint, Color))
                        overlayTints++;
                    hasVisibleGraphic = true;
                    unresolvedPlaceholders.push({
                        nodeUuid: visualHost.uuid,
                        imgRef,
                        dbUrl: unresolved[imgRef],
                        kind: 'sprite',
                        slice9Border: readSlice9Border(figmaNode),
                        imageFill: figmaNode.imageFill,
                        overlayTint: figmaNode.overlayTint,
                        width: w,
                        height: h,
                    });
                }
                else if (imgRef) {
                    // 声明了图但没匹配到 SpriteFrame（未落盘/未复用成功）：挂空 Sprite + 品红占位框，
                    // 供美术手动补图，避免只剩空 UITransform 节点（同事反馈「没识别到的图挂代图」）。
                    mountMissingImagePlaceholder(visualHost, w, h, cc);
                    hasVisibleGraphic = true;
                    missingImages++;
                }
                else if (figmaNode.type !== 'TEXT' && applySolidFill(visualHost, figmaNode, w, h, Graphics, Color)) {
                    solidFills++;
                    hasVisibleGraphic = true;
                }
                else if (applyTransparentRectangleFallback(visualHost, figmaNode, w, h, Graphics, Color)) {
                    transparentRectangles++;
                }
                if (setupButton(node, figmaNode, Button, hasVisibleGraphic)) {
                    buttons++;
                }
                // 文本节点 → 挂 Label
                if (figmaNode.type === 'TEXT') {
                    const useRichText = hasMixedTextSegments(figmaNode) && RichText;
                    const richTextMount = useRichText
                        ? mountFtocRichTextRenderer(node, figmaNode, w, h, cc)
                        : null;
                    const label = richTextMount ? richTextMount.richText : (node.getComponent(Label) || node.addComponent(Label));
                    const characters = typeof figmaNode.characters === 'string' ? figmaNode.characters : '';
                    label.string = useRichText
                        ? buildRichTextString(characters, figmaNode)
                        : applyTextCase(characters, figmaNode.textCase);
                    if (figmaNode.fontSize)
                        label.fontSize = figmaNode.fontSize;
                    label.lineHeight = figmaNode.lineHeight > 0 ? figmaNode.lineHeight : (figmaNode.fontSize || label.fontSize);
                    label.horizontalAlign = mapHAlign(Label, figmaNode.textAlignHorizontal);
                    label.verticalAlign = mapVAlign(Label, figmaNode.textAlignVertical);
                    if (useRichText) {
                        label.maxWidth = richTextMount ? richTextMount.plan.maxWidth : 0;
                        richTexts++;
                    }
                    else {
                        applyTextSizing(Label, label, figmaNode);
                        if (!exactTextTemplateClone)
                            applyFontStyle(label, figmaNode);
                        applyTextDecoration(label, figmaNode);
                    }
                    if (!useRichText)
                        applyAuthoredLetterSpacing(label, figmaNode);
                    if (figmaNode.color && !(exactTextTemplateClone && figmaNode.textGradient)) {
                        const c = figmaNode.color;
                        if (useRichText)
                            label.fontColor = new Color(c.r, c.g, c.b, c.a);
                        else
                            label.color = new Color(c.r, c.g, c.b, c.a);
                    }
                    if (figmaNode.textGradient && !exactTextTemplateClone) {
                        gradientTextFallbacks++;
                    }
                    if (figmaNode.textStyle) {
                        if (figmaNode.textStyle.figmaSignature)
                            textStyleSignatures.add(figmaNode.textStyle.figmaSignature);
                        if (figmaNode.textStyle.textStyleName)
                            labelsWithTextStyleName++;
                    }
                    if (figmaNode.textStyleTemplate)
                        textStyleTemplateLabels++;
                    const fs = figmaNode.fontSize || 0;
                    // A positive Figma height is authored geometry, even when it is
                    // smaller than the font size. Only synthesize a box when height is absent.
                    if (fs > 0 && h <= 0) {
                        ui.setContentSize(w, fs * 1.5);
                    }
                    // 环4：命中样式库且有美术手配的模板 prefab 时，克隆模板外观（字体/描边/投影/材质）过来。
                    // 只覆盖外观，保留导入节点自己的 string/字号/颜色/对齐/尺寸。走克隆路径就跳过下面的程序化派生。
                    const tpl = figmaNode.textStyleTemplate;
                    const templatePath = resolveTextStyleTemplatePath(tpl);
                    const hasTemplate = !!(tpl && tpl.prefabUuid && templatePath);
                    const exactTemplate = hasTemplate && String(tpl.tier || '').trim().toUpperCase() === 'EXACT';
                    const useTemplate = !useRichText && exactTemplate && !!exactTextTemplateClone;
                    const richTextFont = useRichText ? resolveRichTextFontReference(figmaNode, tpl) : null;
                    if (useRichText && (hasTemplate || (richTextFont && richTextFont.uuid))) {
                        pendingTemplates.push({
                            target: label,
                            prefabUuid: hasTemplate ? String(tpl.prefabUuid) : '',
                            figmaPath: hasTemplate ? templatePath : '',
                            tier: hasTemplate ? String(tpl.tier || '') : '',
                            fontOnly: true,
                            resolverFontUuid: richTextFont ? richTextFont.uuid : '',
                            resolverFontFileName: richTextFont ? richTextFont.fileName : '',
                        });
                    }
                    // ── 字体样式库：描边 / 投影 / 字体（无模板 prefab 时从 Figma 数值直接派生，零美术配置）──
                    // 描边 → Label 自带 enableOutline/outlineColor/outlineWidth（不要用已 deprecated 的 LabelOutline 组件）。
                    if (!useTemplate && !useRichText && figmaNode.stroke) {
                        const st = figmaNode.stroke;
                        label.enableOutline = true;
                        label.outlineColor = new Color(st.color.r, st.color.g, st.color.b, st.color.a);
                        label.outlineWidth = st.width || 1;
                    }
                    // 投影 → Label 自带 enableShadow/shadowColor/shadowOffset/shadowBlur。
                    // Figma Y 向下为正、Cocos Y 向上为正 → offsetY 翻符号。
                    if (!useTemplate && !useRichText && figmaNode.shadow) {
                        const sh = figmaNode.shadow;
                        label.enableShadow = true;
                        label.shadowColor = new Color(sh.color.r, sh.color.g, sh.color.b, sh.color.a);
                        label.shadowOffset = new Vec2(sh.offsetX || 0, -(sh.offsetY || 0));
                        label.shadowBlur = sh.blur || 0;
                    }
                    // 字体 → 命中工程字体资源就异步加载后设 label.font；未命中回退默认字体。
                    // 走模板克隆时字体由模板带来，这里不再单独加载。
                    if (!useTemplate && !useRichText && figmaNode.fontUuid) {
                        pendingFonts.push({
                            target: label,
                            uuid: figmaNode.fontUuid,
                            fileName: figmaNode.fontFileName || '',
                            fallbackBold: wantsBold(String(figmaNode.fontWeight || '')),
                            rich: !!useRichText,
                        });
                    }
                    // 渐变文字：保留 textGradient 语义并暂用单色 fallback；不生成文字 PNG。
                    if (richTextMount) {
                        richTextMount.node.active = true;
                        pendingRichTextShadows.push({ authoredNode: node, target: richTextMount.richText, figmaNode });
                    }
                }
                // ── 裁剪 / 遮罩 ──
                // clipsContent → 矩形 Mask（端口 617，等价 RectMask2D）
                if (figmaNode.clipsContent && !figmaNode.mask) {
                    const m = node.addComponent(Mask);
                    m.type = Mask.Type.GRAPHICS_RECT;
                }
                // 图片遮罩（端口 SetupImageMask 659）——本稿 0 样本，写好但未验证；失败回退不丢子节点
                let childParent = node;
                let maskOffX = 0, maskOffY = 0;
                const mask = figmaNode.mask;
                const maskSpriteUuid = mask && mask.maskRef ? (idToMaskSpriteFrame[mask.maskRef] || idToSpriteFrame[mask.maskRef]) : '';
                let maskFallsBackToRect = false;
                if (mask && mask.maskRef) {
                    const wantsImageMask = mask.useImageMask !== false;
                    maskFallsBackToRect = !wantsImageMask || !maskSpriteUuid;
                }
                if (mask && mask.maskRef && maskSpriteUuid && mask.useImageMask !== false) {
                    try {
                        const maskNode = new Node(`${sanitizeCocosNodeName(mask.name || figmaNode.name, 'Mask')}_Mask`);
                        maskNode.layer = node.layer;
                        const mui = maskNode.addComponent(UITransform);
                        mui.setContentSize(mask.width || w, mask.height || h);
                        mui.setAnchorPoint(0.5, 0.5);
                        node.addChild(maskNode);
                        // 遮罩矩形在父(=node)局部的位置
                        placeAbsolute(maskNode, { x: mask.x, y: mask.y, rotation: mask.rotation || 0 }, mask.width || w, mask.height || h, w, h);
                        const mComp = maskNode.addComponent(Mask);
                        mComp.type = Mask.Type.SPRITE_STENCIL;
                        const stencilSprite = maskNode.getComponent(Sprite) || maskNode.addComponent(Sprite);
                        if (stencilSprite) {
                            stencilSprite.enabled = true;
                            stencilSprite.sizeMode = Sprite.SizeMode.CUSTOM;
                            stencilSprite.trim = false;
                            stencilSprite.color = new Color(255, 255, 255, 255);
                        }
                        pendingMasks.push({ sprite: stencilSprite, uuid: maskSpriteUuid });
                        childParent = maskNode;
                        maskOffX = mask.x || 0;
                        maskOffY = mask.y || 0;
                    }
                    catch (e) {
                        // 回退：图片遮罩失败，子节点仍挂原节点，至少不丢
                        childParent = node;
                        maskOffX = maskOffY = 0;
                        maskFallsBackToRect = true;
                    }
                }
                if (maskFallsBackToRect && !node.getComponent(Mask)) {
                    const m = node.addComponent(Mask);
                    m.type = Mask.Type.GRAPHICS_RECT;
                    if (mask && mask.fallbackReason === 'degenerate') {
                        console.warn(`[figma-importer:scene] 节点「${figmaNode.name}」的图片遮罩近乎空白，已退回矩形裁剪。`);
                    }
                }
                // 递归子节点
                const thisEffLayout = effectiveHasLayout(figmaNode);
                // 是否给本节点挂 cc.Layout：Unity EffectiveHasLayout + 非 Wrap + 纯净容器。
                // 遮罩场景（childParent !== node）子节点挂在遮罩节点下，不挂 Layout。
                const mountLayout = childParent === node && shouldMountLayout(figmaNode);
                const children = figmaNode.children || [];
                // 挂到遮罩节点下时，子节点参照系是遮罩矩形：坐标重基 + 用遮罩尺寸当 parentW/H
                const cw = childParent === node ? w : (mask.width || w);
                const ch = childParent === node ? h : (mask.height || h);
                for (const child of children) {
                    if (childParent !== node) {
                        child.x = (child.x || 0) - maskOffX;
                        child.y = (child.y || 0) - maskOffY;
                    }
                    buildNode(child, childParent, figmaNode, cw, ch, thisEffLayout, false, mountLayout);
                }
                // 子节点建完后挂 Layout（cc.Layout 需能看到全部子节点才能正确排布）
                if (mountLayout)
                    applyLayout(node, figmaNode);
                const inputSpec = normalizeFigmaInputSpec(figmaNode);
                if (inputSpec) {
                    const inputMount = mountFtocInputEditBox(node, figmaNode, figmaIdToNode.get(inputSpec.textNodeId), cc);
                    if (inputMount.applied) {
                        editBoxes++;
                        pendingInputLabelStyles.push({
                            source: inputMount.authoredLabel,
                            target: inputMount.placeholderLabel,
                        });
                        pendingInputLabelStyles.push({
                            source: inputMount.authoredLabel,
                            target: inputMount.textLabel,
                        });
                    }
                    else
                        console.warn(`[figma-importer:scene] 输入框「${figmaNode.name || figmaNode.figmaId || ''}」未挂载:`, inputMount.reason);
                }
                if (shouldFinalizeExactTextStyleTemplateNode(exactTextTemplateClone, stateQueued)) {
                    finalizeExactTextStyleTemplateNode(node, figmaNode.visible);
                }
            };
            buildNode(data.root, parentNode, null, canvasW, canvasH, false, true, false);
            if (importedRoot && data.rootCanvasAbsolute) {
                const rootUi = importedRoot.getComponent && importedRoot.getComponent(UITransform);
                if (rootUi) {
                    const absRoot = Object.assign(Object.assign({}, data.root), { x: Number(data.rootCanvasAbsolute.x) || 0, y: Number(data.rootCanvasAbsolute.y) || 0 });
                    applyPatchTransform(importedRoot, rootUi, absRoot, data.canvas || data.root, Vec3, true, UITransform, find);
                }
            }
            if (importedRoot && requestedSiblingIndex >= 0 && typeof importedRoot.setSiblingIndex === 'function') {
                importedRoot.setSiblingIndex(requestedSiblingIndex);
            }
            // 异步批量加载 SpriteFrame 并设置
            let loaded = 0;
            let slicedLoaded = 0;
            let imageFillSprites = 0;
            // 带重试的 loadAny：刚 reimport 的资源可能未就绪,拿空则轮询等待(时序竞态高频坑,见 memory)。
            const loadAnyRetry = (uuid, tries = 10, delayMs = 100, ready) => new Promise((resolve) => {
                const attempt = (left) => {
                    assetManager.loadAny({ uuid }, (err, asset) => {
                        if (!err && asset && (!ready || ready(asset))) {
                            resolve(asset);
                            return;
                        }
                        if (left <= 0) {
                            resolve(null);
                            return;
                        }
                        setTimeout(() => attempt(left - 1), delayMs);
                    });
                };
                attempt(tries);
            });
            await Promise.all(pendingSprites.map((pending) => (async () => {
                const { sprite, uuid, slice9Border, imageFill, width, height } = pending;
                const spriteFrame = await loadAnyRetry(uuid, 30, 100, slice9Border ? isSpriteFrameTextureReady : undefined);
                if (spriteFrame && sprite) {
                    let finalFrame = spriteFrame;
                    if (slice9Border) {
                        finalFrame = applySlice9Border(spriteFrame, slice9Border, Rect, Size, Vec2);
                    }
                    else {
                        const adapted = adaptImageFillSpriteFrame(spriteFrame, imageFill, width, height, Rect, Size, Vec2);
                        finalFrame = adapted.frame;
                        if (adapted.cropped)
                            croppedImageFills++;
                        if (imageFill && String(imageFill.source || '').toUpperCase() === 'FILL')
                            imageFillSprites++;
                    }
                    sprite.spriteFrame = finalFrame;
                    // 设图后触发渲染标脏,避免"建完空白、拖一下才显示"(时序竞态余波)。
                    if (typeof sprite.markForUpdateRenderData === 'function')
                        sprite.markForUpdateRenderData(true);
                    loaded++;
                    if (slice9Border)
                        slicedLoaded++;
                }
                else if (sprite && pending.host) {
                    trackFailedSpriteLoad(pending, unresolvedPlaceholders, cc);
                    console.warn('[figma-importer:scene] SpriteFrame uuid 已存在但场景加载超时，保留品红并转入后续替换:', uuid, pending.imgRef);
                }
            })()));
            // 异步加载遮罩 SpriteFrame（SPRITE_STENCIL）
            await Promise.all(pendingMasks.map(({ sprite, uuid }) => (async () => {
                const spriteFrame = await loadAnyRetry(uuid);
                if (spriteFrame && sprite) {
                    sprite.spriteFrame = spriteFrame;
                    if (typeof sprite.markForUpdateRenderData === 'function')
                        sprite.markForUpdateRenderData(true);
                }
            })));
            // 异步加载字体（cc.Font）并设到 Label（阶段 5 字体样式库）
            let fontsLoaded = 0;
            await Promise.all(pendingFonts.map(({ target, uuid, fileName, fallbackBold, rich }) => (async () => {
                const font = await loadAnyRetry(uuid);
                if (font && (!Font || font instanceof Font)) {
                    target.font = font;
                    target.useSystemFont = false;
                    fontsLoaded++;
                }
                else if (font) {
                    if (!rich)
                        target.isBold = fallbackBold;
                    target.useSystemFont = true;
                    console.warn('[figma-importer:scene] 字体 uuid 加载结果不是 cc.Font，已回退系统字体:', uuid, fileName, font.constructor && font.constructor.name);
                }
                else {
                    if (!rich)
                        target.isBold = fallbackBold;
                    target.useSystemFont = true;
                    console.warn('[figma-importer:scene] 字体 uuid 加载失败或未就绪，已回退系统字体:', uuid, fileName);
                }
            })));
            // 环4：套用美术手配的字体样式模板——从 prefab 克隆模板 Label 的外观到导入 Label。
            if (pendingTemplates.length > 0) {
                const prefabCache = {};
                const rootCache = {};
                const loadPrefabCached = async (uuid) => {
                    if (prefabCache[uuid] !== undefined)
                        return prefabCache[uuid];
                    try {
                        const asset = await loadPrefabAsset(assetManager, uuid);
                        prefabCache[uuid] = asset || null;
                    }
                    catch (e) {
                        prefabCache[uuid] = null;
                        console.warn('[figma-importer:scene] 模板 prefab 加载失败:', uuid, e && e.message || e);
                    }
                    return prefabCache[uuid];
                };
                for (const t of pendingTemplates) {
                    let tplLabel = null;
                    if (t.prefabUuid) {
                        const prefab = await loadPrefabCached(t.prefabUuid);
                        if (prefab) {
                            // 每个 prefab 只 instantiate 一次，复用其节点树取模板 Label。
                            let rootNode = rootCache[t.prefabUuid];
                            if (rootNode === undefined) {
                                try {
                                    rootNode = instantiate(prefab);
                                }
                                catch (e) {
                                    rootNode = null;
                                    console.warn('[figma-importer:scene] 模板 prefab 实例化失败:', t.prefabUuid, e && e.message || e);
                                }
                                rootCache[t.prefabUuid] = rootNode;
                            }
                            const tplNode = rootNode && getNodeByPath(rootNode, t.figmaPath);
                            tplLabel = tplNode && tplNode.getComponent ? tplNode.getComponent(Label) : null;
                        }
                    }
                    if (t.fontOnly) {
                        const source = await applyRichTextFont(t.target, tplLabel, t.resolverFontUuid, loadAnyRetry, Font);
                        if (source === 'template')
                            templatesApplied++;
                        else if (source === 'resolver')
                            fontsLoaded++;
                        else {
                            console.warn('[figma-importer:scene] RichText 字体模板和 resolver 均未命中，已回退系统字体:', t.resolverFontUuid, t.resolverFontFileName);
                        }
                        continue;
                    }
                    if (!tplLabel) {
                        console.warn('[figma-importer:scene] 模板节点/Label 未找到:', t.figmaPath);
                        continue;
                    }
                    if (copyLabelAppearance(tplLabel, t.target, Font))
                        templatesApplied++;
                }
                // 清理临时实例化的模板树。
                for (const uuid of Object.keys(rootCache)) {
                    const rn = rootCache[uuid];
                    if (rn && typeof rn.destroy === 'function')
                        rn.destroy();
                }
            }
            for (const pending of pendingInputLabelStyles) {
                // TextStyle/template resolution can re-enable the authored
                // Label after mount. Final synchronization owns the rendering
                // boundary: authored stays inspectable, native children draw.
                syncInputNativeLabelStyle(pending.source, pending.target);
            }
            for (const uuid of Object.keys(exactTextTemplateRoots)) {
                const rootNode = exactTextTemplateRoots[uuid];
                if (rootNode && typeof rootNode.destroy === 'function')
                    rootNode.destroy();
            }
            for (const pending of pendingRichTextShadows) {
                const result = mountFtocRichTextShadow(pending.authoredNode, pending.figmaNode, pending.target, cc);
                if (result.applied)
                    richTextShadows++;
                if (result.blurFallback)
                    richTextShadowBlurFallbacks++;
                if (result.warning)
                    console.warn('[figma-importer:scene]', result.warning);
            }
            return {
                success: true,
                data: {
                    count,
                    sprites: loaded,
                    slicedSprites: slicedLoaded,
                    imageFillSprites,
                    masks: pendingMasks.length,
                    fonts: fontsLoaded,
                    templatesApplied,
                    solidFills,
                    richTexts,
                    buttons,
                    editBoxes,
                    overlayTints,
                    transparentRectangles,
                    missingImages,
                    croppedImageFills,
                    mappedPrefabs,
                    unmappedComponents,
                    brokenComponentMappings,
                    failedPrefabInstances,
                    componentStatesAttached,
                    componentStateUnavailable,
                    pendingComponentStates,
                    // Legacy result key kept for older panel callers; main
                    // prefers pendingComponentStates and finalizes only once.
                    pendingMappedComponentStates: pendingComponentStates,
                    sharedCroppedImages: data.importMeta && data.importMeta.sharedCroppedImages || 0,
                    sharedCroppedSliceChildren: data.importMeta && data.importMeta.sharedCroppedSliceChildren || 0,
                    textStyleSignatures: textStyleSignatures.size,
                    labelsWithTextStyleName,
                    textStyleTemplateLabels,
                    gradientTextFallbacks,
                    richTextShadows,
                    richTextShadowBlurFallbacks,
                    parent: parentNode.name,
                    rootUuid: importedRoot ? importedRoot.uuid : '',
                    // 待就绪替换的品红占位清单：main 后台轮询子资源就绪后据此替换真图。
                    unresolvedPlaceholders,
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @en Replace magenta placeholders with real SpriteFrames once their sub-assets are ready.
     * @zh 把 buildTree 挂的品红占位替换成真图（占位→替换方案的替换端）。
     * main 后台轮询 SpriteFrame 子资源就绪后，把已解析好 uuid 的清单一次性传进来批量替换，
     * 避免每张图一次 IPC 往返。每项：按 nodeUuid 定位节点（视觉宿主）→ 移除 _MissingImg 品红子节点
     * → 在宿主上加/取 Sprite 并加载真 SpriteFrame（复用 buildTree 的 slice9/imageFill 适配）。
     */
    async replaceImagePlaceholders(data) {
        try {
            const cc = require('cc');
            const { director, Sprite, Rect, Size, Vec2, Color, assetManager } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const items = Array.isArray(data && data.items) ? data.items : [];
            let replaced = 0;
            let failed = 0;
            for (const it of items) {
                const nodeUuid = String(it && it.nodeUuid || '');
                const spriteFrameUuid = String(it && it.spriteFrameUuid || '');
                if (!nodeUuid || !spriteFrameUuid) {
                    failed++;
                    continue;
                }
                const host = findNodeByUuid(scene, nodeUuid);
                if (!host) {
                    failed++;
                    continue;
                }
                const slice9Border = it.slice9Border || null;
                const spriteFrame = await loadAssetAny(assetManager, spriteFrameUuid, slice9Border ? 30 : 10, 100, slice9Border ? isSpriteFrameTextureReady : undefined);
                if (!spriteFrame) {
                    failed++;
                    continue;
                }
                // 移除品红占位子节点（mountMissingImagePlaceholder 建的 _MissingImg）
                const ph = host.children && host.children.find((c) => c && c.name === '_MissingImg');
                if (ph)
                    ph.destroy();
                // 宿主上加/取 Sprite（占位分支只 addComponent 了品红 Graphics 子节点，宿主自身无 Sprite）
                const sprite = host.getComponent(Sprite) || host.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.trim = false;
                configureSpriteType(sprite, { imageFill: it.imageFill }, slice9Border, Sprite);
                if (applyImageColor(sprite, it.imageFill, it.overlayTint, Color)) { /* tint applied */ }
                applyTileScaling(sprite, it.imageFill);
                if (slice9Border) {
                    sprite.spriteFrame = applySlice9Border(spriteFrame, slice9Border, Rect, Size, Vec2);
                }
                else {
                    const adapted = adaptImageFillSpriteFrame(spriteFrame, it.imageFill, Number(it.width) || 0, Number(it.height) || 0, Rect, Size, Vec2);
                    sprite.spriteFrame = adapted.frame;
                }
                if (typeof sprite.markForUpdateRenderData === 'function')
                    sprite.markForUpdateRenderData(true);
                replaced++;
            }
            console.log(`[figma-importer:scene] 品红占位替换：${replaced} 成功，${failed} 失败（保留品红）。`);
            return { success: true, data: { replaced, failed } };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @zh beta：捕获单个替换目标的可还原状态。对齐 Unity ResourceReplace 的 row.Snap。
     */
    snapshotReplaceTargetBeta(options) {
        try {
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const uuid = String(options && options.uuid || '');
            if (!uuid)
                return { success: false, error: 'Missing uuid' };
            const node = findNodeByUuid(scene, uuid);
            if (!node || !node.getComponent)
                return { success: false, error: `Node not found: ${uuid}` };
            const snapshot = captureReplaceSnapshot(node, cc);
            return {
                success: true,
                data: {
                    snapshot,
                    summary: {
                        uuid: node.uuid,
                        name: node.name || '',
                        scenePath: snapshot.scenePath,
                        hasSprite: !!snapshot.sprite,
                        hasLabel: !!snapshot.label,
                        hasRichText: !!(snapshot.richText || snapshot.richTextRenderer),
                    },
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @zh beta：把 snapshotReplaceTargetBeta 捕获的状态写回目标节点。
     */
    async restoreReplaceTargetBeta(options) {
        try {
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const snapshot = options && (options.snapshot || options);
            const uuid = String(options && options.uuid || snapshot && snapshot.uuid || '');
            if (!uuid)
                return { success: false, error: 'Missing snapshot uuid' };
            const node = findNodeByUuid(scene, uuid);
            if (!node || !node.getComponent)
                return { success: false, error: `Node not found: ${uuid}` };
            const warnings = await restoreReplaceSnapshot(node, snapshot, cc);
            return {
                success: true,
                data: {
                    targetUuid: node.uuid,
                    targetName: node.name || '',
                    scenePath: buildSceneNodePath(node),
                    warnings,
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @zh beta：在编辑器 Hierarchy 中选中指定替换目标，等价于 Unity ResourceReplace 的“定位”。
     */
    selectReplaceTargetBeta(options) {
        try {
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const uuid = String(options && options.uuid || '');
            if (!uuid)
                return { success: false, error: 'Missing uuid' };
            const node = findNodeByUuid(scene, uuid);
            if (!node)
                return { success: false, error: `Node not found: ${uuid}` };
            selectEditorNode(node);
            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name || '',
                    scenePath: buildSceneNodePath(node),
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @zh beta：读取选中/目标节点的路径、尺寸和组件类型，供 main 侧匹配 Figma JSON 节点。
     */
    describeNodeForReplaceBeta(options) {
        try {
            const cc = require('cc');
            const { director, UITransform, Label, RichText, Sprite } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const uuid = String(options && options.uuid || '');
            if (!uuid)
                return { success: false, error: 'Missing uuid' };
            const node = findNodeByUuid(scene, uuid);
            if (!node)
                return { success: false, error: `Node not found: ${uuid}` };
            const ui = node.getComponent && node.getComponent(UITransform);
            const size = readUiSize(ui);
            const parent = node.parent || null;
            const logicalText = resolveLogicalTextTarget(node, Label, RichText);
            const label = logicalText && logicalText.kind === 'label' ? logicalText.component : null;
            const richText = logicalText && logicalText.kind === 'richText' ? logicalText.component : null;
            const sprite = node.getComponent && Sprite ? node.getComponent(Sprite) : null;
            const hasLabel = !!(label || richText);
            const hasSprite = !!sprite;
            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name || '',
                    scenePath: buildSceneNodePath(node),
                    relativePath: node.name || '',
                    parentName: parent ? parent.name || '' : '',
                    parentUuid: parent ? parent.uuid || '' : '',
                    siblingIndex: typeof node.getSiblingIndex === 'function'
                        ? node.getSiblingIndex()
                        : parent && parent.children ? parent.children.indexOf(node) : -1,
                    width: size.width,
                    height: size.height,
                    hasLabel,
                    hasSprite,
                    hasRichText: !!richText,
                    labelText: hasLabel
                        ? (richText ? richTextToPlain(String(richText.string || '')) : String(label.string || ''))
                        : '',
                    spriteFrameName: sprite && sprite.spriteFrame ? String(sprite.spriteFrame.name || sprite.spriteFrame._name || '') : '',
                    componentType: readComponentName(label || richText || sprite),
                    replaceKind: hasLabel ? 'text' : (hasSprite ? 'image' : 'other'),
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @zh beta：扫描选中/指定实例树里的可替换目标组件。
     *     对齐 Unity ResourceReplaceWindow 的右侧目标列表：Label/RichText 作为文字目标，Sprite 作为图片目标。
     */
    listReplaceTargetsBeta(options = {}) {
        try {
            const cc = require('cc');
            const { director, find, UITransform, Label, RichText, Sprite } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const rootUuid = String(options && options.rootUuid || '');
            const rootName = String(options && options.rootName || '');
            const kind = String(options && options.kind || 'all').toLowerCase();
            let root = rootUuid ? findNodeByUuid(scene, rootUuid) : null;
            if (!root && rootName)
                root = findFirstNodeByName(scene, rootName);
            if (!root)
                root = findDefaultExportRoot(scene, find, UITransform);
            if (!root)
                return { success: false, error: 'No target root found' };
            const includeText = kind === 'all' || kind === 'text' || kind === 'mixed';
            const includeImage = kind === 'all' || kind === 'image' || kind === 'mixed';
            const targets = [];
            const visit = (node) => {
                if (!node || !node.getComponent)
                    return;
                if (isFtocTextHelperNode(node) || isCreatorRichTextRuntimeNode(node))
                    return;
                const ui = UITransform ? node.getComponent(UITransform) : null;
                const size = readUiSize(ui);
                const parent = node.parent || null;
                const logicalText = includeText ? resolveLogicalTextTarget(node, Label, RichText) : null;
                const label = logicalText && logicalText.kind === 'label' ? logicalText.component : null;
                const richText = logicalText && logicalText.kind === 'richText' ? logicalText.component : null;
                const sprite = includeImage && Sprite ? node.getComponent(Sprite) : null;
                const add = (replaceKind, component, extra) => {
                    targets.push(Object.assign({ uuid: node.uuid, name: node.name || '', scenePath: buildSceneNodePath(node), relativePath: buildRelativeNodePath(node, root), parentName: parent ? parent.name || '' : '', parentUuid: parent ? parent.uuid || '' : '', siblingIndex: typeof node.getSiblingIndex === 'function'
                            ? node.getSiblingIndex()
                            : parent && parent.children ? parent.children.indexOf(node) : -1, width: size.width, height: size.height, hasLabel: replaceKind === 'text', hasSprite: replaceKind === 'image', hasRichText: !!richText, componentType: readComponentName(component), replaceKind }, extra));
                };
                if (label || richText) {
                    add('text', label || richText, {
                        labelText: richText
                            ? richTextToPlain(String(richText.string || ''))
                            : String(label.string || ''),
                    });
                }
                if (sprite) {
                    const frame = sprite.spriteFrame || sprite._spriteFrame;
                    add('image', sprite, {
                        spriteFrameName: frame ? String(frame.name || frame._name || '') : '',
                    });
                }
                for (const child of (node.children || []))
                    visit(child);
            };
            visit(root);
            return {
                success: true,
                data: {
                    rootUuid: root.uuid,
                    rootName: root.name || '',
                    kind,
                    targets,
                    stats: {
                        targets: targets.length,
                        texts: targets.filter((item) => item.replaceKind === 'text').length,
                        images: targets.filter((item) => item.replaceKind === 'image').length,
                    },
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @zh beta：把一颗已走正式 slim/asset landing 的 Figma 节点，局部应用到现有 Cocos 节点。
     *     不重命名、不增删子节点；按 flags 分开覆盖图片、文字、位置。
     */
    async applyNodePatchBeta(data) {
        let rollbackTarget = null;
        let rollbackSnapshot = null;
        let rollbackCc = null;
        try {
            console.log(`%c[figma-importer:scene] applyNodePatchBeta 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            rollbackCc = cc;
            const { director, find, UITransform, Label, RichText, Sprite, Font, Vec3, Vec2, Color } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            if (!data || !data.node)
                return { success: false, error: 'Invalid data: missing node' };
            const targetUuid = String(data.targetUuid || '');
            if (!targetUuid)
                return { success: false, error: 'Missing targetUuid' };
            const target = findNodeByUuid(scene, targetUuid);
            if (!target || !target.getComponent)
                return { success: false, error: `Target node not found: ${targetUuid}` };
            rollbackTarget = target;
            rollbackSnapshot = captureReplaceSnapshot(target, cc);
            const figmaNode = data.node;
            const flags = data.flags || {};
            const applyImage = flags.image !== false;
            const applyText = flags.text !== false;
            const applyPosition = flags.position !== false;
            const resetAnchorPivot = flags.anchorPivot !== false;
            const preserveAlpha = flags.preserveAlpha !== false;
            const ui = target.getComponent(UITransform);
            const warnings = [];
            let imageApplied = false;
            let textApplied = false;
            let positionApplied = false;
            let fontApplied = false;
            let richTextApplied = false;
            let richTextConverted = false;
            let richTextRendererUuid = '';
            let richTextShadowApplied = false;
            let richTextShadowBlurFallback = false;
            let richTextShadowRendererUuid = '';
            let patchedTextTarget = null;
            const lockedSize = !applyPosition && ui ? readUiSize(ui) : null;
            if (applyPosition) {
                if (ui) {
                    applyPatchTransform(target, ui, figmaNode, data.canvas || figmaNode, Vec3, resetAnchorPivot, UITransform, find);
                    positionApplied = true;
                }
                else {
                    warnings.push(`目标节点「${target.name || targetUuid}」没有 UITransform，跳过位置/尺寸。`);
                }
            }
            if (applyImage) {
                const sprite = Sprite ? target.getComponent(Sprite) : null;
                if (!sprite) {
                    warnings.push(`目标节点「${target.name || targetUuid}」没有 Sprite 组件，跳过图片。`);
                }
                else {
                    imageApplied = await applyPatchSprite(sprite, figmaNode, data, cc, preserveAlpha);
                    if (!imageApplied)
                        warnings.push(`目标节点「${target.name || targetUuid}」图片应用失败或 Figma 节点无图片。`);
                }
            }
            if (applyText && String(figmaNode.type || '').toUpperCase() === 'TEXT') {
                const prepared = prepareTextPatchTarget(target, figmaNode, cc);
                if (!prepared.component) {
                    warnings.push(prepared.warning || `目标节点「${target.name || targetUuid}」没有可用文字组件，跳过文字。`);
                }
                else {
                    patchedTextTarget = prepared.component;
                    textApplied = applyPatchTextCommon(prepared.component, figmaNode, Label, prepared.isRich, Color, Vec2);
                    if (textApplied) {
                        if (prepared.rendererNode)
                            syncFtocRichTextRendererLayout(target, figmaNode, cc);
                        fontApplied = prepared.isRich
                            ? await applyPatchRichTextFont(prepared.component, figmaNode, cc)
                            : await applyPatchFont(prepared.component, figmaNode, cc.assetManager, Font, false);
                        if (prepared.convertedLabel && prepared.label)
                            prepared.label.enabled = false;
                        if (prepared.isRich)
                            prepared.component.enabled = true;
                        if (prepared.rendererNode) {
                            prepared.rendererNode.active = true;
                            richTextRendererUuid = String(prepared.rendererNode.uuid || '');
                        }
                        if (prepared.isRich) {
                            const shadowResult = mountFtocRichTextShadow(target, figmaNode, prepared.component, cc);
                            richTextShadowApplied = shadowResult.applied;
                            richTextShadowBlurFallback = shadowResult.blurFallback;
                            richTextShadowRendererUuid = String(shadowResult.node && shadowResult.node.uuid || '');
                            if (shadowResult.warning)
                                warnings.push(shadowResult.warning);
                        }
                        richTextApplied = prepared.isRich;
                        richTextConverted = prepared.convertedLabel;
                    }
                    else if (prepared.isRich) {
                        if (prepared.createdRenderer)
                            removeFtocRichTextRenderer(target, RichText);
                        else {
                            prepared.component.enabled = true;
                            if (prepared.rendererNode)
                                prepared.rendererNode.active = true;
                        }
                    }
                }
            }
            // 与 Unity 的“内容 / 位置”契约一致：未应用位置时，文字 overflow/font 更新不能改目标框尺寸。
            if (lockedSize && ui && ui.setContentSize) {
                if (patchedTextTarget && typeof patchedTextTarget.updateRenderData === 'function') {
                    try {
                        patchedTextTarget.updateRenderData(true);
                    }
                    catch ( /* keep the authored target size below */_a) { /* keep the authored target size below */ }
                }
                ui.setContentSize(lockedSize.width, lockedSize.height);
            }
            const success = imageApplied || textApplied || positionApplied;
            if (!success && warnings.length === 0)
                warnings.push('没有任何字段被应用，请检查 flags 与节点类型。');
            return {
                success,
                data: {
                    rootUuid: target.uuid,
                    targetUuid: target.uuid,
                    targetName: target.name || '',
                    imageApplied,
                    textApplied,
                    positionApplied,
                    fontApplied,
                    richTextApplied,
                    richTextConverted,
                    richTextRendererUuid,
                    richTextShadowApplied,
                    richTextShadowBlurFallback,
                    richTextShadowRendererUuid,
                    warnings,
                },
            };
        }
        catch (error) {
            let rollbackError = '';
            if (rollbackTarget && rollbackSnapshot && rollbackCc) {
                try {
                    await restoreReplaceSnapshot(rollbackTarget, rollbackSnapshot, rollbackCc);
                }
                catch (restoreError) {
                    rollbackError = String(restoreError && restoreError.message || restoreError);
                }
            }
            return {
                success: false,
                error: error.message,
                stack: error.stack,
                rollback: {
                    attempted: !!(rollbackTarget && rollbackSnapshot && rollbackCc),
                    success: !rollbackError,
                    error: rollbackError,
                },
            };
        }
    },
    /**
     * @zh beta：删除选中目标根，并在原父节点、原 sibling index 用正式 buildTree 重建。
     */
    async replaceTreeBeta(data) {
        try {
            console.log(`%c[figma-importer:scene] replaceTreeBeta 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            if (!data || !data.root)
                return { success: false, error: 'Invalid data: missing root' };
            const targetUuid = String(data.targetUuid || '');
            if (!targetUuid)
                return { success: false, error: 'Missing targetUuid' };
            const target = findNodeByUuid(scene, targetUuid);
            if (!target)
                return { success: false, error: `Target node not found: ${targetUuid}` };
            const parentNode = target.parent;
            if (!parentNode)
                return { success: false, error: 'Target node has no parent' };
            const siblingIndex = typeof target.getSiblingIndex === 'function'
                ? target.getSiblingIndex()
                : Math.max(0, (parentNode.children || []).indexOf(target));
            const oldName = target.name;
            target.removeFromParent();
            if (typeof target.destroy === 'function')
                target.destroy();
            const result = await exports.methods.buildTree(Object.assign(Object.assign({}, data), { parentUuid: parentNode.uuid, siblingIndex }));
            if (result && result.success !== false && result.data) {
                result.data.replacedRootUuid = targetUuid;
                result.data.replacedRootName = oldName;
                result.data.parent = parentNode.name;
                result.data.siblingIndex = siblingIndex;
            }
            return result;
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @en Serialize the selected/imported scene subtree as a real Cocos Prefab asset JSON.
     * @zh 将选中/最近导入的真实场景子树序列化为 Cocos Prefab 资源 JSON（beta）。
     */
    async serializeNodeAsPrefabBeta(options = {}) {
        try {
            console.log(`%c[figma-importer:scene] serializeNodeAsPrefabBeta 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director, find, UITransform } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const root = findPrefabSourceNode(scene, find, UITransform, options || {});
            if (!root || !root.getComponent) {
                return { success: false, error: 'No prefab source node found' };
            }
            const prefabName = String(options && options.prefabName || root.name || 'FigmaPrefab');
            const prefabAsset = createPrefabAssetFromNode(cc, root, prefabName);
            const serialized = serializeEditorObject(prefabAsset, { stringify: false });
            const json = JSON.stringify(serialized, null, 2);
            const stats = collectSceneNodeStats(root, cc);
            console.log(`[figma-importer:scene] serializeNodeAsPrefabBeta 完成：${prefabName} ` +
                `nodes=${stats.nodes}, sprites=${stats.sprites}, nullSpriteFrames=${stats.nullSpriteFrames}, labels=${stats.labels}`);
            return {
                success: true,
                data: {
                    json,
                    name: prefabName,
                    rootUuid: root.uuid,
                    stats,
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @en Instantiate a Prefab asset into Canvas, matching Unity's "instantiate prefab for replace" first step.
     * @zh 将 Prefab 资源实例化到当前 Canvas 下（beta，对齐 Unity「实例化并替换」的第一步）。
     */
    async instantiatePrefabBeta(options = {}) {
        try {
            console.log(`%c[figma-importer:scene] instantiatePrefabBeta 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director, find, assetManager, instantiate, Prefab } = cc;
            const scene = director.getScene();
            if (!scene)
                return { success: false, error: 'No active scene' };
            const uuid = String(options && options.uuid || '');
            if (!uuid)
                return { success: false, error: 'Missing prefab uuid' };
            const prefabAsset = await loadPrefabAsset(assetManager, uuid);
            if (!prefabAsset || (Prefab && !(prefabAsset instanceof Prefab) && !prefabAsset.data)) {
                return {
                    success: false,
                    error: `Asset is not a Prefab: ${uuid}`,
                    data: { dbUrl: options && options.dbUrl, assetType: prefabAsset && prefabAsset.constructor && prefabAsset.constructor.name },
                };
            }
            const node = instantiate(prefabAsset);
            if (!node)
                return { success: false, error: `Failed to instantiate prefab: ${uuid}` };
            const canvas = find('Canvas') || scene.getChildByName('Canvas');
            const parentNode = canvas || scene;
            parentNode.addChild(node);
            if (typeof parentNode.layer === 'number') {
                const setLayer = (n) => {
                    if (typeof n.layer === 'number')
                        n.layer = parentNode.layer;
                    for (const child of (n.children || []))
                        setLayer(child);
                };
                setLayer(node);
            }
            selectEditorNode(node);
            const stats = collectSceneNodeStats(node, cc);
            console.log(`[figma-importer:scene] instantiatePrefabBeta 完成：${node.name} ` +
                `nodes=${stats.nodes}, sprites=${stats.sprites}, nullSpriteFrames=${stats.nullSpriteFrames}, labels=${stats.labels}`);
            return {
                success: true,
                data: {
                    rootUuid: node.uuid,
                    rootName: node.name,
                    parent: parentNode.name,
                    prefabUuid: uuid,
                    dbUrl: options && options.dbUrl || '',
                    count: stats.nodes,
                    sprites: stats.sprites,
                    nullSpriteFrames: stats.nullSpriteFrames,
                    labels: stats.labels,
                    richTexts: stats.richTexts,
                    masks: stats.masks,
                    buttons: stats.buttons,
                    stats,
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
    /**
     * @en Export a real Cocos scene subtree back to the Figma JSON contract.
     * @zh 从真实 Cocos 场景子树反导为 Figma JSON 契约（/pull beta）。
     */
    async exportTreeForFigma(options = {}) {
        try {
            console.log(`%c[figma-importer:scene] exportTreeForFigma 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director, find, UITransform } = cc;
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }
            const selectedUuids = Array.isArray(options && options.rootUuids)
                ? options.rootUuids.map((uuid) => String(uuid || '')).filter(Boolean)
                : [];
            const canvas = find('Canvas') || scene.getChildByName('Canvas');
            let selectedNodes = [];
            let selectedFilter = null;
            let ancestorFilter = null;
            let exportMode = 'subtree';
            let root = null;
            if (selectedUuids.length > 0) {
                selectedNodes = selectedUuids
                    .map((uuid) => findNodeByUuid(scene, uuid))
                    .filter(Boolean);
                if (selectedNodes.length !== selectedUuids.length) {
                    return {
                        success: false,
                        error: `Some selected nodes were not found (${selectedNodes.length}/${selectedUuids.length})`,
                    };
                }
                const firstInterfaceRoot = findInterfaceRoot(selectedNodes[0], canvas, UITransform);
                for (let i = 1; i < selectedNodes.length; i++) {
                    const otherRoot = findInterfaceRoot(selectedNodes[i], canvas, UITransform);
                    if (otherRoot !== firstInterfaceRoot) {
                        return {
                            success: false,
                            error: `Selected nodes belong to different UI roots: ${firstInterfaceRoot ? firstInterfaceRoot.name : '(none)'} / ${otherRoot ? otherRoot.name : '(none)'}`,
                        };
                    }
                }
                root = selectedNodes.length === 1 ? selectedNodes[0] : findCommonUiAncestor(selectedNodes, UITransform);
                if (!root)
                    return { success: false, error: 'Unable to find common ancestor for selected nodes' };
                if (selectedNodes.length > 1 && !selectedNodes.includes(root)) {
                    selectedFilter = new Set(selectedNodes.map((node) => node.uuid));
                    ancestorFilter = collectAncestorUuidSet(selectedNodes, root);
                    exportMode = 'selective';
                }
            }
            if (!root)
                root = options && options.rootUuid ? findNodeByUuid(scene, String(options.rootUuid)) : null;
            if (!root && options && options.rootName) {
                root = findFirstNodeByName(scene, String(options.rootName));
            }
            if (!root) {
                root = findDefaultExportRoot(scene, find, UITransform);
            }
            if (!root || !root.getComponent) {
                return { success: false, error: 'No exportable UI root found' };
            }
            const ui = root.getComponent(UITransform);
            if (!ui) {
                return { success: false, error: `Export root "${root.name}" has no UITransform` };
            }
            const rootSize = readUiSize(ui);
            const interfaceRoot = findInterfaceRoot(root, canvas, UITransform);
            const projectPath = Editor.Project.path;
            const ctx = {
                cc,
                imageSearchDirs: buildExportImageSearchDirs(projectPath, root.name || '', interfaceRoot && interfaceRoot.name || ''),
                images: {},
                imageIdByContent: {},
                imageCounter: 0,
                warnings: [],
                stats: {
                    nodes: 0,
                    texts: 0,
                    sprites: 0,
                    images: 0,
                    missingImages: 0,
                    solidFills: 0,
                    masks: 0,
                    buttons: 0,
                    slicedSprites: 0,
                },
            };
            const rootData = await exportNodeToFigma(root, rootSize.width, rootSize.height, true, ctx, selectedFilter, ancestorFilter);
            rootData.x = 0;
            rootData.y = 0;
            rootData.width = roundExportNumber(rootSize.width);
            rootData.height = roundExportNumber(rootSize.height);
            const exportData = {
                version: '1.0.8',
                name: root.name || 'CocosExport',
                canvas: {
                    width: roundExportNumber(rootSize.width),
                    height: roundExportNumber(rootSize.height),
                },
                root: rootData,
            };
            if (Object.keys(ctx.images).length > 0)
                exportData.images = ctx.images;
            const json = JSON.stringify(exportData, null, 4);
            console.log(`[figma-importer:scene] exportTreeForFigma 完成：${root.name} ` +
                `nodes=${ctx.stats.nodes}, texts=${ctx.stats.texts}, sprites=${ctx.stats.sprites}, images=${ctx.stats.images}, ` +
                `missingImages=${ctx.stats.missingImages}`);
            for (const warning of ctx.warnings.slice(0, 20)) {
                console.log(`[figma-importer:scene] export warning: ${warning}`);
            }
            if (ctx.warnings.length > 20) {
                console.log(`[figma-importer:scene] export warning: 另有 ${ctx.warnings.length - 20} 条图片/组件告警未展开。`);
            }
            return {
                success: true,
                data: {
                    json,
                    name: exportData.name,
                    canvas: exportData.canvas,
                    rootUuid: root.uuid,
                    stats: ctx.stats,
                    warnings: ctx.warnings,
                    exportMode,
                    selectedUuids: selectedNodes.map((node) => node.uuid),
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBMEJBLHNEQUlDO0FBT0QsOERBdUJDO0FBRUQsZ0VBc0JDO0FBR0QsNEVBS0M7QUFlRCwwRUFxQkM7QUFFRCw0REFhQztBQUVELGtEQXdCQztBQUdELDhEQU1DO0FBR0QsMERBWUM7QUFhRCxrREFPQztBQWlDRCxnRUFvQkM7QUEwREQsNERBbUJDO0FBT0QsOERBd0NDO0FBR0Qsd0VBbUJDO0FBdUJELDBEQXVGQztBQU1ELDhDQWtCQztBQThCRCxvRUF3QkM7QUFPRCxrRUFVQztBQXdCRCwwQ0FvQkM7QUFvZUQsc0RBb0JDO0FBMEVELDBEQW1CQztBQWNELGtEQWNDO0FBR0QsOERBR0M7QUFZRCxzREErS0M7QUF5REQsb0VBa0NDO0FBMEJELGtEQUVDO0FBRUQsOERBR0M7QUFpUUQsZ0VBSUM7QUFxRkQsd0RBbUZDO0FBdVFELHdEQTZFQztBQW9HRCx3REFrSkM7QUFFRCxrREE0Q0M7QUFlRCxnRUFXQztBQWlGRCxrREFZQztBQUVELDhEQU1DO0FBRUQsZ0VBTUM7QUE0cUJELG9FQUlDO0FBR0QsOEVBT0M7QUFHRCxnRkFXQztBQTJCRCwwRUE0QkM7QUFFRCxnRkFFQztBQUdELDRGQUtDO0FBNENELG9FQUtDO0FBR0QsOENBMEJDO0FBNkRELG9DQWtCQztBQXZwSEQ7Ozs7OztHQU1HO0FBQ0gsMkJBQThDO0FBQzlDLCtCQUFzQztBQUN0QyxtQ0FBd0Q7QUFDeEQsMkRBSzZCO0FBRTdCLCtDQUEyRTtBQUMzRSxxQ0FBNkM7QUFDN0Msc0JBQXNCO0FBQ3RCLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUEsV0FBSSxFQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFFekQsTUFBTSxtQkFBbUIsR0FBRyxxQkFBYSxDQUFDO0FBQzFDLE1BQU0sMkJB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QUFJLENBQUMsQ0FBQztJQUM3QixNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlCLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUM5RSxNQUFNLEVBQUUsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDOUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsTUFBTSxRQUFRLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDO0lBQzlFLE1BQU0sTUFBTSxHQUFHLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDbkMsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUNuQyxPQUFPO1FBQ0gsQ0FBQyxFQUFFLE1B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QUM7SUFDeEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQUUsT0FBTyxHQUFHLENBQUM7SUFDcEMsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNyRCxDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxJQUFTLEVBQUUsQ0FBUyxFQUFFLENBQVM7SUFDNUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7SUFDL0MsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQy9ELENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDVCxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3BELElBQUksS0FBSyxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUNwQixNQUFNLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQy9CLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUs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SSxDQUFDLENBQUM7UUFDL0IsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDNUQsTUFBTSxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQzVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUM3QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDOUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQzVCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUMvQixPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEdBQUcsSUFBSSxFQUFFLE1BQU0sRUFBRSxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUM7SUFDbkYsQ0FBQztJQUNELE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RCLE9BQU8sRUFBRSxJQUFJLEVB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QztZQUNyRSxDQUFDO1lBQ0QsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxFQUFFLEVBQUUsQ0FBQztnQkFDM0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2Q0FBNkMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUN0RyxDQUFDO1lBRUQsT0FBTztnQkFDSCxPQUFPLEVBQUUsSUFBSTtnQkFDYixJQUFJLEVBQUU7b0JBQ0YsSUFBSTtvQkFDSixJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUk7b0JBQ3JCLE1BQU0sRUFBRSxVQUFVLENBQUMsTUFBTTtvQkFDekIsUUFBUSxFQUFFLElBQUksQ0FBQyxJQUFJO29CQUNuQixLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUs7b0JBQ2hCLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUTtvQkFDdEIsVUFBVTtvQkFDVixhQUFhLEVBQUUsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQVMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztpQkFDN0Q7YUFDSixDQUFDO1FBQ04sQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDbEIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN4RSxDQUFDO0lBQ0wsQ0FBQztDQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBlbiBmaWdtYS1pbXBvcnRlciBzY2VuZSBzY3JpcHQg4oCUIHRoZSBPTkxZIHBsYWNlIGNjLiogZW5naW5lIEFQSXMgcnVuLlxuICogQHpoIGZpZ21hLWltcG9ydGVyIOWcuuaZr+iEmuacrCDigJTigJQg5ZSv5LiA6IO96LeRIGNjLiog5byV5pOOIEFQSSDnmoTlnLDmlrnjgIJcbiAqXG4gKiBtYWluLnRzIOmAmui/hyBleGVjdXRlLXNjZW5lLXNjcmlwdCDosIPov5vov5nph4znmoQgbWV0aG9kcy4q44CCXG4gKiDms6jmhI/vvJrlvJXmk47nsbvlv4XpobvnlKggcmVxdWlyZSgnY2MnKSDov5DooYzml7blj5bvvIzkuI3og73pobbpg6ggaW1wb3J044CCXG4gKi9cbmltcG9ydCB7IGV4aXN0c1N5bmMsIHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBqb2luIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBCVUlMRF9WRVJTSU9OLCBGaWdtYUlucHV0U3BlYyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHtcbiAgICBDb21wb25lbnRNYXBwaW5nRW50cnksXG4gICAgYnVpbGRDb21wb25lbnRTdGF0ZURhdGEsXG4gICAgY29tcG9uZW50SWRlbnRpdHlGcm9tU3RhdGUsXG4gICAgcmVzb2x2ZUNvbXBvbmVudE1hcHBpbmcsXG59IGZyb20gJy4vY29tcG9uZW50LW1hcHBpbmcnO1xuaW1wb3J0IHsgTWFwcGVkQ29tcG9uZW50U3RhdGVSZXF1ZXN0IH0gZnJvbSAnLi9tYXBwZWQtY29tcG9uZW50LXN0YXRlJztcbmltcG9ydCB7IGluZmVyTmF0aXZlR3JpZExheW91dCwgaW5mZXJXcmFwR3JpZExheW91dCB9IGZyb20gJy4vbGF5b3V0LXBsYW4nO1xuaW1wb3J0IHsgY2xhbXBTbGljZTlCb3JkZXIgfSBmcm9tICcuL3NsaWNlOSc7XG4vLyDorqnov5DooYzml7bog73mib7liLDnvJbovpHlmajlhoXnva7nmoQgY2Mg5qih5Z2XXG5tb2R1bGUucGF0aHMucHVzaChqb2luKEVkaXRvci5BcHAucGF0aCwgJ25vZGVfbW9kdWxlcycpKTtcblxuY29uc3QgU0NFTkVfQlVJTERfVkVSU0lPTiA9IEJVSUxEX1ZFUlNJT047XG5jb25zdCBGSUdNQV9DT01QT05FTlRfU1RBVEVfQ0xBU1MgPSAnRmlnbWFDb21wb25lbnRTdGF0ZSc7XG5cbi8qKiBLZWVwIEZpZ21hIGxhYmVscyByZWFkYWJsZSB3aGlsZSByZW1vdmluZyBzZXBhcmF0b3JzIHRoYXQgQ29jb3MgcmVqZWN0cyBpbiBOb2RlLm5hbWUuICovXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVDb2Nvc05vZGVOYW1lKHZhbHVlOiB1bmtub3duLCBmYWxsYmFjayA9ICdOb2RlJyk6IHN0cmluZyB7XG4gICAgY29uc3QgY2xlYW4gPSBTdHJpbmcodmFsdWUgPz8gJycpLnJlcGxhY2UoL1tcXFxcL10vZywgJ18nKS50cmltKCk7XG4gICAgaWYgKGNsZWFuKSByZXR1cm4gY2xlYW47XG4gICAgcmV0dXJuIFN0cmluZyhmYWxsYmFjayB8fCAnTm9kZScpLnJlcGxhY2UoL1tcXFxcL10vZywgJ18nKS50cmltKCkgfHwgJ05vZGUnO1xufVxuXG4vKipcbiAqIExlZ2FjeSBpbi1tZW1vcnkgaGVscGVyIHJldGFpbmVkIGZvciBvbGQgY2FsbGVycy90ZXN0cy4gSW1wb3J0IHBhdGhzIG11c3RcbiAqIHVzZSBidWlsZENvbXBvbmVudFN0YXRlUmVxdWVzdCArIHRoZSBlZGl0b3IgZmFjYWRlIHF1ZXVlIGJlbG93OyBhZGRpbmcgYVxuICogY29tcG9uZW50IGhlcmUgaXMgbm90IGEgcGVyc2lzdGVuY2UgcGF0aCBmb3IgUHJlZmFiIGluc3RhbmNlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGF0dGFjaEZpZ21hQ29tcG9uZW50U3RhdGUobm9kZTogYW55LCBmaWdtYU5vZGU6IGFueSwgY2M6IGFueSk6ICdhdHRhY2hlZCcgfCAndW5hdmFpbGFibGUnIHtcbiAgICBjb25zdCBzdGF0ZURhdGEgPSBidWlsZENvbXBvbmVudFN0YXRlRGF0YShcbiAgICAgICAgZmlnbWFOb2RlICYmIGZpZ21hTm9kZS5jb21wb25lbnRLZXksXG4gICAgICAgIGZpZ21hTm9kZSAmJiBmaWdtYU5vZGUubmFtZSxcbiAgICAgICAgZmlnbWFOb2RlICYmIGZpZ21hTm9kZS5jb21wb25lbnRQcm9wZXJ0aWVzXG4gICAgKTtcbiAgICBpZiAoIXN0YXRlRGF0YS5jb21wb25lbnRLZXkpIHJldHVybiAndW5hdmFpbGFibGUnO1xuICAgIGNvbnN0IHN0YXRlQ2xhc3MgPSBjYyAmJiBjYy5qcyAmJiB0eXBlb2YgY2MuanMuZ2V0Q2xhc3NCeU5hbWUgPT09ICdmdW5jdGlvbidcbiAgICAgICAgPyBjYy5qcy5nZXRDbGFzc0J5TmFtZShGSUdNQV9DT01QT05FTlRfU1RBVEVfQ0xBU1MpXG4gICAgICAgIDogbnVsbDtcbiAgICBpZiAoIXN0YXRlQ2xhc3MgfHwgIW5vZGUgfHwgIW5vZGUuZ2V0Q29tcG9uZW50IHx8ICFub2RlLmFkZENvbXBvbmVudCkgcmV0dXJuICd1bmF2YWlsYWJsZSc7XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBzdGF0ZSA9IG5vZGUuZ2V0Q29tcG9uZW50KHN0YXRlQ2xhc3MpIHx8IG5vZGUuYWRkQ29tcG9uZW50KHN0YXRlQ2xhc3MpO1xuICAgICAgICBzdGF0ZS5jb21wb25lbnRLZXkgPSBzdGF0ZURhdGEuY29tcG9uZW50S2V5O1xuICAgICAgICBzdGF0ZS5jb21wb25lbnROYW1lID0gc3RhdGVEYXRhLmNvbXBvbmVudE5hbWU7XG4gICAgICAgIHN0YXRlLnZhcmlhbnRGaWx0ZXIgPSBzdGF0ZURhdGEudmFyaWFudEZpbHRlcjtcbiAgICAgICAgc3RhdGUucHJvcGVydHlLZXlzID0gc3RhdGVEYXRhLnByb3BlcnR5S2V5cy5zbGljZSgpO1xuICAgICAgICBzdGF0ZS5wcm9wZXJ0eVZhbHVlcyA9IHN0YXRlRGF0YS5wcm9wZXJ0eVZhbHVlcy5zbGljZSgpO1xuICAgICAgICByZXR1cm4gJ2F0dGFjaGVkJztcbiAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuICd1bmF2YWlsYWJsZSc7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRDb21wb25lbnRTdGF0ZVJlcXVlc3QoXG4gICAgbm9kZTogYW55LFxuICAgIGZpZ21hTm9kZTogYW55LFxuICAgIHJlcXVpcmVzUHJlZmFiT3ZlcnJpZGUgPSBmYWxzZSxcbik6IE1hcHBlZENvbXBvbmVudFN0YXRlUmVxdWVzdCB8IG51bGwge1xuICAgIGlmICghbm9kZSB8fCAhbm9kZS51dWlkKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBzdGF0ZURhdGEgPSBidWlsZENvbXBvbmVudFN0YXRlRGF0YShcbiAgICAgICAgZmlnbWFOb2RlICYmIGZpZ21hTm9kZS5jb21wb25lbnRLZXksXG4gICAgICAgIGZpZ21hTm9kZSAmJiBmaWdtYU5vZGUubmFtZSxcbiAgICAgICAgZmlnbWFOb2RlICYmIGZpZ21hTm9kZS5jb21wb25lbnRQcm9wZXJ0aWVzLFxuICAgICk7XG4gICAgaWYgKCFzdGF0ZURhdGEuY29tcG9uZW50S2V5KSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4ge1xuICAgICAgICBub2RlVXVpZDogU3RyaW5nKG5vZGUudXVpZCksXG4gICAgICAgIGFjdGl2ZTogIWZpZ21hTm9kZSB8fCBmaWdtYU5vZGUudmlzaWJsZSAhPT0gZmFsc2UsXG4gICAgICAgIGNvbXBvbmVudEtleTogc3RhdGVEYXRhLmNvbXBvbmVudEtleSxcbiAgICAgICAgY29tcG9uZW50TmFtZTogc3RhdGVEYXRhLmNvbXBvbmVudE5hbWUsXG4gICAgICAgIHZhcmlhbnRGaWx0ZXI6IHN0YXRlRGF0YS52YXJpYW50RmlsdGVyLFxuICAgICAgICBwcm9wZXJ0eUtleXM6IHN0YXRlRGF0YS5wcm9wZXJ0eUtleXMuc2xpY2UoKSxcbiAgICAgICAgcHJvcGVydHlWYWx1ZXM6IHN0YXRlRGF0YS5wcm9wZXJ0eVZhbHVlcy5zbGljZSgpLFxuICAgICAgICByZXF1aXJlc1ByZWZhYk92ZXJyaWRlLFxuICAgIH07XG59XG5cbi8qKiBAZGVwcmVjYXRlZCBLZWVwIHRoZSBvbGQgbmFtZSBmb3IgY2FsbGVycy90ZXN0cyB3aGlsZSBhbGwgY29tcG9uZW50S2V5IHBhdGhzIHVzZSB0aGUgc2FtZSBxdWV1ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZE1hcHBlZENvbXBvbmVudFN0YXRlUmVxdWVzdChcbiAgICBub2RlOiBhbnksXG4gICAgZmlnbWFOb2RlOiBhbnksXG4pOiBNYXBwZWRDb21wb25lbnRTdGF0ZVJlcXVlc3QgfCBudWxsIHtcbiAgICByZXR1cm4gYnVpbGRDb21wb25lbnRTdGF0ZVJlcXVlc3Qobm9kZSwgZmlnbWFOb2RlLCB0cnVlKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGaWdtYUNvbXBvbmVudFNlbGVjdGlvbkRlc2NyaXB0aW9uIHtcbiAgICBzdGF0dXM6ICdzZWxlY3RlZCcgfCAnbm90LWNvbXBvbmVudCc7XG4gICAgcmVhc29uOiBzdHJpbmc7XG4gICAgbm9kZVV1aWQ6IHN0cmluZztcbiAgICBub2RlTmFtZTogc3RyaW5nO1xuICAgIHNjZW5lUGF0aDogc3RyaW5nO1xuICAgIGNvbXBvbmVudEtleT86IHN0cmluZztcbiAgICBjb21wb25lbnROYW1lPzogc3RyaW5nO1xuICAgIHZhcmlhbnRGaWx0ZXI/OiBzdHJpbmc7XG4gICAgY29tcG9uZW50UHJvcGVydGllcz86IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG59XG5cbi8qKiBSZWFkIG1hcHBpbmcgaWRlbnRpdHkgb25seSBmcm9tIHRoZSBzZWxlY3RlZCBub2RlJ3MgcGVyc2lzdGVkIEZpZ21hQ29tcG9uZW50U3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmVGaWdtYUNvbXBvbmVudFNlbGVjdGlvbihub2RlOiBhbnksIGNjOiBhbnkpOiBGaWdtYUNvbXBvbmVudFNlbGVjdGlvbkRlc2NyaXB0aW9uIHtcbiAgICBjb25zdCBiYXNlID0ge1xuICAgICAgICBub2RlVXVpZDogU3RyaW5nKG5vZGUgJiYgbm9kZS51dWlkIHx8ICcnKSxcbiAgICAgICAgbm9kZU5hbWU6IFN0cmluZyhub2RlICYmIG5vZGUubmFtZSB8fCAnJyksXG4gICAgICAgIHNjZW5lUGF0aDogbm9kZSA/IGJ1aWxkU2NlbmVOb2RlUGF0aChub2RlKSA6ICcnLFxuICAgIH07XG4gICAgaWYgKCFub2RlKSByZXR1cm4geyBzdGF0dXM6ICdub3QtY29tcG9uZW50JywgcmVhc29uOiAnbm9kZS1taXNzaW5nJywgLi4uYmFzZSB9O1xuICAgIGNvbnN0IHN0YXRlQ2xhc3MgPSBjYyAmJiBjYy5qcyAmJiB0eXBlb2YgY2MuanMuZ2V0Q2xhc3NCeU5hbWUgPT09ICdmdW5jdGlvbidcbiAgICAgICAgPyBjYy5qcy5nZXRDbGFzc0J5TmFtZShGSUdNQV9DT01QT05FTlRfU1RBVEVfQ0xBU1MpXG4gICAgICAgIDogbnVsbDtcbiAgICBpZiAoIXN0YXRlQ2xhc3MpIHJldHVybiB7IHN0YXR1czogJ25vdC1jb21wb25lbnQnLCByZWFzb246ICdydW50aW1lLXVuYXZhaWxhYmxlJywgLi4uYmFzZSB9O1xuICAgIGNvbnN0IHN0YXRlID0gbm9kZS5nZXRDb21wb25lbnQgJiYgbm9kZS5nZXRDb21wb25lbnQoc3RhdGVDbGFzcyk7XG4gICAgaWYgKCFzdGF0ZSkgcmV0dXJuIHsgc3RhdHVzOiAnbm90LWNvbXBvbmVudCcsIHJlYXNvbjogJ2NvbXBvbmVudC1zdGF0ZS1taXNzaW5nJywgLi4uYmFzZSB9O1xuICAgIGNvbnN0IGlkZW50aXR5ID0gY29tcG9uZW50SWRlbnRpdHlGcm9tU3RhdGUoc3RhdGUpO1xuICAgIGlmICghaWRlbnRpdHkpIHJldHVybiB7IHN0YXR1czogJ25vdC1jb21wb25lbnQnLCByZWFzb246ICdjb21wb25lbnQta2V5LW1pc3NpbmcnLCAuLi5iYXNlIH07XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzOiAnc2VsZWN0ZWQnLFxuICAgICAgICByZWFzb246ICdmaWdtYS1jb21wb25lbnQtc3RhdGUnLFxuICAgICAgICAuLi5iYXNlLFxuICAgICAgICAuLi5pZGVudGl0eSxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb3VudGVkUHJlZmFiQ29tcG9uZW50KG5vZGU6IGFueSwgY29tcG9uZW50OiBhbnkpOiBib29sZWFuIHtcbiAgICBjb25zdCBwcmVmYWJJbmZvID0gbm9kZSAmJiBub2RlLl9wcmVmYWI7XG4gICAgY29uc3QgaW5zdGFuY2UgPSBwcmVmYWJJbmZvICYmIHByZWZhYkluZm8uaW5zdGFuY2U7XG4gICAgY29uc3QgZmlsZUlkID0gU3RyaW5nKHByZWZhYkluZm8gJiYgcHJlZmFiSW5mby5maWxlSWQgfHwgJycpO1xuICAgIGlmICghaW5zdGFuY2UgfHwgIWZpbGVJZCB8fCAhQXJyYXkuaXNBcnJheShpbnN0YW5jZS5tb3VudGVkQ29tcG9uZW50cykpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gaW5zdGFuY2UubW91bnRlZENvbXBvbmVudHMuc29tZSgoaW5mbzogYW55KSA9PiB7XG4gICAgICAgIGNvbnN0IGxvY2FsSUQgPSBpbmZvICYmIGluZm8udGFyZ2V0SW5mbyAmJiBpbmZvLnRhcmdldEluZm8ubG9jYWxJRDtcbiAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkobG9jYWxJRClcbiAgICAgICAgICAgICYmIGxvY2FsSUQubGVuZ3RoID09PSAxXG4gICAgICAgICAgICAmJiBTdHJpbmcobG9jYWxJRFswXSkgPT09IGZpbGVJZFxuICAgICAgICAgICAgJiYgQXJyYXkuaXNBcnJheShpbmZvLmNvbXBvbmVudHMpXG4gICAgICAgICAgICAmJiBpbmZvLmNvbXBvbmVudHMuaW5jbHVkZXMoY29tcG9uZW50KTtcbiAgICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q29tcG9uZW50U3RhdGUoXG4gICAgbm9kZTogYW55LFxuICAgIHJlcXVlc3Q6IE1hcHBlZENvbXBvbmVudFN0YXRlUmVxdWVzdCxcbiAgICBjYzogYW55LFxuKTogJ2F0dGFjaGVkJyB8ICd1bmF2YWlsYWJsZScgfCAnb3ZlcnJpZGUtbWlzc2luZycge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHN0YXRlQ2xhc3MgPSBjYyAmJiBjYy5qcyAmJiB0eXBlb2YgY2MuanMuZ2V0Q2xhc3NCeU5hbWUgPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgID8gY2MuanMuZ2V0Q2xhc3NCeU5hbWUoRklHTUFfQ09NUE9ORU5UX1NUQVRFX0NMQVNTKVxuICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICBjb25zdCBzdGF0ZSA9IHN0YXRlQ2xhc3MgJiYgbm9kZSAmJiBub2RlLmdldENvbXBvbmVudCA/IG5vZGUuZ2V0Q29tcG9uZW50KHN0YXRlQ2xhc3MpIDogbnVsbDtcbiAgICAgICAgaWYgKCFzdGF0ZSkgcmV0dXJuICd1bmF2YWlsYWJsZSc7XG4gICAgICAgIHN0YXRlLmNvbXBvbmVudEtleSA9IHJlcXVlc3QuY29tcG9uZW50S2V5O1xuICAgICAgICBzdGF0ZS5jb21wb25lbnROYW1lID0gcmVxdWVzdC5jb21wb25lbnROYW1lO1xuICAgICAgICBzdGF0ZS52YXJpYW50RmlsdGVyID0gcmVxdWVzdC52YXJpYW50RmlsdGVyO1xuICAgICAgICBzdGF0ZS5wcm9wZXJ0eUtleXMgPSByZXF1ZXN0LnByb3BlcnR5S2V5cy5zbGljZSgpO1xuICAgICAgICBzdGF0ZS5wcm9wZXJ0eVZhbHVlcyA9IHJlcXVlc3QucHJvcGVydHlWYWx1ZXMuc2xpY2UoKTtcbiAgICAgICAgcmV0dXJuIHJlcXVlc3QucmVxdWlyZXNQcmVmYWJPdmVycmlkZVxuICAgICAgICAgICAgPyAoaXNNb3VudGVkUHJlZmFiQ29tcG9uZW50KG5vZGUsIHN0YXRlKSA/ICdhdHRhY2hlZCcgOiAnb3ZlcnJpZGUtbWlzc2luZycpXG4gICAgICAgICAgICA6ICdhdHRhY2hlZCc7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiAndW5hdmFpbGFibGUnO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGlmIChub2RlKSBub2RlLmFjdGl2ZSA9IHJlcXVlc3QuYWN0aXZlICE9PSBmYWxzZTtcbiAgICB9XG59XG5cbi8qKiBAZGVwcmVjYXRlZCBDb21wYXRpYmlsaXR5IGFsaWFzIGZvciB0aGUgb3JpZ2luYWwgbWFwcGVkLVByZWZhYi1vbmx5IG1ldGhvZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseU1hcHBlZENvbXBvbmVudFN0YXRlKFxuICAgIG5vZGU6IGFueSxcbiAgICByZXF1ZXN0OiBNYXBwZWRDb21wb25lbnRTdGF0ZVJlcXVlc3QsXG4gICAgY2M6IGFueSxcbik6ICdhdHRhY2hlZCcgfCAndW5hdmFpbGFibGUnIHwgJ292ZXJyaWRlLW1pc3NpbmcnIHtcbiAgICByZXR1cm4gYXBwbHlDb21wb25lbnRTdGF0ZShub2RlLCByZXF1ZXN0LCBjYyk7XG59XG5cbi8qKiBSZW1vdmUgYW4gaW5jb21wbGV0ZSBtYXBwZWQgaW5zdGFuY2UgYmVmb3JlIGV4cGFuZGluZyB0aGUgRmlnbWEgZmFsbGJhY2sgdHJlZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXNjYXJkRmFpbGVkTWFwcGVkTm9kZShub2RlOiBhbnkpOiB2b2lkIHtcbiAgICBpZiAoIW5vZGUpIHJldHVybjtcbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIG5vZGUucmVtb3ZlRnJvbVBhcmVudCA9PT0gJ2Z1bmN0aW9uJykgbm9kZS5yZW1vdmVGcm9tUGFyZW50KCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIENvbnRpbnVlIHRvIGRlc3Ryb3kgZXZlbiBpZiB0aGUgcGFyZW50IHdhcyBhbHJlYWR5IGRldGFjaGVkLlxuICAgIH1cbiAgICB0cnkge1xuICAgICAgICBpZiAodHlwZW9mIG5vZGUuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykgbm9kZS5kZXN0cm95KCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIFRoZSBmYWxsYmFjayB0cmVlIGNhbiBzdGlsbCBiZSBidWlsdCB3aGVuIGJlc3QtZWZmb3J0IGRpc3Bvc2FsIGZhaWxzLlxuICAgIH1cbn1cblxuLyoqIEB6aCBGaWdtYSDmsLTlubPlr7npvZAg4oaSIENvY29zIExhYmVsLkhvcml6b250YWxBbGlnbiAqL1xuZnVuY3Rpb24gbWFwSEFsaWduKExhYmVsOiBhbnksIGFsaWduOiBzdHJpbmcpOiBudW1iZXIge1xuICAgIHN3aXRjaCAoU3RyaW5nKGFsaWduIHx8ICcnKS50cmltKCkudG9VcHBlckNhc2UoKSkge1xuICAgICAgICBjYXNlICdDRU5URVInOiByZXR1cm4gTGFiZWwuSG9yaXpvbnRhbEFsaWduLkNFTlRFUjtcbiAgICAgICAgY2FzZSAnUklHSFQnOiByZXR1cm4gTGFiZWwuSG9yaXpvbnRhbEFsaWduLlJJR0hUO1xuICAgICAgICBjYXNlICdMRUZUJzpcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIExhYmVsLkhvcml6b250YWxBbGlnbi5MRUZUO1xuICAgIH1cbn1cblxuLyoqIEB6aCBGaWdtYSDmloflrZfmjpLniYjmlrnlkJHlr7nlupTnmoQgQ29jb3MgVUlUcmFuc2Zvcm0g5qiq5ZCR6ZSa54K544CCICovXG5leHBvcnQgZnVuY3Rpb24gdGV4dEFuY2hvclhGb3JBbGlnbihhbGlnbjogdW5rbm93bik6IG51bWJlciB7XG4gICAgc3dpdGNoIChTdHJpbmcoYWxpZ24gfHwgJycpLnRyaW0oKS50b1VwcGVyQ2FzZSgpKSB7XG4gICAgICAgIGNhc2UgJ0NFTlRFUic6IHJldHVybiAwLjU7XG4gICAgICAgIGNhc2UgJ1JJR0hUJzogcmV0dXJuIDE7XG4gICAgICAgIGNhc2UgJ0xFRlQnOlxuICAgICAgICBkZWZhdWx0OiByZXR1cm4gMDtcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBGVE9DX1JJQ0hfVEVYVF9SRU5ERVJFUl9OQU1FID0gJ19fRlRPQ19URVhUX1JFTkRFUkVSX18nO1xuZXhwb3J0IGNvbnN0IEZUT0NfUklDSF9URVhUX1NIQURPV19OQU1FID0gJ19fRlRPQ19URVhUX1NIQURPV19fJztcbmV4cG9ydCBjb25zdCBGVE9DX0lOUFVUX1RFWFRfTEFCRUxfTkFNRSA9ICdURVhUX0xBQkVMJztcbmV4cG9ydCBjb25zdCBGVE9DX0lOUFVUX1BMQUNFSE9MREVSX0xBQkVMX05BTUUgPSAnUExBQ0VIT0xERVJfTEFCRUwnO1xuZXhwb3J0IGNvbnN0IEZUT0NfSU5QVVRfRURJVEJPWF9IT1NUX05BTUUgPSAnX19GVE9DX0lOUFVUX0VESVRCT1hfXyc7XG5jb25zdCBMRUdBQ1lfRlRPQ19JTlBVVF9URVhUX0xBQkVMX05BTUUgPSAnX19GVE9DX0lOUFVUX1RFWFRfXyc7XG5jb25zdCBMRUdBQ1lfRlRPQ19JTlBVVF9QTEFDRUhPTERFUl9MQUJFTF9OQU1FID0gJ19fRlRPQ19JTlBVVF9QTEFDRUhPTERFUl9fJztcblxuZXhwb3J0IGludGVyZmFjZSBSaWNoVGV4dFJlbmRlcmVyTGF5b3V0UGxhbiB7XG4gICAgYW5jaG9yWDogbnVtYmVyO1xuICAgIGFuY2hvclk6IG51bWJlcjtcbiAgICBsb2NhbFg6IG51bWJlcjtcbiAgICBsb2NhbFk6IG51bWJlcjtcbiAgICBtYXhXaWR0aDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiB0ZXh0QW5jaG9yWUZvckFsaWduKGFsaWduOiB1bmtub3duKTogbnVtYmVyIHtcbiAgICBzd2l0Y2ggKFN0cmluZyhhbGlnbiB8fCAnJykudHJpbSgpLnRvVXBwZXJDYXNlKCkpIHtcbiAgICAgICAgY2FzZSAnVE9QJzogcmV0dXJuIDE7XG4gICAgICAgIGNhc2UgJ0JPVFRPTSc6IHJldHVybiAwO1xuICAgICAgICBjYXNlICdDRU5URVInOiByZXR1cm4gMC41O1xuICAgICAgICAvLyBGaWdtYSdzIGRlZmF1bHQgdmVydGljYWwgdGV4dCBhbGlnbm1lbnQgaXMgVE9QLiBLZWVwIHRoZSBSaWNoVGV4dFxuICAgICAgICAvLyB3cmFwcGVyIGluIHRoZSBzYW1lIHBsYWNlIGFzIHRoZSBMYWJlbCBwYXRoIHdoZW4gb2xkZXIgSlNPTiBvbWl0cyBpdC5cbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIDE7XG4gICAgfVxufVxuXG4vKipcbiAqIEB6aCBSaWNoVGV4dCDoh6rouqvkvJrooqsgQ3JlYXRvciDmlLnmiJDoh6rnhLblsLrlr7jvvJvmiorlroPmlL7ov5sgYXV0aG9yZWQgVEVYVCDlrZDoioLngrnlkI7vvIxcbiAqICAgICDorqnmuLLmn5PlmajnmoTlt6Yv5LitL+WPs+S4juS4ii/kuK0v5LiL5Y+C6ICD54K557un57ut6JC95Zyo5L2c6ICF5qGG55qE5ZCM5LiA5Y+C6ICD54K55LiK44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwbGFuUmljaFRleHRSZW5kZXJlckxheW91dChcbiAgICBmaWdtYU5vZGU6IGFueSxcbiAgICBhdXRob3JlZFdpZHRoOiBudW1iZXIsXG4gICAgYXV0aG9yZWRIZWlnaHQ6IG51bWJlcixcbiAgICBwYXJlbnRBbmNob3JYPzogbnVtYmVyLFxuICAgIHBhcmVudEFuY2hvclkgPSAwLjUsXG4pOiBSaWNoVGV4dFJlbmRlcmVyTGF5b3V0UGxhbiB7XG4gICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgwLCBOdW1iZXIoYXV0aG9yZWRXaWR0aCkgfHwgMCk7XG4gICAgY29uc3QgaGVpZ2h0ID0gTWF0aC5tYXgoMCwgTnVtYmVyKGF1dGhvcmVkSGVpZ2h0KSB8fCAwKTtcbiAgICBjb25zdCBhbmNob3JYID0gdGV4dEFuY2hvclhGb3JBbGlnbihmaWdtYU5vZGUgJiYgZmlnbWFOb2RlLnRleHRBbGlnbkhvcml6b250YWwpO1xuICAgIGNvbnN0IGFuY2hvclkgPSB0ZXh0QW5jaG9yWUZvckFsaWduKGZpZ21hTm9kZSAmJiBmaWdtYU5vZGUudGV4dEFsaWduVmVydGljYWwpO1xuICAgIGNvbnN0IHBhcmVudFggPSBOdW1iZXIuaXNGaW5pdGUocGFyZW50QW5jaG9yWCkgPyBOdW1iZXIocGFyZW50QW5jaG9yWCkgOiBhbmNob3JYO1xuICAgIGNvbnN0IHBhcmVudFkgPSBOdW1iZXIuaXNGaW5pdGUocGFyZW50QW5jaG9yWSkgPyBOdW1iZXIocGFyZW50QW5jaG9yWSkgOiAwLjU7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgYW5jaG9yWCxcbiAgICAgICAgYW5jaG9yWSxcbiAgICAgICAgbG9jYWxYOiAoYW5jaG9yWCAtIHBhcmVudFgpICogd2lkdGgsXG4gICAgICAgIGxvY2FsWTogKGFuY2hvclkgLSBwYXJlbnRZKSAqIGhlaWdodCxcbiAgICAgICAgbWF4V2lkdGg6IFN0cmluZyhmaWdtYU5vZGUgJiYgZmlnbWFOb2RlLnRleHRBdXRvUmVzaXplIHx8ICcnKSA9PT0gJ1dJRFRIX0FORF9IRUlHSFQnID8gMCA6IHdpZHRoLFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGlzRnRvY1JpY2hUZXh0UmVuZGVyZXJOb2RlKG5vZGU6IGFueSk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAhIW5vZGUgJiYgbm9kZS5uYW1lID09PSBGVE9DX1JJQ0hfVEVYVF9SRU5ERVJFUl9OQU1FO1xufVxuXG5mdW5jdGlvbiBpc0Z0b2NSaWNoVGV4dFNoYWRvd05vZGUobm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICEhbm9kZSAmJiBub2RlLm5hbWUgPT09IEZUT0NfUklDSF9URVhUX1NIQURPV19OQU1FO1xufVxuXG5mdW5jdGlvbiBpc0Z0b2NUZXh0SGVscGVyTm9kZShub2RlOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoaXNGdG9jUmljaFRleHRSZW5kZXJlck5vZGUobm9kZSkgfHwgaXNGdG9jUmljaFRleHRTaGFkb3dOb2RlKG5vZGUpKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoIW5vZGUpIHJldHVybiBmYWxzZTtcbiAgICBpZiAobm9kZS5uYW1lID09PSBGVE9DX0lOUFVUX0VESVRCT1hfSE9TVF9OQU1FKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoIW5vZGUucGFyZW50IHx8IG5vZGUucGFyZW50Lm5hbWUgIT09IEZUT0NfSU5QVVRfRURJVEJPWF9IT1NUX05BTUUpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gbm9kZS5uYW1lID09PSBGVE9DX0lOUFVUX1RFWFRfTEFCRUxfTkFNRSB8fFxuICAgICAgICBub2RlLm5hbWUgPT09IEZUT0NfSU5QVVRfUExBQ0VIT0xERVJfTEFCRUxfTkFNRSB8fFxuICAgICAgICBub2RlLm5hbWUgPT09IExFR0FDWV9GVE9DX0lOUFVUX1RFWFRfTEFCRUxfTkFNRSB8fFxuICAgICAgICBub2RlLm5hbWUgPT09IExFR0FDWV9GVE9DX0lOUFVUX1BMQUNFSE9MREVSX0xBQkVMX05BTUU7XG59XG5cbmZ1bmN0aW9uIGlzQ3JlYXRvclJpY2hUZXh0UnVudGltZU5vZGUobm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgY29uc3QgbmFtZSA9IFN0cmluZyhub2RlICYmIG5vZGUubmFtZSB8fCAnJyk7XG4gICAgcmV0dXJuIG5hbWUgPT09ICdSSUNIVEVYVF9DSElMRCcgfHwgbmFtZSA9PT0gJ1JJQ0hURVhUX0ltYWdlX0NISUxEJztcbn1cblxuZnVuY3Rpb24gZmluZEZ0b2NSaWNoVGV4dFJlbmRlcmVyTm9kZShub2RlOiBhbnksIFJpY2hUZXh0OiBhbnkpOiBhbnkge1xuICAgIGlmICghbm9kZSB8fCAhUmljaFRleHQpIHJldHVybiBudWxsO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgKG5vZGUuY2hpbGRyZW4gfHwgW10pKSB7XG4gICAgICAgIGlmIChpc0Z0b2NSaWNoVGV4dFJlbmRlcmVyTm9kZShjaGlsZCkgJiYgY2hpbGQuZ2V0Q29tcG9uZW50ICYmIGNoaWxkLmdldENvbXBvbmVudChSaWNoVGV4dCkpIHtcbiAgICAgICAgICAgIHJldHVybiBjaGlsZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZmluZEZ0b2NSaWNoVGV4dFNoYWRvd05vZGUobm9kZTogYW55LCBSaWNoVGV4dDogYW55KTogYW55IHtcbiAgICBpZiAoIW5vZGUgfHwgIVJpY2hUZXh0KSByZXR1cm4gbnVsbDtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIChub2RlLmNoaWxkcmVuIHx8IFtdKSkge1xuICAgICAgICBpZiAoaXNGdG9jUmljaFRleHRTaGFkb3dOb2RlKGNoaWxkKSAmJiBjaGlsZC5nZXRDb21wb25lbnQgJiYgY2hpbGQuZ2V0Q29tcG9uZW50KFJpY2hUZXh0KSkge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExvZ2ljYWxUZXh0VGFyZ2V0IHtcbiAgICBraW5kOiAnbGFiZWwnIHwgJ3JpY2hUZXh0JztcbiAgICBjb21wb25lbnQ6IGFueTtcbiAgICBhdXRob3JlZE5vZGU6IGFueTtcbiAgICByZW5kZXJlck5vZGU6IGFueSB8IG51bGw7XG59XG5cbi8qKlxuICogQHpoIOino+aekOS4gOS4qiBhdXRob3JlZCDmlofmnKzoioLngrnnmoTpgLvovpHnu4Tku7bjgIJcbiAqICAgICDmma7pgJogTGFiZWwg5LyY5YWI77yb5b2TIExhYmVsIOiiqyBGdG9DIOWPl+aOp+i9rOaNouS4uiBkaXNhYmxlZCDkuJTmnIkgcmVuZGVyZXIg5a2Q6IqC54K55pe277yMXG4gKiAgICAgcmVuZGVyZXIgUmljaFRleHQg5omN5piv5Y+v5pu/5o2iL+WPjeWvvOeahOWUr+S4gOmAu+i+keebruagh+OAglxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUxvZ2ljYWxUZXh0VGFyZ2V0KG5vZGU6IGFueSwgTGFiZWw6IGFueSwgUmljaFRleHQ6IGFueSk6IExvZ2ljYWxUZXh0VGFyZ2V0IHwgbnVsbCB7XG4gICAgaWYgKCFub2RlIHx8ICFub2RlLmdldENvbXBvbmVudCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgbGFiZWwgPSBMYWJlbCA/IG5vZGUuZ2V0Q29tcG9uZW50KExhYmVsKSA6IG51bGw7XG4gICAgY29uc3QgZGlyZWN0UmljaFRleHQgPSBSaWNoVGV4dCA/IG5vZGUuZ2V0Q29tcG9uZW50KFJpY2hUZXh0KSA6IG51bGw7XG4gICAgY29uc3QgcmVuZGVyZXJOb2RlID0gZmluZEZ0b2NSaWNoVGV4dFJlbmRlcmVyTm9kZShub2RlLCBSaWNoVGV4dCk7XG4gICAgY29uc3QgcmVuZGVyZXJSaWNoVGV4dCA9IHJlbmRlcmVyTm9kZSAmJiByZW5kZXJlck5vZGUuZ2V0Q29tcG9uZW50XG4gICAgICAgID8gcmVuZGVyZXJOb2RlLmdldENvbXBvbmVudChSaWNoVGV4dClcbiAgICAgICAgOiBudWxsO1xuXG4gICAgaWYgKHJlbmRlcmVyUmljaFRleHQgJiYgKCFsYWJlbCB8fCBsYWJlbC5lbmFibGVkID09PSBmYWxzZSB8fCBsYWJlbC5fZW5hYmxlZCA9PT0gZmFsc2UpKSB7XG4gICAgICAgIHJldHVybiB7IGtpbmQ6ICdyaWNoVGV4dCcsIGNvbXBvbmVudDogcmVuZGVyZXJSaWNoVGV4dCwgYXV0aG9yZWROb2RlOiBub2RlLCByZW5kZXJlck5vZGUgfTtcbiAgICB9XG4gICAgaWYgKGRpcmVjdFJpY2hUZXh0ICYmICghbGFiZWwgfHwgbGFiZWwuZW5hYmxlZCA9PT0gZmFsc2UgfHwgbGFiZWwuX2VuYWJsZWQgPT09IGZhbHNlKSkge1xuICAgICAgICByZXR1cm4geyBraW5kOiAncmljaFRleHQnLCBjb21wb25lbnQ6IGRpcmVjdFJpY2hUZXh0LCBhdXRob3JlZE5vZGU6IG5vZGUsIHJlbmRlcmVyTm9kZTogbnVsbCB9O1xuICAgIH1cbiAgICBpZiAobGFiZWwpIHJldHVybiB7IGtpbmQ6ICdsYWJlbCcsIGNvbXBvbmVudDogbGFiZWwsIGF1dGhvcmVkTm9kZTogbm9kZSwgcmVuZGVyZXJOb2RlOiBudWxsIH07XG4gICAgaWYgKHJlbmRlcmVyUmljaFRleHQpIHJldHVybiB7IGtpbmQ6ICdyaWNoVGV4dCcsIGNvbXBvbmVudDogcmVuZGVyZXJSaWNoVGV4dCwgYXV0aG9yZWROb2RlOiBub2RlLCByZW5kZXJlck5vZGUgfTtcbiAgICBpZiAoZGlyZWN0UmljaFRleHQpIHJldHVybiB7IGtpbmQ6ICdyaWNoVGV4dCcsIGNvbXBvbmVudDogZGlyZWN0UmljaFRleHQsIGF1dGhvcmVkTm9kZTogbm9kZSwgcmVuZGVyZXJOb2RlOiBudWxsIH07XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGdldExvZ2ljYWxSaWNoVGV4dChub2RlOiBhbnksIFJpY2hUZXh0OiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IGxvZ2ljYWwgPSByZXNvbHZlTG9naWNhbFRleHRUYXJnZXQobm9kZSwgbnVsbCwgUmljaFRleHQpO1xuICAgIHJldHVybiBsb2dpY2FsICYmIGxvZ2ljYWwua2luZCA9PT0gJ3JpY2hUZXh0JyA/IGxvZ2ljYWwuY29tcG9uZW50IDogbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdW50RnRvY1JpY2hUZXh0UmVuZGVyZXIoXG4gICAgcGFyZW50OiBhbnksXG4gICAgZmlnbWFOb2RlOiBhbnksXG4gICAgYXV0aG9yZWRXaWR0aDogbnVtYmVyLFxuICAgIGF1dGhvcmVkSGVpZ2h0OiBudW1iZXIsXG4gICAgY2M6IGFueSxcbik6IHsgbm9kZTogYW55OyB1aTogYW55OyByaWNoVGV4dDogYW55OyBwbGFuOiBSaWNoVGV4dFJlbmRlcmVyTGF5b3V0UGxhbjsgY3JlYXRlZDogYm9vbGVhbiB9IHtcbiAgICBjb25zdCB7IE5vZGUsIFVJVHJhbnNmb3JtLCBSaWNoVGV4dCwgVmVjMyB9ID0gY2M7XG4gICAgY29uc3QgcGFyZW50VWkgPSBwYXJlbnQgJiYgcGFyZW50LmdldENvbXBvbmVudCA/IHBhcmVudC5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pIDogbnVsbDtcbiAgICBjb25zdCBwYXJlbnRBbmNob3IgPSByZWFkVWlBbmNob3IocGFyZW50VWkpO1xuICAgIGNvbnN0IHBsYW4gPSBwbGFuUmljaFRleHRSZW5kZXJlckxheW91dChcbiAgICAgICAgZmlnbWFOb2RlLFxuICAgICAgICBhdXRob3JlZFdpZHRoLFxuICAgICAgICBhdXRob3JlZEhlaWdodCxcbiAgICAgICAgcGFyZW50QW5jaG9yLngsXG4gICAgICAgIHBhcmVudEFuY2hvci55LFxuICAgICk7XG4gICAgbGV0IHJlbmRlcmVyID0gZmluZEZ0b2NSaWNoVGV4dFJlbmRlcmVyTm9kZShwYXJlbnQsIFJpY2hUZXh0KTtcbiAgICBjb25zdCBjcmVhdGVkID0gIXJlbmRlcmVyO1xuICAgIGlmICghcmVuZGVyZXIpIHtcbiAgICAgICAgcmVuZGVyZXIgPSBuZXcgTm9kZShGVE9DX1JJQ0hfVEVYVF9SRU5ERVJFUl9OQU1FKTtcbiAgICAgICAgcmVuZGVyZXIuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIHBhcmVudC5hZGRDaGlsZChyZW5kZXJlcik7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgcGFyZW50LmxheWVyID09PSAnbnVtYmVyJykgcmVuZGVyZXIubGF5ZXIgPSBwYXJlbnQubGF5ZXI7XG4gICAgLy8gQSBwcmlvciBidWlsZCBtYXkgaGF2ZSBsZWZ0IHRoZSByZXVzYWJsZSByZW5kZXJlciBpbmFjdGl2ZSB3aGlsZSBpdHNcbiAgICAvLyBhdXRob3JlZCBwYXJlbnQgd2FzIGJlaW5nIHBhdGNoZWQuIFJlc3RvcmUgdmlzaWJpbGl0eSBvbiByZXVzZTsgbmV3bHlcbiAgICAvLyBjcmVhdGVkIG5vZGVzIHN0YXkgaW5hY3RpdmUgdW50aWwgdGhlIGNhbGxlciBoYXMgZmluaXNoZWQgY29uZmlndXJpbmcgdGV4dC5cbiAgICBpZiAoIWNyZWF0ZWQpIHJlbmRlcmVyLmFjdGl2ZSA9IHRydWU7XG4gICAgY29uc3QgdWkgPSByZW5kZXJlci5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pIHx8IHJlbmRlcmVyLmFkZENvbXBvbmVudChVSVRyYW5zZm9ybSk7XG4gICAgaWYgKGNyZWF0ZWQpIHtcbiAgICAgICAgdWkuc2V0Q29udGVudFNpemUoTWF0aC5tYXgoMCwgTnVtYmVyKGF1dGhvcmVkV2lkdGgpIHx8IDApLCBNYXRoLm1heCgwLCBOdW1iZXIoYXV0aG9yZWRIZWlnaHQpIHx8IDApKTtcbiAgICB9XG4gICAgdWkuc2V0QW5jaG9yUG9pbnQocGxhbi5hbmNob3JYLCBwbGFuLmFuY2hvclkpO1xuICAgIHJlbmRlcmVyLnNldFBvc2l0aW9uKG5ldyBWZWMzKHBsYW4ubG9jYWxYLCBwbGFuLmxvY2FsWSwgMCkpO1xuICAgIHJlbmRlcmVyLmFuZ2xlID0gMDtcbiAgICByZW5kZXJlci5zZXRTY2FsZShuZXcgVmVjMygxLCAxLCAxKSk7XG4gICAgY29uc3QgcmljaFRleHQgPSByZW5kZXJlci5nZXRDb21wb25lbnQoUmljaFRleHQpIHx8IHJlbmRlcmVyLmFkZENvbXBvbmVudChSaWNoVGV4dCk7XG4gICAgcmljaFRleHQubWF4V2lkdGggPSBwbGFuLm1heFdpZHRoO1xuICAgIHJldHVybiB7IG5vZGU6IHJlbmRlcmVyLCB1aSwgcmljaFRleHQsIHBsYW4sIGNyZWF0ZWQgfTtcbn1cblxuLyoqIEB6aCDlsYDpg6jmm7/mjaLlkI7lj6rph43mjpIgcmVuZGVyZXLvvJvniLboioLngrnlvZPliY3lsLrlr7jlp4vnu4jmmK8gYXV0aG9yZWQg5Yeg5L2V55yf5YC844CCICovXG5leHBvcnQgZnVuY3Rpb24gc3luY0Z0b2NSaWNoVGV4dFJlbmRlcmVyTGF5b3V0KFxuICAgIHBhcmVudDogYW55LFxuICAgIGZpZ21hTm9kZTogYW55LFxuICAgIGNjOiBhbnksXG4pOiBSaWNoVGV4dFJlbmRlcmVyTGF5b3V0UGxhbiB8IG51bGwge1xuICAgIGNvbnN0IHsgVUlUcmFuc2Zvcm0sIFJpY2hUZXh0LCBWZWMzIH0gPSBjYztcbiAgICBjb25zdCByZW5kZXJlciA9IGZpbmRGdG9jUmljaFRleHRSZW5kZXJlck5vZGUocGFyZW50LCBSaWNoVGV4dCk7XG4gICAgaWYgKCFyZW5kZXJlcikgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcGFyZW50VWkgPSBwYXJlbnQgJiYgcGFyZW50LmdldENvbXBvbmVudCA/IHBhcmVudC5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pIDogbnVsbDtcbiAgICBjb25zdCByZW5kZXJlclVpID0gcmVuZGVyZXIuZ2V0Q29tcG9uZW50ID8gcmVuZGVyZXIuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKSA6IG51bGw7XG4gICAgY29uc3QgcmljaFRleHQgPSByZW5kZXJlci5nZXRDb21wb25lbnQgPyByZW5kZXJlci5nZXRDb21wb25lbnQoUmljaFRleHQpIDogbnVsbDtcbiAgICBpZiAoIXBhcmVudFVpIHx8ICFyZW5kZXJlclVpIHx8ICFyaWNoVGV4dCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3Qgc2l6ZSA9IHJlYWRVaVNpemUocGFyZW50VWkpO1xuICAgIGNvbnN0IGFuY2hvciA9IHJlYWRVaUFuY2hvcihwYXJlbnRVaSk7XG4gICAgY29uc3QgcGxhbiA9IHBsYW5SaWNoVGV4dFJlbmRlcmVyTGF5b3V0KGZpZ21hTm9kZSwgc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQsIGFuY2hvci54LCBhbmNob3IueSk7XG4gICAgcmVuZGVyZXJVaS5zZXRBbmNob3JQb2ludChwbGFuLmFuY2hvclgsIHBsYW4uYW5jaG9yWSk7XG4gICAgcmVuZGVyZXIuc2V0UG9zaXRpb24obmV3IFZlYzMocGxhbi5sb2NhbFgsIHBsYW4ubG9jYWxZLCAwKSk7XG4gICAgcmljaFRleHQubWF4V2lkdGggPSBwbGFuLm1heFdpZHRoO1xuICAgIHJldHVybiBwbGFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJpY2hUZXh0U2hhZG93TW91bnRSZXN1bHQge1xuICAgIGFwcGxpZWQ6IGJvb2xlYW47XG4gICAgYmx1ckZhbGxiYWNrOiBib29sZWFuO1xuICAgIG5vZGU6IGFueSB8IG51bGw7XG4gICAgcmljaFRleHQ6IGFueSB8IG51bGw7XG4gICAgd2FybmluZzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiByZW1vdmVGdG9jUmljaFRleHRTaGFkb3cobm9kZTogYW55LCBSaWNoVGV4dDogYW55KTogdm9pZCB7XG4gICAgY29uc3Qgc2hhZG93ID0gZmluZEZ0b2NSaWNoVGV4dFNoYWRvd05vZGUobm9kZSwgUmljaFRleHQpO1xuICAgIGlmICghc2hhZG93KSByZXR1cm47XG4gICAgc2hhZG93LmFjdGl2ZSA9IGZhbHNlO1xuICAgIGlmICh0eXBlb2Ygc2hhZG93LnJlbW92ZUZyb21QYXJlbnQgPT09ICdmdW5jdGlvbicpIHNoYWRvdy5yZW1vdmVGcm9tUGFyZW50KCk7XG4gICAgaWYgKHR5cGVvZiBzaGFkb3cuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykgc2hhZG93LmRlc3Ryb3koKTtcbn1cblxuLyoqXG4gKiBAemggUmljaFRleHQg5rKh5pyJ5Y+v5bqP5YiX5YyW55qE6Zi05b2x5bGe5oCn77yb5byV5pOO5YaF6YOoIFJJQ0hURVhUX0NISUxEIOWPiOiiq+agh+iusOS4uiBEb250U2F2ZeOAglxuICogICAgIOWboOatpOeUqOS4gOS4quWPl+aOp+OAgeWPr+S/neWtmOeahCBSaWNoVGV4dCBzaWJsaW5nIOaJv+i9veehrOmYtOW9se+8jOW5tuWni+e7iOaOkuWcqOS4uyByZW5kZXJlciDlkI7pnaLjgIJcbiAqICAgICDlvZPliY3kuJrliqHmoLfmnKwgYmx1ci9yYWRpdXMg5Z2H5Li6IDDvvJvpnZ7pm7YgYmx1ciDmmI7noa7orrDkuLogZmFsbGJhY2vvvIzkuI3lhpLlhYXnsr7noa7ov5jljp/jgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1vdW50RnRvY1JpY2hUZXh0U2hhZG93KFxuICAgIGF1dGhvcmVkTm9kZTogYW55LFxuICAgIGZpZ21hTm9kZTogYW55LFxuICAgIG1haW5SaWNoVGV4dDogYW55LFxuICAgIGNjOiBhbnksXG4pOiBSaWNoVGV4dFNoYWRvd01vdW50UmVzdWx0IHtcbiAgICBjb25zdCB7IE5vZGUsIFVJVHJhbnNmb3JtLCBSaWNoVGV4dCwgVmVjMywgQ29sb3IgfSA9IGNjIHx8IHt9O1xuICAgIGNvbnN0IHNoYWRvdyA9IGZpZ21hTm9kZSAmJiBmaWdtYU5vZGUuc2hhZG93O1xuICAgIGlmICghc2hhZG93IHx8ICFzaGFkb3cuY29sb3IpIHtcbiAgICAgICAgcmVtb3ZlRnRvY1JpY2hUZXh0U2hhZG93KGF1dGhvcmVkTm9kZSwgUmljaFRleHQpO1xuICAgICAgICByZXR1cm4geyBhcHBsaWVkOiBmYWxzZSwgYmx1ckZhbGxiYWNrOiBmYWxzZSwgbm9kZTogbnVsbCwgcmljaFRleHQ6IG51bGwsIHdhcm5pbmc6ICcnIH07XG4gICAgfVxuICAgIGNvbnN0IG1haW5Ob2RlID0gbWFpblJpY2hUZXh0ICYmIG1haW5SaWNoVGV4dC5ub2RlO1xuICAgIGNvbnN0IHJlbmRlcmVyID0gZmluZEZ0b2NSaWNoVGV4dFJlbmRlcmVyTm9kZShhdXRob3JlZE5vZGUsIFJpY2hUZXh0KTtcbiAgICBpZiAoIU5vZGUgfHwgIVVJVHJhbnNmb3JtIHx8ICFSaWNoVGV4dCB8fCAhVmVjMyB8fCAhQ29sb3IgfHwgIXJlbmRlcmVyIHx8IHJlbmRlcmVyICE9PSBtYWluTm9kZSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgYXBwbGllZDogZmFsc2UsXG4gICAgICAgICAgICBibHVyRmFsbGJhY2s6IE51bWJlcihzaGFkb3cuYmx1cikgPiAwLFxuICAgICAgICAgICAgbm9kZTogbnVsbCxcbiAgICAgICAgICAgIHJpY2hUZXh0OiBudWxsLFxuICAgICAgICAgICAgd2FybmluZzogYOebruagh+iKgueCueOAjCR7YXV0aG9yZWROb2RlICYmIChhdXRob3JlZE5vZGUubmFtZSB8fCBhdXRob3JlZE5vZGUudXVpZCkgfHwgJyd944CN5LiN5pivIEZ0b0MgYXV0aG9yZWQgUmljaFRleHQg57uT5p6E77yM6Zi05b2x5pyq5bqU55So44CCYCxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBsZXQgc2hhZG93Tm9kZSA9IGZpbmRGdG9jUmljaFRleHRTaGFkb3dOb2RlKGF1dGhvcmVkTm9kZSwgUmljaFRleHQpO1xuICAgIGlmICghc2hhZG93Tm9kZSkge1xuICAgICAgICBzaGFkb3dOb2RlID0gbmV3IE5vZGUoRlRPQ19SSUNIX1RFWFRfU0hBRE9XX05BTUUpO1xuICAgICAgICBzaGFkb3dOb2RlLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICBhdXRob3JlZE5vZGUuYWRkQ2hpbGQoc2hhZG93Tm9kZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc2hhZG93Tm9kZS5hY3RpdmUgPSBmYWxzZTtcbiAgICB9XG4gICAgc2hhZG93Tm9kZS5sYXllciA9IHR5cGVvZiByZW5kZXJlci5sYXllciA9PT0gJ251bWJlcicgPyByZW5kZXJlci5sYXllciA6IGF1dGhvcmVkTm9kZS5sYXllcjtcblxuICAgIGNvbnN0IG1haW5VaSA9IHJlbmRlcmVyLmdldENvbXBvbmVudChVSVRyYW5zZm9ybSk7XG4gICAgY29uc3QgbWFpblNpemUgPSByZWFkVWlTaXplKG1haW5VaSk7XG4gICAgY29uc3QgbWFpbkFuY2hvciA9IHJlYWRVaUFuY2hvcihtYWluVWkpO1xuICAgIGNvbnN0IHNoYWRvd1VpID0gc2hhZG93Tm9kZS5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pIHx8IHNoYWRvd05vZGUuYWRkQ29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICBzaGFkb3dVaS5zZXRDb250ZW50U2l6ZShtYWluU2l6ZS53aWR0aCwgbWFpblNpemUuaGVpZ2h0KTtcbiAgICBzaGFkb3dVaS5zZXRBbmNob3JQb2ludChtYWluQW5jaG9yLngsIG1haW5BbmNob3IueSk7XG5cbiAgICBjb25zdCBtYWluUG9zaXRpb24gPSByZWFkTm9kZVBvc2l0aW9uKHJlbmRlcmVyKTtcbiAgICBzaGFkb3dOb2RlLnNldFBvc2l0aW9uKG5ldyBWZWMzKFxuICAgICAgICBtYWluUG9zaXRpb24ueCArIChOdW1iZXIoc2hhZG93Lm9mZnNldFgpIHx8IDApLFxuICAgICAgICBtYWluUG9zaXRpb24ueSAtIChOdW1iZXIoc2hhZG93Lm9mZnNldFkpIHx8IDApLFxuICAgICAgICAwLFxuICAgICkpO1xuICAgIHNoYWRvd05vZGUuYW5nbGUgPSBOdW1iZXIocmVuZGVyZXIuYW5nbGUpIHx8IDA7XG4gICAgY29uc3QgbWFpblNjYWxlID0gcmVhZE5vZGVTY2FsZShyZW5kZXJlcik7XG4gICAgc2hhZG93Tm9kZS5zZXRTY2FsZShuZXcgVmVjMyhtYWluU2NhbGUueCwgbWFpblNjYWxlLnksIDEpKTtcblxuICAgIGNvbnN0IHNoYWRvd1JpY2hUZXh0ID0gc2hhZG93Tm9kZS5nZXRDb21wb25lbnQoUmljaFRleHQpIHx8IHNoYWRvd05vZGUuYWRkQ29tcG9uZW50KFJpY2hUZXh0KTtcbiAgICBzaGFkb3dSaWNoVGV4dC5lbmFibGVkID0gZmFsc2U7XG4gICAgc2hhZG93UmljaFRleHQuc3RyaW5nID0gYnVpbGRSaWNoVGV4dFNoYWRvd1N0cmluZyhTdHJpbmcoZmlnbWFOb2RlLmNoYXJhY3RlcnMgfHwgJycpLCBmaWdtYU5vZGUpO1xuICAgIHNoYWRvd1JpY2hUZXh0LmZvbnRTaXplID0gTnVtYmVyKG1haW5SaWNoVGV4dC5mb250U2l6ZSkgfHwgTnVtYmVyKGZpZ21hTm9kZS5mb250U2l6ZSkgfHwgMDtcbiAgICBzaGFkb3dSaWNoVGV4dC5saW5lSGVpZ2h0ID0gTnVtYmVyKG1haW5SaWNoVGV4dC5saW5lSGVpZ2h0KSB8fCBOdW1iZXIoZmlnbWFOb2RlLmxpbmVIZWlnaHQpIHx8IHNoYWRvd1JpY2hUZXh0LmZvbnRTaXplO1xuICAgIHNoYWRvd1JpY2hUZXh0Lmhvcml6b250YWxBbGlnbiA9IG1haW5SaWNoVGV4dC5ob3Jpem9udGFsQWxpZ247XG4gICAgc2hhZG93UmljaFRleHQudmVydGljYWxBbGlnbiA9IG1haW5SaWNoVGV4dC52ZXJ0aWNhbEFsaWduO1xuICAgIHNoYWRvd1JpY2hUZXh0Lm1heFdpZHRoID0gTnVtYmVyKG1haW5SaWNoVGV4dC5tYXhXaWR0aCkgfHwgMDtcbiAgICBzaGFkb3dSaWNoVGV4dC5mb250ID0gbWFpblJpY2hUZXh0LmZvbnQgfHwgbnVsbDtcbiAgICBzaGFkb3dSaWNoVGV4dC51c2VTeXN0ZW1Gb250ID0gISFtYWluUmljaFRleHQudXNlU3lzdGVtRm9udDtcbiAgICBpZiAobWFpblJpY2hUZXh0LmZvbnRGYW1pbHkpIHNoYWRvd1JpY2hUZXh0LmZvbnRGYW1pbHkgPSBtYWluUmljaFRleHQuZm9udEZhbWlseTtcbiAgICBpZiAodHlwZW9mIG1haW5SaWNoVGV4dC5jYWNoZU1vZGUgIT09ICd1bmRlZmluZWQnKSBzaGFkb3dSaWNoVGV4dC5jYWNoZU1vZGUgPSBtYWluUmljaFRleHQuY2FjaGVNb2RlO1xuICAgIHNoYWRvd1JpY2hUZXh0LmhhbmRsZVRvdWNoRXZlbnQgPSBmYWxzZTtcbiAgICBjb25zdCBjb2xvciA9IHNoYWRvdy5jb2xvcjtcbiAgICBzaGFkb3dSaWNoVGV4dC5mb250Q29sb3IgPSBuZXcgQ29sb3IoY29sb3IuciwgY29sb3IuZywgY29sb3IuYiwgY29sb3IuYSA9PSBudWxsID8gMjU1IDogY29sb3IuYSk7XG4gICAgc2hhZG93UmljaFRleHQuZW5hYmxlZCA9IG1haW5SaWNoVGV4dC5lbmFibGVkICE9PSBmYWxzZSAmJiBtYWluUmljaFRleHQuX2VuYWJsZWQgIT09IGZhbHNlO1xuXG4gICAgY29uc3QgbWFpbkluZGV4ID0gdHlwZW9mIHJlbmRlcmVyLmdldFNpYmxpbmdJbmRleCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICA/IHJlbmRlcmVyLmdldFNpYmxpbmdJbmRleCgpXG4gICAgICAgIDogKGF1dGhvcmVkTm9kZS5jaGlsZHJlbiB8fCBbXSkuaW5kZXhPZihyZW5kZXJlcik7XG4gICAgY29uc3Qgc2hhZG93SW5kZXggPSB0eXBlb2Ygc2hhZG93Tm9kZS5nZXRTaWJsaW5nSW5kZXggPT09ICdmdW5jdGlvbidcbiAgICAgICAgPyBzaGFkb3dOb2RlLmdldFNpYmxpbmdJbmRleCgpXG4gICAgICAgIDogKGF1dGhvcmVkTm9kZS5jaGlsZHJlbiB8fCBbXSkuaW5kZXhPZihzaGFkb3dOb2RlKTtcbiAgICBpZiAodHlwZW9mIHNoYWRvd05vZGUuc2V0U2libGluZ0luZGV4ID09PSAnZnVuY3Rpb24nICYmIG1haW5JbmRleCA+PSAwICYmIHNoYWRvd0luZGV4ID49IDApIHtcbiAgICAgICAgc2hhZG93Tm9kZS5zZXRTaWJsaW5nSW5kZXgoc2hhZG93SW5kZXggPiBtYWluSW5kZXggPyBtYWluSW5kZXggOiBNYXRoLm1heCgwLCBtYWluSW5kZXggLSAxKSk7XG4gICAgfVxuICAgIHNoYWRvd05vZGUuYWN0aXZlID0gcmVuZGVyZXIuYWN0aXZlICE9PSBmYWxzZTtcbiAgICByZXR1cm4ge1xuICAgICAgICBhcHBsaWVkOiB0cnVlLFxuICAgICAgICBibHVyRmFsbGJhY2s6IE51bWJlcihzaGFkb3cuYmx1cikgPiAwLFxuICAgICAgICBub2RlOiBzaGFkb3dOb2RlLFxuICAgICAgICByaWNoVGV4dDogc2hhZG93UmljaFRleHQsXG4gICAgICAgIHdhcm5pbmc6IE51bWJlcihzaGFkb3cuYmx1cikgPiAwXG4gICAgICAgICAgICA/IGDnm67moIfoioLngrnjgIwke2F1dGhvcmVkTm9kZS5uYW1lIHx8IGF1dGhvcmVkTm9kZS51dWlkfeOAjeeahCBSaWNoVGV4dCDpmLTlvbEgYmx1cj0ke051bWJlcihzaGFkb3cuYmx1cil9IOaaguaMiSAwIOa4suafk+OAgmBcbiAgICAgICAgICAgIDogJycsXG4gICAgfTtcbn1cblxuLyoqXG4gKiBAemgg5oyJIFVJVHJhbnNmb3JtIOmUmueCueiuoeeul+iKgueCueS9jee9ruOAglxuICogICAgIHgveSDmmK8gRmlnbWEg5bem5LiK5Y6f54K55Z2Q5qCH77yM6L+U5Zue5YC85pivIENvY29zIOeItuiKgueCueS4reW/g+WOn+eCueWdkOagh+OAglxuICovXG5leHBvcnQgZnVuY3Rpb24gcG9zaXRpb25Gb3JBbmNob3IoXG4gICAgeDogbnVtYmVyLFxuICAgIHk6IG51bWJlcixcbiAgICB3aWR0aDogbnVtYmVyLFxuICAgIGhlaWdodDogbnVtYmVyLFxuICAgIHBhcmVudFdpZHRoOiBudW1iZXIsXG4gICAgcGFyZW50SGVpZ2h0OiBudW1iZXIsXG4gICAgYW5jaG9yWCA9IDAuNSxcbiAgICBhbmNob3JZID0gMC41LFxuKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgICBjb25zdCB3ID0gTnVtYmVyKHdpZHRoKSB8fCAwO1xuICAgIGNvbnN0IGggPSBOdW1iZXIoaGVpZ2h0KSB8fCAwO1xuICAgIGNvbnN0IHB4ID0gTnVtYmVyLmlzRmluaXRlKGFuY2hvclgpID8gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgYW5jaG9yWCkpIDogMC41O1xuICAgIGNvbnN0IHB5ID0gTnVtYmVyLmlzRmluaXRlKGFuY2hvclkpID8gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgYW5jaG9yWSkpIDogMC41O1xuICAgIHJldHVybiB7XG4gICAgICAgIHg6IChOdW1iZXIoeCkgfHwgMCkgKyBweCAqIHcgLSAoTnVtYmVyKHBhcmVudFdpZHRoKSB8fCAwKSAvIDIsXG4gICAgICAgIHk6IChOdW1iZXIocGFyZW50SGVpZ2h0KSB8fCAwKSAvIDIgLSAoKE51bWJlcih5KSB8fCAwKSArICgxIC0gcHkpICogaCksXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gdmlzdWFsQ2VudGVyT2Zmc2V0RnJvbUFuY2hvcihcbiAgICB3aWR0aDogbnVtYmVyLFxuICAgIGhlaWdodDogbnVtYmVyLFxuICAgIGFuY2hvclg6IG51bWJlcixcbiAgICBhbmNob3JZOiBudW1iZXIsXG4gICAgc2NhbGVYOiBudW1iZXIsXG4gICAgc2NhbGVZOiBudW1iZXIsXG4gICAgbm9kZUFuZ2xlOiBudW1iZXIsXG4pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHcgPSBOdW1iZXIod2lkdGgpIHx8IDA7XG4gICAgY29uc3QgaCA9IE51bWJlcihoZWlnaHQpIHx8IDA7XG4gICAgY29uc3QgcHggPSBOdW1iZXIuaXNGaW5pdGUoYW5jaG9yWCkgPyBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBhbmNob3JYKSkgOiAwLjU7XG4gICAgY29uc3QgcHkgPSBOdW1iZXIuaXNGaW5pdGUoYW5jaG9yWSkgPyBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBhbmNob3JZKSkgOiAwLjU7XG4gICAgY29uc3Qgc3ggPSBOdW1iZXIuaXNGaW5pdGUoc2NhbGVYKSA/IHNjYWxlWCA6IDE7XG4gICAgY29uc3Qgc3kgPSBOdW1iZXIuaXNGaW5pdGUoc2NhbGVZKSA/IHNjYWxlWSA6IDE7XG4gICAgY29uc3QgYW5nbGVSYWQgPSAoTnVtYmVyLmlzRmluaXRlKG5vZGVBbmdsZSkgPyBub2RlQW5nbGUgOiAwKSAqIE1hdGguUEkgLyAxODA7XG4gICAgY29uc3QgbG9jYWxYID0gKDAuNSAtIHB4KSAqIHcgKiBzeDtcbiAgICBjb25zdCBsb2NhbFkgPSAoMC41IC0gcHkpICogaCAqIHN5O1xuICAgIHJldHVybiB7XG4gICAgICAgIHg6IGxvY2FsWCAqIE1hdGguY29zKGFuZ2xlUmFkKSAtIGxvY2FsWSAqIE1hdGguc2luKGFuZ2xlUmFkKSxcbiAgICAgICAgeTogbG9jYWxYICogTWF0aC5zaW4oYW5nbGVSYWQpICsgbG9jYWxZICogTWF0aC5jb3MoYW5nbGVSYWQpLFxuICAgIH07XG59XG5cbi8qKlxuICogQHpoIOW4pue8qeaUvi/ml4vovazml7bvvIzmjInop4bop4nkuK3lv4Plj43mjqggQ29jb3Mg6ZSa54K55L2N572u44CCXG4gKiAgICAgRmlnbWEgeC95IOihqOekuuWbtOe7leinhuinieS4reW/g+W9kuS4gOWMluWQjueahOW3puS4iuWdkOagh++8m0NvY29zIHBvc2l0aW9uIOihqOekuumUmueCueS9jee9ruOAglxuICovXG5leHBvcnQgZnVuY3Rpb24gcG9zaXRpb25Gb3JUcmFuc2Zvcm1lZEFuY2hvcihcbiAgICB4OiBudW1iZXIsXG4gICAgeTogbnVtYmVyLFxuICAgIHdpZHRoOiBudW1iZXIsXG4gICAgaGVpZ2h0OiBudW1iZXIsXG4gICAgcGFyZW50V2lkdGg6IG51bWJlcixcbiAgICBwYXJlbnRIZWlnaHQ6IG51bWJlcixcbiAgICBhbmNob3JYID0gMC41LFxuICAgIGFuY2hvclkgPSAwLjUsXG4gICAgc2NhbGVYID0gMSxcbiAgICBzY2FsZVkgPSAxLFxuICAgIGZpZ21hUm90YXRpb24gPSAwLFxuKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgICBjb25zdCBjZW50ZXIgPSBwb3NpdGlvbkZvckFuY2hvcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBwYXJlbnRXaWR0aCwgcGFyZW50SGVpZ2h0LCAwLjUsIDAuNSk7XG4gICAgY29uc3Qgb2Zmc2V0ID0gdmlzdWFsQ2VudGVyT2Zmc2V0RnJvbUFuY2hvcihcbiAgICAgICAgd2lkdGgsXG4gICAgICAgIGhlaWdodCxcbiAgICAgICAgYW5jaG9yWCxcbiAgICAgICAgYW5jaG9yWSxcbiAgICAgICAgc2NhbGVYLFxuICAgICAgICBzY2FsZVksXG4gICAgICAgIC1maWdtYVJvdGF0aW9uLFxuICAgICk7XG4gICAgcmV0dXJuIHsgeDogY2VudGVyLnggLSBvZmZzZXQueCwgeTogY2VudGVyLnkgLSBvZmZzZXQueSB9O1xufVxuXG4vKipcbiAqIGNjLkxheW91dCBvd25zIHRoZSBtYWluIGF4aXMsIGJ1dCBIT1JJWk9OVEFML1ZFUlRJQ0FMIGxheW91dHMgcHJlc2VydmUgdGhlXG4gKiBleGlzdGluZyBjcm9zcy1heGlzIGNvb3JkaW5hdGUuIFNlZWQgb25seSB0aGF0IGNvb3JkaW5hdGUgZnJvbSBGaWdtYSBiZWZvcmVcbiAqIExheW91dCBydW5zIHNvIE1JTi9DRU5URVIvTUFYIGFsaWdubWVudCByZW1haW5zIHZpc3VhbGx5IGV4YWN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcG9zaXRpb25CZWZvcmVNb3VudGVkTGF5b3V0KFxuICAgIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0sXG4gICAgbGF5b3V0TW9kZTogdW5rbm93bixcbik6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gICAgc3dpdGNoIChTdHJpbmcobGF5b3V0TW9kZSB8fCAnJykudG9VcHBlckNhc2UoKSkge1xuICAgICAgICBjYXNlICdIT1JJWk9OVEFMJzogcmV0dXJuIHsgeDogMCwgeTogcG9zaXRpb24ueSB9O1xuICAgICAgICBjYXNlICdWRVJUSUNBTCc6IHJldHVybiB7IHg6IHBvc2l0aW9uLngsIHk6IDAgfTtcbiAgICAgICAgY2FzZSAnR1JJRCc6IHJldHVybiB7IHg6IDAsIHk6IDAgfTtcbiAgICAgICAgZGVmYXVsdDogcmV0dXJuIHsgeDogcG9zaXRpb24ueCwgeTogcG9zaXRpb24ueSB9O1xuICAgIH1cbn1cblxuLyoqIEB6aCBGaWdtYSDlnoLnm7Tlr7npvZAg4oaSIENvY29zIExhYmVsLlZlcnRpY2FsQWxpZ24gKi9cbmZ1bmN0aW9uIG1hcFZBbGlnbihMYWJlbDogYW55LCBhbGlnbjogc3RyaW5nKTogbnVtYmVyIHtcbiAgICBzd2l0Y2ggKFN0cmluZyhhbGlnbiB8fCAnJykudHJpbSgpLnRvVXBwZXJDYXNlKCkpIHtcbiAgICAgICAgY2FzZSAnQ0VOVEVSJzogcmV0dXJuIExhYmVsLlZlcnRpY2FsQWxpZ24uQ0VOVEVSO1xuICAgICAgICBjYXNlICdCT1RUT00nOiByZXR1cm4gTGFiZWwuVmVydGljYWxBbGlnbi5CT1RUT007XG4gICAgICAgIGNhc2UgJ1RPUCc6XG4gICAgICAgIGRlZmF1bHQ6IHJldHVybiBMYWJlbC5WZXJ0aWNhbEFsaWduLlRPUDtcbiAgICB9XG59XG5cbi8qKlxuICogQGVuIEZpZ21hIHRleHRBdXRvUmVzaXplIOKGkiBDb2NvcyBMYWJlbCBvdmVyZmxvdy93cmFwLlxuICogQHpoIEZpZ21hIHRleHRBdXRvUmVzaXplIOKGkiBDb2NvcyBMYWJlbCDmuqLlh7ov5o2i6KGM44CC5a+56b2QIFVuaXR5IFRNUO+8mkF1dG8tV2lkdGgg5LiN5o2i6KGM77yM6LaF5Ye6IEZpZ21hIOahhuaXtuaUtui/m+ahhuWGheOAglxuICogICBXSURUSF9BTkRfSEVJR0hU77yIQXV0by1XaWR0aO+8iSAgICAgICAgICAgICAgICAgICAg4oaSIOS4jeaNouihjCArIFNIUklOS++8iOS/neeVmSBGaWdtYSDmoYbvvIzpgb/lhY3nnJ/lrp7lrZfkvZPlj5jlrr3lkI7ljovpgrvlsYXvvIlcbiAqICAgVFJVTkNBVEUgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIOKGkiDmjaLooYwgKyBDTEFNUO+8iOaIquaWre+8iVxuICogICBIRUlHSFTvvIhBdXRvLUhlaWdodO+8muWuveWbuuWumuOAgemrmOmaj+aWh+Wtl++8iSAgICAgICAgICDihpIg5o2i6KGMICsgUkVTSVpFX0hFSUdIVO+8iOmUgSBGaWdtYSDmoYblrr3mjInlrr3mjaLooYzjgIHpq5joh6rpgILlupTvvIlcbiAqICAgTk9ORSAvIOepuiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICDihpIg5o2i6KGMICsgQ0xBTVDvvIjplIHlrpogRmlnbWEg5a696auY77yM6LaF5Ye65qGG5pe26KOB5YiH77yJXG4gKlxuICog6K+t5LmJ6Zm36Zix77yI5Yu/5YaN6Lip77yJ77yaY2MuTGFiZWwuT3ZlcmZsb3cuTk9ORSDiiaAgVW5pdHkgVGV4dE92ZXJmbG93TW9kZXMuT3ZlcmZsb3fjgIJcbiAqIGNjIOeahCBOT05FIOS8muaXoOinhiBVSVRyYW5zZm9ybSDlrr3luqbjgIHmjInoh6rnhLbmjpLniYjlsLrlr7jmlLnlhpnoioLngrnvvJvlroPkuI3mmK8gRmlnbWEg55qE5Zu65a6a5paH5pys5qGG44CCXG4gKiDlm7rlrprmoYblv4Xpobvkvb/nlKggQ0xBTVAg5omN6IO95Zyo5pyA57uI5paH5a2X5biD5bGA5ZCO5L+d55WZ6K6+6K6h56i/5a696auY44CCQXV0by1IZWlnaHQg5YiZ5L2/55SoIFJFU0laRV9IRUlHSFTjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5VGV4dFNpemluZyhMYWJlbDogYW55LCBsYWJlbDogYW55LCBub2RlOiBhbnkpOiB2b2lkIHtcbiAgICBzd2l0Y2ggKG5vZGUudGV4dEF1dG9SZXNpemUpIHtcbiAgICAgICAgY2FzZSAnV0lEVEhfQU5EX0hFSUdIVCc6XG4gICAgICAgICAgICBsYWJlbC5lbmFibGVXcmFwVGV4dCA9IGZhbHNlO1xuICAgICAgICAgICAgbGFiZWwub3ZlcmZsb3cgPSBMYWJlbC5PdmVyZmxvdy5TSFJJTks7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnVFJVTkNBVEUnOlxuICAgICAgICAgICAgbGFiZWwuZW5hYmxlV3JhcFRleHQgPSB0cnVlO1xuICAgICAgICAgICAgbGFiZWwub3ZlcmZsb3cgPSBMYWJlbC5PdmVyZmxvdy5DTEFNUDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdIRUlHSFQnOlxuICAgICAgICAgICAgbGFiZWwuZW5hYmxlV3JhcFRleHQgPSB0cnVlO1xuICAgICAgICAgICAgbGFiZWwub3ZlcmZsb3cgPSBMYWJlbC5PdmVyZmxvdy5SRVNJWkVfSEVJR0hUO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ05PTkUnOlxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgbGFiZWwuZW5hYmxlV3JhcFRleHQgPSB0cnVlO1xuICAgICAgICAgICAgbGFiZWwub3ZlcmZsb3cgPSBMYWJlbC5PdmVyZmxvdy5DTEFNUDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbn1cblxuLyoqIEB6aCBGaWdtYSBmb250V2VpZ2h0L3N0eWxlIOKGkiBDb2NvcyBMYWJlbCDnmoTnspfkvZMv5pac5L2T5byA5YWz44CCICovXG5mdW5jdGlvbiBhcHBseUZvbnRTdHlsZShsYWJlbDogYW55LCBub2RlOiBhbnkpOiB2b2lkIHtcbiAgICBjb25zdCB3ZWlnaHQgPSBTdHJpbmcobm9kZS5mb250V2VpZ2h0IHx8ICcnKTtcbiAgICBjb25zdCByZWFsV2VpZ2h0Rm9udCA9ICEhbm9kZS5mb250VXVpZCAmJiBub2RlLmZvbnRXZWlnaHRNYXRjaGVkID09PSB0cnVlO1xuICAgIGxhYmVsLmlzQm9sZCA9ICFyZWFsV2VpZ2h0Rm9udCAmJiB3YW50c0JvbGQod2VpZ2h0KTtcbiAgICBsYWJlbC5pc0l0YWxpYyA9IC9pdGFsaWN8b2JsaXF1ZS9pLnRlc3Qod2VpZ2h0KTtcbn1cblxuLyoqIEB6aCBGaWdtYSB0ZXh0RGVjb3JhdGlvbiDihpIgQ29jb3MgTGFiZWwg5pSv5oyB55qE5LiL5YiS57q/77yb5Yig6Zmk57q/IENvY29zIExhYmVsIOaXoOWGhee9ru+8jOaagui3s+i/h+OAgiAqL1xuZnVuY3Rpb24gYXBwbHlUZXh0RGVjb3JhdGlvbihsYWJlbDogYW55LCBub2RlOiBhbnkpOiB2b2lkIHtcbiAgICBjb25zdCBkZWNvcmF0aW9uID0gU3RyaW5nKG5vZGUudGV4dERlY29yYXRpb24gfHwgJycpLnRvVXBwZXJDYXNlKCk7XG4gICAgbGFiZWwuaXNVbmRlcmxpbmUgPSBkZWNvcmF0aW9uID09PSAnVU5ERVJMSU5FJztcbn1cblxuZnVuY3Rpb24gYXBwbHlSaWNoVGV4dERlY29yYXRpb24odGV4dDogc3RyaW5nLCBub2RlOiBhbnksIHN0cm9rZUNvbG9yT3ZlcnJpZGU/OiBhbnkpOiBzdHJpbmcge1xuICAgIGNvbnN0IHN0cm9rZSA9IG5vZGUgJiYgbm9kZS5zdHJva2U7XG4gICAgaWYgKHN0cm9rZSAmJiBzdHJva2UuY29sb3IpIHtcbiAgICAgICAgLy8gQ29jb3MgUmljaFRleHQgcGFyc2VzIHRoaXMgdGFnIGludG8gb3V0bGluZWQgY2hpbGQgTGFiZWxzLCBzbyBtaXhlZFxuICAgICAgICAvLyBjb2xvcnMga2VlcCB0aGUgc2FtZSBGaWdtYSBzdHJva2Ugd2l0aG91dCBhIHNlY29uZCByZW5kZXIgcGF0aC5cbiAgICAgICAgY29uc3Qgd2lkdGggPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKE51bWJlcihzdHJva2Uud2lkdGgpIHx8IDEpKTtcbiAgICAgICAgdGV4dCA9IGA8b3V0bGluZSBjb2xvcj0jJHtjb2xvclRvSGV4KHN0cm9rZUNvbG9yT3ZlcnJpZGUgfHwgc3Ryb2tlLmNvbG9yKX0gd2lkdGg9JHt3aWR0aH0+JHt0ZXh0fTwvb3V0bGluZT5gO1xuICAgIH1cbiAgICBjb25zdCBkZWNvcmF0aW9uID0gU3RyaW5nKG5vZGUudGV4dERlY29yYXRpb24gfHwgJycpLnRvVXBwZXJDYXNlKCk7XG4gICAgaWYgKGRlY29yYXRpb24gPT09ICdVTkRFUkxJTkUnKSByZXR1cm4gYDx1PiR7dGV4dH08L3U+YDtcbiAgICByZXR1cm4gdGV4dDtcbn1cblxuLyoqIEB6aCBGaWdtYSDlrZfph43mmK/lkKbpnIDopoEgQ29jb3Mg5ZCI5oiQ57KX5L2T44CC55yf5a6eIEJvbGQg5a2X5L2T5ZG95Lit5pe25LiN6KaB5YaN5ZCI5oiQ77yM6YG/5YWN5Y+M6YeN5Yqg57KX44CCICovXG5mdW5jdGlvbiB3YW50c0JvbGQod2VpZ2h0OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gL2JvbGR8YmxhY2t8aGVhdnl8ZXh0cmFib2xkfGV4dHJhXFxzKmJvbGR8c2VtaWJvbGR8c2VtaVxccypib2xkfGRlbWlib2xkfGRlbWlcXHMqYm9sZHxbNi05XTAwL2kudGVzdCh3ZWlnaHQpO1xufVxuXG5pbnRlcmZhY2UgU2xpY2U5Qm9yZGVyIHtcbiAgICBsZWZ0OiBudW1iZXI7XG4gICAgcmlnaHQ6IG51bWJlcjtcbiAgICB0b3A6IG51bWJlcjtcbiAgICBib3R0b206IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEltYWdlRmlsbE1ldGEge1xuICAgIHNvdXJjZT86IHN0cmluZztcbiAgICBzY2FsZU1vZGU/OiBzdHJpbmc7XG4gICAgb3BhY2l0eT86IG51bWJlcjtcbiAgICB0aWxlU2NhbGluZ0ZhY3Rvcj86IG51bWJlcjtcbiAgICBjcm9wUmVjdD86IGFueTtcbiAgICBpbWFnZVRyYW5zZm9ybT86IGFueTtcbiAgICByYXdXaWR0aD86IG51bWJlcjtcbiAgICByYXdIZWlnaHQ/OiBudW1iZXI7XG4gICAgc2tpcENvdmVyQ3JvcD86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJbWFnZVBsYWNlaG9sZGVyUmVjb3JkIHtcbiAgICBub2RlVXVpZDogc3RyaW5nO1xuICAgIGltZ1JlZjogc3RyaW5nO1xuICAgIGRiVXJsOiBzdHJpbmc7XG4gICAgc3ByaXRlRnJhbWVVdWlkPzogc3RyaW5nO1xuICAgIGtpbmQ6ICdzcHJpdGUnIHwgJ21hc2snO1xuICAgIHNsaWNlOUJvcmRlcjogU2xpY2U5Qm9yZGVyIHwgbnVsbDtcbiAgICBpbWFnZUZpbGw6IEltYWdlRmlsbE1ldGEgfCB1bmRlZmluZWQ7XG4gICAgb3ZlcmxheVRpbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgUGVuZGluZ1Nwcml0ZUxvYWQge1xuICAgIGhvc3Q6IGFueTtcbiAgICBzcHJpdGU6IGFueTtcbiAgICBpbWdSZWY6IHN0cmluZztcbiAgICB1dWlkOiBzdHJpbmc7XG4gICAgc2xpY2U5Qm9yZGVyOiBTbGljZTlCb3JkZXIgfCBudWxsO1xuICAgIGltYWdlRmlsbDogSW1hZ2VGaWxsTWV0YSB8IHVuZGVmaW5lZDtcbiAgICBvdmVybGF5VGludDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBSZ2JhMjU1IHtcbiAgICByOiBudW1iZXI7XG4gICAgZzogbnVtYmVyO1xuICAgIGI6IG51bWJlcjtcbiAgICBhOiBudW1iZXI7XG59XG5cbi8qKiBAemggRmlnbWEgU0xJQ0U5IOKGkiBDb2NvcyBTcHJpdGVGcmFtZSBpbnNldOOAgiAqL1xuZnVuY3Rpb24gcmVhZFNsaWNlOUJvcmRlcihub2RlOiBhbnkpOiBTbGljZTlCb3JkZXIgfCBudWxsIHtcbiAgICBpZiAoU3RyaW5nKG5vZGUuY29tcG9uZW50VHlwZSB8fCAnJykudG9VcHBlckNhc2UoKSAhPT0gJ1NMSUNFOScpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGIgPSBub2RlLnNsaWNlOUJvcmRlcjtcbiAgICBpZiAoIWIpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGJvcmRlciA9IHtcbiAgICAgICAgbGVmdDogTWF0aC5tYXgoMCwgTnVtYmVyKGIubGVmdCkgfHwgMCksXG4gICAgICAgIHJpZ2h0OiBNYXRoLm1heCgwLCBOdW1iZXIoYi5yaWdodCkgfHwgMCksXG4gICAgICAgIHRvcDogTWF0aC5tYXgoMCwgTnVtYmVyKGIudG9wKSB8fCAwKSxcbiAgICAgICAgYm90dG9tOiBNYXRoLm1heCgwLCBOdW1iZXIoYi5ib3R0b20pIHx8IDApLFxuICAgIH07XG4gICAgcmV0dXJuIGJvcmRlci5sZWZ0IHx8IGJvcmRlci5yaWdodCB8fCBib3JkZXIudG9wIHx8IGJvcmRlci5ib3R0b20gPyBib3JkZXIgOiBudWxsO1xufVxuXG5mdW5jdGlvbiBhcHBseVNsaWNlOUJvcmRlcihzcHJpdGVGcmFtZTogYW55LCBib3JkZXI6IFNsaWNlOUJvcmRlciwgUmVjdDogYW55LCBTaXplOiBhbnksIFZlYzI6IGFueSk6IGFueSB7XG4gICAgLy8gQm9yZGVyIGlzIHBlcnNpc3RlZCBpbiB0aGUgaW1wb3J0ZWQgaW1hZ2UgbWV0YSBieSBtYWluLnRzLiBLZWVwIHRoZVxuICAgIC8vIGFzc2V0LWJhY2tlZCBTcHJpdGVGcmFtZSByZWZlcmVuY2UgaGVyZTsgcnVudGltZSBjbG9uZXMgYXJlIG5vdCBzZXJpYWxpemVkXG4gICAgLy8gYnkgQ29jb3MgYW5kIHR1cm4gaW50byBudWxsIGFmdGVyIHNhdmUvcmVsb2FkLlxuICAgIGNvbnN0IGZyYW1lID0gc3ByaXRlRnJhbWU7XG4gICAgaWYgKCFmcmFtZSkgcmV0dXJuIGZyYW1lO1xuICAgIGNvbnN0IHJhdyA9IHJlYWRTcHJpdGVGcmFtZVJlY3QoZnJhbWUpO1xuICAgIGNvbnN0IHdpZHRoID0gcmF3ICYmIHJhdy53aWR0aCA+IDAgPyByYXcud2lkdGggOiAwO1xuICAgIGNvbnN0IGhlaWdodCA9IHJhdyAmJiByYXcuaGVpZ2h0ID4gMCA/IHJhdy5oZWlnaHQgOiAwO1xuICAgIGNvbnN0IGNsYW1wZWQgPSBjbGFtcFNsaWNlOUJvcmRlcihib3JkZXIsIHdpZHRoLCBoZWlnaHQpO1xuICAgIGZyYW1lLmluc2V0TGVmdCA9IGNsYW1wZWQubGVmdDtcbiAgICBmcmFtZS5pbnNldFJpZ2h0ID0gY2xhbXBlZC5yaWdodDtcbiAgICBmcmFtZS5pbnNldFRvcCA9IGNsYW1wZWQudG9wO1xuICAgIGZyYW1lLmluc2V0Qm90dG9tID0gY2xhbXBlZC5ib3R0b207XG4gICAgcmV0dXJuIGZyYW1lO1xufVxuXG4vKipcbiAqIEB6aCBGaWdtYSBJTUFHRSBmaWxsIOivreS5ie+8mlxuICogICBGaWdtYSDnmoQgRklMTCDmmK8gcHJlc2VydmUtYXNwZWN0IGNvdmVy77yM5LiN5piv5by66KGM5ouJ5Ly477ybQ29jb3MgU3ByaXRlIOayoeaciSBJbWFnZVBhaW50IOmHh+agt+efqemYte+8jFxuICogICDlm6DmraTlr7nmma7pgJogSU1BR0UgZmlsbCDlhYjlnKggU3ByaXRlRnJhbWUg5LiK5YGa5Lit5b+DIGNvdmVyIOijgeWIh++8jOWGjeeUsSBVSVRyYW5zZm9ybSDmi4nliLDnm67moIfmoYbjgIJcbiAqICAg6IqC54K557qn5pW05Zu+77yIc291cmNlPU5PREXvvInpgJrluLjmmK8gRmlnbWEg5bey54OY54SZ57uT5p6c77yM5LiN5YaN5LqM5qyh6KOB5YiH77ybU0xJQ0U5IOS5n+S4jei1sOi/memHjOOAglxuICogICBjcm9wUmVjdCAvIGltYWdlVHJhbnNmb3JtIOiLpeeUseaWsOeJiCBGaWdtYSDmj5Lku7bmj5DkvpvvvIzliJnkvJjlhYjmjIkgRmlnbWEg55qE57K+56Gu6YeH5qC36IyD5Zu06KOB5YiH44CCXG4gKi9cbmZ1bmN0aW9uIGFkYXB0SW1hZ2VGaWxsU3ByaXRlRnJhbWUoc3ByaXRlRnJhbWU6IGFueSwgbWV0YTogSW1hZ2VGaWxsTWV0YSB8IHVuZGVmaW5lZCxcbiAgICB0YXJnZXRXOiBudW1iZXIsIHRhcmdldEg6IG51bWJlciwgUmVjdDogYW55LCBTaXplOiBhbnksIFZlYzI6IGFueSk6IHsgZnJhbWU6IGFueTsgY3JvcHBlZDogYm9vbGVhbiB9IHtcbiAgICBpZiAoIW1ldGEgfHwgU3RyaW5nKG1ldGEuc291cmNlIHx8ICcnKS50b1VwcGVyQ2FzZSgpICE9PSAnRklMTCcpIHJldHVybiB7IGZyYW1lOiBzcHJpdGVGcmFtZSwgY3JvcHBlZDogZmFsc2UgfTtcbiAgICBjb25zdCBtb2RlID0gU3RyaW5nKG1ldGEuc2NhbGVNb2RlIHx8ICdGSUxMJykudG9VcHBlckNhc2UoKTtcbiAgICBpZiAobW9kZSA9PT0gJ1RJTEUnIHx8ICFSZWN0IHx8ICFTaXplIHx8ICFWZWMyIHx8IHRhcmdldFcgPD0gMCB8fCB0YXJnZXRIIDw9IDApIHJldHVybiB7IGZyYW1lOiBzcHJpdGVGcmFtZSwgY3JvcHBlZDogZmFsc2UgfTtcblxuICAgIGNvbnN0IHJhdyA9IHJlYWRTcHJpdGVGcmFtZVJlY3Qoc3ByaXRlRnJhbWUpO1xuICAgIGlmICghcmF3IHx8IHJhdy53aWR0aCA8PSAwIHx8IHJhdy5oZWlnaHQgPD0gMCkgcmV0dXJuIHsgZnJhbWU6IHNwcml0ZUZyYW1lLCBjcm9wcGVkOiBmYWxzZSB9O1xuXG4gICAgY29uc3QgaGFzRXhwbGljaXRDcm9wID0gISEobWV0YS5jcm9wUmVjdCB8fCBtZXRhLmltYWdlVHJhbnNmb3JtKTtcbiAgICBjb25zdCBjcm9wID0gcmVhZENyb3BSZWN0KG1ldGEuY3JvcFJlY3QsIHJhdykgfHwgcmVhZEltYWdlVHJhbnNmb3JtQ3JvcFJlY3QobWV0YS5pbWFnZVRyYW5zZm9ybSwgcmF3KTtcbiAgICBsZXQgcmVjdCA9IGNyb3A7XG4gICAgaWYgKCFyZWN0ICYmIChtb2RlID09PSAnRklMTCcgfHwgbW9kZSA9PT0gJ0NST1AnKSkge1xuICAgICAgICBpZiAobWV0YS5za2lwQ292ZXJDcm9wKSByZXR1cm4geyBmcmFtZTogc3ByaXRlRnJhbWUsIGNyb3BwZWQ6IGZhbHNlIH07XG4gICAgICAgIGNvbnN0IG1ldGFBc3BlY3QgPSBOdW1iZXIobWV0YS5yYXdXaWR0aCkgPiAwICYmIE51bWJlcihtZXRhLnJhd0hlaWdodCkgPiAwXG4gICAgICAgICAgICA/IE51bWJlcihtZXRhLnJhd1dpZHRoKSAvIE51bWJlcihtZXRhLnJhd0hlaWdodClcbiAgICAgICAgICAgIDogMDtcbiAgICAgICAgY29uc3QgdGFyZ2V0QXNwZWN0ID0gdGFyZ2V0VyAvIHRhcmdldEg7XG4gICAgICAgIGlmICghaGFzRXhwbGljaXRDcm9wICYmIG1ldGFBc3BlY3QgPiAwICYmIE1hdGguYWJzKG1ldGFBc3BlY3QgLSB0YXJnZXRBc3BlY3QpIDwgMC4wMDIpIHtcbiAgICAgICAgICAgIHJldHVybiB7IGZyYW1lOiBzcHJpdGVGcmFtZSwgY3JvcHBlZDogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgICByZWN0ID0gY2FsY0NvdmVyQ3JvcFJlY3QocmF3LCB0YXJnZXRBc3BlY3QpO1xuICAgIH1cbiAgICBpZiAoIXJlY3QpIHJldHVybiB7IGZyYW1lOiBzcHJpdGVGcmFtZSwgY3JvcHBlZDogZmFsc2UgfTtcbiAgICBpZiAoTWF0aC5hYnMocmVjdC54IC0gcmF3LngpIDwgMC4wMSAmJiBNYXRoLmFicyhyZWN0LnkgLSByYXcueSkgPCAwLjAxICYmXG4gICAgICAgIE1hdGguYWJzKHJlY3Qud2lkdGggLSByYXcud2lkdGgpIDwgMC4wMSAmJiBNYXRoLmFicyhyZWN0LmhlaWdodCAtIHJhdy5oZWlnaHQpIDwgMC4wMSkge1xuICAgICAgICByZXR1cm4geyBmcmFtZTogc3ByaXRlRnJhbWUsIGNyb3BwZWQ6IGZhbHNlIH07XG4gICAgfVxuXG4gICAgY29uc3QgZnJhbWUgPSBzcHJpdGVGcmFtZSAmJiB0eXBlb2Ygc3ByaXRlRnJhbWUuY2xvbmUgPT09ICdmdW5jdGlvbicgPyBzcHJpdGVGcmFtZS5jbG9uZSgpIDogc3ByaXRlRnJhbWU7XG4gICAgaWYgKGZyYW1lICYmIHR5cGVvZiBmcmFtZS5yZXNldCA9PT0gJ2Z1bmN0aW9uJyAmJiBmcmFtZS50ZXh0dXJlKSB7XG4gICAgICAgIGZyYW1lLnJlc2V0KHtcbiAgICAgICAgICAgIHRleHR1cmU6IGZyYW1lLnRleHR1cmUsXG4gICAgICAgICAgICByZWN0OiBuZXcgUmVjdChyZWN0LngsIHJlY3QueSwgcmVjdC53aWR0aCwgcmVjdC5oZWlnaHQpLFxuICAgICAgICAgICAgb3JpZ2luYWxTaXplOiBuZXcgU2l6ZShyZWN0LndpZHRoLCByZWN0LmhlaWdodCksXG4gICAgICAgICAgICBvZmZzZXQ6IG5ldyBWZWMyKDAsIDApLFxuICAgICAgICAgICAgaXNSb3RhdGU6IGZhbHNlLFxuICAgICAgICB9LCB0cnVlKTtcbiAgICAgICAgcmV0dXJuIHsgZnJhbWUsIGNyb3BwZWQ6IHRydWUgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgZnJhbWU6IHNwcml0ZUZyYW1lLCBjcm9wcGVkOiBmYWxzZSB9O1xufVxuXG5mdW5jdGlvbiByZWFkU3ByaXRlRnJhbWVSZWN0KHNwcml0ZUZyYW1lOiBhbnkpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB7XG4gICAgaWYgKCFzcHJpdGVGcmFtZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcmVjdCA9IHNwcml0ZUZyYW1lLnJlY3QgfHwgc3ByaXRlRnJhbWUuX3JlY3Q7XG4gICAgY29uc3Qgd2lkdGggPSByZWN0ICYmIE51bWJlcihyZWN0LndpZHRoKSB8fCBzcHJpdGVGcmFtZS5vcmlnaW5hbFNpemUgJiYgTnVtYmVyKHNwcml0ZUZyYW1lLm9yaWdpbmFsU2l6ZS53aWR0aCkgfHxcbiAgICAgICAgc3ByaXRlRnJhbWUudGV4dHVyZSAmJiBOdW1iZXIoc3ByaXRlRnJhbWUudGV4dHVyZS53aWR0aCkgfHwgMDtcbiAgICBjb25zdCBoZWlnaHQgPSByZWN0ICYmIE51bWJlcihyZWN0LmhlaWdodCkgfHwgc3ByaXRlRnJhbWUub3JpZ2luYWxTaXplICYmIE51bWJlcihzcHJpdGVGcmFtZS5vcmlnaW5hbFNpemUuaGVpZ2h0KSB8fFxuICAgICAgICBzcHJpdGVGcmFtZS50ZXh0dXJlICYmIE51bWJlcihzcHJpdGVGcmFtZS50ZXh0dXJlLmhlaWdodCkgfHwgMDtcbiAgICByZXR1cm4ge1xuICAgICAgICB4OiByZWN0ICYmIE51bWJlcihyZWN0LngpIHx8IDAsXG4gICAgICAgIHk6IHJlY3QgJiYgTnVtYmVyKHJlY3QueSkgfHwgMCxcbiAgICAgICAgd2lkdGgsXG4gICAgICAgIGhlaWdodCxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiByZWFkQ3JvcFJlY3QoY3JvcFJlY3Q6IGFueSwgcmF3OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9KTpcbiAgICB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB7XG4gICAgaWYgKCFjcm9wUmVjdCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgeCA9IE51bWJlcihjcm9wUmVjdC54KTtcbiAgICBjb25zdCB5ID0gTnVtYmVyKGNyb3BSZWN0LnkpO1xuICAgIGNvbnN0IHcgPSBOdW1iZXIoY3JvcFJlY3QudyA/PyBjcm9wUmVjdC53aWR0aCk7XG4gICAgY29uc3QgaCA9IE51bWJlcihjcm9wUmVjdC5oID8/IGNyb3BSZWN0LmhlaWdodCk7XG4gICAgaWYgKCFbeCwgeSwgdywgaF0uZXZlcnkoTnVtYmVyLmlzRmluaXRlKSB8fCB3IDw9IDAgfHwgaCA8PSAwKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBub3JtYWxpemVkID0gY3JvcFJlY3Qubm9ybWFsaXplZCA9PT0gdHJ1ZSB8fFxuICAgICAgICBTdHJpbmcoY3JvcFJlY3QudW5pdCB8fCAnJykudG9VcHBlckNhc2UoKSA9PT0gJ05PUk1BTElaRUQnIHx8XG4gICAgICAgICh4ID49IC0wLjAwMSAmJiB5ID49IC0wLjAwMSAmJiB4IDw9IDEuMDAxICYmIHkgPD0gMS4wMDEgJiYgdyA8PSAxLjAwMSAmJiBoIDw9IDEuMDAxKTtcbiAgICBjb25zdCBweCA9IG5vcm1hbGl6ZWQgPyByYXcueCArIHggKiByYXcud2lkdGggOiByYXcueCArIHg7XG4gICAgY29uc3QgcHkgPSBub3JtYWxpemVkID8gcmF3LnkgKyB5ICogcmF3LmhlaWdodCA6IHJhdy55ICsgeTtcbiAgICBjb25zdCBwdyA9IG5vcm1hbGl6ZWQgPyB3ICogcmF3LndpZHRoIDogdztcbiAgICBjb25zdCBwaCA9IG5vcm1hbGl6ZWQgPyBoICogcmF3LmhlaWdodCA6IGg7XG4gICAgcmV0dXJuIGNsYW1wUmVjdFRvUmF3KHsgeDogcHgsIHk6IHB5LCB3aWR0aDogcHcsIGhlaWdodDogcGggfSwgcmF3KTtcbn1cblxuZnVuY3Rpb24gcmVhZEltYWdlVHJhbnNmb3JtQ3JvcFJlY3QoaW1hZ2VUcmFuc2Zvcm06IGFueSwgcmF3OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9KTpcbiAgICB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB7XG4gICAgY29uc3QgbSA9IHJlYWRUcmFuc2Zvcm0yeDMoaW1hZ2VUcmFuc2Zvcm0pO1xuICAgIGlmICghbSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcHRzID0gW1xuICAgICAgICB0cmFuc2Zvcm1Qb2ludDJ4MyhtLCAwLCAwKSxcbiAgICAgICAgdHJhbnNmb3JtUG9pbnQyeDMobSwgMSwgMCksXG4gICAgICAgIHRyYW5zZm9ybVBvaW50MngzKG0sIDAsIDEpLFxuICAgICAgICB0cmFuc2Zvcm1Qb2ludDJ4MyhtLCAxLCAxKSxcbiAgICBdO1xuICAgIGxldCBtaW5YID0gcHRzWzBdLngsIG1heFggPSBwdHNbMF0ueCwgbWluWSA9IHB0c1swXS55LCBtYXhZID0gcHRzWzBdLnk7XG4gICAgZm9yIChsZXQgaSA9IDE7IGkgPCBwdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgbWluWCA9IE1hdGgubWluKG1pblgsIHB0c1tpXS54KTtcbiAgICAgICAgbWF4WCA9IE1hdGgubWF4KG1heFgsIHB0c1tpXS54KTtcbiAgICAgICAgbWluWSA9IE1hdGgubWluKG1pblksIHB0c1tpXS55KTtcbiAgICAgICAgbWF4WSA9IE1hdGgubWF4KG1heFksIHB0c1tpXS55KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlYWRDcm9wUmVjdCh7XG4gICAgICAgIHg6IG1pblgsXG4gICAgICAgIHk6IG1pblksXG4gICAgICAgIHc6IG1heFggLSBtaW5YLFxuICAgICAgICBoOiBtYXhZIC0gbWluWSxcbiAgICAgICAgdW5pdDogJ05PUk1BTElaRUQnLFxuICAgIH0sIHJhdyk7XG59XG5cbmZ1bmN0aW9uIHJlYWRUcmFuc2Zvcm0yeDModmFsdWU6IGFueSk6IG51bWJlcltdW10gfCBudWxsIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlWzBdKSB8fCAhQXJyYXkuaXNBcnJheSh2YWx1ZVsxXSkpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IG0gPSBbXG4gICAgICAgIFtOdW1iZXIodmFsdWVbMF1bMF0pLCBOdW1iZXIodmFsdWVbMF1bMV0pLCBOdW1iZXIodmFsdWVbMF1bMl0pXSxcbiAgICAgICAgW051bWJlcih2YWx1ZVsxXVswXSksIE51bWJlcih2YWx1ZVsxXVsxXSksIE51bWJlcih2YWx1ZVsxXVsyXSldLFxuICAgIF07XG4gICAgZm9yIChjb25zdCByb3cgb2YgbSkge1xuICAgICAgICBmb3IgKGNvbnN0IG4gb2Ygcm93KSB7XG4gICAgICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShuKSkgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG07XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVBvaW50MngzKG06IG51bWJlcltdW10sIHg6IG51bWJlciwgeTogbnVtYmVyKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcbiAgICByZXR1cm4ge1xuICAgICAgICB4OiBtWzBdWzBdICogeCArIG1bMF1bMV0gKiB5ICsgbVswXVsyXSxcbiAgICAgICAgeTogbVsxXVswXSAqIHggKyBtWzFdWzFdICogeSArIG1bMV1bMl0sXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gY2FsY0NvdmVyQ3JvcFJlY3QocmF3OiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9LCB0YXJnZXRBc3BlY3Q6IG51bWJlcik6XG4gICAgeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IG51bGwge1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHRhcmdldEFzcGVjdCkgfHwgdGFyZ2V0QXNwZWN0IDw9IDApIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHJhd0FzcGVjdCA9IHJhdy53aWR0aCAvIHJhdy5oZWlnaHQ7XG4gICAgaWYgKE1hdGguYWJzKHJhd0FzcGVjdCAtIHRhcmdldEFzcGVjdCkgPCAwLjAwMikgcmV0dXJuIG51bGw7XG4gICAgaWYgKHJhd0FzcGVjdCA+IHRhcmdldEFzcGVjdCkge1xuICAgICAgICBjb25zdCB3aWR0aCA9IHJhdy5oZWlnaHQgKiB0YXJnZXRBc3BlY3Q7XG4gICAgICAgIHJldHVybiBjbGFtcFJlY3RUb1Jhdyh7XG4gICAgICAgICAgICB4OiByYXcueCArIChyYXcud2lkdGggLSB3aWR0aCkgKiAwLjUsXG4gICAgICAgICAgICB5OiByYXcueSxcbiAgICAgICAgICAgIHdpZHRoLFxuICAgICAgICAgICAgaGVpZ2h0OiByYXcuaGVpZ2h0LFxuICAgICAgICB9LCByYXcpO1xuICAgIH1cbiAgICBjb25zdCBoZWlnaHQgPSByYXcud2lkdGggLyB0YXJnZXRBc3BlY3Q7XG4gICAgcmV0dXJuIGNsYW1wUmVjdFRvUmF3KHtcbiAgICAgICAgeDogcmF3LngsXG4gICAgICAgIHk6IHJhdy55ICsgKHJhdy5oZWlnaHQgLSBoZWlnaHQpICogMC41LFxuICAgICAgICB3aWR0aDogcmF3LndpZHRoLFxuICAgICAgICBoZWlnaHQsXG4gICAgfSwgcmF3KTtcbn1cblxuZnVuY3Rpb24gY2xhbXBSZWN0VG9SYXcocmVjdDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSxcbiAgICByYXc6IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB7XG4gICAgY29uc3QgbWluWCA9IHJhdy54O1xuICAgIGNvbnN0IG1pblkgPSByYXcueTtcbiAgICBjb25zdCBtYXhYID0gcmF3LnggKyByYXcud2lkdGg7XG4gICAgY29uc3QgbWF4WSA9IHJhdy55ICsgcmF3LmhlaWdodDtcbiAgICBjb25zdCB4ID0gTWF0aC5tYXgobWluWCwgTWF0aC5taW4obWF4WCwgcmVjdC54KSk7XG4gICAgY29uc3QgeSA9IE1hdGgubWF4KG1pblksIE1hdGgubWluKG1heFksIHJlY3QueSkpO1xuICAgIGNvbnN0IHJpZ2h0ID0gTWF0aC5tYXgoeCwgTWF0aC5taW4obWF4WCwgcmVjdC54ICsgcmVjdC53aWR0aCkpO1xuICAgIGNvbnN0IGJvdHRvbSA9IE1hdGgubWF4KHksIE1hdGgubWluKG1heFksIHJlY3QueSArIHJlY3QuaGVpZ2h0KSk7XG4gICAgY29uc3Qgd2lkdGggPSByaWdodCAtIHg7XG4gICAgY29uc3QgaGVpZ2h0ID0gYm90dG9tIC0geTtcbiAgICBpZiAod2lkdGggPD0gMC41IHx8IGhlaWdodCA8PSAwLjUpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7IHgsIHksIHdpZHRoLCBoZWlnaHQgfTtcbn1cblxuZnVuY3Rpb24gYXBwbHlJbWFnZUNvbG9yKHNwcml0ZTogYW55LCBtZXRhOiBJbWFnZUZpbGxNZXRhIHwgdW5kZWZpbmVkLCBvdmVybGF5VGludDogc3RyaW5nIHwgdW5kZWZpbmVkLCBDb2xvcjogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFDb2xvcikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IG9wYWNpdHkgPSBtZXRhICYmIHR5cGVvZiBtZXRhLm9wYWNpdHkgPT09ICdudW1iZXInXG4gICAgICAgID8gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgbWV0YS5vcGFjaXR5KSlcbiAgICAgICAgOiAxO1xuICAgIGNvbnN0IHRpbnQgPSBwYXJzZU92ZXJsYXlUaW50KG92ZXJsYXlUaW50KTtcbiAgICBpZiAoIXRpbnQgJiYgb3BhY2l0eSA+PSAwLjk5OSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGFscGhhID0gdGludCAmJiB0aW50Lmhhc0FscGhhID8gdGludC5hIDogTWF0aC5yb3VuZChvcGFjaXR5ICogMjU1KTtcbiAgICBzcHJpdGUuY29sb3IgPSBuZXcgQ29sb3IoXG4gICAgICAgIHRpbnQgPyB0aW50LnIgOiAyNTUsXG4gICAgICAgIHRpbnQgPyB0aW50LmcgOiAyNTUsXG4gICAgICAgIHRpbnQgPyB0aW50LmIgOiAyNTUsXG4gICAgICAgIGFscGhhXG4gICAgKTtcbiAgICByZXR1cm4gISF0aW50O1xufVxuXG5mdW5jdGlvbiBwYXJzZU92ZXJsYXlUaW50KHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiAoUmdiYTI1NSAmIHsgaGFzQWxwaGE6IGJvb2xlYW4gfSkgfCBudWxsIHtcbiAgICBpZiAoIXZhbHVlKSByZXR1cm4gbnVsbDtcbiAgICBsZXQgaGV4ID0gU3RyaW5nKHZhbHVlKS50cmltKCk7XG4gICAgaWYgKGhleC5zdGFydHNXaXRoKCcjJykpIGhleCA9IGhleC5zbGljZSgxKTtcbiAgICBpZiAoL15bMC05YS1mQS1GXXszfSQvLnRlc3QoaGV4KSkge1xuICAgICAgICBoZXggPSBoZXguc3BsaXQoJycpLm1hcCgoY2gpID0+IGNoICsgY2gpLmpvaW4oJycpO1xuICAgIH0gZWxzZSBpZiAoL15bMC05YS1mQS1GXXs0fSQvLnRlc3QoaGV4KSkge1xuICAgICAgICBoZXggPSBoZXguc3BsaXQoJycpLm1hcCgoY2gpID0+IGNoICsgY2gpLmpvaW4oJycpO1xuICAgIH1cbiAgICBpZiAoIS9eWzAtOWEtZkEtRl17Nn0oWzAtOWEtZkEtRl17Mn0pPyQvLnRlc3QoaGV4KSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgaGFzQWxwaGEgPSBoZXgubGVuZ3RoID49IDg7XG4gICAgY29uc3QgbiA9IHBhcnNlSW50KGhleCwgMTYpO1xuICAgIGlmIChoYXNBbHBoYSkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcjogKG4gPj4+IDI0KSAmIDI1NSxcbiAgICAgICAgICAgIGc6IChuID4+PiAxNikgJiAyNTUsXG4gICAgICAgICAgICBiOiAobiA+Pj4gOCkgJiAyNTUsXG4gICAgICAgICAgICBhOiBuICYgMjU1LFxuICAgICAgICAgICAgaGFzQWxwaGEsXG4gICAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIHI6IChuID4+PiAxNikgJiAyNTUsXG4gICAgICAgIGc6IChuID4+PiA4KSAmIDI1NSxcbiAgICAgICAgYjogbiAmIDI1NSxcbiAgICAgICAgYTogMjU1LFxuICAgICAgICBoYXNBbHBoYSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBjb25maWd1cmVTcHJpdGVUeXBlKHNwcml0ZTogYW55LCBmaWdtYU5vZGU6IGFueSwgc2xpY2U5Qm9yZGVyOiBTbGljZTlCb3JkZXIgfCBudWxsLCBTcHJpdGU6IGFueSk6IHZvaWQge1xuICAgIGNvbnN0IG1vZGUgPSBTdHJpbmcoZmlnbWFOb2RlLmltYWdlRmlsbCAmJiBmaWdtYU5vZGUuaW1hZ2VGaWxsLnNjYWxlTW9kZSB8fCAnJykudG9VcHBlckNhc2UoKTtcbiAgICBpZiAoc2xpY2U5Qm9yZGVyKSB7XG4gICAgICAgIHNwcml0ZS50eXBlID0gU3ByaXRlLlR5cGUuU0xJQ0VEO1xuICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gJ1RJTEUnICYmIFNwcml0ZS5UeXBlLlRJTEVEICE9IG51bGwpIHtcbiAgICAgICAgc3ByaXRlLnR5cGUgPSBTcHJpdGUuVHlwZS5USUxFRDtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzcHJpdGUudHlwZSA9IFNwcml0ZS5UeXBlLlNJTVBMRTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5VGlsZVNjYWxpbmcoc3ByaXRlOiBhbnksIG1ldGE6IEltYWdlRmlsbE1ldGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcbiAgICBpZiAoIW1ldGEgfHwgU3RyaW5nKG1ldGEuc2NhbGVNb2RlIHx8ICcnKS50b1VwcGVyQ2FzZSgpICE9PSAnVElMRScpIHJldHVybjtcbiAgICBjb25zdCBmYWN0b3IgPSBOdW1iZXIobWV0YS50aWxlU2NhbGluZ0ZhY3Rvcik7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShmYWN0b3IpICYmIE1hdGguYWJzKGZhY3RvcikgPiAwLjAwMSAmJiBNYXRoLmFicyhmYWN0b3IgLSAxKSA+IDAuMDAxKSB7XG4gICAgICAgIHNwcml0ZS5waXhlbHNQZXJVbml0ID0gc3ByaXRlLnBpeGVsc1BlclVuaXQgfHwgMTAwO1xuICAgICAgICBzcHJpdGUucGl4ZWxzUGVyVW5pdCA9IHNwcml0ZS5waXhlbHNQZXJVbml0IC8gZmFjdG9yO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY29sb3IyNTUoQ29sb3I6IGFueSwgYzogUmdiYTI1NSk6IGFueSB7XG4gICAgcmV0dXJuIG5ldyBDb2xvcihcbiAgICAgICAgY2xhbXAyNTUoYy5yKSxcbiAgICAgICAgY2xhbXAyNTUoYy5nKSxcbiAgICAgICAgY2xhbXAyNTUoYy5iKSxcbiAgICAgICAgY2xhbXAyNTUoYy5hKVxuICAgICk7XG59XG5cbmZ1bmN0aW9uIGNsYW1wMjU1KHZhbHVlOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IG4gPSBOdW1iZXIodmFsdWUpO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKG4pKSByZXR1cm4gMjU1O1xuICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbigyNTUsIE1hdGgucm91bmQobikpKTtcbn1cblxuZnVuY3Rpb24gcmVhZFVuaWZvcm1Db3JuZXJSYWRpdXMobm9kZTogYW55LCB3OiBudW1iZXIsIGg6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3QgbWF4UiA9IE1hdGgubWF4KDAsIE1hdGgubWluKHcsIGgpICogMC41KTtcbiAgICBjb25zdCByYWRpaSA9IEFycmF5LmlzQXJyYXkobm9kZS5jb3JuZXJSYWRpaSlcbiAgICAgICAgPyBub2RlLmNvcm5lclJhZGlpLm1hcCgodjogYW55KSA9PiBNYXRoLm1heCgwLCBOdW1iZXIodikgfHwgMCkpXG4gICAgICAgIDogW107XG4gICAgbGV0IHIgPSBNYXRoLm1heCgwLCBOdW1iZXIobm9kZS5jb3JuZXJSYWRpdXMpIHx8IDApO1xuICAgIGlmIChyYWRpaS5sZW5ndGggPj0gNCkge1xuICAgICAgICBjb25zdCBbdGwsIHRyLCBiciwgYmxdID0gcmFkaWk7XG4gICAgICAgIGNvbnN0IHNhbWUgPSBNYXRoLmFicyh0bCAtIHRyKSA8IDAuMDEgJiYgTWF0aC5hYnModGwgLSBicikgPCAwLjAxICYmIE1hdGguYWJzKHRsIC0gYmwpIDwgMC4wMTtcbiAgICAgICAgaWYgKHNhbWUpIHIgPSB0bDtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBDb2NvcyBHcmFwaGljcyBoYXMgbm8gb25lLWNhbGwgcGVyLWNvcm5lciByb3VuZFJlY3Q7IHVzZSB0aGUgc21hbGxlc3RcbiAgICAgICAgICAgIC8vIHJhZGl1cyByYXRoZXIgdGhhbiBvdmVyc3RhdGluZyBhbnkgY29ybmVyLlxuICAgICAgICAgICAgciA9IE1hdGgubWluKHRsLCB0ciwgYnIsIGJsKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gTWF0aC5taW4ociwgbWF4Uik7XG59XG5cbi8vIGNsaXBzQ29udGVudCDoioLngrnoi6Xoh6rouqvov5jmnInlj6/op4blm77lvaLvvIjlm77niYcv5a6e5b+D6ImyL+mAj+aYjuefqeW9ou+8ie+8jENvY29zIOaXoOazleWDjyBVbml0ee+8iFJlY3RNYXNrMkRcbi8vIOS4jeWNoOWbvuW9ouanveOAgeWPr+S4jiBJbWFnZSDlkIzoioLngrnlhbHlrZjvvInpgqPmoLfmiorjgIzlm77lvaLjgI3lkozjgIznn6nlvaLoo4HliarjgI3mlL7lkIzkuIDoioLngrnvvJpjYy5NYXNrLkdSQVBISUNTX1JFQ1Rcbi8vIOWGhemDqOimgSBjYy5HcmFwaGljc++8jOS4jiBjYy5TcHJpdGUvY2MuR3JhcGhpY3Mg5oqi5ZCM5LiA5riy5p+T5qe95b+F5Yay56qB44CC5a+56b2QIFVuaXR5IOeahOOAjOinhuiniee7k+aenOOAjeiAjOmdnlxuLy8g44CM6IqC54K557uT5p6E44CN4oCU4oCU6K6pIGZyYW1lIOacrOi6q+WPquW9kyBNYXNr77yM5oqK5a6D55qE5Y+v6KeG5Zu+5b2i5LiL5rKJ5oiQ5LiA5Liq5aGr5ruhIGZyYW1lIOeahOiDjOaZr+WtkOiKgueCue+8iOaOkuacgOWJje+8jFxuLy8g5bC65a+4PT1mcmFtZSDmlYXooqvoo4HmmK/ml6Dmk43kvZzvvIzop4bop4nkuI7jgIzog4zmma/kuI3oo4HjgI3kuIDoh7TvvInjgILkuJrliqHlrZDoioLngrnku43lnKggZnJhbWUg5LiL77yM6KKr5ZCM5LiAIE1hc2sg6KOB5Ymq44CCXG4vLyDov5Tlm57lupTmib/ovb3lj6/op4blm77lvaLvvIhTcHJpdGUvR3JhcGhpY3PvvInnmoTlrr/kuLvoioLngrnvvJrpnIDopoHkuIvmsonml7bmmK/mlrDlu7rnmoTog4zmma/lrZDoioLngrnvvIzlkKbliJnlsLHmmK8gbm9kZSDmnKzouqvjgIJcbmZ1bmN0aW9uIHJlc29sdmVWaXN1YWxIb3N0KG5vZGU6IGFueSwgZmlnbWFOb2RlOiBhbnksIHc6IG51bWJlciwgaDogbnVtYmVyLCBjYzogYW55KTogYW55IHtcbiAgICBjb25zdCB7IE5vZGUsIFVJVHJhbnNmb3JtIH0gPSBjYztcbiAgICBjb25zdCBoYXNWaXN1YWwgPSAhIShmaWdtYU5vZGUuaW1hZ2VSZWYgfHwgZmlnbWFOb2RlLnNvbGlkRmlsbCB8fFxuICAgICAgICAoZmlnbWFOb2RlLnR5cGUgPT09ICdSRUNUQU5HTEUnICYmICFmaWdtYU5vZGUuaW1hZ2VSZWYgJiYgIWZpZ21hTm9kZS5zb2xpZEZpbGwpKTtcbiAgICBpZiAoIWZpZ21hTm9kZS5jbGlwc0NvbnRlbnQgfHwgZmlnbWFOb2RlLm1hc2sgfHwgIWhhc1Zpc3VhbCkgcmV0dXJuIG5vZGU7XG4gICAgY29uc3QgYmcgPSBuZXcgTm9kZShgJHtzYW5pdGl6ZUNvY29zTm9kZU5hbWUoZmlnbWFOb2RlLm5hbWUpfV9CR2ApO1xuICAgIGJnLmxheWVyID0gbm9kZS5sYXllcjtcbiAgICBjb25zdCBiZ1VpID0gYmcuYWRkQ29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICBiZ1VpLnNldENvbnRlbnRTaXplKHcsIGgpO1xuICAgIGJnVWkuc2V0QW5jaG9yUG9pbnQoMC41LCAwLjUpO1xuICAgIG5vZGUuYWRkQ2hpbGQoYmcpO1xuICAgIGJnLnNldFBvc2l0aW9uKDAsIDAsIDApO1xuICAgIC8vIOiDjOaZr+WtkOiKgueCueWhq+a7oSBmcmFtZe+8jOi3n+maj+ijgeWJquefqeW9ou+8m+aOkuWcqOacgOWJje+8iHpJbmRleCDmnIDlupXvvInvvIzkuJrliqHlrZDoioLngrnopobnm5blhbbkuIrjgIJcbiAgICBjb25zdCB3aWRnZXQgPSBiZy5hZGRDb21wb25lbnQoY2MuV2lkZ2V0KTtcbiAgICB3aWRnZXQuYWxpZ25Nb2RlID0gY2MuV2lkZ2V0LkFsaWduTW9kZS5PTl9XSU5ET1dfUkVTSVpFO1xuICAgIHdpZGdldC5pc0FsaWduTGVmdCA9IHdpZGdldC5pc0FsaWduUmlnaHQgPSB0cnVlO1xuICAgIHdpZGdldC5pc0FsaWduVG9wID0gd2lkZ2V0LmlzQWxpZ25Cb3R0b20gPSB0cnVlO1xuICAgIHdpZGdldC5sZWZ0ID0gd2lkZ2V0LnJpZ2h0ID0gd2lkZ2V0LnRvcCA9IHdpZGdldC5ib3R0b20gPSAwO1xuICAgIGlmICh3aWRnZXQudXBkYXRlQWxpZ25tZW50KSB3aWRnZXQudXBkYXRlQWxpZ25tZW50KCk7XG4gICAgcmV0dXJuIGJnO1xufVxuXG5mdW5jdGlvbiBhcHBseVNvbGlkRmlsbChub2RlOiBhbnksIGZpZ21hTm9kZTogYW55LCB3OiBudW1iZXIsIGg6IG51bWJlciwgR3JhcGhpY3M6IGFueSwgQ29sb3I6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghZmlnbWFOb2RlLnNvbGlkRmlsbCB8fCAhZmlnbWFOb2RlLnNvbGlkRmlsbC5jb2xvciB8fCAhR3JhcGhpY3MgfHwgIUNvbG9yIHx8IHcgPD0gMCB8fCBoIDw9IDApIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBnID0gbm9kZS5hZGRDb21wb25lbnQoR3JhcGhpY3MpO1xuICAgIGcuY2xlYXIoKTtcbiAgICAvLyBjYy5HcmFwaGljcyDnmoTloavlhYXkuI3lj5cgY2MuVUlPcGFjaXR5IOW9seWTje+8iOW8leaTjuWPquaKiiBVSU9wYWNpdHkg5L2c55So5YiwIFNwcml0ZS9MYWJlbCDnrYnnmoTpobbngrnoibLvvInvvIxcbiAgICAvLyDmiYDku6XoioLngrnnuqcgb3BhY2l0ee+8iOWmgiBGaWdtYSDljYrpgI/mmI7pu5Hnvakgb3BhY2l0eT0wLjbvvInlv4XpobvlnKjov5nph4zmj4nov5sgZmlsbENvbG9yIOeahCBhbHBoYe+8jFxuICAgIC8vIOWQpuWImeWNiumAj+aYjuefqeW9ouS8mua4suafk+aIkOS4jemAj+aYjuWunuiJsu+8iOabvuiHtOOAjOW3sumihuWPlueBsOe9qeOAjeWPmOe6r+m7keS4gOWdqO+8ieOAglxuICAgIGNvbnN0IGJhc2UgPSBmaWdtYU5vZGUuc29saWRGaWxsLmNvbG9yO1xuICAgIGNvbnN0IG5vZGVPcGFjaXR5ID0gdHlwZW9mIGZpZ21hTm9kZS5vcGFjaXR5ID09PSAnbnVtYmVyJyA/IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIGZpZ21hTm9kZS5vcGFjaXR5KSkgOiAxO1xuICAgIGcuZmlsbENvbG9yID0gY29sb3IyNTUoQ29sb3IsIG5vZGVPcGFjaXR5IDwgMVxuICAgICAgICA/IHsgcjogYmFzZS5yLCBnOiBiYXNlLmcsIGI6IGJhc2UuYiwgYTogKE51bWJlcihiYXNlLmEpIHx8IDI1NSkgKiBub2RlT3BhY2l0eSB9XG4gICAgICAgIDogYmFzZSk7XG4gICAgY29uc3QgeCA9IC13IC8gMjtcbiAgICBjb25zdCB5ID0gLWggLyAyO1xuICAgIGlmIChkcmF3Um91bmRlZFJlY3QoZywgZmlnbWFOb2RlLCB4LCB5LCB3LCBoKSkge1xuICAgICAgICBnLmZpbGwoKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBnLmZpbGxSZWN0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGcuZmlsbFJlY3QoeCwgeSwgdywgaCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZy5yZWN0KHgsIHksIHcsIGgpO1xuICAgICAgICBnLmZpbGwoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGFwcGx5VHJhbnNwYXJlbnRSZWN0YW5nbGVGYWxsYmFjayhub2RlOiBhbnksIGZpZ21hTm9kZTogYW55LCB3OiBudW1iZXIsIGg6IG51bWJlciwgR3JhcGhpY3M6IGFueSwgQ29sb3I6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmIChmaWdtYU5vZGUudHlwZSAhPT0gJ1JFQ1RBTkdMRScgfHwgZmlnbWFOb2RlLnNvbGlkRmlsbCB8fCBmaWdtYU5vZGUuaW1hZ2VSZWYgfHwgIUdyYXBoaWNzIHx8ICFDb2xvcikgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGcgPSBub2RlLmFkZENvbXBvbmVudChHcmFwaGljcyk7XG4gICAgZy5jbGVhcigpO1xuICAgIGcuZmlsbENvbG9yID0gbmV3IENvbG9yKDI1NSwgMjU1LCAyNTUsIDApO1xuICAgIGNvbnN0IHggPSAtdyAvIDI7XG4gICAgY29uc3QgeSA9IC1oIC8gMjtcbiAgICBpZiAoIWRyYXdSb3VuZGVkUmVjdChnLCBmaWdtYU5vZGUsIHgsIHksIHcsIGgpKSBnLnJlY3QoeCwgeSwgdywgaCk7XG4gICAgZy5maWxsKCk7XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbi8vIOiKgueCueWjsOaYjuS6huWbvueJh++8iGltYWdlUmVm77yJ5L2G5rKh5Yy56YWN5YiwIFNwcml0ZUZyYW1l77yI5pyq6JC955uYL+acquWkjeeUqOaIkOWKn++8ieaXtueahOWFnOW6le+8mlxuLy8g57uZ6IqC54K55oyC5LiA5Liq44CM56m6IFNwcml0ZeOAjeKAlOKAlHNpemVNb2RlPUNVU1RPTeOAgeWwuuWvuOWvuem9kOiuvuiuoeeov++8jHNwcml0ZUZyYW1lIOeVmeepuu+8jFxuLy8g576O5pyv5Zyo57yW6L6R5Zmo6YeM5Y+v55u05o6l5oqK5q2j56Gu55qEIFNwcml0ZUZyYW1lIOaLlui/m+WOu+ihpem9kO+8iOWvuem9kOWQjOS6i+OAjOaMguS7o+WbvuOAjeivieaxgu+8ieOAglxuLy8g56m6IFNwcml0ZSDmnKzouqvkuI3muLLmn5PvvIzkuLrkuoblnKjnlLvluIPkuIrkuIDnnLznnIvliLDnvLrlm77ljLrln5/vvIzlho3liqDkuIDkuKogYF9NaXNzaW5nSW1nYCDlrZDoioLngrlcbi8vIOeUqCBHcmFwaGljcyDnlLvljYrpgI/mmI7lk4HnuqLmoYbvvIhHcmFwaGljcyDkuI4gU3ByaXRlIOWQjOiKgueCueS8muWGsueqge+8jOaVheW/hemhu+WIhuiKgueCueaJv+i9ve+8ieOAglxuZnVuY3Rpb24gbW91bnRNaXNzaW5nSW1hZ2VQbGFjZWhvbGRlcihob3N0OiBhbnksIHc6IG51bWJlciwgaDogbnVtYmVyLCBjYzogYW55KTogYW55IHtcbiAgICBjb25zdCB7IE5vZGUsIFVJVHJhbnNmb3JtLCBTcHJpdGUsIEdyYXBoaWNzLCBDb2xvciB9ID0gY2M7XG4gICAgY29uc3Qgc3ByaXRlID0gaG9zdC5nZXRDb21wb25lbnQgJiYgaG9zdC5nZXRDb21wb25lbnQoU3ByaXRlKSB8fCBob3N0LmFkZENvbXBvbmVudChTcHJpdGUpO1xuICAgIHNwcml0ZS5zaXplTW9kZSA9IFNwcml0ZS5TaXplTW9kZS5DVVNUT007XG4gICAgc3ByaXRlLnRyaW0gPSBmYWxzZTtcbiAgICBpZiAoIUdyYXBoaWNzIHx8ICFDb2xvciB8fCB3IDw9IDAgfHwgaCA8PSAwKSByZXR1cm4gc3ByaXRlO1xuICAgIGNvbnN0IGV4aXN0aW5nID0gaG9zdC5jaGlsZHJlbiAmJiBob3N0LmNoaWxkcmVuLmZpbmQoKGNoaWxkOiBhbnkpID0+IGNoaWxkICYmIGNoaWxkLm5hbWUgPT09ICdfTWlzc2luZ0ltZycpO1xuICAgIGlmIChleGlzdGluZykgcmV0dXJuIHNwcml0ZTtcbiAgICBjb25zdCBwaCA9IG5ldyBOb2RlKCdfTWlzc2luZ0ltZycpO1xuICAgIHBoLmxheWVyID0gaG9zdC5sYXllcjtcbiAgICBjb25zdCBwdWkgPSBwaC5hZGRDb21wb25lbnQoVUlUcmFuc2Zvcm0pO1xuICAgIHB1aS5zZXRDb250ZW50U2l6ZSh3LCBoKTtcbiAgICBwdWkuc2V0QW5jaG9yUG9pbnQoMC41LCAwLjUpO1xuICAgIGhvc3QuYWRkQ2hpbGQocGgpO1xuICAgIGNvbnN0IGcgPSBwaC5hZGRDb21wb25lbnQoR3JhcGhpY3MpO1xuICAgIGcuY2xlYXIoKTtcbiAgICBnLmZpbGxDb2xvciA9IG5ldyBDb2xvcigyNTUsIDAsIDI1NSwgNjApO1xuICAgIGcuc3Ryb2tlQ29sb3IgPSBuZXcgQ29sb3IoMjU1LCAwLCAyNTUsIDIwMCk7XG4gICAgZy5saW5lV2lkdGggPSAyO1xuICAgIGNvbnN0IHggPSAtdyAvIDI7XG4gICAgY29uc3QgeSA9IC1oIC8gMjtcbiAgICBnLnJlY3QoeCwgeSwgdywgaCk7XG4gICAgZy5maWxsKCk7XG4gICAgZy5zdHJva2UoKTtcbiAgICByZXR1cm4gc3ByaXRlO1xufVxuXG4vKiogQ29udmVydCBhIGZhaWxlZCBzY2VuZS1zaWRlIFNwcml0ZUZyYW1lIGxvYWQgaW50byB0aGUgc2FtZSByZXRyeWFibGUgcGxhY2Vob2xkZXIgdXNlZCBieSB1bnJlc29sdmVkIEFzc2V0REIgaW1wb3J0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0cmFja0ZhaWxlZFNwcml0ZUxvYWQoXG4gICAgcGVuZGluZzogUGVuZGluZ1Nwcml0ZUxvYWQsXG4gICAgcGxhY2Vob2xkZXJzOiBJbWFnZVBsYWNlaG9sZGVyUmVjb3JkW10sXG4gICAgY2M6IGFueSxcbik6IEltYWdlUGxhY2Vob2xkZXJSZWNvcmQge1xuICAgIG1vdW50TWlzc2luZ0ltYWdlUGxhY2Vob2xkZXIocGVuZGluZy5ob3N0LCBwZW5kaW5nLndpZHRoLCBwZW5kaW5nLmhlaWdodCwgY2MpO1xuICAgIGNvbnN0IHJlY29yZDogSW1hZ2VQbGFjZWhvbGRlclJlY29yZCA9IHtcbiAgICAgICAgbm9kZVV1aWQ6IFN0cmluZyhwZW5kaW5nLmhvc3QgJiYgcGVuZGluZy5ob3N0LnV1aWQgfHwgJycpLFxuICAgICAgICBpbWdSZWY6IHBlbmRpbmcuaW1nUmVmLFxuICAgICAgICBkYlVybDogJycsXG4gICAgICAgIHNwcml0ZUZyYW1lVXVpZDogcGVuZGluZy51dWlkLFxuICAgICAgICBraW5kOiAnc3ByaXRlJyxcbiAgICAgICAgc2xpY2U5Qm9yZGVyOiBwZW5kaW5nLnNsaWNlOUJvcmRlcixcbiAgICAgICAgaW1hZ2VGaWxsOiBwZW5kaW5nLmltYWdlRmlsbCxcbiAgICAgICAgb3ZlcmxheVRpbnQ6IHBlbmRpbmcub3ZlcmxheVRpbnQsXG4gICAgICAgIHdpZHRoOiBwZW5kaW5nLndpZHRoLFxuICAgICAgICBoZWlnaHQ6IHBlbmRpbmcuaGVpZ2h0LFxuICAgIH07XG4gICAgcGxhY2Vob2xkZXJzLnB1c2gocmVjb3JkKTtcbiAgICByZXR1cm4gcmVjb3JkO1xufVxuXG5mdW5jdGlvbiBkcmF3Um91bmRlZFJlY3QoZzogYW55LCBmaWdtYU5vZGU6IGFueSwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHc6IG51bWJlciwgaDogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgaWYgKHcgPD0gMCB8fCBoIDw9IDApIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBtYXhSID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odywgaCkgKiAwLjUpO1xuICAgIGNvbnN0IHJhZGlpID0gQXJyYXkuaXNBcnJheShmaWdtYU5vZGUuY29ybmVyUmFkaWkpXG4gICAgICAgID8gZmlnbWFOb2RlLmNvcm5lclJhZGlpLm1hcCgodjogYW55KSA9PiBNYXRoLm1pbihtYXhSLCBNYXRoLm1heCgwLCBOdW1iZXIodikgfHwgMCkpKVxuICAgICAgICA6IFtdO1xuICAgIGlmIChyYWRpaS5sZW5ndGggPj0gNCkge1xuICAgICAgICBjb25zdCBbdGwsIHRyLCBiciwgYmxdID0gcmFkaWk7XG4gICAgICAgIGNvbnN0IHVuaWZvcm0gPSBNYXRoLmFicyh0bCAtIHRyKSA8IDAuMDEgJiYgTWF0aC5hYnModGwgLSBicikgPCAwLjAxICYmIE1hdGguYWJzKHRsIC0gYmwpIDwgMC4wMTtcbiAgICAgICAgaWYgKCF1bmlmb3JtICYmIHR5cGVvZiBnLm1vdmVUbyA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgZy5saW5lVG8gPT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgIHR5cGVvZiBnLnF1YWRyYXRpY0N1cnZlVG8gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGcubW92ZVRvKHggKyB0bCwgeSArIGgpO1xuICAgICAgICAgICAgZy5saW5lVG8oeCArIHcgLSB0ciwgeSArIGgpO1xuICAgICAgICAgICAgaWYgKHRyID4gMCkgZy5xdWFkcmF0aWNDdXJ2ZVRvKHggKyB3LCB5ICsgaCwgeCArIHcsIHkgKyBoIC0gdHIpO1xuICAgICAgICAgICAgZWxzZSBnLmxpbmVUbyh4ICsgdywgeSArIGgpO1xuICAgICAgICAgICAgZy5saW5lVG8oeCArIHcsIHkgKyBicik7XG4gICAgICAgICAgICBpZiAoYnIgPiAwKSBnLnF1YWRyYXRpY0N1cnZlVG8oeCArIHcsIHksIHggKyB3IC0gYnIsIHkpO1xuICAgICAgICAgICAgZWxzZSBnLmxpbmVUbyh4ICsgdywgeSk7XG4gICAgICAgICAgICBnLmxpbmVUbyh4ICsgYmwsIHkpO1xuICAgICAgICAgICAgaWYgKGJsID4gMCkgZy5xdWFkcmF0aWNDdXJ2ZVRvKHgsIHksIHgsIHkgKyBibCk7XG4gICAgICAgICAgICBlbHNlIGcubGluZVRvKHgsIHkpO1xuICAgICAgICAgICAgZy5saW5lVG8oeCwgeSArIGggLSB0bCk7XG4gICAgICAgICAgICBpZiAodGwgPiAwKSBnLnF1YWRyYXRpY0N1cnZlVG8oeCwgeSArIGgsIHggKyB0bCwgeSArIGgpO1xuICAgICAgICAgICAgZWxzZSBnLmxpbmVUbyh4LCB5ICsgaCk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGcuY2xvc2UgPT09ICdmdW5jdGlvbicpIGcuY2xvc2UoKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHIgPSByZWFkVW5pZm9ybUNvcm5lclJhZGl1cyhmaWdtYU5vZGUsIHcsIGgpO1xuICAgIGlmIChyID4gMC4wMSAmJiB0eXBlb2YgZy5yb3VuZFJlY3QgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZy5yb3VuZFJlY3QoeCwgeSwgdywgaCwgcik7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKiBAemgg6IqC54K56Ieq6Lqr5piv5ZCm5pyJ5Y+v6KeB5Zu+5b2i77yI5Zu+54mHL+e6r+iJsi/oo7jnn6nlvaLvvInjgILkuI4gcmVzb2x2ZVZpc3VhbEhvc3Qg55qE5Yik5o2u5LiA6Ie044CCICovXG5mdW5jdGlvbiBmaWdtYU5vZGVIYXNPd25HcmFwaGljKGZpZ21hTm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFmaWdtYU5vZGUpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gISEoZmlnbWFOb2RlLmltYWdlUmVmIHx8IGZpZ21hTm9kZS5pbWFnZUZpbGwgfHwgZmlnbWFOb2RlLnNvbGlkRmlsbCB8fFxuICAgICAgICAoZmlnbWFOb2RlLnR5cGUgPT09ICdSRUNUQU5HTEUnICYmICFmaWdtYU5vZGUuaW1hZ2VSZWYgJiYgIWZpZ21hTm9kZS5zb2xpZEZpbGwpKTtcbn1cblxuLyoqIEB6aCDlrZDmoJHvvIjlkKvoh6rouqvvvInph4zmmK/lkKblrZjlnKjlj6/op4Hlm77lvaLjgILnlKjkuo7or4bliKvjgIzlupXlm77mjILlnKjlrZDoioLngrnkuIrjgI3nmoTlrrnlmajmjInpkq7jgIJcbiAqICDms6jmhI/vvJrkuI3mjIkgdmlzaWJsZSDov4fmu6TigJTigJTmjInpkq7luLjmmK/pmpDol4/nmoTlj5jkvZPmgIHvvIjlpJroibIgc3dhdGNoIOWuueWZqOm7mOiupOmakOiXj++8ie+8jFxuICogIOWFtue+juacr+WtkOiKgueCuee7k+aehOS7jeWcqO+8m+iLpeWboOaguS/lrZDpmpDol4/ogIzliKTnqbos6ZqQ6JeP5oyJ6ZKu5bCx5rC46L+c5oyC5LiN5LiKIEJ1dHRvbuOAgiAqL1xuZnVuY3Rpb24gc3VidHJlZUhhc1Zpc2libGVHcmFwaGljKGZpZ21hTm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFmaWdtYU5vZGUpIHJldHVybiBmYWxzZTtcbiAgICBpZiAoZmlnbWFOb2RlLnR5cGUgIT09ICdURVhUJyAmJiBmaWdtYU5vZGVIYXNPd25HcmFwaGljKGZpZ21hTm9kZSkpIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IGtpZHMgPSBBcnJheS5pc0FycmF5KGZpZ21hTm9kZS5jaGlsZHJlbikgPyBmaWdtYU5vZGUuY2hpbGRyZW4gOiBbXTtcbiAgICBmb3IgKGNvbnN0IGMgb2Yga2lkcykge1xuICAgICAgICBpZiAoc3VidHJlZUhhc1Zpc2libGVHcmFwaGljKGMpKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBzZXR1cEJ1dHRvbihub2RlOiBhbnksIGZpZ21hTm9kZTogYW55LCBCdXR0b246IGFueSwgaGFzVmlzaWJsZUdyYXBoaWM6IGJvb2xlYW4pOiBib29sZWFuIHtcbiAgICBpZiAoU3RyaW5nKGZpZ21hTm9kZS5jb21wb25lbnRUeXBlIHx8ICcnKS50b1VwcGVyQ2FzZSgpICE9PSAnQlVUVE9OJykgcmV0dXJuIGZhbHNlO1xuICAgIGlmICghQnV0dG9uKSByZXR1cm4gZmFsc2U7XG4gICAgLy8g5a+56b2QIFVuaXR544CM56m6IEZyYW1lL0dyb3VwIOi1t+WQjeW4piBidG4g5LiN57uRIEJ1dHRvbuOAjeeahOacrOaEj++8jOS9huS/ruato+WFtuebsuWMuu+8mlxuICAgIC8vIOecn+aMiemSruW4uOaKiuW6leWbvuaUvuWcqOWtkOiKgueCue+8iOWmguOAjOmAmueUqOaMiemSriA+IENvbW1vbl9idG5fYmx1ZV9iaWfjgI3vvInvvIzoh6rouqvml6Dlm77jgIJcbiAgICAvLyDmlYXliKTmja7mlL7lrr3kuLrjgIzoh6rouqvmnInlm74g5oiWIOWtkOWtmeacieWPr+ingeWbvuW9ouOAjeKAlOKAlOWuueWZqOaMiemSruiDveaMguS4iu+8jOe6r+epuuWjs+S7jeaLpuS9j+OAglxuICAgIGlmICghaGFzVmlzaWJsZUdyYXBoaWMgJiYgIXN1YnRyZWVIYXNWaXNpYmxlR3JhcGhpYyhmaWdtYU5vZGUpKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgYnV0dG9uID0gbm9kZS5hZGRDb21wb25lbnQoQnV0dG9uKTtcbiAgICBidXR0b24udGFyZ2V0ID0gbm9kZTtcbiAgICBidXR0b24uaW50ZXJhY3RhYmxlID0gdHJ1ZTtcbiAgICBpZiAoQnV0dG9uLlRyYW5zaXRpb24gJiYgQnV0dG9uLlRyYW5zaXRpb24uTk9ORSAhPSBudWxsKSB7XG4gICAgICAgIGJ1dHRvbi50cmFuc2l0aW9uID0gQnV0dG9uLlRyYW5zaXRpb24uTk9ORTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVGaWdtYUlucHV0U3BlYyhmaWdtYU5vZGU6IGFueSk6IEZpZ21hSW5wdXRTcGVjIHwgbnVsbCB7XG4gICAgaWYgKFN0cmluZyhmaWdtYU5vZGUgJiYgZmlnbWFOb2RlLmNvbXBvbmVudFR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCkgIT09ICdJTlBVVCcpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHJhdyA9IGZpZ21hTm9kZSAmJiBmaWdtYU5vZGUuaW5wdXRTcGVjO1xuICAgIGNvbnN0IHRleHROb2RlSWQgPSBTdHJpbmcocmF3ICYmIHJhdy50ZXh0Tm9kZUlkIHx8ICcnKTtcbiAgICBpZiAoIXJhdyB8fCAhdGV4dE5vZGVJZCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgbWF4TGVuZ3RoVmFsdWUgPSBOdW1iZXIocmF3Lm1heExlbmd0aCk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbXVsdGlsaW5lOiByYXcubXVsdGlsaW5lID09PSB0cnVlLFxuICAgICAgICAvLyBDb2NvcyAzLjggdHJlYXRzIG1heExlbmd0aD0wIGFzIFwiYWNjZXB0IG5vIGNoYXJhY3RlcnNcIi4gVGhlIEZ0b1hcbiAgICAgICAgLy8gY29udHJhY3QgdXNlcyAtMSBmb3IgYW4gb21pdHRlZCBjb3VudGVyLCB3aGlsZSBvbGRlciBwYXlsb2FkcyB1c2VkIDA7XG4gICAgICAgIC8vIG5vcm1hbGl6ZSBib3RoIGZvcm1zIHRvIHRoZSBlbmdpbmUncyB1bmxpbWl0ZWQgc2VudGluZWwuXG4gICAgICAgIG1heExlbmd0aDogTnVtYmVyLmlzRmluaXRlKG1heExlbmd0aFZhbHVlKSAmJiBtYXhMZW5ndGhWYWx1ZSA+IDAgPyBNYXRoLnRydW5jKG1heExlbmd0aFZhbHVlKSA6IC0xLFxuICAgICAgICBwbGFjZWhvbGRlcjogU3RyaW5nKHJhdy5wbGFjZWhvbGRlciB8fCAnJyksXG4gICAgICAgIHN0cmluZzogU3RyaW5nKHJhdy5zdHJpbmcgfHwgJycpLFxuICAgICAgICB0ZXh0Um9sZTogcmF3LnRleHRSb2xlID09PSAnc3RyaW5nJyA/ICdzdHJpbmcnIDogJ3BsYWNlaG9sZGVyJyxcbiAgICAgICAgdGV4dE5vZGVJZCxcbiAgICAgICAgY291bnRlck5vZGVJZDogcmF3LmNvdW50ZXJOb2RlSWQgPyBTdHJpbmcocmF3LmNvdW50ZXJOb2RlSWQpIDogdW5kZWZpbmVkLFxuICAgICAgICBiYWNrZ3JvdW5kTm9kZUlkOiByYXcuYmFja2dyb3VuZE5vZGVJZCA/IFN0cmluZyhyYXcuYmFja2dyb3VuZE5vZGVJZCkgOiB1bmRlZmluZWQsXG4gICAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGdG9jSW5wdXRFZGl0Qm94TW91bnRSZXN1bHQge1xuICAgIGFwcGxpZWQ6IGJvb2xlYW47XG4gICAgcmVhc29uOiBzdHJpbmc7XG4gICAgY3JlYXRlZEVkaXRCb3g6IGJvb2xlYW47XG4gICAgY3JlYXRlZFRleHRMYWJlbDogYm9vbGVhbjtcbiAgICBlZGl0Qm94OiBhbnkgfCBudWxsO1xuICAgIGF1dGhvcmVkTGFiZWw6IGFueSB8IG51bGw7XG4gICAgcGxhY2Vob2xkZXJMYWJlbDogYW55IHwgbnVsbDtcbiAgICB0ZXh0TGFiZWw6IGFueSB8IG51bGw7XG4gICAgdGV4dE5vZGU6IGFueSB8IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb3B5SW5wdXRMYWJlbFN0eWxlKHNvdXJjZTogYW55LCB0YXJnZXQ6IGFueSk6IHZvaWQge1xuICAgIGNvbnN0IHNjYWxhcktleXMgPSBbXG4gICAgICAgICdmb250JywgJ3VzZVN5c3RlbUZvbnQnLCAnZm9udEZhbWlseScsICdmb250U2l6ZScsICdsaW5lSGVpZ2h0JyxcbiAgICAgICAgJ2hvcml6b250YWxBbGlnbicsICd2ZXJ0aWNhbEFsaWduJywgJ292ZXJmbG93JywgJ2VuYWJsZVdyYXBUZXh0JyxcbiAgICAgICAgJ2lzQm9sZCcsICdpc0l0YWxpYycsICdzcGFjaW5nWCcsICdlbmFibGVPdXRsaW5lJywgJ291dGxpbmVXaWR0aCcsXG4gICAgICAgICdlbmFibGVTaGFkb3cnLCAnc2hhZG93Qmx1cicsICdjYWNoZU1vZGUnLCAnY3VzdG9tTWF0ZXJpYWwnLFxuICAgIF07XG4gICAgZm9yIChjb25zdCBrZXkgb2Ygc2NhbGFyS2V5cykge1xuICAgICAgICBpZiAodHlwZW9mIHNvdXJjZVtrZXldICE9PSAndW5kZWZpbmVkJykgdGFyZ2V0W2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgWydjb2xvcicsICdvdXRsaW5lQ29sb3InLCAnc2hhZG93Q29sb3InLCAnc2hhZG93T2Zmc2V0J10pIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3VuZGVmaW5lZCcpIHRhcmdldFtrZXldID0gdmFsdWUgJiYgdHlwZW9mIHZhbHVlLmNsb25lID09PSAnZnVuY3Rpb24nID8gdmFsdWUuY2xvbmUoKSA6IHZhbHVlO1xuICAgIH1cbn1cblxuLyoqIFN5bmMgYSBuYXRpdmUgRWRpdEJveCBMYWJlbCBhbmQga2VlcCB0aGUgYXV0aG9yZWQgc3R5bGUgc291cmNlIG5vbi1yZW5kZXJpbmcuICovXG5leHBvcnQgZnVuY3Rpb24gc3luY0lucHV0TmF0aXZlTGFiZWxTdHlsZShzb3VyY2U6IGFueSwgdGFyZ2V0OiBhbnkpOiB2b2lkIHtcbiAgICBjb3B5SW5wdXRMYWJlbFN0eWxlKHNvdXJjZSwgdGFyZ2V0KTtcbiAgICBpZiAoc291cmNlICYmIHR5cGVvZiBzb3VyY2UuZW5hYmxlZCAhPT0gJ3VuZGVmaW5lZCcpIHNvdXJjZS5lbmFibGVkID0gZmFsc2U7XG59XG5cbi8qKlxuICogTW91bnQgdGhlIHBlcnNpc3RlbnQgQ29jb3MgaW5wdXQgY29tcG9uZW50IGFmdGVyIGF1dGhvcmVkIGNoaWxkcmVuIGV4aXN0LlxuICogVGhlIGF1dGhvcmVkIHByaW1hcnkgVEVYVCByZW1haW5zIGluIHRoZSBpbXBvcnRlZCBoaWVyYXJjaHkgYXMgdGhlIHN0eWxlXG4gKiBzb3VyY2UuIEVkaXRCb3ggb3ducyBuYXRpdmUgcGxhY2Vob2xkZXIvdGV4dCBMYWJlbCBjaGlsZHJlbiBiZWNhdXNlIENyZWF0b3Inc1xuICogcnVudGltZSBwb3NpdGlvbnMgYW5kIGFjdGl2YXRlcyB0aG9zZSBsYWJlbHMgcmVsYXRpdmUgdG8gdGhlIEVkaXRCb3ggbm9kZS5cbiAqIEJhY2tncm91bmQgYW5kIGNvdW50ZXIgY2hpbGRyZW4gYXJlIG5ldmVyIHJlcGFyZW50ZWQgb3IgcmV3cml0dGVuLiBFZGl0Qm94XG4gKiBsaXZlcyBvbiBhbiBpbnRlcmFjdGlvbiBjaGlsZCBiZWNhdXNlIENvY29zIDMuOCBhbHdheXMgYWRkcyBhIFNwcml0ZSBvbiBmaXJzdFxuICogZW5hYmxlLCB3aGlsZSBhbiBhdXRob3JlZCBpbnB1dCBob3N0IG1heSBhbHJlYWR5IG9jY3VweSBpdHMgc29sZSBVSVJlbmRlcmVyXG4gKiBzbG90IHdpdGggR3JhcGhpY3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtb3VudEZ0b2NJbnB1dEVkaXRCb3goXG4gICAgaG9zdDogYW55LFxuICAgIGZpZ21hTm9kZTogYW55LFxuICAgIGF1dGhvcmVkVGV4dE5vZGU6IGFueSxcbiAgICBjYzogYW55LFxuKTogRnRvY0lucHV0RWRpdEJveE1vdW50UmVzdWx0IHtcbiAgICBjb25zdCBzcGVjID0gbm9ybWFsaXplRmlnbWFJbnB1dFNwZWMoZmlnbWFOb2RlKTtcbiAgICBjb25zdCB7IE5vZGUsIFVJVHJhbnNmb3JtLCBTcHJpdGUsIExhYmVsLCBFZGl0Qm94LCBXaWRnZXQsIFZlYzMgfSA9IGNjIHx8IHt9O1xuICAgIGNvbnN0IHVuYXZhaWxhYmxlID0gKHJlYXNvbjogc3RyaW5nKTogRnRvY0lucHV0RWRpdEJveE1vdW50UmVzdWx0ID0+ICh7XG4gICAgICAgIGFwcGxpZWQ6IGZhbHNlLFxuICAgICAgICByZWFzb24sXG4gICAgICAgIGNyZWF0ZWRFZGl0Qm94OiBmYWxzZSxcbiAgICAgICAgY3JlYXRlZFRleHRMYWJlbDogZmFsc2UsXG4gICAgICAgIGVkaXRCb3g6IG51bGwsXG4gICAgICAgIGF1dGhvcmVkTGFiZWw6IG51bGwsXG4gICAgICAgIHBsYWNlaG9sZGVyTGFiZWw6IG51bGwsXG4gICAgICAgIHRleHRMYWJlbDogbnVsbCxcbiAgICAgICAgdGV4dE5vZGU6IG51bGwsXG4gICAgfSk7XG4gICAgaWYgKCFzcGVjKSByZXR1cm4gdW5hdmFpbGFibGUoJ2lucHV0LXNwZWMtbWlzc2luZycpO1xuICAgIGlmIChzcGVjLnRleHRSb2xlICE9PSAncGxhY2Vob2xkZXInKSByZXR1cm4gdW5hdmFpbGFibGUoJ3Vuc3VwcG9ydGVkLXRleHQtcm9sZScpO1xuICAgIGlmICghaG9zdCB8fCAhYXV0aG9yZWRUZXh0Tm9kZSB8fCAhTm9kZSB8fCAhVUlUcmFuc2Zvcm0gfHwgIVNwcml0ZSB8fCAhTGFiZWwgfHwgIUVkaXRCb3ggfHwgIVZlYzMpIHtcbiAgICAgICAgcmV0dXJuIHVuYXZhaWxhYmxlKCdydW50aW1lLW9yLWF1dGhvcmVkLXRleHQtbWlzc2luZycpO1xuICAgIH1cbiAgICBjb25zdCBob3N0VWkgPSBob3N0LmdldENvbXBvbmVudCAmJiBob3N0LmdldENvbXBvbmVudChVSVRyYW5zZm9ybSk7XG4gICAgaWYgKCFob3N0VWkpIHJldHVybiB1bmF2YWlsYWJsZSgnaG9zdC11aS10cmFuc2Zvcm0tbWlzc2luZycpO1xuICAgIGNvbnN0IGF1dGhvcmVkTGFiZWwgPSBhdXRob3JlZFRleHROb2RlLmdldENvbXBvbmVudCAmJiBhdXRob3JlZFRleHROb2RlLmdldENvbXBvbmVudChMYWJlbCk7XG4gICAgaWYgKCFhdXRob3JlZExhYmVsKSByZXR1cm4gdW5hdmFpbGFibGUoJ3BsYWNlaG9sZGVyLWxhYmVsLW1pc3NpbmcnKTtcbiAgICBjb25zdCBhdXRob3JlZFVpID0gYXV0aG9yZWRUZXh0Tm9kZS5nZXRDb21wb25lbnQgJiYgYXV0aG9yZWRUZXh0Tm9kZS5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pO1xuICAgIGlmICghYXV0aG9yZWRVaSkgcmV0dXJuIHVuYXZhaWxhYmxlKCdwbGFjZWhvbGRlci11aS10cmFuc2Zvcm0tbWlzc2luZycpO1xuXG4gICAgY29uc3QgYXV0aG9yZWRTaXplID0gcmVhZFVpU2l6ZShhdXRob3JlZFVpKTtcbiAgICBjb25zdCBhdXRob3JlZEFuY2hvciA9IHJlYWRVaUFuY2hvcihhdXRob3JlZFVpKTtcbiAgICBjb25zdCBhdXRob3JlZFBvc2l0aW9uID0gcmVhZE5vZGVQb3NpdGlvbihhdXRob3JlZFRleHROb2RlKTtcbiAgICBjb25zdCBhdXRob3JlZFNjYWxlID0gcmVhZE5vZGVTY2FsZShhdXRob3JlZFRleHROb2RlKTtcblxuICAgIGNvbnN0IHJlbW92ZUlucHV0V2lkZ2V0ID0gKHRhcmdldDogYW55KTogdm9pZCA9PiB7XG4gICAgICAgIGNvbnN0IHdpZGdldCA9IFdpZGdldCAmJiB0YXJnZXQgJiYgdGFyZ2V0LmdldENvbXBvbmVudCAmJiB0YXJnZXQuZ2V0Q29tcG9uZW50KFdpZGdldCk7XG4gICAgICAgIGlmICghd2lkZ2V0KSByZXR1cm47XG4gICAgICAgIHdpZGdldC5lbmFibGVkID0gZmFsc2U7XG4gICAgICAgIHdpZGdldC5pc0FsaWduTGVmdCA9IHdpZGdldC5pc0FsaWduUmlnaHQgPSBmYWxzZTtcbiAgICAgICAgd2lkZ2V0LmlzQWxpZ25Ub3AgPSB3aWRnZXQuaXNBbGlnbkJvdHRvbSA9IGZhbHNlO1xuICAgICAgICBpZiAodHlwZW9mIHdpZGdldC5kZXN0cm95ID09PSAnZnVuY3Rpb24nKSB3aWRnZXQuZGVzdHJveSgpO1xuICAgIH07XG5cbiAgICBjb25zdCBlZGl0Qm94SG9zdHMgPSAoaG9zdC5jaGlsZHJlbiB8fCBbXSkuZmlsdGVyKFxuICAgICAgICAoY2hpbGQ6IGFueSkgPT4gY2hpbGQgJiYgY2hpbGQubmFtZSA9PT0gRlRPQ19JTlBVVF9FRElUQk9YX0hPU1RfTkFNRVxuICAgICk7XG4gICAgbGV0IGVkaXRCb3hOb2RlID0gZWRpdEJveEhvc3RzLmZpbmQoXG4gICAgICAgIChjaGlsZDogYW55KSA9PiBjaGlsZC5nZXRDb21wb25lbnQgJiYgY2hpbGQuZ2V0Q29tcG9uZW50KEVkaXRCb3gpXG4gICAgKSB8fCBlZGl0Qm94SG9zdHNbMF0gfHwgbnVsbDtcbiAgICBpZiAoIWVkaXRCb3hOb2RlKSB7XG4gICAgICAgIGVkaXRCb3hOb2RlID0gbmV3IE5vZGUoRlRPQ19JTlBVVF9FRElUQk9YX0hPU1RfTkFNRSk7XG4gICAgICAgIGVkaXRCb3hOb2RlLmFjdGl2ZSA9IGZhbHNlO1xuICAgICAgICBob3N0LmFkZENoaWxkKGVkaXRCb3hOb2RlKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBleHRyYSBvZiBlZGl0Qm94SG9zdHMpIHtcbiAgICAgICAgaWYgKGV4dHJhID09PSBlZGl0Qm94Tm9kZSkgY29udGludWU7XG4gICAgICAgIGlmICh0eXBlb2YgZXh0cmEucmVtb3ZlRnJvbVBhcmVudCA9PT0gJ2Z1bmN0aW9uJykgZXh0cmEucmVtb3ZlRnJvbVBhcmVudCgpO1xuICAgICAgICBpZiAodHlwZW9mIGV4dHJhLmRlc3Ryb3kgPT09ICdmdW5jdGlvbicpIGV4dHJhLmRlc3Ryb3koKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBob3N0LmxheWVyID09PSAnbnVtYmVyJykgZWRpdEJveE5vZGUubGF5ZXIgPSBob3N0LmxheWVyO1xuICAgIGNvbnN0IGVkaXRCb3hVaSA9IGVkaXRCb3hOb2RlLmdldENvbXBvbmVudChVSVRyYW5zZm9ybSkgfHwgZWRpdEJveE5vZGUuYWRkQ29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICAvLyBDcmVhdG9yIG93bnMgbmF0aXZlIExhYmVsIGdlb21ldHJ5IGFuZCBhbHdheXMgZXhwYW5kcyBpdCB0byB0aGUgRWRpdEJveCByZWN0LlxuICAgIC8vIE1ha2UgdGhhdCByZWN0IHRoZSBhdXRob3JlZCB0ZXh0IGJveCBzbyBlbmdpbmUgbGlmZWN5Y2xlIGFuZCBGdG9DIGhhdmUgb25lIG93bmVyLlxuICAgIGVkaXRCb3hVaS5zZXRDb250ZW50U2l6ZShhdXRob3JlZFNpemUud2lkdGgsIGF1dGhvcmVkU2l6ZS5oZWlnaHQpO1xuICAgIGVkaXRCb3hVaS5zZXRBbmNob3JQb2ludChhdXRob3JlZEFuY2hvci54LCBhdXRob3JlZEFuY2hvci55KTtcbiAgICBlZGl0Qm94Tm9kZS5zZXRQb3NpdGlvbihuZXcgVmVjMyhhdXRob3JlZFBvc2l0aW9uLngsIGF1dGhvcmVkUG9zaXRpb24ueSwgMCkpO1xuICAgIGVkaXRCb3hOb2RlLmFuZ2xlID0gTnVtYmVyKGF1dGhvcmVkVGV4dE5vZGUuYW5nbGUpIHx8IDA7XG4gICAgZWRpdEJveE5vZGUuc2V0U2NhbGUobmV3IFZlYzMoYXV0aG9yZWRTY2FsZS54LCBhdXRob3JlZFNjYWxlLnksIDEpKTtcbiAgICByZW1vdmVJbnB1dFdpZGdldChlZGl0Qm94Tm9kZSk7XG5cbiAgICBjb25zdCBjb2xsZWN0TGFiZWxIZWxwZXJzID0gKG5hbWU6IHN0cmluZywgbGVnYWN5TmFtZTogc3RyaW5nKTogYW55W10gPT4gW1xuICAgICAgICAuLi4oZWRpdEJveE5vZGUuY2hpbGRyZW4gfHwgW10pLmZpbHRlcihcbiAgICAgICAgICAgIChjaGlsZDogYW55KSA9PiBjaGlsZCAmJiAoY2hpbGQubmFtZSA9PT0gbmFtZSB8fCBjaGlsZC5uYW1lID09PSBsZWdhY3lOYW1lKVxuICAgICAgICApLFxuICAgICAgICAuLi4oaG9zdC5jaGlsZHJlbiB8fCBbXSkuZmlsdGVyKFxuICAgICAgICAgICAgKGNoaWxkOiBhbnkpID0+IGNoaWxkICYmIGNoaWxkLm5hbWUgPT09IGxlZ2FjeU5hbWVcbiAgICAgICAgKSxcbiAgICBdO1xuICAgIGNvbnN0IGVuc3VyZU5hdGl2ZUxhYmVsTm9kZSA9IChuYW1lOiBzdHJpbmcsIGxlZ2FjeU5hbWU6IHN0cmluZyk6IHsgbm9kZTogYW55OyBjcmVhdGVkOiBib29sZWFuIH0gPT4ge1xuICAgICAgICBjb25zdCBoZWxwZXJzID0gY29sbGVjdExhYmVsSGVscGVycyhuYW1lLCBsZWdhY3lOYW1lKTtcbiAgICAgICAgbGV0IGxhYmVsTm9kZSA9IGhlbHBlcnMuZmluZChcbiAgICAgICAgICAgIChjaGlsZDogYW55KSA9PiBjaGlsZC5wYXJlbnQgPT09IGVkaXRCb3hOb2RlICYmIGNoaWxkLm5hbWUgPT09IG5hbWUgJiZcbiAgICAgICAgICAgICAgICBjaGlsZC5nZXRDb21wb25lbnQgJiYgY2hpbGQuZ2V0Q29tcG9uZW50KExhYmVsKVxuICAgICAgICApIHx8IGhlbHBlcnMuZmluZChcbiAgICAgICAgICAgIChjaGlsZDogYW55KSA9PiBjaGlsZC5nZXRDb21wb25lbnQgJiYgY2hpbGQuZ2V0Q29tcG9uZW50KExhYmVsKVxuICAgICAgICApIHx8IGhlbHBlcnNbMF0gfHwgbnVsbDtcbiAgICAgICAgY29uc3QgY3JlYXRlZCA9ICFsYWJlbE5vZGU7XG4gICAgICAgIGlmICghbGFiZWxOb2RlKSB7XG4gICAgICAgICAgICBsYWJlbE5vZGUgPSBuZXcgTm9kZShuYW1lKTtcbiAgICAgICAgICAgIGxhYmVsTm9kZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobGFiZWxOb2RlLnBhcmVudCAhPT0gZWRpdEJveE5vZGUpIGVkaXRCb3hOb2RlLmFkZENoaWxkKGxhYmVsTm9kZSk7XG4gICAgICAgIGxhYmVsTm9kZS5uYW1lID0gbmFtZTtcbiAgICAgICAgZm9yIChjb25zdCBleHRyYSBvZiBoZWxwZXJzKSB7XG4gICAgICAgICAgICBpZiAoZXh0cmEgPT09IGxhYmVsTm9kZSkgY29udGludWU7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGV4dHJhLnJlbW92ZUZyb21QYXJlbnQgPT09ICdmdW5jdGlvbicpIGV4dHJhLnJlbW92ZUZyb21QYXJlbnQoKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZXh0cmEuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykgZXh0cmEuZGVzdHJveSgpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgaG9zdC5sYXllciA9PT0gJ251bWJlcicpIGxhYmVsTm9kZS5sYXllciA9IGhvc3QubGF5ZXI7XG4gICAgICAgIGNvbnN0IGxhYmVsVWkgPSBsYWJlbE5vZGUuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKSB8fCBsYWJlbE5vZGUuYWRkQ29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICAgICAgLy8gTWlycm9yIENyZWF0b3IgMy44J3MgbmF0aXZlIGxheW91dCBmb3IgYW4gYWxyZWFkeS1hY3RpdmUgRWRpdEJveC4gRnJlc2hcbiAgICAgICAgLy8gY29tcG9uZW50cyB3aWxsIGFwcGx5IHRoZSBzYW1lIHZhbHVlcyBmcm9tIEVkaXRCb3guX19wcmVsb2FkKCkuXG4gICAgICAgIGxhYmVsVWkuc2V0Q29udGVudFNpemUoTWF0aC5tYXgoMCwgYXV0aG9yZWRTaXplLndpZHRoIC0gMiksIGF1dGhvcmVkU2l6ZS5oZWlnaHQpO1xuICAgICAgICBsYWJlbFVpLnNldEFuY2hvclBvaW50KDAsIDEpO1xuICAgICAgICBsYWJlbE5vZGUuc2V0UG9zaXRpb24obmV3IFZlYzMoXG4gICAgICAgICAgICAtYXV0aG9yZWRBbmNob3IueCAqIGF1dGhvcmVkU2l6ZS53aWR0aCArIDIsXG4gICAgICAgICAgICAoMSAtIGF1dGhvcmVkQW5jaG9yLnkpICogYXV0aG9yZWRTaXplLmhlaWdodCxcbiAgICAgICAgICAgIDAsXG4gICAgICAgICkpO1xuICAgICAgICBsYWJlbE5vZGUuYW5nbGUgPSAwO1xuICAgICAgICBsYWJlbE5vZGUuc2V0U2NhbGUobmV3IFZlYzMoMSwgMSwgMSkpO1xuICAgICAgICByZW1vdmVJbnB1dFdpZGdldChsYWJlbE5vZGUpO1xuICAgICAgICByZXR1cm4geyBub2RlOiBsYWJlbE5vZGUsIGNyZWF0ZWQgfTtcbiAgICB9O1xuXG4gICAgY29uc3QgdGV4dEhlbHBlciA9IGVuc3VyZU5hdGl2ZUxhYmVsTm9kZShcbiAgICAgICAgRlRPQ19JTlBVVF9URVhUX0xBQkVMX05BTUUsXG4gICAgICAgIExFR0FDWV9GVE9DX0lOUFVUX1RFWFRfTEFCRUxfTkFNRSxcbiAgICApO1xuICAgIGNvbnN0IHRleHROb2RlID0gdGV4dEhlbHBlci5ub2RlO1xuICAgIGNvbnN0IHBsYWNlaG9sZGVyTm9kZSA9IGVuc3VyZU5hdGl2ZUxhYmVsTm9kZShcbiAgICAgICAgRlRPQ19JTlBVVF9QTEFDRUhPTERFUl9MQUJFTF9OQU1FLFxuICAgICAgICBMRUdBQ1lfRlRPQ19JTlBVVF9QTEFDRUhPTERFUl9MQUJFTF9OQU1FLFxuICAgICkubm9kZTtcblxuICAgIGNvbnN0IGV4aXN0aW5nRWRpdEJveCA9IGVkaXRCb3hOb2RlLmdldENvbXBvbmVudCAmJiBlZGl0Qm94Tm9kZS5nZXRDb21wb25lbnQoRWRpdEJveCk7XG4gICAgbGV0IGVkaXRCb3ggPSBleGlzdGluZ0VkaXRCb3g7XG4gICAgbGV0IHRleHRMYWJlbDogYW55ID0gbnVsbDtcbiAgICBsZXQgcGxhY2Vob2xkZXJMYWJlbDogYW55ID0gbnVsbDtcbiAgICBpZiAoIWV4aXN0aW5nRWRpdEJveCAmJiBlZGl0Qm94Tm9kZS5hY3RpdmUgPT09IHRydWUpIGVkaXRCb3hOb2RlLmFjdGl2ZSA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICAgIHRleHRMYWJlbCA9IHRleHROb2RlLmdldENvbXBvbmVudChMYWJlbCkgfHwgdGV4dE5vZGUuYWRkQ29tcG9uZW50KExhYmVsKTtcbiAgICAgICAgcGxhY2Vob2xkZXJMYWJlbCA9IHBsYWNlaG9sZGVyTm9kZS5nZXRDb21wb25lbnQoTGFiZWwpIHx8IHBsYWNlaG9sZGVyTm9kZS5hZGRDb21wb25lbnQoTGFiZWwpO1xuICAgICAgICBjb3B5SW5wdXRMYWJlbFN0eWxlKGF1dGhvcmVkTGFiZWwsIHBsYWNlaG9sZGVyTGFiZWwpO1xuICAgICAgICBjb3B5SW5wdXRMYWJlbFN0eWxlKGF1dGhvcmVkTGFiZWwsIHRleHRMYWJlbCk7XG4gICAgICAgIHBsYWNlaG9sZGVyTGFiZWwuc3RyaW5nID0gc3BlYy5wbGFjZWhvbGRlcjtcbiAgICAgICAgdGV4dExhYmVsLnN0cmluZyA9IHNwZWMuc3RyaW5nO1xuXG4gICAgICAgIC8vIEFkZCB0aGUgZW5naW5lLXJlcXVpcmVkIHJlbmRlcmVyIGJlZm9yZSBFZGl0Qm94J3MgZmlyc3Qgb25FbmFibGUgc29cbiAgICAgICAgLy8gX2Vuc3VyZUJhY2tncm91bmRTcHJpdGUgb25seSByZXNvbHZlcyBpdCBhbmQgbmV2ZXIgdG91Y2hlcyBob3N0IEdyYXBoaWNzLlxuICAgICAgICBlZGl0Qm94Tm9kZS5nZXRDb21wb25lbnQoU3ByaXRlKSB8fCBlZGl0Qm94Tm9kZS5hZGRDb21wb25lbnQoU3ByaXRlKTtcbiAgICAgICAgZWRpdEJveCA9IGVkaXRCb3ggfHwgZWRpdEJveE5vZGUuYWRkQ29tcG9uZW50KEVkaXRCb3gpO1xuICAgICAgICBlZGl0Qm94LnBsYWNlaG9sZGVyTGFiZWwgPSBwbGFjZWhvbGRlckxhYmVsO1xuICAgICAgICBlZGl0Qm94LnRleHRMYWJlbCA9IHRleHRMYWJlbDtcbiAgICAgICAgZWRpdEJveC5wbGFjZWhvbGRlciA9IHNwZWMucGxhY2Vob2xkZXI7XG4gICAgICAgIGVkaXRCb3gubWF4TGVuZ3RoID0gc3BlYy5tYXhMZW5ndGg7XG4gICAgICAgIGlmIChFZGl0Qm94LklucHV0TW9kZSkge1xuICAgICAgICAgICAgZWRpdEJveC5pbnB1dE1vZGUgPSBzcGVjLm11bHRpbGluZSA/IEVkaXRCb3guSW5wdXRNb2RlLkFOWSA6IEVkaXRCb3guSW5wdXRNb2RlLlNJTkdMRV9MSU5FO1xuICAgICAgICB9XG4gICAgICAgIGlmIChFZGl0Qm94LklucHV0RmxhZyAmJiBFZGl0Qm94LklucHV0RmxhZy5ERUZBVUxUICE9IG51bGwpIGVkaXRCb3guaW5wdXRGbGFnID0gRWRpdEJveC5JbnB1dEZsYWcuREVGQVVMVDtcbiAgICAgICAgaWYgKEVkaXRCb3guS2V5Ym9hcmRSZXR1cm5UeXBlICYmIEVkaXRCb3guS2V5Ym9hcmRSZXR1cm5UeXBlLkRFRkFVTFQgIT0gbnVsbCkge1xuICAgICAgICAgICAgZWRpdEJveC5yZXR1cm5UeXBlID0gRWRpdEJveC5LZXlib2FyZFJldHVyblR5cGUuREVGQVVMVDtcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgc3RyaW5nIHNldHRlciB0cnVuY2F0ZXMgYWdhaW5zdCB0aGUgY3VycmVudCBtYXhMZW5ndGggKDIwIGJ5XG4gICAgICAgIC8vIGRlZmF1bHQpLCBzbyBjb25maWd1cmUgdGhlIGxpbWl0IGJlZm9yZSBhc3NpZ25pbmcgaW5pdGlhbCBjb250ZW50LlxuICAgICAgICBlZGl0Qm94LnN0cmluZyA9IHNwZWMuc3RyaW5nO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAgIGVkaXRCb3hOb2RlLmFjdGl2ZSA9IHRydWU7XG4gICAgfVxuICAgIC8vIEtlZXAgdGhlIGF1dGhvcmVkIExhYmVsIGFzIGFuIGluc3BlY3RhYmxlIHN0eWxlIHNvdXJjZSwgYnV0IG9ubHkgZGlzYWJsZVxuICAgIC8vIGl0IGFmdGVyIHRoZSBuYXRpdmUgRWRpdEJveCBhbmQgYm90aCBsYWJlbHMgbW91bnRlZCBzdWNjZXNzZnVsbHkuXG4gICAgaWYgKHR5cGVvZiBhdXRob3JlZExhYmVsLmVuYWJsZWQgIT09ICd1bmRlZmluZWQnKSBhdXRob3JlZExhYmVsLmVuYWJsZWQgPSBmYWxzZTtcbiAgICByZXR1cm4ge1xuICAgICAgICBhcHBsaWVkOiB0cnVlLFxuICAgICAgICByZWFzb246ICdtb3VudGVkJyxcbiAgICAgICAgY3JlYXRlZEVkaXRCb3g6ICFleGlzdGluZ0VkaXRCb3gsXG4gICAgICAgIGNyZWF0ZWRUZXh0TGFiZWw6IHRleHRIZWxwZXIuY3JlYXRlZCxcbiAgICAgICAgZWRpdEJveCxcbiAgICAgICAgYXV0aG9yZWRMYWJlbCxcbiAgICAgICAgcGxhY2Vob2xkZXJMYWJlbCxcbiAgICAgICAgdGV4dExhYmVsLFxuICAgICAgICB0ZXh0Tm9kZSxcbiAgICB9O1xufVxuXG4vKiogQHpoIEZpZ21hIHRleHRDYXNlIOKGkiBDb2NvcyBMYWJlbC5zdHJpbmfjgIIgKi9cbmZ1bmN0aW9uIGFwcGx5VGV4dENhc2UodGV4dDogc3RyaW5nLCB0ZXh0Q2FzZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBzd2l0Y2ggKFN0cmluZyh0ZXh0Q2FzZSB8fCAnJykudG9VcHBlckNhc2UoKSkge1xuICAgICAgICBjYXNlICdVUFBFUic6XG4gICAgICAgICAgICByZXR1cm4gdGV4dC50b0xvY2FsZVVwcGVyQ2FzZSgpO1xuICAgICAgICBjYXNlICdMT1dFUic6XG4gICAgICAgICAgICByZXR1cm4gdGV4dC50b0xvY2FsZUxvd2VyQ2FzZSgpO1xuICAgICAgICBjYXNlICdUSVRMRSc6XG4gICAgICAgICAgICByZXR1cm4gdGV4dC5yZXBsYWNlKC9cXFMrL2csICh3b3JkKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKHdvcmQubGVuZ3RoIDw9IDEpIHJldHVybiB3b3JkLnRvTG9jYWxlVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdvcmQuY2hhckF0KDApLnRvTG9jYWxlVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpLnRvTG9jYWxlTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgY2FzZSAnT1JJR0lOQUwnOlxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByaWNoVGV4dEVzY2FwZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBTdHJpbmcodGV4dCB8fCAnJylcbiAgICAgICAgLnJlcGxhY2UoLyYvZywgJyZhbXA7JylcbiAgICAgICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuICAgICAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpO1xufVxuXG5mdW5jdGlvbiBjb2xvclRvSGV4KGM6IGFueSk6IHN0cmluZyB7XG4gICAgY29uc3QgcmF3ID0gW2MgJiYgYy5yLCBjICYmIGMuZywgYyAmJiBjLmIsIGMgJiYgYy5hXTtcbiAgICBjb25zdCByZ2JJc1VuaXRSYW5nZSA9IHJhdy5zbGljZSgwLCAzKS5ldmVyeSgodmFsdWUpID0+IHtcbiAgICAgICAgY29uc3QgbiA9IE51bWJlcih2YWx1ZSk7XG4gICAgICAgIHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgJiYgbiA+PSAwICYmIG4gPD0gMTtcbiAgICB9KTtcbiAgICBjb25zdCBhbHBoYSA9IE51bWJlcihyYXdbM10pO1xuICAgIGNvbnN0IGFscGhhSXNVbml0UmFuZ2UgPSBOdW1iZXIuaXNGaW5pdGUoYWxwaGEpICYmIGFscGhhID49IDAgJiYgYWxwaGEgPD0gMTtcbiAgICBjb25zdCByZ2JTY2FsZSA9IHJnYklzVW5pdFJhbmdlID8gMjU1IDogMTtcbiAgICBjb25zdCBhbHBoYVNjYWxlID0gYWxwaGFJc1VuaXRSYW5nZSA/IDI1NSA6IDE7XG4gICAgY29uc3QgciA9IGNsYW1wMjU1KE51bWJlcihyYXdbMF0pICogcmdiU2NhbGUpO1xuICAgIGNvbnN0IGcgPSBjbGFtcDI1NShOdW1iZXIocmF3WzFdKSAqIHJnYlNjYWxlKTtcbiAgICBjb25zdCBiID0gY2xhbXAyNTUoTnVtYmVyKHJhd1syXSkgKiByZ2JTY2FsZSk7XG4gICAgY29uc3QgYSA9IGNsYW1wMjU1KChOdW1iZXIuaXNGaW5pdGUoYWxwaGEpID8gYWxwaGEgOiAyNTUpICogYWxwaGFTY2FsZSk7XG4gICAgcmV0dXJuIFtyLCBnLCBiLCBhXS5tYXAoKHYpID0+IHYudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJycpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJpY2hUZXh0U2VnbWVudFJ1biB7XG4gICAgc3RhcnQ6IG51bWJlcjtcbiAgICBlbmQ6IG51bWJlcjtcbiAgICBmb250U2l6ZTogbnVtYmVyO1xuICAgIGNvbG9yPzogYW55O1xufVxuXG4vKipcbiAqIE5vcm1hbGl6ZSBleHBvcnRlciBzZWdtZW50cyBiZWZvcmUgcHJvZHVjaW5nIG1hcmt1cC4gRmlnbWEgbm9ybWFsbHkgc2VuZHMgYVxuICogY29tcGxldGUgb3JkZXJlZCBwYXJ0aXRpb24sIGJ1dCBvbGRlciBKU09OIGFuZCBwb3N0LXByb2Nlc3NvcnMgbWF5IGxlYXZlXG4gKiBnYXBzLCBvdmVybGFwcywgb3IgcmV2ZXJzZSB0aGUgb3JkZXIuIEJhc2Utc3R5bGUgcnVucyBrZWVwIGV2ZXJ5IGF1dGhvcmVkXG4gKiBjaGFyYWN0ZXIgdmlzaWJsZSB3aGlsZSBleHBsaWNpdCBydW5zIHJldGFpbiB0aGVpciBzZWdtZW50IGFwcGVhcmFuY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVSaWNoVGV4dFNlZ21lbnRSdW5zKGNoYXJhY3RlcnM6IHN0cmluZywgbm9kZTogYW55KTogUmljaFRleHRTZWdtZW50UnVuW10ge1xuICAgIGNvbnN0IGxlbmd0aCA9IFN0cmluZyhjaGFyYWN0ZXJzIHx8ICcnKS5sZW5ndGg7XG4gICAgY29uc3QgcmF3ID0gQXJyYXkuaXNBcnJheShub2RlICYmIG5vZGUudGV4dFNlZ21lbnRzKSA/IG5vZGUudGV4dFNlZ21lbnRzIDogW107XG4gICAgY29uc3QgZXhwbGljaXQgPSByYXdcbiAgICAgICAgLm1hcCgoc2VnbWVudDogYW55LCBpbmRleDogbnVtYmVyKSA9PiAoe1xuICAgICAgICAgICAgaW5kZXgsXG4gICAgICAgICAgICBzdGFydDogTWF0aC5tYXgoMCwgTWF0aC5taW4obGVuZ3RoLCBNYXRoLnJvdW5kKE51bWJlcihzZWdtZW50ICYmIHNlZ21lbnQuc3RhcnQpIHx8IDApKSksXG4gICAgICAgICAgICBlbmQ6IE1hdGgubWF4KDAsIE1hdGgubWluKGxlbmd0aCwgTWF0aC5yb3VuZChOdW1iZXIoc2VnbWVudCAmJiBzZWdtZW50LmVuZCkgfHwgMCkpKSxcbiAgICAgICAgICAgIGZvbnRTaXplOiBOdW1iZXIoc2VnbWVudCAmJiBzZWdtZW50LmZvbnRTaXplKSB8fCAwLFxuICAgICAgICAgICAgY29sb3I6IHNlZ21lbnQgJiYgc2VnbWVudC5jb2xvcixcbiAgICAgICAgfSkpXG4gICAgICAgIC5maWx0ZXIoKHNlZ21lbnQ6IGFueSkgPT4gc2VnbWVudC5lbmQgPiBzZWdtZW50LnN0YXJ0KVxuICAgICAgICAuc29ydCgobGVmdDogYW55LCByaWdodDogYW55KSA9PiBsZWZ0LnN0YXJ0IC0gcmlnaHQuc3RhcnQgfHwgbGVmdC5pbmRleCAtIHJpZ2h0LmluZGV4KTtcblxuICAgIGNvbnN0IHJ1bnM6IFJpY2hUZXh0U2VnbWVudFJ1bltdID0gW107XG4gICAgbGV0IGN1cnNvciA9IDA7XG4gICAgY29uc3QgYmFzZUZvbnRTaXplID0gTnVtYmVyKG5vZGUgJiYgbm9kZS5mb250U2l6ZSkgfHwgMDtcbiAgICBmb3IgKGNvbnN0IHNlZ21lbnQgb2YgZXhwbGljaXQpIHtcbiAgICAgICAgaWYgKHNlZ21lbnQuc3RhcnQgPiBjdXJzb3IpIHtcbiAgICAgICAgICAgIHJ1bnMucHVzaCh7IHN0YXJ0OiBjdXJzb3IsIGVuZDogc2VnbWVudC5zdGFydCwgZm9udFNpemU6IGJhc2VGb250U2l6ZSB9KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdGFydCA9IE1hdGgubWF4KGN1cnNvciwgc2VnbWVudC5zdGFydCk7XG4gICAgICAgIGlmIChzZWdtZW50LmVuZCA+IHN0YXJ0KSB7XG4gICAgICAgICAgICBydW5zLnB1c2goe1xuICAgICAgICAgICAgICAgIHN0YXJ0LFxuICAgICAgICAgICAgICAgIGVuZDogc2VnbWVudC5lbmQsXG4gICAgICAgICAgICAgICAgZm9udFNpemU6IHNlZ21lbnQuZm9udFNpemUsXG4gICAgICAgICAgICAgICAgY29sb3I6IHNlZ21lbnQuY29sb3IsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGN1cnNvciA9IHNlZ21lbnQuZW5kO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChjdXJzb3IgPCBsZW5ndGgpIHJ1bnMucHVzaCh7IHN0YXJ0OiBjdXJzb3IsIGVuZDogbGVuZ3RoLCBmb250U2l6ZTogYmFzZUZvbnRTaXplIH0pO1xuICAgIHJldHVybiBydW5zO1xufVxuXG5mdW5jdGlvbiBidWlsZFJpY2hUZXh0TWFya3VwKGNoYXJhY3RlcnM6IHN0cmluZywgbm9kZTogYW55LCBjb2xvck92ZXJyaWRlPzogYW55KTogc3RyaW5nIHtcbiAgICBjb25zdCBzZWdtZW50cyA9IEFycmF5LmlzQXJyYXkobm9kZS50ZXh0U2VnbWVudHMpID8gbm9kZS50ZXh0U2VnbWVudHMgOiBbXTtcbiAgICBpZiAoc2VnbWVudHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgICAgbGV0IHRleHQgPSByaWNoVGV4dEVzY2FwZShhcHBseVRleHRDYXNlKGNoYXJhY3RlcnMsIG5vZGUudGV4dENhc2UpKTtcbiAgICAgICAgaWYgKGNvbG9yT3ZlcnJpZGUpIHRleHQgPSBgPGNvbG9yPSMke2NvbG9yVG9IZXgoY29sb3JPdmVycmlkZSl9PiR7dGV4dH08L2NvbG9yPmA7XG4gICAgICAgIHJldHVybiBhcHBseVJpY2hUZXh0RGVjb3JhdGlvbih0ZXh0LCBub2RlLCBjb2xvck92ZXJyaWRlKTtcbiAgICB9XG4gICAgY29uc3QgY2FzZWQgPSBhcHBseVRleHRDYXNlKGNoYXJhY3RlcnMsIG5vZGUudGV4dENhc2UpO1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAoY29uc3Qgc2VnIG9mIG5vcm1hbGl6ZVJpY2hUZXh0U2VnbWVudFJ1bnMoY2FzZWQsIG5vZGUpKSB7XG4gICAgICAgIGxldCB0ZXh0ID0gcmljaFRleHRFc2NhcGUoY2FzZWQuc2xpY2Uoc2VnLnN0YXJ0LCBzZWcuZW5kKSk7XG4gICAgICAgIGNvbnN0IHNpemUgPSBOdW1iZXIoc2VnLmZvbnRTaXplKSB8fCAwO1xuICAgICAgICBpZiAoc2l6ZSA+IDAgJiYgTWF0aC5hYnMoc2l6ZSAtIChub2RlLmZvbnRTaXplIHx8IDApKSA+IDAuMDEpIHtcbiAgICAgICAgICAgIHRleHQgPSBgPHNpemU9JHtzaXplfT4ke3RleHR9PC9zaXplPmA7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY29sb3IgPSBjb2xvck92ZXJyaWRlIHx8IHNlZy5jb2xvcjtcbiAgICAgICAgaWYgKGNvbG9yKSB7XG4gICAgICAgICAgICB0ZXh0ID0gYDxjb2xvcj0jJHtjb2xvclRvSGV4KGNvbG9yKX0+JHt0ZXh0fTwvY29sb3I+YDtcbiAgICAgICAgfVxuICAgICAgICBwYXJ0cy5wdXNoKHRleHQpO1xuICAgIH1cbiAgICByZXR1cm4gYXBwbHlSaWNoVGV4dERlY29yYXRpb24ocGFydHMuam9pbignJyksIG5vZGUsIGNvbG9yT3ZlcnJpZGUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRSaWNoVGV4dFN0cmluZyhjaGFyYWN0ZXJzOiBzdHJpbmcsIG5vZGU6IGFueSk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGJ1aWxkUmljaFRleHRNYXJrdXAoY2hhcmFjdGVycywgbm9kZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFJpY2hUZXh0U2hhZG93U3RyaW5nKGNoYXJhY3RlcnM6IHN0cmluZywgbm9kZTogYW55KTogc3RyaW5nIHtcbiAgICBjb25zdCBzaGFkb3cgPSBub2RlICYmIG5vZGUuc2hhZG93O1xuICAgIHJldHVybiBidWlsZFJpY2hUZXh0TWFya3VwKGNoYXJhY3RlcnMsIG5vZGUsIHNoYWRvdyAmJiBzaGFkb3cuY29sb3IpO1xufVxuXG5mdW5jdGlvbiBoYXNNaXhlZFRleHRTZWdtZW50cyhub2RlOiBhbnkpOiBib29sZWFuIHtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheShub2RlLnRleHRTZWdtZW50cykgJiYgbm9kZS50ZXh0U2VnbWVudHMubGVuZ3RoID4gMTtcbn1cblxuaW50ZXJmYWNlIEV4cG9ydENvbnRleHQge1xuICAgIGNjOiBhbnk7XG4gICAgaW1hZ2VTZWFyY2hEaXJzOiBzdHJpbmdbXTtcbiAgICBpbWFnZXM6IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgICBpbWFnZUlkQnlDb250ZW50OiB7IFtiYXNlNjQ6IHN0cmluZ106IHN0cmluZyB9O1xuICAgIGltYWdlQ291bnRlcjogbnVtYmVyO1xuICAgIHdhcm5pbmdzOiBzdHJpbmdbXTtcbiAgICBzdGF0czoge1xuICAgICAgICBub2RlczogbnVtYmVyO1xuICAgICAgICB0ZXh0czogbnVtYmVyO1xuICAgICAgICBzcHJpdGVzOiBudW1iZXI7XG4gICAgICAgIGltYWdlczogbnVtYmVyO1xuICAgICAgICBtaXNzaW5nSW1hZ2VzOiBudW1iZXI7XG4gICAgICAgIHNvbGlkRmlsbHM6IG51bWJlcjtcbiAgICAgICAgbWFza3M6IG51bWJlcjtcbiAgICAgICAgYnV0dG9uczogbnVtYmVyO1xuICAgICAgICBzbGljZWRTcHJpdGVzOiBudW1iZXI7XG4gICAgfTtcbn1cblxuZnVuY3Rpb24gcm91bmRFeHBvcnROdW1iZXIodmFsdWU6IG51bWJlciwgZGlnaXRzID0gMyk6IG51bWJlciB7XG4gICAgY29uc3QgbiA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUobikpIHJldHVybiAwO1xuICAgIGNvbnN0IHAgPSBNYXRoLnBvdygxMCwgZGlnaXRzKTtcbiAgICByZXR1cm4gTWF0aC5yb3VuZChuICogcCkgLyBwO1xufVxuXG5mdW5jdGlvbiBjb21wb25lbnRFbmFibGVkKGM6IGFueSk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAhIWMgJiYgYy5lbmFibGVkICE9PSBmYWxzZSAmJiBjLl9lbmFibGVkICE9PSBmYWxzZTtcbn1cblxuZnVuY3Rpb24gbG9hZEFzc2V0QW55KFxuICAgIGFzc2V0TWFuYWdlcjogYW55LFxuICAgIHV1aWQ6IHN0cmluZyxcbiAgICB0cmllcyA9IDEsXG4gICAgZGVsYXlNcyA9IDEwMCxcbiAgICByZWFkeT86IChhc3NldDogYW55KSA9PiBib29sZWFuLFxuKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgaWYgKCF1dWlkKSB7XG4gICAgICAgICAgICByZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGF0dGVtcHQgPSAobGVmdDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBhc3NldE1hbmFnZXIubG9hZEFueSh7IHV1aWQgfSwgKGVycjogYW55LCBhc3NldDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKCFlcnIgJiYgYXNzZXQgJiYgKCFyZWFkeSB8fCByZWFkeShhc3NldCkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoYXNzZXQpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChsZWZ0IDw9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGF0dGVtcHQobGVmdCAtIDEpLCBkZWxheU1zKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgICBhdHRlbXB0KE1hdGgubWF4KDAsIHRyaWVzIC0gMSkpO1xuICAgIH0pO1xufVxuXG4vKipcbiAqIEB6aCBDb2NvcyDlj6/og73lhYjov5Tlm54gU3ByaXRlRnJhbWUg5a+56LGh77yM5YaN5byC5q2l5oqK55yf5a6e57q555CG5o2i6L+b5p2l44CCXG4gKiAgICAg5Lmd5a6r5qC85Lya56uL5Y2z6LCD55SoIGNoZWNrUmVjdO+8m+iLpeatpOaXtuS7jeaYryAyeDIg5Li05pe257q555CG77yM57yW6L6R5Zmo5Lya5oqlXG4gKiAgICAgXCJSZWN0IHdpZHRoIGV4Y2VlZHMgbWF4aW11bSBtYXJnaW5cIuOAguW/hemhu+etiee6ueeQhuimhuebluW9k+WJjSByZWN0IOWQjuWGjeW6lOeUqCBpbnNldOOAglxuICovXG5mdW5jdGlvbiBpc1Nwcml0ZUZyYW1lVGV4dHVyZVJlYWR5KHNwcml0ZUZyYW1lOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXNwcml0ZUZyYW1lKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgdGV4dHVyZSA9IHNwcml0ZUZyYW1lLnRleHR1cmUgfHwgc3ByaXRlRnJhbWUuX3RleHR1cmU7XG4gICAgY29uc3QgcmVjdCA9IHNwcml0ZUZyYW1lLnJlY3QgfHwgc3ByaXRlRnJhbWUuX3JlY3Q7XG4gICAgaWYgKCF0ZXh0dXJlIHx8ICFyZWN0KSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgdGV4dHVyZVdpZHRoID0gTnVtYmVyKHRleHR1cmUud2lkdGgpIHx8IDA7XG4gICAgY29uc3QgdGV4dHVyZUhlaWdodCA9IE51bWJlcih0ZXh0dXJlLmhlaWdodCkgfHwgMDtcbiAgICBjb25zdCByZWN0WCA9IE51bWJlcihyZWN0LngpIHx8IDA7XG4gICAgY29uc3QgcmVjdFkgPSBOdW1iZXIocmVjdC55KSB8fCAwO1xuICAgIGNvbnN0IHJlY3RXaWR0aCA9IE51bWJlcihyZWN0LndpZHRoKSB8fCAwO1xuICAgIGNvbnN0IHJlY3RIZWlnaHQgPSBOdW1iZXIocmVjdC5oZWlnaHQpIHx8IDA7XG4gICAgaWYgKHRleHR1cmVXaWR0aCA8PSAwIHx8IHRleHR1cmVIZWlnaHQgPD0gMCB8fCByZWN0V2lkdGggPD0gMCB8fCByZWN0SGVpZ2h0IDw9IDApIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCByb3RhdGVkID0gISEoc3ByaXRlRnJhbWUucm90YXRlZCB8fCBzcHJpdGVGcmFtZS5fcm90YXRlZCB8fCBzcHJpdGVGcmFtZS5pc1JvdGF0ZSk7XG4gICAgY29uc3QgcmVxdWlyZWRXaWR0aCA9IHJlY3RYICsgKHJvdGF0ZWQgPyByZWN0SGVpZ2h0IDogcmVjdFdpZHRoKTtcbiAgICBjb25zdCByZXF1aXJlZEhlaWdodCA9IHJlY3RZICsgKHJvdGF0ZWQgPyByZWN0V2lkdGggOiByZWN0SGVpZ2h0KTtcbiAgICByZXR1cm4gdGV4dHVyZVdpZHRoID49IHJlcXVpcmVkV2lkdGggJiYgdGV4dHVyZUhlaWdodCA+PSByZXF1aXJlZEhlaWdodDtcbn1cblxuZnVuY3Rpb24gcmVhZFVpU2l6ZSh1aTogYW55KTogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHtcbiAgICBjb25zdCBjb250ZW50ID0gdWkgJiYgKHVpLmNvbnRlbnRTaXplIHx8IHVpLl9jb250ZW50U2l6ZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgd2lkdGg6IE1hdGgubWF4KDAsIE51bWJlcih1aSAmJiAodWkud2lkdGggPz8gKGNvbnRlbnQgJiYgY29udGVudC53aWR0aCkpKSB8fCAwKSxcbiAgICAgICAgaGVpZ2h0OiBNYXRoLm1heCgwLCBOdW1iZXIodWkgJiYgKHVpLmhlaWdodCA/PyAoY29udGVudCAmJiBjb250ZW50LmhlaWdodCkpKSB8fCAwKSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiByZWFkTm9kZVBvc2l0aW9uKG5vZGU6IGFueSk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gICAgY29uc3QgcCA9IG5vZGUgJiYgKG5vZGUucG9zaXRpb24gfHwgKG5vZGUuZ2V0UG9zaXRpb24gJiYgbm9kZS5nZXRQb3NpdGlvbigpKSk7XG4gICAgcmV0dXJuIHsgeDogTnVtYmVyKHAgJiYgcC54KSB8fCAwLCB5OiBOdW1iZXIocCAmJiBwLnkpIHx8IDAgfTtcbn1cblxuZnVuY3Rpb24gcmVhZE5vZGVTY2FsZShub2RlOiBhbnkpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIGNvbnN0IHMgPSBub2RlICYmIChub2RlLnNjYWxlIHx8IG5vZGUuX2xzY2FsZSk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgeDogTnVtYmVyKHMgJiYgcy54KSB8fCAxLFxuICAgICAgICB5OiBOdW1iZXIocyAmJiBzLnkpIHx8IDEsXG4gICAgfTtcbn1cblxuLy8g6YCJ5bGA6YOo5pu/5o2i5Z2Q5qCH5o2i566X55qE5Z+65YeG6IqC54K544CCZmlnbWFOb2RlIOeahCB4L3kg5piv55u45a+544CM6K6+6K6h56i/55S75biD44CN5bem5LiK55qE57ud5a+55Z2Q5qCH77yMXG4vLyDln7rlh4boioLngrnlv4XpobvmmK8gVUlUcmFuc2Zvcm0g5bC65a+4ID09IOiuvuiuoeeov+WwuuWvuOeahOmCo+S4quelluWFiO+8iOWvvOWFpeeahOeVjOmdouague+8ie+8jFxuLy8g5ZCm5YiZ55SoIENvY29zIENhbnZhcyDoioLngrnkvJrouKnlnZHvvJpDYW52YXMg5bi46KKr6K6+5oiQ6YCC6YWN5bC65a+477yI5aaCIDEyODDDlzcyMO+8ie+8jFxuLy8g5LiO6K6+6K6h56i/77yI5aaCIDcyMMOXMTI4MO+8ieWuvemrmOS4jeespu+8jOWvvOiHtOaMiSBDYW52YXMg5bC65a+4566X5Lit5b+D54K55pW05L2T5YGP56e744CCXG5mdW5jdGlvbiBmaW5kQ29vcmRCYXNlRm9yUGF0Y2gobm9kZTogYW55LCBkZXNpZ25XOiBudW1iZXIsIGRlc2lnbkg6IG51bWJlciwgVUlUcmFuc2Zvcm06IGFueSwgZmluZDogYW55KTogYW55IHtcbiAgICBsZXQgY3VyID0gbm9kZTtcbiAgICBsZXQgbGFzdFVpOiBhbnkgPSBudWxsO1xuICAgIGxldCBjYW52YXNOb2RlOiBhbnkgPSBudWxsO1xuICAgIGxldCBiZXN0OiBhbnkgPSBudWxsO1xuICAgIGxldCBiZXN0RGlmZiA9IEluZmluaXR5O1xuICAgIGNvbnN0IHdhbnRTaXplID0gZGVzaWduVyA+IDAgJiYgZGVzaWduSCA+IDA7XG4gICAgd2hpbGUgKGN1cikge1xuICAgICAgICBpZiAoY3VyLmdldENvbXBvbmVudCAmJiBjdXIuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKSkge1xuICAgICAgICAgICAgaWYgKCFsYXN0VWkpIGxhc3RVaSA9IGN1cjtcbiAgICAgICAgICAgIGlmIChTdHJpbmcoY3VyLm5hbWUgfHwgJycpID09PSAnQ2FudmFzJykgY2FudmFzTm9kZSA9IGN1cjtcbiAgICAgICAgICAgIGlmICh3YW50U2l6ZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHMgPSByZWFkVWlTaXplKGN1ci5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pKTtcbiAgICAgICAgICAgICAgICBjb25zdCBkaWZmID0gTWF0aC5hYnMocy53aWR0aCAtIGRlc2lnblcpICsgTWF0aC5hYnMocy5oZWlnaHQgLSBkZXNpZ25IKTtcbiAgICAgICAgICAgICAgICBpZiAoZGlmZiA8IGJlc3REaWZmKSB7IGJlc3REaWZmID0gZGlmZjsgYmVzdCA9IGN1cjsgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGN1ciA9IGN1ci5wYXJlbnQ7XG4gICAgfVxuICAgIC8vIOaJvuWIsOWwuuWvuOS4juiuvuiuoeeov+S4gOiHtO+8iOivr+W3ruKJpDJweO+8ieeahOelluWFiCA9IOeVjOmdouague+8jOS9nOWfuuWHhuacgOWHhuOAglxuICAgIGlmIChiZXN0ICYmIGJlc3REaWZmIDw9IDIpIHJldHVybiBiZXN0O1xuICAgIC8vIOWQpuWImemAgOWbniBDYW52YXPvvIjogIHooYzkuLrvvInvvIzlho3pgIDlm57mnIDov5HnpZblhYggLyDlhajlsYAgQ2FudmFz44CCXG4gICAgcmV0dXJuIGNhbnZhc05vZGUgfHwgKHR5cGVvZiBmaW5kID09PSAnZnVuY3Rpb24nICYmIGZpbmQoJ0NhbnZhcycpKSB8fCBsYXN0VWk7XG59XG5cbmZ1bmN0aW9uIHBsYWNlQXRDYW52YXNBYnNvbHV0ZShcbiAgICBub2RlOiBhbnksXG4gICAgZmlnbWFOb2RlOiBhbnksXG4gICAgY2FudmFzOiBhbnksXG4gICAgVmVjMzogYW55LFxuICAgIFVJVHJhbnNmb3JtOiBhbnksXG4gICAgZmluZDogYW55LFxuICAgIGFuY2hvclggPSAwLjUsXG4gICAgYW5jaG9yWSA9IDAuNSxcbiAgICBzY2FsZVggPSAxLFxuICAgIHNjYWxlWSA9IDEsXG4gICAgZmlnbWFSb3RhdGlvbiA9IDAsXG4pOiBib29sZWFuIHtcbiAgICBpZiAoIW5vZGUgfHwgIWZpZ21hTm9kZSB8fCAhY2FudmFzIHx8ICFWZWMzIHx8ICFVSVRyYW5zZm9ybSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHBhcmVudCA9IG5vZGUucGFyZW50O1xuICAgIGNvbnN0IHBhcmVudFVpID0gcGFyZW50ICYmIHBhcmVudC5nZXRDb21wb25lbnQgPyBwYXJlbnQuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKSA6IG51bGw7XG4gICAgLy8g6K6+6K6h56i/55S75biD5bC65a+477yI5p2D5aiB5YC85p2l6IeqIHBheWxvYWQg55qEIGNhbnZhcyDlj4LmlbDvvInvvIznlKjkuo7mioogZmlnbWFOb2RlIOeahFxuICAgIC8vIOeUu+W4g+e7neWvueWdkOagh+aNoueul+aIkOOAjOWfuuWHhuiKgueCueOAjeWxgOmDqOepuumXtOeahOS4reW/g+eCueOAglxuICAgIGNvbnN0IGRlc2lnblcgPSBOdW1iZXIoY2FudmFzICYmIGNhbnZhcy53aWR0aCkgfHwgMDtcbiAgICBjb25zdCBkZXNpZ25IID0gTnVtYmVyKGNhbnZhcyAmJiBjYW52YXMuaGVpZ2h0KSB8fCAwO1xuICAgIGNvbnN0IGJhc2VOb2RlID0gZmluZENvb3JkQmFzZUZvclBhdGNoKG5vZGUsIGRlc2lnblcsIGRlc2lnbkgsIFVJVHJhbnNmb3JtLCBmaW5kKTtcbiAgICBjb25zdCBiYXNlVWkgPSBiYXNlTm9kZSAmJiBiYXNlTm9kZS5nZXRDb21wb25lbnQgPyBiYXNlTm9kZS5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pIDogbnVsbDtcbiAgICBpZiAoIXBhcmVudFVpIHx8ICFiYXNlVWkgfHxcbiAgICAgICAgdHlwZW9mIGJhc2VVaS5jb252ZXJ0VG9Xb3JsZFNwYWNlQVIgIT09ICdmdW5jdGlvbicgfHxcbiAgICAgICAgdHlwZW9mIHBhcmVudFVpLmNvbnZlcnRUb05vZGVTcGFjZUFSICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB3ID0gTWF0aC5tYXgoMCwgTnVtYmVyKGZpZ21hTm9kZS53aWR0aCkgfHwgMCk7XG4gICAgY29uc3QgaCA9IE1hdGgubWF4KDAsIE51bWJlcihmaWdtYU5vZGUuaGVpZ2h0KSB8fCAwKTtcbiAgICAvLyDln7rlh4blsLrlr7jkvJjlhYjnlKjorr7orqHnqL/nlLvluIPlsLrlr7jvvJvpgIDlm57ln7rlh4boioLngrnoh6rouqvlsLrlr7jjgIJcbiAgICBjb25zdCBiYXNlU2l6ZSA9IHJlYWRVaVNpemUoYmFzZVVpKTtcbiAgICBjb25zdCBiYXNlVyA9IGRlc2lnblcgPiAwID8gZGVzaWduVyA6IChiYXNlU2l6ZS53aWR0aCA+IDAgPyBiYXNlU2l6ZS53aWR0aCA6IHcpO1xuICAgIGNvbnN0IGJhc2VIID0gZGVzaWduSCA+IDAgPyBkZXNpZ25IIDogKGJhc2VTaXplLmhlaWdodCA+IDAgPyBiYXNlU2l6ZS5oZWlnaHQgOiBoKTtcbiAgICAvLyDlhYjmioogRmlnbWEg55qE6KeG6KeJ5Lit5b+D6L2s5o2i5Yiw55uu5qCH54i26IqC54K55bGA6YOo56m66Ze077yM5YaN5oyJ6IqC54K56Ieq6Lqr55qE6ZSa54K5L+e8qeaUvi/ml4vovazlj43mjqggcG9zaXRpb27jgIJcbiAgICBjb25zdCBjZW50ZXJJbkJhc2UgPSBwb3NpdGlvbkZvckFuY2hvcihcbiAgICAgICAgTnVtYmVyKGZpZ21hTm9kZS54KSB8fCAwLFxuICAgICAgICBOdW1iZXIoZmlnbWFOb2RlLnkpIHx8IDAsXG4gICAgICAgIHcsXG4gICAgICAgIGgsXG4gICAgICAgIGJhc2VXLFxuICAgICAgICBiYXNlSCxcbiAgICAgICAgMC41LFxuICAgICAgICAwLjUsXG4gICAgKTtcbiAgICBjb25zdCB3b3JsZCA9IGJhc2VVaS5jb252ZXJ0VG9Xb3JsZFNwYWNlQVIobmV3IFZlYzMoY2VudGVySW5CYXNlLngsIGNlbnRlckluQmFzZS55LCAwKSk7XG4gICAgY29uc3QgY2VudGVyTG9jYWwgPSBwYXJlbnRVaS5jb252ZXJ0VG9Ob2RlU3BhY2VBUih3b3JsZCk7XG4gICAgY29uc3Qgb2Zmc2V0ID0gdmlzdWFsQ2VudGVyT2Zmc2V0RnJvbUFuY2hvcihcbiAgICAgICAgdyxcbiAgICAgICAgaCxcbiAgICAgICAgYW5jaG9yWCxcbiAgICAgICAgYW5jaG9yWSxcbiAgICAgICAgc2NhbGVYLFxuICAgICAgICBzY2FsZVksXG4gICAgICAgIC1maWdtYVJvdGF0aW9uLFxuICAgICk7XG4gICAgbm9kZS5zZXRQb3NpdGlvbihuZXcgVmVjMyhjZW50ZXJMb2NhbC54IC0gb2Zmc2V0LngsIGNlbnRlckxvY2FsLnkgLSBvZmZzZXQueSwgMCkpO1xuICAgIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBhcHBseVBhdGNoVHJhbnNmb3JtKFxuICAgIG5vZGU6IGFueSxcbiAgICB1aTogYW55LFxuICAgIGZpZ21hTm9kZTogYW55LFxuICAgIGNhbnZhczogYW55LFxuICAgIFZlYzM6IGFueSxcbiAgICByZXNldEFuY2hvclBpdm90OiBib29sZWFuLFxuICAgIFVJVHJhbnNmb3JtPzogYW55LFxuICAgIGZpbmQ/OiBhbnlcbik6IHZvaWQge1xuICAgIGlmICghbm9kZSB8fCAhdWkgfHwgIWZpZ21hTm9kZSB8fCAhY2FudmFzIHx8ICFWZWMzKSByZXR1cm47XG4gICAgY29uc3QgdyA9IE1hdGgubWF4KDAsIE51bWJlcihmaWdtYU5vZGUud2lkdGgpIHx8IDApO1xuICAgIGNvbnN0IGggPSBNYXRoLm1heCgwLCBOdW1iZXIoZmlnbWFOb2RlLmhlaWdodCkgfHwgMCk7XG4gICAgY29uc3QgY3VycmVudEFuY2hvciA9IHJlYWRVaUFuY2hvcih1aSk7XG4gICAgY29uc3QgaXNUZXh0ID0gU3RyaW5nKGZpZ21hTm9kZS50eXBlIHx8ICcnKS50b1VwcGVyQ2FzZSgpID09PSAnVEVYVCc7XG4gICAgY29uc3QgYW5jaG9yWCA9IHJlc2V0QW5jaG9yUGl2b3RcbiAgICAgICAgPyAoaXNUZXh0ID8gdGV4dEFuY2hvclhGb3JBbGlnbihmaWdtYU5vZGUudGV4dEFsaWduSG9yaXpvbnRhbCkgOiAwLjUpXG4gICAgICAgIDogY3VycmVudEFuY2hvci54O1xuICAgIGNvbnN0IGFuY2hvclkgPSByZXNldEFuY2hvclBpdm90ID8gMC41IDogY3VycmVudEFuY2hvci55O1xuICAgIGNvbnN0IHNjYWxlWCA9IHR5cGVvZiBmaWdtYU5vZGUuc2NhbGVYID09PSAnbnVtYmVyJyA/IGZpZ21hTm9kZS5zY2FsZVggOiAxO1xuICAgIGNvbnN0IHNjYWxlWSA9IHR5cGVvZiBmaWdtYU5vZGUuc2NhbGVZID09PSAnbnVtYmVyJyA/IGZpZ21hTm9kZS5zY2FsZVkgOiAxO1xuICAgIGNvbnN0IGZpZ21hUm90YXRpb24gPSBOdW1iZXIoZmlnbWFOb2RlLnJvdGF0aW9uKSB8fCAwO1xuICAgIHVpLnNldENvbnRlbnRTaXplKHcsIGgpO1xuICAgIGlmIChyZXNldEFuY2hvclBpdm90ICYmIHVpLnNldEFuY2hvclBvaW50KSB1aS5zZXRBbmNob3JQb2ludChhbmNob3JYLCBhbmNob3JZKTtcbiAgICBpZiAoIXBsYWNlQXRDYW52YXNBYnNvbHV0ZShcbiAgICAgICAgbm9kZSxcbiAgICAgICAgZmlnbWFOb2RlLFxuICAgICAgICBjYW52YXMsXG4gICAgICAgIFZlYzMsXG4gICAgICAgIFVJVHJhbnNmb3JtLFxuICAgICAgICBmaW5kLFxuICAgICAgICBhbmNob3JYLFxuICAgICAgICBhbmNob3JZLFxuICAgICAgICBzY2FsZVgsXG4gICAgICAgIHNjYWxlWSxcbiAgICAgICAgZmlnbWFSb3RhdGlvbixcbiAgICApKSB7XG4gICAgICAgIGNvbnN0IGNhbnZhc1cgPSBOdW1iZXIoY2FudmFzLndpZHRoKSB8fCB3O1xuICAgICAgICBjb25zdCBjYW52YXNIID0gTnVtYmVyKGNhbnZhcy5oZWlnaHQpIHx8IGg7XG4gICAgICAgIGNvbnN0IHBvcyA9IHBvc2l0aW9uRm9yVHJhbnNmb3JtZWRBbmNob3IoXG4gICAgICAgICAgICBOdW1iZXIoZmlnbWFOb2RlLngpIHx8IDAsXG4gICAgICAgICAgICBOdW1iZXIoZmlnbWFOb2RlLnkpIHx8IDAsXG4gICAgICAgICAgICB3LFxuICAgICAgICAgICAgaCxcbiAgICAgICAgICAgIGNhbnZhc1csXG4gICAgICAgICAgICBjYW52YXNILFxuICAgICAgICAgICAgYW5jaG9yWCxcbiAgICAgICAgICAgIGFuY2hvclksXG4gICAgICAgICAgICBzY2FsZVgsXG4gICAgICAgICAgICBzY2FsZVksXG4gICAgICAgICAgICBmaWdtYVJvdGF0aW9uLFxuICAgICAgICApO1xuICAgICAgICBub2RlLnNldFBvc2l0aW9uKG5ldyBWZWMzKHBvcy54LCBwb3MueSwgMCkpO1xuICAgIH1cbiAgICBub2RlLmFuZ2xlID0gLWZpZ21hUm90YXRpb247XG4gICAgbm9kZS5zZXRTY2FsZShuZXcgVmVjMyhzY2FsZVgsIHNjYWxlWSwgMSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlBdXRob3JlZExldHRlclNwYWNpbmcobGFiZWw6IGFueSwgZmlnbWFOb2RlOiBhbnkpOiB2b2lkIHtcbiAgICBpZiAobGFiZWwgJiYgZmlnbWFOb2RlICYmIHR5cGVvZiBmaWdtYU5vZGUubGV0dGVyU3BhY2luZyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgbGFiZWwuc3BhY2luZ1ggPSBmaWdtYU5vZGUubGV0dGVyU3BhY2luZztcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5UGF0Y2hUZXh0Q29tbW9uKGxhYmVsOiBhbnksIGZpZ21hTm9kZTogYW55LCBMYWJlbDogYW55LCBpc1JpY2g6IGJvb2xlYW4sIENvbG9yOiBhbnksIFZlYzI6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghbGFiZWwgfHwgIWZpZ21hTm9kZSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGNoYXJhY3RlcnMgPSB0eXBlb2YgZmlnbWFOb2RlLmNoYXJhY3RlcnMgPT09ICdzdHJpbmcnID8gZmlnbWFOb2RlLmNoYXJhY3RlcnMgOiAnJztcbiAgICBsYWJlbC5zdHJpbmcgPSBpc1JpY2hcbiAgICAgICAgPyBidWlsZFJpY2hUZXh0U3RyaW5nKGNoYXJhY3RlcnMsIGZpZ21hTm9kZSlcbiAgICAgICAgOiBhcHBseVRleHRDYXNlKGNoYXJhY3RlcnMsIGZpZ21hTm9kZS50ZXh0Q2FzZSk7XG4gICAgaWYgKGZpZ21hTm9kZS5mb250U2l6ZSkgbGFiZWwuZm9udFNpemUgPSBmaWdtYU5vZGUuZm9udFNpemU7XG4gICAgbGFiZWwubGluZUhlaWdodCA9IGZpZ21hTm9kZS5saW5lSGVpZ2h0ID4gMCA/IGZpZ21hTm9kZS5saW5lSGVpZ2h0IDogKGZpZ21hTm9kZS5mb250U2l6ZSB8fCBsYWJlbC5mb250U2l6ZSk7XG4gICAgbGFiZWwuaG9yaXpvbnRhbEFsaWduID0gbWFwSEFsaWduKExhYmVsLCBmaWdtYU5vZGUudGV4dEFsaWduSG9yaXpvbnRhbCk7XG4gICAgbGFiZWwudmVydGljYWxBbGlnbiA9IG1hcFZBbGlnbihMYWJlbCwgZmlnbWFOb2RlLnRleHRBbGlnblZlcnRpY2FsKTtcbiAgICBpZiAoaXNSaWNoKSB7XG4gICAgICAgIGxhYmVsLm1heFdpZHRoID0gU3RyaW5nKGZpZ21hTm9kZS50ZXh0QXV0b1Jlc2l6ZSB8fCAnJykgPT09ICdXSURUSF9BTkRfSEVJR0hUJyA/IDAgOiAoZmlnbWFOb2RlLndpZHRoIHx8IDApO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGFwcGx5VGV4dFNpemluZyhMYWJlbCwgbGFiZWwsIGZpZ21hTm9kZSk7XG4gICAgICAgIGFwcGx5Rm9udFN0eWxlKGxhYmVsLCBmaWdtYU5vZGUpO1xuICAgICAgICBhcHBseVRleHREZWNvcmF0aW9uKGxhYmVsLCBmaWdtYU5vZGUpO1xuICAgICAgICBhcHBseUF1dGhvcmVkTGV0dGVyU3BhY2luZyhsYWJlbCwgZmlnbWFOb2RlKTtcbiAgICB9XG4gICAgaWYgKGZpZ21hTm9kZS5jb2xvcikge1xuICAgICAgICBjb25zdCBjID0gZmlnbWFOb2RlLmNvbG9yO1xuICAgICAgICBpZiAoaXNSaWNoKSBsYWJlbC5mb250Q29sb3IgPSBuZXcgQ29sb3IoYy5yLCBjLmcsIGMuYiwgYy5hKTtcbiAgICAgICAgZWxzZSBsYWJlbC5jb2xvciA9IG5ldyBDb2xvcihjLnIsIGMuZywgYy5iLCBjLmEpO1xuICAgIH1cbiAgICBpZiAoIWlzUmljaCkge1xuICAgICAgICBsYWJlbC5lbmFibGVPdXRsaW5lID0gISFmaWdtYU5vZGUuc3Ryb2tlO1xuICAgICAgICBpZiAoZmlnbWFOb2RlLnN0cm9rZSkge1xuICAgICAgICAgICAgY29uc3Qgc3QgPSBmaWdtYU5vZGUuc3Ryb2tlO1xuICAgICAgICAgICAgbGFiZWwub3V0bGluZUNvbG9yID0gbmV3IENvbG9yKHN0LmNvbG9yLnIsIHN0LmNvbG9yLmcsIHN0LmNvbG9yLmIsIHN0LmNvbG9yLmEpO1xuICAgICAgICAgICAgbGFiZWwub3V0bGluZVdpZHRoID0gc3Qud2lkdGggfHwgMTtcbiAgICAgICAgfVxuICAgICAgICBsYWJlbC5lbmFibGVTaGFkb3cgPSAhIWZpZ21hTm9kZS5zaGFkb3c7XG4gICAgICAgIGlmIChmaWdtYU5vZGUuc2hhZG93KSB7XG4gICAgICAgICAgICBjb25zdCBzaCA9IGZpZ21hTm9kZS5zaGFkb3c7XG4gICAgICAgICAgICBsYWJlbC5zaGFkb3dDb2xvciA9IG5ldyBDb2xvcihzaC5jb2xvci5yLCBzaC5jb2xvci5nLCBzaC5jb2xvci5iLCBzaC5jb2xvci5hKTtcbiAgICAgICAgICAgIGxhYmVsLnNoYWRvd09mZnNldCA9IG5ldyBWZWMyKHNoLm9mZnNldFggfHwgMCwgLShzaC5vZmZzZXRZIHx8IDApKTtcbiAgICAgICAgICAgIGxhYmVsLnNoYWRvd0JsdXIgPSBzaC5ibHVyIHx8IDA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGFwcGx5UGF0Y2hGb250KGxhYmVsOiBhbnksIGZpZ21hTm9kZTogYW55LCBhc3NldE1hbmFnZXI6IGFueSwgRm9udDogYW55LCByaWNoOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKCFsYWJlbCB8fCAhZmlnbWFOb2RlIHx8ICFmaWdtYU5vZGUuZm9udFV1aWQpIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBmb250ID0gYXdhaXQgbG9hZEFzc2V0QW55KGFzc2V0TWFuYWdlciwgZmlnbWFOb2RlLmZvbnRVdWlkKTtcbiAgICBpZiAoZm9udCAmJiAoIUZvbnQgfHwgZm9udCBpbnN0YW5jZW9mIEZvbnQpKSB7XG4gICAgICAgIGxhYmVsLmZvbnQgPSBmb250O1xuICAgICAgICBsYWJlbC51c2VTeXN0ZW1Gb250ID0gZmFsc2U7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoIXJpY2gpIGxhYmVsLmlzQm9sZCA9IHdhbnRzQm9sZChTdHJpbmcoZmlnbWFOb2RlLmZvbnRXZWlnaHQgfHwgJycpKTtcbiAgICBsYWJlbC51c2VTeXN0ZW1Gb250ID0gdHJ1ZTtcbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbmludGVyZmFjZSBQcmVwYXJlZFRleHRQYXRjaFRhcmdldCB7XG4gICAgY29tcG9uZW50OiBhbnkgfCBudWxsO1xuICAgIGlzUmljaDogYm9vbGVhbjtcbiAgICByZW5kZXJlck5vZGU6IGFueSB8IG51bGw7XG4gICAgbGFiZWw6IGFueSB8IG51bGw7XG4gICAgY3JlYXRlZFJlbmRlcmVyOiBib29sZWFuO1xuICAgIGNvbnZlcnRlZExhYmVsOiBib29sZWFuO1xuICAgIHdhcm5pbmc6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gY29weUxhYmVsRm9udEJhc2VsaW5lVG9SaWNoVGV4dChsYWJlbDogYW55LCByaWNoVGV4dDogYW55KTogdm9pZCB7XG4gICAgaWYgKCFsYWJlbCB8fCAhcmljaFRleHQpIHJldHVybjtcbiAgICBpZiAobGFiZWwuZm9udCkge1xuICAgICAgICByaWNoVGV4dC5mb250ID0gbGFiZWwuZm9udDtcbiAgICAgICAgcmljaFRleHQudXNlU3lzdGVtRm9udCA9IGZhbHNlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJpY2hUZXh0LnVzZVN5c3RlbUZvbnQgPSAhIWxhYmVsLnVzZVN5c3RlbUZvbnQ7XG4gICAgICAgIGlmIChsYWJlbC5mb250RmFtaWx5KSByaWNoVGV4dC5mb250RmFtaWx5ID0gbGFiZWwuZm9udEZhbWlseTtcbiAgICB9XG4gICAgaWYgKGxhYmVsLmNvbG9yKSB7XG4gICAgICAgIHJpY2hUZXh0LmZvbnRDb2xvciA9IHR5cGVvZiBsYWJlbC5jb2xvci5jbG9uZSA9PT0gJ2Z1bmN0aW9uJyA/IGxhYmVsLmNvbG9yLmNsb25lKCkgOiBsYWJlbC5jb2xvcjtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBsYWJlbC5jYWNoZU1vZGUgIT09ICd1bmRlZmluZWQnKSByaWNoVGV4dC5jYWNoZU1vZGUgPSBsYWJlbC5jYWNoZU1vZGU7XG59XG5cbi8qKlxuICogQHpoIOS4uiBSZXNvdXJjZVJlcGxhY2Ug6Kej5p6Q5pys5qyh5paH5a2X5om/6L2957uE5Lu244CC5re35ZCI5qC35byP5ZG95Lit5pmu6YCaIExhYmVsIOaXtu+8jFxuICogICAgIOWPquWHhuWkhyBhdXRob3JlZCDlrZAgcmVuZGVyZXLvvJvmiJDlip/lupTnlKjlkI7miY3nlLHosIPnlKjogIXlhbPpl60gTGFiZWwg5bm25r+A5rS7IHJlbmRlcmVy44CCXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVwYXJlVGV4dFBhdGNoVGFyZ2V0KHRhcmdldDogYW55LCBmaWdtYU5vZGU6IGFueSwgY2M6IGFueSk6IFByZXBhcmVkVGV4dFBhdGNoVGFyZ2V0IHtcbiAgICBjb25zdCB7IExhYmVsLCBSaWNoVGV4dCwgVUlUcmFuc2Zvcm0gfSA9IGNjIHx8IHt9O1xuICAgIGNvbnN0IGxvZ2ljYWwgPSByZXNvbHZlTG9naWNhbFRleHRUYXJnZXQodGFyZ2V0LCBMYWJlbCwgUmljaFRleHQpO1xuICAgIGlmICghbG9naWNhbCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29tcG9uZW50OiBudWxsLFxuICAgICAgICAgICAgaXNSaWNoOiBmYWxzZSxcbiAgICAgICAgICAgIHJlbmRlcmVyTm9kZTogbnVsbCxcbiAgICAgICAgICAgIGxhYmVsOiBudWxsLFxuICAgICAgICAgICAgY3JlYXRlZFJlbmRlcmVyOiBmYWxzZSxcbiAgICAgICAgICAgIGNvbnZlcnRlZExhYmVsOiBmYWxzZSxcbiAgICAgICAgICAgIHdhcm5pbmc6IGDnm67moIfoioLngrnjgIwke3RhcmdldCAmJiAodGFyZ2V0Lm5hbWUgfHwgdGFyZ2V0LnV1aWQpIHx8ICcnfeOAjeayoeaciSBMYWJlbC9SaWNoVGV4dCDnu4Tku7bvvIzot7Pov4fmloflrZfjgIJgLFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHdhbnRzUmljaFRleHQgPSBoYXNNaXhlZFRleHRTZWdtZW50cyhmaWdtYU5vZGUpO1xuICAgIGlmICghd2FudHNSaWNoVGV4dCB8fCBsb2dpY2FsLmtpbmQgPT09ICdyaWNoVGV4dCcpIHtcbiAgICAgICAgaWYgKGxvZ2ljYWwua2luZCA9PT0gJ3JpY2hUZXh0Jykge1xuICAgICAgICAgICAgbG9naWNhbC5jb21wb25lbnQuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGxvZ2ljYWwucmVuZGVyZXJOb2RlKSBsb2dpY2FsLnJlbmRlcmVyTm9kZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29tcG9uZW50OiBsb2dpY2FsLmNvbXBvbmVudCxcbiAgICAgICAgICAgIGlzUmljaDogbG9naWNhbC5raW5kID09PSAncmljaFRleHQnLFxuICAgICAgICAgICAgcmVuZGVyZXJOb2RlOiBsb2dpY2FsLnJlbmRlcmVyTm9kZSxcbiAgICAgICAgICAgIGxhYmVsOiBsb2dpY2FsLmtpbmQgPT09ICdsYWJlbCcgPyBsb2dpY2FsLmNvbXBvbmVudCA6IG51bGwsXG4gICAgICAgICAgICBjcmVhdGVkUmVuZGVyZXI6IGZhbHNlLFxuICAgICAgICAgICAgY29udmVydGVkTGFiZWw6IGZhbHNlLFxuICAgICAgICAgICAgd2FybmluZzogJycsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCFjYyB8fCAhUmljaFRleHQgfHwgIVVJVHJhbnNmb3JtIHx8ICFjYy5Ob2RlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb21wb25lbnQ6IG51bGwsXG4gICAgICAgICAgICBpc1JpY2g6IGZhbHNlLFxuICAgICAgICAgICAgcmVuZGVyZXJOb2RlOiBudWxsLFxuICAgICAgICAgICAgbGFiZWw6IGxvZ2ljYWwuY29tcG9uZW50LFxuICAgICAgICAgICAgY3JlYXRlZFJlbmRlcmVyOiBmYWxzZSxcbiAgICAgICAgICAgIGNvbnZlcnRlZExhYmVsOiBmYWxzZSxcbiAgICAgICAgICAgIHdhcm5pbmc6IGDnm67moIfoioLngrnjgIwke3RhcmdldC5uYW1lIHx8IHRhcmdldC51dWlkfeOAjeW9k+WJjei/kOihjOaXtuS4jeaUr+aMgSBSaWNoVGV4dO+8jOa3t+WQiOagt+W8j+aWh+Wtl+acquW6lOeUqOOAgmAsXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgdWkgPSB0YXJnZXQuZ2V0Q29tcG9uZW50ID8gdGFyZ2V0LmdldENvbXBvbmVudChVSVRyYW5zZm9ybSkgOiBudWxsO1xuICAgIGlmICghdWkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvbXBvbmVudDogbnVsbCxcbiAgICAgICAgICAgIGlzUmljaDogZmFsc2UsXG4gICAgICAgICAgICByZW5kZXJlck5vZGU6IG51bGwsXG4gICAgICAgICAgICBsYWJlbDogbG9naWNhbC5jb21wb25lbnQsXG4gICAgICAgICAgICBjcmVhdGVkUmVuZGVyZXI6IGZhbHNlLFxuICAgICAgICAgICAgY29udmVydGVkTGFiZWw6IGZhbHNlLFxuICAgICAgICAgICAgd2FybmluZzogYOebruagh+iKgueCueOAjCR7dGFyZ2V0Lm5hbWUgfHwgdGFyZ2V0LnV1aWR944CN5rKh5pyJIFVJVHJhbnNmb3Jt77yM5peg5rOV5om/6L295re35ZCI5qC35byP5paH5a2X44CCYCxcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgICBjb25zdCBzaXplID0gcmVhZFVpU2l6ZSh1aSk7XG4gICAgICAgIGNvbnN0IG1vdW50ZWQgPSBtb3VudEZ0b2NSaWNoVGV4dFJlbmRlcmVyKHRhcmdldCwgZmlnbWFOb2RlLCBzaXplLndpZHRoLCBzaXplLmhlaWdodCwgY2MpO1xuICAgICAgICBtb3VudGVkLm5vZGUuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIG1vdW50ZWQucmljaFRleHQuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICBjb3B5TGFiZWxGb250QmFzZWxpbmVUb1JpY2hUZXh0KGxvZ2ljYWwuY29tcG9uZW50LCBtb3VudGVkLnJpY2hUZXh0KTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvbXBvbmVudDogbW91bnRlZC5yaWNoVGV4dCxcbiAgICAgICAgICAgIGlzUmljaDogdHJ1ZSxcbiAgICAgICAgICAgIHJlbmRlcmVyTm9kZTogbW91bnRlZC5ub2RlLFxuICAgICAgICAgICAgbGFiZWw6IGxvZ2ljYWwuY29tcG9uZW50LFxuICAgICAgICAgICAgY3JlYXRlZFJlbmRlcmVyOiBtb3VudGVkLmNyZWF0ZWQsXG4gICAgICAgICAgICBjb252ZXJ0ZWRMYWJlbDogdHJ1ZSxcbiAgICAgICAgICAgIHdhcm5pbmc6ICcnLFxuICAgICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvbXBvbmVudDogbnVsbCxcbiAgICAgICAgICAgIGlzUmljaDogZmFsc2UsXG4gICAgICAgICAgICByZW5kZXJlck5vZGU6IG51bGwsXG4gICAgICAgICAgICBsYWJlbDogbG9naWNhbC5jb21wb25lbnQsXG4gICAgICAgICAgICBjcmVhdGVkUmVuZGVyZXI6IGZhbHNlLFxuICAgICAgICAgICAgY29udmVydGVkTGFiZWw6IGZhbHNlLFxuICAgICAgICAgICAgd2FybmluZzogYOebruagh+iKgueCueOAjCR7dGFyZ2V0Lm5hbWUgfHwgdGFyZ2V0LnV1aWR944CN5Yib5bu6IFJpY2hUZXh0IHJlbmRlcmVyIOWksei0pe+8miR7ZXJyb3IgJiYgZXJyb3IubWVzc2FnZSB8fCBlcnJvcn1gLFxuICAgICAgICB9O1xuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gYXBwbHlQYXRjaFJpY2hUZXh0Rm9udCh0YXJnZXQ6IGFueSwgZmlnbWFOb2RlOiBhbnksIGNjOiBhbnkpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCB7IExhYmVsLCBGb250LCBpbnN0YW50aWF0ZSB9ID0gY2M7XG4gICAgY29uc3QgdGVtcGxhdGUgPSBmaWdtYU5vZGUgJiYgZmlnbWFOb2RlLnRleHRTdHlsZVRlbXBsYXRlO1xuICAgIGNvbnN0IHRlbXBsYXRlUGF0aCA9IHJlc29sdmVUZXh0U3R5bGVUZW1wbGF0ZVBhdGgodGVtcGxhdGUpO1xuICAgIGNvbnN0IGZvbnRSZWYgPSByZXNvbHZlUmljaFRleHRGb250UmVmZXJlbmNlKGZpZ21hTm9kZSwgdGVtcGxhdGUpO1xuICAgIGxldCB0ZW1wbGF0ZVJvb3Q6IGFueSA9IG51bGw7XG4gICAgbGV0IHRlbXBsYXRlTGFiZWw6IGFueSA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHRlbXBsYXRlICYmIHRlbXBsYXRlLnByZWZhYlV1aWQgJiYgdGVtcGxhdGVQYXRoICYmIHR5cGVvZiBpbnN0YW50aWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWIgPSBhd2FpdCBsb2FkQXNzZXRBbnkoY2MuYXNzZXRNYW5hZ2VyLCBTdHJpbmcodGVtcGxhdGUucHJlZmFiVXVpZCkpO1xuICAgICAgICAgICAgICAgIGlmIChwcmVmYWIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGVSb290ID0gaW5zdGFudGlhdGUocHJlZmFiKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVOb2RlID0gZ2V0Tm9kZUJ5UGF0aCh0ZW1wbGF0ZVJvb3QsIHRlbXBsYXRlUGF0aCk7XG4gICAgICAgICAgICAgICAgICAgIHRlbXBsYXRlTGFiZWwgPSB0ZW1wbGF0ZU5vZGUgJiYgdGVtcGxhdGVOb2RlLmdldENvbXBvbmVudCAmJiBMYWJlbFxuICAgICAgICAgICAgICAgICAgICAgICAgPyB0ZW1wbGF0ZU5vZGUuZ2V0Q29tcG9uZW50KExhYmVsKVxuICAgICAgICAgICAgICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgICAgICAgICdbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIFJlc291cmNlUmVwbGFjZSDmloflrZfmqKHmnb/liqDovb3lpLHotKXvvIzmlLnnlKggcmVzb2x2ZXIg5a2X5L2TOicsXG4gICAgICAgICAgICAgICAgICAgIGVycm9yICYmIGVycm9yLm1lc3NhZ2UgfHwgZXJyb3IsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzb3VyY2UgPSBhd2FpdCBhcHBseVJpY2hUZXh0Rm9udChcbiAgICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgICAgIHRlbXBsYXRlTGFiZWwsXG4gICAgICAgICAgICBmb250UmVmLnV1aWQsXG4gICAgICAgICAgICAodXVpZCkgPT4gbG9hZEFzc2V0QW55KGNjLmFzc2V0TWFuYWdlciwgdXVpZCksXG4gICAgICAgICAgICBGb250LFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gc291cmNlICE9PSAnbWlzc2luZyc7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgICAgaWYgKHRlbXBsYXRlUm9vdCAmJiB0eXBlb2YgdGVtcGxhdGVSb290LmRlc3Ryb3kgPT09ICdmdW5jdGlvbicpIHRlbXBsYXRlUm9vdC5kZXN0cm95KCk7XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBhcHBseVBhdGNoU3ByaXRlKHNwcml0ZTogYW55LCBmaWdtYU5vZGU6IGFueSwgZGF0YTogYW55LCBjYzogYW55LCBwcmVzZXJ2ZUFscGhhOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKCFzcHJpdGUgfHwgIWZpZ21hTm9kZSB8fCAhZGF0YSkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHsgYXNzZXRNYW5hZ2VyLCBTcHJpdGUsIFJlY3QsIFNpemUsIFZlYzIsIENvbG9yIH0gPSBjYztcbiAgICBjb25zdCBpbWdSZWYgPSBmaWdtYU5vZGUuaW1hZ2VSZWY7XG4gICAgY29uc3QgdXVpZCA9IGltZ1JlZiAmJiBkYXRhLmlkVG9TcHJpdGVGcmFtZSAmJiBkYXRhLmlkVG9TcHJpdGVGcmFtZVtpbWdSZWZdO1xuICAgIGlmICghdXVpZCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IG9sZEFscGhhID0gc3ByaXRlLmNvbG9yICYmIHR5cGVvZiBzcHJpdGUuY29sb3IuYSA9PT0gJ251bWJlcicgPyBzcHJpdGUuY29sb3IuYSA6IDI1NTtcbiAgICBjb25zdCBzbGljZTlCb3JkZXIgPSByZWFkU2xpY2U5Qm9yZGVyKGZpZ21hTm9kZSk7XG4gICAgY29uc3Qgc3ByaXRlRnJhbWUgPSBhd2FpdCBsb2FkQXNzZXRBbnkoXG4gICAgICAgIGFzc2V0TWFuYWdlcixcbiAgICAgICAgdXVpZCxcbiAgICAgICAgc2xpY2U5Qm9yZGVyID8gMzAgOiAxLFxuICAgICAgICAxMDAsXG4gICAgICAgIHNsaWNlOUJvcmRlciA/IGlzU3ByaXRlRnJhbWVUZXh0dXJlUmVhZHkgOiB1bmRlZmluZWQsXG4gICAgKTtcbiAgICBpZiAoIXNwcml0ZUZyYW1lKSByZXR1cm4gZmFsc2U7XG4gICAgY29uZmlndXJlU3ByaXRlVHlwZShzcHJpdGUsIGZpZ21hTm9kZSwgc2xpY2U5Qm9yZGVyLCBTcHJpdGUpO1xuICAgIHNwcml0ZS5zaXplTW9kZSA9IFNwcml0ZS5TaXplTW9kZS5DVVNUT007XG4gICAgc3ByaXRlLnRyaW0gPSBmYWxzZTtcbiAgICBpZiAoc2xpY2U5Qm9yZGVyKSB7XG4gICAgICAgIHNwcml0ZS5zcHJpdGVGcmFtZSA9IGFwcGx5U2xpY2U5Qm9yZGVyKHNwcml0ZUZyYW1lLCBzbGljZTlCb3JkZXIsIFJlY3QsIFNpemUsIFZlYzIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGFkYXB0ZWQgPSBhZGFwdEltYWdlRmlsbFNwcml0ZUZyYW1lKFxuICAgICAgICAgICAgc3ByaXRlRnJhbWUsXG4gICAgICAgICAgICBmaWdtYU5vZGUuaW1hZ2VGaWxsLFxuICAgICAgICAgICAgTnVtYmVyKGZpZ21hTm9kZS53aWR0aCkgfHwgMCxcbiAgICAgICAgICAgIE51bWJlcihmaWdtYU5vZGUuaGVpZ2h0KSB8fCAwLFxuICAgICAgICAgICAgUmVjdCxcbiAgICAgICAgICAgIFNpemUsXG4gICAgICAgICAgICBWZWMyXG4gICAgICAgICk7XG4gICAgICAgIHNwcml0ZS5zcHJpdGVGcmFtZSA9IGFkYXB0ZWQuZnJhbWU7XG4gICAgfVxuICAgIGFwcGx5SW1hZ2VDb2xvcihzcHJpdGUsIGZpZ21hTm9kZS5pbWFnZUZpbGwsIGZpZ21hTm9kZS5vdmVybGF5VGludCwgQ29sb3IpO1xuICAgIGlmIChwcmVzZXJ2ZUFscGhhICYmIHNwcml0ZS5jb2xvcikge1xuICAgICAgICBzcHJpdGUuY29sb3IgPSBuZXcgQ29sb3Ioc3ByaXRlLmNvbG9yLnIsIHNwcml0ZS5jb2xvci5nLCBzcHJpdGUuY29sb3IuYiwgb2xkQWxwaGEpO1xuICAgIH1cbiAgICBhcHBseVRpbGVTY2FsaW5nKHNwcml0ZSwgZmlnbWFOb2RlLmltYWdlRmlsbCk7XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHNuYXBzaG90Q29sb3IoYzogYW55KTogYW55IHtcbiAgICBpZiAoIWMpIHJldHVybiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICAgIHI6IGNsYW1wMjU1KGMuciksXG4gICAgICAgIGc6IGNsYW1wMjU1KGMuZyksXG4gICAgICAgIGI6IGNsYW1wMjU1KGMuYiksXG4gICAgICAgIGE6IGNsYW1wMjU1KGMuYSksXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZUNvbG9yKENvbG9yOiBhbnksIGM6IGFueSk6IGFueSB7XG4gICAgaWYgKCFDb2xvciB8fCAhYykgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIG5ldyBDb2xvcihcbiAgICAgICAgY2xhbXAyNTUoYy5yKSxcbiAgICAgICAgY2xhbXAyNTUoYy5nKSxcbiAgICAgICAgY2xhbXAyNTUoYy5iKSxcbiAgICAgICAgY2xhbXAyNTUoYy5hKVxuICAgICk7XG59XG5cbmZ1bmN0aW9uIHNuYXBzaG90VmVjMih2OiBhbnkpOiBhbnkge1xuICAgIGlmICghdikgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgeDogcm91bmRFeHBvcnROdW1iZXIoTnVtYmVyKHYueCkgfHwgMCksXG4gICAgICAgIHk6IHJvdW5kRXhwb3J0TnVtYmVyKE51bWJlcih2LnkpIHx8IDApLFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHNuYXBzaG90VmVjMyh2OiBhbnkpOiBhbnkge1xuICAgIGlmICghdikgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgeDogcm91bmRFeHBvcnROdW1iZXIoTnVtYmVyKHYueCkgfHwgMCksXG4gICAgICAgIHk6IHJvdW5kRXhwb3J0TnVtYmVyKE51bWJlcih2LnkpIHx8IDApLFxuICAgICAgICB6OiByb3VuZEV4cG9ydE51bWJlcihOdW1iZXIodi56KSB8fCAwKSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBtYWtlVmVjMihWZWMyOiBhbnksIHY6IGFueSk6IGFueSB7XG4gICAgaWYgKCFWZWMyIHx8ICF2KSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gbmV3IFZlYzIoTnVtYmVyKHYueCkgfHwgMCwgTnVtYmVyKHYueSkgfHwgMCk7XG59XG5cbmZ1bmN0aW9uIG1ha2VWZWMzKFZlYzM6IGFueSwgdjogYW55LCBmYWxsYmFja1ogPSAwKTogYW55IHtcbiAgICBpZiAoIVZlYzMgfHwgIXYpIHJldHVybiBudWxsO1xuICAgIHJldHVybiBuZXcgVmVjMyhOdW1iZXIodi54KSB8fCAwLCBOdW1iZXIodi55KSB8fCAwLCBOdW1iZXIodi56ID8/IGZhbGxiYWNrWikgfHwgMCk7XG59XG5cbmZ1bmN0aW9uIHJlYWRVaUFuY2hvcih1aTogYW55KTogYW55IHtcbiAgICBpZiAoIXVpKSByZXR1cm4geyB4OiAwLjUsIHk6IDAuNSB9O1xuICAgIGNvbnN0IGFuY2hvciA9IHVpLmFuY2hvclBvaW50IHx8IHVpLl9hbmNob3JQb2ludDtcbiAgICByZXR1cm4ge1xuICAgICAgICB4OiBOdW1iZXIoKGFuY2hvciAmJiBhbmNob3IueCkgPz8gdWkuYW5jaG9yWCA/PyB1aS5fYW5jaG9yWCkgfHwgMCxcbiAgICAgICAgeTogTnVtYmVyKChhbmNob3IgJiYgYW5jaG9yLnkpID8/IHVpLmFuY2hvclkgPz8gdWkuX2FuY2hvclkpIHx8IDAsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gYXNzZXRVdWlkKGFzc2V0OiBhbnkpOiBzdHJpbmcge1xuICAgIHJldHVybiBTdHJpbmcoYXNzZXQgJiYgKGFzc2V0LnV1aWQgfHwgYXNzZXQuX3V1aWQgfHwgYXNzZXQuX2lkKSB8fCAnJyk7XG59XG5cbmZ1bmN0aW9uIHNuYXBzaG90U3ByaXRlRnJhbWUoZnJhbWU6IGFueSk6IGFueSB7XG4gICAgaWYgKCFmcmFtZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcmVjdCA9IHJlYWRTcHJpdGVGcmFtZVJlY3QoZnJhbWUpO1xuICAgIGNvbnN0IG9yaWdpbmFsU2l6ZSA9IGZyYW1lLm9yaWdpbmFsU2l6ZSB8fCBmcmFtZS5fb3JpZ2luYWxTaXplO1xuICAgIGNvbnN0IG9mZnNldCA9IGZyYW1lLm9mZnNldCB8fCBmcmFtZS5fb2Zmc2V0O1xuICAgIHJldHVybiB7XG4gICAgICAgIHV1aWQ6IHNwcml0ZUZyYW1lVXVpZChmcmFtZSksXG4gICAgICAgIG5hbWU6IFN0cmluZyhmcmFtZS5uYW1lIHx8IGZyYW1lLl9uYW1lIHx8ICcnKSxcbiAgICAgICAgcmVjdDogcmVjdCA/IHtcbiAgICAgICAgICAgIHg6IHJvdW5kRXhwb3J0TnVtYmVyKHJlY3QueCksXG4gICAgICAgICAgICB5OiByb3VuZEV4cG9ydE51bWJlcihyZWN0LnkpLFxuICAgICAgICAgICAgd2lkdGg6IHJvdW5kRXhwb3J0TnVtYmVyKHJlY3Qud2lkdGgpLFxuICAgICAgICAgICAgaGVpZ2h0OiByb3VuZEV4cG9ydE51bWJlcihyZWN0LmhlaWdodCksXG4gICAgICAgIH0gOiBudWxsLFxuICAgICAgICBvcmlnaW5hbFNpemU6IG9yaWdpbmFsU2l6ZSA/IHtcbiAgICAgICAgICAgIHdpZHRoOiByb3VuZEV4cG9ydE51bWJlcihOdW1iZXIob3JpZ2luYWxTaXplLndpZHRoKSB8fCAwKSxcbiAgICAgICAgICAgIGhlaWdodDogcm91bmRFeHBvcnROdW1iZXIoTnVtYmVyKG9yaWdpbmFsU2l6ZS5oZWlnaHQpIHx8IDApLFxuICAgICAgICB9IDogbnVsbCxcbiAgICAgICAgb2Zmc2V0OiBzbmFwc2hvdFZlYzIob2Zmc2V0KSxcbiAgICAgICAgaXNSb3RhdGU6ICEhKGZyYW1lLnJvdGF0ZWQgfHwgZnJhbWUuaXNSb3RhdGVkIHx8IGZyYW1lLl9yb3RhdGVkKSxcbiAgICAgICAgaW5zZXRMZWZ0OiBOdW1iZXIoZnJhbWUuaW5zZXRMZWZ0ID8/IGZyYW1lLmJvcmRlckxlZnQgPz8gZnJhbWUuX2luc2V0TGVmdCkgfHwgMCxcbiAgICAgICAgaW5zZXRSaWdodDogTnVtYmVyKGZyYW1lLmluc2V0UmlnaHQgPz8gZnJhbWUuYm9yZGVyUmlnaHQgPz8gZnJhbWUuX2luc2V0UmlnaHQpIHx8IDAsXG4gICAgICAgIGluc2V0VG9wOiBOdW1iZXIoZnJhbWUuaW5zZXRUb3AgPz8gZnJhbWUuYm9yZGVyVG9wID8/IGZyYW1lLl9pbnNldFRvcCkgfHwgMCxcbiAgICAgICAgaW5zZXRCb3R0b206IE51bWJlcihmcmFtZS5pbnNldEJvdHRvbSA/PyBmcmFtZS5ib3JkZXJCb3R0b20gPz8gZnJhbWUuX2luc2V0Qm90dG9tKSB8fCAwLFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlY3REaWZmZXJzKGE6IGFueSwgYjogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFhIHx8ICFiKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIE1hdGguYWJzKChOdW1iZXIoYS54KSB8fCAwKSAtIChOdW1iZXIoYi54KSB8fCAwKSkgPiAwLjAxIHx8XG4gICAgICAgIE1hdGguYWJzKChOdW1iZXIoYS55KSB8fCAwKSAtIChOdW1iZXIoYi55KSB8fCAwKSkgPiAwLjAxIHx8XG4gICAgICAgIE1hdGguYWJzKChOdW1iZXIoYS53aWR0aCkgfHwgMCkgLSAoTnVtYmVyKGIud2lkdGgpIHx8IDApKSA+IDAuMDEgfHxcbiAgICAgICAgTWF0aC5hYnMoKE51bWJlcihhLmhlaWdodCkgfHwgMCkgLSAoTnVtYmVyKGIuaGVpZ2h0KSB8fCAwKSkgPiAwLjAxO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXN0b3JlU3ByaXRlRnJhbWVTbmFwc2hvdChzbmFwc2hvdDogYW55LCBjYzogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAoIXNuYXBzaG90IHx8ICFzbmFwc2hvdC51dWlkKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCB7IGFzc2V0TWFuYWdlciwgUmVjdCwgU2l6ZSwgVmVjMiB9ID0gY2M7XG4gICAgY29uc3QgbG9hZGVkID0gYXdhaXQgbG9hZEFzc2V0QW55KGFzc2V0TWFuYWdlciwgc25hcHNob3QudXVpZCk7XG4gICAgaWYgKCFsb2FkZWQpIHJldHVybiBudWxsO1xuXG4gICAgbGV0IGZyYW1lID0gbG9hZGVkO1xuICAgIGNvbnN0IHRhcmdldFJlY3QgPSBzbmFwc2hvdC5yZWN0O1xuICAgIGNvbnN0IGxvYWRlZFJlY3QgPSByZWFkU3ByaXRlRnJhbWVSZWN0KGxvYWRlZCk7XG4gICAgY29uc3QgbmVlZHNSZWN0UmVzdG9yZSA9IHRhcmdldFJlY3QgJiYgbG9hZGVkUmVjdCAmJiByZWN0RGlmZmVycyh0YXJnZXRSZWN0LCBsb2FkZWRSZWN0KTtcbiAgICBpZiAobmVlZHNSZWN0UmVzdG9yZSAmJiB0eXBlb2YgbG9hZGVkLmNsb25lID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGZyYW1lID0gbG9hZGVkLmNsb25lKCk7XG4gICAgfVxuICAgIGlmIChuZWVkc1JlY3RSZXN0b3JlICYmIGZyYW1lICYmIHR5cGVvZiBmcmFtZS5yZXNldCA9PT0gJ2Z1bmN0aW9uJyAmJiBmcmFtZS50ZXh0dXJlICYmIFJlY3QgJiYgU2l6ZSAmJiBWZWMyKSB7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsU2l6ZSA9IHNuYXBzaG90Lm9yaWdpbmFsU2l6ZSB8fCB0YXJnZXRSZWN0O1xuICAgICAgICBmcmFtZS5yZXNldCh7XG4gICAgICAgICAgICB0ZXh0dXJlOiBmcmFtZS50ZXh0dXJlLFxuICAgICAgICAgICAgcmVjdDogbmV3IFJlY3QoXG4gICAgICAgICAgICAgICAgTnVtYmVyKHRhcmdldFJlY3QueCkgfHwgMCxcbiAgICAgICAgICAgICAgICBOdW1iZXIodGFyZ2V0UmVjdC55KSB8fCAwLFxuICAgICAgICAgICAgICAgIE51bWJlcih0YXJnZXRSZWN0LndpZHRoKSB8fCAwLFxuICAgICAgICAgICAgICAgIE51bWJlcih0YXJnZXRSZWN0LmhlaWdodCkgfHwgMFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIG9yaWdpbmFsU2l6ZTogbmV3IFNpemUoXG4gICAgICAgICAgICAgICAgTnVtYmVyKG9yaWdpbmFsU2l6ZS53aWR0aCkgfHwgTnVtYmVyKHRhcmdldFJlY3Qud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICAgICAgTnVtYmVyKG9yaWdpbmFsU2l6ZS5oZWlnaHQpIHx8IE51bWJlcih0YXJnZXRSZWN0LmhlaWdodCkgfHwgMFxuICAgICAgICAgICAgKSxcbiAgICAgICAgICAgIG9mZnNldDogbWFrZVZlYzIoVmVjMiwgc25hcHNob3Qub2Zmc2V0KSB8fCBuZXcgVmVjMigwLCAwKSxcbiAgICAgICAgICAgIGlzUm90YXRlOiAhIXNuYXBzaG90LmlzUm90YXRlLFxuICAgICAgICB9LCB0cnVlKTtcbiAgICB9XG4gICAgaWYgKGZyYW1lKSB7XG4gICAgICAgIGZyYW1lLmluc2V0TGVmdCA9IE51bWJlcihzbmFwc2hvdC5pbnNldExlZnQpIHx8IDA7XG4gICAgICAgIGZyYW1lLmluc2V0UmlnaHQgPSBOdW1iZXIoc25hcHNob3QuaW5zZXRSaWdodCkgfHwgMDtcbiAgICAgICAgZnJhbWUuaW5zZXRUb3AgPSBOdW1iZXIoc25hcHNob3QuaW5zZXRUb3ApIHx8IDA7XG4gICAgICAgIGZyYW1lLmluc2V0Qm90dG9tID0gTnVtYmVyKHNuYXBzaG90Lmluc2V0Qm90dG9tKSB8fCAwO1xuICAgIH1cbiAgICByZXR1cm4gZnJhbWU7XG59XG5cbmZ1bmN0aW9uIHNuYXBzaG90UmljaFRleHRDb21wb25lbnQocmljaFRleHQ6IGFueSk6IGFueSB7XG4gICAgaWYgKCFyaWNoVGV4dCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogcmljaFRleHQuZW5hYmxlZCAhPT0gZmFsc2UgJiYgcmljaFRleHQuX2VuYWJsZWQgIT09IGZhbHNlLFxuICAgICAgICBzdHJpbmc6IFN0cmluZyhyaWNoVGV4dC5zdHJpbmcgfHwgJycpLFxuICAgICAgICBmb250U2l6ZTogTnVtYmVyKHJpY2hUZXh0LmZvbnRTaXplKSB8fCAwLFxuICAgICAgICBsaW5lSGVpZ2h0OiBOdW1iZXIocmljaFRleHQubGluZUhlaWdodCkgfHwgMCxcbiAgICAgICAgaG9yaXpvbnRhbEFsaWduOiByaWNoVGV4dC5ob3Jpem9udGFsQWxpZ24sXG4gICAgICAgIHZlcnRpY2FsQWxpZ246IHJpY2hUZXh0LnZlcnRpY2FsQWxpZ24sXG4gICAgICAgIG1heFdpZHRoOiBOdW1iZXIocmljaFRleHQubWF4V2lkdGgpIHx8IDAsXG4gICAgICAgIGZvbnRVdWlkOiBhc3NldFV1aWQocmljaFRleHQuZm9udCksXG4gICAgICAgIHVzZVN5c3RlbUZvbnQ6ICEhcmljaFRleHQudXNlU3lzdGVtRm9udCxcbiAgICAgICAgZm9udEZhbWlseTogU3RyaW5nKHJpY2hUZXh0LmZvbnRGYW1pbHkgfHwgJycpLFxuICAgICAgICBjYWNoZU1vZGU6IHJpY2hUZXh0LmNhY2hlTW9kZSxcbiAgICAgICAgaGFuZGxlVG91Y2hFdmVudDogcmljaFRleHQuaGFuZGxlVG91Y2hFdmVudCxcbiAgICAgICAgY29sb3I6IHNuYXBzaG90Q29sb3IocmljaFRleHQuZm9udENvbG9yIHx8IHJpY2hUZXh0LmNvbG9yKSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBzbmFwc2hvdFJpY2hUZXh0UmVuZGVyZXIocmVuZGVyZXI6IGFueSwgY2M6IGFueSk6IGFueSB7XG4gICAgaWYgKCFyZW5kZXJlcikgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgeyBVSVRyYW5zZm9ybSwgUmljaFRleHQgfSA9IGNjO1xuICAgIGNvbnN0IHVpID0gVUlUcmFuc2Zvcm0gJiYgcmVuZGVyZXIuZ2V0Q29tcG9uZW50ID8gcmVuZGVyZXIuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKSA6IG51bGw7XG4gICAgY29uc3QgcmljaFRleHQgPSBSaWNoVGV4dCAmJiByZW5kZXJlci5nZXRDb21wb25lbnQgPyByZW5kZXJlci5nZXRDb21wb25lbnQoUmljaFRleHQpIDogbnVsbDtcbiAgICBjb25zdCBzaXplID0gcmVhZFVpU2l6ZSh1aSk7XG4gICAgY29uc3QgcG9zaXRpb24gPSByZWFkTm9kZVBvc2l0aW9uKHJlbmRlcmVyKTtcbiAgICBjb25zdCBzY2FsZSA9IHJlYWROb2RlU2NhbGUocmVuZGVyZXIpO1xuICAgIHJldHVybiB7XG4gICAgICAgIGFjdGl2ZTogcmVuZGVyZXIuYWN0aXZlICE9PSBmYWxzZSxcbiAgICAgICAgbGF5ZXI6IHR5cGVvZiByZW5kZXJlci5sYXllciA9PT0gJ251bWJlcicgPyByZW5kZXJlci5sYXllciA6IHVuZGVmaW5lZCxcbiAgICAgICAgc2libGluZ0luZGV4OiB0eXBlb2YgcmVuZGVyZXIuZ2V0U2libGluZ0luZGV4ID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICA/IHJlbmRlcmVyLmdldFNpYmxpbmdJbmRleCgpXG4gICAgICAgICAgICA6IHJlbmRlcmVyLnBhcmVudCAmJiByZW5kZXJlci5wYXJlbnQuY2hpbGRyZW4gPyByZW5kZXJlci5wYXJlbnQuY2hpbGRyZW4uaW5kZXhPZihyZW5kZXJlcikgOiAtMSxcbiAgICAgICAgdHJhbnNmb3JtOiB7XG4gICAgICAgICAgICBwb3NpdGlvbjogeyB4OiByb3VuZEV4cG9ydE51bWJlcihwb3NpdGlvbi54KSwgeTogcm91bmRFeHBvcnROdW1iZXIocG9zaXRpb24ueSksIHo6IDAgfSxcbiAgICAgICAgICAgIHNjYWxlOiB7IHg6IHJvdW5kRXhwb3J0TnVtYmVyKHNjYWxlLngpLCB5OiByb3VuZEV4cG9ydE51bWJlcihzY2FsZS55KSwgejogMSB9LFxuICAgICAgICAgICAgYW5nbGU6IHJvdW5kRXhwb3J0TnVtYmVyKE51bWJlcihyZW5kZXJlci5hbmdsZSkgfHwgMCksXG4gICAgICAgIH0sXG4gICAgICAgIHVpOiB1aSA/IHtcbiAgICAgICAgICAgIHdpZHRoOiByb3VuZEV4cG9ydE51bWJlcihzaXplLndpZHRoKSxcbiAgICAgICAgICAgIGhlaWdodDogcm91bmRFeHBvcnROdW1iZXIoc2l6ZS5oZWlnaHQpLFxuICAgICAgICAgICAgYW5jaG9yOiByZWFkVWlBbmNob3IodWkpLFxuICAgICAgICB9IDogbnVsbCxcbiAgICAgICAgcmljaFRleHQ6IHNuYXBzaG90UmljaFRleHRDb21wb25lbnQocmljaFRleHQpLFxuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYXB0dXJlUmVwbGFjZVNuYXBzaG90KG5vZGU6IGFueSwgY2M6IGFueSk6IGFueSB7XG4gICAgY29uc3QgeyBVSVRyYW5zZm9ybSwgTGFiZWwsIFJpY2hUZXh0LCBTcHJpdGUgfSA9IGNjO1xuICAgIGNvbnN0IHVpID0gVUlUcmFuc2Zvcm0gJiYgbm9kZS5nZXRDb21wb25lbnQgPyBub2RlLmdldENvbXBvbmVudChVSVRyYW5zZm9ybSkgOiBudWxsO1xuICAgIGNvbnN0IGxhYmVsID0gTGFiZWwgJiYgbm9kZS5nZXRDb21wb25lbnQgPyBub2RlLmdldENvbXBvbmVudChMYWJlbCkgOiBudWxsO1xuICAgIGNvbnN0IGRpcmVjdFJpY2hUZXh0ID0gUmljaFRleHQgJiYgbm9kZS5nZXRDb21wb25lbnQgPyBub2RlLmdldENvbXBvbmVudChSaWNoVGV4dCkgOiBudWxsO1xuICAgIGNvbnN0IHJpY2hUZXh0UmVuZGVyZXIgPSBmaW5kRnRvY1JpY2hUZXh0UmVuZGVyZXJOb2RlKG5vZGUsIFJpY2hUZXh0KTtcbiAgICBjb25zdCByaWNoVGV4dFNoYWRvd1JlbmRlcmVyID0gZmluZEZ0b2NSaWNoVGV4dFNoYWRvd05vZGUobm9kZSwgUmljaFRleHQpO1xuICAgIGNvbnN0IHNwcml0ZSA9IFNwcml0ZSAmJiBub2RlLmdldENvbXBvbmVudCA/IG5vZGUuZ2V0Q29tcG9uZW50KFNwcml0ZSkgOiBudWxsO1xuICAgIGNvbnN0IHNpemUgPSByZWFkVWlTaXplKHVpKTtcbiAgICBjb25zdCBwb3NpdGlvbiA9IHJlYWROb2RlUG9zaXRpb24obm9kZSk7XG4gICAgY29uc3Qgc2NhbGUgPSByZWFkTm9kZVNjYWxlKG5vZGUpO1xuICAgIGNvbnN0IGFuY2hvciA9IHJlYWRVaUFuY2hvcih1aSk7XG4gICAgY29uc3QgZnJhbWUgPSBzcHJpdGUgJiYgKHNwcml0ZS5zcHJpdGVGcmFtZSB8fCBzcHJpdGUuX3Nwcml0ZUZyYW1lKTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIHZlcnNpb246IDMsXG4gICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgbmFtZTogbm9kZS5uYW1lIHx8ICcnLFxuICAgICAgICBzY2VuZVBhdGg6IGJ1aWxkU2NlbmVOb2RlUGF0aChub2RlKSxcbiAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSAhPT0gZmFsc2UsXG4gICAgICAgIGxheWVyOiB0eXBlb2Ygbm9kZS5sYXllciA9PT0gJ251bWJlcicgPyBub2RlLmxheWVyIDogdW5kZWZpbmVkLFxuICAgICAgICBzaWJsaW5nSW5kZXg6IHR5cGVvZiBub2RlLmdldFNpYmxpbmdJbmRleCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgPyBub2RlLmdldFNpYmxpbmdJbmRleCgpXG4gICAgICAgICAgICA6IG5vZGUucGFyZW50ICYmIG5vZGUucGFyZW50LmNoaWxkcmVuID8gbm9kZS5wYXJlbnQuY2hpbGRyZW4uaW5kZXhPZihub2RlKSA6IC0xLFxuICAgICAgICB0cmFuc2Zvcm06IHtcbiAgICAgICAgICAgIHBvc2l0aW9uOiB7IHg6IHJvdW5kRXhwb3J0TnVtYmVyKHBvc2l0aW9uLngpLCB5OiByb3VuZEV4cG9ydE51bWJlcihwb3NpdGlvbi55KSwgejogMCB9LFxuICAgICAgICAgICAgc2NhbGU6IHsgeDogcm91bmRFeHBvcnROdW1iZXIoc2NhbGUueCksIHk6IHJvdW5kRXhwb3J0TnVtYmVyKHNjYWxlLnkpLCB6OiAxIH0sXG4gICAgICAgICAgICBhbmdsZTogcm91bmRFeHBvcnROdW1iZXIoTnVtYmVyKG5vZGUuYW5nbGUpIHx8IDApLFxuICAgICAgICB9LFxuICAgICAgICB1aTogdWkgPyB7XG4gICAgICAgICAgICB3aWR0aDogcm91bmRFeHBvcnROdW1iZXIoc2l6ZS53aWR0aCksXG4gICAgICAgICAgICBoZWlnaHQ6IHJvdW5kRXhwb3J0TnVtYmVyKHNpemUuaGVpZ2h0KSxcbiAgICAgICAgICAgIGFuY2hvcixcbiAgICAgICAgfSA6IG51bGwsXG4gICAgICAgIHNwcml0ZTogc3ByaXRlID8ge1xuICAgICAgICAgICAgZW5hYmxlZDogc3ByaXRlLmVuYWJsZWQgIT09IGZhbHNlICYmIHNwcml0ZS5fZW5hYmxlZCAhPT0gZmFsc2UsXG4gICAgICAgICAgICB0eXBlOiBzcHJpdGUudHlwZSxcbiAgICAgICAgICAgIHNpemVNb2RlOiBzcHJpdGUuc2l6ZU1vZGUsXG4gICAgICAgICAgICB0cmltOiBzcHJpdGUudHJpbSxcbiAgICAgICAgICAgIGNvbG9yOiBzbmFwc2hvdENvbG9yKHNwcml0ZS5jb2xvciksXG4gICAgICAgICAgICBwaXhlbHNQZXJVbml0OiBOdW1iZXIoc3ByaXRlLnBpeGVsc1BlclVuaXQpIHx8IDAsXG4gICAgICAgICAgICBmaWxsVHlwZTogc3ByaXRlLmZpbGxUeXBlLFxuICAgICAgICAgICAgZmlsbFN0YXJ0OiBzcHJpdGUuZmlsbFN0YXJ0LFxuICAgICAgICAgICAgZmlsbFJhbmdlOiBzcHJpdGUuZmlsbFJhbmdlLFxuICAgICAgICAgICAgc3ByaXRlRnJhbWU6IHNuYXBzaG90U3ByaXRlRnJhbWUoZnJhbWUpLFxuICAgICAgICB9IDogbnVsbCxcbiAgICAgICAgbGFiZWw6IGxhYmVsID8ge1xuICAgICAgICAgICAgZW5hYmxlZDogbGFiZWwuZW5hYmxlZCAhPT0gZmFsc2UgJiYgbGFiZWwuX2VuYWJsZWQgIT09IGZhbHNlLFxuICAgICAgICAgICAgc3RyaW5nOiBTdHJpbmcobGFiZWwuc3RyaW5nIHx8ICcnKSxcbiAgICAgICAgICAgIGZvbnRTaXplOiBOdW1iZXIobGFiZWwuZm9udFNpemUpIHx8IDAsXG4gICAgICAgICAgICBsaW5lSGVpZ2h0OiBOdW1iZXIobGFiZWwubGluZUhlaWdodCkgfHwgMCxcbiAgICAgICAgICAgIGhvcml6b250YWxBbGlnbjogbGFiZWwuaG9yaXpvbnRhbEFsaWduLFxuICAgICAgICAgICAgdmVydGljYWxBbGlnbjogbGFiZWwudmVydGljYWxBbGlnbixcbiAgICAgICAgICAgIG92ZXJmbG93OiBsYWJlbC5vdmVyZmxvdyxcbiAgICAgICAgICAgIGVuYWJsZVdyYXBUZXh0OiBsYWJlbC5lbmFibGVXcmFwVGV4dCxcbiAgICAgICAgICAgIGZvbnRVdWlkOiBhc3NldFV1aWQobGFiZWwuZm9udCksXG4gICAgICAgICAgICB1c2VTeXN0ZW1Gb250OiAhIWxhYmVsLnVzZVN5c3RlbUZvbnQsXG4gICAgICAgICAgICBpc0JvbGQ6ICEhbGFiZWwuaXNCb2xkLFxuICAgICAgICAgICAgaXNJdGFsaWM6ICEhbGFiZWwuaXNJdGFsaWMsXG4gICAgICAgICAgICBpc1VuZGVybGluZTogISFsYWJlbC5pc1VuZGVybGluZSxcbiAgICAgICAgICAgIHNwYWNpbmdYOiBOdW1iZXIobGFiZWwuc3BhY2luZ1gpIHx8IDAsXG4gICAgICAgICAgICBjYWNoZU1vZGU6IGxhYmVsLmNhY2hlTW9kZSxcbiAgICAgICAgICAgIGNvbG9yOiBzbmFwc2hvdENvbG9yKGxhYmVsLmNvbG9yKSxcbiAgICAgICAgICAgIGVuYWJsZU91dGxpbmU6ICEhbGFiZWwuZW5hYmxlT3V0bGluZSxcbiAgICAgICAgICAgIG91dGxpbmVDb2xvcjogc25hcHNob3RDb2xvcihsYWJlbC5vdXRsaW5lQ29sb3IpLFxuICAgICAgICAgICAgb3V0bGluZVdpZHRoOiBOdW1iZXIobGFiZWwub3V0bGluZVdpZHRoKSB8fCAwLFxuICAgICAgICAgICAgZW5hYmxlU2hhZG93OiAhIWxhYmVsLmVuYWJsZVNoYWRvdyxcbiAgICAgICAgICAgIHNoYWRvd0NvbG9yOiBzbmFwc2hvdENvbG9yKGxhYmVsLnNoYWRvd0NvbG9yKSxcbiAgICAgICAgICAgIHNoYWRvd09mZnNldDogc25hcHNob3RWZWMyKGxhYmVsLnNoYWRvd09mZnNldCksXG4gICAgICAgICAgICBzaGFkb3dCbHVyOiBOdW1iZXIobGFiZWwuc2hhZG93Qmx1cikgfHwgMCxcbiAgICAgICAgfSA6IG51bGwsXG4gICAgICAgIC8vIERpcmVjdCBSaWNoVGV4dCBhbmQgdGhlIEZ0b0MgcmVuZGVyZXIgYXJlIGRlbGliZXJhdGVseSBkaXN0aW5jdDpcbiAgICAgICAgLy8gcmVzdG9yZSBtdXN0IGJlIGFibGUgdG8gZGVsZXRlIGEgcmVuZGVyZXIgdGhhdCBkaWQgbm90IGV4aXN0IGJlZm9yZSBwYWlyaW5nLlxuICAgICAgICByaWNoVGV4dDogc25hcHNob3RSaWNoVGV4dENvbXBvbmVudChkaXJlY3RSaWNoVGV4dCksXG4gICAgICAgIHJpY2hUZXh0UmVuZGVyZXI6IHNuYXBzaG90UmljaFRleHRSZW5kZXJlcihyaWNoVGV4dFJlbmRlcmVyLCBjYyksXG4gICAgICAgIHJpY2hUZXh0U2hhZG93UmVuZGVyZXI6IHNuYXBzaG90UmljaFRleHRSZW5kZXJlcihyaWNoVGV4dFNoYWRvd1JlbmRlcmVyLCBjYyksXG4gICAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzdG9yZVJpY2hUZXh0Q29tcG9uZW50KFxuICAgIHJpY2hUZXh0OiBhbnksXG4gICAgc3RhdGU6IGFueSxcbiAgICBjYzogYW55LFxuICAgIHdhcm5pbmdQcmVmaXg6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICBjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCB7IEZvbnQsIENvbG9yIH0gPSBjYztcbiAgICBpZiAoIXJpY2hUZXh0IHx8ICFzdGF0ZSkgcmV0dXJuIHdhcm5pbmdzO1xuXG4gICAgLy8gQmF0Y2ggd2hpbGUgZGlzYWJsZWQgc28gQ3JlYXRvciBwZXJmb3JtcyBvbmUgbGF5b3V0IHdpdGggdGhlIGZpbmFsIHZhbHVlcy5cbiAgICByaWNoVGV4dC5lbmFibGVkID0gZmFsc2U7XG4gICAgcmljaFRleHQuc3RyaW5nID0gU3RyaW5nKHN0YXRlLnN0cmluZyB8fCAnJyk7XG4gICAgaWYgKHN0YXRlLmZvbnRTaXplID4gMCkgcmljaFRleHQuZm9udFNpemUgPSBzdGF0ZS5mb250U2l6ZTtcbiAgICBpZiAoc3RhdGUubGluZUhlaWdodCA+IDApIHJpY2hUZXh0LmxpbmVIZWlnaHQgPSBzdGF0ZS5saW5lSGVpZ2h0O1xuICAgIGlmICh0eXBlb2Ygc3RhdGUuaG9yaXpvbnRhbEFsaWduICE9PSAndW5kZWZpbmVkJykgcmljaFRleHQuaG9yaXpvbnRhbEFsaWduID0gc3RhdGUuaG9yaXpvbnRhbEFsaWduO1xuICAgIGlmICh0eXBlb2Ygc3RhdGUudmVydGljYWxBbGlnbiAhPT0gJ3VuZGVmaW5lZCcpIHJpY2hUZXh0LnZlcnRpY2FsQWxpZ24gPSBzdGF0ZS52ZXJ0aWNhbEFsaWduO1xuICAgIGlmICh0eXBlb2Ygc3RhdGUubWF4V2lkdGggIT09ICd1bmRlZmluZWQnKSByaWNoVGV4dC5tYXhXaWR0aCA9IE51bWJlcihzdGF0ZS5tYXhXaWR0aCkgfHwgMDtcbiAgICByaWNoVGV4dC51c2VTeXN0ZW1Gb250ID0gISFzdGF0ZS51c2VTeXN0ZW1Gb250O1xuICAgIGlmICh0eXBlb2Ygc3RhdGUuZm9udEZhbWlseSA9PT0gJ3N0cmluZycpIHJpY2hUZXh0LmZvbnRGYW1pbHkgPSBzdGF0ZS5mb250RmFtaWx5O1xuICAgIGlmICh0eXBlb2Ygc3RhdGUuY2FjaGVNb2RlICE9PSAndW5kZWZpbmVkJykgcmljaFRleHQuY2FjaGVNb2RlID0gc3RhdGUuY2FjaGVNb2RlO1xuICAgIGlmICh0eXBlb2Ygc3RhdGUuaGFuZGxlVG91Y2hFdmVudCAhPT0gJ3VuZGVmaW5lZCcpIHJpY2hUZXh0LmhhbmRsZVRvdWNoRXZlbnQgPSBzdGF0ZS5oYW5kbGVUb3VjaEV2ZW50O1xuICAgIGlmIChzdGF0ZS5mb250VXVpZCkge1xuICAgICAgICBjb25zdCBmb250ID0gYXdhaXQgbG9hZEFzc2V0QW55KGNjLmFzc2V0TWFuYWdlciwgc3RhdGUuZm9udFV1aWQpO1xuICAgICAgICBpZiAoZm9udCAmJiAoIUZvbnQgfHwgZm9udCBpbnN0YW5jZW9mIEZvbnQpKSB7XG4gICAgICAgICAgICByaWNoVGV4dC5mb250ID0gZm9udDtcbiAgICAgICAgICAgIHJpY2hUZXh0LnVzZVN5c3RlbUZvbnQgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHdhcm5pbmdzLnB1c2goYCR7d2FybmluZ1ByZWZpeH3lrZfkvZPov5jljp/lpLHotKXvvJoke3N0YXRlLmZvbnRVdWlkfWApO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGNvbG9yID0gcmVzdG9yZUNvbG9yKENvbG9yLCBzdGF0ZS5jb2xvcik7XG4gICAgaWYgKGNvbG9yICYmIHR5cGVvZiByaWNoVGV4dC5mb250Q29sb3IgIT09ICd1bmRlZmluZWQnKSByaWNoVGV4dC5mb250Q29sb3IgPSBjb2xvcjtcbiAgICByaWNoVGV4dC5lbmFibGVkID0gc3RhdGUuZW5hYmxlZCAhPT0gZmFsc2U7XG4gICAgcmV0dXJuIHdhcm5pbmdzO1xufVxuXG5mdW5jdGlvbiByZW1vdmVGdG9jUmljaFRleHRSZW5kZXJlcihub2RlOiBhbnksIFJpY2hUZXh0OiBhbnkpOiB2b2lkIHtcbiAgICByZW1vdmVGdG9jUmljaFRleHRTaGFkb3cobm9kZSwgUmljaFRleHQpO1xuICAgIGNvbnN0IHJlbmRlcmVyID0gZmluZEZ0b2NSaWNoVGV4dFJlbmRlcmVyTm9kZShub2RlLCBSaWNoVGV4dCk7XG4gICAgaWYgKCFyZW5kZXJlcikgcmV0dXJuO1xuICAgIHJlbmRlcmVyLmFjdGl2ZSA9IGZhbHNlO1xuICAgIGlmICh0eXBlb2YgcmVuZGVyZXIucmVtb3ZlRnJvbVBhcmVudCA9PT0gJ2Z1bmN0aW9uJykgcmVuZGVyZXIucmVtb3ZlRnJvbVBhcmVudCgpO1xuICAgIGlmICh0eXBlb2YgcmVuZGVyZXIuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykgcmVuZGVyZXIuZGVzdHJveSgpO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXN0b3JlUmljaFRleHRSZW5kZXJlcihcbiAgICBub2RlOiBhbnksXG4gICAgc3RhdGU6IGFueSxcbiAgICBjYzogYW55LFxuICAgIHJlbmRlcmVyTmFtZSA9IEZUT0NfUklDSF9URVhUX1JFTkRFUkVSX05BTUUsXG4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgY29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgeyBOb2RlLCBVSVRyYW5zZm9ybSwgUmljaFRleHQsIFZlYzMgfSA9IGNjO1xuICAgIGlmICghc3RhdGUpIHJldHVybiB3YXJuaW5ncztcbiAgICBpZiAoIU5vZGUgfHwgIVVJVHJhbnNmb3JtIHx8ICFSaWNoVGV4dCkge1xuICAgICAgICB3YXJuaW5ncy5wdXNoKGDnm67moIfoioLngrnjgIwke25vZGUubmFtZSB8fCBub2RlLnV1aWR944CN57y65bCRIFJpY2hUZXh0IOi/kOihjOaXtuiDveWKm++8jOaXoOazlei/mOWOnyAke3JlbmRlcmVyTmFtZX3jgIJgKTtcbiAgICAgICAgcmV0dXJuIHdhcm5pbmdzO1xuICAgIH1cblxuICAgIGxldCByZW5kZXJlciA9IHJlbmRlcmVyTmFtZSA9PT0gRlRPQ19SSUNIX1RFWFRfU0hBRE9XX05BTUVcbiAgICAgICAgPyBmaW5kRnRvY1JpY2hUZXh0U2hhZG93Tm9kZShub2RlLCBSaWNoVGV4dClcbiAgICAgICAgOiBmaW5kRnRvY1JpY2hUZXh0UmVuZGVyZXJOb2RlKG5vZGUsIFJpY2hUZXh0KTtcbiAgICBpZiAoIXJlbmRlcmVyKSB7XG4gICAgICAgIHJlbmRlcmVyID0gbmV3IE5vZGUocmVuZGVyZXJOYW1lKTtcbiAgICAgICAgcmVuZGVyZXIuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIG5vZGUuYWRkQ2hpbGQocmVuZGVyZXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHJlbmRlcmVyLmFjdGl2ZSA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHN0YXRlLmxheWVyID09PSAnbnVtYmVyJykgcmVuZGVyZXIubGF5ZXIgPSBzdGF0ZS5sYXllcjtcblxuICAgIGNvbnN0IHVpID0gcmVuZGVyZXIuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKSB8fCByZW5kZXJlci5hZGRDb21wb25lbnQoVUlUcmFuc2Zvcm0pO1xuICAgIGlmIChzdGF0ZS51aSkge1xuICAgICAgICBpZiAodHlwZW9mIHVpLnNldENvbnRlbnRTaXplID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICB1aS5zZXRDb250ZW50U2l6ZShOdW1iZXIoc3RhdGUudWkud2lkdGgpIHx8IDAsIE51bWJlcihzdGF0ZS51aS5oZWlnaHQpIHx8IDApO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgdWkuc2V0QW5jaG9yUG9pbnQgPT09ICdmdW5jdGlvbicgJiYgc3RhdGUudWkuYW5jaG9yKSB7XG4gICAgICAgICAgICB1aS5zZXRBbmNob3JQb2ludChOdW1iZXIoc3RhdGUudWkuYW5jaG9yLngpIHx8IDAsIE51bWJlcihzdGF0ZS51aS5hbmNob3IueSkgfHwgMCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHN0YXRlLnRyYW5zZm9ybSkge1xuICAgICAgICBjb25zdCBwb3MgPSBtYWtlVmVjMyhWZWMzLCBzdGF0ZS50cmFuc2Zvcm0ucG9zaXRpb24pO1xuICAgICAgICBpZiAocG9zICYmIHR5cGVvZiByZW5kZXJlci5zZXRQb3NpdGlvbiA9PT0gJ2Z1bmN0aW9uJykgcmVuZGVyZXIuc2V0UG9zaXRpb24ocG9zKTtcbiAgICAgICAgY29uc3Qgc2NhbGUgPSBtYWtlVmVjMyhWZWMzLCBzdGF0ZS50cmFuc2Zvcm0uc2NhbGUsIDEpO1xuICAgICAgICBpZiAoc2NhbGUgJiYgdHlwZW9mIHJlbmRlcmVyLnNldFNjYWxlID09PSAnZnVuY3Rpb24nKSByZW5kZXJlci5zZXRTY2FsZShzY2FsZSk7XG4gICAgICAgIHJlbmRlcmVyLmFuZ2xlID0gTnVtYmVyKHN0YXRlLnRyYW5zZm9ybS5hbmdsZSkgfHwgMDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiByZW5kZXJlci5zZXRTaWJsaW5nSW5kZXggPT09ICdmdW5jdGlvbicgJiYgTnVtYmVyKHN0YXRlLnNpYmxpbmdJbmRleCkgPj0gMCkge1xuICAgICAgICByZW5kZXJlci5zZXRTaWJsaW5nSW5kZXgoTnVtYmVyKHN0YXRlLnNpYmxpbmdJbmRleCkpO1xuICAgIH1cblxuICAgIGNvbnN0IHJpY2hUZXh0ID0gcmVuZGVyZXIuZ2V0Q29tcG9uZW50KFJpY2hUZXh0KSB8fCByZW5kZXJlci5hZGRDb21wb25lbnQoUmljaFRleHQpO1xuICAgIHdhcm5pbmdzLnB1c2goLi4uYXdhaXQgcmVzdG9yZVJpY2hUZXh0Q29tcG9uZW50KHJpY2hUZXh0LCBzdGF0ZS5yaWNoVGV4dCwgY2MsICflr4zmlofmnKwgcmVuZGVyZXIgJykpO1xuICAgIHJlbmRlcmVyLmFjdGl2ZSA9IHN0YXRlLmFjdGl2ZSAhPT0gZmFsc2U7XG4gICAgcmV0dXJuIHdhcm5pbmdzO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzdG9yZVJlcGxhY2VTbmFwc2hvdChub2RlOiBhbnksIHNuYXBzaG90OiBhbnksIGNjOiBhbnkpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgY29uc3Qgd2FybmluZ3M6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgeyBVSVRyYW5zZm9ybSwgTGFiZWwsIFJpY2hUZXh0LCBTcHJpdGUsIEZvbnQsIFZlYzMsIENvbG9yIH0gPSBjYztcbiAgICBpZiAoIW5vZGUgfHwgIXNuYXBzaG90KSByZXR1cm4gWyfnvLrlsJHnm67moIfoioLngrnmiJYgc25hcHNob3TjgIInXTtcblxuICAgIGNvbnN0IGhhc1JlbmRlcmVyU25hcHNob3QgPSBOdW1iZXIoc25hcHNob3QudmVyc2lvbikgPj0gMiAmJlxuICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoc25hcHNob3QsICdyaWNoVGV4dFJlbmRlcmVyJyk7XG4gICAgY29uc3QgaGFzU2hhZG93UmVuZGVyZXJTbmFwc2hvdCA9IE51bWJlcihzbmFwc2hvdC52ZXJzaW9uKSA+PSAzICYmXG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChzbmFwc2hvdCwgJ3JpY2hUZXh0U2hhZG93UmVuZGVyZXInKTtcbiAgICBpZiAoaGFzUmVuZGVyZXJTbmFwc2hvdCkge1xuICAgICAgICBjb25zdCBjdXJyZW50UmVuZGVyZXIgPSBmaW5kRnRvY1JpY2hUZXh0UmVuZGVyZXJOb2RlKG5vZGUsIFJpY2hUZXh0KTtcbiAgICAgICAgaWYgKHNuYXBzaG90LnJpY2hUZXh0UmVuZGVyZXIpIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UmVuZGVyZXIpIGN1cnJlbnRSZW5kZXJlci5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFRoZSByZW5kZXJlciB3YXMgaW50cm9kdWNlZCBieSB0aGlzIHBhaXJpbmcsIHNvIGNsZWFyaW5nIHRoZSByb3dcbiAgICAgICAgICAgIC8vIG11c3QgcmV0dXJuIHRoZSBhdXRob3JlZCBub2RlIHRvIGl0cyBvcmlnaW5hbCBMYWJlbC1vbmx5IHRvcG9sb2d5LlxuICAgICAgICAgICAgcmVtb3ZlRnRvY1JpY2hUZXh0UmVuZGVyZXIobm9kZSwgUmljaFRleHQpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChoYXNTaGFkb3dSZW5kZXJlclNuYXBzaG90KSB7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRTaGFkb3cgPSBmaW5kRnRvY1JpY2hUZXh0U2hhZG93Tm9kZShub2RlLCBSaWNoVGV4dCk7XG4gICAgICAgIGlmIChzbmFwc2hvdC5yaWNoVGV4dFNoYWRvd1JlbmRlcmVyKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFNoYWRvdykgY3VycmVudFNoYWRvdy5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlbW92ZUZ0b2NSaWNoVGV4dFNoYWRvdyhub2RlLCBSaWNoVGV4dCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGhhc1JlbmRlcmVyU25hcHNob3QpIHtcbiAgICAgICAgLy8gdjIgc25hcHNob3RzIHByZWRhdGUgcGVyc2lzdGVudCBSaWNoVGV4dCBzaGFkb3c7IGFueSBjdXJyZW50IGNvbXBhbmlvblxuICAgICAgICAvLyB3YXMgaW50cm9kdWNlZCBhZnRlciB0aGF0IGJhc2VsaW5lIGFuZCBtdXN0IG5vdCBzdXJ2aXZlIGEgcmVzdG9yZS5cbiAgICAgICAgcmVtb3ZlRnRvY1JpY2hUZXh0U2hhZG93KG5vZGUsIFJpY2hUZXh0KTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHNuYXBzaG90LmFjdGl2ZSA9PT0gJ2Jvb2xlYW4nKSBub2RlLmFjdGl2ZSA9IHNuYXBzaG90LmFjdGl2ZTtcbiAgICBpZiAodHlwZW9mIHNuYXBzaG90LmxheWVyID09PSAnbnVtYmVyJykgbm9kZS5sYXllciA9IHNuYXBzaG90LmxheWVyO1xuXG4gICAgY29uc3QgdWkgPSBVSVRyYW5zZm9ybSAmJiBub2RlLmdldENvbXBvbmVudCA/IG5vZGUuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKSA6IG51bGw7XG4gICAgaWYgKHVpICYmIHNuYXBzaG90LnVpKSB7XG4gICAgICAgIGlmICh0eXBlb2YgdWkuc2V0Q29udGVudFNpemUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHVpLnNldENvbnRlbnRTaXplKE51bWJlcihzbmFwc2hvdC51aS53aWR0aCkgfHwgMCwgTnVtYmVyKHNuYXBzaG90LnVpLmhlaWdodCkgfHwgMCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiB1aS5zZXRBbmNob3JQb2ludCA9PT0gJ2Z1bmN0aW9uJyAmJiBzbmFwc2hvdC51aS5hbmNob3IpIHtcbiAgICAgICAgICAgIHVpLnNldEFuY2hvclBvaW50KE51bWJlcihzbmFwc2hvdC51aS5hbmNob3IueCkgfHwgMCwgTnVtYmVyKHNuYXBzaG90LnVpLmFuY2hvci55KSB8fCAwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzbmFwc2hvdC50cmFuc2Zvcm0pIHtcbiAgICAgICAgY29uc3QgcG9zID0gbWFrZVZlYzMoVmVjMywgc25hcHNob3QudHJhbnNmb3JtLnBvc2l0aW9uKTtcbiAgICAgICAgaWYgKHBvcyAmJiB0eXBlb2Ygbm9kZS5zZXRQb3NpdGlvbiA9PT0gJ2Z1bmN0aW9uJykgbm9kZS5zZXRQb3NpdGlvbihwb3MpO1xuICAgICAgICBjb25zdCBzY2FsZSA9IG1ha2VWZWMzKFZlYzMsIHNuYXBzaG90LnRyYW5zZm9ybS5zY2FsZSwgMSk7XG4gICAgICAgIGlmIChzY2FsZSAmJiB0eXBlb2Ygbm9kZS5zZXRTY2FsZSA9PT0gJ2Z1bmN0aW9uJykgbm9kZS5zZXRTY2FsZShzY2FsZSk7XG4gICAgICAgIG5vZGUuYW5nbGUgPSBOdW1iZXIoc25hcHNob3QudHJhbnNmb3JtLmFuZ2xlKSB8fCAwO1xuICAgIH1cblxuICAgIGlmIChub2RlLnBhcmVudCAmJiB0eXBlb2Ygbm9kZS5zZXRTaWJsaW5nSW5kZXggPT09ICdmdW5jdGlvbicgJiYgTnVtYmVyKHNuYXBzaG90LnNpYmxpbmdJbmRleCkgPj0gMCkge1xuICAgICAgICBub2RlLnNldFNpYmxpbmdJbmRleChOdW1iZXIoc25hcHNob3Quc2libGluZ0luZGV4KSk7XG4gICAgfVxuXG4gICAgaWYgKHNuYXBzaG90LnNwcml0ZSkge1xuICAgICAgICBjb25zdCBzcHJpdGUgPSBTcHJpdGUgJiYgbm9kZS5nZXRDb21wb25lbnQgPyBub2RlLmdldENvbXBvbmVudChTcHJpdGUpIDogbnVsbDtcbiAgICAgICAgaWYgKCFzcHJpdGUpIHtcbiAgICAgICAgICAgIHdhcm5pbmdzLnB1c2goYOebruagh+iKgueCueOAjCR7bm9kZS5uYW1lIHx8IG5vZGUudXVpZH3jgI3nvLrlsJEgU3ByaXRl77yM5peg5rOV6L+Y5Y6f5Zu+54mH54q25oCB44CCYCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzcHJpdGUuZW5hYmxlZCA9IHNuYXBzaG90LnNwcml0ZS5lbmFibGVkICE9PSBmYWxzZTtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc25hcHNob3Quc3ByaXRlLnR5cGUgIT09ICd1bmRlZmluZWQnKSBzcHJpdGUudHlwZSA9IHNuYXBzaG90LnNwcml0ZS50eXBlO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzbmFwc2hvdC5zcHJpdGUuc2l6ZU1vZGUgIT09ICd1bmRlZmluZWQnKSBzcHJpdGUuc2l6ZU1vZGUgPSBzbmFwc2hvdC5zcHJpdGUuc2l6ZU1vZGU7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHNuYXBzaG90LnNwcml0ZS50cmltICE9PSAndW5kZWZpbmVkJykgc3ByaXRlLnRyaW0gPSBzbmFwc2hvdC5zcHJpdGUudHJpbTtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc25hcHNob3Quc3ByaXRlLnBpeGVsc1BlclVuaXQgPT09ICdudW1iZXInICYmIHNuYXBzaG90LnNwcml0ZS5waXhlbHNQZXJVbml0ID4gMCkge1xuICAgICAgICAgICAgICAgIHNwcml0ZS5waXhlbHNQZXJVbml0ID0gc25hcHNob3Quc3ByaXRlLnBpeGVsc1BlclVuaXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIHNuYXBzaG90LnNwcml0ZS5maWxsVHlwZSAhPT0gJ3VuZGVmaW5lZCcpIHNwcml0ZS5maWxsVHlwZSA9IHNuYXBzaG90LnNwcml0ZS5maWxsVHlwZTtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc25hcHNob3Quc3ByaXRlLmZpbGxTdGFydCAhPT0gJ3VuZGVmaW5lZCcpIHNwcml0ZS5maWxsU3RhcnQgPSBzbmFwc2hvdC5zcHJpdGUuZmlsbFN0YXJ0O1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzbmFwc2hvdC5zcHJpdGUuZmlsbFJhbmdlICE9PSAndW5kZWZpbmVkJykgc3ByaXRlLmZpbGxSYW5nZSA9IHNuYXBzaG90LnNwcml0ZS5maWxsUmFuZ2U7XG4gICAgICAgICAgICBjb25zdCBjb2xvciA9IHJlc3RvcmVDb2xvcihDb2xvciwgc25hcHNob3Quc3ByaXRlLmNvbG9yKTtcbiAgICAgICAgICAgIGlmIChjb2xvcikgc3ByaXRlLmNvbG9yID0gY29sb3I7XG4gICAgICAgICAgICBjb25zdCBmcmFtZSA9IGF3YWl0IHJlc3RvcmVTcHJpdGVGcmFtZVNuYXBzaG90KHNuYXBzaG90LnNwcml0ZS5zcHJpdGVGcmFtZSwgY2MpO1xuICAgICAgICAgICAgaWYgKGZyYW1lKSBzcHJpdGUuc3ByaXRlRnJhbWUgPSBmcmFtZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzbmFwc2hvdC5sYWJlbCkge1xuICAgICAgICBjb25zdCBsYWJlbCA9IExhYmVsICYmIG5vZGUuZ2V0Q29tcG9uZW50ID8gbm9kZS5nZXRDb21wb25lbnQoTGFiZWwpIDogbnVsbDtcbiAgICAgICAgaWYgKCFsYWJlbCkge1xuICAgICAgICAgICAgd2FybmluZ3MucHVzaChg55uu5qCH6IqC54K544CMJHtub2RlLm5hbWUgfHwgbm9kZS51dWlkfeOAjee8uuWwkSBMYWJlbO+8jOaXoOazlei/mOWOn+aWh+Wtl+eKtuaAgeOAgmApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGFiZWwuZW5hYmxlZCA9IHNuYXBzaG90LmxhYmVsLmVuYWJsZWQgIT09IGZhbHNlO1xuICAgICAgICAgICAgbGFiZWwuc3RyaW5nID0gU3RyaW5nKHNuYXBzaG90LmxhYmVsLnN0cmluZyB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoc25hcHNob3QubGFiZWwuZm9udFNpemUgPiAwKSBsYWJlbC5mb250U2l6ZSA9IHNuYXBzaG90LmxhYmVsLmZvbnRTaXplO1xuICAgICAgICAgICAgaWYgKHNuYXBzaG90LmxhYmVsLmxpbmVIZWlnaHQgPiAwKSBsYWJlbC5saW5lSGVpZ2h0ID0gc25hcHNob3QubGFiZWwubGluZUhlaWdodDtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc25hcHNob3QubGFiZWwuaG9yaXpvbnRhbEFsaWduICE9PSAndW5kZWZpbmVkJykgbGFiZWwuaG9yaXpvbnRhbEFsaWduID0gc25hcHNob3QubGFiZWwuaG9yaXpvbnRhbEFsaWduO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBzbmFwc2hvdC5sYWJlbC52ZXJ0aWNhbEFsaWduICE9PSAndW5kZWZpbmVkJykgbGFiZWwudmVydGljYWxBbGlnbiA9IHNuYXBzaG90LmxhYmVsLnZlcnRpY2FsQWxpZ247XG4gICAgICAgICAgICBpZiAodHlwZW9mIHNuYXBzaG90LmxhYmVsLm92ZXJmbG93ICE9PSAndW5kZWZpbmVkJykgbGFiZWwub3ZlcmZsb3cgPSBzbmFwc2hvdC5sYWJlbC5vdmVyZmxvdztcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygc25hcHNob3QubGFiZWwuZW5hYmxlV3JhcFRleHQgIT09ICd1bmRlZmluZWQnKSBsYWJlbC5lbmFibGVXcmFwVGV4dCA9IHNuYXBzaG90LmxhYmVsLmVuYWJsZVdyYXBUZXh0O1xuICAgICAgICAgICAgbGFiZWwudXNlU3lzdGVtRm9udCA9ICEhc25hcHNob3QubGFiZWwudXNlU3lzdGVtRm9udDtcbiAgICAgICAgICAgIGlmIChzbmFwc2hvdC5sYWJlbC5mb250VXVpZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZvbnQgPSBhd2FpdCBsb2FkQXNzZXRBbnkoY2MuYXNzZXRNYW5hZ2VyLCBzbmFwc2hvdC5sYWJlbC5mb250VXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKGZvbnQgJiYgKCFGb250IHx8IGZvbnQgaW5zdGFuY2VvZiBGb250KSkge1xuICAgICAgICAgICAgICAgICAgICBsYWJlbC5mb250ID0gZm9udDtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwudXNlU3lzdGVtRm9udCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2goYOWtl+S9k+i/mOWOn+Wksei0pe+8miR7c25hcHNob3QubGFiZWwuZm9udFV1aWR9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGFiZWwuaXNCb2xkID0gISFzbmFwc2hvdC5sYWJlbC5pc0JvbGQ7XG4gICAgICAgICAgICBsYWJlbC5pc0l0YWxpYyA9ICEhc25hcHNob3QubGFiZWwuaXNJdGFsaWM7XG4gICAgICAgICAgICBsYWJlbC5pc1VuZGVybGluZSA9ICEhc25hcHNob3QubGFiZWwuaXNVbmRlcmxpbmU7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHNuYXBzaG90LmxhYmVsLnNwYWNpbmdYICE9PSAndW5kZWZpbmVkJykgbGFiZWwuc3BhY2luZ1ggPSBOdW1iZXIoc25hcHNob3QubGFiZWwuc3BhY2luZ1gpIHx8IDA7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHNuYXBzaG90LmxhYmVsLmNhY2hlTW9kZSAhPT0gJ3VuZGVmaW5lZCcpIGxhYmVsLmNhY2hlTW9kZSA9IHNuYXBzaG90LmxhYmVsLmNhY2hlTW9kZTtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gcmVzdG9yZUNvbG9yKENvbG9yLCBzbmFwc2hvdC5sYWJlbC5jb2xvcik7XG4gICAgICAgICAgICBpZiAoY29sb3IpIGxhYmVsLmNvbG9yID0gY29sb3I7XG4gICAgICAgICAgICBsYWJlbC5lbmFibGVPdXRsaW5lID0gISFzbmFwc2hvdC5sYWJlbC5lbmFibGVPdXRsaW5lO1xuICAgICAgICAgICAgY29uc3Qgb3V0bGluZUNvbG9yID0gcmVzdG9yZUNvbG9yKENvbG9yLCBzbmFwc2hvdC5sYWJlbC5vdXRsaW5lQ29sb3IpO1xuICAgICAgICAgICAgaWYgKG91dGxpbmVDb2xvcikgbGFiZWwub3V0bGluZUNvbG9yID0gb3V0bGluZUNvbG9yO1xuICAgICAgICAgICAgbGFiZWwub3V0bGluZVdpZHRoID0gTnVtYmVyKHNuYXBzaG90LmxhYmVsLm91dGxpbmVXaWR0aCkgfHwgMDtcbiAgICAgICAgICAgIGxhYmVsLmVuYWJsZVNoYWRvdyA9ICEhc25hcHNob3QubGFiZWwuZW5hYmxlU2hhZG93O1xuICAgICAgICAgICAgY29uc3Qgc2hhZG93Q29sb3IgPSByZXN0b3JlQ29sb3IoQ29sb3IsIHNuYXBzaG90LmxhYmVsLnNoYWRvd0NvbG9yKTtcbiAgICAgICAgICAgIGlmIChzaGFkb3dDb2xvcikgbGFiZWwuc2hhZG93Q29sb3IgPSBzaGFkb3dDb2xvcjtcbiAgICAgICAgICAgIGNvbnN0IHNoYWRvd09mZnNldCA9IG1ha2VWZWMyKGNjLlZlYzIsIHNuYXBzaG90LmxhYmVsLnNoYWRvd09mZnNldCk7XG4gICAgICAgICAgICBpZiAoc2hhZG93T2Zmc2V0KSBsYWJlbC5zaGFkb3dPZmZzZXQgPSBzaGFkb3dPZmZzZXQ7XG4gICAgICAgICAgICBsYWJlbC5zaGFkb3dCbHVyID0gTnVtYmVyKHNuYXBzaG90LmxhYmVsLnNoYWRvd0JsdXIpIHx8IDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoc25hcHNob3QucmljaFRleHQpIHtcbiAgICAgICAgY29uc3QgcmljaFRleHQgPSBoYXNSZW5kZXJlclNuYXBzaG90XG4gICAgICAgICAgICA/IChSaWNoVGV4dCAmJiBub2RlLmdldENvbXBvbmVudCA/IG5vZGUuZ2V0Q29tcG9uZW50KFJpY2hUZXh0KSA6IG51bGwpXG4gICAgICAgICAgICA6IGdldExvZ2ljYWxSaWNoVGV4dChub2RlLCBSaWNoVGV4dCk7XG4gICAgICAgIGlmICghcmljaFRleHQpIHtcbiAgICAgICAgICAgIHdhcm5pbmdzLnB1c2goYOebruagh+iKgueCueOAjCR7bm9kZS5uYW1lIHx8IG5vZGUudXVpZH3jgI3nvLrlsJEgUmljaFRleHTvvIzml6Dms5Xov5jljp/lr4zmlofmnKznirbmgIHjgIJgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHdhcm5pbmdzLnB1c2goLi4uYXdhaXQgcmVzdG9yZVJpY2hUZXh0Q29tcG9uZW50KHJpY2hUZXh0LCBzbmFwc2hvdC5yaWNoVGV4dCwgY2MsICflr4zmlofmnKwgJykpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGhhc1JlbmRlcmVyU25hcHNob3QgJiYgc25hcHNob3QucmljaFRleHRSZW5kZXJlcikge1xuICAgICAgICB3YXJuaW5ncy5wdXNoKC4uLmF3YWl0IHJlc3RvcmVSaWNoVGV4dFJlbmRlcmVyKG5vZGUsIHNuYXBzaG90LnJpY2hUZXh0UmVuZGVyZXIsIGNjKSk7XG4gICAgfVxuICAgIGlmIChoYXNTaGFkb3dSZW5kZXJlclNuYXBzaG90ICYmIHNuYXBzaG90LnJpY2hUZXh0U2hhZG93UmVuZGVyZXIpIHtcbiAgICAgICAgd2FybmluZ3MucHVzaCguLi5hd2FpdCByZXN0b3JlUmljaFRleHRSZW5kZXJlcihcbiAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICBzbmFwc2hvdC5yaWNoVGV4dFNoYWRvd1JlbmRlcmVyLFxuICAgICAgICAgICAgY2MsXG4gICAgICAgICAgICBGVE9DX1JJQ0hfVEVYVF9TSEFET1dfTkFNRSxcbiAgICAgICAgKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHdhcm5pbmdzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhwb3J0Tm9kZVRyYW5zZm9ybShcbiAgICBub2RlOiBhbnksXG4gICAgdzogbnVtYmVyLFxuICAgIGg6IG51bWJlcixcbiAgICBwYXJlbnRXOiBudW1iZXIsXG4gICAgcGFyZW50SDogbnVtYmVyLFxuICAgIGlzUm9vdDogYm9vbGVhbixcbiAgICB1aT86IGFueSxcbik6IGFueSB7XG4gICAgY29uc3QgcCA9IHJlYWROb2RlUG9zaXRpb24obm9kZSk7XG4gICAgY29uc3QgcyA9IHJlYWROb2RlU2NhbGUobm9kZSk7XG4gICAgY29uc3Qgcm90YXRpb24gPSAtKCh0eXBlb2Ygbm9kZS5hbmdsZSA9PT0gJ251bWJlcicgPyBub2RlLmFuZ2xlIDogMCkgfHwgMCk7XG4gICAgY29uc3QgYW5jaG9yID0gcmVhZFVpQW5jaG9yKHVpIHx8IChub2RlICYmIChub2RlLnVpVHJhbnNmb3JtIHx8IG5vZGUuX3VpVHJhbnNmb3JtKSkpO1xuICAgIC8vIENvY29zIHBvc2l0aW9uIGlzIHRoZSBhbmNob3IgbG9jYXRpb24uIFJlY292ZXIgdGhlIHRyYW5zZm9ybWVkIHZpc3VhbCBjZW50ZXJcbiAgICAvLyBiZWZvcmUgY29udmVydGluZyBiYWNrIHRvIEZpZ21hJ3Mgbm9ybWFsaXplZCB0b3AtbGVmdCBjb29yZGluYXRlIGNvbnRyYWN0LlxuICAgIGNvbnN0IGNlbnRlck9mZnNldCA9IHZpc3VhbENlbnRlck9mZnNldEZyb21BbmNob3IoXG4gICAgICAgIHcsXG4gICAgICAgIGgsXG4gICAgICAgIGFuY2hvci54LFxuICAgICAgICBhbmNob3IueSxcbiAgICAgICAgcy54LFxuICAgICAgICBzLnksXG4gICAgICAgIE51bWJlcihub2RlICYmIG5vZGUuYW5nbGUpIHx8IDAsXG4gICAgKTtcbiAgICBjb25zdCBjZW50ZXJYID0gcC54ICsgY2VudGVyT2Zmc2V0Lng7XG4gICAgY29uc3QgY2VudGVyWSA9IHAueSArIGNlbnRlck9mZnNldC55O1xuICAgIGNvbnN0IHggPSBpc1Jvb3QgPyAwIDogY2VudGVyWCAtIHcgLyAyICsgcGFyZW50VyAvIDI7XG4gICAgY29uc3QgeSA9IGlzUm9vdCA/IDAgOiBwYXJlbnRIIC8gMiAtIGNlbnRlclkgLSBoIC8gMjtcbiAgICBjb25zdCByID0gcm90YXRpb24gKiBNYXRoLlBJIC8gMTgwO1xuICAgIGNvbnN0IGNvcyA9IE1hdGguY29zKHIpO1xuICAgIGNvbnN0IHNpbiA9IE1hdGguc2luKHIpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHg6IHJvdW5kRXhwb3J0TnVtYmVyKHgpLFxuICAgICAgICB5OiByb3VuZEV4cG9ydE51bWJlcih5KSxcbiAgICAgICAgd2lkdGg6IHJvdW5kRXhwb3J0TnVtYmVyKHcpLFxuICAgICAgICBoZWlnaHQ6IHJvdW5kRXhwb3J0TnVtYmVyKGgpLFxuICAgICAgICByb3RhdGlvbjogcm91bmRFeHBvcnROdW1iZXIocm90YXRpb24pLFxuICAgICAgICBzY2FsZVg6IHJvdW5kRXhwb3J0TnVtYmVyKHMueCksXG4gICAgICAgIHNjYWxlWTogcm91bmRFeHBvcnROdW1iZXIocy55KSxcbiAgICAgICAgcmVsYXRpdmVUcmFuc2Zvcm06IFtcbiAgICAgICAgICAgIFtyb3VuZEV4cG9ydE51bWJlcihzLnggKiBjb3MpLCByb3VuZEV4cG9ydE51bWJlcigtcy55ICogc2luKSwgcm91bmRFeHBvcnROdW1iZXIoeCldLFxuICAgICAgICAgICAgW3JvdW5kRXhwb3J0TnVtYmVyKHMueCAqIHNpbiksIHJvdW5kRXhwb3J0TnVtYmVyKHMueSAqIGNvcyksIHJvdW5kRXhwb3J0TnVtYmVyKHkpXSxcbiAgICAgICAgXSxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBjb2xvclRvRmlnbWFQYWludChjOiBhbnksIGZhbGxiYWNrPzogYW55KTogYW55IHtcbiAgICBjb25zdCBzcmMgPSBjIHx8IGZhbGxiYWNrIHx8IHsgcjogMjU1LCBnOiAyNTUsIGI6IDI1NSwgYTogMjU1IH07XG4gICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogJ1NPTElEJyxcbiAgICAgICAgcjogcm91bmRFeHBvcnROdW1iZXIoY2xhbXAyNTUoc3JjLnIpIC8gMjU1LCA0KSxcbiAgICAgICAgZzogcm91bmRFeHBvcnROdW1iZXIoY2xhbXAyNTUoc3JjLmcpIC8gMjU1LCA0KSxcbiAgICAgICAgYjogcm91bmRFeHBvcnROdW1iZXIoY2xhbXAyNTUoc3JjLmIpIC8gMjU1LCA0KSxcbiAgICAgICAgYTogcm91bmRFeHBvcnROdW1iZXIoY2xhbXAyNTUoc3JjLmEpIC8gMjU1LCA0KSxcbiAgICAgICAgdmlzaWJsZTogdHJ1ZSxcbiAgICAgICAgYmxlbmRNb2RlOiAnTk9STUFMJyxcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRGaWdtYURyb3BTaGFkb3dFZmZlY3QoY29sb3I6IGFueSwgY29jb3NPZmZzZXQ6IGFueSwgYmx1cjogYW55KTogYW55IHtcbiAgICByZXR1cm4ge1xuICAgICAgICAuLi5jb2xvclRvRmlnbWFQYWludChjb2xvciwgeyByOiAwLCBnOiAwLCBiOiAwLCBhOiAyNTUgfSksXG4gICAgICAgIHR5cGU6ICdEUk9QX1NIQURPVycsXG4gICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgIG9mZnNldFg6IHJvdW5kRXhwb3J0TnVtYmVyKE51bWJlcihjb2Nvc09mZnNldCAmJiBjb2Nvc09mZnNldC54KSB8fCAwKSxcbiAgICAgICAgb2Zmc2V0WTogcm91bmRFeHBvcnROdW1iZXIoLShOdW1iZXIoY29jb3NPZmZzZXQgJiYgY29jb3NPZmZzZXQueSkgfHwgMCkpLFxuICAgICAgICByYWRpdXM6IHJvdW5kRXhwb3J0TnVtYmVyKE51bWJlcihibHVyKSB8fCAwKSxcbiAgICAgICAgc3ByZWFkOiAwLFxuICAgICAgICBibGVuZE1vZGU6ICdOT1JNQUwnLFxuICAgIH07XG59XG5cbmZ1bmN0aW9uIGNvbG9yVG9PdmVybGF5VGludChjOiBhbnkpOiBzdHJpbmcge1xuICAgIGlmICghYykgcmV0dXJuICcnO1xuICAgIGNvbnN0IHIgPSBjbGFtcDI1NShjLnIpO1xuICAgIGNvbnN0IGcgPSBjbGFtcDI1NShjLmcpO1xuICAgIGNvbnN0IGIgPSBjbGFtcDI1NShjLmIpO1xuICAgIGlmIChyID49IDI1NCAmJiBnID49IDI1NCAmJiBiID49IDI1NCkgcmV0dXJuICcnO1xuICAgIHJldHVybiAnIycgKyBbciwgZywgYl0ubWFwKCh2KSA9PiB2LnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpLnRvVXBwZXJDYXNlKCkpLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0RmlnbWFOb2RlKG5vZGU6IGFueSwgdHlwZTogc3RyaW5nLCB0cmFuc2Zvcm06IGFueSk6IGFueSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZmlnbWFJZDogYGNvY29zOiR7bm9kZS51dWlkIHx8IG5vZGUubmFtZX1gLFxuICAgICAgICBuYW1lOiBub2RlLm5hbWUgfHwgdHlwZSxcbiAgICAgICAgdHlwZSxcbiAgICAgICAgLi4udHJhbnNmb3JtLFxuICAgICAgICBmaWxsczogW10sXG4gICAgICAgIHN0cm9rZXM6IFtdLFxuICAgICAgICBzdHJva2VXZWlnaHQ6IDEsXG4gICAgICAgIHN0cm9rZUFsaWduOiAnSU5TSURFJyxcbiAgICAgICAgZWZmZWN0czogW10sXG4gICAgICAgIGJsZW5kTW9kZTogJ1BBU1NfVEhST1VHSCcsXG4gICAgICAgIGNvcm5lclJhZGl1czogMCxcbiAgICAgICAgY29ybmVyUmFkaWk6IFtdLFxuICAgICAgICBvcGFjaXR5OiAxLFxuICAgICAgICB2aXNpYmxlOiBub2RlLmFjdGl2ZSAhPT0gZmFsc2UsXG4gICAgICAgIGNsaXBzQ29udGVudDogZmFsc2UsXG4gICAgICAgIGxheW91dE1vZGU6ICcnLFxuICAgICAgICBsYXlvdXRXcmFwOiAnTk9fV1JBUCcsXG4gICAgICAgIGl0ZW1TcGFjaW5nOiAwLFxuICAgICAgICBjb3VudGVyQXhpc1NwYWNpbmc6IDAsXG4gICAgICAgIHBhZGRpbmc6IHsgdG9wOiAwLCByaWdodDogMCwgYm90dG9tOiAwLCBsZWZ0OiAwIH0sXG4gICAgICAgIHByaW1hcnlBeGlzQWxpZ25JdGVtczogJycsXG4gICAgICAgIGNvdW50ZXJBeGlzQWxpZ25JdGVtczogJycsXG4gICAgICAgIGNoYXJhY3RlcnM6ICcnLFxuICAgICAgICBmb250U2l6ZTogMCxcbiAgICAgICAgZm9udEZhbWlseTogJycsXG4gICAgICAgIGZvbnRXZWlnaHQ6ICcnLFxuICAgICAgICB0ZXh0U3R5bGVOYW1lOiAnJyxcbiAgICAgICAgdGV4dFN0eWxlSWQ6ICcnLFxuICAgICAgICBmaWxsU3R5bGVOYW1lOiAnJyxcbiAgICAgICAgZmlsbFN0eWxlSWQ6ICcnLFxuICAgICAgICBzdHJva2VTdHlsZU5hbWU6ICcnLFxuICAgICAgICBzdHJva2VTdHlsZUlkOiAnJyxcbiAgICAgICAgZWZmZWN0U3R5bGVOYW1lOiAnJyxcbiAgICAgICAgZWZmZWN0U3R5bGVJZDogJycsXG4gICAgICAgIHRleHRBbGlnbkhvcml6b250YWw6ICcnLFxuICAgICAgICB0ZXh0QWxpZ25WZXJ0aWNhbDogJycsXG4gICAgICAgIGxpbmVIZWlnaHQ6IDAsXG4gICAgICAgIGxldHRlclNwYWNpbmc6IDAsXG4gICAgICAgIHRleHRBdXRvUmVzaXplOiAnJyxcbiAgICAgICAgdGV4dFRydW5jYXRpb246ICcnLFxuICAgICAgICB0ZXh0RGVjb3JhdGlvbjogJycsXG4gICAgICAgIHRleHRDYXNlOiAnJyxcbiAgICAgICAgaW1hZ2VCYXNlNjQ6ICcnLFxuICAgICAgICBpbWFnZVJlZjogJycsXG4gICAgICAgIGNvbXBvbmVudFR5cGU6ICcnLFxuICAgICAgICBjb21wb25lbnRQcm9wZXJ0aWVzOiB7fSxcbiAgICAgICAgc2xpY2U5Qm9yZGVyOiBudWxsLFxuICAgICAgICBsYXlvdXRQb3NpdGlvbmluZzogJ0FVVE8nLFxuICAgICAgICBjb25zdHJhaW50czogeyBob3Jpem9udGFsOiAnTEVGVCcsIHZlcnRpY2FsOiAnVE9QJyB9LFxuICAgICAgICBjaGlsZHJlbjogW10sXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gaW50ZXJuRXhwb3J0SW1hZ2UoY3R4OiBFeHBvcnRDb250ZXh0LCBiYXNlNjQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKCFiYXNlNjQpIHJldHVybiAnJztcbiAgICBjb25zdCBleGlzdGluZyA9IGN0eC5pbWFnZUlkQnlDb250ZW50W2Jhc2U2NF07XG4gICAgaWYgKGV4aXN0aW5nKSByZXR1cm4gZXhpc3Rpbmc7XG4gICAgY29uc3QgaWQgPSBgaW1nJHtjdHguaW1hZ2VDb3VudGVyKyt9YDtcbiAgICBjdHguaW1hZ2VzW2lkXSA9IGJhc2U2NDtcbiAgICBjdHguaW1hZ2VJZEJ5Q29udGVudFtiYXNlNjRdID0gaWQ7XG4gICAgY3R4LnN0YXRzLmltYWdlcysrO1xuICAgIHJldHVybiBpZDtcbn1cblxuZnVuY3Rpb24gc2FmZUZpZ21hQXNzZXRGb2xkZXJOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIChuYW1lIHx8ICd1bnRpdGxlZCcpLnJlcGxhY2UoL1teXFx35LiALem+pS1dL2csICdfJyk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBxdWVyeUFzc2V0VXJsQnlVdWlkKHV1aWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgaWYgKCF1dWlkKSByZXR1cm4gJyc7XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IFt1dWlkLCB1dWlkLnNwbGl0KCdAJylbMF1dLmZpbHRlcigodmFsdWUsIGluZGV4LCBhbGwpID0+IHZhbHVlICYmIGFsbC5pbmRleE9mKHZhbHVlKSA9PT0gaW5kZXgpO1xuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHVybCA9IGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ2Fzc2V0LWRiJywgJ3F1ZXJ5LWFzc2V0LXVybCcsIGNhbmRpZGF0ZSk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHVybCA9PT0gJ3N0cmluZycgJiYgdXJsKSByZXR1cm4gdXJsO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIC8vIENyZWF0b3IgbWF5IHJlamVjdCBhIFNwcml0ZUZyYW1lIHN1Yi1hc3NldCBVVUlEIHdoaWxlIGFjY2VwdGluZyBpdHMgaW1hZ2UgVVVJRC5cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gJyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkYlVybFRvQXNzZXRQYXRoRm9yRXhwb3J0KGRiVXJsOiBzdHJpbmcsIHByb2plY3RQYXRoPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBpZiAoIWRiVXJsIHx8ICFkYlVybC5zdGFydHNXaXRoKCdkYjovL2Fzc2V0cy8nKSkgcmV0dXJuICcnO1xuICAgIGNvbnN0IHJvb3QgPSBwcm9qZWN0UGF0aCB8fCAoKEVkaXRvciBhcyBhbnkpLlByb2plY3QgJiYgKEVkaXRvciBhcyBhbnkpLlByb2plY3QucGF0aCk7XG4gICAgaWYgKCFyb290KSByZXR1cm4gJyc7XG4gICAgY29uc3QgY2xlYW4gPSBkYlVybC5zcGxpdCgnQCcpWzBdO1xuICAgIHJldHVybiBqb2luKHJvb3QsICdhc3NldHMnLCBjbGVhbi5zbGljZSgnZGI6Ly9hc3NldHMvJy5sZW5ndGgpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRXhwb3J0SW1hZ2VTZWFyY2hEaXJzKHByb2plY3RQYXRoOiBzdHJpbmcsIHJvb3ROYW1lOiBzdHJpbmcsIGludGVyZmFjZVJvb3ROYW1lOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgZmlnbWFSb290ID0gam9pbihwcm9qZWN0UGF0aCwgJ2Fzc2V0cycsICdmaWdtYScpO1xuICAgIGNvbnN0IG5hbWVzID0gW2ludGVyZmFjZVJvb3ROYW1lLCByb290TmFtZV1cbiAgICAgICAgLm1hcCgobmFtZSkgPT4gc2FmZUZpZ21hQXNzZXRGb2xkZXJOYW1lKG5hbWUgfHwgJycpKVxuICAgICAgICAuZmlsdGVyKChuYW1lLCBpbmRleCwgYWxsKSA9PiBuYW1lICYmIG5hbWUgIT09ICd1bnRpdGxlZCcgJiYgYWxsLmluZGV4T2YobmFtZSkgPT09IGluZGV4KTtcbiAgICByZXR1cm4gWy4uLm5hbWVzLm1hcCgobmFtZSkgPT4gam9pbihmaWdtYVJvb3QsIG5hbWUpKSwgZmlnbWFSb290XTtcbn1cblxuZnVuY3Rpb24gZmlsZVVybFRvUGF0aCh1cmw6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKCF1cmwgfHwgIXVybC5zdGFydHNXaXRoKCdmaWxlOi8vJykpIHJldHVybiAnJztcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHVybC5yZXBsYWNlKC9eZmlsZTpcXC9cXC8vLCAnJykpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzcHJpdGVGcmFtZVV1aWQoc3ByaXRlRnJhbWU6IGFueSk6IHN0cmluZyB7XG4gICAgcmV0dXJuIFN0cmluZyhcbiAgICAgICAgc3ByaXRlRnJhbWUgJiYgKFxuICAgICAgICAgICAgc3ByaXRlRnJhbWUudXVpZCB8fFxuICAgICAgICAgICAgc3ByaXRlRnJhbWUuX3V1aWQgfHxcbiAgICAgICAgICAgIHNwcml0ZUZyYW1lLl9pZCB8fFxuICAgICAgICAgICAgc3ByaXRlRnJhbWUuX25hdGl2ZUFzc2V0ICYmIHNwcml0ZUZyYW1lLl9uYXRpdmVBc3NldC51dWlkXG4gICAgICAgICkgfHwgJydcbiAgICApO1xufVxuXG5mdW5jdGlvbiBzcHJpdGVGcmFtZU5hdGl2ZUNhbmRpZGF0ZXMoc3ByaXRlRnJhbWU6IGFueSk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCB0ZXh0dXJlID0gc3ByaXRlRnJhbWUgJiYgKHNwcml0ZUZyYW1lLnRleHR1cmUgfHwgc3ByaXRlRnJhbWUuX3RleHR1cmUpO1xuICAgIGNvbnN0IGltYWdlID0gdGV4dHVyZSAmJiAodGV4dHVyZS5pbWFnZSB8fCB0ZXh0dXJlLl9pbWFnZSk7XG4gICAgcmV0dXJuIFtcbiAgICAgICAgc3ByaXRlRnJhbWUgJiYgc3ByaXRlRnJhbWUubmF0aXZlVXJsLFxuICAgICAgICBzcHJpdGVGcmFtZSAmJiBzcHJpdGVGcmFtZS5fbmF0aXZlVXJsLFxuICAgICAgICB0ZXh0dXJlICYmIHRleHR1cmUubmF0aXZlVXJsLFxuICAgICAgICB0ZXh0dXJlICYmIHRleHR1cmUuX25hdGl2ZVVybCxcbiAgICAgICAgaW1hZ2UgJiYgaW1hZ2UubmF0aXZlVXJsLFxuICAgICAgICBpbWFnZSAmJiBpbWFnZS5fbmF0aXZlVXJsLFxuICAgIF0uZmlsdGVyKCh2KSA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycgJiYgdi5sZW5ndGggPiAwKTtcbn1cblxuZnVuY3Rpb24gc3ByaXRlRnJhbWVOYW1lKHNwcml0ZUZyYW1lOiBhbnkpOiBzdHJpbmcge1xuICAgIHJldHVybiBTdHJpbmcoc3ByaXRlRnJhbWUgJiYgKHNwcml0ZUZyYW1lLm5hbWUgfHwgc3ByaXRlRnJhbWUuX25hbWUpIHx8ICcnKS5yZXBsYWNlKC9cXC4ocG5nfGpwZ3xqcGVnKSQvaSwgJycpO1xufVxuXG5mdW5jdGlvbiBmaW5kRmlnbWFJbWFnZUJ5U3ByaXRlTmFtZShzcHJpdGVGcmFtZTogYW55LCBjdHg6IEV4cG9ydENvbnRleHQpOiBzdHJpbmcge1xuICAgIGNvbnN0IG5hbWUgPSBzcHJpdGVGcmFtZU5hbWUoc3ByaXRlRnJhbWUpO1xuICAgIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbYCR7bmFtZX0ucG5nYCwgYCR7bmFtZX0uanBnYCwgYCR7bmFtZX0uanBlZ2BdO1xuICAgIGZvciAoY29uc3QgZGlyIG9mIGN0eC5pbWFnZVNlYXJjaERpcnMgfHwgW10pIHtcbiAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBqb2luKGRpciwgZmlsZSk7XG4gICAgICAgICAgICBpZiAoZXhpc3RzU3luYyhwKSkgcmV0dXJuIHA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuICcnO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlTmF0aXZlVXJsVG9Bc3NldFBhdGgodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGlmICghdXJsKSByZXR1cm4gJyc7XG4gICAgaWYgKHVybC5zdGFydHNXaXRoKCdkYjovL2Fzc2V0cy8nKSkgcmV0dXJuIGRiVXJsVG9Bc3NldFBhdGhGb3JFeHBvcnQodXJsKTtcbiAgICBpZiAodXJsLnN0YXJ0c1dpdGgoJ2ZpbGU6Ly8nKSkgcmV0dXJuIGZpbGVVcmxUb1BhdGgodXJsKTtcbiAgICBpZiAodXJsLnN0YXJ0c1dpdGgoJy8nKSkgcmV0dXJuIHVybC5zcGxpdCgnQCcpWzBdO1xuICAgIGNvbnN0IHByb2plY3RQYXRoID0gKEVkaXRvciBhcyBhbnkpLlByb2plY3QgJiYgKEVkaXRvciBhcyBhbnkpLlByb2plY3QucGF0aDtcbiAgICBpZiAocHJvamVjdFBhdGggJiYgdXJsLnN0YXJ0c1dpdGgoJ2Fzc2V0cy8nKSkgcmV0dXJuIGpvaW4ocHJvamVjdFBhdGgsIHVybCk7XG4gICAgcmV0dXJuICcnO1xufVxuXG5mdW5jdGlvbiBzcHJpdGVGcmFtZUNyb3BSZWN0KHNwcml0ZUZyYW1lOiBhbnkpOiBhbnkgfCBudWxsIHtcbiAgICBjb25zdCByZWN0ID0gcmVhZFNwcml0ZUZyYW1lUmVjdChzcHJpdGVGcmFtZSk7XG4gICAgY29uc3QgdGV4dHVyZSA9IHNwcml0ZUZyYW1lICYmIChzcHJpdGVGcmFtZS50ZXh0dXJlIHx8IHNwcml0ZUZyYW1lLl90ZXh0dXJlKTtcbiAgICBjb25zdCByYXdXID0gdGV4dHVyZSAmJiBOdW1iZXIodGV4dHVyZS53aWR0aCkgfHwgcmVjdCAmJiByZWN0LndpZHRoIHx8IDA7XG4gICAgY29uc3QgcmF3SCA9IHRleHR1cmUgJiYgTnVtYmVyKHRleHR1cmUuaGVpZ2h0KSB8fCByZWN0ICYmIHJlY3QuaGVpZ2h0IHx8IDA7XG4gICAgaWYgKCFyZWN0IHx8IHJhd1cgPD0gMCB8fCByYXdIIDw9IDApIHJldHVybiBudWxsO1xuICAgIGlmIChNYXRoLmFicyhyZWN0LngpIDwgMC4wMSAmJiBNYXRoLmFicyhyZWN0LnkpIDwgMC4wMSAmJlxuICAgICAgICBNYXRoLmFicyhyZWN0LndpZHRoIC0gcmF3VykgPCAwLjAxICYmIE1hdGguYWJzKHJlY3QuaGVpZ2h0IC0gcmF3SCkgPCAwLjAxKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICB4OiByb3VuZEV4cG9ydE51bWJlcihyZWN0LnggLyByYXdXLCA2KSxcbiAgICAgICAgeTogcm91bmRFeHBvcnROdW1iZXIocmVjdC55IC8gcmF3SCwgNiksXG4gICAgICAgIHc6IHJvdW5kRXhwb3J0TnVtYmVyKHJlY3Qud2lkdGggLyByYXdXLCA2KSxcbiAgICAgICAgaDogcm91bmRFeHBvcnROdW1iZXIocmVjdC5oZWlnaHQgLyByYXdILCA2KSxcbiAgICAgICAgdW5pdDogJ05PUk1BTElaRUQnLFxuICAgIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRTcHJpdGVGcmFtZUltYWdlKHNwcml0ZUZyYW1lOiBhbnksIGN0eDogRXhwb3J0Q29udGV4dCk6IFByb21pc2U8eyBpbWFnZVJlZjogc3RyaW5nOyBpbWFnZU5hbWU6IHN0cmluZzsgY3JvcFJlY3Q/OiBhbnkgfT4ge1xuICAgIGlmICghc3ByaXRlRnJhbWUpIHJldHVybiB7IGltYWdlUmVmOiAnJywgaW1hZ2VOYW1lOiAnJyB9O1xuXG4gICAgbGV0IGFzc2V0VXJsID0gYXdhaXQgcXVlcnlBc3NldFVybEJ5VXVpZChzcHJpdGVGcmFtZVV1aWQoc3ByaXRlRnJhbWUpKTtcbiAgICBsZXQgZmlsZVBhdGggPSBkYlVybFRvQXNzZXRQYXRoRm9yRXhwb3J0KGFzc2V0VXJsKTtcbiAgICBpZiAoIWZpbGVQYXRoKSB7XG4gICAgICAgIGZvciAoY29uc3QgbmF0aXZlVXJsIG9mIHNwcml0ZUZyYW1lTmF0aXZlQ2FuZGlkYXRlcyhzcHJpdGVGcmFtZSkpIHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSByZXNvbHZlTmF0aXZlVXJsVG9Bc3NldFBhdGgobmF0aXZlVXJsKTtcbiAgICAgICAgICAgIGlmIChwKSB7XG4gICAgICAgICAgICAgICAgZmlsZVBhdGggPSBwO1xuICAgICAgICAgICAgICAgIGFzc2V0VXJsID0gbmF0aXZlVXJsO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmICghZmlsZVBhdGgpIHtcbiAgICAgICAgZmlsZVBhdGggPSBmaW5kRmlnbWFJbWFnZUJ5U3ByaXRlTmFtZShzcHJpdGVGcmFtZSwgY3R4KTtcbiAgICAgICAgaWYgKGZpbGVQYXRoKSBhc3NldFVybCA9IGZpbGVQYXRoO1xuICAgIH1cbiAgICBpZiAoIWZpbGVQYXRoIHx8ICFleGlzdHNTeW5jKGZpbGVQYXRoKSkge1xuICAgICAgICBjdHguc3RhdHMubWlzc2luZ0ltYWdlcysrO1xuICAgICAgICBjb25zdCBuYW1lID0gc3ByaXRlRnJhbWUubmFtZSB8fCBzcHJpdGVGcmFtZS5fbmFtZSB8fCBzcHJpdGVGcmFtZVV1aWQoc3ByaXRlRnJhbWUpIHx8ICcodW5rbm93biBzcHJpdGVGcmFtZSknO1xuICAgICAgICBjdHgud2FybmluZ3MucHVzaChg6K+75LiN5YiwIFNwcml0ZUZyYW1lIOa6kOWbvu+8miR7bmFtZX1gKTtcbiAgICAgICAgcmV0dXJuIHsgaW1hZ2VSZWY6ICcnLCBpbWFnZU5hbWU6ICcnIH07XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3QgYmFzZTY0ID0gcmVhZEZpbGVTeW5jKGZpbGVQYXRoKS50b1N0cmluZygnYmFzZTY0Jyk7XG4gICAgICAgIGNvbnN0IGltYWdlUmVmID0gaW50ZXJuRXhwb3J0SW1hZ2UoY3R4LCBiYXNlNjQpO1xuICAgICAgICBjb25zdCBpbWFnZU5hbWUgPSBiYXNlbmFtZShmaWxlUGF0aCk7XG4gICAgICAgIGNvbnN0IGNyb3BSZWN0ID0gc3ByaXRlRnJhbWVDcm9wUmVjdChzcHJpdGVGcmFtZSk7XG4gICAgICAgIHJldHVybiBjcm9wUmVjdCA/IHsgaW1hZ2VSZWYsIGltYWdlTmFtZSwgY3JvcFJlY3QgfSA6IHsgaW1hZ2VSZWYsIGltYWdlTmFtZSB9O1xuICAgIH0gY2F0Y2ggKGVycjogYW55KSB7XG4gICAgICAgIGN0eC5zdGF0cy5taXNzaW5nSW1hZ2VzKys7XG4gICAgICAgIGN0eC53YXJuaW5ncy5wdXNoKGDor7vlj5blm77niYflpLHotKXvvJoke2Fzc2V0VXJsIHx8IGZpbGVQYXRofSAoJHtlcnIgJiYgZXJyLm1lc3NhZ2UgfHwgZXJyfSlgKTtcbiAgICAgICAgcmV0dXJuIHsgaW1hZ2VSZWY6ICcnLCBpbWFnZU5hbWU6ICcnIH07XG4gICAgfVxufVxuXG5mdW5jdGlvbiBleHBvcnRTcHJpdGVCb3JkZXIoc3ByaXRlRnJhbWU6IGFueSk6IFNsaWNlOUJvcmRlciB8IG51bGwge1xuICAgIGlmICghc3ByaXRlRnJhbWUpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGJvcmRlciA9IHtcbiAgICAgICAgbGVmdDogTnVtYmVyKHNwcml0ZUZyYW1lLmluc2V0TGVmdCA/PyBzcHJpdGVGcmFtZS5ib3JkZXJMZWZ0ID8/IHNwcml0ZUZyYW1lLl9pbnNldExlZnQpIHx8IDAsXG4gICAgICAgIHJpZ2h0OiBOdW1iZXIoc3ByaXRlRnJhbWUuaW5zZXRSaWdodCA/PyBzcHJpdGVGcmFtZS5ib3JkZXJSaWdodCA/PyBzcHJpdGVGcmFtZS5faW5zZXRSaWdodCkgfHwgMCxcbiAgICAgICAgdG9wOiBOdW1iZXIoc3ByaXRlRnJhbWUuaW5zZXRUb3AgPz8gc3ByaXRlRnJhbWUuYm9yZGVyVG9wID8/IHNwcml0ZUZyYW1lLl9pbnNldFRvcCkgfHwgMCxcbiAgICAgICAgYm90dG9tOiBOdW1iZXIoc3ByaXRlRnJhbWUuaW5zZXRCb3R0b20gPz8gc3ByaXRlRnJhbWUuYm9yZGVyQm90dG9tID8/IHNwcml0ZUZyYW1lLl9pbnNldEJvdHRvbSkgfHwgMCxcbiAgICB9O1xuICAgIHJldHVybiBib3JkZXIubGVmdCB8fCBib3JkZXIucmlnaHQgfHwgYm9yZGVyLnRvcCB8fCBib3JkZXIuYm90dG9tID8gYm9yZGVyIDogbnVsbDtcbn1cblxuZnVuY3Rpb24gc3ByaXRlVHlwZU5hbWUoc3ByaXRlOiBhbnksIFNwcml0ZTogYW55KTogc3RyaW5nIHtcbiAgICBjb25zdCB0ID0gc3ByaXRlICYmIHNwcml0ZS50eXBlO1xuICAgIGlmIChTcHJpdGUgJiYgU3ByaXRlLlR5cGUpIHtcbiAgICAgICAgaWYgKHQgPT09IFNwcml0ZS5UeXBlLlNMSUNFRCkgcmV0dXJuICdTTElDRUQnO1xuICAgICAgICBpZiAodCA9PT0gU3ByaXRlLlR5cGUuVElMRUQpIHJldHVybiAnVElMRUQnO1xuICAgIH1cbiAgICByZXR1cm4gJyc7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4cG9ydFNwcml0ZShub2RlRGF0YTogYW55LCBzcHJpdGU6IGFueSwgY3R4OiBFeHBvcnRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgU3ByaXRlID0gY3R4LmNjLlNwcml0ZTtcbiAgICBjb25zdCBzcHJpdGVGcmFtZSA9IHNwcml0ZS5zcHJpdGVGcmFtZTtcbiAgICBjb25zdCB0eXBlID0gc3ByaXRlVHlwZU5hbWUoc3ByaXRlLCBTcHJpdGUpO1xuICAgIGNvbnN0IGJvcmRlciA9IGV4cG9ydFNwcml0ZUJvcmRlcihzcHJpdGVGcmFtZSk7XG4gICAgaWYgKHR5cGUgPT09ICdTTElDRUQnIHx8IGJvcmRlcikge1xuICAgICAgICBub2RlRGF0YS5jb21wb25lbnRUeXBlID0gJ1NMSUNFOSc7XG4gICAgICAgIG5vZGVEYXRhLnNsaWNlOUJvcmRlciA9IGJvcmRlciB8fCB7IGxlZnQ6IDAsIHJpZ2h0OiAwLCB0b3A6IDAsIGJvdHRvbTogMCB9O1xuICAgICAgICBjdHguc3RhdHMuc2xpY2VkU3ByaXRlcysrO1xuICAgIH1cbiAgICBjdHguc3RhdHMuc3ByaXRlcysrO1xuXG4gICAgY29uc3QgaW1hZ2UgPSBhd2FpdCByZWFkU3ByaXRlRnJhbWVJbWFnZShzcHJpdGVGcmFtZSwgY3R4KTtcbiAgICBpZiAoIWltYWdlLmltYWdlUmVmKSByZXR1cm47XG5cbiAgICBjb25zdCBmaWxsOiBhbnkgPSB7XG4gICAgICAgIHR5cGU6ICdJTUFHRScsXG4gICAgICAgIHI6IDAsXG4gICAgICAgIGc6IDAsXG4gICAgICAgIGI6IDAsXG4gICAgICAgIGE6IHJvdW5kRXhwb3J0TnVtYmVyKGNsYW1wMjU1KHNwcml0ZS5jb2xvciAmJiBzcHJpdGUuY29sb3IuYSkgLyAyNTUsIDQpLFxuICAgICAgICB2aXNpYmxlOiB0cnVlLFxuICAgICAgICBibGVuZE1vZGU6ICdOT1JNQUwnLFxuICAgICAgICBpbWFnZUJhc2U2NDogJycsXG4gICAgICAgIGltYWdlUmVmOiBpbWFnZS5pbWFnZVJlZixcbiAgICAgICAgZ3JhZGllbnRTdG9wczogW10sXG4gICAgICAgIHNjYWxlTW9kZTogdHlwZSA9PT0gJ1RJTEVEJyA/ICdUSUxFJyA6ICdGSUxMJyxcbiAgICB9O1xuICAgIGlmIChpbWFnZS5jcm9wUmVjdCkgZmlsbC5jcm9wUmVjdCA9IGltYWdlLmNyb3BSZWN0O1xuICAgIG5vZGVEYXRhLmZpbGxzID0gW2ZpbGxdO1xuICAgIG5vZGVEYXRhLmltYWdlTmFtZSA9IGltYWdlLmltYWdlTmFtZTtcblxuICAgIGNvbnN0IHRpbnQgPSBjb2xvclRvT3ZlcmxheVRpbnQoc3ByaXRlLmNvbG9yKTtcbiAgICBpZiAodGludCkgbm9kZURhdGEub3ZlcmxheVRpbnQgPSB0aW50O1xufVxuXG5mdW5jdGlvbiBleHBvcnRHcmFwaGljcyhub2RlRGF0YTogYW55LCBncmFwaGljczogYW55LCBjdHg6IEV4cG9ydENvbnRleHQpOiB2b2lkIHtcbiAgICBjb25zdCBjb2xvciA9IGdyYXBoaWNzICYmIGdyYXBoaWNzLmZpbGxDb2xvcjtcbiAgICBpZiAoIWNvbG9yKSByZXR1cm47XG4gICAgbm9kZURhdGEudHlwZSA9ICdSRUNUQU5HTEUnO1xuICAgIG5vZGVEYXRhLmZpbGxzID0gW2NvbG9yVG9GaWdtYVBhaW50KGNvbG9yKV07XG4gICAgY3R4LnN0YXRzLnNvbGlkRmlsbHMrKztcbn1cblxuZnVuY3Rpb24gbWFwSEFsaWduVG9GaWdtYShMYWJlbDogYW55LCB2YWx1ZTogbnVtYmVyKTogc3RyaW5nIHtcbiAgICBpZiAoTGFiZWwgJiYgTGFiZWwuSG9yaXpvbnRhbEFsaWduKSB7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gTGFiZWwuSG9yaXpvbnRhbEFsaWduLkNFTlRFUikgcmV0dXJuICdDRU5URVInO1xuICAgICAgICBpZiAodmFsdWUgPT09IExhYmVsLkhvcml6b250YWxBbGlnbi5SSUdIVCkgcmV0dXJuICdSSUdIVCc7XG4gICAgfVxuICAgIHJldHVybiAnTEVGVCc7XG59XG5cbmZ1bmN0aW9uIG1hcFZBbGlnblRvRmlnbWEoTGFiZWw6IGFueSwgdmFsdWU6IG51bWJlcik6IHN0cmluZyB7XG4gICAgaWYgKExhYmVsICYmIExhYmVsLlZlcnRpY2FsQWxpZ24pIHtcbiAgICAgICAgaWYgKHZhbHVlID09PSBMYWJlbC5WZXJ0aWNhbEFsaWduLkNFTlRFUikgcmV0dXJuICdDRU5URVInO1xuICAgICAgICBpZiAodmFsdWUgPT09IExhYmVsLlZlcnRpY2FsQWxpZ24uQk9UVE9NKSByZXR1cm4gJ0JPVFRPTSc7XG4gICAgfVxuICAgIHJldHVybiAnVE9QJztcbn1cblxuZnVuY3Rpb24gZGVjb2RlQmFzaWNIdG1sRW50aXRpZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGV4dFxuICAgICAgICAucmVwbGFjZSgvJmx0Oy9nLCAnPCcpXG4gICAgICAgIC5yZXBsYWNlKC8mZ3Q7L2csICc+JylcbiAgICAgICAgLnJlcGxhY2UoLyZhbXA7L2csICcmJylcbiAgICAgICAgLnJlcGxhY2UoLyZxdW90Oy9nLCAnXCInKVxuICAgICAgICAucmVwbGFjZSgvJiMzOTsvZywgXCInXCIpO1xufVxuXG5mdW5jdGlvbiByaWNoVGV4dFRvUGxhaW4odGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gZGVjb2RlQmFzaWNIdG1sRW50aXRpZXMoU3RyaW5nKHRleHQgfHwgJycpXG4gICAgICAgIC5yZXBsYWNlKC88YnJcXHMqXFwvPz4vaWcsICdcXG4nKVxuICAgICAgICAucmVwbGFjZSgvPFxcLz9bXj5dKz4vZywgJycpKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VGb250Rm9yRmlnbWEobGFiZWw6IGFueSk6IHsgZmFtaWx5OiBzdHJpbmc7IHdlaWdodDogc3RyaW5nIH0ge1xuICAgIGNvbnN0IGZvbnQgPSBsYWJlbCAmJiBsYWJlbC5mb250O1xuICAgIGxldCByYXcgPSBTdHJpbmcoZm9udCAmJiAoZm9udC5uYW1lIHx8IGZvbnQuX25hbWUpIHx8ICcnKTtcbiAgICByYXcgPSByYXcucmVwbGFjZSgvXFwuKHR0ZnxvdGZ8dHRjKSQvaSwgJycpLnJlcGxhY2UoL19MQUJFTCQvaSwgJycpLnRyaW0oKTtcbiAgICBpZiAoIXJhdyB8fCByYXcgPT09ICdkZWZhdWx0Jykge1xuICAgICAgICByZXR1cm4geyBmYW1pbHk6ICdBcmlhbCcsIHdlaWdodDogbGFiZWwgJiYgbGFiZWwuaXNCb2xkID8gJ0JvbGQnIDogJ1JlZ3VsYXInIH07XG4gICAgfVxuICAgIGNvbnN0IHdlaWdodHMgPSBbJ0V4dHJhQm9sZCcsICdTZW1pQm9sZCcsICdEZW1pQm9sZCcsICdNZWRpdW0nLCAnUmVndWxhcicsICdMaWdodCcsICdCbGFjaycsICdIZWF2eScsICdCb2xkJ107XG4gICAgZm9yIChjb25zdCB3ZWlnaHQgb2Ygd2VpZ2h0cykge1xuICAgICAgICBjb25zdCByZSA9IG5ldyBSZWdFeHAoYFstX1xcXFxzXT8ke3dlaWdodH0kYCwgJ2knKTtcbiAgICAgICAgaWYgKHJlLnRlc3QocmF3KSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBmYW1pbHk6IHJhdy5yZXBsYWNlKHJlLCAnJykudHJpbSgpIHx8IHJhdyxcbiAgICAgICAgICAgICAgICB3ZWlnaHQsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB7IGZhbWlseTogcmF3LCB3ZWlnaHQ6IGxhYmVsICYmIGxhYmVsLmlzQm9sZCA/ICdCb2xkJyA6ICdSZWd1bGFyJyB9O1xufVxuXG5mdW5jdGlvbiByZWFkUmljaFRleHRDb21wYW5pb25TaGFkb3cocmljaFRleHQ6IGFueSwgUmljaFRleHQ6IGFueSk6IGFueSB8IG51bGwge1xuICAgIGNvbnN0IG1haW5Ob2RlID0gcmljaFRleHQgJiYgcmljaFRleHQubm9kZTtcbiAgICBjb25zdCBhdXRob3JlZE5vZGUgPSBtYWluTm9kZSAmJiBtYWluTm9kZS5wYXJlbnQ7XG4gICAgaWYgKCFpc0Z0b2NSaWNoVGV4dFJlbmRlcmVyTm9kZShtYWluTm9kZSkgfHwgIWF1dGhvcmVkTm9kZSkgcmV0dXJuIG51bGw7XG4gICAgY29uc3Qgc2hhZG93Tm9kZSA9IGZpbmRGdG9jUmljaFRleHRTaGFkb3dOb2RlKGF1dGhvcmVkTm9kZSwgUmljaFRleHQpO1xuICAgIGNvbnN0IHNoYWRvd1JpY2hUZXh0ID0gc2hhZG93Tm9kZSAmJiBzaGFkb3dOb2RlLmdldENvbXBvbmVudCA/IHNoYWRvd05vZGUuZ2V0Q29tcG9uZW50KFJpY2hUZXh0KSA6IG51bGw7XG4gICAgaWYgKCFjb21wb25lbnRFbmFibGVkKHNoYWRvd1JpY2hUZXh0KSB8fCBzaGFkb3dOb2RlLmFjdGl2ZSA9PT0gZmFsc2UpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IG1haW5Qb3NpdGlvbiA9IHJlYWROb2RlUG9zaXRpb24obWFpbk5vZGUpO1xuICAgIGNvbnN0IHNoYWRvd1Bvc2l0aW9uID0gcmVhZE5vZGVQb3NpdGlvbihzaGFkb3dOb2RlKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBjb2xvcjogc25hcHNob3RDb2xvcihzaGFkb3dSaWNoVGV4dC5mb250Q29sb3IgfHwgc2hhZG93UmljaFRleHQuY29sb3IpLFxuICAgICAgICBvZmZzZXRYOiBzaGFkb3dQb3NpdGlvbi54IC0gbWFpblBvc2l0aW9uLngsXG4gICAgICAgIG9mZnNldFk6IC0oc2hhZG93UG9zaXRpb24ueSAtIG1haW5Qb3NpdGlvbi55KSxcbiAgICAgICAgYmx1cjogMCxcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBleHBvcnRMYWJlbChub2RlRGF0YTogYW55LCBsYWJlbDogYW55LCByaWNoOiBib29sZWFuLCBjdHg6IEV4cG9ydENvbnRleHQpOiB2b2lkIHtcbiAgICBjb25zdCBMYWJlbCA9IGN0eC5jYy5MYWJlbDtcbiAgICBjb25zdCB0ZXh0ID0gU3RyaW5nKGxhYmVsLnN0cmluZyB8fCAnJyk7XG4gICAgbm9kZURhdGEuY2hhcmFjdGVycyA9IHJpY2ggPyByaWNoVGV4dFRvUGxhaW4odGV4dCkgOiB0ZXh0O1xuICAgIG5vZGVEYXRhLmZvbnRTaXplID0gcm91bmRFeHBvcnROdW1iZXIoTnVtYmVyKGxhYmVsLmZvbnRTaXplKSB8fCAwKTtcbiAgICBjb25zdCBsaW5lSGVpZ2h0ID0gTnVtYmVyKGxhYmVsLmxpbmVIZWlnaHQpIHx8IDA7XG4gICAgbm9kZURhdGEubGluZUhlaWdodCA9IE1hdGguYWJzKGxpbmVIZWlnaHQgLSBub2RlRGF0YS5mb250U2l6ZSkgPCAwLjAxID8gMCA6IHJvdW5kRXhwb3J0TnVtYmVyKGxpbmVIZWlnaHQpO1xuICAgIGNvbnN0IHBhcnNlZEZvbnQgPSBwYXJzZUZvbnRGb3JGaWdtYShsYWJlbCk7XG4gICAgbm9kZURhdGEuZm9udEZhbWlseSA9IHBhcnNlZEZvbnQuZmFtaWx5O1xuICAgIG5vZGVEYXRhLmZvbnRXZWlnaHQgPSBwYXJzZWRGb250LndlaWdodDtcbiAgICBub2RlRGF0YS50ZXh0QWxpZ25Ib3Jpem9udGFsID0gbWFwSEFsaWduVG9GaWdtYShMYWJlbCwgbGFiZWwuaG9yaXpvbnRhbEFsaWduKTtcbiAgICBub2RlRGF0YS50ZXh0QWxpZ25WZXJ0aWNhbCA9IG1hcFZBbGlnblRvRmlnbWEoTGFiZWwsIGxhYmVsLnZlcnRpY2FsQWxpZ24pO1xuICAgIG5vZGVEYXRhLmxldHRlclNwYWNpbmcgPSByb3VuZEV4cG9ydE51bWJlcihOdW1iZXIobGFiZWwuc3BhY2luZ1gpIHx8IDApO1xuICAgIG5vZGVEYXRhLnRleHREZWNvcmF0aW9uID0gbGFiZWwuaXNVbmRlcmxpbmUgPyAnVU5ERVJMSU5FJyA6ICdOT05FJztcbiAgICBub2RlRGF0YS50ZXh0Q2FzZSA9ICdPUklHSU5BTCc7XG5cbiAgICBpZiAoIXJpY2ggJiYgbGFiZWwuZW5hYmxlV3JhcFRleHQgPT09IGZhbHNlKSB7XG4gICAgICAgIG5vZGVEYXRhLnRleHRBdXRvUmVzaXplID0gJ1dJRFRIX0FORF9IRUlHSFQnO1xuICAgIH0gZWxzZSBpZiAoIXJpY2ggJiYgTGFiZWwgJiYgTGFiZWwuT3ZlcmZsb3cgJiYgbGFiZWwub3ZlcmZsb3cgPT09IExhYmVsLk92ZXJmbG93LkNMQU1QKSB7XG4gICAgICAgIG5vZGVEYXRhLnRleHRBdXRvUmVzaXplID0gJ1RSVU5DQVRFJztcbiAgICAgICAgbm9kZURhdGEudGV4dFRydW5jYXRpb24gPSAnRElTQUJMRUQnO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG5vZGVEYXRhLnRleHRBdXRvUmVzaXplID0gJ05PTkUnO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbG9yID0gcmljaCA/IGxhYmVsLmZvbnRDb2xvciA6IGxhYmVsLmNvbG9yO1xuICAgIG5vZGVEYXRhLmZpbGxzID0gW2NvbG9yVG9GaWdtYVBhaW50KGNvbG9yKV07XG5cbiAgICBpZiAoIXJpY2ggJiYgbGFiZWwuZW5hYmxlT3V0bGluZSkge1xuICAgICAgICBub2RlRGF0YS5zdHJva2VzID0gW2NvbG9yVG9GaWdtYVBhaW50KGxhYmVsLm91dGxpbmVDb2xvciwgeyByOiAwLCBnOiAwLCBiOiAwLCBhOiAyNTUgfSldO1xuICAgICAgICBub2RlRGF0YS5zdHJva2VXZWlnaHQgPSByb3VuZEV4cG9ydE51bWJlcihOdW1iZXIobGFiZWwub3V0bGluZVdpZHRoKSB8fCAxKTtcbiAgICAgICAgbm9kZURhdGEuc3Ryb2tlQWxpZ24gPSAnT1VUU0lERSc7XG4gICAgfVxuXG4gICAgY29uc3QgcmljaFNoYWRvdyA9IHJpY2ggPyByZWFkUmljaFRleHRDb21wYW5pb25TaGFkb3cobGFiZWwsIGN0eC5jYy5SaWNoVGV4dCkgOiBudWxsO1xuICAgIGlmICgoIXJpY2ggJiYgbGFiZWwuZW5hYmxlU2hhZG93KSB8fCByaWNoU2hhZG93KSB7XG4gICAgICAgIGNvbnN0IG9mZiA9IHJpY2hTaGFkb3dcbiAgICAgICAgICAgID8geyB4OiByaWNoU2hhZG93Lm9mZnNldFgsIHk6IC1yaWNoU2hhZG93Lm9mZnNldFkgfVxuICAgICAgICAgICAgOiAobGFiZWwuc2hhZG93T2Zmc2V0IHx8IHsgeDogMCwgeTogMCB9KTtcbiAgICAgICAgY29uc3Qgc2hhZG93Q29sb3IgPSByaWNoU2hhZG93ID8gcmljaFNoYWRvdy5jb2xvciA6IGxhYmVsLnNoYWRvd0NvbG9yO1xuICAgICAgICBjb25zdCBzaGFkb3dCbHVyID0gcmljaFNoYWRvdyA/IHJpY2hTaGFkb3cuYmx1ciA6IGxhYmVsLnNoYWRvd0JsdXI7XG4gICAgICAgIG5vZGVEYXRhLmVmZmVjdHMgPSBbYnVpbGRGaWdtYURyb3BTaGFkb3dFZmZlY3Qoc2hhZG93Q29sb3IsIG9mZiwgc2hhZG93Qmx1cildO1xuICAgIH1cbiAgICBjdHguc3RhdHMudGV4dHMrKztcbn1cblxuZnVuY3Rpb24gZXhwb3J0Q29uc3RyYWludHMod2lkZ2V0OiBhbnkpOiBhbnkgfCBudWxsIHtcbiAgICBpZiAoIWNvbXBvbmVudEVuYWJsZWQod2lkZ2V0KSkgcmV0dXJuIG51bGw7XG4gICAgbGV0IGhvcml6b250YWwgPSAnTEVGVCc7XG4gICAgbGV0IHZlcnRpY2FsID0gJ1RPUCc7XG4gICAgaWYgKHdpZGdldC5pc0FsaWduTGVmdCAmJiB3aWRnZXQuaXNBbGlnblJpZ2h0KSBob3Jpem9udGFsID0gJ0xFRlRfUklHSFQnO1xuICAgIGVsc2UgaWYgKHdpZGdldC5pc0FsaWduUmlnaHQpIGhvcml6b250YWwgPSAnUklHSFQnO1xuICAgIGVsc2UgaWYgKHdpZGdldC5pc0FsaWduSG9yaXpvbnRhbENlbnRlcikgaG9yaXpvbnRhbCA9ICdDRU5URVInO1xuXG4gICAgaWYgKHdpZGdldC5pc0FsaWduVG9wICYmIHdpZGdldC5pc0FsaWduQm90dG9tKSB2ZXJ0aWNhbCA9ICdUT1BfQk9UVE9NJztcbiAgICBlbHNlIGlmICh3aWRnZXQuaXNBbGlnbkJvdHRvbSkgdmVydGljYWwgPSAnQk9UVE9NJztcbiAgICBlbHNlIGlmICh3aWRnZXQuaXNBbGlnblZlcnRpY2FsQ2VudGVyKSB2ZXJ0aWNhbCA9ICdDRU5URVInO1xuICAgIHJldHVybiB7IGhvcml6b250YWwsIHZlcnRpY2FsIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4cG9ydE1hc2tJbmZvKG1hc2tOb2RlOiBhbnksIHBhcmVudFc6IG51bWJlciwgcGFyZW50SDogbnVtYmVyLCBjdHg6IEV4cG9ydENvbnRleHQpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHsgVUlUcmFuc2Zvcm0sIE1hc2ssIFNwcml0ZSB9ID0gY3R4LmNjO1xuICAgIGNvbnN0IHVpID0gbWFza05vZGUuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICBjb25zdCBzaXplID0gcmVhZFVpU2l6ZSh1aSk7XG4gICAgY29uc3QgdHJhbnNmb3JtID0gZXhwb3J0Tm9kZVRyYW5zZm9ybShtYXNrTm9kZSwgc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQsIHBhcmVudFcsIHBhcmVudEgsIGZhbHNlLCB1aSk7XG4gICAgY29uc3QgbWFzayA9IG1hc2tOb2RlLmdldENvbXBvbmVudChNYXNrKTtcbiAgICBjb25zdCBzcHJpdGUgPSBtYXNrTm9kZS5nZXRDb21wb25lbnQoU3ByaXRlKTtcbiAgICBjb25zdCBpbWFnZSA9IGF3YWl0IHJlYWRTcHJpdGVGcmFtZUltYWdlKChzcHJpdGUgJiYgc3ByaXRlLnNwcml0ZUZyYW1lKSB8fCAobWFzayAmJiBtYXNrLnNwcml0ZUZyYW1lKSwgY3R4KTtcbiAgICByZXR1cm4ge1xuICAgICAgICBraW5kOiAnSU1BR0UnLFxuICAgICAgICBtYXNrVHlwZTogJ0FMUEhBJyxcbiAgICAgICAgbmFtZTogbWFza05vZGUubmFtZSxcbiAgICAgICAgeDogdHJhbnNmb3JtLngsXG4gICAgICAgIHk6IHRyYW5zZm9ybS55LFxuICAgICAgICB3aWR0aDogdHJhbnNmb3JtLndpZHRoLFxuICAgICAgICBoZWlnaHQ6IHRyYW5zZm9ybS5oZWlnaHQsXG4gICAgICAgIHJvdGF0aW9uOiB0cmFuc2Zvcm0ucm90YXRpb24sXG4gICAgICAgIGltYWdlUmVmOiBpbWFnZS5pbWFnZVJlZixcbiAgICAgICAgaW1hZ2VOYW1lOiBpbWFnZS5pbWFnZU5hbWUsXG4gICAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZXhwb3J0Tm9kZVRvRmlnbWEoXG4gICAgbm9kZTogYW55LFxuICAgIHBhcmVudFc6IG51bWJlcixcbiAgICBwYXJlbnRIOiBudW1iZXIsXG4gICAgaXNSb290OiBib29sZWFuLFxuICAgIGN0eDogRXhwb3J0Q29udGV4dCxcbiAgICBzZWxlY3RlZEZpbHRlcj86IFNldDxzdHJpbmc+IHwgbnVsbCxcbiAgICBhbmNlc3RvckZpbHRlcj86IFNldDxzdHJpbmc+IHwgbnVsbFxuKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCB7IFVJVHJhbnNmb3JtLCBVSU9wYWNpdHksIFNwcml0ZSwgTGFiZWwsIFJpY2hUZXh0LCBNYXNrLCBCdXR0b24sIFdpZGdldCwgR3JhcGhpY3MgfSA9IGN0eC5jYztcbiAgICBjb25zdCB1aSA9IG5vZGUuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICBjb25zdCBzaXplID0gcmVhZFVpU2l6ZSh1aSk7XG4gICAgY29uc3QgbG9naWNhbFRleHQgPSByZXNvbHZlTG9naWNhbFRleHRUYXJnZXQobm9kZSwgTGFiZWwsIFJpY2hUZXh0KTtcbiAgICBjb25zdCBsYWJlbCA9IGxvZ2ljYWxUZXh0ICYmIGxvZ2ljYWxUZXh0LmtpbmQgPT09ICdsYWJlbCcgPyBsb2dpY2FsVGV4dC5jb21wb25lbnQgOiBudWxsO1xuICAgIGNvbnN0IHJpY2hUZXh0ID0gbG9naWNhbFRleHQgJiYgbG9naWNhbFRleHQua2luZCA9PT0gJ3JpY2hUZXh0JyA/IGxvZ2ljYWxUZXh0LmNvbXBvbmVudCA6IG51bGw7XG4gICAgY29uc3Qgc3ByaXRlID0gbm9kZS5nZXRDb21wb25lbnQoU3ByaXRlKTtcbiAgICBjb25zdCBncmFwaGljcyA9IEdyYXBoaWNzID8gbm9kZS5nZXRDb21wb25lbnQoR3JhcGhpY3MpIDogbnVsbDtcbiAgICBjb25zdCB0eXBlID0gY29tcG9uZW50RW5hYmxlZChsYWJlbCkgfHwgY29tcG9uZW50RW5hYmxlZChyaWNoVGV4dClcbiAgICAgICAgPyAnVEVYVCdcbiAgICAgICAgOiAoY29tcG9uZW50RW5hYmxlZChzcHJpdGUpIHx8IGNvbXBvbmVudEVuYWJsZWQoZ3JhcGhpY3MpID8gJ1JFQ1RBTkdMRScgOiAnRlJBTUUnKTtcbiAgICBjb25zdCB0cmFuc2Zvcm0gPSBleHBvcnROb2RlVHJhbnNmb3JtKG5vZGUsIHNpemUud2lkdGgsIHNpemUuaGVpZ2h0LCBwYXJlbnRXLCBwYXJlbnRILCBpc1Jvb3QsIHVpKTtcbiAgICBjb25zdCBub2RlRGF0YSA9IGRlZmF1bHRGaWdtYU5vZGUobm9kZSwgdHlwZSwgdHJhbnNmb3JtKTtcbiAgICBjdHguc3RhdHMubm9kZXMrKztcblxuICAgIGNvbnN0IG9wYWNpdHkgPSBub2RlLmdldENvbXBvbmVudChVSU9wYWNpdHkpO1xuICAgIGlmIChjb21wb25lbnRFbmFibGVkKG9wYWNpdHkpKSB7XG4gICAgICAgIG5vZGVEYXRhLm9wYWNpdHkgPSByb3VuZEV4cG9ydE51bWJlcigoTnVtYmVyKG9wYWNpdHkub3BhY2l0eSkgfHwgMjU1KSAvIDI1NSwgNCk7XG4gICAgfVxuXG4gICAgY29uc3Qgd2lkZ2V0ID0gbm9kZS5nZXRDb21wb25lbnQoV2lkZ2V0KTtcbiAgICBjb25zdCBjb25zdHJhaW50cyA9IGV4cG9ydENvbnN0cmFpbnRzKHdpZGdldCk7XG4gICAgaWYgKGNvbnN0cmFpbnRzKSBub2RlRGF0YS5jb25zdHJhaW50cyA9IGNvbnN0cmFpbnRzO1xuXG4gICAgY29uc3QgbWFzayA9IG5vZGUuZ2V0Q29tcG9uZW50KE1hc2spO1xuICAgIGlmIChjb21wb25lbnRFbmFibGVkKG1hc2spICYmIG1hc2sudHlwZSA9PT0gTWFzay5UeXBlLkdSQVBISUNTX1JFQ1QpIHtcbiAgICAgICAgbm9kZURhdGEuY2xpcHNDb250ZW50ID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBjb25zdCBidXR0b24gPSBub2RlLmdldENvbXBvbmVudChCdXR0b24pO1xuICAgIGlmIChjb21wb25lbnRFbmFibGVkKGJ1dHRvbikgJiYgdHlwZSAhPT0gJ1RFWFQnKSB7XG4gICAgICAgIG5vZGVEYXRhLmNvbXBvbmVudFR5cGUgPSAnQlVUVE9OJztcbiAgICAgICAgY3R4LnN0YXRzLmJ1dHRvbnMrKztcbiAgICB9XG5cbiAgICBpZiAoY29tcG9uZW50RW5hYmxlZChsYWJlbCkpIHtcbiAgICAgICAgZXhwb3J0TGFiZWwobm9kZURhdGEsIGxhYmVsLCBmYWxzZSwgY3R4KTtcbiAgICB9IGVsc2UgaWYgKGNvbXBvbmVudEVuYWJsZWQocmljaFRleHQpKSB7XG4gICAgICAgIGV4cG9ydExhYmVsKG5vZGVEYXRhLCByaWNoVGV4dCwgdHJ1ZSwgY3R4KTtcbiAgICB9IGVsc2UgaWYgKGNvbXBvbmVudEVuYWJsZWQoc3ByaXRlKSkge1xuICAgICAgICBhd2FpdCBleHBvcnRTcHJpdGUobm9kZURhdGEsIHNwcml0ZSwgY3R4KTtcbiAgICB9IGVsc2UgaWYgKGNvbXBvbmVudEVuYWJsZWQoZ3JhcGhpY3MpKSB7XG4gICAgICAgIGV4cG9ydEdyYXBoaWNzKG5vZGVEYXRhLCBncmFwaGljcywgY3R4KTtcbiAgICB9XG5cbiAgICBjb25zdCBjaGlsZHJlbiA9IG5vZGUuY2hpbGRyZW4gfHwgW107XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuICAgICAgICBpZiAoaXNGdG9jVGV4dEhlbHBlck5vZGUoY2hpbGQpIHx8IGlzQ3JlYXRvclJpY2hUZXh0UnVudGltZU5vZGUoY2hpbGQpKSBjb250aW51ZTtcbiAgICAgICAgbGV0IGNoaWxkU2VsZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgbGV0IGNoaWxkSXNBbmNlc3RvciA9IGZhbHNlO1xuICAgICAgICBpZiAoc2VsZWN0ZWRGaWx0ZXIpIHtcbiAgICAgICAgICAgIGNoaWxkU2VsZWN0ZWQgPSBzZWxlY3RlZEZpbHRlci5oYXMoY2hpbGQudXVpZCk7XG4gICAgICAgICAgICBjaGlsZElzQW5jZXN0b3IgPSAhIWFuY2VzdG9yRmlsdGVyICYmIGFuY2VzdG9yRmlsdGVyLmhhcyhjaGlsZC51dWlkKTtcbiAgICAgICAgICAgIGlmICghY2hpbGRTZWxlY3RlZCAmJiAhY2hpbGRJc0FuY2VzdG9yKSBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZE1hc2sgPSBjaGlsZC5nZXRDb21wb25lbnQgJiYgY2hpbGQuZ2V0Q29tcG9uZW50KE1hc2spO1xuICAgICAgICBjb25zdCBpc0ltYWdlTWFzayA9IGNvbXBvbmVudEVuYWJsZWQoY2hpbGRNYXNrKSAmJlxuICAgICAgICAgICAgY2hpbGRNYXNrLnR5cGUgIT09IE1hc2suVHlwZS5HUkFQSElDU19SRUNUICYmXG4gICAgICAgICAgICAhbm9kZURhdGEubWFzaztcbiAgICAgICAgaWYgKGlzSW1hZ2VNYXNrKSB7XG4gICAgICAgICAgICBjb25zdCBtYXNrTm9kZURhdGEgPSBhd2FpdCBleHBvcnROb2RlVG9GaWdtYShcbiAgICAgICAgICAgICAgICBjaGlsZCxcbiAgICAgICAgICAgICAgICBzaXplLndpZHRoLFxuICAgICAgICAgICAgICAgIHNpemUuaGVpZ2h0LFxuICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgIGN0eCxcbiAgICAgICAgICAgICAgICBjaGlsZFNlbGVjdGVkID8gbnVsbCA6IHNlbGVjdGVkRmlsdGVyLFxuICAgICAgICAgICAgICAgIGNoaWxkU2VsZWN0ZWQgPyBudWxsIDogYW5jZXN0b3JGaWx0ZXJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBtYXNrSW5mbyA9IGF3YWl0IGV4cG9ydE1hc2tJbmZvKGNoaWxkLCBzaXplLndpZHRoLCBzaXplLmhlaWdodCwgY3R4KTtcbiAgICAgICAgICAgIG5vZGVEYXRhLm1hc2sgPSBtYXNrSW5mbztcbiAgICAgICAgICAgIGN0eC5zdGF0cy5tYXNrcysrO1xuICAgICAgICAgICAgZm9yIChjb25zdCBncmFuZERhdGEgb2YgKG1hc2tOb2RlRGF0YS5jaGlsZHJlbiB8fCBbXSkpIHtcbiAgICAgICAgICAgICAgICBncmFuZERhdGEueCA9IHJvdW5kRXhwb3J0TnVtYmVyKChncmFuZERhdGEueCB8fCAwKSArIChtYXNrSW5mby54IHx8IDApKTtcbiAgICAgICAgICAgICAgICBncmFuZERhdGEueSA9IHJvdW5kRXhwb3J0TnVtYmVyKChncmFuZERhdGEueSB8fCAwKSArIChtYXNrSW5mby55IHx8IDApKTtcbiAgICAgICAgICAgICAgICBub2RlRGF0YS5jaGlsZHJlbi5wdXNoKGdyYW5kRGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBub2RlRGF0YS5jaGlsZHJlbi5wdXNoKGF3YWl0IGV4cG9ydE5vZGVUb0ZpZ21hKFxuICAgICAgICAgICAgY2hpbGQsXG4gICAgICAgICAgICBzaXplLndpZHRoLFxuICAgICAgICAgICAgc2l6ZS5oZWlnaHQsXG4gICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgIGN0eCxcbiAgICAgICAgICAgIGNoaWxkU2VsZWN0ZWQgPyBudWxsIDogc2VsZWN0ZWRGaWx0ZXIsXG4gICAgICAgICAgICBjaGlsZFNlbGVjdGVkID8gbnVsbCA6IGFuY2VzdG9yRmlsdGVyXG4gICAgICAgICkpO1xuICAgIH1cblxuICAgIHJldHVybiBub2RlRGF0YTtcbn1cblxuZnVuY3Rpb24gZmluZE5vZGVCeVV1aWQobm9kZTogYW55LCB1dWlkOiBzdHJpbmcpOiBhbnkge1xuICAgIGlmICghbm9kZSB8fCAhdXVpZCkgcmV0dXJuIG51bGw7XG4gICAgaWYgKG5vZGUudXVpZCA9PT0gdXVpZCkgcmV0dXJuIG5vZGU7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiAobm9kZS5jaGlsZHJlbiB8fCBbXSkpIHtcbiAgICAgICAgY29uc3QgZm91bmQgPSBmaW5kTm9kZUJ5VXVpZChjaGlsZCwgdXVpZCk7XG4gICAgICAgIGlmIChmb3VuZCkgcmV0dXJuIGZvdW5kO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gZmluZEZpcnN0Tm9kZUJ5TmFtZShub2RlOiBhbnksIG5hbWU6IHN0cmluZyk6IGFueSB7XG4gICAgaWYgKCFub2RlIHx8ICFuYW1lKSByZXR1cm4gbnVsbDtcbiAgICBpZiAobm9kZS5uYW1lID09PSBuYW1lKSByZXR1cm4gbm9kZTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIChub2RlLmNoaWxkcmVuIHx8IFtdKSkge1xuICAgICAgICBjb25zdCBmb3VuZCA9IGZpbmRGaXJzdE5vZGVCeU5hbWUoY2hpbGQsIG5hbWUpO1xuICAgICAgICBpZiAoZm91bmQpIHJldHVybiBmb3VuZDtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkU2NlbmVOb2RlUGF0aChub2RlOiBhbnkpOiBzdHJpbmcge1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGxldCBjdXIgPSBub2RlO1xuICAgIHdoaWxlIChjdXIgJiYgY3VyLm5hbWUpIHtcbiAgICAgICAgcGFydHMudW5zaGlmdChjdXIubmFtZSk7XG4gICAgICAgIGN1ciA9IGN1ci5wYXJlbnQ7XG4gICAgfVxuICAgIHJldHVybiBwYXJ0cy5qb2luKCcvJyk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUmVsYXRpdmVOb2RlUGF0aChub2RlOiBhbnksIHJvb3Q6IGFueSk6IHN0cmluZyB7XG4gICAgY29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGN1ciA9IG5vZGU7XG4gICAgd2hpbGUgKGN1ciAmJiBjdXIgIT09IHJvb3QpIHtcbiAgICAgICAgaWYgKGN1ci5uYW1lKSBwYXJ0cy51bnNoaWZ0KGN1ci5uYW1lKTtcbiAgICAgICAgY3VyID0gY3VyLnBhcmVudDtcbiAgICB9XG4gICAgaWYgKHJvb3QgJiYgcm9vdC5uYW1lKSBwYXJ0cy51bnNoaWZ0KHJvb3QubmFtZSk7XG4gICAgcmV0dXJuIHBhcnRzLmpvaW4oJy8nKTtcbn1cblxuZnVuY3Rpb24gcmVhZENvbXBvbmVudE5hbWUoY29tcG9uZW50OiBhbnkpOiBzdHJpbmcge1xuICAgIHJldHVybiBTdHJpbmcoY29tcG9uZW50ICYmIChcbiAgICAgICAgY29tcG9uZW50LmNvbnN0cnVjdG9yICYmIGNvbXBvbmVudC5jb25zdHJ1Y3Rvci5uYW1lIHx8XG4gICAgICAgIGNvbXBvbmVudC5fX2NsYXNzbmFtZV9fIHx8XG4gICAgICAgIGNvbXBvbmVudC5uYW1lIHx8XG4gICAgICAgICcnXG4gICAgKSB8fCAnJyk7XG59XG5cbmZ1bmN0aW9uIGdldFVpQW5jZXN0b3JQYXRoKG5vZGU6IGFueSwgVUlUcmFuc2Zvcm06IGFueSwgaW5jbHVkZVNlbGY6IGJvb2xlYW4pOiBhbnlbXSB7XG4gICAgY29uc3QgcGF0aDogYW55W10gPSBbXTtcbiAgICBsZXQgY3VyID0gaW5jbHVkZVNlbGYgPyBub2RlIDogbm9kZSAmJiBub2RlLnBhcmVudDtcbiAgICB3aGlsZSAoY3VyKSB7XG4gICAgICAgIGlmIChjdXIuZ2V0Q29tcG9uZW50ICYmIGN1ci5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pKSBwYXRoLnB1c2goY3VyKTtcbiAgICAgICAgY3VyID0gY3VyLnBhcmVudDtcbiAgICB9XG4gICAgcmV0dXJuIHBhdGgucmV2ZXJzZSgpO1xufVxuXG5mdW5jdGlvbiBmaW5kQ29tbW9uVWlBbmNlc3Rvcihub2RlczogYW55W10sIFVJVHJhbnNmb3JtOiBhbnkpOiBhbnkge1xuICAgIGlmICghbm9kZXMgfHwgbm9kZXMubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgICBsZXQgY29tbW9uID0gZ2V0VWlBbmNlc3RvclBhdGgobm9kZXNbMF0sIFVJVHJhbnNmb3JtLCB0cnVlKTtcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBnZXRVaUFuY2VzdG9yUGF0aChub2Rlc1tpXSwgVUlUcmFuc2Zvcm0sIHRydWUpO1xuICAgICAgICBsZXQgbGVuID0gMDtcbiAgICAgICAgY29uc3QgbWF4ID0gTWF0aC5taW4oY29tbW9uLmxlbmd0aCwgcGF0aC5sZW5ndGgpO1xuICAgICAgICB3aGlsZSAobGVuIDwgbWF4ICYmIGNvbW1vbltsZW5dID09PSBwYXRoW2xlbl0pIGxlbisrO1xuICAgICAgICBjb21tb24gPSBjb21tb24uc2xpY2UoMCwgbGVuKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbW1vbi5sZW5ndGggPiAwID8gY29tbW9uW2NvbW1vbi5sZW5ndGggLSAxXSA6IG51bGw7XG59XG5cbmZ1bmN0aW9uIGZpbmRJbnRlcmZhY2VSb290KG5vZGU6IGFueSwgY2FudmFzOiBhbnksIFVJVHJhbnNmb3JtOiBhbnkpOiBhbnkge1xuICAgIGlmICghbm9kZSkgcmV0dXJuIG51bGw7XG4gICAgaWYgKCFjYW52YXMpIHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGdldFVpQW5jZXN0b3JQYXRoKG5vZGUsIFVJVHJhbnNmb3JtLCB0cnVlKTtcbiAgICAgICAgcmV0dXJuIHBhdGgubGVuZ3RoID4gMCA/IHBhdGhbMF0gOiBub2RlO1xuICAgIH1cbiAgICBsZXQgY3VyID0gbm9kZTtcbiAgICBsZXQgbGFzdCA9IG5vZGU7XG4gICAgd2hpbGUgKGN1ciAmJiBjdXIgIT09IGNhbnZhcykge1xuICAgICAgICBsYXN0ID0gY3VyO1xuICAgICAgICBjdXIgPSBjdXIucGFyZW50O1xuICAgIH1cbiAgICByZXR1cm4gY3VyID09PSBjYW52YXMgPyBsYXN0IDogbnVsbDtcbn1cblxuZnVuY3Rpb24gY29sbGVjdEFuY2VzdG9yVXVpZFNldChzZWxlY3RlZE5vZGVzOiBhbnlbXSwgcm9vdDogYW55KTogU2V0PHN0cmluZz4ge1xuICAgIGNvbnN0IGFuY2VzdG9ycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGZvciAoY29uc3Qgc2VsZWN0ZWQgb2Ygc2VsZWN0ZWROb2Rlcykge1xuICAgICAgICBsZXQgY3VyID0gc2VsZWN0ZWQgJiYgc2VsZWN0ZWQucGFyZW50O1xuICAgICAgICB3aGlsZSAoY3VyKSB7XG4gICAgICAgICAgICBhbmNlc3RvcnMuYWRkKGN1ci51dWlkKTtcbiAgICAgICAgICAgIGlmIChjdXIgPT09IHJvb3QpIGJyZWFrO1xuICAgICAgICAgICAgY3VyID0gY3VyLnBhcmVudDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYW5jZXN0b3JzO1xufVxuXG5mdW5jdGlvbiBmaW5kRGVmYXVsdEV4cG9ydFJvb3Qoc2NlbmU6IGFueSwgZmluZDogYW55LCBVSVRyYW5zZm9ybTogYW55KTogYW55IHtcbiAgICBjb25zdCBjYW52YXMgPSBmaW5kKCdDYW52YXMnKSB8fCBzY2VuZS5nZXRDaGlsZEJ5TmFtZSgnQ2FudmFzJyk7XG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IGNhbnZhcyA/IChjYW52YXMuY2hpbGRyZW4gfHwgW10pIDogKHNjZW5lLmNoaWxkcmVuIHx8IFtdKTtcbiAgICBmb3IgKGxldCBpID0gY2FuZGlkYXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBjb25zdCBjaGlsZCA9IGNhbmRpZGF0ZXNbaV07XG4gICAgICAgIGlmICghY2hpbGQgfHwgY2hpbGQubmFtZSA9PT0gJ0NhbWVyYScpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoY2hpbGQuZ2V0Q29tcG9uZW50ICYmIGNoaWxkLmdldENvbXBvbmVudChVSVRyYW5zZm9ybSkpIHJldHVybiBjaGlsZDtcbiAgICB9XG4gICAgcmV0dXJuIGNhbnZhcyB8fCBzY2VuZTtcbn1cblxuZnVuY3Rpb24gY29sbGVjdFNjZW5lTm9kZVN0YXRzKHJvb3Q6IGFueSwgY2M6IGFueSk6IGFueSB7XG4gICAgY29uc3QgeyBTcHJpdGUsIExhYmVsLCBSaWNoVGV4dCwgTWFzaywgQnV0dG9uLCBVSVRyYW5zZm9ybSB9ID0gY2M7XG4gICAgY29uc3Qgc3RhdHMgPSB7XG4gICAgICAgIG5vZGVzOiAwLFxuICAgICAgICB1aVRyYW5zZm9ybXM6IDAsXG4gICAgICAgIHNwcml0ZXM6IDAsXG4gICAgICAgIG51bGxTcHJpdGVGcmFtZXM6IDAsXG4gICAgICAgIGxhYmVsczogMCxcbiAgICAgICAgcmljaFRleHRzOiAwLFxuICAgICAgICBtYXNrczogMCxcbiAgICAgICAgYnV0dG9uczogMCxcbiAgICB9O1xuICAgIGNvbnN0IHZpc2l0ID0gKG5vZGU6IGFueSkgPT4ge1xuICAgICAgICBpZiAoIW5vZGUpIHJldHVybjtcbiAgICAgICAgc3RhdHMubm9kZXMrKztcbiAgICAgICAgaWYgKFVJVHJhbnNmb3JtICYmIG5vZGUuZ2V0Q29tcG9uZW50ICYmIG5vZGUuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKSkgc3RhdHMudWlUcmFuc2Zvcm1zKys7XG4gICAgICAgIGlmIChTcHJpdGUgJiYgbm9kZS5nZXRDb21wb25lbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IHNwcml0ZSA9IG5vZGUuZ2V0Q29tcG9uZW50KFNwcml0ZSk7XG4gICAgICAgICAgICBpZiAoc3ByaXRlKSB7XG4gICAgICAgICAgICAgICAgc3RhdHMuc3ByaXRlcysrO1xuICAgICAgICAgICAgICAgIGlmICghc3ByaXRlLnNwcml0ZUZyYW1lICYmICFzcHJpdGUuX3Nwcml0ZUZyYW1lKSBzdGF0cy5udWxsU3ByaXRlRnJhbWVzKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKExhYmVsICYmIG5vZGUuZ2V0Q29tcG9uZW50ICYmIG5vZGUuZ2V0Q29tcG9uZW50KExhYmVsKSkgc3RhdHMubGFiZWxzKys7XG4gICAgICAgIGlmIChSaWNoVGV4dCAmJiBub2RlLmdldENvbXBvbmVudCAmJiBub2RlLmdldENvbXBvbmVudChSaWNoVGV4dCkpIHN0YXRzLnJpY2hUZXh0cysrO1xuICAgICAgICBpZiAoTWFzayAmJiBub2RlLmdldENvbXBvbmVudCAmJiBub2RlLmdldENvbXBvbmVudChNYXNrKSkgc3RhdHMubWFza3MrKztcbiAgICAgICAgaWYgKEJ1dHRvbiAmJiBub2RlLmdldENvbXBvbmVudCAmJiBub2RlLmdldENvbXBvbmVudChCdXR0b24pKSBzdGF0cy5idXR0b25zKys7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgKG5vZGUuY2hpbGRyZW4gfHwgW10pKSB2aXNpdChjaGlsZCk7XG4gICAgfTtcbiAgICB2aXNpdChyb290KTtcbiAgICByZXR1cm4gc3RhdHM7XG59XG5cbmZ1bmN0aW9uIHNlbGVjdEVkaXRvck5vZGUobm9kZTogYW55KTogdm9pZCB7XG4gICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2VsZWN0aW9uID0gKEVkaXRvciBhcyBhbnkpLlNlbGVjdGlvbjtcbiAgICAgICAgaWYgKHNlbGVjdGlvbiAmJiB0eXBlb2Ygc2VsZWN0aW9uLnNlbGVjdCA9PT0gJ2Z1bmN0aW9uJyAmJiBub2RlICYmIG5vZGUudXVpZCkge1xuICAgICAgICAgICAgc2VsZWN0aW9uLnNlbGVjdCgnbm9kZScsIG5vZGUudXVpZCk7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gU2VsZWN0aW9uIGZlZWRiYWNrIGlzIG5pY2UtdG8taGF2ZSBvbmx5LlxuICAgIH1cbn1cblxuZnVuY3Rpb24gZmluZFByZWZhYlNvdXJjZU5vZGUoc2NlbmU6IGFueSwgZmluZDogYW55LCBVSVRyYW5zZm9ybTogYW55LCBvcHRpb25zOiBhbnkpOiBhbnkge1xuICAgIGxldCByb290ID0gb3B0aW9ucyAmJiBvcHRpb25zLnJvb3RVdWlkID8gZmluZE5vZGVCeVV1aWQoc2NlbmUsIFN0cmluZyhvcHRpb25zLnJvb3RVdWlkKSkgOiBudWxsO1xuICAgIGlmICghcm9vdCAmJiBvcHRpb25zICYmIG9wdGlvbnMucm9vdE5hbWUpIHJvb3QgPSBmaW5kRmlyc3ROb2RlQnlOYW1lKHNjZW5lLCBTdHJpbmcob3B0aW9ucy5yb290TmFtZSkpO1xuICAgIGlmICghcm9vdCkgcm9vdCA9IGZpbmREZWZhdWx0RXhwb3J0Um9vdChzY2VuZSwgZmluZCwgVUlUcmFuc2Zvcm0pO1xuICAgIHJldHVybiByb290O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQcmVmYWJBc3NldEZyb21Ob2RlKGNjOiBhbnksIHNvdXJjZTogYW55LCBwcmVmYWJOYW1lOiBzdHJpbmcpOiBhbnkge1xuICAgIGNvbnN0IHsgUHJlZmFiLCBpbnN0YW50aWF0ZSB9ID0gY2M7XG4gICAgY29uc3QgY2xlYW5OYW1lID0gc2FuaXRpemVDb2Nvc05vZGVOYW1lKHByZWZhYk5hbWUsIHNvdXJjZS5uYW1lIHx8ICdGaWdtYVByZWZhYicpO1xuICAgIGNvbnN0IHByZWZhYlV0aWxzID0gKEVkaXRvciBhcyBhbnkpLnJlcXVpcmUgPyAoRWRpdG9yIGFzIGFueSkucmVxdWlyZSgnc2NlbmU6Ly91dGlscy9wcmVmYWInKSA6IG51bGw7XG5cbiAgICBjb25zdCBjbG9uZSA9IGluc3RhbnRpYXRlKHNvdXJjZSk7XG4gICAgY2xvbmUucGFyZW50ID0gbnVsbDtcbiAgICBjbG9uZS5uYW1lID0gY2xlYW5OYW1lO1xuXG4gICAgaWYgKHByZWZhYlV0aWxzICYmIHR5cGVvZiBwcmVmYWJVdGlscy5jaGVja0FuZFN0cmlwTm9kZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcHJlZmFiVXRpbHMuY2hlY2tBbmRTdHJpcE5vZGUoY2xvbmUsIHRydWUpO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIC8vIFNvbWUgQ3JlYXRvciBidWlsZHMgdGhyb3cgZm9yIHVuc3VwcG9ydGVkIGVkaXRvci1vbmx5IHN0YXRlOyB0aGUgY2xvbmUgc3RpbGwgc2VyaWFsaXplcy5cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwcmVmYWJVdGlsc1xuICAgICAgICAmJiB0eXBlb2YgcHJlZmFiVXRpbHMuY3JlYXRlUHJlZmFiRnJvbSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAmJiB0eXBlb2YgcHJlZmFiVXRpbHMuY3JlYXRlQXBwbGllZFByZWZhYiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBwcmVmYWJVdGlscy5jcmVhdGVQcmVmYWJGcm9tKGNsb25lKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwcmVmYWJVdGlscy5zZXRQcmVmYWJTeW5jID09PSAnZnVuY3Rpb24nKSBwcmVmYWJVdGlscy5zZXRQcmVmYWJTeW5jKGNsb25lLCB0cnVlKTtcbiAgICAgICAgY29uc3QgYXBwbGllZCA9IHByZWZhYlV0aWxzLmNyZWF0ZUFwcGxpZWRQcmVmYWIoY2xvbmUpO1xuICAgICAgICBpZiAoYXBwbGllZCkge1xuICAgICAgICAgICAgYXBwbGllZC5uYW1lID0gY2xlYW5OYW1lO1xuICAgICAgICAgICAgaWYgKGFwcGxpZWQuZGF0YSkgYXBwbGllZC5kYXRhLm5hbWUgPSBjbGVhbk5hbWU7XG4gICAgICAgICAgICByZXR1cm4gYXBwbGllZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHByZWZhYkFzc2V0ID0gbmV3IFByZWZhYigpO1xuICAgIHByZWZhYkFzc2V0Lm5hbWUgPSBjbGVhbk5hbWU7XG4gICAgcHJlZmFiQXNzZXQuZGF0YSA9IGNsb25lO1xuICAgIGlmIChwcmVmYWJVdGlscyAmJiB0eXBlb2YgcHJlZmFiVXRpbHMuYWRkUHJlZmFiSW5mbyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBwcmVmYWJVdGlscy5hZGRQcmVmYWJJbmZvKGNsb25lLCBjbG9uZSwgcHJlZmFiQXNzZXQpO1xuICAgIH1cbiAgICByZXR1cm4gcHJlZmFiQXNzZXQ7XG59XG5cbmZ1bmN0aW9uIGxvYWRQcmVmYWJBc3NldChhc3NldE1hbmFnZXI6IGFueSwgdXVpZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcbiAgICByZXR1cm4gbG9hZEFzc2V0QW55KGFzc2V0TWFuYWdlciwgdXVpZCwgMTAsIDEwMCkudGhlbigoYXNzZXQpID0+IHtcbiAgICAgICAgaWYgKCFhc3NldCkgdGhyb3cgbmV3IEVycm9yKGBQcmVmYWIgYXNzZXQgbm90IHJlYWR5OiAke3V1aWR9YCk7XG4gICAgICAgIHJldHVybiBhc3NldDtcbiAgICB9KTtcbn1cblxuLyoqXG4gKiBAemgg5oyJIGZpZ21hUGF0aCDlnKjmqKHmnb/moJHph4zlrprkvY3oioLngrnjgIJmaWdtYVBhdGgg5piv55u45a+55qih5p2/5qC555qE5q616Lev5b6E77yI5Y676YeN5omB5bmz5qih5byP5LiL6YCa5bi45piv5Y2V5q615Y+25a2Q5ZCN77yJ44CCXG4gKiAgICAg5YW85a655Lik56eN576O5pyv5a2Y5rOV77yaXG4gKiAgICAgICAoYSkg5a2Y5pW05LiqIFRleHRTdHlsZXMg5qC5IOKGkiByb290IOWQjeS4uuWuueWZqOWQje+8jOWPtuWtkOaYr+WFtuWtkOiKgueCue+8jOmAkOautSBnZXRDaGlsZEJ5TmFtZSDlkb3kuK3vvJtcbiAqICAgICAgIChiKSDlj6rmiorljZXkuKrmoLflvI8gTGFiZWwg5ouW5Ye65p2l5a2YIOKGkiByb290IOiHqui6q+WwseaYr+WPtuWtkO+8jOatpOaXtuiLpemAkOauteaJvuS4jeWIsOOAgeS9huacq+auteWQjT09cm9vdCDlkI3vvIzlm57pgIAgcm9vdOOAglxuICogICAgIOagueiKgueCueWQjeacrOi6q+S4jeeul+i3r+W+hOeahOS4gOauteOAguaJvuS4jeWIsOi/lOWbniBudWxs44CCXG4gKi9cbmZ1bmN0aW9uIGdldE5vZGVCeVBhdGgocm9vdDogYW55LCBmaWdtYVBhdGg6IHN0cmluZyk6IGFueSB7XG4gICAgaWYgKCFyb290KSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBzZWdzID0gU3RyaW5nKGZpZ21hUGF0aCB8fCAnJykuc3BsaXQoJy8nKS5tYXAoKHMpID0+IHMudHJpbSgpKS5maWx0ZXIoKHMpID0+IHMubGVuZ3RoID4gMCk7XG4gICAgaWYgKHNlZ3MubGVuZ3RoID09PSAwKSByZXR1cm4gbnVsbDtcbiAgICBsZXQgY3Vyc29yID0gcm9vdDtcbiAgICBsZXQgbWF0Y2hlZCA9IHRydWU7XG4gICAgZm9yIChjb25zdCBzZWcgb2Ygc2Vncykge1xuICAgICAgICBpZiAoIWN1cnNvciB8fCB0eXBlb2YgY3Vyc29yLmdldENoaWxkQnlOYW1lICE9PSAnZnVuY3Rpb24nKSB7IG1hdGNoZWQgPSBmYWxzZTsgYnJlYWs7IH1cbiAgICAgICAgY29uc3QgbmV4dCA9IGN1cnNvci5nZXRDaGlsZEJ5TmFtZShzZWcpO1xuICAgICAgICBpZiAoIW5leHQpIHsgbWF0Y2hlZCA9IGZhbHNlOyBicmVhazsgfVxuICAgICAgICBjdXJzb3IgPSBuZXh0O1xuICAgIH1cbiAgICBpZiAobWF0Y2hlZCkgcmV0dXJuIGN1cnNvcjtcbiAgICAvLyDlm57pgIDvvJrnvo7mnK/lj6rlrZjkuobljZXkuKrmoLflvI8gTGFiZWzvvIhyb290IOWNs+WPtuWtkO+8ie+8jOi3r+W+hOacq+auteWQjeS4jiByb290IOWQjeS4gOiHtOaXtueUqCByb29044CCXG4gICAgaWYgKFN0cmluZyhyb290Ll9uYW1lIHx8IHJvb3QubmFtZSB8fCAnJykgPT09IHNlZ3Nbc2Vncy5sZW5ndGggLSAxXSkgcmV0dXJuIHJvb3Q7XG4gICAgLy8gTGVnYWN5IGluZGV4ZXMgbWF5IG9ubHkgcmV0YWluIGNoaWxkTmFtZS4gUmVzb2x2ZSBpdCByZWN1cnNpdmVseSBvbmx5XG4gICAgLy8gd2hlbiB1bmlxdWU7IGR1cGxpY2F0ZSBuYW1lcyBhcmUgYW1iaWd1b3VzIGFuZCBtdXN0IG5vdCBpbmhlcml0IHNjcmlwdHMuXG4gICAgaWYgKHNlZ3MubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIGNvbnN0IGhpdHM6IGFueVtdID0gW107XG4gICAgICAgIGNvbnN0IHZpc2l0ID0gKG5vZGU6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiAobm9kZSAmJiBub2RlLmNoaWxkcmVuIHx8IFtdKSkge1xuICAgICAgICAgICAgICAgIGlmIChTdHJpbmcoY2hpbGQgJiYgKGNoaWxkLl9uYW1lIHx8IGNoaWxkLm5hbWUpIHx8ICcnKSA9PT0gc2Vnc1swXSkgaGl0cy5wdXNoKGNoaWxkKTtcbiAgICAgICAgICAgICAgICBpZiAoaGl0cy5sZW5ndGggPD0gMSkgdmlzaXQoY2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICB2aXNpdChyb290KTtcbiAgICAgICAgaWYgKGhpdHMubGVuZ3RoID09PSAxKSByZXR1cm4gaGl0c1swXTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8qKiBMZWdhY3kvbWFudWFsIGluZGV4ZXMgbWF5IGNhcnJ5IG9ubHkgY2hpbGROYW1lOyBrZWVwIHRoYXQgY29uZmlndXJlZCBsZWFmIHJlYWNoYWJsZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlVGV4dFN0eWxlVGVtcGxhdGVQYXRoKHRlbXBsYXRlOiBhbnkpOiBzdHJpbmcge1xuICAgIGNvbnN0IGZpZ21hUGF0aCA9IFN0cmluZyh0ZW1wbGF0ZSAmJiB0ZW1wbGF0ZS5maWdtYVBhdGggfHwgJycpLnRyaW0oKTtcbiAgICBpZiAoZmlnbWFQYXRoKSByZXR1cm4gZmlnbWFQYXRoO1xuICAgIHJldHVybiBTdHJpbmcodGVtcGxhdGUgJiYgdGVtcGxhdGUuY2hpbGROYW1lIHx8ICcnKS50cmltKCk7XG59XG5cbi8qKiBAemgg5Y+q5pyJ57K+56Gu5ZG95Lit55qE5pmu6YCaIExhYmVsIOaJjee7p+aJv+aooeadv+e7hOS7tu+8m0Z1enp5IOe7p+e7rei1sOaVsOWAvOmZjee6p++8jOmBv+WFjeivr+aMguihjOS4uuiEmuacrOOAgiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZENsb25lRXhhY3RUZXh0U3R5bGVUZW1wbGF0ZShmaWdtYU5vZGU6IGFueSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHRlbXBsYXRlID0gZmlnbWFOb2RlICYmIGZpZ21hTm9kZS50ZXh0U3R5bGVUZW1wbGF0ZTtcbiAgICByZXR1cm4gU3RyaW5nKGZpZ21hTm9kZSAmJiBmaWdtYU5vZGUudHlwZSB8fCAnJykudG9VcHBlckNhc2UoKSA9PT0gJ1RFWFQnXG4gICAgICAgICYmICFoYXNNaXhlZFRleHRTZWdtZW50cyhmaWdtYU5vZGUpXG4gICAgICAgICYmIFN0cmluZyh0ZW1wbGF0ZSAmJiB0ZW1wbGF0ZS50aWVyIHx8ICcnKS50cmltKCkudG9VcHBlckNhc2UoKSA9PT0gJ0VYQUNUJ1xuICAgICAgICAmJiAhIVN0cmluZyh0ZW1wbGF0ZSAmJiB0ZW1wbGF0ZS5wcmVmYWJVdWlkIHx8ICcnKVxuICAgICAgICAmJiAhIXJlc29sdmVUZXh0U3R5bGVUZW1wbGF0ZVBhdGgodGVtcGxhdGUpO1xufVxuXG4vKiogQHpoIOaUtumbhumcgOimgeWcqOW7uuagkeWJjeWKoOi9veeahCBFeGFjdCDmloflrZfmqKHmnb8gUHJlZmFi77yM5L+d6K+BIGJ1aWxkTm9kZSDlhoXlj6/lkIzmraXlhYvpmoblrozmlbTnu4Tku7bjgIIgKi9cbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0RXhhY3RUZXh0U3R5bGVUZW1wbGF0ZVV1aWRzKHJvb3Q6IGFueSk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCB1dWlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHZpc2l0ID0gKG5vZGU6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIW5vZGUpIHJldHVybjtcbiAgICAgICAgaWYgKHNob3VsZENsb25lRXhhY3RUZXh0U3R5bGVUZW1wbGF0ZShub2RlKSkge1xuICAgICAgICAgICAgdXVpZHMuYWRkKFN0cmluZyhub2RlLnRleHRTdHlsZVRlbXBsYXRlLnByZWZhYlV1aWQpKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIChub2RlLmNoaWxkcmVuIHx8IFtdKSkgdmlzaXQoY2hpbGQpO1xuICAgIH07XG4gICAgdmlzaXQocm9vdCk7XG4gICAgcmV0dXJuIEFycmF5LmZyb20odXVpZHMpO1xufVxuXG5mdW5jdGlvbiBzdHJpcFByZWZhYlN0YXRlKG5vZGU6IGFueSk6IHZvaWQge1xuICAgIGlmICghbm9kZSkgcmV0dXJuO1xuICAgIGxldCBzdHJpcHBlZCA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHByZWZhYlV0aWxzID0gKEVkaXRvciBhcyBhbnkpLnJlcXVpcmUgPyAoRWRpdG9yIGFzIGFueSkucmVxdWlyZSgnc2NlbmU6Ly91dGlscy9wcmVmYWInKSA6IG51bGw7XG4gICAgICAgIGlmIChwcmVmYWJVdGlscyAmJiB0eXBlb2YgcHJlZmFiVXRpbHMuY2hlY2tBbmRTdHJpcE5vZGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHByZWZhYlV0aWxzLmNoZWNrQW5kU3RyaXBOb2RlKG5vZGUsIHRydWUpO1xuICAgICAgICAgICAgc3RyaXBwZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIENyZWF0b3IgdmVyc2lvbnMgZXhwb3NlIGRpZmZlcmVudCBlZGl0b3IgaGVscGVyczsgdGhlIHJ1bnRpbWUgZmFsbGJhY2sgYmVsb3cga2VlcHMgdGhlIGNsb25lIHNjZW5lLW93bmVkLlxuICAgIH1cbiAgICBpZiAoIXN0cmlwcGVkICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChub2RlLCAnX3ByZWZhYicpKSBub2RlLl9wcmVmYWIgPSBudWxsO1xuICAgIGNvbnN0IGNvbXBvbmVudHMgPSBBcnJheS5pc0FycmF5KG5vZGUuY29tcG9uZW50cylcbiAgICAgICAgPyBub2RlLmNvbXBvbmVudHNcbiAgICAgICAgOiAoQXJyYXkuaXNBcnJheShub2RlLl9jb21wb25lbnRzKSA/IG5vZGUuX2NvbXBvbmVudHMgOiBbXSk7XG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgY29tcG9uZW50cykge1xuICAgICAgICBpZiAoY29tcG9uZW50ICYmIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjb21wb25lbnQsICdfX3ByZWZhYicpKSBjb21wb25lbnQuX19wcmVmYWIgPSBudWxsO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAemgg5a+56b2QIFVuaXR5IENvcHlDb21wb25lbnQgKyBDb3B5RXh0cmFTdHlsZUNvbXBvbmVudHPvvJrlhYvpmobmqKHmnb/mloflrZflj7boioLngrnvvIzkv53nlZkgTGFiZWzjgIHmnZDotKjlkozlkIzoioLngrnpmYTliqDohJrmnKzjgIJcbiAqICAgICDmqKHmnb/lrZDoioLngrnkuI3lsZ7kuo7mloflrZfmoLflvI/nu4Tku7blpZHnuqbvvIzlhYvpmoblkI7np7vpmaTvvJtDb2NvcyBpbnN0YW50aWF0ZSDkvJrph43mmKDlsITlkIzkuIDlhYvpmoblm77lhoXnmoTnu4Tku7blvJXnlKjjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsb25lRXhhY3RUZXh0U3R5bGVUZW1wbGF0ZU5vZGUoZmlnbWFOb2RlOiBhbnksIHRlbXBsYXRlUm9vdDogYW55LCBjYzogYW55KTogYW55IHtcbiAgICBpZiAoIXNob3VsZENsb25lRXhhY3RUZXh0U3R5bGVUZW1wbGF0ZShmaWdtYU5vZGUpIHx8ICF0ZW1wbGF0ZVJvb3QgfHwgIWNjKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCB7IExhYmVsLCBpbnN0YW50aWF0ZSB9ID0gY2M7XG4gICAgaWYgKCFMYWJlbCB8fCB0eXBlb2YgaW5zdGFudGlhdGUgIT09ICdmdW5jdGlvbicpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IHRlbXBsYXRlID0gZmlnbWFOb2RlLnRleHRTdHlsZVRlbXBsYXRlO1xuICAgIGNvbnN0IHNvdXJjZU5vZGUgPSBnZXROb2RlQnlQYXRoKHRlbXBsYXRlUm9vdCwgcmVzb2x2ZVRleHRTdHlsZVRlbXBsYXRlUGF0aCh0ZW1wbGF0ZSkpO1xuICAgIGlmICghc291cmNlTm9kZSB8fCAhc291cmNlTm9kZS5nZXRDb21wb25lbnQgfHwgIXNvdXJjZU5vZGUuZ2V0Q29tcG9uZW50KExhYmVsKSkgcmV0dXJuIG51bGw7XG5cbiAgICBsZXQgY2xvbmU6IGFueSA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgICAgY2xvbmUgPSBpbnN0YW50aWF0ZShzb3VyY2VOb2RlKTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSBFeGFjdCDmloflrZfmqKHmnb/oioLngrnlhYvpmoblpLHotKU6JywgZXJyb3IgJiYgZXJyb3IubWVzc2FnZSB8fCBlcnJvcik7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBpZiAoIWNsb25lIHx8ICFjbG9uZS5nZXRDb21wb25lbnQgfHwgIWNsb25lLmdldENvbXBvbmVudChMYWJlbCkpIHtcbiAgICAgICAgaWYgKGNsb25lICYmIHR5cGVvZiBjbG9uZS5kZXN0cm95ID09PSAnZnVuY3Rpb24nKSBjbG9uZS5kZXN0cm95KCk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHN0cmlwUHJlZmFiU3RhdGUoY2xvbmUpO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgWy4uLihjbG9uZS5jaGlsZHJlbiB8fCBbXSldKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY2hpbGQucmVtb3ZlRnJvbVBhcmVudCA9PT0gJ2Z1bmN0aW9uJykgY2hpbGQucmVtb3ZlRnJvbVBhcmVudCgpO1xuICAgICAgICBpZiAodHlwZW9mIGNoaWxkLmRlc3Ryb3kgPT09ICdmdW5jdGlvbicpIGNoaWxkLmRlc3Ryb3koKTtcbiAgICB9XG4gICAgLy8gS2VlcCBlZGl0LW1vZGUgc2NyaXB0cyBkb3JtYW50IHVudGlsIGF1dGhvcmVkIEZpZ21hIHRleHQvbGF5b3V0IHByb3BlcnRpZXMgYXJlIGFwcGxpZWQuXG4gICAgY2xvbmUuYWN0aXZlID0gZmFsc2U7XG4gICAgcmV0dXJuIGNsb25lO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluYWxpemVFeGFjdFRleHRTdHlsZVRlbXBsYXRlTm9kZShub2RlOiBhbnksIHZpc2libGU6IGFueSk6IHZvaWQge1xuICAgIGlmIChub2RlKSBub2RlLmFjdGl2ZSA9IHZpc2libGUgIT09IGZhbHNlO1xufVxuXG4vKiogQSBxdWV1ZWQgY29tcG9uZW50LXN0YXRlIHRhcmdldCBzdGF5cyBkb3JtYW50IHVudGlsIHRoZSBlZGl0b3IgZmFjYWRlIGZpbmlzaGVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZEZpbmFsaXplRXhhY3RUZXh0U3R5bGVUZW1wbGF0ZU5vZGUoXG4gICAgZXhhY3RUZXh0VGVtcGxhdGVDbG9uZTogYW55LFxuICAgIHN0YXRlUXVldWVkOiBib29sZWFuLFxuKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICEhZXhhY3RUZXh0VGVtcGxhdGVDbG9uZSAmJiAhc3RhdGVRdWV1ZWQ7XG59XG5cbi8qKlxuICogQHpoIOaKiuaooeadvyBMYWJlbCDnmoTjgIzlpJbop4LjgI3mi7fliLDnm67moIcgTGFiZWzvvIjnjq80IOaVtOe7hOS7tuWFi+mahueahCBDb2NvcyDniYjvvInjgIJcbiAqICAgICDlj6rmi7flpJbop4Lnu7TluqbvvJrlrZfkvZMv5Yqg57KXL+aWnOS9ky/mj4/ovrkv5oqV5b2xL+iHquWumuS5ieadkOi0qO+8m+S4jeWKqOebruagh+eahCBzdHJpbmcv5a2X5Y+3L+minOiJsi/lr7npvZAv5bC65a+444CCXG4gKiAgICAg5a2X5Y+3L+minOiJsumaj+WvvOWFpeiKgueCue+8jOWkluingumaj+aooeadv+KAlOKAlOWvuem9kCBVbml0eeOAjHRleHQv5a2X5Y+3L+minOiJsumaj+iKgueCueimhueblu+8jOWFtuS9meWFi+mahuOAjeOAglxuICovXG5mdW5jdGlvbiBjb3B5TGFiZWxBcHBlYXJhbmNlKHNyYzogYW55LCBkc3Q6IGFueSwgRm9udDogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFzcmMgfHwgIWRzdCkgcmV0dXJuIGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICAgIC8vIOWtl+S9k1xuICAgICAgICBpZiAoc3JjLmZvbnQgJiYgKCFGb250IHx8IHNyYy5mb250IGluc3RhbmNlb2YgRm9udCkpIHtcbiAgICAgICAgICAgIGRzdC5mb250ID0gc3JjLmZvbnQ7XG4gICAgICAgICAgICBkc3QudXNlU3lzdGVtRm9udCA9IGZhbHNlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZHN0LnVzZVN5c3RlbUZvbnQgPSBzcmMudXNlU3lzdGVtRm9udDtcbiAgICAgICAgICAgIGlmIChzcmMuZm9udEZhbWlseSkgZHN0LmZvbnRGYW1pbHkgPSBzcmMuZm9udEZhbWlseTtcbiAgICAgICAgfVxuICAgICAgICBkc3QuaXNCb2xkID0gc3JjLmlzQm9sZDtcbiAgICAgICAgZHN0LmlzSXRhbGljID0gc3JjLmlzSXRhbGljO1xuICAgICAgICAvLyDmj4/ovrlcbiAgICAgICAgZHN0LmVuYWJsZU91dGxpbmUgPSBzcmMuZW5hYmxlT3V0bGluZTtcbiAgICAgICAgaWYgKHNyYy5lbmFibGVPdXRsaW5lKSB7XG4gICAgICAgICAgICBkc3Qub3V0bGluZUNvbG9yID0gc3JjLm91dGxpbmVDb2xvci5jbG9uZSA/IHNyYy5vdXRsaW5lQ29sb3IuY2xvbmUoKSA6IHNyYy5vdXRsaW5lQ29sb3I7XG4gICAgICAgICAgICBkc3Qub3V0bGluZVdpZHRoID0gc3JjLm91dGxpbmVXaWR0aDtcbiAgICAgICAgfVxuICAgICAgICAvLyDmipXlvbFcbiAgICAgICAgZHN0LmVuYWJsZVNoYWRvdyA9IHNyYy5lbmFibGVTaGFkb3c7XG4gICAgICAgIGlmIChzcmMuZW5hYmxlU2hhZG93KSB7XG4gICAgICAgICAgICBkc3Quc2hhZG93Q29sb3IgPSBzcmMuc2hhZG93Q29sb3IuY2xvbmUgPyBzcmMuc2hhZG93Q29sb3IuY2xvbmUoKSA6IHNyYy5zaGFkb3dDb2xvcjtcbiAgICAgICAgICAgIGRzdC5zaGFkb3dPZmZzZXQgPSBzcmMuc2hhZG93T2Zmc2V0LmNsb25lID8gc3JjLnNoYWRvd09mZnNldC5jbG9uZSgpIDogc3JjLnNoYWRvd09mZnNldDtcbiAgICAgICAgICAgIGRzdC5zaGFkb3dCbHVyID0gc3JjLnNoYWRvd0JsdXI7XG4gICAgICAgIH1cbiAgICAgICAgLy8g6Ieq5a6a5LmJ5p2Q6LSo77yI576O5pyv6Iul57uZ5qih5p2/6YWN5LqG54m55q6KIHNoYWRlciDmnZDotKjvvIzkuIDlubbluKbov4fmnaXvvIlcbiAgICAgICAgaWYgKHNyYy5jdXN0b21NYXRlcmlhbCkgZHN0LmN1c3RvbU1hdGVyaWFsID0gc3JjLmN1c3RvbU1hdGVyaWFsO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSDmi7fotJ3mqKHmnb8gTGFiZWwg5aSW6KeC5aSx6LSlOicsIChlIGFzIGFueSkgJiYgKGUgYXMgYW55KS5tZXNzYWdlIHx8IGUpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuXG5leHBvcnQgdHlwZSBSaWNoVGV4dEZvbnRTb3VyY2UgPSAndGVtcGxhdGUnIHwgJ3Jlc29sdmVyJyB8ICdtaXNzaW5nJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVSaWNoVGV4dEZvbnRSZWZlcmVuY2UoZmlnbWFOb2RlOiBhbnksIHRlbXBsYXRlOiBhbnkpOiB7IHV1aWQ6IHN0cmluZzsgZmlsZU5hbWU6IHN0cmluZyB9IHtcbiAgICByZXR1cm4ge1xuICAgICAgICB1dWlkOiBTdHJpbmcoKGZpZ21hTm9kZSAmJiBmaWdtYU5vZGUuZm9udFV1aWQpIHx8ICh0ZW1wbGF0ZSAmJiB0ZW1wbGF0ZS5mb250VXVpZCkgfHwgJycpLFxuICAgICAgICBmaWxlTmFtZTogU3RyaW5nKChmaWdtYU5vZGUgJiYgZmlnbWFOb2RlLmZvbnRGaWxlTmFtZSkgfHwgKHRlbXBsYXRlICYmIHRlbXBsYXRlLmZvbnRGaWxlTmFtZSkgfHwgJycpLFxuICAgIH07XG59XG5cbi8qKiBAemggUmljaFRleHQg5Y+q57un5om/5qih5p2/5a2X5L2T77yb5qih5p2/5LuN5piv57O757uf5a2X5L2T5pe25pS555SoIG1haW4g5bey6Kej5p6Q55qE5bel56iL5a2X5L2T44CCICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlSaWNoVGV4dEZvbnQoXG4gICAgdGFyZ2V0OiBhbnksXG4gICAgdGVtcGxhdGVMYWJlbDogYW55LFxuICAgIHJlc29sdmVyRm9udFV1aWQ6IHN0cmluZyxcbiAgICBsb2FkRm9udDogKHV1aWQ6IHN0cmluZykgPT4gUHJvbWlzZTxhbnk+LFxuICAgIEZvbnQ6IGFueSxcbik6IFByb21pc2U8UmljaFRleHRGb250U291cmNlPiB7XG4gICAgaWYgKCF0YXJnZXQpIHJldHVybiAnbWlzc2luZyc7XG4gICAgY29uc3QgdGVtcGxhdGVGb250ID0gdGVtcGxhdGVMYWJlbCAmJiB0ZW1wbGF0ZUxhYmVsLmZvbnQ7XG4gICAgaWYgKHRlbXBsYXRlRm9udCAmJiAoIUZvbnQgfHwgdGVtcGxhdGVGb250IGluc3RhbmNlb2YgRm9udCkpIHtcbiAgICAgICAgdGFyZ2V0LmZvbnQgPSB0ZW1wbGF0ZUZvbnQ7XG4gICAgICAgIHRhcmdldC51c2VTeXN0ZW1Gb250ID0gZmFsc2U7XG4gICAgICAgIHJldHVybiAndGVtcGxhdGUnO1xuICAgIH1cblxuICAgIGlmIChyZXNvbHZlckZvbnRVdWlkKSB7XG4gICAgICAgIGNvbnN0IHJlc29sdmVkRm9udCA9IGF3YWl0IGxvYWRGb250KHJlc29sdmVyRm9udFV1aWQpO1xuICAgICAgICBpZiAocmVzb2x2ZWRGb250ICYmICghRm9udCB8fCByZXNvbHZlZEZvbnQgaW5zdGFuY2VvZiBGb250KSkge1xuICAgICAgICAgICAgdGFyZ2V0LmZvbnQgPSByZXNvbHZlZEZvbnQ7XG4gICAgICAgICAgICB0YXJnZXQudXNlU3lzdGVtRm9udCA9IGZhbHNlO1xuICAgICAgICAgICAgcmV0dXJuICdyZXNvbHZlcic7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0YXJnZXQudXNlU3lzdGVtRm9udCA9IHRydWU7XG4gICAgcmV0dXJuICdtaXNzaW5nJztcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplRWRpdG9yT2JqZWN0KHRhcmdldDogYW55LCBvcHRpb25zOiBhbnkpOiBhbnkge1xuICAgIGNvbnN0IGcgPSBnbG9iYWxUaGlzIGFzIGFueTtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgICAgICAoRWRpdG9yIGFzIGFueSkuc2VyaWFsaXplLFxuICAgICAgICBnLkVkaXRvckV4dGVuZHMgJiYgZy5FZGl0b3JFeHRlbmRzLnNlcmlhbGl6ZSxcbiAgICAgICAgZy5lZGl0b3JFeHRlbmRzICYmIGcuZWRpdG9yRXh0ZW5kcy5zZXJpYWxpemUsXG4gICAgXS5maWx0ZXIoKGZuKSA9PiB0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicpO1xuICAgIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIENvY29zIGVkaXRvciBzZXJpYWxpemVyIGZvdW5kIChFZGl0b3Iuc2VyaWFsaXplIC8gRWRpdG9yRXh0ZW5kcy5zZXJpYWxpemUpJyk7XG4gICAgfVxuICAgIHJldHVybiBjYW5kaWRhdGVzWzBdKHRhcmdldCwgb3B0aW9ucyk7XG59XG5cbi8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuLy8g6Zi25q61IDMg5biD5bGA5Yik5a6a77yI57qvIEpT77yM5a+56b2QIFVuaXR5IEZpZ21hSW1wb3J0ZXIuY3MgNDc3LTU2MO+8jOS4jeS+nei1luW8leaTju+8iVxuLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG5cbmNvbnN0IExBWU9VVF9UT0wgPSA0OyAvLyBGaWdtYSDorr7orqHluLjop4EgMS0zcHgg5bC65a+45YGP5beu77yM5a655beuIDRweO+8iOWvuem9kCBVbml0ee+8iVxuY29uc3QgRklMTF9PUklHSU5fVE9MID0gMC41OyAvLyDkvY3nva7lgY/np7vpgJrluLjmmK/orr7orqHmhI/lm77vvJvlj6rmiorlh6DkuY7otLTljp/ngrnnmoToioLngrnlvZPkvZzog4zmma/loavlhYXjgIJcblxuaW50ZXJmYWNlIEZpZ21hQm91bmRzIHtcbiAgICBsZWZ0OiBudW1iZXI7XG4gICAgdG9wOiBudW1iZXI7XG4gICAgcmlnaHQ6IG51bWJlcjtcbiAgICBib3R0b206IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xufVxuXG4vKiogQHpoIOWPliBGaWdtYSDoioLngrnlnKjniLblnZDmoIfph4znmoTop4bop4nljIXlm7Tnm5LvvJvplZzlg48v5peL6L2s5LyY5YWI55SoIHJlbGF0aXZlVHJhbnNmb3Jt44CCICovXG5mdW5jdGlvbiBmaWdtYUJvdW5kcyhub2RlOiBhbnkpOiBGaWdtYUJvdW5kcyB7XG4gICAgY29uc3QgdyA9IG5vZGUud2lkdGggfHwgMDtcbiAgICBjb25zdCBoID0gbm9kZS5oZWlnaHQgfHwgMDtcbiAgICBjb25zdCB0ID0gbm9kZS5yZWxhdGl2ZVRyYW5zZm9ybTtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh0KSAmJiBBcnJheS5pc0FycmF5KHRbMF0pICYmIEFycmF5LmlzQXJyYXkodFsxXSkgJiZcbiAgICAgICAgdFswXS5sZW5ndGggPj0gMyAmJiB0WzFdLmxlbmd0aCA+PSAzKSB7XG4gICAgICAgIGNvbnN0IGEgPSBOdW1iZXIodFswXVswXSkgfHwgMDtcbiAgICAgICAgY29uc3QgYiA9IE51bWJlcih0WzBdWzFdKSB8fCAwO1xuICAgICAgICBjb25zdCB0eCA9IE51bWJlcih0WzBdWzJdKSB8fCAwO1xuICAgICAgICBjb25zdCBjID0gTnVtYmVyKHRbMV1bMF0pIHx8IDA7XG4gICAgICAgIGNvbnN0IGQgPSBOdW1iZXIodFsxXVsxXSkgfHwgMDtcbiAgICAgICAgY29uc3QgdHkgPSBOdW1iZXIodFsxXVsyXSkgfHwgMDtcbiAgICAgICAgY29uc3QgeHMgPSBbdHgsIGEgKiB3ICsgdHgsIGIgKiBoICsgdHgsIGEgKiB3ICsgYiAqIGggKyB0eF07XG4gICAgICAgIGNvbnN0IHlzID0gW3R5LCBjICogdyArIHR5LCBkICogaCArIHR5LCBjICogdyArIGQgKiBoICsgdHldO1xuICAgICAgICBjb25zdCBsZWZ0ID0gTWF0aC5taW4oLi4ueHMpO1xuICAgICAgICBjb25zdCByaWdodCA9IE1hdGgubWF4KC4uLnhzKTtcbiAgICAgICAgY29uc3QgdG9wID0gTWF0aC5taW4oLi4ueXMpO1xuICAgICAgICBjb25zdCBib3R0b20gPSBNYXRoLm1heCguLi55cyk7XG4gICAgICAgIHJldHVybiB7IGxlZnQsIHRvcCwgcmlnaHQsIGJvdHRvbSwgd2lkdGg6IHJpZ2h0IC0gbGVmdCwgaGVpZ2h0OiBib3R0b20gLSB0b3AgfTtcbiAgICB9XG4gICAgY29uc3QgeCA9IG5vZGUueCB8fCAwO1xuICAgIGNvbnN0IHkgPSBub2RlLnkgfHwgMDtcbiAgICByZXR1cm4geyBsZWZ0OiB4LCB0b3A6IHksIHJpZ2h0OiB4ICsgdywgYm90dG9tOiB5ICsgaCwgd2lkdGg6IHcsIGhlaWdodDogaCB9O1xufVxuXG4vKipcbiAqIEB6aCDlrZDoioLngrnmmK/lkKbnnJ/nmoTpk7rmu6HniLboioLngrnjgIJVbml0eSDniYjlj6rnnIvlsLrlr7jvvIzkvYYgQ29jb3MgV2lkZ2V0IOS8muaKiui/meenjeiKgueCuei9rOaIkOWbm+i+uSBTdHJldGNo77ybXG4gKiAgICAg6Iul6IqC54K55pys6Lqr5pyJIHgveSDlgY/np7vvvIjlhbjlnovvvJrlupXmoI8gSGVybyDlpLTlg48geD0y77yJ77yM5Y+q55yL5bC65a+45Lya5ZCe5o6JIEZpZ21hIOeahOiuvuiuoeWBj+enu+OAglxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNGaWxsUGFyZW50KG5vZGU6IGFueSwgcGFyZW50OiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXBhcmVudCkgcmV0dXJuIGZhbHNlO1xuICAgIC8vIEZpZ21hIG9mdGVuIHdyYXBzIFRFWFQgaW4gYSBzYW1lLXNpemVkIFwi5paH5a2X5qC35byPXCIgYXV0by1sYXlvdXQgZnJhbWUuIFRoYXRcbiAgICAvLyBpcyBzdHlsZSBvcmdhbml6YXRpb24sIG5vdCBhIHJlcXVlc3QgZm9yIHRoZSBMYWJlbCB0byBzdHJldGNoIGxpa2UgYSBiYWNrZ3JvdW5kLlxuICAgIGlmIChub2RlICYmIG5vZGUudHlwZSA9PT0gJ1RFWFQnKSByZXR1cm4gZmFsc2U7XG4gICAgLy8gU3RyZXRjaCB3b3JrcyBpbiB0aGUgbm9kZSdzIGxvY2FsIGF4ZXMuIEEgcm90YXRlZCBub24tc3F1YXJlIG5vZGUgY2FuIGhhdmUgYVxuICAgIC8vIHBhcmVudC1zaXplZCB2aXN1YWwgQUFCQiB3aGlsZSBpdHMgYXV0aG9yZWQgd2lkdGgvaGVpZ2h0IGFyZSBpbnRlbnRpb25hbGx5IHN3YXBwZWQuXG4gICAgY29uc3QgcGFyZW50V2lkdGggPSBOdW1iZXIocGFyZW50LndpZHRoKSB8fCAwO1xuICAgIGNvbnN0IHBhcmVudEhlaWdodCA9IE51bWJlcihwYXJlbnQuaGVpZ2h0KSB8fCAwO1xuICAgIGlmIChNYXRoLmFicygoTnVtYmVyKG5vZGUgJiYgbm9kZS53aWR0aCkgfHwgMCkgLSBwYXJlbnRXaWR0aCkgPj0gTEFZT1VUX1RPTCB8fFxuICAgICAgICBNYXRoLmFicygoTnVtYmVyKG5vZGUgJiYgbm9kZS5oZWlnaHQpIHx8IDApIC0gcGFyZW50SGVpZ2h0KSA+PSBMQVlPVVRfVE9MKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgYiA9IGZpZ21hQm91bmRzKG5vZGUpO1xuICAgIHJldHVybiBNYXRoLmFicyhiLmxlZnQpIDwgRklMTF9PUklHSU5fVE9MICYmXG4gICAgICAgICAgIE1hdGguYWJzKGIudG9wKSA8IEZJTExfT1JJR0lOX1RPTCAmJlxuICAgICAgICAgICBNYXRoLmFicyhiLnJpZ2h0IC0gcGFyZW50V2lkdGgpIDwgTEFZT1VUX1RPTCAmJlxuICAgICAgICAgICBNYXRoLmFicyhiLmJvdHRvbSAtIHBhcmVudEhlaWdodCkgPCBMQVlPVVRfVE9MO1xufVxuXG4vKiogQHpoIOiKgueCueWjsOaYjuS6hiBBdXRvIExheW91dOOAguerr+WPoyBIYXNMYXlvdXQoMjA3KeOAgiAqL1xuZnVuY3Rpb24gaGFzTGF5b3V0KG5vZGU6IGFueSk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBub2RlLmxheW91dE1vZGUgPT09ICdWRVJUSUNBTCcgfHwgbm9kZS5sYXlvdXRNb2RlID09PSAnSE9SSVpPTlRBTCcgfHwgbm9kZS5sYXlvdXRNb2RlID09PSAnR1JJRCc7XG59XG5cbi8qKiBAemggV3JhcCDmjaLooYzluIPlsYDjgILnq6/lj6MgSXNXcmFwTGF5b3V0KDIwOCnjgIIgKi9cbmZ1bmN0aW9uIGlzV3JhcExheW91dChub2RlOiBhbnkpOiBib29sZWFuIHtcbiAgICByZXR1cm4gaGFzTGF5b3V0KG5vZGUpICYmIG5vZGUubGF5b3V0V3JhcCA9PT0gJ1dSQVAnO1xufVxuXG4vKiogQHpoIOe7neWvueWumuS9jeWtkOiKgueCueOAguerr+WPoyBJc0Fic29sdXRlUG9zaXRpb25lZCgyMDkp44CCICovXG5mdW5jdGlvbiBpc0Fic29sdXRlUG9zaXRpb25lZChub2RlOiBhbnkpOiBib29sZWFuIHtcbiAgICByZXR1cm4gbm9kZS5sYXlvdXRQb3NpdGlvbmluZyA9PT0gJ0FCU09MVVRFJztcbn1cblxuLyoqIEB6aCDnnJ/mraPlj4LkuI7luIPlsYDnmoTlrZDoioLngrnmlbDvvJrmjpLpmaTnu53lr7nlrprkvY0v5aGr5ruh54i257qn44CC56uv5Y+jIExheW91dFBhcnRpY2lwYXRpbmdDaGlsZENvdW50KDQ4MCnjgIIgKi9cbmZ1bmN0aW9uIGxheW91dFBhcnRpY2lwYXRpbmdDaGlsZENvdW50KG5vZGU6IGFueSk6IG51bWJlciB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuIHx8IFtdO1xuICAgIGxldCBuID0gMDtcbiAgICBmb3IgKGNvbnN0IGMgb2YgY2hpbGRyZW4pIHtcbiAgICAgICAgaWYgKCFpc0Fic29sdXRlUG9zaXRpb25lZChjKSAmJiAhaXNGaWxsUGFyZW50KGMsIG5vZGUpKSBuKys7XG4gICAgfVxuICAgIHJldHVybiBuO1xufVxuXG4vKiogQHpoIFdyYXAg5biD5bGA6YeM5Y+C5LiO5biD5bGA55qE5a2Q6IqC54K55bC65a+45piv5ZCm5Z+65pys5LiA6Ie077yI5a655beuIDRweO+8ieOAguerr+WPoyBXcmFwQ2hpbGRyZW5BcmVVbmlmb3JtKDUxMSnjgIIgKi9cbmZ1bmN0aW9uIHdyYXBDaGlsZHJlbkFyZVVuaWZvcm0obm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSBub2RlLmNoaWxkcmVuIHx8IFtdO1xuICAgIGxldCBhbnkgPSBmYWxzZTtcbiAgICBsZXQgbWluVyA9IEluZmluaXR5LCBtYXhXID0gLUluZmluaXR5LCBtaW5IID0gSW5maW5pdHksIG1heEggPSAtSW5maW5pdHk7XG4gICAgZm9yIChjb25zdCBjIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgIGlmIChpc0Fic29sdXRlUG9zaXRpb25lZChjKSB8fCBpc0ZpbGxQYXJlbnQoYywgbm9kZSkpIGNvbnRpbnVlO1xuICAgICAgICBhbnkgPSB0cnVlO1xuICAgICAgICBjb25zdCB3ID0gYy53aWR0aCB8fCAwLCBoID0gYy5oZWlnaHQgfHwgMDtcbiAgICAgICAgaWYgKHcgPCBtaW5XKSBtaW5XID0gdztcbiAgICAgICAgaWYgKHcgPiBtYXhXKSBtYXhXID0gdztcbiAgICAgICAgaWYgKGggPCBtaW5IKSBtaW5IID0gaDtcbiAgICAgICAgaWYgKGggPiBtYXhIKSBtYXhIID0gaDtcbiAgICB9XG4gICAgaWYgKCFhbnkpIHJldHVybiB0cnVlO1xuICAgIHJldHVybiAobWF4VyAtIG1pblcpIDw9IExBWU9VVF9UT0wgJiYgKG1heEggLSBtaW5IKSA8PSBMQVlPVVRfVE9MO1xufVxuXG4vKipcbiAqIEB6aCDmmK/lkKbnnJ/nmoTpnIDopoHnu5nor6XlrrnlmajmjIIgTGF5b3V0R3JvdXDvvJrlo7DmmI4gQXV0byBMYXlvdXQg5LiU5Y+C5LiO5biD5bGA5a2Q6IqC54K5IOKJpSAy77yMXG4gKiAgICAg5LiU6Z2e44CM5byC5p6EIFdyYXDjgI3jgILnq6/lj6MgRWZmZWN0aXZlSGFzTGF5b3V0KDQ5OCnjgIJcbiAqICAgICDms6jvvJrmraTliKTlrprlhrPlrprlrZDoioLngrnotbDlk6rmnaHlrprkvY3liIbmlK/vvJvmmK/lkKbnnJ/nmoTmjIIgY2MuTGF5b3V0IOe7hOS7tuWPpuingSBzaG91bGRNb3VudExheW91dOOAglxuICovXG5mdW5jdGlvbiBlZmZlY3RpdmVIYXNMYXlvdXQobm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFoYXNMYXlvdXQobm9kZSkpIHJldHVybiBmYWxzZTtcbiAgICBpZiAobGF5b3V0UGFydGljaXBhdGluZ0NoaWxkQ291bnQobm9kZSkgPCAyKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKGlzV3JhcExheW91dChub2RlKSAmJiAhd3JhcENoaWxkcmVuQXJlVW5pZm9ybShub2RlKSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIEB6aCDlrrnlmajmmK/lkKbjgIznuq/lh4DjgI3vvJrmiYDmnInlrZDoioLngrnpg73lj4LkuI7luIPlsYDvvIjml6AgQUJTT0xVVEUg5a6a5L2N44CB5peg5aGr5ruh54i257qn6IOM5pmv77yJ44CCXG4gKiAgICAgY2MuTGF5b3V0IOS8muWNt+WFpeaJgOaciSBhY3RpdmUg5a2Q6IqC54K55o6S5biD77yM5pegIFVuaXR5IExheW91dEVsZW1lbnQuaWdub3JlTGF5b3V0IOetieS7t+W8gOWFs++8jFxuICogICAgIOaVhea3t+WFpemdnuW4g+WxgOWtkOiKgueCueeahOWuueWZqOS4jeiDveaMgiBjYy5MYXlvdXTvvIjlkKbliJnog4zmma8v57ud5a+55a6a5L2N6IqC54K56KKr5o6S5Lmx77yJ77yM5Zue6YCA57ud5a+55Z2Q5qCH44CCXG4gKi9cbmZ1bmN0aW9uIGxheW91dENvbnRhaW5lcklzQ2xlYW4obm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgY29uc3Qga2lkcyA9IG5vZGUuY2hpbGRyZW4gfHwgW107XG4gICAgZm9yIChjb25zdCBjIG9mIGtpZHMpIHtcbiAgICAgICAgaWYgKGlzQWJzb2x1dGVQb3NpdGlvbmVkKGMpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmIChpc0ZpbGxQYXJlbnQoYywgbm9kZSkpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbi8qKlxuICogQHpoIOacgOe7iOaYr+WQpue7meacrOiKgueCueaMgiBjYy5MYXlvdXQg57uE5Lu277yaRWZmZWN0aXZlSGFzTGF5b3V0ICsg5Y+v5a6J5YWo5pig5bCE55qEIEdSSUQgKyDnuq/lh4DjgIJcbiAqL1xuZnVuY3Rpb24gc2hvdWxkTW91bnRMYXlvdXQobm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCFlZmZlY3RpdmVIYXNMYXlvdXQobm9kZSkgfHwgIWxheW91dENvbnRhaW5lcklzQ2xlYW4obm9kZSkpIHJldHVybiBmYWxzZTtcbiAgICBpZiAobm9kZS5sYXlvdXRNb2RlID09PSAnR1JJRCcpIHJldHVybiAhIWluZmVyTmF0aXZlR3JpZExheW91dChub2RlKTtcbiAgICBpZiAoIWlzV3JhcExheW91dChub2RlKSkgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuICEhaW5mZXJXcmFwR3JpZExheW91dChub2RlKTtcbn1cblxuLyoqIEB6aCBBdXRvTGF5b3V0IOeItuWuueWZqOS4i+WtkOiKgueCueaYr+WQpuW6lOW/veeVpeW4g+WxgO+8iOe7neWvueWumuS9jS/loavmu6HniLbnuqfvvInjgILnq6/lj6MgU2hvdWxkSWdub3JlTGF5b3V0KDUzNinjgIIgKi9cbmZ1bmN0aW9uIHNob3VsZElnbm9yZUxheW91dChub2RlOiBhbnksIHBhcmVudEhhc0xheW91dDogYm9vbGVhbiwgcGFyZW50OiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXBhcmVudEhhc0xheW91dCkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChpc0Fic29sdXRlUG9zaXRpb25lZChub2RlKSkgcmV0dXJuIHRydWU7XG4gICAgaWYgKGlzRmlsbFBhcmVudChub2RlLCBwYXJlbnQpKSByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKiBAemgg6IqC54K55piv5ZCm5pyJ6Z2e6buY6K6k57qm5p2f77yI6ZyAIGNvbnN0cmFpbnQtZHJpdmVuIOmUmueCue+8jOWNs+aMgiBXaWRnZXTvvInjgILnq6/lj6MgSGFzU3RyZXRjaENvbnN0cmFpbnQoODAyKeOAgiAqL1xuZnVuY3Rpb24gaGFzU3RyZXRjaENvbnN0cmFpbnQobm9kZTogYW55KTogYm9vbGVhbiB7XG4gICAgY29uc3QgYyA9IG5vZGUuY29uc3RyYWludHM7XG4gICAgaWYgKCFjKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgaCA9IGMuaG9yaXpvbnRhbCwgdiA9IGMudmVydGljYWw7XG4gICAgY29uc3QgaE5vbkRlZmF1bHQgPSAhIWggJiYgaCAhPT0gJ0xFRlQnO1xuICAgIGNvbnN0IHZOb25EZWZhdWx0ID0gISF2ICYmIHYgIT09ICdUT1AnO1xuICAgIHJldHVybiBoTm9uRGVmYXVsdCB8fCB2Tm9uRGVmYXVsdDtcbn1cblxuLyoqXG4gKiBAemgg5a2Q6IqC54K55bC65a+455Wl6LaF54i26IqC54K55pe26KOB5Yiw54i26L6555WM77yI5Y6f5Zyw5pS5IHcvaO+8ieOAguerr+WPoyBDbGFtcE92ZXJmbG93VG9QYXJlbnQoNTcwKeOAglxuICogICAgIEF1dG8tV2lkdGgg5paH5pys5peg5p2h5Lu25pS26L+b54i25YaF5a655Yy677yI6Ziy5o2i5a2X5L2T5ZCO5Y+Y5a695Y6L6YK76IqC54K577yJ44CCXG4gKi9cbmZ1bmN0aW9uIGNsYW1wT3ZlcmZsb3dUb1BhcmVudChub2RlOiBhbnksIHBhcmVudDogYW55LCBmaWxsc1BhcmVudDogYm9vbGVhbixcbiAgICBwYXJlbnRIYXNMYXlvdXQ6IGJvb2xlYW4sIGlnbm9yZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICghcGFyZW50KSByZXR1cm47XG4gICAgY29uc3QgcGFkID0gcGFyZW50LnBhZGRpbmcgfHwgeyBsZWZ0OiAwLCByaWdodDogMCwgdG9wOiAwLCBib3R0b206IDAgfTtcblxuICAgIGlmIChmaWxsc1BhcmVudCkge1xuICAgICAgICBub2RlLndpZHRoID0gcGFyZW50LndpZHRoO1xuICAgICAgICBub2RlLmhlaWdodCA9IHBhcmVudC5oZWlnaHQ7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAocGFyZW50SGFzTGF5b3V0ICYmICFpZ25vcmUpIHtcbiAgICAgICAgY29uc3QgaW5uZXJXID0gKHBhcmVudC53aWR0aCB8fCAwKSAtIChwYWQubGVmdCB8fCAwKSAtIChwYWQucmlnaHQgfHwgMCk7XG4gICAgICAgIGNvbnN0IGlubmVySCA9IChwYXJlbnQuaGVpZ2h0IHx8IDApIC0gKHBhZC50b3AgfHwgMCkgLSAocGFkLmJvdHRvbSB8fCAwKTtcbiAgICAgICAgY29uc3QgaXNBdXRvV2lkdGhUZXh0ID0gbm9kZS50eXBlID09PSAnVEVYVCcgJiYgbm9kZS50ZXh0QXV0b1Jlc2l6ZSA9PT0gJ1dJRFRIX0FORF9IRUlHSFQnO1xuICAgICAgICBpZiAoaXNBdXRvV2lkdGhUZXh0ICYmIGlubmVyVyA+IDAuNSAmJiBub2RlLndpZHRoID4gaW5uZXJXKSB7XG4gICAgICAgICAgICBub2RlLndpZHRoID0gaW5uZXJXO1xuICAgICAgICB9IGVsc2UgaWYgKG5vZGUud2lkdGggPiBpbm5lclcgJiYgKG5vZGUud2lkdGggLSBpbm5lclcpIDw9IExBWU9VVF9UT0wpIHtcbiAgICAgICAgICAgIG5vZGUud2lkdGggPSBpbm5lclc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5vZGUuaGVpZ2h0ID4gaW5uZXJIICYmIChub2RlLmhlaWdodCAtIGlubmVySCkgPD0gTEFZT1VUX1RPTCkge1xuICAgICAgICAgICAgbm9kZS5oZWlnaHQgPSBpbm5lckg7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCByaWdodE92ZXJmbG93ID0gKG5vZGUueCArIG5vZGUud2lkdGgpIC0gKHBhcmVudC53aWR0aCB8fCAwKTtcbiAgICAgICAgY29uc3QgYm90dG9tT3ZlcmZsb3cgPSAobm9kZS55ICsgbm9kZS5oZWlnaHQpIC0gKHBhcmVudC5oZWlnaHQgfHwgMCk7XG4gICAgICAgIGNvbnN0IG5lYXJMZWZ0T3JpZ2luID0gTWF0aC5hYnMobm9kZS54IHx8IDApIDwgRklMTF9PUklHSU5fVE9MO1xuICAgICAgICBjb25zdCBuZWFyVG9wT3JpZ2luID0gTWF0aC5hYnMobm9kZS55IHx8IDApIDwgRklMTF9PUklHSU5fVE9MO1xuICAgICAgICBpZiAobmVhckxlZnRPcmlnaW4gJiYgcmlnaHRPdmVyZmxvdyA+IDAgJiYgcmlnaHRPdmVyZmxvdyA8PSBMQVlPVVRfVE9MKSBub2RlLndpZHRoIC09IHJpZ2h0T3ZlcmZsb3c7XG4gICAgICAgIGlmIChuZWFyVG9wT3JpZ2luICYmIGJvdHRvbU92ZXJmbG93ID4gMCAmJiBib3R0b21PdmVyZmxvdyA8PSBMQVlPVVRfVE9MKSBub2RlLmhlaWdodCAtPSBib3R0b21PdmVyZmxvdztcbiAgICB9XG59XG5cbmV4cG9ydCBjb25zdCBtZXRob2RzOiB7IFtrZXk6IHN0cmluZ106ICguLi5hcmdzOiBhbnlbXSkgPT4gYW55IH0gPSB7XG4gICAgZ2V0U2NlbmVCdWlsZFZlcnNpb24oKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IFNDRU5FX0JVSUxEX1ZFUlNJT04sXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH0sXG5cbiAgICBnZXRDb21wb25lbnRTdGF0ZVJ1bnRpbWVSZXZpc2lvbigpIHtcbiAgICAgICAgY29uc3QgY2MgPSByZXF1aXJlKCdjYycpO1xuICAgICAgICBjb25zdCBzdGF0ZUNsYXNzID0gY2MgJiYgY2MuanMgJiYgdHlwZW9mIGNjLmpzLmdldENsYXNzQnlOYW1lID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICA/IGNjLmpzLmdldENsYXNzQnlOYW1lKEZJR01BX0NPTVBPTkVOVF9TVEFURV9DTEFTUylcbiAgICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgcmVnaXN0ZXJlZDogISFzdGF0ZUNsYXNzLFxuICAgICAgICAgICAgICAgIHJldmlzaW9uOiBzdGF0ZUNsYXNzICYmIE51bWJlcigoc3RhdGVDbGFzcyBhcyBhbnkpLmZ0b2NSdW50aW1lUmV2aXNpb24pIHx8IDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH0sXG5cbiAgICAvKiogQHpoIOivu+WPluaMh+WumuWcuuaZr+iKgueCueeahCBGaWdtYSDnu4Tku7bouqvku73vvIzkvpsgQXNzaWduIFByZWZhYiDpnaLmnb/kvb/nlKjjgIIgKi9cbiAgICBkZXNjcmliZUNvbXBvbmVudE1hcHBpbmdTZWxlY3Rpb24obm9kZVV1aWQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gY2MuZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBTdHJpbmcobm9kZVV1aWQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgIGlmICghdXVpZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgc3RhdHVzOiAnbm9uZScsIHJlYXNvbjogJ25vLXNlbGVjdGlvbicsIG5vZGVVdWlkOiAnJyB9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWQoc2NlbmUsIHV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogeyBzdGF0dXM6ICdub25lJywgcmVhc29uOiAnc2VsZWN0aW9uLXN0YWxlJywgbm9kZVV1aWQ6IHV1aWQgfSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgZGF0YTogZGVzY3JpYmVGaWdtYUNvbXBvbmVudFNlbGVjdGlvbihub2RlLCBjYykgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlLCBzdGFjazogZXJyb3Iuc3RhY2sgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBhcHBseUNvbXBvbmVudFN0YXRlcyhpdGVtczogTWFwcGVkQ29tcG9uZW50U3RhdGVSZXF1ZXN0W10pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gY2MuZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IHJlcXVlc3RzID0gQXJyYXkuaXNBcnJheShpdGVtcylcbiAgICAgICAgICAgICAgICA/IGl0ZW1zLmZpbHRlcigoaXRlbSkgPT4gISEoaXRlbSAmJiBpdGVtLm5vZGVVdWlkKSlcbiAgICAgICAgICAgICAgICA6IFtdO1xuICAgICAgICAgICAgbGV0IGF0dGFjaGVkID0gMDtcbiAgICAgICAgICAgIGxldCBtb3VudGVkID0gMDtcbiAgICAgICAgICAgIGxldCBvdmVycmlkZVRvdGFsID0gMDtcbiAgICAgICAgICAgIGxldCB1bmF2YWlsYWJsZSA9IDA7XG4gICAgICAgICAgICBsZXQgb3ZlcnJpZGVNaXNzaW5nID0gMDtcbiAgICAgICAgICAgIGxldCBhY3RpdmF0ZWQgPSAwO1xuICAgICAgICAgICAgY29uc3QgZmFpbHVyZXM6IEFycmF5PHsgbm9kZVV1aWQ6IHN0cmluZzsgc3RhdHVzOiBzdHJpbmcgfT4gPSBbXTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCByZXF1ZXN0IG9mIHJlcXVlc3RzKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlcXVlc3QgJiYgcmVxdWVzdC5yZXF1aXJlc1ByZWZhYk92ZXJyaWRlKSBvdmVycmlkZVRvdGFsKys7XG4gICAgICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlQnlVdWlkKHNjZW5lLCBTdHJpbmcocmVxdWVzdCAmJiByZXF1ZXN0Lm5vZGVVdWlkIHx8ICcnKSk7XG4gICAgICAgICAgICAgICAgaWYgKCFub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgIHVuYXZhaWxhYmxlKys7XG4gICAgICAgICAgICAgICAgICAgIGZhaWx1cmVzLnB1c2goeyBub2RlVXVpZDogU3RyaW5nKHJlcXVlc3QgJiYgcmVxdWVzdC5ub2RlVXVpZCB8fCAnJyksIHN0YXR1czogJ25vZGUtbWlzc2luZycgfSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0dXMgPSBhcHBseUNvbXBvbmVudFN0YXRlKG5vZGUsIHJlcXVlc3QsIGNjKTtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5hY3RpdmUgPT09IChyZXF1ZXN0LmFjdGl2ZSAhPT0gZmFsc2UpKSBhY3RpdmF0ZWQrKztcbiAgICAgICAgICAgICAgICBpZiAoc3RhdHVzID09PSAnYXR0YWNoZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dGFjaGVkKys7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXF1ZXN0LnJlcXVpcmVzUHJlZmFiT3ZlcnJpZGUpIG1vdW50ZWQrKztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB1bmF2YWlsYWJsZSsrO1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdHVzID09PSAnb3ZlcnJpZGUtbWlzc2luZycpIG92ZXJyaWRlTWlzc2luZysrO1xuICAgICAgICAgICAgICAgICAgICBmYWlsdXJlcy5wdXNoKHsgbm9kZVV1aWQ6IHJlcXVlc3Qubm9kZVV1aWQsIHN0YXR1cyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHRvdGFsOiByZXF1ZXN0cy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGF0dGFjaGVkLFxuICAgICAgICAgICAgICAgICAgICBtb3VudGVkLFxuICAgICAgICAgICAgICAgICAgICBvdmVycmlkZVRvdGFsLFxuICAgICAgICAgICAgICAgICAgICB1bmF2YWlsYWJsZSxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVNaXNzaW5nLFxuICAgICAgICAgICAgICAgICAgICBhY3RpdmF0ZWQsXG4gICAgICAgICAgICAgICAgICAgIGZhaWx1cmVzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UsIHN0YWNrOiBlcnJvci5zdGFjayB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJlc3RvcmUgb25seSBhdXRob3JlZCBhY3RpdmUgZmxhZ3MgYWZ0ZXIgYSBmYWlsZWQgY29tcG9uZW50LWFwcGx5IHBhc3MuXG4gICAgICogVGhpcyBpcyBpbnRlbnRpb25hbGx5IHNlcGFyYXRlIGZyb20gc3RhdGUgd3JpdGVzIHNvIGEgcmVjb3ZlcnkgY2Fubm90XG4gICAgICogY2xhaW0gdGhhdCBhIG1pc3NpbmcgY29tcG9uZW50IHdhcyBwZXJzaXN0ZWQuXG4gICAgICovXG4gICAgcmVzdG9yZUNvbXBvbmVudFN0YXRlQWN0aXZpdHkoaXRlbXM6IE1hcHBlZENvbXBvbmVudFN0YXRlUmVxdWVzdFtdKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjYyA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGNjLmRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCByZXF1ZXN0cyA9IEFycmF5LmlzQXJyYXkoaXRlbXMpXG4gICAgICAgICAgICAgICAgPyBpdGVtcy5maWx0ZXIoKGl0ZW0pID0+ICEhKGl0ZW0gJiYgaXRlbS5ub2RlVXVpZCkpXG4gICAgICAgICAgICAgICAgOiBbXTtcbiAgICAgICAgICAgIGxldCBhY3RpdmF0ZWQgPSAwO1xuICAgICAgICAgICAgY29uc3QgZmFpbHVyZXM6IEFycmF5PHsgbm9kZVV1aWQ6IHN0cmluZzsgc3RhdHVzOiBzdHJpbmcgfT4gPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcmVxdWVzdCBvZiByZXF1ZXN0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZChzY2VuZSwgU3RyaW5nKHJlcXVlc3Qubm9kZVV1aWQpKTtcbiAgICAgICAgICAgICAgICBpZiAoIW5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZmFpbHVyZXMucHVzaCh7IG5vZGVVdWlkOiByZXF1ZXN0Lm5vZGVVdWlkLCBzdGF0dXM6ICdub2RlLW1pc3NpbmcnIH0pO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbm9kZS5hY3RpdmUgPSByZXF1ZXN0LmFjdGl2ZSAhPT0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuYWN0aXZlID09PSAocmVxdWVzdC5hY3RpdmUgIT09IGZhbHNlKSkgYWN0aXZhdGVkKys7XG4gICAgICAgICAgICAgICAgZWxzZSBmYWlsdXJlcy5wdXNoKHsgbm9kZVV1aWQ6IHJlcXVlc3Qubm9kZVV1aWQsIHN0YXR1czogJ2FjdGl2ZS13cml0ZS1mYWlsZWQnIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdG90YWw6IHJlcXVlc3RzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZhdGVkLFxuICAgICAgICAgICAgICAgICAgICBmYWlsdXJlcyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlLCBzdGFjazogZXJyb3Iuc3RhY2sgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKiogQGRlcHJlY2F0ZWQgQ29tcGF0aWJpbGl0eSBhbGlhcyBmb3IgY2xpZW50cyB1c2luZyB0aGUgb2xkIG1hcHBlZC1vbmx5IG5hbWUuICovXG4gICAgYXBwbHlNYXBwZWRDb21wb25lbnRTdGF0ZXMoaXRlbXM6IE1hcHBlZENvbXBvbmVudFN0YXRlUmVxdWVzdFtdKSB7XG4gICAgICAgIHJldHVybiBtZXRob2RzLmFwcGx5Q29tcG9uZW50U3RhdGVzKGl0ZW1zKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIFJldHVybiB0aGUgbm9kZSB0aGF0IGltcG9ydGVkIFVJIHdpbGwgYmUgcGFyZW50ZWQgdW5kZXIuXG4gICAgICogQHpoIOi/lOWbnuWvvOWFpSBVSSDlsIbmjILovb3liLDnmoTniLboioLngrnvvIznlKjkuo4gbWFpbiDkvqflvIDlkK8gc2NlbmUgcmVjb3JkaW5nIC8g5L+d5a2Y5Yi35paw44CCXG4gICAgICovXG4gICAgZ2V0SW1wb3J0Q29udGV4dCgpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGZpbmQgfSA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgY2FudmFzID0gZmluZCgnQ2FudmFzJykgfHwgc2NlbmUuZ2V0Q2hpbGRCeU5hbWUoJ0NhbnZhcycpO1xuICAgICAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IGNhbnZhcyB8fCBzY2VuZTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IHBhcmVudE5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50TmFtZTogcGFyZW50Tm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2VuZVV1aWQ6IHNjZW5lLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHNjZW5lTmFtZTogc2NlbmUubmFtZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIEJ1aWxkIGEgcmVhbCBMYWJlbCBub2RlIHRyZWUga2V5ZWQgYnkgZmlnbWFQYXRoLCBhcyB0aGUgYXJ0LWVkaXRhYmxlIHRlbXBsYXRlIHJvb3QuXG4gICAgICogICAgIFBvcnQgb2YgVW5pdHkgRmlnbWFJbXBvcnRlcldpbmRvdy5CdWlsZFN0eWxlUm9vdEZyb21Kc29uIC8gQnVpbGROb2RlIC8gSW5pdFRleHRDaGlsZDpcbiAgICAgKiAgICAgZWFjaCBlbnRyeSBiZWNvbWVzIGEgTGFiZWwgbGVhZiBwbGFjZWQgYXQgaXRzIGZpZ21hUGF0aCBzbyBpbXBvcnQtc2lkZSBnZXRDaGlsZEJ5UGF0aCByZXNvbHZlcy5cbiAgICAgKiAgICAgUHJlc2V0cyBzdHJpbmcvZm9udFNpemUvY29sb3IvYWxpZ24vc3Ryb2tlL3NoYWRvdyBhcyB0aGUgYXJ0aXN0J3Mgc3RhcnRpbmcgcG9pbnQgb25seS5cbiAgICAgKiBAemgg5oyJIGZpZ21hUGF0aCDov5jljp/nnJ/lrp4gTGFiZWwg6IqC54K55qCR77yM5L2c5Li6576O5pyv5Y+v6LCD55qE5qih5p2/5qC577yI5a+56b2QIFVuaXR5IEJ1aWxkU3R5bGVSb290RnJvbUpzb27vvInjgIJcbiAgICAgKiAgICAg5Y+25a2Q6IqC54K55ZCNL+Wxgue6p+S4peagvOetieS6jiBmaWdtYVBhdGgg5q6177yM5L+d6K+B5a+85YWl5L6nIGdldENoaWxkQnlQYXRoIOWRveS4re+8m+aVsOWAvOS7heS9nOe+juacr+i1t+eCueOAglxuICAgICAqL1xuICAgIGFzeW5jIGJ1aWxkVGV4dFN0eWxlUm9vdChkYXRhOiBhbnkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIE5vZGUsIFVJVHJhbnNmb3JtLCBMYWJlbCwgQ29sb3IsIFZlYzIsIGZpbmQgfSA9IGNjO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuXG4gICAgICAgICAgICBjb25zdCBlbnRyaWVzOiBhbnlbXSA9IEFycmF5LmlzQXJyYXkoZGF0YSAmJiBkYXRhLmVudHJpZXMpID8gZGF0YS5lbnRyaWVzIDogW107XG4gICAgICAgICAgICBpZiAoZW50cmllcy5sZW5ndGggPT09IDApIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGVudHJpZXMnIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHJvb3ROYW1lID0gc2FuaXRpemVDb2Nvc05vZGVOYW1lKGRhdGEgJiYgZGF0YS5yb290TmFtZSwgJ1RleHRTdHlsZXMnKTtcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhcyA9IGZpbmQoJ0NhbnZhcycpIHx8IHNjZW5lLmdldENoaWxkQnlOYW1lKCdDYW52YXMnKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudE5vZGUgPSBjYW52YXMgfHwgc2NlbmU7XG5cbiAgICAgICAgICAgIC8vIOiLpeW3suWtmOWcqOWQjOWQjeaXp+aooeadv+ague+8jOWFiOenu+mZpO+8jOmBv+WFjeWPoOWKoOmHjeWkjeOAglxuICAgICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBwYXJlbnROb2RlLmdldENoaWxkQnlOYW1lKHJvb3ROYW1lKTtcbiAgICAgICAgICAgIGlmIChleGlzdGluZykgZXhpc3RpbmcuZGVzdHJveSgpO1xuXG4gICAgICAgICAgICBjb25zdCByb290ID0gbmV3IE5vZGUocm9vdE5hbWUpO1xuICAgICAgICAgICAgcm9vdC5hZGRDb21wb25lbnQoVUlUcmFuc2Zvcm0pO1xuICAgICAgICAgICAgcGFyZW50Tm9kZS5hZGRDaGlsZChyb290KTtcblxuICAgICAgICAgICAgY29uc3QgZW5zdXJlQ2hpbGQgPSAocGFyZW50OiBhbnksIHNlZ05hbWU6IHN0cmluZyk6IGFueSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2FmZVNlZ21lbnROYW1lID0gc2FuaXRpemVDb2Nvc05vZGVOYW1lKHNlZ05hbWUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZvdW5kID0gcGFyZW50LmdldENoaWxkQnlOYW1lKHNhZmVTZWdtZW50TmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKGZvdW5kKSByZXR1cm4gZm91bmQ7XG4gICAgICAgICAgICAgICAgY29uc3QgY2hpbGQgPSBuZXcgTm9kZShzYWZlU2VnbWVudE5hbWUpO1xuICAgICAgICAgICAgICAgIGNoaWxkLmFkZENvbXBvbmVudChVSVRyYW5zZm9ybSk7XG4gICAgICAgICAgICAgICAgcGFyZW50LmFkZENoaWxkKGNoaWxkKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2hpbGQ7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBsZXQgbGVhZkNvdW50ID0gMDtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpZ21hUGF0aCA9IFN0cmluZyhlbnRyeS5maWdtYVBhdGggfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICBpZiAoIWZpZ21hUGF0aCkgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VncyA9IGZpZ21hUGF0aC5zcGxpdCgnLycpLm1hcCgocykgPT4gcy50cmltKCkpLmZpbHRlcigocykgPT4gcy5sZW5ndGggPiAwKTtcbiAgICAgICAgICAgICAgICBpZiAoc2Vncy5sZW5ndGggPT09IDApIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgLy8g5rK/IGZpZ21hUGF0aCDlu7ov5om+5Lit6Ze06IqC54K577yM5pyA5ZCO5LiA5q615pivIExhYmVsIOWPtuWtkOOAglxuICAgICAgICAgICAgICAgIGxldCBjdXJzb3IgPSByb290O1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2Vncy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjdXJzb3IgPSBlbnN1cmVDaGlsZChjdXJzb3IsIHNlZ3NbaV0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gY3Vyc29yLmdldENvbXBvbmVudChMYWJlbCkgfHwgY3Vyc29yLmFkZENvbXBvbmVudChMYWJlbCk7XG4gICAgICAgICAgICAgICAgbGFiZWwuc3RyaW5nID0gU3RyaW5nKGVudHJ5LmZpZ21hU2FtcGxlVGV4dCB8fCBlbnRyeS5zdHlsZU5hbWUgfHwgc2Vnc1tzZWdzLmxlbmd0aCAtIDFdIHx8ICfmoLfkvovmloflrZcnKTtcbiAgICAgICAgICAgICAgICBpZiAoZW50cnkuZmlnbWFGb250U2l6ZSkge1xuICAgICAgICAgICAgICAgICAgICBsYWJlbC5mb250U2l6ZSA9IGVudHJ5LmZpZ21hRm9udFNpemU7XG4gICAgICAgICAgICAgICAgICAgIGxhYmVsLmxpbmVIZWlnaHQgPSBlbnRyeS5maWdtYUxpbmVIZWlnaHQgPiAwID8gZW50cnkuZmlnbWFMaW5lSGVpZ2h0IDogZW50cnkuZmlnbWFGb250U2l6ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFiZWwuaG9yaXpvbnRhbEFsaWduID0gbWFwSEFsaWduKExhYmVsLCBlbnRyeS5maWdtYUFsaWduSCk7XG4gICAgICAgICAgICAgICAgbGFiZWwudmVydGljYWxBbGlnbiA9IG1hcFZBbGlnbihMYWJlbCwgZW50cnkuZmlnbWFBbGlnblYpO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgY29sID0gZW50cnkuZmlnbWFDb2xvciB8fCBlbnRyeS5jb2xvcjtcbiAgICAgICAgICAgICAgICBpZiAoY29sKSBsYWJlbC5jb2xvciA9IG5ldyBDb2xvcihjb2wuciwgY29sLmcsIGNvbC5iLCBjb2wuYSA9PSBudWxsID8gMjU1IDogY29sLmEpO1xuXG4gICAgICAgICAgICAgICAgLy8g5o+P6L65IC8g5oqV5b2x77ya6aKE6K6+5pWw5YC85L2c5Li6576O5pyv6LW354K577yI576O5pyv5Lya5Zyo5q2k5Z+656GA5LiK5omL6YWN5p2Q6LSoL+W+ruiwg++8ieOAglxuICAgICAgICAgICAgICAgIGlmIChlbnRyeS5zdHJva2UgJiYgZW50cnkuc3Ryb2tlLmNvbG9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0ID0gZW50cnkuc3Ryb2tlO1xuICAgICAgICAgICAgICAgICAgICBsYWJlbC5lbmFibGVPdXRsaW5lID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwub3V0bGluZUNvbG9yID0gbmV3IENvbG9yKHN0LmNvbG9yLnIsIHN0LmNvbG9yLmcsIHN0LmNvbG9yLmIsIHN0LmNvbG9yLmEgPT0gbnVsbCA/IDI1NSA6IHN0LmNvbG9yLmEpO1xuICAgICAgICAgICAgICAgICAgICBsYWJlbC5vdXRsaW5lV2lkdGggPSBzdC53aWR0aCB8fCAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZW50cnkuc2hhZG93ICYmIGVudHJ5LnNoYWRvdy5jb2xvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzaCA9IGVudHJ5LnNoYWRvdztcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwuZW5hYmxlU2hhZG93ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwuc2hhZG93Q29sb3IgPSBuZXcgQ29sb3Ioc2guY29sb3Iuciwgc2guY29sb3IuZywgc2guY29sb3IuYiwgc2guY29sb3IuYSA9PSBudWxsID8gMjU1IDogc2guY29sb3IuYSk7XG4gICAgICAgICAgICAgICAgICAgIGxhYmVsLnNoYWRvd09mZnNldCA9IG5ldyBWZWMyKHNoLm9mZnNldFggfHwgMCwgLShzaC5vZmZzZXRZIHx8IDApKTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwuc2hhZG93Qmx1ciA9IHNoLmJsdXIgfHwgMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGVhZkNvdW50Kys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgcm9vdFV1aWQ6IHJvb3QudXVpZCwgcm9vdE5hbWUsIGxlYWZDb3VudCB9IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBDcmVhdGUgb25lIGVtcHR5IG5vZGUgdW5kZXIgdGhlIGN1cnJlbnQgc2NlbmUgcm9vdC5cbiAgICAgKiBAemgg5Zyo5b2T5YmN5Zy65pmv5qC55LiL5bu65LiA5Liq56m66IqC54K544CCXG4gICAgICovXG4gICAgY3JlYXRlRW1wdHlOb2RlKG5hbWU6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciwgTm9kZSB9ID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBuZXcgTm9kZShzYW5pdGl6ZUNvY29zTm9kZU5hbWUobmFtZSkpO1xuICAgICAgICAgICAgc2NlbmUuYWRkQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiB7IHV1aWQ6IG5vZGUudXVpZCwgbmFtZTogbm9kZS5uYW1lIH0gfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIEJ1aWxkIHRoZSB3aG9sZSBub2RlIHRyZWUgKHN0YWdlIDI6IHBvc2l0aW9uL3NpemUgKyBpbWFnZSBzcHJpdGVzKS5cbiAgICAgKiBAemgg5bu65pW05qO16IqC54K55qCR77yI6Zi25q61IDLvvJrlnZDmoIflsLrlr7ggKyDlm77niYfnsr7ngbXvvInjgIJcbiAgICAgKi9cbiAgICBhc3luYyBidWlsZFRyZWUoZGF0YTogYW55KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgJWNbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIGJ1aWxkVHJlZSDov5DooYwgwrcg5p6E5bu654mI5pysID0gJHtTQ0VORV9CVUlMRF9WRVJTSU9OfWAsICdjb2xvcjojMDhjO2ZvbnQtd2VpZ2h0OmJvbGQnKTtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIE5vZGUsIFVJVHJhbnNmb3JtLCBVSU9wYWNpdHksIFZlYzMsIFZlYzIsIFJlY3QsIFNpemUsIGZpbmQsIFNwcml0ZSwgTGFiZWwsIENvbG9yLCBhc3NldE1hbmFnZXIsIFdpZGdldCwgTWFzaywgRm9udCwgR3JhcGhpY3MsIFJpY2hUZXh0LCBCdXR0b24sIEVkaXRCb3gsIExheW91dCwgaW5zdGFudGlhdGUgfSA9IGNjO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZGF0YSB8fCAhZGF0YS5yb290KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnSW52YWxpZCBkYXRhOiBtaXNzaW5nIHJvb3QnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIOW4piBVSVRyYW5zZm9ybSDnmoQgMkQg6IqC54K55b+F6aG75oyC5ZyoIENhbnZhcyDkuIvmiY3muLLmn5PjgILmm7/mjaIgYmV0YSDlj6/mjIflrprljp/niLboioLngrnph43lu7rjgIJcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhcyA9IGZpbmQoJ0NhbnZhcycpIHx8IHNjZW5lLmdldENoaWxkQnlOYW1lKCdDYW52YXMnKTtcbiAgICAgICAgICAgIGxldCBwYXJlbnROb2RlID0gY2FudmFzIHx8IHNjZW5lO1xuICAgICAgICAgICAgaWYgKGRhdGEucGFyZW50VXVpZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGN1c3RvbVBhcmVudCA9IGZpbmROb2RlQnlVdWlkKHNjZW5lLCBTdHJpbmcoZGF0YS5wYXJlbnRVdWlkKSk7XG4gICAgICAgICAgICAgICAgaWYgKGN1c3RvbVBhcmVudCkgcGFyZW50Tm9kZSA9IGN1c3RvbVBhcmVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJlcXVlc3RlZFNpYmxpbmdJbmRleCA9IHR5cGVvZiBkYXRhLnNpYmxpbmdJbmRleCA9PT0gJ251bWJlcicgPyBkYXRhLnNpYmxpbmdJbmRleCA6IC0xO1xuXG4gICAgICAgICAgICBjb25zdCBwYXJlbnRVaSA9IHBhcmVudE5vZGUuZ2V0Q29tcG9uZW50ICYmIHBhcmVudE5vZGUuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICAgICAgICAgIGNvbnN0IHBhcmVudFNpemUgPSBkYXRhLnBhcmVudFV1aWQgJiYgcGFyZW50VWkgPyByZWFkVWlTaXplKHBhcmVudFVpKSA6IHsgd2lkdGg6IDAsIGhlaWdodDogMCB9O1xuICAgICAgICAgICAgY29uc3QgY2FudmFzVyA9IChwYXJlbnRTaXplLndpZHRoID4gMCA/IHBhcmVudFNpemUud2lkdGggOiAwKSB8fCAoZGF0YS5jYW52YXMgJiYgZGF0YS5jYW52YXMud2lkdGgpIHx8IGRhdGEucm9vdC53aWR0aDtcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhc0ggPSAocGFyZW50U2l6ZS5oZWlnaHQgPiAwID8gcGFyZW50U2l6ZS5oZWlnaHQgOiAwKSB8fCAoZGF0YS5jYW52YXMgJiYgZGF0YS5jYW52YXMuaGVpZ2h0KSB8fCBkYXRhLnJvb3QuaGVpZ2h0O1xuICAgICAgICAgICAgY29uc3QgaWRUb1Nwcml0ZUZyYW1lID0gZGF0YS5pZFRvU3ByaXRlRnJhbWUgfHwge307XG4gICAgICAgICAgICBjb25zdCBpZFRvTWFza1Nwcml0ZUZyYW1lID0gZGF0YS5pZFRvTWFza1Nwcml0ZUZyYW1lIHx8IHt9O1xuICAgICAgICAgICAgLy8g5bey6JC955uYL+WkjeeUqOaIkOWKn+S9hiBTcHJpdGVGcmFtZSDlrZDotYTmupDlsJrmnKrlsLHnu6rnmoTlm77vvJrlu7rmoJHlhYjmjILlk4HnuqLljaDkvY3vvIznlLEgbWFpbiDlkI7lj7DlsLHnu6rlkI7mm7/mjaLjgIJcbiAgICAgICAgICAgIC8vIOS7heaZrumAmiBTcHJpdGUg6LWw5q2k5py65Yi277yI57y65Zu+5ZOB57qi5piv5a6D55qE55eH54q277yJ77yb6YGu572p5Li6IDAg5qC35pys5pyq6aqM6K+B6Lev5b6E77yM57y6IHV1aWQg5pe25bey5LyY6ZuF5Zue6YCA55+p5b2i6YGu572p77yM5LiN5Zyo5q2k6IyD5Zu044CCXG4gICAgICAgICAgICBjb25zdCB1bnJlc29sdmVkID0gZGF0YS51bnJlc29sdmVkIHx8IHt9O1xuICAgICAgICAgICAgY29uc3QgY29tcG9uZW50TWFwcGluZ3M6IENvbXBvbmVudE1hcHBpbmdFbnRyeVtdID0gQXJyYXkuaXNBcnJheShkYXRhLmNvbXBvbmVudE1hcHBpbmdzKVxuICAgICAgICAgICAgICAgID8gZGF0YS5jb21wb25lbnRNYXBwaW5nc1xuICAgICAgICAgICAgICAgIDogW107XG4gICAgICAgICAgICBjb25zdCBjb21wb25lbnRTdGF0ZVJ1bnRpbWVBdmFpbGFibGUgPSBkYXRhLmNvbXBvbmVudFN0YXRlUnVudGltZVJlYWR5ICE9PSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGZhbGxiYWNrVWlMYXllciA9IChjYy5MYXllcnMgJiYgY2MuTGF5ZXJzLkVudW0gJiYgY2MuTGF5ZXJzLkVudW0uVUlfMkQpIHx8ICgxIDw8IDI1KTtcbiAgICAgICAgICAgIGNvbnN0IGltcG9ydGVkTGF5ZXIgPSB0eXBlb2YgcGFyZW50Tm9kZS5sYXllciA9PT0gJ251bWJlcicgPyBwYXJlbnROb2RlLmxheWVyIDogZmFsbGJhY2tVaUxheWVyO1xuXG4gICAgICAgICAgICBsZXQgY291bnQgPSAwO1xuICAgICAgICAgICAgLy8g5b6F5Yqg6L2955qE5Zu+54mH77yaeyBzcHJpdGUg57uE5Lu2LCBTcHJpdGVGcmFtZSB1dWlkIH1cbiAgICAgICAgICAgIGNvbnN0IHBlbmRpbmdTcHJpdGVzOiBQZW5kaW5nU3ByaXRlTG9hZFtdID0gW107XG4gICAgICAgICAgICAvLyDlvoXliqDovb3nmoTpga7nvanlm77vvJp7IG1hc2sg57uE5Lu2LCBTcHJpdGVGcmFtZSB1dWlkIH1cbiAgICAgICAgICAgIGNvbnN0IHBlbmRpbmdNYXNrczogQXJyYXk8eyBzcHJpdGU6IGFueTsgdXVpZDogc3RyaW5nIH0+ID0gW107XG4gICAgICAgICAgICAvLyDlvoXlsLHnu6rmm7/mjaLnmoTlk4HnuqLljaDkvY3vvJrlm77lt7LokL3nm5jkvYblrZDotYTmupDmnKrlsLHnu6rvvIzlhYjmjILlk4HnuqLljaDkvY3vvIzorrDlvZXoioLngrkgdXVpZCArIOWKoOi9veWPguaVsO+8jFxuICAgICAgICAgICAgLy8g55SxIG1haW4g5ZCO5Y+w6L2u6K+i5bCx57uq5ZCO6LCDIHJlcGxhY2VJbWFnZVBsYWNlaG9sZGVycyDmjIkgbm9kZVV1aWQg5a6a5L2N5pu/5o2i5oiQ55yf5Zu+44CCXG4gICAgICAgICAgICBjb25zdCB1bnJlc29sdmVkUGxhY2Vob2xkZXJzOiBJbWFnZVBsYWNlaG9sZGVyUmVjb3JkW10gPSBbXTtcbiAgICAgICAgICAgIC8vIOW+heWKoOi9veeahOWtl+S9k++8mnsgbGFiZWwg57uE5Lu2LCBGb250IHV1aWQgfe+8iOmYtuautSA1IOWtl+S9k+agt+W8j+W6k++8iVxuICAgICAgICAgICAgY29uc3QgcGVuZGluZ0ZvbnRzOiBBcnJheTx7IHRhcmdldDogYW55OyB1dWlkOiBzdHJpbmc7IGZpbGVOYW1lOiBzdHJpbmc7IGZhbGxiYWNrQm9sZDogYm9vbGVhbjsgcmljaDogYm9vbGVhbiB9PiA9IFtdO1xuICAgICAgICAgICAgLy8g5a2X5L2TL+aooeadv+WujOaIkOWQjuWGjeW7uueri+aMgeS5heWMliBjb21wYW5pb27vvIznoa7kv53kuLsv5b2x5Lik5bGC5L2/55So5ZCM5LiA5bel56iL5a2X5L2T44CCXG4gICAgICAgICAgICBjb25zdCBwZW5kaW5nUmljaFRleHRTaGFkb3dzOiBBcnJheTx7IGF1dGhvcmVkTm9kZTogYW55OyB0YXJnZXQ6IGFueTsgZmlnbWFOb2RlOiBhbnkgfT4gPSBbXTtcbiAgICAgICAgICAgIC8vIElucHV0IOeahOWOn+eUnyBwbGFjZWhvbGRlci90ZXh0IExhYmVsIOimgeetiSBhdXRob3JlZCDmlofmnKzlrozmiJDlvILmraXlrZfkvZMv5qih5p2/5Yqg6L295ZCO5YaN5ZCM5q2l5LiA5qyh44CCXG4gICAgICAgICAgICBjb25zdCBwZW5kaW5nSW5wdXRMYWJlbFN0eWxlczogQXJyYXk8eyBzb3VyY2U6IGFueTsgdGFyZ2V0OiBhbnkgfT4gPSBbXTtcbiAgICAgICAgICAgIC8vIOW+heWll+eUqOeahOWtl+S9k+agt+W8j+aooeadv++8muS7jue+juacr+aJi+mFjeeahCBwcmVmYWIg5YWL6ZqG5aSW6KeC5Yiw5a+85YWlIExhYmVs77yI546vNCDmlbTnu4Tku7blhYvpmobnmoQgQ29jb3Mg54mI77yJ44CCXG4gICAgICAgICAgICBjb25zdCBwZW5kaW5nVGVtcGxhdGVzOiBBcnJheTx7XG4gICAgICAgICAgICAgICAgdGFyZ2V0OiBhbnk7XG4gICAgICAgICAgICAgICAgcHJlZmFiVXVpZDogc3RyaW5nO1xuICAgICAgICAgICAgICAgIGZpZ21hUGF0aDogc3RyaW5nO1xuICAgICAgICAgICAgICAgIHRpZXI6IHN0cmluZztcbiAgICAgICAgICAgICAgICBmb250T25seTogYm9vbGVhbjtcbiAgICAgICAgICAgICAgICByZXNvbHZlckZvbnRVdWlkOiBzdHJpbmc7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZXJGb250RmlsZU5hbWU6IHN0cmluZztcbiAgICAgICAgICAgIH0+ID0gW107XG4gICAgICAgICAgICBjb25zdCB0ZXh0U3R5bGVTaWduYXR1cmVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gICAgICAgICAgICBsZXQgbGFiZWxzV2l0aFRleHRTdHlsZU5hbWUgPSAwO1xuICAgICAgICAgICAgbGV0IHNvbGlkRmlsbHMgPSAwO1xuICAgICAgICAgICAgbGV0IHJpY2hUZXh0cyA9IDA7XG4gICAgICAgICAgICBsZXQgYnV0dG9ucyA9IDA7XG4gICAgICAgICAgICBsZXQgZWRpdEJveGVzID0gMDtcbiAgICAgICAgICAgIGxldCB0ZXh0U3R5bGVUZW1wbGF0ZUxhYmVscyA9IDA7XG4gICAgICAgICAgICBsZXQgZ3JhZGllbnRUZXh0RmFsbGJhY2tzID0gMDtcbiAgICAgICAgICAgIGxldCByaWNoVGV4dFNoYWRvd3MgPSAwO1xuICAgICAgICAgICAgbGV0IHJpY2hUZXh0U2hhZG93Qmx1ckZhbGxiYWNrcyA9IDA7XG4gICAgICAgICAgICBsZXQgdGVtcGxhdGVzQXBwbGllZCA9IDA7XG4gICAgICAgICAgICBsZXQgb3ZlcmxheVRpbnRzID0gMDtcbiAgICAgICAgICAgIGxldCB0cmFuc3BhcmVudFJlY3RhbmdsZXMgPSAwO1xuICAgICAgICAgICAgbGV0IG1pc3NpbmdJbWFnZXMgPSAwO1xuICAgICAgICAgICAgbGV0IGNyb3BwZWRJbWFnZUZpbGxzID0gMDtcbiAgICAgICAgICAgIGxldCBtYXBwZWRQcmVmYWJzID0gMDtcbiAgICAgICAgICAgIGxldCB1bm1hcHBlZENvbXBvbmVudHMgPSAwO1xuICAgICAgICAgICAgbGV0IGJyb2tlbkNvbXBvbmVudE1hcHBpbmdzID0gMDtcbiAgICAgICAgICAgIGxldCBmYWlsZWRQcmVmYWJJbnN0YW5jZXMgPSAwO1xuICAgICAgICAgICAgbGV0IGNvbXBvbmVudFN0YXRlc0F0dGFjaGVkID0gMDtcbiAgICAgICAgICAgIGxldCBjb21wb25lbnRTdGF0ZVVuYXZhaWxhYmxlID0gMDtcbiAgICAgICAgICAgIGxldCBjb21wb25lbnRTdGF0ZVVuYXZhaWxhYmxlV2FybmVkID0gZmFsc2U7XG4gICAgICAgICAgICAvLyBBbGwgY29tcG9uZW50S2V5IG5vZGVzIHVzZSBvbmUgZWRpdG9yLWZhY2FkZSBwYXNzLiBNYXBwZWQgUHJlZmFiXG4gICAgICAgICAgICAvLyByb290cyBjYXJyeSByZXF1aXJlc1ByZWZhYk92ZXJyaWRlPXRydWU7IG9yZGluYXJ5IGZhbGxiYWNrIG5vZGVzXG4gICAgICAgICAgICAvLyB1c2UgdGhlIHNhbWUgcGVyc2lzdGVkIGNvbXBvbmVudCBwYXRoIHdpdGhvdXQgdGhhdCBleHRyYSBjaGVjay5cbiAgICAgICAgICAgIGNvbnN0IHBlbmRpbmdDb21wb25lbnRTdGF0ZXM6IE1hcHBlZENvbXBvbmVudFN0YXRlUmVxdWVzdFtdID0gW107XG4gICAgICAgICAgICAvLyDlr7zlhaXmoLnoioLngrnvvIjkvpvlr7zlhaXlkI7kuLvliqjliLfmlrDnvJbovpHlmajnlKjvvIlcbiAgICAgICAgICAgIGxldCBpbXBvcnRlZFJvb3Q6IGFueSA9IG51bGw7XG4gICAgICAgICAgICAvLyBJbnB1dCDljY/orq7pgJrov4cgRmlnbWEgaWQg5oyH5ZCRIGF1dGhvcmVkIOebtOaOpeWtkOiKgueCue+8m+aYoOWwhOS7heWcqOacrOi9ruW7uuagkeacn+mXtOS9v+eUqOOAglxuICAgICAgICAgICAgY29uc3QgZmlnbWFJZFRvTm9kZSA9IG5ldyBNYXA8c3RyaW5nLCBhbnk+KCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHByZWZhYkNhY2hlOiB7IFt1dWlkOiBzdHJpbmddOiBhbnkgfSA9IHt9O1xuICAgICAgICAgICAgY29uc3QgbWFwcGVkUHJlZmFiVXVpZHMgPSBBcnJheS5mcm9tKG5ldyBTZXQoXG4gICAgICAgICAgICAgICAgY29tcG9uZW50TWFwcGluZ3MubWFwKChlbnRyeSkgPT4gU3RyaW5nKGVudHJ5ICYmIGVudHJ5LnByZWZhYlV1aWQgfHwgJycpKS5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwobWFwcGVkUHJlZmFiVXVpZHMubWFwKGFzeW5jICh1dWlkKSA9PiB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcHJlZmFiQ2FjaGVbdXVpZF0gPSBhd2FpdCBsb2FkUHJlZmFiQXNzZXQoYXNzZXRNYW5hZ2VyLCB1dWlkKSB8fCBudWxsO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICBwcmVmYWJDYWNoZVt1dWlkXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSDnu4Tku7bmmKDlsIQgUHJlZmFiIOWKoOi9veWksei0pe+8jOWwhuWbnumAgOWxleW8gO+8micsIHV1aWQsIChlcnIgYXMgYW55KT8ubWVzc2FnZSB8fCBlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgY29uc3QgcmVjb3JkU3RhdGVSZXN1bHQgPSAocmVzdWx0OiAnYXR0YWNoZWQnIHwgJ3VuYXZhaWxhYmxlJyk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQgPT09ICdhdHRhY2hlZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50U3RhdGVzQXR0YWNoZWQrKztcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb21wb25lbnRTdGF0ZVVuYXZhaWxhYmxlKys7XG4gICAgICAgICAgICAgICAgaWYgKCFjb21wb25lbnRTdGF0ZVVuYXZhaWxhYmxlV2FybmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0YXRlVW5hdmFpbGFibGVXYXJuZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSAke0ZJR01BX0NPTVBPTkVOVF9TVEFURV9DTEFTU30g5bCa5pyq5bCx57uq77ybYCArXG4gICAgICAgICAgICAgICAgICAgICAgICAn57uE5Lu26IqC54K55LuN5Lya5a6M5oiQ77yM5L2G5pys5qyh5a6e5L6L5LiN5ZCrIEZpZ21hIOeKtuaAgeOAgidcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBVbml0eSDnmoTmloflrZfmoLflvI/kvJrmlbTkvZPlpI3liLYgVE1QIOS4jumineWkluagt+W8j+e7hOS7tuOAgkNvY29zIOWcqOmAkuW9kuW7uuagkeWJjeWKoOi9vSBFeGFjdCDmqKHmnb/vvIxcbiAgICAgICAgICAgIC8vIOmaj+WQjuebtOaOpeWFi+mahuaWh+Wtl+WPtuiKgueCue+8jOaJjeiDveiuqeadkOi0qOOAgeiHquWumuS5ieiEmuacrOWPiue7hOS7tuW8leeUqOS4gOi1t+S/neeVmeS4i+adpeOAglxuICAgICAgICAgICAgY29uc3QgZXhhY3RUZXh0VGVtcGxhdGVSb290czogeyBbdXVpZDogc3RyaW5nXTogYW55IH0gPSB7fTtcbiAgICAgICAgICAgIGF3YWl0IFByb21pc2UuYWxsKGNvbGxlY3RFeGFjdFRleHRTdHlsZVRlbXBsYXRlVXVpZHMoZGF0YS5yb290KS5tYXAoYXN5bmMgKHV1aWQpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWIgPSBhd2FpdCBsb2FkUHJlZmFiQXNzZXQoYXNzZXRNYW5hZ2VyLCB1dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgZXhhY3RUZXh0VGVtcGxhdGVSb290c1t1dWlkXSA9IHByZWZhYiA/IGluc3RhbnRpYXRlKHByZWZhYikgOiBudWxsO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgICAgICBleGFjdFRleHRUZW1wbGF0ZVJvb3RzW3V1aWRdID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIEV4YWN0IOaWh+Wtl+aooeadvyBQcmVmYWIg5Yqg6L295aSx6LSl77yM5pS56LWw5pWw5YC86ZmN57qnOicsIHV1aWQsIChlcnIgYXMgYW55KT8ubWVzc2FnZSB8fCBlcnIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAgICAgLyoqIEB6aCDnu53lr7nlrprkvY3vvJrmjInoioLngrnplJrngrnlupTnlKggRmlnbWHihpJDb2NvcyDlnZDmoIflhazlvI/jgIIgKi9cbiAgICAgICAgICAgIGNvbnN0IHBsYWNlQWJzb2x1dGUgPSAobm9kZTogYW55LCBmaWdtYU5vZGU6IGFueSwgdzogbnVtYmVyLCBoOiBudW1iZXIsXG4gICAgICAgICAgICAgICAgcGFyZW50VzogbnVtYmVyLCBwYXJlbnRIOiBudW1iZXIsIG1vdW50ZWRMYXlvdXRNb2RlPzogc3RyaW5nLFxuICAgICAgICAgICAgICAgIGFuY2hvclggPSAwLjUsIGFuY2hvclkgPSAwLjUpOiB2b2lkID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBwb3MgPSBwb3NpdGlvbkZvclRyYW5zZm9ybWVkQW5jaG9yKFxuICAgICAgICAgICAgICAgICAgICBmaWdtYU5vZGUueCxcbiAgICAgICAgICAgICAgICAgICAgZmlnbWFOb2RlLnksXG4gICAgICAgICAgICAgICAgICAgIHcsXG4gICAgICAgICAgICAgICAgICAgIGgsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudFcsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudEgsXG4gICAgICAgICAgICAgICAgICAgIGFuY2hvclgsXG4gICAgICAgICAgICAgICAgICAgIGFuY2hvclksXG4gICAgICAgICAgICAgICAgICAgIHR5cGVvZiBmaWdtYU5vZGUuc2NhbGVYID09PSAnbnVtYmVyJyA/IGZpZ21hTm9kZS5zY2FsZVggOiAxLFxuICAgICAgICAgICAgICAgICAgICB0eXBlb2YgZmlnbWFOb2RlLnNjYWxlWSA9PT0gJ251bWJlcicgPyBmaWdtYU5vZGUuc2NhbGVZIDogMSxcbiAgICAgICAgICAgICAgICAgICAgTnVtYmVyKGZpZ21hTm9kZS5yb3RhdGlvbikgfHwgMCxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGluaXRpYWxQb3NpdGlvbiA9IHBvc2l0aW9uQmVmb3JlTW91bnRlZExheW91dChwb3MsIG1vdW50ZWRMYXlvdXRNb2RlKTtcbiAgICAgICAgICAgICAgICBub2RlLnNldFBvc2l0aW9uKG5ldyBWZWMzKGluaXRpYWxQb3NpdGlvbi54LCBpbml0aWFsUG9zaXRpb24ueSwgMCkpO1xuICAgICAgICAgICAgICAgIG5vZGUuYW5nbGUgPSAtKGZpZ21hTm9kZS5yb3RhdGlvbiB8fCAwKTtcbiAgICAgICAgICAgICAgICBub2RlLnNldFNjYWxlKG5ldyBWZWMzKFxuICAgICAgICAgICAgICAgICAgICB0eXBlb2YgZmlnbWFOb2RlLnNjYWxlWCA9PT0gJ251bWJlcicgPyBmaWdtYU5vZGUuc2NhbGVYIDogMSxcbiAgICAgICAgICAgICAgICAgICAgdHlwZW9mIGZpZ21hTm9kZS5zY2FsZVkgPT09ICdudW1iZXInID8gZmlnbWFOb2RlLnNjYWxlWSA6IDEsXG4gICAgICAgICAgICAgICAgICAgIDFcbiAgICAgICAgICAgICAgICApKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQHpoIOiHquWKqOW4g+WxgCDihpIgY2MuTGF5b3V077yI56uv5Y+jIFVuaXR5IFNldHVwTGF5b3V0IDIxMTEgKyBNYXBMYXlvdXRBbGlnbm1lbnQgMjE5MO+8ieOAglxuICAgICAgICAgICAgICogICAgIHJlc2l6ZU1vZGU9Tk9ORe+8muWPquaMiSBzcGFjaW5nL3BhZGRpbmcv5pa55ZCR5o6S5YiX5a2Q6IqC54K55L2N572u77yM5LiN5pS55a2Q6IqC54K55bC65a+4XG4gICAgICAgICAgICAgKiAgICAg77yI5a+56b2QIFVuaXR5IGNoaWxkQ29udHJvbCAvIGNoaWxkRm9yY2VFeHBhbmQgLyBjaGlsZFNjYWxlIOWFqCBmYWxzZe+8ieOAglxuICAgICAgICAgICAgICogICAgIEZpZ21hIG5hdGl2ZSBHUklEIGFuZCByZWd1bGFyIFdyYXAgYm90aCBtYXAgdG8gY2MuTGF5b3V0LkdSSUQ7XG4gICAgICAgICAgICAgKiAgICAgaXJyZWd1bGFyL3NwYXJzZSBsYXlvdXRzIGFyZSBmaWx0ZXJlZCBieSBzaG91bGRNb3VudExheW91dC5cbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgY29uc3QgYXBwbHlMYXlvdXQgPSAobm9kZTogYW55LCBmaWdtYU5vZGU6IGFueSk6IHZvaWQgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxheW91dCA9IG5vZGUuYWRkQ29tcG9uZW50KExheW91dCk7XG4gICAgICAgICAgICAgICAgbGF5b3V0LnJlc2l6ZU1vZGUgPSBMYXlvdXQuUmVzaXplTW9kZS5OT05FO1xuICAgICAgICAgICAgICAgIGxheW91dC5hZmZlY3RlZEJ5U2NhbGUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYWQgPSBmaWdtYU5vZGUucGFkZGluZyB8fCB7fTtcbiAgICAgICAgICAgICAgICBsYXlvdXQucGFkZGluZ0xlZnQgPSBNYXRoLnJvdW5kKHBhZC5sZWZ0IHx8IDApO1xuICAgICAgICAgICAgICAgIGxheW91dC5wYWRkaW5nUmlnaHQgPSBNYXRoLnJvdW5kKHBhZC5yaWdodCB8fCAwKTtcbiAgICAgICAgICAgICAgICBsYXlvdXQucGFkZGluZ1RvcCA9IE1hdGgucm91bmQocGFkLnRvcCB8fCAwKTtcbiAgICAgICAgICAgICAgICBsYXlvdXQucGFkZGluZ0JvdHRvbSA9IE1hdGgucm91bmQocGFkLmJvdHRvbSB8fCAwKTtcblxuICAgICAgICAgICAgICAgIC8vIENvY29zIGhhcyBhIG5hdGl2ZSBHUklEIGxheW91dC4gUHJlZmVyIEZpZ21hIG5hdGl2ZSBHUklEXG4gICAgICAgICAgICAgICAgLy8gdHJhY2tzLCB0aGVuIHJlZ3VsYXIgV3JhcCBnZW9tZXRyeTsgdW5zYWZlIGxheW91dHMgYXJlIGZpbHRlcmVkXG4gICAgICAgICAgICAgICAgLy8gb3V0IGJ5IHNob3VsZE1vdW50TGF5b3V0IGFuZCByZXRhaW4gYWJzb2x1dGUgcG9zaXRpb25pbmcuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JpZCA9IGluZmVyTmF0aXZlR3JpZExheW91dChmaWdtYU5vZGUpIHx8IGluZmVyV3JhcEdyaWRMYXlvdXQoZmlnbWFOb2RlKTtcbiAgICAgICAgICAgICAgICBpZiAoZ3JpZCkge1xuICAgICAgICAgICAgICAgICAgICBsYXlvdXQudHlwZSA9IExheW91dC5UeXBlLkdSSUQ7XG4gICAgICAgICAgICAgICAgICAgIGxheW91dC5zdGFydEF4aXMgPSBncmlkLnN0YXJ0QXhpcyA9PT0gJ0hPUklaT05UQUwnXG4gICAgICAgICAgICAgICAgICAgICAgICA/IExheW91dC5BeGlzRGlyZWN0aW9uLkhPUklaT05UQUxcbiAgICAgICAgICAgICAgICAgICAgICAgIDogTGF5b3V0LkF4aXNEaXJlY3Rpb24uVkVSVElDQUw7XG4gICAgICAgICAgICAgICAgICAgIGxheW91dC5jb25zdHJhaW50ID0gZ3JpZC5jb25zdHJhaW50ID09PSAnRklYRURfQ09MJ1xuICAgICAgICAgICAgICAgICAgICAgICAgPyBMYXlvdXQuQ29uc3RyYWludC5GSVhFRF9DT0xcbiAgICAgICAgICAgICAgICAgICAgICAgIDogTGF5b3V0LkNvbnN0cmFpbnQuRklYRURfUk9XO1xuICAgICAgICAgICAgICAgICAgICBsYXlvdXQuY29uc3RyYWludE51bSA9IGdyaWQuY29uc3RyYWludE51bTtcbiAgICAgICAgICAgICAgICAgICAgbGF5b3V0LmNlbGxTaXplID0gbmV3IFNpemUoZ3JpZC5jZWxsV2lkdGgsIGdyaWQuY2VsbEhlaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIGxheW91dC5zcGFjaW5nWCA9IGdyaWQuc3BhY2luZ1g7XG4gICAgICAgICAgICAgICAgICAgIGxheW91dC5zcGFjaW5nWSA9IGdyaWQuc3BhY2luZ1k7XG4gICAgICAgICAgICAgICAgICAgIGxheW91dC5ob3Jpem9udGFsRGlyZWN0aW9uID0gTGF5b3V0Lkhvcml6b250YWxEaXJlY3Rpb24uTEVGVF9UT19SSUdIVDtcbiAgICAgICAgICAgICAgICAgICAgbGF5b3V0LnZlcnRpY2FsRGlyZWN0aW9uID0gTGF5b3V0LlZlcnRpY2FsRGlyZWN0aW9uLlRPUF9UT19CT1RUT007XG4gICAgICAgICAgICAgICAgICAgIGlmIChsYXlvdXQudXBkYXRlTGF5b3V0KSBsYXlvdXQudXBkYXRlTGF5b3V0KCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpc1ZlcnRpY2FsID0gZmlnbWFOb2RlLmxheW91dE1vZGUgPT09ICdWRVJUSUNBTCc7XG4gICAgICAgICAgICAgICAgLy8g5Li76L205a+56b2Q5LiA5b6L6LWw5q2j5ZCR77yI5qiqIExFRlRfVE9fUklHSFQgLyDnq5YgVE9QX1RPX0JPVFRPTe+8ie+8jOmdoOerr+S4jeWPjeW6j++8mlxuICAgICAgICAgICAgICAgIC8vIGNjLkxheW91dCDnmoQgUklHSFRfVE9fTEVGVC9CT1RUT01fVE9fVE9QIOS8muaKiiBjaGlsZHJlblswXSDmkYbliLDmnKvnq68g4oaSIOinhuiniemhuuW6j+WPjei9rFxuICAgICAgICAgICAgICAgIC8vIO+8iOingeW8leaTjiBfZG9MYXlvdXRIb3Jpem9udGFsbHkgc2lnbj0tMe+8ieOAgkZpZ21hIE1BWCDor63kuYnmmK/jgIzmlbTlnZfpnaDnq6/jgIHpobrluo/kuI3lj5jjgI3vvIxcbiAgICAgICAgICAgICAgICAvLyDlr7npvZAgVW5pdHkgY2hpbGRBbGlnbm1lbnTvvIzmlYXnlKjliY3lr7wgcGFkZGluZyDmiorlhoXlrrnlnZfmjqjliLDmnKvnq6/mnaXmqKHmi5/jgIJcbiAgICAgICAgICAgICAgICBsYXlvdXQuaG9yaXpvbnRhbERpcmVjdGlvbiA9IExheW91dC5Ib3Jpem9udGFsRGlyZWN0aW9uLkxFRlRfVE9fUklHSFQ7XG4gICAgICAgICAgICAgICAgbGF5b3V0LnZlcnRpY2FsRGlyZWN0aW9uID0gTGF5b3V0LlZlcnRpY2FsRGlyZWN0aW9uLlRPUF9UT19CT1RUT007XG4gICAgICAgICAgICAgICAgbGF5b3V0LnR5cGUgPSBpc1ZlcnRpY2FsID8gTGF5b3V0LlR5cGUuVkVSVElDQUwgOiBMYXlvdXQuVHlwZS5IT1JJWk9OVEFMO1xuXG4gICAgICAgICAgICAgICAgLy8g5Y+q57uf6K6h5Y+C5LiO5biD5bGA55qE5Y+v6KeB5a2Q6IqC54K577yI6ZqQ6JeP6IqC54K5IGFjdGl2ZT1mYWxzZe+8jOiiq+W8leaTjiBfdXNlZnVsTGF5b3V0T2JqIOaOkumZpO+8iVxuICAgICAgICAgICAgICAgIGNvbnN0IGtpZHMgPSAoZmlnbWFOb2RlLmNoaWxkcmVuIHx8IFtdKS5maWx0ZXIoKGM6IGFueSkgPT4gYyAmJiBjLnZpc2libGUgIT09IGZhbHNlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBuID0ga2lkcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udGFpbmVyTWFpbiA9IGlzVmVydGljYWwgPyAoZmlnbWFOb2RlLmhlaWdodCB8fCAwKSA6IChmaWdtYU5vZGUud2lkdGggfHwgMCk7XG4gICAgICAgICAgICAgICAgbGV0IHN1bUNoaWxkID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGMgb2Yga2lkcykgc3VtQ2hpbGQgKz0gKGlzVmVydGljYWwgPyAoYy5oZWlnaHQgfHwgMCkgOiAoYy53aWR0aCB8fCAwKSk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlnTGVhZCA9IE1hdGgucm91bmQoKGlzVmVydGljYWwgPyBwYWQudG9wIDogcGFkLmxlZnQpIHx8IDApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpZ1RyYWlsID0gTWF0aC5yb3VuZCgoaXNWZXJ0aWNhbCA/IHBhZC5ib3R0b20gOiBwYWQucmlnaHQpIHx8IDApO1xuXG4gICAgICAgICAgICAgICAgbGV0IHNwYWNpbmcgPSBmaWdtYU5vZGUuaXRlbVNwYWNpbmcgfHwgMDtcbiAgICAgICAgICAgICAgICBsZXQgbGVhZFBhZCA9IGZpZ0xlYWQ7XG4gICAgICAgICAgICAgICAgY29uc3QgYWxpZ24gPSBmaWdtYU5vZGUucHJpbWFyeUF4aXNBbGlnbkl0ZW1zO1xuICAgICAgICAgICAgICAgIGlmIChhbGlnbiA9PT0gJ1NQQUNFX0JFVFdFRU4nICYmIG4gPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwYWNpbmcgPSAoY29udGFpbmVyTWFpbiAtIGZpZ0xlYWQgLSBmaWdUcmFpbCAtIHN1bUNoaWxkKSAvIChuIC0gMSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY29udGVudE1haW4gPSBzdW1DaGlsZCArIE1hdGgubWF4KDAsIG4gLSAxKSAqIHNwYWNpbmc7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhbGlnbiA9PT0gJ0NFTlRFUicpIGxlYWRQYWQgPSBNYXRoLnJvdW5kKChjb250YWluZXJNYWluIC0gY29udGVudE1haW4pIC8gMik7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGFsaWduID09PSAnTUFYJykgbGVhZFBhZCA9IE1hdGgucm91bmQoY29udGFpbmVyTWFpbiAtIGNvbnRlbnRNYWluIC0gZmlnVHJhaWwpO1xuICAgICAgICAgICAgICAgICAgICAvLyBNSU7vvIjpu5jorqTvvInvvJpsZWFkUGFkIOS/neaMgSBGaWdtYSBwYWRkaW5nXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGlzVmVydGljYWwpIHtcbiAgICAgICAgICAgICAgICAgICAgbGF5b3V0LnNwYWNpbmdZID0gc3BhY2luZztcbiAgICAgICAgICAgICAgICAgICAgbGF5b3V0LnBhZGRpbmdUb3AgPSBsZWFkUGFkO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxheW91dC5zcGFjaW5nWCA9IHNwYWNpbmc7XG4gICAgICAgICAgICAgICAgICAgIGxheW91dC5wYWRkaW5nTGVmdCA9IGxlYWRQYWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChsYXlvdXQudXBkYXRlTGF5b3V0KSBsYXlvdXQudXBkYXRlTGF5b3V0KCk7XG4gICAgICAgICAgICB9O1xuXG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQHpoIOe6puadnyDihpIgV2lkZ2V077yI56uv5Y+jIFNldHVwU3RyZXRjaFJlY3QgODI377yJ44CCbWFyZ2luIOeUqOWDj+e0oOOAgWFsaWduTW9kZT1PTl9XSU5ET1dfUkVTSVpF44CCXG4gICAgICAgICAgICAgKiAgICAgU0NBTEUg6L+R5Ly85Li65Lik5L6n5ouJ5Ly477yI5pyJ5o2f77yM5LiOIFVuaXR5IOWQjOasvui/keS8vO+8ieOAguWFiOaRhue7neWvueS9jee9ruS9nOWIneWAvO+8jOWGjeaMgiBXaWRnZXTjgIJcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgY29uc3QgYXBwbHlDb25zdHJhaW50V2lkZ2V0ID0gKG5vZGU6IGFueSwgZmlnbWFOb2RlOiBhbnksIHc6IG51bWJlciwgaDogbnVtYmVyLFxuICAgICAgICAgICAgICAgIHBhcmVudFc6IG51bWJlciwgcGFyZW50SDogbnVtYmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgcGxhY2VBYnNvbHV0ZShub2RlLCBmaWdtYU5vZGUsIHcsIGgsIHBhcmVudFcsIHBhcmVudEgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGMgPSBmaWdtYU5vZGUuY29uc3RyYWludHMgfHwge307XG4gICAgICAgICAgICAgICAgY29uc3QgeCA9IGZpZ21hTm9kZS54LCB5ID0gZmlnbWFOb2RlLnk7XG4gICAgICAgICAgICAgICAgY29uc3Qgd2lkZ2V0ID0gbm9kZS5hZGRDb21wb25lbnQoV2lkZ2V0KTtcbiAgICAgICAgICAgICAgICB3aWRnZXQuYWxpZ25Nb2RlID0gV2lkZ2V0LkFsaWduTW9kZS5PTl9XSU5ET1dfUkVTSVpFO1xuXG4gICAgICAgICAgICAgICAgLy8g5rC05bmz77yIRmlnbWEgeCDlt6bljp/ngrnvvIlcbiAgICAgICAgICAgICAgICBjb25zdCBoYyA9IGMuaG9yaXpvbnRhbDtcbiAgICAgICAgICAgICAgICBpZiAoaGMgPT09ICdMRUZUX1JJR0hUJyB8fCBoYyA9PT0gJ1NDQUxFJykge1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQuaXNBbGlnbkxlZnQgPSB3aWRnZXQuaXNBbGlnblJpZ2h0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmxlZnQgPSB4O1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQucmlnaHQgPSBwYXJlbnRXIC0gKHggKyB3KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhjID09PSAnUklHSFQnKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5pc0FsaWduUmlnaHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQucmlnaHQgPSBwYXJlbnRXIC0gKHggKyB3KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGhjID09PSAnQ0VOVEVSJykge1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQuaXNBbGlnbkhvcml6b250YWxDZW50ZXIgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQuaG9yaXpvbnRhbENlbnRlciA9ICh4ICsgdyAvIDIpIC0gcGFyZW50VyAvIDI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmlzQWxpZ25MZWZ0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmxlZnQgPSB4O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOWeguebtO+8iENvY29zIFkg5LiK77yMdG9wL2JvdHRvbSDmmK/liLDniLbkuIov5LiL6L656Led56a777yJXG4gICAgICAgICAgICAgICAgY29uc3QgdmMgPSBjLnZlcnRpY2FsO1xuICAgICAgICAgICAgICAgIGlmICh2YyA9PT0gJ1RPUF9CT1RUT00nIHx8IHZjID09PSAnU0NBTEUnKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5pc0FsaWduVG9wID0gd2lkZ2V0LmlzQWxpZ25Cb3R0b20gPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQudG9wID0geTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmJvdHRvbSA9IHBhcmVudEggLSAoeSArIGgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodmMgPT09ICdCT1RUT00nKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5pc0FsaWduQm90dG9tID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LmJvdHRvbSA9IHBhcmVudEggLSAoeSArIGgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodmMgPT09ICdDRU5URVInKSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5pc0FsaWduVmVydGljYWxDZW50ZXIgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB3aWRnZXQudmVydGljYWxDZW50ZXIgPSBwYXJlbnRIIC8gMiAtICh5ICsgaCAvIDIpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHdpZGdldC5pc0FsaWduVG9wID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgd2lkZ2V0LnRvcCA9IHk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHdpZGdldC51cGRhdGVBbGlnbm1lbnQpIHdpZGdldC51cGRhdGVBbGlnbm1lbnQoKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IGJ1aWxkTm9kZSA9IChmaWdtYU5vZGU6IGFueSwgY2NQYXJlbnQ6IGFueSwgcGFyZW50Tm9kZTogYW55LFxuICAgICAgICAgICAgICAgIHBhcmVudFc6IG51bWJlciwgcGFyZW50SDogbnVtYmVyLCBwYXJlbnRFZmZMYXlvdXQ6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICAgaXNSb290OiBib29sZWFuLCBwYXJlbnRNb3VudGVkTGF5b3V0OiBib29sZWFuKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgICAgLy8g5a6a5L2N5YmN5YWI6LeR5rqi5Ye66KOB5Ymq77yI5Y6f5Zyw5L+uIHcvaO+8jOWvuem9kCBVbml0eSAzMzTvvIlcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxsc1BhcmVudCA9IGlzRmlsbFBhcmVudChmaWdtYU5vZGUsIHBhcmVudE5vZGUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlnbm9yZSA9IHNob3VsZElnbm9yZUxheW91dChmaWdtYU5vZGUsIHBhcmVudEVmZkxheW91dCwgcGFyZW50Tm9kZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFpc1Jvb3QgJiYgcGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBjbGFtcE92ZXJmbG93VG9QYXJlbnQoZmlnbWFOb2RlLCBwYXJlbnROb2RlLCBmaWxsc1BhcmVudCwgcGFyZW50RWZmTGF5b3V0LCBpZ25vcmUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHcgPSBmaWdtYU5vZGUud2lkdGggfHwgMDtcbiAgICAgICAgICAgICAgICBjb25zdCBoID0gZmlnbWFOb2RlLmhlaWdodCB8fCAwO1xuICAgICAgICAgICAgICAgIGNvbnN0IHBhcmVudE1vdW50ZWRMYXlvdXRNb2RlID0gcGFyZW50TW91bnRlZExheW91dCAmJiBwYXJlbnROb2RlXG4gICAgICAgICAgICAgICAgICAgID8gKChwYXJlbnROb2RlLmxheW91dE1vZGUgPT09ICdHUklEJyB8fCBwYXJlbnROb2RlLmxheW91dFdyYXAgPT09ICdXUkFQJylcbiAgICAgICAgICAgICAgICAgICAgICAgID8gJ0dSSUQnXG4gICAgICAgICAgICAgICAgICAgICAgICA6IFN0cmluZyhwYXJlbnROb2RlLmxheW91dE1vZGUgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICA6ICcnO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgY29tcG9uZW50S2V5ID0gU3RyaW5nKGZpZ21hTm9kZS5jb21wb25lbnRLZXkgfHwgJycpO1xuICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRLZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzb2x1dGlvbiA9IHJlc29sdmVDb21wb25lbnRNYXBwaW5nKFxuICAgICAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50S2V5LFxuICAgICAgICAgICAgICAgICAgICAgICAgZmlnbWFOb2RlLmNvbXBvbmVudFByb3BlcnRpZXMsXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRNYXBwaW5ncyxcbiAgICAgICAgICAgICAgICAgICAgICAgIChlbnRyeSkgPT4gISEoZW50cnkucHJlZmFiVXVpZCAmJiBwcmVmYWJDYWNoZVtlbnRyeS5wcmVmYWJVdWlkXSlcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc29sdXRpb24uc3RhdHVzID09PSAnbWFwcGVkJyAmJiByZXNvbHV0aW9uLmVudHJ5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgbWFwcGVkTm9kZTogYW55ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm9kZSA9IGluc3RhbnRpYXRlKHByZWZhYkNhY2hlW3Jlc29sdXRpb24uZW50cnkucHJlZmFiVXVpZF0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcHBlZE5vZGUgPSBub2RlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbm9kZSkgdGhyb3cgbmV3IEVycm9yKCdpbnN0YW50aWF0ZSByZXR1cm5lZCBubyBub2RlJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gS2VlcCB0aGUgUHJlZmFiIGluYWN0aXZlIHVudGlsIG1haW4gYWRkcyBGaWdtYUNvbXBvbmVudFN0YXRlIHRocm91Z2hcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBDcmVhdG9yJ3MgZWRpdG9yIGZhY2FkZS4gRGlyZWN0IG5vZGUuYWRkQ29tcG9uZW50IGlzIG5vdCBhIHBlcnNpc3RlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFByZWZhYiBvdmVycmlkZSBhbmQgZGlzYXBwZWFycyBhZnRlciBzYXZlICsgcmVsb2FkLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGUuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZS5uYW1lID0gc2FuaXRpemVDb2Nvc05vZGVOYW1lKGZpZ21hTm9kZS5uYW1lLCBub2RlLm5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGUubGF5ZXIgPSB0eXBlb2YgY2NQYXJlbnQubGF5ZXIgPT09ICdudW1iZXInID8gY2NQYXJlbnQubGF5ZXIgOiBpbXBvcnRlZExheWVyO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNjUGFyZW50LmFkZENoaWxkKG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCB1aSA9IG5vZGUuZ2V0Q29tcG9uZW50ICYmIG5vZGUuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXVpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVpID0gbm9kZS5hZGRDb21wb25lbnQoVUlUcmFuc2Zvcm0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1aS5zZXRDb250ZW50U2l6ZSh3LCBoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g5a+56b2QIFVuaXR5IFBsYWNlUHJlZmFiSW5zdGFuY2VLZWVwaW5nU2l6Ze+8mlByZWZhYiDmoLnlsLrlr7jlsZ7kuo7pobnnm67otYTkuqfvvIxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyDlr7zlhaXlmajlj6rmiorlroPnmoTkuK3lv4Plr7npvZAgRmlnbWEg5aSW5qGG5Lit5b+D77yM5LiN6IO955So6K6+6K6h5qGG5by65pS55YaF6YOo5biD5bGA44CCXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdWkuc2V0QW5jaG9yUG9pbnQoMC41LCAwLjUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBsYWNlQWJzb2x1dGUobm9kZSwgZmlnbWFOb2RlLCB3LCBoLCBwYXJlbnRXLCBwYXJlbnRILCBwYXJlbnRNb3VudGVkTGF5b3V0TW9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBmaWdtYU5vZGUub3BhY2l0eSA9PT0gJ251bWJlcicgJiYgZmlnbWFOb2RlLm9wYWNpdHkgPCAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wYWNpdHkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigyNTUsIE1hdGgucm91bmQoZmlnbWFOb2RlLm9wYWNpdHkgKiAyNTUpKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wYWNpdHlDb21wb25lbnQgPSBub2RlLmdldENvbXBvbmVudChVSU9wYWNpdHkpIHx8IG5vZGUuYWRkQ29tcG9uZW50KFVJT3BhY2l0eSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wYWNpdHlDb21wb25lbnQub3BhY2l0eSA9IG9wYWNpdHk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRTdGF0ZVJ1bnRpbWVBdmFpbGFibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVxdWVzdCA9IGJ1aWxkTWFwcGVkQ29tcG9uZW50U3RhdGVSZXF1ZXN0KG5vZGUsIGZpZ21hTm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXF1ZXN0KSBwZW5kaW5nQ29tcG9uZW50U3RhdGVzLnB1c2gocmVxdWVzdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgcmVjb3JkU3RhdGVSZXN1bHQoJ3VuYXZhaWxhYmxlJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZS5hY3RpdmUgPSBmaWdtYU5vZGUudmlzaWJsZSAhPT0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXRlUmVzdWx0KCd1bmF2YWlsYWJsZScpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb3VudCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWdtYU5vZGUuZmlnbWFJZCkgZmlnbWFJZFRvTm9kZS5zZXQoU3RyaW5nKGZpZ21hTm9kZS5maWdtYUlkKSwgbm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFwcGVkUHJlZmFicysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc1Jvb3QpIGltcG9ydGVkUm9vdCA9IG5vZGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGlzY2FyZEZhaWxlZE1hcHBlZE5vZGUobWFwcGVkTm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmFpbGVkUHJlZmFiSW5zdGFuY2VzKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSDnu4Tku7bjgIwke2ZpZ21hTm9kZS5uYW1lIHx8IGNvbXBvbmVudEtleX3jgI1gICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYChrZXk9JHtjb21wb25lbnRLZXl9KSBQcmVmYWIg5pig5bCE5a6e5L6L5aSE55CG5aSx6LSl77yM5Zue6YCA5bGV5byA5pWj6IqC54K577yaYCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKGVyciBhcyBhbnkpPy5tZXNzYWdlIHx8IGVyclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocmVzb2x1dGlvbi5zdGF0dXMgPT09ICdicm9rZW4nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicm9rZW5Db21wb25lbnRNYXBwaW5ncysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIOe7hOS7tuOAjCR7ZmlnbWFOb2RlLm5hbWUgfHwgY29tcG9uZW50S2V5feOAjWAgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGAoa2V5PSR7Y29tcG9uZW50S2V5fSkg5bey6YWN572u5pig5bCE5L2GIFByZWZhYiDmlq3pk77vvIzlm57pgIDlsZXlvIDmlaPoioLngrnjgIJgXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdW5tYXBwZWRDb21wb25lbnRzKys7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBpc1RleHROb2RlID0gU3RyaW5nKGZpZ21hTm9kZS50eXBlIHx8ICcnKS50b1VwcGVyQ2FzZSgpID09PSAnVEVYVCc7XG4gICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVVdWlkID0gU3RyaW5nKGZpZ21hTm9kZS50ZXh0U3R5bGVUZW1wbGF0ZSAmJiBmaWdtYU5vZGUudGV4dFN0eWxlVGVtcGxhdGUucHJlZmFiVXVpZCB8fCAnJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhhY3RUZXh0VGVtcGxhdGVDbG9uZSA9IGlzVGV4dE5vZGVcbiAgICAgICAgICAgICAgICAgICAgPyBjbG9uZUV4YWN0VGV4dFN0eWxlVGVtcGxhdGVOb2RlKGZpZ21hTm9kZSwgZXhhY3RUZXh0VGVtcGxhdGVSb290c1t0ZW1wbGF0ZVV1aWRdLCBjYylcbiAgICAgICAgICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNhZmVOb2RlTmFtZSA9IHNhbml0aXplQ29jb3NOb2RlTmFtZShmaWdtYU5vZGUubmFtZSwgZmlnbWFOb2RlLnR5cGUgfHwgJ05vZGUnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBub2RlID0gZXhhY3RUZXh0VGVtcGxhdGVDbG9uZSB8fCBuZXcgTm9kZShzYWZlTm9kZU5hbWUpO1xuICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRLZXkpIG5vZGUuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbm9kZS5uYW1lID0gc2FmZU5vZGVOYW1lO1xuICAgICAgICAgICAgICAgIG5vZGUubGF5ZXIgPSB0eXBlb2YgY2NQYXJlbnQubGF5ZXIgPT09ICdudW1iZXInID8gY2NQYXJlbnQubGF5ZXIgOiBpbXBvcnRlZExheWVyO1xuICAgICAgICAgICAgICAgIGNvbnN0IHVpID0gbm9kZS5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pIHx8IG5vZGUuYWRkQ29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICAgICAgICAgICAgICB1aS5zZXRDb250ZW50U2l6ZSh3LCBoKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0QW5jaG9yWCA9IGlzVGV4dE5vZGUgPyB0ZXh0QW5jaG9yWEZvckFsaWduKGZpZ21hTm9kZS50ZXh0QWxpZ25Ib3Jpem9udGFsKSA6IDAuNTtcbiAgICAgICAgICAgICAgICB1aS5zZXRBbmNob3JQb2ludCh0ZXh0QW5jaG9yWCwgMC41KTtcbiAgICAgICAgICAgICAgICBjY1BhcmVudC5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgICAgICAvLyBTdGF0ZSBjb21wb25lbnRzIGFyZSBjcmVhdGVkIGJ5IG1haW4gdGhyb3VnaCBDcmVhdG9yJ3NcbiAgICAgICAgICAgICAgICAvLyBzY2VuZS9jcmVhdGUtY29tcG9uZW50IGZhY2FkZSBhZnRlciB0aGUgbm9kZSBpcyBpbi1zY2VuZS5cbiAgICAgICAgICAgICAgICAvLyBEaXJlY3QgYWRkQ29tcG9uZW50IGhlcmUgd291bGQgYmUgcnVudGltZS1vbmx5IGZvciBwcmVmYWJcbiAgICAgICAgICAgICAgICAvLyBpbnN0YW5jZXMgYW5kIHdvdWxkIGFsc28gbWFrZSBvcmRpbmFyeSBwYXRocyBkaXZlcmdlLlxuICAgICAgICAgICAgICAgIGxldCBzdGF0ZVF1ZXVlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnRLZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBvbmVudFN0YXRlUnVudGltZUF2YWlsYWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVxdWVzdCA9IGJ1aWxkQ29tcG9uZW50U3RhdGVSZXF1ZXN0KG5vZGUsIGZpZ21hTm9kZSwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlcXVlc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwZW5kaW5nQ29tcG9uZW50U3RhdGVzLnB1c2gocmVxdWVzdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGVRdWV1ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZWNvcmRTdGF0ZVJlc3VsdCgndW5hdmFpbGFibGUnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXRlUmVzdWx0KCd1bmF2YWlsYWJsZScpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghc3RhdGVRdWV1ZWQpIG5vZGUuYWN0aXZlID0gZXhhY3RUZXh0VGVtcGxhdGVDbG9uZSA/IGZhbHNlIDogZmlnbWFOb2RlLnZpc2libGUgIT09IGZhbHNlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlT3BhY2l0eSA9IG5vZGUuZ2V0Q29tcG9uZW50ICYmIG5vZGUuZ2V0Q29tcG9uZW50KFVJT3BhY2l0eSk7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBmaWdtYU5vZGUub3BhY2l0eSA9PT0gJ251bWJlcicgJiYgZmlnbWFOb2RlLm9wYWNpdHkgPCAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wYWNpdHkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigyNTUsIE1hdGgucm91bmQoZmlnbWFOb2RlLm9wYWNpdHkgKiAyNTUpKSk7XG4gICAgICAgICAgICAgICAgICAgICh0ZW1wbGF0ZU9wYWNpdHkgfHwgbm9kZS5hZGRDb21wb25lbnQoVUlPcGFjaXR5KSkub3BhY2l0eSA9IG9wYWNpdHk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0ZW1wbGF0ZU9wYWNpdHkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGVtcGxhdGVPcGFjaXR5Lm9wYWNpdHkgPSAyNTU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgICAgICAgaWYgKGZpZ21hTm9kZS5maWdtYUlkKSBmaWdtYUlkVG9Ob2RlLnNldChTdHJpbmcoZmlnbWFOb2RlLmZpZ21hSWQpLCBub2RlKTtcbiAgICAgICAgICAgICAgICBpZiAoZXhhY3RUZXh0VGVtcGxhdGVDbG9uZSkgdGVtcGxhdGVzQXBwbGllZCsrO1xuICAgICAgICAgICAgICAgIGlmIChpc1Jvb3QpIGltcG9ydGVkUm9vdCA9IG5vZGU7XG5cbiAgICAgICAgICAgICAgICAvLyDilIDilIAg5a6a5L2NIOKUgOKUgFxuICAgICAgICAgICAgICAgIC8vIOWFiOaMiSBGaWdtYSDlnZDmoIfliJ3lp4vljJbvvJvmma7pgJrmqKov56uWIExheW91dCDpmo/lkI7opobnm5bkuLvovbTlubbkv53nlZnot6jovbTvvIxcbiAgICAgICAgICAgICAgICAvLyBHcmlkIOWImeimhuebluS4pOi9tOOAgui/meagt+S4jeeJuueJsiBGaWdtYSDnmoQgY291bnRlci1heGlzIOWvuem9kOOAglxuICAgICAgICAgICAgICAgIHBsYWNlQWJzb2x1dGUobm9kZSwgZmlnbWFOb2RlLCB3LCBoLCBwYXJlbnRXLCBwYXJlbnRILCBwYXJlbnRNb3VudGVkTGF5b3V0TW9kZSwgdGV4dEFuY2hvclgsIDAuNSk7XG5cbiAgICAgICAgICAgICAgICAvLyDmnInlm77niYflvJXnlKgg4oaSIOaMgiBTcHJpdGXvvIzorrDkuIvlvoXliqDovb3jgIJcbiAgICAgICAgICAgICAgICAvLyBjbGlwc0NvbnRlbnQgKyDmnInlj6/op4blm77lvaLml7bvvIzlm77lvaLopoHkuIvmsonliLDog4zmma/lrZDoioLngrnvvIjop4EgcmVzb2x2ZVZpc3VhbEhvc3TvvInvvIxcbiAgICAgICAgICAgICAgICAvLyDlkKbliJkgTWFzay5HUkFQSElDU19SRUNUIOeahCBHcmFwaGljcyDkvJrkuI4gU3ByaXRlL0dyYXBoaWNzIOWcqCBub2RlIOS4iuWGsueqgeOAglxuICAgICAgICAgICAgICAgIGNvbnN0IHZpc3VhbEhvc3QgPSByZXNvbHZlVmlzdWFsSG9zdChub2RlLCBmaWdtYU5vZGUsIHcsIGgsIGNjKTtcbiAgICAgICAgICAgICAgICBjb25zdCBpbWdSZWYgPSBmaWdtYU5vZGUuaW1hZ2VSZWY7XG4gICAgICAgICAgICAgICAgbGV0IGhhc1Zpc2libGVHcmFwaGljID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaWYgKGltZ1JlZiAmJiBpZFRvU3ByaXRlRnJhbWVbaW1nUmVmXSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzcHJpdGUgPSB2aXN1YWxIb3N0LmFkZENvbXBvbmVudChTcHJpdGUpO1xuICAgICAgICAgICAgICAgICAgICBzcHJpdGUuc2l6ZU1vZGUgPSBTcHJpdGUuU2l6ZU1vZGUuQ1VTVE9NO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBzbGljZTlCb3JkZXIgPSByZWFkU2xpY2U5Qm9yZGVyKGZpZ21hTm9kZSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbmZpZ3VyZVNwcml0ZVR5cGUoc3ByaXRlLCBmaWdtYU5vZGUsIHNsaWNlOUJvcmRlciwgU3ByaXRlKTtcbiAgICAgICAgICAgICAgICAgICAgc3ByaXRlLnRyaW0gPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFwcGx5SW1hZ2VDb2xvcihzcHJpdGUsIGZpZ21hTm9kZS5pbWFnZUZpbGwsIGZpZ21hTm9kZS5vdmVybGF5VGludCwgQ29sb3IpKSBvdmVybGF5VGludHMrKztcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlUaWxlU2NhbGluZyhzcHJpdGUsIGZpZ21hTm9kZS5pbWFnZUZpbGwpO1xuICAgICAgICAgICAgICAgICAgICBoYXNWaXNpYmxlR3JhcGhpYyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHBlbmRpbmdTcHJpdGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgaG9zdDogdmlzdWFsSG9zdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNwcml0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGltZ1JlZixcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGlkVG9TcHJpdGVGcmFtZVtpbWdSZWZdLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2xpY2U5Qm9yZGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW1hZ2VGaWxsOiBmaWdtYU5vZGUuaW1hZ2VGaWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcmxheVRpbnQ6IGZpZ21hTm9kZS5vdmVybGF5VGludCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiB3LFxuICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBoLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGltZ1JlZiAmJiB1bnJlc29sdmVkW2ltZ1JlZl0pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8g5Zu+5bey6JC955uYL+WkjeeUqOaIkOWKn+S9hiBTcHJpdGVGcmFtZSDlrZDotYTmupDlsJrmnKrlsLHnu6rvvJrlhYjmjILlk4HnuqLljaDkvY3vvIjlkIznvLrlm77lpJbop4LvvInvvIxcbiAgICAgICAgICAgICAgICAgICAgLy8g6K6w5b2VIHZpc3VhbEhvc3Qg55qEIHV1aWQgKyDliqDovb3lj4LmlbDvvIzkuqQgbWFpbiDlkI7lj7DlsLHnu6rlkI7mjIkgdXVpZCDlrprkvY3mm7/mjaLmiJDnnJ/lm77jgIJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGxhY2Vob2xkZXJTcHJpdGUgPSBtb3VudE1pc3NpbmdJbWFnZVBsYWNlaG9sZGVyKHZpc3VhbEhvc3QsIHcsIGgsIGNjKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFwcGx5SW1hZ2VDb2xvcihwbGFjZWhvbGRlclNwcml0ZSwgZmlnbWFOb2RlLmltYWdlRmlsbCwgZmlnbWFOb2RlLm92ZXJsYXlUaW50LCBDb2xvcikpIG92ZXJsYXlUaW50cysrO1xuICAgICAgICAgICAgICAgICAgICBoYXNWaXNpYmxlR3JhcGhpYyA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHVucmVzb2x2ZWRQbGFjZWhvbGRlcnMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlVXVpZDogdmlzdWFsSG9zdC51dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgaW1nUmVmLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGJVcmw6IHVucmVzb2x2ZWRbaW1nUmVmXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGtpbmQ6ICdzcHJpdGUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2xpY2U5Qm9yZGVyOiByZWFkU2xpY2U5Qm9yZGVyKGZpZ21hTm9kZSksXG4gICAgICAgICAgICAgICAgICAgICAgICBpbWFnZUZpbGw6IGZpZ21hTm9kZS5pbWFnZUZpbGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBvdmVybGF5VGludDogZmlnbWFOb2RlLm92ZXJsYXlUaW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHcsXG4gICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IGgsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaW1nUmVmKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIOWjsOaYjuS6huWbvuS9huayoeWMuemFjeWIsCBTcHJpdGVGcmFtZe+8iOacquiQveebmC/mnKrlpI3nlKjmiJDlip/vvInvvJrmjILnqbogU3ByaXRlICsg5ZOB57qi5Y2g5L2N5qGG77yMXG4gICAgICAgICAgICAgICAgICAgIC8vIOS+m+e+juacr+aJi+WKqOihpeWbvu+8jOmBv+WFjeWPquWJqeepuiBVSVRyYW5zZm9ybSDoioLngrnvvIjlkIzkuovlj43ppojjgIzmsqHor4bliKvliLDnmoTlm77mjILku6Plm77jgI3vvInjgIJcbiAgICAgICAgICAgICAgICAgICAgbW91bnRNaXNzaW5nSW1hZ2VQbGFjZWhvbGRlcih2aXN1YWxIb3N0LCB3LCBoLCBjYyk7XG4gICAgICAgICAgICAgICAgICAgIGhhc1Zpc2libGVHcmFwaGljID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgbWlzc2luZ0ltYWdlcysrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZmlnbWFOb2RlLnR5cGUgIT09ICdURVhUJyAmJiBhcHBseVNvbGlkRmlsbCh2aXN1YWxIb3N0LCBmaWdtYU5vZGUsIHcsIGgsIEdyYXBoaWNzLCBDb2xvcikpIHtcbiAgICAgICAgICAgICAgICAgICAgc29saWRGaWxscysrO1xuICAgICAgICAgICAgICAgICAgICBoYXNWaXNpYmxlR3JhcGhpYyA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChhcHBseVRyYW5zcGFyZW50UmVjdGFuZ2xlRmFsbGJhY2sodmlzdWFsSG9zdCwgZmlnbWFOb2RlLCB3LCBoLCBHcmFwaGljcywgQ29sb3IpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zcGFyZW50UmVjdGFuZ2xlcysrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2V0dXBCdXR0b24obm9kZSwgZmlnbWFOb2RlLCBCdXR0b24sIGhhc1Zpc2libGVHcmFwaGljKSkge1xuICAgICAgICAgICAgICAgICAgICBidXR0b25zKys7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g5paH5pys6IqC54K5IOKGkiDmjIIgTGFiZWxcbiAgICAgICAgICAgICAgICBpZiAoZmlnbWFOb2RlLnR5cGUgPT09ICdURVhUJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB1c2VSaWNoVGV4dCA9IGhhc01peGVkVGV4dFNlZ21lbnRzKGZpZ21hTm9kZSkgJiYgUmljaFRleHQ7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJpY2hUZXh0TW91bnQgPSB1c2VSaWNoVGV4dFxuICAgICAgICAgICAgICAgICAgICAgICAgPyBtb3VudEZ0b2NSaWNoVGV4dFJlbmRlcmVyKG5vZGUsIGZpZ21hTm9kZSwgdywgaCwgY2MpXG4gICAgICAgICAgICAgICAgICAgICAgICA6IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gcmljaFRleHRNb3VudCA/IHJpY2hUZXh0TW91bnQucmljaFRleHQgOiAobm9kZS5nZXRDb21wb25lbnQoTGFiZWwpIHx8IG5vZGUuYWRkQ29tcG9uZW50KExhYmVsKSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNoYXJhY3RlcnMgPSB0eXBlb2YgZmlnbWFOb2RlLmNoYXJhY3RlcnMgPT09ICdzdHJpbmcnID8gZmlnbWFOb2RlLmNoYXJhY3RlcnMgOiAnJztcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwuc3RyaW5nID0gdXNlUmljaFRleHRcbiAgICAgICAgICAgICAgICAgICAgICAgID8gYnVpbGRSaWNoVGV4dFN0cmluZyhjaGFyYWN0ZXJzLCBmaWdtYU5vZGUpXG4gICAgICAgICAgICAgICAgICAgICAgICA6IGFwcGx5VGV4dENhc2UoY2hhcmFjdGVycywgZmlnbWFOb2RlLnRleHRDYXNlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpZ21hTm9kZS5mb250U2l6ZSkgbGFiZWwuZm9udFNpemUgPSBmaWdtYU5vZGUuZm9udFNpemU7XG4gICAgICAgICAgICAgICAgICAgIGxhYmVsLmxpbmVIZWlnaHQgPSBmaWdtYU5vZGUubGluZUhlaWdodCA+IDAgPyBmaWdtYU5vZGUubGluZUhlaWdodCA6IChmaWdtYU5vZGUuZm9udFNpemUgfHwgbGFiZWwuZm9udFNpemUpO1xuICAgICAgICAgICAgICAgICAgICBsYWJlbC5ob3Jpem9udGFsQWxpZ24gPSBtYXBIQWxpZ24oTGFiZWwsIGZpZ21hTm9kZS50ZXh0QWxpZ25Ib3Jpem9udGFsKTtcbiAgICAgICAgICAgICAgICAgICAgbGFiZWwudmVydGljYWxBbGlnbiA9IG1hcFZBbGlnbihMYWJlbCwgZmlnbWFOb2RlLnRleHRBbGlnblZlcnRpY2FsKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzZVJpY2hUZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbC5tYXhXaWR0aCA9IHJpY2hUZXh0TW91bnQgPyByaWNoVGV4dE1vdW50LnBsYW4ubWF4V2lkdGggOiAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmljaFRleHRzKys7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhcHBseVRleHRTaXppbmcoTGFiZWwsIGxhYmVsLCBmaWdtYU5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFleGFjdFRleHRUZW1wbGF0ZUNsb25lKSBhcHBseUZvbnRTdHlsZShsYWJlbCwgZmlnbWFOb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwcGx5VGV4dERlY29yYXRpb24obGFiZWwsIGZpZ21hTm9kZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKCF1c2VSaWNoVGV4dCkgYXBwbHlBdXRob3JlZExldHRlclNwYWNpbmcobGFiZWwsIGZpZ21hTm9kZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaWdtYU5vZGUuY29sb3IgJiYgIShleGFjdFRleHRUZW1wbGF0ZUNsb25lICYmIGZpZ21hTm9kZS50ZXh0R3JhZGllbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjID0gZmlnbWFOb2RlLmNvbG9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVzZVJpY2hUZXh0KSBsYWJlbC5mb250Q29sb3IgPSBuZXcgQ29sb3IoYy5yLCBjLmcsIGMuYiwgYy5hKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgbGFiZWwuY29sb3IgPSBuZXcgQ29sb3IoYy5yLCBjLmcsIGMuYiwgYy5hKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoZmlnbWFOb2RlLnRleHRHcmFkaWVudCAmJiAhZXhhY3RUZXh0VGVtcGxhdGVDbG9uZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ3JhZGllbnRUZXh0RmFsbGJhY2tzKys7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpZ21hTm9kZS50ZXh0U3R5bGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWdtYU5vZGUudGV4dFN0eWxlLmZpZ21hU2lnbmF0dXJlKSB0ZXh0U3R5bGVTaWduYXR1cmVzLmFkZChmaWdtYU5vZGUudGV4dFN0eWxlLmZpZ21hU2lnbmF0dXJlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWdtYU5vZGUudGV4dFN0eWxlLnRleHRTdHlsZU5hbWUpIGxhYmVsc1dpdGhUZXh0U3R5bGVOYW1lKys7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpZ21hTm9kZS50ZXh0U3R5bGVUZW1wbGF0ZSkgdGV4dFN0eWxlVGVtcGxhdGVMYWJlbHMrKztcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnMgPSBmaWdtYU5vZGUuZm9udFNpemUgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgLy8gQSBwb3NpdGl2ZSBGaWdtYSBoZWlnaHQgaXMgYXV0aG9yZWQgZ2VvbWV0cnksIGV2ZW4gd2hlbiBpdCBpc1xuICAgICAgICAgICAgICAgICAgICAvLyBzbWFsbGVyIHRoYW4gdGhlIGZvbnQgc2l6ZS4gT25seSBzeW50aGVzaXplIGEgYm94IHdoZW4gaGVpZ2h0IGlzIGFic2VudC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGZzID4gMCAmJiBoIDw9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVpLnNldENvbnRlbnRTaXplKHcsIGZzICogMS41KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOeOrzTvvJrlkb3kuK3moLflvI/lupPkuJTmnInnvo7mnK/miYvphY3nmoTmqKHmnb8gcHJlZmFiIOaXtu+8jOWFi+mahuaooeadv+Wkluingu+8iOWtl+S9ky/mj4/ovrkv5oqV5b2xL+adkOi0qO+8iei/h+adpeOAglxuICAgICAgICAgICAgICAgICAgICAvLyDlj6ropobnm5blpJbop4LvvIzkv53nlZnlr7zlhaXoioLngrnoh6rlt7HnmoQgc3RyaW5nL+Wtl+WPty/popzoibIv5a+56b2QL+WwuuWvuOOAgui1sOWFi+mahui3r+W+hOWwsei3s+i/h+S4i+mdoueahOeoi+W6j+WMlua0vueUn+OAglxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0cGwgPSBmaWdtYU5vZGUudGV4dFN0eWxlVGVtcGxhdGU7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRlbXBsYXRlUGF0aCA9IHJlc29sdmVUZXh0U3R5bGVUZW1wbGF0ZVBhdGgodHBsKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFzVGVtcGxhdGUgPSAhISh0cGwgJiYgdHBsLnByZWZhYlV1aWQgJiYgdGVtcGxhdGVQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhhY3RUZW1wbGF0ZSA9IGhhc1RlbXBsYXRlICYmIFN0cmluZyh0cGwudGllciB8fCAnJykudHJpbSgpLnRvVXBwZXJDYXNlKCkgPT09ICdFWEFDVCc7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVzZVRlbXBsYXRlID0gIXVzZVJpY2hUZXh0ICYmIGV4YWN0VGVtcGxhdGUgJiYgISFleGFjdFRleHRUZW1wbGF0ZUNsb25lO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByaWNoVGV4dEZvbnQgPSB1c2VSaWNoVGV4dCA/IHJlc29sdmVSaWNoVGV4dEZvbnRSZWZlcmVuY2UoZmlnbWFOb2RlLCB0cGwpIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzZVJpY2hUZXh0ICYmIChoYXNUZW1wbGF0ZSB8fCAocmljaFRleHRGb250ICYmIHJpY2hUZXh0Rm9udC51dWlkKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBlbmRpbmdUZW1wbGF0ZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiBsYWJlbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmVmYWJVdWlkOiBoYXNUZW1wbGF0ZSA/IFN0cmluZyh0cGwucHJlZmFiVXVpZCkgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWdtYVBhdGg6IGhhc1RlbXBsYXRlID8gdGVtcGxhdGVQYXRoIDogJycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGllcjogaGFzVGVtcGxhdGUgPyBTdHJpbmcodHBsLnRpZXIgfHwgJycpIDogJycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9udE9ubHk6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZXJGb250VXVpZDogcmljaFRleHRGb250ID8gcmljaFRleHRGb250LnV1aWQgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlckZvbnRGaWxlTmFtZTogcmljaFRleHRGb250ID8gcmljaFRleHRGb250LmZpbGVOYW1lIDogJycsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIOKUgOKUgCDlrZfkvZPmoLflvI/lupPvvJrmj4/ovrkgLyDmipXlvbEgLyDlrZfkvZPvvIjml6DmqKHmnb8gcHJlZmFiIOaXtuS7jiBGaWdtYSDmlbDlgLznm7TmjqXmtL7nlJ/vvIzpm7bnvo7mnK/phY3nva7vvInilIDilIBcbiAgICAgICAgICAgICAgICAgICAgLy8g5o+P6L65IOKGkiBMYWJlbCDoh6rluKYgZW5hYmxlT3V0bGluZS9vdXRsaW5lQ29sb3Ivb3V0bGluZVdpZHRo77yI5LiN6KaB55So5beyIGRlcHJlY2F0ZWQg55qEIExhYmVsT3V0bGluZSDnu4Tku7bvvInjgIJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF1c2VUZW1wbGF0ZSAmJiAhdXNlUmljaFRleHQgJiYgZmlnbWFOb2RlLnN0cm9rZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3QgPSBmaWdtYU5vZGUuc3Ryb2tlO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWwuZW5hYmxlT3V0bGluZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbC5vdXRsaW5lQ29sb3IgPSBuZXcgQ29sb3Ioc3QuY29sb3Iuciwgc3QuY29sb3IuZywgc3QuY29sb3IuYiwgc3QuY29sb3IuYSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbC5vdXRsaW5lV2lkdGggPSBzdC53aWR0aCB8fCAxO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIOaKleW9sSDihpIgTGFiZWwg6Ieq5bimIGVuYWJsZVNoYWRvdy9zaGFkb3dDb2xvci9zaGFkb3dPZmZzZXQvc2hhZG93Qmx1cuOAglxuICAgICAgICAgICAgICAgICAgICAvLyBGaWdtYSBZIOWQkeS4i+S4uuato+OAgUNvY29zIFkg5ZCR5LiK5Li65q2jIOKGkiBvZmZzZXRZIOe/u+espuWPt+OAglxuICAgICAgICAgICAgICAgICAgICBpZiAoIXVzZVRlbXBsYXRlICYmICF1c2VSaWNoVGV4dCAmJiBmaWdtYU5vZGUuc2hhZG93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzaCA9IGZpZ21hTm9kZS5zaGFkb3c7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbC5lbmFibGVTaGFkb3cgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWwuc2hhZG93Q29sb3IgPSBuZXcgQ29sb3Ioc2guY29sb3Iuciwgc2guY29sb3IuZywgc2guY29sb3IuYiwgc2guY29sb3IuYSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbC5zaGFkb3dPZmZzZXQgPSBuZXcgVmVjMihzaC5vZmZzZXRYIHx8IDAsIC0oc2gub2Zmc2V0WSB8fCAwKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsYWJlbC5zaGFkb3dCbHVyID0gc2guYmx1ciB8fCAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIOWtl+S9kyDihpIg5ZG95Lit5bel56iL5a2X5L2T6LWE5rqQ5bCx5byC5q2l5Yqg6L295ZCO6K6+IGxhYmVsLmZvbnTvvJvmnKrlkb3kuK3lm57pgIDpu5jorqTlrZfkvZPjgIJcbiAgICAgICAgICAgICAgICAgICAgLy8g6LWw5qih5p2/5YWL6ZqG5pe25a2X5L2T55Sx5qih5p2/5bim5p2l77yM6L+Z6YeM5LiN5YaN5Y2V54us5Yqg6L2944CCXG4gICAgICAgICAgICAgICAgICAgIGlmICghdXNlVGVtcGxhdGUgJiYgIXVzZVJpY2hUZXh0ICYmIGZpZ21hTm9kZS5mb250VXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZ0ZvbnRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldDogbGFiZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXVpZDogZmlnbWFOb2RlLmZvbnRVdWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbGVOYW1lOiBmaWdtYU5vZGUuZm9udEZpbGVOYW1lIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZhbGxiYWNrQm9sZDogd2FudHNCb2xkKFN0cmluZyhmaWdtYU5vZGUuZm9udFdlaWdodCB8fCAnJykpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJpY2g6ICEhdXNlUmljaFRleHQsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyDmuJDlj5jmloflrZfvvJrkv53nlZkgdGV4dEdyYWRpZW50IOivreS5ieW5tuaagueUqOWNleiJsiBmYWxsYmFja++8m+S4jeeUn+aIkOaWh+WtlyBQTkfjgIJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJpY2hUZXh0TW91bnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpY2hUZXh0TW91bnQubm9kZS5hY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZ1JpY2hUZXh0U2hhZG93cy5wdXNoKHsgYXV0aG9yZWROb2RlOiBub2RlLCB0YXJnZXQ6IHJpY2hUZXh0TW91bnQucmljaFRleHQsIGZpZ21hTm9kZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOKUgOKUgCDoo4HliaogLyDpga7nvakg4pSA4pSAXG4gICAgICAgICAgICAgICAgLy8gY2xpcHNDb250ZW50IOKGkiDnn6nlvaIgTWFza++8iOerr+WPoyA2MTfvvIznrYnku7cgUmVjdE1hc2syRO+8iVxuICAgICAgICAgICAgICAgIGlmIChmaWdtYU5vZGUuY2xpcHNDb250ZW50ICYmICFmaWdtYU5vZGUubWFzaykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtID0gbm9kZS5hZGRDb21wb25lbnQoTWFzayk7XG4gICAgICAgICAgICAgICAgICAgIG0udHlwZSA9IE1hc2suVHlwZS5HUkFQSElDU19SRUNUO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIOWbvueJh+mBrue9qe+8iOerr+WPoyBTZXR1cEltYWdlTWFzayA2NTnvvInigJTigJTmnKznqL8gMCDmoLfmnKzvvIzlhpnlpb3kvYbmnKrpqozor4HvvJvlpLHotKXlm57pgIDkuI3kuKLlrZDoioLngrlcbiAgICAgICAgICAgICAgICBsZXQgY2hpbGRQYXJlbnQgPSBub2RlO1xuICAgICAgICAgICAgICAgIGxldCBtYXNrT2ZmWCA9IDAsIG1hc2tPZmZZID0gMDtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXNrID0gZmlnbWFOb2RlLm1hc2s7XG4gICAgICAgICAgICAgICAgY29uc3QgbWFza1Nwcml0ZVV1aWQgPSBtYXNrICYmIG1hc2subWFza1JlZiA/IChpZFRvTWFza1Nwcml0ZUZyYW1lW21hc2subWFza1JlZl0gfHwgaWRUb1Nwcml0ZUZyYW1lW21hc2subWFza1JlZl0pIDogJyc7XG4gICAgICAgICAgICAgICAgbGV0IG1hc2tGYWxsc0JhY2tUb1JlY3QgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpZiAobWFzayAmJiBtYXNrLm1hc2tSZWYpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgd2FudHNJbWFnZU1hc2sgPSBtYXNrLnVzZUltYWdlTWFzayAhPT0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIG1hc2tGYWxsc0JhY2tUb1JlY3QgPSAhd2FudHNJbWFnZU1hc2sgfHwgIW1hc2tTcHJpdGVVdWlkO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWFzayAmJiBtYXNrLm1hc2tSZWYgJiYgbWFza1Nwcml0ZVV1aWQgJiYgbWFzay51c2VJbWFnZU1hc2sgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtYXNrTm9kZSA9IG5ldyBOb2RlKGAke3Nhbml0aXplQ29jb3NOb2RlTmFtZShtYXNrLm5hbWUgfHwgZmlnbWFOb2RlLm5hbWUsICdNYXNrJyl9X01hc2tgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hc2tOb2RlLmxheWVyID0gbm9kZS5sYXllcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG11aSA9IG1hc2tOb2RlLmFkZENvbXBvbmVudChVSVRyYW5zZm9ybSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtdWkuc2V0Q29udGVudFNpemUobWFzay53aWR0aCB8fCB3LCBtYXNrLmhlaWdodCB8fCBoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG11aS5zZXRBbmNob3JQb2ludCgwLjUsIDAuNSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlLmFkZENoaWxkKG1hc2tOb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIOmBrue9qeefqeW9ouWcqOeItig9bm9kZSnlsYDpg6jnmoTkvY3nva5cbiAgICAgICAgICAgICAgICAgICAgICAgIHBsYWNlQWJzb2x1dGUobWFza05vZGUsIHsgeDogbWFzay54LCB5OiBtYXNrLnksIHJvdGF0aW9uOiBtYXNrLnJvdGF0aW9uIHx8IDAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXNrLndpZHRoIHx8IHcsIG1hc2suaGVpZ2h0IHx8IGgsIHcsIGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbUNvbXAgPSBtYXNrTm9kZS5hZGRDb21wb25lbnQoTWFzayk7XG4gICAgICAgICAgICAgICAgICAgICAgICBtQ29tcC50eXBlID0gTWFzay5UeXBlLlNQUklURV9TVEVOQ0lMO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RlbmNpbFNwcml0ZSA9IG1hc2tOb2RlLmdldENvbXBvbmVudChTcHJpdGUpIHx8IG1hc2tOb2RlLmFkZENvbXBvbmVudChTcHJpdGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0ZW5jaWxTcHJpdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGVuY2lsU3ByaXRlLmVuYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0ZW5jaWxTcHJpdGUuc2l6ZU1vZGUgPSBTcHJpdGUuU2l6ZU1vZGUuQ1VTVE9NO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0ZW5jaWxTcHJpdGUudHJpbSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0ZW5jaWxTcHJpdGUuY29sb3IgPSBuZXcgQ29sb3IoMjU1LCAyNTUsIDI1NSwgMjU1KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHBlbmRpbmdNYXNrcy5wdXNoKHsgc3ByaXRlOiBzdGVuY2lsU3ByaXRlLCB1dWlkOiBtYXNrU3ByaXRlVXVpZCB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkUGFyZW50ID0gbWFza05vZGU7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXNrT2ZmWCA9IG1hc2sueCB8fCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgbWFza09mZlkgPSBtYXNrLnkgfHwgMDtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8g5Zue6YCA77ya5Zu+54mH6YGu572p5aSx6LSl77yM5a2Q6IqC54K55LuN5oyC5Y6f6IqC54K577yM6Iez5bCR5LiN5LiiXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZFBhcmVudCA9IG5vZGU7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXNrT2ZmWCA9IG1hc2tPZmZZID0gMDtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hc2tGYWxsc0JhY2tUb1JlY3QgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtYXNrRmFsbHNCYWNrVG9SZWN0ICYmICFub2RlLmdldENvbXBvbmVudChNYXNrKSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBtID0gbm9kZS5hZGRDb21wb25lbnQoTWFzayk7XG4gICAgICAgICAgICAgICAgICAgIG0udHlwZSA9IE1hc2suVHlwZS5HUkFQSElDU19SRUNUO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWFzayAmJiBtYXNrLmZhbGxiYWNrUmVhc29uID09PSAnZGVnZW5lcmF0ZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSDoioLngrnjgIwke2ZpZ21hTm9kZS5uYW1lfeOAjeeahOWbvueJh+mBrue9qei/keS5juepuueZve+8jOW3sumAgOWbnuefqeW9ouijgeWJquOAgmApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8g6YCS5b2S5a2Q6IqC54K5XG4gICAgICAgICAgICAgICAgY29uc3QgdGhpc0VmZkxheW91dCA9IGVmZmVjdGl2ZUhhc0xheW91dChmaWdtYU5vZGUpO1xuICAgICAgICAgICAgICAgIC8vIOaYr+WQpue7meacrOiKgueCueaMgiBjYy5MYXlvdXTvvJpVbml0eSBFZmZlY3RpdmVIYXNMYXlvdXQgKyDpnZ4gV3JhcCArIOe6r+WHgOWuueWZqOOAglxuICAgICAgICAgICAgICAgIC8vIOmBrue9qeWcuuaZr++8iGNoaWxkUGFyZW50ICE9PSBub2Rl77yJ5a2Q6IqC54K55oyC5Zyo6YGu572p6IqC54K55LiL77yM5LiN5oyCIExheW91dOOAglxuICAgICAgICAgICAgICAgIGNvbnN0IG1vdW50TGF5b3V0ID0gY2hpbGRQYXJlbnQgPT09IG5vZGUgJiYgc2hvdWxkTW91bnRMYXlvdXQoZmlnbWFOb2RlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZHJlbiA9IGZpZ21hTm9kZS5jaGlsZHJlbiB8fCBbXTtcbiAgICAgICAgICAgICAgICAvLyDmjILliLDpga7nvanoioLngrnkuIvml7bvvIzlrZDoioLngrnlj4Lnhafns7vmmK/pga7nvannn6nlvaLvvJrlnZDmoIfph43ln7ogKyDnlKjpga7nvanlsLrlr7jlvZMgcGFyZW50Vy9IXG4gICAgICAgICAgICAgICAgY29uc3QgY3cgPSBjaGlsZFBhcmVudCA9PT0gbm9kZSA/IHcgOiAobWFzay53aWR0aCB8fCB3KTtcbiAgICAgICAgICAgICAgICBjb25zdCBjaCA9IGNoaWxkUGFyZW50ID09PSBub2RlID8gaCA6IChtYXNrLmhlaWdodCB8fCBoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaGlsZFBhcmVudCAhPT0gbm9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2hpbGQueCA9IChjaGlsZC54IHx8IDApIC0gbWFza09mZlg7XG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZC55ID0gKGNoaWxkLnkgfHwgMCkgLSBtYXNrT2ZmWTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBidWlsZE5vZGUoY2hpbGQsIGNoaWxkUGFyZW50LCBmaWdtYU5vZGUsIGN3LCBjaCwgdGhpc0VmZkxheW91dCwgZmFsc2UsIG1vdW50TGF5b3V0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8g5a2Q6IqC54K55bu65a6M5ZCO5oyCIExheW91dO+8iGNjLkxheW91dCDpnIDog73nnIvliLDlhajpg6jlrZDoioLngrnmiY3og73mraPnoa7mjpLluIPvvIlcbiAgICAgICAgICAgICAgICBpZiAobW91bnRMYXlvdXQpIGFwcGx5TGF5b3V0KG5vZGUsIGZpZ21hTm9kZSk7XG4gICAgICAgICAgICAgICAgY29uc3QgaW5wdXRTcGVjID0gbm9ybWFsaXplRmlnbWFJbnB1dFNwZWMoZmlnbWFOb2RlKTtcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXRTcGVjKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0TW91bnQgPSBtb3VudEZ0b2NJbnB1dEVkaXRCb3goXG4gICAgICAgICAgICAgICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZmlnbWFOb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZmlnbWFJZFRvTm9kZS5nZXQoaW5wdXRTcGVjLnRleHROb2RlSWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2MsXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpbnB1dE1vdW50LmFwcGxpZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVkaXRCb3hlcysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZ0lucHV0TGFiZWxTdHlsZXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc291cmNlOiBpbnB1dE1vdW50LmF1dGhvcmVkTGFiZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiBpbnB1dE1vdW50LnBsYWNlaG9sZGVyTGFiZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBlbmRpbmdJbnB1dExhYmVsU3R5bGVzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogaW5wdXRNb3VudC5hdXRob3JlZExhYmVsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldDogaW5wdXRNb3VudC50ZXh0TGFiZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIOi+k+WFpeahhuOAjCR7ZmlnbWFOb2RlLm5hbWUgfHwgZmlnbWFOb2RlLmZpZ21hSWQgfHwgJyd944CN5pyq5oyC6L29OmAsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnB1dE1vdW50LnJlYXNvbixcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNob3VsZEZpbmFsaXplRXhhY3RUZXh0U3R5bGVUZW1wbGF0ZU5vZGUoZXhhY3RUZXh0VGVtcGxhdGVDbG9uZSwgc3RhdGVRdWV1ZWQpKSB7XG4gICAgICAgICAgICAgICAgICAgIGZpbmFsaXplRXhhY3RUZXh0U3R5bGVUZW1wbGF0ZU5vZGUobm9kZSwgZmlnbWFOb2RlLnZpc2libGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGJ1aWxkTm9kZShkYXRhLnJvb3QsIHBhcmVudE5vZGUsIG51bGwsIGNhbnZhc1csIGNhbnZhc0gsIGZhbHNlLCB0cnVlLCBmYWxzZSk7XG4gICAgICAgICAgICBpZiAoaW1wb3J0ZWRSb290ICYmIGRhdGEucm9vdENhbnZhc0Fic29sdXRlKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdFVpID0gaW1wb3J0ZWRSb290LmdldENvbXBvbmVudCAmJiBpbXBvcnRlZFJvb3QuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICAgICAgICAgICAgICBpZiAocm9vdFVpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFic1Jvb3QgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAuLi5kYXRhLnJvb3QsXG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBOdW1iZXIoZGF0YS5yb290Q2FudmFzQWJzb2x1dGUueCkgfHwgMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHk6IE51bWJlcihkYXRhLnJvb3RDYW52YXNBYnNvbHV0ZS55KSB8fCAwLFxuICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICBhcHBseVBhdGNoVHJhbnNmb3JtKFxuICAgICAgICAgICAgICAgICAgICAgICAgaW1wb3J0ZWRSb290LFxuICAgICAgICAgICAgICAgICAgICAgICAgcm9vdFVpLFxuICAgICAgICAgICAgICAgICAgICAgICAgYWJzUm9vdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGEuY2FudmFzIHx8IGRhdGEucm9vdCxcbiAgICAgICAgICAgICAgICAgICAgICAgIFZlYzMsXG4gICAgICAgICAgICAgICAgICAgICAgICB0cnVlLFxuICAgICAgICAgICAgICAgICAgICAgICAgVUlUcmFuc2Zvcm0sXG4gICAgICAgICAgICAgICAgICAgICAgICBmaW5kXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGltcG9ydGVkUm9vdCAmJiByZXF1ZXN0ZWRTaWJsaW5nSW5kZXggPj0gMCAmJiB0eXBlb2YgaW1wb3J0ZWRSb290LnNldFNpYmxpbmdJbmRleCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGltcG9ydGVkUm9vdC5zZXRTaWJsaW5nSW5kZXgocmVxdWVzdGVkU2libGluZ0luZGV4KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8g5byC5q2l5om56YeP5Yqg6L29IFNwcml0ZUZyYW1lIOW5tuiuvue9rlxuICAgICAgICAgICAgbGV0IGxvYWRlZCA9IDA7XG4gICAgICAgICAgICBsZXQgc2xpY2VkTG9hZGVkID0gMDtcbiAgICAgICAgICAgIGxldCBpbWFnZUZpbGxTcHJpdGVzID0gMDtcbiAgICAgICAgICAgIC8vIOW4pumHjeivleeahCBsb2FkQW5577ya5YiaIHJlaW1wb3J0IOeahOi1hOa6kOWPr+iDveacquWwsee7qizmi7/nqbrliJnova7or6LnrYnlvoUo5pe25bqP56ue5oCB6auY6aKR5Z2RLOingSBtZW1vcnkp44CCXG4gICAgICAgICAgICBjb25zdCBsb2FkQW55UmV0cnkgPSAoXG4gICAgICAgICAgICAgICAgdXVpZDogc3RyaW5nLFxuICAgICAgICAgICAgICAgIHRyaWVzID0gMTAsXG4gICAgICAgICAgICAgICAgZGVsYXlNcyA9IDEwMCxcbiAgICAgICAgICAgICAgICByZWFkeT86IChhc3NldDogYW55KSA9PiBib29sZWFuLFxuICAgICAgICAgICAgKTogUHJvbWlzZTxhbnk+ID0+XG4gICAgICAgICAgICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYXR0ZW1wdCA9IChsZWZ0OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc2V0TWFuYWdlci5sb2FkQW55KHsgdXVpZCB9LCAoZXJyOiBhbnksIGFzc2V0OiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWVyciAmJiBhc3NldCAmJiAoIXJlYWR5IHx8IHJlYWR5KGFzc2V0KSkpIHsgcmVzb2x2ZShhc3NldCk7IHJldHVybjsgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsZWZ0IDw9IDApIHsgcmVzb2x2ZShudWxsKTsgcmV0dXJuOyB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiBhdHRlbXB0KGxlZnQgLSAxKSwgZGVsYXlNcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgYXR0ZW1wdCh0cmllcyk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICBwZW5kaW5nU3ByaXRlcy5tYXAoXG4gICAgICAgICAgICAgICAgICAgIChwZW5kaW5nKSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB7IHNwcml0ZSwgdXVpZCwgc2xpY2U5Qm9yZGVyLCBpbWFnZUZpbGwsIHdpZHRoLCBoZWlnaHQgfSA9IHBlbmRpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ByaXRlRnJhbWUgPSBhd2FpdCBsb2FkQW55UmV0cnkoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDMwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAxMDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNsaWNlOUJvcmRlciA/IGlzU3ByaXRlRnJhbWVUZXh0dXJlUmVhZHkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3ByaXRlRnJhbWUgJiYgc3ByaXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBmaW5hbEZyYW1lID0gc3ByaXRlRnJhbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzbGljZTlCb3JkZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbmFsRnJhbWUgPSBhcHBseVNsaWNlOUJvcmRlcihzcHJpdGVGcmFtZSwgc2xpY2U5Qm9yZGVyLCBSZWN0LCBTaXplLCBWZWMyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFkYXB0ZWQgPSBhZGFwdEltYWdlRmlsbFNwcml0ZUZyYW1lKHNwcml0ZUZyYW1lLCBpbWFnZUZpbGwsIHdpZHRoLCBoZWlnaHQsIFJlY3QsIFNpemUsIFZlYzIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmluYWxGcmFtZSA9IGFkYXB0ZWQuZnJhbWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoYWRhcHRlZC5jcm9wcGVkKSBjcm9wcGVkSW1hZ2VGaWxscysrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlRmlsbCAmJiBTdHJpbmcoaW1hZ2VGaWxsLnNvdXJjZSB8fCAnJykudG9VcHBlckNhc2UoKSA9PT0gJ0ZJTEwnKSBpbWFnZUZpbGxTcHJpdGVzKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3ByaXRlLnNwcml0ZUZyYW1lID0gZmluYWxGcmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8g6K6+5Zu+5ZCO6Kem5Y+R5riy5p+T5qCH6ISPLOmBv+WFjVwi5bu65a6M56m655m944CB5ouW5LiA5LiL5omN5pi+56S6XCIo5pe25bqP56ue5oCB5L2Z5rOiKeOAglxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHNwcml0ZS5tYXJrRm9yVXBkYXRlUmVuZGVyRGF0YSA9PT0gJ2Z1bmN0aW9uJykgc3ByaXRlLm1hcmtGb3JVcGRhdGVSZW5kZXJEYXRhKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2FkZWQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNsaWNlOUJvcmRlcikgc2xpY2VkTG9hZGVkKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChzcHJpdGUgJiYgcGVuZGluZy5ob3N0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrRmFpbGVkU3ByaXRlTG9hZChwZW5kaW5nLCB1bnJlc29sdmVkUGxhY2Vob2xkZXJzLCBjYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIFNwcml0ZUZyYW1lIHV1aWQg5bey5a2Y5Zyo5L2G5Zy65pmv5Yqg6L296LaF5pe277yM5L+d55WZ5ZOB57qi5bm26L2s5YWl5ZCO57ut5pu/5o2iOicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1dWlkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZy5pbWdSZWYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSkoKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vIOW8guatpeWKoOi9vemBrue9qSBTcHJpdGVGcmFtZe+8iFNQUklURV9TVEVOQ0lM77yJXG4gICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICBwZW5kaW5nTWFza3MubWFwKFxuICAgICAgICAgICAgICAgICAgICAoeyBzcHJpdGUsIHV1aWQgfSkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ByaXRlRnJhbWUgPSBhd2FpdCBsb2FkQW55UmV0cnkodXVpZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNwcml0ZUZyYW1lICYmIHNwcml0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcHJpdGUuc3ByaXRlRnJhbWUgPSBzcHJpdGVGcmFtZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBzcHJpdGUubWFya0ZvclVwZGF0ZVJlbmRlckRhdGEgPT09ICdmdW5jdGlvbicpIHNwcml0ZS5tYXJrRm9yVXBkYXRlUmVuZGVyRGF0YSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vIOW8guatpeWKoOi9veWtl+S9k++8iGNjLkZvbnTvvInlubborr7liLAgTGFiZWzvvIjpmLbmrrUgNSDlrZfkvZPmoLflvI/lupPvvIlcbiAgICAgICAgICAgIGxldCBmb250c0xvYWRlZCA9IDA7XG4gICAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgICAgICAgICBwZW5kaW5nRm9udHMubWFwKFxuICAgICAgICAgICAgICAgICAgICAoeyB0YXJnZXQsIHV1aWQsIGZpbGVOYW1lLCBmYWxsYmFja0JvbGQsIHJpY2ggfSkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9udCA9IGF3YWl0IGxvYWRBbnlSZXRyeSh1dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZm9udCAmJiAoIUZvbnQgfHwgZm9udCBpbnN0YW5jZW9mIEZvbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5mb250ID0gZm9udDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnVzZVN5c3RlbUZvbnQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9udHNMb2FkZWQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGZvbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyaWNoKSB0YXJnZXQuaXNCb2xkID0gZmFsbGJhY2tCb2xkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQudXNlU3lzdGVtRm9udCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSDlrZfkvZMgdXVpZCDliqDovb3nu5PmnpzkuI3mmK8gY2MuRm9udO+8jOW3suWbnumAgOezu+e7n+Wtl+S9kzonLCB1dWlkLCBmaWxlTmFtZSwgZm9udC5jb25zdHJ1Y3RvciAmJiBmb250LmNvbnN0cnVjdG9yLm5hbWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmljaCkgdGFyZ2V0LmlzQm9sZCA9IGZhbGxiYWNrQm9sZDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnVzZVN5c3RlbUZvbnQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcjpzY2VuZV0g5a2X5L2TIHV1aWQg5Yqg6L295aSx6LSl5oiW5pyq5bCx57uq77yM5bey5Zue6YCA57O757uf5a2X5L2TOicsIHV1aWQsIGZpbGVOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vIOeOrzTvvJrlpZfnlKjnvo7mnK/miYvphY3nmoTlrZfkvZPmoLflvI/mqKHmnb/igJTigJTku44gcHJlZmFiIOWFi+mahuaooeadvyBMYWJlbCDnmoTlpJbop4LliLDlr7zlhaUgTGFiZWzjgIJcbiAgICAgICAgICAgIGlmIChwZW5kaW5nVGVtcGxhdGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmVmYWJDYWNoZTogeyBbdXVpZDogc3RyaW5nXTogYW55IH0gPSB7fTtcbiAgICAgICAgICAgICAgICBjb25zdCByb290Q2FjaGU6IHsgW3V1aWQ6IHN0cmluZ106IGFueSB9ID0ge307XG4gICAgICAgICAgICAgICAgY29uc3QgbG9hZFByZWZhYkNhY2hlZCA9IGFzeW5jICh1dWlkOiBzdHJpbmcpOiBQcm9taXNlPGFueT4gPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJlZmFiQ2FjaGVbdXVpZF0gIT09IHVuZGVmaW5lZCkgcmV0dXJuIHByZWZhYkNhY2hlW3V1aWRdO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYXNzZXQgPSBhd2FpdCBsb2FkUHJlZmFiQXNzZXQoYXNzZXRNYW5hZ2VyLCB1dWlkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZWZhYkNhY2hlW3V1aWRdID0gYXNzZXQgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJlZmFiQ2FjaGVbdXVpZF0gPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIOaooeadvyBwcmVmYWIg5Yqg6L295aSx6LSlOicsIHV1aWQsIChlIGFzIGFueSkgJiYgKGUgYXMgYW55KS5tZXNzYWdlIHx8IGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwcmVmYWJDYWNoZVt1dWlkXTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdCBvZiBwZW5kaW5nVGVtcGxhdGVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCB0cGxMYWJlbDogYW55ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHQucHJlZmFiVXVpZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJlZmFiID0gYXdhaXQgbG9hZFByZWZhYkNhY2hlZCh0LnByZWZhYlV1aWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZWZhYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIOavj+S4qiBwcmVmYWIg5Y+qIGluc3RhbnRpYXRlIOS4gOasoe+8jOWkjeeUqOWFtuiKgueCueagkeWPluaooeadvyBMYWJlbOOAglxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCByb290Tm9kZSA9IHJvb3RDYWNoZVt0LnByZWZhYlV1aWRdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyb290Tm9kZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByb290Tm9kZSA9IGluc3RhbnRpYXRlKHByZWZhYik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvb3ROb2RlID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSDmqKHmnb8gcHJlZmFiIOWunuS+i+WMluWksei0pTonLCB0LnByZWZhYlV1aWQsIChlIGFzIGFueSkgJiYgKGUgYXMgYW55KS5tZXNzYWdlIHx8IGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJvb3RDYWNoZVt0LnByZWZhYlV1aWRdID0gcm9vdE5vZGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRwbE5vZGUgPSByb290Tm9kZSAmJiBnZXROb2RlQnlQYXRoKHJvb3ROb2RlLCB0LmZpZ21hUGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHBsTGFiZWwgPSB0cGxOb2RlICYmIHRwbE5vZGUuZ2V0Q29tcG9uZW50ID8gdHBsTm9kZS5nZXRDb21wb25lbnQoTGFiZWwpIDogbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0LmZvbnRPbmx5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSBhd2FpdCBhcHBseVJpY2hUZXh0Rm9udChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LnRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0cGxMYWJlbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LnJlc29sdmVyRm9udFV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9hZEFueVJldHJ5LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEZvbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNvdXJjZSA9PT0gJ3RlbXBsYXRlJykgdGVtcGxhdGVzQXBwbGllZCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoc291cmNlID09PSAncmVzb2x2ZXInKSBmb250c0xvYWRlZCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAnW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSBSaWNoVGV4dCDlrZfkvZPmqKHmnb/lkowgcmVzb2x2ZXIg5Z2H5pyq5ZG95Lit77yM5bey5Zue6YCA57O757uf5a2X5L2TOicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQucmVzb2x2ZXJGb250VXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5yZXNvbHZlckZvbnRGaWxlTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRwbExhYmVsKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oJ1tmaWdtYS1pbXBvcnRlcjpzY2VuZV0g5qih5p2/6IqC54K5L0xhYmVsIOacquaJvuWIsDonLCB0LmZpZ21hUGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoY29weUxhYmVsQXBwZWFyYW5jZSh0cGxMYWJlbCwgdC50YXJnZXQsIEZvbnQpKSB0ZW1wbGF0ZXNBcHBsaWVkKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIOa4heeQhuS4tOaXtuWunuS+i+WMlueahOaooeadv+agkeOAglxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdXVpZCBvZiBPYmplY3Qua2V5cyhyb290Q2FjaGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJuID0gcm9vdENhY2hlW3V1aWRdO1xuICAgICAgICAgICAgICAgICAgICBpZiAocm4gJiYgdHlwZW9mIHJuLmRlc3Ryb3kgPT09ICdmdW5jdGlvbicpIHJuLmRlc3Ryb3koKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgcGVuZGluZyBvZiBwZW5kaW5nSW5wdXRMYWJlbFN0eWxlcykge1xuICAgICAgICAgICAgICAgIC8vIFRleHRTdHlsZS90ZW1wbGF0ZSByZXNvbHV0aW9uIGNhbiByZS1lbmFibGUgdGhlIGF1dGhvcmVkXG4gICAgICAgICAgICAgICAgLy8gTGFiZWwgYWZ0ZXIgbW91bnQuIEZpbmFsIHN5bmNocm9uaXphdGlvbiBvd25zIHRoZSByZW5kZXJpbmdcbiAgICAgICAgICAgICAgICAvLyBib3VuZGFyeTogYXV0aG9yZWQgc3RheXMgaW5zcGVjdGFibGUsIG5hdGl2ZSBjaGlsZHJlbiBkcmF3LlxuICAgICAgICAgICAgICAgIHN5bmNJbnB1dE5hdGl2ZUxhYmVsU3R5bGUocGVuZGluZy5zb3VyY2UsIHBlbmRpbmcudGFyZ2V0KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChjb25zdCB1dWlkIG9mIE9iamVjdC5rZXlzKGV4YWN0VGV4dFRlbXBsYXRlUm9vdHMpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgcm9vdE5vZGUgPSBleGFjdFRleHRUZW1wbGF0ZVJvb3RzW3V1aWRdO1xuICAgICAgICAgICAgICAgIGlmIChyb290Tm9kZSAmJiB0eXBlb2Ygcm9vdE5vZGUuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykgcm9vdE5vZGUuZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHBlbmRpbmcgb2YgcGVuZGluZ1JpY2hUZXh0U2hhZG93cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IG1vdW50RnRvY1JpY2hUZXh0U2hhZG93KHBlbmRpbmcuYXV0aG9yZWROb2RlLCBwZW5kaW5nLmZpZ21hTm9kZSwgcGVuZGluZy50YXJnZXQsIGNjKTtcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LmFwcGxpZWQpIHJpY2hUZXh0U2hhZG93cysrO1xuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuYmx1ckZhbGxiYWNrKSByaWNoVGV4dFNoYWRvd0JsdXJGYWxsYmFja3MrKztcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0Lndhcm5pbmcpIGNvbnNvbGUud2FybignW2ZpZ21hLWltcG9ydGVyOnNjZW5lXScsIHJlc3VsdC53YXJuaW5nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgY291bnQsXG4gICAgICAgICAgICAgICAgICAgIHNwcml0ZXM6IGxvYWRlZCxcbiAgICAgICAgICAgICAgICAgICAgc2xpY2VkU3ByaXRlczogc2xpY2VkTG9hZGVkLFxuICAgICAgICAgICAgICAgICAgICBpbWFnZUZpbGxTcHJpdGVzLFxuICAgICAgICAgICAgICAgICAgICBtYXNrczogcGVuZGluZ01hc2tzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgZm9udHM6IGZvbnRzTG9hZGVkLFxuICAgICAgICAgICAgICAgICAgICB0ZW1wbGF0ZXNBcHBsaWVkLFxuICAgICAgICAgICAgICAgICAgICBzb2xpZEZpbGxzLFxuICAgICAgICAgICAgICAgICAgICByaWNoVGV4dHMsXG4gICAgICAgICAgICAgICAgICAgIGJ1dHRvbnMsXG4gICAgICAgICAgICAgICAgICAgIGVkaXRCb3hlcyxcbiAgICAgICAgICAgICAgICAgICAgb3ZlcmxheVRpbnRzLFxuICAgICAgICAgICAgICAgICAgICB0cmFuc3BhcmVudFJlY3RhbmdsZXMsXG4gICAgICAgICAgICAgICAgICAgIG1pc3NpbmdJbWFnZXMsXG4gICAgICAgICAgICAgICAgICAgIGNyb3BwZWRJbWFnZUZpbGxzLFxuICAgICAgICAgICAgICAgICAgICBtYXBwZWRQcmVmYWJzLFxuICAgICAgICAgICAgICAgICAgICB1bm1hcHBlZENvbXBvbmVudHMsXG4gICAgICAgICAgICAgICAgICAgIGJyb2tlbkNvbXBvbmVudE1hcHBpbmdzLFxuICAgICAgICAgICAgICAgICAgICBmYWlsZWRQcmVmYWJJbnN0YW5jZXMsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFN0YXRlc0F0dGFjaGVkLFxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnRTdGF0ZVVuYXZhaWxhYmxlLFxuICAgICAgICAgICAgICAgICAgICBwZW5kaW5nQ29tcG9uZW50U3RhdGVzLFxuICAgICAgICAgICAgICAgICAgICAvLyBMZWdhY3kgcmVzdWx0IGtleSBrZXB0IGZvciBvbGRlciBwYW5lbCBjYWxsZXJzOyBtYWluXG4gICAgICAgICAgICAgICAgICAgIC8vIHByZWZlcnMgcGVuZGluZ0NvbXBvbmVudFN0YXRlcyBhbmQgZmluYWxpemVzIG9ubHkgb25jZS5cbiAgICAgICAgICAgICAgICAgICAgcGVuZGluZ01hcHBlZENvbXBvbmVudFN0YXRlczogcGVuZGluZ0NvbXBvbmVudFN0YXRlcyxcbiAgICAgICAgICAgICAgICAgICAgc2hhcmVkQ3JvcHBlZEltYWdlczogZGF0YS5pbXBvcnRNZXRhICYmIGRhdGEuaW1wb3J0TWV0YS5zaGFyZWRDcm9wcGVkSW1hZ2VzIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIHNoYXJlZENyb3BwZWRTbGljZUNoaWxkcmVuOiBkYXRhLmltcG9ydE1ldGEgJiYgZGF0YS5pbXBvcnRNZXRhLnNoYXJlZENyb3BwZWRTbGljZUNoaWxkcmVuIHx8IDAsXG4gICAgICAgICAgICAgICAgICAgIHRleHRTdHlsZVNpZ25hdHVyZXM6IHRleHRTdHlsZVNpZ25hdHVyZXMuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgbGFiZWxzV2l0aFRleHRTdHlsZU5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHRleHRTdHlsZVRlbXBsYXRlTGFiZWxzLFxuICAgICAgICAgICAgICAgICAgICBncmFkaWVudFRleHRGYWxsYmFja3MsXG4gICAgICAgICAgICAgICAgICAgIHJpY2hUZXh0U2hhZG93cyxcbiAgICAgICAgICAgICAgICAgICAgcmljaFRleHRTaGFkb3dCbHVyRmFsbGJhY2tzLFxuICAgICAgICAgICAgICAgICAgICBwYXJlbnQ6IHBhcmVudE5vZGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcm9vdFV1aWQ6IGltcG9ydGVkUm9vdCA/IGltcG9ydGVkUm9vdC51dWlkIDogJycsXG4gICAgICAgICAgICAgICAgICAgIC8vIOW+heWwsee7quabv+aNoueahOWTgee6ouWNoOS9jea4heWNle+8mm1haW4g5ZCO5Y+w6L2u6K+i5a2Q6LWE5rqQ5bCx57uq5ZCO5o2u5q2k5pu/5o2i55yf5Zu+44CCXG4gICAgICAgICAgICAgICAgICAgIHVucmVzb2x2ZWRQbGFjZWhvbGRlcnMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgc3RhY2s6IGVycm9yLnN0YWNrIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIFJlcGxhY2UgbWFnZW50YSBwbGFjZWhvbGRlcnMgd2l0aCByZWFsIFNwcml0ZUZyYW1lcyBvbmNlIHRoZWlyIHN1Yi1hc3NldHMgYXJlIHJlYWR5LlxuICAgICAqIEB6aCDmioogYnVpbGRUcmVlIOaMgueahOWTgee6ouWNoOS9jeabv+aNouaIkOecn+Wbvu+8iOWNoOS9jeKGkuabv+aNouaWueahiOeahOabv+aNouerr++8ieOAglxuICAgICAqIG1haW4g5ZCO5Y+w6L2u6K+iIFNwcml0ZUZyYW1lIOWtkOi1hOa6kOWwsee7quWQju+8jOaKiuW3suino+aekOWlvSB1dWlkIOeahOa4heWNleS4gOasoeaAp+S8oOi/m+adpeaJuemHj+abv+aNou+8jFxuICAgICAqIOmBv+WFjeavj+W8oOWbvuS4gOasoSBJUEMg5b6A6L+U44CC5q+P6aG577ya5oyJIG5vZGVVdWlkIOWumuS9jeiKgueCue+8iOinhuinieWuv+S4u++8ieKGkiDnp7vpmaQgX01pc3NpbmdJbWcg5ZOB57qi5a2Q6IqC54K5XG4gICAgICog4oaSIOWcqOWuv+S4u+S4iuWKoC/lj5YgU3ByaXRlIOW5tuWKoOi9veecnyBTcHJpdGVGcmFtZe+8iOWkjeeUqCBidWlsZFRyZWUg55qEIHNsaWNlOS9pbWFnZUZpbGwg6YCC6YWN77yJ44CCXG4gICAgICovXG4gICAgYXN5bmMgcmVwbGFjZUltYWdlUGxhY2Vob2xkZXJzKGRhdGE6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY2MgPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciwgU3ByaXRlLCBSZWN0LCBTaXplLCBWZWMyLCBDb2xvciwgYXNzZXRNYW5hZ2VyIH0gPSBjYztcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zOiBhbnlbXSA9IEFycmF5LmlzQXJyYXkoZGF0YSAmJiBkYXRhLml0ZW1zKSA/IGRhdGEuaXRlbXMgOiBbXTtcbiAgICAgICAgICAgIGxldCByZXBsYWNlZCA9IDA7XG4gICAgICAgICAgICBsZXQgZmFpbGVkID0gMDtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBpdCBvZiBpdGVtcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGVVdWlkID0gU3RyaW5nKGl0ICYmIGl0Lm5vZGVVdWlkIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzcHJpdGVGcmFtZVV1aWQgPSBTdHJpbmcoaXQgJiYgaXQuc3ByaXRlRnJhbWVVdWlkIHx8ICcnKTtcbiAgICAgICAgICAgICAgICBpZiAoIW5vZGVVdWlkIHx8ICFzcHJpdGVGcmFtZVV1aWQpIHsgZmFpbGVkKys7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgICAgICAgY29uc3QgaG9zdCA9IGZpbmROb2RlQnlVdWlkKHNjZW5lLCBub2RlVXVpZCk7XG4gICAgICAgICAgICAgICAgaWYgKCFob3N0KSB7IGZhaWxlZCsrOyBjb250aW51ZTsgfVxuXG4gICAgICAgICAgICAgICAgY29uc3Qgc2xpY2U5Qm9yZGVyID0gaXQuc2xpY2U5Qm9yZGVyIHx8IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ByaXRlRnJhbWUgPSBhd2FpdCBsb2FkQXNzZXRBbnkoXG4gICAgICAgICAgICAgICAgICAgIGFzc2V0TWFuYWdlcixcbiAgICAgICAgICAgICAgICAgICAgc3ByaXRlRnJhbWVVdWlkLFxuICAgICAgICAgICAgICAgICAgICBzbGljZTlCb3JkZXIgPyAzMCA6IDEwLFxuICAgICAgICAgICAgICAgICAgICAxMDAsXG4gICAgICAgICAgICAgICAgICAgIHNsaWNlOUJvcmRlciA/IGlzU3ByaXRlRnJhbWVUZXh0dXJlUmVhZHkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXNwcml0ZUZyYW1lKSB7IGZhaWxlZCsrOyBjb250aW51ZTsgfVxuXG4gICAgICAgICAgICAgICAgLy8g56e76Zmk5ZOB57qi5Y2g5L2N5a2Q6IqC54K577yIbW91bnRNaXNzaW5nSW1hZ2VQbGFjZWhvbGRlciDlu7rnmoQgX01pc3NpbmdJbWfvvIlcbiAgICAgICAgICAgICAgICBjb25zdCBwaCA9IGhvc3QuY2hpbGRyZW4gJiYgaG9zdC5jaGlsZHJlbi5maW5kKChjOiBhbnkpID0+IGMgJiYgYy5uYW1lID09PSAnX01pc3NpbmdJbWcnKTtcbiAgICAgICAgICAgICAgICBpZiAocGgpIHBoLmRlc3Ryb3koKTtcblxuICAgICAgICAgICAgICAgIC8vIOWuv+S4u+S4iuWKoC/lj5YgU3ByaXRl77yI5Y2g5L2N5YiG5pSv5Y+qIGFkZENvbXBvbmVudCDkuoblk4HnuqIgR3JhcGhpY3Mg5a2Q6IqC54K577yM5a6/5Li76Ieq6Lqr5pegIFNwcml0Ze+8iVxuICAgICAgICAgICAgICAgIGNvbnN0IHNwcml0ZSA9IGhvc3QuZ2V0Q29tcG9uZW50KFNwcml0ZSkgfHwgaG9zdC5hZGRDb21wb25lbnQoU3ByaXRlKTtcbiAgICAgICAgICAgICAgICBzcHJpdGUuc2l6ZU1vZGUgPSBTcHJpdGUuU2l6ZU1vZGUuQ1VTVE9NO1xuICAgICAgICAgICAgICAgIHNwcml0ZS50cmltID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY29uZmlndXJlU3ByaXRlVHlwZShzcHJpdGUsIHsgaW1hZ2VGaWxsOiBpdC5pbWFnZUZpbGwgfSwgc2xpY2U5Qm9yZGVyLCBTcHJpdGUpO1xuICAgICAgICAgICAgICAgIGlmIChhcHBseUltYWdlQ29sb3Ioc3ByaXRlLCBpdC5pbWFnZUZpbGwsIGl0Lm92ZXJsYXlUaW50LCBDb2xvcikpIHsgLyogdGludCBhcHBsaWVkICovIH1cbiAgICAgICAgICAgICAgICBhcHBseVRpbGVTY2FsaW5nKHNwcml0ZSwgaXQuaW1hZ2VGaWxsKTtcblxuICAgICAgICAgICAgICAgIGlmIChzbGljZTlCb3JkZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgc3ByaXRlLnNwcml0ZUZyYW1lID0gYXBwbHlTbGljZTlCb3JkZXIoc3ByaXRlRnJhbWUsIHNsaWNlOUJvcmRlciwgUmVjdCwgU2l6ZSwgVmVjMik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYWRhcHRlZCA9IGFkYXB0SW1hZ2VGaWxsU3ByaXRlRnJhbWUoXG4gICAgICAgICAgICAgICAgICAgICAgICBzcHJpdGVGcmFtZSwgaXQuaW1hZ2VGaWxsLCBOdW1iZXIoaXQud2lkdGgpIHx8IDAsIE51bWJlcihpdC5oZWlnaHQpIHx8IDAsIFJlY3QsIFNpemUsIFZlYzIpO1xuICAgICAgICAgICAgICAgICAgICBzcHJpdGUuc3ByaXRlRnJhbWUgPSBhZGFwdGVkLmZyYW1lO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIHNwcml0ZS5tYXJrRm9yVXBkYXRlUmVuZGVyRGF0YSA9PT0gJ2Z1bmN0aW9uJykgc3ByaXRlLm1hcmtGb3JVcGRhdGVSZW5kZXJEYXRhKHRydWUpO1xuICAgICAgICAgICAgICAgIHJlcGxhY2VkKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIOWTgee6ouWNoOS9jeabv+aNou+8miR7cmVwbGFjZWR9IOaIkOWKn++8jCR7ZmFpbGVkfSDlpLHotKXvvIjkv53nlZnlk4HnuqLvvInjgIJgKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGRhdGE6IHsgcmVwbGFjZWQsIGZhaWxlZCB9IH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgc3RhY2s6IGVycm9yLnN0YWNrIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHpoIGJldGHvvJrmjZXojrfljZXkuKrmm7/mjaLnm67moIfnmoTlj6/ov5jljp/nirbmgIHjgILlr7npvZAgVW5pdHkgUmVzb3VyY2VSZXBsYWNlIOeahCByb3cuU25hcOOAglxuICAgICAqL1xuICAgIHNuYXBzaG90UmVwbGFjZVRhcmdldEJldGEob3B0aW9uczogYW55KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjYyA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSBjYztcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBTdHJpbmcob3B0aW9ucyAmJiBvcHRpb25zLnV1aWQgfHwgJycpO1xuICAgICAgICAgICAgaWYgKCF1dWlkKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdNaXNzaW5nIHV1aWQnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWQoc2NlbmUsIHV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLmdldENvbXBvbmVudCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSBub3QgZm91bmQ6ICR7dXVpZH1gIH07XG4gICAgICAgICAgICBjb25zdCBzbmFwc2hvdCA9IGNhcHR1cmVSZXBsYWNlU25hcHNob3Qobm9kZSwgY2MpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgc25hcHNob3QsXG4gICAgICAgICAgICAgICAgICAgIHN1bW1hcnk6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjZW5lUGF0aDogc25hcHNob3Quc2NlbmVQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFzU3ByaXRlOiAhIXNuYXBzaG90LnNwcml0ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhc0xhYmVsOiAhIXNuYXBzaG90LmxhYmVsLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFzUmljaFRleHQ6ICEhKHNuYXBzaG90LnJpY2hUZXh0IHx8IHNuYXBzaG90LnJpY2hUZXh0UmVuZGVyZXIpLFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UsIHN0YWNrOiBlcnJvci5zdGFjayB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEB6aCBiZXRh77ya5oqKIHNuYXBzaG90UmVwbGFjZVRhcmdldEJldGEg5o2V6I6355qE54q25oCB5YaZ5Zue55uu5qCH6IqC54K544CCXG4gICAgICovXG4gICAgYXN5bmMgcmVzdG9yZVJlcGxhY2VUYXJnZXRCZXRhKG9wdGlvbnM6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgY2MgPSByZXF1aXJlKCdjYycpO1xuICAgICAgICAgICAgY29uc3QgeyBkaXJlY3RvciB9ID0gY2M7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCBzbmFwc2hvdCA9IG9wdGlvbnMgJiYgKG9wdGlvbnMuc25hcHNob3QgfHwgb3B0aW9ucyk7XG4gICAgICAgICAgICBjb25zdCB1dWlkID0gU3RyaW5nKG9wdGlvbnMgJiYgb3B0aW9ucy51dWlkIHx8IHNuYXBzaG90ICYmIHNuYXBzaG90LnV1aWQgfHwgJycpO1xuICAgICAgICAgICAgaWYgKCF1dWlkKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdNaXNzaW5nIHNuYXBzaG90IHV1aWQnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWQoc2NlbmUsIHV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlIHx8ICFub2RlLmdldENvbXBvbmVudCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm9kZSBub3QgZm91bmQ6ICR7dXVpZH1gIH07XG4gICAgICAgICAgICBjb25zdCB3YXJuaW5ncyA9IGF3YWl0IHJlc3RvcmVSZXBsYWNlU25hcHNob3Qobm9kZSwgc25hcHNob3QsIGNjKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFV1aWQ6IG5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0TmFtZTogbm9kZS5uYW1lIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICBzY2VuZVBhdGg6IGJ1aWxkU2NlbmVOb2RlUGF0aChub2RlKSxcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZ3MsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgc3RhY2s6IGVycm9yLnN0YWNrIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHpoIGJldGHvvJrlnKjnvJbovpHlmaggSGllcmFyY2h5IOS4remAieS4reaMh+Wumuabv+aNouebruagh++8jOetieS7t+S6jiBVbml0eSBSZXNvdXJjZVJlcGxhY2Ug55qE4oCc5a6a5L2N4oCd44CCXG4gICAgICovXG4gICAgc2VsZWN0UmVwbGFjZVRhcmdldEJldGEob3B0aW9uczogYW55KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjYyA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSBjYztcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGNvbnN0IHV1aWQgPSBTdHJpbmcob3B0aW9ucyAmJiBvcHRpb25zLnV1aWQgfHwgJycpO1xuICAgICAgICAgICAgaWYgKCF1dWlkKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdNaXNzaW5nIHV1aWQnIH07XG4gICAgICAgICAgICBjb25zdCBub2RlID0gZmluZE5vZGVCeVV1aWQoc2NlbmUsIHV1aWQpO1xuICAgICAgICAgICAgaWYgKCFub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBOb2RlIG5vdCBmb3VuZDogJHt1dWlkfWAgfTtcbiAgICAgICAgICAgIHNlbGVjdEVkaXRvck5vZGUobm9kZSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IG5vZGUubmFtZSB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgc2NlbmVQYXRoOiBidWlsZFNjZW5lTm9kZVBhdGgobm9kZSksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgc3RhY2s6IGVycm9yLnN0YWNrIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHpoIGJldGHvvJror7vlj5bpgInkuK0v55uu5qCH6IqC54K555qE6Lev5b6E44CB5bC65a+45ZKM57uE5Lu257G75Z6L77yM5L6bIG1haW4g5L6n5Yy56YWNIEZpZ21hIEpTT04g6IqC54K544CCXG4gICAgICovXG4gICAgZGVzY3JpYmVOb2RlRm9yUmVwbGFjZUJldGEob3B0aW9uczogYW55KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjYyA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yLCBVSVRyYW5zZm9ybSwgTGFiZWwsIFJpY2hUZXh0LCBTcHJpdGUgfSA9IGNjO1xuICAgICAgICAgICAgY29uc3Qgc2NlbmUgPSBkaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgICAgICAgICAgaWYgKCFzY2VuZSkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gYWN0aXZlIHNjZW5lJyB9O1xuICAgICAgICAgICAgY29uc3QgdXVpZCA9IFN0cmluZyhvcHRpb25zICYmIG9wdGlvbnMudXVpZCB8fCAnJyk7XG4gICAgICAgICAgICBpZiAoIXV1aWQpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ01pc3NpbmcgdXVpZCcgfTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZUJ5VXVpZChzY2VuZSwgdXVpZCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vZGUgbm90IGZvdW5kOiAke3V1aWR9YCB9O1xuICAgICAgICAgICAgY29uc3QgdWkgPSBub2RlLmdldENvbXBvbmVudCAmJiBub2RlLmdldENvbXBvbmVudChVSVRyYW5zZm9ybSk7XG4gICAgICAgICAgICBjb25zdCBzaXplID0gcmVhZFVpU2l6ZSh1aSk7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnQgPSBub2RlLnBhcmVudCB8fCBudWxsO1xuICAgICAgICAgICAgY29uc3QgbG9naWNhbFRleHQgPSByZXNvbHZlTG9naWNhbFRleHRUYXJnZXQobm9kZSwgTGFiZWwsIFJpY2hUZXh0KTtcbiAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gbG9naWNhbFRleHQgJiYgbG9naWNhbFRleHQua2luZCA9PT0gJ2xhYmVsJyA/IGxvZ2ljYWxUZXh0LmNvbXBvbmVudCA6IG51bGw7XG4gICAgICAgICAgICBjb25zdCByaWNoVGV4dCA9IGxvZ2ljYWxUZXh0ICYmIGxvZ2ljYWxUZXh0LmtpbmQgPT09ICdyaWNoVGV4dCcgPyBsb2dpY2FsVGV4dC5jb21wb25lbnQgOiBudWxsO1xuICAgICAgICAgICAgY29uc3Qgc3ByaXRlID0gbm9kZS5nZXRDb21wb25lbnQgJiYgU3ByaXRlID8gbm9kZS5nZXRDb21wb25lbnQoU3ByaXRlKSA6IG51bGw7XG4gICAgICAgICAgICBjb25zdCBoYXNMYWJlbCA9ICEhKGxhYmVsIHx8IHJpY2hUZXh0KTtcbiAgICAgICAgICAgIGNvbnN0IGhhc1Nwcml0ZSA9ICEhc3ByaXRlO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgdXVpZDogbm9kZS51dWlkLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIHNjZW5lUGF0aDogYnVpbGRTY2VuZU5vZGVQYXRoKG5vZGUpLFxuICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZVBhdGg6IG5vZGUubmFtZSB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50TmFtZTogcGFyZW50ID8gcGFyZW50Lm5hbWUgfHwgJycgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50VXVpZDogcGFyZW50ID8gcGFyZW50LnV1aWQgfHwgJycgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgc2libGluZ0luZGV4OiB0eXBlb2Ygbm9kZS5nZXRTaWJsaW5nSW5kZXggPT09ICdmdW5jdGlvbidcbiAgICAgICAgICAgICAgICAgICAgICAgID8gbm9kZS5nZXRTaWJsaW5nSW5kZXgoKVxuICAgICAgICAgICAgICAgICAgICAgICAgOiBwYXJlbnQgJiYgcGFyZW50LmNoaWxkcmVuID8gcGFyZW50LmNoaWxkcmVuLmluZGV4T2Yobm9kZSkgOiAtMSxcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHNpemUud2lkdGgsXG4gICAgICAgICAgICAgICAgICAgIGhlaWdodDogc2l6ZS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgIGhhc0xhYmVsLFxuICAgICAgICAgICAgICAgICAgICBoYXNTcHJpdGUsXG4gICAgICAgICAgICAgICAgICAgIGhhc1JpY2hUZXh0OiAhIXJpY2hUZXh0LFxuICAgICAgICAgICAgICAgICAgICBsYWJlbFRleHQ6IGhhc0xhYmVsXG4gICAgICAgICAgICAgICAgICAgICAgICA/IChyaWNoVGV4dCA/IHJpY2hUZXh0VG9QbGFpbihTdHJpbmcocmljaFRleHQuc3RyaW5nIHx8ICcnKSkgOiBTdHJpbmcobGFiZWwuc3RyaW5nIHx8ICcnKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIDogJycsXG4gICAgICAgICAgICAgICAgICAgIHNwcml0ZUZyYW1lTmFtZTogc3ByaXRlICYmIHNwcml0ZS5zcHJpdGVGcmFtZSA/IFN0cmluZyhzcHJpdGUuc3ByaXRlRnJhbWUubmFtZSB8fCBzcHJpdGUuc3ByaXRlRnJhbWUuX25hbWUgfHwgJycpIDogJycsXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IHJlYWRDb21wb25lbnROYW1lKGxhYmVsIHx8IHJpY2hUZXh0IHx8IHNwcml0ZSksXG4gICAgICAgICAgICAgICAgICAgIHJlcGxhY2VLaW5kOiBoYXNMYWJlbCA/ICd0ZXh0JyA6IChoYXNTcHJpdGUgPyAnaW1hZ2UnIDogJ290aGVyJyksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgc3RhY2s6IGVycm9yLnN0YWNrIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHpoIGJldGHvvJrmiavmj4/pgInkuK0v5oyH5a6a5a6e5L6L5qCR6YeM55qE5Y+v5pu/5o2i55uu5qCH57uE5Lu244CCXG4gICAgICogICAgIOWvuem9kCBVbml0eSBSZXNvdXJjZVJlcGxhY2VXaW5kb3cg55qE5Y+z5L6n55uu5qCH5YiX6KGo77yaTGFiZWwvUmljaFRleHQg5L2c5Li65paH5a2X55uu5qCH77yMU3ByaXRlIOS9nOS4uuWbvueJh+ebruagh+OAglxuICAgICAqL1xuICAgIGxpc3RSZXBsYWNlVGFyZ2V0c0JldGEob3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGZpbmQsIFVJVHJhbnNmb3JtLCBMYWJlbCwgUmljaFRleHQsIFNwcml0ZSB9ID0gY2M7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHJvb3RVdWlkID0gU3RyaW5nKG9wdGlvbnMgJiYgb3B0aW9ucy5yb290VXVpZCB8fCAnJyk7XG4gICAgICAgICAgICBjb25zdCByb290TmFtZSA9IFN0cmluZyhvcHRpb25zICYmIG9wdGlvbnMucm9vdE5hbWUgfHwgJycpO1xuICAgICAgICAgICAgY29uc3Qga2luZCA9IFN0cmluZyhvcHRpb25zICYmIG9wdGlvbnMua2luZCB8fCAnYWxsJykudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIGxldCByb290ID0gcm9vdFV1aWQgPyBmaW5kTm9kZUJ5VXVpZChzY2VuZSwgcm9vdFV1aWQpIDogbnVsbDtcbiAgICAgICAgICAgIGlmICghcm9vdCAmJiByb290TmFtZSkgcm9vdCA9IGZpbmRGaXJzdE5vZGVCeU5hbWUoc2NlbmUsIHJvb3ROYW1lKTtcbiAgICAgICAgICAgIGlmICghcm9vdCkgcm9vdCA9IGZpbmREZWZhdWx0RXhwb3J0Um9vdChzY2VuZSwgZmluZCwgVUlUcmFuc2Zvcm0pO1xuICAgICAgICAgICAgaWYgKCFyb290KSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyB0YXJnZXQgcm9vdCBmb3VuZCcgfTtcblxuICAgICAgICAgICAgY29uc3QgaW5jbHVkZVRleHQgPSBraW5kID09PSAnYWxsJyB8fCBraW5kID09PSAndGV4dCcgfHwga2luZCA9PT0gJ21peGVkJztcbiAgICAgICAgICAgIGNvbnN0IGluY2x1ZGVJbWFnZSA9IGtpbmQgPT09ICdhbGwnIHx8IGtpbmQgPT09ICdpbWFnZScgfHwga2luZCA9PT0gJ21peGVkJztcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldHM6IGFueVtdID0gW107XG4gICAgICAgICAgICBjb25zdCB2aXNpdCA9IChub2RlOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIW5vZGUgfHwgIW5vZGUuZ2V0Q29tcG9uZW50KSByZXR1cm47XG4gICAgICAgICAgICAgICAgaWYgKGlzRnRvY1RleHRIZWxwZXJOb2RlKG5vZGUpIHx8IGlzQ3JlYXRvclJpY2hUZXh0UnVudGltZU5vZGUobm9kZSkpIHJldHVybjtcbiAgICAgICAgICAgICAgICBjb25zdCB1aSA9IFVJVHJhbnNmb3JtID8gbm9kZS5nZXRDb21wb25lbnQoVUlUcmFuc2Zvcm0pIDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBzaXplID0gcmVhZFVpU2l6ZSh1aSk7XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyZW50ID0gbm9kZS5wYXJlbnQgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBsb2dpY2FsVGV4dCA9IGluY2x1ZGVUZXh0ID8gcmVzb2x2ZUxvZ2ljYWxUZXh0VGFyZ2V0KG5vZGUsIExhYmVsLCBSaWNoVGV4dCkgOiBudWxsO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxhYmVsID0gbG9naWNhbFRleHQgJiYgbG9naWNhbFRleHQua2luZCA9PT0gJ2xhYmVsJyA/IGxvZ2ljYWxUZXh0LmNvbXBvbmVudCA6IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgcmljaFRleHQgPSBsb2dpY2FsVGV4dCAmJiBsb2dpY2FsVGV4dC5raW5kID09PSAncmljaFRleHQnID8gbG9naWNhbFRleHQuY29tcG9uZW50IDogbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBzcHJpdGUgPSBpbmNsdWRlSW1hZ2UgJiYgU3ByaXRlID8gbm9kZS5nZXRDb21wb25lbnQoU3ByaXRlKSA6IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgYWRkID0gKHJlcGxhY2VLaW5kOiBzdHJpbmcsIGNvbXBvbmVudDogYW55LCBleHRyYTogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB1dWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBub2RlLm5hbWUgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgICAgICBzY2VuZVBhdGg6IGJ1aWxkU2NlbmVOb2RlUGF0aChub2RlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlUGF0aDogYnVpbGRSZWxhdGl2ZU5vZGVQYXRoKG5vZGUsIHJvb3QpLFxuICAgICAgICAgICAgICAgICAgICAgICAgcGFyZW50TmFtZTogcGFyZW50ID8gcGFyZW50Lm5hbWUgfHwgJycgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IHBhcmVudCA/IHBhcmVudC51dWlkIHx8ICcnIDogJycsXG4gICAgICAgICAgICAgICAgICAgICAgICBzaWJsaW5nSW5kZXg6IHR5cGVvZiBub2RlLmdldFNpYmxpbmdJbmRleCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gbm9kZS5nZXRTaWJsaW5nSW5kZXgoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogcGFyZW50ICYmIHBhcmVudC5jaGlsZHJlbiA/IHBhcmVudC5jaGlsZHJlbi5pbmRleE9mKG5vZGUpIDogLTEsXG4gICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogc2l6ZS53aWR0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogc2l6ZS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgICAgICAgICBoYXNMYWJlbDogcmVwbGFjZUtpbmQgPT09ICd0ZXh0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhc1Nwcml0ZTogcmVwbGFjZUtpbmQgPT09ICdpbWFnZScsXG4gICAgICAgICAgICAgICAgICAgICAgICBoYXNSaWNoVGV4dDogISFyaWNoVGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudFR5cGU6IHJlYWRDb21wb25lbnROYW1lKGNvbXBvbmVudCksXG4gICAgICAgICAgICAgICAgICAgICAgICByZXBsYWNlS2luZCxcbiAgICAgICAgICAgICAgICAgICAgICAgIC4uLmV4dHJhLFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmIChsYWJlbCB8fCByaWNoVGV4dCkge1xuICAgICAgICAgICAgICAgICAgICBhZGQoJ3RleHQnLCBsYWJlbCB8fCByaWNoVGV4dCwge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGFiZWxUZXh0OiByaWNoVGV4dFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gcmljaFRleHRUb1BsYWluKFN0cmluZyhyaWNoVGV4dC5zdHJpbmcgfHwgJycpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogU3RyaW5nKGxhYmVsLnN0cmluZyB8fCAnJyksXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc3ByaXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZyYW1lID0gc3ByaXRlLnNwcml0ZUZyYW1lIHx8IHNwcml0ZS5fc3ByaXRlRnJhbWU7XG4gICAgICAgICAgICAgICAgICAgIGFkZCgnaW1hZ2UnLCBzcHJpdGUsIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNwcml0ZUZyYW1lTmFtZTogZnJhbWUgPyBTdHJpbmcoZnJhbWUubmFtZSB8fCBmcmFtZS5fbmFtZSB8fCAnJykgOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgKG5vZGUuY2hpbGRyZW4gfHwgW10pKSB2aXNpdChjaGlsZCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdmlzaXQocm9vdCk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiByb290LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHJvb3ROYW1lOiByb290Lm5hbWUgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIGtpbmQsXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMsXG4gICAgICAgICAgICAgICAgICAgIHN0YXRzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRzOiB0YXJnZXRzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRleHRzOiB0YXJnZXRzLmZpbHRlcigoaXRlbSkgPT4gaXRlbS5yZXBsYWNlS2luZCA9PT0gJ3RleHQnKS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbWFnZXM6IHRhcmdldHMuZmlsdGVyKChpdGVtKSA9PiBpdGVtLnJlcGxhY2VLaW5kID09PSAnaW1hZ2UnKS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgc3RhY2s6IGVycm9yLnN0YWNrIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHpoIGJldGHvvJrmiorkuIDpopflt7LotbDmraPlvI8gc2xpbS9hc3NldCBsYW5kaW5nIOeahCBGaWdtYSDoioLngrnvvIzlsYDpg6jlupTnlKjliLDnjrDmnIkgQ29jb3Mg6IqC54K544CCXG4gICAgICogICAgIOS4jemHjeWRveWQjeOAgeS4jeWinuWIoOWtkOiKgueCue+8m+aMiSBmbGFncyDliIblvIDopobnm5blm77niYfjgIHmloflrZfjgIHkvY3nva7jgIJcbiAgICAgKi9cbiAgICBhc3luYyBhcHBseU5vZGVQYXRjaEJldGEoZGF0YTogYW55KSB7XG4gICAgICAgIGxldCByb2xsYmFja1RhcmdldDogYW55ID0gbnVsbDtcbiAgICAgICAgbGV0IHJvbGxiYWNrU25hcHNob3Q6IGFueSA9IG51bGw7XG4gICAgICAgIGxldCByb2xsYmFja0NjOiBhbnkgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCVjW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSBhcHBseU5vZGVQYXRjaEJldGEg6L+Q6KGMIMK3IOaehOW7uueJiOacrCA9ICR7U0NFTkVfQlVJTERfVkVSU0lPTn1gLCAnY29sb3I6IzA4Yztmb250LXdlaWdodDpib2xkJyk7XG4gICAgICAgICAgICBjb25zdCBjYyA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICByb2xsYmFja0NjID0gY2M7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yLCBmaW5kLCBVSVRyYW5zZm9ybSwgTGFiZWwsIFJpY2hUZXh0LCBTcHJpdGUsIEZvbnQsIFZlYzMsIFZlYzIsIENvbG9yIH0gPSBjYztcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGlmICghZGF0YSB8fCAhZGF0YS5ub2RlKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdJbnZhbGlkIGRhdGE6IG1pc3Npbmcgbm9kZScgfTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFV1aWQgPSBTdHJpbmcoZGF0YS50YXJnZXRVdWlkIHx8ICcnKTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0VXVpZCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTWlzc2luZyB0YXJnZXRVdWlkJyB9O1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0ID0gZmluZE5vZGVCeVV1aWQoc2NlbmUsIHRhcmdldFV1aWQpO1xuICAgICAgICAgICAgaWYgKCF0YXJnZXQgfHwgIXRhcmdldC5nZXRDb21wb25lbnQpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYFRhcmdldCBub2RlIG5vdCBmb3VuZDogJHt0YXJnZXRVdWlkfWAgfTtcbiAgICAgICAgICAgIHJvbGxiYWNrVGFyZ2V0ID0gdGFyZ2V0O1xuICAgICAgICAgICAgcm9sbGJhY2tTbmFwc2hvdCA9IGNhcHR1cmVSZXBsYWNlU25hcHNob3QodGFyZ2V0LCBjYyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGZpZ21hTm9kZSA9IGRhdGEubm9kZTtcbiAgICAgICAgICAgIGNvbnN0IGZsYWdzID0gZGF0YS5mbGFncyB8fCB7fTtcbiAgICAgICAgICAgIGNvbnN0IGFwcGx5SW1hZ2UgPSBmbGFncy5pbWFnZSAhPT0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCBhcHBseVRleHQgPSBmbGFncy50ZXh0ICE9PSBmYWxzZTtcbiAgICAgICAgICAgIGNvbnN0IGFwcGx5UG9zaXRpb24gPSBmbGFncy5wb3NpdGlvbiAhPT0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCByZXNldEFuY2hvclBpdm90ID0gZmxhZ3MuYW5jaG9yUGl2b3QgIT09IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgcHJlc2VydmVBbHBoYSA9IGZsYWdzLnByZXNlcnZlQWxwaGEgIT09IGZhbHNlO1xuICAgICAgICAgICAgY29uc3QgdWkgPSB0YXJnZXQuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICAgICAgICAgIGNvbnN0IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAgICAgbGV0IGltYWdlQXBwbGllZCA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IHRleHRBcHBsaWVkID0gZmFsc2U7XG4gICAgICAgICAgICBsZXQgcG9zaXRpb25BcHBsaWVkID0gZmFsc2U7XG4gICAgICAgICAgICBsZXQgZm9udEFwcGxpZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCByaWNoVGV4dEFwcGxpZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCByaWNoVGV4dENvbnZlcnRlZCA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IHJpY2hUZXh0UmVuZGVyZXJVdWlkID0gJyc7XG4gICAgICAgICAgICBsZXQgcmljaFRleHRTaGFkb3dBcHBsaWVkID0gZmFsc2U7XG4gICAgICAgICAgICBsZXQgcmljaFRleHRTaGFkb3dCbHVyRmFsbGJhY2sgPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCByaWNoVGV4dFNoYWRvd1JlbmRlcmVyVXVpZCA9ICcnO1xuICAgICAgICAgICAgbGV0IHBhdGNoZWRUZXh0VGFyZ2V0OiBhbnkgPSBudWxsO1xuICAgICAgICAgICAgY29uc3QgbG9ja2VkU2l6ZSA9ICFhcHBseVBvc2l0aW9uICYmIHVpID8gcmVhZFVpU2l6ZSh1aSkgOiBudWxsO1xuXG4gICAgICAgICAgICBpZiAoYXBwbHlQb3NpdGlvbikge1xuICAgICAgICAgICAgICAgIGlmICh1aSkge1xuICAgICAgICAgICAgICAgICAgICBhcHBseVBhdGNoVHJhbnNmb3JtKHRhcmdldCwgdWksIGZpZ21hTm9kZSwgZGF0YS5jYW52YXMgfHwgZmlnbWFOb2RlLCBWZWMzLCByZXNldEFuY2hvclBpdm90LCBVSVRyYW5zZm9ybSwgZmluZCk7XG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uQXBwbGllZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZ3MucHVzaChg55uu5qCH6IqC54K544CMJHt0YXJnZXQubmFtZSB8fCB0YXJnZXRVdWlkfeOAjeayoeaciSBVSVRyYW5zZm9ybe+8jOi3s+i/h+S9jee9ri/lsLrlr7jjgIJgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhcHBseUltYWdlKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3ByaXRlID0gU3ByaXRlID8gdGFyZ2V0LmdldENvbXBvbmVudChTcHJpdGUpIDogbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAoIXNwcml0ZSkge1xuICAgICAgICAgICAgICAgICAgICB3YXJuaW5ncy5wdXNoKGDnm67moIfoioLngrnjgIwke3RhcmdldC5uYW1lIHx8IHRhcmdldFV1aWR944CN5rKh5pyJIFNwcml0ZSDnu4Tku7bvvIzot7Pov4flm77niYfjgIJgKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpbWFnZUFwcGxpZWQgPSBhd2FpdCBhcHBseVBhdGNoU3ByaXRlKHNwcml0ZSwgZmlnbWFOb2RlLCBkYXRhLCBjYywgcHJlc2VydmVBbHBoYSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghaW1hZ2VBcHBsaWVkKSB3YXJuaW5ncy5wdXNoKGDnm67moIfoioLngrnjgIwke3RhcmdldC5uYW1lIHx8IHRhcmdldFV1aWR944CN5Zu+54mH5bqU55So5aSx6LSl5oiWIEZpZ21hIOiKgueCueaXoOWbvueJh+OAgmApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFwcGx5VGV4dCAmJiBTdHJpbmcoZmlnbWFOb2RlLnR5cGUgfHwgJycpLnRvVXBwZXJDYXNlKCkgPT09ICdURVhUJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHByZXBhcmVkID0gcHJlcGFyZVRleHRQYXRjaFRhcmdldCh0YXJnZXQsIGZpZ21hTm9kZSwgY2MpO1xuICAgICAgICAgICAgICAgIGlmICghcHJlcGFyZWQuY29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzLnB1c2gocHJlcGFyZWQud2FybmluZyB8fCBg55uu5qCH6IqC54K544CMJHt0YXJnZXQubmFtZSB8fCB0YXJnZXRVdWlkfeOAjeayoeacieWPr+eUqOaWh+Wtl+e7hOS7tu+8jOi3s+i/h+aWh+Wtl+OAgmApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHBhdGNoZWRUZXh0VGFyZ2V0ID0gcHJlcGFyZWQuY29tcG9uZW50O1xuICAgICAgICAgICAgICAgICAgICB0ZXh0QXBwbGllZCA9IGFwcGx5UGF0Y2hUZXh0Q29tbW9uKFxuICAgICAgICAgICAgICAgICAgICAgICAgcHJlcGFyZWQuY29tcG9uZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgZmlnbWFOb2RlLFxuICAgICAgICAgICAgICAgICAgICAgICAgTGFiZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcmVwYXJlZC5pc1JpY2gsXG4gICAgICAgICAgICAgICAgICAgICAgICBDb2xvcixcbiAgICAgICAgICAgICAgICAgICAgICAgIFZlYzIsXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0ZXh0QXBwbGllZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXBhcmVkLnJlbmRlcmVyTm9kZSkgc3luY0Z0b2NSaWNoVGV4dFJlbmRlcmVyTGF5b3V0KHRhcmdldCwgZmlnbWFOb2RlLCBjYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb250QXBwbGllZCA9IHByZXBhcmVkLmlzUmljaFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gYXdhaXQgYXBwbHlQYXRjaFJpY2hUZXh0Rm9udChwcmVwYXJlZC5jb21wb25lbnQsIGZpZ21hTm9kZSwgY2MpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBhd2FpdCBhcHBseVBhdGNoRm9udChwcmVwYXJlZC5jb21wb25lbnQsIGZpZ21hTm9kZSwgY2MuYXNzZXRNYW5hZ2VyLCBGb250LCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJlcGFyZWQuY29udmVydGVkTGFiZWwgJiYgcHJlcGFyZWQubGFiZWwpIHByZXBhcmVkLmxhYmVsLmVuYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmVwYXJlZC5pc1JpY2gpIHByZXBhcmVkLmNvbXBvbmVudC5lbmFibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmVwYXJlZC5yZW5kZXJlck5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmVwYXJlZC5yZW5kZXJlck5vZGUuYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByaWNoVGV4dFJlbmRlcmVyVXVpZCA9IFN0cmluZyhwcmVwYXJlZC5yZW5kZXJlck5vZGUudXVpZCB8fCAnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJlcGFyZWQuaXNSaWNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2hhZG93UmVzdWx0ID0gbW91bnRGdG9jUmljaFRleHRTaGFkb3codGFyZ2V0LCBmaWdtYU5vZGUsIHByZXBhcmVkLmNvbXBvbmVudCwgY2MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJpY2hUZXh0U2hhZG93QXBwbGllZCA9IHNoYWRvd1Jlc3VsdC5hcHBsaWVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJpY2hUZXh0U2hhZG93Qmx1ckZhbGxiYWNrID0gc2hhZG93UmVzdWx0LmJsdXJGYWxsYmFjaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByaWNoVGV4dFNoYWRvd1JlbmRlcmVyVXVpZCA9IFN0cmluZyhzaGFkb3dSZXN1bHQubm9kZSAmJiBzaGFkb3dSZXN1bHQubm9kZS51dWlkIHx8ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2hhZG93UmVzdWx0Lndhcm5pbmcpIHdhcm5pbmdzLnB1c2goc2hhZG93UmVzdWx0Lndhcm5pbmcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmljaFRleHRBcHBsaWVkID0gcHJlcGFyZWQuaXNSaWNoO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmljaFRleHRDb252ZXJ0ZWQgPSBwcmVwYXJlZC5jb252ZXJ0ZWRMYWJlbDtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmVwYXJlZC5pc1JpY2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmVwYXJlZC5jcmVhdGVkUmVuZGVyZXIpIHJlbW92ZUZ0b2NSaWNoVGV4dFJlbmRlcmVyKHRhcmdldCwgUmljaFRleHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJlcGFyZWQuY29tcG9uZW50LmVuYWJsZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmVwYXJlZC5yZW5kZXJlck5vZGUpIHByZXBhcmVkLnJlbmRlcmVyTm9kZS5hY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyDkuI4gVW5pdHkg55qE4oCc5YaF5a65IC8g5L2N572u4oCd5aWR57qm5LiA6Ie077ya5pyq5bqU55So5L2N572u5pe277yM5paH5a2XIG92ZXJmbG93L2ZvbnQg5pu05paw5LiN6IO95pS555uu5qCH5qGG5bC65a+444CCXG4gICAgICAgICAgICBpZiAobG9ja2VkU2l6ZSAmJiB1aSAmJiB1aS5zZXRDb250ZW50U2l6ZSkge1xuICAgICAgICAgICAgICAgIGlmIChwYXRjaGVkVGV4dFRhcmdldCAmJiB0eXBlb2YgcGF0Y2hlZFRleHRUYXJnZXQudXBkYXRlUmVuZGVyRGF0YSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICB0cnkgeyBwYXRjaGVkVGV4dFRhcmdldC51cGRhdGVSZW5kZXJEYXRhKHRydWUpOyB9IGNhdGNoIHsgLyoga2VlcCB0aGUgYXV0aG9yZWQgdGFyZ2V0IHNpemUgYmVsb3cgKi8gfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB1aS5zZXRDb250ZW50U2l6ZShsb2NrZWRTaXplLndpZHRoLCBsb2NrZWRTaXplLmhlaWdodCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSBpbWFnZUFwcGxpZWQgfHwgdGV4dEFwcGxpZWQgfHwgcG9zaXRpb25BcHBsaWVkO1xuICAgICAgICAgICAgaWYgKCFzdWNjZXNzICYmIHdhcm5pbmdzLmxlbmd0aCA9PT0gMCkgd2FybmluZ3MucHVzaCgn5rKh5pyJ5Lu75L2V5a2X5q616KKr5bqU55So77yM6K+35qOA5p+lIGZsYWdzIOS4juiKgueCueexu+Wei+OAgicpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdWNjZXNzLFxuICAgICAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgICAgICAgcm9vdFV1aWQ6IHRhcmdldC51dWlkLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRVdWlkOiB0YXJnZXQudXVpZCxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0TmFtZTogdGFyZ2V0Lm5hbWUgfHwgJycsXG4gICAgICAgICAgICAgICAgICAgIGltYWdlQXBwbGllZCxcbiAgICAgICAgICAgICAgICAgICAgdGV4dEFwcGxpZWQsXG4gICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uQXBwbGllZCxcbiAgICAgICAgICAgICAgICAgICAgZm9udEFwcGxpZWQsXG4gICAgICAgICAgICAgICAgICAgIHJpY2hUZXh0QXBwbGllZCxcbiAgICAgICAgICAgICAgICAgICAgcmljaFRleHRDb252ZXJ0ZWQsXG4gICAgICAgICAgICAgICAgICAgIHJpY2hUZXh0UmVuZGVyZXJVdWlkLFxuICAgICAgICAgICAgICAgICAgICByaWNoVGV4dFNoYWRvd0FwcGxpZWQsXG4gICAgICAgICAgICAgICAgICAgIHJpY2hUZXh0U2hhZG93Qmx1ckZhbGxiYWNrLFxuICAgICAgICAgICAgICAgICAgICByaWNoVGV4dFNoYWRvd1JlbmRlcmVyVXVpZCxcbiAgICAgICAgICAgICAgICAgICAgd2FybmluZ3MsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIGxldCByb2xsYmFja0Vycm9yID0gJyc7XG4gICAgICAgICAgICBpZiAocm9sbGJhY2tUYXJnZXQgJiYgcm9sbGJhY2tTbmFwc2hvdCAmJiByb2xsYmFja0NjKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVzdG9yZVJlcGxhY2VTbmFwc2hvdChyb2xsYmFja1RhcmdldCwgcm9sbGJhY2tTbmFwc2hvdCwgcm9sbGJhY2tDYyk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAocmVzdG9yZUVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgICAgICAgICAgcm9sbGJhY2tFcnJvciA9IFN0cmluZyhyZXN0b3JlRXJyb3IgJiYgcmVzdG9yZUVycm9yLm1lc3NhZ2UgfHwgcmVzdG9yZUVycm9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIHN0YWNrOiBlcnJvci5zdGFjayxcbiAgICAgICAgICAgICAgICByb2xsYmFjazoge1xuICAgICAgICAgICAgICAgICAgICBhdHRlbXB0ZWQ6ICEhKHJvbGxiYWNrVGFyZ2V0ICYmIHJvbGxiYWNrU25hcHNob3QgJiYgcm9sbGJhY2tDYyksXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6ICFyb2xsYmFja0Vycm9yLFxuICAgICAgICAgICAgICAgICAgICBlcnJvcjogcm9sbGJhY2tFcnJvcixcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAemggYmV0Ye+8muWIoOmZpOmAieS4reebruagh+ague+8jOW5tuWcqOWOn+eItuiKgueCueOAgeWOnyBzaWJsaW5nIGluZGV4IOeUqOato+W8jyBidWlsZFRyZWUg6YeN5bu644CCXG4gICAgICovXG4gICAgYXN5bmMgcmVwbGFjZVRyZWVCZXRhKGRhdGE6IGFueSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCVjW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSByZXBsYWNlVHJlZUJldGEg6L+Q6KGMIMK3IOaehOW7uueJiOacrCA9ICR7U0NFTkVfQlVJTERfVkVSU0lPTn1gLCAnY29sb3I6IzA4Yztmb250LXdlaWdodDpib2xkJyk7XG4gICAgICAgICAgICBjb25zdCBjYyA9IHJlcXVpcmUoJ2NjJyk7XG4gICAgICAgICAgICBjb25zdCB7IGRpcmVjdG9yIH0gPSBjYztcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcbiAgICAgICAgICAgIGlmICghZGF0YSB8fCAhZGF0YS5yb290KSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdJbnZhbGlkIGRhdGE6IG1pc3Npbmcgcm9vdCcgfTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFV1aWQgPSBTdHJpbmcoZGF0YS50YXJnZXRVdWlkIHx8ICcnKTtcbiAgICAgICAgICAgIGlmICghdGFyZ2V0VXVpZCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTWlzc2luZyB0YXJnZXRVdWlkJyB9O1xuXG4gICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBmaW5kTm9kZUJ5VXVpZChzY2VuZSwgdGFyZ2V0VXVpZCk7XG4gICAgICAgICAgICBpZiAoIXRhcmdldCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgVGFyZ2V0IG5vZGUgbm90IGZvdW5kOiAke3RhcmdldFV1aWR9YCB9O1xuICAgICAgICAgICAgY29uc3QgcGFyZW50Tm9kZSA9IHRhcmdldC5wYXJlbnQ7XG4gICAgICAgICAgICBpZiAoIXBhcmVudE5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ1RhcmdldCBub2RlIGhhcyBubyBwYXJlbnQnIH07XG4gICAgICAgICAgICBjb25zdCBzaWJsaW5nSW5kZXggPSB0eXBlb2YgdGFyZ2V0LmdldFNpYmxpbmdJbmRleCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgID8gdGFyZ2V0LmdldFNpYmxpbmdJbmRleCgpXG4gICAgICAgICAgICAgICAgOiBNYXRoLm1heCgwLCAocGFyZW50Tm9kZS5jaGlsZHJlbiB8fCBbXSkuaW5kZXhPZih0YXJnZXQpKTtcbiAgICAgICAgICAgIGNvbnN0IG9sZE5hbWUgPSB0YXJnZXQubmFtZTtcblxuICAgICAgICAgICAgdGFyZ2V0LnJlbW92ZUZyb21QYXJlbnQoKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdGFyZ2V0LmRlc3Ryb3kgPT09ICdmdW5jdGlvbicpIHRhcmdldC5kZXN0cm95KCk7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1ldGhvZHMuYnVpbGRUcmVlKHtcbiAgICAgICAgICAgICAgICAuLi5kYXRhLFxuICAgICAgICAgICAgICAgIHBhcmVudFV1aWQ6IHBhcmVudE5vZGUudXVpZCxcbiAgICAgICAgICAgICAgICBzaWJsaW5nSW5kZXgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN1Y2Nlc3MgIT09IGZhbHNlICYmIHJlc3VsdC5kYXRhKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmRhdGEucmVwbGFjZWRSb290VXVpZCA9IHRhcmdldFV1aWQ7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmRhdGEucmVwbGFjZWRSb290TmFtZSA9IG9sZE5hbWU7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmRhdGEucGFyZW50ID0gcGFyZW50Tm9kZS5uYW1lO1xuICAgICAgICAgICAgICAgIHJlc3VsdC5kYXRhLnNpYmxpbmdJbmRleCA9IHNpYmxpbmdJbmRleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgc3RhY2s6IGVycm9yLnN0YWNrIH07XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIFNlcmlhbGl6ZSB0aGUgc2VsZWN0ZWQvaW1wb3J0ZWQgc2NlbmUgc3VidHJlZSBhcyBhIHJlYWwgQ29jb3MgUHJlZmFiIGFzc2V0IEpTT04uXG4gICAgICogQHpoIOWwhumAieS4rS/mnIDov5Hlr7zlhaXnmoTnnJ/lrp7lnLrmma/lrZDmoJHluo/liJfljJbkuLogQ29jb3MgUHJlZmFiIOi1hOa6kCBKU09O77yIYmV0Ye+8ieOAglxuICAgICAqL1xuICAgIGFzeW5jIHNlcmlhbGl6ZU5vZGVBc1ByZWZhYkJldGEob3B0aW9uczogYW55ID0ge30pIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAlY1tmaWdtYS1pbXBvcnRlcjpzY2VuZV0gc2VyaWFsaXplTm9kZUFzUHJlZmFiQmV0YSDov5DooYwgwrcg5p6E5bu654mI5pysID0gJHtTQ0VORV9CVUlMRF9WRVJTSU9OfWAsICdjb2xvcjojMDhjO2ZvbnQtd2VpZ2h0OmJvbGQnKTtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGZpbmQsIFVJVHJhbnNmb3JtIH0gPSBjYztcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ05vIGFjdGl2ZSBzY2VuZScgfTtcblxuICAgICAgICAgICAgY29uc3Qgcm9vdCA9IGZpbmRQcmVmYWJTb3VyY2VOb2RlKHNjZW5lLCBmaW5kLCBVSVRyYW5zZm9ybSwgb3B0aW9ucyB8fCB7fSk7XG4gICAgICAgICAgICBpZiAoIXJvb3QgfHwgIXJvb3QuZ2V0Q29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gcHJlZmFiIHNvdXJjZSBub2RlIGZvdW5kJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBwcmVmYWJOYW1lID0gU3RyaW5nKG9wdGlvbnMgJiYgb3B0aW9ucy5wcmVmYWJOYW1lIHx8IHJvb3QubmFtZSB8fCAnRmlnbWFQcmVmYWInKTtcbiAgICAgICAgICAgIGNvbnN0IHByZWZhYkFzc2V0ID0gY3JlYXRlUHJlZmFiQXNzZXRGcm9tTm9kZShjYywgcm9vdCwgcHJlZmFiTmFtZSk7XG4gICAgICAgICAgICBjb25zdCBzZXJpYWxpemVkID0gc2VyaWFsaXplRWRpdG9yT2JqZWN0KHByZWZhYkFzc2V0LCB7IHN0cmluZ2lmeTogZmFsc2UgfSk7XG4gICAgICAgICAgICBjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZCwgbnVsbCwgMik7XG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IGNvbGxlY3RTY2VuZU5vZGVTdGF0cyhyb290LCBjYyk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgICBgW2ZpZ21hLWltcG9ydGVyOnNjZW5lXSBzZXJpYWxpemVOb2RlQXNQcmVmYWJCZXRhIOWujOaIkO+8miR7cHJlZmFiTmFtZX0gYCArXG4gICAgICAgICAgICAgICAgYG5vZGVzPSR7c3RhdHMubm9kZXN9LCBzcHJpdGVzPSR7c3RhdHMuc3ByaXRlc30sIG51bGxTcHJpdGVGcmFtZXM9JHtzdGF0cy5udWxsU3ByaXRlRnJhbWVzfSwgbGFiZWxzPSR7c3RhdHMubGFiZWxzfWBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIGpzb24sXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6IHByZWZhYk5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiByb290LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHN0YXRzLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UsIHN0YWNrOiBlcnJvci5zdGFjayB9O1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBJbnN0YW50aWF0ZSBhIFByZWZhYiBhc3NldCBpbnRvIENhbnZhcywgbWF0Y2hpbmcgVW5pdHkncyBcImluc3RhbnRpYXRlIHByZWZhYiBmb3IgcmVwbGFjZVwiIGZpcnN0IHN0ZXAuXG4gICAgICogQHpoIOWwhiBQcmVmYWIg6LWE5rqQ5a6e5L6L5YyW5Yiw5b2T5YmNIENhbnZhcyDkuIvvvIhiZXRh77yM5a+56b2QIFVuaXR544CM5a6e5L6L5YyW5bm25pu/5o2i44CN55qE56ys5LiA5q2l77yJ44CCXG4gICAgICovXG4gICAgYXN5bmMgaW5zdGFudGlhdGVQcmVmYWJCZXRhKG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgJWNbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIGluc3RhbnRpYXRlUHJlZmFiQmV0YSDov5DooYwgwrcg5p6E5bu654mI5pysID0gJHtTQ0VORV9CVUlMRF9WRVJTSU9OfWAsICdjb2xvcjojMDhjO2ZvbnQtd2VpZ2h0OmJvbGQnKTtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGZpbmQsIGFzc2V0TWFuYWdlciwgaW5zdGFudGlhdGUsIFByZWZhYiB9ID0gY2M7XG4gICAgICAgICAgICBjb25zdCBzY2VuZSA9IGRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgICAgICBpZiAoIXNjZW5lKSByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICBjb25zdCB1dWlkID0gU3RyaW5nKG9wdGlvbnMgJiYgb3B0aW9ucy51dWlkIHx8ICcnKTtcbiAgICAgICAgICAgIGlmICghdXVpZCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTWlzc2luZyBwcmVmYWIgdXVpZCcgfTtcblxuICAgICAgICAgICAgY29uc3QgcHJlZmFiQXNzZXQgPSBhd2FpdCBsb2FkUHJlZmFiQXNzZXQoYXNzZXRNYW5hZ2VyLCB1dWlkKTtcbiAgICAgICAgICAgIGlmICghcHJlZmFiQXNzZXQgfHwgKFByZWZhYiAmJiAhKHByZWZhYkFzc2V0IGluc3RhbmNlb2YgUHJlZmFiKSAmJiAhcHJlZmFiQXNzZXQuZGF0YSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGBBc3NldCBpcyBub3QgYSBQcmVmYWI6ICR7dXVpZH1gLFxuICAgICAgICAgICAgICAgICAgICBkYXRhOiB7IGRiVXJsOiBvcHRpb25zICYmIG9wdGlvbnMuZGJVcmwsIGFzc2V0VHlwZTogcHJlZmFiQXNzZXQgJiYgcHJlZmFiQXNzZXQuY29uc3RydWN0b3IgJiYgcHJlZmFiQXNzZXQuY29uc3RydWN0b3IubmFtZSB9LFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBpbnN0YW50aWF0ZShwcmVmYWJBc3NldCk7XG4gICAgICAgICAgICBpZiAoIW5vZGUpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYEZhaWxlZCB0byBpbnN0YW50aWF0ZSBwcmVmYWI6ICR7dXVpZH1gIH07XG4gICAgICAgICAgICBjb25zdCBjYW52YXMgPSBmaW5kKCdDYW52YXMnKSB8fCBzY2VuZS5nZXRDaGlsZEJ5TmFtZSgnQ2FudmFzJyk7XG4gICAgICAgICAgICBjb25zdCBwYXJlbnROb2RlID0gY2FudmFzIHx8IHNjZW5lO1xuICAgICAgICAgICAgcGFyZW50Tm9kZS5hZGRDaGlsZChub2RlKTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcGFyZW50Tm9kZS5sYXllciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzZXRMYXllciA9IChuOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBuLmxheWVyID09PSAnbnVtYmVyJykgbi5sYXllciA9IHBhcmVudE5vZGUubGF5ZXI7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgKG4uY2hpbGRyZW4gfHwgW10pKSBzZXRMYXllcihjaGlsZCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBzZXRMYXllcihub2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGVjdEVkaXRvck5vZGUobm9kZSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHN0YXRzID0gY29sbGVjdFNjZW5lTm9kZVN0YXRzKG5vZGUsIGNjKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICAgIGBbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIGluc3RhbnRpYXRlUHJlZmFiQmV0YSDlrozmiJDvvJoke25vZGUubmFtZX0gYCArXG4gICAgICAgICAgICAgICAgYG5vZGVzPSR7c3RhdHMubm9kZXN9LCBzcHJpdGVzPSR7c3RhdHMuc3ByaXRlc30sIG51bGxTcHJpdGVGcmFtZXM9JHtzdGF0cy5udWxsU3ByaXRlRnJhbWVzfSwgbGFiZWxzPSR7c3RhdHMubGFiZWxzfWBcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiBub2RlLnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHJvb3ROYW1lOiBub2RlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudDogcGFyZW50Tm9kZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICBwcmVmYWJVdWlkOiB1dWlkLFxuICAgICAgICAgICAgICAgICAgICBkYlVybDogb3B0aW9ucyAmJiBvcHRpb25zLmRiVXJsIHx8ICcnLFxuICAgICAgICAgICAgICAgICAgICBjb3VudDogc3RhdHMubm9kZXMsXG4gICAgICAgICAgICAgICAgICAgIHNwcml0ZXM6IHN0YXRzLnNwcml0ZXMsXG4gICAgICAgICAgICAgICAgICAgIG51bGxTcHJpdGVGcmFtZXM6IHN0YXRzLm51bGxTcHJpdGVGcmFtZXMsXG4gICAgICAgICAgICAgICAgICAgIGxhYmVsczogc3RhdHMubGFiZWxzLFxuICAgICAgICAgICAgICAgICAgICByaWNoVGV4dHM6IHN0YXRzLnJpY2hUZXh0cyxcbiAgICAgICAgICAgICAgICAgICAgbWFza3M6IHN0YXRzLm1hc2tzLFxuICAgICAgICAgICAgICAgICAgICBidXR0b25zOiBzdGF0cy5idXR0b25zLFxuICAgICAgICAgICAgICAgICAgICBzdGF0cyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlLCBzdGFjazogZXJyb3Iuc3RhY2sgfTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBAZW4gRXhwb3J0IGEgcmVhbCBDb2NvcyBzY2VuZSBzdWJ0cmVlIGJhY2sgdG8gdGhlIEZpZ21hIEpTT04gY29udHJhY3QuXG4gICAgICogQHpoIOS7juecn+WuniBDb2NvcyDlnLrmma/lrZDmoJHlj43lr7zkuLogRmlnbWEgSlNPTiDlpZHnuqbvvIgvcHVsbCBiZXRh77yJ44CCXG4gICAgICovXG4gICAgYXN5bmMgZXhwb3J0VHJlZUZvckZpZ21hKG9wdGlvbnM6IGFueSA9IHt9KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgJWNbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIGV4cG9ydFRyZWVGb3JGaWdtYSDov5DooYwgwrcg5p6E5bu654mI5pysID0gJHtTQ0VORV9CVUlMRF9WRVJTSU9OfWAsICdjb2xvcjojMDhjO2ZvbnQtd2VpZ2h0OmJvbGQnKTtcbiAgICAgICAgICAgIGNvbnN0IGNjID0gcmVxdWlyZSgnY2MnKTtcbiAgICAgICAgICAgIGNvbnN0IHsgZGlyZWN0b3IsIGZpbmQsIFVJVHJhbnNmb3JtIH0gPSBjYztcbiAgICAgICAgICAgIGNvbnN0IHNjZW5lID0gZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICAgICAgICAgIGlmICghc2NlbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdObyBhY3RpdmUgc2NlbmUnIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGVkVXVpZHMgPSBBcnJheS5pc0FycmF5KG9wdGlvbnMgJiYgb3B0aW9ucy5yb290VXVpZHMpXG4gICAgICAgICAgICAgICAgPyBvcHRpb25zLnJvb3RVdWlkcy5tYXAoKHV1aWQ6IGFueSkgPT4gU3RyaW5nKHV1aWQgfHwgJycpKS5maWx0ZXIoQm9vbGVhbilcbiAgICAgICAgICAgICAgICA6IFtdO1xuICAgICAgICAgICAgY29uc3QgY2FudmFzID0gZmluZCgnQ2FudmFzJykgfHwgc2NlbmUuZ2V0Q2hpbGRCeU5hbWUoJ0NhbnZhcycpO1xuICAgICAgICAgICAgbGV0IHNlbGVjdGVkTm9kZXM6IGFueVtdID0gW107XG4gICAgICAgICAgICBsZXQgc2VsZWN0ZWRGaWx0ZXI6IFNldDxzdHJpbmc+IHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBsZXQgYW5jZXN0b3JGaWx0ZXI6IFNldDxzdHJpbmc+IHwgbnVsbCA9IG51bGw7XG4gICAgICAgICAgICBsZXQgZXhwb3J0TW9kZSA9ICdzdWJ0cmVlJztcbiAgICAgICAgICAgIGxldCByb290OiBhbnkgPSBudWxsO1xuXG4gICAgICAgICAgICBpZiAoc2VsZWN0ZWRVdWlkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0ZWROb2RlcyA9IHNlbGVjdGVkVXVpZHNcbiAgICAgICAgICAgICAgICAgICAgLm1hcCgodXVpZDogc3RyaW5nKSA9PiBmaW5kTm9kZUJ5VXVpZChzY2VuZSwgdXVpZCkpXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgICAgICAgICAgaWYgKHNlbGVjdGVkTm9kZXMubGVuZ3RoICE9PSBzZWxlY3RlZFV1aWRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogYFNvbWUgc2VsZWN0ZWQgbm9kZXMgd2VyZSBub3QgZm91bmQgKCR7c2VsZWN0ZWROb2Rlcy5sZW5ndGh9LyR7c2VsZWN0ZWRVdWlkcy5sZW5ndGh9KWAsXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZpcnN0SW50ZXJmYWNlUm9vdCA9IGZpbmRJbnRlcmZhY2VSb290KHNlbGVjdGVkTm9kZXNbMF0sIGNhbnZhcywgVUlUcmFuc2Zvcm0pO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgc2VsZWN0ZWROb2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvdGhlclJvb3QgPSBmaW5kSW50ZXJmYWNlUm9vdChzZWxlY3RlZE5vZGVzW2ldLCBjYW52YXMsIFVJVHJhbnNmb3JtKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG90aGVyUm9vdCAhPT0gZmlyc3RJbnRlcmZhY2VSb290KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBgU2VsZWN0ZWQgbm9kZXMgYmVsb25nIHRvIGRpZmZlcmVudCBVSSByb290czogJHtmaXJzdEludGVyZmFjZVJvb3QgPyBmaXJzdEludGVyZmFjZVJvb3QubmFtZSA6ICcobm9uZSknfSAvICR7b3RoZXJSb290ID8gb3RoZXJSb290Lm5hbWUgOiAnKG5vbmUpJ31gLFxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByb290ID0gc2VsZWN0ZWROb2Rlcy5sZW5ndGggPT09IDEgPyBzZWxlY3RlZE5vZGVzWzBdIDogZmluZENvbW1vblVpQW5jZXN0b3Ioc2VsZWN0ZWROb2RlcywgVUlUcmFuc2Zvcm0pO1xuICAgICAgICAgICAgICAgIGlmICghcm9vdCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnVW5hYmxlIHRvIGZpbmQgY29tbW9uIGFuY2VzdG9yIGZvciBzZWxlY3RlZCBub2RlcycgfTtcbiAgICAgICAgICAgICAgICBpZiAoc2VsZWN0ZWROb2Rlcy5sZW5ndGggPiAxICYmICFzZWxlY3RlZE5vZGVzLmluY2x1ZGVzKHJvb3QpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmlsdGVyID0gbmV3IFNldChzZWxlY3RlZE5vZGVzLm1hcCgobm9kZTogYW55KSA9PiBub2RlLnV1aWQpKTtcbiAgICAgICAgICAgICAgICAgICAgYW5jZXN0b3JGaWx0ZXIgPSBjb2xsZWN0QW5jZXN0b3JVdWlkU2V0KHNlbGVjdGVkTm9kZXMsIHJvb3QpO1xuICAgICAgICAgICAgICAgICAgICBleHBvcnRNb2RlID0gJ3NlbGVjdGl2ZSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXJvb3QpIHJvb3QgPSBvcHRpb25zICYmIG9wdGlvbnMucm9vdFV1aWQgPyBmaW5kTm9kZUJ5VXVpZChzY2VuZSwgU3RyaW5nKG9wdGlvbnMucm9vdFV1aWQpKSA6IG51bGw7XG4gICAgICAgICAgICBpZiAoIXJvb3QgJiYgb3B0aW9ucyAmJiBvcHRpb25zLnJvb3ROYW1lKSB7XG4gICAgICAgICAgICAgICAgcm9vdCA9IGZpbmRGaXJzdE5vZGVCeU5hbWUoc2NlbmUsIFN0cmluZyhvcHRpb25zLnJvb3ROYW1lKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJvb3QpIHtcbiAgICAgICAgICAgICAgICByb290ID0gZmluZERlZmF1bHRFeHBvcnRSb290KHNjZW5lLCBmaW5kLCBVSVRyYW5zZm9ybSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJvb3QgfHwgIXJvb3QuZ2V0Q29tcG9uZW50KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gZXhwb3J0YWJsZSBVSSByb290IGZvdW5kJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCB1aSA9IHJvb3QuZ2V0Q29tcG9uZW50KFVJVHJhbnNmb3JtKTtcbiAgICAgICAgICAgIGlmICghdWkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBFeHBvcnQgcm9vdCBcIiR7cm9vdC5uYW1lfVwiIGhhcyBubyBVSVRyYW5zZm9ybWAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHJvb3RTaXplID0gcmVhZFVpU2l6ZSh1aSk7XG4gICAgICAgICAgICBjb25zdCBpbnRlcmZhY2VSb290ID0gZmluZEludGVyZmFjZVJvb3Qocm9vdCwgY2FudmFzLCBVSVRyYW5zZm9ybSk7XG4gICAgICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IChFZGl0b3IgYXMgYW55KS5Qcm9qZWN0LnBhdGg7XG4gICAgICAgICAgICBjb25zdCBjdHg6IEV4cG9ydENvbnRleHQgPSB7XG4gICAgICAgICAgICAgICAgY2MsXG4gICAgICAgICAgICAgICAgaW1hZ2VTZWFyY2hEaXJzOiBidWlsZEV4cG9ydEltYWdlU2VhcmNoRGlycyhcbiAgICAgICAgICAgICAgICAgICAgcHJvamVjdFBhdGgsXG4gICAgICAgICAgICAgICAgICAgIHJvb3QubmFtZSB8fCAnJyxcbiAgICAgICAgICAgICAgICAgICAgaW50ZXJmYWNlUm9vdCAmJiBpbnRlcmZhY2VSb290Lm5hbWUgfHwgJydcbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIGltYWdlczoge30sXG4gICAgICAgICAgICAgICAgaW1hZ2VJZEJ5Q29udGVudDoge30sXG4gICAgICAgICAgICAgICAgaW1hZ2VDb3VudGVyOiAwLFxuICAgICAgICAgICAgICAgIHdhcm5pbmdzOiBbXSxcbiAgICAgICAgICAgICAgICBzdGF0czoge1xuICAgICAgICAgICAgICAgICAgICBub2RlczogMCxcbiAgICAgICAgICAgICAgICAgICAgdGV4dHM6IDAsXG4gICAgICAgICAgICAgICAgICAgIHNwcml0ZXM6IDAsXG4gICAgICAgICAgICAgICAgICAgIGltYWdlczogMCxcbiAgICAgICAgICAgICAgICAgICAgbWlzc2luZ0ltYWdlczogMCxcbiAgICAgICAgICAgICAgICAgICAgc29saWRGaWxsczogMCxcbiAgICAgICAgICAgICAgICAgICAgbWFza3M6IDAsXG4gICAgICAgICAgICAgICAgICAgIGJ1dHRvbnM6IDAsXG4gICAgICAgICAgICAgICAgICAgIHNsaWNlZFNwcml0ZXM6IDAsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGNvbnN0IHJvb3REYXRhID0gYXdhaXQgZXhwb3J0Tm9kZVRvRmlnbWEoXG4gICAgICAgICAgICAgICAgcm9vdCxcbiAgICAgICAgICAgICAgICByb290U2l6ZS53aWR0aCxcbiAgICAgICAgICAgICAgICByb290U2l6ZS5oZWlnaHQsXG4gICAgICAgICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICAgICAgICBjdHgsXG4gICAgICAgICAgICAgICAgc2VsZWN0ZWRGaWx0ZXIsXG4gICAgICAgICAgICAgICAgYW5jZXN0b3JGaWx0ZXJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByb290RGF0YS54ID0gMDtcbiAgICAgICAgICAgIHJvb3REYXRhLnkgPSAwO1xuICAgICAgICAgICAgcm9vdERhdGEud2lkdGggPSByb3VuZEV4cG9ydE51bWJlcihyb290U2l6ZS53aWR0aCk7XG4gICAgICAgICAgICByb290RGF0YS5oZWlnaHQgPSByb3VuZEV4cG9ydE51bWJlcihyb290U2l6ZS5oZWlnaHQpO1xuXG4gICAgICAgICAgICBjb25zdCBleHBvcnREYXRhOiBhbnkgPSB7XG4gICAgICAgICAgICAgICAgdmVyc2lvbjogJzEuMC44JyxcbiAgICAgICAgICAgICAgICBuYW1lOiByb290Lm5hbWUgfHwgJ0NvY29zRXhwb3J0JyxcbiAgICAgICAgICAgICAgICBjYW52YXM6IHtcbiAgICAgICAgICAgICAgICAgICAgd2lkdGg6IHJvdW5kRXhwb3J0TnVtYmVyKHJvb3RTaXplLndpZHRoKSxcbiAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiByb3VuZEV4cG9ydE51bWJlcihyb290U2l6ZS5oZWlnaHQpLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgcm9vdDogcm9vdERhdGEsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKE9iamVjdC5rZXlzKGN0eC5pbWFnZXMpLmxlbmd0aCA+IDApIGV4cG9ydERhdGEuaW1hZ2VzID0gY3R4LmltYWdlcztcblxuICAgICAgICAgICAgY29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KGV4cG9ydERhdGEsIG51bGwsIDQpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgICAgYFtmaWdtYS1pbXBvcnRlcjpzY2VuZV0gZXhwb3J0VHJlZUZvckZpZ21hIOWujOaIkO+8miR7cm9vdC5uYW1lfSBgICtcbiAgICAgICAgICAgICAgICBgbm9kZXM9JHtjdHguc3RhdHMubm9kZXN9LCB0ZXh0cz0ke2N0eC5zdGF0cy50ZXh0c30sIHNwcml0ZXM9JHtjdHguc3RhdHMuc3ByaXRlc30sIGltYWdlcz0ke2N0eC5zdGF0cy5pbWFnZXN9LCBgICtcbiAgICAgICAgICAgICAgICBgbWlzc2luZ0ltYWdlcz0ke2N0eC5zdGF0cy5taXNzaW5nSW1hZ2VzfWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHdhcm5pbmcgb2YgY3R4Lndhcm5pbmdzLnNsaWNlKDAsIDIwKSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBbZmlnbWEtaW1wb3J0ZXI6c2NlbmVdIGV4cG9ydCB3YXJuaW5nOiAke3dhcm5pbmd9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY3R4Lndhcm5pbmdzLmxlbmd0aCA+IDIwKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFtmaWdtYS1pbXBvcnRlcjpzY2VuZV0gZXhwb3J0IHdhcm5pbmc6IOWPpuaciSAke2N0eC53YXJuaW5ncy5sZW5ndGggLSAyMH0g5p2h5Zu+54mHL+e7hOS7tuWRiuitpuacquWxleW8gOOAgmApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgICBqc29uLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBleHBvcnREYXRhLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIGNhbnZhczogZXhwb3J0RGF0YS5jYW52YXMsXG4gICAgICAgICAgICAgICAgICAgIHJvb3RVdWlkOiByb290LnV1aWQsXG4gICAgICAgICAgICAgICAgICAgIHN0YXRzOiBjdHguc3RhdHMsXG4gICAgICAgICAgICAgICAgICAgIHdhcm5pbmdzOiBjdHgud2FybmluZ3MsXG4gICAgICAgICAgICAgICAgICAgIGV4cG9ydE1vZGUsXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGVkVXVpZHM6IHNlbGVjdGVkTm9kZXMubWFwKChub2RlOiBhbnkpID0+IG5vZGUudXVpZCksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSwgc3RhY2s6IGVycm9yLnN0YWNrIH07XG4gICAgICAgIH1cbiAgICB9LFxufTtcbiJdfQ==