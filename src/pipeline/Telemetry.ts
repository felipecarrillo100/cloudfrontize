import EventEmitter from 'events';

export interface TelemetryEvent {
    id: string;
    timestamp: string;
    type: 'request' | 'hook' | 'response' | 'error' | 'rewrite' | 'stage';
    hookType?: string;
    durationMs?: number;
    details: any;
}

export class Telemetry extends EventEmitter {
    private history: TelemetryEvent[] = [];
    private maxHistory = 100;

    constructor() {
        super();
    }

    public broadcast(event: Omit<TelemetryEvent, 'timestamp'>): void {
        const fullEvent: TelemetryEvent = {
            ...event,
            timestamp: new Date().toISOString()
        };
        
        this.history.push(fullEvent);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        
        this.emit('event', fullEvent);
    }

    public getHistory(): TelemetryEvent[] {
        return this.history;
    }
}
