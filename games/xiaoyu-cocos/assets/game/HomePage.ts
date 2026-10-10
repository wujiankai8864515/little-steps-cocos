import { Node } from 'cc';
import { GameAssets } from './Assets';
import { Scope } from './Engine';
import { nodeAt, picture } from './Visual';
import { XiaoyuRig } from './XiaoyuRig';

export class HomePage {
    readonly root: Node;
    readonly rig: XiaoyuRig;
    constructor(parent: Node, assets: GameAssets, scope: Scope, height: number) {
        this.root = nodeAt(parent, 'HomePage', 0, (height - 1280) / 2, 720, 1280);
        const scene = assets.scene('res://home/home_world.tscn');
        const resources = new Map(scene.sections.filter(s => s.kind === 'ext_resource').map(s => [s.id, s.path]));
        const layers: Array<{z: number; order: number; node: Node}> = [];
        scene.sections.filter(s => s.kind === 'node' && s.type === 'Sprite2D').forEach((section, order) => {
            // BedForeground is a mask-dependent receiver pass, not an opaque second background.
            // Its source material is integrated with shared lighting in M05.
            if (section.name === 'BedForeground' || section.properties.visible === false) return;
            const resource = resources.get(section.properties.texture.value) as string;
            const item = picture(this.root, assets, scope, resource, section.name, section.properties);
            layers.push({z: section.properties.z_index || 0, order, node: item.root});
        });
        this.rig = new XiaoyuRig(this.root, assets, scope);
        layers.push({z: 12, order: 1000, node: this.rig.root});
        layers.sort((a, b) => a.z - b.z || a.order - b.order).forEach((layer, index) => layer.node.setSiblingIndex(index));
        scope.own(() => { this.root.active = false; this.root.destroy(); });
        console.info('[LittleSteps] Home source composition ready', {status: 'candidate; lighting, props, interactions and acceptance pending'});
    }
    advance(delta: number) { this.rig.advance(delta); }
}
