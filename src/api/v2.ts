import type { ProjectRuntime } from '../runtime/ProjectRuntime';
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
}

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
