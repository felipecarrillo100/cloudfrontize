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
}
