export {};
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../src/server/createServer');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');
const { call } = require('./helpers/apiClient');

// WebUI API v2: folder browsing, recent projects, new projects and test requests.

// Answers with the request headers it saw, so tests can check what reached the function
const ECHO = `exports.handler = async (event) => {
    const req = event.Records[0].cf.request;
    return { status: '200', headers: { 'content-type': [{ key: 'Content-Type', value: 'application/json' }] },
             body: JSON.stringify({ uri: req.uri, method: req.method, headers: Object.keys(req.headers), custom: req.headers['x-test'] ? req.headers['x-test'][0].value : null }) };
};`;

describe('WebUI API v2: workspace', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-home-'));
    const previousHome = process.env.CLOUDFRONTIZE_HOME;
    let parent: string;
    let dir: string;
    let other: string;
    let server: any;
    let ui: number;
    const api = (method: string, p: string, body?: any) => call(ui, method, `/api/v2${p}`, body !== undefined ? { body } : {});
    const real = (p: string) => fs.realpathSync(p);

    beforeAll(async () => {
        process.env.CLOUDFRONTIZE_HOME = home;
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        // Projects live side by side in one folder, so the open project's folder is a browse root
        parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-workspace-'));
        dir = path.join(parent, 'site');
        other = path.join(parent, 'other');
        for (const [target, name] of [[dir, 'site'], [other, 'other']]) {
            const made = makeProject(baseManifest({
                name,
                functions: { echo: { type: 'lambda-edge', file: 'functions/echo.js' } },
                behaviors: [{ pathPattern: '/echo/*', origin: 'web', functions: { 'viewer-request': 'echo' } }]
            }), { ...WWW, 'origins/www/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]), 'functions/echo.js': ECHO });
            fs.renameSync(made, target);
        }
        fs.mkdirSync(path.join(parent, '.hidden'));
        fs.mkdirSync(path.join(parent, 'plain-folder'));
        fs.writeFileSync(path.join(parent, 'notes.txt'), 'not a folder');
        fs.symlinkSync('/etc', path.join(parent, 'escape'));
        server = await createServer({ project: dir, port: 0, webui: true, noBanner: true, recentProjects: true });
        ui = server.webuiPort;
    });

    afterAll(async () => {
        await server.closeGracefully();
        removeProject(parent);
        removeProject(home);
        process.env.CLOUDFRONTIZE_HOME = previousHome;
        jest.restoreAllMocks();
    });

    describe('folder browsing', () => {
        test('roots are the home folder, the start folder and the open project\'s folder', async () => {
            const res = await api('GET', '/fs/roots');
            expect(res.status).toBe(200);
            const roots: string[] = res.body.roots;
            expect(roots).toContain(real(parent));
            // The start folder is covered (here it's inside the home folder, so the two merge)
            expect(roots.some(r => real(process.cwd()) === r || real(process.cwd()).startsWith(r + path.sep))).toBe(true);
            expect(roots).not.toContain('/');
        });

        test('lists folders only, marks projects, hides dot folders unless asked', async () => {
            const res = await api('GET', `/fs/list?path=${encodeURIComponent(parent)}`);
            expect(res.status).toBe(200);
            expect(res.body.path).toBe(real(parent));
            expect(res.body.parent).toBeNull(); // it's a root
            const names = res.body.entries.map((e: any) => e.name);
            expect(names).toEqual(['escape', 'other', 'plain-folder', 'site']);
            expect(res.body.entries.find((e: any) => e.name === 'site')).toMatchObject({ isProject: true, path: path.join(real(parent), 'site') });
            expect(res.body.entries.find((e: any) => e.name === 'plain-folder').isProject).toBe(false);

            const hidden = await api('GET', `/fs/list?path=${encodeURIComponent(parent)}&hidden=true`);
            expect(hidden.body.entries.map((e: any) => e.name)).toContain('.hidden');

            const inner = await api('GET', `/fs/list?path=${encodeURIComponent(dir)}`);
            expect(inner.body).toMatchObject({ isProject: true, parent: real(parent) });
        });

        test('folders outside the roots are refused, including through a symlink', async () => {
            const outside = await api('GET', '/fs/list?path=%2Fetc');
            expect(outside.status).toBe(403);
            expect(outside.body.error.code).toBe('outside-roots');
            expect((await api('GET', `/fs/list?path=${encodeURIComponent(path.join(parent, 'escape'))}`)).status).toBe(403);
            expect((await api('GET', '/fs/list?path=relative')).status).toBe(400);
            expect((await api('GET', `/fs/list?path=${encodeURIComponent(path.join(parent, 'missing'))}`)).status).toBe(404);
        });
    });

    describe('test requests', () => {
        test('POST /invoke sends a request through the distribution and returns the response and its journey', async () => {
            const res = await api('POST', '/invoke', { method: 'GET', path: '/echo/page?x=1', headers: { 'X-Test': 'hello' } });
            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ status: 200, bodyEncoding: 'text' });
            const seen = JSON.parse(res.body.body);
            expect(seen).toMatchObject({ uri: '/echo/page', method: 'GET', custom: 'hello' });
            // The id header is removed before any function sees the request
            expect(seen.headers).not.toContain('x-cloudfrontize-invoke');

            const types = res.body.journey.map((e: any) => e.type);
            expect(types[0]).toBe('request.started');
            expect(types).toContain('request.completed');
            expect(res.body.journey.every((e: any) => e.requestId === res.body.requestId)).toBe(true);
            const stages = res.body.journey.filter((e: any) => e.type === 'request.stage').map((e: any) => e.data.stage);
            expect(stages).toEqual([
                { kind: 'function', event: 'viewer-request', runtime: 'lambda-edge', functionIds: ['echo'] },
                { kind: 'short-circuit', event: 'viewer-request', runtime: 'lambda-edge', functionIds: ['echo'] }
            ]);

            // It is recorded like any other request
            expect((await api('GET', `/requests/${res.body.requestId}`)).status).toBe(200);
        });

        test('binary bodies come back base64; request bodies are sent', async () => {
            const png = await api('POST', '/invoke', { path: '/logo.png' });
            expect(png.body).toMatchObject({ status: 200, bodyEncoding: 'base64', bodySize: 8 });
            expect(Buffer.from(png.body.body, 'base64')).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));

            const post = await api('POST', '/invoke', { method: 'POST', path: '/echo/form', body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
            expect(JSON.parse(post.body.body).method).toBe('POST');
        });

        test('bad requests are refused', async () => {
            expect((await api('POST', '/invoke', { path: 'no-slash' })).status).toBe(400);
            expect((await api('POST', '/invoke', { path: '/', method: 'BREW' })).status).toBe(400);
            expect((await api('POST', '/invoke', { path: '/', headers: { a: 1 } })).status).toBe(400);
        });

        test('an invalid id header from a normal client is ignored and still removed', async () => {
            const res = await call(server.address().port, 'GET', '/echo/x', { headers: { 'x-cloudfrontize-invoke': 'not-an-id' } });
            expect(JSON.parse(res.text).headers).not.toContain('x-cloudfrontize-invoke');
        });
    });

    describe('recent projects', () => {
        test('the open project is remembered; opening another moves it to the top', async () => {
            let items = (await api('GET', '/projects/recent')).body.items;
            expect(items[0]).toMatchObject({ dir, name: 'site', exists: true });

            await api('POST', '/projects/open', { path: other });
            items = (await api('GET', '/projects/recent')).body.items;
            expect(items.map((p: any) => p.dir)).toEqual([other, dir]);
            expect(fs.existsSync(path.join(home, 'recent.json'))).toBe(true);
        });

        test('a moved project is marked; DELETE forgets it', async () => {
            const moved = path.join(parent, 'other-moved');
            fs.renameSync(other, moved);
            try {
                expect((await api('GET', '/projects/recent')).body.items.find((p: any) => p.dir === other).exists).toBe(false);
            } finally {
                fs.renameSync(moved, other);
            }
            expect((await api('DELETE', `/projects/recent?dir=${encodeURIComponent(other)}`)).status).toBe(204);
            expect((await api('GET', '/projects/recent')).body.items.map((p: any) => p.dir)).toEqual([dir]);
            expect((await api('DELETE', `/projects/recent?dir=${encodeURIComponent(other)}`)).status).toBe(404);
        });
    });

    describe('new projects', () => {
        test('POST /projects creates a valid project with a starter page and opens it', async () => {
            const target = path.join(parent, 'brand-new');
            const res = await api('POST', '/projects', { dir: target, name: 'Brand new' });
            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ dir: target, opened: true });

            const manifest = JSON.parse(fs.readFileSync(path.join(target, 'cloudfrontize.json'), 'utf8'));
            expect(manifest).toMatchObject({ version: 1, name: 'Brand new', origins: [{ id: 'website', type: 'local', path: 'origins/www' }], defaultBehavior: { origin: 'website', functions: {} } });
            expect(manifest.$schema).toMatch(/cloudfrontize\.schema\.json$/);
            expect(fs.readFileSync(path.join(target, '.gitignore'), 'utf8')).toContain('config/.env');

            expect((await api('GET', '/project')).body).toMatchObject({ name: 'Brand new', dir: target });
            const page = await call(server.address().port, 'GET', '/index.html');
            expect(page.status).toBe(200);
            expect(page.text).toContain('It works');
            expect((await api('GET', '/projects/recent')).body.items[0].dir).toBe(target);
        });

        test('a folder with content, a parent outside the roots, or an invalid origin is refused', async () => {
            const existing = await api('POST', '/projects', { dir: path.join(parent, 'plain-folder-with-file'), name: 'x', open: false });
            expect(existing.status).toBe(201); // an empty or missing folder is fine...
            const again = await api('POST', '/projects', { dir: path.join(parent, 'plain-folder-with-file'), name: 'x' });
            expect(again.status).toBe(409); // ...a project already there isn't
            expect(again.body.error.message).toMatch(/already a project/);

            fs.writeFileSync(path.join(parent, 'plain-folder', 'file.txt'), 'x');
            expect((await api('POST', '/projects', { dir: path.join(parent, 'plain-folder'), name: 'x' })).status).toBe(409);

            expect((await api('POST', '/projects', { dir: '/etc/cfz-test', name: 'x' })).status).toBe(403);
            expect((await api('POST', '/projects', { dir: 'relative', name: 'x' })).status).toBe(400);

            const bad = await api('POST', '/projects', { dir: path.join(parent, 'bad-origin'), name: 'x', origin: { id: 'files', type: 's3' } });
            expect(bad.status).toBe(422);
            expect(fs.existsSync(path.join(parent, 'bad-origin'))).toBe(false);
        });
    });
});
