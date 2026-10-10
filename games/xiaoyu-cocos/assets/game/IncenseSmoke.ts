import { smooth } from './IncenseState';
export const INCENSE_RATIO=150/417,STICK_BASE=[-INCENSE_RATIO,-211*INCENSE_RATIO];
type Point={position:number[];age:number;burnId:number};
// Exact independent_incense.gd advection and five-column ribbon. Capacity also
// includes the live tip, and disconnected burn generations never share a face.
export class IncenseSmoke {
    points:Point[]=[];private emitAge=0;readonly capacity=177;
    readonly mesh={source:new Float32Array(177*5*2),vertices:new Float32Array(177*5*2),vertexData:new Float32Array(177*5*3),indices:new Uint16Array(176*24)};
    ignite(length:number,burnId:number){this.emitAge=0;this.points.push({position:[STICK_BASE[0],STICK_BASE[1]-length-1.1],age:0,burnId});if(this.points.length>176)this.points.shift();}
    advance(delta:number,previous:number,duration:number,phase:number,burnId:number){
        let cursor=Math.max(0,delta-5.6);if(cursor>0){this.points=[];this.emitAge=0;}
        while(cursor<delta-1e-5){const step=Math.min(1/30,delta-cursor);cursor+=step;const time=phase+cursor;
            for(const p of this.points){p.age+=step;const altitude=STICK_BASE[1]-p.position[1],drift=13*Math.sin(altitude*.047-time*.72)+8*Math.sin(altitude*.096+time*.91),rise=51+Math.min(p.age,3.4)*4.5+3*Math.sin(altitude*.04+time);p.position[0]+=drift*step;p.position[1]-=rise*step;}
            while(this.points.length&&this.points[0].age>=5.6)this.points.shift();
            if(previous-cursor>0){this.emitAge+=step;if(this.emitAge>=1/30-1e-5){this.emitAge%=1/30;const length=224*Math.max(0,Math.min(1,(previous-cursor)/duration));this.points.push({position:[STICK_BASE[0],STICK_BASE[1]-length-1.1],age:0,burnId});}}
            if(this.points.length>176)this.points.shift();
        }
    }
    paint(burning:boolean,length:number,phase:number,burnId:number){
        const mesh=this.mesh;mesh.vertexData.fill(0);mesh.indices.fill(0);if(this.points.length<2)return mesh;
        const points=this.points.slice();if(burning)points.push({position:[STICK_BASE[0],STICK_BASE[1]-length-1.1],age:0,burnId});
        const n=points.length,from=new Float64Array(n),to=new Float64Array(n),distance=(a:Point,b:Point)=>Math.hypot(a.position[0]-b.position[0],a.position[1]-b.position[1]);
        for(let i=1;i<n;i++)if(points[i-1].burnId===points[i].burnId)from[i]=from[i-1]+distance(points[i-1],points[i]);
        for(let i=n-2;i>=0;i--)if(points[i+1].burnId===points[i].burnId)to[i]=to[i+1]+distance(points[i+1],points[i]);
        const across=[-1,-.52,0,.52,1],opacity=[0,.34,.78,.34,0];
        for(let i=0;i<n;i++){const p=points[i],before=i>0&&points[i-1].burnId===p.burnId,after=i+1<n&&points[i+1].burnId===p.burnId,a=before?points[i-1].position:p.position,b=after?points[i+1].position:p.position;let dx=b[0]-a[0],dy=b[1]-a[1],norm=Math.hypot(dx,dy);if(norm===0){dx=0;dy=1;norm=1;}dx/=norm;dy/=norm;
            const capSize=2.4+Math.min(p.age,1.6)*4,cap=smooth(0,capSize,from[i])*smooth(0,capSize,to[i]),width=(3.5+p.age*4+Math.sin(p.age*2.4+phase)*p.age*.55)*(.15+.85*cap),alpha=smooth(.015,.13,p.age)*(1-smooth(1.1,5.6,p.age))*.49*cap;
            for(let c=0;c<5;c++){const index=i*5+c;mesh.vertices[index*2]=p.position[0]-dy*width*across[c];mesh.vertices[index*2+1]=p.position[1]+dx*width*across[c];mesh.vertexData[index*3]=alpha*opacity[c];}
            if(before)for(let c=0;c<4;c++){const a=(i-1)*5+c,b=i*5+c;mesh.indices.set([a,a+1,b,a+1,b+1,b],(i-1)*24+c*6);}
        }
        return mesh;
    }
}
export function incenseFlame(ignition:number,tip:number[],phase:number,inner=false){const height=18*Math.sin(Math.max(0,Math.min(1,ignition))*Math.PI*.75)*(inner?.68:1);if(ignition<=0||height<.35)return [];const width=Math.max(0,Math.min(1,height/12))*(inner?.55:1),sway=Math.sin(phase*19)*2.1*width;return [[-3.7*width,0],[-4*width,-height*.35],[sway,-height],[3.4*width,-height*.39],[3.2*width,0]].map(p=>[tip[0]+p[0],tip[1]+p[1]]);}
