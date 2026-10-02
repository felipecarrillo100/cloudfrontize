import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeFileAtomic } from './revision';

/** How many recent projects are remembered. */
export const MAX_RECENT = 20;

export interface RecentProject {
    dir: string;
    name: string;
    openedAt: string;
}

/** Where CloudFrontize keeps per-user state: `~/.cloudfrontize` (or `$CLOUDFRONTIZE_HOME`). */
export function configDir(): string {
    return process.env.CLOUDFRONTIZE_HOME || path.join(os.homedir(), '.cloudfrontize');
}

const recentFile = () => path.join(configDir(), 'recent.json');

function read(): RecentProject[] {
    try {
        const parsed = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
        return Array.isArray(parsed?.projects)
            ? parsed.projects.filter((p: any) => typeof p?.dir === 'string' && typeof p?.name === 'string')
            : [];
    } catch {
        return [];
    }
}

function write(projects: RecentProject[]): void {
    try {
        fs.mkdirSync(configDir(), { recursive: true });
        writeFileAtomic(recentFile(), JSON.stringify({ projects }, null, 2) + '\n');
    } catch { /* remembering recent projects is a convenience; never fail an open over it */ }
}

/** Recent projects, most recent first; `exists` is false for folders that were moved or deleted. */
export function listRecent(): (RecentProject & { exists: boolean })[] {
    return read().map(p => ({ ...p, exists: fs.existsSync(path.join(p.dir, 'cloudfrontize.json')) }));
}

/** Moves a project to the top of the recent list. */
export function recordRecent(project: { dir: string; name: string }): void {
    const others = read().filter(p => p.dir !== project.dir);
    write([{ dir: project.dir, name: project.name, openedAt: new Date().toISOString() }, ...others].slice(0, MAX_RECENT));
}

/** Removes a project from the recent list. Returns false when it wasn't there. */
export function forgetRecent(dir: string): boolean {
    const all = read();
    const kept = all.filter(p => p.dir !== dir);
    if (kept.length === all.length) return false;
    write(kept);
    return true;
}
