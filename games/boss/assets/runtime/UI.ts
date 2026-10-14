import {assetManager, AssetManager, Color, Graphics, Label, Node, Sprite, SpriteFrame, Texture2D, UITransform, UIOpacity, Font, Layers} from 'cc';

export const C = {ink: '#12203a', night: '#06152f', paper: '#fff1c9', gold: '#ffd16c', muted: '#93a9c6', teal: '#67d6c5', red: '#f68d8d', blue: '#aecbfa'};
export const color = (hex: string, alpha = 255) => { const c = new Color(); Color.fromHEX(c, hex); c.a = alpha; return c; };
export class Art {
    private bundles = new Map<string, Promise<AssetManager.Bundle>>();
    private textures = new Map<string, Promise<Texture2D>>();
    bundle(name: string) {
        if (!this.bundles.has(name)) {
            const promise = new Promise<AssetManager.Bundle>((resolve, reject) => assetManager.loadBundle(name, (error, bundle) => error ? reject(error) : resolve(bundle)));
            this.bundles.set(name, promise); promise.catch(() => this.bundles.delete(name));
        }
        return this.bundles.get(name)!;
    }
    texture(bundle: string, path: string) {
        const key = bundle + '/' + path;
        if (!this.textures.has(key)) {
            const promise = this.bundle(bundle).then(b => new Promise<Texture2D>((resolve, reject) =>
                b.load(path + '/texture', Texture2D, (error, asset) => error ? reject(error) : resolve(asset))));
            this.textures.set(key, promise); promise.catch(() => this.textures.delete(key));
        }
        return this.textures.get(key)!;
    }
}
export class UI {
    font: Font | null = null;
    constructor(readonly art: Art, private onTouch: () => void) {}
    node(parent: Node, name: string, x = 360, y = 640, width = 720, height = 1280) {
        const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n);
        n.setPosition(x - 360, 640 - y); n.addComponent(UITransform).setContentSize(width, height); return n;
    }
    text(parent: Node, name: string, value: string, x: number, y: number, size = 26, width = 600, height = 70, fill = C.paper) {
        const node = this.node(parent, name, x, y, width, height); const l = node.addComponent(Label);
        l.string = value; l.fontSize = size; l.lineHeight = size * 1.42; l.color = color(fill);
        l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.SHRINK; l.enableWrapText = true;
        // The supplied font is a subset. Use it for numeric gate labels only;
        // Chinese UI uses the device font so newly authored words stay legible.
        if (this.font && value && /^[0-9×÷+−.:/ a-zA-Z]+$/.test(value)) { l.font = this.font; l.useSystemFont = false; }
        else { l.useSystemFont = true; l.isBold = true; }
        return l;
    }
    panel(parent: Node, name: string, x: number, y: number, w: number, h: number, fill = C.night, border = C.gold, radius = 14, alpha = 255) {
        const node = this.node(parent, name, x, y, w, h); const g = node.addComponent(Graphics);
        g.fillColor = color(fill, alpha); g.strokeColor = color(border); g.lineWidth = 3;
        g.roundRect(-w / 2, -h / 2, w, h, radius); g.fill(); g.stroke(); return node;
    }
    button(parent: Node, name: string, title: string, x: number, y: number, w: number, h: number, action: () => void, primary = false, enabled = true) {
        const node = this.panel(parent, name, x, y, w, h, primary ? C.gold : C.night, enabled ? C.gold : '#52617a', 12);
        this.text(node, 'caption', title, 360, 640, h >= 70 ? 28 : 22, w - 18, h - 8, primary ? C.ink : enabled ? C.paper : C.muted);
        let sx = 0, sy = 0;
        node.on(Node.EventType.TOUCH_START, (e: any) => { e.propagationStopped = true; sx = e.getUILocation().x; sy = e.getUILocation().y; if (enabled) node.setScale(.97, .97); });
        node.on(Node.EventType.TOUCH_CANCEL, () => node.setScale(1, 1));
        node.on(Node.EventType.TOUCH_END, (e: any) => {
            e.propagationStopped = true; node.setScale(1, 1);
            const p = e.getUILocation(); if (!enabled || Math.hypot(p.x - sx, p.y - sy) > 50) return;
            this.onTouch(); action();
        });
        return node;
    }
    async image(parent: Node, name: string, bundle: string, path: string, x: number, y: number, w: number, h: number, fit = true) {
        const node = this.node(parent, name, x, y, w, h);
        const texture = await this.art.texture(bundle, path);
        if (!node.isValid || !parent.isValid) return null;
        const frame = new SpriteFrame(); frame.texture = texture;
        const sprite = node.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        if (fit) { const scale = Math.min(w / texture.width, h / texture.height); node.getComponent(UITransform)!.setContentSize(texture.width * scale, texture.height * scale); }
        return node;
    }
    bar(parent: Node, name: string, x: number, y: number, w: number, h: number, fill = C.teal) {
        const bg = this.panel(parent, name, x, y, w, h, '#182e50', '#466084', 4);
        const n = new Node('fill'); n.layer = Layers.Enum.UI_2D; bg.addChild(n); n.setPosition(-w / 2 + 3, 0);
        n.addComponent(UITransform).setContentSize(w - 6, h - 6);
        const g = n.addComponent(Graphics); g.fillColor = color(fill); g.roundRect(0, -(h - 6) / 2, w - 6, h - 6, 2); g.fill();
        return n;
    }
    fade(node: Node, opacity: number) { const o = node.getComponent(UIOpacity) || node.addComponent(UIOpacity); o.opacity = opacity; }
}
