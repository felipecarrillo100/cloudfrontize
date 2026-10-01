import fs from 'fs';

/**
 * A local CloudFront KeyValueStore, read from a file in AWS's import format so the same file can be
 * imported into a real store:
 *
 *   { "data": [ { "key": "key1", "value": "value" } ] }
 *
 * Limits ("File format for key-value pairs"): no duplicate keys, file 5 MB, key 512 characters,
 * value 1024 characters.
 */
export const KVS_LIMITS = {
    FILE_BYTES: 5 * 1024 * 1024,
    KEY_CHARS: 512,
    VALUE_CHARS: 1024
} as const;

export interface KvsProblem {
    severity: 'error' | 'warning';
    message: string;
}

export interface KvsMeta {
    keyCount: number;
    creationDateTime: string;
    lastUpdatedDateTime: string;
}

export class KeyValueStore {
    private data = new Map<string, string>();
    private created = new Date();
    private updated = new Date();

    constructor(public readonly file: string) {}

    /**
     * Reads and checks a store file. Format problems are errors; quota overruns are errors under
     * `strict` (AWS would reject the import) and warnings otherwise.
     */
    static check(file: string, strict = false): { entries: Map<string, string>; problems: KvsProblem[] } {
        const problems: KvsProblem[] = [];
        const entries = new Map<string, string>();
        const quota = (message: string) => problems.push({ severity: strict ? 'error' : 'warning', message });

        let raw: string;
        try {
            raw = fs.readFileSync(file, 'utf8');
        } catch {
            problems.push({ severity: 'error', message: `Key value store file not found: ${file}` });
            return { entries, problems };
        }
        return KeyValueStore.checkContent(raw, strict);
    }

    /** Checks the content of a key value store file (AWS import format, size limits). */
    static checkContent(raw: string, strict = false): { entries: Map<string, string>; problems: KvsProblem[] } {
        const problems: KvsProblem[] = [];
        const entries = new Map<string, string>();
        const quota = (message: string) => problems.push({ severity: strict ? 'error' : 'warning', message });
        if (Buffer.byteLength(raw) > KVS_LIMITS.FILE_BYTES) quota(`The file is ${Buffer.byteLength(raw)} bytes; key value stores are limited to 5 MB`);

        let parsed: any;
        try {
            parsed = JSON.parse(raw);
        } catch (err: any) {
            problems.push({ severity: 'error', message: `Not valid JSON: ${err.message}` });
            return { entries, problems };
        }
        if (!parsed || !Array.isArray(parsed.data)) {
            problems.push({ severity: 'error', message: 'Use the AWS format: { "data": [ { "key": "…", "value": "…" } ] }' });
            return { entries, problems };
        }

        parsed.data.forEach((item: any, i: number) => {
            if (!item || typeof item.key !== 'string' || typeof item.value !== 'string') {
                problems.push({ severity: 'error', message: `data[${i}]: each entry needs a string "key" and a string "value"` });
                return;
            }
            if (entries.has(item.key)) problems.push({ severity: 'error', message: `data[${i}]: duplicate key "${item.key}"` });
            if (item.key.length > KVS_LIMITS.KEY_CHARS) quota(`data[${i}]: key is ${item.key.length} characters; the limit is 512`);
            if (item.value.length > KVS_LIMITS.VALUE_CHARS) quota(`data[${i}]: value of "${item.key.slice(0, 40)}" is ${item.value.length} characters; the limit is 1024`);
            entries.set(item.key, item.value);
        });
        return { entries, problems };
    }

    /** (Re)loads the file; returns the problems found. */
    load(strict = false): KvsProblem[] {
        const { entries, problems } = KeyValueStore.check(this.file, strict);
        if (!problems.some(p => p.severity === 'error')) this.data = entries;
        try {
            const stat = fs.statSync(this.file);
            this.created = stat.birthtime;
            this.updated = stat.mtime;
        } catch { /* reported by check */ }
        return problems;
    }

    has(key: string): boolean { return this.data.has(key); }
    get(key: string): string | undefined { return this.data.get(key); }

    meta(): KvsMeta {
        return { keyCount: this.data.size, creationDateTime: this.created.toISOString(), lastUpdatedDateTime: this.updated.toISOString() };
    }
}
