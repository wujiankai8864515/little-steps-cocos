import { hasSkin, SkinId, UnlockPolicy, unlockPolicy, WardrobeStore } from './WardrobeStore';
export interface WardrobePorts {preview(id:SkinId):boolean;equip(id:SkinId,current:()=>boolean):Promise<boolean>;reward?:(id:SkinId)=>Promise<boolean>;}
// Policy and asynchronous callback ownership live with the game, not the UI
// framework. Local grants never synthesize advertisement completion.
export class WardrobeSession {
    selected:SkinId='original';active=false;busy=false;generation=0;message='';choices:string[]=[];readonly policy:UnlockPolicy;
    constructor(readonly store:WardrobeStore,readonly ports:WardrobePorts,policy='temporary_local'){this.policy=unlockPolicy(policy);}
    open(){this.generation++;this.active=true;this.busy=false;this.message='';this.choices=[];this.selected=this.store.worn;this.ports.preview(this.selected);}
    cancelPreview(){this.generation++;this.busy=false;this.selected=this.store.worn;this.ports.preview(this.selected);this.message='';this.choices=[];}
    close(){this.cancelPreview();this.active=false;}
    notice(message:string){this.message=message;this.choices=[];}
    select(id:string){if(!this.active||this.busy||!hasSkin(id))return false;this.generation++;this.selected=id;
        if(!this.ports.preview(id)){this.notice('这件衣服还没准备好。');return false;}
        const owned=this.store.unlocked.indexOf(id)>=0;
        this.message=owned?'要穿这身吗？':this.policy==='temporary_local'?'广告尚未接入，现在可直接解锁并保存。':'想试试桃花的新心情吗？';
        this.choices=[owned?'穿上':this.policy==='temporary_local'?'直接解锁':'看广告解锁','先不换'];return true;
    }
    async choose(index:number){if(!this.active||this.busy||!this.choices.length)return;if(index!==0){this.cancelPreview();return;}const id=this.selected,token=this.generation,current=()=>this.active&&token===this.generation;this.busy=true;
        try{if(this.store.unlocked.indexOf(id)>=0){const saved=await this.ports.equip(id,current);if(current())this.notice(saved?'这身很适合今天。':'这次没有保存好，先保留原来的衣服。请稍后重试。');}
            else if(this.policy==='temporary_local'){if(this.store.unlockTemporaryLocal(id)){this.busy=false;this.select(id);}else this.notice('这次没有保存好，先保留原来的衣服。请稍后重试。');}
            else if(!this.ports.reward)this.notice('广告暂时不可用。可以先试穿，原来的衣服会为你保留。');
            else {let completed=false;try{completed=(await this.ports.reward(id))===true;}catch(_){if(current())this.notice('广告暂时不可用。可以先试穿，原来的衣服会为你保留。');return;}if(!current())return;
                if(this.store.acceptVerifiedReward(id,completed)){this.busy=false;this.select(id);}else this.notice('这次还没解锁，先保留原来的衣服。');}
        }finally{if(current())this.busy=false;}
    }
    snapshot(){return {active:this.active,selected:this.selected,worn:this.store.worn,unlocked:this.store.unlocked,busy:this.busy,policy:this.policy,message:this.message,choices:this.choices.slice()};}
}
