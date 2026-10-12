import { Node, Sprite } from 'cc';
import { GameAssets } from './Assets';
import { meshSprite, Scope } from './Engine';
import { HomeClock } from './HomeClock';
import { TravelAtlasSprite } from './TravelAtlasSprite';
import { TravelSceneState, routePosition } from './TravelSceneState';
import { TravelSceneLighting } from './TravelSceneLighting';
import { TravelInkMesh, TravelRouteInk, polygonInk, travelLandmarks, travelShadows, footprintHighlight } from './TravelSceneGeometry';
import { nodeAt } from './Visual';
import { PageBackground } from './PageBackground';
import { pageLayout } from './Viewport';

type Piece={pivot:Node;rotation:Node;image:TravelAtlasSprite;at:number[];extent:number[];origin:number[];angle:number};
const FOOTPRINT='res://travel/assets/travel_footprint_ink_v1.png';
// Original map scene subset; page portraits/font/actor and sound join separately.
export const TRAVEL_SCENE_RESOURCES=['travel_map_plate_v5.png','travel_scene_layers_v1.png','travel_footprint_ink_v1.png'].map(n=>'res://travel/assets/'+n);
// Includes 34560 route vertices in 10 bounded batches, source/coverage arrays,
// Cocos CPU vertex records and native buffers. This is admission, not a measured
// process-memory claim. Geometry and native buffer-pool residency need device QA.
export const TRAVEL_SCENE_BUFFER_BYTES=12*1024*1024;
let serial=0;
export class TravelSceneView {
    readonly root:Node;readonly lighting:TravelSceneLighting;readonly route:TravelRouteInk;
    private background:PageBackground;private volume:any;private clouds:Piece[]=[];private branches:Piece[]=[];private leaves:Piece[]=[];private bell:{chain?:Piece;body:Piece;tongue:Piece;cover?:Piece};
    private routeSprites:any[]=[];private shadow:any;private footprints:Array<{image:Piece;halo:any;at:number[];angle:number;highlight:number}>=[];
    private lastShadow='';private renders=0;
    static async create(parent:Node,assets:GameAssets,scope:Scope,clock:HomeClock,state:TravelSceneState){
        scope.own(()=>state.dispose());
        const route=await assets.acquireTransient('TravelSceneBuffers-'+(++serial),TRAVEL_SCENE_BUFFER_BYTES,()=>new TravelRouteInk(state),()=>{},scope);
        if(!scope.active)throw new Error('Travel scene preparation cancelled');
        return new TravelSceneView(parent,assets,scope,clock,state,route);
    }
    private constructor(parent:Node,private assets:GameAssets,private scope:Scope,private clock:HomeClock,readonly state:TravelSceneState,route:TravelRouteInk){
        const c=state.config;this.route=route;this.root=nodeAt(parent,'ConfiguredTravelScene',0,0,c.canvas[0],c.canvas[1]);scope.own(()=>{this.root.active=false;this.root.destroy();});this.lighting=new TravelSceneLighting(this.root,assets,scope,c);
        this.background=new PageBackground(this.root,assets,scope,c.base,'OriginalMapBase',undefined,0,1280,225);this.lighting.bind(this.background.sprite);
        this.clouds=c.clouds.map((v:any,i:number)=>{const p=this.atlas('Cloud'+i,v.region,v.at,v.size);this.lighting.tint(p.image.sprite,v.opacity);return p;});
        this.shadow=this.ink('SceneShadows',travelShadows(state,this.lighting.update(clock.hour())));
        const leaf=(i:number)=>{const depth=state.leaves[i].depth,region=depth>.7?['leaf_foreground_left','leaf_foreground_right','leaf_foreground_middle'][Math.floor(i/3)%3]:c.leaves.regions[i%c.leaves.regions.length];this.leaves[i]=this.atlas('FallingLeaf'+i,region,[0,0],[1,1]);};
        for(let i=0;i<state.leaves.length;i++)if(state.leaves[i].depth<=.7)leaf(i);
        this.routeSprites=route.batches.map((mesh,i)=>this.ink('RoutePigment'+i,mesh));
        for(let i=0;i<c.route.nodes.length;i++){
            const fraction=i/c.route.segments.length,at=routePosition(fraction,c).map((v,j)=>v+(j?12:0)),before=routePosition(Math.max(0,fraction-.015),c),after=routePosition(Math.min(1,fraction+.015),c),angle=Math.atan2(after[1]-before[1],after[0]-before[0])+Math.PI/2;
            const halo=this.ink('FootprintWarmEdge'+i,footprintHighlight(0,angle));halo.node.setPosition(at[0],-at[1]);
            const image=this.piece('OriginalFootprint'+i,FOOTPRINT,[0,0,...assets.art(FOOTPRINT).size],at,[26,35],[13,17.5],true);this.lighting.tint(image.image.sprite,1,false);
            this.footprints.push({image,halo,at,angle,highlight:-1});
        }
        this.ink('LandmarkBoards',travelLandmarks(state));
        this.branches=c.branches.map((v:any,i:number)=>this.atlas('Branch'+i,v.region,v.at,v.size,v.pivot));
        const b=c.bell,chain=b.chain?this.atlas('BellChain',b.chain.region,b.chain.at,b.chain.size):undefined,body=this.atlas('BellBody',b.body_region,b.position,b.body_size,b.body_pivot),tongue=this.atlas('BellTongue',b.clapper_region,b.position,b.clapper_size,b.clapper_pivot),cover=b.occluder?this.atlas('BellOccluder',b.occluder.region,b.occluder.at,b.occluder.size):undefined;this.bell={chain,body,tongue,cover};
        for(let i=0;i<state.leaves.length;i++)if(state.leaves[i].depth>.7)leaf(i);
        this.volume=this.ink('SharedAtmosphericVolume',polygonInk([[0,0],[c.canvas[0],0],c.canvas,[0,c.canvas[1]]],[1,1,1,1]),2);
        this.render();
    }
    private piece(name:string,resource:string,region:number[],at:number[],extent:number[],origin:number[],drawingScale=false):Piece{
        const pivot=nodeAt(this.root,name),rotation=drawingScale?nodeAt(pivot,'DrawingRotation'):pivot,image=new TravelAtlasSprite(rotation,this.assets,this.scope,resource,region,'OriginalPixels');this.lighting.bind(image.sprite);
        const item={pivot,rotation,image,at:[],extent:[],origin:[],angle:0};this.pose(item,at,extent,origin,0);return item;
    }
    private atlas(name:string,region:string,at:number[],extent:number[],origin=[0,0]){return this.piece(name,this.state.config.atlas,this.state.config.regions[region],at,extent,origin);}
    private pose(p:Piece,at:number[],extent=p.extent,origin=p.origin,angle=p.angle){
        p.at=at;p.extent=extent;p.origin=origin;p.angle=angle;p.pivot.setPosition(at[0],-at[1]);p.rotation.angle=-angle*180/Math.PI;p.image.place([-origin[0],-origin[1],extent[0],extent[1]]);
    }
    private ink(name:string,mesh:TravelInkMesh,mode=1){
        const node=nodeAt(this.root,name),sprite:any=node.addComponent(meshSprite());sprite.configure(mesh,[1,1]);sprite.spriteFrame=this.assets.frame(this.state.config.atlas,this.scope);sprite.sizeMode=Sprite.SizeMode.CUSTOM;this.lighting.bind(sprite,mode);node.active=mesh.indices.length>0;return sprite;
    }
    private redraw(sprite:any,mesh:TravelInkMesh){const old=sprite.mesh;if(old.vertices.length===mesh.vertices.length&&old.indices.length===mesh.indices.length){old.vertices.set(mesh.vertices);old.vertexUV.set(mesh.vertexUV);old.vertexData.set(mesh.vertexData);old.indices.set(mesh.indices);sprite.geometryChanged();}else sprite.configure(mesh,[1,1]);sprite.node.active=mesh.indices.length>0;}
    resize(height:number,headerInset=0){this.background.resize(height,pageLayout(height),headerInset);const l=pageLayout(height),left=-l.x/l.scale,right=(720-l.x)/l.scale;this.redraw(this.volume,polygonInk([[left,l.top],[right,l.top],[right,l.bottom],[left,l.bottom]],[1,1,1,1]));this.lighting.resize(height);}
    advance(delta:number){this.state.advance(delta);this.render();}
    render(){
        if(!this.scope.active||this.state.disposed)return;this.renders++;const c=this.state.config,s=this.state,light=this.lighting.update(this.clock.hour());
        this.clouds.forEach((p,i)=>this.pose(p,s.cloudPosition(c.clouds[i])));this.branches.forEach((p,i)=>this.pose(p,p.at,p.extent,p.origin,s.branches[i].angle));
        this.pose(this.bell.body,c.bell.position,c.bell.body_size,c.bell.body_pivot,s.bodyAngle);this.pose(this.bell.tongue,s.tonguePosition(),c.bell.clapper_size,c.bell.clapper_pivot,s.clapperAngle);
        for(let i=0;i<this.leaves.length;i++){const p=this.leaves[i],pose=s.leafPose(i),[x,y]=pose.at,[w,h]=pose.extent;p.pivot.active=x+w>-80&&x-w<800&&y+h>100&&y-h<1270;if(!p.pivot.active)continue;this.pose(p,pose.at,pose.extent,pose.extent.map(v=>v/2),pose.turn);this.lighting.tint(p.image.sprite,.34+(.91-.34)*pose.depth,true,pose.flip<0?.10:0);}
        this.route.update().forEach(i=>this.routeSprites[i].geometryChanged());
        this.footprints.forEach((p,i)=>{const pose=s.footprintPose(i);p.image.pivot.active=pose.visible;p.halo.node.active=pose.visible&&pose.highlight>.001;if(!pose.visible)return;
            this.pose(p.image,[p.at[0],p.at[1]+pose.drop],[26,35],[13,17.5],p.angle);p.image.pivot.setScale(pose.scale[0],pose.scale[1],1);this.lighting.tint(p.image.image.sprite,pose.alpha,false);
            if(pose.highlight!==p.highlight){this.redraw(p.halo,footprintHighlight(pose.highlight,p.angle));p.highlight=pose.highlight;}p.halo.node.active=pose.highlight>.001;
        });
        const shadowKey=[light.hour,s.routeProgress].join(':');if(shadowKey!==this.lastShadow){this.redraw(this.shadow,travelShadows(s,light));this.lastShadow=shadowKey;}
    }
    snapshot(){return {scene:this.state.snapshot(this.clock.hour()),lighting:this.lighting.snapshot(),routeBatches:this.route.batches.length,routeVertices:this.route.batches.reduce((n,m)=>n+m.vertices.length/2,0),routeUpdates:this.route.updates,layers:this.root.children.map(n=>n.name),leaves:this.leaves.map(p=>({visible:p.pivot.active,at:p.at,extent:p.extent,angle:p.angle})),bell:{body:this.bell.body.angle,tongue:this.bell.tongue.angle,at:this.bell.tongue.at},renders:this.renders,bufferReservation:TRAVEL_SCENE_BUFFER_BYTES};}
}
