import { Director, director, EffectAsset, EventMouse, Game, game, input, Input, Node, resources, UITransform } from 'cc';
import { GameAssets } from './Assets';
import { audioTransport, lifetime, pageRouter, Scope } from './Engine';
import { HomeMusic } from './AudioBehavior';
import { HomeClock } from './HomeClock';
import { ComicPage } from './ComicPage';
import { HomePage } from './HomePage';
import { HomeTravelBridge } from './HomeTravelBridge';
import { TravelService } from './TravelService';
import { TravelLoadingPanel } from './TravelLoadingPanel';
import { DEPARTURE_EFFECTS } from './HomeDepartureVisual';
import { DarkroomPage } from './DarkroomPage';
import { DARKROOM_EFFECTS } from './DarkroomLighting';
import { HOME_EFFECTS } from './HomeLighting';
import { LoadingPage } from './LoadingPage';
import { LoginPage } from './LoginPage';
import { nodeAt } from './Visual';

type Page = LoadingPage | LoginPage | ComicPage | HomePage | DarkroomPage;
type Prepared<T extends Page> = {page:T;scope:Scope};
export class Application {
    readonly assets = new GameAssets();
    private scope = lifetime();
    private page: Page;
    private current: Prepared<Page>;
    private loginPage: Prepared<LoginPage>;
    private root: Node;
    private height: number;
    private active = true;
    private intent = 0;
    private entering = false;
    private pendingScope: Scope;
    private router = pageRouter(this.scope);
    readonly clock=new HomeClock();
    private gestureSeen=false;
    private music:HomeMusic;
    private musicScope:Scope;
    private skipResumedClockFrame=false;
    private homePage:Prepared<HomePage>;
    private travel:HomeTravelBridge;
    private travelLoading:TravelLoadingPanel;
    private darkroomPage:Prepared<DarkroomPage>;
    private darkroomLoading:Promise<Prepared<DarkroomPage>>;
    private darkroomError='';private routeWaitAge=0;
    private transitioning:Page;
    constructor(canvas: Node) {
        const size = canvas.getComponent(UITransform).contentSize;
        this.height = size.height;
        this.root = nodeAt(canvas, 'LittleSteps', -size.width / 2, -size.height / 2, size.width, size.height);
        const hide=()=>{this.active=false;this.interactive(false);console.info('[LittleSteps] application suspended '+JSON.stringify(this.music?this.music.snapshot():{}));};
        const show=()=>{this.active=true;this.skipResumedClockFrame=true;this.interactive(true);console.info('[LittleSteps] application resumed '+JSON.stringify(this.music?this.music.snapshot():{}));};
        game.on(Game.EVENT_HIDE,hide);game.on(Game.EVENT_SHOW,show);
        const gesture=()=>{this.gestureSeen=true;if(this.music)this.music.notifyGesture();};
        const mouse=(event:EventMouse)=>{if(event.getButton()===EventMouse.BUTTON_LEFT)gesture();};
        input.on(Input.EventType.TOUCH_START,gesture);input.on(Input.EventType.MOUSE_DOWN,mouse);input.on(Input.EventType.KEY_DOWN,gesture);
        this.scope.own(()=>{input.off(Input.EventType.TOUCH_START,gesture);input.off(Input.EventType.MOUSE_DOWN,mouse);input.off(Input.EventType.KEY_DOWN,gesture);game.off(Game.EVENT_HIDE,hide);game.off(Game.EVENT_SHOW,show);this.root.active=false;this.root.destroy();});
    }
    async start(route: 'login' | 'home' = 'login') {
        await this.assets.initialize(this.scope);
        if(route==='home')return this.directHome();
        const loadingScope=lifetime(this.scope);
        await this.assets.acquireGroups(['loading'],loadingScope);
        const loading=new LoadingPage(this.root,this.assets,loadingScope,this.height);
        this.current={page:loading,scope:loadingScope};this.page=loading;
        const launch=async()=>{
            loading.setStage('正在准备登录页面…');
            try{await this.login();}catch(error){if(this.scope.active){console.error('[LittleSteps] login prepare failed',error);loading.failure();}}
        };
        loading.onRetry=()=>{launch();};await launch();
    }
    private async login() {
        const scope=lifetime(this.scope);
        try {
            await this.assets.acquireGroups(['login'],scope);
            const effect=await scope.guard(new Promise<EffectAsset>((resolve,reject)=>resources.load('effects/login-peek',EffectAsset,(e,v)=>e?reject(e):resolve(v))));
            const page=new LoginPage(this.root,this.assets,scope,effect,this.height);page.root.active=false;
            const prepared={page,scope};this.loginPage=prepared;
            page.onEnter=()=>{this.openComic();};page.onCancel=()=>this.cancelEntry();
            if(!await this.present(prepared,.28))return;
            page.resume();console.info('[LittleSteps] PAGE_READY LOGIN');
        } catch(error) {scope.dispose();throw error;}
    }
    private frame(scope: Scope) {return scope.guard(new Promise<void>(resolve=>director.once(Director.EVENT_AFTER_UPDATE,()=>resolve())));}
    private async openComic() {
        if(this.entering||!this.active||this.current!==this.loginPage)return;
        this.entering=true;const intent=++this.intent,scope=lifetime(this.scope);this.pendingScope=scope;
        try {
            await this.assets.acquireGroups(['comic'],scope);
            while(scope.active&&(!this.loginPage.page.ready||!this.active))await this.frame(scope);
            if(intent!==this.intent||!scope.active)return;
            const page=new ComicPage(this.root,this.assets,scope,this.height,this.gestureSeen);page.root.active=false;
            page.onEnter=()=>{this.openHome(page);};page.onRetry=()=>{this.openHome(page);};page.onCancel=()=>{this.returnLogin();};
            if(!await this.present({page,scope},.42,true))return;
            this.pendingScope=null;this.entering=false;page.start();console.info('[LittleSteps] PAGE_READY COMIC');
        } catch(error) {
            scope.dispose();if(intent===this.intent&&this.scope.active){this.entering=false;this.loginPage.page.resetIntent('开场准备失败，请再点一次。');console.error('[LittleSteps] comic prepare failed',error);}
        }
    }
    private cancelEntry() {
        if(this.current!==this.loginPage)return;
        this.intent++;this.entering=false;this.router.cancel();if(this.pendingScope)this.pendingScope.dispose();this.pendingScope=null;
        this.loginPage.page.resetIntent();console.info('[LittleSteps] comic entry cancelled');
    }
    private async returnLogin() {
        if(!this.active)return;
        this.intent++;this.entering=false;this.router.cancel();if(this.pendingScope)this.pendingScope.dispose();this.pendingScope=null;
        const retained=this.loginPage;this.loginPage=null;
        try {await this.login();if(retained&&retained.scope.active)retained.scope.dispose();}catch(error){console.error('[LittleSteps] return login failed',error);}
    }
    private async openHome(from: ComicPage) {
        if(this.entering||!this.active||this.page!==from)return;
        this.entering=true;const intent=++this.intent,scope=lifetime(this.scope);this.pendingScope=scope;
        try {
            await this.assets.acquireGroups(['home'],scope);
            await this.assets.acquireEffects(HOME_EFFECTS,scope);
            while(scope.active&&!this.active)await this.frame(scope);
            if(intent!==this.intent||!scope.active)return;
            const page=await HomePage.create(this.root,this.assets,scope,this.height,()=>this.gestureSeen,this.clock,()=>this.music);page.root.active=false;
            const preparedMusic=await this.prepareMusic(scope);
            if(intent!==this.intent||!scope.active)return;
            if(!await this.present({page,scope},.52))return;
            page.resume();this.adoptMusic(preparedMusic);
            this.bindHome({page,scope});
            this.entering=false;this.pendingScope=null;if(this.loginPage){this.loginPage.scope.dispose();this.loginPage=null;}
            console.info('[LittleSteps] PAGE_READY HOME; full Home product parity pending');
        } catch(error) {scope.dispose();if(intent===this.intent&&this.scope.active){this.entering=false;from.fail(String(error));console.error('[LittleSteps] Home prepare failed',error);}}
    }
    private async directHome() {
        const scope=lifetime(this.scope);await this.assets.acquireGroups(['home'],scope);
        await this.assets.acquireEffects(HOME_EFFECTS,scope);
        const preparedMusic=await this.prepareMusic(scope);
        const page=await HomePage.create(this.root,this.assets,scope,this.height,()=>this.gestureSeen,this.clock,()=>this.music);this.current={page,scope};this.page=page;page.root.active=true;page.resume();this.adoptMusic(preparedMusic);this.bindHome({page,scope});
        director.once(Director.EVENT_AFTER_DRAW,()=>{if(scope.active)console.info('[LittleSteps] Home first draw');});
    }
    private async present(next: Prepared<Page>,duration:number,retainLogin=false) {
        const previous=this.current;
        this.transitioning=next.page;
        const succeeded=await this.router.show(next.page.root,duration,()=>this.active);
        this.transitioning=null;
        if(!succeeded){if(next.scope!==this.homePage?.scope&&next.scope!==this.darkroomPage?.scope)next.scope.dispose();return false;}
        if(previous){
            if(previous.page instanceof LoginPage||previous.page instanceof ComicPage||previous.page instanceof HomePage||previous.page instanceof DarkroomPage)previous.page.pause();
            previous.page.root.active=false;
            if(!(retainLogin&&previous===this.loginPage)&&previous.scope!==this.homePage?.scope&&previous.scope!==this.darkroomPage?.scope)previous.scope.dispose();
        }
        this.current=next;this.page=next.page;return true;
    }
    private bindHome(prepared:Prepared<HomePage>){
        this.homePage=prepared;prepared.page.onPrepareDarkroom=()=>{if(this.page===prepared.page&&this.active)this.prepareDarkroom();};
        prepared.page.onDarkroomRequest=()=>{if(this.entering||!this.active||this.page!==prepared.page)return false;this.openDarkroom();return true;};
        prepared.page.onCancelDarkroom=()=>this.cancelDarkroomEntry();
        const home=prepared.page,owner=prepared.scope,service=new TravelService();
        service.model.content=this.assets.json('res://travel/travel_content.json');
        const canInteract=()=>this.active&&!this.entering&&this.page===home&&home.acceptsTravelInput;
        const loading=new TravelLoadingPanel(home.root,this.assets,owner,this.height,()=>this.active&&this.page===home);
        const bridge=new HomeTravelBridge(service,{
            canInteract,noticeAvailable:()=>canInteract()&&home.acceptsTravelNotice,
            merit:()=>home.merit.count,fatigue:()=>home.rig.behavior.director.fatigue,
            setMerit:value=>home.setTravelMerit(value),syncTravel:(away,full,departing)=>home.syncTravelState(away,full,departing),
            prepare:async scope=>{await this.assets.acquireGroups(['departure_visual'],scope);await this.assets.acquireEffects(DEPARTURE_EFFECTS,scope);},
            showLoading:()=>{home.setTravelLoading(true);loading.show();},
            hideLoading:()=>{loading.hide();home.setTravelLoading(false);},
            loadingFailed:error=>{loading.failure();console.error('[LittleSteps] departure resources failed',error);},
            restoreOffer:()=>home.restoreTravelOffer(),begin:(scope,text)=>home.beginDeparture(scope,text),finish:()=>home.finishDeparture(),
            info:text=>home.note.info(text,'res://travel/assets/travel_ui.ttf'),
            openExisting:mode=>this.openTravelPage(mode),
            visualFailed:error=>console.error('[LittleSteps] saved trip retained after departure visual failure',error),
        },owner);
        this.travel=bridge;this.travelLoading=loading;
        home.onTravelRequest=()=>bridge.flow.request();home.onMeritChanged=value=>bridge.observeMerit(value);home.onDepartureFinished=()=>bridge.flow.finish();
        loading.onCancel=()=>bridge.flow.cancelLoading();loading.onRetry=()=>bridge.flow.request();
        bridge.configure();
        owner.own(()=>{home.onTravelRequest=null;home.onMeritChanged=()=>{};home.onDepartureFinished=()=>{};if(this.travel===bridge){this.travel=null;this.travelLoading=null;}});
    }
    private openTravelPage(mode:'comic'|'rewards'){
        // Travel page/prop migration is tracked separately in M07; do not
        // consume a reward or invent an inventory UI before that view exists.
        console.info('[LittleSteps] pending Travel page binding '+mode);
    }
    private prepareDarkroom(){
        if(this.darkroomPage?.scope.active)return Promise.resolve(this.darkroomPage);
        if(this.darkroomLoading)return this.darkroomLoading;
        const scope=lifetime(this.scope);this.darkroomError='';
        const request=(async()=>{
            try{await this.assets.acquireGroups(['darkroom'],scope);await this.assets.acquireEffects(DARKROOM_EFFECTS,scope);
                const page=await DarkroomPage.create(this.root,this.assets,scope,this.height,this.clock),prepared={page,scope};
                if(!scope.active)throw new Error('Darkroom preparation cancelled');page.onBack=()=>this.returnHome();page.onFinished=result=>console.info('[LittleSteps] Darkroom completed '+JSON.stringify(result));
                this.darkroomPage=prepared;console.info('[LittleSteps] Darkroom resources ready '+JSON.stringify(this.assets.snapshot()));return prepared;
            }catch(error){scope.dispose();if(this.scope.active){this.darkroomError=String(error);console.error('[LittleSteps] Darkroom preparation failed',error);}throw error;}
            finally{this.darkroomLoading=null;}
        })();this.darkroomLoading=request;request.catch(()=>{});return request;
    }
    private async openDarkroom(){
        if(this.entering||!this.active||this.page!==this.homePage?.page)return;
        this.entering=true;this.routeWaitAge=0;const intent=++this.intent;this.homePage.page.showRouteWaiting();
        try{const prepared=await this.prepareDarkroom();while(this.scope.active&&!this.active)await this.frame(this.scope);
            if(intent!==this.intent||!this.scope.active||this.page!==this.homePage.page)return;
            this.homePage.page.setInput(false);prepared.page.resume(false);
            if(!await this.present(prepared,.42)){prepared.page.pause();if(intent===this.intent){this.entering=false;this.homePage.page.clearRouteWaiting();this.homePage.page.resume();}return;}
            if(intent!==this.intent)return;this.entering=false;prepared.page.resume();console.info('[LittleSteps] PAGE_READY DARKROOM '+JSON.stringify(prepared.page.snapshot()));
        }catch(error){if(intent===this.intent&&this.scope.active){this.entering=false;this.homePage.page.resume();this.homePage.page.showRouteError();console.error('[LittleSteps] Darkroom entry failed',error);}}
    }
    private cancelDarkroomEntry(){
        if(!this.entering||this.page!==this.homePage?.page)return;this.intent++;this.entering=false;this.router.cancel();this.homePage.page.clearRouteWaiting();this.homePage.page.resume();
        console.info('[LittleSteps] Darkroom entry cancelled; optional preparation retained');
    }
    private async returnHome(){
        if(this.entering||!this.active||this.page!==this.darkroomPage?.page)return;
        this.entering=true;const intent=++this.intent;this.darkroomPage.page.round.inputEnabled=false;this.darkroomPage.page.round.cancel();
        try{this.homePage.page.clearRouteWaiting();this.homePage.page.resume(false);const succeeded=await this.present(this.homePage,.42);if(intent!==this.intent)return;this.entering=false;if(succeeded){this.homePage.page.resume();console.info('[LittleSteps] PAGE_READY HOME cached=true');}else this.darkroomPage.page.resume();}
        catch(error){if(this.scope.active){this.entering=false;this.darkroomPage.page.resume();console.error('[LittleSteps] Home return failed',error);}}
    }
    private async prepareMusic(owner:Scope):Promise<{music:HomeMusic;scope:Scope}> {
        if(this.music)return {music:this.music,scope:this.musicScope};
        const scope=lifetime(this.scope),paths=['res://home/audio/tracks/day_harp_mouse.mp3','res://home/audio/tracks/night_peaceful_mind.mp3'];
        owner.own(()=>{if(this.musicScope!==scope)scope.dispose();});
        try {
            await this.assets.acquireResources(paths,scope);
            const players=['DayMusic','NightMusic'].map(name=>audioTransport().player(this.root,scope,name,(event:string,state:any)=>console.info('[LittleSteps] music '+event+' '+JSON.stringify(state))));
            const music=new HomeMusic(players,paths.map(path=>this.assets.audio(path)),this.gestureSeen);scope.own(()=>music.dispose());
            return {music,scope};
        }catch(error){scope.dispose();throw error;}
    }
    private adoptMusic(prepared:{music:HomeMusic;scope:Scope}) {
        this.music=prepared.music;this.musicScope=prepared.scope;
        this.music.setNightMix(this.clock.nightMix());this.music.setActive(this.active&&(this.page instanceof HomePage||this.page instanceof DarkroomPage));
        console.info('[LittleSteps] music ready '+JSON.stringify(this.music.snapshot()));
    }
    private interactive(active:boolean) {if(!active)this.travel?.suspend();if(this.page instanceof DarkroomPage){if(active)this.page.restore(!this.transitioning);else this.page.suspend();}else if(this.page instanceof LoginPage||this.page instanceof ComicPage||this.page instanceof HomePage){if(active){if(this.page instanceof HomePage)this.page.resume(!this.transitioning);else this.page.resume();}else this.page.pause();}if(this.transitioning&&this.transitioning!==this.page&&(this.transitioning instanceof HomePage||this.transitioning instanceof DarkroomPage)){if(this.transitioning instanceof DarkroomPage){if(active)this.transitioning.restore(false);else this.transitioning.suspend();}else if(active)this.transitioning.resume(false);else this.transitioning.pause();}if(this.music)this.music.setActive(active&&(this.page instanceof HomePage||this.page instanceof DarkroomPage));if(active)this.travel?.resume();}
    advance(delta:number) {
        if(!this.scope.active)return;this.router.advance(delta,this.active);
        if(this.active&&(this.page instanceof HomePage||this.page instanceof DarkroomPage)){if(this.skipResumedClockFrame)this.skipResumedClockFrame=false;else this.clock.advance(delta);if(this.music){this.music.setNightMix(this.clock.nightMix());this.music.advance(delta);}}
        if(this.active){this.travel?.advance(delta);if(this.page===this.homePage?.page)this.travelLoading?.advance(delta);}
        if(this.active&&this.page)this.page.advance(delta);
        if(this.active&&this.transitioning&&this.transitioning!==this.page&&(this.transitioning instanceof HomePage||this.transitioning instanceof DarkroomPage))this.transitioning.advance(delta);
        if(this.active&&this.entering&&this.page===this.homePage?.page&&!this.transitioning){this.routeWaitAge+=delta;this.homePage.page.note.updateWaiting('暗室加载中'+'.'.repeat(1+Math.floor(this.routeWaitAge/.52)%3));}
    }
    dispose() {this.intent++;this.scope.dispose();}
}
