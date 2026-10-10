import { Director, director, EffectAsset, Game, game, Node, resources, UITransform } from 'cc';
import { GameAssets } from './Assets';
import { lifetime, pageRouter, Scope } from './Engine';
import { ComicPage } from './ComicPage';
import { HomePage } from './HomePage';
import { LoadingPage } from './LoadingPage';
import { LoginPage } from './LoginPage';
import { nodeAt } from './Visual';

type Page = LoadingPage | LoginPage | ComicPage | HomePage;
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
    constructor(canvas: Node) {
        const size = canvas.getComponent(UITransform).contentSize;
        this.height = size.height;
        this.root = nodeAt(canvas, 'LittleSteps', -size.width / 2, -size.height / 2, size.width, size.height);
        const hide=()=>{this.active=false;this.interactive(false);console.info('[LittleSteps] application suspended');};
        const show=()=>{this.active=true;this.interactive(true);console.info('[LittleSteps] application resumed');};
        game.on(Game.EVENT_HIDE,hide);game.on(Game.EVENT_SHOW,show);
        this.scope.own(()=>{game.off(Game.EVENT_HIDE,hide);game.off(Game.EVENT_SHOW,show);this.root.active=false;this.root.destroy();});
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
            const page=new ComicPage(this.root,this.assets,scope,this.height);page.root.active=false;
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
            while(scope.active&&!this.active)await this.frame(scope);
            if(intent!==this.intent||!scope.active)return;
            const page=new HomePage(this.root,this.assets,scope,this.height);page.root.active=false;
            if(!await this.present({page,scope},.52))return;
            this.entering=false;this.pendingScope=null;if(this.loginPage){this.loginPage.scope.dispose();this.loginPage=null;}
            console.info('[LittleSteps] PAGE_READY HOME; full Home product parity pending');
        } catch(error) {scope.dispose();if(intent===this.intent&&this.scope.active){this.entering=false;from.fail(String(error));console.error('[LittleSteps] Home prepare failed',error);}}
    }
    private async directHome() {
        const scope=lifetime(this.scope);await this.assets.acquireGroups(['home'],scope);
        const page=new HomePage(this.root,this.assets,scope,this.height);this.current={page,scope};this.page=page;
        director.once(Director.EVENT_AFTER_DRAW,()=>{if(scope.active)console.info('[LittleSteps] Home first draw');});
    }
    private async present(next: Prepared<Page>,duration:number,retainLogin=false) {
        const previous=this.current;
        const succeeded=await this.router.show(next.page.root,duration,()=>this.active);
        if(!succeeded){next.scope.dispose();return false;}
        if(previous){
            if(previous.page instanceof LoginPage||previous.page instanceof ComicPage)previous.page.pause();
            previous.page.root.active=false;
            if(!(retainLogin&&previous===this.loginPage))previous.scope.dispose();
        }
        this.current=next;this.page=next.page;return true;
    }
    private interactive(active:boolean) {if(this.page instanceof LoginPage||this.page instanceof ComicPage){if(active)this.page.resume();else this.page.pause();}}
    advance(delta:number) {if(!this.scope.active)return;this.router.advance(delta,this.active);if(this.active&&this.page)this.page.advance(delta);}
    dispose() {this.intent++;this.scope.dispose();}
}
