import http from 'http';
import { ApiError, ApiErrorBody } from './errors';

/** Request bodies above this size are refused (function sources and manifests are far smaller). */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export interface ApiContext {
    req: http.IncomingMessage;
    res: http.ServerResponse;
    url: URL;
    params: Record<string, string>;
    query: URLSearchParams;
    /** The parsed JSON body (undefined for GET/HEAD/DELETE without a body). */
    body: unknown;
}

export interface ApiResult {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
}

/** Returned by a handler that writes the response itself (the event stream). */
export const STREAMING = Symbol('streaming');

export type ApiHandler = (ctx: ApiContext) => ApiResult | typeof STREAMING | void | Promise<ApiResult | typeof STREAMING | void>;

interface Route {
    method: string;
    pattern: string;
    regex: RegExp;
    keys: string[];
    handler: ApiHandler;
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * A small JSON router for the WebUI API.
 *
 * Security: requests with a body must be `Content-Type: application/json`. A cross-site page can only
 * send that with a CORS preflight, which this API never answers, so it can't make changes even if the
 * Host/Origin checks were bypassed.
 */
export class Router {
    private routes: Route[] = [];

    constructor(private readonly prefix: string) {}

    add(method: string, pattern: string, handler: ApiHandler): this {
        const keys: string[] = [];
        const source = pattern.split('/').map(part => {
            if (part.startsWith(':')) { keys.push(part.slice(1)); return '([^/]+)'; }
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('/');
        this.routes.push({ method, pattern, regex: new RegExp(`^${source}/?$`), keys, handler });
        return this;
    }

    get(pattern: string, handler: ApiHandler) { return this.add('GET', pattern, handler); }
    post(pattern: string, handler: ApiHandler) { return this.add('POST', pattern, handler); }
    put(pattern: string, handler: ApiHandler) { return this.add('PUT', pattern, handler); }
    patch(pattern: string, handler: ApiHandler) { return this.add('PATCH', pattern, handler); }
    delete(pattern: string, handler: ApiHandler) { return this.add('DELETE', pattern, handler); }

    matches(url: string): boolean {
        const pathname = url.split('?')[0];
        return pathname === this.prefix || pathname.startsWith(this.prefix + '/');
    }

    /** Lists the routes, for the API index. */
    describe(): { method: string; path: string }[] {
        return this.routes.map(r => ({ method: r.method, path: this.prefix + r.pattern }));
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const url = new URL(req.url || '/', 'http://localhost');
            const relative = url.pathname.slice(this.prefix.length) || '/';
            const method = (req.method || 'GET').toUpperCase();

            const candidates = this.routes.map(r => ({ r, m: r.regex.exec(relative) })).filter(c => c.m);
            if (candidates.length === 0) throw ApiError.notFound(`No API route for ${url.pathname}`);
            const match = candidates.find(c => c.r.method === method || (method === 'HEAD' && c.r.method === 'GET'));
            if (!match) {
                res.setHeader('Allow', [...new Set(candidates.map(c => c.r.method))].join(', '));
                throw new ApiError(405, 'method-not-allowed', `${method} isn't supported for ${url.pathname}`);
            }

            const params: Record<string, string> = {};
            match.r.keys.forEach((key, i) => {
                try { params[key] = decodeURIComponent(match.m![i + 1]); } catch { throw ApiError.badRequest(`Malformed path parameter "${key}"`); }
            });

            const body = BODY_METHODS.has(method) ? await readJsonBody(req) : undefined;
            const result = await match.r.handler({ req, res, url, params, query: url.searchParams, body });
            if (result === STREAMING) return;
            send(res, result?.status ?? (result?.body === undefined ? 204 : 200), result?.body, result?.headers);
        } catch (err: any) {
            if (res.headersSent) { res.end(); return; }
            const apiError = err instanceof ApiError ? err : new ApiError(500, 'internal', err?.message || 'Internal error');
            const body: ApiErrorBody = { error: { code: apiError.code, message: apiError.message, ...(apiError.details !== undefined ? { details: apiError.details } : {}) } };
            send(res, apiError.status, body);
        }
    }
}

export function send(res: http.ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
    const common = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers };
    if (body === undefined) {
        res.writeHead(status, common);
        res.end();
        return;
    }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...common });
    res.end(JSON.stringify(body));
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw new ApiError(413, 'too-large', `Request bodies are limited to ${MAX_BODY_BYTES / 1024 / 1024} MB`);
        chunks.push(chunk);
    }
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    // POST is the one method a cross-site page can send without a preflight, so it always needs the
    // JSON content type (even when empty). PUT/PATCH/DELETE always get a preflight.
    if ((size > 0 || req.method === 'POST') && type !== 'application/json') {
        throw new ApiError(415, 'unsupported-media-type', 'Send requests as Content-Type: application/json');
    }
    if (size === 0) return undefined;
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (err: any) {
        throw ApiError.badRequest(`Body isn't valid JSON: ${err.message}`);
    }
}
