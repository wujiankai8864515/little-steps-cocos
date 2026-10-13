export interface MappedComponentStateRequest {
    nodeUuid: string;
    active: boolean;
    componentKey: string;
    componentName: string;
    variantFilter: string;
    propertyKeys: string[];
    propertyValues: string[];
    /** True only for an instantiated mapped Prefab root. */
    requiresPrefabOverride?: boolean;
}

export interface MappedComponentStateReport {
    total: number;
    attached: number;
    mounted: number;
    overrideTotal: number;
    unavailable: number;
    overrideMissing: number;
    activated: number;
    createFailures: Array<{ nodeUuid: string; error: string }>;
}

export interface MappedComponentStateDependencies {
    createComponent(nodeUuid: string, componentName: string): Promise<unknown>;
    applyStates(items: MappedComponentStateRequest[]): Promise<any>;
    restoreActivity?(items: MappedComponentStateRequest[]): Promise<any>;
}

function count(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * Add state through Creator's editor facade, then let the scene script fill the
 * newly mounted component. Direct Node.addComponent bypasses Prefab overrides.
 */
export async function finalizeMappedComponentStates(
    items: MappedComponentStateRequest[],
    dependencies: MappedComponentStateDependencies,
): Promise<MappedComponentStateReport> {
    const requests = Array.isArray(items) ? items.filter((item) => !!(item && item.nodeUuid)) : [];
    const createFailures: Array<{ nodeUuid: string; error: string }> = [];

    for (const item of requests) {
        try {
            const created = await dependencies.createComponent(item.nodeUuid, 'FigmaComponentState');
            if (created === false || (created && typeof created === 'object' && (created as any).success === false)) {
                createFailures.push({ nodeUuid: item.nodeUuid, error: 'scene/create-component returned failure' });
            }
        } catch (error) {
            createFailures.push({
                nodeUuid: item.nodeUuid,
                error: String((error as any)?.message || error || 'scene/create-component failed'),
            });
        }
    }

    let applied: any = null;
    let applyFailure = '';
    try {
        applied = await dependencies.applyStates(requests);
    } catch (error) {
        applyFailure = String((error as any)?.message || error || 'applyComponentStates failed');
    }

    const data = applied && applied.success !== false && applied.data ? applied.data : {};
    const attached = Math.min(requests.length, count(data.attached));
    const unavailable = !applyFailure && applied && applied.success !== false
        ? Math.min(requests.length, count(data.unavailable))
        : requests.length;
    let activated = Math.min(requests.length, count(data.activated));
    const overrideTotal = Math.min(
        requests.length,
        count(data.overrideTotal) || requests.filter((item) => item.requiresPrefabOverride).length,
    );

    if (applyFailure) {
        createFailures.push({ nodeUuid: '', error: applyFailure });
    }

    // Nodes are deliberately inactive while the editor facade adds the
    // component. Never save that intermediate state if the apply call failed
    // or only activated a subset of the request list.
    if (activated < requests.length) {
        if (!dependencies.restoreActivity) {
            throw new Error(
                `FigmaComponentState activation incomplete (${activated}/${requests.length}) and no recovery hook is available`,
            );
        }
        let recovered: any;
        try {
            recovered = await dependencies.restoreActivity(requests);
        } catch (error) {
            throw new Error(
                `FigmaComponentState activation recovery failed: ${String((error as any)?.message || error || 'unknown error')}`,
            );
        }
        const recoveredData = recovered && recovered.success !== false && recovered.data
            ? recovered.data
            : {};
        activated = Math.max(activated, Math.min(requests.length, count(recoveredData.activated)));
        if (activated < requests.length) {
            throw new Error(
                `FigmaComponentState activation incomplete after recovery (${activated}/${requests.length})`,
            );
        }
    }

    return {
        total: requests.length,
        attached,
        mounted: Math.min(attached, count(data.mounted)),
        overrideTotal,
        unavailable,
        overrideMissing: Math.min(requests.length, count(data.overrideMissing)),
        activated,
        createFailures,
    };
}

export function mergeMappedComponentStateReport(stats: any, report: MappedComponentStateReport): void {
    if (!stats || !report) return;
    stats.componentStatesAttached = count(stats.componentStatesAttached) + report.attached;
    stats.componentStateUnavailable = count(stats.componentStateUnavailable) + report.unavailable;
    stats.mappedComponentStateOverrides = report.mounted;
    stats.mappedComponentStateOverrideTotal = report.overrideTotal;
    stats.mappedComponentStateOverrideMissing = report.overrideMissing;
    stats.mappedComponentStateCreateFailures = report.createFailures.length;
    delete stats.pendingComponentStates;
    delete stats.pendingMappedComponentStates;
}
