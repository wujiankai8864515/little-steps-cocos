import { _decorator, assetManager, Component, Director, director, Game, game, profiler, ResolutionPolicy, UITransform, view } from 'cc';
import { LoadingAssets } from './startup/LoadingAssets';
import { LoadingView } from './startup/LoadingView';
const { ccclass } = _decorator;

@ccclass('Boot')
export class Boot extends Component {
    private application:any;
    private loading:LoadingView;
    private assets=new LoadingAssets();
    private alive=true;
    private active=true;
    private busy=false;
    private firstDrawReject:()=>void;
    private hide=()=>{this.active=false;this.loading?.cancel();};
    private show=()=>{this.active=true;this.resize();};
    private resize=()=>this.loading?.resize(this.node.getComponent(UITransform).height);
    async start() {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
        profiler.hideStats();
        game.on(Game.EVENT_HIDE,this.hide);game.on(Game.EVENT_SHOW,this.show);this.node.on('size-changed',this.resize);
        try {
            await this.assets.load();if(!this.alive)return;
            this.loading=new LoadingView(this.node,this.assets,this.node.getComponent(UITransform).height);
            this.loading.onRetry=()=>this.launch();
            await this.afterDraw();if(!this.alive)return;
            console.info('[LittleSteps] COMPLETE_LOADING_FIRST_DRAW');
            await this.launch();
        } catch(error) {if(this.alive)console.error('[LittleSteps] loading startup failed',error);}
    }
    private afterDraw(){return new Promise<void>((resolve,reject)=>{const done=()=>{this.firstDrawReject=null;resolve();};this.firstDrawReject=()=>{director.off(Director.EVENT_AFTER_DRAW,done);reject(new Error('Boot destroyed'));};director.once(Director.EVENT_AFTER_DRAW,done);});}
    private loadBundle(name:string){return new Promise<void>((resolve,reject)=>assetManager.loadBundle(name,(error)=>error?reject(error):resolve()));}
    private async launch(){
        if(!this.alive||this.busy)return;this.busy=true;
        try {
            this.loading.setStage('正在准备游戏…',.08);
            await this.loadBundle('framework_code');if(!this.alive)return;
            (globalThis as any).LittleStepsLoadPlatform?.();
            (globalThis as any).LittleStepsPlatform?.installFramework?.();
            const data=(globalThis as any).LittleStepsPlatform?.runtimeDataBundle;
            if(data)await this.loadBundle(data);if(!this.alive)return;
            this.loading.setStage('正在准备游戏…',.4);
            await this.loadBundle('gameplay_code');if(!this.alive)return;
            const runtime=(globalThis as any).LittleStepsRuntime;if(!runtime?.create)throw new Error('Game runtime registration missing');
            this.application=runtime.create(this.node);this.loading.setStage('正在准备登录页面…',.7);
            await this.application.startFromBoot();if(!this.alive)return;
            await this.afterDraw();if(!this.alive)return;
            this.loading.dispose();this.loading=null;this.assets.dispose();
        } catch(error) {
            this.application?.dispose();this.application=null;
            if(this.alive){this.loading.failure();console.error('[LittleSteps] game startup failed',error);}
        } finally {this.busy=false;}
    }
    update(deltaTime: number) {
        if(this.active)this.loading?.advance(deltaTime);
        this.application?.advance(deltaTime);
    }
    onDestroy() {this.alive=false;this.firstDrawReject?.();this.firstDrawReject=null;game.off(Game.EVENT_HIDE,this.hide);game.off(Game.EVENT_SHOW,this.show);this.node.off('size-changed',this.resize);this.application?.dispose();this.application=null;this.loading?.dispose();this.loading=null;this.assets.dispose();}
}

