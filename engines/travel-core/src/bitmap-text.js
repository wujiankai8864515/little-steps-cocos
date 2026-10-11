// Consume native shaped glyph runs. Shaping, prose, font choice and atlas loading
// belong to the producer. Geometry contains no game-specific strings or assets.
// Alignment/raster origins follow Godot 4.5.2 Label and TextServerAdvanced;
// upstream MIT notice is retained by the plugin distribution.
function shapedInkLineMesh(table,run,rect,density=1){
    if(!run||!table||!table.glyphs[String(density)]||rect.length!==4||!rect.every(Number.isFinite)||!Number.isFinite(run.width)||run.glyphs.length>4096)throw new Error('Invalid shaped text input');
    const source=[],vertices=[],indices=[],glyphs=table.glyphs[String(density)];
    const start=Math.round(rect[0])+Math.trunc(Math.trunc(rect[2]-run.width)/2);
    // A GUI Control snaps its own translated origin before font_draw_glyph
    // floors the glyph-local origin. Combining those two steps loses 1 px.
    const localBaseline=(rect[3]-table.height)/2+table.ascent;
    const controlY=Math.round(rect[1]+(rect[3]-run.ink[0]-run.ink[1])/2-localBaseline);
    const baseline=controlY+Math.trunc((rect[3]-table.height)/2)+table.ascent;
    for(const item of run.glyphs){
        const variants=glyphs[String(item[0])];if(!variants||![1,2,4].includes(variants.length))throw new Error('Missing shaped glyph');
        let x=start+item[1],y=baseline+item[2];
        const subdivisions=variants.length,bias=subdivisions>1?.5/subdivisions:0;
        const variant=subdivisions>1?((Math.floor(subdivisions*(x+bias))-subdivisions*Math.floor(x+bias))%subdivisions+subdivisions)%subdivisions:0,g=variants[variant];
        if(density===1){x=Math.floor(x+bias);y=Math.floor(y);}
        const [u,v,w,h]=g.rect;if(!w||!h)continue;x+=g.offset[0];y+=g.offset[1];const right=x+g.size[0],bottom=y+g.size[1],base=vertices.length/2;
        source.push(u,v,u+w,v,u+w,v+h,u,v+h);vertices.push(x,y,right,y,right,bottom,x,bottom);indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    return {source:new Float32Array(source),vertices:new Float32Array(vertices),indices:new Uint16Array(indices)};
}
Object.assign(api,{shapedInkLineMesh});
