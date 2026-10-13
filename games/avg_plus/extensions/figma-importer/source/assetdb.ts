/**
 * AssetDB calls have no built-in deadline. One stalled request can otherwise
 * leave an import waiting forever and keep adding work to Creator's queue.
 */

export interface AssetDbSession {
    id: number;
    label: string;
    failure: AssetDbUnavailableError | null;
}

export interface AssetDbRequestOptions {
    timeoutMs?: number;
}

const QUERY_TIMEOUT_MS = 8_000;
const MUTATION_TIMEOUT_MS = 30_000;
const CIRCUIT_COOLDOWN_MS = 60_000;
const MUTATION_METHODS = new Set([
    'create-asset',
    'import-asset',
    'reimport-asset',
    'save-asset-meta',
]);

let nextSessionId = 1;
let activeSession: AssetDbSession | null = null;
let extensionFailure: { failure: AssetDbUnavailableError; retryAt: number } | null = null;
let halfOpenProbeInFlight = false;

export class AssetDbUnavailableError extends Error {
    readonly code: 'FTOC_ASSET_DB_TIMEOUT' | 'FTOC_ASSET_DB_CIRCUIT_OPEN';
    readonly method: string;
    readonly target: string;
    readonly timeoutMs: number;

    constructor(
        code: 'FTOC_ASSET_DB_TIMEOUT' | 'FTOC_ASSET_DB_CIRCUIT_OPEN',
        method: string,
        target: string,
        timeoutMs: number,
        message: string,
    ) {
        super(message);
        this.name = 'AssetDbUnavailableError';
        this.code = code;
        this.method = method;
        this.target = target;
        this.timeoutMs = timeoutMs;
    }
}

export function beginAssetDbSession(label: string): AssetDbSession {
    if (activeSession) {
        const error: any = new Error(
            `[figma-importer] 已有导入正在进行（${activeSession.label}），已拒绝并发导入。`,
        );
        error.code = 'FTOC_ASSET_DB_IMPORT_BUSY';
        throw error;
    }
    const session: AssetDbSession = {
        id: nextSessionId++,
        label: label || 'import',
        failure: null,
    };
    activeSession = session;
    return session;
}

export function endAssetDbSession(session: AssetDbSession): void {
    if (activeSession && activeSession.id === session.id) activeSession = null;
}

export function isAssetDbUnavailableError(error: unknown): error is AssetDbUnavailableError {
    const code = error && typeof error === 'object' ? (error as any).code : '';
    return code === 'FTOC_ASSET_DB_TIMEOUT' || code === 'FTOC_ASSET_DB_CIRCUIT_OPEN';
}

export function rethrowIfAssetDbUnavailable(error: unknown): void {
    if (isAssetDbUnavailableError(error)) throw error;
}

function defaultTimeoutMs(method: string): number {
    return MUTATION_METHODS.has(method) ? MUTATION_TIMEOUT_MS : QUERY_TIMEOUT_MS;
}

function circuitOpenError(
    failure: AssetDbUnavailableError,
    method: string,
    target: string,
    timeoutMs: number,
    detail: string,
): AssetDbUnavailableError {
    return new AssetDbUnavailableError(
        'FTOC_ASSET_DB_CIRCUIT_OPEN',
        method,
        target,
        timeoutMs,
        `[figma-importer] AssetDB 熔断：${detail}；原始超时为 ` +
            `${failure.method} (${failure.target})，不再发送 ${method} (${target})。`,
    );
}

/**
 * Request AssetDB with a deadline. `target` is kept separate from request args
 * so timeout diagnostics always identify the exact db:// URL or UUID involved.
 */
export async function requestAssetDb<T = any>(
    method: string,
    target: string,
    args: any[] = [],
    options: AssetDbRequestOptions = {},
): Promise<T> {
    const timeoutMs = Math.max(1, Number(options.timeoutMs) || defaultTimeoutMs(method));
    const session = activeSession;
    if (session && session.failure) {
        throw circuitOpenError(
            session.failure,
            method,
            target,
            timeoutMs,
            `本次 ${session.label} 已失败`,
        );
    }

    let isHalfOpenProbe = false;
    if (extensionFailure) {
        const remainingMs = extensionFailure.retryAt - Date.now();
        if (remainingMs > 0 || halfOpenProbeInFlight) {
            const detail = remainingMs > 0
                ? `宿主冷却中，${Math.ceil(remainingMs / 1000)}s 后才允许单次探测`
                : '已有恢复探测正在进行';
            throw circuitOpenError(extensionFailure.failure, method, target, timeoutMs, detail);
        }
        halfOpenProbeInFlight = true;
        isHalfOpenProbe = true;
    }

    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            const failure = new AssetDbUnavailableError(
                'FTOC_ASSET_DB_TIMEOUT',
                method,
                target,
                timeoutMs,
                `[figma-importer] AssetDB 超时，${session ? '已终止本次导入' : '本次操作已停止'}：` +
                    `method=${method}, target=${target || '(unknown)'}, deadline=${timeoutMs}ms`,
            );
            if (session && !session.failure) session.failure = failure;
            extensionFailure = { failure, retryAt: Date.now() + CIRCUIT_COOLDOWN_MS };
            halfOpenProbeInFlight = false;
            console.error(failure.message);
            reject(failure);
        }, timeoutMs);
    });

    try {
        const request = Promise.resolve().then(
            () => Editor.Message.request('asset-db', method as any, ...args) as Promise<T>,
        );
        const result = await Promise.race([request, timeout]);
        if (isHalfOpenProbe) {
            extensionFailure = null;
            halfOpenProbeInFlight = false;
        }
        return result;
    } catch (error) {
        if (isHalfOpenProbe && !isAssetDbUnavailableError(error)) {
            // A normal AssetDB rejection still proves the message queue answered.
            extensionFailure = null;
            halfOpenProbeInFlight = false;
        }
        throw error;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
