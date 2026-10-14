import { native } from 'cc';
import { TaskScope } from '../../foundation/Tasks';
import { compareVersions, sha256, UpdateIdentity } from './UpdateProtocol';
import { DeltaIndex, DeltaPatch, pendingPatches, validateDeltaIndex } from './DeltaProtocol';

interface State {
    compatibility: string; version?: string; blockedVersion?: string; paths: string[];
    probePending: boolean; probeAttempted?: boolean;
}
interface Journal { compatibility: string; version: string; phase: 'staging'|'swapping'|'probing'; previous: State; }

/** Delta ZIPs are applied to a private copy; the running resource tree is swapped only after verification. */
export class NativeDeltaUpdate {
    private readonly writable = native.fileUtils.getWritablePath();
    private readonly cache = this.writable + 'avg-plus-hot-update/';
    private readonly next = this.writable + 'avg-plus-hot-update-next/';
    private readonly previous = this.writable + 'avg-plus-hot-update-previous/';
    private readonly marker = this.writable + 'avg-plus-hot-update-state.json';
    private readonly journalPath = this.writable + 'avg-plus-hot-update-journal.json';
    constructor(private readonly lifetime: TaskScope, private readonly identity: UpdateIdentity) {}

    private read<T>(path: string): T|null {
        try { return JSON.parse(native.fileUtils.getStringFromFile(path)) as T; } catch { return null; }
    }
    private write(path: string, value: unknown): void {
        if (!native.fileUtils.writeStringToFile(JSON.stringify(value), path)) throw new Error('更新状态写入失败');
    }
    private removeDirectory(path: string): void { if (native.fileUtils.isDirectoryExist(path)) native.fileUtils.removeDirectory(path); }
    private cleanStaging(): void { this.removeDirectory(this.next); this.removeDirectory(this.next.slice(0,-1)+'_temp/'); }

    public recover(): boolean {
        const journal=this.read<Journal>(this.journalPath);
        if (!journal || journal.compatibility!==this.identity.nativeCompatibility) return false;
        if (!['staging','swapping','probing'].includes(journal.phase) || !journal.previous
            || journal.previous.compatibility!==this.identity.nativeCompatibility) throw new Error('更新恢复记录无效');
        compareVersions(journal.version,this.identity.version);
        const state=this.read<State>(this.marker);
        if (journal.phase==='staging') { this.cleanStaging();native.fileUtils.removeFile(this.journalPath);return false; }
        if (state?.version===journal.version && state.blockedVersion!==journal.version) {
            // First boot of this coherent snapshot is still being tested by the shell.
            if (state.probePending) return false;
            this.confirm();return false;
        }
        if (journal.phase==='swapping' && journal.previous.paths?.[0]===this.cache
            && !native.fileUtils.isDirectoryExist(this.previous)) {
            // Backup rename had not happened. The existing tree is still the healthy one.
            this.cleanStaging();native.fileUtils.removeFile(this.journalPath);return false;
        }
        this.cleanStaging();this.removeDirectory(this.cache);
        if (native.fileUtils.isDirectoryExist(this.previous)) {
            if (!native.fileUtils.renameFile(this.previous,this.cache)) throw new Error('无法恢复上一版资源');
            this.write(this.marker,{...journal.previous,paths:[this.cache],blockedVersion:journal.version,
                probePending:false,probeAttempted:false});
            native.fileUtils.removeFile(this.journalPath);return true;
        }
        this.write(this.marker,{compatibility:this.identity.nativeCompatibility,version:this.identity.version,
            blockedVersion:journal.version,paths:[],probePending:false,probeAttempted:false});
        native.fileUtils.removeFile(this.journalPath);return false;
    }

    public confirm(): void {
        const journal=this.read<Journal>(this.journalPath),state=this.read<State>(this.marker);
        if (!journal || state?.version!==journal.version || state.probePending) return;
        this.removeDirectory(this.previous);this.cleanStaging();native.fileUtils.removeFile(this.journalPath);
    }

    public async run(status:(text:string)=>void):Promise<'restart'|'local'|null> {
        let index:DeltaIndex;
        try { index=await this.lifetime.run(scope=>this.fetch(scope),2500); }
        catch (error) { this.lifetime.check();console.warn('[Delta check] using local/legacy channel');return null; }
        const state=this.read<State>(this.marker);
        const current=state?.compatibility===this.identity.nativeCompatibility && state.paths?.length===1
            && state.paths[0]===this.cache && native.fileUtils.isDirectoryExist(this.cache) && state.version
            ? state.version:this.identity.version;
        if (compareVersions(current,index.bridgeVersion)<0) return null;
        const patches=pendingPatches(index,current,state?.blockedVersion);
        if (!patches.length) return 'local';
        const previous:State={compatibility:this.identity.nativeCompatibility,version:current,
            paths:native.fileUtils.isDirectoryExist(this.cache)?[this.cache]:[],probePending:false,probeAttempted:false,
            ...(state?.blockedVersion?{blockedVersion:state.blockedVersion}:{})};
        const journal:Journal={compatibility:this.identity.nativeCompatibility,version:index.version,phase:'staging',previous};
        const searchPaths=native.fileUtils.getSearchPaths();
        let oldMoved=false,newInstalled=false;
        this.cleanStaging();this.write(this.journalPath,journal);
        try {
            status('正在准备增量更新…');
            native.fileUtils.createDirectory(this.next);
            await this.copyTree(this.cache,this.next);
            let version=current;
            for (const patch of patches) {
                await this.apply(patch,version,status);version=patch.version;
                for (const path of patch.removed) if (native.fileUtils.isFileExist(this.next+path)) {
                    if (!native.fileUtils.removeFile(this.next+path)) throw new Error('过期更新文件清理失败');
                }
            }
            await this.verify(patches[patches.length-1],status);
            this.lifetime.check();journal.phase='swapping';this.write(this.journalPath,journal);
            this.removeDirectory(this.previous);
            if (native.fileUtils.isDirectoryExist(this.cache)) {
                if (!native.fileUtils.renameFile(this.cache,this.previous)) throw new Error('旧资源保留失败');
                oldMoved=true;
            }
            if (!native.fileUtils.renameFile(this.next,this.cache)) throw new Error('新资源切换失败');
            newInstalled=true;
            this.write(this.marker,{compatibility:this.identity.nativeCompatibility,version:index.version,
                paths:[this.cache],probePending:true,probeAttempted:false});
            journal.phase='probing';this.write(this.journalPath,journal);
            native.fileUtils.setSearchPaths(searchPaths);native.fileUtils.purgeCachedEntries();
            status('增量更新完成，正在重新启动…');return 'restart';
        } catch (error) {
            if (oldMoved || newInstalled) {
                if(newInstalled)this.removeDirectory(this.cache);
                if(oldMoved && native.fileUtils.isDirectoryExist(this.previous)
                    && !native.fileUtils.renameFile(this.previous,this.cache)) {
                    // Keep the journal and backup so the next boot can retry restoration.
                    native.fileUtils.setSearchPaths(searchPaths);native.fileUtils.purgeCachedEntries();
                    throw new Error('上一版资源仍保留，等待下次启动恢复');
                }
                this.write(this.marker,previous);
            }
            this.cleanStaging();native.fileUtils.removeFile(this.journalPath);
            native.fileUtils.setSearchPaths(searchPaths);native.fileUtils.purgeCachedEntries();
            this.lifetime.check();console.warn('[Delta update] current content retained',error);status('使用本地内容');return 'local';
        }
    }

    private async copyTree(source:string,target:string):Promise<void> {
        if (!native.fileUtils.isDirectoryExist(source)) return;
        const files=native.fileUtils.listFiles(source);
        for (let index=0;index<files.length;index++) {
            this.lifetime.check();const path=files[index];
            if (!path.startsWith(source)) throw new Error('本地缓存路径无效');
            const destination=target+path.slice(source.length);
            if (native.fileUtils.isDirectoryExist(path)) { native.fileUtils.createDirectory(destination);await this.copyTree(path,destination); }
            else if (!native.fileUtils.writeDataToFile(native.fileUtils.getDataFromFile(path),destination)) throw new Error('本地资源复制失败');
            if (index%16===0) await new Promise<void>(resolve=>setTimeout(resolve,0));
        }
    }
    private async verify(patch:DeltaPatch,status:(text:string)=>void):Promise<void> {
        for (let index=0;index<patch.files.length;index++) {
            this.lifetime.check();const expected=patch.files[index];
            const path=native.fileUtils.isFileExist(this.next+expected.path)?this.next+expected.path:expected.path;
            if(!native.fileUtils.isFileExist(path))throw new Error('增量内容文件缺失：'+expected.path);
            const data=new Uint8Array(native.fileUtils.getDataFromFile(path));
            if (data.byteLength!==expected.bytes || sha256(data)!==expected.sha256) throw new Error('增量内容校验失败：'+expected.path);
            if (index%16===0) { status(`正在校验内容 ${Math.floor(index/patch.files.length*100)}%`);await new Promise<void>(resolve=>setTimeout(resolve,0)); }
        }
    }
    private fetch(scope:TaskScope):Promise<DeltaIndex> {
        return new Promise((resolve,reject)=>{
            const request=new XMLHttpRequest();let done=false;
            const finish=(error?:Error,value?:DeltaIndex)=>{if(done)return;done=true;release();request.onload=request.onerror=request.ontimeout=request.onabort=null;error?reject(error):resolve(value!);};
            const release=scope.own(()=>{request.abort();finish(new Error('更新检查取消'));});
            request.open('GET',this.identity.hotUpdateBaseUrl+'delta/latest/index.json?t='+Date.now(),true);request.timeout=1800;
            request.onload=()=>{if(request.status!==200)return finish(new Error('增量入口不可用'));try{scope.check();finish(undefined,validateDeltaIndex(JSON.parse(request.responseText),this.identity));}catch(error){finish(error instanceof Error?error:new Error(String(error)));}};
            request.onerror=request.ontimeout=request.onabort=()=>finish(new Error('增量检查未完成'));request.send();
        });
    }
    private async apply(patch:DeltaPatch,current:string,status:(text:string)=>void):Promise<void> {
        const manifest={packageUrl:patch.packageUrl,remoteManifestUrl:this.identity.remoteManifestUrl,
            remoteVersionUrl:this.identity.hotUpdateBaseUrl+'latest/avg-plus-version.manifest',version:patch.version,
            engineVersion:'3.8.8',assets:{'avg-plus-assets.zip':{size:patch.archive.bytes,md5:patch.archive.sha256,compressed:true}},searchPaths:['']};
        const manager=new native.AssetsManager('',this.next,compareVersions);
        const local=this.next+'project.manifest';this.write(local,{...manifest,version:current,assets:{}});
        if (!manager.loadLocalManifest(local)) throw new Error('增量本地清单失败');
        if (!manager.loadRemoteManifest(new native.Manifest(JSON.stringify(manifest),this.next))) throw new Error('增量远程清单失败');
        manager.setMaxConcurrentTask(1);
        manager.setVerifyCallback((path,asset)=>{if(this.lifetime.cancelled||asset.md5!==patch.archive.sha256)return false;try{const data=new Uint8Array(native.fileUtils.getDataFromFile(path));return data.byteLength===patch.archive.bytes&&sha256(data)===patch.archive.sha256;}catch{return false;}});
        await this.lifetime.run(scope=>new Promise<void>((resolve,reject)=>{
            let done=false,retries=0;const finish=(error?:Error)=>{if(done)return;done=true;release();manager.setEventCallback(()=>{});error?reject(error):resolve();};
            const release=scope.own(()=>finish(new Error('增量下载取消')));
            manager.setEventCallback(event=>{if(done||scope.cancelled)return;const code=event.getEventCode(),codes=native.EventAssetsManager;
                if(code===codes.UPDATE_PROGRESSION)status(`正在下载增量 ${Math.max(0,Math.min(100,Math.floor(event.getPercent())))}%`);
                else if(code===codes.UPDATE_FINISHED||code===codes.ALREADY_UP_TO_DATE)finish();
                else if(code===codes.UPDATE_FAILED&&retries++<2)manager.downloadFailedAssets();
                else if([codes.UPDATE_FAILED,codes.ERROR_NO_LOCAL_MANIFEST,codes.ERROR_DOWNLOAD_MANIFEST,codes.ERROR_PARSE_MANIFEST].includes(code))finish(new Error(event.getMessage()||'增量未完成'));
            });manager.update();
        }),600000);
    }
}
