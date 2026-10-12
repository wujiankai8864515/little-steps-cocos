// Shared by loading, login and the photo wall. Interpolate a small colour grid
// once on admission; no full-screen PNG, canvas API or per-frame CPU work.
export interface PaperRecipe {size:number[];grid:number[];colors:number[];grain:number;}
export function paperPixels(recipe:PaperRecipe) {
    const [width,height]=recipe.size,[columns,rows]=recipe.grid;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>128*288||columns<2||rows<2||recipe.colors.length!==columns*rows*3)throw new Error('Invalid paper recipe');
    const data=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const gx=x/(width-1)*(columns-1),gy=y/(height-1)*(rows-1),ix=Math.min(columns-2,Math.floor(gx)),iy=Math.min(rows-2,Math.floor(gy)),u=gx-ix,v=gy-iy;
        const noise=(((Math.imul(x+17,73856093)^Math.imul(y+31,19349663))>>>0)%1024/1023-.5)*recipe.grain;
        for(let c=0;c<3;c++){const a=(iy*columns+ix)*3+c,b=a+columns*3;
            data[(y*width+x)*4+c]=Math.round((recipe.colors[a]*(1-u)+recipe.colors[a+3]*u)*(1-v)+(recipe.colors[b]*(1-u)+recipe.colors[b+3]*u)*v+noise);}
        data[(y*width+x)*4+3]=255;
    }
    return data;
}
