import type { Mod } from '../../../foundation/Contracts';
import { EffectPlayer } from '../../shared/EffectPlayer';
import type { ExtensionHost } from '../../Registry';
import { manifest } from './ModManifest';
export function createCinematicStyle(domain: 'card' | 'avg', host: ExtensionHost): Mod {
    const player = new EffectPlayer(host.root, host.find, host.afterInsert);
    return {
        manifest: { ...manifest, requires: [`base-${domain}`] }, initialState: {},
        load: () => player.load(domain),
        validate: () => {},
        render(ctx) {
            let events: string[] = [];
            if (domain === 'card') {
                const kind = ctx.result?.kind;
                if (kind === 'open') events = ['card.open'];
                if (['play','draw','addBackup','rollback','wild.prepare','wild.cancel'].includes(kind)) events = [`card.${kind}`];
                if (ctx.result?.rewardCoins) events.push('card.reward');
                if (ctx.result?.complete) events.push('card.complete');
            } else {
                if (ctx.action.type === 'avg.exit') return;
                events = ctx.state['base-avg'].finished ? ['avg.chapter.end'] : ['avg.page.enter'];
                if (ctx.result?.kind === 'page') events.push('avg.page.turn');
                if (ctx.action.type === 'avg.choose') events.push('avg.choice');
            }
            return events.map(event => ({ id: `${manifest.id}:${event}`, timeoutMs: 15000, run: async scope => {
                const release = scope.own(() => player.clear());
                try { await player.play(event, host.context()); } finally { release(); }
            } }));
        },
        dispose: () => player.dispose(),
    };
}
