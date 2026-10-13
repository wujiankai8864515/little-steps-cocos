export type MappingCapabilityLevel = 'unsupported' | 'fallback';

export type MappingCapabilityDomain = 'contract' | 'node' | 'effect' | 'fill' | 'stroke';

export type MappingCapabilityHandling =
    | 'unverified'
    | 'default-cocos-render-state'
    | 'first-visible-only'
    | 'ignored'
    | 'ignored-spread'
    | 'default-cocos-blend'
    | 'primary-fill-only'
    | 'average-endpoint-colors';

export interface MappingCapabilityDefinition {
    domain: MappingCapabilityDomain;
    level: MappingCapabilityLevel;
    field: string;
    handling: MappingCapabilityHandling;
    reason: string;
}

/**
 * Value-level Figma -> Cocos capability registry.
 *
 * Detection code only selects an id and supplies the observed value/node. The
 * status, canonical field, current handling strategy, and user-facing reason
 * live here so diagnostics cannot quietly invent a different explanation.
 */
export const MAPPING_CAPABILITY_REGISTRY = {
    'unknown-export-key': {
        domain: 'contract',
        level: 'unsupported',
        field: 'export.*',
        handling: 'unverified',
        reason: 'Figma export 出现尚未登记的顶层 key；当前不能证明 Cocos 已识别该参数。',
    },
    'unknown-interface-key': {
        domain: 'contract',
        level: 'unsupported',
        field: 'interfaces[].*',
        handling: 'unverified',
        reason: 'Figma interfaces[] 出现尚未登记的顶层 key；当前不能证明 Cocos 已识别该参数。',
    },
    'unknown-node-key': {
        domain: 'contract',
        level: 'unsupported',
        field: 'node.*',
        handling: 'unverified',
        reason: 'Figma node 出现尚未登记的顶层 key；当前不能证明 Cocos 已识别该参数。',
    },
    'node-blend-mode': {
        domain: 'node',
        level: 'unsupported',
        field: 'blendMode',
        handling: 'default-cocos-render-state',
        reason: '节点混合模式尚未映射到 Cocos 渲染状态。',
    },
    'text-multiple-drop-shadows': {
        domain: 'effect',
        level: 'fallback',
        field: 'effects[]',
        handling: 'first-visible-only',
        reason: '文字阴影当前只读取第一个可见 DROP_SHADOW。',
    },
    'non-text-drop-shadow': {
        domain: 'effect',
        level: 'unsupported',
        field: 'effects[].type',
        handling: 'ignored',
        reason: '非文字节点的 DROP_SHADOW 尚未映射到 Cocos。',
    },
    'text-shadow-spread': {
        domain: 'effect',
        level: 'fallback',
        field: 'effects[].spread',
        handling: 'ignored-spread',
        reason: 'Cocos 文字阴影没有还原 Figma spread。',
    },
    'text-shadow-blend-mode': {
        domain: 'effect',
        level: 'fallback',
        field: 'effects[].blendMode',
        handling: 'default-cocos-blend',
        reason: 'Cocos 文字阴影使用默认混合模式。',
    },
    'background-blur': {
        domain: 'effect',
        level: 'unsupported',
        field: 'effects[].type',
        handling: 'ignored',
        reason: '当前没有背景采样模糊的 Cocos 映射。',
    },
    'layer-blur': {
        domain: 'effect',
        level: 'unsupported',
        field: 'effects[].type',
        handling: 'ignored',
        reason: '当前没有图层模糊的 Cocos 映射。',
    },
    'inner-shadow': {
        domain: 'effect',
        level: 'unsupported',
        field: 'effects[].type',
        handling: 'ignored',
        reason: '当前没有内阴影的 Cocos 映射。',
    },
    'unknown-effect-type': {
        domain: 'effect',
        level: 'unsupported',
        field: 'effects[].type',
        handling: 'ignored',
        reason: '该 Figma effect 类型尚未登记 Cocos 映射。',
    },
    'multiple-visible-fills': {
        domain: 'fill',
        level: 'fallback',
        field: 'fills[]',
        handling: 'primary-fill-only',
        reason: '当前视觉节点只选择一个主要 fill 路径，其余 fill 不会叠加还原。',
    },
    'fill-blend-mode': {
        domain: 'fill',
        level: 'unsupported',
        field: 'fills[].blendMode',
        handling: 'default-cocos-blend',
        reason: 'fill 混合模式尚未映射到 Cocos 材质。',
    },
    'fill-gradient': {
        domain: 'fill',
        level: 'fallback',
        field: 'fills[].gradientMode',
        handling: 'average-endpoint-colors',
        reason: '渐变当前取两端颜色均值作为单色降级。',
    },
    'native-gradient-fill': {
        domain: 'fill',
        level: 'unsupported',
        field: 'fills[].type',
        handling: 'ignored',
        reason: '该原生渐变 fill 尚未进入 Cocos 视觉映射。',
    },
    'unknown-fill-type': {
        domain: 'fill',
        level: 'unsupported',
        field: 'fills[].type',
        handling: 'ignored',
        reason: '该 Figma fill 类型尚未登记 Cocos 映射。',
    },
    'non-text-strokes': {
        domain: 'stroke',
        level: 'unsupported',
        field: 'strokes[]',
        handling: 'ignored',
        reason: '当前仅文字描边进入 Cocos 映射，普通图形描边尚未还原。',
    },
    'multiple-text-strokes': {
        domain: 'stroke',
        level: 'fallback',
        field: 'strokes[]',
        handling: 'first-visible-only',
        reason: '文字描边当前只读取第一个可见 stroke。',
    },
    'stroke-blend-mode': {
        domain: 'stroke',
        level: 'unsupported',
        field: 'strokes[].blendMode',
        handling: 'default-cocos-blend',
        reason: 'stroke 混合模式尚未映射到 Cocos 材质。',
    },
} as const satisfies Record<string, MappingCapabilityDefinition>;

export type MappingCapabilityId = keyof typeof MAPPING_CAPABILITY_REGISTRY;

export function getMappingCapability(id: MappingCapabilityId): MappingCapabilityDefinition {
    return MAPPING_CAPABILITY_REGISTRY[id];
}
