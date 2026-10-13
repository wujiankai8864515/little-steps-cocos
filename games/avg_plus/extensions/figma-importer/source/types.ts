/**
 * @en TS mirror of the Figma export JSON contract (FigmaNodeData.cs).
 * @zh Figma 导出 JSON 契约（FigmaNodeData.cs）的 TS 镜像。
 *
 * 阶段 1 只声明坐标/层级相关字段，视觉/布局字段后续阶段再补。
 * 字段名必须与 JSON 完全一致（契约不可变）。
 */

/**
 * @zh 构建版本号（唯一来源）。main 与 scene 都从这里取，改一处两边日志同步变。
 * 每次改代码就更新这一行——不要再在 main.ts / scene.ts 各写一份。
 */
export const BUILD_VERSION = 'v2.1.0.001 (2026-08-27 V2 · Ticket 15 九宫按边距分档复用 + Ticket 18 裁剪填充紧致导出)';

export interface FigmaCanvas {
    width: number;
    height: number;
}

/** @zh Figma 约束（对齐 FigmaConstraints.cs）。horizontal/vertical 取 LEFT/RIGHT/CENTER/LEFT_RIGHT/SCALE 等。 */
export interface FigmaConstraints {
    horizontal?: string;
    vertical?: string;
}

/** @zh Auto Layout 内边距（对齐 FigmaPadding.cs）。 */
export interface FigmaPadding {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/**
 * @zh 图片遮罩信息（对齐 FigmaMaskInfo.cs）。矩形遮罩走 clipsContent，不产生此结构。
 *     坐标 x/y/width/height 与同级子节点同一套父局部坐标系（左上原点，Y 向下）。
 */
export interface FigmaMaskInfo {
    kind?: string;
    maskType?: string;
    name?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    imageRef?: string;
    imageName?: string;
}

export type FigmaInputTextRole = 'placeholder' | 'string';

/** @zh FtoX 识别出的最小输入框语义；背景和 counter 仍由 authored 子树承载。 */
export interface FigmaInputSpec {
    multiline: boolean;
    maxLength: number;
    placeholder: string;
    string: string;
    textRole: FigmaInputTextRole;
    textNodeId: string;
    counterNodeId?: string;
    backgroundNodeId?: string;
}

export interface FigmaTextSegment {
    start: number;
    end: number;
    fontSize?: number;
    /** FtoX sends unit-range RGBA; the Cocos scene boundary also accepts 0..255. */
    color?: { r: number; g: number; b: number; a?: number };
}

export interface FigmaTextGradient {
    mode: string;
    a: { r: number; g: number; b: number; a: number };
    b: { r: number; g: number; b: number; a: number };
}

export interface FigmaTextStyleTemplate {
    tier: 'Exact' | 'Fuzzy';
    score: number;
    source: string;
    styleName?: string;
    figmaPath?: string;
    childName?: string;
    fontUuid?: string;
    fontFileName?: string;
    prefabUuid?: string;
}

export interface FigmaNodeData {
    figmaId: string;
    name: string;
    type: string;
    figmaType?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    componentType?: string;
    inputSpec?: FigmaInputSpec;
    textSegments?: FigmaTextSegment[];
    textGradient?: FigmaTextGradient;
    textStyleTemplate?: FigmaTextStyleTemplate;
    children: FigmaNodeData[];
    // 后续阶段字段（fills / characters / constraints / mask ...）用到再加
    [key: string]: any;
}

export interface FigmaExportData {
    version: string;
    name: string;
    canvas: FigmaCanvas;
    root: FigmaNodeData;
    images?: { [id: string]: string };
    interfaces?: any[];
    previewImageRef?: string;
}
