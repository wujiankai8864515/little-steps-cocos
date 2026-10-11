import { Color, EffectAsset, Material, Node, Vec4 } from 'cc';
import { box } from './Viewport';
import { GameAssets } from './Assets';
import { core, Scope, sharedUI } from './Engine';
import { label, nodeAt, picture } from './Visual';

export class LoginPage {
    readonly root: Node;
    onEnter = () => {};
    onCancel = () => {};
    active = false;
    private action: any;
    private back: any;
    private status: ReturnType<typeof label>;
    private stage = 0;
    private elapsed = 0;
    private greetingTime = 0;
    private accepted = false;
    private title: ReturnType<typeof picture>;
    private subtitle: ReturnType<typeof picture>;
    private fish: ReturnType<typeof picture>;
    private fin: ReturnType<typeof picture>;
    private accents: ReturnType<typeof picture>;
    private peekMaterials: Material[] = [];
    constructor(parent: Node, assets: GameAssets, scope: Scope, effect: EffectAsset, height: number) {
        this.root = nodeAt(parent, 'LoginPage', 0, 0, 720, height);
        picture(this.root, assets, scope, 'res://entry/assets/backgrounds/login_clean_bleed_720x1600.png', 'BleedBackground', {position: [0, (height - 1600) / 2], centered: false});
        const composition = nodeAt(this.root, 'Composition', 0, (height - 1280) / 2, 720, 1280);
        const scene = assets.scene('res://entry/login_page.tscn');
        const resources = new Map(scene.sections.filter(s => s.kind === 'ext_resource').map(s => [s.id, s.path]));
        const art: Record<string, ReturnType<typeof picture>> = {};
        for (const section of scene.sections.filter(s => s.kind === 'node' && s.type === 'Sprite2D')) {
            const resource = resources.get(section.properties.texture.value) as string;
            art[section.name] = picture(composition, assets, scope, resource, section.name, section.properties);
        }
        this.title = art.TitleArt; this.subtitle = art.SubtitleArt;
        this.fish = art.OriginalPeekingFish; this.fin = art.GreetingFin; this.accents = art.GreetingAccents;
        for (const item of [this.fish, this.fin]) {
            const material = new Material(); material.initialize({effectAsset: effect, defines: {USE_TEXTURE: true}});
            item.sprite.customMaterial = material; this.peekMaterials.push(material);
            scope.own(() => material.destroy());
        }
        label(this.root, assets, 'FooterCopy', '隐私说明  ·  用户协议', [185, height - 86], [350, 36], 22, [0.63, 0.46, 0.33]);
        this.action=sharedUI().action(this.root,()=>this.enter(),()=>this.active&&!this.accepted);
        this.status=label(this.root,assets,'EntryStatus','',[80,height-143],[560,34],22,[.4,.27,.14]);
        this.back=sharedUI().hangingReturn(this.root,assets.font('res://assets/bootstrap_ui.ttf'),[12,12,72,118],()=>this.onCancel(),()=>this.active&&this.accepted);
        this.back.root.active=false;
        scope.own(() => { this.action.dispose();this.back.dispose();this.root.active = false; this.root.destroy(); });
        this.title.root.active = true; this.title.root.setPosition(0, -20);
        this.setAlpha(this.title, 0); this.setAlpha(this.subtitle, 0);
        this.peek(0);
        console.info('[LittleSteps] login title stage');
    }
    resize(height:number,_physicalWidth?:number){box(this.root,0,0,720,height);this.root.getChildByName('BleedBackground').setPosition(0,-(height-1600)/2);this.root.getChildByName('Composition').setPosition(0,-(height-1280)/2);this.root.getChildByName('FooterCopy').setPosition(185,-height+86);this.status.node.setPosition(80,-height+143);this.action.cancel();this.back.cancel();}
    private setAlpha(item: ReturnType<typeof picture>, value: number) { item.sprite.color = new Color(255, 255, 255, value * 255); }
    private peek(amount: number) {
        const offset = 96 * (1 - core.Math2D.clamp(amount, 0, 1));
        [this.fish, this.fin].forEach((item, i) => {
            item.root.setPosition(offset, 0);
            this.peekMaterials[i].setProperty('peekState', new Vec4(offset, 361, item.spec.content[0], item.spec.content[2]));
        });
    }
    private next(stage: number) { this.stage = stage; this.elapsed = 0; }
    get ready() { return this.stage === 4; }
    setStatus(text: string) {this.status.string=text;}
    resetIntent(text='') {this.accepted=false;this.back.root.active=false;this.setStatus(text);this.action.cancel();}
    pause() {this.active=false;this.action.cancel();this.back.cancel();}
    resume() {this.active=true;}
    advance(delta: number) {
        if (!this.active) return;
        this.back.advance(delta);
        const step = Math.min(Math.max(delta, 0), 0.1); this.elapsed += step;
        const smooth = core.Math2D.smoothstep, clamp = core.Math2D.clamp;
        if (this.stage === 0) {
            const p = clamp(this.elapsed / 1.15, 0, 1), amount = 1 - Math.pow(1 - p, 3);
            this.setAlpha(this.title, smooth(0, 0.78, p)); this.title.root.setPosition(0, -20 * (1 - amount));
            if (p >= 1) { this.next(1); this.subtitle.root.active = true; this.subtitle.root.setPosition(0, -12); }
        } else if (this.stage === 1) {
            const p = clamp(this.elapsed / 0.85, 0, 1), amount = smooth(0, 1, p);
            this.setAlpha(this.subtitle, amount); this.subtitle.root.setPosition(0, -12 * (1 - amount));
            if (p >= 1) this.next(2);
        } else if (this.stage === 2) {
            if (this.elapsed >= 0.35) { this.next(3); this.fish.root.active = true; this.fin.root.active = true; this.peek(0); }
        } else if (this.stage === 3) {
            const p = clamp(this.elapsed / 0.75, 0, 1); this.peek(smooth(0, 1, p));
            if (p >= 1) { this.next(4); this.accents.root.active = true; console.info('[LittleSteps] login greeting ready'); }
        } else {
            this.greetingTime = (this.greetingTime + step) % 5.6;
            const t = this.greetingTime, breath = Math.sin(t * Math.PI * 2 / 5.6) * 1.25;
            const wave = t < 1.45 ? Math.sin(t * Math.PI * 2 / 0.58) * Math.sin(Math.PI * t / 1.45) * 0.16 : 0;
            this.fish.root.setPosition(0, -breath);
            const c = Math.cos(wave), s = Math.sin(wave);
            this.fin.root.angle = -wave * 180 / Math.PI;
            this.fin.root.setPosition(314 - c * 314 + s * 818, -(818 + breath - s * 314 - c * 818));
        }
    }
    private enter() {
        if (this.accepted || !this.root.active) return;
        this.accepted = true;this.back.root.active=true;this.setStatus('正在准备开场…'); this.onEnter();
    }
}
