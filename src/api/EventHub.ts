import http from 'http';
import { VERSION } from '../version';
import type { Telemetry, TelemetryEvent } from '../pipeline/Telemetry';
import { ApiEvent, EVENTS_VERSION, toApiEvent } from './events';

/** Events kept for clients that reconnect (`Last-Event-ID`). */
export const REPLAY_BUFFER = 2000;
const HEARTBEAT_MS = 15000;

/**
 * Turns telemetry into sequenced v2 events and serves them as Server-Sent Events.
 *
 * Each event goes out as `id: <seq>` + `data: <json>` (the type is inside the JSON, so a plain
 * `onmessage` handler gets everything), and a browser EventSource resumes automatically after a disconnect. A heartbeat comment keeps idle connections open
 * through proxies and lets the server notice dead clients.
 */
export class EventHub {
    private seq = 0;
    private buffer: ApiEvent[] = [];
    private clients = new Set<http.ServerResponse>();
    private readonly onTelemetry = (event: TelemetryEvent) => this.publishTelemetry(event);
    private heartbeat: NodeJS.Timeout | null = null;

    constructor(private telemetry: Telemetry) {
        telemetry.on('event', this.onTelemetry);
    }

    get lastSeq() { return this.seq; }

    /** Converts and publishes one telemetry event. */
    publishTelemetry(event: TelemetryEvent): void {
        const mapped = toApiEvent(event);
        if (mapped) this.publish(mapped);
    }

    publish(event: Omit<ApiEvent, 'v' | 'seq'>): ApiEvent {
        const full = { v: EVENTS_VERSION, seq: ++this.seq, ...event } as ApiEvent;
        this.buffer.push(full);
        if (this.buffer.length > REPLAY_BUFFER) this.buffer.splice(0, this.buffer.length - REPLAY_BUFFER);
        for (const client of this.clients) write(client, full);
        return full;
    }

    /** Events after `seq` still in the buffer, or null when some were already dropped. */
    since(seq: number): ApiEvent[] | null {
        if (seq >= this.seq) return [];
        const first = this.buffer[0]?.seq ?? this.seq + 1;
        if (seq + 1 < first) return null;
        return this.buffer.filter(e => e.seq > seq);
    }

    /** Serves the event stream on `res`, replaying what the client missed. */
    subscribe(req: http.IncomingMessage, res: http.ServerResponse): void {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.write('retry: 2000\n\n');

        const raw = req.headers['last-event-id'] ?? new URL(req.url || '/', 'http://localhost').searchParams.get('since');
        const lastId = raw !== undefined && raw !== null && raw !== '' ? Number(raw) : NaN;
        const replay = Number.isFinite(lastId) ? this.since(lastId) : [];

        const hello = { v: EVENTS_VERSION, seq: this.seq, time: new Date().toISOString(), type: 'stream.hello', data: { apiVersion: EVENTS_VERSION, version: VERSION, seq: this.seq, resumed: replay !== null && Number.isFinite(lastId) } } as ApiEvent;
        // The hello carries no `id:`, so it doesn't move the client's Last-Event-ID
        writeUnsequenced(res, hello);
        if (replay === null) {
            writeUnsequenced(res, { ...hello, type: 'stream.reset', data: { reason: 'The events since your last connection are no longer available' } } as ApiEvent);
        } else {
            for (const event of replay) write(res, event);
        }

        this.clients.add(res);
        this._ensureHeartbeat();
        const drop = () => { this.clients.delete(res); if (this.clients.size === 0) this._stopHeartbeat(); };
        req.on('close', drop);
        res.on('close', drop);
    }

    /** Ends every open stream and detaches from telemetry. */
    close(): void {
        this.telemetry.off('event', this.onTelemetry);
        for (const client of this.clients) client.end();
        this.clients.clear();
        this._stopHeartbeat();
    }

    private _ensureHeartbeat() {
        if (this.heartbeat) return;
        this.heartbeat = setInterval(() => { for (const c of this.clients) c.write(': ping\n\n'); }, HEARTBEAT_MS);
        this.heartbeat.unref();
    }

    private _stopHeartbeat() {
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = null;
    }
}

function write(res: http.ServerResponse, event: ApiEvent) {
    res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
}

function writeUnsequenced(res: http.ServerResponse, event: ApiEvent) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
}
