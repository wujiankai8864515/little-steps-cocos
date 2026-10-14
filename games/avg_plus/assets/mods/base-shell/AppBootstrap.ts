import {
    _decorator, AudioSource, Color, Component, director, game, Graphics,
    HorizontalTextAlignment, instantiate, JsonAsset, Label, Node, Prefab,
    profiler, resources, sys, UITransform, VerticalTextAlignment, Widget,
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
import { StartupPresentation } from './StartupPresentation';

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
    private catalogRoot: Node | null = null;
    private reusableCatalog: CatalogUI | null = null;
    private loading = false;
    private catalogReady = false;
    private flow!: GameFlow;
    private config!: CatalogConfig;
    private levels: string[] = [];
    private saveError: Error | null = null;
    private versionBadge: Node | null = null;
    private startup: StartupPresentation | null = null;

    protected onLoad(): void { profiler.hideStats(); }
    protected start(): void {
        void this.startWithUpdate().catch(error => {
            if (this.lifetime.cancelled) return;
            console.error('[Shell]', error);
            const message = error instanceof Error ? error.message : '启动失败，请重试';
            if (this.startup?.isValid) this.startup.fail(message, () => game.restart());
            else this.setMessage(message);
        });
    }
    private async startWithUpdate(): Promise<void> {
        const loadingRoot = new Node('LoadingRoot'); loadingRoot.layer = this.node.layer;
        this.node.addChild(loadingRoot);
        this.startup = loadingRoot.addComponent(StartupPresentation); this.startup.open();
        await this.startup.firstDraw(); this.lifetime.check();
        const releaseInfo=await this.lifetime.run(()=>this.loadJson('config/release-info'),CONTENT_TIMEOUT_MS);
        this.lifetime.check();this.showVersion(releaseInfo.displayVersion);
        this.startup.setStage('正在检查更新…', 0.2);
        const updater = new NativeHotUpdate(this.lifetime);
        const result = await updater.run(text => this.setMessage(text));
        this.lifetime.check();
        if (result === 'restart') { game.restart(); return; }
        this.startup.setStage('正在准备你的故事…', 0.5);
        const [assets, flow, config, chapters] = await this.lifetime.run(() => Promise.all([
            this.loadLevels(), this.loadJson('config/game-flow').then(parseGameFlow),
            this.loadJson('config/catalog').then(parseCatalogConfig), this.loadJson('config/avg-chapters'),
        ]), CONTENT_TIMEOUT_MS);
        this.lifetime.check();
        this.levels = assets
            .sort((a,b) => a.localeCompare(b,undefined,{numeric:true}));
        if (!this.levels.length || new Set(this.levels).size !== this.levels.length) throw new Error('卡牌目录为空或重复');
        for (const [levelId,chapterId] of Object.entries(flow.afterWin)) {
            if (!this.levels.includes(levelId) || !chapters.chapters?.some((c: any) => c.id === chapterId)) throw new Error('卡牌剧情衔接引用不存在');
        }
        for (const story of config.stories) {
            if (!chapters.chapters?.some((c: any) => c.id === story.chapterId && c.bundle === story.bundle)) throw new Error('目录没有对应的既有剧情：'+story.title);
        }
        this.flow = flow; this.config = config;
        this.startup.setStage('正在恢复进度…', 0.7);
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
        this.startup.setStage('正在布置首页…', 0.85);
        await this.showLevelList();
        this.lifetime.check();
        await this.startup.finish(); this.startup = null;
        this.lifetime.check();
        if(this.catalogReady)updater.markHealthy();
    }
    public async showLevelList(): Promise<void> {
        if(!this.shell||this.lifetime.cancelled)return;
        if (this.catalogReady && this.catalogRoot?.isValid && this.reusableCatalog?.isValid) {
            this.catalog = this.reusableCatalog; this.replaceScreen(this.catalogRoot);
            this.catalog.render(this.state());
            if (this.saveError) this.setMessage(this.saveError.message);
            return;
        }
        const root=new Node('CatalogRoot');root.layer=this.node.layer;
        this.catalogRoot=root;
        this.replaceScreen(root);
        const catalog=this.catalog=this.reusableCatalog=root.addComponent(CatalogUI);
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
                initialCoins:started.coins,initialGems:started.gems,headerTitle:'Chapter 1 · Solitaire '+(this.levels.indexOf(levelId)+1),economy:this.config.economy,background:this.config.cardBackground,
                checkpoint:async(state,action)=>{
                    await this.send({type:'shell.card',payload:{roundId:ownedRound,coins:state.session.coins,
                        complete:state.core.isComplete,played:action!=='card.open',ended:action==='card.exit'}});
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
    private async loadLevels():Promise<string[]> {
        const index=await this.loadJson('config/card-index');
        if(index.schemaVersion!==1||!Array.isArray(index.levels)||index.levels.some((id:any)=>typeof id!=='string'||!/^level_difficulty\d+_\d{2}$/.test(id)))throw new Error('关卡索引无效');
        return [...index.levels];
    }
    private loadJson(path:string):Promise<any> {
        return new Promise((resolve,reject)=>resources.load(path,JsonAsset,(error,asset)=>error||!asset?reject(error??new Error('配置缺失：'+path)):resolve(asset.json)));
    }
    private loadGamePrefab():Promise<Prefab> {
        return new Promise((resolve,reject)=>resources.load('prefabs/gamePage',Prefab,(error,prefab)=>error||!prefab?reject(error??new Error('卡牌页面不存在')):resolve(prefab)));
    }
    private setMessage(message:string):void {
        if(this.startup?.isValid){this.startup.setStage(message);return;}
        if(this.catalog?.isValid){this.catalog.showMessage(message);return;}
        const label=this.screen?.getChildByName('message')?.getComponent(Label);if(label)label.string=message;
    }
    private replaceScreen(next:Node):void {
        if(this.screen?.isValid && this.screen!==next) {
            if(this.screen===this.catalogRoot)this.screen.active=false;
            else this.screen.destroy();
        }
        this.screen=next;next.layer=this.node.layer;next.active=true;
        if(next.parent!==this.node)this.node.addChild(next);
        else next.setSiblingIndex(this.node.children.length-1);
        next.setPosition(0,0,0);
        if(this.startup?.isValid)this.startup.node.setSiblingIndex(this.node.children.length-1);
        if(this.versionBadge?.isValid)this.versionBadge.setSiblingIndex(this.node.children.length-1);
    }
    private showVersion(value:string):void {
        if(value!=='开发版本'&&!/^\d{4}(?:-\d{2}){5}$/.test(value))throw new Error('版本时间格式无效');
        const root=this.versionBadge=new Node('VersionBadge');root.layer=this.node.layer;
        root.addComponent(UITransform).setContentSize(840,44);this.node.addChild(root);
        const widget=root.addComponent(Widget);widget.isAlignBottom=true;widget.bottom=18;
        widget.isAlignHorizontalCenter=true;widget.horizontalCenter=0;widget.updateAlignment();
        const background=root.addComponent(Graphics);background.fillColor=new Color(15,10,29,170);
        background.roundRect(-420,-22,840,44,22);background.fill();
        const text=new Node('VersionText');text.layer=root.layer;text.addComponent(UITransform).setContentSize(830,44);root.addChild(text);
        const label=text.addComponent(Label);label.string='版本 '+value;label.fontSize=23;label.lineHeight=32;
        label.color=new Color(230,215,246,230);label.horizontalAlign=HorizontalTextAlignment.CENTER;label.verticalAlign=VerticalTextAlignment.CENTER;
    }
    protected onDestroy():void {this.lifetime.dispose();void this.shell?.dispose();}
}
