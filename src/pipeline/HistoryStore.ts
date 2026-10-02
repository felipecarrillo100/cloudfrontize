import { TelemetryEvent } from './Telemetry';

export interface IHistoryStore {
  add(event: TelemetryEvent): void;
  getAll(): TelemetryEvent[];
  getById(id: string): TelemetryEvent[];
  /** Stored ids, oldest first. */
  getIds(): string[];
  clear(): void;
}

/** Roughly what an event holds: its strings (header values, base64 body snapshots) dominate. */
export function estimateSize(value: unknown, depth = 0): number {
  if (typeof value === 'string') return value.length;
  if (value === null || typeof value !== 'object' || depth > 6) return 8;
  let size = 16;
  if (Array.isArray(value)) for (const v of value) size += estimateSize(v, depth + 1);
  else for (const k in value as Record<string, unknown>) size += k.length + estimateSize((value as Record<string, unknown>)[k], depth + 1);
  return size;
}

/** 256 MB: room for hundreds of journeys with 1 MB body snapshots, without growing without bound. */
export const DEFAULT_HISTORY_BYTES = 256 * 1024 * 1024;

export class InMemoryHistoryStore implements IHistoryStore {
  private historyMap = new Map<string, TelemetryEvent[]>();
  private sizes = new Map<string, number>();
  private requestOrder: string[] = [];
  private bytes = 0;

  /** Keeps at most `maxRequests` requests and about `maxBytes` of events, dropping the oldest first. */
  constructor(private maxRequests: number = 5000, private maxBytes: number = DEFAULT_HISTORY_BYTES) {}

  public add(event: TelemetryEvent): void {
    // Atomic Request Grouping
    if (!this.historyMap.has(event.id)) {
      this.requestOrder.push(event.id);
      this.historyMap.set(event.id, []);
      this.sizes.set(event.id, 0);
    }
    this.historyMap.get(event.id)!.push(event);
    const size = estimateSize(event);
    this.sizes.set(event.id, this.sizes.get(event.id)! + size);
    this.bytes += size;

    // FIFO purge by count and by memory; the newest request always stays
    while (this.requestOrder.length > 1 && (this.requestOrder.length > this.maxRequests || this.bytes > this.maxBytes)) {
      this.drop(this.requestOrder.shift()!);
    }
  }

  private drop(id: string) {
    this.bytes -= this.sizes.get(id) ?? 0;
    this.sizes.delete(id);
    this.historyMap.delete(id);
  }

  /** Approximate memory held, for diagnostics and tests. */
  public get size(): number {
    return this.bytes;
  }

  public getAll(): TelemetryEvent[] {
    // Return a flattened array of all events for all stored requests in order
    return this.requestOrder.flatMap(id => this.historyMap.get(id) || []);
  }

  public getById(id: string): TelemetryEvent[] {
    // O(1) Indexed Lookup
    return this.historyMap.get(id) || [];
  }

  public getIds(): string[] {
    return [...this.requestOrder];
  }

  public clear(): void {
    this.historyMap.clear();
    this.sizes.clear();
    this.requestOrder = [];
    this.bytes = 0;
  }
}

/** Keeps nothing: for servers without a WebUI, where no one can read the history. */
export class NullHistoryStore implements IHistoryStore {
  public add(): void {}
  public getAll(): TelemetryEvent[] { return []; }
  public getById(): TelemetryEvent[] { return []; }
  public getIds(): string[] { return []; }
  public clear(): void {}
}
