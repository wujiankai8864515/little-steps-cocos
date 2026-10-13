import type { Mod } from '../../../foundation/Contracts';
import type { AvgPage } from '../../base-avg/AvgTypes';
import type { AvgState } from '../../base-avg/AvgMod';
import { manifest } from './ModManifest';
export function createStoryBranch(config: { routes: Record<string, string> }, pages: readonly AvgPage[]): Mod {
    if (!config.routes || typeof config.routes !== 'object' || Array.isArray(config.routes)) throw new Error('分支配置 routes 必须为对象');
    for (const [key, destination] of Object.entries(config.routes)) {
        const [chapter, page, choice] = key.split('/');
        const source = pages.find(p => p.chapter === chapter && p.page === page);
        if (!source || !/^\d+$/.test(choice ?? '') || Number(choice) >= source.choices.length || !pages.some(p => `${p.chapter}/${p.page}` === destination)) throw new Error(`分支路由无效：${key}`);
    }
    return {
        manifest, initialState: { choices: 0 },
        validate(states) { if (!Number.isSafeInteger(states[manifest.id]?.choices) || states[manifest.id].choices < 0) throw new Error('分支 Mod 状态无效'); },
        beforeCommit(ctx) {
            if (ctx.action.type === 'avg.restart') { ctx.draft[manifest.id].choices = 0; return; }
            if (ctx.action.type !== 'avg.choose') return;
            const destination = config.routes[`${ctx.result.from}/${ctx.result.choice}`];
            if (!destination) return;
            const state = ctx.draft['base-avg'] as AvgState;
            state.pageIndex = pages.findIndex(p => `${p.chapter}/${p.page}` === destination);
            state.finished = false; state.variables.lastChoice = ctx.result.choice;
            ctx.result.kind = 'page'; ctx.draft[manifest.id].choices++;
        },
    };
}
