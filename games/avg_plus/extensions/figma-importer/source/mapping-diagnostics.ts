import { FigmaExportData, FigmaNodeData } from './types';
import {
    MappingCapabilityId,
    MappingCapabilityHandling,
    MappingCapabilityLevel,
    getMappingCapability,
} from './mapping-capabilities';

export type MappingDiagnosticLevel = MappingCapabilityLevel;
export { MAPPING_CAPABILITY_REGISTRY } from './mapping-capabilities';

export interface MappingDiagnosticNode {
    name: string;
    figmaId: string;
    path: string;
}

export interface MappingDiagnosticEntry {
    code: MappingCapabilityId;
    level: MappingDiagnosticLevel;
    field: string;
    value: string;
    handling: MappingCapabilityHandling;
    reason: string;
    count: number;
    nodes: MappingDiagnosticNode[];
}

export interface MappingDiagnosticSummary {
    entries: MappingDiagnosticEntry[];
    occurrenceCount: number;
}

interface MutableMappingDiagnosticEntry extends MappingDiagnosticEntry {
    nodeKeys: Set<string>;
}

type MappingDiagnosticLogger = (message: string) => void;

type MappingDiagnosticAdder = (
    capabilityId: MappingCapabilityId,
    value: string,
    node: FigmaNodeData,
    path: string,
    fieldOverride?: string,
) => void;

export interface MappingDiagnosticKeyGroup {
    label: string;
    keys: readonly string[];
}

/**
 * Broad, key-level contract inventory. This deliberately stops at fields such as
 * fills[]/slice9Border/componentProperties; value-level fidelity stays in focused rules below.
 */
export const MAPPING_DIAGNOSTIC_KEY_GROUPS: {
    export: readonly MappingDiagnosticKeyGroup[];
    interface: readonly MappingDiagnosticKeyGroup[];
    node: readonly MappingDiagnosticKeyGroup[];
} = {
    export: [
        { label: '文档身份', keys: ['version', 'name', 'fileKey', 'uuid'] },
        { label: '画布与层级', keys: ['canvas', 'root', 'interfaces'] },
        {
            label: '资源与导出信息',
            keys: ['images', 'previewImageRef', 'previewImageBase64', 'exportPrune'],
        },
        {
            label: '封套与来源元数据',
            keys: [
                'buildVersion', 'creator', 'generator', 'sourceName', 'updatedAt',
                'styleRootName', 'styleRootPath', 'stats', 'entries',
            ],
        },
    ],
    interface: [
        { label: '界面身份', keys: ['name'] },
        { label: '画布与层级', keys: ['canvas', 'root', 'offsetX', 'offsetY'] },
        { label: '预览资源', keys: ['previewImageRef', 'previewImageBase64'] },
    ],
    node: [
        { label: '节点身份', keys: ['figmaId', 'name', 'type', 'figmaType'] },
        {
            label: '几何与变换',
            keys: [
                'x', 'y', 'width', 'height', 'rotation', 'rotationX', 'rotationY',
                'scaleX', 'scaleY', 'pivotX', 'pivotY', 'relativeTransform', 'opacity', 'visible',
            ],
        },
        {
            label: '视觉',
            keys: [
                'fills', 'strokes', 'strokeWeight', 'strokeAlign', 'effects', 'blendMode',
                'cornerRadius', 'cornerRadii',
            ],
        },
        {
            label: '样式引用',
            keys: [
                'fillStyleName', 'fillStyleId', 'strokeStyleName', 'strokeStyleId',
                'effectStyleName', 'effectStyleId',
            ],
        },
        {
            label: '布局与约束',
            keys: [
                'clipsContent', 'layoutMode', 'layoutWrap', 'gridRowCount', 'gridColumnCount',
                'gridRowGap', 'gridColumnGap', 'itemSpacing', 'counterAxisSpacing', 'padding',
                'primaryAxisAlignItems', 'counterAxisAlignItems', 'layoutPositioning', 'constraints',
            ],
        },
        {
            label: '文字',
            keys: [
                'characters', 'fontSize', 'fontFamily', 'fontWeight', 'textStyleName', 'textStyleId',
                'textAlignHorizontal', 'textAlignVertical', 'lineHeight', 'letterSpacing',
                'textAutoResize', 'textTruncation', 'textDecoration', 'textCase', 'textSegments',
                'textGradient', 'textStyleTemplate', 'fontUuid', 'fontFileName', 'fontWeightMatched',
            ],
        },
        {
            label: '图片',
            keys: [
                'imageBase64', 'imageRef', 'imageName', 'imageFill', 'solidFill', 'color',
                'overlayTint', 'tintedImageBase64',
            ],
        },
        {
            label: '组件与语义',
            keys: ['componentType', 'componentKey', 'componentProperties', 'inputSpec', 'slice9Border'],
        },
        { label: '遮罩', keys: ['mask'] },
        { label: '层级', keys: ['children'] },
    ],
};

const MAX_NODE_SAMPLES = 3;
const DEFAULT_NODE_BLEND_MODES = new Set(['', 'NORMAL', 'PASS_THROUGH']);
const DEFAULT_PAINT_BLEND_MODES = new Set(['', 'NORMAL']);
const KNOWN_EXPORT_KEYS = keySet(MAPPING_DIAGNOSTIC_KEY_GROUPS.export);
const KNOWN_INTERFACE_KEYS = keySet(MAPPING_DIAGNOSTIC_KEY_GROUPS.interface);
const KNOWN_NODE_KEYS = keySet(MAPPING_DIAGNOSTIC_KEY_GROUPS.node);

function keySet(groups: readonly MappingDiagnosticKeyGroup[]): Set<string> {
    const keys = new Set<string>();
    for (const group of groups) {
        for (const key of group.keys) keys.add(key);
    }
    return keys;
}

function upper(value: unknown): string {
    return String(value || '').trim().toUpperCase();
}

function finiteNumber(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function formatNumber(value: unknown): string {
    const numeric = finiteNumber(value);
    return Number.isInteger(numeric) ? String(numeric) : String(Math.round(numeric * 1000) / 1000);
}

function formatEffect(effect: any): string {
    const type = upper(effect && effect.type) || 'UNKNOWN';
    return `${type}(` +
        `radius=${formatNumber(effect && effect.radius)}, ` +
        `offset=${formatNumber(effect && effect.offsetX)},${formatNumber(effect && effect.offsetY)}, ` +
        `spread=${formatNumber(effect && effect.spread)}, ` +
        `blendMode=${upper(effect && effect.blendMode) || 'NORMAL'})`;
}

function nodeRef(node: FigmaNodeData, path: string): MappingDiagnosticNode {
    return {
        name: String(node.name || node.type || 'Unnamed'),
        figmaId: String(node.figmaId || ''),
        path,
    };
}

function inspectEffects(
    node: FigmaNodeData,
    path: string,
    add: MappingDiagnosticAdder,
): void {
    const effects = Array.isArray(node.effects)
        ? node.effects.filter((effect: any) => effect && effect.visible !== false)
        : [];
    const dropShadows = effects.filter((effect: any) => upper(effect.type) === 'DROP_SHADOW');

    if (upper(node.type) === 'TEXT' && dropShadows.length > 1) {
        add(
            'text-multiple-drop-shadows',
            `${dropShadows.length} visible DROP_SHADOW`,
            node,
            path,
        );
    }

    for (const effect of effects) {
        const type = upper(effect.type);
        const value = formatEffect(effect);
        if (type === 'DROP_SHADOW') {
            if (upper(node.type) !== 'TEXT') {
                add(
                    'non-text-drop-shadow',
                    value,
                    node,
                    path,
                );
                continue;
            }
            if (finiteNumber(effect.spread) !== 0) {
                add(
                    'text-shadow-spread',
                    formatNumber(effect.spread),
                    node,
                    path,
                );
            }
            const blendMode = upper(effect.blendMode);
            if (!DEFAULT_PAINT_BLEND_MODES.has(blendMode)) {
                add(
                    'text-shadow-blend-mode',
                    blendMode,
                    node,
                    path,
                );
            }
            continue;
        }

        if (type === 'BACKGROUND_BLUR') {
            add(
                'background-blur',
                value,
                node,
                path,
            );
            continue;
        }

        if (type === 'LAYER_BLUR') {
            add(
                'layer-blur',
                value,
                node,
                path,
            );
            continue;
        }

        if (type === 'INNER_SHADOW') {
            add(
                'inner-shadow',
                value,
                node,
                path,
            );
            continue;
        }

        if (type) {
            add(
                'unknown-effect-type',
                value,
                node,
                path,
            );
        }
    }
}

function inspectPaints(
    node: FigmaNodeData,
    path: string,
    add: MappingDiagnosticAdder,
): void {
    const fills = Array.isArray(node.fills)
        ? node.fills.filter((paint: any) => paint && paint.visible !== false)
        : [];
    if (fills.length > 1) {
        add(
            'multiple-visible-fills',
            fills.map((paint: any) => upper(paint.type) || 'UNKNOWN').join(' + '),
            node,
            path,
        );
    }

    for (const fill of fills) {
        const type = upper(fill.type);
        const blendMode = upper(fill.blendMode);
        if (!DEFAULT_PAINT_BLEND_MODES.has(blendMode)) {
            add(
                'fill-blend-mode',
                blendMode,
                node,
                path,
            );
        }

        const gradientMode = upper(fill.gradientMode);
        if (gradientMode) {
            add(
                'fill-gradient',
                gradientMode,
                node,
                path,
            );
            continue;
        }

        if (type.startsWith('GRADIENT_')) {
            add(
                'native-gradient-fill',
                type,
                node,
                path,
            );
            continue;
        }

        if (type && type !== 'SOLID' && type !== 'IMAGE') {
            add(
                'unknown-fill-type',
                type,
                node,
                path,
            );
        }
    }

    const strokes = Array.isArray(node.strokes)
        ? node.strokes.filter((paint: any) => paint && paint.visible !== false)
        : [];
    if (strokes.length > 0 && upper(node.type) !== 'TEXT') {
        add(
            'non-text-strokes',
            strokes.map((paint: any) => upper(paint.type) || 'UNKNOWN').join(' + '),
            node,
            path,
        );
    } else if (strokes.length > 1) {
        add(
            'multiple-text-strokes',
            `${strokes.length} visible strokes`,
            node,
            path,
        );
    }

    for (const stroke of strokes) {
        const blendMode = upper(stroke.blendMode);
        if (!DEFAULT_PAINT_BLEND_MODES.has(blendMode)) {
            add(
                'stroke-blend-mode',
                blendMode,
                node,
                path,
            );
        }
    }
}

interface MappingDiagnosticRoot {
    root: FigmaNodeData;
    parents: string[];
}

interface MappingDiagnosticKeyTarget {
    value: Record<string, unknown>;
    knownKeys: Set<string>;
    scope: 'export' | 'interfaces[]';
    refNode: FigmaNodeData;
    path: string;
}

const UNKNOWN_KEY_CAPABILITY_BY_SCOPE: Record<
    'export' | 'interfaces[]' | 'node',
    MappingCapabilityId
> = {
    export: 'unknown-export-key',
    'interfaces[]': 'unknown-interface-key',
    node: 'unknown-node-key',
};

function describeKeyValue(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'object') return 'object';
    return typeof value;
}

function collectMappingDiagnosticsFromRoots(
    roots: MappingDiagnosticRoot[],
    keyTargets: MappingDiagnosticKeyTarget[] = [],
): MappingDiagnosticSummary {
    if (roots.length === 0 && keyTargets.length === 0) return { entries: [], occurrenceCount: 0 };

    const grouped = new Map<string, MutableMappingDiagnosticEntry>();
    const add: MappingDiagnosticAdder = (
        capabilityId,
        value: string,
        node: FigmaNodeData,
        path: string,
        fieldOverride?: string,
    ): void => {
        const capability = getMappingCapability(capabilityId);
        const field = fieldOverride || capability.field;
        const key = `${capabilityId}\u0000${field}\u0000${value}`;
        let entry = grouped.get(key);
        if (!entry) {
            entry = {
                code: capabilityId,
                level: capability.level,
                field,
                value,
                handling: capability.handling,
                reason: capability.reason,
                count: 0,
                nodes: [],
                nodeKeys: new Set<string>(),
            };
            grouped.set(key, entry);
        }
        entry.count++;
        const ref = nodeRef(node, path);
        const nodeKey = `${ref.figmaId}\u0000${ref.path}`;
        if (entry.nodes.length < MAX_NODE_SAMPLES && !entry.nodeKeys.has(nodeKey)) {
            entry.nodeKeys.add(nodeKey);
            entry.nodes.push(ref);
        }
    };

    const inspectUnknownKeys = (
        value: Record<string, unknown>,
        knownKeys: Set<string>,
        scope: 'export' | 'interfaces[]' | 'node',
        node: FigmaNodeData,
        path: string,
    ): void => {
        for (const key of Object.keys(value).sort()) {
            if (knownKeys.has(key)) continue;
            add(
                UNKNOWN_KEY_CAPABILITY_BY_SCOPE[scope],
                describeKeyValue(value[key]),
                node,
                path,
                `${scope}.${key}`,
            );
        }
    };

    for (const target of keyTargets) {
        inspectUnknownKeys(target.value, target.knownKeys, target.scope, target.refNode, target.path);
    }

    // Use an explicit breadth-first queue so a broad contract scan never follows
    // one deep branch while postponing sibling capability domains.
    const queue: Array<{ node: FigmaNodeData; parents: string[] }> = roots.map((item) => ({
        node: item.root,
        parents: item.parents,
    }));
    for (let index = 0; index < queue.length; index++) {
        const { node, parents } = queue[index];
        const name = String(node.name || node.type || 'Unnamed');
        const path = [...parents, name].join(' / ');
        inspectUnknownKeys(node, KNOWN_NODE_KEYS, 'node', node, path);
        const blendMode = upper(node.blendMode);
        if (!DEFAULT_NODE_BLEND_MODES.has(blendMode)) {
            add(
                'node-blend-mode',
                blendMode,
                node,
                path,
            );
        }
        inspectEffects(node, path, add);
        inspectPaints(node, path, add);
        for (const child of node.children || []) {
            if (child) queue.push({ node: child, parents: [...parents, name] });
        }
    }
    const entries = Array.from(grouped.values())
        .map(({ nodeKeys: _nodeKeys, ...entry }) => entry)
        .sort((left, right) => {
            if (left.level !== right.level) return left.level === 'unsupported' ? -1 : 1;
            return `${left.field}\u0000${left.value}`.localeCompare(`${right.field}\u0000${right.value}`);
        });
    return {
        entries,
        occurrenceCount: entries.reduce((total, entry) => total + entry.count, 0),
    };
}

export function collectMappingDiagnostics(root: FigmaNodeData | null | undefined): MappingDiagnosticSummary {
    if (!root) return { entries: [], occurrenceCount: 0 };
    return collectMappingDiagnosticsFromRoots([{ root, parents: [] }]);
}

/** Scan the complete Figma export envelope, including every interface root in multi-interface JSON. */
export function collectExportMappingDiagnostics(
    data: FigmaExportData | null | undefined,
): MappingDiagnosticSummary {
    if (!data) return { entries: [], occurrenceCount: 0 };

    const roots: MappingDiagnosticRoot[] = [];
    const keyTargets: MappingDiagnosticKeyTarget[] = [];
    const seenRoots = new Set<FigmaNodeData>();
    const interfaces = Array.isArray(data.interfaces)
        ? data.interfaces.filter((item: any) => item)
        : [];

    const addRoot = (root: FigmaNodeData, parents: string[]): void => {
        if (!root || seenRoots.has(root)) return;
        seenRoots.add(root);
        roots.push({ root, parents });
    };

    if (data.root) addRoot(data.root, []);
    for (const iface of interfaces) {
        const interfaceName = String(iface.name || (iface.root && iface.root.name) || 'Unnamed');
        const interfaceRefNode = iface.root || ({
            figmaId: '',
            name: interfaceName,
            type: 'INTERFACE',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            children: [],
        } as FigmaNodeData);
        if (iface.root) addRoot(iface.root, [`界面:${interfaceName}`]);
        keyTargets.push({
            value: iface,
            knownKeys: KNOWN_INTERFACE_KEYS,
            scope: 'interfaces[]',
            refNode: interfaceRefNode,
            path: `界面:${interfaceName}`,
        });
    }

    const exportName = String(data.name || (roots.length > 0 ? roots[0].root.name : '') || 'Unnamed');
    const exportRefNode = roots.length > 0 ? roots[0].root : ({
        figmaId: '',
        name: exportName,
        type: 'EXPORT',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        children: [],
    } as FigmaNodeData);
    keyTargets.push({
        value: data as unknown as Record<string, unknown>,
        knownKeys: KNOWN_EXPORT_KEYS,
        scope: 'export',
        refNode: exportRefNode,
        path: `导出包:${exportName}`,
    });
    return collectMappingDiagnosticsFromRoots(roots, keyTargets);
}

function formatNode(ref: MappingDiagnosticNode): string {
    return `${ref.path}${ref.figmaId ? ` [${ref.figmaId}]` : ''}`;
}

export function formatMappingDiagnostics(summary: MappingDiagnosticSummary): string {
    if (summary.entries.length === 0) return '';
    const unsupported = summary.entries
        .filter((entry) => entry.level === 'unsupported')
        .reduce((total, entry) => total + entry.count, 0);
    const fallback = summary.occurrenceCount - unsupported;
    const lines = [
        `[figma-importer] Figma 参数映射告警：${summary.entries.length} 类 / ${summary.occurrenceCount} 处` +
        `（未映射 ${unsupported}，降级 ${fallback}）`,
    ];
    summary.entries.forEach((entry, index) => {
        const label = entry.level === 'unsupported' ? '未映射' : '降级';
        lines.push(`  ${index + 1}. [${label}] ${entry.field} = ${entry.value} ×${entry.count}`);
        lines.push(`     原因：${entry.reason}`);
        const omitted = Math.max(0, entry.count - entry.nodes.length);
        lines.push(
            `     节点：${entry.nodes.map(formatNode).join('；')}` +
            `${omitted > 0 ? `；另有 ${omitted} 处同类节点` : ''}`,
        );
    });
    lines.push('  以上参数已由 Figma 送达，但当前 Cocos 未完整还原；同类参数已聚合，本次仅输出这一条 warning。');
    return lines.join('\n');
}

export function reportMappingDiagnostics(
    source: FigmaExportData | FigmaNodeData | null | undefined,
    logger: MappingDiagnosticLogger = (message) => console.warn(message),
): MappingDiagnosticSummary {
    const sourceAsExport = source as FigmaExportData | null | undefined;
    const summary = sourceAsExport && (sourceAsExport.root || Array.isArray(sourceAsExport.interfaces))
        ? collectExportMappingDiagnostics(sourceAsExport)
        : collectMappingDiagnostics(source as FigmaNodeData | null | undefined);
    const message = formatMappingDiagnostics(summary);
    if (message) logger(message);
    return summary;
}
