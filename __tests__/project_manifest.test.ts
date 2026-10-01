export {};
const { loadProject } = require('../src/project/loadProject');
const { ManifestError } = require('../src/project/errors');
const { fromProject } = require('../src/runtime/spec');
const { makeProject, removeProject, baseManifest, WWW } = require('./helpers/projectFixture');

const CFF = 'function handler(event) { return event.request; }';
const LAE = 'exports.handler = async (e) => e.Records[0].cf.request;';

// Loads a project and returns its diagnostics, whether or not it failed
const diagnose = (manifest: any, files: Record<string, string> = WWW) => {
    const dir = makeProject(manifest, files);
    try {
        return loadProject(dir).diagnostics;
    } catch (err: any) {
        if (err instanceof ManifestError) return err.diagnostics;
        throw err;
    } finally {
        removeProject(dir);
    }
};
const find = (diagnostics: any[], rule: string) => diagnostics.find((d: any) => d.rule === rule);

describe('Project manifest', () => {
    test('a valid project loads with resolved paths and defaults', () => {
        const dir = makeProject(baseManifest({
            functions: { rewrite: { type: 'cloudfront-function', runtime: 'cloudfront-js-1.0', file: 'functions/rewrite.js' } },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'rewrite' } }
        }), { ...WWW, 'functions/rewrite.js': CFF });
        try {
            const { project, diagnostics } = loadProject(dir);
            expect(diagnostics).toEqual([]);
            expect(project.manifest.distribution).toMatchObject({ port: 3000, strict: false, compression: true, etag: true });
            expect(project.origins[0].absolutePath).toBe(require('path').join(dir, 'origins/www'));
            expect(project.functions.rewrite.absoluteFile).toBe(require('path').join(dir, 'functions/rewrite.js'));
        } finally {
            removeProject(dir);
        }
    });

    test('a missing manifest and invalid JSON are reported, not thrown raw', () => {
        expect(() => loadProject('/definitely/not/a/project')).toThrow(ManifestError);
        const dir = makeProject({});
        require('fs').writeFileSync(require('path').join(dir, 'cloudfrontize.json'), '{ nope');
        try {
            expect(() => loadProject(dir)).toThrow(/Not valid JSON/);
        } finally {
            removeProject(dir);
        }
    });

    test('unknown keys are rejected (typos don\'t silently do nothing)', () => {
        const d = diagnose(baseManifest({ distribution: { strcit: true } }));
        expect(d[0]).toMatchObject({ severity: 'error', rule: 'schema', path: '/distribution' });
    });

    test('literal S3 access keys are rejected with a helpful message', () => {
        const d = diagnose(baseManifest({
            origins: [{ id: 'web', type: 'local', path: 'origins/www' },
                      { id: 's3', type: 's3', bucket: 'my-bucket', credentials: { accessKeyId: 'AKIA', secretAccessKey: 'x' } }]
        }));
        expect(d[0].path).toBe('/origins/1/credentials');
        expect(d[0].message).toContain('profile');
    });

    test('CloudFront Functions can only be attached to viewer events', () => {
        const d = diagnose(baseManifest({
            functions: { f: { type: 'cloudfront-function', runtime: 'cloudfront-js-1.0', file: 'f.js' } },
            defaultBehavior: { origin: 'web', functions: { 'origin-request': 'f' } }
        }), { ...WWW, 'f.js': CFF });
        expect(find(d, 'cff-viewer-events-only')).toMatchObject({ path: '/defaultBehavior/functions/origin-request' });
    });

    test('CloudFront Functions and Lambda@Edge can\'t be mixed on viewer events of one behavior', () => {
        const d = diagnose(baseManifest({
            functions: {
                c: { type: 'cloudfront-function', runtime: 'cloudfront-js-1.0', file: 'c.js' },
                l: { type: 'lambda-edge', file: 'l.js' }
            },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'c', 'viewer-response': 'l' } }
        }), { ...WWW, 'c.js': CFF, 'l.js': LAE });
        expect(find(d, 'no-mixed-viewer-functions')).toMatchObject({ severity: 'error', path: '/defaultBehavior/functions' });
    });

    test('CloudFront Functions on viewer events + Lambda@Edge on origin events is allowed', () => {
        const d = diagnose(baseManifest({
            functions: {
                c: { type: 'cloudfront-function', runtime: 'cloudfront-js-1.0', file: 'c.js' },
                l: { type: 'lambda-edge', file: 'l.js' }
            },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'c', 'origin-request': 'l' } }
        }), { ...WWW, 'c.js': CFF, 'l.js': LAE });
        expect(d.filter((x: any) => x.severity === 'error')).toEqual([]);
    });

    test('references, duplicates and paths are checked', () => {
        const d = diagnose(baseManifest({
            origins: [{ id: 'web', type: 'local', path: 'origins/www' }, { id: 'web', type: 'local', path: '../outside' }],
            functions: { ghost: { type: 'lambda-edge', file: 'missing.js' } },
            defaultBehavior: { origin: 'nowhere', functions: { 'viewer-request': 'unknown' } },
            behaviors: [
                { pathPattern: '/api/*', origin: 'web' },
                { pathPattern: '/api/*', origin: 'web' },
                { pathPattern: '*', origin: 'web' }
            ]
        }));
        expect(find(d, 'duplicate-origin')).toMatchObject({ path: '/origins/1/id' });
        expect(find(d, 'path-outside-project')).toMatchObject({ path: '/origins/1/path' });
        expect(find(d, 'path-missing')).toMatchObject({ path: '/functions/ghost/file' });
        expect(find(d, 'unknown-origin')).toMatchObject({ path: '/defaultBehavior/origin' });
        expect(find(d, 'unknown-function')).toMatchObject({ path: '/defaultBehavior/functions/viewer-request' });
        expect(find(d, 'duplicate-path-pattern')).toMatchObject({ path: '/behaviors/1/pathPattern' });
        expect(find(d, 'default-pattern')).toMatchObject({ path: '/behaviors/2/pathPattern' });
        expect(find(d, 'unused-function')).toMatchObject({ severity: 'info' });
    });

    test('the 10 KB CloudFront Function limit is an error only under strict', () => {
        const big = `// ${'x'.repeat(11 * 1024)}\n${CFF}`;
        const manifest = (strict: boolean) => baseManifest({
            distribution: { strict },
            functions: { big: { type: 'cloudfront-function', runtime: 'cloudfront-js-1.0', file: 'big.js' } },
            defaultBehavior: { origin: 'web', functions: { 'viewer-request': 'big' } }
        });
        expect(find(diagnose(manifest(false), { ...WWW, 'big.js': big }), 'cff-size').severity).toBe('warning');
        expect(find(diagnose(manifest(true), { ...WWW, 'big.js': big }), 'cff-size').severity).toBe('error');
    });

    test('functions on specific behaviors are accepted by the runtime', () => {
        const dir = makeProject(baseManifest({
            functions: { auth: { type: 'lambda-edge', file: 'auth.js' } },
            behaviors: [{ pathPattern: '/api/*', origin: 'web', functions: { 'origin-request': 'auth' } }]
        }), { ...WWW, 'auth.js': LAE });
        try {
            const { project } = loadProject(dir);
            const spec = fromProject(project);
            expect(spec.origins.behaviors[0]).toMatchObject({ pathPattern: '/api/*', functions: { 'origin-request': ['auth'] } });
            expect(spec.origins.behaviors[1]).toMatchObject({ key: 'default', pathPattern: '*' });
            spec.edgeRunner?.close();
        } finally {
            removeProject(dir);
        }
    });
});
