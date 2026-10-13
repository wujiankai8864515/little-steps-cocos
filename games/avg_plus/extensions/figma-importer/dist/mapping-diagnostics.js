"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAPPING_DIAGNOSTIC_KEY_GROUPS = exports.MAPPING_CAPABILITY_REGISTRY = void 0;
exports.collectMappingDiagnostics = collectMappingDiagnostics;
exports.collectExportMappingDiagnostics = collectExportMappingDiagnostics;
exports.formatMappingDiagnostics = formatMappingDiagnostics;
exports.reportMappingDiagnostics = reportMappingDiagnostics;
const mapping_capabilities_1 = require("./mapping-capabilities");
var mapping_capabilities_2 = require("./mapping-capabilities");
Object.defineProperty(exports, "MAPPING_CAPABILITY_REGISTRY", { enumerable: true, get: function () { return mapping_capabilities_2.MAPPING_CAPABILITY_REGISTRY; } });
/**
 * Broad, key-level contract inventory. This deliberately stops at fields such as
 * fills[]/slice9Border/componentProperties; value-level fidelity stays in focused rules below.
 */
exports.MAPPING_DIAGNOSTIC_KEY_GROUPS = {
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
const KNOWN_EXPORT_KEYS = keySet(exports.MAPPING_DIAGNOSTIC_KEY_GROUPS.export);
const KNOWN_INTERFACE_KEYS = keySet(exports.MAPPING_DIAGNOSTIC_KEY_GROUPS.interface);
const KNOWN_NODE_KEYS = keySet(exports.MAPPING_DIAGNOSTIC_KEY_GROUPS.node);
function keySet(groups) {
    const keys = new Set();
    for (const group of groups) {
        for (const key of group.keys)
            keys.add(key);
    }
    return keys;
}
function upper(value) {
    return String(value || '').trim().toUpperCase();
}
function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}
function formatNumber(value) {
    const numeric = finiteNumber(value);
    return Number.isInteger(numeric) ? String(numeric) : String(Math.round(numeric * 1000) / 1000);
}
function formatEffect(effect) {
    const type = upper(effect && effect.type) || 'UNKNOWN';
    return `${type}(` +
        `radius=${formatNumber(effect && effect.radius)}, ` +
        `offset=${formatNumber(effect && effect.offsetX)},${formatNumber(effect && effect.offsetY)}, ` +
        `spread=${formatNumber(effect && effect.spread)}, ` +
        `blendMode=${upper(effect && effect.blendMode) || 'NORMAL'})`;
}
function nodeRef(node, path) {
    return {
        name: String(node.name || node.type || 'Unnamed'),
        figmaId: String(node.figmaId || ''),
        path,
    };
}
function inspectEffects(node, path, add) {
    const effects = Array.isArray(node.effects)
        ? node.effects.filter((effect) => effect && effect.visible !== false)
        : [];
    const dropShadows = effects.filter((effect) => upper(effect.type) === 'DROP_SHADOW');
    if (upper(node.type) === 'TEXT' && dropShadows.length > 1) {
        add('text-multiple-drop-shadows', `${dropShadows.length} visible DROP_SHADOW`, node, path);
    }
    for (const effect of effects) {
        const type = upper(effect.type);
        const value = formatEffect(effect);
        if (type === 'DROP_SHADOW') {
            if (upper(node.type) !== 'TEXT') {
                add('non-text-drop-shadow', value, node, path);
                continue;
            }
            if (finiteNumber(effect.spread) !== 0) {
                add('text-shadow-spread', formatNumber(effect.spread), node, path);
            }
            const blendMode = upper(effect.blendMode);
            if (!DEFAULT_PAINT_BLEND_MODES.has(blendMode)) {
                add('text-shadow-blend-mode', blendMode, node, path);
            }
            continue;
        }
        if (type === 'BACKGROUND_BLUR') {
            add('background-blur', value, node, path);
            continue;
        }
        if (type === 'LAYER_BLUR') {
            add('layer-blur', value, node, path);
            continue;
        }
        if (type === 'INNER_SHADOW') {
            add('inner-shadow', value, node, path);
            continue;
        }
        if (type) {
            add('unknown-effect-type', value, node, path);
        }
    }
}
function inspectPaints(node, path, add) {
    const fills = Array.isArray(node.fills)
        ? node.fills.filter((paint) => paint && paint.visible !== false)
        : [];
    if (fills.length > 1) {
        add('multiple-visible-fills', fills.map((paint) => upper(paint.type) || 'UNKNOWN').join(' + '), node, path);
    }
    for (const fill of fills) {
        const type = upper(fill.type);
        const blendMode = upper(fill.blendMode);
        if (!DEFAULT_PAINT_BLEND_MODES.has(blendMode)) {
            add('fill-blend-mode', blendMode, node, path);
        }
        const gradientMode = upper(fill.gradientMode);
        if (gradientMode) {
            add('fill-gradient', gradientMode, node, path);
            continue;
        }
        if (type.startsWith('GRADIENT_')) {
            add('native-gradient-fill', type, node, path);
            continue;
        }
        if (type && type !== 'SOLID' && type !== 'IMAGE') {
            add('unknown-fill-type', type, node, path);
        }
    }
    const strokes = Array.isArray(node.strokes)
        ? node.strokes.filter((paint) => paint && paint.visible !== false)
        : [];
    if (strokes.length > 0 && upper(node.type) !== 'TEXT') {
        add('non-text-strokes', strokes.map((paint) => upper(paint.type) || 'UNKNOWN').join(' + '), node, path);
    }
    else if (strokes.length > 1) {
        add('multiple-text-strokes', `${strokes.length} visible strokes`, node, path);
    }
    for (const stroke of strokes) {
        const blendMode = upper(stroke.blendMode);
        if (!DEFAULT_PAINT_BLEND_MODES.has(blendMode)) {
            add('stroke-blend-mode', blendMode, node, path);
        }
    }
}
const UNKNOWN_KEY_CAPABILITY_BY_SCOPE = {
    export: 'unknown-export-key',
    'interfaces[]': 'unknown-interface-key',
    node: 'unknown-node-key',
};
function describeKeyValue(value) {
    if (value === null)
        return 'null';
    if (Array.isArray(value))
        return 'array';
    if (typeof value === 'string')
        return 'string';
    if (typeof value === 'object')
        return 'object';
    return typeof value;
}
function collectMappingDiagnosticsFromRoots(roots, keyTargets = []) {
    if (roots.length === 0 && keyTargets.length === 0)
        return { entries: [], occurrenceCount: 0 };
    const grouped = new Map();
    const add = (capabilityId, value, node, path, fieldOverride) => {
        const capability = (0, mapping_capabilities_1.getMappingCapability)(capabilityId);
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
                nodeKeys: new Set(),
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
    const inspectUnknownKeys = (value, knownKeys, scope, node, path) => {
        for (const key of Object.keys(value).sort()) {
            if (knownKeys.has(key))
                continue;
            add(UNKNOWN_KEY_CAPABILITY_BY_SCOPE[scope], describeKeyValue(value[key]), node, path, `${scope}.${key}`);
        }
    };
    for (const target of keyTargets) {
        inspectUnknownKeys(target.value, target.knownKeys, target.scope, target.refNode, target.path);
    }
    // Use an explicit breadth-first queue so a broad contract scan never follows
    // one deep branch while postponing sibling capability domains.
    const queue = roots.map((item) => ({
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
            add('node-blend-mode', blendMode, node, path);
        }
        inspectEffects(node, path, add);
        inspectPaints(node, path, add);
        for (const child of node.children || []) {
            if (child)
                queue.push({ node: child, parents: [...parents, name] });
        }
    }
    const entries = Array.from(grouped.values())
        .map((_a) => {
        var { nodeKeys: _nodeKeys } = _a, entry = __rest(_a, ["nodeKeys"]);
        return entry;
    })
        .sort((left, right) => {
        if (left.level !== right.level)
            return left.level === 'unsupported' ? -1 : 1;
        return `${left.field}\u0000${left.value}`.localeCompare(`${right.field}\u0000${right.value}`);
    });
    return {
        entries,
        occurrenceCount: entries.reduce((total, entry) => total + entry.count, 0),
    };
}
function collectMappingDiagnostics(root) {
    if (!root)
        return { entries: [], occurrenceCount: 0 };
    return collectMappingDiagnosticsFromRoots([{ root, parents: [] }]);
}
/** Scan the complete Figma export envelope, including every interface root in multi-interface JSON. */
function collectExportMappingDiagnostics(data) {
    if (!data)
        return { entries: [], occurrenceCount: 0 };
    const roots = [];
    const keyTargets = [];
    const seenRoots = new Set();
    const interfaces = Array.isArray(data.interfaces)
        ? data.interfaces.filter((item) => item)
        : [];
    const addRoot = (root, parents) => {
        if (!root || seenRoots.has(root))
            return;
        seenRoots.add(root);
        roots.push({ root, parents });
    };
    if (data.root)
        addRoot(data.root, []);
    for (const iface of interfaces) {
        const interfaceName = String(iface.name || (iface.root && iface.root.name) || 'Unnamed');
        const interfaceRefNode = iface.root || {
            figmaId: '',
            name: interfaceName,
            type: 'INTERFACE',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            children: [],
        };
        if (iface.root)
            addRoot(iface.root, [`界面:${interfaceName}`]);
        keyTargets.push({
            value: iface,
            knownKeys: KNOWN_INTERFACE_KEYS,
            scope: 'interfaces[]',
            refNode: interfaceRefNode,
            path: `界面:${interfaceName}`,
        });
    }
    const exportName = String(data.name || (roots.length > 0 ? roots[0].root.name : '') || 'Unnamed');
    const exportRefNode = roots.length > 0 ? roots[0].root : {
        figmaId: '',
        name: exportName,
        type: 'EXPORT',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        children: [],
    };
    keyTargets.push({
        value: data,
        knownKeys: KNOWN_EXPORT_KEYS,
        scope: 'export',
        refNode: exportRefNode,
        path: `导出包:${exportName}`,
    });
    return collectMappingDiagnosticsFromRoots(roots, keyTargets);
}
function formatNode(ref) {
    return `${ref.path}${ref.figmaId ? ` [${ref.figmaId}]` : ''}`;
}
function formatMappingDiagnostics(summary) {
    if (summary.entries.length === 0)
        return '';
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
        lines.push(`     节点：${entry.nodes.map(formatNode).join('；')}` +
            `${omitted > 0 ? `；另有 ${omitted} 处同类节点` : ''}`);
    });
    lines.push('  以上参数已由 Figma 送达，但当前 Cocos 未完整还原；同类参数已聚合，本次仅输出这一条 warning。');
    return lines.join('\n');
}
function reportMappingDiagnostics(source, logger = (message) => console.warn(message)) {
    const sourceAsExport = source;
    const summary = sourceAsExport && (sourceAsExport.root || Array.isArray(sourceAsExport.interfaces))
        ? collectExportMappingDiagnostics(sourceAsExport)
        : collectMappingDiagnostics(source);
    const message = formatMappingDiagnostics(summary);
    if (message)
        logger(message);
    return summary;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFwcGluZy1kaWFnbm9zdGljcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYXBwaW5nLWRpYWdub3N0aWNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7O0FBb2ZBLDhEQUdDO0FBR0QsMEVBOERDO0FBTUQsNERBc0JDO0FBRUQsNERBV0M7QUFobUJELGlFQUtnQztBQUdoQywrREFBcUU7QUFBNUQsbUlBQUEsMkJBQTJCLE9BQUE7QUEyQ3BDOzs7R0FHRztBQUNVLFFBQUEsNkJBQTZCLEdBSXRDO0lBQ0EsTUFBTSxFQUFFO1FBQ0osRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxDQUFDLFNBQVMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sQ0FBQyxFQUFFO1FBQy9ELEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLFlBQVksQ0FBQyxFQUFFO1FBQzFEO1lBQ0ksS0FBSyxFQUFFLFNBQVM7WUFDaEIsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLGlCQUFpQixFQUFFLG9CQUFvQixFQUFFLGFBQWEsQ0FBQztTQUMzRTtRQUNEO1lBQ0ksS0FBSyxFQUFFLFVBQVU7WUFDakIsSUFBSSxFQUFFO2dCQUNGLGNBQWMsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxXQUFXO2dCQUNqRSxlQUFlLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxTQUFTO2FBQ3ZEO1NBQ0o7S0FDSjtJQUNELFNBQVMsRUFBRTtRQUNQLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRTtRQUNqQyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLEVBQUU7UUFDbEUsRUFBRSxLQUFLLEVBQUUs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LE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sT0FBTyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUNqRCxDQUFDO0lBQ04sQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsSUFBSSxDQUFDLDZEQUE2RCxDQUFDLENBQUM7SUFDMUUsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzVCLENBQUM7QUFFRCxTQUFnQix3QkFBd0IsQ0FDcEMsTUFBMEQsRUFDMUQsU0FBa0MsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBRXBFLE1BQU0sY0FBYyxHQUFHLE1BQTRDLENBQUM7SUFDcEUsTUFBTSxPQUFPLEdBQUcsY0FBYyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMvRixDQUFDLENBQUMsK0JBQStCLENBQUMsY0FBYyxDQUFDO1FBQ2pELENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxNQUEwQyxDQUFDLENBQUM7SUFDNUUsTUFBTSxPQUFPLEdBQUcsd0JBQXdCLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbEQsSUFBSSxPQUFPO1FBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzdCLE9BQU8sT0FBTyxDQUFDO0FBQ25CLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBGaWdtYUV4cG9ydERhdGEsIEZpZ21hTm9kZURhdGEgfSBmcm9tICcuL3R5cGVzJztcbmltcG9ydCB7XG4gICAgTWFwcGluZ0NhcGFiaWxpdHlJZCxcbiAgICBNYXBwaW5nQ2FwYWJpbGl0eUhhbmRsaW5nLFxuICAgIE1hcHBpbmdDYXBhYmlsaXR5TGV2ZWwsXG4gICAgZ2V0TWFwcGluZ0NhcGFiaWxpdHksXG59IGZyb20gJy4vbWFwcGluZy1jYXBhYmlsaXRpZXMnO1xuXG5leHBvcnQgdHlwZSBNYXBwaW5nRGlhZ25vc3RpY0xldmVsID0gTWFwcGluZ0NhcGFiaWxpdHlMZXZlbDtcbmV4cG9ydCB7IE1BUFBJTkdfQ0FQQUJJTElUWV9SRUdJU1RSWSB9IGZyb20gJy4vbWFwcGluZy1jYXBhYmlsaXRpZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1hcHBpbmdEaWFnbm9zdGljTm9kZSB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGZpZ21hSWQ6IHN0cmluZztcbiAgICBwYXRoOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFwcGluZ0RpYWdub3N0aWNFbnRyeSB7XG4gICAgY29kZTogTWFwcGluZ0NhcGFiaWxpdHlJZDtcbiAgICBsZXZlbDogTWFwcGluZ0RpYWdub3N0aWNMZXZlbDtcbiAgICBmaWVsZDogc3RyaW5nO1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gICAgaGFuZGxpbmc6IE1hcHBpbmdDYXBhYmlsaXR5SGFuZGxpbmc7XG4gICAgcmVhc29uOiBzdHJpbmc7XG4gICAgY291bnQ6IG51bWJlcjtcbiAgICBub2RlczogTWFwcGluZ0RpYWdub3N0aWNOb2RlW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFwcGluZ0RpYWdub3N0aWNTdW1tYXJ5IHtcbiAgICBlbnRyaWVzOiBNYXBwaW5nRGlhZ25vc3RpY0VudHJ5W107XG4gICAgb2NjdXJyZW5jZUNvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBNdXRhYmxlTWFwcGluZ0RpYWdub3N0aWNFbnRyeSBleHRlbmRzIE1hcHBpbmdEaWFnbm9zdGljRW50cnkge1xuICAgIG5vZGVLZXlzOiBTZXQ8c3RyaW5nPjtcbn1cblxudHlwZSBNYXBwaW5nRGlhZ25vc3RpY0xvZ2dlciA9IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQ7XG5cbnR5cGUgTWFwcGluZ0RpYWdub3N0aWNBZGRlciA9IChcbiAgICBjYXBhYmlsaXR5SWQ6IE1hcHBpbmdDYXBhYmlsaXR5SWQsXG4gICAgdmFsdWU6IHN0cmluZyxcbiAgICBub2RlOiBGaWdtYU5vZGVEYXRhLFxuICAgIHBhdGg6IHN0cmluZyxcbiAgICBmaWVsZE92ZXJyaWRlPzogc3RyaW5nLFxuKSA9PiB2b2lkO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1hcHBpbmdEaWFnbm9zdGljS2V5R3JvdXAge1xuICAgIGxhYmVsOiBzdHJpbmc7XG4gICAga2V5czogcmVhZG9ubHkgc3RyaW5nW107XG59XG5cbi8qKlxuICogQnJvYWQsIGtleS1sZXZlbCBjb250cmFjdCBpbnZlbnRvcnkuIFRoaXMgZGVsaWJlcmF0ZWx5IHN0b3BzIGF0IGZpZWxkcyBzdWNoIGFzXG4gKiBmaWxsc1tdL3NsaWNlOUJvcmRlci9jb21wb25lbnRQcm9wZXJ0aWVzOyB2YWx1ZS1sZXZlbCBmaWRlbGl0eSBzdGF5cyBpbiBmb2N1c2VkIHJ1bGVzIGJlbG93LlxuICovXG5leHBvcnQgY29uc3QgTUFQUElOR19ESUFHTk9TVElDX0tFWV9HUk9VUFM6IHtcbiAgICBleHBvcnQ6IHJlYWRvbmx5IE1hcHBpbmdEaWFnbm9zdGljS2V5R3JvdXBbXTtcbiAgICBpbnRlcmZhY2U6IHJlYWRvbmx5IE1hcHBpbmdEaWFnbm9zdGljS2V5R3JvdXBbXTtcbiAgICBub2RlOiByZWFkb25seSBNYXBwaW5nRGlhZ25vc3RpY0tleUdyb3VwW107XG59ID0ge1xuICAgIGV4cG9ydDogW1xuICAgICAgICB7IGxhYmVsOiAn5paH5qGj6Lqr5Lu9Jywga2V5czogWyd2ZXJzaW9uJywgJ25hbWUnLCAnZmlsZUtleScsICd1dWlkJ10gfSxcbiAgICAgICAgeyBsYWJlbDogJ+eUu+W4g+S4juWxgue6pycsIGtleXM6IFsnY2FudmFzJywgJ3Jvb3QnLCAnaW50ZXJmYWNlcyddIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxhYmVsOiAn6LWE5rqQ5LiO5a+85Ye65L+h5oGvJyxcbiAgICAgICAgICAgIGtleXM6IFsnaW1hZ2VzJywgJ3ByZXZpZXdJbWFnZVJlZicsICdwcmV2aWV3SW1hZ2VCYXNlNjQnLCAnZXhwb3J0UHJ1bmUnXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgbGFiZWw6ICflsIHlpZfkuI7mnaXmupDlhYPmlbDmja4nLFxuICAgICAgICAgICAga2V5czogW1xuICAgICAgICAgICAgICAgICdidWlsZFZlcnNpb24nLCAnY3JlYXRvcicsICdnZW5lcmF0b3InLCAnc291cmNlTmFtZScsICd1cGRhdGVkQXQnLFxuICAgICAgICAgICAgICAgICdzdHlsZVJvb3ROYW1lJywgJ3N0eWxlUm9vdFBhdGgnLCAnc3RhdHMnLCAnZW50cmllcycsXG4gICAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgIF0sXG4gICAgaW50ZXJmYWNlOiBbXG4gICAgICAgIHsgbGFiZWw6ICfnlYzpnaLouqvku70nLCBrZXlzOiBbJ25hbWUnXSB9LFxuICAgICAgICB7IGxhYmVsOiAn55S75biD5LiO5bGC57qnJywga2V5czogWydjYW52YXMnLCAncm9vdCcsICdvZmZzZXRYJywgJ29mZnNldFknXSB9LFxuICAgICAgICB7IGxhYmVsOiAn6aKE6KeI6LWE5rqQJywga2V5czogWydwcmV2aWV3SW1hZ2VSZWYnLCAncHJldmlld0ltYWdlQmFzZTY0J10gfSxcbiAgICBdLFxuICAgIG5vZGU6IFtcbiAgICAgICAgeyBsYWJlbDogJ+iKgueCuei6q+S7vScsIGtleXM6IFsnZmlnbWFJZCcsICduYW1lJywgJ3R5cGUnLCAnZmlnbWFUeXBlJ10gfSxcbiAgICAgICAge1xuICAgICAgICAgICAgbGFiZWw6ICflh6DkvZXkuI7lj5jmjaInLFxuICAgICAgICAgICAga2V5czogW1xuICAgICAgICAgICAgICAgICd4JywgJ3knLCAnd2lkdGgnLCAnaGVpZ2h0JywgJ3JvdGF0aW9uJywgJ3JvdGF0aW9uWCcsICdyb3RhdGlvblknLFxuICAgICAgICAgICAgICAgICdzY2FsZVgnLCAnc2NhbGVZJywgJ3Bpdm90WCcsICdwaXZvdFknLCAncmVsYXRpdmVUcmFuc2Zvcm0nLCAnb3BhY2l0eScsICd2aXNpYmxlJyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxhYmVsOiAn6KeG6KeJJyxcbiAgICAgICAgICAgIGtleXM6IFtcbiAgICAgICAgICAgICAgICAnZmlsbHMnLCAnc3Ryb2tlcycsICdzdHJva2VXZWlnaHQnLCAnc3Ryb2tlQWxpZ24nLCAnZWZmZWN0cycsICdibGVuZE1vZGUnLFxuICAgICAgICAgICAgICAgICdjb3JuZXJSYWRpdXMnLCAnY29ybmVyUmFkaWknLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgbGFiZWw6ICfmoLflvI/lvJXnlKgnLFxuICAgICAgICAgICAga2V5czogW1xuICAgICAgICAgICAgICAgICdmaWxsU3R5bGVOYW1lJywgJ2ZpbGxTdHlsZUlkJywgJ3N0cm9rZVN0eWxlTmFtZScsICdzdHJva2VTdHlsZUlkJyxcbiAgICAgICAgICAgICAgICAnZWZmZWN0U3R5bGVOYW1lJywgJ2VmZmVjdFN0eWxlSWQnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgbGFiZWw6ICfluIPlsYDkuI7nuqbmnZ8nLFxuICAgICAgICAgICAga2V5czogW1xuICAgICAgICAgICAgICAgICdjbGlwc0NvbnRlbnQnLCAnbGF5b3V0TW9kZScsICdsYXlvdXRXcmFwJywgJ2dyaWRSb3dDb3VudCcsICdncmlkQ29sdW1uQ291bnQnLFxuICAgICAgICAgICAgICAgICdncmlkUm93R2FwJywgJ2dyaWRDb2x1bW5HYXAnLCAnaXRlbVNwYWNpbmcnLCAnY291bnRlckF4aXNTcGFjaW5nJywgJ3BhZGRpbmcnLFxuICAgICAgICAgICAgICAgICdwcmltYXJ5QXhpc0FsaWduSXRlbXMnLCAnY291bnRlckF4aXNBbGlnbkl0ZW1zJywgJ2xheW91dFBvc2l0aW9uaW5nJywgJ2NvbnN0cmFpbnRzJyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIGxhYmVsOiAn5paH5a2XJyxcbiAgICAgICAgICAgIGtleXM6IFtcbiAgICAgICAgICAgICAgICAnY2hhcmFjdGVycycsICdmb250U2l6ZScsICdmb250RmFtaWx5JywgJ2ZvbnRXZWlnaHQnLCAndGV4dFN0eWxlTmFtZScsICd0ZXh0U3R5bGVJZCcsXG4gICAgICAgICAgICAgICAgJ3RleHRBbGlnbkhvcml6b250YWwnLCAndGV4dEFsaWduVmVydGljYWwnLCAnbGluZUhlaWdodCcsICdsZXR0ZXJTcGFjaW5nJyxcbiAgICAgICAgICAgICAgICAndGV4dEF1dG9SZXNpemUnLCAndGV4dFRydW5jYXRpb24nLCAndGV4dERlY29yYXRpb24nLCAndGV4dENhc2UnLCAndGV4dFNlZ21lbnRzJyxcbiAgICAgICAgICAgICAgICAndGV4dEdyYWRpZW50JywgJ3RleHRTdHlsZVRlbXBsYXRlJywgJ2ZvbnRVdWlkJywgJ2ZvbnRGaWxlTmFtZScsICdmb250V2VpZ2h0TWF0Y2hlZCcsXG4gICAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBsYWJlbDogJ+WbvueJhycsXG4gICAgICAgICAgICBrZXlzOiBbXG4gICAgICAgICAgICAgICAgJ2ltYWdlQmFzZTY0JywgJ2ltYWdlUmVmJywgJ2ltYWdlTmFtZScsICdpbWFnZUZpbGwnLCAnc29saWRGaWxsJywgJ2NvbG9yJyxcbiAgICAgICAgICAgICAgICAnb3ZlcmxheVRpbnQnLCAndGludGVkSW1hZ2VCYXNlNjQnLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgbGFiZWw6ICfnu4Tku7bkuI7or63kuYknLFxuICAgICAgICAgICAga2V5czogWydjb21wb25lbnRUeXBlJywgJ2NvbXBvbmVudEtleScsICdjb21wb25lbnRQcm9wZXJ0aWVzJywgJ2lucHV0U3BlYycsICdzbGljZTlCb3JkZXInXSxcbiAgICAgICAgfSxcbiAgICAgICAgeyBsYWJlbDogJ+mBrue9qScsIGtleXM6IFsnbWFzayddIH0sXG4gICAgICAgIHsgbGFiZWw6ICflsYLnuqcnLCBrZXlzOiBbJ2NoaWxkcmVuJ10gfSxcbiAgICBdLFxufTtcblxuY29uc3QgTUFYX05PREVfU0FNUExFUyA9IDM7XG5jb25zdCBERUZBVUxUX05PREVfQkxFTkRfTU9ERVMgPSBuZXcgU2V0KFsnJywgJ05PUk1BTCcsICdQQVNTX1RIUk9VR0gnXSk7XG5jb25zdCBERUZBVUxUX1BBSU5UX0JMRU5EX01PREVTID0gbmV3IFNldChbJycsICdOT1JNQUwnXSk7XG5jb25zdCBLTk9XTl9FWFBPUlRfS0VZUyA9IGtleVNldChNQVBQSU5HX0RJQUdOT1NUSUNfS0VZX0dST1VQUy5leHBvcnQpO1xuY29uc3QgS05PV05fSU5URVJGQUNFX0tFWVMgPSBrZXlTZXQoTUFQUElOR19ESUFHTk9TVElDX0tFWV9HUk9VUFMuaW50ZXJmYWNlKTtcbmNvbnN0IEtOT1dOX05PREVfS0VZUyA9IGtleVNldChNQVBQSU5HX0RJQUdOT1NUSUNfS0VZX0dST1VQUy5ub2RlKTtcblxuZnVuY3Rpb24ga2V5U2V0KGdyb3VwczogcmVhZG9ubHkgTWFwcGluZ0RpYWdub3N0aWNLZXlHcm91cFtdKTogU2V0PHN0cmluZz4ge1xuICAgIGNvbnN0IGtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBncm91cC5rZXlzKSBrZXlzLmFkZChrZXkpO1xuICAgIH1cbiAgICByZXR1cm4ga2V5cztcbn1cblxuZnVuY3Rpb24gdXBwZXIodmFsdWU6IHVua25vd24pOiBzdHJpbmcge1xuICAgIHJldHVybiBTdHJpbmcodmFsdWUgfHwgJycpLnRyaW0oKS50b1VwcGVyQ2FzZSgpO1xufVxuXG5mdW5jdGlvbiBmaW5pdGVOdW1iZXIodmFsdWU6IHVua25vd24sIGZhbGxiYWNrID0gMCk6IG51bWJlciB7XG4gICAgY29uc3QgbnVtZXJpYyA9IE51bWJlcih2YWx1ZSk7XG4gICAgcmV0dXJuIE51bWJlci5pc0Zpbml0ZShudW1lcmljKSA/IG51bWVyaWMgOiBmYWxsYmFjaztcbn1cblxuZnVuY3Rpb24gZm9ybWF0TnVtYmVyKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcbiAgICBjb25zdCBudW1lcmljID0gZmluaXRlTnVtYmVyKHZhbHVlKTtcbiAgICByZXR1cm4gTnVtYmVyLmlzSW50ZWdlcihudW1lcmljKSA/IFN0cmluZyhudW1lcmljKSA6IFN0cmluZyhNYXRoLnJvdW5kKG51bWVyaWMgKiAxMDAwKSAvIDEwMDApO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRFZmZlY3QoZWZmZWN0OiBhbnkpOiBzdHJpbmcge1xuICAgIGNvbnN0IHR5cGUgPSB1cHBlcihlZmZlY3QgJiYgZWZmZWN0LnR5cGUpIHx8ICdVTktOT1dOJztcbiAgICByZXR1cm4gYCR7dHlwZX0oYCArXG4gICAgICAgIGByYWRpdXM9JHtmb3JtYXROdW1iZXIoZWZmZWN0ICYmIGVmZmVjdC5yYWRpdXMpfSwgYCArXG4gICAgICAgIGBvZmZzZXQ9JHtmb3JtYXROdW1iZXIoZWZmZWN0ICYmIGVmZmVjdC5vZmZzZXRYKX0sJHtmb3JtYXROdW1iZXIoZWZmZWN0ICYmIGVmZmVjdC5vZmZzZXRZKX0sIGAgK1xuICAgICAgICBgc3ByZWFkPSR7Zm9ybWF0TnVtYmVyKGVmZmVjdCAmJiBlZmZlY3Quc3ByZWFkKX0sIGAgK1xuICAgICAgICBgYmxlbmRNb2RlPSR7dXBwZXIoZWZmZWN0ICYmIGVmZmVjdC5ibGVuZE1vZGUpIHx8ICdOT1JNQUwnfSlgO1xufVxuXG5mdW5jdGlvbiBub2RlUmVmKG5vZGU6IEZpZ21hTm9kZURhdGEsIHBhdGg6IHN0cmluZyk6IE1hcHBpbmdEaWFnbm9zdGljTm9kZSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbmFtZTogU3RyaW5nKG5vZGUubmFtZSB8fCBub2RlLnR5cGUgfHwgJ1VubmFtZWQnKSxcbiAgICAgICAgZmlnbWFJZDogU3RyaW5nKG5vZGUuZmlnbWFJZCB8fCAnJyksXG4gICAgICAgIHBhdGgsXG4gICAgfTtcbn1cblxuZnVuY3Rpb24gaW5zcGVjdEVmZmVjdHMoXG4gICAgbm9kZTogRmlnbWFOb2RlRGF0YSxcbiAgICBwYXRoOiBzdHJpbmcsXG4gICAgYWRkOiBNYXBwaW5nRGlhZ25vc3RpY0FkZGVyLFxuKTogdm9pZCB7XG4gICAgY29uc3QgZWZmZWN0cyA9IEFycmF5LmlzQXJyYXkobm9kZS5lZmZlY3RzKVxuICAgICAgICA/IG5vZGUuZWZmZWN0cy5maWx0ZXIoKGVmZmVjdDogYW55KSA9PiBlZmZlY3QgJiYgZWZmZWN0LnZpc2libGUgIT09IGZhbHNlKVxuICAgICAgICA6IFtdO1xuICAgIGNvbnN0IGRyb3BTaGFkb3dzID0gZWZmZWN0cy5maWx0ZXIoKGVmZmVjdDogYW55KSA9PiB1cHBlcihlZmZlY3QudHlwZSkgPT09ICdEUk9QX1NIQURPVycpO1xuXG4gICAgaWYgKHVwcGVyKG5vZGUudHlwZSkgPT09ICdURVhUJyAmJiBkcm9wU2hhZG93cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGFkZChcbiAgICAgICAgICAgICd0ZXh0LW11bHRpcGxlLWRyb3Atc2hhZG93cycsXG4gICAgICAgICAgICBgJHtkcm9wU2hhZG93cy5sZW5ndGh9IHZpc2libGUgRFJPUF9TSEFET1dgLFxuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBlZmZlY3Qgb2YgZWZmZWN0cykge1xuICAgICAgICBjb25zdCB0eXBlID0gdXBwZXIoZWZmZWN0LnR5cGUpO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGZvcm1hdEVmZmVjdChlZmZlY3QpO1xuICAgICAgICBpZiAodHlwZSA9PT0gJ0RST1BfU0hBRE9XJykge1xuICAgICAgICAgICAgaWYgKHVwcGVyKG5vZGUudHlwZSkgIT09ICdURVhUJykge1xuICAgICAgICAgICAgICAgIGFkZChcbiAgICAgICAgICAgICAgICAgICAgJ25vbi10ZXh0LWRyb3Atc2hhZG93JyxcbiAgICAgICAgICAgICAgICAgICAgdmFsdWUsXG4gICAgICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmaW5pdGVOdW1iZXIoZWZmZWN0LnNwcmVhZCkgIT09IDApIHtcbiAgICAgICAgICAgICAgICBhZGQoXG4gICAgICAgICAgICAgICAgICAgICd0ZXh0LXNoYWRvdy1zcHJlYWQnLFxuICAgICAgICAgICAgICAgICAgICBmb3JtYXROdW1iZXIoZWZmZWN0LnNwcmVhZCksXG4gICAgICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IGJsZW5kTW9kZSA9IHVwcGVyKGVmZmVjdC5ibGVuZE1vZGUpO1xuICAgICAgICAgICAgaWYgKCFERUZBVUxUX1BBSU5UX0JMRU5EX01PREVTLmhhcyhibGVuZE1vZGUpKSB7XG4gICAgICAgICAgICAgICAgYWRkKFxuICAgICAgICAgICAgICAgICAgICAndGV4dC1zaGFkb3ctYmxlbmQtbW9kZScsXG4gICAgICAgICAgICAgICAgICAgIGJsZW5kTW9kZSxcbiAgICAgICAgICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSA9PT0gJ0JBQ0tHUk9VTkRfQkxVUicpIHtcbiAgICAgICAgICAgIGFkZChcbiAgICAgICAgICAgICAgICAnYmFja2dyb3VuZC1ibHVyJyxcbiAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSA9PT0gJ0xBWUVSX0JMVVInKSB7XG4gICAgICAgICAgICBhZGQoXG4gICAgICAgICAgICAgICAgJ2xheWVyLWJsdXInLFxuICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlID09PSAnSU5ORVJfU0hBRE9XJykge1xuICAgICAgICAgICAgYWRkKFxuICAgICAgICAgICAgICAgICdpbm5lci1zaGFkb3cnLFxuICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgICBhZGQoXG4gICAgICAgICAgICAgICAgJ3Vua25vd24tZWZmZWN0LXR5cGUnLFxuICAgICAgICAgICAgICAgIHZhbHVlLFxuICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGluc3BlY3RQYWludHMoXG4gICAgbm9kZTogRmlnbWFOb2RlRGF0YSxcbiAgICBwYXRoOiBzdHJpbmcsXG4gICAgYWRkOiBNYXBwaW5nRGlhZ25vc3RpY0FkZGVyLFxuKTogdm9pZCB7XG4gICAgY29uc3QgZmlsbHMgPSBBcnJheS5pc0FycmF5KG5vZGUuZmlsbHMpXG4gICAgICAgID8gbm9kZS5maWxscy5maWx0ZXIoKHBhaW50OiBhbnkpID0+IHBhaW50ICYmIHBhaW50LnZpc2libGUgIT09IGZhbHNlKVxuICAgICAgICA6IFtdO1xuICAgIGlmIChmaWxscy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGFkZChcbiAgICAgICAgICAgICdtdWx0aXBsZS12aXNpYmxlLWZpbGxzJyxcbiAgICAgICAgICAgIGZpbGxzLm1hcCgocGFpbnQ6IGFueSkgPT4gdXBwZXIocGFpbnQudHlwZSkgfHwgJ1VOS05PV04nKS5qb2luKCcgKyAnKSxcbiAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICBwYXRoLFxuICAgICAgICApO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmlsbCBvZiBmaWxscykge1xuICAgICAgICBjb25zdCB0eXBlID0gdXBwZXIoZmlsbC50eXBlKTtcbiAgICAgICAgY29uc3QgYmxlbmRNb2RlID0gdXBwZXIoZmlsbC5ibGVuZE1vZGUpO1xuICAgICAgICBpZiAoIURFRkFVTFRfUEFJTlRfQkxFTkRfTU9ERVMuaGFzKGJsZW5kTW9kZSkpIHtcbiAgICAgICAgICAgIGFkZChcbiAgICAgICAgICAgICAgICAnZmlsbC1ibGVuZC1tb2RlJyxcbiAgICAgICAgICAgICAgICBibGVuZE1vZGUsXG4gICAgICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgICAgICBwYXRoLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGdyYWRpZW50TW9kZSA9IHVwcGVyKGZpbGwuZ3JhZGllbnRNb2RlKTtcbiAgICAgICAgaWYgKGdyYWRpZW50TW9kZSkge1xuICAgICAgICAgICAgYWRkKFxuICAgICAgICAgICAgICAgICdmaWxsLWdyYWRpZW50JyxcbiAgICAgICAgICAgICAgICBncmFkaWVudE1vZGUsXG4gICAgICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgICAgICBwYXRoLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUuc3RhcnRzV2l0aCgnR1JBRElFTlRfJykpIHtcbiAgICAgICAgICAgIGFkZChcbiAgICAgICAgICAgICAgICAnbmF0aXZlLWdyYWRpZW50LWZpbGwnLFxuICAgICAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgICAgICBwYXRoLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUgJiYgdHlwZSAhPT0gJ1NPTElEJyAmJiB0eXBlICE9PSAnSU1BR0UnKSB7XG4gICAgICAgICAgICBhZGQoXG4gICAgICAgICAgICAgICAgJ3Vua25vd24tZmlsbC10eXBlJyxcbiAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBzdHJva2VzID0gQXJyYXkuaXNBcnJheShub2RlLnN0cm9rZXMpXG4gICAgICAgID8gbm9kZS5zdHJva2VzLmZpbHRlcigocGFpbnQ6IGFueSkgPT4gcGFpbnQgJiYgcGFpbnQudmlzaWJsZSAhPT0gZmFsc2UpXG4gICAgICAgIDogW107XG4gICAgaWYgKHN0cm9rZXMubGVuZ3RoID4gMCAmJiB1cHBlcihub2RlLnR5cGUpICE9PSAnVEVYVCcpIHtcbiAgICAgICAgYWRkKFxuICAgICAgICAgICAgJ25vbi10ZXh0LXN0cm9rZXMnLFxuICAgICAgICAgICAgc3Ryb2tlcy5tYXAoKHBhaW50OiBhbnkpID0+IHVwcGVyKHBhaW50LnR5cGUpIHx8ICdVTktOT1dOJykuam9pbignICsgJyksXG4gICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgcGF0aCxcbiAgICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKHN0cm9rZXMubGVuZ3RoID4gMSkge1xuICAgICAgICBhZGQoXG4gICAgICAgICAgICAnbXVsdGlwbGUtdGV4dC1zdHJva2VzJyxcbiAgICAgICAgICAgIGAke3N0cm9rZXMubGVuZ3RofSB2aXNpYmxlIHN0cm9rZXNgLFxuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzdHJva2Ugb2Ygc3Ryb2tlcykge1xuICAgICAgICBjb25zdCBibGVuZE1vZGUgPSB1cHBlcihzdHJva2UuYmxlbmRNb2RlKTtcbiAgICAgICAgaWYgKCFERUZBVUxUX1BBSU5UX0JMRU5EX01PREVTLmhhcyhibGVuZE1vZGUpKSB7XG4gICAgICAgICAgICBhZGQoXG4gICAgICAgICAgICAgICAgJ3N0cm9rZS1ibGVuZC1tb2RlJyxcbiAgICAgICAgICAgICAgICBibGVuZE1vZGUsXG4gICAgICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgICAgICBwYXRoLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuaW50ZXJmYWNlIE1hcHBpbmdEaWFnbm9zdGljUm9vdCB7XG4gICAgcm9vdDogRmlnbWFOb2RlRGF0YTtcbiAgICBwYXJlbnRzOiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIE1hcHBpbmdEaWFnbm9zdGljS2V5VGFyZ2V0IHtcbiAgICB2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAga25vd25LZXlzOiBTZXQ8c3RyaW5nPjtcbiAgICBzY29wZTogJ2V4cG9ydCcgfCAnaW50ZXJmYWNlc1tdJztcbiAgICByZWZOb2RlOiBGaWdtYU5vZGVEYXRhO1xuICAgIHBhdGg6IHN0cmluZztcbn1cblxuY29uc3QgVU5LTk9XTl9LRVlfQ0FQQUJJTElUWV9CWV9TQ09QRTogUmVjb3JkPFxuICAgICdleHBvcnQnIHwgJ2ludGVyZmFjZXNbXScgfCAnbm9kZScsXG4gICAgTWFwcGluZ0NhcGFiaWxpdHlJZFxuPiA9IHtcbiAgICBleHBvcnQ6ICd1bmtub3duLWV4cG9ydC1rZXknLFxuICAgICdpbnRlcmZhY2VzW10nOiAndW5rbm93bi1pbnRlcmZhY2Uta2V5JyxcbiAgICBub2RlOiAndW5rbm93bi1ub2RlLWtleScsXG59O1xuXG5mdW5jdGlvbiBkZXNjcmliZUtleVZhbHVlKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcbiAgICBpZiAodmFsdWUgPT09IG51bGwpIHJldHVybiAnbnVsbCc7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSByZXR1cm4gJ2FycmF5JztcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgcmV0dXJuICdzdHJpbmcnO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSByZXR1cm4gJ29iamVjdCc7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gY29sbGVjdE1hcHBpbmdEaWFnbm9zdGljc0Zyb21Sb290cyhcbiAgICByb290czogTWFwcGluZ0RpYWdub3N0aWNSb290W10sXG4gICAga2V5VGFyZ2V0czogTWFwcGluZ0RpYWdub3N0aWNLZXlUYXJnZXRbXSA9IFtdLFxuKTogTWFwcGluZ0RpYWdub3N0aWNTdW1tYXJ5IHtcbiAgICBpZiAocm9vdHMubGVuZ3RoID09PSAwICYmIGtleVRhcmdldHMubGVuZ3RoID09PSAwKSByZXR1cm4geyBlbnRyaWVzOiBbXSwgb2NjdXJyZW5jZUNvdW50OiAwIH07XG5cbiAgICBjb25zdCBncm91cGVkID0gbmV3IE1hcDxzdHJpbmcsIE11dGFibGVNYXBwaW5nRGlhZ25vc3RpY0VudHJ5PigpO1xuICAgIGNvbnN0IGFkZDogTWFwcGluZ0RpYWdub3N0aWNBZGRlciA9IChcbiAgICAgICAgY2FwYWJpbGl0eUlkLFxuICAgICAgICB2YWx1ZTogc3RyaW5nLFxuICAgICAgICBub2RlOiBGaWdtYU5vZGVEYXRhLFxuICAgICAgICBwYXRoOiBzdHJpbmcsXG4gICAgICAgIGZpZWxkT3ZlcnJpZGU/OiBzdHJpbmcsXG4gICAgKTogdm9pZCA9PiB7XG4gICAgICAgIGNvbnN0IGNhcGFiaWxpdHkgPSBnZXRNYXBwaW5nQ2FwYWJpbGl0eShjYXBhYmlsaXR5SWQpO1xuICAgICAgICBjb25zdCBmaWVsZCA9IGZpZWxkT3ZlcnJpZGUgfHwgY2FwYWJpbGl0eS5maWVsZDtcbiAgICAgICAgY29uc3Qga2V5ID0gYCR7Y2FwYWJpbGl0eUlkfVxcdTAwMDAke2ZpZWxkfVxcdTAwMDAke3ZhbHVlfWA7XG4gICAgICAgIGxldCBlbnRyeSA9IGdyb3VwZWQuZ2V0KGtleSk7XG4gICAgICAgIGlmICghZW50cnkpIHtcbiAgICAgICAgICAgIGVudHJ5ID0ge1xuICAgICAgICAgICAgICAgIGNvZGU6IGNhcGFiaWxpdHlJZCxcbiAgICAgICAgICAgICAgICBsZXZlbDogY2FwYWJpbGl0eS5sZXZlbCxcbiAgICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAgICAgICBoYW5kbGluZzogY2FwYWJpbGl0eS5oYW5kbGluZyxcbiAgICAgICAgICAgICAgICByZWFzb246IGNhcGFiaWxpdHkucmVhc29uLFxuICAgICAgICAgICAgICAgIGNvdW50OiAwLFxuICAgICAgICAgICAgICAgIG5vZGVzOiBbXSxcbiAgICAgICAgICAgICAgICBub2RlS2V5czogbmV3IFNldDxzdHJpbmc+KCksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZ3JvdXBlZC5zZXQoa2V5LCBlbnRyeSk7XG4gICAgICAgIH1cbiAgICAgICAgZW50cnkuY291bnQrKztcbiAgICAgICAgY29uc3QgcmVmID0gbm9kZVJlZihub2RlLCBwYXRoKTtcbiAgICAgICAgY29uc3Qgbm9kZUtleSA9IGAke3JlZi5maWdtYUlkfVxcdTAwMDAke3JlZi5wYXRofWA7XG4gICAgICAgIGlmIChlbnRyeS5ub2Rlcy5sZW5ndGggPCBNQVhfTk9ERV9TQU1QTEVTICYmICFlbnRyeS5ub2RlS2V5cy5oYXMobm9kZUtleSkpIHtcbiAgICAgICAgICAgIGVudHJ5Lm5vZGVLZXlzLmFkZChub2RlS2V5KTtcbiAgICAgICAgICAgIGVudHJ5Lm5vZGVzLnB1c2gocmVmKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBjb25zdCBpbnNwZWN0VW5rbm93bktleXMgPSAoXG4gICAgICAgIHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgICAgICAga25vd25LZXlzOiBTZXQ8c3RyaW5nPixcbiAgICAgICAgc2NvcGU6ICdleHBvcnQnIHwgJ2ludGVyZmFjZXNbXScgfCAnbm9kZScsXG4gICAgICAgIG5vZGU6IEZpZ21hTm9kZURhdGEsXG4gICAgICAgIHBhdGg6IHN0cmluZyxcbiAgICApOiB2b2lkID0+IHtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModmFsdWUpLnNvcnQoKSkge1xuICAgICAgICAgICAgaWYgKGtub3duS2V5cy5oYXMoa2V5KSkgY29udGludWU7XG4gICAgICAgICAgICBhZGQoXG4gICAgICAgICAgICAgICAgVU5LTk9XTl9LRVlfQ0FQQUJJTElUWV9CWV9TQ09QRVtzY29wZV0sXG4gICAgICAgICAgICAgICAgZGVzY3JpYmVLZXlWYWx1ZSh2YWx1ZVtrZXldKSxcbiAgICAgICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICAgICAgYCR7c2NvcGV9LiR7a2V5fWAsXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGZvciAoY29uc3QgdGFyZ2V0IG9mIGtleVRhcmdldHMpIHtcbiAgICAgICAgaW5zcGVjdFVua25vd25LZXlzKHRhcmdldC52YWx1ZSwgdGFyZ2V0Lmtub3duS2V5cywgdGFyZ2V0LnNjb3BlLCB0YXJnZXQucmVmTm9kZSwgdGFyZ2V0LnBhdGgpO1xuICAgIH1cblxuICAgIC8vIFVzZSBhbiBleHBsaWNpdCBicmVhZHRoLWZpcnN0IHF1ZXVlIHNvIGEgYnJvYWQgY29udHJhY3Qgc2NhbiBuZXZlciBmb2xsb3dzXG4gICAgLy8gb25lIGRlZXAgYnJhbmNoIHdoaWxlIHBvc3Rwb25pbmcgc2libGluZyBjYXBhYmlsaXR5IGRvbWFpbnMuXG4gICAgY29uc3QgcXVldWU6IEFycmF5PHsgbm9kZTogRmlnbWFOb2RlRGF0YTsgcGFyZW50czogc3RyaW5nW10gfT4gPSByb290cy5tYXAoKGl0ZW0pID0+ICh7XG4gICAgICAgIG5vZGU6IGl0ZW0ucm9vdCxcbiAgICAgICAgcGFyZW50czogaXRlbS5wYXJlbnRzLFxuICAgIH0pKTtcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgcXVldWUubGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIGNvbnN0IHsgbm9kZSwgcGFyZW50cyB9ID0gcXVldWVbaW5kZXhdO1xuICAgICAgICBjb25zdCBuYW1lID0gU3RyaW5nKG5vZGUubmFtZSB8fCBub2RlLnR5cGUgfHwgJ1VubmFtZWQnKTtcbiAgICAgICAgY29uc3QgcGF0aCA9IFsuLi5wYXJlbnRzLCBuYW1lXS5qb2luKCcgLyAnKTtcbiAgICAgICAgaW5zcGVjdFVua25vd25LZXlzKG5vZGUsIEtOT1dOX05PREVfS0VZUywgJ25vZGUnLCBub2RlLCBwYXRoKTtcbiAgICAgICAgY29uc3QgYmxlbmRNb2RlID0gdXBwZXIobm9kZS5ibGVuZE1vZGUpO1xuICAgICAgICBpZiAoIURFRkFVTFRfTk9ERV9CTEVORF9NT0RFUy5oYXMoYmxlbmRNb2RlKSkge1xuICAgICAgICAgICAgYWRkKFxuICAgICAgICAgICAgICAgICdub2RlLWJsZW5kLW1vZGUnLFxuICAgICAgICAgICAgICAgIGJsZW5kTW9kZSxcbiAgICAgICAgICAgICAgICBub2RlLFxuICAgICAgICAgICAgICAgIHBhdGgsXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGluc3BlY3RFZmZlY3RzKG5vZGUsIHBhdGgsIGFkZCk7XG4gICAgICAgIGluc3BlY3RQYWludHMobm9kZSwgcGF0aCwgYWRkKTtcbiAgICAgICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuIHx8IFtdKSB7XG4gICAgICAgICAgICBpZiAoY2hpbGQpIHF1ZXVlLnB1c2goeyBub2RlOiBjaGlsZCwgcGFyZW50czogWy4uLnBhcmVudHMsIG5hbWVdIH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGVudHJpZXMgPSBBcnJheS5mcm9tKGdyb3VwZWQudmFsdWVzKCkpXG4gICAgICAgIC5tYXAoKHsgbm9kZUtleXM6IF9ub2RlS2V5cywgLi4uZW50cnkgfSkgPT4gZW50cnkpXG4gICAgICAgIC5zb3J0KChsZWZ0LCByaWdodCkgPT4ge1xuICAgICAgICAgICAgaWYgKGxlZnQubGV2ZWwgIT09IHJpZ2h0LmxldmVsKSByZXR1cm4gbGVmdC5sZXZlbCA9PT0gJ3Vuc3VwcG9ydGVkJyA/IC0xIDogMTtcbiAgICAgICAgICAgIHJldHVybiBgJHtsZWZ0LmZpZWxkfVxcdTAwMDAke2xlZnQudmFsdWV9YC5sb2NhbGVDb21wYXJlKGAke3JpZ2h0LmZpZWxkfVxcdTAwMDAke3JpZ2h0LnZhbHVlfWApO1xuICAgICAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgICBlbnRyaWVzLFxuICAgICAgICBvY2N1cnJlbmNlQ291bnQ6IGVudHJpZXMucmVkdWNlKCh0b3RhbCwgZW50cnkpID0+IHRvdGFsICsgZW50cnkuY291bnQsIDApLFxuICAgIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0TWFwcGluZ0RpYWdub3N0aWNzKHJvb3Q6IEZpZ21hTm9kZURhdGEgfCBudWxsIHwgdW5kZWZpbmVkKTogTWFwcGluZ0RpYWdub3N0aWNTdW1tYXJ5IHtcbiAgICBpZiAoIXJvb3QpIHJldHVybiB7IGVudHJpZXM6IFtdLCBvY2N1cnJlbmNlQ291bnQ6IDAgfTtcbiAgICByZXR1cm4gY29sbGVjdE1hcHBpbmdEaWFnbm9zdGljc0Zyb21Sb290cyhbeyByb290LCBwYXJlbnRzOiBbXSB9XSk7XG59XG5cbi8qKiBTY2FuIHRoZSBjb21wbGV0ZSBGaWdtYSBleHBvcnQgZW52ZWxvcGUsIGluY2x1ZGluZyBldmVyeSBpbnRlcmZhY2Ugcm9vdCBpbiBtdWx0aS1pbnRlcmZhY2UgSlNPTi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0RXhwb3J0TWFwcGluZ0RpYWdub3N0aWNzKFxuICAgIGRhdGE6IEZpZ21hRXhwb3J0RGF0YSB8IG51bGwgfCB1bmRlZmluZWQsXG4pOiBNYXBwaW5nRGlhZ25vc3RpY1N1bW1hcnkge1xuICAgIGlmICghZGF0YSkgcmV0dXJuIHsgZW50cmllczogW10sIG9jY3VycmVuY2VDb3VudDogMCB9O1xuXG4gICAgY29uc3Qgcm9vdHM6IE1hcHBpbmdEaWFnbm9zdGljUm9vdFtdID0gW107XG4gICAgY29uc3Qga2V5VGFyZ2V0czogTWFwcGluZ0RpYWdub3N0aWNLZXlUYXJnZXRbXSA9IFtdO1xuICAgIGNvbnN0IHNlZW5Sb290cyA9IG5ldyBTZXQ8RmlnbWFOb2RlRGF0YT4oKTtcbiAgICBjb25zdCBpbnRlcmZhY2VzID0gQXJyYXkuaXNBcnJheShkYXRhLmludGVyZmFjZXMpXG4gICAgICAgID8gZGF0YS5pbnRlcmZhY2VzLmZpbHRlcigoaXRlbTogYW55KSA9PiBpdGVtKVxuICAgICAgICA6IFtdO1xuXG4gICAgY29uc3QgYWRkUm9vdCA9IChyb290OiBGaWdtYU5vZGVEYXRhLCBwYXJlbnRzOiBzdHJpbmdbXSk6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIXJvb3QgfHwgc2VlblJvb3RzLmhhcyhyb290KSkgcmV0dXJuO1xuICAgICAgICBzZWVuUm9vdHMuYWRkKHJvb3QpO1xuICAgICAgICByb290cy5wdXNoKHsgcm9vdCwgcGFyZW50cyB9KTtcbiAgICB9O1xuXG4gICAgaWYgKGRhdGEucm9vdCkgYWRkUm9vdChkYXRhLnJvb3QsIFtdKTtcbiAgICBmb3IgKGNvbnN0IGlmYWNlIG9mIGludGVyZmFjZXMpIHtcbiAgICAgICAgY29uc3QgaW50ZXJmYWNlTmFtZSA9IFN0cmluZyhpZmFjZS5uYW1lIHx8IChpZmFjZS5yb290ICYmIGlmYWNlLnJvb3QubmFtZSkgfHwgJ1VubmFtZWQnKTtcbiAgICAgICAgY29uc3QgaW50ZXJmYWNlUmVmTm9kZSA9IGlmYWNlLnJvb3QgfHwgKHtcbiAgICAgICAgICAgIGZpZ21hSWQ6ICcnLFxuICAgICAgICAgICAgbmFtZTogaW50ZXJmYWNlTmFtZSxcbiAgICAgICAgICAgIHR5cGU6ICdJTlRFUkZBQ0UnLFxuICAgICAgICAgICAgeDogMCxcbiAgICAgICAgICAgIHk6IDAsXG4gICAgICAgICAgICB3aWR0aDogMCxcbiAgICAgICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgICAgIHJvdGF0aW9uOiAwLFxuICAgICAgICAgICAgY2hpbGRyZW46IFtdLFxuICAgICAgICB9IGFzIEZpZ21hTm9kZURhdGEpO1xuICAgICAgICBpZiAoaWZhY2Uucm9vdCkgYWRkUm9vdChpZmFjZS5yb290LCBbYOeVjOmdojoke2ludGVyZmFjZU5hbWV9YF0pO1xuICAgICAgICBrZXlUYXJnZXRzLnB1c2goe1xuICAgICAgICAgICAgdmFsdWU6IGlmYWNlLFxuICAgICAgICAgICAga25vd25LZXlzOiBLTk9XTl9JTlRFUkZBQ0VfS0VZUyxcbiAgICAgICAgICAgIHNjb3BlOiAnaW50ZXJmYWNlc1tdJyxcbiAgICAgICAgICAgIHJlZk5vZGU6IGludGVyZmFjZVJlZk5vZGUsXG4gICAgICAgICAgICBwYXRoOiBg55WM6Z2iOiR7aW50ZXJmYWNlTmFtZX1gLFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBleHBvcnROYW1lID0gU3RyaW5nKGRhdGEubmFtZSB8fCAocm9vdHMubGVuZ3RoID4gMCA/IHJvb3RzWzBdLnJvb3QubmFtZSA6ICcnKSB8fCAnVW5uYW1lZCcpO1xuICAgIGNvbnN0IGV4cG9ydFJlZk5vZGUgPSByb290cy5sZW5ndGggPiAwID8gcm9vdHNbMF0ucm9vdCA6ICh7XG4gICAgICAgIGZpZ21hSWQ6ICcnLFxuICAgICAgICBuYW1lOiBleHBvcnROYW1lLFxuICAgICAgICB0eXBlOiAnRVhQT1JUJyxcbiAgICAgICAgeDogMCxcbiAgICAgICAgeTogMCxcbiAgICAgICAgd2lkdGg6IDAsXG4gICAgICAgIGhlaWdodDogMCxcbiAgICAgICAgcm90YXRpb246IDAsXG4gICAgICAgIGNoaWxkcmVuOiBbXSxcbiAgICB9IGFzIEZpZ21hTm9kZURhdGEpO1xuICAgIGtleVRhcmdldHMucHVzaCh7XG4gICAgICAgIHZhbHVlOiBkYXRhIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICAgICAgIGtub3duS2V5czogS05PV05fRVhQT1JUX0tFWVMsXG4gICAgICAgIHNjb3BlOiAnZXhwb3J0JyxcbiAgICAgICAgcmVmTm9kZTogZXhwb3J0UmVmTm9kZSxcbiAgICAgICAgcGF0aDogYOWvvOWHuuWMhToke2V4cG9ydE5hbWV9YCxcbiAgICB9KTtcbiAgICByZXR1cm4gY29sbGVjdE1hcHBpbmdEaWFnbm9zdGljc0Zyb21Sb290cyhyb290cywga2V5VGFyZ2V0cyk7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdE5vZGUocmVmOiBNYXBwaW5nRGlhZ25vc3RpY05vZGUpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHtyZWYucGF0aH0ke3JlZi5maWdtYUlkID8gYCBbJHtyZWYuZmlnbWFJZH1dYCA6ICcnfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRNYXBwaW5nRGlhZ25vc3RpY3Moc3VtbWFyeTogTWFwcGluZ0RpYWdub3N0aWNTdW1tYXJ5KTogc3RyaW5nIHtcbiAgICBpZiAoc3VtbWFyeS5lbnRyaWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuICcnO1xuICAgIGNvbnN0IHVuc3VwcG9ydGVkID0gc3VtbWFyeS5lbnRyaWVzXG4gICAgICAgIC5maWx0ZXIoKGVudHJ5KSA9PiBlbnRyeS5sZXZlbCA9PT0gJ3Vuc3VwcG9ydGVkJylcbiAgICAgICAgLnJlZHVjZSgodG90YWwsIGVudHJ5KSA9PiB0b3RhbCArIGVudHJ5LmNvdW50LCAwKTtcbiAgICBjb25zdCBmYWxsYmFjayA9IHN1bW1hcnkub2NjdXJyZW5jZUNvdW50IC0gdW5zdXBwb3J0ZWQ7XG4gICAgY29uc3QgbGluZXMgPSBbXG4gICAgICAgIGBbZmlnbWEtaW1wb3J0ZXJdIEZpZ21hIOWPguaVsOaYoOWwhOWRiuitpu+8miR7c3VtbWFyeS5lbnRyaWVzLmxlbmd0aH0g57G7IC8gJHtzdW1tYXJ5Lm9jY3VycmVuY2VDb3VudH0g5aSEYCArXG4gICAgICAgIGDvvIjmnKrmmKDlsIQgJHt1bnN1cHBvcnRlZH3vvIzpmY3nuqcgJHtmYWxsYmFja33vvIlgLFxuICAgIF07XG4gICAgc3VtbWFyeS5lbnRyaWVzLmZvckVhY2goKGVudHJ5LCBpbmRleCkgPT4ge1xuICAgICAgICBjb25zdCBsYWJlbCA9IGVudHJ5LmxldmVsID09PSAndW5zdXBwb3J0ZWQnID8gJ+acquaYoOWwhCcgOiAn6ZmN57qnJztcbiAgICAgICAgbGluZXMucHVzaChgICAke2luZGV4ICsgMX0uIFske2xhYmVsfV0gJHtlbnRyeS5maWVsZH0gPSAke2VudHJ5LnZhbHVlfSDDlyR7ZW50cnkuY291bnR9YCk7XG4gICAgICAgIGxpbmVzLnB1c2goYCAgICAg5Y6f5Zug77yaJHtlbnRyeS5yZWFzb259YCk7XG4gICAgICAgIGNvbnN0IG9taXR0ZWQgPSBNYXRoLm1heCgwLCBlbnRyeS5jb3VudCAtIGVudHJ5Lm5vZGVzLmxlbmd0aCk7XG4gICAgICAgIGxpbmVzLnB1c2goXG4gICAgICAgICAgICBgICAgICDoioLngrnvvJoke2VudHJ5Lm5vZGVzLm1hcChmb3JtYXROb2RlKS5qb2luKCfvvJsnKX1gICtcbiAgICAgICAgICAgIGAke29taXR0ZWQgPiAwID8gYO+8m+WPpuaciSAke29taXR0ZWR9IOWkhOWQjOexu+iKgueCuWAgOiAnJ31gLFxuICAgICAgICApO1xuICAgIH0pO1xuICAgIGxpbmVzLnB1c2goJyAg5Lul5LiK5Y+C5pWw5bey55SxIEZpZ21hIOmAgei+vu+8jOS9huW9k+WJjSBDb2NvcyDmnKrlrozmlbTov5jljp/vvJvlkIznsbvlj4LmlbDlt7LogZrlkIjvvIzmnKzmrKHku4XovpPlh7rov5nkuIDmnaEgd2FybmluZ+OAgicpO1xuICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlcG9ydE1hcHBpbmdEaWFnbm9zdGljcyhcbiAgICBzb3VyY2U6IEZpZ21hRXhwb3J0RGF0YSB8IEZpZ21hTm9kZURhdGEgfCBudWxsIHwgdW5kZWZpbmVkLFxuICAgIGxvZ2dlcjogTWFwcGluZ0RpYWdub3N0aWNMb2dnZXIgPSAobWVzc2FnZSkgPT4gY29uc29sZS53YXJuKG1lc3NhZ2UpLFxuKTogTWFwcGluZ0RpYWdub3N0aWNTdW1tYXJ5IHtcbiAgICBjb25zdCBzb3VyY2VBc0V4cG9ydCA9IHNvdXJjZSBhcyBGaWdtYUV4cG9ydERhdGEgfCBudWxsIHwgdW5kZWZpbmVkO1xuICAgIGNvbnN0IHN1bW1hcnkgPSBzb3VyY2VBc0V4cG9ydCAmJiAoc291cmNlQXNFeHBvcnQucm9vdCB8fCBBcnJheS5pc0FycmF5KHNvdXJjZUFzRXhwb3J0LmludGVyZmFjZXMpKVxuICAgICAgICA/IGNvbGxlY3RFeHBvcnRNYXBwaW5nRGlhZ25vc3RpY3Moc291cmNlQXNFeHBvcnQpXG4gICAgICAgIDogY29sbGVjdE1hcHBpbmdEaWFnbm9zdGljcyhzb3VyY2UgYXMgRmlnbWFOb2RlRGF0YSB8IG51bGwgfCB1bmRlZmluZWQpO1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBmb3JtYXRNYXBwaW5nRGlhZ25vc3RpY3Moc3VtbWFyeSk7XG4gICAgaWYgKG1lc3NhZ2UpIGxvZ2dlcihtZXNzYWdlKTtcbiAgICByZXR1cm4gc3VtbWFyeTtcbn1cbiJdfQ==