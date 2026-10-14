import { native } from 'cc';
import { NATIVE } from 'cc/env';
import { TaskScope } from '../../foundation/Tasks';
import { compareVersions, sha256, UpdateIdentity, UpdateManifest, validateUpdate, UPDATE_CHECK_TIMEOUT_MS, UPDATE_CHECK_BUDGET_MS } from './UpdateProtocol';
import { NativeDeltaUpdate } from './NativeDeltaUpdate';

type Result = 'local' | 'restart';
interface BootState {
    compatibility: string;
    version?: string;
    blockedVersion?: string;
    paths: string[];
    probePending: boolean;
    probeAttempted?: boolean;
}

/** Native startup only; game sessions keep their existing JSON/AVG loaders. */
export class NativeHotUpdate {
    constructor(private readonly lifetime: TaskScope) {}

    private identity(): UpdateIdentity {
        return JSON.parse(native.fileUtils.getStringFromFile('avg-plus-native.json')) as UpdateIdentity;
    }
    private marker(): string { return native.fileUtils.getWritablePath() + 'avg-plus-hot-update-state.json'; }
    private readState(): BootState | null {
        try { return JSON.parse(native.fileUtils.getStringFromFile(this.marker())) as BootState; }
        catch (_) { return null; }
    }
    private writeState(state: BootState): boolean {
        const target = this.marker(), temporary = target + '.writing';
        if (native.fileUtils.writeStringToFile(JSON.stringify(state), temporary)
            && native.fileUtils.renameFile(temporary, target)) return true;
        native.fileUtils.removeFile(temporary); return false;
    }
    public markHealthy(): void {
        if (!NATIVE) return;
        const state = this.readState();
        if (state?.probePending && state.compatibility === this.identity().nativeCompatibility) {
            state.probePending = false;
            state.probeAttempted = false;
            if (!this.writeState(state)) { console.warn('[NativeHotUpdate] 启动确认未写入，保留上一版'); return; }
        }
        new NativeDeltaUpdate(this.lifetime,this.identity()).confirm();
    }
    public async run(status: (text: string) => void): Promise<Result> {
        if (!NATIVE) return 'local';
        try {
            const identity = this.identity();
            const delta=new NativeDeltaUpdate(this.lifetime,identity);
            if(delta.recover())return 'restart';
            status('正在检查更新…');
            const incremental=await delta.run(status);
            this.lifetime.check();if(incremental)return incremental;
            const manifest = await this.lifetime.run(scope => this.fetchManifest(identity, scope), UPDATE_CHECK_BUDGET_MS);
            this.lifetime.check();
            if (this.readState()?.blockedVersion === manifest.version) return 'local';
            const cache = native.fileUtils.getWritablePath() + 'avg-plus-hot-update/';
            const manager = new native.AssetsManager('project.manifest', cache, compareVersions);
            if (!manager.getLocalManifest()?.isLoaded()) throw new Error('本地更新清单缺失');
            if (compareVersions(manifest.version, manager.getLocalManifest().getVersion()) <= 0) return 'local';
            if (!manager.loadRemoteManifest(new native.Manifest(JSON.stringify(manifest), cache))) {
                throw new Error('更新清单无法载入');
            }
            manager.setMaxConcurrentTask(1);
            manager.setVerifyCallback((path, asset) => {
                const expected = manifest.assets['avg-plus-assets.zip'];
                // Cocos 3.8.8 stores Asset.size in a C++ float; large odd byte counts are rounded.
                // The validated JS manifest and actual bytes retain the exact integer length.
                if (this.lifetime.cancelled || asset.md5 !== expected.md5) return false;
                try {
                    const data = new Uint8Array(native.fileUtils.getDataFromFile(path));
                    return data.byteLength === expected.size && sha256(data) === expected.md5;
                } catch (_) { return false; }
            });
            await this.lifetime.run(scope => this.download(manager, scope, status), 600000);
            this.lifetime.check();
            const state: BootState = {
                compatibility: identity.nativeCompatibility, version: manifest.version,
                paths: [cache], probePending: true, probeAttempted: false
            };
            if (!this.writeState(state)) {
                throw new Error('无法保存更新启动状态');
            }
            status('更新完成，正在重新启动…');
            return 'restart';
        } catch (error) {
            this.lifetime.check();
            console.warn('[NativeHotUpdate] 本地版本启动：', error);
            status('使用本地内容');
            return 'local';
        }
    }
    private fetchManifest(identity: UpdateIdentity, scope: TaskScope): Promise<UpdateManifest> {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            let done = false;
            const release = scope.own(() => { request.abort(); finish(new Error('更新检查已取消')); });
            const finish = (error?: Error, manifest?: UpdateManifest) => {
                if (done) return;
                done = true; release();
                request.onload = request.onerror = request.ontimeout = request.onabort = null;
                error ? reject(error) : resolve(manifest!);
            };
            request.open('GET', identity.remoteManifestUrl + '?t=' + Date.now(), true);
            request.timeout = UPDATE_CHECK_TIMEOUT_MS;
            request.onload = () => {
                if (request.status !== 200) return finish(new Error('更新服务暂不可用'));
                try { scope.check(); finish(undefined, validateUpdate(JSON.parse(request.responseText), identity)); }
                catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
            };
            request.onerror = () => finish(new Error('更新网络不可用'));
            request.ontimeout = () => finish(new Error('更新检查超时'));
            request.onabort = () => finish(new Error('更新检查中断'));
            request.send();
        });
    }
    private download(manager: native.AssetsManager, scope: TaskScope, status: (text: string) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            let retries = 0, done = false;
            const release = scope.own(() => finish(new Error('更新下载已取消')));
            const finish = (error?: Error) => {
                if (done) return;
                done = true; release(); manager.setEventCallback(() => {});
                error ? reject(error) : resolve();
            };
            manager.setEventCallback(event => {
                if (done || scope.cancelled) return;
                const code = event.getEventCode(), codes = native.EventAssetsManager;
                if (code === codes.UPDATE_PROGRESSION) {
                    status(`正在更新 ${Math.max(0, Math.min(100, Math.floor(event.getPercent())))}%`);
                } else if (code === codes.UPDATE_FINISHED || code === codes.ALREADY_UP_TO_DATE) {
                    finish();
                } else if (code === codes.UPDATE_FAILED && retries++ < 2) {
                    status('正在重试更新…'); manager.downloadFailedAssets();
                } else if ([codes.UPDATE_FAILED, codes.ERROR_NO_LOCAL_MANIFEST, codes.ERROR_DOWNLOAD_MANIFEST,
                    codes.ERROR_PARSE_MANIFEST].includes(code)) {
                    finish(new Error(event.getMessage() || '更新未完成'));
                }
            });
            manager.update();
        });
    }
}
