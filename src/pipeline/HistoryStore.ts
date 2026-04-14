import { TelemetryEvent } from './Telemetry';

export interface IHistoryStore {
  add(event: TelemetryEvent): void;
  getAll(): TelemetryEvent[];
  getById(id: string): TelemetryEvent[];
  clear(): void;
}

export class InMemoryHistoryStore implements IHistoryStore {
  private historyMap = new Map<string, TelemetryEvent[]>();
  private requestOrder: string[] = [];
  private maxRequests: number;

  constructor(maxRequests: number = 5000) {
    this.maxRequests = maxRequests;
  }

  public add(event: TelemetryEvent): void {
    // Atomic Request Grouping
    if (!this.historyMap.has(event.id)) {
      this.requestOrder.push(event.id);
      this.historyMap.set(event.id, []);

      // FIFO Request-based Purge
      if (this.requestOrder.length > this.maxRequests) {
        const oldestId = this.requestOrder.shift();
        if (oldestId) this.historyMap.delete(oldestId);
      }
    }

    this.historyMap.get(event.id)?.push(event);
  }

  public getAll(): TelemetryEvent[] {
    // Return a flattened array of all events for all stored requests in order
    return this.requestOrder.flatMap(id => this.historyMap.get(id) || []);
  }

  public getById(id: string): TelemetryEvent[] {
    // O(1) Indexed Lookup
    return this.historyMap.get(id) || [];
  }

  public clear(): void {
    this.historyMap.clear();
    this.requestOrder = [];
  }
}
