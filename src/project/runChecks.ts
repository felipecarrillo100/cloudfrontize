import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer } from '../server/createServer';
import { CheckDefinition, ChecksSchema } from './checks';
import { resolveManifestPath } from './loadProject';

export const CHECKS_FILE = 'checks.json';

export interface CheckResult {
    name: string;
    passed: boolean;
    /** What didn't match, one line each. */
    failures: string[];
    status?: number;
}

const asList = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function send(port: number, check: CheckDefinition): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    const { method, path: urlPath, headers, body } = check.request;
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, method, path: urlPath, headers: { ...headers, ...(body !== undefined ? { 'content-length': String(Buffer.byteLength(body)) } : {}) } }, res => {
            const chunks: Buffer[] = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

/** Compares a response with a check's expectations. */
export function evaluate(check: CheckDefinition, res: { status: number; headers: http.IncomingHttpHeaders; body: string }): string[] {
    const want = check.expect;
    const failures: string[] = [];
    const header = (k: string) => {
        const v = res.headers[k.toLowerCase()];
        return Array.isArray(v) ? v.join(', ') : v;
    };
    if (want.status !== undefined && res.status !== want.status) failures.push(`status ${res.status}, expected ${want.status}`);
    for (const [k, v] of Object.entries(want.headers ?? {})) if (header(k) !== v) failures.push(`${k}: ${header(k) ?? '(absent)'}, expected "${v}"`);
    for (const [k, v] of Object.entries(want.headersContain ?? {})) if (!String(header(k) ?? '').includes(v)) failures.push(`${k} doesn't contain "${v}" (${header(k) ?? 'absent'})`);
    for (const k of want.headersAbsent ?? []) if (header(k) !== undefined) failures.push(`${k} should be absent (is "${header(k)}")`);
    for (const t of asList(want.bodyContains)) if (!res.body.includes(t)) failures.push(`body doesn't contain "${t}"`);
    for (const t of asList(want.bodyNotContains)) if (res.body.includes(t)) failures.push(`body contains "${t}"`);
    return failures;
}

/** The checks file of a project, or null when it has none. */
export function readChecks(projectDir: string): CheckDefinition[] | null {
    const file = path.join(projectDir, CHECKS_FILE);
    if (!fs.existsSync(file)) return null;
    return ChecksSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))).checks;
}

/**
 * Serves a project on a free port and runs its checks against it, like a viewer would. The server
 * is closed afterwards. Logging is quiet unless `verbose`.
 */
export async function runChecks(target: string, options: { checks?: CheckDefinition[]; verbose?: boolean; set?: string[] } = {}): Promise<CheckResult[]> {
    const dir = path.dirname(resolveManifestPath(target));
    const checks = options.checks ?? readChecks(dir);
    if (!checks) throw new Error(`${path.join(dir, CHECKS_FILE)} not found`);

    // Loopback only: the checks are this process's own requests
    const server = await createServer({ project: dir, port: 0, host: '127.0.0.1', noBanner: true, requestLogging: !!options.verbose, set: options.set });
    try {
        const port = (server.address() as { port: number }).port;
        const results: CheckResult[] = [];
        for (const check of checks) {
            try {
                const res = await send(port, check);
                const failures = evaluate(check, res);
                results.push({ name: check.name, passed: failures.length === 0, failures, status: res.status });
            } catch (err: any) {
                results.push({ name: check.name, passed: false, failures: [`request failed: ${err.message}`] });
            }
        }
        return results;
    } finally {
        await server.closeGracefully();
    }
}
