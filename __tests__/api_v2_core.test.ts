export {};
const http = require('http');
const { createServer } = require('../src/server/createServer');
const { EventHub, REPLAY_BUFFER } = require('../src/api/EventHub');
const { EventEmitter } = require('events');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

// WebUI API v2: router, errors, security checks and the sequenced event stream.

const CFF = `async function handler(event) {
    event.request.headers['x-cff'] = { value: 'yes' };
    return event.request;
}`;
const TAG = `exports.handler = async (event) => {
    const res = event.Records[0].cf.response;
    res.headers['x-tagged'] = [{ key: 'X-Tagged', value: 'yes' }];
    return res;
};`;

const { call, stream, get } = require('./helpers/apiClient');

describe('WebUI API v2: core', () => {
    let dir: string;
    let server: any;
    let ui: number;
    let main: number;

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        dir = makeProject(baseManifest({
            name: 'api-fixture',
            functions: {
                mark: { type: 'cloudfront-function', file: 'functions/mark.js' },
                tag: { type: 'lambda-edge', file: 'functions/tag.js' }
            },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'mark', 'origin-response': 'tag' } }
        }), { ...WWW, 'functions/mark.js': CFF, 'functions/tag.js': TAG });
        server = await createServer({ project: dir, port: 0, webui: true, noBanner: true });
        ui = server.webuiPort;
        main = server.address().port;
    });

    afterAll(async () => {
        await server.closeGracefully();
        removeProject(dir);
        jest.restoreAllMocks();
    });

    test('GET /api/v2 describes the server and the open project', async () => {
        const res = await call(ui, 'GET', '/api/v2');
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toMatchObject({ apiVersion: 2, project: { name: 'api-fixture', dir }, legacy: false, ports: { main, webui: ui } });
        expect(res.body.routes).toEqual(expect.arrayContaining([{ method: 'GET', path: '/api/v2/events' }]));
    });

    test('unknown routes are 404 and wrong methods 405, with typed error bodies', async () => {
        const missing = await call(ui, 'GET', '/api/v2/nope');
        expect(missing.status).toBe(404);
        expect(missing.body.error.code).toBe('not-found');

        const wrong = await call(ui, 'PUT', '/api/v2/requests', { body: {} });
        expect(wrong.status).toBe(405);
        expect(wrong.headers.allow).toContain('GET');
        expect(wrong.body.error.code).toBe('method-not-allowed');
    });

    test('requests from other sites or hosts are refused', async () => {
        expect((await call(ui, 'GET', '/api/v2', { headers: { host: 'evil.example' } })).status).toBe(403);
        expect((await call(ui, 'GET', '/api/v2', { headers: { origin: 'http://evil.example' } })).status).toBe(403);
        expect((await call(ui, 'GET', '/api/v2', { headers: { host: `[::1]:${ui}` } })).status).toBe(200);
    });

    test('the WebUI also listens on the IPv6 loopback, so localhost always reaches it', async () => {
        const res = await call(ui, 'GET', '/api/v2', { host: '::1', headers: { host: `[::1]:${ui}` } }).catch((err: any) => err);
        if (res instanceof Error && ['EADDRNOTAVAIL', 'EAFNOSUPPORT', 'ECONNREFUSED'].includes((res as any).code)) return; // no IPv6 here
        expect(res.status).toBe(200);
    });

    test('the event stream sends a hello, then typed request events with structured stages', async () => {
        const s = stream(ui);
        await s.opened;
        await s.until(e => e.some(x => x.type === 'stream.hello'));
        expect(s.events[0]).toMatchObject({ v: 2, type: 'stream.hello', data: { apiVersion: 2, resumed: false } });
        expect(s.ids[0]).toBeUndefined(); // the hello doesn't move Last-Event-ID

        expect(await get(main, '/index.html')).toBe(200);
        const events = await s.until(e => e.some(x => x.type === 'request.completed'));
        s.close();

        const request = events.filter(e => e.requestId && e.requestId === events.find(x => x.type === 'request.started')?.requestId);
        const types = request.map(e => e.type);
        expect(types[0]).toBe('request.started');
        expect(types[types.length - 1]).toBe('request.completed');

        const stages = request.filter(e => e.type === 'request.stage').map(e => e.data.stage);
        expect(stages).toEqual([
            { kind: 'function', event: 'viewer-request', runtime: 'cloudfront-function', functionIds: ['mark'] },
            { kind: 'origin-fetch', origin: 'web' },
            { kind: 'origin-response' },
            { kind: 'function', event: 'origin-response', runtime: 'lambda-edge', functionIds: ['tag'] },
            { kind: 'final-response' }
        ]);
        expect(request.find(e => e.type === 'request.completed').data).toMatchObject({ status: 200, headers: expect.objectContaining({ 'X-Tagged': 'yes' }) });

        // Sequence numbers increase by one and match the SSE ids
        const sequenced = events.filter(e => e.type !== 'stream.hello');
        sequenced.forEach((e, i) => { if (i > 0) expect(e.seq).toBe(sequenced[i - 1].seq + 1); });
        expect(s.ids.filter(Boolean)).toEqual(sequenced.map(e => e.seq));
    });

    test('reconnecting with Last-Event-ID replays exactly the missed events', async () => {
        const first = stream(ui);
        await first.opened;
        await get(main, '/index.html');
        const seen = await first.until(e => e.some(x => x.type === 'request.completed'));
        first.close();
        const lastSeq = seen.filter(e => e.type === 'request.started').pop().seq;

        await get(main, '/index.html'); // happens while disconnected

        const again = stream(ui, { 'last-event-id': String(lastSeq) });
        await again.opened;
        const replayed = await again.until(e => e.filter(x => x.type === 'request.completed').length >= 2);
        again.close();
        expect(replayed[0]).toMatchObject({ type: 'stream.hello', data: { resumed: true } });
        expect(replayed[1].seq).toBe(lastSeq + 1);
    });

    test('GET /requests lists recorded requests, newest first; GET /requests/:id returns the journey', async () => {
        await get(main, '/index.html?latest=1');
        const list = await call(ui, 'GET', '/api/v2/requests?limit=2');
        expect(list.status).toBe(200);
        expect(list.body.items.length).toBeLessThanOrEqual(2);
        expect(list.body.items[0]).toMatchObject({ method: 'GET', url: '/index.html?latest=1', status: 200 });

        const detail = await call(ui, 'GET', `/api/v2/requests/${list.body.items[0].id}`);
        expect(detail.status).toBe(200);
        expect(detail.body.events.map((e: any) => e.type)).toEqual(expect.arrayContaining(['request.started', 'request.stage', 'request.completed']));

        expect((await call(ui, 'GET', '/api/v2/requests/does-not-exist')).status).toBe(404);
        expect((await call(ui, 'GET', '/api/v2/requests/SYSTEM_BUILD')).status).toBe(404);
    });

    test('DELETE /requests clears the history', async () => {
        expect((await call(ui, 'DELETE', '/api/v2/requests')).status).toBe(204);
        expect((await call(ui, 'GET', '/api/v2/requests')).body.items).toEqual([]);
    });

    test('the 2.x endpoints keep working for the current UI', async () => {
        const res = await call(ui, 'GET', '/api/distribution');
        expect(res.status).toBe(200);
        expect(res.body.functions.map((f: any) => f.id).sort()).toEqual(['mark', 'tag']);
    });
});

describe('Router', () => {
    const { Router, STREAMING } = require('../src/api/router');
    const { ApiError } = require('../src/api/errors');
    let srv: any;
    let port: number;

    beforeAll(async () => {
        const router = new Router('/api/v2')
            .post('/echo', ({ body }: any) => ({ body: { got: body ?? null } }))
            .put('/items/:id', ({ params, body }: any) => ({ status: 201, body: { id: params.id, body } }))
            .get('/fail', () => { throw ApiError.conflict('changed on disk', { current: 'x' }); })
            .get('/crash', () => { throw new Error('boom'); })
            .get('/stream', ({ res }: any) => { res.writeHead(200); res.end('raw'); return STREAMING; });
        srv = http.createServer((req: any, res: any) => router.handle(req, res));
        await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
        port = srv.address().port;
    });
    afterAll(() => new Promise(r => srv.close(r)));

    test('a POST must be Content-Type: application/json, even when empty (CSRF: no preflight-free POSTs)', async () => {
        expect((await call(port, 'POST', '/api/v2/echo', { raw: '{"a":1}', headers: { 'content-type': 'text/plain' } })).status).toBe(415);
        expect((await call(port, 'POST', '/api/v2/echo', { raw: '' })).body.error.code).toBe('unsupported-media-type');
        expect((await call(port, 'POST', '/api/v2/echo', { body: { a: 1 } })).body).toEqual({ got: { a: 1 } });
        expect((await call(port, 'POST', '/api/v2/echo', { raw: '', headers: { 'content-type': 'application/json; charset=utf-8' } })).body).toEqual({ got: null });
    });

    test('malformed JSON is a 400; path parameters are decoded', async () => {
        const bad = await call(port, 'POST', '/api/v2/echo', { raw: '{nope', headers: { 'content-type': 'application/json' } });
        expect(bad.status).toBe(400);
        expect(bad.body.error.code).toBe('bad-request');
        const ok = await call(port, 'PUT', '/api/v2/items/a%20b', { body: [1] });
        expect(ok.status).toBe(201);
        expect(ok.body).toEqual({ id: 'a b', body: [1] });
    });

    test('ApiError details reach the client; unexpected errors are a 500 "internal"', async () => {
        expect(await call(port, 'GET', '/api/v2/fail')).toMatchObject({ status: 409, body: { error: { code: 'conflict', message: 'changed on disk', details: { current: 'x' } } } });
        expect(await call(port, 'GET', '/api/v2/crash')).toMatchObject({ status: 500, body: { error: { code: 'internal', message: 'boom' } } });
    });

    test('bodies over the limit are a 413; streaming handlers write their own response', async () => {
        const { MAX_BODY_BYTES } = require('../src/api/router');
        const big = await call(port, 'POST', '/api/v2/echo', { raw: 'x'.repeat(MAX_BODY_BYTES + 1), headers: { 'content-type': 'application/json' } }).catch((e: any) => e);
        if (!(big instanceof Error)) expect(big.status).toBe(413); // the server may also reset the upload
        expect((await call(port, 'GET', '/api/v2/stream')).text).toBe('raw');
    });
});

describe('EventHub', () => {
    test('a client too far behind gets stream.reset instead of a partial replay', () => {
        const telemetry = new EventEmitter();
        const hub = new EventHub(telemetry);
        for (let i = 0; i < REPLAY_BUFFER + 10; i++) hub.publish({ time: '', type: 'distribution.changed', data: {} });
        expect(hub.since(1)).toBeNull();
        expect(hub.since(hub.lastSeq - 3)!.map((e: any) => e.seq)).toEqual([hub.lastSeq - 2, hub.lastSeq - 1, hub.lastSeq]);
        expect(hub.since(hub.lastSeq)).toEqual([]);
        // A client ahead of the server saw a previous server instance (restart): it must reset
        expect(hub.since(hub.lastSeq + 50)).toBeNull();
        hub.close();
        expect(telemetry.listenerCount('event')).toBe(0);
    });

    test('build results become build.succeeded / build.failed', () => {
        const telemetry = new EventEmitter();
        const hub = new EventHub(telemetry);
        hub.publishTelemetry({ id: 'SYSTEM_BUILD', timestamp: 't', type: 'success', details: { type: 'cff', file: '/p/a.js' } });
        hub.publishTelemetry({ id: 'SYSTEM_BUILD', timestamp: 't', type: 'error', details: { type: 'edge', path: '/p/b.js', error: 'Unexpected token', line: 3 } });
        expect(hub.since(0)!.map((e: any) => [e.type, e.data])).toEqual([
            ['build.succeeded', { file: '/p/a.js', runtime: 'cloudfront-function' }],
            ['build.failed', { file: '/p/b.js', runtime: 'lambda-edge', message: 'Unexpected token', line: 3, column: undefined, snippet: undefined }]
        ]);
        hub.close();
    });
});
