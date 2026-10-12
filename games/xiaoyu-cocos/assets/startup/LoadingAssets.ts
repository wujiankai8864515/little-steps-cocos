import { Asset, AssetManager, assetManager, Font, ImageAsset, JsonAsset, SpriteFrame, Texture2D } from 'cc';

// Only this manifest, four approved sprites and a dedicated small font.
export class LoadingAssets {
    manifest:any;
    font:Font;
    textures:Texture2D[]=[];
    private owned:Asset[]=[];
    private created:Asset[]=[];
    private disposed=false;
    async load() {
        const bundle=await new Promise<AssetManager.Bundle>((resolve,reject)=>assetManager.loadBundle('loading',(e,b)=>e?reject(e):resolve(b)));
        const load=async<T extends Asset>(path:string,type:any)=>{
            const asset=await new Promise<T>((resolve,reject)=>bundle.load(path,type,(e,a:any)=>e?reject(e):resolve(a)));
            if(this.disposed){assetManager.releaseAsset(asset);throw new Error('Loading disposed');}
            asset.addRef();this.owned.push(asset);return asset;
        };
        this.manifest=(await load<JsonAsset>('startup-manifest',JsonAsset)).json;
        if(this.manifest.images.length!==4||!Number.isFinite(this.manifest.reservedBytes)||this.manifest.reservedBytes<=0||this.manifest.reservedBytes>8*1024*1024)throw new Error('Loading resource budget exceeded');
        this.font=await load<Font>('entry/assets/loading_ui',Font);
        this.textures=await Promise.all(this.manifest.images.map((s:any)=>load<Texture2D>(s.path,Texture2D)));
        return this;
    }
    frame(texture:Texture2D) {const frame=new SpriteFrame();frame.texture=texture;frame.addRef();this.created.push(frame);return frame;}
    paper() {
        const r=this.manifest.paper,[w,h]=r.size,[cols,rows]=r.grid,data=new Uint8Array(w*h*4);
        if(w*h>128*288||r.colors.length!==cols*rows*3)throw new Error('Invalid loading paper');
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
            const gx=x/(w-1)*(cols-1),gy=y/(h-1)*(rows-1),ix=Math.min(cols-2,Math.floor(gx)),iy=Math.min(rows-2,Math.floor(gy)),u=gx-ix,v=gy-iy;
            const noise=(((Math.imul(x+17,73856093)^Math.imul(y+31,19349663))>>>0)%1024/1023-.5)*r.grain;
            for(let c=0;c<3;c++){const a=(iy*cols+ix)*3+c,b=a+cols*3;data[(y*w+x)*4+c]=Math.round((r.colors[a]*(1-u)+r.colors[a+3]*u)*(1-v)+(r.colors[b]*(1-u)+r.colors[b+3]*u)*v+noise);}
            data[(y*w+x)*4+3]=255;
        }
        const image=new ImageAsset({_data:data,width:w,height:h,format:Texture2D.PixelFormat.RGBA8888,_compressed:false});image.addRef();this.created.push(image);
        const texture=new Texture2D();texture.image=image;texture.setFilters(Texture2D.Filter.LINEAR,Texture2D.Filter.LINEAR);texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE,Texture2D.WrapMode.CLAMP_TO_EDGE);texture.addRef();this.created.push(texture);return texture;
    }
    dispose() {this.disposed=true;for(const asset of this.created.reverse()){asset.decRef(false);asset.destroy();}for(const asset of this.owned.reverse())asset.decRef();this.created=[];this.owned=[];this.textures=[];this.font=null;this.manifest=null;}
}
