import { startServer, CloudFrontizeServer } from '../src';
import http from 'http';
import path from 'path';
import fs from 'fs';

// The Developer UI server: static assets, security checks, and the API v2 a 2.x setup gets.
const testDirBase = path.resolve('.tmp');

describe('Developer UI server (2.x setup)', () => {
    jest.setTimeout(30000);
    let server: CloudFrontizeServer;
    let port: number;
    let uiPort: number;
    const testDir = path.join(testDirBase, 'zzz_ui_test_' + Date.now());
    // Stub UI assets so the suite doesn't depend on a Vite build of ui-src
    const uiDir = path.join(testDir, '_ui');

    beforeAll(async () => {
        if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
        fs.writeFileSync(path.join(testDir, 'index.html'), 'Hello');
        fs.mkdirSync(path.join(uiDir, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(uiDir, 'index.html'), '<!doctype html><title>UI</title>');
        fs.writeFileSync(path.join(uiDir, 'assets', 'app.css'), 'body{}');
        fs.writeFileSync(path.join(uiDir, 'assets', 'codicon.ttf'), 'font');

        server = startServer({ port: 0, webui: true, uiDir, directory: testDir, noBanner: true }) as CloudFrontizeServer;
        await server.ready;
        port = (server.address() as any).port;
        uiPort = server.webuiPort!;
    });

    afterAll(async () => {
        if (server) await server.closeGracefully();
        if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    });

    const request = (opts: http.RequestOptions, body?: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> =>
        new Promise((resolve, reject) => {
            const r = http.request({ host: '127.0.0.1', port: uiPort, ...opts }, (res) => {
                let text = '';
                res.on('data', c => { text += c; });
                res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text }));
            });
            r.on('error', reject);
            r.end(body);
        });

    test('serves the UI and its assets with their content types', async () => {
        const index = await request({ path: '/' });
        expect(index.status).toBe(200);
        expect(index.headers['content-type']).toBe('text/html');
        expect((await request({ path: '/assets/app.css' })).headers['content-type']).toBe('text/css');
        expect((await request({ path: '/assets/codicon.ttf' })).headers['content-type']).toBe('font/ttf');
    });

    test('never serves files outside the UI directory', async () => {
        // Node sends the path verbatim, so `..` reaches the server un-normalized (browsers would collapse it)
        expect((await request({ path: '/../index.html' })).status).toBe(404);
    });

    test('the 2.x UI endpoints are gone', async () => {
        for (const p of ['/events', '/api/distribution', '/api/sticky', '/api/detail/x', '/api/hooks/control', '/api/open-editor?path=/etc/passwd', '/api/production-code?id=x']) {
            expect([p, (await request({ path: p })).status]).toEqual([p, 404]);
        }
    });

    test('rejects cross-site requests (foreign Origin), even simple ones', async () => {
        const res = await request({ method: 'PUT', path: '/api/v2/viewer/simulation', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' } },
            JSON.stringify({ requestHeaders: { 'x-pwned': 'yes' } }));
        expect(res.status).toBe(403);
        const sim = JSON.parse((await request({ path: '/api/v2/viewer/simulation' })).text);
        expect(sim.requestHeaders['x-pwned']).toBeUndefined();
    });

    test('rejects a foreign Host header (DNS rebinding)', async () => {
        expect((await request({ path: '/api/v2/distribution', headers: { Host: `attacker.example:${uiPort}` } })).status).toBe(403);
    });

    test('only opens loaded functions in the editor', async () => {
        const res = await request({ method: 'POST', path: '/api/v2/functions/..%2F..%2Fetc%2Fpasswd/open-in-editor', headers: { 'Content-Type': 'application/json' } }, '{}');
        expect(res.status).toBe(404);
    });

    test('a 2.x setup sets the viewer simulation for the session, and it applies to traffic', async () => {
        const put = await request({ method: 'PUT', path: '/api/v2/viewer/simulation', headers: { 'Content-Type': 'application/json' } },
            JSON.stringify({ requestHeaders: { 'X-Sticky-Test': 'Active' }, responseHeaders: { 'X-Mock-Cache': 'HIT' } }));
        expect(put.status).toBe(204);
        const sim = JSON.parse((await request({ path: '/api/v2/viewer/simulation' })).text);
        expect(sim).toEqual({ source: 'session', requestHeaders: { 'X-Sticky-Test': 'Active' }, responseHeaders: { 'X-Mock-Cache': 'HIT' } });

        const res = await new Promise<http.IncomingMessage>(resolve => http.get(`http://127.0.0.1:${port}/`, r => { r.resume(); resolve(r); }));
        expect(res.headers['x-mock-cache']).toBe('HIT');

        const bad = await request({ method: 'PUT', path: '/api/v2/viewer/simulation', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ requestHeaders: { a: 1 } }));
        expect(bad.status).toBe(400);
    });

    test('recorded traffic is available as v2 journeys', async () => {
        await new Promise<void>(resolve => http.get(`http://127.0.0.1:${port}/forensic-test`, r => { r.resume(); r.on('end', () => resolve()); }));
        const list = JSON.parse((await request({ path: '/api/v2/requests?limit=5' })).text);
        const entry = list.items.find((r: any) => r.url === '/forensic-test');
        expect(entry).toBeDefined();
        const detail = JSON.parse((await request({ path: `/api/v2/requests/${entry.id}` })).text);
        expect(detail.events[0].type).toBe('request.started');
    });
});
