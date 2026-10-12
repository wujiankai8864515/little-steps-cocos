import { Game, game, sys } from 'cc';
import type { Scope } from './Engine';

export type HapticKind = 'light' | 'heavy' | 'long';
type HapticPort = { supported(): boolean; pulse(kind: HapticKind): void };
const KEY = 'little-steps:haptics:v1';

// Feedback is optional: device/setting failures never affect game outcomes.
export class HapticFeedback {
    private enabled = true;
    private active = true;
    private last = -Infinity;
    private lastLong = -Infinity;
    constructor(private port: HapticPort, private storage: {getItem(key:string):string;setItem(key:string,value:string):void}, private now = () => Date.now()) {
        try {this.enabled = storage.getItem(KEY) !== 'off';} catch (_) {}
    }
    get available() {try {return !!this.port?.supported();} catch (_) {return false;}}
    get isEnabled() {return this.enabled;}
    setEnabled(value:boolean) {this.enabled=value;try {this.storage.setItem(KEY,value?'on':'off');} catch (_) {}}
    setActive(value:boolean) {this.active=value;}
    pulse(kind:HapticKind) {
        if(!this.active||!this.enabled||!this.available)return false;
        const time=this.now();
        if(!Number.isFinite(time)||time-this.last<50||(kind==='long'&&time-this.lastLong<2000))return false;
        this.last=time;if(kind==='long')this.lastLong=time;
        try {this.port.pulse(kind);return true;} catch (_) {return false;}
    }
}

let current:HapticFeedback;
export function haptics() {
    return current||(current=new HapticFeedback((globalThis as any).LittleStepsPlatform?.haptics,sys.localStorage));
}
export function bindHaptics(owner:Scope) {
    const feedback=haptics(),hide=()=>feedback.setActive(false),show=()=>feedback.setActive(true);
    game.on(Game.EVENT_HIDE,hide);game.on(Game.EVENT_SHOW,show);
    owner.own(()=>{feedback.setActive(false);game.off(Game.EVENT_HIDE,hide);game.off(Game.EVENT_SHOW,show);if(current===feedback)current=undefined;});
}
