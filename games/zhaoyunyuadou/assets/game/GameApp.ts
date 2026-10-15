import { AudioSource, BlockInputEvents, Button, Color, director, Director, EventKeyboard, EventMouse, EventTouch, Game, game, Graphics, Input, input, isValid, KeyCode, Label, Mask, Node, ScrollView, Sprite, sys, UITransform, UIOpacity, Vec2, Vec3 } from 'cc';
import { ArtStore } from './ArtStore';
import { Element, inkColor, InkUI } from './InkUI';
import { InkRig } from './InkRig';
import { BOSSES } from './ReferenceCombat';
import { BASIC_UNITS, isBasicKind, UnitFramePlayer } from './ReferenceUnits';
import { HERO_RIGS, heroAppearance, HeroMotion } from './ReferenceHeroes';
import { KNIFE_TRAILS, WeaponGeometry, weaponGeometry, WeaponMotion, WeaponType } from './ReferenceWeapons';
import { HERO_SKILLS, HeroSkillState, shoutRing } from './ReferenceHeroSkills';
import { characterLevelCap, heroExperienceTable } from './ReferenceProgression';
import { flyingPikePose, groundPikePose } from './ReferenceSpecialWeapons';
import { Battle, claimResult, dayKey, equipWeapon, GLYPHS, Hero, HEROES, Item, ITEMS, Location, MAPS, newProfile, Profile, purchase, Random, rankName, recycleWeapons, refreshProfile, restoreProfile, Side, Unit } from './GameModel';

const PROFILE_KEY = 'zya.cocos.profile.v1', ROUND_KEY = 'zya.cocos.round.v1';
const skin = (group: string, name: string) => 'resources/img/' + group + '/' + name + '.png';
interface ActorView { node: Node; glyph: Node; level: Node; unit: Unit; last: string; motion?:Node;frame?:UnitFramePlayer;frameParent?:Node;frameX?:number;frameY?:number;pikeFrom?:number;turn?:{mode:string;from:number;to:number;elapsed:number}; }
interface WeaponView {parent:Node;root:Node;body:Node;trail?:Node;nocked?:Node;id:number;spec:WeaponGeometry;motion:WeaponMotion;}
interface HeroView {node:Node;rigs?:InkRig[];unit:Unit;hero:Hero;side:Side;left:number;level:number;ready:boolean;motion:HeroMotion;skin?:string;weapon?:WeaponView;}
interface SkillView {node:Node;rig?:InkRig;weapon?:Node;}
interface Drag { location?: Location; item?: string; weaponId?:number; startX: number; startY: number; node: Node; moved: boolean; }

export class GameApp {
    root: Node; ui: InkUI; art = new ArtStore(); profile: Profile; battle: Battle | null = null;
    page = 'loading'; height = 1386; alive = true; suspended = false;
    private screen: Element; private overlay: Node | null = null; private overlayUI: InkUI | null = null;
    private unitInfoUpdate:(()=>void)|null=null;
    private rigs: InkRig[] = [];private battleClocks:InkRig[]=[]; private actors = new Map<number,ActorView>(); private mobs = new Map<number,Node>();
    private projectiles = new Map<number,Node>(); private effects = new Map<number,Node>();
    private skillViews=new Map<number,SkillView>();
    private board: Node; private reserve: Node; private combatLayer: Node; private heroLayer: Node;
    private tutorial: Node; private revision = -1; private drag: Drag | null = null;
    private saveTime = 0; private soundGate = 0; private audio: AudioSource; private pageToken = 0;
    private music: AudioSource; private musicNode:Node; private musicToken=0; private musicTrack='';
    private weaponPage = 0; private selectedHero = HEROES[0].name; private storePage = 'shop';
    private overlayKind = '';
    private overlayStack: {node:Node;ui:InkUI;kind:string}[]=[];
    private offersToken='';
    private heroViews=new Map<string,HeroView>();private hazeNode:Node|null=null;
    private pointerDispatcher:any;
    private offers: Item[] = []; private toastNode: Node | null = null; private toastTime = 0; private matchTime = 0;
    private touched = false; private bindingTouch: ((e:EventTouch)=>void) | null = null;
    private key = (e: EventKeyboard) => {
        if (e.keyCode === KeyCode.ESCAPE) { if (this.overlay) this.closeOverlay(); else if (this.page === 'battle') this.pause(); }
        if (e.keyCode === KeyCode.SPACE && this.page === 'battle' && !this.overlay) this.recruit();
    };
    private hide = () => { this.suspended = true; this.cancelDrag(); this.save(); this.audio?.stop();this.music?.pause(); };
    private show = () => { this.suspended = false; refreshProfile(this.profile);if(this.touched&&this.profile.settings.music>0)this.music?.play(); if (this.page === 'battle' && !this.overlay && !this.battle?.completed) this.pause(); };
    constructor(public canvas: Node) {
        this.height = canvas.getComponent(UITransform)!.height / 1.125;
        this.root = new Node('赵云与阿斗'); canvas.addChild(this.root); this.root.layer = canvas.layer;
        this.root.addComponent(UITransform).setContentSize(640,this.height); this.root.getComponent(UITransform)!.setAnchorPoint(0,1);
        this.root.setPosition(-360,canvas.getComponent(UITransform)!.height/2); this.root.setScale(1.125,1.125);
        this.ui = new InkUI(this.root,this.art,this.height); this.audio = this.root.addComponent(AudioSource);
        this.musicNode=new Node('ZYA soundtrack');canvas.addChild(this.musicNode);this.music=this.musicNode.addComponent(AudioSource);this.music.loop=true;
        this.root.on(Node.EventType.TOUCH_START,()=>{this.touched=true;if(this.music.clip&&!this.music.playing&&this.profile.settings.music>0)this.music.play();});
        this.profile = restoreProfile(sys.localStorage.getItem(PROFILE_KEY));
        // Creator 3.8.8 dispatches UI pointers before global input listeners.
        // Capture an existing drag's raw end/cancel before a button swallows it.
        this.pointerDispatcher={priority:2,dispatchEvent:(event:any)=>{if(!this.alive||!this.drag)return true;
            if(event.type===Input.EventType.TOUCH_CANCEL)this.cancelDrag();
            else if(event.type===Input.EventType.TOUCH_MOVE||event.type===Input.EventType.MOUSE_MOVE)this.dragMove(event);
            else if(event.type===Input.EventType.TOUCH_END||event.type===Input.EventType.MOUSE_UP&&event.getButton()===0)this.dragEnd(event);
            return true;},onThrowException:()=>this.cancelDrag()};
        (input as any)._registerEventDispatcher(this.pointerDispatcher);
        input.on(Input.EventType.KEY_DOWN,this.key); game.on(Game.EVENT_HIDE,this.hide); game.on(Game.EVENT_SHOW,this.show);
    }
    async start() {
        this.ui.rect(this.root,0,0,640,this.height,'#eee2d2');
        try {
            await this.art.initialize(); await this.art.group('common'); if(!this.alive)return;
            await this.art.layout('LoadScene');if(!this.alive)return;this.ui.dispose();this.screen = this.ui.scene('LoadScene');
            this.ui.setText('loadingTxt','正在加载…');
            await this.firstDraw();if(!this.alive)return;
            await this.art.group('home'); if(!this.alive)return;
            await this.home();
            const saved = sys.localStorage.getItem(ROUND_KEY);
            if(saved) {
                this.battle=Battle.restore(saved,this.profile,this.art.weapons);
                if(this.battle?.completed && this.battle.result && !this.profile.rewards.includes(this.battle.result.id)) await this.result();
                else if(this.battle && !this.battle.completed) this.confirm('上次战斗还未结束，是否继续？','继续战斗',()=>this.showBattle(),()=>{sys.localStorage.removeItem(ROUND_KEY);this.battle=null;});
            }
            await this.firstDraw();if(!this.alive)return;console.info('[ZYA] READY',JSON.stringify(this.art.metrics()));
            if((globalThis as any).__ZYA_QA__) (globalThis as any).__ZYA_APP__=this;
        } catch(error) {
            console.error('[ZYA] boot failed',error); this.ui.text(this.root,'加载失败，点击重试',80,this.height/2+70,480,60,30,'#8d3526');
            this.ui.button(this.root,()=>this.start());
        }
    }
    private firstDraw(){return new Promise<void>(resolve=>director.once(Director.EVENT_AFTER_DRAW,resolve));}
    private clear(page: string) {
        this.pageToken++; this.cancelDrag(); this.closeAllOverlays(); this.rigs=[];
        this.actors.clear();this.mobs.clear();this.projectiles.clear();this.effects.clear();this.skillViews.clear();this.heroViews.clear();this.battleClocks=[];this.hazeNode=null;
        this.ui.dispose();this.page=page;this.screen=null;this.revision=-1;this.toastNode=null;this.toastTime=0;
    }
    private async prepare(page: string, groups: string[]) {
        const token=++this.pageToken; await Promise.all(groups.map(group=>this.art.group(group)));
        return this.alive && token===this.pageToken;
    }
    private bind(name:string,callback:()=>void,within?:Element){this.ui.button(this.ui.find(name,within),()=>{this.play('btn_down');callback();});}
    private async rig(parent:Node,source:string,animation:string,x:number,y:number,scale=1,referenceOrigin=false,battleClock=false) {
        const token=this.pageToken,data=await this.art.actor(source);
        if(!this.alive||token!==this.pageToken||!isValid(parent,true))return;
        const n=this.ui.node('actor:'+source,parent,x,y,1,1);n.setScale(scale,scale);
        const rig=new InkRig(n,this.art,source,data,animation,referenceOrigin);this.rigs.push(rig);if(battleClock){rig.simulationClock=true;this.battleClocks.push(rig);rig.seek(this.battle?.time||0);}return rig;
    }
    async home() {
        if(!await this.prepare('home',['home']))return;const token=this.pageToken;await this.art.layout('MainScene');if(!this.alive||token!==this.pageToken)return;this.clear('home');
        void this.setMusic('music/bg_mainScene');
        this.screen=this.ui.scene('MainScene');const box=this.ui.find('box',this.screen)!;
        this.ui.setText('goldTxt',this.profile.gold.toString(),this.screen);this.ui.setText('staminaTxt',this.profile.stamina.toString(),this.screen);
        this.ui.setText('rankTxt',rankName(this.profile.stars),this.screen);this.ui.show('star5',false,this.screen);
        this.ui.find('staminaTxt',this.screen)!.body.getComponent(Label)!.color=inkColor(this.profile.stamina<1?'#e95b55':this.profile.stamina<=10?'#2797d6':'#f7de76');
        for(let i=0;i<5;i++){const e=this.ui.find('star'+i,this.screen);if(e)this.ui.skin(e.body,skin('gameOverUI',i<(this.profile.stars-1)%5+1?'star4':'star3'));}
        const avatar=this.ui.find('avatarImg',this.screen);if(avatar)this.ui.skin(avatar.body,skin('mainUI','avatar/avatar'+this.profile.avatar));
        this.ui.show('followBtn',false,this.screen);this.ui.show('ageTip',false,this.screen);
        this.ui.show('dySidebarBtn',true,this.screen);
        this.ui.show('shopBtn',this.profile.wins+this.profile.losses>0,this.screen);
        this.ui.show('shopWalk',false,this.screen);
        this.ui.show('colLight',false,this.screen);this.ui.show('dySidebarBtnLight',false,this.screen);
        this.bind('playBtn',()=>this.startRound());this.bind('settingBtn',()=>this.settings());
        this.bind('shopBtn',()=>this.shop());this.bind('weaponBtn',()=>this.weapons());this.bind('rankBtn',()=>this.ranks());
        this.bind('avatarArea',()=>this.avatars());this.bind('addStaminaBtn',()=>this.stamina());this.bind('dySidebarBtn',()=>this.dailyReward());
        const talk=this.ui.find('talkHitArea',this.screen);this.ui.button(talk,()=>this.toast('赵云何在？'));
        const mat=this.ui.find('mat',this.screen)!.body;
        await this.rig(mat,'resources/anim/aDou/skeleton.json','zhan2',25,-105,2,true);
        this.ui.image(mat,skin('gameObject','enemy/shadow1'),-30,165,200,60);
        await this.rig(mat,'resources/anim/zhaoYun/skeleton_zh.json','shouye',30,195,2);
        await this.rig(mat,'resources/anim/zhaoYun/skeleton_zh.json','zhan2',130,200,2);
        this.save();
    }
    private async startRound(mapId?:number) {
        if(this.page!=='home'||this.overlay)return;refreshProfile(this.profile);
        if(this.profile.stamina<1){this.stamina();return;}
        this.profile.stamina--;this.profile.staminaAt=Date.now();
        const seed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;
        this.battle=new Battle(this.profile,this.art.weapons,mapId===undefined?(this.profile.tutorial?this.profile.day%4:0):mapId,seed,!this.profile.tutorial);
        this.save();this.clear('match');this.screen=this.ui.scene('MatchScene');
        this.ui.setText('title','开始匹配',this.screen);this.ui.setText('blueRank',rankName(Math.max(1,this.profile.stars)),this.screen);
        this.ui.setText('redRank',rankName(this.profile.stars),this.screen);
        const rate=this.profile.wins+this.profile.losses?Math.round(this.profile.wins/(this.profile.wins+this.profile.losses)*1000)/10:0;
        this.ui.setText('redWinRate',rate+'%',this.screen);this.ui.setText('blueWinRate','39.6%',this.screen);
        for(const name of ['propBlueLine1','propBlueLine2','propRedLine1','propRedLine2','redPropEffect','bluePropEffect'])this.ui.show(name,false,this.screen);
        for(const name of ['blueAvatar','redAvatar']){const e=this.ui.find(name,this.screen);if(e)this.ui.skin(e.body,skin('mainUI','avatar/avatar'+(name==='redAvatar'?this.profile.avatar:4)));}
        this.ui.show('vs',true,this.screen);this.matchTime=1.8;this.play('match_drum');
        void this.art.group('maps');void this.art.group('battle');void this.art.group('effects');
    }
    async showBattle() {
        if(!this.battle)return;if(!await this.prepare('battle',['maps','battle','effects','actors']))return;
        this.clear('battle');this.screen=this.ui.scene('BattleScene');
        void this.setMusic('music/bg_battleScene_'+(this.battle.map.id===3?3:0));
        const box=this.ui.find('box',this.screen)!;
        const backdrop=this.ui.find('bg',this.screen)!;this.ui.skin(backdrop.body,skin('map','bg_'+this.battle.map.id));
        const decorations=this.ui.mount(this.art.layouts['mapBg'+this.battle.map.id],box.body,640,1386);decorations.node.setSiblingIndex(0);
        const title=this.ui.find('mapTitle',this.screen)!;this.ui.skin(title.body,skin('map','mapBg/mapBg'+this.battle.map.id+'/title_zh'));
        this.board=this.ui.find('map',this.screen)!.body;this.reserve=this.ui.find('refreshBox',this.screen)!.body;
        this.ui.show('propsBox',false,this.screen);this.ui.show('propsBoxAi',false,this.screen);
        this.ui.show('pathTip0',false,this.screen);this.ui.show('pathTip1',false,this.screen);
        this.ui.show('end1',false,this.screen);this.ui.show('end2',false,this.screen);
        this.ui.show('shovelAd',false,this.screen);
        const mask=this.ui.find('maskImg',this.screen)!,oldMask=mask.body,position=oldMask.position.clone();oldMask.active=false;oldMask.destroy();
        mask.body=this.ui.node('$body',mask.node,position.x,-position.y,260,131);
        mask.body.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        this.ui.image(mask.body,skin('battleUI','btn2'),0,0,260,131);
        const divide=this.ui.find('divide',this.screen)!;divide.node.setPosition(0,-this.battle.map.divideY);
        divide.node.getComponent(UITransform)!.setContentSize(this.battle.map.divideWidth,this.battle.map.divideHeight);divide.body.getComponent(UITransform)!.setContentSize(this.battle.map.divideWidth,this.battle.map.divideHeight);
        this.ui.skin(divide.body,skin('map','divide_'+this.battle.map.id));
        this.heroLayer=this.ui.node('hero borders',this.board,0,0,640,800);
        this.combatLayer=this.ui.node('dynamic battle',this.ui.find('gameObjectBox',this.screen)!.body,0,0,640,800);
        const tiles=this.ui.node('map tiles',this.board,0,0,640,800);tiles.setSiblingIndex(0);
        for(let n=0;n<80;n++) {
            const isGrass=this.battle.map.grass.includes(n),name='tile-'+n;
            this.ui.image(tiles,skin('map',isGrass?'grass_'+this.battle.map.id+'_'+this.battle.map.owners[n]:'road_'+this.battle.map.id),n%8*80,Math.floor(n/8)*80,80,80,undefined,name);
        }
        for(let n=0;n<5;n++)this.ui.image(this.reserve,skin('map','refresh_'+this.battle.map.id+'_'+(n===0?0:1)),n*90,0,90,90,undefined,'reserve-'+n);
        const outline=this.ui.node('terrain outlines',this.board,0,0,640,800),g=outline.addComponent(Graphics);g.fillColor=Color.BLACK;
        // Reference V$: black 3 px terrain edges and a 6 px outer border.
        // Filled strips preserve vertical and horizontal coverage in Cocos.
        const edge=(ax:number,ay:number,bx:number,by:number,width:number)=>{
            if(ax===bx)g.rect(ax-width/2,-Math.max(ay,by),width,Math.abs(by-ay));
            else g.rect(Math.min(ax,bx),-ay-width/2,Math.abs(bx-ax),width);
        };
        for(const cell of this.battle.map.grass){const col=cell%8,row=Math.floor(cell/8),x=col*80,y=row*80;
            for(const[neighbor,inside,ax,ay,bx,by]of [[cell-8,row>0,x,y,x+80,y],[cell+8,row<9,x,y+80,x+80,y+80],[cell-1,col>0,x,y,x,y+80],[cell+1,col<7,x+80,y,x+80,y+80]] as [number,boolean,number,number,number,number][]){
                if(inside&&!this.battle.map.grass.includes(neighbor))edge(ax,ay,bx,by,3);
            }
        }
        edge(0,0,640,0,6);edge(0,800,640,800,6);edge(0,0,0,800,6);edge(640,0,640,800,6);g.fill();
        for(const cell of this.battle.map.entries){const pos=this.battle.position(cell);await this.rig(this.board,'resources/anim/grass/skeleton.json','idle'+this.battle.map.id,pos.x,pos.y+40,1,false,true);}
        for(const side of [0,1] as Side[]) {
            const cell=this.battle.map.paths[side].slice(-1)[0],pos=this.battle.position(cell);
            const a=this.ui.node('adou-'+side,this.board,pos.x-40,pos.y-40,80,80);
            await this.rig(a,'resources/anim/aDou/skeleton.json','zhan',45-49.33/2,70-78.62,1,true,true);
        }
        this.board.on(Node.EventType.TOUCH_START,(e:EventTouch)=>this.dragStart(e,'board'));
        this.reserve.on(Node.EventType.TOUCH_START,(e:EventTouch)=>this.dragStart(e,'reserve'));
        this.bind('refreshBtn',()=>this.recruit());this.bind('xBtn',()=>this.pause());this.bind('deckBtn',()=>this.deck());
        this.battle.paused=false;this.drawBattle();this.save();
    }
    private glyph(unit:Unit) {
        if(unit.kind==='字'){const prefix='soldier/generalParts_'+GLYPHS.indexOf(unit.char),upgraded=skin('gameObject',prefix+'_'+unit.level+'_zh');return unit.level>=4&&this.art.art.frames[upgraded]?upgraded:skin('gameObject',prefix+'_zh');}
        if(unit.kind==='农')return skin('gameObject','soldier/farmer_zh');
        if(unit.kind==='铲')return skin('props',this.battle?.has('seeker')?'shovel_2':'shovel_1');
        return skin('gameObject','soldier/soldier_'+['刀','弓','枪','骑'].indexOf(unit.kind)+'_zh');
    }
    private unitView(unit:Unit,parent:Node,x:number,y:number,size:number):ActorView {
        const n=this.ui.node('unit-'+unit.id,parent,x,y,size,size),path=this.glyph(unit),spec=this.art.art.frames[path];
        const w=spec?.rect[2]||60,h=spec?.rect[3]||60,ratio=65/Math.max(w,h);
        const glyph=this.ui.image(n,path,(size-w*ratio)/2,(size-h*ratio)/2,w*ratio,h*ratio);
        glyph.getComponent(Sprite)!.trim=true;
        const level=this.ui.image(n,skin('gameObject','bitmapFont/number5'),size-20,0,18,25);level.active=unit.kind!=='铲';level.getComponent(Sprite)!.spriteFrame=this.art.digit(skin('gameObject','bitmapFont/number5'),unit.level-1);
        if(unit.kind==='字')glyph.getComponent(Sprite)!.color=inkColor('#b4853d');
        const view:ActorView={node:n,glyph,level,unit,last:unit.char+unit.level};
        if(isBasicKind(unit.kind)&&this.battle)this.animateBasicUnit(view,0);
        else this.sizeWord(view,size);
        return view;
    }
    private sizeWord(view:ActorView,size:number){
        if(!['字','农'].includes(view.unit.kind))return;
        const glyph=view.glyph;glyph.getComponent(Sprite)!.trim=false;glyph.getComponent(Sprite)!.color=view.unit.kind==='字'?inkColor('#cd8831'):Color.WHITE;
        glyph.getComponent(UITransform)!.setContentSize(80,80);glyph.getComponent(UITransform)!.setAnchorPoint(0,1);glyph.setScale(1,1);glyph.angle=0;glyph.setPosition((size-80)/2,-(size-80)/2);
    }
    private drawBattle() {
        const b=this.battle;if(!b||this.page!=='battle')return;
        const exists=new Set<number>();
        for(const side of [0,1] as Side[]) {
            const army=b.armies[side];
            for(const cell of b.map.grass.filter(cell=>b.owns(side,cell))) {
                const tile=this.board.getChildByName('map tiles')?.getChildByName('tile-'+cell);
                if(tile)this.ui.skin(tile,skin('map',army.unlocked.includes(cell)?'space_'+b.map.id:'grass_'+b.map.id+'_'+side));
            }
            for(const key of Object.keys(army.units)) {
                const cell=Number(key),unit=army.units[cell];exists.add(unit.id);
                let v=this.actors.get(unit.id);if(!v){v=this.unitView(unit,this.combatLayer,cell%8*80,Math.floor(cell/8)*80,80);this.actors.set(unit.id,v);}
                if(v.node.parent!==this.combatLayer)v.node.setParent(this.combatLayer);
                v.node.setPosition(cell%8*80,-Math.floor(cell/8)*80);
                this.ui.skin(v.glyph,this.glyph(unit));v.glyph.getComponent(Sprite)!.trim=true;v.glyph.getComponent(Sprite)!.color=Color.WHITE;
                v.glyph.active=true;v.level.active=true;
                v.level.getComponent(Sprite)!.spriteFrame=this.art.digit(skin('gameObject','bitmapFont/number5'),unit.level-1);v.unit=unit;
                this.sizeWord(v,80);
            }
        }
        for(let i=0;i<5;i++) {
            const unit=b.armies[0].reserve[i];if(!unit)continue;exists.add(unit.id);
            let v=this.actors.get(unit.id);if(!v){v=this.unitView(unit,this.reserve,i*90,0,90);this.actors.set(unit.id,v);}
            if(v.node.parent!==this.reserve)v.node.setParent(this.reserve);v.node.setPosition(i*90,0);v.level.getComponent(Sprite)!.spriteFrame=this.art.digit(skin('gameObject','bitmapFont/number5'),unit.level-1);v.unit=unit;
            this.ui.skin(v.glyph,this.glyph(unit));v.glyph.getComponent(Sprite)!.trim=true;v.glyph.getComponent(Sprite)!.color=Color.WHITE;
            v.glyph.active=true;v.level.active=unit.kind!=='铲';
            this.sizeWord(v,90);
        }
        for(const [id,v]of Array.from(this.actors.entries()))if(!exists.has(id)){v.node.destroy();this.actors.delete(id);}
        this.heroLayer.destroyAllChildren();
        const heroKeys=new Set<string>();
        for(const side of [0,1] as Side[])for(const link of b.heroes(side)) {
            const look=heroAppearance(link.hero.name,link.level),bg=this.ui.image(this.heroLayer,skin('gameObject','soldier/generalBg'+look.background),link.left%8*80,Math.floor(link.left/8)*80,160,80);
            this.ui.image(bg,skin('gameObject','soldier/generalBg'+look.border),-4,-4,168,88);
            for(const cell of [link.left,link.right]){
                const v=this.actors.get(b.armies[side].units[cell].id);if(v)v.glyph.getComponent(Sprite)!.color=inkColor(look.color);
                if(v){v.level.active=cell===link.right;v.level.getComponent(Sprite)!.spriteFrame=this.art.digit(skin('gameObject','bitmapFont/'+look.digits),link.level-1);}
            }
            bg.name='hero:'+link.hero.name;
            const unit=b.armies[side].units[link.left],key=side+':'+unit.id+':'+link.hero.name;
            heroKeys.add(key);let view=this.heroViews.get(key);
            if(!view){const node=this.ui.node('general-'+key,this.combatLayer,0,0,160,80);view={node,unit,hero:link.hero,side,left:link.left,level:link.level,ready:false,motion:new HeroMotion(unit.attacks-(unit.cooldown>0?1:0))};this.heroViews.set(key,view);
                if(unit.attacks>0&&(unit.cooldown>0||(unit.weaponUntil||0)>b.time)){
                    const stats=b.stats(unit,link.hero,link.level,side);view.motion.seenAttacks=unit.attacks;view.motion.attacking=true;view.motion.elapsed=Math.max(0,b.time-(unit.weaponAt??(b.time-stats.interval+unit.cooldown)))*link.hero.speed/stats.interval;
                }
                if(HERO_RIGS[link.hero.name]){const captured=view,source='resources/anim/'+HERO_RIGS[link.hero.name]+'/skeleton_zh.json';void Promise.all([this.rig(node,source,'zhan1',40,80,1),this.rig(node,source,'zhan2',120,80,1)]).then(rigs=>{if(rigs.every(Boolean)&&isValid(node,true)){captured.rigs=rigs as InkRig[];captured.ready=true;this.revision=-1;}});}
                else view.ready=true;
            }
            const weaponId=b.stats(unit,link.hero,link.level,side).weapon?.id??-1;
            if(!view.weapon||view.weapon.id!==weaponId){view.weapon?.parent.destroy();view.weapon=this.heroWeapon(view,weaponId);}
            if(view.left!==link.left){view.motion.reset(unit.attacks);view.weapon.motion.reset(unit.attacks);}
            view.unit=unit;view.left=link.left;view.level=link.level;view.node.setPosition(link.left%8*80,-Math.floor(link.left/8)*80);
            view.node.setSiblingIndex(0); // Name sprites and level markers remain above the rig/weapon.
            if(view.rigs&&view.skin!==look.skin){for(const rig of view.rigs)rig.useSkin(look.skin);view.skin=look.skin;}
            if(view.rigs&&view.ready)for(const cell of [link.left,link.right]){const v=this.actors.get(b.armies[side].units[cell].id);if(v)v.glyph.active=false;}
            view.weapon.parent.setSiblingIndex(view.node.children.length-1);
        }
        for(const[key,view]of Array.from(this.heroViews.entries()))if(!heroKeys.has(key)){view.node.destroy();this.heroViews.delete(key);}
        this.ui.setText('goldNum',Math.floor(b.armies[0].food).toString(),this.screen);this.ui.setText('goldNumTxt',b.cost().toString(),this.screen);this.ui.setText('round','第'+b.wave+'波',this.screen);
        this.ui.find('maskImg',this.screen)!.body.getComponent(UITransform)!.setContentSize(260*Math.min(1,b.armies[0].food/b.cost()),131);
        for(const side of [0,1] as Side[]) {
            this.removeNamed(this.board,'lives-'+side);const pos=b.position(b.map.paths[side].slice(-1)[0]);
            const lives=this.ui.node('lives-'+side,this.board,pos.x-40,pos.y-40,80,35),count=b.armies[side].lives,rows=Math.ceil(count/3);
            // Original heart prefab is 25×19 with a centered pivot; K$ stacks
            // surviving hearts in rows of three above the endpoint.
            for(let i=0;i<count;i++)this.ui.image(lives,skin('battleUI','heart1'),i%3*26-2.5,-20*(rows-Math.floor(i/3)-1)-30.5,25,19);
        }
        const box=this.ui.find('box',this.screen)!.body;
        this.removeNamed(box,'items-runtime');const items=this.ui.node('items-runtime',box,20,1138,600,240);
        let active=0,passive=0;
        for(const id of this.profile.items) {
            const item=ITEMS.find(p=>p.id===id);if(!item)continue;
            const x=item.active?50+active++*420:passive++*101,y=item.active?36:147;
            const frame=this.ui.image(items,skin('props',item.active?'activePropsBgNew':'passivePropsBgNew'),x-(item.active?14:0),y-(item.active?14:0),item.active?108:100,item.active?108:100);frame.name='item-'+item.id;
            this.ui.image(frame,skin('props',item.image),item.active?14:10,item.active?14:10,80,80,undefined,'item-icon');
            if(item.active)this.ui.text(frame,'',5,29,98,54,35,'#ffffff',5).name='remaining';
            if(item.active)frame.on(Node.EventType.TOUCH_START,(e:EventTouch)=>this.itemDrag(e,item.id));
            else this.ui.button(frame,()=>this.toast(item.description));
        }
        this.rigs=this.rigs.filter(rig=>isValid(rig.root));
        this.tutorial?.destroy();this.tutorial=null;
        if(b.tutorialStep===1||b.tutorialStep===2) {
            // Calibrated to the larger caption in the public WeChat 320×704
            // screenshot; the native 1.0.9 controller uses 40 px text.
            this.tutorial=this.ui.text(box,b.tutorialStep===1?'点击下方红色按钮 征召士兵':'拖动营地中的字 放到白色格子',15,294,610,70,45,'#FFD700',5);
            const label=this.tutorial.getComponent(Label)!;label.isBold=true;label.outlineColor=inkColor('#7B2800');
        }
        this.revision=b.revision;
    }
    private removeNamed(parent:Node,name:string){
        // destroy() is deferred; detach every old instance before reusing a name.
        for(const child of parent.children.filter(child=>child.name===name)){child.removeFromParent();child.destroy();}
    }
    private recruit() {
        if(this.page!=='battle'||this.overlay||!this.battle)return;
        const message=this.battle.recruit();if(message)this.toast(message);else{this.play('soldier_create');this.drawBattle();this.save();}
    }
    private coordinates(e:EventTouch,n=this.root) {
        const p=e.getUILocation(),v=n.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x,p.y));return {x:v.x,y:-v.y};
    }
    private dragStart(e:EventTouch,area:'board'|'reserve') {
        if(this.overlay||this.drag||!this.battle||this.battle.paused)return;
        const p=this.coordinates(e,area==='board'?this.board:this.reserve),index=area==='board'?Math.floor(p.y/80)*8+Math.floor(p.x/80):Math.floor(p.x/90);
        const location:Location={area,index},unit=this.battle.get(location);if(!unit)return;
        const root=this.coordinates(e),v=this.unitView(unit,this.root,root.x-40,root.y-40,80);
        v.node.setSiblingIndex(this.root.children.length-1);this.drag={location,startX:root.x,startY:root.y,node:v.node,moved:false};
    }
    private itemDrag(e:EventTouch,id:string) {
        if(this.overlay||this.drag||!this.battle||this.battle.paused)return;
        const item=ITEMS.find(i=>i.id===id)!,p=this.coordinates(e);
        const n=this.ui.image(this.root,skin('props',item.image),p.x-40,p.y-40,80,80);this.drag={item:id,startX:p.x,startY:p.y,node:n,moved:false};
    }
    private dragMove(e:EventTouch) {
        const d=this.drag;if(!d)return;const p=this.coordinates(e);
        if(Math.hypot(p.x-d.startX,p.y-d.startY)>7)d.moved=true;const size=d.node.getComponent(UITransform)!;d.node.setPosition(p.x-size.width/2,-p.y+size.height/2);
    }
    private dragEnd(e:EventTouch) {
        const d=this.drag;if(!d)return;
        if(d.weaponId!==undefined){const id=d.weaponId,moved=d.moved,p=this.coordinates(e,this.ui.find('generalPanel',this.screen)!.body);this.cancelDrag();if(!moved){this.weaponInfo(id);return;}if(p.x<0||p.x>=604||p.y<0||p.y>=291)return;
            const hero=HEROES[Math.floor(p.y/95)*4+Math.floor(p.x/150)];if(!hero)return;const error=equipWeapon(this.profile,this.art.weapons,hero.name,id);if(error)this.toast(error);else{this.selectedHero=hero.name;this.save();this.weapons();this.play('soldier_set');}return;}
        if(!this.battle){this.cancelDrag();return;}const p=this.coordinates(e,this.board),r=this.coordinates(e,this.reserve);let error='';
        if(d.item){const target:Location|undefined=p.x>=0&&p.x<640&&p.y>=0&&p.y<800?{area:'board',index:Math.floor(p.y/80)*8+Math.floor(p.x/80)}:r.x>=0&&r.x<450&&r.y>=0&&r.y<90?{area:'reserve',index:Math.floor(r.x/90)}:undefined;error=target?this.battle.active(d.item,target.index,target):'拖到战场或营地使用';}
        else if(d.location) {
            if(!d.moved){const unit=this.battle.get(d.location);this.cancelDrag();if(unit)this.unitInfo(unit,d.location);return;}
            let target:Location|null=null;
            if(p.x>=0&&p.x<640&&p.y>=0&&p.y<800)target={area:'board',index:Math.floor(p.y/80)*8+Math.floor(p.x/80)};
            else if(r.x>=0&&r.x<450&&r.y>=0&&r.y<90)target={area:'reserve',index:Math.floor(r.x/90)};
            if(target)error=this.battle.move(d.location,target);
        }
        this.cancelDrag();if(error)this.toast(error);else this.play('soldier_set');this.drawBattle();this.save();
    }
    private cancelDrag(){if(this.drag){this.drag.node.destroy();this.drag=null;}}
    private drawDynamic(dt:number) {
        const b=this.battle!;const current=new Set<number>();
        for(const rig of this.battleClocks)if(isValid(rig.root,true))rig.seek(b.time);
        for(const enemy of b.enemies){
            current.add(enemy.id);let n=this.mobs.get(enemy.id);
            if(!n){
                n=this.ui.node('enemy-'+enemy.id,this.combatLayer,0,0,80,80);
                this.ui.image(n,skin('gameObject','enemy/shadow1'),16,51,47,20);
                const glyph=this.ui.image(n,skin('gameObject','enemy/mob_0_zh'),40,80,80,80,undefined,'mob-glyph');glyph.getComponent(UITransform)!.setAnchorPoint(.5,0);if(enemy.boss){glyph.getComponent(Sprite)!.color=inkColor('#d3382f');glyph.setScale(1.5,1.5);}
                if(enemy.bossType!==undefined){const type=enemy.bossType,sources=['boss0','boss0','boss0','boss1','boss1','boss1','huaXiong','lvBu','dongZhuo','boss2','boss2','boss2'],animations=['goliang','gobao','gojiao','goxiang','gozhen','godiao','gohx','golvbu','godz','godian','goxia','gocao'];
                    const captured=n;void this.rig(n,'resources/anim/'+sources[type]+'/skeleton_zh.json',animations[type],40,65,.8).then(rig=>{if(rig&&isValid(captured,true)){glyph.active=false;(captured as any).__rig=rig;}});
                    this.ui.text(n,BOSSES[type].name,0,-40,80,32,23,'#edcf73',4);}
                const hpY=enemy.boss?-40:3;this.ui.image(n,skin('gameObject','enemy/hpBg'),12,hpY,62,11);
                this.ui.image(n,skin('gameObject','enemy/hp1'),16,hpY+3,54,5,undefined,'hp');
                this.ui.text(n,'',20,hpY-6,47,21,20,'#ffffff',5).name='hpNum';this.mobs.set(enemy.id,n);
            }
            n.setPosition(enemy.x-40,-enemy.y+40);const hp=n.getChildByName('hp')!;hp.setScale(Math.max(0,enemy.hp/enemy.maxHp),1);
            n.getChildByName('hpNum')!.getComponent(Label)!.string=Math.ceil(enemy.hp).toString();
            const piercing=b.effects.filter(effect=>effect.piercing?.target===enemy.id).slice(-1)[0],pose=groundPikePose(piercing?piercing.duration-piercing.ttl:1);
            const glyph=n.getChildByName('mob-glyph')!,base=enemy.boss?1.5:1,idle=enemy.boss?1:1+.02*Math.sin(b.time*Math.PI/.195+enemy.id);
            glyph.setPosition(40,-80+pose.lift);glyph.setScale(base*pose.scaleX,base*idle*pose.scaleY);glyph.angle=((enemy.knocked||0)>0?90:0)-pose.angle;
            const rig=(n as any).__rig as InkRig|undefined;if(rig){rig.root.setPosition(40,-65+pose.lift);rig.root.setScale(.8*pose.scaleX,.8*pose.scaleY);rig.root.angle=-pose.angle;}
        }
        for(const[id,n]of Array.from(this.mobs.entries()))if(!current.has(id)){n.destroy();this.mobs.delete(id);}
        current.clear();
        for(const shot of b.shots){
            current.add(shot.id);let n=this.projectiles.get(shot.id);
            if(!n&&shot.flyingPike){
                n=this.ui.image(this.combatLayer,skin('effect','longDanLiangYinQiangBk'),0,0,20,66);n.addComponent(UIOpacity);
                this.ui.image(n,skin('weapon','weapon_19'),0,0,20,66);
                const ring=this.ui.image(n,skin('effect','quan01'),10,33,130,52,undefined,'flying-pike-ring');ring.getComponent(UITransform)!.setAnchorPoint(.5,.5);ring.angle=-90;ring.addComponent(UIOpacity);
                this.projectiles.set(shot.id,n);
            }
            if(!n){const special:Record<string,string>={fireRain:'weapon/arrow_9',rainArrow:'weapon/arrow_2',holyBlade:'weapon/weapon_40',fire:'weapon/arrow_9',eagle:'weapon/bullet/eagleArrow_01',snake:'weapon/bullet/lingShe_1',flower:'weapon/bullet/lihua',flyingPike:'weapon/weapon_19',blade:'weapon/bullet/newDQ',meteor:'props/meteor_2',sword:'weapon/default_3'};
                const standard=shot.kind==='throw'?'weapon/'+(shot.weaponId===undefined?'default_1':'weapon_'+shot.weaponId):shot.kind==='arrow'&&shot.weaponId===undefined?'weapon/default_arrow_1':shot.kind==='arrow'||shot.kind==='弓'||shot.hero==='黄忠'||shot.hero==='黄祖'?'weapon/arrow_'+(shot.weaponId!==undefined?Math.min(shot.weaponId,9):0):'gameObject/soldier/pike';
                const path='resources/img/'+(special[shot.kind]||standard)+'.png';
                const spec=this.art.art.frames[path],width=spec?.original[0]||8,height=spec?.original[1]||50,ratio=(shot.kind==='eagle'?85:50)/Math.max(width,height);n=this.ui.image(this.combatLayer,path,0,0,shot.width??width*ratio,shot.height??height*ratio);n.getComponent(UITransform)!.setAnchorPoint(shot.anchorX??.5,shot.anchorY===undefined?.5:1-shot.anchorY);if(shot.kind==='holyBlade')n.addComponent(UIOpacity).opacity=128;this.projectiles.set(shot.id,n);}
            n.setPosition(shot.x,-shot.y);const target=b.enemies.find(e=>e.id===shot.target);if(shot.rotation!==undefined)n.angle=-shot.rotation;else if(target)n.angle=-Math.atan2(target.y-shot.y,target.x-shot.x)*180/Math.PI-90;
            if(shot.flyingPike){const pose=flyingPikePose(b.time,shot.flyingPike),ring=n.getChildByName('flying-pike-ring')!;
                n.setScale(1,pose.scaleY);n.getComponent(UIOpacity)!.opacity=255*pose.alpha;ring.getComponent(UIOpacity)!.opacity=255*pose.ringAlpha;this.ui.skin(ring,skin('effect','quan0'+pose.ringFrame));}
        }
        for(const[id,n]of Array.from(this.projectiles.entries()))if(!current.has(id)){n.destroy();this.projectiles.delete(id);}
        current.clear();
        for(const effect of b.effects){
            if(effect.kind==='damage'&&!this.profile.settings.damage)continue;current.add(effect.id);let n=this.effects.get(effect.id);
            if(!n){
                if(effect.piercing){
                    n=this.ui.node('ground-pike-'+effect.id,this.combatLayer,0,0,80,230);n.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
                    const path=skin('weapon','weapon_'+effect.piercing.weaponId),size=this.art.art.frames[path].original;
                    for(const spike of effect.piercing.spikes){const image=this.ui.image(n,path,spike.x,spike.y+150,size[0],size[1]);image.getComponent(UITransform)!.setAnchorPoint(.5,.5);}
                }
                else if(['stomp','fire','lightning'].includes(effect.kind)){const path=effect.kind==='stomp'?'crack':effect.kind==='fire'?'explode0':'electric1',size=effect.kind==='stomp'?[76,17]:effect.kind==='fire'?[64,64]:[100,100];n=this.ui.image(this.combatLayer,skin('effect',path),0,0,size[0],size[1]);n.getComponent(UITransform)!.setAnchorPoint(.5,.5);}
                else n=this.ui.text(this.combatLayer,effect.text||'',effect.x-65,effect.y-35,130,50,effect.kind==='damage'?30:24,effect.kind==='skill'?'#ffd25d':'#ffffff',5);
                n.addComponent(UIOpacity);this.effects.set(effect.id,n);
                if(effect.kind==='merge')this.play('soldier_merge_upgrade');else if(effect.kind==='heroLevel'&&effect.text==='等级提升')this.play('general_level_up');else if(effect.kind==='hit'){this.play('adou_hit');if(this.profile.settings.vibration){const wx=(globalThis as any).wx;wx?.vibrateShort?.({type:'medium'});}}else if(effect.kind==='skill'){const sounds:Record<string,string>={'大喝':'general_ground_slam','跳斩':'guanyu_skill_roar','火箭烈':'general_fire_arrow_rain','箭雨':'general_arrow_rain','圣剑':'holyBlade_skill'};if(sounds[effect.text||''])this.play(sounds[effect.text!]);}else if(effect.kind==='stomp')this.play('jumpSlash_stomp');else if(effect.kind==='lightning')this.play('maChao_attack_lightning');
            }
            const elapsed=effect.duration-effect.ttl;
            if(effect.piercing){
                const target=b.enemies.find(enemy=>enemy.id===effect.piercing!.target),pose=groundPikePose(elapsed);n.active=!!target;
                if(target)n.setPosition(target.x-40,-target.y+190);
                effect.piercing.spikes.forEach((spike,index)=>{const child=n!.children[index];child.setPosition(spike.x,-spike.y-150+pose.rise);child.setScale(1,pose.growth);child.angle=-spike.angle;});
                n.getComponent(UIOpacity)!.opacity=255*pose.alpha;
            }
            else if(['stomp','fire','lightning'].includes(effect.kind)){
                n.setPosition(effect.x,-effect.y);
                if(effect.kind==='fire')this.ui.skin(n,skin('effect','explode'+Math.min(5,Math.floor(elapsed/.05))));
                if(effect.kind==='lightning')this.ui.skin(n,skin('effect','electric'+(1+(Math.floor(elapsed/.05)+effect.id)%3)));
                if(effect.kind==='stomp')n.setScale(.8+.2*Math.min(1,elapsed/.1),.5+.5*Math.min(1,elapsed/.1));
                const end=effect.kind==='stomp'?.6:effect.kind==='fire'?.4:.25;n.active=elapsed<end;n.getComponent(UIOpacity)!.opacity=255*Math.max(0,Math.min(1,(end-elapsed)/(effect.kind==='stomp'?.3:.1)));
            }else{n.setPosition(effect.x-65,-effect.y+35+elapsed*35);n.getComponent(UIOpacity)!.opacity=Math.min(255,effect.ttl/effect.duration*400);}
        }
        for(const[id,n]of Array.from(this.effects.entries()))if(!current.has(id)){n.destroy();this.effects.delete(id);}
        for(const view of Array.from(this.actors.values()))this.animateBasicUnit(view,b.paused?0:dt);
        for(const view of Array.from(this.heroViews.values()))this.animateHero(view,b.paused?0:dt);
        this.animateSkillViews();
        if(b.haze>0&&!this.hazeNode){this.hazeNode=this.ui.image(this.combatLayer,skin('gameObject','enemy/blackCloud0'),0,0,640,800);this.hazeNode.getComponent(Sprite)!.color=new Color(255,255,255,180);}else if(b.haze<=0&&this.hazeNode){this.hazeNode.destroy();this.hazeNode=null;}
        const items=this.ui.find('box',this.screen)!.body.getChildByName('items-runtime');
        if(items)for(const node of items.children){const id=node.name.slice(5),remaining=b.cooldowns[id]||0;const label=node.getChildByName('remaining')?.getComponent(Label);if(label)label.string=remaining>0?String(Math.ceil(remaining)):'';const icon=node.getChildByName('item-icon')?.getComponent(Sprite);if(icon)icon.grayscale=remaining>0;}
        this.orderCombat();
    }
    private orderCombat(){
        // Reconstructed nodes arrive together; live ones arrive over many
        // frames. Draw order must depend on their role and saved id, not age.
        const keys=new Map<Node,[number,number]>(),jumping=new Set(this.battle!.heroSkills.filter(skill=>skill.kind==='jump').map(skill=>skill.unit));
        for(const view of this.heroViews.values())keys.set(view.node,[jumping.has(view.unit.id)?4:0,view.unit.id]);
        for(const view of this.actors.values())if(view.node.parent===this.combatLayer)keys.set(view.node,[jumping.has(view.unit.id)?4:1,view.unit.id+.5]);
        for(const[id,node]of this.mobs)keys.set(node,[2,id]);for(const[id,node]of this.projectiles)keys.set(node,[3,id]);
        for(const[id,view]of this.skillViews)keys.set(view.node,[view.node.name.startsWith('skill-phantom')?5:0,id]);
        for(const[id,node]of this.effects)keys.set(node,[node.name.startsWith('ground-pike-')?1.75:6,id]);if(this.hazeNode)keys.set(this.hazeNode,[7,0]);
        const nodes=this.combatLayer.children.slice().sort((a,b)=>{const x=keys.get(a)||[-1,0],y=keys.get(b)||[-1,0];return x[0]-y[0]||x[1]-y[1];});
        nodes.forEach((node,index)=>{if(node.getSiblingIndex()!==index)node.setSiblingIndex(index);});
    }
    private animateBasicUnit(view:ActorView,dt:number){
        const unit=view.unit,b=this.battle!;if(!isBasicKind(unit.kind))return;
        const size=view.node.parent===this.reserve?90:80,spec=BASIC_UNITS[unit.kind],interval=b.stats(unit).interval;
        if(!view.frame||view.frame.kind!==unit.kind){const windup=view.node.parent===this.combatLayer&&b.pendingAttacks.some(attack=>attack.unit===unit.id);view.frame=new UnitFramePlayer(unit.kind,unit.attacks-(windup?1:0));view.motion=this.ui.node('unit motion',view.node,size/2,size/2,80,80);view.glyph.setParent(view.motion);view.frameParent=view.node.parent;view.frameX=view.node.position.x;view.frameY=view.node.position.y;}
        if(view.frameParent!==view.node.parent||view.frameX!==view.node.position.x||view.frameY!==view.node.position.y){view.frame.reset(unit.attacks);view.frameParent=view.node.parent;view.frameX=view.node.position.x;view.frameY=view.node.position.y;view.motion!.angle=0;view.turn=undefined;const pike=view.node.getChildByName('unit-pike');if(pike)pike.angle=0;}
        view.motion!.setPosition(size/2,-size/2);
        const started=unit.attacks!==view.frame.seenAttacks,engaged=unit.attacks>0&&unit.cooldown>0;
        const path=view.frame.advance(dt,unit.attacks,interval,engaged),art=this.art.art.frames[path],frame=this.art.frame(path);
        if(frame){view.glyph.getComponent(Sprite)!.spriteFrame=frame;view.glyph.getComponent(Sprite)!.trim=false;view.glyph.getComponent(UITransform)!.setContentSize(art.original[0],art.original[1]);view.glyph.setPosition(spec.offset[0]-40,40-spec.offset[1]);}
        const attacking=view.frame.clip==='attack';
        if(unit.kind==='弓'){
            const dx=(unit.attackX??0)-(view.node.position.x+40),dy=(unit.attackY??0)-(-view.node.position.y+40),angle=-(Math.atan2(dy/2-120,dx/2)*180/Math.PI+90);
            const mode=attacking?'attack':'idle';
            if(!view.turn||view.turn.mode!==mode||started){const from=view.motion!.angle,to=attacking?from+((angle-from+540)%360)-180:0;view.turn={mode,from,to,elapsed:0};}
            view.turn.elapsed+=dt;view.motion!.angle=view.turn.from+(view.turn.to-view.turn.from)*Math.min(1,view.turn.elapsed/.65);
        }
        let pike=view.node.getChildByName('unit-pike');
        if(unit.kind==='枪'){
            if(!pike){pike=this.ui.image(view.node,skin('gameObject','soldier/pike'),23,38,30,71,undefined,'unit-pike');pike.getComponent(UITransform)!.setAnchorPoint(.5,.5);this.ui.image(pike,skin('gameObject','soldier/pikeEff1'),-14,-71.5,30,76,undefined,'pike-trail');}
            pike.active=true;const targetAngle=Math.atan2((unit.attackY??0)-(-view.node.position.y+38),(unit.attackX??0)-(view.node.position.x+23))*180/Math.PI+90,t=view.frame.elapsed;
            if(started)view.pikeFrom=pike.angle;
            if(attacking){const from=view.pikeFrom||0,delta=((-targetAngle-from+540)%360)-180;pike.angle=from+delta*Math.min(1,t/.09);}
            else{pike.angle=((pike.angle+540)%360)-180;pike.angle=Math.sign(pike.angle)*Math.max(0,Math.abs(pike.angle)-20*dt);}
            const amount=!attacking?0:t<.09?0:t<.36?-10*(t-.09)/.27:t<.48?-10+110*(t-.36)/.12:t<.57?100*(1-(t-.48)/.09):0,a=-pike.angle*Math.PI/180;
            pike.setPosition(size/2-40+23+amount*Math.sin(a),-(size/2-40+38-amount*Math.cos(a)));
            const trail=pike.getChildByName('pike-trail')!;trail.active=attacking&&t>=.36&&t<.48;trail.setPosition(-14,71.5+14*Math.min(1,Math.max(0,t-.36)/(.1*.8/interval)));
        }else if(pike)pike.active=false;
        view.level.setSiblingIndex(view.node.children.length-1);
    }
    private animateHero(view:HeroView,dt:number){
        const stats=this.battle!.stats(view.unit,view.hero,view.level,view.side),rate=view.hero.speed/stats.interval;
        view.node.setScale(1,1);view.node.setPosition(view.left%8*80,-Math.floor(view.left/8)*80);
        for(const cell of [view.left,view.left+1]){const unit=this.battle!.armies[view.side].units[cell],actor=unit&&this.actors.get(unit.id);if(actor)actor.node.setPosition(cell%8*80,-Math.floor(cell/8)*80);}
        const elapsed=view.unit.weaponAt===undefined?undefined:Math.max(0,this.battle!.time-view.unit.weaponAt);
        const event=view.motion.advance(dt,view.unit.attacks,Math.max(view.unit.cooldown,(view.unit.weaponUntil||0)-this.battle!.time),rate,elapsed,Math.max(0,this.battle!.time-(view.unit.idleAt??0)));
        if(view.rigs){
            for(let i=0;i<view.rigs.length;i++){
                const rig=view.rigs[i],name=(event.attacking?'attack':'zhan')+(i+1);
                rig.playbackRate=event.attacking?rate:1;
                rig.simulationClock=true;
                if(event.started||rig.name!==name)rig.play(name,!event.attacking);
                rig.seek(view.motion.elapsed);
            }
        }else for(const cell of [view.left,view.left+1]){
            const unit=this.battle!.armies[view.side].units[cell],actor=unit&&this.actors.get(unit.id);if(!actor)continue;
            actor.glyph.getComponent(UITransform)!.setAnchorPoint(.5,0);actor.glyph.setPosition(40,-80);actor.glyph.angle=-event.pose.rotation;actor.glyph.setScale(event.pose.scaleX,event.pose.scaleY);
        }
        const weapon=view.weapon;if(!weapon)return;
        const {spec}=weapon,origin={x:view.left%8*80,y:Math.floor(view.left/8)*80},targetX=view.unit.attackX??origin.x+spec.x,targetY=view.unit.attackY??origin.y+spec.y-100;
        const pivotX=origin.x+spec.x,pivotY=origin.y+spec.y;
        const distance=Math.hypot(targetX-(spec.type===2?origin.x+40:pivotX),targetY-(spec.type===2?origin.y+40:pivotY));
        const weaponElapsed=elapsed===undefined?undefined:Math.max(0,elapsed-(view.hero.name==='张飞'?.1/rate:0));
        const pose=weapon.motion.advance(dt,view.unit.attacks,event.attacking,view.unit.weaponRate??stats.weaponRate,{dx:targetX-pivotX,dy:targetY-pivotY,distance,range:stats.range,angle:view.unit.weaponAim},weaponElapsed,Math.max(0,this.battle!.time-(view.unit.idleAt??0)));
        // Native sF animates C_ (the glyph), while leftWord remains stationary.
        weapon.parent.angle=0;weapon.parent.setScale(1,1);weapon.parent.setPosition(40,-80);
        weapon.root.angle=-pose.angle;weapon.root.active=pose.visible;weapon.root.setScale(pose.rootScale,pose.rootScale);
        weapon.body.setPosition(spec.childX-spec.rootWidth*spec.anchorX,spec.rootHeight*spec.anchorY-pose.childY);
        weapon.body.setScale(pose.scaleX,pose.scaleY);
        if(weapon.trail)weapon.trail.active=pose.trail;
        if(weapon.nocked){weapon.nocked.active=event.attacking&&weapon.motion.active&&weapon.motion.time<.45;weapon.nocked.setPosition(0,-40*Math.min(1,weapon.motion.time/.45));}
        const skill=this.battle!.heroSkills.find(skill=>skill.unit===view.unit.id&&HERO_SKILLS[skill.hero].interrupt);
        if(skill)this.animateHeroSkill(view,skill);
    }
    private animateHeroSkill(view:HeroView,skill:HeroSkillState){
        const now=this.battle!.time,elapsed=now-skill.born,weapon=view.weapon!,origin={x:view.left%8*80,y:Math.floor(view.left/8)*80},clamp=(n:number)=>Math.max(0,Math.min(1,n));
        if(skill.kind==='shout'){
            const t=elapsed<.25?elapsed/.25:elapsed<.5?(elapsed-.25)/.25:elapsed<.65?(elapsed-.5)/.15:clamp((elapsed-.65)/.15);
            const sx=elapsed<.25?1+.2*t:elapsed<.5?1.2-.3*t:elapsed<.65?.9+.3*t:1.2-.2*t,sy=elapsed<.25?1-.2*t:elapsed<.5?.8+.3*t:elapsed<.65?1.1-.3*t:.8+.2*t;
            const jump=elapsed<.25?0:elapsed<.25+.1/skill.rate?-80*clamp((elapsed-.25)*skill.rate/.1):elapsed<.25+.2/skill.rate?-80*(1-clamp((elapsed-.25-.1/skill.rate)*skill.rate/.1)):0;
            view.node.setScale(sx,sy);view.node.setPosition(origin.x+80*(1-sx),-origin.y-80*(1-sy)-jump);
            for(const cell of [view.left,view.left+1]){const unit=this.battle!.armies[view.side].units[cell],actor=this.actors.get(unit.id);if(actor){actor.node.setPosition(origin.x+80+(cell-view.left)*80*sx-80*sx,-origin.y-80*(1-sy)-jump);actor.glyph.setScale(sx,sy);}}
            weapon.trail&&(weapon.trail.active=false);
        }else if(skill.kind==='jump'){
            const dx=skill.x-origin.x-40,dy=skill.y-origin.y-40,unit=this.battle!.armies[view.side].units[view.left],actor=this.actors.get(unit.id);
            if(actor){actor.node.setPosition(origin.x+dx,-origin.y-dy);actor.node.setSiblingIndex(this.combatLayer.children.length-1);}
            weapon.parent.setPosition(40+dx,-80-dy);weapon.parent.setSiblingIndex(view.node.children.length-1);
            const attack=Math.max(0,now-skill.ends-.25)*skill.rate;weapon.root.angle=skill.phase===3?0:attack<.25?-48*clamp(attack/.25):attack<.4?-48:attack<.5?-24+152*clamp((attack-.4)/.1):128*(1-clamp((attack-.5)/.22));
            weapon.root.active=true;weapon.trail&&(weapon.trail.active=attack>=.4&&attack<.5);
        }else if(skill.kind==='arrowRain'||skill.kind==='fireRain'){
            const interval=skill.kind==='arrowRain'?.228/skill.rate:2.85/((10+skill.points.length)*skill.rate),draw=clamp(1-(skill.next-now)/interval);
            weapon.body.setScale(1-.13*draw,1+.29*draw);weapon.root.angle=30;
            if(weapon.nocked){weapon.nocked.active=true;weapon.nocked.setPosition(0,-40*draw);}
        }
    }
    private animateSkillViews(){
        const battle=this.battle!,current=new Set<number>();
        for(const skill of battle.heroSkills){
            if(skill.kind!=='shout'&&skill.kind!=='phantom')continue;current.add(skill.id);let view=this.skillViews.get(skill.id);
            if(!view){const node=this.ui.node('skill-'+skill.kind+'-'+skill.id,this.combatLayer,0,0,1,1);view={node};this.skillViews.set(skill.id,view);
                if(skill.kind==='shout')for(let i=0;i<3;i++){const ring=this.ui.image(node,skin('effect','soundWave'),0,0,153,157,undefined,'ring'+i);ring.getComponent(UITransform)!.setAnchorPoint(.5,.5);ring.addComponent(UIOpacity);}
                else{const captured=view;void this.rig(node,'resources/anim/zhaoYun/skeleton_zh.json','zhan1',0,40,1).then(rig=>{if(rig&&isValid(node,true)){captured.rig=rig;rig.simulationClock=true;rig.useSkin(heroAppearance(skill.hero,skill.level).skin);}});const weapon=this.ui.image(node,skin('weapon',skill.weaponId===undefined?'default_1':'weapon_'+skill.weaponId),0,0,42,132);weapon.getComponent(UITransform)!.setAnchorPoint(.5,.5);view.weapon=weapon;}
            }
            view.node.setPosition(skill.x,-skill.y);
            if(skill.kind==='shout')for(let i=0;i<3;i++){const pose=shoutRing(battle.time-skill.born,skill.rate,skill.range,i),ring=view.node.getChildByName('ring'+i)!;ring.setScale(pose.scale,pose.scale);ring.getComponent(UIOpacity)!.opacity=Math.round(pose.alpha*255);}
            else{
                const point=skill.points[skill.index],previous=skill.points[skill.index-skill.direction];let sx=.8,sy=.8,rotation=0;
                if(skill.phase===1&&point&&previous){if(point.x>previous.x)sx=-.8;else if(point.y>previous.y){rotation=90;sx=-.8;}else if(point.y<previous.y){rotation=-90;sx=-.8;sy=-.8;}}
                view.node.angle=rotation;view.node.setScale(sx,sy);if(view.rig){const name=skill.phase===1?'attack1':'zhan1';if(view.rig.name!==name)view.rig.play(name,true);view.rig.seek((battle.time-skill.born)*(skill.phase===1?5:1));}
                if(view.weapon){const phase=(battle.time-skill.ends)%.1;view.weapon.angle=80+(skill.id*17%40);view.weapon.setPosition(0,-60*(phase<.05?phase/.05:1-(phase-.05)/.05));}
            }
        }
        for(const[id,view]of Array.from(this.skillViews.entries()))if(!current.has(id)){view.rig?.dispose();view.node.destroy();this.skillViews.delete(id);}
        this.rigs=this.rigs.filter(rig=>isValid(rig.root));
    }
    private heroWeapon(view:HeroView,id:number):WeaponView {
        const spec=weaponGeometry(view.hero.weaponType as WeaponType,view.hero.name,id),parent=this.ui.node('weapon word pivot',view.node,40,80,80,80);
        const root=this.ui.node('weapon hinge',parent,spec.x-40,spec.y-80,1,1),body=this.ui.image(root,skin('weapon',id<0?'default_'+spec.type:'weapon_'+id),0,0,spec.width,spec.height);
        if(spec.centered)body.getComponent(UITransform)!.setAnchorPoint(.5,.5);
        body.setPosition(spec.childX-spec.rootWidth*spec.anchorX,spec.rootHeight*spec.anchorY-spec.childY);
        let trail:Node|undefined,nocked:Node|undefined;
        if(spec.type===0){nocked=this.ui.image(body,skin('weapon',id<0?'default_arrow_1':'arrow_'+id),0,0,22,72);nocked.getComponent(UITransform)!.setAnchorPoint(.5,.1);nocked.active=false;}
        if(spec.type===1&&view.hero.name==='张飞'){
            const range=this.battle!.stats(view.unit,view.hero,view.level,view.side).range*1.5;trail=this.ui.image(root,skin('effect','sweep'),0,0,range,range);trail.getComponent(UITransform)!.setAnchorPoint(.5,.5);trail.angle=-180;trail.addComponent(UIOpacity).opacity=128;
        }else if(spec.type===1&&view.hero.name!=='马超'){
            trail=this.ui.image(body,skin('gameObject','soldier/pikeEff2'),0,0,30,76);trail.getComponent(UITransform)!.setAnchorPoint(.5,.5);trail.setPosition(0,spec.height*.5-spec.tipY!);
        }else if(spec.type===2){
            const [x,y,sx,sy]=KNIFE_TRAILS[id]||KNIFE_TRAILS[-1];trail=this.ui.image(body,skin('effect','whiteTrail'),x,y,94,89);trail.getComponent(UITransform)!.setAnchorPoint(0,.5);trail.setScale(sx,sy);
        }
        if(trail)trail.active=false;
        const motion=new WeaponMotion(spec,view.hero.name,view.unit.attacks),b=this.battle!,unit=view.unit;
        if(unit.attacks>0&&(unit.cooldown>0||(unit.weaponUntil||0)>b.time)){
            const stats=b.stats(unit,view.hero,view.level,view.side),origin={x:view.left%8*80,y:Math.floor(view.left/8)*80},x=unit.attackX??origin.x+spec.x,y=unit.attackY??origin.y+spec.y;
            motion.resume(unit.attacks,Math.max(0,b.time-(unit.weaponAt??(b.time-stats.interval+unit.cooldown))),unit.weaponRate??stats.weaponRate,{dx:x-origin.x-spec.x,dy:y-origin.y-spec.y,distance:Math.hypot(x-origin.x-(spec.type===2?40:spec.x),y-origin.y-(spec.type===2?40:spec.y)),range:stats.range,angle:unit.weaponAim});
        }else if(unit.attacks>0){motion.from=spec.type===1&&view.hero.name==='张飞'?130:(unit.weaponAim??0)+(spec.type===3?(unit.attacks%2===1?60:-60):0);motion.angle=motion.from;}
        return {parent,root,body,trail,nocked,id,spec,motion};
    }
    private newOverlay(scene?:string,stack=false) {
        this.cancelDrag();if(stack&&this.overlay)this.overlayStack.push({node:this.overlay,ui:this.overlayUI!,kind:this.overlayKind});else this.closeAllOverlays();
        const n=this.ui.node('modal',this.root,0,0,640,this.height);
        n.addComponent(BlockInputEvents);
        const ui=new InkUI(n,this.art,this.height);this.overlay=n;this.overlayUI=ui;
        this.overlayKind=scene||'custom';
        if(scene){const e=ui.scene(scene,n);return {ui,element:e};}
        return {ui,element:null};
    }
    private closeOverlay() {
        this.unitInfoUpdate=null;
        if(this.overlay){this.overlay.destroy();this.overlay=null;this.overlayUI=null;this.overlayKind='';}
        const previous=this.overlayStack.pop();if(previous){this.overlay=previous.node;this.overlayUI=previous.ui;this.overlayKind=previous.kind;}
        if(this.page==='battle'&&this.battle&&!this.suspended&&!this.overlay)this.battle.paused=false;
    }
    private closeAllOverlays(){while(this.overlay)this.closeOverlay();}
    private confirm(message:string,yes:string,accept:()=>void,reject?:()=>void) {
        const {ui}=this.newOverlay(undefined,true);ui.rect(this.overlay!,0,0,640,this.height,'#00000099');
        const pane=ui.image(this.overlay!,skin('battleUI','giveUpDialog/panelBg'),53,this.height/2-180,534,350,'40,40,40,40,0');
        const txt=ui.text(pane,message,30,35,474,135,32,'#fff4df',4);txt.getComponent(Label)!.enableWrapText=true;
        const button=ui.image(pane,skin('battleUI','giveUpDialog/redBtn'),55,220,190,82);ui.text(button,yes,0,0,190,82,32,'#ffffff',4);
        const no=ui.image(pane,skin('battleUI','giveUpDialog/blueBtn'),290,220,190,82);ui.text(no,'取消',0,0,190,82,32,'#ffffff',4);
        ui.button(button,()=>{this.closeOverlay();accept();});ui.button(no,()=>{this.closeOverlay();reject?.();});
        if(this.page==='battle'&&this.battle)this.battle.paused=true;
    }
    private pause() {
        if(!this.battle||this.battle.completed)return;
        const {ui,element}=this.newOverlay('PauseDialog');const box=ui.find('box',element!)!;
        this.battle.paused=true;
        ui.button(ui.find('noBtn',element!),()=>this.closeOverlay()); // 死战不休
        ui.button(ui.find('yesBtn',element!),()=>this.confirm('投降没有战利品','投降',()=>{this.battle!.finish(false);this.result();})); // 耻辱下播
        this.save();
    }
    private unitInfo(unit:Unit,location:Location) {
        const {ui}=this.newOverlay();const definition=JSON.parse(JSON.stringify(this.art.layouts.UnitInfoDialog));definition.x=320;definition.y=380;
        const pane=ui.mount(definition,this.overlay!,640,this.height);ui.show('buffTipBk',false,pane);ui.show('buffArea',false,pane);ui.show('buffAreaExtend',false,pane);ui.show('expArea',false,pane);ui.show('weaponBox',false,pane);
        const icon=ui.find('iconArea',pane)!;
        const hero=location.area==='board'?this.battle!.heroes(0).find(h=>h.left===location.index||h.right===location.index):undefined;
        if(hero)for(const [i,char]of hero.hero.chars.split('').entries())ui.image(icon.body,this.glyph({...unit,char,level:1}),63+(i?1:-1)*80/3-40,23,80,80);
        else ui.image(icon.body,this.glyph(unit),18,18,90,90);
        const title=ui.find('title',pane)!.body;title.getComponent(UITransform)!.setContentSize(157,28);title.getComponent(Label)!.overflow=Label.Overflow.SHRINK;
        this.unitInfoUpdate=()=>{
            if(!this.battle||!this.overlay||this.battle.get(location)?.id!==unit.id){this.closeOverlay();return;}
            const link=hero?this.battle.heroes(0).find(h=>h.id===hero.id):undefined;if(hero&&!link){this.closeOverlay();return;}
            const stats=this.battle.stats(unit,link?.hero,link?.level),labels:Record<string,string>={'赵云':'快攻贯穿','张飞':'范围','关平':'范围','黄忠':'贯穿','枪':'贯穿','骑':'范围'};
            ui.setText('title',(link?.hero.name||unit.char)+'Lv.'+(link?.level||unit.level)+'('+(labels[link?.hero.name||unit.kind]||'单体')+')',pane);
            ui.setText('power','攻击力:'+stats.power.toFixed(2),pane);ui.setText('speed','攻速:'+(1/stats.interval).toFixed(2),pane);ui.setText('lvlTip','满级'+(link?.maxLevel||(unit.kind==='字'?characterLevelCap(unit.char):5))+'级',pane);
            if(link){const table=heroExperienceTable(link.hero.name),next=table[link.level],ratio=next?Math.min(1,link.experience/next):1;ui.show('expArea',true,pane);ui.setText('expNum','('+link.experience.toFixed(1)+'/ '+(next??'已满级')+' )',pane);const bar=ui.find('expBar',pane)!;bar.body.getComponent(UITransform)!.setContentSize(Math.max(0,ratio*232-8),7);}
        };this.unitInfoUpdate();
        ui.button(this.overlay!,()=>this.closeOverlay());
    }
    private deck(tab=0) {
        const {ui}=this.newOverlay();const def=JSON.parse(JSON.stringify(this.art.layouts.DeckDialog));def.x=90;def.y=this.height/2-315;
        const pane=ui.mount(def,this.overlay!,640,this.height);ui.show('maskBg',true,pane);ui.show('panelDraw',false,pane);ui.show('generalPanelDraw',false,pane);
        ui.show('tab1Box',tab===0,pane);ui.show('tab2Box',tab===1,pane);ui.button(ui.find('xBtn',pane),()=>this.closeOverlay());
        ui.button(ui.find('tab1',pane),()=>this.deck(0));ui.button(ui.find('tab2',pane),()=>this.deck(1));
        ui.setText('generalRate',this.battle!.has('recruit')?'40%':'20%',pane);
        const panel=ui.find(tab===0?'wordPanel':'generalPanel',pane)!.body;panel.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        const content=ui.node('deck list',panel,0,0,407,tab===0?360:400),scroll=panel.addComponent(ScrollView);scroll.content=content;scroll.horizontal=false;scroll.vertical=true;
        if(tab===0){const units=[...Object.values(this.battle!.armies[0].units),...this.battle!.armies[0].reserve];
            for(let i=0;i<GLYPHS.length;i++){const char=GLYPHS[i],node=ui.image(content,skin('gameObject','soldier/generalParts_'+i+'_zh'),8+i%4*98,Math.floor(i/4)*70,70,65);
                node.getComponent(Sprite)!.trim=true;ui.text(node,String(units.filter(unit=>unit?.char===char).length),52,39,30,28,23,'#ffffff',3);ui.button(node,()=>this.toast(HEROES.filter(hero=>hero.chars.includes(char)).map(hero=>hero.name).join('、')||'字牌'));}
        }else for(let i=0;i<HEROES.length;i++){const hero=HEROES[i],node=ui.image(content,skin('gameObject','soldier/generalBg'+hero.rarity),8+i%3*130,Math.floor(i/3)*83,120,65,'12,12,12,12,0');
            ui.text(node,hero.name,0,0,120,65,32,'#ddba71',3);ui.button(node,()=>{ui.setText('title',hero.name,pane);ui.setText('skillName',hero.skill,pane);ui.setText('skillDesc','将'+hero.chars[0]+'与'+hero.chars[1]+'按顺序横向相邻部署，组成'+hero.name,pane);ui.show('emptySign',false,pane);const area=ui.find('generalBg',pane)!.body;area.getChildByName('selected-name')?.destroy();ui.text(area,hero.name,0,0,160,80,43,'#e9ba71',3).name='selected-name';});
        }
        this.play('open_deck');
    }
    private async shop(tab='shop') {
        if(!await this.prepare('shop',['meta','battle','effects']))return;this.storePage=tab;
        const {ui,element}=this.newOverlay('ShopScene');const box=ui.find('box',element!)!;
        // Public 360x640 capture: row tops188/279/370, right edge330.
        // The short-screen merchant uses a slightly enlarged, left-held
        // composition; centring the smaller panel compressed every row.
        const short=this.height<1386,correction=short?81/80:1;
        const scale=(short?Math.min(1,this.height/1200):this.height/1386)*correction;
        box.node.setScale(scale,scale);box.node.setPosition(320*correction,-693*scale+(short?8/3:0));
        const footer=box.children.find(child=>child.definition.text==='tip:道具仅当天有效');if(footer)footer.node.active=!short;
        const background=ui.find('bg',element!)!.body.getChildByName('rect')?.getComponent(Graphics);if(background){background.clear();background.fillColor=new Color(0,0,0,204);background.rect(0,-this.height,640,this.height);background.fill();}
        const token=this.marketToken();if(this.offersToken&&this.offersToken!==token)this.offers=[];this.offersToken=token;this.offers=this.offers.length?this.offers:this.dailyOffers();const sold=this.profile.marketSold===token;
        ui.setText('goldTxt',this.profile.gold.toString(),element!);ui.setText('staminaTxt',this.profile.stamina.toString(),element!);
        ui.find('staminaTxt',element!)!.body.getComponent(Label)!.color=inkColor(this.profile.stamina<1?'#e95b55':'#f7de76');
        ui.show('shopBox',tab==='shop',element!);ui.show('lotteryBox',tab==='lottery',element!);ui.show('lotteryLabelRect',false,element!);
        ui.button(ui.find('xBtn',element!),()=>this.closeOverlay());ui.button(ui.find('shopLabel',element!),()=>this.shop('shop'));ui.button(ui.find('lotteryLabel',element!),()=>this.shop('lottery'));
        const active=ui.find('activePropsBox',element!)!,passive=ui.find('passivePropsBox',element!)!;
        active.body.destroyAllChildren();passive.body.destroyAllChildren();
        let a=0,p=0;
        for(const id of this.profile.items){const item=ITEMS.find(i=>i.id===id)!;const parent=item.active?active.body:passive.body,index=item.active?a++:p++;
            const def=JSON.parse(JSON.stringify(this.art.layouts.shopPropsItem));def.x=51+index*86;def.y=item.active?50:40;
            const owned=ui.mount(def,parent,533,90);ui.skin(owned.body,skin('props',item.active?'activePropsBg':'passivePropsBg'));
            ui.skin(ui.find('rarity',owned)!.body,skin('shop','itemBg'+(item.active?0:1)+'_'+item.rarity));ui.skin(ui.find('img',owned)!.body,skin('props',item.image));
            ui.button(ui.find('deleteBtn',owned),()=>this.removeItem(id));}
        if(tab==='shop') {
            const list=ui.find('list',element!)!.body;
            for(let i=0;i<this.offers.length;i++){
                const item=this.offers[i],def=JSON.parse(JSON.stringify(this.art.layouts.shopItem));def.x=(572-def.width)/2;def.y=i*(def.height+10);
                const row=ui.mount(def,list,572,606);ui.setText('rarity',['稀有','卓越','史诗','传说'][item.rarity],row);
                ui.find('rarity',row)!.body.getComponent(Label)!.color=inkColor(['#95e45a','#2dddff','#d955ff','#e99431'][item.rarity]);
                ui.setText('name',item.name,row);ui.setText('introduce',item.description,row);ui.setText('price',item.price.toString(),row);
                ui.show('goldBox',!sold,row);ui.show('adBox',false,row);ui.show('soldOutTxt',sold,row);if(sold)ui.skin(ui.find('btn',row)!.body,skin('shop','btn3'));
                const icon=ui.find('itemImg',row)!;ui.skin(icon.body,skin('props',item.image));const bg=ui.find('itemBg',row)!;ui.skin(bg.body,skin('shop','itemBg'+(item.active?0:1)+'_'+item.rarity));
                ui.button(ui.find('btn',row),()=>{if(sold){this.toast('已售完');return;}const error=purchase(this.profile,item.id);if(error)this.toast(error);else{this.profile.marketSold=token;this.save();this.play('popup_notification');this.shop(tab);}});
            }
        } else {
            ui.skin(ui.find('shopBg',element!)!.body,skin('shop','shopBg2'),'50,50,50,50,0');
            const lucky=ui.find('luckyBox',element!)!.body,choices=this.lotteryChoices(),positions=[[0,0],[1,0],[2,0],[2,1],[2,2],[1,2],[0,2],[0,1]];
            for(let i=0;i<8;i++){
                const item=choices[i];if(!item)continue;const def=JSON.parse(JSON.stringify(this.art.layouts.lotteryItem));def.x=77+positions[i][0]*174.5;def.y=66+positions[i][1]*141.5;
                const row=ui.mount(def,lucky,503,415);ui.skin(row.body,skin('shop','lottery/rarityBg'+item.rarity));ui.skin(ui.find('img',row)!.body,skin('props',item.image));ui.setText('name',item.name,row);
                ui.button(row,()=>this.toast(item.description));
            }
            ui.show('luckyBtnAd',!this.profile.daily.lottery,element!);ui.show('luckyBtnGold',this.profile.daily.lottery,element!);ui.button(ui.find('luckyBtn',element!),()=>this.lottery());
        }
    }
    private dailyOffers(){const rng=new Random(this.profile.day*179+113);const pool=[...ITEMS];const out:Item[]=[];for(let i=0;i<3;i++){const item=rng.pick(pool);out.push(item);pool.splice(pool.indexOf(item),1);}return out;}
    private marketToken(){return this.profile.day+':'+(this.profile.wins+this.profile.losses);}
    private removeItem(id:string){const item=ITEMS.find(i=>i.id===id);if(!item)return;const {ui,element}=this.newOverlay('DeletePropsTipDialog',true);ui.setText('tipTxt','您确定要删除'+item.name+'道具吗',element!);ui.button(ui.find('cancelBtn',element!),()=>this.closeOverlay());ui.button(ui.find('confirmBtn',element!),()=>{this.profile.items=this.profile.items.filter(value=>value!==id);delete this.profile.itemLevels[id];this.save();this.closeOverlay();this.shop(this.storePage);});}
    private lotteryChoices(){const pool=ITEMS.filter(item=>item.id!=='march'&&!this.profile.items.includes(item.id)),rng=new Random(this.profile.day*179+this.profile.wins+this.profile.losses+317),out:Item[]=[];while(pool.length&&out.length<8){const item=rng.pick(pool);out.push(item);pool.splice(pool.indexOf(item),1);}return out;}
    private lottery() {
        if(this.profile.marketSold===this.marketToken()){this.toast('已售完');return;}
        const rng=new Random(Date.now()),item=rng.pick(this.lotteryChoices());if(!item){this.toast('所有道具已获得');return;}
        if(this.profile.daily.lottery&&this.profile.gold<100){this.toast('金币不足');return;}
        if(this.profile.daily.lottery)this.profile.gold-=100;else this.profile.daily.lottery=true;
        this.profile.marketSold=this.marketToken();this.save();this.play('lottery');
        const owned=this.profile.items.filter(id=>ITEMS.find(i=>i.id===id)!.active===item.active);
        if(owned.length>=(item.active?2:6)){this.replaceItem(item,owned);return;}
        this.profile.items.push(item.id);this.profile.itemLevels[item.id]=1;this.save();this.shop('lottery');this.toast('获得 '+item.name);
    }
    private replaceItem(item:Item,owned:string[]){
        const {ui}=this.newOverlay(undefined,true);ui.rect(this.overlay!,0,0,640,this.height,'#00000099');
        const def=JSON.parse(JSON.stringify(this.art.layouts.ReplacePropsTipDialog)),scale=Math.min(1,this.height/1100);def.x=320;def.y=this.height/2;def.anchorX=.5;def.anchorY=.5;def.scaleX=scale;def.scaleY=scale;
        const pane=ui.mount(def,this.overlay!,640,this.height);ui.skin(ui.find('newPropsItem',pane)!.body,skin('shop','itemBg'+(item.active?0:1)+'_'+item.rarity));ui.skin(ui.find('newPropsImg',pane)!.body,skin('props',item.image));ui.setText('newIntro',item.description,pane);
        let selected=owned[0];const redraw=()=>{ui.setText('oldIntro',ITEMS.find(i=>i.id===selected)!.description,pane);for(let i=0;i<6;i++){const slot=ui.find('props'+i,pane)!;slot.node.active=i<owned.length;if(i>=owned.length)continue;const previous=ITEMS.find(p=>p.id===owned[i])!;ui.skin(slot.body,skin('shop','itemBg'+(previous.active?0:1)+'_'+previous.rarity));ui.skin(ui.find('img',slot)!.body,skin('props',previous.image));const opacity=slot.node.getComponent(UIOpacity)||slot.node.addComponent(UIOpacity);opacity.opacity=owned[i]===selected?255:150;}};
        for(let i=0;i<owned.length;i++)ui.button(ui.find('props'+i,pane),()=>{selected=owned[i];redraw();});redraw();
        ui.button(ui.find('giveUpBtn',pane),()=>{this.closeOverlay();this.shop('lottery');});ui.button(ui.find('replaceBtn',pane),()=>{const index=this.profile.items.indexOf(selected);if(index<0||this.profile.items.includes(item.id))return;this.profile.items.splice(index,1,item.id);delete this.profile.itemLevels[selected];this.profile.itemLevels[item.id]=1;this.save();this.closeOverlay();this.shop('lottery');this.toast('获得 '+item.name);});
    }
    private async weapons() {
        if(!await this.prepare('weapons',['meta']))return;this.clear('weapons');this.screen=this.ui.scene('WeaponScene');
        const box=this.ui.find('box',this.screen)!;
        const scale=Math.min(1,this.height/1386),footer=this.ui.find('bg2',this.screen)!,width=640/scale;footer.node.getComponent(UITransform)!.setContentSize(width,460);footer.body.getComponent(UITransform)!.setContentSize(width,460);footer.node.setPosition((640-width)/2,-926);
        for(const child of footer.children)child.node.setPosition((width-child.definition.width)/2,child.node.position.y);
        this.bind('xBtn',()=>this.home());this.bind('switchBtn1',()=>{this.weaponPage=Math.max(0,this.weaponPage-1);this.weapons();});
        this.bind('switchBtn2',()=>{this.weaponPage=Math.min(Math.ceil(this.art.weapons.length/21)-1,this.weaponPage+1);this.weapons();});
        this.bind('recycleBtn',()=>this.recycle());
        const panel=this.ui.find('weaponPanel',this.screen)!.body;panel.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        const list=this.art.weapons.slice(this.weaponPage*21,this.weaponPage*21+21);
        for(let i=0;i<list.length;i++){
            const w=list[i],def=JSON.parse(JSON.stringify(this.art.layouts.weaponSceneWeaponItem));def.x=116+i%3*203;def.y=52+Math.floor(i/3)*80;
            const row=this.ui.mount(def,panel,640,737);this.ui.setText('name',w.txt,row);this.ui.setText('stateTxt',(this.profile.fragments[w.id]||0)+'/'+w.fragmentNum,row);
            this.ui.setText('countTxt',(this.profile.weapons[w.id]||0).toString(),row);const bg=this.ui.find('bg',row)!.body;this.ui.skin(bg,skin('weaponBag','weaponBg1_'+Math.max(1,w.rarity)));bg.getComponent(Sprite)!.grayscale=w.rarity===0;
            row.node.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{if(this.drag||this.overlay)return;const p=this.coordinates(e),node=this.ui.image(this.root,skin('weapon','weapon_'+w.id),p.x-60,p.y-35,120,70);this.drag={weaponId:w.id,startX:p.x,startY:p.y,node,moved:false};});
        }
        this.ui.setText('pageTxt',(this.weaponPage+1)+'/'+Math.ceil(this.art.weapons.length/21),this.screen);
        const general=this.ui.find('generalPanel',this.screen)!.body;
        for(let i=0;i<HEROES.length;i++){
            const hero=HEROES[i],def=JSON.parse(JSON.stringify(this.art.layouts.weaponSceneGeneralItem));def.x=75+(i%4)*150;def.y=47+Math.floor(i/4)*95;
            const row=this.ui.mount(def,general,604,291);this.ui.show('light',hero.name===this.selectedHero,row);this.ui.setText('name',hero.name,row);
            const weapon=this.art.weapons.find(w=>w.id===this.profile.equipped[hero.name]);this.ui.setText('weaponTxt',weapon?.txt||['短弓','短枪','短刀','短剑'][hero.weaponType],row);
            this.ui.button(row,()=>{this.selectedHero=hero.name;this.weapons();this.toast('为'+hero.name+'选择武器');});
        }
        await this.rig(this.ui.find('mihuan',this.screen)!.body,'resources/anim/mihuan/skeleton.json','zhan',0,0,1,true);
    }
    private weaponInfo(id:number) {
        const w=this.art.weapons.find(w=>w.id===id)!;const {ui,element}=this.newOverlay('WeaponIntroDialog');const box=ui.find('box',element!)!;
        ui.setText('weaponName',w.txt,element!);ui.setText('weaponIntroTxt',w.intro,element!);ui.setText('attTxt',String(w.addAttPower),element!);
        ui.find('rarityIndex',element!)!.node.setPosition(26+w.rarity*51.6,10);
        ui.button(ui.find('xBtn',element!),()=>this.closeOverlay());
    }
    private async ranks() {
        if(!await this.prepare('ranks',['meta']))return;this.clear('ranks');this.screen=this.ui.scene('RankScene');
        this.bind('xBtn',()=>this.home());const list=this.ui.find('list',this.screen)!.body;
        this.ui.text(list,'暂无排行榜数据',35,140,470,70,38,'#fff1c5',4);
        this.ui.text(list,'我的战绩  '+this.profile.wins+'胜 '+this.profile.losses+'负',25,230,500,60,31,'#ffffff',4);
        this.bind('countryBtn',()=>this.toast('暂无总榜数据'));this.bind('provinceBtn',()=>this.toast('暂无省榜数据'));
    }
    private recycle(){const {ui,element}=this.newOverlay('RecycleWeaponDialog');ui.setText('goldTxt',String(this.profile.gold),element!);
        const qualities=new Set([0,1,2]);const preview=()=>{let value=0;for(const weapon of this.art.weapons)if(qualities.has(weapon.rarity)){const used=Object.values(this.profile.equipped).filter(id=>id===weapon.id).length;value+=Math.max(0,(this.profile.weapons[weapon.id]||0)-used)*(weapon.rarity+1)*5;}ui.setText('goldNum',String(value),element!);};
        for(let quality=0;quality<3;quality++){const option=ui.find('selectBg'+quality,element!)!;ui.button(option,()=>{if(qualities.has(quality))qualities.delete(quality);else qualities.add(quality);ui.show('yes',qualities.has(quality),option);preview();});}
        preview();ui.button(ui.find('xBtn',element!),()=>this.closeOverlay());ui.button(ui.find('getBtn',element!),()=>{const gold=recycleWeapons(this.profile,this.art.weapons,Array.from(qualities));this.save();this.closeOverlay();this.weapons();this.toast('获得 '+gold+' 金币');});
    }
    private settings() {
        const {ui,element}=this.newOverlay('SettingScene');const box=ui.find('box',element!)!;
        ui.button(ui.find('closeBtn',element!),()=>{this.save();this.closeOverlay();});
        ui.show('checkOK',this.profile.settings.damage,element!);ui.button(ui.find('checkBox',element!),()=>{this.profile.settings.damage=!this.profile.settings.damage;ui.show('checkOK',this.profile.settings.damage,element!);this.save();});
        ui.show('langeSlider',true,element!);ui.show('uidTxt',true,element!);ui.setText('uidTxt','uid：'+this.profile.uid,element!);
        ui.button(ui.find('changeBtn',element!),()=>this.toast('已切换为简体中文'));
        ui.button(ui.find('copyBtn',element!),()=>this.copyUID());
        for(const type of ['music','sound'] as const){
            const bar=ui.find(type+'SliderBar',element!)!,content=ui.find(type+'SliderContent',element!)!;
            content.node.setScale(this.profile.settings[type]*2,1);
            bar.body.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{const p=this.coordinates(e,bar.body);this.profile.settings[type]=Math.min(1,Math.max(0,p.x/282));content.node.setScale(this.profile.settings[type]*2,1);if(type==='music'){this.music.volume=this.profile.settings.music;if(this.music.volume>0&&!this.music.playing)this.music.play();}this.save();});
        }
        if(this.page==='battle'&&this.battle)this.battle.paused=true;
    }
    private stamina() {
        const {ui,element}=this.newOverlay('GetStaminaDialog');
        ui.show('shareTimerTxt',false,element!);ui.setText('stateTxt',this.profile.stamina>=30?'体力充沛':this.profile.stamina+'/30',element!);
        const btn=ui.find('adBtn',element!)!;
        ui.button(btn,()=>{if(this.profile.daily.stamina){this.toast('今日体力已经领取');return;}this.profile.stamina=30;this.profile.staminaAt=Date.now();this.profile.daily.stamina=true;this.save();this.closeOverlay();this.home();});
        ui.button(ui.find('xBtn',element!),()=>this.closeOverlay());
    }
    private avatars() {
        const {ui,element}=this.newOverlay('AvatarSettingScene');const box=ui.find('box',element!)!;
        const panel=ui.find('avatarPanel',element!)!.body;panel.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
        const avatars=Object.keys(this.art.art.frames).map(path=>/mainUI\/avatar\/avatar(\d+)\.png$/.exec(path)).filter(Boolean).map(match=>Number(match![1])).sort((a,b)=>a-b);
        const content=ui.node('avatar choices',panel,0,0,avatars.length*100+326,111),scroll=panel.addComponent(ScrollView);scroll.content=content;scroll.horizontal=true;scroll.vertical=false;
        let selected=this.profile.avatar;
        for(let index=0;index<avatars.length;index++){const id=avatars[index],node=ui.image(content,skin('mainUI','avatar/avatar'+id),163+index*100,8,84,95);ui.button(node,()=>{selected=id;scroll.scrollToOffset(new Vec2(index*100,0),.2);});}
        scroll.scrollToOffset(new Vec2(Math.max(0,avatars.indexOf(selected))*100,0),0);
        ui.button(ui.find('closeBtn',element!),()=>this.closeOverlay());
        ui.button(ui.find('confirmBtn',element!),()=>{this.profile.avatar=selected;this.save();this.closeOverlay();this.home();});
    }
    private dailyReward() {
        if(this.profile.daily.gift){this.toast('今日奖励已领取');return;}
        this.profile.gold+=20;this.profile.daily.gift=true;this.save();this.ui.setText('goldTxt',this.profile.gold.toString(),this.screen);this.toast('获得20金币');
    }
    private async result() {
        if(!this.battle?.result)return;if(!await this.prepare('result',['meta','battle']))return;
        const r=this.battle.result;this.clear('result');this.screen=this.ui.scene('GameOverScene');
        this.musicToken++;this.music.stop();
        this.ui.show('winBg',r.win,this.screen);this.ui.show('loseBg',!r.win,this.screen);this.ui.show('winBox',r.win,this.screen);this.ui.show('loseBox',!r.win,this.screen);
        this.ui.skin(this.ui.find('getBtnAd',this.screen)!.body,skin('gameOverUI',r.win?'btn6':'btn5'));
        this.ui.show('upTxt',r.win,this.screen);this.ui.show('star5',false,this.screen);this.ui.show('arrow',r.win,this.screen);this.ui.show('lightning',false,this.screen);this.ui.show('cloud',!r.win,this.screen);
        if(r.win){for(const[name,w,h]of [['rankBg0',491,251],['rankBg1',435,200],['rankBg2',341,145]] as [string,number,number][]){const glow=this.ui.find(name,this.screen)!;glow.node.getComponent(UITransform)!.setContentSize(w,h);glow.body.getComponent(UITransform)!.setContentSize(w,h);glow.body.setPosition(-w/2,h);}this.ui.skin(this.ui.find('arrow',this.screen)!.body,skin('gameOverUI','arrow1'));}
        const box=this.ui.find('box',this.screen)!;
        const nextStars=this.profile.rewards.includes(r.id)?this.profile.stars:r.win?this.profile.stars+1:Math.max(1,this.profile.stars-1);
        this.ui.setText('goldNumTxt','X'+r.reward,this.screen);this.ui.setText('rankTxt1',rankName(nextStars),this.screen);this.ui.setText('rankTxt2','',this.screen);
        for(let i=0;i<5;i++){const star=this.ui.find('star'+i,this.screen);if(star){const filled=i<(nextStars-1)%5+1;star.node.getComponent(UIOpacity)!.opacity=filled?255:77;this.ui.skin(star.body,skin('gameOverUI',filled?'star1':'star0'));}}
        const actorParent=this.ui.find(r.win?'winBox':'loseBox',this.screen)!.body;
        const adou=await this.rig(actorParent,'resources/anim/aDou/skeleton.json','dakai',r.win?290:285,r.win?530:520,r.win?2.3:1.8,true);
        adou?.play('dakai',false,()=>adou.play(r.win?'hejiu':'attack',r.win));
        if(!r.win){const floor=this.ui.find('loseFloor',this.screen)!.body;
            for(let i=0;i<5;i++){const angle=(i+1)*Math.PI*.4,n=this.ui.node('thief-orbit-'+i,floor,275+200*Math.cos(angle),130+100*Math.sin(angle),80,80),body=this.ui.node('centered thief',n,-40,-40,80,80);
                this.ui.image(body,skin('gameObject','soldier/shadow2'),17,58,50,22).getComponent(Sprite)!.color=new Color(255,255,255,128);
                const thief=await this.rig(body,'resources/anim/thief/skeleton_zh.json','animation',11,12,1,true);thief?.play('animation',false);
                (n as any).__orbit={angle,dir:i%2?1:-1,actor:thief?.root};}
        }else{for(const[x,y]of [[0,570],[500,570],[110,670],[410,670]])await this.rig(actorParent,'resources/anim/dancer/skeleton.json','wu',x,y,1,true);}
        if(r.weaponId!==null){const w=this.art.weapons.find(w=>w.id===r.weaponId)!;const area=this.ui.find('weaponBox',this.screen)!.body,def=JSON.parse(JSON.stringify(this.art.layouts.weaponFragment));def.width=Math.max(100,w.txt.length*32+36);def.x=8+def.width/2;def.y=33;for(const child of def.children)child.width=def.width;
            const fragment=this.ui.mount(def,area,400,100);this.ui.skin(this.ui.find('bg',fragment)!.body,skin('weaponBag','rarity'+w.rarity));this.ui.setText('name',w.txt,fragment);}
        const receive=(double:boolean)=>{if(claimResult(this.profile,r,double)){this.save();sys.localStorage.removeItem(ROUND_KEY);}this.battle=null;this.home();};
        this.bind('getBtn',()=>receive(false));this.bind('getBtnAd',()=>receive(true));this.play(r.win?'game_win':'game_lose');this.save();
    }
    private toast(message:string) {
        if(!message)return;this.toastNode?.destroy();this.toastNode=this.ui.node('toast',this.root,70,this.height/2+120,500,86);
        this.ui.rect(this.toastNode,0,0,500,86,'#1c1815dd');const text=this.ui.text(this.toastNode,message,12,6,476,74,27,'#ffffff',2);text.getComponent(Label)!.enableWrapText=true;
        this.toastTime=2.3;
    }
    private async play(name:string) {
        if(this.profile.settings.sound<=0||this.suspended||!this.alive)return;
        if(['enemy_hit','soldier_set'].includes(name)&&this.soundGate>0)return;this.soundGate=0.12;
        try{const clip=await this.art.audio(name);if(clip&&this.alive&&!this.suspended)this.audio.playOneShot(clip,this.profile.settings.sound);}catch(e){console.warn('[ZYA] sound unavailable',name);}
    }
    private async setMusic(name:string){const token=++this.musicToken;this.musicTrack=name;try{const clip=await this.art.audio(name);if(!this.alive||token!==this.musicToken||!clip)return;this.music.stop();this.music.clip=clip;this.music.volume=this.profile.settings.music;if(this.touched&&!this.suspended&&this.music.volume>0)this.music.play();}catch(error){console.warn('[ZYA] music load',name,error);}}
    private async copyUID(){const text=String(this.profile.uid),platform=(globalThis as any).wx;if(platform?.setClipboardData){platform.setClipboardData({data:text,success:()=>this.toast('已复制'),fail:()=>this.toast('复制失败')});return;}try{if(typeof navigator!=='undefined'&&navigator.clipboard){await navigator.clipboard.writeText(text);this.toast('已复制');}else this.toast('uid：'+text);}catch(_){this.toast('uid：'+text);}}
    private save(){if(!this.profile)return;sys.localStorage.setItem(PROFILE_KEY,JSON.stringify(this.profile));if(this.battle)sys.localStorage.setItem(ROUND_KEY,this.battle.snapshot());}
    advance(dt:number) {
        if(!this.alive||this.suspended)return;dt=Math.min(0.25,dt);this.soundGate=Math.max(0,this.soundGate-dt);
        if(!(this.page==='battle'&&this.battle?.paused))for(const rig of this.rigs)if(!rig.simulationClock)rig.advance(dt);
        if(this.page==='result'&&this.screen){
            const light=this.ui.find('goldLight',this.screen);if(light)light.node.angle=(light.node.angle-dt*60)%360;
            const floor=this.ui.find('loseFloor',this.screen);if(floor)for(const node of floor.body.children){const orbit=(node as any).__orbit;if(!orbit)continue;
                orbit.angle-=dt*.6;const y=130+100*Math.sin(orbit.angle);node.setPosition(275+200*Math.cos(orbit.angle),-y);
                node.setScale(Math.max(-1,Math.min(1,node.scale.x+(y<130?-1:1)*dt*6)),1);
                if(orbit.actor&&isValid(orbit.actor,true)){let scale=orbit.actor.scale.y;if(scale>1.3)orbit.dir=-1;else if(scale<.7)orbit.dir=1;scale+=dt*1.2*orbit.dir;orbit.actor.setScale(1,scale);}
            }
        }
        if(this.toastTime>0){this.toastTime-=dt;if(this.toastTime<=0){this.toastNode?.destroy();this.toastNode=null;}}
        if(this.page==='match'){this.matchTime-=dt;if(this.matchTime<1.2)this.ui.setText('title','匹配完成',this.screen);if(this.matchTime<=0){this.matchTime=999;this.showBattle();}}
        if(this.page==='battle'&&this.battle){this.battle.advance(dt);if(this.battle.revision!==this.revision)this.drawBattle();this.drawDynamic(dt);if(this.battle.completed)this.result();}
        this.unitInfoUpdate?.();this.saveTime+=dt;if(this.saveTime>=5){this.saveTime=0;refreshProfile(this.profile);this.save();}
        if((globalThis as any).__ZYA_QA__&&typeof document!=='undefined')document.documentElement.dataset.zya=JSON.stringify(this.inspect());
    }
    resize(canvasHeight:number) {
        const h=canvasHeight/1.125;if(Math.abs(this.height-h)<0.1)return;this.height=h;
        this.root.getComponent(UITransform)!.setContentSize(640,h);this.root.setPosition(-360,canvasHeight/2);this.ui.height=h;
        const modal=this.overlayKind,tab=this.storePage;
        const redraw=this.page==='battle'?this.showBattle():this.page==='weapons'?this.weapons():this.page==='ranks'?this.ranks():this.page==='result'?this.result():this.page==='home'?this.home():Promise.resolve();
        redraw.then(()=>{if(modal==='ShopScene')this.shop(tab);else if(modal==='SettingScene')this.settings();else if(modal==='PauseDialog')this.pause();else if(modal==='GetStaminaDialog')this.stamina();});
    }
    inspect() {return {page:this.page,overlay:!!this.overlay,overlayKind:this.overlayKind,drag:this.drag?{weapon:this.drag.weaponId,item:this.drag.item,location:this.drag.location,moved:this.drag.moved}:null,profile:this.profile,battle:this.battle?{map:this.battle.map.id,mapName:this.battle.map.name,paused:this.battle.paused,wave:this.battle.wave,time:this.battle.time,lives:this.battle.armies.map(a=>a.lives),food:this.battle.armies[0].food,cost:this.battle.cost(),reserve:this.battle.armies[0].reserve,units:this.battle.armies[0].units,heroes:this.battle.heroes(0),tutorial:this.battle.tutorialStep,completed:this.battle.completed}:null,art:this.art.metrics(),height:this.height};}
    dispose(){this.alive=false;this.root.active=false;const dispatcher=this.pointerDispatcher;dispatcher.dispatchEvent=()=>true;dispatcher.onThrowException=()=>{};director.once(Director.EVENT_AFTER_DRAW,()=>{const list=(input as any)._eventDispatcherList,index=list?.indexOf(dispatcher);if(index>=0)list.splice(index,1);});this.musicToken++;this.music.stop();this.musicNode.destroy();this.save();this.cancelDrag();input.off(Input.EventType.KEY_DOWN,this.key);game.off(Game.EVENT_HIDE,this.hide);game.off(Game.EVENT_SHOW,this.show);this.art.dispose();this.root.destroy();}
}
