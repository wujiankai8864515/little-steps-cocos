import {
    _decorator, AssetManager, assetManager, BlockInputEvents, Button, Color,
    Graphics, HorizontalTextAlignment, Label, Mask, Node, Sprite, SpriteFrame,
    ScrollView, UIOpacity, UITransform, VerticalTextAlignment,
} from 'cc';
import type { Action } from '../../foundation/Contracts';
import { TaskScope } from '../../foundation/Tasks';
import { PresentationComponent } from '../shared/PresentationComponent';
import { imageSize } from '../shared/ImageLayout';
import type { CatalogConfig, StoryConfig, StoryPlaceholderConfig } from './CatalogConfig';
import type { CatalogPage, CatalogState } from './CatalogMod';

const { ccclass } = _decorator;
const WHITE = new Color(255, 248, 255);
const MUTED = new Color(213, 200, 229);
const DARK = new Color(15, 13, 39, 230);
const PINK = new Color(255, 50, 174);
const WIDTH = 1181, HEIGHT = 2556;
interface CatalogNavigation {
    send(action: Action): Promise<void>;
    startCard(): Promise<void>;
    readStory(): Promise<void>;
}

/** Portrait layout of the reference's non-story screens, using the user's existing art. */
@ccclass('CatalogUI')
export class CatalogUI extends PresentationComponent {
    private readonly lifetime = new TaskScope();
    private readonly sprites = new Map<string, SpriteFrame>();
    private config!: CatalogConfig;
    private levels: readonly string[] = [];
    private navigation!: CatalogNavigation;
    private state!: Readonly<CatalogState>;
    private content: Node | null = null;
    private notification: Label | null = null;
    private countdown: Label | null = null;
    private previousPage: CatalogPage | null = null;
    private renderGeneration = 0;

    public async open(config: CatalogConfig, levels: readonly string[], state: Readonly<CatalogState>, navigation: CatalogNavigation): Promise<void> {
        this.config = config; this.levels = levels; this.navigation = navigation;
        this.node.addComponent(UITransform).setContentSize(WIDTH, HEIGHT);
        this.node.addComponent(BlockInputEvents);
        this.backdrop(this.node);
        const loading = this.text(this.node, '正在读取内容…', 36, 0, 0, 900, 100);
        await this.lifetime.run(scope => Promise.all(config.stories.map(s => this.loadStoryArt(s,scope))), 30000);
        this.lifetime.check(); loading.node.destroy();
        this.render(state);
        this.schedule(this.updateCountdown, 1);
    }
    private async loadStoryArt(story: StoryConfig,scope: TaskScope): Promise<void> {
        const bundle = assetManager.getBundle(story.bundle) ?? await new Promise<AssetManager.Bundle>((resolve, reject) =>
            assetManager.loadBundle(story.bundle, (error, value) => error || !value ? reject(error ?? new Error('剧情素材包不存在')) : resolve(value)));
        scope.check();
        const paths = new Set([story.background, ...story.roles]);
        await this.loadArt(bundle,story.bundle,paths,scope);
    }
    private async loadArt(bundle: AssetManager.Bundle,bundleName: string,paths: Set<string>,scope: TaskScope): Promise<void> {
        await Promise.all(Array.from(paths).map(async path => {
            if(this.sprites.has(bundleName+'/'+path))return;
            const frame = await new Promise<SpriteFrame>((resolve, reject) => bundle.load(path + '/spriteFrame', SpriteFrame,
                (error, value) => error || !value ? reject(error ?? new Error('目录素材不存在：' + path)) : resolve(value)));
            scope.check();
            const key = bundleName + '/' + path;
            if (!this.sprites.has(key)) { frame.addRef(); this.sprites.set(key, frame); }
        }));
    }
    public render(state: Readonly<CatalogState>): void {
        if (this.lifetime.cancelled || !this.node.isValid) return;
        const generation=++this.renderGeneration;
        if(state.page==='collections') {
            const story=this.config.stories.find(s=>s.id===state.selectedStory)!;
            const missing=new Set(story.collections.filter(c=>state.stories[story.id].highestPage>=c.unlockPage
                &&!this.sprites.has(story.bundle+'/'+c.asset)).map(c=>c.asset));
            if(missing.size) {
                this.cancelVisuals();this.content?.destroy();this.state=state;
                const root=this.content=this.child(this.node,'CollectionLoading',WIDTH,HEIGHT);
                this.text(root,'正在读取收藏…',36,0,0,950,100);
                this.closeButton(root);
                void this.lifetime.run(scope=>this.loadArt(assetManager.getBundle(story.bundle)!,story.bundle,missing,scope),30000)
                    .then(()=>{if(generation===this.renderGeneration)this.render(state);})
                    .catch(error=>{if(generation===this.renderGeneration&&!this.lifetime.cancelled)this.text(root,'读取失败，请稍后重试',34,0,-140,1000,100);console.warn('[Collection art]',error);});
                return;
            }
        }
        this.cancelVisuals();
        this.content?.destroy(); this.countdown = null; this.notification = null;
        this.state = state;
        const root = this.content = this.child(this.node, 'CatalogContent', WIDTH, HEIGHT);
        const page = state.page;
        if (page === 'catalog' || page === 'favourites') this.catalog(root, page === 'favourites');
        else if (page === 'details') this.details(root);
        else if (page === 'intro') this.intro(root);
        else if (page === 'quests') this.quests(root);
        else if (page === 'collections') this.collections(root);
        else if (page === 'settings') this.settings(root);
        else if (page === 'rating') this.rating(root);
        else if (page === 'restart') this.restart(root);
        this.notification = this.text(root, '', 30, 0, -1190, 1060, 100);
        this.notification.color = new Color(255, 220, 228);
        if (this.previousPage !== page) {
            const opacity = root.addComponent(UIOpacity); opacity.opacity = 0;
            this.visualTween(opacity).to(0.22, { opacity: 255 }).start();
        }
        this.previousPage = page;
    }
    public showMessage(message: string): void { if (this.notification?.isValid) this.notification.string = message; }
    private get story(): StoryConfig { return this.config.stories.find(s => s.id === this.state.selectedStory)!; }
    private async send(type: string, payload?: unknown): Promise<void> {
        try { await this.navigation.send({ type, ...(payload === undefined ? {} : { payload }) }); }
        catch (error) { if (!this.lifetime.cancelled) this.showMessage(error instanceof Error ? error.message : String(error)); }
    }
    private page(page: CatalogPage, levelId?: string): void { void this.send('shell.page', { page, ...(levelId ? { levelId } : {}) }); }
    private close(): void { this.page(this.state.returnPage); }
    private backdrop(parent: Node): void {
        const g = parent.addComponent(Graphics);
        g.fillColor = new Color(15, 14, 37); g.rect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT); g.fill();
        // Purple illumination from the reference menu, drawn without replacing source art.
        for (const [x,y,r,color] of [[-470,700,1220,new Color(126,26,187,5)], [430,-780,1060,new Color(120,22,143,4)]] as const) {
            for (let radius = r; radius > 40; radius -= 32) { g.fillColor = color; g.circle(x,y,radius); g.fill(); }
        }
    }
    private header(root: Node, back = false): void {
        if (back) this.pill(root, 'Back', -432, 1150, 185, 78, DARK, () => this.page('catalog'), 30);
        else {
            const logo = this.text(root, 'Solitaire', 48, -383, 1170, 310, 68); logo.isBold = true; logo.isItalic = true; logo.color = new Color(255,190,192);
            const subtitle = this.text(root, 'ROMANCE', 21, -370, 1120, 290, 40); subtitle.isItalic = true;
        }
        this.wallet(root, 65, 1150, this.state.coins, false);
        this.wallet(root, 386, 1150, this.state.gems, true);
        this.iconButton(root, 'quests', 218, 970, 96, () => this.page('quests'));
        this.iconButton(root, 'book', 346, 970, 96, () => this.page('favourites'));
        this.iconButton(root, 'settings', 474, 970, 96, () => this.page('settings'));
        const claimable = this.config.quests.some(q => this.state.daily.counts[q.id] >= q.target && !this.state.daily.claimed.includes(q.id));
        if (claimable) { const dot = this.child(root, 'questNotification', 20,20,250,933); const g=dot.addComponent(Graphics);g.fillColor=PINK;g.circle(0,0,10);g.fill(); }
        this.pill(root, 'BONUS', -422, 970, 185, 78, new Color(132,31,204), () => this.page('quests'), 27);
    }
    private wallet(parent: Node, x: number, y: number, value: number, gem: boolean): void {
        const w = gem ? 230 : 305;
        const node = this.panel(parent, gem ? 'gemWallet' : 'coinWallet', x,y,w,76,DARK,38);
        this.currencyIcon(node, -w/2+44, 0, 26, gem);
        const label=this.text(node, value.toLocaleString('en-US'), 34, 26, 0, w-75,65);label.isBold=true;
    }
    private catalog(root: Node, favourites: boolean): void {
        this.header(root);
        const items = this.config.stories.filter(s => !favourites || this.state.stories[s.id].favourite);
        if (favourites) {
            this.text(root,'Favourites',62,0,808,1000,100).isBold=true;
            this.pill(root,'Back',-422,-1055,180,80,DARK,()=>this.page('catalog'),30);
        }
        if (!items.length) { this.text(root,'暂无收藏\n在详情页点击书签收藏剧情',38,0,220,940,190);return; }
        const story=items.find(s=>s.id===this.state.selectedStory)??items[0];
        if(!favourites && this.config.placeholderStories?.length) this.storyCarousel(root,items,story);
        else this.realStoryCard(root,story);
        if(!favourites)this.levelList(root);
    }
    private storyCarousel(root: Node,items: readonly StoryConfig[],selected: StoryConfig): void {
        const placeholders=this.config.placeholderStories??[];
        const stories=[selected,...items.filter(s=>s.id!==selected.id)];
        const total=stories.length+placeholders.length,step=1030,viewportWidth=1100;
        this.text(root,`剧本 · ${total} 本   ‹ 左右滑动查看 ›`,26,0,899,1050,48).color=MUTED;
        const viewport=this.child(root,'storyViewport',viewportWidth,1640,0,60);
        const mask=viewport.addComponent(Mask);mask.type=Mask.Type.GRAPHICS_STENCIL;
        const stencil=viewport.getComponent(Graphics)!;stencil.clear();stencil.fillColor=Color.WHITE;
        stencil.rect(-viewportWidth/2,-820,viewportWidth,1640);stencil.fill();
        const content=this.child(viewport,'storyContent',viewportWidth+(total-1)*step,1640,-viewportWidth/2,0);
        content.getComponent(UITransform)!.setAnchorPoint(0,.5);
        const scroll=viewport.addComponent(ScrollView);scroll.content=content;
        scroll.horizontal=true;scroll.vertical=false;scroll.inertia=true;scroll.elastic=false;scroll.cancelInnerEvents=true;
        for(let i=0;i<total;i++) {
            const panel=this.child(content,'story_'+i,step,1640,viewportWidth/2+i*step,-60);
            if(i<stories.length)this.realStoryCard(panel,stories[i]);
            else this.placeholderStoryCard(panel,placeholders[i-stories.length]);
        }
    }
    private realStoryCard(root: Node,story: StoryConfig): void {
        const card=this.cover(root,story,0,276,1010,1110);
        const title=this.text(card,story.title,61,0,440,890,132);title.isBold=true;
        title.enableWrapText=true;
        this.text(card,'Chapter 1  ·  Solitaire '+this.state.completedLevels.length+' / '+this.levels.length,29,0,-480,960,65);
        const button=card.addComponent(Button);button.transition=Button.Transition.SCALE;button.zoomScale=1.012;
        card.on(Button.EventType.CLICK,()=>void this.send('shell.story',{id:story.id}),this);
        this.text(root,story.title,43,-170,-367,700,90).horizontalAlign=HorizontalTextAlignment.LEFT;
        this.iconButton(root,'heart',240,-367,88,()=>void this.send('shell.like',{storyId:story.id}),this.state.stories[story.id].liked);
        this.iconButton(root,'star',433,-367,88,()=>void this.send('shell.story',{id:story.id}).then(()=>this.send('shell.page',{page:'rating'})),false);
        this.text(root,story.synopsis,30,0,-508,995,150).color=MUTED;
        this.gradientPill(root, 'Resume',0,-683,790,120,()=>void this.send('shell.story',{id:story.id}));
    }
    private placeholderStoryCard(root: Node,placeholder: StoryPlaceholderConfig): void {
        const source=this.config.stories.find(s=>s.id===placeholder.coverStoryId)!;
        const borrowed={...source,roles:placeholder.roleIndexes.map(i=>source.roles[i])};
        const card=this.cover(root,borrowed,0,276,1010,1110);
        const wash=this.child(card,'placeholderTint',1010,1110),paint=wash.addComponent(Graphics);
        paint.fillColor=new Color(...placeholder.tint,90);paint.rect(-505,-555,1010,1110);paint.fill();
        const message=()=>this.showMessage(`《${placeholder.title}》正在筹备中，敬请期待。`);
        this.pill(card,'筹备中',325,465,235,77,new Color(...placeholder.tint,235),message,28);
        this.text(card,placeholder.title,68,0,342,930,145).isBold=true;
        this.text(card,placeholder.subtitle,29,0,233,960,65);
        this.text(card,'占位剧本 · 敬请期待',29,0,-480,960,65);
        const button=card.addComponent(Button);button.transition=Button.Transition.SCALE;button.zoomScale=1.012;
        card.on(Button.EventType.CLICK,message,this);
        this.text(root,placeholder.title,43,-170,-367,700,90).horizontalAlign=HorizontalTextAlignment.LEFT;
        this.pill(root,'筹备中',355,-367,265,78,DARK,message,30);
        this.text(root,placeholder.synopsis,30,0,-508,995,150).color=MUTED;
        this.gradientPill(root,'敬请期待',0,-683,790,120,message);
    }
    private levelList(root: Node): void {
        this.text(root,`卡牌关卡 · ${this.levels.length} 关`,32,-260,-837,500,70).horizontalAlign=HorizontalTextAlignment.LEFT;
        const viewport=this.child(root,'levelViewport',1050,340,0,-1050);
        const mask=viewport.addComponent(Mask);mask.type=Mask.Type.GRAPHICS_STENCIL;
        const stencil=viewport.getComponent(Graphics)!;stencil.clear();stencil.fillColor=Color.WHITE;
        stencil.rect(-525,-170,1050,340);stencil.fill();
        const content=this.child(viewport,'levelContent',1050,Math.ceil(this.levels.length/3)*150+18,0,170);
        content.getComponent(UITransform)!.setAnchorPoint(.5,1);
        const scroll=viewport.addComponent(ScrollView);scroll.content=content;scroll.horizontal=false;scroll.vertical=true;scroll.inertia=true;
        // Clamp at the first/last row; rapid wheel/touch input must never leave a blank viewport.
        scroll.elastic=false;
        this.levels.forEach((id,index)=>{
            const match=/^level_difficulty(\d+)_(\d{2})$/.exec(id)!;
            const label=(this.state.completedLevels.includes(id)?'✓ ':'')+`${match[1]} · ${match[2]}`;
            this.pill(content,label,(index%3-1)*330,-74-Math.floor(index/3)*150,288,118,new Color(51,32,90),()=>this.page('intro',id),36);
        });
    }
    private cover(parent: Node, story: StoryConfig, x: number, y: number, width: number, height: number): Node {
        const node=this.child(parent,'storyCover',width,height,x,y);
        const mask=node.addComponent(Mask);mask.type=Mask.Type.GRAPHICS_STENCIL;
        const stencil=node.getComponent(Graphics)!;
        stencil.clear();stencil.fillColor=Color.WHITE;
        stencil.roundRect(-width/2,-height/2,width,height,38);stencil.fill();
        this.sprite(node,'coverBackground',story.bundle+'/'+story.background,0,0,width,height,'cover');
        for(let i=0;i<story.roles.length;i++) {
            const h=height*1.6,w=h/2.8;
            this.sprite(node,'coverRole_'+i,story.bundle+'/'+story.roles[i],(i-(story.roles.length-1)/2)*width*0.36,-height*0.43,w,h);
        }
        const shade=this.child(node,'coverShade',width,height);const g=shade.addComponent(Graphics);
        for(let i=0;i<96;i++){g.fillColor=new Color(18,10,37,Math.round(150*(1-i/96)));g.rect(-width/2,-height/2+i*height/96,width,height/96);g.fill();}
        for(let i=0;i<40;i++){g.fillColor=new Color(14,9,27,Math.round(190*(1-i/40)));g.rect(-width/2,height/2-(i+1)*height/160,width,height/160);g.fill();}
        const edge=this.child(parent,'coverBorder',width,height,x,y);const outline=edge.addComponent(Graphics);
        outline.lineWidth=3;outline.strokeColor=new Color(233,211,255,120);outline.roundRect(-width/2,-height/2,width,height,38);outline.stroke();
        return node;
    }
    private details(root: Node): void {
        this.header(root,true);const story=this.story,p=this.state.stories[story.id];
        this.cover(root,story,0,182,1010,1440);
        this.text(root,story.subtitle,28,0,855,960,70).isBold=true;
        const title=this.text(root,story.title,69,0,735,970,140);title.isBold=true;
        this.text(root,'Chapter 1  ·  '+(p.pageCount?`${p.pageIndex+1} / ${p.pageCount}`:'尚未开始')+'  ·  Solitaire '+this.state.completedLevels.length+' / '+this.levels.length,29,0,-469,1000,70);
        this.text(root,story.synopsis,32,0,-641,1010,160).color=MUTED;
        this.iconButton(root,'heart',-355,-833,104,()=>void this.send('shell.like'),p.liked);
        this.text(root,p.liked?'1':'0',31,-259,-833,80,60);
        this.iconButton(root,'star',-111,-833,104,()=>this.page('rating'),p.rating>0);
        this.text(root,p.rating?String(p.rating)+'.0':'4.0',31,-11,-833,90,60);
        this.iconButton(root,'book',140,-833,104,()=>void this.send('shell.favourite'),p.favourite);
        this.iconButton(root,'restart',367,-833,104,()=>this.page('restart'));
        this.gradientPill(root,p.pageCount?'Resume':'Start',0,-1018,750,118,()=>{void this.navigation.readStory().catch(e=>this.showMessage(String(e)));});
        this.pill(root,'Solitaire',-253,-1122,410,77,DARK,()=>this.page('intro'),31);
        this.pill(root,'Collections',253,-1122,410,77,DARK,()=>this.page('collections'),31);
    }
    private intro(root: Node): void {
        this.wallet(root,-348,1130,this.state.coins,false);
        this.iconButton(root,'close',475,1130,85,()=>this.page('catalog'));
        const index=this.levels.indexOf(this.state.selectedLevel);
        this.text(root,'Solitaire '+(index+1),99,0,520,1060,160).isBold=true;
        this.text(root,this.story.title,42,0,329,1030,100);
        this.gradientPill(root,'Start',0,-196,745,124,()=>{void this.navigation.startCard().catch(e=>this.showMessage(String(e)));});
        const cost=this.panel(root,'entryFee',0,-343,280,78,DARK,39);this.currencyIcon(cost,-85,0,26,false);
        this.text(cost,String(this.config.economy.entryCost),35,26,0,180,70).isBold=true;
    }
    private quests(root: Node): void {
        this.closeButton(root);
        this.icon(root,'quests',-369,826,190);
        const title=this.text(root,'Daily\nQuests',103,69,823,660,256);title.isBold=true;title.isItalic=true;
        this.text(root,'Expires in',27,0,589,800,56).color=MUTED;
        this.countdown=this.text(root,'',45,0,511,700,82);this.updateCountdown();
        this.config.quests.forEach((q,index)=>{
            const y=268-index*242;const count=Math.min(q.target,this.state.daily.counts[q.id]);
            const row=this.panel(root,'quest_'+q.id,0,y,1052,195,new Color(30,16,61,95),22);
            this.text(row,String(index+1)+'.',32,-465,0,75,80);
            const tile=this.panel(row,'questIcon',-358,0,90,100,new Color(221,127,201),18);this.icon(tile,index===0?'bonus':q.id==='wins'?'card':q.id==='ads'?'play':'book',0,0,58);
            const label=this.text(row,q.label,28,-28,32,510,83);label.horizontalAlign=HorizontalTextAlignment.LEFT;
            this.currencyIcon(row,263,35,22,false);this.text(row,String(q.reward),28,346,35,110,60).isBold=true;
            const claimed=this.state.daily.claimed.includes(q.id),ready=count===q.target;
            if(ready||claimed)this.gradientPill(row,claimed?'Claimed':'Claim',84,-54,605,66,()=>{if(!claimed)void this.send('shell.claim',{id:q.id});},26,claimed);
            else {
                this.text(row,`(${count}/${q.target})`,24,-231,-54,170,56).horizontalAlign=HorizontalTextAlignment.LEFT;
                const bar=this.panel(row,'progress',105,-54,485,15,new Color(7,6,19),7);
                const g=bar.getComponent(Graphics)!;g.fillColor=PINK;const fill=485*count/q.target;if(fill>0){g.roundRect(-242.5,-7.5,fill,15,7);g.fill();}
            }
        });
    }
    private collections(root: Node): void {
        this.closeButton(root);const story=this.story,p=this.state.stories[story.id];
        const unlocked=story.collections.filter(c=>p.highestPage>=c.unlockPage).length;
        this.text(root,'Collections',65,0,1030,1000,100).isBold=true;
        this.text(root,`${story.title}  ·  ${unlocked} / ${story.collections.length}`,32,0,910,1000,80).color=MUTED;
        story.collections.forEach((c,i)=>{
            const x=(i%2?1:-1)*263,y=584-Math.floor(i/2)*561;
            const tile=this.panel(root,'collection_'+c.id,x,y,478,495,new Color(52,32,87),30);
            const mask=tile.addComponent(Mask);mask.type=Mask.Type.GRAPHICS_STENCIL;
            const g=tile.getComponent(Graphics)!;g.clear();g.fillColor=Color.WHITE;g.roundRect(-239,-247.5,478,495,30);g.fill();
            if(p.highestPage>=c.unlockPage){
                const isRole=c.asset.startsWith('roles/');this.sprite(tile,'collectionImage',story.bundle+'/'+c.asset,0,isRole?-320:0,isRole?435:478,isRole?1218:495,isRole?'contain':'cover');
                const bottom=this.panel(tile,'caption',0,-205,478,85,DARK,0);this.text(bottom,c.title,27,0,0,450,70);
                tile.addComponent(Button);tile.on(Button.EventType.CLICK,()=>this.showMessage(c.title),this);
            } else {
                this.icon(tile,'lock',0,70,84);this.text(tile,'Locked',36,0,-37,420,72);
                this.text(tile,`剧情第 ${c.unlockPage} 页解锁`,24,0,-126,430,70).color=MUTED;
            }
        });
    }
    private settings(root: Node): void {
        this.closeButton(root);this.text(root,'Settings',88,0,820,1030,140).isBold=true;
        const fields=[['music','Music'],['sound','Sound'],['haptics','Vibration']] as const;
        fields.forEach(([key,title],i)=>{
            const y=460-i*277;this.text(root,title,47,-204,y,540,110).horizontalAlign=HorizontalTextAlignment.LEFT;
            const on=this.state.settings[key];
            this.pill(root,on?'ON':'OFF',344,y,245,103,on?new Color(162,27,235):new Color(62,48,80),()=>void this.send('shell.setting',{key}),34);
        });
        this.pill(root,'Back',0,-685,540,106,DARK,()=>this.close(),36);
    }
    private rating(root: Node): void {
        this.closeButton(root);this.text(root,'Rate this story',65,0,510,1000,150).isBold=true;
        this.text(root,this.story.title,38,0,335,1000,100);
        for(let i=1;i<=5;i++)this.iconButton(root,'star',(i-3)*191,71,146,()=>void this.send('shell.rate',{rating:i}),this.state.stories[this.story.id].rating>=i);
        this.text(root,'选择星数保存你的评分',30,0,-198,960,100).color=MUTED;
    }
    private restart(root: Node): void {
        this.closeButton(root);this.text(root,'Restart story?',69,0,478,1020,140).isBold=true;
        this.text(root,'从第一章第一页重新阅读\n已获得的收藏和金币保留',34,0,220,1030,165);
        this.gradientPill(root,'Restart',0,-120,740,116,()=>void this.send('shell.reset'));
        this.pill(root,'Cancel',0,-309,740,102,DARK,()=>this.close(),37);
    }
    private closeButton(root: Node): void { this.iconButton(root,'close',491,1140,89,()=>this.close()); }
    private updateCountdown = (): void => {
        if(!this.countdown?.isValid)return;
        const remaining=Math.max(0,86400-Math.floor(Date.now()/1000)%86400);
        const h=Math.floor(remaining/3600),m=Math.floor(remaining%3600/60),s=remaining%60;
        this.countdown.string=[h,m,s].map(v=>String(v).padStart(2,'0')).join(' : ');
        if(remaining===86400)void this.send('shell.page',{page:'quests'});
    };
    private child(parent: Node,name: string,w: number,h: number,x=0,y=0): Node {
        const node=new Node(name);node.layer=parent.layer;node.addComponent(UITransform).setContentSize(w,h);node.setPosition(x,y);parent.addChild(node);return node;
    }
    private panel(parent: Node,name: string,x: number,y: number,w: number,h: number,color: Color,radius: number): Node {
        const node=this.child(parent,name,w,h,x,y),g=node.addComponent(Graphics);g.fillColor=color;g.roundRect(-w/2,-h/2,w,h,radius);g.fill();return node;
    }
    private text(parent: Node,value: string,size: number,x: number,y: number,w: number,h: number): Label {
        const node=this.child(parent,'label',w,h,x,y),label=node.addComponent(Label);
        label.string=value;label.fontSize=size;label.lineHeight=size*1.24;label.color=WHITE;label.enableWrapText=true;
        label.horizontalAlign=HorizontalTextAlignment.CENTER;label.verticalAlign=VerticalTextAlignment.CENTER;
        label.overflow=Label.Overflow.SHRINK;return label;
    }
    private sprite(parent: Node,name: string,key: string,x: number,y: number,w: number,h: number,mode: 'contain'|'cover'='contain'): Node {
        const frame=this.sprites.get(key);if(!frame)throw new Error('目录纹理未加载：'+key);
        const size=imageSize(frame.originalSize.width,frame.originalSize.height,w,h,mode);
        const node=this.child(parent,name,size.width,size.height,x,y),sprite=node.addComponent(Sprite);
        sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;sprite.spriteFrame=frame;return node;
    }
    private pill(parent: Node,text: string,x: number,y: number,w: number,h: number,color: Color,action: ()=>void,font=37): Node {
        const node=this.panel(parent,text,x,y,w,h,color,h/2);this.text(node,text,font,0,0,w-36,h-10).isBold=true;
        const button=node.addComponent(Button);button.transition=Button.Transition.SCALE;button.zoomScale=1.035;button.duration=0.08;node.on(Button.EventType.CLICK,action,this);return node;
    }
    private gradientPill(parent: Node,text: string,x: number,y: number,w: number,h: number,action:()=>void,font=45,disabled=false): void {
        const node=this.child(parent,text,w,h,x,y);
        const mask=node.addComponent(Mask);mask.type=Mask.Type.GRAPHICS_STENCIL;
        const stencil=node.getComponent(Graphics)!;stencil.clear();stencil.fillColor=Color.WHITE;stencil.roundRect(-w/2,-h/2,w,h,h/2);stencil.fill();
        const paint=this.child(node,'gradient',w,h),g=paint.addComponent(Graphics);
        for(let i=0;i<160;i++){const t=i/159;g.fillColor=disabled?new Color(69,43,83):new Color(Math.round(255-75*t),Math.round(113-108*t),Math.round(119+79*t));g.rect(-w/2+i*w/160,-h/2,w/160,h);g.fill();}
        this.text(node,text,font,0,0,w-34,h-10).isBold=true;
        const button=node.addComponent(Button);button.interactable=!disabled;button.transition=Button.Transition.SCALE;button.zoomScale=1.035;button.duration=0.08;node.on(Button.EventType.CLICK,action,this);
    }
    private iconButton(parent: Node,kind: string,x: number,y: number,size: number,action:()=>void,active=false): void {
        const node=this.child(parent,kind,size,size,x,y);this.icon(node,kind,0,0,size*0.62,active);
        const button=node.addComponent(Button);button.transition=Button.Transition.SCALE;button.zoomScale=1.05;button.duration=0.08;node.on(Button.EventType.CLICK,action,this);
    }
    private currencyIcon(parent: Node,x: number,y: number,r: number,gem: boolean): void {
        const node=this.child(parent,gem?'gem':'coin',r*2,r*2,x,y),g=node.addComponent(Graphics);
        if(gem){g.fillColor=new Color(39,210,242);g.moveTo(-r,7);g.lineTo(-r*0.55,r*0.7);g.lineTo(r*0.55,r*0.7);g.lineTo(r,7);g.lineTo(0,-r);g.close();g.fill();g.strokeColor=new Color(140,244,255);g.lineWidth=3;g.moveTo(-r,7);g.lineTo(r,7);g.moveTo(-r*0.55,r*0.7);g.lineTo(0,-r);g.lineTo(r*0.55,r*0.7);g.stroke();}
        else{g.fillColor=new Color(249,215,44);g.circle(0,0,r);g.fill();g.strokeColor=new Color(187,139,8);g.lineWidth=3;g.circle(0,0,r-4);g.stroke();g.fillColor=new Color(255,246,113);g.ellipse(-4,5,r*0.47,r*0.58);g.fill();}
    }
    private icon(parent: Node,kind: string,x: number,y: number,size: number,active=false): void {
        const node=this.child(parent,kind+'Icon',size,size,x,y),g=node.addComponent(Graphics),r=size/2;
        g.strokeColor=active?PINK:WHITE;g.fillColor=active?PINK:WHITE;g.lineWidth=Math.max(3,size*0.065);g.lineJoin=Graphics.LineJoin.ROUND;g.lineCap=Graphics.LineCap.ROUND;
        if(kind==='heart'){g.moveTo(0,-r*0.9);g.bezierCurveTo(-r*1.4,0,-r*1.15,r*1.15,-r*0.28,r*0.8);g.bezierCurveTo(-r*0.05,r*0.7,0,r*0.45,0,r*0.45);g.bezierCurveTo(r*0.8,r*1.4,r*1.65,r*0.05,0,-r*0.9);g.fill();}
        else if(kind==='star'){for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,d=i%2?r*0.42:r;const px=Math.cos(a)*d,py=Math.sin(a)*d;if(!i)g.moveTo(px,py);else g.lineTo(px,py);}g.close();g.fill();}
        else if(kind==='close'){g.circle(0,0,r);g.stroke();g.moveTo(-r*0.4,-r*0.4);g.lineTo(r*0.4,r*0.4);g.moveTo(-r*0.4,r*0.4);g.lineTo(r*0.4,-r*0.4);g.stroke();}
        else if(kind==='quests'){g.arc(0,0,r,-0.1,Math.PI*1.7,false);g.stroke();g.moveTo(-r*0.55,0);g.lineTo(-r*0.1,-r*0.4);g.lineTo(r*0.95,r*0.85);g.stroke();}
        else if(kind==='book'){g.roundRect(-r*0.75,-r,r*1.5,r*2,r*0.12);g.stroke();g.moveTo(-r*0.42,r*0.65);g.lineTo(0,r*0.3);g.lineTo(r*0.42,r*0.65);g.lineTo(r*0.42,r*0.9);g.lineTo(-r*0.42,r*0.9);g.close();g.fill();}
        else if(kind==='settings'){g.circle(0,0,r*0.62);g.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;g.moveTo(Math.cos(a)*r*0.64,Math.sin(a)*r*0.64);g.lineTo(Math.cos(a)*r,Math.sin(a)*r);g.stroke();}}
        else if(kind==='restart'){g.arc(0,0,r,Math.PI*0.1,Math.PI*1.8,false);g.stroke();g.moveTo(r*0.28,r);g.lineTo(r*0.91,r*0.82);g.lineTo(r*0.61,r*0.18);g.stroke();}
        else if(kind==='lock'){g.roundRect(-r*0.75,-r,r*1.5,r*1.2,r*0.15);g.stroke();g.arc(0,r*0.22,r*0.5,0,Math.PI,false);g.stroke();g.circle(0,-r*0.35,r*0.12);g.fill();}
        else if(kind==='play'){g.circle(0,0,r);g.stroke();g.moveTo(-r*0.27,-r*0.5);g.lineTo(r*0.5,0);g.lineTo(-r*0.27,r*0.5);g.close();g.fill();}
        else if(kind==='card'){g.roundRect(-r*0.65,-r,r*1.3,r*2,r*0.15);g.stroke();g.moveTo(0,r*0.5);g.lineTo(r*0.3,0);g.lineTo(0,-r*0.5);g.lineTo(-r*0.3,0);g.close();g.fill();}
        else {g.roundRect(-r,-r*0.7,r*2,r*1.4,r*0.15);g.stroke();g.moveTo(0,-r*0.7);g.lineTo(0,r*0.7);g.stroke();g.ellipse(-r*0.3,r*0.9,r*0.32,r*0.2);g.ellipse(r*0.3,r*0.9,r*0.32,r*0.2);g.stroke();}
    }
    protected onDestroy(): void { this.lifetime.dispose();super.onDestroy();for(const frame of this.sprites.values())frame.decRef();this.sprites.clear(); }
}
