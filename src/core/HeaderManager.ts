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
        for (const k in input) {
            const lowerKey = k.toLowerCase();
            const val = input[k];
            
            if (Array.isArray(val)) {
                headers[lowerKey] = val.map(v => 
                    typeof v === 'object' && v !== null && v.value !== undefined 
                        ? v as HeaderValue 
                        : { key: k, value: String(v) }
                );
            } else if (typeof val === 'object' && val !== null && (val as any).value !== undefined) {
                headers[lowerKey] = [val as HeaderValue];
            } else {
                headers[lowerKey] = [{ key: k, value: String(val) }];
            }
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
    public flatten(map: HeaderMap): Record<string, string | string[]> {
        const flat: Record<string, string | string[]> = {};
        for (const [lowerKey, values] of Object.entries(map)) {
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
        if (mutations) {
            for (const [k, v] of Object.entries(mutations)) {
                const lowerKey = k.toLowerCase();
                const values = Array.isArray(v) ? v : [v];
                
                if (force || !req.headers[lowerKey]) {
                    // Standard Node.js behavior: multiple values are joined by comma, 
                    // except for set-cookie which stays an array.
                    if (lowerKey === 'set-cookie' || lowerKey === 'cookie') {
                        req.headers[lowerKey] = values.map(val => 
                            typeof val === 'object' ? val.value : val
                        );
                    } else {
                        req.headers[lowerKey] = values.map(val => 
                            typeof val === 'object' ? val.value : val
                        ).join(', ');
                    }
                }
            }
        }

        // Reconstruct rawHeaders (vital for node-fetch and internal fidelity)
        const raw: string[] = [];
        for (const [k, v] of Object.entries(req.headers)) {
            if (Array.isArray(v)) {
                v.forEach(val => raw.push(k, String(val)));
            } else {
                raw.push(k, String(v));
            }
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

        for (const [k, v] of Object.entries(input)) {
            if (v === undefined || v === null) continue;
            
            // 1. Unwrap Lambda@Edge structure: [ { key, value } ]
            if (Array.isArray(v)) {
                const values = v.map(item => {
                    if (typeof item === 'object' && item !== null && item.value !== undefined) return item.value;
                    return String(item);
                });
                flat[k.toLowerCase()] = values.length === 1 ? values[0] : values;
            } 
            // 2. Unwrap CFF structure: { value: "..." }
            else if (typeof v === 'object' && v !== null && (v as any).value !== undefined) {
                flat[k.toLowerCase()] = (v as any).value;
            } 
            // 3. Fallback for Node.js flat strings/numbers
            else {
                flat[k.toLowerCase()] = String(v);
            }
        }
        return flat;
    }
}
