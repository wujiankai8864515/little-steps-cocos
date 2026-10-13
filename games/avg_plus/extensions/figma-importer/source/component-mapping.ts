export interface ComponentMappingEntry {
    componentKey: string;
    componentName: string;
    prefabUuid: string;
    prefabUrl: string;
    variantFilter: string;
}

export interface ComponentMappingDocument {
    version: number;
    updatedAt: string;
    entries: ComponentMappingEntry[];
}

export interface ComponentIdentity {
    componentKey: string;
    componentName: string;
    variantFilter: string;
    componentProperties: { [key: string]: string };
    /** True when another Figma component instance exists on this node's ancestor chain. */
    isNested?: boolean;
}

export interface ComponentMappingResolution {
    status: 'mapped' | 'unmapped' | 'broken';
    entry?: ComponentMappingEntry;
    reason: string;
}

export interface FigmaComponentStateData {
    componentKey: string;
    componentName: string;
    variantFilter: string;
    propertyKeys: string[];
    propertyValues: string[];
}

function clean(value: unknown): string {
    return String(value == null ? '' : value).trim();
}

export function normalizeComponentProperties(value: unknown): { [key: string]: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: { [key: string]: string } = {};
    for (const key of Object.keys(value as object)) {
        const cleanKey = clean(key);
        const raw = (value as { [key: string]: unknown })[key];
        if (!cleanKey || raw == null || typeof raw === 'object') continue;
        out[cleanKey] = String(raw);
    }
    return out;
}

export function buildVariantFilter(properties: unknown): string {
    const normalized = normalizeComponentProperties(properties);
    return Object.keys(normalized)
        .filter((key) => key.indexOf('#') < 0)
        .sort()
        .map((key) => `${key}=${normalized[key]}`)
        .join(',');
}

/**
 * Runtime state written onto a mapped Prefab root. Keep keys sorted so scene
 * serialization and business-script reads are deterministic across imports.
 */
export function buildComponentStateData(
    componentKey: unknown,
    componentName: unknown,
    properties: unknown
): FigmaComponentStateData {
    const normalized = normalizeComponentProperties(properties);
    const propertyKeys = Object.keys(normalized).sort();
    return {
        componentKey: clean(componentKey),
        componentName: clean(componentName),
        variantFilter: buildVariantFilter(normalized),
        propertyKeys,
        propertyValues: propertyKeys.map((key) => normalized[key]),
    };
}

/** Recover the complete authored property payload from the serialized runtime component. */
export function componentPropertiesFromState(value: unknown): { [key: string]: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const raw = value as { [key: string]: unknown };
    const keys = Array.isArray(raw.propertyKeys) ? raw.propertyKeys : [];
    const values = Array.isArray(raw.propertyValues) ? raw.propertyValues : [];
    const out: { [key: string]: string } = {};
    for (let index = 0; index < keys.length; index++) {
        const key = clean(keys[index]);
        if (!key) continue;
        out[key] = String(index < values.length && values[index] != null ? values[index] : '');
    }
    return out;
}

/** Read one component identity from FigmaComponentState without consulting JSON or node names. */
export function componentIdentityFromState(value: unknown): ComponentIdentity | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as { [key: string]: unknown };
    const componentKey = clean(raw.componentKey);
    if (!componentKey) return null;
    const componentProperties = componentPropertiesFromState(raw);
    return {
        componentKey,
        componentName: clean(raw.componentName),
        variantFilter: clean(raw.variantFilter) || buildVariantFilter(componentProperties),
        componentProperties,
    };
}

export function variantFilterMatches(filter: string, properties: unknown): boolean {
    const value = clean(filter);
    if (!value) return true;
    const normalized = normalizeComponentProperties(properties);
    const conditions = value.split(',').map((part) => part.trim()).filter(Boolean);
    if (conditions.length === 0) return false;
    for (const condition of conditions) {
        const separator = condition.indexOf('=');
        if (separator <= 0) return false;
        const key = condition.slice(0, separator).trim();
        const expected = condition.slice(separator + 1).trim();
        if (!key || normalized[key] !== expected) return false;
    }
    return true;
}

export function normalizeMappingEntry(value: unknown): ComponentMappingEntry | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as { [key: string]: unknown };
    const componentKey = clean(raw.componentKey);
    if (!componentKey) return null;
    return {
        componentKey,
        componentName: clean(raw.componentName),
        prefabUuid: clean(raw.prefabUuid),
        prefabUrl: clean(raw.prefabUrl),
        variantFilter: clean(raw.variantFilter),
    };
}

export function normalizeMappingDocument(value: unknown): ComponentMappingDocument {
    const raw = value && typeof value === 'object' && !Array.isArray(value)
        ? value as { [key: string]: unknown }
        : {};
    const entries: ComponentMappingEntry[] = [];
    const seen = new Map<string, number>();
    for (const item of Array.isArray(raw.entries) ? raw.entries : []) {
        const entry = normalizeMappingEntry(item);
        if (!entry) continue;
        const identity = `${entry.componentKey}\u0000${entry.variantFilter}`;
        const existing = seen.get(identity);
        if (existing == null) {
            seen.set(identity, entries.length);
            entries.push(entry);
        } else {
            entries[existing] = entry;
        }
    }
    return {
        version: 1,
        updatedAt: clean(raw.updatedAt),
        entries,
    };
}

export function upsertMappingEntry(
    document: ComponentMappingDocument,
    value: ComponentMappingEntry
): ComponentMappingDocument {
    const next = normalizeMappingDocument(document);
    const entry = normalizeMappingEntry(value);
    if (!entry) return next;
    const index = next.entries.findIndex((item) =>
        item.componentKey === entry.componentKey && item.variantFilter === entry.variantFilter
    );
    if (index >= 0) next.entries[index] = entry;
    else next.entries.push(entry);
    return next;
}

export function removeMappingEntry(
    document: ComponentMappingDocument,
    componentKey: string,
    variantFilter: string
): ComponentMappingDocument {
    const key = clean(componentKey);
    const filter = clean(variantFilter);
    const next = normalizeMappingDocument(document);
    next.entries = next.entries.filter((entry) =>
        entry.componentKey !== key || entry.variantFilter !== filter
    );
    return next;
}

export function resolveComponentMapping(
    componentKey: string,
    properties: unknown,
    entries: ComponentMappingEntry[],
    isAvailable: (entry: ComponentMappingEntry) => boolean = (entry) => !!(entry.prefabUuid || entry.prefabUrl)
): ComponentMappingResolution {
    const key = clean(componentKey);
    if (!key) return { status: 'unmapped', reason: 'missing-component-key' };
    const relevant = (entries || []).filter((entry) => entry && entry.componentKey === key);
    if (relevant.length === 0) return { status: 'unmapped', reason: 'no-mapping' };

    const variants = relevant.filter((entry) =>
        !!entry.variantFilter && variantFilterMatches(entry.variantFilter, properties)
    );
    const defaults = relevant.filter((entry) => !entry.variantFilter);
    const candidates = variants.concat(defaults);
    for (const entry of candidates) {
        if (isAvailable(entry)) {
            return {
                status: 'mapped',
                entry,
                reason: entry.variantFilter ? 'variant-match' : 'default-match',
            };
        }
    }
    if (candidates.length > 0) {
        return { status: 'broken', entry: candidates[0], reason: 'prefab-unavailable' };
    }
    return { status: 'unmapped', reason: 'variant-no-match' };
}

export function collectComponentIdentities(root: unknown): ComponentIdentity[] {
    const identities = new Map<string, ComponentIdentity>();
    const visit = (value: unknown, ancestorIsComponent: boolean): void => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        const node = value as { [key: string]: unknown };
        const componentKey = clean(node.componentKey);
        if (componentKey) {
            const componentProperties = normalizeComponentProperties(node.componentProperties);
            const identity: ComponentIdentity = {
                componentKey,
                componentName: clean(node.name),
                variantFilter: buildVariantFilter(componentProperties),
                componentProperties,
                isNested: ancestorIsComponent,
            };
            const dedupKey = `${identity.componentKey}\u0000${identity.variantFilter}`;
            const existing = identities.get(dedupKey);
            if (!existing || (existing.isNested === true && identity.isNested !== true)) {
                identities.set(dedupKey, identity);
            }
        }
        const figmaType = clean(node.figmaType || node.type).toUpperCase();
        const childAncestorIsComponent = ancestorIsComponent || !!componentKey || figmaType === 'INSTANCE';
        if (Array.isArray(node.children)) {
            node.children.forEach((child) => visit(child, childAncestorIsComponent));
        }
    };
    visit(root, false);
    return Array.from(identities.values()).sort((a, b) =>
        a.componentName.localeCompare(b.componentName) || a.variantFilter.localeCompare(b.variantFilter)
    );
}
