export const COMPONENT_STATE_GENERATED_MARKER = '// @ftoc-generated FigmaComponentState v1';
export const COMPONENT_STATE_RUNTIME_REVISION = 1;

export type ComponentStateRuntimeProvisionAction =
    | 'write'
    | 'keep-generated'
    | 'keep-custom'
    | 'collision';

/** Decide asset ownership before querying scene readiness or writing a ccclass. */
export function planComponentStateRuntimeProvision(
    existing: string,
    template: string,
    classRegistered: boolean
): ComponentStateRuntimeProvisionAction {
    if (!existing) return classRegistered ? 'collision' : 'write';
    if (existing.indexOf(COMPONENT_STATE_GENERATED_MARKER) >= 0) {
        return existing === template ? 'keep-generated' : 'write';
    }
    return 'keep-custom';
}

/** Only plugin-managed runtime assets may satisfy the component-state contract. */
export function shouldWaitForComponentStateRuntime(
    action: ComponentStateRuntimeProvisionAction
): boolean {
    return action === 'write' || action === 'keep-generated';
}
