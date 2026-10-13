import { _decorator, Component, Node, Sprite, UIOpacity, Tween, tween } from 'cc';
import { Cancelled } from '../../foundation/Tasks';
const { ccclass } = _decorator;
/** Lifetime management shared by the existing hand-authored animations. */
@ccclass('PresentationComponent')
export class PresentationComponent extends Component {
    private visualGeneration = 0;
    /** Capture before awaiting; a stopped/previous presentation cannot touch the next scene. */
    protected visualCheckpoint(): () => void {
        const generation = this.visualGeneration;
        const check = () => { if (generation !== this.visualGeneration || !this.node.isValid) throw new Cancelled('表现已失效'); };
        check(); return check;
    }
    private readonly visualTweens = new Set<Tween<any>>();
    private readonly visualWaits = new Set<() => void>();
    /** Restore only presentation properties; authoritative state is redrawn by afterRender. */
    protected preserveVisualTransforms(): () => void {
        const restore: (() => void)[] = [];
        const visit = (node: Node) => {
            const position = node.position.clone(), scale = node.scale.clone(), angle = node.angle;
            const opacity = node.getComponent(UIOpacity), alpha = opacity?.opacity;
            const sprite = node.getComponent(Sprite), color = sprite?.color.clone();
            restore.push(() => {
                if (!node.isValid) return;
                node.setPosition(position); node.setScale(scale); node.angle = angle;
                if (opacity?.isValid) opacity.opacity = alpha!;
                if (sprite?.isValid && color) sprite.color = color;
            });
            node.children.forEach(visit);
        };
        visit(this.node); return () => restore.forEach(fn => fn());
    }
    protected visualTween<T extends object>(target: T): Tween<T> {
        const value = tween(target);
        this.visualTweens.add(value);
        return value;
    }
    protected waitForVisual(start: (done: () => void) => void): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const before = new Set(this.visualTweens);
            let owned: Tween<any>[] = [];
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                this.visualWaits.delete(finish);
                owned.forEach(item => { item.stop(); this.visualTweens.delete(item); });
                resolve();
            };
            const timer = setTimeout(finish, 6000);
            this.visualWaits.add(finish);
            try {
                start(finish);
                owned = Array.from(this.visualTweens).filter(item => !before.has(item));
                if (finished) owned.forEach(item => { item.stop(); this.visualTweens.delete(item); });
            } catch (error) {
                owned = Array.from(this.visualTweens).filter(item => !before.has(item));
                clearTimeout(timer);
                this.visualWaits.delete(finish);
                owned.forEach(item => { item.stop(); this.visualTweens.delete(item); });
                reject(error);
            }
        });
    }
    public cancelVisuals(): void {
        this.visualGeneration++;
        for (const finish of Array.from(this.visualWaits)) finish();
        for (const item of this.visualTweens) item.stop();
        this.visualTweens.clear();
    }
    protected onDestroy(): void { this.cancelVisuals(); }
}
