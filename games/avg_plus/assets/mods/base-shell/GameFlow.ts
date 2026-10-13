export interface GameFlow {
    readonly schemaVersion: 1;
    readonly afterWin: Readonly<Record<string, string>>;
}

/** The handoff is content configuration; card geometry and AVG pages keep their own schemas. */
export function parseGameFlow(value: unknown): GameFlow {
    if (!value || typeof value !== 'object') throw new Error('游戏流程配置无效');
    const raw = value as { schemaVersion?: unknown; afterWin?: unknown };
    if (raw.schemaVersion !== 1 || !raw.afterWin || typeof raw.afterWin !== 'object' || Array.isArray(raw.afterWin)) {
        throw new Error('游戏流程 schema 或衔接表无效');
    }
    const afterWin: Record<string, string> = {};
    for (const [levelId, chapterId] of Object.entries(raw.afterWin)) {
        if (!/^level_difficulty\d+_\d{2}$/.test(levelId) ||
            typeof chapterId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(chapterId)) {
            throw new Error('关卡到剧情的衔接配置无效');
        }
        afterWin[levelId] = chapterId;
    }
    return Object.freeze({ schemaVersion: 1, afterWin: Object.freeze(afterWin) });
}
