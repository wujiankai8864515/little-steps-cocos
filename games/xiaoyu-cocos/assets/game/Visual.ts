import { Color, Label, Node, Sprite, UITransform } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';

export function nodeAt(parent: Node, name: string, x = 0, y = 0, width = 1, height = 1) {
    const node = new Node(name); parent.addChild(node); node.setPosition(x, -y);
    const ui = node.addComponent(UITransform); ui.setAnchorPoint(0, 1); ui.setContentSize(width, height);
    return node;
}
export function picture(parent: Node, assets: GameAssets, scope: Scope, resource: string, name: string, properties: any = {}) {
    const spec = assets.art(resource), size = spec.size, content = spec.content;
    const pos = properties.position || [0, 0], scale = properties.scale || [1, 1];
    const root = nodeAt(parent, name, pos[0], pos[1], size[0], size[1]);
    root.setScale(scale[0], scale[1], 1); root.angle = -(properties.rotation || 0) * 180 / Math.PI;
    const centered = properties.centered === undefined ? true : properties.centered;
    const child = nodeAt(root, 'ApprovedPixels', content[0] - (centered ? size[0] / 2 : 0), content[1] - (centered ? size[1] / 2 : 0), content[2], content[3]);
    const sprite = child.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = assets.frame(resource, scope);
    if (properties.modulate) { const c = properties.modulate; sprite.color = new Color(c[0] * 255, c[1] * 255, c[2] * 255, c[3] * 255); }
    root.active = properties.visible !== false;
    return {root, child, sprite, spec};
}
export function label(parent: Node, assets: GameAssets, name: string, text: string, position: number[], size: number[], fontSize: number, color: number[], font = 'res://assets/bootstrap_ui.ttf') {
    const node = nodeAt(parent, name, position[0], position[1], size[0], size[1]);
    const component = node.addComponent(Label); component.font = assets.font(font); component.string = text;
    component.fontSize = fontSize; component.lineHeight = fontSize * 1.2;
    component.horizontalAlign = Label.HorizontalAlign.CENTER; component.verticalAlign = Label.VerticalAlign.CENTER;
    component.color = new Color(color[0] * 255, color[1] * 255, color[2] * 255, 255);
    return component;
}
