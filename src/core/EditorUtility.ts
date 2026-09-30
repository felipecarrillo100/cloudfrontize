import { spawn } from 'child_process';

/**
 * Utility for opening files in local user editors.
 *
 * @namespace Backend
 * This utility provides cross-platform support for launching the developer's
 * editor of choice. It prioritizes VS Code ('code') for a premium experience,
 * falling back to the system's default opener.
 */
export class EditorUtility {
    /**
     * Opens a file in the local editor.
     * @param filePath - Absolute path to the file.
     */
    public static open(filePath: string): void {
        const report = () => console.error(`\x1b[31m🛑 [EditorUtility] Could not open editor for: ${filePath}\x1b[0m`);

        // Security: spawn with an argument array (no shell), so the path can never be interpreted as a command.
        const run = (cmd: string, args: string[], onFail: () => void, ignoreExitCode = false) => {
            let failed = false;
            const fail = () => { if (!failed) { failed = true; onFail(); } };
            try {
                const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
                child.on('error', fail);
                child.on('exit', (code) => { if (code !== 0 && !ignoreExitCode) fail(); });
                child.unref();
            } catch {
                fail();
            }
        };

        if (process.platform === 'win32') {
            // `code` is a .cmd shim on Windows, which Node refuses to spawn without a shell.
            // explorer.exe opens the default app; it often exits non-zero even on success.
            run('explorer.exe', [filePath], report, true);
            return;
        }

        // Fidelity Plus Chain: Try 'code' (VS Code) first, fall back to the system opener
        const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
        run('code', [filePath], () => run(opener, [filePath], report));
    }
}
