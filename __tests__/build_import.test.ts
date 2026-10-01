export {};
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildProject, externalRequires } = require('../src/project/build');
const { importLegacySetup } = require('../src/project/importLegacy');
const { createProject } = require('../src/project/create');
const { loadProject } = require('../src/project/loadProject');
const { runChecks } = require('../src/project/runChecks');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

// cloudfrontize build (deployable code) and cloudfrontize import (2.x setups → projects)

describe('build', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-build-'));
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
    beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'error').mockImplementation(() => {}); });
    afterAll(() => jest.restoreAllMocks());

    test('writes each function where AWS expects it, with build.json describing the deployment', async () => {
        const dir = path.join(root, 'redirects');
        createProject({ dir, name: 'Redirects', template: 'redirects' });
        const report = await buildProject(dir, { level: 'minified' });
        expect(report.ok).toBe(true);
        const out = path.join(dir, 'dist');
        const code = fs.readFileSync(path.join(out, 'cloudfront/redirects.js'), 'utf8');
        expect(code).toContain('async function handler(event)');
        expect(code).not.toContain('// Redirects from a key value store'); // minified: no comments
        expect(fs.existsSync(path.join(out, 'kvs/redirects.json'))).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(path.join(out, 'build.json'), 'utf8'));
        expect(manifest.functions).toEqual([expect.objectContaining({
            id: 'redirects', type: 'cloudfront-function', runtime: 'cloudfront-js-2.0', output: 'cloudfront/redirects.js',
            keyValueStore: 'redirects', associations: [{ behavior: 'default', event: 'viewer-request' }],
        })]);
        expect(manifest.keyValueStores).toEqual([{ id: 'redirects', output: 'kvs/redirects.json', keyCount: 3 }]);
    });

    test('bakes __VAR__ values, strips 2.x metadata, and flags placeholders without a value', async () => {
        const dir = makeProject(baseManifest({
            bake: { file: 'bake.env' },
            functions: { greet: { type: 'lambda-edge', file: 'functions/greet.js' } },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'greet' } },
        }), {
            ...WWW,
            'bake.env': 'API_URL=https://api.example.com\n',
            'functions/greet.js': "exports.hookType = 'viewer-request';\nconst api = '__API_URL__';\nconst key = '__MISSING_KEY__';\nexports.handler = async (e) => e.Records[0].cf.request;\n",
        });
        try {
            const report = await buildProject(dir);
            const code = fs.readFileSync(path.join(dir, 'dist/lambda-edge/greet/index.js'), 'utf8');
            expect(code).toContain("'https://api.example.com'");
            expect(code).not.toContain('hookType');
            expect(report.functions[0].warnings).toEqual([expect.objectContaining({ message: expect.stringContaining("__MISSING_KEY__ isn't defined in the bake file"), line: 2 })]);
        } finally {
            removeProject(dir);
        }
    });

    test('a CloudFront Function over 10 KB as built fails the build; minifying can bring it under', async () => {
        const padding = `// ${'x'.repeat(11000)}\n`;
        const dir = makeProject(baseManifest({
            functions: { big: { type: 'cloudfront-function', file: 'functions/big.js' } },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'big' } },
        }), { ...WWW, 'functions/big.js': `${padding}async function handler(event) { return event.request; }\n` });
        try {
            const baked = await buildProject(dir, { level: 'baked' });
            expect(baked.ok).toBe(false);
            expect(baked.functions[0].errors[0].message).toMatch(/exceeds the 10240-byte/);
            const minified = await buildProject(dir, { level: 'minified' });
            expect(minified.ok).toBe(true);
            expect(minified.functions[0].size).toBeLessThan(200);
        } finally {
            removeProject(dir);
        }
    });

    test('Lambda@Edge dependencies that must be bundled are reported', () => {
        expect(externalRequires(`
            const fs = require('fs'); const p = require('node:path');
            const { S3Client } = require('@aws-sdk/client-s3');
            const jwt = require('jsonwebtoken'); const util = require('./util');
        `)).toEqual(['./util', 'jsonwebtoken']);
    });

    test('refuses to write into the project folder itself', async () => {
        const dir = path.join(root, 'empty');
        createProject({ dir, name: 'x' });
        await expect(buildProject(dir, { outDir: dir })).rejects.toThrow(/can't be the project folder/);
        await expect(buildProject(dir, { outDir: root })).rejects.toThrow(/can't be the project folder or contain it/);
    });
});

describe('import (2.x setups)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cfz-import-'));
    const legacy = path.join(root, 'legacy');
    afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        // A typical 2.x setup: a served folder, a hooks folder with a helper module, CloudFront Functions, headers
        const files: Record<string, string> = {
            'www/index.html': '<h1>legacy site</h1>',
            'www/admin/index.html': 'admin',
            'edge/addSecurityHeaders.js': "exports.hookType = 'viewer-response';\nconst { stamp } = require('./lib/stamp');\nexports.handler = async (e) => { const r = e.Records[0].cf.response; r.headers['x-stamp'] = [{ key: 'X-Stamp', value: stamp() }]; return r; };\n",
            'edge/lib/stamp.js': "exports.stamp = () => 'legacy';\n",
            'edge/origin-response-cache.js': "exports.handler = async (e) => { const r = e.Records[0].cf.response; r.headers['cache-control'] = [{ key: 'Cache-Control', value: 'max-age=60' }]; return r; };\n",
            'edge/mystery.js': "exports.handler = async (e) => e.Records[0].cf.response;\n",
            'cff/viewer-request-index.js': "function handler(event) { var r = event.request; if (r.uri.endsWith('/')) r.uri += 'index.html'; return r; }\n",
            'headers.json': JSON.stringify({ 'X-Simulated': 'yes' }),
            'origins.json': JSON.stringify({
                origins: [
                    { id: 'site', type: 'local', directory: path.join(root, 'legacy', 'www') },
                    { id: 'media', type: 's3', bucket: 'media-bucket', endpoint: 'http://localhost:9000', credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' } },
                ],
                behaviors: [{ pathPattern: '/media/*', targetOriginId: 'media' }, { pathPattern: '*', targetOriginId: 'site' }],
            }),
        };
        for (const [rel, content] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(legacy, rel)), { recursive: true });
            fs.writeFileSync(path.join(legacy, rel), content);
        }
    });
    afterAll(() => jest.restoreAllMocks());

    test('a served folder with Lambda@Edge hooks becomes a project that behaves like 2.x did', async () => {
        const out = path.join(root, 'site-project');
        const { notes } = importLegacySetup({ directory: path.join(legacy, 'www'), edge: path.join(legacy, 'edge'), headers: path.join(legacy, 'headers.json') }, out, 'Legacy site');
        const { project } = loadProject(out);
        expect(project.manifest.name).toBe('Legacy site');
        expect(project.manifest.origins).toEqual([{ id: 'website', type: 'local', path: 'origins/www', mode: 'rest' }]);
        expect(Object.keys(project.functions).sort()).toEqual(['add-security-headers', 'cache', 'mystery']);
        expect(project.functions['add-security-headers'].file).toBe('functions/lambda-edge/viewer-response.add-security-headers.js');
        // The first file per event is attached, as 2.x used it ("mystery" is also assumed viewer-response, like 2.x)
        expect(project.manifest.defaultBehavior.functions).toEqual({ 'viewer-response': 'add-security-headers', 'origin-response': 'cache' });
        expect(notes.join('\n')).toMatch(/mystery\.js says neither its event.*viewer-response/);
        expect(notes.join('\n')).toMatch(/"mystery" isn't attached: viewer-response already runs "add-security-headers"/);
        expect(fs.existsSync(path.join(out, 'functions/lambda-edge/lib/stamp.js'))).toBe(true);
        expect(project.manifest.viewer.headers).toBe('config/headers.json');

        // It serves the same responses (the helper module still resolves)
        const results = await runChecks(out, { checks: [
            { name: 'page', request: { method: 'GET', path: '/index.html', headers: {} }, expect: { status: 200, bodyContains: 'legacy site', headers: { 'x-stamp': 'legacy', 'cache-control': 'max-age=60' } } },
        ] });
        expect(results.filter((r: any) => !r.passed)).toEqual([]);
    });

    test('an origins file: origins and behaviors carry over, keys never do, functions run on every behavior', () => {
        const out = path.join(root, 'origins-project');
        const { notes } = importLegacySetup({ origins: path.join(legacy, 'origins.json'), cff: path.join(legacy, 'cff'), edge: path.join(legacy, 'edge') }, out);
        const manifest = JSON.parse(fs.readFileSync(path.join(out, 'cloudfrontize.json'), 'utf8'));
        expect(manifest.origins).toEqual([
            { id: 'site', type: 'local', path: 'origins/site' },
            { id: 'media', type: 's3', bucket: 'media-bucket', endpoint: 'http://localhost:9000', forcePathStyle: true, credentials: { fromEnv: true } },
        ]);
        expect(JSON.stringify(manifest)).not.toContain('AKIAEXAMPLE');
        expect(notes.join('\n')).toMatch(/access keys .* weren't copied/);
        expect(manifest.defaultBehavior.origin).toBe('site');
        // The CloudFront Function took the viewer events: Lambda@Edge viewer functions can't share them (AWS)
        expect(manifest.defaultBehavior.functions).toEqual({ 'viewer-request': 'index', 'origin-response': 'cache' });
        expect(manifest.behaviors).toEqual([{ pathPattern: '/media/*', origin: 'media', functions: { 'viewer-request': 'index', 'origin-response': 'cache' } }]);
        expect(manifest.functions.index).toEqual({ type: 'cloudfront-function', runtime: 'cloudfront-js-1.0', file: 'functions/cloudfront/viewer-request.index.js' });
        expect(notes.join('\n')).toMatch(/"add-security-headers" isn't attached: AWS doesn't allow CloudFront Functions and Lambda@Edge on the viewer events/);
        expect(() => loadProject(out)).not.toThrow();
    });

    test('refuses a folder with content and leaves nothing behind on errors', () => {
        expect(() => importLegacySetup({ directory: path.join(legacy, 'www') }, legacy)).toThrow(/isn't empty/);
        const out = path.join(root, 'broken');
        expect(() => importLegacySetup({ edge: path.join(legacy, 'edge') }, out)).toThrow(/Nothing to serve/);
        expect(fs.existsSync(out)).toBe(false);
    });
});
