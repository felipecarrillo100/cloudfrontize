import { AWS_HEADERS } from '../constants';
import { EdgeError } from './EdgeError';

export type HeaderValue = { key: string; value: string };
export type HeaderMap = Record<string, HeaderValue[]>;

/**
 * The definitive source of truth for all header lifecycle events in the emulator.
 * 
 * @namespace Backend
 * The HeaderManager centralizes the translation between Node.js, CloudFront Functions (CFF), 
 * and Lambda@Edge (L@E) header formats. It is responsible for maintaining "Wire Case" fidelity 
 * and enforcing AWS production rules (e.g., forbidden header mutations).
 * 
 * It primarily uses the **Internal Fidelity Format (IFF)**:
 * `Record<string, { key: string; value: string }[]>`
 * 
 * This format ensures that headers like `Set-Cookie` (multi-value) and original casing 
 * (e.g. `X-Custom-ID`) are preserved regardless of internal JS object normalization.
 * 
 * @see {@link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-functions-restrictions.html#edge-functions-restrictions-all | Edge Function Restrictions}
 */
export class HeaderManager {
    /** @deprecated Use AWS_HEADERS.DISALLOWED / AWS_HEADERS.READ_ONLY. */
    static FORBIDDEN = AWS_HEADERS.FORBIDDEN;
    /** @deprecated Use AWS_HEADERS.READ_ONLY['viewer-request']. */
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

    /** AWS Parity: disallowed headers are never exposed to edge functions, and functions can't add them. */
    public static isDisallowed(lowerKey: string): boolean {
        return (AWS_HEADERS.DISALLOWED as readonly string[]).includes(lowerKey)
            || AWS_HEADERS.DISALLOWED_PREFIXES.some(prefix => lowerKey.startsWith(prefix));
    }

    /** Returns a copy of an IFF header map without the headers AWS doesn't expose to edge functions. */
    public static withoutDisallowed(map: HeaderMap): HeaderMap {
        const visible: HeaderMap = {};
        for (const [key, values] of Object.entries(map)) {
            if (!HeaderManager.isDisallowed(key)) visible[key] = values;
        }
        return visible;
    }

    /**
     * Reconciles an edge function's header mutations against what it was given, enforcing the AWS
     * disallowed and per-event read-only header rules ("Restrictions on all edge functions", which
     * apply to both CloudFront Functions and Lambda@Edge). Violations are a 502 validation error in
     * strict mode and a warning otherwise.
     */
    public reconcile(mutated: HeaderMap, original: HeaderMap, hookType: string, strict = false, kind: 'lambda' | 'function' = 'lambda'): void {
        const violations: string[] = [];

        // 1. Disallowed headers can't be added (they are never exposed, so any presence is an addition)
        for (const key of Object.keys(mutated)) {
            if (HeaderManager.isDisallowed(key) && !original[key]) violations.push(`${key} inside ${hookType}: disallowed header`);
        }

        // 2. Read-only headers for this event can't be added, modified or deleted
        const readOnly: readonly string[] = [
            ...((AWS_HEADERS.READ_ONLY as Record<string, readonly string[]>)[hookType] || []),
            ...(hookType === 'viewer-response' && kind === 'lambda' ? AWS_HEADERS.LAMBDA_VIEWER_RESPONSE_READ_ONLY : [])
        ];
        for (const key of readOnly) {
            const m = mutated[key];
            const o = original[key];
            const changed = !!m !== !!o || (m && o && m[0].value !== o[0].value);
            if (changed) violations.push(`${key} inside ${hookType}: read-only header`);
        }

        // 3. A Lambda@Edge viewer request function can't add CloudFront-Viewer-Country
        if (hookType === 'viewer-request' && kind === 'lambda') {
            for (const key of AWS_HEADERS.VIEWER_REQUEST_CANNOT_ADD) {
                if (mutated[key] && !original[key]) violations.push(`${key} inside ${hookType}: can't be added by a viewer request function`);
            }
        }

        for (const detail of violations) {
            const msg = `Forbidden Header Mutation (${detail})`;
            if (strict) throw EdgeError.validation(kind, msg);
            console.warn(`\x1b[33m⚠️  [Fidelity Warning] ${msg}\x1b[0m`);
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
     * syncToRequest: Syncs Lambda@Edge-returned headers back to the live Node.js request.
     *
     * Implements the AWS **Exposure Boundary** contract:
     * > A Lambda function operates on a visibility window — the headers CloudFront exposed to it.
     * > It may add, modify, or delete headers within that window.
     * > Headers OUTSIDE the window were invisible to Lambda and must pass through untouched.
     *
     * Deletion semantics:
     *   - A header is deleted ONLY if it was within `exposedHeaders` AND is absent from `returnedHeaders`.
     *   - Headers outside the exposure window (e.g. internal Node.js headers the Lambda never saw)
     *     are preserved regardless of what the Lambda returned.
     *
     * @param req            - The live Node.js IncomingMessage object.
     * @param returnedHeaders - Headers returned by the Lambda function (IFF or plain map).
     * @param exposedHeaders  - Headers that were handed to the Lambda at invocation time (IFF).
     */
    public syncToRequest(req: any, returnedHeaders: Record<string, any>, exposedHeaders: Record<string, any>): void {
        const returned = this.normalizeHeaders(returnedHeaders);
        const exposed  = this.normalizeHeaders(exposedHeaders);

        // 1. Exposure Boundary Deletions:
        //    Only delete headers that were visible to Lambda AND are now absent from its return value.
        for (const lowerKey of Object.keys(exposed)) {
            if (!returned[lowerKey]) {
                delete req.headers[lowerKey];
            }
        }

        // 2. Upsert: add or overwrite any header the Lambda returned.
        for (const [lowerKey, values] of Object.entries(returned)) {
            const nodeVal = values.length === 1 ? values[0].value : values.map((v: HeaderValue) => v.value);
            req.headers[lowerKey] = nodeVal;
        }

        // 3. Rebuild rawHeaders for downstream proxy / logging fidelity.
        this._rebuildRawHeaders(req);
    }

    /**
     * injectHeaders: Additively merges headers into a live Node.js request.
     *
     * Used for call sites that are NOT Lambda return-value syncs — specifically:
     *   - Sticky header injection at request entry (debugging overrides)
     *   - CloudFront Function (CFF) intermediate request syncing
     *
     * This method NEVER deletes existing headers. It only adds or overwrites.
     *
     * @param req      - The live Node.js IncomingMessage object.
     * @param headers  - Headers to inject (IFF or plain map).
     * @param override - If false, existing headers are not overwritten (default: true).
     */
    public injectHeaders(req: any, headers: Record<string, any>, override = true): void {
        if (!headers) return;
        const toInject = this.normalizeHeaders(headers);

        for (const [lowerKey, values] of Object.entries(toInject)) {
            if (override || req.headers[lowerKey] === undefined) {
                const nodeVal = values.length === 1 ? values[0].value : values.map((v: HeaderValue) => v.value);
                req.headers[lowerKey] = nodeVal;
            }
        }

        this._rebuildRawHeaders(req);
    }

    /** Rebuilds the Node.js rawHeaders array from the current req.headers map. */
    private _rebuildRawHeaders(req: any): void {
        const raw: string[] = [];
        const current = this.normalizeHeaders(req.headers);
        for (const values of Object.values(current)) {
            (values as HeaderValue[]).forEach(v => raw.push(v.key, String(v.value)));
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

    /**
     * applyToResponse: The final step in the fidelity pipeline. 
     * Flattens the `headers` of a hook response (arrays, objects, {value}) and writes them
     * directly to the Node.js ServerResponse.
     */
    public static applyToResponse(res: any, responseData: any): void {
        // AWS Parity: only `headers` reaches the viewer. Other top-level fields on a response
        // record (id, type, uri, totalDurationMs...) are internal and must never become headers.
        if (responseData.headers) {
            const flat = HeaderManager.telemetryFlatten(responseData.headers);
            for (const [k, v] of Object.entries(flat)) {
                res.setHeader(k, v);
            }
        }
    }
}
