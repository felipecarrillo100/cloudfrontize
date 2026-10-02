import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createProject } from '../project/create';
import { ProjectExistsError } from '../project/errors';
import { MANIFEST_FILE } from '../project/loadProject';
import { forgetRecent, listRecent } from '../project/recent';
import { listTemplates } from '../project/templates';
import { INVOKE_HEADER } from '../server/invoke';
import { ApiHost, mapErrors, objectBody } from './context';
import { ApiError } from './errors';
import { EVENTS_VERSION, toApiEvent } from './events';
import type { Router } from './router';

const MAX_ENTRIES = 2000;
/** Response bodies returned by /invoke are capped (the full body still reaches the client of a real request). */
const MAX_INVOKE_BODY = 1024 * 1024;
const INVOKE_TIMEOUT_MS = 70_000; // above the 60 s Lambda@Edge runaway guard
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const realpath = (p: string) => { try { return fs.realpathSync(p); } catch { return null; } };
const inside = (root: string, target: string) => target === root || target.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
const isFilesystemRoot = (p: string) => path.parse(p).root === p;

/**
 * Folders the WebUI may browse: your home folder, the folder CloudFrontize was started in, and the
 * folder containing the open project. Never a whole drive, even when started from one.
 */
export function browseRoots(host: ApiHost): string[] {
    const project = host.runtime().project;
    const candidates = [os.homedir(), process.cwd(), ...(project ? [path.dirname(project.dir)] : [])];
    const roots: string[] = [];
    for (const c of candidates) {
        const real = realpath(c);
        if (real && !isFilesystemRoot(real) && !roots.some(r => inside(r, real))) {
            // A broader root replaces narrower ones already listed
            for (let i = roots.length - 1; i >= 0; i--) if (inside(real, roots[i])) roots.splice(i, 1);
            roots.push(real);
        }
    }
    return roots;
}

/** Resolves a folder the client asked for; 403 outside the browse roots. */
function allowedFolder(host: ApiHost, requested: string): { real: string; roots: string[] } {
    if (!path.isAbsolute(requested)) throw ApiError.badRequest('"path" must be absolute');
    const roots = browseRoots(host);
    const real = realpath(requested);
    if (!real) throw ApiError.notFound(`${requested} doesn't exist`);
    if (!roots.some(r => inside(r, real))) throw new ApiError(403, 'outside-roots', 'Only folders inside your home folder, the start folder or the open project\'s folder can be browsed', { roots });
    return { real, roots };
}

const isTextual = (type: string) => /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded)|[^;]*\+(json|xml))/i.test(type);

/** Folder browsing, recent projects, project creation and test requests. */
export function registerWorkspaceRoutes(router: Router, host: ApiHost): void {
    // ---------- Folder browsing (for Open / New project dialogs) ----------

    router.get('/fs/roots', () => ({ body: { roots: browseRoots(host), home: realpath(os.homedir()) } }));

    // Lists the folders in a folder (files aren't listed); `isProject` marks folders with a cloudfrontize.json
    router.get('/fs/list', ({ query }) => {
        const roots0 = browseRoots(host);
        const requested = query.get('path') ?? roots0[0];
        if (!requested) throw new ApiError(403, 'outside-roots', 'No folder can be browsed');
        const { real, roots } = allowedFolder(host, requested);
        if (!fs.statSync(real).isDirectory()) throw ApiError.badRequest(`${requested} isn't a folder`);
        const showHidden = query.get('hidden') === 'true';

        let dirents: fs.Dirent[];
        try {
            dirents = fs.readdirSync(real, { withFileTypes: true });
        } catch (err: any) {
            throw new ApiError(403, 'unreadable', `Can't read ${real}: ${err.code ?? err.message}`);
        }
        const entries: { name: string; path: string; isProject: boolean; hidden: boolean }[] = [];
        for (const d of dirents) {
            if (!showHidden && d.name.startsWith('.')) continue;
            const full = path.join(real, d.name);
            let isDir = d.isDirectory();
            if (d.isSymbolicLink()) { try { isDir = fs.statSync(full).isDirectory(); } catch { isDir = false; } }
            if (!isDir) continue;
            entries.push({ name: d.name, path: full, isProject: fs.existsSync(path.join(full, MANIFEST_FILE)), hidden: d.name.startsWith('.') });
        }
        entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        const parent = roots.includes(real) ? null : path.dirname(real);
        return {
            body: {
                path: real,
                parent,
                isProject: fs.existsSync(path.join(real, MANIFEST_FILE)),
                entries: entries.slice(0, MAX_ENTRIES),
                truncated: entries.length > MAX_ENTRIES,
                roots
            }
        };
    });

    // ---------- Recent projects ----------

    router.get('/projects/recent', () => ({ body: { items: listRecent() } }));

    router.delete('/projects/recent', ({ query }) => {
        const dir = query.get('dir');
        if (!dir) throw ApiError.badRequest('Pass ?dir=<project folder>');
        if (!forgetRecent(dir)) throw ApiError.notFound(`${dir} isn't in the recent projects`);
        return {};
    });

    // ---------- New project ----------

    router.get('/templates', () => ({ body: { items: listTemplates() } }));

    // Creates a project folder with a manifest, a local origin and a starter page, then opens it
    router.post('/projects', async ({ body }) => {
        const input = objectBody(body, 'Send { "dir": "<absolute folder>", "name": "<project name>", "origin"?: {...}, "open"?: true }');
        if (typeof input.dir !== 'string' || !path.isAbsolute(input.dir)) throw ApiError.badRequest('"dir" must be an absolute path');
        if (typeof input.name !== 'string' || !input.name.trim()) throw ApiError.badRequest('"name" is required');
        if (input.origin !== undefined && (typeof input.origin !== 'object' || Array.isArray(input.origin))) throw ApiError.badRequest('"origin" must be an object');
        const template = typeof input.template === 'string' ? input.template : 'empty';
        if (!listTemplates().some(t => t.id === template)) throw ApiError.badRequest(`Unknown template "${template}"`);

        // The folder may not exist yet; its parent must, inside the browse roots
        allowedFolder(host, path.dirname(path.resolve(input.dir)));
        let created;
        try {
            created = await mapErrors(async () => createProject({ dir: input.dir, name: input.name.trim(), origin: input.origin, template }));
        } catch (err) {
            if (err instanceof ProjectExistsError) throw ApiError.conflict(err.message, { dir: err.dir });
            throw err;
        }
        if (input.open !== false) await mapErrors(() => host.projects().openProject(created.dir));
        return { status: 201, body: { dir: created.dir, manifestPath: created.manifestPath, opened: input.open !== false } };
    });

    // ---------- Test requests (the Viewer node's "Send a test request") ----------

    // Sends a request through the distribution like a viewer would, and returns the response and its journey
    router.post('/invoke', async ({ body }) => {
        const input = objectBody(body, 'Send { "path": "/…", "method"?, "headers"?, "body"?, "bodyEncoding"?: "text" | "base64" }');
        const method = String(input.method ?? 'GET').toUpperCase();
        if (!METHODS.includes(method)) throw ApiError.badRequest(`"method" must be one of ${METHODS.join(', ')}`);
        if (typeof input.path !== 'string' || !input.path.startsWith('/')) throw ApiError.badRequest('"path" must start with "/"');
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(input.headers ?? {})) {
            if (typeof v !== 'string') throw ApiError.badRequest(`Header "${k}" must be a string`);
            if (k.toLowerCase() === INVOKE_HEADER) continue;
            headers[k] = v;
        }
        const payload = input.body === undefined || input.body === null ? undefined
            : Buffer.from(String(input.body), input.bodyEncoding === 'base64' ? 'base64' : 'utf8');

        const requestId = crypto.randomBytes(4).toString('hex');
        const port = host.ports().main;
        const started = Date.now();
        const response = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
            const req = http.request({
                host: '127.0.0.1', port, method, path: input.path,
                headers: { host: `localhost:${port}`, ...headers, [INVOKE_HEADER]: requestId, ...(payload ? { 'content-length': String(payload.length) } : {}) },
                timeout: INVOKE_TIMEOUT_MS
            }, res => {
                const chunks: Buffer[] = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
                res.on('error', reject);
            });
            req.on('timeout', () => req.destroy(new Error(`No response within ${INVOKE_TIMEOUT_MS / 1000}s`)));
            req.on('error', reject);
            if (payload) req.write(payload);
            req.end();
        }).catch((err: Error) => { throw new ApiError(502, 'invoke-failed', `The test request failed: ${err.message}`); });

        const type = String(response.headers['content-type'] ?? '');
        const slice = response.body.subarray(0, MAX_INVOKE_BODY);
        const asText = isTextual(type) || (type === '' && !slice.includes(0));
        const journey = host.telemetry.getById(requestId).map(toApiEvent).filter(Boolean).map(e => ({ v: EVENTS_VERSION, ...e }));
        return {
            body: {
                requestId,
                status: response.status,
                headers: response.headers,
                body: asText ? slice.toString('utf8') : slice.toString('base64'),
                bodyEncoding: asText ? 'text' : 'base64',
                bodySize: response.body.length,
                bodyTruncated: response.body.length > MAX_INVOKE_BODY,
                durationMs: Date.now() - started,
                journey
            }
        };
    });
}
