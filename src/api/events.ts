import type { TelemetryEvent } from '../pipeline/Telemetry';

/**
 * WebUI API v2 events: typed, versioned and sequenced.
 *
 * @namespace Backend
 * Every event has the same envelope. `seq` increases by one per event for the server's lifetime, so a
 * client that reconnects with `Last-Event-ID` gets exactly what it missed. Stage events say which
 * event, runtime and functions they belong to, so clients never parse display names.
 */
export const EVENTS_VERSION = 2;

export type EdgeEvent = 'viewer-request' | 'origin-request' | 'origin-response' | 'viewer-response';
export type FunctionRuntime = 'cloudfront-function' | 'lambda-edge';

/** Where a request is in the pipeline. */
export type StageInfo =
    | { kind: 'function'; event: EdgeEvent; runtime: FunctionRuntime; functionIds: string[] }
    | { kind: 'short-circuit'; event: EdgeEvent; runtime: FunctionRuntime; functionIds: string[] }
    | { kind: 'origin-fetch'; origin: string }
    | { kind: 'origin-response' }
    | { kind: 'final-response' };

/** Body snapshot fields, as captured by the pipeline (base64, capped). */
export interface BodySnapshot {
    body?: string;
    bodySize?: number;
    bodyTruncated?: boolean;
    bodyUnchanged?: boolean;
    contentType?: string;
}

export type Headers = Record<string, string | string[]>;

export interface EventPayloads {
    /** First event on every connection: what the client is talking to. */
    'stream.hello': { apiVersion: number; version: string; seq: number; resumed: boolean };
    /** The client asked to resume from an event that is no longer buffered: refetch state. */
    'stream.reset': { reason: string };
    'request.started': { method: string; url: string; headers: Headers } & BodySnapshot;
    'request.stage': { name: string; stage: StageInfo | null; uri?: string; status?: number | string; headers?: Headers } & BodySnapshot;
    'request.completed': { status: number; headers: Headers; durationMs?: number };
    'request.failed': { message: string };
    'build.succeeded': { file: string; runtime: FunctionRuntime };
    'build.failed': { file: string; runtime?: FunctionRuntime; message: string; line?: number; column?: number; snippet?: string };
    'project.opened': { name: string; dir: string };
    /** Functions, behaviors or their state changed: refetch the distribution. */
    'distribution.changed': Record<string, never>;
}

export type ApiEventType = keyof EventPayloads;

export interface ApiEvent<T extends ApiEventType = ApiEventType> {
    v: typeof EVENTS_VERSION;
    seq: number;
    time: string;
    type: T;
    requestId?: string;
    data: EventPayloads[T];
}

type Unsequenced = Omit<ApiEvent, 'v' | 'seq'>;

const runtimeOf = (raw: any): FunctionRuntime | undefined =>
    raw === 'cff' ? 'cloudfront-function' : raw === 'edge' ? 'lambda-edge' : undefined;

/** Maps an internal telemetry event to its v2 form (null for internal-only events). */
export function toApiEvent(event: TelemetryEvent): Unsequenced | null {
    const time = event.timestamp;
    const d: any = event.details ?? {};
    switch (event.type) {
        case 'request':
            return { time, type: 'request.started', requestId: event.id, data: { method: d.method, url: d.url, headers: d.headers ?? {}, ...body(d) } };
        case 'stage': {
            const { name, stage, uri, status, headers } = d;
            return { time, type: 'request.stage', requestId: event.id, data: { name, stage: stage ?? null, uri, status, headers, ...body(d) } };
        }
        case 'response':
            return { time, type: 'request.completed', requestId: event.id, data: { status: Number(d.status), headers: d.headers ?? {}, durationMs: event.durationMs } };
        case 'success':
            if (event.id !== 'SYSTEM_BUILD') return null;
            return { time, type: 'build.succeeded', data: { file: d.file, runtime: runtimeOf(d.type) ?? 'lambda-edge' } };
        case 'error':
            if (event.id === 'SYSTEM_BUILD') {
                return {
                    time, type: 'build.failed',
                    data: { file: d.path ?? d.file, runtime: runtimeOf(d.type), message: String(d.error ?? d.message ?? 'Build failed'), line: d.line, column: d.column, snippet: d.snippet }
                };
            }
            return { time, type: 'request.failed', requestId: event.id, data: { message: String(d.message ?? 'Request failed') } };
        case 'project':
            return { time, type: 'project.opened', data: { name: d.name, dir: d.dir } };
        default:
            // 'distribution' broadcasts carry the whole distribution under `data` (not `details`)
            if ((event as any).type === 'distribution') return { time, type: 'distribution.changed', data: {} };
            return null;
    }
}

function body(d: any): BodySnapshot {
    const out: BodySnapshot = {};
    for (const key of ['body', 'bodySize', 'bodyTruncated', 'bodyUnchanged', 'contentType'] as const) {
        if (d[key] !== undefined) (out as any)[key] = d[key];
    }
    return out;
}
