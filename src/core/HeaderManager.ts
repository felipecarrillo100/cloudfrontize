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
     * Converts raw incoming headers (Node.js/Neutral) to our Internal Fidelity Format.
     * Uses rawHeaders if available to preserve the original key casing.
     */
    public parseIncomingHeaders(req: any): HeaderMap {
        const headers: HeaderMap = {};
        const raw = req.rawHeaders || [];

        if (raw.length > 0) {
            for (let i = 0; i < raw.length; i += 2) {
                const key = raw[i];
                const lower = key.toLowerCase();
                const val = raw[i + 1];
                if (!headers[lower]) headers[lower] = [];
                headers[lower].push({ key, value: String(val) });
            }
        } else {
            // Fallback for mock environments (tests)
            for (const [k, v] of Object.entries(req.headers || {})) {
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
     * Normalizes a header map to ensure every key is lowercase and every value is an array of {key, value}.
     */
    public normalizeHeaders(input: any): HeaderMap {
        const headers: HeaderMap = {};
        if (!input) return headers;

        for (const k in input) {
            const lowerKey = k.toLowerCase();
            const val = input[k];
            const values = Array.isArray(val) ? val : [val];
            
            headers[lowerKey] = values.map(v => {
                // Already a fidelity object? ( { key, value } )
                if (typeof v === 'object' && v !== null && v.value !== undefined && v.key !== undefined) {
                    return v as HeaderValue;
                }
                // CloudFront Function style? ( { value } )
                if (typeof v === 'object' && v !== null && v.value !== undefined) {
                    return { key: k, value: String(v.value) };
                }
                // Raw value?
                return { key: k, value: String(v) };
            });
        }
        return headers;
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
        const normalized = HeaderManager.prototype.normalizeHeaders(input);

        for (const values of Object.values(normalized)) {
            for (const item of values) {
                const key = item.key;
                const val = item.value;

                if (!flat[key]) {
                    (flat as any)[key] = val;
                } else {
                    const existing = (flat as any)[key];
                    (flat as any)[key] = Array.isArray(existing) ? [...existing, val] : [existing, val];
                }
            }
        }
        return flat as Record<string, string | string[]>;
    }
}
