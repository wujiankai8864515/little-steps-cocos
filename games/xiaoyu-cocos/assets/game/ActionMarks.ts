import { Graphics, Node } from 'cc';
import { GameAssets } from './Assets';
import { core, Scope, sharedUI } from './Engine';
import { ActionMarkKind, ActionMarkState, ACTION_MARK_GLYPHS, ACTION_MARK_SPECS, actionMarkAlpha, tapMarkContours } from './ActionMarkState';
import { Stroke2D } from './Stroke2D';
import { nodeAt } from './Visual';
// One room-owned cap covers every mark type. No asset or node is allocated per
// event; both antialiased stroke renderers and polygon buffer are reused.
export class ActionMarks {
    readonly root:Node;readonly state=new ActionMarkState();private graphics:Graphics;private strokes:{doze:Stroke2D;lift:Stroke2D};private eventSerial=0;
    constructor(parent:Node,assets:GameAssets,scope:Scope,private face:()=>number[]){
        this.root=nodeAt(parent,'ActionMarks');this.graphics=this.root.addComponent(Graphics);
        this.strokes={doze:new Stroke2D(this.root,assets,scope,'DozeMarks'),lift:new Stroke2D(this.root,assets,scope,'LiftMarks')};scope.own(()=>this.clear());
    }
    private validTransform(){const m=this.root.worldMatrix;return [m.m00,m.m01,m.m04,m.m05,m.m12,m.m13].every(Number.isFinite)&&Math.abs(m.m00*m.m05-m.m01*m.m04)>=1e-5;}
    emit(kind:ActionMarkKind,at:number[]){return this.validTransform()&&this.state.emit(kind,at,this.face(),++this.eventSerial);}
    advance(delta:number){this.state.advance(delta);}
    render(){this.graphics.clear();this.strokes.doze.clear();this.strokes.lift.clear();if(!this.state.marks.length||!this.validTransform())return;this.state.setFace(this.face());
        for(const mark of this.state.marks){if(!this.state.faceSafe(mark))continue;
            if(mark.kind==='tap'){for(const draw of tapMarkContours(mark))sharedUI().polygon(this.graphics,draw.points,draw.color);continue;}
            const s=ACTION_MARK_SPECS[mark.kind],t=Math.max(0,Math.min(1,mark.age/s.life)),origin=mark.position.map((v,i)=>v+s.drift[i]*t),paths=ACTION_MARK_GLYPHS[mark.kind].map(shape=>shape.map(p=>p.map((v,i)=>v+origin[i]))),color=[...s.color,actionMarkAlpha(mark)];
            if(mark.kind==='drink')paths.forEach(p=>sharedUI().polygon(this.graphics,p,color));
            else this.strokes[mark.kind].draw(core.mergeDrawingMeshes(paths.map(p=>core.featherPolyline(p,2.1))),color);
        }
    }
    clear(){this.state.clear();this.graphics.clear();this.strokes.doze.clear();this.strokes.lift.clear();}
    snapshot(){return this.state.snapshot();}
}
