/**
 * @en figma-importer scene script — the ONLY place cc.* engine APIs run.
 * @zh figma-importer 场景脚本 —— 唯一能跑 cc.* 引擎 API 的地方。
 *
 * main.ts 通过 execute-scene-script 调进这里的 methods.*。
 * 注意：引擎类必须用 require('cc') 运行时取，不能顶部 import。
 */
import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { BUILD_VERSION, FigmaInputSpec } from './types';
import {
    ComponentMappingEntry,
    buildComponentStateData,
    componentIdentityFromState,
    resolveComponentMapping,
} from './component-mapping';
import { MappedComponentStateRequest } from './mapped-component-state';
import { inferNativeGridLayout, inferWrapGridLayout } from './layout-plan';
import { clampSlice9Border } from './slice9';
// 让运行时能找到编辑器内置的 cc 模块
module.paths.push(join(Editor.App.path, 'node_modules'));

const SCENE_BUILD_VERSION = BUILD_VERSION;
const FIGMA_COMPONENT_STATE_CLASS = 'FigmaComponentState';

/** Keep Figma labels readable while removing separators that Cocos rejects in Node.name. */
export function sanitizeCocosNodeName(value: unknown, fallback = 'Node'): string {
    const clean = String(value ?? '').replace(/[\\/]/g, '_').trim();
    if (clean) return clean;
    return String(fallback || 'Node').replace(/[\\/]/g, '_').trim() || 'Node';
}

/**
 * Legacy in-memory helper retained for old callers/tests. Import paths must
 * use buildComponentStateRequest + the editor facade queue below; adding a
 * component here is not a persistence path for Prefab instances.
 */
export function attachFigmaComponentState(node: any, figmaNode: any, cc: any): 'attached' | 'unavailable' {
    const stateData = buildComponentStateData(
        figmaNode && figmaNode.componentKey,
        figmaNode && figmaNode.name,
        figmaNode && figmaNode.componentProperties
    );
    if (!stateData.componentKey) return 'unavailable';
    const stateClass = cc && cc.js && typeof cc.js.getClassByName === 'function'
        ? cc.js.getClassByName(FIGMA_COMPONENT_STATE_CLASS)
        : null;
    if (!stateClass || !node || !node.getComponent || !node.addComponent) return 'unavailable';

    try {
        const state = node.getComponent(stateClass) || node.addComponent(stateClass);
        state.componentKey = stateData.componentKey;
        state.componentName = stateData.componentName;
        state.variantFilter = stateData.variantFilter;
        state.propertyKeys = stateData.propertyKeys.slice();
        state.propertyValues = stateData.propertyValues.slice();
        return 'attached';
    } catch {
        return 'unavailable';
    }
}

export function buildComponentStateRequest(
    node: any,
    figmaNode: any,
    requiresPrefabOverride = false,
): MappedComponentStateRequest | null {
    if (!node || !node.uuid) return null;
    const stateData = buildComponentStateData(
        figmaNode && figmaNode.componentKey,
        figmaNode && figmaNode.name,
        figmaNode && figmaNode.componentProperties,
    );
    if (!stateData.componentKey) return null;
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
export function buildMappedComponentStateRequest(
    node: any,
    figmaNode: any,
): MappedComponentStateRequest | null {
    return buildComponentStateRequest(node, figmaNode, true);
}

export interface FigmaComponentSelectionDescription {
    status: 'selected' | 'not-component';
    reason: string;
    nodeUuid: string;
    nodeName: string;
    scenePath: string;
    componentKey?: string;
    componentName?: string;
    variantFilter?: string;
    componentProperties?: { [key: string]: string };
}

/** Read mapping identity only from the selected node's persisted FigmaComponentState. */
export function describeFigmaComponentSelection(node: any, cc: any): FigmaComponentSelectionDescription {
    const base = {
        nodeUuid: String(node && node.uuid || ''),
        nodeName: String(node && node.name || ''),
        scenePath: node ? buildSceneNodePath(node) : '',
    };
    if (!node) return { status: 'not-component', reason: 'node-missing', ...base };
    const stateClass = cc && cc.js && typeof cc.js.getClassByName === 'function'
        ? cc.js.getClassByName(FIGMA_COMPONENT_STATE_CLASS)
        : null;
    if (!stateClass) return { status: 'not-component', reason: 'runtime-unavailable', ...base };
    const state = node.getComponent && node.getComponent(stateClass);
    if (!state) return { status: 'not-component', reason: 'component-state-missing', ...base };
    const identity = componentIdentityFromState(state);
    if (!identity) return { status: 'not-component', reason: 'component-key-missing', ...base };
    return {
        status: 'selected',
        reason: 'figma-component-state',
        ...base,
        ...identity,
    };
}

export function isMountedPrefabComponent(node: any, component: any): boolean {
    const prefabInfo = node && node._prefab;
    const instance = prefabInfo && prefabInfo.instance;
    const fileId = String(prefabInfo && prefabInfo.fileId || '');
    if (!instance || !fileId || !Array.isArray(instance.mountedComponents)) return false;
    return instance.mountedComponents.some((info: any) => {
        const localID = info && info.targetInfo && info.targetInfo.localID;
        return Array.isArray(localID)
            && localID.length === 1
            && String(localID[0]) === fileId
            && Array.isArray(info.components)
            && info.components.includes(component);
    });
}

export function applyComponentState(
    node: any,
    request: MappedComponentStateRequest,
    cc: any,
): 'attached' | 'unavailable' | 'override-missing' {
    try {
        const stateClass = cc && cc.js && typeof cc.js.getClassByName === 'function'
            ? cc.js.getClassByName(FIGMA_COMPONENT_STATE_CLASS)
            : null;
        const state = stateClass && node && node.getComponent ? node.getComponent(stateClass) : null;
        if (!state) return 'unavailable';
        state.componentKey = request.componentKey;
        state.componentName = request.componentName;
        state.variantFilter = request.variantFilter;
        state.propertyKeys = request.propertyKeys.slice();
        state.propertyValues = request.propertyValues.slice();
        return request.requiresPrefabOverride
            ? (isMountedPrefabComponent(node, state) ? 'attached' : 'override-missing')
            : 'attached';
    } catch {
        return 'unavailable';
    } finally {
        if (node) node.active = request.active !== false;
    }
}

/** @deprecated Compatibility alias for the original mapped-Prefab-only method. */
export function applyMappedComponentState(
    node: any,
    request: MappedComponentStateRequest,
    cc: any,
): 'attached' | 'unavailable' | 'override-missing' {
    return applyComponentState(node, request, cc);
}

/** Remove an incomplete mapped instance before expanding the Figma fallback tree. */
export function discardFailedMappedNode(node: any): void {
    if (!node) return;
    try {
        if (typeof node.removeFromParent === 'function') node.removeFromParent();
    } catch {
        // Continue to destroy even if the parent was already detached.
    }
    try {
        if (typeof node.destroy === 'function') node.destroy();
    } catch {
        // The fallback tree can still be built when best-effort disposal fails.
    }
}

/** @zh Figma 水平对齐 → Cocos Label.HorizontalAlign */
function mapHAlign(Label: any, align: string): number {
    switch (String(align || '').trim().toUpperCase()) {
        case 'CENTER': return Label.HorizontalAlign.CENTER;
        case 'RIGHT': return Label.HorizontalAlign.RIGHT;
        case 'LEFT':
        default: return Label.HorizontalAlign.LEFT;
    }
}

/** @zh Figma 文字排版方向对应的 Cocos UITransform 横向锚点。 */
export function textAnchorXForAlign(align: unknown): number {
    switch (String(align || '').trim().toUpperCase()) {
        case 'CENTER': return 0.5;
        case 'RIGHT': return 1;
        case 'LEFT':
        default: return 0;
    }
}

export const FTOC_RICH_TEXT_RENDERER_NAME = '__FTOC_TEXT_RENDERER__';
export const FTOC_RICH_TEXT_SHADOW_NAME = '__FTOC_TEXT_SHADOW__';
export const FTOC_INPUT_TEXT_LABEL_NAME = 'TEXT_LABEL';
export const FTOC_INPUT_PLACEHOLDER_LABEL_NAME = 'PLACEHOLDER_LABEL';
export const FTOC_INPUT_EDITBOX_HOST_NAME = '__FTOC_INPUT_EDITBOX__';
const LEGACY_FTOC_INPUT_TEXT_LABEL_NAME = '__FTOC_INPUT_TEXT__';
const LEGACY_FTOC_INPUT_PLACEHOLDER_LABEL_NAME = '__FTOC_INPUT_PLACEHOLDER__';

export interface RichTextRendererLayoutPlan {
    anchorX: number;
    anchorY: number;
    localX: number;
    localY: number;
    maxWidth: number;
}

function textAnchorYForAlign(align: unknown): number {
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
export function planRichTextRendererLayout(
    figmaNode: any,
    authoredWidth: number,
    authoredHeight: number,
    parentAnchorX?: number,
    parentAnchorY = 0.5,
): RichTextRendererLayoutPlan {
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

function isFtocRichTextRendererNode(node: any): boolean {
    return !!node && node.name === FTOC_RICH_TEXT_RENDERER_NAME;
}

function isFtocRichTextShadowNode(node: any): boolean {
    return !!node && node.name === FTOC_RICH_TEXT_SHADOW_NAME;
}

function isFtocTextHelperNode(node: any): boolean {
    if (isFtocRichTextRendererNode(node) || isFtocRichTextShadowNode(node)) return true;
    if (!node) return false;
    if (node.name === FTOC_INPUT_EDITBOX_HOST_NAME) return true;
    if (!node.parent || node.parent.name !== FTOC_INPUT_EDITBOX_HOST_NAME) return false;
    return node.name === FTOC_INPUT_TEXT_LABEL_NAME ||
        node.name === FTOC_INPUT_PLACEHOLDER_LABEL_NAME ||
        node.name === LEGACY_FTOC_INPUT_TEXT_LABEL_NAME ||
        node.name === LEGACY_FTOC_INPUT_PLACEHOLDER_LABEL_NAME;
}

function isCreatorRichTextRuntimeNode(node: any): boolean {
    const name = String(node && node.name || '');
    return name === 'RICHTEXT_CHILD' || name === 'RICHTEXT_Image_CHILD';
}

function findFtocRichTextRendererNode(node: any, RichText: any): any {
    if (!node || !RichText) return null;
    for (const child of (node.children || [])) {
        if (isFtocRichTextRendererNode(child) && child.getComponent && child.getComponent(RichText)) {
            return child;
        }
    }
    return null;
}

function findFtocRichTextShadowNode(node: any, RichText: any): any {
    if (!node || !RichText) return null;
    for (const child of (node.children || [])) {
        if (isFtocRichTextShadowNode(child) && child.getComponent && child.getComponent(RichText)) {
            return child;
        }
    }
    return null;
}

export interface LogicalTextTarget {
    kind: 'label' | 'richText';
    component: any;
    authoredNode: any;
    rendererNode: any | null;
}

/**
 * @zh 解析一个 authored 文本节点的逻辑组件。
 *     普通 Label 优先；当 Label 被 FtoC 受控转换为 disabled 且有 renderer 子节点时，
 *     renderer RichText 才是可替换/反导的唯一逻辑目标。
 */
export function resolveLogicalTextTarget(node: any, Label: any, RichText: any): LogicalTextTarget | null {
    if (!node || !node.getComponent) return null;
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
    if (label) return { kind: 'label', component: label, authoredNode: node, rendererNode: null };
    if (rendererRichText) return { kind: 'richText', component: rendererRichText, authoredNode: node, rendererNode };
    if (directRichText) return { kind: 'richText', component: directRichText, authoredNode: node, rendererNode: null };
    return null;
}

function getLogicalRichText(node: any, RichText: any): any {
    const logical = resolveLogicalTextTarget(node, null, RichText);
    return logical && logical.kind === 'richText' ? logical.component : null;
}

export function mountFtocRichTextRenderer(
    parent: any,
    figmaNode: any,
    authoredWidth: number,
    authoredHeight: number,
    cc: any,
): { node: any; ui: any; richText: any; plan: RichTextRendererLayoutPlan; created: boolean } {
    const { Node, UITransform, RichText, Vec3 } = cc;
    const parentUi = parent && parent.getComponent ? parent.getComponent(UITransform) : null;
    const parentAnchor = readUiAnchor(parentUi);
    const plan = planRichTextRendererLayout(
        figmaNode,
        authoredWidth,
        authoredHeight,
        parentAnchor.x,
        parentAnchor.y,
    );
    let renderer = findFtocRichTextRendererNode(parent, RichText);
    const created = !renderer;
    if (!renderer) {
        renderer = new Node(FTOC_RICH_TEXT_RENDERER_NAME);
        renderer.active = false;
        parent.addChild(renderer);
    }
    if (typeof parent.layer === 'number') renderer.layer = parent.layer;
    // A prior build may have left the reusable renderer inactive while its
    // authored parent was being patched. Restore visibility on reuse; newly
    // created nodes stay inactive until the caller has finished configuring text.
    if (!created) renderer.active = true;
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
export function syncFtocRichTextRendererLayout(
    parent: any,
    figmaNode: any,
    cc: any,
): RichTextRendererLayoutPlan | null {
    const { UITransform, RichText, Vec3 } = cc;
    const renderer = findFtocRichTextRendererNode(parent, RichText);
    if (!renderer) return null;
    const parentUi = parent && parent.getComponent ? parent.getComponent(UITransform) : null;
    const rendererUi = renderer.getComponent ? renderer.getComponent(UITransform) : null;
    const richText = renderer.getComponent ? renderer.getComponent(RichText) : null;
    if (!parentUi || !rendererUi || !richText) return null;
    const size = readUiSize(parentUi);
    const anchor = readUiAnchor(parentUi);
    const plan = planRichTextRendererLayout(figmaNode, size.width, size.height, anchor.x, anchor.y);
    rendererUi.setAnchorPoint(plan.anchorX, plan.anchorY);
    renderer.setPosition(new Vec3(plan.localX, plan.localY, 0));
    richText.maxWidth = plan.maxWidth;
    return plan;
}

export interface RichTextShadowMountResult {
    applied: boolean;
    blurFallback: boolean;
    node: any | null;
    richText: any | null;
    warning: string;
}

function removeFtocRichTextShadow(node: any, RichText: any): void {
    const shadow = findFtocRichTextShadowNode(node, RichText);
    if (!shadow) return;
    shadow.active = false;
    if (typeof shadow.removeFromParent === 'function') shadow.removeFromParent();
    if (typeof shadow.destroy === 'function') shadow.destroy();
}

/**
 * @zh RichText 没有可序列化的阴影属性；引擎内部 RICHTEXT_CHILD 又被标记为 DontSave。
 *     因此用一个受控、可保存的 RichText sibling 承载硬阴影，并始终排在主 renderer 后面。
 *     当前业务样本 blur/radius 均为 0；非零 blur 明确记为 fallback，不冒充精确还原。
 */
export function mountFtocRichTextShadow(
    authoredNode: any,
    figmaNode: any,
    mainRichText: any,
    cc: any,
): RichTextShadowMountResult {
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
        shadowNode = new Node(FTOC_RICH_TEXT_SHADOW_NAME);
        shadowNode.active = false;
        authoredNode.addChild(shadowNode);
    } else {
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
    shadowNode.setPosition(new Vec3(
        mainPosition.x + (Number(shadow.offsetX) || 0),
        mainPosition.y - (Number(shadow.offsetY) || 0),
        0,
    ));
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
    if (mainRichText.fontFamily) shadowRichText.fontFamily = mainRichText.fontFamily;
    if (typeof mainRichText.cacheMode !== 'undefined') shadowRichText.cacheMode = mainRichText.cacheMode;
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
export function positionForAnchor(
    x: number,
    y: number,
    width: number,
    height: number,
    parentWidth: number,
    parentHeight: number,
    anchorX = 0.5,
    anchorY = 0.5,
): { x: number; y: number } {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    const px = Number.isFinite(anchorX) ? Math.max(0, Math.min(1, anchorX)) : 0.5;
    const py = Number.isFinite(anchorY) ? Math.max(0, Math.min(1, anchorY)) : 0.5;
    return {
        x: (Number(x) || 0) + px * w - (Number(parentWidth) || 0) / 2,
        y: (Number(parentHeight) || 0) / 2 - ((Number(y) || 0) + (1 - py) * h),
    };
}

function visualCenterOffsetFromAnchor(
    width: number,
    height: number,
    anchorX: number,
    anchorY: number,
    scaleX: number,
    scaleY: number,
    nodeAngle: number,
): { x: number; y: number } {
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
export function positionForTransformedAnchor(
    x: number,
    y: number,
    width: number,
    height: number,
    parentWidth: number,
    parentHeight: number,
    anchorX = 0.5,
    anchorY = 0.5,
    scaleX = 1,
    scaleY = 1,
    figmaRotation = 0,
): { x: number; y: number } {
    const center = positionForAnchor(x, y, width, height, parentWidth, parentHeight, 0.5, 0.5);
    const offset = visualCenterOffsetFromAnchor(
        width,
        height,
        anchorX,
        anchorY,
        scaleX,
        scaleY,
        -figmaRotation,
    );
    return { x: center.x - offset.x, y: center.y - offset.y };
}

/**
 * cc.Layout owns the main axis, but HORIZONTAL/VERTICAL layouts preserve the
 * existing cross-axis coordinate. Seed only that coordinate from Figma before
 * Layout runs so MIN/CENTER/MAX alignment remains visually exact.
 */
export function positionBeforeMountedLayout(
    position: { x: number; y: number },
    layoutMode: unknown,
): { x: number; y: number } {
    switch (String(layoutMode || '').toUpperCase()) {
        case 'HORIZONTAL': return { x: 0, y: position.y };
        case 'VERTICAL': return { x: position.x, y: 0 };
        case 'GRID': return { x: 0, y: 0 };
        default: return { x: position.x, y: position.y };
    }
}

/** @zh Figma 垂直对齐 → Cocos Label.VerticalAlign */
function mapVAlign(Label: any, align: string): number {
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
export function applyTextSizing(Label: any, label: any, node: any): void {
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
function applyFontStyle(label: any, node: any): void {
    const weight = String(node.fontWeight || '');
    const realWeightFont = !!node.fontUuid && node.fontWeightMatched === true;
    label.isBold = !realWeightFont && wantsBold(weight);
    label.isItalic = /italic|oblique/i.test(weight);
}

/** @zh Figma textDecoration → Cocos Label 支持的下划线；删除线 Cocos Label 无内置，暂跳过。 */
function applyTextDecoration(label: any, node: any): void {
    const decoration = String(node.textDecoration || '').toUpperCase();
    label.isUnderline = decoration === 'UNDERLINE';
}

function applyRichTextDecoration(text: string, node: any, strokeColorOverride?: any): string {
    const stroke = node && node.stroke;
    if (stroke && stroke.color) {
        // Cocos RichText parses this tag into outlined child Labels, so mixed
        // colors keep the same Figma stroke without a second render path.
        const width = Math.max(1, Math.round(Number(stroke.width) || 1));
        text = `<outline color=#${colorToHex(strokeColorOverride || stroke.color)} width=${width}>${text}</outline>`;
    }
    const decoration = String(node.textDecoration || '').toUpperCase();
    if (decoration === 'UNDERLINE') return `<u>${text}</u>`;
    return text;
}

/** @zh Figma 字重是否需要 Cocos 合成粗体。真实 Bold 字体命中时不要再合成，避免双重加粗。 */
function wantsBold(weight: string): boolean {
    return /bold|black|heavy|extrabold|extra\s*bold|semibold|semi\s*bold|demibold|demi\s*bold|[6-9]00/i.test(weight);
}

interface Slice9Border {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

interface ImageFillMeta {
    source?: string;
    scaleMode?: string;
    opacity?: number;
    tileScalingFactor?: number;
    cropRect?: any;
    imageTransform?: any;
    rawWidth?: number;
    rawHeight?: number;
    skipCoverCrop?: boolean;
}

interface ImagePlaceholderRecord {
    nodeUuid: string;
    imgRef: string;
    dbUrl: string;
    spriteFrameUuid?: string;
    kind: 'sprite' | 'mask';
    slice9Border: Slice9Border | null;
    imageFill: ImageFillMeta | undefined;
    overlayTint: string | undefined;
    width: number;
    height: number;
}

interface PendingSpriteLoad {
    host: any;
    sprite: any;
    imgRef: string;
    uuid: string;
    slice9Border: Slice9Border | null;
    imageFill: ImageFillMeta | undefined;
    overlayTint: string | undefined;
    width: number;
    height: number;
}

interface Rgba255 {
    r: number;
    g: number;
    b: number;
    a: number;
}

/** @zh Figma SLICE9 → Cocos SpriteFrame inset。 */
function readSlice9Border(node: any): Slice9Border | null {
    if (String(node.componentType || '').toUpperCase() !== 'SLICE9') return null;
    const b = node.slice9Border;
    if (!b) return null;
    const border = {
        left: Math.max(0, Number(b.left) || 0),
        right: Math.max(0, Number(b.right) || 0),
        top: Math.max(0, Number(b.top) || 0),
        bottom: Math.max(0, Number(b.bottom) || 0),
    };
    return border.left || border.right || border.top || border.bottom ? border : null;
}

function applySlice9Border(spriteFrame: any, border: Slice9Border, Rect: any, Size: any, Vec2: any): any {
    // Border is persisted in the imported image meta by main.ts. Keep the
    // asset-backed SpriteFrame reference here; runtime clones are not serialized
    // by Cocos and turn into null after save/reload.
    const frame = spriteFrame;
    if (!frame) return frame;
    const raw = readSpriteFrameRect(frame);
    const width = raw && raw.width > 0 ? raw.width : 0;
    const height = raw && raw.height > 0 ? raw.height : 0;
    const clamped = clampSlice9Border(border, width, height);
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
function adaptImageFillSpriteFrame(spriteFrame: any, meta: ImageFillMeta | undefined,
    targetW: number, targetH: number, Rect: any, Size: any, Vec2: any): { frame: any; cropped: boolean } {
    if (!meta || String(meta.source || '').toUpperCase() !== 'FILL') return { frame: spriteFrame, cropped: false };
    const mode = String(meta.scaleMode || 'FILL').toUpperCase();
    if (mode === 'TILE' || !Rect || !Size || !Vec2 || targetW <= 0 || targetH <= 0) return { frame: spriteFrame, cropped: false };

    const raw = readSpriteFrameRect(spriteFrame);
    if (!raw || raw.width <= 0 || raw.height <= 0) return { frame: spriteFrame, cropped: false };

    const hasExplicitCrop = !!(meta.cropRect || meta.imageTransform);
    const crop = readCropRect(meta.cropRect, raw) || readImageTransformCropRect(meta.imageTransform, raw);
    let rect = crop;
    if (!rect && (mode === 'FILL' || mode === 'CROP')) {
        if (meta.skipCoverCrop) return { frame: spriteFrame, cropped: false };
        const metaAspect = Number(meta.rawWidth) > 0 && Number(meta.rawHeight) > 0
            ? Number(meta.rawWidth) / Number(meta.rawHeight)
            : 0;
        const targetAspect = targetW / targetH;
        if (!hasExplicitCrop && metaAspect > 0 && Math.abs(metaAspect - targetAspect) < 0.002) {
            return { frame: spriteFrame, cropped: false };
        }
        rect = calcCoverCropRect(raw, targetAspect);
    }
    if (!rect) return { frame: spriteFrame, cropped: false };
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

function readSpriteFrameRect(spriteFrame: any): { x: number; y: number; width: number; height: number } | null {
    if (!spriteFrame) return null;
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

function readCropRect(cropRect: any, raw: { x: number; y: number; width: number; height: number }):
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
    const px = normalized ? raw.x + x * raw.width : raw.x + x;
    const py = normalized ? raw.y + y * raw.height : raw.y + y;
    const pw = normalized ? w * raw.width : w;
    const ph = normalized ? h * raw.height : h;
    return clampRectToRaw({ x: px, y: py, width: pw, height: ph }, raw);
}

function readImageTransformCropRect(imageTransform: any, raw: { x: number; y: number; width: number; height: number }):
    { x: number; y: number; width: number; height: number } | null {
    const m = readTransform2x3(imageTransform);
    if (!m) return null;
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

function readTransform2x3(value: any): number[][] | null {
    if (!Array.isArray(value) || !Array.isArray(value[0]) || !Array.isArray(value[1])) return null;
    const m = [
        [Number(value[0][0]), Number(value[0][1]), Number(value[0][2])],
        [Number(value[1][0]), Number(value[1][1]), Number(value[1][2])],
    ];
    for (const row of m) {
        for (const n of row) {
            if (!Number.isFinite(n)) return null;
        }
    }
    return m;
}

function transformPoint2x3(m: number[][], x: number, y: number): { x: number; y: number } {
    return {
        x: m[0][0] * x + m[0][1] * y + m[0][2],
        y: m[1][0] * x + m[1][1] * y + m[1][2],
    };
}

function calcCoverCropRect(raw: { x: number; y: number; width: number; height: number }, targetAspect: number):
    { x: number; y: number; width: number; height: number } | null {
    if (!Number.isFinite(targetAspect) || targetAspect <= 0) return null;
    const rawAspect = raw.width / raw.height;
    if (Math.abs(rawAspect - targetAspect) < 0.002) return null;
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

function clampRectToRaw(rect: { x: number; y: number; width: number; height: number },
    raw: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } | null {
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
    if (width <= 0.5 || height <= 0.5) return null;
    return { x, y, width, height };
}

function applyImageColor(sprite: any, meta: ImageFillMeta | undefined, overlayTint: string | undefined, Color: any): boolean {
    if (!Color) return false;
    const opacity = meta && typeof meta.opacity === 'number'
        ? Math.max(0, Math.min(1, meta.opacity))
        : 1;
    const tint = parseOverlayTint(overlayTint);
    if (!tint && opacity >= 0.999) return false;
    const alpha = tint && tint.hasAlpha ? tint.a : Math.round(opacity * 255);
    sprite.color = new Color(
        tint ? tint.r : 255,
        tint ? tint.g : 255,
        tint ? tint.b : 255,
        alpha
    );
    return !!tint;
}

function parseOverlayTint(value: string | undefined): (Rgba255 & { hasAlpha: boolean }) | null {
    if (!value) return null;
    let hex = String(value).trim();
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        hex = hex.split('').map((ch) => ch + ch).join('');
    } else if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        hex = hex.split('').map((ch) => ch + ch).join('');
    }
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return null;
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

function configureSpriteType(sprite: any, figmaNode: any, slice9Border: Slice9Border | null, Sprite: any): void {
    const mode = String(figmaNode.imageFill && figmaNode.imageFill.scaleMode || '').toUpperCase();
    if (slice9Border) {
        sprite.type = Sprite.Type.SLICED;
    } else if (mode === 'TILE' && Sprite.Type.TILED != null) {
        sprite.type = Sprite.Type.TILED;
    } else {
        sprite.type = Sprite.Type.SIMPLE;
    }
}

function applyTileScaling(sprite: any, meta: ImageFillMeta | undefined): void {
    if (!meta || String(meta.scaleMode || '').toUpperCase() !== 'TILE') return;
    const factor = Number(meta.tileScalingFactor);
    if (Number.isFinite(factor) && Math.abs(factor) > 0.001 && Math.abs(factor - 1) > 0.001) {
        sprite.pixelsPerUnit = sprite.pixelsPerUnit || 100;
        sprite.pixelsPerUnit = sprite.pixelsPerUnit / factor;
    }
}

function color255(Color: any, c: Rgba255): any {
    return new Color(
        clamp255(c.r),
        clamp255(c.g),
        clamp255(c.b),
        clamp255(c.a)
    );
}

function clamp255(value: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 255;
    return Math.max(0, Math.min(255, Math.round(n)));
}

function readUniformCornerRadius(node: any, w: number, h: number): number {
    const maxR = Math.max(0, Math.min(w, h) * 0.5);
    const radii = Array.isArray(node.cornerRadii)
        ? node.cornerRadii.map((v: any) => Math.max(0, Number(v) || 0))
        : [];
    let r = Math.max(0, Number(node.cornerRadius) || 0);
    if (radii.length >= 4) {
        const [tl, tr, br, bl] = radii;
        const same = Math.abs(tl - tr) < 0.01 && Math.abs(tl - br) < 0.01 && Math.abs(tl - bl) < 0.01;
        if (same) r = tl;
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
function resolveVisualHost(node: any, figmaNode: any, w: number, h: number, cc: any): any {
    const { Node, UITransform } = cc;
    const hasVisual = !!(figmaNode.imageRef || figmaNode.solidFill ||
        (figmaNode.type === 'RECTANGLE' && !figmaNode.imageRef && !figmaNode.solidFill));
    if (!figmaNode.clipsContent || figmaNode.mask || !hasVisual) return node;
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
    if (widget.updateAlignment) widget.updateAlignment();
    return bg;
}

function applySolidFill(node: any, figmaNode: any, w: number, h: number, Graphics: any, Color: any): boolean {
    if (!figmaNode.solidFill || !figmaNode.solidFill.color || !Graphics || !Color || w <= 0 || h <= 0) return false;
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
    } else if (typeof g.fillRect === 'function') {
        g.fillRect(x, y, w, h);
    } else {
        g.rect(x, y, w, h);
        g.fill();
    }
    return true;
}

function applyTransparentRectangleFallback(node: any, figmaNode: any, w: number, h: number, Graphics: any, Color: any): boolean {
    if (figmaNode.type !== 'RECTANGLE' || figmaNode.solidFill || figmaNode.imageRef || !Graphics || !Color) return false;
    const g = node.addComponent(Graphics);
    g.clear();
    g.fillColor = new Color(255, 255, 255, 0);
    const x = -w / 2;
    const y = -h / 2;
    if (!drawRoundedRect(g, figmaNode, x, y, w, h)) g.rect(x, y, w, h);
    g.fill();
    return true;
}

// 节点声明了图片（imageRef）但没匹配到 SpriteFrame（未落盘/未复用成功）时的兜底：
// 给节点挂一个「空 Sprite」——sizeMode=CUSTOM、尺寸对齐设计稿，spriteFrame 留空，
// 美术在编辑器里可直接把正确的 SpriteFrame 拖进去补齐（对齐同事「挂代图」诉求）。
// 空 Sprite 本身不渲染，为了在画布上一眼看到缺图区域，再加一个 `_MissingImg` 子节点
// 用 Graphics 画半透明品红框（Graphics 与 Sprite 同节点会冲突，故必须分节点承载）。
function mountMissingImagePlaceholder(host: any, w: number, h: number, cc: any): any {
    const { Node, UITransform, Sprite, Graphics, Color } = cc;
    const sprite = host.getComponent && host.getComponent(Sprite) || host.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    if (!Graphics || !Color || w <= 0 || h <= 0) return sprite;
    const existing = host.children && host.children.find((child: any) => child && child.name === '_MissingImg');
    if (existing) return sprite;
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
export function trackFailedSpriteLoad(
    pending: PendingSpriteLoad,
    placeholders: ImagePlaceholderRecord[],
    cc: any,
): ImagePlaceholderRecord {
    mountMissingImagePlaceholder(pending.host, pending.width, pending.height, cc);
    const record: ImagePlaceholderRecord = {
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

function drawRoundedRect(g: any, figmaNode: any, x: number, y: number, w: number, h: number): boolean {
    if (w <= 0 || h <= 0) return false;
    const maxR = Math.max(0, Math.min(w, h) * 0.5);
    const radii = Array.isArray(figmaNode.cornerRadii)
        ? figmaNode.cornerRadii.map((v: any) => Math.min(maxR, Math.max(0, Number(v) || 0)))
        : [];
    if (radii.length >= 4) {
        const [tl, tr, br, bl] = radii;
        const uniform = Math.abs(tl - tr) < 0.01 && Math.abs(tl - br) < 0.01 && Math.abs(tl - bl) < 0.01;
        if (!uniform && typeof g.moveTo === 'function' && typeof g.lineTo === 'function' &&
            typeof g.quadraticCurveTo === 'function') {
            g.moveTo(x + tl, y + h);
            g.lineTo(x + w - tr, y + h);
            if (tr > 0) g.quadraticCurveTo(x + w, y + h, x + w, y + h - tr);
            else g.lineTo(x + w, y + h);
            g.lineTo(x + w, y + br);
            if (br > 0) g.quadraticCurveTo(x + w, y, x + w - br, y);
            else g.lineTo(x + w, y);
            g.lineTo(x + bl, y);
            if (bl > 0) g.quadraticCurveTo(x, y, x, y + bl);
            else g.lineTo(x, y);
            g.lineTo(x, y + h - tl);
            if (tl > 0) g.quadraticCurveTo(x, y + h, x + tl, y + h);
            else g.lineTo(x, y + h);
            if (typeof g.close === 'function') g.close();
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
function figmaNodeHasOwnGraphic(figmaNode: any): boolean {
    if (!figmaNode) return false;
    return !!(figmaNode.imageRef || figmaNode.imageFill || figmaNode.solidFill ||
        (figmaNode.type === 'RECTANGLE' && !figmaNode.imageRef && !figmaNode.solidFill));
}

/** @zh 子树（含自身）里是否存在可见图形。用于识别「底图挂在子节点上」的容器按钮。
 *  注意：不按 visible 过滤——按钮常是隐藏的变体态（多色 swatch 容器默认隐藏），
 *  其美术子节点结构仍在；若因根/子隐藏而判空,隐藏按钮就永远挂不上 Button。 */
function subtreeHasVisibleGraphic(figmaNode: any): boolean {
    if (!figmaNode) return false;
    if (figmaNode.type !== 'TEXT' && figmaNodeHasOwnGraphic(figmaNode)) return true;
    const kids = Array.isArray(figmaNode.children) ? figmaNode.children : [];
    for (const c of kids) {
        if (subtreeHasVisibleGraphic(c)) return true;
    }
    return false;
}

function setupButton(node: any, figmaNode: any, Button: any, hasVisibleGraphic: boolean): boolean {
    if (String(figmaNode.componentType || '').toUpperCase() !== 'BUTTON') return false;
    if (!Button) return false;
    // 对齐 Unity「空 Frame/Group 起名带 btn 不绑 Button」的本意，但修正其盲区：
    // 真按钮常把底图放在子节点（如「通用按钮 > Common_btn_blue_big」），自身无图。
    // 故判据放宽为「自身有图 或 子孙有可见图形」——容器按钮能挂上，纯空壳仍拦住。
    if (!hasVisibleGraphic && !subtreeHasVisibleGraphic(figmaNode)) return false;
    const button = node.addComponent(Button);
    button.target = node;
    button.interactable = true;
    if (Button.Transition && Button.Transition.NONE != null) {
        button.transition = Button.Transition.NONE;
    }
    return true;
}

export function normalizeFigmaInputSpec(figmaNode: any): FigmaInputSpec | null {
    if (String(figmaNode && figmaNode.componentType || '').toUpperCase() !== 'INPUT') return null;
    const raw = figmaNode && figmaNode.inputSpec;
    const textNodeId = String(raw && raw.textNodeId || '');
    if (!raw || !textNodeId) return null;
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

export interface FtocInputEditBoxMountResult {
    applied: boolean;
    reason: string;
    createdEditBox: boolean;
    createdTextLabel: boolean;
    editBox: any | null;
    authoredLabel: any | null;
    placeholderLabel: any | null;
    textLabel: any | null;
    textNode: any | null;
}

export function copyInputLabelStyle(source: any, target: any): void {
    const scalarKeys = [
        'font', 'useSystemFont', 'fontFamily', 'fontSize', 'lineHeight',
        'horizontalAlign', 'verticalAlign', 'overflow', 'enableWrapText',
        'isBold', 'isItalic', 'spacingX', 'enableOutline', 'outlineWidth',
        'enableShadow', 'shadowBlur', 'cacheMode', 'customMaterial',
    ];
    for (const key of scalarKeys) {
        if (typeof source[key] !== 'undefined') target[key] = source[key];
    }
    for (const key of ['color', 'outlineColor', 'shadowColor', 'shadowOffset']) {
        const value = source[key];
        if (typeof value !== 'undefined') target[key] = value && typeof value.clone === 'function' ? value.clone() : value;
    }
}

/** Sync a native EditBox Label and keep the authored style source non-rendering. */
export function syncInputNativeLabelStyle(source: any, target: any): void {
    copyInputLabelStyle(source, target);
    if (source && typeof source.enabled !== 'undefined') source.enabled = false;
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
export function mountFtocInputEditBox(
    host: any,
    figmaNode: any,
    authoredTextNode: any,
    cc: any,
): FtocInputEditBoxMountResult {
    const spec = normalizeFigmaInputSpec(figmaNode);
    const { Node, UITransform, Sprite, Label, EditBox, Widget, Vec3 } = cc || {};
    const unavailable = (reason: string): FtocInputEditBoxMountResult => ({
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
    if (!spec) return unavailable('input-spec-missing');
    if (spec.textRole !== 'placeholder') return unavailable('unsupported-text-role');
    if (!host || !authoredTextNode || !Node || !UITransform || !Sprite || !Label || !EditBox || !Vec3) {
        return unavailable('runtime-or-authored-text-missing');
    }
    const hostUi = host.getComponent && host.getComponent(UITransform);
    if (!hostUi) return unavailable('host-ui-transform-missing');
    const authoredLabel = authoredTextNode.getComponent && authoredTextNode.getComponent(Label);
    if (!authoredLabel) return unavailable('placeholder-label-missing');
    const authoredUi = authoredTextNode.getComponent && authoredTextNode.getComponent(UITransform);
    if (!authoredUi) return unavailable('placeholder-ui-transform-missing');

    const authoredSize = readUiSize(authoredUi);
    const authoredAnchor = readUiAnchor(authoredUi);
    const authoredPosition = readNodePosition(authoredTextNode);
    const authoredScale = readNodeScale(authoredTextNode);

    const removeInputWidget = (target: any): void => {
        const widget = Widget && target && target.getComponent && target.getComponent(Widget);
        if (!widget) return;
        widget.enabled = false;
        widget.isAlignLeft = widget.isAlignRight = false;
        widget.isAlignTop = widget.isAlignBottom = false;
        if (typeof widget.destroy === 'function') widget.destroy();
    };

    const editBoxHosts = (host.children || []).filter(
        (child: any) => child && child.name === FTOC_INPUT_EDITBOX_HOST_NAME
    );
    let editBoxNode = editBoxHosts.find(
        (child: any) => child.getComponent && child.getComponent(EditBox)
    ) || editBoxHosts[0] || null;
    if (!editBoxNode) {
        editBoxNode = new Node(FTOC_INPUT_EDITBOX_HOST_NAME);
        editBoxNode.active = false;
        host.addChild(editBoxNode);
    }
    for (const extra of editBoxHosts) {
        if (extra === editBoxNode) continue;
        if (typeof extra.removeFromParent === 'function') extra.removeFromParent();
        if (typeof extra.destroy === 'function') extra.destroy();
    }
    if (typeof host.layer === 'number') editBoxNode.layer = host.layer;
    const editBoxUi = editBoxNode.getComponent(UITransform) || editBoxNode.addComponent(UITransform);
    // Creator owns native Label geometry and always expands it to the EditBox rect.
    // Make that rect the authored text box so engine lifecycle and FtoC have one owner.
    editBoxUi.setContentSize(authoredSize.width, authoredSize.height);
    editBoxUi.setAnchorPoint(authoredAnchor.x, authoredAnchor.y);
    editBoxNode.setPosition(new Vec3(authoredPosition.x, authoredPosition.y, 0));
    editBoxNode.angle = Number(authoredTextNode.angle) || 0;
    editBoxNode.setScale(new Vec3(authoredScale.x, authoredScale.y, 1));
    removeInputWidget(editBoxNode);

    const collectLabelHelpers = (name: string, legacyName: string): any[] => [
        ...(editBoxNode.children || []).filter(
            (child: any) => child && (child.name === name || child.name === legacyName)
        ),
        ...(host.children || []).filter(
            (child: any) => child && child.name === legacyName
        ),
    ];
    const ensureNativeLabelNode = (name: string, legacyName: string): { node: any; created: boolean } => {
        const helpers = collectLabelHelpers(name, legacyName);
        let labelNode = helpers.find(
            (child: any) => child.parent === editBoxNode && child.name === name &&
                child.getComponent && child.getComponent(Label)
        ) || helpers.find(
            (child: any) => child.getComponent && child.getComponent(Label)
        ) || helpers[0] || null;
        const created = !labelNode;
        if (!labelNode) {
            labelNode = new Node(name);
            labelNode.active = false;
        }
        if (labelNode.parent !== editBoxNode) editBoxNode.addChild(labelNode);
        labelNode.name = name;
        for (const extra of helpers) {
            if (extra === labelNode) continue;
            if (typeof extra.removeFromParent === 'function') extra.removeFromParent();
            if (typeof extra.destroy === 'function') extra.destroy();
        }
        if (typeof host.layer === 'number') labelNode.layer = host.layer;
        const labelUi = labelNode.getComponent(UITransform) || labelNode.addComponent(UITransform);
        // Mirror Creator 3.8's native layout for an already-active EditBox. Fresh
        // components will apply the same values from EditBox.__preload().
        labelUi.setContentSize(Math.max(0, authoredSize.width - 2), authoredSize.height);
        labelUi.setAnchorPoint(0, 1);
        labelNode.setPosition(new Vec3(
            -authoredAnchor.x * authoredSize.width + 2,
            (1 - authoredAnchor.y) * authoredSize.height,
            0,
        ));
        labelNode.angle = 0;
        labelNode.setScale(new Vec3(1, 1, 1));
        removeInputWidget(labelNode);
        return { node: labelNode, created };
    };

    const textHelper = ensureNativeLabelNode(
        FTOC_INPUT_TEXT_LABEL_NAME,
        LEGACY_FTOC_INPUT_TEXT_LABEL_NAME,
    );
    const textNode = textHelper.node;
    const placeholderNode = ensureNativeLabelNode(
        FTOC_INPUT_PLACEHOLDER_LABEL_NAME,
        LEGACY_FTOC_INPUT_PLACEHOLDER_LABEL_NAME,
    ).node;

    const existingEditBox = editBoxNode.getComponent && editBoxNode.getComponent(EditBox);
    let editBox = existingEditBox;
    let textLabel: any = null;
    let placeholderLabel: any = null;
    if (!existingEditBox && editBoxNode.active === true) editBoxNode.active = false;
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
        if (EditBox.InputFlag && EditBox.InputFlag.DEFAULT != null) editBox.inputFlag = EditBox.InputFlag.DEFAULT;
        if (EditBox.KeyboardReturnType && EditBox.KeyboardReturnType.DEFAULT != null) {
            editBox.returnType = EditBox.KeyboardReturnType.DEFAULT;
        }
        // The string setter truncates against the current maxLength (20 by
        // default), so configure the limit before assigning initial content.
        editBox.string = spec.string;
    } finally {
        editBoxNode.active = true;
    }
    // Keep the authored Label as an inspectable style source, but only disable
    // it after the native EditBox and both labels mounted successfully.
    if (typeof authoredLabel.enabled !== 'undefined') authoredLabel.enabled = false;
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
function applyTextCase(text: string, textCase: string): string {
    switch (String(textCase || '').toUpperCase()) {
        case 'UPPER':
            return text.toLocaleUpperCase();
        case 'LOWER':
            return text.toLocaleLowerCase();
        case 'TITLE':
            return text.replace(/\S+/g, (word) => {
                if (word.length <= 1) return word.toLocaleUpperCase();
                return word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();
            });
        case 'ORIGINAL':
        default:
            return text;
    }
}

function richTextEscape(text: string): string {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function colorToHex(c: any): string {
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

export interface RichTextSegmentRun {
    start: number;
    end: number;
    fontSize: number;
    color?: any;
}

/**
 * Normalize exporter segments before producing markup. Figma normally sends a
 * complete ordered partition, but older JSON and post-processors may leave
 * gaps, overlaps, or reverse the order. Base-style runs keep every authored
 * character visible while explicit runs retain their segment appearance.
 */
export function normalizeRichTextSegmentRuns(characters: string, node: any): RichTextSegmentRun[] {
    const length = String(characters || '').length;
    const raw = Array.isArray(node && node.textSegments) ? node.textSegments : [];
    const explicit = raw
        .map((segment: any, index: number) => ({
            index,
            start: Math.max(0, Math.min(length, Math.round(Number(segment && segment.start) || 0))),
            end: Math.max(0, Math.min(length, Math.round(Number(segment && segment.end) || 0))),
            fontSize: Number(segment && segment.fontSize) || 0,
            color: segment && segment.color,
        }))
        .filter((segment: any) => segment.end > segment.start)
        .sort((left: any, right: any) => left.start - right.start || left.index - right.index);

    const runs: RichTextSegmentRun[] = [];
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
    if (cursor < length) runs.push({ start: cursor, end: length, fontSize: baseFontSize });
    return runs;
}

function buildRichTextMarkup(characters: string, node: any, colorOverride?: any): string {
    const segments = Array.isArray(node.textSegments) ? node.textSegments : [];
    if (segments.length <= 1) {
        let text = richTextEscape(applyTextCase(characters, node.textCase));
        if (colorOverride) text = `<color=#${colorToHex(colorOverride)}>${text}</color>`;
        return applyRichTextDecoration(text, node, colorOverride);
    }
    const cased = applyTextCase(characters, node.textCase);
    const parts: string[] = [];
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

export function buildRichTextString(characters: string, node: any): string {
    return buildRichTextMarkup(characters, node);
}

export function buildRichTextShadowString(characters: string, node: any): string {
    const shadow = node && node.shadow;
    return buildRichTextMarkup(characters, node, shadow && shadow.color);
}

function hasMixedTextSegments(node: any): boolean {
    return Array.isArray(node.textSegments) && node.textSegments.length > 1;
}

interface ExportContext {
    cc: any;
    imageSearchDirs: string[];
    images: { [id: string]: string };
    imageIdByContent: { [base64: string]: string };
    imageCounter: number;
    warnings: string[];
    stats: {
        nodes: number;
        texts: number;
        sprites: number;
        images: number;
        missingImages: number;
        solidFills: number;
        masks: number;
        buttons: number;
        slicedSprites: number;
    };
}

function roundExportNumber(value: number, digits = 3): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const p = Math.pow(10, digits);
    return Math.round(n * p) / p;
}

function componentEnabled(c: any): boolean {
    return !!c && c.enabled !== false && c._enabled !== false;
}

function loadAssetAny(
    assetManager: any,
    uuid: string,
    tries = 1,
    delayMs = 100,
    ready?: (asset: any) => boolean,
): Promise<any> {
    return new Promise((resolve) => {
        if (!uuid) {
            resolve(null);
            return;
        }
        const attempt = (left: number) => {
            assetManager.loadAny({ uuid }, (err: any, asset: any) => {
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
function isSpriteFrameTextureReady(spriteFrame: any): boolean {
    if (!spriteFrame) return false;
    const texture = spriteFrame.texture || spriteFrame._texture;
    const rect = spriteFrame.rect || spriteFrame._rect;
    if (!texture || !rect) return false;
    const textureWidth = Number(texture.width) || 0;
    const textureHeight = Number(texture.height) || 0;
    const rectX = Number(rect.x) || 0;
    const rectY = Number(rect.y) || 0;
    const rectWidth = Number(rect.width) || 0;
    const rectHeight = Number(rect.height) || 0;
    if (textureWidth <= 0 || textureHeight <= 0 || rectWidth <= 0 || rectHeight <= 0) return false;
    const rotated = !!(spriteFrame.rotated || spriteFrame._rotated || spriteFrame.isRotate);
    const requiredWidth = rectX + (rotated ? rectHeight : rectWidth);
    const requiredHeight = rectY + (rotated ? rectWidth : rectHeight);
    return textureWidth >= requiredWidth && textureHeight >= requiredHeight;
}

function readUiSize(ui: any): { width: number; height: number } {
    const content = ui && (ui.contentSize || ui._contentSize);
    return {
        width: Math.max(0, Number(ui && (ui.width ?? (content && content.width))) || 0),
        height: Math.max(0, Number(ui && (ui.height ?? (content && content.height))) || 0),
    };
}

function readNodePosition(node: any): { x: number; y: number } {
    const p = node && (node.position || (node.getPosition && node.getPosition()));
    return { x: Number(p && p.x) || 0, y: Number(p && p.y) || 0 };
}

function readNodeScale(node: any): { x: number; y: number } {
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
function findCoordBaseForPatch(node: any, designW: number, designH: number, UITransform: any, find: any): any {
    let cur = node;
    let lastUi: any = null;
    let canvasNode: any = null;
    let best: any = null;
    let bestDiff = Infinity;
    const wantSize = designW > 0 && designH > 0;
    while (cur) {
        if (cur.getComponent && cur.getComponent(UITransform)) {
            if (!lastUi) lastUi = cur;
            if (String(cur.name || '') === 'Canvas') canvasNode = cur;
            if (wantSize) {
                const s = readUiSize(cur.getComponent(UITransform));
                const diff = Math.abs(s.width - designW) + Math.abs(s.height - designH);
                if (diff < bestDiff) { bestDiff = diff; best = cur; }
            }
        }
        cur = cur.parent;
    }
    // 找到尺寸与设计稿一致（误差≤2px）的祖先 = 界面根，作基准最准。
    if (best && bestDiff <= 2) return best;
    // 否则退回 Canvas（老行为），再退回最近祖先 / 全局 Canvas。
    return canvasNode || (typeof find === 'function' && find('Canvas')) || lastUi;
}

function placeAtCanvasAbsolute(
    node: any,
    figmaNode: any,
    canvas: any,
    Vec3: any,
    UITransform: any,
    find: any,
    anchorX = 0.5,
    anchorY = 0.5,
    scaleX = 1,
    scaleY = 1,
    figmaRotation = 0,
): boolean {
    if (!node || !figmaNode || !canvas || !Vec3 || !UITransform) return false;
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
    const centerInBase = positionForAnchor(
        Number(figmaNode.x) || 0,
        Number(figmaNode.y) || 0,
        w,
        h,
        baseW,
        baseH,
        0.5,
        0.5,
    );
    const world = baseUi.convertToWorldSpaceAR(new Vec3(centerInBase.x, centerInBase.y, 0));
    const centerLocal = parentUi.convertToNodeSpaceAR(world);
    const offset = visualCenterOffsetFromAnchor(
        w,
        h,
        anchorX,
        anchorY,
        scaleX,
        scaleY,
        -figmaRotation,
    );
    node.setPosition(new Vec3(centerLocal.x - offset.x, centerLocal.y - offset.y, 0));
    return true;
}

function applyPatchTransform(
    node: any,
    ui: any,
    figmaNode: any,
    canvas: any,
    Vec3: any,
    resetAnchorPivot: boolean,
    UITransform?: any,
    find?: any
): void {
    if (!node || !ui || !figmaNode || !canvas || !Vec3) return;
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
    if (resetAnchorPivot && ui.setAnchorPoint) ui.setAnchorPoint(anchorX, anchorY);
    if (!placeAtCanvasAbsolute(
        node,
        figmaNode,
        canvas,
        Vec3,
        UITransform,
        find,
        anchorX,
        anchorY,
        scaleX,
        scaleY,
        figmaRotation,
    )) {
        const canvasW = Number(canvas.width) || w;
        const canvasH = Number(canvas.height) || h;
        const pos = positionForTransformedAnchor(
            Number(figmaNode.x) || 0,
            Number(figmaNode.y) || 0,
            w,
            h,
            canvasW,
            canvasH,
            anchorX,
            anchorY,
            scaleX,
            scaleY,
            figmaRotation,
        );
        node.setPosition(new Vec3(pos.x, pos.y, 0));
    }
    node.angle = -figmaRotation;
    node.setScale(new Vec3(scaleX, scaleY, 1));
}

export function applyAuthoredLetterSpacing(label: any, figmaNode: any): void {
    if (label && figmaNode && typeof figmaNode.letterSpacing === 'number') {
        label.spacingX = figmaNode.letterSpacing;
    }
}

function applyPatchTextCommon(label: any, figmaNode: any, Label: any, isRich: boolean, Color: any, Vec2: any): boolean {
    if (!label || !figmaNode) return false;
    const characters = typeof figmaNode.characters === 'string' ? figmaNode.characters : '';
    label.string = isRich
        ? buildRichTextString(characters, figmaNode)
        : applyTextCase(characters, figmaNode.textCase);
    if (figmaNode.fontSize) label.fontSize = figmaNode.fontSize;
    label.lineHeight = figmaNode.lineHeight > 0 ? figmaNode.lineHeight : (figmaNode.fontSize || label.fontSize);
    label.horizontalAlign = mapHAlign(Label, figmaNode.textAlignHorizontal);
    label.verticalAlign = mapVAlign(Label, figmaNode.textAlignVertical);
    if (isRich) {
        label.maxWidth = String(figmaNode.textAutoResize || '') === 'WIDTH_AND_HEIGHT' ? 0 : (figmaNode.width || 0);
    } else {
        applyTextSizing(Label, label, figmaNode);
        applyFontStyle(label, figmaNode);
        applyTextDecoration(label, figmaNode);
        applyAuthoredLetterSpacing(label, figmaNode);
    }
    if (figmaNode.color) {
        const c = figmaNode.color;
        if (isRich) label.fontColor = new Color(c.r, c.g, c.b, c.a);
        else label.color = new Color(c.r, c.g, c.b, c.a);
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

async function applyPatchFont(label: any, figmaNode: any, assetManager: any, Font: any, rich: boolean): Promise<boolean> {
    if (!label || !figmaNode || !figmaNode.fontUuid) return false;
    const font = await loadAssetAny(assetManager, figmaNode.fontUuid);
    if (font && (!Font || font instanceof Font)) {
        label.font = font;
        label.useSystemFont = false;
        return true;
    }
    if (!rich) label.isBold = wantsBold(String(figmaNode.fontWeight || ''));
    label.useSystemFont = true;
    return false;
}

interface PreparedTextPatchTarget {
    component: any | null;
    isRich: boolean;
    rendererNode: any | null;
    label: any | null;
    createdRenderer: boolean;
    convertedLabel: boolean;
    warning: string;
}

function copyLabelFontBaselineToRichText(label: any, richText: any): void {
    if (!label || !richText) return;
    if (label.font) {
        richText.font = label.font;
        richText.useSystemFont = false;
    } else {
        richText.useSystemFont = !!label.useSystemFont;
        if (label.fontFamily) richText.fontFamily = label.fontFamily;
    }
    if (label.color) {
        richText.fontColor = typeof label.color.clone === 'function' ? label.color.clone() : label.color;
    }
    if (typeof label.cacheMode !== 'undefined') richText.cacheMode = label.cacheMode;
}

/**
 * @zh 为 ResourceReplace 解析本次文字承载组件。混合样式命中普通 Label 时，
 *     只准备 authored 子 renderer；成功应用后才由调用者关闭 Label 并激活 renderer。
 */
export function prepareTextPatchTarget(target: any, figmaNode: any, cc: any): PreparedTextPatchTarget {
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
            if (logical.rendererNode) logical.rendererNode.active = false;
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
    } catch (error: any) {
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

async function applyPatchRichTextFont(target: any, figmaNode: any, cc: any): Promise<boolean> {
    const { Label, Font, instantiate } = cc;
    const template = figmaNode && figmaNode.textStyleTemplate;
    const templatePath = resolveTextStyleTemplatePath(template);
    const fontRef = resolveRichTextFontReference(figmaNode, template);
    let templateRoot: any = null;
    let templateLabel: any = null;
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
            } catch (error: any) {
                console.warn(
                    '[figma-importer:scene] ResourceReplace 文字模板加载失败，改用 resolver 字体:',
                    error && error.message || error,
                );
            }
        }
        const source = await applyRichTextFont(
            target,
            templateLabel,
            fontRef.uuid,
            (uuid) => loadAssetAny(cc.assetManager, uuid),
            Font,
        );
        return source !== 'missing';
    } finally {
        if (templateRoot && typeof templateRoot.destroy === 'function') templateRoot.destroy();
    }
}

async function applyPatchSprite(sprite: any, figmaNode: any, data: any, cc: any, preserveAlpha: boolean): Promise<boolean> {
    if (!sprite || !figmaNode || !data) return false;
    const { assetManager, Sprite, Rect, Size, Vec2, Color } = cc;
    const imgRef = figmaNode.imageRef;
    const uuid = imgRef && data.idToSpriteFrame && data.idToSpriteFrame[imgRef];
    if (!uuid) return false;
    const oldAlpha = sprite.color && typeof sprite.color.a === 'number' ? sprite.color.a : 255;
    const slice9Border = readSlice9Border(figmaNode);
    const spriteFrame = await loadAssetAny(
        assetManager,
        uuid,
        slice9Border ? 30 : 1,
        100,
        slice9Border ? isSpriteFrameTextureReady : undefined,
    );
    if (!spriteFrame) return false;
    configureSpriteType(sprite, figmaNode, slice9Border, Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    if (slice9Border) {
        sprite.spriteFrame = applySlice9Border(spriteFrame, slice9Border, Rect, Size, Vec2);
    } else {
        const adapted = adaptImageFillSpriteFrame(
            spriteFrame,
            figmaNode.imageFill,
            Number(figmaNode.width) || 0,
            Number(figmaNode.height) || 0,
            Rect,
            Size,
            Vec2
        );
        sprite.spriteFrame = adapted.frame;
    }
    applyImageColor(sprite, figmaNode.imageFill, figmaNode.overlayTint, Color);
    if (preserveAlpha && sprite.color) {
        sprite.color = new Color(sprite.color.r, sprite.color.g, sprite.color.b, oldAlpha);
    }
    applyTileScaling(sprite, figmaNode.imageFill);
    return true;
}

function snapshotColor(c: any): any {
    if (!c) return null;
    return {
        r: clamp255(c.r),
        g: clamp255(c.g),
        b: clamp255(c.b),
        a: clamp255(c.a),
    };
}

function restoreColor(Color: any, c: any): any {
    if (!Color || !c) return null;
    return new Color(
        clamp255(c.r),
        clamp255(c.g),
        clamp255(c.b),
        clamp255(c.a)
    );
}

function snapshotVec2(v: any): any {
    if (!v) return null;
    return {
        x: roundExportNumber(Number(v.x) || 0),
        y: roundExportNumber(Number(v.y) || 0),
    };
}

function snapshotVec3(v: any): any {
    if (!v) return null;
    return {
        x: roundExportNumber(Number(v.x) || 0),
        y: roundExportNumber(Number(v.y) || 0),
        z: roundExportNumber(Number(v.z) || 0),
    };
}

function makeVec2(Vec2: any, v: any): any {
    if (!Vec2 || !v) return null;
    return new Vec2(Number(v.x) || 0, Number(v.y) || 0);
}

function makeVec3(Vec3: any, v: any, fallbackZ = 0): any {
    if (!Vec3 || !v) return null;
    return new Vec3(Number(v.x) || 0, Number(v.y) || 0, Number(v.z ?? fallbackZ) || 0);
}

function readUiAnchor(ui: any): any {
    if (!ui) return { x: 0.5, y: 0.5 };
    const anchor = ui.anchorPoint || ui._anchorPoint;
    return {
        x: Number((anchor && anchor.x) ?? ui.anchorX ?? ui._anchorX) || 0,
        y: Number((anchor && anchor.y) ?? ui.anchorY ?? ui._anchorY) || 0,
    };
}

function assetUuid(asset: any): string {
    return String(asset && (asset.uuid || asset._uuid || asset._id) || '');
}

function snapshotSpriteFrame(frame: any): any {
    if (!frame) return null;
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
        insetLeft: Number(frame.insetLeft ?? frame.borderLeft ?? frame._insetLeft) || 0,
        insetRight: Number(frame.insetRight ?? frame.borderRight ?? frame._insetRight) || 0,
        insetTop: Number(frame.insetTop ?? frame.borderTop ?? frame._insetTop) || 0,
        insetBottom: Number(frame.insetBottom ?? frame.borderBottom ?? frame._insetBottom) || 0,
    };
}

function rectDiffers(a: any, b: any): boolean {
    if (!a || !b) return false;
    return Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) > 0.01 ||
        Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) > 0.01 ||
        Math.abs((Number(a.width) || 0) - (Number(b.width) || 0)) > 0.01 ||
        Math.abs((Number(a.height) || 0) - (Number(b.height) || 0)) > 0.01;
}

async function restoreSpriteFrameSnapshot(snapshot: any, cc: any): Promise<any> {
    if (!snapshot || !snapshot.uuid) return null;
    const { assetManager, Rect, Size, Vec2 } = cc;
    const loaded = await loadAssetAny(assetManager, snapshot.uuid);
    if (!loaded) return null;

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
            rect: new Rect(
                Number(targetRect.x) || 0,
                Number(targetRect.y) || 0,
                Number(targetRect.width) || 0,
                Number(targetRect.height) || 0
            ),
            originalSize: new Size(
                Number(originalSize.width) || Number(targetRect.width) || 0,
                Number(originalSize.height) || Number(targetRect.height) || 0
            ),
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

function snapshotRichTextComponent(richText: any): any {
    if (!richText) return null;
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

function snapshotRichTextRenderer(renderer: any, cc: any): any {
    if (!renderer) return null;
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

export function captureReplaceSnapshot(node: any, cc: any): any {
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

async function restoreRichTextComponent(
    richText: any,
    state: any,
    cc: any,
    warningPrefix: string,
): Promise<string[]> {
    const warnings: string[] = [];
    const { Font, Color } = cc;
    if (!richText || !state) return warnings;

    // Batch while disabled so Creator performs one layout with the final values.
    richText.enabled = false;
    richText.string = String(state.string || '');
    if (state.fontSize > 0) richText.fontSize = state.fontSize;
    if (state.lineHeight > 0) richText.lineHeight = state.lineHeight;
    if (typeof state.horizontalAlign !== 'undefined') richText.horizontalAlign = state.horizontalAlign;
    if (typeof state.verticalAlign !== 'undefined') richText.verticalAlign = state.verticalAlign;
    if (typeof state.maxWidth !== 'undefined') richText.maxWidth = Number(state.maxWidth) || 0;
    richText.useSystemFont = !!state.useSystemFont;
    if (typeof state.fontFamily === 'string') richText.fontFamily = state.fontFamily;
    if (typeof state.cacheMode !== 'undefined') richText.cacheMode = state.cacheMode;
    if (typeof state.handleTouchEvent !== 'undefined') richText.handleTouchEvent = state.handleTouchEvent;
    if (state.fontUuid) {
        const font = await loadAssetAny(cc.assetManager, state.fontUuid);
        if (font && (!Font || font instanceof Font)) {
            richText.font = font;
            richText.useSystemFont = false;
        } else {
            warnings.push(`${warningPrefix}字体还原失败：${state.fontUuid}`);
        }
    }
    const color = restoreColor(Color, state.color);
    if (color && typeof richText.fontColor !== 'undefined') richText.fontColor = color;
    richText.enabled = state.enabled !== false;
    return warnings;
}

function removeFtocRichTextRenderer(node: any, RichText: any): void {
    removeFtocRichTextShadow(node, RichText);
    const renderer = findFtocRichTextRendererNode(node, RichText);
    if (!renderer) return;
    renderer.active = false;
    if (typeof renderer.removeFromParent === 'function') renderer.removeFromParent();
    if (typeof renderer.destroy === 'function') renderer.destroy();
}

async function restoreRichTextRenderer(
    node: any,
    state: any,
    cc: any,
    rendererName = FTOC_RICH_TEXT_RENDERER_NAME,
): Promise<string[]> {
    const warnings: string[] = [];
    const { Node, UITransform, RichText, Vec3 } = cc;
    if (!state) return warnings;
    if (!Node || !UITransform || !RichText) {
        warnings.push(`目标节点「${node.name || node.uuid}」缺少 RichText 运行时能力，无法还原 ${rendererName}。`);
        return warnings;
    }

    let renderer = rendererName === FTOC_RICH_TEXT_SHADOW_NAME
        ? findFtocRichTextShadowNode(node, RichText)
        : findFtocRichTextRendererNode(node, RichText);
    if (!renderer) {
        renderer = new Node(rendererName);
        renderer.active = false;
        node.addChild(renderer);
    } else {
        renderer.active = false;
    }
    if (typeof state.layer === 'number') renderer.layer = state.layer;

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
        if (pos && typeof renderer.setPosition === 'function') renderer.setPosition(pos);
        const scale = makeVec3(Vec3, state.transform.scale, 1);
        if (scale && typeof renderer.setScale === 'function') renderer.setScale(scale);
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

export async function restoreReplaceSnapshot(node: any, snapshot: any, cc: any): Promise<string[]> {
    const warnings: string[] = [];
    const { UITransform, Label, RichText, Sprite, Font, Vec3, Color } = cc;
    if (!node || !snapshot) return ['缺少目标节点或 snapshot。'];

    const hasRendererSnapshot = Number(snapshot.version) >= 2 &&
        Object.prototype.hasOwnProperty.call(snapshot, 'richTextRenderer');
    const hasShadowRendererSnapshot = Number(snapshot.version) >= 3 &&
        Object.prototype.hasOwnProperty.call(snapshot, 'richTextShadowRenderer');
    if (hasRendererSnapshot) {
        const currentRenderer = findFtocRichTextRendererNode(node, RichText);
        if (snapshot.richTextRenderer) {
            if (currentRenderer) currentRenderer.active = false;
        } else {
            // The renderer was introduced by this pairing, so clearing the row
            // must return the authored node to its original Label-only topology.
            removeFtocRichTextRenderer(node, RichText);
        }
    }
    if (hasShadowRendererSnapshot) {
        const currentShadow = findFtocRichTextShadowNode(node, RichText);
        if (snapshot.richTextShadowRenderer) {
            if (currentShadow) currentShadow.active = false;
        } else {
            removeFtocRichTextShadow(node, RichText);
        }
    } else if (hasRendererSnapshot) {
        // v2 snapshots predate persistent RichText shadow; any current companion
        // was introduced after that baseline and must not survive a restore.
        removeFtocRichTextShadow(node, RichText);
    }

    if (typeof snapshot.active === 'boolean') node.active = snapshot.active;
    if (typeof snapshot.layer === 'number') node.layer = snapshot.layer;

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
        if (pos && typeof node.setPosition === 'function') node.setPosition(pos);
        const scale = makeVec3(Vec3, snapshot.transform.scale, 1);
        if (scale && typeof node.setScale === 'function') node.setScale(scale);
        node.angle = Number(snapshot.transform.angle) || 0;
    }

    if (node.parent && typeof node.setSiblingIndex === 'function' && Number(snapshot.siblingIndex) >= 0) {
        node.setSiblingIndex(Number(snapshot.siblingIndex));
    }

    if (snapshot.sprite) {
        const sprite = Sprite && node.getComponent ? node.getComponent(Sprite) : null;
        if (!sprite) {
            warnings.push(`目标节点「${node.name || node.uuid}」缺少 Sprite，无法还原图片状态。`);
        } else {
            sprite.enabled = snapshot.sprite.enabled !== false;
            if (typeof snapshot.sprite.type !== 'undefined') sprite.type = snapshot.sprite.type;
            if (typeof snapshot.sprite.sizeMode !== 'undefined') sprite.sizeMode = snapshot.sprite.sizeMode;
            if (typeof snapshot.sprite.trim !== 'undefined') sprite.trim = snapshot.sprite.trim;
            if (typeof snapshot.sprite.pixelsPerUnit === 'number' && snapshot.sprite.pixelsPerUnit > 0) {
                sprite.pixelsPerUnit = snapshot.sprite.pixelsPerUnit;
            }
            if (typeof snapshot.sprite.fillType !== 'undefined') sprite.fillType = snapshot.sprite.fillType;
            if (typeof snapshot.sprite.fillStart !== 'undefined') sprite.fillStart = snapshot.sprite.fillStart;
            if (typeof snapshot.sprite.fillRange !== 'undefined') sprite.fillRange = snapshot.sprite.fillRange;
            const color = restoreColor(Color, snapshot.sprite.color);
            if (color) sprite.color = color;
            const frame = await restoreSpriteFrameSnapshot(snapshot.sprite.spriteFrame, cc);
            if (frame) sprite.spriteFrame = frame;
        }
    }

    if (snapshot.label) {
        const label = Label && node.getComponent ? node.getComponent(Label) : null;
        if (!label) {
            warnings.push(`目标节点「${node.name || node.uuid}」缺少 Label，无法还原文字状态。`);
        } else {
            label.enabled = snapshot.label.enabled !== false;
            label.string = String(snapshot.label.string || '');
            if (snapshot.label.fontSize > 0) label.fontSize = snapshot.label.fontSize;
            if (snapshot.label.lineHeight > 0) label.lineHeight = snapshot.label.lineHeight;
            if (typeof snapshot.label.horizontalAlign !== 'undefined') label.horizontalAlign = snapshot.label.horizontalAlign;
            if (typeof snapshot.label.verticalAlign !== 'undefined') label.verticalAlign = snapshot.label.verticalAlign;
            if (typeof snapshot.label.overflow !== 'undefined') label.overflow = snapshot.label.overflow;
            if (typeof snapshot.label.enableWrapText !== 'undefined') label.enableWrapText = snapshot.label.enableWrapText;
            label.useSystemFont = !!snapshot.label.useSystemFont;
            if (snapshot.label.fontUuid) {
                const font = await loadAssetAny(cc.assetManager, snapshot.label.fontUuid);
                if (font && (!Font || font instanceof Font)) {
                    label.font = font;
                    label.useSystemFont = false;
                } else {
                    warnings.push(`字体还原失败：${snapshot.label.fontUuid}`);
                }
            }
            label.isBold = !!snapshot.label.isBold;
            label.isItalic = !!snapshot.label.isItalic;
            label.isUnderline = !!snapshot.label.isUnderline;
            if (typeof snapshot.label.spacingX !== 'undefined') label.spacingX = Number(snapshot.label.spacingX) || 0;
            if (typeof snapshot.label.cacheMode !== 'undefined') label.cacheMode = snapshot.label.cacheMode;
            const color = restoreColor(Color, snapshot.label.color);
            if (color) label.color = color;
            label.enableOutline = !!snapshot.label.enableOutline;
            const outlineColor = restoreColor(Color, snapshot.label.outlineColor);
            if (outlineColor) label.outlineColor = outlineColor;
            label.outlineWidth = Number(snapshot.label.outlineWidth) || 0;
            label.enableShadow = !!snapshot.label.enableShadow;
            const shadowColor = restoreColor(Color, snapshot.label.shadowColor);
            if (shadowColor) label.shadowColor = shadowColor;
            const shadowOffset = makeVec2(cc.Vec2, snapshot.label.shadowOffset);
            if (shadowOffset) label.shadowOffset = shadowOffset;
            label.shadowBlur = Number(snapshot.label.shadowBlur) || 0;
        }
    }

    if (snapshot.richText) {
        const richText = hasRendererSnapshot
            ? (RichText && node.getComponent ? node.getComponent(RichText) : null)
            : getLogicalRichText(node, RichText);
        if (!richText) {
            warnings.push(`目标节点「${node.name || node.uuid}」缺少 RichText，无法还原富文本状态。`);
        } else {
            warnings.push(...await restoreRichTextComponent(richText, snapshot.richText, cc, '富文本 '));
        }
    }

    if (hasRendererSnapshot && snapshot.richTextRenderer) {
        warnings.push(...await restoreRichTextRenderer(node, snapshot.richTextRenderer, cc));
    }
    if (hasShadowRendererSnapshot && snapshot.richTextShadowRenderer) {
        warnings.push(...await restoreRichTextRenderer(
            node,
            snapshot.richTextShadowRenderer,
            cc,
            FTOC_RICH_TEXT_SHADOW_NAME,
        ));
    }

    return warnings;
}

export function exportNodeTransform(
    node: any,
    w: number,
    h: number,
    parentW: number,
    parentH: number,
    isRoot: boolean,
    ui?: any,
): any {
    const p = readNodePosition(node);
    const s = readNodeScale(node);
    const rotation = -((typeof node.angle === 'number' ? node.angle : 0) || 0);
    const anchor = readUiAnchor(ui || (node && (node.uiTransform || node._uiTransform)));
    // Cocos position is the anchor location. Recover the transformed visual center
    // before converting back to Figma's normalized top-left coordinate contract.
    const centerOffset = visualCenterOffsetFromAnchor(
        w,
        h,
        anchor.x,
        anchor.y,
        s.x,
        s.y,
        Number(node && node.angle) || 0,
    );
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

function colorToFigmaPaint(c: any, fallback?: any): any {
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

export function buildFigmaDropShadowEffect(color: any, cocosOffset: any, blur: any): any {
    return {
        ...colorToFigmaPaint(color, { r: 0, g: 0, b: 0, a: 255 }),
        type: 'DROP_SHADOW',
        visible: true,
        offsetX: roundExportNumber(Number(cocosOffset && cocosOffset.x) || 0),
        offsetY: roundExportNumber(-(Number(cocosOffset && cocosOffset.y) || 0)),
        radius: roundExportNumber(Number(blur) || 0),
        spread: 0,
        blendMode: 'NORMAL',
    };
}

function colorToOverlayTint(c: any): string {
    if (!c) return '';
    const r = clamp255(c.r);
    const g = clamp255(c.g);
    const b = clamp255(c.b);
    if (r >= 254 && g >= 254 && b >= 254) return '';
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function defaultFigmaNode(node: any, type: string, transform: any): any {
    return {
        figmaId: `cocos:${node.uuid || node.name}`,
        name: node.name || type,
        type,
        ...transform,
        fills: [],
        strokes: [],
        strokeWeight: 1,
        strokeAlign: 'INSIDE',
        effects: [],
        blendMode: 'PASS_THROUGH',
        cornerRadius: 0,
        cornerRadii: [],
        opacity: 1,
        visible: node.active !== false,
        clipsContent: false,
        layoutMode: '',
        layoutWrap: 'NO_WRAP',
        itemSpacing: 0,
        counterAxisSpacing: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        primaryAxisAlignItems: '',
        counterAxisAlignItems: '',
        characters: '',
        fontSize: 0,
        fontFamily: '',
        fontWeight: '',
        textStyleName: '',
        textStyleId: '',
        fillStyleName: '',
        fillStyleId: '',
        strokeStyleName: '',
        strokeStyleId: '',
        effectStyleName: '',
        effectStyleId: '',
        textAlignHorizontal: '',
        textAlignVertical: '',
        lineHeight: 0,
        letterSpacing: 0,
        textAutoResize: '',
        textTruncation: '',
        textDecoration: '',
        textCase: '',
        imageBase64: '',
        imageRef: '',
        componentType: '',
        componentProperties: {},
        slice9Border: null,
        layoutPositioning: 'AUTO',
        constraints: { horizontal: 'LEFT', vertical: 'TOP' },
        children: [],
    };
}

function internExportImage(ctx: ExportContext, base64: string): string {
    if (!base64) return '';
    const existing = ctx.imageIdByContent[base64];
    if (existing) return existing;
    const id = `img${ctx.imageCounter++}`;
    ctx.images[id] = base64;
    ctx.imageIdByContent[base64] = id;
    ctx.stats.images++;
    return id;
}

function safeFigmaAssetFolderName(name: string): string {
    return (name || 'untitled').replace(/[^\w一-龥-]/g, '_');
}

export async function queryAssetUrlByUuid(uuid: string): Promise<string> {
    if (!uuid) return '';
    const candidates = [uuid, uuid.split('@')[0]].filter((value, index, all) => value && all.indexOf(value) === index);
    for (const candidate of candidates) {
        try {
            const url = await Editor.Message.request('asset-db', 'query-asset-url', candidate);
            if (typeof url === 'string' && url) return url;
        } catch {
            // Creator may reject a SpriteFrame sub-asset UUID while accepting its image UUID.
        }
    }
    return '';
}

export function dbUrlToAssetPathForExport(dbUrl: string, projectPath?: string): string {
    if (!dbUrl || !dbUrl.startsWith('db://assets/')) return '';
    const root = projectPath || ((Editor as any).Project && (Editor as any).Project.path);
    if (!root) return '';
    const clean = dbUrl.split('@')[0];
    return join(root, 'assets', clean.slice('db://assets/'.length));
}

export function buildExportImageSearchDirs(projectPath: string, rootName: string, interfaceRootName: string): string[] {
    const figmaRoot = join(projectPath, 'assets', 'figma');
    const names = [interfaceRootName, rootName]
        .map((name) => safeFigmaAssetFolderName(name || ''))
        .filter((name, index, all) => name && name !== 'untitled' && all.indexOf(name) === index);
    return [...names.map((name) => join(figmaRoot, name)), figmaRoot];
}

function fileUrlToPath(url: string): string {
    if (!url || !url.startsWith('file://')) return '';
    try {
        return decodeURIComponent(url.replace(/^file:\/\//, ''));
    } catch {
        return '';
    }
}

function spriteFrameUuid(spriteFrame: any): string {
    return String(
        spriteFrame && (
            spriteFrame.uuid ||
            spriteFrame._uuid ||
            spriteFrame._id ||
            spriteFrame._nativeAsset && spriteFrame._nativeAsset.uuid
        ) || ''
    );
}

function spriteFrameNativeCandidates(spriteFrame: any): string[] {
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

function spriteFrameName(spriteFrame: any): string {
    return String(spriteFrame && (spriteFrame.name || spriteFrame._name) || '').replace(/\.(png|jpg|jpeg)$/i, '');
}

function findFigmaImageBySpriteName(spriteFrame: any, ctx: ExportContext): string {
    const name = spriteFrameName(spriteFrame);
    if (!name) return '';
    const candidates = [`${name}.png`, `${name}.jpg`, `${name}.jpeg`];
    for (const dir of ctx.imageSearchDirs || []) {
        for (const file of candidates) {
            const p = join(dir, file);
            if (existsSync(p)) return p;
        }
    }
    return '';
}

function resolveNativeUrlToAssetPath(url: string): string {
    if (!url) return '';
    if (url.startsWith('db://assets/')) return dbUrlToAssetPathForExport(url);
    if (url.startsWith('file://')) return fileUrlToPath(url);
    if (url.startsWith('/')) return url.split('@')[0];
    const projectPath = (Editor as any).Project && (Editor as any).Project.path;
    if (projectPath && url.startsWith('assets/')) return join(projectPath, url);
    return '';
}

function spriteFrameCropRect(spriteFrame: any): any | null {
    const rect = readSpriteFrameRect(spriteFrame);
    const texture = spriteFrame && (spriteFrame.texture || spriteFrame._texture);
    const rawW = texture && Number(texture.width) || rect && rect.width || 0;
    const rawH = texture && Number(texture.height) || rect && rect.height || 0;
    if (!rect || rawW <= 0 || rawH <= 0) return null;
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

async function readSpriteFrameImage(spriteFrame: any, ctx: ExportContext): Promise<{ imageRef: string; imageName: string; cropRect?: any }> {
    if (!spriteFrame) return { imageRef: '', imageName: '' };

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
        if (filePath) assetUrl = filePath;
    }
    if (!filePath || !existsSync(filePath)) {
        ctx.stats.missingImages++;
        const name = spriteFrame.name || spriteFrame._name || spriteFrameUuid(spriteFrame) || '(unknown spriteFrame)';
        ctx.warnings.push(`读不到 SpriteFrame 源图：${name}`);
        return { imageRef: '', imageName: '' };
    }

    try {
        const base64 = readFileSync(filePath).toString('base64');
        const imageRef = internExportImage(ctx, base64);
        const imageName = basename(filePath);
        const cropRect = spriteFrameCropRect(spriteFrame);
        return cropRect ? { imageRef, imageName, cropRect } : { imageRef, imageName };
    } catch (err: any) {
        ctx.stats.missingImages++;
        ctx.warnings.push(`读取图片失败：${assetUrl || filePath} (${err && err.message || err})`);
        return { imageRef: '', imageName: '' };
    }
}

function exportSpriteBorder(spriteFrame: any): Slice9Border | null {
    if (!spriteFrame) return null;
    const border = {
        left: Number(spriteFrame.insetLeft ?? spriteFrame.borderLeft ?? spriteFrame._insetLeft) || 0,
        right: Number(spriteFrame.insetRight ?? spriteFrame.borderRight ?? spriteFrame._insetRight) || 0,
        top: Number(spriteFrame.insetTop ?? spriteFrame.borderTop ?? spriteFrame._insetTop) || 0,
        bottom: Number(spriteFrame.insetBottom ?? spriteFrame.borderBottom ?? spriteFrame._insetBottom) || 0,
    };
    return border.left || border.right || border.top || border.bottom ? border : null;
}

function spriteTypeName(sprite: any, Sprite: any): string {
    const t = sprite && sprite.type;
    if (Sprite && Sprite.Type) {
        if (t === Sprite.Type.SLICED) return 'SLICED';
        if (t === Sprite.Type.TILED) return 'TILED';
    }
    return '';
}

async function exportSprite(nodeData: any, sprite: any, ctx: ExportContext): Promise<void> {
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
    if (!image.imageRef) return;

    const fill: any = {
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
    if (image.cropRect) fill.cropRect = image.cropRect;
    nodeData.fills = [fill];
    nodeData.imageName = image.imageName;

    const tint = colorToOverlayTint(sprite.color);
    if (tint) nodeData.overlayTint = tint;
}

function exportGraphics(nodeData: any, graphics: any, ctx: ExportContext): void {
    const color = graphics && graphics.fillColor;
    if (!color) return;
    nodeData.type = 'RECTANGLE';
    nodeData.fills = [colorToFigmaPaint(color)];
    ctx.stats.solidFills++;
}

function mapHAlignToFigma(Label: any, value: number): string {
    if (Label && Label.HorizontalAlign) {
        if (value === Label.HorizontalAlign.CENTER) return 'CENTER';
        if (value === Label.HorizontalAlign.RIGHT) return 'RIGHT';
    }
    return 'LEFT';
}

function mapVAlignToFigma(Label: any, value: number): string {
    if (Label && Label.VerticalAlign) {
        if (value === Label.VerticalAlign.CENTER) return 'CENTER';
        if (value === Label.VerticalAlign.BOTTOM) return 'BOTTOM';
    }
    return 'TOP';
}

function decodeBasicHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function richTextToPlain(text: string): string {
    return decodeBasicHtmlEntities(String(text || '')
        .replace(/<br\s*\/?>/ig, '\n')
        .replace(/<\/?[^>]+>/g, ''));
}

function parseFontForFigma(label: any): { family: string; weight: string } {
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

function readRichTextCompanionShadow(richText: any, RichText: any): any | null {
    const mainNode = richText && richText.node;
    const authoredNode = mainNode && mainNode.parent;
    if (!isFtocRichTextRendererNode(mainNode) || !authoredNode) return null;
    const shadowNode = findFtocRichTextShadowNode(authoredNode, RichText);
    const shadowRichText = shadowNode && shadowNode.getComponent ? shadowNode.getComponent(RichText) : null;
    if (!componentEnabled(shadowRichText) || shadowNode.active === false) return null;
    const mainPosition = readNodePosition(mainNode);
    const shadowPosition = readNodePosition(shadowNode);
    return {
        color: snapshotColor(shadowRichText.fontColor || shadowRichText.color),
        offsetX: shadowPosition.x - mainPosition.x,
        offsetY: -(shadowPosition.y - mainPosition.y),
        blur: 0,
    };
}

function exportLabel(nodeData: any, label: any, rich: boolean, ctx: ExportContext): void {
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
    } else if (!rich && Label && Label.Overflow && label.overflow === Label.Overflow.CLAMP) {
        nodeData.textAutoResize = 'TRUNCATE';
        nodeData.textTruncation = 'DISABLED';
    } else {
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

function exportConstraints(widget: any): any | null {
    if (!componentEnabled(widget)) return null;
    let horizontal = 'LEFT';
    let vertical = 'TOP';
    if (widget.isAlignLeft && widget.isAlignRight) horizontal = 'LEFT_RIGHT';
    else if (widget.isAlignRight) horizontal = 'RIGHT';
    else if (widget.isAlignHorizontalCenter) horizontal = 'CENTER';

    if (widget.isAlignTop && widget.isAlignBottom) vertical = 'TOP_BOTTOM';
    else if (widget.isAlignBottom) vertical = 'BOTTOM';
    else if (widget.isAlignVerticalCenter) vertical = 'CENTER';
    return { horizontal, vertical };
}

async function exportMaskInfo(maskNode: any, parentW: number, parentH: number, ctx: ExportContext): Promise<any> {
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

async function exportNodeToFigma(
    node: any,
    parentW: number,
    parentH: number,
    isRoot: boolean,
    ctx: ExportContext,
    selectedFilter?: Set<string> | null,
    ancestorFilter?: Set<string> | null
): Promise<any> {
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
    if (constraints) nodeData.constraints = constraints;

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
    } else if (componentEnabled(richText)) {
        exportLabel(nodeData, richText, true, ctx);
    } else if (componentEnabled(sprite)) {
        await exportSprite(nodeData, sprite, ctx);
    } else if (componentEnabled(graphics)) {
        exportGraphics(nodeData, graphics, ctx);
    }

    const children = node.children || [];
    for (const child of children) {
        if (isFtocTextHelperNode(child) || isCreatorRichTextRuntimeNode(child)) continue;
        let childSelected = false;
        let childIsAncestor = false;
        if (selectedFilter) {
            childSelected = selectedFilter.has(child.uuid);
            childIsAncestor = !!ancestorFilter && ancestorFilter.has(child.uuid);
            if (!childSelected && !childIsAncestor) continue;
        }
        const childMask = child.getComponent && child.getComponent(Mask);
        const isImageMask = componentEnabled(childMask) &&
            childMask.type !== Mask.Type.GRAPHICS_RECT &&
            !nodeData.mask;
        if (isImageMask) {
            const maskNodeData = await exportNodeToFigma(
                child,
                size.width,
                size.height,
                false,
                ctx,
                childSelected ? null : selectedFilter,
                childSelected ? null : ancestorFilter
            );
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
        nodeData.children.push(await exportNodeToFigma(
            child,
            size.width,
            size.height,
            false,
            ctx,
            childSelected ? null : selectedFilter,
            childSelected ? null : ancestorFilter
        ));
    }

    return nodeData;
}

function findNodeByUuid(node: any, uuid: string): any {
    if (!node || !uuid) return null;
    if (node.uuid === uuid) return node;
    for (const child of (node.children || [])) {
        const found = findNodeByUuid(child, uuid);
        if (found) return found;
    }
    return null;
}

function findFirstNodeByName(node: any, name: string): any {
    if (!node || !name) return null;
    if (node.name === name) return node;
    for (const child of (node.children || [])) {
        const found = findFirstNodeByName(child, name);
        if (found) return found;
    }
    return null;
}

function buildSceneNodePath(node: any): string {
    const parts: string[] = [];
    let cur = node;
    while (cur && cur.name) {
        parts.unshift(cur.name);
        cur = cur.parent;
    }
    return parts.join('/');
}

function buildRelativeNodePath(node: any, root: any): string {
    const parts: string[] = [];
    let cur = node;
    while (cur && cur !== root) {
        if (cur.name) parts.unshift(cur.name);
        cur = cur.parent;
    }
    if (root && root.name) parts.unshift(root.name);
    return parts.join('/');
}

function readComponentName(component: any): string {
    return String(component && (
        component.constructor && component.constructor.name ||
        component.__classname__ ||
        component.name ||
        ''
    ) || '');
}

function getUiAncestorPath(node: any, UITransform: any, includeSelf: boolean): any[] {
    const path: any[] = [];
    let cur = includeSelf ? node : node && node.parent;
    while (cur) {
        if (cur.getComponent && cur.getComponent(UITransform)) path.push(cur);
        cur = cur.parent;
    }
    return path.reverse();
}

function findCommonUiAncestor(nodes: any[], UITransform: any): any {
    if (!nodes || nodes.length === 0) return null;
    let common = getUiAncestorPath(nodes[0], UITransform, true);
    for (let i = 1; i < nodes.length; i++) {
        const path = getUiAncestorPath(nodes[i], UITransform, true);
        let len = 0;
        const max = Math.min(common.length, path.length);
        while (len < max && common[len] === path[len]) len++;
        common = common.slice(0, len);
    }
    return common.length > 0 ? common[common.length - 1] : null;
}

function findInterfaceRoot(node: any, canvas: any, UITransform: any): any {
    if (!node) return null;
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

function collectAncestorUuidSet(selectedNodes: any[], root: any): Set<string> {
    const ancestors = new Set<string>();
    for (const selected of selectedNodes) {
        let cur = selected && selected.parent;
        while (cur) {
            ancestors.add(cur.uuid);
            if (cur === root) break;
            cur = cur.parent;
        }
    }
    return ancestors;
}

function findDefaultExportRoot(scene: any, find: any, UITransform: any): any {
    const canvas = find('Canvas') || scene.getChildByName('Canvas');
    const candidates = canvas ? (canvas.children || []) : (scene.children || []);
    for (let i = candidates.length - 1; i >= 0; i--) {
        const child = candidates[i];
        if (!child || child.name === 'Camera') continue;
        if (child.getComponent && child.getComponent(UITransform)) return child;
    }
    return canvas || scene;
}

function collectSceneNodeStats(root: any, cc: any): any {
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
    const visit = (node: any) => {
        if (!node) return;
        stats.nodes++;
        if (UITransform && node.getComponent && node.getComponent(UITransform)) stats.uiTransforms++;
        if (Sprite && node.getComponent) {
            const sprite = node.getComponent(Sprite);
            if (sprite) {
                stats.sprites++;
                if (!sprite.spriteFrame && !sprite._spriteFrame) stats.nullSpriteFrames++;
            }
        }
        if (Label && node.getComponent && node.getComponent(Label)) stats.labels++;
        if (RichText && node.getComponent && node.getComponent(RichText)) stats.richTexts++;
        if (Mask && node.getComponent && node.getComponent(Mask)) stats.masks++;
        if (Button && node.getComponent && node.getComponent(Button)) stats.buttons++;
        for (const child of (node.children || [])) visit(child);
    };
    visit(root);
    return stats;
}

function selectEditorNode(node: any): void {
    try {
        const selection = (Editor as any).Selection;
        if (selection && typeof selection.select === 'function' && node && node.uuid) {
            selection.select('node', node.uuid);
        }
    } catch {
        // Selection feedback is nice-to-have only.
    }
}

function findPrefabSourceNode(scene: any, find: any, UITransform: any, options: any): any {
    let root = options && options.rootUuid ? findNodeByUuid(scene, String(options.rootUuid)) : null;
    if (!root && options && options.rootName) root = findFirstNodeByName(scene, String(options.rootName));
    if (!root) root = findDefaultExportRoot(scene, find, UITransform);
    return root;
}

function createPrefabAssetFromNode(cc: any, source: any, prefabName: string): any {
    const { Prefab, instantiate } = cc;
    const cleanName = sanitizeCocosNodeName(prefabName, source.name || 'FigmaPrefab');
    const prefabUtils = (Editor as any).require ? (Editor as any).require('scene://utils/prefab') : null;

    const clone = instantiate(source);
    clone.parent = null;
    clone.name = cleanName;

    if (prefabUtils && typeof prefabUtils.checkAndStripNode === 'function') {
        try {
            prefabUtils.checkAndStripNode(clone, true);
        } catch {
            // Some Creator builds throw for unsupported editor-only state; the clone still serializes.
        }
    }

    if (prefabUtils
        && typeof prefabUtils.createPrefabFrom === 'function'
        && typeof prefabUtils.createAppliedPrefab === 'function') {
        prefabUtils.createPrefabFrom(clone);
        if (typeof prefabUtils.setPrefabSync === 'function') prefabUtils.setPrefabSync(clone, true);
        const applied = prefabUtils.createAppliedPrefab(clone);
        if (applied) {
            applied.name = cleanName;
            if (applied.data) applied.data.name = cleanName;
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

function loadPrefabAsset(assetManager: any, uuid: string): Promise<any> {
    return loadAssetAny(assetManager, uuid, 10, 100).then((asset) => {
        if (!asset) throw new Error(`Prefab asset not ready: ${uuid}`);
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
function getNodeByPath(root: any, figmaPath: string): any {
    if (!root) return null;
    const segs = String(figmaPath || '').split('/').map((s) => s.trim()).filter((s) => s.length > 0);
    if (segs.length === 0) return null;
    let cursor = root;
    let matched = true;
    for (const seg of segs) {
        if (!cursor || typeof cursor.getChildByName !== 'function') { matched = false; break; }
        const next = cursor.getChildByName(seg);
        if (!next) { matched = false; break; }
        cursor = next;
    }
    if (matched) return cursor;
    // 回退：美术只存了单个样式 Label（root 即叶子），路径末段名与 root 名一致时用 root。
    if (String(root._name || root.name || '') === segs[segs.length - 1]) return root;
    // Legacy indexes may only retain childName. Resolve it recursively only
    // when unique; duplicate names are ambiguous and must not inherit scripts.
    if (segs.length === 1) {
        const hits: any[] = [];
        const visit = (node: any): void => {
            for (const child of (node && node.children || [])) {
                if (String(child && (child._name || child.name) || '') === segs[0]) hits.push(child);
                if (hits.length <= 1) visit(child);
            }
        };
        visit(root);
        if (hits.length === 1) return hits[0];
    }
    return null;
}

/** Legacy/manual indexes may carry only childName; keep that configured leaf reachable. */
export function resolveTextStyleTemplatePath(template: any): string {
    const figmaPath = String(template && template.figmaPath || '').trim();
    if (figmaPath) return figmaPath;
    return String(template && template.childName || '').trim();
}

/** @zh 只有精确命中的普通 Label 才继承模板组件；Fuzzy 继续走数值降级，避免误挂行为脚本。 */
export function shouldCloneExactTextStyleTemplate(figmaNode: any): boolean {
    const template = figmaNode && figmaNode.textStyleTemplate;
    return String(figmaNode && figmaNode.type || '').toUpperCase() === 'TEXT'
        && !hasMixedTextSegments(figmaNode)
        && String(template && template.tier || '').trim().toUpperCase() === 'EXACT'
        && !!String(template && template.prefabUuid || '')
        && !!resolveTextStyleTemplatePath(template);
}

/** @zh 收集需要在建树前加载的 Exact 文字模板 Prefab，保证 buildNode 内可同步克隆完整组件。 */
export function collectExactTextStyleTemplateUuids(root: any): string[] {
    const uuids = new Set<string>();
    const visit = (node: any): void => {
        if (!node) return;
        if (shouldCloneExactTextStyleTemplate(node)) {
            uuids.add(String(node.textStyleTemplate.prefabUuid));
        }
        for (const child of (node.children || [])) visit(child);
    };
    visit(root);
    return Array.from(uuids);
}

function stripPrefabState(node: any): void {
    if (!node) return;
    let stripped = false;
    try {
        const prefabUtils = (Editor as any).require ? (Editor as any).require('scene://utils/prefab') : null;
        if (prefabUtils && typeof prefabUtils.checkAndStripNode === 'function') {
            prefabUtils.checkAndStripNode(node, true);
            stripped = true;
        }
    } catch {
        // Creator versions expose different editor helpers; the runtime fallback below keeps the clone scene-owned.
    }
    if (!stripped && Object.prototype.hasOwnProperty.call(node, '_prefab')) node._prefab = null;
    const components = Array.isArray(node.components)
        ? node.components
        : (Array.isArray(node._components) ? node._components : []);
    for (const component of components) {
        if (component && Object.prototype.hasOwnProperty.call(component, '__prefab')) component.__prefab = null;
    }
}

/**
 * @zh 对齐 Unity CopyComponent + CopyExtraStyleComponents：克隆模板文字叶节点，保留 Label、材质和同节点附加脚本。
 *     模板子节点不属于文字样式组件契约，克隆后移除；Cocos instantiate 会重映射同一克隆图内的组件引用。
 */
export function cloneExactTextStyleTemplateNode(figmaNode: any, templateRoot: any, cc: any): any {
    if (!shouldCloneExactTextStyleTemplate(figmaNode) || !templateRoot || !cc) return null;
    const { Label, instantiate } = cc;
    if (!Label || typeof instantiate !== 'function') return null;
    const template = figmaNode.textStyleTemplate;
    const sourceNode = getNodeByPath(templateRoot, resolveTextStyleTemplatePath(template));
    if (!sourceNode || !sourceNode.getComponent || !sourceNode.getComponent(Label)) return null;

    let clone: any = null;
    try {
        clone = instantiate(sourceNode);
    } catch (error: any) {
        console.warn('[figma-importer:scene] Exact 文字模板节点克隆失败:', error && error.message || error);
        return null;
    }
    if (!clone || !clone.getComponent || !clone.getComponent(Label)) {
        if (clone && typeof clone.destroy === 'function') clone.destroy();
        return null;
    }

    stripPrefabState(clone);
    for (const child of [...(clone.children || [])]) {
        if (typeof child.removeFromParent === 'function') child.removeFromParent();
        if (typeof child.destroy === 'function') child.destroy();
    }
    // Keep edit-mode scripts dormant until authored Figma text/layout properties are applied.
    clone.active = false;
    return clone;
}

export function finalizeExactTextStyleTemplateNode(node: any, visible: any): void {
    if (node) node.active = visible !== false;
}

/** A queued component-state target stays dormant until the editor facade finishes. */
export function shouldFinalizeExactTextStyleTemplateNode(
    exactTextTemplateClone: any,
    stateQueued: boolean,
): boolean {
    return !!exactTextTemplateClone && !stateQueued;
}

/**
 * @zh 把模板 Label 的「外观」拷到目标 Label（环4 整组件克隆的 Cocos 版）。
 *     只拷外观维度：字体/加粗/斜体/描边/投影/自定义材质；不动目标的 string/字号/颜色/对齐/尺寸。
 *     字号/颜色随导入节点，外观随模板——对齐 Unity「text/字号/颜色随节点覆盖，其余克隆」。
 */
function copyLabelAppearance(src: any, dst: any, Font: any): boolean {
    if (!src || !dst) return false;
    try {
        // 字体
        if (src.font && (!Font || src.font instanceof Font)) {
            dst.font = src.font;
            dst.useSystemFont = false;
        } else {
            dst.useSystemFont = src.useSystemFont;
            if (src.fontFamily) dst.fontFamily = src.fontFamily;
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
        if (src.customMaterial) dst.customMaterial = src.customMaterial;
        return true;
    } catch (e) {
        console.warn('[figma-importer:scene] 拷贝模板 Label 外观失败:', (e as any) && (e as any).message || e);
        return false;
    }
}

export type RichTextFontSource = 'template' | 'resolver' | 'missing';

export function resolveRichTextFontReference(figmaNode: any, template: any): { uuid: string; fileName: string } {
    return {
        uuid: String((figmaNode && figmaNode.fontUuid) || (template && template.fontUuid) || ''),
        fileName: String((figmaNode && figmaNode.fontFileName) || (template && template.fontFileName) || ''),
    };
}

/** @zh RichText 只继承模板字体；模板仍是系统字体时改用 main 已解析的工程字体。 */
export async function applyRichTextFont(
    target: any,
    templateLabel: any,
    resolverFontUuid: string,
    loadFont: (uuid: string) => Promise<any>,
    Font: any,
): Promise<RichTextFontSource> {
    if (!target) return 'missing';
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

function serializeEditorObject(target: any, options: any): any {
    const g = globalThis as any;
    const candidates = [
        (Editor as any).serialize,
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

interface FigmaBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

/** @zh 取 Figma 节点在父坐标里的视觉包围盒；镜像/旋转优先用 relativeTransform。 */
function figmaBounds(node: any): FigmaBounds {
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
export function isFillParent(node: any, parent: any): boolean {
    if (!parent) return false;
    // Figma often wraps TEXT in a same-sized "文字样式" auto-layout frame. That
    // is style organization, not a request for the Label to stretch like a background.
    if (node && node.type === 'TEXT') return false;
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
function hasLayout(node: any): boolean {
    return node.layoutMode === 'VERTICAL' || node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'GRID';
}

/** @zh Wrap 换行布局。端口 IsWrapLayout(208)。 */
function isWrapLayout(node: any): boolean {
    return hasLayout(node) && node.layoutWrap === 'WRAP';
}

/** @zh 绝对定位子节点。端口 IsAbsolutePositioned(209)。 */
function isAbsolutePositioned(node: any): boolean {
    return node.layoutPositioning === 'ABSOLUTE';
}

/** @zh 真正参与布局的子节点数：排除绝对定位/填满父级。端口 LayoutParticipatingChildCount(480)。 */
function layoutParticipatingChildCount(node: any): number {
    const children = node.children || [];
    let n = 0;
    for (const c of children) {
        if (!isAbsolutePositioned(c) && !isFillParent(c, node)) n++;
    }
    return n;
}

/** @zh Wrap 布局里参与布局的子节点尺寸是否基本一致（容差 4px）。端口 WrapChildrenAreUniform(511)。 */
function wrapChildrenAreUniform(node: any): boolean {
    const children = node.children || [];
    let any = false;
    let minW = Infinity, maxW = -Infinity, minH = Infinity, maxH = -Infinity;
    for (const c of children) {
        if (isAbsolutePositioned(c) || isFillParent(c, node)) continue;
        any = true;
        const w = c.width || 0, h = c.height || 0;
        if (w < minW) minW = w;
        if (w > maxW) maxW = w;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
    }
    if (!any) return true;
    return (maxW - minW) <= LAYOUT_TOL && (maxH - minH) <= LAYOUT_TOL;
}

/**
 * @zh 是否真的需要给该容器挂 LayoutGroup：声明 Auto Layout 且参与布局子节点 ≥ 2，
 *     且非「异构 Wrap」。端口 EffectiveHasLayout(498)。
 *     注：此判定决定子节点走哪条定位分支；是否真的挂 cc.Layout 组件另见 shouldMountLayout。
 */
function effectiveHasLayout(node: any): boolean {
    if (!hasLayout(node)) return false;
    if (layoutParticipatingChildCount(node) < 2) return false;
    if (isWrapLayout(node) && !wrapChildrenAreUniform(node)) return false;
    return true;
}

/**
 * @zh 容器是否「纯净」：所有子节点都参与布局（无 ABSOLUTE 定位、无填满父级背景）。
 *     cc.Layout 会卷入所有 active 子节点排布，无 Unity LayoutElement.ignoreLayout 等价开关，
 *     故混入非布局子节点的容器不能挂 cc.Layout（否则背景/绝对定位节点被排乱），回退绝对坐标。
 */
function layoutContainerIsClean(node: any): boolean {
    const kids = node.children || [];
    for (const c of kids) {
        if (isAbsolutePositioned(c)) return false;
        if (isFillParent(c, node)) return false;
    }
    return true;
}

/**
 * @zh 最终是否给本节点挂 cc.Layout 组件：EffectiveHasLayout + 可安全映射的 GRID + 纯净。
 */
function shouldMountLayout(node: any): boolean {
    if (!effectiveHasLayout(node) || !layoutContainerIsClean(node)) return false;
    if (node.layoutMode === 'GRID') return !!inferNativeGridLayout(node);
    if (!isWrapLayout(node)) return true;
    return !!inferWrapGridLayout(node);
}

/** @zh AutoLayout 父容器下子节点是否应忽略布局（绝对定位/填满父级）。端口 ShouldIgnoreLayout(536)。 */
function shouldIgnoreLayout(node: any, parentHasLayout: boolean, parent: any): boolean {
    if (!parentHasLayout) return false;
    if (isAbsolutePositioned(node)) return true;
    if (isFillParent(node, parent)) return true;
    return false;
}

/** @zh 节点是否有非默认约束（需 constraint-driven 锚点，即挂 Widget）。端口 HasStretchConstraint(802)。 */
function hasStretchConstraint(node: any): boolean {
    const c = node.constraints;
    if (!c) return false;
    const h = c.horizontal, v = c.vertical;
    const hNonDefault = !!h && h !== 'LEFT';
    const vNonDefault = !!v && v !== 'TOP';
    return hNonDefault || vNonDefault;
}

/**
 * @zh 子节点尺寸略超父节点时裁到父边界（原地改 w/h）。端口 ClampOverflowToParent(570)。
 *     Auto-Width 文本无条件收进父内容区（防换字体后变宽压邻节点）。
 */
function clampOverflowToParent(node: any, parent: any, fillsParent: boolean,
    parentHasLayout: boolean, ignore: boolean): void {
    if (!parent) return;
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
        } else if (node.width > innerW && (node.width - innerW) <= LAYOUT_TOL) {
            node.width = innerW;
        }
        if (node.height > innerH && (node.height - innerH) <= LAYOUT_TOL) {
            node.height = innerH;
        }
    } else {
        const rightOverflow = (node.x + node.width) - (parent.width || 0);
        const bottomOverflow = (node.y + node.height) - (parent.height || 0);
        const nearLeftOrigin = Math.abs(node.x || 0) < FILL_ORIGIN_TOL;
        const nearTopOrigin = Math.abs(node.y || 0) < FILL_ORIGIN_TOL;
        if (nearLeftOrigin && rightOverflow > 0 && rightOverflow <= LAYOUT_TOL) node.width -= rightOverflow;
        if (nearTopOrigin && bottomOverflow > 0 && bottomOverflow <= LAYOUT_TOL) node.height -= bottomOverflow;
    }
}

export const methods: { [key: string]: (...args: any[]) => any } = {
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
                revision: stateClass && Number((stateClass as any).ftocRuntimeRevision) || 0,
            },
        };
    },

    /** @zh 读取指定场景节点的 Figma 组件身份，供 Assign Prefab 面板使用。 */
    describeComponentMappingSelection(nodeUuid?: string) {
        try {
            const cc = require('cc');
            const scene = cc.director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const uuid = String(nodeUuid || '').trim();
            if (!uuid) {
                return { success: true, data: { status: 'none', reason: 'no-selection', nodeUuid: '' } };
            }
            const node = findNodeByUuid(scene, uuid);
            if (!node) {
                return { success: true, data: { status: 'none', reason: 'selection-stale', nodeUuid: uuid } };
            }
            return { success: true, data: describeFigmaComponentSelection(node, cc) };
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    applyComponentStates(items: MappedComponentStateRequest[]) {
        try {
            const cc = require('cc');
            const scene = cc.director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const requests = Array.isArray(items)
                ? items.filter((item) => !!(item && item.nodeUuid))
                : [];
            let attached = 0;
            let mounted = 0;
            let overrideTotal = 0;
            let unavailable = 0;
            let overrideMissing = 0;
            let activated = 0;
            const failures: Array<{ nodeUuid: string; status: string }> = [];

            for (const request of requests) {
                if (request && request.requiresPrefabOverride) overrideTotal++;
                const node = findNodeByUuid(scene, String(request && request.nodeUuid || ''));
                if (!node) {
                    unavailable++;
                    failures.push({ nodeUuid: String(request && request.nodeUuid || ''), status: 'node-missing' });
                    continue;
                }
                const status = applyComponentState(node, request, cc);
                if (node.active === (request.active !== false)) activated++;
                if (status === 'attached') {
                    attached++;
                    if (request.requiresPrefabOverride) mounted++;
                } else {
                    unavailable++;
                    if (status === 'override-missing') overrideMissing++;
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
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * Restore only authored active flags after a failed component-apply pass.
     * This is intentionally separate from state writes so a recovery cannot
     * claim that a missing component was persisted.
     */
    restoreComponentStateActivity(items: MappedComponentStateRequest[]) {
        try {
            const cc = require('cc');
            const scene = cc.director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const requests = Array.isArray(items)
                ? items.filter((item) => !!(item && item.nodeUuid))
                : [];
            let activated = 0;
            const failures: Array<{ nodeUuid: string; status: string }> = [];
            for (const request of requests) {
                const node = findNodeByUuid(scene, String(request.nodeUuid));
                if (!node) {
                    failures.push({ nodeUuid: request.nodeUuid, status: 'node-missing' });
                    continue;
                }
                node.active = request.active !== false;
                if (node.active === (request.active !== false)) activated++;
                else failures.push({ nodeUuid: request.nodeUuid, status: 'active-write-failed' });
            }
            return {
                success: true,
                data: {
                    total: requests.length,
                    activated,
                    failures,
                },
            };
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /** @deprecated Compatibility alias for clients using the old mapped-only name. */
    applyMappedComponentStates(items: MappedComponentStateRequest[]) {
        return methods.applyComponentStates(items);
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
        } catch (error: any) {
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
    async buildTextStyleRoot(data: any) {
        try {
            const cc = require('cc');
            const { director, Node, UITransform, Label, Color, Vec2, find } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };

            const entries: any[] = Array.isArray(data && data.entries) ? data.entries : [];
            if (entries.length === 0) return { success: false, error: 'No entries' };

            const rootName = sanitizeCocosNodeName(data && data.rootName, 'TextStyles');
            const canvas = find('Canvas') || scene.getChildByName('Canvas');
            const parentNode = canvas || scene;

            // 若已存在同名旧模板根，先移除，避免叠加重复。
            const existing = parentNode.getChildByName(rootName);
            if (existing) existing.destroy();

            const root = new Node(rootName);
            root.addComponent(UITransform);
            parentNode.addChild(root);

            const ensureChild = (parent: any, segName: string): any => {
                const safeSegmentName = sanitizeCocosNodeName(segName);
                const found = parent.getChildByName(safeSegmentName);
                if (found) return found;
                const child = new Node(safeSegmentName);
                child.addComponent(UITransform);
                parent.addChild(child);
                return child;
            };

            let leafCount = 0;
            for (const entry of entries) {
                const figmaPath = String(entry.figmaPath || '').trim();
                if (!figmaPath) continue;
                const segs = figmaPath.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
                if (segs.length === 0) continue;

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
                if (col) label.color = new Color(col.r, col.g, col.b, col.a == null ? 255 : col.a);

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
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * @en Create one empty node under the current scene root.
     * @zh 在当前场景根下建一个空节点。
     */
    createEmptyNode(name: string) {
        try {
            const { director, Node } = require('cc');
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const node = new Node(sanitizeCocosNodeName(name));
            scene.addChild(node);
            return { success: true, data: { uuid: node.uuid, name: node.name } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /**
     * @en Build the whole node tree (stage 2: position/size + image sprites).
     * @zh 建整棵节点树（阶段 2：坐标尺寸 + 图片精灵）。
     */
    async buildTree(data: any) {
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
                if (customParent) parentNode = customParent;
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
            const componentMappings: ComponentMappingEntry[] = Array.isArray(data.componentMappings)
                ? data.componentMappings
                : [];
            const componentStateRuntimeAvailable = data.componentStateRuntimeReady !== false;
            const fallbackUiLayer = (cc.Layers && cc.Layers.Enum && cc.Layers.Enum.UI_2D) || (1 << 25);
            const importedLayer = typeof parentNode.layer === 'number' ? parentNode.layer : fallbackUiLayer;

            let count = 0;
            // 待加载的图片：{ sprite 组件, SpriteFrame uuid }
            const pendingSprites: PendingSpriteLoad[] = [];
            // 待加载的遮罩图：{ mask 组件, SpriteFrame uuid }
            const pendingMasks: Array<{ sprite: any; uuid: string }> = [];
            // 待就绪替换的品红占位：图已落盘但子资源未就绪，先挂品红占位，记录节点 uuid + 加载参数，
            // 由 main 后台轮询就绪后调 replaceImagePlaceholders 按 nodeUuid 定位替换成真图。
            const unresolvedPlaceholders: ImagePlaceholderRecord[] = [];
            // 待加载的字体：{ label 组件, Font uuid }（阶段 5 字体样式库）
            const pendingFonts: Array<{ target: any; uuid: string; fileName: string; fallbackBold: boolean; rich: boolean }> = [];
            // 字体/模板完成后再建立持久化 companion，确保主/影两层使用同一工程字体。
            const pendingRichTextShadows: Array<{ authoredNode: any; target: any; figmaNode: any }> = [];
            // Input 的原生 placeholder/text Label 要等 authored 文本完成异步字体/模板加载后再同步一次。
            const pendingInputLabelStyles: Array<{ source: any; target: any }> = [];
            // 待套用的字体样式模板：从美术手配的 prefab 克隆外观到导入 Label（环4 整组件克隆的 Cocos 版）。
            const pendingTemplates: Array<{
                target: any;
                prefabUuid: string;
                figmaPath: string;
                tier: string;
                fontOnly: boolean;
                resolverFontUuid: string;
                resolverFontFileName: string;
            }> = [];
            const textStyleSignatures = new Set<string>();
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
            const pendingComponentStates: MappedComponentStateRequest[] = [];
            // 导入根节点（供导入后主动刷新编辑器用）
            let importedRoot: any = null;
            // Input 协议通过 Figma id 指向 authored 直接子节点；映射仅在本轮建树期间使用。
            const figmaIdToNode = new Map<string, any>();

            const prefabCache: { [uuid: string]: any } = {};
            const mappedPrefabUuids = Array.from(new Set(
                componentMappings.map((entry) => String(entry && entry.prefabUuid || '')).filter(Boolean)
            ));
            await Promise.all(mappedPrefabUuids.map(async (uuid) => {
                try {
                    prefabCache[uuid] = await loadPrefabAsset(assetManager, uuid) || null;
                } catch (err) {
                    prefabCache[uuid] = null;
                    console.warn('[figma-importer:scene] 组件映射 Prefab 加载失败，将回退展开：', uuid, (err as any)?.message || err);
                }
            }));

            const recordStateResult = (result: 'attached' | 'unavailable'): void => {
                if (result === 'attached') {
                    componentStatesAttached++;
                    return;
                }
                componentStateUnavailable++;
                if (!componentStateUnavailableWarned) {
                    componentStateUnavailableWarned = true;
                    console.warn(
                        `[figma-importer:scene] ${FIGMA_COMPONENT_STATE_CLASS} 尚未就绪；` +
                        '组件节点仍会完成，但本次实例不含 Figma 状态。'
                    );
                }
            };

            // Unity 的文字样式会整体复制 TMP 与额外样式组件。Cocos 在递归建树前加载 Exact 模板，
            // 随后直接克隆文字叶节点，才能让材质、自定义脚本及组件引用一起保留下来。
            const exactTextTemplateRoots: { [uuid: string]: any } = {};
            await Promise.all(collectExactTextStyleTemplateUuids(data.root).map(async (uuid) => {
                try {
                    const prefab = await loadPrefabAsset(assetManager, uuid);
                    exactTextTemplateRoots[uuid] = prefab ? instantiate(prefab) : null;
                } catch (err) {
                    exactTextTemplateRoots[uuid] = null;
                    console.warn('[figma-importer:scene] Exact 文字模板 Prefab 加载失败，改走数值降级:', uuid, (err as any)?.message || err);
                }
            }));

            /** @zh 绝对定位：按节点锚点应用 Figma→Cocos 坐标公式。 */
            const placeAbsolute = (node: any, figmaNode: any, w: number, h: number,
                parentW: number, parentH: number, mountedLayoutMode?: string,
                anchorX = 0.5, anchorY = 0.5): void => {
                const pos = positionForTransformedAnchor(
                    figmaNode.x,
                    figmaNode.y,
                    w,
                    h,
                    parentW,
                    parentH,
                    anchorX,
                    anchorY,
                    typeof figmaNode.scaleX === 'number' ? figmaNode.scaleX : 1,
                    typeof figmaNode.scaleY === 'number' ? figmaNode.scaleY : 1,
                    Number(figmaNode.rotation) || 0,
                );
                const initialPosition = positionBeforeMountedLayout(pos, mountedLayoutMode);
                node.setPosition(new Vec3(initialPosition.x, initialPosition.y, 0));
                node.angle = -(figmaNode.rotation || 0);
                node.setScale(new Vec3(
                    typeof figmaNode.scaleX === 'number' ? figmaNode.scaleX : 1,
                    typeof figmaNode.scaleY === 'number' ? figmaNode.scaleY : 1,
                    1
                ));
            };

            /**
             * @zh 自动布局 → cc.Layout（端口 Unity SetupLayout 2111 + MapLayoutAlignment 2190）。
             *     resizeMode=NONE：只按 spacing/padding/方向排列子节点位置，不改子节点尺寸
             *     （对齐 Unity childControl / childForceExpand / childScale 全 false）。
             *     Figma native GRID and regular Wrap both map to cc.Layout.GRID;
             *     irregular/sparse layouts are filtered by shouldMountLayout.
             */
            const applyLayout = (node: any, figmaNode: any): void => {
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
                const grid = inferNativeGridLayout(figmaNode) || inferWrapGridLayout(figmaNode);
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
                    if (layout.updateLayout) layout.updateLayout();
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
                const kids = (figmaNode.children || []).filter((c: any) => c && c.visible !== false);
                const n = kids.length;
                const containerMain = isVertical ? (figmaNode.height || 0) : (figmaNode.width || 0);
                let sumChild = 0;
                for (const c of kids) sumChild += (isVertical ? (c.height || 0) : (c.width || 0));
                const figLead = Math.round((isVertical ? pad.top : pad.left) || 0);
                const figTrail = Math.round((isVertical ? pad.bottom : pad.right) || 0);

                let spacing = figmaNode.itemSpacing || 0;
                let leadPad = figLead;
                const align = figmaNode.primaryAxisAlignItems;
                if (align === 'SPACE_BETWEEN' && n > 1) {
                    spacing = (containerMain - figLead - figTrail - sumChild) / (n - 1);
                } else {
                    const contentMain = sumChild + Math.max(0, n - 1) * spacing;
                    if (align === 'CENTER') leadPad = Math.round((containerMain - contentMain) / 2);
                    else if (align === 'MAX') leadPad = Math.round(containerMain - contentMain - figTrail);
                    // MIN（默认）：leadPad 保持 Figma padding
                }

                if (isVertical) {
                    layout.spacingY = spacing;
                    layout.paddingTop = leadPad;
                } else {
                    layout.spacingX = spacing;
                    layout.paddingLeft = leadPad;
                }
                if (layout.updateLayout) layout.updateLayout();
            };


            /**
             * @zh 约束 → Widget（端口 SetupStretchRect 827）。margin 用像素、alignMode=ON_WINDOW_RESIZE。
             *     SCALE 近似为两侧拉伸（有损，与 Unity 同款近似）。先摆绝对位置作初值，再挂 Widget。
             */
            const applyConstraintWidget = (node: any, figmaNode: any, w: number, h: number,
                parentW: number, parentH: number): void => {
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
                } else if (hc === 'RIGHT') {
                    widget.isAlignRight = true;
                    widget.right = parentW - (x + w);
                } else if (hc === 'CENTER') {
                    widget.isAlignHorizontalCenter = true;
                    widget.horizontalCenter = (x + w / 2) - parentW / 2;
                } else {
                    widget.isAlignLeft = true;
                    widget.left = x;
                }

                // 垂直（Cocos Y 上，top/bottom 是到父上/下边距离）
                const vc = c.vertical;
                if (vc === 'TOP_BOTTOM' || vc === 'SCALE') {
                    widget.isAlignTop = widget.isAlignBottom = true;
                    widget.top = y;
                    widget.bottom = parentH - (y + h);
                } else if (vc === 'BOTTOM') {
                    widget.isAlignBottom = true;
                    widget.bottom = parentH - (y + h);
                } else if (vc === 'CENTER') {
                    widget.isAlignVerticalCenter = true;
                    widget.verticalCenter = parentH / 2 - (y + h / 2);
                } else {
                    widget.isAlignTop = true;
                    widget.top = y;
                }

                if (widget.updateAlignment) widget.updateAlignment();
            };

            const buildNode = (figmaNode: any, ccParent: any, parentNode: any,
                parentW: number, parentH: number, parentEffLayout: boolean,
                isRoot: boolean, parentMountedLayout: boolean): void => {
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
                    const resolution = resolveComponentMapping(
                        componentKey,
                        figmaNode.componentProperties,
                        componentMappings,
                        (entry) => !!(entry.prefabUuid && prefabCache[entry.prefabUuid])
                    );
                    if (resolution.status === 'mapped' && resolution.entry) {
                        let mappedNode: any = null;
                        try {
                            const node = instantiate(prefabCache[resolution.entry.prefabUuid]);
                            mappedNode = node;
                            if (!node) throw new Error('instantiate returned no node');
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
                                if (request) pendingComponentStates.push(request);
                                else recordStateResult('unavailable');
                            } else {
                                node.active = figmaNode.visible !== false;
                                recordStateResult('unavailable');
                            }
                            count++;
                            if (figmaNode.figmaId) figmaIdToNode.set(String(figmaNode.figmaId), node);
                            mappedPrefabs++;
                            if (isRoot) importedRoot = node;
                            return;
                        } catch (err) {
                            discardFailedMappedNode(mappedNode);
                            failedPrefabInstances++;
                            console.warn(
                                `[figma-importer:scene] 组件「${figmaNode.name || componentKey}」` +
                                `(key=${componentKey}) Prefab 映射实例处理失败，回退展开散节点：`,
                                (err as any)?.message || err
                            );
                        }
                    } else if (resolution.status === 'broken') {
                        brokenComponentMappings++;
                        console.warn(
                            `[figma-importer:scene] 组件「${figmaNode.name || componentKey}」` +
                            `(key=${componentKey}) 已配置映射但 Prefab 断链，回退展开散节点。`
                        );
                    } else {
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
                if (componentKey) node.active = false;
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
                        } else {
                            recordStateResult('unavailable');
                        }
                    } else {
                        recordStateResult('unavailable');
                    }
                }
                if (!stateQueued) node.active = exactTextTemplateClone ? false : figmaNode.visible !== false;
                const templateOpacity = node.getComponent && node.getComponent(UIOpacity);
                if (typeof figmaNode.opacity === 'number' && figmaNode.opacity < 1) {
                    const opacity = Math.max(0, Math.min(255, Math.round(figmaNode.opacity * 255)));
                    (templateOpacity || node.addComponent(UIOpacity)).opacity = opacity;
                } else if (templateOpacity) {
                    templateOpacity.opacity = 255;
                }
                count++;
                if (figmaNode.figmaId) figmaIdToNode.set(String(figmaNode.figmaId), node);
                if (exactTextTemplateClone) templatesApplied++;
                if (isRoot) importedRoot = node;

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
                    if (applyImageColor(sprite, figmaNode.imageFill, figmaNode.overlayTint, Color)) overlayTints++;
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
                } else if (imgRef && unresolved[imgRef]) {
                    // 图已落盘/复用成功但 SpriteFrame 子资源尚未就绪：先挂品红占位（同缺图外观），
                    // 记录 visualHost 的 uuid + 加载参数，交 main 后台就绪后按 uuid 定位替换成真图。
                    const placeholderSprite = mountMissingImagePlaceholder(visualHost, w, h, cc);
                    if (applyImageColor(placeholderSprite, figmaNode.imageFill, figmaNode.overlayTint, Color)) overlayTints++;
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
                } else if (imgRef) {
                    // 声明了图但没匹配到 SpriteFrame（未落盘/未复用成功）：挂空 Sprite + 品红占位框，
                    // 供美术手动补图，避免只剩空 UITransform 节点（同事反馈「没识别到的图挂代图」）。
                    mountMissingImagePlaceholder(visualHost, w, h, cc);
                    hasVisibleGraphic = true;
                    missingImages++;
                } else if (figmaNode.type !== 'TEXT' && applySolidFill(visualHost, figmaNode, w, h, Graphics, Color)) {
                    solidFills++;
                    hasVisibleGraphic = true;
                } else if (applyTransparentRectangleFallback(visualHost, figmaNode, w, h, Graphics, Color)) {
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
                    if (figmaNode.fontSize) label.fontSize = figmaNode.fontSize;
                    label.lineHeight = figmaNode.lineHeight > 0 ? figmaNode.lineHeight : (figmaNode.fontSize || label.fontSize);
                    label.horizontalAlign = mapHAlign(Label, figmaNode.textAlignHorizontal);
                    label.verticalAlign = mapVAlign(Label, figmaNode.textAlignVertical);
                    if (useRichText) {
                        label.maxWidth = richTextMount ? richTextMount.plan.maxWidth : 0;
                        richTexts++;
                    } else {
                        applyTextSizing(Label, label, figmaNode);
                        if (!exactTextTemplateClone) applyFontStyle(label, figmaNode);
                        applyTextDecoration(label, figmaNode);
                    }
                    if (!useRichText) applyAuthoredLetterSpacing(label, figmaNode);
                    if (figmaNode.color && !(exactTextTemplateClone && figmaNode.textGradient)) {
                        const c = figmaNode.color;
                        if (useRichText) label.fontColor = new Color(c.r, c.g, c.b, c.a);
                        else label.color = new Color(c.r, c.g, c.b, c.a);
                    }
                    if (figmaNode.textGradient && !exactTextTemplateClone) {
                        gradientTextFallbacks++;
                    }
                    if (figmaNode.textStyle) {
                        if (figmaNode.textStyle.figmaSignature) textStyleSignatures.add(figmaNode.textStyle.figmaSignature);
                        if (figmaNode.textStyle.textStyleName) labelsWithTextStyleName++;
                    }
                    if (figmaNode.textStyleTemplate) textStyleTemplateLabels++;
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
                        placeAbsolute(maskNode, { x: mask.x, y: mask.y, rotation: mask.rotation || 0 },
                            mask.width || w, mask.height || h, w, h);
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
                    } catch (e) {
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
                if (mountLayout) applyLayout(node, figmaNode);
                const inputSpec = normalizeFigmaInputSpec(figmaNode);
                if (inputSpec) {
                    const inputMount = mountFtocInputEditBox(
                        node,
                        figmaNode,
                        figmaIdToNode.get(inputSpec.textNodeId),
                        cc,
                    );
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
                    else console.warn(
                        `[figma-importer:scene] 输入框「${figmaNode.name || figmaNode.figmaId || ''}」未挂载:`,
                        inputMount.reason,
                    );
                }
                if (shouldFinalizeExactTextStyleTemplateNode(exactTextTemplateClone, stateQueued)) {
                    finalizeExactTextStyleTemplateNode(node, figmaNode.visible);
                }
            };

            buildNode(data.root, parentNode, null, canvasW, canvasH, false, true, false);
            if (importedRoot && data.rootCanvasAbsolute) {
                const rootUi = importedRoot.getComponent && importedRoot.getComponent(UITransform);
                if (rootUi) {
                    const absRoot = {
                        ...data.root,
                        x: Number(data.rootCanvasAbsolute.x) || 0,
                        y: Number(data.rootCanvasAbsolute.y) || 0,
                    };
                    applyPatchTransform(
                        importedRoot,
                        rootUi,
                        absRoot,
                        data.canvas || data.root,
                        Vec3,
                        true,
                        UITransform,
                        find
                    );
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
            const loadAnyRetry = (
                uuid: string,
                tries = 10,
                delayMs = 100,
                ready?: (asset: any) => boolean,
            ): Promise<any> =>
                new Promise((resolve) => {
                    const attempt = (left: number) => {
                        assetManager.loadAny({ uuid }, (err: any, asset: any) => {
                            if (!err && asset && (!ready || ready(asset))) { resolve(asset); return; }
                            if (left <= 0) { resolve(null); return; }
                            setTimeout(() => attempt(left - 1), delayMs);
                        });
                    };
                    attempt(tries);
                });
            await Promise.all(
                pendingSprites.map(
                    (pending) =>
                        (async () => {
                            const { sprite, uuid, slice9Border, imageFill, width, height } = pending;
                            const spriteFrame = await loadAnyRetry(
                                uuid,
                                30,
                                100,
                                slice9Border ? isSpriteFrameTextureReady : undefined,
                            );
                            if (spriteFrame && sprite) {
                                let finalFrame = spriteFrame;
                                if (slice9Border) {
                                    finalFrame = applySlice9Border(spriteFrame, slice9Border, Rect, Size, Vec2);
                                } else {
                                    const adapted = adaptImageFillSpriteFrame(spriteFrame, imageFill, width, height, Rect, Size, Vec2);
                                    finalFrame = adapted.frame;
                                    if (adapted.cropped) croppedImageFills++;
                                    if (imageFill && String(imageFill.source || '').toUpperCase() === 'FILL') imageFillSprites++;
                                }
                                sprite.spriteFrame = finalFrame;
                                // 设图后触发渲染标脏,避免"建完空白、拖一下才显示"(时序竞态余波)。
                                if (typeof sprite.markForUpdateRenderData === 'function') sprite.markForUpdateRenderData(true);
                                loaded++;
                                if (slice9Border) slicedLoaded++;
                            } else if (sprite && pending.host) {
                                trackFailedSpriteLoad(pending, unresolvedPlaceholders, cc);
                                console.warn(
                                    '[figma-importer:scene] SpriteFrame uuid 已存在但场景加载超时，保留品红并转入后续替换:',
                                    uuid,
                                    pending.imgRef,
                                );
                            }
                        })()
                )
            );

            // 异步加载遮罩 SpriteFrame（SPRITE_STENCIL）
            await Promise.all(
                pendingMasks.map(
                    ({ sprite, uuid }) =>
                        (async () => {
                            const spriteFrame = await loadAnyRetry(uuid);
                            if (spriteFrame && sprite) {
                                sprite.spriteFrame = spriteFrame;
                                if (typeof sprite.markForUpdateRenderData === 'function') sprite.markForUpdateRenderData(true);
                            }
                        })
                )
            );

            // 异步加载字体（cc.Font）并设到 Label（阶段 5 字体样式库）
            let fontsLoaded = 0;
            await Promise.all(
                pendingFonts.map(
                    ({ target, uuid, fileName, fallbackBold, rich }) =>
                        (async () => {
                            const font = await loadAnyRetry(uuid);
                            if (font && (!Font || font instanceof Font)) {
                                target.font = font;
                                target.useSystemFont = false;
                                fontsLoaded++;
                            } else if (font) {
                                if (!rich) target.isBold = fallbackBold;
                                target.useSystemFont = true;
                                console.warn('[figma-importer:scene] 字体 uuid 加载结果不是 cc.Font，已回退系统字体:', uuid, fileName, font.constructor && font.constructor.name);
                            } else {
                                if (!rich) target.isBold = fallbackBold;
                                target.useSystemFont = true;
                                console.warn('[figma-importer:scene] 字体 uuid 加载失败或未就绪，已回退系统字体:', uuid, fileName);
                            }
                        })
                )
            );

            // 环4：套用美术手配的字体样式模板——从 prefab 克隆模板 Label 的外观到导入 Label。
            if (pendingTemplates.length > 0) {
                const prefabCache: { [uuid: string]: any } = {};
                const rootCache: { [uuid: string]: any } = {};
                const loadPrefabCached = async (uuid: string): Promise<any> => {
                    if (prefabCache[uuid] !== undefined) return prefabCache[uuid];
                    try {
                        const asset = await loadPrefabAsset(assetManager, uuid);
                        prefabCache[uuid] = asset || null;
                    } catch (e) {
                        prefabCache[uuid] = null;
                        console.warn('[figma-importer:scene] 模板 prefab 加载失败:', uuid, (e as any) && (e as any).message || e);
                    }
                    return prefabCache[uuid];
                };
                for (const t of pendingTemplates) {
                    let tplLabel: any = null;
                    if (t.prefabUuid) {
                        const prefab = await loadPrefabCached(t.prefabUuid);
                        if (prefab) {
                            // 每个 prefab 只 instantiate 一次，复用其节点树取模板 Label。
                            let rootNode = rootCache[t.prefabUuid];
                            if (rootNode === undefined) {
                                try {
                                    rootNode = instantiate(prefab);
                                } catch (e) {
                                    rootNode = null;
                                    console.warn('[figma-importer:scene] 模板 prefab 实例化失败:', t.prefabUuid, (e as any) && (e as any).message || e);
                                }
                                rootCache[t.prefabUuid] = rootNode;
                            }
                            const tplNode = rootNode && getNodeByPath(rootNode, t.figmaPath);
                            tplLabel = tplNode && tplNode.getComponent ? tplNode.getComponent(Label) : null;
                        }
                    }

                    if (t.fontOnly) {
                        const source = await applyRichTextFont(
                            t.target,
                            tplLabel,
                            t.resolverFontUuid,
                            loadAnyRetry,
                            Font,
                        );
                        if (source === 'template') templatesApplied++;
                        else if (source === 'resolver') fontsLoaded++;
                        else {
                            console.warn(
                                '[figma-importer:scene] RichText 字体模板和 resolver 均未命中，已回退系统字体:',
                                t.resolverFontUuid,
                                t.resolverFontFileName,
                            );
                        }
                        continue;
                    }

                    if (!tplLabel) {
                        console.warn('[figma-importer:scene] 模板节点/Label 未找到:', t.figmaPath);
                        continue;
                    }
                    if (copyLabelAppearance(tplLabel, t.target, Font)) templatesApplied++;
                }
                // 清理临时实例化的模板树。
                for (const uuid of Object.keys(rootCache)) {
                    const rn = rootCache[uuid];
                    if (rn && typeof rn.destroy === 'function') rn.destroy();
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
                if (rootNode && typeof rootNode.destroy === 'function') rootNode.destroy();
            }

            for (const pending of pendingRichTextShadows) {
                const result = mountFtocRichTextShadow(pending.authoredNode, pending.figmaNode, pending.target, cc);
                if (result.applied) richTextShadows++;
                if (result.blurFallback) richTextShadowBlurFallbacks++;
                if (result.warning) console.warn('[figma-importer:scene]', result.warning);
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
        } catch (error: any) {
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
    async replaceImagePlaceholders(data: any) {
        try {
            const cc = require('cc');
            const { director, Sprite, Rect, Size, Vec2, Color, assetManager } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const items: any[] = Array.isArray(data && data.items) ? data.items : [];
            let replaced = 0;
            let failed = 0;

            for (const it of items) {
                const nodeUuid = String(it && it.nodeUuid || '');
                const spriteFrameUuid = String(it && it.spriteFrameUuid || '');
                if (!nodeUuid || !spriteFrameUuid) { failed++; continue; }
                const host = findNodeByUuid(scene, nodeUuid);
                if (!host) { failed++; continue; }

                const slice9Border = it.slice9Border || null;
                const spriteFrame = await loadAssetAny(
                    assetManager,
                    spriteFrameUuid,
                    slice9Border ? 30 : 10,
                    100,
                    slice9Border ? isSpriteFrameTextureReady : undefined,
                );
                if (!spriteFrame) { failed++; continue; }

                // 移除品红占位子节点（mountMissingImagePlaceholder 建的 _MissingImg）
                const ph = host.children && host.children.find((c: any) => c && c.name === '_MissingImg');
                if (ph) ph.destroy();

                // 宿主上加/取 Sprite（占位分支只 addComponent 了品红 Graphics 子节点，宿主自身无 Sprite）
                const sprite = host.getComponent(Sprite) || host.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                sprite.trim = false;
                configureSpriteType(sprite, { imageFill: it.imageFill }, slice9Border, Sprite);
                if (applyImageColor(sprite, it.imageFill, it.overlayTint, Color)) { /* tint applied */ }
                applyTileScaling(sprite, it.imageFill);

                if (slice9Border) {
                    sprite.spriteFrame = applySlice9Border(spriteFrame, slice9Border, Rect, Size, Vec2);
                } else {
                    const adapted = adaptImageFillSpriteFrame(
                        spriteFrame, it.imageFill, Number(it.width) || 0, Number(it.height) || 0, Rect, Size, Vec2);
                    sprite.spriteFrame = adapted.frame;
                }
                if (typeof sprite.markForUpdateRenderData === 'function') sprite.markForUpdateRenderData(true);
                replaced++;
            }

            console.log(`[figma-importer:scene] 品红占位替换：${replaced} 成功，${failed} 失败（保留品红）。`);
            return { success: true, data: { replaced, failed } };
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @zh beta：捕获单个替换目标的可还原状态。对齐 Unity ResourceReplace 的 row.Snap。
     */
    snapshotReplaceTargetBeta(options: any) {
        try {
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const uuid = String(options && options.uuid || '');
            if (!uuid) return { success: false, error: 'Missing uuid' };
            const node = findNodeByUuid(scene, uuid);
            if (!node || !node.getComponent) return { success: false, error: `Node not found: ${uuid}` };
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
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @zh beta：把 snapshotReplaceTargetBeta 捕获的状态写回目标节点。
     */
    async restoreReplaceTargetBeta(options: any) {
        try {
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const snapshot = options && (options.snapshot || options);
            const uuid = String(options && options.uuid || snapshot && snapshot.uuid || '');
            if (!uuid) return { success: false, error: 'Missing snapshot uuid' };
            const node = findNodeByUuid(scene, uuid);
            if (!node || !node.getComponent) return { success: false, error: `Node not found: ${uuid}` };
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
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @zh beta：在编辑器 Hierarchy 中选中指定替换目标，等价于 Unity ResourceReplace 的“定位”。
     */
    selectReplaceTargetBeta(options: any) {
        try {
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const uuid = String(options && options.uuid || '');
            if (!uuid) return { success: false, error: 'Missing uuid' };
            const node = findNodeByUuid(scene, uuid);
            if (!node) return { success: false, error: `Node not found: ${uuid}` };
            selectEditorNode(node);
            return {
                success: true,
                data: {
                    uuid: node.uuid,
                    name: node.name || '',
                    scenePath: buildSceneNodePath(node),
                },
            };
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @zh beta：读取选中/目标节点的路径、尺寸和组件类型，供 main 侧匹配 Figma JSON 节点。
     */
    describeNodeForReplaceBeta(options: any) {
        try {
            const cc = require('cc');
            const { director, UITransform, Label, RichText, Sprite } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const uuid = String(options && options.uuid || '');
            if (!uuid) return { success: false, error: 'Missing uuid' };
            const node = findNodeByUuid(scene, uuid);
            if (!node) return { success: false, error: `Node not found: ${uuid}` };
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
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @zh beta：扫描选中/指定实例树里的可替换目标组件。
     *     对齐 Unity ResourceReplaceWindow 的右侧目标列表：Label/RichText 作为文字目标，Sprite 作为图片目标。
     */
    listReplaceTargetsBeta(options: any = {}) {
        try {
            const cc = require('cc');
            const { director, find, UITransform, Label, RichText, Sprite } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };

            const rootUuid = String(options && options.rootUuid || '');
            const rootName = String(options && options.rootName || '');
            const kind = String(options && options.kind || 'all').toLowerCase();
            let root = rootUuid ? findNodeByUuid(scene, rootUuid) : null;
            if (!root && rootName) root = findFirstNodeByName(scene, rootName);
            if (!root) root = findDefaultExportRoot(scene, find, UITransform);
            if (!root) return { success: false, error: 'No target root found' };

            const includeText = kind === 'all' || kind === 'text' || kind === 'mixed';
            const includeImage = kind === 'all' || kind === 'image' || kind === 'mixed';
            const targets: any[] = [];
            const visit = (node: any) => {
                if (!node || !node.getComponent) return;
                if (isFtocTextHelperNode(node) || isCreatorRichTextRuntimeNode(node)) return;
                const ui = UITransform ? node.getComponent(UITransform) : null;
                const size = readUiSize(ui);
                const parent = node.parent || null;
                const logicalText = includeText ? resolveLogicalTextTarget(node, Label, RichText) : null;
                const label = logicalText && logicalText.kind === 'label' ? logicalText.component : null;
                const richText = logicalText && logicalText.kind === 'richText' ? logicalText.component : null;
                const sprite = includeImage && Sprite ? node.getComponent(Sprite) : null;
                const add = (replaceKind: string, component: any, extra: any) => {
                    targets.push({
                        uuid: node.uuid,
                        name: node.name || '',
                        scenePath: buildSceneNodePath(node),
                        relativePath: buildRelativeNodePath(node, root),
                        parentName: parent ? parent.name || '' : '',
                        parentUuid: parent ? parent.uuid || '' : '',
                        siblingIndex: typeof node.getSiblingIndex === 'function'
                            ? node.getSiblingIndex()
                            : parent && parent.children ? parent.children.indexOf(node) : -1,
                        width: size.width,
                        height: size.height,
                        hasLabel: replaceKind === 'text',
                        hasSprite: replaceKind === 'image',
                        hasRichText: !!richText,
                        componentType: readComponentName(component),
                        replaceKind,
                        ...extra,
                    });
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
                for (const child of (node.children || [])) visit(child);
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
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @zh beta：把一颗已走正式 slim/asset landing 的 Figma 节点，局部应用到现有 Cocos 节点。
     *     不重命名、不增删子节点；按 flags 分开覆盖图片、文字、位置。
     */
    async applyNodePatchBeta(data: any) {
        let rollbackTarget: any = null;
        let rollbackSnapshot: any = null;
        let rollbackCc: any = null;
        try {
            console.log(`%c[figma-importer:scene] applyNodePatchBeta 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            rollbackCc = cc;
            const { director, find, UITransform, Label, RichText, Sprite, Font, Vec3, Vec2, Color } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            if (!data || !data.node) return { success: false, error: 'Invalid data: missing node' };
            const targetUuid = String(data.targetUuid || '');
            if (!targetUuid) return { success: false, error: 'Missing targetUuid' };
            const target = findNodeByUuid(scene, targetUuid);
            if (!target || !target.getComponent) return { success: false, error: `Target node not found: ${targetUuid}` };
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
            const warnings: string[] = [];
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
            let patchedTextTarget: any = null;
            const lockedSize = !applyPosition && ui ? readUiSize(ui) : null;

            if (applyPosition) {
                if (ui) {
                    applyPatchTransform(target, ui, figmaNode, data.canvas || figmaNode, Vec3, resetAnchorPivot, UITransform, find);
                    positionApplied = true;
                } else {
                    warnings.push(`目标节点「${target.name || targetUuid}」没有 UITransform，跳过位置/尺寸。`);
                }
            }

            if (applyImage) {
                const sprite = Sprite ? target.getComponent(Sprite) : null;
                if (!sprite) {
                    warnings.push(`目标节点「${target.name || targetUuid}」没有 Sprite 组件，跳过图片。`);
                } else {
                    imageApplied = await applyPatchSprite(sprite, figmaNode, data, cc, preserveAlpha);
                    if (!imageApplied) warnings.push(`目标节点「${target.name || targetUuid}」图片应用失败或 Figma 节点无图片。`);
                }
            }

            if (applyText && String(figmaNode.type || '').toUpperCase() === 'TEXT') {
                const prepared = prepareTextPatchTarget(target, figmaNode, cc);
                if (!prepared.component) {
                    warnings.push(prepared.warning || `目标节点「${target.name || targetUuid}」没有可用文字组件，跳过文字。`);
                } else {
                    patchedTextTarget = prepared.component;
                    textApplied = applyPatchTextCommon(
                        prepared.component,
                        figmaNode,
                        Label,
                        prepared.isRich,
                        Color,
                        Vec2,
                    );
                    if (textApplied) {
                        if (prepared.rendererNode) syncFtocRichTextRendererLayout(target, figmaNode, cc);
                        fontApplied = prepared.isRich
                            ? await applyPatchRichTextFont(prepared.component, figmaNode, cc)
                            : await applyPatchFont(prepared.component, figmaNode, cc.assetManager, Font, false);
                        if (prepared.convertedLabel && prepared.label) prepared.label.enabled = false;
                        if (prepared.isRich) prepared.component.enabled = true;
                        if (prepared.rendererNode) {
                            prepared.rendererNode.active = true;
                            richTextRendererUuid = String(prepared.rendererNode.uuid || '');
                        }
                        if (prepared.isRich) {
                            const shadowResult = mountFtocRichTextShadow(target, figmaNode, prepared.component, cc);
                            richTextShadowApplied = shadowResult.applied;
                            richTextShadowBlurFallback = shadowResult.blurFallback;
                            richTextShadowRendererUuid = String(shadowResult.node && shadowResult.node.uuid || '');
                            if (shadowResult.warning) warnings.push(shadowResult.warning);
                        }
                        richTextApplied = prepared.isRich;
                        richTextConverted = prepared.convertedLabel;
                    } else if (prepared.isRich) {
                        if (prepared.createdRenderer) removeFtocRichTextRenderer(target, RichText);
                        else {
                            prepared.component.enabled = true;
                            if (prepared.rendererNode) prepared.rendererNode.active = true;
                        }
                    }
                }
            }

            // 与 Unity 的“内容 / 位置”契约一致：未应用位置时，文字 overflow/font 更新不能改目标框尺寸。
            if (lockedSize && ui && ui.setContentSize) {
                if (patchedTextTarget && typeof patchedTextTarget.updateRenderData === 'function') {
                    try { patchedTextTarget.updateRenderData(true); } catch { /* keep the authored target size below */ }
                }
                ui.setContentSize(lockedSize.width, lockedSize.height);
            }

            const success = imageApplied || textApplied || positionApplied;
            if (!success && warnings.length === 0) warnings.push('没有任何字段被应用，请检查 flags 与节点类型。');
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
        } catch (error: any) {
            let rollbackError = '';
            if (rollbackTarget && rollbackSnapshot && rollbackCc) {
                try {
                    await restoreReplaceSnapshot(rollbackTarget, rollbackSnapshot, rollbackCc);
                } catch (restoreError: any) {
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
    async replaceTreeBeta(data: any) {
        try {
            console.log(`%c[figma-importer:scene] replaceTreeBeta 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            if (!data || !data.root) return { success: false, error: 'Invalid data: missing root' };
            const targetUuid = String(data.targetUuid || '');
            if (!targetUuid) return { success: false, error: 'Missing targetUuid' };

            const target = findNodeByUuid(scene, targetUuid);
            if (!target) return { success: false, error: `Target node not found: ${targetUuid}` };
            const parentNode = target.parent;
            if (!parentNode) return { success: false, error: 'Target node has no parent' };
            const siblingIndex = typeof target.getSiblingIndex === 'function'
                ? target.getSiblingIndex()
                : Math.max(0, (parentNode.children || []).indexOf(target));
            const oldName = target.name;

            target.removeFromParent();
            if (typeof target.destroy === 'function') target.destroy();

            const result = await methods.buildTree({
                ...data,
                parentUuid: parentNode.uuid,
                siblingIndex,
            });
            if (result && result.success !== false && result.data) {
                result.data.replacedRootUuid = targetUuid;
                result.data.replacedRootName = oldName;
                result.data.parent = parentNode.name;
                result.data.siblingIndex = siblingIndex;
            }
            return result;
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @en Serialize the selected/imported scene subtree as a real Cocos Prefab asset JSON.
     * @zh 将选中/最近导入的真实场景子树序列化为 Cocos Prefab 资源 JSON（beta）。
     */
    async serializeNodeAsPrefabBeta(options: any = {}) {
        try {
            console.log(`%c[figma-importer:scene] serializeNodeAsPrefabBeta 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director, find, UITransform } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };

            const root = findPrefabSourceNode(scene, find, UITransform, options || {});
            if (!root || !root.getComponent) {
                return { success: false, error: 'No prefab source node found' };
            }

            const prefabName = String(options && options.prefabName || root.name || 'FigmaPrefab');
            const prefabAsset = createPrefabAssetFromNode(cc, root, prefabName);
            const serialized = serializeEditorObject(prefabAsset, { stringify: false });
            const json = JSON.stringify(serialized, null, 2);
            const stats = collectSceneNodeStats(root, cc);
            console.log(
                `[figma-importer:scene] serializeNodeAsPrefabBeta 完成：${prefabName} ` +
                `nodes=${stats.nodes}, sprites=${stats.sprites}, nullSpriteFrames=${stats.nullSpriteFrames}, labels=${stats.labels}`
            );

            return {
                success: true,
                data: {
                    json,
                    name: prefabName,
                    rootUuid: root.uuid,
                    stats,
                },
            };
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @en Instantiate a Prefab asset into Canvas, matching Unity's "instantiate prefab for replace" first step.
     * @zh 将 Prefab 资源实例化到当前 Canvas 下（beta，对齐 Unity「实例化并替换」的第一步）。
     */
    async instantiatePrefabBeta(options: any = {}) {
        try {
            console.log(`%c[figma-importer:scene] instantiatePrefabBeta 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director, find, assetManager, instantiate, Prefab } = cc;
            const scene = director.getScene();
            if (!scene) return { success: false, error: 'No active scene' };
            const uuid = String(options && options.uuid || '');
            if (!uuid) return { success: false, error: 'Missing prefab uuid' };

            const prefabAsset = await loadPrefabAsset(assetManager, uuid);
            if (!prefabAsset || (Prefab && !(prefabAsset instanceof Prefab) && !prefabAsset.data)) {
                return {
                    success: false,
                    error: `Asset is not a Prefab: ${uuid}`,
                    data: { dbUrl: options && options.dbUrl, assetType: prefabAsset && prefabAsset.constructor && prefabAsset.constructor.name },
                };
            }

            const node = instantiate(prefabAsset);
            if (!node) return { success: false, error: `Failed to instantiate prefab: ${uuid}` };
            const canvas = find('Canvas') || scene.getChildByName('Canvas');
            const parentNode = canvas || scene;
            parentNode.addChild(node);
            if (typeof parentNode.layer === 'number') {
                const setLayer = (n: any) => {
                    if (typeof n.layer === 'number') n.layer = parentNode.layer;
                    for (const child of (n.children || [])) setLayer(child);
                };
                setLayer(node);
            }
            selectEditorNode(node);

            const stats = collectSceneNodeStats(node, cc);
            console.log(
                `[figma-importer:scene] instantiatePrefabBeta 完成：${node.name} ` +
                `nodes=${stats.nodes}, sprites=${stats.sprites}, nullSpriteFrames=${stats.nullSpriteFrames}, labels=${stats.labels}`
            );

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
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },

    /**
     * @en Export a real Cocos scene subtree back to the Figma JSON contract.
     * @zh 从真实 Cocos 场景子树反导为 Figma JSON 契约（/pull beta）。
     */
    async exportTreeForFigma(options: any = {}) {
        try {
            console.log(`%c[figma-importer:scene] exportTreeForFigma 运行 · 构建版本 = ${SCENE_BUILD_VERSION}`, 'color:#08c;font-weight:bold');
            const cc = require('cc');
            const { director, find, UITransform } = cc;
            const scene = director.getScene();
            if (!scene) {
                return { success: false, error: 'No active scene' };
            }

            const selectedUuids = Array.isArray(options && options.rootUuids)
                ? options.rootUuids.map((uuid: any) => String(uuid || '')).filter(Boolean)
                : [];
            const canvas = find('Canvas') || scene.getChildByName('Canvas');
            let selectedNodes: any[] = [];
            let selectedFilter: Set<string> | null = null;
            let ancestorFilter: Set<string> | null = null;
            let exportMode = 'subtree';
            let root: any = null;

            if (selectedUuids.length > 0) {
                selectedNodes = selectedUuids
                    .map((uuid: string) => findNodeByUuid(scene, uuid))
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
                if (!root) return { success: false, error: 'Unable to find common ancestor for selected nodes' };
                if (selectedNodes.length > 1 && !selectedNodes.includes(root)) {
                    selectedFilter = new Set(selectedNodes.map((node: any) => node.uuid));
                    ancestorFilter = collectAncestorUuidSet(selectedNodes, root);
                    exportMode = 'selective';
                }
            }

            if (!root) root = options && options.rootUuid ? findNodeByUuid(scene, String(options.rootUuid)) : null;
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
            const projectPath = (Editor as any).Project.path;
            const ctx: ExportContext = {
                cc,
                imageSearchDirs: buildExportImageSearchDirs(
                    projectPath,
                    root.name || '',
                    interfaceRoot && interfaceRoot.name || ''
                ),
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

            const rootData = await exportNodeToFigma(
                root,
                rootSize.width,
                rootSize.height,
                true,
                ctx,
                selectedFilter,
                ancestorFilter
            );
            rootData.x = 0;
            rootData.y = 0;
            rootData.width = roundExportNumber(rootSize.width);
            rootData.height = roundExportNumber(rootSize.height);

            const exportData: any = {
                version: '1.0.8',
                name: root.name || 'CocosExport',
                canvas: {
                    width: roundExportNumber(rootSize.width),
                    height: roundExportNumber(rootSize.height),
                },
                root: rootData,
            };
            if (Object.keys(ctx.images).length > 0) exportData.images = ctx.images;

            const json = JSON.stringify(exportData, null, 4);
            console.log(
                `[figma-importer:scene] exportTreeForFigma 完成：${root.name} ` +
                `nodes=${ctx.stats.nodes}, texts=${ctx.stats.texts}, sprites=${ctx.stats.sprites}, images=${ctx.stats.images}, ` +
                `missingImages=${ctx.stats.missingImages}`
            );
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
                    selectedUuids: selectedNodes.map((node: any) => node.uuid),
                },
            };
        } catch (error: any) {
            return { success: false, error: error.message, stack: error.stack };
        }
    },
};
