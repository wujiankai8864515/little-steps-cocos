import { Asset, AssetManager, assetManager, AudioClip, EffectAsset, Font, ImageAsset, JsonAsset, resources, SpriteFrame, Texture2D } from 'cc';
import { core, Scope } from './Engine';

// Same logical texture -> authored BitMap mapping as alpha_hit_cache.gd.
const hitMasks:Record<string,string>={
    'res://assets/body.png':'body', 'res://assets/fin_mallet.png':'fin_mallet', 'res://assets/tail.png':'tail',
    'res://assets/travelbag_closed.png':'bag', 'res://assets/doll_idle.png':'doll',
    'res://assets/round2/water_bowl_clean.png':'bowl', 'res://assets/altar_neutral.png':'altar',
};

export interface ArtSpec {
    kind: 'texture' | 'image' | 'font' | 'json' | 'audio' | 'mask' | 'effect'; bundle: string; path: string;
    size?: number[]; content?: number[]; opaque?: number[]; alpha?: string; decodedBytes: number;
    fontMetrics?: {ascent:number;descent:number;height:number};
    mipResources?:string[];
    streaming?: {extension:string;encodedBytes:number;reservedBytes:number;payloadSHA256:string};
}
export class GameAssets {
    catalog: { assets: Record<string, ArtSpec>; groups: Record<string, any> };
    scenes: any[];
    private bundles = new Map<string, Promise<AssetManager.Bundle>>();
    private gate = new core.ResourceGate();
    private values = new Map<string, Asset>();

    async initialize(scope: Scope) {
        const load = (name: string) => new Promise<JsonAsset>((resolve, reject) => resources.load(name, JsonAsset, (e, value) => e ? reject(e) : resolve(value)));
        const [catalog, scenes] = await scope.guard(Promise.all([load('source-catalog'), load('source-scenes')]));
        this.catalog = catalog.json as any;
        this.scenes = scenes.json.scenes;
        // Authoring manifests are bootstrap-only; resource admission for page assets is independent.
        console.info('[LittleSteps] source catalog ready', {assets: Object.keys(this.catalog.assets).length, scenes: this.scenes.length});
    }
    private bundle(name: string) {
        let request = this.bundles.get(name);
        if (!request) {
            request = new Promise<AssetManager.Bundle>((resolve, reject) => assetManager.loadBundle(name, (e, b) => e ? reject(e) : resolve(b)));
            this.bundles.set(name, request);
            request.catch(() => this.bundles.delete(name));
        }
        return request;
    }
    async acquireGroups(names: string[], scope: Scope) {
        const groups = new Set<string>();
        const include = (name: string) => {
            if (groups.has(name)) return;
            const group = this.catalog.groups[name];
            if (!group) throw new Error(`未知资源组：${name}`);
            groups.add(name); (group.depends_on || []).forEach(include);
        };
        names.forEach(include);
        const specs: any[] = Object.keys(this.catalog.assets).filter(key => groups.has(this.catalog.assets[key].bundle)).map(key => ({key, bytes: this.reservedBytes(this.catalog.assets[key]), spec: this.catalog.assets[key]}));
        for (const name of groups) {
            const mask = this.catalog.groups[name].cocosAlpha;
            if (mask) specs.push({key: `alpha:${name}`, bytes: mask.decodedBytes, spec: {kind: 'json', bundle: name, path: 'alpha-masks'}});
        }
        const leased = await this.acquireSpecs(specs,scope);
        console.info('[LittleSteps] page resources admitted '+JSON.stringify({groups:Array.from(groups),...this.gate.snapshot()}));
        return leased;
    }
    acquireResources(keys:string[],scope:Scope) {
        return this.acquireSpecs(keys.map(key=>{const spec=this.catalog.assets[key];if(!spec)throw new Error(`缺少资源：${key}`);return {key,bytes:this.reservedBytes(spec),spec};}),scope);
    }
    acquireEffects(names:string[],scope:Scope) {
        // Conservative shader/pipeline reservation; these join the same page gate.
        return this.acquireSpecs(names.map(name=>({key:'effect:'+name,bytes:512*1024,spec:{kind:'effect',path:'effects/'+name}})),scope);
    }
    async acquireTransient<T>(key:string,bytes:number,create:()=>T,dispose:(value:T)=>void,scope:Scope):Promise<T> {
        const lease=await this.gate.acquire([{key:'transient:'+key,bytes}],create,dispose,scope);
        return lease.get('transient:'+key);
    }
    private acquireSpecs(specs:any[],scope:Scope) {
        return this.gate.acquire(specs, async ({key, spec}) => {
            const bundle = spec.kind==='effect'?resources:await this.bundle(spec.bundle);
            const type = spec.kind === 'texture' ? Texture2D : spec.kind === 'image' ? ImageAsset : spec.kind === 'font' ? Font : spec.kind === 'audio' ? AudioClip : spec.kind==='effect'?EffectAsset:JsonAsset;
            const asset = spec.streaming ? await this.streamingAudio(key,spec,bundle) : await new Promise<Asset>((resolve, reject) => bundle.load(spec.path, type as any, (e, a: Asset) => e ? reject(e) : resolve(a)));
            asset.addRef(); this.values.set(key, asset); return asset;
        }, (asset: Asset) => { for (const [key, value] of this.values) if (value === asset) this.values.delete(key); asset.decRef(); }, scope);
    }
    private reservedBytes(spec:ArtSpec){
        const stream=spec.streaming;if(!stream)return spec.decodedBytes;
        if(spec.kind!=='audio'||stream.extension!=='.mp3'||!Number.isSafeInteger(stream.encodedBytes)||stream.encodedBytes<=0||stream.reservedBytes!==stream.encodedBytes*2+2*1024*1024)throw new Error('Invalid original streamed-audio reservation');
        return stream.reservedBytes;
    }
    private async streamingAudio(key:string,spec:ArtSpec,bundle:AssetManager.Bundle){
        const info=bundle.getInfoWithPath(spec.path,AudioClip);if(!info)throw new Error(`缺少流式音乐目录：${key}`);
        const url=assetManager.utils.getUrlWithUuid(info.uuid,{isNative:true,nativeExt:spec.streaming.extension});
        const audio=await new Promise<AudioClip>((resolve,reject)=>assetManager.loadRemote<AudioClip>(url,{ext:spec.streaming.extension,audioLoadMode:AudioClip.AudioType.DOM_AUDIO},(error,clip)=>error?reject(error):resolve(clip)));
        if(audio.loadMode!==AudioClip.AudioType.DOM_AUDIO&&audio.loadMode!==AudioClip.AudioType.MINIGAME_AUDIO){assetManager.releaseAsset(audio);throw new Error(`音乐未按原版流式加载：${key}`);}
        console.info('[LittleSteps] audio transport '+JSON.stringify({resource:key,type:audio.loadMode,duration:audio.getDuration(),reservedBytes:spec.streaming.reservedBytes,fullPCMBytes:spec.decodedBytes,payloadSHA256:spec.streaming.payloadSHA256}));
        return audio;
    }
    effect(name:string) {const value=this.values.get('effect:'+name) as EffectAsset;if(!value)throw new Error(`材质尚未准入：${name}`);return value;}
    texture(resource:string) {const value=this.values.get(resource) as Texture2D;if(!value)throw new Error(`原图尚未准入：${resource}`);return value;}
    image(resource:string) {const value=this.values.get(resource) as ImageAsset;if(!value)throw new Error(`原 mipmap 尚未准入：${resource}`);return value;}
    art(resource: string): ArtSpec {
        const spec = this.catalog.assets[resource];
        if (!spec || spec.kind !== 'texture') throw new Error(`缺少原图：${resource}`);
        return spec;
    }
    frame(resource: string, scope: Scope) {
        const texture = this.values.get(resource) as Texture2D;
        if (!texture) throw new Error(`原图尚未准入：${resource}`);
        const frame = new SpriteFrame(); frame.texture = texture; frame.packable = false;
        scope.own(() => frame.destroy());
        return frame;
    }
    font(resource: string) {
        const value = this.values.get(resource) as Font;
        if (!value) throw new Error(`字体尚未准入：${resource}`);
        return value;
    }
    audio(resource:string) {const value=this.values.get(resource) as AudioClip;if(!value)throw new Error(`音频尚未准入：${resource}`);return value;}
    json(resource: string) { const value = this.values.get(resource) as JsonAsset; if (!value) throw new Error(`数据尚未准入：${resource}`); return value.json; }
    scene(resource: string) { const value = this.scenes.find(s => s.resource === resource); if (!value) throw new Error(`缺少源场景：${resource}`); return value; }
    alpha(resource: string, x: number, y: number) {
        const spec = this.art(resource), masks = this.values.get(`alpha:${spec.bundle}`) as JsonAsset;
        if (!masks) throw new Error(`Alpha 尚未准入：${resource}`);
        const mask = masks.json[resource];
        const px = Math.floor(x - mask.origin[0]), py = Math.floor(y - mask.origin[1]);
        if (px < 0 || py < 0 || px >= mask.size[0] || py >= mask.size[1]) return 0;
        const row = mask.rows[py]; let end = 0;
        for (let i = 0; i < row.length; i += 2) { end += row[i]; if (px < end) return row[i + 1] / 255; }
        throw new Error('Alpha 行数据损坏');
    }
    snapshot() { return this.gate.snapshot(); }
    alphaBounds(resource:string,rect:number[]){
        const spec=this.art(resource),masks=this.values.get(`alpha:${spec.bundle}`) as JsonAsset;if(!masks)throw new Error(`Alpha 尚未准入：${resource}`);const mask=masks.json[resource];let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
        for(let y=Math.max(Math.floor(rect[1]),mask.origin[1]);y<Math.min(Math.ceil(rect[1]+rect[3]),mask.origin[1]+mask.size[1]);y++){const row=mask.rows[y-mask.origin[1]];let x=mask.origin[0];for(let i=0;i<row.length;i+=2){const end=x+row[i],a=Math.max(x,rect[0]),b=Math.min(end,rect[0]+rect[2]);if(row[i+1]>0&&b>a){left=Math.min(left,a);right=Math.max(right,b);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}x=end;}}
        return Number.isFinite(left)?[left,top,right-left,bottom-top]:[rect[0],rect[1],0,0];
    }
    bitmapContains(resource:string,x:number,y:number) {return core.bitMapContains(this.json(resource),x,y);}
    contains(resource:string,x:number,y:number) {
        const name=hitMasks[resource];
        return name?this.bitmapContains('res://home/interaction/alpha_masks/'+name+'.res',x,y):this.alpha(resource,x,y)>=.16;
    }
}
