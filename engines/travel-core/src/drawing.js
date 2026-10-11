// Antialiased positive-width 2D lines. Feather geometry follows Godot 4.5.2
// renderer_canvas_cull.cpp (MIT; see NOTICE.godot.txt), without screen derivatives.
// Vertex payload's first channel is coverage, independent of Creator UIOpacity.
const DRAW_FEATHER = 1.25;
const drawAdd=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s];
const drawSub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const drawNormal=a=>[a[1],-a[0]];
const drawUnit=a=>{const l=Math.hypot(a[0],a[1]);return l?[a[0]/l,a[1]/l]:[0,0];};
const drawZero=a=>Math.abs(a[0])<1e-5&&Math.abs(a[1])<1e-5;
function drawValidate(points,width){
    if(!Number.isFinite(width)||width<=0||points.length<2||!points.every(p=>p.length===2&&p.every(Number.isFinite)))throw new Error('Invalid positive-width line');
}
function drawBuilder(){
    const vertices=[],coverage=[],indices=[];
    return {strip(points,alphas){const start=vertices.length/2;points.forEach((p,i)=>{vertices.push(...p);coverage.push(alphas[i],0,0);});for(let i=2;i<points.length;i++)indices.push(start+i-2,start+i-1,start+i);},quad(points,alphas){const start=vertices.length/2;points.forEach((p,i)=>{vertices.push(...p);coverage.push(alphas[i],0,0);});indices.push(start,start+1,start+2,start,start+2,start+3);},finish(){if(vertices.length/2>65535)throw new Error('Line mesh exceeds 16-bit indices');return {vertices:new Float32Array(vertices),source:new Float32Array(vertices.length),vertexData:new Float32Array(coverage),indices:new Uint16Array(indices)};}};
}
function featherLine(from,to,width){
    drawValidate([from,to],width);const b=drawBuilder(),diff=drawSub(from,to);
    if(drawZero(diff))return b.finish();
    const normal=drawNormal(drawUnit(diff)),extent=width*.5,borderSize=DRAW_FEATHER*Math.min(1,width),side=normal.map(v=>v*borderSize),cap=drawUnit(diff).map(v=>v*borderSize);
    const a=drawAdd(from,normal,extent),c=drawAdd(from,normal,-extent),d=drawAdd(to,normal,-extent),e=drawAdd(to,normal,extent);
    b.quad([a,c,d,e],[1,1,1,1]);
    b.quad([a,drawAdd(a,side),drawAdd(e,side),e],[1,0,0,1]);
    b.quad([c,drawAdd(c,side,-1),drawAdd(d,side,-1),d],[1,0,0,1]);
    b.quad([a,drawAdd(a,cap),drawAdd(c,cap),c],[1,0,0,1]);
    b.quad([e,drawAdd(e,cap,-1),drawAdd(d,cap,-1),d],[1,0,0,1]);
    for(const [p,s,t]of [[a,1,1],[c,-1,1],[e,1,-1],[d,-1,-1]])b.quad([p,drawAdd(p,cap,t),drawAdd(drawAdd(p,side,s),cap,t),drawAdd(p,side,s)],[1,0,0,0]);
    return b.finish();
}
function featherPolyline(points,width){
    drawValidate(points,width);const b=drawBuilder(),n=points.length,dirs=[];
    for(let i=1;i<n;i++)dirs.push(drawUnit(drawSub(points[i],points[i-1])));
    const first=dirs.find(d=>!drawZero(d));if(!first)return b.finish();const last=dirs.slice().reverse().find(d=>!drawZero(d));
    const loop=drawZero(drawSub(points[0],points[n-1])),offset=loop?0:2,count=n*2+(loop?0:4),sideCount=n*2+(loop?0:5),center=Array(count),left=Array(sideCount),right=Array(sideCount),ca=Array(count),la=Array(sideCount),ra=Array(sideCount),borderSize=DRAW_FEATHER*Math.min(1,width);
    let previous=[0,0];
    for(let i=0;i<n;i++){
        let segment=i===n-1?previous:dirs[i];if(drawZero(segment))segment=previous;
        if(loop&&i===0)previous=last;else if(loop&&i===n-1)previous=first;
        let base;
        if(!loop&&i===0)base=drawNormal(first);else if(!loop&&i===n-1)base=drawNormal(last);else {
            let bisector=drawUnit(drawSub(previous,segment)),length=1;
            const sine=Math.sin(Math.atan2(bisector[0]*previous[1]-bisector[1]*previous[0],bisector[0]*previous[0]+bisector[1]*previous[1]));
            if(Math.abs(sine)>=1e-5&&!drawZero(drawSub(segment,previous)))length=Math.max(-3,Math.min(3,1/sine));else bisector=drawNormal(segment);
            if(drawZero(bisector))bisector=drawNormal(segment);base=bisector.map(v=>v*length);
        }
        const p=points[i],edge=base.map(v=>v*width*.5),border=base.map(v=>v*borderSize),j=i*2+offset;
        center[j]=left[j]=drawAdd(p,edge);center[j+1]=right[j]=drawAdd(p,edge,-1);left[j+1]=drawAdd(center[j],border);right[j+1]=drawAdd(center[j+1],border,-1);
        ca[j]=ca[j+1]=la[j]=ra[j]=1;la[j+1]=ra[j+1]=0;
        if(!loop&&i===0){const cap=segment.map(v=>-v*borderSize);center[0]=left[0]=drawAdd(center[j],cap);center[1]=right[0]=drawAdd(center[j+1],cap);left[1]=drawAdd(left[0],border);right[1]=drawAdd(right[0],border,-1);ca[0]=ca[1]=la[0]=la[1]=ra[0]=ra[1]=0;}
        if(!loop&&i===n-1){const cap=previous.map(v=>v*borderSize),end=n*2+2;center[end]=drawAdd(center[j],cap);center[end+1]=drawAdd(center[j+1],cap);ca[end]=ca[end+1]=0;
            left[end]=center[j];left[end+1]=drawAdd(drawAdd(center[j],cap),border);left[end+2]=drawAdd(center[j],cap);la[end]=1;la[end+1]=la[end+2]=0;
            right[end]=center[j+1];right[end+1]=drawAdd(drawAdd(center[j+1],cap),border,-1);right[end+2]=drawAdd(center[j+1],cap);ra[end]=1;ra[end+1]=ra[end+2]=0;
        }
        previous=segment;
    }
    // Native commands render the body then the left and right feather strips.
    b.strip(center,ca);b.strip(left,la);b.strip(right,ra);return b.finish();
}
function mergeDrawingMeshes(meshes){
    const b={vertices:[],source:[],vertexData:[],indices:[]};
    for(const mesh of meshes){const offset=b.vertices.length/2;for(const key of ['vertices','source','vertexData'])for(const value of mesh[key])b[key].push(value);for(const index of mesh.indices)b.indices.push(index+offset);}
    if(b.vertices.length/2>65535)throw new Error('Drawing mesh exceeds 16-bit indices');
    return {vertices:new Float32Array(b.vertices),source:new Float32Array(b.source),vertexData:new Float32Array(b.vertexData),indices:new Uint16Array(b.indices)};
}
// Godot 4.5.2 renderer_canvas_cull.cpp canvas_item_add_circle (MIT).
// Filled non-antialiased 64-segment fan; the repeated last point and centre
// match the native command, with feathering left to the caller when needed.
function filledCircle(at,radius){
    if(at.length!==2||!at.every(Number.isFinite)||!Number.isFinite(radius)||radius<0)throw new Error('Invalid filled circle');
    const vertices=new Float32Array(66*2),vertexData=new Float32Array(66*3),indices=new Uint16Array(64*3);
    for(let i=0;i<65;i++){const a=Math.fround(i*Math.fround(Math.PI*2/64));vertices[i*2]=at[0]+Math.cos(a)*radius;vertices[i*2+1]=at[1]+Math.sin(a)*radius;vertexData[i*3]=1;}
    vertices[130]=at[0];vertices[131]=at[1];vertexData[195]=1;
    for(let i=0;i<64;i++)indices.set([65,i,i+1],i*3);
    return {vertices,source:new Float32Array(vertices.length),vertexData,indices};
}
Object.assign(api,{featherLine,featherPolyline,mergeDrawingMeshes,filledCircle});
