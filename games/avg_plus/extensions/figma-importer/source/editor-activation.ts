import { execFile } from 'child_process';

type ExecFileRunner = (
    file: string,
    args: string[],
    options: { timeout: number; windowsHide: boolean },
    callback: (error: Error | null) => void,
) => void;

const defaultRunner: ExecFileRunner = (file, args, options, callback) => {
    execFile(file, args, options, (error) => callback(error));
};

/** Bring the editor application forward after an external Figma push on macOS. */
export function activateCocosEditorApplication(
    platform: NodeJS.Platform = process.platform,
    runner: ExecFileRunner = defaultRunner,
): Promise<boolean> {
    if (platform !== 'darwin') return Promise.resolve(true);
    return new Promise((resolve) => {
        runner(
            '/usr/bin/open',
            ['-b', 'com.cocos.creator'],
            { timeout: 3000, windowsHide: true },
            (error) => resolve(!error),
        );
    });
}
