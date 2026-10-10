import { Color, Graphics, Material, Node, Sprite, Vec4 } from 'cc';
import { ArtSpec, GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { HomeClock } from './HomeClock';
import { homeLighting } from './LightingSnapshot';
import { contactProfile, projectShadow, projectedContacts, ShadowGeometry, shadowGeometry, SUPPORT_SPANS } from './GroundingGeometry';
import { nodeAt } from './Visual';

type Pass={root:Node;sprite:any;mesh:ShadowGeometry;material:Material};
type Caster={source:Node;spec:ArtSpec;properties:any;sun:Pass;lamp?:Pass;contact?:Graphics;grounded:boolean;centered:boolean};
export class HomeShadows {
    private casters:Caster[]=[];
    readonly layers:Array<{z:number;order:number;node:Node}>=[];
    constructor(private root:Node,private assets:GameAssets,private scope:Scope,private clock:HomeClock) {}
    add(source:Node,resource:string,properties:any,centered=false) {
        const spec=this.assets.art(resource),name=source.name,grounded=!!SUPPORT_SPANS[name]&&properties['metadata/floor'];
        const contacts=grounded?contactProfile(name,spec.size,(x,y)=>this.assets.alpha(resource,x,y)).contacts:[];
        const group=nodeAt(this.root,name+'Projection'),make=(kind:string):Pass=>{
            const node=nodeAt(group,kind),mesh=shadowGeometry(spec.size,contacts),sprite=node.addComponent(meshSprite());
            sprite.configure(mesh,spec.size,spec.content);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=this.assets.frame(resource,this.scope);
            const material=new Material();material.initialize({effectAsset:this.assets.effect('home-shadow'),defines:{USE_TEXTURE:true}});
            const c=spec.content,s=spec.size;material.setProperty('sourceUV',new Vec4(c[0]/s[0],c[1]/s[1],c[2]/s[0],c[3]/s[1]));material.setProperty('textureSize',new Vec4(s[0],s[1],0,0));
            sprite.customMaterial=material;this.scope.own(()=>material.destroy());return {root:node,sprite,mesh,material};
        };
        const caster:Caster={source,spec,properties,grounded,centered,sun:make('Natural'),lamp:properties['metadata/floor']?make('Lamp'):undefined};
        if(grounded)caster.contact=nodeAt(group,'MeasuredContact').addComponent(Graphics);
        this.casters.push(caster);this.layers.push({z:properties['metadata/shadow_z'],order:2000+this.casters.length,node:group});
    }
    private affine(node:Node) {const m=node.worldMatrix;return [m.m00,-m.m01,-m.m04,m.m05,m.m12,-m.m13];}
    update() {
        const s=homeLighting(this.clock.hour(),this.clock.lampWeight()),origin=this.root.worldPosition,scale=this.root.worldScale;
        const inverse=core.Math2D.inverse(this.affine(this.root)),naturalEnergy=s.sunEnergy>0?s.sunEnergy:s.moonEnergy*.34;
        const cast=s.sunEnergy>0?s.cast:s.moonCast,cot=s.sunEnergy>0?s.cot:1.6,penumbra=s.sunEnergy>0?1.35+(.7-1.35)*s.noon:1.25;
        for(const caster of this.casters) {
            const p=caster.properties,floor=!!p['metadata/floor'],factor=p['metadata/height_factor'],ground=p['metadata/ground'];
            let matrix=core.Math2D.multiply(inverse,this.affine(caster.source));
            if(caster.centered)matrix=core.Math2D.multiply(matrix,[1,0,0,1,-caster.spec.size[0]/2,-caster.spec.size[1]/2]);
            const midX=matrix[0]*caster.spec.size[0]/2+matrix[4]+(caster.grounded?matrix[2]*caster.spec.size[1]/2:0);
            const directions=[[cast[0]*cot*factor,cast[1]*.72*cot*factor],[(midX-465)/420*factor,(ground-888)*.8/420*factor]];
            [caster.sun,caster.lamp].forEach((pass,index)=>{
                if(!pass)return;
                const energy=index===0?naturalEnergy*(floor?.72:.43):s.lampEnergy*.5;
                pass.root.active=caster.source.activeInHierarchy&&energy>0;
                projectShadow(pass.mesh,matrix,directions[index],ground,caster.grounded,floor,0,[cast[0]*cot*p['metadata/thickness'],cast[1]*cot*p['metadata/thickness']]);
                pass.sprite.geometryChanged();const material=pass.material;
                material.setProperty('roomOrigin',new Vec4(origin.x,origin.y,scale.x,scale.y));material.setProperty('castState',new Vec4(cast[0],cast[1],0,0));
                material.setProperty('shadowState',new Vec4(cot,energy,penumbra,factor));material.setProperty('shadowFlags',new Vec4(floor?1:0,index===0?1:0,index===1?1:0,1));
            });
            if(caster.contact) {
                const g=caster.contact;g.node.active=caster.source.activeInHierarchy;g.clear();
                for(const line of projectedContacts(caster.sun.mesh,matrix))for(const style of [[5,.19*.35],[2,.19]]){
                    g.lineWidth=style[0];g.strokeColor=new Color(.1*255,.075*255,.055*255,style[1]*255);
                    g.moveTo(line[0][0],-line[0][1]);line.slice(1).forEach(point=>g.lineTo(point[0],-point[1]));g.stroke();
                }
            }
        }
    }
    snapshot() {return {casters:this.casters.length,grounded:this.casters.filter(c=>c.grounded).map(c=>({name:c.source.name,profilePoints:c.sun.mesh.profile.length,contacts:c.sun.mesh.contacts.map(line=>line.length)})),limits:'soft-mesh lift/landing and articulated backpack/plant shadows pending'};}
}
