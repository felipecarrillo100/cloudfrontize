import { AWS_HEADERS } from '../constants';

export type HeaderValue = { key: string; value: string };
export type HeaderMap = Record<string, HeaderValue[]>;

/**
 * HeaderManager: The definitive source of truth for all header lifecycle events.
 * Centralizes the translation between Node.js, CFF, and Lambda@Edge formats.
 */
export class HeaderManager {
    static FORBIDDEN = AWS_HEADERS.FORBIDDEN;
    static REQUEST_ONLY_FORBIDDEN = AWS_HEADERS.REQUEST_ONLY_FORBIDDEN;

    /**
     * parseIncomingHeaders: Converts raw incoming data to our Internal Fidelity Format (IFF).
     * Now Argument-Agile: Accepts a Node.js Request OR a raw string[] array.
     */
    public parseIncomingHeaders(input: any): HeaderMap {
        const headers: HeaderMap = {};
        if (!input) return headers;

        // Argument-Agile Detection: Is it a raw array or a Request object?
        const raw = Array.isArray(input) ? input : (input.rawHeaders || []);

        if (raw.length > 0) {
            for (let i = 0; i < raw.length; i += 2) {
                const key = raw[i];
                const lower = key.toLowerCase();
                const val = raw[i + 1];
                if (!headers[lower]) headers[lower] = [];
                headers[lower].push({ key, value: String(val) });
            }
        } else {
            // Fallback for objects/req without rawHeaders (e.g. some proxy/test scenarios)
            const obj = (input.headers || input);
            for (const [k, v] of Object.entries(obj)) {
                // Skip if obj is the raw array (which we already handled or it was empty)
                if (Array.isArray(input) && k === 'length') continue;
                
                const lower = k.toLowerCase();
                const values = Array.isArray(v) ? v : [v];
                headers[lower] = values.map(val => 
                    typeof val === 'object' && val !== null && (val as any).value !== undefined
                        ? val as HeaderValue
                        : { key: k, value: String(val) }
                );
            }
        }
        return headers;
    }

    /**
     * static normalizeHeaders: Converts ANY input (Node, CFF, L@E) into our Internal Fidelity Format (IFF).
     */
    public static normalizeHeaders(input: any): HeaderMap {
        const headers: HeaderMap = {};
        if (!input) return headers;

        // Forensic IFF Detector: If first value is already a Fidelity Object, trust the map
        const firstKey = Object.keys(input)[0];
        if (firstKey) {
            const firstValues = input[firstKey];
            if (Array.isArray(firstValues) && firstValues.length > 0 && typeof firstValues[0] === 'object' && firstValues[0]?.value !== undefined) {
                return input as HeaderMap;
            }
        }

        for (const k in input) {
            const lowerKey = k.toLowerCase();
            const val = input[k];
            const rawValues = Array.isArray(val) ? val : [val];
            
            headers[lowerKey] = rawValues.map(v => {
                const isObject = typeof v === 'object' && v !== null;
                const key = isObject ? (v.key || k) : k;
                const value = isObject ? (v.value !== undefined ? v.value : v) : v;
                return { key: String(key), value: String(value) };
            });
        }
        return headers;
    }

    public normalizeHeaders(input: any): HeaderMap {
        return HeaderManager.normalizeHeaders(input);
    }

    /**
     * Reconciles mutations against original state, enforcing AWS forbidden-header rules.
     */
    public reconcile(mutated: HeaderMap, original: HeaderMap, hookType: string, strict = false): void {
        const check = (forbidden: readonly string[]) => {
            for (const key of forbidden) {
                const m = mutated[key];
                const o = original[key];
                // Mutation detected if existence changed or first value changed
                if (m && (!o || m[0].value !== o[0].value)) {
                    const msg = `Forbidden Header Mutation (${key} inside ${hookType})`;
                    if (strict) throw new Error(msg);
                    console.warn(`\x1b[33m⚠️  [Fidelity Warning] ${msg}\x1b[0m`);
                }
            }
        };

        check(HeaderManager.FORBIDDEN);
        if (hookType.includes('-request')) {
            check(HeaderManager.REQUEST_ONLY_FORBIDDEN);
        }
    }

    /**
     * Flattens our Internal Fidelity Format back to a "Neutral" Node.js-style map.
     * CRITICAL: Preserves multi-value headers (like set-cookie) as arrays.
     */
    public flatten(map: any): Record<string, string | string[]> {
        const flat: Record<string, string | string[]> = {};
        const normalized = this.normalizeHeaders(map);

        for (const [lowerKey, values] of Object.entries(normalized)) {
            if (values.length === 1) {
                flat[lowerKey] = values[0].value;
            } else {
                flat[lowerKey] = values.map(v => v.value);
            }
        }
        return flat;
    }

    /**
     * Syncs a sticky header configuration into a live Node.js request/response object.
     * Correctly handles multi-value headers and rebuilds rawHeaders for proxy fidelity.
     */
    public syncToRequest(req: any, mutations: Record<string, any>, force = true): void {
        const currentHeaders = this.normalizeHeaders(req.headers);
        const mutationHeaders = this.normalizeHeaders(mutations);

        // 1. Merge mutations into our Fidelity Format
        for (const [lowerKey, values] of Object.entries(mutationHeaders)) {
            if (force || !currentHeaders[lowerKey]) {
                currentHeaders[lowerKey] = values;
                // Update Node's internal headers map too (stringified/joined for standard usage)
                const nodeVal = values.length === 1 ? values[0].value : values.map(v => v.value);
                req.headers[lowerKey] = nodeVal;
            }
        }

        // 2. Reconstruct rawHeaders with 100% casing fidelity
        const raw: string[] = [];
        for (const values of Object.values(currentHeaders)) {
            values.forEach(v => raw.push(v.key, String(v.value)));
        }
        (req as any).rawHeaders = raw;
    }

    /**
     * static telemetryFlatten: Converts any complex header structure into a "Forensic Neutral" string/array map.
     * Ideal for telemetry broadcasts and terminal display.
     */
    public static telemetryFlatten(input: any): Record<string, string | string[]> {
        if (!input) return {};
        const flat: Record<string, string | string[]> = {};
        
        // Use the static normalization (no fragile prototype context needed)
        const normalized = HeaderManager.normalizeHeaders(input);

        for (const [lowerKey, values] of Object.entries(normalized)) {
            for (const item of (values as HeaderValue[])) {
                const displayKey = item.key || lowerKey;
                const displayVal = String(item.value);

                if (!flat[displayKey]) {
                    (flat as any)[displayKey] = displayVal;
                } else {
                    const existing = (flat as any)[displayKey];
                    (flat as any)[displayKey] = Array.isArray(existing) ? [...existing, displayVal] : [existing, displayVal];
                }
            }
        }
        return flat as Record<string, string | string[]>;
    }
}
