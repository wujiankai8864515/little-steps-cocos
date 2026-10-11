import { Material, Node, Sprite, Vec4 } from 'cc';
import { GameAssets } from './Assets';
import { core, meshSprite, Scope } from './Engine';
import { nodeAt } from './Visual';

// The original line body and transparent feather remain separate triangles.
// Coverage uses the mesh payload, so Creator's UI alpha cannot erase it.
export class Stroke2D {
    readonly root:Node;private sprite:any;private material:Material;
    constructor(parent:Node,assets:GameAssets,scope:Scope,name:string){
        this.root=nodeAt(parent,name,0,0,720,1280);this.sprite=this.root.addComponent(meshSprite());
        this.material=new Material();this.material.initialize({effectAsset:assets.effect('original-stroke')});scope.own(()=>this.material.destroy());this.sprite.customMaterial=this.material;
        this.sprite.configure(core.featherLine([0,0],[1,0],1),[1,1]);this.sprite.spriteFrame=assets.frame('res://assets/home_neutral.png',scope);this.sprite.sizeMode=Sprite.SizeMode.CUSTOM;this.root.active=false;
    }
    draw(mesh:any,color:number[]){
        this.root.active=mesh.indices.length>0&&(color[3]??1)>0;if(!this.root.active)return;
        const current=this.sprite.mesh;
        if(current.vertices.length===mesh.vertices.length&&current.indices.length===mesh.indices.length){current.vertices.set(mesh.vertices);current.vertexData.set(mesh.vertexData);current.indices.set(mesh.indices);this.sprite.geometryChanged();}
        else this.sprite.configure(mesh,[1,1]);
        this.material.setProperty('strokeColor',new Vec4(color[0],color[1],color[2],color[3]??1));
    }
    line(a:number[],b:number[],width:number,color:number[]){this.draw(core.featherLine(a,b,width),color);}
    clear(){this.root.active=false;}
}
