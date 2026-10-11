// Rounded fill/border tessellation follows Godot 4.5.2 StyleBoxFlat (MIT;
// NOTICE.godot.txt). Supports four radii/borders, center, AA and corner detail.
// Shadow, skew and blended borders are outside this explicit API.
function roundedStyleBox(rect,options={}) {
    const four=(value,defaultValue)=>Array.isArray(value)?value.slice():Array(4).fill(value??defaultValue);
    const radii=four(options.radius,0),border=four(options.borderWidth,0),fill=options.fill??[.6,.6,.6,1],outline=options.border??[.8,.8,.8,1],detail=options.cornerDetail??8,aa=options.aaSize??1,center=options.drawCenter!==false;
    if(rect.length!==4||rect.some(v=>!Number.isFinite(v))||rect[2]<0||rect[3]<0||[radii,border].some(v=>v.length!==4||v.some(n=>!Number.isFinite(n)||n<0))||[fill,outline].some(c=>c.length!==4||c.some(n=>!Number.isFinite(n)||n<0||n>1))||!Number.isInteger(detail)||detail<1||detail>20||!Number.isFinite(aa)||aa<0)throw new Error('Invalid rounded style box');
    const vertices=[],rgb=[],uv=[],indices=[];
    const finish=()=>({vertices:new Float32Array(vertices),source:new Float32Array(vertices.length),vertexData:new Float32Array(rgb),vertexUV:new Float32Array(uv),indices:new Uint16Array(indices)});
    if(!rect[2]||!rect[3]||(!center&&!border.some(n=>n>0)))return finish();
    const grow=(r,b)=>[r[0]-b[0],r[1]-b[1],r[2]+b[0]+b[2],r[3]+b[1]+b[3]],map=(a,f)=>a.map(f),adaptedBorder=Array(4).fill(1e6),adaptedRadius=Array(4).fill(1e6);
    const adapt=(a,b,result,values,width,maxA,maxB)=>{const factor=Math.min(1,width/(values[a]+values[b]));result[a]=Math.min(values[a]*factor,maxA,result[a]);result[b]=Math.min(values[b]*factor,maxB,result[b]);};
    adapt(1,3,adaptedBorder,border,rect[3],rect[3],rect[3]);adapt(0,2,adaptedBorder,border,rect[2],rect[2],rect[2]);
    adapt(1,2,adaptedRadius,radii,rect[3],rect[3]-adaptedBorder[3],rect[3]-adaptedBorder[1]);adapt(0,3,adaptedRadius,radii,rect[3],rect[3]-adaptedBorder[3],rect[3]-adaptedBorder[1]);
    adapt(0,1,adaptedRadius,radii,rect[2],rect[2]-adaptedBorder[2],rect[2]-adaptedBorder[0]);adapt(3,2,adaptedRadius,radii,rect[2],rect[2]-adaptedBorder[2],rect[2]-adaptedBorder[0]);
    const hasBorder=border.some(n=>n>0),aaOn=options.antialiased!==false&&aa>0&&radii.some(n=>n>0),infill=grow(rect,map(adaptedBorder,n=>-n)),style=aaOn?grow(rect,map(border,n=>n>0?-aa:0)):rect;
    function corners(r){
        const b=[r[0]-style[0],r[1]-style[1],style[2]-r[2]-(r[0]-style[0]),style[3]-r[3]-(r[1]-style[1])];
        const cr=[Math.max(adaptedRadius[0]-Math.min(b[1],b[0]),0),Math.max(adaptedRadius[1]-Math.min(b[1],b[2]),0),Math.max(adaptedRadius[2]-Math.min(b[3],b[2]),0),Math.max(adaptedRadius[3]-Math.min(b[3],b[0]),0)];
        const overflow=[Math.max(0,cr[0]+cr[3]-r[3]),Math.max(0,cr[0]+cr[1]-r[2]),Math.max(0,cr[1]+cr[2]-r[3]),Math.max(0,cr[3]+cr[2]-r[2])],hs=b[0]+b[2],vs=b[1]+b[3],ratio=[hs>0?b[0]/hs:0,vs>0?b[1]/vs:0,hs>0?b[2]/hs:0,vs>0?b[3]/vs:0];
        const reduction=[[overflow[1]*ratio[0],overflow[0]*ratio[1]],[overflow[1]*ratio[2],overflow[2]*ratio[1]],[overflow[3]*ratio[2],overflow[2]*ratio[3]],[overflow[3]*ratio[0],overflow[0]*ratio[3]]],left=reduction.map((v,i)=>v.map(n=>Math.max(0,n-cr[i]))),distributed=reduction.map((v,i)=>v.map((n,j)=>Math.max(0,cr[i]-n-left[(i+1)%4][j]-left[(i+3)%4][j]))),scale=distributed.map((v,i)=>v.map((n,j)=>n/Math.max(1.1920928955078125e-7,cr[i]-Math.max(0,left[(i+1)%4][j]+left[(i+3)%4][j]-n))));
        const centers=[[r[0]+cr[0]*scale[0][0],r[1]+cr[0]*scale[0][1]],[r[0]+r[2]-cr[1]*scale[1][0],r[1]+cr[1]*scale[1][1]],[r[0]+r[2]-cr[2]*scale[2][0],r[1]+r[3]-cr[2]*scale[2][1]],[r[0]+cr[3]*scale[3][0],r[1]+r[3]-cr[3]*scale[3][1]]];
        return {cr,scale,centers};
    }
    function rounded(ring,inner,innerColor,outerColor,filled=false){
        const start=vertices.length/2,steps=adaptedRadius.some(n=>n>0)?detail:1,a=corners(inner),b=corners(ring),add=(set,i,angle,color)=>{vertices.push(set.centers[i][0]+set.cr[i]*Math.cos(angle)*set.scale[i][0],set.centers[i][1]+set.cr[i]*Math.sin(angle)*set.scale[i][1]);rgb.push(...color.slice(0,3));uv.push(color[3],0);};
        for(let i=0;i<4;i++)for(let j=0;j<=steps;j++){const angle=(i+j/steps)*Math.PI/2+Math.PI;add(a,i,angle,innerColor);if(!filled)add(b,i,angle,outerColor);}
        const count=vertices.length/2-start;
        if(!filled){for(let i=0;i<count;i++)indices.push(start+i,start+(i+2)%count,start+(i+1)%count);}
        else{for(let i=0;i<count/2-1;i++)indices.push(start+i,start+count-2-i,start+i+1,start+i,start+count-1-i,start+count-2-i);}
    }
    const transparent=c=>[c[0],c[1],c[2],0];
    if(!aaOn){if(hasBorder)rounded(style,infill,outline,outline);if(center)rounded(infill,infill,fill,fill,true);}
    else {
        const borderAA=map(border,n=>hasBorder&&n>0?aa:0),fillAA=map(border,n=>!hasBorder||n===0?aa:0),half=a=>map(a,n=>n*.5),negative=a=>map(a,n=>-n);
        if(center){const clear=grow(infill,half(fillAA)),solid=grow(clear,negative(fillAA));rounded(solid,solid,fill,fill,true);rounded(clear,solid,fill,transparent(fill));}
        if(hasBorder){const innerSolid=grow(infill,half(borderAA)),innerClear=grow(innerSolid,negative(borderAA)),outerClear=grow(rect,half(borderAA)),outerSolid=grow(style,half(borderAA));rounded(outerSolid,innerSolid,outline,outline);rounded(innerSolid,innerClear,center?fill:transparent(outline),outline);rounded(outerClear,outerSolid,outline,transparent(outline));}
    }
    if(vertices.length/2>65535)throw new Error('Style box exceeds 16-bit indices');return finish();
}
Object.assign(api,{roundedStyleBox});
