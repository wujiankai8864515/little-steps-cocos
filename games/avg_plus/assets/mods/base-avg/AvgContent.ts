import type { AvgPage, AvgRole, AvgDialogue, AvgLayout } from './AvgTypes';

export function parsePage(value: unknown): AvgPage {
        if (!isRecord(value)) throw new Error('剧情页面不是对象。');
        if (typeof value.page !== 'string' || typeof value.chapter !== 'string') {
            throw new Error('剧情页面缺少 chapter/page。');
        }
        if (typeof value.background !== 'string' || !Array.isArray(value.roles)) {
            throw new Error(`页面 ${value.page} 缺少背景或角色列表。`);
        }
        if (!isRecord(value.dialogue) || typeof value.dialogue.type !== 'string' || typeof value.dialogue.text !== 'string') {
            throw new Error(`页面 ${value.page} 对话格式错误。`);
        }

        const roles = value.roles.map((rawRole) => {
            if (!isRecord(rawRole) || typeof rawRole.asset !== 'string' || (rawRole.side !== 'left' && rawRole.side !== 'right')) {
                throw new Error(`页面 ${value.page} 角色格式错误。`);
            }
            return {
                asset: rawRole.asset,
                side: rawRole.side,
                layout: parseLayout(rawRole.layout, `页面 ${value.page} 角色`),
            } as AvgRole;
        });
        if (!Array.isArray(value.choices) || value.choices.some(item => typeof item !== 'string')) throw new Error('选项必须为文字数组');
        const choices = value.choices as string[];
        const allowedTypes = ['bp_text_bg01', 'bp_text_bg02', 'bp_text_bg03', 'bp_choice'];
        if (allowedTypes.indexOf(value.dialogue.type) < 0) throw new Error(`页面 ${value.page} 对话类型未知。`);

        return {
            chapter: value.chapter,
            page: value.page,
            background: value.background,
            roles,
            dialogue: {
                type: value.dialogue.type as AvgDialogue['type'],
                ...(typeof value.dialogue.speaker === 'string' ? { speaker: value.dialogue.speaker } : {}),
                text: value.dialogue.text,
                layout: parseLayout(value.dialogue.layout, `页面 ${value.page} 对话框`),
                arrow: value.dialogue.arrow === null
                    ? null
                    : parseLayout(value.dialogue.arrow, `页面 ${value.page} 对话箭头`),
            },
            choices,
        };
    }

export function parseLayout(value: unknown, label: string): AvgLayout {
        if (!isRecord(value)) throw new Error(`${label}缺少项目坐标。`);
        const keys: readonly (keyof AvgLayout)[] = ['x', 'y', 'width', 'height'];
        keys.forEach((key) => {
            if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
                throw new Error(`${label}的 ${key} 无效。`);
            }
        });
        if ((value.width as number) <= 0 || (value.height as number) <= 0) throw new Error('布局尺寸必须大于零');
        return {
            x: value.x as number,
            y: value.y as number,
            width: value.width as number,
            height: value.height as number,
        };
    }

export function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
