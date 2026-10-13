export type RoleSide = 'left' | 'right';

export interface AvgLayout {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface AvgRole {
    readonly asset: string;
    readonly side: RoleSide;
    readonly layout: AvgLayout;
}

export interface AvgDialogue {
    readonly type: 'bp_text_bg01' | 'bp_text_bg02' | 'bp_text_bg03' | 'bp_choice';
    readonly speaker?: string;
    readonly text: string;
    readonly layout: AvgLayout;
    readonly arrow: AvgLayout | null;
}

export interface AvgPage {
    readonly chapter: string;
    readonly page: string;
    readonly background: string;
    readonly roles: readonly AvgRole[];
    readonly dialogue: AvgDialogue;
    readonly choices: readonly string[];
}

