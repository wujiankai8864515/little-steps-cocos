const EXTENSION_NAME = 'figma-importer';
const CURRENT_JSON_PATH_KEY = 'workspace.currentJsonPath';

export function normalizeCurrentJsonPath(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export async function readCurrentJsonPath(): Promise<string> {
    try {
        return normalizeCurrentJsonPath(
            await Editor.Profile.getProject(EXTENSION_NAME, CURRENT_JSON_PATH_KEY),
        );
    } catch {
        return '';
    }
}

export async function writeCurrentJsonPath(filePath: unknown): Promise<string> {
    const normalized = normalizeCurrentJsonPath(filePath);
    try {
        if (normalized) {
            await Editor.Profile.setProject(EXTENSION_NAME, CURRENT_JSON_PATH_KEY, normalized);
        } else {
            await Editor.Profile.removeProject(EXTENSION_NAME, CURRENT_JSON_PATH_KEY);
        }
    } catch {
        // The active panel still keeps its in-memory path if the profile is unavailable.
    }
    return normalized;
}

export interface ClearCurrentJsonPathResult {
    cleared: boolean;
    currentPath: string;
}

/**
 * Serialize main-process workspace-path mutations. A clear only removes the
 * path it observed in the panel, so it cannot erase a newer Figma push.
 */
export class CurrentJsonPathCoordinator {
    private mutationQueue: Promise<void> = Promise.resolve();

    constructor(
        private readonly readPath: () => Promise<string> = readCurrentJsonPath,
        private readonly writePath: (filePath: unknown) => Promise<string> = writeCurrentJsonPath,
    ) {}

    private enqueue<T>(mutation: () => Promise<T>): Promise<T> {
        const result = this.mutationQueue.then(mutation, mutation);
        this.mutationQueue = result.then(() => undefined, () => undefined);
        return result;
    }

    write(filePath: unknown): Promise<string> {
        return this.enqueue(() => this.writePath(filePath));
    }

    clearIfCurrent(expectedPath: unknown): Promise<ClearCurrentJsonPathResult> {
        const expected = normalizeCurrentJsonPath(expectedPath);
        return this.enqueue(async () => {
            const currentPath = normalizeCurrentJsonPath(await this.readPath());
            if (expected && currentPath !== expected) {
                return { cleared: false, currentPath };
            }
            await this.writePath('');
            return { cleared: true, currentPath: '' };
        });
    }
}
