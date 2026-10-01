import fs from 'fs';
import path from 'path';
import { ProjectExistsError } from './errors';
import { checkManifest, MANIFEST_FILE } from './loadProject';
import { ManifestError } from './errors';
import { formatManifest } from './revision';

export const SCHEMA_URL = 'https://raw.githubusercontent.com/felipecarrillo100/cloudfrontize/main/schema/cloudfrontize.schema.json';

export interface NewProjectOptions {
    /** The project folder (created if missing; it must be empty otherwise). */
    dir: string;
    name: string;
    /** The origin (default: a local folder at origins/www with a starter page). */
    origin?: Record<string, unknown>;
}

// Files that don't make a folder "not empty" (OS metadata, a fresh git repository)
const IGNORABLE = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.git']);

const welcomePage = (name: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`)}</title>
</head>
<body>
    <h1>It works</h1>
    <p>This page is served by the project's local origin (<code>origins/www</code>), through CloudFrontize.</p>
</body>
</html>
`;

/**
 * Creates a minimal, valid project: a manifest with one origin and a default behavior, the local
 * origin's folder with a starter page, and a .gitignore for the env file (it holds AWS variables).
 * @throws {ProjectExistsError} when the folder already has content.
 * @throws {ManifestError} when the options make an invalid manifest (nothing is left behind).
 */
export function createProject(options: NewProjectOptions): { dir: string; manifestPath: string } {
    const dir = path.resolve(options.dir);
    const existed = fs.existsSync(dir);
    if (existed) {
        if (!fs.statSync(dir).isDirectory()) throw new ProjectExistsError(dir, 'is a file');
        const content = fs.readdirSync(dir).filter(f => !IGNORABLE.has(f));
        if (content.length) throw new ProjectExistsError(dir, fs.existsSync(path.join(dir, MANIFEST_FILE)) ? 'is already a project' : 'isn\'t empty');
    }

    const origin = { id: 'website', type: 'local', path: 'origins/www', ...(options.origin ?? {}) } as Record<string, any>;
    if (origin.type !== 'local') delete origin.path;
    const manifest = {
        $schema: SCHEMA_URL,
        version: 1,
        name: options.name,
        origins: [origin],
        defaultBehavior: { origin: origin.id, functions: {} }
    };

    const created: string[] = [];
    try {
        fs.mkdirSync(dir, { recursive: true });
        if (origin.type === 'local') {
            const www = path.resolve(dir, String(origin.path));
            fs.mkdirSync(www, { recursive: true });
            fs.writeFileSync(path.join(www, 'index.html'), welcomePage(options.name), { flag: 'wx' });
            created.push(path.join(www, 'index.html'));
        }
        const { manifest: valid, diagnostics } = checkManifest(manifest, dir);
        if (!valid || diagnostics.some(d => d.severity === 'error')) throw new ManifestError(path.join(dir, MANIFEST_FILE), diagnostics);

        fs.writeFileSync(path.join(dir, '.gitignore'), 'config/.env\n.env\n', { flag: 'wx' });
        created.push(path.join(dir, '.gitignore'));
        const manifestPath = path.join(dir, MANIFEST_FILE);
        fs.writeFileSync(manifestPath, formatManifest(manifest), { flag: 'wx' });
        return { dir, manifestPath };
    } catch (err) {
        if (!existed) fs.rmSync(dir, { recursive: true, force: true });
        else for (const file of created) fs.rmSync(file, { force: true });
        throw err;
    }
}
