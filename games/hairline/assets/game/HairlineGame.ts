import { Node, UITransform, Graphics, Color, Label, Sprite, SpriteFrame, TTFFont, AudioClip, AudioSource, assetManager, input, Input, EventTouch, Vec3, game, Game, sys, director, Director, ImageAsset, Texture2D } from 'cc';
import { Battle, BASIC, FRAGMENTS, PAIRS, CARDS, DESCRIPTIONS, ROUTE, INITIAL, position, point, Unit, Enemy, Profile, loadProfile, dayKey } from './Model';
import { OfficeUI, INK, PAPER, GOLD, RED, GREEN } from './OfficeUI';
import { Platform } from './Platform';
type Button = {
    x: number;
    y: number;
    w: number;
    h: number;
    fn: () => void;
};
const BX = 24, BY = 218, T = 84, PROFILE = 'hairline.profile.v1', ROUND = 'hairline.round.v1';
export class HairlineGame {
    root: Node;
    ui: OfficeUI;
    profile: Profile = loadProfile(sys.localStorage.getItem(PROFILE));
    battle: Battle | null = null;
    page = 'loading';
    alive = true;
    private frames: Record<string, SpriteFrame> = {};
    private fonts: TTFFont[] = [];
    private audio: AudioSource;
    private music: AudioSource;
    private clips: Record<string, AudioClip> = {};
    private core: any = (globalThis as any).LittleStepsCore;
    private life: any;
    private lease: any;
    private gate: any;
    private platform = new Platform();
    private screen: Node;
    private dynamic: Node;
    private fx: Graphics;
    private modal: Node | null = null;
    private buttons: Button[] = [];
    private modalButtons: Button[] = [];
    private unitViews = new Map<number, Node>();
    private enemyViews = new Map<number, Node>();
    private moneyLabel: Label;
    private waveLabel: Label;
    private aiLabel: Label;
    private hairLabel: Label;
    private recruitLabel: Label;
    private toastNode: Node;
    private toastTime = 0;
    private lastNotice = '';
    private matchTime = 0;
    private saveClock = 0;
    private hitSoundClock = 0;
    private revision = -1;
    private modalKind = '';
    private coffee = false;
    private expansion = false;
    private lastHair = 3;
    private shake = 0;
    private floatViews = new Map<number, Node>();
    private bossFrame: SpriteFrame | null = null;
    private faceTexture:Texture2D|null=null;
    private faceLife:any;
    private loadingNode:Node|null=null;
    private loadingLabel:Label|null=null;
    private pointer = -1;
    private startPoint = { x: 0, y: 0 };
    private drag: {
        source: 'camp' | 'board';
        index: number;
        unit: Unit;
    } | null = null;
    private ghost: Node | null = null;
    private moved = false;
    constructor(canvas: Node) { this.root = new Node('守护我的发际线'); canvas.addChild(this.root); this.root.layer = canvas.layer; this.root.addComponent(UITransform).setContentSize(720, 1280); this.root.getComponent(UITransform)!.setAnchorPoint(0, 1); this.root.setPosition(-360, 640); this.audio = this.root.addComponent(AudioSource); const musicNode = new Node('Office music'); this.root.addChild(musicNode); this.music = musicNode.addComponent(AudioSource); this.music.loop = true; }
    async start() {
        try {
            if (!this.core)
                throw new Error('框架插件未加载');
            this.life = new this.core.Lifetime();
            this.gate = new this.core.ResourceGate({ maxSpecs: 80, maxEntries: 128, maxBytes: 268435456 });
            this.loadingNode?.destroy();const load = new Node('loading');this.loadingNode=load;
            load.layer = this.root.layer;
            this.root.addChild(load);
            const t = load.addComponent(UITransform);
            t.setContentSize(720, 1280);
            t.setAnchorPoint(0, 1);
            const g = load.addComponent(Graphics);
            g.fillColor = new Color().fromHEX(PAPER);
            g.rect(0, -1280, 720, 1280);
            g.fill();
            const ln = new Node('Loading label');
            load.addChild(ln);
            ln.setPosition(360, -600);
            ln.addComponent(UITransform).setContentSize(620, 200);
            const l = ln.addComponent(Label);
            this.loadingLabel=l;
            l.string = '守护我的发际线\n正在整理工位…';
            l.fontSize = 42;
            l.lineHeight = 64;
            l.color = new Color().fromHEX(INK);
            await new Promise<void>(r => director.once(Director.EVENT_AFTER_DRAW, r));
            const bundle: any = await new Promise((r, j) => assetManager.loadBundle('office', (e, b) => e ? j(e) : r(b)));
            if (!this.alive)
                return;
            const specs = [...['home', 'water', 'floor', 'paper', 'left-props', 'right-props', 'plant', 'dog'].map(key => ({ key, type: 'image', path: key + '/texture', bytes: key === 'home' ? 720 * 730 * 4 : 500000 })), { key: 'font', type: 'font', path: 'ui', bytes: 1600000 }, { key: 'brush', type: 'font', path: 'brush', bytes: 1000000 }, ...['click', 'hit', 'bubble', 'merge', 'hair', 'win', 'ambient'].map(key => ({ key, type: 'audio', path: 'audio/' + key, bytes: key === 'ambient' ? 500000 : 30000 }))];
            this.lease = await this.gate.acquire(specs, (s: any) => new Promise((r, j) => bundle.load(s.path, s.type === 'image' ? Texture2D : s.type === 'font' ? TTFFont : AudioClip, (e: any, a: any) => e ? j(e) : r(a))), (a: any) => assetManager.releaseAsset(a), this.life);
            if (!this.alive)
                return;
            for (const s of specs) {
                const a = this.lease.get(s.key);
                if (s.type === 'image') {
                    const frame = new SpriteFrame();
                    frame.texture = a;
                    frame.packable = false;
                    this.frames[s.key] = frame;
                }
                else if (s.type === 'audio')
                    this.clips[s.key] = a;
            }
            this.fonts = [this.lease.get('font'), this.lease.get('brush')];
            load.destroy();
            this.ui = new OfficeUI(this.root, this.frames, this.fonts[0], this.fonts[1]);
            this.root.on(Node.EventType.TOUCH_START, this.down, this);
            this.root.on(Node.EventType.TOUCH_MOVE, this.move, this);
            this.root.on(Node.EventType.TOUCH_END, this.up, this);
            this.root.on(Node.EventType.TOUCH_CANCEL, this.cancel, this);
            game.on(Game.EVENT_HIDE, this.hide, this);
            game.on(Game.EVENT_SHOW, this.show, this);
            this.music.clip = this.clips.ambient;
            this.music.volume = .13;
            this.battle = Battle.restore(sys.localStorage.getItem(ROUND) || '');
            this.home();
            if (this.profile.bossAvatar)
                void this.loadBoss(this.profile.bossAvatar);
            console.info('[HAIRLINE] READY', JSON.stringify(this.gate.snapshot()));
        }
        catch (e) {
            console.error('[HAIRLINE] BOOT', e);
            this.life?.dispose();if(this.loadingLabel)this.loadingLabel.string='工位整理失败\n点这里重试';if(this.alive)this.root.once(Node.EventType.TOUCH_END,()=>void this.start(),this);
        }
    }
    private save() { sys.localStorage.setItem(PROFILE, JSON.stringify(this.profile)); if (this.battle && !this.battle.ended)
        sys.localStorage.setItem(ROUND, this.battle.serialize()); }
    private sound(name = 'click') { if (this.profile.music && this.clips[name])
        this.audio.playOneShot(this.clips[name], name === 'hit' ? .15 : .45); }
    private hide() { if (this.battle)
        this.battle.paused = true; this.cancel(); this.save(); this.music.pause(); }
    private show() { if (this.page === 'battle' && this.battle)
        this.pause(); }
    private reset(page: string) { this.page = page; this.cancel(); this.modal?.destroy(); this.modal = null; this.modalButtons = []; this.screen?.destroy(); this.unitViews.clear(); this.enemyViews.clear(); this.floatViews.clear(); this.buttons = []; this.screen = this.ui.node(this.root, 0, 0, 720, 1280, page); this.toastNode = null!; this.toastTime = 0; }
    private button(parent: Node, text: string, x: number, y: number, w: number, h: number, fn: () => void, color = GOLD, size = 30, modal = false) { this.ui.rect(parent, x, y + 5, w, h, '#344440', INK, 10); this.ui.rect(parent, x, y, w, h, color, INK, 10); const label = this.ui.text(parent, text, x + 8, y + 3, w - 16, h - 6, size, INK, true); (modal ? this.modalButtons : this.buttons).push({ x, y, w, h, fn: () => { this.sound(); fn(); } }); return label; }
    private title(parent: Node, text: string, sub: string) { this.ui.text(parent, text, 35, 42, 650, 95, 60, INK, true); this.ui.text(parent, sub, 35, 135, 650, 45, 23, GREEN); }
    home() {
        this.profile = loadProfile(JSON.stringify(this.profile));
        this.reset('home');
        this.ui.rect(this.screen, 0, 0, 720, 1280, '#d7ded6', INK, 0, 0);
        this.ui.image(this.screen, 'home', 0, 0, 720, 730);
        this.ui.rect(this.screen, 24, 715, 672, 542, PAPER, INK, 13, 4);
        this.ui.text(this.screen, '今日工位 · 不卷也能赢', 48, 744, 624, 48, 31, RED, true);
        this.ui.text(this.screen, '把「怼、摆、摸、拖」安排进鱼塘\n守住三根毛，比工贼多撑一波。', 65, 804, 590, 90, 27);
        this.button(this.screen, this.battle && !this.battle.ended ? '继续摸鱼  →' : '开始游戏  →', 132, 922, 456, 100, () => this.battle && !this.battle.ended ? this.showBattle() : this.startRound(), GOLD, 47);
        const levels = ['轻松摸鱼', '正常打工', '拒绝内卷'];
        this.button(this.screen, levels[this.profile.difficulty] + '  ⇄', 218, 1051, 284, 55, () => { this.profile.difficulty = (this.profile.difficulty + 1) % 3; this.save(); this.home(); }, '#e1e6d6', 24);
        this.button(this.screen, '设置', 28, 1152, 116, 62, () => this.settings(), PAPER, 26);
        this.button(this.screen, '成就', 164, 1152, 116, 62, () => this.achievements(), PAPER, 26);
        this.button(this.screen, '图鉴', 300, 1152, 116, 62, () => this.collection(), PAPER, 26);
        this.button(this.screen, '体验卡', 436, 1152, 116, 62, () => this.cards(), PAPER, 26);
        this.button(this.screen, '签到', 572, 1152, 116, 62, () => this.sign(), PAPER, 26);
        this.ui.rect(this.screen, 458, 666, 234, 58, GOLD, INK, 6);
        this.ui.text(this.screen, '积蓄  ' + this.profile.coins, 466, 668, 215, 50, 27);
        this.ui.text(this.screen, '最佳 ' + this.profile.best + ' 波  ·  胜场 ' + this.profile.wins, 60, 1224, 600, 35, 21, GREEN);
        if (this.battle && !this.battle.ended)
            this.button(this.screen, '新的一局', 28, 666, 180, 58, () => { this.open('重新开始', '当前未完成的对局将结束。', () => { this.battle = null; sys.localStorage.removeItem(ROUND); this.startRound(); }, '重新开始'); }, PAPER, 23);
    }
    private startRound() {
        this.battle = new Battle(this.profile.difficulty, Date.now(), this.profile.cards);
        this.reset('match');
        this.matchTime = 1.7;
        this.ui.rect(this.screen, 0, 0, 720, 1280, '#bdced1', INK, 0, 0);
        this.title(this.screen, '匹配完成', '同一个老板，各守各的发际线');
        this.ui.head(this.screen, 290, 240, 3, 130);
        this.ui.rect(this.screen, 68, 390, 584, 190, '#9eb6c3', INK, 12, 5);
        this.ui.text(this.screen, '摸鱼先锋（工贼 AI）', 80, 415, 560, 60, 38, INK, true);
        this.ui.text(this.screen, ['偶尔掉线的同事', '按时下班的同事', '绩效第一的同事'][this.profile.difficulty], 80, 490, 560, 42, 27);
        this.ui.text(this.screen, 'VS', 170, 620, 380, 100, 80, RED, true);
        this.ui.rect(this.screen, 68, 790, 584, 190, '#dba98b', INK, 12, 5);
        this.ui.text(this.screen, '三根毛的我', 80, 815, 560, 65, 42, INK, true);
        this.ui.text(this.screen, '上班摸鱼，下班不加班', 80, 900, 560, 40, 27);
        this.ui.text(this.screen, '双方资源独立，工贼不会干扰你', 50, 1110, 620, 50, 25, GREEN);
        this.save();
    }
    showBattle() {
        if (!this.battle)
            return;
        this.battle.paused = false;
        this.reset('battle');
        this.coffee = false;
        this.expansion = false;
        this.revision = -1;
        this.lastHair = this.battle.sides[0].hair;
        this.ui.rect(this.screen, 0, 0, 720, 1280, '#c2c9bb', INK, 0, 0);
        this.ui.rect(this.screen, 16, 24, 688, 180, '#dce4d3', INK, 14, 5);
        this.button(this.screen, 'Ⅱ', 32, 42, 58, 59, () => this.pause(), PAPER, 31);
        this.ui.text(this.screen, '摸鱼关', 136, 41, 410, 64, 53, RED, true);
        this.waveLabel = this.ui.text(this.screen, '第 1 波', 180, 111, 350, 61, 43, INK, true);
        this.ui.rect(this.screen, 550, 43, 128, 106, '#f3d577', INK, 2, 2);
        this.ui.text(this.screen, '加班？\n想得美！', 555, 48, 119, 92, 27, INK, true);
        this.ui.rect(this.screen, 35, 119, 155, 55, '#263735', INK, 15);
        this.moneyLabel = this.ui.text(this.screen, '60', 37, 120, 150, 52, 34, '#f4d15e');
        this.hairLabel = this.ui.text(this.screen, '我的发际线  ┃┃┃', 36, 174, 300, 35, 23, RED);
        this.aiLabel = this.ui.text(this.screen, '工贼  ┃┃┃', 408, 174, 275, 35, 23, GREEN);
        this.ui.rect(this.screen, BX - 3, BY - 3, 678, 762, INK, INK, 0, 0);
        for (let c = 0; c < 72; c++) {
            const p = point(c);
            const road=ROUTE.includes(c)||ROUTE.includes(71-c);
            this.ui.image(this.screen,road?'paper':'floor',BX+p.x*T,BY+p.y*T,T,T);
            const g = this.ui.rect(this.screen, BX + p.x * T, BY + p.y * T, T, T, '#70877c', INK, 0, 2);
            this.ui.opacity(g,road?0:45);
        }
        this.ui.image(this.screen, 'left-props', BX, BY+T, 84, 252);
        this.ui.image(this.screen, 'right-props', BX + 7 * T, BY + 5 * T, 84, 252);
        this.dynamic = this.ui.node(this.screen, 0, 0);
        const fn = this.ui.node(this.screen, 0, 0);
        this.fx = fn.addComponent(Graphics);
        this.ui.rect(this.screen, 18, 997, 684, 105, PAPER, INK, 7, 4);
        this.ui.text(this.screen, '营', 25, 1013, 67, 68, 46, INK, true);
        for (let i = 0; i < 5; i++)
            this.ui.image(this.screen, 'paper', 103 + i * 115, 1008, 105, 84);
        this.button(this.screen, '咖啡', 24, 1121, 125, 68, () => { this.coffee = !this.coffee; this.expansion = false; this.toast(this.coffee ? '点选单位移除，重新规划工位' : '继续安排工位'); }, PAPER, 28);
        this.recruitLabel = this.button(this.screen, '摸鱼召唤  10', 169, 1112, 382, 88, () => this.summon(), GOLD, 38);
        this.button(this.screen, '扩张', 572, 1121, 125, 68, () => { const i = this.battle!.sides[0].camp.findIndex(u => u?.kind === '铲'); if (i >= 0) {
            this.expansion = true;
            this.coffee = false;
            this.toast('点亮一个与鱼塘相邻的灰格');
        }
        else
            this.toast('召唤可能获得铲子，拖到相邻灰格扩张'); }, '#dce4d3', 28);
        this.button(this.screen, '图鉴', 24, 1220, 140, 39, () => this.collection(), PAPER, 23);
        this.ui.text(this.screen, '同名同级合成 · 两字组合激活', 167, 1220, 383, 40, 21, INK);
        if (this.battle.sides[0].cards.includes('insurance'))
            this.button(this.screen, '护发', 575, 1220, 120, 40, () => { if (this.battle?.activateInsurance())
                this.toast('拒绝内耗 · 护盾 8 秒');
            else
                this.toast('本局护发已使用'); }, PAPER, 23);
        else if (this.platform.adsReady)
            this.button(this.screen, '福利', 575, 1220, 120, 40, () => this.adOptions(), PAPER, 23);
        this.ui.head(this.screen, 639, 928, this.lastHair, 52).name = 'player-head';
        this.refreshBoard();
        this.renderBattle(0);
        if (!this.battle.started)
            this.toast('先召唤同事，再拖到蓝色鱼塘。铲子可以开新格。', 5);
    }
    private refreshBoard() {
        if (!this.battle)
            return;
        const oldPonds=this.dynamic.getChildByName('ponds');if(oldPonds){oldPonds.removeFromParent();oldPonds.destroy();}
        const a = this.battle.sides[0], ponds = this.ui.node(this.dynamic, 0, 0, 1, 1, 'ponds');
        ponds.setSiblingIndex(0);
        for (const c of a.open) {
            const p = point(c);
            this.ui.image(ponds, 'water', BX + p.x * T + 2, BY + p.y * T + 2, T - 4, T - 4);
            if (this.battle.locked.includes(c)) {
                this.ui.rect(ponds, BX + p.x * T + 3, BY + p.y * T + 3, T - 6, T - 6, '#938478', RED, 0, 3);
                this.ui.text(ponds, '封', BX + p.x * T, BY + p.y * T, T, T, 43, RED, true);
            }
        }
        for(const c of this.battle.sides[1].open){const p=point(71-c);const n=this.ui.image(ponds,'water',BX+p.x*T+2,BY+p.y*T+2,T-4,T-4);this.ui.opacity(n,205);if(this.battle.aiLocked.includes(c))this.ui.text(ponds,'封',BX+p.x*T,BY+p.y*T,T,T,43,RED,true);}
        const oldCamp=this.screen.getChildByName('camp-units');if(oldCamp){oldCamp.removeFromParent();oldCamp.destroy();}
        const camp = this.ui.node(this.screen, 0, 0, 1, 1, 'camp-units');
        a.camp.forEach((u, i) => { if (u)
            this.glyph(camp, u, 109 + i * 115, 1015, 91); });
        this.revision = this.battle.revision;
    }
    private glyph(parent: Node, u: Unit, x: number, y: number, size = 78) {
        const n = this.ui.node(parent, x, y, size, size, 'unit:' + u.id), inert = FRAGMENTS.includes(u.kind), hero = !!PAIRS[u.kind];
        const l = this.ui.text(n, u.kind, 0, -1, size, size, hero ? 39 : 66, inert ? '#879186' : u.kind === '摸' ? '#a87622' : INK, true);
        if (!inert)
            this.ui.outline(l, '#f8edcc', 1.2);
        if (u.kind !== '铲' && !inert)
            this.ui.text(n, String(u.level), size - 23, -4, 23, 26, 22, INK, true);
        const g = this.ui.node(n, 0, 0).addComponent(Graphics);
        g.strokeColor = new Color().fromHEX(INK);
        g.fillColor = new Color().fromHEX('#eac36f');
        g.lineWidth = 2;
        if (u.kind === '摸') {
            g.ellipse(size * .65, -size * .82, 14, 7);
            g.fill();
            g.stroke();
            g.moveTo(size * .81, -size * .82);
            g.lineTo(size * .94, -size * .7);
            g.lineTo(size * .94, -size * .93);
            g.close();
            g.fill();
            g.stroke();
        }
        if (u.kind === '拖') {
            g.moveTo(size * .78, -size * .4);
            g.quadraticCurveTo(size * 1.05, -size * .98, size * .65, -size * .97);
            g.quadraticCurveTo(size * .45, -size * .94, size * .58, -size * .82);
            g.stroke();
        }
        if (u.kind === '怼') {
            g.moveTo(size * .8, -size * .4);
            g.lineTo(size * .98, -size * .47);
            g.lineTo(size * .81, -size * .52);
            g.close();
            g.fill();
            g.stroke();
        }
        if(u.kind==='摆'){
            g.fillColor=new Color().fromHEX(PAPER);g.roundRect(5,-size*.92,19,21,5);g.fill();g.stroke();
            for(let i=0;i<4;i++){g.moveTo(7+i*5,-size*.69);g.lineTo(7+i*5,-size*.55);g.stroke();}
        }
        if (hero) {
            g.fillColor = new Color().fromHEX(u.kind === '病假' ? '#8bbdb4' : GOLD);
            g.roundRect(size * .25, -size * .95, size * .5, 12, 4);
            g.fill();
            g.stroke();
        }
        if(u.kind==='工伤'){this.ui.rect(n,size*.35,size*.72,size*.39,size*.22,PAPER,INK,1,1);this.ui.text(n,'赔',size*.36,size*.72,size*.36,size*.2,16,RED,true);}
        if(u.kind==='病假'){g.fillColor=new Color().fromHEX('#8ebfbb');g.roundRect(size*.3,-size*.97,size*.4,15,4);g.fill();g.stroke();g.moveTo(size*.3,-size*.87);g.lineTo(size*.2,-size*.78);g.moveTo(size*.7,-size*.87);g.lineTo(size*.8,-size*.78);g.stroke();}
        if(u.kind==='中奖'){g.fillColor=new Color().fromHEX(GOLD);g.circle(size*.5,-size*.84,12);g.fill();g.stroke();}
        if(u.kind==='外出'){
            const runner=this.ui.node(n,0,0,56,60,'runner'),feet=runner.addComponent(Graphics);feet.strokeColor=new Color().fromHEX(PAPER);feet.fillColor=new Color().fromHEX(INK);feet.lineWidth=3;
            feet.ellipse(17,-24,9,18);feet.ellipse(37,-38,9,18);feet.fill();feet.stroke();
        }
        return n;
    }
    private renderBattle(dt: number) {
        const b = this.battle;
        if (!b)
            return;
        const a = b.sides[0];
        if (this.revision !== b.revision)
            this.refreshBoard();
        this.moneyLabel.string = '窝囊费 ' + Math.floor(a.money);
        this.waveLabel.string = '第 ' + b.wave + ' 波';
        this.hairLabel.string = '我的发际线  ' + ('┃'.repeat(a.hair) || '…');
        this.aiLabel.string = '工贼  ' + ('┃'.repeat(b.sides[1].hair) || '…');
        this.recruitLabel.string = '摸鱼召唤  ' + b.cost();
        const allUnits=a.units.concat(b.sides[1].units),aliveUnits = new Set(allUnits.map(u=>u.id));
        for (const [id, n] of this.unitViews)
            if (!aliveUnits.has(id)) {
                n.destroy();
                this.unitViews.delete(id);
            }
        for (const u of allUnits) {
            let n = this.unitViews.get(u.id);
            if (!n) {
                n = this.glyph(this.dynamic, u, 0, 0);
                this.unitViews.set(u.id, n);
            }
            const ai=b.sides[1].units.includes(u),p = point(ai?71-u.cell:u.cell), active = !FRAGMENTS.includes(u.kind);
            n.setPosition(BX + p.x * T + 4, -(BY + p.y * T + 3 + (active ? Math.sin(b.time * 2 + u.id) * 2 : 0)));
            n.angle = active ? Math.sin(b.time * 3 + u.id) * 1.5 : 0;
            const pulse=active?1+.09*Math.max(0,1-u.phase/.16):1;n.setScale(pulse,pulse,1);
            n.active = !(this.drag?.source === 'board' && this.drag.unit.id === u.id);
            const label = n.children.find(n => n.name.startsWith('text:'))?.getComponent(Label);
            if (label && label.string !== u.kind) {
                n.destroy();
                this.unitViews.delete(u.id);
            }
            const badge = n.children[1]?.getComponent(Label);
            if (badge)
                badge.string = String(u.level);
            const runner=n.getChildByName('runner');if(runner){const pos=position(u.patrol),route=ai?{x:7-pos.x,y:8-pos.y}:pos;runner.setPosition((route.x-p.x)*T+12,-(route.y-p.y)*T);runner.angle=Math.sin(b.time*25)*12;}
        }
        const allEnemies=a.enemies.concat(b.sides[1].enemies),aliveEnemies = new Set(allEnemies.map(e=>e.id));
        for (const [id, n] of this.enemyViews)
            if (!aliveEnemies.has(id)) {
                n.destroy();
                this.enemyViews.delete(id);
            }
        for (const e of allEnemies) {
            const ai=b.sides[1].enemies.includes(e);
            let n = this.enemyViews.get(e.id);
            if (!n) {
                n = this.enemy(e);
                this.enemyViews.set(e.id, n);
            }
            const route = position(e.progress),p=ai?{x:7-route.x,y:8-route.y}:route;
            n.setPosition(BX + p.x * T + 6, -(BY + p.y * T + 6 + Math.sin(b.time * 9 + e.id) * 3));
            n.angle = e.hit > 0 ? Math.sin(e.hit * 30) * 15 : e.stun > 0 ? Math.sin(b.time * 9) * 12 : 0;
            n.setScale(e.hit > 0 ? 1.08 : 1, e.hit > 0 ? .91 : 1);
            const g = n.getChildByName('bar')!.getComponent(Graphics)!;
            g.clear();
            g.fillColor = new Color().fromHEX('#243a37');
            g.roundRect(4, 8, 64, 9, 4);
            g.fill();
            g.fillColor = new Color().fromHEX(e.boss ? GOLD : ai?'#6a9fbb':'#c94c41');
            g.roundRect(6, 10, 60 * Math.max(0, e.hp / e.maxHp), 5, 2);
            g.fill();
        }
        this.hitSoundClock = Math.max(0, this.hitSoundClock - dt);
        this.fx.clear();
        for (const effect of b.effects.filter(e => e.side === 0)) {
            const from = effect.kind==='外出'?position(effect.from):point(effect.from), to = position(effect.to);
            const x = BX + from.x * T + 42, y = BY + from.y * T + 42, tx = BX + to.x * T + 42, ty = BY + to.y * T + 42;
            if (!['break', 'boss', 'hair', 'merge', 'skill', 'heal'].includes(effect.kind)) {
                if (this.hitSoundClock === 0) {
                    this.sound(effect.kind === '摸' ? 'bubble' : 'hit');
                    this.hitSoundClock = .13;
                }
                const g = this.fx;
                g.lineWidth = effect.kind === '拖' ? 5 : 3;
                g.strokeColor = new Color().fromHEX(effect.kind === '摸' ? '#8ad9e0' : effect.kind === '摆' ? GREEN : '#eebd4c');
                const q=Math.max(0,Math.min(1,1-effect.ttl/.38)),px=x+(tx-x)*q,py=y+(ty-y)*q;
                if(effect.kind==='摸'){g.circle(px,-py,14);g.stroke();g.circle(px-4,-py+4,3);g.fill();}
                else if(effect.kind==='拖'){g.moveTo(x,-y);g.quadraticCurveTo((x+tx)/2,-Math.min(y,ty)+55,tx,-ty);g.stroke();g.arc(tx,-ty,13,Math.PI*.15,Math.PI*1.5,false);g.stroke();}
                else if(effect.kind==='摆'||effect.kind==='病假'){for(let i=0;i<3;i++){g.circle(x,-y,(1-q)*25+q*(42+i*28));g.stroke();}}
                else {g.moveTo(x,-y);g.lineTo(px,-py);g.stroke();}
                g.fillColor = new Color().fromHEX('#fff0bb');
                g.circle(tx, -ty, effect.kind === '摸' ? 13 : 7);
                g.fill();
                g.stroke();
            }
            else if (!this.floatViews.has(effect.id)) {
                const p = ['break', 'boss'].includes(effect.kind) ? position(effect.from) : point(effect.from);
                const boss=effect.kind==='boss',n = this.ui.node(this.dynamic,boss?145:BX+p.x*T-12,boss?590:BY+p.y*T-14,boss?430:130,boss?160:70);
                const label = this.ui.text(n, effect.text || '✦', 0, 0,boss?430:140,boss?130:65,boss?65:26, effect.kind === 'hair' ? RED : effect.kind === 'heal' ? GREEN : RED, true);
                if(boss){const face=this.ui.head(n,150,-100,0,104,true);face.name='boss-face';if(this.bossFrame){const sn=this.ui.node(face,3,3,94,94).addComponent(Sprite);sn.spriteFrame=this.bossFrame;sn.sizeMode=Sprite.SizeMode.CUSTOM;sn.node.getComponent(UITransform)!.setContentSize(94,94);}}
                this.ui.outline(label, PAPER, 2);
                this.floatViews.set(effect.id, n);
                if (effect.kind === 'merge')
                    this.sound('merge');
                if (effect.kind === 'boss')
                    this.sound('win');
            }
            const fg=this.fx;
            if(effect.kind==='break'){const p=position(effect.from),q=1-effect.ttl/.65;fg.fillColor=new Color(38,55,53,Math.round(255*(1-q)));for(let i=0;i<5;i++){const angle=i*Math.PI*.4,xx=BX+p.x*T+42+Math.cos(angle)*q*47,yy=BY+p.y*T+42+Math.sin(angle)*q*47;fg.rect(xx,-yy,7*(1-q),11*(1-q));fg.fill();}}
            if(effect.kind==='skill'){const q=1-effect.ttl/1.2;fg.lineWidth=4;fg.strokeColor=new Color().fromHEX(effect.text==='传染！'?'#82c2a2':GOLD);for(let i=0;i<3;i++){fg.circle(x,-y,q*(85+i*40));fg.stroke();}if(effect.text==='天降横财'){fg.fillColor=new Color().fromHEX(GOLD);for(let i=0;i<18;i++){const xx=BX+(i*131%672),yy=BY+(i*73+q*680)%756;fg.circle(xx,-yy,9);fg.fill();fg.stroke();}}}
        }
        const fxIDs = new Set(b.effects.map(e => e.id));
        for (const [id, n] of this.floatViews) {
            if (!fxIDs.has(id)) {
                n.destroy();
                this.floatViews.delete(id);
            }
            else{
                n.setPosition(n.position.x, n.position.y + dt * 26);
                const face=n.getChildByName('boss-face');if(face){face.angle+=dt*390;face.setPosition(face.position.x+dt*65,face.position.y+dt*105);}
            }
        }
        if (a.hair < this.lastHair) {
            this.shake = .45;
            this.platform.vibrate(this.profile.vibration);
            this.sound('hair');
        }
        if (a.hair !== this.lastHair) {
            this.screen.getChildByName('player-head')?.destroy();
            this.ui.head(this.screen, 639, 928, a.hair, 52).name = 'player-head';
        }
        this.lastHair = a.hair;
        if(this.shake>0||a.hair===1){const alpha=this.shake>0?Math.min(210,this.shake*400):35+Math.sin(b.time*4)*17;this.fx.strokeColor=new Color(175,48,37,alpha);this.fx.lineWidth=13;this.fx.rect(7,-1273,706,1266);this.fx.stroke();}
        if (this.shake > 0) {
            this.shake -= dt;
            this.screen.setPosition(Math.sin(this.shake * 95) * this.shake * 9, 0);
        }
        else
            this.screen.setPosition(0, 0);
        const notice = b.notices[b.notices.length - 1];
        if (notice && notice !== this.lastNotice) {
            this.lastNotice = notice;
            this.toast(notice);
        }
        if (b.meeting > 0 && !this.modal)
            this.toast('全员大会 · ' + Math.ceil(b.meeting) + ' 秒', .3);
    }
    private enemy(e: Enemy) { const n = this.ui.node(this.dynamic, 0, 0, 74, 76, 'enemy:' + e.id); if (e.boss) {
        this.ui.rect(n, 10, 13, 55, 58, '#863d34', INK, 12);
        if (this.bossFrame) {
            const s = this.ui.node(n, 9, 1, 58, 58).addComponent(Sprite);
            s.spriteFrame = this.bossFrame;
            s.sizeMode = Sprite.SizeMode.CUSTOM;
        }
        else
            this.ui.head(n, 5, -2, 0, 70, true);
        this.ui.text(n, '老板', 0, 50, 74, 32, 24, GOLD, true);
    }
    else {
        this.ui.image(n, 'dog', 5, 1, 64, 80);
        if (e.kind === '关系户')
            this.ui.rect(n, 23, 18, 35, 8, INK, INK, 2, 0);
    } this.ui.node(n, 0, 0, 1, 1, 'bar').addComponent(Graphics); return n; }
    private summon() { if (!this.battle)
        return; const msg = this.battle.summon(); if (msg) {
        this.toast(msg);
        return;
    } if (!this.battle.started) {
        this.battle.started = true;
        this.battle.spawnClock = 10;
        this.toast('把营地中的字拖进蓝色鱼塘，铲子拖到相邻灰格', 5);
    } this.refreshBoard(); this.sound('merge'); this.save(); }
    private pause() { if (!this.battle)
        return; this.battle.paused = true; this.cancel(); this.open('先歇一会儿', '上班已经够累了，摸鱼不用着急。', () => { this.battle!.paused = false; this.close(); }, '继续摸鱼'); this.button(this.modal!, '返回首页', 167, 803, 386, 70, () => { this.close(); this.save(); this.home(); }, PAPER, 30, true); }
    private settle() { const b = this.battle!; if ((b as any).settled)
        return; (b as any).settled = true; sys.localStorage.removeItem(ROUND); this.profile.games++; this.profile.best = Math.max(this.profile.best, b.wave); if (b.winner === 0)
        this.profile.wins++; const reward = Math.floor(b.sides[0].money * .3) + b.wave * 5 + (b.winner === 0 ? 20 : 0); this.profile.coins += reward; this.save(); this.reset('result'); this.ui.rect(this.screen, 0, 0, 720, 1280, '#cad7cd', INK, 0, 0); this.ui.rect(this.screen, 44, 79, 632, 1100, PAPER, INK, 15, 5); this.ui.text(this.screen, b.winner === 0 ? '今日准点下班' : '加班失败…', 70, 140, 580, 112, 67, b.winner === 0 ? RED : INK, true); this.ui.head(this.screen, 254, 315, b.sides[0].hair, 210); this.ui.text(this.screen, b.winner === 0 ? '比工贼多守住了一根毛' : '发际线又后退了，明天继续摸鱼', 70, 580, 580, 100, 32, INK, true); this.ui.text(this.screen, `坚持 ${b.wave} 波  ·  击退 ${b.sides[0].kills} 位狗腿子\n积蓄 +${reward}`, 75, 719, 570, 118, 32, GREEN); this.button(this.screen, '再摸一局', 134, 907, 452, 90, () => this.startRound(), GOLD, 43); this.button(this.screen, '回到工位', 192, 1042, 336, 70, () => { this.battle = null; this.home(); }, PAPER, 31); this.sound(b.winner === 0 ? 'win' : 'hair'); }
    private open(title: string, body: string, accept?: () => void, yes = '知道了') { this.cancel(); this.modal?.destroy(); this.modalButtons = []; this.modalKind = title; this.modal = this.ui.node(this.root, 0, 0, 720, 1280, 'dialog'); const shade = this.ui.rect(this.modal, 0, 0, 720, 1280, INK, INK, 0, 0); this.ui.opacity(shade, 170); this.ui.rect(this.modal, 47, 263, 626, 655, PAPER, INK, 15, 5); this.ui.text(this.modal, title, 75, 302, 570, 80, 48, RED, true); this.ui.text(this.modal, body, 91, 403, 538, 215, 30); if (yes)
        this.button(this.modal, yes, 167, 688, 386, 78, () => { if (accept)
            accept();
        else
            this.close(); }, GOLD, 33, true); this.button(this.modal, '×', 594, 277, 56, 52, () => { const declined = this.modalKind === '再护住一根毛'; this.close(); if (declined)
        this.settle(); }, PAPER, 27, true); }
    private close() { this.modal?.destroy(); this.modal = null; this.modalButtons = []; this.modalKind = ''; if (this.page === 'battle' && this.battle)
        this.battle.paused = false;if(this.page==='home')this.home(); }
    private settings() { this.open('我的工位', '', undefined, ''); this.ui.text(this.modal!, '声音、震动与老板头像由你决定', 90, 406, 540, 52, 27, GREEN); this.button(this.modal!, '声音 ' + (this.profile.music ? '开' : '关'), 99, 492, 240, 72, () => { this.profile.music = !this.profile.music; if (!this.profile.music)
        this.music.pause(); this.save(); this.close(); this.settings(); }, GOLD, 30, true); this.button(this.modal!, '震动 ' + (this.profile.vibration ? '开' : '关'), 379, 492, 240, 72, () => { this.profile.vibration = !this.profile.vibration; this.save(); this.close(); this.settings(); }, PAPER, 30, true); this.button(this.modal!, '更换老板头像', 129, 608, 462, 79, async () => { const p = await this.platform.chooseBoss(); if (p) {
        this.profile.bossAvatar = p;
        this.save();
        if(await this.loadBoss(p))this.toast('老板头像已更换');
    } }, '#dce4d3', 31, true); this.button(this.modal!, '完成', 229, 791, 262, 72, () => this.close(), GOLD, 31, true); }
    private async loadBoss(path:string){
        this.faceLife?.dispose();const life=new this.core.Lifetime(this.life);this.faceLife=life;
        try{
            const lease=await this.gate.acquire([{key:'boss-avatar:'+path,bytes:16777216}],()=>new Promise<ImageAsset>((resolve,reject)=>assetManager.loadRemote<ImageAsset>(path,{ext:'.png'},(error,image)=>{
                if(error){reject(error);return;}if(image.width>2048||image.height>2048){assetManager.releaseAsset(image);reject(new Error('头像过大'));return;}resolve(image);
            })),(image:ImageAsset)=>assetManager.releaseAsset(image),life);
            if(!this.alive||!life.active)return;this.bossFrame?.destroy();this.faceTexture?.destroy();
            const texture=new Texture2D();texture.image=lease.get('boss-avatar:'+path);this.faceTexture=texture;this.bossFrame=new SpriteFrame();this.bossFrame.texture=texture;return true;
        }catch(error){if(this.alive&&life.active){this.profile.bossAvatar='';this.save();this.toast('请选择不超过 2048 像素的头像');}life.dispose();return false;}
    }
    private collection() { if (this.page === 'battle' && this.battle)
        this.battle.paused = true; this.open('同事图鉴', '', undefined, ''); let i = 0; for (const kind of [...BASIC, ...Object.keys(PAIRS)]) {
        const x = 81 + (i % 2) * 294, y = 403 + Math.floor(i / 2) * 92;
        this.ui.text(this.modal!, kind, x, y, 75, 69, 40, kind === '摸' ? '#b58227' : INK, true);
        this.ui.text(this.modal!, DESCRIPTIONS[kind], x + 80, y, 202, 75, 20, INK);
        i++;
    } this.button(this.modal!, '回到工位', 223, 827, 274, 61, () => this.close(), GOLD, 30, true); }
    private cards() { this.open('人生体验卡', '', undefined, ''); this.ui.text(this.modal!, '积蓄 ' + this.profile.coins, 135, 376, 450, 45, 28, GREEN); CARDS.forEach((c, i) => { const y = 441 + i * 93; this.ui.text(this.modal!, c.name + ' · ' + c.kind, 83, y, 325, 35, 26, INK, true); this.ui.text(this.modal!, c.desc, 83, y + 38, 350, 36, 20, GREEN); this.button(this.modal!, this.profile.cards.includes(c.id) ? '已领取' : String(c.cost), 465, y + 4, 154, 62, () => { if (this.profile.cards.includes(c.id))
        return; if (this.profile.coins < c.cost) {
        this.toast('积蓄还不够，再摸一局');
        return;
    } this.profile.coins -= c.cost; this.profile.cards.push(c.id); this.save(); this.close(); this.cards(); }, this.profile.cards.includes(c.id) ? '#c8d6c5' : GOLD, 29, true); }); this.button(this.modal!, '完成', 228, 835, 264, 55, () => this.close(), PAPER, 27, true); }
    private sign() { if (this.profile.signed === dayKey()) {
        this.open('今日已签到', '摸鱼有度，头发长驻。\n明天再来领取 20 积蓄。');
        return;
    } this.profile.signed = dayKey(); this.profile.coins += 20; this.save(); this.home(); this.open('签到成功', '今日积蓄 +20\n攒起来兑换人生体验卡。'); }
    private achievements() { this.open('打工人成就', '', undefined, ''); const rows = [{ id: 'first', name: '摸鱼初体验', desc: '完成第一场对局', done: this.profile.games >= 1, reward: 20 }, { id: 'boss', name: '拒绝加班', desc: '坚持到第 6 波', done: this.profile.best >= 6, reward: 35 }, { id: 'wins', name: '准点下班', desc: '累计赢下 3 场对局', done: this.profile.wins >= 3, reward: 50 }]; rows.forEach((r, i) => { const y = 431 + i * 116; this.ui.text(this.modal!, r.name, 86, y, 326, 40, 31, INK, true); this.ui.text(this.modal!, r.desc, 86, y + 43, 326, 38, 23, GREEN); const claimed = this.profile.achievements.includes(r.id); this.button(this.modal!, claimed ? '已领取' : r.done ? '领取 ' + r.reward : '未达成', 442, y + 9, 178, 68, () => { if (claimed || !r.done)
        return; this.profile.achievements.push(r.id); this.profile.coins += r.reward; this.save(); this.close(); this.achievements(); }, r.done && !claimed ? GOLD : '#d3dccb', 27, true); }); this.button(this.modal!, '完成', 225, 830, 270, 57, () => this.close(), PAPER, 28, true); }
    private adOptions() { this.open('摸鱼补给', '', undefined, ''); (['shovel', 'shield', 'money'] as const).forEach((kind, i) => this.button(this.modal!, ['铲子 +1', '护发 8 秒', '窝囊费 +30'][i], 174, 448 + i * 113, 372, 77, () => this.ad(kind), GOLD, 30, true)); }
    private async ad(kind: 'shovel' | 'shield' | 'money' | 'revive') { const b = this.battle; if (!b)
        return; b.paused = true; const receipt = await this.platform.reward(); if (receipt && this.battle === b && b.reward(kind, receipt)) {
        if (kind === 'revive') {
            (b as any).settled = false;
            this.showBattle();
        }
        else {
            this.close();
            this.toast('补给已送到工位');
        }
    }
    else
        this.toast('视频未完整观看，本次未领取'); b.paused = false; }
    private toast(text: string, time = 2.8) { if (!this.ui)
        return; this.toastNode?.destroy(); this.toastNode = this.ui.node(this.root, 0, 0, 720, 1280, 'toast'); const y = this.page === 'battle' ? 914 : 605; this.ui.rect(this.toastNode, 55, y, 610, 72, INK, INK, 10); this.ui.text(this.toastNode, text, 69, y + 5, 582, 60, 27, PAPER); this.toastTime = time; }
    private loc(e: EventTouch) { const p = e.getUILocation(), v = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y)); return { x: v.x, y: -v.y }; }
    private inside(p: {
        x: number;
        y: number;
    }, b: Button) { return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h; }
    private down(e: EventTouch) {
        if (this.pointer !== -1)
            return;
        this.pointer = e.getID();
        this.startPoint = this.loc(e);
        this.moved = false;
        if (this.profile.music && !this.music.playing)
            this.music.play();
        if (this.modal || this.page !== 'battle' || this.battle?.ended || (this.battle?.meeting || 0) > 0)
            return;
        const p = this.startPoint, a = this.battle!.sides[0];
        if (p.y >= 1008 && p.y < 1092 && p.x >= 103 && p.x < 678) {
            const i = Math.floor((p.x - 103) / 115), u = a.camp[i];
            if (u)
                this.drag = { source: 'camp', index: i, unit: u };
        }
        else if (p.x >= BX && p.x < BX + 8 * T && p.y >= BY && p.y < BY + 9 * T) {
            const cell = Math.floor((p.x - BX) / T) + Math.floor((p.y - BY) / T) * 8, u = a.units.find(u => u.cell === cell);
            if (u)
                this.drag = { source: 'board', index: u.id, unit: u };
        }
    }
    private move(e: EventTouch) { if (e.getID() !== this.pointer || !this.drag || this.modal)
        return; const p = this.loc(e); if (Math.hypot(p.x - this.startPoint.x, p.y - this.startPoint.y) > 8)
        this.moved = true; if (this.moved) {
        if (!this.ghost) {
            this.ghost = this.glyph(this.root, this.drag.unit, p.x - 40, p.y - 40);
            this.ui.opacity(this.ghost, 205);
        }
        this.ghost.setPosition(p.x - 40, -p.y + 40);
    } }
    private up(e: EventTouch) {
        if (e.getID() !== this.pointer)
            return;
        const p = this.loc(e), drag = this.drag;
        this.moved ||= Math.hypot(p.x-this.startPoint.x,p.y-this.startPoint.y)>8;
        this.pointer = -1;
        this.ghost?.destroy();
        this.ghost = null;
        this.drag = null;
        if (this.modal) {
            const btn = [...this.modalButtons].reverse().find(b => this.inside(p, b) && this.inside(this.startPoint, b));
            btn?.fn();
            return;
        }
        if (this.page === 'battle' && this.battle && drag) {
            if (this.coffee) {
                this.battle.recycle(drag.source, drag.index);
                this.coffee = false;
                this.toast('工位已腾出');
            }
            else if (this.moved) {
                const cell = Math.floor((p.x - BX) / T) + Math.floor((p.y - BY) / T) * 8;
                if (p.y >= BY && p.y < BY + 9 * T && p.x >= BX && p.x < BX + 8 * T) {
                    const msg = this.battle.move(drag.source, drag.index, cell);
                    if (msg)
                        this.toast(msg);
                    else
                        this.sound('merge');
                }
                else if (drag.source === 'board' && p.y >= 1008 && p.y < 1093)
                    this.battle.returnToCamp(drag.index);
            }
            else {
                this.open(drag.unit.kind + ' · ' + drag.unit.level + ' 阶', DESCRIPTIONS[drag.unit.kind] || '单字不攻击。找到另一半，拖在一起激活组合。');
            }
            this.refreshBoard();
            this.save();
            return;
        }
        if (this.expansion && this.page === 'battle' && p.y >= BY && p.y < BY + 9 * T && p.x >= BX && p.x < BX + 8 * T) {
            const i = this.battle!.sides[0].camp.findIndex(u => u?.kind === '铲');
            if (i >= 0) {
                const msg = this.battle!.move('camp', i, Math.floor((p.x - BX) / T) + 8 * Math.floor((p.y - BY) / T));
                this.toast(msg || '鱼塘 +1，摸鱼边界又大了一点');
                if (!msg)
                    this.expansion = false;
                this.refreshBoard();
            }
            return;
        }
        [...this.buttons].reverse().find(b => this.inside(p, b) && this.inside(this.startPoint, b))?.fn();
    }
    private cancel() { this.pointer = -1; this.drag = null; this.ghost?.destroy(); this.ghost = null; }
    update(dt: number) { if (!this.alive || !this.ui)
        return; if (this.toastTime > 0 && (this.toastTime -= dt) <= 0) {
        this.toastNode?.destroy();
        this.toastNode = null!;
    } if (this.page === 'match') {
        this.matchTime -= dt;
        if (this.matchTime <= 0)
            this.showBattle();
    } if (this.page === 'battle' && this.battle) {
        if (!this.modal)
            this.battle.tick(dt);
        this.renderBattle(dt);
        if (this.battle.ended && !this.modal) {
            if (this.battle.winner === 1 && !this.battle.revived && this.platform.adsReady) {
                this.open('再护住一根毛', '完整观看视频，恢复 1 根毛。\n每局限一次。', () => this.ad('revive'), '视频续命');
                this.button(this.modal!, '这次先下班', 175, 809, 370, 65, () => { this.close(); this.settle(); }, PAPER, 29, true);
            }
            else
                this.settle();
        }
        this.saveClock += dt;
        if (this.saveClock > 4) {
            this.saveClock = 0;
            this.save();
        }
    } }
    dispose() { this.alive = false; this.save(); this.root.off(Node.EventType.TOUCH_START, this.down, this); this.root.off(Node.EventType.TOUCH_MOVE, this.move, this); this.root.off(Node.EventType.TOUCH_END, this.up, this); this.root.off(Node.EventType.TOUCH_CANCEL, this.cancel, this); game.off(Game.EVENT_HIDE, this.hide, this); game.off(Game.EVENT_SHOW, this.show, this); this.platform.dispose(); this.music.stop(); this.root.destroy(); for (const frame of Object.values(this.frames))
        frame.destroy(); this.bossFrame?.destroy();this.faceTexture?.destroy();this.life?.dispose(); }
}
