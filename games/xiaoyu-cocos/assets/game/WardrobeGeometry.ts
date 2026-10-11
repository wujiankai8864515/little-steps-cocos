export const WARDROBE_ATLAS='res://wardrobe/assets/wardrobe_runtime_atlas.png';
export const WARDROBE_REGIONS={original:[745,55,393,530],peach:[1155,55,395,540],label:[1571,277,367,164],vine:[793,592,313,638],flower:[1170,760,317,317],spark:[1585,738,354,386],backdrop:[0,0,720,1280]};
export const WARDROBE_VINES=[[144,88],[606,93],[120,342],[655,346],[128,632],[629,644],[447,-55]];
export function wardrobeMesh(region:number[],cols=1,rows=1){const vertices=[],source=[],indices=[];for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){const p=[x/cols*region[2],y/rows*region[3]];vertices.push(...p);source.push(region[0]+p[0],region[1]+p[1]);}for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x;indices.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}return {vertices:new Float32Array(vertices),source:new Float32Array(source),indices:new Uint16Array(indices)};}
export function deformWardrobe(mesh:any,region:number[],motion:number,cloth:boolean,bend:number,shadow?:number[]){const height=cloth?region[3]:600,amplitude=cloth?34:18;for(let i=0;i<mesh.source.length;i+=2){const x=mesh.source[i]-region[0],y=mesh.source[i+1]-region[1],weight=Math.max(0,Math.min(1,y/height));let sway=Math.sin(motion-weight*2)*amplitude;if(cloth)sway=(Math.sin(motion-weight*2.8)+.22*Math.sin(motion*1.71-weight*5))*amplitude/1.22+bend*Math.sin(weight*1.4);mesh.vertices[i]=x+sway*weight*weight+(shadow?.[0]||0);mesh.vertices[i+1]=y+(shadow?.[1]||0);}}
export class WardrobeMotion {
    elapsed=0;cloth=[0,0];clothVelocity=[0,0];vine=Array(7).fill(0);vineVelocity=Array(7).fill(0);
    select(index:number){this.clothVelocity[index]=Math.min(this.clothVelocity[index]+120,160);}
    cancel(){this.cloth.fill(0);this.clothVelocity.fill(0);}
    advance(delta:number){const dt=Number.isFinite(delta)?Math.max(0,delta):0;this.elapsed+=Math.min(dt,.1);const step=Math.min(dt,.04);
        for(let i=0;i<2;i++){this.clothVelocity[i]+=(-55*this.cloth[i]-9*this.clothVelocity[i])*step;this.cloth[i]=Math.max(-24,Math.min(24,this.cloth[i]+this.clothVelocity[i]*step));}
        for(let i=0;i<7;i++){const target=(Math.sin(this.elapsed*(.72+i*.061)+i*1.87)+Math.sin(this.elapsed*1.37+i*2.73)*.35)*.025;this.vineVelocity[i]+=(-38*(this.vine[i]-target)-8.5*this.vineVelocity[i])*step;this.vine[i]=Math.max(-.06,Math.min(.06,this.vine[i]+this.vineVelocity[i]*step));}
    }
}
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function wardrobeParticle(index:number,age:number){const t=age-index*.047,phase=index*2.17;return {visible:t>=0&&t<2.1,position:[175+index*61%365+Math.sin(t*2.3+phase)*26,902+index%4*9-Math.max(t,0)*86],rotation:Math.sin(t*1.4+phase)*.24,alpha:smooth(0,.2,t)*(1-smooth(1.2,2.1,t)),scale:index%3===0?.095:.065};}
