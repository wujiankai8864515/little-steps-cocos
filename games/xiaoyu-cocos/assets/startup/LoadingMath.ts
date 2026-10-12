// Loading owns this tiny affine implementation; no gameplay/framework imports.
export const loadingMath = {
    identity:()=>[1,0,0,1,0,0],
    trs:(p=[0,0],r=0,s=[1,1])=>{const c=Math.cos(r),v=Math.sin(r);return [c*s[0],v*s[0],-v*s[1],c*s[1],p[0],p[1]];},
    multiply:(a:number[],b:number[])=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]],
    transform:(m:number[],x:number,y:number)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]],
};
