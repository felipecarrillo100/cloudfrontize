export {};
const fs = require('fs');
const path = require('path');
const { createServer } = require('../src/server/createServer');
const { revisionOf } = require('../src/project/revision');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');
const { call, stream, get } = require('./helpers/apiClient');

// WebUI API v2: the open project and its manifest, with conflict detection and external edits.

// Reports what the origin-request function saw, so tests can tell which manifest is running
const PROBE = `exports.handler = async (event) => {
    const req = event.Records[0].cf.request;
    const sim = req.headers['x-sim'] ? req.headers['x-sim'][0].value : '-';
    return { status: '200', headers: { 'x-probe': [{ key: 'X-Probe', value: 'probe' }], 'x-sim': [{ key: 'X-Sim', value: sim }] }, body: 'probe' };
};`;

const manifestOf = (name: string, extra: Record<string, any> = {}) => baseManifest({
    name,
    viewer: { headers: 'viewer.json' },
    functions: { probe: { type: 'lambda-edge', file: 'functions/probe.js' } },
    ...extra
});

const files = { ...WWW, 'functions/probe.js': PROBE, 'viewer.json': JSON.stringify({ 'X-Sim': 'one' }) };

// Waits until fn() is truthy (file watchers report asynchronously)
async function eventually<T>(fn: () => Promise<T> | T, ms = 5000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
        const value = await fn();
        if (value) return value;
        if (Date.now() > end) throw new Error('condition not met in time');
        await new Promise(r => setTimeout(r, 50));
    }
}

describe('WebUI API v2: project and manifest', () => {
    let dir: string;
    let other: string;
    let server: any;
    let ui: number;
    let main: number;
    let events: any;
    const manifestPath = () => path.join(dir, 'cloudfrontize.json');
    const readManifest = () => JSON.parse(fs.readFileSync(manifestPath(), 'utf8'));
    const project = async () => (await call(ui, 'GET', '/api/v2/project')).body;

    beforeAll(async () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        dir = makeProject(manifestOf('first'), files);
        other = makeProject(manifestOf('second'), files);
        server = await createServer({ project: dir, port: 0, webui: true, noBanner: true });
        ui = server.webuiPort;
        main = server.address().port;
        events = stream(ui);
        await events.opened;
    });

    afterAll(async () => {
        events.close();
        await server.closeGracefully();
        removeProject(dir);
        removeProject(other);
        jest.restoreAllMocks();
    });

    test('GET /project returns the manifest as written, its revision (also as ETag) and diagnostics', async () => {
        const res = await call(ui, 'GET', '/api/v2/project');
        expect(res.status).toBe(200);
        const revision = revisionOf(fs.readFileSync(manifestPath()));
        expect(res.body).toMatchObject({ name: 'first', dir, manifestPath: manifestPath(), revision });
        expect(res.body.diagnostics).toEqual([expect.objectContaining({ severity: 'info', rule: 'unused-function', path: '/functions/probe' })]);
        expect(res.headers.etag).toBe(`"${revision}"`);
        // As written: no defaults filled in
        expect(res.body.manifest).toEqual(readManifest());
        expect(res.body.manifest.distribution).toBeUndefined();
    });

    test('a save must name the revision it edited', async () => {
        const res = await call(ui, 'PUT', '/api/v2/project/manifest', { body: { manifest: readManifest() } });
        expect(res.status).toBe(428);
        expect(res.body.error.code).toBe('revision-required');
    });

    test('a save based on an old revision is refused with the current content (409)', async () => {
        const before = fs.readFileSync(manifestPath(), 'utf8');
        const res = await call(ui, 'PUT', '/api/v2/project/manifest', { body: { manifest: { ...readManifest(), name: 'lost update' }, revision: 'stale0000000000' } });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('conflict');
        expect(res.body.error.details).toEqual({ revision: revisionOf(before), manifest: readManifest() });
        expect(fs.readFileSync(manifestPath(), 'utf8')).toBe(before);
    });

    test('an invalid manifest is refused with diagnostics (422) and nothing is written', async () => {
        const { revision, manifest } = await project();
        const before = fs.readFileSync(manifestPath(), 'utf8');
        const bad = { ...manifest, defaultBehavior: { origin: 'web', functions: { 'origin-request': 'nope' } } };
        const res = await call(ui, 'PUT', '/api/v2/project/manifest', { body: { manifest: bad, revision } });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('invalid-manifest');
        expect(res.body.error.details.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ severity: 'error', path: '/defaultBehavior/functions/origin-request' })
        ]));
        expect(fs.readFileSync(manifestPath(), 'utf8')).toBe(before);
    });

    test('POST /project/validate checks a manifest without saving it', async () => {
        const { manifest } = await project();
        const ok = await call(ui, 'POST', '/api/v2/project/validate', { body: { manifest } });
        expect(ok.body.valid).toBe(true);
        expect(ok.body.diagnostics.every((d: any) => d.severity !== 'error')).toBe(true);
        const bad = await call(ui, 'POST', '/api/v2/project/validate', { body: { manifest: { ...manifest, origins: [] } } });
        expect(bad.body.valid).toBe(false);
        expect(bad.body.diagnostics.length).toBeGreaterThan(0);
    });

    test('a valid save is written, applied, and announced once (the watcher ignores our own write)', async () => {
        const { revision, manifest } = await project();
        expect(await get(main, '/index.html')).toBe(200); // no function attached yet

        const from = events.events.length;
        const edited = { ...manifest, defaultBehavior: { origin: 'web', functions: { 'origin-request': 'probe' } } };
        const res = await call(ui, 'PUT', '/api/v2/project/manifest', { body: { manifest: edited, revision } });
        expect(res.status).toBe(200);
        const written = fs.readFileSync(manifestPath(), 'utf8');
        expect(res.body.revision).toBe(revisionOf(written));
        expect(res.headers.etag).toBe(`"${res.body.revision}"`);
        expect(written).toBe(JSON.stringify(edited, null, 2) + '\n');

        // The new manifest is running
        const probe = await call(main, 'GET', '/index.html');
        expect(probe.headers['x-probe']).toBe('probe');

        await new Promise(r => setTimeout(r, 400)); // give the watcher time to (not) fire
        const changes = events.events.slice(from).filter((e: any) => e.type === 'project.changed');
        expect(changes).toHaveLength(1);
        expect(changes[0].data).toMatchObject({ name: 'first', source: 'api', revision: res.body.revision });
    });

    test('If-Match works instead of a revision in the body', async () => {
        const { revision, manifest } = await project();
        const res = await call(ui, 'PUT', '/api/v2/project/manifest', { body: { manifest: { ...manifest, name: 'first' } }, headers: { 'if-match': `"${revision}"` } });
        expect(res.status).toBe(200);
    });

    test('an edit made on disk (another editor, git) reloads the project', async () => {
        const from = events.events.length;
        const edited = { ...readManifest(), name: 'edited on disk' };
        fs.writeFileSync(manifestPath(), JSON.stringify(edited, null, 4));
        const change = await eventually(() => events.events.slice(from).find((e: any) => e.type === 'project.changed' && e.data.source === 'disk'));
        expect(change.data).toMatchObject({ name: 'edited on disk', source: 'disk', revision: revisionOf(fs.readFileSync(manifestPath())) });
        expect((await project()).name).toBe('edited on disk');
    });

    test('an invalid edit on disk keeps the previous version running and reports why', async () => {
        const { revision } = await project();
        const from = events.events.length;
        fs.writeFileSync(manifestPath(), '{ "version": 1, "name": "broken", ');
        const invalid = await eventually(() => events.events.slice(from).find((e: any) => e.type === 'project.invalid'));
        expect(invalid.data.diagnostics[0]).toMatchObject({ severity: 'error', rule: 'invalid-json' });

        // Still serving the last good version
        expect((await project()).revision).toBe(revision);
        expect((await call(main, 'GET', '/index.html')).headers['x-probe']).toBe('probe');

        // A save based on the running revision is refused: the file on disk is newer
        const res = await call(ui, 'PUT', '/api/v2/project/manifest', { body: { manifest: (await project()).manifest, revision } });
        expect(res.status).toBe(409);
        expect(typeof res.body.error.details.manifest).toBe('string'); // not JSON: sent as text

        // Fixing the file recovers
        fs.writeFileSync(manifestPath(), JSON.stringify({ ...(await project()).manifest, name: 'fixed' }, null, 2));
        await eventually(async () => (await project()).name === 'fixed');
    });

    test('editing the viewer headers file applies it without a restart', async () => {
        expect((await call(main, 'GET', '/index.html')).headers['x-sim']).toBe('one');
        const from = events.events.length;
        fs.writeFileSync(path.join(dir, 'viewer.json'), JSON.stringify({ 'X-Sim': 'two' }));
        await eventually(() => events.events.slice(from).find((e: any) => e.type === 'viewer.changed'));
        expect((await call(main, 'GET', '/index.html')).headers['x-sim']).toBe('two');
    });

    test('POST /project/reload reloads from disk', async () => {
        const res = await call(ui, 'POST', '/api/v2/project/reload', { body: {} });
        expect(res.status).toBe(200);
        expect(res.body.revision).toBe(revisionOf(fs.readFileSync(manifestPath())));
    });

    test('POST /projects/open switches projects; bad paths are refused', async () => {
        expect((await call(ui, 'POST', '/api/v2/projects/open', { body: { path: 'relative/dir' } })).status).toBe(400);
        const missing = await call(ui, 'POST', '/api/v2/projects/open', { body: { path: path.join(other, 'nowhere') } });
        expect(missing.status).toBe(422);
        expect(missing.body.error.details.diagnostics[0].rule).toBe('manifest-missing');

        const from = events.events.length;
        const res = await call(ui, 'POST', '/api/v2/projects/open', { body: { path: other } });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ name: 'second', dir: other });
        const opened = await eventually(() => events.events.slice(from).find((e: any) => e.type === 'project.opened'));
        expect(opened.data).toMatchObject({ name: 'second', dir: other });

        // The first project is no longer watched
        fs.writeFileSync(manifestPath(), JSON.stringify({ ...readManifest(), name: 'not watched anymore' }, null, 2));
        await new Promise(r => setTimeout(r, 400));
        expect((await project()).name).toBe('second');
    });
});
