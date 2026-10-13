"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAPPING_CAPABILITY_REGISTRY = void 0;
exports.getMappingCapability = getMappingCapability;
/**
 * Value-level Figma -> Cocos capability registry.
 *
 * Detection code only selects an id and supplies the observed value/node. The
 * status, canonical field, current handling strategy, and user-facing reason
 * live here so diagnostics cannot quietly invent a different explanation.
 */
exports.MAPPING_CAPABILITY_REGISTRY = {
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
};
function getMappingCapability(id) {
    return exports.MAPPING_CAPABILITY_REGISTRY[id];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFwcGluZy1jYXBhYmlsaXRpZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWFwcGluZy1jYXBhYmlsaXRpZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBOEtBLG9EQUVDO0FBMUpEOzs7Ozs7R0FNRztBQUNVLFFBQUEsMkJBQTJCLEdBQUc7SUFDdkMsb0JBQW9CLEVBQUU7UUFDbEIsTUFBTSxFQUFFLFVBQVU7UUFDbEIsS0FBSyxFQUFFLGFBQWE7UUFDcEIsS0FBSyxFQUFFLFVBQVU7UUFDakIsUUFBUSxFQUFFLFlBQVk7UUFDdEIsTUFBTSxFQUFFLGlEQUFpRDtLQUM1RDtJQUNELHVCQUF1QixFQUFFO1FBQ3JCLE1BQU0sRUFBRSxVQUFVO1FBQ2xCLEtBQUssRUFBRSxhQUFhO1FBQ3BCLEtBQUssRUFBRSxnQkFBZ0I7UUFDdkIsUUFBUSxFQUFFLFlBQVk7UUFDdEIsTUFBTSxFQUFFLHVEQUF1RDtLQUNsRTtJQUNELGtCQUFrQixFQUFFO1FBQ2hCLE1BQU0sRUFBRSxVQUFVO1FBQ2xCLEtBQUssRUFBRSxhQUFhO1FBQ3BCLEtBQUssRUFBRSxRQUFRO1FBQ2YsUUFBUSxFQUFFLFlBQVk7UUFDdEIsTUFBTSxFQUFFLCtDQUErQztLQUMxRDtJQUNELGlCQUFpQixFQUFFO1FBQ2YsTUFBTSxFQUFFLE1BQU07UUFDZCxLQUFLLEVBQUUsYUFBYTtRQUNwQixLQUFLLEVBQUUsV0FBVztRQUNsQixRQUFRLEVBQUUsNEJBQTRCO1FBQ3RDLE1BQU0sRUFBRSx5QkFBeUI7S0FDcEM7SUFDRCw0QkFBNEIsRUFBRTtRQUMxQixNQUFNLEVBQUUsUUFBUTtRQUNoQixLQUFLLEVBQUUsVUFBVTtRQUNqQixLQUFLLEVBQUUsV0FBVztRQUNsQixRQUFRLEVBQUUsb0JBQW9CO1FBQzlCLE1BQU0sRUFBRSw2QkFBNkI7S0FDeEM7SUFDRCxzQkFBc0IsRUFBRTtRQUNwQixNQUFNLEVBQUUsUUFBUTtRQUNoQixLQUFLLEVBQUUsYUFBYTtR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TSxFQUFFLFFBQVE7UUFDaEIsS0FBSyxFQUFFLGFBQWE7UUFDcEIsS0FBSyxFQUFFLHFCQUFxQjtRQUM1QixRQUFRLEVBQUUscUJBQXFCO1FBQy9CLE1BQU0sRUFBRSw0QkFBNEI7S0FDdkM7Q0FDMkQsQ0FBQztBQUlqRSxTQUFnQixvQkFBb0IsQ0FBQyxFQUF1QjtJQUN4RCxPQUFPLG1DQUEyQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzNDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgdHlwZSBNYXBwaW5nQ2FwYWJpbGl0eUxldmVsID0gJ3Vuc3VwcG9ydGVkJyB8ICdmYWxsYmFjayc7XG5cbmV4cG9ydCB0eXBlIE1hcHBpbmdDYXBhYmlsaXR5RG9tYWluID0gJ2NvbnRyYWN0JyB8ICdub2RlJyB8ICdlZmZlY3QnIHwgJ2ZpbGwnIHwgJ3N0cm9rZSc7XG5cbmV4cG9ydCB0eXBlIE1hcHBpbmdDYXBhYmlsaXR5SGFuZGxpbmcgPVxuICAgIHwgJ3VudmVyaWZpZWQnXG4gICAgfCAnZGVmYXVsdC1jb2Nvcy1yZW5kZXItc3RhdGUnXG4gICAgfCAnZmlyc3QtdmlzaWJsZS1vbmx5J1xuICAgIHwgJ2lnbm9yZWQnXG4gICAgfCAnaWdub3JlZC1zcHJlYWQnXG4gICAgfCAnZGVmYXVsdC1jb2Nvcy1ibGVuZCdcbiAgICB8ICdwcmltYXJ5LWZpbGwtb25seSdcbiAgICB8ICdhdmVyYWdlLWVuZHBvaW50LWNvbG9ycyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFwcGluZ0NhcGFiaWxpdHlEZWZpbml0aW9uIHtcbiAgICBkb21haW46IE1hcHBpbmdDYXBhYmlsaXR5RG9tYWluO1xuICAgIGxldmVsOiBNYXBwaW5nQ2FwYWJpbGl0eUxldmVsO1xuICAgIGZpZWxkOiBzdHJpbmc7XG4gICAgaGFuZGxpbmc6IE1hcHBpbmdDYXBhYmlsaXR5SGFuZGxpbmc7XG4gICAgcmVhc29uOiBzdHJpbmc7XG59XG5cbi8qKlxuICogVmFsdWUtbGV2ZWwgRmlnbWEgLT4gQ29jb3MgY2FwYWJpbGl0eSByZWdpc3RyeS5cbiAqXG4gKiBEZXRlY3Rpb24gY29kZSBvbmx5IHNlbGVjdHMgYW4gaWQgYW5kIHN1cHBsaWVzIHRoZSBvYnNlcnZlZCB2YWx1ZS9ub2RlLiBUaGVcbiAqIHN0YXR1cywgY2Fub25pY2FsIGZpZWxkLCBjdXJyZW50IGhhbmRsaW5nIHN0cmF0ZWd5LCBhbmQgdXNlci1mYWNpbmcgcmVhc29uXG4gKiBsaXZlIGhlcmUgc28gZGlhZ25vc3RpY3MgY2Fubm90IHF1aWV0bHkgaW52ZW50IGEgZGlmZmVyZW50IGV4cGxhbmF0aW9uLlxuICovXG5leHBvcnQgY29uc3QgTUFQUElOR19DQVBBQklMSVRZX1JFR0lTVFJZID0ge1xuICAgICd1bmtub3duLWV4cG9ydC1rZXknOiB7XG4gICAgICAgIGRvbWFpbjogJ2NvbnRyYWN0JyxcbiAgICAgICAgbGV2ZWw6ICd1bnN1cHBvcnRlZCcsXG4gICAgICAgIGZpZWxkOiAnZXhwb3J0LionLFxuICAgICAgICBoYW5kbGluZzogJ3VudmVyaWZpZWQnLFxuICAgICAgICByZWFzb246ICdGaWdtYSBleHBvcnQg5Ye6546w5bCa5pyq55m76K6w55qE6aG25bGCIGtlee+8m+W9k+WJjeS4jeiDveivgeaYjiBDb2NvcyDlt7Lor4bliKvor6Xlj4LmlbDjgIInLFxuICAgIH0sXG4gICAgJ3Vua25vd24taW50ZXJmYWNlLWtleSc6IHtcbiAgICAgICAgZG9tYWluOiAnY29udHJhY3QnLFxuICAgICAgICBsZXZlbDogJ3Vuc3VwcG9ydGVkJyxcbiAgICAgICAgZmllbGQ6ICdpbnRlcmZhY2VzW10uKicsXG4gICAgICAgIGhhbmRsaW5nOiAndW52ZXJpZmllZCcsXG4gICAgICAgIHJlYXNvbjogJ0ZpZ21hIGludGVyZmFjZXNbXSDlh7rnjrDlsJrmnKrnmbvorrDnmoTpobblsYIga2V577yb5b2T5YmN5LiN6IO96K+B5piOIENvY29zIOW3suivhuWIq+ivpeWPguaVsOOAgicsXG4gICAgfSxcbiAgICAndW5rbm93bi1ub2RlLWtleSc6IHtcbiAgICAgICAgZG9tYWluOiAnY29udHJhY3QnLFxuICAgICAgICBsZXZlbDogJ3Vuc3VwcG9ydGVkJyxcbiAgICAgICAgZmllbGQ6ICdub2RlLionLFxuICAgICAgICBoYW5kbGluZzogJ3VudmVyaWZpZWQnLFxuICAgICAgICByZWFzb246ICdGaWdtYSBub2RlIOWHuueOsOWwmuacqueZu+iusOeahOmhtuWxgiBrZXnvvJvlvZPliY3kuI3og73or4HmmI4gQ29jb3Mg5bey6K+G5Yir6K+l5Y+C5pWw44CCJyxcbiAgICB9LFxuICAgICdub2RlLWJsZW5kLW1vZGUnOiB7XG4gICAgICAgIGRvbWFpbjogJ25vZGUnLFxuICAgICAgICBsZXZlbDogJ3Vuc3VwcG9ydGVkJyxcbiAgICAgICAgZmllbGQ6ICdibGVuZE1vZGUnLFxuICAgICAgICBoYW5kbGluZzogJ2RlZmF1bHQtY29jb3MtcmVuZGVyLXN0YXRlJyxcbiAgICAgICAgcmVhc29uOiAn6IqC54K55re35ZCI5qih5byP5bCa5pyq5pig5bCE5YiwIENvY29zIOa4suafk+eKtuaAgeOAgicsXG4gICAgfSxcbiAgICAndGV4dC1tdWx0aXBsZS1kcm9wLXNoYWRvd3MnOiB7XG4gICAgICAgIGRvbWFpbjogJ2VmZmVjdCcsXG4gICAgICAgIGxldmVsOiAnZmFsbGJhY2snLFxuICAgICAgICBmaWVsZDogJ2VmZmVjdHNbXScsXG4gICAgICAgIGhhbmRsaW5nOiAnZmlyc3QtdmlzaWJsZS1vbmx5JyxcbiAgICAgICAgcmVhc29uOiAn5paH5a2X6Zi05b2x5b2T5YmN5Y+q6K+75Y+W56ys5LiA5Liq5Y+v6KeBIERST1BfU0hBRE9X44CCJyxcbiAgICB9LFxuICAgICdub24tdGV4dC1kcm9wLXNoYWRvdyc6IHtcbiAgICAgICAgZG9tYWluOiAnZWZmZWN0JyxcbiAgICAgICAgbGV2ZWw6ICd1bnN1cHBvcnRlZCcsXG4gICAgICAgIGZpZWxkOiAnZWZmZWN0c1tdLnR5cGUnLFxuICAgICAgICBoYW5kbGluZzogJ2lnbm9yZWQnLFxuICAgICAgICByZWFzb246ICfpnZ7mloflrZfoioLngrnnmoQgRFJPUF9TSEFET1cg5bCa5pyq5pig5bCE5YiwIENvY29z44CCJyxcbiAgICB9LFxuICAgICd0ZXh0LXNoYWRvdy1zcHJlYWQnOiB7XG4gICAgICAgIGRvbWFpbjogJ2VmZmVjdCcsXG4gICAgICAgIGxldmVsOiAnZmFsbGJhY2snLFxuICAgICAgICBmaWVsZDogJ2VmZmVjdHNbXS5zcHJlYWQnLFxuICAgICAgICBoYW5kbGluZzogJ2lnbm9yZWQtc3ByZWFkJyxcbiAgICAgICAgcmVhc29uOiAnQ29jb3Mg5paH5a2X6Zi05b2x5rKh5pyJ6L+Y5Y6fIEZpZ21hIHNwcmVhZOOAgicsXG4gICAgfSxcbiAgICAndGV4dC1zaGFkb3ctYmxlbmQtbW9kZSc6IHtcbiAgICAgICAgZG9tYWluOiAnZWZmZWN0JyxcbiAgICAgICAgbGV2ZWw6ICdmYWxsYmFjaycsXG4gICAgICAgIGZpZWxkOiAnZWZmZWN0c1tdLmJsZW5kTW9kZScsXG4gICAgICAgIGhhbmRsaW5nOiAnZGVmYXVsdC1jb2Nvcy1ibGVuZCcsXG4gICAgICAgIHJlYXNvbjogJ0NvY29zIOaWh+Wtl+mYtOW9seS9v+eUqOm7mOiupOa3t+WQiOaooeW8j+OAgicsXG4gICAgfSxcbiAgICAnYmFja2dyb3VuZC1ibHVyJzoge1xuICAgICAgICBkb21haW46ICdlZmZlY3QnLFxuICAgICAgICBsZXZlbDogJ3Vuc3VwcG9ydGVkJyxcbiAgICAgICAgZmllbGQ6ICdlZmZlY3RzW10udHlwZScsXG4gICAgICAgIGhhbmRsaW5nOiAnaWdub3JlZCcsXG4gICAgICAgIHJlYXNvbjogJ+W9k+WJjeayoeacieiDjOaZr+mHh+agt+aooeeziueahCBDb2NvcyDmmKDlsITjgIInLFxuICAgIH0sXG4gICAgJ2xheWVyLWJsdXInOiB7XG4gICAgICAgIGRvbWFpbjogJ2VmZmVjdCcsXG4gICAgICAgIGxldmVsOiAndW5zdXBwb3J0ZWQnLFxuICAgICAgICBmaWVsZDogJ2VmZmVjdHNbXS50eXBlJyxcbiAgICAgICAgaGFuZGxpbmc6ICdpZ25vcmVkJyxcbiAgICAgICAgcmVhc29uOiAn5b2T5YmN5rKh5pyJ5Zu+5bGC5qih57OK55qEIENvY29zIOaYoOWwhOOAgicsXG4gICAgfSxcbiAgICAnaW5uZXItc2hhZG93Jzoge1xuICAgICAgICBkb21haW46ICdlZmZlY3QnLFxuICAgICAgICBsZXZlbDogJ3Vuc3VwcG9ydGVkJyxcbiAgICAgICAgZmllbGQ6ICdlZmZlY3RzW10udHlwZScsXG4gICAgICAgIGhhbmRsaW5nOiAnaWdub3JlZCcsXG4gICAgICAgIHJlYXNvbjogJ+W9k+WJjeayoeacieWGhemYtOW9seeahCBDb2NvcyDmmKDlsITjgIInLFxuICAgIH0sXG4gICAgJ3Vua25vd24tZWZmZWN0LXR5cGUnOiB7XG4gICAgICAgIGRvbWFpbjogJ2VmZmVjdCcsXG4gICAgICAgIGxldmVsOiAndW5zdXBwb3J0ZWQnLFxuICAgICAgICBmaWVsZDogJ2VmZmVjdHNbXS50eXBlJyxcbiAgICAgICAgaGFuZGxpbmc6ICdpZ25vcmVkJyxcbiAgICAgICAgcmVhc29uOiAn6K+lIEZpZ21hIGVmZmVjdCDnsbvlnovlsJrmnKrnmbvorrAgQ29jb3Mg5pig5bCE44CCJyxcbiAgICB9LFxuICAgICdtdWx0aXBsZS12aXNpYmxlLWZpbGxzJzoge1xuICAgICAgICBkb21haW46ICdmaWxsJyxcbiAgICAgICAgbGV2ZWw6ICdmYWxsYmFjaycsXG4gICAgICAgIGZpZWxkOiAnZmlsbHNbXScsXG4gICAgICAgIGhhbmRsaW5nOiAncHJpbWFyeS1maWxsLW9ubHknLFxuICAgICAgICByZWFzb246ICflvZPliY3op4bop4noioLngrnlj6rpgInmi6nkuIDkuKrkuLvopoEgZmlsbCDot6/lvoTvvIzlhbbkvZkgZmlsbCDkuI3kvJrlj6DliqDov5jljp/jgIInLFxuICAgIH0sXG4gICAgJ2ZpbGwtYmxlbmQtbW9kZSc6IHtcbiAgICAgICAgZG9tYWluOiAnZmlsbCcsXG4gICAgICAgIGxldmVsOiAndW5zdXBwb3J0ZWQnLFxuICAgICAgICBmaWVsZDogJ2ZpbGxzW10uYmxlbmRNb2RlJyxcbiAgICAgICAgaGFuZGxpbmc6ICdkZWZhdWx0LWNvY29zLWJsZW5kJyxcbiAgICAgICAgcmVhc29uOiAnZmlsbCDmt7flkIjmqKHlvI/lsJrmnKrmmKDlsITliLAgQ29jb3Mg5p2Q6LSo44CCJyxcbiAgICB9LFxuICAgICdmaWxsLWdyYWRpZW50Jzoge1xuICAgICAgICBkb21haW46ICdmaWxsJyxcbiAgICAgICAgbGV2ZWw6ICdmYWxsYmFjaycsXG4gICAgICAgIGZpZWxkOiAnZmlsbHNbXS5ncmFkaWVudE1vZGUnLFxuICAgICAgICBoYW5kbGluZzogJ2F2ZXJhZ2UtZW5kcG9pbnQtY29sb3JzJyxcbiAgICAgICAgcmVhc29uOiAn5riQ5Y+Y5b2T5YmN5Y+W5Lik56uv6aKc6Imy5Z2H5YC85L2c5Li65Y2V6Imy6ZmN57qn44CCJyxcbiAgICB9LFxuICAgICduYXRpdmUtZ3JhZGllbnQtZmlsbCc6IHtcbiAgICAgICAgZG9tYWluOiAnZmlsbCcsXG4gICAgICAgIGxldmVsOiAndW5zdXBwb3J0ZWQnLFxuICAgICAgICBmaWVsZDogJ2ZpbGxzW10udHlwZScsXG4gICAgICAgIGhhbmRsaW5nOiAnaWdub3JlZCcsXG4gICAgICAgIHJlYXNvbjogJ+ivpeWOn+eUn+a4kOWPmCBmaWxsIOWwmuacqui/m+WFpSBDb2NvcyDop4bop4nmmKDlsITjgIInLFxuICAgIH0sXG4gICAgJ3Vua25vd24tZmlsbC10eXBlJzoge1xuICAgICAgICBkb21haW46ICdmaWxsJyxcbiAgICAgICAgbGV2ZWw6ICd1bnN1cHBvcnRlZCcsXG4gICAgICAgIGZpZWxkOiAnZmlsbHNbXS50eXBlJyxcbiAgICAgICAgaGFuZGxpbmc6ICdpZ25vcmVkJyxcbiAgICAgICAgcmVhc29uOiAn6K+lIEZpZ21hIGZpbGwg57G75Z6L5bCa5pyq55m76K6wIENvY29zIOaYoOWwhOOAgicsXG4gICAgfSxcbiAgICAnbm9uLXRleHQtc3Ryb2tlcyc6IHtcbiAgICAgICAgZG9tYWluOiAnc3Ryb2tlJyxcbiAgICAgICAgbGV2ZWw6ICd1bnN1cHBvcnRlZCcsXG4gICAgICAgIGZpZWxkOiAnc3Ryb2tlc1tdJyxcbiAgICAgICAgaGFuZGxpbmc6ICdpZ25vcmVkJyxcbiAgICAgICAgcmVhc29uOiAn5b2T5YmN5LuF5paH5a2X5o+P6L656L+b5YWlIENvY29zIOaYoOWwhO+8jOaZrumAmuWbvuW9ouaPj+i+ueWwmuacqui/mOWOn+OAgicsXG4gICAgfSxcbiAgICAnbXVsdGlwbGUtdGV4dC1zdHJva2VzJzoge1xuICAgICAgICBkb21haW46ICdzdHJva2UnLFxuICAgICAgICBsZXZlbDogJ2ZhbGxiYWNrJyxcbiAgICAgICAgZmllbGQ6ICdzdHJva2VzW10nLFxuICAgICAgICBoYW5kbGluZzogJ2ZpcnN0LXZpc2libGUtb25seScsXG4gICAgICAgIHJlYXNvbjogJ+aWh+Wtl+aPj+i+ueW9k+WJjeWPquivu+WPluesrOS4gOS4quWPr+ingSBzdHJva2XjgIInLFxuICAgIH0sXG4gICAgJ3N0cm9rZS1ibGVuZC1tb2RlJzoge1xuICAgICAgICBkb21haW46ICdzdHJva2UnLFxuICAgICAgICBsZXZlbDogJ3Vuc3VwcG9ydGVkJyxcbiAgICAgICAgZmllbGQ6ICdzdHJva2VzW10uYmxlbmRNb2RlJyxcbiAgICAgICAgaGFuZGxpbmc6ICdkZWZhdWx0LWNvY29zLWJsZW5kJyxcbiAgICAgICAgcmVhc29uOiAnc3Ryb2tlIOa3t+WQiOaooeW8j+WwmuacquaYoOWwhOWIsCBDb2NvcyDmnZDotKjjgIInLFxuICAgIH0sXG59IGFzIGNvbnN0IHNhdGlzZmllcyBSZWNvcmQ8c3RyaW5nLCBNYXBwaW5nQ2FwYWJpbGl0eURlZmluaXRpb24+O1xuXG5leHBvcnQgdHlwZSBNYXBwaW5nQ2FwYWJpbGl0eUlkID0ga2V5b2YgdHlwZW9mIE1BUFBJTkdfQ0FQQUJJTElUWV9SRUdJU1RSWTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1hcHBpbmdDYXBhYmlsaXR5KGlkOiBNYXBwaW5nQ2FwYWJpbGl0eUlkKTogTWFwcGluZ0NhcGFiaWxpdHlEZWZpbml0aW9uIHtcbiAgICByZXR1cm4gTUFQUElOR19DQVBBQklMSVRZX1JFR0lTVFJZW2lkXTtcbn1cbiJdfQ==