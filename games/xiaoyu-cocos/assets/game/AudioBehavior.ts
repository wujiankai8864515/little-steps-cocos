// Product playback rules ported from opening_story_audio.gd and home_music.gd.
// A transport exposes actual Cocos events separately from these requested counts.
export interface AudioPort {
    assign(clip:any,loop?:boolean):void; play():boolean; stop():boolean; pause():boolean;
    gain(value:number):void; readonly playing:boolean; snapshot():any; dispose():void;
}
export class ComicAudio {
    private revealed = new Set<number>();
    active = false;
    private paused = false;
    playCount = 0;
    stopCount = 0;
    constructor(private players:AudioPort[],private sounds:Record<string,any>,private gesture:boolean) {
        players.forEach(p=>p.gain(Math.pow(10,-8/20)));
    }
    setActive(value:boolean) {if(this.active===value)return;this.active=value;if(!value)this.stopAll();}
    setPaused(value:boolean) {this.paused=value;if(value)this.stopAll();}
    reveal(index:number) {
        if(this.revealed.has(index))return;
        this.revealed.add(index);
        if(!this.active||this.paused||!this.gesture)return;
        this.play(0,'puff');if(index===1)this.play(1,'drink');else if(index===2)this.play(1,'joy');
    }
    private play(slot:number,key:string) {
        if(!this.sounds[key])return;
        const player=this.players[slot];player.assign(this.sounds[key]);if(player.play())this.playCount++;
    }
    stopAll() {this.players.forEach(p=>{if(p.playing)this.stopCount++;p.stop();});}
    dispose() {this.setActive(false);this.stopAll();this.players.forEach(p=>p.dispose());}
    snapshot() {return {players:this.players.map(p=>p.snapshot()),requestedPlayCount:this.playCount,stopCount:this.stopCount,revealedOnce:Array.from(this.revealed),gestureSeen:this.gesture,active:this.active,paused:this.paused};}
}
export class HomeMusic {
    private gesture=false;
    private active=false;
    private enabled=true;
    private disposed=false;
    private started=false;
    private streamsPaused=false;
    private target=0;
    private mix=0;
    private envelope=0;
    private starts=0;
    private pauses=0;
    private resumes=0;
    private stops=0;
    constructor(private players:AudioPort[],clips:any[],gestureSeen=false) {
        players.forEach((p,i)=>p.assign(clips[i],true));this.gesture=gestureSeen;this.gains();
    }
    notifyGesture() {if(this.disposed)return;this.gesture=true;this.sync();}
    setActive(value:boolean) {if(this.disposed||this.active===value)return;this.active=value;this.sync();}
    setEnabled(value:boolean) {if(this.disposed||this.enabled===value)return;this.enabled=value;this.sync();}
    isEnabled() {return this.enabled&&!this.disposed;}
    setNightMix(value:number) {if(this.disposed||!Number.isFinite(value))return;this.target=Math.max(0,Math.min(1,value));if(!this.started){this.mix=this.target;this.gains();}}
    private canPlay() {return !this.disposed&&this.gesture&&this.active&&this.enabled;}
    private sync() {
        if(!this.canPlay()) {
            this.envelope=0;this.gains();
            if(this.started&&!this.streamsPaused){this.players.forEach(p=>{if(p.pause())this.pauses++;});this.streamsPaused=true;}
            return;
        }
        if(!this.started){this.mix=this.target;this.envelope=0;this.gains();this.players.forEach(p=>p.play());this.started=true;this.starts++;}
        else if(this.streamsPaused){this.players.forEach(p=>{if(p.play())this.resumes++;});this.streamsPaused=false;}
    }
    advance(delta:number) {
        if(!this.canPlay()||!Number.isFinite(delta)||delta<=0)return;
        const step=Math.min(delta,.1),direction=this.target-this.mix;
        this.mix+=Math.sign(direction)*Math.min(Math.abs(direction),step/4);
        this.envelope=Math.min(1,this.envelope+step/.8);this.gains();
    }
    private gains() {const weight=this.mix*this.mix*(3-2*this.mix),ceiling=Math.pow(10,-24/20)*this.envelope;this.players[0].gain(ceiling*(1-weight));this.players[1].gain(ceiling*weight);}
    dispose() {if(this.disposed)return;this.disposed=true;this.active=false;this.envelope=0;this.gains();this.players.forEach(p=>{p.dispose();this.stops++;});this.started=false;}
    snapshot() {return {gestureSeen:this.gesture,pageActive:this.active,enabled:this.enabled,disposed:this.disposed,started:this.started,canPlay:this.canPlay(),targetMix:this.target,mix:this.mix,envelope:this.envelope,startCount:this.starts,pauseWrites:this.pauses,resumeWrites:this.resumes,stopCount:this.stops,players:this.players.map(p=>p.snapshot())};}
}
