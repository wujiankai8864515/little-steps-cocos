import {
    _decorator,
    AssetManager,
    assetManager,
    BlockInputEvents,
    Button,
    Color,
    Component,
    Graphics,
    HorizontalTextAlignment,
    JsonAsset,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    tween,
    UITransform,
    UIOpacity,
    VerticalTextAlignment,
} from 'cc';

import { PresentationComponent } from '../shared/PresentationComponent';
import type { AvgPage, AvgRole, RoleSide } from './AvgTypes';

const { ccclass } = _decorator;
@ccclass('AvgPresentation')
export class AvgPresentation extends PresentationComponent {
    protected readonly _sprites = new Map<string, SpriteFrame>();
    protected readonly _roleAssets: Partial<Record<RoleSide, string>> = {};
    protected _loadingShown = false;
    protected pageCount = 0;
    protected title = '霸总的假未婚妻';
    protected advance(): Promise<void> { throw new Error('AvgPlayer must supply advance'); }
    protected choose(_index: number): Promise<void> { throw new Error('AvgPlayer must supply choose'); }
    protected restart(): Promise<void> { throw new Error('AvgPlayer must supply restart'); }
    protected exit(): void { throw new Error('AvgPlayer must supply exit'); }
    protected showSettings(): void { throw new Error('AvgPlayer must supply showSettings'); }
    protected hideSettings(): void { throw new Error('AvgPlayer must supply hideSettings'); }
    protected createView(): void {
        this.node.addComponent(BlockInputEvents);

        // Figma 的 2064×2752 是背景尺寸；项目窗口是其中 1179×2556 的安全框。
        // 素材不缩放，只把安全框坐标换算到项目的 1181×2556 中心坐标。
        const background = this.createSpriteNode('background', 2064, 2752);
        background.setPosition(-0.5, 0);
        this.node.addChild(background);

        const shade = new Node('shade');
        shade.layer = this.node.layer;
        shade.addComponent(UITransform).setContentSize(1181, 2556);
        const shadeGraphics = shade.addComponent(Graphics);
        shadeGraphics.fillColor = new Color(0, 0, 0, 32);
        shadeGraphics.fillRect(-590.5, -1278, 1181, 2556);
        this.node.addChild(shade);

        this.node.addChild(this.createRoleNode('roleLeft', 'left'));
        this.node.addChild(this.createRoleNode('roleRight', 'right'));

        this.node.addChild(this.createTopControls());

        this.node.addChild(this.createDialoguePanel());

        const choices = new Node('choices');
        choices.layer = this.node.layer;
        choices.addComponent(UITransform).setContentSize(1000, 600);
        choices.setPosition(0, -380);
        choices.active = false;
        this.node.addChild(choices);

        this.node.addChild(this.createSettingsOverlay());
        this.node.addChild(this.createEndOverlay());
        this.node.addChild(this.createLoadingOverlay());
    }

    protected createRoleNode(name: string, _side: RoleSide): Node {
        const node = this.createSpriteNode(name, 1000, 2800);
        node.active = false;
        node.addComponent(UIOpacity);
        return node;
    }

    protected createTopControls(): Node {
        const controls = new Node('topControls');
        controls.layer = this.node.layer;
        controls.addComponent(UITransform).setContentSize(1181, 220);

        const home = this.createSpriteNode('home', 128, 132);
        home.setPosition(-467.5, 0);
        const homeIcon = this.createSpriteNode('homeIcon', 100, 100);
        homeIcon.setPosition(0, 11);
        home.addChild(homeIcon);
        const homeButton = home.addComponent(Button);
        homeButton.transition = Button.Transition.SCALE;
        homeButton.zoomScale = 0.94;
        home.on(Button.EventType.CLICK, () => this.exit(), this);
        controls.addChild(home);

        const titlePlate = new Node('titlePlate');
        titlePlate.layer = this.node.layer;
        titlePlate.addComponent(UITransform).setContentSize(416, 76);
        const titleBackground = titlePlate.addComponent(Graphics);
        titleBackground.fillColor = new Color(20, 18, 20, 175);
        titleBackground.roundRect(-208, -38, 416, 76, 38);
        titleBackground.fill();
        const title = this.createLabel('霸总的假未婚妻 · 01/28', 27, new Color(255, 255, 255, 255), 390, 68);
        title.name = 'pageProgress';
        titlePlate.addChild(title);
        controls.addChild(titlePlate);

        const settings = this.createSpriteNode('settings', 128, 132);
        settings.setPosition(467.5, 0);
        const settingsIcon = this.createSpriteNode('settingsIcon', 100, 100);
        settingsIcon.setPosition(0, 6);
        settings.addChild(settingsIcon);
        const settingsButton = settings.addComponent(Button);
        settingsButton.transition = Button.Transition.SCALE;
        settingsButton.zoomScale = 0.94;
        settings.on(Button.EventType.CLICK, () => this.showSettings(), this);
        controls.addChild(settings);

        controls.setPosition(0, 1014);
        return controls;
    }

    protected createDialoguePanel(): Node {
        const panel = new Node('dialoguePanel');
        panel.layer = this.node.layer;
        panel.addComponent(UITransform).setContentSize(1086, 415);
        const panelButton = panel.addComponent(Button);
        panelButton.transition = Button.Transition.SCALE;
        panelButton.zoomScale = 0.995;
        panel.on(Button.EventType.CLICK, () => void this.advance(), this);

        const wordBackground = this.createSpriteNode('wordBackground', 1086, 331);
        panel.addChild(wordBackground);

        const arrow = this.createSpriteNode('dialogueArrow', 112, 103);
        panel.addChild(arrow);

        const namePlate = this.createSpriteNode('namePlate', 351, 79);
        panel.addChild(namePlate);

        const speaker = this.createLabel('', 34, new Color(255, 255, 255, 255), 280, 70);
        speaker.name = 'speaker';
        namePlate.addChild(speaker);

        const text = this.createLabel('', 38, new Color(48, 25, 50, 255), 842, 210);
        text.name = 'dialogueText';
        const textLabel = text.getComponent(Label)!;
        textLabel.horizontalAlign = HorizontalTextAlignment.LEFT;
        textLabel.verticalAlign = VerticalTextAlignment.CENTER;
        panel.addChild(text);

        const hint = this.createLabel('点击继续  ›', 23, new Color(105, 62, 108, 230), 220, 55);
        hint.name = 'nextHint';
        panel.addChild(hint);

        panel.addComponent(UIOpacity);
        return panel;
    }

    protected createSettingsOverlay(): Node {
        const overlay = new Node('settingsOverlay');
        overlay.layer = this.node.layer;
        overlay.addComponent(UITransform).setContentSize(1181, 2556);
        overlay.addComponent(BlockInputEvents);
        const background = overlay.addComponent(Graphics);
        background.fillColor = new Color(12, 8, 20, 225);
        background.fillRect(-590.5, -1278, 1181, 2556);

        const title = this.createLabel('设置', 64, new Color(255, 255, 255, 255), 600, 120);
        title.setPosition(0, 330);
        overlay.addChild(title);

        const resume = this.createButton('resume', '继续阅读', 460, 112, new Color(166, 65, 170, 255), 36);
        resume.setPosition(0, 80);
        resume.on(Button.EventType.CLICK, () => this.hideSettings(), this);
        overlay.addChild(resume);

        const home = this.createButton('settingsHome', '返回主页', 460, 112, new Color(58, 49, 77, 255), 36);
        home.setPosition(0, -75);
        home.on(Button.EventType.CLICK, () => this.exit(), this);
        overlay.addChild(home);

        overlay.active = false;
        return overlay;
    }

    protected createEndOverlay(): Node {
        const overlay = new Node('endOverlay');
        overlay.layer = this.node.layer;
        overlay.addComponent(UITransform).setContentSize(1181, 2556);
        overlay.addComponent(BlockInputEvents);
        const background = overlay.addComponent(Graphics);
        background.fillColor = new Color(12, 8, 20, 225);
        background.fillRect(-590.5, -1278, 1181, 2556);

        const title = this.createLabel('第一章结束', 66, new Color(255, 245, 255, 255), 800, 120);
        title.setPosition(0, 250);
        overlay.addChild(title);

        const subtitle = this.createLabel('基利安的邀约，将把露娜带向怎样的命运？', 32, new Color(220, 199, 229, 255), 900, 160);
        subtitle.setPosition(0, 90);
        overlay.addChild(subtitle);

        const replay = this.createButton('replay', '重新阅读', 460, 112, new Color(166, 65, 170, 255), 36);
        replay.setPosition(0, -130);
        replay.on(Button.EventType.CLICK, () => void this.restart(), this);
        overlay.addChild(replay);

        const exit = this.createButton('exit', '返回目录', 460, 112, new Color(58, 49, 77, 255), 36);
        exit.setPosition(0, -285);
        exit.on(Button.EventType.CLICK, () => this.exit(), this);
        overlay.addChild(exit);

        overlay.active = false;
        return overlay;
    }

    protected createLoadingOverlay(): Node {
        const overlay = new Node('loadingOverlay');
        overlay.layer = this.node.layer;
        overlay.addComponent(UITransform).setContentSize(1181, 2556);
        overlay.addComponent(BlockInputEvents);
        const background = overlay.addComponent(Graphics);
        background.fillColor = new Color(12, 8, 20, 245);
        background.fillRect(-590.5, -1278, 1181, 2556);
        const label = this.createLabel('正在加载第一章…', 40, new Color(255, 255, 255, 255), 900, 180);
        label.name = 'loadingText';
        overlay.addChild(label);
        return overlay;
    }

    protected renderProgress(page: AvgPage): void {
        const progress = this.findNode('pageProgress')?.getComponent(Label) ?? null;
        if (progress) progress.string = `${this.title} · ${page.page}/${this.twoDigits(this.pageCount)}`;
        this.setSprite(this.findNode('home'), 'ui/img_btn_pink_bg01');
        this.setSprite(this.findNode('settings'), 'ui/img_btn_pink_bg01');
        this.setSprite(this.findNode('homeIcon'), 'ui/img_icon_pink_home');
        this.setSprite(this.findNode('settingsIcon'), 'ui/img_icon_pink_settings');
    }

    protected renderBackground(page: AvgPage): void {
        this.setSprite(this.findNode('background'), `backgrounds/${page.background}`);
    }

    protected async renderRoles(page: AvgPage): Promise<void> {
        await Promise.all([this.renderRoleSide('left', page.roles.find((role) => role.side === 'left') ?? null),
            this.renderRoleSide('right', page.roles.find((role) => role.side === 'right') ?? null)]);
    }

    protected async renderRoleSide(side: RoleSide, role: AvgRole | null): Promise<void> {
        const node = this.findNode(side === 'left' ? 'roleLeft' : 'roleRight');
        if (!node) return;

        if (!role) {
            node.active = false;
            node.name = side === 'left' ? 'roleLeft' : 'roleRight';
            return;
        }

        const previousAsset = this._roleAssets[side];
        this._roleAssets[side] = role.asset;
        node.name = side === 'left' ? 'roleLeft' : 'roleRight';
        node.active = true;
        const transform = node.getComponent(UITransform)!;
        transform.setContentSize(role.layout.width, role.layout.height);
        node.setPosition(role.layout.x, role.layout.y);
        this.setSprite(node, `roles/${role.asset}`);
        const opacity = node.getComponent(UIOpacity)!;
        if (previousAsset !== role.asset) {
            opacity.opacity = 0;
            try { await this.waitForVisual(done => { this.visualTween(opacity).to(0.24, { opacity: 255 }, { easing: 'quadOut' }).call(done).start(); }); }
            finally { if (opacity.isValid) opacity.opacity = 255; }
        } else {
            opacity.opacity = 255;
        }
    }

    protected renderDialogue(page: AvgPage): void {
        const panel = this.findNode('dialoguePanel');
        if (!panel) return;

        panel.active = true;
        this.setSprite(panel.getChildByName('wordBackground'), 'dialogue/img_plot_word_bg');
        const panelTransform = panel.getComponent(UITransform)!;
        panelTransform.setContentSize(page.dialogue.layout.width, page.dialogue.layout.height);
        panel.setPosition(page.dialogue.layout.x, page.dialogue.layout.y);

        const isNarration = page.dialogue.type === 'bp_text_bg02';
        const isChoice = page.dialogue.type === 'bp_choice';
        const isRight = page.dialogue.type === 'bp_text_bg03';
        const wordBackground = panel.getChildByName('wordBackground');
        const arrow = panel.getChildByName('dialogueArrow');
        const namePlate = panel.getChildByName('namePlate');
        const speaker = namePlate?.getChildByName('speaker')?.getComponent(Label) ?? null;
        const text = panel.getChildByName('dialogueText')?.getComponent(Label) ?? null;
        const hint = panel.getChildByName('nextHint') ?? null;

        if (wordBackground) {
            wordBackground.setPosition(0, isNarration ? 0 : -(page.dialogue.layout.height - 331) / 2);
        }
        if (arrow) {
            arrow.active = Boolean(page.dialogue.arrow);
            if (page.dialogue.arrow) {
                this.setSprite(arrow, 'dialogue/img_plot_arrow');
                arrow.setPosition(
                    page.dialogue.arrow.x - page.dialogue.layout.x,
                    page.dialogue.arrow.y - page.dialogue.layout.y,
                );
            }
        }

        if (namePlate) {
            namePlate.active = !isNarration && !isChoice && Boolean(page.dialogue.speaker);
            // Figma 中左角色的姓名牌在右，右角色的姓名牌在左。
            namePlate.setPosition(isRight ? -250.5 : 250.5, 82);
            this.setSprite(
                namePlate,
                isRight ? 'dialogue/img_plot_tag_pink_right' : 'dialogue/img_plot_tag_pink_left',
            );
        }
        if (speaker) speaker.string = page.dialogue.speaker ?? '';
        if (text) {
            text.string = page.dialogue.text;
            text.horizontalAlign = isNarration ? HorizontalTextAlignment.CENTER : HorizontalTextAlignment.LEFT;
            text.fontSize = page.dialogue.text.length > 42 ? 34 : 38;
            text.lineHeight = Math.round(text.fontSize * 1.35);
            text.node.setPosition(0, isNarration ? 0 : -53);
        }
        if (hint) {
            hint.active = !isChoice;
            hint.setPosition(405, isNarration ? -130 : -165);
        }
        const button = panel.getComponent(Button);
        if (button) button.interactable = !isChoice;
    }

    protected renderChoices(page: AvgPage): void {
        const container = this.findNode('choices');
        if (!container) return;

        const oldChoices = [...container.children];
        container.removeAllChildren();
        oldChoices.forEach(child => child.destroy());
        const hasChoices = page.dialogue.type === 'bp_choice' && page.choices.length > 0;
        container.active = hasChoices;
        if (!hasChoices) return;

        page.choices.forEach((choice, index) => {
            const buttonNode = this.createSpriteNode(`choice${index + 1}`, 967, 164);
            this.setSprite(buttonNode, 'dialogue/bp_choice');
            buttonNode.setPosition(0, 205 - index * 190);
            const button = buttonNode.addComponent(Button);
            button.transition = Button.Transition.SCALE;
            button.zoomScale = 0.97;
            buttonNode.on(Button.EventType.CLICK, () => void this.choose(index), this);

            const label = this.createLabel(choice, 31, new Color(255, 255, 255, 255), 850, 118);
            buttonNode.addChild(label);
            container.addChild(buttonNode);
        });
    }

    protected setLoading(active: boolean, message = ''): void {
        this._loadingShown = active;
        const overlay = this.findNode('loadingOverlay');
        if (!overlay) return;
        overlay.active = active;
        if (active) overlay.setSiblingIndex(this.node.children.length - 1);
        const label = overlay.getChildByName('loadingText')?.getComponent(Label) ?? null;
        if (label && message) label.string = message;
    }

    protected setInputBlocked(blocked: boolean): void {
        const loading = this.findNode('loadingOverlay');
        if (!loading || this._loadingShown) return;
        if (blocked) {
            loading.active = true;
            loading.getChildByName('loadingText')!.active = false;
            const graphics = loading.getComponent(Graphics)!;
            graphics.clear();
            graphics.fillColor = new Color(0, 0, 0, 1);
            graphics.fillRect(-590.5, -1278, 1181, 2556);
            loading.setSiblingIndex(this.node.children.length - 1);
        } else {
            loading.active = false;
            loading.getChildByName('loadingText')!.active = true;
            const graphics = loading.getComponent(Graphics)!;
            graphics.clear();
            graphics.fillColor = new Color(12, 8, 20, 245);
            graphics.fillRect(-590.5, -1278, 1181, 2556);
        }
    }

    protected createSpriteNode(name: string, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(width, height);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        return node;
    }

    protected setSprite(node: Node | null, path: string): void {
        const sprite = node?.getComponent(Sprite) ?? null;
        const spriteFrame = this._sprites.get(path) ?? null;
        if (sprite && spriteFrame && sprite.spriteFrame !== spriteFrame) sprite.spriteFrame = spriteFrame;
    }

    protected createButton(name: string, text: string, width: number, height: number, color: Color, fontSize: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(width, height);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.roundRect(-width / 2, -height / 2, width, height, Math.min(28, height / 2));
        graphics.fill();
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.97;
        node.addChild(this.createLabel(text, fontSize, new Color(255, 255, 255, 255), width - 24, height - 10));
        return node;
    }

    protected createLabel(text: string, fontSize: number, color: Color, width: number, height: number): Node {
        const node = new Node('label');
        node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.3);
        label.color = color;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = true;
        return node;
    }

    protected findNode(name: string): Node | null {
        const visit = (node: Node): Node | null => {
            if (node.name === name) return node;
            for (const child of node.children) {
                const found = visit(child);
                if (found) return found;
            }
            return null;
        };
        return visit(this.node);
    }

    protected twoDigits(value: number): string {
        return value < 10 ? `0${value}` : String(value);
    }
}
