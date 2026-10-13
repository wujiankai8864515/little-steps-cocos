import type { CommittedContext, Mod, PresentationTask } from '../../foundation/Contracts';
import type { AvgPage } from './AvgTypes';
import { manifest } from './ModManifest';
export interface AvgState { pageIndex: number; finished: boolean; variables: Record<string, number | boolean | string>; }
export function createAvgMod(pages: readonly AvgPage[], render?: (ctx: CommittedContext) => readonly PresentationTask[], afterRender?: (ctx: CommittedContext) => void): Mod {
    if (!pages.length) throw new Error('章节不能为空');
    const ids = new Set<string>();
    pages.forEach(page => { const id = `${page.chapter}/${page.page}`; if (ids.has(id)) throw new Error(`剧情页面重复：${id}`); ids.add(id); });
    return {
        manifest, initialState: { pageIndex: 0, finished: false, variables: {} },
        actions: ['avg.open','avg.next','avg.choose','avg.restart','avg.exit'],
        validate(states) {
            const state = states[manifest.id] as AvgState;
            if (!state || !Number.isInteger(state.pageIndex) || state.pageIndex < 0 || state.pageIndex >= pages.length || typeof state.finished !== 'boolean' || !state.variables || Array.isArray(state.variables)) throw new Error('AVG 状态无效');
            for (const value of Object.values(state.variables)) if (!['number','boolean','string'].includes(typeof value)) throw new Error('剧情变量必须为数值/布尔/文字');
        },
        execute(ctx) {
            const state = ctx.draft[manifest.id] as AvgState;
            const page = pages[state.pageIndex];
            if (ctx.action.type === 'avg.exit') { ctx.result = { kind: 'exit' }; return; }
            if (ctx.action.type === 'avg.open') { ctx.result = { kind: 'open' }; return; }
            if (ctx.action.type === 'avg.restart') { ctx.clearHistory(); state.pageIndex = 0; state.finished = false; state.variables = {}; ctx.result = { kind: 'restart' }; return; }
            if (state.finished) ctx.reject('本章已结束');
            if (ctx.action.type === 'avg.next' && page.choices.length) ctx.reject('请先选择一个选项');
            if (ctx.action.type === 'avg.choose') {
                const index = ctx.action.payload?.index;
                if (!Number.isInteger(index) || index < 0 || index >= page.choices.length) ctx.reject('选项无效');
            }
            const from = `${page.chapter}/${page.page}`;
            if (state.pageIndex === pages.length - 1) state.finished = true;
            else state.pageIndex++;
            ctx.result = { kind: state.finished ? 'end' : 'page', from, choice: ctx.action.type === 'avg.choose' ? ctx.action.payload.index : null };
        },
        render, afterRender,
    };
}
