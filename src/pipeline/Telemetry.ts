import EventEmitter from 'events';

import { IHistoryStore } from './HistoryStore';

export interface TelemetryEvent {
    id: string;
    timestamp: string;
    type: 'request' | 'hook' | 'response' | 'error' | 'rewrite' | 'stage';
    hookType?: string;
    durationMs?: number;
    details: any;
}

export class Telemetry extends EventEmitter {
    constructor(private store: IHistoryStore) {
        super();
    }

    public broadcast(event: Omit<TelemetryEvent, 'timestamp'>): void {
        const fullEvent: TelemetryEvent = {
            ...event,
            timestamp: new Date().toISOString()
        };
        
        // Delegate storage to the modular store
        this.store.add(fullEvent);
        
        this.emit('event', fullEvent);
    }

    public getHistory(): TelemetryEvent[] {
        return this.store.getAll();
    }

    public getById(id: string): TelemetryEvent[] {
        return this.store.getById(id);
    }

    public clearHistory(): void {
        this.store.clear();
    }

    /**
     * Extracts and safely truncates the request body for telemetry display.
     */
    public static captureLeReqBody(result: any, reqBodyMeta?: { contentType: string }): any {
        if (!reqBodyMeta) return undefined;
        const lb = result?.body;
        if (lb?.action === 'replace' && lb?.data) {
            const raw = lb.encoding === 'base64'
                ? Buffer.from(String(lb.data), 'base64')
                : Buffer.from(String(lb.data || ''));
            // Use 40KB limits from AWS (assumes 40000 for display snapshots)
            const snapshotLimit = 40000; 
            const sl = raw.slice(0, snapshotLimit);
            return { body: sl.toString('base64'), bodySize: raw.length, bodyTruncated: raw.length > snapshotLimit, contentType: reqBodyMeta.contentType };
        }
        return { bodyUnchanged: true };
    }

    /**
     * Extracts and safely truncates the response body for telemetry display.
     */
    public static captureLeResBody(result: any, prevMeta?: { contentType: string }): any {
        let rb = result?.body;
        let encoding = result.bodyEncoding || 'text';

        // Unpack Internal Body Object if present
        if (typeof rb === 'object' && rb !== null && rb.data !== undefined) {
            encoding = rb.encoding || encoding;
            rb = rb.data;
        }

        // Response hooks return the body directly (not action: replace)
        if (rb !== undefined && rb !== null) {
            const raw = encoding === 'base64'
                ? Buffer.from(String(rb), 'base64')
                : Buffer.from(String(rb));
            const snapshotLimit = 40000;
            const sl = raw.slice(0, snapshotLimit);
            return { body: sl.toString('base64'), bodySize: raw.length, bodyTruncated: raw.length > snapshotLimit, contentType: (prevMeta?.contentType || 'text/plain') };
        }
        if (prevMeta) return { bodyUnchanged: true };
        return undefined;
    }
}
