import { exec } from 'child_process';

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
        // Determine platform-specific open command
        const cmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
        
        // Fidelity Plus Chain: Try 'code' (VS Code) first, fall back to default
        // Escaping spaces and quotes for shell execution
        const escapedPath = `"${filePath}"`;
        
        exec(`code ${escapedPath} || ${cmd} ${escapedPath}`, (err) => {
            if (err) {
                console.error(`\x1b[31m🛑 [EditorUtility] Could not open editor for: ${filePath}\x1b[0m`);
            }
        });
    }
}
