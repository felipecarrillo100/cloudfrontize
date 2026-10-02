import chokidar from 'chokidar';
import fs from 'fs';
import { readRevisioned } from '../project/revision';

export interface ProjectWatcherEvents {
    /** The manifest's content changed (to `revision`). */
    onManifest(revision: string): void;
    /** The viewer headers file changed. */
    onViewerHeaders(): void;
}

/**
 * Watches a project's own files (the manifest and the viewer headers file). Function, key value
 * store and env files are watched by the runners, which rebuild just what changed.
 */
export class ProjectWatcher {
    private watcher: chokidar.FSWatcher | null = null;
    private timer: NodeJS.Timeout | null = null;

    constructor(private manifestPath: string, private headersFile: string | undefined, private events: ProjectWatcherEvents) {}

    /** Resolves once watching: later changes are guaranteed to be reported. */
    start(): Promise<void> {
        const targets = [this.manifestPath, this.headersFile].filter((f): f is string => !!f && fs.existsSync(f));
        if (targets.length === 0) return Promise.resolve();
        const watcher = chokidar.watch(targets, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 10 } });
        this.watcher = watcher;
        watcher.on('all', (_event, file) => {
            if (file === this.headersFile) { this.events.onViewerHeaders(); return; }
            // Editors often save in several steps; report the manifest once it has settled
            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.timer = null;
                try {
                    this.events.onManifest(readRevisioned(this.manifestPath).revision);
                } catch { /* deleted or unreadable: the next change reports it */ }
            }, 50);
        });
        return new Promise(resolve => watcher.once('ready', () => resolve()));
    }

    close(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        void this.watcher?.close();
        this.watcher = null;
    }
}
