import { Color, Label, Node, Sprite } from 'cc';
import { GameAssets } from './Assets';
import { meshSprite, Scope } from './Engine';
import { HomeLighting } from './HomeLighting';
import { TravelAtlasSprite } from './TravelAtlasSprite';
import { DIARY_INK, DIARY_PALE_INK, diaryEndRing, diaryPencil, diaryRouteDrawing, diaryStartDot } from './TravelDiaryDrawing';
import { REWARD_REGIONS, TRAVEL_FONT, TRAVEL_REWARDS } from './TravelHomeRules';
import { label, nodeAt } from './Visual';

// Native travel_open_diary_art.gd. This is artwork on the actual open book;
// event text belongs to the journal page. No extra image or independent animation.
export class TravelDiaryArtwork {
    readonly root: Node;
    constructor(book: TravelAtlasSprite, assets: GameAssets, scope: Scope, lighting: HomeLighting) {
        this.root = nodeAt(book.root, 'OpenDiaryArtwork', -290, -201, 580, 402);
        const text = (name: string, word: string, at: number[], angle: number, size: number) => {
            const pivot = nodeAt(this.root, name, at[0], at[1]); pivot.angle = -angle * 180 / Math.PI;
            // One-line Creator Label baseline is 1.37*fontSize in a 2*fontSize box.
            const ink = label(pivot, assets, 'Ink', word, [0, -size * 1.37], [230, size * 2], size, DIARY_INK, TRAVEL_FONT);
            ink.horizontalAlign = Label.HorizontalAlign.LEFT; ink.enableWrapText = false;
            lighting.ink(ink);
        };
        const sticker = (name: string, index: number, at: number[], angle: number, size: number[], tint: number[]) => {
            const pivot = nodeAt(this.root, name, at[0], at[1]); pivot.angle = -angle * 180 / Math.PI;
            const art = new TravelAtlasSprite(pivot, assets, scope, TRAVEL_REWARDS, REWARD_REGIONS[index], 'OriginalAtlas');
            art.place([0, 0, size[0], size[1]]);
            art.sprite.color = new Color(tint[0] * 255, tint[1] * 255, tint[2] * 255, tint[3] * 255);
            lighting.ink(art.sprite);
        };
        const stroke = (name: string, mesh: any, color: number[]) => {
            const n = nodeAt(this.root, name), sprite: any = n.addComponent(meshSprite());
            sprite.configure(mesh, [1, 1]); sprite.spriteFrame = assets.frame('res://assets/home_neutral.png', scope); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            lighting.ink(sprite, color, true);
        };
        text('LeftTitle', '旅行小记', [73, 79], .035, 27);
        sticker('Postcard', 2, [69, 109], -.065, [174, 167], [.92, .84, .72, .90]);
        stroke('LeftPencil1', diaryPencil([75, 304], 163), [...DIARY_PALE_INK.slice(0, 3), .90]);
        stroke('LeftPencil2', diaryPencil([76, 322], 139), [...DIARY_PALE_INK.slice(0, 3), .66]);
        text('RightTitle', '路上的小事', [334, 87], -.025, 22);
        sticker('Leaf', 0, [370, 126], .16, [119, 91], [.91, .79, .60, .85]);
        text('RightCaption', '把今天收好', [340, 251], -.025, 21);
        stroke('RightPencil1', diaryPencil([341, 275], 145), [...DIARY_PALE_INK.slice(0, 3), .70]);
        stroke('RightPencil2', diaryPencil([342, 292], 123), [...DIARY_PALE_INK.slice(0, 3), .48]);
        stroke('Route', diaryRouteDrawing(), DIARY_PALE_INK);
        stroke('StartDot', diaryStartDot(), DIARY_INK);
        stroke('EndRing', diaryEndRing(), DIARY_INK);
    }
}
