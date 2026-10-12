import { Asset, AssetManager, assetManager, AudioClip, EffectAsset, Font, ImageAsset, JsonAsset, resources, SpriteFrame, Texture2D } from 'cc';
import { core, Scope } from './Engine';
import { paperPixels, PaperRecipe } from './PaperPixels';

// Same logical texture -> authored BitMap mapping as alpha_hit_cache.gd.
const hitMasks:Record<string,string>={
    'res://assets/body.png':'body', 'res://assets/fin_mallet.png':'fin_mallet', 'res://assets/tail.png':'tail',
    'res://assets/travelbag_closed.png':'bag', 'res://assets/doll_idle.png':'doll',
    'res://assets/round2/water_bowl_clean.png':'bowl', 'res://assets/altar_neutral.png':'altar',
};

export interface ArtSpec {
    kind: 'texture' | 'procedural' | 'image' | 'font' | 'json' | 'audio' | 'mask' | 'effect'; bundle: string; path: string;
    procedural?:PaperRecipe; layers?:string[];
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
    private alphaValues = new Map<string, Map<string, any>>();
    private textureImages = new Map<Texture2D, ImageAsset>();

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
            request = (async()=>{
                for(const dependency of this.catalog.groups[name]?.depends_on||[])await this.bundle(dependency);
                return new Promise<AssetManager.Bundle>((resolve,reject)=>assetManager.loadBundle(name,(e,b)=>e?reject(e):resolve(b)));
            })();
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
        // Bundle priority controls build ownership, not runtime load order.
        // Resolve the catalogue dependency graph before admitting page assets.
        for(const name of groups)await scope.guard(this.bundle(name));
        const specs: any[] = Object.keys(this.catalog.assets).filter(key => groups.has(this.catalog.assets[key].bundle)).map(key => ({key, bytes: this.reservedBytes(this.catalog.assets[key]), spec: this.catalog.assets[key]}));
        for (const name of groups) {
            const mask = this.catalog.groups[name].cocosAlpha;
            if (mask) specs.push({key: `alpha:${name}`, bytes: mask.decodedBytes, spec: {kind: 'alpha', bundle: name, path: mask.path, pixelBytes: mask.pixelBytes}});
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
    async acquireResizableTarget(key:string,width:number,height:number,renderer:any,scope:Scope) {
        const id='transient:'+key;
        const lease=await this.gate.acquire([{key:id,bytes:renderer.estimateTarget(width,height)}],()=>renderer.createTarget(width,height,key),(v:any)=>v.destroy(),scope);
        return {get texture(){return lease.get(id);},resize:(w:number,h:number)=>{
            const current=lease.get(id);if(current&&current.width===w&&current.height===h)return;
            const previous=current?[current.width,current.height]:null;
            // A new TextureBase identity also invalidates Creator's 2D sampler
            // descriptor cache. Reinitializing the same RenderTexture does not.
            lease.replace(id,renderer.estimateTarget(w,h),()=>renderer.createTarget(w,h,key),()=>previous?renderer.createTarget(previous[0],previous[1],key):null);
        },park:()=>{
            const current=lease.get(id);if(!current)return;
            const previous=[current.width,current.height];
            // Keep the exclusive lease, but release every pixel. Callers detach
            // camera/frame references first; the gameplay world stays alive.
            lease.replace(id,0,()=>null,()=>renderer.createTarget(previous[0],previous[1],key));
        }};
    }

    private acquireSpecs(specs:any[],scope:Scope) {
        return this.gate.acquire(specs, async ({key, spec}) => {
            if(spec.kind==='procedural'){
                const [width,height]=spec.procedural.size,image=new ImageAsset({_data:paperPixels(spec.procedural),width,height,format:Texture2D.PixelFormat.RGBA8888,_compressed:false});
                image.addRef();const texture=new Texture2D();
                try {texture.image=image;texture.setFilters(Texture2D.Filter.LINEAR,Texture2D.Filter.LINEAR);texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE,Texture2D.WrapMode.CLAMP_TO_EDGE);texture.addRef();this.textureImages.set(texture,image);this.values.set(key,texture);return texture;}
                catch(error){texture.destroy();image.decRef();throw error;}
            }
            const bundle = spec.kind==='effect'?resources:await this.bundle(spec.bundle);
            const type = spec.kind === 'texture' ? Texture2D : spec.kind === 'image' ? ImageAsset : spec.kind === 'font' ? Font : spec.kind === 'audio' ? AudioClip : spec.kind==='effect'?EffectAsset:JsonAsset;
            const asset = spec.streaming ? await this.streamingAudio(key,spec,bundle)
                : spec.kind==='texture'&&spec.mipResources?.length ? await this.authoredMipmapTexture(key,spec,bundle)
                : await new Promise<Asset>((resolve, reject) => bundle.load(spec.path, type as any, (e, a: Asset) => e ? reject(e) : resolve(a)));
            asset.addRef();
            try {
                if(spec.kind==='alpha') {
                    if(!Number.isSafeInteger(spec.pixelBytes)||spec.pixelBytes<=0)throw new Error('缺少 Alpha 准入上限');
                    this.alphaValues.set(key,core.decodeAlphaMasks((asset as JsonAsset).json,spec.pixelBytes));
                }
                this.values.set(key, asset); return asset;
            } catch(error) {this.release(asset);throw error;}
        }, (asset: Asset) => this.release(asset), scope);
    }
    private async authoredMipmapTexture(key:string,spec:ArtSpec,bundle:AssetManager.Bundle) {
        if(!spec.path.endsWith('/texture'))throw new Error(`原 mipmap 纹理路径无效：${key}`);
        // Creator's mini-game image cleanup destroys the imported Texture2D's
        // level-zero ImageAsset immediately after upload. Load the raw image
        // first and own it explicitly for later authored mipmap assembly.
        const image=await new Promise<ImageAsset>((resolve,reject)=>bundle.load(spec.path.slice(0,-8),ImageAsset,(error,value)=>error?reject(error):resolve(value)));
        image.addRef();let texture:Texture2D=null;
        try {
            if(!image.data)throw new Error(`原 mipmap 基础图像已释放：${key}`);
            texture=new Texture2D();texture.image=image;
            texture.setFilters(Texture2D.Filter.LINEAR,Texture2D.Filter.LINEAR);
            texture.setMipFilter(Texture2D.Filter.LINEAR);
            texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE,Texture2D.WrapMode.CLAMP_TO_EDGE);
            this.textureImages.set(texture,image);return texture;
        } catch(error) {texture?.destroy();image.decRef();throw error;}
    }
    private release(asset:Asset) {
        for(const [key,value] of this.values)if(value===asset){this.values.delete(key);this.alphaValues.delete(key);}
        const image=this.textureImages.get(asset as Texture2D);
        if(image){this.textureImages.delete(asset as Texture2D);asset.decRef(false);asset.destroy();image.decRef();}
        else asset.decRef();
    }
    private reservedBytes(spec:ArtSpec){
        // This one raw image remains available for mipmaps alongside its GPU
        // level zero. Other textures keep Creator's normal image cleanup.
        if(spec.kind==='texture'&&spec.mipResources?.length)return spec.decodedBytes*2;
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
        if (!spec || (spec.kind !== 'texture'&&spec.kind !== 'procedural')) throw new Error(`缺少原图：${resource}`);
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
        return core.alphaSample(this.alphaMask(resource),x,y);
    }
    snapshot() { return this.gate.snapshot(); }
    alphaBounds(resource:string,rect:number[]){
        return core.alphaBounds(this.alphaMask(resource),rect);
    }
    private alphaMask(resource:string) {
        const mask=this.alphaValues.get(`alpha:${this.art(resource).bundle}`)?.get(resource);
        if(!mask)throw new Error(`Alpha 尚未准入：${resource}`);
        return mask;
    }
    bitmapContains(resource:string,x:number,y:number) {return core.bitMapContains(this.json(resource),x,y);}
    contains(resource:string,x:number,y:number) {
        const name=hitMasks[resource];
        return name?this.bitmapContains('res://home/interaction/alpha_masks/'+name+'.res',x,y):this.alpha(resource,x,y)>=.16;
    }
}
