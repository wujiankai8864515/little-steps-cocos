import { Color, Graphics, Label, Mask, Node, UITransform, view } from 'cc';
import { GameAssets } from './Assets';
import { core, Scope, sharedUI } from './Engine';
import { Stroke2D } from './Stroke2D';
import { label, nodeAt } from './Visual';

const FONT = 'res://assets/bootstrap_ui.ttf';
const rgb = (hex: string) => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
// Original travel_home_bridge.LoadingPaper. All nodes are created dynamically;
// only the resident Home font, texture and drawing shader are used here.
export class TravelLoadingPanel {
    readonly root: Node;
    private caption: Label;
    private clip: Node;
    private cancel: Node;
    private retry: Node;
    private buttons: Array<{ node: Node; drawing: Stroke2D }> = [];
    private bindings: any[] = [];
    private age = 0;
    private failed = false;
    private scale = 0;
    private fullWidth = 0;
    private dotWidths: number[] = [];
    private shownDots = -1;
    private readonly width = 430;
    onCancel = () => {};
    onRetry = () => {};
    constructor(parent: Node, private assets: GameAssets, scope: Scope, height: number, private enabled: () => boolean) {
        const w = this.width;
        this.root = nodeAt(parent, 'TravelLoadingPaper', (720 - w) / 2, height * .42 - (height - 1280) / 2, w, 172);
        const paper = nodeAt(this.root, 'Paper').addComponent(Graphics);
        const contour: number[][] = core.paperBubbleContour([0, 0, w, 158], [w * .7, 172], false);
        const polygon = (points: number[][], color: number[]) => {
            paper.moveTo(points[0][0], -points[0][1]);
            points.slice(1).forEach(p => paper.lineTo(p[0], -p[1])); paper.close();
            paper.fillColor = new Color(color[0] * 255, color[1] * 255, color[2] * 255, (color[3] ?? 1) * 255); paper.fill();
        };
        polygon(contour.map(p => [p[0], p[1] + 4]), [.23, .12, .055, .12]);
        polygon(contour, rgb('fff3dc'));
        new Stroke2D(this.root, assets, scope, 'PaperEdge').draw(core.featherPolyline([...contour, contour[0]], 1.5), [...rgb('ac7e49'), .58]);
        new Stroke2D(this.root, assets, scope, 'ProgressTrack').line([40, 85], [w - 40, 85], 4, [...rgb('dfc59b'), 1]);
        // Native departure loading has no byte progress callback; zero fill.
        this.clip = nodeAt(this.root, 'CaptionReveal', 28, 20, w - 56, 54);
        this.clip.addComponent(Mask); // default GRAPHICS_RECT
        this.caption = label(this.clip, assets, 'Caption', '', [0, 0], [w - 56, 54], 24, rgb('603b22'));
        this.caption.enableWrapText = false;
        const button = (name: string, text: string, callback: () => void) => {
            const n = nodeAt(this.root, name, 0, 105, (w - 72) / 2, 44);
            const drawing = new Stroke2D(n, assets, scope, name + 'Style'); this.buttons.push({ node: n, drawing });
            const textLabel = label(n, assets, name + 'Text', text, [0, 0], [(w - 72) / 2, 44], 21, rgb('714823'));
            textLabel.enableWrapText = false; this.alignFont(textLabel, 0, 0, 21);
            this.bindings.push(sharedUI().action(n, callback, () => this.visible && this.enabled()));
            return n;
        };
        this.cancel = button('CancelLoading', '先回小屋', () => this.onCancel());
        this.retry = button('RetryLoading', '再试一次', () => this.onRetry());
        this.bindings.push(sharedUI().pointer(this.root, {down: () => true}, () => this.visible && this.enabled()));
        this.root.active = false;
        scope.own(() => { this.hide(); this.bindings.forEach(b => b.dispose()); this.root.destroy(); });
    }
    resize(height:number){this.bindings.forEach(b=>b.cancel());this.root.setPosition((720-this.width)/2,-(height*.42-(height-1280)/2));}
    get visible() { return this.root.active; }
    private alignFont(text: Label, x: number, y: number, size: number) {
        const m = this.assets.catalog.assets[FONT].fontMetrics;
        text.fontSize = size; text.lineHeight = size * m.height;
        text.node.setPosition(x, -(y + (m.ascent - m.descent - .74) * size / 2));
    }
    private setCaption(message: string, animate: boolean) {
        const text = this.caption, bounds = text.node.getComponent(UITransform), w = this.width - 56;
        text.overflow = Label.Overflow.NONE;
        let size = 24;
        for (;;) {
            this.alignFont(text, 0, 0, size); text.string = message; text.updateRenderData(true);
            if (bounds.width <= w || size <= 14) break;
            size--;
        }
        this.fullWidth = bounds.width;
        this.dotWidths = [];
        if (animate) {
            for (let dots = 1; dots <= 3; dots++) {
                text.string = message.slice(0, -3) + '.'.repeat(dots); text.updateRenderData(true);
                this.dotWidths.push(bounds.width);
            }
        }
        text.string = message; text.overflow = Label.Overflow.CLAMP; bounds.setContentSize(w, 54); text.updateRenderData(true);
        this.clip.getComponent(UITransform).setContentSize(w, 54); this.shownDots = -1;
    }
    show(message='行装加载中...') {
        this.bindings.forEach(b => b.cancel()); this.age = 0; this.failed = false;
        this.root.active = true; this.root.setSiblingIndex(this.root.parent.children.length - 1);
        this.cancel.setPosition((this.width - (this.width - 72) / 2) / 2, -105); this.retry.active = false;
        this.setCaption(message, true); this.advance(0);
    }
    failure(message='行装加载失败，再试一次？') {
        this.failed = true; this.root.active = true;
        this.cancel.setPosition(30, -105); this.retry.setPosition(this.width * .5 + 6, -105); this.retry.active = true;
        this.setCaption(message, false); this.advance(0);
    }
    hide() { this.bindings.forEach(b => b.cancel()); this.root.active = false; }
    advance(delta: number) {
        if (!this.visible) return;
        if (Number.isFinite(delta)) this.age += Math.max(0, delta);
        if (!this.failed) {
            const dots = 1 + Math.floor(this.age / .52) % 3;
            if (dots !== this.shownDots) {
                this.shownDots = dots;
                // Shape and center the complete caption once. Reveal from its
                // fixed left edge instead of recentering changing dot strings.
                this.clip.getComponent(UITransform).setContentSize((this.width - 56 - this.fullWidth) / 2 + this.dotWidths[dots - 1], 54);
            }
        }
        const scale = Math.min(view.getScaleX(), view.getScaleY());
        if (scale !== this.scale) {
            this.scale = scale;
            this.buttons.forEach(({drawing}) => drawing.draw(core.roundedStyleBox([0, 0, (this.width - 72) / 2, 44], {
                radius: 16, borderWidth: 1, fill: [...rgb('f5e3bd'), 1], border: [...rgb('c4a174'), 1], aaSize: 1 / Math.max(.001, scale),
            }), [1, 1, 1, 1]));
        }
    }
    snapshot() { return {visible: this.visible, failed: this.failed, age: this.age, dots: this.shownDots, caption: this.caption.string, fontSize: this.caption.fontSize, progress: 0}; }
}
