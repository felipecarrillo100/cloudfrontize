import fs from 'fs';
import path from 'path';
import type { ProjectRuntime } from '../runtime/ProjectRuntime';
import type { Diagnostic } from '../project/errors';
import { HeaderConfigError, ManifestConflictError, ManifestError, NoProjectError } from '../project/errors';
import type { Project } from '../project/loadProject';
import { readRevisioned, writeFileAtomic } from '../project/revision';
import type { Telemetry } from '../pipeline/Telemetry';
import { ApiError } from './errors';
import type { EventHub } from './EventHub';

/** What the API needs from the server it runs in. */
export interface ApiHost {
    telemetry: Telemetry;
    events: EventHub;
    /** The runtime currently being served (it changes when a project is opened). */
    runtime(): ProjectRuntime;
    ports(): { main: number; webui: number };
    /** Project operations of the server (see CloudFrontizeServer). */
    projects(): ProjectControl;
}

export interface ProjectControl {
    openProject(target: string): Promise<{ diagnostics: Diagnostic[] }>;
    reload(): Promise<{ diagnostics: Diagnostic[] }>;
    saveManifest(manifest: unknown, baseRevision: string): Promise<{ revision: string; diagnostics: Diagnostic[] }>;
}

/** Maps project errors to API errors. */
export function toApiError(err: unknown): unknown {
    if (err instanceof ManifestConflictError) {
        return ApiError.conflict('The manifest changed on disk since you loaded it', { revision: err.currentRevision, manifest: err.current });
    }
    if (err instanceof ManifestError) return new ApiError(422, 'invalid-manifest', 'The manifest has errors', { diagnostics: err.diagnostics });
    if (err instanceof NoProjectError) return new ApiError(409, 'no-project', err.message);
    if (err instanceof HeaderConfigError) return new ApiError(422, 'invalid-viewer-headers', err.message, { file: err.filePath });
    return err;
}

export const mapErrors = async <T>(task: () => Promise<T>): Promise<T> => {
    try { return await task(); } catch (err) { throw toApiError(err); }
};

export const etag = (revision: string) => `"${revision}"`;
export const unquote = (value: string) => value.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1');

/** The open project, or a 409 `no-project` for a 2.x command-line setup. */
export function requireProject(host: ApiHost): Project {
    const project = host.runtime().project;
    if (!project) throw new ApiError(409, 'no-project', 'No project is open (the server runs a 2.x command-line setup)');
    return project;
}

/** A plain object from a JSON body, or a 400 with `usage`. */
export function objectBody(body: unknown, usage: string): Record<string, any> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw ApiError.badRequest(usage);
    return body as Record<string, any>;
}

/**
 * Edits the manifest as written (no defaults applied) and saves it through the server, which checks
 * the revision, validates every AWS rule, writes it and reloads the project.
 * @param baseRevision - The manifest revision the client edited; defaults to the one being served.
 */
export async function editManifest(host: ApiHost, edit: (manifest: Record<string, any>) => void, baseRevision?: string) {
    const project = requireProject(host);
    const draft = structuredClone(project.source) as Record<string, any>;
    edit(draft);
    return mapErrors(() => host.projects().saveManifest(draft, baseRevision ?? project.revision));
}

/** Reads a project file with its revision (null when it doesn't exist). */
export function readFile(abs: string): { content: string; revision: string } | null {
    try {
        return readRevisioned(abs);
    } catch (err: any) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

/**
 * Writes a project file only if it is still at `baseRevision` (null: it must not exist yet).
 * Otherwise a 409 `conflict` carries the current revision and content, for a diff view.
 */
export function writeChecked(abs: string, content: string, baseRevision: string | null): string {
    const current = readFile(abs);
    if ((current?.revision ?? null) !== baseRevision) {
        throw ApiError.conflict(current ? `${path.basename(abs)} changed since you loaded it` : `${path.basename(abs)} no longer exists`,
            { revision: current?.revision ?? null, content: current?.content ?? null });
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return writeFileAtomic(abs, content);
}

/** The revision a write is based on: `revision` in the body or an If-Match header (428 when missing). */
export function baseRevisionOf(body: Record<string, any>, headers: Record<string, unknown>, allowNull = false): string | null {
    if (body.revision === null && allowNull) return null;
    if (typeof body.revision === 'string') return body.revision;
    const ifMatch = headers['if-match'];
    if (typeof ifMatch === 'string') return unquote(ifMatch);
    throw new ApiError(428, 'revision-required', 'Say which revision you edited ("revision" or If-Match), so concurrent changes are never overwritten');
}
