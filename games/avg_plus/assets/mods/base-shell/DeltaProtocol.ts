import { compareVersions, UpdateIdentity } from './UpdateProtocol';

export interface ContentFile { path: string; bytes: number; sha256: string; }
export interface DeltaPatch {
    version: string; baseVersion: string; displayVersion: string; nativeCompatibility: string;
    packageUrl: string; archive: { bytes: number; sha256: string }; removed: string[]; files: ContentFile[];
}
export interface DeltaIndex {
    schemaVersion: 2; bridgeVersion: string; version: string; displayVersion: string;
    nativeCompatibility: string; updates: DeltaPatch[];
}

export function gameResourcePath(value: unknown): string {
    if (typeof value !== 'string' || !/^(src|assets)\/[A-Za-z0-9_@./-]+$/.test(value)
        || value.split('/').some(part => !part || part === '.' || part === '..' || part === 'cocos-js')) {
        throw new Error('增量资源路径无效');
    }
    return value;
}
export function validateDeltaIndex(value: any, identity: UpdateIdentity): DeltaIndex {
    if (!value || value.schemaVersion !== 2 || value.nativeCompatibility !== identity.nativeCompatibility
        || !Array.isArray(value.updates) || value.updates.length > 1000) throw new Error('增量清单或原生版本无效');
    const [owner, repo] = identity.githubRepository.split('/');
    const base = `https://${owner}.github.io/${repo}/avg-plus/android/`;
    if (base !== identity.hotUpdateBaseUrl) throw new Error('增量更新源无效');
    compareVersions(value.bridgeVersion, identity.version); compareVersions(value.version, value.bridgeVersion);
    let cursor = value.bridgeVersion;
    for (const patch of value.updates) {
        if (patch.baseVersion !== cursor || compareVersions(patch.version, cursor) <= 0
            || patch.nativeCompatibility !== identity.nativeCompatibility
            || patch.packageUrl !== base + 'delta/versions/' + patch.version + '/'
            || !/^\d{4}(?:-\d{2}){5}$/.test(patch.displayVersion)
            || !Number.isSafeInteger(patch.archive?.bytes) || patch.archive.bytes < 1 || patch.archive.bytes > 128 * 1024 * 1024
            || !/^[a-f0-9]{64}$/.test(patch.archive?.sha256) || !Array.isArray(patch.files)
            || !patch.files.length || patch.files.length > 10000 || !Array.isArray(patch.removed)) throw new Error('增量版本链无效');
        const seen = new Set<string>(); let bytes = 0;
        for (const file of patch.files) {
            const path = gameResourcePath(file.path);
            if (seen.has(path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 128 * 1024 * 1024
                || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('增量文件校验信息无效');
            seen.add(path); bytes += file.bytes;
        }
        if (bytes > 256 * 1024 * 1024 || new Set(patch.removed).size !== patch.removed.length) throw new Error('增量内容过大或重复删除');
        for (const path of patch.removed) { gameResourcePath(path); if (seen.has(path)) throw new Error('增量文件同时存在和删除'); }
        cursor = patch.version;
    }
    if (cursor !== value.version) throw new Error('最新增量版本不可达');
    return value;
}

export function pendingPatches(index: DeltaIndex, current: string, blocked?: string): DeltaPatch[] {
    if (compareVersions(current, index.bridgeVersion) < 0) return [];
    if (index.version===blocked) return [];
    const result: DeltaPatch[] = []; let cursor = current;
    for (const patch of index.updates) {
        if (compareVersions(patch.version, current) <= 0) continue;
        if (patch.baseVersion !== cursor) throw new Error('本地版本没有完整增量路径');
        result.push(patch); cursor = patch.version;
    }
    return result;
}
