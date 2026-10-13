import type { Mod } from '../../../foundation/Contracts';
import type { CardState } from '../../base-card/CardMod';
import { manifest } from './ModManifest';
export function createRewardVariant(config: { multiplier: number }): Mod {
    if (!Number.isInteger(config.multiplier) || config.multiplier < 1 || config.multiplier > 100) throw new Error('奖励倍率必须为 1–100 的整数');
    return {
        manifest, initialState: { rewardedActions: 0 },
        validate(states) { const n = states[manifest.id]?.rewardedActions; if (!Number.isSafeInteger(n) || n < 0) throw new Error('奖励 Mod 状态无效'); },
        beforeCommit(ctx) {
            if (ctx.action.type === 'card.restart') { ctx.draft[manifest.id].rewardedActions = 0; return; }
            if (ctx.action.type !== 'card.play' || !ctx.result?.rewardCoins) return;
            const card = ctx.draft['base-card'] as CardState;
            const extra = ctx.result.rewardCoins * (config.multiplier - 1);
            card.session = { ...card.session, coins: card.session.coins + extra };
            ctx.result.rewardCoins += extra;
            ctx.draft[manifest.id].rewardedActions++;
        },
    };
}
