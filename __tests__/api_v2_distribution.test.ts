export {};
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../src/server/createServer');
const { startServer } = require('../src/index');
const { EdgeRunner } = require('../src/edgeRunner');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');
const { call } = require('./helpers/apiClient');

// WebUI API v2: the distribution overview (projects and 2.x setups) and function switches.

const PASS = `exports.handler = async (e) => e.Records[0].cf.request;`;
const TAG = `exports.handler = async (e) => { const r = e.Records[0].cf.response; r.headers['x-tag'] = [{ key: 'X-Tag', value: 'on' }]; return r; };`;

describe('GET /api/v2/distribution and POST /api/v2/controls', () => {
    let dir: string;
    let server: any;
    let ui: number;
    const api = (method: string, p: string, body?: any) => call(ui, method, `/api/v2${p}`, body !== undefined ? { body } : {});

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        dir = makeProject(baseManifest({
            name: 'dist',
            origins: [{ id: 'web', type: 'local', path: 'origins/www' }, { id: 'assets', type: 's3', bucket: 'assets-bucket', region: 'eu-west-1', credentials: { profile: 'dev' } }],
            functions: {
                pass: { type: 'lambda-edge', file: 'functions/pass.js' },
                tag: { type: 'lambda-edge', file: 'functions/tag.js' }
            },
            defaultBehavior: { origin: 'web', functions: { 'origin-response': 'tag' } },
            behaviors: [{ pathPattern: '/api/*', origin: 'assets', functions: { 'viewer-request': 'pass' } }]
        }), { ...WWW, 'functions/pass.js': PASS, 'functions/tag.js': TAG });
        server = await createServer({ project: dir, port: 0, webui: true, noBanner: true });
        ui = server.webuiPort;
    });

    afterAll(async () => {
        await server.closeGracefully();
        removeProject(dir);
        jest.restoreAllMocks();
    });

    test('a project: functions, behaviors in match order (default last), origins without credentials', async () => {
        const res = await api('GET', '/distribution');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ mode: 'project', project: { name: 'dist', dir } });
        expect(res.body.behaviors).toEqual([
            { key: '/api/*', pathPattern: '/api/*', origin: 'assets', functions: { 'viewer-request': 'pass' } },
            { key: 'default', pathPattern: null, origin: 'web', functions: { 'origin-response': 'tag' } }
        ]);
        expect(res.body.functions.map((f: any) => [f.id, f.type, f.disabled, f.build.status])).toEqual([
            ['pass', 'lambda-edge', false, 'ok'], ['tag', 'lambda-edge', false, 'ok']
        ]);
        const s3 = res.body.origins.find((o: any) => o.id === 'assets');
        expect(s3.credentials).toEqual({ configured: true });
        expect(JSON.stringify(res.body)).not.toContain('dev');
    });

    test('controls disable, enable and isolate functions, and reset', async () => {
        const main = server.address().port;
        expect((await call(main, 'GET', '/index.html')).headers['x-tag']).toBe('on');

        const off = await api('POST', '/controls', { action: 'disable', function: 'tag' });
        expect(off.body.functions.find((f: any) => f.id === 'tag').disabled).toBe(true);
        expect((await call(main, 'GET', '/index.html')).headers['x-tag']).toBeUndefined();

        await api('POST', '/controls', { action: 'enable', function: 'tag' });
        expect((await call(main, 'GET', '/index.html')).headers['x-tag']).toBe('on');

        const iso = await api('POST', '/controls', { action: 'isolate', function: 'pass' });
        expect(iso.body.functions.map((f: any) => [f.id, f.disabled])).toEqual([['pass', false], ['tag', true]]);
        const reset = await api('POST', '/controls', { action: 'reset' });
        expect(reset.body.functions.every((f: any) => !f.disabled)).toBe(true);

        expect((await api('POST', '/controls', { action: 'explode' })).status).toBe(400);
        expect((await api('POST', '/controls', { action: 'disable', function: 'nope' })).status).toBe(404);
    });
});

describe('GET /api/v2/distribution for a 2.x setup', () => {
    test('hooks appear on the default behavior; the project routes say there is no project', async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-legacy-'));
        fs.mkdirSync(path.join(tmp, 'www'));
        fs.writeFileSync(path.join(tmp, 'www', 'index.html'), 'x');
        fs.mkdirSync(path.join(tmp, 'edge'));
        fs.writeFileSync(path.join(tmp, 'edge', 'origin-response.tag.js'), `exports.hookType = 'origin-response';\n${TAG}`);
        const edgeRunner = new EdgeRunner(path.join(tmp, 'edge'), { watch: false });
        edgeRunner.load();
        const server = startServer({ directory: path.join(tmp, 'www'), port: 0, webui: true, edgeRunner, noBanner: true });
        await server.ready;
        try {
            const ui = server.webuiPort;
            const dist = await call(ui, 'GET', '/api/v2/distribution');
            expect(dist.body).toMatchObject({ mode: 'legacy', project: null });
            expect(dist.body.functions).toEqual([expect.objectContaining({ id: 'origin-response-le-0', type: 'lambda-edge', file: null, build: { status: 'ok' } })]);
            expect(dist.body.behaviors[dist.body.behaviors.length - 1]).toMatchObject({ key: 'default', functions: { 'origin-response': 'origin-response-le-0' } });
            expect((await call(ui, 'GET', '/api/v2')).body.legacy).toBe(true);
            expect((await call(ui, 'GET', '/api/v2/project')).body.error.code).toBe('no-project');
        } finally {
            await server.closeGracefully();
            fs.rmSync(tmp, { recursive: true, force: true });
            jest.restoreAllMocks();
        }
    });
});
