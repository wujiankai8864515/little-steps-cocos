import { assetManager, AssetManager, AudioClip, JsonAsset, Rect, resources, Size, SpriteFrame, Texture2D, Vec2 } from 'cc';

export class ArtStore {
    art: any; layouts: Record<string, any> = {}; weapons: any[] = []; rankData: any;
    private bundles = new Map<string, Promise<AssetManager.Bundle>>();
    private textures = new Map<string, Texture2D>();
    private pending = new Map<string, Promise<any>>();
    private frames = new Map<string, SpriteFrame>();
    private sound = new Map<string, AudioClip>();
    private json = new Map<string, any>();
    private core=(globalThis as any).LittleStepsCore;
    private gate=new this.core.ResourceGate();private scope=new this.core.Lifetime();
    private decoding=0;private decodeQueue:(()=>void)[]=[];
    private async decode<T>(run:()=>Promise<T>){if(this.decoding>=4)await new Promise<void>(resolve=>this.decodeQueue.push(resolve));else this.decoding++;try{if(!this.scope.active)throw new this.core.CancelledError();return await run();}finally{const next=this.decodeQueue.shift();if(next)next();else this.decoding--;}}
    private async acquire<T>(key:string,bytes:number,load:()=>Promise<T>):Promise<T>{const lease=await this.gate.acquire([{key,bytes}],async()=>{const value:any=await load();value.addRef?.();return value;},(value:any)=>value.decRef?.(),this.scope);return lease.get(key);}
    async initialize() {
        const load = async(name: string):Promise<any> => (await this.acquire<JsonAsset>('data/'+name,1024*1024,()=>new Promise<JsonAsset>((resolve,reject)=>resources.load('data/'+name,JsonAsset,(e,a)=>e?reject(e):resolve(a))))).json;
        [this.art, this.layouts, this.weapons, this.rankData] = await Promise.all([load('art'),load('layouts'),load('weapon'),load('rankData')]);
    }
    bundle(name: string) {
        if (!this.bundles.has(name)) this.bundles.set(name, new Promise((resolve,reject) => assetManager.loadBundle(name,(e,b) => {
            if (e) { this.bundles.delete(name); reject(e); } else resolve(b);
        })));
        return this.bundles.get(name)!;
    }
    async group(name: string) {
        const bundle = 'zya_' + name;
        const unique = new Set<string>();
        for (const spec of Object.values(this.art.frames) as any[]) if (spec.bundle === bundle && spec.rect) unique.add(spec.file);
        // Limit parallel image decoding; no more than four outstanding textures.
        const files = Array.from(unique);
        for (let i = 0; i < files.length; i += 4) await Promise.all(files.slice(i,i+4).map(file => this.texture(bundle,file)));
    }
    async layout(name:string){const paths=new Set<string>();const visit=(node:any)=>{if(node.skin&&this.art.frames[node.skin]?.rect)paths.add(node.skin);for(const child of node.children||[])visit(child);};visit(this.layouts[name]);
        const specs=Array.from(paths).map(path=>this.art.frames[path]),files=new Map<string,any>();for(const spec of specs)files.set(spec.bundle+'/'+spec.file,spec);
        const unique=Array.from(files.values());for(let i=0;i<unique.length;i+=4)await Promise.all(unique.slice(i,i+4).map(spec=>this.texture(spec.bundle,spec.file)));
    }
    async texture(bundleName: string, file: string): Promise<Texture2D> {
        const key = bundleName + '/' + file;
        if (this.textures.has(key)) return this.textures.get(key)!;
        if (!this.pending.has(key)){const spec=(Object.values(this.art.frames) as any[]).find(spec=>spec.bundle===bundleName&&spec.file===file&&spec.rect);
            this.pending.set(key,this.acquire<Texture2D>(key,spec.width*spec.height*4,()=>this.decode(()=>this.bundle(bundleName).then(bundle=>new Promise<Texture2D>((resolve,reject)=>bundle.load(file+'/texture',Texture2D,(error,asset)=>error?reject(error):resolve(asset)))))).then(asset=>{this.textures.set(key,asset);return asset;}).finally(()=>this.pending.delete(key)));}
        return this.pending.get(key)!;
    }
    frame(path: string, grid?: string): SpriteFrame | null {
        const key = path + (grid || ''); if (this.frames.has(key)) return this.frames.get(key)!;
        const spec = this.art.frames[path]; if (!spec?.rect) return null;
        const texture = this.textures.get(spec.bundle + '/' + spec.file); if (!texture) return null;
        const [x,y,w,h] = spec.rect, [ow,oh] = spec.original, [ox,oy] = spec.offset;
        const frame = new SpriteFrame();
        frame.reset({texture,rect:new Rect(x,y,w,h),originalSize:new Size(ow,oh),offset:new Vec2(ox + w / 2 - ow / 2,oh / 2 - oy - h / 2)});
        if (grid) {
            const margins = grid.split(',').map(Number);
            frame.insetTop = margins[0] || 0; frame.insetRight = margins[1] || 0;
            frame.insetBottom = margins[2] || 0; frame.insetLeft = margins[3] || 0;
        }
        this.frames.set(key,frame); return frame;
    }
    async ensure(path: string, grid?: string) {
        const spec = this.art.frames[path]; if (!spec) throw new Error('Missing art: ' + path);
        await this.texture(spec.bundle,spec.file); return this.frame(path,grid)!;
    }
    digit(path:string,index:number){const key=path+'#'+index;if(this.frames.has(key))return this.frames.get(key)!;const spec=this.art.frames[path],base=this.frame(path);if(!base)return null;
        const width=spec.original[0]/5,start=index*width,left=Math.max(start,spec.offset[0]),right=Math.min(start+width,spec.offset[0]+spec.rect[2]);if(right<=left)return null;
        const frame=new SpriteFrame();frame.reset({texture:base.texture,rect:new Rect(spec.rect[0]+left-spec.offset[0],spec.rect[1],right-left,spec.rect[3]),originalSize:new Size(width,spec.original[1]),offset:new Vec2(left-start+(right-left)/2-width/2,spec.original[1]/2-spec.offset[1]-spec.rect[3]/2)});this.frames.set(key,frame);return frame;
    }
    actorFrame(source: string, regionName: string): SpriteFrame | null {
        const key = source + ':' + regionName; if (this.frames.has(key)) return this.frames.get(key)!;
        const atlas = this.art.actors[source], region = atlas?.regions[regionName]; if (!region) return null;
        const base = this.art.frames[atlas.texture], texture = this.textures.get(base.bundle + '/' + base.file); if (!texture) return null;
        const [x,y] = region.xy.split(',').map(Number), [w,h] = region.size.split(',').map(Number);
        const [ow,oh] = region.orig.split(',').map(Number), [ox,oy] = region.offset.split(',').map(Number);
        const frame = new SpriteFrame();
        frame.reset({texture,rect:new Rect(x,y,w,h),originalSize:new Size(ow,oh),offset:new Vec2(ox + w / 2 - ow / 2,oy + h / 2 - oh / 2),isRotate:region.rotate === 'true'});
        this.frames.set(key,frame); return frame;
    }
    async actor(source: string) {
        const spec = this.art.frames[source], atlas = this.art.actors[source]; if (!spec || !atlas) throw new Error('Actor not found: ' + source);
        const image = this.art.frames[atlas.texture];
        await this.texture(image.bundle,image.file);
        if (!this.json.has(source)) {
            const bundle = await this.bundle(spec.bundle);
            const key='json:'+source;if(!this.pending.has(key))this.pending.set(key,this.acquire<JsonAsset>(key,Math.max(262144,(spec.bytes||262144)*4),()=>new Promise<JsonAsset>((resolve,reject)=>bundle.load(spec.file,JsonAsset,(e,a)=>e?reject(e):resolve(a)))).finally(()=>this.pending.delete(key)));
            const data=await this.pending.get(key)!;this.json.set(source,data.json);
        }
        return this.json.get(source);
    }
    async audio(name: string) {
        if (this.sound.has(name)) return this.sound.get(name)!;
        const path = 'resources/' + (name.startsWith('music/')?name:'sound/'+name) + '.mp3', spec = this.art.frames[path]; if (!spec) return null;
        const bundle = await this.bundle(spec.bundle);
        const key='audio:'+name;if(!this.pending.has(key))this.pending.set(key,this.acquire<AudioClip>(key,Math.max(65536,(spec.bytes||65536)*32),()=>this.decode(()=>new Promise<AudioClip>((resolve,reject)=>bundle.load(spec.file,AudioClip,(e,a)=>e?reject(e):resolve(a))))).finally(()=>this.pending.delete(key)));
        const clip=await this.pending.get(key)!;
        this.sound.set(name,clip); return clip;
    }
    metrics() {
        let textureBytes = 0;
        for (const texture of Array.from(this.textures.values())) textureBytes += texture.width * texture.height * 4;
        return {textureCount:this.textures.size,estimatedTextureBytes:textureBytes,frameCount:this.frames.size,admission:this.gate.snapshot()};
    }
    dispose() { for (const frame of Array.from(this.frames.values())) frame.destroy(); this.frames.clear();this.scope.dispose();this.textures.clear();this.sound.clear();this.json.clear(); }
}
