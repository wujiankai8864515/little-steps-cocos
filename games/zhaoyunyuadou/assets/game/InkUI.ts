import { Button, Color, Graphics, isValid, Label, Node, Sprite, UITransform, UIOpacity } from 'cc';
import { ArtStore } from './ArtStore';

export interface Element { node: Node; body: Node; definition: any; children: Element[]; }
export function inkColor(hex = '#ffffff') {
    const rgba=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(hex);
    return rgba?new Color(Number(rgba[1]),Number(rgba[2]),Number(rgba[3]),rgba[4]===undefined?255:Number(rgba[4])*255):Color.fromHEX(new Color(),hex);
}
/** Retains original top-left coordinates/pivots, mapped to Cocos UI nodes. */
export class InkUI {
    elements: Element[] = [];
    constructor(public root: Node, public art: ArtStore, public height: number) {}
    node(name: string, parent: Node, x: number, y: number, width: number, height: number) {
        const n = new Node(name); n.layer = parent.layer; parent.addChild(n);
        n.addComponent(UITransform).setContentSize(width,height); n.getComponent(UITransform)!.setAnchorPoint(0,1);
        n.setPosition(x,-y); return n;
    }
    image(parent: Node, path: string, x: number, y: number, w: number, h: number, grid?: string, name = path) {
        const n = this.node(name,parent,x,y,w,h), sprite = n.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
        if (grid) sprite.type = Sprite.Type.SLICED;
        this.skin(n,path,grid); return n;
    }
    skin(n: Node, path: string, grid?: string) {
        const sprite = n.getComponent(Sprite) || n.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
        (n as any).__inkSkin = path;
        const frame = this.art.frame(path,grid);
        if (frame) sprite.spriteFrame = frame;
        else if (this.art.art.frames[path]) this.art.ensure(path,grid).then(asset => {
            if (isValid(n,true) && (n as any).__inkSkin === path) sprite.spriteFrame = asset;
        }).catch(error => console.error('[ZYA] art load',path,error));
        else console.warn('[ZYA] missing art',path);
    }
    text(parent: Node, value: string, x: number, y: number, w: number, h: number, size = 30, color = '#ffffff', stroke = 0, align = 'center') {
        const n = this.node(value,parent,x,y,w,h), label = n.addComponent(Label);
        label.useSystemFont = true; label.fontFamily = 'Arial'; label.fontSize = size; label.lineHeight = size + 2;
        label.string = value; label.color = inkColor(color); label.enableWrapText = false; label.overflow = Label.Overflow.CLAMP;
        label.horizontalAlign = align === 'left' ? Label.HorizontalAlign.LEFT : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        if (stroke) { label.enableOutline = true; label.outlineColor = Color.BLACK; label.outlineWidth = stroke / 2; }
        return n;
    }
    rect(parent: Node, x: number, y: number, w: number, h: number, fill: string, border?: string, line = 1) {
        const n = this.node('rect',parent,x,y,w,h), g = n.addComponent(Graphics);
        g.fillColor = this.graphicsColor(fill,parent); g.rect(0,-h,w,h); g.fill();
        if (border) { g.strokeColor = this.graphicsColor(border,parent); g.lineWidth = line; g.stroke(); }
        return n;
    }
    // Creator 3.8's Graphics vertices store their own alpha, unlike sprites.
    private graphicsColor(value: string, parent: Node) {
        const color=inkColor(value);let opacity=1;
        for(let node:Node|null=parent;node;node=node.parent)opacity*= (node.getComponent(UIOpacity)?.opacity ?? 255)/255;
        color.a=Math.round(color.a*opacity);return color;
    }
    mount(definition: any, parent = this.root, parentWidth = 640, parentHeight = this.height): Element {
        const d = definition, w = d.width || 0, h = d.height || 0;
        const ax = d.anchorX || 0, ay = d.anchorY || 0;
        let x = d.x || 0, y = d.y || 0;
        if (d.centerX !== undefined) x = parentWidth / 2 + d.centerX - w * (0.5 - ax);
        else if (d.left !== undefined) x = d.left + ax * w;
        else if (d.right !== undefined) x = parentWidth - d.right - w * (1 - ax);
        if (d.centerY !== undefined) y = parentHeight / 2 + d.centerY - h * (0.5 - ay);
        else if (d.top !== undefined) y = d.top + ay * h;
        else if (d.bottom !== undefined) y = parentHeight - d.bottom - h * (1 - ay);
        const n = this.node(d.name || d.kind,parent,x,y,w,h);
        n.getComponent(UITransform)!.setAnchorPoint(ax,1-ay);
        n.setScale(d.scaleX === undefined ? 1 : d.scaleX,d.scaleY === undefined ? 1 : d.scaleY);
        n.angle = -(d.rotation || 0); n.active = d.visible !== false && !d.maskGeometry;
        if (d.alpha !== undefined) n.addComponent(UIOpacity).opacity = Math.round(d.alpha * 255);
        const body = this.node('$body',n,-w*ax,-h*ay,w,h);
        const element: Element = {node:n,body,definition:d,children:[]}; this.elements.push(element);
        if (d.skin && !d.skin.startsWith('res://')) {
            const s = body.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false;
            if (d.sizeGrid) s.type = Sprite.Type.SLICED;
            s.color = inkColor(d.color); this.skin(body,d.skin,d.sizeGrid);
            if (d.gray) s.grayscale = true;
        }
        if (d.text !== undefined || d.kind === 'ComboBox') {
            const textNode=body.getComponent(Sprite)?this.node('$label',body,0,0,w,h):body;
            const label = textNode.addComponent(Label); label.useSystemFont = true; label.fontFamily = d.font || 'Arial';
            label.string = d.text === undefined ? '简体中文' : d.text; label.fontSize = d.fontSize || (d.kind==='ComboBox'?30:24);
            label.lineHeight = label.fontSize + (d.leading || 2); label.color = inkColor(d.color || (d.kind==='ComboBox'?'#ffffff':'#000000')); label.isBold = !!d.bold;
            label.horizontalAlign = d.align === 'center'||d.kind==='ComboBox' ? Label.HorizontalAlign.CENTER : d.align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.LEFT;
            label.verticalAlign = d.valign === 'middle'||d.kind==='ComboBox' ? Label.VerticalAlign.CENTER : d.valign === 'bottom' ? Label.VerticalAlign.BOTTOM : Label.VerticalAlign.TOP;
            label.enableWrapText = !!d.wordWrap; label.overflow = Label.Overflow.CLAMP;
            if (d.stroke) { label.enableOutline = true; label.outlineColor = inkColor(d.strokeColor || '#000000'); label.outlineWidth = d.stroke / 2; }
        }
        if (d.bgColor) this.rect(body,0,0,w,h,d.bgColor);
        if (d._gcmds?.length) {
            const g = body.addComponent(Graphics);
            for (const cmd of d._gcmds) {
                if (!cmd.fillColor) continue;
                g.fillColor = this.graphicsColor(cmd.fillColor,body);
                if (cmd._$type === 'DrawRectCmd') { g.rect(cmd.x || 0,-(cmd.y || 0)-(cmd.height || h),cmd.width || w,cmd.height || h); g.fill(); }
                if (cmd._$type === 'DrawCircleCmd' || cmd._$type === 'DrawPieCmd') { g.circle(cmd.x || 0,-(cmd.y || 0),cmd.radius || 1); g.fill(); }
            }
        }
        for (const child of d.children || []) element.children.push(this.mount(child,body,w,h));
        return element;
    }
    scene(name: string, parent = this.root) {
        const d = JSON.parse(JSON.stringify(this.art.layouts[name]));
        // Only backgrounds stretch. The original 640×1386 content stays at its
        // authored size; individual pages supply their observed vertical offset.
        d.width = 640; d.height = this.height;
        d.x=0;d.y=0;d.anchorX=0;d.anchorY=0;delete d.centerX;delete d.centerY;
        for (const c of d.children || []) if (['bg','winBg','loseBg'].includes(c.name)) c.height = this.height;
        const scene=this.mount(d,parent,640,this.height),box=this.find('box',scene);
        if(box){const spec=box.definition,scale=Math.min(1,this.height/1386);box.node.setScale(scale,scale);box.node.setPosition(320-(spec.width||0)*scale*(.5-(spec.anchorX||0)),-(this.height/2-(spec.height||0)*scale*(.5-(spec.anchorY||0))));}
        return scene;
    }
    find(name: string, within?: Element): Element | undefined {
        const search = (element: Element): Element | undefined => element.definition.name === name ? element : element.children.map(search).find(Boolean);
        return within ? search(within) : this.elements.find(e => e.definition.name === name);
    }
    all(name: string, within: Element): Element[] {
        const result: Element[] = []; const visit = (e: Element) => {if(e.definition.name===name)result.push(e);for(const child of e.children)visit(child);};visit(within);return result;
    }
    setText(name: string, value: string, within?: Element) { const e = this.find(name,within); if (e) { const l = e.body.getComponent(Label)||e.body.getChildByName('$label')?.getComponent(Label); if(l)l.string=value; } }
    show(name: string, active: boolean, within?: Element) { const e = this.find(name,within); if(e)e.node.active=active; }
    button(element: Element | Node | undefined, callback: () => void) {
        if (!element) return;
        const node = element instanceof Node ? element : element.node;
        const b = node.getComponent(Button) || node.addComponent(Button); b.transition = Button.Transition.NONE;
        node.on(Button.EventType.CLICK, callback);
    }
    dispose() { this.elements=[]; this.root.destroyAllChildren(); }
}
