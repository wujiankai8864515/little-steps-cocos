// @ftoc-generated FigmaComponentState v1
import { _decorator, CCString, Component } from 'cc';

const { ccclass, property } = _decorator;

/** Runtime identity and variant data for a Figma component instance. */
@ccclass('FigmaComponentState')
export class FigmaComponentState extends Component {
    static readonly ftocRuntimeRevision = 1;

    @property
    componentKey = '';

    @property
    componentName = '';

    @property
    variantFilter = '';

    @property({ type: [CCString] })
    propertyKeys: string[] = [];

    @property({ type: [CCString] })
    propertyValues: string[] = [];

    getProperty(key: string, fallback = ''): string {
        const index = this.propertyKeys.indexOf(key);
        return index >= 0 && index < this.propertyValues.length
            ? this.propertyValues[index]
            : fallback;
    }
}
