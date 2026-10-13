import {
    _decorator, AudioSource, Color, Component, director, game, Graphics,
    HorizontalTextAlignment, instantiate, JsonAsset, Label, Node, Prefab,
    profiler, resources, sys, UITransform, VerticalTextAlignment,
} from 'cc';
import { GamePageUI } from '../base-card/GamePageUI';
import { CardLevelRepository } from '../base-card/CardLevelRepository';
import { AvgPlayer } from '../base-avg/AvgPlayer';
import { TaskScope } from '../../foundation/Tasks';
import { Runtime } from '../../foundation/Runtime';
import type { Action } from '../../foundation/Contracts';
import { NativeHotUpdate } from './NativeHotUpdate';
import { GameFlow, parseGameFlow } from './GameFlow';
import { CatalogConfig, parseCatalogConfig } from './CatalogConfig';
import { CatalogState, createCatalogMod, loadCatalogSave, saveCatalogState } from './CatalogMod';
import { CatalogUI } from './CatalogUI';

const { ccclass, executionOrder } = _decorator;
const CONTENT_TIMEOUT_MS = 30000;

/** The shell owns product progress; game modules still own their rules and JSON content. */
@ccclass('AppBootstrap')
@executionOrder(-10000)
export class AppBootstrap extends Component {
    private readonly lifetime = new TaskScope();
    private shell: Runtime | null = null;
    private screen: Node | null = null;
    private catalog: CatalogUI | null = null;
    private loading = false;
    private catalogReady = false;
    private flow!: GameFlow;
    private config!: CatalogConfig;
    private levels: string[] = [];
    private saveError: Error | null = null;

    protected onLoad(): void { profiler.hideStats(); }
    protected start(): void {
        void this.startWithUpdate().catch(error => {
            if (this.lifetime.cancelled) return;
            console.error('[Shell]', error); this.setMessage(error instanceof Error ? error.message : '启动失败，请重试');
        });
    }
    private async startWithUpdate(): Promise<void> {
        this.replaceScreen(this.loadingScreen());
        const updater = new NativeHotUpdate(this.lifetime);
        const result = await updater.run(text => this.setMessage(text));
        this.lifetime.check();
        if (result === 'restart') { game.restart(); return; }
        const [assets, flow, config, chapters] = await this.lifetime.run(() => Promise.all([
            this.loadLevels(), this.loadJson('config/game-flow').then(parseGameFlow),
            this.loadJson('config/catalog').then(parseCatalogConfig), this.loadJson('config/avg-chapters'),
        ]), CONTENT_TIMEOUT_MS);
        this.lifetime.check();
        this.levels = assets.map(a => a.json?.levelId as string).filter(id => typeof id === 'string')
            .sort((a,b) => a.localeCompare(b,undefined,{numeric:true}));
        if (!this.levels.length || new Set(this.levels).size !== this.levels.length) throw new Error('卡牌目录为空或重复');
        for (const [levelId,chapterId] of Object.entries(flow.afterWin)) {
            if (!this.levels.includes(levelId) || !chapters.chapters?.some((c: any) => c.id === chapterId)) throw new Error('卡牌剧情衔接引用不存在');
        }
        for (const story of config.stories) {
            if (!chapters.chapters?.some((c: any) => c.id === story.chapterId && c.bundle === story.bundle)) throw new Error('目录没有对应的既有剧情：'+story.title);
        }
        this.flow = flow; this.config = config;
        const saved = loadCatalogSave(sys.localStorage);
        this.shell = new Runtime([createCatalogMod(config,this.levels,saved,{
            save: state => {
                try { saveCatalogState(sys.localStorage,state); this.saveError=null; this.applyPreferences(state); }
                catch(error) { this.saveError=error instanceof Error?error:new Error(String(error)); console.error('[Catalog save]',error); }
            },
            render: state => { if(this.catalog?.isValid)this.catalog.render(state); },
        })],{config,levels:this.levels});
        await this.shell.open();
        await this.send({type:'shell.open'});
        await this.showLevelList();
        this.lifetime.check();
        if(this.catalogReady)updater.markHealthy();
    }
    public async showLevelList(): Promise<void> {
        if(!this.shell||this.lifetime.cancelled)return;
        const root=new Node('CatalogRoot');root.layer=this.node.layer;
        this.replaceScreen(root);
        const catalog=this.catalog=root.addComponent(CatalogUI);
        await this.lifetime.run(()=>catalog.open(this.config,this.levels,this.state(),{
            send: action => this.send(action),startCard:()=>this.openGame(),readStory:()=>this.openAvg(),
        }),CONTENT_TIMEOUT_MS);
        this.lifetime.check();this.catalogReady=true;
        if(this.saveError)this.setMessage(this.saveError.message);
    }
    private state(): Readonly<CatalogState> { return this.shell!.read<CatalogState>('base-shell'); }
    private async send(action: Action): Promise<void> {
        if(!this.shell||this.lifetime.cancelled)throw new Error('目录尚未就绪');
        const result=await this.shell.dispatch(action);
        this.lifetime.check();
        if(result.status!=='committed')throw new Error(result.reason??'操作未完成，请重试');
        if(this.saveError)throw this.saveError;
        if(result.presentation==='failed')throw new Error('界面显示失败，已保留当前进度');
    }
    private async returnToDetails(): Promise<void> {
        await this.send({type:'shell.page',payload:{page:'details'}});
        await this.showLevelList();
    }
    private async openGame(): Promise<void> {
        if(this.loading||this.lifetime.cancelled)return;
        this.loading=true;let roundId:number|null=null;
        let gameNode:Node|null=null;
        try {
            const levelId=this.state().selectedLevel;
            const [prefab] = await this.lifetime.run(()=>Promise.all([
                this.loadGamePrefab(),new CardLevelRepository().loadLevel(levelId),
            ]),CONTENT_TIMEOUT_MS);
            this.lifetime.check();
            gameNode=instantiate(prefab);
            const page=gameNode.getComponent(GamePageUI);
            if(!page)throw new Error('卡牌页面缺少 GamePageUI');
            await this.send({type:'shell.start'});
            const started=this.state();roundId=started.round!.id;const ownedRound=roundId;
            this.replaceScreen(gameNode);this.catalog=null;
            await this.lifetime.run(()=>page.open(levelId,()=>this.route(()=>this.returnToDetails()),()=>{
                const chapterId=this.flow.afterWin[levelId];
                if(chapterId)this.route(()=>this.openAvg(chapterId));
                else this.route(()=>this.returnToDetails());
            },{
                initialCoins:started.coins,economy:this.config.economy,
                checkpoint:async(state,action)=>{
                    await this.send({type:'shell.card',payload:{roundId:ownedRound,coins:state.session.coins,
                        complete:state.core.isComplete,played:action!=='card.open'}});
                },
            }),CONTENT_TIMEOUT_MS);
            this.lifetime.check();this.applyPreferences(this.state());
        } catch(error) {
            if(this.lifetime.cancelled)return;
            console.error('[Card entry]',error);
            if(roundId!==null && this.state().round?.id===roundId && this.state().round?.entryRefundable) {
                await this.send({type:'shell.abort',payload:{roundId}});
            }
            if(gameNode?.isValid && gameNode!==this.screen)gameNode.destroy();
            await this.showLevelList();this.setMessage(error instanceof Error?error.message:'进入关卡失败');
        } finally {this.loading=false;}
    }
    private async openAvg(chapterId?: string): Promise<void> {
        if(this.loading||this.lifetime.cancelled)return;
        this.loading=true;
        try {
            const state=this.state();
            const story=this.config.stories.find(s=>chapterId?s.chapterId===chapterId:s.id===state.selectedStory);
            if(!story)throw new Error('既有剧情不存在');
            if(state.selectedStory!==story.id)await this.send({type:'shell.story',payload:{id:story.id}});
            const progress=this.state().stories[story.id];
            const root=new Node('AvgPlayerRoot');root.layer=this.node.layer;root.addComponent(UITransform).setContentSize(1181,2556);
            const player=root.addComponent(AvgPlayer);this.replaceScreen(root);this.catalog=null;
            await this.lifetime.run(()=>player.open(()=>this.route(()=>this.returnToDetails()),story.chapterId,{
                snapshot:progress.snapshot,
                checkpoint:async(snapshot,avg,pageCount,choice)=>{
                    await this.send({type:'shell.avg',payload:{storyId:story.id,snapshot,pageIndex:avg.pageIndex,pageCount,finished:avg.finished,choice}});
                },
            }),CONTENT_TIMEOUT_MS);
            this.lifetime.check();this.applyPreferences(this.state());
        } catch(error) {
            if(this.lifetime.cancelled)return;
            console.error('[AVG entry]',error);
            await this.showLevelList();this.setMessage(error instanceof Error?error.message:'进入剧情失败');
        } finally {this.loading=false;}
    }
    /** Navigation continuations belong to the shell lifetime, with visible failure reporting. */
    private route(work:()=>Promise<void>):void {
        void work().catch(error=>{if(!this.lifetime.cancelled){console.error('[Route]',error);this.setMessage(String(error));}});
    }
    private applyPreferences(state:Readonly<CatalogState>):void {
        const scene=director.getScene();if(!scene)return;
        for(const source of scene.getComponentsInChildren(AudioSource)) {
            const music=/music|bgm/i.test(source.node.name);
            source.volume=(music?state.settings.music:state.settings.sound)?1:0;
        }
    }
    private loadLevels():Promise<JsonAsset[]> {
        return new Promise((resolve,reject)=>resources.loadDir('config/card-levels',JsonAsset,(error,assets)=>error?reject(error):resolve(assets)));
    }
    private loadJson(path:string):Promise<any> {
        return new Promise((resolve,reject)=>resources.load(path,JsonAsset,(error,asset)=>error||!asset?reject(error??new Error('配置缺失：'+path)):resolve(asset.json)));
    }
    private loadGamePrefab():Promise<Prefab> {
        return new Promise((resolve,reject)=>resources.load('prefabs/gamePage',Prefab,(error,prefab)=>error||!prefab?reject(error??new Error('卡牌页面不存在')):resolve(prefab)));
    }
    private loadingScreen():Node {
        const root=new Node('LoadingRoot');root.layer=this.node.layer;root.addComponent(UITransform).setContentSize(1181,2556);
        const g=root.addComponent(Graphics);g.fillColor=new Color(24,14,45);g.rect(-590.5,-1278,1181,2556);g.fill();
        for(let radius=1050;radius>50;radius-=40){g.fillColor=new Color(126,28,193,7);g.circle(0,520,radius);g.fill();}
        const title=new Node('title');title.layer=root.layer;title.addComponent(UITransform).setContentSize(1000,200);title.setPosition(0,540);root.addChild(title);
        const logo=title.addComponent(Label);logo.string='Solitaire';logo.fontSize=115;logo.isBold=true;logo.isItalic=true;logo.color=new Color(255,196,213);logo.horizontalAlign=HorizontalTextAlignment.CENTER;
        const message=new Node('message');message.layer=root.layer;message.addComponent(UITransform).setContentSize(1000,260);message.setPosition(0,-510);root.addChild(message);
        const label=message.addComponent(Label);label.string='正在启动…';label.fontSize=35;label.lineHeight=45;label.color=Color.WHITE;label.horizontalAlign=HorizontalTextAlignment.CENTER;label.verticalAlign=VerticalTextAlignment.CENTER;
        return root;
    }
    private setMessage(message:string):void {
        if(this.catalog?.isValid){this.catalog.showMessage(message);return;}
        const label=this.screen?.getChildByName('message')?.getComponent(Label);if(label)label.string=message;
    }
    private replaceScreen(next:Node):void {
        if(this.screen?.isValid)this.screen.destroy();this.screen=next;next.layer=this.node.layer;this.node.addChild(next);next.setPosition(0,0,0);
    }
    protected onDestroy():void {this.lifetime.dispose();void this.shell?.dispose();}
}
