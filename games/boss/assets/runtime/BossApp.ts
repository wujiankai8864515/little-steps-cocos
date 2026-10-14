import {Node, UITransform, Graphics, Label, resources, JsonAsset, Font, game, Game, input, Input, KeyCode, EventKeyboard, Vec3, ImageAsset, Texture2D, SpriteFrame, Sprite} from 'cc';
import {DEBUG} from 'cc/env';
import {CARDS, COMPANIES, COMPANY_TAGS, SKINS, ITEMS, ItemId, Level, dayKey, clamp, validateLevels, DEPART_LINES, RETURN_LINES} from '../core/Config';
import {GameStore} from '../core/Store';
import {RunModel, Row, gateValue, gateLabel} from '../core/RunModel';
import {Platform, Sound, storagePort, wxApi} from './Platform';
import {UI, Art, C, color} from './UI';

const number = (n: number) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const clock = (n: number) => {const seconds = Math.ceil(Math.max(0, n)); return Math.floor(seconds / 60) + ':' + ('0' + seconds % 60).slice(-2);};
export class BossApp {
    store = new GameStore(storagePort()); platform = new Platform(); art = new Art(); ui: UI;
    sound: Sound; levels: Level[] = []; run: RunModel | null = null;
    page = 'loading'; mode = 'campaign'; selected = 1; cardPage = 0; returnPage = 'home';
    private frame: Node; private modal: Node | null = null; private toastNode: Node | null = null;
    private toastTime = 0; private time = 0; private lastHud = 0; private epoch = 0; private alive = true;
    private rowNodes = new Map<number, Node>(); private hero: Node | null = null; private portrait: Node | null = null;
    private progress: Node | null = null; private energyLabel: Label | null = null; private timerLabel: Label | null = null;
    private statusLabel: Label | null = null; private countdown: Label | null = null; private roadLines: Node[] = [];
    private beam: Graphics | null = null; private battleBoss: Node | null = null; private starting = false; private reward = 0;
    private tripLabel: Label | null = null; private friendTexture: Texture2D | null = null; private friendSprite: Sprite | null = null;
    private friendTimer = 0; private previewNow = 0;
    private friendCanvas: any = null;
    private rowSignature = ''; private buddies = new Map<string, Node>(); private shield: Node | null = null;
    private particles: {node: Node; vx: number; vy: number; life: number}[] = []; private fireTimer = 0;
    constructor(private root: Node) {
        this.frame = new Node('Page'); root.addChild(this.frame);
        this.ui = new UI(this.art, () => { this.sound.touch(); this.sound.play('click'); }); this.sound = new Sound(root, this.store);
        this.selected = this.store.state.unlocked;
        game.on(Game.EVENT_HIDE, this.hide, this); game.on(Game.EVENT_SHOW, this.show, this);
        input.on(Input.EventType.KEY_DOWN, this.key, this);
        if (DEBUG) (globalThis as any).__boss_test = {app: this, snapshot: () => this.snapshot(), now: (v: number) => this.previewNow = v};
    }
    private now() { return this.previewNow || Date.now(); }
    snapshot() { return {page: this.page, mode: this.mode, selected: this.selected, save: this.store.state,
        run: this.run && {phase: this.run.phase, energy: this.run.energy, distance: this.run.distance, remaining: this.run.remaining,
            cursor: this.run.cursor, lane: this.run.lane, won: this.run.won, paused: this.run.paused, reason: this.run.reason, reviveUsed: this.run.reviveUsed},
        modal: this.modal?.name || '', nodes: this.rowNodes.size}; }
    async boot() {
        const epoch = ++this.epoch;
        this.loading('正在整理出征档案…');
        try {
            await this.art.bundle('loading');
            if (!this.alive || epoch !== this.epoch) return;
            this.ui.image(this.frame, 'loading-scene', 'loading', 'loading_bg_scene', 360, 640, 720, 1600, false).then(n => n?.setSiblingIndex(1)).catch(() => {});
            this.ui.image(this.frame, 'loading-logo', 'loading', 'loading_title_logo', 360, 500, 560, 240).catch(() => {});
            await this.art.bundle('resources');
            const [levels, font, platform] = await Promise.all([
                this.resource('data/levels', JsonAsset), this.resource('font/Alibaba-PuHuiTi-Heavy', Font), this.resource('data/platform', JsonAsset),
            ]);
            this.levels = validateLevels((levels as JsonAsset).json); this.ui.font = font as Font;
            const config = (platform as JsonAsset).json as any;
            this.platform.adUnitId = typeof config.rewardedAdUnitId === 'string' ? config.rewardedAdUnitId : '';
            this.platform.leaderboardEndpoint = typeof config.leaderboardEndpoint === 'string' ? config.leaderboardEndpoint : '';
            await Promise.all([this.art.bundle('shared'), this.art.bundle('home'), this.art.texture('home', 'hall_bg_scene'),
                this.bossTexture(this.levels[this.selected - 1]), this.sound.load()]);
            if (!this.alive || epoch !== this.epoch) return;
            this.home();
            if (this.store.recovered) this.toast('已从本机备份恢复进度', true);
        } catch (error) {
            if (!this.alive || epoch !== this.epoch) return;
            this.clear('loading-error'); this.ui.text(this.frame, 'error', '档案暂时没准备好\n点击重试，我们再出发', 360, 540, 32, 600, 180);
            this.ui.button(this.frame, 'button-retry-load', '重新加载', 360, 740, 350, 82, () => this.boot(), true);
            console.error('[boss] load failed', error);
        }
    }
    private resource(path: string, type: any) { return new Promise((resolve, reject) => resources.load(path, type, (e, v) => e ? reject(e) : resolve(v))); }
    private bossTexture(level: Level) { return this.art.texture('company_' + level.companyId, 'lv' + ('0' + level.id).slice(-2) + '/hall_stage_boss'); }
    private bossImage(parent: Node, level: Level, x: number, y: number, size: number, name = 'boss-portrait') {
        return this.ui.image(parent, name, 'company_' + level.companyId, 'lv' + ('0' + level.id).slice(-2) + '/hall_stage_boss', x, y, size, size).catch(error => {
            if (parent.isValid) this.ui.text(parent, name + '-fallback', 'BOSS\n' + level.bossName, x, y, 28, size, size);
            console.warn('[boss] portrait fallback', error); return null;
        });
    }
    private clear(page: string) {
        this.closeModal(); this.frame.destroy(); this.frame = this.ui.node(this.root, 'page-' + page);
        this.page = page; this.epoch++; this.rowNodes.clear(); this.hero = this.portrait = this.progress = null;
        this.countdown = this.statusLabel = this.energyLabel = this.timerLabel = this.tripLabel = null;
        this.roadLines = []; this.beam = null; this.battleBoss = null; this.friendSprite = null; this.friendTexture?.destroy(); this.friendTexture = null;
        this.buddies.clear(); this.rowSignature = ''; this.shield = null; this.particles = [];
    }
    private loading(text: string) {
        this.frame.removeAllChildren(); this.page = 'loading';
        this.ui.panel(this.frame, 'loading-floor', 360, 640, 1500, 2600, C.night, C.night, 0);
        this.ui.text(this.frame, 'loading-caption', text, 360, 880, 26, 600, 100);
        this.ui.text(this.frame, 'loading-bottom', '留一点精力给自己', 360, 1080, 22, 600, 80, C.muted);
    }
    private background(parent = this.frame, dark = false) {
        this.ui.panel(parent, 'night-floor', 360, 640, 1500, 2600, C.night, C.night, 0);
        this.ui.image(parent, 'night-scene', 'home', 'hall_bg_scene', 360, 650, 720, 1559, false).catch(() => {});
        if (dark) this.ui.panel(parent, 'night-shade', 360, 640, 1500, 2600, '#000713', '#000713', 0, 130);
    }
    home() {
        this.run = null; this.clear('home'); this.background();
        const level = this.levels[this.selected - 1];
        this.ui.panel(this.frame, 'wallet', 152, 139, 228, 55);
        this.ui.text(this.frame, 'coins', '窝囊费  ' + number(this.store.state.coins), 152, 139, 23, 205, 50);
        this.ui.button(this.frame, 'button-help', '?', 561, 139, 56, 56, () => this.help());
        this.ui.button(this.frame, 'button-settings', '≡', 647, 139, 56, 56, () => this.settings());
        this.ui.image(this.frame, 'title-logo', 'loading', 'loading_title_logo', 360, 272, 540, 205).catch(() => {});
        this.ui.text(this.frame, 'tagline', '留住精力，把委屈打成窝囊费', 360, 395, 23, 640, 55, C.muted);
        this.ui.button(this.frame, 'button-campaign', '闯关 · 25 关', 245, 464, 206, 55, () => {this.mode = 'campaign'; this.home();}, this.mode === 'campaign');
        this.ui.button(this.frame, 'button-brawl', '大乱斗', 475, 464, 206, 55, () => {this.mode = 'brawl'; this.home();}, this.mode === 'brawl');
        const halo = this.ui.node(this.frame, 'boss-halo', 360, 669, 430, 430); const g = halo.addComponent(Graphics);
        g.strokeColor = color('#294975'); g.lineWidth = 2; g.circle(0, 0, 195); g.stroke(); g.circle(0, 0, 205); g.stroke();
        this.bossImage(this.frame, level, 360, 682, 370).then(n => { if (n?.isValid && this.page === 'home') this.portrait = n; });
        this.ui.button(this.frame, 'button-prev-level', '‹', 72, 685, 60, 72, () => { this.selected = Math.max(1, this.selected - 1); this.home(); });
        this.ui.button(this.frame, 'button-next-level', '›', 648, 685, 60, 72, () => { this.selected = Math.min(this.store.state.unlocked, this.selected + 1); this.home(); });
        this.ui.text(this.frame, 'boss-name', this.mode === 'campaign' ? COMPANIES[level.companyId - 1] + ' · 第 ' + level.id + ' 关 · ' + level.bossName : '随机老板 · 随机赛道 · 随机技能', 360, 897, 27, 635, 60);
        this.ui.text(this.frame, 'boss-skill', this.mode === 'campaign' ? '目标精力 ' + number(level.bossEnergy) + '  /  ' + COMPANY_TAGS[level.companyId - 1] : '五家公司，今天随便收拾谁', 360, 949, 22, 600, 55, C.muted);
        this.ui.button(this.frame, 'button-start', '向老板开跑  →', 360, 1037, 456, 87, () => {
            if (this.mode === 'brawl') this.selected = 1 + Math.floor(Math.random() * 25);
            this.preparation();
        }, true);
        this.ui.button(this.frame, 'button-levels', '公司档案', 360, 1110, 180, 42, () => this.levelsPage());
        this.ui.button(this.frame, 'button-cards', '人生体验卡', 130, 1190, 202, 66, () => {this.returnPage = 'home'; this.cardsPage();});
        this.ui.button(this.frame, 'button-expedition', '远征', 360, 1190, 180, 66, () => this.expeditionPage());
        this.ui.button(this.frame, 'button-records', '战绩', 590, 1190, 180, 66, () => this.recordsPage());
        const job = this.store.state.expedition;
        if (job?.end && this.now() >= job.end) this.toast('远征伙伴带着包裹回来啦', true);
        this.sound.resume();
    }
    private header(title: string, action = () => this.home()) {
        this.ui.text(this.frame, 'page-title', title, 360, 155, 40, 500, 85);
        this.ui.button(this.frame, 'button-back', '‹', 63, 155, 60, 62, action);
        this.ui.text(this.frame, 'page-wallet', '窝囊费 ' + number(this.store.state.coins), 360, 229, 22, 600, 50, C.gold);
    }
    levelsPage(company = Math.floor((this.selected - 1) / 5)) {
        this.clear('levels'); this.background(undefined, true); this.header('公司档案');
        for (let i = 0; i < 5; i++) this.ui.button(this.frame, 'button-company-' + (i + 1), COMPANIES[i], 88 + i * 136, 310, 118, 54, () => this.levelsPage(i), i === company);
        this.ui.text(this.frame, 'company-trait', COMPANY_TAGS[company] + '  ·  逐级打到终极老板', 360, 390, 26, 620, 65, C.muted);
        for (let i = 0; i < 5; i++) {
            const level = this.levels[company * 5 + i]; const open = level.id <= this.store.state.unlocked;
            const y = 507 + i * 130;
            this.ui.panel(this.frame, 'level-row-' + level.id, 360, y, 630, 110, '#102441', open ? C.gold : '#394968');
            this.bossImage(this.frame, level, 112, y, 98);
            this.ui.text(this.frame, 'level-name-' + level.id, '第 ' + level.id + ' 关 · ' + level.bossName, 355, y - 18, 24, 330, 45);
            this.ui.text(this.frame, 'level-status-' + level.id, (this.store.state.cleared.includes(level.id) ? '已通关  ' : '') + '目标精力 ' + level.bossEnergy, 350, y + 26, 20, 325, 38, C.muted);
            this.ui.button(this.frame, 'button-level-' + level.id, open ? '出发' : '未解锁', 602, y, 100, 54,
                () => {this.selected = level.id; this.mode = 'campaign'; this.preparation();}, false, open);
        }
    }
    preparation() {
        this.run = null;
        this.clear('prepare'); this.background(undefined, true); const level = this.levels[this.selected - 1];
        this.header('出征档案');
        this.ui.text(this.frame, 'prepare-stage', COMPANIES[level.companyId - 1] + ' · 第 ' + level.id + ' 关', 360, 315, 32, 600, 70);
        this.ui.image(this.frame, 'dossier-art', 'shared', 'prepare_folder_bg', 360, 620, 670, 490, false).catch(() => {});
        const ink = C.ink;
        const skin = SKINS.find(v => v.id === this.store.state.skin)!;
        if (this.store.state.gender === 'female') this.drawHero(this.frame, 143, 628).setScale(1.2, 1.2);
        else this.ui.image(this.frame, 'skin-preview', 'shared', skin.image, 162, 598, 180, 218).catch(() => {});
        this.ui.text(this.frame, 'prepare-person', this.store.state.gender === 'female' ? '女打工人' : '男打工人', 165, 746, 25, 210, 55, ink);
        this.ui.text(this.frame, 'prepare-name', '姓名：打工人', 451, 460, 29, 330, 65, ink);
        this.ui.button(this.frame, 'button-gender-male', '男', 365, 537, 140, 54, () => {this.store.state.gender = 'male'; this.store.persist(); this.preparation();}, this.store.state.gender === 'male');
        this.ui.button(this.frame, 'button-gender-female', '女', 533, 537, 140, 54, () => {this.store.state.gender = 'female'; this.store.persist(); this.preparation();}, this.store.state.gender === 'female');
        this.ui.button(this.frame, 'button-skins', skin.name + '  ›', 451, 612, 310, 58, () => this.skins());
        const card = CARDS.find(c => c.id === this.store.state.equipped);
        this.ui.button(this.frame, 'button-prepare-cards', card ? card.name + '  ›' : '选择人生体验卡  ›', 451, 690, 310, 58, () => {this.returnPage = 'prepare'; this.cardsPage();});
        this.ui.text(this.frame, 'start-energy', '开局精力 ' + this.store.startEnergy(), 451, 772, 30, 330, 70, ink);
        this.ui.button(this.frame, 'button-spa', this.store.state.spa ? '轻养护已准备 · 150 精力' : '轻养护 · 25 窝囊费 · 150 精力', 360, 908, 470, 60,
            () => {if (this.store.buySpa()) this.preparation(); else this.toast(this.store.state.spa ? '已准备，下局自动使用' : '窝囊费不足，先去打败老板', false);});
        this.ui.button(this.frame, 'button-run', this.starting ? '正在准备…' : '准备出发  START', 360, 1016, 470, 90, () => this.startRun(), true);
        this.ui.text(this.frame, 'prepare-tip', '左右滑动选门 · 数值越高，火力越强\n体验卡与轻养护取最高值，本局开始时消耗', 360, 1131, 24, 625, 125, C.muted);
    }
    private skins() {
        const modal = this.openModal('skins', '打工人衣橱');
        for (let i = 0; i < SKINS.length; i++) {
            const skin = SKINS[i]; const owned = this.store.state.skins.includes(skin.id); const y = 474 + i * 197;
            this.ui.image(modal, 'wardrobe-' + skin.id, 'shared', skin.image, 146, y, 125, 150).catch(() => {});
            this.ui.text(modal, 'skin-name-' + skin.id, skin.name, 425, y - 45, 30, 330, 60);
            this.ui.button(modal, 'button-skin-' + skin.id, this.store.state.skin === skin.id ? '已穿戴' : owned ? '穿戴' : skin.cost + ' 窝囊费解锁', 425, y + 30, 310, 62,
                () => {if (this.store.buySkin(skin.id)) this.preparation(); else this.toast('窝囊费不足', false);}, owned);
        }
    }
    cardsPage() {
        this.clear('cards'); this.background(undefined, true);
        this.header('人生体验卡', () => this.returnPage === 'prepare' ? this.preparation() : this.home());
        this.ui.text(this.frame, 'cards-explain', '9 片合成一张 · 使用后在下局开跑时生效', 360, 303, 23, 660, 60, C.muted);
        const cards = CARDS.slice(this.cardPage * 3, this.cardPage * 3 + 3);
        cards.forEach((card, i) => {
            const y = 471 + i * 258; const owned = this.store.state.cards[card.id] || 0; const fragments = this.store.state.fragments[card.id] || 0;
            this.ui.panel(this.frame, 'card-' + card.id, 360, y, 640, 233, '#102441', this.store.state.equipped === card.id ? C.teal : C.gold);
            this.ui.image(this.frame, 'card-scene-' + card.id, 'cards', card.scene, 153, y - 40, 174, 115).catch(() => {});
            this.ui.text(this.frame, 'card-name-' + card.id, card.name, 449, y - 70, 27, 365, 45);
            this.ui.text(this.frame, 'card-energy-' + card.id, '开局精力 ' + card.energy + '  /  拥有 ' + owned, 406, y - 17, 22, 273, 45, C.teal);
            this.ui.text(this.frame, 'card-flavour-' + card.id, card.text, 358, y + 37, 19, 581, 50, C.muted);
            this.ui.text(this.frame, 'card-fragment-' + card.id, '碎片 ' + fragments + '/9', 147, y + 83, 20, 164, 42, C.gold);
            this.ui.button(this.frame, 'button-card-detail-' + card.id, '详情', 601, y - 16, 84, 39, () => this.cardDetail(card.id));
            this.ui.button(this.frame, 'button-card-buy-' + card.id, card.price + ' 兑换', 304, y + 84, 133, 44, () => { if (this.store.buyCard(card.id)) this.cardsPage(); else this.toast('窝囊费不足', false); });
            this.ui.button(this.frame, 'button-card-use-' + card.id, this.store.state.equipped === card.id ? '已装备' : '装备', 460, y + 84, 140, 44,
                () => {this.store.equip(card.id); this.cardsPage();}, this.store.state.equipped === card.id, owned > 0);
            this.ui.button(this.frame, 'button-card-craft-' + card.id, '合成', 603, y + 84, 100, 44, () => {if (this.store.craft(card.id)) this.cardsPage();}, false, fragments >= 9);
        });
        this.ui.button(this.frame, 'button-cards-prev', '‹ 上一页', 167, 1175, 190, 62, () => {this.cardPage--; this.cardsPage();}, false, this.cardPage > 0);
        this.ui.text(this.frame, 'cards-pagination', (this.cardPage + 1) + ' / 4', 360, 1175, 24, 160, 62, C.gold);
        this.ui.button(this.frame, 'button-cards-next', '下一页 ›', 553, 1175, 190, 62, () => {this.cardPage++; this.cardsPage();}, false, this.cardPage < 3);
    }
    private cardDetail(id: string) {
        const c = CARDS.find(v => v.id === id)!; const modal = this.openModal('card-detail', c.name);
        this.ui.image(modal, 'experience-scene', 'cards', c.scene, 360, 507, 565, 325).catch(() => {});
        this.ui.text(modal, 'experience-story', c.text, 360, 742, 30, 570, 125);
        this.ui.text(modal, 'experience-power', '下局开局精力 ' + c.energy + '\n拥有 ' + (this.store.state.cards[id] || 0) + ' 张 · 碎片 ' + (this.store.state.fragments[id] || 0) + '/9', 360, 868, 24, 580, 110, C.teal);
        this.ui.button(modal, 'button-fragment-buy', '12 窝囊费兑换 1 片', 360, 1015, 360, 68, () => {
            if (this.store.buyFragment(id)) {this.cardDetail(id); this.toast('碎片已入账', true);} else this.toast('窝囊费不足', false);
        });
    }
    expeditionPage() {
        this.clear('expedition'); this.background(undefined, true); this.header('替你去看世界');
        this.ui.image(this.frame, 'expedition-view', 'cards', 'travel', 360, 489, 612, 353).catch(() => {});
        this.ui.text(this.frame, 'expedition-quote', DEPART_LINES[0], 360, 760, 31, 616, 150);
        this.tripLabel = this.ui.text(this.frame, 'expedition-countdown', '', 360, 927, 32, 640, 110, C.teal);
        const job = this.store.state.expedition; const ready = job && this.now() >= job.end;
        this.ui.button(this.frame, 'button-trip', ready ? '打开远征包裹' : job ? '伙伴正在远方旅行' : '派遣伙伴 · 10 分钟', 360, 1060, 475, 83, () => {
            if (!this.store.state.expedition) {this.store.dispatch(this.now()); this.expeditionPage(); this.toast(DEPART_LINES[Math.floor(Math.random() * DEPART_LINES.length)], true);}
            else {const reward = this.store.claimExpedition(this.now()); if (reward) {this.expeditionPage(); const m = this.openModal('parcel', '远征包裹');
                this.ui.text(m, 'parcel-quote', RETURN_LINES[reward.quote], 360, 532, 32, 568, 155);
                this.ui.text(m, 'parcel-reward', '窝囊费 +' + reward.coins + '\n' + CARDS.find(c => c.id === reward.card)!.name + '碎片 +' + reward.fragments, 360, 749, 34, 570, 190, C.gold);
                this.ui.button(m, 'button-parcel-ok', '已收入背包', 360, 1006, 360, 76, () => this.closeModal(), true);
            }}
        }, true, !job || !!ready);
        this.ui.text(this.frame, 'expedition-rules', '离线也会计时 · 包裹含 2–50 窝囊费和 1–3 碎片\n旅途中可以照常闯关，回来后点击领取', 360, 1170, 22, 655, 108, C.muted);
        this.updateTrip();
    }
    private updateTrip() {
        if (!this.tripLabel || this.page !== 'expedition') return;
        const e = this.store.state.expedition;
        this.tripLabel.string = e ? this.now() >= e.end ? '伙伴已归来，包裹待领取' : '距离归来  ' + clock((e.end - this.now()) / 1000) : '去山川湖海，捎一份温柔回来';
    }
    recordsPage() {
        this.clear('records'); this.background(undefined, true); this.header('打工人战绩');
        this.ui.panel(this.frame, 'stats', 360, 375, 636, 188);
        this.ui.text(this.frame, 'stats-number', '通关 ' + this.store.state.cleared.length + '/25    胜利 ' + this.store.state.victories + ' 次', 360, 342, 31, 595, 60);
        this.ui.text(this.frame, 'stats-earned', '累计窝囊费 ' + number(this.store.state.earned), 360, 416, 26, 596, 60, C.gold);
        this.ui.text(this.frame, 'rank-label', '本机最高火力记录', 360, 526, 29, 640, 65);
        const records = this.store.state.records.slice(0, 6);
        if (!records.length) this.ui.text(this.frame, 'rank-empty', '第一份战绩，等你亲手打出来。', 360, 712, 29, 620, 120, C.muted);
        records.forEach((r, i) => { const y = 602 + i * 63;
            this.ui.text(this.frame, 'record-' + i, (i + 1) + '    ' + (r.mode === 'brawl' ? '乱斗' : '闯关') + '第 ' + r.level + ' 关    精力 ' + number(r.energy), 360, y, 23, 620, 56, i === 0 ? C.gold : C.paper);
        });
        this.ui.button(this.frame, 'button-daily', this.store.state.daily === dayKey(this.now()) ? '今日补给已领取' : '领取今日补给 · +35', 360, 1045, 450, 66,
            () => { if (this.store.daily(this.now())) {this.recordsPage(); this.toast('今日补给 · 窝囊费 +35', true);} }, false, this.store.state.daily !== dayKey(this.now()));
        this.ui.button(this.frame, 'button-share-record', '分享战绩', 164, 1143, 254, 66, () => this.share());
        this.ui.button(this.frame, 'button-friends', '好友榜', 446, 1143, 165, 66, () => this.friends());
        this.ui.button(this.frame, 'button-online-rank', '全网榜', 622, 1143, 148, 66, () => this.onlineRanks());
    }
    private friends() {
        const modal = this.openModal('friends', '好友排行榜');
        if (!this.platform.hasFriends) {this.ui.text(modal, 'friends-unavailable', '在微信里与好友比一比\n本机战绩已保存在这里', 360, 677, 31, 570, 220); return;}
        const surface = this.platform.friendSurface();
        if (!surface) {this.ui.text(modal, 'friends-unavailable', '好友榜暂时不可用，请稍后再试', 360, 677, 31, 570, 220); return;}
        try {
            const canvas = surface.canvas; canvas.width = 600; canvas.height = 700; this.friendCanvas = canvas;
            const node = this.ui.node(modal, 'friends-canvas', 360, 690, 600, 700);
            const image = new ImageAsset(); image.reset(canvas);
            this.friendTexture = new Texture2D(); this.friendTexture.image = image; this.friendTexture.create(canvas.width, canvas.height);
            const frame = new SpriteFrame(); frame.texture = this.friendTexture;
            this.friendSprite = node.addComponent(Sprite); this.friendSprite.spriteFrame = frame; this.friendSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            surface.context.postMessage({type: 'boss:rank', width: 600, height: 700});
        } catch (_) {
            modal.getChildByName('friends-canvas')?.destroy();
            this.friendTexture?.destroy(); this.friendTexture = null; this.friendSprite = null; this.friendCanvas = null;
            this.ui.text(modal, 'friends-unavailable', '好友榜暂时不可用，请稍后再试', 360, 677, 31, 570, 220);
        }
    }
    private async onlineRanks() {
        const modal = this.openModal('online-ranks', '全网排行榜');
        const status = this.ui.text(modal, 'online-status', '正在获取排行榜…', 360, 490, 30, 570, 140);
        try { const rows = await this.platform.onlineRanks(); if (!modal.isValid) return; status.string = rows.length ? '' : '暂无战绩';
            rows.slice(0, 7).forEach((r, i) => this.ui.text(modal, 'online-row-' + i, (i + 1) + '  ' + r.name.slice(0, 10) + '  通关 ' + r.cleared + '  ' + r.earned + ' 窝囊费', 360, 465 + i * 76, 23, 570, 70));
        } catch (e) { if (modal.isValid) status.string = this.platform.leaderboardEndpoint ? '榜单暂时不可用，稍后再试' : '联网榜单尚未开放\n继续开跑，先创造自己的纪录'; }
    }
    private share() { if (!this.platform.share(this.selected)) this.toast('请在微信内分享战绩', false); }
    private help() {
        const modal = this.openModal('help', '打工人开跑指南');
        this.ui.text(modal, 'help-content', '01  左右滑动，选择收益更高的门\n02  金色光环是福利，红色恶魔角是障碍\n03  守住精力，三分钟内到达老板办公室\n04  你的精力 ≥ 老板精力，就能把他轰下椅子\n05  窝囊费可换皮肤、体验卡和开局轻养护\n06  派伙伴远征，离线十分钟也能带回包裹', 360, 660, 27, 566, 520);
        this.ui.text(modal, 'help-controls', '电脑也可用 ← → / A D 控制\n人生体验卡只在下一局使用一次', 360, 987, 23, 565, 100, C.muted);
    }
    private settings() {
        const modal = this.openModal('settings', '下班设置');
        this.ui.button(modal, 'button-sound-toggle', '音乐音效：' + (this.store.state.music ? '开' : '关'), 360, 513, 420, 75, () => {
            this.store.state.music = !this.store.state.music; this.store.persist(); if (this.store.state.music) this.sound.resume(); else this.sound.pause(); this.settings();
        });
        this.ui.button(modal, 'button-vibrate-toggle', '触感反馈：' + (this.store.state.vibration ? '开' : '关'), 360, 657, 420, 75,
            () => {this.store.state.vibration = !this.store.state.vibration; this.store.persist(); this.settings();});
        this.ui.text(modal, 'settings-save', '进度自动保存在本机\n留住精力，记得好好休息。', 360, 859, 28, 570, 190, C.muted);
        this.ui.text(modal, 'version', '向老板开炮  v1.0.0', 360, 1034, 20, 600, 60, C.muted);
    }
    private openModal(name: string, title: string) {
        this.closeModal(); const modal = this.ui.node(this.root, 'modal-' + name); this.modal = modal;
        const shade = this.ui.panel(modal, 'input-blocker', 360, 640, 2200, 3000, '#000712', '#000712', 0, 215);
        shade.on(Node.EventType.TOUCH_START, (e: any) => e.propagationStopped = true);
        shade.on(Node.EventType.TOUCH_END, (e: any) => e.propagationStopped = true);
        this.ui.panel(modal, 'modal-panel', 360, 691, 650, 874);
        this.ui.text(modal, 'modal-title', title, 360, 313, 37, 538, 80);
        this.ui.button(modal, 'button-modal-close', '×', 630, 309, 56, 56, () => this.closeModal());
        return modal;
    }
    private closeModal() { this.modal?.destroy(); this.modal = null; this.friendSprite = null; this.friendCanvas = null; this.friendTexture?.destroy(); this.friendTexture = null; }
    toast(text: string, good = true) {
        this.toastNode?.destroy(); this.toastNode = this.ui.node(this.root, 'toast');
        this.ui.panel(this.toastNode, 'toast-bg', 360, 354, 642, 94, '#09213b', good ? C.teal : C.red, 14, 250);
        this.ui.text(this.toastNode, 'toast-text', text, 360, 354, 26, 598, 86, good ? C.paper : '#ffd2c9');
        this.toastTime = 3.1;
    }
    private async startRun() {
        if (this.starting) return; this.starting = true; const selected = this.selected; const epoch = this.epoch;
        try {
            const level = this.levels[selected - 1]; await Promise.all([this.bossTexture(level), this.art.bundle('shared')]);
            if (!this.alive || this.page !== 'prepare' || this.epoch !== epoch) return;
            this.run = new RunModel(level, this.mode, this.store.consumeStart(), this.now() >>> 0);
            this.reward = 0; this.drawRun(); this.store.state.tutorial = true; this.store.persist();
            if (this.store.persistenceError) this.toast(this.store.persistenceError, false);
        } catch (e) { this.toast('赛道暂时未准备好，请再点一次出发', false); console.error('[boss] track preparation', e); }
        finally { this.starting = false; }
    }
    private drawRun() {
        this.clear('run');
        this.ui.panel(this.frame, 'road-base', 360, 640, 1800, 2600, C.night, C.night, 0);
        this.ui.panel(this.frame, 'road-floor', 360, 730, 720, 830, '#344b69', '#344b69', 0);
        this.ui.panel(this.frame, 'road-carpet', 360, 730, 520, 830, '#244262', '#d6b662', 0);
        for (let i = 0; i < 8; i++) {
            const line = this.ui.node(this.frame, 'road-line-' + i, 360, 300 + i * 120, 400, 12); const g = line.addComponent(Graphics);
            g.fillColor = color('#59728d'); g.rect(-86, -17, 4, 34); g.rect(86, -17, 4, 34); g.fill(); this.roadLines.push(line);
        }
        for (let side = 0; side < 2; side++) for (let i = 0; i < 5; i++) {
            const desk = this.ui.node(this.frame, 'desk-' + side + '-' + i, side ? 670 : 50, 365 + i * 190, 76, 120);
            const g = desk.addComponent(Graphics); g.fillColor = color('#16283d'); g.rect(-34, -47, 68, 96); g.fill();
            g.fillColor = color('#a89982'); g.rect(-32, -43, 64, 90); g.fill();
            g.fillColor = color('#263348'); g.rect(-25, 4, 50, 31); g.fill();
            g.fillColor = color('#82a9b4'); g.rect(-20, 9, 40, 20); g.fill();
            g.fillColor = color('#e1c99a'); g.rect(-20, -32, 40, 23); g.fill();
        }
        this.renderRows(); this.hero = this.drawHero(this.frame, 360, 1022);
        const drag = this.ui.node(this.frame, 'drag-area', 360, 735, 720, 826);
        let start = 0, initial = 0;
        drag.on(Node.EventType.TOUCH_START, (e: any) => {start = e.getUILocation().x; initial = this.run?.x || 0; this.sound.touch();});
        drag.on(Node.EventType.TOUCH_MOVE, (e: any) => {
            if (!this.run || this.run.paused || this.run.phase !== 'running') return;
            const p = this.root.getComponent(UITransform)!; const a = p.convertToNodeSpaceAR(new Vec3(start, 0)); const b = p.convertToNodeSpaceAR(new Vec3(e.getUILocation().x, 0));
            this.run.move(initial + (b.x - a.x) / 180);
        });
        this.ui.panel(this.frame, 'hud-bg', 360, 150, 780, 340, '#081b32', '#263e58', 0);
        this.ui.button(this.frame, 'button-pause', 'Ⅱ', 62, 112, 66, 57, () => this.pause());
        this.ui.text(this.frame, 'run-title', (this.mode === 'brawl' ? '大乱斗' : COMPANIES[this.run!.level.companyId - 1] + ' · 第 ' + this.run!.level.id + ' 关'), 368, 110, 26, 445, 64);
        this.energyLabel = this.ui.text(this.frame, 'run-energy', '', 222, 185, 36, 390, 69, C.gold);
        this.timerLabel = this.ui.text(this.frame, 'run-time', '', 568, 185, 30, 224, 65);
        this.progress = this.ui.bar(this.frame, 'run-progress', 360, 249, 605, 19);
        this.ui.text(this.frame, 'run-target', '老板精力 ' + number(this.run!.level.bossEnergy) + '   ·   办公室在前方', 360, 285, 22, 637, 48, C.muted);
        this.ui.panel(this.frame, 'footer-bg', 360, 1220, 790, 180, '#081b32', '#263e58', 0);
        this.ui.button(this.frame, 'button-left', '←', 97, 1200, 106, 76, () => {if (!this.run!.paused) this.run!.move(Math.max(-1, this.run!.lane - 2));});
        this.ui.button(this.frame, 'button-right', '→', 623, 1200, 106, 76, () => {if (!this.run!.paused) this.run!.move(Math.min(1, this.run!.lane));});
        this.ui.text(this.frame, 'controls-tip', '左右滑动 · 选择更高收益', 360, 1174, 22, 416, 44);
        this.statusLabel = this.ui.text(this.frame, 'run-status', '', 360, 1220, 18, 418, 50, C.teal);
        this.countdown = this.ui.text(this.frame, 'run-countdown', '', 360, 622, 70, 640, 185, C.gold);
        this.updateHud();
    }
    private drawHero(parent: Node, x: number, y: number) {
        const n = this.ui.node(parent, 'runner', x, y, 176, 207);
        const g = n.addComponent(Graphics); const skin = SKINS.find(v => v.id === this.store.state.skin)!;
        g.fillColor = color('#101c31', 120); g.ellipse(0, -48, 61, 17); g.fill();
        g.strokeColor = color(C.ink); g.lineWidth = 6; g.fillColor = color(skin.color);
        g.roundRect(-37, -35, 74, 80, 9); g.fill(); g.stroke();
        g.fillColor = color('#20283c'); g.rect(-29, -71, 19, 43); g.rect(10, -71, 19, 43); g.fill();
        g.fillColor = color('#ffe3b0'); g.circle(0, 62, 26); g.fill(); g.stroke();
        g.fillColor = color('#19243b'); g.rect(-25, 69, 50, 17); g.fill();
        if (this.store.state.gender === 'female') {g.rect(-29, 35, 10, 43); g.rect(18, 35, 10, 43); g.fill();}
        g.fillColor = color(C.ink); g.rect(-12, 57, 4, 5); g.rect(8, 57, 4, 5); g.rect(-5, 45, 10, 3); g.fill();
        g.fillColor = color('#43647b'); g.roundRect(25, -15, 75, 65, 7); g.fill(); g.stroke();
        g.fillColor = color(C.gold); g.roundRect(39, 28, 47, 67, 6); g.fill(); g.stroke();
        g.fillColor = color('#081a2d'); g.ellipse(62, 94, 24, 8); g.fill();
        g.fillColor = color('#101a2d'); g.circle(39, -17, 15); g.circle(86, -17, 15); g.fill();
        g.fillColor = color('#bdc6c5'); g.circle(39, -17, 6); g.circle(86, -17, 6); g.fill();
        this.ui.text(n, 'runner-badge', '下班', 360, 635, 16, 65, 26, C.ink); return n;
    }
    private renderRows() {
        const run = this.run!;
        const signature = (run.trap > 0 ? 'trap' : 'normal') + (run.badItems > 0 ? '-bad' : '');
        if (signature !== this.rowSignature) {for (const n of this.rowNodes.values()) n.destroy(); this.rowNodes.clear(); this.rowSignature = signature;}
        for (const [id, n] of this.rowNodes) if (id < run.cursor || 1000 - (run.rows[id].at - run.distance) * 155 > 1130) {n.destroy(); this.rowNodes.delete(id);}
        for (let i = run.cursor; i < run.rows.length; i++) {
            const row = run.rows[i]; const y = 1000 - (row.at - run.distance) * 155;
            if (y < 205) break; if (y > 1130) continue;
            let n = this.rowNodes.get(i);
            if (!n) {n = this.ui.node(this.frame, 'row-' + i); n.setSiblingIndex(10); this.drawRow(n, row); this.rowNodes.set(i, n);}
            n.setPosition(0, 1000 - y);
            // Trap gates are visibly relabelled when the effect begins/expires.
            if (row.kind === 'gate') row.gates!.forEach((g, lane) => {
                const gate = run.effectiveGate(g); const labels = n!.getChildByName('gate-' + lane);
                const text = labels?.getChildByName('gate-number')?.getComponent(Label);
                if (text) {text.string = gateLabel(gate); text.color = color(gateValue(run.energy, gate) >= run.energy ? C.teal : C.red);}
            });
        }
    }
    private drawRow(parent: Node, row: Row) {
        if (row.kind === 'gate') {
            row.gates!.forEach((original, lane) => {
                const gate = this.run!.effectiveGate(original);
                const good = gateValue(this.run!.energy, gate) >= this.run!.energy; const x = 181 + lane * 179;
                const n = this.ui.panel(parent, 'gate-' + lane, x, 1000, 157, 176, '#12304d', good ? C.gold : C.red, 7, 238);
                const g = n.getComponent(Graphics)!; g.strokeColor = color(good ? C.gold : C.red); g.lineWidth = 5;
                if (good) {g.ellipse(0, 103, 29, 7); g.stroke();} else {g.moveTo(-45, 90); g.lineTo(-33, 108); g.lineTo(-24, 90); g.moveTo(24, 90); g.lineTo(33, 108); g.lineTo(45, 90); g.stroke();}
                this.ui.text(n, 'gate-number', gateLabel(gate), 360, 652, 38, 147, 83, good ? C.teal : C.red);
                this.ui.text(n, 'gate-name', gate.name, 360, 596, 18, 145, 42, C.paper);
                this.ui.text(n, 'gate-footer', good ? '福利' : '压力', 360, 702, 16, 140, 35, good ? C.gold : C.red);
            });
        } else if (row.kind === 'item') row.items!.forEach((item, lane) => {if (item) this.drawItem(parent, this.run!.badItems > 0 && ITEMS[item].good ? 'overtime' : item, 181 + lane * 179, 1000);});
        else {
            this.ui.panel(parent, 'encounter-banner', 360, 1000, 485, 139, row.kind === 'skill' ? '#5a293d' : '#233e4e', C.red);
            this.ui.text(parent, 'encounter-name', row.kind === 'skill' ? '老板亲临！' : '狗腿子拦路 · 精力 ' + row.enemy, 360, 984, 28, 470, 67);
            this.ui.text(parent, 'encounter-hint', row.kind === 'skill' ? '注意：专属技能即将生效' : '火力对比，自动交锋', 360, 1042, 19, 475, 42, C.red);
        }
    }
    private drawItem(parent: Node, id: ItemId, x: number, y: number) {
        const item = ITEMS[id]; const node = this.ui.panel(parent, 'item-' + id, x, y, 142, 142, item.good ? '#143e49' : '#4a2939', item.good ? C.gold : C.red, 9);
        const g = node.getComponent(Graphics)!; g.fillColor = color(item.good ? C.gold : C.red);
        if (id === 'fish') {g.ellipse(0, 7, 33, 17); g.fill(); g.moveTo(25, 7); g.lineTo(48, 25); g.lineTo(48, -10); g.close(); g.fill();}
        else if (id === 'ally' || id === 'thief') {g.circle(0, 24, 14); g.fill(); g.rect(-19, -26, 38, 32); g.fill();}
        else if (id === 'food') {g.roundRect(-30, -23, 60, 48, 5); g.fill(); g.strokeColor = color(C.ink); g.lineWidth = 4; g.moveTo(-20, 25); g.lineTo(-20, 41); g.lineTo(20, 41); g.lineTo(20, 25); g.stroke();}
        else if (id === 'raise' || id === 'layoff') {g.rect(-32, -22, 64, 54); g.fill(); g.strokeColor = color(C.ink); g.lineWidth = 6; g.moveTo(0, -22); g.lineTo(0, 40); g.moveTo(-34, 22); g.lineTo(34, 22); g.stroke();}
        else {g.rect(-34, -20, 68, 48); g.fill(); g.strokeColor = color(C.ink); g.lineWidth = 3; g.moveTo(-30, 24); g.lineTo(0, 0); g.lineTo(30, 24); g.stroke();}
        g.strokeColor = color(item.good ? C.gold : C.red); g.lineWidth = 4;
        if (item.good) {g.ellipse(0, 88, 28, 6); g.stroke();} else {g.moveTo(-27, 72); g.lineTo(-23, 89); g.lineTo(-8, 72); g.moveTo(8, 72); g.lineTo(23, 89); g.lineTo(27, 72); g.stroke();}
        this.ui.text(node, 'item-name', item.name, 360, 695, 18, 133, 39, C.paper);
    }
    private updateHud() {
        const r = this.run; if (!r) return;
        if (this.energyLabel) this.energyLabel.string = '精力 ' + number(r.energy) + (r.fakeEnergy ? ' +' + r.fakeEnergy + ' 画饼' : '');
        if (this.timerLabel) {this.timerLabel.string = clock(r.remaining); this.timerLabel.color = color(r.remaining < 30 ? C.red : C.paper);}
        this.progress?.setScale(Math.max(.001, r.distance / r.length), 1);
        if (this.countdown && r.phase !== 'duel') this.countdown.string = r.phase === 'ready' ? '准备出发\n' + Math.max(1, Math.ceil(r.phaseTime)) : r.phase === 'intro' ? '向老板开炮！\n' + Math.max(1, Math.ceil(r.phaseTime)) : '';
        if (this.statusLabel) this.statusLabel.string = [r.fish > 0 ? '摸鱼无敌 ' + Math.ceil(r.fish) + 's' : '', r.ally ? '背锅同事 ×' + r.ally : '', r.trap ? '陷阱对调 ×' + r.trap : '', r.stop > 0 ? '需求被卡 ' + Math.ceil(r.stop) + 's' : '', r.thief ? '增益将被抢走' : '', r.slow > 0 ? '无限加班' : '', r.rush > 0 ? 'OKR 加速' : '', r.badItems ? '福利变压力 ×' + r.badItems : '', r.noPickup > 0 ? '福利禁用 ' + Math.ceil(r.noPickup) + 's' : ''].filter(Boolean).join(' · ');
    }
    private drawDuel() {
        this.clear('duel'); this.background(undefined, true); const r = this.run!;
        this.ui.text(this.frame, 'duel-heading', '向老板开炮！', 360, 154, 46, 640, 90, C.gold);
        this.ui.text(this.frame, 'duel-boss-name', COMPANIES[r.level.companyId - 1] + ' · ' + r.level.bossName, 360, 256, 28, 600, 75);
        this.ui.image(this.frame, 'office-bg', 'company_1', 'lv01/battle_boss_bg', 360, 510, 720, 466, false).catch(() => {});
        this.bossImage(this.frame, r.level, 360, 506, 385).then(n => {if (n?.isValid && this.page === 'duel') this.battleBoss = n;});
        this.ui.text(this.frame, 'duel-boss-power', '老板精力  ' + number(r.level.bossEnergy), 360, 733, 28, 600, 65, C.red);
        this.hero = this.drawHero(this.frame, 322, 1051); this.hero.setScale(1.25, 1.25);
        this.ui.text(this.frame, 'duel-player-power', '你的精力  ' + number(r.energy), 360, 1184, 32, 620, 75, C.teal);
        const beam = this.ui.node(this.frame, 'duel-beam'); this.beam = beam.addComponent(Graphics);
        this.countdown = this.ui.text(this.frame, 'duel-countdown', '', 360, 860, 38, 620, 110, C.gold);
        this.updateHud();
    }
    private drawResult() {
        const r = this.run!;
        if (r.won) { this.reward = this.store.win(r.id, r.level.id, r.energy, r.mode, r.level.reward, this.now());
            this.platform.publishScore(this.store.state.cleared.length, this.store.state.earned); }
        this.clear('result'); this.background(undefined, true);
        this.sound.play(r.won ? 'win' : 'lose');
        this.ui.text(this.frame, 'result-title', r.won ? r.level.id === 25 && r.mode === 'campaign' ? '打工人，彻底觉醒！' : '老板认怂了！' : '先休息，再反击', 360, 199, 45, 660, 110, r.won ? C.gold : C.paper);
        this.bossImage(this.frame, r.level, 360, 437, 345).then(n => { if (n?.isValid && r.won) {n.angle = -12; const sprite = n.getComponent(Sprite); if (sprite) sprite.color = color('#efb3a5');} });
        if (r.won) {
            for (let i = 0; i < 13; i++) { const x = 125 + i * 39; const y = 378 + Math.sin(i * 2.3) * 160;
                const coin = this.ui.node(this.frame, 'coin-' + i, x, y, 20, 24); const g = coin.addComponent(Graphics); g.fillColor = color(C.gold); g.strokeColor = color('#8a5d28'); g.lineWidth = 3; g.ellipse(0, 0, 9, 13); g.fill(); g.stroke();
                this.particles.push({node: coin, vx: (x - 360) * .18, vy: 130 + i * 13, life: 2.5}); }
        }
        this.ui.panel(this.frame, 'result-panel', 360, 744, 644, 291);
        this.ui.text(this.frame, 'result-energy', '你的精力 ' + number(r.energy) + '   VS   老板 ' + number(r.level.bossEnergy), 360, 650, 26, 593, 73, r.won ? C.teal : C.red);
        this.ui.text(this.frame, 'result-body', r.won ? '窝囊费 +' + this.reward + '\n' + (r.mode === 'campaign' ? r.level.id < 25 ? '第 ' + (r.level.id + 1) + ' 关已解锁' : '25 关全部挑战完成，随时回来再战' : '这一次，委屈变成了奖金') : r.reason + '\n“' + r.level.bossFailText + '”', 360, 762, 29, 591, 153, C.paper);
        if (r.won) {
            this.ui.button(this.frame, 'button-result-next', r.level.id === 25 && r.mode === 'campaign' ? '再战终极老板' : '继续开跑  →', 360, 982, 464, 82, () => {this.selected = r.mode === 'campaign' ? Math.min(25, r.level.id + 1) : 1 + Math.floor(Math.random() * 25); this.preparation();}, true);
            this.ui.button(this.frame, 'button-result-share', '分享战绩', 360, 1090, 358, 61, () => this.share());
        } else {
            this.ui.button(this.frame, 'button-revive', r.reviveUsed ? '本局恢复机会已用完' : this.platform.hasAd ? '看完整视频 · 恢复 80% 精力' : '免费恢复 · 保留 80% 精力', 360, 969, 505, 79, () => this.revive(), true, !r.reviveUsed);
            this.ui.button(this.frame, 'button-restart', '重新开局', 360, 1075, 354, 66, () => this.preparation());
        }
        this.ui.button(this.frame, 'button-result-home', '返回大厅', 360, 1170, 340, 58, () => {this.selected = this.store.state.unlocked; this.home();});
    }
    private async revive() {
        const run = this.run; if (!run || run.reviveUsed || this.starting) return;
        this.starting = true;
        try {
            const result = this.platform.hasAd ? await this.platform.rewardAd() : 'completed';
            if (!this.alive || this.run !== run) return;
            if (result !== 'completed') {this.toast(result === 'cancelled' ? '视频未看完，可以稍后再试' : '视频暂不可用，请重开一局', false); return;}
            if (run.revive()) this.drawRun();
        } finally {this.starting = false;}
    }
    private pause(reason = '喘口气，等你回来') {
        if (!this.run || this.run.phase === 'result') return;
        this.run.paused = true; this.sound.pause();
        const m = this.openModal('pause', '奔跑已暂停');
        this.ui.text(m, 'pause-message', reason, 360, 531, 32, 580, 145);
        this.ui.button(m, 'button-resume', '继续奔跑', 360, 763, 417, 88, () => {this.run!.paused = false; this.closeModal(); this.sound.resume();}, true);
        this.ui.button(m, 'button-quit-run', '结束本局，返回大厅', 360, 914, 417, 68, () => this.home());
        this.ui.text(m, 'pause-note', '返回大厅不结算奖励\n已使用的开局体验卡不会返还', 360, 1041, 22, 580, 97, C.muted);
        // A paused run must be explicitly continued; closing the modal also resumes.
        const close = m.getChildByName('button-modal-close'); close?.destroy();
    }
    private hide() { this.sound.pause(); if (this.run && this.run.phase !== 'result') this.run.paused = true; this.store.persist(); }
    private show() { if (this.run && this.run.phase !== 'result') this.pause('离开屏幕后自动暂停，倒计时也已停止'); else this.sound.resume(); }
    private key(e: EventKeyboard) {
        if (!this.run || this.run.paused || this.modal || this.run.phase !== 'running') return;
        if (e.keyCode === KeyCode.ARROW_LEFT || e.keyCode === KeyCode.KEY_A) this.run.move(Math.max(-1, this.run.lane - 2));
        if (e.keyCode === KeyCode.ARROW_RIGHT || e.keyCode === KeyCode.KEY_D) this.run.move(Math.min(1, this.run.lane));
        if (e.keyCode === KeyCode.ESCAPE) this.pause();
    }
    update(dt: number) {
        if (!this.alive) return; dt = Math.min(dt, .1); this.time += dt;
        if (this.toastNode) {this.toastTime -= dt; if (this.toastTime <= 0) {this.toastNode.destroy(); this.toastNode = null;}}
        if (this.portrait?.isValid && this.page === 'home') this.portrait.setPosition(0, 640 - 682 + Math.sin(this.time * 1.6) * 6);
        if (this.page === 'expedition') {
            this.updateTrip(); const e = this.store.state.expedition;
            const button = this.frame.getChildByName('button-trip');
            if (e && this.now() >= e.end && button?.getChildByName('caption')?.getComponent(Label)?.string !== '打开远征包裹') this.expeditionPage();
        }
        if (this.friendTexture && this.friendSprite && (this.friendTimer += dt) > .15) {
            this.friendTimer = 0; try {this.friendTexture.uploadData(this.friendCanvas);} catch (_) {}
        }
        for (const particle of this.particles) {
            if (!particle.node.isValid) continue; particle.life -= dt; particle.vy -= 320 * dt;
            particle.node.setPosition(particle.node.position.x + particle.vx * dt, particle.node.position.y + particle.vy * dt);
            particle.node.angle += dt * 140; if (particle.life <= 0) particle.node.destroy();
        }
        if (!this.run || this.run.phase === 'result' && this.page === 'result') return;
        const run = this.run; run.step(dt);
        while (run.events.length) { const event = run.events.shift()!; this.toast(event.text, event.good); this.sound.play(event.kind === 'pickup' ? 'pickup' : event.good ? 'click' : 'hit'); this.platform.vibrate(event.good, this.store.state.vibration); }
        if (run.phase === 'result') {this.drawResult(); return;}
        if ((run.phase === 'intro' || run.phase === 'duel') && this.page !== 'duel') {this.drawDuel(); return;}
        if (this.page === 'run') {
            this.renderRows();
            for (let i = 0; i < this.roadLines.length; i++) this.roadLines[i].setPosition(0, 640 - (330 + (i * 120 + run.distance * 155) % 790));
            if (this.hero?.isValid) {const target = run.x * 179; this.hero.setPosition(this.hero.position.x + (target - this.hero.position.x) * Math.min(1, dt * 14), 640 - 1022 + (run.phase === 'running' && !run.paused && !run.stop ? Math.sin(this.time * 18) * 4 : 0)); this.hero.angle = run.phase === 'running' && !run.paused ? Math.sin(this.time * 10) * 2 : 0;}
            if (this.hero?.isValid) {
                const names = [...Array.from({length: run.ally}, (_, i) => 'ally-' + i), ...(run.thief ? ['thief'] : [])];
                for (const [key, buddy] of this.buddies) if (!names.includes(key)) {buddy.destroy(); this.buddies.delete(key);}
                names.forEach((name, i) => {
                    let buddy = this.buddies.get(name);
                    if (!buddy) {buddy = this.drawHero(this.frame, 360, 1022); buddy.name = name; buddy.setScale(.53, .53); this.buddies.set(name, buddy);
                        this.ui.text(buddy, 'buddy-caption', name === 'thief' ? '工贼' : '同事', 360, 533, 26, 134, 45, name === 'thief' ? C.red : C.teal);}
                    buddy.setPosition(clamp(this.hero!.position.x + (i % 2 ? 1 : -1) * (78 + Math.floor(i / 2) * 58), -220, 220), this.hero!.position.y - 28 + Math.sin(this.time * 17 + i) * 3);
                });
                if (!this.shield) {this.shield = this.ui.node(this.hero, 'fish-shield'); const g = this.shield.addComponent(Graphics); g.strokeColor = color(C.teal, 180); g.fillColor = color(C.teal, 18); g.lineWidth = 4; g.ellipse(17, 5, 90, 105); g.fill(); g.stroke();}
                this.shield.active = run.fish > 0;
            }
        }
        if (this.beam && run.phase === 'duel') {
            if (!run.paused && (this.fireTimer += dt) >= .65) {this.fireTimer = 0; this.sound.play('fire');}
            const g = this.beam; g.clear(); const progress = 1 - run.phaseTime / 8;
            const ratio = run.energy / Math.max(1, run.energy + run.level.bossEnergy); const meet = 790 - (ratio - .5) * 215 * progress;
            g.fillColor = color(C.teal, 220); g.rect(-11 + Math.sin(this.time * 33) * 2, -390, 22, 1030 - meet); g.fill();
            g.fillColor = color(C.red, 220); g.rect(-14, 640 - meet, 28, meet - 624); g.fill();
            g.fillColor = color(C.gold); g.circle(0, 640 - meet, 17 + Math.sin(this.time * 30) * 6); g.fill();
            if (this.countdown) this.countdown.string = '火力对拼  ' + Math.ceil(run.phaseTime) + 's';
            if (this.battleBoss?.isValid) this.battleBoss.angle = Math.sin(this.time * 28) * progress * 5;
        }
        this.lastHud += dt; if (this.lastHud > .1) {this.lastHud = 0; this.updateHud();}
    }
    destroy() {
        this.alive = false; this.epoch++; game.off(Game.EVENT_HIDE, this.hide, this); game.off(Game.EVENT_SHOW, this.show, this);
        input.off(Input.EventType.KEY_DOWN, this.key, this); this.store.persist(); this.sound.destroy(); this.closeModal(); this.toastNode?.destroy(); this.frame.destroy();
        if (DEBUG) delete (globalThis as any).__boss_test;
    }
}
