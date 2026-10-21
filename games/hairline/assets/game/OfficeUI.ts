import { Node, UITransform, Graphics, Color, Label, LabelOutline, Sprite, SpriteFrame, TTFFont, HorizontalTextAlignment, VerticalTextAlignment, UIOpacity } from 'cc';
export const INK = '#263735', PAPER = '#f3ebd9', GOLD = '#edbd50', RED = '#a53b2f', GREEN = '#4f7b70';
export class OfficeUI {
    constructor(public root: Node, public frames: Record<string, SpriteFrame>, public font: TTFFont, public brush: TTFFont) { }
    node(parent: Node, x: number, y: number, w = 1, h = 1, name = 'office') { const n = new Node(name); n.layer = this.root.layer; parent.addChild(n); n.setPosition(x, -y); const t = n.addComponent(UITransform); t.setContentSize(w, h); t.setAnchorPoint(0, 1); return n; }
    rect(parent: Node, x: number, y: number, w: number, h: number, fill: string, stroke = INK, radius = 8, width = 3) { const n = this.node(parent, x, y, w, h); const g = n.addComponent(Graphics); g.fillColor = new Color().fromHEX(fill); g.strokeColor = new Color().fromHEX(stroke); g.lineWidth = width; g.roundRect(0, -h, w, h, radius); g.fill(); if (width)
        g.stroke(); return n; }
    text(parent: Node, text: string, x: number, y: number, w: number, h: number, size = 28, color = INK, brush = false, align = HorizontalTextAlignment.CENTER) { const n = this.node(parent, x, y, w, h, 'text:' + text.slice(0, 12)); const l = n.addComponent(Label); l.font = brush ? this.brush : this.font; l.string = text; l.fontSize = size; l.lineHeight = size * 1.22; l.color = new Color().fromHEX(color); l.horizontalAlign = align; l.verticalAlign = VerticalTextAlignment.CENTER; l.overflow = Label.Overflow.SHRINK; l.enableWrapText = true; n.getComponent(UITransform)!.setContentSize(w, h); return l; }
    image(parent: Node, key: string, x: number, y: number, w: number, h: number) { const n = this.node(parent, x, y, w, h, key), s = n.addComponent(Sprite); s.spriteFrame = this.frames[key]; s.sizeMode = Sprite.SizeMode.CUSTOM; n.getComponent(UITransform)!.setContentSize(w, h); return n; }
    outline(l: Label, color = PAPER, width = 2) { const o = l.node.addComponent(LabelOutline); o.color = new Color().fromHEX(color); o.width = width; }
    opacity(n: Node, value: number) { (n.getComponent(UIOpacity) || n.addComponent(UIOpacity)).opacity = value; }
    head(parent: Node, x: number, y: number, hair: number, size = 65, boss = false) {
        const n = this.node(parent, x, y, size, size), g = n.addComponent(Graphics), s = size / 64;
        g.fillColor = new Color().fromHEX('#f4dfb2');
        g.strokeColor = new Color().fromHEX(INK);
        g.lineWidth = 3 * s;
        g.circle(32 * s, -31 * s, 23 * s);
        g.fill();
        g.stroke();
        g.lineWidth = 3 * s;
        for (let i = 0; i < hair; i++) {
            const xx = (24 + i * 8) * s;
            g.moveTo(xx, -9 * s);
            g.quadraticCurveTo(xx - 8 * s, 5 * s, xx - 2 * s, 11 * s);
            g.stroke();
        }
        if (boss) {
            g.fillColor = new Color().fromHEX('#222c2d');
            g.rect(12 * s, -30 * s, 40 * s, 12 * s);
            g.fill();
        }
        else {
            g.fillColor = new Color().fromHEX(INK);
            g.circle(25 * s, -28 * s, 2 * s);
            g.circle(40 * s, -28 * s, 2 * s);
            g.fill();
        }
        g.moveTo(25 * s, -43 * s);
        g.quadraticCurveTo(32 * s, (hair === 3 ? -48 : -37) * s, 40 * s, -43 * s);
        g.stroke();
        return n;
    }
}
