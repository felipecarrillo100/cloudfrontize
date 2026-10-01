/**
 * A problem found while loading or validating a project.
 * `path` is a JSON pointer into the manifest (e.g. `/behaviors/0/functions/viewer-request`).
 */
export interface Diagnostic {
    severity: 'error' | 'warning' | 'info';
    path: string;
    rule: string;
    message: string;
}

/** Thrown when a project can't be loaded: invalid JSON, schema errors, or AWS rule violations. */
export class ManifestError extends Error {
    constructor(public readonly manifestPath: string, public readonly diagnostics: Diagnostic[]) {
        const errors = diagnostics.filter(d => d.severity === 'error');
        super(`${manifestPath}: ${errors.length} error(s)\n` + errors.map(d => `  ${d.path || '/'}: ${d.message}`).join('\n'));
        this.name = 'ManifestError';
    }
}

/** The main or WebUI port is already taken. */
export class PortInUseError extends Error {
    constructor(public readonly port: number, public readonly server: 'main' | 'webui') {
        super(`Port ${port} is already in use (${server === 'webui' ? 'WebUI' : 'main'} server)`);
        this.name = 'PortInUseError';
    }
}

/** A server failed to start for a reason other than a busy port. */
export class ServerStartError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'ServerStartError';
    }
}

/** The viewer headers file (`--headers` / `viewer.headers`) couldn't be read or parsed. */
export class HeaderConfigError extends Error {
    constructor(message: string, public readonly filePath: string) {
        super(message);
        this.name = 'HeaderConfigError';
    }
}

/** The manifest changed on disk since the revision a save was based on. */
export class ManifestConflictError extends Error {
    constructor(public readonly manifestPath: string, public readonly currentRevision: string, public readonly current: unknown) {
        super(`${manifestPath} changed since it was read (now at revision ${currentRevision})`);
        this.name = 'ManifestConflictError';
    }
}

/** The operation needs a project, but the server runs a 2.x command-line setup. */
export class NoProjectError extends Error {
    constructor(message = 'No project is open (the server runs a 2.x command-line setup)') {
        super(message);
        this.name = 'NoProjectError';
    }
}
