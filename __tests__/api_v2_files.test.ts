export {};
const fs = require('fs');
const path = require('path');
const { createServer } = require('../src/server/createServer');
const { revisionOf } = require('../src/project/revision');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');
const { call } = require('./helpers/apiClient');

// WebUI API v2: functions (source, create, rename, attach, delete), key value stores and viewer headers.

const PROBE = (label: string) => `exports.handler = async (event) => {
    const req = event.Records[0].cf.request;
    const sim = req.headers['x-sim'] ? req.headers['x-sim'][0].value : '-';
    return { status: '200', headers: { 'x-probe': [{ key: 'X-Probe', value: '${label}' }], 'x-sim': [{ key: 'X-Sim', value: sim }] }, body: '${label}' };
};
`;
const SPARE = `async function handler(event) { return event.request; }
`;

describe('WebUI API v2: functions and project files', () => {
    let dir: string;
    let server: any;
    let ui: number;
    let main: number;
    const manifest = () => JSON.parse(fs.readFileSync(path.join(dir, 'cloudfrontize.json'), 'utf8'));
    const api = (method: string, p: string, body?: any) => call(ui, method, `/api/v2${p}`, body !== undefined ? { body } : {});
    const fnInfo = async (id: string) => (await api('GET', `/functions/${id}`)).body;

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        dir = makeProject(baseManifest({
            name: 'files',
            functions: {
                probe: { type: 'lambda-edge', file: 'functions/lambda-edge/origin-request.probe.js' },
                spare: { type: 'cloudfront-function', file: 'functions/cloudfront/viewer-request.spare.js' }
            },
            defaultBehavior: { origin: 'web', functions: { 'origin-request': 'probe' } },
            behaviors: [{ pathPattern: '/admin/*', origin: 'web' }]
        }), {
            ...WWW,
            'origins/www/admin/index.html': 'admin',
            'functions/lambda-edge/origin-request.probe.js': PROBE('v1'),
            'functions/cloudfront/viewer-request.spare.js': SPARE
        });
        server = await createServer({ project: dir, port: 0, webui: true, noBanner: true });
        ui = server.webuiPort;
        main = server.address().port;
    });

    afterAll(async () => {
        await server.closeGracefully();
        removeProject(dir);
        jest.restoreAllMocks();
    });

    describe('reading', () => {
        test('GET /functions lists every function with where it runs and its build state', async () => {
            const res = await api('GET', '/functions');
            expect(res.status).toBe(200);
            const byId = Object.fromEntries(res.body.items.map((f: any) => [f.id, f]));
            expect(byId.probe).toMatchObject({
                type: 'lambda-edge', runtime: 'nodejs22.x', file: 'functions/lambda-edge/origin-request.probe.js',
                attachments: [{ behavior: 'default', event: 'origin-request' }], disabled: false, build: { status: 'ok' }
            });
            expect(byId.spare).toMatchObject({ type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', attachments: [], build: { status: 'unused' } });
            expect(res.body.revision).toBe(revisionOf(fs.readFileSync(path.join(dir, 'cloudfrontize.json'))));
        });

        test('GET /functions/:id includes the source and its revision', async () => {
            const info = await fnInfo('probe');
            expect(info.source).toEqual({ content: PROBE('v1'), revision: revisionOf(PROBE('v1')) });
            expect((await api('GET', '/functions/nope')).status).toBe(404);
        });
    });

    describe('saving source', () => {
        test('needs the revision it edited; a stale one gets the current content back (409)', async () => {
            expect((await api('PUT', '/functions/probe/source', { content: 'x' })).status).toBe(428);
            const stale = await api('PUT', '/functions/probe/source', { content: 'x', revision: 'stale' });
            expect(stale.status).toBe(409);
            expect(stale.body.error.details).toEqual({ revision: revisionOf(PROBE('v1')), content: PROBE('v1') });
        });

        test('a save is rebuilt by the emulator, reported, and serves traffic right away', async () => {
            const { source } = await fnInfo('probe');
            const res = await api('PUT', '/functions/probe/source', { content: PROBE('v2'), revision: source.revision });
            expect(res.status).toBe(200);
            expect(res.body.revision).toBe(revisionOf(PROBE('v2')));
            expect(res.body.build).toMatchObject({ status: 'ok', checkedBy: 'runtime', errors: [], sizeLimit: null, size: Buffer.byteLength(PROBE('v2')) });
            expect((await call(main, 'GET', '/index.html')).headers['x-probe']).toBe('v2');
        });

        test('a syntax error comes back with its line, and the function reports the error until fixed', async () => {
            const { source } = await fnInfo('probe');
            const broken = "exports.handler = async (event) => {\n    return event.Records[0].cf.request\n    oops(;\n};\n";
            const res = await api('PUT', '/functions/probe/source', { content: broken, revision: source.revision });
            expect(res.body.build.status).toBe('error');
            expect(res.body.build.checkedBy).toBe('runtime');
            expect(res.body.build.errors[0]).toMatchObject({ line: 3 });
            expect((await fnInfo('probe')).build).toMatchObject({ status: 'error', error: { line: 3 } });
            expect((await call(main, 'GET', '/index.html')).status).toBe(502);

            const fixed = await api('PUT', '/functions/probe/source', { content: PROBE('v3'), revision: res.body.revision });
            expect(fixed.body.build.status).toBe('ok');
            expect((await fnInfo('probe')).build.status).toBe('ok');
        });

        test('a Lambda@Edge file without exports.handler is a build error', async () => {
            const { source } = await fnInfo('probe');
            const res = await api('PUT', '/functions/probe/source', { content: 'exports.other = 1;\n', revision: source.revision });
            expect(res.body.build).toMatchObject({ status: 'error', errors: [expect.objectContaining({ message: expect.stringContaining('exports no handler') })] });
            await api('PUT', '/functions/probe/source', { content: PROBE('v3'), revision: res.body.revision });
        });

        test('a function no behavior uses is checked statically (runtime rules, 10 KB limit)', async () => {
            const { source } = await fnInfo('spare');
            const res = await api('PUT', '/functions/spare/source', { content: 'async function handler(event) { eval("1"); return event.request; }\n', revision: source.revision });
            expect(res.body.build).toMatchObject({ status: 'error', checkedBy: 'static', sizeLimit: 10240 });
            expect(res.body.build.errors[0].message).toMatch(/eval/);

            const big = `async function handler(event) { return event.request; }\n// ${'x'.repeat(11000)}\n`;
            const res2 = await api('PUT', '/functions/spare/source', { content: big, revision: res.body.revision });
            expect(res2.body.build.status).toBe('ok');
            expect(res2.body.build.warnings).toEqual([expect.objectContaining({ message: expect.stringContaining('10 KB') })]);
            await api('PUT', '/functions/spare/source', { content: SPARE, revision: res2.body.revision });
        });
    });

    describe('creating, attaching, renaming and deleting', () => {
        test('POST /functions creates the file by convention with starter code, and attaches it', async () => {
            const res = await api('POST', '/functions', { id: 'add-index', type: 'cloudfront-function', event: 'viewer-request', behavior: '/admin/*' });
            expect(res.status).toBe(201);
            const file = 'functions/cloudfront/viewer-request.add-index.js';
            expect(res.body.function).toMatchObject({ id: 'add-index', file, runtime: 'cloudfront-js-2.0', attachments: [{ behavior: '/admin/*', event: 'viewer-request' }], build: { status: 'ok' } });
            expect(res.body.build).toMatchObject({ status: 'ok', checkedBy: 'static' });
            expect(fs.readFileSync(path.join(dir, file), 'utf8')).toContain('async function handler(event)');
            expect(manifest().functions['add-index']).toEqual({ type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', file });
            expect(manifest().behaviors[0].functions).toEqual({ 'viewer-request': 'add-index' });
            // The starter passes requests through
            expect((await call(main, 'GET', '/admin/index.html')).status).toBe(200);
        });

        test('AWS rules are checked: a CloudFront Function can\'t run on an origin event, and nothing is left behind', async () => {
            const res = await api('POST', '/functions', { id: 'wrong', type: 'cloudfront-function', event: 'origin-request', behavior: 'default', replace: true });
            expect(res.status).toBe(422);
            expect(res.body.error.code).toBe('invalid-manifest');
            expect(fs.existsSync(path.join(dir, 'functions/cloudfront/origin-request.wrong.js'))).toBe(false);
            expect(manifest().functions.wrong).toBeUndefined();
        });

        test('an occupied slot, a duplicate id and a bad id are refused', async () => {
            const taken = await api('POST', '/functions', { id: 'other', type: 'lambda-edge', event: 'origin-request', behavior: 'default' });
            expect(taken.status).toBe(409);
            expect(fs.existsSync(path.join(dir, 'functions/lambda-edge/origin-request.other.js'))).toBe(false);
            expect((await api('POST', '/functions', { id: 'probe', type: 'lambda-edge', event: 'origin-request' })).status).toBe(409);
            expect((await api('POST', '/functions', { id: '../evil', type: 'lambda-edge', event: 'origin-request' })).status).toBe(400);
        });

        test('attaching checks the AWS combination rules (no CloudFront Function + Lambda@Edge on viewer events)', async () => {
            const lae = await api('PUT', '/behaviors/default/functions/viewer-response', { function: 'probe' });
            expect(lae.status).toBe(200); // Lambda@Edge on viewer-response: allowed

            const mixed = await api('PUT', '/behaviors/default/functions/viewer-request', { function: 'spare' });
            expect(mixed.status).toBe(422);
            expect(mixed.body.error.details.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', path: expect.stringContaining('/defaultBehavior/functions') })]));
            expect(manifest().defaultBehavior.functions['viewer-request']).toBeUndefined();

            expect((await api('DELETE', '/behaviors/default/functions/viewer-response')).status).toBe(200);
            expect((await api('PUT', '/behaviors/default/functions/viewer-request', { function: 'nope' })).status).toBe(404);
        });

        test('attaching works where AWS allows it, by path pattern', async () => {
            const res = await api('PUT', `/behaviors/${encodeURIComponent('/admin/*')}/functions/origin-request`, { function: 'probe' });
            expect(res.status).toBe(200);
            expect(manifest().behaviors[0].functions).toEqual({ 'viewer-request': 'add-index', 'origin-request': 'probe' });
            expect((await call(main, 'GET', '/admin/index.html')).headers['x-probe']).toBe('v3');

            const detach = await api('DELETE', `/behaviors/${encodeURIComponent('/admin/*')}/functions/origin-request`);
            expect(detach.status).toBe(200);
            expect(manifest().behaviors[0].functions).toEqual({ 'viewer-request': 'add-index' });
            expect((await api('DELETE', `/behaviors/${encodeURIComponent('/admin/*')}/functions/origin-request`)).status).toBe(404);
            expect((await api('PUT', `/behaviors/${encodeURIComponent('/nope/*')}/functions/origin-request`, { function: 'probe' })).status).toBe(404);
        });

        test('PATCH renames a function: its id everywhere, and its conventional file', async () => {
            const res = await api('PATCH', '/functions/add-index', { id: 'index-adder' });
            expect(res.status).toBe(200);
            expect(res.body.function).toMatchObject({ id: 'index-adder', file: 'functions/cloudfront/viewer-request.index-adder.js' });
            expect(fs.existsSync(path.join(dir, 'functions/cloudfront/viewer-request.add-index.js'))).toBe(false);
            expect(fs.existsSync(path.join(dir, 'functions/cloudfront/viewer-request.index-adder.js'))).toBe(true);
            expect(manifest().behaviors[0].functions['viewer-request']).toBe('index-adder');
            expect(Object.keys(manifest().functions)).toEqual(['probe', 'spare', 'index-adder']);
        });

        test('PATCH changes the runtime; an invalid change is refused and the file stays', async () => {
            const res = await api('PATCH', '/functions/spare', { runtime: 'cloudfront-js-1.0' });
            expect(res.status).toBe(200);
            expect(manifest().functions.spare.runtime).toBe('cloudfront-js-1.0');
            const bad = await api('PATCH', '/functions/spare', { id: 'spare2', keyValueStore: 'missing-store' });
            expect(bad.status).toBe(422);
            expect(fs.existsSync(path.join(dir, 'functions/cloudfront/viewer-request.spare.js'))).toBe(true);
            expect(manifest().functions.spare).toBeDefined();
        });

        test('DELETE /functions/:id removes it from the project, and its file on request', async () => {
            const res = await api('DELETE', '/functions/index-adder?deleteFile=true');
            expect(res.status).toBe(200);
            expect(manifest().functions['index-adder']).toBeUndefined();
            expect(manifest().behaviors[0].functions).toEqual({});
            expect(fs.existsSync(path.join(dir, 'functions/cloudfront/viewer-request.index-adder.js'))).toBe(false);
        });
    });

    describe('key value stores', () => {
        test('create, read, refuse invalid content, save', async () => {
            const created = await api('POST', '/kvs', { id: 'redirects' });
            expect(created.status).toBe(201);
            expect(created.body).toMatchObject({ id: 'redirects', file: 'kvs/redirects.json', keyCount: 0, usedBy: [] });

            const store = (await api('GET', '/kvs/redirects')).body;
            const bad = await api('PUT', '/kvs/redirects', { content: '{"data": "nope"}', revision: store.source.revision });
            expect(bad.status).toBe(422);
            expect(bad.body.error.code).toBe('invalid-kvs');

            const content = JSON.stringify({ data: [{ key: '/a', value: '1' }, { key: '/b', value: '2' }] });
            const ok = await api('PUT', '/kvs/redirects', { content, revision: store.source.revision });
            expect(ok.status).toBe(200);
            expect(ok.body.keyCount).toBe(2);
            expect((await api('GET', '/kvs')).body.items).toEqual([expect.objectContaining({ id: 'redirects', keyCount: 2 })]);
            expect((await api('POST', '/kvs', { id: 'redirects' })).status).toBe(409);
        });
    });

    describe('viewer headers', () => {
        test('a project without a file gets config/headers.json; invalid content is refused', async () => {
            expect((await api('GET', '/viewer/headers')).body).toEqual({ file: null, content: null, revision: null });
            const bad = await api('PUT', '/viewer/headers', { content: '{"X-Sim": 5}', revision: null });
            expect(bad.status).toBe(422);
            expect(bad.body.error.code).toBe('invalid-viewer-headers');

            const res = await api('PUT', '/viewer/headers', { content: '{\n  "X-Sim": "from-api"\n}\n', revision: null });
            expect(res.status).toBe(200);
            expect(res.body.file).toBe('config/headers.json');
            expect(manifest().viewer).toEqual({ headers: 'config/headers.json' });
            expect((await call(main, 'GET', '/index.html')).headers['x-sim']).toBe('from-api');

            const again = await api('GET', '/viewer/headers');
            expect(again.body).toMatchObject({ file: 'config/headers.json', content: '{\n  "X-Sim": "from-api"\n}\n' });
            expect((await api('PUT', '/viewer/headers', { content: '{}', revision: null })).status).toBe(409);
        });
    });
});
