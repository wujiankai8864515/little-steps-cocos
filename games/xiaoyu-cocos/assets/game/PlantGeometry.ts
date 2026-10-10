// Home room_plants.gd / spring_mesh_part.gd. Atlas coordinates never move;
// three successive joints deform each authored nine-row piece independently.
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const noise=(serial:number,seed:number)=>{const n=Math.sin(serial*12.9898+seed*78.233)*43758.5453;return n-Math.floor(n);};
type Recipe=[string,string,number[],number,number,number?,number[]?];
export const HOME_PLANT_PARTS:Recipe[]=[
    ['LeftStemA','stem_0',[26,-8],.7,-.015],['LeftStemB','stem_1',[0,0],.7,.035,0],['LeftTip','tip_0',[0,0],.59,-.05,1],['LeftIndependentLeaf','leaf_2',[0,0],.24,-.28,0,[61,176]],
    ['WindowStemA','stem_2',[296,-14],.77,.012],['WindowStemB','stem_1',[0,0],.78,-.012,4],['WindowStemC','stem_0',[0,0],.55,.008,5],['WindowTip','tip_2',[0,0],.39,-.012,6],['WindowBranch','cluster_2',[0,0],.37,.19,4,[43,240]],['WindowIndependentLeaf','leaf_0',[0,0],.23,.31,5,[44,108]],
    ['PotCrown','cluster_0',[523,119],.35,Math.PI],['PotIndependentLeaf','leaf_3',[0,0],.3,-.53,10,[126,130]],['PotRunner','stem_3',[523,119],.55,-1.78],['PotBranch','cluster_3',[0,0],.35,2.64,12,[40,145]],['ShelfTrailA','stem_0',[0,0],.64,1.78,12],['ShelfTrailB','stem_3',[0,0],.57,.03,14],['ShelfTrailTip','tip_3',[0,0],.4,-.035,15],['ShelfIndependentLeaf','leaf_1',[0,0],.2,-.33,14,[47,165]],
];
export class SpringPlantPart {
    readonly mesh:{source:Float32Array;vertices:Float32Array;indices:Uint16Array};
    readonly base:Float32Array;readonly pivot:number[];readonly tip:number[];readonly span:number;
    angles=[0,0,0];velocities=[0,0,0];position:number[];rotation:number;lastSubsteps=0;revision=0;
    constructor(readonly recipe:Recipe,readonly definition:any){
        if(definition.ribbon_profile)throw new Error('植物部件需要原版九行网格');
        this.pivot=definition.pivot.map(Math.fround);this.tip=definition.tip_anchor.map(Math.fround);this.span=Math.max(1,definition.rect[3]-this.pivot[1]);
        this.position=recipe[2].slice();this.rotation=recipe[4];
        const source:number[]=[],base:number[]=[],indices:number[]=[],r=definition.rect;
        for(let row=0;row<9;row++)for(const x of [0,r[2]]){const y=Math.fround(r[3]*row/8);source.push(r[0]+x,r[1]+y);base.push(x-this.pivot[0],y-this.pivot[1]);}
        for(let row=0;row<8;row++){const i=row*2;indices.push(i,i+1,i+3,i,i+3,i+2);}
        this.base=new Float32Array(base);this.mesh={source:new Float32Array(source),vertices:new Float32Array(base),indices:new Uint16Array(indices)};
    }
    skin(point:number[]){
        const length=this.span/3,segment=clamp(Math.floor(Math.max(point[1],0)/length),0,2);
        let a=1,b=0,c=0,d=1,x=0,y=0;
        for(let i=0;i<=segment;i++){
            if(i>0){x+=c*length;y+=d*length;}
            const cs=Math.cos(this.angles[i]),sn=Math.sin(this.angles[i]),nextA=a*cs+c*sn,nextB=b*cs+d*sn;
            c=-a*sn+c*cs;d=-b*sn+d*cs;a=nextA;b=nextB;
        }
        return [a*point[0]+c*(point[1]-segment*length)+x,b*point[0]+d*(point[1]-segment*length)+y];
    }
    attachment(source:number[]){return this.skin(source.map((v,i)=>v-this.pivot[i]));}
    roomPoint(local:number[]){const cs=Math.cos(this.rotation),sn=Math.sin(this.rotation),scale=this.recipe[3];return [this.position[0]+(cs*local[0]-sn*local[1])*scale,this.position[1]+(sn*local[0]+cs*local[1])*scale];}
    advance(delta:number,target:number){
        if(!Number.isFinite(delta)||!Number.isFinite(target))return false;
        const dt=clamp(delta,0,4/120);this.lastSubsteps=Math.min(4,Math.ceil(dt*120));
        if(this.lastSubsteps){
            const step=dt/this.lastSubsteps,drive=clamp(target,-.12,.12),stiffness=[46,34,27],damping=[10.5,8.3,7.1];
            for(let n=0;n<this.lastSubsteps;n++)for(let i=0;i<3;i++){
                const follow=i>0?-this.velocities[i-1]*.035:0,goal=drive*(.45+.26*i)+follow;
                this.velocities[i]=Math.fround(this.velocities[i]+((goal-this.angles[i])*stiffness[i]-this.velocities[i]*damping[i])*step);
                this.angles[i]=Math.fround(clamp(this.angles[i]+this.velocities[i]*step,-.12,.12));this.velocities[i]=Math.fround(clamp(this.velocities[i],-.8,.8));
                if(Math.abs(goal)<.00001&&Math.abs(this.angles[i])<.00012&&Math.abs(this.velocities[i])<.0008){this.angles[i]=0;this.velocities[i]=0;}
            }
        }
        let changed=false;
        for(let i=0;i<this.base.length;i+=2){const p=this.skin([this.base[i],this.base[i+1]]);for(let j=0;j<2;j++){const v=Math.fround(p[j]);if(this.mesh.vertices[i+j]!==v)changed=true;this.mesh.vertices[i+j]=v;}}
        if(changed)this.revision++;return changed;
    }
}
export class PlantForest {
    readonly parts:SpringPlantPart[];readonly bindings:Array<{elapsed:number;duration:number;amplitude:number;events:number}>;
    phase=0;untilEvent=.18;eventSerial=0;activePulses=0;peakActivePulses=0;windEnabled=true;
    private eligible:number[]=[];
    constructor(contract:any){
        this.parts=HOME_PLANT_PARTS.map((recipe,index)=>{const part=new SpringPlantPart(recipe,contract.parts[recipe[1]]);if(['leaf','tip','cluster'].some(kind=>recipe[1].indexOf(kind)>=0))this.eligible.push(index);return part;});
        if(this.parts.length>32)throw new Error('植物部件超过原版预算');
        this.bindings=this.parts.map(()=>({elapsed:2,duration:1,amplitude:0,events:0}));this.advance(0);
    }
    private beginPulse(){
        if(!this.eligible.length)return;
        if(this.bindings.filter(b=>b.elapsed<b.duration).length>=2){this.untilEvent=.12;return;}
        const index=this.eligible[Math.floor(noise(this.eventSerial+1,.73)*this.eligible.length)%this.eligible.length],b=this.bindings[index];
        if(b.elapsed<b.duration){this.untilEvent=.13;return;}
        const seed=index*.47,polarity=noise(this.eventSerial+1,seed+.5)<.5?-1:1;
        b.elapsed=0;b.duration=.75+.6*noise(this.eventSerial+1,seed+.9);b.amplitude=polarity*(.125+.08*noise(this.eventSerial+1,seed+1.7));b.events++;
        this.eventSerial++;this.untilEvent=.45+.45*noise(this.eventSerial,seed+2.3);
    }
    advance(delta:number){
        if(!Number.isFinite(delta))return;
        const dt=clamp(delta,0,4/120);this.phase+=dt;this.untilEvent-=dt;if(this.windEnabled&&this.untilEvent<=0)this.beginPulse();this.activePulses=0;
        this.parts.forEach((part,index)=>{
            const recipe=part.recipe,parentIndex=recipe[5];
            if(parentIndex!==undefined){const parent=this.parts[parentIndex];part.position=parent.roomPoint(parent.attachment(recipe[6]||parent.tip));part.rotation=recipe[4]+parent.rotation+parent.angles.reduce((a,b)=>a+b,0);}
            else {part.position=recipe[2].slice();part.rotation=recipe[4];}
            const binding=this.bindings[index];binding.elapsed+=dt;let drive=0;
            if(this.windEnabled&&binding.elapsed<binding.duration){const t=clamp(binding.elapsed/binding.duration,0,1);drive=binding.amplitude*16*t*t*(1-t)*(1-t)*(1-1.35*t);this.activePulses++;}
            part.advance(dt,drive);
        });this.peakActivePulses=Math.max(this.peakActivePulses,this.activePulses);
    }
    snapshot(){return {parts:this.parts.length,bones:this.parts.length*3,vertices:this.parts.length*18,maxParts:32,phase:this.phase,eventCount:this.eventSerial,activePulses:this.activePulses,peakActivePulses:this.peakActivePulses,maxActivePulses:2};}
}
