export {};
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { applySettings, parseSetting } = require('../src/project/settings');
const { loadProject } = require('../src/project/loadProject');
const { buildProject } = require('../src/project/build');
const { createServer } = require('../src/server/createServer');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

// --set path=value: one run's manifest settings, never written to the file

const get = (port: number, p: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers }, (res: any) => {
        let text = '';
        res.on('data', (c: any) => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, text }));
    }).on('error', reject);
});
const send = (port: number, method: string, p: string, body: unknown): Promise<{ status: number; json: any }> => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json' } }, (res: any) => {
        let text = '';
        res.on('data', (c: any) => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }));
    });
    r.on('error', reject);
    r.end(JSON.stringify(body));
});

describe('--set: parsing and applying', () => {
    test('values are JSON when they parse as JSON, strings otherwise', () => {
        expect(parseSetting('distribution.strict=true')).toMatchObject({ path: ['distribution', 'strict'], value: true });
        expect(parseSetting('distribution.port=3005').value).toBe(3005);
        expect(parseSetting('origins.s3.credentials={"profile":"dev"}').value).toEqual({ profile: 'dev' });
        expect(parseSetting('origins.s3.bucket=staging-assets').value).toBe('staging-assets');
        expect(parseSetting('name=a=b').value).toBe('a=b');
    });

    test('malformed expressions are rejected with an example', () => {
        expect(() => parseSetting('distribution.strict')).toThrow(/expected path=value/);
        expect(() => parseSetting('=true')).toThrow(/expected path=value/);
        expect(() => parseSetting('distribution..strict=true')).toThrow(/empty segment/);
        expect(() => parseSetting('__proto__.polluted=1')).toThrow(/isn't a manifest setting/);
    });

    test('origins are addressed by id or index, behaviors by index; missing objects are created', () => {
        const input = { origins: [{ id: 'web', type: 'local' }, { id: 'assets', type: 's3', bucket: 'prod' }], behaviors: [{ pathPattern: '/a/*', origin: 'web' }] };
        const { manifest, diagnostics } = applySettings(input, ['origins.assets.bucket=staging', 'origins.0.mode=website', 'behaviors.0.origin=assets', 'distribution.strict=true'].map(parseSetting));
        expect(diagnostics).toEqual([]);
        expect(manifest).toEqual({
            origins: [{ id: 'web', type: 'local', mode: 'website' }, { id: 'assets', type: 's3', bucket: 'staging' }],
            behaviors: [{ pathPattern: '/a/*', origin: 'assets' }],
            distribution: { strict: true },
        });
        expect(input.origins[1].bucket).toBe('prod'); // the input isn't changed
    });

    test('a path that doesn\'t exist is a diagnostic on that path', () => {
        const { diagnostics } = applySettings({ origins: [{ id: 'web' }], name: 'x' }, ['origins.nope.path=a', 'name.first=b'].map(parseSetting));
        expect(diagnostics).toEqual([
            expect.objectContaining({ path: '/origins/nope/path', rule: 'set', message: expect.stringContaining('origins has no element "nope" (use an index or an id)') }),
            expect.objectContaining({ path: '/name/first', message: expect.stringContaining('name is "x", not an object') }),
        ]);
    });
});

describe('--set: projects', () => {
    jest.setTimeout(30000);
    const dirs: string[] = [];
    afterAll(() => dirs.forEach(removeProject));
    beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterAll(() => jest.restoreAllMocks());
    const project = (overrides: Record<string, any> = {}) => {
        const dir = makeProject(baseManifest(overrides), WWW);
        dirs.push(dir);
        return dir;
    };

    test('loadProject runs the settings, validated like the file; `source` stays the file', () => {
        const dir = project();
        const { project: p } = loadProject(dir, { set: [parseSetting('distribution.spa=true')] });
        expect(p.manifest.distribution.spa).toBe(true);
        expect(p.settings).toEqual(['distribution.spa=true']);
        expect((p.source as any).distribution).toBeUndefined();

        // A setting that breaks an AWS rule fails like a bad file
        expect(() => loadProject(dir, { set: [parseSetting('defaultBehavior.origin=missing')] })).toThrow(/No origin with id "missing"/);
        expect(() => loadProject(dir, { set: [parseSetting('distribution.spa="yes"')] })).toThrow();
    });

    test('the server runs them, keeps them across reloads and saves, and never writes them', async () => {
        const dir = project();
        const other = project({ name: 'other' });
        const server = await createServer({ project: dir, port: 0, webui: 0, noBanner: true, requestLogging: false, set: ['distribution.spa=true'] });
        try {
            const port = server.address().port;
            const ui = server.webuiPort;
            // spa: a missing path gets index.html
            expect(await get(port, '/missing')).toEqual({ status: 200, text: 'origin-index' });

            const info = JSON.parse((await get(ui, '/api/v2/project')).text);
            expect(info.settings).toEqual(['distribution.spa=true']);
            expect(info.manifest.distribution).toBeUndefined();

            // A save from the workbench writes the file's manifest; the setting still runs
            const saved = await send(ui, 'PUT', '/api/v2/project/manifest', { manifest: { ...info.manifest, name: 'renamed' }, revision: info.revision });
            expect(saved.status).toBe(200);
            const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'cloudfrontize.json'), 'utf8'));
            expect(onDisk.name).toBe('renamed');
            expect(onDisk.distribution).toBeUndefined();
            expect((await get(port, '/missing')).status).toBe(200);

            await server.reload();
            expect((await get(port, '/missing')).status).toBe(200);

            // Another project doesn't get them (they name paths in this project's manifest)
            await server.openProject(other);
            expect(JSON.parse((await get(ui, '/api/v2/project')).text).settings).toEqual([]);
            expect((await get(port, '/missing')).status).toBe(404);
        } finally {
            await server.closeGracefully();
        }
    });

    test('build records them in build.json', async () => {
        const dir = project({
            functions: { greet: { type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', file: 'functions/greet.js' } },
        });
        fs.mkdirSync(path.join(dir, 'functions'));
        fs.writeFileSync(path.join(dir, 'functions/greet.js'), 'async function handler(event) { return event.request; }\n');
        const report = await buildProject(dir, { set: ['defaultBehavior.functions={"viewer-request":"greet"}'] });
        expect(report.settings).toEqual(['defaultBehavior.functions={"viewer-request":"greet"}']);
        const built = JSON.parse(fs.readFileSync(path.join(dir, 'dist/build.json'), 'utf8'));
        expect(built.settings).toEqual(report.settings);
        expect(built.functions[0].associations).toEqual([{ behavior: 'default', event: 'viewer-request' }]);
    });
});

describe('--set: CLI', () => {
    jest.setTimeout(45000);
    const cliPath = path.resolve(__dirname, '../bin/cli.ts');
    const tsxPath = path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs');
    const run = (args: string): Promise<{ code: number; stdout: string; stderr: string }> =>
        new Promise(resolve => exec(`node ${tsxPath} ${cliPath} ${args}`, (error: any, stdout: string, stderr: string) =>
            resolve({ code: error ? error.code : 0, stdout, stderr })));
    const dirs: string[] = [];
    afterAll(() => dirs.forEach(removeProject));

    test('validate checks the project with the settings, and says which', async () => {
        const dir = makeProject(baseManifest({ name: 'cli-set' }), WWW);
        dirs.push(dir);
        const ok = await run(`validate ${dir} --set distribution.strict=true --set distribution.spa=true`);
        expect(ok.code).toBe(0);
        expect(ok.stdout).toContain('cli-set is valid with distribution.strict=true, distribution.spa=true');

        const bad = await run(`validate ${dir} --set origins.nope.path=x`);
        expect(bad.code).toBe(1);
        expect(bad.stderr).toContain('--set origins.nope.path=x: origins has no element "nope"');

        const malformed = await run(`validate ${dir} --set strict`);
        expect(malformed.code).toBe(1);
        expect(malformed.stderr).toContain('expected path=value');
    });

    test('a 2.x command line rejects it', async () => {
        const dir = makeProject(baseManifest(), WWW);
        dirs.push(dir);
        const { code, stderr } = await run(`${path.join(dir, 'origins/www')} --set distribution.strict=true`);
        expect(code).toBe(1);
        expect(stderr).toContain('--set changes cloudfrontize.json settings, so it needs a project');
    });
});
