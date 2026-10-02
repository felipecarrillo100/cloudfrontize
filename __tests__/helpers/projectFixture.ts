import fs from 'fs';
import os from 'os';
import path from 'path';

/** Creates a throwaway project folder: files are written relative to it; `manifest` becomes cloudfrontize.json. */
export function makeProject(manifest: Record<string, any>, files: Record<string, string> = {}): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-project-'));
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    fs.writeFileSync(path.join(dir, 'cloudfrontize.json'), JSON.stringify(manifest, null, 2));
    return dir;
}

export const removeProject = (dir: string) => fs.rmSync(dir, { recursive: true, force: true });

/** A minimal valid manifest with one local origin at origins/www. */
export const baseManifest = (overrides: Record<string, any> = {}) => ({
    version: 1,
    name: 'fixture',
    origins: [{ id: 'web', type: 'local', path: 'origins/www' }],
    defaultBehavior: { origin: 'web' },
    ...overrides
});

export const WWW = { 'origins/www/index.html': 'origin-index' };
