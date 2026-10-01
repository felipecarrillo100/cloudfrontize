import path from 'path';
import type { ProjectRuntime } from '../runtime/ProjectRuntime';
import type { Diagnostic } from '../project/errors';
import { HeaderConfigError, ManifestConflictError, ManifestError, NoProjectError } from '../project/errors';
import { checkManifest } from '../project/loadProject';
import type { Telemetry, TelemetryEvent } from '../pipeline/Telemetry';
import { VERSION } from '../version';
import { ApiError } from './errors';
import { EVENTS_VERSION, toApiEvent } from './events';
import { EventHub } from './EventHub';
import { Router, STREAMING } from './router';

export const API_PREFIX = '/api/v2';

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
function toApiError(err: unknown): unknown {
    if (err instanceof ManifestConflictError) {
        return ApiError.conflict('The manifest changed on disk since you loaded it', { revision: err.currentRevision, manifest: err.current });
    }
    if (err instanceof ManifestError) return new ApiError(422, 'invalid-manifest', 'The manifest has errors', { diagnostics: err.diagnostics });
    if (err instanceof NoProjectError) return new ApiError(409, 'no-project', err.message);
    if (err instanceof HeaderConfigError) return new ApiError(422, 'invalid-viewer-headers', err.message, { file: err.filePath });
    return err;
}

const mapErrors = async <T>(task: () => Promise<T>): Promise<T> => {
    try { return await task(); } catch (err) { throw toApiError(err); }
};

const etag = (revision: string) => `"${revision}"`;
const unquote = (value: string) => value.trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1');

/** Summary of one recorded request, newest first in `GET /requests`. */
export interface RequestSummary {
    id: string;
    time: string;
    method: string;
    url: string;
    status?: number;
    durationMs?: number;
    failed?: boolean;
}

const isRequestId = (id: string) => !id.startsWith('SYSTEM_');

function summarize(id: string, events: TelemetryEvent[]): RequestSummary | null {
    const started = events.find(e => e.type === 'request');
    if (!started) return null;
    const completed = events.find(e => e.type === 'response');
    const failed = events.some(e => e.type === 'error');
    return {
        id,
        time: started.timestamp,
        method: started.details?.method,
        url: started.details?.url,
        ...(completed ? { status: Number(completed.details?.status), durationMs: completed.durationMs } : {}),
        ...(failed ? { failed: true } : {})
    };
}

/**
 * The WebUI API v2 (`/api/v2`). JSON in and out, typed errors, and a sequenced event stream.
 * The 2.x endpoints (`/api/*`, `/events`) stay for the current UI until the 3.0 workbench replaces it.
 */
export function createApiV2(host: ApiHost): Router {
    const router = new Router(API_PREFIX);

    router.get('/', () => {
        const runtime = host.runtime();
        const project = runtime.project;
        return {
            body: {
                apiVersion: EVENTS_VERSION,
                version: VERSION,
                ports: host.ports(),
                project: project ? { name: project.manifest.name, dir: project.dir } : null,
                legacy: !project,
                routes: router.describe()
            }
        };
    });

    // ---------- The open project ----------

    const requireProject = () => {
        const project = host.runtime().project;
        if (!project) throw new ApiError(409, 'no-project', 'No project is open (the server runs a 2.x command-line setup)');
        return project;
    };

    const describeProject = () => {
        const project = requireProject();
        const { diagnostics } = checkManifest(project.source, project.dir);
        return {
            name: project.manifest.name,
            dir: project.dir,
            manifestPath: project.manifestPath,
            revision: project.revision,
            manifest: project.source,
            diagnostics
        };
    };

    router.get('/project', () => {
        const body = describeProject();
        return { body, headers: { ETag: etag(body.revision) } };
    });

    // Save the manifest. The edit must say which revision it started from (`revision` in the body or
    // an If-Match header): if the file changed since, the save is refused with the current content.
    router.put('/project/manifest', async ({ body, req }) => {
        const input = body as { manifest?: unknown; revision?: string } | undefined;
        if (!input || typeof input !== 'object' || input.manifest === undefined) {
            throw ApiError.badRequest('Send { "manifest": {...}, "revision": "<revision you edited>" }');
        }
        const ifMatch = req.headers['if-match'];
        const revision = input.revision ?? (typeof ifMatch === 'string' ? unquote(ifMatch) : undefined);
        if (!revision) throw new ApiError(428, 'revision-required', 'Say which revision you edited ("revision" or If-Match), so concurrent changes are never overwritten');
        const result = await mapErrors(() => host.projects().saveManifest(input.manifest, revision));
        return { body: result, headers: { ETag: etag(result.revision) } };
    });

    // Check a manifest without saving it
    router.post('/project/validate', ({ body }) => {
        const project = requireProject();
        const input = body as { manifest?: unknown } | undefined;
        if (!input || input.manifest === undefined) throw ApiError.badRequest('Send { "manifest": {...} }');
        const { manifest, diagnostics } = checkManifest(input.manifest, project.dir);
        return { body: { valid: !!manifest && !diagnostics.some(d => d.severity === 'error'), diagnostics } };
    });

    router.post('/project/reload', async () => {
        await mapErrors(() => host.projects().reload());
        const { revision, diagnostics } = describeProject();
        return { body: { revision, diagnostics } };
    });

    // Open another project (a folder with cloudfrontize.json, or the manifest's path)
    router.post('/projects/open', async ({ body }) => {
        const target = (body as { path?: unknown } | undefined)?.path;
        if (typeof target !== 'string' || !path.isAbsolute(target)) throw ApiError.badRequest('Send { "path": "<absolute path of a project folder>" }');
        await mapErrors(() => host.projects().openProject(target));
        const { name, dir, revision, diagnostics } = describeProject();
        return { body: { name, dir, revision, diagnostics } };
    });

    // Live events (Server-Sent Events). Reconnect with Last-Event-ID (or ?since=<seq>) to resume.
    router.get('/events', ({ req, res }) => {
        host.events.subscribe(req, res);
        return STREAMING;
    });

    // Recorded traffic
    router.get('/requests', ({ query }) => {
        const limit = Math.min(Math.max(Number(query.get('limit') ?? 100) || 100, 1), 5000);
        const ids = host.telemetry.getIds().filter(isRequestId).reverse();
        const items: RequestSummary[] = [];
        for (const id of ids) {
            const summary = summarize(id, host.telemetry.getById(id));
            if (summary) items.push(summary);
            if (items.length >= limit) break;
        }
        return { body: { items, seq: host.events.lastSeq } };
    });

    router.get('/requests/:id', ({ params }) => {
        const events = host.telemetry.getById(params.id);
        if (!isRequestId(params.id) || events.length === 0) throw ApiError.notFound(`No recorded request ${params.id}`);
        const summary = summarize(params.id, events);
        // Recorded events are returned in v2 form, without stream sequence numbers
        const journey = events.map(toApiEvent).filter(Boolean).map(e => ({ v: EVENTS_VERSION, ...e }));
        return { body: { ...summary, events: journey } };
    });

    router.delete('/requests', () => {
        host.telemetry.clearHistory();
        return {};
    });

    return router;
}
