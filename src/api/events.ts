import type { TelemetryEvent } from '../pipeline/Telemetry';
import type { ApiEvent, BodySnapshot, FunctionRuntime } from './contract';
import { EVENTS_VERSION } from './contract';

/**
 * WebUI API v2 events: typed, versioned and sequenced (types in contract.ts).
 *
 * @namespace Backend
 * Every event has the same envelope. `seq` increases by one per event for the server's lifetime, so a
 * client that reconnects with `Last-Event-ID` gets exactly what it missed. Stage events say which
 * event, runtime and functions they belong to, so clients never parse display names.
 */
export { EVENTS_VERSION };
export type { ApiEvent, ApiEventType, BodySnapshot, EdgeEvent, EventPayloads, FunctionRuntime, StageInfo } from './contract';

type Unsequenced = DistributiveOmit<ApiEvent, 'v' | 'seq'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

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
        case 'project': {
            const base = { name: d.name, dir: d.dir };
            const diagnostics = d.diagnostics ?? [];
            if (d.action === 'changed') return { time, type: 'project.changed', data: { ...base, revision: d.revision, source: d.source, diagnostics } };
            if (d.action === 'invalid') return { time, type: 'project.invalid', data: { ...base, revision: d.revision, diagnostics } };
            if (d.action === 'viewer-headers') return { time, type: 'viewer.changed', data: base };
            return { time, type: 'project.opened', data: { ...base, revision: d.revision, diagnostics } };
        }
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
