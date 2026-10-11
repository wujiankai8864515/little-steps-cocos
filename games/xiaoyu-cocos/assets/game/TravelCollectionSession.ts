// Collection browsing is a read-only projection of durable travel rewards.
export class TravelCollectionSession {
    items:any[]=[];index=0;page=0;archives=0;private signature='';
    sync(inventory:any[],archives:number){
        const signature=JSON.stringify([inventory,archives]);if(signature===this.signature)return false;
        const uid=this.items[this.index]?.uid;this.signature=signature;this.items=JSON.parse(JSON.stringify(inventory));this.archives=archives;
        const found=uid?this.items.findIndex(i=>i.uid===uid):-1;this.index=found>=0?found:Math.max(0,Math.min(this.index,this.items.length-1));
        this.page=Math.min(this.page,this.pageCount-1);return true;
    }
    get item(){return this.items[this.index];}
    get pageCount(){return Math.max(1,Math.ceil(this.items.length/4));}
    get visible(){return this.items.slice(this.page*4,this.page*4+4).map((item,i)=>({item,index:this.page*4+i}));}
    select(index:number){if(!Number.isInteger(index)||!this.items.length)return false;const next=Math.max(0,Math.min(index,this.items.length-1));if(next===this.index)return false;this.index=next;return true;}
    movePage(delta:number){if(!Number.isInteger(delta))return false;const next=Math.max(0,Math.min(this.page+delta,this.pageCount-1));if(next===this.page)return false;this.page=next;return true;}
}
