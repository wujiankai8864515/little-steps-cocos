import { Color, Graphics, Material, Node, Sprite, SpriteFrame, Vec4 } from 'cc';
import { ArtSpec, GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { HomeClock } from './HomeClock';
import { homeLighting } from './LightingSnapshot';
import { contactProfile, physicalLift, projectShadow, projectSoftShadow, projectedContacts, ShadowGeometry, shadowGeometry, softShadowGeometry, SUPPORT_SPANS } from './GroundingGeometry';
import { nodeAt } from './Visual';

type Pass={root:Node;sprite:any;mesh:ShadowGeometry;material:Material};
type Caster={source:Node;spec:ArtSpec;properties:any;sun:Pass;lamp?:Pass;contact?:Graphics;grounded:boolean;centered:boolean};
type RigidBinding={frame:()=>Node;ground:()=>number;lift:()=>number;carried:()=>boolean;depth?:()=>number};
export class HomeShadows {
    private casters:Caster[]=[];
    readonly layers:Array<{z:number;order:number;node:Node}>=[];
    private soft=new Map<Node,{grid:any;sun:ShadowGeometry;lamp:ShadowGeometry;active:()=>boolean;lift:()=>number;ground:()=>number;frame:()=>Node;using:boolean;physical:number}>();
    private rigid=new Map<Node,RigidBinding>();
    private opacities=new Map<Node,()=>number>();
    constructor(private root:Node,private assets:GameAssets,private scope:Scope,private clock:HomeClock) {}
    add(source:Node,resource:string,properties:any,centered=false,custom?:{spec:ArtSpec;frame:()=>SpriteFrame}) {
        const spec=custom?custom.spec:this.assets.art(resource),name=source.name,grounded=!!(properties['metadata/spans']||SUPPORT_SPANS[name])&&properties['metadata/floor'];
        const contacts=grounded?contactProfile(name,spec.size,(x,y)=>this.assets.alpha(resource,x,y),properties['metadata/spans']||SUPPORT_SPANS[name]).contacts:[];
        const group=nodeAt(this.root,name+'Projection'),make=(kind:string):Pass=>{
            const node=nodeAt(group,kind),mesh=shadowGeometry(spec.size,contacts),sprite=node.addComponent(meshSprite());
            sprite.configure(mesh,spec.size,spec.content);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=custom?custom.frame():this.assets.frame(resource,this.scope);
            const material=new Material();material.initialize({effectAsset:this.assets.effect(properties['metadata/table']?'home-table-shadow':'home-shadow'),defines:{USE_TEXTURE:true}});
            const c=spec.content,s=spec.size;material.setProperty('sourceUV',new Vec4(c[0]/s[0],c[1]/s[1],c[2]/s[0],c[3]/s[1]));material.setProperty('textureSize',new Vec4(s[0],s[1],0,0));
            sprite.customMaterial=material;this.scope.own(()=>material.destroy());return {root:node,sprite,mesh,material};
        };
        const caster:Caster={source,spec,properties,grounded,centered,sun:make('Natural'),lamp:properties['metadata/floor']?make('Lamp'):undefined};
        if(grounded)caster.contact=nodeAt(group,'MeasuredContact').addComponent(Graphics);
        this.casters.push(caster);this.layers.push({z:properties['metadata/shadow_z'],order:2000+this.casters.length,node:group});
    }
    bindSoft(source:Node,grid:any,active:()=>boolean,lift:()=>number,ground:()=>number,frame=()=>this.root){const caster=this.casters.find(c=>c.source===source);if(!caster)throw new Error('软投影源未注册');this.soft.set(source,{grid,sun:softShadowGeometry(grid,caster.sun.mesh.contacts),lamp:softShadowGeometry(grid,caster.sun.mesh.contacts),active,lift,ground,frame,using:false,physical:0});}
    bindRigid(source:Node,binding:RigidBinding){if(!this.casters.some(c=>c.source===source))throw new Error('道具投影源未注册');this.rigid.set(source,binding);}
    bindOpacity(source:Node,value:()=>number){if(!this.casters.some(c=>c.source===source))throw new Error('投影透明度源未注册');this.opacities.set(source,value);}
    bindTableFrame(table:Node,frame:()=>Node){for(const c of this.casters)if(c.properties['metadata/table']===table)this.rigid.set(c.source,{frame,ground:()=>typeof c.properties['metadata/ground']==='function'?c.properties['metadata/ground']():c.properties['metadata/ground'],lift:()=>0,carried:()=>false});}
    private affine(node:Node) {const m=node.worldMatrix;return [m.m00,-m.m01,-m.m04,m.m05,m.m12,-m.m13];}
    update() {
        const s=homeLighting(this.clock.hour(),this.clock.lampWeight()),origin=this.root.worldPosition,scale=this.root.worldScale;
        const inverse=core.Math2D.inverse(this.affine(this.root)),naturalEnergy=s.sunEnergy>0?s.sunEnergy:s.moonEnergy*.34;
        const cast=s.sunEnergy>0?s.cast:s.moonCast,cot=s.sunEnergy>0?s.cot:1.6,penumbra=s.sunEnergy>0?1.35+(.7-1.35)*s.noon:1.25;
        for(const caster of this.casters) {
            const alpha=this.opacities.has(caster.source)?Math.max(0,Math.min(1,this.opacities.get(caster.source)())):1;
            const p=caster.properties,floor=!!p['metadata/floor'],factor=p['metadata/height_factor'],soft=this.soft.get(caster.source),rigid=this.rigid.get(caster.source),ground=soft?soft.ground():rigid?rigid.ground():typeof p['metadata/ground']==='function'?p['metadata/ground']():p['metadata/ground'],lift=soft?soft.lift():rigid?rigid.lift():0,carried=rigid&&rigid.carried(),active=soft&&soft.active();
            if(soft&&!!active!==soft.using){soft.using=!!active;[caster.sun,caster.lamp].forEach((pass,i)=>{if(pass)pass.sprite.configure(active?(i===0?soft.sun:soft.lamp):pass.mesh,caster.spec.size,caster.spec.content);});}
            let matrix=core.Math2D.multiply(soft?core.Math2D.inverse(this.affine(soft.frame())):rigid?core.Math2D.inverse(this.affine(rigid.frame())):inverse,this.affine(caster.source));
            if(rigid&&rigid.depth){const layer=this.layers.find(l=>l.node===caster.sun.root.parent);layer.z=rigid.depth();}
            if(caster.centered)matrix=core.Math2D.multiply(matrix,[1,0,0,1,-caster.spec.size[0]/2,-caster.spec.size[1]/2]);
            const midX=matrix[0]*caster.spec.size[0]/2+matrix[4]+(caster.grounded||active?matrix[2]*caster.spec.size[1]/2:0);
            const directions=[[cast[0]*cot*factor,cast[1]*.72*cot*factor],[(midX-465)/420*factor,(ground-888)*.8/420*factor]];
            [caster.sun,caster.lamp].forEach((pass,index)=>{
                if(!pass)return;
                const energy=index===0?naturalEnergy*(floor?.72:.43):s.lampEnergy*.5;
                pass.root.active=caster.source.activeInHierarchy&&!carried&&energy>0&&alpha>0;
                if(active)projectSoftShadow(index===0?soft.sun:soft.lamp,soft.grid,matrix,directions[index],ground,caster.grounded,lift);
                else projectShadow(pass.mesh,matrix,directions[index],ground,caster.grounded,floor,lift,[cast[0]*cot*p['metadata/thickness'],cast[1]*cot*p['metadata/thickness']]);
                pass.sprite.geometryChanged();const material=pass.material;
                material.setProperty('roomOrigin',new Vec4(origin.x,origin.y,scale.x,scale.y));material.setProperty('castState',new Vec4(cast[0],cast[1],0,0));
                material.setProperty('shadowState',new Vec4(cot,energy,penumbra,factor));material.setProperty('shadowFlags',new Vec4(floor&&!p['metadata/table']?1:0,index===0?1:0,index===1?1:0,alpha));
                if(p['metadata/table']){const m=core.Math2D.multiply(core.Math2D.inverse(this.affine(p['metadata/table'])),this.affine(rigid?rigid.frame():this.root));material.setProperty('tableOrigin',new Vec4(m[4],m[5],0,0));material.setProperty('tableAxes',new Vec4(m[0],m[1],m[2],m[3]));}
            });
            if(caster.contact) {
                const g=caster.contact;g.node.active=caster.source.activeInHierarchy&&!carried&&alpha>0;g.clear();
                const physical=active?physicalLift(soft.sun,soft.grid,matrix,lift,core.renderedPointAt):lift,opacity=.19*alpha*(1-core.Math2D.smoothstep(0,18,physical));if(soft)soft.physical=physical;
                for(const line of projectedContacts(caster.sun.mesh,matrix,lift))for(const style of [[5,opacity*.35],[2,opacity]]){
                    g.lineWidth=style[0];g.strokeColor=new Color(.1*255,.075*255,.055*255,style[1]*255);
                    g.moveTo(line[0][0],-line[0][1]);line.slice(1).forEach(point=>g.lineTo(point[0],-point[1]));g.stroke();
                }
            }
        }
    }
    snapshot() {return {casters:this.casters.length,grounded:this.casters.filter(c=>c.grounded).map(c=>({name:c.source.name,profilePoints:c.sun.mesh.profile.length,contacts:c.sun.mesh.contacts.map(line=>line.length)})),soft:Array.from(this.soft.entries()).map(([node,state])=>({name:node.name,active:state.using,physicalLift:state.physical,vertices:state.grid.source.length/2})),rigid:Array.from(this.rigid.entries()).map(([node,state])=>({name:node.name,frame:state.frame().name,ground:state.ground(),lift:state.lift(),carried:state.carried(),visiblePasses:this.casters.filter(c=>c.source===node).reduce((count,c)=>count+[c.sun,c.lamp].filter(p=>p&&p.root.activeInHierarchy).length,0)})),limits:'Complete prop raster, all lighting states and WeChat device acceptance pending'};}
}
