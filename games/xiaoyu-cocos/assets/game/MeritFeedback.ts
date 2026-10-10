const ORIGINAL='res://assets/merit_reward_14.png',DIGITS='res://home/feedback/assets/merit_digits_thin_gold.png';
export const MERIT_TITLE=[411,274,449,241],MERIT_PLUS=[402,585,337,294],MERIT_ONE=[396,510,532,467];
export const MERIT_DIGITS=[[80,72,247,297],[478,58,220,331],[832,80,350,277],[1239,78,264,289],[1638,70,301,315],[53,446,279,297],[484,433,230,312],[889,434,225,322],[1273,450,223,294],[1663,449,237,300]];
const smooth=(a:number,b:number,value:number)=>{const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);};
export function meritLayout(amount:number) {
    amount=Math.max(0,Math.trunc(amount));if(!Number.isSafeInteger(amount))throw new Error('Invalid merit amount');
    const number=String(amount),glyphs=amount===1?[{region:MERIT_ONE,height:66,glyph:'+1',resource:ORIGINAL}]:[{region:MERIT_PLUS,height:41.7,glyph:'+',resource:ORIGINAL},...number.split('').map(d=>({region:MERIT_DIGITS[Number(d)],height:66,glyph:d,resource:DIGITS}))];
    const numberWidth=glyphs.reduce((sum,g)=>sum+g.region[2]/g.region[3]*g.height,0)+3.5*(glyphs.length-1),titleWidth=449/241*35.5,width=Math.max(numberWidth,titleWidth),scale=Math.min(1,174/width),height=103.5;
    const draws=[{region:MERIT_TITLE,resource:ORIGINAL,glyph:'功德',rect:[-titleWidth/2*scale,-height/2*scale,titleWidth*scale,35.5*scale]}];
    let x=-numberWidth/2;for(const g of glyphs){const w=g.region[2]/g.region[3]*g.height;draws.push({region:g.region,resource:g.resource,glyph:g.glyph,rect:[x*scale,(-height/2+37.5+(66-g.height)/2)*scale,w*scale,g.height*scale]});x+=w+3.5;}
    return {amount,scale,bounds:[-width/2*scale,-height/2*scale,width*scale,height*scale],draws};
}
export class SessionMerit {
    count=0;amount=1;age=-1;lastContact=0;
    award(contact:number,requested=1) {if(!Number.isSafeInteger(contact)||contact<=this.lastContact)return false;if(!Number.isFinite(requested))return false;const amount=Math.max(1,Math.trunc(requested));if(!Number.isSafeInteger(this.count+amount))return false;this.lastContact=contact;this.count+=amount;this.amount=amount;this.age=0;return true;}
    advance(delta:number){if(this.age<0||!Number.isFinite(delta)||delta<=0)return;this.age+=delta;if(this.age>=1.25)this.age=-1;}
    snapshot(){return {count:this.count,amount:this.amount,age:this.age,lastContact:this.lastContact,visible:this.age>=0,position:[346,612-45*Math.max(0,this.age)],alpha:this.age<0?0:smooth(0,.12,this.age)*(1-smooth(.7,1.25,this.age))};}
}
