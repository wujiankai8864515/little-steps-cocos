// Original photo_config/photo_paper/photo_page math in downward canvas coordinates.
export const PHOTO_ANCHORS=[[142,244],[360,266],[578,239],[142,490],[360,526],[578,500]],PHOTO_ANGLES=[-.13,-.047,-.15,.115,-.079,-.10],PHOTO_SELECTORS=[[245,1148],[473,1148]];
export const VINE_SITES=[[25,-15,190,330,-.10],[130,-25,170,275,.25],[570,-20,175,325,-.08],[710,-10,170,360,-.20],[-5,230,145,300,-.13],[720,260,145,340,.11],[0,470,180,330,-.28],[730,560,180,320,.28],[30,895,175,340,3],[145,865,180,270,2.65],[680,890,185,290,3.32],[550,850,145,235,3.65],[-35,1110,190,350,3.08],[770,1190,190,340,3.15]];
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v)),mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export const rotate=(p:number[],a:number)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];
const normal=(p:number[])=>{const l=Math.hypot(...p);return l?p.map(v=>v/l):[0,0];};
export function photoHash(id:string){let hash=5381;for(const ch of id)hash=(Math.imul(hash,33)+(ch.codePointAt(0)||0))>>>0;return hash;}
export function anchor(index:number,time:number){const p=PHOTO_ANCHORS[index];return [p[0]+Math.sin(time*.47+index*1.31)*.65,p[1]+Math.sin(time*.73+index*1.71)*1.65];}
export function photoLight(snapshot:{hour:number;night:number;afterglow:number}){
    const {hour,night}=snapshot,s=(hour-12)*Math.PI/16,m=(((hour-20)%24+24)%24-4)*Math.PI/8,cs=Math.max(0,Math.cos(s)),cm=Math.max(0,Math.cos(m)),warm=(1-cs)**2;
    const origin=[mix(-210+Math.sin(s)*1000,-210+Math.sin(m)*660,night),mix(-85-cs*75,-95-cm*65,night)];
    return {origin,cast:normal([360-origin[0],700-origin[1]]),elevation:mix(cs,cm,night),energy:mix(.52+snapshot.afterglow*.20,.34,night),color:[1,.95,.82].map((v,i)=>mix(mix(v,[1,.76,.49][i],warm),[.52,.67,1][i],night)),ambient:[.65,.61,.54].map((v,i)=>mix(v,[.28,.35,.50][i],night)),night};
}
export type PhotoLight=ReturnType<typeof photoLight>;
export function grid(columns:number,rows:number,region=[0,0,1,1]){const source=[],indices=[];for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++)source.push(region[0]+x/columns*region[2],region[1]+y/rows*region[3]);for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x;indices.push(a,a+1,a+columns+2,a,a+columns+2,a+columns+1);}return {source:new Float32Array(source),vertices:new Float32Array(source.length),indices:new Uint16Array(indices)};}
export function polygonContains(p:number[],shape:number[][]){let inside=false;for(let i=0,j=shape.length-1;i<shape.length;j=i++){const a=shape[i],b=shape[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export class PhotoPaperGeometry {
    readonly mesh=grid(8,10);phase=0;rotation=0;position=[0,0];contour:number[][]=[];shadows:number[][][]=[];private seed:number;private rate:number;
    constructor(readonly id:string,readonly index:number){const h=photoHash(id);this.seed=h%10007/10007*Math.PI*2+index*.37;this.rate=.58+h%997/997*.24;}
    advance(time:number,light:PhotoLight){this.phase=time*this.rate+this.seed;this.position=anchor(this.index,time);const base=PHOTO_ANGLES[this.index];this.rotation=base+Math.sin(this.phase)*.021+Math.sin(time*.37+this.seed*1.7)*.007;const flutter=Math.sin(time*.29+this.seed*2.1)*.9,v=this.mesh.vertices;
        for(let i=0;i<v.length;i+=2){const x=this.mesh.source[i],y=this.mesh.source[i+1];v[i]=(x-.5)*192+Math.sin(this.phase+y*2)*y*y*(4.5+flutter);v[i+1]=y*222+Math.sin(this.phase+x*2.1)*y*y*2.8-smooth(.73,1,x)*smooth(.73,1,y)*4;}
        const ids=[];for(let x=0;x<=8;x++)ids.push(x);for(let y=1;y<=10;y++)ids.push(y*9+8);for(let x=7;x>=0;x--)ids.push(90+x);for(let y=9;y>0;y--)ids.push(y*9);this.contour=ids.map(i=>[v[i*2],v[i*2+1]]);
        this.shadows=[0,1,2,3].map(layer=>this.contour.map(p=>{const hanging=clamp(p[1]/222,0,1),lift=1.1+hanging*hanging*(7+3*Math.sin(this.phase+.5)+Math.abs(Math.sin(this.rotation-base))*120),at=rotate(p,this.rotation).map((v,i)=>v+this.position[i]),cast=rotate(normal(at.map((v,i)=>v-light.origin[i])),-this.rotation),blur=layer*mix(1,2.2,1-light.elevation)*hanging,out=normal([p[0],p[1]-222*.45]);return p.map((v,i)=>v+cast[i]*lift*mix(.6,1.3,1-light.elevation)+out[i]*blur);}));return this;
    }
    contains(point:number[]){return polygonContains(rotate(point.map((v,i)=>v-this.position[i]),-this.rotation),this.contour);}
}
export class PhotoVineGeometry {
    readonly mesh:any;private joints=[0,0,0];private speeds=[0,0,0];
    constructor(readonly index:number,region:number[]){this.mesh=grid(4,12,region);}
    advance(delta:number,time:number){const dt=clamp(delta,0,.033),phase=this.index*1.618,site=VINE_SITES[this.index];for(let j=0;j<3;j++){const target=Math.sin(time*(.48+phase*.013)+phase+j*.77)*.020+Math.sin(time*.23+phase*1.7)*.009;this.speeds[j]+=(target-this.joints[j])*16*dt-this.speeds[j]*6*dt;this.joints[j]=clamp(this.joints[j]+this.speeds[j]*dt,-.042,.042);}
        for(let y=0;y<=12;y++){const q=y/12,center=[0,0];let heading=0;for(let j=0;j<3;j++){heading+=this.joints[j];const d=rotate([0,site[3]*clamp(q-j/3,0,1/3)],heading);center[0]+=d[0];center[1]+=d[1];}for(let x=0;x<=4;x++){const d=rotate([(x/4-.5)*site[2],0],heading*q),i=(y*5+x)*2;this.mesh.vertices[i]=center[0]+d[0];this.mesh.vertices[i+1]=center[1]+d[1];}}return this;
    }
}
const inside=(p:number[],r:number[])=>p[0]>=r[0]&&p[1]>=r[1]&&p[0]<r[0]+r[2]&&p[1]<r[1]+r[3];
export class PhotoPointer {
    owner:number|null=null;held=-1;private pressed=[0,0];
    down(id:number,at:number[],hasBatch:boolean){if(this.owner!==null)return false;const slot=PHOTO_SELECTORS.findIndex(p=>inside(at,[p[0]-84,p[1]-48,198,181]));if(slot<0&&(!hasBatch||!inside(at,[424,888,271,181])))return false;this.owner=id;this.held=slot;this.pressed=at.slice();return true;}
    up(id:number,at:number[],papers:PhotoPaperGeometry[]){if(id!==this.owner)return null;const result=this.held>=0?{slot:'photo'+(this.held+1),photo:papers.find(p=>p.contains(at))?.id||'',batch:false}:{slot:'',photo:'',batch:inside(at,[424,888,271,181])&&Math.hypot(at[0]-this.pressed[0],at[1]-this.pressed[1])<24};this.cancel();return result;}
    cancel(){this.owner=null;this.held=-1;}
}
